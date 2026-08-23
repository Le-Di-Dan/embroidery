# APP7 — Deposit Payment and Order Creation

## 1. Outcome

Collect and verify the deposit obligation safely, reconcile provider outcomes, and convert the accepted quotation into exactly one order.

## 2. Dependencies

APP6 approved design and accepted quotation complete. Payment provider and signature/webhook strategy approved.

**Reconciled by `APP7-R00`:** `IMP-O007` is still open — no provider is locked.
The phase proceeds under `APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP`,
which needs no provider and no signature/webhook strategy. The provider-dependent
slices (checkout session initiation, webhook verification, provider event
ingestion) are **deferred with `IMP-O007`** and are additive when a provider is
locked. `PO-APP7-001` records the choice for the Product Owner.

**Ruled by `APP7-G01`:** the Product Owner locked
`PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE`.
There is no provider dependency in APP7, so this row's original "payment
provider and signature/webhook strategy approved" precondition **does not
apply**. Authority: [`../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md`](../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md).

## 3. Design policy

Design classification depends on selected provider UX. Complete one APP7 package for customer checkout/status and Admin reconciliation/order confirmation after provider behavior is known. No provider-specific assumptions before ADR.

**Reconciled by `APP7-R00`:** under the manual MVP the customer UX is known
without a provider — transfer instructions, pending, verified, failed, expired —
so `APP7-D01` is schedulable after `APP7-G01` records the ruling. It carries no
provider-specific checkout. `APP7_DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI_ONLY`
(0 `APP7` / `APP_07` rows exist in `FIGMA_DESIGN_INDEX.md`).

**Ruled by `APP7-G01`:** `APP7-D01` covers the complete manual bank-transfer
journey — instructions, merchant bank facts, exact VND amount, transfer
reference, dynamic QR with download, the **prominent** evidence reminder, the
optional evidence upload and its states, pending verification, verified deposit
and order confirmation; plus the Admin payment view with evidence preview and
manual verification. No provider-specific checkout UX.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

Original phase scope, preserved:

- Deposit obligation creation.
- Checkout/session initiation.
- Provider callback/webhook verification.
- Payment attempt/status/reconciliation.
- Duplicate and out-of-order callback handling.
- Exactly-once quotation-to-order conversion.
- Admin payment/order visibility.
- Customer deposit status/confirmation.

### 4.1 Scope as ruled by `APP7-G01`

In scope:

- Order conversion from `design.approved`, with both obligations (INV-04).
- Deposit obligation creation inside the order transaction.
- `BANK_TRANSFER` payment attempt initiation with a server-derived reference.
- Server-generated dynamic bank-transfer QR, viewable and downloadable.
- **Optional** customer transfer-evidence upload (image), append-only.
- Admin evidence preview through authorized private delivery.
- Admin manual server-side verification, review and reconciliation evidence.
- Duplicate/concurrent verification and duplicate upload safety.
- Admin payment/order visibility; customer deposit status and confirmation.

Replaced, and **not** built in APP7 — deferred with `IMP-O007`:

- Provider checkout/session initiation.
- Provider callback/webhook verification and ingestion.
- Out-of-order provider callback handling.

## 5. Out of scope

- Remaining payment.
- Refund/cancellation beyond approved deposit policy.
- Inventory/production execution.
- Success based only on browser redirect.
- Any payment state change caused by QR generation, QR download, a customer
  asserting payment, or an evidence upload — only Admin verification moves
  payment truth (`APP7-G01` §7.6).

## 6. Original candidate engineering checkpoints (planning history)

**Superseded by §7 after `APP7-R00`.** Preserved verbatim as planning history.
Every row below is reconciled with exactly one action in
[`../audits/APP7_PHASE_ENTRY_AUDIT.md`](../audits/APP7_PHASE_ENTRY_AUDIT.md) §17.
**Do not execute from this list.**

These were planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP7-C01 — Deposit checkout contract:** Define create/get deposit obligation, initiate checkout, and customer status operations.
- **APP7-B01 — Deposit obligation and checkout:** Implement exact amount/currency/reference, eligibility, idempotency and provider port.
- **APP7-S01 — Deposit checkout/status UI:** Implement initiation, pending, verified, failed, expired and retry-safe states.
- **APP7-C02 — Payment callback contract:** Define the provider webhook as an isolated security-sensitive endpoint.
- **APP7-B02 — Webhook application:** Implement signature verification, raw payload handling, duplicate/out-of-order safety, safe logging and tests.
- **APP7-W01 — Payment reconciliation:** Implement bounded reconciliation job/manual trigger path with attempt evidence.
- **APP7-C03 — Admin payment operations contract:** Define payment list/detail/reconcile/status operations within five endpoints.
- **APP7-B03 — Admin payment queries/actions:** Implement authorized operational visibility without exposing secrets.
- **APP7-A01 — Admin payment/reconciliation view:** Implement payment state, provider reference, safe retry/reconcile and audit visibility.
- **APP7-B04 — Order conversion:** Implement one atomic/idempotent accepted-quotation-to-order conversion use case and outbox consequences.
- **APP7-C04 — Order read contract:** Define Admin/customer order confirmation/detail operations required immediately after conversion.
- **APP7-A02 — Admin order confirmation/detail:** Implement initial order visibility.
- **APP7-S02 — Customer order confirmation:** Implement verified deposit/order confirmation without claiming production started.
- **APP7-E01 — Deposit-to-order E2E:** Accepted quote → deposit checkout → verified callback/retry → exactly one payment application and exactly one order → safe duplicate callback.
- **APP7-X01 — Phase closure:** Hand order and deposit truth to APP8.

