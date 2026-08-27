# APP9-B04-C1 — Completion Report

## 1. Verdict

```text
APP9-B04 = COMPLETE
APP9-B04-C1 = PASS
APP9_B04_HTTP_OPERATIONS = 3
CUSTOMER_FEE_ACKNOWLEDGEMENT = EXPLICIT
ADMIN_AUTO_ACKNOWLEDGEMENT = FORBIDDEN
FEE_INCREASE_REQUIRES_MATCHING_ACK = true
MIGRATIONS_ADDED = 0
NEXT_CHECKPOINT = APP9-B05
NOT_PUSHED = true
```

## 2. Correction reason

The first `APP9-B04` attempt let the **Admin** `PUT` mint the customer's
acknowledgement. `ShippingFeeAcknowledgementResolver` looked for any live
`REQUEST_ACCESS` grant on the order's request and any recent `VERIFIED` `STEP_UP`
challenge for that customer, and — finding both — appended the
`shipping_fee_acknowledgements` row itself before applying the higher fee.

Those two facts prove the customer is reachable and was recently re-verified for
*something*. They do not prove the customer decided anything about this fee. A
row asserting that a customer accepted a higher price when nobody asked them is
worse evidence than no row: it is a durable, immutable record of a consent that
never happened, and the operator who benefits from the increase is the one who
wrote it.

