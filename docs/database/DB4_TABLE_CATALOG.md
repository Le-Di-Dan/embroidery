# DB4 — Logical Table Catalog

**Checkpoint:** DB4 — Logical Relational Schema
**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · **Branch:** `production`
**Nature:** Logical only — no SQL/DDL/Drizzle/migration/index. Naming per
ADR-DB1-006 (snake_case, plural). Columns:
[`DB4_COLUMN_DICTIONARY.md`](./DB4_COLUMN_DICTIONARY.md) · constraints:
[`DB4_KEYS_AND_CONSTRAINTS.md`](./DB4_KEYS_AND_CONSTRAINTS.md) ·
relationships: [`DB4_RELATIONSHIP_AND_FK_MODEL.md`](./DB4_RELATIONSHIP_AND_FK_MODEL.md).

## 1. Legend

- **Cat:** `root` mutable root/header · `entity` child entity · `ver`
  immutable version · `snap` immutable snapshot · `append` append-only ·
  `temp` temporary · `oper` operational (infrastructure) · `assoc`
  association · `proc` process/workflow record. No table is a persisted
  derived projection (see §3).
- **PK:** `uuid7` = UUIDv7 app-generated `id` · `bigint` = identity `id`
  (ADR-DB1-007 categories 1/2).
- **Mut:** mutable · header (pointer/status only) · immutable ·
  immutable-once-<event> · append · temp · column-scoped (see constraints).
- **Del:** delete/archive category per ADR-DB1-011 (`archive` ·
  `hard-ttl` hard delete after TTL · `retain` immutable retain ·
  `anonymize` field-level scrub · `tombstone` two-phase).
- **Class/Ret:** data classification / retention class per DB2.
- Every table implicitly has `created_at` (NOT NULL) and, when mutable,
  `updated_at` (ADR-DB1-006); listed in the column dictionary.

## 2. Catalog

### Identity (CTX-IDN)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-001 | `admin_accounts` | AGG-01 | one admin operator identity | root | uuid7 | email (unique) | LC-01 account | mutable | retain | sec/comm | REQ-IDN-001/002 |
| TBL-002 | `admin_credentials` | AGG-01 | one credential reference for an admin account (provider-abstract) | entity | uuid7 | — | — | mutable | retain | sec/comm | REQ-IDN-002; DEC-29 open |
| TBL-003 | `admin_sessions` | AGG-01 | one authenticated admin session | entity | uuid7 | token hash (unique) | LC-01 session | mutable | hard-ttl | sec/oper | REQ-IDN-003 |

### Customer (CTX-CUS)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-004 | `customers` | AGG-02 | one verified customer identity (created only at verified submission, ADR-DB2-001) | root | uuid7 | — | guest→verified implicit | mutable | anonymize | cpriv/comm | REQ-CUST-001..003 |
| TBL-078 | `business_profiles` | AGG-02 | the dormant B2B profile of one customer | entity | uuid7 | — | — | mutable | anonymize | cpriv/comm | REQ-CUST-003 (readiness) |
| TBL-005 | `customer_contact_points` | AGG-02 | one email/phone contact of a customer (normalized; the verified **link** is the unique thing) | entity | uuid7 | (kind, normalized value) active-verified partial | — | mutable | anonymize | cpriv/comm | REQ-CUST-001/002, REQ-VERIF-001; ADR-DB2-001 r5/6 |
| TBL-006 | `contact_verification_challenges` | AGG-03 | one OTP challenge for one contact point + purpose | temp | uuid7 | one open per (contact, purpose) partial | LC-02 | mutable | hard-ttl | sec/trans | REQ-VERIF-001, INV-19 |
| TBL-007 | `contact_verification_attempts` | AGG-03 | one code-entry attempt against a challenge | append | bigint | — | — | append | hard-ttl | sec/trans | REQ-VERIF-001 |
| TBL-008 | `secure_access_grants` | AGG-04 | one request-access grant (hashed token) for one (customer, request) | root | uuid7 | token hash (unique) | LC-03 | mutable | retain (evidence) | sec/oper | REQ-GRANT-001..004, INV-08; ADR-DB3-004 |
| TBL-009 | `customer_merge_cases` | AGG-02 (workflow) | one admin merge decision (survivor ← loser) | proc | uuid7 | one open per pair partial | merge process | mutable | retain | int/comm | ADR-DB2-001 r8; CC-27 |
| TBL-010 | `customer_merge_events` | AGG-02 (workflow) | one executed merge step (transfer evidence) | append | bigint | — | — | append | retain | int/audit-like (comm) | DB3 merge spec §4.5 |

