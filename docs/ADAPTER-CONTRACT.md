# GitLeap Adapter Contract

## 1. Purpose

Adapters isolate external systems from the GitLeap processing module. They translate provider behavior into narrow TypeScript contracts without leaking provider-specific details into transport or state-machine code.

## 2. Contract Rules

- Adapter methods are asynchronous and cancellation-aware.
- Inputs and outputs use validated domain types.
- Credentials are resolved inside the adapter and never placed in queue payloads.
- Adapters return typed error classes with retryability and safe public codes.
- Adapter methods must be idempotent where an operation can be retried.
- Capability limitations are explicit.
- Adapter implementations must not execute untrusted repository code.

## 3. Shared Types

```ts
export type SourceIdentity = {
  provider: "github";
  owner: string;
  repository: string;
  commit: string;
};

export type ProcessingContext = {
  jobId: string;
  attempt: number;
  stage: string;
  inputDigest: string;
  leaseToken: string;
  signal: AbortSignal;
  pipelineVersion: string;
  budget: {
    deadline: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxCostUsd?: number;
    pricingVersion?: string;
  };
};

export type AdapterError = {
  code:
    | "AUTHENTICATION_FAILED"
    | "NOT_FOUND"
    | "RATE_LIMITED"
    | "INVALID_INPUT"
    | "UNSUPPORTED_PROVIDER"
    | "SIZE_LIMIT"
    | "TIMEOUT"
    | "UPSTREAM_FAILURE"
    | "POLICY_REJECTED";
  retryable: boolean;
  retryAfterMs?: number;
  safeMessage: string;
};

export type Capability =
  | "public-source"
  | "private-source"
  | "commit-fetch"
  | "streaming-fetch"
  | "static-index"
  | "model-synthesis"
  | "artifact-write"
  | "signed-download";
```

## 3.1 Current MVP Capability Map

The MVP uses narrow module functions rather than a generic runtime adapter
registry. This table is the authoritative capability declaration for the
current implementation and makes deferred expansion visible.

| Boundary | Proven capabilities | Explicitly unavailable in MVP |
| --- | --- | --- |
| GitHub source | public-source, commit-fetch, streaming-fetch | private-source, additional providers |
| Static indexer | static-index for the bounded lexical TypeScript/JavaScript/JSON/Markdown set | broad parser coverage, repository execution |
| Model | model-synthesis through one configured HTTPS provider or explicitly enabled test baseline | multiple providers, production baseline compiler |
| Artifact storage | artifact-write, signed-download, checksum and expiry enforcement through private Supabase Storage | public buckets, client-side storage authorization |
| Job and queue | durable create-or-get, lease/fencing, outbox publication, retry and recovery | Redis as source of truth |

The absence of a generic `getCapabilities()` method is deliberate for the MVP:
adding an interface with one implementation would add indirection without
improving isolation. A new provider or parser must add a concrete adapter,
capability declaration, contract tests, and an ADR before entering the runtime.

## 4. Source Adapter

```ts
export interface SourceAdapter {
  getCapabilities(): Promise<Capability[]>;
  normalize(
    input: { url: string; revision: string },
    context: Pick<ProcessingContext, "signal">,
  ): Promise<SourceIdentity>;
  fetchArchive(
    source: SourceIdentity,
    context: ProcessingContext,
  ): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentLength?: number;
    checksum?: string;
  }>;
}
```

### Source requirements

- accept only configured provider hosts
- normalize URL and repository names
- resolve branches/tags to a commit before processing
- validate redirect targets
- block loopback, private-network, link-local, and metadata-service destinations
- enforce compressed and expanded limits while reading
- reject traversal paths and unsafe archive entries
- never run repository scripts or package installation

## 5. Index Adapter

```ts
export interface IndexAdapter {
  getCapabilities(): Promise<Capability[]>;
  index(
    input: {
      source: SourceIdentity;
      files: AsyncIterable<{ path: string; bytes: Uint8Array }>;
      ignoreRules: string[];
    },
    context: ProcessingContext,
  ): Promise<RepositoryIndex>;
}
```

