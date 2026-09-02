# APP12-B01 — Public Purchasable SKU Projection

Checkpoint: `APP12-B01 — Public purchasable SKU projection`
Phase: `APP12 — Hardening, UAT and Production Readiness`
Date: 2026-09-02

---

## A. Verdict

```text
APP12-B01 = COMPLETE

BUYABLE_SUBJECT              = SKU
operation                    = publicProductVariant_list  (extended)
new_HTTP_operations          = 0
APP5_variant_semantics       = PRESERVED
public_GET_mutations         = 0
migrations                   = 38 (delta 0)
DB_schema_delta              = 0
```

`APP12-C03` remains `COMPLETE`. The roadmap remains `LOCKED` at 38 checkpoints.
Exactly one checkpoint is `NEXT`: `APP12-B02`.

---

## B. Preflight

Measured against the delivered source before any edit.

| Question | Answer found in the repository |
| --- | --- |
| Existing operation | `GET /api/public/products/:slug/variants`, `publicProductVariant_list`, generated `publicProductVariantList` |
| Delivered response | `{ productId, variants: [{ productVariantId, colorName, sizeLabel }] }` |
| Variant inclusion rule | `product_variants.is_active = true`, applied **in the statement**, ordered `display_order, id` |
| Publication predicate | `products.status = 'PUBLISHED'` + public category + `categories.archived_at IS NULL`, all in the SQL |
| SKU cardinality per variant | **Not 1.** `skus` has only `ix_skus__variant`; `product-sku.policy.ts` caps the *order-eligible* set at 1 **on the write side** (`MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT`), and is explicit that resolution never picks a member of the set |
| SKU eligibility | `skus.is_active`, named `SKU_ORDER_ELIGIBLE_IS_ACTIVE` |
| Price columns | `skus.price_override_amount` (nullable) + `skus.currency_code`; `products.base_price_amount` + `products.currency_code`. Both `numeric(14,2)` with per-row currency CHECKs |
| Public money wire convention | `PublicPriceResponse { amount: string, currency }` via `toPublicPrice()` → `toWholeDong()` — already used by `publicProduct_list` and `publicProduct_detail` |
| Inventory availability authority | `StockAnchor.availability()` in `@embroidery/persistence`: `quantity_on_hand − Σ HELD − Σ RESERVED` |
| Active-status constants | **None existed.** `'HELD'` / `'RESERVED'` were bare literals in `stock-anchor.ts` |
| Missing stock row behaviour | `loadForUpdate` returns `undefined`; `requireLocked` throws. Provisioning is `ensureStockRow`, a `@requiresTransaction` **writer** |
| Cross-module inventory read precedent | `ORDER_RESERVATION_SUMMARY_PORT` + `OrderReservationSummaryModule` (`APP8-B03` §8.4) — one read-only port on its own module |
| Generated-client consumers | Curated re-export in `packages/api-client/src/custom-requests.ts`; runtime consumers are four APP5 Storefront files |
| D01 purchase design | Centred purchase panel: price line, variant fieldset, size fieldset "that resolves the SKU", **44px quantity stepper**, availability beneath it, `OUT_OF_STOCK` panel variant |
| Release-gate position | `publicProductVariant_list` is already in `WAVE1_RELEASED_PUBLIC_OPERATIONS` |
| Business authority | `BR-021` (price), `BR-022` (availability, and `is_display_out_of_stock` is presentation only), `BR-024` (reservation at order creation) |

---

## C. Operation decision

**The existing operation was extended. `new_operations = 0`.**

The roadmap allows up to two related operations. None was needed, and adding one
would have been worse rather than merely unnecessary:

- The resource is the same resource. "The variants of this published product"
  and "what of this product can be bought" are answered from the same product
  row, the same publication predicate and the same variant set. A second
  operation would re-derive all three, and the day one changed, the Storefront
  would render a variant the other endpoint refuses to price.
- `APP12-D01`'s purchase panel is a **variant fieldset plus a size fieldset that
  resolves the SKU**. That is one selector over one list; two endpoints would
  make `APP12-S01` correlate two responses and hope they agree about which
  product they describe — the exact problem `productId` was put on this response
  to avoid.
- Nothing about the existing shape is incoherent under the addition. A variant
  gaining a list of its own SKUs is composition, not a change of subject.

---

## D. Response contract

Additive. The three `APP5-B07` fields are untouched; one array is added beside
them.

