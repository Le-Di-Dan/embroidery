# DB5 — Locking & Concurrency Access Paths (CC-01 … CC-28)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Authority:** [`DB3_CONCURRENCY_SPECIFICATION.md`](./DB3_CONCURRENCY_SPECIFICATION.md)
— DB5 does **not** change any CC strategy. It designs the *access path* to
each lock anchor and records the index that finds it.

**Baseline:** READ COMMITTED; explicit row locking on contended rows;
optimistic markers where noted; idempotency per DB3.

## 1. Why lookup indexes matter for locking

Two properties that are easy to miss:

1. **Lock-hold time is index-dependent.** Any scan performed *while* holding
   a contended row lock extends the window during which every competing
   transaction blocks. On `sku_stocks` this converts a microsecond lock into
   a millisecond one under concurrency.
2. **A stable row set requires a deterministic lookup.** Locking "the rows
   matching a predicate" is only safe if the predicate resolves the same set
   each time; an ordered index scan gives that, an unordered scan under
   concurrent modification does not.

**Deadlock avoidance is ordering, not indexing.** Where two rows of the same
table are locked (CC-27), a deterministic order is required and is recorded
below.

## 2. Design (CC-01 … CC-04)

| CC | Anchor | Lookup / index | Strategy | Lock order | Deadlock | Handoff |
|---|---|---|---|---|---|---|
| CC-01 autosave / stale revision | session row | PK or IDX-021 | **OPT** — `autosave_revision` (COL-TBL025-05) compared in-tx | single row | none | D8-22 |
| CC-02 approve vs supersede | version row | PK via IDX-024/023 | OPT state-check **+ LOCK version row** | version only | none | D8-08 |
| CC-03 simultaneous send-for-review | **case scope** | **IDX-024** | **UNIQ (partial unique)** — no lock needed | n/a | none | **D8-09** |
| CC-04 approve vs request-revision | version row | PK; reviews via IDX-116 | LOCK + first-decision-wins | version only | none | D8-08 |

**CC-03 is the clearest case of uniqueness replacing locking.** The
CST-022 partial unique (IDX-024) arbitrates the race directly: the first
insert wins, the second gets a constraint violation mapped to
`REVIEW_ALREADY_ACTIVE`. No lock is taken, so there is no lock ordering and
no deadlock possibility. Weakening IDX-024 to non-unique would destroy
INV-16 *and* silently remove the concurrency control.

`autosave_revision` is the **only** optimistic marker in the schema
(COL dictionary §14.3) — no speculative `lock_version` columns exist.

## 3. Quotation (CC-05, CC-06, CC-28)

| CC | Anchor | Lookup / index | Strategy | Deadlock | Handoff |
|---|---|---|---|---|---|
| CC-05 accept stale version | version row | PK via IDX-039 / pointer | OPT state-check in tx → `QUOTE_VERSION_STALE` | none | D8-10 |
| CC-06 expiry sweep vs acceptance | version row | **IDX-084** (sweep) / pointer (accept) | LOCK — both paths contend on the same row | none | D8-10 |
| CC-28 concurrent version creation | **quotation header** | IDX-037 / PK | LOCK header + version sequence | header→version, consistent | none | D8-11 |

CC-28 locks the **header** (`quotations`) rather than the versions, which is
what makes the per-aggregate `version` sequence safe (CST-036). The lock
order is always header-then-child; no path locks a version before its
header.

CC-06: the sweep uses IDX-084 to find expiring rows, then locks each. The
acceptance path reaches the same row via the header pointer. Committed-first
wins — an accept-after-expire fails. **The sweep never wins by default.**

## 4. Payment (CC-07 … CC-10)

| CC | Anchor | Lookup / index | Strategy | Deadlock | Handoff |
|---|---|---|---|---|---|
| CC-07 duplicate callbacks | idempotency + attempt | **IDX-058** + **IDX-043** | **IDEM + UNIQ** — no lock | none | **D8-01** |
| CC-08 out-of-order callbacks | attempt row | IDX-043 → IDX-080 → PK | OPT — machine never regresses (CST-118) | none | D8-02 |
| CC-09 manual reconcile vs callback | attempt row | IDX-078 / PK | LOCK attempt + cross-check | attempt→obligation | low | D8-03 |
| CC-10 obligation satisfaction race | **obligation row** | IDX-075 / IDX-042 | LOCK + exactly-once application | attempt→obligation, consistent | low | D8-04 |

