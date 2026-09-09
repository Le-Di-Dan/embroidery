# APP12-N01.S01 — Storefront Email-Only Customer Verification UX — Completion Report

```text
APP12-N01.S01             = COMPLETE
APP12-N01                 = IMPLEMENTATION_IN_PROGRESS

SMTP_UI_INTEGRATION       = PASS
REAL_INBOX_MANUAL         = NOT_EXECUTED

INTERNAL_NEXT             = N01.E01
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

`APP12-N01.S01` is **COMPLETE**.

The Storefront no longer offers a verification channel the product does not
have. Before this package the contact card rendered an `EMAIL` / `PHONE` radio
group, a phone field with its own copy, and a transport seam carrying a cast so
a `PHONE` literal could still reach the wire and be refused with
`422 VERIFICATION_CHANNEL_UNSUPPORTED`. All of that is gone — not disabled, not
hidden — and the flow's *type* no longer admits a second channel.

Three things are worth separating, because only the third is new evidence:

1. **The affordance is removed at the model, not the view.** `contactKind` left
   the reducer, the state, the action set, the client seam and the card's props.
   A phone verification request is not something the Storefront refuses; it is
   something it cannot express.
2. **The copy now says which thing is verified, and stops over-claiming.** The
   settled state reads *"Email đã được xác minh"*, and the code-entry card says
   the request was **accepted** rather than that a message has arrived — which
   is all the contract supports at that moment.
3. **The journey was proved against a real SMTP boundary.** The acceptance run
   composes the worker with `NOTIFICATION_TRANSPORT=SMTP` aimed at a loopback
   capture listener, and the code the browser types is parsed out of the
   captured message. Every verification run before this one read the code out of
   the worker's recording adapter — an array in the test process — which is
   exactly what §18 forbids and exactly what `APP12-U01` blocked on.

It is **not** proof that mail reaches a human inbox. §N states that limit
precisely; `REAL_INBOX_MANUAL` remains `NOT_EXECUTED` and no real inbox
credential was requested or used.

---

## B. B01 PO reconciliation

`APP12-N01.B01` was not reopened. No API source, no worker source, no schema and
no contract artifact changed in this package:

```text
apps/api/**            0 files changed
apps/worker/src/**     0 files changed
packages/contracts/**  0 files changed
packages/api-client/** 0 files changed
migrations             0 added
```

B01's authority was consumed, not re-decided:

- `IssueVerificationChallengeBodyContactKind` — the generated enum, now a single
  member — is read directly by the transport seam, so the wire value is the
  contract's own and not a typed literal.
- `VERIFICATION_CHANNEL_UNSUPPORTED` is mapped defensively (§I), not re-defined.
- The `RECORDING`-refused-in-a-delivering-environment rule is honoured by the
  acceptance harness rather than worked around: the capture run states `SMTP`,
  and the existing harness modes now state `RECORDING` (§S, harness defect 2).

---

## C. Storefront verification preflight

Everything §4 asked to be inspected before editing, and what was found:

```text
contact draft/state      contact-draft.ts  — ContactKind union, PHONE_SHAPE,
                         CONTACT_KIND_VALUES with B01's interim PHONE literal
verification client      verification.client.ts — the §22 compatibility cast
email/phone selector     contact-entry-card.tsx — a <fieldset> radio group
verification card/form   one card serving 4 approved frames
masking                  server-produced, rendered as received (unchanged)
OTP input                code-input.tsx — autocomplete="one-time-code" already
resend cooldown          driven by the server's resendAvailableAt (unchanged)
verified state           checkout: "Đã xác minh"; route: "Đã xác minh liên hệ"
checkout gating          use-verified-contact.ts binds {challengeId, contactKind, contact}
error mapping            verification-outcome.ts — by HTTP status only
Vietnamese i18n          checkout.json → verification.{contactKind,phoneField,…}
generated B01 contract   contactKind enum already narrowed to EMAIL
```

**Every path that could still reach `contactKind=PHONE`**, found and closed:

| # | Path | Closure |
|---|------|---------|
| 1 | The radio group in `ContactEntryCard` | control removed |
| 2 | `setContactKind` on the controller | removed from the hook's interface |
| 3 | `CONTACT_KIND_CHANGED` in the reducer | action removed |
| 4 | `CONTACT_KIND_VALUES.PHONE` literal | file rewritten; no literal remains |
| 5 | The cast in `issueVerificationChallenge` | parameter removed entirely |
| 6 | `CONTACT_FIELD_COPY.PHONE` lookup | catalog removed |
| 7 | Seven mount sites passing `contactKind` | all updated (§Q) |

There was never an eighth: the resend and attempt operations take no body field
naming a channel.

---

## D. Email-only authority

```text
CUSTOMER_OTP_CHANNEL = EMAIL_ONLY
```

Held at four layers, weakest to strongest:

```text
copy      no sentence offers, names or implies a second channel
view      no control exists that could select one
model     no field exists that could hold one
type      the parameter that carried one no longer exists
```

The type layer is the one that matters: `issueVerificationChallenge(contact,
purpose)` has no channel parameter, and the kind it sends is read from a
generated enum with one member. Restoring a phone branch is not an edit to a
condition — it is a change to the published contract.

---

## E. Delivery-phone separation

A phone number remains a first-class product value, and nothing here touched it:

```text
readyMade.delivery.recipientPhoneLabel   "Số điện thoại người nhận"   kept
delivery form phone field                                              kept
store-presentation contact details                                     kept
```

`PHONE_SHAPE` and the phone half of `isPlausibleContact` were removed from the
**verification** feature only. They validated a verification target; the
delivery form has never used them and does not now.

The acceptance asserts both halves in the same test: the verification card has
exactly one text input and no `input[type="tel"]`, while
`Số điện thoại người nhận` is visible on the same page (§N).

---

## F. Verification UI

`ContactEntryCard` after the change: a title, a body, an optional alert, one
labelled email field with its help or its error, a submit and a caption.

Removed: the `<fieldset>`, its visually-hidden `<legend>`, both radio inputs and
their labels, the `--active` pill styling, and the `contactKind`-driven
`type`/`inputMode`/`autoComplete` ternaries — now the constants they could only
ever resolve to.

**A deliberate departure from the approved design, recorded rather than
silent.** `APP4-D01` frames `623:11`–`623:14` draw the two-tab chooser. Those
frames predate the locked channel decision, and `CLAUDE.md` §2 puts product
authority above the design package, so `APP12-N01`'s `CUSTOMER_OTP_CHANNEL =
EMAIL_ONLY` governs. Raised as `FU-APP12-N01-S01-02` for the registry to catch
up; no Figma node was modified by this package.

The chooser was removed rather than hidden on purpose: a hidden radio is still a
control, still reachable in some assistive-technology modes, and still a `name`
a native form submission could write into a URL — which is not hypothetical
here, see §S.

---

## G. Request / resend

```text
request   one email field → one POST → EMAIL, always
resend    the resend operation on the open challenge id
```

Resend is unchanged in mechanism and now unambiguous in kind: it takes no body,
so there is no field through which a channel could be named, and the cooldown is
still the server's `resendAvailableAt` — no duration constant exists anywhere in
the feature. The acceptance asserts the resend control is present, correctly
`disabled` during cooldown, and that the code-entry card carries no channel
affordance (§N).

---

## H. OTP and verified state

Preserved exactly: six-digit format, the server's TTL, the attempt limit,
single-use, wrong-code handling, expired-code handling, the mismatch focus
return, and the field clearing on every challenge replacement. The code still
lives only in the input's state and the controller's ref.

`autocomplete="one-time-code"` was already correct and is now asserted in the
browser rather than assumed.

The success state changed, and this is §10:

```text
before   "Đã xác minh liên hệ"        which contact? the screen does not say
after    "Email đã được xác minh"
```

The checkout's settled affordance changed the same way (`"Đã xác minh"` →
`"Email đã được xác minh"`), as did APP5's step-2 line.

---

## I. Error mapping

| Condition | Renders |
|---|---|
| wrong code | mismatch alert, field cleared, focus returned |
| expired code | the expired outcome card |
| attempt limit | the locked outcome card |
| resend cooldown / rate limit | the rate-limited alert on the contact card |
| `VERIFICATION_CHANNEL_UNSUPPORTED` | the email-only alert (new) |
| notification/transport failure | the recoverable-error card |
| anything else | the recoverable-error card |

No raw backend or provider text reaches a screen. The mapper reads
`httpStatus` and — for exactly one classification — `code`; it never reads
`message`, which is prose the server may reword. Asserted directly: after a
refusal the page contains none of `VERIFICATION_CHANNEL_UNSUPPORTED`, the
server's sentence, `SMTP`, `422` or the request id.

**Two honest limits on the channel-unsupported branch, stated rather than
implied.** It is unreachable from this UI by construction — no control can name
a non-email channel and the request type admits one member. It is also currently
unreachable *by code*: `verificationChannelUnsupported()` raises the classified
failure internally, but the API publishes the envelope with the status-derived
default, so today a real refusal would arrive as a bare 422 and render as the
invalid-contact state. Making the envelope carry the business code is a backend
change this package is not authorized to make — `FU-APP12-N01-S01-01`.

The branch is kept because the alternative is worse: if the code ever is
published, an unmapped refusal tells a customer their address is malformed when
the truth is that codes go to email.

---

## J. Stale PHONE state

§14 asked for stale `PHONE` draft state to be invalidated before a request. It
is closed one level deeper than that: **no such state can exist.**

```text
persistence   the reducer is in-memory; nothing writes it to localStorage,
              sessionStorage, a cookie or the URL, so it cannot survive a reload
shape         after S01 there is no field in which a PHONE draft could be
              expressed, so nothing could be restored into one either
```

Verified rather than assumed: no `localStorage` / `sessionStorage` /
`document.cookie` access exists anywhere in the verification or checkout
features, and the checkout boundary test already forbids adding one.

No detect-and-reset code was written, because code that can never run is not a
safeguard — it is a claim that the state is reachable.

---

## K. i18n

Every changed sentence lives in `packages/i18n/messages/vi/`. No Vietnamese
literal was introduced into any `.ts`/`.tsx` file.

Added:

```text
checkout.verification.codeEntry.inboxHint
checkout.verification.alerts.channelUnsupported.{title,body}
```

Removed (no legitimate delivery/contact use — both described the verification
chooser and its second field):

```text
checkout.verification.contactKind.{legend,EMAIL,PHONE}
checkout.verification.phoneField.{label,placeholder,help,invalid}
```

Reworded:

```text
contactEntry.title      "Xác minh liên hệ của bạn"  → "Xác minh email của bạn"
contactEntry.body       named both channels          → email only
contactEntry.submit     "Gửi mã xác minh"            → "Gửi mã"
codeEntry.body          "Chúng tôi đã gửi…"          → "Yêu cầu … đã được tiếp nhận…"
alerts.mismatch         "tin nhắn mới nhất"          → "email mới nhất"
alerts.resent.body      "tin nhắn mới nhất"          → "email mới nhất"
alerts.rateLimited.body "cho liên hệ này"            → "tới email này"
alerts.success.body     "Liên hệ của bạn…"           → "Email của bạn…"
outcome.SUCCESS.title   "Đã xác minh liên hệ"        → "Email đã được xác minh"
successCaption          "liên hệ này"                → "email này"
pageTitle               "Xác minh liên hệ"           → "Xác minh email"
readyMade.contact.*     verified/change/changeNotice → email-specific
custom.…verification.verified  "Đã xác minh liên hệ" → "Đã xác minh email"
```

`pageTitle` and `contactEntry.title` are deliberately different strings. Making
both "Xác minh email" put the same text in the route's `h1` and the card's `h2`,
which broke an existing test by ambiguity and would have read as a stutter on
screen. The original relationship — short page title, possessive card title — is
preserved.

**§6's truthfulness requirement.** `codeEntry.body` no longer claims a message
has been sent. The issue call returns when the API has accepted the request and
raised the notification intent; delivery is the worker's, over SMTP, afterwards.
The copy states the acceptance and asks the customer to check their inbox, with
a spam-folder hint beneath the masked destination.

Gates: `check-i18n-static-text` OK (0 exemptions), `check-i18n-message-keys` OK
(every key read, no orphan sentence), `@embroidery/i18n` 28/28.

---

## L. 390 (primary)

Live, in Chromium, at 390×844:

```text
checkout verification card renders, email-only          PASS
one text input, no radio/combobox/tel input             PASS
full request → SMTP → code → verified journey           PASS
"Email đã được xác minh" settled state                  PASS
horizontal overflow                                     0 px
contact-entry axe serious/critical                      0
code-entry axe serious/critical                         0
```

The standalone route `/xac-minh-lien-he` was driven at 390 as well, through both
cards.

---

## M. 1440 (bounded smoke)

The same journey and the same absence proofs at 1440×900:

```text
full journey to verified                                PASS
no channel affordance on the checkout card              PASS
no channel affordance on the verification route         PASS
exactly one input[type="email"], zero input[type="tel"] PASS
horizontal overflow                                     0 px
axe serious/critical (both cards)                       0
```

No full V02/H08 matrix was re-run; 1024 was not exercised, as §17 directs.

---

## N. SMTP-capture browser journey

**Topology.** `APP12-S02`'s exactly — a real Storefront, a real API, the real
`APP4` lane, the in-process worker with its poll loop held closed, this run's
disposable database — with one change inside the Playwright process: the worker
is composed with `NOTIFICATION_TRANSPORT=SMTP` pointed at a loopback capture
listener the spec owns. Nothing in the orchestrated topology differs, which is
why the new mode rides the S02 flags rather than duplicating twelve conditions.

**The listener** binds `127.0.0.1` on an ephemeral port, requires AUTH with a
per-run credential generated in memory, forwards nowhere, and dies with the run.
`smtp-server` is resolved from `apps/worker`, which owns the SMTP boundary; no
dependency was added to the harness.

**The required journey**, all ten steps:

```text
1  open Ready-Made checkout verification                       PASS
2  EMAIL is the only verification method                       PASS
3  no PHONE/SMS verification affordance exists                 PASS
4  enter a synthetic address (app12-n01s1-N@vidu.test)         PASS
5  request the OTP                                             PASS
6  exactly one SMTP message accepted for that address          PASS
7  obtain the OTP from the capture listener                    PASS
8  enter it in the real browser                                PASS
9  verification succeeds                                       PASS
10 the UI reports the EMAIL verified                           PASS
```

**Captured message, safe facts only** (identical at both viewports):

```text
recipients   1
sender       no-reply@vidu.test
bytes        2702
subject      present
text part    present
html part    present
code         present
```

**The code came from the message, and this is proved rather than asserted.** One
case navigates, requests, and checks that the listener holds **zero** messages
before the worker runs and **one** after — then types the code parsed out of
that message and reaches the success state. The plaintext passes through one
function into one field: it is never logged, never attached, never in `proofs`,
and never given to a matcher that would print its operand.

**The guard that makes all of this mean something.** The suite's first case
reads the class name of the adapter the worker's DI container actually resolved
and requires `SmtpNotificationChannelAdapter`. That guard exists because an
environment-only check was written first and passed in exactly the situation it
was meant to catch — see §S, harness defect 1.

```text
SMTP_UI_INTEGRATION = PASS
REAL_INBOX_MANUAL   = NOT_EXECUTED
```

**What this is not.** The listener is not a mail server and relays nothing. No
message left the machine, no real inbox was involved, and no real inbox
credential was requested, read or configured. The manual real-inbox test remains
un-executed and is not this package's.

The run created no order, no payment and no `G03` data; nothing was written
outside the disposable database, which the orchestrator dropped
(`cleanup verified: all E2E ports closed, disposable database dropped`).

---

## O. PHONE-option absence proof

Mechanical, at three levels, and each fails the moment an affordance returns.

**Component (jsdom, `contact-verification.test.tsx`):**

```text
queryAllByRole('radio')      0
queryAllByRole('checkbox')   0
queryAllByRole('combobox')   0
queryAllByRole('group')      0
getAllByRole('textbox')      1
field type/inputmode/autocomplete   email / email / email
page text contains  "điện thoại" | "SMS" | "tin nhắn" | "Zalo"   none
typing a phone number → refused client-side, issueMock not called
```

**Browser (both viewports, three screens — checkout card, contact-entry route,
code-entry card):**

```text
role=radio       0
role=combobox    0
input[type=tel]  0
forbidden wording ("SMS", "tin nhắn", "Zalo", "Nhận mã qua điện thoại",
                   "Xác minh qua số điện thoại", "Gửi mã SMS")   none
input[type=email] on the verification route                      1
```

The 1440 route scan is scoped to the verification section rather than the whole
page, deliberately: the store-presentation footer legitimately carries the
workshop's own telephone number, and a shop's phone number is not a verification
affordance.

**Harness:** the `APP4-E01-H02` smoke, which used to prove the chooser worked,
now proves it is absent — so a reinstated chooser fails helper readiness before
it ever reaches a journey.

Domain and API refusal is B01's and was not re-run; nothing in this package
touched the contract.

---

## P. Accessibility

```text
email input labelled                 <label for> → the field's useId
OTP input labelled                   unchanged; autocomplete="one-time-code"
request/resend disabled state        the `disabled` attribute, not styling
error text associated                aria-describedby switches help→error,
                                     aria-invalid on the field, role="alert"
verified state not colour-only       "Email đã được xác minh" as text, the ✓
                                     glyph aria-hidden beside it, role="status"
focus behaviour                      mismatch clears and refocuses the field
orphaned labels after removal        none — the removed <legend> went with its
                                     <fieldset>, and the field's own <label> is
                                     now the only labelling relationship
```

axe (WCAG 2.2 AA tags, gated on serious + critical), four scans:

```text
n01s1-contact-entry-390    0
n01s1-code-entry-390       0
n01s1-contact-entry-1440   0
n01s1-code-entry-1440      0
```

`color-contrast` is disabled for the reason `APP12-H08` recorded and
`PO-APP12-004` assigned: the failing values are three *locked* shared tokens
owned by `APP12-V02`. No other rule was disabled, and none was disabled to make
a page green.

---

## Q. Files changed

Storefront — the feature:

```text
model/contact-draft.ts          ContactKind, PHONE_SHAPE, CONTACT_KIND_VALUES
                                removed; isPlausibleEmail is what remains
model/verification-state.ts     contactKind + CONTACT_KIND_CHANGED removed;
                                CHANNEL_UNSUPPORTED status/action/UI state added
model/verification-outcome.ts   the VERIFICATION_CHANNEL_UNSUPPORTED branch,
                                on issue and on resend
model/verification-copy.ts      contactKind + phoneField catalogs removed;
                                inboxHint + channelUnsupported added;
                                CONTACT_FIELD_COPY removed
api/verification.client.ts      the §22 compatibility cast removed with the
                                parameter it existed for
hooks/use-contact-verification.ts   setContactKind removed; EMAIL-only issue;
                                the two new dispatch branches
ui/contact-entry-card.tsx       the chooser removed; `alert` prop replaces
                                `rateLimited`; contactEntryAlertOf added
ui/code-entry-card.tsx          the inbox hint
ui/contact-verification-screen.tsx  props updated
styles/contact-verification.scss    __tabs / __tab rules removed (dead)
index.ts                        contactEntryAlertOf exported
```

Storefront — the seven other mount sites:

```text
custom-request/ui/verification-step.tsx
ready-made-checkout/ui/checkout-contact-card.tsx
ready-made-checkout/hooks/use-verified-contact.ts   contactKind left the binding
secure-deposit-payment/ui/deposit-step-up-dialog.tsx
secure-design-review/ui/review-step-up-dialog.tsx
secure-final-payment/ui/final-payment-step-up-dialog.tsx
secure-quotation/ui/quote-step-up-dialog.tsx
secure-ready-made-order/ui/order-step-up-dialog.tsx
```

Copy:

```text
packages/i18n/messages/vi/checkout.json
packages/i18n/messages/vi/custom.json
```

Tests — Storefront:

```text
test/components/contact-verification.test.tsx   PHONE cases replaced by the
                                                five email-only-proof cases
test/components/ready-made-checkout.test.tsx    copy; the named-control
                                                assertion strengthened (§S)
test/boundary/ready-made-checkout-source.test.ts   binding assertion updated
test/support/verification-fixture.ts            apiCodedFailure added
```

E2E — new:

```text
packages/e2e-testing/support/app12/n01s1-smtp-capture.mjs          204
packages/e2e-testing/specs/app12/support/n01s1-world.ts            292
packages/e2e-testing/specs/app12/n01s1-verification.acceptance.spec.ts  256
```

E2E — changed:

```text
scripts/run-e2e.mjs                    --app12-n01s1 mode; the Storefront
                                       configuration fix (§S)
playwright.config.ts                   app12-n01s1-chromium
package.json                           e2e:app12:n01s1[:headed]
support/app4/app4-runtime.mjs          states RECORDING (§S)
specs/app4/support/s01-verification-driver.ts   email-only driver
specs/app4/h02-helpers.smoke.spec.ts   proves absence; h1 assertion tightened
specs/app5/support/s01-request-driver.ts, specs/app12/support/{s02,a02}-world.ts,
specs/app12/{s02-checkout,s02-prehydration,s03-journeys,s03-lifecycle,
h01-secure-security}, specs/app4/e01-r01{,-c1}, specs/app5/e01,
specs/app7/e01-order-payment          call sites and copy
```

43 files changed, 559 insertions, 410 deletions. No API, worker, contract,
generated-client or migration file.

---

## R. File size

`node tools/check-file-size.mjs --paths <25 touched files>` — **passed**, 1
above the review threshold and none over a hard limit:

```text
REVIEW  contact-verification.scss   381   (source review threshold 300)
```

That stylesheet was **413 lines and over the 400-line hard limit at entry HEAD**.
Removing the dead `__tabs` / `__tab` rules — dead because this package removed
the markup that used them — brought it to 381, so the file is now compliant
rather than carrying inherited debt. Every other touched file is under both
thresholds; the three new E2E files are 204 / 292 / 256.

`ready-made-checkout.test.tsx` (544) remains above the 500 test review threshold
as it was before this package.

---

## S. Validation

Change-impact only. Every command below was run; nothing is claimed unrun.

```text
git diff --check                                              clean
pnpm --filter @embroidery/storefront typecheck                PASS
pnpm --filter @embroidery/storefront lint                     PASS
pnpm --filter @embroidery/storefront test                     134 suites, 2552 PASS
pnpm --filter @embroidery/e2e-testing typecheck               PASS
pnpm --filter @embroidery/e2e-testing lint                    PASS
pnpm --filter @embroidery/i18n test                           28 PASS
node tools/check-i18n-static-text.mjs                         OK (0 exemptions)
node tools/check-i18n-message-keys.mjs                        OK
pnpm --filter @embroidery/api openapi:check                   artifact up to date
pnpm --filter @embroidery/api-client check:generated          up to date
node tools/check-storefront-route-authority.mjs               PASS
node tools/check-styling-boundaries.mjs                        31 pre-existing,
                                                               none in touched files
node tools/check-file-size.mjs --paths <touched>              PASS
node tools/check-e2e-boundaries.mjs                            clean
prettier --write <changed files>                               applied
node scripts/run-e2e.mjs --app12-n01s1                         8/8 PASS
node scripts/run-e2e.mjs --app12-s02   (regression)            23/23 PASS
node scripts/run-e2e.mjs --app4-browser (regression)           4/4 PASS
```

`check-styling-boundaries` reports the same 31 violations at HEAD and after —
all in `secure-ready-made-order` token files this package never touched. It was
compared against a stashed HEAD rather than assumed.

`U01` was not run. `APP12-E01` was not run. No repository-wide aggregate command
was used.

### Three harness defects this run exposed

None is a regression from this package; all three were latent and only a live
run could show them.

**1. The first guard passed in the situation it existed to catch.** The initial
`smtpTransportIsLive()` read `process.env`. Two consecutive runs reported a live
SMTP transport while the environment was irrelevant: the first served a
Storefront build that predated the checkpoint, the second ran an `apps/worker`
`dist` that predated `N01.B01` entirely — a build in which
`notification-channel.factory` did not exist and the module bound the recording
adapter unconditionally, ignoring the variable. The guard now reads the class
name of the adapter the DI container actually resolved. **Both applications must
be rebuilt before this suite means anything**, and the guard now says so by
failing.

**2. `N01.B01` broke every existing E2E mode that boots the worker context, and
a stale `dist` hid it.** Making the transport a stated decision means
`notificationChannelProvider` throws at composition when `NOTIFICATION_TRANSPORT`
is unset — which is correct for a deployment and fatal for the harness. The
moment the worker was rebuilt, `--app12-s02` failed at `bootWorkerContext` with
`NOTIFICATION_TRANSPORT is not set`, and `--app4-browser`, `--app12-s03`,
`--app12-a02`, `--app12-h01`, `--app12-h08`, `--app12-v01`, `--app5-e01` and
`--app7-e01` would have failed identically. Fixed where it belongs, in the
harness rather than the product: `app4-runtime.mjs` now states `RECORDING` —
the honest answer for modes that read deliveries out of the recording adapter —
as a default, so `N01.S01`'s own run still wins with `SMTP`.

**3. The APP4/APP5/APP7 browser tiers never configured their Storefront
process.** They predate `STOREFRONT_PUBLIC_ORIGIN` becoming required
(`IMP-D050`), so their Storefront started without it and rendered
*"This page couldn't load — a server error occurred"*. The `APP4-E01-H02` smoke
had been failing on exactly that, on `/xac-minh-lien-he`, **at HEAD** — verified
by stashing this package's changes and reproducing it with the old copy. The
mode now receives `INTERNAL_API_BASE_URL` and `STOREFRONT_PUBLIC_ORIGIN`, and
deliberately **not** the Wave-2 release flag, because APP5/APP7 drive
custom-request journeys that need the Storefront's own default. With the page
rendering completely, the smoke's loose `getByRole('heading')` then matched five
headings; it now asserts the page's `h1`, which is what it always meant.

`--app4-browser` went from 2 failed / 2 passed at HEAD to 4/4.

### One test that was passing vacuously

`ready-made-checkout.test.tsx`'s pre-hydration case asserted that every named
control on the page was a radio whose name ended in `-kind`. Removing the
chooser removed the last named control, so the assertion became vacuously true
over an empty array. It now asserts the array **is** empty — a stronger fact,
and a better one: a pre-hydration native GET could previously have written
`…-kind=EMAIL` into the query, and now could write nothing at all.

---

## T. Hygiene

```text
shared_dev_mutations        0     every run used a disposable database, dropped
                                  by the orchestrator (cleanup verified)
G03_data_created            false no catalog, product, SKU or media was authored
orders created              0     the journey stops at verification
disposable world teardown   verified — "all E2E ports closed, disposable
                                  database dropped" on every run
SMTP listener teardown      closed in afterAll; loopback, ephemeral port
credentials                 none read from .env; no secret-bearing variable
                            requested; the SMTP credential is generated per run
                            in memory and never logged
.env written                never
report secrets              no code, contact, token or credential appears here
production deployed         false
pushed                      false
```

The synthetic addresses (`app12-n01s1-N@vidu.test`) reach a listener that
forwards nowhere. `.test` is reserved by RFC 6761 and cannot resolve.

---

## U. Baseline

Unchanged, and measured rather than assumed:

```text
OpenAPI paths        127    ✓
OpenAPI operations   140    ✓
OpenAPI schemas      279    ✓
public operations     49    ✓
migrations            39    ✓  (no 0040)
DB tables             79    ✓  (no schema change; no migration added)
Admin routes          26    ✓  (no Admin file touched)
Storefront routes     20    ✓  (no route added or removed)
```

No new API path, operation or Storefront route. The generated client and the
committed OpenAPI artifact are both byte-identical to HEAD.

---

## V. N01 roadmap

```text
N01.B01   COMPLETE — PO PASS        (not reopened)
N01.S01   COMPLETE                  (this package)
N01.E01   NOT_AUTHORIZED — NOT_EXECUTED

INTERNAL_NEXT = N01.E01
```

`N01.E01` was not executed, not prepared and not partially started.

---

## W. Remaining U01 blockers

Untouched and still open. `N01` owns OTP delivery only:

```text
FU-APP12-U01-VARIANT-AUTHORING       open
FU-APP12-U01-READINESS-FALSE-CLAIM   open
FU-APP12-U01-LOW-STOCK-AUTHORITY     open
```

```text
APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED
```

### Follow-ups this package raised

```text
FU-APP12-N01-S01-01   The API classifies VERIFICATION_CHANNEL_UNSUPPORTED
                      internally but publishes the status-derived envelope code,
                      so the Storefront's defensive mapping cannot fire. Attach
                      the business code to the HttpException payload — the
                      platform error mapper already honours one. Backend; not
                      authorized here.
FU-APP12-N01-S01-02   FIGMA_DESIGN_INDEX: the approved APP4-D01 contact-entry
                      frames (623:11–623:14) draw an EMAIL/PHONE chooser the
                      product no longer has. The registry entry needs to be
                      superseded by an email-only frame. Design checkpoint.
```
