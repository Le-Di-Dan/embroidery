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
| Relationships `REL-*` | REL-001..105 | **92 rows** | **13** | **129 FK edges** |
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
| Expanded logical FK/reference edges | **129** |
| Implemented physical FK constraints | grows per group (parity gate counts these) |

92 `REL-*` rows expand to **129 FK edges** (checker-verified against the DB4
source document on every run):

| Multiplicity | Rows | Edges |
|---|---|---|
| ×1 | 66 | 66 |
| ×2 | 20 | 40 |
| ×3 | 3 | 9 |
| ×4 | 1 | 4 |
| ×5 | 2 | 10 |
| **Total** | **92** | **129** |

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
The parity gate counts **FK edges**, not `REL-*` rows. REL-104 (outbox
polymorphic aggregate reference) is a logical edge with **no physical FK** by
design — it is counted in the 129 logical edges but excluded from the physical
FK target.

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
exist now, FKs land with owner groups **G10** (soft_hold_id, reservation_id
target tables created there) and **G15** (order_id). Constraints: CST-014
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

### G7 — Design pre-request (CTX-DSN) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-034 | `design_templates` | `design/design-templates.ts` | uuid7 | header | planned |
| TBL-035 | `design_template_versions` | `design/design-template-versions.ts` | uuid7 | immutable-once-published | planned |
| TBL-036 | `design_template_assets` | `design/design-template-assets.ts` | uuid7 | mutable | planned |
| TBL-025 | `design_sessions` | `design/design-sessions.ts` | uuid7 | temp | planned |
| TBL-026 | `design_session_assets` | `design/design-session-assets.ts` | uuid7 | mutable | planned |

### G8 — Verification (CTX-CUS) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-006 | `contact_verification_challenges` | `customer/contact-verification-challenges.ts` | uuid7 | temp | planned |
| TBL-007 | `contact_verification_attempts` | `customer/contact-verification-attempts.ts` | bigint | append | planned |

### G9 — Request (CTX-ORD / CTX-DSN) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-037 | `custom_requests` | `ordering/custom-requests.ts` | uuid7 | mutable | planned |
| TBL-038 | `customer_owned_products` | `ordering/customer-owned-products.ts` | uuid7 | mutable | planned |
| TBL-039 | `custom_request_quantity_breakdowns` | `ordering/custom-request-quantity-breakdowns.ts` | uuid7 | mutable-until-quoted | planned |
| TBL-040 | `custom_request_assets` | `ordering/custom-request-assets.ts` | uuid7 | mutable | planned |
| TBL-041 | `request_moderation_notes` | `ordering/request-moderation-notes.ts` | bigint | append | planned |
| TBL-042 | `custom_request_transitions` | `ordering/custom-request-transitions.ts` | bigint | append | planned |
| TBL-027 | `design_cases` | `design/design-cases.ts` | uuid7 | header | planned |

### G10 — Grants, holds, merge (CTX-CUS / CTX-INV) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-008 | `secure_access_grants` | `customer/secure-access-grants.ts` | uuid7 | mutable | planned |
| TBL-020 | `inventory_soft_holds` | `inventory/inventory-soft-holds.ts` | uuid7 | mutable | planned |
| TBL-009 | `customer_merge_cases` | `customer/customer-merge-cases.ts` | uuid7 | mutable | planned |
| TBL-010 | `customer_merge_events` | `customer/customer-merge-events.ts` | bigint | append | planned |

### G11 — Design formal (CTX-DSN) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-028 | `design_versions` | `design/design-versions.ts` | uuid7 | immutable-once-sent | planned |
| TBL-029 | `design_version_assets` | `design/design-version-assets.ts` | uuid7 | immutable w/ version | planned |
| TBL-030 | `design_reviews` | `design/design-reviews.ts` | bigint | append | planned |

