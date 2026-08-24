# GitLeap Architecture Gate

## Decision

Build GitLeap as a TypeScript-first asynchronous repository-processing compiler. Keep `apps/server` as thin Hono/tRPC ingress and place identity, durable state, orchestration, retries, and public status in one deep processing module. Use Supabase Postgres through Prisma for durable truth, BullMQ over Redis/Upstash Redis for the first queue path, Supabase Storage for private immutable artifacts, and `apps/fumadocs` for canonical documentation.

The first release accepts authenticated requests for public GitHub repositories at immutable commits. It performs static analysis without executing repository code, generates evidence-backed skills, validates them, and exposes an ownership-checked download.

## Status

`MVP-local-implementation-verified; hosted validation pending`

The current repository has the web client, Hono server, Better Auth, Prisma processing models, environment validation, tracing, BullMQ/Redis outbox workers, bounded GitHub source ingestion, deterministic inventory and architecture-map generation, bounded synthesis, deterministic compilation, private artifact storage, and Fumadocs.

## Evidence

- `apps/server/src/index.ts` mounts CORS, Better Auth, tRPC, health, and tracing.
- `packages/api/src/context.ts` resolves sessions server-side.
- `packages/api/src/index.ts` contains public and protected procedures.
- `packages/db/prisma/schema/processing.prisma` contains durable processing models alongside the authentication schema.
- `apps/server/src/worker.ts` is a separate worker entrypoint and is not imported by HTTP startup.
- `apps/server/src/lib/rate-limit.ts` is mounted on auth and tRPC routes.
- `apps/server/src/processing/indexer.ts` owns the deterministic MVP `v1-lexical` parser and architecture-map contract; Tree-sitter remains a V2 expansion.
- `README.md` is the product target and data-flow narrative. The current
  implementation boundary is stated explicitly in `docs/MVP.md`, this
  architecture gate, and the ADR set. Tree-sitter, WebSockets, the README's
  `gitleap.com` URL-transformation entrypoint,
  and hosted onboarding are external or future boundaries and are not shipped
  by this repository.

## User and Workload Assumptions

- users are authenticated developers or AI clients
- public GitHub repositories are the only first-release source
- revisions resolve to immutable commit SHAs before processing
- repository contents are hostile input and may be malformed or oversized
- jobs are asynchronous and may outlive the browser session
- duplicate submissions and worker restarts are normal operational events
- CPU, memory, archive size, file count, model tokens, retries, and storage are bounded

## System Boundaries

| Subsystem | Owns | Excludes |
| --- | --- | --- |
| Web/CLI | user interaction and status display | authorization decisions and state mutation rules |
| Hono/tRPC | transport, session context, input shape | queue, retries, and stage orchestration |
| Processing module | identity, state machine, orchestration, public projection | vendor-specific protocols |
| Job store | durable records, constraints, leases, transitions | prompts and provider HTTP |
| Source adapter | URL normalization and bounded source fetch | code execution |
| Indexer | inventory, syntax, symbols, relationships | model claims |
| Model adapter | bounded structured synthesis | persistence and user authorization |
| Compiler | skills, manifest, provenance, archive, checksum | job ownership |
| Artifact store | private objects and signed URLs | permission policy |

## Target Flow

```text
submit URL + revision
  -> authenticate, authorize, rate-limit
  -> normalize and resolve commit
  -> atomic create-or-get canonical job
  -> durable outbox publication
  -> worker lease
  -> bounded archive fetch
  -> inventory and static index
  -> semantic slicing
  -> schema-constrained model synthesis
  -> validation and secret scanning
  -> deterministic compilation
  -> private artifact write
  -> ready state and signed download URL
```

## State and Idempotency

Public state:

```text
queued -> running -> ready
queued/running -> failed
queued/running -> cancelled
ready -> expired
```

Canonical identity:

```text
provider + canonical repository + resolved commit SHA
         + pipeline version + configuration digest
```

Required controls:

- database uniqueness constraint on canonical identity
- Redis used only for coordination and acceleration
- queue payloads contain `jobId`, not credentials or source archives
- stage results keyed by job, stage, version, and input digest
- worker lease, heartbeat, attempt count, and fencing token
- compare-and-set state transitions with monotonic progress sequence
- `ready` only after immutable artifact and checksum are durable
- outbox or recovery sweeper for database/queue divergence

## Data Model

The first processing migration requires:

