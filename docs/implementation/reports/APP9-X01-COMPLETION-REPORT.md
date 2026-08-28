# APP9-X01 — Phase Closure and Final Authority Freeze — Completion Report

## 1. Final verdict

```text
APP9-X01                    = COMPLETE
APP9                        = PASS_WITH_FOLLOW_UPS
BLOCKING_FINDINGS           = 0
BLOCKING_FOLLOW_UPS         = 0
PHASE                       = CLOSED

APP9_OWNED_HTTP_OPERATIONS  = 9
APP9_MIGRATIONS             = 0
APP9_FIGMA_ROWS             = 36
APP9_E01                    = PASS
NEW_ADMIN_ROUTES            = 0
NEW_STOREFRONT_ROUTES       = 1

RUNTIME_CODE_CHANGED        = 0
NEXT_PHASE                  = APP10 — Customer Operations and Communication
NOT_PUSHED                  = true
```

No canonical artifact contradicted the accepted phase state. Every baseline the
closure directive asserted was verified against the committed repository rather
than accepted on trust, and every one matched.

## 2. E01 housekeeping commit

`APP9-E01-COMPLETION-REPORT.md` §3 recorded E01 as uncommitted. The working tree
was inspected before any closure work and matched that report's §21 and §22
**exactly**: the two Jest configs (34 and 33 lines), the four acceptance
files at 322, 563, 118 and 166 lines — the same counts §22 records — the two
modified documents (`SCOPED_COMMAND_INDEX.md` +2 lines for the two
`CMD-TEST-APP9-E01-*` rows, the APP9 phase document +27/−2 roadmap only), and the
E01 report itself. Nothing else was present and nothing was missing.

One commit was created, containing that tree and nothing added to it:

```text
7255d84  feat(app9): deliver the cross-boundary final-payment acceptance (APP9-E01)
         9 files changed, 1819 insertions(+), 2 deletions(-)
```

No accepted E01 evidence was altered and no E01 suite was rerun for
housekeeping. X01 began from a clean tree, verified by `git status --porcelain`.

## 3. Branch, entry HEAD, commit and push state

```text
branch           production
E01 commit       7255d84   (the housekeeping commit above)
X01 entry HEAD   7255d84   — clean tree
X01 commit       this closure commit (a commit cannot record its own hash)
push             NOT_PUSHED = true — nothing was pushed at any point
```

Twelve pre-closure APP9 commits, from `1b372a4` (R00) to `7255d84` (E01), plus
this closure commit.

## 4. Checkpoint ledger

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
X01   COMPLETE
```

Thirteen canonical checkpoints, exactly the roadmap `APP9-R00` produced and
`APP9-G01` froze. No checkpoint was added, merged or skipped.

## 5. Correction ledger

```text
B04-C1   USED / PASS
A01-C1   USED / PASS

B01-C1   UNUSED
B02-C1   UNUSED
B03-C1   UNUSED
W01-C1   UNUSED
B05-C1   UNUSED
D01-C1   UNUSED
S01-C1   UNUSED
E01-C1   UNUSED
```

Two corrections, over two different parents. There is no `C2` anywhere in APP9,
and no correction was invented for a checkpoint that did not have one. Both used
corrections were delivered inside their parent's commit (`e7bcef5` carries
B04 + C1; `f6848c1` carries A01 + C1), which is why thirteen checkpoints and two
corrections produce twelve pre-closure commits.

Each correction's substance, since both changed an authority rather than a
detail:

- **`B04-C1`** — an Admin write may never mint the customer's acknowledgement. A
  shipping-fee increase now requires an explicit customer acknowledgement through
  a customer-authenticated operation of its own.
- **`A01-C1`** — the curated API-client root barrel had reached 1231 lines of
  handwritten source against a 400-line hard limit. Split by responsibility, root
  public API unchanged (414 names in, 414 names out), 0 Admin application source
  files touched.

## 6. Final lifecycle authority

```text
TR-LC14-05  PRODUCTION_COMPLETED   -> AWAITING_FINAL_PAYMENT   ADMIN
TR-LC14-06  AWAITING_FINAL_PAYMENT -> READY_FOR_DELIVERY       SYSTEM semantics, executed
                                                               synchronously inside the
                                                               Admin verification
                                                               transaction — no worker,
                                                               no new event type
