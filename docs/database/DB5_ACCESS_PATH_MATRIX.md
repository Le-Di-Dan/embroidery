# DB5 — Access Path Matrix

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Nature:** One row per query. Entry table, join order, filter/sort columns,
security-scope columns, selectivity, candidate index, pagination, locking,
fallback, EXPLAIN scenario, status. IDs are DB4 IDs.

**Legend** — Sel: `unique` single-row probe · `high` selective range ·
`med` · `low` (scan is legitimate). Pag per
[ADR-DB5-001](../adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md).
Fallback = plan if the index is absent/unused.
Status: `complete` · `complete-deferred-syntax` · `no-index-required`.

## 1. Q-01 … Q-33

| Q | Entry table | Join order (REL) | Filter COL | Sort COL | Scope COL | Sel | IDX | Pag | Lock/Cons | Fallback | EXPLAIN scenario | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-01 | TBL-012 | →TBL-011 (REL-020) | 012-01, 012-07, 012-09 | 012-10, id | 012-07 | med | IDX-065 | OFFSET | —/E | seq scan 100 rows | E1 catalog, category-filtered | complete |
| Q-02 | TBL-012 | →013 (REL-021)→014 (REL-022); →015/016 (REL-023); →017→022 (REL-025) | 012-03, 012-07 | child display_order | 012-07 | unique | IDX-011, 068–071, 015 | none | —/E | seq scan | E2 slug probe + nested loops | complete |
| Q-03 | TBL-014 | →018 (REL-026); →020 (REL-029); →021 (REL-031) | 018-01, 020-04, 021-04 | — | public | high | IDX-016, 113, 114, 069 | none | —/S | seq scan small | E3 active-set partial scans | complete |
| Q-04 | TBL-064 | →065→022 (REL-095) | 064-04, 064-06 | 064-05, id | 064-04 | med | IDX-066, 050 | OFFSET | —/E | seq scan | E4 published partial | complete |
| Q-05 | TBL-066 | — | 066-01, 066-02, 066-05 | — | 066-05 | unique | IDX-052 | none | —/E | seq scan | E5 composite unique probe | complete |
| Q-06 | TBL-066, 012, 064 | none (3 scans) | is_indexable, status | id | status | med | IDX-067, 065, 066 | BATCH_SCAN | —/E | seq scan | E6 indexable enumeration | complete |
| Q-07 | TBL-067 | — | 067-01, 067-04 | — | public | unique | IDX-053 | none | —/S | seq scan | E7 path probe | complete |
| **Q-08** | TBL-008 | — | 008-03 | — | **008-03 is the boundary** | unique | IDX-007 | none | —/S | **unacceptable** | E8 hash probe | complete |
| **Q-09** | TBL-037 | →027 (REL-062)→028 (REL-044); →050 (REL-062)→051 (REL-068); →043 (REL-071)→054 (REL-081) | 037 id + grant scope | obligation kind | **008-02 = 037 id** | unique | PK probes, IDX-075 | none | —/S | n/a | E9 pointer-chase graph | complete |
| Q-10 | TBL-028 | →030 (REL-049) | 028-01 | 028-02 DESC, id DESC | grant/admin | high | IDX-023 (backward), 116 | OFFSET | —/S | sort ≤ tens | E10 backward index scan | complete |
| **Q-11** | TBL-028 | — | 028-01, 028-04 | — | grant | unique | **IDX-024** | none | adjacent to version lock (CC-02/03/04)/S | **unacceptable** | E11 partial-unique probe | complete |
| Q-12 | TBL-051 | — | 051-01 | 051-02 DESC, id DESC | grant/admin | high | IDX-039 (backward) | OFFSET | —/S | sort | E12 backward scan | complete |
| Q-13 | TBL-050 | →051 (REL-068)→052 (REL-066) | 050-02 | line position | grant | unique | IDX-037, 040 | none | —/S | seq scan | E13 pointer + lines | complete |
| **Q-14** | TBL-031 | →032 (REL-054), →033 (REL-055) | 031-01 | child position | internal | unique | IDX-025, 063, 026 | none | in-tx/S | n/a | E14 snapshot probe | complete |
| Q-15 | TBL-043 | →044 (REL-075); →047 (REL-078); →048 (REL-079) | 043-01/02/id | 044-02 | grant/admin | unique | IDX-031, 032, 033, 035, 036 | none | —/S | seq scan | E15 order graph | complete |
| **Q-16** | TBL-056 | →055 (REL-086)→054 (REL-084) | 056-01/02, 056-03, 056-09; 055-07 | 056-09 DESC, id DESC | internal/financial | unique(a)/high | IDX-043, 079, 080, 081, 076, 078 | **KEYSET** | reconcile locks attempt (CC-09)/S | seq scan on growing table — **unacceptable** | E16 four forms a–d | complete |
| Q-17 | TBL-043 | →054 (REL-081) | 043-06, 054-02, 054-05 | 043 created_at, id | internal | high | IDX-074, 075 | TOP_N | —/S | seq scan | E17 status partial | complete |
| Q-18 | TBL-043 | →054 (REL-081) | 043-06, 054-02, 054-05 | 043 created_at, id | internal | high | IDX-074, 075 | TOP_N | —/S | seq scan | E18 as E17 | complete |
| Q-19 | TBL-059 | →043 (REL-090); →031 (REL-091) | 059-03 | created_at, id | internal | high | IDX-082, 044 | TOP_N | start/cancel lock order row (CC-12)/S | seq scan | E19 active-jobs partial | complete |
| Q-20 | TBL-018 | →020/021 for reserved column | 018-02 vs 018-03 | id | internal | **low** | **none** (IDX-R01) | TOP_N | —/S | **seq scan is the plan** | E20 assert seq scan acceptable | **no-index-required** |
| Q-21 | TBL-037 | — | 037-03 | created_at DESC, id DESC | internal | med | IDX-073 | OFFSET | —/S | sort hundreds | E21 status+sort, no sort node | complete |
| Q-22 | composed | per bucket | per bucket | per bucket | internal | — | see dashboard doc | TOP_N | —/S | per bucket | E22 per bucket | complete |
| Q-23 | TBL-055 | →056 unmatched | 055-07; 056-03 IS NULL | created_at DESC, id DESC | internal/financial | high | IDX-076, 081 | OFFSET | —/S | seq scan | E23 failed/review partial | complete |
| Q-24 | TBL-051 | — | 051-04, 051-18 | 051-18, id | internal | high | IDX-084 | TOP_N | sweep locks version (CC-06)/E | seq scan | E24 expiry horizon range | complete |
| Q-25 | TBL-025 | — | 025-07, 025-09 | 025-09, id | internal | high | IDX-085 | BATCH_SCAN | per-row (SWEEP)/E | seq scan on hot table | E25 TTL range scan | complete |
| Q-26 | TBL-022; TBL-024 | none (2 scans) | 022-07; 024-03 | created_at, id | internal | high | IDX-086, 087 | BATCH_SCAN | CC-19 idem/E | seq scan | E26 queue drain | complete |
| **Q-27** | TBL-073 | — | 073-05, 073-07 | 073-07 NULLS FIRST, id | internal | high | **IDX-088** | BATCH_SCAN | **FOR UPDATE SKIP LOCKED** (CC-25)/S | **unacceptable** (polled) | E27 claim under contention | complete-deferred-syntax |
| **Q-28** | TBL-074 | — | 074-01, 074-02 | — | internal | unique | **IDX-058** | none | UNIQ arbiter, in-tx/S | **unacceptable** | E28 unique probe + conflict | complete |
| Q-29 | TBL-072 | none (polymorphic, REL-103) | 072-05a/b, 072-03, 072-01, 072-09 | 072-01 DESC, id DESC | internal | high(a,d)/med | IDX-095, 096, 097, 098 | IMMUTABLE_CURSOR | —/S | seq scan on large table — unacceptable | E29 four forms | complete |
| **Q-30** | TBL-022 | →024 (REL-032) | id; 024-01, 024-02, 024-03 | — | **022-02 classification** | unique | PK, IDX-099 | none | —/S | seq scan | E30 derivative resolve | complete |
| **Q-31** | TBL-006 | — | 006-02, 006-03, 006-04, 006-06 | — | security-sensitive | unique | **IDX-006** | none | UNIQ arbiter (CC-17), in-tx/S | unacceptable | E31 partial-unique probe | complete |
| **Q-32** | TBL-018 | →020, →021 | 018-01; 020-04; 021-04 | — | internal | unique | IDX-016, 113, 114 | none | **FOR UPDATE on 018 row** (CC-20/23)/S | **unacceptable** (lock hold) | E32 locked availability | complete-deferred-syntax |
| Q-33 | TBL-073 | — | 073-01 | id | internal | low | **none** (IDX-R02) | BATCH_SCAN | —/E | id-order scan | E33 deferred | **no-index-required** |

