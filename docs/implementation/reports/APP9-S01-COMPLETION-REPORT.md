# APP9-S01 — Customer Remaining-Payment + Completion Surface — Completion Report

## 1. Verdict

```text
APP9-S01 = COMPLETE
NEW_STOREFRONT_ROUTES = 1
APP9_S02 = DOES_NOT_EXIST
CUSTOMER_FINAL_PAYMENT_UI = DELIVERED
CUSTOMER_COMPLETION_STATUS_UI = DELIVERED
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED
CUSTOMER_TRACKING_UI = NOT_IMPLEMENTED
NEW_GRANT_SCOPE = 0
NEW_SESSION_TYPE = 0
NEW_TOKEN_CARRIER = 0
NEW_EVIDENCE_ENDPOINTS = 0
BACKEND_CHANGES = 0
OPENAPI_CHANGES = 0
MIGRATIONS_ADDED = 0
GENERATED_FILES_EDITED = 0
FIGMA_APPROVAL = FIG-APPROVAL-APP9-D01-PO-001 (untouched)
NEXT_CHECKPOINT = APP9-E01
NOT_PUSHED = true
```

## 2. A01 + C1 housekeeping commit

`APP9-A01-C1-COMPLETION-REPORT.md` §3 recorded the accepted A01 + C1 tree as
uncommitted. The working tree was inspected before any S01 work and matched that
report exactly — the nine `packages/api-client/src` files of the C1 split, the
A01 Admin fulfillment sources, `apps/admin/test/support/fulfillment-fixture.ts`,
the two APP9 documents and the A01-C1 report itself, with nothing else present.

One commit was created, containing that tree and nothing added to it:

```text
f6848c1  feat(app9): deliver the admin fulfillment workspace (APP9-A01 + C1)
```

No accepted Admin behaviour was altered, and no A01 UI test was rerun for
housekeeping (§1). S01 began from a clean tree.

## 3. Branch, entry HEAD, commit, push state

```text
branch           production
A01/C1 commit    f6848c1  (the housekeeping commit above)
S01 entry HEAD   f6848c1  — clean tree, verified by `git status --porcelain`
S01 commit       none — the working tree carries the change, uncommitted
push             NOT_PUSHED = true — nothing was pushed at any point
```

## 4. The exact new Storefront route

```text
/truy-cap/thanh-toan-con-lai
apps/storefront/src/app/truy-cap/thanh-toan-con-lai/page.tsx
```

`FIGMA_DESIGN_INDEX.md` annotates every S01 row's route as *"final payment
(secure link)"* and prescribes no literal path, so §4's fallback applies: the
narrowest route consistent with existing Vietnamese Storefront conventions.

- It joins the delivered `truy-cap/{bao-gia, duyet-thiet-ke, thanh-toan}` family
  — same secure prefix, Vietnamese, no identifier in the path, no token in the
  path.
- The name is taken from the approved page title, *Thanh toán phần còn lại*
  (`816:12`), rather than transliterating the backend's `final-payment`.
- `thanh-toan` is already the deposit lane's. A customer may hold both links at
  once, and the two paths must be tellable apart.

## 5. `NEW_STOREFRONT_ROUTES = 1`

One directory was added under `src/app`, containing one `page.tsx`. Payment
status, the QR, the transfer instructions, optional evidence and the
delivered/completed progress are **states of that one page**, not routes:
`APP9-D01` drew them that way and `APP9-S02` does not exist. No route was added
for tracking, shipping, evidence, completion or status.

## 6. Secure-link authority

The existing APP4 `REQUEST_ACCESS` grant and the existing fragment carrier,
reused without modification:

- `useSecureLinkBootstrap` performs the locked capture → strip → body sequence
  and retains the credential (`retainCredentialAfterSuccess: true`), because the
  route spends it again on the QR, the initiation and every evidence call;
- `SecureLinkShell` draws loading, the one indistinguishable unavailable card and
  the transient card with its single manual retry — `819:221` is APP4's own
  frame, reused rather than redrawn;
- `SecureLinkQueryProvider` supplies the route-local TanStack boundary
  (`retry: false`, `gcTime: 0`).

No customer login, no new session type, no new grant scope, no new token carrier,
no query-string token and no path token were added. The token travels only in a
request body, on five `POST` operations including the two reads.

