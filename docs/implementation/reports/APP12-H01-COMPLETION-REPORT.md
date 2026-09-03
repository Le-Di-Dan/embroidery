# APP12-H01 — Authorization and Security Audit (Wave 1)

```text
CHECKPOINT      = APP12-H01
PHASE           = APP12 — Hardening, UAT and Production Readiness
STATUS          = COMPLETE
DATE            = 2026-09-03
TIERS           = audit + fixes (§A–§AB) · PO live-acceptance continuation (§AC)
CORRECTION_USED = 0 / 1
NEXT            = APP12-H02
PUSHED          = false
```

---

## A. Verdict

`APP12-H01` is **COMPLETE**.

The Wave-1 attack surface was audited mechanically rather than from route names
or memory: 138 published operations classified against the guards that actually
run, 46 Storefront and Admin routes classified against the gates that actually
enforce them, and the release matrix proved to *partition* the public surface
exactly. Five findings were raised. Three were fixed inside H01's authority and
re-proved live; two are recorded with owners.

```text
BLOCKER = 0
HIGH    = 0   (1 raised, fixed and re-verified live)
MEDIUM  = 1   (raised, fixed and re-verified live)
LOW     = 3   (2 fixed here; 1 routed to APP12-H06)

authorization_matrix = PASS
denial_matrix        = PASS
```

The two findings that mattered were both **absent hardening rather than broken
authorization**: every surface answered `X-Powered-By`, and no surface published
a Content-Security-Policy at all. Both are now closed and proved by live capture
on all three surfaces.

A Product Owner continuation (§AC) then completed the mandatory **live**
acceptance the audit had argued from source: **12 journeys, all green**, on
disposable infrastructure, in real Chromium, against the real API, worker,
Storefront, Admin and gateway.

```text
A1 authenticated /orders under CSP        PASS      G  upload abuse matrix        PASS
A2 authenticated /categories under CSP    PASS      H  grant death                PASS
A3 framework disclosure                   PASS      F1 Wave-2 ON REQUEST_ACCESS   PASS
B  unverified create denied               PASS      F2 scope crossover, both ways PASS
C  real ORDER_ACCESS, no observable token PASS      F3 server-issued landings     PASS
D  STEP_UP required before initiate       PASS      rate-limit threshold          PASS
E  real credential A vs order B's attempt PASS
```

No shared staff credential was requested or read: the harness mints a synthetic
per-run operator in memory (§AC.2).

What the audit did **not** find is worth stating as plainly as what it did. There
is no authorization bypass, no cross-order IDOR, no scope crossover, no secure
token in a log or a URL, no anonymous private-asset read, no path traversal, no
SSRF surface of any kind, and no Wave-2 customer access while the flag is off.
Several of those are unreachable by construction rather than by check, and §I and
§M record why.

```text
NEW_HTTP_OPERATIONS = 0
NEW_ROUTES          = 0
MIGRATIONS          = 38   (DB schema delta 0)
OPENAPI             = 125 paths / 138 operations / 278 schemas   (unchanged)
PUBLIC_OPERATIONS   = 49                                          (unchanged)
RELEASE_MATRIX      = 28 DENY / 18 ALLOW / 3 SCOPE_GATED          (unchanged)
FIGMA               = unchanged (0 reads, 0 writes)
```

---

## B. A02-C1 PO reconciliation

`APP12-A02-C1` is `COMPLETE — PO PASS` and `APP12-A02` is
`COMPLETE_AFTER_C1`. Neither was reopened. The A02 + C1 delivery was committed
unchanged at entry (`c480162e`, 75 files) before any H01 work began, so every
diff in §V belongs to this checkpoint and to nothing else.

The accepted baseline was re-measured rather than assumed, and holds exactly —
see §Z.

---

## C. Preflight inventory

Mechanical, from the published artifact and the source, before any edit.

### The 138 operations by surface

```text
ADMIN   84    /api/admin/*
PUBLIC  49    /api/public/*
STAFF    3    /api/staff/*
HEALTH   2    /api/health, /api/health/readiness
─────────
TOTAL  138
```

### Guard coverage, read off the decorators

Every one of the 84 Admin operations sits under a controller carrying
`AuthenticatedAdminGuard`; there is no Admin controller without it. Mutating
Admin operations additionally carry `StaffOriginGuard` and, where they take a
JSON body, `StaffJsonBodyGuard`. `GET /api/staff/me` and
`DELETE /api/staff/session` carry `AuthenticatedAdminGuard`;
`POST /api/staff/session` is the login itself and carries the origin and
body guards.

### Guards and gates that exist at all

```text
platform/release-gate/custom-capability-release.guard.ts   global, Wave-2
identity/presentation/guards/authenticated-admin.guard.ts  staff session
identity/presentation/guards/staff-origin.guard.ts         cross-origin writes
identity/presentation/guards/staff-json-body.guard.ts      content-type
design/presentation/guards/design-session.guard.ts         Wave-2 only
design/presentation/guards/design-session-read.guard.ts    Wave-2 only
```

Rate limiters: `SecureLinkRateLimiter`, `LoginRateLimiter`,
`DesignSessionRateLimiter`, all over one `SlidingWindowRateLimiter`. Verification
is limited durably instead — see §L.

---

## D. Route authorization matrix

```text
Storefront page routes  20   (+ robots.ts, sitemap.ts, healthz — not pages)
Admin page routes       26   (+ healthz — not a page)
```

Both counts match the frozen baseline exactly.

### Storefront

| Class | Routes | Enforced by |
|---|---|---|
| `PUBLIC_ANONYMOUS` | `/`, `/kham-pha`, `/cua-hang`, `/bo-suu-tap`, `/bo-suu-tap/[slug]`, `/san-pham/[slug]`, `/dich-vu`, `/cau-hoi-thuong-gap`, `/chinh-sach/[slug]` | none needed |
| `PUBLIC_ANONYMOUS` (Wave-1 commerce) | `/mua-hang/[slug]`, `/xac-minh-lien-he` | verification is enforced server-side at order creation |
| `ORDER_ACCESS` | `/truy-cap/don-hang` | fragment token → API; the page itself renders empty without one |
| `SCOPE_DISPATCH` | `/truy-cap` | resolves the grant server-side and forwards by its scope |
| `WITHHELD_WAVE2` (7) | `/yeu-cau/moi`, `/yeu-cau/da-gui`, `/truy-cap/bao-gia`, `/truy-cap/duyet-thiet-ke`, `/truy-cap/thanh-toan`, `/truy-cap/thanh-toan-con-lai`, `/san-pham/[slug]/thiet-ke` | `src/proxy.ts` rewrite → 404 |

### Admin

25 routes sit under `(protected)`; `/login` is the 26th. `src/proxy.ts` performs
cookie-presence redirection only and never reads the HttpOnly value — the real
decision is `AuthenticatedAdminGuard` at the API, which is what makes the client
gate unbypassable in any way that matters.

---

## E. API authorization matrix

Classified by the guard that actually runs, not by path shape.

| Class | Count | Basis |
|---|---|---|
| `STAFF_ADMIN` | 86 | `AuthenticatedAdminGuard` (84 admin + 2 staff) |
| `PUBLIC_ANONYMOUS` | 3 | staff login, and the 2 health probes |
| `PUBLIC_ANONYMOUS` (catalog/content) | 12 | products, categories, gallery, sitemap, media |
| `VERIFIED_CONTACT` | 5 | 4 verification operations + Ready-Made create |
| `ORDER_ACCESS` | 4 | Ready-Made read + the three FULL payment operations |
| `SCOPE_GATED` | 3 | secure-link resolve + the two evidence operations |
| `REQUEST_ACCESS` / Wave-2 | 25 | withheld entirely while the flag is off |
| **Total** | **138** | |

The `INTERNAL_WORKER` class is empty and that is a finding in its own right: the
worker has **no HTTP entry point**. It reaches the system through the database
outbox only, so there is no internal endpoint to authenticate, expose or
accidentally publish through the gateway.

---

## F. Wave isolation

With `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`, against the real stack.

### The release matrix is a partition, not a list

The strongest mechanical result in this checkpoint:

```text
STATIC_DENY   28
STATIC_ALLOW  18
SCOPE_GATED    3
──────────────── 49
public operations in the published artifact = 49

spec operations not classified : []
classified operations not in spec: []
duplicate classifications        : none
```

Both directions are empty. An operation cannot be added to the public surface
without landing in exactly one of the three sets, and the assertion that proves
it now lives in `admin-category.contract.spec.ts` — see §U, where a stale count
assertion was replaced by this partition check.

### Live API denial (flag OFF)

Ten `STATIC_DENY` operations sampled across all five Wave-2 families answered
**404** with the generic not-found envelope — no flag name, no wave, no hint:

```text
GET  /public/design-templates                       404
GET  /public/products/{slug}/placement              404
POST /public/design-sessions                        404
POST /public/custom-requests                        404
POST /public/custom-requests/status                 404
POST /public/quotations/current                     404
POST /public/design-reviews/current                 404
POST /public/orders/deposit                         404
POST /public/orders/final-payment                   404
POST /public/orders/shipping-fee-acknowledgements   404
```

Wave-1 released operations were **not** withheld — they reached validation or
served:

```text
POST /public/verification/challenges     400 (validation)
POST /public/orders/full-payment/qr      400 (validation)
GET  /public/sitemap-entries             200
```

And the three `SCOPE_GATED` operations reached the **resolver** rather than the
release guard, which is the whole point of that classification:

```text
POST /public/secure-links/resolve                 400 (validation, not 404)
POST /public/orders/deposit/evidence/status       400 (validation, not 404)
```

### Live Storefront route denial (flag OFF)

