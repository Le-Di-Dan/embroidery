# APP7-B03 — Completion Report

## Customer Secure Deposit Read + BANK_TRANSFER Attempt + Dynamic QR

- Phase: `APP7 — Deposit Payment and Order Creation`
- Checkpoint: `APP7-B03`
- Mode: `IMPLEMENTATION / BACKEND / PAYMENT CUSTOMER SECURE`
- Branch/HEAD at entry: `production` @ `7e2147b`
- Date: 2026-08-23

---

## 1. Verdict

```text
APP7-B03 = COMPLETE
CHECKPOINT_SCOPE = CUSTOMER_SECURE_DEPOSIT_AND_DYNAMIC_QR
HTTP_OPERATIONS = 3

DEPOSIT_READ_OPERATION       = POST /api/public/orders/deposit           publicOrderDeposit_current
ATTEMPT_INITIATION_OPERATION = POST /api/public/orders/deposit/attempts  publicOrderDeposit_initiate
QR_DELIVERY_OPERATION        = POST /api/public/orders/deposit/qr        publicOrderDeposit_qr

PAYMENT_METHOD        = BANK_TRANSFER
PAYMENT_PROVIDER      = NONE
ATTEMPT_INITIAL_STATE = PENDING
PAYMENT_INITIATE_IDEMPOTENCY =
  namespace   payment.initiate
  scope_key   sha256("payment-initiate:{depositObligationId}:{Idempotency-Key}")
  fingerprint sha256 of length-prefixed (obligation amount | BANK_TRANSFER)
  transport   the delivered `Idempotency-Key` header, `parseIdempotencyKey`
  replay      the committed attempt reference
DUPLICATE_INITIATION_RACE = PASS

DEPOSIT_AMOUNT_AUTHORITY = PAYMENT_OBLIGATION
CURRENCY = VND

TRANSFER_REFERENCE =
  ORD + ORDER_CODE_BODY + DC          ^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}DC$, 15 chars
TRANSFER_REFERENCE_PERSISTED = false

MERCHANT_BANK_CONFIG =
  PAYMENT_MERCHANT_BANK_BIN
  PAYMENT_MERCHANT_ACCOUNT_NUMBER
  PAYMENT_MERCHANT_ACCOUNT_NAME
  PAYMENT_MERCHANT_BANK_DISPLAY_NAME
  provider  apps/api/src/modules/payment/config/merchant-bank.config.ts
            (module-scoped, fail-fast factory, no default, no dev shortcut)
REAL_BANK_VALUES_COMMITTED = false

QR_GENERATION  = LOCAL_SERVER_SIDE
QR_ENCODER     = payload: repository-owned EMVCo/NAPAS builder
                 (bank-transfer-qr.payload.ts, incl. CRC-16/CCITT-FALSE)
                 matrix + PNG: qrcode@1.5.4, MIT
QR_REMOTE_NETWORK = NONE
QR_STANDARD_CONFORMANCE = PASS — independent TLV re-parse of every field;
                 CRC verified against the published CRC-16/CCITT-FALSE check
                 value ("123456789" -> 0x29B1); a one-character tamper fails it
QR_IMAGE_DECODE = PASS — PNG -> pngjs -> jsQR -> byte-identical payload,
                 proved both in unit test and over real HTTP
REAL_BANK_APP_SCAN = NOT_EXECUTABLE_IN_AUTOMATED_ENVIRONMENT — kept as an
                 explicit APP7-E01 acceptance item (E01-12)
QR_PERSISTED = false

REQUEST_ACCESS = REUSED
STEP_UP = REQUIRED_FOR_ATTEMPT_INITIATION
NEW_PAYMENT_TOKEN_ARCHITECTURE = NONE

CUSTOMER_PAYMENT_SUCCESS_MUTATION = NONE
EVIDENCE_CAPABILITY   = NOT_IMPLEMENTED
ADMIN_VERIFICATION    = NOT_IMPLEMENTED
PROVIDER_WEBHOOK      = NOT_IMPLEMENTED
IMP-O007 = OPEN

SCHEMA_CHANGE    = NONE
MIGRATION_CHANGE = NONE

OPENAPI_BEFORE = 76 paths / 83 operations / 174 schemas
OPENAPI_AFTER  = 79 paths / 86 operations / 180 schemas
OPENAPI_DELTA  = +3 paths, +3 operations, +6 schemas;
                 816 inserted lines, 0 deleted
API_CLIENT_DELTA = +3 operations (publicOrderDepositCurrent,
                 publicOrderDepositInitiate, publicOrderDepositQr);
                 221 inserted lines, 0 deleted

FOCUSED_TESTS = 7 suites / 145 tests
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-DB01
```

