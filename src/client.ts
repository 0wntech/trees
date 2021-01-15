import * as rdf from "rdflib";
import cuid from "cuid";
import * as urlUtils from "url";
import ns from "own-namespace";

export interface Graph {
  [key: string]: any;
}

const namespaceUris = Object.values(ns()).map((namespace) =>
  (namespace as Function)()
);

export class Graphs {
  store: rdf.Store;
  fetcher: rdf.Fetcher;
  updater: rdf.UpdateManager;
  url: string;
  tree: Graph | undefined;
  load: (
    this: Graphs,
    options?: { clearPreviousData?: boolean }
  ) => Promise<Graph>;
  assignValues: (this: Graphs) => Graph;
  patch: (this: Graphs, tree: Graph) => Promise<Graph>;

  constructor(url: string) {
    this.store = rdf.graph();
    this.fetcher = new rdf.Fetcher(this.store);
    this.updater = new rdf.UpdateManager(this.store);

    this.url = url;

    this.load = fetchAndAssign;
    this.assignValues = assignValues;
    this.patch = patch;
  }
}

function getPreviousStatement(
  newStatements: rdf.Statement[],
  baseUrl: string,
  store: rdf.Store
) {
  return newStatements.reduce((allPrevStatements, newStatement) => {
    return [
      ...allPrevStatements,
      ...store.statementsMatching(
        newStatement.subject,
        newStatement.predicate,
        null,
        rdf.sym(baseUrl).doc()
      ),
      ...store
        .statementsMatching(
          newStatement.subject,
          newStatement.predicate,
          null,
          rdf.sym(baseUrl).doc()
        )
        .reduce(
          (allPotentialBlankNodeStatements, potentialBlankNodeStatement) => [
            ...allPotentialBlankNodeStatements,
            ...(potentialBlankNodeStatement.object.termType === "BlankNode"
              ? [
                  ...store.statementsMatching(
                    potentialBlankNodeStatement.object,
                    null,
                    null,
                    rdf.sym(baseUrl).doc()
                  ),
                ]
              : []),
          ],
          [] as rdf.Statement[]
        ),
    ];
  }, [] as rdf.Statement[]);
}

function patch(this: Graphs, tree: Graph) {
  const [flattenedGraph, newBlankNodes] = flattenGraph(tree);
  let del: rdf.Statement[] = [];
  let ins: rdf.Statement[] = [];
  Object.keys(flattenedGraph).forEach((subject) => {
    const propertiesToChange = Object.keys(flattenedGraph[subject]);
    propertiesToChange.forEach((prop) => {
      const subjectNode = ((subject) => {
        if (subject.startsWith("bN-")) {
          const newBlankNode = newBlankNodes[subject];
          return newBlankNode;
        } else {
          return rdf.sym(replacePrefixWithNamespace(subject, this.url));
        }
      })(subject);
      const predicateNode = rdf.sym(replacePrefixWithNamespace(prop, this.url));
      const newValue = flattenedGraph[subject][prop];
      const newStatements: rdf.Statement[] = newValue
        ? formNewStatements(
            rdf.st(
              subjectNode,
              predicateNode,
              {} as rdf.Node,
              rdf.sym(this.url).doc()
            ),
            newValue
          )
        : [];
      const prevStatements: rdf.Statement[] = newValue
        ? getPreviousStatement(newStatements, this.url, this.store)
        : getPreviousStatement(
            this.store.statementsMatching(
              subjectNode,
              predicateNode,
              null,
              rdf.sym(this.url).doc()
            ),
            this.url,
            this.store
          );
      del = [...del, ...prevStatements];
      ins = [...ins, ...newStatements];
    });
  });
  const uniquePrevStatements = del.filter(
    (st) => !ins.find((newSt) => JSON.stringify(newSt) === JSON.stringify(st))
  );
  const uniqueNewStatements = ins.filter(
    (newSt) => !del.find((st) => JSON.stringify(st) === JSON.stringify(newSt))
  );
  // console.debug(uniquePrevStatements, del, ins, flattenedGraph);
  return (this.updater.update(
    uniquePrevStatements,
    uniqueNewStatements,
    undefined
  ) as Promise<any>).then(() => {
    const newGraph = this.assignValues();
    return newGraph;
  });
}

function flattenGraph(tree: Graph) {
  const flattenedGraph: Graph = {};
  const newBlankNodes: Record<string, rdf.BlankNode> = {};
  const getObjectValue = (subGraph: Graph, key: string, flatGraph: Graph) => {
    if (typeof subGraph[key] === "object") {
      const newBlankNode = new rdf.BlankNode(`bN-${cuid()}`);
      const [flattenedSubGraph, newSubGraphBlankNodes] = flattenGraph({
        [newBlankNode.value]: subGraph[key],
      });
      Object.keys(flattenedSubGraph).forEach(
        (_, index, flattenedSubGraphKeys) => {
          flatGraph[flattenedSubGraphKeys[index]] =
            flattenedSubGraph[flattenedSubGraphKeys[index]];
          newBlankNodes[Object.keys(newSubGraphBlankNodes)[index]] =
            newSubGraphBlankNodes[Object.keys(newSubGraphBlankNodes)[index]];
        }
      );
      newBlankNodes[newBlankNode.value] = newBlankNode;
      return newBlankNode;
    } else if (subGraph[key]) {
      return subGraph[key];
    }
  };
  Object.keys(tree).forEach((subject) => {
    Object.keys(tree[subject]).forEach((key) => {
      flattenedGraph[subject] = {
        ...flattenedGraph[subject],
        [key]: Array.isArray(tree[subject][key])
          ? tree[subject][key].map((value: any) =>
              getObjectValue(
                {
                  ...tree[subject],
                  [key]: value,
                },
                key,
                flattenedGraph
              )
            )
          : getObjectValue(tree[subject], key, flattenedGraph),
      };
    });
  });
  return [flattenedGraph, newBlankNodes];
}

