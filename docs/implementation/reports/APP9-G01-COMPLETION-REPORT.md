# APP9-G01 — Completion Report

## 1. Verdict

```text
APP9-G01                = COMPLETE
MODE                    = AUTHORITY / DOCUMENTATION_ONLY
PO-APP9-001             = OPTION_A_DEFER
CANCELLATION_REFUND     = DEFERRED
ACTIVE_APP9_CHECKPOINTS = 13
NEXT_CHECKPOINT         = APP9-B01
NOT_PUSHED              = true
```

No runtime behaviour was implemented. No source file, test, schema, migration,
generated artifact, OpenAPI document, generated client or Figma node was
touched. No ADR was created — the ruling *removes* scope rather than selecting
an architecture, and every remaining lock resolves inside an already-accepted
one.

```text
CONTRADICTION_WITH_STRONGER_AUTHORITY = NONE FOUND
```

## 2. Branch, entry HEAD, push state

```text
BRANCH        production
ENTRY_HEAD    1b372a4  docs(app9): audit remaining payment and fulfillment phase entry (APP9-R00)
WORKING_TREE  clean at entry
PUSHED        NO
```

## 3. Product Owner ruling

```text
PO-APP9-001 = OPTION A — DEFER          binding
```

Consequences recorded as authority:

```text
COMMERCIAL_CANCELLATION_REFUND_IN_APP9 = DEFERRED
CON_144_POLICY_VALUES_IN_APP9          = NOT_DEFINED
APP9_B06                               = NOT_CREATED
APP9_B07                               = NOT_CREATED
APP9_A02_CANCELLATION_REFUND           = NOT_CREATED
```

Options **B** (partial lock) and **C** (full saga) are withdrawn from active
planning; they survive only as the history of a closed decision. The question is
not re-asked inside APP9.

No CON-144 monetary value, refund percentage, refundable/non-refundable default
or per-stage disposition was invented. No provider-based or automatic refund
execution appears anywhere.

## 4. Final APP9 scope

In scope: `TR-LC14-05`; the customer `REMAINING` payment capability (read, QR /
manual-transfer instructions, attempt initiation, optional evidence); Admin
final-payment verification with `TR-LC14-06`; the `payment.verified` consumer
extension; editable shipping preparation; dispatch (freeze + snapshot +
`DELIVERED`) and completion; one Figma package; the extended Admin order
workspace; one new Storefront route; focused acceptance; closure.

Out of scope: cancellation and refund in every form; any payment provider,
callback, webhook or automatic bank reconciliation; any migration or schema
change; live carrier tracking; customer notification intents; APP8 production
semantics; a separate Admin fulfillment queue; a separate customer completion
route.

## 5. Locked lifecycle map

```text
PRODUCTION_COMPLETED   -> TR-LC14-05  ADMIN   -> AWAITING_FINAL_PAYMENT
                          requirement: a live REMAINING obligation exists
                          effect:      REMAINING becomes payable

AWAITING_FINAL_PAYMENT -> TR-LC14-06  SYSTEM  -> READY_FOR_DELIVERY
                          semantics:   consequence of successful final-payment verification
                          ownership:   synchronous, inside the Admin verification transaction
                          guard:       remaining obligation SATISFIED / GRD-016

READY_FOR_DELIVERY     -> TR-LC14-07  ADMIN   -> DELIVERED
                          guard:       GRD-017
                          effect:      shipping_details freeze + shipping_snapshots, atomically

DELIVERED              -> TR-LC14-08  ADMIN   -> COMPLETED
                          guard:       GRD-018
```

No worker is introduced for `TR-LC14-06` and no new event type is added.
`READY_FOR_DELIVERY -> COMPLETED` is never collapsed into one transition. The
non-canonical names `ready for handoff`, `fulfilled`, `fulfillment-completed`
and `shipment-completed` are prohibited.

APP8 handoff locked without modification: `production_job.status = COMPLETED`,
`order.status = PRODUCTION_COMPLETED`, `APP9_EXECUTION = NONE`. Production-job
cancellation (APP8-owned) stays distinct from commercial order cancellation.

