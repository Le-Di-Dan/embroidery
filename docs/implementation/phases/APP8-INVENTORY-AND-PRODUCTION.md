# APP8 — Inventory Reservation and Production Operations

> **Status:** `IN PROGRESS` — `APP8-R00` and `APP8-G01` complete (`APP8-G01`
> corrected by `APP8-G01-C1`); phase audited, planned and its authority locked
> (§10.5).
> Sections 1–9 below are the **original pre-entry candidate plan**, preserved as
> planning history. Section 10 onward is the **canonical, repository-grounded
> plan** produced by `APP8-R00`. Where the two disagree, **section 10 onward
> governs**; the earlier sections are kept so the reconciliation in
> `docs/implementation/audits/APP8_PHASE_ENTRY_AUDIT.md` §20 remains checkable
> against what was actually written before entry.

## 1. Outcome

Reserve inventory without oversubscription and operate the embroidery production lifecycle through an auditable Admin workflow and reliable worker behavior.

## 2. Dependencies

APP7 eligible order exists; database concurrency/lock guarantees and production lifecycle are inherited.

## 3. Design policy

Mostly Admin design. Audit existing operations design; create one APP8 package if inventory/production board, detail, error/manual-review and transition states are missing. Storefront design is limited to bounded status updates.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Inventory availability/adjustment visibility required by operations.
- Soft holds and official reservations according to approved lifecycle.
- Reservation release/expiry/conversion.
- Production job creation, queue, detail, start, progress/transition, completion/failure.
- Job attempts, worker claims, retry/manual review.
- Admin inventory and production screens.
- Bounded customer order status.

## 5. Out of scope

- Remaining payment and fulfillment completion.
- Carrier tracking.
- General warehouse management beyond approved inventory scope.
- Changing concurrency guarantees for convenience.

## 6. Candidate engineering checkpoints

> **Superseded by §11.** Retained verbatim as planning history. Every candidate
> below carries exactly one disposition in
> `docs/implementation/audits/APP8_PHASE_ENTRY_AUDIT.md` §20.

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP8-C01 — Inventory operations contract:** Define availability/list/detail and authorized adjustment operations, no more than five endpoints.
- **APP8-B01 — Inventory operations backend:** Implement exact quantities, authorization, audit and repository queries.
- **APP8-A01 — Admin inventory screen:** Implement availability, adjustment, reservation visibility and conflict states.
- **APP8-B02 — Reservation use cases:** Implement hold/reservation conversion/release/expiry with existing lock order and concurrency guarantees.
- **APP8-C02 — Reservation operational contract:** Expose only necessary Admin order/reservation status/actions within five endpoints.
- **APP8-C03 — Production job contract:** Define production queue, detail, create, start and allowed next-transition operations.
- **APP8-B03 — Production backend:** Implement eligibility, approved-design linkage, lifecycle guards, audit and outbox.
- **APP8-A02 — Admin production queue:** Implement filters/priorities/status and loading/error/empty states.
- **APP8-A03 — Admin production detail:** Implement approved design evidence, reservation, job attempts and guarded transitions.
- **APP8-W01 — Production worker claims/attempts:** Implement deterministic claim, bounded retry, duplicate safety and terminal/manual review.
- **APP8-C04 — Customer order status contract:** Define bounded customer-safe status read operation(s).
- **APP8-S01 — Customer production status:** Implement customer-safe progress without internal notes or carrier tracking.
- **APP8-E01 — Order-to-production E2E:** Two competing orders cannot oversubscribe inventory; eligible order reserves stock, creates production job, progresses through allowed states, and records retry/failure safely.
- **APP8-X01 — Phase closure:** Hand completed production and reserved order to APP9.

## 7. Critical end-to-end journey

Competing reservation attempts preserve stock limits. An eligible order links to the approved design, receives a production job, transitions through allowed states, and worker retry does not duplicate irreversible work.

## 8. Exit gate

- Concurrency race suite remains passing.
- Production never uses a non-approved design version.
- Internal notes are not customer-visible.
- Worker retry/manual review is observable.
- E2E passes.

## 9. Handoff