```text
{
  productId,
  variants: [
    {
      productVariantId,          // unchanged
      colorName,                 // unchanged
      sizeLabel,                 // unchanged
      skus: [                    // APP12-B01
        {
          skuId,
          unitPrice: { amount, currency },   // PublicPriceResponse
          availableQuantity
        }
      ]
    }
  ]
}
```

`unitPrice` is the existing `PublicPriceResponse`, not a new money shape: whole
đồng as a decimal string through `toWholeDong()`, never a JSON number, with the
currency beside it. A price therefore means the same thing and is shaped the same
way wherever the public catalog states one.

Semantics recorded in the contract and in the code:

| Reading | Meaning |
| --- | --- |
| `skus` empty | Nothing Ready-Made can sell here. The variant is still returned |
| `skus` non-empty | A SKU exists that Ready-Made could sell |
| `availableQuantity > 0` | Purchasable right now |
| `availableQuantity == 0` | A normal read state, not an error — the `APP12-D01` `OUT_OF_STOCK` panel |

Publishing a zero rather than dropping the SKU is what lets `OUT_OF_STOCK` be
told apart from "this variant was never sellable".

**Exact quantity, not a boolean** (§13). `APP12-D01` places a 44px quantity
stepper with availability stacked beneath it. A stepper needs a truthful maximum;
a boolean would force `APP12-S01` to guess a ceiling or invent scarcity copy.

---

## E. APP5 compatibility

```text
APP5_variant_semantics_preserved = true
```

- The variant list is unchanged in membership and in order. `is_active` on
  `product_variants` is still the only eligibility rule, still in the SQL.
- **A variant is never withheld because Ready-Made cannot sell it.** A variant
  with no SKU, with only inactive SKUs, with no stock anchor or with zero
  availability is returned exactly as before, with an empty or zero-valued
  `skus`. Proved twice against real PostgreSQL (`excludes an inactive SKU while
  keeping its variant`; the unchanged `APP5-B07` empty-list case).
- `productVariantId`, `colorName` and `sizeLabel` keep their names, types and
  null semantics. Asserted through the projection, which is what serialises.
- Every APP5 consumer compiles and passes unchanged: `@embroidery/storefront`
  `typecheck` clean, 8 custom-request suites / 131 tests green.
- The only Storefront edit in the whole checkpoint is one **test fixture**
  (`makeVariant` now returns `skus: []`, with a comment saying this screen does
  not read it). No feature source, no component, no SCSS, no visual change.

---

## F. SKU identity and cardinality

```text
SKU_identity            = PRESENT
multiple_SKUs_supported = true
heuristic_winner        = NONE
```

`skuId` is published because `APP12-B02` creates the order line against a SKU,
not against a variant. The business `skus.code` is **not** published: it
identifies the same SKU to an operator and buys a customer nothing.

Every order-eligible SKU is projected, ordered by id — total by construction,
because `skus` carries no display order. Nothing treats the first entry as "the"
SKU. `product-sku.policy.ts` caps the eligible set at one per variant *on the
write side*; the read does not assume that cap, because a read that assumed it
would have to invent a tie-break the moment the invariant was ever violated —
which is the precise resolution that policy forbids. Proved with three eligible
SKUs under one variant, all projected, in id order.

---

## G. Price authority

`resolvePublicSkuUnitPrice()` in `catalog/domain/public-sku-price.policy.ts` —
one pure function, in the domain, testable without a database, and the same
function `APP12-B02` must call when it freezes the line.

```text
resolved = COALESCE(skus.price_override_amount, products.base_price_amount)
currency = the currency column of whichever row supplied the amount
```

- **No arithmetic, therefore no float.** It selects between two strings.
  `numeric(14,2)` crosses the driver as a string exactly so no VND amount passes
  through an IEEE-754 double (INV-11); parsing either operand would throw that
  away for nothing. Proved with `999999999999`, which survives the wire intact.
- **An override of `0` is a price and wins.** `ck_skus__price_override_non_negative`
  admits zero and `COALESCE` is null-checking, not falsiness. Reading `'0.00'`
  as "no override" would silently charge the base price for an item an operator
  marked free. Proved in the unit and integration suites.
- **The currency is read, never assumed.** Not a literal `'VND'` written in
  because today's closed set has one member — the resolution takes the currency
  of the row that supplied the amount, so it is already correct the day a second
  currency is allowed. Proved with a value the closed set does not contain.
