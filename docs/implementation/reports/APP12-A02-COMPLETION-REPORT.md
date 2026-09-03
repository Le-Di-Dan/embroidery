# APP12-A02 — Admin Ready-Made Order Branch — Completion Report

> ## Correction notice — superseded by `APP12-A02-C1` (2026-09-03)
>
> This report is preserved **unedited** as the record of the blocked audit. Its
> diagnosis was accepted in full by the Product Owner and every measured fact in
> it held up; what changed is the disposition.
>
> The initial `APP12-A02` contract audit correctly blocked because the Admin read
> surface was CUSTOM-only and the payment read was DEPOSIT-only.
>
> The Product Owner authorized `APP12-A02-C1` under the locked-roadmap correction
> rule rather than inventing a new backend checkpoint.
>
> C1 widened the existing Admin reads origin-aware, regenerated the
> contract/client, then completed the originally approved A02 UI and live
> acceptance.
>
> ```text
> APP12-A02       = COMPLETE_AFTER_C1
> CORRECTION_USED = 1 / 1   (no C2)
> ```
>
> See [`APP12-A02-C1-COMPLETION-REPORT.md`](./APP12-A02-C1-COMPLETION-REPORT.md).
> Nothing below this line has been altered.

```text
CHECKPOINT      = APP12-A02
PHASE           = APP12 — Hardening, UAT and Production Readiness
STATUS          = BLOCKED_CONTRACT_GAP  →  COMPLETE_AFTER_C1 (see notice above)
DATE            = 2026-09-03
CORRECTION_USED = 0 / 1  →  1 / 1
NEXT            = APP12-A02 (unchanged — the checkpoint did not complete)
PUSHED          = false
```

---

## A. Verdict

`APP12-A02` is **`BLOCKED_CONTRACT_GAP`**.

The mandatory §4 contract audit found that **no operation in the published API —
Admin or public — exposes `order.origin` in any form, and none accepts an origin
filter.** Acceptance criteria 5 and 6 require a server-authoritative origin
column, an origin filter and a detail branch keyed on `order.origin`; §7 and §9
forbid every substitute (status, null custom ids, payment kind). There is no
fact on the boundary to branch on.

That is the smallest of three independent blockers. The larger two are worse
than "a field is missing":

1. **The delivered Admin order queue returns HTTP 500 as soon as one
   `READY_MADE` order exists.** Not the Ready-Made half — the whole page,
   including its CUSTOM rows. Proved live, §X.
2. **`adminOrderPayment_read` is DEPOSIT-only in SQL**, so the `FULL`
   obligation, its current attempt, its expected transfer reference and its
   evidence are unreachable from Admin. `adminPaymentAttempt_verify` *does*
   accept a `FULL` attempt (`APP12-B05`) — but no Admin read publishes the
   `attemptId` it is addressed by, so the delivered verify command has no
   reachable caller. Proved live, §X.

`APP12-A02` is `Axx` — **Admin UI only**, `API Δ 0 / migrations 0 / routes 0`
(phase plan §0.6, C1 audit §Q row `A02`). Prompt §4 and §34 say the same: block,
do not repair backend, do not widen contracts. So the checkpoint stops here.

```text
FILES CHANGED       = 1 (this report)
NEW_ADMIN_ROUTES    = 0
NEW_HTTP_OPERATIONS = 0
MIGRATIONS          = 38   (DB schema delta 0)
OPENAPI             = 125 paths / 138 operations / 277 schemas   (unchanged)
FIGMA               = unchanged (0 writes; registry read only)
```

---

## B. A01 PO reconciliation

```text
APP12-A01       = COMPLETE — PO PASS
CORRECTION_USED = 0 / 1
```

Baseline recorded and re-verified at entry (§Z):

```text
OpenAPI           = 125 / 138 / 277
public operations = 49
release matrix    = 28 DENY / 18 ALLOW / 3 SCOPE_GATED
migrations        = 38
DB schema         = unchanged
Storefront routes = 20
Admin routes      = 26
Figma             = unchanged
```

Bookkeeping carried forward **unabsorbed** (§35):

