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

**APP3 intake lanes and limits are locked** (`APP3-G04` / IMP-D044 PO-02…PO-05,
PO-08, 2026-08-04). Three processing profiles produce the one editor-safe
derivative kind; they are application/worker policy and never a database enum.

| Profile | Actor | Accepted source | SVG |
|---|---|---|---|
| `SIDE_BACKGROUND` | Admin (store-authored `CATALOG_MEDIA`) | JPEG, PNG, WebP | **rejected** |
| `TEMPLATE_ASSET` | authenticated **Admin** (`TEMPLATE_SOURCE`) | JPEG, PNG, WebP, SVG | accepted **only** after mandatory server-side sanitization |
| `SESSION_UPLOAD` | valid anonymous Design Session credential | JPEG, PNG, WebP | **rejected in APP3** — there is no anonymous SVG intake |

Locked source limits: raster upload **10 MiB**, intrinsic **4096 × 4096 px**,
**16,777,216** decoded pixels per asset; Admin SVG source **1 MiB**, **10,000**
sanitized nodes, **1,000,000** path-data characters. Compressed byte size never
overrides the decoded-pixel limit, and decoders are protected against
decompression bombs.

Admin SVG sanitization is **server-side and mandatory**, and must reject or
remove at least `script`, event-handler attributes, `foreignObject`, external
URLs, remote fonts, embedded HTML, `data:`/`blob:`/`javascript:` URLs,
animation, filters outside the approved subset, unbounded path/node complexity,
and a missing or invalid `viewBox`. The sanitized derivative is self-contained
and the original SVG never reaches the Studio.

**Sanitizer authority (`IMP-D047`, `APP3-G07`).** The sanitizer is locked:
**DOMPurify on server-side Node with jsdom** — `dompurify@3.4.13`
(`MPL-2.0 OR Apache-2.0`, zero runtime dependencies) as the active-content and
XSS defence layer, `jsdom@29.1.1` (`MIT`) as the DOM, both pinned exactly.
`jsdom@30` is deliberately not selected: it requires Node `^22.22.2` and the
locked runtime is `22.14.0`. DOMPurify's **defaults are not the policy** — it
runs in the SVG namespace with HTML and MathML disabled and XML parsing retained,
and `DOMPurify.removed` is diagnostic only, never the security decision. APP3
adds explicit element and attribute allowlists (`svg`, `g`, `path`, `rect`,
`circle`, `ellipse`, `line`, `polyline`, `polygon` and nothing else), a
closed value grammar, total refusal of URLs, CSS, references and fonts, the
complexity limits above, deterministic canonical serialization and a **fixed-point
second pass** whose bytes must equal the first. Any unsupported element,
attribute or value **rejects the whole file** as
`UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG`; content is never silently removed, because
a Template that renders differently from what an Admin approved is worse than a
refused upload. SVGO is an optimizer, not a sanitizer, and never runs after
sanitization — DOMPurify's own documentation warns that modifying markup
afterwards can void the sanitization. No regex sanitizer, no headless browser, no
`isomorphic-dompurify` wrapper, and Sharp never rasterizes a Template SVG.
`TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = 1` is worker policy, not a database
column; changing the dependencies, allowlists, grammar, limits or serializer
requires security review, a corpus rerun and a version increase.

Template SVG remains **authorized but operationally unavailable** until
`APP3-W01B` implements this authority: it is still **rejected safely** today.
Sanitization also does not authorize delivery — a sanitized Template SVG stays
private, unwatermarked, `NORMALIZED` and Template-owned, with no public ACL, no
data URL, no inline HTML embedding and no download endpoint. This is staged
delivery, not a removal of the requirement.

**Editor-safe normalization is association-bound.** Normalization runs only when
a Product Side, Template or Design Session association is created or changed, on
one event appended in that same transaction. Uploading an asset never makes it
Studio-eligible on its own, and the worker re-derives the processing profile from
the association at claim time rather than trusting anything in the message.

**Anonymous Session uploads are API-owned and streamed** (`IMP-D048`,
`APP3-G08`). A customer's Design Session upload reaches storage only by
streaming through the API, which authorizes the Session, validates the bounded
upload and writes the private object itself. The browser is never given a
storage endpoint, a presigned URL, a storage credential or an upload token, and
`ObjectStoragePort` exposes no presign operation — a presign capability would
create a delivery path that bypasses the publication check. There is no
upload-intent/completion pair and no second upload-token architecture: one
multipart operation carries the whole lane, under the same streaming byte
enforcement, media allowlist and private-object rules as Admin intake, with a
**10 MiB** source limit and `image/jpeg`, `image/png`, `image/webp` only. The
uploaded original stays private and is never delivered by a generic route.

