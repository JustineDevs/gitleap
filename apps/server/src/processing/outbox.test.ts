import { describe, expect, it } from "vitest";

import { queueJobId } from "./outbox";

describe("outbox transport identity", () => {
  it("encodes canonical event ids without collision-prone rewriting", () => {
    expect(queueJobId("cuid:RETRY:4")).toBe("Y3VpZDpSRVRSWTo0");
    expect(queueJobId("a:b_c")).not.toBe(queueJobId("a_b:c"));
  });
});
