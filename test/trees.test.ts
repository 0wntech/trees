import { expect } from "chai";
import { EROFS } from "constants";
import * as rdf from "rdflib";
const auth = require("solid-auth-cli");

import { Tree, Trees } from "../lib";

const testFile = "https://lalatest.solidcommunity.net/profile/card#me";
const trees = new Trees(testFile);

describe("Trees", () => {
  before("Authenticating", async () => {
    const credentials = await auth.getCredentials();
    await auth.login(credentials);
    trees.fetcher = new rdf.Fetcher(trees.store, { fetch: auth.fetch });
  });
  it("fetches ld object", () => {
    return trees.create().then((tree: Tree) => {
      const me = tree["#me"];
      const testValue = "Tester";
      return expect(me["foaf#name"]).to.deep.equal(testValue);
    });
  });
  it("can read nested nodes", () => {
    return trees.create().then((tree: Tree) => {
      const me = tree["#me"];
      const testArray = ["acl#Append", "acl#Control", "acl#Read", "acl#Write"];
      return expect(me["acl#trustedApp"][0]["acl#mode"]).to.deep.equal(
        testArray
      );
    });
  });
  it("modifies tree", async () => {
    const newValue = "Hacker";
    const { ["#me"]: newMe } = await trees.modify({
      [testFile]: { "vcard#role": newValue },
    });
    expect(newMe["vcard#role"]).to.equal(newValue);
  });
  it("sets multiple properties", async () => {
    const newRole = "Software Engineer";
    const newName = "Lalatest";
    const { ["#me"]: newMe } = await trees.modify({
      [testFile]: { "vcard#role": newRole, "foaf#name": newName },
    });
    expect(newMe["vcard#role"]).to.equal(newRole);
    expect(newMe["foaf#name"]).to.equal(newName);
  });
  it("deletes a statement if new value is undefined", async () => {
    const { ["#me"]: newMe } = await trees.modify({
      [testFile]: { "vcard#role": undefined },
    });
    console.log(newMe)
    expect(newMe["vcard#role"]).to.equal(undefined);
  });
  it("can set an array of values", async () => {
    const newArray = ["Software Engineer", "Tester"];
    const { ["#me"]: newMe } = await trees.modify({
      [testFile]: {
        "vcard#role": newArray,
      },
    });
    expect(newMe["vcard#role"]).to.deep.equal(newArray);
  });
  it("can set an array of objects", async () => {
    const newArray = [
      { "vcard#value": "Software Engineer" },
      { "vcard#value": "Tester" },
    ];
    const { ["#me"]: newMe } = await trees.modify({
      [testFile]: {
        "vcard#role": newArray,
      },
    });
    expect(newMe["vcard#role"][0]["vcard#value"]).to.deep.equal(
      newArray[0]["vcard#value"]
    );
    expect(newMe["vcard#role"][1]["vcard#value"]).to.deep.equal(
      newArray[1]["vcard#value"]
    );
  });
  after("clean up...", async () => {
    await Promise.all([
      trees.modify({
        [testFile]: {
          "vcard#hasEmail": { "vcard#value": "mailto:lalasepp@gmail.com" },
          "vcard#role": "Software Engineer",
          "foaf#name": "Tester",
        },
      }),
    ]);
  });
});
