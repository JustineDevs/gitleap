# ADR-0006: Safe Public GitHub Source Adapter

- Status: Accepted for MVP
- Date: 2026-08-14
- Depends on: ADR-0001, ADR-0002, ADR-0005
- Implements: public GitHub source ingestion and source safety controls

## Context

Repository URLs and archives are hostile input. SSRF, redirects, archive traversal, zip bombs, oversized files, and repository scripts are material risks.

## Decision

The MVP implements one `SourceAdapter` for public GitHub repositories. It resolves a revision to a commit SHA and streams a bounded archive into a non-executing processing path.

The adapter must not install dependencies, invoke Git, run scripts, execute build hooks, or inspect private-network destinations.

## Required Controls

- allowlist GitHub hosts and supported URL forms
- validate every redirect and resolved IP
- block loopback, private, link-local, and metadata-service targets
- enforce compressed size, expanded size, file count, path length, and time limits
- reject absolute paths, traversal, unsafe links, and malformed archive entries
- apply `.gitignore`-like exclusion policy without trusting executable repository configuration
- classify GitHub 404, 403, rate limit, timeout, and transient failures

## Implementation

- implement `normalize` and `fetchArchive` behind the adapter contract
- use `AbortSignal` and hard timeouts
- stream bytes with counters instead of loading an unbounded archive
- emit safe source metadata only
- add fixture archives for valid, oversized, malformed, traversal, and hostile cases

## Acceptance Criteria

- [x] Equivalent supported GitHub URLs normalize identically.
- [x] Branch/tag inputs resolve to a commit before job creation.
- [x] SSRF and redirect tests pass.
- [x] Archive limits stop processing before resource exhaustion.
- [x] Traversal and unsafe entry tests pass.
- [x] No repository code executes during source ingestion.
- [x] Upstream errors map to documented retry classes.

## Consequences

Only public GitHub is supported initially. The adapter contract can later support private GitHub or other hosts without changing the processing module.

## Rejected Alternatives

- cloning and running repository tooling: unsafe and unnecessary for static extraction.
- accepting arbitrary URLs: creates an avoidable SSRF boundary.
- downloading a full unbounded archive before validation: exposes memory and storage exhaustion.
