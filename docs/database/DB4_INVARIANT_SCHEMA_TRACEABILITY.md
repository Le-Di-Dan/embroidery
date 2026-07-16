# DB4 — Invariant → Schema Traceability (35/35)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Source:** [`DB3_INVARIANT_ENFORCEMENT_PLAN.md`](./DB3_INVARIANT_ENFORCEMENT_PLAN.md).
Layers unchanged from DB3; this maps each invariant to concrete logical
structures. `dir` = DB mechanism designed here, implemented DB6 (trigger/
partial unique/raw SQL). Ops/process invariants (INV-26..31, 33..35) have
no table mapping by design — noted with their DB1 owners.

| INV | Logical structures (tables/columns) | Constraints | RELs | State/history | DB enforcement | TX/App | DB7 | DB8 | Deferred physical |
|---|---|---|---|---|---|---|---|---|---|
| INV-01 approved design immutable | design_versions (frozen once sent), approval_snapshots + children | CST-090/091 | REL-045/051/054/055 | LC-08/10 Tier B | dir (reject-mutation triggers) | no-update repos; approval tx | D7-03 | D8-08 | trigger DDL → DB6 |
| INV-02 sent quotation immutable | quotation_versions + line_items | CST-092 | REL-066/067 | LC-13 Tier B | dir | freeze-at-send tx | D7-03 | D8-10/11 | trigger → DB6 |
| INV-03 production ↔ exact approval | production_jobs.approval_snapshot_id NN, production_specifications (document_hash copy, 1–1) | CST-041/042/080/095 | REL-091/093 | LC-18 Tier A | yes (NN/UQ) + dir (IMM) | GRD-015 in start tx | D7-07 | D8-13 | — |
| INV-04 two independent obligations | payment_obligations.kind + partial unique live-per-(order,kind) | CST-039 | REL-081/083 | LC-15 | yes | order-creation tx creates both | D7-13 | D8-04 | partial unique → DB6 |
| INV-05 reservation gate | inventory_reservations.order_id NN; obligation status rows as gate facts | CST-080/111 | REL-031 | LC-17 | supporting refs | **TX** GRD-013 | — | D8-05/07 | — |
| INV-06 ordering precondition chain | orders.status + obligation/reservation/approval rows | CST-112/113 | REL-071..077 | LC-14 Tier A | supporting | **TX** GRD-015..018/022 | D7-02 | D8-13/15 | — |
| INV-07 idempotent payment callbacks | payment_provider_events UQ + idempotency_records UQ + application_outcome | CST-040/048 | REL-086 | LC-16 Tier B | **yes (uniques)** | callback tx (GRD-011/012) | D7-08/09 | **D8-01/02** | — |
| INV-08 grant scope | secure_access_grants (customer_id+request_id NN, scope_kind, expires_at NN, status) | CST-008/009/080 | REL-009/010 | LC-03 | supporting | **APP/TX** GRD-002 in action tx | D7-13 | D8-20 | — |
| INV-09 private assets by default | assets.classification (private default), derivative is_watermarked | CST-123 | REL-032 | LC-06 | representation | **APP** access-scope service | D7-12 family | — | — |
| INV-10 no binaries in PG | assets.storage_key only; zero BLOB columns in all 78 tables | schema-scan rule | — | — | **design rule (verified)** | storage port | D7 schema scan | — | — |
| INV-11 exact decimal money | all `*_amount` numeric(14,2) + currency_code; no float columns exist | CST-063/068 | — | — | **yes (type rule)** | Money VO | D7-06 | — | — |
| INV-12 historical commercial snapshots | quotation_versions/line_items, order_items, orders.total_amount, shipping_snapshots, display-copy columns | CST-092/093/094 | REL-073/075/079 | snapshot model §2 | dir (IMM triggers) | snapshot-not-reference writes | D7-03 | — | triggers → DB6 |
| INV-13 COP ≠ store SKU | customer_owned_products has **no** SKU/stock columns; order_items XOR check | CST-067/121 | REL-063 | — | yes (absent-FK design + CK) | request modeling | D7 representation | — | — |
| INV-14 sensitive transitions audited | audit_events (actor/action/target/reason/correlation NN) + Tier A transition tables | CST-072/098 | REL-103/105 | ADR-DB4-002 | dir (append-only) | **APP** in-tx audit (SE-019) | D7-10/11 | — | retention duration [cfg] |
| INV-15 no redirect-based success | payment_provider_events.signature_valid + verified path only; no redirect-success field exists | CST-118 | REL-086 | LC-16 | representation | **APP+EXT** GRD-011 | — | D8-01 | — |
| INV-16 single active review | design_versions partial unique (case) where SENT_FOR_REVIEW | **CST-022** | REL-045 | LC-08 | **yes (partial unique)** | GRD-004 tx | **D7-04** | **D8-09** | partial unique → DB6 |
| INV-17 approved never draft again | design_versions.status CHECK + no such transition + IMM trigger | CST-060/090 | — | LC-08 | dir | GRD-019 | D7-02/03 | D8-08 | — |
| INV-18 non-negative stock | sku_stocks.quantity_on_hand CK ≥ 0; locked updates + ledger | **CST-061**/071 | REL-027 | LC-17 Tier B | **yes (check)** | TX row lock (GRD-014/023) | D7-05 | D8-05/24 | — |
| INV-19 no dup order/payment/lost version | orders.custom_request_id UQ; provider event UQ; idempotency UQ; version chains | CST-030/040/048/021/036 | REL-071 | — | **yes (uniques)** | idem claims (GRD-009/012) | D7-08/09/13 | D8-12/01/25 | — |
| INV-20 approval only via secure flow | approval_snapshots.grant_id + step_up_challenge_id NN | CST-080 | REL-053 | LC-08/10 | supporting NN | **APP** GRD-002/003/025 | D7-07 | D8-20 | — |
| INV-21 no customer export | production artifacts internal (classification); no export surface columns | CST-123 | REL-094 | — | representation | **APP** | D7-12 family | — | — |
| INV-22 watermark on customer previews | asset_derivatives.is_watermarked + kind | CST-018 | REL-047 | LC-06 | representation | **APP** derivative rules | — | — | — |
| INV-23 outbox for external effects | outbox_events (same-tx enqueue; payload immutable; bounded dispatch metadata) | CST-099 | REL-104 | LC-22 | dir (column-scoped trigger) | **TX** same-tx enqueue | D7-11 | **D8-17** | skip-locked → DB6 spike |
| INV-24 idempotency scoped/expired | idempotency_records (namespace+key UQ, fingerprint, expires_at NN) | **CST-048**/125 | — | LC-23 | **yes (unique)** | claim tx + GRD-030 | D7-08 | D8-25 | TTL values [cfg] |
| INV-25 referential integrity | all REL-* FKs (restrict; no physical cascade into history) | CST-001/080 + REL catalog | REL-001..105 | — | **yes (FKs)** | — | D7 FK tests | — | DDL → DB6 |
| INV-26 shared migrations immutable | — (ops; ADR-DB1-003/004) | — | — | — | PROC + checksum | — | drift check | — | DB6 tooling |
| INV-27 new change = new migration | — (ops) | — | — | — | PROC | — | — | — | — |
| INV-28 fresh install full migrate | DB6 migration order per [`DB4_DB6_HANDOFF.md`](./DB4_DB6_HANDOFF.md) | — | — | — | DB+PROC | — | fresh-install test | — | DB6 |
| INV-29 upgrade path | same handoff | — | — | — | DB+PROC | — | upgrade test | — | DB6 |
| INV-30 git↔schema traceability | — (ops; ADR-DB1-004) | — | — | — | PROC + verify cmd | — | verify test | — | DB6 |
| INV-31 no out-of-band changes | — (ops) | — | — | — | PROC | — | drift test | — | — |
| INV-32 reproducible canonical hashes | design_versions.document_hash/preview_hash format; template/agreement hashes | CST-070/074 | — | — | format CK dir | **APP** JCS+SHA-256 package | **D7-15** | — | package CP |
| INV-33 backup security/off-site | — (ops; ADR-DB1-014) | — | — | — | EXT+PROC | — | — | — | DB10 (O-007) |
| INV-34 restore compatibility | — (ops; manifest gating) | — | — | — | PROC | — | — | — | DB10 |
| INV-35 no incompatible volume reuse | — (ops; ADR-DB1-013) | — | — | — | PROC + verify cmd | — | — | — | DB6/DB10 |

**Roll-up:** 35/35 mapped. 26 have direct schema structures; 9 are
operational/process invariants whose DB1-assigned mechanisms are unchanged
(noted, not re-owned). No invariant relies on JSONB internals, derived
projections, or audit-only history.
