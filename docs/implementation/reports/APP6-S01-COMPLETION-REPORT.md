# APP6-S01 — Customer secure quotation screen — completion report

## 1. Verdict

`COMPLETE`, with one documented environment limitation that is not an S01 defect
and is recorded as a follow-up (§18 below).

One Storefront screen at `/truy-cap/bao-gia`, **0 new HTTP operations**, **no
database migration** (36), **no OpenAPI regeneration**, **no client
regeneration**, **no Figma mutation**. The published artifact is untouched: 72
paths / 79 operations / 167 schemas before and after.

`APP6-A02` was not reopened. `FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01`
was left alone, as instructed.

## 2. Entry state

| Fact | Value |
|---|---|
| Branch | `production` |
| Head at entry | `8656ea5` |
| Working tree at entry | clean |
| `7d031aa` (A02) reachable | yes |
| OpenAPI artifact | 72 paths / 79 operations / 167 schemas — unchanged at exit |
| Migrations | 36 — unchanged at exit |

## 3. Figma traceability

Every row was resolved in `docs/design/FIGMA_DESIGN_INDEX.md`, confirmed
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP6-D01-PO-001`, and opened
live in file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_06`.

| Registry id | Node | State consumed |
|---|---|---|
| `FIG-APP6-S01-DEFAULT-DESKTOP` | `700:3` | live offer, 1440 |
| `FIG-APP6-S01-STEPUP-DESKTOP` | `701:3` | accept → step-up, 1440 |
| `FIG-APP6-S01-ACCEPT-INPROGRESS-DESKTOP` | `701:88` | accept in flight |
| `FIG-APP6-S01-ACCEPTED-DESKTOP` | `701:147` | committed acceptance |
| `FIG-APP6-S01-REJECTED-DESKTOP` | `702:3` | committed rejection |
| `FIG-APP6-S01-STALE-DESKTOP` | `702:65` | superseded version |
| `FIG-APP6-S01-EXPIRED-DESKTOP` | `702:129` | lapsed offer |
| `FIG-APP6-S01-LOADING-DESKTOP` | `703:3` | bootstrap (reused APP4 card) |
| `FIG-APP6-S01-ERROR-DESKTOP` | `703:36` | transient failure (reused APP4 card) |
| `FIG-APP6-S01-DEFAULT-MOBILE` | `704:3` | live offer, 390 |
| `FIG-APP6-S01-ACCEPTED-MOBILE` | `705:3` | committed acceptance, 390 |

The registry was **read, not written**: no frame was created, moved or
re-approved, so `node tools/check-figma-design-index.mjs` has no changed input
and was not run (`VALIDATION_GOVERNANCE.md` §3 — a checker runs when its parsed
inputs change).

### Three deliberate divergences from the frames' sample content

1. **The adjustment row is labelled `Điều chỉnh`, not `Giảm giá khách quen`.**
   `700:42` prints an operator's note, which is exactly the `adjustmentReason`
   `APP6-B04` withholds. See §7.
2. **The sub-line names the quotation code, not `REQ-…`.** The frames show a
   request code; B04 returns `quotationCode` and no request identifier at all.
   Both are display-only and neither endpoint accepts one.
3. **`Phần còn lại` carries no percentage.** `700:51` prints *Phần còn lại 60%*,
   a figure that exists only by subtracting one percentage from another. The
   remaining **amount** is the server's own recorded value and is shown; the
   share is not, because deriving it is the client-side arithmetic §16 forbids.

## 4. Secure bootstrap

The locked order is three statements in one synchronous block, inherited
unchanged from `APP4-S02`'s `useSecureLinkBootstrap`:

```text
capture #t=  →  history.replaceState  →  clean URL  →  POST the secret in a body
```

There is **one** fragment parser in the app and S01 does not add a second: the
reader and the stripper are deliberately not exported from
`secure-link-access`, so this feature cannot capture a credential on its own
terms or move the strip relative to the request. No query, path or header
fallback exists; no credential input UI exists.

### The one change this checkpoint needed

