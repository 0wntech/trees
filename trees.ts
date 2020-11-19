import * as rdf from "rdflib";
import cuid from "cuid";
import * as urlUtils from "url";
import ns from "own-namespace";

export interface Tree {
  [key: string]: any;
}

const namespaceUris = Object.values(ns()).map((namespace) =>
  (namespace as Function)()
);

export class Trees {
  store: rdf.Store;
  fetcher: rdf.Fetcher;
  updater: rdf.UpdateManager;
  url: string;
  tree: Tree | undefined;
  create: (this: Trees) => Promise<Tree>;
  assignValues: (this: Trees) => Tree;
  modify: (this: Trees, tree: Tree) => Promise<Tree>;

  constructor(url: string) {
    this.store = rdf.graph();
    this.fetcher = new rdf.Fetcher(this.store);
    this.updater = new rdf.UpdateManager(this.store);

    this.url = url;

    this.create = fetchAndAssign;
    this.assignValues = assignValues;
    this.modify = modify;
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
        rdf.sym(baseUrl)
      ),
      ...store
        .statementsMatching(
          newStatement.subject,
          newStatement.predicate,
          null,
          rdf.sym(baseUrl)
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
                    rdf.sym(baseUrl)
                  ),
                ]
              : []),
          ],
          [] as rdf.Statement[]
        ),
    ];
  }, [] as rdf.Statement[]);
}

function modify(this: Trees, tree: Tree) {
  const [flattenedTree, newBlankNodes] = flattenTree(tree);
  let del: rdf.Statement[] = [];
  let ins: rdf.Statement[] = [];
  Object.keys(flattenedTree).forEach((subject) => {
    const propertiesToChange = Object.keys(flattenedTree[subject]);
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
      const newValue = flattenedTree[subject][prop];
      const newStatements: rdf.Statement[] = newValue
        ? formNewStatements(
            rdf.st(
              subjectNode,
              predicateNode,
              {} as rdf.Node,
              rdf.sym(this.url)
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
              rdf.sym(this.url)
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
  return (this.updater.update(
    uniquePrevStatements,
    uniqueNewStatements,
    undefined,
    { force: true }
  ) as Promise<any>).then(() => {
    const newTree = this.assignValues();
    return newTree;
  });
}

function flattenTree(tree: Tree) {
  const flattenedTree: Tree = {};
  const newBlankNodes: Record<string, rdf.BlankNode> = {};
  const getObjectValue = (subTree: Tree, key: string, flatTree: Tree) => {
    console.log(key, subTree[key], subTree);
    if (typeof subTree[key] === "object") {
      const newBlankNode = new rdf.BlankNode(`bN-${cuid()}`);
      const [flattenedSubTree, newSubTreeBlankNodes] = flattenTree({
        [newBlankNode.value]: subTree[key],
      });
      Object.keys(flattenedSubTree).forEach(
        (_, index, flattenedSubTreeKeys) => {
          flatTree[flattenedSubTreeKeys[index]] =
            flattenedSubTree[flattenedSubTreeKeys[index]];
          newBlankNodes[Object.keys(newSubTreeBlankNodes)[index]] =
            newSubTreeBlankNodes[Object.keys(newSubTreeBlankNodes)[index]];
        }
      );
      newBlankNodes[newBlankNode.value] = newBlankNode;
      return newBlankNode;
    } else if (subTree[key]) {
      return subTree[key];
    }
  };
  Object.keys(tree).forEach((subject) => {
    Object.keys(tree[subject]).forEach((key) => {
      flattenedTree[subject] = {
        ...flattenedTree[subject],
        [key]: Array.isArray(tree[subject][key])
          ? tree[subject][key].map((value: any) =>
              getObjectValue(
                {
                  ...tree[subject],
                  [key]: value,
                },
                key,
                flattenedTree
              )
            )
          : getObjectValue(tree[subject], key, flattenedTree),
      };
    });
  });
  return [flattenedTree, newBlankNodes];
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

async function fetchAndAssign(this: Trees) {
  return await this.fetcher._fetch(this.url).then(async (res: Response) => {
    if (res.status && res.status === 200) {
      const body = await res.text();
      const contentType = res.headers.get("Content-Type") ?? "text/turtle";
      rdf.parse(body, this.store, this.url, contentType);
      console.log("[DEBUG] -- Freshly fetched + " + this.url);
    }
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

function assignValues(this: Trees) {
  const store = this.store;
  const statements = store.statementsMatching(
    null,
    null,
    null,
    rdf.sym(this.url)
  );
  const tree: Tree = {};

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
    const subTree: Tree = { id: statement.subject.value };

    //Looping through predicates
    store
      .statementsMatching(statement.subject, null, null, rdf.sym(this.url))
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
            rdf.sym(this.url)
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
        subTree[predicate] = values.length > 1 ? values : values[0];
      });

    const proxy = createProxy(subTree);
    tree[shortSubject] = proxy;
  }

  this.tree = tree;
  return tree;
}

function createProxy(subTree: Tree) {
  return new Proxy(subTree, {
    get: function (subTree, prop) {
      if (typeof prop === "string" && subTree[prop]) {
        return subTree[prop];
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

export default Trees;