TR-LC14-07  READY_FOR_DELIVERY     -> DELIVERED                ADMIN; atomic shipping
                                                               freeze + exactly one
                                                               shipping snapshot
TR-LC14-08  DELIVERED              -> COMPLETED                ADMIN
```

`READY_FOR_DELIVERY → COMPLETED` is never collapsed. The non-canonical
vocabulary `ready for handoff` and `fulfilled` is not revived. `GRD-016` is
enforced by an **explicit in-transaction check** rather than left to transition
legality, because a B04 fee increase can leave an order at
`READY_FOR_DELIVERY` still owing money — and because LC-14 legality is not the
guard here (`ON_HOLD → AWAITING_FINAL_PAYMENT` is legal).

## 7. Payment authority

```text
REMAINING created at order conversion            (APP7-W01, alongside DEPOSIT)
REMAINING != DEPOSIT                             permanent under CST-039
PAYMENT_MVP = MANUAL_BANK_TRANSFER               no provider, callback, webhook or
                                                 automatic reconciliation
exact amount from the live REMAINING obligation  never derived as total − deposit
Admin verification is authoritative              no payment success from a browser redirect
payment.verified carries the true obligationKind
```

`APP9-B01` reuses the obligation `APP7-W01` created and deliberately left
unsatisfied — it mints no new one. `APP9-E01` ruled out the two figures a
substitution defect produces by name: the published balance is neither the
deposit nor the order total.

## 8. Worker authority

```text
one payment.verified consumer     InventoryReservationHandler, extended
DEPOSIT   -> existing APP8 inventory reservation, unchanged
REMAINING -> successful no-op
no second inventory reservation
NEW_WORKER_HANDLERS = 0
NEW_EVENT_TYPES     = 0
```

One handler per event type is enforced at worker startup, which is why the sole
registrant was extended rather than a second added. Before `APP9-W01` a verified
`REMAINING` obligation would have **dead-lettered** — that was `APP9-R00`'s
disposition D, and closing it closed `FU-APP8-W01-01`.

## 9. Shipping and freeze authority

```text
shipping_details is pre-freeze truth
Admin edits only while EDITABLE
fee change uses the supersede/successor REMAINING authority
                                  (supersede BEFORE the successor INSERT)
fee increase requires explicit customer acknowledgement
Admin cannot mint customer acknowledgement                    (B04-C1)
dispatch freezes atomically and creates exactly one shipping snapshot
carrier/tracking are static Admin facts recorded internally only
LIVE_CARRIER_TRACKING = OUT_OF_SCOPE
```

`APP9-E01` proved the snapshot is the detail **copied** rather than summarised —
recipient name and phone, address line, province, country code, fee amount,
currency, carrier name and tracking code all compared field by field — and that
a dispatch replay answers `409 ORDER_INVALID_TRANSITION` while leaving exactly
one snapshot and one `DELIVERED` transition.

## 10. Admin and Storefront route authority

```text
NEW_ADMIN_ROUTES = 0
  /orders               extended   (added a3956fd, APP7-A01)
  /orders/{orderId}     extended   (added a3956fd, APP7-A01)

NEW_STOREFRONT_ROUTES = 1
  /truy-cap/thanh-toan-con-lai     added b561a96, APP9-S01

APP9-S02 does not exist.

customer final-payment / completion UI  DELIVERED
customer tracking UI                    NOT_IMPLEMENTED
customer fee-ack UI                     BACKEND_READY / UI_DEFERRED
```

Route provenance was read from `git log --diff-filter=A` on each route file, not
assumed. `node tools/check-storefront-route-authority.mjs` passes.

## 11. OpenAPI baseline

```text
OPENAPI_PATHS      = 100
OPENAPI_OPERATIONS = 108
OPENAPI_SCHEMAS    = 222
```

Counted read-only from the committed
`packages/contracts/openapi/openapi.generated.json` — paths enumerated, HTTP
methods counted per path, `components.schemas` keys counted. **The artifact was
not regenerated and the API client was not regenerated.** The figures match the
accepted baseline and `APP9-B05`'s own recorded after-state exactly.

## 12. APP9-owned HTTP operations — 9

```text
B01     +1     POST /api/admin/orders/{orderId}/transitions          adminOrder_transition
B02     +3     POST /api/public/orders/final-payment                 publicOrderFinalPayment_current
               POST /api/public/orders/final-payment/qr              publicOrderFinalPayment_qr
               POST /api/public/orders/final-payment/attempts        publicOrderFinalPayment_initiate
