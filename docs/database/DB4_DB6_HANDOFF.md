# DB4 → DB6 Handoff (Implementation Order — no implementation here)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Rule:** DB6 implements Drizzle schema + migrations from this order; it
must not invent structures. Exact syntax/DDL/library pins → DB6
(ADR-DB1-002/003). DB5 runs first for index design; DB6 merges both.

## 1. Dependency-ordered table groups (fresh install order)

| # | Group | Tables | Depends on |
|---|---|---|---|
| G1 | Identity | admin_accounts, admin_credentials, admin_sessions | — |
| G2 | Platform base | policy_configurations, policy_configuration_versions, idempotency_records, outbox_events, background_job_attempts | G1 (config created_by) |
| G3 | Customer | customers, business_profiles, customer_contact_points | — |
| G4 | Asset | assets, asset_inspections, asset_derivatives | G3 (uploader ref, nullable) |
| G5 | Catalog | categories, products, product_variants, skus, product_sides, embroidery_areas, product_media | G4 |
| G6 | Inventory | sku_stocks, inventory_ledger_entries (FKs to holds/reservations added after G10 or as deferred FK migration step) , inventory_soft_holds*, inventory_reservations* | G5 (+G10 for request/order FKs → *created in G10 step, see note) |
| G7 | Design pre-request | design_templates, design_template_versions, design_template_assets, design_sessions, design_session_assets | G4/G5 |
| G8 | Verification/Grants | contact_verification_challenges, contact_verification_attempts | G3/G7 (session ref) |
| G9 | Request | custom_requests, customer_owned_products, custom_request_quantity_breakdowns, custom_request_assets, request_moderation_notes, custom_request_transitions, design_cases | G3/G5/G7 |
| G10 | Grants + holds | secure_access_grants (needs custom_requests), inventory_soft_holds, customer_merge_cases, customer_merge_events | G6/G8/G9 |
| G11 | Design formal | design_versions, design_version_assets, design_reviews | G9/G10 |
| G12 | Content/Agreement | content_pages, redirect_rules, agreements, agreement_versions, gallery_entries, gallery_entry_assets | G4/G5 |
| G13 | Approval | approval_snapshots, approval_snapshot_thread_colors, approval_snapshot_agreement_acceptances | G11/G12 |
| G14 | Quotation | quotations, quotation_versions, quotation_line_items, quotation_acceptances | G9/G10 |
| G15 | Order | orders, order_items, order_transitions, order_cancellation_requests, shipping_details, shipping_snapshots, shipping_fee_acknowledgements, inventory_reservations | G13/G14/G6 |
| G16 | Payment | payment_obligations, payment_attempts, payment_provider_events, payment_reconciliations, refunds | G15 |
| G17 | Production | production_jobs, production_specifications, production_artifacts, production_notes, production_job_transitions | G13/G15 |
| G18 | Notification | notification_intents, notification_delivery_attempts | G2/G3 |
| G19 | Audit | audit_events | G1 (logically last; no hard FK deps) |

*Note:* circular-ish refs (ledger→holds/reservations,
challenges→sessions, requests→current design case/quotation pointers,
soft_holds→converted_reservation) are nullable columns — define the
tables first, then add these FKs in a follow-up migration step within the
same checkpoint. Header current-pointer FKs (design_cases.current_version_id,
quotations.current_version_id, agreements/policy current pointers) are
added after their version tables.

## 2. Constraint implementation order

1. PKs + NOT NULLs with each table (CST-001/080).
2. Plain uniques + FKs per group (CST-002..051 non-partial; REL-*).
3. CHECKs: status sets (CST-060), quantities/amounts/dimensions
   (CST-061..069), format checks (CST-070) — with tables.
4. **Raw-SQL migration steps (drizzle `--custom`):** partial uniques
   (CST-003/005/006/007/009/010/015/016/018/022/032/039/046), conditional
   checks (CST-071/073/074, stitch-count-at-send if confirmed),
   reject-mutation triggers (CST-090..097/100), append-only triggers
   (CST-098), column-scoped outbox trigger (CST-099), actor-consistency
   trigger (CST-072), exclusion candidate CST-046 (or tx-guard-only with
   documented waiver).
5. DB5 indexes last (separate migration(s)).

## 3. Spikes & verifications required at DB6 (from DB1/DB3/DB4)

- **Row-lock spike** (ADR-DB1-002): `FOR UPDATE` on sku_stocks,
  reservation rows, order rows, attempt/obligation rows (CC-10/12/20..24);
  **skip-locked** claim for outbox (GRD-029/CC-25).
- Exact Drizzle/drizzle-kit + UUIDv7 library pins (ADR-DB1-007).
- PostgreSQL tag pin + UTF8/UTC + collation verification (ADR-DB1-001);
  ICU collation decision for text sort columns (deferred from DB1-C1).
- JSONB validation strategy: app-level (ADR-DB4-004 r2) — document the
  validator wiring per payload; no DB-side JSON schema checks.
- Trigger naming per ADR-DB1-006 (`tg_<table>__reject_mutation` etc.).
- Privilege-separation hardening remains deferred (ADR-DB1-010 layer 3 →
  DB6 option/DB10).

## 4. Migration split strategy

One migration per group G1..G19 (readable review units), then the raw-SQL
constraint/trigger migration(s), then seeds excluded (ADR-DB1-015 — seeds
never in migrations). **Fresh install:** run all in order (INV-28).
**Upgrade path:** N/A pre-first-migration; from DB6 onward forward-only
(ADR-DB1-003). **Backfill:** none — no data exists before DB6; the only
data-migration consideration is dev-volume disposal per ADR-DB1-013.

## 5. Flagged critical implementations

Partial unique single-active-review (CST-022) · immutable approved/
quotation/agreement/spec/snapshot rows (CST-090..096) · idempotency unique
scope (CST-048) · provider event unique (CST-040) · inventory concurrency
(CST-061 + lock spike) · outbox claim (CST-099/124) · shipping freeze
(CST-034/094 in dispatch tx) · customer merge ordered locks (CC-27) ·
request→order unique (CST-030) · one-live-obligation partial unique
(CST-039) · one-effective-agreement exclusion candidate (CST-046).

No table, constraint, trigger, index, or migration is created at DB4.