- Test values are deliberately distinct (base `150000` / `250000`, override
  `199000`), so a resolution that took the wrong operand fails rather than
  coincidentally passes.

`B01 price = the catalog price at read time, advisory, display only.`
`APP12-B02 = server re-resolution + frozen OrderItem price.` No price signature,
no token, and the client is never authoritative (`BR-021`).

---

## H. Availability authority

```text
canonical_inventory_math = PASS
available = quantity_on_hand − Σ active soft holds − Σ active reservations
active    = status 'HELD' | status 'RESERVED'   (LC-17, one state per side)
floor     = 0
```

**One definition, two readers.** The two active states were bare literals in
`StockAnchor`. They are now `ACTIVE_SOFT_HOLD_STATE` and
`ACTIVE_RESERVATION_STATE` in `@embroidery/persistence`, adopted by
`StockAnchor` itself and by the new snapshot adapter. Two copies of the word
`'HELD'` would be two definitions of what stock is available, and the day one
gained a state the other did not, a customer would be shown inventory the writer
refuses. This is a transcription of the delivered lifecycle, not a new authority:
`uq_inventory_soft_holds__request_stock__held` and
`uq_inventory_reservations__order_stock__reserved` already single out these two
states physically.

**Catalog reads no inventory table.** Availability arrives through a new
read-only port, on the `APP8-B03` `OrderReservationSummaryModule` precedent:

```text
SKU_AVAILABILITY_SNAPSHOT_PORT.listAvailability(skuIds) -> [{ skuId, availableQuantity }]
```

exported by `SkuAvailabilitySnapshotModule` — one method, nothing else. Not
`InventoryModule`, which re-exports `SKU_STOCK_REPOSITORY` with `ensureStockRow`,
`createSoftHold`, `createReservation`, `adjust`, `release` and `consume` on it. A
graph of anonymous public GETs that imported it would acquire every method §9 and
§14 forbid, and "this GET writes nothing" would rest on a query's restraint
instead of on the wiring.

The port publishes **one number**. `quantity_on_hand`, the held/reserved
breakdown, the low-stock threshold, the anchor id, reservation ids and the ledger
are never selected — the redaction is structural, not remembered.

**Not decision-grade, and documented as such.** No lock, no transaction, no
`FOR UPDATE`. `FU-APP8-B02-02` reserves the anchor lock for decisions; taking it
on a public page view would make a browser refresh contend with the reservation
worker. `BR-024` keeps the reservation at durable order creation, and `APP12-B02`
re-checks availability under the anchor lock there.

**Query shape.** Three statements — anchors by `sku_id IN (…)`, then active holds
and active reservations grouped by anchor. Bounded by request, not by SKU count:
a variant list of any size costs the same as one SKU, so there is no N+1 to grow
into. Three rather than one correlated statement on purpose: two aggregate
subqueries in a select list is the shape that already produced an
unqualified-column defect in this repository (`APP11-B03`), and it would buy
nothing over indexed equality reads of a handful of rows.

**The floor.** `Math.max(0, …)` is not arithmetic of its own. The balance can go
negative only through an oversubscription defect, and "−3 available" is not a
truthful answer to "how many may I buy" — nor a usable stepper maximum. Zero is.

**An inventory failure is not zero.** A throw from the port propagates untouched
rather than being flattened into zeros: "out of stock" and "we could not read
stock" are different answers, and reporting the first for the second would tell a
customer a product is sold out because a query failed.

---

## I. Missing-stock behaviour

```text
missing_stock = UNAVAILABLE_NO_MUTATION
```

`listAvailability` **omits** a SKU with no `sku_stocks` anchor rather than
inventing a row for it; the query reads the absence as zero
(`UNANCHORED_SKU_AVAILABLE_QUANTITY`). There is no `ensureStockRow` on any read
path, no insert, no update and no delete — asserted from source in the contract
spec for both the Catalog repository and the availability adapter.

Proved against real PostgreSQL: with a valid SKU and **no** anchor, the read
answers `availableQuantity: 0` and the row counts of `sku_stocks`,
`inventory_soft_holds`, `inventory_reservations` and `inventory_ledger_entries`
are byte-identical before and after. Proved again with an anchored SKU across two
consecutive reads: still 0 holds, 0 reservations, 0 ledger entries. Proved live
over the dev gateway: three further reads left `sku_stocks` at 2 while a third
SKU deliberately had no anchor.

