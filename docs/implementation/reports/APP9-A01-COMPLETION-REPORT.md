# APP9-A01 — Admin Commerce-Completion Workspace — Completion Report

## 1. Verdict

```text
APP9-A01 = COMPLETE   (after APP9-A01-C1)
APP9-A01-C1 = PASS
FIGMA_APPROVAL = FIG-APPROVAL-APP9-D01-PO-001
APP9_FIGMA_ROWS_APPROVED = 36
NEW_ADMIN_ROUTES = 0
ADMIN_COMMERCE_COMPLETION_UI = DELIVERED
BACKEND_OPERATIONS_ADDED = 0
MIGRATIONS_ADDED = 0
OPENAPI_CHANGES = 0
GENERATED_FILES_EDITED = 0
FOCUSED_TEST_CASES = 11
NEXT_CHECKPOINT = APP9-S01
NOT_PUSHED = true
```

## 2. D01 housekeeping commit

`APP9-D01-COMPLETION-REPORT.md` §3 stated the D01 change was still uncommitted.
The working tree was inspected and reconciled against that report §23 before
anything was committed:

```text
tree at entry            3 paths (2 modified, 1 untracked)
report §23 modified      2   (FIGMA_DESIGN_INDEX.md, APP9 phase plan)
report §23 added         1   (APP9-D01-COMPLETION-REPORT.md)
                         --
                         3   ✓ exact match
```

The design-index diff was read before committing and matched the report exactly:
`+1` write-target line in §3 (`APP_09` → `766:2`), `+1` registry table §4.15 with
**36** `REVIEW_REQUIRED` rows and its pre-draw audit. The phase-plan diff was the
roadmap only. **No accepted D01 design was altered**, and no B05 test or D01
design check was rerun to create the commit, as §1 requires.

One commit was created:

```text
4884e2e  docs(app9): deliver the APP9 design package and registry rows (APP9-D01)
```

A01 then started from a clean tree.

## 3. Figma approval promotion

All **36** APP9 rows were promoted in the registry:

```text
before   36 rows REVIEW_REQUIRED, approval evidence "—"
after    36 rows APPROVED_FOR_IMPLEMENTATION, evidence FIG-APPROVAL-APP9-D01-PO-001
remaining APP9 rows at REVIEW_REQUIRED: 0
```

The edit was applied only to lines matching `^| FIG-APP9-`, so **no row outside
`APP9-D01` was touched** and the file's other `REVIEW_REQUIRED` rows are
unaffected. No node id, deep link, page/section ownership, screen/state/viewport
or `Last Verified` value changed — `Last Verified` stays `2026-08-27`, because it
records when a row was last checked against the live file, which a human
approving the design does not re-perform.

A `Product Owner approval — recorded by APP9-A01` paragraph was added to §4.15
following the `APP8-D01` precedent, recording the whole-package promotion and
`A01_UI_IMPLEMENTATION_GATE = OPEN`. **No second approval id was created**, and
the D01 report keeps its no-self-approval verdict, which remains true: the
approval is external and human.

## 4. Approval evidence id

```text
FIG-APPROVAL-APP9-D01-PO-001
```

Recorded verbatim on all 36 rows. Exactly one id.

## 5. Branch, entry HEAD, commit, push state

```text
branch          production
D01 commit      4884e2e   (created by this checkpoint's §1 housekeeping)
A01 entry HEAD  4884e2e   (tree clean at entry)
A01 commit      none — the working tree carries the change, uncommitted
push            NOT_PUSHED = true — nothing was pushed at any point
```

## 6. Routes changed

```text
/orders             extended (existing APP7 queue)
/orders/{orderId}   extended (existing APP7 order + deposit workspace)
```

No route file was created, moved or deleted. `apps/admin/src/app/(protected)/`
is untouched.

## 7. Route boundary

```text
NEW_ADMIN_ROUTES = 0
```

No `/fulfillment`, `/shipping`, `/final-payments`, `/delivery` or `/completion`
exists. No second order queue was created — the APP9 states are found through the
one `adminOrder_list` queue that already existed. Zero sidenav entries added.