B03     +0     (extends the delivered APP7 attempt operation)
W01     +0     (worker only)
B04     +3     PUT  /api/admin/orders/{orderId}/shipping-detail      adminOrderShipping_save
               GET  /api/admin/orders/{orderId}/shipping-detail      adminOrderShipping_read
               POST /api/public/orders/shipping-fee-acknowledgements publicOrderShippingFee_acknowledge   (C1)
B05     +2     POST /api/admin/orders/{orderId}/dispatch             adminOrder_dispatch
               POST /api/admin/orders/{orderId}/completion           adminOrder_complete
------------------------------------------------------------------------------------
TOTAL   = 9
```

Reconciled two independent ways and they agree. Forward, from each report's own
before/after: entry `99` → B01 `100` → B02 `103` → B03 `103` → B04 `105` →
B04-C1 `106` → B05 `108`. And by enumeration: the nine operation ids above are
all present in the committed artifact. `108 − 99 = 9`.

The B04 line is `+3` because it includes `B04-C1`'s customer acknowledgement
operation; B04's first attempt owned two.

## 13. Database migration baseline

```text
APP9_OWNED_MIGRATIONS = 0
REPOSITORY_TOTAL      = 37
LAST MIGRATION        = 0037_add_app7_transfer_evidence_association   (APP7)
```

Read from `packages/database/migrations/meta/_journal.json` — 37 entries, the
last one APP7's. APP8 closed at 37 and APP9 remains at 37, so current repository
authority confirms rather than contradicts the expected total. This is exactly
what `APP9-R00` predicted: `shipping_details`, `shipping_snapshots` and
`shipping_fee_acknowledgements` shipped in migration `0023` with their
reject-mutation triggers in `0030`, long before the phase began, which is why
`APP9_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED`.

No migration test was run and no schema was modified.

## 14. Figma baseline

```text
APP9_FIGMA_ROWS = 36
STATUS          = APPROVED_FOR_IMPLEMENTATION   (36 / 36)
APPROVAL        = FIG-APPROVAL-APP9-D01-PO-001
PAGE            = APP_09   (reused — no new page)
```

Verified read-only: 36 unique `FIG-APP9-*` registry ids in
`docs/design/FIGMA_DESIGN_INDEX.md`, every one carrying
`APPROVED_FOR_IMPLEMENTATION`, all under the single approval token `APP9-A01`
recorded. `node tools/check-figma-design-index.mjs` passes across the whole
registry — 450 ids, 450 node rows, 21 tables, canonical files, statuses, deep
links and cross-phase composites all verified.

No Figma artifact was redrawn and no approval evidence was changed.

## 15. E01 acceptance summary

```text
JOURNEYS              = 4
CASES                 = 12
PASS                  = 12 / 12
BLOCKING_FINDINGS     = 0
RUNTIME_CODE_CHANGED  = 0
MIGRATIONS_ADDED      = 0
OPENAPI_CHANGES       = 0
REAL_BANK_TRANSFER    = none
```

Reused as accepted evidence — **not re-executed**. No bank transfer was
submitted, no payment provider contacted, and no QR scanned by a banking
application; the QR was decoded from delivered PNG bytes in-process by two
packages that know nothing about the encoder. Every credential in both suites is
synthetic and minted per run.

Accepted nonblocking limitation, unchanged:

```text
FU-APP9-E01-02
cross-process event linkage is shape-asserted rather than one shared physical row
```

E01 was not reopened and no second orchestrator was built.

## 16. Blocking follow-up count

```text
BLOCKING_FOLLOW_UPS = 0
```

Every APP9 finding is closed, nonblocking-open, an accepted limitation, or
deferred to a later phase. None is blocking, and no nonblocking item was
converted into a blocking failure to make closure look tidier.

## 17. Follow-up ledger

The full classified ledger, one row per item with its substance and reasoning, is
in [`APP9-CLOSURE-MATRIX.md`](./APP9-CLOSURE-MATRIX.md) §7. Summary:

```text
CLOSED                      4
NONBLOCKING_OPEN           18
ACCEPTED_LIMITATION         4
DEFERRED_TO_LATER_PHASE     5
-------------------------------
total                      31
```

**CLOSED (4)**

```text
FU-APP8-W01-01              closed by APP9-W01 (the REMAINING dead-letter)
FU-APP9-B01-03              inherited red spec, fixed in passing by B01
FU-APP9-B02-02              stale contract path list, repaired by B03
api-client barrel 1231 ln   RESOLVED BY APP9-A01-C1 — not carried forward as open
```

**NONBLOCKING_OPEN (18)**

```text
FU-APP9-B01-02  FU-APP9-B03-01*  FU-APP9-B03-02*  FU-APP9-W01-01
FU-APP9-B04-01  FU-APP9-B04-02   FU-APP9-B04-03   FU-APP9-B04-04
FU-APP9-B04-C1-01
FU-APP9-B05-01  FU-APP9-B05-02   FU-APP9-B05-03
FU-APP9-A01-01  FU-ADMIN-SHARED-DIALOG-01
FU-APP9-S01-02  FU-APP9-S01-03   FU-APP9-S01-04
FU-APP9-E01-01
```

`*` = **partially resolved, and the two sides are distinguished rather than
merged.** `FU-APP9-B03-01`: `UI_SIDE = ADDRESSED` by A01 — the deposit-flavoured
transport names never reach the screen — while `BACKEND_DTO_DEBT` remains open.
`FU-APP9-B03-02`: the UI side is `ACCEPTED_UI_DEGRADATION`, drawn on screen and
never derived as `total − deposit`, while the missing Admin read of the REMAINING
obligation remains backend debt.

**ACCEPTED_LIMITATION (4)**

```text
FU-APP9-G01-01   report-secret gate inherited-red on two prose false positives
FU-APP9-B02-01   REMAINING evidence travels the deposit-named APP7 route
FU-APP9-S01-01   two approved D01 summary rows undrawn — no API publishes them
FU-APP9-E01-02   cross-process event linkage shape-asserted, not row-shared
```

**DEFERRED_TO_LATER_PHASE (5)**

```text
FU-APP9-B01-01              SE-010 payment.final-requested not emitted   -> APP10
customer fee-ack UI         BACKEND_READY / UI_DEFERRED                  -> APP10
IMP-O007                    payment provider / callback / webhook
IMP-O008                    per-stage refund dispositions (CON-144)
FU-APP8-B04-02              S6 commercial branch, conditional on IMP-O008
```

Three items beyond the closure directive's minimum list were found in the
committed reports and are preserved rather than dropped: `FU-APP9-B01-03`,
`FU-APP9-B02-02` (both CLOSED) and `IMP-O007` (deferred). Nothing was invented
and nothing was silently discarded.

## 18. Accepted exclusions

```text
commercial cancellation / refund       DEFERRED   PO-APP9-001 = OPTION A DEFER
notification / customer communication  DEFERRED   APP10 owns it
provider / webhook payment integration ABSENT     PAYMENT_MVP = MANUAL_BANK_TRANSFER
live carrier tracking                  ABSENT     carrier/tracking are static Admin facts
customer tracking UI                   NOT_IMPLEMENTED
customer fee-acknowledgement UI        BACKEND_READY / UI_DEFERRED
```

`PO-APP9-001 = OPTION A — DEFER` means the cancellation/refund branch left APP9's
active scope entirely: no cancellation endpoint, no refund approval or execution,
no refund UI, no `CON-144` configuration value, and **no invented refund
percentage or monetary default**. The delivered cancellation/refund persistence
was left untouched. X01 does not reinterpret any of this.

## 19. Next phase

```text
NEXT_PHASE = APP10
CANONICAL TITLE = APP10 — Customer Operations and Communication
```

Read from repository authority — the phase document
`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` and
`docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §2 — not from memory.

