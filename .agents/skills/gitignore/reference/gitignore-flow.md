# Gitignore Flow Reference

Decision trees, merge rules, hook templates, detection heuristics, and migration logic for the fullstack-dev gitignore management system. Pattern definitions live in `gitignore-catalog.md` (same directory) and are not duplicated here.

---

## 1. Marker Block Format

The managed block uses exact start/end markers. All managed patterns go between these markers. User entries live below the end marker and are never touched.

### Canonical Template

```gitignore
# >>> fullstack-dev:gitignore (do not edit this block) >>>

# Universal
node_modules/
*.log
...

# Secrets
.env
.env.local
...

# Sub-repositories
frontend-app/
backend-api/

# <<< fullstack-dev:gitignore <<<

# --- User entries below ---
```

### Structural Rules

- **Start marker:** `# >>> fullstack-dev:gitignore (do not edit this block) >>>`
- **End marker:** `# <<< fullstack-dev:gitignore <<<`
- **Category headers** use `# Category Name` format (one blank line before each header, no blank line after)
- **One pattern per line**, no inline comments on pattern lines
- **Category sort order** follows the catalog's canonical order:
  1. Universal
  2. Secrets
  3. Node
  4. Framework-specific (TypeScript, Next.js, Astro, Python, iii.dev) -- in catalog order
  5. Build
  6. Cache
  7. IDE
  8. macOS, Windows, Linux
  9. MCP Tooling
  10. Skills CLI
  11. Deployment
  12. Sub-repositories
- **Empty categories** are omitted entirely (no header, no patterns)
- **Sub-repositories** are always listed as the last category inside the block, with each directory on its own line and a trailing `/`
- The `# --- User entries below ---` line appears immediately after the end marker, separated by one blank line
- **Negation patterns** (e.g., `!.vscode/settings.json`) stay with their parent category, listed immediately after the pattern they negate

---

## 2. Marker Block Merge Rules

Decision tree for all write operations that modify the `.gitignore` file.

### Primary Decision Tree

```
.gitignore exists?
+-- NO --> Create new file
|   1. Write full marker block with all detected patterns
|   2. Append "# --- User entries below ---" after end marker
|   3. Done
|
+-- YES --> Check for marker block
    |
    Marker block found? (search for start marker string)
    +-- YES --> Check marker format
    |   |
    |   Is it the current format? ("fullstack-dev:gitignore")
    |   +-- YES --> Replace in place
    |   |   1. Preserve everything before start marker (whitespace, comments)
    |   |   2. Replace everything between start and end markers (inclusive)
    |   |   3. Write new marker block with all detected patterns
    |   |   4. Preserve everything after end marker exactly as-is
    |   |
    |   +-- NO --> Migration required (see Section 5)
    |
    +-- NO --> Prepend marker block
        1. Read all existing content
        2. Check for duplicate patterns (see below)
        3. Write marker block at top of file
        4. Append blank line
        5. Append "# --- User entries below ---"
        6. Append all original content below
```

### Duplicate Pattern Handling

When prepending a marker block to an existing `.gitignore`:

```
For each pattern in the existing user section:
+-- Pattern also exists in the marker block?
    +-- YES --> Keep both copies
    |   (Git processes .gitignore top-to-bottom; user duplicates are
    |    harmless and removing them would alter the user's file)
    +-- NO --> Keep in user section only
        (Do NOT add to marker block; user owns these patterns)
```

When replacing an existing marker block:

```
For each pattern that would go into the new marker block:
+-- Pattern exists in user section (below end marker)?
    +-- YES --> Omit from marker block
    |   (Avoids confusing duplicates; user's version takes precedence)
    +-- NO --> Include in marker block
```

---

## 3. Pre-commit Hook Script Template

This bash script is installed into `.git/hooks/pre-commit`. It catches accidentally staged files that match essential ignore patterns before they enter the repository.

### Hook Marker Block

The script is wrapped in its own marker block inside the pre-commit hook file so it can coexist with other hook content (e.g., the doc-staging hook from refresh-flow):

```bash
# >>> fullstack-dev:gitignore (do not edit this block) >>>
# ... script body ...
# <<< fullstack-dev:gitignore <<<
```

If the pre-commit hook file already exists, the script block is appended (or its existing block is replaced). If no hook file exists, a new one is created with the `#!/bin/bash` shebang.