## 2. QX-01 … QX-11

| QX | Entry table | Join order | Filter COL | Sort | Scope | Sel | IDX | Pag | Lock/Cons | Fallback | EXPLAIN | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| QX-01 | TBL-042 / 045 / 063 | — | parent id | id | admin | high | IDX-100, 101, 102 | IMMUTABLE_CURSOR | —/S | seq scan | E34 parent timeline | complete |
| **QX-02** | TBL-045 (+043) | — | 045-01, 045-03; 043-06 | id | internal | high | IDX-103, 104 | IMMUTABLE_CURSOR | order row lock (CC-13)/S | unacceptable (resume must be exact) | E35 saga replay | complete |
| QX-03 | TBL-070 | →071 (REL-100) | 070-07 | created_at, id | internal | high | IDX-091, 092 | BATCH_SCAN | CONTENDED_CLAIM (CC-26)/E | seq scan | E36 retry drain | complete-deferred-syntax |
| QX-04 | = Q-27 | | | | | | IDX-088 | | | | | complete-deferred-syntax |
| QX-05 | TBL-074 | — | 074-02/01; 074-06; 074-04+074-07a | expires_at, id | internal | unique/high | IDX-058, 093, 094 | none / BATCH_SCAN | UNIQ / sweep / S+E | unacceptable (lookup) | E37 lookup + TTL sweep | complete |
| QX-06 | TBL-008 | — | 008-05, 008-06 | expires_at, id | internal | high | IDX-105 | BATCH_SCAN | per-row/E | seq scan | E38 hygiene sweep | complete |
| **QX-07** | TBL-069 | — | 069-01, 069-03, 069-07 | 069-07 DESC, id DESC | internal | high | **IDX-108** | TOP_N (1) | in approval tx (GRD-008)/S | seq scan small | E39 effective resolve | complete |
| QX-08 | TBL-009 | →005 signals | 009-03 | created_at, id | internal | **low** | **none** (IDX-R03); IDX-004 for signals | TOP_N | both customer rows locked, ordered (CC-27)/S | **seq scan is the plan** | E40 assert seq scan | **no-index-required** |
| **QX-09** | TBL-047 | →048 (REL-079) | 047-01, 047-10; 048-01 | — | internal | unique | IDX-035, 036 | none | dispatch locks detail row (CC-15)/S | unacceptable | E41 freeze gate | complete |
| QX-10 | TBL-020; TBL-021 | none (2 sweeps) | 020-04+020-05; 021-04+021-05 | expires_at, id | internal | high | IDX-109, 110 | BATCH_SCAN | per-row lock, same as business path (CC-22)/S | seq scan | E42 expiry vs reserve race | complete |
| **QX-11** | TBL-007 | →006 (REL-008) | 007-01, 007-03 | attempted_at | security | high | IDX-111 | none (window count) | in-tx (GRD-026)/S | seq scan on append table — unacceptable | E43 rate window | complete |