---

## 2. What was delivered, and the one rule behind it

Three customer-secure operations, all `POST`, all reached only through the
`REQUEST_ACCESS` grant APP5 created at submission. The whole checkpoint is one
rule made structural:

> **Nothing a customer can do moves money's state.** The maximum state B03 can
> produce is one `payment_attempts` row at `PENDING`.

That is not only asserted — it is arranged. The write module injects no
`ORDER_REPOSITORY`, no outbox store, no audit repository, no Admin guard and no
provider client, so `SUCCEEDED`, `SATISFIED`, `DEPOSIT_PAID`, a reconciliation
row and a provider event are unreachable from the injector rather than merely
unwritten.

### 2.1 Route shape, and why all three are POST

`ADR-APP4-001` §11 makes the URL fragment the only browser carrier for a secure
token and declares a path or query carrier `FORBIDDEN` with no fallback. That
settles the verb for all three, including the binary one: a `GET …/qr?token=…`
would put a live credential into the Nginx access log, the application request
log, every proxy between, and the `Referer` of any link the page later renders.
So the QR is a `POST` that returns `image/png`, with
`Content-Disposition: attachment` and a fixed filename so the customer still
downloads it.

No route takes a locator. There is no `/public/orders/{orderId}`, no obligation
path and no attempt path — the same reason `APP6-B04` publishes
`/public/quotations/current` and no id route: a public route taking an order id
is an enumeration oracle for other customers' orders.

The directive's candidate paths carried `{orderId}` and used `GET`. Both were
resolved against the repository's delivered conventions, which §3 and §19
explicitly permit.

### 2.2 The QR needs no `attemptId`

`APP7-B03` §8 allows a QR operation without one provided the server still
derives the exact DEPOSIT context. It does: grant → request →
`uq_orders__request` → live DEPOSIT obligation. And the payload (§16) is built
from the merchant configuration, the obligation amount and the derived
reference — **none of which varies by attempt**. An `attemptId` parameter would
have added an enumeration surface and an ownership check to buy nothing.

---

## 3. Changed files

### New runtime — CTX-PAY

| File | Lines | Responsibility |
|---|---:|---|
| `apps/api/src/modules/payment/config/merchant-bank.config.ts` | 107 | The four locked variables, fail-fast, no default |
| `.../domain/deposit/deposit-reference.ts` | 63 | `ORD…DC`, derived, never persisted |
| `.../domain/deposit/bank-transfer-qr.payload.ts` | 171 | EMVCo/NAPAS TLV payload + CRC-16/CCITT-FALSE |
| `.../domain/deposit/deposit-qr.policy.ts` | 49 | Content type, disposition, `no-store`, module scale |
| `.../domain/deposit/deposit-initiate-idempotency.ts` | 93 | `payment.initiate` namespace, scope key, fingerprint |
| `.../domain/deposit/deposit.errors.ts` | 89 | The closed refusal vocabulary and its HTTP mapping |
| `.../infrastructure/qr/bank-transfer-qr.encoder.ts` | 54 | `qrcode` → PNG, and nothing else |
| `.../application/customer/deposit-target.resolver.ts` | 97 | grant → order → DEPOSIT obligation |
| `.../application/customer/customer-deposit.view.ts` | 85 | The customer-safe projection types |
| `.../application/customer/read-deposit.query.ts` | 96 | The zero-write deposit read |
| `.../application/customer/deliver-deposit-qr.query.ts` | 104 | The zero-write QR |
| `.../application/customer/initiate-deposit-attempt.use-case.ts` | 257 | The one transaction |
| `.../presentation/public-order-deposit.controller.ts` | 324 | Read + QR |
| `.../presentation/public-order-deposit-attempt.controller.ts` | 279 | Initiation |
| `.../presentation/schemas/public-order-deposit.request.ts` | 122 | Three `.strict()` bodies, one field each |
| `.../presentation/schemas/public-order-deposit.response.ts` | 220 | Three published response components |
| `.../customer-deposit.module.ts` | 73 | The read boundary (no `DatabaseModule`) |
| `.../customer-deposit-attempt.module.ts` | 70 | The write boundary |

