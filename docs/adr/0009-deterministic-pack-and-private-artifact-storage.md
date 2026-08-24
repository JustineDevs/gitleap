# ADR-0009: Deterministic Pack Compilation and Private Artifact Storage

- Status: Accepted for MVP
- Date: 2026-08-14
- Depends on: ADR-0003, ADR-0008
- Implements: manifest, provenance, archive, checksum, Supabase Storage, and authorized download

## Context

Generated skills must be inspectable, reproducible, and safely downloadable. A storage upload can succeed while the database update fails, or an artifact can be exposed if object keys are treated as authorization.

## Decision

Compile a deterministic archive containing:

```text
README.md
skills-manifest.json
provenance.json
skills/<skill-id>/SKILL.md
skills/<skill-id>/metadata.json
skills/<skill-id>/references/
skills/<skill-id>/examples/
skills/<skill-id>/validation.test.ts
```

Write artifacts to a private Supabase Storage bucket using opaque or content-addressed keys. Record object key, checksum, size, provenance, and expiry in Postgres. The object write is immutable `put-if-absent`; publish `ready` only after storage and database records are consistent. Cleanup deletes only objects with no live artifact reference and an expired retention timestamp.

## Provenance

Record:

- provider, repository, and resolved commit
- pipeline and schema versions
- configuration digest
- parser and model metadata
- source evidence references
- validation results
- compiler version and archive checksum

The MVP provenance contract additionally records `parserVersion`, `modelProvider`, `modelName`, `compilerVersion`, and the validation policy identifier. The archive includes `architecture-map.json` alongside `provenance.json`.

## Acceptance Criteria

- [x] Identical inputs and versions produce identical archive identity.
- [x] Manifest and provenance validate against schemas.
- [x] Archive contains no traversal paths or secrets.
- [x] Storage bucket is private.
- [x] Download URL requires an owner or reader grant and expires.
- [x] Partial upload or database failure has a reconciliation path.
- [x] Artifact expiration deletes or marks storage objects safely.

## Consequences

Supabase Storage is a production dependency, but the artifact contract remains provider-neutral. A later storage adapter can support another object store without changing the public job model.

## Rejected Alternatives

- public bucket objects: unacceptable for user-owned source-derived output.
- storing archives in Postgres: inefficient and complicates database operations.
- publishing ready before upload confirmation: creates broken downloads.
