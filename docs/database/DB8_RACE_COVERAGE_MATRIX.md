# DB8 — Race Coverage Matrix

**Compiled:** DB8-CP0, from `DB7_DB8_HANDOFF.md` §1 and every guard row in
`DB7_TX_APP_GUARD_MATRIX.md` carrying a race note DB7 did not consolidate
into the handoff table (`G-DB7-01`'s "version-publish race", `G-DB7-02`'s
"CC-02/03", `G-DB7-07`'s "CC-12", `G-DB7-08`'s "config-publish race"). This
is the superset DB8 is scoped against — every row must close as `PASS`,
`DEFERRED TO DB9 (reason)`, `N/A (evidence)`, or `BLOCKED` before DB8 can
report complete. No row may remain silently open.

CC numbering is renumbered here for a clean, gap-free sequence; the
"DB7 note" column preserves the exact label DB7 used so the two documents
cross-reference without ambiguity.

## Legend

- **Arbiter**: the physical row/index/constraint that decides winner/loser.
- **Isolation**: the isolation level the flow's transaction runs at
  (`READ COMMITTED` unless a repository explicitly requests otherwise —
  DB7 never opts into `SERIALIZABLE`; see `DB8_LOCK_ORDER_MATRIX.md` §3).

| CC | DB7 note | Guard | Bounded context | Op A | Op B | Shared rows | Arbiter | Isolation | Expected winner/loser | Retryable SQLSTATE | Idempotency requirement | Priority | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CC-01 | CC-01 | G-DB7-19 session autosave revision | DSN | `saveDocument(rev=N)` | `saveDocument(rev=N)` (same session, concurrent) | `design_sessions` | `autosave_revision` compare-and-set | READ COMMITTED | one writer advances the revision, the other gets `STALE_WRITE` | none (app-level CAS, no unique) | loser must be safely retryable by re-reading | P2 | PASS (closed by DB9-CP0, DEC-DB9-002 — `design-races.integration.spec.ts`) |
| CC-02 | CC-02/03 | G-DB7-02 design case current-version pointer | DSN | `setCurrentVersion(v1)` | `setCurrentVersion(v2)` (same case, concurrent) | `design_cases` | `SELECT … FOR UPDATE` on `design_cases` | READ COMMITTED | second waits for the row lock, applies against the post-commit state | none (row lock serializes) | n/a — lock ordering is the guarantee | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same `FOR UPDATE`-serializes-a-single-row shape already proven under real contention by CC-15/CC-16 at P0; no new lock-anchor pattern) |
| CC-03 | CC-03 | G-DB7-15 single active review per case | DSN | `sendForReview(case)` | `sendForReview(case)` (concurrent) | `design_versions` (partial unique) | `uq_design_versions__case__sent_for_review` | READ COMMITTED | one commits, one gets `23505` → `REVIEW_ALREADY_ACTIVE` | none | loser maps to a client-safe conflict, no retry | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same partial-unique-arbiter shape already proven under real contention by CC-07/CC-09 at P0) |
| CC-04 | version-publish race | G-DB7-01 agreement current-version pointer | CNT | `setCurrentVersion(v1)` | `setCurrentVersion(v2)` (same agreement, concurrent) | `agreements` | `SELECT … FOR UPDATE` on `agreements` | READ COMMITTED | second waits, applies after first commits | none | n/a — lock ordering | P3 | DEFERRED TO DB9 (reason: same shape as CC-02, proven once; §3) |
| CC-05 | config-publish race | G-DB7-08 policy configuration current-version pointer | PLT | `publishVersion(v1)` | `publishVersion(v2)` (concurrent) | `policy_configurations` | `SELECT … FOR UPDATE` | READ COMMITTED | second waits, applies after first commits | none | n/a — lock ordering | P3 | DEFERRED TO DB9 (reason: same shape as CC-02; §3) |
| CC-06 | CC-05/06 | G-DB7-03/04/20 quotation acceptance vs supersession | QUO | `accept(version v)` | `createNextVersion` (supersedes v, concurrent) | `quotations`, `quotation_versions`, `quotation_acceptances` | `SELECT … FOR UPDATE` on `quotations` + re-read `current_version_id` in-tx | READ COMMITTED | acceptance only succeeds if `v` is still current, SENT, unexpired at commit; loser gets `QUOTATION_VERSION_ALREADY_ACCEPTED` or a stale-version rejection | none | acceptance is idempotent per version via `uq_quotation_acceptances__qversion` | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same `FOR UPDATE` + in-tx re-read shape already proven under real contention by CC-07 at P0) |
| CC-07 | CC-11 | G-DB7-05/21 order creation gate | ORD | `createFromAcceptedQuotation(reqA)` | `createFromAcceptedQuotation(reqA)` (same request, concurrent) | `orders` | `uq_orders__request` | READ COMMITTED | one order commits, one gets `23505` → `ORDER_ALREADY_EXISTS_FOR_REQUEST`; outbox row exists exactly once | none | order uniqueness is the idempotency arbiter (DEC-DB7-033) | **P0** | PASS |
| CC-08 | CC-12 | G-DB7-07 production job creation | PRD | `createJob(order, approval)` | `createJob(order, approval)` (concurrent) | `production_jobs` | `uq_production_jobs__order_approval_snapshot` | READ COMMITTED | one commits, one gets `23505` → `PRODUCTION_JOB_ALREADY_EXISTS` | none | job uniqueness is the arbiter | P2 | DEFERRED TO DB9 (reason: identical shape to CC-07's unique-arbiter pattern, already proven at P0; §3) |
| CC-09 | CC-07/08 | G-DB7-32 provider event idempotent ingestion | PAY | `record(eventRef)` | `record(eventRef)` (same provider+ref, concurrent) | `payment_provider_events` | `uq_payment_provider_events__provider_key__provider_event_ref` | READ COMMITTED | one inserts, one gets `23505` → replayed as `PROVIDER_EVENT_ALREADY_RECORDED`, not an error | none | replayable by design (§5 error catalog) | **P0** | PASS |
| CC-10 | — | G-DB7-33 obligation satisfaction | PAY | `satisfy(obligation, attemptA)` | `satisfy(obligation, attemptB)` (concurrent) | `payment_obligations` | `SELECT … FOR UPDATE` on `payment_obligations` | READ COMMITTED | second waits, then rejects because the obligation is no longer live | none | n/a — lock ordering | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same single-row `FOR UPDATE` shape already proven under real contention at P0) |
| CC-11 | CC-14 | G-DB7-37 final payment before dispatch | ORD/PAY | `dispatch(order)` | `satisfy(remainingObligation)` (concurrent) | `orders`, `payment_obligations` | `SELECT … FOR UPDATE` on `orders`, obligation state read in-tx | READ COMMITTED | dispatch either sees the obligation SATISFIED (proceeds) or not (rejects) — never a torn read | none | n/a | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same in-tx-read-under-lock shape already proven under real contention by CC-17 at P0/P1) |
| CC-12 | CC-15 | G-DB7-24 shipping frozen at dispatch | ORD | `dispatch(order)` | `updateShippingDetail(order)` (concurrent) | `shipping_details`, `shipping_snapshots` | `SELECT … FOR UPDATE` on `shipping_details` + S24 on `shipping_snapshots` | READ COMMITTED | dispatch freezes a fully-consistent snapshot; concurrent edit either lands before the lock (included) or waits and then fails against the frozen flag | `23000` (S24) | none | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same `FOR UPDATE` + S24 combination already proven under real contention elsewhere; no new lock-anchor pattern) |
| CC-13 | CC-16 | G-DB7-40 grant revoke-vs-use | CUS | `resolveActive(grant).use()` | `revoke(grant)` (concurrent) | `secure_access_grants` | active/expiry read in-tx, no row lock by design (read-mostly) | READ COMMITTED | use committed before revoke's commit wins; use started after revoke's commit sees inactive | none | n/a | P2 | DEFERRED TO DB9 (reason: no application-layer consumer of the grant exists yet — §3 of `DB7_DB8_HANDOFF.md`; nothing to race against) |
| CC-14 | CC-17 | G-DB7-41/45 verification challenge concurrent attempts | CUS | `recordAttempt(challenge)` | `recordAttempt(challenge)` (concurrent) | `contact_verification_challenges` | attempt-count read in-tx, no row lock | READ COMMITTED | both attempts persist (append-only); rate *policy* is explicitly application-service work DB7/DB8 do not build (G-DB7-45) | none | n/a | P2 | N/A (evidence: G-DB7-45 documents the rate-policy decision as unbuilt application-service work; the persistence-layer append itself has no exclusivity claim to race) |
| CC-15 | CC-20 | G-DB7-26 sufficient stock under the row lock | INV | `hold(sku, qty)` | `hold(sku, qty)` (same SKU, concurrent, sum > available) | `sku_stocks` | `SELECT … FOR UPDATE` on `sku_stocks` (lock anchor) | READ COMMITTED | first to acquire the lock proceeds; second recomputes availability post-lock and is rejected if short — never both succeed past available | none | n/a — lock ordering is the guarantee | **P0** | PASS |
| CC-16 | CC-21 | G-DB7-28 hold → reservation conversion | INV | `convertHold(hold)` | `convertHold(hold)` (same hold, concurrent) | `inventory_soft_holds`, `inventory_reservations` | partial unique active-hold index + `FOR UPDATE` on `sku_stocks` | READ COMMITTED | one converts, one is rejected (hold no longer ACTIVE) | none | n/a | **P0** | PASS |
| CC-17 | CC-22 | G-DB7-27 official reservation eligibility | INV/PAY | `createReservation(order)` | `cancel(depositObligation)` (concurrent) | `payment_obligations`, `inventory_reservations` | deposit SATISFIED read in-tx via `ReservationEligibilityGuard` | READ COMMITTED | reservation only commits if the guard's in-tx read still sees SATISFIED at lock time | none | n/a | P1 | PASS |
| CC-18 | — | G-DB7-29 stock ledger append vs adjustment | INV | `reserve(sku)` | `adjust(sku, override)` (concurrent) | `sku_stocks`, `inventory_ledger_entries` | `FOR UPDATE` on `sku_stocks` | READ COMMITTED | serialized by the same row lock; ledger reflects exactly the two committed deltas in lock order | none | n/a | P2 | DEFERRED TO DB9 (reason: same lock anchor as CC-15/16, already proven under contention at P0; §3) |
| CC-19 | CC-25 | G-DB7-55 outbox exclusive claim | PLT | `claimBatch(worker=1)` | `claimBatch(worker=2)` (concurrent) | `outbox_events` | `SELECT … FOR UPDATE SKIP LOCKED` | READ COMMITTED | no row claimed by both workers in the same window | none | claim is the exclusivity arbiter | **P0** | PASS |
| CC-20 | (unlabeled) G-DB7-52 | idempotency claim per (namespace, scope key) | PLT | `claim(key)` | `claim(key)` (same key, concurrent) | `idempotency_records` | `uq_idempotency_records__namespace_scope_key` | READ COMMITTED | one claims (IN_PROGRESS), one gets `23505` → replay/conflict per fingerprint match | none | this *is* the idempotency arbiter | **P0** | PASS |
| CC-21 | (unlabeled) G-DB7-58 | notification intent claim + attempt append | NTF | `claimBatch(worker=1)` | `claimBatch(worker=2)` (concurrent) | `notification_intents` | claimable partial index, no `SKIP LOCKED` documented — "no exactly-once claim is made" | READ COMMITTED | at-least-once only; DB8 must prove no *same-row* double-claim inside one claim call's own transaction, not exactly-once across workers | none | consumer must tolerate at-least-once | P1 | DEFERRED TO DB9 (reason: DEC-DB8-007 — same claim-index shape CP5 proves for CC-19 at P0; G-DB7-58 itself already documents "no exactly-once claim is made" as accepted) |
| CC-22 | — (deadlock fixture) | lock-ordering across `sku_stocks` and `orders` | INV/ORD | `dispatch(order)` then touch `sku_stocks` | `adjust(sku)` then touch `orders` (opposite order, concurrent) | `orders`, `sku_stocks` | two `FOR UPDATE` locks taken in opposite order | READ COMMITTED | PostgreSQL detects `40P01`, aborts one transaction, mapper classifies `RETRYABLE_TRANSACTION_FAILURE`, bounded retry succeeds | `40P01` | retried transaction must not duplicate the order/outbox row | **P0** | PASS |
| CC-23 | — (serialization) | N/A — no flow opts into `SERIALIZABLE` | — | — | — | — | — | — | — | `40001` | — | P3 | N/A (evidence: `DB7_TX_APP_GUARD_MATRIX.md` and `DrizzleRepository`/`TransactionManager` never request `SERIALIZABLE`; every guard above uses `READ COMMITTED` + explicit row locks by design (DEC-DB7-006). Introducing `SERIALIZABLE` solely to manufacture a `40001` would add production-code risk to prove a scenario that cannot occur today.) |
| CC-24 | — (NOWAIT) | N/A — no flow uses `NOWAIT` | — | — | — | — | — | — | — | `55P03` | — | P3 | N/A (evidence: `grep -rn "NOWAIT" apps/api packages/persistence` returns no matches; every lock acquisition blocks rather than failing fast, by design) |

