# 09 — Security and Abuse Prevention

**Status:** Product security baseline  
**Version:** 0.1.0

## 1. Security objectives

- Protect customer data.
- Protect design assets.
- Prevent unauthorized export.
- Reduce editor abuse.
- Protect Admin account.
- Prevent payment manipulation.
- Preserve audit evidence.
- Maintain recoverability.

## 2. Customer access

- Customer may use guest flow.
- Submission requires verification.
- Secure links must be unguessable.
- Secure links should be revocable or expire.
- Sensitive actions may require re-verification.
- Customer can access only their own request.

## 3. Admin access

- Strong password policy.
- MFA is strongly recommended.
- Rate limiting.
- Login alerts where practical.
- Secure session handling.
- Session revocation.
- Recovery procedure.
- No hard-coded credentials.

## 4. File upload security

Uploads must be validated by:

- Size.
- MIME type.
- File signature.
- Extension consistency.
- Image decode.
- SVG sanitization.
- Malware scanning where practical.
- Pixel dimension limit.
- Processing timeout.
- Storage isolation.

Never trust client-provided MIME type.

## 5. Asset access

- Private assets require authorization.
- Expiring signed URLs where appropriate.
- Original store-owned templates are not public by default.
- Production files are strictly internal.
- Customer previews should be lower-value derivatives.
- Direct object storage listing is prohibited.

## 6. Watermark strategy

Use layered controls:

- Repeated watermark.
- Dynamic request/session identifier.
- Optional masked customer identifier.
- Limited resolution.
- No export UI.
- No stable public preview URL.
- Rate limiting.
- Abuse monitoring.

Do not claim absolute screenshot prevention.

## 7. Abuse prevention

Protect editor and upload services with:

- Request throttling.
- Session quota.
- Upload quota.
- Concurrent session limits.
- CAPTCHA or challenge when risk is high.
- Spam detection.
- Duplicate request detection.
- Expiration of abandoned sessions.
- Admin blocklist or denylist capability.

**Anonymous Design Session limits are locked** (`APP3-G03` / IMP-D043 PO-07,
2026-08-04):

| Control | Limit | Key |
|---|---|---|
| Session creation | 5 / hour (burst 2 / minute) | ephemeral network key |
| Bootstrap, resume, read | 60 / minute | ephemeral network key |
| Authorization failures | 10 / 15 minutes | ephemeral network key **and** session id |
| Authorized mutations | 30 / minute | session id |
| Concurrent mutations | 1 in flight | session id |

The network key is an **ephemeral HMAC of normalized source network data under a
rotating runtime salt** — raw IP is never persisted in Design Session tables, and
the key is not ownership or customer identity. APP3 creates **no durable browser
identity** and **no "N active sessions per browser" quota**. Rate-limit responses
reveal no session existence, and rate limiting never replaces the credential or
revision check.

## 8. Payment security

- Server-side amount verification.
- Idempotency.
- Signature verification.
- Replay protection.
- Currency verification.
- Order reference verification.
- Provider reconciliation.
- Never trust redirect query alone.
- Sensitive provider payloads must not be logged in full.

## 9. Application security

Baseline controls:

- Server-side authorization.
- CSRF protection where applicable.
- XSS prevention.
- SQL injection prevention.
- Secure headers.
- Content Security Policy.
- Clickjacking protection.
- Rate limiting.
- Dependency scanning.
- Secret management.
- Secure cookie configuration.
- Input validation.

**Anonymous Design Session credential transport** (`APP3-G03` / IMP-D043
PO-01…PO-05). The raw session secret — 32 CSPRNG bytes, unpadded base64url,
persisted only as `HMAC-SHA-256(runtime pepper, secret)` and compared in
constant time — travels **only** in the per-session cookie
`__Host-nettheu_ds_<session-id>` with `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/`, no `Domain`, and `Max-Age` never beyond
`expires_at`. It is never placed in a URL, query, fragment, JSON body,
`Authorization` header, log, Audit payload, telemetry, exception or browser
storage, and it is never carried by the APP1 staff cookie. Ownership needs the
public id **and** the secret. Every state-changing request additionally requires
an exact allowed `Origin`, an allowed `Sec-Fetch-Site` and the expected
concurrency revision; credentialed cross-origin CORS is disabled and
`SameSite` alone is not a sufficient defence. Unauthorized, missing, expired
and wrong-chain requests share **one** safe external status, code and message so
no response reveals whether a session id exists.
- Output encoding.

## 9a. Local credential and environment-file handling

