# APP12-N01.B01 — Email-Only OTP Delivery — Completion Report

```text
APP12-N01.B01             = COMPLETE
APP12-N01                 = IMPLEMENTATION_IN_PROGRESS

SMTP_DELIVERY_BOUNDARY    = PASS
REAL_INBOX_MANUAL         = NOT_EXECUTED

INTERNAL_NEXT             = N01.S01
N01.S01                   = NOT_AUTHORIZED — NOT_EXECUTED
N01.E01                   = NOT_AUTHORIZED — NOT_EXECUTED

APP12-U01                 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01                 = NOT_AUTHORIZED
APP12-R01                 = NOT_AUTHORIZED

ROADMAP_CHECKPOINTS       = 40
PRODUCTION_DEPLOYED       = false
PUSHED                    = false
```

Date: 2026-09-09 · Branch: `feat/app11-s04-seo-infrastructure`

---

## A. Verdict

`APP12-N01.B01` is **COMPLETE**.

The repository now has a production-capable email transport. Before this
package it had exactly one `NotificationChannelPort` implementation — the
in-memory recording adapter — wired unconditionally, so every verification code
"delivered" successfully into an array that died with the process. That is the
blocker `APP12-U01` found, and the reason no real customer could complete a
Ready-Made order.

Three things changed, and the third matters as much as the first two:

1. **`SmtpNotificationChannelAdapter`** — real SMTP, provider agnostic, with
   nodemailer confined to the adapter file.
2. **Customer verification is email only**, enforced in the domain rather than
   only at the HTTP edge, so the refusal holds for the resend path and for any
   non-HTTP caller.
3. **The transport is no longer a wiring default.** `NOTIFICATION_TRANSPORT`
   must be stated, and `RECORDING` is *refused* when `NODE_ENV` is `production`
   or `staging`. A deployment can no longer accidentally deliver to nobody,
   which is the actual defect — the missing adapter was only its symptom.

The SMTP boundary is proven against a real SMTP server over TCP, not a mock.
It is **not** proof that mail reaches a human inbox; §M states that limit
precisely.

---

## B. Human-PO roadmap override

The Product Owner's override is recorded as given and was not re-litigated:

```text
PREVIOUS_ROADMAP_CHECKPOINTS = 39
NEW_ROADMAP_CHECKPOINTS      = 40

... APP12-G03 → APP12-N01 (EMAIL-ONLY OTP DELIVERY) → APP12-U01 → APP12-E01 → APP12-R01 ...
```

`APP12-U01` stays `SUSPENDED_PENDING_BLOCKER_RECOVERY`; it was not executed,
resumed or re-run. `N01.S01` and `N01.E01` were not started. Nothing was
deployed and nothing was pushed.

---

## C. U01 notification blocker reconciliation

The `APP12-U01` report recorded this as a blocking, unowned finding
(`FU-APP12-U01-NOTIFICATION-PROVIDER`), with `IMP-O006` routed to APP12 at
`APP4-X01` and held by none of the then-39 checkpoints. `APP12-N01` is the
checkpoint that now owns it, and `N01.B01` closes the transport half.

What U01 measured, and what it measures now:

| U01 finding | Before | After N01.B01 |
|---|---|---|
| implementations of `NotificationChannelPort` | 1 (recording) | 2 (recording + SMTP) |
| production wiring | recording, unconditional | chosen; recording refused in production/staging |
| email/SMS SDKs in any `package.json` | 0 | 1 email (`nodemailer`), still **0 SMS** |
| a real customer can receive a code | no | yes, once an operator supplies SMTP config |

The circular test U01 correctly rejected — read the code out of the worker's own
process memory, type it back into checkout — is **not** used as evidence
anywhere in this report. §M explains what replaced it and what that proves.

---

## D. Email-only channel authority

