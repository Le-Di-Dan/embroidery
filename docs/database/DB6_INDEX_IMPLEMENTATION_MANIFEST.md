# DB6 — Index Implementation Manifest

**Date:** 2026-07-18 · **Slice:** DB6-C0
**Closes:** DB5-A01 (count semantics), DB5-A02 (one physical owner per
integrity object), DB5-A11 (launch vs measured tuning), DB5-A15 (no-index
decisions)
**Source of truth:** `DB5_INDEX_CATALOG.md`, `DB5_INDEX_NAMING_AND_HANDOFF.md`,
`DB5_CONSTRAINT_INDEX_MAP.md`

> **The headline number is not an instruction.** "134 indexes" is the count of
> `IDX-*` **catalog entries**, not a count of `CREATE INDEX` statements. Of the
> 134, **50 are created by PostgreSQL as constraint backing indexes and must
> never be written as an explicit index**, 1 is conditional and not built, and
> **83 are explicit**. A further 78 backing indexes exist for primary keys and
> carry no `IDX-*` ID at all.

---

## 1. Catalog reconciliation (DB5-A01)

### 1.1. ID range vs entries

| Item | Value |
|---|---|
| ID range allocated | `IDX-001` … `IDX-138` (138 slots) |
| **Retired / unassigned IDs** | **4** — `IDX-072`, `IDX-083`, `IDX-089`, `IDX-128` |
| **Catalog entries defined** | **134** |
| Rejected proposals | **15** — `IDX-R01` … `IDX-R15` (separate ID space, never built) |

The four retired IDs were allocated to candidates the DB5 redundancy review
rejected before the catalog was finalised (covered by IDX-015 prefix, IDX-044
prefix, the dead-letter split, and IDX-R11). DB5 retired rather than reused
them so `IDX-*` references stay stable across DB6–DB10. **DB6 does not reuse
them.**

### 1.2. Entries by category

| Category | Count | Sub-split |
|---|---|---|
| Integrity-backed (`INT`) `IDX-001..064` | **64** | 63 required + 1 conditional |
| Performance (`PERF`) `IDX-065..138` | **70** | 47 required + 23 recommended |
| **Total entries** | **134** | |

### 1.3. Entries by launch status

| Status | Count | IDs |
|---|---|---|
| **Required** (integrity) | 63 | IDX-001..055, 057..064 |
| **Required** (performance, P0/P1) | 47 | see §3 |
| **Recommended** (launch, removable on evidence) | 23 | see §3 |
| **Conditional — not built at launch** | 1 | **IDX-056** |
| Deferred measured tuning | 0 entries | INCLUDE columns, collated, trigram, BRIN — none carry an `IDX-*` ID |
| Rejected | 15 (`IDX-R*`) | never built |

**Launch total = 133 of 134 entries.** Only IDX-056 is withheld.

---

## 2. Physical ownership (DB5-A02)

Each integrity object has **exactly one** physical owner. PostgreSQL creates a
backing index automatically for `PRIMARY KEY` and `UNIQUE` **constraints**; it
does **not** support a partial unique *constraint*, so every partial unique
must be an explicit `CREATE UNIQUE INDEX`.

### 2.1. Ownership rules applied

| Catalog `U` column | Physical owner | Explicit `CREATE INDEX`? |
|---|---|---|
| `U` plain unique | `UNIQUE` constraint (`unique(name)`) | **no** — PostgreSQL creates the backing index |
| `pU` partial unique | explicit `uniqueIndex(name).where(...)` | **yes** |
| `XCL` exclusion | exclusion constraint | conditional, not built |
| (no ID) primary key | `PRIMARY KEY` constraint | **no** |
| `PERF` | explicit `index(name)` | **yes** |

### 2.2. The 13 partial unique indexes (explicit)

