# DB5 — EXPLAIN Validation Plan

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Runs at:** DB9 (representative data exists) / DB6 (smoke-level).
**Nature:** validation *design* — no SQL is written here.

## 1. Ground rules

**A sequential scan on a small table is not a failure.** At the locked
scale several tables hold tens of rows; PostgreSQL will correctly prefer a
seq scan, and forcing an index there would be a misdiagnosis. Two scenarios
(E20, E40) assert a seq scan as the *expected* plan.

**No latency SLA is set here.** Nothing has been benchmarked, so a number
would be fabricated. Validation asserts **plan shape** — which access path,
which index, whether a sort node appears — not milliseconds. Timing budgets
belong to DB10 once a real baseline exists.

**Statistics before conclusions.** `ANALYZE` must run after seeding
(ADR-DB5-004 R8); a plan derived from stale statistics proves nothing.

**Predicate text must match the index predicate exactly**, or a partial
index will not be used. Several scenarios below exist specifically to catch
that class of mistake.

## 2. Dataset scenarios (DB9 input)

| Ref | Dataset | Purpose |
|---|---|---|
| **D-A** | Representative MVP: 60 products / 8 categories / ~30 SKUs; 200 requests spread across all LC-11 states; 80 orders across all LC-14 states; 2 customers with grants | baseline for all P0/P1 plans |
| **D-B** | Skew: one category holding 40 of 60 products; one customer holding 50 requests | tests selectivity assumptions |
| **D-C** | Queue load: 5,000 `DISPATCHED` + 50 `PENDING` + 5 `DEAD_LETTER` outbox rows; mixed NULL / past / future `next_attempt_at` | proves the claim index stays cheap as the table grows |
| **D-D** | History volume: 50,000 `audit_events` across ≥5 target kinds; 20,000 ledger entries | proves history indexes and cursors |
| **D-E** | Expiry: rows already past expiry in every sweep state; reservations with NULL `expires_at` | proves sweep partials |
| **D-F** | Payment: unmatched provider events, a superseded obligation chain, `REQUIRES_REVIEW` attempts, attempts with NULL `provider_ref` | proves the four reconciliation partials |
| **D-G** | Vietnamese text with full diacritics in names, addresses, notes | proves `C`-collation behavior and that no index depends on locale |

## 3. P0 scenarios

| Ref | Query | Data | Expected plan | Unacceptable | Assert |
|---|---|---|---|---|---|
| **E8** | Q-08 token→grant | D-A | Index Scan **IDX-007**, 1 row | any seq scan | index used; expired/revoked tokens still **resolve** (no status predicate) |
| **E9** | Q-09 request graph | D-A | PK/unique probes + IDX-075; nested loops | seq scan on any table | grant scope predicate present in the query |
| **E11** | Q-11 current review | D-A | Index Scan **IDX-024**, ≤1 row | seq scan on `design_versions` | partial predicate text matches index exactly |
| **E14** | Q-14 approval snapshot | D-A | Index Scan IDX-025 | seq scan | — |
| **E16** | Q-16 (a)(b)(c)(d) | **D-F** | (a) IDX-043 · (b) IDX-079 backward-free · (c) **IDX-081** · (d) IDX-080 | seq scan on `payment_provider_events` in any form | (c) must use the `IS NULL` partial, not a filter over a full scan |
| **E27** | Q-27 outbox claim | **D-C** | Index Scan **IDX-088**, `LIMIT n`, `SKIP LOCKED` | seq scan; or a scan whose cost grows with `DISPATCHED` count | NULL `next_attempt_at` rows come **first**; cost independent of table size |
| **E28** | Q-28 idempotency | D-A | Index Scan **IDX-058**, 1 row | seq scan | conflicting insert fails deterministically |
| **E30** | Q-30 derivative resolve | D-A + a `FAILED` derivative | PK + **IDX-099** | seq scan on `asset_derivatives` | **confirms IDX-020 is *not* matched** by a `status='READY'` filter — the justification for IDX-099 |
| **E31** | Q-31 challenge | D-A | Index Scan **IDX-006**, ≤1 row | seq scan | partial predicate matches |
| **E32** | Q-32 availability under lock | D-A | IDX-016 → **IDX-113 + IDX-114**, all inside `FOR UPDATE` | seq scan on holds/reservations **inside the lock** | terminal rows excluded by the partials |
| **E35** | QX-02 saga resume | D-A | **IDX-103** + IDX-104 | seq scan on `order_transitions` | replay order is gap-free by `id` |
| **E39** | QX-07 effective agreement | D-A (≥2 versions, staggered `effective_from`) | Index Scan **IDX-108**, stops at first row | seq scan; or a sort node | `effective_from DESC` ordering; superseded/withdrawn excluded by the predicate |
| **E41** | QX-09 freeze gate | D-A | IDX-035 + IDX-036 | seq scan | — |
| **E43** | QX-11 rate window | D-A | Index Scan **IDX-111** | seq scan on `contact_verification_attempts` | window range on `attempted_at` |

