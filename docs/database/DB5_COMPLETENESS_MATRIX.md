# DB5 — Completeness Matrix

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Status vocabulary:** `complete` · `complete-deferred-syntax` (design locked,
only physical emission pending a DB6 spike) · `no-index-required` (explicit
rationale) · `unresolved`.

**Exit gate: 0 unresolved critical items.**

## 1. Queries Q-01 … Q-33

| Q | Prio | Index or rationale | Status |
|---|---|---|---|
| Q-01 | P1 | IDX-065 — pagination amended to `KEYSET` 2026-08-02 (ADR-DB5-001 R10); access path measured, see [`DB5_Q01_ACCESS_PATH_EVIDENCE.md`](./DB5_Q01_ACCESS_PATH_EVIDENCE.md) | complete |
| Q-02 | P1 | IDX-011, 068–071, 015 | complete |
| Q-03 | P1 | IDX-016, 113, 114, 069 | complete |
| Q-04 | P1 | IDX-066, 050 | complete |
| Q-05 | P1 | IDX-052 | complete |
| Q-06 | P2 | IDX-067, 065, 066 | complete |
| Q-07 | P1 | IDX-053 | complete |
| **Q-08** | **P0** | IDX-007 | complete |
| **Q-09** | **P0** | PK probes, IDX-075 | complete |
| Q-10 | P2 | IDX-023 (backward), 116 | complete |
| **Q-11** | **P0** | **IDX-024** | complete |
| Q-12 | P2 | IDX-039 (backward) | complete |
| Q-13 | P1 | IDX-037, 040 | complete |
| **Q-14** | **P0** | IDX-025, 063, 026 | complete |
| Q-15 | P1 | IDX-031, 032, 033, 035, 036 | complete |
| **Q-16** | **P0** | IDX-043, 079, 080, 081, 076, 078 | complete |
| Q-17 | P1 | IDX-074, 075 | complete |
| Q-18 | P1 | IDX-074, 075 | complete |
| Q-19 | P1 | IDX-082, 044 | complete |
| Q-20 | P1 | **no index — IDX-R01** (column-vs-column predicate; ≤ dozens of rows; would tax the lock anchor) | **no-index-required** |
| Q-21 | P1 | IDX-073 | complete |
| Q-22 | P1 | 12 buckets, all reusing existing indexes; **0 new** | complete |
| Q-23 | P1 | IDX-076, 081 | complete |
| Q-24 | P1 | IDX-084 | complete |
| Q-25 | P1 | IDX-085 | complete |
| Q-26 | P1 | IDX-086, 087 | complete |
| **Q-27** | **P0** | **IDX-088** + `SKIP LOCKED` | complete-deferred-syntax |
| **Q-28** | **P0** | **IDX-058** | complete |
| Q-29 | P2 | IDX-095, 096, 097, 098 | complete |
| **Q-30** | **P0** | PK, IDX-099 | complete |
| **Q-31** | **P0** | IDX-006 | complete |
| **Q-32** | **P0** | IDX-016, 113, 114 + `FOR UPDATE` | complete-deferred-syntax |
| Q-33 | P3 | **no index — IDX-R02** (P3, tooling deferred, highest-write table) | **no-index-required** |

**33/33 · 0 unresolved.**

## 2. Operational queries QX-01 … QX-11

| QX | Prio | Index or rationale | Status |
|---|---|---|---|
| QX-01 | P2 | IDX-100, 101, 102 | complete |
| **QX-02** | **P0** | IDX-103, 104 | complete |
| QX-03 | P1 | IDX-091, 092 | complete-deferred-syntax |
| QX-04 | P0 | = Q-27, IDX-088 | complete-deferred-syntax |
| QX-05 | P0/P2 | IDX-058, 093, 094 | complete |
| QX-06 | P2 | IDX-105 | complete |
| **QX-07** | **P0** | IDX-108 | complete |
| QX-08 | P2 | **no index — IDX-R03** (handful of rows) | **no-index-required** |
| **QX-09** | **P0** | IDX-035, 036 | complete |
| QX-10 | P1 | IDX-109, 110 | complete |
| **QX-11** | **P0** | IDX-111 | complete |

**11/11 · 0 unresolved.**

## 3. Additional retained access paths

30 paths in [`DB5_ACCESS_PATH_MATRIX.md`](./DB5_ACCESS_PATH_MATRIX.md) §3 —
**30/30 complete**, each naming a serving index.

## 4. Tables (78)

| Group | Tables | Indexed | No perf index needed | Status |
|---|---|---|---|---|
| Identity/Customer | 11 | 11 | — | complete |
| Catalog | 7 | 7 | — | complete |
| Inventory | 4 | 4 | — | complete |
| Asset | 3 | 3 | — | complete |
| Design | 12 | 12 | — | complete |
| Ordering | 13 | 13 | — | complete |
| Quotation | 4 | 4 | — | complete |
| Payment | 5 | 5 | — | complete |
| Production | 5 | 5 | — | complete |
| Gallery/Content | 6 | 6 | — | complete |
| Notification/Audit/Platform | 8 | 8 | — | complete |
| **Total** | **78** | **78** | — | **complete** |