```text
CUSTOMER_OTP_CHANNEL = EMAIL_ONLY
EMAIL_OTP = SUPPORTED
PHONE_OTP = NOT_SUPPORTED   SMS_OTP = NOT_SUPPORTED   VOICE_OTP = NOT_SUPPORTED
PHONE_NUMBER != VERIFICATION_CHANNEL
```

The authority is one small module,
`apps/api/src/modules/customer/domain/verification/verification-channel.ts`,
declaring `VERIFICATION_CONTACT_KINDS = ['EMAIL']`. Everything else reads it:
the public request schema publishes that constant as its enum rather than
restating `['EMAIL']`, and a test asserts the two cannot drift.

Phone numbers are untouched everywhere they genuinely serve: the delivery
recipient on an order, the Admin contact-maintenance surface, customer merge,
and every existing `contact_points` row. No historical `PHONE` value was
rewritten or deleted, and `ContactKind` in the database still admits both.

---

## E. Existing APP4 verification preflight

Read before changing anything, and left authoritative:

```text
challenge TTL · code length/alphabet · single-use semantics
resend cooldown · attempt cap · issuance rate window
notification-intent lifecycle · outbox linkage · worker retry schedule
the sealed AES-256-GCM delivery envelope
```

None of it moved. `N01.B01` mints no code, holds no TTL and generates no
secret; the SMTP adapter receives a code that `APP4-B03` minted and the envelope
carried, and turns it into a message.

The one structural discovery that shaped the design: **both** public verification
operations — initial issue and resend — funnel through
`VerificationChallengeIssuer.issue`. The resend carries its contact kind forward
from the source row, so a legacy `PHONE` challenge would otherwise mint a fresh
code for a transport that does not exist. Placing the refusal at that single
choke point covers both, and covers callers that do not exist yet.

---

## F. Notification/worker architecture before

```text
API                                  WORKER
challenge created                    outbox event claimed
  ↓                                    ↓
notification intent + outbox event   envelope opened
  (sealed envelope in payload)         ↓
                                     NOTIFICATION_CHANNEL_PORT
                                       └─ RecordingNotificationChannelAdapter   ← delivered to nobody
```

The port, the intent lifecycle, the retry policy and the envelope were all
already correct — `ADR-APP4-001` §12 explicitly anticipated "a real transport
arrives as a second adapter behind the same symbol". `N01.B01` is that adapter
plus the wiring decision APP4 deliberately deferred. No lifecycle was rewritten.

---

## G. SMTP adapter

`apps/worker/src/jobs/notification-delivery/infrastructure/channel/smtp-notification-channel.adapter.ts`

- Implements `NotificationChannelPort` — the port's six plain fields in, its
  two-state result out. **No nodemailer type appears in any domain or
  application signature**; the library is imported in this file and nowhere else.
- Renders through `verification-email.renderer.ts` and mints nothing.
- Refuses a non-`EMAIL` channel as a **permanent** failure and sends nothing:
  `NotificationChannel` still admits `SMS` because historical rows do, no SMS
  transport exists or will, and a retryable classification would spend the whole
  retry budget re-deciding something that cannot change.
- Classifies failures into bounded classes and **never forwards a provider
  message** — an SMTP error string routinely quotes the envelope recipient, and
  an auth failure can quote the username.

```text
4xx reply                → retryable      SMTP_TEMPORARY_REFUSAL
5xx reply                → permanent      SMTP_PERMANENT_REFUSAL
EAUTH                    → permanent      SMTP_AUTH_REJECTED
ECONNECTION/ECONNREFUSED → retryable      SMTP_CONNECTION_FAILED
ETIMEDOUT/ESOCKET        → retryable      SMTP_TIMEOUT
no reply code at all     → retryable      SMTP_UNKNOWN_FAILURE
```

`EAUTH` is deliberately **not** retryable: a password does not become correct by
waiting, and a relay that sees repeated failed logins blocks the sender.

---

## H. Configuration and secret handling