A later call that answers `404 SECURE_LINK_UNAVAILABLE` ends the secure session
through `endSession()` and substitutes the *same* unavailable card, so a grant
that dies mid-flow is indistinguishable from a link that never opened. Case 1
asserts the card leaks no order code, no amount, no account number and no token.

## 7. Final-payment current read

`publicOrderFinalPayment_current` is the sole server authority for `orderCode`,
`orderStatus`, `finalPaymentAmount`, `finalPaymentStatus`, `payable`,
`bankInstructions` and `accessExpiresAt`.

Nothing is chained in front of it: `publicSecureLinkResolve` is never called
(asserted in cases 1 and 5), because B02 runs the whole authorization chain
itself and resolving first would authorize the same token twice.

The read publishes no attempt state, so the controller holds "the attempt this
session opened" in its own state and never pretends to have recovered one. It
also stays available after the payment window closes, which is what lets one
route serve the whole tail of the lifecycle.

## 8. Exact-amount authority

`model/exact-final-amount.ts` does string work and nothing else — no `Number(`,
no `parseFloat`, no `parseInt`, no unary `+`, no `Math.round`, no `toFixed`. The
grouping walks integer digits from the right; an unparseable input is returned
verbatim rather than guessed at; a non-zero fraction is returned verbatim rather
than truncated.

One string reaches every place the amount appears — the pre-attempt highlight,
the instructions hero, the copy control, the QR request context and the settled
facts row — so no two of them can disagree. `finalPaymentAmount` and the
attempt's `amount` are the same frozen figure because B02 opens the attempt *at*
the obligation's exact amount.

**No derivation exists anywhere in the feature.** Case 3 asserts that neither
`12.750.000` nor `5.100.000` — the order total and deposit the approved frames
print — appears on the page in any form, and that the raw decimal string is never
rendered as a coerced number.

## 9. QR behaviour

`publicOrderFinalPayment_qr`, modelled as a `useQuery` because it writes nothing.
Enabled **only** while the instructions panel is showing, which is itself gated on
`payable` — so the browser never asks for an image the server is already refusing
with `409 FINAL_PAYMENT_NOT_PAYABLE`.

- No VietQR payload is constructed in the Storefront; the PNG arrives as bytes.
- No merchant bank value is hard-coded; every field comes from `bankInstructions`.
- The object URL is created once, revoked before replacement and revoked on
  unmount; a browser without `createObjectURL` degrades to the fallback line
  rather than throwing inside a render effect.
- The download reuses the same authorized blob — no second request.
- `816:222`'s disclaimer is rendered as a primary warning **inside** the QR
  panel: *quét mã hoặc chuyển tiền KHÔNG có nghĩa là đã thanh toán xong.*

No provider checkout, no webhook progress, no automatic bank polling, no
countdown. Case 4 asserts the image's `src` is the blob the operation returned,
that the disclaimer renders, and that exactly one QR request was made.

## 10. Attempt-initiation behaviour

`publicOrderFinalPayment_initiate`, following APP7's conventions unchanged:

- one `Idempotency-Key` per customer action, minted through the shared
  `newUploadIdempotencyKey()` — **no second idempotency scheme**;
- a step-up in the middle of an action reuses the *same* key, because that is one
  action that needed evidence half-way through;
- `inFlightRef` is flipped synchronously before `mutate()`, so two activations in
  one tick cannot open two attempts;
- `startAttempt(payment)` refuses outright when the last read said
  `payable === false`, so the screen never initiates against a balance the server
  would refuse;
- nothing initiates on mount.

`REMAINING`-only by construction: `InitiateFinalPaymentAttemptBody` carries only
`{ token }` (asserted in case 5), and no deposit operation exists anywhere in this
feature's transport.

## 11. Optional transfer evidence — reuse

`publicOrderDepositEvidenceUpload` and `publicOrderDepositEvidenceStatus`, the
delivered APP7 operations, reused with **no new endpoint**. B02 widened
`EvidenceAttemptAuthorizer` to `EVIDENCE_OBLIGATION_KINDS = ['DEPOSIT',
'REMAINING']`, so a REMAINING attempt resolves through them.

