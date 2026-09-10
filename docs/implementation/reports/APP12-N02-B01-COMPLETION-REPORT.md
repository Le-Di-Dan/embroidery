# APP12-N02.B01 — Ready-Made Variant Authority, Admin Authoring Read & Publication Readiness

**Checkpoint** `APP12-N02.B01` (backend/application package of `APP12-N02 — READY-MADE
SELLABILITY AUTHORING & PUBLICATION READINESS`)
**Date** 2026-09-10
**Branch** `feat/app11-s04-seo-infrastructure` (not pushed)

---

## A. Verdict

```text
APP12-N02.B01 = COMPLETE — AWAITING_PO_REVIEW
APP12-N02     = IMPLEMENTATION_IN_PROGRESS

APP12-N02.A01 = NEXT — NOT_EXECUTED
APP12-N02.E01 = NOT_AUTHORIZED

APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

PRODUCTION_DEPLOYED = false
PUSHED              = false
```

`product_variants` now has a writer. `APP12-N02.G01` proved that **zero** delivered
operations inserted or updated one, that `adminSku_create` had zero Admin call sites, and
that publication readiness reported 7/7 green for a Product that could never be bought.
This checkpoint closes the write half and the *evidence* half together: three new Admin
operations, and a publication snapshot that can finally see the thing it was silent about.

Two facts are worth stating up front because they changed how the work was done.

1. **The readiness evaluator was not lenient about sellability — it was blind to it.**
   `ProductPublicationSnapshot` carried `product`, `category` and `media` and nothing
   else. There was no fact in the shape a variant requirement could have been written
   against, so the ten-criterion change is a *facts* change first and a rule change
   second (§J below).
2. **The one co-failure is real and is documented, not a leak.** An unset base price now
   fails `PRODUCT_PRICE_READY` **and** `SKU_PRICE_RESOLVABLE`, because the seeded SKU
   inherits that price. `APP12-N02.D01` §J.3 predicted exactly this row. The converse —
   an override of `"0"` failing alone while the base price stays green — is what proves
   the two criteria independent, and it is proved both in the domain suite and live.

---

## B. D01 PO approval reconciliation

```text
FIGMA_APPROVAL = FIG-APPROVAL-APP12-N02-D01-PO-001
D01 rows       = 21
```

Every design decision implemented here traces to an approved D01 section:

| D01 authority | Implemented as |
|---|---|
| §E — create/edit/activate/deactivate, **no DELETE** | `ProductVariantService.list/create/update`; no delete method, route or body field exists |
| §E — at least one nonblank label | `VARIANT_LABEL_REQUIRED`, settled in the domain for both writes |
| §E — duplicate normalized identity refused | `PRODUCT_VARIANT_DUPLICATE`, settled under the Product write lock |
| §E — ordering is creation order, no drag-and-drop | server-assigned `display_order`; no client field, no reorder operation |
| §F — SKU contract reused unchanged | `adminSku_create` / `adminSku_update` untouched; zero new SKU operations |
| §F — inactive SKU history retained | the authoring read returns inactive SKUs |
| §G — stock reuse only | zero new stock operations; no `low_stock_threshold` authoring |
| §H — PUBLISHED sellability editable, no auto-unpublish | `VARIANT_AUTHORABLE_PRODUCT_STATES = [DRAFT, PUBLISHED]`; nothing writes `products.status` |
| §J — 7 → 10 criteria, sold-out may publish | `PRODUCT_PUBLICATION_REQUIREMENT_CODES` length 10; stock excluded structurally |
| §J.3 — `"0"` override is a standalone failure | `SKU_PRICE_RESOLVABLE` quantified over **every** eligible SKU |
| §J.4 — vacuity is presentation, not contract | contract unchanged (`satisfied: true|false`); the "Chưa xét" rule stays `N02.A01`'s |
| §S — `adminProductVariant_list` is required | delivered; the public projection is not reused anywhere |

Nothing in D01 was reinterpreted, and no design decision was made here.

---

## C. Registry approval

`docs/design/FIGMA_DESIGN_INDEX.md` §4.14, rows `1605`–`1625`:

```text
21 rows  REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION
21 rows  Approval Evidence  —  →  FIG-APPROVAL-APP12-N02-D01-PO-001
rows modified outside §4.14        0
approval ids fabricated            0
Figma redrawn                      no  (no MCP write of any kind this checkpoint)
```

