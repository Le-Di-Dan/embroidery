# APP7-B02 — Completion Report
## Admin Order Queue + Detail

```text
APP7-B02 = COMPLETE
CHECKPOINT_SCOPE = ADMIN_ORDER_QUEUE_AND_DETAIL
HTTP_OPERATIONS = 2

ORDER_LIST_OPERATION   = GET /api/admin/orders           — adminOrder_list
ORDER_DETAIL_OPERATION = GET /api/admin/orders/{orderId} — adminOrder_detail

ORDER_READ_AUTHORITY   = FROZEN_ORDER_AND_ORDER_ITEM_FACTS
LIVE_CATALOG_REREAD    = NONE
PAYMENT_DETAIL_SURFACE = NOT_IMPLEMENTED

PAGINATION = OPAQUE_KEYSET — @embroidery/persistence encodeCursor/decodeCursor/
             buildPage/resolveLimit; (created_at DESC, id DESC); limit 1..100,
             default 20; over-fetch by one; no OFFSET, no COUNT
FILTERS    = { status } — repeatable, the eleven LC-14 states, no default subset

CATALOG_DETAIL = order root + acceptedQuotationVersionId +
                 currentApprovalSnapshotId + items[] where each item is
                 { position, subjectKind=CATALOG, skuId, productName,
                   variantLabel?, sizeLabel?, quantity, unitPriceAmount,
                   lineTotalAmount, currencyCode, approvalSnapshotId }
COP_DETAIL     = the same shape with subjectKind=CUSTOMER_OWNED,
                 customerOwnedProductId set, skuId / variantLabel / sizeLabel
                 absent, productName = the frozen customer-owned name

SCHEMA_CHANGE    = NONE
MIGRATION_CHANGE = NONE

OPENAPI_BEFORE = 74 paths / 81 operations / 170 schemas
OPENAPI_AFTER  = 76 paths / 83 operations / 174 schemas
OPENAPI_DELTA  = +2 paths, +2 operations, +4 schemas; 600 inserted lines,
                 0 deleted lines; no other path, operation or schema touched
API_CLIENT_DELTA = +2 operations (adminOrderList, adminOrderDetail),
                   +193 inserted lines, 0 deleted; tree hash
                   19e85e84c08316958e07eba41e282557783d2989e3906c5b97db932357433044

FOCUSED_TESTS      = 5 suites / 48 tests, all green
BROAD_REGRESSION   = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-B03
```

---

## 1. What was delivered

Two Admin read operations, and nothing else. No mutation, no payment surface,
no schema change, no worker change, no frontend.

| Operation | Route | operationId | Success code |
|---|---|---|---|
| Queue | `GET /api/admin/orders` | `adminOrder_list` | `ADMIN_ORDER_QUEUE_READ` |
| Detail | `GET /api/admin/orders/{orderId}` | `adminOrder_detail` | `ADMIN_ORDER_DETAIL_READ` |

Both operation ids are what the repository's own policy derives
(`apps/api/src/openapi/operation-id.ts`: `<controllerKey minus Controller,
lower-cased first letter>_<methodKey>`) from `AdminOrderController#list` and
`#detail`. No `CONTROLLER_DOMAIN_KEYS` entry was added and no `operationId` was
hand-written, so nothing overrode the policy to reach these names.

---

## 2. Changed files

### New — runtime

| File | Lines | Responsibility |
|---|---:|---|
| `apps/api/src/modules/order/domain/admin/admin-order-read.errors.ts` | 73 | The two refusals and their HTTP mapping |
| `apps/api/src/modules/order/domain/repositories/admin-order-read.repository.ts` | 111 | The read port and its row types |
| `apps/api/src/modules/order/infrastructure/persistence/drizzle-admin-order-read.repository.ts` | 189 | The Drizzle read adapter (`orders`, `order_items`) |
| `apps/api/src/modules/order/application/admin/admin-order.projection.ts` | 62 | The subject discriminator, derived from the stored XOR |
| `apps/api/src/modules/order/application/admin/read-admin-order-queue.query.ts` | 120 | The queue use case and cursor decoding |
| `apps/api/src/modules/order/application/admin/read-admin-order-detail.query.ts` | 111 | The detail use case |
| `apps/api/src/modules/order/presentation/schemas/admin-order.request.ts` | 84 | Both request schemas (`.strict()`) |
| `apps/api/src/modules/order/presentation/schemas/admin-order-queue.response.ts` | 121 | Queue OpenAPI components + payload type |
| `apps/api/src/modules/order/presentation/schemas/admin-order-detail.response.ts` | 225 | Detail OpenAPI components + payload type |
| `apps/api/src/modules/order/presentation/admin-order.controller.ts` | 242 | The two routes, guard, contract publication |
| `apps/api/src/modules/order/admin-order.module.ts` | 51 | Composition |

