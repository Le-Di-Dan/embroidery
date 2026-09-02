# APP12-B04 — ORDER_ACCESS and Ready-Made FULL Payment Composition

```text
CHECKPOINT   = APP12-B04
PHASE        = APP12 — Hardening, UAT and Production Readiness
TYPE         = BACKEND / PUBLIC SECURE ACCESS / FULL PAYMENT COMPOSITION
STATUS       = COMPLETE_AFTER_C1
CORRECTION   = APP12-B04-C1 (1 / 1 — no C2)
DATE         = 2026-09-02
ROADMAP      = LOCKED at 38 checkpoints
NEXT         = APP12-B05
PUSHED       = false
```

---

---

## Correction notice — `APP12-B04-C1`

```text
APP12-B04 = COMPLETE_AFTER_C1
CORRECTION_USED = 1 / 1 — no C2
```

**`FU-APP12-B04-01`'s routing to `APP12-S03` / `APP12-B05` was rejected by the
Product Owner.**

`APP12-B04` owns the secure customer order projection. `APP12-D01` requires the
`EXPIRED` and `CANCELLED` presentation states to be distinguishable without
frontend heuristics, and `APP12-S03` is a Storefront checkpoint: it must consume
a complete backend contract, not parse free-text cancellation prose, infer from
a missing field, or implement domain logic of its own.

`APP12-B04-C1` closes the gap here, with a machine-readable reservation-expiry
distinction derived from the **official reservation state** — no DB migration,
no new operation, no second order lifecycle and no free-text parsing.

The reasoning this report gave for deferring — "`orders.cancelled_reason` is
free text, so the existing cancellation reason authority does not provide it" —
was true of the reason *column* and wrong about the *domain*. The authority was
never the prose: `ExpireReadyMadeReservationsUseCase` writes
`reservation RESERVED -> EXPIRED` and `order -> CANCELLED` in one transaction, so
the discriminator was already committed and only needed reading.

Nothing below is retracted. Every baseline, count and piece of evidence in this
report stands, and `APP12-B04-C1` changed none of them:

```text
OpenAPI            125 / 138 / 277   unchanged
public operations  49                unchanged
release matrix     28 / 18 / 3       unchanged
migrations         38                unchanged
```

The one contract delta is additive: an optional `terminationReason` on
`ReadyMadeOrderAccessResponse`. See
[`APP12-B04-C1-COMPLETION-REPORT.md`](./APP12-B04-C1-COMPLETION-REPORT.md).

---

## A. Verdict

`APP12-B04` is **COMPLETE**.

A Ready-Made order now becomes reachable and payable by the customer who placed
it, with no operator step and no new secure-access architecture. Four public
operations were added, one standing release-gate obligation was discharged, and
the transfer-evidence lane was reused rather than duplicated.

```text
NEW_HTTP_OPERATIONS      = 4       (budget 4, hard max 5)
NEW_EVIDENCE_OPERATION   = 0
MIGRATIONS               = 38      (unchanged; DB schema delta 0)
OPENAPI                  = 125 paths / 138 operations / 277 schemas
PUBLIC_OPERATIONS        = 49      (45 -> 49)
RELEASE_MATRIX           = 28 DENY / 18 ALLOW / 3 SCOPE_GATED
FIGMA                    = unchanged
STOREFRONT / ADMIN UI    = unchanged (0 routes)
```

The single most consequential decision is recorded in §C: **the raw
`ORDER_ACCESS` token is not in the create response.** Everything else about the
access bootstrap follows from it.

---

## B. Preflight

Read before any edit, per §5:

| Area | What was established |
|---|---|
| `secure_access_grants` | `APP12-DB01` added `ORDER_ACCESS`, `order_id`, the subject XOR CHECK and `uq_secure_access_grants__customer_order__active`. Nothing had ever issued one. |
| Token issuance | `SecureLinkTokenMinter` mints 32 CSPRNG bytes; `digestSecret` stores a **peppered HMAC**; no operation anywhere inverts one. |
| Grant delivery | `SecureGrantNotifier` resolves the customer's **primary verified** contact itself and has no destination parameter. The token is sealed into an outbox envelope. |
| Idempotency | `publicReadyMadeOrder_create` stores its result in `idempotency_records.result` (`jsonb`) and replays it verbatim. |
| Evidence lane | `payment_transfer_evidence` is **attempt-scoped** (`IMP-D055`). `APP9-B02` had already widened the kind assertion from one literal to a closed set. The lane was already kind-agnostic below its first hop. |
| QR / reference | `buildBankTransferQrPayload` and `BankTransferQrEncoder` take a bank, an account, an amount and a reference — **no obligation kind**. `APP7-G01` §4 froze `ORD` + code body + a two-character kind code, with `DC` and `RM` used. |
| Payment target | `PaymentTargetResolver` walks grant → request → order → live obligation, with the kind a caller-stated parameter since `APP9-B02`. `OrderDepositContextPort.findOrderById` already existed. |
| Release gate | `CustomCapabilityReleaseGuard` runs **before the pipes**, so it never sees a request body. `SECURE_LINK_REOPEN_OBLIGATION` named B04 as the owner of the scope conversion. |

