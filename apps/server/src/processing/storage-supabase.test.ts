import { describe, expect, it, vi } from "vitest";

import { SupabaseStorage } from "./storage-supabase";

describe("Supabase storage adapter", () => {
  it("verifies an existing object before treating a duplicate put as success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { "x-metadata-checksum": "abc" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(
      storage.put({
        objectKey: "jobs/a/file.tar.gz",
        body: new Uint8Array([1]),
        checksum: "abc",
        contentType: "application/gzip",
      }),
    ).resolves.toMatchObject({ checksum: "abc" });
    expect(fetchMock.mock.calls[1]?.[0]).toContain("jobs/a/file.tar.gz");
    vi.unstubAllGlobals();
  });

  it("rejects a duplicate when the existing checksum differs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { "x-metadata-checksum": "other" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(
      storage.put({
        objectKey: "jobs/a/file.tar.gz",
        body: new Uint8Array([1]),
        checksum: "abc",
        contentType: "application/gzip",
      }),
    ).rejects.toThrow("STORAGE_CHECKSUM_MISMATCH");
    vi.unstubAllGlobals();
  });

  it("bounds signed URL lifetime and preserves encoded object paths", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ signedURL: "/object/sign/private/jobs/a%20b" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(storage.createDownloadUrl("jobs/a b", 900)).resolves.toMatchObject({
      url: "https://example.supabase.co/storage/v1/object/sign/private/jobs/a%20b",
    });
    await expect(storage.createDownloadUrl("jobs/a", 901)).rejects.toThrow("INVALID_INPUT");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("jobs/a%20b");
    vi.unstubAllGlobals();
  });

  it("maps storage listings into the reconciliation shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ name: "jobs/a.tar.gz", created_at: "2026-08-14" }]), {
          status: 200,
        }),
      ),
    );
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(storage.list("jobs/")).resolves.toEqual([
      { name: "jobs/a.tar.gz", createdAt: "2026-08-14" },
    ]);
    vi.unstubAllGlobals();
  });

  it("rejects signed URLs that escape the object path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ signedURL: "/object/sign/private/%2e%2e/secret" }), {
          status: 200,
        }),
      ),
    );
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(storage.createDownloadUrl("jobs/a", 60)).rejects.toThrow("STORAGE_SIGN_FAILED");
    vi.unstubAllGlobals();
  });

  it("rejects a valid signed URL for a different object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ signedURL: "/object/sign/private/jobs/other" }), {
          status: 200,
        }),
      ),
    );
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(storage.createDownloadUrl("jobs/a", 60)).rejects.toThrow("STORAGE_SIGN_FAILED");
    vi.unstubAllGlobals();
  });

  it("normalizes malformed signing responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(storage.createDownloadUrl("jobs/a", 60)).rejects.toThrow("STORAGE_SIGN_FAILED");
    vi.unstubAllGlobals();
  });

  it("uses the Supabase remove-object contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = new SupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "secret",
      bucket: "private",
    });
    await expect(storage.delete("jobs/a.tar.gz")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.supabase.co/storage/v1/object/remove/private",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    vi.unstubAllGlobals();
  });
});