## 8. `/orders` list and filter changes

The queue's filter already enumerated **all eleven** LC-14 values, derived from
the generated `AdminOrderListStatusItem` enum rather than a hand-kept list, so
the five APP9 states were already selectable and already sent as the repeatable
`status` parameter. Nothing about pagination, the query, the cache key or the
table structure changed.

What A01 changed is the **badge presentation**: the five APP9 states carried a
neutral tone with an explicit `APP7-D01` comment saying APP8/APP9 own their
semantics. `FIG-APP9-A01-ORDERS-FULFILLMENT-DESKTOP` (`808:4`) now draws them, so
each takes its drawn tone and a `753:120` symbol:

| State | Tone | Symbol |
|---|---|---|
| `PRODUCTION_COMPLETED` | info | `◐` |
| `AWAITING_FINAL_PAYMENT` | warning | `◷` |
| `READY_FOR_DELIVERY` | info | `▶` |
| `DELIVERED` | success | `✓` |
| `COMPLETED` | success | `✓` |

`ON_HOLD`, `CANCELLING` and `CANCELLED` stay **neutral**: no delivered phase
draws them and commercial cancellation is deferred, so tinting them would invent
a semantic.

**Not implemented, deliberately:** the approved frame sketches `ĐÃ CỌC` and
`CÒN LẠI` columns, and its own note claims the table shows only fields
`adminOrder_list` returns. `AdminOrderQueueItemResponse` publishes `totalAmount`
and no other money member — no deposit amount and no remaining amount. Both
columns would have to be fabricated, so neither was added. See §30.

## 9. Order-detail APP9 state composition

The fulfillment rail sits at the top of the existing right column, above the APP7
deposit workbench, and is passed the order the screen already read — one
`adminOrder_detail` per screen, so the header and the actions beneath it cannot
describe different orders.

`model/fulfillment-capability.ts` maps status → stage; every card owns its own
behaviour. There is no single component holding all five states' logic.

| Order status | Stage | Rendered |
|---|---|---|
| `PRODUCTION_COMPLETED` | `open-final-payment` | Open-balance card + locked-capability list |
| `AWAITING_FINAL_PAYMENT` | `awaiting-final-payment` | Balance state + API gap + verification limitation + locked list |
| `READY_FOR_DELIVERY` | `shipping` | Shipping editor + fee card + dispatch card |
| `DELIVERED` | `delivered` | Settled-payment card + frozen shipping + completion card |
| `COMPLETED` | `completed` | Frozen shipping + terminal record, no controls |
| anything else | `none` | Nothing at all |

`adminOrderShipping_read` is issued **only** from `READY_FOR_DELIVERY` onward
(`enabled` on the query), so no round trip is spent on a detail that has no
surface yet.

## 10. `PRODUCTION_COMPLETED` action

"Yêu cầu thanh toán phần còn lại" → `adminOrder_transition` with
`{ to: 'AWAITING_FINAL_PAYMENT' }`, the destination taken from the contract's own
`TransitionAdminOrderBodyTo` enum rather than a literal. Behind the approved
confirm dialog (`809:95`).

On success the order and the queue root are invalidated; the screen re-renders
`AWAITING_FINAL_PAYMENT` from the re-read, never from the receipt. The copy states
that opening the window **does not create a new obligation** — the REMAINING one
was created beside the deposit at order conversion. No custom lifecycle client
exists: the one service seam calls the one generated operation.

## 11. `AWAITING_FINAL_PAYMENT` — API limitation handling

No remaining-payment read model was fabricated. Concretely:

- **no derived amount.** `remaining = total − deposit` is not computed anywhere
  in the feature. The A01 brief §9 forbids it and a `B04` fee increase supersedes
  the obligation, which falsifies the subtraction.
- **no rich panel.** No REMAINING attempt list, no evidence list, no
  reconciliation history — `adminOrderPayment_read` filters `kind = 'DEPOSIT'` in
  SQL and `adminOrder_detail` returns no payment data at all, so there is nothing
  to project.
