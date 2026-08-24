# APP7-E01-U01 — Unblock Report

- Phase: `APP7 — Deposit Payment and Order Creation`
- Parent checkpoint: `APP7-E01`
- Mode: `NARROW BLOCKING-UNBLOCK / DEV TOPOLOGY + MANUAL ACCEPTANCE PREPARATION`
- Correction: **NO** — this is not `APP7-E01-C1`
- Branch / HEAD at entry: `production` @ `11e1a6d`
- Date: 2026-08-24

---

## A. Verdict

```text
APP7-E01-U01 = READY_FOR_MANUAL_QR_SCAN

DEV_COMPOSE_MERCHANT_WIRING = PASS

API_MERCHANT_ENV_KEYS = 4 / 4
STAFF_BOOTSTRAP_MERCHANT_ENV_KEYS = 4 / 4

B03_FAIL_FAST_BEHAVIOR = PRESERVED

REAL_MERCHANT_ENV_PRESENT = true
REAL_MERCHANT_ENV_SHAPE_VALID = true
REAL_VALUES_COMMITTED = false
REAL_VALUES_PRINTED = false

QR_OPERATION = publicOrderDeposit_qr
QR_HTTP = 200
QR_CONTENT_TYPE = image/png
QR_PNG = packages/e2e-testing/.e2e-state/app7-e01-qr-scan.png

QR_USES_REAL_MERCHANT_DESTINATION = true
QR_USES_SYNTHETIC_CUSTOMER_ORDER_DATA = true

E01_AUTOMATED_REEXECUTED = false

REAL_BANK_APP_SCAN = PENDING_PRODUCT_OWNER
TRANSFER_SUBMITTED = false

APP7-E01 = NOT COMPLETE
APP7-X01 = NOT READY

NOT_PUSHED
```

---

## B. Operator prerequisite

Checked by **name and shape only**. No value was read into any output, log,
artifact or this report, and `.env` was **not** edited.

```text
PAYMENT_MERCHANT_BANK_BIN            present = true
PAYMENT_MERCHANT_ACCOUNT_NUMBER      present = true
PAYMENT_MERCHANT_ACCOUNT_NAME        present = true
PAYMENT_MERCHANT_BANK_DISPLAY_NAME   present = true

MISSING_VARIABLES = (none)
shape valid       = true   (decided by the production `loadMerchantBankConfig`)
is the .env.example placeholder set = false
```

Shape is judged by the **delivered loader**, not by a second opinion in the
harness: if `loadMerchantBankConfig` accepts the values, the deposit surface
composes; if it refuses, its message names the variable and never the value.
Confirming the values are not `.env.example`'s placeholders is what makes
`QR_USES_REAL_MERCHANT_DESTINATION = true` a fact rather than an assumption.

---

## C. Development Compose wiring repair (`FU-APP7-E01-DEV-COMPOSE-MERCHANT-01`)

### C1. Which services actually needed it

Repository inspection, not assumption — the criterion is *directly composes the
API `AppModule`*, because `MERCHANT_BANK_CONFIG` is a module-scoped fail-fast
provider inside `CustomerDepositModule`:

| dev service | composes `AppModule`? | wired |
|---|---|---|
| `api` | yes — `dist/main.js` → `AppModule` | **yes** |
| `staff-bootstrap` | yes — `NestFactory.createApplicationContext(AppModule)` | **yes** |
| `worker` | no — `WorkerModule` imports no payment module | no |
| `db-migrate` | no — runs the `@embroidery/database` CLI | no |
| `gateway`, `storefront`, `admin`, `postgres`, `minio`, `sonarqube*` | no | no |

`docker-compose.debug.yml` adds only port publications, and
`docker-compose.smoke.yml` layers on top of the dev file, so both inherit the
new anchor without a change of their own.

### C2. The change

One new YAML anchor beside the existing three, applied to exactly two services:

