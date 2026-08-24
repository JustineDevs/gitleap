# GitLeap Product and Technical Draft

> This is the working draft for the first GitLeap release. It converts the concept into an implementation-shaped product slice while preserving explicit assumptions and open decisions.

## 1. Draft Thesis

Start with one valuable path and make it trustworthy:

```text
authenticated user
  -> public GitHub repository at immutable commit
  -> deterministic inventory and architecture map
  -> one or more evidence-backed skills
  -> validated private archive
```

Do not begin with private repository support, arbitrary code execution, multiple model providers, or a real-time protocol.

## 2. First User Story

As a developer, I can submit a public GitHub repository and commit, wait for processing, and download a pack containing explicit skills, source references, setup instructions, and validation metadata.

## 3. Draft Commands and Queries

The external transport should expose a small contract:

```ts
type SubmitProcessingInput = {
  sourceUrl: string;
  revision: string;
  options?: {
    skillLimit?: number;
    includeTests?: boolean;
  };
};

type ProcessingSubmission = {
  jobId: string;
  status: "queued" | "running" | "ready" | "failed" | "cancelled" | "expired";
  canonicalKey: string;
};

type ProcessingStatus = ProcessingSubmission & {
  progress?: number;
  currentStage?: string;
  artifact?: {
    id: string;
    sizeBytes: number;
    checksum: string;
    expiresAt: string;
  };
  error?: {
    code: string;
    retryable: boolean;
  };
};
```

The public contract must not expose raw source, prompts, credentials, stack traces, or unrestricted internal stage names.

## 4. Processing Stages

### Stage A: Validate

- authenticate caller
- normalize provider and repository
- resolve immutable commit
- reject unsupported schemes and private-network URLs
- apply quota and size policy

### Stage B: Inventory

- read archive entries as bytes/text
- enforce path, count, compressed-size, and expanded-size limits
- apply ignore rules
- identify languages, manifests, entry points, imports, exports, and tests
- persist deterministic inventory metadata

### Stage C: Structure

- parse supported languages with Tree-sitter or an equivalent parser
- construct symbol and relationship records
- retain source locations
- emit a compact architecture map

### Stage D: Slice

- group related files and symbols
- exclude irrelevant or generated content
- cap context size
- attach source evidence and confidence metadata

### Stage E: Synthesize

- send bounded slices to one configured model adapter
- require structured output
- treat source text as untrusted data
- reject output that lacks evidence or violates the schema

### Stage F: Validate and Compile

- validate paths and manifest schema
- scan for secrets
- check Markdown and JSON structure
- run language-specific static checks where available
- produce deterministic archive, checksum, and provenance

## 5. First Artifact Shape

```text
gitleap-pack/
├── README.md
├── skills-manifest.json
├── provenance.json
└── skills/
    └── <skill-id>/
        ├── SKILL.md
        ├── metadata.json
        ├── references/
        ├── examples/
        └── validation.test.ts
```

## 6. Quality Bar

A skill is publishable only when it has:

- a stable identifier
- a concise purpose
- explicit trigger conditions
- inputs and outputs
- prerequisites
- source evidence with paths and symbols
- implementation guidance
- known limits
- a validation command or reason validation is unavailable
- no detected secret or unsafe path

## 7. Draft Product Surfaces

| Surface | First-release decision |
| --- | --- |
| CLI | First TypeScript/Bun client for sign-in, submission, status, cancellation, and download |
| Web | Existing `apps/web` for sign-in, submission, status, and download parity |
| Server | Existing `apps/server` Hono/tRPC ingress |
| Auth | Existing Better Auth session model |
| Database | Supabase Postgres through Prisma |
| Queue | BullMQ with Redis; use Upstash Redis for hosted coordination if appropriate |
| Storage | Supabase Storage private bucket |
| Docs | `apps/fumadocs` canonical Fumadocs app |
| TUI | Defer beyond scaffold; it is distinct from the first-class CLI |
| Progress | Polling first; streaming later |

## 8. Explicit Non-Goals

- executing repository code
- installing repository dependencies
- private GitHub repositories in the first slice
- arbitrary user-provided plugins in workers
- guarantee of semantic correctness
- automatic publication of unreviewed generated skills to a public catalog

## 9. Open Draft Decisions

1. exact supported languages for the first parser release
2. model provider and data-retention terms
3. maximum repository size and processing budget
4. artifact retention and signed URL lifetime
5. job cancellation behavior
6. whether a failed job can be manually retried
7. final database schema and transactional outbox implementation

## 10. Draft Exit Condition

This draft becomes implementation-ready when `ADAPTER-CONTRACT.md`, the persistence model, the state transition table, and the security blockers in the vet review agree on the same public contract.
