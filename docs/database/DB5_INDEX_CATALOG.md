# DB5 — Index Catalog

**Checkpoint:** DB5 · **Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Nature:** Logical index definitions — **no SQL, no DDL, no Drizzle index
API**. Physical syntax is DB6. Governance:
[ADR-DB5-004](../adr/database/ADR-DB5-004-INDEX-GOVERNANCE.md).

## 1. Legend

- **Cat:** `INT` integrity-backed (consequence of a locked `CST-*`; DB5 may
  not re-litigate) · `PERF` performance · `REJ` rejected with rationale.
- **Method:** all B-tree unless stated. No GIN/GiST/BRIN/trigram index is
  created by DB5 (see §6).
- **U:** unique · `pU` partial unique.
- **Status:** `required` (launch) · `recommended` (launch, removable on
  evidence) · `conditional` (build when the trigger fires) · `rejected`.
- **Keys** are ordered; direction stated only where it differs from `ASC`.
- Selectivity/row counts are at the locked scale.
- Physical names: [`DB5_INDEX_NAMING_AND_HANDOFF.md`](./DB5_INDEX_NAMING_AND_HANDOFF.md).

---

## 2. Integrity-backed indexes (IDX-001 … IDX-064)

These implement locked `CST-*` uniqueness. Their necessity is **not** a DB5
decision (ADR-DB5-004 R3). Removal requires a superseding ADR. Write cost is
accepted as the price of the invariant. All are `required`.