The route name is deposit-flavoured and must stay so (`FU-APP9-B02-01`). That
wording does not reach the screen: the section is *Ảnh xác nhận chuyển khoản*
(`817:18`), the intake is *Tải ảnh giao dịch (không bắt buộc)* (`817:24`), and
case 6 asserts the rendered document contains neither `đặt cọc` nor `tiền cọc`.

Evidence stays optional and is said to be so three times — the *Không bắt buộc*
badge, the lead line, and `817:29`'s note that sending an image is **not** the
payment being confirmed. No OCR, no bank parsing, no delete, no replace, no
preview (no customer operation serves evidence bytes).

## 12. Evidence attempt binding

`attemptId` comes from the accepted initiation and from nowhere else — never from
user input, a URL or storage. With no attempt the status query is `enabled:
false` and the upload mutation rejects before reaching the wire, so the UI
naturally requires initiation first rather than inventing an id. The evidence
section is not even mounted until `controller.attempt` exists.

No hidden second attempt is possible: `startAttempt` is the only path to an
initiation and is guarded by a synchronous in-flight ref.

The server is not relying on this — the authorizer locks the attempt row and
compares its **order** against the one the grant names — but this is the client
half of the same rule. Case 6 asserts both the status body and the upload body
carry the attempt id the initiation returned.

## 13. Payment / lifecycle state mapping

Five panels, selected by `finalPaymentPanelOf` — a pure function over server
facts alone:

| Panel | Condition | Approved frame |
|---|---|---|
| `SETTLED` | `finalPaymentStatus = SATISFIED` **or** order ∈ {READY_FOR_DELIVERY, DELIVERED, COMPLETED} | `818:37` / `818:87` / `818:137` |
| `OTHER_STATE` | `finalPaymentStatus` ∈ {CANCELLED, SUPERSEDED} | undrawn — neutral, per `751:174` |
| `NOT_PAYABLE` | `payable = false` | `818:4` |
| `PRE_ATTEMPT` | `payable = true`, no attempt this session | `816:231` |
| `INSTRUCTIONS` | `payable = true`, attempt opened | `816:4` + `817:4` |

`payable` is the gate and is never substituted by the order status — B02 derives
it from *both* the order and the obligation, and the two acting operations refuse
on it.

**"Attempt opened" and "waiting for Admin verification" are one visual state**,
exactly as `820:44` records: the projection answers `PENDING` for both and
carries no attempt detail, so splitting them would be invention. The instructions
card *is* the waiting card. There is no *Tôi đã chuyển khoản* control anywhere in
the feature (asserted in case 7).

`OTHER_STATE` is the only judgement call in the table and is not a new one: it
reuses `APP7-D01`'s approved rule at `751:174` for a stored value the package
does not draw — show it neutrally rather than guess. Falling through to
not-payable would tell a customer whose balance was cancelled that we will bill
them later.

## 14. READY_FOR_DELIVERY / DELIVERED / COMPLETED customer UX

One card in three readings (`OrderProgressCard`) plus a four-step progress:

```text
Đã thanh toán → Đang chuẩn bị giao → Đã giao → Hoàn tất
```

`READY_FOR_DELIVERY` fills two steps, `DELIVERED` three, `COMPLETED` four —
exactly the three approved frames, with no interpolation between them.

Backend enum names never reach the screen (`820:6`). `model/order-progress.ts`
translates `orderStatus` through the approved mapping at `820:14`…`820:38`, and
answers `undefined` for `ON_HOLD`, `CANCELLING` and `CANCELLED` — for which no
approved customer label exists and for which one invented here would be the first
customer-visible sentence about cancelling an order. The badge is then simply not
rendered.

It is a stepper, not a timeline: no timestamps, no durations, nothing that ticks.

## 15. Tracking exclusion

`CUSTOMER_TRACKING_UI = NOT_IMPLEMENTED`.

Enforced structurally rather than by discipline: the only projection any
component in this feature receives is `CustomerFinalPaymentResponse`, which
carries no `carrierName`, no `trackingCode` and no shipment field of any kind, so
there is no value in scope for one to be rendered from. No Storefront call in
this feature reaches an Admin shipping operation, and none is exported to it.

Case 8 asserts the rendered DELIVERED document contains none of `carrier`,
`tracking`, `vận chuyển`, `đơn vị giao`, `mã vận đơn`, `theo dõi`, and that the
progress is exactly four list items — no timeline, no ETA, no map, no courier
events.

