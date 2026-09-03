# APP12-A02-C1 — Origin-Aware Admin Order Read and Ready-Made Admin UI

```text
CHECKPOINT      = APP12-A02-C1
PARENT          = APP12-A02
PHASE           = APP12 — Hardening, UAT and Production Readiness
STATUS          = COMPLETE
DATE            = 2026-09-03
CORRECTION_USED = 1 / 1   (no C2)
NEXT            = APP12-H01
PUSHED          = false
```

---

## A. Verdict

`APP12-A02-C1` is **COMPLETE**, and `APP12-A02` is **COMPLETE_AFTER_C1**.

An operator can now complete a Ready-Made order end to end on the delivered
`/orders` and `/orders/[orderId]` screens: find it by origin, read its frozen
facts, price the shipping, correct that price, verify the customer's real bank
transfer, dispatch the parcel and close the order. Proved live, in real
Chromium, against a real stack on a disposable database — **6 / 6 journeys**.

The blocker the parent found is gone, and the collateral half of it with the
same change: `GET /api/admin/orders` no longer answers **HTTP 500** when a
Ready-Made order is on the page, which was breaking the queue for its **custom**
rows too.

```text
NEW_HTTP_OPERATIONS = 0
NEW_ADMIN_ROUTES    = 0
MIGRATIONS          = 38   (DB schema delta 0)
OPENAPI             = 125 paths / 138 operations / 278 schemas   (+1 schema)
PUBLIC_OPERATIONS   = 49                                          (unchanged)
RELEASE_MATRIX      = 28 DENY / 18 ALLOW / 3 SCOPE_GATED          (unchanged)
FIGMA               = unchanged (0 writes; 3 nodes re-opened, read only)
```

---

## B. The original blocked diagnosis, and what it got right

`APP12-A02` returned `BLOCKED_CONTRACT_GAP` with a live probe: 500 / 500 / 404 /
200 across the four Admin reads for a real Ready-Made order. Every measured fact
in that report held up under this correction — nothing in §D of the parent had
to be revised. What changed is only the **disposition**: the PO assigned the
boundary to this correction rather than to a new backend checkpoint, on the
`APP12-S03-C1` precedent.

The parent's sharpest finding is the one this correction is built around:
`adminPaymentAttempt_verify` accepted a `FULL` attempt after `APP12-B05`, but no
Admin read published the `attemptId` it is addressed by — a delivered command
with no reachable caller.

---

## C. Product Owner correction authority

```text
APP12-A02    = CORRECTION_REQUIRED
APP12-A02-C1 = AUTHORIZED
CORRECTION_USED = 1 / 1   (NO C2)
ROADMAP_LOCK = LOCKED     CHECKPOINTS = 38
APP12-H01    = NOT_AUTHORIZED  (not started)
```

No new checkpoint id was created, no `APP12-Bxx` was invented, and the roadmap
still holds 38 checkpoints.

---

## D. Backend source preflight

| Seam | State at entry | What it needed |
|---|---|---|
| `drizzle-admin-order-read.repository.ts` | `requireCustomChain()` threw on a `NULL` chain — called from `toQueueRow`, the queue's **per-row** mapper | an origin-aware mapper that keeps the assertion |
| `AdminOrderQueueFilter` | `statuses` only | `origins`, applied in SQL |
| `ORDER_STATUS_FILTERS` | 11 custom states; its own comment named `APP12-A02` as the owner of the widening | all 13 |
| `read-admin-order-payments.query.ts` | titled "One order's **DEPOSIT** payment vertical"; `findDepositObligation` filtered `kind = 'DEPOSIT'` in SQL | kind chosen from `orders.origin` |
| `OrderDepositContext` | `{ id, code, status }` | `origin` |
| `adminOrderShipping_read` / `_save` | already origin-aware (`APP12-B03`) | nothing |
| `adminPaymentAttempt_verify`, `_dispatch`, `_complete` | already reachable (`APP12-B05`) | nothing |

`packages/database` confirmed the physical truth was already there:
`ck_orders__custom_chain_by_origin` **forces** the three custom columns `NULL`
on a `READY_MADE` row, and `tg_order_items__origin_subject` does the same for a
line's `approval_snapshot_id`. No migration was needed and none was added.

---

## E. Origin source of truth

`orders.origin` (`COL-TBL043-12`), immutable under `tg_orders__origin_immutable`.

It is published on the queue item, the detail and the payment read, and it is
the **only** discriminator anything branches on. Every substitute the prompt
forbids is absent by construction, not by discipline:

- the **status** is never read as an origin — the two Ready-Made states are now
  in the shared vocabulary and nothing keys off them;
- a **missing `customRequestId`** is a *consequence* of the origin, and the
  Admin screen's branch (`order-detail-screen.tsx`) compares `order.origin`
  against one constant;
- the **payment kind** is chosen *from* the origin (`COLLECTED[origin]`), never
  the reverse — which matters because a Ready-Made order before its first
  shipping fee has **no obligation at all**, so inferring the origin from the
  obligation would make "not priced yet" indistinguishable from "wrong shape".

---

## F. Queue contract widening

`adminOrder_list`, widened in place. No second list operation.

| Change | Detail |
|---|---|
| `origin` published | `AdminOrderQueueItemResponse.origin`, required, enum `CUSTOM \| READY_MADE` |
| `origin` filter | repeatable query parameter, same convention as `status[]` |
| status vocabulary | 11 → **13** (`AWAITING_SHIPPING_FEE`, `AWAITING_PAYMENT`) |
| custom chain | `customRequestId` now optional; `origin` says when it is present |
| invented states | none — no `PAID`, no `EXPIRED`, asserted in both the request spec and the contract spec |

`ORDER_STATUS_FILTERS`'s exhaustiveness proof now runs against `OrderState`, the
whole column vocabulary, so a state added to the database later fails to compile
rather than silently going unpublished.

---

## G. Queue mapper fix

`requireCustomChain()` was **not deleted**. It was given the discriminator it had
always been implicitly asserting against, and moved into
`admin-order-row.mapper.ts` (§52 — split by responsibility, not by line count).

`customChainField(origin, value, column)` enforces the CHECK constraint in
**both** directions: a `CUSTOM` row missing the value is corrupt, and a
`READY_MADE` row carrying one is corrupt the other way — which is worth catching
too, because publishing that id would send an operator to a design case
belonging to someone else.

```text
READY_MADE → customRequestId, acceptedQuotationVersionId,
             currentApprovalSnapshotId, items[].approvalSnapshotId = undefined
```

No sentinel UUID, no placeholder request, no fabricated snapshot, no empty
string. The absence is the truth, and `origin` is what makes it legible.

---

## H. Origin filter

Applied in SQL, in the same `where` as the status predicate and **before** the
keyset page is cut:

```ts
if (filter.origins !== undefined) {
  conditions.push(inArray(orders.origin, [...filter.origins]));
}
```

A filtered page is therefore a full page whose cursor pages over the filtered
set. `admin-ready-made-order-read.integration.spec.ts` proves that specifically
with `limit=1` over a filtered set: the first page is full, `hasNext` is true,
and the second page is a *different* row — which a page cut before filtering
could not produce.

**A defect the live tier caught.** `orderQueueKeys.list()` carried the statuses
but not the origins, so an origin change addressed the **same cache entry**: the
URL updated, the request never fired, and the queue kept serving the previous
predicate's page. It looked exactly like a broken filter and was invisible in
the component. Fixed, and the key's doc now states the rule that every filter
reaching the wire must be in the key.

---

## I. Detail contract widening

`adminOrder_detail`, widened in place. `origin` required; `customRequestId`,
`acceptedQuotationVersionId`, `currentApprovalSnapshotId` and
`items[].approvalSnapshotId` optional; the facts every order has —
`orderId`, `code`, `status`, `customerId`, `totalAmount` — still required, and
asserted as still required so the widening cannot quietly loosen the rest of the
row.

The prompt's §12 offered a discriminated union or a small nullable widening. The
widening was chosen, with the condition §12 attaches: **origin-specific tests**.
`admin-order.contract.spec.ts` asserts `origin` required and the chain optional;
the integration suite asserts a CUSTOM order still carries all four values and a
READY_MADE order carries none.

---

## J. Ready-Made item and deadline read

Items come from the frozen `order_items` snapshot `APP12-B02` wrote. No live
Catalog table is read anywhere in the repository — the file's own header states
that and the statements still name only `orders` and `order_items`.

`paymentDeadline` is the **reservation's own committed `expires_at`**, read
through `SkuStockRepository.findActiveOrderReservation` — the exact lock-free
selector `APP12-B04` gives the customer. Never `now + 24h`, never the newest row
of a history, never derived from the order's timestamps. Absent once nothing
`RESERVED` stands, and the integration suite proves that by driving the order to
verification (which **consumes** the hold) rather than by writing a status.

No `FOR UPDATE`: an Admin report holding that row would queue the expiry sweep
and the operator's own fee confirmation behind it.

---

## K. Admin payment read generalization