APP9 creates remaining payment/fulfillment actions only from eligible production/order states.

---

# APP8-R00 reconciliation — canonical plan

Produced by `APP8-R00` at `production` @ `3555896`. Full evidence:
[`APP8_PHASE_ENTRY_AUDIT.md`](../audits/APP8_PHASE_ENTRY_AUDIT.md).
Completion report:
[`APP8-R00-COMPLETION-REPORT.md`](../reports/APP8-R00-COMPLETION-REPORT.md).

## 10. What the repository actually holds at APP8 entry

APP8 is **not** greenfield. The DB era delivered the complete inventory and
production **persistence layer**; none of it is wired into the running system.

```text
OPENAPI_BASELINE              = 85 paths / 92 operations / 191 schemas
DB_BASELINE                   = 37 migrations / 79 tables (78 launch)
APP8_HTTP_OPERATIONS_AT_ENTRY = 0
APP8_RUNTIME_WRITES_AT_ENTRY  = 0
APP8_FIGMA_BASELINE           = 0 rows (no APP_08 page target)

INVENTORY_RUNTIME_BASELINE  = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED
PRODUCTION_RUNTIME_BASELINE = PHYSICAL + REPOSITORY_DELIVERED — NOT RUNTIME_COMPOSED
```

Nine physical tables exist: `sku_stocks`, `inventory_ledger_entries`,
`inventory_soft_holds`, `inventory_reservations`, `production_jobs`,
`production_job_transitions`, `production_specifications`,
`production_artifacts`, `production_notes`. `InventoryModule` and
`ProductionModule` exist with full ports, Drizzle adapters and integration tests,
and **neither is imported by `apps/api/src/bootstrap/app.module.ts`**.

```text
INVENTORY_SCHEMA_DISPOSITION  = NO_MIGRATION_REQUIRED
PRODUCTION_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

**There is no `production_job_attempts` table**, and no production claim, worker,
machine or operator-assignment column anywhere. §4 and §6 above assumed one.
Rework is a new job linked by `reworked_from_job_id` (ADR-DB3-003).

### 10.1 Two gaps inside the delivered layer

- **Gap A — nothing creates a `sku_stocks` row.** `ensureStockRow` has zero
  non-test callers, and APP7's SKU authoring does not seed stock. Every
  reservation against a SKU authored today fails on a missing stock record.
  Closed by `APP8-B01`.
- **Gap B — `releaseReservation` and `consumeReservation` read the reservation
  status without a row lock**, so the DB3 CC-21 release-vs-consume arbiter is
  physically absent and the race has no DB8 coverage. Closed by `APP8-B02`.

### 10.2 Locked authority readings

```text
DEPOSIT_ELIGIBILITY_AUTHORITY = DEPOSIT_ELIGIBILITY_PORT.isDepositSatisfied(orderId),
  provided by PaymentPersistenceModule and already consumed by
  ReservationEligibilityGuard (GRD-013). APP8 creates no second implementation
  and restates the rule in no SQL.

CATALOG_INVENTORY_BRANCH = order_item.sku_id -> sku_stocks -> official reservation
                           for the frozen quantity, under the sku_stocks anchor lock
COP_INVENTORY_BRANCH     = NO_RESERVATION. sku_stock_id is NOT NULL and a COP item
                           has no sku_id. No SKU identity is fabricated.

RESERVATION_EXPIRY = NONE. TR-LC17-07 permits "official reservations may be
  no-expiry per config" and expires_at is nullable. DEC-14's TTL values stay
  deferred; APP8 implements no sweep.

SOFT_HOLDS = NOT USED. createSoftHold/convertHold have no producer; APP8 uses
  createReservation.

PRODUCTION_CREATION_AUTHORITY = TR-LC18-01 — one job per
  (order_id, approval_snapshot_id); spec frozen from the approval snapshot in the
  same transaction; duplicate arbiter uq_production_jobs__order_approval_snapshot.
PRODUCTION_TRANSITION_AUTHORITY = LC-18 allow-list under the job row lock, gated by
  GRD-015 and GRD-022 at the application-service layer.

