# DB6 — Schema Implementation Manifest

**Date:** 2026-07-18 · **Slice:** DB6-C0 · **Checkpoint:** DB6
**Nature:** canonical map from DB4 logical IDs to physical objects. This is the
authority the fresh-install parity gate checks the database against.

**Status values:** `implemented` · `planned` (physical name/group/mechanism
locked, not yet built) · `deferred` (owner named) · `not-built` (explicit
decision).

> **Rule applied throughout:** an ID *range* is not an object *count*. DB4
> allocated ID ranges and then compacted them, leaving unassigned IDs. This
> manifest reports what is actually defined and lists what is unassigned,
> rather than inventing rows to reach a headline number. See §2.

---

## 1. Physical conventions (binding for all groups)

| Concern | Rule | Source |
|---|---|---|
| PostgreSQL schema | `public` only; `drizzle` holds migration history | ADR-DB1-005 |
| Table names | snake_case, plural, no module prefix | ADR-DB1-006 |
| PK name | `pk_<table>` | ADR-DB1-006 |
| FK name | `fk_<table>__<column>` | ADR-DB1-006 |
| Unique | `uq_<table>__<cols>[__<tag>]` | ADR-DB1-006 / DB5 naming |
| Check | `ck_<table>__<rule_slug>` | ADR-DB1-006 |
| Index | `ix_<table>__<cols>[__<tag>]` | DB5 naming |
| Trigger / function | `tg_<table>__<purpose>` / `fn_<purpose>` | ADR-DB1-006 |
| Key declaration | **table-level** `primaryKey({name})` / `foreignKey({name})` / `unique(name)` only | DEV-DB6-006 |
| Business PK | `uuid`, UUIDv7 app-generated | ADR-DB1-007 cat. 1 |
| Append-only PK | `bigint GENERATED ALWAYS AS IDENTITY` | ADR-DB1-007 cat. 2 |
| Timestamps | `timestamptz`, UTC; `updated_at` only on mutable tables | ADR-DB1-006 |
| Money | `numeric(14,2)` + row `currency_code` | ADR-DB4-001 |
| State | `text` + CHECK from the canonical tuple | ADR-DB1-008, DB5-A09 |
| On delete | `restrict` everywhere; `cascade-temp` only for temp children | DB4 REL legend |
| Schema source root | `packages/database/src/schema/<context>/<table>.ts` | DB6-S03 |

---

## 2. Baseline ID reconciliation (counts vs ranges)

| Artifact | Range claimed by DB4/DB5 | IDs actually defined | Unassigned IDs | Physical objects |
|---|---|---|---|---|
| Tables `TBL-*` | TBL-001..078 | **78** | none | 78 tables |
| Relationships `REL-*` | REL-001..105 | **92 rows** | **13** | **154 FK edges** (DEV-DB6-009/010) |
| Constraints `CST-*` | CST-001..125 | **94** (92 table rows + CST-001/060 blanket prose) | **31** | see §5 |
| Indexes `IDX-*` | IDX-001..138 | **134** | 4 (retired, documented by DB5) | see index manifest |
| Lifecycles | 29 lifecycles | **23 `LC-*` IDs** covering 29 state machines | none | 25 status columns |
| JSONB payloads | 9 | **9** | none | 9 `jsonb` columns |

### 2.1. Unassigned DB4 IDs — finding DB6-F01

These IDs appear in no DB4 document:

```text
REL-015 REL-016 REL-017 REL-018 REL-019
REL-034 REL-035 REL-036 REL-037 REL-038 REL-039
REL-059 REL-089

CST-052..059  CST-075..079  CST-081..089  CST-101..109
```

DB5 documented its four retired `IDX-*` IDs explicitly; DB4 did not document
its unassigned `REL-*`/`CST-*` IDs. The cause is visible in the surviving
rows: DB4 collapsed multi-target relationships into a single ID with a `×N`
multiplicity marker (`REL-033 ×2`, `REL-058 ×3`, `REL-063 ×5`, `REL-078 ×5`)
and left the neighbouring allocated IDs unused.

**This is a documentation gap, not a modelling gap.** No table, column, FK or
constraint is missing — every FK edge and constraint in the DB4 context
documents is accounted for below. Recorded as **DEV-DB6-007** so that "105
relationships" and "125 constraints" are never re-read as object counts by
DB7–DB10.

### 2.2. FK edge multiplicity

Four relationship metrics, kept separate and never interchanged:

| Metric | Value |
|---|---|
| Relationship ID range | REL-001..105 (105 slots) |
| Documented REL rows | **92** |
| Expanded logical FK/reference edges | **164** = 153 derived (DEV-DB6-009) + 1 documented addition (DEV-DB6-010: custom_request_assets → assets) + 4 documented additions (DEV-DB6-012: design_versions placement refs) + 4 documented additions (DEV-DB6-013: approval_snapshots placement refs, planned owner G13) + 2 documented additions (DEV-DB6-014: shipping_fee_acknowledgements grant/challenge, implemented G15) |
| Physical FK target | **160** (corrected G19, DEV-DB6-017 — see note below; not 162) |
| Implemented physical FK constraints | grows per group (parity gate counts these) |

92 `REL-*` rows expand to **153 FK edges**. The original 129 counted only
rows carrying an explicit `×N` marker; **DEV-DB6-009** found eight further
rows that list multiple targets *without* a marker (slash lists, `·`-joined
statements, parenthetical extra edges) and undercounted as 1 each. The
checker now derives edges from markers **plus** the curated
implied-multiplicity map below, re-verified against the DB4 source on every
run:

| Multiplicity source | Rows | Edges |
|---|---|---|
| ×1 (single target) | 58 | 58 |
| ×N marker: ×2 | 20 | 40 |
| ×N marker: ×3 | 3 | 9 |
| ×N marker: ×4 | 1 | 4 |
| ×N marker: ×5 | 2 | 10 |
| implied (DEV-DB6-009): REL-093 (2) | 1 | 2 |
| implied: REL-050, REL-057, REL-088, REL-102 (3 each) | 4 | 12 |
| implied: REL-040, REL-094 (4 each) | 2 | 8 |
| implied: REL-105 (10 — actor refs on TBL-042/045/063/072) | 1 | 10 |
| DEV-DB6-010 addition: custom_request_assets → assets (no REL row exists) | — | 1 |
| DEV-DB6-012 addition: design_versions placement refs — product/variant/side/area (no REL row exists) | — | 4 |
| DEV-DB6-013 addition: approval_snapshots placement refs — product/variant/side/area (no REL row exists; planned owner G13) | — | 4 |
| DEV-DB6-014 addition: shipping_fee_acknowledgements → secure_access_grants / contact_verification_challenges (no REL row exists; implemented G15) | — | 2 |
| **Total** | **92 rows** | **164** |

The 26 multi-target rows and their expansions:

| REL | ×N | Expansion (source → target per edge) |
|---|---|---|
| REL-012 | 2 | merge_cases → customers (survivor); → customers (loser) |
| REL-023 | 2 | product_sides → products; embroidery_areas → product_sides |
| REL-025 | 2 | product_media → products; → assets |
| REL-028 | 3 | ledger_entries → soft_holds; → reservations; → orders |
| REL-029 | 2 | soft_holds → sku_stocks; → custom_requests |
| REL-031 | 2 | reservations → sku_stocks; → orders |
| REL-032 | 2 | asset_inspections → assets; asset_derivatives → assets |
| REL-033 | 2 | assets → customers (uploaded_by); → design_sessions (uploaded_via) |
| REL-042 | 2 | design_session_assets → design_sessions; → assets |
| REL-048 | 2 | design_version_assets → design_versions; → assets |
| REL-052 | 3 | approval_snapshots → design_cases; → custom_requests; → customers |
| REL-053 | 2 | approval_snapshots → grants; → challenges |
| REL-055 | 2 | acceptances → approval_snapshots; → agreement_versions |
| REL-058 | 3 | design_templates → products; → sides; → areas |
| REL-061 | 2 | custom_requests → products; → variants |
| REL-062 | 2 | custom_requests → design_cases; → quotations (current pointers) |
| REL-063 | 5 | COP / breakdowns / request_assets / moderation_notes / request_transitions → custom_requests |
| REL-066 | 2 | quotation_versions → quotations; line_items → versions |
| REL-070 | 4 | quotation_acceptances → versions; → customers; → grants; → challenges |
| REL-076 | 2 | order_items → skus; → customer_owned_products |
| REL-078 | 5 | order_transitions / cancellations / shipping_details / shipping_snapshots / fee_acks → orders |
| REL-080 | 2 | cancellation_requests → grants; → challenges |
| REL-083 | 2 | obligations → obligations (superseded_by); → attempts (satisfied_by) |
| REL-085 | 2 | payment_attempts → grants; → challenges |
| REL-087 | 2 | reconciliations → attempts; → obligations |
| REL-095 | 2 | gallery_entry_assets → gallery_entries; → assets |

No edge is invented for a missing ID; the 13 unassigned IDs stay unassigned.
The parity gate counts **FK edges**, not `REL-*` rows. Two edges are logical
only, with **no physical FK by design**: REL-104 (outbox polymorphic
aggregate reference) and REL-103 (audit polymorphic target) — counted in the
164 logical edges, excluded from the physical target.

**DEV-DB6-017 (2026-07-19, G19 final reconciliation):** the physical target
was declared **162** at DB6-C4 (`164 − 2`) and repeated unchanged through
G12–G18; summing every group's own already-committed physical-FK delta
(G11 ends 78; +5/+13/+11/+26/+13/+10/+1/+3 across G12–G19) and live-catalog
verification on disposable databases both independently land on **160**,
not 162, once every documented edge (including REL-105's now-complete
10/10) is physical. No missing edge exists anywhere in the deferred-FK
ledger (§2.2.1, fully closed) or the DB6-C4 Class-A/B/C findings — the
ceiling itself was miscomputed once and carried forward unverified. The
target is corrected to **160** (see full evidence trail in
`DB6_DEVIATION_REGISTER.md` DEV-DB6-017); **164 logical edges is
unchanged** and remains checker-enforced. Evidence columns
with **no REL row at all** (ledger actor refs on TBL-019,
`design_sessions.submitted_request_id`, and — per DEV-DB6-015 — the bare
`admin_id`-shaped columns on TBL-046/057/058/062, same class as TBL-041/009)
carry no FK and are outside both counts. Also updated in §2 header table:
`REL-001..105 → 92 rows → 164 edges`.