### Catalog (CTX-CAT)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-011 | `categories` | AGG-05 | one product category (SEO-capable) | root | uuid7 | slug (unique) | pub-state | mutable | archive | pub/comm | REQ-CAT-002 |
| TBL-012 | `products` | AGG-06 | one store product | root | uuid7 | slug (unique) | LC-04 | mutable | archive | pub(+fin)/comm | REQ-CAT-001/003..006 |
| TBL-013 | `product_variants` | AGG-06 | one color/size variant of a product | entity | uuid7 | — | — | mutable | archive w/ product | pub/comm | REQ-VAR-001 |
| TBL-014 | `skus` | AGG-06 | one sellable SKU **definition** (stock lives in Inventory) | entity | uuid7 | sku code (unique) | LC-05 definition side | mutable | archive | pub/comm | REQ-VAR-001/002 |
| TBL-015 | `product_sides` | AGG-06 | one printable/embroiderable side of a product (background image + mapping) | entity | uuid7 | — | — | mutable | archive w/ product | pub/comm | REQ-SIDE-001/003 |
| TBL-016 | `embroidery_areas` | AGG-06 | one allowed embroidery region on a side | entity | uuid7 | — | — | mutable | archive w/ product | pub/comm | REQ-SIDE-002 |
| TBL-017 | `product_media` | AGG-06 | one product↔asset media association | assoc | uuid7 | (product, asset, role) unique | — | mutable | archive w/ product | pub/comm | REQ-MEDIA-001; ADR-DB4-003 |

### Inventory (CTX-INV)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-018 | `sku_stocks` | AGG-07 | the stock record (lock anchor) of one SKU: on-hand quantity + threshold | root | uuid7 | sku_id (unique 1–1) | LC-05 stock side | mutable | retain | int/comm | REQ-INV-001/006, INV-18 |
| TBL-019 | `inventory_ledger_entries` | AGG-07 | one stock movement with reason/actor (source of truth for history) | append | bigint | — | — | append | retain | int/comm | REQ-INV-002/005, INV-14 |
| TBL-020 | `inventory_soft_holds` | AGG-07 | one optional pre-deposit soft hold for a request | entity | uuid7 | (request, sku) active partial | LC-17 hold | mutable | retain (terminal states) | int/oper | REQ-INV-003; ADR-DB1-018 |
| TBL-021 | `inventory_reservations` | AGG-07 | one official reservation of quantity for an order | entity | uuid7 | (order, sku) active partial | LC-17 reservation | mutable | retain | int/comm | REQ-INV-003/004/007, INV-05 |

### Asset (CTX-AST)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-022 | `assets` | AGG-08 | metadata + internal object-storage reference of one uploaded/authored binary | root | uuid7 | storage key (unique) | LC-06 asset | mutable | tombstone | mixed/per-kind | REQ-ASSET-001..007, INV-09/10 |
| TBL-023 | `asset_inspections` | AGG-08 | one validation-pipeline outcome for an asset | append | bigint | — | — | append | hard-ttl (oper) | sec/oper | REQ-ASSET-002 |
| TBL-024 | `asset_derivatives` | AGG-08 | one generated derivative (watermarked preview, mockup, normalized copy) | entity | uuid7 | (asset, kind) unique-active | LC-06 derivative | mutable | tombstone w/ parent | mixed/per-parent | REQ-ASSET-003, INV-22 |

