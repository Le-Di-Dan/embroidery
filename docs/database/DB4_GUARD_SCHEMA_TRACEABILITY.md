# DB4 — Guard → Schema Traceability (GRD-001..030)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Source:** [`DB3_TRANSITION_GUARD_CATALOG.md`](./DB3_TRANSITION_GUARD_CATALOG.md).
**Read consistency:** `tx` = read inside the transition's transaction ·
`lock` = with row lock · `read` = plain read. Every guard reads **source
facts**, never derived projections (DB3 derived-state rule). Missing-data
risk = none unless noted (all required facts have NOT NULL homes).

| GRD | Required facts | Supplying tables/columns | Consistency / lock | Constraint support | Owner | DB8 |
|---|---|---|---|---|---|---|
| GRD-001 verified customer | challenge status/purpose; contact link | contact_verification_challenges.status; customer_contact_points (verified link) | tx + contact-link lock (CC-17) | CST-005/007 | TX/App | D8-21 |
| GRD-002 grant active + scope | grant status/expiry/scope/request | secure_access_grants (status, expires_at, custom_request_id, scope_kind) | **tx** (revoke wins) | CST-008/009 | TX/App | D8-20 |
| GRD-003 step-up valid | completed STEP_UP challenge in window | contact_verification_challenges (status=VERIFIED, verified_at, purpose) + window [cfg] | tx | CST-007 | TX/App | D8-20/21 |
| GRD-004 single active review | other versions of case in SENT_FOR_REVIEW | design_versions (case_id, status) | tx + **DB partial unique** | **CST-022** | DB+TX | D8-09 |
| GRD-005 quote accepted before digitizing | request state | custom_requests.status = QUOTE_ACCEPTED | tx | CST-060 | TX/App | — (D7-02) |
| GRD-006 exact current version acceptance | version status/current/validity | quotation_versions (status=SENT, valid_until) + quotations.current_version_id | tx | CST-038/114 | TX/App | D8-10 |
| GRD-007 approval binds version + hash | version status + stored hash vs submitted | design_versions (status, document_hash NN-at-sent) | tx | CST-074/023 | TX/App | D8-08 |
| GRD-008 effective agreement accepted | effective version + content hash | agreement_versions (status, effective_from, content_hash) ; evidence into TBL-033 | tx (read effective set) | CST-046/024/074 | TX/App | approve-vs-publish |
| GRD-009 order creation gate | approval exists; current version accepted; no order | approval_snapshots; quotation_acceptances; orders.custom_request_id | tx + **DB unique** | **CST-030** + CST-113 | DB+TX | D8-12 |
| GRD-010 deposit payable post-approval | obligation exists via order | payment_obligations (order_id, kind=DEPOSIT, status) | tx | CST-039 | TX/App | — |
| GRD-011 provider verification | signature/amount/currency/business ref | payment_provider_events columns (amount, currency, signature_valid) vs attempt/obligation rows | tx + EXT | CST-040 | APP+EXT | D8-01 |
| GRD-012 idempotency claim | (namespace, key) + fingerprint | idempotency_records | tx + **DB unique** | **CST-048** | DB+TX | all races |
| GRD-013 reservation gate | approval + deposit SATISFIED | approval_snapshots (exists); payment_obligations (kind=DEPOSIT, status) | tx | CST-111 | TX | D8-07 |
| GRD-014 sufficient stock | on-hand under lock vs requested | sku_stocks.quantity_on_hand | **lock** | **CST-061** | TX (lock) + DB check | D8-05 |
| GRD-015 production start gate | approval ref + deposit + reservation RESERVED + order DEPOSIT_PAID | production_jobs.approval_snapshot_id; payment_obligations; inventory_reservations.status; orders.status | tx (order row) | CST-041/080/112 | TX | D8-13 |
| GRD-016 final payment before dispatch | remaining obligation SATISFIED | payment_obligations (kind=REMAINING, status) | tx | CST-110 (TX-only by design) | TX | D8-15 |
| GRD-017 shipping frozen at dispatch | detail complete + freeze in tx | shipping_details (completeness, status) → shipping_snapshots row | tx | CST-034/094 | TX | D8-14 |
| GRD-018 delivered before completion | order state | orders.status = DELIVERED | tx | CST-060 | TX/App | — |
| GRD-019 transition legality | from/to per LC spec | each status column | tx | not in CHECK (by design) | APP | D7-02 |
| GRD-020 cancellation stage | stage facts S1–S9 | orders/custom_requests.status + obligation/production/shipping facts + order_cancellation_requests | tx | CST-032/120 | TX | D8-19 |
| GRD-021 refund approval | amount ≤ refundable; reconciled; reason | refunds.amount vs payment_attempts/provider_events/reconciliations; reason NN | tx | CST-117/073 | TX | D8-03 |
| GRD-022 revision hold clear | order not ON_HOLD/CANCELLING; resume gates | orders.status; approval_snapshots (new); quotation_acceptances | tx (order row) | CST-112 | TX | D8-13 |
| GRD-023 negative-stock override | explicit adjustment + reason | inventory_ledger_entries (kind=ADJUSTMENT, reason NN) | tx | **CST-071** | TX/App + DB | D8-24 |
| GRD-024 immutable mutation rejection | — (defense) | all IMM/APP tables | DB trigger | CST-090..100 | **DB** | D7-03/11 |
| GRD-025 actor authorization | actor class per transition | actor columns on transitions/evidence rows; admin_accounts/grants | tx | CST-072 | APP | D7-10 |
| GRD-026 challenge rate/attempt limits | counters + config | contact_verification_attempts (count over window) + [cfg] | tx | CST-007 | TX/App | D8-21 |
| GRD-027 session active + revision | session status/expiry + marker | design_sessions (status, expires_at, autosave_revision) | tx | CST-119 | TX/App (optimistic) | D8-22 |
| GRD-028 template published | template state | design_templates.status = PUBLISHED | read | CST-060 | APP | D7-14 |
| GRD-029 outbox exclusive claim | unclaimed pending row | outbox_events (status, claimed_by/claimed_at) | **lock** (skip-locked → DB6 spike) | CST-124 | TX (lock) | D8-17 |
| GRD-030 fingerprint match | stored vs computed fingerprint | idempotency_records.fingerprint | tx | CST-125 | TX/App | D8-25 |

**Coverage check:** 30/30 guards have named supplying tables/columns; the
critical set called out by the task (quote/current version, exact design
hash, effective agreement, deposit satisfied, sufficient inventory, exact
approval, final payment, shipping freeze, grant scope/expiry/revocation,
cancellation stage, no negative stock, immutability) maps to GRD-006/007/
008/013/014/015/016/017/002/020/023+014/024 above — none reads a derived
row, none lacks a schema home.
