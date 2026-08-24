# GitLeap Implementation Ledger

Date: 2026-08-24

This ledger records the evidence for the current MVP contract. A green local
check proves the local boundary it exercises; it does not substitute for a
credentialed hosted-provider check.

## Contract Evidence

| Area | Implementation | Evidence | Remaining boundary |
| --- | --- | --- | --- |
| Identity and access | Better Auth sessions, owner/reader access, owner-only cancellation, origin-checked mutations, access/cancellation/download audit events | `smoke:http-lifecycle`, `smoke:processing`, API tests, CLI contract tests | Hosted identity/session deployment |
| Canonical jobs | SHA identity, create-or-get transaction, active-job uniqueness, quota only for new work inside the create transaction | `test:infra:quota`, `test:load`, `smoke:processing` | External database fault injection |
| State and recovery | Lease CAS, stale-worker fencing, retry outbox, cancellation-expiry recovery, cancellation/publication race fencing, abandoned usage release | `test:infra:recovery`, `test:infra:queue`, `test:infra:race`, server tests | External Redis/Postgres fault injection |
| Source safety | Fixed GitHub hosts, public-IP checks, redirect rejection, bounded archive parsing, traversal/link/size rejection | source adapter and archive suites, `smoke:github`, execution-boundary scan | DNS rebinding and live upstream fault injection |
| Inventory | Deterministic lexical index, classifications, exclusion reasons, stable digest, bounded slices | server indexer suite, pipeline smoke | Broader parser coverage is V2 |
| Model boundary | One configured adapter, redaction, schema/evidence/path validation, token/cost/deadline limits, deterministic idempotency key | model suite, pipeline smoke | Credentialed real provider run |
| Artifact compiler | Deterministic gzip archive, manifest, provenance, architecture map, validation tests, checksum | compiler extraction/validator suite, pipeline smoke | Hosted artifact download |
| Storage | Private Supabase adapter, checksum-preserving writes, object-bound signed paths, expiry-bounded URLs, cleanup | storage/API suites, cleanup smoke | Credentialed private-bucket smoke |
| Clients | Web submit/status/download, bounded polling, interactive OpenTUI CLI, CLI CSRF header, checksum-verified download and safe injection | web/CLI suites, HTTP lifecycle smoke | Manual TTY and browser E2E |
| Operations | Arcjet request limits, quota/cost limits, retention cleanup with expiry audit, OpenTelemetry spans/export, safe error codes | infra smokes, cleanup smoke, `smoke:otel`, Gitleaks | Hosted dashboards and alert delivery |

## Validation Commands

The following commands passed during the current audit:

```text
bun install --frozen-lockfile
bun run check-types
bun run lint
bun run build
bun run check:docs
bun run test
bun run test:infra:migrate
bun run test:infra:upgrade
bun run test:infra:verify
bun run test:infra:recovery
bun run test:infra:race
bun run test:infra:quota
bun run test:infra:queue
bun run test:infra:cleanup
bun run test:infra:pipeline
bun run test:load
bun run smoke:processing
bun run smoke:http-lifecycle
bun run smoke:github
bun run smoke:otel
bun run check:execution-boundary
DATABASE_URL=... bun run knip:production
docker run ... gitleaks detect ...
git diff --check
```

The repository test suite currently covers 38 server tests, 4 web tests, 9
API tests, and 10 CLI tests. The two Fumadocs CSS `!important` diagnostics and
the Vite/bundle-size build diagnostics are warnings, not failed gates.

## Credential-Gated Checks

`bun run smoke:supabase` intentionally fails closed when
`SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is absent. Run it against a
disposable private bucket before a hosted release. A configured model provider
must likewise be exercised with a disposable budget and inspected for its
idempotency-key behavior before claiming hosted model proof.

## Scope Boundary

The original `README.md` remains the product vision supplied by the repository
owner. The supported, verified MVP contract is documented in Fumadocs and
`docs/MVP.md`; deferred Tree-sitter, WebSocket, private-repository, marketplace,
and multi-provider work remains outside this release.