### Design (CTX-DSN)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-025 | `design_sessions` | AGG-09 | one temporary guest/customer editor session (working document + autosave marker) | temp | uuid7 | session secret hash (unique) | LC-07 | temp | hard-ttl | cpriv/trans | REQ-SESS-001..005 |
| TBL-026 | `design_session_assets` | AGG-09 | one session↔uploaded-asset association | assoc | uuid7 | (session, asset) unique | — | mutable | hard-ttl w/ session | cpriv/trans | REQ-SESS-003; ADR-DB4-003 |
| TBL-027 | `design_cases` | AGG-10 | the design thread (case header) of one custom request | root | uuid7 | custom_request_id (unique 1–1) | header pointers | header | retain | cpriv/comm | REQ-DVER-001..006 |
| TBL-028 | `design_versions` | AGG-10 | one formal design version (frozen document + hash once sent) | ver | uuid7 | (case, version) unique | LC-08 | immutable-once-sent | retain | cpriv/comm | REQ-DVER-001..006, INV-01/16/17/32 |
| TBL-029 | `design_version_assets` | AGG-10 | one version↔asset association (uploads frozen into the version) | assoc | uuid7 | (version, asset) unique | — | immutable w/ version | retain | cpriv/comm | ADR-DB4-003 |
| TBL-030 | `design_reviews` | AGG-10 | one customer review decision (approve / request revision) | append | bigint | one per (version, outcome-decision) — first-decision-wins | LC-09 | append | retain | cpriv/comm | REQ-REVIEW-001/002 |
| TBL-031 | `approval_snapshots` | AGG-11 | the immutable approval evidence of one design version | snap | uuid7 | design_version_id (unique) | LC-10 (exists-or-not) | immutable | retain | cpriv+fin/comm | REQ-APPR-001..003, INV-01/03 |
| TBL-032 | `approval_snapshot_thread_colors` | AGG-11 | one thread color captured in an approval snapshot | snap (child) | bigint | (snapshot, position) unique | — | immutable | retain | cpriv/comm | REQ-APPR-001 (`06 §9`) |
| TBL-033 | `approval_snapshot_agreement_acceptances` | AGG-11 | acceptance evidence of one agreement type/version inside an approval | snap (child) | bigint | (snapshot, agreement_version) unique | — | immutable | retain | cpriv/comm | GRD-008; GAP-09 |
| TBL-034 | `design_templates` | AGG-12 | one store-authored design template (header + scope + publication) | root | uuid7 | slug (unique) | template pub-state | header | archive | int(src)+pub(listing)/comm | REQ-TMPL-001/002; GAP-08 |
| TBL-035 | `design_template_versions` | AGG-12 | one published (or draft) template document version | ver | uuid7 | (template, version) unique | — | immutable-once-published | retain | int/comm | GAP-08 decision |
| TBL-036 | `design_template_assets` | AGG-12 | one template↔private-artwork-asset association | assoc | uuid7 | (template, asset) unique | — | mutable | archive w/ template | prod/comm | REQ-TMPL-002; ADR-DB4-003 |