Every earlier secure landing is read-only, so the credential died the moment its
single call settled. S01 is not: the same grant authorises the customer's later
accept or reject, the fragment is already gone, and nothing may persist it. So
`useSecureLinkBootstrap` gained an opt-in:

```ts
useSecureLinkBootstrap(resolve, { retainCredentialAfterSuccess: true })
```

Off by default — `APP4-S02` and `APP5-S02` behave byte-for-byte as before, proved
by re-running their suites (§16). Every other lifetime rule is unchanged. The
hook now also exposes `runWithSecret(spend)`, which hands the secret to a request
function on the stack and never returns it, plus `clearCredential()` and
`hasCredential()`.

### Where the raw credential lives, exhaustively

1. the initial URL fragment, before the strip;
2. one route-local ref inside the bootstrap hook;
3. one request body in flight.

It is destroyed on: a committed acceptance, a committed rejection, a definitive
refusal that ends the grant, a missing or malformed fragment, and unmount.
It is **kept** — in the same ref, nowhere else — across a transient failure, a
`REVERIFICATION_REQUIRED`, and a stale reconciliation while the grant is usable.

Verified absent from: React render state, Zustand, `localStorage`,
`sessionStorage`, IndexedDB, cookies, the URL, `history.state`, TanStack query
keys and data, TanStack **mutation variables** (all three mutations are declared
with no variables, so `state.variables` is permanently `undefined`), the DOM,
the console, and this report.

A reload after the strip is unrecoverable and sends **zero** credentialed
requests — asserted in the component suite and observed live (§17, leg F).

## 5. Operations consumed

Three generated operations, all pre-existing:

| Operation | Purpose |
|---|---|
| `publicQuotationCurrent` (`APP6-B04`) | the read the landing performs |
| `publicQuotationAccept` (`APP6-B05`) | acceptance of one exact version |
| `publicQuotationReject` (`APP6-B05`) | rejection of one exact version |

`publicSecureLinkResolve` (`APP4-B06`) is deliberately **not** chained in front
of the read — B04 runs the whole authorization chain internally, so chaining
would authorize the same credential twice, spend the same abuse budget twice and
hold the secret across two flights for a request id this screen must never show.
A component test asserts it is never called.

The only `packages/api-client` change is **export-only** in the curated
`src/index.ts`: the three operations, their body and response types, and the
status enums. No generated file was touched.

## 6. Quotation projection

One card whose badge, headline, sub-line, banner, small print and controls change
together — the approved frames are one card in six states, not six screens. Which
state is on screen is answered by a pure function, `secureQuotationUiState(stage,
quote)`, and what it says by a second, `quotationPresentation(...)`, so both are
asserted directly instead of scraped out of a DOM.

`isDecidable` checks **both** stored states (`status` and `quotationStatus`) plus
the server's `expired`, because `APP6-B05` decides against the version row *and*
the quotation header — a screen reading only one would offer a control the server
is certain to refuse.

## 7. Adjustment follow-up

`FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01` = **`CLOSED_BY_DESIGN_AUTHORITY_AT_APP6_S01`**.

`manualAdjustmentAmount` is shown truthfully, signed, under a neutral label; the
row is omitted entirely when the recorded amount is zero, decided by reading its
digits rather than by converting it. `adjustmentReason` is not requested, not
rendered and **does not appear as a string anywhere in the feature** — a static
boundary test fails if it ever does. No migration, no B04 widening.

Proved live: a seeded version carrying a deliberately conspicuous internal reason
rendered `Điều chỉnh −50.000 VND` with the reason absent from the whole document.

## 8. Exact money

Amounts are server-owned strings and stay strings. The whole feature contains:

- no `Number(...)`, `parseFloat`, `parseInt`, unary `+` on an amount, or
  `toFixed`;
- no `Intl.NumberFormat` — it takes a `number`, so reaching it would mean a
  decimal string had already been coerced;
- exactly **one** `Math.*` call in the entire feature, `Math.ceil`, applied to a
  difference between two instants for the badge's *còn N ngày* courtesy.

All three facts are enforced by a static boundary test, not by review.

