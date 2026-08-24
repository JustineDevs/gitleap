import { createHash } from "node:crypto";

export type SourceRequest = { url: string; revision: string };

export type SourceIdentity = {
  provider: "github";
  owner: string;
  repository: string;
  commitSha: string;
};

export type PipelineOptions = {
  includeTests: boolean;
  parserSet: string;
  skillLimit: number;
};

const SHA = /^[0-9a-f]{40}$/i;

export function normalizeGithubUrl(value: string): { owner: string; repository: string } {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("UNSUPPORTED_PROVIDER");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error("INVALID_INPUT");
  }
  const [owner, repository] = parts as [string, string];
  return {
    owner: owner.toLowerCase(),
    repository: repository.replace(/\.git$/i, "").toLowerCase(),
  };
}

export function assertCommitSha(value: string): string {
  if (!SHA.test(value)) throw new Error("INVALID_INPUT");
  return value.toLowerCase();
}

export function canonicalOptions(options: PipelineOptions): string {
  return JSON.stringify({
    includeTests: options.includeTests,
    parserSet: options.parserSet,
    skillLimit: options.skillLimit,
  });
}

export function canonicalIdentityHash(
  identity: SourceIdentity,
  pipelineVersion: string,
  options: PipelineOptions,
): string {
  const payload = [
    identity.provider,
    identity.owner.toLowerCase(),
    identity.repository.toLowerCase(),
    assertCommitSha(identity.commitSha),
    pipelineVersion,
    canonicalOptions(options),
  ].join("\n");
  return createHash("sha256").update(payload).digest("hex");
}
