## Querying Data

You can query data through accessing the properties of the loadd tree.

```javascript
const trees = new Graphs("https://lalasepp.owntech.de/profile/card#me");

trees.load().then(tree => {
  console.log(tree.me.role);

  //Also works for deeply nested properties
  console.log(tree.me.hasEmail.type);
});
```

## Setting Data

You can use the set function that's part of the tree class to set values.

```javascript
const trees = new Graphs("https://lalasepp.owntech.de/profile/card#me");
const { set } = trees;

trees.load().then(tree => {
  // Pass any node to set() to get an object with setter methods for it's edges
  set(tree.me).role("Software Engineer");

  // For setting multiple values do:
  set(tree.me).knows([
    "https://ludwig.owntech.de/profile/card#me",
    "https://bejow.owntech.de/profile/card#me"
  ]);

  // For setting nested values do:
  set(tree.me.hasEmail).type("Work");

  // or more abbreviated
  const email = tree.me.hasEmail;
  set(email).type("Work");
});
```

## Comparison to rdflib.js:

Reading and Updating single values (e.g. The job description of a user)

```javascript
import Graphs from "trees";
import rdf from "rdflib";

const newRole = "Software Engineer";

// trees.js
const loadAndModifyGraph = async () => {
  const trees = new Graphs("https://lalasepp.owntech.de/profile/card#me");

  const { me } = await trees.load();
  console.log(me.role);

  const { set } = trees;
  await set(me).role(newRole);
};

// rdflib.js
const loadAndModifyStore = async () => {
  const store = rdf.graph();
  const fetcher = new rdf.Fetcher();
  const updater = new rdf.UpdateManager();
  const webId = "https://lalasepp.owntech.de/profile/card#me";

  await fetcher.load(webId);
  const prevStatements = store.statementsMatching(
    rdf.sym(webId),
    rdf.sym("http://www.w3.org/2006/vcard/ns#role"),
    null
  );
  console.log(prevStatements[0].object.value);

  const newStatement = prevStatements[0];
  newStatement.object.value = newRole;
  await updater.update(prevStatements, newStatement);
};
```