### New — tests

| File | Lines | Kind |
|---|---:|---|
| `.../application/admin/admin-order.projection.spec.ts` | 81 | unit, Docker-free |
| `.../presentation/schemas/admin-order.request.spec.ts` | 87 | unit, Docker-free |
| `.../presentation/admin-order.contract.spec.ts` | 308 | contract, Docker-free |
| `.../tests/integration/admin-order-context.ts` | 320 | harness |
| `.../tests/integration/admin-order-queue.integration.spec.ts` | 218 | real DB + HTTP |
| `.../tests/integration/admin-order-detail.integration.spec.ts` | 276 | real DB + HTTP |

Every file is inside the CLAUDE.md §6 limits (source ≤ 400, tests ≤ 600); the
largest source file is 242 lines and the largest test file is 320.

### Modified

| File | Change |
|---|---|
| `apps/api/src/bootstrap/app.module.ts` | `AdminOrderModule` registered, with the reason it imports no `OrderModule` |
| `packages/contracts/openapi/openapi.generated.json` | +600 lines, 0 deleted (generated) |
| `packages/api-client/src/generated/embroidery-api.ts` | +33 lines (generated) |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | +160 lines (generated) |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | Two new `ACTIVE_SCOPED` rows (§8) |

No file under `packages/persistence/src/order/`, `packages/database/`,
`apps/worker/` or any migration directory was touched.

---

## 3. Read-side architecture

```text
AdminOrderController  (2 GETs, AuthenticatedAdminGuard)
  → ReadAdminOrderQueue   → AdminOrderReadRepository.listQueue
  → ReadAdminOrderDetail  → AdminOrderReadRepository.findDetail + .loadItems
        └ DrizzleAdminOrderReadRepository  (orders, order_items — nothing else)
```

`APP7-B02` §10 permits a dedicated read/query seam inside the Order bounded
context, and this is one. It is **not** a second Order authority:

- `OrderRepository` / `DrizzleOrderRepository` / `OrderChainGuard` /
  `OrderPersistenceModule` are unchanged, still in `@embroidery/persistence`
  exactly where `APP7-W01-C1` put them, still resolved by `apps/api`'s
  `OrderModule` and `apps/worker`'s conversion job through the same Symbol
  tokens;
- the new port has three methods and all three are reads. There is no create,
  no transition, no chain check, no outbox append, no lock and no transaction;
- `AdminOrderModule` imports `DatabaseModule` and `IdentityModule` and nothing
  else. It does **not** import `OrderModule`, so `ORDER_REPOSITORY` is not
  resolvable from either route — the same boundary `CustomRequestAdminModule`
  established for the APP5 read surface;
- it imports no `CatalogModule` and no `CustomerModule` either. A module that
  cannot resolve a catalog or customer port cannot re-read live state by
  accident, which is the §3 rule enforced structurally rather than by review.

There was no existing reusable read seam in `@embroidery/persistence` for
`orders` — `OrderRepository.findById`/`loadItems` return the aggregate's own
shapes and live on the write contract — so reusing it would have meant injecting
the writer into a read route. One new port, zero duplicated authority.

---

## 4. Frozen-read proof

`APP7-B02` §3 and §4 are the checkpoint's central rules. Three independent
things enforce them.

