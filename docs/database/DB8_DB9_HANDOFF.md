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

| CC | Reason | Shape already proven by |
|---|---|---|
| CC-01 | App-level CAS (no physical lock), no unique arbiter to test against | — (genuinely different shape; not covered by any P0 test) |
| CC-02, CC-03 | Single-row `FOR UPDATE` / partial-unique-arbiter | CC-15/16, CC-07/09 |
| CC-04, CC-05 | Single-row `FOR UPDATE` (current-version pointers) | CC-02's shape (itself deferred on the same basis) |
| CC-06 | `FOR UPDATE` + in-tx re-read | CC-07 |
| CC-08 | Unique-arbiter row rejection | CC-07 |
| CC-10, CC-11, CC-12 | Single-row `FOR UPDATE` / in-tx-read-under-lock | CC-17, CC-07 |
| CC-13 | No live application caller of the grant yet | — |
| CC-18 | Same `sku_stocks` lock anchor already under contention at P0 | CC-15/16 |
| CC-21 | Same claim-index shape as CC-19; G-DB7-58 already accepts at-least-once | CC-19 |

**CC-01 is the one row genuinely not covered by shape-sharing** — it is an
application-level compare-and-set (`autosave_revision`) with no physical
lock or unique arbiter backing it, so none of the P0 tests exercise its
failure mode. If DB9 (or whichever phase builds the Design Studio autosave
endpoint) wants concurrency proof here, it needs its own test — this row is
flagged as the one true gap, not folded into the "same shape" bucket the
others correctly belong to.

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
4. **The DB9/DB10 documentation-numbering discrepancy** (DEC-DB7-002,
   carried forward unresolved through DB8) — `DB_ROADMAP.md` vs.
   `DB6_DB7_DB10_HANDOFF.md` disagree on what DB9/DB10 mean. DB8 did not
   start either, so this is still whichever phase's to resolve, not DB8's.