```text
WITHHELD  /yeu-cau/moi                          404
WITHHELD  /yeu-cau/da-gui                       404
WITHHELD  /truy-cap/bao-gia                     404
WITHHELD  /truy-cap/duyet-thiet-ke              404
WITHHELD  /truy-cap/thanh-toan                  404
WITHHELD  /truy-cap/thanh-toan-con-lai          404
WITHHELD  /san-pham/ao-thun-cotton/thiet-ke     404

RELEASED  /                                     200
RELEASED  /truy-cap                             200
RELEASED  /truy-cap/don-hang                    200
RELEASED  /san-pham/ao-thun-cotton              200
RELEASED  /mua-hang/ao-thun-cotton              200
RELEASED  /xac-minh-lien-he                     200
RELEASED  /kham-pha                             200
RELEASED  /bo-suu-tap                           200
```

`ORDER_ACCESS_when_off = PASS` — `/truy-cap/don-hang` and all three FULL payment
operations are released and reachable while every custom surface is not.

### Why the isolation is not client-side

The route gate (`proxy.ts`) and the operation gate
(`CustomCapabilityReleaseGuard`) are independent enforcement points of one
decision, and the API half runs as a **global** guard ahead of every delivered
authorization guard — so a withheld operation is refused before any session is
authorized, any request created or any payment attempt opened. There is no
`NEXT_PUBLIC_` twin of the flag, so the browser is never told what is withheld
and cannot be told to ignore it.

---

## G. Verified-contact security

`publicReadyMadeOrder_create` is `STATIC_ALLOW` but not anonymous: creation
requires a verification proof, and the proof is server-verifiable and
contact-bound.

```text
POST /public/ready-made-orders  with no verification  →  400 (refused)
```

The binding properties, read from `submit-verification-attempt.use-case.ts`,
`verification-challenge-policy.ts` and the challenge repository:

- the challenge is addressed by an opaque `challengeId`, and the destination and
  purpose come **from the challenge row**, never from the request — so a
  challenge cannot be redirected at another contact;
- the purpose is part of the row, so a `STEP_UP` challenge cannot satisfy a
  `READY_MADE_ORDER` requirement or the reverse;
- `maxAttempts` is enforced against the persisted spend, not a client counter;
- issuance rate and the resend cooldown are measured from
  `defaultNow()` on the row, so they survive a restart and cannot be reset by a
  new client;
- editing the contact starts a **new** challenge, because the destination is
  part of the row the code was minted against — a stale proof is for a contact
  that is no longer the subject.

No second verification system was introduced. `STEP_UP` is the same machine with
one field different (`purpose`), which is why the Ready-Made step-up dialog is a
consumer of the delivered controller rather than a reimplementation.

---

## H. Admin auth / session boundary

### Live

```text
GET  /api/admin/orders      anonymous            401
GET  /api/admin/categories  anonymous            401
GET  /api/staff/me          anonymous            401
GET  /orders  (Admin page)  anonymous            307 → /login
GET  /categories            anonymous            307 → /login
```

### Cookie transport, read from `cookie-policy.service.ts`

```text
name        __Host-adm_session   (production; unprefixed in dev over plain HTTP)
HttpOnly    yes
SameSite    Strict
Path        /
Max-Age     absolute session timeout
Secure      yes when cookieSecure (production)
```

The `__Host-` prefix is itself an enforcement: the browser refuses to accept the
cookie unless it is `Secure`, host-only and `Path=/`, so a misconfigured
production deployment fails to log anyone in rather than issuing a weakened
cookie.

### CSRF

Audited against the real transport rather than by adding a framework. Two
independent defences already exist, and a token scheme would be a third
mechanism guarding an attack neither leaves open:

1. **`SameSite=Strict`** — the browser does not attach the session to any
   cross-site request at all.
2. **`StaffOriginGuard`** — the server refuses a write whose `Origin` is not the
   configured Admin origin. Proved live:

```text
POST /api/staff/session   Origin: https://evil.example   →  403
```

`StaffJsonBodyGuard` additionally refuses a non-JSON content type, which closes
the simple-request form that would bypass a preflight.

Customer secure tokens cannot authorize an Admin operation: the two credentials
are read by different code, and no Admin controller consults
`AuthorizeSecureLink` or `ReauthorizeSecureGrant`. Staff authentication never
appears in a customer URL — the session is a cookie, and the only staff
credential in the system is that cookie.

---

## I. Secure grants and IDOR

### Cross-order IDOR is unreachable by construction

The decisive result, measured from the published artifact rather than argued:

```text
                                   request body        path/query params
publicReadyMadeOrder_current       {token}             []
publicOrderFullPayment_current     {token}             []
publicOrderFullPayment_qr          {token}             []
publicOrderFullPayment_initiate    {token}             []
publicSecureLink_resolve           {token}             []
```

Every Wave-1 `ORDER_ACCESS` operation takes **exactly one field**, and no secure
operation anywhere takes a path or query parameter (`X-Request-ID` and
`Idempotency-Key` are correlation headers, not locators). There is no field in
which a caller could name another order, so "credential A reads order B" is not a
test that can be written against this contract — the request has nowhere to put
B. The order comes back *from the grant row*, which is a stronger binding than
validating a caller-supplied pair.

The two Wave-2 operations that do take a subordinate identifier — `versionId` on
the quotation and design decisions — are containment-checked against the grant's
own subject (`quotation.customRequestId !== requestId` and
`designCase.customRequestId !== requestId` both refuse), and the evidence lane's
`attemptId` is proved to hang off the grant's own order by
`EvidenceAttemptAuthorizer`. None is a locator the caller can steer.

### Scope isolation

`requestSubjectOf` and `orderSubjectOf` return the subject only after checking
the scope, so there is no way to obtain the id without having passed the check,
and the refusal is the same indistinguishable `SECURE_LINK_UNAVAILABLE`. On the
write side the isolation is stronger still: `reauthorize` and
`reauthorizeOrderAccess` are **separate methods** that pin the scope in the SQL
predicate, so a token of the wrong scope never resolves at all.

### Non-enumerating refusal — live

Three different unusable tokens against two different operations produced
byte-identical bodies apart from the correlation id and timestamp:

```text
404 {"success":false,"code":"SECURE_LINK_UNAVAILABLE",
     "message":"That secure link is not available.", ...}
```

Unknown, expired, revoked, superseded, wrong-target and wrong-scope all leave by
this one path. There is no second query after a miss, so the causes are not
separable by timing either.

### Token handling

The raw token is digested in the resolver's first statement and never referenced
again — not stored, not logged, not echoed, not audited, not placed in an error.
The digest is a local and is equally never recorded. Proved empirically in §O.

---

## J. Payment and evidence binding

```text
attempt   → obligation → order      PaymentTargetResolver.liveFor
evidence  → attempt → obligation → order   EvidenceAttemptAuthorizer
```

- `findLiveForOrder` filters on the statuses the uniqueness constraint
  arbitrates, so a `SUPERSEDED` or `CANCELLED` obligation is invisible and can
  never become a payment target — which is what stops a superseded FULL
  predecessor's attempt from becoming its successor's evidence.
- The containment clause `obligation.orderId !== order.id` is checked rather
  than assumed, so a repository that later grew a different lookup cannot make
  one order's obligation payable from another order's link.
- Customer evidence settles nothing: the upload records an image and queues
  inspection. No attempt is settled, no obligation satisfied, no order moved.
- Verification is `adminPaymentAttempt_verify`, `STAFF_ADMIN` only.
- **`FU-APP12-B04-02` disposition — `CLOSED_ACCEPTED_LEGACY_PATH`.** See §U.

---

## K. Uploads and private assets

Audited mechanically, not from documentation.

```text
max bytes        busboy `fileSize: lane.maxUploadBytes + 1`, plus the explicit check
files            busboy `files: 1` — a second file is refused by the parser itself
allowed MIME     PNG, JPEG, WebP
magic bytes      detectMediaType() over a bounded prefix — the declared type must
                 match the actual signature, so an SVG, ZIP or script cannot be
                 stored as image/png and later handed to a decoder
filenames        normalizeFilename() rejects NUL and control characters, keeps
                 only the last path segment, caps at 255 UTF-8 bytes — and the
                 result is NEVER stored: not in the key, the response or a log
object keys      fully server-derived: environment / scope / assetId / fixed name
                 / extension-from-content-type
traversal        assertValidObjectKey() applied to every key that reaches the
                 provider, including keys the builders produced
```

**Path traversal is denied by construction.** A traversal segment cannot reach a
key builder because only the last path segment of a filename survives
normalization, and it could not be used if it did because the filename is not an
input to the key. The structural gate is a third line, deliberately applied to
builder output so a future builder change fails before it can emit one.

**No arbitrary bucket or key selection.** The bucket is a compile-time alias
(`ORIGINALS`, `DERIVATIVES`) and the key is derived from an `assetId` the server
minted. Neither is a request field.

**No anonymous private-binary read.** Every private byte stream is either
`STAFF_ADMIN` (the four Admin binaries, §U) or secure-grant scoped. No bucket
name or object key appears in any response.

---

## L. Rate limits and abuse controls

| Surface | Control | Where |
|---|---|---|
| secure-link resolve (all token surfaces) | sliding window per network key | `SecureLinkRateLimiter` |
| Admin login | sliding window | `LoginRateLimiter` |
| verification issue | durable per-target issuance window | challenge repository |
| verification resend | durable cooldown from the row's issuance instant | `verification-challenge-policy` |
| verification submit | `maxAttempts` against persisted spend | `submit-verification-attempt` |
| design session read/write | sliding window | Wave-2 only |

Two properties worth recording:

- **The limiter is charged before any HMAC work and identically whatever the
  token turns out to be.** Reversing the order would make the cost depend on the
  credential and hand an attacker free failed guesses.