### Ordering (CTX-ORD)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-037 | `custom_requests` | AGG-13 | one customer case (request) | root | uuid7 | code (unique) | LC-11 | mutable | retain + PII via customer | cpriv/comm | REQ-REQ-001..005 |
| TBL-038 | `customer_owned_products` | AGG-13 | the customer-supplied product of one request (never a SKU, INV-13) | entity | uuid7 | custom_request_id (unique 0..1) | — | mutable | retain | cpriv/comm | REQ-COP-001/002, INV-13 |
| TBL-039 | `custom_request_quantity_breakdowns` | AGG-13 | one (variant/size → quantity) line of a request's Quantity Breakdown VO. **Not a resurrected Request Item aggregate** (CON-075 stays rejected): storage child of the request, mutable until quoted, no own lifecycle/commercial fields | entity | uuid7 | (request, variant, size) unique | — | mutable-until-quoted | retain | cpriv/comm | REQ-REQ-001, CON-074 |
| TBL-040 | `custom_request_assets` | AGG-13 | one request↔asset association (COP image / attachment) | assoc | uuid7 | (request, asset, role) unique | — | mutable | retain | cpriv/comm | ADR-DB4-003 |
| TBL-041 | `request_moderation_notes` | AGG-13 | one moderation action note (spam/reject/pause/clarify) | append | bigint | — | — | append | retain | int/comm | REQ-REQ-003 |
| TBL-042 | `custom_request_transitions` | AGG-13 | one request state transition (actor/reason/correlation) | append | bigint | — | LC-11 history | append | retain | int/comm | ADR-DB4-002 Tier A |
| TBL-043 | `orders` | AGG-15 | one confirmed order (fulfillment machine + frozen commercial refs) | root | uuid7 | code (unique); custom_request_id (unique) | LC-14 | mutable | retain | fin+cpriv/comm | REQ-ORD-001..005, INV-19 |
| TBL-044 | `order_items` | AGG-15 | one frozen commercial line (SKU or COP subject) of an order | snap | uuid7 | — | — | immutable | retain | fin/comm | REQ-ORD-002, INV-12 |
| TBL-045 | `order_transitions` | AGG-15 | one order state transition / delivery event / saga step (CON-081) | append | bigint | — | LC-14/19/21 history | append | retain | int/comm | REQ-ORD-003, REQ-SHIP-004, INV-14; ADR-DB4-002 |
| TBL-046 | `order_cancellation_requests` | AGG-15 (workflow) | one manual-review cancellation request (stage ≥ S5 or admin record) | proc | uuid7 | one open per order partial | review process | mutable | retain | int/comm | ADR-DB3-002 mech. 2 |
| TBL-047 | `shipping_details` | AGG-15 | the admin-editable shipping preparation record of one order | entity | uuid7 | order_id (unique 0..1) | LC-19 EDITABLE→FROZEN | mutable-until-frozen | anonymize (PII) | cpriv+fin/comm | REQ-SHIP-001..003; ADR-DB2-002 |
| TBL-048 | `shipping_snapshots` | AGG-15 | the immutable dispatch-time freeze of one order's shipping data | snap | uuid7 | order_id (unique) | — | immutable | retain + anonymize per privacy rule | cpriv+fin/comm | REQ-SHIP-004, GRD-017 |
| TBL-049 | `shipping_fee_acknowledgements` | AGG-15 | one customer acknowledgement of a post-order shipping-fee change | append | bigint | — | — | append | retain | fin/comm | DB3 shipping spec §1.2 |

### Quotation (CTX-QUO)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-050 | `quotations` | AGG-14 | the quotation header (current-version pointer + state) of one request | root | uuid7 | code (unique); custom_request_id (unique) | LC-12 | header | retain | fin/comm | REQ-QUOT-001..006 |
| TBL-051 | `quotation_versions` | AGG-14 | one immutable-once-sent quotation version (full pricing snapshot incl. admin-entered stitch count — GAP-10) | ver | uuid7 | (quotation, version) unique | LC-13 | immutable-once-sent | retain | fin/comm | REQ-QUOT-002/004, INV-02/12; GAP-10 |
| TBL-052 | `quotation_line_items` | AGG-14 | one frozen pricing line inside a quotation version | ver (child) | uuid7 | (version, position) unique | — | immutable w/ version | retain | fin/comm | REQ-QUOT-001 |
| TBL-053 | `quotation_acceptances` | AGG-14 | one secure-flow acceptance evidence of one quotation version | append | bigint | quotation_version_id (unique) | — | append | retain | fin/comm | REQ-QUOT-006; GRD-006 |

