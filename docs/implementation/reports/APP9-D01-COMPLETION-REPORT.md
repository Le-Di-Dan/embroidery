# APP9-D01 — Complete APP9 Figma Design Package — Completion Report

## 1. Verdict

```text
APP9-D01 = COMPLETE
DESIGN_PACKAGE = READY_FOR_PO_REVIEW
APP9_FIGMA_APPROVAL = PENDING_PO_REVIEW
APP_09_PAGE = REUSED (pre-existing, empty)
APP9_DESIGN_INDEX_ROWS = 36
NEW_ADMIN_ROUTES = 0
NEW_STOREFRONT_ROUTES = 1
APP9_S02 = DOES_NOT_EXIST
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED
DESIGN_BLOCKER = none
CODE_CHANGES = 0
MIGRATIONS_ADDED = 0
OPENAPI_CHANGES = 0
NEXT_CHECKPOINT = APP9-A01
NOT_PUSHED = true
```

## 2. B05 housekeeping commit

The accepted `APP9-B05` tree was still uncommitted, as its report §3 stated. The
working tree was inspected and reconciled against `APP9-B05-COMPLETION-REPORT.md`
§25 before anything was committed:

```text
tree at entry            21 paths (10 modified, 11 untracked)
report §25 new           7
report §25 new tests     3
report §25 modified      5   (app.module.ts, operation-id.ts,
                              drizzle-order.repository.ts,
                              drizzle-order-shipping.repository.ts,
                              order.repository.ts)
report §25 generated/doc 6
                         ----
                         21  ✓ exact match
```

One commit was created. No accepted B05 behaviour was altered and no B05 test was
rerun for housekeeping, as §1 requires.

```text
a191694  feat(app9): deliver admin dispatch freeze and order completion (APP9-B05)
```

## 3. Branch, D01 entry HEAD, commit, push state

```text
branch          production
B05 commit      a191694   (created by this checkpoint's §1 housekeeping)
D01 entry HEAD  a191694   (tree clean at entry)
D01 commit      none — the working tree carries the change, uncommitted
push            NOT_PUSHED = true — nothing was pushed at any point
```

## 4. Figma file and page

```text
file        embroidery — FIG-FILE-PRODUCT
file key    BQwqV8GdfUIELvsQDB1UQE
page        APP_09 — 766:2
section     807:3  APP9-D01 · Remaining Payment, Fulfillment & Completion
root size   6220 × 13982
```

## 5. APP_09 created or reused — **REUSED**

The registry was searched before any write for every APP9-owned term (`APP9`,
`APP_09`, `final-payment`, `shipping`, `dispatch`, `fulfillment`): **no registry
row existed**, §4 ended at `4.14 APP8-D01`, and §3 listed `APP_01`…`APP_08` write
targets only. The live file was then read. `figma.root.children` returned
thirteen pages, among them **`APP_09` at `766:2` with zero children** — the exact
node the checkpoint brief links to.

Per `FIGMA_DESIGN_INDEX.md` §2 rule 1 the page was **reused, not re-created**. No
second APP9 page exists, and no APP9 frame was scattered onto an older APP page.
Audit outcome: **`NO_EXISTING_APP9_DESIGN`** — nothing was reused, supplemented,
repaired or superseded, and **no APP1–APP8 or BRD0 node was modified**.

## 6. Design-index rows before / after

```text
before   414 registry IDs / 414 node rows / 20 registry tables
after    450 registry IDs / 450 node rows / 21 registry tables
delta    +36 rows, +1 table (§4.15), +1 write-target line in §3
```

## 7. Total APP9 rows

```text
36 rows   all REVIEW_REQUIRED, all approval evidence "—"
          18 Admin · 12 Storefront · 6 Shared
```

Within the §18 target band of about 30–45 rows. The package was not inflated to
reach a number: repeated badges and refusals are annotated in shared catalogs
rather than duplicated as pixel-identical screens.

## 8. Reused APP7 / APP8 / APP1 / APP4 patterns

