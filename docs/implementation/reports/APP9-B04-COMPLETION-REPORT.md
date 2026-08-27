# APP9-B04 — Editable Shipping Detail and Fee-Recalculation Composition — Completion Report

## 1. Verdict

```text
APP9-B04 = COMPLETE
APP9_B04_HTTP_OPERATIONS = 2
SHIPPING_DETAIL_READ = DELIVERED
SHIPPING_DETAIL_EDITABLE_WRITE = DELIVERED
FEE_RECALCULATION = CANONICAL
FEE_INCREASE_ACK = ENFORCED
DISPATCH_FREEZE = NOT_IMPLEMENTED
MIGRATIONS_ADDED = 0
NEXT_CHECKPOINT = APP9-B05
NOT_PUSHED = true
```

## 2. W01 housekeeping commit

The working tree at B04 entry carried exactly the paths the accepted `APP9-W01`
report §24 lists — 1 new runtime file, 2 modified runtime files, 2 modified test
files, 2 modified docs and the report itself: 8 paths, against 6 modified + 2
untracked in the tree. Nothing extra, nothing missing. It was still uncommitted,
so it was committed once, unchanged:

```text
5e84c77  feat(app9): make REMAINING payment.verified a safe no-op (APP9-W01)
```

No W01 behaviour was altered to make it commit, and **no W01 test was rerun** for
this housekeeping. B04 started from a clean tree.

## 3. Branch, HEAD, commit, push state

```text
branch            production
W01 commit        5e84c77   (created by this checkpoint's §1 housekeeping)
B04 entry HEAD    5e84c77
B04 commit        none — the work is left uncommitted for review
pushed            no
NOT_PUSHED        true
```

## 4. The exact two operations

```text
GET /api/admin/orders/{orderId}/shipping-detail   adminOrderShipping_read
PUT /api/admin/orders/{orderId}/shipping-detail   adminOrderShipping_save
```

One path, one singleton sub-resource. `uq_shipping_details__order` (CST-033)
makes "at most one detail per order" physical, so there is no collection and no
id to POST into; `PUT` is the honest verb and the delivered writer is already an
upsert on the order key. The receipt is `200`, never `201` — a create and an
update land on the identical URL.

The domain is `adminOrderShipping`, derived from the class name. It is
deliberately **not** added to `CONTROLLER_DOMAIN_KEYS`: that table is for classes
split apart for reasons that are not contract changes, and this is a distinct
sub-resource with its own read/write pair — the precedent
`/api/admin/orders/{orderId}/payments` set as `adminOrderPayment`, and the same
reason `PublicCustomRequestAssetController` is kept out of the table. The four
accepted `admin/orders` operation ids (`adminOrder_list`, `adminOrder_detail`,
`adminOrder_transition`, `adminOrderPayment_read`) are unchanged, asserted in the
contract suite.

**No third operation exists.** There is no `freeze`, `dispatch`, `shipping-fee`,
`acknowledgement` or `tracking` route, and the contract suite proves it by
scanning every published path.

## 5. Admin boundary

`AuthenticatedAdminGuard` at controller level; `StaffOriginGuard` and
`StaffJsonBodyGuard` additionally on the mutation — the exact combination every
Admin mutation in this repository uses, reused, not reimplemented. Neither
handler accepts an operator identity: the actor is bound by the guard and read
from the request context inside the use case.

There is **no** `REQUEST_ACCESS` route, no Storefront path and no public path to
either operation. ADR-DB3-004 makes pre-freeze shipping edits Admin-only; a
customer change request is something the operator applies through this same
`PUT`. The contract suite asserts that no non-`admin` path names shipping at all.

## 6. Read projection

The canonical `ShippingDetail` projection of `shipping_details` (TBL-047), read
through `ORDER_REPOSITORY.loadShippingDetail`:

```text
recipientName  recipientPhone  addressLine  ward  district  province
countryCode    feeAmount       carrierName  trackingCode  status  frozenAt
```

