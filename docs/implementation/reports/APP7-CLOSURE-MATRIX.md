# APP7 — Closure Matrix

- Phase: `APP7 — Deposit Payment and Order Creation`
- Produced by: `APP7-X01`
- Date: 2026-08-24
- Companion: [`APP7-X01-COMPLETION-REPORT.md`](./APP7-X01-COMPLETION-REPORT.md)

```text
APP7 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED
NEXT_PHASE = APP8
```

Every row is read from the committed repository — reports, commits, the generated
OpenAPI artifact, the migration files, the Figma registry. Nothing was
regenerated, re-executed or inferred.

No real merchant bank value appears in this document.

---

## 1. Canonical checkpoint count

```text
canonical checkpoints                    = 15
  R00 G01 B01 W01 B02 B03 DB01 B05 B04 B06 D01 A01 S01 E01 X01

correction / final-directive checkpoints =  6   over 4 parents
  B01-C1, B01-FD1   (parent B01)
  W01-C1            (parent W01)
  B04-C1, B04-FD1   (parent B04)
  A01-C1            (parent A01)

non-checkpoint interventions             =  1   (E01-U01)
pre-closure APP7 commits                 = 37
closure commit                           =  1
```

---

## 2. Checkpoint matrix

| # | Checkpoint | Final status | Correction history | Commits | Report | Blockers |
|---|---|---|---|---|---|---|
| 1 | `APP7-R00` | `COMPLETE` | none | `8821059` | [R00](./APP7-R00-COMPLETION-REPORT.md) | 0 |
| 2 | `APP7-G01` | `COMPLETE` | none | `8c83f38` | [G01](./APP7-G01-COMPLETION-REPORT.md) | 0 |
| 3 | `APP7-B01` | `COMPLETE — CORRECTED — REVIEW_ACCEPTED` | one correction attempt (`C1`), then a final mandatory directive (`FD1`); **no C2** | `b7aa2a6`, `8ab64ea` | [B01](./APP7-B01-COMPLETION-REPORT.md) | 0 |
| 3a | `APP7-B01-C1` | `SUPERSEDED_BY_FINAL_AUTHORITY_REPAIR` | removed the invented SKU-code alphabet but kept `min(1)`/`max(64)` as "payload bounds" — still invented | `079f812`, `dfc64de` | [B01-C1](./APP7-B01-C1-CORRECTION-REPORT.md) | 0 |
| 3b | `APP7-B01-FD1` | `COMPLETE — REVIEW_ACCEPTED` | restored exact SKU-code authority; superseded `C1` | `a1eccfc`, `fa3a659` | [B01-FD1](./APP7-B01-FD1-FINAL-REPORT.md) | 0 |
| 4 | `APP7-W01` | `COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED` | `C1` accepted; no further correction | `956364a`, `0784e73` | [W01](./APP7-W01-COMPLETION-REPORT.md) | 0 |
| 4a | `APP7-W01-C1` | `COMPLETE — REVIEW_ACCEPTED` | removed duplicated Order/Payment persistence from the worker; moved the delivered DB7 implementations **unchanged** into `@embroidery/persistence` (IMP-D054) | `59399f6`, `de0b618` | [W01-C1](./APP7-W01-C1-CORRECTION-REPORT.md) | 0 |
| 5 | `APP7-B02` | `COMPLETE — REVIEW_ACCEPTED` | none | `c3c4f2a`, `7e2147b` | [B02](./APP7-B02-COMPLETION-REPORT.md) | 0 |
| 6 | `APP7-B03` | `COMPLETE — REVIEW_ACCEPTED` | none | `3397dec`, `b5f7bf2` | [B03](./APP7-B03-COMPLETION-REPORT.md) | 0 |
| 7 | `APP7-DB01` | `COMPLETE — REVIEW_ACCEPTED` | none | `2d51870`, `f950c86` | [DB01](./APP7-DB01-COMPLETION-REPORT.md) | 0 |
| 8 | `APP7-B05` | `COMPLETE — REVIEW_ACCEPTED` | none | `7856269`, `1666a55` | [B05](./APP7-B05-COMPLETION-REPORT.md) | 0 |
| 9 | `APP7-B04` | `COMPLETE — CORRECTED — REVIEW_ACCEPTED` | one correction attempt (`C1`), then a final mandatory directive (`FD1`); **no C2** | `dec42cc`, `7a65527` | [B04](./APP7-B04-COMPLETION-REPORT.md) | 0 |
| 9a | `APP7-B04-C1` | `SUPERSEDED_BY_FINAL_AUTHORITY_REPAIR` | separated observed bank evidence from the expected reference, but left one invented bound on the observed value | `371a2f8` | [B04-C1](./APP7-B04-C1-CORRECTION-REPORT.md) | 0 |
| 9b | `APP7-B04-FD1` | `COMPLETE — REVIEW_ACCEPTED` | removed the last invented bound on observed bank evidence | `3689dc1` | [B04-FD1](./APP7-B04-FD1-FINAL-REPORT.md) | 0 |
| 10 | `APP7-B06` | `COMPLETE — REVIEW_ACCEPTED` | none | `ef4e32a`, `a41a805` | [B06](./APP7-B06-COMPLETION-REPORT.md) | 0 |
| 11 | `APP7-D01` | `COMPLETE — PRODUCT_OWNER_APPROVED` | none | `9e30e37`, `5b9c90d`, `df61eb7` | [D01](./APP7-D01-COMPLETION-REPORT.md) | 0 |
| 12 | `APP7-A01` | `COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED` | `C1` accepted; **no C2** | `a3956fd`, `2907b2d` | [A01](./APP7-A01-COMPLETION-REPORT.md) | 0 |
| 12a | `APP7-A01-C1` | `COMPLETE — REVIEW_ACCEPTED` | split the oversized order-detail stylesheet | `07eeb1d` | [A01-C1](./APP7-A01-C1-CORRECTION-REPORT.md) | 0 |
| 13 | `APP7-S01` | `COMPLETE — REVIEW_ACCEPTED` | none | `8037cd2`, `de8607c` | [S01](./APP7-S01-COMPLETION-REPORT.md) | 0 |
| 14 | `APP7-E01` | `COMPLETE` | none — finalized at `X01` with the Product Owner's manual scan `PASS` | `a062272`, `11e1a6d` | [E01](./APP7-E01-COMPLETION-REPORT.md) | 0 |
| 14a | `APP7-E01-U01` | `COMPLETE` — narrow blocking-unblock, **not** a correction | n/a | `ca5f336` | [E01-U01](./APP7-E01-U01-UNBLOCK-REPORT.md) | 0 |
| 15 | `APP7-X01` | `COMPLETE` | none | the closure commit | [X01](./APP7-X01-COMPLETION-REPORT.md) | 0 |

