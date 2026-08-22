# APP7-R00 — Completion Report

- Checkpoint: `APP7-R00` — Phase Entry Audit and Roadmap Reconciliation
- Mode: `AUDIT / ROADMAP_RECONCILIATION / NO_IMPLEMENTATION`
- Branch / HEAD at entry: `production` @ `58c4aeb`
- Date: 2026-08-22
- Verdict: **`APP7-R00 = COMPLETE`**

---

## 1. What this checkpoint did

It established APP7's execution authority from current repository truth and
replaced the phase's planning-era candidate list with a reconciled, dependency-
ordered roadmap. It changed **documentation only**.

Deliverables:

- [`../audits/APP7_PHASE_ENTRY_AUDIT.md`](../audits/APP7_PHASE_ENTRY_AUDIT.md) — new
- [`APP7-R00-COMPLETION-REPORT.md`](./APP7-R00-COMPLETION-REPORT.md) — this file, new
- [`../phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md`](../phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md) — updated
- [`../10-MASTER-APPLICATION-ROADMAP.md`](../10-MASTER-APPLICATION-ROADMAP.md) — updated

No runtime source, schema, migration, generated artifact, OpenAPI document,
generated client or Figma node was touched. Nothing was pushed.

---

## 2. Baseline — recomputed, no delta

```text
branch              production
entry HEAD          58c4aeb
working tree        clean
ccd946a (APP6-X01)  reachable
fdb0e9a (APP6-E01-C1) reachable
```

| Artifact | APP6-X01 expectation | Recomputed | Verdict |
|---|---|---|---|
| OpenAPI paths / operations / schemas | 72 / 79 / 167 | 72 / 79 / 167 | identical |
| APP6-owned operations | 16 | 16 | identical |
| Migrations | 36, `0036_add_app6_cop_design_context.sql` | 36, same | identical |
| Figma `APP_06` | 56 `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP6-D01-PO-001` | 56, same | identical |
| APP7 HTTP operations | — | **0** | new phase |
| Figma `APP7` / `APP_07` rows | — | **0** | design gate open |

OpenAPI SHA-256 recorded for the APP7 baseline:
`a9474daa76297d00d783af244c0045af12b0ca0794c5915654639d3502e46489`.

APP6 was not reopened.

---

## 3. The three findings that changed the plan

### 3.1 Order creation is not gated on the deposit

`TR-LC14-01` creates the Order **on the approval event**, at `AWAITING_DEPOSIT`,
with **both** payment obligations in the same transaction. The verified deposit
is the *next* transition, `TR-LC14-02`.

This is not only prose. `payment_obligations.order_id` is `NOT NULL` with a
foreign key to `orders`, and `payment_attempts.payment_obligation_id` is
`NOT NULL`. **No deposit obligation, and therefore no attempt, can exist before
the Order row exists.**

The original candidate list ran `B01 deposit obligation and checkout` first and
`B04 order conversion` last. That ordering cannot be executed — `B01` would have
to insert a row whose `NOT NULL` foreign key `B04` has not yet created. Order
conversion is now checkpoint 4 of 12; the customer deposit surface follows it.

### 3.2 The order-creation trigger already exists and has no consumer

`APP6-B11` already emits `design.approved` (SE-005) on the Approval Snapshot,
and labels it *"This is the APP7 hand-off"* in its own source. The accepted SE
catalog names it the *"order creation trigger"*, per approval snapshot, with an
idempotent retry on failure.

The worker's handler registry registers only `asset-normalization` and
`notification-delivery`; an unclaimed event type is abandoned with a warning.
Every approval since APP6-B11 has left a `PENDING` outbox row that nothing
consumes. That consumer is APP7's first runtime deliverable, and it is a worker
job handler, not an HTTP use case.

### 3.3 The Catalog order-item branch is unreachable — no SKU exists

`ck_order_items__exactly_one_subject` requires a Catalog line to name a
`sku_id`. `ProductRepository.addSku` exists but **no use case, controller or
HTTP operation calls it** — its only callers are two integration specs, and the
8 delivered `adminProduct` operations do not include SKU management.
`skus.product_variant_id` carries no unique constraint, so a variant may have
zero SKUs, and Approval Snapshots name a variant, never a SKU.

So a published Catalog variant currently has no SKU and cannot become an order
line. The **COP branch is unaffected and deliverable today** —
`customer_owned_products.name` supplies `product_name`, `sku_id` stays null.
APP6 delivered both branches to `APPROVED`; only one of them can currently
become an order.

`07-ADMIN-OPERATIONS.md` §41 lists **"Manage SKU"** as an Admin catalog
operation, so this is an inherited APP2 gap, not an APP7 design question. It is
resolved autonomously by scheduling `APP7-B01` (2 operations, catalog module).
APP2 is not reopened and its closure stands.