## 16. Customer fee-acknowledgement UI — deferred, confirmed

```text
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED
OWNER = APP10 or later customer-communication composition
```

`publicOrderShippingFee_acknowledge` is **not** exported from
`@embroidery/api-client` (it remains deliberately absent from the
`orders-and-payments` barrel, per `APP9-B04-C1`), is not imported anywhere in
this feature, and is not surfaced by any control. No `newFeeAmount` field, no
query-param fee carrier, no fabricated proposal card, no Admin-only read.

The reason is unchanged from `FIG-APP9-FEE-ACK-DISPOSITION`: the command requires
the caller to supply the exact new fee, and no delivered customer projection
carries a server-authoritative proposed one. Case 9 asserts *phí vận chuyển*
appears nowhere on the terminal state.

## 17. Cancellation / refund exclusion

`PO-APP9-001 = OPTION A — DEFER`. No cancel, refund, refund-status or return
control exists, and none is rendered as a disabled placeholder. Case 9 asserts
the COMPLETED page contains none of *hoàn tiền*, *huỷ đơn*, *hủy đơn*, *đổi trả*,
*trả hàng*, and carries **zero** buttons.

## 18. Notification exclusion

No notification centre, no email/SMS settings, no delivery-notification
preferences and no communication history. APP10 owns customer communication. The
only communication wording on the route is inline explanatory copy, which §18
permits — e.g. *Chúng tôi sẽ báo bạn khi cần thanh toán phần còn lại.*

## 19. Query / cache strategy

TanStack Query and the repository's Axios instance only; no second server-state
library, and no server truth duplicated into Zustand (this feature imports no
store at all).

Two query keys, under this route's **own** root:

```text
['secure-final-payment', 'qr']
['secure-final-payment', 'evidence', attemptId]
```

The root is distinct from the deposit lane's `secure-deposit` deliberately: the
two lanes read different obligations on the same order through sibling
operations, and a shared root would let a deposit QR and a balance QR collide on
one key. No credential appears in any key.

Invalidation is exactly one key. A successful evidence upload refetches *only*
`evidence(attemptId)` — it does not re-read the balance, does not touch the QR,
and cannot move the screen to a settled state. Nothing in the Storefront catalog
or custom-request caches is ever invalidated by this route.

## 20. Refresh / polling disposition

No polling of any kind. §20 forbids a "waiting for bank confirmation" loop, and
it would be dishonest regardless — Admin verification is manual and may happen
hours later.

The balance is re-read exactly twice in the life of the screen, both explicit:

1. the bootstrap's own `retry()` from the APP4 transient-error card, pressed by
   the customer;
2. one reconciliation, guarded by a ref so it can fire at most once, when an
   attempt comes back `SUCCEEDED` — the single state in which the attempt claims
   something the read has not confirmed. The obligation remains the authority;
   the re-read is how the screen asks it.

No `refetchInterval`, no focus-refetch override, no timer.

## 21. API-client curated export changes

One handwritten file modified: `packages/api-client/src/orders-and-payments.ts`,
**243 → 297 lines** (limit 400). The root barrel `index.ts` is **unchanged at 46
lines** and keeps its thin-barrel responsibility. Zero generated files edited.

Thirteen names added, all in the correct responsibility barrel beside the APP7
order and payment operations they are siblings of:

```text
operations  publicOrderFinalPaymentCurrent, publicOrderFinalPaymentInitiate,
            publicOrderFinalPaymentQr
enums       CustomerFinalPaymentResponseFinalPaymentStatus,
            CustomerFinalPaymentResponseOrderStatus,
            FinalPaymentAttemptResponseMethod,
            FinalPaymentAttemptResponseStatus
types       ReadFinalPaymentBody, InitiateFinalPaymentAttemptBody,
            FinalPaymentQrBody, CustomerFinalPaymentResponse,
            FinalPaymentBankInstructionsResponse, FinalPaymentAttemptResponse
```

`publicOrderShippingFeeAcknowledge` remains absent — S01 does not consume it
(§16), and the barrel's own doc comment already records why it stays off.

No evidence operation was added: the two APP7 evidence operations were already
exported and are reused as they stand.

## 22. Focused tests and exact counts

