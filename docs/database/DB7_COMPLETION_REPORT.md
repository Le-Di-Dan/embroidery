# DB7 — Application Persistence Integration — Completion Report

**Status: COMPLETE.**
**HEAD at closure:** `133dbab`
**Branch:** `production`
**Commits (DB7 scope-lock → closure):** 23, listed in full at the end of
this report.

## 1. What DB7 was

Per `DB6_DB7_DB10_HANDOFF.md` §1 and `docs/database/DB7_SCOPE_AND_COVERAGE_MATRIX.md`
§1 (DEC-DB7-001): the repository layer, its integration tests and its
negative-path validation, for every one of the 78 tables the DB0–DB6 schema
phases defined. Not concurrency (DB8), not measured performance (DB9), not
backup/retention (DB10), and not the application/use-case layer that will
eventually call these repositories from real HTTP handlers.

## 2. Checkpoint summary

| Checkpoint | Scope | Result |
|---|---|---|
| CP0 | Application-persistence audit and scope lock | PASS — 78/78 tables assigned an owner, 59 guards catalogued in advance |
| CP1 | Database runtime foundation (`@embroidery/persistence`, health, worker boot) | PASS |
| CP2 | Transaction manager (ambient context, DEC-DB7-006), error mapping, integration harness | PASS |
| CP3 | Persistence coverage wave A — Identity, Platform primitives, Customer/Verification/Grants, Catalog, Asset, Content/Agreement/Gallery (34 tables) | PASS |
| CP4 | Persistence coverage wave B — Design case/Approval, Custom request/Quotation, Order/Shipping, Inventory, Payment, Production, Notification, Audit (44 tables) | PASS |
| CP5 | TX/App guard implementation — closed the gap CP4 left: `DesignSessionRepository`, `DesignTemplateRepository` (TBL-025/026, TBL-034..036), `ReservationEligibilityGuard` (G-DB7-27) | PASS — 78/78 tables now owned |
| CP6 | Idempotency, Outbox and worker persistence — wired one real business flow (`order.created`) to the outbox atomically; re-exercised the CP3 platform primitives | PASS |
| CP7 | Global verification and closure (this report) | PASS |

Full narrative evidence — starting HEAD, files changed, decisions, defects,
metrics, commit hashes per checkpoint — is in `DB7_EXECUTION_LOG.md`, which
this report summarizes rather than repeats.

## 3. Coverage

- **78/78 tables** have persistence ownership. `DB7_SCOPE_AND_COVERAGE_MATRIX.md`
  is current; every table listed there names a real repository class that
  exists in the tree today.
- **59/59 guards** in `DB7_TX_APP_GUARD_MATRIX.md` are implemented and
  tested. 14 of them carry an explicit "race → DB8 CC-NN" note — that note
  is a scope boundary DB7 documents on purpose, not an incomplete guard;
  §1 of `DB7_DB8_HANDOFF.md` lists all 14 with what DB7 proved and what DB8
  must still prove.
- **No repository-per-table.** 78 tables map to ~35 repository/store
  classes across 15 bounded contexts, each aggregate-shaped per
  `DB7_REPOSITORY_CONTRACTS.md` (no `findAll`/`create`/`update`/`delete`
  generic base — verified by that document's own design rules, still
  accurate as of this report).

## 4. Tests

**585 tests across 35 suites, 100% passing, in two independent
disposable-PostgreSQL runs** (one warm-cache `pnpm test`, one
`turbo run test --force` with all caches bypassed) — identical pass counts
both times. Full per-suite breakdown, with the guard each suite proves, is
in `DB7_TEST_MATRIX.md`.

| Package | Suites | Tests |
|---|---|---|
| `@embroidery/database` | 5 | 152 |
| `@embroidery/persistence` | 6 | 88 |
| `@embroidery/api` | 22 | 339 |
| `@embroidery/worker` | 2 | 6 |
| **Total** | **35** | **585** |

Zero disposable databases left behind after either run (verified against
`pg_database` on the pinned dev container). The persistent dev database was
read-only inspection only, never a target of any test run.

## 5. Static gates

