# APP7-W01 — Completion Report

- Checkpoint: `APP7-W01` — `design.approved` → exactly one Order
- Mode: `IMPLEMENTATION / WORKER + ORDER + PAYMENT`
- Branch / HEAD at entry: `production` @ `fa3a659`
- Date: 2026-08-22
- Verdict: **`APP7-W01 = COMPLETE`**

---

## 1. Verdict block

```text
APP7-W01 = COMPLETE
CHECKPOINT_SCOPE = DESIGN_APPROVED_ORDER_CONVERSION
HTTP_OPERATIONS_DELTA = 0

ORDER_CREATION_TRIGGER   = design.approved / SE-005
ORDER_INITIAL_STATE      = AWAITING_DEPOSIT
ORDER_CREATE_IDEMPOTENCY = order.create, scope (custom_request_id, approval_snapshot_id)
ORDER_DUPLICATE_ARBITER  = uq_orders__request

CATALOG_BRANCH = sku_id = the exactly-one `skus.is_active = true` row of the snapshot's
                 frozen product_variant_id; customer_owned_product_id NULL;
                 product_name / variant_label from the snapshot; size_label NULL;
                 0 active SKUs -> refuse, >1 -> refuse, never pick, never create,
                 never activate, never mutate Catalog
COP_BRANCH     = customer_owned_product_id = the snapshot's own frozen id (re-read and
                 required to belong to the same request); sku_id NULL;
                 product_name = customer_owned_products.name;
                 variant_label and size_label NULL — no Product, SKU, Variant, Side,
                 Area or placeholder Catalog row is fabricated

DEPOSIT_OBLIGATION_CREATED   = true
REMAINING_OBLIGATION_CREATED = true
PAYMENT_ATTEMPT_CREATED      = false

ORDER_CREATED_EVENT  = exactly once
TRANSACTION_BOUNDARY = TransactionManager.runInTransaction in
                       ConvertApprovedDesignUseCase.convert — one transaction covering the
                       order.create claim, the authority re-reads, orders, order_items,
                       both payment_obligations, the order.created outbox row and the
                       claim completion

CODE_GENERATOR_PROMOTION = COMPLETE (@embroidery/domain-types codes/human-code.ts)
REQ_CODE_BEHAVIOR = UNCHANGED
QUO_CODE_BEHAVIOR = UNCHANGED
ORD_CODE_BEHAVIOR = ORD- + 10 chars over 23456789ABCDEFGHJKMNPQRSTVWXYZ, CSPRNG with
                    rejection sampling at 240 — the identical mechanism, a different prefix

AGG15_FIXTURE = REPAIRED_STALE_EXPECTATION
CC11_PROOF    = two separately compiled WorkerModule instances on independent pools against
                one disposable PostgreSQL; queue-claimed race, use-case-entered race and 4
                repeats, each ending with 1 order / 1 item set / 2 obligations /
                1 order.created / 1 idempotency record

SCHEMA_CHANGE     = NONE
MIGRATION_CHANGE  = NONE
OPENAPI_CHANGE    = NONE
API_CLIENT_CHANGE = NONE

BROAD_REGRESSION = NOT_RUN_BY_DESIGN
NEXT_CHECKPOINT  = APP7-B02
```

---

## 2. What this checkpoint delivered

APP6-B11 has emitted `design.approved` (SE-005) since it shipped, and labels it "the
APP7 hand-off" in its own source. Nothing consumed it: the registry knew three event
types, and an unclaimed type is abandoned with a warning, so every approval left a
`PENDING` outbox row (`APP7-R00` §3.2, §11). W01 is that consumer.

It is the **fourth capability on the delivered runtime**, not a fourth runtime — same
`JobHandlerRegistry`, same `WorkerJobQueueRepository` claim, same lease, same
`background_job_attempts` ledger, same `DISPATCHED`/`DEAD_LETTER` completion. No queue,
no scheduler, no poller, no claim/retry framework, no Order-create HTTP route.

One atomic conversion:

```text
Approval Snapshot + exact ACCEPTED quotation version
  -> orders(status = AWAITING_DEPOSIT)
   + frozen order_items
   + payment_obligations DEPOSIT
   + payment_obligations REMAINING
   + order.created (SE-006)
```

---

## 3. Changed files

### New — worker capability