**Structural.** `drizzle-admin-order-read.repository.ts` destructures exactly
two tables from `schema` — `orders` and `orderItems` — and contains no
reference to `products`, `product_variants`, `product_sides`,
`embroidery_areas`, `skus`, `quotations`, `quotation_versions`, `design_cases`,
`design_versions`, `approval_snapshots` or `customers`. There is no `sum()`, no
`count()`, no arithmetic and no `join` anywhere in the file.

**Contract.** `admin-order.contract.spec.ts` asserts no published property is
named `productId`, `productVariantId`, `productSideId`, `embroideryAreaId`,
`skuCode`, `basePriceAmount`, `priceOverrideAmount`, `slug` or `categoryId`, and
that every money field is published as `type: string` rather than a number.

**Behavioural, against a real database.** Two regressions in
`admin-order-detail.integration.spec.ts` mutate live Catalog *after* the order
exists and assert the whole response is unchanged:

| Test | Live mutation applied after order creation | Assertion |
|---|---|---|
| `keeps the frozen product name after the live Catalog product is renamed` | `update products set name = 'Renamed After The Order Existed'` | `productName` still `Tee`, `variantLabel` still `Black / M`, and the **entire** detail response equal to the pre-mutation one |
| `keeps the frozen money after the live SKU is repriced and deactivated` | `update skus set price_override_amount = 999999.00, is_active = false` and `update products set base_price_amount = 1.00` | `unitPriceAmount` still `100000.00`, `lineTotalAmount` still `2500000.00`, `totalAmount` still `2550000.00`, and the entire response unchanged |

Both compare the whole object rather than one field, so a projection that
started reading a live row for *any* value would fail them.

A third test proves the total is not re-derived at all. The fixture's accepted
quotation version totals `2550000.00` because it carries a `50000.00` shipping
fee, while its single line totals `2500000.00`. The response reports both, and
asserts they differ — a projection that summed the lines would report
`2500000.00` as the order total and fail.

No production-only test hook was added, and the `APP7-W01` worker is not run:
the fixture seeds the chain with the delivered AGG-15 `seedOrderChain` and
creates the order through `OrderRepository.createFromAcceptedQuotation`, the one
canonical writer, inside a real transaction under GRD-009.

`size_label` is reported as absent on every line, which is the truthful answer:
`approval_snapshots` has no size column, `APP7-W01`'s projection writes null on
both branches, and the only place a size lives is live `product_variants`. A
field with no frozen source is omitted rather than reconstructed (§3).

---

## 5. Pagination proof

`admin-order-queue.integration.spec.ts` seeds five orders, **three of which
share one `created_at` instant** — the case a keyset without a tie-break gets
wrong.

| Proof | Result |
|---|---|
| bounded page size | `?limit=100` returns 5; `?limit=101` and `?limit=0` are 400 |
| default page size | 20 (`resolveLimit`), unbounded dump impossible |
| next-page behaviour | 2 + 2 + 1 across three requests, `hasNext` true, true, false |
| no duplicate / no missing row at the equal-timestamp boundary | the 5 paged ids are 5 distinct ids |
| stable order | the paged walk equals the single-page order, element for element |
| ordering direction | instants descending; the three tied rows in descending `id` order |
| malformed cursor | three shapes (bad base64url, valid base64 of a non-array, a one-member array) each 400 with code `ORDER_CURSOR_INVALID` — never a silent restart at page one |
| empty result | empty `items`, `hasNext` false, no `nextCursor`, 200 not 404 |

The cursor is the delivered opaque `encodeCursor`/`decodeCursor` codec from
`@embroidery/persistence`; no second cursor format was created and no raw SQL
tuple is exposed.

The access path is `ix_orders__status_created_id` — IDX-074, `(status,
created_at DESC, id DESC)`, created by DB5 for exactly this list. The query
filters on the leading column and orders by the following two, so no index was
added and none was needed.

---

## 6. Catalog / COP proof

