# @gitleap/oss-integrations

The package provides the required OSS adapters used by GitLeap's development
and documentation pipeline:

- Repomix packs a repository through its installed CLI. Repomix respects the
  repository ignore files, and GitLeap adds explicit sensitive-file exclusions.
- Stop-slop is installed from its upstream skill repository and contributes its
  `SKILL.md` instructions to a generated writing prompt.
- Humanizer-zh is installed from its upstream skill repository and contributes
  its Chinese writing instructions to a generated writing prompt.

Stop-slop and humanizer-zh are Claude/agent skills, not standalone text
rewriting executables. The adapter therefore does not claim to rewrite text by
itself. It installs the upstream assets and creates the exact prompt artifact
for the configured agent to process.

## Commands

```bash
bun run oss:repomix -- --cwd . --output /tmp/gitleap-repomix.xml --style markdown
bun run oss:install -- stop-slop
bun run oss:install -- humanizer-zh
bun run oss:prompt -- stop-slop --input docs/DRAFT.md --output /tmp/draft.prompt.md
```

The installation command uses fixed upstream URLs, `git clone --depth 1`, and
`git pull --ff-only`. No shell interpolation is used. Prompt generation fails
when the requested upstream `SKILL.md` is missing.