The section's own prose was updated from "No approval evidence exists yet" to the ruling,
following the `APP12-M01.D1` precedent verbatim. `git diff --numstat` on the file reported
`21 21` before the prose edit, which is the mechanical proof that exactly 21 rows moved.

Gate:

```text
$ node tools/check-figma-design-index.mjs
Figma Design Index check passed (613 registry IDs, 613 node rows, 28 registry table(s);
canonical files + statuses + deep links + composites verified).
```

Run **before** runtime implementation began, and again at the end.

---

## D. Admin authoring-read architecture

```text
GET /api/admin/products/{productId}/variants   →  adminProductVariant_list
```

The public projection is **not** reused, and the four reasons `N02.D01` §C gave are
enforced by construction rather than by comment: the new operation is keyed by
`productId`, admits every lifecycle state, filters neither level, and publishes `code`,
`isActive` and both timestamps.

Response (`AdminProductVariantListResponse`):

```text
productId
variants[]                       active and inactive
  variantId · colorName|null · sizeLabel|null · displayOrder · isActive
  createdAt · updatedAt
  skus[]                         active and inactive
    skuId · code · priceOverrideAmount? · currencyCode · isActive
    createdAt · updatedAt
```

`colorName`/`sizeLabel` are `null` on the wire rather than omitted: a variant with no
colour is an editable state the dialog has to render empty, and an absent property would
make "not set" and "not returned" the same value.

**Three statements, never one per variant.** The Product's state, its whole variant set,
and every SKU under it through one join. Grouping happens in the projection, in memory.

**Not coupled to stock.** No `sku_stocks` read, and no stock-shaped field on the response
— asserted mechanically in `admin-product-variant.contract.spec.ts`.

**Deterministic order.** `display_order asc, created_at asc, id asc` for variants;
`created_at asc, id asc` for SKUs. The final `id` tie-break makes the sequence total, and
the integration suite reads the same list twice and compares.

`ARCHIVED` is readable. Refusing would hide the history the operator opened the screen
for, and reading is not authoring.

---

## E. Variant create

```text
POST /api/admin/products/{productId}/variants  →  adminProductVariant_create   201
body: { colorName?: string|null, sizeLabel?: string|null, isActive?: boolean = true }
```

`isActive` **defaults to true**, which is the opposite of the SKU create's explicit flag
— and for the opposite reason. The SKU rule exists because a variant may hold only one
order-eligible SKU, so a default would silently consume the single slot; a Product may
hold any number of active variants and nothing is consumed. The default is declared once
as `VARIANT_DEFAULT_IS_ACTIVE` and published in the OpenAPI schema.

The client cannot send `displayOrder`: the body is `.strict()`, and the contract spec
asserts the string `displayOrder` appears nowhere in either published body schema.

Server assignment, under the lock:

```text
display_order = max(existing display_order) + 1     or 0 when the Product has none
```

`max + 1`, deliberately **not** `count`: a gap left by earlier authoring would make a
count collide with a row that already holds that order. Proved by seeding a lone variant
at `display_order = 7` and asserting the next create receives `8`.

---

## F. Variant update, deactivation and reactivation

```text
PATCH /api/admin/products/{productId}/variants/{variantId}
      → adminProductVariant_update   200
body: at least one of { colorName?: string|null, sizeLabel?: string|null, isActive? }
```

- A label is cleared with `null` **or** a blank string; both normalize to stored `NULL`.
  A dialog with an empty input sends `""` and a client clearing a field sends `null`, and
  the same operator intent must not depend on which the browser serialised.
- The post-patch identity is computed from *named field ⊕ stored row*, so renaming only
  the size is still checked against the colour already on the row.
- Deactivation is the only way a variant leaves the catalog. **No DELETE exists** — not a
  route, not a method, not a service function. Two independent assertions: the controller
  source is scanned for `@Delete`/`@Put`, and the published artifact's path items are
  asserted to be exactly `{get, post}` and `{patch}`.
- `active ↔ inactive` works on `DRAFT` and on `PUBLISHED`. Deactivating the last active
  variant of a published Product leaves `products.status = 'PUBLISHED'` — asserted by
  reading the row after the write. Nothing in this module writes `products.status` at all.