APP8_TERMINAL_HANDOFF_STATE = order PRODUCTION_COMPLETED (TR-LC14-04), job COMPLETED
APP9_ENTRY_PRECONDITION     = TR-LC14-05 — Admin moves PRODUCTION_COMPLETED ->
                              AWAITING_FINAL_PAYMENT against the unsatisfied
                              REMAINING obligation created by APP7-W01

QUEUE_ASYNC_DISPOSITION = EXISTING POSTGRES OUTBOX CLAIM QUEUE (IMP-D029 closes
  IMP-O003). No broker. One new handler: payment.verified -> official reservation.
DESIGN_GATE             = DESIGN_REQUIRED_BEFORE_UI
CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8
```

**Concurrency is inherited, not redesigned.** `sku_stocks` is the lock anchor
(GRD-014); the `orders` → `sku_stocks` lock order proven by DB8 `CC-22` is
preserved; isolation stays `READ COMMITTED` with explicit row locks; idempotency
reuses `idempotency_records` and the outbox claim. APP8 introduces no new lock
anchor, no `SERIALIZABLE` flow and no new idempotency mechanism.

### 10.3 Corrected scope

Replaces §4/§5 above where they conflict.

**In scope:** stock-row creation and audited adjustment; availability reads;
official reservation on deposit verification; reservation consume and release
driven by production; production job creation with a frozen specification;
production queue, detail and guarded transitions; the order moves
`DEPOSIT_PAID → IN_PRODUCTION → PRODUCTION_COMPLETED`; three Admin screens; one
worker consumer; one design package.

**Out of scope:** soft holds and hold conversion (no producer); reservation
expiry and any sweep (official reservations are no-expiry); production job
attempts, worker claims and machine runners (no such model exists); stitch-file
or DST/PES generation and any customer export; production artifact attach and
delivery (deferred, ruling routed to `G01`); any customer-facing surface;
remaining payment, shipping, delivery, refund, cancellation execution and final
settlement (all APP9).

> **`APP8-G01-C1` clarification — read "cancellation execution" above narrowly.**
> R00's own §12.1 APP8-owned transition table lists production job
> `PLANNED`/`STARTED` → `CANCELLED` (Admin, reason mandatory) and reservation
> `RESERVED` → `RELEASED` as **APP8 work**, owned by `APP8-B04`. The out-of-scope
> phrase therefore means the **full order cancellation/refund saga** — refund
> calculation and payment, remaining-payment settlement, shipping/delivery
> reversal, final settlement — not production-job cancellation. R00's sentence is
> preserved verbatim as written; §10.5 is the binding reading.

### 10.4 True Product Owner decision — **RESOLVED by `APP8-G01`**

> Preserved as written at R00. The question below was genuinely open at phase
> entry; `PO-APP8-001` has since been ruled **Option A**. The historical record
> stays because the discovery is the evidence that the ambiguity was found rather
> than assumed away. The binding answer is §10.5.

```text
PO-APP8-001 — do COP-only orders require an inventory reservation to enter production?
```

GRD-015 requires a `RESERVED` reservation to start production; a COP order item
has no SKU and therefore *cannot* have one; no accepted document qualifies the
clause for the COP branch.

- **Option A (recommended):** the reservation clause binds **per reservable order
  item** — Catalog items need one, COP items need none.
- **Option B:** read literally, so a COP-only order can never enter production.

Option B makes a delivered first-class branch permanently unusable. Routed to
`APP8-G01`. Blocks `B04` and `E01` case 7; blocks nothing before that.

### 10.5 `APP8-G01` — the locked authority

Produced by `APP8-G01` at `production` @ `4ba1c93`. Full package:
[`APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md`](../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md).
Completion report:
[`APP8-G01-COMPLETION-REPORT.md`](../reports/APP8-G01-COMPLETION-REPORT.md).

These are **canonical APP8 values**, no longer recommendations. Later checkpoints
consume them and may not re-decide them.

```text
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
NEW_ADR_REQUIRED                      = NO   (every ruling resolves inside an
                                              already-accepted architecture)
