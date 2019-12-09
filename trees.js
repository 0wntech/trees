const rdf = require("rdflib");
const url = require("url");

function Trees(url) {
  this.store = rdf.graph();
  this.fetcher = new rdf.Fetcher(this.store);
  this.updater = new rdf.UpdateManager(this.store);

  this.url = url;
  this.tree = null;

  const update = updateFromContext.bind(this);

  this.create = initValues;
  this.set = function set(subject) {
    const proxy = new Proxy(subject, {
      get: function(subject, prop) {
        if (prop in subject)
          return newValue => {
            return Promise.resolve(update(subject, prop, newValue)).then(ok => {
              if (ok) {
                subject[prop] = newValue;
                return true;
              }
              throw new Error("Update Failed");
            });
          };
      }
    });
    return proxy;
  };
}

function updateFromContext(subject, prop, newValue) {
  const prevStatements = Array.isArray(subject.context[prop])
    ? subject.context[prop]
    : [subject.context[prop]];

  const contextFromVal = Array.isArray(prevStatements)
    ? prevStatements[0]
    : prevStatements;
  const newStatements = formNewStatements(contextFromVal, newValue);

  if (JSON.stringify(prevStatements) === JSON.stringify(newStatements))
    return Promise.resolve(true);

  return this.updater.update(prevStatements, newStatements).then(() => {
    return true;
  });
}

function formNewStatements(context, newValue) {
  const result = [];
  if (Array.isArray(newValue)) {
    newValue.forEach(val => {
      result.push(getNewStatement(context, val));
    });
  } else {
    result.push(getNewStatement(context, newValue));
  }
  return result;
}

function initValues() {
  assignValues = assignValues.bind(this);
  return this.fetcher
    .load(this.url, { force: true, clearPreviousData: true })
    .then(res => {
      if (res.status && res.status === 200)
        console.log("[DEBUG] -- Freshly fetched + " + this.url);
      return assignValues();
    });
}

function assignValues() {
  const store = this.store;
  const statements = store.statementsMatching(null);
  const tree = {};

  //Looping through statements
  statements.forEach(statement => {
    const shortSubject = getSemantics(statement.subject);
    const subTree = {};
    const context = {};

    //Looping through predicates
    store.statementsMatching(statement.subject, null).forEach(subject => {
      const predicate = getSemantics(subject.predicate);

      //Looping through the respective objects
      const values = store
        .each(statement.subject, subject.predicate, null)
        .map(object => {
          const shortObject = getSemantics(object);
          if (shortObject === "me") {
            return object.value;
          } else if (tree[shortObject]) {
            return tree[shortObject];
          } else {
            return shortObject;
          }
        });

      // Save objects in predicate property
      subTree[predicate] = values.length > 1 ? values : values[0];

      // Save statements in context object
      context[predicate] = saveStatement(subject, context);
    });

    const proxy = createProxy(subTree);
    tree[shortSubject] = { ...proxy, context: context };
  });

  this.tree = tree;
  return tree;
}

function createProxy(subTree) {
  return new Proxy(subTree, {
    get: function(subTree, prop) {
      if (prop in subTree) {
        return subTree[prop];
      }
    }
  });
}

function saveStatement(statement, context) {
  const predicate = getSemantics(statement.predicate);

  return context[predicate] && context[predicate] !== statement
    ? Array.isArray(context[predicate])
      ? context[predicate].lastIndexOf(statement) === -1 &&
        context[predicate].length > 1
        ? context[predicate].concat([statement])
        : context[predicate]
      : [context[predicate]].concat([statement])
    : statement;
}

function getNewStatement(st, newValue) {
  const newStatement = rdf.st(st.subject, st.predicate, null, st.why);

  const validTypes = ["NamedNode", "BlankNode", "Literal"];
  if (newValue.termType && validTypes.lastIndexOf(newValue.termType) !== -1) {
    newStatement.object = newValue;
    return newStatement;
  }

  try {
    newStatement.object = rdf.sym(newValue);
  } catch (_) {
    newStatement.object = rdf.lit(newValue);
  }
  return newStatement;
}

function getSemantics(node) {
  if (node.elements) {
    return node.elements.map(element => getSemantics(element));
  } else if (!node.value.endsWith("/")) {
    if (node.value.split("#").length > 1) {
      return node.value.substr(
        node.value.lastIndexOf("#") + 1,
        node.value.length
      );
    } else {
      return node.value.substr(
        node.value.lastIndexOf("/") + 1,
        node.value.length
      );
    }
  } else {
    return url.parse(node.value).host + url.parse(node.value).path;
  }
}

module.exports = Trees;