- Wrong Product relationship is a `404` with its own code (`VARIANT_PRODUCT_MISMATCH`),
  told apart from `VARIANT_NOT_FOUND` by one unlocked owner lookup on the miss path only.
  An operator who addressed the right variant under the wrong Product needs a different
  answer from one who addressed a row that does not exist.
- An empty patch is refused by the schema.

---

## G. Normalization and duplicate policy

```text
normalize   trim → collapse internal whitespace (\s+ → ' ') → blank becomes undefined
require     at least one label survives              → VARIANT_LABEL_REQUIRED  (400)
identity    lower(color) +   + lower(size)      → PRODUCT_VARIANT_DUPLICATE (409)
scope       within one Product, across active AND inactive rows
```

- **Case-insensitive, never accent-stripped.** `"Đen"` and `"Den"` are different words in
  Vietnamese and stay two variants; `" Xanh navy "/"M"` and `"xanh   NAVY"/"m"` are one.
- ` ` separates the halves because it cannot occur in a label, so `("ab", null)` and
  `("a", "b")` stay distinct — asserted.
- A named label is written back in its **normalized** form, so the stored bytes are the
  bytes the duplicate rule compared.
- **No `UNIQUE` migration.** The rule is application-level under the write lock, which is
  also why the concurrent loser fails as `PRODUCT_VARIANT_DUPLICATE` rather than as a
  constraint violation: there is no constraint to raise one.

The 400/409 split is deliberate. A request naming no label is wrong in itself and the
client fixes it by editing what it sent. A duplicate is a well-formed request refused by
state the client did not send and cannot see — the colliding variant may merely be
deactivated — so it is a conflict, and a 400 would invite an edit that changes nothing.

---

## H. Concurrency and `display_order` — the exact seam used

**The Product row is the concurrency arbiter**, locked `FOR UPDATE`:

```text
begin
  lock products FOR UPDATE                      ← the arbiter
  prove the state allows authoring
  re-read the Product's whole variant set inside the transaction
  normalize, settle identity against that set
  assign display_order from that set            (create only)
  mutate
  return the settled row
commit
```

**Why this seam and not `expectedUpdatedAt`.** §11 said to reuse the current convention
rather than invent another. The applicable sibling is `ProductSkuService` — the other half
of the same authoring surface — which uses lock-and-settle and carries **no** concurrency
token. `ProductPublicationService` uses `expectedUpdatedAt` because it *writes the Product
row*; variant authoring does not. So there is no `VERSION_CONFLICT` in this feature's
vocabulary, and none is invented.

**Why the Product and not the variant.** Both the duplicate rule and the assigned order
are properties of the *set*, and the one object every writer of that set must touch is
the owning Product.

**The lock order is now fixed for the whole authoring surface, and it matters.**
`APP7-B01` takes `product_variants FOR UPDATE` then `products FOR SHARE`. This writer
takes `products FOR UPDATE` and stops there — it never waits on a variant lock, so no
cycle between the two is representable. That same fact is what let the publish transaction
read variants and SKUs **without** row locks (§J), avoiding a deadlock cycle a share lock
taken in the opposite order would have created.

Proved on real connections in `catalog-variant-race.integration.spec.ts` — two
independently pooled actors, a third holding the `products` row lock so both writers are
guaranteed to reach their own `FOR UPDATE`:

```text
two concurrent creates of the same identity   → 1 fulfilled, 1 PRODUCT_VARIANT_DUPLICATE,
                                                1 row in the database
two concurrent creates, different identities  → 2 fulfilled, display_order [0, 1]
concurrent create + colliding rename          → exactly 1 winner, loser is a domain refusal
```

The second is the assignment proof: two writers that each read the set before the other
committed would both have computed `0`.

---

## I. SKU-operation reuse

```text
new SKU operations      0
adminSku_create         unchanged
adminSku_update         unchanged
SKU_ORDER_ELIGIBLE_AMBIGUOUS  unchanged
```

`SkuRecord` is imported from the SKU port by the variant port rather than re-declared, so
the authoring read publishes the same SKU shape the SKU writes accept. The 203 tests in
the SKU suites (`catalog-sku*`, `admin-sku*`, `product-sku*`, `public-purchasable-sku`,
`public-product-variant`) pass unchanged, with no edit to any of them.

---

## J. Publication snapshot expansion

`ProductPublicationSnapshot` gained `variants` and `skus`. Both feed the **one** evaluator
that `adminProduct_publicationReadiness` and `adminProduct_publish` already shared, so
"readiness and publish agree" stays a structural property rather than two code paths kept
in step by inspection.