```text
A apps/worker/src/jobs/order-conversion/order-conversion.module.ts
A apps/worker/src/jobs/order-conversion/order-conversion.handler.ts
A apps/worker/src/jobs/order-conversion/order-conversion.handler.spec.ts
A apps/worker/src/jobs/order-conversion/application/convert-approved-design.usecase.ts
A apps/worker/src/jobs/order-conversion/domain/design-approved.payload.ts
A apps/worker/src/jobs/order-conversion/domain/design-approved.payload.spec.ts
A apps/worker/src/jobs/order-conversion/domain/order-code.ts
A apps/worker/src/jobs/order-conversion/domain/order-conversion.errors.ts
A apps/worker/src/jobs/order-conversion/domain/order-conversion.projection.ts
A apps/worker/src/jobs/order-conversion/domain/order-conversion.projection.spec.ts
A apps/worker/src/jobs/order-conversion/domain/order-create-idempotency.ts
A apps/worker/src/jobs/order-conversion/domain/shared-code-generator.spec.ts
A apps/worker/src/jobs/order-conversion/domain/repositories/order-conversion.repository.ts
A apps/worker/src/jobs/order-conversion/infrastructure/persistence/order-chain.guard.ts
A apps/worker/src/jobs/order-conversion/infrastructure/persistence/sql-order-conversion.repository.ts
A apps/worker/src/jobs/order-conversion/tests/order-conversion-context.ts
A apps/worker/src/jobs/order-conversion/tests/order-conversion-fixture.ts
A apps/worker/src/jobs/order-conversion/tests/order-conversion.integration.spec.ts
A apps/worker/src/jobs/order-conversion/tests/order-conversion-race.integration.spec.ts
M apps/worker/src/bootstrap/worker.module.ts        (+1 import, +1 module, +5 comment lines)
```

### New / changed — shared code generator

```text
A packages/domain-types/src/codes/human-code.ts
M packages/domain-types/src/index.ts
M apps/api/src/modules/order/domain/submission/request-code.ts
M apps/api/src/modules/quotation/domain/drafting/quotation-code.ts
```

### New / changed — job kind

```text
M packages/persistence/src/platform/background-job-attempt-store.ts   (+1 value, +6 comment lines)
A packages/persistence/src/platform/order-creation-job-kind.spec.ts
```

### Changed — AGG-15 fixture repair

```text
M apps/api/src/modules/order/tests/integration/order-fixture.ts       (2 stale INSERTs)
```

### Changed — documentation

```text
A docs/implementation/reports/APP7-W01-COMPLETION-REPORT.md
M docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
M docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
M docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md            (IMP-D053)
```

No file exceeds the limits: largest source is
`sql-order-conversion.repository.ts` at **371** lines (hard max 400), largest test is
`order-conversion.integration.spec.ts` at **480** (hard max 600).

---

## 4. Worker registration and event schema

```text
eventType            design.approved
jobKind              ORDER_CREATION
payloadSchemaVersion 1
aggregateKind        APPROVAL_SNAPSHOT
effectKey            order-conversion:v1:<approvalSnapshotId>
retryPlan            none — the global worker.runtime schedule
registration         OrderConversionModule.onModuleInit -> JobHandlerRegistry.register
```

Registration is proved live: the integration suite reads `registeredTypes()` from a booted
`WorkerModule` and finds exactly one `design.approved` entry, and every conversion in the
suite reaches the handler through the real claim filter.

### The payload is a lookup key

`APP6-B11` writes nine fields. The consumer keeps **two** — `approvalSnapshotId` and
`customRequestId` — and discards the rest at the parse boundary, asserted by a unit test.
Branch, labels, `design_version_id`, `document_hash`, quantity, approval evidence and every
amount are re-read from the rows that own them. A payload copy could only ever be a second
opinion about a value the database already holds.

The handler additionally refuses a row whose `aggregate_kind` is not `APPROVAL_SNAPSHOT`,
and one whose linkage and payload name **different** approvals — the latter because the
effect key is derived from the payload, so a mismatched row could convert one approval
while deduplicating against another. Both are terminal producer defects and neither
reaches the database.

### The effect key is the approval, not the delivery

`SE-005` is "per (approval snapshot)". Two outbox rows naming one approval are two
deliveries of one effect, so the key is `order-conversion:v1:<approvalSnapshotId>` — the
opposite answer to `APP4-W01`'s, which keys on the outbox row because a replayed
notification genuinely *is* a new effect.

