import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { mapReadyState, redactMongoUri } from "./utils.js";

describe("mapReadyState", () => {
  it("maps every ConnectionStates value to a stable label", () => {
    const { ConnectionStates } = mongoose;

    assert.equal(mapReadyState(ConnectionStates.disconnected), "disconnected");
    assert.equal(mapReadyState(ConnectionStates.connected), "connected");
    assert.equal(mapReadyState(ConnectionStates.connecting), "connecting");
    assert.equal(
      mapReadyState(ConnectionStates.disconnecting),
      "disconnecting",
    );
    assert.equal(
      mapReadyState(ConnectionStates.uninitialized),
      "uninitialized",
    );
  });
});

describe("redactMongoUri", () => {
  it("masks username and password in mongodb URIs", () => {
    const redacted = redactMongoUri(
      "mongodb://atlas:s3cret@localhost:27017/atlas?authSource=admin",
    );

    assert.match(redacted, /\/\/\*\*\*@localhost/);
    assert.doesNotMatch(redacted, /s3cret/);
  });

  it("leaves credential-free URIs unchanged", () => {
    const uri = "mongodb://localhost:27017/atlas";
    assert.equal(redactMongoUri(uri), uri);
  });

  it("falls back for malformed strings that still look like credentials", () => {
    const redacted = redactMongoUri("mongodb://user:pass@not a url");
    assert.match(redacted, /\*\*\*/);
    assert.doesNotMatch(redacted, /pass/);
  });
});