Nothing recomputes a subtotal, total, deposit, remainder or line total. The
formatter groups integer digits right-to-left, renders a leading `-` as the
typographic `−` the approved totals use, and returns its input **verbatim** when
the fraction is non-zero or the string is unparsable — hiding a fraction this
system never wrote would be the one way it could misreport a figure. The currency
mark comes from the response's `currencyCode`, not a local constant.

The Admin `exact-money` module was **not** imported: coupling two deployables
through a screen module is the wrong scope (`CLAUDE.md` §5, §16).

## 9. Step-up

**Strategy B — narrow shared extraction.** The APP4 verification purpose was
parameterised at the controller and transport seam of the existing
`contact-verification` feature:

```ts
useContactVerification({ purpose: VERIFICATION_PURPOSES.STEP_UP })
```

`SUBMISSION` remains the default, so `/xac-minh-lien-he` and `APP5-S01` are
unaffected. There is one verification implementation, one code format, one
cooldown source and one reducer; S01 reuses the same three approved cards.

The step-up runs **inside** `/truy-cap/bao-gia`, behind the approved scrim and
dialog of `701:3`. It never navigates to `/xac-minh-lien-he` — a static test
asserts that string, `useRouter`, `redirect(` and `router.push` are all absent —
because leaving the route would unmount the session and destroy the credential
the decision still needs.

### Contact entry is asked for, and why

`701:66` shows a code already sent to a masked destination. It cannot be: B04
returns no contact by design (§17) and `APP4-B03` requires one to issue a
challenge. The server decides whether the named contact is one of the grant
customer's own verified, active contact points — a refusal happens there, not on
the client. Recorded as `FU-APP6-S01-STEPUP-CONTACT-PREFILL-01` (nonblocking).

### Verification is evidence, never consent

Completing the code does **not** accept. The dialog reports success, the
controller performs the mandatory B04 re-read, and then:

- **same `versionId`** → back to the confirmation, where the customer must press
  *Xác nhận và chấp nhận* a second time;
- **different `versionId`** → the stale frame, decision discarded.

## 10. Accept

Explicit two-step: the primary control opens the confirmation, and only the
confirmation submits. Every decision names the **exact `versionId` B04 returned**,
captured when the customer first pressed accept and never re-derived — so a
step-up long enough for the workshop to send a new version is compared against
what the customer actually saw. There is no notion of "latest" in the decision
path at all: the version id is a required argument of the client function.

`replayed: true` is rendered as the success it is, with a line saying the
acceptance was recorded earlier — a customer who pressed twice or retried after a
dropped response is never told they accepted twice.

Same-tick double activation sends **one** request. The guard is a synchronous
`inFlightRef` flipped *before* `mutate()`, not a derived `isPending`: two clicks
in one tick both observe the pre-render value of a flag, so only a ref written
synchronously closes that window. The test dispatches both clicks in the same
tick and asserts one call.

The accepted outcome states plainly that **no payment was taken, no order was
created and no stock was reserved**, and a test asserts the page never contains
"đã thanh toán", "đơn hàng đã được tạo" or "đã giữ hàng".

## 11. Reject

Needs no step-up — `APP6-B05`'s rejection path requires only the grant, because
refusing an offer commits nothing. It is quotation-only, and the copy says so:
the custom request is **not** cancelled and **not** rejected, and the workshop may
send another version. No amount appears on the rejected outcome; printing the
total of a refused price would only suggest an obligation that does not exist.

## 12. Expired, stale, unavailable, transient

| Condition | Behaviour |
|---|---|
| `expired: true` | `702:129`. **No acceptance control exists at all** — not a disabled one. The figures stay, as historical reference. `expired` is the server's derivation and is never recomputed from `validUntil`. |
| `QUOTE_VERSION_STALE` (409) | never a success, never an auto-retry. Exactly **one** B04 re-read, then `702:65` and a new explicit decision. |
| `INVALID_TRANSITION` / `IDEMPOTENCY_CONFLICT` (409) | one bounded re-read, then the quotation with a classified notice. Success is never fabricated. |
| `DUPLICATE_OPERATION` (409) | one notice, **no** re-read and no polling — the same decision is still running server-side. |
| `POLICY_UNAVAILABLE` (503) | its own notice; the offer stays on screen. |
| 404, or a missing/malformed fragment | one indistinguishable unavailable card, **no diagnostic second request**, credential cleared. |
| transport failure | a distinct card with **one manual retry**, which is one new B04 call. No automatic retry anywhere. |

