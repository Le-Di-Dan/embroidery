# APP9-E01 — Final Runtime Acceptance — Completion Report

## 1. Verdict

```text
APP9-E01 = COMPLETE
APP9_E01_VERDICT = PASS
CROSS_BOUNDARY_FINAL_PAYMENT = PASS
REMAINING_WORKER_CONSUMPTION = PASS
DISPATCH_FREEZE_SNAPSHOT = PASS
ORDER_COMPLETION = PASS
BLOCKING_FINDINGS = 0
JOURNEYS = 4
CASES = 12
RUNTIME_CODE_CHANGED = 0
MIGRATIONS_ADDED = 0
OPENAPI_CHANGES = 0
GENERATED_FILES_EDITED = 0
REAL_BANK_TRANSFER = none
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED (unchanged)
S01_BOUNDARY_GUARD = NOT_DELIVERED (optional; FU-APP9-S01-04 stays open)
NEXT_CHECKPOINT = APP9-X01
NOT_PUSHED = true
```

## 2. S01 housekeeping commit

`APP9-S01-COMPLETION-REPORT.md` §3 recorded the accepted S01 tree as
uncommitted. The working tree was inspected before any E01 work and matched that
report's §26 exactly — the one Storefront route, the 33 `secure-final-payment`
feature files, the two test files, the S01 report, and the three modified files
(`main.scss` +1 line, `packages/api-client/src/orders-and-payments.ts` +54,
the APP9 phase document, roadmap only) — with nothing else present and nothing
missing.

One commit was created, containing that tree and nothing added to it:

```text
b561a96  feat(app9): deliver the customer remaining-payment surface (APP9-S01)
```

No accepted S01 behaviour was altered, and no S01 UI test was rerun for
housekeeping (§1). E01 began from a clean tree, verified by
`git status --porcelain`.

## 3. Branch, entry HEAD, commit, push state

```text
branch          production
S01 commit      b561a96  (the housekeeping commit above)
E01 entry HEAD  b561a96  — clean tree
E01 commit      none — the working tree carries the change, uncommitted
push            NOT_PUSHED = true — nothing was pushed at any point
```

## 4. Acceptance-suite structure

Two scoped serial commands, not one, and the reason is a hard repository
boundary rather than a preference: **`apps/api` may not import `apps/worker`**.
`apps/worker/package.json` declares no dependency on the API package, and the
API application graph is not reachable from the worker's Jest project. This is
the same split `APP8-E01` was forced into, and the same one its report records.

```text
apps/api/jest.app9-e01.config.mjs                              34
apps/api/test/acceptance/app9-e01/
  app9-e01-context.ts                                         322   harness
  app9-e01-journeys.acceptance.spec.ts                        563   journeys 1, 2A, 3, 4

apps/worker/jest.app9-e01.config.mjs                           33
apps/worker/test/acceptance/app9-e01/
  app9-e01-remaining-fixture.ts                               118   the REMAINING settlement
  j2-remaining-consumption.acceptance.spec.ts                 166   journey 2B
```

**No second acceptance framework was created.** The API harness is built *on*
the delivered fixtures — `createAdminPaymentContext` (whole `AppModule`, real
staff login), `customer-deposit-fixture` (the real peppered `REQUEST_ACCESS`
token and both `CST-039` obligations through the canonical AGG-16 writer) and
`customer-final-payment-fixture` (the legal LC-14 walk). The worker harness is
the delivered `startInventoryReservationWorker` and
`inventory-reservation-fixture`. Both new Jest configs are serial
(`maxWorkers: 1`) and scoped by `testMatch`, so neither can become a
repository-wide aggregate (`VALIDATION_GOVERNANCE.md` §1.1). The worker config
**extends** `jest.config.mjs` rather than restating it, keeping the jsdom ESM
`transformIgnorePatterns` exception single-sourced.

