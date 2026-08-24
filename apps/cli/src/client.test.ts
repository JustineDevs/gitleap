import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { fetchVerifiedArtifact, GitLeapClient } from "./client";

describe("GitLeap CLI client", () => {
  it("uses the shared HTTP processing contract", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain("/trpc/submitProcessing");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({ result: { data: { jobId: "job-1", status: "queued", reused: false } } }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      await expect(
        new GitLeapClient({ serverUrl: "http://localhost:3000", sessionCookie: "sid=x" }).submit({
          url: "https://github.com/a/b",
          revision: "a".repeat(40),
        }),
      ).resolves.toEqual({ jobId: "job-1", status: "queued", reused: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("verifies artifact bytes before exposing them to the filesystem", async () => {
    const originalFetch = globalThis.fetch;
    const body = new TextEncoder().encode("artifact");
    const checksum = createHash("sha256").update(body).digest("hex");
    globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch;
    try {
      await expect(
        fetchVerifiedArtifact({ url: "https://example.test/artifact", checksum }),
      ).resolves.toEqual(body);
      await expect(
        fetchVerifiedArtifact({ url: "https://example.test/artifact", checksum: "0".repeat(64) }),
      ).rejects.toThrow("checksum mismatch");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