## 3. Additional retained access paths

| Path | Entry | Filter COL | Sort | IDX | Lock/Cons | Status |
|---|---|---|---|---|---|---|
| Admin session resolve | TBL-003 | 003-02 | — | IDX-003 | —/S | complete |
| Admin session sweep | TBL-003 | 003-03, 003-04 | expires_at, id | IDX-121 | —/E | complete |
| Sessions by account | TBL-003 | 003-01 | — | IDX-120 | —/S | complete |
| Contacts by customer | TBL-005 | 005-01 | — | IDX-134 | —/S | complete |
| Merge: requests by customer | TBL-037 | 037-02 | — | IDX-117 | both rows locked (CC-27)/S | complete |
| Merge: orders by customer | TBL-043 | 043-03 | — | IDX-118 | CC-27/S | complete |
| Merge: assets by uploader | TBL-022 | 022-08 | — | IDX-119 | CC-27/S | complete |
| Merge: grants by customer | TBL-008 | 008-01 | — | **IDX-107** | CC-27/S | complete |
| Grants by request | TBL-008 | 008-02 | — | IDX-106 | —/S | complete |
| Tombstone follow | TBL-004 | 004-03 | — | IDX-129 | —/S | complete |
| Merge evidence | TBL-010 | 010-01 | id | IDX-135 | —/S | complete |
| Challenge by contact point | TBL-006 | 006-01 | — | IDX-130 | —/S | complete |
| Challenge expiry sweep | TBL-006 | 006-06, 006-07 | expires_at, id | IDX-112 | —/E | complete |
| Ledger replay | TBL-019 | 019-01 | id | IDX-115 | —/S | complete |
| Reservations by order | TBL-021 | 021-02 | — | IDX-126 | CC-21/S | complete |
| Holds by request | TBL-020 | 020-02 | — | IDX-127 | CC-23/S | complete |
| Asset inspections | TBL-023 | 023-01 | inspected_at | IDX-132 | —/E | complete |
| Asset deletion sweep | TBL-022 | 022-07, 022-10 | id | IDX-133 | —/E | complete |
| Reviews by version | TBL-030 | 030-01 | decided_at | IDX-116 | version lock (CC-04)/S | complete |
| Snapshots by request | TBL-031 | 031-02b | — | IDX-136 | —/S | complete |
| Moderation notes | TBL-041 | 041-01 | created_at | IDX-137 | —/S | complete |
| Production notes | TBL-062 | 062-01 | created_at | IDX-138 | —/S | complete |
| Refunds by order | TBL-058 | 058-02 | — | IDX-122 | —/S | complete |
| Refund review queue | TBL-058 | 058-06 | created_at, id | IDX-123 | —/S | complete |
| Reconciliations by attempt | TBL-057 | 057-01 | id | IDX-124 | CC-09/S | complete |
| Fee acknowledgements | TBL-049 | 049-01 | id | IDX-125 | —/S | complete |
| Dead-letter view | TBL-075 | 075-05 | finished_at, id | IDX-131 | —/E | complete |
| Outbox cleanup | TBL-073 | 073-05, 073-09 | dispatched_at, id | IDX-090 | —/E | complete |
| Policy config read | TBL-076 → TBL-077 | 076-01 | — | IDX-060, 061 | —/S | complete |
| Attempts by obligation | TBL-055 | 055-01 | — | IDX-077 | obligation lock (CC-10)/S | complete |

## 4. Roll-up

- **Q-01..Q-33:** 33 rows — 30 `complete`, 2 `complete-deferred-syntax`
  (Q-27, Q-32 — `SKIP LOCKED` / `FOR UPDATE` emission is a DB6 spike),
  2 `no-index-required` (Q-20, Q-33). Q-22 is a composition.
- **QX-01..QX-11:** 11 rows — 8 `complete`, 2 `complete-deferred-syntax`,
  1 `no-index-required` (QX-08).
- **Additional retained paths:** 30 rows, all `complete`.
- **Unresolved: 0.**

Every row names an entry table, a join order in `REL-*` terms, filter and
sort columns in `COL-*` terms, a security scope, a candidate index or an
explicit no-index rationale, a pagination class, a locking/consistency
requirement, a fallback, and an EXPLAIN scenario id (E1..E43) expanded in
[`DB5_EXPLAIN_VALIDATION_PLAN.md`](./DB5_EXPLAIN_VALIDATION_PLAN.md).
