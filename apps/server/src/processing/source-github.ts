import { lookup } from "node:dns/promises";
import {
  commitShaFromResponse,
  githubCommitUrl as sharedGithubCommitUrl,
} from "@gitleap/api/github";

import { boundedSignal, PROCESSING_LIMITS, readBoundedText } from "./limits";

const ARCHIVE_HOST = "codeload.github.com";

export type GithubArchive = {
  sourceUrl: string;
  contentLength?: number;
  stream: ReadableStream<Uint8Array>;
};

export type ArchiveFile = { path: string; bytes: Uint8Array };

export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value.includes(":")) {
    const mappedIpv4 = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return isPrivateAddress(mappedIpv4);
    return (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("ff")
    );
  }
  const octets = value.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return true;
  const [a, b] = octets as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const records = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("UPSTREAM_TIMEOUT")), 10_000),
    ),
  ]);
  if (!records.length || records.some((record) => isPrivateAddress(record.address)))
    throw new Error("POLICY_REJECTED");
}

export function githubCommitUrl(owner: string, repository: string, revision: string): string {
  return sharedGithubCommitUrl(owner, repository, revision);
}

export function githubArchiveUrl(owner: string, repository: string, commitSha: string): string {
  return `https://${ARCHIVE_HOST}/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tar.gz/${encodeURIComponent(commitSha)}`;
}

export async function boundedFetch(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["api.github.com", ARCHIVE_HOST].includes(parsed.hostname))
    throw new Error("UNSUPPORTED_PROVIDER");
  await assertPublicHost(parsed.hostname);
  const response = await fetch(url, {
    redirect: "error",
    signal: boundedSignal(signal, 30_000),
    headers: { "user-agent": "gitleap/1" },
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "NOT_FOUND"
        : response.status === 429
          ? "RATE_LIMITED"
          : "UPSTREAM_FAILURE",
    );
  const size = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) throw new Error("SIZE_LIMIT");
  return response;
}

export async function fetchGithubArchive(input: {
  owner: string;
  repository: string;
  commitSha: string;
  signal: AbortSignal;
}): Promise<GithubArchive> {
  const sourceUrl = githubArchiveUrl(input.owner, input.repository, input.commitSha);
  const response = await boundedFetch(sourceUrl, input.signal, PROCESSING_LIMITS.compressedBytes);
  if (!response.body) throw new Error("UPSTREAM_FAILURE");
  let total = 0;
  const reader = response.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      total += value.byteLength;
      if (total > PROCESSING_LIMITS.compressedBytes) {
        await reader.cancel("SIZE_LIMIT");
        return controller.error(new Error("SIZE_LIMIT"));
      }
      controller.enqueue(value);
    },
  });
  return {
    sourceUrl,
    contentLength: Number(response.headers.get("content-length") ?? total) || undefined,
    stream: stream.pipeThrough(
      new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
    ),
  };
}

export async function resolveGithubRevision(input: {
  owner: string;
  repository: string;
  revision: string;
  signal: AbortSignal;
}): Promise<string> {
  const response = await boundedFetch(
    githubCommitUrl(input.owner, input.repository, input.revision),
    input.signal,
    1024 * 1024,
  );
  try {
    const body = JSON.parse(await readBoundedText(response, 1024 * 1024, "UPSTREAM_FAILURE")) as {
      sha?: string;
    };
    return commitShaFromResponse(body);
  } catch {
    throw new Error("UPSTREAM_FAILURE");
  }
}

function field(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder()
    .decode(bytes.subarray(start, start + length))
    .replace(/\0.*$/, "")
    .trim();
}

export async function readTarArchive(stream: ReadableStream<Uint8Array>): Promise<ArchiveFile[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let buffered = 0;
  let streamDone = false;
  let expanded = 0;
  const take = async (length: number): Promise<Uint8Array | null> => {
    while (buffered < length && !streamDone) {
      const next = await reader.read();
      if (next.done) {
        streamDone = true;
        break;
      }
      expanded += next.value.byteLength;
      if (expanded > PROCESSING_LIMITS.expandedBytes) throw new Error("SIZE_LIMIT");
      for (let offset = 0; offset < next.value.byteLength; offset += 1024 * 1024)
        chunks.push(next.value.slice(offset, offset + 1024 * 1024));
      buffered += next.value.byteLength;
    }
    if (buffered < length) return null;
    const result = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const chunk = chunks[0];
      if (!chunk) throw new Error("UPSTREAM_FAILURE");
      const amount = Math.min(chunk.byteLength, length - offset);
      result.set(chunk.subarray(0, amount), offset);
      offset += amount;
      buffered -= amount;
      if (amount === chunk.byteLength) chunks.shift();
      else chunks[0] = chunk.slice(amount);
    }
    return result;
  };
  const files: ArchiveFile[] = [];
  while (true) {
    const header = await take(512);
    if (!header) {
      if (expanded === 0) return [];
      throw new Error("UPSTREAM_FAILURE");
    }
    if (header.every((byte) => byte === 0)) break;
    const declaredChecksum = Number.parseInt(field(header, 148, 8) || "0", 8);
    const checksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (!Number.isFinite(declaredChecksum) || declaredChecksum !== checksum)
      throw new Error("POLICY_REJECTED");
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 155);
    const path = `${prefix ? `${prefix}/` : ""}${name}`.replaceAll("\\", "/");
    if (
      !path ||
      path.length > 255 ||
      path.startsWith("/") ||
      path.split("/").some((segment) => segment === ".." || segment === ".")
    )
      throw new Error("POLICY_REJECTED");
    const type = header[156];
    const size = Number.parseInt(field(header, 124, 12) || "0", 8);
    // GitHub archives may include POSIX/GNU metadata records; they are metadata,
    // not source files, and must be consumed without interpreting their values.
    if (
      type !== 0 &&
      type !== 48 &&
      type !== 5 &&
      type !== 53 &&
      type !== 55 &&
      type !== 103 &&
      type !== 120
    )
      throw new Error("POLICY_REJECTED");
    if (!Number.isFinite(size) || size < 0 || size > PROCESSING_LIMITS.fileBytes)
      throw new Error("SIZE_LIMIT");
    const content = await take(size);
    if (!content) throw new Error("UPSTREAM_FAILURE");
    const padding = (512 - (size % 512)) % 512;
    if (padding && !(await take(padding))) throw new Error("UPSTREAM_FAILURE");
    if (type === 0 || type === 48) {
      if (files.length + 1 > PROCESSING_LIMITS.fileCount) throw new Error("SIZE_LIMIT");
      files.push({ path, bytes: content });
    }
  }
  return files;
}