Nothing is overridden: no guard stubbed, no repository doubled, no provider
replaced. The real `AuthenticatedAdminGuard` runs against a real session cookie
from a real login; the real `AuthorizeSecureLink` runs against a real peppered
digest. Only the order chain, both obligations and the LC-14 walk to
`PRODUCTION_COMPLETED` are seeded — every entry, attempt, verification,
settlement, shipping row, snapshot, transition and outbox row in the journeys is
produced by an owning APP9 operation over HTTP.

## 5. Exact commands

```text
pnpm --filter @embroidery/api    exec jest --config jest.app9-e01.config.mjs
pnpm --filter @embroidery/worker exec jest --config jest.app9-e01.config.mjs
```

Both are indexed in `docs/implementation/SCOPED_COMMAND_INDEX.md` as
`CMD-TEST-APP9-E01-API` and `CMD-TEST-APP9-E01-WORKER`, both `ACTIVE_SCOPED`.

## 6. Journeys, cases and runtime

| Command | Suites | Cases | Result | Time |
| --- | --- | --- | --- | --- |
| `CMD-TEST-APP9-E01-API` | 1 | 10 | **all passed** | 8.752 s |
| `CMD-TEST-APP9-E01-WORKER` | 1 | 2 | **all passed** | 10.668 s |
| **total** | **2** | **12** | **12 passed, 0 failed** | **19.4 s** |

Four journeys, twelve cases. Slightly under the checkpoint's 8–12 case target at
the top of the range, and each case proves one property rather than one call, so
the count is not padded. The API journeys run against **one order** carried the
whole way from `PRODUCTION_COMPLETED` to `COMPLETED`; a second, unrelated chain
exists only as the isolation counter-example.

The two `ERROR` lines the worker run prints — `Worker startup gate closed
(TEST_HELD)` and `Policy "notification.delivery" is not configured` — are the
delivered harness's own deliberate configuration (the suite drives attempts
itself, and notification delivery is out of scope), identical to `APP8-E01`.
Neither is a failure.

## 7. Journey 1 — opening the final payment and the customer surface

Start state: `order = PRODUCTION_COMPLETED`, live `REMAINING` = `PENDING`,
`1785000.00` VND, no final-payment entry.

**E01-01 — 1A, `adminOrder_transition` (TR-LC14-05).** `200`; the order reaches
`AWAITING_FINAL_PAYMENT`. The existing `REMAINING` row stays the authority:
**same id**, still `PENDING`, still `1785000.00`, `superseded_by_obligation_id`
null, and still exactly **two** obligations on the order — so no new REMAINING
row was minted. Exactly **one** transition into `AWAITING_FINAL_PAYMENT`, from
`PRODUCTION_COMPLETED`, `actor_kind = ADMIN`.

**E01-02 — 1B, `publicOrderFinalPayment_current`, and secure-link isolation.**
The read returns this order's code, `finalPaymentAmount = 1785000.00` (the
obligation's own frozen figure), `finalPaymentStatus = PENDING`,
`orderStatus = AWAITING_FINAL_PAYMENT`, `payable = true`, `currencyCode = VND`.
The two figures a substitution defect produces are ruled out by name: it is not
the deposit `765000.00` and not the order total `2550000.00` that a
`total − deposit` derivation starts from.

Isolation, in one case: the second customer's live link opens **their** order
and not this one; a live `REQUEST_ACCESS` grant on a request with **no order
yet**, and a well-formed token that opens no grant at all, both answer with the
one identical `404 SECURE_LINK_UNAVAILABLE`. The full secure-link suite is not
duplicated.

**E01-03 — 1C, `publicOrderFinalPayment_qr` and `_initiate`.** The QR PNG is
decoded out of the delivered pixels by `pngjs` + `jsqr` — two packages that know
nothing about the encoder — so the assertion is about what a banking application
would pre-fill, not about what the response body claims. The payload contains
the configured merchant account, the derived `…RM` transfer reference and the
whole-dong `1785000`, and does **not** contain the deposit's `765000`.