`ward`, `district`, `countryCode` and `frozenAt` were **added to the delivered
projection** by this checkpoint. They are columns the delivered writer already
sets (`ward`/`district`), that the row defaults (`countryCode`) or that
`dispatch()` sets (`frozenAt`), and `dispatch()` already reads `countryCode` off
the row for the snapshot. Without them the write could store a ward the read
could never show. The change is additive; the only existing consumers are
`toMatchObject` assertions in `order.integration.spec.ts`.

`fulfillmentNote` is a real TBL-047 column and is deliberately **not** published:
no delivered writer sets it and `dispatch()` does not copy it into the snapshot,
so publishing it would promise a fact nothing in this system produces.
`currencyCode` is absent because it is CHECK-pinned to `VND` — a field carrying
it would be a constant dressed as data.

Nothing consults the customer profile, a contact point or an address book. The
recipient is the order's own frozen delivery fact (ADR-DB2-002), which is exactly
why a later profile edit cannot rewrite where an order was sent.

`carrierName`/`trackingCode` are internal strings an operator typed. There is no
carrier client, no polling, no webhook and no derived delivery state — the
absence is structural: the module holds no HTTP client to reach a carrier with.

## 7. Create/update semantics

The body is the whole detail. A `PUT` that merged would make "clear the tracking
code" unexpressible, and the delivered `onConflictDoUpdate` already writes the
full value set — so a partial body would silently null the columns it omitted.
Optional fields are optional because the **column** is nullable, never because
omission means "leave alone".

The body cannot carry `status`, `frozenAt`, `countryCode`, `currencyCode`,
`orderId`, a grant id, a challenge id or an acknowledgement flag.

## 8. EDITABLE / FROZEN

```text
read   available in both states; reports status and frozenAt
write  EDITABLE only
```

`FROZEN` is refused with `SHIPPING_FROZEN` (409). The check is made in the use
case **before** any obligation is touched, and the delivered
`saveShippingDetails` re-asserts it underneath, and `GRD-024`'s database trigger
underneath that. Nothing thaws, deletes-and-recreates, bypasses a trigger or
implements a post-freeze correction path. On success the detail is still
`EDITABLE` — asserted in cases 2, 3 and 5.

## 9. Fee authority derived from DB3 (§7 preflight)

Resolved from `DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1, `DB3_LIFECYCLE_
SPECIFICATIONS.md` LC-15 and the delivered repositories — not asked of the PO:

```text
QUOTED_FEE_SOURCE            quotation_versions.shipping_fee_amount of the order's
                             ACCEPTED version, frozen when SENT (INV-02), reached
                             through orders.accepted_quotation_version_id
CURRENT_SHIPPING_FEE_SOURCE  shipping_details.fee_amount once one is stored;
                             the quoted fee before that
FEE_CHANGE_COMPARISON_RULE   exact bigint hundredths of a VND; no float anywhere
REMAINING_RECALC_FORMULA     successor = live_REMAINING.amount + (new_fee - old_fee)
                             ("recalculated theo chênh lệch", DB3 §1.2)
FEE_INCREASE_ACK_REQUIREMENT one shipping_fee_acknowledgements row (TBL-049)
ACK_GRANT_REQUIREMENT        an ACTIVE, unexpired REQUEST_ACCESS grant on this
                             order's custom request, belonging to this customer
ACK_STEP_UP_REQUIREMENT      a VERIFIED STEP_UP challenge on one of that customer's
                             verified, active contacts
ACK_ELIGIBILITY_RULE         inside the published secure_grant stepUpWindowSeconds
REMAINING_SUPERSEDE_SEQUENCE predecessor -> SUPERSEDED, successor created PENDING,
                             superseded_by_obligation_id set, OBLIGATION_RECALC
                             reconciliation appended (TR-LC15-04)
