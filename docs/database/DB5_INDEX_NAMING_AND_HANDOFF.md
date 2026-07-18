# DB5 — Index Naming & Physical Name Map

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Normative:** [ADR-DB5-004](../adr/database/ADR-DB5-004-INDEX-GOVERNANCE.md)
R1, extending [ADR-DB1-006](../adr/database/ADR-DB1-006-NAMING-CONVENTIONS.md).
**Nature:** name map only — **no DDL**.

## 1. Patterns

| Kind | Pattern |
|---|---|
| Primary key | `pk_<table>` |
| Unique | `uq_<table>__<cols>` |
| Partial unique | `uq_<table>__<cols>__<tag>` |
| Performance | `ix_<table>__<cols>` |
| Performance partial | `ix_<table>__<cols>__<tag>` |
| Expression | `ix_<table>__<expr_tag>` |
| Non-B-tree | `ix_<table>__<cols>__<method>` |

Rules: lowercase snake_case; `__` separates table from columns, `_` separates
columns; `<tag>` is a short human word for the partial predicate, never an
encoded expression; **names are explicit in the migration, never
tool-generated**; all names must fit PostgreSQL's **63-byte** identifier
limit — shorten the tag first, then the column list, **never the table name**
(it must stay readable in an error message and in `pg_stat_user_indexes`).

Column-name abbreviations used below, applied only where the full name would
overflow: `custom_request_id` → `request`, `approval_snapshot_id` →
`approval`, `design_case_id` → `case`, `quotation_version_id` → `qversion`,
`payment_obligation_id` → `obligation`, `payment_attempt_id` → `attempt`,
`sku_stock_id` → `stock`, `production_job_id` → `job`, `design_version_id` →
`version`, `agreement_version_id` → `agrversion`, `gallery_entry_id` →
`entry`, `design_template_id` → `template`, `notification_intents` id →
`intent`.

## 2. Integrity-backed (IDX-001 … IDX-064)