## 6. Remaining-payment authority

```text
PAYMENT_MVP                = MANUAL_BANK_TRANSFER        (IMP-D052 / PO-APP7-001)
EXISTS_FROM_ORDER_CREATION = true
CREATED_ALONGSIDE_DEPOSIT  = true
INITIAL_STATE              = PENDING
AMOUNT_SOURCE              = accepted quotation version remaining_amount, verbatim
PAYABLE_AT                 = TR-LC14-05
DEPOSIT != REMAINING       = permanent                    (CST-039)
```

Prohibited: payment provider, payment callback, payment webhook, automatic bank
reconciliation, automatic provider refund, provider checkout. A pre-freeze
shipping-fee change uses the existing canonical obligation
recalculation/supersede behaviour; no alternative amount model is invented.

## 7. `B01` / `B02` / `B03` / `W01` boundaries

| Checkpoint | Owns | HTTP | Must not |
|---|---|--:|---|
| `B01` | `TR-LC14-05` only | 1 | customer read, QR, attempt initiation, verification, shipping, dispatch, completion |
| `B02` | customer `REMAINING` read + QR/instructions + attempt initiation | 3 | a new grant scope; duplicated evidence infrastructure; re-pointing a response type intentionally closed to `DEPOSIT` |
| `B03` | Admin final-payment verification + `TR-LC14-06`, one transaction | 0–1 | a worker moving the order; a new event type; changing `DEPOSIT` behaviour |
| `W01` | extend the sole `payment.verified` consumer | 0 | adding a second handler; reserving inventory again for `REMAINING` |

`B02` reuses the existing `REQUEST_ACCESS` grant and the existing attempt-scoped
`payment_transfer_evidence` lane (`IMP-D055`); a sibling final-payment
projection/route is allowed and expected.

`B03`'s transaction must lock the correct attempt/obligation/order, bind the
exact `REMAINING` obligation, mark the attempt successful, mark the obligation
`SATISFIED`, append reconciliation, move the order, append the lifecycle
transition, emit `payment.verified` with the **real** `obligationKind`, and stay
replay-safe with no duplicate writes on redelivery.

`FU-APP8-W01-01` remains routed to `APP9-W01` and is **not** fixed here. Its
current failure mode is unchanged: a `REMAINING` `payment.verified` is rejected
by the `InventoryReservationHandler` payload parser with `JOB_PAYLOAD_INVALID`
and terminally dead-letters. W01 extends that one consumer to accept both kinds,
no-ops for `REMAINING`, preserves every `DEPOSIT` behaviour and the effect-key /
idempotency semantics, adds zero handlers, and closes the follow-up.

## 8. Fulfillment and freeze authority

```text
shipping_details / shipping_snapshots / shipping_fee_acknowledgements = DELIVERED (0023)
freeze triggers                                                       = DELIVERED (0030)
APP9_MIGRATIONS                                                       = 0
CANONICAL_FREEZE_POINT                                                = the TR-LC14-07 dispatch transaction
```

No migration is created merely because runtime composition is absent; no generic
`fulfillment` table or state machine is created. Freeze is not a separate
lifecycle command. Before freeze, `shipping_details` is the source of truth
(`ADR-DB2-002`) and `EDITABLE` by Admin only (a customer change request is the
sensitive action an Admin applies, `ADR-DB3-004`). At dispatch, the detail is
frozen, the snapshot created and the order moved to `DELIVERED`, atomically.

Frozen fields stay the delivered set: `recipient_name`, `recipient_phone`,
`address_line`, `ward`, `district`, `province`, `country_code`, `fee_amount`,
`currency_code`, `carrier_name`, `tracking_code`. No customer-profile read is
invented after freeze; frozen data is never mutated as an ordinary correction;
`GRD-024` database triggers remain authority.

## 9. `B04` / `B05` boundary