`403 REVERIFICATION_REQUIRED` is explicitly **not** an unavailable state.

Nothing on this screen polls. `now` is sampled once per render; the badge's day
count is a courtesy that is simply omitted when the browser clock disagrees with
the server, so a fast clock can drop a hint but can never hide a live offer or
resurrect a lapsed one.

A decision that answers 404 ends the secure session: the credential is destroyed
and the shell is handed the *same* unavailable state as a link that never opened.

## 13. Secrecy and privacy

Nothing in the feature names `adjustmentReason`, `stitchCount`, `skuId`,
`customerId`, `customRequestId`, `quotationId`, `grantId`, `correlationId`,
`outboxId` or `policyVersionId` — asserted statically against comment-stripped
source, so prose about a rule is never mistaken for the rule.

No refusal renders a server `message`: every notice is chosen by the classified
failure. Those messages are English operator text on a surface anyone holding a
link can reach, and a message is where "this token is real" leaks first.

No Admin DTO or component is reused as the customer contract.

## 14. Responsive and accessibility

One markup, two presentations. Below `768px` the table's header is hidden and
each line becomes a bordered block whose cells print their column name from
`data-label` — so the two viewports can never show different figures.

- The card owns the page `h1`; exactly one is mounted at a time.
- Focus moves to that heading when the link settles, and the heading shows a
  focus ring.
- One polite live region announces the settled state and each in-flight decision
  — states that draw no alert of their own.
- Every alert prints its title, so no state is signalled by colour alone.
- The dialog frame is shared by all three overlays: `role="dialog"`,
  `aria-modal`, a name from its own heading, initial focus on the heading (the
  customer reads what they are committing to before their fingers are on the
  button), Escape, and a Tab cycle. The scrim is deliberately **not** a dismiss
  target — each dialog stands between the customer and a commitment or a
  credential.

## 15. Browser acceptance — real dev stack, `http://embroidery.local`

One S01-only run, not the Playwright suite. Driven against the live gateway, API
and database. No raw secure-link token and no verification code appears in this
report.

Two **pre-existing** environment gaps were found and are not S01 defects:

- the Storefront dev container had not picked up a new App Router segment (the
  known restart quirk) — restarted;
- the three APP4 peppers were unset in `.env`, so **every** secure-link and
  verification operation answered `500`. `.env` was not written by this
  checkpoint; the operator provisioned the peppers and restarted the stack. No
  secret value was read out, echoed, logged or committed. The grant's token
  digest was computed **inside the API container**, so the pepper went
  env → process and never appeared anywhere.

Fixture: the existing dev request `CR-A01C1-0001` / `QUO-A01C1-01`, plus a
seeded `REQUEST_ACCESS` grant and two additional sent versions.

### 1440

