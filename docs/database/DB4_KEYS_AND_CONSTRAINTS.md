# DB4 — Keys, Uniqueness & Constraint Catalog

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Nature:** Logical constraint semantics — no SQL/DDL. Naming at DB6 follows
ADR-DB1-006 patterns (`pk_/fk_/uq_/ck_/tg_`). FKs are cataloged as
relationships in [`DB4_RELATIONSHIP_AND_FK_MODEL.md`](./DB4_RELATIONSHIP_AND_FK_MODEL.md)
(REL-*); this catalog lists PK/unique/check/immutability/append-only/
nullability constraints plus TX/App-only rules that DB4 explicitly does NOT
push into the schema.

## 1. Legend

- **Type:** `PK` · `UQ` unique · `pUQ` partial/conditional unique · `CK`
  check · `IMM` immutability (reject-mutation trigger candidate) · `APP`
  append-only (trigger candidate) · `NN` nullability rule · `XCL` exclusion
  candidate · `TRG` other trigger candidate · `TX` transaction/application
  only (no DB mechanism).
- **DB?:** yes = enforced by the database at DB6 · dir = DB trigger/priv
  direction (hand-authored SQL at DB6) · no = TX/App primary (DB7 tests the
  representation, DB8 the race).
- **Fail =** what a violation means in business terms.
- All DB7/DB8 references use `D7-xx`/`D8-xx` from
  [`DB3_TEST_HANDOFF.md`](./DB3_TEST_HANDOFF.md); implementation checkpoint
  is DB6 unless noted.

## 2. Primary keys (CST-001 · blanket)

**CST-001 (PK, all 78 tables):** every table has PK `id` — `uuid` (UUIDv7,
app-generated) for business tables, `bigint` identity for append-only/
operational records, per the PK column in
[`DB4_TABLE_CATALOG.md`](./DB4_TABLE_CATALOG.md). DB enforced; D7 PK tests.

## 3. Uniqueness