- **the gap is drawn, not hidden.** The approved `811:74` treatment renders in
  place of the figure, naming the limitation in operator language.

What *is* rendered is real: the lifecycle state (the balance is open, the customer
has instructions on their secure page). The verification card states plainly that
the confirm/review actions cannot be armed, because both are addressed by
`attemptId` and the REMAINING attempt's id is behind the same missing read — the
approved frame's own annotation says so.

## 12. Payment verification / review reuse

`adminPaymentAttempt_verify` and `adminPaymentAttempt_review` remain the only
verification operations. **No "final payment verify" API, service, hook or
component was created**, and the APP9 service seam does not import either — the
existing APP7 `payment-decision.service.ts` still owns them.

The existing APP7 verification/review UI is unchanged and still gated on the
DEPOSIT obligation being `PENDING`. For a REMAINING attempt the same commands
apply, but no Admin read publishes the attempt id, so A01 renders the limitation
rather than a control that could not name an attempt. No provider or webhook
semantics were added; nothing implies a bank transfer is automatically verified.

## 13. Shipping editor behavior

`adminOrderShipping_read` / `_save`, with exactly the nine members
`SaveShippingDetailBody` accepts: `recipientName`, `recipientPhone`,
`addressLine`, `ward`, `district`, `province`, `feeAmount`, `carrierName`,
`trackingCode`. `countryCode` is not offered — the body has no member for it.

- **Full replacement, not a patch.** All nine travel on every save; an emptied
  optional member is omitted deliberately, which is what clearing it means.
  `exactOptionalPropertyTypes` is honoured with conditional spreads so a present
  key never holds `undefined`.
- **No profile or address-book fallback.** The order-owned detail is the only
  source; the feature imports no customer-profile operation.
- **Money is string work only.** No `Number`, `parseFloat`, unary `+` or
  arithmetic operator is applied to a fee anywhere in the feature. The
  increase test normalizes both sides to whole-đồng digits and compares by length
  then lexicographically. The fee is a text input, not `type="number"`.
- **The UI computes no obligation authority.** The stored fee is displayed; the
  balance it moves is never derived, and the save receipt's
  `AdminShippingFeeOutcomeResponse` is not projected into the cache.
- **Local validation warns before a round trip** and is never a second authority
  — the server re-validates and the save button is not pre-refused.

An order at `READY_FOR_DELIVERY` whose detail 404s is not an error state: the
editor renders empty so the operator can create one, with `detail = null` rather
than a fabricated response object (which would have needed a hard-coded
`countryCode`). Dispatch is not offered there — `GRD-017` requires a detail that
exists and carries a fee.

## 14. Fee-increase acknowledgement refusal UX

`SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED` gets the approved card (`812:197`), not
an inline sentence, with the exact product copy:

```text
Không thể áp dụng phí vận chuyển mới
Khách hàng chưa xác nhận mức phí này.
```

It shows the stored fee against the entered one, states that **nothing at all was
written** (including the non-fee fields in the same body), and gives the honest
remedy. It also holds back the dispatch control while the unsaved fee stands.

Absences, all deliberate and all asserted by test:

- no "Accept for customer", override or force-save control;
- no field in which an operator could assert a fee the customer agreed to;
- no grant, challenge, token, OTP or secure-link identifier rendered;
- `publicOrderShippingFee_acknowledge` is **not imported** by this feature and
  is not on the curated API-client boundary A01 added — it is unreachable, not
  merely unused.

The only control is "Khôi phục mức phí đã lưu", a local undo that calls nothing.

## 15. Customer acknowledgement UI

Out of scope and not attempted. No proposed-fee link generator, no notification
workflow, no customer-communication UI. `CUSTOMER_FEE_ACK_UI = BACKEND_READY /
UI_DEFERRED` stands; A01 handles only the truthful Admin refusal.

## 16. Dispatch UX

`adminOrder_dispatch` behind the approved confirm dialog (`814:4`). The dialog
names the freeze **before** it happens, lists the exact values about to be
recorded, and says the record is the shop's own — not a courier's confirmation.

