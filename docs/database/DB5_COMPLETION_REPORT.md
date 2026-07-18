# DB5 — Completion Report

**Checkpoint:** DB5 — Query, Access Path & Index Design
**Date:** 2026-07-18 · **Branch:** `production` · **Baseline HEAD:** `456e101`
**Verdict:** **DB5 PASS WITH DEFERRED MEASURED TUNING**

---

## A. Preflight

| Check | Result |
|---|---|
| Branch | `production` |
| HEAD at start | `456e1014fd1543a7efcf3ebe1860e62f2d0e1111` |
| Working tree | clean; no pre-existing user changes |
| Baseline commits verified | `563d986`, `a0e29b4`, `f90f78c`, `0563866`, `a79f523`, `456e101` — all exist |
| DB4 completion report | present |
| DB4 deliverables | all present (`DB4_*`, 24 files) |
| ADRs | all present (18 DB1 + 3 DB2 + 4 DB3 + 4 DB4) |
| ORM / schema / migration / SQL artifacts | **none found** |
| DB0–DB4 history | not amended, squashed or rewritten |
| DB4 logical schema | **unmodified** |

## B. Inputs validated

DB0 (query catalog, requirement matrix, invariant inventory), DB1 (decision
matrix, handoff, correction report), DB2 (contexts, aggregates,
relationships, ownership), DB3 (lifecycles, guards, concurrency, idempotency,
derived state, handoffs), DB4 (tables, columns, keys/constraints,
relationships, 7 schema documents, state/snapshot/money/JSONB models,
traceability, DB5/DB6/test handoffs) — plus all 29 database ADRs.

Baseline inherited unchanged: 78 tables · ~430 columns · 105 relationships ·
125 constraints · 15 contexts · 23 aggregates · 29 lifecycles · 35 invariants
· 30 guards · 28 concurrency scenarios · 9 JSONB payloads · exact-numeric
money · hybrid transition history · context-specific asset associations ·
single `public` schema · text+CHECK statuses · Deposit/Remaining independence
· shipping freeze at dispatch.

## C. Query coverage and priority

| Set | Count | Complete | Deferred syntax | No index required | Unresolved |
|---|---|---|---|---|---|
| Q-01..Q-33 | 33 | 29 | 2 | 2 | **0** |
| QX-01..QX-11 | 11 | 8 | 2 | 1 | **0** |
| Additional retained paths | 30 | 30 | — | — | **0** |

**74 access paths, 100% covered.** No query ID renumbered; no field outside
DB4 used.

Priority: **P0** 14 · **P1** 20 · **P2** 8 · **P3** 2.

Three explicit no-index decisions, each with rationale and a revisit
threshold: Q-20 low stock (IDX-R01), Q-33 analytics (IDX-R02), QX-08 merge
queue (IDX-R03).

## D. Index summary

| Category | Count |
|---|---|
| Integrity-backed (`CST-*` consequences) | 64 (63 required + 1 conditional) |
| Performance — required | 47 |
| Performance — recommended | 23 |
| **Total defined** | **134** (`IDX-001`..`IDX-138`, 4 IDs retired) |
| Rejected with rationale | 15 (`IDX-R01`..`IDX-R15`) |
| GIN / JSONB / expression / INCLUDE / non-B-tree | **0** |
| Extensions required | **0** |

Average 1.7 indexes per table including PKs. The two most important numbers:
**`sku_stocks` carries 2** (the lock anchor) and **`outbox_events` carries 3**
(the highest-write table).

## E. DB5 decisions

| ADR | Decision |
|---|---|
| **ADR-DB5-001** Pagination | 5 classes; every sort ends in a unique tie-breaker; `KEYSET` only where offset is genuinely unsafe (Q-16); `IMMUTABLE_CURSOR` for append-only history — critically for ledger replay and saga resume, where a skipped row is a silent correctness failure |
| **ADR-DB5-002** Text/collation | two text populations formally split; Population A stays bytewise `C` (justifying the ADR-DB1-001 baseline from the query set); `vi-x-icu` locked as the mechanism but **not built** — no MVP listing sorts by name; **no extension requested**; nondeterministic collations prohibited on tokens |
| **ADR-DB5-003** Worker claim | `CONTENDED_CLAIM` vs `SWEEP`; time-dependent claimability kept **out** of index predicates (range scan on the key instead); `NULLS FIRST` on the outbox claim; claim must exit the claimable set in-transaction; dead-letter excluded structurally |
| **ADR-DB5-004** Governance | naming, mandatory metadata, speculative-index prohibition, mechanical redundancy review, per-profile write budgets, removal criteria, concurrent-build direction, dormant collation-drift step |

## F. Context index summary