| IDX | Table | Physical name | CST |
|---|---|---|---|
| IDX-002 | admin_accounts | `uq_admin_accounts__status__active` | CST-003 |
| IDX-004 | customer_contact_points | `uq_customer_contact_points__kind_value__verified` | CST-005 |
| IDX-005 | customer_contact_points | `uq_customer_contact_points__customer__primary` | CST-006 |
| IDX-006 | contact_verification_challenges | `uq_verification_challenges__kind_value_purpose__issued` | CST-007 |
| IDX-008 | secure_access_grants | `uq_secure_access_grants__customer_request__active` | CST-009 |
| IDX-009 | customer_merge_cases | `uq_customer_merge_cases__survivor_loser__requested` | CST-010 |
| IDX-017 | inventory_soft_holds | `uq_inventory_soft_holds__request_stock__held` | CST-015 |
| IDX-018 | inventory_reservations | `uq_inventory_reservations__order_stock__reserved` | CST-016 |
| IDX-020 | asset_derivatives | `uq_asset_derivatives__asset_kind__not_failed` | CST-018 |
| **IDX-024** | design_versions | `uq_design_versions__case__sent_for_review` | **CST-022** |
| IDX-034 | order_cancellation_requests | `uq_cancellation_requests__order__pending` | CST-032 |
| **IDX-042** | payment_obligations | `uq_payment_obligations__order_kind__live` | **CST-039** |
| IDX-064 | asset_derivatives | `uq_asset_derivatives__storage_key__set` | CST-017 family |

IDX-024 and IDX-042 are concurrency arbiters (INV-16/CC-03, INV-04). They are
not optimisations — losing them turns a rejected duplicate into two valid rows.

### 2.3. Constraint-created backing indexes (never written explicitly)

**50 entries**: all `IDX-001..064` rows marked `U`, i.e. the 64 integrity
entries minus the 13 partial uniques and IDX-056.

```text
IDX-001 003 007 010 011 012 013 014 015 016 019 021 022 023 025 026 027
IDX-028 029 030 031 032 033 035 036 037 038 039 040 041 043 044 045 046
IDX-047 048 049 050 051 052 053 054 055 057 058 059 060 061 062 063
```

Writing any of these as an explicit index would create a **duplicate**: two
B-trees on identical keys, doubling write cost and index bloat while enforcing
one invariant. `DB5_DB6_HANDOFF.md` §9 forbids it. The fresh-install gate scans
for duplicate `(table, key-list, predicate)` pairs.

### 2.4. Primary-key backing indexes

**78** — one per table (CST-001). They carry **no `IDX-*` ID**: DB5 did not
catalog them because their necessity is not an index decision. They are real
physical objects and are counted by the parity gate.

### 2.5. Physical object roll-up at launch

Canonical metric model — one row per metric, no metric reused under another
name. The manifest checker verifies the formula balances.

| Metric | Value |
|---|---|
| IDX ID range | IDX-001..138 (138 slots) |
| Catalog entries | 134 |
| Retired IDs (never reused) | 4 |
| Logical selected entries (launch) | 133 (134 − IDX-056 conditional) |
| Expanded logical index specifications | **134 — identical to catalog entries** (see below) |
| Constraint-created physical indexes | **128** = 78 PK backing + 50 UNIQUE backing |
| Explicit physical indexes | **83** = 13 partial unique + 70 performance |
| **Total physical indexes at launch** | **211** |
| Conditional physical indexes (not built) | 1 (IDX-056) |
| Rejected candidates (never built) | 15 (`IDX-R01..R15`) |
| No-index query decisions | 3 (Q-20, Q-33, QX-08) |

**Formula (checker-enforced):**

```text
constraint-created (78 PK + 50 UNIQUE = 128)
+ explicit          (13 partial unique + 70 performance = 83)
= total physical indexes at launch: 211
```

Four clarifications that the formula depends on:

1. **Every `IDX-*` maps 1:1 to exactly one physical index.** No entry expands
   to multiple physical objects — DB5 already performed that expansion when it
   assigned IDs (e.g. CST-011's four slug uniques are IDX-010/011/012/013,
   four separate entries, not one entry ×4). Expanded logical specifications
   therefore equal catalog entries (134), and no child-ID namespace
   (`IDX-xxx.a`) is needed. The *CST* side is where ×N expansion happens — see
   the schema manifest §2.3.
2. **The 13 partial uniques are inside the 83 explicit indexes**, not added on
   top. PostgreSQL has no partial unique *constraint*, so they must be
   explicit `CREATE UNIQUE INDEX` statements; they are counted once, in the
   explicit column.