Referenced, never redrawn and never modified:

| Component | Source node | Use in APP9 |
|---|---|---|
| Admin shell + sidenav | `APP1-D01` `385:10` | Used as-is; APP9 adds **0** nav entries |
| Storefront secure-page shell | `APP1-D02` `405:2225` | Used as-is for the final-payment surface |
| Secure-link access states | `APP4-D01` `629:20` | Used as-is for link unavailable/expired |
| Re-verification (OTP) layer | `APP4` / `APP6` | Referenced only; APP9 does not redraw OTP |
| Order queue table + status filter | `APP7-D01` `732:3`, `732:31` | Extended with five APP9 states; no second queue |
| Order detail two-column layout | `APP7-D01` `734:3` | Used as-is; right rail becomes the APP9 workspace |
| Payment verification patterns | `APP7-D01` `737:3`, `740:111` | Reused for balance verification |
| Bank instructions + QR presentation | `APP7-D01` `745:3` | Reused for the balance |
| Transfer-evidence flow | `APP7-D01` `746:3` | Reused with neutral customer copy |
| Transition confirm dialog | `APP8-D01` `786:3` | Reused for open-payment, dispatch, completion |

Design-system cost: **0** component masters, **0** instances, **0** new
variables, text styles, paint styles or effect styles. Every frame composes the
existing `Primitive` / `Semantic` / `Foundation` collections and the Inter family
(Regular / Medium / Semi Bold / Bold). The DS library file was not touched.

## 9. Admin package inventory (18 rows)

| Section | Frames |
|---|---|
| 01 · `/orders` extension | Fulfillment states; status filter open — fulfillment states |
| 02 · `PRODUCTION_COMPLETED` | Detail; open-final-payment confirm; refusal (409) |
| 03 · `AWAITING_FINAL_PAYMENT` | Detail; verification confirm; verification refusal (409) |
| 04 · `READY_FOR_DELIVERY` | Shipping editor EDITABLE; fee-increase refusal (409) |
| 05 · Dispatch | Confirm & freeze; remaining-payment guard refusal; invalid/replay |
| 06 · `DELIVERED` | Detail with frozen shipping; completion confirm; completion refusal |
| 07 · `COMPLETED` | Detail, fully read-only |
| Shared | Admin refusal catalog |

## 10. Storefront package inventory (12 rows)

| Section | Frames |
|---|---|
| 08 · Final payment | Payable — instructions & QR; payable — before attempt |
| 09 · Transfer evidence | Not sent; sent |
| 10 · Order status | Not yet payable; paid — preparing delivery; DELIVERED; COMPLETED |
| 11 · Mobile 390 | Payable + QR; DELIVERED |
| 12 · Errors | Secure link unavailable/expired; error state catalog |

## 11. Lifecycle / status mapping

`FIG-APP9-LIFECYCLE-MAPPING` (`820:4`) fixes the mapping from order status to the
Admin label, the customer label and the balance-payment wording. Two rules are
recorded there:

- Backend enum names never reach the customer; the Admin column keeps the
  technical names because operators must match them against logs.
- **Two intermediate states are deliberately collapsed.** "Instructions opened"
  and "waiting for admin verification" are **not** drawn as separate customer
  states, because `CustomerFinalPaymentResponse.finalPaymentStatus` returns
  `PENDING` for both and the projection carries no attempt detail. Splitting them
  would be invention. Both render the one "waiting for confirmation" card.

## 12. Final-payment UX

Backed by `publicOrderFinalPayment_current`, `_qr` and `_initiate` and nothing
else. The exact balance is the visual anchor of the page (44 px on desktop, 30 px
on mobile). The page carries order context, the exact amount, bank name, account
number, account holder, the canonical transfer reference, a dynamic QR, the
optional evidence affordance and a safe lifecycle status.

`FIG-APP9-S01-FINALPAY-PAYABLE-DESKTOP` states in-place that scanning the QR or
transferring the money does **not** verify the payment — admin reconciliation
against the bank account remains the only authority. No provider checkout, no
webhook state, no automatic verification and no countdown appears anywhere.