| IDX | Physical name | Len |
|---|---|---|
| IDX-001 | `uq_admin_accounts__email` | 24 |
| IDX-002 | `uq_admin_accounts__status__active` | 33 |
| IDX-003 | `uq_admin_sessions__token_hash` | 29 |
| IDX-004 | `uq_customer_contact_points__kind_value__verified` | 48 |
| IDX-005 | `uq_customer_contact_points__customer__primary` | 45 |
| IDX-006 | `uq_verification_challenges__kind_value_purpose__issued` | 54 |
| IDX-007 | `uq_secure_access_grants__token_hash` | 35 |
| IDX-008 | `uq_secure_access_grants__customer_request__active` | 49 |
| IDX-009 | `uq_customer_merge_cases__survivor_loser__requested` | 50 |
| IDX-010 | `uq_categories__slug` | 19 |
| IDX-011 | `uq_products__slug` | 17 |
| IDX-012 | `uq_gallery_entries__slug` | 24 |
| IDX-013 | `uq_design_templates__slug` | 25 |
| IDX-014 | `uq_skus__code` | 14 |
| IDX-015 | `uq_product_media__product_asset_role` | 36 |
| IDX-016 | `uq_sku_stocks__sku` | 19 |
| IDX-017 | `uq_inventory_soft_holds__request_stock__held` | 44 |
| IDX-018 | `uq_inventory_reservations__order_stock__reserved` | 47 |
| IDX-019 | `uq_assets__storage_key` | 22 |
| IDX-020 | `uq_asset_derivatives__asset_kind__not_failed` | 44 |
| IDX-021 | `uq_design_sessions__session_secret_hash` | 39 |
| IDX-022 | `uq_design_cases__request` | 24 |
| IDX-023 | `uq_design_versions__case_version` | 32 |
| **IDX-024** | **`uq_design_versions__case__sent_for_review`** | 41 |
| IDX-025 | `uq_approval_snapshots__version` | 30 |
| IDX-026 | `uq_approval_acceptances__approval_agrversion` | 44 |
| IDX-027 | `uq_design_template_versions__template_version` | 45 |
| IDX-028 | `uq_custom_requests__code` | 24 |
| IDX-029 | `uq_customer_owned_products__request` | 34 |
| IDX-030 | `uq_request_quantity_breakdowns__request_variant_size` | 51 |
| IDX-031 | `uq_orders__code` | 15 |
| **IDX-032** | **`uq_orders__request`** | 18 |
| IDX-033 | `uq_order_items__order_position` | 30 |
| IDX-034 | `uq_order_cancellation_requests__order__pending` | 46 |
| IDX-035 | `uq_shipping_details__order` | 26 |
| IDX-036 | `uq_shipping_snapshots__order` | 28 |
| IDX-037 | `uq_quotations__request` | 22 |
| IDX-038 | `uq_quotations__code` | 20 |
| IDX-039 | `uq_quotation_versions__quotation_version` | 40 |
| IDX-040 | `uq_quotation_line_items__qversion_position` | 42 |
| IDX-041 | `uq_quotation_acceptances__qversion` | 34 |
| **IDX-042** | **`uq_payment_obligations__order_kind__live`** | 41 |
| **IDX-043** | **`uq_payment_provider_events__provider_ref`** | 41 |
| IDX-044 | `uq_production_jobs__order_approval` | 33 |
| IDX-045 | `uq_production_specifications__job` | 33 |
| IDX-046 | `uq_production_artifacts__job_asset` | 34 |
| IDX-047 | `uq_design_version_assets__version_asset` | 39 |
| IDX-048 | `uq_design_session_assets__session_asset` | 39 |
| IDX-049 | `uq_design_template_assets__template_asset` | 41 |
| IDX-050 | `uq_gallery_entry_assets__entry_asset` | 36 |
| IDX-051 | `uq_custom_request_assets__request_asset_role` | 44 |
| IDX-052 | `uq_content_pages__page_type_slug` | 32 |
| IDX-053 | `uq_redirect_rules__source_path` | 30 |
| IDX-054 | `uq_agreements__agreement_type` | 29 |
| IDX-055 | `uq_agreement_versions__agreement_version` | 40 |
| IDX-056 | `xc_agreement_versions__effective_window` *(conditional)* | 39 |
| IDX-057 | `uq_notification_intents__intent_key` | 35 |
| **IDX-058** | **`uq_idempotency_records__namespace_scope_key`** | 43 |
| IDX-059 | `uq_background_job_attempts__kind_key_attempt` | 44 |
| IDX-060 | `uq_policy_configurations__config_key` | 36 |
| IDX-061 | `uq_policy_configuration_versions__config_version` | 47 |
| IDX-062 | `uq_business_profiles__customer` | 30 |
| IDX-063 | `uq_approval_thread_colors__approval_position` | 44 |
| IDX-064 | `uq_asset_derivatives__storage_key__set` | 38 |

## 3. Performance (IDX-065 … IDX-138)