APP10's canonical outcome is customer profiles and contact points, merge
governance, agreements, notification delivery visibility and a simple
Zalo/Messenger handoff. That authority agrees with the two APP9 hand-offs, so
both are named here: **customer communication / notification composition**
(`FU-APP9-B01-01`, `SE-010 payment.final-requested`) and the **deferred customer
shipping-fee acknowledgement surfacing** — whose backend operation
`publicOrderShippingFee_acknowledge` already ships and whose blocker is that no
customer projection returns a server-authoritative proposed fee.

APP10 was **not begun**.

## 20. Closure matrix

```text
docs/implementation/reports/APP9-CLOSURE-MATRIX.md
```

Ten sections following the APP5–APP8 structure: checkpoint count, checkpoint
matrix, contract matrix, database matrix, worker matrix, Figma matrix, follow-up
matrix, route matrix, terminal state and handoff, closure verdict.

## 21. Validations run

| Command | Scope | Result |
| --- | --- | --- |
| `git status --porcelain` / `git status --porcelain -uall` | entry hygiene | clean before X01; E01 tree matched the accepted report exactly |
| `wc -l` on the six E01 files | entry hygiene | 34 / 322 / 563 / 33 / 118 / 166 — identical to E01 §22 |
| `git diff --check` | whitespace | clean |
| `node tools/check-figma-design-index.mjs` | design registry | **pass** — 450 ids, 450 node rows, 21 tables |
| `node tools/check-storefront-route-authority.mjs` | route authority | **pass** |
| `node tools/check-report-secrets.mjs` | every report | **2 findings, both pre-existing** — see below |
| read-only count of `openapi.generated.json` | OpenAPI baseline | 100 paths / 108 operations / 222 schemas |
| read-only count of `migrations/meta/_journal.json` | database baseline | 37 entries, last `0037` (APP7) |
| `git log --diff-filter=A` on each route file | route provenance | Admin routes from `a3956fd` (APP7); Storefront route from `b561a96` (APP9-S01) |