Reads, batched, one statement each:

```text
product_variants  where product_id = $1                       (variantId, isActive)
skus JOIN product_variants  where product_variants.product_id = $1
                            (skuId, variantId, isActive, priceOverrideAmount, currencyCode)
```

No N+1. A Product with ten variants costs the same round trips as one with a single one.
Sequential rather than concurrent, because these may run on the single connection an
enclosing transaction holds.

**No stock fact of any kind.** `PUBLICATION_STOCK_EXCLUSION` names the three excluded
things as a stated rule with a home, and the enforcement is the *shape*: the facts type
has nowhere to put a quantity, a threshold or an anchor, so a future checkpoint wanting to
block publication on stock must widen the type first — a visible decision, not a quiet one.

**The variant and SKU reads take no row lock, deliberately.** They are read inside the
publish transaction while the product root is held `FOR UPDATE`, and every writer of
either must take a lock on that same product row before mutating (`N02.B01` exclusively,
`APP7-B01` in share mode), so neither set can change before commit. Taking a share lock
anyway would be worse than redundant — it would be taken in the opposite order to
`APP7-B01`'s variant-then-product sequence and create a deadlock cycle that does not exist
today. Recorded on the port method and at the call site.

Publish continues to re-lock and re-evaluate inside its own transaction; a live test
refuses a publish, seeds the missing structure, and re-issues the *same* command with the
*same* token successfully.

---

## K. Ten-criterion readiness

```text
 1  PRODUCT_NAME_READY                unchanged
 2  PRODUCT_DESCRIPTION_READY         unchanged
 3  PRODUCT_CATEGORY_READY            unchanged
 4  PRODUCT_PRICE_READY               unchanged
 5  PRODUCT_MEDIA_READY               unchanged
 6  PRODUCT_MEDIA_ASSETS_READY        unchanged
 7  PRODUCT_MEDIA_DERIVATIVES_READY   unchanged
 8  HAS_ACTIVE_VARIANT                NEW
 9  HAS_ORDER_ELIGIBLE_SKU            NEW
10  SKU_PRICE_RESOLVABLE              NEW
```

Appended, never inserted: the first seven keep their codes **and** their positions, so a
client rendering the list in order sees the checklist it already knew with three rows
added. Asserted as an explicit slice comparison, not just a length.

Semantics:

```text
HAS_ACTIVE_VARIANT       any variant with is_active = true

HAS_ORDER_ELIGIBLE_SKU   no active variant                     → true (vacuous)
                         otherwise                             → ≥1 order-eligible SKU

SKU_PRICE_RESOLVABLE     no order-eligible SKU                 → true (vacuous)
                         otherwise → EVERY order-eligible SKU resolves
                                     COALESCE(override, base) to a publishable VND price
```

**Order-eligible ≡ `sku.is_active = true` AND its owning variant is active.** The second
half is the one that is easy to lose: a customer chooses the variant, so an active SKU
under a delisted variant is not for sale, and counting it would let a Product publish on
structure no storefront path can reach. `APP7-B01`'s definition is not reinterpreted —
this only adds the reachability the variant level carries.

Vacuity follows the delivered evaluator's own philosophy (`PRODUCT_MEDIA_ASSETS_READY` is
true with no media): report the root missing fact, never three failures for one missing
prerequisite. The contract stays `satisfied: true|false`; rendering "Chưa xét" is
`N02.A01`'s, per D01 §J.4. The live HTTP refusal for a bare draft now names exactly four
codes — description, price, media, `HAS_ACTIVE_VARIANT` — and the *absence* of the other
two of each pair is the vacuity rule working.

---

## L. The all-SKU price-resolvability rule

Not "at least one valid SKU price". Every order-eligible SKU under an active variant must
resolve, via `resolvePublicSkuUnitPrice` (BR-021 / `IMP-D058`) and then the **existing**
`isPublishablePrice` predicate, to a publishable VND amount. The two price criteria
therefore cannot start disagreeing about what a valid amount is.

The quantifier is the point, and it is not the obvious choice:

```text
base 250.000 ₫  +  override null   →   4 PASS,  10 PASS
base 0 (unset)  +  override null   →   4 FAIL,  10 FAIL     ← the documented co-failure
base 250.000 ₫  +  override "0"    →   4 PASS,  10 FAIL     ← standalone, and the reason
base 250.000 ₫  +  overrides "385000" and "0"  →  10 FAIL   ← "at least one" would pass this
```

