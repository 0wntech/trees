import { expect } from "chai";
import * as rdf from "rdflib";
import { SolidNodeClient } from "solid-node-client";
const config = require("dotenv").config();

import { Graph, Graphs } from "../lib";

const testFile = "https://lalatest.solidcommunity.net/profile/card#me";
const trees = new Graphs(testFile);

describe("Graphs", () => {
  before("Authenticating", async () => {
    const client = new SolidNodeClient();
    await client.login(config);
    trees.fetcher._fetch = client.session.fetch.bind(client);
  });
  it("fetches ld object", () => {
    return trees.load().then((tree: Graph) => {
      const me = tree["#me"];
      const testValue = "Tester";
      return expect(me["foaf#name"]).to.deep.equal(testValue);
    });
  });
  it("can read nested nodes", () => {
    return trees.load().then((tree: Graph) => {
      const me = tree["#me"];
      const testArray = ["acl#Append", "acl#Control", "acl#Read", "acl#Write"];
      return expect(me["acl#trustedApp"][0]["acl#mode"]).to.deep.equal(
        testArray
      );
    });
  });
  it("modifies tree", async () => {
    const newValue = "Hacker";
    const { ["#me"]: newMe } = await trees.patch({
      [testFile]: { "vcard#role": newValue },
    });
    expect(newMe["vcard#role"]).to.equal(newValue);
  });
  it("sets multiple properties", async () => {
    const newRole = "Software Engineer";
    const newName = "Lalatest";
    const { ["#me"]: newMe } = await trees.patch({
      [testFile]: { "vcard#role": newRole, "foaf#name": newName },
    });
    expect(newMe["vcard#role"]).to.equal(newRole);
    expect(newMe["foaf#name"]).to.equal(newName);
  });
  it("deletes a statement if new value is undefined", async () => {
    const { ["#me"]: newMe } = await trees.patch({
      [testFile]: { "vcard#role": undefined },
    });
    expect(newMe["vcard#role"]).to.equal(undefined);
  });
  it("can set an array of values", async () => {
    const newArray = ["Software Engineer", "Tester"];
    const { ["#me"]: newMe } = await trees.patch({
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
    const { ["#me"]: newMe } = await trees.patch({
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
      trees.patch({
        [testFile]: {
          "vcard#hasEmail": { "vcard#value": "mailto:lalasepp@gmail.com" },
          "vcard#role": "Software Engineer",
          "foaf#name": "Tester",
        },
      }),
    ]);
  });
});