| Proof | Where |
|---|---|
| Catalog detail returns the frozen order and order-item facts, key set asserted whole | detail suite, `returns a catalog order composed of frozen order and order-item facts` |
| COP detail names `customerOwnedProductId` and fabricates no Catalog identity | detail suite, `returns a customer-owned order without fabricating any Catalog identity` — asserts `skuId`, `variantLabel` and `sizeLabel` are **absent** keys, and that the serialized response contains neither the fixture's `skuId` nor its `productId` anywhere |
| several lines keep their frozen `position` order | detail suite, `returns several lines in their frozen position order` — three lines inserted 3, 1, 2 come back 1, 2, 3, with a COP line between two catalog lines |
| the discriminator is derived, never asserted | `admin-order.projection.spec.ts` — both branches map correctly, and a row naming **both** or **neither** subject is refused rather than letting one branch win |

The COP fixture is a genuine customer-owned chain, not a catalog one relabelled:
a `customer_owned_products` row, a `design_versions` row on the COP branch of
`ck_design_versions__exactly_one_placement_branch` (all four Catalog placement
columns null, both placement labels present) and an `approval_snapshots` row on
the COP branch of `ck_approval_snapshots__exactly_one_placement_branch`.

`subjectKind` is a **response-only** discriminator derived from the stored XOR.
No column, enum or constraint was added to the database for it, and it reuses
the vocabulary the delivered Admin convention already publishes
(`AdminCustomRequestQueueItemResponse.subjectKind`: `CATALOG` |
`CUSTOMER_OWNED`).

---

## 7. Security and error behaviour

`AuthenticatedAdminGuard` — the exact APP1 guard `GET /api/staff/me` and every
Admin catalogue, request and customer-support route already use. No cookie is
parsed here, no session looked up, no caller-supplied Admin id accepted, and no
role or permission vocabulary was invented. Both suites present a **real**
session cookie against a **real** `admin_sessions` row and override no guard, so
the refusals are produced by the production code path.

| Case | Answer | Code |
|---|---|---|
| no cookie | 401 | platform |
| a token no session was ever minted for | 401 | platform |
| unknown `orderId` | 404 | `ORDER_NOT_FOUND` |
| malformed `orderId` (`ORD-7K3MPQ2XVD`) | 400 | platform validation |
| malformed cursor | 400 | `ORDER_CURSOR_INVALID` |
| unknown status value | 400 | platform validation |
| unknown query parameter (`paymentState`, `productName`) | 400 | platform validation (`.strict()`) |

Both routes send `Cache-Control: no-store`, asserted in both suites. The
feature's error translator catches **only** `AdminOrderReadError`; a
`PersistenceError` propagates to the platform filter that sanitises it, so no
SQLSTATE, constraint name or query text can be shaped into a response by this
feature.

The contract suite asserts no B02 schema contains `tokenHash`, `tokenDigest`,
`storageKey`, `objectKey`, `bucket`, `sessionSecret`, `secretHash`,
`idempotencyKey` or `grantToken` anywhere — name, description or example — and
that no published **property name** contains `payment`, `obligation`, `attempt`,
`transferreference`, `evidence`, `provider`, `reconcil`, `qr`, `bankaccount`,
`inventory` or `production`. A runtime test repeats the payment half against a
real `DEPOSIT_PAID` order's serialized response.

---

## 8. Validation ledger

Every command below was run from the repository root. No PASS was re-run
without a changed input.

