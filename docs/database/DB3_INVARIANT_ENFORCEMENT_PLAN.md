# DB3 — Invariant Enforcement Plan (35/35)

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Layers:** `DB` (constraint/trigger/unique/check — designed at DB4, no SQL
here) · `TX` (explicit transaction + locking) · `APP` (guards/domain logic) ·
`EXT` (external verification) · `PROC` (process/governance). **Primary** =
lớp quyết định; còn lại là defense-in-depth. Guards/transitions per
[`DB3_TRANSITION_GUARD_CATALOG.md`](./DB3_TRANSITION_GUARD_CATALOG.md) /
[`DB3_LIFECYCLE_SPECIFICATIONS.md`](./DB3_LIFECYCLE_SPECIFICATIONS.md).
Failure behavior mặc định: reject + stable failure code + audit-on-failure
theo guard; ngoại lệ ghi rõ.

| INV | Owner (ctx/agg) | Primary | Defense | Transitions / guards | DB4 handoff | DB7 | DB8 | Deferred | Notes |
|---|---|---|---|---|---|---|---|---|---|
| INV-01 approved design immutable | DSN/AGG-10+11 | **DB** (reject-mutation trigger) | APP (no-update repo), TX (approval tx) | TR-LC08-04; GRD-024 | trigger on approved versions + snapshots | mutation-rejection | approve-vs-supersede CC-02 | — | corrections = new version/approval only |
| INV-02 sent quotation version immutable | QUO/AGG-14 | **DB** trigger | APP, TX (freeze at send) | TR-LC12-02; GRD-024 | trigger on sent versions | yes | CC-05/28 | — | |
| INV-03 production ↔ exact approved version | PRD/AGG-17 | **APP** (GRD-015 + spec freeze) | DB (required refs + hash fields), TX | TR-LC18-01/02; GRD-007/015 | NOT NULL approval ref + hash link candidates | ref/hash presence | CC-12 | — | spec never mutated (ADR-DB3-003) |
| INV-04 two independent obligations | PAY/AGG-16 | **DB** (two rows, kind-distinct) | APP | TR-LC14-01/TR-LC15-01 | uniqueness (order, kind) candidate | yes | CC-10 | — | |
| INV-05 official reservation gate | INV/AGG-07 | **TX** (GRD-013 in reserve tx) | APP, DB (state refs) | TR-LC17-04 | — | — | CC-20/22 | — | |
| INV-06 ordering preconditions chain | ORD/AGG-15 | **TX** (guards in order tx) | APP | GRD-015/016/017/018 | — | transition tests | CC-12/14/15 | — | |
| INV-07 idempotent payment callbacks | PAY+PLT | **TX+DB** (GRD-011/012; unique provider event) | EXT (signature), APP | TR-LC16-03 | unique provider event ref + idempotency key | unique tests | **CC-07/08 (critical)** | TTL values | E2E-10 |
| INV-08 grant scope | CUS/AGG-04 | **APP** (GRD-002 in tx) | DB (scope refs) | all secure actions | scope binding fields | — | CC-16 | expiry values | |
| INV-09 private assets by default | AST/AGG-08 | **APP** (access scope) | EXT (signed URLs), PROC | asset access service | classification field | — | — | — | no public listing |
| INV-10 no binaries in PG | AST | **PROC/DB4 design rule** | APP | — | schema review: no BLOB columns | schema scan | — | — | |
| INV-11 exact decimal money | shared | **DB** (numeric type rule) | APP (Money VO) | — | numeric-only columns | type introspection | — | precision → DB4 | |
| INV-12 historical commercial snapshots | QUO/ORD | **DB** trigger + snapshot-not-reference | APP | TR-LC12-02, TR-LC14-01 | immutable item/version structures | mutation-rejection | — | — | price changes never propagate |
| INV-13 COP ≠ store SKU | ORD/AGG-13 | **APP** | DB (no SKU/stock refs from COP) | request modeling | absent-FK design rule | representation test | — | — | |
| INV-14 sensitive transitions audited | AUD + owners | **APP** (audit in same use case) | DB (append-only), PROC | mọi transition đánh dấu audit | append-only audit shape | reason-required tests | — | retention period | [`DB3_AUDIT_SPECIFICATION.md`](./DB3_AUDIT_SPECIFICATION.md) |
| INV-15 no redirect-based success | PAY | **APP+EXT** (GRD-011 only path) | TX | TR-LC16-03 | — | — | CC-07 | — | redirect chỉ là UX |
| INV-16 single active review | DSN/AGG-10 | **DB** (partial unique) | TX (GRD-004), APP | TR-LC08-02 | **partial unique index** | constraint test | **CC-03 (critical)** | — | |
| INV-17 approved never back to draft | DSN | **DB** trigger + no such transition | APP (GRD-019) | LC-08 invalid set | trigger | transition test | CC-02 | — | |
| INV-18 non-negative stock | INV/AGG-07 | **DB** (check) + TX lock | APP (GRD-014/023) | TR-LC17-*, adjustments | check constraint + locked updates | check test | CC-20/24 | — | override chỉ ở adjustment, audited |
| INV-19 no dup order/payment/lost version | ORD/PAY/DSN | **DB** (uniques) + TX | APP (GRD-009/012) | TR-LC14-01, TR-LC16-03, LC-08 | request→order unique; provider event unique; version chain | unique tests | CC-11/07 | — | |
| INV-20 approval only via secure flow | DSN/CUS | **APP** (GRD-002/003/025) | PROC (BR-008) | TR-LC08-04 | — | — | CC-16 | — | messaging apps never authoritative |
| INV-21 no customer export | AST/DSN | **APP** (no surface) + EXT (authz) | PROC | asset access | — | — | E2E-09 | — | |
| INV-22 watermark on customer previews | AST | **APP** (derivative rules) + **DB** partial CK (CST-126, APP2-DB01) | PROC | derivative jobs | derivative kind field | D7 catalog-preview suite | — | — | internal artifacts unwatermarked; CATALOG_PREVIEW is catalog display media, never watermarked |
| INV-23 outbox for external effects | PLT + owners | **TX** (same-tx enqueue) | APP, DB (append) | TR-LC22-01 | outbox shape + dispatch-status exception | — | **CC-25** | processed retention | |
| INV-24 idempotency scoped/expired | PLT | **DB** (unique) + APP | TX | LC-23 | unique (namespace,key); expiry field | unique test | fingerprint races | TTL classes values | |
| INV-25 referential integrity | all | **DB** (FKs at DB4) | APP | relationship model rows `ref` | FK candidates per DB2 relationships | FK tests | — | — | |
| INV-26 shared migrations immutable | PLT/ops | **PROC** + tooling checksum | — | — | (DB1 domain) | drift check | — | — | ADR-DB1-003/004 |
| INV-27 new change = new migration | ops | **PROC** | — | — | — | — | — | — | |
| INV-28 fresh install full migrate | ops | **DB+PROC** | — | — | — | fresh-install test | — | — | |
| INV-29 upgrade path | ops | **DB+PROC** | — | — | — | upgrade test | — | — | |
| INV-30 git↔schema traceability | ops | **PROC** + verify command | — | — | — | verify command test | — | — | ADR-DB1-004 |
| INV-31 no out-of-band DB changes | ops | **PROC** | drift detection | — | — | drift test | — | — | |
| INV-32 reproducible canonical hashes | design-document pkg | **APP** (JCS+SHA-256) | PROC (test vectors) | TR-LC08-02/04 hash computation | hash storage format | golden-hash cross-machine | — | — | ADR-DB1-012 |
| INV-33 backup security/off-site/tested | ops | **EXT+PROC** | — | — | — | — | — | cadence/off-site (O-007) | DB10 |
| INV-34 restore compatibility known | ops | **PROC** (manifest gating) | — | — | — | — | — | — | ADR-DB1-014 |
| INV-35 no incompatible volume reuse | ops | **PROC** + verify command | — | — | — | — | — | — | ADR-DB1-013 |

## Layer roll-up

- **Primary DB:** INV-01/02/04/11/12/16/17/18/19/24/25/28/29 (13)
- **Primary TX:** INV-05/06/07/23 (4)
- **Primary APP:** INV-03/08/09/13/14/15/20/21/22/32 (10)
- **Primary EXT:** INV-33 (+EXT tham gia INV-07/15/21) (1)
- **Primary PROC:** INV-10/26/27/30/31/34/35 (7)

Không invariant nào còn "open": INV-32/34/35 (OPEN tại DB0) nay đã có owner +
mechanism qua ADR-DB1-012/014/013 và verify command. Mọi invariant có DB4
handoff (hoặc ghi rõ thuộc DB1 operational domain) và DB7/DB8 owner trong
[`DB3_TEST_HANDOFF.md`](./DB3_TEST_HANDOFF.md).