LOCK_ORDER                   shipping_details -> payment_obligations
```

**Why the quoted fee is the baseline for the first write.** The live `REMAINING`
was priced from a total that already includes the quoted shipping fee. If the
baseline were "nothing" until a detail exists, an operator creating the detail
with a fee the customer never saw would move real money with no recalculation and
no acknowledgement. After the first write the stored fee is the baseline, which
is what stops a second edit re-applying the first one's delta. The invariant that
holds across any number of edits is:

```text
remaining = quoted_remaining + (current_fee - quoted_fee)
```

This is **not** the forbidden "reread a mutable quotation as current payment
truth" (§9): an `ACCEPTED` version is frozen by INV-02, the payable figure remains
the obligation row throughout, and the quotation is consulted only for the fee
this order was created against. No `total - deposit` is computed anywhere.

## 10. Unchanged / decrease / increase

| Effective fee | Shipping | REMAINING | Acknowledgement | Reconciliation | Order |
|---|---|---|---|---|---|
| unchanged | written | untouched | none | none | untouched |
| decrease | written | superseded + successor | **none** (DB3 §1.2 — in the customer's favour) | `OBLIGATION_RECALC` | untouched |
| increase | written | superseded + successor | **required**, one row | `OBLIGATION_RECALC` | untouched |

No recalculation history is produced for an unchanged fee: no obligation row, no
acknowledgement row, no reconciliation row, no payment attempt. Case 2 asserts
all four counts, plus the order status.

DEPOSIT is never read for a decision, never touched and never recomputed. Case 3
asserts it verbatim after a recalculation.

## 11. Acknowledgement validation

The evidence is **resolved server-side from the order's own chain**, never
accepted from the body — an operator cannot name a grant, name a challenge, or
assert that a customer agreed. The order names its request, the request names its
live grants, the grant names the customer, and the customer's own verified
contacts name the step-up.

Beyond the two `NOT NULL` foreign keys (which DB6 is explicit only guarantee
*existence*), `ShippingFeeAcknowledgementResolver` validates:

```text
scope     scopeKind === REQUEST_ACCESS               (ADR-DB3-004 r1)
status    listActiveForRequest filters status ACTIVE (not revoked, not superseded)
expiry    expiresAt > now                            — checked explicitly
chain     grant.customRequestId === order.customRequestId   (G-DB7-39)
          grant.customerId      === order.customerId        (G-DB7-38)
step-up   StepUpEvidenceResolver — a VERIFIED STEP_UP on a verified, active
          contact of that customer, inside the published window (GRD-003)
```

**The expiry check is not redundant with the status filter.** This is the one
subtle finding of the checkpoint: `listActiveForRequest` filters
`status = 'ACTIVE'` and deliberately applies **no date predicate**, because a
grant moves to `EXPIRED` by a sweep rather than by the passage of time. A grant
whose `expires_at` has passed but whose row has not been swept is still `ACTIVE`,
so accepting the status alone would let a lapsed link authorize money. It is
checked explicitly in the resolver and the reason is recorded at the call site.

The step-up half is delegated whole to `StepUpEvidenceResolver` — the exported
`APP6-B05` capability with its fail-closed published-policy read — so GRD-002 and
GRD-003 are executed by the code that owns them, not re-implemented, relaxed or
mocked. No new secure-access model is invented.

**Nothing secret is stored or published.** The row carries two ids and an
instant. `SecureAccessGrant` has no `token_hash` field at all, so no digest
exists in this module's objects to leak; no OTP, code hash or pepper is
constructed, read or logged. The contract suite asserts that `grantId`,
`stepUpChallengeId`, `tokenHash`, `otp`, `codeHash`, `pepper` and nine more
strings appear in no schema name, description or example.

There is **no third endpoint**: the acknowledgement is appended in the same
transaction as the write it authorises, which is what stops evidence being
recorded apart from the change it authorises.

## 12. REMAINING recalculation authority

`TR-LC15-04` (`PENDING → SUPERSEDED`, "new obligations created same tx",
side effect "reconciliation record"), `ADR-DB3-003 r7`, and
`payment_obligations.superseded_by_obligation_id`.

**The R00 audit's composition prescription was insufficient, and this is worth
recording.** `APP9_PHASE_ENTRY_AUDIT.md` line 530 routes obligation
recalculation to `createForOrder` + `cancel`. `cancel` produces `CANCELLED`, not
`SUPERSEDED`, and never writes the chain pointer — a cancelled obligation is
*withdrawn*, not *replaced*, and the two are not interchangeable. No delivered
writer produced `SUPERSEDED` at all; `final-payment-context.ts` says so directly
("no checkpoint before `APP9-B04` delivers a writer for" it, and forces the state
with raw SQL). So B04 delivers that writer, in the existing aggregate, against
the existing column, with no migration.

## 13. Supersede / successor sequence

```text
1. lock predecessor FOR UPDATE, assert PENDING
2. predecessor -> SUPERSEDED                     (frees the live index)
3. INSERT successor PENDING, carrying the predecessor's order, kind, currency
   and source_quotation_version_id