---

## 5. Transaction participants

One `TransactionManager.runInTransaction` in `ConvertApprovedDesignUseCase.convert`:

| # | Participant | Why it must commit with the rest |
|---:|---|---|
| 1 | `idempotency_records` claim (`order.create`) | A record `COMPLETED` for work that rolled back would make the retry replay an order that never existed |
| 2 | GRD-009 chain re-read | Checked against the same snapshot the writes land in |
| 3 | `orders` | The root |
| 4 | `order_items` | INV-12 frozen lines; an order with no line is an order for nothing |
| 5 | `payment_obligations` DEPOSIT | INV-04 |
| 6 | `payment_obligations` REMAINING | INV-04 — APP9 collects it, APP7 creates it |
| 7 | `outbox_events` `order.created` | G-DB7-54: the notification can never observe an order the database then rolls back |
| 8 | claim completion with the replayable result | Must describe work that actually committed |

There is no `try`/`catch` inside the transaction that could let a subset commit, no
compensation path, and no network call (INV-23) — `order.created` is an outbox row the
delivered APP4 `notification-delivery` capability carries after commit.

**Rollback proof.** A deterministic domain refusal (a variant with two `is_active` SKUs)
lands after the claim and the reads. The suite asserts 0 orders, 0 order items, 0
obligations for that version, 0 `order.created` and **0 idempotency records** — the last
being the one that matters, since a surviving claim would poison every retry. No production
failure hook was added; the refusal is an existing domain seam.

---

## 6. The order-creation gate

```text
approval snapshot exists and names this request
+ exactly one ACCEPTED quotation version resolves for the request
+ version, snapshot and request all resolve to ONE request   (GRD-009 / G-DB7-05)
+ no existing order for that request                         (uq_orders__request)
```

`WorkerOrderChainGuard` re-evaluates the chain inside the conversion transaction with the
delivered `OrderChainGuard`'s own refusal vocabulary — `QUOTE_NOT_ACCEPTED`,
`QUOTATION_BELONGS_TO_ANOTHER_REQUEST`, `APPROVAL_NOT_FOUND`,
`APPROVAL_BELONGS_TO_ANOTHER_REQUEST` — and returns the customer, total and currency, so
the order writes values the guard actually verified rather than values a caller supplied.

It is **restated, not imported**. `OrderChainGuard` lives in `apps/api`, and importing it
would be the app-to-app dependency the worker's entire persistence layer exists to avoid —
the precedent the delivered `APP4-W01` port states for the identical situation. The guard
is a separate collaborator in its own file, mirroring the responsibility split the API
already makes, so it can never quietly become an inline step someone skips.

**Deposit verification is not part of the gate.** `TR-LC14-02` is a later transition, and
`payment_obligations.order_id NOT NULL` makes the alternative physically impossible.

**Proved refused, with zero orders on either request:** a real approval snapshot from
customer B paired with customer A's request — every individual foreign key satisfied, only
the chain guard notices (INV-19) — and a request whose quotation version is `SENT` rather
than `ACCEPTED`.

---

## 7. Exact quotation authority

Resolved by **status, from the request**:

```sql
SELECT ... FROM quotation_versions qv
JOIN quotations q ON q.id = qv.quotation_id
WHERE q.custom_request_id = $1 AND qv.status = 'ACCEPTED'
```

No `ORDER BY version DESC`, no `LIMIT 1`, no `MAX(version)`, no
`custom_requests.current_quotation_id` and no `quotations.current_version_id`. Each of
those answers "several" by picking one. The repository returns the **set**; zero is
`QUOTE_NOT_ACCEPTED` and several is `ACCEPTED_QUOTATION_AMBIGUOUS`, two different refusals,
neither settled by a guess.

Money is sourced from that row's own columns as `numeric(14,2)` **strings**, never parsed
into a JavaScript number on the way through:

```text
orders.total_amount                       <- quotation_versions.total_amount
payment_obligations(DEPOSIT).amount       <- quotation_versions.deposit_amount
payment_obligations(REMAINING).amount     <- quotation_versions.remaining_amount
currency                                  <- quotation_versions.currency_code ('VND')
source_quotation_version_id (both)        <- the exact accepted version id
```