function formNewStatements(
  context: rdf.Statement,
  newValue: rdf.Node[] | rdf.Node | string[] | string | number[] | number
) {
  const result = [];
  if (newValue) {
    if (Array.isArray(newValue)) {
      newValue.forEach((val: rdf.Node | string | number) => {
        result.push(getNewStatement(context, val));
      });
    } else {
      result.push(getNewStatement(context, newValue));
    }
  }
  return result;
}

async function fetchAndAssign(
  this: Graphs,
  options?: { clearPreviousData?: boolean }
) {
  return await this.fetcher.load(this.url, options).then(async () => {
    return this.assignValues();
  });
}

function replaceNamespaceWithPrefix(node: rdf.Node, baseUrl: string) {
  const uri = node.value;
  if (!urlUtils.parse(uri).host) {
    return uri;
  }
  const namespaceIndex = namespaceUris.findIndex((namespaceUri) =>
    uri.includes(namespaceUri)
  );
  const namespacePrefix =
    namespaceIndex > -1 ? Object.keys(ns())[namespaceIndex] : "";
  if (
    !namespacePrefix &&
    uri.includes(baseUrl) &&
    (uri.replace(baseUrl, "").startsWith("#") ||
      !uri.replace(baseUrl, "").includes("/"))
  ) {
    const parsedBaseUrl = urlUtils.parse(baseUrl);
    return uri.replace(urlUtils.format({ ...parsedBaseUrl, hash: "" }), "");
  } else if (!namespacePrefix) return uri;

  const parsedUri = urlUtils.parse(uri);
  parsedUri.hash = parsedUri.hash && parsedUri.hash?.replace("#", "");
  return `${namespacePrefix}#${
    parsedUri.hash ?? uri.replace(namespaceUris[namespaceIndex], "")
  }`;
}

function replacePrefixWithNamespace(prefixedProp: string, baseUrl: string) {
  if (urlUtils.parse(prefixedProp).host) {
    return prefixedProp;
  } else if (prefixedProp.startsWith("#")) {
    const parsedUrl = urlUtils.parse(baseUrl);
    return urlUtils.format({
      ...parsedUrl,
      hash: prefixedProp.replace("#", ""),
    });
  }
  const propFragments = prefixedProp.split("#");
  const namespacePrefix = propFragments[0];
  const prop = propFragments[1];
  return ns()[namespacePrefix](prop);
}

function assignValues(this: Graphs) {
  const store = this.store;
  const statements = store.statementsMatching(
    null,
    null,
    null,
    rdf.sym(this.url).doc()
  );
  const tree: Graph = {};

  //Looping through statements
  for (const index in statements) {
    const statement = statements[index];
    const parsedSubjectUri = urlUtils.parse(statement.subject.value);
    if (
      !parsedSubjectUri.hash &&
      statement.subject.value ===
        this.url.substr(
          0,
          this.url.lastIndexOf("#") ?? this.url.lastIndexOf("/")
        )
    ) {
      continue;
    }
    const shortSubject = replaceNamespaceWithPrefix(
      statement.subject,
      this.url
    ) as string;
    const subGraph: Graph = { id: statement.subject.value };

    //Looping through predicates
    store
      .statementsMatching(
        statement.subject,
        null,
        null,
        rdf.sym(this.url).doc()
      )
      .forEach((subjectStatement: rdf.Statement) => {
        const predicate = replaceNamespaceWithPrefix(
          subjectStatement.predicate,
          this.url
        ) as string;

        //Looping through the respective objects
        const values = store
          .each(
            statement.subject,
            subjectStatement.predicate,
            null,
            rdf.sym(this.url).doc()
          )
          .map((object: rdf.Node) => {
            const shortObject = replaceNamespaceWithPrefix(
              object,
              this.url
            ) as string;
            if (tree[shortObject]) {
              return tree[shortObject];
            } else if (shortObject === "#me") {
              return object.value;
            } else {
              return shortObject;
            }
          });

        // Save objects in predicate property
        subGraph[predicate] = values.length > 1 ? values : values[0];
      });

    const proxy = createProxy(subGraph);
    tree[shortSubject] = proxy;
  }

  this.tree = tree;
  return tree;
}

function createProxy(subGraph: Graph) {
  return new Proxy(subGraph, {
    get: function (subGraph, prop) {
      if (typeof prop === "string" && subGraph[prop]) {
        return subGraph[prop];
      }
    },
  });
}

function getNewStatement(
  st: rdf.Statement,
  newValue: rdf.Node | string | number
) {
  const newStatement = rdf.st(st.subject, st.predicate, rdf.lit(""), st.why);

  const validTypes = ["NamedNode", "BlankNode", "Literal"];
  const newValueNode = newValue as rdf.Node;
  if (
    newValueNode.termType &&
    validTypes.lastIndexOf(newValueNode.termType) !== -1
  ) {
    newStatement.object = newValueNode as rdf.NamedNode;
    return newStatement;
  }

  try {
    newStatement.object = rdf.sym(newValue as string);
  } catch (_) {
    newStatement.object = rdf.lit(newValue as string);
  }
  return newStatement;
}

export default Graphs;
