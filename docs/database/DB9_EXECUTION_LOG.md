# DB9 — Measured Performance & Query Plan Validation — Execution Log

Append-only. One section per checkpoint, written as the checkpoint closes.
Earlier entries are never rewritten; corrections are recorded as new
decisions with an explicit `DEC-DB9-*` ID.

## Decision register

| ID | Decision | Rationale |
|---|---|---|
| DEC-DB9-001 | **DB9 canonical scope = measured performance and query-plan validation**; DB10 = backup/retention/operational durability plus the fresh-setup/upgrade/recovery acceptance audit. | The DB9/DB10 numbering discrepancy (DEC-DB7-002, carried unresolved through DB8) is resolved here, not carried a third time. `DB_ROADMAP.md` §2 titled DB9 "Seed & Fixture Design" and DB10 "Database Acceptance Audit"; `DB6_DB7_DB10_HANDOFF.md` §3/§4 assign DB9 = measured performance, DB10 = backup/retention. The governing DB9 prompt is the deciding authority and matches the handoff. The two definitions also **reconcile rather than conflict**: the roadmap's DB9 exit gate ("deterministic seed produces identical baseline data across machines") is satisfied by DB9-CP1's seeded, reproducible benchmark dataset generator, and the roadmap's DB10 acceptance-audit scope is a superset of the handoff's backup/retention scope. No historical report is renamed; `DB_ROADMAP.md` gains a reconciliation note only. |
| DEC-DB9-002 | **CC-01 is closed as `PASS` by an additive DB9-CP0 correction, not absorbed into DB9 as performance work.** | `DB8_DB9_HANDOFF.md` §2 flagged CC-01 (design session autosave CAS) as the one deferred row not covered by shape-sharing. Preflight confirmed the live repository exists (`DrizzleDesignSessionRepository.saveDocument`, G-DB7-19) — so this was a category-**D** genuine untested concurrency gap, and §51.3 makes an unresolved D a hard blocker. Rather than block, DB9-CP0 wrote the missing correctness test first (`design-races.integration.spec.ts`), converting D → PASS before any measurement began. Converting concurrency correctness into a performance claim is exactly what the governing prompt forbids. |
| DEC-DB9-003 | **CC-15b is a subcase of CC-15, not an independent matrix row.** | `DB8_RACE_COVERAGE_MATRIX.md` has 24 rows, CC-01..CC-24, with no CC-15b row. "CC-15b" is the *test name* of the exact-fit boundary case inside `inventory-races.integration.spec.ts` (`CC-15b: a hold that fits exactly the remaining stock succeeds; the next unit does not`), which the CP2 narrative and the handoff table both wrote as "CC-15/15b". Roll-up naming only — no P0 race is untested. `DB8_COMPLETION_REPORT.md` §4's PASS list, which names CC-15 alone, was already correct. |
| DEC-DB9-004 | **DB8 closed at 8 commits, not 9.** | `DB8_COMPLETION_REPORT.md`'s header claimed 9 and its §8 listed 7 with a note that the closure commit would follow. Git is authoritative: `3775ea7..f7ef9ec` inclusive is exactly 8 commits, all present, all with the expected subjects, linear parents, tree clean, `[ahead 76]` (not pushed). Report omission/miscount only — the artifacts all exist, so an addendum was added and DB9 continued. |
| DEC-DB9-005 | Benchmarks run as **`*.bench.ts` under a separate Jest project**, never in `pnpm test`. | Benchmarks take minutes and must not be a correctness gate's tail latency. Keeping them out of the default `testMatch` means `pnpm test` stays the fast correctness signal while `pnpm bench:db9` stays the measurement entry point — and, critically, benchmarks still compile the **real Nest modules and real repositories** (§13: no synthetic query disconnected from repository code). |

---

## DB9-CP0 — DB8 handoff reconciliation and performance scope lock

**Starting HEAD:** `f7ef9ec` (`docs(database): complete DB8 and DB9 handoff`)
**Branch:** `production`, tree clean, `[ahead 76]` — not pushed.

### Scope

Preflight only. No measurement, no tuning, no schema change. The single
executable change in this checkpoint is the CC-01 correctness test, written
because leaving it open would have blocked DB9 closure under §51.3.

### Preflight results (governing prompt §19)

| # | Check | Result |
|---|---|---|
| 1 | Branch / HEAD / tree | `production`, `f7ef9ec`, clean |
| 2 | Actual DB8 closure commits | 8 commits `3775ea7..f7ef9ec`, subjects and parents verified against `git log --format="%h %p %s"` |
| 3 | 9-vs-8 commit count | Reconciled — DEC-DB9-004, report addendum added |
| 4 | CC-15b | Reconciled — DEC-DB9-003, subcase of CC-15, test exists and passes |
| 5 | 13 deferred races classified A/B/C/D | Done — see §"Deferred race classification" below |
| 6 | CC-01 ownership | Category **D**, resolved to `PASS` — DEC-DB9-002 |
| 7 | DB9/DB10 roadmap numbering | Locked — DEC-DB9-001 |
| 8 | DB7 task-state docs | `DB7_COMPLETION_REPORT.md` closure hash `1d6d546` matches `git log`; the DB8 preflight already ruled the tracker widget stale UI metadata. No repository doc asserts DB7 incomplete. Non-blocking, nothing to correct. |
| 9 | Full static/test baseline | `pnpm test` — exit 0, all turbo tasks pass |
| 10–11 | 31 migrations on a disposable DB, checksum/fingerprint/catalog gates | Deferred to CP1, where the benchmark harness provisions databases anyway; re-run in full at CP7 |
| 12 | Persistent dev DB read-only | `embroidery-dev-postgres-1` is up and healthy but is never a test/benchmark target — every context provisions its own disposable database |
| 13 | No partial DB9 work | Confirmed — no `DB9_*` file existed except `DB8_DB9_HANDOFF.md` |
| 14 | No DB10 work | Confirmed — no DB10 implementation files |