```

**`PO-APP8-001 = APPROVED_OPTION_A`.** `GRD-015`'s reservation clause binds **per
reservable order subject**, not per order.

- **Catalog-only** — production starts only on: valid exact approval snapshot;
  DEPOSIT `SATISFIED` through `DepositEligibilityPort`; order `DEPOSIT_PAID`;
  order not `ON_HOLD` / `CANCELLING`; every inventory-reservable Catalog quantity
  covered by an active reservation that is `RESERVED` when the production-start
  transaction consumes it.
- **COP-only** — **may enter production with no reservation** once every
  non-inventory guard above passes. A COP item has `sku_id IS NULL`, so APP8
  fabricates no SKU, no `sku_stocks` row and no reservation. The absence is
  expected behaviour, never an error.
- **Mixed** — Catalog portions require coverage; COP portions require none;
  start is blocked if any required Catalog reservation is missing or not
  `RESERVED`; COP items never weaken a Catalog requirement.
- **Cardinality is the repository's.** `CST-016` allows one active `RESERVED` row
  per `(order_id, sku_stock_id)`. Where several Catalog items resolve to the same
  SKU there is still **one** reservation, whose quantity must cover the order's
  frozen Catalog quantity for that SKU. No per-item rows are invented.
- One `GRD-015` implementation, one deposit predicate, no COP-specific fake
  inventory path.

```text
PO-APP8-002  APP8 official reservations are NO-EXPIRY: expires_at = NULL, no sweep,
             no TTL value chosen. Soft-hold expiry semantics untouched.
             DEC-14 stays deferred/nonblocking.
             (Authorised by ADR-DB1-018 r3 + its Deferred Details, DB4 §37–38,
              TR-LC17-07 — an explicit lock, not a default.)

PO-APP8-003  Production job creation is ADMIN-INITIATED, synchronous through the
             Admin API, post-deposit, against the EXACT approval snapshot, one job
             per (order_id, approval_snapshot_id), with the immutable specification
             frozen in the same transaction. TR-LC18-01 permits "system/admin";
             APP8 selects admin. The worker gains no job-creation duty.
             SYSTEM remains the actor for the payment.verified reservation consumer.

PO-APP8-004  Production artifact generation and management are DEFERRED /
             NONBLOCKING for APP8: no DST/PES/EXP writer, no machine runner, no new
             object storage, no customer export, no APP8 HTTP or UI surface for
             artifacts. attachArtifact stays untouched and unused. TR-LC18-03 has
             no guard, so nothing is bypassed. Owner is UNASSIGNED — deliberately
             not routed to APP9 for symmetry.
             APP8's authoritative production input is the frozen
             production_specifications row plus the exact approved design evidence
             already reachable through the accepted APP6 authority.

PO-APP8-005  APP8's SUCCESSFUL PRODUCTION HANDOFF ends at job COMPLETED + order
             PRODUCTION_COMPLETED (TR-LC14-04). APP8 does not execute TR-LC14-05,
             remaining-payment collection, shipping, delivery, refund or final
             settlement. APP7's unsatisfied REMAINING obligation is preserved for APP9.

             This boundary does NOT exclude APP8-owned production-job cancellation.
             Production job PLANNED/STARTED -> CANCELLED, Admin-initiated with a
             MANDATORY reason, remains in APP8-B04 — under the existing job row lock
             and LC-18 legality, appending the accepted production_job_transitions
             record, and RELEASING any still-active Catalog reservation
             (RESERVED -> RELEASED, TR-LC17-06) with that mandatory reason. COP-only
             orders have no reservation to release and none is fabricated; mixed
             orders release only the applicable Catalog reservation(s); no
             customer-facing cancellation flow is invented.

             Full ORDER cancellation/refund saga execution — refund calculation and
             payment, remaining-payment settlement, shipping/delivery reversal, final
             financial settlement — remains OUTSIDE APP8. IMP-O008 stays outside APP8.

PO-APP8-006  IMP-D054 applies NARROWLY. Inventory persistence is promoted/reused
             through @embroidery/persistence because APP8-W01 (apps/worker) and the
             Admin API (apps/api) both write it — no duplicate worker inventory DB
             logic, no worker-only adapter. Production persistence STAYS API-LOCAL;
             it is not moved for symmetry, and is promoted later only if a concrete
             accepted cross-runtime consumer is proven. APP8-B02 keeps its position
             and its CC-21 release-vs-consume repair.
