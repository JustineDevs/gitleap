import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "140.82.112.3" }]),
}));

import {
  boundedFetch,
  githubArchiveUrl,
  githubCommitUrl,
  isPrivateAddress,
  resolveGithubRevision,
} from "./source-github";

describe("GitHub source boundary", () => {
  it("uses fixed HTTPS GitHub endpoints", () => {
    expect(githubCommitUrl("acme", "repo", "main")).toBe(
      "https://api.github.com/repos/acme/repo/commits/main",
    );
    expect(githubArchiveUrl("acme", "repo", "a".repeat(40))).toBe(
      `https://codeload.github.com/acme/repo/tar.gz/${"a".repeat(40)}`,
    );
  });

  it("normalizes malformed revision responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("not-json", { status: 200 })) as unknown as typeof fetch;
    try {
      await expect(
        resolveGithubRevision({
          owner: "acme",
          repository: "repo",
          revision: "main",
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow("UPSTREAM_FAILURE");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects private, loopback, metadata, and multicast addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.4", "169.254.169.254", "::1", "fd00::1", "ff02::1"])
      expect(isPrivateAddress(address)).toBe(true);
    expect(isPrivateAddress("140.82.112.3")).toBe(false);
  });

  it("maps upstream status and response-size failures to safe classes", async () => {
    const originalFetch = globalThis.fetch;
    try {
      for (const [status, expected] of [
        [404, "NOT_FOUND"],
        [429, "RATE_LIMITED"],
        [500, "UPSTREAM_FAILURE"],
      ] as const) {
        globalThis.fetch = (async () => new Response(null, { status })) as unknown as typeof fetch;
        await expect(
          boundedFetch(
            "https://api.github.com/repos/acme/repo/commits/main",
            new AbortController().signal,
            1024,
          ),
        ).rejects.toThrow(expected);
      }
      globalThis.fetch = (async () =>
        new Response("x", {
          status: 200,
          headers: { "content-length": "2048" },
        })) as unknown as typeof fetch;
      await expect(
        boundedFetch(
          "https://api.github.com/repos/acme/repo/commits/main",
          new AbortController().signal,
          1024,
        ),
      ).rejects.toThrow("SIZE_LIMIT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
