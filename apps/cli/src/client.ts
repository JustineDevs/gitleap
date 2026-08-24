import { createHash } from "node:crypto";

const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

export type ClientOptions = { serverUrl: string; sessionCookie?: string };

export async function fetchVerifiedArtifact(artifact: {
  url: string;
  checksum: string;
}): Promise<Uint8Array> {
  const response = await fetch(artifact.url);
  if (!response.ok || !response.body)
    throw new Error(`Artifact download failed (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_ARTIFACT_BYTES) {
      await reader.cancel("ARTIFACT_TOO_LARGE");
      throw new Error("Artifact exceeds the supported size limit");
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const checksum = createHash("sha256").update(body).digest("hex");
  if (checksum !== artifact.checksum.toLowerCase()) throw new Error("Artifact checksum mismatch");
  return body;
}

export type ProcessingDetails = {
  jobId: string;
  status: string;
  version: number;
  updatedAt: string;
  expiresAt: string | null;
  progress: {
    percent: number;
    completed: number;
    total: number;
    stages: Array<{
      name: string;
      status: string;
      startedAt: string | null;
      finishedAt: string | null;
      errorCode: string | null;
    }>;
  };
  source: {
    provider: string;
    owner: string;
    repository: string;
    commitSha: string;
    pipelineVersion: string;
    configurationHash: string;
  };
  manifest: {
    version: number;
    skills: Array<{ id: string; name: string; description: string; schemaVersion: number }>;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    instructions?: string;
    triggers: string[];
    inputs: string[];
    outputs: string[];
    prerequisites: string[];
    limitations: string[];
    validation: string[];
    evidence: Array<{ path: string; startLine?: number; endLine?: number; reason: string }>;
  }>;
  architectureMap: {
    version: number;
    parser: string;
    files: unknown[];
    edges: unknown[];
    excluded: unknown[];
  };
  preview: {
    files: unknown[];
    edges: unknown[];
    skills: Array<{ id: string; name: string; description: string; evidence: unknown[] }>;
  };
};

type TrpcResult<T> = { result?: { data?: T }; error?: { message?: string } };

export class GitLeapClient {
  private readonly serverUrl: string;
  private sessionCookie?: string;

  constructor(options: ClientOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, "");
    this.sessionCookie = options.sessionCookie;
  }

  get cookie(): string | undefined {
    return this.sessionCookie;
  }

  async signIn(email: string, password: string): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: this.serverUrl },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(`Authentication failed (${response.status})`);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Authentication succeeded but no session cookie was returned");
    this.sessionCookie = cookie;
  }

  async submit(input: {
    url: string;
    revision: string;
    includeTests?: boolean;
  }): Promise<{ jobId: string; status: string; reused: boolean }> {
    const body = await this.mutation<{ jobId: string; status: string; reused: boolean }>(
      "submitProcessing",
      {
        ...input,
        includeTests: input.includeTests ?? true,
      },
    );
    return body;
  }

  async status(
    jobId: string,
  ): Promise<{ jobId: string; status: string; version: number; expiresAt: string | null }> {
    return this.query("getProcessingStatus", { jobId });
  }

  async details(jobId: string): Promise<ProcessingDetails> {
    return this.query("getProcessingDetails", { jobId });
  }

  async cancel(jobId: string, expectedVersion: number): Promise<{ accepted: boolean }> {
    return this.mutation("cancelProcessing", { jobId, expectedVersion });
  }

  async download(jobId: string): Promise<{ url: string; checksum: string; expiresAt: string }> {
    return this.query("getArtifactDownload", { jobId });
  }

  private async mutation<T>(procedure: string, input: unknown): Promise<T> {
    return this.request<T>(`${this.serverUrl}/trpc/${procedure}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async query<T>(procedure: string, input: unknown): Promise<T> {
    return this.request<T>(
      `${this.serverUrl}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
      { method: "GET" },
    );
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (init.method === "POST") headers.set("x-gitleap-client", "cli");
    else headers.set("origin", this.serverUrl);
    if (this.sessionCookie) headers.set("cookie", this.sessionCookie);
    const response = await fetch(url, { ...init, headers });
    const body = (await response.json()) as TrpcResult<T>;
    if (!response.ok || body.error || body.result?.data === undefined)
      throw new Error(body.error?.message ?? `GitLeap request failed (${response.status})`);
    return body.result.data;
  }
}