| Context | Indexes | Notable |
|---|---|---|
| Identity/Customer | 25 | IDX-007 grant probe (no status predicate — deliberate); IDX-107/134 full-scan paths for merge correctness |
| Catalog/Gallery/Content | 22 | publication state in partial predicates; IDX-108 effective agreement |
| Inventory/Asset | 22 | IDX-016 anchor + IDX-113/114 sized for **lock-hold time**; IDX-099 planner-implication case |
| Design/Ordering | 34 | **IDX-024** single active review; **IDX-032** request→order; IDX-103/104 saga resume |
| Quotation/Payment | 22 | **IDX-042** obligation independence; **IDX-043** callback arbiter; 4 reconciliation forms |
| Production/Shipping | 9 | smallest footprint; both shipping paths are unique constraints |
| Notification/Audit/Platform | 18 | **IDX-088** claim index; audit's 4 lookup forms |

## G. Security and locking

**No missing security-scope predicate was found.** Every customer-facing
query resolves through the grant (Q-08 → scope check), never by resource id
alone. Three deliberate design outcomes recorded: no index makes an unscoped
lookup convenient; no secret is stored or compared in a form a collation
choice could weaken; no index aggregates security evidence or PII into a
searchable surface. No fuzzy/substring index exists on any PII column.

**28/28 concurrency scenarios** have a lock anchor, lookup index, lock order
and deadlock assessment. Four races are arbitrated by **uniqueness rather
than locking** (CC-03 via IDX-024, CC-07 via IDX-058+IDX-043, CC-11 via
IDX-032, CC-26 via IDX-057). Lock ordering is uniform per family; **CC-27
customer merge is the only genuine deadlock risk** and requires deterministic
two-row ordering (D8-18).

## H. Dashboard and operational scans

Q-22 decomposed into **12 buckets adding zero indexes** — every bucket reuses
an index that already exists for its own P0/P1 query, which is the strongest
available evidence that the per-context design is correct. No materialized
view, no counter table, no giant composite.

11 cleanup/expiry scans indexed, 3 deliberate no-index decisions, **0
hard-coded durations** (all TTLs are policy configuration).

## I. JSONB and text search

**9 of 9 JSONB columns → no index. Zero GIN, zero schema change requests.**
This is structural rather than cautious: ADR-DB4-004 admitted a column to the
JSONB set only after its invariant-bearing facts were extracted to relational
columns, so by construction none holds a fact worth filtering on.

Text: every hot lookup is a bytewise unique-index probe with no collation
dependence. Vietnamese linguistic sorting is deferred to the application
until a DB-side name-ordered listing exists; the escalation ladder
(prefix → trgm → FTS → external) is locked with extension-request gates.

## J. Cost and redundancy

- **0 duplicate indexes.** Five overlaps exist, all justified — each is a
  correctness matter where a **partial index cannot serve as a full access
  path** (grants incl. revoked, contacts incl. non-primary, obligations incl.
  superseded, holds/reservations incl. terminal, and the IDX-020/IDX-099
  planner-implication case).
- **~15 indexes avoided** through leading-prefix exploitation.
- **3 budget exceptions**, each recorded with first-removal candidates:
  `payment_provider_events` (5), `audit_events` (5),
  `idempotency_records` (4).
- **0 speculative indexes** — every performance index names a catalogued
  query.

## K. Handoffs

**DB6:** 5 implementation phases (constraint-backed first), raw-SQL
requirements (~45 partials, `NULLS FIRST`, explicit DESC), **0 extension
requests**, `ANALYZE` after seeding, 5 spikes, fresh-install vs
concurrent-build direction, 8-point definition of done.

**DB7/DB8:** 134 index existence/shape assertions, a new
predicate-vocabulary test, 4 negative-test classes, 28 CC scenarios with
access-path assertions, plus two new assertions (merge enumeration
completeness; snapshot immutability after merge).

**DB9:** 7 dataset scenarios (D-A..D-G) and 15 distribution requirements —
notably a `FAILED` derivative beside a `READY` one, outbox rows with mixed
NULL/future `next_attempt_at`, reservations with NULL `expires_at`, and a
second customer for IDOR testing. An unseeded state is an unexercised index.

**DB10:** usage review (IDX-078/097/098 first), dormant collation-drift step,
bloat priorities, backup/upgrade regression via stored EXPLAIN artifacts.

## L. Schema change requests

**0 blocking · 0 non-blocking.** Four observations recorded where the design
met friction and resolved it without a schema change (asset-derivative
predicate shape, low-stock column-vs-column predicate, audit polymorphic
target, CST-046 extension dependency). In each case the change that would
have been "convenient" would have weakened a locked constraint, introduced a
persisted derived value, or reopened a DB4 decision.

## M. Completeness