| Leg | Frame | Evidence |
|---|---|---|
| A | `700:3` | Live offer rendered: badge *Còn hiệu lực đến 28/08/2026 · còn 7 ngày*, `Phiên bản 1 · 12 sản phẩm`, line `100.000 VND` / `1.200.000 VND`, totals `1.200.000` + `34.567` = **stored** `1.234.567 VND`, deposit `37.5%` `462.963 VND`, remainder `771.604 VND`. |
| A | token absence | `location.hash` empty, `href` clean, `history.state` carries only Next's own router tree, `localStorage` empty, `sessionStorage` holds only Next's dev-tools channel, `document.cookie` empty, DOM and console free of the token. A scripted sweep over all eight surfaces returned **zero** matches. The one console error is a pre-existing `favicon.ico` 404. |
| A | privacy | `adjustmentReason`, `stitchCount`, `skuId`, `customerId`, `customRequestId`, `quotationId`, `grantId` all absent from the document. |
| B | `701:88` path | Accept opened the confirmation and **sent nothing**; dialog named the exact total `1.234.567 VND`, carried *Bước này chưa thu tiền và chưa tạo đơn hàng*, `aria-modal="true"`, focus on its own heading, fits the viewport, no horizontal overflow. |
| C | `701:3` | Confirming produced a **live 403** on `/api/public/quotations/accept` and the step-up opened **inside** `/truy-cap/bao-gia` — `location.pathname` unchanged, the quotation still mounted behind the scrim, contact card rendered. |
| D | reconciliation | With a newer version made current, a decision on the version on screen was refused **live** with 409. The screen performed exactly **one** re-read, showed the newer version (`Phiên bản 3`, total `1.384.571 VND`) with a classified notice, claimed **no** success, and required a fresh explicit decision. The database confirms nothing was written. |
| D | adjustment privacy | That version carries a deliberately conspicuous internal `adjustment_reason`; the screen rendered `Điều chỉnh −50.000 VND` and the reason string was **absent** from the entire document. |
| E | `702:129` | A lapsed version rendered the expired frame: badge *Hết hiệu lực từ 19/08/2026*, `Không còn chấp nhận được`, live region announcement, figures retained — and **no `.secure-quotation__actions` block and zero buttons**, not a disabled control. |
| F | unavailable | No fragment → the APP4 unavailable card with **zero** API requests. A syntactically valid but unknown token → the **identical** card after exactly **one** request, fragment stripped, no retry offered. |

### 390

| Check | Result |
|---|---|
| `704:3` structure | Table header hidden, each line a block, cells labelled from `data-label` |
| Horizontal overflow | **none** — widest element 338px inside a 390px viewport |
| Touch targets | Both decision buttons full-width and exactly **52px** tall, stacked in a column — the approved `704:45` target |
| Dialog | 343px wide, fits the viewport, actions stacked at 52px, focus inside |

### What the run could not reach

**A completed step-up cannot be exercised in this environment, by
construction.** APP4 has no notification provider yet, and the only channel
adapter in the repository is `RecordingNotificationChannelAdapter`, which is
memory-only *on purpose* (`APP4-W01` §12, `ADR-APP4-001` §6.6) — the plaintext
code is deliberately never written to a log, a file or a table. There is
therefore no way to read a verification code in dev, and consequently the
committed-acceptance frames `701:147` / `705:3` and the accept-side
`QUOTE_VERSION_STALE` frame `702:65` are unreachable live. All three are covered
by the component suite, which drives the same controller through the same
sequence. Recorded as `FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01` (nonblocking).

A second gap sits behind that one: `NOTIFICATION_DELIVERY_ENVELOPE_KEY` is also
unset in `.env`, so issuing any challenge answers `500`. That blocks all APP4
verification in dev, not just S01 — recorded as
`FU-APP4-DEV-ENVELOPE-KEY-UNSET-01` (environment, nonblocking).

`APP6-B05` publishes **no** `QUOTE_VERSION_STALE` on the rejection path — the
backend says so itself — so the reject route answers `INVALID_TRANSITION` for a
superseded version. That is what the live run exercised, and it is correct.

## 16. Validation ledger

Strict change impact. Each command ran once over changed inputs; nothing green
was repeated.