`priceOverrideAmount` is validated only as `^\d{1,12}$` and
`ck_skus__price_override_non_negative` admits zero, so a `"0"` override is a row an
operator can genuinely create. Under the old seven it published 7/7 and sold for nothing.
An order does not get to pick the priced SKU, so neither does the criterion.

The currency travels with the amount that won the `COALESCE`: a non-VND override fails
row 10 while row 4 stays green on a valid VND base price. Asserted.

---

## M. Sold-out publication proof

Live, against real rows in `sku_stocks`:

```text
stock 0, threshold NULL          → 10/10, publishes
no stock anchor row at all       → 10/10, publishes   (count(*) = 0 asserted first)
stock 0 threshold 3  vs  stock 12 threshold 3
                                 → requirement lists compared with toEqual → identical
```

The third is the pair of frames `N02.D01` §J.2 draws side by side (states D and E), and it
is why they were drawn separately: the only difference is a sentence about stock, and
stock appears in none of the ten rows.

Reinforced in the domain suite by serialising the whole facts object and asserting it
contains no `quantity`, `stock`, `threshold`, `onHand` or `reserved`, plus an exact key
list on the variant and SKU fact shapes.

---

## N. Existing malformed PUBLISHED rows

**Untouched.** No migration, no data write, no auto-unpublish, no sweep. The shared
development world was not read for repair and was not modified (§V).

Proved live on a Product published and then made structurally unsellable:

```text
after the variant is deactivated       products.status = 'PUBLISHED'
after readiness is read                products.status = 'PUBLISHED'   (a read writes nothing)
after the variant is reactivated       10/10, still PUBLISHED — repaired in place
```

There is no `unpublish → edit → republish` cycle anywhere in this checkpoint. That is what
makes the two malformed rows `N02.G01` found recoverable without withdrawing them from the
storefront.

The new criteria govern future readiness and publish/re-publish decisions only.

---

## O. Unpublish preservation

`adminProduct_unpublish` is unchanged and deliberately still does **not** re-run readiness:
withdrawing a Product from public view must not depend on it still being publishable.
Proved live — a PUBLISHED Product failing `HAS_ACTIVE_VARIANT` unpublishes successfully.

`APP12-M01.B2` media curation is also unaffected: it refuses on
`PRODUCT_MEDIA_PUBLICATION_REQUIREMENT_CODES` (three media codes) alone, so the three new
requirements cannot change its verdict. It passes empty variant/SKU facts and reads
neither table — a Product that has become structurally unsellable is exactly the one an
operator most needs to be able to fix an image on.

---

## P. OpenAPI and generated client

```text
              before   after   delta
paths           127     129      +2
operations      140     143      +3
schemas         279     284      +5
public ops       49      49       0
```

The three operations:

```text
GET   /api/admin/products/{productId}/variants              adminProductVariant_list
POST  /api/admin/products/{productId}/variants              adminProductVariant_create
PATCH /api/admin/products/{productId}/variants/{variantId}  adminProductVariant_update
```

Operation ids are **derived** by the canonical policy from the class and method names, not
stated on each `@ApiOperation`, so this controller owes no `CONTROLLER_DOMAIN_KEYS` entry
and no public identifier is written down twice. Asserted against both `createOperationId`
and the committed artifact.

The five new schemas: `AdminProductVariantListResponse`, `AdminProductVariantResponse`,
`AdminVariantSkuResponse`, `CreateProductVariantBody`, `UpdateProductVariantBody`. The
readiness enum grew in place from 7 to 10 members and is not a new schema.

```text
$ pnpm --filter @embroidery/api openapi:generate      129 / 143 / 284
$ pnpm --filter @embroidery/api openapi:check         up to date
$ pnpm --filter @embroidery/api-client generate       2 files, tree hash d9b0741c…
$ pnpm --filter @embroidery/api-client check:generated up to date
$ pnpm --filter @embroidery/api-client typecheck      pass
```