`adminOrderPayment_read`, widened in place. **No FULL-specific operation.**

```ts
const COLLECTED = {
  CUSTOM:     { kind: 'DEPOSIT', reference: depositTransferReference },
  READY_MADE: { kind: 'FULL',    reference: fullTransferReference },
};
```

One table keyed on the order's discriminator rather than two keyed on different
things, so a kind and a memo builder cannot be paired wrongly — there is no row
in which `FULL` could acquire the deposit's `…DC` memo. `REMAINING` is
unreachable through it, preserving `APP7-B04`'s rule that this surface never
presents the balance as payable.

**CUSTOM is unchanged in behaviour.** The DEPOSIT is still the only kind offered,
the same figures, the same attempts, the same reconciliations — proved by
`admin-payment-verification.integration.spec.ts`, whose 17 cases pass unmodified
in meaning.

**READY_MADE before the fee answers `200`**, with `currentObligation` absent and
empty attempt and reconciliation lists. Nothing is fabricated to fill the gap:
no provisional obligation, no zero amount, no placeholder reference. That is the
`404 ORDER_NOT_FOUND` the parent measured, and removing it is what makes the
detail screen renderable in its first state.

---

## L. Current FULL selection

`uq_payment_obligations__order_kind__live` is partial on `PENDING` and
`SATISFIED`, so `findLiveObligation(orderId, kind)` is single-valued **by
construction**. There is no "latest row wins", no "highest id", no "newest
`created_at`" anywhere in the file — after a fee correction the predecessor is
`SUPERSEDED` and therefore not live, so it cannot be returned even by accident.

That is the same arbiter `APP12-B04` uses for the customer, reached through the
same index.

---

## M. Attempt and evidence authority

`attempts` are listed from the **live obligation's own id**. The current attempt
is therefore addressable — `payments.attempts.at(-1)` on an oldest-first list —
and `adminPaymentAttempt_verify` has a caller for the first time.

Evidence rides on each attempt exactly as `APP7-B04` publishes it, and the
delivered `PaymentEvidenceList` and `adminPaymentEvidence_get` are reused
unchanged. `assetStatus` remains supporting-only: the panel states in its own
copy that an accepted image does not mean money arrived.

---

## N. Superseded isolation

Because the attempt list is keyed on the live obligation's id, a predecessor's
attempts are **not in the response at all**. The isolation is a property of the
query, not a filter a screen has to remember to apply — and `selectActionableAttempt`
therefore cannot select a stranded attempt even in principle.

Proved three ways:

- **integration** — FULL A with attempt A, a fee correction, then FULL B: `A` is
  `SUPERSEDED`, `B` is `PENDING`, `afterRead.attempts` is empty and does not
  contain attempt A. Asserted per obligation against committed rows, because a
  count across the order cannot tell a supersede from a duplicate.
- **contract** — the read's own documentation states that a client must not
  compare transfer references to identify the current obligation: a correction
  leaves the memo unchanged (it derives from the order code), so **both**
  obligations carry the same one. The integration suite asserts that equality
  explicitly, so the trap is recorded rather than merely avoided.
- **live** — journey C.

---

## O. CUSTOM compatibility

| Surface | Result |
|---|---|
| `admin-payment-verification.integration.spec.ts` | **17 / 17** — deposit read, exact-match verification, replay, review routing, terminal integrity |
| `admin-order-queue.integration.spec.ts` / `-detail` | **20 / 20** — the frozen custom facts, the keyset page, the status filter |
| `admin-order-delivery.integration.spec.ts` | **10 / 10** — dispatch, completion, both replays |
| Admin component suites | **114 / 114** order tests, including the DEPOSIT workbench, the REMAINING workflow and the shipping acknowledgement |
| `PaymentDecisionResponse` | field names unchanged; `depositStatus` keeps its `APP7-B04` name and now describes whichever obligation the decision acted on |

One deliberate behavioural correction, in `payment-decision-outcome.ts`: the
"verified" rule required `orderStatus === 'DEPOSIT_PAID'`, which is not portable
— a verified `REMAINING` lands on `READY_FOR_DELIVERY` (`APP9-B03`) and so does a
verified `FULL`. The literal made **every non-deposit success fall through to
`recorded` and announce nothing**, which was already wrong for APP9. The rule is
now the two facts this module can judge without owning a lifecycle: the attempt
`SUCCEEDED` and the obligation `SATISFIED`. A kind → destination table in the
browser was explicitly rejected — that is LC-14, and a copy of it here would be
a second lifecycle authority.

---

## P. OpenAPI and client delta