### New runtime — CTX-ORD (one read-only port)

| File | Lines | Responsibility |
|---|---:|---|
| `apps/api/src/modules/order/domain/repositories/order-deposit-context.port.ts` | 57 | `findOrderForRequest` → `{id, code, status}` |
| `.../infrastructure/persistence/drizzle-order-deposit-context.adapter.ts` | 55 | Three columns, named explicitly |
| `.../order-deposit-context.module.ts` | 33 | Exports the one port and nothing else |

### Modified

| File | Change |
|---|---|
| `apps/api/src/bootstrap/app.module.ts` | Registers the two deposit modules |
| `apps/api/src/openapi/operation-id.ts` | Two `CONTROLLER_DOMAIN_KEYS` entries → one `publicOrderDeposit` domain |
| `apps/api/src/openapi/generation-environment.ts` | `applyGenerationMerchantBankEnv` — non-secret placeholders so the artifact can be produced offline |
| `apps/api/test/support/api-integration-context.ts` | `applyMerchantBankTestEnv` + `MERCHANT_BANK_TEST_CONFIG` |
| `apps/api/package.json` | `qrcode` (runtime); `@types/qrcode`, `jsqr`, `pngjs`, `@types/pngjs` (dev) |
| `pnpm-lock.yaml` | One install |
| `.env.example` | The four placeholders, with the naming rule stated |

### Tests (7 suites / 145 tests)

| File | Lines | Kind |
|---|---:|---|
| `.../domain/deposit/deposit-reference.spec.ts` | 93 | unit, Docker-free |
| `.../domain/deposit/bank-transfer-qr.payload.spec.ts` | 172 | unit, Docker-free — standards proof |
| `.../infrastructure/qr/bank-transfer-qr.encoder.spec.ts` | 72 | unit, Docker-free — optical decode proof |
| `.../config/merchant-bank.config.spec.ts` | 125 | unit, Docker-free |
| `.../presentation/public-order-deposit.contract.spec.ts` | 346 | contract, Docker-free |
| `apps/api/test/integration/customer-deposit-read.integration.spec.ts` | 283 | real DB + real HTTP |
| `apps/api/test/integration/customer-deposit-attempt.integration.spec.ts` | 428 | real DB + real HTTP, incl. the race |
| `apps/api/test/support/customer-deposit-fixture.ts` | 381 | test-only fixture |

### Generated

| File | Change |
|---|---|
| `packages/contracts/openapi/openapi.generated.json` | +816 lines, 0 deleted |
| `packages/api-client/src/generated/embroidery-api.ts` | +72 lines, 0 deleted |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | +149 lines, 0 deleted |

Every source file is within the 400-line hard limit and every test file within
600.

---

## 4. Dependency and license evidence

```text
qrcode        1.5.4   MIT           runtime dependency of @embroidery/api
@types/qrcode ^1.5.6  MIT           dev
jsqr          1.4.0   Apache-2.0    dev — the independent decoder
pngjs         7.0.0   MIT           dev — PNG -> RGBA for that decoder
@types/pngjs  ^6.0.5  MIT           dev
```

`qrcode` is a pure-JavaScript encoder. A scan of the whole package for
`require('http'|'https'|'net'|'dns'|'tls')`, their `node:` forms, `fetch(` and
`XMLHttpRequest` returns **nothing**, so `QR_REMOTE_NETWORK = NONE` is a checked
fact rather than a claim. That property is why a hosted generator was excluded:
`APP7-G01` §6 forbids putting the merchant account number and the deposit amount
into a third party's request log, and `vietqr.io` and every other remote
generator fail that rule — not a preference.

