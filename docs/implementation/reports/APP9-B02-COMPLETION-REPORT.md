# APP9-B02 — Customer Remaining-Payment Capability — Completion Report

## 1. Verdict

```text
APP9-B02 = COMPLETE
APP9_B02_HTTP_OPERATIONS = 3
PAYMENT_KIND = REMAINING
PAYMENT_MVP = MANUAL_BANK_TRANSFER
NEW_GRANT_SCOPE = 0
NEW_EVIDENCE_ENDPOINTS = 0
EVIDENCE_REUSE = NARROWLY_GENERALISED
MIGRATIONS_ADDED = 0
WORKER_CHANGES = 0
NEXT_CHECKPOINT = APP9-B03
NOT_PUSHED = true
```

## 2. Branch, HEAD, commit, push state

```text
branch          production
entry HEAD      52fd098  feat(app9): deliver the final-payment lifecycle entry (APP9-B01)
commit          none — the working tree carries the change, uncommitted
push            NOT_PUSHED = true
```

## 3. Scope delivered

The customer-facing backend capability for the `REMAINING` obligation APP7
created and left unsatisfied: read it, get manual-bank-transfer instructions and
a QR for it, and open one payment attempt against it. It is a **sibling** of the
delivered deposit lane, not a rewrite of it — same base path, same locator-free
`POST` routes, same secure-access chain, same merchant configuration, same QR
payload builder and encoder, same idempotency namespace, same step-up guard.

What is genuinely new is one thing: `REMAINING` exists from order creation but
becomes payable only at `TR-LC14-05`, so this surface has a payable window the
deposit lane does not, and the two operations that *act* are gated on it while
the read is not.

## 4–5. The three new HTTP operations

| Route | Method | Operation id | Success |
|---|---|---|---|
| `/api/public/orders/final-payment` | `POST` | `publicOrderFinalPayment_current` | `200` + `FINAL_PAYMENT_READ` |
| `/api/public/orders/final-payment/qr` | `POST` | `publicOrderFinalPayment_qr` | `200` `image/png` |
| `/api/public/orders/final-payment/attempts` | `POST` | `publicOrderFinalPayment_initiate` | `201` + `FINAL_PAYMENT_ATTEMPT_OPENED` |

Route vocabulary was settled by repository convention, not by asking: the
deposit lane publishes `deposit`, `deposit/qr`, `deposit/attempts`, so the
balance publishes `final-payment`, `final-payment/qr`,
`final-payment/attempts`. `final-payment` rather than `remaining` because it is
LC-14's own vocabulary (`AWAITING_FINAL_PAYMENT`, `TR-LC14-05`) and reads as a
thing a customer pays rather than as an internal obligation kind.

Both are `POST` for `APP7-B03`'s reason, unchanged: `ADR-APP4-001` §11 makes the
URL fragment the token's only browser carrier and declares a query or path
carrier `FORBIDDEN`, so the credential travels in a JSON body and even the two
reads are `POST`. Neither consumes the link (`ADR-DB3-004` r2).

Two controllers, one published domain. `PublicOrderFinalPaymentController` holds
the two reads; `PublicOrderFinalPaymentAttemptController` holds the one write.
The split is APP7's and exists for its reason — the read module is *defined* by
importing no `DatabaseModule`, so nothing composed there can open a transaction.
`CONTROLLER_DOMAIN_KEYS` gained one entry
(`PublicOrderFinalPaymentAttemptController: 'publicOrderFinalPayment'`) so the
write does not mint `publicOrderFinalPaymentAttempt_initiate`.

## 6. Secure access walk

```text
secure-link token (body only)
  -> AuthorizeSecureLink                 the delivered APP4 policy, abuse budget and peppered digest
  -> secure_access_grants.custom_request_id
  -> orders.custom_request_id            uq_orders__request, exactly one
  -> payment_obligations(order, REMAINING, live)
```

- The **existing `REQUEST_ACCESS` grant** is reused. No `FINAL_PAYMENT_ACCESS`,
  no `PAYMENT_ACCESS`, no `ORDER_ACCESS`, no new scope kind, no new customer
  session, and nothing minted anywhere on this surface.