**DB6-C4 addendum (2026-07-19):** DEV-DB6-013 and DEV-DB6-014 were found by
DB6-C4's pre-G12 relationship-coverage audit, targeting tables not yet
implemented at the time (`approval_snapshots`/G13, `shipping_fee_acknowledgements`/G15).
Both are now closed — implemented in G13 and G15 respectively (migrations
`0020` and `0023`). DEV-DB6-015 formalizes (not extends) the
existing bare-admin-actor no-FK precedent from TBL-041/TBL-009 onto four
more forward columns; it changes no denominator.

### 2.2.1. Deferred FK edge ledger (canonical, checker-enforced — DEV-DB6-011)

Every FK edge whose target table does not exist yet at the edge's source
group gets exactly one row here. `resolution_owner_group` MUST equal
`target_table_creation_group` (no exception exists in DB6). The checker
fails if an edge has zero or two owners, if a deferred column exists with no
row here, if the row's target-table group disagrees with §3, or if an edge
is marked `implemented` before its target table's creation group has run.

| Edge | REL | Source table (group) | Source column | Target table (group) | Resolution owner | Delete behavior | Status |
|---|---|---|---|---|---|---|---|
| ledger → soft_holds | REL-028 | `inventory_ledger_entries` (G6) | `soft_hold_id` | `inventory_soft_holds` (G10) | **G10** | restrict | implemented (G10) |
| ledger → reservations | REL-028 | `inventory_ledger_entries` (G6) | `reservation_id` | `inventory_reservations` (G15) | **G15** | restrict | implemented (G15) |
| ledger → orders | REL-028 | `inventory_ledger_entries` (G6) | `order_id` | `orders` (G15) | **G15** | restrict | implemented (G15) |
| soft_holds → reservations (converted) | REL-030 | `inventory_soft_holds` (G10) | `converted_reservation_id` | `inventory_reservations` (G15) | **G15** | restrict | implemented (G15) |
| request_transitions → grants | REL-105 (TBL-042 subset) | `custom_request_transitions` (G9) | `grant_id` | `secure_access_grants` (G10) | **G10** | restrict | implemented (G10) |
| design_cases → quotations (current) | REL-062 e2 | `custom_requests` (G9) | `current_quotation_id` | `quotations` (G14) | **G14** | restrict | implemented (G14) |
| design_cases → design_versions (current) | REL-044 | `design_cases` (G9) | `current_version_id` | `design_versions` (G11) | **G11** | restrict | implemented (G11) |

**Root cause this ledger closes (DEV-DB6-011):** before this table existed,
`reservation_id`'s owner was recorded only in prose (`DB6_G06_GROUP_REPORT.md`
§B and this manifest's G6 traceability note), and the prose named the wrong
owner group (G10 instead of G15). The structured ledger is the single source
of truth from this point forward; prose summaries elsewhere must agree with
it, and the checker parses this table directly rather than free text.

### 2.3. Constraint metric model

Five constraint metrics, kept separate:

| Metric | Value |
|---|---|
| Constraint ID range | CST-001..125 (125 slots) |
| Documented CST IDs | **94** (92 table rows + 2 blanket prose: CST-001, CST-080) |
| Expanded logical constraint instances | **265** (see expansion table; CST-080 excluded — column-level NN, sized per dictionary) |
| TX/App-only rules (no physical object) | **15** (CST-110..123 range, 15 rows) |
| Implemented physical constraint objects | grows per group (parity gate counts these) |

`125` is never a physical constraint count. The 15 multi-target rows and the
two blankets expand as follows; every other row is 1 instance:

| CST | Instances | Basis |
|---|---|---|
| CST-001 | 78 | PK on every table |
| CST-011 | 4 | slug uniques (categories, products, gallery_entries, design_templates → IDX-010..013) |
| CST-035 | 2 | quotations: request_id + code (IDX-037/038) |
| CST-043 | 6 | asset-association uniques (IDX-046..051) |
| CST-044 | 3 | content_pages / redirect_rules / agreements (IDX-052..054) |
| CST-050 | 2 | config key + (config, version) (IDX-060/061) |
| CST-051 | 2 | business_profiles + thread_colors (IDX-062/063) |
| CST-060 | 25 | one CHECK per status column |
| CST-062 | 7 | quantity/attempt positivity across 7 tables |
| CST-063 | 14 | one per `_amount` column (dictionary scan) |
| CST-064 | 4 | quotation arithmetic: deposit+remaining=total; total composition; percent 0–100; validity window |
| CST-066 | 7 | dimension positivity across 7 tables |
| CST-069 | 2 | customers self-merge + merge_cases survivor≠loser |
| CST-070 | 13 | one per hash column (dictionary scan) |
| CST-074 | 2 | design_versions hash-at-sent + agreement_versions hash-at-published |
| CST-098 | 17 | append-only trigger per listed table |

Arithmetic: 77 single-instance rows + 110 multi-row instances + 78 (CST-001)
= **265**. Of these, 15 are TX/App-only and 1 (CST-046) is the conditional
exclusion — neither produces a physical object at launch. Trigger-enforced
categories (IMM 9 rows, APP 2 rows → 18 table targets, TRG 1) become physical
trigger objects in slice S24; their exact object count is recorded there.

---

## 3. Table manifest (78 tables)

78 TBL rows, each assigned to exactly one implementation group G1–G19. The
checker verifies: 78 unique TBL IDs, no orphan table, no table in two groups,
and group totals summing to 78.

Columns: TBL → physical table · context · implementation group · schema source
file · PK strategy · mutability class · status.

Schema files live under `packages/database/src/schema/<context>/`.

### G1 — Identity (CTX-IDN) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-001 | `admin_accounts` | `identity/admin-accounts.ts` | uuid7 | mutable | **implemented** |
| TBL-002 | `admin_credentials` | `identity/admin-credentials.ts` | uuid7 | mutable | **implemented** |
| TBL-003 | `admin_sessions` | `identity/admin-sessions.ts` | uuid7 | mutable | **implemented** |

### G2 — Platform base (CTX-PLT) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-076 | `policy_configurations` | `platform/policy-configurations.ts` | uuid7 | header | **implemented** |
| TBL-077 | `policy_configuration_versions` | `platform/policy-configuration-versions.ts` | uuid7 | immutable | **implemented** |
| TBL-074 | `idempotency_records` | `platform/idempotency-records.ts` | bigint | mutable (state) | **implemented** |
| TBL-073 | `outbox_events` | `platform/outbox-events.ts` | bigint | column-scoped | **implemented** |
| TBL-075 | `background_job_attempts` | `platform/background-job-attempts.ts` | bigint | append | **implemented** |

### G3 — Customer (CTX-CUS) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-004 | `customers` | `customer/customers.ts` | uuid7 | mutable | **implemented** |
| TBL-078 | `business_profiles` | `customer/business-profiles.ts` | uuid7 | mutable | **implemented** |
| TBL-005 | `customer_contact_points` | `customer/customer-contact-points.ts` | uuid7 | mutable | **implemented** |

G3 traceability: COL-TBL004-01..05, COL-TBL078-01..04, COL-TBL005-01..09 (18
COL IDs → 27 physical columns incl. conventions). REL-004/005/014 → 3 FK
edges. CST-005/006 (partial uniques, IDX-004/005), CST-051 first instance
(IDX-062), CST-069 first instance (`ck_customers__no_self_merge`),
COL-TBL005-02 `(CK)` (`ck_customer_contact_points__contact_kind_allowed`).
IDX-134 (P0) implemented with the group; IDX-129 (recommended) ships at S25
phase 4. No status column exists in G3 — contact-link state is carried by
`verified_at`/`deactivated_at`, which is exactly what the CST-005 predicate
reads. PII columns (`display_name`, `notes`, `normalized_value`,
`display_value`, `company_name`, `tax_code`, `billing_contact`) are
anonymize-class with `anonymized_at` markers; **application layers must not
forward PostgreSQL constraint DETAIL text to logs or clients**, since unique
violations on contact values echo the value.

### G4 — Asset (CTX-AST) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-022 | `assets` | `asset/assets.ts` | uuid7 | mutable | **implemented** |
| TBL-023 | `asset_inspections` | `asset/asset-inspections.ts` | bigint | append | **implemented** |
| TBL-024 | `asset_derivatives` | `asset/asset-derivatives.ts` | uuid7 | mutable | **implemented** |

