# ADR-0005: Authenticated Transport and Public Status Contract

- Status: Accepted for implementation
- Date: 2026-08-14
- Depends on: ADR-0001, ADR-0003
- Implements: MVP submit, status, cancellation decision, and authorized download request

## Context

The current Hono/tRPC transport has public and protected procedures but no processing resource ownership. Internal stage names and upstream errors must not become an unstable public contract.

## Decision

Expose three protected commands/queries:

```text
submitProcessing(input) -> job submission
getProcessingStatus(jobId) -> public status
getArtifactDownload(jobId) -> short-lived signed URL
```

Use this public state projection:

```text
queued | running | ready | failed | cancelled | expired
```

Each operation resolves the server-side session and authorizes an explicit `JobAccess` grant. `owner` may submit, cancel, and download; `reader` may status and download; no grant is access. Cancellation is mandatory in V1: queued jobs use an owner-checked terminal CAS because no worker lease exists; claimed and processing jobs record `cancel_requested` with a CAS, send `AbortSignal` to the active stage, and project `cancelled` after worker observation. A cancelled job cannot transition to `ready`.

## Implementation

- Keep route/procedure handlers thin.
- Validate input with shared Zod schemas.
- Never accept a user ID from the client as authority.
- Map internal failures to safe stable error codes.
- Apply rate limits before expensive job creation.
- Add CSRF review for cookie-authenticated mutations.
- Add ownership tests for every job and artifact operation.

## Acceptance Criteria

- [x] Unauthenticated submission is rejected.
- [x] A user cannot read, cancel, or download another user's job without a grant.
- [x] Public responses reveal no source, credentials, prompts, or stack traces.
- [x] Status remains stable while internal stages evolve.
- [x] Signed URL issuance requires an owner or reader grant; cancellation requires owner.
- [x] Browser disconnect does not lose the job.
- [x] Public status maps internal `claimed`, `processing`, and retry states to `running` without exposing internals.
- [x] Cancellation has a race test proving no ready publication after a successful cancellation CAS.

## Consequences

Polling is deliberately boring and reliable. A later streaming adapter can project the same public state without changing authorization or persistence.

## Rejected Alternatives

- Public job IDs as authorization: enumerable or leaked identifiers would expose artifacts.
- Returning every internal stage: creates a compatibility burden and leaks implementation detail.
- WebSocket-first API: adds connection lifecycle complexity before the state contract is proven.