The boundary between the two halves is narrow and deliberate. The **payload** —
the EMVCo/NAPAS field structure, the service code, the amount field and the CRC
— is repository-owned code, because it is the part that must be independently
provable and the part a mature package for this exact Vietnamese standard does
not offer offline. `qrcode` only turns the finished string into pixels.

One `pnpm add` for the runtime dependency and one for the dev set; the lockfile
was updated once and not again.

---

## 5. The secure-access chain

```text
secure-link token (body only, never path/query/header)
  → AuthorizeSecureLink            APP4-B06: fail-closed policy, abuse budget, peppered digest
  → ResolvedSecureLink.customRequestId       the grant row, never the caller
  → orders.custom_request_id                 uq_orders__request — exactly one order
  → payment_obligations(kind = DEPOSIT, live)
```

For the **write** the chain is re-established a second time *inside* the
transaction through `ReauthorizeSecureGrant`, under the grant's row lock
(ADR-DB3-004 r9), so a concurrent revoke wins. The pre-transaction admission is
kept as well, and deliberately: it shares `secure_link.resolve`'s abuse budget
with the read and the QR, so a caller cannot escape the budget by spreading token
guesses across the three operations.

No new grant scope, token format, payment link, payment session or customer
account exists. `GRANT_SCOPE_KINDS` stays `['REQUEST_ACCESS']`. No raw token
reaches a QR payload, a payment reference, a response body, a URL, a log or
`payment_attempts`.

**Non-enumeration.** Every unusable token, every request with no order and every
order with no live DEPOSIT obligation leaves as one identical
`404 / SECURE_LINK_UNAVAILABLE` — same status, same code, same message, same
shape. Proved by comparing the three fields of a real "not converted yet" refusal
against a random-token refusal. The "foreign order" case is unreachable by
construction rather than by comparison: there is no order identifier in any body,
so a grant can only ever reach its own order.

---

## 6. The attempt transaction

```text
authorize the secure link         (outside: policy, abuse budget, digest)
begin
  ReauthorizeSecureGrant under the grant row lock
  grant → request → order → live DEPOSIT obligation
  refuse a non-PENDING obligation                       DEPOSIT_NOT_PAYABLE
  claim payment.initiate on (obligation, caller attempt key)
    replay      -> return the committed attempt, write nothing
    in_progress -> DUPLICATE_OPERATION
  resolve a fresh STEP_UP for the grant's customer      GRD-003
    none        -> REVERIFICATION_REQUIRED
  openAttempt   (canonical AGG-16 writer; re-reads the obligation FOR UPDATE
                 and refuses a non-PENDING one — the real arbiter)
  complete the idempotency claim with the replayable result
commit
```

No `try`/`catch` inside the transaction, so no subset can commit. No compensation
path. No network call inside it — QR generation is a separate operation entirely.

**The claim is taken before the step-up**, on `quotation.accept`'s recorded
precedent and for its reason: a replay performs no write, and gating it on a
still-open step-up window would tell a customer retrying after a dropped response
to re-verify in order to be shown an attempt they already opened.

Attempt fields, all server-owned:

```text
payment_obligation_id = the exact DEPOSIT obligation
method                = BANK_TRANSFER
status                = PENDING
amount                = the obligation's own amount, copied
currency_code         = the obligation's own VND, copied
provider_key          = NULL
provider_ref          = NULL
grant_id              = the re-authorized grant
step_up_challenge_id  = the server-resolved STEP_UP (REL-085)
```

The request body carries **only** `token`. There is no `customerId`,
`requestId`, `orderId`, `paymentObligationId`, `stepUpChallengeId`, `grantId`,
`amount`, `currency`, `method`, `providerKey`, `providerRef`, payment reference
or bank field — and the schema is `.strict()`, so naming one is a `400` rather
than a silently-ignored field. Proved: a body naming another customer's fresh
challenge id is refused and creates nothing.

---

## 7. Idempotency scope

```text
namespace   payment.initiate                      DB3_IDEMPOTENCY_SPECIFICATION.md
scope       (the exact DEPOSIT obligation, the caller's attempt key)
scope_key   sha256("payment-initiate:{obligationId}:{key}")
fingerprint sha256( len:amount | len:"BANK_TRANSFER" )
transport   the delivered `Idempotency-Key` header
```

