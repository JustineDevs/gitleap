# ADR-0004: Transactional Outbox, BullMQ, and Worker Leases

- Status: Accepted for implementation
- Date: 2026-08-14
- Depends on: ADR-0003
- Implements: MVP queue, retries, worker recovery, and V1.2 reliability foundation

## Context

Writing a job to Postgres and publishing to Redis are separate operations. A worker can crash after claiming work, and a queue message can be delivered more than once.

## Decision

Use BullMQ over Redis or Upstash Redis for the first queue path. Create the job and an outbox event in one database transaction. A publisher retries unsent outbox events. Workers claim jobs with a lease and fencing token, heartbeat while active, and write idempotent stage results.

## State Rules

```text
queued -> claimed -> processing -> ready
queued -> failed_retryable -> queued
queued -> cancelled (safe pre-lease cancellation)
claimed/processing -> cancel_requested -> cancelled
processing -> failed_terminal
ready -> expired
```

- A lease expiry makes a job eligible for recovery.
- A queued job has no lease or external side effect; it may transition directly to `cancelled` through an owner-checked CAS. Running jobs must use `cancel_requested` and worker observation.
- A stale fencing token cannot commit a newer transition.
- Every worker transition and heartbeat is a CAS on job state version and lease token; zero updated rows means stale and the worker stops.
- Outbox events are uniquely keyed by `jobId:eventType:stateVersion`; BullMQ uses that value as `jobId`.
- Stage effects are unique by `(jobId, stageName, inputDigest)`. Artifact publication claims `READY` with the lease/state/cancellation CAS before inserting or updating the immutable artifact row in the same transaction, so cancellation cannot leave an artifact row for a non-ready job.
- Retry count and backoff are bounded.
- Queue delivery is at-least-once; stage effects must be idempotent.
- Published event IDs remain in a durable consumer inbox for the retention window; BullMQ `jobId` is transport deduplication, not the only duplicate-delivery guarantee.
- Canonical outbox event IDs use `jobId:eventType:stateVersion` with literal colons; BullMQ uses this value as its deduplication job ID.

## Implementation

- Add outbox publisher and recovery sweeper processes.
- Add worker startup separate from HTTP startup.
- Add `workerId`, `leaseExpiresAt`, `heartbeatAt`, `attempt`, and `stateVersion`.
- Use deterministic stage keys for retries.
- Redact job data from queue logs.
- Close workers and queues on shutdown.

## Acceptance Criteria

- [x] Database commit followed by publish failure is recovered.
- [x] Worker crash causes safe lease expiry and requeue.
- [x] Duplicate delivery does not duplicate artifacts or model work.
- [x] Stale worker cannot overwrite a newer state.
- [x] Retryable and terminal failures are classified consistently.
- [x] Queue and worker health are observable.
- [x] Cancellation cannot be followed by a `ready` publication.

## Consequences

The system is eventually consistent between Postgres and Redis, but has a repair path. BullMQ is sufficient for V1; Temporal remains a later option if compensation and long-running workflow complexity prove necessary.

## Rejected Alternatives

- Publish before persistence: creates orphan queue work.
- Exactly-once delivery assumption: not credible across process and network failures.
- Starting workers by importing them into HTTP: couples scaling and shutdown incorrectly.