Four conclusions decided the design:

1. **A raw token cannot be replayed.** Only a digest is stored, so the create
   response must publish a fact, not a credential (§C).
2. **A guard cannot decide the wave.** The wave is a property of the grant row,
   which does not exist until the token has been digested (§E, §F).
3. **The evidence lane needed no new operation**, only a scope-aware first hop
   (§L).
4. **The QR and reference machinery is kind-agnostic**, so `FULL` needed one new
   kind code and nothing else (§J).

---

## C. ORDER_ACCESS issuance

`OrderAccessGrantIssuer` (`modules/customer/application/order-access-grant.issuer.ts`)
is a **sibling** of `SecureGrantIssuer`, not a scope parameter on it — the
`APP7-G01` §4 trade, applied to grants: the cost is one orchestration method,
and the benefit is that the custom submission path structurally cannot mint an
order grant and this path cannot mint a request grant.

Nothing that decides security is duplicated. The minter, the peppered digest,
the expiry policy, the repository, the audit recorder and the notifier are the
delivered APP4 collaborators, injected.

```text
ensure(customerId, orderId, notify)
  -> require the published `secure_grant` policy        (fail closed)
  -> assert the customer is not merged or anonymized
  -> pre-read listActiveForOrder                        (friendly refusal)
  -> mint | digest | insert (ORDER_ACCESS + order_id)
  -> audit secure_grant.issued
  -> notify: seal the token into the delivery envelope
```

- **No HTTP endpoint**, per §6. A `POST /orders/{id}/access` would be an
  unauthenticated way to mint someone else's only credential.
- **Exactly one current grant.** The pre-read is friendly;
  `uq_secure_access_grants__customer_order__active` — the `ORDER_ACCESS` half of
  CST-009 — is the arbiter that cannot be raced.
- **No rotation.** `ensure` returns a standing grant unchanged rather than
  reissuing: a retry must not invalidate a link the customer is holding.
- **No transaction of its own.** It joins the creation transaction, so an order
  and its grant commit together or not at all.

---

## D. Create-command / idempotency integration

`CreateReadyMadeOrderUseCase` gained one step, between the reservation and the
idempotency completion, inside the same transaction.

### The raw token is deliberately absent from the result (§7, §32)

A replay runs **none** of step 8, so it has no plaintext to reproduce. The two
ways to make a replay byte-identical were both rejected:

- storing the plaintext in `idempotency_records.result` would put a live bearer
  credential in `jsonb`, which is exactly what the digest exists to prevent;
- weakening the hashing to make the token recoverable is forbidden by §8.

So the response publishes the **fact and the deadline** of access:

```json
"access": { "scopeKind": "ORDER_ACCESS", "delivered": true, "expiresAt": "…" }
```

This is the delivered bootstrap pattern, not an invention: `APP5-B01`'s
submission response records the same rule for its own grant — *"no raw
`REQUEST_ACCESS` grant token, no secure link … the customer's link arrives
through the APP4 notification path, never in this body."* Recovery is APP4's own
reissue, as `ADR-DB3-004` r6 already provides.

Every published field is a fact of the grant rather than a secret, so a first
creation and an idempotent replay are still indistinguishable — which is what
made `BR-023`'s retry safe in the first place.

`decodeReadyMadeOrderResult` was tightened to require the bootstrap: a record
written before B04 replays as a **fault** rather than as a `201` that tells the
customer nothing about how to reach their order.

---

## E. Secure-link scope-aware resolution

`SecureAccessGrant` now carries the typed XOR the schema stores:
`customRequestId` and `orderId` are each `string | undefined`, exactly one
non-null per row.

Widening them made the compiler ask every delivered consumer what it wanted to
do about the other scope. The single answer is
`domain/grant/grant-subject.ts` — `requestSubjectOf` / `orderSubjectOf` — which
returns the subject **and** refuses the wrong scope with the delivered
`SECURE_LINK_UNAVAILABLE`. The narrowing and the guard are one expression, so
there is no way to obtain the id without having passed the check.