```text
groups                 1
file                   apps/storefront/test/components/secure-final-payment.test.tsx
cases                  10  (10 passed, 0 failed, 0 skipped)
suites                 1   (1 passed)
supporting fixture     apps/storefront/test/support/secure-final-payment-fixture.ts
```

| # | Case | Proof |
|---|---|---|
| 1 | secure-link unavailable | malformed fragment → the approved generic card; no request made; no order code, amount, account number or token in the document; `publicSecureLinkResolve` never called |
| 2 | not payable | `payable = false` → no start control, no QR control, `_qr` and `_initiate` never called, and **no figure at all** rendered despite the read carrying the true amount |
| 3 | payable | exact `finalPaymentAmount` renders with bank name, account, holder and `RM` reference; `12.750.000` and `5.100.000` absent; raw decimal never rendered as a coerced number |
| 4 | QR | `publicOrderFinalPayment_qr` called once with the body token; image `src` is the blob's object URL; `816:222`'s not-yet-verified warning renders |
| 5 | initiate | `publicOrderFinalPayment_initiate` called once, `Idempotency-Key` header present, body is exactly `{ token }`, resolve never chained |
| 6 | optional evidence | status and upload both carry the attempt id the initiation returned; neutral copy renders; document contains neither `đặt cọc` nor `tiền cọc` |
| 7 | waiting → verified | `PENDING` shows the waiting sentence and no "I have transferred" control; a `SATISFIED` read shows the settled card, the *Đang chuẩn bị giao* pill and step, no payment control, and no QR request |
| 8 | DELIVERED | delivered card and pill render; six carrier/tracking terms absent; progress is exactly 4 list items |
| 9 | COMPLETED | terminal card renders; five refund/cancel/return terms absent; **zero** buttons; `phí vận chuyển` absent |
| 10 | undrawn obligation state | `CANCELLED` renders the neutral card, and neither the not-payable body nor the settled heading |

Case 10 is beyond the nine required and is inside the 6–10 band. No second
focused group was added: the evidence flow this checkpoint touches is a section
of this route, not a separately established test boundary that S01 changes.

## 23. Validation order

Followed §25 exactly:

1. inspected the delivered secure-payment routes and read every approved S01
   Figma node (`816:4`, `816:231`, `817:4`, `818:4`, `818:37`, `818:87`,
   `818:137`, `819:221`, `820:4`) before writing code;
2. implemented;
3. Prettier on the changed source and test files;
4. ESLint + `tsc --noEmit` on `apps/storefront`, then on `packages/api-client`;
5. fixed the one static issue found (below);
6. ran the focused Storefront group;
7. documentation and this report.

No test was run before static cleanup.

| Command | Scope | Result |
|---|---|---|
| `npx prettier --write <changed files>` | 24 source/style/route files | 3 reformatted, rest unchanged |
| `npx eslint src/features/secure-final-payment src/app/truy-cap/thanh-toan-con-lai` | new feature + route | 2 warnings → 0 after fix |
| `npx tsc --noEmit` (`apps/storefront`) | whole app incl. tests | pass, no output |
| `npx tsc --noEmit` (`packages/api-client`) | the edited barrel | pass |
| `npx eslint src/orders-and-payments.ts` (`packages/api-client`) | the edited barrel | pass |
| `npx prettier --check` + `npx eslint` on the test file | the S01 test group | pass |
| `npx jest test/components/secure-final-payment.test.tsx` | 1 suite | **10 passed** |
| `node tools/check-figma-design-index.mjs` | registry integrity | pass — 450 registry IDs, 450 node rows, 21 tables |

**The one static issue.** Prettier wrapped the QR `<img>` onto its own line,
which moved it out from under its `eslint-disable-next-line
@next/next/no-img-element` comment — producing both an unused-directive warning
and the rule it was meant to suppress. The directive was moved inside the
returned expression, directly above the element. A `blob:` URL for bytes that
already arrived over an authorized POST and are never stored is the one case
where `next/image`'s loader has nothing to fetch and must not be handed the
source.

## 24. Reruns, and the exact intervening change

Exactly one rerun, and it is justified.

```text
run 1  npx jest test/components/secure-final-payment.test.tsx  → 7 passed, 3 failed
       intervening change: test/components/secure-final-payment.test.tsx only,
       lines 304 / 323 / 343 — `getByText` → `getAllByText(...)).toHaveLength(2)`
run 2  npx jest test/components/secure-final-payment.test.tsx  → 10 passed
```