```yaml
x-merchant-bank-env: &merchant-bank-env
  PAYMENT_MERCHANT_BANK_BIN: ${PAYMENT_MERCHANT_BANK_BIN:-}
  PAYMENT_MERCHANT_ACCOUNT_NUMBER: ${PAYMENT_MERCHANT_ACCOUNT_NUMBER:-}
  PAYMENT_MERCHANT_ACCOUNT_NAME: ${PAYMENT_MERCHANT_ACCOUNT_NAME:-}
  PAYMENT_MERCHANT_BANK_DISPLAY_NAME: ${PAYMENT_MERCHANT_BANK_DISPLAY_NAME:-}
```

`${VAR:-}` is this file's existing convention for a value that must come from
runtime configuration with **no fallback** — `DESIGN_SESSION_SECRET_PEPPER` and
the three APP4 values are written exactly this way. It supplies an empty string
rather than a value, and the loader rejects an empty string, so the failure is
still B03's own and still names the variable.

No default bank, no fallback account, no optional merchant config, no
development-only runtime fallback and no remote QR fallback was introduced.

### C3. `.env.example`

Already carries all four names with structurally valid placeholders and a
comment stating they are intentionally not a real account. **Left unchanged**, as
§3 requires.

### C4. Rendered-config proof (names only)

```text
$ pnpm docker:dev:config      # names extracted; no value printed

api:              4 / 4 PAYMENT_MERCHANT_* keys wired
staff-bootstrap:  4 / 4 PAYMENT_MERCHANT_* keys wired
services with any merchant key: api, staff-bootstrap
```

Before this change the same command returned `0` occurrences of
`PAYMENT_MERCHANT` — the finding `APP7-E01` recorded.

### C5. Fail-fast preserved

```text
loadMerchantBankConfig({})                       -> throws
loadMerchantBankConfig(all four = "")            -> throws
refusal names only the variable                  -> true
```

The second case is the exact substitution `${VAR:-}` produces when the operator
has not set the value, so "missing env → existing fail-fast remains" is proved
against the real interpolation result rather than against an absent key.

---

## D. Bounded development startup proof

The smallest subset that answers *can the development API start with the real
local merchant env?*

Two facts were discovered first, and both are worth recording because they are
why a wiring-only change would not have proved anything:

1. `embroidery-dev-api-1` had been `Up 2 days (unhealthy)` — the defect in the
   wild, though its immediate symptom was a stale watch-mode compile.
2. The `embroidery-dev-api` **image** predated APP6/APP7: its baked workspace
   packages had no `PaymentPersistenceModule`, no `PAYMENT_RECONCILIATION_ACTIONS`
   and no `qrcode`. Only `apps/api/src` is bind-mounted, so a recreate alone left
   83 compile errors. A rebuild of the two images was therefore part of the
   proof, not a convenience.

```text
$ node tools/docker-dev.mjs build api
$ node tools/docker-dev.mjs up -d --force-recreate --no-deps api
RESULT api health = healthy after ~25 s      (bounded wait, 40 × 5 s ceiling)

api container log:  "Nest application successfully started"
                    "API listening on port 4000 (development)"
                    payment routes mapped, including
                      POST /api/public/orders/deposit/qr
                      POST /api/admin/payment-attempts/:attemptId/verify
                      GET  /api/admin/payment-evidence/:evidenceId/content
GET /api/health  -> 200 {"status":"ok","service":"api"}
occurrences of "PAYMENT_MERCHANT" in the api log = 0
```

`staff-bootstrap` is a required one-shot in the normal dev flow (`admin` depends
on `service_completed_successfully`), so it was proved too — only as needed:

```text
$ node tools/docker-dev.mjs build staff-bootstrap
$ node tools/docker-dev.mjs up --no-deps --force-recreate staff-bootstrap
[StaffBootstrap] result=REUSED_EXISTING
exit code = 0
```

No application test suite was run. Dev-stack state afterwards: `api` healthy,
`staff-bootstrap` exited 0, everything else untouched and healthy. The
developer's stack is left in a **better** state than it was found in; the two
rebuilt images are the developer's own and are reused, not residue.