- No operation accepts an order id, obligation id, attempt id, customer id,
  amount, currency or method. There is no locator in any of the three paths and
  the three request bodies are `.strict()` objects of exactly `{ token }`, so a
  foreign identifier is a `400` rather than a thing the server has to defend
  against.
- The write additionally re-establishes the grant **inside its transaction under
  its row lock** (`ADR-DB3-004` r9), which is what makes a concurrent revoke
  win. The pre-transaction admission still runs, so a caller cannot escape
  `secure_link.resolve`'s budget by spreading guesses across the three routes.
- `PaymentTargetResolver` keeps APP7's containment check
  (`obligation.orderId !== order.id` → refuse), so a repository that later grew a
  different lookup could not make one order's obligation payable from another
  order's link without failing first.

## 7. Final-payment lifecycle states

Payability is **derived**, never stored. No payable column, flag or migration
exists; `isFinalPaymentPayable` reads the two states that already exist.

```text
payable  ⇔  order.status = AWAITING_FINAL_PAYMENT  ∧  obligation.status = PENDING
```

| Operation | Allowed | Refused |
|---|---|---|
| `_current` (read) | **every** state in which a live `REMAINING` obligation exists | only the access chain refuses it (404) |
| `_qr` | `AWAITING_FINAL_PAYMENT` ∧ `PENDING` | every other combination → `409 FINAL_PAYMENT_NOT_PAYABLE` |
| `_initiate` | `AWAITING_FINAL_PAYMENT` ∧ `PENDING` | every other combination → `409 FINAL_PAYMENT_NOT_PAYABLE` |

Refused order states for the two acting operations, explicitly:
`AWAITING_DEPOSIT`, `DEPOSIT_PAID`, `IN_PRODUCTION`, `PRODUCTION_COMPLETED`,
`ON_HOLD`, `READY_FOR_DELIVERY`, `DELIVERED`, `COMPLETED`, `CANCELLING`,
`CANCELLED`. Refused obligation states: `SATISFIED` (and `SUPERSEDED` /
`CANCELLED`, which never reach the predicate because `findLiveForOrder` filters
them out first and the surface answers 404).

`ON_HOLD` is deliberately refused even though `ON_HOLD → AWAITING_FINAL_PAYMENT`
is a *legal* LC-14 move (`ADR-DB3-003` r5): a paused order must not hand a
customer a transfer memo. This is the same distinction `APP9-B01` recorded
between LC-14 legality and a source-state guard.

The read/act split is `APP9-B02` §6's preferred principle, implemented literally:
committed truth stays visible after the window closes — a customer whose balance
an Admin verified sees `finalPaymentStatus: SATISFIED`, `orderStatus:
READY_FOR_DELIVERY`, `payable: false` — but neither the QR nor a new attempt can
reopen payment. One refusal code covers both halves of the predicate so the
response does not disclose the order's internal state; the read is where a
caller entitled to both states gets them.

## 8. Live `REMAINING` resolution

Every operation resolves through the one AGG-16 authority:

```ts
this.obligations.findLiveForOrder(order.id, 'REMAINING')
```

- Kind-aware. `'DEPOSIT'` appears nowhere in the final-payment application layer
  and is **never** a fallback: a missing live `REMAINING` refuses rather than
  substituting the deposit, and the integration suite asserts the deposit's
  amount and id appear nowhere in that refusal.
- Live-aware. `findLiveForOrder` filters on the statuses
  `uq_payment_obligations__order_kind__live` arbitrates (`PENDING`,
  `SATISFIED`), so a `SUPERSEDED` or `CANCELLED` row is invisible. When
  `APP9-B04` later supersedes an obligation on a shipping-fee change, the older
  row cannot be used for a new attempt — that behaviour is free, not
  reimplemented, and B04's recalculation is **not** implemented here.
- The amount and currency are the obligation's own `numeric(14,2)` strings,
  copied. No `total - deposit`, no quotation read, no order-line arithmetic and
  no `Number()` anywhere on the path.

## 9. Customer projection