**The generated client change mechanically required an Admin edit**, exactly as §24
anticipated. `PRODUCT_REQUIREMENT_LABEL` in `apps/admin` is typed as an exhaustive
`Record` over the generated enum — its own comment says "a code added to the contract
fails the build here instead of silently rendering as the unknown fallback" — so the three
labels were added, transcribed verbatim from `N02.D01` §J.1, together with their three
canonical Vietnamese strings in `packages/i18n/messages/vi/admin.json`. This is the
contract's mechanical consequence, not UI work: no component, screen, route, hook or query
was added, and the "Chưa xét" presentation rule remains unimplemented and `N02.A01`'s.

The curated `@embroidery/api-client` export surface was **not** extended — exporting the
three operations for a screen to consume belongs to `N02.A01`, following the
`APP3-B03B` / `APP3-A03-C1` precedent.

---

## Q. Error authority

A vocabulary of its own (`PRODUCT_VARIANT_ERROR_CODES`) rather than more SKU codes: the
two features share a screen, not a subject, and reusing `SKU_VARIANT_NOT_FOUND` for "the
variant you asked to rename is missing" would make one code mean two things to the client
that has to tell them apart.

```text
VARIANT_PRODUCT_NOT_FOUND        404
VARIANT_NOT_FOUND                404
VARIANT_PRODUCT_MISMATCH         404   (this variant *under this product* does not exist)
VARIANT_PRODUCT_NOT_AUTHORABLE   409   (ARCHIVED)
VARIANT_LABEL_REQUIRED           400   (mandated name, §7)
PRODUCT_VARIANT_DUPLICATE        409   (mandated name, §8)
```

`VERSION_CONFLICT` is **absent**, because the concurrency model this feature reuses does
not use one (§H).

Every message is the only free text that reaches a browser, and none names a table, a
column, a constraint, a SQLSTATE, an id or an actor. None echoes the label the request
sent, which would put operator input back on the wire through an error path. Translation
to HTTP happens at exactly one point, in the controller.

Raw database errors cannot escape: there is no unique constraint on the identity, so the
duplicate is settled in the application and the concurrent loser fails as a domain
refusal — asserted with `isProductVariantError` in the race suite.

---

## R. Files changed

**New — runtime (10)**

```text
apps/api/src/modules/catalog/domain/product-variant.policy.ts
apps/api/src/modules/catalog/domain/product-variant.errors.ts
apps/api/src/modules/catalog/domain/repositories/product-variant.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product-variant.repository.ts
apps/api/src/modules/catalog/application/product-variant.service.ts
apps/api/src/modules/catalog/application/product-variant.projection.ts
apps/api/src/modules/catalog/presentation/admin-product-variant.controller.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product-variant.request.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product-variant.response.ts
apps/api/src/modules/catalog/catalog-variant.module.ts
```

**New — tests (7)**

```text
apps/api/src/modules/catalog/domain/product-variant.policy.spec.ts
apps/api/src/modules/catalog/domain/product-publication.sellability.spec.ts
apps/api/src/modules/catalog/presentation/admin-product-variant.contract.spec.ts
apps/api/src/modules/catalog/tests/integration/variant-fixture.ts
apps/api/src/modules/catalog/tests/integration/catalog-variant.integration.spec.ts
apps/api/src/modules/catalog/tests/integration/catalog-variant-race.integration.spec.ts
apps/api/test/integration/product-publication-sellability.integration.spec.ts
```

**Modified — runtime (7)**

```text
apps/api/src/bootstrap/app.module.ts                       CatalogVariantModule registered
apps/api/src/modules/catalog/domain/product-publication.policy.ts        +3 codes, stock exclusion
apps/api/src/modules/catalog/domain/product-publication.readiness.ts     +2 fact shapes, +3 rules
apps/api/src/modules/catalog/domain/repositories/product-publication.repository.ts  snapshot +2
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product-publication.repository.ts
apps/api/src/modules/catalog/application/product-publication.service.ts  carries the new facts
apps/api/src/modules/catalog/application/replace-product-media.use-case.ts  passes empty, reads nothing
```

**Modified — contract, copy and registry (5)**

```text
packages/contracts/openapi/openapi.generated.json          regenerated
packages/api-client/src/generated/*.ts                     regenerated (2 files)
packages/i18n/messages/vi/admin.json                       +3 requirement labels
apps/admin/src/features/products/model/product-publication-copy.ts   +3 exhaustive entries
docs/design/FIGMA_DESIGN_INDEX.md                          21 rows approved
```

**Modified — tests (7)** — change-impact only