| Follow-up | Owner |
|---|---|
| `FU-APP12-A01-01` | `APP12-H01` |
| `FU-APP12-A01-02` | `APP12-H01` |
| `FU-APP12-A01-03` | `APP12-V01` |
| `FU-APP12-A01-04` | `APP12-H01` — engineering hard-limit debt, **not** V02 visual/content work |

A02 touched none of these seams and absorbed none of them.

---

## C. D01 / source preflight

The three A02 registry entries were read from
`docs/design/FIGMA_DESIGN_INDEX.md:1417–1419`. All three are
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP12-D01-PO-001` (2026-09-01):

| Registry id | Node | Status |
|---|---|---|
| `FIG-APP12-A03-ORDER-QUEUE-DESKTOP` | `912:337` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP12-A03-ORDER-DETAIL-DESKTOP` | `913:337` | `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-APP12-A03-WORKBENCH-PANELS` | `914:361` | `APPROVED_FOR_IMPLEMENTATION` |

**The design is not the blocker.** The registry is clean, current and approved,
and `APP12-D01` §J states the locked composition precisely: one `Nguồn đơn`
fieldset and one `Nguồn` column on the existing queue; one origin badge, the
frozen-facts card carrying `Nguồn đơn` **and the reservation deadline**, the
shipping-fee card, the `FULL` variant of the deposit workbench and the existing
APP9 fulfilment rail on the existing two-column detail; custom-only sections
omitted and *said* to be omitted (`BR-031`). `NEW_ADMIN_ROUTES = 0`.

The blocker is that the data behind that composition is not on the boundary.

> **Figma MCP note.** The `figma-desktop` MCP server failed to connect this
> session (`ConnectionRefused`), so nodes `912:337` / `913:337` / `914:361` were
> not re-opened in Figma. The design authority used here is the approved
> registry plus `APP12-D01` §J's written lock. This did not affect the verdict —
> the checkpoint is blocked on the contract, not on design fidelity — but a
> resumed A02 must re-open the three nodes before implementing, per CLAUDE.md
> §3. Recorded as `FU-APP12-A02-04`.

---

## D. Contract capability matrix

Method: the committed OpenAPI artifact
(`packages/contracts/openapi/openapi.generated.json`, 125/138/277 — verified),
the generated client
(`packages/api-client/src/generated/embroidery-api.schemas.ts`), the curated
boundary (`packages/api-client/src/orders-and-payments.ts`), the backend read
implementations, and a **live disposable run** (§X). No fact below is inferred
from a name.