No database term appears in primary copy: the dialog says the values are recorded
and become immutable, never `shipping_snapshots`. There is no separate freeze
control anywhere, because there is no such operation.

Nothing is marked `DELIVERED` optimistically. The order and the shipping detail
are invalidated on success and the screen renders the re-read; a refusal leaves
the dialog open with its approved sentence and no bypass.

## 17. `DELIVERED` — frozen and read-only

The frozen card contains **no input and no save control**, not even a disabled
one. `carrierName` and `trackingCode` render as static text when present, with a
note saying they are internal and that no tracking lookup exists.

Absent by design and asserted by test: no track-package button, no carrier link,
no ETA, no shipment timeline, no map, no polling, no live status.

## 18. Completion UX

`adminOrder_complete` on its **own card**, behind its own dialog (`815:89`).
There is no combined "dispatch and complete" path anywhere. The dialog states
that `COMPLETED` is terminal and lists what stops being possible.

"Đã giao lúc" is sourced from the frozen detail's `frozenAt` — dispatch stamps
the snapshot and the delivered timestamp with the same instant. There is
deliberately **no "Hoàn tất lúc" row**: `AdminOrderCompletionResponse` carries no
timestamp and neither does the order read, so it would have to come from the
browser's clock.

## 19. `COMPLETED` state

Read-only. No reopen, cancel, refund, edit-shipping, re-dispatch or
complete-again control — and none of them disabled either, because a disabled
control still claims the capability exists. The list of what is gone is rendered
so a reader can tell a decision from an oversight, and the closing sentence says
refund and cancellation have no Admin surface in this phase at all.

## 20. Error and refusal mappings

`model/fulfillment-failure.ts` classifies on the envelope's business `code` first
and the HTTP status band second, and **never** reads `normalized.message`. Each
classification selects one approved Vietnamese sentence; the server's text is
never rendered (asserted by test against a deliberately English fixture message).

| Server code / band | Classification | Surface |
|---|---|---|
| `ORDER_INVALID_TRANSITION` | `stale` | Dialog, with the *caller's* wording |
| `PAYMENT_*` refusals | via existing APP7 classifier | Unchanged APP7 dialogs |
| `SHIPPING_DETAIL_NOT_FOUND` | `shipping-missing` | Empty editor, not an error |
| `400` / `422` | `shipping-incomplete` | At the input |
| `SHIPPING_FROZEN` | `shipping-frozen` | Inline + read-only |
| `SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED` | `fee-acknowledgement-required` | Its own card |
| `SHIPPING_FEE_CHANGE_NOT_AVAILABLE` | `fee-change-unavailable` | Inline |
| `SHIPPING_FEE_NOT_APPLICABLE` | `fee-not-applicable` | Inline |
| `ORDER_REMAINING_PAYMENT_MISSING` | `remaining-missing` | Inline / dialog |
| `ORDER_REMAINING_PAYMENT_UNSATISFIED` | `payment-guard` | Dispatch dialog |
| `ORDER_SHIPPING_NOT_READY` | `shipping-not-ready` | Dispatch dialog |
| `401` | `unauthenticated` | Inline / dialog |
| `404` / `403` | `not-found` | Inline / dialog |
| `5xx`, no status, dropped | `unknown` | Generic, and the order is re-read |

`ORDER_INVALID_TRANSITION` is one code covering three catalog rows — a refused
`TR-LC14-05` (`820:60`), a dispatch replay (`820:90`) and a completion before
delivery (`820:95`). The server cannot distinguish them, but the **caller** knows
which command it sent, so each dialog passes its own `staleSentence`. That is why
the dispatch replay reads "không âm thầm giao lần thứ hai" and completion reads
"chỉ đơn đã giao mới hoàn tất được".

No page was created for any 409. A `5xx` or a dead connection is never reported
as a refusal: dispatch and completion are non-idempotent, so `unknown` reconciles
by re-reading rather than concluding the write did not happen.

## 21. Query and cache invalidation strategy

