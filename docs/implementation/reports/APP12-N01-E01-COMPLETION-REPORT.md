# APP12-N01.E01 — Email-Only OTP Delivery, Cross-Boundary Acceptance — Completion Report

```text
APP12-N01.E01             = AUTOMATED_ACCEPTANCE_COMPLETE

SMTP_DELIVERY_BOUNDARY    = PASS
SMTP_UI_INTEGRATION       = PASS
APPLICATION_TO_SMTP       = PASS

REAL_INBOX_MANUAL         = REQUIRED
REAL_CUSTOMER_INBOX       = NOT_PROVEN
APP12-N01                 = AWAITING_MANUAL_REAL_INBOX

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

`APP12-N01.E01` is **AUTOMATED_ACCEPTANCE_COMPLETE**. `APP12-N01` does **not**
close: the Product Owner's real-inbox acceptance has not been executed and is not
this package's to execute.

Three things happened, and only the second is new evidence rather than
housekeeping:

1. **The registry stopped pointing at an authority the product does not have.**
   Fourteen email-only frames were drawn and seven `APP4-D01` rows moved to
   `SUPERSEDED`. No historical frame was redrawn.
2. **The delivered message was read, not just counted.** `S01` proved a message
   crossed the SMTP boundary and that the browser answered with the code from
   it. It never asked what the message *said*. This package asserts the envelope
   recipient, the configured sender, the decoded Subject, both decoded
   alternatives, the stated expiry cross-checked against the challenge, the
   ignore-if-not-requested guidance, and the absence of five named secrets and of
   any UUID.
3. **The §9/§11/§12 obligations were found already discharged by `B01`** and were
   run rather than rebuilt — 113 worker tests covering replay, retry, permanent
   refusal, auth failure, fail-closed configuration and secret-free logging.

Two defects were found in this package's own harness and fixed before any claim
rested on it (§T). Both would have produced a *false* result — one a false red,
one a false green — and both are recorded rather than quietly corrected.

---

## B. B01 / S01 PO reconciliation

Neither was reopened. No API, worker, contract, generated-client, schema or
Storefront source file changed:

```text
apps/api/**              0 files changed
apps/worker/**           0 files changed
apps/storefront/**       0 files changed
apps/admin/**            0 files changed
packages/contracts/**    0 files changed
packages/api-client/**   0 files changed
packages/i18n/**         0 files changed
migrations               0 added
```

`S01`'s verdict is preserved and re-proved by a fresh run of its suite (8/8, §T).
Email-only UX, no chooser, no phone/SMS affordance, email-only request and
resend, email-specific verified copy, phone retained for delivery only, and the
OTP taken from the captured message rather than worker memory — all still hold.

`B01`'s authority was consumed, not re-decided. The transport rules, the
classification vocabulary and the renderer are `B01`'s; this package asserts
their observable output at the boundary.

---

## C. Final email-only authority

```text
CUSTOMER_OTP_CHANNEL = EMAIL_ONLY
EMAIL_OTP            = SUPPORTED
PHONE_OTP            = NOT_SUPPORTED
SMS_OTP              = NOT_SUPPORTED
VOICE_OTP            = NOT_SUPPORTED
PHONE_NUMBER        != VERIFICATION_CHANNEL
```

Held at five layers now, the fifth added here:

```text
copy       no sentence offers or implies a second channel
view       no control exists that could select one
model      no field exists that could hold one
type       the parameter that carried one no longer exists
design     the registry's approved authority no longer draws one
```

The design layer was the last one still contradicting the other four.

---

## D. Figma reconciliation

**Environment.** The project's canonical Figma authority — the desktop app's
local MCP server on `127.0.0.1:3845` — was unreachable for this session
(`ConnectionRefused`; port closed; only the `figma_agent` font helper running).
On the operator's instruction the work was done through the remote
`mcp.figma.com` server instead, authorised interactively to an account with a
Full seat. **This is the first checkpoint to write the registry through a
different Figma authority than the 578 rows before it**, and it is recorded here
rather than left silent.

**Live pre-write audit.** All 18 `APP4-D01` verification frames were read live
before any write. The chooser exists in exactly four:

```text
623:3   → 623:11 "Contact type tabs" → 623:12 "Tab Email" / 623:14 "Tab Số điện thoại"
623:27  → 623:35
623:51  → 623:59
628:3   → 628:10
```

The audit found **two contradictions the checkpoint brief did not name**:

```text
625:70   625:79 "…Hãy nhập mã trong tin nhắn mới nhất."   an SMS word, no chooser present
625:193  625:199 "Đã xác minh liên hệ"                    verifies a generic contact
628:121  628:129 "Liên hệ của bạn đã được xác nhận."      verifies a generic contact
```

So **seven** rows are superseded, not four. `S01` had already corrected all three
of those strings in `packages/i18n`; the design was the last place they survived.

**No historical frame was redrawn.** Every `APP4-D01` node is unmodified and was
re-read after the package to prove it (§T). Superseding moves *authority*, not
pixels — redrawing history to look current would destroy the evidence of when the
channel decision changed, which §4 explicitly forbids.

**Created — section `958:187` on page `APP_12`**, named
`12 — N01.E01 · Email-only customer verification (CUSTOMER_OTP_CHANNEL = EMAIL_ONLY)`:

| Registry ID | Node | State | Viewport |
|---|---|---|---|
| FIG-APP12-N01-E01-EMAIL-MOBILE-DEFAULT | 958:190 | Email Entry — Default | Mobile 390 |
| FIG-APP12-N01-E01-EMAIL-MOBILE-INVALID | 958:208 | Email Entry — Invalid Email | Mobile 390 |
| FIG-APP12-N01-E01-CODE-MOBILE-ACCEPTED | 959:187 | Code Entry — Request Accepted | Mobile 390 |
| FIG-APP12-N01-E01-CODE-MOBILE-MISMATCH | 959:212 | Code Entry — Code Mismatch | Mobile 390 |
| FIG-APP12-N01-E01-CODE-MOBILE-COOLDOWN | 960:187 | Code Entry — Resend Cooldown | Mobile 390 |
| FIG-APP12-N01-E01-VERIFIED-MOBILE | 960:217 | Email Verified | Mobile 390 |
| FIG-APP12-N01-E01-EMAIL-DESKTOP-DEFAULT | 961:187 | Email Entry — Default | Desktop 1440 |
| FIG-APP12-N01-E01-EMAIL-DESKTOP-INVALID | 965:187 | Email Entry — Invalid Email | Desktop 1440 |
| FIG-APP12-N01-E01-EMAIL-DESKTOP-SUBMITTING | 965:206 | Email Entry — Submitting | Desktop 1440 |
| FIG-APP12-N01-E01-EMAIL-DESKTOP-RATELIMITED | 962:187 | Email Entry — Rate Limited | Desktop 1440 |
| FIG-APP12-N01-E01-CODE-DESKTOP-ACCEPTED | 961:206 | Code Entry — Request Accepted | Desktop 1440 |
| FIG-APP12-N01-E01-CODE-DESKTOP-RESENT | 965:225 | Code Entry — Code Resent | Desktop 1440 |
| FIG-APP12-N01-E01-VERIFIED-DESKTOP | 962:207 | Email Verified | Desktop 1440 |
| FIG-APP12-N01-E01-HANDOFF | 963:187 | Authority, supersession & copy inventory | Desktop |

All 14 are `APPROVED_FOR_IMPLEMENTATION` with approval evidence exactly
`FIG-APPROVAL-APP12-N01-E01-PO-001`.

**Superseded, each pointing at a same-state, same-viewport replacement:**

```text
FIG-VERIFY-CONTACT-DESKTOP-DEFAULT      → FIG-APP12-N01-E01-EMAIL-DESKTOP-DEFAULT
FIG-VERIFY-CONTACT-DESKTOP-INVALID      → FIG-APP12-N01-E01-EMAIL-DESKTOP-INVALID
FIG-VERIFY-CONTACT-DESKTOP-SUBMITTING   → FIG-APP12-N01-E01-EMAIL-DESKTOP-SUBMITTING
FIG-VERIFY-CONTACT-MOBILE-DEFAULT       → FIG-APP12-N01-E01-EMAIL-MOBILE-DEFAULT
FIG-VERIFY-CODE-DESKTOP-RESENT          → FIG-APP12-N01-E01-CODE-DESKTOP-RESENT
FIG-VERIFY-CODE-DESKTOP-SUCCESS         → FIG-APP12-N01-E01-VERIFIED-DESKTOP
FIG-VERIFY-CODE-MOBILE-SUCCESS          → FIG-APP12-N01-E01-VERIFIED-MOBILE
```

The same-state requirement is why three desktop frames (invalid, submitting,
resent) exist that a mobile-primary set would not otherwise have needed: a
supersede pointer to a different state would be a worse record than none.

**Copy is transcribed from `packages/i18n/messages/vi/checkout.json` →
`verification.*`**, so the design and the shipped strings agree by construction
rather than by review. The `963:187` annotation carries the locked authority, the
supersession list with node ids, the full copy inventory and the accessibility
intent.

---

## E. Automated-world topology

`E01` runs on `S01`'s world exactly — reusing the mode string rather than forking
it, because `E01` asks what the message said, not what the world was:

```text
real PostgreSQL          disposable, created and dropped per run
real API                 the freshly built dist
real worker              in-process, poll loop held (E01_HELD)
real Storefront          the freshly built Next output
real gateway             the orchestrated NGF tier
SMTP capture listener    127.0.0.1, ephemeral port, AUTH required, forwards nowhere
NOTIFICATION_TRANSPORT   SMTP
```

`RECORDING` was not used. No shared-dev database was touched.

---

## F. Resolved SMTP adapter proof

```text
resolvedAdapter = SmtpNotificationChannelAdapter
```

Read from the **composed DI container**, not from `process.env` — the guard `S01`
had to rewrite after an environment-only check passed twice against stale builds.
Both applications were rebuilt before this run for the same reason. The suite's
first case fails the whole run if the graph resolves anything else.

---

## G. Browser SMTP journey

Primary viewport 390, all ten required steps:

```text
1  open checkout verification                              PASS
2  EMAIL is the only verification method                   PASS
3  enter a synthetic email                                 PASS
4  request the code                                        PASS
5  exactly one notification intent                         PASS
6  the worker processes it                                 PASS
7  the SMTP server accepts exactly one message             PASS
8  parse the OTP from the captured email                   PASS
9  enter the OTP in the browser                            PASS
10 verification succeeds, UI states "Email đã được xác minh" PASS
```

The code is parsed out of the captured message and passes through one function
into one field. It is never read from worker memory, a recording adapter or a
plaintext database seam.

---

## H. Email content

Asserted against the **decoded wire bytes** of the captured message:

```text
statedMinutes                 10
recipientIsRequested          true    envelope recipient == the requested address
senderIsConfigured            true    == the configured sender
subjectIsVerificationIntent   true    "Mã xác thực Nét Thêu"
textPartExists                true
htmlPartExists                true
codePresent                   true
expiryAgreesWithChallenge     true    stated window == the challenge's own window
ignoreIfNotRequested          true    "Nếu bạn không yêu cầu mã này…"
namesTheBrand                 true
leaks                         []
```

`leaks` is checked against five named values — the SMTP password, the
verification-code pepper, the secure-link pepper, the delivery envelope key and
the database URL — plus **any UUID at all**, since an internal identifier has no
business in a customer email.

**The expiry check is a real cross-check, not a fixture.** The browser captures
the `expiresAt` the API returned for *this* challenge and the HTTP `Date` header
from the same response; the message must state that window. The TTL is
policy-driven in the database, so no constant is hardcoded anywhere in the check.

Every value above is a boolean, a small integer or a *name*. The code and the
message bodies are compared inside the capture harness and never reach a
Playwright matcher, so a failing expectation prints a field name and never an
OTP. No code appears in this report, in a filename, or in any attachment.

---

## I. Retry / idempotency

Discharged by `B01`'s suites, run rather than rebuilt (113 tests, all passing),
plus one browser-level check added here:

```text
successful SMTP send                     delivers one claimed job and satisfies its intent
one intent -> one message                asserted at the listener, both suites
completed replay -> no duplicate         sends nothing a second time when SATISFIED
                                         + E01: a second worker drain delivers nothing
temporary SMTP failure -> retry          stops at the policy budget, on the policy schedule
permanent refusal -> no endless retry    does not retry a non-retryable transport refusal
auth/config failure classified safely    SMTP_AUTH_REJECTED, retryable=false
failed send not marked delivered         dead-letters instead of satisfying
```

No backend work was added for this section; it was already correct.

---

## J. PHONE / SMS negative proof

```text
Storefront   no PHONE/SMS selector, wording or action, at 390 and 1440
Contract     the generated contactKind enum has one member, EMAIL
Domain       non-email issuance refused (B01)
Transport    "Refusing a SMS delivery: customer notification is email only."
Design       no approved row draws a chooser any more (§D)
```

No SMS dependency or provider exists in the repository. A phone number remains a
first-class delivery/contact value and `Số điện thoại người nhận` is asserted
present on the same page as the email-only verification card.

---

## K. Security / logging

```text
OTP absent from normal logs              B01: "writes the secret to no log line,
                                         on success or on failure"
SMTP password absent from logs/errors    B01: "never puts the password in a
                                         validation error"
full email body absent from normal logs  only a masked recipient is logged
recipient masked                         observed live: "Delivered EMAIL to k***@vidu.test"
raw provider error not exposed           E01: the rendered page contains none of
                                         SMTP / nodemailer / ECONN / 535 / 5.7.
                                         nor the run's SMTP password
real SMTP credentials not committed      none exist; the run generates a credential
                                         pair in memory, never logged or persisted
```

Nothing was read from `.env`; no secret-bearing variable was requested or used.
`.env` was not written.

---

## L. Production / staging readiness

`B01`'s fail-closed rules, verified:

```text
NOTIFICATION_TRANSPORT required     "refuses an unset transport rather than defaulting"
unknown transport refused           "must be one of"
SMTP config required in prod/staging "requires the SMTP block in %s"
RECORDING refused in prod/staging   "refuses RECORDING in %s" → "delivers to nobody"
SMTP_REQUIRE_TLS=false refused      "SMTP_REQUIRE_TLS=false is refused"
missing config fails closed         every field required, naming the variable
```

Committed files carry placeholders only.

**Environment variables the operator needs for the manual real-inbox test** —
names only, no values:

```text
NOTIFICATION_TRANSPORT=SMTP
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_REQUIRE_TLS        must not be false outside local capture
SMTP_USERNAME
SMTP_PASSWORD
EMAIL_FROM_ADDRESS
EMAIL_FROM_NAME
STOREFRONT_PUBLIC_ORIGIN
```

---

## M. 390 acceptance

```text
email-only card renders, one text input                  PASS
full request → SMTP → captured code → verified journey   PASS
"Email đã được xác minh"                                 PASS
one intent → exactly one message, and none to anyone else PASS
a second worker drain delivers nothing                   PASS
no SMTP/provider detail rendered                         PASS
```

## N. 1440 smoke

Bounded, as §7 directs — the journey and the absence proofs, nothing else:

```text
no radio / combobox / input[type=tel] on the card        PASS
full journey to verified                                 PASS
forbidden channel wording absent from the verified page  PASS
```

1024 was not exercised. No full V02/H08 matrix was re-run.

---

## O. Accessibility

No UI source changed in this package, so `S01`'s four axe scans remain the
current evidence and were re-run green as part of its suite (8/8):

```text
n01s1-contact-entry-390    serious/critical 0
n01s1-code-entry-390       serious/critical 0
n01s1-contact-entry-1440   serious/critical 0
n01s1-code-entry-1440      serious/critical 0
```

`color-contrast` remains disabled for the reason `PO-APP12-004` assigned: the
failing values are three *locked* shared tokens owned by `APP12-V02`. No other
rule is disabled. The new Figma annotation records the accessibility intent the
frames encode (labelled field, `aria-describedby`/`aria-invalid` error binding,
`one-time-code`, non-colour-only verified state, real `disabled`, ≥44px targets).

---

## P. Defensive-error follow-up

`FU-APP12-N01-S01-01` — the internal `VERIFICATION_CHANNEL_UNSUPPORTED`
classification is not surfaced as the business envelope code — was **not**
actioned here, as §5 directs. No backend work was added for an unreachable
defensive branch. Routed:

```text
NONBLOCKING_DEFENSIVE_ERROR_ENVELOPE_DEBT   → before R01 if still relevant
```

`FU-APP12-N01-S01-02` (the stale chooser design authority) is **closed** by §D.

---

## Q. Independent U01 blockers

Untouched and still open. No Admin, Product, SKU or readiness surface was
modified:

```text
FU-APP12-U01-VARIANT-AUTHORING       open
FU-APP12-U01-READINESS-FALSE-CLAIM   open
FU-APP12-U01-LOW-STOCK-AUTHORITY     open

APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
```

`U01` must not resume automatically, even after a manual real-inbox PASS.

---

## R. Files changed

```text
M  docs/design/FIGMA_DESIGN_INDEX.md                 +14 rows, 7 superseded, §4.13
M  packages/e2e-testing/support/app12/
     n01s1-smtp-capture.mjs                          MIME reader + contentProof
M  packages/e2e-testing/specs/app12/support/
     n01s1-world.ts                                  EMAIL expectations, contentProof,
                                                     smtpPassword
A  packages/e2e-testing/specs/app12/
     n01e1-verification.acceptance.spec.ts           the E01 suite (6 cases)
M  packages/e2e-testing/scripts/run-e2e.mjs          --app12-n01e1 mode
M  packages/e2e-testing/playwright.config.ts         app12-n01e1-chromium project
M  packages/e2e-testing/package.json                 e2e:app12:n01e1[:headed]
```

Figma: 14 nodes created under one new section; **0 existing nodes modified**.

---

## S. File size

```text
n01e1-verification.acceptance.spec.ts      281   OK
n01s1-world.ts                             339   REVIEW (source threshold 300)
n01s1-smtp-capture.mjs                     358   REVIEW (source threshold 300)
playwright.config.ts                       563   FAIL — 555 at HEAD (+8)
run-e2e.mjs                               1258   FAIL — 1249 at HEAD (+9)
```

**The two FAILs are inherited, not introduced** — both were already far over the
400-line hard limit before this package, verified against `HEAD` rather than
assumed. This package added 8 and 9 lines to them. They are registry-shaped files
(a Playwright project list and a mode dispatcher) that every e2e mode has
appended to since APP1; splitting them is a real refactor and §15/§16 forbid
unrelated change here. Raised as `FU-APP12-N01-E01-01`.

---

## T. Validation

Change-impact only. Every command below was run; nothing is claimed unrun.

```text
git diff --check                                              clean
node tools/check-figma-design-index.mjs                       PASS 592 IDs / 592 rows / 27 tables
Figma live read-back (14 nodes)                               all resolve, 0 chooser, 0 phone wording
Figma historical read-back (9 nodes)                          all intact and unmodified
pnpm --filter @embroidery/e2e-testing typecheck               PASS
pnpm --filter @embroidery/e2e-testing lint                    PASS
pnpm --filter @embroidery/worker test (notification-delivery) 10 suites, 113 PASS
pnpm --filter @embroidery/storefront test (verification|checkout) 5 suites, 123 PASS
pnpm --filter @embroidery/api test (verification)             15 suites PASS, 1 PRE-EXISTING FAIL
node tools/check-i18n-static-text.mjs                         OK (0 exemptions)
node tools/check-i18n-message-keys.mjs                        OK
node tools/check-e2e-boundaries.mjs                           clean (4706 built files)
pnpm --filter @embroidery/api openapi:check                   artifact up to date
pnpm --filter @embroidery/api-client check:generated          up to date
node scripts/run-e2e.mjs --app12-n01e1                        6/6 PASS
node scripts/run-e2e.mjs --app12-n01s1  (regression)          8/8 PASS
node tools/check-file-size.mjs --paths <touched>              2 inherited FAILs (§S)
pnpm format:check                                             3 pre-existing files, none touched here
prettier --write <changed files>                              applied
```

`U01` was not run. `APP12-E01` was not run. No repository-wide aggregate command
was used.

### The pre-existing API failure, checked rather than assumed

`test/integration/ready-made-verification-race.integration.spec.ts` fails 8 cases.
It is `APP12-B05`'s Ready-Made order/payment race suite and matched the
`verification` pattern only because of its filename. It was re-run **at stashed
HEAD** and fails identically there. This package changed no file under `apps/` or
`packages/persistence`.

### Two harness defects this run exposed

Both are this package's own, both would have produced a wrong verdict, and both
were fixed before any claim rested on them.

**1. A MIME reader that failed on every folded header — a false red.** The first
`contentProof` reported `subject`, `textPartExists` and `htmlPartExists` all
false against a perfectly correct message. Its `headerOf` used a lookahead with
`|$` under the `/m` flag, so `$` matched the end of the *first* line and the
folded continuation was never read — `Subject` truncated mid-word and
`Content-Type` returned without its `boundary=`, which left the whole message
unparseable while each individual regex looked right. A second bug sat behind it:
a Vietnamese subject exceeds the 76-byte encoded-word limit and arrives as two
adjacent RFC 2047 words, whose separating whitespace must not survive decoding —
keeping it yields `"Nét T hêu"`. Both were found by reproducing the failure
against a **synthetic** message built with the worker's own nodemailer (fixture
digits, not an OTP), never by printing a real one. The block now unfolds before
matching and joins adjacent encoded-words.

**2. An expiry check measured across two clocks — very nearly a false red about
the product.** The check computed the challenge window as `expiresAt - Date.now()`
using the *test process* clock. The API runs in a container whose clock sits
seconds ahead of the Windows host, so a true ten-minute window read as eleven and
the suite reported that a correct message stated the wrong expiry. Left alone it
would have become a headline finding about the renderer. The check now takes both
timestamps from the same HTTP response — `expiresAt` from the body, the issuing
instant from the `Date` header — and never consults the host clock. Because that
header has one-second granularity, the comparison allows one minute of tolerance;
it still fails a 5-minute claim on a 10-minute challenge, a hardcoded string, or
a renderer using a constant of its own, which is what §8 asks.

---

## U. Hygiene

```text
shared_dev_mutations        0      every run used a disposable database, dropped
                                   by the orchestrator ("cleanup verified: all E2E
                                   ports closed, disposable database dropped")
G03_data_created            false  no catalog, product, SKU or media authored
orders created              0      the journey stops at verification
SMTP listener teardown      closed in afterAll; loopback, ephemeral port
credentials                 none read from .env; the SMTP credential is generated
                            per run in memory and never logged or persisted
.env written                never
report secrets              no code, address, token or credential appears here
production deployed         false
pushed                      false
```

Synthetic addresses (`app12-n01s1-N@vidu.test`) reach a listener that forwards
nowhere; `.test` is reserved by RFC 6761 and cannot resolve.

---

## V. Baseline

Unchanged, and measured rather than assumed:

```text
OpenAPI paths        127    ✓
OpenAPI operations   140    ✓
OpenAPI schemas      279    ✓
public operations     49    ✓
migrations            39    ✓  (no 0040)
Admin routes          26    ✓
Storefront routes     20    ✓
```

No new HTTP path, operation or route. Registry rows moved from 578 to 592, which
is the §4 change and the only intended one.

---

## W. Manual real-inbox checklist — Product Owner

Local SMTP capture is green. That is **not** proof that mail reaches a person.

```text
1  configure a real SMTP account/provider (see §L for the variable names)
2  run the normal app stack with NOTIFICATION_TRANSPORT=SMTP
3  enter a real email address in the verification card
4  request an OTP
5  receive exactly one Nét Thêu verification email in the real inbox
6  verify sender, subject and content
7  enter the received OTP
8  verification succeeds
9  test resend once; it reaches the same inbox
10 confirm no phone/SMS verification path exists anywhere
```

No real order or payment is required. Do not paste SMTP secrets into this
repository or into a chat; the operator configures them and runs the test.

**This report does not and may not mark `REAL_INBOX_MANUAL` as PASS.** Local
capture servers — this one, Mailpit, MailHog, a recording adapter, a test-mailbox
API — are automated boundary evidence only and may never substitute for the
Product Owner's real-inbox acceptance.

---

## X. N01 status

```text
APP12-N01.B01   COMPLETE — PO PASS            (not reopened)
APP12-N01.S01   COMPLETE — PO PASS            (not reopened; re-proved 8/8)
APP12-N01.E01   AUTOMATED_ACCEPTANCE_COMPLETE (this package)

APP12-N01       AWAITING_MANUAL_REAL_INBOX
REAL_INBOX_MANUAL = REQUIRED
```

`APP12-N01` is **not** closed and is not this package's to close.

### Follow-ups raised

```text
FU-APP12-N01-E01-01   packages/e2e-testing/scripts/run-e2e.mjs (1258) and
                      playwright.config.ts (563) are far over the 400-line hard
                      limit and have been since long before this package. Both are
                      append-only registries every e2e mode extends. They need a
                      per-phase mode/project split, which is a refactor of its own.
```

```text
APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED
```