The obligation half stops one client key reaching across orders; the caller half
exists because LC-16 makes a retry a **new** attempt, so only the caller knows
whether a second request is a resend or a deliberate second try. The raw key is
never stored — proved by reading `idempotency_records` back and asserting the
`scope_key` does not contain it.

The header is the delivered transport, validated by the delivered
`parseIdempotencyKey`, so the four surfaces that accept a client key cannot
disagree on what a valid one is. **No second idempotency mechanism was
invented**, and no provider event id exists to key on. `payment.callback` is not
used.

**No active-attempt uniqueness was invented.** Accepted payment authority has
none, and the arbiters are exactly the two that exist: the idempotency claim, and
`openAttempt`'s obligation state predicate under `FOR UPDATE`.

---

## 8. Zero-write proof

The deposit read and the QR are compared against a full snapshot of order status,
both obligations, every attempt, and the reconciliation / provider-event / refund
counts, taken before and after. Repeated calls leave it **deeply equal** —
including `updated_at` on every row, so nothing is touched merely because the QR
was viewed. The grant is not consumed either: it is still `ACTIVE` and still
resolves.

No `assets` row whose kind or storage key mentions QR exists after a QR download.
Object storage is not reached at all: neither deposit module imports an asset or
storage module.

---

## 9. Negative payment-state proof

After `deposit` + `attempts` + `qr` on one order:

```text
payment_attempts.status            PENDING
payment_obligations(DEPOSIT)       PENDING
orders.status                      AWAITING_DEPOSIT
payment_reconciliations            0
```

Across the whole suite database, everything B03 could never produce is genuinely
empty: `REQUIRES_REVIEW` / `REFUNDED` / `PARTIALLY_REFUNDED` attempts `0`, orders
away from `AWAITING_DEPOSIT` `0`, reconciliations `0`, refunds `0`,
`payment_provider_events` `0`. The single `SUCCEEDED` attempt and the single
`SATISFIED` obligation in that database were written **by hand** by the suite, to
set up the "a settled deposit refuses a new attempt" case — and the assertion
names them rather than pretending the tables are empty.

`ck_payment_obligations__satisfied_evidence_required` refused the shortcut of
satisfying an obligation with no evidence, which is the invariant working: the
fixture had to produce a `SUCCEEDED` attempt first.

Retry and terminal semantics:

- same key → same attempt, `replayed: true`, **one** row;
- new key → a second attempt, and the first is still `PENDING` — nothing resets;
- an attempt forced to `FAILED` stays `FAILED` when a retry opens a new one;
- a `SATISFIED` deposit refuses a new attempt with `409 DEPOSIT_NOT_PAYABLE` and
  creates none.

There is no "retry" mutation route, and no code path that updates an existing
attempt.

---

## 10. Race proof

One focused real-database race on the changed path, not the broad payment race
suite:

```text
same DEPOSIT obligation, same Idempotency-Key
two concurrent HTTP requests (Promise.all) — separate pool connections,
separate transactions; no single serialised connection anywhere
->  exactly 1 payment_attempt, PENDING
->  completed payment.initiate claims are unique per scope key
->  obligation still PENDING, order still AWAITING_DEPOSIT
```

Both accepted resolutions are permitted and asserted as such: the loser either
replays the winner's attempt (`201`, `replayed: true`) or is told the operation
is in flight (`409 DUPLICATE_OPERATION`). Neither creates a second attempt.

---

## 11. QR payload fields

Structure (no production values shown):

```text
00 "01"                       payload format indicator
01 "12"                       dynamic — this payload carries an amount
38 merchant account
   00 "A000000727"            NAPAS GUID
   01 beneficiary
      00 <PAYMENT_MERCHANT_BANK_BIN>
      01 <PAYMENT_MERCHANT_ACCOUNT_NUMBER>
   02 "QRIBFTTA"              inter-bank funds transfer, to account
53 "704"                      VND
54 <DEPOSIT obligation amount, whole đồng>
58 "VN"
62
   08 <ORD…DC transfer reference>
63 <CRC-16/CCITT-FALSE, uppercase hex>
```