One new query key, `orderDetailKeys.shipping(orderId)`, nested under the order so
a dispatch can invalidate order + detail as one subtree without touching the
payments beside them. No second server-state library; no Zustand duplication of
server truth; no receipt is projected into any cache.

| Command | Invalidates | Deliberately not |
|---|---|---|
| `adminOrder_transition` | order detail, queue lists | shipping (not read in that stage), payments |
| `adminOrderShipping_save` | shipping detail | order (its status never moves), queue, payments |
| `adminOrder_dispatch` | shipping detail, order detail, queue lists | payments |
| `adminOrder_complete` | order detail, queue lists | shipping (frozen), payments |

The deposit payments are never invalidated by an APP9 command: none of them
touches the DEPOSIT obligation, its attempts, its evidence or its
reconciliations, and re-reading would re-request a customer's private payment
metadata to display bytes that did not change. The queue key is imported from the
queue feature rather than re-spelled. No broad `invalidateQueries()` across
unrelated Admin modules. No retry, no polling, no focus refetch.

## 22. Generated-client / curated export disposition

```text
packages/api-client/src/generated/*     UNCHANGED
packages/contracts/openapi/*            UNCHANGED
OpenAPI regeneration                    NOT RUN (no artifact is stale)
```

The five APP9 operations had no curated export — they were delivered
consumer-driven and A01 is their first consumer. One block was added to
`packages/api-client/src/index.ts` following the established pattern: the five
operation functions, four value enums (so the caller names a destination from the
contract rather than a literal) and eight response/body types.

`adminPaymentAttemptVerify` / `adminPaymentAttemptReview` were **not** re-exported
— they already cross for APP7 and are the same operations a balance is verified
through. `publicOrderShippingFee_acknowledge` was **not** exported: it is a
customer command and an Admin write may never mint the customer's
acknowledgement.

## 23. `FU-APP9-B03-01` — UI disposition

```text
UI_SIDE = ADDRESSED
BACKEND_DTO_DEBT = REMAINS OPEN
```

`PaymentDecisionResponse.depositObligationId` and `.depositStatus` are treated as
transport names throughout. The feature's view-model and component vocabulary is
semantic — "Thanh toán còn lại", "Trạng thái thanh toán" — and a test asserts that
neither transport spelling appears in the rendered rail. No generated type was
renamed and no backend contract was touched, so the DTO debt itself is **not**
closed.

## 24. `FU-APP9-B03-02` — disposition

```text
ACCEPTED_UI_DEGRADATION / BACKEND_FOLLOWUP_REMAINS
```

No already-existing accepted API resolves it: `adminOrderPayment_read` filters
`kind = 'DEPOSIT'` in SQL and `adminOrder_detail` returns no payment data. The
approved no-rich-REMAINING-panel limitation is preserved and drawn on screen.
Owner stays a later backend checkpoint.

## 25. Focused tests and exact counts

Two groups, **11 cases**, both green.

`apps/admin/test/components/order-queue-fulfillment.test.tsx` — **3 cases**

1. all five APP9 states render with the tone `808:4` draws;
2. the three unowned states stay neutral;
3. filtering by a fulfillment state sends the existing repeatable `status`
   parameter.

`apps/admin/test/components/order-fulfillment-workspace.test.tsx` — **8 cases**

1. `PRODUCTION_COMPLETED` calls `adminOrder_transition` with
   `{ to: 'AWAITING_FINAL_PAYMENT' }`, issues no shipping read, and renders no
   derived balance;
2. `AWAITING_FINAL_PAYMENT` renders the API gap, no attempt list, no
   verification control, and neither transport name;
3. `READY_FOR_DELIVERY` reads the detail and saves the **full nine-member**
   replacement body;
4. an emptied required field is refused before the round trip;
5. a fee increase without acknowledgement renders the approved refusal, shows no
   credential vocabulary, offers no override, disables dispatch, and restores
   locally without a second write;
6. dispatch moves to `DELIVERED` by re-reading and the detail becomes read-only
   with no tracking affordance;
