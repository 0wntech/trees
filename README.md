## Querying Data

You can query data through accessing the properties of a loaded graph.

```javascript
const graph = new Graphs("https://lalasepp.owntech.de/profile/card#me");

graph.load().then(graph => {
  console.log(graph.me.role);

  //Also works for deeply nested properties
  console.log(graph.me.hasEmail.type);
});
```

## Setting Data

You can use the patch function that is part of the Graph class to set values.

```javascript
const meUri = "https://lalasepp.owntech.de/profile/card#me";
const graph = new Graphs(meUri);

graph.load().then(tree => {
  graph.patch({ [meUri]: { "vcard#role": "Software Engineer" } })

  // For setting multiple values do:
  graph.patch({ [meUri]: { 
    "foaf#knows": [
        "https://ludwig.owntech.de/profile/card#me",
        "https://bejow.owntech.de/profile/card#me"
      ] 
    } 
  })

  // For setting nested values do:
  graph.patch({ [meUri]: { 
    "vcard#hasEmail": {
        "vcard#value": "lalasepp@example.com",
        "type": "vcard#Postal"
      } 
    } 
  })
});
```

## Comparison to rdflib.js:

Reading and Updating single values (e.g. The job description of a user)

```javascript
import Graphs from "webql-client";
import rdf from "rdflib";

const newRole = "Software Engineer";

// webql-client
const loadAndModifyGraph = async () => {
  const meUri = "https://lalasepp.owntech.de/profile/card#me";
  const graph = new Graphs(meUri);

  const { me } = await graph.load();
  console.log(me.role);

  await graph.patch({ [meUri]: { "vcard#role": "Software Engineer" } });
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