3. **The 78 PK backing indexes are *not* inside the 50.** The 50 are backing
   indexes of `UNIQUE` constraints only (the `U`-marked integrity entries).
   PK backing indexes carry no `IDX-*` ID at all and are counted separately.
4. **PostgreSQL does not auto-create FK-support indexes.** Every FK-support
   index DB5 selected (IDX-069, 075, 077, 099, 100, 101, 102, 106, 107, 134,
   …) is an explicit performance entry inside the 70. A FK constraint alone
   creates no index — assuming otherwise would silently lose the entire
   FK-lookup tier.

Per-`IDX-*` physical identity: table, keys, predicate, owner and
implementation group are given in §2.2 (partial uniques), §2.3 (constraint
backing) and §3 (performance). No physical object appears in more than one of
those registers; the checker fails on any overlap.

**83 explicit `CREATE INDEX` statements — not 134.** This is the DB5-A01
answer.

---

## 3. Performance index register (IDX-065 … IDX-138)

`R` = required (launch) · `r` = recommended (launch, removable on evidence).
All are explicit. Partial predicates are reproduced from the catalog and must
match the query text exactly.

### 3.1. Catalog / Gallery / Content — G5, G12

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-065 | products | (category_id, display_order, id) | `status='PUBLISHED'` | R | G5 |
| IDX-066 | gallery_entries | (display_order, id) | `status='PUBLISHED'` | R | G12 |
| IDX-067 | content_pages | (id) | `status='PUBLISHED' AND is_indexable` | r | G12 |
| IDX-068 | product_variants | (product_id, display_order) | — | R | G5 |
| IDX-069 | skus | (product_variant_id) | — | R | G5 |
| IDX-070 | product_sides | (product_id, display_order) | — | R | G5 |
| IDX-071 | embroidery_areas | (product_side_id, display_order) | — | R | G5 |
| IDX-108 | agreement_versions | (agreement_id, effective_from **DESC**, id **DESC**) | `status='PUBLISHED'` | R | G12 |

### 3.2. Inventory / Asset — G4, G6, G10, G15

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-086 | assets | (created_at, id) | `status IN ('UPLOADED','INSPECTING')` | R | G4 |
| IDX-087 | asset_derivatives | (created_at, id) | `status IN ('PENDING','PROCESSING')` | R | G4 |
| IDX-099 | asset_derivatives | (asset_id) | — | R | G4 |
| IDX-119 | assets | (uploaded_by_customer_id) | `uploaded_by_customer_id IS NOT NULL` | r | G4 |
| IDX-132 | asset_inspections | (asset_id, inspected_at) | — | r | G4 |
| IDX-133 | assets | (deletion_requested_at, id) | `status='DELETION_PENDING'` | R | G4 |
| IDX-115 | inventory_ledger_entries | (sku_stock_id, id) | — | R | G6 |
| IDX-109 | inventory_soft_holds | (expires_at, id) | `status='HELD'` | R | G10 |
| IDX-113 | inventory_soft_holds | (sku_stock_id, id) | `status='HELD'` | R | G10 |
| IDX-127 | inventory_soft_holds | (custom_request_id) | — | r | G10 |
| IDX-110 | inventory_reservations | (expires_at, id) | `status='RESERVED' AND expires_at IS NOT NULL` | R | G15 |
| IDX-114 | inventory_reservations | (sku_stock_id, id) | `status='RESERVED'` | R | G15 |
| IDX-126 | inventory_reservations | (order_id) | — | r | G15 |

`sku_stocks` gets **no** performance index: PK + IDX-016 only. Deliberate
minimum on the hottest contended row (`DB5_DB6_HANDOFF.md` §9).