7. a replayed dispatch renders its own approved refusal, not the server's English
   message, and marks nothing delivered;
8. completion moves to `COMPLETED` and every APP9 action disappears — not
   disabled, absent.

No backend acceptance test is duplicated: every assertion is about what the
screen renders or what body it sends.

## 26. Validation order

Followed §25 exactly:

```text
1  inspected the existing Admin orders implementation and the approved Figma
   (get_metadata + get_design_context on 809:4, 809:37, 809:95, 811:4, 811:37,
    812:4, 812:37, 812:109, 814:4, 815:37, 815:89, 815:124, 808:4, 820:47)
2  implemented
3  Prettier on changed frontend/test files
4  ESLint + type-check (api-client, admin)
5  fixed static issues
6  focused frontend tests
7  docs + report
```

| Command | Result |
|---|---|
| `npx prettier --write` (order-detail tree, order-status, api-client index) | passed — all unchanged |
| `pnpm --filter @embroidery/api-client typecheck` | **passed** |
| `pnpm --filter @embroidery/admin typecheck` | **passed** |
| `npx eslint src/features/order-detail src/shared/presentation/order-status.ts` | **passed** |
| `npx eslint src/index.ts` (api-client) | **passed** |
| `npx eslint .` (admin, `--max-old-space-size=8192`) | 1 error, **inherited** — see §29 |
| `npx prettier --write` (3 new test files) | 1 reformatted |
| `npx eslint` (3 new test files) | 3 errors → `--fix` → **passed** |
| `npx jest order-queue-fulfillment` | **passed** — 3/3 |
| `npx jest order-fulfillment-workspace` | **passed** — 8/8 |
| `npx jest` (9 existing order suites) | **passed** — 98/98 |
| `node tools/check-figma-design-index.mjs` | **passed** — 450 IDs, 450 rows, 21 tables |

## 27. Reruns, and the exact intervening change

Two reruns, both justified by a source change after the pass:

1. **`order-queue-fulfillment.test.tsx`** — first run 2/3. The filter case
   asserted against `order-queue-filter-toggle`, a control that does not exist
   (the filter is an always-open checkbox list), and omitted the explicit
   `rerender` the `APP7-A01` navigation-mock convention requires. The test file
   was corrected and rerun → 3/3.
2. **`order-fulfillment-workspace.test.tsx` + `order-queue-fulfillment.test.tsx`**
   — both passed (8/8, 3/3), then `eslint --fix` removed three unnecessary type
   assertions from `order-fulfillment-workspace.test.tsx` and
   `fulfillment-fixture.ts`. Test files changed after the pass, so the scope was
   rerun → 11/11.

No final combined confidence rerun was performed on any **test** scope.

One non-test rerun is recorded against itself: `node tools/check-figma-design-index.mjs`
was run once after the 36-row promotion and the §4.15 prose insertion (passing),
and then a second time after this report was written. That second run followed a
Markdown-only edit to a file the gate does not read, so it was **unnecessary** —
it is reported rather than omitted. Both runs returned the same result.

The 9 existing order suites were run **once**, and that run is not a rerun: it is
first coverage of a directly impacted scope, since `order-detail-screen.tsx` now
mounts the fulfillment rail.

## 28. Validations deliberately not run

Per §28, none of the following was run: full `pnpm test`, full Jest, all Admin
tests, all frontend tests, the Playwright suite, Docker, backend API integration,
payment backend tests, worker tests, database tests, APP9-E01, Storefront tests,
S01 tests, OpenAPI generation, API-client generation, any build.

`node tools/check-report-secrets.mjs` was **not** run: it takes no file arguments,
is inherited-red at HEAD on two APP6/APP9-G01 false positives (`FU-APP9-G01-01`),
and A01 changed no report content that could introduce a finding — every value in
this report and in the fixtures is synthetic. No credential, token or secret
appears anywhere in the change.

## 29. Non-blocking findings