**E27 and E30 are the two highest-value scenarios in this plan.** E27
falsifies the claim-index design directly: if the plan's cost scales with
the `DISPATCHED` row count, the partial predicate is not being applied. E30
tests the one deliberate index overlap in the catalog and would expose the
reasoning behind IDX-099 as wrong if the planner *did* match IDX-020.

## 4. P1 scenarios

| Ref | Query | Data | Expected plan | Assert |
|---|---|---|---|---|
| **E1** | Q-01 listing | D-A, **D-B** | **both forms:** seq scan + top-N sort at MVP cardinality; IDX-065 ordering only from a `category_id`-constant form. **Measured 2026-08-02** — see below | keyset boundary eliminates rows at the scan; thumbnail subquery bounded by the page (no N+1) |
| **E2** | Q-02 detail | D-A | IDX-011 probe + nested loops on IDX-068..071 | no seq scan on child tables |
| **E3** | Q-03 availability | D-A | IDX-069 + IDX-113/114 | partials used |
| **E4** | Q-04 gallery | D-A | Index Scan IDX-066, no sort | published-only |
| **E5** | Q-05 content | D-A | IDX-052 probe | — |
| **E6** | Q-06 sitemap | D-A | three small scans | index or seq both acceptable |
| **E7** | Q-07 redirect | D-A | IDX-053 probe | — |
| **E13** | Q-13 current quotation | D-A | IDX-037 → PK → IDX-040 | pointer follow, **no max(version) aggregate** |
| **E15** | Q-15 order | D-A | IDX-031/032 + IDX-033 | — |
| **E17/E18** | Q-17/Q-18 | D-A, **D-F** | IDX-074 + IDX-075 | the two obligation kinds resolve **independently**; superseded rows visible via IDX-075 |
| **E19** | Q-19 production queue | D-A | Index Scan IDX-082 | terminal jobs excluded |
| **E21** | Q-21 request listing | D-A, **D-B** | Index Scan IDX-073, **no sort node** | direction alignment (`DESC, DESC`) |
| **E22** | Q-22 dashboard | D-A | 12 bucket plans, each using its named index | **zero dashboard-specific indexes used** |
| **E23** | Q-23 failed payments | **D-F** | IDX-076 + IDX-081 | `REQUIRES_REVIEW` included |
| **E24** | Q-24 expiring quotes | **D-E** | Index Scan IDX-084 | range scan on `valid_until`, predicate not in index |
| **E25** | Q-25 session sweep | D-A, **D-E** | Index Scan IDX-085 | `now()` is a **range bound**, not a predicate |
| **E26** | Q-26 asset queues | D-E | IDX-086 / IDX-087 | drained states excluded |
| **E36** | QX-03 notification retry | D-A | Index Scan IDX-091 | no join to outbox |
| **E42** | QX-10 expiry sweeps | **D-E** | IDX-109 / **IDX-110** | IDX-110 excludes NULL `expires_at` rows |

**E1 has run.** `APP2-B04` delivered the real Q-01 statement and `APP2-B04-C1`
measured it against a disposable PostgreSQL 16.14 with all 33 migrations
applied — four cases (unfiltered and category-filtered × first and continuation
page), plus a `enable_seqscan = off` structural probe and a `category_id`
-constant reference form. Plans, buffers, timings and fixture cardinality:
[`DB5_Q01_ACCESS_PATH_EVIDENCE.md`](./DB5_Q01_ACCESS_PATH_EVIDENCE.md). Harness:
`pnpm explain:q01`.

E1's original expectation — "category-filtered: Index Scan IDX-065, no sort
node" — is **superseded by that measurement**: the delivered contract filters on
`categories.slug` across a join, so IDX-065's leading key is not a constant and
both forms sort. The plan is accepted at MVP cardinality; §8's "sort node where
the index was claimed aligned" failure does not apply, because the alignment
claim itself was the thing found imprecise.

## 5. P2 scenarios

