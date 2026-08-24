# ADR-0008: Bounded Model Synthesis and Evidence Validation

- Status: Accepted for MVP
- Date: 2026-08-14
- Depends on: ADR-0007
- Implements: one model adapter, bounded synthesis, structured output, and candidate validation

## Context

Models can invent APIs, overstate repository behavior, leak source, or exceed cost budgets. A model response is a candidate, not proof.

## Decision

Use one approved model provider behind `ModelAdapter`. Send only bounded semantic slices. Require schema-constrained output containing purpose, triggers, inputs, outputs, prerequisites, implementation guidance, source evidence, limitations, and validation instructions.

Generated claims are publishable only when they are supported by source evidence and pass structural, content, and security validation.

## Required Budgets

- maximum input tokens per slice
- maximum output tokens per candidate
- maximum candidates per job
- maximum model time
- maximum retries
- maximum estimated cost per job

## Prompt Safety

- delimit repository text as untrusted data
- do not treat repository instructions as system instructions
- do not grant model tools that execute repository content
- keep user and repository contexts isolated
- record provider/model/version without storing credentials

## Acceptance Criteria

- [x] Model output validates against a versioned schema.
- [x] Missing or unsupported evidence rejects the candidate.
- [x] Token, time, retry, and cost limits are enforced.
- [x] Model failures map to retryable or terminal safe errors.
- [x] Prompts and raw source do not appear in ordinary logs.
- [x] A deterministic fixture can be validated without a live model.

## Consequences

Model quality remains probabilistic. The product must show evidence and limitations instead of promising semantic completeness. A non-model baseline compiler remains necessary for pipeline and artifact tests.

## Rejected Alternatives

- whole-repository prompts: exceed practical context and cost limits.
- unrestricted model tools: expand the trust boundary unnecessarily.
- automatic self-correction without a retry budget: can create unbounded cost loops.