These rules bind every contributor, human or automated, and apply to all local
environment files (`.env` and any variant), all developer and operator accounts,
and every form of testing including live, smoke, browser and end-to-end runs.

**A local environment file is read-only to tooling and to automation.**

- Never write, overwrite, append to, rewrite, reformat or "fix" `.env`. It is the
  developer's own file and the only place a local credential exists; a silent
  edit destroys a value that has no other copy and no version history.
- Never generate a credential into `.env`, and never persist a generated test
  credential anywhere on the developer's machine.
- A tool that needs generated credentials must pass them through a child
  process's environment or write to a disposable file it owns (for example a
  temporary `smoke.env`), never to the repository-root `.env`.

**Secret-bearing variables are requested, never taken.**

The ask-first rule applies **only to variables whose value is itself a secret**,
not to environment configuration generally. Which variables those are is
resolved at read time, never from a list hard-coded in this document — a fixed
table is correct only on the day it is written.

**Resolution order.** A variable is protected if *any* of these holds:

1. **It is named in `.env-ignore`.** One variable name per line, `#` for
   comments, values never appear. The file is git-ignored for the same reason
   `.env` is; `.env-ignore.example` is committed so the mechanism is
   discoverable on a fresh clone.
2. **Its name matches a secret-bearing pattern** — contains `PASSWORD`,
   `PASSWD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL` or `PRIVATE`. This applies
   independently of the file, so a newly added secret is protected on the day it
   appears rather than on the day someone remembers to list it.
3. **`.env-ignore` does not exist** — then *every* variable is protected until it
   does. A missing configuration file must mean maximum caution; a protection
   list that fails open is worse than none, because it fails silently.

The three combine by union and can only ever widen protection. The file exists
to name secrets the pattern cannot guess — `DATABASE_URL` is the standing
example: nothing in its name suggests a secret, yet it embeds
`POSTGRES_PASSWORD` — and to let a team protect anything else deliberately.

Everything not caught by the three — hosts, ports, timeouts, pool sizes,
`NODE_ENV`, `POSTGRES_DB`, `POSTGRES_USER`, base paths, display names — is
ordinary configuration and may be read freely without asking.

For a protected variable:

- When a task needs one **as a value it will handle itself** — typing a password
  into a login form, authenticating as the operator, constructing a request —
  ask the human operator to supply it through the prompt for that run. A value
  being present on disk is not permission to use it.
- Use the supplied value only for the run it was given for. Do not cache it,
  echo it, log it, write it to a report or fixture, or pass it as a command-line
  argument, where it would enter shell history and process listings.
- Automated tests use a synthetic, clearly non-production value. A real
  credential never appears in a fixture.

**What remains allowed, deliberately.** Handing the whole file to tooling that
consumes it itself — `docker compose --env-file .env …`, a package script, a
container's `environment:` block — is fine and stays the normal path. The secret
travels from file to process without ever becoming a value that was read out,
printed, or passed along. The line this rule draws is not "the file is
untouchable"; it is **a secret must never become a value held or echoed outside
the process that consumes it.**

**Rotation is a human decision.**

- Never rotate, reset or re-seed an account credential to make a test pass. The
  bootstrap CLI's default mode is idempotent by design and must stay that way;
  `--rotate` is an operator recovery path and is run by the operator.
- If a change to a credential ever becomes genuinely unavoidable, restoring the
  original value is part of the same task, not a follow-up.

**Why this is stated so strictly.** A credential edited in place is
unrecoverable: `.env` is git-ignored, so there is no diff, no history and no
review step that would catch it. The damage is silent, it is discovered later by
an unrelated login failure, and by then the original value is gone. That is why
the rule is "ask", not "read carefully".

## 10. Data retention

Retention periods remain to be finalized, **except the temporary editor
session**, which is locked by `APP3-G03` / IMP-D043 PO-06 (2026-08-04):
`SESSION_TTL = 30 days` **absolute from `created_at`**, never slid by reads,
resume, rotation or autosave; `ACTIVE → EXPIRED` on an hourly sweep
(`TR-LC07-04`); hard delete after a **24-hour** `EXPIRED` grace
(`TR-LC07-05`), scoped to the session family owned exclusively by that session.
`SUBMITTED` session retention belongs to APP5.

Policy must distinguish:

- Temporary editor session.
- Submitted request.
- Customer upload.
- Approved design.
- Production file.
- Payment record.
- Audit log.
- Backup.

## 11. Backup security

- Backup must be encrypted or access-controlled.
- Backup must exist outside the store’s primary server.
- Restore must be tested.
- Backup deletion policy must be documented.