| Checkpoint | Owns | HTTP | Must not |
|---|---|--:|---|
| `B04` | shipping detail read/write while `EDITABLE`, incl. the fee-acknowledgement path | 2 | dispatch, freeze, `READY_FOR_DELIVERY -> DELIVERED`, `DELIVERED -> COMPLETED` |
| `B05` | `TR-LC14-07` and `TR-LC14-08` | 2 | collapsing the two transitions into one |

They stay separate because editable shipping and irreversible freeze are
different authorities. `B05` preserves `GRD-016`, `GRD-017`, `GRD-018` and
`GRD-024`.

## 10. Carrier-tracking boundary

```text
LIVE_CARRIER_TRACKING = OUT_OF_SCOPE
```

`carrier_name` and `tracking_code` are allowed only as static internal facts
already supported by persistence and journeys (J8). No carrier integration,
carrier API, courier webhook, polling, shipment timeline, parcel event stream,
live tracking map, customer tracking page or tracking-status state machine.
Binding on `B04`, `B05`, `D01`, `A01`, `S01`, `E01`.

## 11. Notification boundary

```text
APP9_NOTIFICATION_INTENTS         = OUT_OF_SCOPE
APP10_OWNS_CUSTOMER_COMMUNICATION = true
```

APP9 emits the domain/outbox events the lifecycle requires and adds no email or
SMS template, notification-intent orchestration, notification retry API,
communication-center behaviour or operational notification search. Existing
communication behaviour from earlier phases is neither removed nor altered.

## 12. Cancellation/refund deferral

```text
COMMERCIAL_CANCELLATION_REFUND = DEFERRED_FROM_APP9
```

Reason: the mechanics exist and ship untouched; the missing part is CON-144
money policy, which `ADR-DB3-002` deferred to the business owner and which APP9
is forbidden to invent; the commerce-completion exit gate does not depend on it;
and keeping it in APP9 would enlarge the phase without advancing that gate.

Not implemented, by ruling: commercial cancellation endpoints,
`order_cancellation_requests` application flows, refund approval, refund
execution, refund Admin UI, refund customer UI, CON-144 values. Existing
persistence is untouched — not deleted, not redesigned, not migrated.

## 13. `IMP-O008` disposition

```text
IMP-O008 = DEFERRED / NONBLOCKING
```

Register row rewritten: still open after `APP9-G01` **by design**, not an APP9
blocker, additive by construction (`order_cancellation_requests`, `refunds`,
`payment_reconciliations`, the S1–S9 stage matrix, the six-step compensation
saga and `refundableAmount()` all ship), re-open owner = the first phase that
locks the CON-144 values with the business.

## 14. `FU-APP8-B04-02` disposition

```text
FU-APP8-B04-02 = CARRIED_FORWARD / NONBLOCKING
```

No new APP8 work: the order stays where it is by design; `ON_HOLD` is already
legal and delivered; a replacement production job for the same approval snapshot
is impossible (`uq_production_jobs__order_approval_snapshot` is a plain unique),
so re-planning is the delivered `ADR-DB3-003` approval-revision path. Nothing is
retrofitted into `APP8-B04`.

## 15. Design authority

```text
APP9_FIGMA_ROWS_AT_ENTRY = 0
APP9_D01_REQUIRED        = true
DESIGN_GATE              = DESIGN_REQUIRED_BEFORE_UI
```

One complete package in `APP9-D01`, on a new `APP_09` page in
`FIG-FILE-PRODUCT`, before `A01` and `S01`. Rows enter `REVIEW_REQUIRED`; Claude
must not self-approve Product Owner design acceptance.

Covered: the Admin order workspace extension (fulfillment/status filtering, the
`TR-LC14-05` action, final-payment status and verification context, editable
shipping information, dispatch, completion, frozen shipping facts, refusal and
error states) and one Storefront final-payment capability (context, exact
`REMAINING` amount, bank-transfer instructions, QR, optional evidence lane,
payment state, delivered/completed status).

Not designed: a customer tracking page, live carrier tracking,
cancellation/refund UI, a notification center, or a new fulfillment queue route
— the last unless later implementation evidence proves the existing `/orders`
surface cannot support the accepted design.

## 16. Admin UI authority (`APP9-A01`)

