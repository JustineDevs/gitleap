# GitLeap Roadmap

## Product Direction

GitLeap evolves from a safe repository inventory and pack compiler into a trusted platform for reusable engineering capabilities. Each phase must improve usefulness without weakening provenance, authorization, or source isolation.

## Phase Overview

| Phase | Focus                   | Exit signal                                                                   |
| ----- | ----------------------- | ----------------------------------------------------------------------------- |
| v0.1  | CLI product surface     | authenticated submit/status/cancel/download flow is usable                    |
| V1    | MVP processing kernel   | one public repository produces an authorized validated pack                   |
| V1.1  | Developer experience    | users can understand, inspect, and reuse results quickly                      |
| V1.2  | Operational reliability | retries, recovery, quotas, and observability are dependable                   |
| V2    | Coverage expansion      | more source providers, languages, and capability types work under contracts   |
| V3    | Platform layer          | teams, automation, cataloging, and enterprise controls are justified by usage |

## v0.1: CLI Product Surface

The current CLI package release is `0.1.0`. It is the first client for the V1
contract, not a separate processing architecture.

### Deliverables

- login and session persistence
- public GitHub submission with an explicit revision
- status polling and cancellation
- explicit authorized artifact download
- interactive OpenTUI console for the same flow

### Exit Criteria

- CLI commands and public status states match the server contract
- download remains explicit and reports checksum and expiry
- non-interactive invocation does not block on terminal input

## V1: MVP Kernel

### Goal

Prove the end-to-end processing contract safely.

### Deliverables

- authenticated submission
- public GitHub commit source
- durable jobs and outbox
- Redis/BullMQ worker path
- static inventory and structural index
- bounded model synthesis
- manifest, provenance, and archive compiler
- private Supabase Storage artifact
- polling and authorized download
- first-class TypeScript/Bun CLI contract from v0.1
- security and recovery tests

### Exit Criteria

- repeatable fixture processing
- duplicate suppression
- worker recovery
- no arbitrary source execution
- artifact authorization
- documented cost and size ceilings

## V1.1: Developer Experience

### Goal

Make output understandable and useful without adding platform complexity.

### Deliverables

- Fumadocs guides and generated pack documentation
- source evidence navigation
- clearer failure messages
- local pack validation command
- richer inspection and evidence navigation after the CLI and polling contract stabilize
- Changesets and release notes

### Exit Criteria

- new user completes the first pack without private support
- generated skills include actionable setup and validation
- docs and CLI agree with the same contract

## V1.2: Operational Flows

### Goal

Make processing predictable under retries, load, and partial failure.

The MVP hardening pass delivers the V1.2 prerequisites that protect the first
release: bounded retries, durable recovery, per-user submission quota, artifact
retention, cancellation, tracing bootstrap, and security evidence. The remaining
V1.2 work below is operational productization, not a prerequisite to the V1
processing contract.

### Deliverables

- queue backpressure
- per-user and per-repository quotas
- model and storage usage metering
- stage-level metrics and traces
- automated outbox recovery
- artifact retention cleanup
- cancellation and retry controls
- alerting and incident runbook

### Exit Criteria

- known recovery time for worker and storage failures
- bounded cost per job
- no silent state divergence
- operational dashboards show queue, stage, and artifact health

## V2: Coverage Expansion

### Goal

Expand usefulness only where adapter and parser contracts remain honest.

### Deliverables

- additional Git hosting providers
- private repository support with scoped credentials
- more TypeScript/JavaScript ecosystem patterns
- selected additional language parsers
- improved semantic graph and retrieval
- multiple model providers behind one model contract
- optional SSE progress

### Exit Criteria

- each new provider passes source adapter contract tests
- each parser preserves source evidence
- private credentials never enter logs or artifacts
- model provider behavior is observable and budgeted

## V3: Platform Layer

### Goal

Support teams and automation only after single-user workflows prove demand.

### Deliverables

- workspaces and project ownership
- shared artifact access grants
- API tokens and CLI automation
- catalog of approved skills
- signed pack releases
- policy and compliance controls
- organization-level retention and usage budgets

### Exit Criteria

- authorization model is tenant-safe
- audit trail covers every access path
- policy enforcement is tested
- platform cost is measurable by workspace

## Milestones

### Milestone 1: Contract lock

Job identity, state, artifact, adapter, and security contracts agree.

### Milestone 2: Safe fixture

A fixed public repository produces a deterministic inventory and archive.

### Milestone 3: Real synthesis

One model adapter produces evidence-backed skills under a fixed budget.

### Milestone 4: Operational proof

Retries, recovery, quotas, traces, and cleanup work under test.

### Milestone 5: Controlled expansion

The next provider or language is added only after contract evidence justifies it.

## Key Metrics

- time to inventory
- time to first usable skill
- successful job rate
- duplicate suppression rate
- artifact validation failure rate
- source evidence coverage
- cost per successful pack
- retry and recovery rate
- secret/policy rejection rate
- user usefulness score

## Strategic Rule

Do not expand the platform because an integration is technically possible. Expand when the current phase has measurable reliability and users encounter a documented limitation that the next phase directly addresses.
