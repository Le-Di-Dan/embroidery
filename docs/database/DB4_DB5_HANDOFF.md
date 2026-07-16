# DB4 → DB5 Handoff (Access Paths — no index design)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Rule:** DB5 designs indexes; DB4 hands off logical access paths only.
Columns: join path → filter → sort. **Cons:** S strong / E eventual-OK.
**pIdx:** candidate partial-index predicate (direction only). **Hot:**
likely hot path at locked scale. Security scope per Q catalog. Owner = DB5
design owner (module).

## 1. Q-01..Q-33

| Q | Tables (join path) | Filter | Sort | Uniqueness assumptions | Card. | Cons | pIdx / Hot | Owner |
|---|---|---|---|---|---|---|---|---|
| Q-01 | products→categories | category_id, status=PUBLISHED, is_display_out_of_stock | display_order | slug UQ | ≤100 rows | E | status=PUBLISHED · **Hot** | CAT |
| Q-02 | products→variants→skus, sides→areas, product_media→assets | slug | — | slug UQ (CST-011) | 1 product graph | E | — · **Hot** | CAT |
| Q-03 | skus→sku_stocks (+holds/reservations computed) | product/variant | — | sku_id UQ (CST-014) | ≤ dozens | S (near add) | active holds/reservations status | CAT/INV |
| Q-04 | gallery_entries→gallery_entry_assets | status=PUBLISHED, filters | display_order | slug UQ | small | E | published | GAL |
| Q-05 | content_pages | page_type + slug, status | — | (type,slug) UQ (CST-044) | 1 | E | — | CNT |
| Q-06 | content_pages, products, gallery_entries | is_indexable, status | — | — | small | E | indexable | CNT |
| Q-07 | redirect_rules | source_path, is_active | — | source_path UQ | 1 | S | active | CNT |
| Q-08 | secure_access_grants | token_hash | — | token_hash UQ (CST-008) | 1 | S | — · **Hot (security)** | CUS |
| Q-09 | custom_requests→design_cases→design_versions(current), quotations(current version), orders→payment_obligations | request_id (grant-scoped) | — | pointers + CST-020/035 | 1 graph | S | — · **Hot** | ORD compose |
| Q-10 | design_versions (→design_reviews) | design_case_id | version | (case,version) UQ | ≤ tens | S | — | DSN |
| Q-11 | design_versions | case_id, status=SENT_FOR_REVIEW | — | **CST-022 partial unique** | ≤1 | S (tx-adjacent) | SENT_FOR_REVIEW | DSN |
| Q-12 | quotation_versions | quotation_id | version | (quotation,version) UQ | ≤ tens | S | — | QUO |
| Q-13 | quotations→quotation_versions(current) | request_id | — | CST-035/068 pointer | 1 | S | — | QUO |
| Q-14 | approval_snapshots (+children) | design_version_id / via orders.current_approval_snapshot_id | — | CST-023 UQ | 1 | S | — | DSN/ORD |
| Q-15 | orders→order_items→shipping_details/snapshots | order_id / request_id / code | — | code UQ, CST-030 | 1 graph | S | — · **Hot** | ORD |
| Q-16 | payment_attempts→payment_provider_events, payment_obligations | provider_ref / received_at range / status | received_at | CST-040 UQ | small | S | status ∈ review set | PAY |
| Q-17 | orders→payment_obligations | order status=AWAITING_DEPOSIT + deposit PENDING | created_at | CST-039 | small | S | status | ORD/PAY |
| Q-18 | orders→payment_obligations | status=AWAITING_FINAL_PAYMENT + remaining PENDING | created_at | CST-039 | small | S | status | ORD/PAY |
| Q-19 | production_jobs→orders→approval_snapshots | job status ∈ {PLANNED,STARTED} | created_at | CST-041 | small | S | active jobs | PRD |
| Q-20 | sku_stocks (+active holds/reservations) | quantity_on_hand ≤ low_stock_threshold | — | CST-014 | small | S | threshold set | INV |
| Q-21 | custom_requests | status, paging | created_at | code UQ | ≤ hundreds | S | per-status · **Hot** | ORD |
| Q-22 | composition of Q-11/17/18/19/20/21/23/24 counters | per bucket | — | — | counts | S | see components · **Hot** | multi (read compose) |
| Q-23 | payment_attempts | status ∈ {FAILED, REQUIRES_REVIEW} | created_at | — | small | S | failed/review | PAY |
| Q-24 | quotation_versions | status=SENT, valid_until < horizon | valid_until | — | small | E | SENT | QUO |
| Q-25 | design_sessions | status=ACTIVE, last_activity_at < now−TTL / status=EXPIRED | — | — | batch | E | sweep predicate | DSN worker |
| Q-26 | assets, asset_derivatives | status ∈ pending/processing | created_at | CST-018 | batch | E | pending | AST worker |
| Q-27 | outbox_events | status=PENDING (+next_attempt_at) | id | claim excl. (GRD-029) | batch | S (claim) | **PENDING partial · Hot (polled)** | PLT |
| Q-28 | idempotency_records | (namespace, scope_key) | — | **CST-048 UQ** | 1 | S | — · **Hot** | PLT |
| Q-29 | audit_events | target_kind+target_id / actor / occurred_at range | occurred_at | — | large append | S | — | AUD |
| Q-30 | assets→asset_derivatives | asset_id + scope check | — | CST-017 | 1 | S | — · **Hot** | AST |
| Q-31 | contact_verification_challenges | contact target + purpose, status=ISSUED | — | CST-007 partial UQ | ≤1 | S | ISSUED | CUS |
| Q-32 | sku_stocks (locked) + active holds/reservations | sku_id | — | CST-014 | 1 | S (in-tx) | active statuses | INV |
| Q-33 | outbox_events (analytics emission stream) | event_type set | id | — | batch | E | — | PLT (tool deferred) |

