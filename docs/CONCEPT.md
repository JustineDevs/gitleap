# GitLeap Concept

> `CONCEPT.md` explains why GitLeap exists, what it promises, and what it refuses to promise. It is the product and systems thesis, not an implementation inventory.

## 1. The Story

Useful engineering knowledge is trapped inside repositories.

Repositories contain working modules, operational patterns, security practices, framework conventions, and hard-earned integration logic. But the knowledge is difficult to reuse because it is distributed across source files, configuration, tests, scripts, and documentation.

GitLeap turns that repository knowledge into explicit, portable development skills.

The product begins with a URL and a commit, but the output is not a summary. The output is a set of usable capabilities with instructions, references, prerequisites, examples, and local validation.

## 2. The Problem

Sending an entire repository to a model is a poor extraction strategy:

- context becomes too large
- important relationships are lost
- irrelevant files dominate the prompt
- secrets and hostile instructions may be exposed
- generated code is difficult to validate
- the result is hard to reproduce

GitLeap addresses this by making structure and provenance first-class.

## 3. The Product Promise

For a supported repository and pinned commit, GitLeap should provide:

1. a repository inventory
2. an architectural map
3. semantically coherent capability candidates
4. explicit generated skill documents
5. validation evidence
6. an immutable downloadable pack

The promise is not “the model understands everything.” The promise is “the system shows what it observed, what it generated, and what it verified.”

## 4. The Core Idea

GitLeap behaves like a compiler for repository knowledge:

```text
source repository
  -> parse
  -> index
  -> select
  -> synthesize
  -> validate
  -> compile
  -> distribute
```

The compiler metaphor creates useful constraints:

- source identity must be stable
- intermediate representations must be inspectable
- stages must have explicit inputs and outputs
- failures must be attributable to a stage
- final artifacts need provenance

## 5. The User Experience

### First release experience

```text
Web onboarding or an existing session token
  -> `gitleap auth login <token>`
  -> `gitleap pull <public repository URL>`
  -> Step A submission screen
  -> Step B fixed-interval polling and stage progress
  -> Step C interactive Skills Explorer when ready
  -> explicitly download the private archive
```

The web client exposes the same authenticated submit/status/download contract.
The hosted installer, OAuth provider, and token issuer are deployment
boundaries; the repository contains the client and server contract, not the
hosted website implementation. Locally, a pre-existing server-issued session
token or the documented development login is required.

The first release should use status polling. A streaming progress protocol is useful, but it should not be allowed to destabilize the durable state model.

### Generated pack experience

The user should be able to inspect a pack before installing it:

- what skills were generated
- which repository paths support each skill
- which tools and environment variables are required
- which checks passed or failed
- which claims are recommendations rather than observed facts

## 6. The Trust Position

GitLeap processes arbitrary repositories. That makes every repository an untrusted input source.

The system must never imply that generated output is automatically safe. It should:

- avoid executing source code
- identify unsupported or risky content
- scan generated files for secrets
- retain provenance and validation results
- disclose model and pipeline limitations

The generated pack is delivered to a developer-controlled environment. Runtime execution risk belongs to the consumer, but GitLeap still owns the safety of its processing infrastructure and the honesty of its output.

## 7. What Makes the Product Different

| Ordinary repository summary | GitLeap |
| --- | --- |
| describes files | maps capabilities and relationships |
| model reads arbitrary context | static index controls context selection |
| output is prose | output is a portable skill pack |
| weak provenance | source, commit, pipeline, and validation metadata |
| no stable retry identity | deterministic job and artifact identity |
| trust is implied | trust boundaries and limitations are explicit |

## 8. Fundamental Terms

| Term | Meaning |
| --- | --- |
| skill | A portable instruction and implementation unit for one capability. |
| capability | A coherent behavior supported by evidence in the source repository. |
| source evidence | Paths, symbols, configuration, tests, or docs supporting a claim. |
| slice | The bounded context supplied to a synthesis stage. |
| pack | The archive containing skills, manifest, provenance, and instructions. |
| confidence | A classification based on evidence completeness, not model certainty. |
| pipeline version | The compiler behavior used to produce the pack. |

## 9. Product Boundaries

GitLeap is:

- a repository analysis and capability extraction platform
- a TypeScript-first monorepo
- a static-analysis and model-assisted compiler
- a provenance-bearing artifact generator

GitLeap is not:

- a CI runner for arbitrary repositories
- a malware scanner claiming complete detection
- a replacement for a human architecture review
- a universal code migration service
- an unbounded autonomous software engineer

## 10. Design Principles

1. Evidence before synthesis.
2. Determinism before convenience.
3. Narrow public contracts.
4. Untrusted input by default.
5. Explicit limitations.
6. One source of truth per concern.
7. Reuse installed platform primitives before adding dependencies.
8. Defer streaming, multi-provider, and multi-language expansion until the kernel works.

## 11. Success Measures

- percentage of generated skills with traceable source evidence
- successful archive validation rate
- duplicate submission suppression rate
- processing cost per repository and per generated skill
- median time to first inventory
- artifact download success rate
- secret and policy violation rejection rate
- human usefulness rating of generated skills

## 12. Concept Conclusion

GitLeap is a trust-aware compiler for reusable repository knowledge. Its value comes from the combination of structural analysis, bounded synthesis, explicit evidence, deterministic artifacts, and a product experience that makes uncertainty visible.
