# APP8-E01 — Focused End-to-End Acceptance for Inventory Reservation and Production Operations

## 1. Verdict

```text
APP8-E01           = COMPLETE
ACCEPTANCE         = PASS
JOURNEYS           = 4
CASES              = 14  (budget 14, no exception used)
RUNTIME CHANGES    = 0
HTTP OPERATIONS    = 0 added
MIGRATIONS         = 0
FIGMA ROWS         = 0
OPENAPI            = 92 paths / 99 operations / 206 schemas (unchanged, file unmodified)
NEXT_CHECKPOINT    = APP8-X01
NOT_PUSHED         = true
```

Every blocking acceptance criterion in §18 of the checkpoint brief passes. No
material product or runtime defect was found. Six corrections were made **to the
acceptance code itself** — wrong expected values, a missing Jest transform
allowance, and assertions written against the wrong DOM attribute; each is named
with its rerun in §15. No production code was changed to make a test green.

## 2. Branch and commit evidence

```text
Branch            production
Entry HEAD        284437f4fa38b71d53375858a3a3d227dd2b8b9c
                  feat(app8): deliver the Admin production job detail (APP8-A03)
Working tree      clean at entry
Commits added     1 (this checkpoint), local only
Pushed            no
```

The final commit hash is not recorded here: a second commit created solely to
record its own hash is forbidden by the brief.

## 3. Acceptance harness and files

`APP8-E01` is delivered as **three scoped acceptance commands**, one per
workspace, because `apps/api` may not import `apps/worker` and neither may be
imported by `apps/admin`. The three halves meet where the system itself meets
them: in the committed database, and at the generated client contract.

| Workspace | Config | Acceptance files |
|---|---|---|
| `@embroidery/api` | `apps/api/jest.app8-e01.config.mjs` | `test/acceptance/app8-e01/app8-e01-context.ts` · `j1-inventory.acceptance.spec.ts` · `j3-production.acceptance.spec.ts` · `j4-cancellation.acceptance.spec.ts` |
| `@embroidery/worker` | `apps/worker/jest.app8-e01.config.mjs` | `test/acceptance/app8-e01/j2-reservation.acceptance.spec.ts` |
| `@embroidery/admin` | existing `jest.config.mjs`, path-scoped | `test/acceptance/app8-e01-inventory-handoff.test.tsx` · `test/acceptance/app8-e01-production-handoff.test.tsx` |

Both new Jest configs are `maxWorkers: 1` and `testMatch`-scoped to their own
acceptance directory, so neither can become a repository-wide aggregate
(`VALIDATION_GOVERNANCE.md` §1.1). The worker config **extends**
`jest.config.mjs` rather than restating it, so the jsdom ESM
`transformIgnorePatterns` exception stays single-sourced.

### 3.1 What the API harness boots, and what it refuses to do

`app8-e01-context.ts` boots **one** real HTTP application carrying
`AdminSkuStockModule` (B01), `AdminProductionModule` (B03) and
`AdminProductionTransitionModule` (B04) in one injector, against a disposable
PostgreSQL with every migration applied. That single injector is the point of
the checkpoint: the stock an operator adjusts over
`/admin/skus/:skuId/stock/adjustments` is the same stock a production start
decrements, read back from committed rows.

- No guard is stubbed and no repository doubled. The real
  `AuthenticatedAdminGuard` runs against a real `admin_sessions` row whose
  256-bit token is minted per run and hashed exactly as `SessionTokenService`
  does. No `.env` file is read or written and no credential is rotated
  (`CLAUDE.md` §8a); every fixture value is synthetic.
- It is a **purpose-built** context, not a widening of
  `admin-production-context.ts`. That file is the shared harness of six accepted
  suites, and adding a module to it would make all six rerun candidates for a
  change none of them needs (`APP8-INVENTORY-AND-PRODUCTION.md` §13.2). **No
  accepted file was modified by this checkpoint.**