`RepositoryIndex` must preserve source paths and locations for evidence. It may contain files, languages, symbols, imports, exports, entry points, tests, configuration files, and relationships.

## 6. Model Adapter

```ts
export interface ModelAdapter {
  getCapabilities(): Promise<Capability[]>;
  synthesize(
    input: {
      slice: SemanticSlice;
      outputSchemaVersion: string;
      evidence: SourceEvidence[];
    },
    context: ProcessingContext,
  ): Promise<SkillCandidate>;
}
```

### Model requirements

- receive bounded context only
- delimit repository text as untrusted data
- use a schema-constrained response
- enforce token, time, and cost budgets
- record provider/model/version metadata without storing secrets
- define retention and deletion behavior
- reject output with unsupported claims or missing evidence

## 7. Artifact Adapter

```ts
export interface ArtifactAdapter {
  getCapabilities(): Promise<Capability[]>;
  put(input: {
    objectKey: string;
    body: ReadableStream<Uint8Array>;
    contentType: "application/gzip";
    checksum: string;
    metadata: Record<string, string>;
    context: ProcessingContext;
  }): Promise<{ objectKey: string; sizeBytes: number; checksum: string }>;
  createDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }>;
  delete(input: { objectKey: string }): Promise<void>;
}
```

`put` is immutable: an existing object key may be reused only when its checksum and size match; a mismatch is a non-retryable policy error. The caller must supply the job stage, input digest, and lease token in its `ProcessingContext`; implementations reject writes for stale fencing tokens. `createDownloadUrl` is called only after the repository has authorized the caller and verified the artifact is available and unexpired.

The first implementation should use a private Supabase Storage bucket. Object keys must be opaque or content-addressed, and download authorization must happen before issuing a signed URL.

## 8. Job and Outbox Adapters

```ts
export interface JobStore {
  createOrGet(input: CreateJobInput): Promise<JobRecord>;
  claim(input: { jobId: string; workerId: string }): Promise<JobLease | null>;
  transition(input: StateTransition): Promise<JobRecord>;
  appendStageResult(input: StageResult): Promise<void>;
  recordArtifact(input: ArtifactRecord): Promise<void>;
}

export interface QueueAdapter {
  publish(input: { outboxId: string; jobId: string; version: number }): Promise<void>;
}
```

`createOrGet` must be backed by a database uniqueness constraint. Queue delivery must be recoverable when the database transaction succeeds but the initial publish fails.

## 9. Error Contract

Adapters must map provider failures into domain-safe errors:

| Error class | Retry |
| --- | --- |
| invalid input | no |
| unsupported provider | no |
| authentication failure | no, alert configuration |
| not found | no unless provider eventual consistency is known |
| rate limited | yes, after provider delay |
| timeout | bounded retry |
| transient upstream failure | bounded retry |
| policy or size rejection | no |

Raw upstream bodies, credentials, prompts, and stack traces must not cross the public contract.

## 10. Contract Tests

Every adapter implementation requires:

- capability declaration test
- happy-path contract test
- invalid-input test
- retry classification test
- timeout/cancellation test
- idempotency or duplicate-call test
- secret/log redaction test
- ownership test where the adapter accesses user-owned resources
- resource-limit test for source and artifact adapters

## 11. Certification Checklist

- [x] No credentials in serialized job data.
- [x] Provider URLs and redirects are validated.
- [x] All external calls have bounded timeouts.
- [x] Retryability is explicit at the processing boundary.
- [x] Duplicate calls are safe through durable identity, outbox IDs, and model idempotency keys.
- [x] Capability gaps are visible in the MVP capability map above.
- [x] Logs and public errors use safe codes rather than source, prompts, or credentials.
- [x] Source and artifact limits are enforced.
- [x] Contract and regression tests pass locally.
- [x] Failure behavior is documented in `TA.md` and `ARCHITECTURE.md`.

Credentialed Supabase private-bucket behavior, a real model-provider run,
hosted dashboards, and browser/terminal manual acceptance remain release
environment checks; local contract doubles do not certify those external
boundaries.