Every table has at least a PK (CST-001). `admin_credentials` (TBL-002) is the
only table with **PK only** — deliberate: it is reached via an
already-resolved account, and `credential_reference` is `[SEC]` opaque.

## 5. Relationships (105)

Reviewed in [`DB5_FK_INDEX_REVIEW.md`](./DB5_FK_INDEX_REVIEW.md):

| Verdict | Count |
|---|---|
| required | 30 |
| recommended | 11 |
| covered by an existing unique/composite | 30 |
| unnecessary | 33 |
| deferred | 2 |
| **Reviewed** | **105 · complete** |

## 6. Constraints (125)

Mapped in [`DB5_CONSTRAINT_INDEX_MAP.md`](./DB5_CONSTRAINT_INDEX_MAP.md):

| Category | Count | Index consequence |
|---|---|---|
| PK (CST-001 blanket) | 1 | 78 PK indexes |
| Unique / partial unique (CST-002..051) | 50 | 63 indexes |
| Exclusion (CST-046) | 1 | IDX-056, conditional |
| CHECK (CST-060..074) | 15 | none |
| Nullability (CST-080) | 1 | none |
| Immutability / append-only (CST-090..100) | 11 | none |
| TX/App-only (CST-110..125) | 16 | none |
| **Total** | **125 · complete** | 0 duplicates |

## 7. Invariants (35)

| INV | Index support | Status |
|---|---|---|
| INV-01/03 approval immutability & chain | IDX-025, 044, 045; CST-091/095 triggers | complete |
| INV-02/12 quotation & item immutability | IDX-039, 033; CST-092/093 | complete |
| INV-04 obligation independence | **IDX-042** | complete |
| INV-05 reservation gate | IDX-018, 114 (+ CST-111 TX) | complete |
| INV-06 production gate | IDX-044 (+ CST-112 TX) | complete |
| INV-07 provider event | **IDX-043** | complete |
| INV-08 grant scope | IDX-007, 106 | complete |
| INV-09/21/22 asset classification | representation only (D7-12); no index enforces | complete |
| INV-10 no binary in PG | IDX-019 storage key | complete |
| INV-11 exact money | no amount indexed | complete |
| INV-13 COP never a SKU | absent columns by design | complete |
| INV-14 append-only history | IDX-100/101/102/115/095 | complete |
| INV-15 server-side verification | IDX-043 | complete |
| **INV-16 single active review** | **IDX-024** | complete |
| INV-17/32 design hash | no index (hash column) | complete |
| INV-18 non-negative stock | IDX-016 anchor + CST-061 | complete |
| **INV-19/24 idempotency & request→order** | **IDX-058, IDX-032** | complete |
| INV-20 step-up evidence | evidence columns, not indexed | complete |
| INV-23 outbox payload immutable | IDX-088 claim; no payload index | complete |
| INV-25 association uniqueness | IDX-046..051 | complete |
| INV-28/29/34, remaining | operational/portability; no index consequence | complete |

**35/35 · 0 unresolved.**

## 8. Guards (30)

| GRD | Access path | Status |
|---|---|---|
| GRD-002/003 grant + step-up | IDX-007; evidence columns | complete |
| **GRD-004 single active review** | **IDX-024** | complete |
| GRD-006 acceptance binds current version | IDX-041, 037 | complete |
| GRD-007 approval binds exact version + hash | IDX-025, 023 | complete |
| **GRD-008 effective agreement set** | **IDX-108** (+ CST-046 conditional) | complete |
| GRD-009 order creation | **IDX-032** | complete |
| GRD-011/012 payment verification & idempotency | IDX-043, 058 | complete |
| GRD-013 reservation gate | IDX-018, 114 | complete |
| **GRD-014 stock arithmetic** | **IDX-016 + 113 + 114** | complete |
| GRD-015/022 production gate, ON_HOLD | order lock, IDX-082 | complete |
| GRD-016 final payment before dispatch | order lock + IDX-075 (TX read) | complete |
| GRD-017/024 shipping freeze | IDX-035, 036 | complete |
| GRD-020 cancellation stage matrix | IDX-034, 103, 104 | complete |
| GRD-021 refund ≤ refundable | IDX-122, 124 (TX aggregate) | complete |
| GRD-023 adjustment reason | CST-071; no index | complete |
| GRD-026 OTP rate limit | **IDX-111** | complete |
| GRD-027 stale autosave | optimistic marker; no index | complete |
| GRD-028 template clone | no index | complete |
| **GRD-029 outbox exclusive claim** | **IDX-088 + `SKIP LOCKED`** | complete-deferred-syntax |
| GRD-030 fingerprint mismatch | IDX-058 probe + compare | complete |
| Remaining guards | covered by the above paths | complete |

