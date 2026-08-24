import { boundedSignal, readBoundedText } from "./limits";

export type StorageConfig = { url: string; serviceRoleKey: string; bucket: string };
export type ListedObject = { name: string; createdAt?: string };

function safeSignedPath(value: string, expectedPath: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("STORAGE_SIGN_FAILED");
  }
  let parsed: URL;
  try {
    parsed = new URL(value, "https://storage.invalid");
  } catch {
    throw new Error("STORAGE_SIGN_FAILED");
  }
  let parsedPath: string;
  let expectedDecoded: string;
  try {
    parsedPath = decodeURIComponent(parsed.pathname);
    expectedDecoded = decodeURIComponent(expectedPath);
  } catch {
    throw new Error("STORAGE_SIGN_FAILED");
  }
  if (
    !value.startsWith("/") ||
    !parsed.pathname.startsWith("/object/sign/") ||
    decoded.includes("..")
  )
    throw new Error("STORAGE_SIGN_FAILED");
  if (parsedPath !== expectedDecoded) throw new Error("STORAGE_SIGN_FAILED");
  return value;
}

export class SupabaseStorage {
  constructor(private readonly config: StorageConfig) {}

  private endpoint(path: string): string {
    return `${this.config.url.replace(/\/$/, "")}/storage/v1${path}`;
  }

  private objectPath(objectKey: string): string {
    const segments = objectKey.split("/");
    if (
      !objectKey ||
      objectKey.startsWith("/") ||
      segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
    )
      throw new Error("INVALID_INPUT");
    return `/object/${encodeURIComponent(this.config.bucket)}/${segments.map(encodeURIComponent).join("/")}`;
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return boundedSignal(signal, 30_000);
  }

  async put(input: {
    objectKey: string;
    body: Uint8Array;
    checksum: string;
    contentType: "application/gzip";
    signal?: AbortSignal;
  }): Promise<{ objectKey: string; sizeBytes: number; checksum: string }> {
    const headers = {
      authorization: `Bearer ${this.config.serviceRoleKey}`,
      apikey: this.config.serviceRoleKey,
      "content-type": input.contentType,
      "x-upsert": "false",
      "x-metadata-checksum": input.checksum,
    };
    const response = await fetch(this.endpoint(this.objectPath(input.objectKey)), {
      method: "POST",
      headers,
      body: input.body,
      signal: this.signal(input.signal),
    });
    if (!response.ok && response.status !== 409) throw new Error("STORAGE_WRITE_FAILED");
    if (response.status === 409) {
      const existing = await fetch(this.endpoint(this.objectPath(input.objectKey)), {
        method: "HEAD",
        headers,
        signal: this.signal(input.signal),
      });
      const storedChecksum =
        existing.headers.get("x-metadata-checksum") ?? existing.headers.get("x-checksum");
      if (!existing.ok || storedChecksum !== input.checksum)
        throw new Error("STORAGE_CHECKSUM_MISMATCH");
    }
    return {
      objectKey: input.objectKey,
      sizeBytes: input.body.byteLength,
      checksum: input.checksum,
    };
  }

  async createDownloadUrl(
    objectKey: string,
    expiresInSeconds: number,
    signal?: AbortSignal,
  ): Promise<{ url: string; expiresAt: string }> {
    if (expiresInSeconds <= 0 || expiresInSeconds > 900) throw new Error("INVALID_INPUT");
    const objectPath = this.objectPath(objectKey);
    const response = await fetch(this.endpoint(objectPath.replace("/object/", "/object/sign/")), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.serviceRoleKey}`,
        apikey: this.config.serviceRoleKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
      signal: this.signal(signal),
    });
    if (!response.ok) throw new Error("STORAGE_SIGN_FAILED");
    const raw = await readBoundedText(response, 64 * 1024, "STORAGE_SIGN_FAILED");
    let body: { signedURL?: string };
    try {
      body = JSON.parse(raw) as { signedURL?: string };
    } catch {
      throw new Error("STORAGE_SIGN_FAILED");
    }
    if (!body.signedURL) throw new Error("STORAGE_SIGN_FAILED");
    safeSignedPath(body.signedURL, objectPath.replace("/object/", "/object/sign/"));
    return {
      url: `${this.config.url.replace(/\/$/, "")}/storage/v1${body.signedURL}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async delete(objectKey: string, signal?: AbortSignal): Promise<void> {
    this.objectPath(objectKey);
    const response = await fetch(
      this.endpoint(`/object/remove/${encodeURIComponent(this.config.bucket)}`),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.serviceRoleKey}`,
          apikey: this.config.serviceRoleKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefixes: [objectKey] }),
        signal: this.signal(signal),
      },
    );
    if (!response.ok && response.status !== 404) throw new Error("STORAGE_DELETE_FAILED");
  }

  async list(prefix: string, signal?: AbortSignal): Promise<ListedObject[]> {
    const response = await fetch(
      this.endpoint(`/object/list/${encodeURIComponent(this.config.bucket)}`),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.serviceRoleKey}`,
          apikey: this.config.serviceRoleKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefix, limit: 1_000, offset: 0 }),
        signal: this.signal(signal),
      },
    );
    if (!response.ok) throw new Error("STORAGE_LIST_FAILED");
    const raw = await readBoundedText(response, 2 * 1024 * 1024, "STORAGE_LIST_FAILED");
    const body = JSON.parse(raw) as Array<{ name?: string; created_at?: string }>;
    return body
      .filter(
        (item): item is { name: string; created_at?: string } => typeof item.name === "string",
      )
      .map((item) => ({ name: item.name, createdAt: item.created_at }));
  }
}