- Seeding is canonical where a canonical writer exists: `seedOrderChain` for the
  customer → request → quotation → approval chain, `OrderRepository`
  (AGG-15) for the order, and `SkuStockRepository` (AGG-07) for the official
  reservation. Raw SQL is used only for the SATISFIED `DEPOSIT` obligation —
  APP7's lifecycle, whose replay here would make an APP8 failure ambiguous — and
  for reading committed state back.
- Everything else is produced by an owning APP8 operation over HTTP: stock
  quantity, production jobs, specifications, every transition, every ledger row
  and every audit row.

## 4. Journeys and cases

```text
J1  Admin inventory setup and audited adjustment     E01-01  E01-02  E01-03
J2  payment.verified -> official reservation         E01-04  E01-05  E01-06
J3  production create -> start -> complete           E01-07  E01-08  E01-09
                                                     E01-10  E01-11  E01-12
J4  the production-cancellation boundary             E01-13  E01-14

TOTAL = 4 journeys / 14 cases
```

## 5. Result table

| Case | Journey | Where | Result |
|---|---|---|---|
| `E01-01` | J1 | api | **PASS** — a real Catalog SKU resolves; one anchor is created on first read and none on the second; `available = onHand − held − reserved`; `sku_stocks` holds exactly one row and it is this SKU's; the read is not a movement (ledger and audit both empty) |
| `E01-02` | J1 | api | **PASS** — `+100` with reason: on-hand moves by exactly the delta, exactly one `ADJUSTMENT` ledger entry carrying the reason and the signed effect, exactly one `sku_stock.adjusted` audit row with `ADMIN` actor, `SKU_STOCK` target, before/after; no reservation, job or order touched |
| `E01-03` | J1 | admin | **PASS** — the screen calls `adminSkuStock_get`/`_ledger`, sends exactly `{delta, reason}` to `_adjust`, re-reads **both** authoritative queries after the commit, renders the server's `100/100` (not client arithmetic), and the generated client publishes exactly three `adminSkuStock*` operations |
| `E01-04` | J2 | worker | **PASS** — two frozen lines on one SKU converge on **one** `RESERVED` row keyed `(order, SKU)` carrying their sum (10); one `RESERVED` ledger effect; no `CONSUMED`; on-hand still 40 |
| `E01-05` | J2 | worker | **PASS** — mixed order: the Catalog line reserves 7, the COP line creates no SKU, no anchor and no reservation; the order remains a valid production subject (1 catalog + 1 COP item) |
| `E01-06` | J2 | worker | **PASS** — two `payment.verified` rows, both executed through the real runtime: one reservation, quantity 5 not 10, one `RESERVED` ledger effect, no `RESERVATION_RELEASED`, no `CONSUMED`, on-hand still 30 |
| `E01-07` | J3 | api | **PASS** — `PLANNED` job created against the order's own `approvalSnapshotId`; one `production_jobs` row and one `production_specifications` row; on-hand, ledger, reservation and order status all byte-identical to before; zero job transitions |
| `E01-08` | J3 | api + admin | **PASS** — the queue returns exactly the new job with truthful fields, no invented milestone, `hasNext: false` / no cursor; `status=PLANNED` selects it and `status=COMPLETED` does not. The UI half renders the row from the five published fields only |
| `E01-09` | J3 | api | **PASS** — detail reports `PLANNED`, no milestones, the specification frozen from the approval (`Tee` / `Black / M` / 25 / document hash), the reservation summary showing the one `RESERVED` Catalog reservation, and `transitions: []` — no creation row is invented |
| `E01-10` | J3 | api | **PASS** — `{to: STARTED}` commits together: job `STARTED`, order `IN_PRODUCTION`, reservation `CONSUMED`, on-hand `100 → 75`, ledger exactly `[ADJUSTMENT +100, RESERVED 0, CONSUMED −25]`, one job transition, one audit row, one `production.started` outbox row on the job |
| `E01-11` | J3 | admin | **PASS** — sends exactly `{to:'STARTED'}` (no reason), re-reads the authoritative detail, invalidates `productionQueueKeys.lists()`, renders STARTED only after the server confirms it, and derives actions from `job.status` (Start gone, Complete present) |
| `E01-12` | J3 | api | **PASS** — job `COMPLETED`, order `PRODUCTION_COMPLETED`, explicitly **not** `AWAITING_FINAL_PAYMENT`; no on-hand or ledger movement; the reservation stays `CONSUMED`; no `REMAINING` obligation was satisfied |
| `E01-13` | J4 | api | **PASS** — see §9 |
| `E01-14` | J4 | admin | **PASS** — see §9 |