---

## J. Active / inactive SKU behaviour

An inactive SKU is **absent**, not shown as unpurchasable. `is_active` is the
predicate in the SQL, sourced from `SKU_ORDER_ELIGIBLE_IS_ACTIVE` rather than a
bare `true`, so "order-eligible" means one thing on the write side and the read
side.

Its variant is unaffected. Proved: a variant whose only SKU is deactivated is
still returned, with `skus: []`, and the SKU row still exists — the exclusion is
the read's doing, not the fixture's. Proved live: the seeded inactive SKU is
absent from a response carrying the three active ones.

---

## K. Publication and privacy boundary

Publication is unchanged. Unknown slug, `DRAFT`, `ARCHIVED` and a non-public
category still collapse to one 404 from predicates in the statement, so the route
cannot enumerate unreleased work. Proved against real PostgreSQL (the unchanged
`APP5-B07` suite plus an archived product whose SKU is in stock), and live
(`/khong-ton-tai/variants` → 404).

Nothing private is published. Asserted from source that the response declares no
`skuCode`, `code`, `isActive`, `priceOverrideAmount`, `basePriceAmount`,
`skuStockId`, `quantityOnHand`, `heldQuantity`, `reservedQuantity`,
`lowStockThreshold`, `reservationId`, `orderId`, `customerId`,
`customRequestId`, `isDisplayOutOfStock`, `status`, `displayOrder`, `archivedAt`,
`createdAt`, `updatedAt`, `category`, `categoryId` or `name`. Asserted at runtime
against a real database that a response computed from 10 on hand, a 2-unit hold
and a 3-unit reservation contains the anchor id nowhere, the order id nowhere,
the request id nowhere, and exactly three keys on the SKU.

Zero availability is a normal read state, never a new business error. The
existing error envelope is unchanged.

---

## L. OpenAPI delta

```text
paths              120 -> 120   (0)
operations         133 -> 133   (0)
public operations   44 ->  44   (0)
schemas            260 -> 261   (+1)
```

The one new schema is `PublicProductSkuResponse`. `PublicPriceResponse` already
existed and is reused rather than duplicated.

`pnpm --filter @embroidery/api openapi:generate` then `openapi:check` — PASS, no
hand edit.

---

## M. Generated-client delta

`pnpm --filter @embroidery/api-client generate` then `check:generated` — PASS,
tree hash `8dba96d1…`. Delta: **+14 lines** in `embroidery-api.schemas.ts` (the
new interface plus the `skus` property) and **1 line** in `embroidery-api.ts`.
No hand edit. The curated `custom-requests.ts` re-export needed no change — the
widened types flow through it.

---

## N. Release-gate compatibility

```text
public operations = 44 (unchanged)
DENY              = 31 (unchanged)
ALLOW             = 13 (unchanged)
release flag      = untouched
```

`publicProductVariant_list` was already Wave-1 `ALLOW`. No operation was added,
so no classification was owed and the `DENY` set is untouched.
`release-gate.contract.spec.ts` — 11 tests, PASS.

---

## O. Real-database test matrix

`apps/api/src/modules/catalog/tests/integration/public-purchasable-sku.integration.spec.ts`
— 13 scenarios, real `CatalogPublicModule`, disposable PostgreSQL.

| § | Scenario | Result |
| --- | --- | --- |
| A | on hand 10, `HELD` 2, `RESERVED` 3 | `availableQuantity = 5` |
| A′ | six **terminal** rows (`CONVERTED`, `RELEASED`, `EXPIRED`, `CONSUMED`, `RELEASED`, `EXPIRED`) totalling 24 against 10 on hand | `10` — asserted as the full figure, not merely "not negative", so the floor cannot hide a defect |
| B | everything on hand reserved | `0`, and the SKU is **still projected** |
| B′ | `products.is_display_out_of_stock = true`, 7 on hand | `7` — the flag is not inventory arithmetic |
| C | valid SKU, no `sku_stocks` row | `0`; `sku_stocks`, holds, reservations and ledger counts unchanged |
| C′ | two consecutive reads of an anchored SKU | 0 holds, 0 reservations, 0 ledger entries created |
| D | `skus.is_active = false` | absent from `skus`; the variant is returned; the row still exists |
| E | three eligible SKUs + one inactive under one variant | all three projected, id-ordered, availabilities 1/2/3, no winner chosen |
| F | base fallback (150000) vs override (199000) | both correct, and distinct so a wrong operand cannot pass |
| F′ | override `'0'` | `'0'`, not the base price |
| F′′ | override `999999999999` | byte-identical string; never parsed |
| K | archived product with stock | refused |
| K′ | full projection with a live hold and reservation | anchor id, order id and request id absent; exactly three SKU keys |