---

## 4. Inherited follow-ups

| Follow-up | Disposition |
|---|---|
| `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` | **Classified `STALE_TEST_EXPECTATIONS`.** `order-fixture.ts` is a DB7-era raw-SQL fixture; migration `0034` (APP3-DB01) later made `product_sides.code` and `embroidery_areas.code` `NOT NULL`, and the fixture supplies neither. No runtime code is involved. Routed to `APP7-W01`, whose acceptance reads those suites |
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | **Does not block APP7.** APP7 binds to the exact accepted version through three `NOT NULL` columns and never reads `current_quotation_id` or "the latest quotation". No requote lifecycle or LC-11 edge is invented; `TR-LC14-09/10` (`ON_HOLD` / resume) is deferred for the same reason |
| `FU-APP6-B10-AGREEMENT-ACTOR-01` | **No change routed.** APP7's payment and order authority comes from the Approval Snapshot's own frozen evidence; agreement publisher attribution is never an input to GRD-009, GRD-011 or GRD-012 |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | **APP7 is the third consumer.** `orders.code` is `NOT NULL` with `uq_orders__code` and nothing generates it. `quotation-code.ts` explicitly left the promotion to whoever needed the third code. Routed to `APP7-W01` |
| Secure access | **Reuse only.** `GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']`; GRD-003's step-up set already names "pay". No new token, grant scope or secure-link architecture |

---

## 5. Dispositions

```text
APP7_SCHEMA_DISPOSITION           = NO_MIGRATION_REQUIRED
APP7_DESIGN_GATE                  = DESIGN_REQUIRED_BEFORE_UI_ONLY
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
APP7_INVENTORY_DISPOSITION        = DEFERRED_TO_APP8
```

- **Schema** — every physical invariant APP7 needs is installed at `0036`:
  `uq_orders__request`, `ck_order_items__exactly_one_subject`,
  `(order_id, kind)` on obligations, `(provider_key, provider_event_ref)` on
  provider events, `(operation_namespace, scope_key)` on idempotency records.
  No `APP7-DB01` is scheduled.
- **Provider** — `IMP-O007` stays **open**. `BANK_TRANSFER` is an accepted
  attempt method and `providerKey` / `providerRef` are nullable, so a truthful
  manual verification flow needs no provider, no migration and no invented
  state. Provider-dependent slices are deferred with `IMP-O007` and are additive
  later.
- **Inventory / production** — untouched. APP7's only obligation toward APP8 is
  the already-delivered `DepositEligibilityPort`.

---

## 6. Candidate reconciliation

All **15** original candidates were audited; none was omitted. Each carries
exactly one action in [the audit §17](../audits/APP7_PHASE_ENTRY_AUDIT.md).

| Action | Count | Candidates |
|---|---:|---|
| `REMOVE` | 3 | `C01`, `C03`, `C04` — contract-only slices; the owning NestJS checkpoint publishes OpenAPI itself |
| `REDEFINE` | 3 | `S01` (no provider redirect), `W01` (reconciliation → order conversion), `B03` (visibility → verification) |
| `KEEP` | 3 | `A01`, `E01`, `X01` |
| `DEFER` | 2 | `C02`, `B02` — provider-dependent, deferred with `IMP-O007` |
| `MERGE` | 2 | `A02` → `A01`, `S02` → `S01` |
| `SPLIT` + `REORDER` | 1 | `B01` — obligation creation moves into the order transaction; attempt initiation becomes `B03` |
| `REORDER` | 1 | `B04` — order conversion becomes the first runtime slice, as `W01` |

Total: **15**, one action each.

Three checkpoints were added, each evidence-backed: `APP7-G01` (authority),
`APP7-B01` (the SKU gap), `APP7-D01` (design package). The original candidate
section is preserved in the phase document as planning history and marked
non-executable.

---

## 7. Authoritative roadmap

12 checkpoints, published in
[`../phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md`](../phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md) §7:

```text
R00 -> G01 -> B01 -> W01 -> B02 -> B03 -> B04 -> D01 -> A01 -> S01 -> E01 -> X01
```

Predicted HTTP surface: **9 new operations** (72 → ~79 paths), across four
backend slices of 2 / 2 / 2 / 3 — all within 1–3 normal, none at the hard
maximum of 5. No contract-only `C` checkpoint, because the owning NestJS
checkpoint publishes its own OpenAPI. Authority precedes payment code, design
precedes UI, and APP8/APP9 stay outside.

---

## 8. Product Owner decision

```text
TRUE_PO_DECISIONS = 1
```