- **Both public token surfaces share one limiter dimension and key**, so a
  caller cannot escape the budget by spreading guesses across two routes.
- Verification's limits are **durable**, not in-memory, so they survive a process
  restart — stronger than the sliding-window limiters, and the right choice for
  the surface that mints codes.

No thresholds were guessed at and no flaky live abuse test was written: the
budgets are published policy values, and the ordering property above is the one
that actually decides whether the limit is worth anything.

---

## M. Path traversal and SSRF

**Path traversal:** denied by construction — §K.

**SSRF: `N/A`, and structurally so.**

```text
outbound HTTP clients in apps/api    : none
outbound HTTP clients in apps/worker : none
axios / fetch / http.request / undici / got / node-fetch : 0 occurrences
@embroidery/notification-delivery dependencies           : {} (none)
```

There is no code path in the API or the worker that performs an outbound request
of any kind, so there is nothing for a user-controlled URL to reach. No local
deny fixture was needed and no metadata service was probed, because there is no
fetch to point at one.

The nearest thing to an outbound address is the secure-link URL the worker
*composes* (it does not fetch it): the origin is operator config normalized at
load, and the landing path is selected from a **closed set** keyed by the grant
scope carried inside the sealed envelope. An unknown landing throws rather than
composing a link, so the delivery fails without a URL instead of sending a
customer somewhere their token does not open. No customer-supplied URL or path
is ever trusted.

---

## N. Security headers and CSP

### Finding H01-F01 — `X-Powered-By` on every surface (HIGH) — FIXED

Measured before any change, against the real gateway:

```text
GET http://embroidery.local/                    X-Powered-By: Next.js
GET http://admin.embroidery.local/login         X-Powered-By: Next.js
GET http://embroidery.local/api/public/...      X-Powered-By: Express
```

All three named the framework — and so the advisory feed to read — to anyone who
sent one request, and nothing read the header. Fixed at source rather than
stripped at the edge, so the header cannot come back on a different topology:

```text
apps/storefront/next.config.ts   poweredByHeader: false
apps/admin/next.config.ts        poweredByHeader: false
apps/api/src/bootstrap/…         app.set('x-powered-by', false)
```

Verified live after the fix — **absent on all three**.

### Finding H01-F02 — no Content-Security-Policy anywhere (MEDIUM) — FIXED

No surface published a CSP. The gateway set `X-Content-Type-Options`,
`Referrer-Policy` and `X-Frame-Options` and nothing else.

The apps now declare their own policy, in `next.config.ts` rather than at the
gateway, for a deliberate reason: the app is the only party that knows which
sources its bundle needs, and a header set there travels **inside the standalone
image**, so whichever gateway fronts it in production cannot lose the policy by
omission. Production value (no `unsafe-eval`, no `ws:`):

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self';
form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:;
style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; manifest-src 'self';
script-src 'self' 'unsafe-inline'; connect-src 'self' blob:
```

The API's is stricter, because a JSON body loads nothing:

```text
default-src 'none'; frame-ancestors 'none'
```

**`'unsafe-inline'` in `script-src` is a framework requirement, not a
convenience.** The App Router streams its RSC payload as inline
`<script>self.__next_f.push(…)</script>` elements; without a per-request nonce
the page does not hydrate at all. `'unsafe-eval'` is granted **only** in
development, where Turbopack's module runtime needs it, and is absent from a
production build — verified by rendering the production value above. Tightening
to a nonce-based policy needs a middleware pass over every route and is recorded
as a follow-up for `APP12-H02`, which owns the production edge.

Every source is `'self'`: this deployment loads no third-party script, style,
font, frame or beacon, so nothing external is allow-listed.

### Finding H01-F03 — nginx version disclosure (LOW) — FIXED

`Server: nginx/1.27.3` → `Server: nginx` (`server_tokens off`).

### Finding H01-F04 — gateway header inheritance drop (LOW) — FIXED

A latent defect the header work exposed. nginx inherits `add_header` from the
enclosing level **only while the current level declares none of its own**, so
every location that wanted one header of its own — `/healthz` wanting
`Cache-Control: no-store`, and now `/api/` wanting its own CSP — was silently
dropping the entire server-level security set. `/healthz` had been doing so since
it was written, with a comment calling it "acceptable".

Fixed structurally rather than by repetition: the four shared headers moved into
`includes/security-headers.conf`, included at each level that declares a header
of its own. The next location to need one fails visibly (a missing include)
rather than silently.

### Live header evidence — after

| Surface | Result |
|---|---|
| Storefront public page | 200 · CSP · nosniff · Referrer-Policy · X-Frame-Options · **no X-Powered-By** |
| Storefront checkout `/mua-hang/[slug]` | 200 · same set |
| Secure order `/truy-cap/don-hang` | 200 · same set |
| Admin login | 200 · same set |
| Admin protected route, anonymous | 307 → `/login` · same set |
| Public API | 200 · API CSP · nosniff · Referrer-Policy · X-Frame-Options |
| API denial (401) | 401 · same set |

### HSTS — `ROUTED_H02`

Not asserted, and deliberately not faked. This gateway terminates plain HTTP;
`Strict-Transport-Security` sent over `http://` is ignored by browsers, so
setting it here would be a claim with no evidence behind it. It belongs to the
TLS edge, which `APP12-H02` owns. Recorded in
`includes/security-headers.conf` where a reader will look for it.

### Production error behaviour

```text
GET /api/public/products/khong-ton-tai
  → 404 {"success":false,"code":"PUBLIC_PRODUCT_NOT_FOUND",
         "message":"That product is not available.", meta:{requestId,timestamp}}
```

No stack, no SQL, no filesystem path, no internal host. The envelope carries a
code, a safe message and correlation metadata, and nothing else. A rebinding
failure — the one deliberate 500 the suite provokes — was asserted not to contain
`ActorAlreadyBound`, an internal id or a stack frame.

---

## O. PII, log and error redaction

Two independent defences: a sensitive-key denylist that blanks a value by field
name, and conservative value patterns that blank credentials embedded in an error
message or a stack line. Both run before serialization.

**Proved by injection, not by reading the code.** Synthetic markers were sent
through three surfaces and both processes' logs were searched:

```text
marker secure token in API logs      : 0 occurrences
marker phone number in API logs      : 0 occurrences
marker values in worker logs         : 0 occurrences
```

And the requests **were** logged, so the zero is a redaction result rather than
an absence of logging:

```json
{"event":"http.request.completed","requestId":"…","actor":{"kind":"ANONYMOUS"},
 "http":{"method":"POST","route":"/api/public/secure-links/resolve",
 "statusCode":404,"durationMs":5.121}}
```

Route, status, duration and correlation id are kept. Body, token and contact are
absent entirely — not masked, absent.

`node tools/check-report-secrets.mjs` passes over **644 documents and 5070
tracked files**, including this report. See §U for the two inherited findings it
had been failing on.

---

## P. Worker trust boundary

- **No HTTP entry point.** The worker exposes no port and no route; it reaches
  the system through the database outbox. There is no endpoint to authenticate.
- **Message schema is validated, not trusted.** The secure-link landing is
  checked against a closed set at runtime even though the type says the set is
  closed, because the value has just come out of JSON. An unknown landing throws
  and the delivery fails **without a URL** rather than sending the customer
  somewhere their token does not open.
- **The landing is server-trusted.** It is the grant scope the token was issued
  under, carried inside the sealed envelope from the issuing side — the worker
  may not read a grant table, and no customer-supplied URL or path is trusted.
- **Raw tokens are not logged.** The composed URL contains the plaintext token,
  is handed to the channel port and dropped with the decrypted delivery; nothing
  persists, logs or returns it upward. Confirmed by the injection probe in §O.
- **Retry is idempotent** and a poison message fails without terminalizing an
  order — `APP12-H03`/`H04` own the deeper resilience rehearsal; H01 asserts the
  trust and authorization properties only.

---

## Q. Internal endpoints, CORS and client bundle

### Internal exposure

Only `/api/health` and `/api/health/readiness` are reachable through the gateway,
plus the gateway's own `/gateway/healthz` on the default server. There is no
metrics, debug, admin-console or worker-control endpoint anywhere. Swagger UI is
mounted only when `docsEnabled`.

An unknown `Host` returns **404 "unknown host"** and never falls through to an
application.

### CORS

`enableCors` is never called, so the API sends no `Access-Control-*` header at
all. Verified live:

```text
GET  /api/public/products     Origin: https://evil.example  → 200, no ACAO header
OPTIONS /api/admin/orders     Origin: https://evil.example  → 404 (no CORS route)
POST /api/staff/session       Origin: https://evil.example  → 403 (origin guard)
```

Same-origin only, with no credentialed-origin policy to get wrong.

### Client bundle and rendered payloads

```text
NEXT_PUBLIC_* variables in use : 3
  NEXT_PUBLIC_API_BASE_PATH            a path
  NEXT_PUBLIC_ZALO_CONTACT_URL         public contact URL
  NEXT_PUBLIC_MESSENGER_CONTACT_URL    public contact URL
matching PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|PRIVATE : 0
```

Six server-only variables were searched for in the rendered Storefront HTML —
`DATABASE_URL`, `POSTGRES_PASSWORD`, `STAFF_BOOTSTRAP_PASSWORD`,
`SECURE_LINK_TOKEN_PEPPER`, `INTERNAL_API_BASE_URL`, `MINIO_ROOT_PASSWORD` — with
**0 occurrences** each. `INTERNAL_API_BASE_URL` in particular stays server-side:
the browser calls the same-origin gateway path.

The two social URLs are public contact channels and are not secrets.

---

## R. Live denial matrix

Against the real gateway, API, Storefront and Admin.