`CustomerFinalPaymentResponse` — a new sibling component. `CustomerDepositView`
was **not** re-pointed: `APP9-R00` confirmed APP7 closed it to deposit semantics
deliberately, its field names say `deposit`, and its accepted contract asserts
the word `remaining` never appears in it.

| Field | Source |
|---|---|
| `orderCode` | the order's own code (display/support only; never an authorization input) |
| `orderStatus` | the order's LC-14 state |
| `finalPaymentStatus` | the obligation's LC-15 state |
| `finalPaymentAmount` | the obligation's own frozen amount, as a string |
| `currencyCode` | the obligation's own currency |
| `payable` | derived by `isFinalPaymentPayable` from the two states above; stored nowhere |
| `bankInstructions` | merchant config + the derived `RM` memo |
| `accessExpiresAt` | when this link stops opening the balance |

`payable` is published rather than left to the browser because the rule is
business authority (`APP9-G01` §4) and a component deciding it from two enums
would be a second, drifting copy of LC-14 living in a React file.

Deliberately absent, and asserted absent by the contract suite: any obligation,
attempt, grant, challenge or customer id; any reconciliation, verification,
refund or provider field; any shipping, carrier or tracking field; any attempt
list (`APP7-B03` defined no customer attempt selector and B02 adds none); and
anything named `deposit` — the exact mirror of B03's `remaining` exclusion, which
is what makes the two projections genuinely separate rather than one renamed.

## 10. Manual bank transfer and QR

Reused unchanged, with no edit to any of them:

```text
MERCHANT_BANK_CONFIG / loadMerchantBankConfig   the same merchant account, same factory
buildBankTransferQrPayload                      EMVCo/NAPAS account-transfer payload
BankTransferQrEncoder                           the PNG encoder
DEPOSIT_QR_CONTENT_TYPE / CACHE_CONTROL /       re-exported under final-payment names
  CONTENT_TYPE_OPTIONS                          from `final-payment-qr.policy.ts`
```

The payload builder and encoder take a bank, an account, an amount and a
reference — none of which mentions an obligation kind — so the whole
real-bank-scan-compatible encoding is reused with no generalisation at all. The
only surface-specific constant is the saved filename
(`final-payment-transfer-qr.png`), so a customer who saved both QRs can tell them
apart in their own folder; like the deposit's it names no order fact.

No provider checkout, session or token; no webhook, callback or external
reconciliation; no change to the merchant configuration architecture.

## 11. Transfer reference derivation

```text
order code          ORD-XXXXXXXXXX
final-payment memo  ORDXXXXXXXXXXRM      15 chars, ^ORD[alphabet]{10}RM$
deposit memo        ORDXXXXXXXXXXDC      unchanged
```

`RM` is not invented: `APP7-G01` §4 froze one positional format and named both
kind codes at once, reserving `RM` for this obligation. So this is the same
derivation with the code APP7 reserved, deterministic, derived and never
persisted, and safe for a bank memo field (25-character limit; this is 15,
uppercase alphanumeric, no punctuation to be normalised away).

It is a **sibling module** (`remainingTransferReference`) rather than a kind
parameter on `depositTransferReference`, because APP7 ruled exactly that:
"there is no kind parameter, because a parameter would be the first step towards
APP7 deriving a reference for an obligation it does not make payable", and
`deposit-reference.spec.ts` asserts that function's arity and that it never
produces `RM`. Generalising it would have broken an accepted assertion in order
to violate an accepted ruling. The cost is four duplicated lines; the benefit is
that neither surface can address the other's obligation.

`deposit-reference.ts` is **unchanged** — zero bytes — so APP7's Admin
reconciliation and expected-reference reads are untouched.

## 12. Attempt-initiation semantics

One transaction, in this order:

1. `ReauthorizeSecureGrant` — the grant re-established under its row lock;
2. `PaymentTargetResolver.resolve(requestId, 'REMAINING')`;
3. the payable predicate → `FINAL_PAYMENT_NOT_PAYABLE` if false;
4. `IdempotencyStore.claim` in the delivered `payment.initiate` namespace;
5. `StepUpEvidenceResolver` (GRD-003) → `REVERIFICATION_REQUIRED` if absent;
6. `PaymentObligationRepository.openAttempt` — `BANK_TRANSFER`, `PENDING`, the
   obligation's exact amount, `grantId` and `stepUpChallengeId` recorded,
   `provider_key`/`provider_ref` left NULL.