`notification-transport.config.ts` is the loader. Every validation error names
the **variable** and never its value, following `loadStorefrontPublicOrigin`.

```text
NOTIFICATION_TRANSPORT   SMTP | RECORDING     required, no default
SMTP_HOST                                     required when SMTP
SMTP_PORT                integer 1..65535     required when SMTP
SMTP_SECURE              default false        implicit TLS on connect (465)
SMTP_REQUIRE_TLS         default true         refuse an unencrypted session
SMTP_USERNAME                                 required when SMTP
SMTP_PASSWORD                                 required when SMTP — credential
EMAIL_FROM_ADDRESS       a single bare address, no display name
EMAIL_FROM_NAME          default "Nét Thêu"
```

Two details are deliberate rather than incidental:

- **`SMTP_PASSWORD` is read without trimming.** A password may legitimately
  begin or end with whitespace, and silently trimming it produces an
  authentication failure that reads as "wrong password" rather than "mangled by
  us". Only emptiness is rejected.
- **`EMAIL_FROM_ADDRESS` must be a bare address.** `Nét Thêu <no-reply@…>` here
  would produce a doubled display name in the customer's client, or a malformed
  header; the display name is `EMAIL_FROM_NAME`'s job.

No real credential is committed anywhere. `.env.example` ships names with empty
values, the ConfigMap ships empty strings, both overlays ship empty placeholders,
and a test asserts the password never appears in a validation error.

---

## I. Environment wiring

```text
production / staging   SMTP required. RECORDING refused outright.
                       SMTP_REQUIRE_TLS=false refused.
development            must state a transport; Compose supplies RECORDING.
isolated tests         RECORDING, stated by the Jest setup file.
SMTP integration test  constructs the adapter directly against a loopback listener.
```

`notification-channel.factory.ts` is the single place the decision is made. It is
an eager Nest factory rather than a lazily memoized provider — the opposite of
`StorefrontPublicOriginProvider`'s choice, and for a stated reason: that value is
needed only when a secure link is rendered, whereas this one is needed by every
delivery, and its whole purpose is that a misconfigured deployment must not start
and quietly deliver nothing. When it does resolve to `RECORDING` it logs a
warning saying so in as many words.

`apps/worker/test/setup-notification-transport.ts` states `RECORDING` for Jest.
It is a `setupFiles` entry rather than a per-context assignment so a suite added
later cannot silently inherit a *production* default — there is none to inherit.

---

## J. OTP email content

`verification-email.renderer.ts` — pure, no I/O, no provider type, no transport.

```text
Subject   Mã xác thực Nét Thêu
Text      always produced
HTML      always produced
```

Both parts always: a text-only client, a screen reader, and a spam filter that
scores HTML-only mail harshly all read the text part, and sending HTML alone is
how a transactional message lands in a junk folder.

The body states the brand, that the code verifies the email, the validity in
whole minutes, that the code must not be shared, and that an unrequested message
may be ignored. **Expiry is stated, never recomputed** — the minutes come from
the delivery's own `issuedAt`/`expiresAt`, so this renderer holds no TTL of its
own and cannot disagree with the policy.

Nothing else travels: no password, session token, `ORDER_ACCESS` token, merchant
detail, customer id, challenge id, request id or debug context. A test asserts
each of those strings is absent from subject, text and HTML together. The code is
HTML-escaped — impossible today, since it is server-minted decimal digits, which
is exactly why it is asserted rather than assumed by whoever changes the minter
next.

---

## K. Worker delivery, retry and idempotency

Unchanged, and verified unchanged. The path is still:

```text
challenge created → notification intent → worker claims → adapter sends
                 → existing delivery authority persists the result
```

No email is sent from an HTTP controller. The existing suite continues to prove
the properties that matter, now with the transport decision in place:

