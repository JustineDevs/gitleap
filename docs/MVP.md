# GitLeap MVP

## MVP Scope

The MVP is the smallest credible GitLeap release:

- authenticated user
- public GitHub repository
- immutable commit
- durable job state
- static repository inventory
- deterministic architecture map
- bounded skill synthesis
- validated private archive
- status polling
- authorized download
- first-class CLI client for login, submission, polling, cancellation, and download
- interactive terminal console with keyboard navigation and live status polling

The CLI package is the current `v0.1.0` product surface. V1 is the processing
kernel and artifact contract exercised through that client; the package version
does not claim that every V1 roadmap expansion is complete.

## Week 1: Freeze the Kernel

### Days 1–2: Freeze contracts

- define source identity and canonical key
- define public status projection
- define job transitions and terminal states
- define artifact and provenance schemas
- resolve authentication and ownership rules

### Days 3–4: Persistence

- add processing job, stage, artifact, outbox, and audit schema
- add uniqueness constraint for canonical identity
- implement create-or-get transaction
- implement lease and fencing fields

### Day 5: Transport

- add authenticated submit procedure
- add ownership-checked status procedure
- add cancellation semantics or explicitly defer cancellation
- add request and cost limits

## Week 2: Safe Source Processing

### Days 6–7: GitHub source adapter

- support public repositories only
- normalize URL and revision
- resolve commit SHA
- validate redirects and egress targets
- enforce archive and path limits

### Days 8–9: Inventory and index

- build file inventory
- apply ignore rules
- detect languages and manifests
- parse the MVP `v1-lexical` TypeScript/JavaScript/JSON/Markdown set
- persist source locations and evidence

### Day 10: Recovery tests

- duplicate submission test
- worker crash and lease-expiry test
- outbox republish test
- stale transition test
- oversized archive and traversal tests

## Week 3: Pack Compiler

### Days 11–12: Deterministic pack

- compile inventory and architecture evidence into pack metadata
- generate manifest, provenance, and README
- generate one non-LLM baseline skill for explicitly enabled test/smoke flows
- produce deterministic archive and checksum

### Days 13–14: Model adapter

- support one configured provider; allow only the non-production baseline
  compiler in explicitly enabled test/smoke environments
- enforce bounded slices and token budgets
- require schema-constrained skill candidates
- reject unsupported claims and missing evidence

### Day 15: Artifact storage

- write to private Supabase Storage bucket
- record immutable object key and checksum
- issue ownership-checked signed URL
- add expiry and cleanup handling

## Week 4: Product Proof

### Days 16–17: Product flow

- make the CLI the first product proof for submission, status, cancellation, and download
- add web submission form and status polling against the same contract
- add failure and retry messaging
- add authorized download action in both clients

### Days 18–19: Hardening

- secret scanning
- SSRF tests
- authorization tests
- rate-limit wiring
- worker startup and shutdown
- OpenTelemetry job spans

### Day 20: MVP ship checklist

- run full validation suite
- process a fixed public fixture repository
- inspect generated pack manually
- verify duplicate submission behavior
- verify artifact expiration and authorization
- document known limitations

## Ship Criteria

- [x] One public GitHub fixture completes successfully (`smoke:github`, `test:infra:pipeline`, and `smoke:http-lifecycle`).
- [x] Same canonical input does not create duplicate active jobs (`test:infra:queue` and lifecycle smoke).
- [x] Worker restart does not lose a durable job (`test:infra:recovery` and child-process queue smoke).
- [x] No repository code executes in processing (source adapter and pipeline contain no execution path).
- [x] SSRF and archive traversal tests pass.
- [x] Artifact is private and ownership-checked (`smoke:processing` and storage contract tests).
- [x] Generated pack contains manifest, provenance, architecture map, source evidence, and validation.
- [x] Secrets are blocked from publication (`gitleaks` and compiler tests).
- [x] Typecheck, lint, tests, build, Docker, and migration checks pass in the
      repository validation matrix.
- [x] Cost and size limits are enforced by quota, model budget, archive, file, and timeout controls.

## Non-Goals

- private repositories
- arbitrary code execution
- multiple LLM providers
- multi-language parser coverage beyond the agreed first set
- WebSocket progress
- public skill marketplace
- automatic production deployment of generated code