---

## E. Scan-only QR preparation

### E1. The command

```text
pnpm --filter @embroidery/e2e-testing app7:e01:qr-scan-prepare
   -> node scripts/run-e2e.mjs --app7-qr-scan
```

A non-Playwright mode, like `--app4`, that short-circuits before any project,
hostname or browser machinery. It performs §8's ten steps in order:

1. reads the four values from `.env` and judges them with the production loader
   — presence and shape only, and it stops with
   `WAITING_FOR_OPERATOR_MERCHANT_ENV` plus the **names** of anything missing;
2. starts the lean topology — ephemeral PostgreSQL and MinIO, a disposable
   database with the schema baseline proved, and the real API HTTP process
   carrying the **real merchant destination** and this run's ephemeral APP4
   secret universe;
3. establishes one synthetic Order and `DEPOSIT` obligation through the smallest
   truthful path: the APP6 hand-off fixture, then the **real** `design.approved`
   conversion through the production consumer. No order, obligation or amount is
   written by hand;
4. mints a real secure link through the production `SecureGrantIssuer`;
5. calls the real `publicOrderDeposit_qr` over real HTTP;
6. asserts `200` and `image/png`;
7. writes one PNG;
8. prints booleans, the status, the content type and the local path — nothing
   else;
9. tears down the disposable database, both containers and the API process;
10. leaves the PNG in place.

The delivered `PublishApp4PolicyUseCase` is called on a real resolved Admin
before the grant is minted, because `SecureGrantIssuer` reads a published grant
policy and the lean topology does not run the `staff-bootstrap` CLI that
normally publishes it. The policy **values** are production's — nothing is
invented — and this is the precedent `APP6-E01`'s harness set.

No encoder helper was called directly, no EMVCo/NAPAS payload was constructed by
hand, and no remote QR generator was contacted.

### E2. Result

```text
merchant env present      = true
merchant env shape valid  = true
QR HTTP                   = 200
QR content type           = image/png
QR PNG bytes              = 2991
order is AWAITING_DEPOSIT = true
deposit is PENDING        = true
QR PNG path               = packages/e2e-testing/.e2e-state/app7-e01-qr-scan.png
```

### E3. What the PNG contains

```text
REAL      merchant bank / account   (the operator's own .env)
SYNTHETIC customer, order, deposit  (a disposable acceptance chain)
SYNTHETIC deposit amount
SYNTHETIC transfer reference        (derived by real APP7 code from the order code)
```

No real customer data. No transfer. The whole acceptance context was dropped
with the run.

### E4. Structural pre-check (no value disclosed)

The PNG was decoded and re-parsed with a TLV reader, reporting **tag ids only**:

```text
decoded                  = true
PNG magic valid          = true
top-level tags           = 00, 01, 38, 53, 54, 58, 62, 63
tag 38 sub-tags          = 00, 01, 02
tag 62 sub-tags          = 08
parses cleanly to CRC 63 = true
lowercase letters in payload = false
contains an http(s) URL  = false
encodes the configured bank BIN        = true
encodes the configured account number  = true
encodes the .env.example placeholder   = false
```

Every byte is accounted for by the TLV parse, which terminates at the CRC tag —
so there is no extra field, and in particular no secure-link token, attempt id or
application URL. (A first, naive `[A-Za-z0-9_-]{43}` sweep reported a "token"
match; it is a false positive — any 129-character uppercase-and-digit TLV string
contains a 43-character run of that class. The structural parse above is the
answer that actually means something, and the absence of any lowercase letter is
a second, independent reason a base64url token is not in there.)

This is a **pre-check, not the gate**. Only the Product Owner's banking
application can confirm the payload is interoperable.

---

## F. PNG handling