CC-07 is arbitrated by **two uniqueness constraints working together**:
CST-048 (idempotency claim) and CST-040 (provider event). Neither takes a
lock. The callback event is still appended as evidence even when the
application is a replay — the uniqueness prevents double-*application*, not
double-*recording*.

**Lock order is consistently attempt → obligation** on the paths that lock
both (CC-09, CC-10). Deadlock risk is low and is not eliminated by index
design but by that ordering discipline.

CC-10's exactly-once application writes `satisfied_at` and
`satisfied_by_attempt_id` (REL-083) under the obligation lock — the second
success path becomes a no-op replay.

## 5. Inventory (CC-20 … CC-24) — the contention hot spot

**All five scenarios share one anchor: the `sku_stocks` row.**

| CC | Anchor | Lookup / index | Strategy | Handoff |
|---|---|---|---|---|
| CC-20 last-unit reservation | `sku_stocks` row | **IDX-016** | **LOCK** + GRD-014 | **D8-05** |
| CC-21 release vs consume | reservation row | IDX-126 / IDX-018 | LOCK + idempotent transitions | D8-05 |
| CC-22 expiry sweep vs reserve | reservation row | **IDX-110** (sweep) / IDX-018 | LOCK; reserve re-checks in tx | D8-24 |
| CC-23 hold vs reservation | `sku_stocks` row | IDX-016 | LOCK — serialize | D8-24 |
| CC-24 adjustment vs reservation | `sku_stocks` row | IDX-016 | LOCK + **CST-061** final arbiter | D8-05 |

### The stable-row-set and lock-hold-time argument

Inside the `sku_stocks` lock, Q-32 computes
`available = quantity_on_hand − Σ active holds − Σ active reservations`
using **IDX-113** and **IDX-114** (partial, active-only). Those two indexes
exist for **lock-hold time**, not throughput: a sequential scan of the holds
table inside the lock would serialize every competing checkout for that SKU.
Their partial predicates also keep terminal rows — which accumulate forever —
out of the scan entirely.

**Lock order is always `sku_stocks` first, then its holds/reservations.**
Uniform across all five scenarios, so no inventory deadlock is possible.

**CST-061** (`quantity_on_hand >= 0`) is the **final arbiter** (INV-18): even
if a guard were bypassed, the database refuses negative stock (D7-05).

CC-22 detail: the sweep takes the **same** row lock the business path takes.
Committed-first wins; a deposit-verified reserve that commits first keeps
the hold, and the payment path recreates or alerts per LC-17.

## 6. Order / Production (CC-11 … CC-15)

| CC | Anchor | Lookup / index | Strategy | Deadlock | Handoff |
|---|---|---|---|---|---|
| CC-11 duplicate order creation | **request scope** | **IDX-032** (CST-030) + IDX-058 | **UNIQ + IDEM** — no lock | none | **D8-12** |
| CC-12 production start vs cancel/hold | **order row** | PK; queue via IDX-082 | **LOCK order row**; GRD-015/022 re-check | order→job | low | **D8-13** |
| CC-13 cancellation saga | order row + saga steps | PK; **IDX-103**, IDX-104 | SAGA — idempotent, resumable | order→children | low | D8-19 |
| CC-14 final payment vs dispatch | **order row** | PK; obligation via IDX-075 | LOCK + GRD-016 in dispatch tx | order→shipping | low | **D8-15** |
| CC-15 shipping freeze vs edit | shipping detail row | **IDX-035** | LOCK in dispatch tx + frozen trigger | order→shipping, consistent | low | **D8-14** |

CC-11, like CC-03 and CC-07, is arbitrated by **uniqueness rather than
locking**: CST-030 makes a second order for the same request impossible, and
idempotency replays the existing order reference.