## Priority tiers (how CP2–CP6 spend the test-writing budget)

- **P0** — directly protects money, stock, or at-most-once side effects.
  Every P0 row gets an executable, barrier-based, multi-connection test.
- **P1** — protects a state-machine invariant with a real row lock or unique
  arbiter DB7 already implemented. Gets an executable test.
- **P2** — same lock/arbiter *shape* as an already-proven P0/P1 row, or has
  no live application caller yet. Deferred to DB9 with the specific reason
  recorded in the table above, not silently dropped.
- **P3** — scenario does not occur in the code as written today. Recorded
  `N/A` with the exact evidence (grep / design decision), not skipped
  silently.

## DB9-CP0 amendment

Two corrections, both made by DB9's mandatory preflight rather than left to
drift (`DB9_EXECUTION_LOG.md` CP0):

- **CC-01 moved from `DEFERRED` to `PASS`** (DEC-DB9-002). It was the one
  row DB8 itself flagged as a genuine untested gap rather than a
  shape-shared deferral, and the live repository (`saveDocument`, G-DB7-19)
  made it a category-**D** correctness gap. DB9 wrote the missing test
  before starting any measurement instead of absorbing an open concurrency
  question into a performance phase.
- **"CC-15b" is a test name, not a matrix row** (DEC-DB9-003). It is the
  exact-fit boundary case inside `inventory-races.integration.spec.ts`,
  rolled up under CC-15. This table's 24 rows remain the complete set.