```text
paths       125  → 125   (0)
operations  138  → 138   (0)
schemas     277  → 278   (+1: AdminPaymentObligationResponse)
public ops   49  →  49   (0)
release      28 DENY / 18 ALLOW / 3 SCOPE_GATED  (unchanged, gate green)
```

Regenerated through `openapi:generate`, verified current by `openapi:check`, and
the client regenerated through `api-client generate` and verified by
`check:generated` (tree hash matches). No generated file was hand-edited.

The curated boundary released the new value enums as **values** —
`AdminOrderListOriginItem`, `AdminOrderQueueItemResponseOrigin`,
`AdminOrderDetailResponseOrigin`, `AdminOrderPaymentsResponseOrigin`,
`AdminPaymentObligationResponseKind/Status` — so a screen compares against the
contract rather than a string literal that would compile just as well misspelled.

`orders-and-payments.ts` was **split** along the boundary that was already its
internal structure: `admin-orders-and-payments.ts` (behind
`AuthenticatedAdminGuard`, consumed by Admin) and `orders-and-payments.ts`
(secure-link customer surfaces, consumed by Storefront). Both are re-exported
from the package index, so no consumer's import path changed. The split also
brought the file back under the 400-line limit it had already been over at HEAD.

---

## Q. Backend real-database evidence

`apps/api/test/integration/admin-ready-made-order-read.integration.spec.ts` —
**13 / 13**, disposable PostgreSQL with all 38 migrations, real `AppModule`,
real `AuthenticatedAdminGuard`, orders created by the production
`publicReadyMadeOrder_create` command and priced through the production
`adminOrderShipping_save`.

| Case | Proves |
|---|---|
| mixed page | the Ready-Made row renders **and the custom row beside it still does** — seeded through `OrderRepository.createFromAcceptedQuotation`, the production writer |
| origin filter | READY_MADE only, CUSTOM only, and the union equals both |
| filtered paging | `limit=1` over a filtered set gives a full page and a cursor that walks the filtered rows |
| status vocabulary | `AWAITING_SHIPPING_FEE` filters; `PAID` and a malformed origin are refused `400` |
| detail | origin, frozen SKU line, no fabricated chain, no approval id |
| deadline | equals the reservation row byte for byte; absent once the hold is consumed |
| payment before fee | `200`, no obligation, no attempts, and **zero** obligation rows written |
| payment after fee | the persisted FULL amount, `…FL` memo asserted `/FL$/` and `!/DC$/` |
| current attempt | the id a real customer initiation created |
| supersession | A `SUPERSEDED`, B `PENDING`, A's attempt absent from B, same memo on both |
| satisfied | verify → `READY_FOR_DELIVERY`, obligation `SATISFIED`, reconciliation retained |
| lane | no `DEPOSIT` and no `REMAINING` ever presented for a Ready-Made order |

---

## R. D01 re-open proof

The parent could not re-open Figma (`figma-desktop` `ConnectionRefused`). The
operator authorized the remote Figma MCP server for this correction, and all
three nodes were re-opened and read **before any UI was written**, as §36
requires:

| Registry id | Node | Read |
|---|---|---|
| `FIG-APP12-A03-ORDER-QUEUE-DESKTOP` | `912:337` | ✅ `get_design_context` |
| `FIG-APP12-A03-ORDER-DETAIL-DESKTOP` | `913:337` | ✅ `get_design_context` |
| `FIG-APP12-A03-WORKBENCH-PANELS` | `914:361` | ✅ `get_design_context` |

All three remain `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP12-D01-PO-001`. **Read only** — no node was created, moved or
edited. `FIGMA_DELTA = 0`, and `check-figma-design-index.mjs` passes
(553 registry IDs, 553 node rows).

`FU-APP12-A02-04` is **closed** by this.

### One deliberate deviation from the drawing, and why

`913:337` draws `Tổng khách phải trả` filled in beside a fee the operator has
only *typed*. Rendering that requires adding the merchandise subtotal to the
entered fee **in the browser**, which §18 and §40 forbid outright — the payable
total is the `FULL` obligation's own frozen column, and until the save commits
there is no obligation to read it from.

So the row is present and named, and its value reads `Chưa xác định` until the
server has one; after the save it shows the obligation's amount, read back. The
contract rule wins over the mock, and the deviation is recorded here rather than
resolved silently. Recorded as `FU-APP12-A02-C1-02` for `APP12-V01` to rule on.

---

## S. Queue UI

`/orders`, extended. `NEW_ADMIN_ROUTES = 0`.