G4 traceability: COL-TBL022-01..12, COL-TBL023-01..04, COL-TBL024-01..06 —
**22 logical COL IDs + 8 convention columns (3 id, 3 created_at, 2
updated_at — none on the append-only inspections) = 30 physical columns**
(15/6/9). REL-032 ×2 → 2 FK edges implemented; REL-033 ×2 → **1 of 2 edges
implemented** (→ customers); the → design_sessions edge is a **deferred FK,
owner G7** — the nullable column `uploaded_via_session_id` exists now, the
constraint is added when the target table exists (DB4_DB6_HANDOFF §1
nullable-ref pattern; same mechanism as the G2 REL-102 pointer, not a
missing-FK defect). Constraints: CST-017 (IDX-019), CST-018 (IDX-020),
CST-017-family (IDX-064), CST-060 ×3 (asset status, derivative status,
inspection outcome), CST-070 ×2 (both checksum columns,
`^sha256:[0-9a-f]{64}$`), plus two dictionary-note checks traced to their
COL IDs: `ck_assets__size_bytes_positive` (COL-TBL022-05 "CK > 0") and
`ck_asset_derivatives__ready_has_storage_key` (COL-TBL024-04 "set at
READY"). Kind/classification closed sets are dictionary `(CK)` columns.
**No binary, base64, bytea or URL-authority column exists** — `storage_key`
is the internal object reference (INV-10), classification drives signed
access (INV-09, CON-044). Required indexes IDX-086/087/099/133 ship with the
group; IDX-119/132 (recommended) → S25. CST-098 append-only trigger for
inspections lands at S24.

### G5 — Catalog (CTX-CAT) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-011 | `categories` | `catalog/categories.ts` | uuid7 | mutable | **implemented** |
| TBL-012 | `products` | `catalog/products.ts` | uuid7 | mutable | **implemented** |
| TBL-013 | `product_variants` | `catalog/product-variants.ts` | uuid7 | mutable | **implemented** |
| TBL-014 | `skus` | `catalog/skus.ts` | uuid7 | mutable | **implemented** |
| TBL-015 | `product_sides` | `catalog/product-sides.ts` | uuid7 | mutable | **implemented** |
| TBL-016 | `embroidery_areas` | `catalog/embroidery-areas.ts` | uuid7 | mutable | **implemented** |
| TBL-017 | `product_media` | `catalog/product-media.ts` | uuid7 | mutable | **implemented** |

G5 traceability: **52 logical COL IDs** (TBL011: 9, TBL012: 13, TBL013: 5,
TBL014: 5, TBL015: 9, TBL016: 7 with ×2 on -03/-04, TBL017: 4) → 54 business
columns + **21 convention columns** (7 id, 7 created_at, 7 updated_at — all
mutable roots/children) = **75 physical columns** (12/16/8/8/12/12/7).
REL-020/021/022/023(×2)/024/025(×2) → **8 FK edges, all implemented** —
including both cross-context asset edges (REL-024 background, REL-025 media),
possible because G4 precedes G5. CST: CST-011 instances 2/4 (IDX-010/011),
CST-012 (IDX-014), CST-013 (IDX-015), CST-060 ×2 (publication set
DRAFT/PUBLISHED/ARCHIVED per DB3 handoff §1), CST-063 ×2 + CST-068 ×2 +
DEV-DB6-005 ×2 (both money columns), CST-066 ×5 (image px, physical mm,
px_per_mm, area bounds, max mm when set), role closed set (COL-TBL017-03).
**First money group:** `products.base_price_amount` (display price, INV-12 —
history copies by value) and `skus.price_override_amount` (nullable),
both `numeric(14,2)` + `currency_code` CK `'VND'` closed set + VND
integer-scale CHECK. Dimensions are bare `numeric` exactly as DB4's
measurement model locks them — no invented precision. **No stock column
exists in Catalog** (`is_display_out_of_stock` is DB4's manual override
COL-TBL012-09, not derived availability). Categories are **flat** — DB4 has
no parent column, so no tree machinery exists. Required indexes
IDX-065/068/069/070/071 ship with the group; slug uniqueness is global
(technical identity), deliberately not published-scoped.

### G6 — Inventory core (CTX-INV) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-018 | `sku_stocks` | `inventory/sku-stocks.ts` | uuid7 | mutable (lock anchor) | **implemented** |
| TBL-019 | `inventory_ledger_entries` | `inventory/inventory-ledger-entries.ts` | bigint | append | **implemented** |

G6 traceability: COL-TBL018-01..03, COL-TBL019-01..09 (-09 ×3) — **12 logical
COL IDs → 14 business columns + 5 convention columns (2 id, 2 created_at, 1
updated_at — none on the append-only ledger) = 19 physical columns** (6/13).
REL-026 + REL-027 → **2 FK edges implemented**; REL-028 ×3 (ledger →
soft_holds / reservations / orders) — **all three deferred**: nullable columns
exist now. **DEV-DB6-011 corrected owner mapping — G10 resolves
`soft_hold_id` only; G15 resolves `reservation_id` and `order_id`**
(`inventory_reservations`/TBL-021 and `orders` are both G15-created tables;
see §3 G10/G15 group tables and DEV-DB6-011). Constraints: CST-014
(IDX-016 — the Q-32 **lock anchor**, verified `Index Scan using
uq_sku_stocks__sku` under `LockRows`), CST-061 (INV-18 non-negative stock,
enforced on INSERT and UPDATE), CST-062 (ledger quantity > 0), CST-071
(ADJUSTMENT → reason NOT NULL, GRD-023), entry-kind closed set (9 values,
dictionary `(CK)`), threshold ≥ 0 (dictionary CK). `actor_kind` carries **no**
CHECK — DB4 marks no `(CK)` on it, so the value set stays app-owned; actor
refs (`admin_id`, `system_job_key`) are evidence without REL rows, hence
**no FK by design**. Balance semantics: `quantity_on_hand` is the
authoritative operational counter mutated only inside a row-locked tx that
appends a ledger entry; the ledger is the rebuild source
(Σ `on_hand_delta`); `available` is computed, never stored (DB4 §3). **No
`available`/`reserved`/`is_low_stock` column, no `lock_version`** — DB4
assigns concurrency to the row lock. Index budget honoured: sku_stocks PK +
IDX-016 only; ledger PK + IDX-115 only. Q-20 low-stock stays a no-index
decision. CST-098 append-only trigger for the ledger is an **S24 target** —
until it lands, append-only is an app/privilege expectation (smoke case 16
documents that an UPDATE currently succeeds) and DB7's reject-mutation test
stays open. Atomicity handoff (DB8/app checkpoint): lock stock row →
validate → update counter → append ledger → outbox if required → commit;
no trigger performs this orchestration.

### G7 — Design pre-request (CTX-DSN) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-034 | `design_templates` | `design/design-templates.ts` | uuid7 | header | **implemented** |
| TBL-035 | `design_template_versions` | `design/design-template-versions.ts` | uuid7 | immutable-once-published | **implemented** |
| TBL-036 | `design_template_assets` | `design/design-template-assets.ts` | uuid7 | mutable | **implemented** |
| TBL-025 | `design_sessions` | `design/design-sessions.ts` | uuid7 | temp | **implemented** |
| TBL-026 | `design_session_assets` | `design/design-session-assets.ts` | uuid7 | mutable | **implemented** |

G7 traceability: **27 logical COL IDs + 6 ×N expansions (TBL034-04 ×3,
TBL025-02 ×4, TBL025-06 ×2) = 33 business + 14 convention = 47 physical**
(13/7/5/17/5; no `updated_at` on the `ver`-category version table). REL
edges implemented: REL-056 (1), REL-057 ×3, REL-058 ×3, REL-040 ×4, REL-041
(1), REL-042 ×2 = **14 schema FKs**, plus the **deferred REL-033 edge
resolved**: `fk_assets__uploaded_via_session_id` via custom migration `0010`
with **ON DELETE SET NULL** — the parent is hard-TTL-deleted, so provenance
must clear (the customers edge stayed `restrict` in G4 because customers are
never hard-deleted; the two REL-033 edges legitimately differ per the
`set-null-cand` legend). REL-042's session edge is the schema's one
sanctioned **cascade-temp** (`ON DELETE CASCADE`): association rows die with
their hard-deleted temp session; the asset edge stays restrict. REL-058
targets are archive-only → restrict, clearing stays an app operation.
Constraints: CST-011 instance 3/4 (IDX-013), CST-019 (IDX-021), CST-025
(IDX-027), CST-043 ×2 (IDX-048/049), CST-060 ×2 (template publication set;
session LC-07 ACTIVE/SUBMITTED/EXPIRED/DELETED), autosave_revision ≥ 0
(COL-TBL025-05 floor; monotonic protocol is app/DB8). JSONB payloads **#1**
(`design_sessions.design_document`) and **#3**
(`design_template_versions.design_document`) implemented — 5 of 9 boundaries
now live; **neither carries a hash column** (working docs are not hashed;
canonical hashing starts at the formal design version, G11 — none invented).
Evidence columns without REL rows carry no FK: `submitted_request_id`
(handover evidence) and `template_version` (integer provenance stamp, no
live link per REL-041/GRD-028). IDX-085 ships with the group as the
session table's **only** non-unique index (highest-write table, CC-01
autosave). S24 trigger target: TBL-035 immutable-once-published, scoped
`WHEN (published_at IS NOT NULL)`. 2D-only honoured — no 3D/mesh/camera
field exists.

### G8 — Verification (CTX-CUS) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-006 | `contact_verification_challenges` | `customer/contact-verification-challenges.ts` | uuid7 | temp | **implemented** |
| TBL-007 | `contact_verification_attempts` | `customer/contact-verification-attempts.ts` | bigint | append | **implemented** |