4. predecessor.superseded_by_obligation_id = successor.id
```

**Step 2 must precede step 3, and this was a real defect the tests caught.** The
first implementation created the successor first — reasoning that the `restrict`
FK needs its target to exist — and case 3 failed with `OBLIGATION_ALREADY_ACTIVE`:
`uq_payment_obligations__order_kind__live` is partial over `PENDING` **and**
`SATISFIED`, so two `PENDING` REMAINING rows violate it even for an instant. One
live obligation per (order, kind) is exactly what INV-04 means. The pointer is
therefore set in a third statement, after the successor exists.

The predecessor's `amount` is **never** edited, in any step. It keeps the figure
it was payable at; the chain, not an edited row, is the history. Case 3 and case
5 both assert the superseded row still holds `1785000.00`.

Provenance travels with the chain: the successor carries the predecessor's
`source_quotation_version_id` rather than re-deriving it from a live quotation,
which would make a mutable row the origin of a frozen one. Asserted in case 3.

## 14. Satisfied-REMAINING fee-change rule (§12)

**Refused, with zero writes.** The exact rule implemented and why:

`LC-15` defines exactly one transition into `SUPERSEDED` — `TR-LC15-04`,
`PENDING → SUPERSEDED`. `SATISFIED` is terminal. There is therefore **no
canonical post-satisfaction recalculation path**, and manufacturing one would
require a backward LC-14 move (`READY_FOR_DELIVERY → AWAITING_FINAL_PAYMENT`, or
`DELIVERED → …`) that LC-14 does not define — leaving the customer a new
`PENDING` balance they could not legally pay.

So a **fee-changing** write against a settled REMAINING is refused with
`SHIPPING_FEE_CHANGE_NOT_AVAILABLE` (409) and nothing is written. **Non-fee edits
still succeed** — the address may still be corrected until dispatch freezes it,
which case 7 proves in the same test.

The guard is stated twice on purpose: in the use case, so the refusal carries a
specific code before anything is written; and inside `recalculate`, which locks
the row and re-asserts `PENDING`, so no future caller can reach the writer from a
different path and reopen settled money.

## 15. Transaction, lock order, replay

One `runInTransaction` wraps the whole write:

```text
1. orders                          findById
2. shipping_details  FOR UPDATE    lockShippingFeeBaseline (+ the quoted fee)
3. assert not FROZEN
4. payment_obligations             findLiveForOrder, assert PENDING
5. shipping_fee_acknowledgements   append            (increase only)
6. payment_obligations FOR UPDATE  supersede + successor
7. payment_reconciliations         append OBLIGATION_RECALC
8. shipping_details                save
```

A refusal at any step leaves no shipping update, no successor obligation, no
acknowledgement row and no reconciliation. Cases 4, 6 and 7 each assert all four
absences after a refusal, and case 4 deliberately sends an address change
alongside the rejected fee so the test proves the *travelling* edit rolled back
too, not merely that a create did not happen.

**The arbiter is delivered and unchanged.** No SERIALIZABLE isolation, no
advisory lock and no new infrastructure. Two writers contend on the predecessor
obligation's `FOR UPDATE` lock: the second blocks, then re-reads `SUPERSEDED` and
refuses rather than recalculating from the same previous fee. The shipping
detail's own row lock serialises writes against an order that already has one.
Because the REMAINING obligation is created at order conversion, the obligation
row lock is always available — including for two concurrent *first* writes, where
the shipping row does not yet exist to be locked.

DB8 race suites were **not** run: the lock order, isolation level and arbiter are
unchanged by this checkpoint (§13 of the checkpoint brief).

**Replay.** The delivered Admin mutation conventions, and no new idempotency
subsystem. The write is a `PUT` of the whole detail, so a retry is safe by
committed truth: the second call measures the fee against what the first one
stored, finds the delta zero, and records no second acknowledgement and no second
successor. Case 5 replays an accepted increase and asserts exactly one
acknowledgement, two REMAINING rows and one reconciliation afterwards.

## 16. Proof of no dispatch, freeze, snapshot or completion

- `dispatch()` is never called from any B04 code path; `grep` over the module
  finds it only in the test harness, where it is used to *construct* the frozen
  state case 6 needs.
- `shipping_snapshots` is never written. Cases 2, 3 and 5 assert
  `countRows('shipping_snapshots') === 0` after a successful write.
- `frozen_at` is never set and `status` is never moved to `FROZEN` by B04.
- No `order_transitions` row is appended and no LC-14 move is made. Cases 2, 3
  and 7 assert the order's status is exactly what it was.
- No `DELIVERED` and no `COMPLETED`. `TR-LC14-07` and `TR-LC14-08` remain wholly
  unimplemented; `DISPATCH_FREEZE = NOT_IMPLEMENTED`.

## 17. No tracking, notification, provider, refund, migration

```text
live carrier tracking      none — carrierName/trackingCode are stored strings;
                           no carrier client exists in the module's injector