- **`Nguồn đơn` fieldset** — a second `fieldset` of native checkboxes in the
  existing filter bar, the same control as the status filter, exactly as
  `912:337` draws it and as its own note on the screen says. Not a segmented
  toggle, not a select, not a new kind of control.
- **`Nguồn` column** — the existing `AdminStatusBadge`, `◆ Bán sẵn` and
  `✎ Thêu riêng`. Symbol **and** word as well as tone, so the two origins stay
  distinguishable without colour.
- **server-side** — the selection goes on the wire as a repeatable `origin`
  parameter and is in the cache key.
- a Ready-Made row's `Yêu cầu` cell states the absence (`—`) rather than
  offering a link to `/requests/undefined`.

The `colgroup` was re-proportioned so eight columns fit without a horizontal
scrollbar; no column was dropped.

---

## T. Ready-Made detail UI

`/orders/[orderId]`, branched on `order.origin` and nothing else. The screen
picks between two named compositions rather than threading a switch through
every card (§52):

```text
CustomOrderColumns     — the delivered APP7/APP9 composition, extracted verbatim
ReadyMadeOrderColumns  — frozen facts · SKU lines | fee card · FULL workbench · rail
```

Custom-only panels are **not mounted** — not hidden, not disabled, not rendered
empty. The absence is *structural*: no quotation, design-version, approval,
production, REMAINING or provenance component is imported into the Ready-Made
subtree at all. The frozen-facts card states the omission in one sentence
(`BR-031`) instead of drawing four empty cards.

```text
custom_only_panels_on_READY_MADE = 0
```

---

## U. Shipping UI

Reuses `adminOrderShipping_read` and `adminOrderShipping_save`. No shipping-fee
endpoint was added.

- **`NULL` is not zero** — an unpriced order opens the field **empty**; a saved
  `0.00` shows `0` and means free delivery. The field's own help says so.
- **decimal strings end to end** — typed as text with `inputMode="decimal"`,
  carried as text, submitted as text. No `Number`, no `parseFloat`, no `toFixed`
  anywhere on the path.
- **full replacement** — the `PUT` body is the whole record, built by the
  delivered `toSaveShippingBody`.
- **correction warns** — the successor warning says the predecessor is replaced
  and its payment link stops working, and deliberately does **not** say the
  customer gets longer to pay. The component test asserts the absence of
  `/gia hạn|thêm thời gian|kéo dài/`, and so does the live journey.
- **after settlement, refused** — `BR-028`: the control is *gone* and the card
  states the rule and the legitimate path (cancellation/refund), rather than a
  disabled input with no explanation.

The three states live in `ready-made-fee-stage.ts`, a pure function that reads
the **obligation's** LC-15 state rather than the order's LC-14 status — because
that is what `BR-028` is about, and because a superseded/successor pair does not
move the order status at all.

---

## V. FULL workbench

The deposit workbench's `FULL` variant, not a second workbench. The
reconciliation dialog, the evidence list and the decision hook are the
**delivered APP7 components**, reused unchanged.

Every figure is the server's: the obligation's own frozen amount and the memo
the server derived for that kind. Nothing adds a subtotal to a fee, subtracts a
deposit or re-derives a total.

"No obligation yet" is rendered as a state, not an error.

**A defect the live tier caught.** The panel first gated the dialog on "is there
still an actionable attempt" — so a verification that *succeeded* unmounted the
dialog at the exact moment it had an outcome to report: the operator would
submit and watch the confirmation vanish. It now holds the **attempt id**
captured when the dialog opened, which is what the delivered deposit card does
and for this reason. A component test locks it.

---

## W. Evidence and review

Reuses `PaymentEvidenceList` and `adminPaymentEvidence_get`. Evidence is
supporting material: the panel says in its own copy that an accepted image does
not mean money arrived, and no code maps `assetStatus` to a payment fact.

Only the current attempt's evidence is reachable, because only the current
obligation's attempts are in the response. A predecessor's evidence cannot
migrate to a successor.

The `REQUIRES_REVIEW` path is the delivered one, reached through the same dialog
— and the live run exercised it accidentally and instructively before the
observed amount was corrected: the server recorded a durable business outcome and
the screen reported it as one, never as "xác nhận thất bại".

---

## X. Verification UI

Reuses `adminPaymentAttempt_verify`, addressed by the attempt id the widened
read publishes. Expected values come from the Admin payment read authority; the
operator transcribes the observed ones from a bank statement, and nothing
prefills one from the other.

No optimistic paid state. After a decision the screen re-reads and renders what
committed.

---

## Y. Fulfilment UI

The APP9 rail, two rungs shorter:

```text
AWAITING_SHIPPING_FEE ─┐  nothing (the precondition is stated, not left blank)
AWAITING_PAYMENT      ─┘
READY_FOR_DELIVERY    →  adminOrder_dispatch
DELIVERED             →  adminOrder_complete
COMPLETED             →  read-only
```

`DispatchCard`, `CompletionCard`, `FrozenShippingCard` and `OrderCompletedCard`
are the delivered APP9 components, unchanged. No production step (`BR-030`) and
no remaining-payment step (`BR-029`) — **absent**, not greyed out, because a
disabled control is still a claim that the action exists.

No tracking UI anywhere: carrier and tracking are the operator's own stored
notes, and there is no lookup, ETA, map or polling on the screen.

---

## Z. Negative matrix

| Case | Result |
|---|---|
| dispatch from `AWAITING_PAYMENT` | control absent — the rail states the precondition |
| complete from `READY_FOR_DELIVERY` | control absent until `DELIVERED` |
| fee edit after `FULL SATISFIED` | refused with the rule and the path (`BR-028`) |
| verify a superseded attempt | impossible — it is not in the response |
| terminal order mutation | every control absent at both viewports |
| dispatch / complete replay | the delivered APP9 refusals, unchanged |
| unknown origin / `PAID` status in the URL | dropped before the request; `400` from the server |

Journey F asserts the terminal case at **both** viewports, and that no reopen,
refund or cancel control was invented.

---

## AA. CUSTOM UI regressions

```text
apps/admin  →  1918 passed / 1924   (6 failed)
```

The 6 failures and their 5 suites are **identical at HEAD** — verified by
stashing every change and re-running. They are the pre-existing Admin
boundary-test failures inherited from `APP12-A01`; none is in a file this
correction touched. Net effect of this correction on the Admin suite: **+17
passing tests, 0 new failures.**

The 114 order-feature tests pass in full, including the DEPOSIT workbench, the
REMAINING workflow, the shipping acknowledgement, dispatch and completion.

---

## AB. Live Playwright

```text
pnpm --filter @embroidery/e2e-testing e2e:app12:a02
6 passed (14.2s)
```

| Journey | Proves |
|---|---|
| **A** mixed queue | the Ready-Made row renders (the 500 is gone); `Nguồn` column and labelled fieldset; the origin filter is the **server's** — asserted through the URL and through the row leaving the page |
| **B** before the fee | detail renders; deadline and delivery facts; omission stated; no custom-only panel; no fabricated total; empty fee field; first fee → `AWAITING_PAYMENT` + `FULL PENDING`, read back from the database |
| **C** correction | FULL A `SUPERSEDED`, FULL B `PENDING`, exactly two obligations, the successor's amount on screen, the warning present and free of any deadline claim |
| **D** verification | a **real customer attempt** through the delivered secure surface; the Admin screen publishes its id; verify → `READY_FOR_DELIVERY` + `SATISFIED`; fee edit then refused; the verify control gone |
| **E** fulfilment | dispatch → `DELIVERED` with shipping frozen; complete → `COMPLETED`; no production job; the reservation no longer `RESERVED` |
| **F** negative | every mutation absent at **1440 and 1024**; one `h1`; no horizontal overflow |

The new `--app12-a02` mode rides the `APP12-S03` topology exactly — the same
disposable database, API, worker, Storefront, Admin, gateway and object storage
— because the two checkpoints need the same commercial universe and differ only
in which screen is under test.

**The suite calls no Admin API directly.** Every operator write goes through a
control a person can click; the checkpoint's claim is that an operator can
complete a Ready-Made order, and a harness that posted to the API would only
re-prove the contract the backend half already proves.

### What this tier does not prove, and what does

The live topology contains **no custom order** — creating one needs the whole
APP5 → APP6 chain, which no e2e fixture builds. So the *collateral* half of the
defect (a canonically written custom order still rendering beside a Ready-Made
one) is proved by the **integration** suite, which seeds one through
`OrderRepository.createFromAcceptedQuotation`. That is stronger evidence than
this tier could produce, not weaker: a fabricated `orders` row here would prove
the fixture. The spec says so at the assertion.

---

## AC. Database, MinIO and shared-dev hygiene

```text
validation                = DISPOSABLE
disposable_db_removed     = true    ("cleanup verified … disposable database dropped")
disposable_minio_removed  = true    (the run's object storage, torn down with it)
G03_data_created          = false
```

Shared development database, read directly after the final run:

```text
orders where origin='READY_MADE'      = 0
payment_obligations where kind='FULL' = 0
payment_attempts                      = 0
payment_transfer_evidence             = 0
shipping_details                      = 0
shared_dev_residue                    = 0
```