### G12 — Content, gallery, agreement (CTX-CNT / CTX-GAL) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-066 | `content_pages` | `content/content-pages.ts` | uuid7 | mutable | planned |
| TBL-067 | `redirect_rules` | `content/redirect-rules.ts` | uuid7 | mutable | planned |
| TBL-068 | `agreements` | `content/agreements.ts` | uuid7 | header | planned |
| TBL-069 | `agreement_versions` | `content/agreement-versions.ts` | uuid7 | immutable-once-published | planned |
| TBL-064 | `gallery_entries` | `gallery/gallery-entries.ts` | uuid7 | mutable | planned |
| TBL-065 | `gallery_entry_assets` | `gallery/gallery-entry-assets.ts` | uuid7 | mutable | planned |

### G13 — Approval (CTX-DSN) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-031 | `approval_snapshots` | `design/approval-snapshots.ts` | uuid7 | immutable | planned |
| TBL-032 | `approval_snapshot_thread_colors` | `design/approval-snapshot-thread-colors.ts` | bigint | immutable | planned |
| TBL-033 | `approval_snapshot_agreement_acceptances` | `design/approval-snapshot-agreement-acceptances.ts` | bigint | immutable | planned |

### G14 — Quotation (CTX-QUO) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-050 | `quotations` | `quotation/quotations.ts` | uuid7 | header | planned |
| TBL-051 | `quotation_versions` | `quotation/quotation-versions.ts` | uuid7 | immutable-once-sent | planned |
| TBL-052 | `quotation_line_items` | `quotation/quotation-line-items.ts` | uuid7 | immutable w/ version | planned |
| TBL-053 | `quotation_acceptances` | `quotation/quotation-acceptances.ts` | bigint | append | planned |

### G15 — Order & shipping (CTX-ORD) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-043 | `orders` | `ordering/orders.ts` | uuid7 | mutable | planned |
| TBL-044 | `order_items` | `ordering/order-items.ts` | uuid7 | immutable | planned |
| TBL-045 | `order_transitions` | `ordering/order-transitions.ts` | bigint | append | planned |
| TBL-046 | `order_cancellation_requests` | `ordering/order-cancellation-requests.ts` | uuid7 | mutable | planned |
| TBL-047 | `shipping_details` | `ordering/shipping-details.ts` | uuid7 | mutable-until-frozen | planned |
| TBL-048 | `shipping_snapshots` | `ordering/shipping-snapshots.ts` | uuid7 | immutable | planned |
| TBL-049 | `shipping_fee_acknowledgements` | `ordering/shipping-fee-acknowledgements.ts` | bigint | append | planned |
| TBL-021 | `inventory_reservations` | `inventory/inventory-reservations.ts` | uuid7 | mutable | planned |

### G16 — Payment (CTX-PAY) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-054 | `payment_obligations` | `payment/payment-obligations.ts` | uuid7 | mutable | planned |
| TBL-055 | `payment_attempts` | `payment/payment-attempts.ts` | uuid7 | mutable | planned |
| TBL-056 | `payment_provider_events` | `payment/payment-provider-events.ts` | bigint | append | planned |
| TBL-057 | `payment_reconciliations` | `payment/payment-reconciliations.ts` | bigint | append | planned |
| TBL-058 | `refunds` | `payment/refunds.ts` | uuid7 | state mutable + amounts immutable | planned |

### G17 — Production (CTX-PRD) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-059 | `production_jobs` | `production/production-jobs.ts` | uuid7 | mutable | planned |
| TBL-060 | `production_specifications` | `production/production-specifications.ts` | uuid7 | immutable | planned |
| TBL-061 | `production_artifacts` | `production/production-artifacts.ts` | uuid7 | mutable | planned |
| TBL-062 | `production_notes` | `production/production-notes.ts` | bigint | append | planned |
| TBL-063 | `production_job_transitions` | `production/production-job-transitions.ts` | bigint | append | planned |

### G18 — Notification (CTX-NTF) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-070 | `notification_intents` | `notification/notification-intents.ts` | uuid7 | mutable (status) | planned |
| TBL-071 | `notification_delivery_attempts` | `notification/notification-delivery-attempts.ts` | bigint | append | planned |