## 2. DB3 operational queries (new since DB0 catalog)

| Q+ | Access path | Filter/sort | Cons | Notes |
|---|---|---|---|---|
| QX-01 transition history | custom_request_transitions / order_transitions / production_job_transitions by parent id | parent_id, created_at | S | admin case timeline |
| QX-02 cancellation saga resume | order_transitions (order_id, event_kind=SAGA_STEP) + orders.status=CANCELLING | order_id | S | D8-19 resume source |
| QX-03 notification retry scan | notification_intents status ∈ {PENDING, PROCESSING} (+attempt counts) | status, created_at | E | worker |
| QX-04 outbox claim | = Q-27 (skip-locked direction, DB6 spike) | status=PENDING, next_attempt_at | S | CC-25 |
| QX-05 idempotency lookup/cleanup | = Q-28 + expires_at < now sweep | expires_at | S/E | TTL sweep |
| QX-06 grant revocation/expiry sweep | secure_access_grants status=ACTIVE, expires_at < now | expires_at | E | hygiene only (guards read timestamps) |
| QX-07 agreement effective version | agreement_versions (agreement_id, status=PUBLISHED, effective_from ≤ now, not superseded/withdrawn) | effective_from desc | S (GRD-008 in-tx) | CST-046 |
| QX-08 customer merge review | customer_merge_cases status=REQUESTED (+duplicate-candidate signal reads on normalized contacts) | created_at | S | admin queue |
| QX-09 shipping freeze state | shipping_details (order_id) status + shipping_snapshots existence | order_id UQ | S | dispatch gate reads |
| QX-10 hold/reservation expiry sweep | inventory_soft_holds / inventory_reservations status + expires_at < now | expires_at | S (locked per row) | CC-22 |
| QX-11 challenge/attempt rate window | contact_verification_attempts by challenge/contact within window | attempted_at | S | GRD-026 |

## 3. Notes for DB5

Uniqueness assumptions above are constraint-backed (CST refs) — DB5 must
not weaken them into non-unique indexes. Strong-consistency reads adjacent
to transactions (Q-09/11/14/16/19/27/28/31/32, QX-02/07/09) must be
designed against write-path locks per
[`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md).
Partial-index predicates are directions, not designs. No index is defined
in DB4.