| Command / check | Exact B02 question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-order[.](projection[.]spec\|request[.]spec\|contract[.]spec)"` (`CMD-TEST-APP7-B02-UNIT`) | Does the subject discriminator read the XOR, is the filter set closed, and does the published document say what B02 claims? | PASS — 3 suites / 28 tests | 2 | First run failed on two assertions **of the spec itself** (the platform `X-Request-ID` header parameter, and the word "evidence" appearing legitimately in an approval-snapshot description); the spec was corrected — the contract was not — and re-run. A third run followed the ESLint fix to the queue suite, a changed input. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-order-(queue\|detail)[.]integration"` (`CMD-TEST-APP7-B02-INTEGRATION`) | Against a real database: does the queue page stably, does the detail return frozen Catalog and COP facts, and does live Catalog drift move the response? | PASS — 2 suites / 20 tests | 2 | Queue suite first run failed on one assertion of the **error envelope shape** (`body.error.code` vs the canonical top-level `body.code`); the assertion was corrected and re-run. A second queue run followed the ESLint fix, a changed input. Detail suite passed first time and was re-run once only as part of the final combined pattern check. |
| `pnpm --filter @embroidery/api exec tsc --noEmit -p tsconfig.json` | Do the new runtime and test files typecheck under strict mode? | PASS | 2 | Run once after the runtime files and once after the tests — a changed input each time. `tsconfig.json` includes `src/**/*`, so the specs are covered. |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit -p tsconfig.json` | Does the regenerated client typecheck? | PASS | 0 | Run once, after generation. |
| `pnpm --filter @embroidery/api openapi:generate` (`CMD-OPENAPI-GENERATE`) | What is the exact published delta? | 76 / 83 / 174 | 0 | One generation, spent after the contract suite was green. No route, decorator or schema input changed afterwards, so no second generation was needed. |
| `pnpm --filter @embroidery/api openapi:check` (`CMD-OPENAPI-CHECK`) | Is the committed artifact what the current source produces? | PASS — up to date | 0 | Run once after generation. |
| `pnpm --filter @embroidery/api-client generate` (`CMD-API-CLIENT-GENERATE`) | Does the client expose both operations? | 2 files, +193 lines | 0 | One generation. `adminOrderList` and `adminOrderDetail` present with their query and response types. |
| `pnpm --filter @embroidery/api-client check:generated` (`CMD-API-CLIENT-CHECK`) | Does the committed client match the artifact? | PASS — tree hash `19e85e84…3044` | 0 | Run once after generation. |
| `npx prettier --check <18 changed files>` | Are the changed files formatted? | PASS | 2 | First check reported 4 files; `--write` fixed them and the re-check passed. A third check followed the ESLint fix, a changed input. |
| `pnpm --filter @embroidery/api exec eslint <18 changed files>` | Do the changed files lint clean? | PASS | 2 | First run reported one `no-unnecessary-type-assertion`; removing the assertion produced `no-unsafe-assignment` on the same line, so the assertion was replaced with explicit key-by-key assertions and a whole-key-set check. Re-run clean. |
| `git diff --check` | Any whitespace damage? | PASS — no output | 0 | Run once, before commit. |
| OpenAPI delta script (`node -e`, `git show HEAD:…` vs the new artifact) | Is the delta exactly the two expected paths and nothing else? | new paths `['/api/admin/orders', '/api/admin/orders/{orderId}']`; removed paths `[]`; new ops the two `adminOrder_*`; removed ops `[]`; new schemas the four `AdminOrder*`; removed schemas `[]` | 0 | Confirmed against `git diff --stat`: **600 insertions, 0 deletions** — no unrelated churn is possible in a diff with no deleted lines. |

### Not run, by design (`APP7-B02` §21.4)

`pnpm quality`, `quality:e2e`, the full Jest run, the full API suite, the full
Order suite, the W01 worker suite, the CC-11 race, the payment suites, the
inventory and production suites, Playwright and SonarQube. B02 changed no input
to any of them: canonical Order persistence, the chain guard, the worker, the
database schema and every migration are untouched.

---

## 9. Acceptance criteria