The customer's attempt carries the same figure: `PENDING`, `BANK_TRANSFER`,
`amount = 1785000.00`, the `…RM` reference, `replayed = false`. Counted **per
obligation kind**, deliberately: `REMAINING` has one attempt, `DEPOSIT` has
zero. A total across the order could not tell those apart.

**E01-04 — 1D, the reused evidence lane.** The delivered APP7-B05 attempt-scoped
`deposit/evidence/status` operation — which `APP9-B02` generalised to either
`CST-039` kind — resolves the **REMAINING** attempt (`200`), and refuses the
other customer's link against that same attempt with the identical
`404 SECURE_LINK_UNAVAILABLE`. No evidence endpoint was added and no upload was
performed: what E01 checks is the binding, and doing so needs no object storage.

## 8. Journey 2A — Admin verification, and the event it produces

`adminPaymentAttempt_verify` is called on **the attempt the customer opened in
Journey 1** — not one this journey manufactured for itself. That is the
cross-boundary claim.

**E01-05.** `200`, and atomically: `attemptStatus = SUCCEEDED`; the settled
obligation is the order's `REMAINING` one (the published field keeps its APP7
`depositObligationId` name and carries the REMAINING id); `depositStatus =
SATISFIED`; `orderStatus = READY_FOR_DELIVERY`; `replayed = false`. Read back
from the rows: `REMAINING` is `SATISFIED` with `satisfied_by_attempt_id` equal
to that exact attempt, and the `DEPOSIT` obligation — deliberately left `PENDING`
with no attempt by the harness, so that "untouched" is a claim about a row a
defect could plausibly have moved — is still `PENDING` with a null
`satisfied_by_attempt_id`. Exactly **one** `TR-LC14-06` transition, from
`AWAITING_FINAL_PAYMENT`, `actor_kind = ADMIN`.

**E01-06 — the produced `payment.verified`.** Exactly **one** outbox row for that
attempt, asserted **column by column** rather than counted:

```text
event_type              payment.verified
aggregate_kind          PAYMENT_ATTEMPT
aggregate_id            <the REMAINING attempt>
payload_schema_version  1
payload                 { paymentAttemptId, paymentObligationId, obligationKind, orderId }
obligationKind          REMAINING
paymentObligationId     <the order's REMAINING obligation>
```

`obligationKind: 'DEPOSIT'` here would pass any count-only assertion while
telling the reservation consumer to reserve stock a second time, which is why
the payload is compared with `toEqual` against the whole four-key object.

## 9. Journey 2B — worker consumption, and zero inventory effect

Driven through the **real** worker runtime: real `WorkerModule`, real
`JobHandlerRegistry`, real claim through `WorkerJobQueueRepository`, real lease,
real `JobExecutionService`, real execution idempotency, real
`InventoryPersistenceModule`, against a disposable PostgreSQL with every
migration — exactly as a deployed worker runs.

What makes this more than a repeat of `APP9-W01` case 10: **the order is already
reserved.** The `DEPOSIT` `payment.verified` is driven through the same runtime
first, so APP8's official reservation exists before the balance event arrives.
"No second inventory reservation" is therefore measured against a reservation set
that actually exists, rather than against an empty table.

**E01-11 — the ordinary terminal path.** `runOnce()` returns
`outcome = SUCCEEDED`. The outbox row reaches `DISPATCHED` — the same terminal
state a reservation reaches, **no `DEAD_LETTER`**, nothing left `PENDING` for an
operator to chase. One `background_job_attempts` row, filed under the outbox
event id like every other handler's, with `outcome = SUCCEEDED` and
`error_class = null`. No reservation-specific evidence table was invented.

**E01-12 — zero inventory effect.** After the balance delivery the order's
reservation set is **byte-identical** to the one the deposit delivery left
(`toEqual` on the whole row set): one row, quantity 6, `RESERVED`. Ledger effects
counted **per `entry_kind`**, never as a total — `RESERVED` 1,
`RESERVATION_RELEASED` 0, `CONSUMED` 0 — because a second effect of a different
kind hides inside a sum. `sku_stocks.quantity_on_hand` is still 40, so the shelf
did not move either. And the balance delivery filed no idempotency record of its
own: the `inventory.reserve` namespace holds exactly the one the deposit
reservation wrote.