| # | Required fact (§4) | Exact operation | Exact field | Verdict |
|---|---|---|---|---|
| 1 | `order.origin` in queue | `adminOrder_list` | *none exists* | **`BLOCKING_MISSING`** |
| 2 | origin filter | `adminOrder_list` | `AdminOrderListParams` = `status[]`, `limit`, `cursor` only | **`BLOCKING_MISSING`** |
| 3 | Ready-Made queue statuses | `adminOrder_list` | `status` enum = the 11 CUSTOM LC-14 states; no `AWAITING_SHIPPING_FEE`, no `AWAITING_PAYMENT` | **`BLOCKING_MISSING`** |
| 4 | a READY_MADE row rendering at all | `adminOrder_list` | `customRequestId` **required**; `NULL` for every READY_MADE row | **`BLOCKING_MISSING`** — live HTTP 500 |
| 5 | `order.origin` in detail | `adminOrder_detail` | *none exists* | **`BLOCKING_MISSING`** |
| 6 | Ready-Made frozen item facts | `adminOrder_detail` | `items[]`; `acceptedQuotationVersionId`, `currentApprovalSnapshotId`, `items[].approvalSnapshotId` all **required**, all `NULL` | **`BLOCKING_MISSING`** — live HTTP 500 |
| 7 | customer / contact / delivery facts | `adminOrderShipping_read` | `recipientName`, `recipientPhone`, `addressLine`, `ward`, `district`, `province`, `countryCode` | `SUPPORTED` |
| 8 | shipping detail and fee | `adminOrderShipping_read` / `_save` | `feeAmount` (nullable), `status`, `fee.fullObligationId`, `fee.payableTotalAmount` | `SUPPORTED` |
| 9 | reservation / payment deadline | *none on the Admin surface* | published only as `ReadyMadeOrderAccessResponse.paymentDeadline` — a **customer** operation §5 forbids Admin to call | **`BLOCKING_MISSING`** (D01 §J places it on the frozen-facts card) |
| 10 | current FULL obligation id / amount / status | `adminOrderPayment_read` | `depositObligationId` / `depositStatus` / `expectedAmount` — the query filters `kind = 'DEPOSIT'` in SQL | **`BLOCKING_MISSING`** — live HTTP 404 |
| 11 | current FULL attempt id / status | `adminOrderPayment_read` | `attempts[]` are the **DEPOSIT** obligation's | **`BLOCKING_MISSING`** |
| 12 | expected FULL transfer reference | `adminOrderPayment_read` | `expectedTransferReference` is the `…DC` deposit memo, not the FULL memo | **`BLOCKING_MISSING`** |
| 13 | payment evidence ids / status | `adminOrderPayment_read` → `adminPaymentEvidence_get` | evidence hangs off the DEPOSIT attempts | **`BLOCKING_MISSING`** |
| 14 | current vs. superseded FULL isolation (§17) | *none* | no Admin read distinguishes FULL A from FULL B | **`BLOCKING_MISSING`** |
| 15 | FULL verification command | `adminPaymentAttempt_verify` | widened by `APP12-B05` | `SUPPORTED` — **but unaddressable**, see below |
| 16 | dispatch | `adminOrder_dispatch` | widened by `APP12-B05` | `SUPPORTED` |
| 17 | completion | `adminOrder_complete` | widened by `APP12-B05` | `SUPPORTED` |

```text
D01_required_financial_missing = 5   (rows 10, 11, 12, 13, 14)
BLOCKING_MISSING total         = 11
```

### D.1 The sharpest single finding

Row 15 is `SUPPORTED` and simultaneously useless. `APP12-B05` made
`adminPaymentAttempt_verify` reachable for a `FULL` attempt — the command works.
But the route is `POST /api/admin/payment-attempts/{attemptId}/verify`, and
**no Admin read publishes a FULL `attemptId`**. The write half of Ready-Made
payment verification is delivered; the read half that addresses it is not. An
operator has no legitimate way to obtain the identifier the delivered command
requires.

`adminOrderShipping_save` returns `fee.fullObligationId` — but that is a *write*
receipt for the operator who just moved the fee, not a read, it names an
obligation and not an attempt, and it is gone on the next page load.

### D.2 Global proof of the origin absence

A scan of every schema property and every operation parameter in the committed
OpenAPI artifact:

```text
schemas with an origin-ish property: NONE
operations with an origin parameter: NONE
```

### D.3 Why no substitute discriminator exists

`ck_orders__custom_chain_by_origin`
(`packages/database/src/schema/ordering/orders.ts:185`) makes
`custom_request_id`, `accepted_quotation_version_id` and
`current_approval_snapshot_id` **`NULL` for every `READY_MADE` row** by database
CHECK. Those are exactly the three fields the APP7 Admin contract declares
`required`. So the nullable-chain heuristic §7/§9 forbid is not merely
forbidden — it is also unavailable, because the read throws before publishing
anything.

---

## E. Existing route architecture

Verified, unchanged:

```text
apps/admin/src/app/(protected)/orders/page.tsx
apps/admin/src/app/(protected)/orders/[orderId]/page.tsx
```

Admin `page.tsx` count = **26**, unchanged. Features
`apps/admin/src/features/order-queue/` (17 files) and
`apps/admin/src/features/order-detail/` (60 files) are the delivered queue and
two-column detail A02 would have extended. **Nothing under either was
modified.** No `/ready-made-orders`, `/fulfilment`, `/full-payments`,
`/shipping` or `/delivery` route was created.

---

## F. Queue origin filter / badge

**Not implemented — blocked** by matrix rows 1–4.

`adminOrder_list` publishes no `origin` and accepts no origin parameter, so a
server-authoritative `Nguồn đơn` fieldset cannot be built. §6 forbids the only
alternative ("do not fetch all pages and filter locally") and names this exact
situation as a block. The `Nguồn` column has no discriminator to render (§7:
`order.origin` only).