| # | Command | Scope justification | Result |
|---|---|---|---|
| 1 | `pnpm --filter @embroidery/storefront typecheck` | every Storefront source change | PASS |
| 2 | `pnpm --filter @embroidery/api-client typecheck` | curated `src/index.ts` changed | PASS |
| 3 | `pnpm --filter @embroidery/api-client test` | curated barrel + generated-client sync check | PASS (7) |
| 4 | `jest test/unit/secure-quotation-model.test.ts` | new model layer | PASS (36) |
| 5 | `jest test/components/secure-quotation.test.tsx` | new screen, bootstrap and decisions | PASS (21) |
| 6 | `jest test/components/secure-quotation-step-up.test.tsx` | new embedded step-up | PASS (6) |
| 7 | `jest test/components/secure-quotation-secrecy.test.tsx` | credential retention is the new risk | PASS (10) |
| 8 | `jest test/boundary/secure-quotation-source.test.ts` | static rules money/privacy/transport | PASS (16) |
| 9 | `jest` — `custom-request-status`, `custom-request-status-secrecy`, `custom-request-status-content`, `contact-verification`, `contact-verification-secrecy`, `custom-request-catalog`, `custom-request-cop`, `custom-request-confirmation`, `custom-request-route` | the two shared files actually changed (`use-secure-link-bootstrap.ts`, `contact-verification`) | PASS (137) |
| 10 | `eslint` over the changed Storefront directories and new tests | scoped lint | PASS |
| 11 | `eslint packages/api-client/src/index.ts` | scoped lint | PASS |
| 12 | `prettier --check` over every changed path | formatting | PASS |
| 13 | `git diff --check` | whitespace/conflict markers | PASS |
| 14 | S01-only browser acceptance | §15 | PASS with the documented limitation |

**S01 focused tests: 89 new (5 suites), plus 137 compatibility.**

Not run, and why: `pnpm quality` and `pnpm quality:e2e` (forbidden, and no
repository-wide aggregate exists); the full Storefront Jest run, full Playwright,
full API Jest, DB integration, worker and Admin suites (no changed input);
repo-wide build/typecheck; the B01–B11 backend suites and the A01/A02 suites (no
shared file they consume changed); the APP3 Studio suite; APP4/APP5 full
acceptance; OpenAPI and client generation (forbidden, and nothing to regenerate);
the DB manifest/fingerprint regression (no migration); the Figma registry checker
(registry unchanged); SonarQube.

## 17. Files changed

**New — `apps/storefront/src/features/secure-quotation/`**

| File | Role |
|---|---|
| `index.ts` | one export: the screen |
| `api/secure-quotation.client.ts` | the three generated operations |
| `hooks/use-secure-quotation.ts` | the controller |
| `model/exact-money.ts` | string-only money formatting |
| `model/secure-quotation-failure.ts` | failure classification |
| `model/secure-quotation-state.ts` | stage reducer + pure frame mapping |
| `model/quotation-presentation.ts` | pure card projection |
| `model/secure-quotation-copy.ts` | the approved copy catalog |
| `ui/secure-quotation-screen.tsx` | shell composition |
| `ui/quotation-content.tsx` | the authorized branch |
| `ui/quotation-lines.tsx`, `ui/quotation-totals.tsx`, `ui/quotation-alert.tsx`, `ui/quotation-actions.tsx` | card parts |
| `ui/accepted-outcome.tsx`, `ui/rejected-outcome.tsx` | committed outcomes |
| `ui/quotation-dialog.tsx`, `ui/accept-confirm-dialog.tsx`, `ui/reject-confirm-dialog.tsx`, `ui/quote-step-up-dialog.tsx` | the overlays |
| `styles/secure-quotation.scss` | feature stylesheet |

**New — route and tests**

`apps/storefront/src/app/truy-cap/bao-gia/page.tsx`;
`test/support/secure-quotation-fixture.ts`;
`test/unit/secure-quotation-model.test.ts`;
`test/components/secure-quotation.test.tsx`;
`test/components/secure-quotation-step-up.test.tsx`;
`test/components/secure-quotation-secrecy.test.tsx`;
`test/boundary/secure-quotation-source.test.ts`.

**Modified**

| File | Change |
|---|---|
| `packages/api-client/src/index.ts` | curated **export-only** block for the three quotation operations |
| `features/secure-link-access/hooks/use-secure-link-bootstrap.ts` | `retainCredentialAfterSuccess`, `runWithSecret`, `clearCredential`, `hasCredential`, `resolveCount` |
| `features/secure-link-access/index.ts` | exports the new option type and `NO_SECURE_CREDENTIAL` |
| `features/contact-verification/model/verification-purpose.ts` | `STEP_UP` alongside `SUBMISSION` |
| `features/contact-verification/api/verification.client.ts` | purpose required at the transport seam |
| `features/contact-verification/hooks/use-contact-verification.ts` | optional `purpose`, defaulting to `SUBMISSION` |
| `features/contact-verification/index.ts` | exports the option and purpose types |
| `src/styles/main.scss` | registers the new stylesheet |