### Payment (CTX-PAY)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-054 | `payment_obligations` | AGG-16 | one independent payment obligation (DEPOSIT or REMAINING) of an order | root | uuid7 | (order, kind) active partial | LC-15 | mutable | retain | fin/comm | REQ-PAY-001..003, INV-04 |
| TBL-055 | `payment_attempts` | AGG-16 | one payment attempt against one obligation | entity | uuid7 | — | LC-16 | mutable | retain | fin/comm | REQ-PAY-004..006, INV-07/15 |
| TBL-056 | `payment_provider_events` | PAY (rec) | one verified/received provider callback event (redacted evidence) | append | bigint | (provider, provider event ref) unique | — | append | retain | fin+sec/comm | REQ-PAY-005/006, INV-07 |
| TBL-057 | `payment_reconciliations` | PAY (rec) | one manual reconciliation / recalculation action record | append | bigint | — | — | append | retain | fin/comm | REQ-PAY-008; ADR-DB3-003 r7 |
| TBL-058 | `refunds` | PAY (rec) | one reviewed refund record (manual execution evidence) | proc | uuid7 | — | LC-20 | mutable (state) + immutable amounts | retain | fin/comm | REQ-PAY-009; ADR-DB3-002 |

### Production (CTX-PRD)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-059 | `production_jobs` | AGG-17 | one production job against exactly one approval snapshot | root | uuid7 | (order, approval snapshot) unique | LC-18 | mutable | retain | prod/comm | REQ-PROD-001/002/004, INV-03/06 |
| TBL-060 | `production_specifications` | AGG-17 | the immutable specification frozen from the approval at job creation | snap | uuid7 | production_job_id (unique) | — | immutable | retain | prod/comm | REQ-PROD-001, INV-03 |
| TBL-061 | `production_artifacts` | AGG-17 | one job↔asset association (digitized/machine file, photo; internal, unwatermarked) | assoc | uuid7 | (job, asset) unique | — | mutable | retain | prod/comm | REQ-PROD-003, INV-21/22; ADR-DB4-003 |
| TBL-062 | `production_notes` | AGG-17 | one production note | append | bigint | — | — | append | retain | prod/comm | REQ-PROD-004 |
| TBL-063 | `production_job_transitions` | AGG-17 | one job state transition (incl. rework cancellation) | append | bigint | — | LC-18 history | append | retain | int/comm | ADR-DB4-002 Tier A |

### Gallery & Content (CTX-GAL / CTX-CNT)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-064 | `gallery_entries` | AGG-18 | one published showcase entry (SEO text + ordering) | root | uuid7 | slug (unique) | pub-state | mutable | archive | pub/comm | REQ-GAL-001/002 |
| TBL-065 | `gallery_entry_assets` | AGG-18 | one gallery↔asset association (public derivatives only) | assoc | uuid7 | (entry, asset) unique | — | mutable | archive w/ entry | pub/comm | REQ-GAL-001; ADR-DB4-003 |
| TBL-066 | `content_pages` | AGG-19 | one SEO/content page (home/service/FAQ/local/landing/policy) | root | uuid7 | (page type, slug) unique | pub-state | mutable | archive | pub/comm | REQ-SEO-001..003 |
| TBL-067 | `redirect_rules` | AGG-20 | one path→target redirect | root | uuid7 | source path (unique) | — | mutable | archive | pub/comm | REQ-SEO-004 |
| TBL-068 | `agreements` | AGG-21 | the agreement container of one policy type | root | uuid7 | agreement type (unique) | header | header | retain | pub/comm | GAP-09 |
| TBL-069 | `agreement_versions` | AGG-21 | one immutable-once-published agreement version (content + hash) | ver | uuid7 | (agreement, version) unique | Agreement Version LC | immutable-once-published | retain | pub/comm | GAP-09; GRD-008 |