### Script Template

```bash
# >>> fullstack-dev:gitignore (do not edit this block) >>>
# Fullstack Dev — pre-commit gitignore guard
# Prevents committing files that should be ignored.

ESSENTIAL_PATTERNS=(
  "node_modules/"
  ".env"
  ".env.local"
  ".env.*.local"
  "*.log"
  ".DS_Store"
  "Thumbs.db"
  "__pycache__/"
  ".next/"
  "dist/"
  "build/"
  ".idea/"
  "*.tsbuildinfo"
  ".turbo/"
  "coverage/"
  "*.pem"
  ".code-review-graph/"
  ".motia/"
)

STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

VIOLATIONS=0

for pattern in "${ESSENTIAL_PATTERNS[@]}"; do
  # Convert gitignore glob to a grep-compatible regex
  regex=$(echo "$pattern" | sed 's/\./\\./g; s/\*/.*/g; s|/$|/|')

  # Check if pattern ends with / (directory pattern)
  if [[ "$pattern" == */ ]]; then
    dir_name="${pattern%/}"
    matched_files=$(echo "$STAGED_FILES" | grep -E "^${dir_name}/" || true)
  else
    matched_files=$(echo "$STAGED_FILES" | grep -E "(^|/)${regex}$" || true)
  fi

  if [ -z "$matched_files" ]; then
    continue
  fi

  # Check if the pattern is already in .gitignore
  if [ -f ".gitignore" ]; then
    in_gitignore=$(grep -Fxq "$pattern" .gitignore 2>/dev/null && echo "yes" || echo "no")
  else
    in_gitignore="no"
  fi

  if [ "$in_gitignore" = "yes" ]; then
    # Pattern is in .gitignore but file is staged — user ran git add --force
    # Respect the force-add; skip this pattern
    continue
  fi

  # Violation: pattern missing from .gitignore and file is staged
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    echo "Auto-ignored: $file ($pattern)"
    git rm --cached "$file" > /dev/null 2>&1 || true
    VIOLATIONS=$((VIOLATIONS + 1))
  done <<< "$matched_files"

  # Append the missing pattern to .gitignore
  echo "" >> .gitignore
  echo "$pattern" >> .gitignore
  git add .gitignore
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "fullstack-dev: Removed $VIOLATIONS file(s) from staging."
  echo "The missing patterns were added to .gitignore."
  echo "Review the changes and commit again."
  exit 1
fi
# <<< fullstack-dev:gitignore <<<
```

### Behavior Summary

| Condition | Action |
|---|---|
| No staged files | Exit 0 (no-op) |
| Staged file matches pattern, pattern in `.gitignore` | Skip (user ran `git add --force`) |
| Staged file matches pattern, pattern NOT in `.gitignore` | Unstage file, append pattern to `.gitignore`, stage `.gitignore` |
| Any violations found | Print summary, exit 1 (block commit) |
| No violations | Exit 0 (allow commit) |

### Essential Patterns List (18 patterns)

These are hardcoded in the hook. They represent the minimum safety net:

| Pattern | Reason |
|---|---|
| `node_modules/` | Dependencies -- never committed |
| `.env` | Root environment secrets |
| `.env.local` | Local environment overrides |
| `.env.*.local` | Per-environment local overrides |
| `*.log` | Log files |
| `.DS_Store` | macOS metadata |
| `Thumbs.db` | Windows thumbnail cache |
| `__pycache__/` | Python bytecode cache |
| `.next/` | Next.js build output |
| `dist/` | Generic build output |
| `build/` | Generic build output |
| `.idea/` | JetBrains IDE config |
| `*.tsbuildinfo` | TypeScript incremental build |
| `.turbo/` | Turborepo cache |
| `coverage/` | Test coverage reports |
| `*.pem` | Certificates and private keys |
| `.code-review-graph/` | Code review graph data |
| `.motia/` | iii.dev runtime data |

---

## 4. Tech-Stack Detection Heuristics

How the system determines which catalog categories are active for a given repo.

### Detection Priority

Sources are checked in this order. Higher-priority sources win when there is a conflict:

```
Priority 1: config.json (explicit)
  Read .fullstack-dev/config.json -> repos[].stack array
  Each stack entry maps to a catalog category key:
    "node"       -> node
    "typescript"  -> typescript
    "next.js"    -> nextjs
    "astro"      -> astro
    "python"     -> python
    "iii.dev"    -> iiidev
    "motia"      -> iiidev

Priority 2: File detection fallback (implicit)
  When config.json is missing, incomplete, or a repo is not registered,
  scan the repo root for marker files.
```

### File Detection Matrix

| Marker File | Category Activated |
|---|---|
| `package.json` | `node` |
| `tsconfig.json` | `typescript` |
| `next.config.*` (any extension) | `nextjs` |
| `astro.config.*` (any extension) | `astro` |
| `motia.config.*` (any extension) | `iiidev` |
| `*.py` (any Python file) | `python` |

### Always-Active Categories

These categories are included regardless of detection results:

- `universal` -- applies to every project
- `secrets` -- environment files and keys must always be ignored
- `build` -- generic build output directories
- `cache` -- tool caches
- `ide` -- editor-specific files

### OS Categories

Always include all three OS categories (`macos`, `windows`, `linux`) unconditionally. A project may have contributors on any platform, so all OS-specific junk patterns are included for team safety.

### MCP Tooling Detection

```
.mcp.json exists?
+-- NO --> Skip mcp-tooling category
+-- YES --> Parse server entries
    |
    For each server in .mcp.json:
    +-- Match server name against known MCP tools in catalog
    |   (code-review-graph -> .code-review-graph/
    |    impeccable -> .impeccable/
    |    sourcerer -> .sourcerer/)
    +-- Activate mcp-tooling category
    +-- Add any per-server data directories not already in catalog
```

### Skills CLI Detection

```
skills-lock.json exists at the workspace root?
+-- NO --> Skip skills-cli category
+-- YES --> Activate skills-cli category
    (workspace-root check only — never per sub-repo, since .claude/skills/
     and .agents/ are Claude Code session artifacts, not per-repo source)
```

No fallback heuristic exists for this category — see `gitignore-catalog.md`'s Skills CLI section for why.

### Deployment Detection

```
Deployment config files found?
  vercel.json       -> activate deployment, include .vercel/
  serverless.yml    -> activate deployment, include .serverless/
  firebase.json     -> activate deployment, include .firebase/
  (any match)       -> activate deployment category
  (no match)        -> skip deployment category
```

### Full Detection Decision Tree

```
Start
|
+-- Read config.json repos[].stack
|   +-- Stack entries found? --> Map to category keys
|   +-- No stack / no config --> Fall back to file detection
|
+-- Always include: universal, secrets, build, cache, ide
+-- Always include: macos, windows, linux
|
+-- Check .mcp.json for MCP tooling
+-- Check skills-lock.json at workspace root for Skills CLI
+-- Check for deployment config files
|
+-- Merge all activated categories
+-- Remove duplicates (same pattern from multiple categories)
+-- Sort by catalog order
+-- Output final pattern list
```

---

## 5. Migration from Old Marker Formats

When updating an existing workspace, the system may encounter older marker block formats that must be migrated to the current `fullstack-dev:gitignore` format.

### Old Format Detection

Two legacy formats exist:

**Format A: Equals-line markers (original)**

```gitignore
# ============================================
# Fullstack Dev Plugin -- auto-generated entries
# Do NOT remove this block manually
# ============================================
...patterns...
# ============================================
# End Fullstack Dev Plugin block
# ============================================
```

Detection: Search for `# Fullstack Dev Plugin` after a line of `# ====`.

**Format B: Generic chevron markers (intermediate)**

```gitignore
# >>> fullstack-dev >>>
...patterns...
# <<< fullstack-dev <<<
```

Detection: Search for `# >>> fullstack-dev >>>` (without the `:gitignore` qualifier).

### Migration Decision Tree

```
Read .gitignore
|
+-- Contains "fullstack-dev:gitignore" markers?
|   +-- YES --> Current format, no migration needed (use Section 2 merge rules)
|
+-- Contains old Format A markers? ("# Fullstack Dev Plugin" after "# ====")
|   +-- YES --> Migrate Format A
|
+-- Contains old Format B markers? ("# >>> fullstack-dev >>>" without ":gitignore")
|   +-- YES --> Migrate Format B
|
+-- No markers at all
    +-- Use Section 2 "no marker block" flow (prepend)
```