```text
ANONYMOUS
  GET  /public/products                          200   allowed
  GET  /public/categories                        200   allowed
  POST /public/ready-made-orders (unverified)    400   denied
  POST /public/ready-made-orders/current         400   denied
  POST /public/orders/full-payment               400   denied
  GET  /admin/orders                             401   denied
  GET  /admin/categories                         401   denied
  GET  /staff/me                                 401   denied
  GET  /orders   (Admin page)                    307   → /login
  GET  /categories (Admin page)                  307   → /login

SECURE TOKEN — unusable
  unknown token   → 404 SECURE_LINK_UNAVAILABLE   (identical body)
  second unknown  → 404 SECURE_LINK_UNAVAILABLE   (identical body)
  all-zero token  → 404 SECURE_LINK_UNAVAILABLE   (identical body)
  same three against publicSecureLink_resolve → identical

CROSS-ORIGIN
  POST /api/staff/session  Origin: evil.example   403   denied

WAVE-2 (flag OFF)
  10 STATIC_DENY operations                      404   denied  (§F)
  7 withheld Storefront routes                   404   denied  (§F)
  ORDER_ACCESS surface + 3 FULL operations       live   allowed (§F)
```

**Cross-order IDOR** is recorded as unreachable-by-construction rather than as a
two-order probe, and §I explains why that is the stronger statement: the contract
has no field in which to name a second order. The scope-crossover half is
enforced at the SQL predicate on every write path and by the narrowers on every
read path (§U, finding H01-F05).

No mutation was performed against shared development data, so no disposable
database or MinIO instance was created or destroyed — see §Y.

---

## S. Live header evidence

Captured with `curl -D -` against the real gateway, before and after the fix.
Full table in §N. Summary:

```text
X_Powered_By    before: Next.js (×2), Express (×1)     after: ABSENT (×3)
CSP             before: absent on all surfaces         after: present on all
Server          before: nginx/1.27.3                   after: nginx
HSTS            absent — ROUTED_H02 (plain-HTTP gateway)
```

### CSP functional proof — real Chromium

| Surface | Console | Result |
|---|---|---|
| Homepage `/` | 1 error: `favicon.ico` 404 | no CSP violation |
| Product Detail `/san-pham/ao-thun-cotton` | 0 errors | no CSP violation |
| Checkout `/mua-hang/ao-thun-cotton` | 0 errors | no CSP violation |
| Secure order `/truy-cap/don-hang` | 0 errors | no CSP violation |
| Admin login | 1 error: `favicon.ico` 404 | no CSP violation |

The only console errors on any surface are missing-favicon 404s, which predate
this checkpoint and are unrelated to the policy.

Product Detail was additionally inspected through the DOM to prove the **split
stylesheet** (§U) still applies under CSP — `display: flex`, `gap: 32px`, stage
background `#f5f3ef`, stage `min-height: 320px`, all exactly the delivered
values — and screenshotted, showing breadcrumb, gallery stage, identity, share
control and the floating social link rendering correctly.

The authenticated Admin render was outstanding when this section was first
written, because reaching it appeared to need the protected
`STAFF_BOOTSTRAP_PASSWORD`. **It is now complete** — see §AC, which proves it
with a synthetic per-run credential the harness mints in memory, so no shared
development secret was requested or read.

---

## T. Findings and severity

| ID | Finding | Severity | Disposition |
|---|---|---|---|
| `H01-F01` | `X-Powered-By` published by Storefront, Admin and API | **HIGH** | **FIXED** — absent on all three, verified live |
| `H01-F02` | No Content-Security-Policy on any surface | **MEDIUM** | **FIXED** — present on all three, functional in Chromium |
| `H01-F03` | `Server: nginx/1.27.3` version disclosure | LOW | **FIXED** — `server_tokens off` |
| `H01-F04` | Gateway locations silently dropped the server-level security headers | LOW | **FIXED** — shared include |
| `H01-F05` | Six secure **read** paths cast `grant.customRequestId` past the scope narrower | LOW | **FIXED** — narrower applied |
| `H01-F06` | Unknown product slug answers HTTP 200 (soft 404) | LOW | **ROUTED — `APP12-H06`** |

### H01-F05 in full, because its severity is the interesting part

Ten call sites read a grant subject with `as CustomRequestId` instead of through
`requestSubjectOf`. Four were written before `APP12-B04` widened the field to
`string | undefined`. The honest analysis:

- **Five are write paths and were never exposed.** They call `reauthorize`,
  which pins the scope **in the SQL predicate**
  (`lockActiveByTokenDigest(hash, [REQUEST_ACCESS], now)`), so an `ORDER_ACCESS`
  token never resolves there at all and the cast is dead code.
- **Six are read paths** reached through the unpinned `AuthorizeSecureLink`. With
  an `ORDER_ACCESS` token the cast yields `undefined`.
- **The outcome was already correct, by accident.** Drizzle renders
  `eq(col, undefined)` as `col = $1` with `$1 = null` — confirmed by compiling
  the expression, not by assuming — and `col = NULL` matches nothing, so the
  lookup found no row and threw the same indistinguishable
  `SECURE_LINK_UNAVAILABLE`. No 500, no oracle, no data.
- **All six operations are `STATIC_DENY` in Wave 1**, so they are unreachable
  behind the release guard while the flag is off.

Not exploitable, therefore **LOW** — but fixed, because reaching the right
refusal through a SQL null is not the same as reaching it by design, and
`requestSubjectOf` exists precisely to make the scope check unskippable. Its
return is now narrowed before the brand is applied, following the pattern
`read-current-design-review.query.ts` already used.

### H01-F06

`/san-pham/<unknown>` renders the not-found body with `noindex` but answers
**HTTP 200** rather than 404. No security impact — nothing is disclosed and the
page is not indexable — but it is a soft 404, which is a crawl and indexing
concern. `APP12-H06` (SEO and public readiness) owns it.

### Gate

```text
BLOCKER 0 · HIGH 0 · MEDIUM 0 remaining
no authorization bypass · no cross-order IDOR · no secure-token leak
no anonymous private asset · no traversal · no SSRF surface
no unsafe upload · no production secret or stack exposure
no Wave-2 customer access while OFF · no H01-owned red gate
```

No finding was downgraded to finish. F05's LOW is argued from measured runtime
behaviour and the release state, not from convenience.

The live-acceptance continuation (§AC) raised **no new application finding**. It
found and fixed two *harness* defects — a login hydration race and a
rate-limit-budget assumption — recorded in §AC.10, and it withdrew one incorrect
mid-flight conclusion (that the CSP had broken Admin login) before anything was
built on it.

---

## U. H01 inherited-debt closure

### Stale contract and test assertions — `CLOSED`

Seventeen assertions across ten suites were red at entry. Every one was
investigated against current authority first; in every case the **runtime was
correct** and the assertion was a snapshot a later authorized checkpoint had
superseded. Two were made *stronger* rather than merely updated.

| Suite | Was | Now |
|---|---|---|
| `admin-category.contract` | 133 ops / 44 public | 138 / 49 |
| `admin-category.contract` | 31 DENY / 13 ALLOW | 28 / 18 / 3 **+ a partition proof** |
| `public-category.contract` | 133 / 44 | 138 / 49 |
| `public-category.contract` | artifact contains no `READY_MADE` | *this surface* contains none |
| `public-category.contract` | resolver in the withheld set | resolver is `SCOPE_GATED` |
| `public-sitemap-entry.contract` | 128 ops | 138 |
| `public-sitemap-entry.contract` ×1, `gallery` ×2 | 37 migrations | 38 (the §19 freeze) |
| `public-sitemap-entry.contract` | root module ≤ 339 lines | ≤ 363, re-pinned as a ratchet |
| `admin-custom-request-design-version.contract` | detail route forbidden | detail permitted by name |
| `admin-payment-evidence` / `admin-custom-request-asset` | 3 Admin binaries | 4, the gallery rendition named |
| `public-order-deposit-evidence` ×3 | no evidence GET / no Admin evidence op | no *mutating* verb; no *public* binary; exactly one named Admin address |
| `admin-quotation-send.contract` | one `/send` in the artifact | one *quotation* send, both sends pinned |

The partition proof is the one worth calling out: the release-matrix assertion
now checks that the three sets *cover the published public surface exactly, with
no duplicates* — a stronger invariant than the three counts it replaced, and the
one an unclassified operation would actually break.

**Result: 50 API contract suites, 1219 tests, all green.**

### `FU-APP12-S03-C1-02` — `CLOSED`

- `admin-order.contract.spec.ts` — fixed by the stale-assertion work above.
- `actor-context.integration.spec.ts` — a function named
  `productionFilesCalling` excluded `*.spec.ts` but not the fixtures beside them
  under `tests/`, so it started returning test files as soon as two legitimately
  built an actor context. It now excludes test directories, which makes it mean
  what it is named. **The allowlist is untouched and still exhaustive.**
- `catalog-placement-boundary.spec.ts` — the rule forbade `AssetModule` in both
  the read boundary *and* the Design module, but `APP3-B06B` imports it for the
  `ASSET_REPOSITORY` **port**, documented at the import. The read boundary keeps
  the full three-module rule; the Design module keeps the two that are actually
  about authority (`IdentityModule`, `AuditModule`).

### Lint and format — `CLOSED`

- `FU-APP12-S03-C1-03` — 4 API ESLint errors. The `no-useless-escape` was a real
  bug: `'^.+\.ts$'` in a JS string is `^.+.ts$`, matching `fooXts` as well as
  `foo.ts`. Now correctly escaped. The three redundant assertions were removed
  with their orphaned imports. **API ESLint: 0 errors.**
- `FU-APP12-C03-01` — 15 files failing global Prettier. All formatted.
  **Global Prettier: green across the repository.**