**The order row is the lock anchor for the entire fulfillment machine**
(CC-12/13/14/15), reached by PK. Lock order is consistently
**order → children** (job, shipping detail, obligations), so the fulfillment
paths cannot deadlock against each other.

**CST-110 (final payment before dispatch) is a TX read, not an FK and not an
index** — the remaining obligation's `SATISFIED` state is read under the
order lock inside the dispatch transaction. Fabricating an FK for it would
misrepresent a temporal cross-aggregate condition as a row fact.

## 7. Customer / secure access (CC-16 … CC-18, CC-27)

| CC | Anchor | Lookup / index | Strategy | Lock order | Deadlock | Handoff |
|---|---|---|---|---|---|---|
| CC-16 revoke vs in-flight action | grant row | **IDX-007** | OPT — grant state checked in action tx; **revoke wins** | single row | none | **D8-20** |
| CC-17 concurrent challenges / verify | (contact, purpose) scope | **IDX-006** + IDX-004 | **UNIQ** + LOCK contact link | challenge→contact | low | D8-21 |
| CC-18 duplicate request submission | submission key | IDX-058 | IDEM | none | none | D8-12 |
| **CC-27 customer merge** | **both customer rows** | IDX-107, 117, 118, 119, 134, 129 | **LOCK both, ordered** + merge audit | **deterministic order (e.g. ascending `id`)** | **real risk if unordered** | **D8-18** |

**CC-27 is the only scenario that locks two rows of the same table**, and it
is therefore the only genuine deadlock risk in the system. Two concurrent
merges touching an overlapping pair in opposite orders would deadlock. The
mitigation is a **deterministic lock order** on the two customer ids — a
discipline that no index can provide and that DB8 must test explicitly.

The merge's *enumeration* correctness depends on the indexes listed in §7 of
[`DB5_INDEXES_IDENTITY_CUSTOMER.md`](./DB5_INDEXES_IDENTITY_CUSTOMER.md) —
particularly **IDX-107** (all grants, including inactive) and **IDX-134**
(all contacts, not just primary). Using the partial indexes here would
silently skip rows.

**Historical snapshots are never rewritten** by a merge (REL-014).

CC-16: `revoke wins` is a transaction-ordering property, not an index one —
which is exactly why IDX-007 carries no `status` predicate (see
[`DB5_SECURITY_SCOPE_REVIEW.md`](./DB5_SECURITY_SCOPE_REVIEW.md) §4).

## 8. Asset / Outbox / Notification (CC-19, CC-25, CC-26)

| CC | Anchor | Lookup / index | Strategy | Deadlock | Handoff |
|---|---|---|---|---|---|
| CC-19 duplicate asset processing | (asset, job, attempt) | IDX-020, IDX-059 | IDEM + append attempts | none | D8-23 |
| **CC-25 multi-worker outbox claim** | outbox row | **IDX-088** | **LOCK claim, `SKIP LOCKED`** + idempotent consumers | **none by construction** | **D8-17** |
| CC-26 notification duplicate/retry | intent row | **IDX-057** + IDX-091 | IDEM (intent key) + LOCK intent on attempt spawn | none | D8-16 |

**CC-25 is deadlock-free by construction**: `SKIP LOCKED` means a worker
never *waits* for a lock — it skips to the next row. Workers take disjoint
batches, no worker starves, and FIFO order is preserved by
`(next_attempt_at NULLS FIRST, id)`.

The claim must **mutate the row out of the claimable predicate in the same
transaction** (ADR-DB5-003 R6) — otherwise the row becomes claimable again
when the lock releases, producing repeat delivery bounded only by luck.
At-least-once is tolerated (consumers are idempotent) but must not be relied
on to mask a missing status flip.

CC-26: `intent_key` uniqueness (CST-047) collapses duplicates before any
lock is needed.

## 9. Lock-order summary (deadlock prevention)

| Family | Order | Risk |
|---|---|---|
| Inventory | `sku_stocks` → holds/reservations | none — uniform |
| Order fulfillment | `orders` → job / shipping / obligations | low — uniform |
| Payment | attempt → obligation | low — uniform |
| Quotation | header → version | none — uniform |
| Customer merge | **both customers in deterministic id order** | **real if unordered — D8-18** |
| Outbox | none (`SKIP LOCKED`) | none |