Required properties, each held:

- **Cannot initiate for `DEPOSIT` through this route** — the resolver is asked
  for `REMAINING` and the caller supplies no kind. Proved by per-kind attempt
  counts, because a total across the order cannot tell the two apart.
- **Cannot initiate against a superseded/non-live obligation** — invisible to
  `findLiveForOrder`; the surface answers 404.
- **Cannot initiate while not payable** — the §7 predicate, then `openAttempt`'s
  own `FOR UPDATE` re-read of the obligation, whose `OBLIGATION_NOT_PAYABLE`
  guard is translated to the same `FINAL_PAYMENT_NOT_PAYABLE`. The earlier check
  exists because the *order's* state is not something the obligation's row lock
  can speak for.
- **Cannot reopen a `SATISFIED` obligation** — both halves refuse.
- **Cannot bind an attempt to another order/request** — the attempt is opened
  against `target.obligation.id`, which came from the grant's own order.
- **No second idempotency system** and **no duplicate-attempt behaviour beyond
  what the repository allows** — see §13.
- **Not a payment.** No attempt is settled, no obligation satisfied, no order
  moved, no reconciliation appended, no outbox event emitted. The module imports
  no `OrderModule`, no `IdentityModule` and no outbox store, so none of those is
  reachable rather than merely unwritten.

## 13. Idempotency and replay

Followed separately per operation, and reported as it actually behaves:

```text
_current   side-effect-free. Repeated reads write nothing and do not consume the link.
_qr        side-effect-free. The image is regenerated per request; nothing is stored.
_initiate  APP7's accepted Idempotency-Key semantics, unchanged.
```

`_initiate` uses the delivered `payment.initiate` namespace with scope key
`sha256(obligationId : attemptKey)` and fingerprint over `(amount, method)`.
Because the scope key carries the **obligation** id, the two obligations of one
order are already distinct scopes: a key spent on the deposit is free on the
balance, and vice versa. That helper
(`domain/deposit/deposit-initiate-idempotency.ts`) is imported unchanged rather
than copied or parameterised — it was named `PAYMENT_INITIATE_*` and keyed by
obligation id precisely because it was never deposit-specific.

- Same key → the same attempt replayed, `replayed: true`, no second row.
- New key → a second attempt. That is APP7's accepted model.
- Claim in progress → `409 DUPLICATE_OPERATION`; key reused with a different
  fingerprint → `409 IDEMPOTENCY_CONFLICT`.
- The replay is checked **before** GRD-003, on the delivered deposit precedent: a
  replay writes nothing, and gating it on a still-open step-up window would tell
  a customer retrying after a dropped response to re-verify in order to be shown
  an attempt they already opened.

`APP9-B01`'s deterministic-409 transition-replay model was **not** forced onto
attempt creation.

## 14. Transfer-evidence disposition

```text
EVIDENCE_REUSE = NARROWLY_GENERALISED
NEW_EVIDENCE_ENDPOINTS = 0
NEW_EVIDENCE_TABLES = 0
EVIDENCE_OPERATIONS_RENAMED = 0
EVIDENCE_MODERATION_SEMANTICS_CHANGED = 0
```

The audit found the DEPOSIT hardcoding in **exactly one place**:
`EvidenceAttemptAuthorizer`, which required the locked attempt's obligation to be
the live `DEPOSIT` one. `payment_transfer_evidence` itself is attempt-scoped
(`IMP-D055`) and safely supports either kind, so this is the case `APP9-B02` §12
names and it was generalised there and nowhere else.

Before:

```ts
attempt.paymentObligationId !== target.obligation.id ||
attempt.obligationKind !== 'DEPOSIT' ||
attempt.obligationOrderId !== target.order.id ||
attempt.method !== TRANSFER_EVIDENCE_ATTEMPT_METHOD
```