## 6. J1 — inventory journey result

`PASS`. Stock truth can be established and audited through the accepted Admin
boundary, and it is the same truth `J3` later consumes: `J3`'s opening count is
performed through this very route rather than seeded, so a divergence between
the two would fail `J3`, not just `J1`.

The audit assertion is on committed columns, not on a response: `actor_kind`,
`admin_id`, `target_kind`, `target_id`, `reason` and the `summary` before/after
were all read back from `audit_events` outside the request that wrote them.

## 7. J2 — payment.verified → reservation journey result

`PASS`. The reservation set the worker creates is the one the Admin production
surface consumes: one active row per `(order, SKU)` — CST-016's identity, not
per order item — carrying the aggregated frozen quantity, in `RESERVED`, with
the goods still on the shelf. `APP8-B04`'s start resolves reservations exactly
that way, which is why the assertions join through `sku_stocks` to the SKU
rather than reading the reservation row alone.

Redelivery converges: two outbox rows for one verification, both claimed and
executed through the real runtime, leave one reservation, one quantity and one
`RESERVED` ledger effect. Ledger counts are **per `entry_kind`**, never totals —
the lesson `APP8-B02` §9 recorded.

No failing case is driven in this file at all, so no retryable job is left in the
queue for a later case to claim.

## 8. J3 — create/start/complete journey result

`PASS`. The five cases are **ordered and cumulative** against one order: nothing
is re-seeded between them, so a case cannot pass against state its predecessor
did not really produce. Creation consumes no inventory; start commits the job
move, the order move, the reservation terminalization and the goods issue
together; completion moves nothing on the shelf and stops.

APP8's exit gate is asserted as the negative it is: after completion the order
is `PRODUCTION_COMPLETED` and **not** `AWAITING_FINAL_PAYMENT`, and no
`REMAINING` obligation was satisfied. APP8 executes no APP9 behaviour.

## 9. J4 — cancellation boundary result

`PASS`, on a separate fixture so `J3`'s completion stays intact.

What the cancellation **did**: job `CANCELLED` with `cancelled_reason`
preserved; the active reservation `RELEASED` with the operator's words in
`released_reason`; exactly one `RESERVATION_RELEASED` ledger entry with
`onHandDelta: 0`; one job transition; one `production_job.cancelled` audit row.

What it **did not** do, each asserted explicitly: the order stayed at
`DEPOSIT_PAID` with `order_transitions` unchanged; on-hand stayed at 60 (nothing
was issued, so nothing is restored); **no outbox row was appended at all**, so no
downstream saga can be woken; and the `DEPOSIT` obligation is still the only
obligation and still `SATISFIED` — nothing refunded, reversed or re-opened.

`E01-14` covers the operator's side of the same boundary: the dialog names the
production job in its heading and again in the scope notice, the copy states
`KHÔNG thay đổi` and `không hoàn tiền` in the operator's own language, a
whitespace-only reason never reaches the wire, a real reason sends exactly
`{to:'CANCELLED', reason}`, and no refund, remaining-payment, shipping or
order-cancellation control exists anywhere on the screen.

The `PLANNED` path was chosen over `STARTED`, as the brief permits; the `STARTED`
cancellation (consumed stock is not un-consumed) remains accepted `APP8-B04`
evidence and was not re-proved.

## 10. Catalog / COP / mixed disposition