`pnpm format:check` PASS · `pnpm lint` 15/15 turbo tasks PASS ·
`pnpm typecheck` 15/15 turbo tasks PASS · `pnpm check:file-size` PASS
(0 files over the 400-line source / 600-line test hard limits; 7 files
flagged at the softer 300/500-line review threshold, none newly introduced
by DB7 beyond the two noted in CP5/CP6's own log entries, both intentional
responsibility splits already performed where the hard limit was actually at
risk).

## 6. Deviations from a naive reading of the plan, recorded rather than hidden

- **CP4's wave-B commits landed without their own execution-log entry.**
  Backfilled in CP4/CP5's combined docs commit (`9481ea2`) rather than left
  silent — see the retrospective CP4 entry in `DB7_EXECUTION_LOG.md`.
- **CP5 found three genuine gaps** (`DesignSessionRepository`,
  `DesignTemplateRepository`, `ReservationEligibilityGuard`) that the CP0
  matrix had pre-named but CP4 never built. Closed in CP5, not silently
  carried forward — this was 78/78 table coverage's own explicit success
  gate.
- **CP6's scope was narrowed by explicit decision, not by omission.** The
  platform primitives (outbox, idempotency, job attempts) were correct and
  individually tested since CP3, but zero business modules called them.
  Wiring all 20 DB3-catalogued side effects would mean designing a
  domain-event system for the whole application inside a
  persistence-integration checkpoint — out of DEC-DB7-001's scope. One
  representative flow (`order.created`) was wired end-to-end instead; the
  other 16 call sites are explicit, itemised handoff work in
  `DB7_DB8_HANDOFF.md` §2, not silently claimed complete.

## 7. What DB8 (and later phases) inherit

See `DB7_DB8_HANDOFF.md` in full. Summary:

1. 14 concurrency races (CC-01 through CC-25, two unlabeled) where DB7
   proved single-run correctness and named the exact race DB8 must still
   prove.
2. 16 unbuilt outbox call sites (SE-001..SE-020 minus SE-006/017/019) —
   application-feature work for whichever phase builds the use-case layer.
3. `apps/worker` is a persistence-capable bootstrap shell with no job
   consumer yet.
4. One non-blocking documentation-numbering discrepancy (DB9/DB10 labels
   between `DB_ROADMAP.md` and `DB6_DB7_DB10_HANDOFF.md`), carried forward
   from CP0 unresolved by design (not DB7's authority to relabel).

## 8. Commits (DB7 scope-lock → closure, oldest first)

```
e16115f docs(database): lock DB7 application-persistence scope
e25e94c style(database): apply prettier to the DB6 checker scripts
b521e87 feat(database): add the NestJS persistence foundation
f90ad55 docs(database): record DB7-CP1 evidence and defects
f12d5fb feat(database): add transaction error mapping and the integration harness
65c4ed7 docs(database): record DB7-CP2 evidence and the error mapping catalog
b84ba84 feat(api): add identity persistence and the repository kernel
61cc542 feat(database): add CTX-PLT platform primitive persistence
4aed082 feat(api): add CTX-CUS customer, verification and secure-grant persistence
7a08975 feat(api): add catalog and asset persistence with the placement guard
3119f80 feat(api): add content, agreement and gallery persistence
db9e858 docs(database): record DB7-CP3 wave A evidence
7b8b019 feat(api): add design case and approval snapshot persistence
07a6252 feat(api): add custom request and quotation persistence
9a97805 feat(api): add order and shipping persistence with the conversion chain guard
6c2713e feat(api): add inventory persistence around the sku_stocks lock anchor
36eac2a feat(api): add payment obligation and money evidence persistence
6acdf1c feat(api): add production, notification and audit persistence
91b1b64 feat(api): add design template and session persistence, closing the CP0 coverage gap
eb44c75 feat(api): add reservation eligibility guard, split inventory by responsibility
9481ea2 docs(database): record DB7-CP4 and DB7-CP5 execution evidence
e387547 feat(api): wire order creation to the outbox with the canonical order.created event
133dbab docs(database): record DB7-CP6 execution evidence
```

(This report and the CP7 execution-log/matrix-reconciliation entry land in
one further commit after this file is written, closing DB7 at that HEAD.)