Fixtures distinguish active from terminal rows explicitly. The suite borrows
`seedInventoryChain` (extended additively with `productId`, `productSlug`,
`productVariantId`) because a hold needs a `custom_requests` row and a
reservation needs a fully composed `orders` row; re-seeding that chain would be a
second copy of something whose only interesting property is that it exists.

---

## P. Live HTTP evidence

Canonical dev gateway, after rebuilding the API image (the container bakes
`@embroidery/persistence`; only `apps/api/src` is bind-mounted).

`GET http://embroidery.local/api/public/products/ao-thun-cotton/variants` → `200`,
`Cache-Control: no-store`:

```json
{ "productId": "…061",
  "variants": [{ "productVariantId": "…062", "colorName": "Trắng ngà", "sizeLabel": "M",
    "skus": [
      { "skuId": "…a1", "unitPrice": { "amount": "250000", "currency": "VND" }, "availableQuantity": 10 },
      { "skuId": "…a2", "unitPrice": { "amount": "199000", "currency": "VND" }, "availableQuantity": 4 },
      { "skuId": "…a3", "unitPrice": { "amount": "129000", "currency": "VND" }, "availableQuantity": 0 }
    ] }] }
```

Which proves live, in one response: the base-price fallback (`a1`, no override →
the product's `250000`); override precedence (`a2` → `199000`); the availability
arithmetic (`a1`: 12 on hand − a 2-unit `HELD` hold = **10**); a SKU with **no
stock anchor** reading `0` (`a3`); and an **inactive** SKU (`a4`, override
`99000`) absent from the response entirely.

Then, with **no** code change: releasing the hold raised `a1` from `10` to `12`
on the next read — the figure is live and uncached, and the hold genuinely
reduced it.

Mutation-free: three further reads left `sku_stocks = 2`, `holds`,
`reservations` and `ledger` unchanged, with `a3` still un-anchored.
Boundary: `/api/public/products/khong-ton-tai/variants` → `404`.

The dev database previously held **0** SKUs and **0** stock rows, so the four
SKUs and two anchors above were seeded as additive dev catalog data on the
existing dev product. The synthetic soft hold was removed after the arithmetic
was proved, so no fabricated commitment is left standing against a real
`custom_requests` row. No business row was modified or deleted.

---

## Q. Files changed

**New (7)**

```text
apps/api/src/modules/catalog/domain/public-sku-price.policy.ts
apps/api/src/modules/catalog/domain/public-sku-price.policy.spec.ts
apps/api/src/modules/catalog/tests/integration/public-purchasable-sku.integration.spec.ts
apps/api/src/modules/inventory/domain/repositories/sku-availability-snapshot.port.ts
apps/api/src/modules/inventory/infrastructure/persistence/drizzle-sku-availability-snapshot.adapter.ts
apps/api/src/modules/inventory/sku-availability-snapshot.module.ts
packages/persistence/src/inventory/inventory-active-states.ts
```

**Modified (18)**

```text
apps/api/src/modules/catalog/application/public-product-variant.query.ts
apps/api/src/modules/catalog/catalog-public.module.ts
apps/api/src/modules/catalog/domain/repositories/public-product-variant.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-public-product-variant.repository.ts
apps/api/src/modules/catalog/presentation/public-product-variant.controller.ts
apps/api/src/modules/catalog/presentation/public-product-variant.contract.spec.ts
apps/api/src/modules/catalog/presentation/schemas/public-product-variant.response.ts
apps/api/src/modules/catalog/tests/integration/public-product-variant.integration.spec.ts
apps/api/src/modules/inventory/tests/integration/inventory-fixture.ts       (additive return fields)
apps/storefront/test/support/custom-request-fixture.ts                      (compile-only)
packages/persistence/src/index.ts
packages/persistence/src/inventory/stock-anchor.ts
packages/contracts/openapi/openapi.generated.json                           (generated)
packages/api-client/src/generated/embroidery-api.schemas.ts                 (generated)
packages/api-client/src/generated/embroidery-api.ts                         (generated)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
docs/implementation/SCOPED_COMMAND_INDEX.md
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
```

No Storefront feature source, no Admin source, no SCSS, no migration, no Figma.

---

## R. File-size evidence

```text
node tools/check-file-size.mjs --paths <19 changed source/test files>
→ Scoped file-size check passed (19 file(s), 0 above the review threshold).
```

Every changed source and test file is under the 300/500 review thresholds, and
therefore under the 400/600 hard limits.

---

## S. Validation

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| `pnpm --filter @embroidery/api typecheck` | PASS |
| `pnpm --filter @embroidery/persistence typecheck` · `build` | PASS |
| `pnpm --filter @embroidery/api-client typecheck` | PASS |
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `CMD-TEST-APP12-B01-CONTRACT` | 2 suites / **23** tests PASS |
| `CMD-TEST-APP12-B01-INVENTORY` | 2 suites / **25** tests PASS (real PostgreSQL) |
| APP8 inventory suites (`inventory-persistence\|inventory-reservations\|inventory-races`) | 4 suites / **34** tests PASS — the shared active-state seam |
| APP7 SKU suites (`admin-sku\|product-sku`) | 7 suites / **122** tests PASS |
| APP5 Storefront consumer (`custom-request`) | 8 suites / **131** tests PASS |
| `release-gate` contract | **11** tests PASS |
| `zod-dto\|zod-openapi` publication contract | 4 suites / **158** tests PASS |
| `@embroidery/api-client` tests | 7 PASS |
| `CMD-OPENAPI-GENERATE` · `CMD-OPENAPI-CHECK` | PASS |
| `CMD-API-CLIENT-GENERATE` · `CMD-API-CLIENT-CHECK` | PASS |
| `CMD-CHECK-CATEGORY-SOURCE-OF-TRUTH` | PASS — 2 392 files, no compiled category values |
| `check-storefront-route-authority.mjs` | PASS |
| C03 freeze regression (`discover`) | 7 suites / **96** tests PASS |
| `CMD-CHECK-FILE-SIZE-SCOPED` (19 paths) | PASS |
| `prettier --check` (19 changed files) | PASS |
| `eslint` (catalog, inventory, persistence/inventory) | PASS, 0 problems |
| Live HTTP smoke via the canonical gateway | PASS (§P) |

Not run, and why: no full monorepo aggregate, no Playwright (B01 adds no UI —
§33), no UAT, no performance suite, no Figma gate (no design change), no
migration tooling (no migration).

---

## T. Baseline freeze

```text
migrations                 38          (delta 0)
DB schema delta            0
OpenAPI paths              120 -> 120
OpenAPI operations         133 -> 133
OpenAPI public operations   44 ->  44
OpenAPI schemas            260 -> 261
release matrix             31 DENY / 13 ALLOW (unchanged)
Storefront routes          unchanged
Storefront purchase UI     not started
Admin UI                   unchanged
SCSS                       unchanged
Figma                      unchanged
```

No availability or resolved-price column was added, and no second commerce SKU
model was introduced. `APP12-C03`'s dynamic category behaviour is unchanged: no
price or availability path consults a category slug, and the anti-hardcode gate
is green.

---

## U. Follow-ups

```text
public purchasable SKU projection = CLOSED_BY_APP12_B01
```

Carried, unabsorbed: `FU-APP12-C03-01` → `APP12-H01` (pre-existing global
lint/format debt). B01 touched none of those files, and every B01-touched file
passes lint and format individually.

New follow-up:

| Id | Statement | Owner |
| --- | --- | --- |
| `FU-APP12-B01-01` | `APP12-B02` must resolve the unit price by calling `resolvePublicSkuUnitPrice()` rather than re-deriving `COALESCE(...)`, and must re-check availability **under the `sku_stocks` anchor lock** before committing a reservation. The B01 figures are advisory by construction; an order that trusted them would be deciding on an unlocked read, which `FU-APP8-B02-02` forbids. | `APP12-B02` |

---

## V. Roadmap

```text
APP12-B01 COMPLETE
APP12-B02 NEXT
```

`APP12-B02`, `APP12-S01`, `APP12-G03` and `APP12-A01` remain open and unstarted.
Roadmap `LOCKED` at 38. Nothing pushed.