> **Pre-existing, recorded not removed (§50).** 15 orphaned `embroidery_db7_*`
> databases from earlier checkpoints' crashed race suites remain on the dev
> PostgreSQL server. They predate this session; this correction created none of
> them and, per §50, deleted none. Carried as `FU-APP12-A02-03`.

---

## AD. Route, release and Figma freeze

| Dimension | Expected | Measured | Δ |
|---|---|---|---|
| Admin routes (`page.tsx`) | 26 | **26** | 0 |
| Storefront routes | 20 | **20** | 0 |
| Storefront source | unchanged | **0 files changed** | 0 |
| OpenAPI paths / operations | 125 / 138 | **125 / 138** | 0 |
| OpenAPI schemas | measured | **278** | +1 |
| Public operations | 49 | **49** | 0 |
| Release matrix | 28 / 18 / 3 | **28 / 18 / 3** (gate green) | 0 |
| Migrations | 38 | **38** | 0 |
| DB schema | unchanged | unchanged | 0 |
| Figma | unchanged | **0 writes** | 0 |

---

## AE. Files changed

**72 paths.** 18 new, the rest modified.

| Area | Files |
|---|---|
| API — order read | `admin-order-read.repository.ts`, `drizzle-admin-order-read.repository.ts`, **`admin-order-row.mapper.ts`** (new), `read-admin-order-queue.query.ts`, `read-admin-order-detail.query.ts`, `admin-order.request.ts`, `admin-order-queue.response.ts`, `admin-order-detail.response.ts`, `admin-order.controller.ts`, `admin-order.module.ts` |
| API — payment read | `admin-payment-read.repository.ts`, `drizzle-admin-payment-read.repository.ts`, `read-admin-order-payments.query.ts`, `admin-payment.view.ts`, `admin-payment.response.ts`, **`admin-payment-obligation.response.ts`** (new), `admin-order-payment.controller.ts`, `order-deposit-context.port.ts`, `drizzle-order-deposit-context.adapter.ts` |
| API — tests | **`admin-ready-made-order-read.integration.spec.ts`** (new), **`admin-payment-obligation.contract.spec.ts`** (new), plus 6 updated specs |
| Contracts / client | `openapi.generated.json`, both generated client files, `orders-and-payments.ts`, **`admin-orders-and-payments.ts`** (new), `index.ts` |
| Admin — shared | **`order-origin.ts`** (new), `order-status.ts` |
| Admin — queue | filters model, keys, rows, copy, hook, filter bar, table, screen, SCSS |
| Admin — detail | **6 new components**, **2 new models**, **1 new SCSS partial**, plus 7 updated files |
| Admin — tests | **`order-ready-made-branch.test.tsx`** (new), 3 updated |
| E2E | **`a02-admin-order-branch.acceptance.spec.ts`** (new), **`a02-world.ts`** (new), orchestrator, Playwright config, package script |

---

## AF. File-size evidence

```text
before: 81 hard-limit violations
after:  80 hard-limit violations
```

**One fewer than at HEAD, and none in a file this correction touched.** Three
files were split by responsibility rather than by line count:

| File | Was | Now | Split |
|---|---|---|---|
| `admin-payment.response.ts` | 427 (FAIL) | 353 | obligation DTO → its own module |
| `admin-payment.contract.spec.ts` | 619 (FAIL) | 580 | obligation assertions → their own suite |
| `orders-and-payments.ts` | 458 (FAIL at HEAD: 410) | 264 | Admin / customer halves |

The Drizzle order-read repository did **not** become an origin-switch monolith:
its mapper moved out to `admin-order-row.mapper.ts` (148 lines).

Every other touched file is inside its limit; the new integration spec is 567
lines against the 600 test limit (above the 500 review threshold, recorded).

---

## AG. Validation

Selected from `VALIDATION_GOVERNANCE.md` §3 for what this correction actually
changed.