| IDX | Table | Keys | U | Predicate | CST | Serves | Note |
|---|---|---|---|---|---|---|---|
| IDX-001 | TBL-001 admin_accounts | email | U | — | CST-002 | admin login | Population A |
| IDX-002 | TBL-001 | (status) | pU | `status='ACTIVE'` | CST-003 | one active admin | single-row index |
| IDX-003 | TBL-003 admin_sessions | token_hash | U | — | CST-004 | session resolve | [SEC] |
| IDX-004 | TBL-005 customer_contact_points | (contact_kind, normalized_value) | pU | `verified_at IS NOT NULL AND deactivated_at IS NULL` | CST-005 | one active verified link | ADR-DB2-001 r6; CC-17 |
| IDX-005 | TBL-005 | (customer_id) | pU | `is_primary` | CST-006 | one primary contact | |
| IDX-006 | TBL-006 challenges | (contact_kind, normalized_value, purpose) | pU | `status='ISSUED'` | CST-007 | **Q-31** | CC-17 arbiter |
| IDX-007 | TBL-008 grants | token_hash | U | — | CST-008 | **Q-08** | P0 security probe |
| IDX-008 | TBL-008 | (customer_id, custom_request_id) | pU | `status='ACTIVE'` | CST-009 | single active grant | D8-20 |
| IDX-009 | TBL-009 merge_cases | (survivor_customer_id, loser_customer_id) | pU | `status='REQUESTED'` | CST-010 | one open merge/pair | CC-27 |
| IDX-010 | TBL-011 categories | slug | U | — | CST-011 | category URL | |
| IDX-011 | TBL-012 products | slug | U | — | CST-011 | **Q-02** | |
| IDX-012 | TBL-064 gallery_entries | slug | U | — | CST-011 | gallery URL | |
| IDX-013 | TBL-034 design_templates | slug | U | — | CST-011 | template URL | |
| IDX-014 | TBL-014 skus | code | U | — | CST-012 | SKU lookup | |
| IDX-015 | TBL-017 product_media | (product_id, asset_id, role) | U | — | CST-013 | **Q-02** media; prefix `product_id` | |
| IDX-016 | TBL-018 sku_stocks | sku_id | U | — | CST-014 | **Q-32 lock anchor**, Q-03 | 1–1 |
| IDX-017 | TBL-020 soft_holds | (custom_request_id, sku_stock_id) | pU | `status='HELD'` | CST-015 | duplicate holds | D8-24 |
| IDX-018 | TBL-021 reservations | (order_id, sku_stock_id) | pU | `status='RESERVED'` | CST-016 | double reservation | D8-05 |
| IDX-019 | TBL-022 assets | storage_key | U | — | CST-017 | INV-10 | |
| IDX-020 | TBL-024 derivatives | (asset_id, kind) | pU | `status <> 'FAILED'` | CST-018 | duplicate pipeline | **not an access path** — see IDX-099 |
| IDX-021 | TBL-025 sessions | session_secret_hash | U | — | CST-019 | session identity | [SEC] |
| IDX-022 | TBL-027 design_cases | custom_request_id | U | — | CST-020 | one thread/request | |
| IDX-023 | TBL-028 design_versions | (design_case_id, version) | U | — | CST-021 | **Q-10** (backward scan) | |
| IDX-024 | TBL-028 | (design_case_id) | pU | `status='SENT_FOR_REVIEW'` | **CST-022** | **Q-11** | **INV-16/GRD-004; D7-04/D8-09 critical** |
| IDX-025 | TBL-031 approval_snapshots | design_version_id | U | — | CST-023 | **Q-14** | INV-01/03 |
| IDX-026 | TBL-033 acceptances | (approval_snapshot_id, agreement_version_id) | U | — | CST-024 | GRD-008 | |
| IDX-027 | TBL-035 template_versions | (design_template_id, version) | U | — | CST-025 | | |
| IDX-028 | TBL-037 custom_requests | code | U | — | CST-026 | **Q-15/Q-21** lookup | never an authz input |
| IDX-029 | TBL-038 COP | custom_request_id | U | — | CST-027 | one COP/request | |
| IDX-030 | TBL-039 breakdowns | (custom_request_id, product_variant_id, size_label) | U | — | CST-028 | prefix serves child fetch | |
| IDX-031 | TBL-043 orders | code | U | — | CST-029 | **Q-15** | |
| IDX-032 | TBL-043 | custom_request_id | U | — | **CST-030** | **Q-09/Q-15** | **INV-19/GRD-009; D8-12 critical** |
| IDX-033 | TBL-044 order_items | (order_id, position) | U | — | CST-031 | **Q-15** items, sorted | prefix `order_id` |
| IDX-034 | TBL-046 cancellation_requests | (order_id) | pU | `status='PENDING'` | CST-032 | one open review | D8-19 |
| IDX-035 | TBL-047 shipping_details | order_id | U | — | CST-033 | **QX-09** | |
| IDX-036 | TBL-048 shipping_snapshots | order_id | U | — | CST-034 | **QX-09** freeze | D8-14 |
| IDX-037 | TBL-050 quotations | custom_request_id | U | — | CST-035 | **Q-13** | |
| IDX-038 | TBL-050 | code | U | — | CST-035 | quotation lookup | |
| IDX-039 | TBL-051 quotation_versions | (quotation_id, version) | U | — | CST-036 | **Q-12** (backward) | CC-28 |
| IDX-040 | TBL-052 line_items | (quotation_version_id, position) | U | — | CST-037 | **Q-13** lines | |
| IDX-041 | TBL-053 acceptances | quotation_version_id | U | — | CST-038 | GRD-006 | D8-10 |
| IDX-042 | TBL-054 obligations | (order_id, kind) | pU | `status IN ('PENDING','SATISFIED')` | **CST-039** | **Q-17/Q-18** | **INV-04**; SUPERSEDED excluded |
| IDX-043 | TBL-056 provider_events | (provider_key, provider_event_ref) | U | — | **CST-040** | **Q-16** | **INV-07/GRD-012; D7-09/D8-01 critical** |
| IDX-044 | TBL-059 production_jobs | (order_id, approval_snapshot_id) | U | — | CST-041 | **Q-19**; prefix = job-by-order | D8-13 |
| IDX-045 | TBL-060 specifications | production_job_id | U | — | CST-042 | INV-03 | |
| IDX-046 | TBL-061 production_artifacts | (production_job_id, asset_id) | U | — | CST-043 | prefix serves artifacts-by-job | INV-21/22 |
| IDX-047 | TBL-029 design_version_assets | (design_version_id, asset_id) | U | — | CST-043 | prefix | |
| IDX-048 | TBL-026 design_session_assets | (session_id, asset_id) | U | — | CST-043 | prefix | |
| IDX-049 | TBL-036 design_template_assets | (design_template_id, asset_id) | U | — | CST-043 | prefix | |
| IDX-050 | TBL-065 gallery_entry_assets | (gallery_entry_id, asset_id) | U | — | CST-043 | **Q-04** prefix | |
| IDX-051 | TBL-040 custom_request_assets | (custom_request_id, asset_id, role) | U | — | CST-043 | prefix | |
| IDX-052 | TBL-066 content_pages | (page_type, slug) | U | — | CST-044 | **Q-05** | |
| IDX-053 | TBL-067 redirect_rules | source_path | U | — | CST-044 | **Q-07** | |
| IDX-054 | TBL-068 agreements | agreement_type | U | — | CST-044 | agreement container | |
| IDX-055 | TBL-069 agreement_versions | (agreement_id, version) | U | — | CST-045 | version reuse | |
| IDX-056 | TBL-069 | effective window per agreement | XCL | non-superseded/withdrawn | CST-046 | **QX-07** backstop | **conditional** — exclusion constraint; primary defense is the publish-tx guard; DB6 raw SQL |
| IDX-057 | TBL-070 notification_intents | intent_key | U | — | CST-047 | QX-03 dedup | CC-26 |
| IDX-058 | TBL-074 idempotency_records | (operation_namespace, scope_key) | U | — | **CST-048** | **Q-28** | **INV-19/24; D7-08/D8-25 critical** |
| IDX-059 | TBL-075 job_attempts | (job_kind, job_key, attempt_no) | U | — | CST-049 | attempt collision | |
| IDX-060 | TBL-076 policy_configurations | config_key | U | — | CST-050 | config read | |
| IDX-061 | TBL-077 config_versions | (policy_configuration_id, version) | U | — | CST-050 | | |
| IDX-062 | TBL-078 business_profiles | customer_id | U | — | CST-051 | 1–0..1 | dormant |
| IDX-063 | TBL-032 thread_colors | (approval_snapshot_id, position) | U | — | CST-051 | **Q-14** children | |
| IDX-064 | TBL-024 derivatives | storage_key | pU | `storage_key IS NOT NULL` | CST-017 family | uniqueness of derivative binaries | COL-TBL024-04 "UQ when set" |