### Migration Procedure (same for Format A and Format B)

```
Step 1: Locate old markers
  Find start and end marker lines for the detected format

Step 2: Extract sub-repo entries
  Within the old block, find directory entries that are NOT standard
  catalog patterns:
  - Lines ending with / that don't match any catalog pattern
  - Lines under "# Sub-repositories" or "# Sub-repositories (each has its own git)"
  Collect these as sub-repo directories

Step 3: Extract user entries
  Everything outside the old marker block (both above and below)
  is preserved as user content

Step 4: Remove old marker block
  Delete everything from old start marker through old end marker (inclusive)

Step 5: Run tech-stack detection
  Use Section 4 heuristics to determine active categories

Step 6: Build new marker block
  Assemble patterns from catalog for all active categories
  Add extracted sub-repo directories under "# Sub-repositories"
  Use the canonical format from Section 1

Step 7: Write new .gitignore
  Place new marker block at top
  Append "# --- User entries below ---"
  Append all preserved user entries below

Step 8: Report migration
  Print: "Migrated .gitignore from legacy format to fullstack-dev:gitignore"
  List any sub-repo directories that were preserved
```

### Edge Cases

| Situation | Handling |
|---|---|
| Old block has patterns not in catalog | Treat as user entries, move below end marker |
| Old block has sub-repo entries | Preserve in new block under `# Sub-repositories` |
| Multiple old marker blocks | Migrate the first one found, treat others as user content |
| Old markers but empty block | Write new block with detected patterns only |
| Content exists both above and below old markers | Concatenate: content-above + new-block + content-below |

---

## 6. Scan Logic

How the system matches files against patterns to detect violations. Used by both the pre-commit hook (Section 3) and the manual scan command.

### Scan Modes

| Mode | File Source | When Used |
|---|---|---|
| **Pre-commit** | `git diff --cached --name-only` | Automatic on commit (hook) |
| **Full scan** | `git ls-files` | Manual scan command |
| **Tracked-only** | `git ls-files` filtered against `.gitignore` | Cleanup detection |

### Scan Procedure

```
Step 1: Get file list
  Pre-commit mode: git diff --cached --name-only
  Full scan mode:  git ls-files

Step 2: Get active patterns
  Read catalog categories for this repo (Section 4 detection)
  Flatten all patterns into a single list

Step 3: Match files against patterns
  For each file in the file list:
    For each pattern in the pattern list:
      +-- Pattern is a directory (ends with /)
      |   Match: file path starts with directory name
      |   Example: "node_modules/" matches "node_modules/express/index.js"
      |
      +-- Pattern has a wildcard (contains * or ?)
      |   Match: glob-style matching against filename component
      |   Example: "*.log" matches "debug.log", "errors/app.log"
      |
      +-- Pattern is a literal filename
      |   Match: exact filename match (any directory depth)
      |   Example: ".DS_Store" matches ".DS_Store", "assets/.DS_Store"
      |
      +-- Pattern has negation prefix (!)
          Skip: negation patterns exclude files from ignore
          These are handled by git natively, not by the scanner

Step 4: Build report
  For each matched file, record:
    - file_path: relative path of the matched file
    - pattern: the pattern that matched
    - category: which catalog category the pattern belongs to
```

### Report Format

```
Scan results:
  node_modules/express/index.js  ->  node_modules/  (Universal)
  .env                           ->  .env           (Secrets)
  .next/cache/webpack.json       ->  .next/         (Next.js)

  3 tracked files match ignore patterns.
  Run cleanup to untrack them.
```

### Pre-commit vs Full Scan Differences

| Aspect | Pre-commit | Full Scan |
|---|---|---|
| File source | Staged files only | All tracked files |
| Pattern source | 18 hardcoded essentials | Full catalog (active categories) |
| On violation | Auto-fix (unstage + add pattern) | Report only (suggest cleanup) |
| Exit behavior | Exit 1 to block commit | Exit 0 (informational) |

---

## 7. Cleanup Logic

The `git rm --cached` workflow for untracking files that should be ignored. Runs after a scan finds tracked files matching ignore patterns.

### Cleanup Decision Tree