| # | Criterion | Status |
|---:|---|---|
| 1 | Exactly 2 new Admin GET operations | ✅ contract suite asserts the whole set under `/api/admin/orders` |
| 2 | One is Order queue/list | ✅ `adminOrder_list` |
| 3 | One is Order detail | ✅ `adminOrder_detail` |
| 4 | No third operation | ✅ asserted, and the OpenAPI delta is +2 |
| 5 | Both Admin-only | ✅ `AuthenticatedAdminGuard`, 401 proved twice per route |
| 6 | No mutation behaviour | ✅ two query collaborators; `ORDER_REPOSITORY` unreachable from the module |
| 7 | List bounded | ✅ 1..100, default 20 |
| 8 | Pagination stable/deterministic | ✅ equal-timestamp boundary proved |
| 9 | Cursor follows existing Admin convention | ✅ the shared `encodeCursor`/`decodeCursor` codec |
| 10 | No speculative filter set | ✅ `{ status }` only; closed-key assertion |
| 11 | Deterministic OrderItem position order | ✅ 3,1,2 in → 1,2,3 out |
| 12 | Catalog detail uses frozen facts | ✅ |
| 13 | COP detail uses truthful frozen identity | ✅ |
| 14 | COP fabricates no Catalog identity | ✅ absent keys **and** absent ids in the serialized response |
| 15 | No live Product/Variant/Side/Area reconstruction | ✅ structural, contract and behavioural |
| 16 | Current SKU price unused | ✅ reprice regression |
| 17 | No latest/current quotation heuristic | ✅ only the frozen `accepted_quotation_version_id` column is read |
| 18 | Frozen money returned without recomputation | ✅ total ≠ line sum, asserted |
| 19 | No live customer/profile substitution | ✅ `customerId` only; no `CustomerModule` |
| 20 | No payment attempt/reconciliation/evidence exposed | ✅ contract and runtime assertions |
| 21 | B04 payment surface not duplicated | ✅ no third endpoint, no payment field |
| 22 | W01 Order persistence / GRD-009 unchanged | ✅ no file under `packages/persistence/src/order/` touched |
| 23 | No Order write implementation duplicated | ✅ the new port has three read methods |
| 24 | No schema/migration change | ✅ |
| 25 | OpenAPI publishes a truthful 2-op contract | ✅ |
| 26 | Generated client exposes both | ✅ |
| 27 | No unrelated OpenAPI churn | ✅ 600 insertions, 0 deletions |
| 28 | Frozen-data real-DB regression passes | ✅ two of them |
| 29 | Catalog detail focused test passes | ✅ |
| 30 | COP detail focused test passes | ✅ |
| 31 | Queue/pagination focused test passes | ✅ |
| 32 | Auth/error focused API tests pass | ✅ |
| 33 | Affected typechecks pass | ✅ `@embroidery/api`, `@embroidery/api-client` |
| 34 | Changed files lint/format clean | ✅ |
| 35 | No broad regression | ✅ §8 |
| 36 | No PASS rerun without changed input | ✅ every rerun named in §8 |
| 37 | Nothing pushed | ✅ `PUSH_STATUS = NOT_PUSHED` |
| 38 | Completion report exists | ✅ this file |
| 39 | Roadmap marks B02 COMPLETE | ✅ |
| 40 | Exactly one Next = `APP7-B03` | ✅ |

---

## 10. Limitations and notes for the Product Owner

1. **`sizeLabel` is always absent today.** Not a B02 defect: `APP7-W01` writes
   `size_label` null on both branches because no frozen source for it exists.
   The field is published as optional so it stays truthful if a later checkpoint
   gives the conversion an authoritative size. `APP7-A01` should not render a
   size for an order line.
2. **The queue has one filter.** If the `APP7-D01` design establishes an
   operator need for a code lookup or a date-range filter, it is a small,
   index-backed addition (`uq_orders__code`, IDX-074) — but no accepted
   authority requires one today, so none was added (§5, §24).
3. **`holdReason`, `cancelledReason`, `deliveredAt` and `completedAt` are not
   published.** They are order-owned columns, but they are evidence for LC-14
   transitions APP9 owns; publishing a shape for them now would fix a contract
   before the checkpoint that fills it exists.
4. **No index was added and none was found missing.** The queue's predicate and
   ordering match IDX-074 exactly; the detail reads by primary key and by
   `order_id` under `uq_order_items__order_position`.

---

## 11. Commits

```text
c3c4f2a feat(app7): publish the Admin order queue and detail (APP7-B02)
        apps/api (18 files), packages/contracts, packages/api-client,
        docs/implementation/SCOPED_COMMAND_INDEX.md

<commit B> docs(app7): record APP7-B02 and advance the roadmap (APP7-B02)
        this report + the phase roadmap

PUSH_STATUS = NOT_PUSHED
```

---

```text
APP7-B02 = COMPLETE
NEXT = APP7-B03 — Customer deposit read, BANK_TRANSFER attempt initiation,
       QR delivery (3 operations, depends on W01)
```