**30/30 · 0 unresolved.**

## 9. Concurrency scenarios (28)

Full table in [`DB5_LOCKING_ACCESS_PATHS.md`](./DB5_LOCKING_ACCESS_PATHS.md) §10.

| Status | Count |
|---|---|
| complete | 18 |
| complete-deferred-syntax (row-lock emission, DB6 spike) | 10 |
| unresolved | **0** |

**28/28.**

## 10. JSONB columns (9)

| # | Column | Decision |
|---|---|---|
| 1–3 | design documents (session, version, template) | no index |
| 4 | outbox payload | no index (**prohibited**) |
| 5 | idempotency result | no index |
| 6 | provider redacted payload | no index |
| 7 | audit summary | no index |
| 8 | notification params | no index |
| 9 | policy config value | no index |

**9/9 · no-index-required · 0 GIN · 0 schema change requests.**

## 11. Cleanup and expiry scans

11 scans indexed (IDX-085, 090, 093, 094, 105, 109, 110, 112, 121, 133 + the
challenge/attempt cascade), **3 deliberate no-index decisions** (archive
tables, notification retention, audit/ledger retention), **0 hard-coded
durations**. See
[`DB5_ARCHIVE_RETENTION_INDEXING.md`](./DB5_ARCHIVE_RETENTION_INDEXING.md) §11.

**Complete.**

## 12. Dashboard subqueries (12)

All 12 buckets mapped in
[`DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md`](./DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md) §2:
10 use an existing index, 2 use a justified sequential scan (low stock,
dead-letter alerts). **0 new indexes; 0 materialized views.**

**Complete.**

## 13. DB5 decisions

| Decision | ADR | Status |
|---|---|---|
| Pagination strategy | ADR-DB5-001 | Accepted |
| Text search, collation, slug/token lookup | ADR-DB5-002 | Accepted |
| Worker claim indexing | ADR-DB5-003 | Accepted |
| Index governance | ADR-DB5-004 | Accepted |

## 14. Deliverables (30 required)

26 `docs/database/DB5_*` files + 4 `ADR-DB5-*` — **30/30 present**.

## 15. Roll-up

| Dimension | Total | Complete | Deferred syntax | No index required | Unresolved |
|---|---|---|---|---|---|
| Queries Q-01..Q-33 | 33 | 29 | 2 | 2 | **0** |
| Operational QX-01..QX-11 | 11 | 8 | 2 | 1 | **0** |
| Additional access paths | 30 | 30 | — | — | **0** |
| Tables | 78 | 78 | — | — | **0** |
| Relationships | 105 | 105 | — | — | **0** |
| Constraints | 125 | 125 | — | — | **0** |
| Invariants | 35 | 35 | — | — | **0** |
| Guards | 30 | 29 | 1 | — | **0** |
| Concurrency scenarios | 28 | 18 | 10 | — | **0** |
| JSONB columns | 9 | — | — | 9 | **0** |
| Cleanup scans | 14 | 11 | — | 3 | **0** |
| Dashboard buckets | 12 | 10 | — | 2 | **0** |
| Indexes defined | 134 | 134 | — | — | **0** |
| Rejected indexes recorded | 15 | 15 | — | — | **0** |
| Schema change requests | 0 | — | — | — | **0 blocking** |

**Unresolved critical items: 0. Exit gate met.**

## 16. Deferred items (all with owner and acceptance condition)

| Item | Owner | Acceptance condition |
|---|---|---|
| `FOR UPDATE` / `SKIP LOCKED` emission | DB6 spike | verified SQL, or documented raw-SQL adapter |
| Partial-index predicate matching verified | DB6 | EXPLAIN shows each partial in use |
| Page size, batch size, TTL, retry values | DB6 config | present in `policy_configurations`; no literals |
| Cursor token encoding | DB6 | opaque, versioned, no authorization encoded |
| INCLUDE columns | DB9/DB10 | BUFFERS shows heap fetches dominating |
| IDX-056 exclusion constraint | future | extension request + fallback |
| `vi-x-icu` collated index | future | a DB-side Population B sort exists; DB10 REINDEX activated same change |
| `pg_trgm` / FTS | future ADR | prefix search measured insufficient |
| Latency budgets | DB10 | measured production baseline |
| Unused-index removal (IDX-078/097/098 first) | DB10 | ADR-DB5-004 R7 evidence |
| Q-21 → KEYSET | DB10 | an ADR-DB5-001 R8 threshold observed |
| Autovacuum/bloat tuning | DB10 | measured on TBL-025/070/073/074 |