---

## 3. Contract matrix — 13 APP7-owned HTTP operations

Final committed baseline, read from `packages/contracts/openapi/openapi.generated.json`:

```text
85 paths / 92 operations / 191 schemas
delta vs APP6:  +13 paths / +13 operations / +24 schemas / 0 removed
```

| Operation group | Operation ids | Owner | Final status |
|---|---|---|---|
| Admin SKU authoring (2) | `adminSku_create`, `adminSku_update` | `APP7-B01` (+`C1`, `FD1`) | `DELIVERED` |
| Admin order read (2) | `adminOrder_list`, `adminOrder_detail` | `APP7-B02` | `DELIVERED` |
| Customer deposit + QR (3) | `publicOrderDeposit_current`, `publicOrderDeposit_initiate`, `publicOrderDeposit_qr` | `APP7-B03` | `DELIVERED` |
| Customer transfer evidence (2) | `publicOrderDepositEvidence_upload`, `publicOrderDepositEvidence_status` | `APP7-B05` | `DELIVERED` |
| Admin verification + reconciliation (3) | `adminOrderPayment_read`, `adminPaymentAttempt_verify`, `adminPaymentAttempt_review` | `APP7-B04` (+`C1`, `FD1`) | `DELIVERED` |
| Admin evidence delivery (1) | `adminPaymentEvidence_get` | `APP7-B06` | `DELIVERED` |
| **Total** | **13** | | |

`APP7-W01` (worker), `APP7-DB01` (schema), `APP7-D01` (design), `APP7-A01` and
`APP7-S01` (frontend) added **no** HTTP operation.

---

## 4. Database matrix