| Branch | Where proved in E01 | Outcome |
|---|---|---|
| Catalog-only | `E01-01`…`E01-04`, `E01-06`…`E01-14` | reserves, consumes at start, releases on cancel |
| Mixed Catalog + COP | `E01-05` | Catalog portion reserves; COP portion creates no SKU, anchor or reservation; order stays a valid production subject |
| COP-only | **not re-proved** | accepted `APP8-W01` case 4 and `APP8-B04` case S2 evidence, unchanged |

The brief offered mixed *or* COP-only; mixed was chosen because it carries both
the positive and the negative claim in one case.

## 11. Atomicity, ledger and on-hand assertions actually inspected

Every one of these is a committed row read back outside the request that wrote
it, not a response field:

```text
sku_stocks.quantity_on_hand            E01-01 E01-02 E01-07 E01-10 E01-12 E01-13
inventory_ledger_entries (kind-wise)   E01-01 E01-02 E01-04 E01-06 E01-07 E01-10 E01-12 E01-13
inventory_reservations status/quantity E01-04 E01-05 E01-06 E01-07 E01-09 E01-10 E01-12 E01-13
production_jobs status + approval id   E01-07 E01-13
production_specifications row count    E01-07
production_job_transitions count       E01-07 E01-09 E01-10 E01-13
order_transitions count                E01-13
orders.status (via AGG-15 read)        E01-02 E01-07 E01-10 E01-12 E01-13
outbox_events count + type + aggregate E01-10 E01-13
audit_events count + action + actor    E01-01 E01-02 E01-10 E01-13
payment_obligations kind + status      E01-12 E01-13
sku_stocks row count (no COP identity) E01-01 E01-05
idempotency behaviour (via redelivery) E01-06
```

## 12. Admin UI handoff proofs actually run

Four, all Docker-free jsdom component acceptance on the delivered screens with
the generated client mocked: `E01-03`, the UI half of `E01-08`, `E01-11` and
`E01-14`. No Playwright project was run — no case needed a browser to establish
a behaviour the component boundary could not.

The payload values are the ones the API journeys committed (an anchor at zero, a
`+100` count, `100/0/0/100` afterwards, a `PLANNED` job, a start reporting
`STARTED`/`IN_PRODUCTION`/one reservation), so the screens are rendered against
server truth rather than a designer's numbers.

## 13. Accepted evidence reuse matrix

Nothing in this table was rerun.

| Invariant | Accepted evidence reused | E01 rerun? | Why |
|---|---|---|---|
| CC-21 release-vs-consume row-lock race | `APP8-B02` | NO | implementation unchanged |
| Availability arithmetic under contention | `APP8-B01`/`B02` | NO | unchanged |
| B01 read refusals, 400/401/404, negative-stock 409, ledger truncation | `APP8-B01` | NO | E01 proves the happy composition only |
| W01 insufficient-stock rollback | `APP8-W01` | NO | E01 changes no worker code |
| W01 missing-anchor refusal | `APP8-W01` | NO | unchanged |
| W01 stale/unsatisfied-deposit refusal | `APP8-W01` | NO | unchanged |
| W01 multi-SKU all-or-nothing set + lock order | `APP8-W01` | NO | unchanged |
| W01 COP-only inventory no-op | `APP8-W01` | NO | `E01-05` covers the mixed branch instead |
| B03 cross-order approval mismatch and create refusals | `APP8-B03` | NO | create path unchanged; E01 proves the happy cross-boundary create |
| B03 full queue filter/cursor matrix | `APP8-B03` | NO | E01 samples one positive and one negative filter |
| B04 start-vs-hold concurrency arbiter | `APP8-B04` | NO | lock implementation unchanged |
| B04 multi-SKU late rollback | `APP8-B04` | NO | already a deterministic real-DB proof |
| B04 STARTED cancellation (no un-consume) | `APP8-B04` | NO | `E01-13` takes the PLANNED path, as the brief permits |
| B04 deposit-gate / approval-mismatch / reservation-not-active refusals | `APP8-B04` | NO | unchanged |
| A01 negative-stock 409 UX, empty state, low-stock banner | `APP8-A01` | NO | UI unchanged |
| A02 full filter matrix, keyset load-more, cursor recovery | `APP8-A02` | NO | queue UI unchanged |
| A03 complete refusal catalog and dialog permutations | `APP8-A03` | NO | E01 samples representative cross-boundary paths |
| D01 Figma registry integrity | `APP8-D01` | NO | zero design change |