| IDX | Physical name | Len |
|---|---|---|
| IDX-065 | `ix_products__category_display_id__published` | 43 |
| IDX-066 | `ix_gallery_entries__display_id__published` | 41 |
| IDX-067 | `ix_content_pages__id__indexable` | 31 |
| IDX-068 | `ix_product_variants__product_display` | 36 |
| IDX-069 | `ix_skus__variant` | 17 |
| IDX-070 | `ix_product_sides__product_display` | 33 |
| IDX-071 | `ix_embroidery_areas__side_display` | 33 |
| IDX-073 | `ix_custom_requests__status_created_id` | 37 |
| IDX-074 | `ix_orders__status_created_id` | 28 |
| IDX-075 | `ix_payment_obligations__order` | 29 |
| IDX-076 | `ix_payment_attempts__created_id__needs_attention` | 48 |
| IDX-077 | `ix_payment_attempts__obligation` | 31 |
| IDX-078 | `ix_payment_attempts__provider_key_ref__set` | 42 |
| IDX-079 | `ix_payment_provider_events__received_id` | 39 |
| IDX-080 | `ix_payment_provider_events__attempt__matched` | 44 |
| IDX-081 | `ix_payment_provider_events__received_id__unmatched` | 50 |
| IDX-082 | `ix_production_jobs__created_id__active` | 38 |
| IDX-084 | `ix_quotation_versions__valid_until_id__sent` | 43 |
| IDX-085 | `ix_design_sessions__last_activity_id__active` | 44 |
| IDX-086 | `ix_assets__created_id__processing` | 33 |
| IDX-087 | `ix_asset_derivatives__created_id__processing` | 44 |
| **IDX-088** | **`ix_outbox_events__next_attempt_id__pending`** | 42 |
| IDX-090 | `ix_outbox_events__dispatched_id__dispatched` | 43 |
| IDX-091 | `ix_notification_intents__created_id__open` | 41 |
| IDX-092 | `ix_notification_attempts__intent_attempted` | 42 |
| IDX-093 | `ix_idempotency_records__expires_id` | 34 |
| IDX-094 | `ix_idempotency_records__claimed_id__in_progress` | 47 |
| IDX-095 | `ix_audit_events__target_occurred_id` | 35 |
| IDX-096 | `ix_audit_events__occurred_id` | 28 |
| IDX-097 | `ix_audit_events__correlation` | 28 |
| IDX-098 | `ix_audit_events__admin_occurred_id__set` | 39 |
| IDX-099 | `ix_asset_derivatives__asset` | 27 |
| IDX-100 | `ix_request_transitions__request_id` | 34 |
| IDX-101 | `ix_order_transitions__order_id` | 30 |
| IDX-102 | `ix_job_transitions__job_id` | 26 |
| IDX-103 | `ix_order_transitions__order_id__saga_step` | 41 |
| IDX-104 | `ix_orders__id__cancelling` | 25 |
| IDX-105 | `ix_secure_access_grants__expires_id__active` | 43 |
| IDX-106 | `ix_secure_access_grants__request` | 32 |
| **IDX-107** | **`ix_secure_access_grants__customer`** | 33 |
| IDX-108 | `ix_agreement_versions__agreement_effective_id__published` | 55 |
| IDX-109 | `ix_inventory_soft_holds__expires_id__held` | 41 |
| IDX-110 | `ix_inventory_reservations__expires_id__reserved` | 46 |
| IDX-111 | `ix_verification_attempts__challenge_attempted` | 45 |
| IDX-112 | `ix_verification_challenges__expires_id__issued` | 46 |
| IDX-113 | `ix_inventory_soft_holds__stock_id__held` | 39 |
| IDX-114 | `ix_inventory_reservations__stock_id__reserved` | 44 |
| IDX-115 | `ix_inventory_ledger_entries__stock_id` | 37 |
| IDX-116 | `ix_design_reviews__version_decided` | 34 |
| IDX-117 | `ix_custom_requests__customer` | 28 |
| IDX-118 | `ix_orders__customer` | 19 |
| IDX-119 | `ix_assets__uploaded_by__set` | 27 |
| IDX-120 | `ix_admin_sessions__admin_account` | 32 |
| IDX-121 | `ix_admin_sessions__expires_id__active` | 37 |
| IDX-122 | `ix_refunds__order` | 18 |
| IDX-123 | `ix_refunds__created_id__open` | 28 |
| IDX-124 | `ix_payment_reconciliations__attempt` | 35 |
| IDX-125 | `ix_shipping_fee_acknowledgements__order` | 39 |
| IDX-126 | `ix_inventory_reservations__order` | 32 |
| IDX-127 | `ix_inventory_soft_holds__request` | 32 |
| IDX-129 | `ix_customers__merged_into__set` | 30 |
| IDX-130 | `ix_verification_challenges__contact_point__set` | 46 |
| IDX-131 | `ix_background_job_attempts__finished_id__dead_letter` | 51 |
| IDX-132 | `ix_asset_inspections__asset_inspected` | 37 |
| IDX-133 | `ix_assets__deletion_requested_id__pending` | 41 |
| IDX-134 | `ix_customer_contact_points__customer` | 36 |
| IDX-135 | `ix_customer_merge_events__case_id` | 33 |
| IDX-136 | `ix_approval_snapshots__request` | 30 |
| IDX-137 | `ix_request_moderation_notes__request_created` | 44 |
| IDX-138 | `ix_production_notes__job_created` | 32 |