### Notification, Audit & Platform (CTX-NTF / CTX-AUD / CTX-PLT)

| TBL | Table | Agg | One row = | Cat | PK | Business key | State owner | Mut | Del | Class/Ret | REQ / INV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TBL-070 | `notification_intents` | AGG-22 | one logical message decision (template ref + redacted params; never a body) | root | uuid7 | intent key (unique) | Intent LC | mutable (status) | hard-ttl (oper) | cpriv(min)/oper | REQ-NOTIF-001/002; ADR-DB2-003 |
| TBL-071 | `notification_delivery_attempts` | AGG-22 | one channel delivery try result | append | bigint | — | — | append | hard-ttl (oper) | int/oper | REQ-NOTIF-001 |
| TBL-072 | `audit_events` | AUD (rec) | one audited business action (actor/action/target/reason/summary refs) | append | bigint | — | — | append | retain (audit class) | int/audit | REQ-AUDIT-001..003, INV-14 |
| TBL-073 | `outbox_events` | PLT (rec) | one transactional outbox event (immutable payload + bounded dispatch metadata) | append + column-scoped | bigint | — | LC-22 | column-scoped | hard-ttl (processed) | int/trans | REQ-OUTBOX-001, INV-23 |
| TBL-074 | `idempotency_records` | PLT (rec) | one idempotent-operation claim/result per (namespace, scope key) | oper | bigint | (namespace, scope key) unique | LC-23 | mutable (state) | hard-ttl | int/trans | REQ-IDEM-001/002, INV-19/24 |
| TBL-075 | `background_job_attempts` | PLT (rec) | one worker job attempt outcome (terminal failure = dead-letter row) | append | bigint | — | attempt outcome values | append | hard-ttl (oper) | int/oper | REQ-OUTBOX-002 |
| TBL-076 | `policy_configurations` | AGG-23 | one named business policy configuration key | root | uuid7 | config key (unique) | header | header | retain | int/comm | CON-144; ADR-DB1-011/017/018 |
| TBL-077 | `policy_configuration_versions` | AGG-23 | one immutable versioned value of a configuration key | ver | uuid7 | (config, version) unique | — | immutable | retain | int/comm | CON-144 |

## 3. Persisted-projection register

**No derived read model is persisted as a table.** Explicitly considered:

| Candidate | Decision | Rationale |
|---|---|---|
| Inventory balance (available/held/sold, CON-034) | **Not a separate table.** `sku_stocks.quantity_on_hand` is the authoritative operational counter (root row, lock anchor for GRD-014); `available = quantity_on_hand − Σ active holds/reservations` is computed in-transaction; the ledger (TBL-019) is the rebuild source of truth. | Only projection candidate flagged by DB3; at <100 orders/month the computed form is trivially cheap and removes staleness risk. Owner: INV; rebuild: replay ledger; staleness: none (computed). DB5 may still add covering indexes. |
| CON-170..176 dashboards/views | Query compositions only (ADR-DB1-009 rule 14) | never tables |
| SKU availability (LC-05) | computed (balance + `products`/`skus` manual override flag) | DB3 locked as derived |

## 4. Duplicate-purpose check

78 tables; each maps to exactly one DB2 concept family (see
[`DB4_COMPLETENESS_MATRIX.md`](./DB4_COMPLETENESS_MATRIX.md)); no two tables
share a row meaning. Merged/absorbed structures with canonical replacements:
reservation transition history → `inventory_ledger_entries` + state
timestamps (ADR-DB4-002 Tier B); payment/quotation/design transition history
→ structural records (Tier B); payment allocations (CON-106) → the
`payment_attempts.payment_obligation_id` column (an attempt targets exactly
one obligation in MVP; an allocation table would be additive later);
delivery events (CON-081 scope) → `order_transitions`; saga-state table →
not created (optional per DB3; resume derives from `order_transitions` step
events + aggregate states).
