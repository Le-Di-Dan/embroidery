# APP8-G01 — Completion Report

- Checkpoint: `APP8-G01` — Inventory Reservation and Production Operations Authority
- Mode: `AUTHORITY / PRODUCT DECISION LOCK` — `DOCUMENTATION_ONLY`
- Branch: `production`
- HEAD at entry: `4ba1c93a29999cae9a14ddfcaaf06ecff5b57ae7` (`4ba1c93`)
- Working tree at entry: clean
- Date: 2026-08-24
- Verdict: **`APP8-G01 = COMPLETE_CORRECTED`** (originally delivered as
  `COMPLETE`; corrected by `APP8-G01-C1`)

> ## Correction notice — `APP8-G01-C1`
>
> **This report is preserved as historical evidence and is superseded in exactly
> one place.** In §3 (`PO-APP8-005`) and §1's summary it listed **"cancellation
> execution"** among the things APP8 never performs. That phrasing was materially
> too broad and collided with the APP8-owned production-job cancellation path
> that `APP8_PHASE_ENTRY_AUDIT.md` §12.1 already accepts.
>
> **Corrected reading, binding:** APP8's *successful production handoff* ends at
> job `COMPLETED` + order `PRODUCTION_COMPLETED`. APP8 does not execute
> `TR-LC14-05`, remaining-payment collection, shipping, delivery, refund or final
> settlement. This does **not** exclude APP8-owned production-job cancellation —
> `PLANNED`/`STARTED` → `CANCELLED` with mandatory reason remains in `APP8-B04`,
> including release of any still-active Catalog reservation. Full **order**
> cancellation/refund saga execution remains outside APP8.
>
> The original wording below is left unedited so the defect stays checkable. The
> canonical authority is
> [`../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md`](../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md)
> §5; the correction is recorded in
> [`APP8-G01-C1-COMPLETION-REPORT.md`](./APP8-G01-C1-COMPLETION-REPORT.md).
> Every other ruling in this report passed review and is unchanged.

---

## 1. Verdict

```text
APP8-G01 = COMPLETE
PO-APP8-001 = APPROVED_OPTION_A
PO-APP8-002 .. PO-APP8-006 = LOCKED
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
NEW_ADR_REQUIRED = NO
MIGRATIONS = 0 · RUNTIME SOURCE = 0 · TESTS = 0 · OPENAPI = 0 · CLIENT = 0 · FIGMA = 0
BROAD_REGRESSION = NOT_RUN_BY_DESIGN
NEXT_CHECKPOINT = APP8-B01
NOT_PUSHED = true
```

No implementation checkpoint was begun. `APP8-B01` is not started.

---

## 2. Git facts (externally observable)

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `4ba1c93a29999cae9a14ddfcaaf06ecff5b57ae7` |
| Entry tree state | clean (`git status --porcelain` empty) |
| Final HEAD | the single `APP8-G01` commit created from this report — recorded in the final completion response as post-commit external evidence |
| Pushed | **no** |

**On the missing hash field.** A commit cannot contain its own hash, and this
checkpoint deliberately does **not** manufacture a second documentation commit
whose only purpose is to record the first one's hash. The entry HEAD above is the
verifiable in-file anchor; the resulting commit hash is reported externally, after
the commit, where it is checkable with `git log -1`.

---

## 3. Exact Product Owner decisions locked

Full package:
[`../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md`](../audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md).
Canonical phase record: `../phases/APP8-INVENTORY-AND-PRODUCTION.md` §10.5.

### `PO-APP8-001` — COP orders and GRD-015 → **APPROVED_OPTION_A**

`GRD-015`'s reservation clause binds **per reservable order subject**, not per
order.

- **Catalog-only:** valid exact approval snapshot; DEPOSIT `SATISFIED` through
  `DepositEligibilityPort`; order `DEPOSIT_PAID`; order not `ON_HOLD` /
  `CANCELLING`; every inventory-reservable Catalog quantity covered by an active
  official reservation; that reservation `RESERVED` when the production-start
  transaction consumes it.
- **COP-only:** **may enter production with no reservation** once every
  non-inventory guard passes. No SKU, no `sku_stocks` row and no reservation is
  fabricated. The absence is expected behaviour, never an error.
- **Mixed:** Catalog portions require coverage, COP portions require none; start
  is blocked if any required Catalog reservation is missing or not `RESERVED`;
  COP items never weaken a Catalog requirement.