Row 3 compounds it: even with an origin field, the `status` enum cannot carry
`AWAITING_SHIPPING_FEE` or `AWAITING_PAYMENT`, so §8's six required Ready-Made
queue statuses are unrepresentable — two of the six do not exist in the
contract.

---

## G. Ready-Made detail branch

**Not implemented — blocked** by matrix rows 5, 6. `adminOrder_detail` answers
HTTP 500 for a READY_MADE order (§X). There is no `order.origin` to branch on
and no successful response to branch *into*.

---

## H. Frozen / customer / delivery facts

Partially available, and not enough to render the panel:

- delivery and contact facts — `SUPPORTED` via `adminOrderShipping_read`
  (row 7);
- **frozen SKU/item facts, quantity, frozen unit price, line subtotal —
  blocked** (row 6): the only operation that publishes `order_items` is
  `adminOrder_detail`, which throws;
- **reservation / payment deadline — blocked** (row 9), and D01 §J places it on
  the frozen-facts card.

§10 forbids re-reading live Catalog to reconstruct the frozen history, so the
delivery facts alone cannot stand in for the item facts.

---

## I. Custom-panel absence

Not reached. The §11 assertion (zero mounted quotation, design-version,
approval-snapshot, production, REMAINING and custom-request-provenance panels on
a READY_MADE detail) presupposes a rendering READY_MADE detail, which §G shows
does not exist.

```text
custom_only_panels_on_READY_MADE = N/A (no READY_MADE detail renders)
```

CUSTOM panels are untouched and unchanged — zero files modified.

---

## J. Shipping — first fee

**Contract-ready, not implemented.** This is the one part of A02 that was fully
unblocked:

- `adminOrderShipping_read` answers **HTTP 200** for a Ready-Made order in
  `AWAITING_SHIPPING_FEE`, with `feeAmount: null` and `status: "EDITABLE"`
  (§X, live);