### The honest limit of the cross-process claim

The checkpoint asks to prefer consuming *the exact produced event*. Within the
`apps/api` ↛ `apps/worker` boundary that cannot mean one live row travelling
between two processes, and inventing a mechanism for it would be the second
acceptance framework §5 forbids. What is delivered instead is the strongest form
available: the API half asserts the produced row **column by column** (§8), and
the worker half inserts a row of exactly that asserted shape — obligation and
attempt rows that genuinely exist and genuinely carry the `REMAINING` kind, not
the deposit's ids relabelled in the payload. Both files name the other as their
counterpart, and the shared asserted column list is what keeps them honest. This
is stated rather than glossed.

## 10. Journey 3 — shipping detail and the dispatch freeze

**E01-07 — `adminOrderShipping_save` + `adminOrderShipping_read`.** The saved
`feeAmount` is `50000.00`, which is the **accepted quotation version's frozen
`shipping_fee_amount`** and therefore the fee baseline before any detail exists
(`APP9-B04` §4). That makes this a genuine no-change save rather than one that
merely happened not to trip the recalculation. Result: `fee.changed = false`,
`fee.previousFeeAmount = 50000.00`.

`adminOrderShipping_read` is called **between the save and the dispatch**,
because "the save leaves it EDITABLE" is the claim and the very next call
freezes it: `status = EDITABLE`, `frozenAt = null`, `feeAmount = 50000.00`, and
the recipient, carrier and tracking values it was given. **No REMAINING
recalculation**: still exactly two obligations, the live one still the original
id, still `SATISFIED`. **No acknowledgement row** — `shipping_fee_acknowledgements`
is empty, which is the structural form of `APP9-B04-C1`: an Admin write may never
mint the customer's evidence.

**E01-08 — `adminOrder_dispatch`.** `200`, and atomically: `status = DELIVERED`,
`fromStatus = READY_FOR_DELIVERY`, `shippingStatus = FROZEN`, `frozenAt` set.
Read back: the order is `DELIVERED`, the detail is `FROZEN` with a non-null
`frozen_at`. **Exactly one** `shipping_snapshots` row, pointing at that detail
id, and compared **field by field** against the row it froze — recipient name and
phone, address line, province, country code, fee amount, currency, carrier name,
tracking code all equal. The snapshot is the detail copied, not a summary of it.
One `TR-LC14-07` transition, from `READY_FOR_DELIVERY`, `event_kind =
SHIPPING_FREEZE`, `actor_kind = ADMIN` (LC-14 makes this an admin move).
Payment state unchanged: `REMAINING` `SATISFIED`, `DEPOSIT` `PENDING`.

**E01-09 — dispatch replay.** The retry answers `409 ORDER_INVALID_TRANSITION` —
a deterministic refusal, not a second receipt, because `TR-LC14-07` is legal from
one state only and the order has left it. Still **one** snapshot, still **one**
`DELIVERED` transition, order still `DELIVERED`.

## 11. Journey 4 — completion

**E01-10 — `adminOrder_complete` and its replay.** `200`, `status = COMPLETED`,
`fromStatus = DELIVERED`; the order row reads `COMPLETED`. The replay answers
`409 ORDER_INVALID_TRANSITION` and, across both calls, there is exactly **one**
`TR-LC14-08` transition, from `DELIVERED`, `actor_kind = ADMIN`. The shipping
side is untouched by either call: the detail is still `FROZEN` and the snapshot
set is `toEqual` to the one captured before completion began. Payment state
unchanged: `REMAINING` `SATISFIED`, `DEPOSIT` `PENDING`.

## 12. Replay and refusal evidence, collected