## 13. Shipping edit / freeze UX

`adminOrderShipping_read` / `_save`, with only the fields the contract actually
carries: recipient, phone, address line, ward, district, province, fee, carrier
name, tracking code. Required and optional are marked exactly as
`SaveShippingDetailBody` requires them.

`EDITABLE` before dispatch and `FROZEN` after is expressed as one field-level
state change, not two screens and not a separate freeze control — there is no
freeze button, because freezing is a consequence of dispatch.

## 14. Fee-acknowledgement UI disposition

```text
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED
OWNER = APP10 or later customer-communication composition
```

Recorded as a first-class design artifact, `FIG-APP9-FEE-ACK-DISPOSITION`
(`820:106`), rather than as a silent absence. The §13 test was applied against
the delivered contract and failed on its first condition:

- `publicOrderShippingFee_acknowledge` **exists** and takes `{ token, newFeeAmount }`.
- `CustomerFinalPaymentResponse` — the only delivered customer projection —
  carries `orderCode`, `orderStatus`, `finalPaymentAmount`, `finalPaymentStatus`,
  `payable`, `bankInstructions`, `accessExpiresAt`. It carries **no shipping fee
  field at all**, current or proposed.
- The command therefore requires the caller to supply `newFeeAmount`, with **no
  server-authoritative source** for it.

Designing the action would have required exactly one of the three things §13
forbids: a manually typed fee field, a fabricated proposal card, or a query-param
fee carrier. None was drawn. The §13 escape clause does not fire either: the
phase plan charters `APP9-S01` as "customer remaining-payment surface with the
exact amount, QR, optional evidence and completion status" and never requires
`S01` to invoke the command. **Not a D01 blocker.**

The consequence is drawn rather than hidden: because customers currently have no
path to acknowledge a higher fee, the Admin fee-increase refusal (§15) and the
dispatch payment guard are real, reachable states, and both are designed.

## 15. Dispatch / completion UX

`adminOrder_dispatch` moves `READY_FOR_DELIVERY → DELIVERED` behind a confirm
dialog that names the freeze explicitly and lists the exact values about to be
snapshotted. It does not imply courier confirmation, and no `FULFILLED` state is
invented.

`adminOrder_complete` moves `DELIVERED → COMPLETED` as a **separate** action on a
separate card, never merged into dispatch.

The dispatch guard refusal is designed truthfully and is the subtlest state in
the package: an order can sit at `READY_FOR_DELIVERY` and still owe money,
because an `APP9-B04` fee increase supersedes a satisfied obligation without
moving the order. `FIG-APP9-A01-DISPATCH-PAYMENTGUARD` says so in product copy —
order status is not proof of payment — and offers no bypass.

## 16. Customer completion-status UX

Four customer states are drawn — not yet payable, paid/preparing delivery,
delivered, completed — sharing one four-step progress indicator (Đã thanh toán →
Đang chuẩn bị giao → Đã giao → Hoàn tất). `COMPLETED` is terminal and offers no
post-completion action.

## 17. Tracking / refund / notification exclusions

Customer frames render **none** of: `carrier_name`, `tracking_code`, live
delivery status, tracking-number card, track-package button, shipment timeline,
map, ETA, courier status. Admin may see `carrier_name` and `tracking_code` as
static text on the frozen record only.

Nowhere in the package: cancel order, refund request or status, returns,
notification centre, email/SMS preferences, communication history, provider
checkout or webhook state. `PO-APP9-001 = OPTION A — DEFER`; APP10 owns customer
communication. `FIG-APP9-SCOPE-BOUNDARY` (`821:87`) records twelve such
exclusions with the reason each one is absent, so a reviewer can tell a decision
from an oversight.

## 18. Error-state coverage