### 3.3. Design / Ordering — G7, G9, G11, G13, G15

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-085 | design_sessions | (last_activity_at, id) | `status='ACTIVE'` | R | G7 |
| IDX-073 | custom_requests | (status, created_at **DESC**, id **DESC**) | — | R | G9 |
| IDX-117 | custom_requests | (customer_id) | — | r | G9 |
| IDX-100 | custom_request_transitions | (custom_request_id, id) | — | R | G9 |
| IDX-137 | request_moderation_notes | (custom_request_id, created_at) | — | r | G9 |
| IDX-116 | design_reviews | (design_version_id, decided_at) | — | r | G11 |
| IDX-136 | approval_snapshots | (custom_request_id) | — | r | G13 |
| IDX-074 | orders | (status, created_at, id) | — | R | G15 |
| IDX-104 | orders | (id) | `status='CANCELLING'` | R | G15 |
| IDX-118 | orders | (customer_id) | — | r | G15 |
| IDX-101 | order_transitions | (order_id, id) | — | R | G15 |
| IDX-103 | order_transitions | (order_id, id) | `event_kind='SAGA_STEP'` | R | G15 |
| IDX-125 | shipping_fee_acknowledgements | (order_id) | — | r | G15 |

`shipping_details` / `shipping_snapshots` get no performance index: both access
paths are the unique constraints IDX-035/036.

### 3.4. Quotation / Payment — G14, G16

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-084 | quotation_versions | (valid_until, id) | `status='SENT'` | R | G14 |
| IDX-075 | payment_obligations | (order_id) | — | R | G16 |
| IDX-076 | payment_attempts | (created_at **DESC**, id **DESC**) | `status IN ('FAILED','REQUIRES_REVIEW')` | R | G16 |
| IDX-077 | payment_attempts | (payment_obligation_id) | — | R | G16 |
| IDX-078 | payment_attempts | (provider_key, provider_ref) | `provider_ref IS NOT NULL` | r | G16 |
| IDX-079 | payment_provider_events | (received_at **DESC**, id **DESC**) | — | R | G16 |
| IDX-080 | payment_provider_events | (payment_attempt_id) | `payment_attempt_id IS NOT NULL` | R | G16 |
| IDX-081 | payment_provider_events | (received_at, id) | `payment_attempt_id IS NULL` | R | G16 |
| IDX-122 | refunds | (order_id) | — | r | G16 |
| IDX-123 | refunds | (created_at, id) | `status IN ('PENDING_REVIEW','APPROVED')` | r | G16 |
| IDX-124 | payment_reconciliations | (payment_attempt_id) | — | r | G16 |

`payment_provider_events` carries 5 indexes (PK + IDX-043/079/080/081) on an
append-heavy table, exceeding the ≤3 budget. **Recorded exception**, justified
in DB5 cost report §5. IDX-075 coexisting with IDX-042's `(order_id, ...)`
prefix is also a recorded, justified same-prefix case: IDX-042 is partial and
excludes SUPERSEDED/CANCELLED rows that Q-09 must still show.

### 3.5. Production — G17

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-082 | production_jobs | (created_at, id) | `status IN ('PLANNED','STARTED')` | R | G17 |
| IDX-102 | production_job_transitions | (production_job_id, id) | — | R | G17 |
| IDX-138 | production_notes | (production_job_id, created_at) | — | r | G17 |

### 3.6. Identity / Customer — G1, G3, G8, G10

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-120 | admin_sessions | (admin_account_id) | — | r | **G1** |
| IDX-121 | admin_sessions | (expires_at, id) | `status='ACTIVE'` | R | **G1** |
| IDX-129 | customers | (merged_into_customer_id) | `merged_into_customer_id IS NOT NULL` | r | G3 |
| IDX-134 | customer_contact_points | (customer_id) | — | R | G3 |
| IDX-112 | contact_verification_challenges | (expires_at, id) | `status='ISSUED'` | R | G8 |
| IDX-130 | contact_verification_challenges | (contact_point_id) | `contact_point_id IS NOT NULL` | r | G8 |
| IDX-111 | contact_verification_attempts | (challenge_id, attempted_at) | — | R | G8 |
| IDX-105 | secure_access_grants | (expires_at, id) | `status='ACTIVE'` | R | G10 |
| IDX-106 | secure_access_grants | (custom_request_id) | — | R | G10 |
| IDX-107 | secure_access_grants | (customer_id) | — | R | G10 |
| IDX-135 | customer_merge_events | (merge_case_id, id) | — | r | G10 |

IDX-107 is required **despite** IDX-008 leading with `customer_id`: IDX-008 is
partial (`status='ACTIVE'`) and the merge path must find *all* grants of the
loser customer including expired/revoked ones. Relying on the partial index
would silently skip inactive grants — a correctness gap.