```text
path            = packages/e2e-testing/.e2e-state/app7-e01-qr-scan.png
git-ignored by  = packages/e2e-testing/.gitignore:5  (".e2e-state/")
appears in `git status` = false
committed       = false
git-added       = false
copied to docs  = false
embedded in a report = false
```

Verified with `git check-ignore -v` and `git status --short`. It carries the real
merchant destination and must not leave this machine.

---

## G. Secrecy

Disclosed anywhere in this report or in any command output: **nothing but
booleans, an HTTP status, a content type, a byte count, tag ids and a local file
path.**

Withheld, and never printed, logged, cached or committed: the bank BIN, the
account number, the account holder, the bank display name, the deposit amount,
the transfer reference, the decoded QR payload, any base64 of the QR, the
secure-link token and the disposable database password (the orchestrator redacts
its own URL).

---

## H. Files changed

| File | Change |
|---|---|
| `infrastructure/compose/docker-compose.dev.yml` | new `x-merchant-bank-env` anchor; applied to `api` and `staff-bootstrap` |
| `packages/e2e-testing/support/app7/app7-qr-scan-prepare.mjs` | **new** — the scan-only preparation |
| `packages/e2e-testing/scripts/run-e2e.mjs` | the `--app7-qr-scan` non-Playwright mode |
| `packages/e2e-testing/support/app4/app4-environment.mjs` | optional `extraEnv`, so the lean topology can carry the merchant destination |
| `packages/e2e-testing/package.json` | `app7:e01:qr-scan-prepare` |

Untouched, as §13 requires: `apps/api` payment/order runtime logic, the B03 QR
encoder, Admin and Storefront runtime, database schema and migrations, OpenAPI
and the generated client, Figma, and `.env`.

`.env.example` untouched (it already carried the four placeholders).

---

## I. Validation ledger

| Command | Scope | Result |
|---|---|---|
| merchant `.env` inspection (names + production loader) | operator prerequisite | present 4/4, shape valid |
| `pnpm docker:dev:config` | rendered Compose, key names only | `api` 4/4, `staff-bootstrap` 4/4 |
| `loadMerchantBankConfig({})` and all-empty | fail-fast preservation | throws in both, names the variable |
| `node tools/docker-dev.mjs build api` + `up --force-recreate --no-deps api` | bounded dev startup | **healthy in ~25 s**, `/api/health` 200 |
| `node tools/docker-dev.mjs build staff-bootstrap` + `up --no-deps` | required one-shot | **exit 0** |
| `pnpm --filter @embroidery/e2e-testing app7:e01:qr-scan-prepare` | scan-only QR | **200 / image/png / 2991 bytes** |
| `pnpm --filter @embroidery/e2e-testing lint` | scoped ESLint | PASS |
| `pnpm --filter @embroidery/e2e-testing typecheck` | scoped typecheck | PASS |
| `pnpm --filter @embroidery/e2e-testing check:e2e` | E2E boundary + collection | PASS |
| `npx prettier --write` (changed harness files) | scoped Prettier | applied |
| `git diff --check` | whitespace | clean |
| `git status` / `git check-ignore` | PNG never staged | confirmed |

Not run, by instruction: `pnpm quality`, `quality:e2e`, the full E01 aggregate,
any Playwright project, B03/B04/B05, A01/S01, OpenAPI generation, database gates,
Figma, SonarQube.

```text
E01_AUTOMATED_REEXECUTED = false
```

No PASS was re-run on unchanged input.

---

## J. Git

```text
branch = production
HEAD at entry = 11e1a6d
pushed = false
QR PNG committed = false
B03 / E01 commits amended = false
```

One narrow commit:

```text
fix(app7): wire merchant bank config into development topology (APP7-E01-U01)
```

---

## K. The one human gate

Everything §16 requires is done: wiring PASS, bounded startup PASS, real merchant
env present, real QR generated, PNG available, this report written.

`APP7-E01` is **not** finalized here and `APP7-X01` is not started. After the
Product Owner replies `PASS`, a separate finalization directive records the
manual gate and closes E01.