**Count: 64 integrity-backed indexes**, all `required` except IDX-056
(`conditional`). Every `CST-*` with a uniqueness consequence is mapped in
[`DB5_CONSTRAINT_INDEX_MAP.md`](./DB5_CONSTRAINT_INDEX_MAP.md).

---

## 3. Performance indexes (IDX-065 … IDX-138)

Each row carries query IDs, selectivity, write cost and removal criteria.
Default removal criterion is ADR-DB5-004 R7 unless stated.

### 3.1 Catalog / Gallery / Content

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-065 | TBL-012 products | (category_id, display_order, id) | `status='PUBLISHED'` | Q-01, Q-06 | ≤100 rows; partial ≈ published subset | low — catalog edits are rare | required |
| IDX-066 | TBL-064 gallery_entries | (display_order, id) | `status='PUBLISHED'` | Q-04, Q-06 | small | low | required |
| IDX-067 | TBL-066 content_pages | (id) | `status='PUBLISHED' AND is_indexable` | Q-06 | small | low | recommended |
| IDX-108 | TBL-069 agreement_versions | (agreement_id, effective_from DESC, id DESC) | `status='PUBLISHED'` | **QX-07** | ≤ few/agreement | low (immutable once published) | required |
| IDX-068 | TBL-013 product_variants | (product_id, display_order) | — | Q-02 | ≤ dozens/product | low | required |
| IDX-069 | TBL-014 skus | (product_variant_id) | — | Q-02, Q-03 | few/variant | low | required |
| IDX-070 | TBL-015 product_sides | (product_id, display_order) | — | Q-02 | few/product | low | required |
| IDX-071 | TBL-016 embroidery_areas | (product_side_id, display_order) | — | Q-02 | few/side | low | required |