| CST | Type | Table | Columns / concept | INV/GRD | Fail = | DB? | Defense | Test |
|---|---|---|---|---|---|---|---|---|
| CST-002 | UQ | admin_accounts | email | REQ-IDN-002 | duplicate admin login identity | yes | app validation | D7-13 |
| CST-003 | pUQ | admin_accounts | (status) where ACTIVE — at most one ACTIVE admin | REQ-IDN-001 | two active admins | yes | replacement procedure tx | D7-13 |
| CST-004 | UQ | admin_sessions | token_hash | REQ-IDN-003 | session token collision/reuse | yes | — | D7-12 |
| CST-005 | pUQ | customer_contact_points | (contact_kind, normalized_value) where verified & not deactivated — one active verified link | ADR-DB2-001 r6 | one contact linked to two customers | yes | GRD-001 link tx (CC-17 lock) | D7-13/D8-21 |
| CST-006 | pUQ | customer_contact_points | (customer_id) where is_primary | ADR-DB2-001 r7 | two primary contacts | yes | app | D7-13 |
| CST-007 | pUQ | contact_verification_challenges | (contact target, purpose) where status=ISSUED — one open challenge | LC-02 idem | parallel OTP challenges | yes | issue tx reuses open row | D7-13/D8-21 |
| CST-008 | UQ | secure_access_grants | token_hash | REQ-GRANT-002 | token collision / plaintext leak vector | yes | hashing at issue | D7-12 |
| CST-009 | pUQ | secure_access_grants | (customer_id, custom_request_id) where status=ACTIVE — single active grant | ADR-DB3-004 r1 | two live links for one request | yes | reissue tx revokes prior | D7-13/D8-20 |
| CST-010 | pUQ | customer_merge_cases | (survivor, loser) where status=REQUESTED — one open merge per pair | CC-27 | conflicting merges | yes | ordered locks | D8-18 |
| CST-011 | UQ | categories / products / gallery_entries / design_templates | slug (per table) | Q-02/Q-04 | ambiguous public URL | yes | — | D7 |
| CST-012 | UQ | skus | code | REQ-VAR-002 | duplicate SKU code | yes | — | D7 |
| CST-013 | UQ | product_media | (product_id, asset_id, role) | REQ-MEDIA-001 | duplicate association | yes | — | D7 |
| CST-014 | UQ | sku_stocks | sku_id — one stock row per SKU | REQ-INV-001 | split stock truth | yes | — | D7-13 |
| CST-015 | pUQ | inventory_soft_holds | (custom_request_id, sku_stock_id) where HELD | LC-17 | duplicate holds | yes | `inventory.hold` idem | D8-24 |
| CST-016 | pUQ | inventory_reservations | (order_id, sku_stock_id) where RESERVED — reservation per order/SKU line | INV-19 | double reservation | yes | `inventory.reserve` idem | D8-05 |
| CST-017 | UQ | assets | storage_key | INV-10 | two rows claiming one binary | yes | — | D7 |
| CST-018 | pUQ | asset_derivatives | (asset_id, kind) where status≠FAILED | LC-06 | duplicate derivative pipeline | yes | worker idem (CC-19) | D8-23 |
| CST-019 | UQ | design_sessions | session_secret_hash | REQ-SESS-001 | session identity collision | yes | — | D7-12 |
| CST-020 | UQ | design_cases | custom_request_id — one design thread per request | REQ-DVER-001 | parallel design threads | yes | W1 submission tx | D7-13 |
| CST-021 | UQ | design_versions | (design_case_id, version) | REQ-DVER-005 | version number reuse | yes | header-serialized creation | D7 |
| CST-022 | pUQ | design_versions | (design_case_id) where status=SENT_FOR_REVIEW — **single active review** | **INV-16 / GRD-004** | two versions under review | **yes (partial unique)** | GRD-004 in tx | **D7-04 / D8-09 (critical)** |
| CST-023 | UQ | approval_snapshots | design_version_id — one approval per version | INV-19 / GRD-007 | duplicate approval evidence | yes | `design.approve` idem | D7-13/D8-08 |
| CST-024 | UQ | approval_snapshot_agreement_acceptances | (approval_snapshot_id, agreement_version_id) | GRD-008 | duplicate acceptance rows | yes | — | D7 |
| CST-025 | UQ | design_template_versions | (design_template_id, version) | GAP-08 | version reuse | yes | publish tx | D7-14 |
| CST-026 | UQ | custom_requests | code | REQ-REQ-005 | duplicate human code | yes | code generator | D7-13 |
| CST-027 | UQ | customer_owned_products | custom_request_id | REQ-COP-001 | two COPs per request | yes | — | D7 |
| CST-028 | UQ | custom_request_quantity_breakdowns | (custom_request_id, product_variant_id, size_label) | REQ-REQ-001 | duplicate quantity line | yes | — | D7 |
| CST-029 | UQ | orders | code | ADR-DB1-007 | duplicate order code | yes | generator | D7-13 |
| CST-030 | UQ | orders | custom_request_id — **request→order unique** | **INV-19 / GRD-009** | duplicate order creation | **yes** | `order.create` idem | **D8-12 (critical)** |
| CST-031 | UQ | order_items | (order_id, position) | — | line duplication | yes | — | D7 |
| CST-032 | pUQ | order_cancellation_requests | (order_id) where status=PENDING — one open review | ADR-DB3-002 m2 | parallel cancellation reviews | yes | saga | D8-19 |
| CST-033 | UQ | shipping_details | order_id | ADR-DB2-002 | two shipping records | yes | — | D7 |
| CST-034 | UQ | shipping_snapshots | order_id — one dispatch freeze | GRD-017 | double freeze | yes | dispatch tx | D8-14 |
| CST-035 | UQ | quotations | custom_request_id · and code | REQ-QUOT-001 | parallel quotation headers / dup code | yes | — | D7-13 |
| CST-036 | UQ | quotation_versions | (quotation_id, version) | REQ-QUOT-002 | version reuse (CC-28) | yes | header lock | D8-11 |
| CST-037 | UQ | quotation_line_items | (quotation_version_id, position) | — | dup line | yes | — | D7 |
| CST-038 | UQ | quotation_acceptances | quotation_version_id — **acceptance per version** | GRD-006 | double acceptance | yes | `quotation.accept` idem | D8-10 |
| CST-039 | pUQ | payment_obligations | (order_id, kind) where status ∈ {PENDING, SATISFIED} — **one live obligation per type** | **INV-04** | duplicate deposit/remaining obligation | **yes** | recalculation tx supersedes first | D8-04/D7-13 |
| CST-040 | UQ | payment_provider_events | (provider_key, provider_event_ref) — **provider event unique** | **INV-07 / GRD-012** | double-applied callback | **yes** | idempotency claim | **D7-09 / D8-01 (critical)** |
| CST-041 | UQ | production_jobs | (order_id, approval_snapshot_id) | INV-19 / `production.start` idem | duplicate job per approval | yes | idem | D8-13 |
| CST-042 | UQ | production_specifications | production_job_id | INV-03 | two specs per job | yes | creation tx | D7-07 |
| CST-043 | UQ | production_artifacts / design_version_assets / design_session_assets / design_template_assets / gallery_entry_assets / custom_request_assets | owner+asset (+role) per ADR-DB4-003 | INV-25 | duplicate association | yes | — | D7 |
| CST-044 | UQ | content_pages | (page_type, slug) · redirect_rules.source_path · agreements.agreement_type | REQ-SEO-001/004, GAP-09 | ambiguous route/type | yes | — | D7 |
| CST-045 | UQ | agreement_versions | (agreement_id, version) | GAP-09 | version reuse | yes | publish tx | D7 |
| CST-046 | XCL | agreement_versions | at most one **effective** PUBLISHED version per agreement at any instant (effective_from windows must not overlap among non-superseded/withdrawn rows) | GRD-008 | two effective terms versions | dir (exclusion candidate → DB6 raw SQL; primary = publish-tx guard) | publish tx supersedes prior | D7-13/D8 (approve-vs-publish) |
| CST-047 | UQ | notification_intents | intent_key | GRD-012 `notification.intent` | duplicate customer message | yes | consumer idem | D8-16 |
| CST-048 | UQ | idempotency_records | (operation_namespace, scope_key) — **idempotency arbiter** | **INV-19/24 / GRD-012** | double execution | **yes** | claim tx | **D7-08 / D8-25 (critical)** |
| CST-049 | UQ | background_job_attempts | (job_kind, job_key, attempt_no) | REQ-OUTBOX-002 | attempt record collision | yes | worker | D7 |
| CST-050 | UQ | policy_configurations | config_key · policy_configuration_versions (config, version) | CON-144 | config identity split | yes | — | D7 |
| CST-051 | UQ | business_profiles | customer_id · approval_snapshot_thread_colors (snapshot, position) | — | duplicates | yes | — | D7 |

