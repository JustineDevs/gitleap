const API_HOST = "api.github.com";
const MAX_RESPONSE_BYTES = 1024 * 1024;

export function githubCommitUrl(owner: string, repository: string, revision: string): string {
  return `https://${API_HOST}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(revision)}`;
}

export function commitShaFromResponse(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("GITHUB_REVISION_NOT_FOUND");
  const sha = (value as { sha?: unknown }).sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha))
    throw new Error("GITHUB_REVISION_NOT_FOUND");
  return sha.toLowerCase();
}

export async function resolveGithubRevision(input: {
  owner: string;
  repository: string;
  revision: string;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(githubCommitUrl(input.owner, input.repository, input.revision), {
    redirect: "error",
    signal: input.signal ?? AbortSignal.timeout(10_000),
    headers: { "user-agent": "gitleap/1" },
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("GITHUB_REVISION_NOT_FOUND");
    if (response.status === 403 || response.status === 429) throw new Error("GITHUB_RATE_LIMITED");
    throw new Error("GITHUB_UPSTREAM_FAILURE");
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error("GITHUB_UPSTREAM_FAILURE");
  const body = await readBoundedText(response);
  try {
    return commitShaFromResponse(JSON.parse(body));
  } catch {
    throw new Error("GITHUB_REVISION_NOT_FOUND");
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel("GITHUB_UPSTREAM_FAILURE");
      throw new Error("GITHUB_UPSTREAM_FAILURE");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