```text
dispatch replay      409 ORDER_INVALID_TRANSITION   1 snapshot, 1 DELIVERED transition
completion replay    409 ORDER_INVALID_TRANSITION   1 COMPLETED transition, snapshot unchanged
foreign link (read)  404 SECURE_LINK_UNAVAILABLE    other customer's link opens only their order
no-order grant       404 SECURE_LINK_UNAVAILABLE
unknown token        404 SECURE_LINK_UNAVAILABLE
foreign link (evid.) 404 SECURE_LINK_UNAVAILABLE    against this order's REMAINING attempt
```

## 13. Secure-link isolation

Proved in `E01-02` (the read) and `E01-04` (the evidence lane), on a second,
independently seeded chain with its own live `REQUEST_ACCESS` grant. Both
refusals are the same status, code and shape as the unusable-token answer, so
nothing distinguishes "not yours" from "does not exist". The full APP4/APP6
secure-link suites were **not** duplicated.

## 14. Customer fee-acknowledgement UI

Unchanged and accepted as deferred:

```text
CUSTOMER_FEE_ACK_UI = BACKEND_READY / UI_DEFERRED
```

E01 did not fail APP9 for its absence, did not invent a proposal or notification
flow, and did not force a fee increase into the main journey. The happy path uses
an **unchanged** effective fee, which is required rather than convenient:
`APP9-B04-C1` refuses a fee-changing write against a `SATISFIED` REMAINING
balance, and after Journey 2 the balance is exactly that. B04-C1's own
backend-specific evidence remains valid and was not rerun.

## 15. No real transfer

No bank transfer was submitted, no payment provider was contacted, and no QR was
scanned by a banking application. The QR is decoded from the delivered PNG bytes
in-process. Every credential in both suites is synthetic and minted per run — a
256-bit session token hashed exactly as `SessionTokenService` does, and a
`REQUEST_ACCESS` token digested with a synthetic pepper. No `.env` file was read
or written (`CLAUDE.md` §8a), and no token, digest or pepper value appears in
this report.

## 16. No runtime or business code changed

```text
apps/api        src/    0 files
apps/worker     src/    0 files
apps/admin      src/    0 files
apps/storefront src/    0 files
packages/persistence    0 files
database schema         0 migrations
OpenAPI artifact        untouched
generated client        untouched
```

Every changed file is an acceptance test, an acceptance harness, a Jest config,
or documentation. The OpenAPI baseline is unchanged and was **not** regenerated
(§13): the E01 harnesses import no generated contract — they drive real HTTP and
read committed rows — so no drift check was justified.

```text
100 paths / 108 operations / 222 schemas   (unchanged, relied upon, not recomputed)
36 APP9 Figma rows approved under FIG-APPROVAL-APP9-D01-PO-001   (untouched)
APP9 migrations = 0
```

## 17. Optional S01 static boundary guard

```text
S01_BOUNDARY_GUARD = NOT_DELIVERED
FU-APP9-S01-04     = STILL_OPEN
```

Deliberately not delivered. §14 makes it optional and warns against adding it
merely to increase the case count; delivering it would have introduced a third
package's test run and a third scoped command for a static claim that is not a
cross-boundary one. E01 stays purely cross-boundary, and `FU-APP9-S01-04`
remains open for whoever wants it.

## 18. Validations run

| Command | Scope | Result |
| --- | --- | --- |
| `pnpm --filter @embroidery/persistence build` | prerequisite | pass — run **first**, because a stale `dist` hides real `apps/api` lint/tsc errors (`APP9-B04` §5) |
| `npx prettier --write test/acceptance/app9-e01 jest.app9-e01.config.mjs` (`apps/api`) | new files | 1 reformatted, rest unchanged |
| `npx prettier --write test/acceptance/app9-e01 jest.app9-e01.config.mjs` (`apps/worker`) | new files | all unchanged |
| `npx eslint test/acceptance/app9-e01 jest.app9-e01.config.mjs` (`apps/api`) | new files | pass, no output |
| `npx eslint test/acceptance/app9-e01 jest.app9-e01.config.mjs` (`apps/worker`) | new files | pass, no output |
| `npx tsc --noEmit` (`apps/api`) | whole app incl. tests | pass |
| `npx tsc --noEmit` (`apps/worker`) | whole app incl. tests | pass |
| `CMD-TEST-APP9-E01-API` | 1 suite | **10 passed** |
| `CMD-TEST-APP9-E01-WORKER` | 1 suite | **2 passed** |
| `npx prettier --check` on the three changed documents | docs | pass |
| `node tools/check-report-secrets.mjs` | every report | **2 findings, both pre-existing** — see below |