No rule was lowered and no `eslint-disable` was added.

### Report secrets — `FU-APP12-S03-08` — `CLOSED`

Both inherited findings — `APP6-B04:93` and the `APP9-G01` row *quoting* it —
were the same false positive: the `"token"`-followed-by-a-value heuristic
matching the Zod literal `z.object({ token: z.string().regex(…) }).strict()`,
which discloses nothing. `APP9-G01` recorded the two admissible fixes as
"rewording that one APP6 line or narrowing the heuristic". Rewording would have
made an accurate quotation of delivered source less accurate, so the heuristic
moved: a **method call** (`.name(`) is code, not a credential.

Deliberately `.name(` and not the looser `name(` — a password ending in an open
parenthesis (`Aa1!abcdefgh(`) contains a bare call expression and would have been
wrongly exempted. That case is now a regression test. No report directory is
whitelisted and no real secret material existed to redact.

**10/10 checker tests pass; the gate passes over 644 documents.**

### Exact-money duplication — `CONSOLIDATED`

Five features each held the formatter: `secure-quotation`,
`secure-deposit-payment`, `secure-final-payment`, `ready-made-purchase`,
`secure-ready-made-order`. Each had deferred promotion for the same honest
reason — every feature's boundary suite proves *its own directory* contains no
numeric coercion by scanning it, so a file that left would leave its guard.

**The guard moved with the code.** `test/boundary/shared-money-source.test.ts`
scans `src/shared/money/exact-money.ts` with the same rule plus an arithmetic
scan, and asserts the five old paths no longer exist.

The copies **had already drifted**, which is the argument for consolidation
rather than against it: four rendered a negative amount with the typographic
minus the approved figures use, and `ready-made-purchase` emitted an ASCII
hyphen. No screen has ever shown a negative amount, so nothing was visibly wrong
and nothing would have caught it. The typographic form is the delivered majority
and is now the only behaviour.

No `Number`, `parseFloat`, `parseInt`, `toFixed`, `Math.round`, `BigInt` or
`Intl.NumberFormat`. Regressed across APP6 quotation, APP7 DEPOSIT, APP9
REMAINING, APP12 S01/S02 and Ready-Made FULL — **2489 Storefront tests green.**

### STEP_UP modal frame — `CONSOLIDATED`

The same five secure screens each carried a byte-identical copy of the modal
frame, differing only in the BEM prefix on three class names. `ModalFrame` in
`src/shared/dialog/` now owns the generic contract:

```text
role="dialog" + aria-modal + aria-labelledby from its own heading
initial focus on the heading (not the first control)
Escape dismisses; the scrim deliberately does not
Tab / Shift+Tab cycle inside the dialog
focus returns to the opener
```

Each feature keeps its named component and its own BEM block, passed as props, so
**every approved stylesheet still applies unchanged and no shared stylesheet was
invented**. Domain copy, the verification challenge, the mutation and the
outcomes all stayed in their owning features — the frame renders no text and
decides nothing about what the dialog is for.

The promoted behaviour had **no direct test** in any of the five copies. It has
one now: 8 assertions covering the contract above, including that the scrim is
not a dismiss target — the rule most likely to be "helpfully" added later.

### Hard-limit sources — `CLOSED`

| File | Was | Now | Method |
|---|---|---|---|
| `product-detail.scss` | 555 | 20 + 6 parts (≤137) | **compiled CSS byte-identical** |
| `product-form.scss` | 753 | 18 + 6 parts (≤211) | semantically identical |
| `products.scss` | 536 | 13 + 6 parts (≤173) | semantically identical |
| `drizzle-order-shipping.repository.ts` | 399/400 | 348 + 84 | responsibility split |

Splits are contiguous slices in original order, `@use`d in that order, so no
declaration changed place in the cascade. **Proof was compilation and diff, not
inspection**: `product-detail.scss` emits byte-identical CSS. The two Admin
stylesheets differ only in the *order of selectors within two grouped rules*
produced by cross-module `@extend` resolution — `.a, .b {…}` and `.b, .a {…}` are
the same CSS, the rules occupy the same lines, and normalizing selector order
makes the outputs identical.

The repository split extracted cancellation review — its own status machine, its
own table, sharing nothing with an address, a freeze or a dispatch snapshot.

Three Storefront boundary suites read the old single stylesheet; they now read
the feature's style **directory**, which keeps every rule as strict and makes
them indifferent to how the feature divides its styles next.

### `FU-APP12-A01-01` — six Admin boundary tests — `CLOSED`

Each said "this screen cannot reach operation X" but asked the **shared
`@embroidery/api-client` package**, which stopped being the right subject as soon
as another app or screen became X's approved consumer (`APP3-S02` studio stage,
`APP5-B04` request detail, `APP11-B04` sitemap). Two also broke because
`index.ts` was split into per-domain barrels and no longer names an operation
directly.

Each claim was re-pointed at where it is true and stays enforceable — the
feature's own source, via a new `readFeatureSource` helper, or the barrel plus
the modules it re-exports. Nothing was relaxed: an import still fails.

Two bugs surfaced while doing it:

- `adminCustomRequestNoteAppend` **has never existed** — the operation is
  `adminCustomRequestAppendNote`, so that assertion had been passing on a typo.
  Corrected.
- A `toContain` on `adminCustomRequestDetail` matched the queue's own route
  helper `adminCustomRequestDetailRoute`. Now matched on identifier boundaries.

**1924 Admin tests green.**

### Scoped command index — `FU-APP12-A01-02` — `CLOSED`

`CMD-E2E-APP12-S03` backfilled, naming the two delivered spec files. The command
already existed in `package.json`; nothing new was invented.

### `FU-APP12-B04-02` — `CLOSED_ACCEPTED_LEGACY_PATH`

Per the PO directive, `/public/orders/deposit/evidence` is **not** renamed.
Audited and documented at the controller, where a reader meets the path:

**`/deposit/` is neither authorization nor payment-kind authority.**
`EvidenceAttemptAuthorizer` reads neither the URL nor a caller-supplied kind. It
re-establishes the grant under its row lock, walks that grant's own subject to
exactly one order, and requires the named attempt's obligation to hang off *that*
order, for **either** `CST-039` kind. No branch in the lane tests for `DEPOSIT`
and none tests the request path. Which obligations are payable is decided by the
rows the order has; which grant may reach them is decided by where the walk
arrives.

Renaming would reissue two accepted operation ids consumed by the generated
client and named in the release matrix — a contract change with a client
regeneration and a release-gate edit behind it, not a cleanup.

---

## V. Files changed

**110 paths.** No new HTTP operation, route or migration.

### Security fixes (7)

```text
apps/storefront/next.config.ts                          poweredByHeader + CSP
apps/admin/next.config.ts                               poweredByHeader + CSP
apps/api/src/bootstrap/api-application.ts               x-powered-by off
infrastructure/nginx/nginx.conf                         server_tokens off
infrastructure/nginx/templates/includes/
  security-headers.conf.template                        NEW — shared header set
infrastructure/nginx/templates/development.conf.template
infrastructure/nginx/e2e/templates/development.conf.template
```

### Scope narrowing — H01-F05 (6)

```text
payment/application/customer/read-deposit.query.ts
payment/application/customer/read-final-payment.query.ts
payment/application/customer/deliver-deposit-qr.query.ts
payment/application/customer/deliver-final-payment-qr.query.ts
order/application/status/read-grant-scoped-request.query.ts
quotation/application/customer/read-current-quotation.query.ts
```

### Consolidation (Storefront)

```text
src/shared/money/exact-money.ts                         NEW
src/shared/dialog/modal-frame.tsx                       NEW
test/boundary/shared-money-source.test.ts               NEW — the moved guard
test/components/shared-modal-frame.test.tsx             NEW — 8 assertions
5 feature money modules                                 DELETED
5 feature dialog frames                                 rewritten as adapters
15 consumers repointed
```

### Hard-limit splits

```text
product-detail.scss        → entry + 6 partials
product-form.scss          → entry + 6 partials
products.scss              → entry + 6 partials
drizzle-order-cancellation.repository.ts                NEW (+ 3 wiring files)
```

### Debt closure (tests, tools, docs)

```text
10 API contract suites            stale assertions reconciled
actor-context / catalog-placement boundary fixes
5 Admin boundary/component suites re-pointed
apps/admin/test/support/feature-source.ts               NEW
3 Storefront boundary suites      read the style directory
tools/check-report-secrets.mjs + .test.mjs              heuristic narrowed
apps/api/jest.app10-e01.config.mjs                      regex escape bug
docs/implementation/SCOPED_COMMAND_INDEX.md             CMD-E2E-APP12-S03
15 files                                                Prettier
```

---

## W. File-size evidence

Every one of the 101 changed source/style files passes the scoped gates, with
**zero even above the review threshold**:

```text
node tools/check-file-size.mjs <101 changed files>
  → passed (0 file(s) above the review threshold)

node tools/check-scss-file-size.mjs <21 changed stylesheets>
  → passed (21 stylesheet(s), 0 above the review threshold)
```

The repository-wide `check-file-size.mjs` reports 82 hard-limit violations. None
is a file this checkpoint created or touched; they are historical debt across
APP3 smoke tools, e2e specs and legacy stylesheets, owned by the checkpoints that
next touch them. H01 owned four named files and closed all four.

---

## X. Validation

Change-impact selected, per `VALIDATION_GOVERNANCE.md` §3. No repository-wide
aggregate was run for ceremony.

