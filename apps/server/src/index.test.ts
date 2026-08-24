import { describe, expect, it } from "vitest";

import { app } from "./index";

describe("HTTP security boundary", () => {
  it("rejects cross-origin mutations before tRPC handling", async () => {
    const response = await app.fetch(
      new Request("http://localhost/trpc/healthCheck", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "CSRF_REJECTED" });
  });

  it("rejects mutations without origin provenance", async () => {
    const response = await app.fetch(
      new Request("http://localhost/trpc/healthCheck", { method: "POST" }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "CSRF_REJECTED" });
  });

  it("keeps the health endpoint available for deployment checks", async () => {
    const response = await app.fetch(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
