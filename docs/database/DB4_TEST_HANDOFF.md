# DB4 → DB7/DB8 Test Handoff

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Base:** [`DB3_TEST_HANDOFF.md`](./DB3_TEST_HANDOFF.md) (D7-01..15,
D8-01..25) — this maps those tests to concrete DB4 structures/constraints.

## 1. DB7 (constraint/representation)

| D7 | DB4 targets |
|---|---|
| D7-01 status CHECK sets + TS↔DB equality | CST-060 on every status column (state sets per DB3 handoff §1) |
| D7-02 transition legality fixtures | Tier A tables + GRD-019 repository tests; CHECK deliberately value-only |
| D7-03 immutable mutation rejection (bypass app) | CST-090..097/100 tables: design_versions (sent+), approval_snapshots(+children), quotation_versions(+lines), order_items, shipping_details(FROZEN)+snapshots, production_specifications, agreement_versions(published), template versions, refunds amounts |
| D7-04 single active review | CST-022 partial unique on design_versions |
| D7-05 non-negative stock + reasoned override | CST-061 + CST-071 (ledger ADJUSTMENT reason) |
| D7-06 numeric-only money | all `*_amount`/percent columns (ADR-DB4-001); no float columns exist |
| D7-07 required snapshot refs NOT NULL | order_items.approval_snapshot_id; production_jobs.approval_snapshot_id + spec document_hash; approval_snapshots.design_version_id/document_hash/grant/step-up; acceptance content_hash (CST-074/080) |
| D7-08 idempotency unique + fingerprint conflict | CST-048 + CST-125 |
| D7-09 provider event unique | CST-040 |
| D7-10 reason-required constraints | [R] columns: ledger override, cancel/hold reasons (transitions), refund approve/reject, merge case, withdraw, config change, moderation SPAM/REJECT/PAUSE, grant admin-revoke (CST-071..073 + App rules) |
| D7-11 append-only rejection | CST-098 table list + CST-099 outbox column-scope |
| D7-12 no plaintext secrets / no secret-shaped fields | token_hash/session hashes/code_hash only; notification params structural exclusion; provider payload redaction |
| D7-13 named uniques | CST-003/005/006/007/009/014/020/023/026/029/030/035/038/039/046 (one-effective agreement) |
| D7-14 clone independence | design_template_versions immutability (CST-097) + session provenance columns (REL-041) — template update never alters cloned session/version documents |
| D7-15 golden hashes cross-machine | document_hash/preview_hash/content_hash format (CST-070) + package test vectors (ADR-DB1-012) |

Additional DB4-born D7 items: schema scan (no BLOB, no JSONB outside the
ADR-DB4-004 closed set, naming-convention introspection per ADR-DB1-006);
CST-064 sum checks; CST-067 item-subject XOR; CST-046 exclusion behavior.

## 2. DB8 (transaction/concurrency)

| D8 | DB4 structures under test |
|---|---|
| D8-01/02 duplicate & out-of-order callbacks | payment_provider_events UQ + idempotency claim + attempt no-regress + application_outcome evidence rows |
| D8-03 reconcile vs callback | payment_reconciliations append + attempt row lock |
| D8-04 obligation satisfaction race | CST-039 partial unique + satisfied_by_attempt_id exactly-once |
| D8-05..07 inventory races (last unit, release-vs-consume, expiry-vs-deposit) | sku_stocks row lock + CST-061 + ledger append + reservation state rows |
| D8-08 approve vs revision/supersede | design_versions row lock + CST-023 + GRD-007 |
| D8-09 simultaneous send-for-review | **CST-022 partial unique failure mapped to REVIEW_ALREADY_ACTIVE** |
| D8-10/11 accept-vs-revise/expire; concurrent version creation | quotation_versions state check in tx + CST-038; header lock + CST-036 |
| D8-12 duplicate order creation | **CST-030** + `order.create` idempotency; single order + both obligations |
| D8-13 start vs cancel/hold | orders row lock + GRD-015/022 re-check; production_job_transitions single winner row |
| D8-14 freeze vs edit | shipping_details FROZEN trigger (CST-094) + CST-034; snapshot content = winner |
| D8-15 final payment vs dispatch | GRD-016 in dispatch tx (CST-110) — dispatch fails until remaining SATISFIED committed |
| D8-16 duplicate outbox → one intent; retry overlap | CST-047 intent-key + attempts append |
| D8-17 outbox multi-worker claim | CST-099 column-scope + skip-locked claim (DB6 spike) |
| D8-18 merge race | ordered locks on both customers rows; merge events; snapshots untouched (CST-091) |
| D8-19 saga compensation retry | order CANCELLING + SAGA_STEP rows idempotent replay (no duplicate step rows) |
| D8-20 revoke vs in-flight action | grant status read in action tx; CST-009 |
| D8-21 concurrent verify + duplicate submit | CST-005/007 + submit idempotency |
| D8-22 stale autosave | autosave_revision optimistic marker |
| D8-23 asset callback duplicates | CST-018 + idempotency |
| D8-24 adjustment vs reservation | sku_stocks lock + CST-061 final arbiter |
| D8-25 fingerprint conflict | CST-048/125 |

**Coverage:** every CST marked critical appears in ≥1 test row; every
Tier A history table has an exactly-one-row-per-winning-transition
assertion (ADR-DB4-002 rule 4).