### The report-secret gate

It reports two findings, and **neither is new**:

```text
docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93
docs/implementation/reports/APP9-G01-COMPLETION-REPORT.md:381
```

Both are the same "`token` followed by what looks like a plaintext value"
heuristic firing on prose. The gate takes no file arguments, so it was run twice
to establish that: once with the E01 tree present, and once against a clean
`b561a96` (the working tree stashed and restored). The output is **byte-identical
in both runs** — this report adds no finding. Nonblocking, per §19, and
`APP9-G01`'s report already records its own as a known false positive.

## 19. Validations deliberately not run

```text
full pnpm test / full Jest        no change justifies a repository-wide aggregate
all API integration               E01 is composition, not a regression sweep
all worker tests                  only the reservation consumer is in scope
all Admin / Storefront tests      no frontend change
A01 focused suites                accepted; §10 forbids the rerun
S01 focused suite (10 cases)      accepted; §10 forbids the rerun
98 Admin order tests              accepted; §17 forbids the rerun
B01/B02/B03/B04/B05 focused       each proved its own row-level behaviour; E01 asks a
                                  different question and reruns none of them
APP9-W01 / APP8-W01 suites        the worker half reruns neither
APP7-E01, APP8-E01                neighbouring phases, closed
DB race suites                    no concurrency claim is made here
Playwright                        §10 — not run by default, and nothing needs a browser
Docker full stack                 only a PostgreSQL server is required
full repository build             nothing built beyond the persistence prerequisite
OpenAPI regeneration              §13 — the harness imports no generated contract
Figma redraw                      no design change
```

## 20. Reruns, and the exact intervening changes

Two reruns of `CMD-TEST-APP9-E01-API`, each after a specific change **to the
acceptance test file only**. No runtime source was touched at any point, and no
"final confidence" rerun was performed.

| # | Trigger | Outcome |
| --- | --- | --- |
| 0 | first attempt, before the database was reachable | infrastructure, not a result: PostgreSQL answered `57P03 the database system is starting up`. Not counted as a run |
| 1 | `CMD-TEST-APP9-E01-API` | **8 passed, 2 failed** |
| — | intervening change: `app9-e01-journeys.acceptance.spec.ts` + a `mintToken` re-export in `app9-e01-context.ts` — the two fixes below | — |
| 2 | `CMD-TEST-APP9-E01-API` | **10 passed** |

Both failures were **assertion defects in the new test, not product defects**:

1. **The isolation case used a malformed token.** `'not-a-real-token'` is
   refused by the request body schema as a `400` *before* secure-link resolution
   ever runs, so it proved nothing about isolation. Replaced with the canonical
   `mintToken()` — a well-formed 256-bit token that opens no grant — which
   reaches the resolver and answers the expected `404 SECURE_LINK_UNAVAILABLE`.
   The product behaviour is correct in both cases.
2. **The shipping read's response shape was assumed wrong.**
   `adminOrderShipping_read` publishes the detail as the envelope's `data`
   directly; only `adminOrderShipping_save` wraps it in
   `{ orderId, detail, fee }`. Corrected — and the read was moved into the
   journey's `beforeAll`, **between the save and the dispatch**, which is
   strictly stronger: it now proves `status = EDITABLE` and `frozenAt = null`
   after the save, which the original ordering could not, because the dispatch
   had already frozen the detail by the time the assertion ran.