G8 traceability: COL-TBL006-01..09 + COL-TBL007-01..03 — **12 logical IDs +
0 expansions = 12 business + 5 convention (no `updated_at` on the append
table) = 17 physical** (12/5). REL edges: REL-006 (→ contact_points,
**nullable — verification precedes customer creation**, ADR-DB2-001; restrict
because contact points are anonymize-class), REL-007 (→ design_sessions,
**SET NULL** — hard-TTL parent, same `set-null-cand` reasoning as the
REL-033 session edge), REL-008 (attempts → challenges, **cascade-temp** —
the transient family is hard-TTL-deleted together) = **3 physical FKs**.
Constraints: CST-007 (IDX-006 — the CC-17 single-open-challenge arbiter on
(kind, normalized_value, purpose) WHERE ISSUED), CST-060 (LC-02
ISSUED/VERIFIED/FAILED/EXPIRED/CANCELLED), purpose closed set
(SUBMISSION/STEP_UP), contact-kind closed set, attempt outcome closed set
(MATCH/MISMATCH/EXPIRED_AT_ENTRY). **Security shape:** `code_hash` is the
only secret representation — opaque one-way value with **no format CHECK
(CST-070 does not cover it), no algorithm/salt/version columns (DB4 defines
none), no index and no hash-lookup path** (low-entropy guardrail: lookup is
by id or target+purpose); no plaintext code/OTP/password column exists
(scanned = 0); hashing/KDF and constant-time compare are app-security-owned.
Rate limiting is **derived** from attempt rows over IDX-111 (GRD-026) — no
stored counter, lockout state or next-attempt column, none invented; no
IP/device metadata. Expiry does not self-remove rows from the CST-007
partial index: the issue tx marks stale rows EXPIRED then inserts, handling
23505 (verified in smoke). Indexes: IDX-006 (explicit pUQ), IDX-112 (P0
expiry sweep), IDX-111 (P0, the append table's only non-PK index); IDX-130
(recommended) → S25. S24 target: CST-098 append-only trigger on attempts.
DB8 targets: duplicate-issue race, verify-vs-expire, double-consume (smoke
shows first conditional transition UPDATE 1, second UPDATE 0).

### G9 — Request (CTX-ORD / CTX-DSN) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-037 | `custom_requests` | `ordering/custom-requests.ts` | uuid7 | mutable | **implemented** |
| TBL-038 | `customer_owned_products` | `ordering/customer-owned-products.ts` | uuid7 | mutable | **implemented** |
| TBL-039 | `custom_request_quantity_breakdowns` | `ordering/custom-request-quantity-breakdowns.ts` | uuid7 | mutable-until-quoted | **implemented** |
| TBL-040 | `custom_request_assets` | `ordering/custom-request-assets.ts` | uuid7 | mutable | **implemented** |
| TBL-041 | `request_moderation_notes` | `ordering/request-moderation-notes.ts` | bigint | append | **implemented** |
| TBL-042 | `custom_request_transitions` | `ordering/custom-request-transitions.ts` | bigint | append | **implemented** |
| TBL-027 | `design_cases` | `design/design-cases.ts` | uuid7 | header | **implemented** |

G9 traceability: **33 logical COL IDs + 7 ×N expansions (TBL037-04 ×2,
TBL038-04 ×2, TBL042-02 ×2, TBL042-03 ×5) = 40 business + 19 convention =
59 physical** (14/8/7/6/6/13/5; no `updated_at` on the two append tables).
FK edges implemented: REL-060 (1), REL-061 ×2, REL-062 first edge
(**custom SQL `0013`** — header↔child cycle, restrict, nullable pointer),
REL-063 ×5, REL-064 (1), REL-043 (1), REL-105 TBL-042 subset (admin_id,
customer_id — 2), plus the **DEV-DB6-010 edge** `custom_request_assets →
assets` (mandated by ADR-DB4-003/CST-043 but absent from the REL model —
every other asset-association table has an explicit ×2 row; TBL-040's asset
edge was dropped when REL-063 bundled five children) = **14 physical FKs**.
Deferred edges with owners: REL-062 second edge (`current_quotation_id`) →
**G14**; REL-044 (`design_cases.current_version_id`) → **G11**; REL-105
`grant_id` → **G10** (nullable columns exist now). Evidence columns with
**no REL row and no FK**: `submitted_session_id` (mirror of the G7
decision) and `request_moderation_notes.admin_id` (dictionary arrow only —
DB4 FKs actor refs solely where REL-105 lists them, and TBL-041 is not
listed; consistent with the accepted TBL-019 treatment; smoke demonstrates
the gap honestly). Constraints: CST-026 (IDX-028), CST-027 (IDX-029 —
**INV-13: COP has no sku/stock/price column, scanned = 0**), CST-028
(IDX-030), CST-043 instance (IDX-051), CST-020 (IDX-022), CST-060 (LC-11,
10 states incl. QUOTE_ACCEPTED — no ORDERED/PAID alias), LC-11 CHECKs on
both transition columns from the same exported tuple, CST-062 (quantity >
0), CST-066 (COP dims > 0 when set), role + kind closed sets. The
store-vs-COP subject XOR (CST-121) is **cross-table** → TX/App as DB4
assigns; breakdowns are mutable-until-QUOTED (app-guarded, cross-row).
Design case is a **header**: no status column (state derives from G11
versions), CST-020 1–1, created in the submission/design TX — never by
trigger. Indexes with the group: IDX-073 (status + created DESC/id DESC),
IDX-100 (timeline); IDX-117/137 (recommended) → S25. S24 targets: CST-098
on TBL-041 and TBL-042. Submission-tx handoff: consume verification →
resolve/create customer + contact → request + children + design case →
outbox → commit; idempotency via CST-048 (`request.submit`, CC-18); DB8
owns duplicate-submission and pointer races.

### G10 — Grants, holds, merge (CTX-CUS / CTX-INV) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-008 | `secure_access_grants` | `customer/secure-access-grants.ts` | uuid7 | mutable | implemented |
| TBL-020 | `inventory_soft_holds` | `inventory/inventory-soft-holds.ts` | uuid7 | mutable | implemented |
| TBL-009 | `customer_merge_cases` | `customer/customer-merge-cases.ts` | uuid7 | mutable | implemented |
| TBL-010 | `customer_merge_events` | `customer/customer-merge-events.ts` | bigint | append | implemented |

G10 traceability: COL-TBL008-01..09, COL-TBL020-01..07, COL-TBL009-01..06,
COL-TBL010-01..05 — **27 logical COL IDs → 27 business columns + 11
convention columns (4 id, 4 created_at, 3 updated_at — none on the
append-only `customer_merge_events`) = 38 physical columns** (12/10/9/7).
REL-009 + REL-010 + REL-011 (grants, incl. self-referencing reissue chain)
+ REL-012 ×2 (merge_cases → customers) + REL-013 (merge_events →
merge_cases) + REL-029 ×2 (soft_holds → sku_stocks / custom_requests) →
**8 native FK edges implemented**, plus the two owner-G10 deferred
resolutions (**+2**: `inventory_ledger_entries.soft_hold_id`,
`custom_request_transitions.grant_id`) = **10 physical FKs added in
G10**. REL-030 (`inventory_soft_holds.converted_reservation_id` →
`inventory_reservations`) remains **deferred, owner G15** per
DEV-DB6-011 §2.2.1 — the nullable column exists now, no FK, no
Reservation table. `customer_merge_cases.requested_by_admin_id` carries
**no REL row and no FK** (REL-105's actor-evidence enumeration lists only
TBL-042/045/063/072, not TBL-009 — same evidence class already accepted
for `inventory_ledger_entries.admin_id` and
`request_moderation_notes.admin_id`). Constraints: CST-008 (IDX-007, UQ
token_hash), CST-009 (IDX-008, LC-03 pUQ single active grant), CST-010
(IDX-009, pUQ one open merge/pair), CST-015 (IDX-017, LC-17 pUQ one held
hold/pair), CST-069 second instance (`ck_customer_merge_cases__no_self_merge`
— the first instance guards `customers.merged_into_customer_id`, G3),
scope_kind closed set (single value `REQUEST_ACCESS`), step_kind closed
set (4 values), quantity > 0, revoke/release-reason-required conditionals.
CST-116 (grant active/scope/step-up check) and CST-111 (official
reservation gate) are **TX/App-only** — no CHECK can arbitrate a
wall-clock or cross-context race. Indexes shipped with the group:
IDX-007/008/009/017 (constraint-created) + IDX-105/106/107 (grants,
P0/P1) + IDX-109/113 (holds, P0/P1); IDX-127/135 (recommended) → S25. No
Secure Grant plaintext token, no Customer-account field, no auto-merge
trigger, no stored available/reserved/low-stock quantity, and no
`inventory_reservations` table, lifecycle constant, constraint or index
of any kind.

### G11 — Design formal (CTX-DSN) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-028 | `design_versions` | `design/design-versions.ts` | uuid7 | immutable-once-sent | implemented |
| TBL-029 | `design_version_assets` | `design/design-version-assets.ts` | uuid7 | immutable w/ version | implemented |
| TBL-030 | `design_reviews` | `design/design-reviews.ts` | bigint | append | implemented |

G11 traceability: COL-TBL028-01..13 (-10 ×4, -11 ×2, -12 ×4),
COL-TBL029-01..02, COL-TBL030-01..05 (-04 ×3) — **20 logical COL IDs → 29
business columns (9 expansions) + 6 convention columns (2 each: id +
created_at, no `updated_at` — the manifest's mutability class for
`design_versions` is "immutable-once-sent" and for `design_version_assets`
"immutable w/ version", both matched by the convention checker's
`NO_UPDATED_AT` rule; `design_reviews` is append-only) = 35 physical
columns** (22/4/9). REL-045 + REL-046
(self-ref parent chain) + REL-047 (→ asset_derivatives preview) + REL-048
×2 (version_assets → versions/assets) + REL-049 + REL-050 ×3 (reviews →
customers/grants/challenges) → **9 native FK edges implemented**, plus
the **DEV-DB6-012 addition** (+4: `design_versions.product_id` /
`product_variant_id` / `product_side_id` / `embroidery_area_id` — no REL
row exists, same class of gap as DEV-DB6-010) and the **REL-044
resolution** (+1: `design_cases.current_version_id`, by custom SQL
`0016_add_design_case_current_version_fk.sql` — header↔child cycle, same
mechanism as REL-062/0013 and REL-102/0004) = **14 physical FKs added in
G11**. No further deferred edges are owed to G11; `design_cases →
quotations (current)` (REL-062 e2) remains deferred, owner **G14**, per
§2.2.1. Constraints: CST-021 (IDX-023, UQ case+version), CST-022 (IDX-024,
LC-08 pUQ single active review — INV-16 arbiter, not an optimisation),
CST-043 instance (IDX-047, UQ version_assets), CST-066 instance (physical
dims > 0, always-NOT-NULL unlike COP's "when set" variant), CST-070 ×2
(document_hash/preview_hash format), CST-074 instance (document_hash
required once status ≠ DRAFT — GRD-007), status closed set (LC-08, 6
values), outcome closed set (LC-09, 2 values), void-reason-required
conditional. **CST-090** (design_versions reject-mutation once sent) and
**CST-098** (design_reviews append-only) are **S24 trigger targets, not
yet database mechanisms** — honestly not claimed early (same documented
gap as every other append/immutable table implemented so far).
Indexes shipped with the group: IDX-023/024/047 (constraint-created);
IDX-116 (recommended) → S25. No Quotation/Order/Payment/Inventory field,
no 3D field, no generic polymorphic asset link, no auto-approve/auto-advance
trigger, no plaintext secret.

### G12 — Content, gallery, agreement (CTX-CNT / CTX-GAL) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-066 | `content_pages` | `content/content-pages.ts` | uuid7 | mutable | **implemented** |
| TBL-067 | `redirect_rules` | `content/redirect-rules.ts` | uuid7 | mutable | **implemented** |
| TBL-068 | `agreements` | `content/agreements.ts` | uuid7 | header | **implemented** |
| TBL-069 | `agreement_versions` | `content/agreement-versions.ts` | uuid7 | immutable-once-published | **implemented** |
| TBL-064 | `gallery_entries` | `gallery/gallery-entries.ts` | uuid7 | mutable | **implemented** |
| TBL-065 | `gallery_entry_assets` | `gallery/gallery-entry-assets.ts` | uuid7 | mutable | **implemented** |

Columns: COL-TBL064-01..10, COL-TBL065-01..03, COL-TBL066-01..09,
COL-TBL067-01..04, COL-TBL068-01..03, COL-TBL069-01..09 (-08 ×3) ·
Constraints: CST-001 ×6, CST-011 instance (`uq_gallery_entries__slug`,
IDX-012), CST-043 instance (`uq_gallery_entry_assets__entry_asset`,
IDX-050), CST-044 instances (`uq_content_pages__page_type_slug`/IDX-052,
`uq_redirect_rules__source_path`/IDX-053, `uq_agreements__agreement_type`/
IDX-054), CST-045 (`uq_agreement_versions__agreement_version`, IDX-055),
CST-060 ×4 (status/page_type CHECKs), CST-070 instance (content_hash
format), CST-096 (**S24 trigger candidate, not yet a database mechanism**
— same treatment as CST-090/`design_versions`)
Relationships: REL-096 (gallery_entries → products, nullable set-null-cand,
no index per DB5 catalog rejection entry R15), REL-095 ×2
(gallery_entry_assets → gallery_entries/assets), REL-097
(agreement_versions → agreements, restrict), REL-098 (agreements
.current_version_id → agreement_versions — implemented in this group by
custom SQL, migration `0019_add_agreement_current_version_fk.sql`, same
header↔child cycle class as REL-044/0016: declaring it in `agreements.ts`
would need a circular module import)
Indexes shipped with the group: IDX-012/050/052/053/054/055
(constraint-created); IDX-066/067/108 (explicit partial, P0). **CST-046**
(one-effective-agreement exclusion) remains the documented
**conditional, not-built** candidate (DB5's own deferral) — not fabricated
here. No Quotation/Order/Payment/Inventory field, no 3D field, no generic
polymorphic asset link beyond the reviewed association tables, no
auto-approve/auto-advance trigger, no plaintext secret.

**Same-agreement current-pointer integrity (DB6-C4 pattern applied):**
existence enforcement is physical (`fk_agreements__current_version_id`);
same-agreement ownership of the pointed-to version is **TX/App**, per
REL-098's own "TX consistency" classification in
`DB4_RELATIONSHIP_AND_FK_MODEL.md` — the same tier as REL-044
(`design_cases.current_version_id`, DB6-C4). No trigger or composite FK
invented; the publish transaction (GRD-008 direction) owns it.

### G13 — Approval (CTX-DSN) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-031 | `approval_snapshots` | `design/approval-snapshots.ts` | uuid7 | immutable | **implemented** |
| TBL-032 | `approval_snapshot_thread_colors` | `design/approval-snapshot-thread-colors.ts` | bigint | immutable | **implemented** |
| TBL-033 | `approval_snapshot_agreement_acceptances` | `design/approval-snapshot-agreement-acceptances.ts` | bigint | immutable | **implemented** |

Columns: COL-TBL031-01..11 (-02 ×3, -05 ×4, -06 ×4, -07 ×2, -09 ×3, -10 ×2),
COL-TBL032-01..04, COL-TBL033-01..05 · Constraints: CST-001 ×3, CST-023
(`uq_approval_snapshots__version`, IDX-025), CST-024
(`uq_approval_acceptances__approval_agrversion`, IDX-026), CST-051 instance
(`uq_approval_thread_colors__approval_position`, IDX-063), CST-066 instance
(dims > 0), CST-070 ×3 (hash format), CST-091 (**full reject-mutation
trigger candidate, S24** — stronger than CST-090/096: no status column
exists to except, per LC-10 exists-or-not)
Relationships: REL-051 (→ design_versions, restrict), REL-052 ×3
(→ design_cases/custom_requests/customers, restrict), REL-053 ×2
(→ secure_access_grants/contact_verification_challenges, restrict),
REL-054 (thread_colors → approval_snapshots), REL-055 ×2 (acceptances →
approval_snapshots/agreement_versions), **DEV-DB6-013 implemented**: four
native FKs `approval_snapshots.product_id/product_variant_id/`
`product_side_id/embroidery_area_id` → `products/product_variants/`
`product_sides/embroidery_areas` (COL-TBL031-05a..05d), same class of gap
as DEV-DB6-012, closed with this group.
Indexes shipped: IDX-025/026/063 (constraint-created); IDX-136
(recommended, on `custom_request_id`) → deferred to S25, same pattern as
IDX-116. No Quotation/Order/Payment/Reservation field, no 3D field, no
generic placement/asset polymorphism, no plaintext token/OTP, no
auto-orchestration trigger.

**Placement hierarchy integrity (existence vs same-hierarchy, DB6-C4
pattern applied):** the four new FKs prove each placement column's target
row *exists*; they do **not** prove the rows are mutually consistent (e.g.
`product_variant_id` actually belonging to `product_id`). That
cross-column hierarchy consistency (`CON-058..060`) is **TX/App** —
verified in the approval transaction against the referenced Design
Version's own placement, same tier as `design_versions`' identical
placement quartet (DEV-DB6-012, G11) — no composite FK or trigger
invented. Live-verified: a variant/side/area from an unrelated product is
accepted by the physical schema (see `DB6_G13_GROUP_REPORT.md` §D).

**Exact-version authority:** `approval_snapshots.design_version_id` and
`approval_snapshot_agreement_acceptances.agreement_version_id` reference
the exact immutable version rows, never `design_cases.current_version_id`
or `agreements.current_version_id` (both mutable pointers) — a later
pointer move does not and cannot (CST-091) change historical approval
evidence.

### G14 — Quotation (CTX-QUO) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-050 | `quotations` | `quotation/quotations.ts` | uuid7 | header | **implemented** |
| TBL-051 | `quotation_versions` | `quotation/quotation-versions.ts` | uuid7 | immutable-once-sent | **implemented** |
| TBL-052 | `quotation_line_items` | `quotation/quotation-line-items.ts` | uuid7 | immutable w/ version | **implemented** |
| TBL-053 | `quotation_acceptances` | `quotation/quotation-acceptances.ts` | bigint | append | **implemented** |

**Implementation notes (2026-07-19, DB6-G14):**
- REL-062's second edge (`custom_requests.current_quotation_id` →
  `quotations`, deferred owner G14 per §2.2.1 ledger) and REL-068
  (`quotations.current_version_id` → `quotation_versions`, an intra-group
  header↔child cycle) are both implemented by hand-authored custom SQL in
  `0022_add_quotation_current_version_and_request_pointer_fks.sql` — the
  same sanctioned mechanism as REL-044/0016 and REL-098/0019. Existence is
  physical for both pointers; same-quotation/same-request ownership of the
  pointed-to row stays TX/App (documented "TX consistency" in
  `DB4_RELATIONSHIP_AND_FK_MODEL.md`), same tier as REL-044/REL-098 — no
  trigger or composite FK invented.
- Money columns use `numeric(14,2)` (amounts) / `numeric(5,2)`
  (`deposit_percent`) with a closed `currency_code = 'VND'` CHECK (ADR-DB4-001).
  `total_amount = subtotal + manual_adjustment + shipping_fee` and
  `deposit_amount + remaining_amount = total_amount` are CHECK-enforced
  (CST-064) — live-verified.
- IDX-084 (`ix_quotation_versions__valid_until_id__sent`, P0 required) is
  implemented in this group, not deferred — it is the only launch-required
  performance index in the G14/G16 register section.

### G15 — Order & shipping (CTX-ORD) · **implemented**

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-043 | `orders` | `ordering/orders.ts` | uuid7 | mutable | **implemented** |
| TBL-044 | `order_items` | `ordering/order-items.ts` | uuid7 | immutable | **implemented** |
| TBL-045 | `order_transitions` | `ordering/order-transitions.ts` | bigint | append | **implemented** |
| TBL-046 | `order_cancellation_requests` | `ordering/order-cancellation-requests.ts` | uuid7 | mutable | **implemented** |
| TBL-047 | `shipping_details` | `ordering/shipping-details.ts` | uuid7 | mutable-until-frozen | **implemented** |
| TBL-048 | `shipping_snapshots` | `ordering/shipping-snapshots.ts` | uuid7 | immutable | **implemented** |
| TBL-049 | `shipping_fee_acknowledgements` | `ordering/shipping-fee-acknowledgements.ts` | bigint | append | **implemented** |
| TBL-021 | `inventory_reservations` | `inventory/inventory-reservations.ts` | uuid7 | mutable | **implemented** |

**Implementation notes (2026-07-19, DB6-G15):**
- `shipping_fee_acknowledgements.grant_id`/`.step_up_challenge_id`
  (COL-TBL049-04a/04b) — **DEV-DB6-014 closed**: both native FKs to
  `secure_access_grants`/`contact_verification_challenges` are implemented
  (NOT NULL, restrict), matching the sibling REL-050/053/070/080/085
  secure-flow evidence tables. Existence is physical; purpose/scope
  validation stays TX/App (GRD-002/003), same tier as every sibling table.
- `order_cancellation_requests.decided_by_admin_id` (COL-TBL046-08) —
  per DEV-DB6-015, stays a no-FK evidence reference (bare admin actor,
  outside REL-105's enumeration), same treatment as
  `request_moderation_notes.admin_id` (G9).
- Three deferred ledger/hold FKs resolved by direct edit of their existing
  G6/G10 schema files (no circular-import cycle exists for any of the
  three, so no custom SQL was needed — all three ship in the same
  generated migration as the eight new tables):
  `inventory_ledger_entries.reservation_id` → `inventory_reservations`,
  `inventory_ledger_entries.order_id` → `orders`, and
  `inventory_soft_holds.converted_reservation_id` →
  `inventory_reservations` (REL-028 ×2, REL-030 — manifest §2.2.1 ledger).
- `orders.current_approval_snapshot_id` (REL-074) is an audited pointer,
  NOT NULL from creation, no header↔child cycle (target `approval_snapshots`
  already existed since G13) — a plain inline FK, existence physical,
  same-case chain TX/App (same tier as every current-pointer finding).
- Money columns use `numeric(14,2)` with a closed `currency_code = 'VND'`
  CHECK; no arithmetic CHECK was added across `order_items`/`orders`
  totals (unlike `quotation_versions`' CST-064) — DB4 does not cite an
  equivalent cross-column arithmetic constraint for the Order group, and
  none is invented here.

### G16 — Payment (CTX-PAY) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-054 | `payment_obligations` | `payment/payment-obligations.ts` | uuid7 | mutable | implemented |
| TBL-055 | `payment_attempts` | `payment/payment-attempts.ts` | uuid7 | mutable | implemented |
| TBL-056 | `payment_provider_events` | `payment/payment-provider-events.ts` | bigint | append | implemented |
| TBL-057 | `payment_reconciliations` | `payment/payment-reconciliations.ts` | bigint | append | implemented |
| TBL-058 | `refunds` | `payment/refunds.ts` | uuid7 | state mutable + amounts immutable | implemented |

**DB6-C4 note:** `payment_reconciliations.admin_id` (COL-TBL057-07) and
`refunds.approved_by_admin_id`/`executed_by_admin_id` (COL-TBL058-10) — per
DEV-DB6-015, stay no-FK evidence references, same treatment as
`request_moderation_notes.admin_id` (G9).

**Implementation notes (2026-07-19, DB6-G16):**

- **One header↔child cycle, resolved by custom SQL** — same class as
  G12/G13/G14, unlike G15's zero-cycle outcome. `payment_attempts.
  payment_obligation_id → payment_obligations` (REL-084) lives inline in
  `payment-attempts.ts`; the reverse pointer, `payment_obligations.
  satisfied_by_attempt_id → payment_attempts` (REL-083, exactly-once
  application evidence, CC-10), would need a circular module import, so it
  is added by hand-authored SQL in `0025_add_payment_obligation_satisfied_by_fk.sql`,
  following the same generated migration (`0024_create_payment_tables.sql`)
  that created both tables — mirroring `0016`/`0019`/`0022`.
- `payment_obligations.superseded_by_obligation_id` (REL-083, recalculation
  chain, ADR-DB3-003 r7) is self-referencing — no cycle, declared inline.
- **DEV-DB6-015 closed for this group's two forward columns**:
  `payment_reconciliations.admin_id` and `refunds.approved_by_admin_id`/
  `executed_by_admin_id` are implemented exactly as the deviation entry
  prescribed — bare evidence columns, no `foreignKey()`.
- `payment_reconciliations.resolved_status` and `refunds.method`/
  `transfer_reference` are documented `[R]`/free-text per DB4's column
  dictionary; no cross-domain enum was invented for `resolved_status`
  (DB4 does not define it as its own closed set — it borrows from either
  LC-15 or LC-16 depending on which target was resolved).
- CST-100 (refunds amount/target/currency immutable after insert) and
  CST-117 (refund ≤ reconciled refundable amount) are **not** database
  mechanisms in this group — same honestly-documented gap as CST-090/092/096
  for prior groups; S24 owns the immutability trigger, TX/App and DB7-10/
  D8-03 own the cross-row reconciliation.
- No `deposit_paid`/`fully_paid` boolean exists anywhere in this group —
  "fully paid" is derived (both obligations SATISFIED), never stored.

**DB6-C5 addendum (2026-07-19, forward correction, migration `0026`):**

- G16's own review (not a G17 activity) found `payment_reconciliations.
  amount` fractional-VND acceptance recorded as a documented gap instead of
  fixed — and, on audit, the same gap existed on **every** money column
  implemented since G5 except `products`/`skus` (the only two using
  `currencyScaleCheck()` from `primitives/money.ts`, DEV-DB6-005). C5 applies
  the same helper to all thirteen remaining money-bearing tables (nine from
  Quotation/Ordering, four more Payment tables besides
  `payment_reconciliations`, which needed the unconditional-form equivalent
  since it carries no per-row `currency_code`) — twenty-one new CHECKs,
  one per affected amount column. Full detail: `DB6_MONEY_SCALE_AUDIT.md`.
- The G16 group report's own metrics (launch-index count, partial-index
  count, CHECK-constraint count, Jest chronology, commit hash) were found
  internally inconsistent on review and are corrected in
  `DB6_INDEX_METRIC_RECONCILIATION.md` and the report's own addendum — no
  additional schema objects resulted from that correction, only accurate
  counting of what G16 had already built. Commit hash of the G16
  implementation itself: `701ebb0` (verified via `git log`, parent
  `4dee744`, tree clean, not pushed at time of writing).
- C5 adds zero tables, columns, FKs, or indexes. `column-metrics.ts` and the
  §4.1 table below are unchanged by C5.

### G17 — Production (CTX-PRD) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-059 | `production_jobs` | `production/production-jobs.ts` | uuid7 | mutable | implemented |
| TBL-060 | `production_specifications` | `production/production-specifications.ts` | uuid7 | immutable | implemented |
| TBL-061 | `production_artifacts` | `production/production-artifacts.ts` | uuid7 | mutable | implemented |
| TBL-062 | `production_notes` | `production/production-notes.ts` | bigint | append | implemented |
| TBL-063 | `production_job_transitions` | `production/production-job-transitions.ts` | bigint | append | implemented |

**DB6-C4 note:** `production_notes.admin_id` (COL-TBL062-03) — per
DEV-DB6-015, stays a no-FK evidence reference, same treatment as
`request_moderation_notes.admin_id` (G9).

**Implementation notes (2026-07-19, DB6-G17):**

- **Zero header↔child import cycles** — all five files import only
  "earlier" modules (`orders`, `approval_snapshots`, `production_jobs`,
  `assets`, `admin_accounts`); `production_jobs` self-references
  `reworked_from_job_id` inline (no cycle, same as
  `quotation_versions.parent_version_id`). Single generated migration
  `0027_create_production_tables.sql`, no custom SQL needed.
- **Order-scoped identity, not Order-Item-scoped.** DB4's column dictionary
  carries no `order_item_id` on `production_jobs` — CST-041's unique pair is
  `(order_id, approval_snapshot_id)`, a plain (non-partial) UNIQUE
  constraint, not a partial-unique index.
- **DEV-DB6-015 applied correctly and asymmetrically within this group**:
  `production_notes.admin_id` (TBL-062, not in REL-105's enumeration)
  stays a bare no-FK evidence column; `production_job_transitions.admin_id`
  (TBL-063, one of REL-105's four explicitly enumerated tables) gets a real
  `foreignKey()` to `admin_accounts` — the two are not interchangeable
  under the same deviation entry.
- `production_specifications` is immutable (no `updated_at`); its
  same-chain integrity with the parent job's own `approval_snapshot_id` is
  existence-physical (two independent FKs) but not cross-chain-enforced —
  same tier as every other current-pointer/chain finding in this
  engagement, documented rather than invented as a composite FK.
- No JSONB, no money field in this group — DB4 confirms both; A08 and the
  9/9 JSONB closed set are both unaffected.
- No trigger creates a job from Payment, starts Production automatically,
  consumes a Reservation, or transitions `orders.status` — TR-LC18-01/02/03
  (DB3) remain TX/App-owned; this group stores only the resulting facts.

### G18 — Notification (CTX-NTF) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-070 | `notification_intents` | `notification/notification-intents.ts` | uuid7 | mutable (status) | implemented |
| TBL-071 | `notification_delivery_attempts` | `notification/notification-delivery-attempts.ts` | bigint | append | implemented |

**DEV-DB6-016 note:** `notification_intents.recipient_contact_point_id`
(REL-099) and `notification_intents.source_outbox_event_id` (REL-101) stay
no-FK evidence/trace references; `channel` (both tables) has no closed-set
CHECK — DB4/ADR-DB2-003 leave channel/provider enumeration open (O-005,
DEC-25). See `DB6_DEVIATION_REGISTER.md` DEV-DB6-016.

**Implementation notes (2026-07-19, DB6-G18):**

- **Zero header↔child import cycles** — `notification-delivery-attempts.ts`
  imports only `notification-intents.ts`; no cycle. Single generated
  migration `0028_create_notification_tables.sql`, no custom SQL needed.
- **JSONB boundary #8** (`notification_intents.params`) is now physically
  implemented — the 8th of 9 closed-set JSONB definitions to land; the 9th
  (`audit_events`, if any) remains G19's scope. Closed-set definition count
  stays 9/9 (unchanged); physical JSONB columns implemented moves 7 → 8.
- **`intent_key` (CST-047) is UQ-backed by the implicit unique index**
  (`uq_notification_intents__intent_key`), satisfying IDX-057 — no separate
  `uniqueIndex()`/`index()` call needed.
- **REL-100 is the only real physical FK in this group**
  (`notification_delivery_attempts.intent_id` → `notification_intents.id`,
  restrict). REL-099 and REL-101 are intentional no-FK references
  (DEV-DB6-016); logical/physical-FK-target denominators (164/162) are
  unaffected — neither was ever counted as a physical FK target.
- No trigger creates this row from a source event, marks it `SATISFIED`,
  spawns a Delivery Attempt, or mutates any other domain table —
  TR-NTF-01..06 (DB3) remain worker/App-owned; this group stores only the
  resulting facts.

### G19 — Audit (CTX-AUD) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-072 | `audit_events` | `audit/audit-events.ts` | bigint | append | **implemented** |

**Implementation notes (2026-07-19, DB6-G19):**
- Column metrics: 9 logical COL IDs (COL-TBL072-01..09), 4 expansion columns
  (COL-03 → `admin_id`/`customer_id`/`grant_id`/`system_job_key`, +3; COL-05
  → `target_kind`/`target_id`, +1) = 13 business columns + 2 convention
  (`id`, `created_at`; no `updated_at` — append-only) = **15 physical
  columns**. Live-verified.
- REL-105 (TBL-072 subset ×3) implemented as real physical FKs: `admin_id`
  → `admin_accounts`, `customer_id` → `customers`, `grant_id` →
  `secure_access_grants`, all `ON DELETE RESTRICT` — REL-105's full 10-edge
  enumeration (TBL-042/045/063/072) is now **10/10 physical**.
  `system_job_key` remains bare no-FK evidence (no target table for a job
  key), same treatment as the sibling transition tables.
- REL-103 (`target_kind`/`target_id`) implemented exactly as the justified
  cross-cutting polymorphic-target exception: no physical FK, no
  target-kind registry table, no EAV. IDX-095 is the only access path.
- CST-072 (actor_kind ↔ matching actor-ref exclusivity) is implemented as a
  same-row CHECK (`ck_audit_events__actor_kind_ref_match`) covering
  `admin_id`/`customer_id`/`system_job_key` in both directions;
  `grant_id` is independent evidence outside this CHECK (may accompany any
  `actor_kind`, same as the sibling REL-105 tables). `actor_kind`'s own
  domain is left open — no dictionary closed set exists in DB4, so none is
  invented, matching the precedent already set by
  `custom_request_transitions`/`order_transitions`.
- JSONB boundary **#7** (`audit_events.summary`) is now physically
  implemented — the 9th and last of the 9 closed-set JSONB definitions to
  land. Closed-set: **9/9 definitions, 9/9 physical**. See the G18 report
  correction note below — this column's canonical boundary number is #7,
  not #9; the earlier "boundary #9 remains G19" phrasing in the G18 report
  was a numbering slip, not a physical error.
- IDX-095 (`(target_kind, target_id, occurred_at DESC, id DESC)`) and
  IDX-096 (`(occurred_at DESC, id DESC)`) implemented exactly, both
  non-partial, both required tier. IDX-097/IDX-098 remain deferred to S25
  per DB5's own tiering — not implemented in G19.
- CST-098 (append-only reject UPDATE/DELETE) is **not** implemented in G19
  — `audit_events` is added to the S24 trigger target list; UPDATE/DELETE
  currently succeed against this table pre-S24, an honestly-reported gap,
  not a regression.
- **Final physical FK reconciliation is 160/162, not 162/162** — see
  DEV-DB6-017 below. The three genuine remaining edges this group owed
  (`admin_id`, `customer_id`, `grant_id`) are now all physical; no other
  undocumented edge exists anywhere in the deferred-FK ledger (§2.2.1,
  fully closed since G15) or in DB6-C4's Class-A/B/C findings. The
  "162" ceiling itself is off by 2 — DEV-DB6-017 documents the root cause
  and corrects it to 160.

### 3.1. Group roll-up

| Group | Tables | Cumulative | Status |
|---|---|---|---|
| G1 | 3 | 3 | **implemented** |
| G2 | 5 | 8 | **implemented** |
| G3 | 3 | 11 | **implemented** |
| G4 | 3 | 14 | **implemented** |
| G5 | 7 | 21 | **implemented** |
| G6 | 2 | 23 | **implemented** |
| G7 | 5 | 28 | **implemented** |
| G8 | 2 | 30 | **implemented** |
| G9 | 7 | 37 | **implemented** |
| G10 | 4 | 41 | **implemented** |
| G11 | 3 | 44 | **implemented** |
| G12 | 6 | 50 | **implemented** |
| G13 | 3 | 53 | **implemented** |
| G14 | 4 | 57 | **implemented** |
| G15 | 8 | 65 | **implemented** |
| G16 | 5 | 70 | **implemented** |
| G17 | 5 | 75 | **implemented** |
| G18 | 2 | 77 | **implemented** |
| G19 | 1 | 78 | **implemented** |

**78 of 78 implemented. DB6-G01..G19 physical schema implementation COMPLETE.**

`inventory_soft_holds` (TBL-020) and `inventory_reservations` (TBL-021) are
listed by DB4 under G6 but **created** in G10 and G15 respectively, because
their FKs need `custom_requests` and `orders`. They are counted once, in their
creation group.

---

## 4. Column mapping

### 4.0. Convention-column register (canonical, checker-enforced)

Every physical column that does not carry a DB4 `COL-*` ID comes from exactly
this closed register. Nothing else may be added without a `DEV-DB6-*` entry —
a column with no COL ID and no convention ID is an orphan and fails review.

| Convention | Source decision | Purpose | Applies to | Type | Default | Mutable | Indexed | Checker |
|---|---|---|---|---|---|---|---|---|
| `id` (uuid7) | ADR-DB1-007 cat. 1, CST-001 | business/public identity, app-generated | every business table | `uuid` | none (app supplies) | no | PK backing | **yes** — file must use `idColumn()` or `sequenceColumn()` |
| `id` (bigint) | ADR-DB1-007 cat. 2, CST-001 | internal append-only surrogate | append-only/operational tables | `bigint GENERATED ALWAYS AS IDENTITY` | DB identity | no | PK backing | **yes** — same check |
| `created_at` | ADR-DB1-006 (implicit per DB4 table-catalog §1 legend) | row creation instant | **every** table | `timestamptz` | `now()` | no | only where a DB5 `IDX-*` keys on it | **yes** — file must use `createdAt()` |
| `updated_at` | ADR-DB1-006 (mutable tables only; **forbidden** on immutable/append-only/column-scoped tables) | last modification instant | mutable/header/temp/operational tables | `timestamptz` | `now()` | yes | never | **yes** — presence must match the table's manifest mutability class |

Rules the register encodes:

- these columns never change row meaning or aggregate ownership — they are
  identity and bookkeeping, not business state;
- none is a derived-state authority (`updated_at` is bookkeeping, not a
  lifecycle signal — lifecycles use their own status/timestamp columns);
- `updated_at` presence is **derived from the manifest's mutability class**,
  not chosen per table: classes matching `immutable`/`append`/`column-scoped`/
  `snap`/`ver` must not have it, all others must;
- the checker cross-checks every *implemented* table's schema file against
  this register and its manifest mutability class on every run.

### 4.1. Column-metric model (DB6-C2, canonical and checker-enforced)

**The formula is NOT `logical IDs + convention = physical`.** DB4 collapses
some multi-column concepts into one `COL-*` ID with a `×N` marker (the same
compaction pattern as REL rows), so IDs undercount physical columns. The
canonical formula, enforced per table, per group and globally:

```text
documented logical COL IDs + ×N expansions = business columns
business columns + convention columns      = total physical columns
```

The `Expansions` column counts every physical column the logical `COL-*`
register does not name one-for-one. Two sources feed it: the original DB4 `×N`
expansions, and application-era columns added by an approved database-change
checkpoint. The second source starts with **APP3-DB01** (migration 0034), which
added `code`, `retired_at` and `superseded_by_id` to `product_sides` and
`embroidery_areas` (IMP-D041 placement retirement authority) and `width_px`,
`height_px`, `media_type` and `byte_size` to `asset_derivatives` (IMP-D044
canonical derivative metadata) — ten columns, taking the total from 833 to 843.

The seven `×N` COL expansions across G1–G6 (each +N−1 columns):

| COL ID | ×N | Physical children |
|---|---|---|
| COL-TBL073-02 | 2 | `aggregate_kind`, `aggregate_id` |
| COL-TBL073-08 | 2 | `claimed_by`, `claimed_at` |
| COL-TBL074-07 | 2 | `claimed_at`, `completed_at` |
| COL-TBL016-03 | 2 | `bound_x_px`, `bound_y_px` |
| COL-TBL016-04 | 2 | `bound_width_px`, `bound_height_px` |
| COL-TBL019-09 | 3 | `actor_kind`, `admin_id`, `system_job_key` |

No logical COL ID is non-physical, and none shares a physical column, in
G1–G6. The machine-readable per-table register lives in
`packages/database/src/schema/column-metrics.ts`; its spec verifies every row
against the **live** drizzle schema (bijection between exported tables and
register rows, exact physical counts, formula balance, and a tampered-row
negative fixture). The manifest checker cross-checks this group table against
that register on every run.

| Group | Tables | Logical IDs | Expansions | Business | Convention | Physical |
|---|---|---|---|---|---|---|
| G1 | 3 | 17 | 0 | 17 | 9 | 26 |
| G2 | 5 | 34 | 3 | 37 | 12 | 49 |
| G3 | 3 | 18 | 0 | 18 | 9 | 27 |
| G4 | 3 | 22 | 4 | 26 | 8 | 34 |
| G5 | 7 | 52 | 8 | 60 | 21 | 81 |
| G6 | 2 | 12 | 2 | 14 | 5 | 19 |
| G7 | 5 | 27 | 6 | 33 | 14 | 47 |
| G8 | 2 | 12 | 0 | 12 | 5 | 17 |
| G9 | 7 | 33 | 7 | 40 | 19 | 59 |
| G10 | 4 | 27 | 0 | 27 | 11 | 38 |
| G11 | 3 | 20 | 9 | 29 | 6 | 35 |
| G12 | 6 | 38 | 2 | 40 | 17 | 57 |
| G13 | 3 | 20 | 12 | 32 | 6 | 38 |
| G14 | 4 | 37 | 10 | 47 | 9 | 56 |
| G15 | 8 | 71 | 20 | 91 | 20 | 111 |
| G16 | 5 | 48 | 6 | 54 | 13 | 67 |
| G17 | 5 | 25 | 9 | 34 | 12 | 46 |
| G18 | 2 | 15 | 1 | 16 | 5 | 21 |
| G19 | 1 | 9 | 4 | 13 | 2 | 15 |
| **Total** | **78** | **537** | **103** | **640** | **203** | **843** |

Live-database anchor (2026-07-18): `pg_attribute` reports **226** physical
columns across the 23 implemented tables — the formula and the database
agree. Earlier *chat-report running totals* ("142 logical / 62 convention /
200 physical") were hand-accumulated with the wrong implicit formula and were
wrong on all three numbers; the per-group manifest notes were correct
throughout. Root cause and correction: `DB6_G06_GROUP_REPORT.md` addendum.

Per-group accounting therefore always reports: logical COL IDs, ×N
expansions, business columns, convention columns, and total physical columns
— five figures, two balancing equations.

The authoritative column list is `DB4_COLUMN_DICTIONARY.md`. This manifest does
not duplicate ~700 column rows; it binds the *rules* by which each column is
rendered, and records per-group parity results in
`DB6_FOUNDATION_REVIEW_REPORT.md`.

| DB4 notation | Physical rendering |
|---|---|
| `uuid` | `uuid` |
| `text` | `text` (never `varchar(n)`) |
| `timestamptz` | `timestamp with time zone` |
| money | `numeric(14,2)` + sibling `currency_code char(3)` |
| percentage | `numeric(5,2)` |
| `jsonb` | `jsonb`, opaque, app-validated (ADR-DB4-004) |
| **N? = no** | `NOT NULL` |
| **N? = yes** | nullable |
| **M? = no** | immutability enforced per §5.3, not by column type |
| implicit | `created_at` NOT NULL on every table |
| implicit | `updated_at` NOT NULL on mutable tables only |

Every table additionally carries `id` per ADR-DB1-007. The column dictionary
does not list `id`/`created_at`/`updated_at` per row; they are conventions
(DB4 table catalog §1 legend).

**Per-group column parity is a gate**, verified by counting the DB4 dictionary
rows for each TBL and comparing against `information_schema.columns` minus the
three convention columns.

---

## 5. Constraint mapping

### 5.1. Blanket constraints

| CST | Scope | Mechanism | Physical count |
|---|---|---|---|
| CST-001 | PK on all 78 tables | `primaryKey({name:'pk_<table>'})` | 78 PK constraints → **78 backing indexes** |
| CST-060 | status sets, all state-owning tables | `check('ck_<table>__status', stateCheck(...))` | one per status column (25) |
| CST-080 | NOT NULL rules | column `.notNull()` | per column dictionary |

### 5.2. Enforcement mechanism split (92 catalogued rows)

| Type | Count | Mechanism |
|---|---|---|
| `UQ` unique | 37 | `unique(name)` → PostgreSQL-created backing index |
| `pUQ` partial unique | 12 | **explicit** `uniqueIndex(name).where(...)` — PostgreSQL has no partial unique *constraint* |
| `CK` check | 15 | `check(name, sql)` |
| `IMM` immutability | 9 | custom SQL trigger, `tg_<table>__reject_mutation` |
| `APP` append-only | 2 | custom SQL trigger |
| `TRG` other trigger | 1 | custom SQL trigger |
| `XCL` exclusion | 1 | **conditional, not built** (CST-046/IDX-056) |
| `TX` transaction/app only | 15 | no DB mechanism; DB7 tests representation, DB8 the race |

`pUQ` count (12) is the constraint-side count. The index manifest lists **13**
partial unique indexes because IDX-064 implements a partial unique that DB4
files under the CST-017 family rather than as its own `pUQ` row.

### 5.3. Immutability and append-only (DB5-A10)

Enforced by trigger, authored as reviewed custom SQL, **scoped** — never a
blanket update ban where DB4 permits mutable operational metadata:

| Category | Tables | Scope rule |
|---|---|---|
| Immutable once sent/published | TBL-028, 051, 035, 069 | `WHEN (OLD.status = <sent/published>)` |
| Immutable snapshots | TBL-031, 032, 033, 044, 048, 060 | full-row reject |
| Immutable versions | TBL-052, 077 | full-row reject |
| Append-only | TBL-019, 072, 056, 042, 045, 063, 030, 010, 007, 041, 049, 053, 057, 062, 071, 023 | reject UPDATE/DELETE |
| **Column-scoped** | TBL-073 `outbox_events` | payload/identity immutable; `status`, `next_attempt_at`, `dispatched_at`, attempt metadata **mutable** (CST-099) |
| **Operational-metadata exception** | TBL-074 `idempotency_records`, TBL-075 `background_job_attempts` | claim/retry/expiry fields mutable by design |

G1 has **no** immutability constraint: all three identity tables are mutable
per DB4.

---

## 6. Lifecycle state storage (29 machines, 23 `LC-*` IDs)

Each state column is `text` + CHECK built from a single canonical tuple
exported by the table's schema file (DB5-A09). No state literal is written
twice.

| LC | Machines | Status column(s) | Group | Status |
|---|---|---|---|---|
| LC-01 | Admin Account, Admin Session | `admin_accounts.status`, `admin_sessions.status` | G1 | **implemented** |
| LC-02 | Verification Challenge | `contact_verification_challenges.status` | G8 | planned |
| LC-03 | Secure Access Grant | `secure_access_grants.status` | G10 | planned |
| LC-04 | Product | `products.status` | G5 | planned |
| LC-05 | SKU (definition + stock) | `skus.status` | G5/G6 | planned |
| LC-06 | Asset, Derivative | `assets.status`, `asset_derivatives.status` | G4 | planned |
| LC-07 | Design Session | `design_sessions.status` | G7 | planned |
| LC-08 | Design Version | `design_versions.status` | G11 | implemented |
| LC-09 | Design Review | `design_reviews.outcome` | G11 | implemented |
| LC-10 | Approval (exists-or-not) | — (row existence) | G13 | planned |
| LC-11 | Custom Request | `custom_requests.status` | G9 | planned |
| LC-12 | Quotation | `quotations.status` | G14 | planned |
| LC-13 | Quotation Version | `quotation_versions.status` | G14 | planned |
| LC-14 | Order | `orders.status` | G15 | **implemented** |
| LC-15 | Payment Obligation | `payment_obligations.status` | G16 | **implemented** |
| LC-16 | Payment Attempt | `payment_attempts.status` | G16 | **implemented** |
| LC-17 | Soft Hold, Reservation | `inventory_soft_holds.status`, `inventory_reservations.status` | G10/G15 | **implemented** |
| LC-18 | Production Job | `production_jobs.status` | G17 | **implemented** |
| LC-19 | Shipping Details | `shipping_details.status` | G15 | **implemented** |
| LC-20 | Refund | `refunds.status` | G16 | **implemented** |
| LC-21 | Delivery | `orders` delivery fields + `order_transitions` | G15 | **implemented** |
| LC-22 | Outbox Event | `outbox_events.status` | G2 | **implemented** |
| LC-23 | Idempotency Record | `idempotency_records.status` | G2 | **implemented** |
| (none) | Job attempt outcome | `background_job_attempts.outcome` | G2 | **implemented** |
| (none) | Notification Intent | `notification_intents.status` | G18 | **implemented** |

Plus non-`LC` publication states (`categories`, `gallery_entries`,
`content_pages`, `design_templates`, `agreement_versions`) and secondary
statuses (`asset_inspections.inspection_status`), reaching 25 status columns
across 29 machines.

---

## 7. JSONB boundaries (9 payloads)

All 9 are **opaque to the database** (ADR-DB4-004 r2): no DB-side JSON schema
check, no GIN index (IDX-R10), every invariant fact extracted to a relational
column. Validation is application-level with a recorded schema version.

Numbering, column names and version keys are taken verbatim from
`DB4_JSONB_PAYLOAD_MAP.md` — this table must not be paraphrased.

| # | Column (COL) | Version key | Group | Status |
|---|---|---|---|---|
| 1 | `design_sessions.design_document` (COL-TBL025-03) | `document_schema_version` | G7 | **implemented** |
| 2 | `design_versions.design_document` (COL-TBL028-05) | `document_schema_version` | G11 | implemented |
| 3 | `design_template_versions.design_document` (COL-TBL035-03) | `document_schema_version` | G7 | **implemented** |
| 4 | `outbox_events.payload` (COL-TBL073-03) | `payload_schema_version` | **G2** | **implemented** |
| 5 | `idempotency_records.result` (COL-TBL074-05) | fixed internal shape | **G2** | **implemented** |
| 6 | `payment_provider_events.redacted_payload` (COL-TBL056-06) | `provider_key` discriminates | G16 | **implemented** |
| 7 | `audit_events.summary` (COL-TBL072-07) | fixed internal shape | G19 | **implemented** |
| 8 | `notification_intents.params` (COL-TBL070-06) | `template_version` | G18 | **implemented** |
| 9 | `policy_configuration_versions.value` (COL-TBL077-03) | `value_schema_version` | **G2** | **implemented** |

**Closed set.** A tenth JSONB column requires an ADR (ADR-DB4-004).

**(DB6-G19 preflight correction, 2026-07-19):** rows #1 and #3 were still
marked `planned` above despite G7 (`design_sessions`,
`design_template_versions`) having been implemented and committed long
before this group — a stale status label, not a physical gap. Live-catalog
confirmation on the persistent dev database (`information_schema.columns`,
`data_type='jsonb'`) shows both `design_document` columns physically
present today. Status corrected to `implemented`; no schema change. All 9
closed-set JSONB columns are now `implemented` (**9/9**).

`approval_snapshots` and `production_specifications` hold **no** JSONB payload:
their evidence is carried by extracted relational columns plus the design
document's hash. Neither appears in the closed set.

All nine are opaque: validation is application-side, and every invariant fact
(hash, uniqueness, status, fingerprint, amount) lives in a relational column, so
no guard ever reads inside a payload.

---

## 8. Migration ownership

| Migration | Group | Contents | Status |
|---|---|---|---|
| `0000_create_identity_tables.sql` | G1 | 3 tables, 3 PK, 2 UQ, 2 FK, 2 CK, 1 partial unique | **applied** |
| `0001_add_admin_accounts_successor_fk.sql` | G1 | REL-003 forward fix (DEV-DB6-008) | **applied** |
| `0002_create_platform_base_tables.sql` | G2 | 5 tables, 5 PK, 4 UQ, 2 FK, 4 CK | **applied** |
| `0003_align_status_check_names.sql` | G1 | CST-060 naming alignment (`__status_allowed`) | **applied** |
| `0004_add_policy_configuration_current_version_fk.sql` | G2 | REL-102 header pointer, **custom SQL** | **applied** |
| `0005_create_customer_tables.sql` | G3 | 3 tables, 3 PK, 1 UQ, 2 CK, 3 FK, 2 partial uniques, IDX-134 | **applied** |
| `0006_create_asset_tables.sql` | G4 | 3 tables, 3 PK, 1 UQ, 10 CK, 3 FK, 2 partial uniques, 4 perf indexes | **applied** |
| `0007_create_catalog_tables.sql` | G5 | 7 tables, 7 PK, 4 UQ, 14 CK, 8 FK, 5 perf indexes | **applied** |
| `0008_create_inventory_core_tables.sql` | G6 | 2 tables, 2 PK, 1 UQ, 5 CK, 2 FK, IDX-115 | **applied** |
| `0009_create_design_prerequest_tables.sql` | G7 | 5 tables, 5 PK, 5 UQ, 3 CK, 14 FK, IDX-085 | **applied** |
| `0010_add_deferred_session_fk.sql` | G7 | REL-033 deferred edge, **custom SQL**, ON DELETE SET NULL | **applied** |
| `0011_create_contact_verification_tables.sql` | G8 | 2 tables, 2 PK, 4 CK, 3 FK, IDX-006/111/112 | **applied** |
| `0012_create_request_and_design_case_tables.sql` | G9 | 7 tables, 7 PK, 4 UQ, 7 CK, 13 FK, IDX-073/100 | **applied** |
| `0013_add_request_design_case_pointer_fk.sql` | G9 | REL-062 pointer, **custom SQL**, restrict | **applied** |
| … | G3..G19 | one migration per group | planned |
| custom SQL | S24 | triggers + functions (immutability, append-only, outbox column-scope, actor consistency) | planned |
| index migration(s) | S25 | explicit performance indexes | planned |

Fresh install runs all in order (INV-28). Forward-only; a shared migration is
never edited (ADR-DB1-003).

---

## 9. Validation ownership

| Object class | Verified by |
|---|---|
| Table/column/FK/constraint existence | DB6 fresh-install parity gate |
| Constraint *behaviour* (rejects bad data) | **DB7** |
| Concurrency/lock behaviour | **DB8** |
| Index *usage* under representative data | **DB9** (`EXPLAIN`) |
| Backup/restore, collation drift, REINDEX | **DB10** |

DB6 asserts objects exist and are correctly shaped. It makes **no** performance
claim (DB5-A12).
