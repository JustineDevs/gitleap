# GitLeap CLI

The CLI is the first product client for the MVP. It supports login, submission
of a pinned public GitHub revision, status polling, cancellation, and authorized
artifact download through the shared tRPC contract.

Run `gitleap` directly for the interactive terminal console. It provides keyboard-navigable
authentication, repository submission, and live job status screens while the
scripted commands remain available for automation.

`gitleap cli` and `gitleap ui` are explicit interactive aliases. The default
console and the `pull` pipeline require a TTY; use the scripted commands below
for non-interactive automation.

The UI contract and design tokens live in [`src/theme.ts`](src/theme.ts) and
are covered by the terminal navigation tests.

## Run locally

```bash
bun run dev:server
bun run dev:cli
```

Set `GITLEAP_SERVER_URL` when the server is not at `http://localhost:3000`.

## Authentication

```bash
GITLEAP_EMAIL=you@example.com GITLEAP_PASSWORD='password' \
  bun run dev:cli -- login
```

The session cookie is stored at `${XDG_CONFIG_HOME:-$HOME/.config}/gitleap/session`
with restrictive permissions. `GITLEAP_SESSION_COOKIE` can override it for CI.

## Processing

```bash
bun run dev:cli -- submit https://github.com/org/repo --revision <commit-sha>
bun run dev:cli -- status <job-id>
bun run dev:cli -- cancel <job-id> --version <version>
bun run dev:cli -- download <job-id> --output ./artifacts/job.tar.gz
bun run dev:cli -- run https://github.com/org/repo --revision <commit-sha>
```

`run` and `pull` submit and poll until a terminal state. `pull` sends `HEAD` by
default; the server resolves it to an immutable commit before processing. Both
exit non-zero unless the job reaches `ready`; neither downloads automatically.
Use `download` after a ready result.

## Build

```bash
bun run build:cli
bun run compile:cli
```