`prettier`, `eslint` and `tsc` were re-run against the changed files after that
edit, before run 2. `CMD-TEST-APP9-E01-WORKER` passed on its **first** run and
was **not** rerun: nothing it covers changed afterwards.

## 21. Changed files

```text
A  apps/api/jest.app9-e01.config.mjs                                        34
A  apps/api/test/acceptance/app9-e01/app9-e01-context.ts                   322
A  apps/api/test/acceptance/app9-e01/app9-e01-journeys.acceptance.spec.ts  563

A  apps/worker/jest.app9-e01.config.mjs                                     33
A  apps/worker/test/acceptance/app9-e01/app9-e01-remaining-fixture.ts      118
A  apps/worker/test/acceptance/app9-e01/j2-remaining-consumption.acceptance.spec.ts  166

M  docs/implementation/SCOPED_COMMAND_INDEX.md         two CMD-TEST-APP9-E01-* rows
M  docs/implementation/phases/APP9-…-FULFILLMENT.md    roadmap only
A  docs/implementation/reports/APP9-E01-COMPLETION-REPORT.md
```

No application source, no persistence source, no schema, no migration, no
OpenAPI artifact, no generated file and no Figma artifact was touched.

## 22. File sizes

```text
app9-e01-journeys.acceptance.spec.ts          563 / 600   OK   (test)
app9-e01-context.ts                           322 / 600   OK   (test harness)
j2-remaining-consumption.acceptance.spec.ts   166 / 600   OK   (test)
app9-e01-remaining-fixture.ts                 118 / 600   OK   (test harness)
jest.app9-e01.config.mjs (api)                 34         OK
jest.app9-e01.config.mjs (worker)              33         OK
```

Every file is inside its hard limit. The journeys file at 563 is over the 500
review threshold and is the one worth naming — see `FU-APP9-E01-01`.

## 23. Non-blocking follow-ups

**FU-APP9-E01-01 — `app9-e01-journeys.acceptance.spec.ts` is at 563 / 600.**
It was kept as one file on purpose: the four journeys are one chain against one
order, and splitting them across files would give each half its own disposable
database and destroy the property the suite exists to prove — that the balance
opened in Journey 1 is the same one dispatched in Journey 3. §20 permits a split
by journey responsibility if it becomes necessary; if a later checkpoint adds
cases here, the natural seam is Journeys 1–2 versus Journeys 3–4, which would
require re-seeding the second half to `READY_FOR_DELIVERY` and would weaken the
chain. Nonblocking.

**FU-APP9-E01-02 — the cross-process event linkage is shape-asserted, not
row-shared.** Documented in §9. It is a consequence of the `apps/api` ↛
`apps/worker` boundary, not of this harness, and it would only be closable by a
mechanism neither phase has (a shared committed database across two Jest
projects). Nonblocking; recorded so no future reader over-reads the claim.

**FU-APP9-S01-04 — remains open.** The optional S01 static boundary guard was
not delivered (§17).

Pre-existing follow-ups were not touched. `FU-APP9-B01-01` (`SE-010`
`payment.final-requested` not emitted) and `FU-APP9-B03-02` (Admin has no read of
the REMAINING obligation) stand exactly as accepted; E01 makes no claim about
either and neither is a cross-boundary defect.

## 24. Blocking findings

```text
BLOCKING_FINDINGS = 0
```

No cross-boundary runtime defect appeared. Every APP9 chain in §2 of the
checkpoint directive behaved as the accepted baseline states. `APP9-E01-C1` was
not needed and is not used.

## 25. Roadmap

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   COMPLETE
B04   COMPLETE
B05   COMPLETE
D01   COMPLETE
A01   COMPLETE
S01   COMPLETE
E01   COMPLETE
X01   NEXT
```

Exactly one `NEXT`. X01 was not begun.

## 26. Next

```text
NEXT_CHECKPOINT = APP9-X01
NOT_PUSHED = true
```