After:

```ts
attempt.obligationOrderId !== order.id ||
!EVIDENCE_OBLIGATION_KINDS.includes(attempt.obligationKind) ||   // ['DEPOSIT','REMAINING']
attempt.method !== TRANSFER_EVIDENCE_ATTEMPT_METHOD
```

The clause isolation actually rests on — the **order** comparison — is unchanged
and is now load-bearing on its own rather than shadowed by an obligation-identity
comparison that could only ever hold for one kind. The kind is asserted against a
closed set rather than omitted, so a third `CST-039` kind added later fails here
until someone decides this surface should carry its evidence.
`AuthorizedEvidenceAttempt.obligationId` now comes off the locked attempt row.

Case H proves all three halves through the delivered
`publicOrderDepositEvidence` status operation: a `REMAINING` attempt resolves
(before B02 it was a 404, which is what made the lane unusable for the balance),
a `DEPOSIT` attempt still resolves, and the other customer's live link still
cannot resolve either of this order's attempts — same indistinguishable 404.

**Nonblocking observation, routed forward:** the reused routes are literally
named `/public/orders/deposit/evidence`, so a `REMAINING` evidence upload travels
a `deposit`-named path. `APP9-B02` §12 forbids renaming APP7 evidence operations,
so it is left as-is and recorded as `FU-APP9-B02-01`.

## 15. Deposit behaviour after the shared-helper changes

Two shared helpers changed, both narrowly:

| Helper | Change | Deposit behaviour |
|---|---|---|
| `DepositTargetResolver` → `PaymentTargetResolver` | obligation kind became a parameter; an order-only `resolveOrder` hop was added | unchanged — the three deposit call sites pass `DEPOSIT`, and the two refusals and the containment check are the delivered ones |
| `EvidenceAttemptAuthorizer` | see §14 | unchanged — Case H asserts a deposit attempt still resolves, and the four APP7 evidence/deposit suites pass |

Proved by `CMD-TEST-APP9-B02-APP7-REGRESSION` (§21): **74 tests across 4 suites,
all passing**, including the deposit read, the deposit attempt with its
idempotency and race cases, and both transfer-evidence suites.

Not changed at all, and therefore not regression-run: `deposit-reference.ts`,
`bank-transfer-qr.payload.ts`, `bank-transfer-qr.encoder.ts`,
`deposit-qr.policy.ts`, `deposit-initiate-idempotency.ts`, `deposit.errors.ts`,
`customer-deposit.view.ts`, and all three deposit application services beyond the
resolver's call signature.

## 16–18. Confirmed absences

```text
Admin verification added                    NO   (APP9-B03 owns it; no IdentityModule in either new module)
TR-LC14-06 added                            NO
payment.verified producer/consumer changed  NO   (no outbox store is injectable here)
worker changes                              NO   (apps/worker untouched — 0 files)
migration / schema change                   NO   (37 migrations, 79 tables, unchanged)
payment provider / callback / webhook       NO   (IMP-O007 stays open; payment_provider_events unused)
notification intents                        NO
shipping / fulfillment / dispatch / freeze  NO
inventory / production changes              NO
cancellation / refund                       NO   (PO-APP9-001 = OPTION A — DEFER respected)
Figma / Admin frontend / Storefront         NO
new grant scope                             NO
```

## 19. OpenAPI before and after

```text
OPENAPI_PATHS_BEFORE       93
OPENAPI_PATHS_AFTER        96      (+3)
OPENAPI_OPERATIONS_BEFORE  100
OPENAPI_OPERATIONS_AFTER   103     (+3)
OPENAPI_SCHEMAS_BEFORE     208
OPENAPI_SCHEMAS_AFTER      214     (+6)
APP9_B02_OWNED_OPERATIONS  3
```

The six schemas were not assumed in advance; they are the three `.strict()`
request bodies (`ReadFinalPaymentBody`, `FinalPaymentQrBody`,
`InitiateFinalPaymentAttemptBody`) and the three response components
(`CustomerFinalPaymentResponse`, `FinalPaymentBankInstructionsResponse`,
`FinalPaymentAttemptResponse`). No existing schema was renamed or altered. The
narrow generalisation of the two shared application helpers produced **no**
contract change, so no churn was created for it.