**PO-APP7-001 — Deposit collection method for MVP.** `IMP-O007` is open and no
accepted authority chooses between (a) manual bank transfer with Admin
verification, deliverable now with no provider and no migration, and (b) locking
a payment provider first under an ADR. The two change what the customer and the
Admin actually do, so it is not resolved autonomously. The roadmap assumes (a)
and is built so (b) is additive.

Everything else was resolved from accepted authority — including the SKU gap,
the fixture failure, the conversion ordering and the code-generator promotion.

---

## 9. Validations run

Scoped to what an audit justifies
(`VALIDATION_GOVERNANCE.md` §3). No repository-wide aggregate.

| Command / check | Question | Result | Reruns |
|---|---|---|---:|
| `git rev-parse` / `status --porcelain` / `merge-base --is-ancestor` | branch, HEAD, tree, `ccd946a`, `fdb0e9a` | `production` @ `58c4aeb`, clean, both reachable | 0 |
| `node -e` over `packages/contracts/openapi/openapi.generated.json` | paths / operations / schemas / tags | 72 / 79 / 167; 0 APP7 operations | 0 |
| `sha256sum openapi.generated.json` | contract identity | `a9474daa…e46489` | 0 |
| `ls packages/database/migrations/*.sql \| wc -l` | migration count / highest | 36 / `0036_add_app6_cop_design_context.sql` | 0 |
| `grep` over `docs/design/FIGMA_DESIGN_INDEX.md` | APP6 approval, APP7 rows | 56 under `FIG-APPROVAL-APP6-D01-PO-001`; 0 APP7 rows | 0 |
| `npx jest src/modules/order/tests/integration/order.integration.spec.ts` | runtime defect or stale fixture? | 28/28 fail at one line — `product_sides.code` NOT NULL in `order-fixture.ts:127` | 0 |
| `grep` over `0034_…sql` | when did those columns become `NOT NULL`? | `0034` (APP3-DB01), both `product_sides` and `embroidery_areas` | 0 |
| `grep -rn addSku` | any application path creating SKUs? | two integration specs only | 0 |
| `grep -rn "eventType: '"` | which outbox events does the runtime emit? | `order.created` only | 0 |
| read-only source and document reads | ports, schemas, guards, lifecycles, business rules, admin operations, decision register | as cited in the audit | 0 |

**Not run, deliberately:** `pnpm quality`, `quality:e2e`, full Jest / Playwright
/ API / DB / Order suites, repository-wide build or typecheck, SonarQube,
historical phase sweeps. One representative suite named the AGG-15 cause
completely; the two sibling suites share the same fixture, so rerunning them
would have added no information. No successful command was rerun on unchanged
input and no known-red command was looped.

The one red command was run **once**, to classify, and was not repaired here.

---

## 10. Changed files

```text
A  docs/implementation/audits/APP7_PHASE_ENTRY_AUDIT.md
A  docs/implementation/reports/APP7-R00-COMPLETION-REPORT.md
M  docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
M  docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
```

---

## 11. Risks and limitations

- **`PO-APP7-001` is unresolved.** `APP7-G01` should not start until the Product
  Owner rules on the deposit collection method; the ruling is `G01`'s primary
  output. If the PO chooses a provider, `APP7-D01`, `APP7-B03`, `APP7-B04` and
  `APP7-S01` change shape and the deferred `C02`/`B02` slices return.
- **The predicted HTTP paths in the audit §16 are predictions**, not contracts.
  Each owning checkpoint confirms its own routes against
  `04-BACKEND-API-DELIVERY-STANDARD.md` and publishes its own OpenAPI.
- **The AGG-15 suites are still red** and stay red until `APP7-W01`. Any
  checkpoint before then must not treat those suites as a signal.
- **`design.approved` outbox rows are accumulating unconsumed** in any
  environment where approvals have occurred since APP6-B11. `APP7-W01` will
  process the backlog on first run; the events are idempotent per approval
  snapshot, so this is correct behaviour, but the backlog size is worth checking
  before deploying the consumer.

---

## 12. Verdict

```text
APP7-R00                          = COMPLETE
APP7                              = AUDITED — NOT YET IMPLEMENTED
APP7_SCHEMA_DISPOSITION           = NO_MIGRATION_REQUIRED
APP7_DESIGN_GATE                  = DESIGN_REQUIRED_BEFORE_UI_ONLY
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
APP7_INVENTORY_DISPOSITION        = DEFERRED_TO_APP8
TRUE_PO_DECISIONS                 = PO-APP7-001 (deposit collection method)
NEXT CHECKPOINT                   = APP7-G01
```

Delivered for Product Owner review. The next checkpoint has not been started.