carrier API/webhook/poll   none
notification intent        none — APP9-G01 §8, APP10 owns customer communication
outbox event               none minted; no OutboxEventStore consumer
provider/callback/webhook  none — PAYMENT_MVP = MANUAL_BANK_TRANSFER
cancellation/refund        none — IMP-O008 stays deferred
worker change              none — apps/worker has 0 changed files
Figma/frontend             none — apps/admin and apps/storefront have 0 changed files
migrations added           0
schema changes             0
```

`FU-APP9-B01-01` and `FU-APP9-B01-02` were not addressed here.

## 18. OpenAPI before / after

```text
                 BEFORE   AFTER   DELTA
paths              96       97      +1
operations        103      105      +2
schemas           214      218      +4
APP9_B04_OWNED_OPERATIONS = 2
```

The `+2` operations are exactly `adminOrderShipping_read` and
`adminOrderShipping_save`. The `+4` schemas are `SaveShippingDetailBody`,
`AdminShippingDetailResponse`, `AdminShippingFeeOutcomeResponse` and
`AdminShippingDetailSavedResponse`. The entry baseline (96/103/214) matched the
brief exactly, confirming W01 changed nothing.

## 19. Generated-client disposition

Normal flow, no hand edits:

```text
source/controller/DTO -> CMD-OPENAPI-GENERATE -> CMD-OPENAPI-CHECK
                      -> CMD-API-CLIENT-GENERATE -> CMD-API-CLIENT-CHECK