Admin (`FIG-APP9-ADMIN-REFUSAL-CATALOG`, `820:47`) covers all ten §16 states:
TR-LC14-05 refused; balance not verified; shipping detail missing/incomplete;
shipping already frozen; fee increase without matching acknowledgement; dispatch
refused by the payment guard; dispatch invalid/replay; completion before
`DELIVERED`; completion invalid/replay; generic failure. Five are drawn as full
frames; the rest are catalogued. No page was created for a 409.

Storefront (`FIG-APP9-S01-ERROR-CATALOG`, `819:237`) covers link
unavailable/expired, not payable, no live balance, re-verification required, QR
failure, attempt failure, evidence failure, rate limiting and generic failure.
Secure-link secrecy is preserved: one screen serves expiry, wrong token, revoked
token and foreign order, and never reveals whether an order exists.

## 19. Backend operation annotations

`FIG-APP9-BACKEND-OPERATION-MAP` (`821:3`) annotates every surface with route,
source lifecycle state, primary action, operation id, target lifecycle state,
editable-vs-read-only, fields shown and fields intentionally hidden, plus the
shared loading/success/refusal rules.

All ten delivered operation ids were verified present in the committed OpenAPI
artifact before annotation, on the `100` path / `108` operation / `222` schema
baseline:

```text
adminOrder_transition              adminOrderShipping_read
publicOrderFinalPayment_current    adminOrderShipping_save
publicOrderFinalPayment_qr         publicOrderShippingFee_acknowledge
publicOrderFinalPayment_initiate   adminOrder_dispatch
adminPaymentAttempt_verify         adminOrder_complete
```

No nonexistent operation is annotated anywhere in the package.

## 20. API-limited designs removed or deferred

Three limits were found by reading the delivered contracts and source, and each
is drawn rather than hidden:

1. **No Admin read of the balance** — `read-admin-order-payments.query.ts` states
   it plainly: *"`REMAINING` is never here — `findDepositObligation` filters
   `kind = 'DEPOSIT'` in SQL"*, and `adminOrder_detail` returns no payment data at
   all. So an operator cannot see the balance, its attempts, its evidence or its
   reconciliations. This is already recorded as **`FU-APP9-B03-02`, owner
   `APP9-A01`**. A rich remaining-payment history panel was therefore **not**
   designed (§7). `FIG-APP9-A01-DETAIL-AWAITINGFINAL-DESKTOP` marks the region as
   a named API gap and explicitly forbids deriving the balance as
   "total − deposit", because a B04 fee increase would falsify that subtraction.
2. **Deposit-flavoured transport names** — `PaymentDecisionResponse.depositObligationId`
   and `.depositStatus` carry the **REMAINING** obligation on a balance
   verification (**`FU-APP9-B03-01`**). Both are recorded as transport names that
   must never reach the screen; product copy is "Thanh toán còn lại" and "Trạng
   thái thanh toán" (§7).
3. **No proposed-fee projection** — see §14.

One naming reuse was verified rather than assumed: the customer evidence route is
deposit-named, but `evidence-attempt.authorizer.ts` defines
`EVIDENCE_OBLIGATION_KINDS = ['DEPOSIT', 'REMAINING']`, so reusing it for the
balance is truthful. `FIG-APP9-S01-EVIDENCE-PRESENT-DESKTOP` records that the
legacy wording must not surface to the customer (§11).

No `DESIGN_BLOCKER` was recorded: no critical APP9 UI is impossible, and no
backend scope was added.

## 21. Validation run

| Command | Result |
|---|---|
| `node tools/check-figma-design-index.mjs` | **passed** — 450 registry IDs, 450 node rows, 21 registry tables; canonical files + statuses + deep links + composites verified |
| Targeted Figma read-back (`use_figma`, `get_metadata`, `get_screenshot`) | 14 sections, 36 frames confirmed on `APP_09` `766:2` |
| Independent `absoluteBoundingBox` audit | **0** frames escaping their section, **0** section overlaps, **0** frame overlaps; rendered root `6220 × 13982` matches the root box exactly |
| `git diff --check` | clean — no whitespace errors, no conflict markers |
| `node tools/check-report-secrets.mjs` | see §22 |