```

Inherited and restated as canonical: `DepositEligibilityPort` is the **sole**
deposit authority (no second port, no duplicated SQL);
`INVENTORY_SCHEMA_DISPOSITION` and `PRODUCTION_SCHEMA_DISPOSITION` are both
`NO_MIGRATION_REQUIRED` and no `production_job_attempts` table is created; the
existing PostgreSQL outbox/claim runtime (`IMP-D029`) is reused with no broker,
queue table, second datastore or alternate idempotency subsystem;
`CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8`; `APP8-D01` remains the design
gate immediately before Admin UI. The §11 roadmap is unchanged.

---

## 11. Canonical checkpoints

| Order | Checkpoint | Purpose | Depends on | Main area | HTTP ops | Schema? | Worker? | Design? |
|---:|---|---|---|---|---:|---|---|---|
| 1 | `APP8-R00` | phase entry audit and roadmap reconciliation | APP7 closed | docs | 0 | no | no | no |
| 2 | `APP8-G01` | authority lock: `PO-APP8-001`, no-expiry reservations, Admin-initiated job creation, artifact deferral, terminal handoff | R00 | docs | 0 | no | no | no |
| 3 | `APP8-B01` | compose `InventoryModule`; Admin stock read, low-stock signal, audited adjustment (closes Gap A) | G01 | api | 3 | no | no | no |
| 4 | `APP8-B02` | promote inventory + production persistence to `@embroidery/persistence` (IMP-D054); reservation row lock on release/consume (closes Gap B) | B01 | packages, api | 0 | no | no | no |
| 5 | `APP8-W01` | worker consumer of `payment.verified` → official reservation per Catalog order item (TR-LC17-04) | B02 | worker | 0 | no | **yes** | no |
| 6 | `APP8-B03` | Admin production job creation (GRD-013 via the port) + queue and detail reads | W01 | api | 3 | no | no | no |
| 7 | `APP8-B04` | Admin production transitions: start, complete, cancel — with the order move and reservation consume/release in the same transaction | B03 | api | 2 | no | no | no |
| 8 | `APP8-D01` | one APP8 design package: Admin inventory, production queue, production job detail | B04 | design | 0 | no | no | **yes** |
| 9 | `APP8-A01` | Admin inventory screen | D01 | admin | 0 | no | no | consumes |
| 10 | `APP8-A02` | Admin production queue | D01 | admin | 0 | no | no | consumes |
| 11 | `APP8-A03` | Admin production job detail + guarded transitions | A02 | admin | 0 | no | no | consumes |
| 12 | `APP8-E01` | focused cross-layer acceptance | A03 | e2e | 0 | no | no | no |
| 13 | `APP8-X01` | closure and APP9 handoff | E01 | docs | 0 | no | no | no |

Predicted totals: **8 new HTTP operations**, **0 migrations**, **1 worker
handler**, **1 design package**, **3 Admin screens**. Backend checkpoints stay in
the normal 1–3 operation band; none approaches the hard maximum of 5.

## 12. Roadmap status

Exactly one unfinished row carries **Next**. This table is updated after every
APP8 checkpoint, and it is the only APP8 status table.

```text
R00   COMPLETE
G01   COMPLETE          (corrected by APP8-G01-C1 — PO-APP8-005 wording only)
B01   INCOMPLETE — Next
B02   INCOMPLETE
W01   INCOMPLETE
B03   INCOMPLETE
B04   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
A02   INCOMPLETE
A03   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

## 13. Phase governance

### 13.1 One-correction rule

```text
Each checkpoint may receive at most ONE correction.

If that correction is still not accepted:
- do not create C2;
- do not start another open-ended investigation loop;
- the Product Owner will issue a final mandatory directive with the chosen solution;
- Claude implements that exact solution and its acceptance criteria.
```

A correction report is not a roadmap checkpoint. Only a genuine replan with
distinct ownership earns a new checkpoint id.