### 3.7. Notification / Audit / Platform — G2, G18, G19

| IDX | Table | Keys | Predicate | S | Group |
|---|---|---|---|---|---|
| IDX-088 | outbox_events | (next_attempt_at **NULLS FIRST**, id) | `status='PENDING'` | R | G2 |
| IDX-090 | outbox_events | (dispatched_at, id) | `status='DISPATCHED'` | R | G2 |
| IDX-093 | idempotency_records | (expires_at, id) | — | R | G2 |
| IDX-094 | idempotency_records | (claimed_at, id) | `status='IN_PROGRESS'` | R | G2 |
| IDX-131 | background_job_attempts | (finished_at, id) | `is_dead_letter` | r | G2 |
| IDX-091 | notification_intents | (created_at, id) | `status IN ('PENDING','PROCESSING')` | R | G18 |
| IDX-092 | notification_delivery_attempts | (intent_id, attempted_at) | — | R | G18 |
| IDX-095 | audit_events | (target_kind, target_id, occurred_at **DESC**, id **DESC**) | — | R | G19 |
| IDX-096 | audit_events | (occurred_at **DESC**, id **DESC**) | — | R | G19 |
| IDX-097 | audit_events | (correlation_id) | — | r | G19 |
| IDX-098 | audit_events | (admin_id, occurred_at **DESC**, id **DESC**) | `admin_id IS NOT NULL` | r | G19 |

`outbox_events` gets exactly 3 indexes (PK + IDX-088 + IDX-090) — a deliberate
minimum on the highest-write table. `audit_events` carries 5, a recorded budget
exception; IDX-097/098 are the first removal candidates under ADR-DB5-004 R7.

**IDX-088's `NULLS FIRST` is load-bearing.** `next_attempt_at` is NULL for
never-deferred events; the default `NULLS LAST` on an ascending key would place
every fresh event at the far end of the index — the exact opposite of FIFO.
Verified expressible natively (DB6 spike §7).

---

## 4. Load-bearing details that fail silently if wrong

| Detail | Indexes | Failure mode if wrong |
|---|---|---|
| `NULLS FIRST` | IDX-088 | outbox drains in reverse order; no error |
| Explicit `DESC` | IDX-073, 076, 079, 081, 095, 096, 098, 108 | planner adds a sort node; no error |
| `IS NOT NULL` predicate | IDX-110, 078, 080, 098, 129, 130, 119 | index not matched; no error |
| Partial predicate text | all 45 partials (13 unique + 32 performance) | index silently unused |
| Never mixed directions | multi-column DESC | no index-order scan |

A partial index that is silently unused looks exactly like one that works.
Structural confirmation was obtained at DB6 (spike §11); **measured** `EXPLAIN`
confirmation on representative data is **DB9** (DB5-A12).

---

## 5. Not built (DB5-A11, DB5-A15)

### 5.1. Conditional — needs a trigger event

| ID | What | Why withheld | Activation |
|---|---|---|---|
| IDX-056 | agreement effective-window exclusion (CST-046) | needs `btree_gist`; publish-transaction guard is the primary defense | extension request + proof the extension exists in the pinned image + stated fallback (ADR-DB5-002 R7) |

`btree_gist` 1.7 **is available** in `postgres:16.14-alpine` but is **not
installed** (DB6 spike §6). Availability is not adoption.

### 5.2. Explicit no-index decisions — these are decisions, not omissions

| Query | Decision | Rationale | Activation threshold |
|---|---|---|---|
| **Q-20** low stock | **no index** (IDX-R01) | column-vs-column predicate; ≤ dozens of rows; would tax the hottest inventory write path | only on measured evidence that a full scan is unacceptable **and** a DB6+ deviation record |
| **Q-33** analytics/event-type | **no index** (IDX-R02) | P3 consumer that does not exist, on the highest-write table | same |
| **QX-08** merge queue | **no index** (IDX-R03) | a handful of rows for the product's lifetime | same |

DB6 does not add these. They are recorded as **standing decisions with owners**,
not as "not implemented yet" (DB5-A15).

### 5.3. Deferred measured tuning — no `IDX-*` ID exists