`ResolveSecureLink` now resolves over `schema.GRANT_SCOPE_KINDS` in **one** `IN`
predicate. Two scope-pinned queries were the obvious alternative and would have
reintroduced the oracle: a request taking two round trips and one taking one are
distinguishable by timing even when their bodies are identical.

`ReauthorizeSecureGrant` gained two named methods rather than a scope argument:

| Method | Scope | Caller |
|---|---|---|
| `reauthorize` | `REQUEST_ACCESS` | APP6/APP7/APP9 writes — **unchanged** |
| `reauthorizeOrderAccess` | `ORDER_ACCESS` | `FULL` initiate |
| `reauthorizeForEvidence` | both | the attempt-scoped evidence lane only |

The third exists because §22 requires the evidence reuse; its isolation does not
rest on the scope in any case — `EvidenceAttemptAuthorizer` proves the named
attempt's obligation hangs off *this grant's* order.

---

## F. Release-gate accounting

`GrantScopeReleaseGate` decides whether a resolved scope is released, applied
**inside** `ResolveSecureLink` and `ReauthorizeSecureGrant` — after the digest,
before the success audit row.

```text
CUSTOM_EMBROIDERY_RELEASE_ENABLED = false
  ORDER_ACCESS    ALLOW      Ready-Made *is* Wave 1
  REQUEST_ACCESS  DENY       every custom customer surface stays withheld

CUSTOM_EMBROIDERY_RELEASE_ENABLED = true
  ORDER_ACCESS    ALLOW      Wave 1 does not close when Wave 2 opens
  REQUEST_ACCESS  ALLOW      the delivered behaviour, byte for byte
```

The refusal is `SECURE_LINK_UNAVAILABLE`, which is **stronger** than the guard's
generic 404: while Wave 2 is unreleased a valid custom link must not be
distinguishable from a fictional one.

### The arithmetic

```text
before B04    45 public   31 DENY   14 ALLOW    0 SCOPE_GATED
after  B04    49 public   28 DENY   18 ALLOW    3 SCOPE_GATED
```

- **+4 ALLOW** — the four new Ready-Made operations.
- **−3 DENY / +3 SCOPE_GATED** — `publicSecureLink_resolve` (§3.2) plus
  `publicOrderDepositEvidence_upload` and `_status` (§3.4).

`SCOPE_GATED` is **not** an exemption. Each of the three takes a secure-link
token and serves both waves through one operation; the guard admits them so the
grant can be resolved, and the scope gate then refuses the withheld wave one
layer in. With Wave 2 unreleased, every custom capability behind them is refused
exactly as before.

§10 predicted `30 DENY / 18 ALLOW / 1 SCOPE_GATED` on the assumption that only
the resolver would move. The measured truth is `28 / 18 / 3` because §22's
evidence reuse required the two evidence operations to admit an `ORDER_ACCESS`
caller in Wave 1 — they could not stay statically denied and be reused. §10
directs the use of measured truth where the count differs, and this is that
case.

---

## G. Secure Ready-Made order projection

```text
POST /api/public/ready-made-orders/current — publicReadyMadeOrder_current
```

`CONTROLLER_DOMAIN_KEYS` maps the new class onto `publicReadyMadeOrder`, so
`APP12-B02`'s accepted `_create` id does not move and the family reads
`_create`, `_current`.

**No locator.** The order is read from the grant row. There is no `{orderId}`
and no order code in the body — a code would be worse than a UUID, since it is
printed on the customer's own confirmation and is explicitly never an
authorization input (CST-026).

Published: order code, lifecycle state, currency, placement instant, the frozen
line (product name, variant, size, quantity, unit price, line total), the
merchandise subtotal, the delivery facts with the exact fee, the live `FULL`
summary (`status`, `payableTotal`, `payable`), the payment deadline, and the
link expiry.

Absent, and asserted absent: the order UUID, customer id, SKU id, stock id,
reservation id, obligation id, attempt id, grant id, audit ids, Admin notes,
reconciliation records, carrier, tracking code, fulfilment note, and the
cancellation reason (an operator-facing sentence).

`merchandiseSubtotal` is the line's own frozen total, **not**
`orders.total_amount` — that column holds the subtotal only until the first fee
and the payable total afterwards (`APP12-B03` §14), so reading it would relabel
the subtotal the moment an operator priced delivery. The projection performs no
arithmetic at all.

### One lifecycle, not two (§13, §27)

`status` is the order's own state, published verbatim, exactly as
`ReadyMadeOrderCreatedResponse` and the two custom payment projections publish
theirs. No parallel customer vocabulary is invented; `APP12-D01` §I already maps
these states to the eight page variants.