### Deferred race classification (§5.3)

Category **A** = correctness already proven by the *exact same* code path and
arbiter; **B** = no live caller; **C** = needs measured contention work in
DB9; **D** = genuine untested correctness gap (blocks closure).

| CC | Class | Basis |
|---|---|---|
| CC-01 | ~~D~~ → **PASS** | Live `saveDocument` CAS, no shared arbiter. Test written in this checkpoint (DEC-DB9-002). |
| CC-02 | C | `DrizzleDesignCaseRepository.setCurrentVersion` — a `FOR UPDATE` on a *different* table than any proven row. Similar shape, not the same code path. |
| CC-03 | C | `uq_design_versions__case__sent_for_review` is a different index from CC-07's `uq_orders__request`. |
| CC-04 | C | `DrizzleAgreementRepository.setCurrentVersion` — different table, same shape family as CC-02. |
| CC-05 | C | `PolicyConfigurationRepository.publishVersion` — different table. |
| CC-06 | C | `DrizzleQuotationRepository.accept` — `FOR UPDATE` + in-tx re-read of `current_version_id`; distinct from CC-07's arbiter-only gate. |
| CC-08 | C | `uq_production_jobs__order_approval_snapshot` — different index from CC-07's. |
| CC-10 | C | `DrizzlePaymentObligationRepository.satisfy` — different lock anchor. |
| CC-11 | C | `dispatch` vs `satisfy` — cross-repository read-under-lock. |
| CC-12 | C | `shipping_details` `FOR UPDATE` combined with an S24 trigger rejection. |
| CC-13 | **B** | `DrizzleSecureAccessGrantRepository.resolveActive` exists, but no application-layer consumer calls it — nothing races. Owner: the feature that builds signed-link consumption. |
| CC-18 | **A** | `reserve` and `adjust` both take the lock through the *same* `stock-anchor.ts` `SELECT … FOR UPDATE` on `sku_stocks` that CC-15/CC-16 already proved under real contention — exact shared code path, not similar prose. |
| CC-21 | C | `DrizzleNotificationIntentRepository.claimBatch` — a different table and index from CC-19's outbox claim. |

**Outcome: 1 A, 1 B, 10 C, 0 D.** No category-D gap survives preflight, so
§51.3 does not fire. The ten C rows become DB9-CP3 contention scope
(`PERF-C01..C10`) — measured under real multi-connection load *with*
correctness assertions, never marked PASS on throughput alone (§32).

### CC-01 correctness closure

| Item | Value |
|---|---|
| Files | `apps/api/src/modules/design/tests/integration/design-races.integration.spec.ts` (new, 178 lines); `design-fixture.ts` (parameter widened to `{ readonly disposable: DisposableDatabase }`, DEC-DB8-006 pattern) |
| Connections | 2 independently pooled Nest actors against one disposable database |
| Barrier | `alice` updates and holds the row lock → observer polls `pg_stat_activity` for a backend with `wait_event_type = 'Lock'` → releases `alice` only once `bob` is *observably* blocked. Condition-driven, not a sleep. |
| Expected | one save commits, the other matches zero rows and raises `STALE_WRITE` |
| Actual | as expected; `kind = INVARIANT_VIOLATION`, `code = STALE_WRITE`, `retryable = false` |
| Invariant | `autosave_revision` lands on exactly 1 (never 2, never a lost update) and the surviving `design_document` is the winner's |
| Repeats | CC-01b runs the unbarriered variant 10 iterations — 10/10 identical, zero flaky |
| Regression | DB7's `design-session.integration.spec.ts` re-run against the widened fixture — 12/12 pass across both suites |

One assertion was corrected during the run: the first draft expected
`kind = 'GUARD_VIOLATION'`; `guardViolationError` actually classifies as
`INVARIANT_VIOLATION`. The race outcome itself (`STALE_WRITE`, revision 1)
was correct on the first execution — only the taxonomy label was wrong in
the test, and it was fixed in the test, never in the production mapper.

### Documents produced

- `DB9_PERFORMANCE_SCOPE_MATRIX.md` — the scope lock (created this checkpoint)
- `DB8_RACE_COVERAGE_MATRIX.md` — CC-01 relabelled `PASS`
- `DB8_DB9_HANDOFF.md` — §2 corrected, A/B/C/D classification added
- `DB8_COMPLETION_REPORT.md` — §10 addendum (commit count, CC-15b, CC-01)
- `DB_ROADMAP.md` — DB9/DB10 reconciliation note

### Result

**PASS.** No hard blocker. Next checkpoint: **DB9-CP1** — benchmark harness,
dataset tiers and measurement protocol.
