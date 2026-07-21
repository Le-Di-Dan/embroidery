# DB8 → DB9 Handoff

**Compiled:** DB8-CP7. Every race classified `PASS`, `DEFERRED TO DB9`,
`N/A`, or `BLOCKED` — no row left silently open. Full detail is
`DB8_RACE_COVERAGE_MATRIX.md`; this is the actionable summary for whichever
phase picks the deferred rows back up.

## 1. Proven (PASS) — 8 P0 races, all under real multi-connection contention

| CC | Guard | Evidence |
|---|---|---|
| CC-07 | Order creation gate (`uq_orders__request`) | `order-races.integration.spec.ts` |
| CC-09 | Payment provider-event idempotent ingestion | `payment-races.integration.spec.ts` |
| CC-15/15b | Sufficient stock under the `sku_stocks` lock | `inventory-races.integration.spec.ts` |
| CC-16 | Hold → reservation conversion | `inventory-races.integration.spec.ts` |
| CC-17 | Reservation eligibility vs. concurrent deposit cancellation | `inventory-races.integration.spec.ts` |
| CC-19 | Outbox exclusive claim (`FOR UPDATE SKIP LOCKED`) | `db8-platform-races.integration.spec.ts` |
| CC-20/20b | Idempotency claim, same and mismatched fingerprint | `db8-platform-races.integration.spec.ts` |
| CC-22 | Deadlock detection → retryable classification → clean retry | `db8-harness-deadlock.integration.spec.ts` |

Every PASS row above was re-run at least 5 times (several 6–10×) with zero
flaky results — see `DB8_EXECUTION_LOG.md` per-checkpoint flakiness-gate
sections for exact counts.

## 2. Deferred to DB9 (or later) — same shape as a proven P0, or no live caller

> **DB9-CP0 amendment.** CC-01 is no longer deferred — see the closure note
> at the end of this section. The remaining twelve rows are classified
> A/B/C/D per the DB9 prompt §5.3 in the second table below.

| CC | Reason | Shape already proven by |
|---|---|---|
| CC-02, CC-03 | Single-row `FOR UPDATE` / partial-unique-arbiter | CC-15/16, CC-07/09 |
| CC-04, CC-05 | Single-row `FOR UPDATE` (current-version pointers) | CC-02's shape (itself deferred on the same basis) |
| CC-06 | `FOR UPDATE` + in-tx re-read | CC-07 |
| CC-08 | Unique-arbiter row rejection | CC-07 |
| CC-10, CC-11, CC-12 | Single-row `FOR UPDATE` / in-tx-read-under-lock | CC-17, CC-07 |
| CC-13 | No live application caller of the grant yet | — |
| CC-18 | Same `sku_stocks` lock anchor already under contention at P0 | CC-15/16 |
| CC-21 | Same claim-index shape as CC-19; G-DB7-58 already accepts at-least-once | CC-19 |

**CC-01 was the one row genuinely not covered by shape-sharing** — an
application-level compare-and-set (`autosave_revision`) with no physical
lock or unique arbiter behind it, so none of the P0 tests exercised its
failure mode. DB8 flagged it as a true gap rather than folding it into the
"same shape" bucket.

**Closed in DB9-CP0** (DEC-DB9-002). Preflight confirmed the live
repository already ships (`DrizzleDesignSessionRepository.saveDocument`), so
this was a category-**D** correctness gap, not unbuilt work — and DB9 wrote
the missing test *before* any measurement rather than converting an open
concurrency question into a performance claim. Evidence:
`apps/api/src/modules/design/tests/integration/design-races.integration.spec.ts`
— two independently pooled actors, released by an observed
`pg_stat_activity` lock-wait rather than a sleep; the loser gets
`STALE_WRITE`, `autosave_revision` lands on exactly 1, and the unbarriered
variant repeats 10/10 with zero flaky results.

### A/B/C/D classification of the remaining twelve (DB9 prompt §5.3)