**Anonymous Session credentials are minted once and rotated on resume**
(`APP3-B07`). Creation issues 256 CSPRNG bits, persists only
`HMAC-SHA-256(pepper, secret)` and returns the raw value solely in
`__Host-nettheu_ds_<session-id>`; it never appears in JSON, a URL, a log, an
Audit payload or the OpenAPI contract. Resume replaces the digest in one guarded
statement keyed on the current one, so exactly one racing caller wins, the old
secret dies immediately and there is no grace window. Rotation extends neither
the absolute 30-day TTL nor the document revision.

## 5. Asset access

- Private assets require authorization.
- Expiring signed URLs where appropriate.
- Original store-owned templates are not public by default.
- Production files are strictly internal.
- Customer previews should be lower-value derivatives.
- Direct object storage listing is prohibited.

**APP3 has exactly three delivery classes** (`APP3-G04` / IMP-D044 PO-06, PO-07):
the Product Side background and the published Template asset, both delivered
publicly **only through their owning context**; and the Session upload, delivered
privately behind the Session id plus its matching per-session cookie, as
`private, no-store`, re-authenticated on every request.

There is **no generic public Asset endpoint** — no `GET /assets/:id`. No API
response carries an object-storage key or a private original URL, no direct
object-storage URL is durable document authority, APP1 staff auth is never used
for Storefront delivery, and APP3 adds no `secure_access_grants` purpose or
schema extension. A contextual stream or reference is not permission to reach
another derivative of the same Asset.

A derivative is Studio-eligible only when it is READY, of the editor-safe kind,
and carries `width_px`, `height_px`, `media_type` and `byte_size`. Those live on
the derivative row: `assets.mime_type`/`assets.size_bytes` describe the **source
binary** and are never substituted for them, and `asset_inspections.detail` is
append-only evidence, never runtime authority. Missing dimensions make a
derivative ineligible; they are never guessed.

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

**Autosave is the first operation to spend the mutation budget in bulk**
(`APP3-B08`, 2026-08-08). It replaces the whole working document under a single
atomic compare-and-set on the session's `autosave_revision`, so a save that
arrives against a revision the client has not read is refused with `409` and
writes nothing. Three consequences are security properties, not implementation
detail:

- **A save is never replayed blindly.** There is deliberately no idempotency
  record for autosave. A client whose response was lost must refetch and re-save;
  repeating the request would resurrect an edit the customer may already have
  undone.
- **Typing does not extend a session.** The 30-day lifetime stays absolute
  (PO-06); autosave never touches `expires_at`, never issues a cookie and never
  rotates the secret.
- **A document can only ever reference media the session is entitled to.** The
  derivative authority handed to validation contains only Assets this session
  uploaded plus those its already-accepted document referenced, so a
  cross-session reference fails because it was never in the allowlist rather
  than because a comparison caught it. Eligibility is read from canonical
  persistence metadata; validating a document never reads object storage
  (IMP-D044).

Autosave **cadence** — debounce, retry timing, offline queueing — is a Studio
concern owned by `APP3-S11` and is deliberately absent from backend authority.

The network key is an **ephemeral HMAC of normalized source network data under a
rotating runtime salt** — raw IP is never persisted in Design Session tables, and
the key is not ownership or customer identity. APP3 creates **no durable browser
identity** and **no "N active sessions per browser" quota**. Rate-limit responses
reveal no session existence, and rate limiting never replaces the credential or
revision check.

**Design document complexity limits are locked** (`APP3-G04` / IMP-D044 PO-09,
2026-08-04). One Template Version or Design Session document is bounded at
**512 KiB** serialized, **100 elements** in total, 20 image elements, 80 text
elements, 20 unique referenced assets, nesting depth 8, 500 characters per text
element, 5,000 total text characters, and **33,554,432** decoded pixels across
unique referenced image assets. Enforcement is server-side; client checks are
early feedback only. A rejected document is not partially saved. Hidden, locked
and off-canvas elements still count; a repeated Asset counts once toward the
asset and pixel budgets while each image element counts toward the image total;
runtime overlays never count. No checkpoint may silently raise these values.

Documents store a server-owned `fontId`, never a CSS family, a font URL or font
bytes. There is no remote runtime font, no user-uploaded font and no
Template-embedded font bytes; an unknown `fontId` fails validation and a missing
font never silently substitutes a geometry-changing face.

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