The three failures were assertion defects, not product defects. Each status label
legitimately appears **twice** on a settled page: once as the status pill beside
the heading (`818:46`) and once as the step the order has reached in the progress
(`818:61`). `getByText` throws on multiple matches. The assertions now pin the
count at 2, which is a stronger claim than the original — it would fail if either
occurrence were lost. **No production source was changed between the two runs.**

`npx eslint` and `npx prettier --check` were run once more against the test file
after that edit, because the file changed after their previous pass.

No combined final-confidence rerun was performed. No suite was rerun after a
Markdown-only edit.

## 25. Validations deliberately not run

Per §28, none of the following was run — none is directly impacted by a
Storefront-only change that touches no backend, no generated file, no OpenAPI
artifact and no database:

```text
full pnpm test / full Jest / all Storefront tests / all frontend tests
Playwright (any)          Docker (any)
backend API integration   payment backend tests
worker tests              database tests
APP9-A01 Admin UI tests   Admin tests generally
APP9-E01                  APP7-E01
```

Two that deserve naming:

- **`packages/api-client` Jest** (`public-api.smoke.test.ts`,
  `generated-client.contract.test.ts`) was not run. The barrel change is purely
  additive; neither suite asserts an export count, and the only absence assertion
  is on `publicProductMediaGet`, which is untouched. `tsc --noEmit` on the
  package is the evidence that the thirteen added names compile with no collision
  — a duplicate export would be a type error there.
- **The A01 Admin suites** were not rerun for the housekeeping commit (§1) and
  are not impacted: zero Admin source files were touched by S01.

## 26. Changed files

```text
A  apps/storefront/src/app/truy-cap/thanh-toan-con-lai/page.tsx              57

A  apps/storefront/src/features/secure-final-payment/index.ts                17
A  .../api/secure-final-payment.client.ts                                   222
A  .../hooks/use-secure-final-payment.ts                                    301
A  .../hooks/use-final-payment-qr.ts                                        145
A  .../hooks/use-transfer-evidence.ts                                       236
A  .../model/final-payment-copy.ts                                          259
A  .../model/final-payment-state.ts                                         163
A  .../model/final-payment-failure.ts                                       171
A  .../model/final-payment-query-keys.ts                                     44
A  .../model/exact-final-amount.ts                                           80
A  .../model/order-progress.ts                                              102
A  .../model/transfer-evidence.ts                                           104
A  .../model/display-format.ts                                               59
A  .../ui/secure-final-payment-screen.tsx                                    44
A  .../ui/final-payment-content.tsx                                         220
A  .../ui/pre-attempt-card.tsx                                               93
A  .../ui/transfer-instructions-card.tsx                                    138
A  .../ui/final-payment-qr-panel.tsx                                        101
A  .../ui/transfer-evidence-section.tsx                                     199
A  .../ui/evidence-list.tsx                                                  72
A  .../ui/order-progress-card.tsx                                            95
A  .../ui/order-facts-card.tsx                                               67
A  .../ui/not-payable-card.tsx                                               45
A  .../ui/copy-value-button.tsx                                              89
A  .../ui/final-payment-pill.tsx                                             47
A  .../ui/final-payment-note.tsx                                             46
A  .../ui/final-payment-dialog.tsx                                          111
A  .../ui/final-payment-step-up-dialog.tsx                                  142
A  .../styles/secure-final-payment.scss                                      15
A  .../styles/_final-payment-tokens.scss                                     94
A  .../styles/_final-payment-layout.scss                                    310
A  .../styles/_final-payment-transfer.scss                                  271
A  .../styles/_final-payment-evidence.scss                                  175
A  .../styles/_final-payment-dialog.scss                                     90

M  apps/storefront/src/styles/main.scss          +1 line, the feature entry
M  packages/api-client/src/orders-and-payments.ts   243 -> 297

A  apps/storefront/test/components/secure-final-payment.test.tsx            377
A  apps/storefront/test/support/secure-final-payment-fixture.ts             152

M  docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md  roadmap only
A  docs/implementation/reports/APP9-S01-COMPLETION-REPORT.md
```

No backend, worker, database, migration, OpenAPI artifact, generated file, Admin
source or Figma artifact was touched. `packages/api-client/src/index.ts` is
unchanged.