Final committed baseline: **37 migrations / 79 tables**. Nothing was applied by
`APP7-X01`.

| Migration | Table | Authority | Final status |
|---|---|---|---|
| `0037_add_app7_transfer_evidence_association.sql` | `payment_transfer_evidence` | `APP7-DB01`; `PO-APP7-001`, `APP7-G01` §7 and §9, `ADR-DB4-003` (CTX-PAY / AGG-16 context-owned association) | `DELIVERED` |

Shape, read from the migration file:

| Property | Value | Status |
|---|---|---|
| attempt FK | `payment_attempts(id) ON DELETE restrict` | confirmed |
| asset FK | `assets(id) ON DELETE restrict` | confirmed |
| pair uniqueness | `UNIQUE(payment_attempt_id, asset_id)` | confirmed |
| `role` column | none — one meaning, no single-value discriminator | confirmed |
| JSONB | none | confirmed |
| DB max-five rule | none — `MAX_EVIDENCE_PER_ATTEMPT = 5` is an application guard under the attempt row lock (`APP7-B05`) | confirmed |
| `updated_at` | none — the association is append-only | confirmed |

`LAUNCH_TABLES = 78` and `TOTAL_TABLES = 79` are deliberately different:
`payment_transfer_evidence` is the 79th table and is not a launch table.

---

## 5. Design matrix

| Property | Value |
|---|---|
| D01 registry rows (APP7) | **39** |
| `APPROVED_FOR_IMPLEMENTATION` | **39** |
| `REVIEW_REQUIRED` (APP7) | **0** |
| Approval evidence | `FIG-APPROVAL-APP7-D01-PO-001` (all 39 rows) |
| Figma file / page | `BQwqV8GdfUIELvsQDB1UQE` / `APP_07`, root section `728:3` |
| Implementation consumers | `APP7-A01` (+`C1`) — `/orders`, `/orders/{orderId}`; `APP7-S01` — `/truy-cap/thanh-toan` |
| Figma mutated by `X01` | **no** |
| Live checker re-run by `X01` | **no** (no registry row changed) |
| Final status | `FIGMA_RUNTIME_DESIGN_GATE = SATISFIED` |

Note: `FIG-APP7-A01-STALE-CONFLICT` is a frame **name** (the Admin *Concurrent &
Stale Result* specification), not a status. Its status is
`APPROVED_FOR_IMPLEMENTATION`.

---

## 6. Acceptance matrix

| Tier | Evidence | Result |
|---|---|---|
| Automated cross-layer | `E01-01` … `E01-06`, one serial aggregate over the real topology | **6 / 6 PASS** |
| Browser | one focused Playwright project — Admin 1440×900, Storefront 1440×900, Storefront 390×844 | **PASS** |
| Real bank-app QR scan | Product Owner, external human evidence, on the QR prepared by `E01-U01` | **PASS** |
| — bank/account pre-fill match | | `true` |
| — deposit amount pre-fill match | | `true` |
| — transfer reference pre-fill match | | `true` |
| — transfer submitted | | `false` |
| Bank settlement memo roundtrip | requires an executed transfer | `NOT_PROVEN` (operational follow-up) |
| APP8 handoff | `DepositEligibilityPort` resolved from the real API graph; false → true across DEPOSIT satisfaction | **PASS** |
| Blocking defects | | **0** |

Journey outcomes:

```text
CATALOG_ORDER_CREATION           = PASS
COP_ORDER_CREATION               = PASS
OPTIONAL_EVIDENCE                = PASS
ADMIN_MANUAL_VERIFICATION        = PASS
CUSTOMER_DEPOSIT_CONFIRMATION    = PASS
APP8_DEPOSIT_ELIGIBILITY_HANDOFF = PASS
```

---

## 7. Follow-up matrix

### 7.1 Disposition vocabulary

```text
CLOSED_PASS                     external evidence closed it
CLOSED_RESOLVED_BY_<checkpoint> a delivered change closed it
CLOSED_BY_<checkpoint>          a delivered change closed it (in-phase)
NO_CHANGE_ROUTED                examined; APP7 correctly needs nothing
CARRIED_NONBLOCKING             real debt, named owner, does not block APP8
DEFERRED                        recorded in the decision register, stays open
PRE_EXISTING_CROSS_PHASE        another phase owns it; APP7 does not rewrite it
```