### The report-secret gate

Two findings, and **neither is new**:

```text
docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93
docs/implementation/reports/APP9-G01-COMPLETION-REPORT.md:381
```

Both are the same prose heuristic `FU-APP9-G01-01` records, and both are
byte-identical to the output `APP9-E01` §18 captured. The gate takes no file
arguments, so it cannot be scoped to X01's own files. It was run **once** on
entry and once after this report and the closure matrix were written — the second
run being justified because two files the gate reads were created in between,
which is the only condition the no-rerun rule permits. Neither X01 document adds
a finding; the output is unchanged. Nonblocking, inherited, recorded, not chased.

## 22. Validations deliberately not run

```text
E01 acceptance suites             §14 — closure reuses accepted evidence, it does not re-execute it
all API / worker / frontend tests X01 changed no runtime code, so nothing justifies a run
A01, S01, B01…B05, W01 suites     each proved its own behaviour; X01 asks a different question
full repository build             nothing was built
Docker / full stack               X01 needs no running service
OpenAPI regeneration              §5 — explicitly forbidden; the artifact was read, not rebuilt
API client regeneration           forbidden for the same reason
migration tests / db-manifest     §6 — forbidden; the journal was read
Figma redraw or re-approval       §7 — forbidden; the registry was read and gated
Playwright / E2E                  nothing needs a browser
repository-wide ESLint/Prettier   no source file changed; CLAUDE.md §9 forbids an aggregate anyway
APP9 closure consistency checker  none exists — tools/ carries check-app2/3/4-closure only.
                                  §14 conditions this on a scoped checker already existing,
                                  and no APP9 or generic phase-closure checker does
```

## 23. Changed files

```text
A  docs/implementation/reports/APP9-CLOSURE-MATRIX.md
A  docs/implementation/reports/APP9-X01-COMPLETION-REPORT.md
M  docs/implementation/10-MASTER-APPLICATION-ROADMAP.md      APP9 row -> CLOSED
M  docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md   roadmap X01 -> COMPLETE
```

Documentation only. No runtime, application, persistence, worker, frontend,
schema, migration, OpenAPI, generated-client, test or Figma file was modified.
The 563-line E01 journeys spec was **not** refactored — it stands under the
600-line hard limit and `FU-APP9-E01-01` records why it is deliberately whole.

## 24. Final git status

```text
branch          production
X01 entry HEAD  7255d84
X01 commit      this closure commit
working tree    clean after the closure commit
```

## 25. Push state

```text
NOT_PUSHED = true
```

Nothing was pushed at any point. Every commit is local.