## 7. Authoritative checkpoint roadmap (post-`APP7-G01`)

Established by [`../audits/APP7_PHASE_ENTRY_AUDIT.md`](../audits/APP7_PHASE_ENTRY_AUDIT.md)
and revised by [`../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md`](../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md) §15.
This table, not §6, is what APP7 executes.

| Order | Checkpoint | Purpose | Depends on | Main area | Predicted HTTP ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP7-R00` | Phase-entry audit and roadmap reconciliation | APP6-X01 | docs | 0 | the audit document |
| 2 | `APP7-G01` | Payment authority; `PO-APP7-001` locked | `R00` | docs | 0 | every APP7 rule cites accepted authority |
| 3 | `APP7-B01` | Admin SKU authoring (inherited APP2 gap) | `G01` | backend / catalog | 2 | a published variant resolves to exactly one ACTIVE SKU; duplicate codes refused |
| 4 | `APP7-W01` | Order conversion: `design.approved` consumer → order + items + both obligations + `order.created` | `B01`, `G01` | worker + order/payment | 0 | exactly one order per request under CC-11; Catalog **and** COP branches; AGG-15 suites green |
| 5 | `APP7-B02` | Admin order read (queue + detail) | `W01` | backend | 2 | frozen snapshot facts only; no live Catalog re-read |
| 6 | `APP7-B03` | Customer deposit read, `BANK_TRANSFER` attempt initiation, QR delivery | `W01` | backend | 3 | GRD-002 + GRD-003; exact amount, VND and reference; QR readable by a banking app; no payment state change |
| 7 | `APP7-DB01` | `payment_transfer_evidence` association (CTX-PAY) | `G01` | database | 0 | forward-only; both FKs `restrict`; no other table touched |
| 8 | `APP7-B05` | Customer transfer-evidence upload + own-evidence read | `DB01`, `B03` | backend | 2 | server-side binding; content-signature media check; 5-per-attempt bound; append-only; no payment state change |
| 9 | `APP7-B04` | Admin deposit verification, review and reconciliation evidence | `B03` | backend | 3 | GRD-011 server-side; CC-10 single application wins; obligation `SATISFIED` → order `DEPOSIT_PAID` |
| 10 | `APP7-B06` | Admin evidence delivery (authorized private stream) | `B05`, `B04` | backend | 1 | association-first; zero-write; no object key or URL disclosed; non-`ACCEPTED` refused |
| 11 | `APP7-D01` | Complete design package (Admin order/payment, customer deposit + QR + evidence) | `G01` | design | 0 | registry rows `APPROVED_FOR_IMPLEMENTATION`; prominent evidence reminder; no provider-specific checkout |
| 12 | `APP7-A01` | Admin order + payment screen with evidence preview | `D01`, `B02`, `B04`, `B06` | frontend | 0 | verification possible without evidence; no secret, key or raw payload rendered |
| 13 | `APP7-S01` | Customer deposit instructions, QR, evidence upload, confirmation | `D01`, `B03`, `B05` | frontend | 0 | truthful states; retry opens a new attempt; the three facts never collapsed |
| 14 | `APP7-E01` | Focused cross-layer acceptance | 3–13 | tests | 0 | `APP7-R00` §19 + `APP7-G01` §16 targets |
| 15 | `APP7-X01` | Phase closure; hand order and deposit truth to APP8 | `E01` | docs | 0 | follow-ups dispositioned; `DepositEligibilityPort` proven for APP8 |

Predicted HTTP surface: **13 operations** (72 → ~85 paths). Backend slices are
2 / 3 / 2 / 3 / 1 — all within 1–3 normal, none near the hard maximum of 5.

### 7.1 Dispositions carried into every APP7 checkpoint

```text
PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE

APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
IMP-O007                          = OPEN — DEFERRED_PROVIDER_INTEGRATION
APP7_SCHEMA_DISPOSITION           = MIGRATION_REQUIRED (evidence association only)
APP7_DESIGN_GATE                  = DESIGN_REQUIRED_BEFORE_UI_ONLY
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
APP7_INVENTORY_DISPOSITION        = DEFERRED_TO_APP8