| Class | Rows | Meaning |
|---|---|---|
| **A** — proven by the exact same code path and arbiter | CC-18 | `reserve` and `adjust` both lock through the *same* `stock-anchor.ts` `SELECT … FOR UPDATE` on `sku_stocks` that CC-15/CC-16 already proved under contention. Shared implementation, not merely similar prose — stays DB8-complete. |
| **B** — no live caller | CC-13 | `resolveActive` exists but nothing consumes the grant. Owner: the feature that builds signed-link consumption. **Not** marked validated. |
| **C** — needs measured contention work in DB9 | CC-02, CC-03, CC-04, CC-05, CC-06, CC-08, CC-10, CC-11, CC-12, CC-21 | Each uses a *different* table, index or lock anchor from the row whose shape it echoes. Similar shape is not the same code path, so DB8's proof does not transfer. Measured under real multi-connection contention in DB9-CP3 as `PERF-C01..C10`, with the row's own winner/loser assertion — never PASS on throughput alone. |
| **D** — genuine untested gap | *(none)* | CC-01 was the only D and is now `PASS`. |

## 3. N/A — evidence-backed, not applicable to shipped code

| CC | Verdict | Evidence |
|---|---|---|
| CC-14 | Rate-policy decision is unbuilt application-service work (G-DB7-45); the persistence append itself has no exclusivity claim to race | `DB7_TX_APP_GUARD_MATRIX.md` §7 |
| CC-23 | No flow opts into `SERIALIZABLE` | `grep -rn isolationLevel apps/api/src apps/worker/src` — zero matches |
| CC-24 | No flow uses `NOWAIT` | `grep -rn NOWAIT apps/api packages/persistence` — zero matches |

## 4. What DB8 built that outlives this phase

- **The concurrency harness** (`apps/api/src/tests/integration/db8-*.ts`):
  `createConcurrencyTestContext`/`spawnActor` (independent connection pools
  against one disposable database), `Barrier` (deterministic signal-based
  coordination), `withBoundedRetry` (whole-transaction, bounded, retryable-
  only retry). Reusable by DB9 or any later phase that needs to prove a new
  race — the fixture-widening pattern (`{ disposable }` structural type,
  DEC-DB8-006/008) means existing DB7 fixtures plug in without duplication.
- **Two lock/race reference documents** (`DB8_RACE_COVERAGE_MATRIX.md`,
  `DB8_LOCK_ORDER_MATRIX.md`) that stay accurate as long as the lock/arbiter
  inventory doesn't change — a new business flow that takes a `FOR UPDATE`
  lock or relies on a unique arbiter should add a row, not start a new
  document.

## 5. What DB9/DB10/the application layer still owns

Unchanged from `DB7_DB8_HANDOFF.md` §3, since DB8 did not build an
application/use-case layer either:

1. **No use-case/application-service layer exists.** The rate-policy
   decision behind CC-14/CC-17's guard, and every one of the 16 deferred
   outbox call sites (`DB7_DB8_HANDOFF.md` §2), need that layer first.
2. **`apps/worker` is still a bootstrap shell.** DB8 proved the outbox and
   idempotency *claim* primitives are safe under multiple workers; it did
   not build the worker loop that would actually call them in production.
3. **No queue/broker is chosen** (`CLAUDE.md` §8, open decision) — unaffected
   by DB8.
4. ~~**The DB9/DB10 documentation-numbering discrepancy**~~ (DEC-DB7-002) —
   **resolved in DB9-CP0 by DEC-DB9-001.** DB9 = measured performance and
   query-plan validation; DB10 = backup/retention/operational durability
   plus the fresh-setup/upgrade/recovery acceptance audit. The two source
   documents reconcile rather than conflict: the roadmap's DB9 exit gate
   (deterministic reproducible seed data) is satisfied by DB9-CP1's dataset
   generator, and its DB10 acceptance-audit scope is a superset of the
   handoff's. No historical report was renamed.