```text
apps/api/src/modules/catalog/domain/product-publication.readiness.spec.ts
apps/api/src/modules/catalog/application/product-publication-contracts.spec.ts
apps/api/src/modules/catalog/presentation/{admin,public}-category.contract.spec.ts   140 → 143
apps/api/test/support/product-publication-fixtures.ts      publishable now means buyable
apps/api/test/integration/product-publication{,-api,-races}.integration.spec.ts
apps/admin/test/{boundary,model,components}/product-publication-*.test.*             7 → 10
```

The most consequential test edit is `seedPublishableProduct`: "a publishable product" now
seeds one active variant with one order-eligible SKU, with `sellable: false` to seed the
structurally unsellable one. That single fixture change fixed 21 of the 28 change-impact
failures at once, which is the right shape — the definition of publishable moved, not the
tests' intent.

One Admin assertion needed judgement rather than a number: `offers no archive, delete,
variant or SKU surface` asserted that the words "Phiên bản" and "SKU" appear nowhere in the
publication screen's text. The approved criterion copy now legitimately contains both. The
test was split so it still asserts the *capability* is absent — no button or link whose
name mentions a variant, a SKU or stock, and every occurrence of either word confined to a
requirement row — which is what "surface" always meant.

---

## S. File-size

```text
runtime max   350   product-variant.service.ts          (limit 400, review threshold 300)
              349   product-publication.readiness.ts    (limit 400)
test max      464   catalog-variant.integration.spec.ts (limit 600)
```

Two runtime files sit above the 300-line review threshold and below the 400 hard limit;
both are flagged for a reviewer's attention rather than split, because neither has a
second responsibility to split along — the service is one transaction shape used twice,
and the readiness evaluator is one pure function over one facts type.

`node tools/check-file-size.mjs` reports 83 hard-limit violations repository-wide. **Zero
of them is a file this checkpoint created or modified** — proved by intersecting the
tool's FAIL list with `git status --porcelain`, which is empty. All 83 are pre-existing.

The sellability matrix was given its own spec file rather than appended to the existing
readiness suite: a responsibility boundary (everything in it varies only selling
structure), not a size workaround.

---

## T. Focused tests

```text
product-variant.policy.spec.ts                    21 passed   normalization, identity,
                                                              display order, states
product-publication.sellability.spec.ts           17 passed   states A–E, every/one, currency
admin-product-variant.contract.spec.ts            13 passed   3 operations, no DELETE,
                                                              closed bodies, no stock field
catalog-variant.integration.spec.ts               28 passed   list/create/update, live DB
catalog-variant-race.integration.spec.ts           3 passed   real concurrent connections
product-publication-sellability.integration.spec  12 passed   readiness↔publish, stock, malformed
```

Every §19 and §20 case is covered. Notable ones:

- create on DRAFT **and** on PUBLISHED, refused on ARCHIVED, with the row count asserted
  after each refusal to prove atomic rollback;
- `max + 1` proved through a seeded gap at 7;
- normalized duplicate refused against an **inactive** row;
- `Đen` vs `Den` accepted as two variants; the same identity accepted on another Product;
- one audit row per mutation, target the Product, summary carrying field names and a
  count and asserted **not** to contain the colour the operator typed;
- `updated_at` advanced by the database clock;
- readiness GET and the publish transaction asserted to agree on every refusal;
- publish refused, structure seeded, the *same* command with the *same* token then
  succeeding — the re-read proof.

---

## U. Validation

Selected from `docs/implementation/VALIDATION_GOVERNANCE.md` §3 for what this change
actually touches. Every command below was run; no repository-wide aggregate was used.