`isFullPaymentPayable` is **imported** from CTX-PAY rather than restated. A
second copy in Ordering would be a second definition of when money may be
collected.

---

## H. Before-fee behaviour

`AWAITING_SHIPPING_FEE` has **no** `FULL` obligation — `APP12-B03` creates it
*with* the fee — so:

```text
FULL obligation count      = 0
payment attempts           = 0
order read                 = 200, delivery.feeAmount absent, payment absent
FULL current / qr / initiate = 404 SECURE_LINK_UNAVAILABLE (one identical answer)
```

Nothing is defaulted. `BR-027` makes "not priced yet" and "free" different
answers, and makes the merchandise subtotal an amount nobody owes. No
provisional obligation is created to have something to refuse.

---

## I. FULL current

```text
POST /api/public/orders/full-payment — publicOrderFullPayment_current
```

The amount is `target.obligation.amount` — the live obligation's own frozen
figure, which `APP12-B03` composed once as `frozen subtotal + exact fee`.
Nothing adds a fee to a subtotal, subtracts a deposit, reads a quotation or
touches an order line on this path.

`findLiveForOrder` filters on the statuses
`uq_payment_obligations__order_kind__live` arbitrates, so a superseded
predecessor is invisible and a fee correction is followed **with no special
case**.

The read stays available after the window closes — a customer whose transfer an
Admin has verified is entitled to see that — and `payable` distinguishes the two.

---

## J. FULL QR

```text
POST /api/public/orders/full-payment/qr — publicOrderFullPayment_qr
```

The same EMVCo/NAPAS payload builder and the same encoder `APP7-B03` delivered,
untouched. `APP12-B04` introduces **no** second QR framework, **no** second
merchant configuration (§33) and **no** provider.

The reference is `ORD` + the ten-character code body + `FL`, the third code in
`APP7-G01` §4's frozen format. A sibling module, not a kind parameter — the
`deposit-reference.spec.ts` arity rule, now asserted for all three.

The memo names the **order**, not the obligation, so it survives a fee
correction: a transfer sent before the correction still reconciles.

Gated on payability, unlike the read: a QR is an instruction to send money, and
one served for a cancelled or already-verified order would invite a transfer
nobody owes. `no-store`, `nosniff`, `attachment` with a fixed filename naming no
order fact; generated in-process on every request and never stored, so a fee
correction is reflected in the next download with no cache to invalidate.

---

## K. FULL initiate

```text
POST /api/public/orders/full-payment/attempts — publicOrderFullPayment_initiate
```

The `APP7-B03` initiation, given a different obligation and a scope-pinned
grant. One transaction; the grant re-established under its row lock
(`ADR-DB3-004` r9, `ORDER_ACCESS` only); GRD-003 step-up; the delivered
`payment.initiate` idempotency namespace; `openAttempt` as the writer.

### STEP_UP decision (§24)

**Required, on the delivered payment rule — not imported from APP5.**

§24 forbids requiring a challenge merely because `REQUEST_ACCESS` did, and
directs this surface to the existing *payment* security rules. Those rules are
GRD-003, which both delivered payment initiations enforce. The `ORDER_ACCESS`
grant does not replace it: the grant proves possession of a link that may have
sat in an inbox for days, the step-up proves the person is here now. A leaked
order link therefore cannot open a payment attempt — proved by two suite cases
(no step-up, and a step-up outside the published window).

No `challengeId` is accepted from the body; the resolver derives it from the
grant's customer, and the recorded challenge is what the evidence lane
re-verifies later.

### Payable, then locked, then written

`isFullPaymentPayable` reads both states and refuses outside the window; then
`openAttempt` re-proves the obligation's half under its row lock and is the real
arbiter. Nothing about an earlier read, QR or payable answer is consulted.

---

## L. Evidence reuse

```text
NEW_EVIDENCE_OPERATION = 0
```

`publicOrderDepositEvidence_upload` and `_status` now serve all three obligation
kinds. Exactly two things changed:

1. `EvidenceAttemptAuthorizer`'s **first hop** became scope-aware — it calls
   `reauthorizeForEvidence` and walks to the order by whichever subject the
   grant carries.
2. `EVIDENCE_OBLIGATION_KINDS` gained `'FULL'` — the closed set that makes a
   fourth kind fail until someone decides it belongs here.

Everything after the first hop is unchanged, including the order comparison the
whole isolation rests on: whichever way the order was reached, the named
attempt's obligation must hang off *that* order.