## 27. File-size check

```text
largest runtime source   _final-payment-layout.scss   310   (limit 400)
largest TypeScript       use-secure-final-payment.ts  301   (limit 400)
largest test             secure-final-payment.test.tsx 377  (limit 600)
largest api-client barrel orders-and-payments.ts       297  (limit 400)
api-client root barrel    index.ts                      46  (unchanged)
```

Every file is inside its hard limit, and the two largest are also under the 300 /
500 review thresholds or within a line of them. The stylesheet was split into
four partials plus a token file from the start rather than after the fact.

## 28. Non-blocking findings

**FU-APP9-S01-01 — two approved summary rows are undrawn, by necessity.**
`FIG-APP9-S01-FINALPAY-PAYABLE-DESKTOP` (`816:27`),
`FIG-APP9-S01-FINALPAY-PREATTEMPT-DESKTOP` (`816:251`) and all four order-status
frames print *Tổng đơn hàng* and *Đã đặt cọc*. `CustomerFinalPaymentResponse`
carries neither, and every route to them is forbidden by this checkpoint:
deriving is `total − deposit` run backwards (§6, §8), reading the deposit lane
puts a second obligation on a REMAINING-only surface and still yields no total,
and reading the quotation is inferring the amount from quotation totals (§6). The
rows are therefore absent and the exact balance — the frames' own visual anchor —
is what renders. This is the same call `APP7-S01` made for the missing order
total on `747:3`. **Owner: whichever phase adds a customer order-summary
projection.** Not an S01 defect: no approved capability is missing, only two
context rows.

**FU-APP9-S01-02 — a fourth statement of the exact-money rule.**
`exact-final-amount.ts` restates the rule `secure-quotation/model/exact-money.ts`,
`secure-deposit-payment/model/exact-deposit-amount.ts` and the Admin
`exact-amount.ts` already hold. Promoting one would move a delivered module out
from under its own boundary guard, which is an APP6/APP7 change S01 is not
authorized to make. **Owner: a future consolidation checkpoint.**

**FU-APP9-S01-03 — a third copy of the modal frame and the evidence controller.**
`final-payment-dialog.tsx` is behaviourally the third copy of the scrim/focus-trap
frame (`APP6-S01`, `APP7-S01`), and `use-transfer-evidence.ts` /
`transfer-evidence-section.tsx` restate the deposit lane's evidence controller and
panel. The panel genuinely had to be re-authored — the delivered one imports
`SECURE_DEPOSIT_COPY`, which says *tiền cọc* in four places, and §11 forbids that
wording here — but the controller could be shared. It is not shared today because
`secure-deposit-payment/index.ts` exports exactly one name and its boundary suite
asserts that count, so widening it is an APP7 change. **Owner: a future
consolidation checkpoint.** The deposit lane's own comment already names "a third
consumer" as the moment `shared/` becomes right.

**FU-APP9-S01-04 — no static boundary suite for this feature.**
`APP7-S01` ships `test/boundary/secure-deposit-source.test.ts`, which proves by
scanning that no numeric coercion, storage address or delete operation exists in
its source. S01 has no equivalent; §27 charters one focused component group and
§28 forbids widening scope, so the file-size and no-coercion claims in §8 and §27
rest on the measurements above rather than on an executable guard. **Owner:
APP9-E01 or a follow-up checkpoint.**

**Observation, not a finding.** The `figma-desktop` MCP server failed to connect
this session; the `plugin:figma` server was available and every approved S01 node
was read directly from the live file. No Figma artifact was created, modified or
re-approved.

## 29. Roadmap

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   COMPLETE
B04   COMPLETE
B05   COMPLETE
D01   COMPLETE
A01   COMPLETE
S01   COMPLETE
E01   NEXT
X01   INCOMPLETE
```

Exactly one `NEXT`. E01 was not begun.

## 30. Stop

```text
APP9-S01 = COMPLETE
NEW_STOREFRONT_ROUTES = 1
CUSTOMER_FINAL_PAYMENT_UI = DELIVERED
CUSTOMER_COMPLETION_STATUS_UI = DELIVERED
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED
CUSTOMER_TRACKING_UI = NOT_IMPLEMENTED
NEXT_CHECKPOINT = APP9-E01
NOT_PUSHED = true
```
