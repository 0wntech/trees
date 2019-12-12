## Comparison to rdflib.js:

Reading and Updating single values (e.g. The job description of a user)

```javascript
import Trees from "trees";
import rdf from "rdflib";

const newRole = "Software Engineer";

// trees.js
const createAndModifyTree = async () => {
  const trees = new Trees("https://lalasepp.owntech.de/profile/card#me");

  const { me } = await trees.create();
  console.log(me.role);

  const { set } = trees;
  await set(me).role(newRole);
};

// rdflib.js
const createAndModifyStore = async () => {
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