## 14. Command ledger

| Command / check | Exact changed question / input | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `pnpm --filter @embroidery/api exec jest --config jest.app8-e01.config.mjs` | Do J1/J3/J4 compose over one injector and one database? (new acceptance files) | PASS — 3 suites / 8 cases | 2 (see §15) | It is the acceptance evidence itself; scoped to `test/acceptance/app8-e01` and serial |
| `pnpm --filter @embroidery/worker exec jest --config jest.app8-e01.config.mjs` | Does the real worker runtime produce the reservation shape B04 consumes? (new acceptance file) | PASS — 4 blocks / 3 cases | 1 (see §15) | Drives the delivered runtime end to end; reruns no W01 suite |
| `pnpm --filter @embroidery/admin exec jest test/acceptance` | Do the delivered Admin screens consume the published contract and refresh to server truth? (new acceptance files) | PASS — 2 suites / 7 blocks / 4 cases | 3 (see §15) | Path-scoped to the two new files; reruns no A0n suite |
| `pnpm --filter @embroidery/api typecheck` | New TypeScript in `apps/api/test/acceptance` | PASS | 0 | Smallest scope containing the new API acceptance code |
| `pnpm --filter @embroidery/worker typecheck` | New TypeScript in `apps/worker/test/acceptance` | PASS | 0 | Smallest scope containing the new worker acceptance code |
| `pnpm --filter @embroidery/admin typecheck` | New TSX in `apps/admin/test/acceptance` | PASS | 1 (see §15) | Smallest scope containing the new Admin acceptance code |
| `pnpm --filter @embroidery/api exec eslint test/acceptance/app8-e01 jest.app8-e01.config.mjs` | New API acceptance files | PASS | 1 (see §15) | ESLint at the narrowest path containing the change |
| `pnpm --filter @embroidery/worker exec eslint test/acceptance jest.app8-e01.config.mjs` | New worker acceptance files | PASS | 0 | Same |
| `pnpm --filter @embroidery/admin exec eslint test/acceptance` | New Admin acceptance files | PASS | 0 | Same |
| `pnpm exec prettier --write <the nine new files>` | Governed files this checkpoint added | 2 reformatted, 7 unchanged | 0 | Prettier on changed files only, never repository-wide |
| `node -e` count over `packages/contracts/openapi/openapi.generated.json` + `git status --porcelain packages/contracts` | Did the contract move? | 92 / 99 / 206, file unmodified | 0 | Verified by changed-file impact, not reflex regeneration |

## 15. Reruns, and the input that changed each time

Six reruns in total. Every one names a changed input; none was a rerun over
unchanged input.

1. **api acceptance, rerun 1** — `E01-13` failed on two assertions I had written
   wrongly: the release ledger kind is `RESERVATION_RELEASED`, not `RELEASED`,
   and an `ADJUSTMENT` entry preserves its reason rather than carrying `null`.
   **Harness error, not product behaviour** — the product wrote the correct rows
   and the test expected the wrong ones. Changed input: the two expected values.
   Rerun was `--testPathPatterns j4` only.
2. **api acceptance, rerun 2** — after the ESLint fix in §15.6 and Prettier
   reformatted `j3-production.acceptance.spec.ts`. Changed input: the file.
3. **worker acceptance, rerun 1** — the first config did not inherit
   `transformIgnorePatterns`, so compiling `WorkerModule` failed on jsdom's
   ESM-only closure before any assertion ran. **Harness error.** Changed input:
   the config now extends `jest.config.mjs`.