```

Both drift gates pass. The client regenerated 2 files, tree hash
`0b4f68ba66e9b54a89ba93a054de593a51a409a16940a40119a65a4f0bdd78e0`.

`packages/api-client/src/index.ts` — the **curated** export surface — is
deliberately untouched. Curation belongs to the frontend checkpoint that consumes
the operation (`APP9-A01`), which is the same rule `APP3-B03B` recorded.

## 20. Focused tests and counts

```text
CMD-TEST-APP9-B04-CONTRACT      1 suite,  7 tests   PASS
CMD-TEST-APP9-B04-INTEGRATION   1 suite,  7 tests   PASS
```

One focused contract group and one focused integration group, as §19 asks. The
seven integration cases map one-to-one onto the seven required proofs; no case
was added for inflation and none was merged away.

Secure test evidence (§20): the acknowledgement cases use the **committed
fixture** grant and step-up challenge that `order-fixture.ts` already seeds, and
run the **production** validators — `SecureAccessGrantRepository` and
`StepUpEvidenceResolver` against the published `secure_grant` policy. GRD-002 and
GRD-003 are not mocked away. No secure-link token, OTP, digest, pepper or
challenge secret is constructed, printed or asserted on; case 5 asserts the
acknowledgement names the fixture's `grantId`/`challengeId`, which are plain row
identifiers.

## 21. Validation order

```text
1 inspect        authority docs, delivered repositories, delivered contracts
2 implement      persistence, then application, then presentation
3 prettier       the changed source and test files
4 tsc + eslint   @embroidery/persistence, then @embroidery/api
5 fix            one unnecessary type assertion
6 generate       OpenAPI -> check -> api-client -> check
7 tests          contract, then integration
8 docs           roadmap, command index, this report
```

`tsc` and `eslint` were clean before the first test ran.

## 22. Reruns, and the exact intervening change

| # | Command | Intervening change that justified it |
|--:|---|---|
| 1 | `CMD-TEST-APP9-B04-INTEGRATION` | Two real defects fixed after the first run. (a) **Runtime:** `recalculate` created the successor before superseding the predecessor, violating `uq_payment_obligations__order_kind__live`; the statement order was inverted and the chain pointer moved to a third statement. The method was also extracted to `PaymentRecalculationRepository`, because folding it into `drizzle-payment-obligation.repository.ts` pushed that file to 402 lines against a 400 hard cap. (b) **Harness:** the suite never published the `secure_grant` policy the production `StepUpEvidenceResolver` reads fail-closed, so the increase case died on `SECURE_GRANT_POLICY_UNAVAILABLE`; the context now publishes it through `PolicyConfigurationRepository`, the same fixture shape `quotation-decision-context.ts` uses. |

`CMD-TEST-APP9-B04-CONTRACT` passed once and was **not** rerun. Everything
changed after that pass was persistence-internal or test-only; the controller,
the DTOs and the response schemas the contract suite reads are byte-identical to
what it saw. Neither command was rerun after the Markdown edits, and there was no
combined final-confidence rerun.

`CMD-OPENAPI-CHECK` and `CMD-API-CLIENT-CHECK` were likewise not rerun: nothing
that produces the document changed after they passed.

## 23. Validations deliberately not run, and why

```text
full pnpm test / full Jest             no repository-wide aggregate exists (§9)
all API integration / order / payment  no delivered behaviour outside the two new
                                       routes changed; the ShippingDetail projection
                                       widened additively
APP7/APP8 E01, APP9 B01/B02/B03 tests  untouched surfaces
W01 worker tests / worker acceptance   apps/worker has 0 changed files
DB8 race suites                        lock order, isolation level and arbiter all
                                       unchanged (§13)
Playwright / Docker / full build       no frontend or infrastructure change
Admin / Storefront tests               no frontend change
Figma checks                           not a design or frontend UI checkpoint
migration tooling                      0 migrations
SonarQube                              repository-global control, not per checkpoint
```

## 24. Changed files and sizes

**New — runtime (8)**

```text
116  packages/persistence/src/payment/payment-recalculation.repository.ts
 84  apps/api/src/modules/order/admin-order-shipping.module.ts
164  apps/api/src/modules/order/domain/shipping/admin-shipping.errors.ts
107  apps/api/src/modules/order/domain/shipping/shipping-fee-amount.ts
 65  apps/api/src/modules/order/application/admin/read-shipping-detail.query.ts