## 10. Coverage

| CC | Anchor | Index | Strategy | Status |
|---|---|---|---|---|
| CC-01 | session | IDX-021/PK | OPT | complete |
| CC-02 | version | IDX-024/023 | OPT+LOCK | complete |
| CC-03 | case scope | **IDX-024** | UNIQ | complete |
| CC-04 | version | PK, IDX-116 | LOCK | complete |
| CC-05 | version | IDX-039 | OPT | complete |
| CC-06 | version | IDX-084 | LOCK | complete |
| CC-07 | idem+event | IDX-058, IDX-043 | IDEM+UNIQ | complete |
| CC-08 | attempt | IDX-080 | OPT | complete |
| CC-09 | attempt | IDX-078/PK | LOCK | complete |
| CC-10 | obligation | IDX-075/042 | LOCK | complete |
| CC-11 | request scope | **IDX-032** | UNIQ+IDEM | complete |
| CC-12 | order | PK, IDX-082 | LOCK | complete-deferred-syntax |
| CC-13 | order+steps | IDX-103/104 | SAGA | complete |
| CC-14 | order | PK, IDX-075 | LOCK | complete-deferred-syntax |
| CC-15 | shipping detail | IDX-035 | LOCK | complete-deferred-syntax |
| CC-16 | grant | IDX-007 | OPT | complete |
| CC-17 | (contact,purpose) | IDX-006/004 | UNIQ+LOCK | complete |
| CC-18 | submission key | IDX-058 | IDEM | complete |
| CC-19 | asset/job/attempt | IDX-020/059 | IDEM | complete |
| CC-20 | **sku_stocks** | IDX-016/113/114 | LOCK | complete-deferred-syntax |
| CC-21 | reservation | IDX-126/018 | LOCK | complete-deferred-syntax |
| CC-22 | reservation | IDX-110/018 | LOCK | complete-deferred-syntax |
| CC-23 | sku_stocks | IDX-016 | LOCK | complete-deferred-syntax |
| CC-24 | sku_stocks | IDX-016 | LOCK+CST-061 | complete-deferred-syntax |
| CC-25 | outbox | **IDX-088** | SKIP LOCKED | complete-deferred-syntax |
| CC-26 | intent | IDX-057/091 | IDEM+LOCK | complete |
| CC-27 | **both customers** | IDX-107/134/117/118/119 | LOCK ordered | complete |
| CC-28 | quotation header | IDX-037 | LOCK | complete-deferred-syntax |

**28/28 covered. 0 unresolved.**

`complete-deferred-syntax` (10 rows) means the access path and lock anchor
are fully designed and only the **row-lock emission syntax** is pending the
DB6 spike (ADR-DB1-002): CC-12/14/15/20/21/22/23/24/25/28. If the query
builder cannot emit `FOR UPDATE` / `FOR UPDATE SKIP LOCKED`, the fallback is
a **documented raw-SQL adapter** — and neither DB3's specification nor this
document changes.

## 11. Handoff

**DB6 spikes**
1. `FOR UPDATE` emission (inventory CC-20..24, order CC-12..15, quotation CC-28).
2. **`FOR UPDATE SKIP LOCKED`** emission (CC-25) — the highest-risk spike;
   fallback is single-worker relay (ADR-DB5-003 R7).
3. Deterministic two-row lock ordering for CC-27.
4. Verify every partial index predicate is written **identically** in query
   and index, or the planner will not use it.

**DB8 tests** — one per CC row: D8-01..D8-25 plus the ordering test for
CC-27 (D8-18) and the claim test for CC-25 (D8-17).

**DB9 data** — concurrent-scenario fixtures: a SKU with exactly one unit
left (CC-20), an order mid-`CANCELLING` with partial saga steps (CC-13), a
customer pair eligible for merge (CC-27), and pending outbox rows with mixed
NULL/future `next_attempt_at` (CC-25).