```text
git diff --check                                        clean

API      tsc --noEmit                                   PASS
API      eslint .                                       PASS (0 errors)
API      jest (unit + contract, 177 suites)             3223 pass / 13 fail*
API      openapi:check                                  artifact up to date
Storefront tsc --noEmit                                 PASS
Storefront eslint .                                     PASS
Storefront jest (131 suites)                            2489 pass / 0 fail
Storefront next build (production)                      PASS
Admin    tsc --noEmit                                   PASS
Admin    eslint .                                       PASS
Admin    jest (134 suites)                              1924 pass / 0 fail
Admin    next build (production)                        PASS
persistence tsc --noEmit                                PASS
persistence eslint src                                  PASS
persistence jest                                        127 pass / 1 fail**
api-client jest                                         53 pass / 0 fail

prettier --check .                                      PASS (repository-wide)
node tools/check-report-secrets.mjs                     PASS (644 docs)
node tools/check-report-secrets.test.mjs                10/10
node tools/check-category-source-of-truth.mjs           PASS (2541 files)
node tools/check-storefront-route-authority.mjs         PASS
node tools/check-app-scss.mjs storefront                PASS
node tools/check-app-scss.mjs admin                     PASS
node tools/check-file-size.mjs <changed>                PASS
node tools/check-scss-file-size.mjs <changed>           PASS

live  anonymous denial matrix                           PASS
live  Wave-2 API denial (10 operations)                 PASS
live  Wave-2 route denial (7 routes)                    PASS
live  released-surface non-denial (8 routes)            PASS
live  non-enumerating token refusal                     PASS
live  cross-origin write refusal                        PASS
live  CORS absence                                      PASS
live  header capture, 7 surfaces, before and after      PASS
live  PII/token redaction injection probe               PASS
real Chromium  CSP functional, 5 surfaces               PASS
```

\### Continuation validations (§AC)

```text
e2e-testing tsc --noEmit                                PASS
e2e-testing eslint .                                    PASS (0 errors)
API      jest secure-link-rate-limiter                  6 / 6
API      eslint . (after the new spec)                  PASS (0 errors)
API      tsc --noEmit                                   PASS
prettier --check .                                      PASS (repository-wide)
node tools/check-report-secrets.mjs                     PASS (645 docs)
git diff --check                                        clean

live  e2e:app12:h01        (A1 A2 A3 · B C D E G · H)   9 / 9
live  e2e:app12:h01:wave2  (F1 F2 F3)                   3 / 3
      both runs end on "cleanup verified: all E2E ports
      closed, disposable database dropped"
```

* **The 13 API failures are pre-existing and not H01-owned.** Proved, not
asserted: `git stash` to entry HEAD reproduces exactly the same four suites
failing (`design-session-asset-delivery`, `design-session-asset-status`,
`design-template-admin`, `design-template-save` — all `DesignSessionReadGuard`
rate-limit tests over Wave-2 `STATIC_DENY` surfaces). H01 *reduced* the failing
set: `catalog-placement-boundary` and `actor-context` were among them at entry
and are now green.

\*\* The persistence failure is the canonical table count (78 expected, 79
actual). §18 routes the **B05 table-count debt to `APP12-H02`**; H01 did not
absorb it and changed no schema.

---

## Y. Disposable and shared-dev hygiene

```text
mutation_validation            = NONE_REQUIRED
disposable_db_removed          = N/A
disposable_minio_removed       = N/A
shared_dev_commercial_residue  = 0
G03_data_created               = false
```

**No disposable database or object store was created, because no evidence in this
checkpoint required a write.** The denial matrix is composed entirely of refusals
and reads; the header, redaction and Wave-isolation probes mutate nothing. That
is a property of the checkpoint, not a shortcut: an audit that proves refusals
does not need rows to refuse against.

The three probes that touched the running system were a rate-limit-charged token
resolution (no write), a verification challenge request that failed validation
(no write), and catalog reads. No commercial row was created in the shared
development database, so there is no residue to clean.

Browser and audit scratch files (`.playwright-mcp/`, a screenshot) were removed
from the working tree; the audit artifacts live in the session scratchpad.

---

## Z. Baseline freeze

Re-measured after all changes, not carried forward:

```text
OpenAPI            = 125 paths / 138 operations / 278 schemas   ✓ unchanged
public operations  = 49                                          ✓ unchanged
release matrix     = 28 DENY / 18 ALLOW / 3 SCOPE_GATED          ✓ unchanged
migrations         = 38                                          ✓ unchanged
DB schema          = unchanged                                   ✓
Admin routes       = 26                                          ✓ unchanged
Storefront routes  = 20                                          ✓ unchanged
Figma              = unchanged (0 reads, 0 writes)               ✓
G03 data           = false                                       ✓
```

`openapi:check` confirms the published artifact is current against the compiled
application — the contract did not move, so no client regeneration was needed.

The only `packages/database` change is Prettier formatting of a historical
fixture; no schema file, no migration.

---

## AA. Follow-up closure matrix

### Closed by H01

| ID | Disposition |
|---|---|
| `FU-APP12-B02-02`, `FU-APP12-B04-03`, `FU-APP12-B05-01`, `FU-APP12-S03-C1-01`, `FU-APP12-S03-C1-02`, `FU-APP12-A01-01` | `CLOSED` — 17 stale assertions reconciled against re-measured authority; 2 strengthened |
| `FU-APP12-C03-01` | `CLOSED` — global Prettier green, API ESLint 0 |
| `FU-APP12-S03-C1-03` | `CLOSED` — 4 errors fixed, one a real regex bug |
| `FU-APP12-S03-08` | `CLOSED` — heuristic narrowed, pinned by regression test |
| `FU-APP12-S01-02`, `FU-APP12-S03-05` | `CONSOLIDATED` — one module, one guard, drift removed |
| `FU-APP12-S03-03` | `CONSOLIDATED` — one frame, 8 new assertions |
| `FU-APP12-S01-03`, `FU-APP12-A01-04`, `FU-APP12-B05-02` | `CLOSED` — CSS identity proved by compilation |
| `FU-APP12-A01-02` | `CLOSED` — `CMD-E2E-APP12-S03` indexed |
| `FU-APP12-B04-02` | `CLOSED_ACCEPTED_LEGACY_PATH` |

### Raised by H01

| ID | Finding | Owner |
|---|---|---|
| `FU-APP12-H01-01` | Nonce-based CSP would remove `script-src 'unsafe-inline'`; needs a middleware pass over every route and belongs with the production edge | `APP12-H02` |
| `FU-APP12-H01-02` | HSTS cannot be asserted over the plain-HTTP development gateway | `APP12-H02` |
| `FU-APP12-H01-03` | `/san-pham/<unknown>` answers HTTP 200 with a not-found body (soft 404) | `APP12-H06` |
| `FU-APP12-H01-04` | Both apps 404 on `/favicon.ico`; the only console error on any surface | `APP12-V01` |
| `FU-APP12-H01-05` | 81 repository-wide file-size violations remain, none H01-owned or H01-created. Classified into five classes with exact owners in §AC.12 | **`APP12-W02`** (11) · **`APP12-W04`** (4) · **`APP12-E01`** (1) · **`APP12-X01`** (65, recorded) |

### Not absorbed (per §18)

```text
B05 table-count debt      → APP12-H02   (confirmed still red; not touched)
FU-APP12-B03-01           → APP12-H02
FU-APP12-S03-06           → APP12-H02
FU-APP12-A02-03           → APP12-H02
FU-APP12-A01-03           → APP12-V01
FU-APP12-A02-C1-02        → APP12-V01
FU-APP12-A02-C1-01        → APP12-E01
FU-APP12-S02-04           already closed by S02-C1 — not reopened
4 APP3 design-session/template suites  → APP12-W02  (Editor functional deep UAT)
```

---

## AB. Roadmap

```text
APP12-H01 = COMPLETE
APP12-H02 = NEXT
```

`APP12-H02` — Production deployment and configuration readiness — inherits the
TLS edge and with it the two header items H01 could not honestly close here
(HSTS, nonce-based CSP), plus the B05 table-count debt §18 assigned to it.

No push. No deployment. No G03 data. No Figma edit.

---

## AC. Product Owner continuation — live security acceptance

### AC.0 Why this section exists

The audit above completed the implementation and the static security work, and
its findings and fixes were accepted. It did **not** satisfy all of the
mandatory live acceptance: the authenticated Admin CSP render, the valid
Ready-Made / `ORDER_ACCESS` / FULL journeys, the scope-crossover compatibility
case and the real upload-abuse evidence were argued from source and contract
rather than executed.

The Product Owner returned `APP12-H01` as `IN_PROGRESS` with
`H01_IMPLEMENTATION = PROVISIONALLY_ACCEPTED` and
`H01_LIVE_ACCEPTANCE = INCOMPLETE`, and directed a continuation rather than a
correction. **This section is that continuation.** `CORRECTION_USED` stays
`0 / 1`; nothing above was reopened or reworked.

The distinction the first tier got wrong is worth stating plainly, because it is
the reason the directive was necessary. A header captured on a `307` proves the
header. It does not prove the application: a policy that blocks a script an
operator's screen needs produces a page that arrives, with a correct header, and
a control that quietly does nothing. Only a real browser, past a real login, on
the real screens, can tell those two apart.

### AC.1 The disposable topology

A new e2e mode, `app12-h01`, riding the **existing** `APP12-A02`/`APP12-S03`
topology rather than a parallel framework:

```text
ephemeral PostgreSQL          provisioned and dropped per run
migrations                    1..38, applied by the delivered runner
ephemeral MinIO               this run's buckets only
real API                      the delivered NestJS process
real worker                   in-process, delivering real notifications
real Storefront               production build
real Admin                    production build
real gateway                  the delivered nginx, with the H01 header set
real Chromium                 Playwright, host runner
```

