# Public Suffix List (PSL)

Use when deciding whether to submit a tenant domain to the PSL.

## What the PSL does

- Defines public suffixes where users can register names.
- Browsers use it to cap cookie scope (e.g. no cookies on `.co.uk`).
- Shared cross-vendor list; registry rules vary and cannot be derived.

## Why it matters for multi-tenant platforms

- Listing blocks cookies on the tenant suffix, isolating sibling subdomains.
- Isolation only; it does not confer trust or reputation.

## Eligibility before submitting

Needing isolation does not make a platform eligible. Run [psl-readiness.md](psl-readiness.md) before recommending a submission.

- Only a live, public production service already serving thousands of distinct users on the suffix qualifies. Pre-launch, private beta, invite-only, waitlist, and demo-only services are declined, and projected users do not count. Record `Defer` and use interim cookie controls instead.
- Production suffixes only; staging, preview, sandbox, test, and lab entries are declined.
- Registration must have more than two years remaining, with a commitment to keep more than one year.

## Submission and validation (private domains)

- Private domains with untrusted subdomains can request PRIVATE inclusion once eligible.
- Submit a GitHub PR (owner/authorized rep only) using `.github/pull_request_template.md` exactly as provided.
- Use a role-based `// Submitted by` address and provide an abuse contact reachable from the suffix.
- Prefer DNS proof: `_psl.<suffix>` TXT with a PR link (RFC8553).
- Include a rationale (UGC/third-party subdomains), current user count, and live example hostnames; review has no fixed timeline.
- Not a security or trust signal; must not bypass third-party limits or tracking protections.

## Interim controls (while deferred)

- Keep dashboard and auth on a different apex from tenant subdomains.
- Use host-only `__Host-` session cookies (`Secure; Path=/`, no `Domain`).
- Validate `Origin` or use CSRF tokens on state-changing requests.

## Sources

- https://publicsuffix.org/learn/index.html
- https://publicsuffix.org/submit/
- https://raw.githubusercontent.com/wiki/publicsuffix/list/Guidelines.md
- https://wiki.mozilla.org/Public_Suffix_List