Nothing recomputes 40 %, re-rounds a deposit, derives the remainder by subtraction, sums
line items or reads a live Product or SKU price. `skus.price_override_amount` is never
read; the conversion has no path to it.

---

## 8. Money proof (real DB)

The acceptance fixture is chosen to catch a recomputation:

```text
quantity          3
unit price        1,111,111 VND     line total  3,333,333 VND
subtotal          3,333,333 VND     shipping 0, adjustment 0
total             3,333,333 VND
deposit_percent   35.00             deposit     1,166,667 VND
remaining                           2,166,666 VND
```

- the deposit is **35 %**, not `BR-005`'s 40 %. Anything hard-coding the business default
  lands on `1,333,333` — asserted explicitly as *not* that value;
- 35 % of the total is `1,166,666.55`, so the stored figure is the DB4 round-half-up
  result, and a re-round or a truncation would land on `1,166,666`;
- the order line's `unit_price_amount` is asserted **not** to be `products.base_price_amount`
  (150,000), which is what a live Catalog read would have produced.

Asserted against the real rows: `orders.total_amount = '3333333.00'`, `currency_code = 'VND'`,
`DEPOSIT.amount = '1166667.00'`, `REMAINING.amount = '2166666.00'`, both obligations
`PENDING`, both `currency_code = 'VND'`, both `source_quotation_version_id` = the exact
accepted version.

---

## 9. Frozen Approval Snapshot authority

| Order fact | Source | Never |
|---|---|---|
| branch | `customer_owned_product_id` null ⇒ Catalog, non-null ⇒ COP | inferred from live product rows |
| Catalog subject | one `is_active` SKU of the snapshot's frozen `product_variant_id` | first / latest / smallest / by id / by code |
| COP subject | the snapshot's own `customer_owned_product_id` | a fabricated product, SKU, variant, side or area |
| `product_name` | Catalog: snapshot `product_name`; COP: `customer_owned_products.name` | a live `products.name` |
| `variant_label` | Catalog: snapshot `variant_label`; COP: NULL | re-derived from Catalog copy |
| `size_label` | NULL on both branches | invented from `product_variants.size_label` |
| quantity, unit, line total | the accepted version's own priced lines | recomputed |
| `approval_snapshot_id` | the snapshot | any other approval |

**`size_label` is null deliberately.** `APP7-R00` §10 lists it among the values "copied from
the snapshot", and `approval_snapshots` has no such column — it freezes `variant_label` and
nothing narrower. The only place a size lives is live `product_variants`, which the
conversion may not read for display copy. A column with no frozen source stays null.

**Frozen-evidence proof.** `products.name` is renamed to `Renamed after approval` *after*
the snapshot exists — a mutation the lifecycle permits and no freeze trigger forbids — and
the resulting order line still carries `Tee frozen at approval`, asserted both positively
and negatively.

### The one permitted live read

`ck_order_items__exactly_one_subject` demands a `sku_id` and an Approval Snapshot names a
**variant**, so resolving the currently valid SKU is the "currently valid foreign identity"
`APP7-W01` §6 explicitly allows. Nothing else about the subject is read live.

---

## 10. Catalog and COP branches

**Catalog.** Every `is_active` SKU of the frozen variant is read; the caller refuses on 0
(`CATALOG_SKU_NOT_FOUND`) and on several (`CATALOG_SKU_AMBIGUOUS`). Proved with inactive
SKUs present to show they are not counted. No SKU is created, synthesised or activated, and
no Catalog row is mutated. `APP7-B01` made the valid state achievable; W01 only consumes it.

**COP.** The snapshot's `customer_owned_product_id` is re-read and required to belong to the
same request. `sku_id` is NULL, `product_name` is the customer-owned product's own name,
`variant_label` and `size_label` stay NULL. Proved that the request's frozen variant still
carries **zero** SKUs after conversion — nothing fabricated a Catalog identity.

---

## 11. OrderItem projection

Cardinality is derived from the accepted version's own priced lines, in its `position`
order, renumbered densely for `uq_order_items__order_position`. Several priced lines produce
several order lines; a single priced line — the common case, where the operator prices the
whole garment run once — produces exactly one whose quantity is the approved quantity. No
line is invented because `order_items` would permit it, and no priced line is dropped
because a `line_kind` filter looked tidy: dropping one would silently remove money the
customer accepted.

