# ADR-0011: MVP Hardening and Operational Proof

- Status: Required before MVP release
- Date: 2026-08-14
- Depends on: ADR-0004 through ADR-0010
- Implements: MVP ship checklist and V1.2 reliability foundation

## Context

The processing path now wires rate limiting, tracing bootstrap, queue publication, worker recovery, usage accounting, cleanup, and secret scanning. A successful happy path is still insufficient for a system processing hostile repositories and paid model calls, so this ADR defines the required proof rather than optional infrastructure.

## Decision

The MVP cannot be released until the following controls execute in the real processing path:

- request and expensive-operation rate limits
- user/repository/model/storage quotas
- secret scanning and redacted logging
- SSRF, archive traversal, and resource-limit tests
- worker startup, shutdown, lease recovery, and outbox recovery
- OpenTelemetry job and stage spans
- artifact cleanup and expiry
- typecheck, lint, unit, integration, security, and fixture smoke tests

## Verification Matrix

| Area | Required proof |
| --- | --- |
| Identity | concurrent duplicate submission test |
| Persistence | clean migration and state constraint test |
| Queue | publish failure and worker crash recovery test |
| Source | redirect, SSRF, traversal, size, and timeout tests |
| Index | deterministic fixture digest |
| Model | schema, budget, retry, and redaction tests |
| Artifact | private bucket, checksum, ownership, expiry test |
| Client | submit/status/download end-to-end smoke test |
| Operations | traces, safe events, limits, and cleanup test |

## Acceptance Criteria

- [x] One public fixture completes repeatedly.
- [x] Duplicate submissions do not duplicate billable work.
- [x] Worker restart does not lose a durable job.
- [x] No source code executes.
- [x] Secrets are blocked from artifacts and logs.
- [x] Artifact authorization and expiry work.
- [x] Every release check has fresh evidence in CI and the implementation ledger.
- [x] The server production image build blocker is resolved and verified in CI.

## Consequences

The MVP may take longer than the happy-path demo, but the release boundary protects users and operating cost. Operational helpers that are not used should be deleted rather than retained as misleading scaffolding.

## Rejected Alternatives

- declaring success from typecheck alone: does not test runtime, storage, queue, or security behavior.
- relying on manual operator memory: not repeatable or auditable.
- enabling production processing before limits exist: unsafe cost and resource exposure.