- **Cardinality is the repository's:** `CST-016` allows one active `RESERVED` row
  per `(order_id, sku_stock_id)`, so several Catalog items resolving to one SKU
  share **one** reservation whose quantity covers the order's frozen Catalog
  quantity for that SKU. No per-item rows are invented.
- One `GRD-015` implementation, one deposit predicate, no COP fake-inventory path.

### `PO-APP8-002` — official reservations are no-expiry

`expires_at = NULL`; no expiry sweep in APP8; no TTL value chosen; soft-hold
expiry semantics untouched; `DEC-14` remains deferred and nonblocking. Recorded
as an explicit lock, not a default.

### `PO-APP8-003` — production job creation is Admin-initiated

Synchronous through the Admin API, post-deposit, against the exact approval
snapshot, one job per `(order_id, approval_snapshot_id)`, specification frozen in
the same transaction. No automatic worker creation. `SYSTEM` remains the actor
for the `payment.verified` official-reservation consumer only.

### `PO-APP8-004` — production artifacts deferred, nonblocking

No generation, no DST/PES/EXP writer, no machine-runner architecture, no new
object storage, no customer export, no APP8 artifact HTTP or UI surface.
`attachArtifact` stays untouched and unused. Owner **UNASSIGNED** — deliberately
not routed to APP9 for roadmap symmetry, because no accepted authority makes APP9
its owner. APP8's authoritative production input is the frozen
`production_specifications` row plus the approved design evidence already
reachable through APP6.

### `PO-APP8-005` — APP8 terminal boundary

APP8 ends at job `COMPLETED` + order `PRODUCTION_COMPLETED`. It never executes
`PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT`, remaining-payment collection,
shipping freeze, dispatch, delivery, cancellation execution, refund or final
settlement. APP7's unsatisfied `REMAINING` obligation is preserved for APP9.

### `PO-APP8-006` — shared-persistence promotion is need-driven

`IMP-D054` applies narrowly. Inventory persistence is promoted/reused through
`@embroidery/persistence` because `apps/worker` (`APP8-W01`) and `apps/api` both
write it — no duplicated worker inventory DB logic, no worker-only adapter.
**Production persistence stays API-local** and is promoted later only if a
concrete accepted cross-runtime consumer is proven by inspection. `APP8-B02`
keeps its position and its CC-21 release-vs-consume repair.

### Inherited locks restated as canonical

`DepositEligibilityPort` is the sole deposit authority (no second port, no
duplicated SQL); `INVENTORY_SCHEMA_DISPOSITION` and
`PRODUCTION_SCHEMA_DISPOSITION` are both `NO_MIGRATION_REQUIRED`, and no
`production_job_attempts` table, claim, machine or operator column is created;
the existing PostgreSQL outbox/claim runtime (`IMP-D029`) is reused with no
Redis, broker, queue table, second datastore or alternate idempotency subsystem;
`CUSTOMER_UI_DISPOSITION = NO_CUSTOMER_UI_IN_APP8`; `APP8-D01` remains the design
gate immediately before Admin UI, and no Figma node was touched.

---

## 4. Authority documents checked

Read directly, not quoted from R00:

| Document | What was verified |
|---|---|
| `docs/database/DB3_TRANSITION_GUARD_CATALOG.md` | `GRD-013`, `GRD-014`, `GRD-015`, `GRD-016`–`GRD-022` wording; GRD-015 states a precondition, never a per-order reservation count |
| `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` | `TR-LC17-04`, `TR-LC17-07`, `TR-LC18-01`–`04`, `TR-LC14-04`, `TR-LC14-05` |
| `docs/database/DB0_INVARIANT_INVENTORY.md` | `INV-06` is an ordering-precondition invariant, not a cardinality one |
| `docs/adr/database/ADR-DB1-018-INVENTORY-RESERVATION-EXPIRY.md` | r3 no-expiry marker, r8 sweep scope, Risks ("official reservations may be long-lived by design"), Deferred Details naming official-reservation expiry rules as deferred |
| `docs/database/DB4_SCHEMA_CATALOG_INVENTORY_ASSET.md` | soft holds `expires_at` NOT NULL; reservations allow explicit no-expiry (`NULL` per policy) |
| `docs/database/DB0_OPEN_DECISIONS.md`, `DB1_DECISION_MATRIX.md` | `DEC-14` is *AwDP* — architecture accepted, durations deferred |
| `packages/database/src/schema/inventory/inventory-reservations.ts` | `sku_stock_id NOT NULL`; `expires_at` nullable; `CST-016` partial unique `(order_id, sku_stock_id) WHERE status = 'RESERVED'` |
| `packages/database/src/schema/ordering/order-items.ts` | `ck_order_items__exactly_one_subject` — `sku_id` XOR `customer_owned_product_id` |
| `packages/persistence/src/payment/deposit-eligibility.port.ts` + `apps/api/.../deposit-eligibility.port.ts` | one Symbol, re-exported; `DrizzleDepositEligibilityAdapter`, `PaymentPersistenceModule` present |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-D029`, `IMP-D054`, `IMP-O003` (closed), `IMP-O007`, `IMP-O008` |
| `docs/implementation/audits/APP8_PHASE_ENTRY_AUDIT.md` §5.4–5.7, §6, §10–§13, §19–§21 | the routed decision, the two gaps, the concurrency arbiters, the follow-up dispositions |
| `docs/implementation/reports/APP8-R00-COMPLETION-REPORT.md` | R00's recorded dispositions and `DEC-14` handling |
| `docs/implementation/audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md` | the repository's existing authority-package convention, followed rather than replaced |

## 5. Was any contradiction found?

```text
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
```

No ruling collides with a stronger accepted invariant. Three of them make a
decision the accepted documents had **explicitly deferred to a business
decision**, which is the opposite of an override:

- `PO-APP8-002` is named verbatim in `ADR-DB1-018` Deferred Details
  ("official-reservation expiry/no-expiry rules"), permitted by r3's explicit
  no-expiry marker, and physically represented by the nullable `expires_at` that
  `DB4` §38 documents as exactly that.
- `PO-APP8-003` picks one of the two actors `TR-LC18-01` already lists
  ("system/admin").
- `PO-APP8-004` deferral touches no guard: `TR-LC18-03` has an empty guard column
  and artifacts appear only as an optional in-tx accompaniment.
- `PO-APP8-001` resolves a genuine silence. `GRD-015`/`INV-06` state an ordering
  precondition; no business rule, lifecycle spec, invariant plan or ADR either
  qualifies **or universalises** the clause across the COP branch, and the COP
  branch's impossibility is physical (`sku_id IS NULL` XOR-check versus
  `sku_stock_id NOT NULL`). Option A therefore contradicts nothing; Option B would
  have made a branch APP5/APP6/APP7 delivered end to end permanently unreachable.
- `PO-APP8-005` restates `TR-LC14-04`/`TR-LC14-05` boundaries already accepted.
- `PO-APP8-006` narrows an application rule (`IMP-D054`) without weakening it —
  the rule's stated condition is that two runtimes write the aggregate.

One R00 **wording** imprecision was corrected rather than contradicted: audit
§5.7's phrase "official reservation for the item's frozen quantity" reads as one
reservation per order *item*, which `CST-016` forbids when two Catalog items
resolve to the same SKU. The canonical identity `(order_id, sku_stock_id)` is now
recorded explicitly. This changes no checkpoint, dependency or count.

```text
NEW_ADR_REQUIRED = NO
```

No ADR was created: no ruling selects a new architecture, mechanism or datastore,
and the repository's existing convention for this work is an authority package
plus a decision-register entry (`APP7-G01` / `IMP-D052` precedent), which is what
was used.

---

## 6. Exact files changed

| File | Change |
|---|---|
| `docs/implementation/audits/APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md` | **new** — the authority package (10 sections) |
| `docs/implementation/reports/APP8-G01-COMPLETION-REPORT.md` | **new** — this file |
| `docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | status header; §10.4 marked RESOLVED with its history preserved; **new §10.5** recording all six rulings and the inherited locks; §12 status table `G01 COMPLETE`, `B01 … Next` |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | **`IMP-D056` added** — APP8 inventory/production authority, `LOCKED` |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP8 row: `R00 + G01 COMPLETE`, `PO-APP8-001` closed as Option A, the other five locks summarised, `NEXT_CHECKPOINT = APP8-B01` |

Nothing else was touched. No file outside `docs/implementation/` was modified.

**Historical truth preserved.** `APP8_PHASE_ENTRY_AUDIT.md` and
`APP8-R00-COMPLETION-REPORT.md` are **byte-identical to entry** — neither was
edited. The phase plan's §10.4 keeps R00's original question and both options
verbatim under an explicit "RESOLVED by `APP8-G01`" note, so the discovery of the
ambiguity remains checkable.

---

