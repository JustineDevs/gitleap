# ADR-0012: Roadmap Expansion Gates

- Status: Accepted as a governance rule
- Date: 2026-08-14
- Depends on: ADR-0001 and ADR-0011
- Implements: V1.1, V1.2, V2, and V3 roadmap sequencing

## Context

GitLeap has attractive expansion paths, but each one widens trust, cost, authorization, or compatibility surfaces. Expansion must follow evidence rather than technical possibility.

## Decision

### V1.1: Developer experience

Allowed after V1 kernel exit criteria:

- Fumadocs guides and generated-pack documentation
- source evidence navigation
- local pack validation
- CLI authentication/download
- richer CLI inspection and evidence navigation
- Changesets and release notes

### V1.2: Operations

Allowed after repeatable fixture and recovery proof:

- backpressure
- quotas and usage metering
- stage metrics/traces
- automated outbox recovery
- retention cleanup
- cancellation and retry controls
- alerting and incident runbook

### V2: Coverage

Allowed only with adapter/parser contract tests:

- additional hosting providers
- private repositories with scoped credentials
- additional languages
- improved retrieval and semantic graph
- multiple model providers
- optional SSE progress

### V3: Platform

Allowed only with tenant-safe authorization and audit proof:

- workspaces and sharing
- API tokens and automation
- approved skill catalog
- signed pack releases
- policy/compliance controls

## Acceptance Criteria

These criteria are release gates for future expansions, not MVP completion
criteria. They remain unchecked until the corresponding V1.1, V1.2, V2, or V3
surface is actually proposed and verified.

- [ ] Each expansion names the user limitation it addresses.
- [ ] The current phase exit criteria are green.
- [ ] New adapters pass contract tests.
- [ ] New providers do not leak credentials or source.
- [ ] New authorization surfaces include audit and ownership tests.
- [ ] Cost and capacity impact is measured before rollout.

## Consequences

The roadmap is slower but reversible. No new provider, language, queue, model, or client surface becomes a default dependency without evidence.

## Rejected Alternatives

- implementing all roadmap phases together: prevents reliable attribution and increases blast radius.
- adding integrations because they are starred or available: candidate availability is not product evidence.
- treating documentation as a substitute for exit criteria: docs describe the contract; tests prove it.