- `adminOrderShipping_save` is a **full-replacement `PUT`** whose body requires
  `recipientName`, `recipientPhone`, `addressLine`, `province`, `feeAmount`
  (§13's shape question — answered: replacement, not patch);
- `feeAmount` crosses as a decimal **string**, and `null` (not priced) is
  distinct from `"0.00"` (explicitly free) — §12/§13 satisfied by the contract;
- the backend owns the transition to `AWAITING_PAYMENT`, the FULL creation and
  the reservation reschedule (`APP12-B03`), and the receipt reports
  `fee.fullObligationId` and `fee.payableTotalAmount`.

It was not built because a shipping-fee card is reachable only from the
Ready-Made detail branch, and that branch cannot exist (§G). Shipping is the
half of A02 a resumed checkpoint can implement first.

---

## K. Shipping — correction

Not implemented. The contract supports the mechanics
(`fee.previousFeeAmount`, `fee.fullObligationId` naming the successor after a
correction), so §28's "warning shown / UI shows B / no deadline-extension claim"
is buildable — but §17's requirement that the panel prove **B is current and A
is not** needs a *read* that distinguishes them, and matrix row 14 shows none
exists. A write receipt is not a durable answer to "which obligation is live
right now".

---

## L. Payment read authority

```text
read_authority = NONE
```

§14 required A02 to prove explicitly whether current accepted contracts expose
FULL. **They do not.**
`apps/api/src/modules/payment/application/admin/read-admin-order-payments.query.ts`
is titled "One order's **DEPOSIT** payment vertical" and its
"`REMAINING` is never here" section states: *"`findDepositObligation` filters
`kind = 'DEPOSIT'` in SQL."* A Ready-Made order has no `DEPOSIT` obligation, so
the query takes its `obligation === undefined` branch and throws
`AdminPaymentReadError` → the `ORDER_NOT_FOUND` observed live in §X.

The published schema agrees: `AdminOrderPaymentsResponse` has
`depositObligationId` / `depositStatus` and no obligation `kind`, no obligations
array and no FULL member. Its `orderStatus` enum also lacks both Ready-Made
states.

Per §14 this alone is a `BLOCKED_CONTRACT_GAP`. No customer secure API and no
persistence workaround was used (§5).

---

## M. FULL workbench

Not implemented — blocked by §L. Every fact D01's single FULL workbench is
allowed to display (`kind = FULL`, amount, status, attempt, expected transfer
reference, evidence) is matrix row 10–13. §14 forbids frontend recomputation and
§5 forbids deriving FULL from `totalAmount`, from subtotal + fee, or from
total − deposit, so there is no compliant fallback.

---

## N. Evidence / review

`N/A` — blocked upstream. `adminPaymentEvidence_get` is delivered and addressed
by `evidenceId`, but the only operation that publishes an `evidenceId` is
`adminOrderPayment_read`, and it publishes the DEPOSIT attempts' evidence. Per
§16, D01 requires evidence and no accepted Admin read exposes the identity →
`BLOCKED_CONTRACT_GAP`. No evidence endpoint was added.

The supporting-only semantics (`assetStatus` `ACCEPTED` ≠ payment verified) are
correctly published by `AdminPaymentEvidenceResponse` and would have been
preserved.

---

## O. Verification

Not implemented. `adminPaymentAttempt_verify` accepts a FULL attempt after
`APP12-B05`, and A02 would have reused it with the existing APP7/APP9
expected-vs-observed reconciliation UI rather than a Ready-Made verifier. It is
unreachable for the reason in §D.1: no Admin read publishes the FULL
`attemptId`, and §14 requires expected values to come from the Admin payment
read authority, which does not answer for Ready-Made.

No optimistic paid state was introduced anywhere, because no code was written.

---

## P. Fulfilment rail

Not implemented. The APP9 rail is delivered and reusable, and the canonical
Ready-Made ladder (`AWAITING_PAYMENT` no dispatch → `READY_FOR_DELIVERY`
dispatch → `DELIVERED` complete → `COMPLETED` read-only) skips production and
remaining-payment. It is unreachable: the rail lives inside the order detail
(§G), and the two states it starts from cannot be read from
`adminOrder_detail`.

---

## Q. Dispatch

`adminOrder_dispatch` is `SUPPORTED` at the contract (matrix row 16;
`APP12-B05` widened `loadForUpdate` / `dispatch` past `toOrder`'s Ready-Made
refusal). `AdminOrderDispatchResponse` reports `status`,
`shippingStatus: "FROZEN"` and `frozenAt`, so the §20 freeze communication is
expressible. Not implemented — no surface to expose it on. No carrier API,
tracking system or dispatch+complete shortcut was introduced.

---

## R. Completion

`adminOrder_complete` is `SUPPORTED` (matrix row 17). Not implemented, same
reason. No reopen, redispatch, recomplete or refund operation was invented.

---

## S. Terminal compatibility

Not reached. `APP12-B04-C1` publishes the machine-readable
`ReadyMadeOrderAccessResponseTerminationReason` — but on the **customer**
surface only. The Admin contract publishes no termination reason at all, so
§22's "render terminal truth only where the current Admin contract supplies it"
would have resolved to rendering nothing. No free-text cancellation reason was
parsed and no cancellation or refund operation was invented.

---

## T. Error / refusal mapping

Not reached. §18's stable generated-domain code mapping presupposes a live
Ready-Made surface. Recorded for a resumed checkpoint: the seven refusal classes
(§18) and the scoped-refetch rule (detail, payment read, shipping when
necessary, list only if status changed — never a broad cache flush) remain the
requirement.

---

## U. Query / cache

No key was added, no key was changed, no second Ready-Made cache was created.
`apps/admin/src/features/order-queue/model/order-queue-keys.ts` and
`apps/admin/src/features/order-detail/model/order-detail-keys.ts` are untouched.

---

## V. CUSTOM regressions

**Not run, and deliberately so.** `VALIDATION_GOVERNANCE.md` §3 scopes
validation to what the change justifies. A02 changed **one Markdown file** and
no source, so the CUSTOM queue, detail, DEPOSIT workbench, REMAINING workflow,
shipping acknowledgement, production rail, dispatch and completion cannot have
regressed. Running the Admin suites here would produce evidence about HEAD, not
about this checkpoint.

CUSTOM behaviour is bit-identical to entry HEAD (`abde68db`).

**But CUSTOM is not safe**, and this is the most important operational finding
in this report — see §X.2. The 500 that blocks A02 takes the **CUSTOM** queue
down with it.

---

## W. Accessibility / responsive

Not reached. The §24 requirements (labelled origin fieldset, origin/status not
colour-only, one detail `h1`, labelled shipping/verification fields, semantic
money rows, keyboard dialogs, accessible evidence preview, visible reasons for
unavailable actions) and the 1440 / 1024 live viewports carry forward unchanged
to a resumed checkpoint. No 390 Admin design was invented.

```text
viewport_1440 = NOT_REACHED
viewport_1024 = NOT_REACHED
```

---

## X. Live disposable evidence

The audit was not left at source reading. One throwaway probe was run against a
**disposable** PostgreSQL database with all 38 migrations, booting the real
`AppModule` behind the real `AuthenticatedAdminGuard`, with the order created by
the production `publicReadyMadeOrder_create` command through
`createReadyMadeOrder` — not by a fabricated row.

```text
$ pnpm --filter @embroidery/api exec jest --runInBand \
    --testPathPatterns="zz-a02-contract-gap-probe" --testPathIgnorePatterns=/node_modules/

Test Suites: 1 passed, 1 total     Time: 4.737 s
```

Verbatim probe output, one real `READY_MADE` order (`AWAITING_SHIPPING_FEE`,
2 × 250 000):

| Operation | Status | Body |
|---|---|---|
| `GET /api/admin/orders` | **500** | `{"success":false,"code":"INTERNAL_SERVER_ERROR",…}` |
| `GET /api/admin/orders/{id}` | **500** | `{"success":false,"code":"INTERNAL_SERVER_ERROR",…}` |
| `GET /api/admin/orders/{id}/payments` | **404** | `{"success":false,"code":"ORDER_NOT_FOUND","message":"No such order."}` |
| `GET /api/admin/orders/{id}/shipping-detail` | **200** | `{…"feeAmount":null,"status":"EDITABLE","frozenAt":null,…}` |

The probe file was **deleted after the run**; `git status` is clean apart from
this report. It was not committed: A02 is `Axx` (Admin UI only) and adding a
backend test is not its scope. The probe is reproducible from this report.

### X.1 The mechanism behind the two 500s

`apps/api/src/modules/order/infrastructure/persistence/drizzle-admin-order-read.repository.ts:181`

```ts
function requireCustomChain(value: string | null, field: string): string {
  if (value === null) {
    throw new Error(
      `admin order read: ${field} is null, so this order is not a custom order; ` +
        'this read path is CUSTOM-only until APP12-A02.',
    );
  }
  return value;
}
```

It is called on `customRequestId` in `toQueueRow` (`:208`) — the **queue's** row
mapper — and on `acceptedQuotationVersionId`, `currentApprovalSnapshotId` and
each item's `approvalSnapshotId` in the detail path. The comment above it names
`APP12-A02` / `B05` as the owner of the origin-aware Admin read. `APP12-B05`
delivered the origin-aware **fulfilment** half (`toOrder`, `loadForUpdate`,
`transition`, `dispatch`) and left the **read** half; the locked roadmap gives
A02 `API Δ 0`, so no checkpoint currently owns it.

### X.2 Severity — this is a Wave-1 blocker beyond A02

The queue mapper throws **per row, inside the page**. One `READY_MADE` order on
the page fails the whole request, so the delivered Admin order queue serves
**HTTP 500 to every operator, for CUSTOM orders too**, from the moment the first
Ready-Made order exists in an environment.

Today the shared development database holds zero (§Y), so nothing is visibly
broken. `APP12-G03` (representative UAT dataset) is scheduled to create exactly
such orders. **`G03` will take the Admin order queue down** unless the read is
repaired first. `APP12-B02` has been able to create these orders since it
landed; production would break the same way on the first customer purchase.

Recorded as `FU-APP12-A02-01`, `WAVE1_BLOCKER`.

---

## Y. DB / MinIO / shared-dev hygiene

```text
validation             = DISPOSABLE
disposable_db_removed  = true
disposable_minio_used  = false  (no evidence preview or upload was exercised)
G03_data_created       = false
```

The probe's disposable database (`…app12_a02_probe…`) is absent from
`pg_database` after the run — dropped by the harness.

Shared development database, read directly after the run:

```text
orders where origin='READY_MADE'      = 0
payment_obligations where kind='FULL' = 0
payment_attempts                      = 0
shared_dev_residue                    = 0
```

No commercial write of any kind touched shared dev. No `.env` was read for a
secret-bearing variable; `POSTGRES_USER` / `POSTGRES_DB` are ordinary config
(CLAUDE.md §8a).

> **Pre-existing observation, not A02 residue.** Fifteen orphaned disposable
> databases remain on the dev PostgreSQL server from earlier checkpoints'
> crashed race suites (`…app12_b03_race…`, `…app6_b05_race…`,
> `…app6_b11_race…`, eleven `…db10_cp2_source…`). They predate this session and
> A02 did not create or remove them. Recorded as `FU-APP12-A02-03`.

---

## Z. Baseline freeze

Re-measured from the committed artifacts at exit, not restated:

| Dimension | Expected | Measured | Δ |
|---|---|---|---|
| OpenAPI paths / operations / schemas | 125 / 138 / 277 | **125 / 138 / 277** | 0 |
| Public operations | 49 | 49 | 0 |
| Release matrix | 28 DENY / 18 ALLOW / 3 SCOPE_GATED | unchanged | 0 |
| Migrations | 38 | 38 | 0 |
| DB schema | unchanged | unchanged | 0 |
| Admin routes | 26 | **26** | 0 |
| Storefront routes | 20 | 20 | 0 |
| Figma | unchanged | unchanged (0 writes) | 0 |

```text
A02 adds: 0 routes · 0 HTTP operations · 0 migrations
```

No contract was widened to get past the gap (§34).

---

## AA. Figma / source mapping

| Registry id | Node | Intended source | Implemented |
|---|---|---|---|
| `FIG-APP12-A03-ORDER-QUEUE-DESKTOP` | `912:337` | `apps/admin/src/features/order-queue/` | **no — blocked** (§F) |
| `FIG-APP12-A03-ORDER-DETAIL-DESKTOP` | `913:337` | `apps/admin/src/features/order-detail/` | **no — blocked** (§G) |
| `FIG-APP12-A03-WORKBENCH-PANELS` | `914:361` | `apps/admin/src/features/order-detail/components/` | **no — blocked** (§M, §N, §P) |

```text
FIGMA_DELTA = 0
```

The registry was read, not written. No frame was created, modified or
re-approved.

---

## AB. Files changed

| File | Change |
|---|---|
| `docs/implementation/reports/APP12-A02-COMPLETION-REPORT.md` | new — this report |

One file. No source, no test, no configuration, no schema, no generated
artifact, no Figma.

---

## AC. File-size evidence

No TS, TSX or SCSS file was created or modified, so the scoped file-size checks
have an empty input set and were not run — running them would report on HEAD,
not on this checkpoint. Limits carry forward unchanged for a resumed A02:
runtime source ≤ 400, tests ≤ 600, review thresholds 300 / 500.

---

## AD. Validation

Selected from `VALIDATION_GOVERNANCE.md` §3 for the change this checkpoint
actually made — one Markdown file — plus the audit evidence the verdict rests
on.

| Command | Why | Result |
|---|---|---|
| `git diff --check` | whitespace on the changed file | **PASS** |
| `node -e` over `packages/contracts/openapi/openapi.generated.json` | baseline 125/138/277 and the global origin scan (§D.2) | **PASS** — matches; origin `NONE` |
| `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="zz-a02-contract-gap-probe"` | live disposable proof of the three blocked reads (§X) | **1/1 PASS** — 500 / 500 / 404 / 200 recorded |
| `find apps/admin/src/app -name page.tsx` count | Admin route-count freeze | **26** |
| `docker exec … psql` shared-dev residue count | §25 hygiene | **0 / 0 / 0** |

**Deliberately not run**, with reasons: Admin typecheck / lint / build, the order
queue and detail suites, the CUSTOM regressions, the shipping and FULL workbench
tests, `api-client` check, the category anti-hardcode gate, the scoped file-size
and SCSS checks, prettier over changed source, the e2e-testing typecheck and
every Playwright journey. All of them validate source this checkpoint did not
touch; each would report on entry HEAD `abde68db` and none would be evidence
about A02. No full-monorepo, Storefront, global-UAT, performance or Figma-write
command was run (§37).

Prettier was not run over the report: it is Markdown prose, and no formatter
gate covers `docs/implementation/reports/`.

---

## AE. Follow-up reconciliation

Carried forward unabsorbed: `FU-APP12-A01-01` → `H01`, `-02` → `H01`,
`-03` → `V01`, `-04` → `H01`. No unrelated S03/B05/B04/B03/category/tooling debt
was absorbed (§35).

New:

| Id | Finding | Classification |
|---|---|---|
| `FU-APP12-A02-01` | The Admin order **read** path is CUSTOM-only. `requireCustomChain` throws for every `READY_MADE` row, so `adminOrder_list` and `adminOrder_detail` answer **500** — the queue failing for CUSTOM rows too — and `adminOrderPayment_read` answers **404** because it filters `kind='DEPOSIT'` in SQL. `APP12-B05` widened the fulfilment half and left the read half; the locked roadmap assigns the read to no checkpoint. | **`WAVE1_BLOCKER`** — must be owned by a backend checkpoint **before** `APP12-G03` seeds Ready-Made orders and before `A02` is retried. Needs PO re-planning authority: the roadmap is `LOCKED` at 38 and no unstarted `Bxx` remains. |
| `FU-APP12-A02-02` | The Admin contract publishes no `origin`, no origin filter, no Ready-Made status members, no FULL obligation/attempt/reference/evidence, no current-vs-superseded distinction and no reservation deadline — 11 `BLOCKING_MISSING` facts (§D), 5 of them D01-required financial. `adminPaymentAttempt_verify` accepts a FULL attempt that no read can address. | **`WAVE1_BLOCKER`**, same owner as `-01`. |
| `FU-APP12-A02-03` | 15 orphaned disposable databases on the dev PostgreSQL server from earlier crashed race suites. Pre-existing; not A02's. | `NONBLOCKING_DEFER` → operator hygiene |
| `FU-APP12-A02-04` | The `figma-desktop` MCP server was unreachable this session, so nodes `912:337` / `913:337` / `914:361` were not re-opened. Verdict unaffected (blocked on contract, not design). A resumed A02 must re-open them per CLAUDE.md §3. | Session limitation; binds the resumed checkpoint |

---

## AF. Roadmap

`APP12-A02` did **not** complete. The phase plan is left untouched: the roadmap
stays `LOCKED` at 38 checkpoints, `A02` stays `NEXT`, and no status was
advanced.

```text
APP12-A02 = BLOCKED_CONTRACT_GAP
APP12-A02 = NEXT           (unchanged)
APP12-H01 = NOT_STARTED    (not started; §0 forbids it)
ROADMAP_LOCK = LOCKED
CHECKPOINTS  = 38
```

`APP12-H01` was not started. No correction was consumed
(`CORRECTION_USED = 0 / 1`), because a correction repairs the current
checkpoint's own work and the defect here is in a delivered backend contract A02
is forbidden to touch.

### What unblocks A02

An origin-aware Admin order read, owned by a backend checkpoint under Product
Owner re-planning authority, publishing: `origin` on the queue item and the
detail; an origin filter parameter on `adminOrder_list`; the Ready-Made status
members; the Ready-Made detail without the required custom chain; the current
FULL obligation, its current attempt, its expected transfer reference and its
evidence, distinguishable from a superseded predecessor; and the reservation
deadline. Everything else A02 needs — shipping read/save, verify, dispatch,
complete — is already delivered and was confirmed working (§D rows 7, 8, 15–17).

Shipping (§J) is the half a resumed A02 can build first.