Tags 59 (Merchant Name) and 60 (Merchant City) are deliberately **absent**.
`QRIBFTTA` is a funds transfer to a named account, the beneficiary is already
identified inside tag 38 by acquirer and account number, and the interoperable
payloads Vietnamese banking applications accept for this service code omit both.
`APP7-B03` §16 admits account-holder information only where the selected standard
requires it; here it would be a second, unauthoritative spelling of a beneficiary
the bank resolves from tag 38. The account-holder **name still reaches the
customer** — in the deposit instructions, where a human reads it and checks it
against their banking app.

The amount is converted to whole đồng by string surgery with an explicit check,
never `Number()`: a non-zero fraction (which
`ck_payment_obligations__amount_currency_scale` forbids anyway) is a refusal
rather than a rounding.

The payload contains no URL, no token, no attempt id, no provider reference and
no customer identity — asserted directly, and structurally true because every
field above is written explicitly and the builder takes exactly four
server-owned inputs.

---

## 12. Merchant bank configuration

A module-scoped fail-fast factory on the delivered `design-session-auth.config.ts`
pattern: read when `CustomerDepositModule` is composed, throw on a missing,
blank or malformed value, no default and no development shortcut. The BIN must be
exactly six digits and the account number 6–19 digits — a BIN with a stray
character produces a QR that scans and then names the wrong bank, which the
customer discovers only after their money has left.

The four names are `APP7-G01`'s, verbatim, and a test asserts that **none of them
contains** `PASSWORD`, `PASSWD`, `SECRET`, `TOKEN`, `KEY`, `CREDENTIAL` or
`PRIVATE`. That is a rule, not a style choice: these values are printed on the
customer's screen and encoded into the QR they scan, so naming one as a secret
would falsely mark a customer-visible fact as a credential and pull it into
`.env-ignore`. They are **not** added there.

No value is interpolated into any error message — asserted, because those
messages reach a startup log. No value reaches an audit detail, an outbox payload
or a response beyond the deposit instructions the customer is meant to read.

`.env.example` carries structurally-valid placeholders only
(`970000` / `0000000000` / `PLACEHOLDER ACCOUNT NAME` / `Placeholder Bank`).
**No write to `.env` was made or attempted; no credential was read or rotated.**
Nothing is stored in PostgreSQL, no migration was added, and no Admin
bank-account CRUD surface exists.

Generation and the offline harnesses needed non-connecting values, exactly as
they already do for the Design Session pepper and object storage — added as
`applyGenerationMerchantBankEnv` / `applyMerchantBankTestEnv`. They fill in only
when a variable is unset, so a deployment that omits one still fails at
composition. The committed OpenAPI artifact contains **neither** the generation
placeholders nor the suite's synthetic account — verified by grep; the only
account-shaped strings in it are the deliberately fake `@ApiProperty` examples.

---

## 13. Boundaries held

| Not implemented | Owner |
|---|---|
| `payment_transfer_evidence`, evidence upload/list/read, a payment intake lane | `APP7-DB01` → `APP7-B05` |
| Admin evidence delivery | `APP7-B06` |
| Verification, review, reconciliation, `SUCCEEDED`, `SATISFIED`, `DEPOSIT_PAID` | `APP7-B04` |
| Provider SDK, `providerKey`/`providerRef` generation, redirect checkout, webhook, signature verification, event ingestion, polling | `IMP-O007`, still **OPEN** |
| Remaining-payment collection (`RM`) | APP9 |
| Inventory reservation, production | APP8 |

The `RM` kind code is reserved by `APP7-G01` §4 and **not** implemented: the
deriving function takes one argument and has no kind parameter, so no APP7 caller
can ask for it. The REMAINING obligation is created by W01, never read by B03,
never projected, and left byte-identical after an initiation — asserted.

`payment_provider_events` stays empty. No Admin controller exists in this
checkpoint. No schema or migration change (36 migrations, unchanged).