IDX-108 serves QX-07, the effective-agreement resolution read **inside** the
approval transaction (GRD-008). The partial predicate `status='PUBLISHED'`
structurally excludes DRAFT/SUPERSEDED/WITHDRAWN, so "not superseded or
withdrawn" needs no separate clause; `effective_from DESC` then makes the
newest effective version the first row scanned, and the query stops at the
first row with `effective_from <= now()`. `EFFECTIVE` remains derived, never
stored (COL-TBL069-03).

IDX-065 composite rationale: `category_id` is the equality predicate and
leads; `display_order` is the sort; `id` is the tie-breaker (ADR-DB5-001
R2). The partial predicate keeps DRAFT/ARCHIVED rows out entirely, which is
also the security scope for Q-01. The leading prefix `(category_id)` serves
category-scoped counts, so no separate FK index is needed.

### 3.2 Inventory / Asset

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-113 | TBL-020 soft_holds | (sku_stock_id, id) | `status='HELD'` | Q-03, **Q-32** | very small — active only | moderate (hold churn) | required |
| IDX-114 | TBL-021 reservations | (sku_stock_id, id) | `status='RESERVED'` | Q-03, **Q-32** | very small | moderate | required |
| IDX-115 | TBL-019 ledger | (sku_stock_id, id) | — | ledger replay | grows append-only | **append-heavy** — this is the table's only non-PK index | required |
| IDX-109 | TBL-020 | (expires_at, id) | `status='HELD'` | QX-10 | small | moderate | required |
| IDX-110 | TBL-021 | (expires_at, id) | `status='RESERVED' AND expires_at IS NOT NULL` | QX-10 | small | moderate | required |
| IDX-126 | TBL-021 | (order_id) | — | Q-15, cancel/consume | few/order | moderate | recommended |
| IDX-127 | TBL-020 | (custom_request_id) | — | request detail, release | few/request | moderate | recommended |
| IDX-086 | TBL-022 assets | (created_at, id) | `status IN ('UPLOADED','INSPECTING')` | Q-26 | tiny — drains to ACCEPTED | low | required |
| IDX-087 | TBL-024 derivatives | (created_at, id) | `status IN ('PENDING','PROCESSING')` | Q-26 | tiny — drains | low | required |
| IDX-099 | TBL-024 | (asset_id) | — | **Q-30** | few/asset | low | required |
| IDX-132 | TBL-023 inspections | (asset_id, inspected_at) | — | asset history | append | low | recommended |
| IDX-133 | TBL-022 | (deletion_requested_at, id) | `status='DELETION_PENDING'` | tombstone sweep | tiny | low | required |
| IDX-119 | TBL-022 | (uploaded_by_customer_id) | `uploaded_by_customer_id IS NOT NULL` | CC-27 merge | small | low | recommended |

IDX-113/114 are the two indexes that make Q-32 cheap **inside a held row
lock** — the lock on `sku_stocks` is held while these are read, so their
cost is lock-hold time on the hottest contended row in the system
(CC-20/23). They are `required` for that reason, not for raw speed.

IDX-099 exists because IDX-020's partial predicate (`status <> 'FAILED'`)
cannot be matched by Q-30's `status='READY'` filter — see
[`DB5_INDEX_COST_REDUNDANCY_REPORT.md`](./DB5_INDEX_COST_REDUNDANCY_REPORT.md) §4.