```text
delivers one claimed job and satisfies its intent            PASS
sends nothing a second time when the intent is SATISFIED     PASS   ← replay
retries the same row with the same envelope and same secret  PASS
stops at the policy budget, on the policy schedule, dead-letters PASS
does not retry a non-retryable transport refusal             PASS
never calls the channel when the envelope does not authenticate PASS
writes the secret to no log line, on success or on failure   PASS
```

`113/113` notification-delivery tests pass; `1155/1155` across the whole worker.

---

## L. PHONE / SMS refusal

Refused at three depths, so no single edit reopens it:

1. **Contract** — `contactKind` is `z.enum(VERIFICATION_CONTACT_KINDS)`, i.e.
   `['EMAIL']`. A `PHONE` or `SMS` body is rejected by validation.
2. **Domain** — `VerificationChallengeIssuer.issue` refuses a non-email kind
   **before the minter runs**, so nothing secret is created for a destination
   that can never be reached. This is the only path both public operations take.
3. **Transport** — the SMTP adapter refuses a non-`EMAIL` delivery permanently
   and sends nothing.

The refusal is `422 VERIFICATION_CHANNEL_UNSUPPORTED`, *"Verification codes are
sent by email only."* — 422 and not 400 because the schema no longer admits
`PHONE` on the way in, so the only way to reach it from HTTP is a resend of a
legacy `PHONE` challenge; the refusal is about what the system will carry, not
about how the caller wrote it. It names no contact.

Proven: a `PHONE` issuance creates **no challenge, no notification intent and no
outbox delivery event**. No SMS intent can be produced, and no SMS dependency or
provider was added.

---

## M. Local SMTP integration evidence

```text
SMTP_DELIVERY_BOUNDARY = PASS
REAL_INBOX_MANUAL      = NOT_EXECUTED
```

`apps/worker/src/jobs/notification-delivery/tests/smtp-capture-server.ts` starts
a genuine `smtp-server` listener on an ephemeral loopback port. The adapter
connects over TCP and completes a real session — EHLO, AUTH, MAIL, RCPT, DATA —
and the raw bytes that went over the wire are captured. `authOptional` is false,
so a regression that dropped credentials fails here rather than passing quietly.

15/15 cases pass:

```text
completes a real SMTP session and reports SENT
addresses the envelope to the requested recipient
carries the Nét Thêu verification subject          (RFC 2047 decoded)
carries the issued code
states the expiry the challenge was issued with    ("10 phút" for a 600 s window)
sends both a plain-text and an HTML part
sends exactly one message for one delivery
puts no secret in the message beyond the code itself
4xx refusal → retryable · 5xx refusal → permanent
rejected credentials → not retried
unreachable server → retryable
never marks a refused send as delivered
refuses an SMS delivery permanently and sends nothing
never writes the code, the password or the address to a log
```

The subject assertion needed a real RFC 2047 decoder: a non-ASCII subject travels
as an encoded-word in the header, so asserting on raw bytes would either fail on
correct output or — worse — pass on a subject no mail client renders as
Vietnamese.

**This is not real customer delivery.** A captured message is not a delivered
one. Whether a provider accepts, routes and files this mail in a human's inbox is
a manual check with real credentials, and no test in this repository claims it.

---

## N. Security and logging evidence

```text
OTP in normal logs             none — asserted by capturing stdout/stderr during a real send
SMTP password in logs          none — same assertion
SMTP password in errors        none — asserted against the config loader
unmasked recipient in logs     none — masked as k***@vidu.test
provider error text in logs    none — classified, never forwarded
```

Allowed observability, and all that is emitted: channel, masked recipient,
bounded failure class, retryable flag, and the opaque `providerMessageRef` the
transport returns.

`maskRecipient` is a **log** mask, deliberately not a second copy of the APP4
masking authority: nothing it produces is persisted, returned or rendered to a
customer. It mirrors PO-03's shape and uses `Array.from` so a multi-byte first
character is not split into a mojibake half.

Also still green, unchanged by this package: expired code refused, wrong code
refused, single-use enforced, attempt cap, resend cooldown, issuance rate window.