4. **admin acceptance, reruns 1–3** — three successive harness errors of my own:
   the generated client functions receive a third options argument (so
   `toHaveBeenCalledWith` on two arguments never matches); the queue row and the
   stock identifiers are abbreviated on screen with the full value on `title`.
   Changed input each time: the assertions.
5. **admin typecheck, rerun 1** — `exactOptionalPropertyTypes` refuses
   `lowStockThreshold: undefined`; the fixture's own `makeNewAnchorStock` omits
   the key instead. Changed input: the fixture construction.
6. **api eslint, rerun 1** — `expect.any(String)` is typed `any` and tripped
   `@typescript-eslint/no-unsafe-assignment`; the reservation summary is now
   asserted field by field. Changed input: the assertion.

All six are **test-only** corrections, each disclosed above. No production code
was modified to make a test green, and no test was weakened to hide a defect.

## 16. Deliberately not run

None of the following was run, and none was needed:

```text
full monorepo Jest            all API tests             all Admin tests
all worker tests              all DB tests              all inventory race suites
all production race suites    full Playwright           any Playwright project
APP7 full acceptance          Docker full-stack E2E     DB9 benchmarks
repository-wide typecheck     repository-wide build     historical phase suites
pnpm format:check (global)    pnpm lint (global)
```

The two global controls were not run because this checkpoint's Prettier and
ESLint obligations are satisfied at the narrowest scope containing the change,
and §13 of the phase plan reserves the global sweep for the established
phase/closure policy — which is `APP8-X01`'s, not `E01`'s.

## 17. Runtime feature change disposition

```text
RUNTIME FEATURE CHANGES = 0
```

No file under any `src/` tree was created, modified or deleted. Every added file
is an acceptance test, an acceptance harness, a scoped Jest config, or
documentation. `git status` before the commit showed **five untracked paths and
zero modified tracked files**, other than the two documentation files updated in
§19.

## 18. OpenAPI / schema / Figma / client disposition

```text
OPENAPI_BEFORE = 92 paths / 99 operations / 206 schemas
OPENAPI_AFTER  = 92 paths / 99 operations / 206 schemas   (file unmodified)
MIGRATIONS     = unchanged (none added)
FIGMA_ROWS     = unchanged (FIGMA_DESIGN_INDEX.md untouched)
GENERATED CLIENT = unchanged (packages/api-client untouched)
DTOs / worker event types / APP9 behaviour = unchanged
```

Verified by changed-file impact (`git status --porcelain packages/contracts`
empty) plus a direct count over the committed document — not by regenerating it.

## 19. Changed files

**Added (9):**

```text
apps/api/jest.app8-e01.config.mjs
apps/api/test/acceptance/app8-e01/app8-e01-context.ts
apps/api/test/acceptance/app8-e01/j1-inventory.acceptance.spec.ts
apps/api/test/acceptance/app8-e01/j3-production.acceptance.spec.ts
apps/api/test/acceptance/app8-e01/j4-cancellation.acceptance.spec.ts
apps/worker/jest.app8-e01.config.mjs
apps/worker/test/acceptance/app8-e01/j2-reservation.acceptance.spec.ts
apps/admin/test/acceptance/app8-e01-inventory-handoff.test.tsx
apps/admin/test/acceptance/app8-e01-production-handoff.test.tsx
```

**Modified (2):**

```text
docs/implementation/phases/APP8-INVENTORY-AND-PRODUCTION.md   roadmap: A03/E01 COMPLETE, X01 NEXT
docs/implementation/SCOPED_COMMAND_INDEX.md                   +3 rows in §3.1
```

**Added, documentation (1):**

```text
docs/implementation/reports/APP8-E01-COMPLETION-REPORT.md      this file
```

**Modified under `src/`: none.**

## 20. File-size disposition

