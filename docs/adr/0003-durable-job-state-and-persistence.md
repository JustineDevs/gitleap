# ADR-0003: Durable Job State and Processing Persistence

- Status: Accepted for implementation
- Date: 2026-08-14
- Depends on: ADR-0002
- Implements: MVP durable job state, artifact records, audit, usage, and retention

## Context

Processing is durable across browser disconnects, worker restarts, queue outages, and artifact-storage retries. The Prisma schema stores processing records alongside the Better Auth models.

## Decision

Use Supabase Postgres as the source of truth through Prisma. Add these records:

| Record | Required data |
| --- | --- |
| `ProcessingJob` | canonical identity, public state, version, attempts, lease, timestamps |
| `JobAccess` | job, user, access role, granted/revoked timestamps |
| `SourceIdentity` | canonical provider/repository/commit/pipeline/options digest |
| `ConsumerInbox` | durable accepted outbox event IDs for duplicate delivery suppression |
| `JobStage` | job, stage, input/output digest, state, timing, safe error |
| `Artifact` | job, object key, checksum, size, provenance, expiry |
| `OutboxEvent` | event ID, job, payload version, publish attempts, published time |
| `UsageRecord` | owner, job, tokens, duration, storage, estimated cost |
| `AuditEvent` | actor, owner, job/artifact, action, safe metadata, time |

Database constraints own uniqueness, ownership relationships, state versioning, and artifact references.

## Implementation

1. Add Prisma models and indexes.
2. Add a migration and rollback notes.
3. Implement typed repositories rather than direct queries in route handlers.
4. Enforce state transitions through one repository/orchestrator path.
5. Add retention fields without deleting audit evidence accidentally.

## Acceptance Criteria

- [x] Job ownership is mandatory.
- [x] Every submission has exactly one access grant; shared jobs have one row per authorized user.
- [x] One active attempt per source identity is enforced by a partial unique constraint; terminal attempts remain historical.
- [x] Artifact cannot be `ready` without a durable job relation.
- [x] Stage results are addressable by stage and input digest.
- [x] State transition races are rejected or safely retried.
- [x] Migration and type generation pass in a clean database.

## Consequences

Postgres is the durable operational dependency. Redis outages may reduce throughput, but cannot corrupt identity or ownership. Schema changes must be reviewed as product-contract changes.

## Rejected Alternatives

- Redis as primary job state: insufficient durability and ownership semantics.
- Filesystem state: not safe across worker replicas or deployments.
- One JSON blob per job: weak querying, constraints, and recovery visibility.