## 4. Primary keys

`pk_<table>` for all 78 tables — e.g. `pk_orders`, `pk_design_versions`,
`pk_inventory_ledger_entries` (longest: `pk_approval_snapshot_agreement_acceptances`, 43).

## 5. Predicate tags used

| Tag | Predicate |
|---|---|
| `active` | `status='ACTIVE'` |
| `pending` | `status='PENDING'` |
| `issued` | `status='ISSUED'` |
| `held` / `reserved` | `status='HELD'` / `status='RESERVED'` |
| `sent` | `status='SENT'` |
| `sent_for_review` | `status='SENT_FOR_REVIEW'` |
| `published` | `status='PUBLISHED'` |
| `requested` | `status='REQUESTED'` |
| `cancelling` | `status='CANCELLING'` |
| `dispatched` | `status='DISPATCHED'` |
| `dead_letter` | `is_dead_letter` |
| `in_progress` | `status='IN_PROGRESS'` |
| `live` | `status IN ('PENDING','SATISFIED')` |
| `open` | context-specific open set (intents `PENDING/PROCESSING`; refunds `PENDING_REVIEW/APPROVED`) |
| `active` (jobs) | `status IN ('PLANNED','STARTED')` |
| `processing` | `status IN ('UPLOADED','INSPECTING')` / `('PENDING','PROCESSING')` |
| `needs_attention` | `status IN ('FAILED','REQUIRES_REVIEW')` |
| `not_failed` | `status <> 'FAILED'` |
| `verified` | `verified_at IS NOT NULL AND deactivated_at IS NULL` |
| `primary` | `is_primary` |
| `indexable` | `status='PUBLISHED' AND is_indexable` |
| `matched` / `unmatched` | `payment_attempt_id IS NOT NULL` / `IS NULL` |
| `set` | `<column> IS NOT NULL` |
| `saga_step` | `event_kind='SAGA_STEP'` |

`open`, `active` and `processing` are context-dependent tags. This is a
deliberate readability trade-off: `ix_production_jobs__created_id__active`
is clearer in a log line than an enumerated variant would be, and the exact
predicate is always one lookup away in
[`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md). **DB6 must take the
predicate from the catalog, never from the name.**

## 6. Length check

**All 134 names are within PostgreSQL's 63-byte limit.** The longest are
`ix_agreement_versions__agreement_effective_id__published` (55),
`uq_verification_challenges__kind_value_purpose__issued` (54) and
`uq_request_quantity_breakdowns__request_variant_size` (51) — comfortable
margins, and every table name survives intact.

Abbreviations were applied to column names only (§1), never to table names,
so every index name is unambiguously attributable to its table in an error
message, a lock trace, or a `pg_stat_user_indexes` row.

## 7. DB6 handoff

1. Names in this map are **normative**. Do not accept tool-generated names.
2. Constraint-owned indexes (§2) are created **by the constraint**, and the
   constraint carries the name — DB6 must not create a separate index with
   these names.
3. If the ORM cannot emit explicit index names, that path is raw SQL
   (ADR-DB5-004 R11, deferred item).
4. Renaming an index later is a migration and updates this map in the same
   change.
5. IDX-072, IDX-083, IDX-089, IDX-128 are **retired, unassigned IDs** — not
   reused, so `IDX-*` references stay stable across DB6–DB10.
