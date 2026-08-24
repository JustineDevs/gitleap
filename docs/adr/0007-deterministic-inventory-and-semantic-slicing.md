# ADR-0007: Deterministic Inventory, Structural Index, and Semantic Slicing

- Status: Accepted for MVP
- Date: 2026-08-14
- Depends on: ADR-0006
- Implements: static inventory, architecture map, bounded context, and source evidence

## Context

The model cannot safely or economically read an entire repository. GitLeap needs a deterministic intermediate representation before synthesis.

## Decision

Process source in three non-model steps:

1. inventory files and metadata
2. parse agreed languages into symbols and relationships
3. select bounded semantic slices with explicit inclusion evidence

The first parser set is limited to languages approved in the implementation contract. Unsupported files remain inventory records and are not silently interpreted.

## Inventory Requirements

- path, size, digest, language, and generated/binary classification
- manifest, configuration, documentation, and test classification
- ignore decisions with reason
- source locations for symbols and relationships
- deterministic ordering and serialization

## Slice Requirements

- bounded files, bytes, symbols, and tokens
- entry point and dependency relevance
- source paths and locations attached to every claim
- no hidden context from unrelated repositories or prior users
- stable slice digest for caching and retry idempotency

## Implementation

- use the deterministic `v1-lexical` TypeScript/JavaScript parser contract for the MVP; Tree-sitter integration is a V2 parser expansion and must retain the same evidence schema
- store an index schema version
- separate raw source handling from model context construction
- exclude vendor, generated, binary, and irrelevant content by policy
- add deterministic architecture-map output before model work, containing indexed files, symbols, import targets, and inspectable edges

## Acceptance Criteria

- [x] Same source and parser version produce the same inventory digest.
- [x] Source locations survive indexing and slicing.
- [x] Large repositories are bounded without unbounded memory growth.
- [x] Unsupported languages are reported, not misclassified.
- [x] Slice membership has an inspectable reason.
- [x] Index and slice fixtures are deterministic.

## Consequences

The index and slice schemas become versioned internal contracts. Better slices reduce cost and hallucination but may omit relevant behavior; evidence and confidence must expose that limitation.

## Rejected Alternatives

- raw recursive text dumping: token-heavy and relationship-blind.
- model-first repository discovery: nondeterministic and expensive.
- executing project build tooling to discover structure: violates the no-execution policy.