`TransferEvidenceScopeInput.customRequestId` was renamed to `subjectId`. **Only
the field name changed** — the digested string is character-for-character the
delivered one, so every key an in-flight custom upload already claimed still
resolves to the same scope.

The route prefix still reads `deposit`, which is a naming wart: renaming it
would reissue two accepted operation ids for a naming decision. Recorded as a
follow-up in §AA.

---

## M. Superseded FULL / stale attempt behaviour

Proved end to end (`ready-made-full-payment.integration.spec.ts`):

```text
FULL A PENDING 280000.00, attempt A opened at 280000.00
Admin corrects the fee 30000 -> 45000
  A -> SUPERSEDED, superseded_by_obligation_id -> B
  B -> PENDING 295000.00                 (250000 + 45000, never 280000 + 45000)

customer read  -> 295000.00
QR             -> 295000.00
attempt A      -> still on A, still 280000.00, never migrated
new initiate   -> binds B at 295000.00, and the *same* Idempotency-Key is free
                  again because payment.initiate's scope is the obligation id
```

Nothing migrates an attempt across obligations, and nothing could: `openAttempt`
takes the obligation id the transaction resolved. §20 and §21 fall out of the
scope key rather than needing a rule.

---

## N. Expiry / cancel behaviour

For a `CANCELLED` order (where a lapsed reservation puts it, `BR-026`):

```text
order read            = 200, terminal state shown honestly, no deadline, no payment
FULL current/qr/init  = 404 (no live obligation at all)
new attempts written  = 0
```

§36's deadline comes from the order's own `RESERVED` reservation `expires_at`,
read through a new **unlocked** repository method — a public read may not take
`FOR UPDATE` on that row, or an anonymous caller could queue an Admin's fee
confirmation behind it. Nothing recomputes `now + 24h`, and the field disappears
once nothing `RESERVED` stands, so no countdown survives expiry.

For a `SATISFIED` obligation the read stays available and says
`payable: false`; the QR and a new initiate both refuse with
`FULL_PAYMENT_NOT_PAYABLE` (§26, §33).

---

## O. Cross-order security

`ready-made-order-access.integration.spec.ts` and
`ready-made-full-payment.integration.spec.ts` build **two real Ready-Made
orders** and prove each token opens exactly its own.

The property is structural rather than checked: no operation on this surface has
a field a caller could put another order in, and the order is read from the
grant row. The containment assertion in `PaymentTargetResolver.liveFor` is the
backstop for a future repository that grew a different lookup.

Invalid-token cases, all answering identically: unknown, malformed, revoked,
expired, wrong scope, wrong order.

---

## P. REQUEST_ACCESS regression

`ready-made-access-release-gate.integration.spec.ts` boots **two** applications,
because the release configuration is read once at composition:

| Wave 2 | `ORDER_ACCESS` | `REQUEST_ACCESS` |
|---|---|---|
| unreleased | resolves (200) | `404 SECURE_LINK_UNAVAILABLE` |
| released | resolves (200) | resolves (200), `customRequestId` intact |

With Wave 2 released, a `REQUEST_ACCESS` token still cannot read a Ready-Made
order — and is not told why.

No custom grant semantics were modified. `SecureGrantIssuer.issue`, `reissue`
and `revoke` keep their behaviour; the only edit is `requestSubjectOf(grant)`
where the widened type made the compiler ask.

---

## Q. DEPOSIT / REMAINING regression

The two delivered payment surfaces resolve `REQUEST_ACCESS` through
`reauthorize`, which is unchanged. Their contract suites pass, including the
assertions that neither publishes the other's vocabulary.

### The integration suites, and why they were red

`APP12-G02` composed a global guard that withholds every Wave-2 customer
operation, and the release flag defaults to withheld. The consequence for the
test tree was that the Wave-2 **customer** suites — the secure-link resolver,
the deposit, the remaining balance and the transfer-evidence lane — had been
asserting behaviour their own operations were withheld from ever since:

```text
at HEAD    99 failed /  25 passed   (124 tests, 8 suites)
after B04  90 failed /  34 passed   same suites, before the harness fix
then       0 failed / 124 passed   with Wave 2 released
```

B04 regressed none of them and, once the seam was already being touched, fixed
the cause: `applyWave2ReleasedEnv()` is a new shared helper, and a suite that
tests a Wave-2 capability now runs in the wave that releases it. It is
deliberately **not** the default — a Wave-1 suite that silently ran with Wave 2
released would stop proving that Ready-Made works while custom is withheld,
which is the property `APP12-R01` turns on.

That is what makes §48's regressions real rather than nominal: with Wave 2
released, `publicSecureLink_resolve`, the deposit trio, the remaining-balance
trio and both evidence operations behave **exactly** as delivered — 124/124.