1. **`FU-APP9-A01-01` — the shipping contract's nullable members are typed as
   objects.** `AdminShippingDetailResponse.feeAmount`, `.carrierName`,
   `.trackingCode`, `.ward`, `.district` and `.frozenAt` are declared
   `nullable: true, type: "object"` in the committed OpenAPI artifact, so Orval
   renders each `{ [key: string]: unknown } | null` instead of `string | null`.
   A01 narrows them at the feature seam with a real `typeof` check
   (`readOptionalText`) rather than a cast, and edits no generated file. The
   contract should declare them as nullable strings. **Owner: a later backend
   checkpoint.**
2. **Three approved figures are not backed by any delivered read.** Recorded
   rather than fabricated:
   - `809:76` and `809:102` draw the balance as "tổng đơn trừ tiền cọc đã thu".
     The A01 brief §9 forbids that subtraction and a `B04` fee increase falsifies
     it, so the approved API-gap treatment from `811:74` is rendered instead.
   - `812:96` draws "Khách đã xác nhận" as an **amount**. No contract member
     carries an acknowledged fee (`AdminShippingFeeOutcomeResponse.acknowledged`
     is a boolean, and only on a save receipt), so the row was omitted and the
     refusal card compares against the **stored** fee, which is what the server
     actually measures an increase against.
   - `808:46` / `808:47` draw `ĐÃ CỌC` and `CÒN LẠI` queue columns.
     `AdminOrderQueueItemResponse` publishes neither. Both were omitted.

   None is a design contradiction that blocks A01: each is a figure whose source
   does not exist, and the approved package already carries the API-gap treatment
   for exactly this case. **A design-index amendment or a backend read is the
   right resolution; owner is the PO / a later checkpoint.**
3. **`eslint .` on `apps/admin` OOMs at the default heap** and needs
   `--max-old-space-size=8192`. With that heap it reports **one inherited error**
   — an unused `UNKNOWN_REQUEST_STATUS_LABEL` import in
   `test/components/request-quotation-bootstrap.test.tsx`, an APP6 file A01 does
   not touch and which is unmodified in the working tree. Not introduced here and
   not fixed here (§30 forbids hijacking A01 for unrelated debt).
4. **RESOLVED BY `APP9-A01-C1`.** The first attempt left
   `packages/api-client/src/index.ts` at 1231 lines, over the CLAUDE.md §6
   400-line source limit, and proposed a later checkpoint. The Product Owner
   refused that disposition: it is handwritten source A01 modified, so A01 could
   not pass while it stood. `APP9-A01-C1` split the curated surface into eight
   domain barrels behind an unchanged root boundary — root `index.ts` is now 46
   lines and the largest barrel is 250. See
   `APP9-A01-C1-COMPLETION-REPORT.md`. **No debt item is carried forward.**
5. **`FU-ADMIN-SHARED-DIALOG-01` grows by one.** `FulfillmentConfirmDialog` reuses
   the existing in-feature `PaymentDialog` shell rather than adding an eighth
   hand-rolled dialog, so the count is unchanged — but the follow-up remains open
   and unowned.

## 30. Existing follow-ups

Untouched, as §30 requires: `FU-APP9-G01-01`, `FU-APP9-B01-01`, `FU-APP9-B01-02`,
`FU-APP9-B02-01`, `FU-APP9-W01-01`, `FU-APP9-B04-01`…`-04`, `FU-APP9-B04-C1-01`,
`FU-APP9-B05-01`, `FU-APP9-B05-02`, `FU-APP9-B05-03`, `IMP-O008`,
`FU-APP8-B04-02`.

Owned by A01: `FU-APP9-B03-01` (UI side addressed, §23) and `FU-APP9-B03-02`
(kept as accepted UI degradation, §24). One new follow-up opened:
`FU-APP9-A01-01` (§29.1).

## 31. Changed files