## 18. Follow-ups

| Id | Severity | Statement |
|---|---|---|
| `FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01` | — | **CLOSED_BY_DESIGN_AUTHORITY_AT_APP6_S01** |
| `FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01` | NONBLOCKING | A completed step-up, and therefore `701:147`, `705:3` and the accept-side `702:65`, cannot be observed in dev: the only notification channel is memory-only by design. Covered by the component suite. Reopen when a provider exists. |
| `FU-APP6-S01-STEPUP-CONTACT-PREFILL-01` | NONBLOCKING | `701:66` implies a known destination; B04 returns no contact, so the customer names it. Revisit only if a contract change ever makes a masked destination available to this surface. |
| `FU-APP4-DEV-ENVELOPE-KEY-UNSET-01` | NONBLOCKING | `NOTIFICATION_DELIVERY_ENVELOPE_KEY` is unset in the dev `.env`, so challenge issuance answers `500`. Environment provisioning, owned by the operator. |
| `FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01` | NONBLOCKING | Untouched, as instructed. |

## 19. Roadmap

`docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md` row 17 moves
`INCOMPLETE` → `COMPLETE`, and `APP6-S02` becomes **Next**.

## 20. Closing block

```text
APP6-S01 = COMPLETE
SCREEN = CUSTOMER SECURE QUOTATION   ROUTE = /truy-cap/bao-gia
S01 APPROVED FRAMES = 11 / CONSUMED (8 VERIFIED LIVE; 3 BLOCKED BY DEV CHANNEL)
NEW HTTP OPERATIONS = 0 (79 → 79)     DATABASE MIGRATION = NONE (36)
OPENAPI = UNCHANGED (72 PATHS / 79 OPS / 167 SCHEMAS)
CREDENTIAL = ONE EPHEMERAL REF / RETAINED PAST READ / NO PERSISTENCE ANYWHERE
FRAGMENT = CAPTURE → REPLACESTATE → CLEAN URL → BODY (VERIFIED LIVE)
STEP_UP REUSE = STRATEGY B (PURPOSE PARAMETERISED AT THE TRANSPORT SEAM)
STEP_UP NAVIGATION = ABSENT (STATICALLY PROVED)
STEP_UP COMPLETION = EVIDENCE ONLY / MANDATORY B04 RE-READ / NEVER AUTO-ACCEPT
DECISION TARGET = EXACT VERSIONID FROM B04 / NO CLIENT-SIDE "LATEST"
MONEY = SERVER STRINGS / ZERO NUMERIC COERCION / ONE MATH.CEIL ON A DATE
EXPIRED = NO ACCEPTANCE CONTROL RENDERED AT ALL (VERIFIED LIVE)
404 + MISSING FRAGMENT = ONE INDISTINGUISHABLE STATE / NO SECOND REQUEST
DOUBLE ACTIVATION = ONE REQUEST (SYNCHRONOUS REF, NOT ISPENDING)
FOCUSED TESTS = 89 S01 (5 SUITES) + 137 APP4/APP5 COMPATIBILITY
BROWSER 1440 = PASS   BROWSER 390 = PASS (NO HORIZONTAL OVERFLOW, 52PX TARGETS)
BROWSER-FOUND DEFECTS = 0
DEV ENVIRONMENT REPAIRS = 2 PRE-EXISTING (STALE CONTAINER, APP4 PEPPERS UNSET)
FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01 = CLOSED_BY_DESIGN_AUTHORITY_AT_APP6_S01
FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01 = OPENED (NONBLOCKING)
FU-APP6-S01-STEPUP-CONTACT-PREFILL-01 = OPENED (NONBLOCKING)
FU-APP4-DEV-ENVELOPE-KEY-UNSET-01 = OPENED (NONBLOCKING, ENVIRONMENT)
S02/E01/X01 = NOT STARTED
NEXT CHECKPOINT = APP6-S02
```