| Candidate | Owner | Evidence required |
|---|---|---|
| `INCLUDE` columns (IDX-073 +`code`; IDX-065 +`name`,`base_price_amount`) | DB9/DB10 | `EXPLAIN (ANALYZE, BUFFERS)` showing heap fetches dominating |
| `vi-x-icu` collated indexes | post-launch | a real Vietnamese sort/search requirement |
| `pg_trgm` fuzzy/full-text | post-launch | a catalogued substring query + extension request |
| BRIN on `audit_events` / `inventory_ledger_entries` | post-launch | hundreds of millions of rows |
| GIN on any of the 9 JSONB payloads | **never without ADR** | a catalogued query filtering inside a payload (IDX-R10) |

### 5.4. Rejected — recorded, never built

`IDX-R01` … `IDX-R15`, with rationale in `DB5_INDEX_CATALOG.md` §5. DB6 adds
**no** index outside this catalog: a new query requires a catalog entry first
(ADR-DB5-004 R11).

---

## 6. Implementation schedule

| Phase | Slice | Contents | Status |
|---|---|---|---|
| 1 | with each group G1–G19 | constraint-backed: 78 PK + 50 UNIQUE + 13 partial unique | **G1 done** |
| 2 | S25 | P0 performance | planned |
| 3 | S25 | P1 performance | planned |
| 4 | S25 | recommended | planned |
| 5 | — | conditional/future | **absent by design** |

Fresh install = plain in-migration builds (the database is empty, so
ADR-DB5-004 R9's `CONCURRENTLY` rule does not apply). Post-launch on a
populated table, an index change ships as `CREATE INDEX CONCURRENTLY` in its
own non-transactional migration step.

---

## 7. Current state

After G1..G8 (30 of 78 tables):

| Metric | Implemented | Selected for launch |
|---|---|---|
| PK backing indexes | 30 | 78 |
| UNIQUE constraint backing | 18 (IDX-001, 003, 010, 011, **013**, 014, 015, 016, 019, **021**, **027**, **048**, **049**, 058, 059, 060, 061, 062) | 50 |
| Explicit partial unique | 6 (IDX-002, 004, 005, **006**, 020, 064) | 13 |
| Explicit performance | 14 (IDX-065, 068, 069, 070, 071, 085, 086, 087, 099, **111**, **112**, 115, 133, 134) | 70 |
| **Physical indexes** | **68** | **211** |
| `IDX-*` entries satisfied | 38 | 133 of 134 |

G6 honoured the DB5 hot-table budgets: `sku_stocks` carries **PK + IDX-016
only** (the lock anchor — `EXPLAIN` shows `Index Scan using uq_sku_stocks__sku`
under `LockRows`) and `inventory_ledger_entries` carries **PK + IDX-115 only**
(append-heavy). Q-20 low-stock remains a no-index decision (IDX-R01).

**Policy from G3 onward (per review directive):** each group implements its
own **required** (P0/P1) performance indexes with the group — G3: IDX-134;
G4: IDX-086/087/099/133; G5: IDX-065/068/069/070/071. Recommended-tier
indexes still ship at S25 phase 4. G1/G2 predate the directive; their
required indexes remain in the S25 queue, tracked below rather than lost:

| Group | Pending | Tier |
|---|---|---|
| G1 | IDX-121 | required (S25 backlog) · IDX-120 recommended |
| G2 | IDX-088, IDX-090, IDX-093, IDX-094 | required (S25 backlog) · IDX-131 recommended |
| G3 | IDX-129 | recommended (S25 phase 4) |
| G4 | IDX-119, IDX-132 | recommended (S25 phase 4) |
| G5 | — none pending | all five selected entries were required and shipped |
| G6 | — none pending | IDX-016/115 shipped; no recommended tier exists |
| G7 | — none pending | IDX-085 shipped with the group; no recommended tier exists |
| G8 | IDX-130 | recommended (S25 phase 4) |

Verified in the database after G5: 48 index objects across 21 tables, zero
duplicates, zero non-conforming names (every constraint and index name carries
an approved `pk_`/`fk_`/`uq_`/`ck_`/`ix_` prefix), and no index outside this
manifest.
