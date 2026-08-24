# GitLeap Full Monorepo

## 1. Purpose

This document maps the complete intended monorepo. It separates current packages from planned packages so the tree is useful for implementation without pretending the product is already complete.

## 2. Repository Tree

```text
gitleap/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── router.tsx
│   │       ├── app-shell.tsx
│   │       └── routes/
│   ├── server/
│   │   └── src/
│   │       ├── index.ts
│   │       └── lib/
│   │           ├── queue.ts
│   │           ├── workers.ts
│   │           ├── rate-limit.ts
│   │           ├── tracing.ts
│   │           └── posthog.ts
│   ├── tui/
│   │   └── src/index.ts
│   ├── fumadocs/
│   │   ├── src/app/
│   │   └── content/docs/
│   └── fumadocs/
│       ├── src/app/
│       └── content/docs/
├── packages/
│   ├── api/
│   ├── auth/
│   ├── db/
│   ├── env/
│   ├── config/
│   ├── processing/       # planned
│   ├── source-github/    # planned
│   ├── indexer/          # planned
│   ├── compiler/         # planned
│   └── adapters/         # planned only if multiple implementations justify it
├── docs/
├── .internal/reference/
├── package.json
├── bun.lock
├── turbo.json
├── tsconfig.json
├── biome.jsonc
├── knip.jsonc
└── .gitleaks.toml
```

## 3. Current Package Map

| Package | Current responsibility | Contract owner |
| --- | --- | --- |
| `@gitleap/api` | tRPC context and procedures | tRPC schemas and procedure auth |
| `@gitleap/auth` | Better Auth configuration | session and account behavior |
| `@gitleap/db` | Prisma client and auth schema | database access |
| `@gitleap/env` | server/web environment validation | runtime configuration |
| `@gitleap/config` | private shared configuration | package-specific config |

## 4. Planned Package Map

| Package | Responsibility | First reason to create |
| --- | --- | --- |
| `@gitleap/processing` | job lifecycle and stage orchestration | first processing endpoint |
| `@gitleap/source-github` | public GitHub commit fetch | first source adapter |
| `@gitleap/indexer` | inventory and structural index | first parser implementation |
| `@gitleap/compiler` | skills, manifest, provenance, archive | first artifact test |
| `@gitleap/contracts` | shared domain schemas if `api` becomes overloaded | only when multiple consumers need them |

Do not create every planned package up front. Start with the smallest module that preserves locality and testability.

## 5. Dependency Direction

```text
apps/web ---------> packages/api ---------> apps/server/src/processing
apps/server ------> packages/api ---------> apps/server/src/processing
apps/server/src/processing -> source/index/compiler adapters
packages/auth -----> packages/db
packages/api ------> packages/auth
packages/api ------> packages/db
apps/fumadocs -----> markdown and MDX content
```

The processing module must not import the browser application. Adapter implementations may import external SDKs, but domain types must remain provider-neutral.

## 6. Workspace Commands

Current root commands include:

```text
bun run dev
bun run build
bun run check-types
bun run lint
bun run format
bun run knip
bun run secrets:scan
bun run test
```

Required additions when processing starts:

```text
bun run test:processing
bun run test:integration
bun run test:security
bun run check:artifacts
```

Add commands only when they execute real checks.

## 7. Runtime Processes

### Web process

Serves onboarding, authentication state, submission, status, and authorized download.

### HTTP process

Serves Hono routes, Better Auth, tRPC, CORS, request logs, and tracing.

### Worker process

Claims durable jobs, performs static processing, compiles artifacts, writes storage, and updates state. It must be separately startable from HTTP ingress.

### Documentation process

`apps/fumadocs` is the documentation application and the only documentation workspace.

## 8. Data and Storage

- Supabase Postgres is the durable system of record.
- Prisma owns typed schema access and migrations.
- Redis/Upstash Redis owns short-lived coordination, cache acceleration, and queue transport.
- Supabase Storage owns private immutable artifacts.
- Database rows retain ownership and provenance even when artifacts expire.

## 9. Release Model

1. format and lint
2. typecheck
3. unit and contract tests
4. security and secret scans
5. integration tests with database/Redis/storage fakes or controlled services
6. artifact smoke test
7. Changesets versioning
8. publish/deploy from approved branch

The current server build has an existing `unrun` import problem; this must be fixed or explicitly isolated before claiming a green production build.

## 10. Documentation Ownership

| File | Role |
| --- | --- |
| `docs/TA.md` | deepest technical architecture and operating contract |
| `docs/CONCEPT.md` | product thesis and product boundaries |
| `docs/DRAFT.md` | working first-release product/technical contract |
| `docs/ADAPTER-CONTRACT.md` | external-system adapter contracts and certification |
| `docs/ARCHITECTURE.md` | concise layer and flow view |
| `docs/FULL-MONOREPO.md` | package, process, and workspace map |
| `docs/MVP.md` | first implementation slice and ship criteria |
| `docs/ROADMAP.md` | staged product expansion |

## 11. Monorepo Completion Rule

The monorepo is not complete because every planned directory exists. It is complete for a release when the smallest package set can prove the documented user story with tests, security checks, artifact validation, and operational recovery.