```text
git diff --check                                              clean
node tools/check-figma-design-index.mjs                        pass (613 IDs, 28 tables)
pnpm --filter @embroidery/api typecheck                        pass
pnpm --filter @embroidery/api lint                             pass
pnpm --filter @embroidery/api exec jest --testPathPatterns=
  "src/modules/catalog|test/integration/product-publication|test/architecture"
                                                               51 suites, 743 tests, all pass
pnpm --filter @embroidery/api exec jest --testPathPatterns=
  "catalog-sku|admin-sku|product-sku|public-purchasable-sku|public-product-variant"
                                                               14 suites, 203 tests, all pass
pnpm --filter @embroidery/api openapi:generate                 129 / 143 / 284
pnpm --filter @embroidery/api openapi:check                    up to date
pnpm --filter @embroidery/api-client generate                  2 files
pnpm --filter @embroidery/api-client check:generated           up to date
pnpm --filter @embroidery/api-client typecheck                 pass
pnpm --filter @embroidery/api-client test                      8 suites, 53 tests, pass
pnpm --filter @embroidery/admin typecheck                      pass
pnpm --filter @embroidery/admin lint                           pass
pnpm --filter @embroidery/admin exec jest                      138 suites, 1997 tests, pass
pnpm --filter @embroidery/i18n typecheck                       pass
pnpm --filter @embroidery/i18n test                            3 suites, 28 tests, pass
pnpm --filter @embroidery/storefront typecheck                 pass
node tools/check-file-size.mjs                                 0 violations among changed files
node tools/check-report-secrets.mjs                            pass (697 docs, 5463 files)
npx prettier --check .                                         3 pre-existing warnings only
node tools/db-disposable-inventory.mjs                         total 11, unchanged, in_use 0
```

Admin and Storefront were typechecked because the generated-client change mechanically
required it (§P); the full Admin suite was run because the exhaustive label `Record` and
three publication test files were edited.

`prettier --check .` reports three files —
`packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs`, `tools/uat-app12-u01-clone.mjs`,
`tools/uat-app12-u01-world.mjs`. All three are **pre-existing**: `git diff HEAD --stat`
against them is empty. They belong to the suspended `APP12-U01` tooling and were not
touched, and formatting them would be an unrelated edit into a suspended checkpoint's
files.

`APP12-N02.A01`, `APP12-N02.E01` and `APP12-U01` were **not** run.

---

## V. Hygiene

```text
migrations                39      (…0038, 0039; no 0040 exists)
DB tables                 79
Admin routes              26
Storefront routes         20
new HTTP operations        3      Admin only
new HTTP paths             2
public operations         49      unchanged
new stock operations       0
DELETE operations added    0

shared_dev_mutations       0
G03_data_created           false
production_deployed        false
pushed                     false
Figma written              false
.env written               false
credentials rotated        false
```

**Shared-dev integrity, measured rather than asserted.** Against the persistent
development database:

```text
audit_events where action like 'product.variant_%'   0
max(product_variants.created_at)   2026-09-09 04:55:43Z   (predates this session)
max(skus.created_at)               2026-09-09 04:55:43Z   (predates this session)
max(audit_events.created_at)       2026-09-10 00:56:16Z   (predates this session)
tables                             79
```

Every write test ran against a disposable `embroidery_db7_*` database; the harness refuses
to point a mutating context at the persistent one (`assertDisposableName`). Disposable
inventory is `total=11, in_use=0`, identical before and after the run — the seven droppable
databases are pre-existing leftovers from earlier checkpoints, not this checkpoint's.

---

## W. Final baseline

```text
OpenAPI      129 paths · 143 operations · 284 schemas · 49 public operations
Migrations   39
DB tables    79
Routes       Admin 26 · Storefront 20
Registry     613 IDs · 613 node rows · 28 tables
             §4.14 = 21 rows APPROVED_FOR_IMPLEMENTATION
             under FIG-APPROVAL-APP12-N02-D01-PO-001
Readiness    10 criteria
```

---

## X. N02 roadmap

```text
APP12-N02.G01 = COMPLETE — PO PASS
APP12-N02.D01 = COMPLETE — PO APPROVED
APP12-N02.B01 = COMPLETE — AWAITING_PO_REVIEW      ← this report

NEXT = APP12-N02.A01   (Admin sellability UI: the "Phiên bản & SKU" section, the
                        variant and SKU dialogs, the stock handoff link
                        FU-APP12-N02-STOCK-REACHABILITY, the curated api-client
                        exports, and the "Chưa xét" vacuity presentation rule —
                        NOT_EXECUTED)
APP12-N02.E01 = NOT_AUTHORIZED

APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

ROADMAP_CHECKPOINTS = 41
```

Carried forward for `N02.A01`, unchanged from D01:

- `FU-APP12-N02-STOCK-REACHABILITY` — the per-SKU `/kho/skus/{skuId}` link;
- `FU-APP12-G03-02B` — `low_stock_threshold` still has no authoring surface;
- the vacuity presentation rule (`N02.D01` §J.4), which this checkpoint deliberately did
  **not** implement: the contract carries `satisfied: true|false` and nothing more.

STOP.