```text
M  docs/design/FIGMA_DESIGN_INDEX.md
     36 APP9 rows REVIEW_REQUIRED -> APPROVED_FOR_IMPLEMENTATION + evidence id
     + a Product Owner approval paragraph in §4.15
M  docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md
     roadmap only: A01 NEXT -> COMPLETE (+ evidence), S01 INCOMPLETE -> NEXT
A  docs/implementation/reports/APP9-A01-COMPLETION-REPORT.md

M  packages/api-client/src/index.ts                       curated APP9 block
     (later split by APP9-A01-C1 into eight domain barrels; see that report)

M  apps/admin/src/shared/presentation/order-status.ts     five APP9 tones/symbols
M  apps/admin/src/features/order-detail/components/order-detail-screen.tsx
M  apps/admin/src/features/order-detail/model/order-detail-keys.ts
M  apps/admin/src/features/order-detail/styles/order-detail.scss

A  apps/admin/src/features/order-detail/model/fulfillment-copy.ts
A  apps/admin/src/features/order-detail/model/fulfillment-capability.ts
A  apps/admin/src/features/order-detail/model/fulfillment-failure.ts
A  apps/admin/src/features/order-detail/model/shipping-detail-form.ts
A  apps/admin/src/features/order-detail/services/order-fulfillment.service.ts
A  apps/admin/src/features/order-detail/hooks/use-order-fulfillment.ts
A  apps/admin/src/features/order-detail/components/fulfillment-panel.tsx
A  apps/admin/src/features/order-detail/components/fulfillment-confirm-dialog.tsx
A  apps/admin/src/features/order-detail/components/open-final-payment-card.tsx
A  apps/admin/src/features/order-detail/components/remaining-payment-card.tsx
A  apps/admin/src/features/order-detail/components/locked-capability-list.tsx
A  apps/admin/src/features/order-detail/components/shipping-detail-editor.tsx
A  apps/admin/src/features/order-detail/components/shipping-detail-fields.tsx
A  apps/admin/src/features/order-detail/components/shipping-fee-card.tsx
A  apps/admin/src/features/order-detail/components/shipping-fee-refusal-card.tsx
A  apps/admin/src/features/order-detail/components/frozen-shipping-card.tsx
A  apps/admin/src/features/order-detail/components/dispatch-card.tsx
A  apps/admin/src/features/order-detail/components/completion-card.tsx
A  apps/admin/src/features/order-detail/components/settled-payment-card.tsx
A  apps/admin/src/features/order-detail/components/order-completed-card.tsx
A  apps/admin/src/features/order-detail/styles/_order-fulfillment.scss

A  apps/admin/test/support/fulfillment-fixture.ts
A  apps/admin/test/components/order-fulfillment-workspace.test.tsx
A  apps/admin/test/components/order-queue-fulfillment.test.tsx
```

No route file, database, migration, worker, OpenAPI source or generated file was
touched. `SCOPED_COMMAND_INDEX.md` was not modified: A01 registers no new command.

## 32. File-size check

Every file A01 created or modified is within CLAUDE.md §6:

```text
largest new/changed source   284  _order-fulfillment.scss
                             228  fulfillment-copy.ts
                             217  fulfillment-panel.tsx
                             213  shipping-detail-editor.tsx
                             204  use-order-fulfillment.ts
                                  ... limit 400, review threshold 300 — all under both

largest test                 316  order-fulfillment-workspace.test.tsx
                             151  fulfillment-fixture.ts
                             129  order-queue-fulfillment.test.tsx
                                  ... limit 600, review threshold 500 — all under both
```

`packages/api-client/src/index.ts` was the one exception at the time of the
first attempt (1231 lines). `APP9-A01-C1` resolved it — every handwritten
API-client source file is now `<= 250` lines. See §29.4 and the C1 report.

## 33. Roadmap

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
S01   NEXT
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. S01 was not begun.

## 34. Stop

```text
APP9-A01 = COMPLETE   (after APP9-A01-C1)
APP9-A01-C1 = PASS
FIGMA_APPROVAL = FIG-APPROVAL-APP9-D01-PO-001
APP9_FIGMA_ROWS_APPROVED = 36
NEW_ADMIN_ROUTES = 0
ADMIN_COMMERCE_COMPLETION_UI = DELIVERED
NEXT_CHECKPOINT = APP9-S01
NOT_PUSHED = true
```