| Command | Result |
|---|---|
| `git diff --check` | **PASS** |
| `@embroidery/api typecheck` | **PASS** |
| `@embroidery/api lint` | 4 errors — **identical at HEAD**, none in touched files |
| `@embroidery/api build` | **PASS** |
| `openapi:generate` / `openapi:check` | **PASS** — 125 / 138 / 278, artifact current |
| `@embroidery/api-client generate` / `check:generated` | **PASS** — tree hash matches |
| `@embroidery/api-client typecheck` / `lint` / `jest` | **PASS** — 53 / 53 |
| Admin order contract + request + projection specs | **PASS** |
| Admin payment + obligation contract specs | **PASS** — 29 / 29 |
| Lifecycle / shipping / delivery contract specs | **PASS** |
| Release-gate contract | **PASS** — 28 / 18 / 3 |
| `admin-ready-made-order-read.integration` | **PASS** — 13 / 13 |
| `admin-payment-verification.integration` | **PASS** — 17 / 17 |
| `admin-order-queue` / `-detail.integration` | **PASS** — 20 / 20 |
| `admin-order-delivery.integration` | **PASS** — 10 / 10 |
| Combined backend sweep | **PASS** — 14 suites, **159 / 159** |
| `admin typecheck` / `lint` / `build` | **PASS** |
| `admin jest` (full) | 1918 / 1924 — **6 failures identical at HEAD** |
| `admin jest test/components/order*` | **PASS** — 126 / 126 |
| `@embroidery/e2e-testing typecheck` / `lint` / `check:e2e` | **PASS** — 138 tests collect |
| `e2e:app12:a02` (1440 + 1024) | **PASS** — **6 / 6** |
| `check-file-size.mjs` | 80 violations — **one fewer than HEAD**, none mine |
| `check-category-source-of-truth.mjs` | **PASS** — 2543 files |
| `check-figma-design-index.mjs` | **PASS** — 553 registry IDs |
| Admin route count | **26** |
| `prettier --check` (63 changed files) | **PASS** |
| Shared-dev residue query | **0 / 0 / 0 / 0 / 0** |

**Deliberately not run**: full monorepo, the Storefront suite (0 Storefront files
changed), global UAT, performance, and any Figma write.

### Pre-existing failures, recorded not absorbed

Three stale contract assertions were **red at HEAD** and sit in specs §53
requires this correction to run, so they were corrected in place with the reason
stated at the assertion:

- `admin-order.contract.spec.ts` — operation inventory missing the four
  `APP9-B04`/`B05` routes;
- `admin-order-lifecycle.contract.spec.ts` — an unscoped regex catching
  `APP9-B02`'s three **public** final-payment paths; now scoped to `/api/admin/`
  with the public lane still checked for the right property;
- `admin-order-shipping.contract.spec.ts` — a `dispatch|complete` bound that
  predates `APP9-B05`; the two delivered paths are now named, so a *third* would
  still fail.

Everything else red at HEAD was left alone: 4 API ESLint errors, 2 APP9-B04
acknowledgement integration cases, the APP7-B06 evidence contract case, and the
6 Admin boundary tests.

---

## AH. Follow-up reconciliation

**Closed:**

```text
FU-APP12-A02-01 = CLOSED_BY_APP12_A02_C1   (Admin read CUSTOM-only → origin-aware)
FU-APP12-A02-02 = CLOSED_BY_APP12_A02_C1   (11 BLOCKING_MISSING facts → 0)
FU-APP12-A02-04 = CLOSED_BY_APP12_A02_C1   (D01 nodes re-opened)
```

**Kept:**

| Id | Disposition |
|---|---|
| `FU-APP12-A02-03` | 15 orphaned disposable databases. `NONBLOCKING_DEFER` → operator hygiene / `APP12-H02`. Recorded only, per §50. |
| `FU-APP12-A01-01`, `-02`, `-04` | → `APP12-H01`, unabsorbed |
| `FU-APP12-A01-03` | → `APP12-V01`, unabsorbed |

**New:**

| Id | Finding | Disposition |
|---|---|---|
| `FU-APP12-A02-C1-01` | `openFullPaymentAttempt` in `a02-world.ts` mirrors the private `openAttempt` in `s03-journeys.acceptance.spec.ts`. Lifting the original into shared support would edit a delivered acceptance spec this correction has no business touching. | `NONBLOCKING_DEFER` → `APP12-E01` |
| `FU-APP12-A02-C1-02` | `913:337` draws the payable total previewed from a typed fee; §18/§40 forbid composing it in the browser, so the row reads `Chưa xác định` until the server has an obligation. | `APP12-V01` to rule on |

No unrelated S03/B05/B04/B03/category/tooling debt was absorbed.

---

## AI. Parent report correction notice

`docs/implementation/reports/APP12-A02-COMPLETION-REPORT.md` is **preserved
unedited** as the record of the blocked audit, with a correction notice appended
at its head pointing here.

---

## AJ. Roadmap

```text
APP12-A02-C1 = COMPLETE
APP12-A02    = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1   (NO C2)
APP12-H01    = NEXT       (not started)
ROADMAP_LOCK = LOCKED
CHECKPOINTS  = 38
```