Generated through the normal flow only, in order: controller/DTO →
`CMD-OPENAPI-GENERATE` → `CMD-OPENAPI-CHECK` → `CMD-API-CLIENT-GENERATE` →
`CMD-API-CLIENT-CHECK`. Nothing was hand-edited.

## 20. Generated client

`CMD-API-CLIENT-GENERATE` produced two files (7 857 lines, tree hash
`6ba6aa93…`), and `CMD-API-CLIENT-CHECK` reports no drift. Three new operations
are exported: `publicOrderFinalPaymentCurrent`, `publicOrderFinalPaymentQr`,
`publicOrderFinalPaymentInitiate`. No storefront or admin curated boundary was
touched — `APP9-S01` owns that.

## 21. Focused tests actually run

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="final-payment-reference" --testPathIgnorePatterns=/node_modules/` | 14/14 pass |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-order-(deposit\|final-payment)[.]contract[.]spec" --testPathIgnorePatterns=/node_modules/` | 131/131 pass, 2 suites |
| `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="customer-final-payment[.]integration" --testPathIgnorePatterns=/node_modules/` | 22/22 pass |
| `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="customer-deposit-(read\|attempt)[.]integration\|transfer-evidence" --testPathIgnorePatterns=/node_modules/` | 74/74 pass, 4 suites |
| combined final run of all four | **241/241 pass, 8 suites** |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | clean |
| `pnpm --filter @embroidery/api exec eslint <changed paths>` | clean (one `no-unnecessary-type-assertion` found and fixed) |
| `pnpm exec prettier --write <changed files>` | applied |
| `pnpm --filter @embroidery/api openapi:generate` / `openapi:check` | 96/103/214; no drift |
| `pnpm --filter @embroidery/api-client generate` / `check:generated` | no drift |
| `node tools/check-report-secrets.mjs` | fails on two **inherited** findings — see §27 |

Four scoped commands were added to `docs/implementation/SCOPED_COMMAND_INDEX.md`
(`CMD-TEST-APP9-B02-UNIT`, `-CONTRACT`, `-INTEGRATION`, `-APP7-REGRESSION`). No
root script was added.

## 22. Cases proven

| Case | Proof |
|---|---|
| **A** current/read | the obligation's own frozen amount (not the deposit's `765000.00`, not the total `2550000.00`); both states published separately with `payable: true`; the exact merchant account and the `RM` memo; nothing about the deposit and no identifier echoed; two reads write nothing and leave the grant `ACTIVE`; an extra body field is a 400 |
| **B** QR | a downloadable PNG with `no-store`/`nosniff`/`attachment`; the payload **decoded out of the delivered pixels by `pngjs` + `jsqr`** carries the merchant bank and account, `54071785000` (the balance) and not `5406765000` (the deposit), the `RM` memo and not the `DC` one, and no URL, token or grant id; three downloads change nothing |
| **C** attempt initiation | one `PENDING` `BANK_TRANSFER` attempt at the obligation's exact amount, with NULL provider columns and the grant/challenge recorded; **per-kind** counts show `REMAINING` 1 / `DEPOSIT` 0; the order stays `AWAITING_FINAL_PAYMENT` and no reconciliation exists; same key replays with no second row, new key opens a second; a key spent on the deposit is free here; a malformed `Idempotency-Key` is a 400 that writes nothing |
| **D** not payable | parameterised over `AWAITING_DEPOSIT`, `PRODUCTION_COMPLETED` and `ON_HOLD`: the read answers 200 with `payable: false` and the true amount, while the QR and the attempt are both 409 `FINAL_PAYMENT_NOT_PAYABLE` and no attempt row is created |
| **E** superseded / missing | a `SUPERSEDED` balance answers the *same* status, code and message as an unknown token; the live deposit's amount and id appear nowhere in the refusal; the QR and the attempt are 404 too; a request with no order answers identically |
| **F** access isolation | two live grants each reach only their own order — different codes and different memos; a smuggled `orderId` is a 400; an attempt opened on one link lands on that link's obligation and leaves the other's at zero |
| **G** satisfied | after the customer's own attempt is settled and the obligation satisfied through the canonical AGG-16 writers and the order moved to `READY_FOR_DELIVERY`, the read still answers with `SATISFIED` / `payable: false` and no carrier, tracking or shipping fact; the QR and a new attempt are both 409; the per-kind snapshot shows the one paying attempt and no second |
| **H** evidence reuse | a `REMAINING` attempt now resolves through the delivered evidence status operation, a `DEPOSIT` attempt still resolves, and a foreign link resolves neither |

