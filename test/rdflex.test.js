const { expect } = require("chai");
const rdf = require("rdflib");
const auth = require("solid-auth-cli");
const Trees = require("../index");

const trees = new Trees("https://lalasepp1.solid.community/profile/card#me");
const { set } = trees;

describe("RDFlex", () => {
  before("Setting up auth...", async function() {
    this.timeout(10000);
    const credentials = await auth.getCredentials();
    return auth.login(credentials).then(() => {
      trees.fetcher = new rdf.Fetcher(trees.store, {
        fetch: auth.fetch
      });
    });
  });
  it("fetches ld object", () => {
    return trees.create().then(({ me }) => {
      const testValue = "Lala Sepp";
      return expect(me.fn).to.deep.equal(testValue);
    });
  });
  it("can read nested nodes", () => {
    return trees.create().then(({ me }) => {
      const testArray = ["Append", "Control", "Read", "Write"];
      return expect(me.trustedApp[0].mode).to.deep.equal(testArray);
    });
  });
  it("modifies ld object", () => {
    return trees.create().then(async ({ me }) => {
      const newValue = "Hacker";
      await set(me).role(newValue);
      const { me: newMe } = await trees.create();
      expect(newMe.role).to.equal(newValue);
    });
  });
  it("sets multiple values", () => {
    return trees.create().then(async ({ me }) => {
      const newValue = [
        "https://bejow.owntech.de/profile/card#me",
        "https://ludwig.owntech.de/profile/card#me",
        "https://timbl.solid.community/profile/card#me"
      ];

      await set(me).knows(newValue);
      const { me: newMe } = await trees.create();
      expect(newMe.knows).to.deep.equal(newValue);
    });
  });
  it("sets values of nested nodes", () => {
    return trees.create().then(async ({ me }) => {
      const newValue = "tel:017698452367";
      await set(me.hasTelephone).value(newValue);
      const { me: newMe } = await trees.create();
      expect(newMe.hasTelephone.value).to.deep.equal(newValue);
    });
  });
  it("sets values with nodes", () => {
    return trees.create().then(async ({ me }) => {
      const newValue = "https://bejow.owntech.de/profile/card#me";
      await set(me).knows(rdf.sym(newValue));
      const { me: newMe } = await trees.create();
      expect(newMe.knows).to.equal(newValue);
    });
  });
  after("clean up...", async () => {
    const { me } = await trees.create();
    await Promise.all([
      set(me).role("Software Engineer"),
      set(me).knows([
        "https://bejow.owntech.de/profile/card#me",
        "https://ludwig.owntech.de/profile/card#me"
      ])
    ]);
  });
});