### Contract suites

Measured against `HEAD` on the three presentation trees a public operation can
reach:

```text
                                    HEAD   after B04
payment + customer presentation        7           4
order presentation                     4           4
                                      --          --
                                      11           8
```

**B04 introduced none and repaired three.** The three repaired are the
exhaustive `public/orders` path bounds — the seam B04 extended — which had been
missing `APP9-B02`'s three final-payment paths and `APP9-B04`'s
acknowledgement since those checkpoints shipped.

The eight that remain are a different seam and were left alone per §52:
`APP7-B05` ×3 and `APP7-B06` ×1 (Admin evidence content and the
`adminGalleryAsset` binary), and `APP9-B01`, `APP5-B06`, `APP7-B02`,
`APP9-B04` ×1 each (Admin route bounds that later checkpoints widened).
Recorded in §AA.

---

## R. Operation inventory

```text
publicReadyMadeOrder_current       POST /api/public/ready-made-orders/current
publicOrderFullPayment_current     POST /api/public/orders/full-payment
publicOrderFullPayment_qr          POST /api/public/orders/full-payment/qr
publicOrderFullPayment_initiate    POST /api/public/orders/full-payment/attempts

NEW_HTTP_OPERATIONS = 4   (budget 4, hard max 5)
```

Extended, not added: `publicReadyMadeOrder_create` (response gains `access`),
`publicSecureLink_resolve` (scope-aware result variant),
`publicOrderDepositEvidence_upload` / `_status` (scope-aware first hop, contract
unchanged).

---

## S. OpenAPI delta

```text
before   121 paths / 134 operations / 265 schemas
after    125 paths / 138 operations / 277 schemas
```

Regenerated canonically (`pnpm openapi:generate`), verified with
`pnpm openapi:check`. No hand edits.

Schema changes: the four new operations' request and response components; the
`access` bootstrap on the create response; `SecureLinkResolutionResponse`'s
`customRequestId` becoming optional with `scopeKind` gaining `ORDER_ACCESS`; and
`AdminSecureGrantResponse` gaining an optional `orderId` beside an optional
`customRequestId`, because an operator answering "why did this link stop
working" must now be able to see an order grant.

---

## T. Generated-client delta

Regenerated with `pnpm generate`; `pnpm check:generated` reports the client up to
date at tree hash `6d274cd6…`. `pnpm typecheck` clean. No hand edits.

---

## U. Live disposable evidence

All suites run against **disposable** PostgreSQL databases created per context;
the evidence suite additionally starts a disposable MinIO.

| Suite | Result |
|---|---|
| `ready-made-order-access` | 16 / 16 PASS |
| `ready-made-full-payment` | PASS |
| `ready-made-full-payment-races` | PASS |
| `ready-made-access-release-gate` | PASS |
| `ready-made-full-payment-evidence` | PASS |
| `ready-made-order-creation` (B02) | 16 / 16 PASS |
| `ready-made-order-authority`, `-concurrency`, `ready-made-shipping-fee` | 70 / 70 PASS |
| `release-gate.contract` | 15 / 15 PASS |
| APP4/APP7/APP9 Wave-2 customer suites (flag on) | **124 / 124 PASS** (99 red at `HEAD`) |
| `full-payment-reference` (unit, includes the §34 negative) | 21 / 21 PASS |
| all `test/integration/ready-made-*` (11 suites) | **139 / 139 PASS** |

Proved live over real HTTP: creation issues and delivers `ORDER_ACCESS`;
resolution with Wave 2 off; the secure order read before the fee; the Admin fee
write; `FULL` current, QR and initiate at exactly `280000.00`; evidence upload
through the reused endpoint; a fee correction refreshing the composition; an
expired reservation refusing a new attempt; and unauthenticated / invalid-token
denial on every operation.

### Harness change this required

`createApiIntegrationContext` now installs the APP4 secret environment
(both peppers plus the delivery-envelope key) **for the context's lifetime**
rather than for its composition, because `App4SecretPepperProvider` reads
`process.env` lazily on the first request that needs a digest — and Ready-Made
creation is now such a request. `publishSecureAccessPolicies` is a new shared
fixture: the fail-closed `secure_grant` policy is now on the Wave-1 checkout
path, and an API booted without a published version refuses to create an order.
That is the correct production posture and is satisfied in tests rather than
weakened in source.

Its policy author is created `DISABLED`, not `ACTIVE`: CST-003 admits **at most
one ACTIVE admin** through a partial unique index, so a fixture minting an
active operator would collide with the one the suite logs in with, and which
ran first would decide whether the suite passed.