Every line names the one approved subject and the one approval snapshot, because an order
freezes exactly one `current_approval_snapshot_id` and
`ck_approval_snapshots__exactly_one_placement_branch` gives that snapshot exactly one
subject.

`quantity`, `unit_price_amount` and `line_total_amount` are copied byte-for-byte. The
projection contains no multiplication, no rounding and no summation — asserted by a unit
test that supplies amounts whose product is *also* correct, so the assertion is on identity
of the strings rather than on arithmetic agreeing.

---

## 12. Idempotency and CC-11

```text
namespace   order.create
scope key   <custom_request_id>:<approval_snapshot_id>
fingerprint sha256 over the length-prefixed pair
replay      { orderId, code }
TTL         24 h — the delivered design.approve value
arbiter     uq_orders__request (CST-030)
```

The scope key is the two ids rather than a hash of them, the rule
`design-approve-idempotency.ts` and `quotation-accept-idempotency.ts` both record: both ids
are already opaque, unique and server-chosen, and hashing them would only make the row
unreadable to an operator diagnosing a stuck claim. The fingerprint is the same two facts,
because the operation has **no** caller-supplied input — everything else is read from
persisted rows — so `IDEMPOTENCY_CONFLICT` is unreachable here, which is the honest outcome
rather than a gap.

A fresh claim does not prove no order exists (an expired record can be swept while the order
it guarded stays forever), so the use case reads `orders` by request before writing and
replays if one is found, completing the claim with that order's identity. `uq_orders__request`
remains the physical final arbiter behind both.

**No arbitrary unique failure is treated as a replay.** Only the accepted duplicate
condition — an existing order for the request — replays.

### Real race proof

`spawnActor` compiles a **second `WorkerModule` with its own pool** against the same
disposable database, so the two conversions run on separate PostgreSQL backends and
genuinely block on each other. A single-connection `Promise.all` would have proved nothing.

| Shape | Result |
|---|---|
| Two `PENDING` deliveries, two pooled workers claiming concurrently | 1 order, 1 item, 2 obligations, 1 `order.created`, 1 idempotency record; neither attempt dead-letters |
| Two conversions entered at the same moment, queue removed from the picture | Both return the **same** order id — the loser replayed rather than creating |
| 4 further repeats with fresh chains | Every round: exactly one conversion |

---

## 13. Backlog and duplicate delivery

`APP7-R00` §11 warned that `design.approved` rows accumulate unconsumed. They are ordinary
work for this handler: the effect key is the approval, so a backlog of *n* approvals
converts *n* times and *n* rows for one approval convert once.

Proved: two `design.approved` rows for one approval, run one after the other, produce one
order, one item, two obligations and one `order.created`. The second delivery reports
`SUCCEEDED`, not a failure — a duplicate is a replay. No backlog row was deleted and no
historical event was migrated.

---

## 14. Failure classification

The delivered closed taxonomy, unchanged. No new class, no new alert subsystem — the
existing `background_job_attempts` dead-letter row **is** the operator path.

| Condition | Class | Disposition |
|---|---|---|
| Malformed / unidentifiable payload | `JOB_PAYLOAD_INVALID` | terminal (runtime, before any effect) |
| Producer ahead of this build | `JOB_SCHEMA_UNSUPPORTED` | terminal (runtime) |
| Wrong aggregate linkage; linkage/payload disagree | `JOB_INVARIANT_VIOLATION` | terminal |
| Any frozen-chain refusal (11 named reasons) | `JOB_INVARIANT_VIOLATION` | terminal |
| 0 or >1 active Catalog SKU | `JOB_INVARIANT_VIOLATION` | terminal — bounded, never endless retry |
| `order.create` claim held by a live attempt | `JOB_TRANSIENT_FAILURE` | retryable |
| Anything unrecognised | `JOB_UNKNOWN_FAILURE` | retryable below the cap, terminal at it |

A refusal is deterministic — attempt five reads what attempt one read — so retrying only
delays a dead-letter row an operator has to look at anyway. **The approval always stands**:
the conversion writes nothing on a refusal, revokes nothing and annotates nothing, exactly
as SE-005 requires.

---

## 15. Shared code-generator promotion

`quotation-code.ts` deferred the promotion in writing to "whoever needed the third code".
`APP7-W01` is that consumer, and it is the first outside `apps/api` — which is what makes an
app-shared home insufficient and settles the location.