### 3.3 Design / Ordering

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-085 | TBL-025 sessions | (last_activity_at, id) | `status='ACTIVE'` | Q-25 | active subset | **high-write table** — autosave (CC-01); this is its only non-unique index | required |
| IDX-116 | TBL-030 design_reviews | (design_version_id, decided_at) | — | Q-10, CC-04 | few/version | low | recommended |
| IDX-136 | TBL-031 snapshots | (custom_request_id) | — | case timeline | few/request | low (immutable) | recommended |
| IDX-073 | TBL-037 requests | (status, created_at DESC, id DESC) | — | **Q-21**, Q-22 | ≤ hundreds; status ≈ 10 buckets | moderate | required |
| IDX-117 | TBL-037 | (customer_id) | — | CC-27 merge, customer view | few/customer | moderate | recommended |
| IDX-100 | TBL-042 request_transitions | (custom_request_id, id) | — | QX-01 | append | low | required |
| IDX-137 | TBL-041 moderation_notes | (custom_request_id, created_at) | — | request detail | append | low | recommended |
| IDX-074 | TBL-043 orders | (status, created_at, id) | — | **Q-17/Q-18**, Q-22 | ≤ hundreds; 11 states | moderate | required |
| IDX-118 | TBL-043 | (customer_id) | — | CC-27 merge | few/customer | moderate | recommended |
| IDX-104 | TBL-043 | (id) | `status='CANCELLING'` | **QX-02** | near-zero | low | required |
| IDX-101 | TBL-045 order_transitions | (order_id, id) | — | QX-01 | append | low | required |
| IDX-103 | TBL-045 | (order_id, id) | `event_kind='SAGA_STEP'` | **QX-02** | tiny | low | required |
| IDX-125 | TBL-049 fee_acks | (order_id) | — | order detail | few | low | recommended |

IDX-073 composite rationale: `status` is the equality predicate and leads;
`created_at DESC, id DESC` matches the sort exactly and in the same
direction, so the scan needs no sort node (ADR-DB5-001 R3). A narrower
`(status)` index would force a sort of the whole bucket; a wider index
adding `customer_id` would serve no catalogued query. The leading prefix
`(status)` also serves the Q-22 per-status counts, so the dashboard needs no
index of its own.

IDX-103 and IDX-104 are deliberately tiny partial indexes: `CANCELLING` is a
transient state that should hold near-zero rows, which is exactly what makes
the saga-resume scan (QX-02) cheap regardless of order-table growth.

### 3.4 Quotation / Payment

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-084 | TBL-051 versions | (valid_until, id) | `status='SENT'` | **Q-24**, CC-06 | small — SENT drains | low (frozen rows) | required |
| IDX-075 | TBL-054 obligations | (order_id) | — | **Q-09/Q-17/Q-18** | ≤ few/order | low | required |
| IDX-077 | TBL-055 attempts | (payment_obligation_id) | — | Q-16, CC-10 | few/obligation | moderate | required |
| IDX-076 | TBL-055 | (created_at DESC, id DESC) | `status IN ('FAILED','REQUIRES_REVIEW')` | **Q-23**, Q-16(d), Q-22 | tiny | moderate | required |
| IDX-078 | TBL-055 | (provider_key, provider_ref) | `provider_ref IS NOT NULL` | Q-16(a) | near-unique | moderate | recommended |
| IDX-079 | TBL-056 provider_events | (received_at DESC, id DESC) | — | **Q-16(b)** keyset | append-heavy | **high-write** | required |
| IDX-080 | TBL-056 | (payment_attempt_id) | `payment_attempt_id IS NOT NULL` | Q-16 join | few/attempt | high-write | required |
| IDX-081 | TBL-056 | (received_at, id) | `payment_attempt_id IS NULL` | **Q-16(c)/Q-23** unmatched | tiny | high-write | required |
| IDX-124 | TBL-057 reconciliations | (payment_attempt_id) | — | reconciliation history | append | low | recommended |
| IDX-122 | TBL-058 refunds | (order_id) | — | order detail | few | low | recommended |
| IDX-123 | TBL-058 | (created_at, id) | `status IN ('PENDING_REVIEW','APPROVED')` | refund queue | tiny | low | recommended |