A sibling mode `app12-h01-wave2` boots the identical topology with
`CUSTOM_EMBROIDERY_RELEASE_ENABLED=true`. It is a **second run** and not a second
project, because the release state is read once when the API composes its module
graph — one process cannot serve both states, and a released route in front of a
withheld operation would prove nothing. The orchestrator sets that one flag for
the API and the Storefront together; there is no second flag anywhere.

```text
pnpm --filter @embroidery/e2e-testing e2e:app12:h01          9 journeys
pnpm --filter @embroidery/e2e-testing e2e:app12:h01:wave2    3 journeys
```

### AC.2 The staff credential — no shared secret was requested or read

The directive forbade asking the operator for `STAFF_BOOTSTRAP_PASSWORD`, and it
was not asked for and not read. The orchestrator already mints a per-run
operator in memory:

```text
createAdminCredentials(runId) → randomBytes(18).toString('base64url')
```

It exists only in the child process environment for the length of the run, is
typed into the real login form by the real staff-session flow, is never logged,
never returned by a helper, never asserted on and never written to this report.
The bootstrap uses the delivered production authority — no auth bypass, no
test-only endpoint, no session forgery.

### AC.3 Journeys A1–A3 — the authenticated Admin under CSP

`specs/app12/h01-admin-security.acceptance.spec.ts`, real Chromium, real login.

| | Proof | Result |
|---|---|---|
| A1 | `/orders` served `200` to the authenticated operator; the queue heading renders; the **origin filter is used** — the client rewrites the query to `origin=READY_MADE`, the control reflects it, and the reset affordance appears | **PASS**, 0 CSP violations |
| A2 | `/categories` served `200`; heading and table render; the **create panel opens** and its name field accepts and retains a keystroke | **PASS**, 0 CSP violations |
| A3 | No Admin surface — anonymous, authenticated or an API denial — carries `x-powered-by`; the anonymous Admin API call is `401` and carries the API's own stricter policy | **PASS** |

The interactions are the point. A screen that renders but cannot filter is a
screen whose JavaScript was blocked; the heading alone would not have caught it.
Violations are collected through an **init script**, registered before the
document's own first script runs, so a violation caused by hydration itself is
caught rather than missed.

A1 additionally asserts the session cookie's transport policy from the browser:
`HttpOnly`, `SameSite=Strict`, `Path=/`, and — checked from the page rather than
inferred from the attribute — **invisible to `document.cookie`**. `Secure` and
the `__Host-` prefix are correctly absent in a plain-HTTP topology and are not
asserted, because asserting them here would be asserting a lie.

### AC.4 Authenticated 200 header capture

Captured from the document responses the browser actually received, with
`set-cookie` dropped by name rather than redacted:

```text
GET /orders     (200, authenticated)
GET /categories (200, authenticated)

content-security-policy:
  default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self';
  form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:;
  style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; manifest-src 'self';
  script-src 'self' 'unsafe-inline'; connect-src 'self' blob:
x-content-type-options: nosniff
referrer-policy:        strict-origin-when-cross-origin
x-frame-options:        SAMEORIGIN
cache-control:          private, no-cache, no-store, max-age=0, must-revalidate
server:                 nginx
x-powered-by:           ABSENT
```

Two things in that capture are worth naming. It is the **production** policy —
the e2e topology runs production builds, so `'unsafe-eval'` and `ws:` are absent,
and the strict policy is what actually rendered and hydrated both screens. And
`cache-control: private, no-store` on an authenticated document is the right
answer for a page carrying operator data.

`strict-transport-security` is absent, correctly: this gateway terminates plain
HTTP. **`HSTS = ROUTED_H02`** stands, unfaked.

### AC.5 Journeys B, C, D, E, G — the Wave-1 secure surface

`specs/app12/h01-secure-security.acceptance.spec.ts`.

**B — unverified create denied.** `publicReadyMadeOrder_create` is
`STATIC_ALLOW`, so its refusal is the verification requirement itself and not the
release gate. Refused `4xx`, and the Ready-Made order count is **unchanged** —
asserted as a delta, because a `4xx` with a row behind it would be worse than a
`200`.

**C — the real `ORDER_ACCESS` bootstrap leaves nothing behind.** The order is
placed through the delivered checkout, the worker delivers the real
notification, and the browser navigates the **delivered URL string itself** — no
path repair, no re-composition. Then, with the token in hand, the run proves it
is absent from `localStorage`, `sessionStorage`, `document.cookie`, the entire
serialized DOM, `history.state` and the address bar. Every one of those is
asserted as a **boolean**, because `toContain` prints its haystack and the
haystack here is the page.

**D — possession of the link is not authority to pay.** With one live
credential: the FULL obligation reads `200`, the QR serves `200`, and
`publicOrderFullPayment_initiate` is refused **`403 REVERIFICATION_REQUIRED`**.
No attempt row exists afterwards. This is `APP12-B04`'s step-up lock proved as a
refusal rather than as a code path.

**E — a real credential for one order reaches no part of another.** The upgrade
over `APP12-S03`'s probe, which uses a *fabricated* token and says so: a caller
with **no** credential being refused says nothing about a caller holding a live
one for the wrong object. Two real orders are placed, both credentials are read
from the recording adapter, and credential A — first shown to open its own order
with a `200` — is pointed at **order B's real live attempt id** on the evidence
lane, the one Wave-1 operation that takes a subordinate locator at all.

```text
order B's real attempt id + credential A → 404 SECURE_LINK_UNAVAILABLE
a fictional attempt id    + credential A → 404 SECURE_LINK_UNAVAILABLE   (identical)
```

Identical, so the probe cannot be used to learn whether an id is real. The same
credential is then sent to `GET /api/admin/orders` as a bearer token and as a
session cookie: **`401` both times**. A customer credential authorizes no
operator surface.

**G — the upload seam.** A real PNG through the delivered screen is accepted and
stored. Then eight hostile fixtures through the same delivered HTTP seam:

```text
a text payload declaring image/png       refused
HTML declaring image/jpeg                refused
an oversized payload (12MB)              refused
an empty body                            refused
an unsupported format (SVG)              refused
a traversal filename (../../../etc/…)    refused
an absolute-looking filename (C:\…)      refused
a filename of odd unicode (RTL override) refused
```

Every one `4xx`, never `5xx` — a `5xx` would be the intake failing open on a
payload it could not classify. No refusal discloses `bucket`, `objectKey`,
`minio`, `amazonaws`, `s3://` or an originals prefix. **The whole matrix stored
nothing**: the evidence count is still the one legitimate image. An anonymous
evidence read is refused. No malware was used; each fixture is a *shape*.

### AC.6 Journey F — scope crossover with Wave 2 released

`specs/app12/h01-wave2-scope.acceptance.spec.ts`, run with
`CUSTOM_EMBROIDERY_RELEASE_ENABLED=true`.

**F1.** The run first proves the capability is genuinely on — a `STATIC_DENY`
operation no longer answers `404`. Then it submits a **real** custom request
through the delivered APP5 authority: a verified challenge, a real image through
the challenge-scoped intake (`role=COP_IMAGE`, waited until the inspector makes
it bindable), and a customer-owned subject. The grant is issued inside the
submission transaction and the real worker delivers it as a fragment link on
`/truy-cap`. The resolver admits it and reports `scopeKind: REQUEST_ACCESS`, and
its own status operation answers it `200`.

**F2.** Both directions, with two live credentials:

```text
REQUEST_ACCESS → /public/ready-made-orders/current   404 SECURE_LINK_UNAVAILABLE
REQUEST_ACCESS → /public/orders/full-payment         404 SECURE_LINK_UNAVAILABLE
REQUEST_ACCESS → /public/orders/full-payment/qr      404 SECURE_LINK_UNAVAILABLE

ORDER_ACCESS   → /public/ready-made-orders/current   200   (its own)
ORDER_ACCESS   → /public/custom-requests/status      404 SECURE_LINK_UNAVAILABLE
ORDER_ACCESS   → /public/quotations/current          404 SECURE_LINK_UNAVAILABLE
```

The refusal is the one indistinguishable answer in every case. A `WRONG_SCOPE`
code would tell a probe the token was real and only pointed somewhere else.

**F3.** The two credentials were told apart by the **server's own issuance** —
the worker renders each landing from the scope carried in the sealed envelope,
from a closed set — not by anything the run decided. The `ORDER_ACCESS` grant
count is exactly one, which is what proves F2's mirror used a genuinely second
grant rather than re-reading the first.

The Wave-2-off half of the same property is §F above: with the flag off, all 28
`STATIC_DENY` operations and all 7 withheld routes answer `404` while
`ORDER_ACCESS` and the whole Ready-Made surface stay live. No fabricated scope
token was used anywhere, and `/truy-cap` remains a server-side scope resolution.

### AC.7 Journey H — grant death

`specs/app12/h01-grant-death.acceptance.spec.ts`.

A real order is placed, priced and opened on the secure surface. The credential
is proved live (`200`). The grant is then revoked out from under the open
session by writing the same columns the issuer's own revoke path writes — a
disposable-database fixture mutation that preserves the row's invariants.
**No production revocation endpoint was added**; none exists, and H01 may not add
one.

```text
API     revoked credential      → 404 SECURE_LINK_UNAVAILABLE
API     never-existed token     → 404 SECURE_LINK_UNAVAILABLE   (identical)
screen  order code              → gone
screen  transfer reference      → gone
screen  the word "revoked"      → never rendered
screen  the dead credential     → absent from storage, DOM and the address bar
```

The strongest assertion here is the last screen one: the card a **revoked** grant
renders is compared **as text** against the card an **unknown** token renders,
and they are identical. A word blacklist cannot make that claim — and the first
attempt at this journey used one, which correctly failed against the approved
card's own generic sentence about links ceasing to work. That sentence is not a
leak; a single *differing* sentence between the two states would be, and only a
comparison catches it.

### AC.8 Rate-limit threshold