`applyWave2ReleasedEnv()` is the third addition — see §Q.

---

## V. Database hygiene

```text
MIGRATIONS               = 38   (unchanged; no 0039)
DB_SCHEMA_DELTA          = 0
commercial_validation    = DISPOSABLE
disposable_db_removed    = true   (CleanupStack drops each database)
shared_dev_B04_residue   = 0
G03_data_created         = false
```

`APP12-DB01` had already delivered every physical fact B04 needed:
`ORDER_ACCESS` in `GRANT_SCOPE_KINDS`, `secure_access_grants.order_id` with its
foreign key, `ck_secure_access_grants__scope_subject`, and
`uq_secure_access_grants__customer_order__active`.

---

## W. Files changed

**New — customer (grant scope)**
`application/grant-scope-release.gate.ts`,
`application/order-access-grant.issuer.ts`,
`domain/grant/grant-subject.ts`

**New — order (secure read)**
`domain/repositories/ready-made-order-access.repository.ts`,
`infrastructure/persistence/drizzle-ready-made-order-access.repository.ts`,
`application/ready-made/read-ready-made-order.query.ts`,
`application/ready-made/ready-made-order.view.ts`,
`presentation/public-ready-made-order-access.controller.ts`,
`presentation/schemas/public-ready-made-order-access.{request,response}.ts`,
`ready-made-order-access.module.ts`

**New — payment (FULL)**
`domain/full-payment/{full-payment.policy,full-payment.errors,full-payment-qr.policy,full-payment-reference,full-payment-reference.spec}.ts`,
`application/customer/{customer-full-payment.view,read-full-payment.query,deliver-full-payment-qr.query,initiate-full-payment-attempt.use-case}.ts`,
`presentation/public-order-full-payment{,-attempt}.controller.ts`,
`presentation/schemas/public-order-full-payment.{request,response}.ts`,
`customer-full-payment{,-attempt}.module.ts`

**Modified — runtime**
grant repository port and Drizzle adapter; `resolve-secure-link.query.ts`;
`reauthorize-secure-grant.service.ts`; both audit recorders;
`secure-grant.issuer.ts`; `customer.module.ts`;
`public-secure-link.controller.ts` and its two response schemas;
`admin-customer-support.controller.ts`;
`read-current-design-review.query.ts`;
`create-ready-made-order.use-case.ts`; `ready-made-order-result.codec.ts`;
`public-ready-made-order.{controller,response}`;
`payment-target.resolver.ts`; `evidence-attempt.authorizer.ts`;
`upload-transfer-evidence.service.ts`; `transfer-evidence-fingerprint.ts`;
`payment-composition.module.ts`; `operation-id.ts`;
`wave2-operation-authority.ts`; `custom-capability-release.guard.ts`;
`bootstrap/app.module.ts`

**Modified — persistence**
`inventory/reservation-window.ts` (`readActiveReservationForOrder`),
`inventory-reservations.ts`, `drizzle-sku-stock.repository.ts`,
`sku-stock.repository.ts`

**New — tests**
`test/support/{ready-made-access-fixture,secure-access-policy-fixture}.ts`,
plus `applyApp4SecretTestEnv` / `applyWave2ReleasedEnv` in
`test/support/api-integration-context.ts`,
`test/integration/ready-made-{order-access,full-payment,full-payment-races,full-payment-evidence,access-release-gate}.integration.spec.ts`

**Modified — tests**
the six Ready-Made suites (policy publication), the seven Wave-2 customer
suites (release flag), `ready-made-order-creation` and
`public-ready-made-order.contract` (the access bootstrap), the three payment
contract suites (exhaustive path bounds), `secure-link-repository` and
`admin-secure-grant-revoke` (the scope-set signature)

---

## X. File-size evidence

Every touched source file is under the 400-line hard limit and every touched
test file under 600. The two largest new source files are
`initiate-full-payment-attempt.use-case.ts` and
`public-order-full-payment.controller.ts`, both comfortably inside the 300-line
review threshold for code once documentation is discounted.

The `ORDER_ACCESS` issuer is a separate file partly for this reason:
`secure-grant.issuer.ts` stood at 380 lines, and an added scope path would have
crossed the hard limit.

---

## Y. Validation