`APP7-W01-C1` is untouched: no file under `packages/persistence/src/` was
modified. The canonical `openAttempt` is reused as-is — B03 introduces **no
second payment writer** and no payment SQL of its own. The one new persistence
seam is a read-only Ordering port returning three columns, on the
`CustomRequestQuotationPointerPort` precedent, so the deposit surface can reach
the order without acquiring `ORDER_REPOSITORY` and its `transition()`.

---

## 14. OpenAPI and client

```text
before  76 paths / 83 operations / 174 schemas   (recomputed from git show HEAD)
after   79 paths / 86 operations / 180 schemas
sha256  8c54482613468af07af342386316e07d831b369dc065bd887b2f68d035e27600

new paths       /api/public/orders/deposit
                /api/public/orders/deposit/attempts
                /api/public/orders/deposit/qr
removed paths   []
new operations  publicOrderDeposit_current, publicOrderDeposit_initiate,
                publicOrderDeposit_qr
removed ops     []
changed ops     []   (no existing operationId moved path or method)
new schemas     ReadDepositBody, InitiateDepositAttemptBody, DepositQrBody,
                CustomerDepositResponse, DepositBankInstructionsResponse,
                DepositAttemptResponse
removed schemas []

artifact diff   816 insertions, 0 deletions
client  tree hash 48ee591ef894695cbdc9c78101b6eaaf15dee628c6b346f65199404c99a224e6
        221 insertions, 0 deletions
```

A diff with zero deletions cannot contain unrelated churn.

The client exposes all three truthfully: the two JSON operations return their
concrete envelope types, and `publicOrderDepositQr` returns `Blob` with
`responseType: 'blob'`. The `Idempotency-Key` header is published on the
initiation operation exactly as the three shipped upload lanes publish theirs.

Both classes map onto one `publicOrderDeposit` domain through
`CONTROLLER_DOMAIN_KEYS`, so the module split names no public identifier and the
family reads `_current`, `_qr`, `_initiate`.

---

## 15. Command ledger

| Command / check | Exact B03 question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="payment/(domain/deposit\|config\|infrastructure/qr)"` | Does the reference derive as G01 locked it, does the QR payload decode and pass the standard's own CRC vector, does the encoder round-trip through a real PNG, and does the config fail fast? | PASS — 4 suites / 49 tests | 0 | Ran once after the domain and encoder files; no input changed afterwards. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-order-deposit.contract"` | Does the published document say exactly what B03 claims — three operations, one field per body, a binary QR contract, no forbidden field? | PASS — 61 tests | 2 | First run failed on **one assertion of the spec itself** (the handler was named `qrCode`, so the id was `publicOrderDeposit_qrCode`); the handler was renamed to `qr` — a changed input — and re-run. A third run followed Prettier reformatting. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="customer-deposit-read.integration"` | Against a real database and real HTTP: does the read return the obligation's own amount and the configured account, derive the DC reference, hide REMAINING, write nothing, and does the QR decode to those exact values? | PASS — 16 tests | 1 | First run failed on **fixture setup**, not behaviour: deleting a seeded order violated `fk_order_items__order_id`. The case was re-expressed as a grant on a request that was never converted — the state production actually produces — and re-run. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="customer-deposit-attempt.integration"` | Does initiation create exactly one PENDING BANK_TRANSFER attempt from server facts, require step-up, replay on the same key, refuse a settled deposit, advance no payment state, and leave one attempt under a real concurrent race? | PASS — 19 tests | 1 | First run failed on **three fixture defects** (deleting a challenge an approval snapshot references; satisfying an obligation without the evidence `ck_payment_obligations__satisfied_evidence_required` demands; a count that assumed an empty table). All three were fixture corrections — no runtime code changed — and were re-run once. |
| Combined re-run of all 7 B03 suites | Did Prettier reformatting change any behaviour? | PASS — 7 suites / 145 tests | 0 | One run, after formatting; formatting is the changed input. |
| `pnpm --filter @embroidery/api exec tsc --noEmit -p tsconfig.json` | Do the new runtime and test files typecheck under strict mode? | PASS | 2 | Once after the runtime files, once after the tests — a changed input each time. `tsconfig.json` includes `src/**/*` and `test/**/*`. |
| `npx eslint <33 changed files>` | Do the changed files lint clean? | PASS | 1 | First run reported one `consistent-type-imports` on `HttpException`; the import was made type-only and re-run clean. |
| `npx prettier --check` / `--write` on the changed set | Are the changed files formatted? | PASS after one write | 1 | Seven files reformatted, then the suites re-run once. |
| `pnpm --filter @embroidery/api openapi:generate` | What is the exact published delta? | 79 / 86 / 180 | 0 | One generation, spent after the contract suite was green. No route, decorator or schema input changed afterwards. |
| `pnpm --filter @embroidery/api openapi:check` | Is the committed artifact what the current source produces? | PASS — up to date | 0 | Once, after generation. |
| `pnpm --filter @embroidery/api-client generate` | Does the client expose all three operations truthfully? | 2 files, +221 lines | 0 | One generation. All three present; the QR typed `Blob`. |
| `pnpm --filter @embroidery/api-client check:generated` | Does the committed client match the artifact? | PASS — tree hash `48ee591e…c99a224e6` | 0 | Once, after generation. |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | Does the regenerated client typecheck? | PASS | 0 | Once, after generation. |
| OpenAPI delta script (`git show HEAD:…` vs the new artifact) | Is the delta exactly the three expected paths and nothing else? | new paths the three `/api/public/orders/deposit*`; removed `[]`; new ops the three `publicOrderDeposit_*`; removed `[]`; changed `[]`; new schemas the six; removed `[]` | 0 | Confirmed against `git diff --stat`: **816 insertions, 0 deletions**. |
| `grep` over `apps/api/node_modules/qrcode` for `http`/`https`/`net`/`dns`/`tls`/`fetch`/`XMLHttpRequest` | Does the encoder reach the network at runtime? | No match | 0 | The whole package, not a sample. |
| `grep` for the generation placeholders and the suite account in the artifact and client | Did any bank value leak into a committed file? | 0 matches | 0 | Both generated files checked. |
| `git diff --cached --check` | Any whitespace defect? | clean | 0 | — |