```text
NEW_ADMIN_ROUTES = 0
STRATEGY         = extend /orders and /orders/{orderId}
```

No duplicate fulfillment queue over the same orders dataset. `A01` composes the
already-delivered `B01`/`B03`/`B04`/`B05` capabilities and must not add backend
operations merely to simplify frontend implementation.

## 17. Storefront UI authority (`APP9-S01`)

```text
NEW_STOREFRONT_ROUTES = 1
APP9_S02              = DOES_NOT_EXIST
```

Renders the exact payable `REMAINING` amount, manual bank-transfer instructions,
QR, payment attempt state, optional transfer evidence and safe lifecycle status
through completion. Never renders carrier name, tracking code, shipment
timeline, live delivery status or cancellation/refund controls. Customer
completion status is merged into `S01`.

## 18. `APP9-E01` scope

```text
JOURNEYS = 3
CASES    = 10-13
```

1. Remaining payment: `PRODUCTION_COMPLETED` → `TR-LC14-05` → exact `REMAINING`
   read → attempt initiated → Admin verifies → `SATISFIED` →
   `READY_FOR_DELIVERY` → `payment.verified` consumed → **no second inventory
   reservation**.
2. Fulfillment freeze and completion: editable → dispatch → frozen + snapshot →
   `DELIVERED` → post-freeze ordinary mutation rejected → completion →
   `COMPLETED`.
3. Negative lifecycle guards: dispatch refused before the remaining payment is
   satisfied; completion refused before `DELIVERED`.

Focused, not a regression: lower-checkpoint unit/integration cases are not
retested, accepted evidence is reused for unchanged internals, and no broad
repository suite is run by reflex.

## 19. Canonical roadmap

```text
R00 -> G01 -> B01 -> B02 -> B03 -> W01 -> B04 -> B05 -> D01 -> A01 -> S01 -> E01 -> X01
```

| Order | Checkpoint | Canonical purpose |
|---:|---|---|
| 1 | `APP9-R00` | Phase entry audit |
| 2 | `APP9-G01` | Authority lock |
| 3 | `APP9-B01` | `TR-LC14-05`, make `REMAINING` payable |
| 4 | `APP9-B02` | Customer remaining-payment read / QR / initiate |
| 5 | `APP9-B03` | Admin remaining verification + `TR-LC14-06` |
| 6 | `APP9-W01` | `payment.verified` safe `REMAINING` consumption |
| 7 | `APP9-B04` | Editable shipping detail capability |
| 8 | `APP9-B05` | Dispatch freeze + delivery + completion |
| 9 | `APP9-D01` | One complete APP9 Figma package |
| 10 | `APP9-A01` | Admin fulfillment workspace |
| 11 | `APP9-S01` | Customer remaining-payment / completion surface |
| 12 | `APP9-E01` | Focused commerce-completion acceptance |
| 13 | `APP9-X01` | Closure |

`B06`, `B07`, `A02`, `S02`, `C01`, `C02` and `C03` are **not** added.

## 20. Validation actually run

| Command | Result |
|---|---|
| `git status --short` | clean at entry; only the five documentation files in §22 changed |
| `git diff --check` | no whitespace or conflict-marker error |
| `git rev-parse HEAD` | `1b372a4` — entry HEAD recorded |
| targeted `grep` / read-back of every changed authority document | the ruling, the lifecycle map, the boundaries and the single `NEXT` read back as written |
| `node tools/check-report-secrets.mjs` (repository report-secret convention) | **Exit 1 — one finding, pre-existing and not APP9-G01's.** Neither changed document is flagged. The sole finding is `reports/APP6-B04-COMPLETION-REPORT.md:93`, where the checker's `"token" followed by a plaintext value` heuristic matches a **Zod schema literal** — `z.object({ token: z.string().regex(...) }).strict()` — not a credential. Proved pre-existing by re-running the checker against a clean `1b372a4` worktree (`git stash -u`), which reports the identical single finding; `git stash pop` restored the change set unchanged. Not fixed here: `APP6-B04` is outside this checkpoint and G01 performs no unrelated edits. Recorded as `FU-APP9-G01-01` in §22a. |