```text
@embroidery/domain-types  codes/human-code.ts
  HUMAN_CODE_ALPHABET = 23456789ABCDEFGHJKMNPQRSTVWXYZ   (G01-D12)
  HUMAN_CODE_BODY_LENGTH = 10
  humanCodePattern(prefix), generateHumanCode(prefix, random)
  rejection sampling at 240; RandomBytesSource stays a parameter
```

Prefixes stay at the narrowest scope: `REQUEST_CODE_*` in the order module,
`QUOTATION_CODE_*` in the quotation module, `ORDER_CODE_*` in the worker's order-conversion
domain. Every published constant name and every exported symbol is unchanged, and both
delivered functions still default their random source to `node:crypto`'s `randomBytes` at
their own call site.

- **REQ unchanged** — the delivered `submission-invariants.spec.ts` asserts the alphabet,
  the pattern, uniqueness across 200 draws and the rejection behaviour with a stubbed
  source, and passes against the promoted code.
- **QUO unchanged** — the delivered `quotation-drafting-rules.spec.ts` does the same, and
  `quotation-drafting.integration.spec.ts` proves the real API path still produces a code
  its own pattern accepts.
- **ORD works** — `shared-code-generator.spec.ts` pins the alphabet and length, the
  rejection ceiling with a deterministic byte stream, the exact pattern source, and
  uniqueness across 200 draws. The real conversion writes a code matching
  `^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$`.

No historical code is migrated or rewritten; the uniqueness arbiter stays the database. The
Storefront's deliberate transcription in `custom-request-confirmation/model/request-code.ts`
is untouched — a browser bundle may not reach into a backend application.

`FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` = **CLOSED**. Recorded as **IMP-D053**.

---

## 16. AGG-15 fixture repair

`FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` = **CLOSED**.

Cause, as `APP7-R00` §4 diagnosed: `order-fixture.ts` is a DB7-era raw-SQL fixture, and
migration `0034` (APP3-DB01) later made `product_sides.code` and `embroidery_areas.code`
`NOT NULL`. The fixture supplied neither, so all 28 cases of the representative suite failed
on setup.

Repaired: the two `INSERT` statements now supply `'front'` and `'chest'` — deterministic
literals satisfying `ck_product_sides__code_format` / `ck_embroidery_areas__code_format`
(`^[a-z0-9][a-z0-9_-]{0,63}$`), safe because `uq_product_sides__product_code` and
`uq_embroidery_areas__side_code` are scoped to the parent and each seeded chain has its own.

**No runtime code was changed to accommodate the fixture**, and no unrelated fixture content
was touched. Nothing else in the fixture proved stale: all three suites pass end to end.

---

## 17. Payment obligation proof

Per `APP7-W01` §18, no Payment suite was rerun. The W01 integration suite proves the same
facts against the real database and the real rows:

- both obligations exist, `DEPOSIT` then `REMAINING`, both `PENDING`;
- each amount equals the accepted column exactly, and neither is the 40 % recomputation;
- both `currency_code = 'VND'`;
- both `source_quotation_version_id` = the exact accepted version;
- no `payment_attempts` row exists for either;
- a refusal leaves zero obligations for that version.

Rerunning `payment-persistence.integration.spec.ts` would have re-proved DB7 guards this
checkpoint did not touch.

---

## 18. Phase boundaries held

Not created, not implemented, and asserted absent where observable:

```text
inventory_reservations        0 rows          production jobs          0 rows
inventory_soft_holds          0 rows          PaymentAttempt           0 rows
DEPOSIT_PAID transition       unreachable — the only state written is AWAITING_DEPOSIT
bank configuration / QR / QR download / payment reference presentation  none
transfer evidence / payment_transfer_evidence / Admin verification      none
remaining-payment collection / refund / cancellation / provider / webhook  none
UI / Figma                                                              none
```

`APP7-B02` is not started.

---

## 19. OpenAPI / client boundary (read-only)

```text
packages/contracts/openapi/openapi.generated.json
  sha256 44faf1fb0ad7ef6abf69e6094aec354ddee55d91c97b918476e2f89e6b549a80
  paths 74 / operations 81 / schemas 170   — identical to APP7-B01-FD1
git status packages/contracts packages/api-client   -> clean
migrations 36, highest 0036_add_app6_cop_design_context.sql, unmodified
```