## 4. Checks (value/domain semantics)

| CST | Type | Table(s) | Rule | INV/GRD | Fail = | DB? | Test |
|---|---|---|---|---|---|---|---|
| CST-060 | CK | all status columns | status ∈ exact DB3 state set (`ck_<table>__status_allowed`; sets per [`DB3_DB4_HANDOFF.md`](./DB3_DB4_HANDOFF.md) §1) | ADR-DB1-008 | invalid state written | yes | D7-01 |
| CST-061 | CK | sku_stocks | quantity_on_hand ≥ 0 — **non-negative stock** | **INV-18 / GRD-014** | negative stock | **yes** | D7-05 / D8-05/24 |
| CST-062 | CK | inventory_ledger_entries / soft_holds / reservations / order_items / quotation lines / breakdowns / job attempts | quantity (attempt_no) > 0 | INV/quantity semantics | zero/negative quantity | yes | D7 |
| CST-063 | CK | all `_amount` columns | amount ≥ 0 (obligations, refunds, attempts: > 0); numeric only, no float exists | INV-11, ADR-DB4-001 | negative/inexact money | yes | D7-06 |
| CST-064 | CK | quotation_versions | deposit_amount + remaining_amount = total_amount · total = subtotal + adjustment + shipping fee · deposit_percent 0–100 · valid_from < valid_until | ADR-DB4-001 r5 | broken 40/60 derivation | yes | D7 |
| CST-065 | CK | quotation_versions | stitch_count ≥ 0; **admin-entered (GAP-10)** — required-at-SENT is a send-guard (TX/App) with CK candidate `status≠DRAFT → stitch_count NOT NULL` if business confirms always-required | GAP-10 / BR-004 | derived/negative stitch count | yes (≥0); dir (conditional) | D7 |
| CST-066 | CK | product_sides / embroidery_areas / design_versions / approval_snapshots / COP / quotation_versions / production_specifications | physical dimensions > 0 (when set); px bounds > 0; px_per_mm > 0 | REQ-SIDE-003 | non-physical geometry | yes | D7 |
| CST-067 | CK | order_items | exactly one of (sku_id, customer_owned_product_id) set | INV-13 boundary | ambiguous item subject | yes | D7 |
| CST-068 | CK | currency_code columns | = 'VND' (MVP set; widening = plain migration) | ADR-DB4-001 r3 | unsupported currency | yes | D7 |
| CST-069 | CK | customers | merged_into_customer_id ≠ id · merge_cases survivor ≠ loser | merge spec | self-merge | yes | D7 |
| CST-070 | CK | hash columns (document_hash, content_hash, preview_hash, checksum) | format `sha256:<64 hex>` (CK candidate) | ADR-DB1-012 r10 | malformed hash | dir | D7-15 |
| CST-071 | CK | inventory_ledger_entries | entry_kind=ADJUSTMENT → reason NOT NULL | GRD-023 | unexplained stock override | yes | D7-05/10 |
| CST-072 | CK | audit_events | actor_kind ↔ matching actor ref set (ADMIN→admin_id …) | audit spec | orphan actor | dir (trigger candidate) | D7-10 |
| CST-073 | CK | refunds | status=EXECUTED → transfer_reference NOT NULL | LC-20 | unevidenced refund execution | dir | D7-10 |
| CST-074 | CK | design_versions | status ∉ {DRAFT} → document_hash NOT NULL · agreement_versions status=PUBLISHED → content_hash & effective_from NOT NULL | GRD-007/008 | unhashed sent/published artifact | dir | D7-07 |
| CST-126 | CK | asset_derivatives | kind=PREVIEW_WATERMARKED → is_watermarked=true · kind=CATALOG_PREVIEW → is_watermarked=false (`ck_asset_derivatives__watermark_by_kind`; MOCKUP/NORMALIZED/THUMBNAIL unconstrained) | **INV-22 / BR-012** | a customer preview claiming no watermark, or a catalog display copy claiming one | **yes** (APP2-DB01, migration 0032) | D7 (`catalog-preview-derivative.integration.spec.ts`) |
| CST-127 | CK | assets | one intake lane per row: `not (uploaded_via_session_id is not null and uploaded_via_challenge_id is not null)` (`ck_assets__single_intake_lane`) | **APP5-G01 §7** | one row giving two contradictory answers to which authority admitted the binary, making the per-challenge quota count ambiguous | **yes** (APP5-DB01, migration 0035) | D7 (`app5-intake-provenance.integration.spec.ts`) |
| CST-128 | CK | assets | challenge lane carries its own due time: `uploaded_via_challenge_id is null or intake_expires_at is not null` (`ck_assets__challenge_intake_requires_expiry`); the reverse implication is deliberately **not** asserted | **APP5-G01 §7** | a challenge-authorized upload with no due time — unreachable by the orphan sweep once its parent is TTL-deleted | **yes** (APP5-DB01, migration 0035) | D7 (`app5-intake-provenance.integration.spec.ts`) |