327  apps/api/src/modules/order/application/admin/save-shipping-detail.use-case.ts
142  apps/api/src/modules/order/application/admin/shipping-fee-acknowledgement.resolver.ts
264  apps/api/src/modules/order/presentation/admin-order-shipping.controller.ts
```

**New — DTOs (2)**

```text
 65  presentation/schemas/admin-order-shipping.request.ts
178  presentation/schemas/admin-order-shipping.response.ts
```

**New — tests (2)**

```text
267  presentation/admin-order-shipping.contract.spec.ts
367  tests/integration/admin-shipping-detail.integration.spec.ts
535  tests/integration/shipping-detail-context.ts
```

**Modified — runtime (8)**

```text
237  persistence/order/order.repository.ts          ShippingDetail widened; ShippingFeeBaseline;
                                                    lockShippingFeeBaseline on the contract
 59  persistence/order/order-row.mapper.ts          four fields projected
314  persistence/order/drizzle-order-shipping.repository.ts   lockShippingFeeBaseline
328  persistence/order/drizzle-order.repository.ts  delegation
277  persistence/payment/payment-obligation.repository.ts     RecalculateObligationInput; recalculate
347  persistence/payment/drizzle-payment-obligation.repository.ts  delegation
 58  persistence/payment/payment-persistence.module.ts        provider
196  persistence/src/index.ts                       two type exports
389  apps/api/src/bootstrap/app.module.ts           module registration
```

**Modified — generated (3)** `openapi.generated.json`,
`embroidery-api.schemas.ts`, `embroidery-api.ts` — regenerated, never hand-edited.

**Modified — docs (2)** the phase roadmap ledger, `SCOPED_COMMAND_INDEX.md`.

Every runtime/application source file is ≤ 400 lines (largest: 347). Every test
file is ≤ 600 (largest: 535).

## 25. Nonblocking findings

```text
FU-APP9-B04-01  `shipping-detail-context.ts` is 535 lines — above the 500 review
                threshold, below the 600 hard cap. It is one harness for one
                suite and splitting it now would scatter seven cases' setup
                across two files. Revisit if APP9-B05 extends it for dispatch.

FU-APP9-B04-02  `APP9_PHASE_ENTRY_AUDIT.md` line 530 routes obligation
                recalculation to `createForOrder` + `cancel`. `cancel` produces
                CANCELLED and never writes `superseded_by_obligation_id`, so the
                prescription cannot produce the SUPERSEDED chain TR-LC15-04
                requires. B04 delivered `recalculate` instead. The audit row is
                documentation-only and no code depends on it; correcting the
                wording is a docs task, not a behaviour change.

FU-APP9-B04-03  `SecureAccessGrantRepository.listActiveForRequest` filters
                `status = 'ACTIVE'` with no expiry predicate, so an unswept
                lapsed grant still reads as active. B04 checks `expiresAt`
                explicitly at its own call site. Every other consumer of this
                method should be audited for the same gap; none is in B04's
                scope. Not a defect in B04.

FU-APP9-B04-04  `fulfillment_note` (TBL-047) has no writer anywhere and is not
                copied into `shipping_snapshots`. B04 deliberately does not
                publish it. Either give it a writer or record it as intentionally
                dormant.
```

No existing follow-up was fixed here: `FU-APP9-G01-01`, `FU-APP9-B01-01`,
`FU-APP9-B01-02`, `FU-APP9-B02-01`, `FU-APP9-B03-01`, `FU-APP9-B03-02`,
`FU-APP9-W01-01`, `IMP-O008` and `FU-APP8-B04-02` all stand untouched.
`FU-APP8-W01-01` remains CLOSED.

## 26. Roadmap

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   COMPLETE
B04   COMPLETE
B05   NEXT
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one NEXT. B05 has not been started.

## 27. Close

```text
APP9-B04 = COMPLETE
NEXT_CHECKPOINT = APP9-B05
NOT_PUSHED = true
```