### 13.2 Change-impact test policy

```text
question -> smallest sufficient test/diagnostic -> classify -> stop
```

Never run tests for confidence. A passing command over unchanged inputs is final
evidence; a rerun is permitted only after an input relevant to that command
actually changed, and every rerun must name that input.

| Change | Run |
|---|---|
| inventory repository / concurrency | focused inventory unit / integration / race proof — no Admin, Storefront or payment suites |
| production state machine | focused production transition + transaction tests; worker tests only if worker code changed |
| HTTP contract | focused controller / application / contract tests for the changed operations; regenerate OpenAPI and the client **because** the contract changed; verify only the intended delta |
| database migration | migration / manifest + the exact affected repository and invariant tests — no unrelated DB corpus |
| Admin UI | affected component / query / mutation tests; a focused browser proof only for the changed user-visible journey |
| Figma-only design checkpoint | Figma / registry / design-authority checks only |
| docs-only checkpoint | changed-doc formatting and diff checks only |

Forbidden by default: `pnpm quality` (does not exist), `quality:e2e` (removed by
GOV-Q01-C1), full Jest, full API / DB / worker / Admin / Storefront suites, all
Playwright projects, repository-wide build or typecheck, historical phase suites.
Prettier, ESLint and SonarQube are the only global quality mechanisms, and even
these follow the established phase / closure policy.

If checkpoint `Bxx` proved an invariant and no input affecting it changed, later
checkpoints reuse that evidence. `E01` is the single focused cross-layer
acceptance checkpoint and must not rerun every predecessor's suite.

Every completion report carries a command ledger:

```text
| Command/check | Exact changed question/input | Result | Reruns | Why sufficient |
```

A rerun count above zero requires a written justification naming the changed
input.

### 13.3 File-size policy

```text
runtime/application source     <= 400 lines
runtime/application tests      <= 600 lines
tools/check-*.mjs soft cap     <= 450 lines
tools/check-*.test.mjs soft cap<= 700 lines
```

Review thresholds are 300 (source) and 500 (tests). Split by responsibility, not
by line ranges. Do not raise a correction merely to force tooling below an older
hard limit when the current soft-cap policy is satisfied and responsibilities
remain cohesive.

## 14. Exit gate (canonical)

Replaces §8 where they conflict.

- No oversubscription: competing deposit-eligible orders never reserve or consume
  more than available stock, and on-hand never goes negative.
- The DB3 CC-21 release-vs-consume arbiter exists and is proven.
- A production job is created only against the exact Approval Snapshot, with its
  specification frozen in the same transaction — never a live catalog, quotation
  or design-session read.
- GRD-013, GRD-014, GRD-015 and GRD-022 are enforced, each at its accepted layer,
  with no rule duplicated.
- Duplicate HTTP, worker or outbox delivery produces no duplicate reservation,
  job, transition, ledger row or outbox row.
- The COP branch fabricates no SKU or reservation and behaves exactly as `G01`
  locks it.
- Internal production notes, artifacts, operator identity and inventory
  quantities reach no customer surface — trivially satisfied, as APP8 ships no
  customer surface.
- The order reaches `PRODUCTION_COMPLETED` and stops; APP9 execution remains zero.
- `APP8-E01` passes its 14 targeted cases.

## 15. Handoff

APP9 begins at TR-LC14-05: the Admin moves an order at `PRODUCTION_COMPLETED`,
whose production job is `COMPLETED`, to `AWAITING_FINAL_PAYMENT` against the
`REMAINING` obligation APP7 created and left unsatisfied. APP8 collects no
payment, freezes no shipping, executes no cancellation or refund, and completes
no fulfillment.

> **`APP8-G01-C1` clarification.** "Executes no cancellation" above means no
> **order** cancellation/refund saga execution. APP8 **does** own production-job
> cancellation — `PLANNED`/`STARTED` → `CANCELLED` with a mandatory reason, and
> the release of any still-active Catalog reservation — in `APP8-B04`, exactly as
> R00 §12.1 accepted. R00's sentence is preserved verbatim; §10.5 is the binding
> reading.