## 5. Nullability (required references — D7-07 family)

**CST-080 (NN, blanket):** all NOT NULL columns per
[`DB4_COLUMN_DICTIONARY.md`](./DB4_COLUMN_DICTIONARY.md). Critical
snapshot-reference NOT NULLs called out: `order_items.approval_snapshot_id`
(INV-03 chain) · `production_jobs.approval_snapshot_id` +
`production_specifications.document_hash` (GRD-007/015) ·
`orders.accepted_quotation_version_id` (GRD-009) ·
`approval_snapshots.document_hash` + grant/step-up refs (GRD-002/003/007) ·
`approval_snapshot_agreement_acceptances.content_hash` (GRD-008) ·
`secure_access_grants.expires_at` (ADR-DB3-004 r3) ·
`inventory_soft_holds.expires_at` (ADR-DB1-018) ·
`audit_events.correlation_id`. DB enforced; D7-07.

## 6. Immutability & append-only (trigger candidates — ADR-DB1-010)

| CST | Type | Table(s) | Scope | Fail = | Test |
|---|---|---|---|---|---|
| CST-090 | IMM | design_versions | reject UPDATE/DELETE once status ≠ DRAFT, except legal status advance + state timestamps (column-list trigger) | INV-01/17 broken | D7-03 |
| CST-091 | IMM | approval_snapshots + thread_colors + agreement_acceptances | reject all UPDATE/DELETE | INV-01/03 broken | D7-03 |
| CST-092 | IMM | quotation_versions + quotation_line_items | frozen once SENT except status advance/timestamps | INV-02/12 broken | D7-03 |
| CST-093 | IMM | order_items | reject all UPDATE/DELETE | INV-12 broken | D7-03 |
| CST-094 | IMM | shipping_details (when FROZEN) + shipping_snapshots | frozen form rejects mutation (GRD-017/024) | dispatch evidence rewritten | D7-03/D8-14 |
| CST-095 | IMM | production_specifications | reject all UPDATE/DELETE | INV-03 broken | D7-03 |
| CST-096 | IMM | agreement_versions | frozen once PUBLISHED except status advance/timestamps | GAP-09 evidence broken | D7-03 |
| CST-097 | IMM | design_template_versions | frozen once published_at set | clone provenance broken | D7-14 |
| CST-098 | APP | inventory_ledger_entries, audit_events, payment_provider_events, payment_reconciliations, order_transitions, custom_request_transitions, production_job_transitions, design_reviews, request_moderation_notes, production_notes, notification_delivery_attempts, contact_verification_attempts, customer_merge_events, quotation_acceptances, shipping_fee_acknowledgements, asset_inspections, background_job_attempts | reject UPDATE/DELETE (retention cleanup jobs exempt via operator pipeline, ADR-DB1-011) | history rewritten | D7-11 |
| CST-099 | APP | outbox_events | INSERT + **column-scoped** updates only (status/attempt_count/next_attempt_at/claimed_*/dispatched_at/last_error); payload immutable | INV-23 payload tampered | D7-11 |
| CST-100 | IMM | refunds | amount/target/currency immutable after insert; status/decision columns advance only | refund evidence rewritten | D7-03 |