## 21. Validations deliberately not run, and why

| Not run | Why |
|---|---|
| `pnpm test`, Jest, API integration, worker acceptance, Playwright | No executable source changed. There is nothing for a test to observe. |
| Docker, build, migration execution, DB race suites | No schema, migration, container or build input changed; `APP9_MIGRATIONS = 0`. |
| OpenAPI generation, API-client generation | OpenAPI is a build product of controllers (`APP0-B01`); no controller exists or changed. |
| `node tools/check-figma-design-index.mjs` | Scoped to design and frontend UI checkpoints. G01 is neither; no Figma node or registry row was touched. |
| `APP8-E01`, APP9 implementation tests | Prior accepted acceptance evidence; nothing in their scope changed. |
| Prettier, ESLint, SonarQube | The three project-wide quality mechanisms do not apply to a Markdown-only authority change: ESLint and SonarQube analyse source that did not change, and Prettier does not own these documents' formatting under `VALIDATION_GOVERNANCE.md` §3. Recorded as deliberately not run rather than silently skipped. |

No global aggregate validation command was invoked
(`VALIDATION_GOVERNANCE.md` §1.1, §5).

## 22. Changed files

| File | Change |
|---|---|
| `docs/implementation/audits/APP9_G01_COMMERCE_COMPLETION_AUTHORITY.md` | **new** — the authority package (§1–§14) |
| `docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md` | header authority note; §2 dependency; §4 locked lifecycle/boundary block; §6 rewritten as the deferral ruling; §7/§8 scope; §10 roadmap frozen; §13 exit gate; §15 status table |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | **`IMP-D057`** added (LOCKED); `IMP-O008` rewritten as deferred/nonblocking with a re-open owner |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP9 row: status, the `APP9-G01` authority summary, `NEXT_CHECKPOINT = APP9-B01` |
| `docs/implementation/reports/APP9-G01-COMPLETION-REPORT.md` | **new** — this report |

```text
SOURCE_FILES_CHANGED     = 0
TEST_FILES_CHANGED       = 0
SCHEMA_MIGRATIONS_ADDED  = 0
GENERATED_ARTIFACTS      = 0
FIGMA_NODES_TOUCHED      = 0
```

## 22a. Follow-up raised

| ID | Finding | Classification | Owner |
|---|---|---|---|
| `FU-APP9-G01-01` | `node tools/check-report-secrets.mjs` exits 1 on a **pre-existing false positive** at `reports/APP6-B04-COMPLETION-REPORT.md:93`: the `"token"`-followed-by-a-value heuristic matches the Zod schema literal `z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()`, which discloses nothing. Because the gate is repository-wide and fails closed, every later checkpoint that runs it inherits a red result unrelated to its own change. Fix is either rewording that one APP6 line or narrowing the heuristic. | `NONBLOCKING_OPEN` — no credential is disclosed, and no APP9 document is implicated | the checkpoint that next touches `APP6-B04`'s report or the checker |

## 23. Roadmap status

```text
R00   COMPLETE
G01   COMPLETE
B01   NEXT
B02   INCOMPLETE
B03   INCOMPLETE
W01   INCOMPLETE
B04   INCOMPLETE
B05   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. The canonical status table is
[`phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md`](../phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md)
§15; this table mirrors it.

## 24. Next checkpoint

```text
NEXT_CHECKPOINT = APP9-B01
```

`APP9-B01` owns `TR-LC14-05` and nothing else: one HTTP operation moving
`PRODUCTION_COMPLETED → AWAITING_FINAL_PAYMENT` against a live `REMAINING`
obligation, 0 migrations, 0 worker changes, 0 UI.

## 25. Correction ledger

```text
APP9-G01-C1 = UNUSED
```

Each APP9 checkpoint has at most one correction. There is no `C2`.

## 26. Push state

```text
NOT_PUSHED = true
```

One local checkpoint commit was made on `production`. Nothing was pushed.