`payment_provider_events` carries **four** indexes (PK, IDX-043, IDX-079,
IDX-080, IDX-081 — five including PK) on an append-heavy table, exceeding
the ≤3 budget. This is justified explicitly in the cost report §5: the table
is the financial evidence store, its write rate is bounded by real payment
volume (<100 orders/month → a few hundred callbacks/month), and each index
serves a distinct P0 reconciliation form. The budget exception is recorded,
not silently taken.

`payment_obligations` deliberately gets IDX-075 `(order_id)` *in addition to*
IDX-042's partial unique `(order_id, kind) WHERE status IN (...)`: the
partial excludes `SUPERSEDED`/`CANCELLED` rows, but Q-09 must show the full
obligation history for an order including superseded ones (ADR-DB3-003 r7
recalculation chain). Same-prefix coexistence is justified by different
predicates — the redundancy check is recorded.

### 3.5 Production / Shipping

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-082 | TBL-059 jobs | (created_at, id) | `status IN ('PLANNED','STARTED')` | **Q-19**, Q-22 | small — active only | low | required |
| IDX-102 | TBL-063 job_transitions | (production_job_id, id) | — | QX-01 | append | low | required |
| IDX-138 | TBL-062 notes | (production_job_id, created_at) | — | job detail | append | low | recommended |

Rejected here: `production_jobs (order_id)` — IDX-044's leading prefix
(CST-041) already serves it (IDX-R04).
Shipping needs no performance index: both access paths are the unique
constraints IDX-035/IDX-036, and `shipping_fee_acknowledgements` uses IDX-125.

### 3.6 Identity / Customer

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-120 | TBL-003 sessions | (admin_account_id) | — | revoke-all | few | low | recommended |
| IDX-121 | TBL-003 | (expires_at, id) | `status='ACTIVE'` | session sweep | small | low | required |
| IDX-134 | TBL-005 contacts | (customer_id) | — | customer detail, CC-27 | few/customer | low | required |
| IDX-130 | TBL-006 challenges | (contact_point_id) | `contact_point_id IS NOT NULL` | REL-006 lookup | few | moderate (temp) | recommended |
| IDX-112 | TBL-006 | (expires_at, id) | `status='ISSUED'` | challenge expiry | tiny | moderate | required |
| IDX-111 | TBL-007 attempts | (challenge_id, attempted_at) | — | **QX-11** GRD-026 | few/challenge | **append-heavy** — only non-PK index | required |
| IDX-105 | TBL-008 grants | (expires_at, id) | `status='ACTIVE'` | QX-06 | small | low | required |
| IDX-106 | TBL-008 | (custom_request_id) | — | grants for a request; revoke on merge | few | low | required |
| IDX-107 | TBL-008 | (customer_id) | — | CC-27 merge revoke | few | low | required |
| IDX-129 | TBL-004 customers | (merged_into_customer_id) | `merged_into_customer_id IS NOT NULL` | tombstone follow | tiny | low | recommended |
| IDX-135 | TBL-010 merge_events | (merge_case_id, id) | — | merge evidence | append | low | recommended |

IDX-107 is required despite IDX-008 leading with `customer_id`: IDX-008 is
partial (`status='ACTIVE'`) and the merge path must find **all** grants of
the loser customer, including expired and revoked ones, to repoint or
revoke them (CC-27). Relying on the partial index would silently skip
inactive grants — a correctness gap, not a performance one.

### 3.7 Notification / Audit / Platform