| Dimension | Coverage |
|---|---|
| Queries (33 + 11 + 30) | 74/74 |
| Tables | 78/78 |
| Relationships | 105/105 |
| Constraints | 125/125 |
| Invariants | 35/35 |
| Guards | 30/30 |
| Concurrency scenarios | 28/28 |
| JSONB columns | 9/9 |
| Cleanup scans | 14/14 |
| Dashboard buckets | 12/12 |
| **Unresolved critical items** | **0** |

## N. Scope compliance

**Not done (correctly):** no package/lockfile change · no Drizzle schema or
index API · no SQL · no migration · no actual index, constraint or trigger ·
no repository/query/backend/test code · no Docker change · no materialized
view implementation · no analytics/search provider selected · **DB6 not
started**.

**Not reopened:** ORM, migration strategy, aggregate ownership, lifecycle
policy, money model, transition-history storage, asset association, JSONB
boundaries. DB4 logical schema unmodified; DB0–DB4 history intact.

## O. Validation

| Check | Result |
|---|---|
| Docs-only change | PASS |
| Query coverage 100% | PASS |
| All IDs valid DB4 IDs | PASS |
| `IDX-*` unique, owner + query mapped | PASS |
| Partial predicates use exact DB3 states | PASS |
| Composite column order justified | PASS |
| No unexplained duplicate index | PASS |
| No speculative JSONB index | PASS |
| Write-heavy tables not over-indexed | PASS (3 exceptions recorded) |
| Security scope on every customer query | PASS |
| `QUOTE_ACCEPTED` / `ON_HOLD` / `CANCELLING` handled | PASS |
| Deposit/Remaining independence preserved | PASS |
| Approval→deposit→reservation→production chain | PASS |
| Final payment → freeze/dispatch (TX read, not FK) | PASS |
| Agreement effective version | PASS |
| Cancellation resume path | PASS |
| Notification/outbox separation | PASS |
| Derived state not treated as authority | PASS |
| Technical vs Vietnamese text separated | PASS |
| Extension/fallback explicit | PASS (0 required) |
| Hashing independent of collation | PASS |
| CC-01..CC-28 covered | PASS |
| No `CREATE INDEX` / SQL / ORM code | PASS |
| Internal links resolve | PASS |
| DB1–DB4 ADRs unchanged | PASS |
| Decision log append-only | PASS |

## P. Commit

Docs-only. Files added: **26** `docs/database/DB5_*` + **4**
`docs/adr/database/ADR-DB5-*` (30 deliverables). Files updated:
`docs/database/README.md`, `docs/database/DB_ROADMAP.md`,
`docs/database/DB4_DB5_HANDOFF.md` (consumed-by pointer only),
`docs/12-DECISION-LOG.md` (D-042, append-only).

Validation evidence executed on the working tree before commit:

| Check | Command class | Result |
|---|---|---|
| Docs-only change | `git status --porcelain` | PASS — 30 added, 4 modified, all under `docs/` |
| DB1–DB4 ADRs unchanged | `git status docs/adr/database/` | PASS — only `ADR-DB5-*` untracked |
| DB0–DB4 docs unchanged | `git status docs/database/` | PASS — only the `DB4_DB5_HANDOFF` pointer |
| No SQL/DDL/ORM code | grep for `CREATE INDEX`/`ALTER TABLE`/`pgTable`/`drizzle` | PASS — 4 hits, all prose negations |
| Internal links resolve | relative-link existence scan over all 30 files | PASS — 0 broken |
| `IDX-*` uniqueness | catalog extraction | PASS — 134 defined, 134 unique |
| `IDX-*` referential integrity | referenced vs defined | PASS — only the 4 documented retired IDs unbound |
| `TBL/COL/REL/CST/CC/Q` ranges | range validation | PASS — 0 out-of-range |
| Partial-predicate state vocabulary | extracted 33 distinct state values | PASS — all exact DB3 §1 members |

## Q. Verdict

```text
DB5 PASS WITH DEFERRED MEASURED TUNING
```

The query, access-path and index architecture is **locked**. Deferred items
are exclusively of the permitted kinds — exact physical syntax, planner
choice, measured INCLUDE columns, extension activation with fallback,
post-EXPLAIN add/remove, and production thresholds — and every one carries an
owner and an acceptance condition
([`DB5_COMPLETENESS_MATRIX.md`](./DB5_COMPLETENESS_MATRIX.md) §16).

The verdict is not plain `DB5 PASS` for one honest reason: **10 of the 28
concurrency access paths depend on row-lock emission syntax
(`FOR UPDATE` / `FOR UPDATE SKIP LOCKED`) that the DB6 spike has not yet
proven.** The lock anchors, indexes and orderings are fully designed and a
raw-SQL fallback is documented, so this is deferred *mechanism*, not deferred
*design* — but it is a real dependency and is recorded as such rather than
being papered over.

**DB6 may begin.**