Final tally after the amendment: **9 PASS**, 12 `DEFERRED`, 3 `N/A`. The 12
deferred rows are classified A/B/C/D in `DB8_DB9_HANDOFF.md` §2.

**DB9-CP3 closed the ten category-C rows.** CC-02, CC-03, CC-04, CC-05,
CC-06, CC-08, CC-10, CC-11, CC-12 and CC-21 were each measured under real
two-connection contention with their own documented winner/loser outcome
asserted — `PERF-C01..C09` and `PERF-Q03` in
`DB9_PERFORMANCE_SCOPE_MATRIX.md`. One correction fell out of that work:
**CC-04's race is two concurrent `publishVersion` calls**, not two
`setCurrentVersion` calls, because an agreement's DRAFT cannot be made
current directly and G-DB7-01 is right to refuse it.

Running tally across DB8 and DB9: **19 PASS**, 2 deferred (CC-13, no live
caller; CC-18, category A — the exact shared `stock-anchor.ts` lock CC-15/16
already proved), 3 `N/A` with grep evidence.

## Reconciliation with `DB7_DB8_HANDOFF.md` §1

Every CC row in that table maps to exactly one row here (see "DB7 note"
column). No handoff row was dropped; several were promoted to their own row
with an assigned priority instead of staying an undifferentiated list.