QR_GENERATION  = SERVER_OWNED_DYNAMIC_TRANSFER_QR
QR_DOWNLOAD    = REQUIRED
QR_PERSISTENCE = NONE — deterministic regeneration

PAYMENT_REFERENCE = ORD<10-char order-code body><DC|RM>, ^[A-Z0-9]{15}$

TRANSFER_EVIDENCE_REQUIRED  = false
TRANSFER_EVIDENCE_SUPPORTED = true
TRANSFER_EVIDENCE_AUTHORITY = SUPPORTING_RECONCILIATION_ONLY
TRANSFER_EVIDENCE_STORAGE   = delivered asset intake, fourth lane, + one CTX-PAY
                              association table

PAYMENT_VERIFICATION = ADMIN_MANUAL_SERVER_SIDE
```

**Order creation is not gated on the deposit.** `TR-LC14-01` creates the order at
`AWAITING_DEPOSIT` on the approval event, with both payment obligations in the
same transaction; the verified deposit is `TR-LC14-02`. This reverses the §6
candidate ordering and is enforced physically by
`payment_obligations.order_id NOT NULL`.

**`APP7-R00` said `NO_MIGRATION_REQUIRED`.** That remains true for the payment
and order flow it audited. It is revised **only** for the evidence association,
which `ADR-DB4-003` requires to be a context-owned table and which no delivered
table can hold (`APP7-G01` §9).

## 8. Checkpoint status

| Checkpoint | Status | Note |
|---|---|---|
| `APP7-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP7-G01` | `COMPLETE` | Payment authority; `PO-APP7-001` locked; roadmap revised 12 → 15 |
| `APP7-B01` | `COMPLETE — CORRECTED — REVIEW_READY` | Admin SKU authoring — 2 ops (`adminSku_create`, `adminSku_update`). A variant can now reach exactly one order-eligible (`is_active`) SKU; the owning `product_variants` row is the concurrency arbiter; no schema or migration change. Report [`reports/APP7-B01-COMPLETION-REPORT.md`](../reports/APP7-B01-COMPLETION-REPORT.md) |
| `APP7-B01-C1` | `SUPERSEDED_BY_FINAL_AUTHORITY_REPAIR` | Removed the SKU-code alphabet B01 invented, but kept `min(1)`/`max(64)` as "payload bounds" — superseded by `APP7-B01-FD1`. Report [`reports/APP7-B01-C1-CORRECTION-REPORT.md`](../reports/APP7-B01-C1-CORRECTION-REPORT.md) |
| `APP7-B01-FD1` | `COMPLETE` | Final authority repair. `skus.code` is `text NOT NULL` with `uq_skus__code` and **no CHECK** (`0007_create_catalog_tables.sql:59,66`, unaltered by any later migration), compared bytewise under `C` (ADR-DB5-002 R1/R2): no alphabet, no length, no nonblank rule, no normalization. The request schema is now `z.string()` and `SKU_CODE_MAX_LENGTH` is deleted — a field rule rejecting an authority-valid database value is a contract constraint whatever the comment calls it, and transport abuse belongs to the delivered body-size controls. Published `code` is `{"type":"string"}` with no `pattern`/`format`/`enum`/`minLength`/`maxLength`. OpenAPI delta = 4 deleted lines; surface unchanged at 74/81/170. `APP7-B01-C2` = `MUST_NOT_BE_CREATED`. Report [`reports/APP7-B01-FD1-FINAL-REPORT.md`](../reports/APP7-B01-FD1-FINAL-REPORT.md) |
| `APP7-W01` | `COMPLETE — CORRECTED (C1)` | `design.approved` (SE-005) order-conversion consumer — the fourth handler on the delivered Outbox/worker runtime, 0 HTTP operations. One atomic transaction creates the order at `AWAITING_DEPOSIT`, its frozen items, **both** obligations (INV-04) and the canonical `order.created`; GRD-009 is re-read from persisted rows, the exact `ACCEPTED` version supplies the money unrecomputed, a Catalog line resolves exactly one `is_active` SKU (0 or several refuse) and a COP line names the frozen customer-owned product. `order.create` claims `(request, approval snapshot)`; `uq_orders__request` is the final arbiter, proved under a real two-pool CC-11 race. Closes `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` (stale `product_sides.code` / `embroidery_areas.code`, all three AGG-15 suites green) and `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` (IMP-D053). No schema, migration, OpenAPI or client change. Report [`reports/APP7-W01-COMPLETION-REPORT.md`](../reports/APP7-W01-COMPLETION-REPORT.md) |
| `APP7-W01-C1` | `COMPLETE` | **Correction — `W01_DUPLICATED_ORDER_PERSISTENCE_AUTHORITY` = REMOVED.** PO review found that W01 had re-implemented canonical DB7 authority inside the worker — a second GRD-009 (`WorkerOrderChainGuard`), a second `orders`/`order_items` writer, a second `payment_obligations` writer and a second `order.created` append — because the worker may not import `apps/api`. The boundary was real, the conclusion was not: a runtime boundary is a reason to **share** authority, not copy it, and two implementations of the chain check could disagree about which customer's approval pairs with which customer's price while every foreign key stayed satisfied (INV-19). The delivered DB7 implementations moved **unchanged** to `@embroidery/persistence` (`src/order/`, `src/payment/`) with `OrderPersistenceModule` / `PaymentPersistenceModule`; `apps/api` and `apps/worker` now import the same modules and resolve the same classes and the same Symbol tokens, with zero app-to-app edges and zero new workspace dependencies. Thin re-exports at the three delivered contract paths keep ~10 consumers (3 AGG-15 suites, 2 payment suites, 3 DB9 benchmarks, the DB10 durability suite, the Inventory eligibility guard) importing exactly what they did before. `WorkerOrderChainGuard` is **deleted**, not wrapped or renamed; the worker's remaining seam is reads-only and renamed `ConversionAuthorityRepository` accordingly, having also shed `findOrderByRequest`, the snapshot's `customerId` and the chain-only refusal code. A focused structural suite (`canonical-order-authority.spec.ts`, 7 assertions) pins single-token identity and forbids recurrence — verified to bite against a probe file, not merely to pass. Atomicity, `order.created`-exactly-once, money, CC-11, Catalog/COP, rollback, the code generator and the AGG-15 fixture are all unchanged and re-proved: worker 64, DB7 Order suites 36, payment persistence 29. `FU-APP7-W01-ORDER-CHAIN-GUARD-DUPLICATION-01` = `CLOSED_BY_APP7_W01_C1`; `APP7-W01-C2` = `MUST_NOT_BE_CREATED`. No schema, migration, OpenAPI or client change. Report [`reports/APP7-W01-C1-CORRECTION-REPORT.md`](../reports/APP7-W01-C1-CORRECTION-REPORT.md) |
| `APP7-B02` | `COMPLETE` | Admin order read — 2 ops (`adminOrder_list` on `GET /api/admin/orders`, `adminOrder_detail` on `GET /api/admin/orders/{orderId}`). Both answer from frozen order-owned truth: the read adapter queries `orders` and `order_items` and no other table, so `product_name`, `variant_label`, `size_label` and every amount are transported exactly as `APP7-W01` froze them, with no recomputation of `unit × quantity`, `sum(lines)` or a deposit percentage. Two real-database regressions mutate live Catalog *after* the order exists — a product rename, and a SKU repriced to 999999.00 and deactivated with the product's base price rewritten — and assert the **whole** detail response is byte-identical; a third proves the order total (2550000.00, including the accepted version's shipping fee) is not the line sum (2500000.00). The queue is an opaque keyset page on `ix_orders__status_created_id` (IDX-074), newest first with a descending `id` tie-break proved across three orders sharing one instant, bounded 1..100 (default 20), with one filter — `status` — and **no** invented triage default, so no `CANCELLED` or `ON_HOLD` order is silently hidden. Detail returns lines in frozen `position` order with the Catalog/COP branch derived response-only from the stored XOR; a COP line names its `customer_owned_product_id` and the serialized response contains neither the SKU nor the Product id. `APP7-W01-C1` is untouched: `AdminOrderModule` imports neither `OrderModule` nor any Catalog or Customer port, so `ORDER_REPOSITORY`, the one canonical `OrderChainGuard` and any live-state re-read are structurally out of both routes' reach. No payment attempt, obligation, transfer reference, evidence or provider field is published (`APP7-B04` owns that), though the order's own `DEPOSIT_PAID` state is reported. No schema or migration change. OpenAPI 74/81/170 → 76/83/174 — 600 inserted lines, **0 deleted** — and the client gains `adminOrderList`/`adminOrderDetail`. Focused evidence: 5 suites / 48 tests. Report [`reports/APP7-B02-COMPLETION-REPORT.md`](../reports/APP7-B02-COMPLETION-REPORT.md) |
| `APP7-B03` | `COMPLETE` | Customer secure deposit surface — exactly 3 ops, all `POST` and all on `publicOrderDeposit`: `publicOrderDeposit_current` (`/api/public/orders/deposit`), `publicOrderDeposit_initiate` (`/api/public/orders/deposit/attempts`) and `publicOrderDeposit_qr` (`/api/public/orders/deposit/qr`). All three are `POST` and none takes a locator, both for the same delivered reason: `ADR-APP4-001` §11 makes the URL fragment the only browser carrier for a secure token and forbids a path or query one outright, and a public route taking an order id would be an enumeration oracle for other customers' orders — so the binary QR is a `POST` returning `image/png` with `Content-Disposition: attachment`, and the order is reached from the grant through `uq_orders__request`, never from the caller. The checkpoint is one rule made **structural**: nothing a customer can do moves money's state, and the write module injects no `ORDER_REPOSITORY`, no outbox, no audit repository, no Admin guard and no provider client, so `SUCCEEDED`, `SATISFIED`, `DEPOSIT_PAID`, a reconciliation row and a provider event are unreachable from the injector rather than merely unwritten. The deposit amount and currency are the **DEPOSIT obligation's own frozen columns**, copied — no 40 % is recomputed, no quotation repository or deposit-policy reader is reachable from either module — and the REMAINING obligation is never read, never projected and byte-identical after an initiation. The G01 reference format is used verbatim (`ORD` + the 10-char order-code body + `DC`, `^[A-Z0-9]{15}$`), derived on every read from `(order code, kind)` and persisted nowhere; the deriving function takes one argument and has **no kind parameter**, so no APP7 caller can ask for APP9's `RM`. Initiation runs in one transaction — grant re-authorized under its row lock (ADR-DB3-004 r9), obligation must be `PENDING`, `payment.initiate` claimed on `(obligation, caller attempt key)` with the raw `Idempotency-Key` hashed into the scope key and never stored, then GRD-003's step-up **derived from the grant's customer** (no challenge id is accepted, and naming one is a 400), then the canonical AGG-16 `openAttempt`, which re-reads the obligation `FOR UPDATE` and is the real arbiter. The claim precedes the step-up on `quotation.accept`'s recorded precedent: a replay writes nothing, and gating it on a still-open window would tell a customer retrying after a dropped response to re-verify to see an attempt they already opened. The request bodies carry **only `token`** and are `.strict()`; `amount`, `currency`, `method`, `providerKey`, `providerRef`, `stepUpChallengeId`, `grantId`, `orderId` and `paymentObligationId` have nowhere to be sent. LC-16 is preserved by having no mutation path at all: same key replays one attempt, a new key opens a second while the first stays `PENDING`, a `FAILED` attempt is never reset, and a `SATISFIED` deposit refuses a new one with `DEPOSIT_NOT_PAYABLE` — **no active-attempt uniqueness was invented**, because accepted payment authority has none. The QR is generated locally and never stored: an EMVCo/NAPAS `QRIBFTTA` payload built by repository-owned code (including CRC-16/CCITT-FALSE) and drawn by `qrcode@1.5.4` (MIT), whose whole package contains no `http`/`https`/`net`/`dns`/`tls`/`fetch`/`XMLHttpRequest` — the property `APP7-G01` §6 requires, since a hosted generator would put the merchant account and the amount into a third party's request log. Conformance is proved **independently**: every field is re-parsed by a TLV reader written from the grammar, the CRC is checked against the standard's published vector (`"123456789"` → `0x29B1`) and a one-character tamper fails it, and the delivered PNG is decoded back through `pngjs` + `jsQR` to a byte-identical payload over real HTTP. Tags 59/60 are deliberately omitted (the beneficiary is identified inside tag 38 for this service code); the account-holder name still reaches the customer in the instructions. `REAL_BANK_APP_SCAN = NOT_EXECUTABLE_IN_AUTOMATED_ENVIRONMENT`, kept as `APP7-E01` E01-12 rather than simulated. Both reads are zero-write, proved against a full before/after snapshot of order status, both obligations, every attempt and the reconciliation/provider-event/refund counts — `updated_at` included, so nothing moves because a QR was viewed — and the grant is not consumed. The duplicate-initiation race is real: two concurrent HTTP requests on separate pool connections and separate transactions leave **exactly one** `PENDING` attempt, unique completed claims, and the obligation and order untouched. The merchant account is a module-scoped fail-fast provider over `APP7-G01`'s four exact variable names, none of which matches the `CLAUDE.md` §8a protected pattern (asserted, and deliberately: these values are printed on the customer's screen and encoded in the QR they scan); no value is interpolated into any error message, `.env.example` carries structural placeholders only, no write to `.env` was made and no credential was read or rotated. `APP7-W01-C1` is untouched — no file under `packages/persistence/` was modified and **no second payment writer exists**; the one new seam is a read-only Ordering port returning three columns, on the `CustomRequestQuotationPointerPort` precedent, so the deposit surface reaches the order without acquiring `transition()`. No evidence, Admin verification, provider or webhook capability; `IMP-O007` stays **open** and `payment_provider_events` stays empty. `SCHEMA_CHANGE = NONE`, `MIGRATION_CHANGE = NONE`. OpenAPI 76/83/174 → **79/86/180** (+3 paths, +3 operations, +6 schemas; **816 inserted lines, 0 deleted**, `sha256 8c544826…35e27600`) and the client gains all three truthfully, the QR typed `Blob` (+221 lines, 0 deleted, tree hash `48ee591e…c99a224e6`). Focused evidence: 7 suites / 145 tests; `BROAD_REGRESSION = NOT_RUN_BY_DESIGN`. Report [`reports/APP7-B03-COMPLETION-REPORT.md`](../reports/APP7-B03-COMPLETION-REPORT.md) |
| `APP7-DB01` | `COMPLETE` | `payment_transfer_evidence` (TBL-079) — the CTX-PAY typed asset association `PO-APP7-001` requires, migration `0037`, 0 HTTP operations. Exactly two business columns, `payment_attempt_id` and `asset_id`, both `NOT NULL` and both `ON DELETE RESTRICT`, plus the convention `id`/`created_at` and `UNIQUE (payment_attempt_id, asset_id)` (the CST-043 rule, minus the `role` column this table and `design_version_assets` both lack). `ADR-DB4-003` forbids a generic `asset_links` table and none of the seven delivered associations belongs to Payment: `custom_request_assets` is the nearest and still wrong, because its `role` set is a closed CHECK and it binds to the **request**, so a retry’s evidence could not be told from the previous attempt’s. **`MAX_EVIDENCE_PER_ATTEMPT = 5` is deliberately not physical** — a CHECK cannot count sibling rows, so it stays an application guard under the attempt row lock (`APP7-B05`), and the suite proves the database accepts a **sixth** row; the table also carries zero CHECKs and zero triggers, so no trigger family was invented. Both `restrict` edges are proved by deleting the parent for real (`23503`, association intact), duplicate pairs by `23505`, and a live `pg_index` scan proves neither column is individually unique. The 0036 → 0037 upgrade is **run**, not described: the real committed baseline seeds a payment chain and a `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` asset before the table exists, and afterwards the new table is empty and every pre-existing row is field-for-field unchanged — `backfill = none`. Live baseline 78 → **79** tables / 849 → **853** columns / 165 → **167** FK / 52 → **53** UNIQUE, CHECK 204 and triggers 34 unchanged, indexes 215 → **217** (both constraint-created; **no `IDX-*` slot allocated**); fingerprint rebased to `56294cd8…`, reproduced on two independent databases and gated on a third. `drizzle-kit generate` emitted the same truncated `ck_approval_snapshots__preview_hash_format` pair `APP6-DB01` predicted; it was trimmed and the snapshot value repaired with a literal split/join, because a regex replacement re-triggers the identical `$’` defect. Recorded as **IMP-D055**, **REL-109 ×2** and **TBL-079**; the register also states the one divergence — G01 §9 had also listed `grant_id`, `step_up_challenge_id` and `submitted_at`, which the `APP7-DB01` directive forbids by name and which `payment_attempts` and `created_at` already hold. `OPENAPI_CHANGE = NONE`, `API_CLIENT_CHANGE = NONE`, `RUNTIME_CHANGE = NONE`. Report [`reports/APP7-DB01-COMPLETION-REPORT.md`](../reports/APP7-DB01-COMPLETION-REPORT.md) |
| `APP7-B05` | `COMPLETE` | Customer transfer-evidence upload and own-evidence status — **2** operations, both `POST` and both reached only through the APP5 `REQUEST_ACCESS` grant: `publicOrderDepositEvidence_upload` (`multipart/form-data`) and `publicOrderDepositEvidence_status`. The fourth `AssetIntakeLane` (`CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE`, 10 MiB, namespace `public.order.deposit-evidence.upload`) reuses the delivered pipeline whole — Busboy parser, single-pass count/hash/signature check, `normalizeFilename`, server-derived object key, `IdempotencyAllocationStore`, `AssetRepository`, `ObjectStoragePort`, `OutboxEventStore` and the Tx A / stream / Tx B shape — so no second upload or storage framework exists. `APP7-B03` defined no current-attempt selector, so the attempt travels as an **opaque locator that is never authorization**: the server re-authorizes the grant under its row lock, walks request → order → live `DEPOSIT` obligation, locks the named attempt `FOR UPDATE` and re-proves its obligation, that obligation's kind and order, and `method = BANK_TRANSFER`; no `latest`/`newest`/`created_at` heuristic exists anywhere, and a foreign attempt id is byte-identical to a fictional one (`404 SECURE_LINK_UNAVAILABLE`, proved by comparing both responses). The attempt's **own** `step_up_challenge_id` is re-verified and never re-issued; no freshness window is re-applied, because `APP7-G01` §7.2 states the temporal bound as the *attempt state* and evidence changes no payment state (§7.6) — recorded in the report §4.1. `MAX_EVIDENCE_PER_ATTEMPT = 5` is an application guard under the attempt row lock inside Tx B: `0→1`, `4→5`, a refused sixth, independent per-attempt quotas, and a **real** `4 → 5` race of two concurrent HTTP requests on separate connections ending at exactly five with the loser getting `EVIDENCE_QUOTA_REACHED`. The association is bound in Tx B while the asset is still pre-inspection (`APP7-G01` §7.4's one deliberate divergence), beside exactly one `asset.inspection.requested` event. Replay writes one asset, one association and one dispatch; the raw `Idempotency-Key` appears nowhere in `idempotency_records`. Append-only: no delete, replace, detach or customer binary read exists, in the contract or in `PaymentTransferEvidenceRepository` — the one canonical association writer, added to `@embroidery/persistence` so `APP7-B06` reuses it rather than growing a second. Payment truth is unchanged and snapshot-compared before and after every operation, including for a `REJECTED` image and a `REQUIRES_REVIEW` attempt. Two shared contracts widened, both minimally: `AssetIntakeLane` gained `credentialFields` (the secure-link token is a body-only carrier under `ADR-APP4-001` §11, so it must be a multipart field arriving before the file) and the three shipped lanes declare `[]` with bit-identical behaviour. The credential is published as **`accessToken`** rather than `token` because the artifact's deterministic key sort makes the generated client append parts alphabetically — `token` would have been sent *after* the file part, producing a client whose every upload the parser correctly refuses; the contract suite now asserts every credential field sorts before `file`. `SCHEMA_CHANGE = NONE`, 37 migrations / 79 tables untouched. OpenAPI 79/86/180 → **81/88/184** (632 insertions, **0 deletions**); client +158 lines. Focused evidence: 9 suites / 336 tests. Report [`reports/APP7-B05-COMPLETION-REPORT.md`](../reports/APP7-B05-COMPLETION-REPORT.md) |
| `APP7-B04` | `COMPLETE — CORRECTED (C1)` | Admin deposit read, manual verification and review — **3** operations: `adminOrderPayment_read` (`GET /api/admin/orders/{orderId}/payments`), `adminPaymentAttempt_verify` and `adminPaymentAttempt_review` (both `POST /api/admin/payment-attempts/{attemptId}/…`). The **first** APP7 path with authority to move money state, and the only one: a QR render, a customer claim, an evidence upload and an `ACCEPTED` inspection still change nothing (`APP7-G01` §7.6). One transaction proves the whole chain — attempt locked `FOR UPDATE`, its obligation re-read, `kind = DEPOSIT`, `method = BANK_TRANSFER`, the order behind it — then compares the operator's observed amount and reference against `payment_obligations.amount` and `depositTransferReference(orders.code)`. **Exact match only**: both sides are scanned into `bigint` hundredths and compared as `bigint`, so no `numeric(14,2)` value ever becomes a JS `number`, `765000` and `765000.00` are one amount, and one đồng either way is refused; the reference is compared verbatim with no case folding or punctuation stripping, and a test sending **another order's** valid reference at the exact amount is routed to review with both orders untouched. On a match: attempt `SUCCEEDED` → deposit `SATISFIED` by that exact attempt → order `AWAITING_DEPOSIT` → `DEPOSIT_PAID` → reconciliation → audit → `payment.verified` (SE-007) once, all through the shared `@embroidery/persistence` writers with **no** SQL in the API and no second satisfy implementation. On a mismatch it is still `200`: LC-16 `TR-LC16-05` owns a durable review, so the attempt becomes `REQUIRES_REVIEW` with its mandatory reason and a reconciliation carrying `resolved_status`, the observed amount and the observed memo — nothing satisfied, nothing transitioned, no event. `REQUIRES_REVIEW → SUCCEEDED` is permitted and was not invented: `TR-LC16-06` and the delivered `settleAttempt` already agree, and the resolving decision records `RESOLVE_REVIEW`. Idempotency is the **state**, per `APP7-G01` §10's deliberate non-invention — no `payment.callback` namespace is fabricated for a flow with no provider; a lost-response retry with identical facts returns the committed truth with `replayed: true` and writes nothing, while different facts get `409`. Both races are two concurrent HTTP requests on independent connections: the same-attempt race always applies once (both `200`, exactly one `replayed: false`) and CC-10 always yields `[200, 409]` with the loser still `PENDING`, zero reconciliations and zero events — repeated 5× and 3×. A mid-transaction failure injected through a **testing-module** provider override (no runtime fault-injection code) leaves attempt `PENDING`, deposit `PENDING`, order `AWAITING_DEPOSIT`, and zero reconciliation, outbox and audit rows. Verification succeeds with **zero** evidence and with a `REJECTED` screenshot alike; evidence is read association-first through the typed `payment_transfer_evidence` → scoped `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` asset path, publishes the association id and never the asset id, and `previewEligible` is `assetStatus === ACCEPTED` and nothing else — **no byte is served**, which stays `APP7-B06`'s. The read is zero-write structurally: its module resolves no transaction manager and neither canonical writer, proved by snapshot equality across repeated reads. `payment_provider_events` count is asserted `0` on every path, `IMP-O007` stays **OPEN**, and no inventory or production row is written. Two defects found and fixed: `eventKind: 'DEPOSIT_VERIFIED'` violated the closed `ck_order_transitions__event_kind_allowed` set (a deposit verification is an ordinary `STATE_CHANGE`), and the new locked read pushed `drizzle-payment-obligation.repository.ts` to 404 lines, split by responsibility into `PaymentAttemptRepository` on the delivered delegation pattern. `SCHEMA_CHANGE = NONE`, 37 migrations / 79 tables untouched. OpenAPI 81/88/184 → **84/91/191** (+3 paths, +3 operations, +7 schemas; **0 removed, 0 existing path or schema changed**); client +313 lines, 0 deletions. Focused evidence: 5 B04 suites / 77 tests, plus 29 shared-persistence and 74 sibling-contract tests. Report [`reports/APP7-B04-COMPLETION-REPORT.md`](../reports/APP7-B04-COMPLETION-REPORT.md). **`APP7-B04-C1` — PO review found the delivered verify contract validating `observedTransferReference` against `DEPOSIT_REFERENCE_PATTERN`, the pattern of the reference the *server derives*.** A bank memo is evidence about the outside world, not an identifier this system issues: a customer who typed the right characters in lowercase, dropped one, added punctuation or let their banking app truncate the field produced a `400`, the attempt stayed `PENDING`, and the contradiction — the one fact manual reconciliation exists to capture — was destroyed at the DTO boundary, with a delivered test asserting that as correct. C1 replaces the canonical pattern with a size ceiling alone (`COL-TBL057-08` is nullable `text` with no CHECK, length or character set, so no pre-B04 bound existed and none was invented) and removes the `.trim()`: no pattern, no uppercasing, no punctuation stripping, no whitespace collapsing, no Unicode normalization, no minimum — an empty memo is a real observation. The expected reference is untouched and still canonical. The comparison is untouched and still exact string equality, so `ord7k3mpq2xvddc` against `ORD7K3MPQ2XVDDC` is **not** success: accepting it at the boundary makes the contradiction representable, not equivalent. The discriminating regression replaces the test that asserted the defect — lowercase memo → `200`, attempt `REQUIRES_REVIEW`, deposit `PENDING`, order `AWAITING_DEPOSIT`, one reconciliation whose `bank_reference` is byte-identical to what was sent, `payment.verified` = 0 — and one retained exact-success proof shows the expected-reference authority was not weakened. C1 also removes the 5×/3× race repetition loops `APP7-B04` shipped: repeating a passing race on unchanged input buys confidence, not evidence, and the determinism lives in the assertions rather than the repeat count — the suite is now one same-attempt race, one CC-10 race, one rollback proof, run once. **No runtime file changed**: no use case, repository, module, controller, policy or recorder, and no schema, migration, route or operation. OpenAPI stays 84/91/191 with a **2-line** diff — the same property in both request bodies — and the client 2 insertions / 2 deletions. Report [`reports/APP7-B04-C1-CORRECTION-REPORT.md`](../reports/APP7-B04-C1-CORRECTION-REPORT.md); `APP7-B04-C2 = MUST_NOT_BE_CREATED` |
| `APP7-B06` | `INCOMPLETE` | **Next** — Admin evidence delivery; depends on `B05`, `B04` |
| `APP7-D01` | `INCOMPLETE` | Complete design package; depends on `G01` |
| `APP7-A01` | `INCOMPLETE` | Admin order + payment screen with evidence preview; depends on `D01`, `B02`, `B04`, `B06` |
| `APP7-S01` | `INCOMPLETE` | Customer deposit, QR, evidence and confirmation screen; depends on `D01`, `B03`, `B05` |
| `APP7-E01` | `INCOMPLETE` | Focused cross-layer acceptance; depends on all runtime and UI slices |
| `APP7-X01` | `INCOMPLETE` | Phase closure and APP8 handoff; depends on `E01` |

Update this table after every APP7 checkpoint. Exactly one row carries **Next**.

## 9. Critical end-to-end journey

A customer pays the exact deposit, a verified provider callback is processed safely even when duplicated/out of order, and the accepted quotation creates exactly one order. Browser redirect alone cannot mark payment successful.

**Ruled by `APP7-G01`:** an approved design creates exactly one order at
`AWAITING_DEPOSIT`; the customer transfers the exact deposit using a
server-generated QR and reference, optionally sends a screenshot, and an Admin
verifies the received funds server-side. Nothing the customer does — scanning,
downloading, asserting payment or uploading evidence — marks the payment
successful.

## 10. Exit gate

- Idempotency and reconciliation tests pass.
  *(`APP7-G01`: there is no provider signature to test in APP7; the signature
  half of GRD-011 is deferred with `IMP-O007`.)*
- Deposit and remaining obligations remain distinct.
- One order maximum per accepted quotation.
- Sensitive data is redacted; no object key, bucket name, storage URL, secure
  token or merchant credential appears in any response, log or screen. *(No
  provider secret exists in APP7.)*
- The exact deposit amount, VND and the transfer reference are preserved from
  the accepted quotation version to the QR and to the Admin expected-amount.
- Evidence is optional throughout: a correct payment with no evidence verifies
  normally, and no evidence upload ever changes payment state.
- E2E passes.

## 11. Handoff

APP8 may reserve inventory and create production jobs only for eligible orders with verified deposit and approved design.