### 7.2 The matrix

| Id | Status | Blocking? | Owner / route | Closure evidence |
|---|---|---|---|---|
| `FU-APP7-E01-DEV-COMPOSE-MERCHANT-01` | `CLOSED_RESOLVED_BY_APP7-E01-U01` | no | `APP7-E01-U01` | `api` 4/4 and `staff-bootstrap` 4/4 merchant keys in the rendered Compose config; dev API healthy in ~25 s, `/api/health` 200; `staff-bootstrap` exit 0; B03 fail-fast preserved against the real `${VAR:-}` substitution |
| `FU-APP7-E01-BANK-SCAN-ENV-01` | `CLOSED_PASS` | no | operator + Product Owner | operator set the four `APP7-G01` §3 variables; U01 generated one real QR (`200 / image/png`, not committed); Product Owner scan `PASS` with three exact pre-fill matches and no transfer |
| `FU-APP7-W01-ORDER-CHAIN-GUARD-DUPLICATION-01` | `CLOSED_BY_APP7-W01-C1` | no | `APP7-W01-C1` | `WorkerOrderChainGuard` deleted; one canonical Order/Payment persistence in `@embroidery/persistence`; IMP-D054 |
| `FU-APP7-B01-01` | `CARRIED_NONBLOCKING` | no | Admin audit readability / future catalog work | audit rows name the owning Product and changed fields, per the delivered `product.placement_replaced` precedent; no audit fact is missing |
| `FU-APP7-S01-EXACT-MONEY-PROMOTION-01` | `CARRIED_NONBLOCKING` | no | APP6-scoped Storefront shared-presentation work | promoting the pair would move a delivered APP6 module out from under its own boundary guard; each copy is guarded by its own suite today |
| `FU-APP7-S01-SHARED-DIALOG-01` | `CARRIED_NONBLOCKING` | no | Storefront shared UI primitive | third hand-rolled scrim/focus-trap in the Storefront; a shared primitive is now clearly worth its scope |
| `FU-ADMIN-SHARED-DIALOG-01` | `CARRIED_NONBLOCKING` | no | Admin shared UI primitive | the same debt on the Admin side |
| `FU-APP7-S01-SCSS-GATE-01` | `CARRIED_NONBLOCKING` | no | repository tooling (`tools/check-file-size.mjs`) | APP7 runtime SCSS complies with ≤ 400 lines; the checker scans `.ts/.tsx/.js/.jsx/.mjs/.cjs` only; historical oversized SCSS is outside APP7 change impact; **no tooling modified in X01** |
| S01 design/backend reconciliation — customer total Order amount | `ROUTED_NONBLOCKING_DESIGN_RECONCILIATION` | no | `APP7-D01` frames / design maintenance | `CustomerDepositResponse` carries no order total; deriving it from a 40 % deposit is forbidden recomputation; row omitted |
| S01 design/backend reconciliation — customer verification timestamp | `ROUTED_NONBLOCKING_DESIGN_RECONCILIATION` | no | same | no verification timestamp on any customer operation; the confirmation states the fact without dating it |
| S01 design/backend reconciliation — confirmation evidence-count contexts | `ROUTED_NONBLOCKING_DESIGN_RECONCILIATION` | no | same | evidence is addressed by `attemptId`; the panel renders wherever an attempt exists and is absent otherwise |
| `IMP-O007` | `OPEN — DEFERRED_PROVIDER_INTEGRATION` | no | decision register | nothing to integrate under `MANUAL_BANK_TRANSFER`; the `GRD-011` signature half has no provider signature to verify |
| `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` | `PRE_EXISTING_CROSS_PHASE` | no | APP6 | `tools/check-report-secrets.mjs` (no path argument) reports one line in `APP6-B04-COMPLETION-REPORT.md`:93, last written at `63393e9`, untouched by APP7; **APP6 history is not rewritten** |

### 7.3 APP6 follow-ups routed into APP7 at `R00`

