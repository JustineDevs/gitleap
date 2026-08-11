# Gitignore Pattern Catalog

This is the single source of truth for all gitignore patterns managed by the fullstack-dev plugin. Every category, detection rule, and pattern listed here is authoritative. The gitignore management system reads from this catalog when assembling `.gitignore` files — if a pattern is not listed here, it does not get generated. To add, remove, or modify patterns, edit this file.

---

## Universal

**Key:** `universal`
**Detect:** N/A
**Always active:** Yes

**Patterns:**

```gitignore
node_modules/
*.log
npm-debug.log*
yarn-debug.log*
pids/
*.pid
*.seed
```

---

## Secrets

**Key:** `secrets`
**Detect:** N/A
**Always active:** Yes

**Patterns:**

```gitignore
.env
.env.local
.env.*.local
.env.production
*.pem
credentials.json
serviceAccountKey.json
.claude/settings.local.json
```

---

## Node

**Key:** `node`
**Detect:** `package.json` exists
**Always active:** No

**Patterns:**

```gitignore
node_modules/
.npm/
.pnpm-store/
*.tgz
.yarn-integrity
.pnp.*
```

---

## TypeScript

**Key:** `typescript`
**Detect:** `tsconfig.json` exists or stack includes "typescript"
**Always active:** No

**Patterns:**

```gitignore
*.tsbuildinfo
```

---

## Next.js

**Key:** `nextjs`
**Detect:** `next.config.*` exists or stack includes "next.js"
**Always active:** No

**Patterns:**

```gitignore
.next/
out/
next-env.d.ts
```

---

## Astro

**Key:** `astro`
**Detect:** `astro.config.*` exists or stack includes "astro"
**Always active:** No

**Patterns:**

```gitignore
dist/
.astro/
```

---

## Python

**Key:** `python`
**Detect:** `*.py` files exist or stack includes "python"
**Always active:** No

**Patterns:**

```gitignore
__pycache__/
*.py[codz]
*.egg-info/
.venv/
venv/
.mypy_cache/
.ruff_cache/
.pytest_cache/
.hypothesis/
.ipynb_checkpoints/
```

---

## iii.dev

**Key:** `iiidev`
**Detect:** `motia.config.*` exists or stack includes "iii.dev"/"motia"
**Always active:** No

**Patterns:**

```gitignore
.motia/
data/
!data/.gitkeep
```

---

## Build

**Key:** `build`
**Detect:** N/A
**Always active:** Yes

**Patterns:**

```gitignore
dist/
build/
out/
coverage/
.nyc_output/
*.lcov
```

---

## Cache

**Key:** `cache`
**Detect:** N/A
**Always active:** Yes

**Patterns:**

```gitignore
.cache/
.eslintcache
.stylelintcache
.turbo/
.parcel-cache/
.vite/
```

---

## IDE

**Key:** `ide`
**Detect:** N/A
**Always active:** Yes

**Patterns:**

```gitignore
.idea/
*.iws
*.iml
*.ipr
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.vsix
*.code-workspace
```

---

## macOS

**Key:** `macos`
**Detect:** OS detection or multi-platform
**Always active:** No

**Patterns:**

```gitignore
.DS_Store
._*
.Spotlight-V100
.Trashes
__MACOSX/
```

---

## Windows

**Key:** `windows`
**Detect:** OS detection or multi-platform
**Always active:** No

**Patterns:**

```gitignore
Thumbs.db
Desktop.ini
$RECYCLE.BIN/
*.lnk
```

---

## Linux

**Key:** `linux`
**Detect:** OS detection or multi-platform
**Always active:** No

**Patterns:**

```gitignore
.fuse_hidden*
.directory
.Trash-*
.nfs*
```

---

## MCP Tooling

**Key:** `mcp-tooling`
**Detect:** `.mcp.json` has server entries
**Always active:** No

**Patterns:**

```gitignore
.code-review-graph/
.impeccable/
.sourcerer/
```

Per-server data directories are added dynamically based on the servers declared in `.mcp.json`.

---

## Skills CLI

**Key:** `skills-cli`
**Detect:** `skills-lock.json` exists at the **workspace root only** (not per sub-repo — `.claude/skills/` and `.agents/` are Claude Code session artifacts, not per-repo source artifacts; a Claude Code session, and therefore `npx skills add`, operates from the workspace root regardless of `repoStructure`, the same way `.mcp.json` and `.claude/settings.json` are already workspace-root-level singletons in this plugin's model)
**Always active:** No
**Fallback:** None — unlike every other category, this one has no file-detection fallback. `skills-lock.json` is the one reliable, unambiguous signal that `npx skills add` manages this workspace; a heuristic fallback (e.g. guessing from directory contents) risks false positives on hand-authored `.claude/` trees. This is an intentional deviation from the catalog's usual config-plus-fallback pattern, not an oversight.

**Patterns:**

```gitignore
.claude/skills/
.agents/
```

`.claude/skills/` is precisely scoped to that one subpath — never a wildcard on `.claude/*` — because `.claude/` is known to hold hand-authored content (`settings.json`, `settings.local.json`) alongside generated content. `.agents/` is ignored as a whole directory because it currently holds nothing but the generated skills mirror; a wholesale pattern self-extends if `npx skills add` ever mirrors other content there, at the accepted trade-off that any future hand-authored content placed directly under `.agents/` would be unexpectedly ignored too.

---

## Deployment

**Key:** `deployment`
**Detect:** Config files (e.g., `vercel.json`, `serverless.yml`, `firebase.json`)
**Always active:** No

**Patterns:**

```gitignore
.vercel/
.serverless/
.firebase/
```

---

## Pattern Selection Logic

When assembling a `.gitignore` file, categories are selected in these tiers (evaluated in order):

1. **Always include** — `universal`, `secrets`, `build`, `cache`, `ide`. These categories apply to every project regardless of tech stack.

2. **OS detection** — Always include all three OS categories (`macos`, `windows`, `linux`) for team safety. A project may have contributors on any platform, so all OS-specific junk patterns are included unconditionally.

3. **Per-repo tech stack** — Read from `config.json repos[].stack`. Each stack entry maps to a category key (e.g., `"next.js"` activates `nextjs`, `"typescript"` activates `typescript`, `"python"` activates `python`).

4. **File detection fallback** — When the config is incomplete or a repo is not yet registered, detect categories by checking for marker files in the repo root (e.g., `package.json` for `node`, `tsconfig.json` for `typescript`, `next.config.*` for `nextjs`).

5. **MCP tooling** — If `.mcp.json` exists and contains server entries, activate the `mcp-tooling` category. Add per-server data directories dynamically based on declared servers.

6. **Skills CLI** — If `skills-lock.json` exists at the workspace root, activate the `skills-cli` category. No fallback — see the category's own `Fallback` field for why.

7. **Deployment** — Detect deployment platform config files (`vercel.json`, `serverless.yml`, `firebase.json`) and activate the `deployment` category if any are present.

---

## Category Sort Order

When writing patterns into the `.gitignore` marker block, categories are ordered as follows:

1. `universal`
2. `secrets`
3. `node`
4. Framework-specific (`typescript`, `nextjs`, `astro`, `python`, `iiidev`) — in the order they appear in this catalog
5. `build`
6. `cache`
7. `ide`
8. OS categories (`macos`, `windows`, `linux`)
9. `mcp-tooling`
10. `skills-cli`
11. `deployment`
12. Sub-repositories (managed separately, listed last)

This ordering groups related patterns together and places the most universal rules at the top with the most specific at the bottom.