Neither generator was run: W01 has no HTTP surface, and generating by habit would have
risked a diff the checkpoint cannot justify.

---

## 20. Command ledger

| Command / check | Exact changed question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `npx jest src/modules/order/tests/integration/order.integration.spec.ts` (api) | Is the AGG-15 red a stale fixture, and where exactly? | **FAIL** — `product_sides.code` NOT NULL at `order-fixture.ts:127` | 0 | Run **once** to locate the cause before repairing; not looped |
| `npx jest src/jobs/order-conversion/domain` (worker) | Do the payload contract, the projection and the promoted generator behave? | 23/23 **PASS** | 1 | The first run failed on a wrong test stub (a cycling byte source), not on production code; rerun after fixing the stub — a changed input |
| `npx jest src/jobs/order-conversion/order-conversion.handler.spec.ts` | Registration, linkage refusals, error classification | 7/7 **PASS** | 0 | — |
| `npx jest src/jobs/order-conversion/tests/scratch-diagnose` (temporary) | What is the raw failure behind `FAILED_RETRYABLE`? | Named a malformed array literal in the line-item query | 1 | Smallest diagnostic first; rerun after the `sql.join` fix — a changed input. File deleted |
| `npx jest src/jobs/order-conversion/tests/order-conversion.integration.spec.ts` | Full conversion, both branches, money, refusals, rollback, frozen evidence, duplicate delivery | 24/24 **PASS** | 2 | Run 1 red (array-literal defect); run 2 green; run 3 after adding the registry assertion and after the guard extraction — each a changed input |
| `npx jest src/jobs/order-conversion/tests/order-conversion-race` | CC-11 on two independent pools | 3/3 **PASS** | 0 | — |
| `npx jest src/jobs/order-conversion` (worker) | Everything above together, after the file-size split | 6 suites / **57 PASS** | 0 | Final green on the final tree |
| `npx jest src/bootstrap/worker-persistence.integration.spec.ts` | Does the composition still boot with a fourth capability? | 3/3 **PASS** | 0 | `worker.module.ts` changed |
| `npx jest .../order.integration.spec.ts .../order-outbox... .../order-races...` (api) | Do the three owned AGG-15 suites pass after the fixture repair? | 3 suites / **36 PASS** | 0 | Direct W01 acceptance |
| `npx jest .../submission-invariants.spec.ts .../quotation-drafting-rules.spec.ts` (api) | Did REQ or QUO behaviour drift? | 36/36 **PASS** | 0 | The delivered suites are the unchanged-behaviour oracle |
| `npx jest .../quotation-drafting.integration.spec.ts` (api) | Does the promoted generator still work in the delivered API runtime? | 21/21 **PASS** | 0 | One real-path proof; the request-submission suite would have re-proved the same mechanism |
| `npx jest src/platform/order-creation-job-kind.spec.ts src/platform/asset-processing-job-kind.spec.ts` (persistence) | Is `ORDER_CREATION` accepted by the guard, and are the delivered kinds undisturbed? | 10/10 **PASS** | 0 | Both kinds asserted together, since the list changed |
| `pnpm --filter @embroidery/domain-types build` / `@embroidery/persistence build` | Do consumers resolve the new exports? | **PASS** | 0 | Required before typechecking consumers |
| `pnpm --filter @embroidery/worker typecheck` | Does the new capability typecheck? | **PASS** | 3 | Run 1 clean pre-tests; run 2 red on test-only types; run 3 clean after the guard extraction — each a changed input |
| `pnpm --filter @embroidery/api typecheck` | Did the two delegating code modules break anything? | **PASS** | 0 | — |
| `pnpm --filter @embroidery/persistence typecheck` / `@embroidery/domain-types typecheck` | Do the changed packages typecheck? | **PASS** | 0 | — |
| `npx eslint` on every changed path (worker, persistence, domain-types, api) | Lint | clean, 0 findings | 1 | Worker relinted after the guard extraction |
| `npx prettier --write` on every changed file | Format | 5 files reformatted, rest unchanged | 1 | Rerun after the extraction |
| `git diff --check` | Whitespace errors | clean | 0 | — |
| `sha256sum` + `node -e` over `openapi.generated.json`; `git status` on contracts/api-client; migration count | Did the contract or schema move? | 74/81/170, `44faf1fb…`, clean, 36 migrations | 0 | Read-only boundary check, no generation |

