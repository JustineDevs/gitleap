import { describe, expect, it } from "vitest";

import { canonicalIdentityHash, normalizeGithubUrl } from "./identity";
import { assertWithin, estimatedModelCost, PROCESSING_LIMITS } from "./limits";
import { retryBackoffMs } from "./repository";
import { assertTransition, publicState } from "./state";

describe("processing domain", () => {
  it("canonicalizes equivalent GitHub URLs", () => {
    expect(normalizeGithubUrl("https://github.com/Acme/Repo.git?tab=readme")).toEqual({
      owner: "acme",
      repository: "repo",
    });
    const options = { includeTests: true, parserSet: "v1", skillLimit: 10 } as const;
    expect(
      canonicalIdentityHash(
        { provider: "github", owner: "Acme", repository: "Repo", commitSha: "A".repeat(40) },
        "v1",
        options,
      ),
    ).toBe(
      canonicalIdentityHash(
        { provider: "github", owner: "acme", repository: "repo", commitSha: "a".repeat(40) },
        "v1",
        options,
      ),
    );
  });

  it("enforces the state machine and public projection", () => {
    assertTransition("queued", "claimed");
    assertTransition("queued", "cancelled");
    assertTransition("cancel_requested", "cancelled");
    expect(() => assertTransition("queued", "cancel_requested")).toThrow(
      "ILLEGAL_STATE_TRANSITION",
    );
    expect(() => assertTransition("ready", "processing")).toThrow("ILLEGAL_STATE_TRANSITION");
    expect(publicState("failed_retryable")).toBe("queued");
    expect(publicState("cancel_requested")).toBe("running");
  });

  it("keeps retry backoff bounded and database-owned", () => {
    expect(retryBackoffMs(1)).toBe(1_000);
    expect(retryBackoffMs(3)).toBe(4_000);
    expect(retryBackoffMs(99)).toBe(60_000);
  });

  it("bounds model cost", () => {
    expect(estimatedModelCost(1000, 500, 0.01, 0.02)).toBe(0.02);
    expect(() =>
      assertWithin(
        PROCESSING_LIMITS.maxCallCostUsd + 1,
        PROCESSING_LIMITS.maxCallCostUsd,
        "COST_BUDGET_EXHAUSTED",
      ),
    ).toThrow();
  });
});
