# ADR-0002: Canonical Job Identity and Idempotency

- Status: Accepted for implementation
- Date: 2026-08-14
- Depends on: ADR-0001
- Implements: canonical source identity, duplicate suppression, cache correctness

## Context

Repository URLs can differ by scheme, casing, `.git` suffix, branch, tag, or query string while referring to the same source. Redis locks alone cannot guarantee durable uniqueness when requests race or workers restart.

## Decision

Use this canonical identity:

```text
provider
canonical owner/repository
resolved commit SHA
pipeline version
configuration digest
```

Persist a normalized identity and enforce a database uniqueness constraint on the active attempt. The job is shareable across users, but authorization is not: `JobAccess(jobId, userId)` is created in the same transaction as the submission. `createOrGet` returns an existing queued/processing job or ready artifact only after granting and auditing access. Failed, expired, or cancelled attempts are never reused; resubmission creates a new attempt for the same source identity.

## Implementation

- Normalize only allowlisted GitHub URL forms.
- Resolve branches and tags to a commit before job creation.
- Lowercase owner/repository where GitHub semantics permit it.
- Exclude credentials, raw query strings, and mutable labels from identity.
- Hash non-secret configuration that changes output.
- Use Redis only as a cache or short-lived coordination aid.
- Put `jobId` and processing version, not source content, in queue payloads.
- Keep owner out of the canonical key; owner identity belongs in `JobAccess`, not deduplication.

## Acceptance Criteria

- [x] Equivalent URLs produce one canonical key.
- [x] Mutable revisions resolve before job uniqueness is evaluated.
- [x] Concurrent submissions create one durable job.
- [x] A completed artifact is returned for an identical request.
- [x] Two users may share equivalent work without sharing authorization records.
- [x] Failed, expired, and cancelled attempts are not reused.
- [x] A pipeline or configuration change creates a new identity.
- [x] Database constraint tests pass without Redis.

## Consequences

Deterministic identity prevents duplicate model and GitHub costs. Canonicalization becomes a compatibility contract and must be versioned carefully.

## Rejected Alternatives

- Raw URL as key: mutable and easy to bypass.
- Branch name as key: does not identify immutable source.
- Redis-only lock: expires, can be lost, and cannot represent durable ownership.