`apps/api/src/modules/customer/infrastructure/rate-limit/secure-link-rate-limiter.spec.ts`
— 6 tests, deterministic, no timing.

`SlidingWindowRateLimiter` takes its clock as a constructor argument, so the
window is advanced by assignment rather than by sleeping. Nothing waits and
nothing races; the shared server is never hammered.

```text
within budget (5 of 5)                    → allowed, reaches normal authorization
the 6th                                   → refused at the exact threshold
the refusal                               → bounded: 0 < retryAfterMs ≤ 60_000
after the window moves                    → the source is admitted again
a second source                           → unaffected by the first's exhaustion
a tighter published policy (1)            → honoured; no default of its own
five identical calls exhaust the budget   → the count moves for every call
```

The last is the security property: the limiter is charged per **request**, never
per outcome. Structurally, `check(networkKey, policy)` has no parameter a token,
digest or result could be passed in and the class publishes no second method a
success could call instead — so the budget cannot vary with the credential and
cannot become the validity oracle the indistinguishable refusal exists to deny.
Both public token surfaces share one dimension and key, so a caller cannot escape
the budget by spreading guesses across two routes.

**Verification's durable limits** are already covered by delivered real-database
integration authority, cited rather than duplicated:

```text
issuance window   apps/api/src/modules/customer/tests/integration/
                    verification-challenge-issue.integration.spec.ts
resend cooldown   apps/api/src/modules/customer/tests/integration/
                    verification-challenge-resend.integration.spec.ts
maxAttempts       apps/api/src/modules/customer/tests/integration/
                    verification-attempt.integration.spec.ts
                    verification-attempt-concurrency.integration.spec.ts
```

Admin login's limiter is the same `SlidingWindowRateLimiter` class under a
different dimension; the threshold proof above covers the algorithm, and the E2E
topology deliberately raises the IP/global ceilings (`1000`) so independent
journeys do not couple. No separate focused proof was added, because it would
assert the same code path twice.

### AC.9 Live run evidence

```text
e2e:app12:h01         9 passed   (A1 A2 A3 · B C D E G · H)
e2e:app12:h01:wave2   3 passed   (F1 F2 F3)

[e2e] cleanup verified: all E2E ports closed, disposable database dropped
```

Both runs end on that line, which is the orchestrator's own `finally`-block
verification and not a claim this report makes.

### AC.10 Two harness defects found and fixed

Neither is an application change, and both made the security evidence unreliable
rather than wrong.

**The Admin login hydration race.** All three delivered Admin login drivers did
`goto('/login')` → `fill(email)` → `fill(password)` → `click`. The inputs are
React-controlled, so a fill landing before hydration is overwritten when the
client takes over the DOM; the submit then carries empty credentials and the run
fails on a missing logout button with **both fields blank** — which is exactly
what the failure screenshots showed. The fills are now wrapped in a `toPass` that
asserts the values stuck before submitting. `a01-world`, `a02-world` and
`s03-admin-driver` all benefit.

This one is worth recording for a second reason. Mid-continuation this report's
author saw one failing `APP12-A01` run with the H01 changes and one passing run
at entry `HEAD`, and concluded the CSP had broken Admin login. **It had not** — a
re-run was 8/8 both ways, and the real cause was this race. The conclusion was
withdrawn before anything was built on it.

**Journey G and the secure-link budget.** The limiter counts requests and never
outcomes — deliberately, so it cannot become a validity oracle — which means a
run that has already exercised several security journeys can meet its own budget
mid-file. That is the limiter working, not the initiation failing, and the
delivered screen's answer is a control the customer presses again. `openAttempt`
now outlasts the 60-second window and re-presses the delivered control, which is
what a customer does and is a stronger proof of the affordance than asserting it
exists.

### AC.11 Residual red gates, exactly routed

The API suite is **not** green in aggregate and this report does not claim it is.

```text
H01-owned Wave-1 security gates   GREEN
  API contract suites             50 suites / 1219 tests
  API unit + architecture         174 suites / 3229 tests
  rate-limit threshold            6 / 6
  Storefront                      131 suites / 2489 tests
  Admin                           134 suites / 1924 tests
  e2e typecheck + lint            clean
  live journeys                   12 / 12

global residual failures          14 tests in 5 suites
```

| Failure | Suites | Proven unchanged at entry | Exact owner |
|---|---|---|---|
| Design Studio / Editor | `design-session-asset-delivery.spec.ts`, `design-session-asset-status.spec.ts`, `design-template-admin.spec.ts`, `design-template-save.spec.ts` — 13 tests | Yes: `git stash` to entry `HEAD` reproduces **4 failed / 13 failed / 129 passed**, identical | **`APP12-W02`** — Editor functional deep UAT |
| Canonical table count (78 vs 79) | `packages/persistence` `database-runtime.integration.spec.ts` — 1 test | Yes; H01 changed no schema and migrations remain 38 | **`APP12-H02`** |

**Why the 13 do not weaken Wave-1 isolation.** Their subjects are
`APP3-B06C session credential`, `DesignSessionReadGuard — read limit`, `the
published save contract` and `the three Admin Design Template operations`. Every
public operation behind them — `publicDesignSession*`, `publicDesignTemplate*` —
is in the 28-operation `STATIC_DENY` set, and §F proves live that all 28 answer
`404` with the flag off; the Admin design-template operations are staff-only
Wave-2 authoring behind `AuthenticatedAdminGuard`. The Wave-1 boundary is proved
independently by the denial matrix (§R) and by the 12 live journeys, none of
which touches a design-session or design-template surface. H01 also **reduced**
the failing set: `catalog-placement-boundary` and `actor-context` were among it
at entry and are now green (§U).

### AC.12 Follow-up owner reconciliation — no vague owners remain

Two dispositions in the first tier were not stable roadmap owners and are
replaced.

**The four APP3/Wave-2 suites** were routed to "the checkpoint that owns APP3
debt". They are now routed to **`APP12-W02` — Editor functional deep UAT**, which
is the locked checkpoint whose scope is the Editor's functional surface, and the
one that will exercise every operation these suites guard.

**`FU-APP12-H01-05` — the repository-wide file-size violations.** Re-measured
after H01's own splits: **81**, none of them a file H01 created and none above
even the review threshold among the 101 files H01 touched. Classified into four
classes with exact owners rather than 82 follow-up ids:

| Class | Count | Files | Exact owner |
|---|---|---|---|
| Wave-2 Editor / Design Studio runtime and specs | 11 | `design-studio/components/studio-stage-screen.tsx`, `design-studio/hooks/use-studio-autosave.ts`, `design-studio-source.test.ts`, `design-case-workbench.test.tsx`, `design-template-lifecycle.spec.ts`, `public-design-template.spec.ts`, `design-version-{authoring,detail}.integration.spec.ts`, `design-template-lifecycle.integration.spec.ts`, `public-design-template.integration.spec.ts`, `drizzle-product-placement.repository.ts` | **`APP12-W02`** |
| Wave-2 custom-request surface | 2 | `drizzle-custom-request.repository.ts`, `admin-custom-request-detail.response.ts` | **`APP12-W04`** |
| Wave-2 e2e acceptance specs | 2 | `specs/app4/e01-r01.acceptance.spec.ts`, `specs/app5/e01.acceptance.spec.ts` | **`APP12-W04`** |
| The shared e2e orchestrator | 1 | `scripts/run-e2e.mjs` — 662 lines at entry (already over), 707 after H01 added 45 lines of mode wiring | **`APP12-E01`** |
| Historical checkpoint verification tooling | 65 | `tools/check-app3-*` (43), `tools/check-app4-*` (17), `tools/smoke-app3-*` (3), `tools/check-app6-*` (1), `tools/app3-accepted-paths.mjs` (1) | Outside H01 acceptance; recorded at **`APP12-X01`** as a known limitation. Non-runtime checkpoint gates from closed phases, reached by no scoped gate by governance design |

H01 owned four named hard-limit files and closed all four (§U). It also closed
two violations it had itself introduced during this continuation, before they
could be routed anywhere: the evidence controller's disposition note (402 → 388)
and the secure-journeys spec (608 → 510, by splitting Journey H into its own
file, which also made each file about a single question).

### AC.13 Hygiene

```text
validation                       DISPOSABLE
disposable_db_removed            true    (both runs, orchestrator-verified)
disposable_minio_removed         true    (both runs, orchestrator-verified)
shared_dev_H01_orders            0
shared_dev_H01_attempts          0
shared_dev_H01_evidence          0
shared_dev_H01_grants            0
G03_data_created                 false
```

Every commercial row, secure grant, payment attempt and uploaded object in this
continuation was written to a disposable database and a disposable object store
that the orchestrator provisions and destroys per run. The shared development
stack was used only for the read-only header capture in §S, which mutates
nothing. No immutable-row deletion workaround was needed, because nothing
commercial was ever written where a deletion would be required.

Browser artifacts are off for both projects — `trace: 'off'`, `video: 'off'`,
`screenshot: 'off'` — so no artifact on disk can capture a request body carrying
a live `ORDER_ACCESS` token. Run directories were removed from the working tree.

### AC.14 Baseline, re-measured after the continuation

```text
OpenAPI            125 paths / 138 operations / 278 schemas   unchanged
public operations  49                                          unchanged
release matrix     28 DENY / 18 ALLOW / 3 SCOPE_GATED          unchanged
migrations         38                                          unchanged
DB schema          unchanged
Admin routes       26                                          unchanged
Storefront routes  20                                          unchanged
Figma              unchanged (0 reads, 0 writes)
G03 data           false
```

No business HTTP operation, route or migration was added. The continuation's
entire change surface is test infrastructure, two harness fixes, one new API
unit spec, one trimmed documentation comment and this report.