**Not run, deliberately:** `pnpm quality`, `quality:e2e`, full Jest, the full API / worker /
DB suites, Playwright, SonarQube, the APP3/APP6 historical gates, the Inventory and
Production suites, `payment-persistence`/`payment-races`, and OpenAPI or client generation.
No PASS command was rerun on unchanged input; every rerun above names the input that
changed.

---

## 21. Risks and limitations

- **`WorkerOrderChainGuard` restates GRD-009 rather than importing it.** The worker may not
  depend on `apps/api`, and moving CTX-ORD persistence into a package is far outside a W01
  slice. The refusal codes are kept identical and both are covered by suites, but the two
  copies could drift; extracting the Ordering persistence into a shared package is a
  candidate follow-up for whichever checkpoint next needs Order writes from two
  applications. Recorded as **`FU-APP7-W01-ORDER-CHAIN-GUARD-DUPLICATION-01`**.
- **Order-line pricing reads `quotation_line_items`.** `APP7-R00` §10 says "unit_price /
  line_total frozen from the accepted quotation version", and `quotation_versions` stores no
  per-unit column — the only exact copy available is the version's own line items. This is
  a copy, not a derivation, but the reading is stated here explicitly so a reviewer sees it
  rather than discovers it.
- **An accepted version with a zero deposit or zero remaining is refused**
  (`OBLIGATION_AMOUNT_NOT_POSITIVE`), because `ck_payment_obligations__amount_positive`
  requires `> 0` while `ck_quotation_versions__deposit_non_negative` allows `0`. Unreachable
  under the 40 % policy; named rather than left to surface as a CHECK violation.
- **`ORDER_CREATION` is a source-level guard value**, not a CHECK. An older deployment
  reading `background_job_attempts` will see rows with a kind its own list does not contain
  — the same, accepted property every previous addition had.
- **The backlog size is worth checking before deploying**, as `APP7-R00` §11 noted. The
  conversion is idempotent per approval, so processing it is correct; the caution is about
  volume, not safety.

---

## 22. Acceptance criteria

All 47 conditions in the directive §28 are met. The ones needing evidence beyond the
sections above:

| # | Condition | Evidence |
|---:|---|---|
| 1–3 | One production handler, delivered runtime reused, no new transport | §4; `worker.module.ts` adds one module |
| 4–5 | Persisted authority re-read; GRD-009 enforced | §4, §6 |
| 6–7 | Exact ACCEPTED version; no latest/current heuristic | §7 |
| 8 | Frozen snapshot evidence | §9, live-rename proof |
| 9–13 | SKU resolution and both branches | §10 |
| 14–17 | `AWAITING_DEPOSIT`, frozen items, both obligations, exact version binding | §5, §8, §11 |
| 18–20 | No attempt, one event, atomic | §5, §18 |
| 21–24 | `order.create`, `uq_orders__request`, duplicate, real CC-11 | §12, §13 |
| 25–28 | Generator promoted, REQ/QUO unchanged, ORD generated | §15 |
| 29–31 | Fixture repaired, 3 suites pass, obligation proof | §16, §17, §20 |
| 32–34 | No partial conversion, money copied, wrong chain refuses | §5, §8, §6 |
| 35–40 | No inventory/production/APP9/bank/QR/evidence; no schema, migration, HTTP, OpenAPI or client change | §18, §19 |
| 41–43 | Focused validations pass; no broad regression; no rerun on unchanged input | §20 |
| 44–47 | Nothing pushed; report exists; W01 `COMPLETE`; `APP7-B02` sole Next | §23 |

---

## 23. Commits

```text
956364a feat(app7): consume design.approved into exactly one order (APP7-W01)
<this commit> docs(app7): record APP7-W01 completion and advance the roadmap (APP7-W01)
```

```text
NOT_PUSHED
```

No R00 / G01 / B01 history was amended and no unrelated user change was mixed in.

---

## 24. Verdict

```text
APP7-W01        = COMPLETE
APP7-B02        = INCOMPLETE — Next (Admin order read)
remaining       = INCOMPLETE
NEXT CHECKPOINT = APP7-B02
```

Delivered for Product Owner review. The next checkpoint has not been started.