## 23. Directly impacted APP7 regression

`CMD-TEST-APP9-B02-APP7-REGRESSION` — the four suites that exercise the two
changed helpers, and only those: `customer-deposit-read`,
`customer-deposit-attempt`, `transfer-evidence`,
`transfer-evidence-authorization`. 74/74 pass.

`public-order-deposit.contract.spec.ts` was also **modified** and run: its two
"and nothing else" bounds enumerate the whole `public/orders` surface and the
repository-wide bound matches on the word `payment`, so both had to name B02's
three paths to stay exhaustive assertions rather than be loosened into prefix
filters. Nothing else in that suite changed; every assertion about what a deposit
schema may contain — including that the word `remaining` appears in none of them
— still holds unmodified.

## 24. Validations deliberately not run, and why

```text
full pnpm test / full Jest              no change justifies a repository-wide aggregate
all API integration tests               ditto
the whole APP7 payment package          the Admin verification, review and evidence-delivery
                                        suites touch neither changed helper
APP7-E01 / APP8-E01 / APP9-B01 tests    no file they cover changed
worker acceptance, DB race suites       apps/worker and the persistence package are untouched
Playwright / Docker / full build        no frontend, no infrastructure change
Admin and Storefront tests              no frontend change; the curated client boundary is APP9-S01's
Figma checks                            no design or frontend UI checkpoint
manual real-bank QR scan                the QR algorithm, encoder and payload builder are
                                        byte-for-byte unchanged; only the input obligation kind
                                        differs, so §16 Case B's deterministic payload assertion
                                        against decoded pixels is sufficient
SonarQube                               repository-global control, not run per checkpoint here
```

## 25. Changed files

**New — runtime (14)**

```text
apps/api/src/modules/payment/domain/final-payment/final-payment-reference.ts
apps/api/src/modules/payment/domain/final-payment/final-payment.policy.ts
apps/api/src/modules/payment/domain/final-payment/final-payment.errors.ts
apps/api/src/modules/payment/domain/final-payment/final-payment-qr.policy.ts
apps/api/src/modules/payment/application/customer/customer-final-payment.view.ts
apps/api/src/modules/payment/application/customer/read-final-payment.query.ts
apps/api/src/modules/payment/application/customer/deliver-final-payment-qr.query.ts
apps/api/src/modules/payment/application/customer/initiate-final-payment-attempt.use-case.ts
apps/api/src/modules/payment/presentation/schemas/public-order-final-payment.request.ts
apps/api/src/modules/payment/presentation/schemas/public-order-final-payment.response.ts
apps/api/src/modules/payment/presentation/public-order-final-payment.controller.ts
apps/api/src/modules/payment/presentation/public-order-final-payment-attempt.controller.ts
apps/api/src/modules/payment/customer-final-payment.module.ts
apps/api/src/modules/payment/customer-final-payment-attempt.module.ts
```

**New — tests (4)**

```text
apps/api/src/modules/payment/domain/final-payment/final-payment-reference.spec.ts
apps/api/src/modules/payment/presentation/public-order-final-payment.contract.spec.ts
apps/api/test/support/customer-final-payment-fixture.ts
apps/api/test/integration/customer-final-payment.integration.spec.ts
```

**Renamed (1)**

```text
application/customer/deposit-target.resolver.ts -> application/customer/payment-target.resolver.ts
```

**Modified (11)**