| Id | Disposition | Evidence |
|---|---|---|
| `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` | `CLOSED_BY_APP7-W01` | classified `STALE_TEST_EXPECTATIONS` at R00 — a DB7-era raw-SQL fixture missing the `NOT NULL` codes migration `0034` added; no runtime code involved; repaired by W01, whose acceptance reads those suites |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | `CLOSED_BY_APP7-W01` | APP7 was the third consumer (`orders.code`); the shared human business-code mechanism was promoted and recorded as **IMP-D053** |
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | `NO_CHANGE_ROUTED` | APP7 binds to the exact accepted version through three `NOT NULL` columns and never reads `current_quotation_id` or "the latest quotation" |
| `FU-APP6-B10-AGREEMENT-ACTOR-01` | `NO_CHANGE_ROUTED` | APP7's payment and order authority comes from the Approval Snapshot's own frozen evidence; agreement publisher attribution is never an input to GRD-009, GRD-011 or GRD-012 |

### 7.4 Counts

```text
APP7-entered items             = 11   (8 FU ids + 3 S01 design reconciliation items)
  closed                       =  3   DEV-COMPOSE-MERCHANT, BANK-SCAN-ENV, W01-ORDER-CHAIN-GUARD
  carried nonblocking          =  5   B01-01, S01-EXACT-MONEY, S01-SHARED-DIALOG,
                                      S01-SCSS-GATE, ADMIN-SHARED-DIALOG
  routed design reconciliation =  3   order total, verification timestamp, evidence-count contexts

APP6 FU ids routed in at R00   =  4   (2 closed by APP7-W01, 2 no change routed)
deferred                       =  1   (IMP-O007)
pre-existing cross-phase       =  1   (FU-APP6-B04-REPORT-SECRET-HEURISTIC-01)

distinct FU ids across all APP7 documents = 13, plus IMP-O007

BLOCKING_FOLLOW_UPS = 0
```

---

## 8. Boundary matrix

| APP7 owns | APP8 owns | APP9 owns |
|---|---|---|
| Order creation from `design.approved` at `AWAITING_DEPOSIT` | inventory reservation | remaining payment collection |
| Frozen `OrderItems` priced from the exact ACCEPTED quotation version | inventory holds | refund and cancellation |
| `DEPOSIT` **and** `REMAINING` obligations, distinct from the first instant | production operations and jobs | shipping |
| `order.created` | consumption of `DepositEligibilityPort(orderId)` | delivery |
| Customer secure deposit route, exact bank instructions, dynamic QR, QR download | | final settlement |
| Optional transfer evidence — `SUPPORTING_ONLY`, never a payment decision | | execution of the `REMAINING` obligation |
| Admin exact manual verification → attempt `SUCCEEDED` → `DEPOSIT SATISFIED` → same Order `DEPOSIT_PAID` → `payment.verified` | | |
| Admin `REQUIRES_REVIEW` reconciliation on mismatch | | |
| `DepositEligibilityPort` as the published APP8 authority | | |

```text
APP7 inventory writes   = 0
APP7 production writes  = 0
APP8 writes by APP7     = 0
APP9 execution in APP7  = NONE
REMAINING_PAYMENT_EXECUTION = DEFERRED_TO_APP9
```

---

## 9. Payment MVP lock

```text
PAYMENT_COLLECTION            = MANUAL_BANK_TRANSFER
PAYMENT_PROVIDER              = NONE
WEBHOOK                       = NONE
AUTOMATIC_BANK_RECONCILIATION = NONE

DYNAMIC_QR                    = DELIVERED
QR_DOWNLOAD                   = DELIVERED
REAL_BANK_APP_SCAN            = PASS
ADMIN_MANUAL_VERIFICATION     = DELIVERED

TRANSFER_EVIDENCE_REQUIRED    = false
TRANSFER_EVIDENCE_SUPPORTED   = true
TRANSFER_EVIDENCE_AUTHORITY   = SUPPORTING_ONLY

IMP-D052 = PO-APP7-001, locked by APP7-G01
IMP-O007 = OPEN — DEFERRED_PROVIDER_INTEGRATION (nonblocking)
```

---

## 10. Closure commits

```text
branch = production
HEAD at entry = ca5f336
pushed = false
historical implementation commits amended = none
```

```text
docs(app7): close deposit payment and order creation phase (APP7-X01)
```

Contents: the finalized `APP7-E01` report, the `APP7-X01` completion report, this
matrix, the APP7 phase document and the master roadmap. Documentation only — no
production source, schema, generated artifact, Figma node or tooling changed.