---

## O. OpenAPI and generated client

```text
paths       127   unchanged
operations  140   unchanged
schemas     279   unchanged
public ops   49   unchanged

new paths       0
new operations  0
```

The entire contract delta is the enum narrowing and its description:

```diff
-              "EMAIL",
-              "PHONE"
+              "EMAIL"
```

`openapi:check` → *"OpenAPI artifact is up to date."*
`check:generated` → *"generated client is up to date (tree hash 2af5dce0…)."*

No duplicate `/send-email-otp` endpoint was created; the delivered operations
were evolved, exactly as §7 requires.

---

## P. Deployment wiring

Changed only what was required to supply SMTP config through configuration and
secrets. No provider-specific infrastructure was introduced.

```text
.env.example                     names + empty values, with the reasoning
docker-compose.dev.yml           worker: NOTIFICATION_TRANSPORT + SMTP_* passthrough,
                                 defaulted to RECORDING for development only
k8s base ConfigMap               NOTIFICATION_TRANSPORT/SMTP_*/EMAIL_FROM_* empty
k8s overlays (staging, prod)     empty placeholders
release contract                 5 new CONFIG_RULES + 2 new required Secret keys
```

The worker Deployment already uses `envFrom` over the whole ConfigMap and Secret,
so no manifest change was needed.

`check-release-config` now refuses a deployment whose transport is not `SMTP`, or
whose mail settings are empty. Against the committed overlays it therefore fails
— **which is the intended fail-closed behaviour**, identical to
`STOREFRONT_PUBLIC_ORIGIN` and the merchant account before it. Measured honestly:

```text
staging at HEAD (before this package)   FAIL (6)  — image placeholders, routing
staging after                           FAIL (9)  — the same 6, plus the 3 mail values
```

The three additions are `MISSING: … declared but empty`, which is what an
unconfigured checkout should say. An empty placeholder is deliberate: a host that
parses is a host that deploys.

---

## Q. Files changed

New — API:

```text
apps/api/src/modules/customer/domain/verification/verification-channel.ts        58
apps/api/src/modules/customer/domain/verification/verification-channel.spec.ts   66
```

New — worker:

```text
.../notification-delivery/config/notification-transport.config.ts              186
.../notification-delivery/config/notification-transport.config.spec.ts         163
.../notification-delivery/config/notification-channel.factory.ts                55
.../notification-delivery/domain/verification-email.renderer.ts                132
.../notification-delivery/domain/verification-email.renderer.spec.ts           104
.../notification-delivery/domain/recipient-mask.ts                              34
.../notification-delivery/infrastructure/channel/smtp-notification-channel.adapter.ts       155
.../notification-delivery/infrastructure/channel/smtp-notification-channel.adapter.spec.ts  245
.../notification-delivery/tests/smtp-capture-server.ts                         163
apps/worker/test/setup-notification-transport.ts                                20
```

Changed — API:

```text
presentation/schemas/public-verification.request.ts     contactKind → the authority's enum
application/verification-challenge.issuer.ts            the refusal, above the minter
domain/verification/verification-issue-outcome.ts       + VERIFICATION_CHANNEL_UNSUPPORTED
domain/verification/verification-http.errors.ts         + its 422 response
tests/integration/verification-challenge-issue.integration.spec.ts   PHONE now asserts refusal
tests/integration/verification-attempt.integration.spec.ts           PHONE case removed, with why
```

Changed — worker, storefront, infrastructure, tooling:

```text
notification-delivery.module.ts            binds the factory, not the recording adapter
tests/notification-delivery-context.ts     states its transport
jest.config.mjs                            setupFiles
apps/storefront/.../contact-draft.ts       compile compatibility (§22) — see §W
apps/storefront/.../verification.client.ts compile compatibility (§22) — see §W
.env.example · docker-compose.dev.yml · k8s configmap + 2 overlays
tools/check-release-config.contract.mjs · tools/check-release-config.test.mjs
packages/contracts/openapi/openapi.generated.json · packages/api-client (generated)
apps/worker/package.json · pnpm-lock.yaml
```

