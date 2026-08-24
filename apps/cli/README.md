# GitLeap CLI

The installed `gitleap` binary is the first product client for the MVP. The
hosted product flow issues a bearer token during web onboarding; after
installation, save it and use
`gitleap pull` from a normal terminal. It shows the live ingestion pipeline and
opens the interactive Skills Explorer only after compilation completes.

Run `gitleap` directly for the interactive terminal console. It provides keyboard-navigable
authentication, repository submission, and live job status screens while the
scripted commands remain available for automation.

`gitleap cli` and `gitleap ui` are development/inspection aliases. The public
flow is `gitleap auth login <token>` followed by `gitleap pull <github-url>`.
The pull pipeline requires a TTY; use the scripted commands below for
non-interactive automation.

The UI contract is defined in the repository [`DESIGN.md`](../../DESIGN.md).
The framework-agnostic tokens and terminal math live in
[`packages/design`](../../packages/design) and are re-exported by
[`src/theme.ts`](src/theme.ts) for the CLI.

## Run locally

```bash
bun run dev:server
bun run dev:cli
```

Set `GITLEAP_SERVER_URL` when the server is not at `http://localhost:3000`.

## Authentication

```bash
gitleap auth login <token>
```

The token is stored in the mode-600 session file and sent as a Bearer
credential. Hosted endpoints must use HTTPS; local development defaults to
`http://localhost:3000`. The local server maps that opaque bearer value through
its Better Auth session lookup; hosted OAuth, installer delivery, and token
issuance are deployment boundaries outside this repository. Email/password
login remains available for local development:

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

`pull` submits, shows the live pipeline, and opens the dashboard when ready. It
sends `HEAD` by default; the server resolves it to an immutable commit before
processing. `run` submits and polls without the dashboard. Both exit non-zero
unless the job reaches `ready`; neither downloads automatically.
Use `download` after a ready result.

## Build

```bash
bun run build:cli
bun run compile:cli
```