The index gate initially failed once, correctly: `composite-unique` reported that
`Admin | /orders | Order Queue | Status Filter Open | Desktop 1440` was already
held by the approved `FIG-APP7-A01-QUEUE-FILTER-DESKTOP`. That was a real
collision, not a gate defect — the APP9 frame is a different state of the same
screen. The row's `State` was corrected to `Status Filter Open — Fulfillment
States` and the Figma frame renamed to match. The gate then passed.

## 22. Validations deliberately not run

Per §23 this checkpoint changed design and documentation only, so no runtime gate
was justified. Not run: Jest (unit, contract, integration), API integration,
worker tests, Playwright, Docker, any build, OpenAPI generation, API-client
generation, database tests, and APP9-E01.

`node tools/check-report-secrets.mjs` is **inherited-red at HEAD** on the same two
false positives `APP9-G01`, `B01`, `B02` and `B03` all recorded
(`APP6-B04-COMPLETION-REPORT.md:93`, `APP9-G01-COMPLETION-REPORT.md:381`). The
tool takes no file arguments, so it cannot be scoped to this checkpoint's report.
It was run to confirm **no new** finding was introduced by
`APP9-D01-COMPLETION-REPORT.md`; the pre-existing two are unchanged and remain
`FU-APP9-G01-01`. This checkpoint introduces no credential, token or secret: every
value in the package and in this report is synthetic.

## 23. Changed repository files

```text
M  docs/design/FIGMA_DESIGN_INDEX.md
     +1 write-target line in §3 (APP_09 → 766:2)
     +1 registry table §4.15 with 36 REVIEW_REQUIRED rows and its pre-draw audit
M  docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md
     roadmap only: D01 NEXT → COMPLETE (+ evidence), A01 INCOMPLETE → NEXT
A  docs/implementation/reports/APP9-D01-COMPLETION-REPORT.md
```

No source, test, schema, migration, OpenAPI, generated-client, worker or
frontend file was touched. `SCOPED_COMMAND_INDEX.md` was not modified: D01
registers no new command — `CMD-CHECK-FIGMA-DESIGN-INDEX` already exists.

## 24. Design approval status

```text
APP9_FIGMA_APPROVAL = PENDING_PO_REVIEW
all 36 rows          = REVIEW_REQUIRED
approval evidence    = "—" on every row
self-approval        = none
fabricated PO id     = none
```

`APP9-D01` does not self-approve. No APP9 frontend checkpoint may start against a
`REVIEW_REQUIRED` row: a human reviewer must promote the rows their checkpoint
consumes, with an approval-evidence id, following the `APP3-D01`…`APP8-D01`
precedent. No row outside `APP9-D01` was touched, and no existing approval was
altered.

## 25. Roadmap

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
A01   NEXT
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. A01 was not begun.

## 26. Existing follow-ups

Untouched, as §24 requires: `FU-APP9-G01-01`, `FU-APP9-B01-01`, `FU-APP9-B01-02`,
`FU-APP9-B02-01`, `FU-APP9-B03-01`, `FU-APP9-B03-02`, `FU-APP9-W01-01`,
`FU-APP9-B04-01`…`-04`, `FU-APP9-B04-C1-01`, `FU-APP9-B05-01`, `FU-APP9-B05-02`,
`FU-APP9-B05-03`, `IMP-O008`, `FU-APP8-B04-02`. `FU-APP8-W01-01` remains CLOSED.

D01 opens no new follow-up. `FU-APP9-B03-01` and `FU-APP9-B03-02` are consumed as
design input — both already name `APP9-A01` as owner, and the package now carries
the annotations A01 needs to honour them.

## 27. Stop

```text
APP9-D01 = COMPLETE
DESIGN_PACKAGE = READY_FOR_PO_REVIEW
APP9_FIGMA_APPROVAL = PENDING_PO_REVIEW
NEXT_CHECKPOINT = APP9-A01
NOT_PUSHED = true
```