Two files in this working tree — `storefront-header.tsx` and
`storefront-shell.scss` — belong to a **separate** Product-Owner-instructed
Storefront header correction made before this checkpoint, not to `N01.B01`. They
are named here so the diff is not misread as this package's work.

---

## R. Dependency delta

```text
nodemailer     ^10.0.1   MIT-0   runtime (apps/worker)   the SMTP transport
smtp-server    ^3.19.9   MIT-0   dev/test only           the disposable capture listener
@types/nodemailer   ^8.0.1       dev only
@types/smtp-server  ^3.5.13      dev only
```

`nodemailer` is a mature, dependency-light SMTP client, isolated behind the
notification port adapter. `smtp-server` is its server-side sibling and never
ships: it exists so the acceptance crosses a real protocol boundary in-process,
with no Docker service and no port to leak.

**No SMS dependency was added.** No Twilio, Vonage, eSMS or equivalent.

---

## S. File size

```text
node tools/check-file-size.mjs --paths <the four changed roots>
  → passed, 44 files, 1 above the review threshold
```

The single review-threshold file is
`notification-delivery.usecase.ts` at **362 lines** — pre-existing, untouched by
this package, and well under the 400-line hard limit. Every file `N01.B01` adds
is under 300 except the SMTP adapter spec (245) and the capture server (163),
both within the 600-line test limit.

---

## T. Validation

Change-impact only, per `VALIDATION_GOVERNANCE.md` §3.

| Control | Command | Result |
|---|---|---|
| whitespace | `git diff --check` | pass |
| API typecheck | `pnpm --filter @embroidery/api typecheck` | pass |
| worker typecheck | `pnpm --filter @embroidery/worker typecheck` | pass |
| client typecheck | `pnpm --filter @embroidery/api-client typecheck` | pass |
| storefront typecheck | `pnpm --filter @embroidery/storefront typecheck` | pass |
| API lint | `pnpm --filter @embroidery/api lint` | pass |
| worker lint | `pnpm --filter @embroidery/worker lint` | pass |
| email-only authority | `jest --testPathPatterns=verification-channel` (api) | **7/7** |
| verification integration | `jest --runInBand --testPathPatterns="verification-attempt.integration\|verification-challenge-issue\|verification-challenge-resend"` | **35/35** |
| **SMTP boundary** | `jest --testPathPatterns=smtp-notification-channel` (worker) | **15/15** |
| transport selection | `jest --testPathPatterns=notification-transport.config` | **19/19** |
| email content | `jest --testPathPatterns=verification-email` | **10/10** |
| notification worker | `jest --testPathPatterns=notification-delivery` | **113/113** |
| worker suite | `pnpm --filter @embroidery/worker test` | **1155/1155, 70 suites** |
| storefront suite | `pnpm --filter @embroidery/storefront test` | **2549/2549, 134 suites** |
| release config tests | `node --test tools/check-release-config.test.mjs` | **13/13** |
| release preflight | `node tools/check-release-config.mjs staging\|production` | fails closed on empty mail config — see §P |
| OpenAPI drift | `pnpm --filter @embroidery/api openapi:check` | up to date |
| client drift | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| compose validity | `docker compose -f …dev.yml --env-file .env config` | valid |
| file size | `node tools/check-file-size.mjs --paths …` | pass |
| format | `npx prettier --check <changed files>` | pass |

Not run, and why:

```text
APP12-U01 journey   suspended by PO authority; not resumed
APP12-E01           NOT_AUTHORIZED
```

Two failures I first saw and traced rather than accepted: `ready-made-full-verification`
and `ready-made-verification-race` failed inside a 16-suite parallel run and
**pass in isolation** — each provisions a disposable database and applies 39
migrations, and the parallel run exhausted that. They are green at HEAD and green
now; the failure was contention, not this change.