## 7. TX/App-only rules (explicitly NOT fabricated as schema constraints)

| CST | Rule | GRD/INV | Why not DB | Test |
|---|---|---|---|---|
| CST-110 | TX | Final payment before dispatch: remaining obligation SATISFIED read in dispatch tx | GRD-016 / BR-006 | cross-aggregate state, not a row fact — **not fabricated as an FK** | D8-15 |
| CST-111 | TX | Official reservation gate: approval exists + deposit SATISFIED | GRD-013 / INV-05 | cross-context tx read | D8-05/07 |
| CST-112 | TX | Production start gate (approval + deposit + reservation + order state, not ON_HOLD/CANCELLING) | GRD-015/022 / INV-06 | multi-row in-tx facts | D8-13 |
| CST-113 | TX | Order creation gate (approval + accepted current version) beyond CST-030 | GRD-009 | cross-context | D8-12 |
| CST-114 | TX | Acceptance binds exact current, unexpired version | GRD-006 | temporal + pointer fact | D8-10 |
| CST-115 | TX | Approval binds exact version + submitted hash match + effective agreement set | GRD-007/008 | client-supplied comparison | D8-08 |
| CST-116 | TX | Grant active/scope/step-up checked in action tx (revoke wins) | GRD-002/003 / INV-08 | temporal race semantics | D8-20 |
| CST-117 | TX | Refund amount ≤ refundable (reconciled against attempts) | GRD-021 | cross-row aggregate | D7-10/D8-03 |
| CST-118 | TX | Attempt state machine never regresses; contradictions → REQUIRES_REVIEW | CC-08 | ordering semantics | D8-02 |
| CST-119 | TX | Stale-autosave rejection via autosave_revision marker | GRD-027 / CC-01 | optimistic app check | D8-22 |
| CST-120 | TX | Cancellation stage matrix S1–S9 permits initiator/action | GRD-020 | policy matrix over facts | D8-19 |
| CST-121 | TX | Request subject presence (store product refs XOR COP row) | AGG-13 shape | cross-table condition | D7 representation |
| CST-122 | TX | Quantity breakdown frozen once request ≥ QUOTED | CON-074 | state-conditional mutability | D7 |
| CST-123 | TX | Gallery associations expose public derivatives only; production artifacts internal-only | INV-09/21/22 | classification lives on asset row | D7-12 family |
| CST-124 | TRG | Outbox exclusive claim (skip-locked direction) | GRD-029 | locking pattern, not constraint | D8-17 |
| CST-125 | TX | Fingerprint mismatch on same idempotency key → conflict | GRD-030 | value comparison at claim | D8-25 |

## 8. Required-coverage cross-check (task §13)

Human codes CST-026/029/035 · single active review CST-022 · approved
snapshot exact version/hash CST-023 + CST-074 + CST-115 · sent quotation
immutable CST-092 · agreement version/hash linkage CST-024/045/046/074 ·
deposit/remaining uniqueness CST-039 · provider event CST-040 · idempotency
CST-048 · non-negative stock CST-061 · reservation quantity positive
CST-062 · reservation requires references (NOT NULL order/sku) CST-080 ·
COP never store SKU (absent columns by design + CST-067/121) · shipping
snapshot required at dispatch CST-034 + GRD-017 (TX) · final payment gate =
TX (CST-110, not an FK) · outbox payload immutable CST-099 · audit/ledger
append-only CST-098 · version numbers unique within root CST-021/036/045/025 ·
parent/supersede refs valid (REL FKs) · one current-version pointer
(REL-noted header pointers; consistency = TX) · money non-negative CST-063 ·
refund ≤ reconciled CST-117 · quantity positive CST-062 · dimensions
positive CST-066 · stitch count non-negative/admin-entered CST-065 · token
hash unique CST-004/008/019 · no plaintext secrets (columns are `*_hash`
only; D7-12).

No performance index is designed here; unique constraints above are
integrity, not DB5 work.