`shipping_fee_acknowledgements` is customer evidence (DEV-DB6-014,
`DB3_SHIPPING_FEE_AND_FREEZE_SPEC.md` §1.2 — *"customer acknowledgement qua
secure flow"*). C1 makes the customer the writer.

## 3. Branch, entry HEAD, push state

```text
branch      production
entry HEAD  5e84c77  feat(app9): make REMAINING payment.verified a safe no-op (APP9-W01)
pushed      no — nothing was pushed at any point
committed   no — the corrected B04 tree is left uncommitted for review (38 paths)
```

## 4. First attempt corrected in place

Yes. The first B04 working tree was never committed and was **not** discarded.
Every accepted file was kept and edited; one file was deleted
(`application/admin/shipping-fee-acknowledgement.resolver.ts`, the minting
resolver) because §11 requires the auto-acknowledgement behaviour to be removed
rather than renamed. No `git reset`, no `git checkout --`, no re-implementation
from scratch.

## 5. The final three operations

| # | Method | Path | Operation id | Actor |
|---|---|---|---|---|
| 1 | `GET` | `/api/admin/orders/{orderId}/shipping-detail` | `adminOrderShipping_read` | Admin (APP1 guards) |
| 2 | `PUT` | `/api/admin/orders/{orderId}/shipping-detail` | `adminOrderShipping_save` | Admin (APP1 guards) |
| 3 | `POST` | `/api/public/orders/shipping-fee-acknowledgements` | `publicOrderShippingFee_acknowledge` | Customer (secure-link grant) |

Operations 1 and 2 are unchanged in route, id, tag and response set. No accepted
identifier was reissued.

## 6. Customer acknowledgement route and operation id

```text
POST /api/public/orders/shipping-fee-acknowledgements
  -> publicOrderShippingFee_acknowledge
  tag: publicOrderShippingFee
  201 · 400 · 403 · 404 · 409 · 429 · 500 · 503
```

`PublicOrderShippingFeeController` derives its domain key from the class name, so
**no `CONTROLLER_DOMAIN_KEYS` entry is owed**. `POST` on a collection path with
no identifier: the credential is a bearer token, `ADR-APP4-001` §11 forbids a
query or path carrier, and an identified public order path would be an
enumeration oracle.

## 7. Request schema

`AcknowledgeShippingFeeBody`, `.strict()`, exactly two fields:

```text
token          string, /^[A-Za-z0-9_-]{43}$/   the secure link, from the URL fragment
newFeeAmount   string, /^\d{1,12}(?:\.\d{1,2})?$/   the fee being accepted
```

Refused (asserted in the contract spec): `orderId`, `orderCode`, `customerId`,
`grantId`, `challengeId`, `stepUpChallengeId`, **`previousFeeAmount`**,
`currencyCode`, `shippingDetailId`, and every shipping field
(`recipientName`, `recipientPhone`, `addressLine`, `province`, `carrierName`,
`trackingCode`, `status`). An unknown field is a 400, never ignored.

`previousFeeAmount` is the one that matters: the Admin write matches on it, so a
caller-supplied old fee would let a stale screen — or a crafted request — bind
evidence to a baseline that is not the order's.

## 8. Secure grant chain

The delivered chain, through the delivered production services. No new grant
scope, no customer session, nothing minted.

```text
secure-link token
  -> AuthorizeSecureLink.authorize        (before the transaction: fail-closed
                                            policy read, abuse budget, digest)
  -> ReauthorizeSecureGrant.reauthorize   (inside the transaction:
                                            digestSecret(pepper, token),
                                            lockActiveByTokenDigest(hash,
                                            REQUEST_ACCESS, now) — FOR UPDATE)
  -> grant.customRequestId
  -> orders (uq_orders__request)
  -> shipping_details FOR UPDATE + the ACCEPTED quotation fee
```

`lockActiveByTokenDigest` is the single validator for scope, `ACTIVE`, expiry,
revocation and supersession; every failing reason leaves as one
`404 / SECURE_LINK_UNAVAILABLE`. The order is never named by the caller, so one
customer's link can reach only that customer's own order — cross-order
acknowledgement is impossible by construction, not by a check.

The first attempt's `listActiveForRequest` + explicit `expiresAt` filter is
**gone**; that hand-rolled chain no longer exists anywhere in B04.

## 9. STEP_UP validation

`StepUpEvidenceResolver.resolve(grant.customerId, now)` — the exported `APP6-B05`
capability, unchanged and unmocked. It reads the published `secure_grant` policy
fail-closed, lists the customer's contact points, keeps only those **verified and
not deactivated**, and takes the freshest `VERIFIED` `STEP_UP` challenge on one of
them inside `stepUpWindowSeconds`. The customer comes from the grant, the
contacts from the customer, the challenge from the contacts — so the evidence is
bound to this order's customer by construction. No challenge id is accepted from
the body. `undefined` → `403 / REVERIFICATION_REQUIRED`.

An unusable or unpublished policy surfaces as `SecureGrantError` →
`503 / ACKNOWLEDGEMENT_POLICY_UNAVAILABLE`, never as a refusal of the decision.

## 10. Exact customer-decision binding

The acknowledgement is for one tuple, and the server owns three of its four
members:

```text
order         from the grant                 (never from the caller)
previousFee   baselineFeeOf(locked detail, ACCEPTED quotation fee)
newFee        from the caller — this is the decision
currency      VND (CHECK-pinned on the row)
```

The rule enforced is `newFee > previousFee`, in exact `bigint` hundredths. Not
greater → `409 / SHIPPING_FEE_NOT_INCREASED`, which is also the answer when the
baseline has moved since the screen was rendered. A decrease needs no
acknowledgement (DB3 §1.2), so none is fabricated for symmetry. A `FROZEN`
detail → `409 / SHIPPING_FEE_NOT_ADJUSTABLE`.

`baselineFeeOf` is a single shared function
(`domain/shipping/shipping-fee-baseline.ts`), used by **both** the customer
command and the Admin write. Two implementations that drifted by a formatting
rule would make a valid decision silently fail to match the increase it was made
for; one function makes that impossible rather than merely unlikely.

## 11. Acknowledgement row fields actually written

`shipping_fee_acknowledgements` (TBL-049), via the delivered
`OrderRepository.acknowledgeShippingFee`:

```text
order_id                the order resolved from the grant
previous_fee_amount     server-derived baseline, numeric(14,2)
new_fee_amount          the accepted fee, numeric(14,2)
currency_code           'VND' (repository constant, CHECK-enforced)
grant_id                the grant this transaction locked
step_up_challenge_id    the challenge StepUpEvidenceResolver returned
acknowledged_at         the AuditClock instant of the decision
created_at             (column default)
```

Never written and never held: raw secure-link token, OTP, verification code,
code hash or digest copy, pepper, any customer secret. No JSON payload column, no
new column, no new table, **no migration**. The two evidence ids are plain
references, exactly as `quotation_acceptances.grant_id` is.

The published response drops both evidence ids: they are server audit content,
and a field a response never carries is one nothing downstream can log.

## 12. Customer acknowledgement replay / idempotency

`DB3_IDEMPOTENCY_SPECIFICATION.md` names **no** shipping-acknowledgement
namespace, so none was invented and no second idempotency subsystem was added
(§16). The append-only table is its own replay authority:

```text
findAcknowledgement(orderId, previousFee, newFee)  -- all three, plus VND
  found     -> return it, replayed = true, write nothing
  not found -> validate step-up, append exactly one row
```

The lookup runs **before** GRD-003, on the delivered precedent of
`AcceptQuotationUseCase` and `InitiateFinalPaymentAttemptUseCase` and for their
stated reason: a replay performs no write, and gating it on a still-open step-up
window would tell a customer retrying after a dropped response to re-verify in
order to be shown a decision they already made.

Concurrency: two identical calls carry the same token by construction, and
`ReauthorizeSecureGrant` holds that grant row `FOR UPDATE` for the life of the
transaction. The loser blocks, then re-reads the committed row and replays it. A
genuinely different fee tuple is a different decision and correctly creates its
own row — asserted in `C1-7`.

## 13. Admin PUT behaviour, before vs after C1

| | First B04 attempt | After C1 |
|---|---|---|
| Fee increase authority | resolved a live grant + any recent step-up | reads a **pre-existing** matching acknowledgement |
| Writes `shipping_fee_acknowledgements` | **yes** — appended it itself | **no** — never, on any path |
| Collaborator | `ShippingFeeAcknowledgementResolver` (created evidence) | `OrderRepository.findShippingFeeAcknowledgement` (a read) |
| `CustomerModule` in the Admin module | imported | **removed** |
| Grant / step-up reachable from the Admin write | yes | no — neither is in that injector |
| Refusal when the customer has not decided | `SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED` | `SHIPPING_FEE_ACKNOWLEDGEMENT_REQUIRED` (unchanged code) |

The published error code and status are deliberately unchanged: the operator's
remedy was already "the customer must go through the secure flow", and now that
is literally true.

## 14. Exact matching and stale-evidence rules

An increase is authorised only by a row where **all** of these hold:

```text
ack.order_id            == the order being edited
ack.previous_fee_amount == the baseline locked in this transaction
ack.new_fee_amount      == the fee being saved
ack.currency_code       == 'VND'
```

The three §17 cases fail on that tuple, with no mutable "consumed" flag the
schema does not have:

- `ack 100k -> 120k`, Admin asks `100k -> 130k` — `new_fee_amount` differs;
- `ack 100k -> 120k`, the fee has since become `110k` — `previous_fee_amount`
  differs;
- an acknowledgement belonging to order A cannot be found for order B, because
  the lookup is scoped by `order_id` and the row's FK is to its own order.

After a successful application the baseline **is** the new fee, so the
acknowledgement just used no longer names the current baseline and can never
authorise a second change. That is why no consumption marker is needed.

## 15. Proof the Admin write no longer mints acknowledgement

Four independent proofs, in order of strength:

1. **Structural.** `AdminOrderShippingModule` no longer imports `CustomerModule`,
   so `SECURE_ACCESS_GRANT_REPOSITORY` and `StepUpEvidenceResolver` are not in
   its injector. No grant and no step-up can be resolved there at all, so the
   two `NOT NULL` evidence ids TBL-049 requires cannot be produced.
2. **Deleted.** `application/admin/shipping-fee-acknowledgement.resolver.ts` no
   longer exists. Nothing was renamed into a misleading collaborator.
3. **Source.** `grep -rn "acknowledgeShippingFee" apps/api/src` returns no call
   site outside the customer adapter; the Admin use case calls
   `findShippingFeeAcknowledgement` only.
4. **Executable.** Integration case 4 drives a fee increase on an order whose
   grant is live and whose step-up is fresh — precisely the state the first
   attempt treated as consent — and asserts
   `countRows('shipping_fee_acknowledgements') === 0` after the refusal. Case 5
   drives the customer command first and asserts exactly **one** acknowledgement
   after the Admin write.

## 16. Unchanged and decrease behaviour preserved

Unchanged fee: the shipping detail is created or updated, no acknowledgement is
read or written, `REMAINING` is not superseded, no reconciliation, no attempt, no
LC-14 move. Integration case 2, untouched by C1 and green.

Decrease: no customer acknowledgement required or created; predecessor
`SUPERSEDED` with its amount unedited, one successor `PENDING`,
`superseded_by_obligation_id` set, one `OBLIGATION_RECALC`. Integration case 3,
untouched by C1 and green.

## 17. REMAINING recalculation preserved

`PaymentRecalculationRepository.recalculate` is unchanged:

```text
predecessor FOR UPDATE, must be PENDING (TR-LC15-04)
  -> UPDATE status = 'SUPERSEDED'          (before the INSERT — the live index
                                             is partial over PENDING *and*
                                             SATISFIED)
  -> INSERT one successor PENDING, same order/kind/currency/source version
  -> UPDATE superseded_by_obligation_id    (last: restrict FK)
  -> appendReconciliation(OBLIGATION_RECALC)
```

No return to `cancel()`. The predecessor amount is never edited in place. The
delta formula is unchanged: `successor = live REMAINING + (new fee − old fee)`,
exact `bigint` hundredths, never `total − deposit`. `DEPOSIT` is not read and not
touched.

The first attempt's finding that `createForOrder + cancel` cannot implement
TR-LC15-04 stands (`FU-APP9-B04-02`).

## 18. SATISFIED rule preserved

A fee-changing write against a `SATISFIED` live `REMAINING` is refused with
`409 / SHIPPING_FEE_CHANGE_NOT_AVAILABLE` and **zero writes**. No backward LC-14
transition is invented. Non-fee edits on the same order still succeed while
shipping is `EDITABLE`. Integration case 8, untouched by C1 and green.

## 19. Transaction boundaries

**Customer acknowledgement** — one `runInTransaction`:

```text
1. secure_access_grants          FOR UPDATE   ReauthorizeSecureGrant
2. orders                        read         findByRequest (uq_orders__request)
3. shipping_details              FOR UPDATE   lockShippingFeeBaseline + quoted fee
4. (assert EDITABLE; derive previousFee; assert newFee > previousFee)
5. shipping_fee_acknowledgements read         exact-tuple replay lookup
6. contact_verification_challenges read       StepUpEvidenceResolver (GRD-003)
7. shipping_fee_acknowledgements append       exactly one row
commit
```

It mutates nothing else, and cannot: the use case holds
`SHIPPING_FEE_ACKNOWLEDGEMENT_PORT` (two reads and one append) and its module
imports neither `ORDER_REPOSITORY` nor any payment contract.

**Admin fee increase** — one `runInTransaction`:

```text
1. orders                          findById
2. shipping_details    FOR UPDATE  lockShippingFeeBaseline (+ quoted fee)
3. (assert EDITABLE)
4. payment_obligations             findLiveForOrder('REMAINING')
5. shipping_fee_acknowledgements   read — the matching decision must exist
6. payment_obligations FOR UPDATE  supersede predecessor + create successor
7. payment_reconciliations         append OBLIGATION_RECALC
8. shipping_details                saveShippingDetails
commit
```

A failure at any step rolls back all of it. **No Admin-created acknowledgement
row**, on any path. No new lock infrastructure, no SERIALIZABLE isolation, no
advisory lock. Lock ordering is acyclic across the two flows: the Admin write
never takes a grant lock, and the customer command never takes an obligation
lock.

## 20. OpenAPI before / after

```text
APP9 phase entry (before B04)      96 paths · 103 operations · 214 schemas
after the first B04 attempt        97 paths · 105 operations · 218 schemas
after APP9-B04-C1                  98 paths · 106 operations · 220 schemas
```

```text
C1 delta                           +1 path · +1 operation · +2 schemas
B04 total ownership                +2 paths · +3 operations · +6 schemas
```

The `+1 operation` is exactly what §18 predicted. Schema delta was measured, not
predicted: `AcknowledgeShippingFeeBody` and `ShippingFeeAcknowledgedResponse`.
No file was hand-edited; `openapi:generate` then `openapi:check` both clean.

## 21. Generated client disposition

Regenerated by the normal Orval path and verified:

```text
pnpm --filter @embroidery/api-client run generate         2 files, 8166 lines
pnpm --filter @embroidery/api-client run check:generated  up to date
tree hash  fa8f8be998fc3b1e74dff2ed5e061fb42d982380a9f7e37afdab78e13558ecd9
```

No manual edit. No handwritten hook was added — no frontend consumes this yet
(`APP9-S01`/`A01` are later checkpoints).

## 22. Focused tests and counts

| Command | Scope | Result |
|---|---|---|
| `CMD-TEST-APP9-B04-CONTRACT` | `admin-order-shipping.contract.spec` | **10 / 10 pass** |
| `CMD-TEST-APP9-B04-INTEGRATION` | `admin-shipping-detail.integration` | **8 / 8 pass** |
| `CMD-TEST-APP9-B04-C1-INTEGRATION` | `customer-shipping-fee-acknowledgement.integration` | **3 / 3 pass** |

Required C1 proofs, and where each lives:

| Proof | Case |
|---|---|
| `C1-1` customer acknowledgement success, nothing else moved | customer spec, case 1 |
| `C1-2` no customer decision → no fee increase, no auto-ack | admin spec, case 4 |
| `C1-3` matching acknowledgement authorises the increase | admin spec, case 5 |
| `C1-4` mismatched new fee refused, zero Admin writes | admin spec, case 6 |
| `C1-5` stale previous fee cannot authorise | admin spec, case 6 |
| `C1-6` invalid customer eligibility writes no acknowledgement | customer spec, case 2 |
| `C1-7` replay appends no duplicate evidence | customer spec, case 3 |

`C1-4` and `C1-5` share one case because they share a setup and each is a single
request; the count was not inflated. No secure-link token, OTP, digest, pepper or
challenge secret is asserted on or printed anywhere in either suite (§20). The
token used is synthetic, minted per test, and stored only as
`digestSecret(pepper, token)` — so a passing test proves the production peppered
lookup rather than a bypass.

## 23. Reruns and their exact intervening changes

One scope was rerun. Both integration commands ran once each, and passed once.

| Scope | Prior pass | Rerun justified by |
|---|---|---|
| `CMD-TEST-APP9-B04-CONTRACT` | 7/7 in the first B04 attempt | The spec file itself was edited (its "no public shipping path" assertions are now false and were replaced by three new assertions on the customer operation), and the new controller, request/response schemas and `CustomerShippingFeeModule` changed the document it builds. |

`CMD-TEST-APP9-B04-INTEGRATION` also had a prior 7/7 pass, but its file was
edited (cases 4 and 5 rewritten, case 6 added, the shared context extended), so
its single run here is a run of changed code, not a rerun of unchanged code.

No final-confidence rerun. No rerun after any Markdown-only edit.

## 24. Validations deliberately not run

- Full `pnpm test`, full Jest, all API integration tests, all order or payment
  tests — §21 forbids them and C1 changed none of that code.
- `APP9-B01` / `B02` / `B03` suites — untouched by C1.
- `APP9-W01` worker suites, worker acceptance, `APP7`/`APP8` E01 — untouched.
- DB8 race / concurrency suites — C1 introduced no new arbiter. The customer
  command reuses the delivered grant row lock and the delivered shipping-detail
  lock; the Admin write's arbiter is unchanged (§13).
- Playwright, Docker, full builds, Admin/Storefront tests, Figma gates, manual
  QR scan — no frontend, design or infrastructure change.

**One finding worth the Product Owner's attention.** The repository-wide
`apps/api` ESLint run is **already red at HEAD**, independently of this
checkpoint:

```text
src/modules/design/application/deciding/approve-design-version.use-case.ts
  194:11  @typescript-eslint/no-unnecessary-type-assertion
  241:7   @typescript-eslint/no-unnecessary-type-assertion
  285:11  @typescript-eslint/no-unnecessary-type-assertion
```

Verified by stashing every change in this tree, rebuilding
`@embroidery/persistence`, and running ESLint on that file at `5e84c77` — the
three errors reproduce with nothing of B04 present. They are an APP6 file and
`§23` forbids fixing unrelated follow-ups, so they were left alone and are
recorded as **`FU-APP9-B04-C1-01`** (nonblocking). The first B04 attempt reported
a clean `apps/api` ESLint run; that run was against a **stale**
`packages/persistence/dist`, and rebuilding it is what made the three assertions
visibly redundant. ESLint was therefore run scoped to every path C1 touches, and
is clean:

```text
pnpm --filter @embroidery/api exec eslint \
  src/modules/order/application/customer src/modules/order/application/admin \
  src/modules/order/domain/shipping \
  src/modules/order/domain/repositories/shipping-fee-acknowledgement.port.ts \
  src/modules/order/infrastructure/persistence/order-shipping-fee-acknowledgement.adapter.ts \
  src/modules/order/presentation src/modules/order/tests/integration \
  src/modules/order/*.module.ts src/bootstrap/app.module.ts --max-warnings=0
pnpm --filter @embroidery/persistence exec eslint src --max-warnings=0
```

## 25. Changed files

**Deleted (1)**

```text
apps/api/src/modules/order/application/admin/shipping-fee-acknowledgement.resolver.ts
```

**New in C1 (11)**

```text
apps/api/src/modules/order/domain/repositories/shipping-fee-acknowledgement.port.ts
apps/api/src/modules/order/domain/shipping/shipping-fee-acknowledgement.errors.ts
apps/api/src/modules/order/domain/shipping/shipping-fee-baseline.ts
apps/api/src/modules/order/infrastructure/persistence/order-shipping-fee-acknowledgement.adapter.ts
apps/api/src/modules/order/application/customer/acknowledge-shipping-fee.use-case.ts
apps/api/src/modules/order/presentation/public-order-shipping-fee.controller.ts
apps/api/src/modules/order/presentation/schemas/public-order-shipping-fee.request.ts
apps/api/src/modules/order/presentation/schemas/public-order-shipping-fee.response.ts
apps/api/src/modules/order/customer-shipping-fee.module.ts
apps/api/src/modules/order/shipping-fee-acknowledgement.module.ts
apps/api/src/modules/order/tests/integration/customer-shipping-fee-acknowledgement.integration.spec.ts
```

**Modified in C1 (11)**

```text
packages/persistence/src/order/order.repository.ts
packages/persistence/src/order/order-row.mapper.ts
packages/persistence/src/order/drizzle-order-shipping.repository.ts
packages/persistence/src/order/drizzle-order.repository.ts
packages/persistence/src/index.ts
apps/api/src/bootstrap/app.module.ts
apps/api/src/modules/order/admin-order-shipping.module.ts
apps/api/src/modules/order/application/admin/save-shipping-detail.use-case.ts
apps/api/src/modules/order/presentation/admin-order-shipping.contract.spec.ts
apps/api/src/modules/order/tests/integration/admin-shipping-detail.integration.spec.ts
apps/api/src/modules/order/tests/integration/shipping-detail-context.ts
```

**Generated / documentation**

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/reports/APP9-B04-C1-COMPLETION-REPORT.md
```

Files from the first B04 attempt left untouched by C1: the Admin controller, the
Admin request/response schemas, `admin-shipping.errors.ts`,
`shipping-fee-amount.ts`, `read-shipping-detail.query.ts`,
`payment-recalculation.repository.ts` and the payment obligation contract.

## 26. File sizes

Every runtime/application source file ≤ 400 lines; every test file ≤ 600.

```text
599  tests/integration/shipping-detail-context.ts                       (test, cap 600)
457  tests/integration/admin-shipping-detail.integration.spec.ts        (test)
357  presentation/admin-order-shipping.contract.spec.ts                 (test)
341  application/admin/save-shipping-detail.use-case.ts
356  packages/persistence/src/order/drizzle-order-shipping.repository.ts
293  packages/persistence/src/order/order.repository.ts
264  presentation/admin-order-shipping.controller.ts
234  presentation/public-order-shipping-fee.controller.ts
220  application/customer/acknowledge-shipping-fee.use-case.ts
194  tests/integration/customer-shipping-fee-acknowledgement.integration.spec.ts (test)
122  domain/shipping/shipping-fee-acknowledgement.errors.ts
101  infrastructure/persistence/order-shipping-fee-acknowledgement.adapter.ts
 86  domain/repositories/shipping-fee-acknowledgement.port.ts
 77  presentation/schemas/public-order-shipping-fee.request.ts
 59  presentation/schemas/public-order-shipping-fee.response.ts
 47  customer-shipping-fee.module.ts
 45  domain/shipping/shipping-fee-baseline.ts
 38  shipping-fee-acknowledgement.module.ts
```

`shipping-detail-context.ts` at 599 is one line under the hard cap. It is a
shared harness for two suites; if it grows again it must be split, not trimmed.

## 27. Remaining nonblocking follow-ups

Carried forward untouched:

```text
FU-APP9-G01-01   FU-APP9-B01-01   FU-APP9-B01-02   FU-APP9-B02-01
FU-APP9-B03-01   FU-APP9-B03-02   FU-APP9-W01-01
FU-APP9-B04-01   FU-APP9-B04-02   FU-APP9-B04-03   FU-APP9-B04-04
IMP-O008         FU-APP8-B04-02
FU-APP8-W01-01 = CLOSED
```

New, nonblocking:

- **`FU-APP9-B04-C1-01`** — `apps/api` ESLint is red at HEAD on three
  pre-existing `no-unnecessary-type-assertion` errors in
  `approve-design-version.use-case.ts` (APP6). Reproduced with this tree stashed;
  not caused by, and not fixable within, B04. §24 has the evidence.

`FU-APP9-B04-03` (that `listActiveForRequest` applies no expiry predicate) is
worth re-reading in light of C1: B04 no longer uses that method at all, so the
finding now applies only to its other, unaudited consumers.

The customer-decision defect itself was **not** filed as a follow-up. It was the
reason for C1 and is fixed.

## 28. Roadmap

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

Exactly one `NEXT`. `APP9-B05` was not begun: no dispatch, no freeze, no
`shipping_snapshots` write, no `TR-LC14-07`, no `TR-LC14-08`, no order
completion.

## 29 – 30. Stop state

```text
NEXT_CHECKPOINT = APP9-B05
NOT_PUSHED = true
```
