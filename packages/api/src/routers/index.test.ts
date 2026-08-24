import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    STRIPE_SECRET_KEY: "test-stripe",
    STRIPE_WEBHOOK_SECRET: "test-webhook",
    ARCJET_KEY: "test-arcjet",
    CORS_ORIGIN: "http://localhost:3000",
  });
});

const routerModule = await import("./index");
const { appRouter, resolveCommitSha, safeSignedPath } = routerModule;

describe("processing transport contract", () => {
  it("protects processing details from unauthenticated callers", async () => {
    const caller = appRouter.createCaller({ session: null });
    await expect(caller.getProcessingDetails({ jobId: "job-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("normalizes a SHA without a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveCommitSha("acme", "repo", "A".repeat(40))).resolves.toBe("a".repeat(40));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("resolves a branch through the fixed GitHub endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ sha: "B".repeat(40) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveCommitSha("acme", "repo", "main")).resolves.toBe("b".repeat(40));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/acme/repo/commits/main",
    );
    vi.unstubAllGlobals();
  });

  it("rejects malformed or oversized GitHub responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("x", { status: 200, headers: { "content-length": String(2 * 1024 * 1024) } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveCommitSha("acme", "repo", "main")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    vi.unstubAllGlobals();
  });

  it("preserves GitHub rate-limit and outage semantics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveCommitSha("acme", "repo", "main")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    await expect(resolveCommitSha("acme", "repo", "main")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    vi.unstubAllGlobals();
  });

  it("maps network failures to temporary upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(resolveCommitSha("acme", "repo", "main")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    vi.unstubAllGlobals();
  });

  it("binds signed artifact URLs to the requested object", () => {
    expect(() =>
      safeSignedPath(
        "/object/sign/private/jobs/other.tar.gz",
        "/object/sign/private/jobs/a.tar.gz",
      ),
    ).toThrowError("Artifact signing failed");
    expect(
      safeSignedPath(
        "/object/sign/private/jobs/a%20b.tar.gz",
        "/object/sign/private/jobs/a%20b.tar.gz",
      ),
    ).toBe("/object/sign/private/jobs/a%20b.tar.gz");
    expect(() =>
      safeSignedPath("/object/sign/private/jobs/%", "/object/sign/private/jobs/%"),
    ).toThrowError("Artifact signing failed");
  });
});