| IDX | Table | Keys | Predicate | Queries | Sel. / rows | Write cost | Status |
|---|---|---|---|---|---|---|---|
| IDX-091 | TBL-070 intents | (created_at, id) | `status IN ('PENDING','PROCESSING')` | **QX-03** | tiny — drains | moderate | required |
| IDX-092 | TBL-071 attempts | (intent_id, attempted_at) | — | QX-03 counts | append | **append-heavy** — only non-PK index | required |
| IDX-095 | TBL-072 audit | (target_kind, target_id, occurred_at DESC, id DESC) | — | **Q-29(a)** | selective by target | **append-heavy** | required |
| IDX-096 | TBL-072 | (occurred_at DESC, id DESC) | — | Q-29(c) | range | append-heavy | required |
| IDX-097 | TBL-072 | (correlation_id) | — | Q-29(d) | near-unique per request | append-heavy | recommended |
| IDX-098 | TBL-072 | (admin_id, occurred_at DESC, id DESC) | `admin_id IS NOT NULL` | Q-29(b) | small | append-heavy | recommended |
| IDX-088 | TBL-073 outbox | (next_attempt_at NULLS FIRST, id) | `status='PENDING'` | **Q-27/QX-04** | tiny — drains | **highest-write** | required |
| IDX-090 | TBL-073 | (dispatched_at, id) | `status='DISPATCHED'` | outbox cleanup | grows until TTL sweep | highest-write | required |
| IDX-093 | TBL-074 idempotency | (expires_at, id) | — | QX-05 TTL | whole table | **high-write** | required |
| IDX-094 | TBL-074 | (claimed_at, id) | `status='IN_PROGRESS'` | QX-05 stuck | tiny | high-write | required |
| IDX-131 | TBL-075 job_attempts | (finished_at, id) | `is_dead_letter` | dead-letter view | tiny | low | recommended |

`audit_events` carries **five** indexes on an append-only table, exceeding
the ≤3 budget. Justification (cost report §5): it is the compliance record
with four genuinely distinct catalogued lookup forms (Q-29 a–d) and no
possibility of joining to a parent, because REL-103 is polymorphic with no
FK. IDX-097 and IDX-098 are the two flagged for first removal if
`idx_scan` shows them unused (ADR-DB5-004 R7).

IDX-088's `NULLS FIRST` is load-bearing, not cosmetic: `next_attempt_at` is
NULL for never-deferred events, and the default `NULLS LAST` on an ascending
key would place every fresh event at the far end of the index — the opposite
of FIFO (ADR-DB5-003 R3).

---

## 4. Composite-index design rules

Every composite index in §3 satisfies all of these; the table records the
per-index reasoning where it is not mechanical.

1. **Equality predicates lead.** `IDX-073 (status, ...)`, `IDX-065
   (category_id, ...)`, `IDX-095 (target_kind, target_id, ...)`.
2. **Range/sort columns follow equality.** `IDX-084 (valid_until, id)` under
   a `status='SENT'` *predicate* — the equality moved into the partial
   predicate, which is strictly better than a key column because it also
   shrinks the index.
3. **Sort alignment.** Sort keys appear in the index in the same order and
   the same direction as the query's `ORDER BY`; mixed directions are never
   used (ADR-DB5-001 R3).
4. **Tie-breaker.** Every listing index ends in `id`.
5. **Leading-prefix utility** is recorded so no redundant narrower index is
   created: IDX-044's `(order_id)` prefix, IDX-042's `(order_id)` prefix,
   IDX-033's `(order_id)` prefix, IDX-065's `(category_id)` prefix.
6. **Security predicates are in the index**, not applied after the fetch —
   `status='PUBLISHED'` on IDX-065/066/067.
7. **Null handling** is explicit where the key is nullable: IDX-088
   (`NULLS FIRST`), IDX-110/078/080/098/129/130/119 (`IS NOT NULL` partial
   predicates that remove the question).
8. **INCLUDE**: **no index in this catalog declares INCLUDE columns.** None
   is justified without measurement; they are a DB9/DB10 tuning outcome
   (ADR-DB5-004 R4). Candidates, if heap fetches ever dominate: IDX-073
   (+`code`), IDX-065 (+`name`, `base_price_amount`).
9. **Why not narrower / why not wider** is recorded per index above.
10. **Partial-predicate relationship**: a partial index is preferred over a
    leading equality key whenever the predicate is a fixed lifecycle state,
    because it shrinks the index *and* excludes rows permanently.