```text
git diff --check                              clean
apps/api        pnpm typecheck                PASS
packages/persistence pnpm typecheck           PASS
packages/api-client  pnpm typecheck           PASS
packages/api-client  pnpm generate            PASS
packages/api-client  pnpm check:generated     PASS (tree hash 6d274cd6…)
apps/api        pnpm openapi:generate         125 / 138 / 277
apps/api        pnpm openapi:check            up to date
release-gate contract suite                   15 / 15 PASS
full-payment domain suite                     21 / 21 PASS
B02 creation + B04 access suites              32 / 32 PASS
B02/B03 regression suites                     70 / 70 PASS
B04 payment + races + release-gate suites     20 / 20 PASS
all ready-made integration suites (11)        139 / 139 PASS
B04 evidence suite (disposable MinIO)         PASS
Wave-2 customer regressions (flag on)         124 / 124 PASS
scoped file-size gate (80 files)              PASS (0 over limit)
eslint, changed files                         PASS
prettier --check, changed files               PASS
payment/customer contract suites              4 red, all pre-existing (§Q)
```

Not run, per §51: the full monorepo suite, UI/UAT, performance and Figma gates.

---

## Z. Baseline freeze

```text
OpenAPI            125 paths / 138 operations / 277 schemas
public operations  49
release matrix     28 DENY / 18 ALLOW / 3 SCOPE_GATED
migrations         38
DB schema          unchanged
Figma              unchanged
Storefront routes  unchanged (0)
Admin routes       unchanged (0)
```

---

## AA. Follow-ups

**Closed by this checkpoint**

```text
ORDER_ACCESS issuance / resolution                     CLOSED_BY_APP12_B04
secure Ready-Made order current                        CLOSED_BY_APP12_B04
FULL current / qr / initiate / evidence composition    CLOSED_BY_APP12_B04
publicSecureLink_resolve whole-operation DENY debt     CLOSED_BY_APP12_B04
```

**Opened** (`FU-APP12-B04-01` closed by `APP12-B04-C1`; the other two stand)

| Id | Owner | Note |
|---|---|---|
| `FU-APP12-B04-01` | ~~`APP12-S03` / `APP12-B05`~~ → **`CLOSED_BY_APP12_B04_C1`** | *Original text, retained:* "The customer order projection cannot distinguish a **reservation expiry** from an operator cancellation. `orders.cancelled_reason` is free text, so §13's 'if the existing cancellation reason authority provides it' is not satisfied, and matching on the sentence would be fragile. `APP12-D01` §I lists `EXPIRED` as a page variant; whoever needs it should add a machine-readable discriminator rather than parse prose." — **The routing was rejected and the gap closed in `APP12-B04-C1`.** The discriminator did not need adding: `inventory_reservations.status = 'EXPIRED'` is written in the same transaction as the cancellation, so the projection now publishes an optional `terminationReason` derived from it. No prose is parsed, no column was added and no order state was invented. |
| `FU-APP12-B04-02` | `APP12-H01` | The reused evidence route reads `/public/orders/deposit/evidence` while serving a Ready-Made `FULL` obligation. Correct but misleading. Renaming would reissue two accepted operation ids and is a contract change, not a cleanup. |
| `FU-APP12-B04-03` | `APP12-H01` | **Eight** contract assertions were already red at `HEAD` and are not B04's seam: `APP7-B05` ×3 and `APP7-B06` ×1 (Admin evidence content, `adminGalleryAsset` binary), `APP9-B01`, `APP5-B06`, `APP7-B02` and `APP9-B04` ×1 each (Admin route bounds that later checkpoints widened without updating). Left untouched per §52; each is an exhaustive list that has fallen behind, not a defect in the surface it guards. |

**Remain open, untouched:** `APP12-B05`, `APP12-S01`, `APP12-S02`,
`APP12-S03`, `APP12-A01`, `APP12-G03`.

**Not absorbed, per §52:** `FU-APP12-C03-01`, `FU-APP12-B02-01..04`,
`FU-APP12-B03-01`, `FU-APP12-B03-C1-01`.

---

## AB. Roadmap

```text
APP12-B04 COMPLETE_AFTER_C1
APP12-B05 NEXT
```

See the correction notice at the top of this report and
[`APP12-B04-C1-COMPLETION-REPORT.md`](./APP12-B04-C1-COMPLETION-REPORT.md).

Boundaries held and **asserted** (§34): `VERIFIABLE_OBLIGATION_KINDS` is still
`['DEPOSIT', 'REMAINING']`, `isVerifiableObligationKind('FULL')` is `false` and
`verifiedPaymentTransitionFor('FULL')` is `undefined`, so no
`AWAITING_PAYMENT -> READY_FOR_DELIVERY` transition exists — no fulfilment was
implemented, no Storefront or Admin UI was written, no Figma artifact was
touched, no migration was added, no shared dev database received commercial
data, and nothing was pushed.
