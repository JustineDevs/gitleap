# ADR-0010: CLI-First Submission, Status Polling, and Download Experience

- Status: Accepted for MVP
- Date: 2026-08-14
- Depends on: ADR-0005, ADR-0009
- Implements: MVP CLI product proof and web parity contract

## Context

The processing kernel needs a thin, scriptable product surface before browser interaction adds presentation complexity. Real-time transport would create complexity before the durable status contract is stable.

## Decision

Use `apps/cli` as the first product client for:

1. authentication and session persistence
2. authenticated submission of URL and revision
3. job status polling
4. safe failure reporting
5. authorized artifact download

Use `apps/web` for the browser equivalent of the same contract. Poll using a bounded interval with backoff, stop polling on terminal states, and never expose raw internal errors. The v0.1 CLI also includes the current OpenTUI interactive console; it is a client presentation of this polling contract, not a separate transport.

## Implementation

- add route and form only after the protected procedures exist
- use existing tRPC and TanStack Query patterns
- show only the stable public states `queued`, `running`, `ready`, `failed`, `cancelled`, and `expired`
- preserve job identity across refreshes
- handle browser disconnect without cancelling the job
- link to Fumadocs guidance for limits and failure codes

## Acceptance Criteria

- [x] Authenticated user can submit a valid fixture.
- [x] Invalid input is shown without leaking internals.
- [x] Refresh preserves status lookup.
- [x] Terminal status stops polling.
- [x] Only authorized users receive a download action.
- [x] UI handles expired artifacts and failed jobs explicitly.

## Consequences

Polling adds small request traffic but keeps the client simple and resilient. SSE/WebSocket can be added as a projection later without changing the job state model.

## Rejected Alternatives

- client-side direct storage access: bypasses authorization policy.
- browser-owned processing state: loses state on disconnect and refresh.
- streaming-first: unnecessary complexity for MVP.