---

## 5. Rejected indexes

| ID | Proposed | Rejected because |
|---|---|---|
| IDX-R01 | `sku_stocks` low-stock partial | column-vs-column predicate; ≤ dozens of rows; would tax the hottest inventory write path (Q-20) |
| IDX-R02 | `outbox_events (event_type)` | P3 consumer that does not exist, on the highest-write table (Q-33) |
| IDX-R03 | `customer_merge_cases (status, created_at)` | handful of rows for the product's lifetime (QX-08) |
| IDX-R04 | `production_jobs (order_id)` | IDX-044 leading prefix covers it |
| IDX-R05 | `redirect_rules (is_active)` | unique probe returns one row; flag check is free |
| IDX-R06 | any FK index on `order_items (approval_snapshot_id)` | items are read via `order_id`; reverse lookup is not a catalogued query |
| IDX-R07 | `product_media (product_id, display_order)` | IDX-015 prefix locates the rows; sorting ≤ dozens is free |
| IDX-R08 | `gallery_entry_assets (gallery_entry_id, display_order)` | same reasoning as R07 |
| IDX-R09 | `lower()` expression indexes on email/slug | values are stored pre-normalized (ADR-DB5-002 R3) |
| IDX-R10 | any GIN index on any of the 9 JSONB columns | no catalogued query filters inside a JSONB payload (§6) |
| IDX-R11 | `products (category_id)` plain (all statuses) | admin catalog listing scans ≤100 rows |
| IDX-R12 | `design_sessions (submitted_request_id)` | rare provenance lookup on a high-write table |
| IDX-R13 | `orders (accepted_quotation_version_id)` | reverse lookup is not catalogued |
| IDX-R14 | `notification_intents (recipient_contact_point_id)` | not a catalogued query |
| IDX-R15 | `gallery_entries (linked_product_id)` | tiny table |

---

## 6. Non-B-tree methods

**No GIN, GiST, BRIN, trigram or full-text index is defined by DB5.**

- **GIN/JSONB** — all 9 JSONB payloads are opaque by design (ADR-DB4-004);
  every invariant fact is extracted to a relational column. See
  [`DB5_JSONB_INDEX_REVIEW.md`](./DB5_JSONB_INDEX_REVIEW.md).
- **Trigram / full-text** — no MVP query needs substring or fuzzy search;
  extensions are non-baseline (ADR-DB5-002 R6/R7).
- **GiST/exclusion** — one candidate only: IDX-056 (CST-046, agreement
  effective window). It is `conditional`: the publish-transaction guard is
  the primary defense, and DB6 would author it as raw SQL.
- **BRIN** — considered for `audit_events`/`inventory_ledger_entries`
  (naturally time-correlated append-only tables). **Rejected at current
  scale:** BRIN pays off in the hundreds-of-millions-of-rows range; below
  that a B-tree is both faster and more flexible. Recorded as a future
  activation threshold in the cost report, not as a current index.

---

## 7. Roll-up

| Category | Count |
|---|---|
| Integrity-backed (`INT`) | 64 (63 required + 1 conditional) |
| Performance — required | 47 |
| Performance — recommended | 23 |
| Performance — conditional | 0 |
| **Total defined `IDX-*`** | **134** |
| Rejected, recorded (`IDX-R*`) | 15 |

ID range is `IDX-001` … `IDX-138`; **`IDX-072`, `IDX-083`, `IDX-089` and
`IDX-128` are deliberately unassigned** — they were allocated to candidates
that the redundancy review rejected before this catalog was finalized
(covered by IDX-015 prefix, IDX-044 prefix, the dead-letter split, and
IDX-R11 respectively). The IDs are retired rather than reused so that
`IDX-*` references stay stable across DB6–DB10.

Non-B-tree indexes: 0 (one conditional exclusion candidate).
JSONB indexes: 0. Expression indexes: 0. INCLUDE columns: 0.
Extensions required: **none**.