**Not run, by design:** `pnpm quality`, `quality:e2e`, the full Jest run, the full
API suite, the full Payment suite, the Payment **race** suite, the W01 worker
suite, the B02 Admin order suites, the Inventory and Production suites,
Playwright, SonarQube and the Figma checks. B03 changed no file under
`packages/persistence/`, no migration, no worker code and no Admin surface, so
none of those has a changed input. No PASS was re-run on unchanged input.

---

## 16. Risks and limitations

1. **`REAL_BANK_APP_SCAN` is not executed.** A physical scan with a Vietnamese
   banking application cannot be performed by a test process, and simulating one
   would be fabricated evidence. Standards conformance and an optical decode
   round-trip are both `PASS`; the physical scan stays an explicit `APP7-E01`
   item (E01-12). `APP7-G01` §6 requires a standards-compliant local encoding and
   a report-and-stop if one cannot be implemented — it does not require a
   physical scan before B03 completes — so this does not weaken the gate.
2. **Tags 59/60 are omitted** (§11). If a specific acquirer is later found to
   require them, adding them is additive and changes no persisted state — but it
   would need a fifth configuration value for the merchant city, which `APP7-G01`
   did not lock. Recorded here rather than pre-empted.
3. **No attempt projection on the deposit read.** LC-16 defines no "current
   attempt" and nothing bounds live attempts, so none was invented (§14 of the
   directive). `APP7-S01` will therefore render deposit state from
   `orderStatus` + `depositStatus`; if the screen turns out to need an attempt
   fact, the rule that would select one is a decision for the checkpoint that
   needs it.
4. **The race's loser resolution is not pinned to one branch.** Both a replay and
   `DUPLICATE_OPERATION` are correct under the accepted semantics and the suite
   accepts either. Pinning one would assert a scheduling detail, not a contract.

No follow-up is opened: nothing in the checkpoint's scope was left undone.

---

## 17. Commits

```text
3397dec  feat(app7): deliver the customer secure deposit surface (APP7-B03)
<this commit>  docs(app7): record APP7-B03 and advance the roadmap (APP7-B03)

PUSH_STATUS = NOT_PUSHED
```