```text
apps/api/src/modules/payment/application/customer/read-deposit.query.ts          (pass DEPOSIT)
apps/api/src/modules/payment/application/customer/deliver-deposit-qr.query.ts    (pass DEPOSIT)
apps/api/src/modules/payment/application/customer/initiate-deposit-attempt.use-case.ts (pass DEPOSIT)
apps/api/src/modules/payment/application/evidence/evidence-attempt.authorizer.ts (§14)
apps/api/src/modules/payment/customer-deposit.module.ts                          (provider rename)
apps/api/src/modules/payment/customer-deposit-attempt.module.ts                  (provider rename)
apps/api/src/modules/payment/customer-deposit-evidence.module.ts                 (provider rename)
apps/api/src/modules/payment/presentation/public-order-deposit.contract.spec.ts  (§23)
apps/api/src/openapi/operation-id.ts                                             (one domain-key entry)
apps/api/src/bootstrap/app.module.ts                                             (two module registrations)
docs/implementation/SCOPED_COMMAND_INDEX.md                                      (four rows)
docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md             (§28)
```

**Generated (3)** — through generation only, never hand-edited

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

## 26. File-size check

```text
largest runtime source   public-order-final-payment.controller.ts   318 / 400   OK
                         public-order-final-payment-attempt.ctrl.ts 241 / 400   OK
                         initiate-final-payment-attempt.use-case.ts 230 / 400   OK
                         app.module.ts (modified)                   378 / 400   OK
largest test             customer-final-payment.integration.spec.ts 570 / 600   OK
                         public-order-final-payment.contract.spec   468 / 600   OK
                         public-order-deposit.contract.spec         415 / 600   OK
```

Every file is under its hard limit. Two are over the review threshold and are
recorded rather than split: the integration suite at 570/500 carries all eight
§16 cases in one file because they share one application and one disposable
database, and splitting them would double the boot cost for no review benefit;
the B02 contract suite at 468/300 is a test file and well under its own 600 hard
limit.

## 27. Nonblocking findings

```text
FU-APP9-B02-01  NEW / NONBLOCKING
  A REMAINING transfer evidence upload travels a route literally named
  `/api/public/orders/deposit/evidence`. The lane is correctly attempt-scoped
  after §14 and works, but the path vocabulary now under-describes it.
  APP9-B02 §12 forbids renaming APP7 evidence operations, so this is routed
  forward rather than fixed. Owner: APP10, or an APP9-S01 finding if the
  Storefront makes the mismatch user-visible.

FU-APP9-G01-01  INHERITED / NONBLOCKING — unchanged, no B02 correction
  `node tools/check-report-secrets.mjs` still fails on the same two false
  positives APP9-G01 and APP9-B01 recorded:
    docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md:93
    docs/implementation/reports/APP9-G01-COMPLETION-REPORT.md:381
  Both are prose about a token, not a token. No new B02 finding appeared. Per
  APP9-B02 §21 the inherited evidence is recorded and nothing was edited —
  neither the old reports nor the checker. The checker takes no file arguments,
  so it cannot be scoped to B02's own report.

FU-APP9-B01-01  CARRIED_FORWARD / NONBLOCKING — no `payment.final-requested`
                added; B02 is customer payment composition, not the event-authority
                checkpoint.
FU-APP9-B01-02  CARRIED_FORWARD / NONBLOCKING — no repository-wide order audit
                convention added.
IMP-O008 / FU-APP8-B04-02   unchanged, still routed forward.
```

## 28. Roadmap status

`docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md` §15:

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   NEXT
W01   INCOMPLETE
B04   INCOMPLETE
B05   INCOMPLETE
D01   INCOMPLETE
A01   INCOMPLETE
S01   INCOMPLETE
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`.

## 29. Next checkpoint

```text
NEXT_CHECKPOINT = APP9-B03
```

`APP9-B03` — Admin remaining verification and `TR-LC14-06` in one transaction,
emitting the true `obligationKind`. Not begun.

## 30. Push state

```text
NOT_PUSHED = true
```

Nothing was committed and nothing was pushed. The working tree carries the
change for human review.