## 7. Roadmap status

Canonical table:
[`../phases/APP8-INVENTORY-AND-PRODUCTION.md`](../phases/APP8-INVENTORY-AND-PRODUCTION.md)
§12 — the only APP8 status table; it is not duplicated here as a second source of
truth. Its state after this checkpoint:

```text
R00   COMPLETE
G01   COMPLETE
B01   INCOMPLETE — Next
B02 W01 B03 B04 D01 A01 A02 A03 E01 X01   INCOMPLETE
```

Roadmap unchanged and locked:

```text
R00 -> G01 -> B01 -> B02 -> W01 -> B03 -> B04 -> D01 -> A01 -> A02 -> A03 -> E01 -> X01
```

Exactly one `Next` exists, and it is `APP8-B01` — verified by grep (§8).

---

## 8. Validation command ledger

Change-impact only. This is a documentation/authority checkpoint; its changed
inputs are five Markdown files under `docs/implementation/`, and `docs/` is
`.prettierignore`d as a locked baseline, so no formatter governs them.

| Command/check | Exact changed question/input | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `git diff --check` | the four tracked doc edits | **PASS** — no whitespace errors, exit 0 | 0 | The only mechanical defect a Markdown-only diff can carry |
| `git status --porcelain` | which paths this checkpoint touched | **PASS** — exactly 3 modified + 2 new, all under `docs/implementation/` | 0 | Proves the scope controls held: no runtime source, test, schema, migration, generated artifact or Figma file appears |
| `grep -n "Next" docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md` | the §12 status table after the G01 edit | **PASS** — exactly one status row carries `Next`, and it is `B01`; the only other hit is §12's own prose sentence | 0 | Directly answers the "exactly one `NEXT`" acceptance criterion |
| `node tools/check-report-secrets.mjs` (`CMD-CHECK-REPORT-SECRETS`) | this new completion report and the new authority package | **PASS for every APP8-G01 file**; exit 1 on one **pre-existing unrelated** finding — see §8.1 | 1 (justified: the first run predated staging, so the gate — which reads `git ls-files` — had not yet seen either new file) | The repository gate whose stated trigger is "any new or edited completion report" |
| Targeted reference reads (`sed`/`grep`) over the 13 authority documents in §4 | whether any of the six rulings contradicts a stronger accepted invariant | **PASS** — none found | 0 | Every claim in §3 and §5 is anchored to a line actually read, not to R00 prose |

### 8.1 Report-secret gate — one pre-existing unrelated finding, not absorbed

`tools/check-report-secrets.mjs` has **no path filter**: it scans every tracked
`docs/**/*.md` from `git ls-files`. Its output is:

```text
Secret-disclosure check failed:
  docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93: "token" is followed by
  what looks like a plaintext value. ...
exit 1
```

That is the single finding, and it is **the whole output**. Facts:

- It is `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` — **pre-existing, APP6-owned,
  already carried as `CARRY_NONBLOCKING`** by the audit's §19 disposition, and
  present at entry HEAD `4ba1c93` before this checkpoint changed anything.
- **Zero findings** are reported against
  `APP8-G01-COMPLETION-REPORT.md` or
  `APP8_G01_INVENTORY_AND_PRODUCTION_AUTHORITY.md`.
- Both new files were **staged before the recorded run**, so the gate actually
  read them — the tool sees only tracked files, and an unstaged new report would
  have been silently skipped. That is why the run count is 1 rather than 0.

Recorded here once. **The debt is not absorbed into `APP8-G01`.** APP6 history is
not rewritten, and no APP6 report was edited to make a gate green.

### 8.2 Executed results

```text
git diff --check                    -> exit 0, no output
git status --porcelain              -> 3 modified + 2 new, all under docs/implementation/
grep "Next" (phase plan)            -> 2 hits: §12 prose, "B01   INCOMPLETE — Next"
node tools/check-report-secrets.mjs -> exit 1; sole finding pre-existing and APP6-owned;
                                       no APP8-G01 file flagged (§8.1)
```

---

## 9. Deliberately not run

```text
BROAD_REGRESSION = NOT_RUN_BY_DESIGN
```

Nothing below has a changed input. Running any of them would be a rerun of a
passing command over unchanged bytes, which
`docs/implementation/VALIDATION_GOVERNANCE.md` and the phase's §13.2 policy
forbid:

- full Jest, and every backend / API / worker / Admin / Storefront suite;
- inventory race suites and DB8 concurrency proofs;
- production transition and transaction suites;
- Playwright, all projects;
- OpenAPI generation and API-client generation (no contract changed — `85 paths /
  92 operations / 191 schemas` untouched);
- migrations and any database lifecycle command (`0 migrations`, 37 unchanged);
- Docker startup;
- repository-wide build or typecheck;
- SonarQube;
- `node tools/check-figma-design-index.mjs` — no design or frontend UI checkpoint,
  and `G01_FIGMA_CHANGES = 0`;
- Prettier / `format:check` — `docs/` is `.prettierignore`d as a locked baseline
  (`CLAUDE.md` §19), so no formatter governs any changed file.

---

## 10. Remaining nonblocking follow-ups

None were created by this checkpoint. Carried forward unchanged from the audit's
§19 disposition:

| Item | Status after `APP8-G01` |
|---|---|
| `DEC-14` (reservation TTL) | `CARRY_NONBLOCKING` — APP8 is unblocked by the locked no-expiry branch (`PO-APP8-002`); TTL values stay deferred for any future policy that genuinely needs one |
| **Production artifact generation / management** | **`DEFERRED_NONBLOCKING`, owner `UNASSIGNED`** (`PO-APP8-004`). Deliberately not assigned to APP9. Activation condition: the first phase whose accepted requirements need a machine file or operator artifact records ownership then |
| `FU-ADMIN-SHARED-DIALOG-01` | `CARRY_NONBLOCKING` — if an APP8 Admin checkpoint would write a third scrim/focus-trap copy, extract within that checkpoint's own scope |
| `FU-APP7-S01-SCSS-GATE-01` | `CARRY_NONBLOCKING` — tooling coverage |
| `FU-APP6-B04-REPORT-SECRET-HEURISTIC-01` | `CARRY_NONBLOCKING` — pre-existing and APP6-owned; **observed again in this checkpoint's secret-gate run (§8.1) and deliberately not absorbed into APP8-G01**. No APP6 report was edited to make the gate green |
| `IMP-O007` (payment provider) | `NOT_RELEVANT_TO_APP8` — stays open outside APP8's ownership |
| `IMP-O008` (cancellation/refund parameters) | APP9-owned; `PO-APP8-005` keeps it outside APP8 |

Two known implementation gaps stay routed exactly where R00 put them, untouched
by this documentation checkpoint: **Gap A** (nothing creates a `sku_stocks` row) →
`APP8-B01`; **Gap B** (`releaseReservation` / `consumeReservation` take no
reservation row lock, so the DB3 `CC-21` release-vs-consume arbiter is physically
absent) → `APP8-B02`.

---

## 11. Acceptance criteria

| Criterion | Met |
|---|---|
| `PO-APP8-001` locked as Option A | yes — §3, authority §1, phase §10.5, `IMP-D056` |
| COP-only production allowed without a reservation when non-inventory guards pass | yes — authority §1.3 |
| Mixed orders require coverage for Catalog portions only | yes — authority §1.4 |
| APP8 official reservations explicitly no-expiry | yes — authority §2 |
| Production job creation explicitly Admin-initiated | yes — authority §3 |
| Artifact generation/management explicitly deferred, nonblocking | yes — authority §4, §10 above |
| Terminal state explicitly job `COMPLETED` + order `PRODUCTION_COMPLETED` | yes — authority §5 |
| APP9-only transitions remain outside APP8 | yes — authority §5 table |
| `DepositEligibilityPort` remains the sole deposit authority | yes — authority §7.1 |
| `IMP-D054` applied narrowly (inventory promoted, production not) | yes — authority §6 |
| No schema migration introduced | yes — 0 files under `packages/database/migrations/` touched |
| No new queue/broker/idempotency architecture | yes — authority §7.3 |
| No Storefront/customer UI | yes — authority §7.4 |
| Canonical roadmap preserved | yes — no contradiction was proven, so it is unchanged |
| Exactly one `NEXT`, and it is `APP8-B01` | yes — verified by grep, §8 |
| R00 historical evidence intact | yes — audit and R00 report unmodified; §10.4 preserved verbatim under a RESOLVED note |
| No implementation checkpoint begun | yes — `APP8-B01` not started |
| Validation change-impact only | yes — §8, §9 |
| Completion report written | yes — this file |
| Nothing pushed | yes |

---

## 12. Stop

```text
APP8-G01 = COMPLETE
NEXT_CHECKPOINT = APP8-B01
NOT_PUSHED = true
```