```
Scan found tracked files matching ignore patterns?
+-- NO --> "Nothing to clean up." EXIT
+-- YES --> Check for --dry-run flag
    |
    +-- --dry-run provided
    |   Print what would be removed (no changes made)
    |   EXIT
    |
    +-- No --dry-run (live mode)
        Proceed to cleanup steps
```

### Cleanup Steps

```
Step 1: Verify .gitignore
  Ensure all patterns for matched files exist in .gitignore
  +-- Missing patterns? --> Add them to marker block first (Section 2)
  +-- All present? --> Continue

Step 1a: Skills-CLI first-activation check (only when the skills-cli category is part of this cleanup run)
  Determine first-time activation from config.json's gitIgnore.categoriesEverActivated
  (a persistent array that only ever grows — distinct from the live-redetected
  activeCategories snapshot, which can drop skills-cli back out if skills-lock.json
  is briefly absent between runs).

  +-- skills-cli already in categoriesEverActivated?
  |   +-- YES --> Skip the diff/mtime check below. Untrack directly (Step 3).
  |   +-- NO  --> This is the first activation. Branch on repo shape:
  |
  +-- Self-hosting case (a root skills/ directory of authored content
  |   literally exists -- true for this plugin's own repo, not for a
  |   typical downstream target project):
  |       Compare .claude/skills/ content against root skills/.
  |       +-- Differ --> Warn the user before untracking (possible
  |       |   manual edit to a mirror instead of the source) instead
  |       |   of silently dropping the file from git.
  |       +-- Identical --> Untrack as usual (Step 3).
  |
  +-- General target-project case (no root skills/ directory to
      compare against -- the normal case for every project that
      installs this plugin):
          Skip the content-diff entirely (no source of truth to diff
          against). Instead, warn only if any file under .claude/skills/
          has an mtime newer than skills-lock.json's own mtime -- a
          signal of a possible post-install manual edit, without
          requiring a comparison directory that doesn't exist here.

  Either way, once evaluated, add skills-cli to categoriesEverActivated
  so subsequent runs skip straight to Step 3.

Step 2: Group by pattern type
  Directory patterns (ending with /):
    Collect: all matched file paths under each directory
  File patterns (everything else):
    Collect: all matched individual file paths

Step 3: Execute removal
  For each directory pattern:
    git rm -r --cached <directory>
    +-- Success --> Log: "Untracked: <directory>/ (N files)"
    +-- Error: "pathspec did not match" --> Skip (already untracked)
    +-- Error: staged changes conflict -->
        Skip this directory
        Warn: "Skipped <directory>/ -- has staged changes. Commit or reset first."

  For each file pattern:
    git rm --cached <file>
    +-- Success --> Log: "Untracked: <file>"
    +-- Error: "pathspec did not match" --> Skip (already untracked)
    +-- Error: staged changes conflict -->
        Skip this file
        Warn: "Skipped <file> -- has staged changes. Commit or reset first."

Step 4: Stage .gitignore if modified
  If patterns were added in Step 1:
    git add .gitignore

Step 5: Report summary
  Print:
    Untracked: N file(s) across M directories
    Skipped: K file(s) (staged changes)
    .gitignore updated: yes/no
```

### Dry-Run Output

When `--dry-run` is provided, print the planned actions without executing:

```
Dry run -- no changes will be made:

  Would untrack:
    node_modules/     (directory, ~2,400 files)
    .next/            (directory, ~150 files)
    .env              (file)
    .DS_Store         (file)

  Would add to .gitignore:
    (none -- all patterns already present)

  Run without --dry-run to execute.
```

### Commit After Cleanup

After a successful cleanup (not dry-run), suggest committing the removal:

```
Suggested commit:
  git add -A
  git commit -m "chore(gitignore): untrack ignored files"
```

The commit message is always `chore(gitignore): untrack ignored files` for consistency. The body can optionally list the patterns that were cleaned up.

### Error Handling

| Error | Handling |
|---|---|
| `git rm` fails with "has staged changes" | Skip the file, warn the user, continue with remaining files |
| `git rm` fails with "pathspec did not match" | Skip silently (file already untracked) |
| `.gitignore` is read-only | Abort cleanup, print error |
| Not inside a git repository | Abort cleanup, print error |
| No files match any patterns | Print "Nothing to clean up", exit |