| Ref | Query | Data | Expected plan | Assert |
|---|---|---|---|---|
| **E10/E12** | Q-10/Q-12 version history | D-A | **backward** Index Scan on IDX-023/IDX-039 | no separate DESC index needed, no sort node |
| **E29** | Q-29 audit (a–d) | **D-D** | (a) IDX-095 · (b) IDX-098 · (c) IDX-096 · (d) IDX-097 | each form uses its own index; **no seq scan at 50k rows** |
| **E34** | QX-01 transitions | D-A | IDX-100/101/102 | `id`-ordered |
| **E37** | QX-05 idempotency sweep | D-E | IDX-093 / IDX-094 | — |
| **E38** | QX-06 grant sweep | D-E | IDX-105 | — |
| **E40** | QX-08 merge queue | D-A | **Seq Scan — expected and acceptable** | asserts the IDX-R03 rejection was correct |
| **E20** | Q-20 low stock | D-A | **Seq Scan — expected and acceptable** | asserts the IDX-R01 rejection was correct |

E20 and E40 are deliberately inverted assertions: they fail if an index
appears, which would mean someone added a speculative index that governance
rejected.

## 6. Locking validation

Run alongside DB8 concurrency tests, not as plan inspection alone.

| Ref | Scenario | Assert |
|---|---|---|
| **L1** | Q-32 under `FOR UPDATE` (CC-20) | anchor lock taken on `sku_stocks`; competing tx blocks; no scan inside the lock |
| **L2** | Q-27 claim with 2+ workers (CC-25) | disjoint batches; no worker blocks; **claimed rows exit the claimable set in-transaction** |
| **L3** | CC-03 concurrent send-for-review | second insert fails on IDX-024 → `REVIEW_ALREADY_ACTIVE` |
| **L4** | CC-11 duplicate order creation | second fails on IDX-032 → replay |
| **L5** | CC-07 duplicate callback | second collapses via IDX-058/IDX-043; event still appended |
| **L6** | CC-27 merge, two concurrent | deterministic lock order holds; **no deadlock** |
| **L7** | CC-22 expiry vs reserve | same row lock; committed-first wins |

## 7. Method

For each scenario:

1. Seed the dataset, then **`ANALYZE`**.
2. Capture `EXPLAIN (ANALYZE, BUFFERS)` output.
3. Assert **plan shape**: expected node types, the named index, absence of a
   sort node where the index is claimed to be aligned, absence of a seq scan
   where one is unacceptable.
4. Record `shared_read`/`shared_hit` from BUFFERS as a **relative** baseline
   for regression comparison — not as an absolute threshold.
5. Store the captured plan as a **regression artifact**, committed with the
   checkpoint so future changes diff against it.

Plan-shape assertions are stable across machines in a way that timings are
not — which is why this plan asserts shape and records timing only as
context.

## 8. What counts as failure

| Failure | Meaning |
|---|---|
| Seq scan where §3/§4 marks it unacceptable | index missing, or predicate text mismatched |
| A partial index not used despite a matching query | **predicate written differently in query vs index** — the most likely real defect |
| Sort node where the index was claimed aligned | key order or direction wrong |
| Claim query cost scaling with `DISPATCHED` rows (E27) | partial predicate not applied |
| IDX-020 matched in E30 | the IDX-099 justification is wrong — revisit the catalog |
| Index used that this catalog does not define | speculative index added outside governance |
| Plan differing between two developer machines | statistics or configuration drift |

## 9. Coverage

| Tier | Scenarios | Covered |
|---|---|---|
| P0 | E8, E9, E11, E14, E16, E27, E28, E30, E31, E32, E35, E39, E41, E43 | 14/14 |
| P1 | E1..E7, E13, E15, E17..E19, E21..E26, E36, E42 | 20/20 |
| P2 | E10, E12, E20, E29, E34, E37, E38, E40 | 8/8 |
| Locking | L1..L7 | 7/7 |

**43 EXPLAIN scenarios + 7 locking scenarios.** Every P0 and P1 query in
[`DB5_QUERY_SHAPE_CATALOG.md`](./DB5_QUERY_SHAPE_CATALOG.md) has a scenario.
P3 (Q-33, fuzzy search) has none — deferred with its feature.

## 10. Deferred

| Item | Owner | Acceptance condition |
|---|---|---|
| Latency budgets | DB10 | a measured production baseline exists |
| INCLUDE column decisions | DB9/DB10 | BUFFERS shows heap fetches dominating a hot query |
| Autovacuum tuning | DB10 | bloat measured on TBL-025/070/073/074 |
| Regression-artifact storage format | DB6 | plans committed and diffable |
