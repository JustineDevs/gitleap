# ADR-0001: MVP Scope and Release Boundary

- Status: Accepted for contract refinement
- Date: 2026-08-14
- Owners: GitLeap maintainers
- Depends on: `docs/ARCHITECTURE-BRIEF.md`
- Implements: MVP scope and V1 roadmap exit criteria

## Context

GitLeap can expand into private repositories, multiple providers, multiple models, streaming progress, and a public catalog. Building those surfaces before the processing kernel is reliable would multiply security and operational risk. The v0.1 CLI is the first client for proving the V1 kernel; its interactive console is included in that client surface.

## Decision

The MVP supports only:

- authenticated users
- public GitHub repositories
- revisions resolved to immutable commit SHAs
- durable asynchronous jobs
- deterministic inventory and structural index
- one bounded model adapter
- validated private archive artifacts
- status polling
- ownership-checked downloads
- the v0.1 CLI client, including its OpenTUI interactive console

The MVP explicitly excludes private repositories, arbitrary code execution, multiple model providers, broad multi-language coverage, WebSocket progress, public marketplace features, and automatic production deployment of generated code. Rezi is not a renderer dependency.

## Implementation

1. Reject unsupported providers and private-source requests at validation.
2. Require a server-authoritative Better Auth session for submission and access.
3. Store the release scope and limits in the processing configuration version.
4. Add fixture-based acceptance tests before adding expansion features.

## Acceptance Criteria

- [x] A public GitHub fixture completes from submission to download.
- [x] Private or unsupported sources are rejected with safe error codes.
- [x] No MVP endpoint exposes expansion-only behavior.
- [x] V1 exit criteria are traceable to tests and operational checks.

## Consequences

The first release is smaller and safer. Users cannot process private repositories or receive live streaming progress yet. Expansion requires a new ADR and evidence from the current phase.

## Rejected Alternatives

- Building private repository support first: requires credential lifecycle and tenant policy before the kernel is proven.
- Supporting every parser immediately: broad coverage would weaken validation and evidence quality.
- WebSocket-first UX: would create a second state contract before polling is reliable.