| File | Lines | Cap | Status |
|---|---|---|---|
| `app8-e01-context.ts` | 436 | 600 (test) | within cap, under the 500 review threshold |
| `j1-inventory.acceptance.spec.ts` | 204 | 600 | within |
| `j3-production.acceptance.spec.ts` | 376 | 600 | within |
| `j4-cancellation.acceptance.spec.ts` | 193 | 600 | within |
| `j2-reservation.acceptance.spec.ts` | 219 | 600 | within |
| `app8-e01-inventory-handoff.test.tsx` | 180 | 600 | within |
| `app8-e01-production-handoff.test.tsx` | 267 | 600 | within |
| `jest.app8-e01.config.mjs` (×2) | 33 / 37 | — | within |

Split by **journey responsibility**, as §15 of the brief requires: one file per
journey, plus one shared context. No file collects all fourteen cases and no
journey is fragmented across files for line-count reasons.

## 21. Non-blocking findings

None discovered by `E01` beyond what is already carried. The following remain
open and were **not** absorbed by this checkpoint, per §14 of the brief:

```text
SKU code absent in Inventory / Reservation UI
oversized packages/api-client/src/index.ts
route-language inconsistency
no Inventory sidenav entry (no all-SKU list exists to link)
queue prose / orderId UX notes
shared dialog debt
production notification consumer absence
production cancellation/recovery saga absence
idempotency retention / sweeper
unrelated APP6 / storefront lint and style debt
```

One observation worth recording for `APP8-X01`, not a defect: the phase-plan
roadmap block still carried `A03 INCOMPLETE — Next` at entry even though `A03`
was committed and accepted. It is corrected in §19's roadmap edit.

## 22. Final APP8 acceptance verdict

```text
APP8 composes.
```

An operator can establish audited stock truth; a verified deposit hands the paid
order to the worker, which creates the exact official reservation set; an
operator creates a production job from the order's own Approval Snapshot, sees it
in the queue, reads its frozen specification and reservation context, starts it —
committing job, order, reservation and goods issue atomically and exactly once —
and completes it, at which point APP8 **stops**. Cancellation releases inventory
without touching the commercial order, and no APP9 behaviour is executed
anywhere.

Against §18 of the brief:

- [x] Inventory initialized/read and adjusted through the accepted Admin boundary
- [x] Adjustment audit/ledger truth committed
- [x] A true deposit-verification handoff creates exact official reservation truth
- [x] Duplicate delivery does not duplicate quantity or effects
- [x] COP/mixed authority remains truthful
- [x] Job creation uses the exact approved order context
- [x] Job appears in the production queue
- [x] Detail shows frozen specification and truthful reservation context
- [x] Start commits job/order/reservation/on-hand atomically
- [x] Start decrements stock exactly once
- [x] Frontend refreshes to authoritative started truth
- [x] Complete ends at job `COMPLETED` + order `PRODUCTION_COMPLETED`
- [x] APP8 does not execute `AWAITING_FINAL_PAYMENT`
- [x] Production-job cancellation is distinct from commercial cancellation/refund
- [x] Cancellation reservation behaviour matches the accepted authority
- [x] No new backend/schema/OpenAPI/Figma behaviour introduced
- [x] Reused proofs documented rather than rerun
- [x] 14 cases, no exception used
- [x] No unjustified broad regression
- [x] Acceptance files respect the size policy
- [x] Exactly one `NEXT`
- [x] Completion report exists
- [x] Nothing pushed

## 23. Roadmap

```text
R00 = COMPLETE
G01 = COMPLETE (corrected by G01-C1)
B01 = COMPLETE
B02 = COMPLETE
W01 = COMPLETE
B03 = COMPLETE
B04 = COMPLETE
D01 = COMPLETE / PO APPROVED
A01 = COMPLETE
A02 = COMPLETE
A03 = COMPLETE
E01 = COMPLETE
X01 = NEXT
```

Exactly one `NEXT`. `APP8-X01` was **not** started.

## 24. Next checkpoint

```text
NEXT_CHECKPOINT = APP8-X01
```

## 25. Push state

```text
NOT_PUSHED = true
```