| Record | Purpose |
| --- | --- |
| `ProcessingJob` | canonical identity, state, attempt, lease, timestamps |
| `JobAccess` | explicit user authorization for a shared job |
| `JobStage` | stage state, input/output digest, timing, safe failure |
| `Artifact` | private storage key, checksum, size, provenance, expiry |
| `OutboxEvent` | recoverable queue publication |
| `UsageRecord` | model, token, compute, storage, and cost accounting |
| `AuditEvent` | creation, access, cancellation, failure, and download history |

Supabase Postgres is the source of truth. Supabase Storage holds private immutable archives. Redis/Upstash Redis holds queue and short-lived coordination data.

## Stack Tradeoffs

| Choice | Why | Cost |
| --- | --- | --- |
| TypeScript + Bun | matches the repository and primary language | production compatibility must be verified |
| Hono + tRPC | already present and keeps transport thin | not a workflow engine |
| Prisma + Supabase Postgres | typed schema, constraints, managed database | migrations and retention require discipline |
| BullMQ + Redis/Upstash | existing code and simple first queue | less durable workflow modeling than Temporal |
| Deterministic v1-lexical indexing | structure before model context | parser coverage and maintenance |
| Supabase Storage | same platform as database | private bucket and signed URL policy required |
| Fumadocs | already present and canonical | keep one documentation workspace |
| Polling first | smallest status contract | less immediate UX than streaming |

## Rejected Alternatives

- Temporal in V1: defer until compensation and long-running workflow complexity justify it.
- RabbitMQ/NATS in V1: BullMQ matches current code and Redis requirements.
- Redis-only idempotency: cannot replace durable database uniqueness.
- WebSocket-first progress: prove polling and state correctness first.
- Kubernetes-first deployment: no current load evidence requires it.
- Repository code execution: unacceptable trust and supply-chain risk.

## Auth, Security, and Operations

- server-side Better Auth session is authoritative
- every job and artifact has an owner
- status, cancellation, and downloads require ownership or explicit share grants
- signed URLs are short-lived and issued only after authorization
- provider hosts and redirects are allowlisted
- loopback, private, link-local, and metadata-service targets are blocked
- archive traversal, zip bombs, file count, size, memory, and time limits are enforced
- repository scripts, package managers, build hooks, and generated code are never executed
- source and prompts are not placed in logs or public status
- generated output is scanned for secrets before publication
- rate limits, quotas, token budgets, bounded retries, lease recovery, cleanup, and structured traces are required

## Phased Delivery

1. **Contract lock:** complete. Identity, states, artifacts, ownership, errors, and adapter contracts are versioned in the ADRs.
2. **Durable kernel:** complete. Schema, outbox, create-or-get submission, status, leases, fencing, and transitions are implemented.
3. **Safe processing:** complete for the MVP `v1-lexical` parser set. GitHub source, limits, inventory, architecture map, and deterministic baseline pack are implemented.
4. **Model synthesis:** complete for one bounded adapter. Slices, budgets, evidence, validation, redaction, and secret scanning are implemented.
5. **Delivery proof:** complete locally. Private storage contract, signed downloads, web polling, and recovery/security tests are verified.
6. **Operational hardening:** MVP prerequisites are complete. V1.2 productization remains backpressure, dashboards, alerting, and incident operations.

## Remaining Expansion Work

1. Run a live Supabase contract check when deployment credentials are available; local tests use a controlled HTTP contract double.
2. Add Tree-sitter as a versioned V2 parser contract if the lexical MVP index becomes insufficient.
3. Add queue backpressure, operational dashboards, alerts, and incident runbooks for V1.2.
4. Add additional providers, private repositories, and streaming only through ADR-0012 gates; the v0.1 CLI is already implemented.

## Top Risks

| Risk | Mitigation |
| --- | --- |
| malicious repository input | no execution, egress controls, archive/resource limits |
| duplicate jobs | database uniqueness and deterministic stage results |
| stale workers | leases, heartbeats, fencing, compare-and-set transitions |
| model hallucination | evidence, schemas, static validation, explicit limits |
| secret leakage | scanning, redaction, private storage, publication rejection |
| cost exhaustion | quotas, token budgets, cache, metering |
| storage/database divergence | ready-after-write rule and reconciliation |

## Gate Result

This architecture is the current implementation gate. Any expansion beyond the verified MVP must add an ADR, tests, and an updated evidence section before it is described as shipped.

**Next allowed trigger:** `$sage`
