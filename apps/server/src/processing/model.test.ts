import { describe, expect, it, vi } from "vitest";

import { redactSecrets, synthesizeSkill, validateCandidate } from "./model";

const candidate = {
  schemaVersion: 1 as const,
  id: "x",
  name: "x",
  description: "x",
  instructions: "x",
  triggers: ["x"],
  inputs: ["x"],
  outputs: ["x"],
  prerequisites: ["x"],
  limitations: ["x"],
  validation: ["x"],
  evidence: [{ path: "x.ts", reason: "x" }],
};

function context() {
  return {
    jobId: "job",
    stage: "synthesis",
    inputDigest: "digest",
    leaseToken: "lease",
    signal: new AbortController().signal,
    deadline: new Date(Date.now() + 10_000).toISOString(),
    maxInputTokens: 100,
    maxOutputTokens: 20,
    maxCostUsd: 0.25,
  };
}

describe("model boundary", () => {
  it("redacts credentials before dispatch and requires evidence", () => {
    expect(redactSecrets("token ghp_12345678901234567890")).not.toContain("12345678901234567890");
    expect(redactSecrets("token gho_12345678901234567890 sk-12345678901234567890")).not.toContain(
      "12345678901234567890",
    );
    expect(() =>
      validateCandidate({
        schemaVersion: 1,
        id: "x",
        name: "x",
        description: "x",
        instructions: "x",
        evidence: [],
      }),
    ).toThrow("INVALID_MODEL_OUTPUT");
    expect(() =>
      validateCandidate({
        schemaVersion: 2,
        id: "x",
        name: "x",
        description: "x",
        instructions: "x",
        evidence: [{ path: "x.ts", reason: "x" }],
      }),
    ).toThrow("INVALID_MODEL_OUTPUT");
    expect(() =>
      validateCandidate(
        {
          schemaVersion: 1,
          id: "x",
          name: "x",
          description: "x",
          instructions: "x",
          triggers: ["x"],
          inputs: ["x"],
          outputs: ["x"],
          prerequisites: ["x"],
          limitations: ["x"],
          validation: ["x"],
          evidence: [{ path: "outside.ts", reason: "x" }],
        },
        new Set(["src/index.ts"]),
      ),
    ).toThrow("MISSING_EVIDENCE");
  });

  it("rejects missing or over-budget provider usage", async () => {
    const response = (usage: object) =>
      new Response(JSON.stringify({ output: candidate, usage }), { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ input_tokens: 1, output_tokens: 21, cost_usd: 0.01 })),
    );
    await expect(
      synthesizeSkill({
        apiUrl: "https://model.example",
        apiKey: "key",
        model: "model",
        prompt: "evidence",
        context: context(),
        allowedPaths: new Set(["x.ts"]),
      }),
    ).rejects.toThrow("TOKEN_LIMIT");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ input_tokens: 1, output_tokens: 1 })),
    );
    await expect(
      synthesizeSkill({
        apiUrl: "https://model.example",
        apiKey: "key",
        model: "model",
        prompt: "evidence",
        context: context(),
        allowedPaths: new Set(["x.ts"]),
      }),
    ).rejects.toThrow("MODEL_USAGE_INVALID");
    vi.unstubAllGlobals();
  });

  it("normalizes malformed provider JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(
      synthesizeSkill({
        apiUrl: "https://model.example",
        apiKey: "key",
        model: "model",
        prompt: "evidence",
        context: context(),
        allowedPaths: new Set(["x.ts"]),
      }),
    ).rejects.toThrow("INVALID_MODEL_OUTPUT");
    vi.unstubAllGlobals();
  });

  it("uses a stable idempotency key for retried provider calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: candidate,
          usage: { input_tokens: 1, output_tokens: 1, cost_usd: 0.01 },
        }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await synthesizeSkill({
      apiUrl: "https://model.example",
      apiKey: "key",
      model: "model",
      prompt: "evidence",
      context: context(),
      allowedPaths: new Set(["x.ts"]),
    });
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(firstHeaders.get("idempotency-key")).toMatch(/^[a-f0-9]{64}$/);
    vi.unstubAllGlobals();
  });
});
