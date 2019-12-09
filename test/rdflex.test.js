const { expect } = require("chai");
const rdf = require("rdflib");
const auth = require("solid-auth-cli");
const RDFlex = require("../index");

const rdflex = new RDFlex("https://lalasepp1.solid.community/profile/card#me");
const { set } = rdflex;

describe("RDFlex", () => {
  before("Setting up auth...", async function() {
    this.timeout(10000);
    const credentials = await auth.getCredentials();
    return auth.login(credentials).then(() => {
      rdflex.fetcher = new rdf.Fetcher(rdflex.store, {
        fetch: auth.fetch
      });
    });
  });
  it("fetches ld object", () => {
    return rdflex.init().then(tree => {
      const { me } = tree;
      const testArray = ["Append", "Control", "Read", "Write"];
      return expect(me.trustedApp[0].mode).to.deep.equal(testArray);
    });
  });
  it("modifies ld object", () => {
    return rdflex.init().then(async tree => {
      const { me } = tree;
      const newValue = me.role === "Hacker" ? "Software Engineer" : "Hacker";

      await set(me).role(newValue);
      const { me: newMe } = await rdflex.init();
      expect(newMe.role).to.equal(newValue);
    });
  });
  it("adds multiple values", () => {
    return rdflex.init().then(async tree => {
      const { me } = tree;
      const newValue = [
        "https://bejow.owntech.de/profile/card#me",
        "https://ludwig.owntech.de/profile/card#me",
        "https://timbl.solid.community/profile/card#me"
      ];

      await set(me).knows(newValue);

      const { me: newMe } = await rdflex.init();
      expect(newMe.knows).to.deep.equal(newValue);
    });
  });
  after("clean up...", () => {
    return rdflex.init().then(({ me }) => {
      return Promise.all([
        set(me).role("Software Engineer"),
        set(me).knows([
          "https://bejow.owntech.de/profile/card#me",
          "https://ludwig.owntech.de/profile/card#me"
        ])
      ]);
    });
  });
});