### G19 — Audit (CTX-AUD) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-072 | `audit_events` | `audit/audit-events.ts` | bigint | append | planned |

### 3.1. Group roll-up

| Group | Tables | Cumulative | Status |
|---|---|---|---|
| G1 | 3 | 3 | **implemented** |
| G2 | 5 | 8 | **implemented** |
| G3 | 3 | 11 | **implemented** |
| G4 | 3 | 14 | **implemented** |
| G5 | 7 | 21 | **implemented** |
| G6 | 2 | 23 | **implemented** |
| G7 | 5 | 28 | planned |
| G8 | 2 | 30 | planned |
| G9 | 7 | 37 | planned |
| G10 | 4 | 41 | planned |
| G11 | 3 | 44 | planned |
| G12 | 6 | 50 | planned |
| G13 | 3 | 53 | planned |
| G14 | 4 | 57 | planned |
| G15 | 8 | 65 | planned |
| G16 | 5 | 70 | planned |
| G17 | 5 | 75 | planned |
| G18 | 2 | 77 | planned |
| G19 | 1 | 78 | planned |

**23 of 78 implemented.**

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

Per-group accounting therefore always reports three figures:
`DB4 logical COL IDs` + `convention physical columns` = `total physical
columns`.

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
| LC-08 | Design Version | `design_versions.status` | G11 | planned |
| LC-09 | Design Review | `design_reviews.outcome` | G11 | planned |
| LC-10 | Approval (exists-or-not) | — (row existence) | G13 | planned |
| LC-11 | Custom Request | `custom_requests.status` | G9 | planned |
| LC-12 | Quotation | `quotations.status` | G14 | planned |
| LC-13 | Quotation Version | `quotation_versions.status` | G14 | planned |
| LC-14 | Order | `orders.status` | G15 | planned |
| LC-15 | Payment Obligation | `payment_obligations.status` | G16 | planned |
| LC-16 | Payment Attempt | `payment_attempts.status` | G16 | planned |
| LC-17 | Soft Hold, Reservation | `inventory_soft_holds.status`, `inventory_reservations.status` | G10/G15 | planned |
| LC-18 | Production Job | `production_jobs.status` | G17 | planned |
| LC-19 | Shipping Details | `shipping_details.status` | G15 | planned |
| LC-20 | Refund | `refunds.status` | G16 | planned |
| LC-21 | Delivery | `orders` delivery fields + `order_transitions` | G15 | planned |
| LC-22 | Outbox Event | `outbox_events.status` | G2 | **implemented** |
| LC-23 | Idempotency Record | `idempotency_records.status` | G2 | **implemented** |
| (none) | Job attempt outcome | `background_job_attempts.outcome` | G2 | **implemented** |

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
| 1 | `design_sessions.design_document` (COL-TBL025-03) | `document_schema_version` | G7 | planned |
| 2 | `design_versions.design_document` (COL-TBL028-05) | `document_schema_version` | G11 | planned |
| 3 | `design_template_versions.design_document` (COL-TBL035-03) | `document_schema_version` | G7 | planned |
| 4 | `outbox_events.payload` (COL-TBL073-03) | `payload_schema_version` | **G2** | **implemented** |
| 5 | `idempotency_records.result` (COL-TBL074-05) | fixed internal shape | **G2** | **implemented** |
| 6 | `payment_provider_events.redacted_payload` (COL-TBL056-06) | `provider_key` discriminates | G16 | planned |
| 7 | `audit_events.summary` (COL-TBL072-07) | fixed internal shape | G19 | planned |
| 8 | `notification_intents.params` (COL-TBL070-06) | `template_version` | G18 | planned |
| 9 | `policy_configuration_versions.value` (COL-TBL077-03) | `value_schema_version` | **G2** | **implemented** |

**Closed set.** A tenth JSONB column requires an ADR (ADR-DB4-004).

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