---

## U. Hygiene

```text
shared dev DB census digest   559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343
                              identical to the APP12-U01 entry and exit snapshots
shared_dev_mutations          0
G03_data_created              false
G03 manifest                  unchanged
disposable SMTP teardown      PASS — the listener binds port 0 and is closed in afterEach;
                              no container, no fixed port, nothing survives the run
temporary processes/ports     none left open
real credentials committed    none — every value is a name or an empty placeholder
```

---

## V. Baseline

```text
OpenAPI paths       127   unchanged      migrations   39   unchanged — no 0040
OpenAPI operations  140   unchanged      DB tables    79   unchanged
OpenAPI schemas     279   unchanged      Admin routes 26   unchanged
public operations    49   unchanged      Storefront   20   unchanged
```

`BLOCKED_SCHEMA_AUTHORITY` was not reached: no DB change was mechanically
necessary and none was made.

---

## W. N01 internal roadmap

```text
N01.B01   COMPLETE — this report
N01.S01   NEXT — NOT_AUTHORIZED, NOT_EXECUTED
            email-only Storefront verification UX
            remove the phone/SMS verification affordance
            copy / i18n
            customer error states
N01.E01   NOT_AUTHORIZED
            cross-boundary email-delivery acceptance
            local SMTP-capture proof at the boundary
            manual-real-inbox readiness handoff
```

### The bounded Storefront change §22 permits, stated exactly

No Storefront UX was built. Two files changed for compile compatibility only,
because the generated contract narrowed under them:

- `contact-draft.ts` — `CONTACT_KIND_VALUES.PHONE` can no longer read the
  generated enum, so it is a local literal. The phone *shape check* still works;
  it is simply no longer a wire value.
- `verification.client.ts` — the seam can still be handed `PHONE` while the UI
  offers it, and the server refuses that with `422`. The cast states that interim
  honestly rather than widening the contract type or silently rewriting the
  customer's choice.

**Interim behaviour, stated plainly:** until `N01.S01` lands, a customer who
picks "Số điện thoại" on the Storefront gets a refusal instead of a code. That is
strictly better than the previous behaviour — a code that was minted and could
never arrive — but it is a visible rough edge, and it is `N01.S01`'s to remove.

### Manual real-email readiness (§15)

No code change is required. An operator sets, in `.env` or deployment
configuration:

```text
NOTIFICATION_TRANSPORT=SMTP
SMTP_HOST · SMTP_PORT · SMTP_SECURE · SMTP_USERNAME · SMTP_PASSWORD
EMAIL_FROM_ADDRESS · EMAIL_FROM_NAME
```

then runs the worker, API and Storefront, enters a real email at checkout,
requests a code and reads their inbox. Names only — no value is requested,
recorded or needed in this report.

---

## X. Remaining independent U01 blockers

`N01` closes the OTP-delivery blocker **only**. It does not authorize claiming
that `APP12-U01` can pass once `N01` completes. These remain open and untouched:

```text
FU-APP12-U01-VARIANT-AUTHORING          OPEN — blocking
  No delivered operation creates a product_variant, and adminSkuCreate has no
  Admin call site. An operator still cannot make a new Product sellable.

FU-APP12-U01-READINESS-FALSE-CLAIM      OPEN — blocking
  Publication readiness reports 7/7 green and offers Publish for a Product with
  no variant, no SKU and no stock. Separable: it would still be wrong after
  variant authoring ships.

FU-APP12-G03-01                         OPEN — nonblocking, reconcile before R01
FU-APP12-U01-LOW-STOCK-AUTHORITY        OPEN — pre-R01 triage
```

`APP12-U01` therefore stays `SUSPENDED_PENDING_BLOCKER_RECOVERY` and cannot be
re-run to a PASS on the strength of this package. Two of its three blockers are
still standing.
