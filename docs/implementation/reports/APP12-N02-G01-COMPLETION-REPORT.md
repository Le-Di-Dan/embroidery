# APP12-N02.G01 — Ready-Made Sellability Authoring & Publication Readiness — Gap Audit

```text
APP12-N02.G01             = COMPLETE — AWAITING_PO_REVIEW
APP12-N02                 = AUDIT_COMPLETE

RUNTIME_CHANGES           = 0
DB_WRITES                 = 0
FIGMA_CHANGES             = 0
OPENAPI_CHANGES           = 0
GENERATED_CLIENT_CHANGES  = 0
MIGRATIONS_ADDED          = 0

APP12-U01                 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01                 = NOT_AUTHORIZED
APP12-R01                 = NOT_AUTHORIZED
ROADMAP_CHECKPOINTS       = 41

PRODUCTION_DEPLOYED       = false
PUSHED                    = false
NEXT                      = PO_REVIEW_REQUIRED
```

Date: 2026-09-10 · Branch: `feat/app11-s04-seo-infrastructure`

---

## A. Verdict

Both U01 blockers are **confirmed against source, contract and the live shared
database**. Neither is a regression, and neither is a misreading of U01: the
repository contains no operation that writes a `product_variants` row, and the
one operation that writes a `skus` row has no Admin call site.

The audit also found **three things U01 could not have seen**, because U01 stopped
at the first missing surface:

1. **The stock screen is unreachable too, and circularly so.**
   `/kho/skus/{skuId}` is linked from exactly one place in the Admin —
   `order-items-table.tsx`, a row of an *existing order*. It is in neither the
   primary nav nor the home launchpad. So even an operator who possessed a SKU
   could only reach its stock screen through an order for a product that is not
   yet sellable. This is a third unreachable surface, not a consequence of the
   first two (§G.4, §J.3).

2. **Readiness is not merely silent about sellability — it cannot see it.**
   `ProductPublicationSnapshot` carries `product`, `category` and `media` and
   nothing else. No variant, SKU or stock row is read on either the readiness
   path or the publish path. Adding a criterion is therefore a change to the
   *facts* the evaluator receives, not only to the rule set (§H).

3. **Two PUBLISHED Products in the shared development world are already
   structurally unbuyable**, and one of them is not the shape U01 predicted:
   `tui-vai-theu-thu-cong` has 0 variants, and `ao-thun-cotton` has 1 active
   variant and **0 SKUs**. The second case proves that "has a variant" alone is
   not a sufficient criterion (§I).

The audit further establishes that the gap has a **datable origin**:
`APP2-A03-G01` (2026-07-31) deliberately **removed** the `Phiên bản & SKU`
section from the approved Admin Product Form, on the correct ground that at the
time no B02 operation had a field for it. That decision was right then and is the
direct ancestor of BLOCKER_A now (§N.1).

Recommended shape, argued in §K and §M:

```text
API      CREATE + UPDATE variant, no DELETE          (2 operations)
READY    + HAS_ACTIVE_VARIANT                        BLOCKING
         + HAS_ORDER_ELIGIBLE_SKU                    BLOCKING
         + SKU_PRICE_RESOLVABLE                      BLOCKING
         + SKU_STOCK_AUTHORITY_EXISTS                NOT_REQUIRED
         stock quantity                              NEVER a criterion
LOW      low_stock_threshold                         NONBLOCKING_FOR_N02
```

Nothing was written. No runtime file, no migration, no Figma node, no database
row, no `.env`.

---

## B. N01 PO closure reconciliation

Taken as given, not reopened:

```text
APP12-N01.B01 = COMPLETE — PO PASS
APP12-N01.S01 = COMPLETE — PO PASS
APP12-N01.E01 = COMPLETE — PO PASS
APP12-N01     = COMPLETE — PO CLOSED

REAL_INBOX_MANUAL               = PASS
REAL_EMAIL_RECEIVED             = true
OTP_FROM_REAL_INBOX_VERIFIED    = true
RESEND_REAL_INBOX               = PASS
PHONE_SMS_VERIFICATION_PRESENT  = false
```

`FU-APP12-U01-NOTIFICATION-PROVIDER` — U01's blocker 2, "no channel reaches a
customer" — is **closed by N01** and is not carried into N02. N02 owns U01's
blocker 1 and nothing else.

The three N01 operational findings (stale dev worker image after a workspace
dependency addition; `NOTIFICATION_DELIVERY_ENVELOPE_KEY` never configured in the
ordinary dev stack; gateway retaining a stale upstream after an API recreate) are
recorded here as **operational hardening findings** and are explicitly **not**
N02 sellability work. They are carried to pre-`R01` triage as
`FU-APP12-N01-OPS-01..03` (§P.4).

---

## C. Human-PO roadmap override

```text
PREVIOUS_ROADMAP_CHECKPOINTS = 40
NEW_ROADMAP_CHECKPOINTS      = 41

... APP12-G03
→ APP12-N01 — EMAIL-ONLY OTP DELIVERY
→ APP12-N02 — READY-MADE SELLABILITY AUTHORING & PUBLICATION READINESS
→ APP12-U01
→ APP12-E01
→ APP12-R01 ...

APP12-N02 = AUTHORIZED         CURRENT_INTERNAL_PACKAGE = N02.G01
APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED     APP12-R01 = NOT_AUTHORIZED
```

**A documentation defect found while reconciling this.** The canonical status
table — `phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md` §0 and §0.8 — was
still at `CHECKPOINTS = 39`, still carried only the 2026-09-05 M01 override, and
still recorded `APP12-U01 = NOT_STARTED`. The N01 insertion (39 → 40) had never
been written into it, and U01 has in fact run and returned `CORRECTION_REQUIRED`.
The phase plan was therefore **two overrides and one verdict stale**.

G01 corrects that table and only that table (§S). No new top-level checkpoint id
was invented: following the `29·M` precedent set by the M01 override, N01 and N02
enter as `29·N1` and `29·N2`, so rows 30–38 are not renumbered.

---

## D. U01 blocker reconciliation

| U01 claim | N02.G01 finding | Verdict |
|---|---|---|
| No delivered operation creates a `product_variants` row | Confirmed. 127 paths / 140 operations contain exactly two variant-bearing paths, both of which *consume* a `variantId` (§F.1) | **CONFIRMED** |
| `DrizzleProductRepository.addVariant` exists with no callers | Confirmed. One port declaration, one adapter implementation, **two callers, both integration tests** (§E.2) | **CONFIRMED** |
| `adminSku_create` has zero Admin call sites | Confirmed. `adminSkuCreate` and `adminSkuUpdate` are exported by the generated client and imported by **no** file under `apps/admin/src` (§F.3) | **CONFIRMED** |
| Publication readiness reports 7/7 green with 0 variants / 0 SKUs / no stock | Confirmed, and stronger than reported: the readiness evaluator never receives a variant, SKU or stock fact at all (§H.1) | **CONFIRMED, WIDENED** |
| A PUBLISHED Product can be permanently unbuyable | Confirmed, and **already true of two rows in the shared dev world** (§I) | **CONFIRMED, OBSERVED IN DATA** |

Nothing in U01's §F was found to be overstated. One thing was found to be
*understated*: the stock surface is unreachable as well (§G.4).

---

## E. Product-variant persistence audit

### E.1 Schema

`product_variants` — `packages/database/src/schema/catalog/product-variants.ts`,
physical DDL `migrations/0007_create_catalog_tables.sql:44-54,123,131`.
No later migration alters it; there is no migration `0040`.

```text
id            uuid    NOT NULL   pk_product_variants
product_id    uuid    NOT NULL   fk_product_variants__product_id → products(id) ON DELETE restrict
color_name    text    NULL
size_label    text    NULL
display_order integer NOT NULL
is_active     boolean NOT NULL
created_at / updated_at  timestamptz NOT NULL default now()

ix_product_variants__product_display (product_id, display_order)   -- IDX-068, non-unique
```

Four facts matter for N02:

- **There is no CHECK and no UNIQUE constraint on the table.** Nothing at the
  database level prevents two variants of one product with identical
  `(color_name, size_label)`, or two with the same `display_order`. The public
  read already compensates for the second — it orders by
  `(display_order, id)` precisely because `display_order` is not unique
  (`drizzle-public-product-variant.repository.ts:124-127`) — but the *duplicate
  identity* case has no compensator anywhere. A variant write API must decide
  this deliberately (§L.3).
- **Both attribute columns are nullable.** A variant with `color_name = NULL`
  and `size_label = NULL` is legal. `APP12-B01` already established that the
  platform publishes no customer-visible SKU differentiator, so a variant with
  no label is a real state a customer would see as an unnamed option.
- `is_active` delists without archiving. There is no `archived_at`.
- The FK is `ON DELETE restrict`, as is **every** FK pointing at this table.

### E.2 Repository surface, and its callers

`ProductRepository` (`domain/repositories/product.repository.ts:171`) declares:

```text
create      addVariant      addSku      addSide      addArea      changeStatus
findById    findBySlug      loadStructure           findSkuByCode
```

`addVariant` is `@requiresTransaction`, implemented at
`infrastructure/persistence/drizzle-product.repository.ts:60-76`. It inserts
`id, product_id, color_name, size_label, display_order` and **hard-codes
`is_active: true`**.

Callers, repository-wide:

```text
apps/api/.../tests/integration/catalog-persistence.integration.spec.ts:120     TEST
apps/api/.../tests/integration/public-product-variant.integration.spec.ts:133  TEST
------------------------------------------------------------------------------
non-test callers            0
application-service callers 0
HTTP operation callers      0
Admin callers               0
```

**There is no `updateVariant`, no `deactivateVariant` and no `removeVariant` on
any port in the repository.** The write surface for a variant is one insert that
can only ever produce an active row. `is_active = false` is a state the schema
permits and the public read honours (`.where(eq(productVariants.isActive, true))`)
and that **no delivered code path can ever produce**.

### E.3 Historical decision trail

`FU-APP12-G03-02` (`APP12-G03` report, line 594) already recorded
"`product_variants` has a repository writer with zero callers"; `APP12-U01`
escalated it to `FU-APP12-G03-02A` and probed it against the running system.
G01 confirms both and adds the *update/deactivate* half, which neither
predecessor stated: the gap is not only "cannot create", it is "cannot change".

---

## F. SKU authority audit

### F.1 The delivered contract

Measured from `packages/contracts/openapi/openapi.generated.json` at HEAD:

```text
POST   /api/admin/products/{productId}/variants/{variantId}/skus   adminSku_create
PATCH  /api/admin/skus/{skuId}                                     adminSku_update
GET    /api/admin/skus/{skuId}/stock                               adminSkuStock_get
POST   /api/admin/skus/{skuId}/stock/adjustments                   adminSkuStock_adjust
GET    /api/admin/skus/{skuId}/stock/ledger                        adminSkuStock_ledger
GET    /api/public/products/{slug}/variants                        publicProductVariant_list
```

Those are **all six** paths in the whole contract matching `/variant/i` or
`/sku/i`. The create path names a `variantId` it does not create; the public path
reads variants it does not write. **Zero operations write `product_variants`.**

### F.2 Semantics of `adminSku_create` / `adminSku_update`

`ProductSkuService` (`application/product-sku.service.ts`) is well built and is
**not** the defect. Every mutation runs one transaction that locks the owning
`product_variant` `FOR UPDATE`, proves the product/variant relationship from the
locked rows, re-reads the variant's whole SKU set under that lock, applies the
mutation, re-evaluates order eligibility and refuses an ambiguous result
(`SKU_ORDER_ELIGIBLE_AMBIGUOUS`).

```text
order-eligible  ≡  skus.is_active = true          (product-sku.policy.ts)
MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT = 1
zero eligible   legal and reachable, deliberately not prevented
```

Create body (`.strict()`): `code`, `priceOverrideAmount?`, `isActive` — `isActive`
explicit rather than server-defaulted. Price override is a **decimal string**,
`^\d{1,12}$`, never a JSON number. `code` carries no alphabet, length, nonblank
or normalization rule — `APP7-B01-FD1` removed all of them, so `uq_skus__code`
is genuine byte-level business uniqueness.

Authorable product states: `DRAFT` and `PUBLISHED`, not `ARCHIVED`
(`SKU_AUTHORABLE_PRODUCT_STATES`). **This is important for N02**: a SKU may be
added to an already-PUBLISHED Product, which is exactly what a recovery path for
the two malformed rows in §I requires, and it needs no new authority.

Price resolution is `COALESCE(skus.price_override_amount, products.base_price_amount)`
(BR-021 / `IMP-D058`), read from the product row rather than assumed
(`drizzle-public-product-variant.repository.ts:90-94`).

### F.3 Admin call sites — proof of zero

```text
grep -rn "adminSkuCreate|adminSkuUpdate|adminSkuStockGet|adminSkuStockAdjust" apps/admin/src

apps/admin/src/features/sku-stock/services/sku-stock.service.ts:19,47        adminSkuStockGet
apps/admin/src/features/sku-stock/services/stock-adjustment.service.ts:14,38 adminSkuStockAdjust
------------------------------------------------------------------------------------------------
adminSkuCreate   0 call sites
adminSkuUpdate   0 call sites
```

Both are exported by the generated client
(`packages/api-client/src/generated/embroidery-api.ts:1581,1725`), so this is a
missing *consumer*, not a missing client. **`PROVEN: adminSku_create has zero
Admin UI call sites.`**

---

## G. Stock authority audit

### G.1 The anchor is created lazily, and by a read

`SkuStockAnchorProvisioner.ensure` (`inventory/application/admin/sku-stock-anchor.provisioner.ts`)
is the **only** creator of a `sku_stocks` row. It inserts
`ensureStockRow(newId(), skuId, 0)` with `ON CONFLICT DO NOTHING` under
`uq_sku_stocks__sku`, then reads. It has exactly three callers:

```text
read-sku-stock.query.ts:48          adminSkuStock_get       ← a GET
read-sku-stock-ledger.query.ts:48   adminSkuStock_ledger    ← a GET
adjust-sku-stock.use-case.ts:88     adminSkuStock_adjust
```

So **`GET /api/admin/skus/{skuId}/stock` does lazily create the anchor**, at
quantity `0`, inside the transaction that then takes the row lock and computes
availability. The docblock is explicit that `0` is "the repository's initial
value, not a business default": an anchor never adjusted describes a SKU with
nothing on hand.

The `skus` FK is the authority on whether the SKU exists — there is no `skus`
read in the inventory module and no Catalog port in its injector;
`fk_sku_stocks__sku_id` decides, and `REFERENCE_NOT_FOUND` is translated to
`SKU_NOT_FOUND`.

### G.2 The four §3.3 questions, answered

```text
Can a new SKU be explicitly configured to stock = 0?
  YES, but only implicitly. The anchor is provisioned at 0 by the first stock
  GET. There is NO absolute-set operation: adjustments are delta-only and a
  delta of 0 is a 400 ("A stock adjustment must change the quantity",
  admin-sku-stock.request.ts). "Configure to zero" therefore means "read the
  stock once and adjust nothing", which is a legitimate and complete operator
  action requiring no new API.

Does GET lazily create an anchor?
  YES — read-sku-stock.query.ts:48. Confirmed in data: 14 active SKUs, 14
  sku_stocks rows, 0 active SKUs without an anchor (§I.1).

Does publication require a stock row today?
  NO. Readiness reads no stock fact of any kind (§H.1).

Would requiring stock > 0 incorrectly block valid sold-out publication?
  YES, and it is forbidden by the locked decisions. G03 deliberately seeded
  out-of-stock coverage, PUBLISHED_READY_MADE_MAY_BE_SOLD_OUT = true, and the
  Storefront already renders "Tạm hết hàng" as a legitimate published state.
  Requiring quantity > 0 would make the sold-out state unpublishable and would
  make republication of a sold-out Product impossible.
```

### G.3 `low_stock_threshold` has no application writer

```text
readers   sku-stock.view.ts:79-82 (lowStock = threshold IS NOT NULL AND qty <= threshold)
          admin-sku-stock.controller.ts:253 (omitted from the body when undefined)
          apps/admin/.../stock-presentation.ts
writers   NONE in apps/ or packages/
          tools/seed-app12-g03-direct.mjs:225 — a documented direct-SQL seeder
          exception ("Exception 2"), because the field is unrepresentable by
          any delivered operation
```

The adjustment body is `.strict()` and names `lowStockThreshold` among the keys
it refuses. In the live shared world 5 of 14 stock rows carry a threshold, and
**all five were written by the seeder**. This is `FU-APP12-G03-02B` /
`FU-APP12-U01-LOW-STOCK-AUTHORITY`, confirmed. Disposition in §O.

### G.4 The stock screen is reachable from one place, and it is the wrong place

```text
/kho/skus/{skuId}   apps/admin/src/app/(protected)/kho/skus/[skuId]/page.tsx
adminSkuStockRoute()  apps/admin/src/features/sku-stock/model/sku-stock-route.ts:13

callers of adminSkuStockRoute:
  apps/admin/src/features/order-detail/components/order-items-table.tsx:98
  ------------------------------------------------------------------------
  total: 1, and it is a row of an existing order

primary nav      (admin-shell-nav.ts)          NOT PRESENT
home launchpad   (admin-home-destinations.ts)  NOT PRESENT
Product editor / Product list                  NOT PRESENT
```

Both files say why, and both were right at the time: `APP8-B01` publishes stock
**by SKU only** and ships no all-SKU availability query, so a parameterless
`/kho` "would be a screen with no operation behind it"; the capability
"starts from a known `skuId` and is reached from a surface that already holds
one". In APP8 the only such surface was an order.

The consequence in Wave 1 is circular and is a **finding of its own**: to
configure a new SKU's stock an operator must reach `/kho/skus/{skuId}`, which is
linked only from an order for a product that cannot be ordered until its stock is
configured. Even after variant and SKU authoring ship, N02 is not complete unless
the Product editor links to the stock screen for each of its SKUs.

This is raised as `FU-APP12-N02-STOCK-REACHABILITY` and is **in scope for
`N02.A01`** — it needs no new operation, only a link from a surface that holds
the `skuId`.

---

## H. Publication-readiness audit

### H.1 Why U01 saw 7/7 green — the mechanical answer

`evaluatePublicationReadiness` (`domain/product-publication.readiness.ts:196`)
evaluates exactly seven codes, and the closed set is
`PRODUCT_PUBLICATION_REQUIREMENT_CODES` (`product-publication.policy.ts:81-89`):

```text
PRODUCT_NAME_READY              name and slug present
PRODUCT_DESCRIPTION_READY       description present
PRODUCT_CATEGORY_READY          category PUBLISHED and not archived
PRODUCT_PRICE_READY             base price a whole đồng > 0
PRODUCT_MEDIA_READY             contiguous display_order from 0, first THUMBNAIL
PRODUCT_MEDIA_ASSETS_READY      every referenced asset still eligible
PRODUCT_MEDIA_DERIVATIVES_READY THUMBNAIL + CATALOG_PREVIEW ready, unwatermarked
```

Every one of the seven is a statement about **presentation**. None is a statement
about commerce. So a Product with zero variants satisfies all seven correctly —
the evaluator is not wrong, it is answering a different question from the one the
operator reads off the screen.

The deeper fact, which U01 did not report: the evaluator **cannot** answer the
commercial question, because the facts never reach it.
`ProductPublicationSnapshot` (`domain/repositories/product-publication.repository.ts:47`)
is exactly:

```text
product   ProductDraft | undefined
category  PublicationCategoryRow | undefined
media     readonly PublicationMediaRow[]
```

`readSnapshot` and `lockSnapshot` read products, categories and product_media.
`ProductPublicationService.evaluate` then adds assets and derivatives. **No
statement anywhere on either path touches `product_variants`, `skus` or
`sku_stocks`.** Adding a sellability criterion is therefore a two-part change —
new facts on the snapshot port, then new codes in the closed set — and both
halves belong to `N02.B01`.

### H.2 The seam is good, and it should be used unchanged

Three properties of the delivered design make the tightening safe and cheap, and
N02 must preserve all three:

- **One evaluator, two callers.** The readiness GET and the publish transaction
  run the *same* pure function over the *same* fact shape; `locked` is the only
  difference. A criterion added once is enforced on both paths by construction.
- **Publish never trusts a previous readiness read.** It re-locks and re-evaluates
  inside its own transaction, so a variant deactivated between the GET and the
  publish is caught.
- **Unpublish deliberately does not re-run readiness.** "A product whose category
  was archived after publication is exactly the one an operator most needs to be
  able to unpublish." The same reasoning protects the §I rows: tightening
  readiness must not make an existing malformed PUBLISHED Product *unwithdrawable*.

### H.3 Locked constraint, restated

```text
stock quantity > 0 MUST NOT be a publication requirement.
```

Honoured throughout §M. Nothing recommended below reads `quantity_on_hand`.

---

## I. Existing malformed published data

Read-only census of the **shared development database**, `set session
characteristics as transaction read only`, `SELECT` only, zero writes.

### I.1 Census

```text
tables 79    products 37    published 9    variants 16 (16 active)
skus 14 (14 active)         sku_stocks 14  thresholds set 5
active SKUs without a stock anchor: 0
```

### I.2 Published Products by sellability structure

| slug | base price | variants | active | SKUs | active | stock rows |
|---|---|---|---|---|---|---|
| `ao-thun-cotton` | 250 000 | 1 | 1 | **0** | **0** | **0** |
| `tui-vai-theu-thu-cong` | 250 000 | **0** | **0** | **0** | **0** | **0** |
| `uat-goi-tua-theu-chim-hac` | 520 000 | 2 | 2 | 2 | 2 | 2 |
| `uat-goi-tua-theu-hoa-sen` | 450 000 | 1 | 1 | 1 | 1 | 1 |
| `uat-khan-choang-theu-vien` | 390 000 | 2 | 2 | 2 | 2 | 2 |
| `uat-mu-noi-theu-hoa-nhi` | 265 000 | 1 | 1 | 1 | 1 | 1 |
| `uat-non-luoi-trai-theu-logo` | 210 000 | 4 | 4 | 4 | 4 | 4 |
| `uat-tui-tote-theu-chi-vang` | 280 000 | 1 | 1 | 1 | 1 | 1 |
| `uat-tui-vai-theu-hoa-cuc` | 320 000 | 3 | 3 | 3 | 3 | 3 |

```text
MALFORMED PUBLISHED PRODUCTS = 2
  tui-vai-theu-thu-cong   0 variants, 0 SKUs   → would fail HAS_ACTIVE_VARIANT
  ao-thun-cotton          1 variant,  0 SKUs   → would fail HAS_ORDER_ELIGIBLE_SKU

WELL-FORMED (the 7 G03 uat- Products) = 7
```

Both malformed rows pre-date G03. `ao-thun-cotton` is the more instructive: it is
the exact counter-example to a one-criterion fix, and it is why §M recommends
`HAS_ACTIVE_VARIANT` and `HAS_ORDER_ELIGIBLE_SKU` as **two** criteria rather than
one composite.

### I.3 Order-eligible SKUs per active variant

```text
0 eligible SKUs   2 variants   ← the two malformed shapes above
1 eligible SKU   14 variants
2 or more         0 variants   ← MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT holds in data
```

### I.4 Disposition — mutate nothing

Tightened readiness governs **future publication and republication only**. The two
rows are reported, not touched:

```text
AUTO_UNPUBLISH        = false
ROWS_MUTATED          = 0
RECOVERY              = ordinary operator work once N02.A01 ships: both Products
                        are PUBLISHED, and SKU_AUTHORABLE_PRODUCT_STATES already
                        includes PUBLISHED, so a variant + SKU can be added to
                        each without unpublishing (§F.2)
CAVEAT FOR N02.B01    = unpublish must keep NOT re-running readiness (§H.2), or
                        these two rows become unwithdrawable
```

---

## J. Admin Product UX audit

### J.1 What exists today

```text
/products                        list
/products/new                    create — 3 POST fields (categorySlug, name, description)
/products/{productId}            edit/detail
/products/{productId}/placement  embroidery sides and areas
/products/{productId}/publication readiness checklist + Xuất bản / Gỡ xuất bản
/kho/skus/{skuId}                SKU stock — reachable only from an order row (§G.4)
```

The edit form publishes exactly four field groups
(`model/product-form-copy.ts:80-86`):

```text
basic · category · price · media        (mobile merges the last three)
```

Plus two navigation entries: `ProductPlacementEntry` and
`ProductPublicationEntry`. **No variant section, no SKU section, no stock
section, and no link to `/kho`.** This matches U01 §F.1 exactly.

A PUBLISHED Product renders `ProductPublishedMediaForm` — after `APP12-M01.B2`
the screen offers exactly one write on a published row, the ordered image
selection. That precedent matters: N02 will need a *second* bounded
published-Product capability (adding a variant/SKU to `ao-thun-cotton`), and M01
has already established how to narrow the PUBLISHED lock to a specific section
rather than lock the whole form.

### J.2 The smallest workflow that removes DB intervention

```text
1  /products/new                  create draft            EXISTS
2  /products/{id}                 name, description,
                                  category, base price     EXISTS
3  /products/{id}                 attach media             EXISTS
4  /products/{id}  §Phiên bản     create variant           MISSING — needs 1 new API
5  /products/{id}  §Phiên bản     create SKU on variant    MISSING UI ONLY
                                  (adminSku_create exists)
6  → /kho/skus/{skuId}            configure stock          MISSING LINK ONLY
                                  (GET provisions the 0 anchor; adjust if > 0)
7  /products/{id}/publication     truthful readiness       NEEDS 3 NEW CRITERIA
8  /products/{id}/publication     Xuất bản                 EXISTS
```

**One missing operation. One missing UI. One missing link. Three missing
criteria.** That is the whole gap. Steps 5 and 6 need no backend work at all.

### J.3 Where the variant/SKU capability belongs

A section on `/products/{productId}`, beside the existing four groups — not a new
route. Reasons: `adminSku_create` is already nested under
`/products/{productId}/variants/{variantId}/skus`, so the Product is already the
aggregate boundary; the operator's mental step 4–6 sits between "price" and
"publish"; and a separate route would need its own breadcrumb, its own load
boundary and its own approved design, which triples `N02.D01`.

Not designed here. `N02.D01` owns it.

---

## K. API-shape recommendation

```text
RECOMMENDED = CREATE + UPDATE          (2 new operations)
REJECTED    = CREATE only              (leaves is_active:false unreachable — see below)
REJECTED    = CREATE + UPDATE + DELETE (see §L)
```

```text
POST   /api/admin/products/{productId}/variants   adminProductVariant_create
PATCH  /api/admin/products/{productId}/variants/{variantId}
                                                  adminProductVariant_update
```

Both sit under `/api/admin/products/{productId}/…`, the same aggregate boundary
`adminSku_create` already uses — so the checkpoint satisfies
`04-BACKEND-API-DELIVERY-STANDARD.md` §2: two APIs (preferred band is one to
three, maximum five), one aggregate.

**Why UPDATE is not optional.** `addVariant` hard-codes `is_active: true` and no
port can change it (§E.2). Without UPDATE, `is_active = false` — a state the
schema declares, the public read honours and `APP12-B01`'s projection depends on
— remains permanently unreachable, and an operator who mistypes `Đen / M` has no
delivered way to correct it. `adminSku_update` sets exactly this precedent for
the child table; the parent should not be the one row in the aggregate that is
write-once.

**What must NOT be duplicated.** SKU creation, SKU update, stock read, stock
adjustment and stock ledger all exist, all work, and are reused unchanged. N02
adds no stock operation, no absolute-set operation and no low-stock-threshold
operation (§O). The `PATCH` field set should be `colorName?`, `sizeLabel?`,
`displayOrder?`, `isActive?` with at-least-one-field enforced, mirroring
`updateSkuBodySchema`'s existing refinement.

---

## L. Variant deletion / update safety

DELETE is **not recommended**. The evidence:

### L.1 Every FK to `product_variants` is `ON DELETE restrict`

```text
skus                                fk_skus__product_variant_id
design_sessions                     fk_design_sessions__product_variant_id
custom_requests                     fk_custom_requests__product_variant_id
custom_request_quantity_breakdowns  fk_custom_request_quantity_breakdowns__product_variant_id
design_versions                     fk_design_versions__product_variant_id
approval_snapshots                  fk_approval_snapshots__product_variant_id
```

Six referencing tables, all `restrict`, all `NO ACTION` on update. And the live
shared world already holds such references:

```text
custom_requests                     7
design_versions                     6
approval_snapshots                  1
custom_request_quantity_breakdowns  1
design_sessions                     0
```

Four of those five tables are Wave-2 COP surfaces, and `approval_snapshots` is an
**immutable approved-design snapshot** that `CLAUDE.md` §9 forbids mutating.
`order_items` and `quotation_line_items` reference `skus`, which references the
variant — so an order transitively pins its variant through two `restrict` FKs.

### L.2 If DELETE were ever authorized, the refusal authority would be

For completeness, since §3.7 asks. A variant may not be deleted when it:

```text
owns any SKU                      → refuse; skus is restrict, and a SKU may
                                    itself be pinned by an order_item
belongs to a PUBLISHED Product    → refuse; publication is a public promise and
                                    the delete would silently shrink a live
                                    selection set
is referenced by design_sessions, custom_requests,
custom_request_quantity_breakdowns, design_versions or
approval_snapshots                → refuse; approval_snapshots in particular is
                                    immutable commercial history
```

That is five distinct refusals to specify, test and translate, for a capability
no locked decision requires. The schema already provides the correct alternative:
**`is_active = false` delists a variant without archiving it, and "history is
safe either way because commercial snapshots copy by value"**
(`catalog/product-variants.ts` docblock, REL-021). Deactivation is the delisting
mechanism this schema was designed around.

### L.3 What UPDATE must still guard

- **Deactivating the last active variant of a PUBLISHED Product** makes that
  Product structurally unbuyable — the same end state as the §I rows. `N02.B01`
  must decide this explicitly. Recommended: **allow it, and surface it** — the
  operator legitimately needs to delist a sold-out colour, and preventing it
  would be a new business rule N02 has no authority to invent. It becomes visible
  because readiness will then report `HAS_ACTIVE_VARIANT` unsatisfied on the next
  republication attempt.
- **Duplicate `(color_name, size_label)`** has no database constraint (§E.1). The
  write path should refuse a duplicate within the product, in the same
  lock-then-re-read-then-settle shape `ProductSkuService` already uses. Do **not**
  add a UNIQUE index for it in N02 — that is a migration, and both attribute
  columns are nullable, so `NULL`s would not be caught by one anyway.
- **`display_order` collisions** are already tolerated by the public read's
  `(display_order, id)` total ordering. Server-assign the next order on create;
  do not invent a uniqueness rule.

---

## M. Publication-readiness criterion matrix

```text
READY_FOR_PUBLICATION  =  representable publicly  AND  valid commerce structure
READY_FOR_PUBLICATION  ≠  has inventory > 0
```

| Criterion | Rule | Recommendation | Source |
|---|---|---|---|
| `HAS_VARIANT` → **`HAS_ACTIVE_VARIANT`** | ≥ 1 `product_variants` row with `is_active = true` | **BLOCKING** | The public read filters on `is_active` (`drizzle-public-product-variant.repository.ts:118`), so an inactive-only Product returns an empty selection set. Bare "has a variant" would pass a Product whose only variant is delisted. |
| `HAS_ACTIVE_SKU` → **`HAS_ORDER_ELIGIBLE_SKU`** | ≥ 1 `skus` row with `is_active = true` on an active variant | **BLOCKING** | "Order-eligible ≡ `is_active = true`" is already the locked vocabulary (`product-sku.policy.ts`). `ao-thun-cotton` (§I.2) is the live proof that variant-existence alone is insufficient. |
| **`SKU_PRICE_RESOLVABLE`** | for ≥ 1 order-eligible SKU, `COALESCE(price_override_amount, base_price_amount)` is a whole đồng > 0 | **BLOCKING** | BR-021 / `IMP-D058`. Not redundant with `PRODUCT_PRICE_READY`: a SKU may carry an override of `0`, which `ck_skus__price_override_non_negative` permits and which `PRODUCT_PRICE_READY` never sees. Reuse `isPublishablePrice` unchanged. |
| `SKU_STOCK_AUTHORITY_EXISTS` | a `sku_stocks` anchor exists for the eligible SKU | **NOT_REQUIRED** | Three independent reasons: (1) the anchor is provisioned lazily at 0 by the first stock GET, so its absence means "nobody has opened the stock screen yet", not "stock is unmanaged"; (2) `sku_stocks`' own docblock says rows are created by admin initialisation, **not lazily on the order path**, so requiring one at publish time would import an inventory concern into a catalog decision; (3) it would be an inventory read on the publish path, widening a snapshot port that today touches only Catalog tables. |
| stock quantity > 0 | — | **FORBIDDEN** | Locked. `PUBLISHED_READY_MADE_MAY_BE_SOLD_OUT = true`. |
| `low_stock_threshold` set | — | **NOT_REQUIRED** | Locked: `LOW_STOCK_THRESHOLD_IS_NOT_A_PUBLICATION_BLOCKER = true`. See §O. |

**Resulting closed set: 10 codes** (7 existing, unchanged and in their locked
order, + 3 appended). Consequences `N02.B01` must carry:

```text
PRODUCT_PUBLICATION_REQUIREMENT_CODES is an OpenAPI enum
  (presentation/schemas/admin-product-publication.response.ts:24)
  → 3 new enum members → OPENAPI + GENERATED CLIENT regeneration required
  → CMD-OPENAPI-GENERATE / CMD-OPENAPI-CHECK / CMD-API-CLIENT-GENERATE / -CHECK

Admin copy is exhaustive over the enum
  (apps/admin/src/features/products/model/product-publication-copy.ts)
  → 3 new Vietnamese labels required, and they must come from approved design
    copy, not be invented in the component (V02-C1 i18n authority)

ProductPublicationSnapshot must gain the facts (§H.1)
  → readSnapshot: plain reads; lockSnapshot: FOR SHARE, matching how category
    and media are already locked — variants and SKUs must only *stay as they
    are* until commit, exactly the argument the port's docblock already makes
  → batched, never per-item: one statement for variants, one for SKUs
```

**Vacuity check, on the `PRODUCT_MEDIA_READY` precedent.** With zero variants,
`HAS_ORDER_ELIGIBLE_SKU` and `SKU_PRICE_RESOLVABLE` are vacuously unsatisfiable.
The existing evaluator's stated rule is that the requirement reporting the
*actual* problem should be the one that fails, and "reporting three failures for
one missing fact would tell the operator to fix three things". `N02.B01` should
follow it: with no active variant, report `HAS_ACTIVE_VARIANT` unsatisfied and
treat the two SKU codes as **satisfied-vacuously**, exactly as the asset and
derivative codes behave with no media.

---

## N. Figma / design authority preflight

`docs/design/FIGMA_DESIGN_INDEX.md` read; **no Figma node was opened, created or
modified**. `FIGMA_CHANGES = 0`.

### N.1 The registry records the origin of the gap

`APP2-A03-G01` (2026-07-31), registry lines 179-196 — the mandatory pre-code audit
found the five approved Product Draft nodes could not be implemented truthfully,
and among the reasons:

> **`Phiên bản & SKU` had no field in any B02 operation.**

The reconciliation "removes Variants/SKU and the publication-readiness rail" and
promoted the five reconciled rows under
`FIG-APPROVAL-APP2-A03-G01-PRODUCT-FORM-001`.

That was the correct call in APP2: designing a section no operation could serve
would have been the anti-pattern. It is nonetheless the exact ancestor of
BLOCKER_A, and it means **there has never been an approved Admin variant/SKU
design in this repository's history**.

### N.2 What is approved today

```text
/products/{productId}   Product Editor
  FIG-APP12-M01-D1-ADMIN-PUBLISHED           936:187  Desktop 1440  APPROVED
  FIG-APP12-M01-D1-C1-ADMIN-PUBLISHED-MOBILE 948:355  Mobile 390    APPROVED
  (+ the APP2-A03-G01 reconciled create/edit rows)
  → carry NO variant, SKU or stock section

/kho/skus/{skuId}       SKU Stock  (APP8-D01, page APP_08)
  775:3 · 775:101 · 776:3 · 776:54 · 776:142 · 789:3   APPROVED
  777:3/33/60/83/99 adjustment dialog · 777:125 ledger  APPROVED
  → the stock screen itself is fully designed and implemented

FIG-APP8-SCOPE-BOUNDARY  788:52
  names low-stock-threshold authoring and an all-SKU stock list among fifteen
  capabilities APP8 deliberately does not carry, each with the backend reason
```

### N.3 Gate consequence

```text
APPROVED_VARIANT_SKU_ADMIN_DESIGN = NONE
```

Per `CLAUDE.md` §3, a frontend UI checkpoint must **block** when the registry
entry is missing. `N02.A01` is therefore blocked until `N02.D01` creates and the
Product Owner approves the frames. `N02.D01` is not optional and not merged into
`N02.A01`.

`N02.D01` scope, minimally: the `/products/{productId}` variant & SKU section at
1440 / 1024 / 390 in DRAFT and PUBLISHED, the create-variant and create-SKU
dialogs with their validation and refusal states (including
`SKU_ORDER_ELIGIBLE_AMBIGUOUS`), the link to `/kho/skus/{skuId}`, and the
publication-readiness checklist carrying **10** rows instead of 7 with approved
Vietnamese copy for the three new codes. It amends existing APP_12 nodes rather
than creating a parallel Product Editor. `node tools/check-figma-design-index.mjs`
runs on `N02.D01` and on `N02.A01`.

---

## O. Low-stock-threshold disposition

```text
LOW_STOCK_THRESHOLD = NONBLOCKING_FOR_N02
```

Source inspection does **not** prove it inseparable from the operator SKU/stock
flow, and three findings say it is separable:

1. It is a `sku_stocks` column, not a `skus` column — Inventory's, not Catalog's
   (REL-026 "inventory truth split"). N02's new write authority is Catalog's.
2. The delivered stock adjustment body is `.strict()` and explicitly **refuses**
   `lowStockThreshold` as server/repository-owned. Adding it is a change to a
   closed APP8 contract, with its own request-schema, use-case, audit and
   approved-design consequences — a checkpoint's worth of work, not a field.
3. `FIG-APP8-SCOPE-BOUNDARY` (`788:52`) records low-stock-threshold authoring as
   a **deliberate** APP8 exclusion with a stated backend reason. Reopening it
   inside N02 would reopen an APP8 design decision, which N02 has no authority
   to do.

A newly authored SKU therefore gets an anchor at quantity 0 with
`low_stock_threshold = NULL`, and `lowStock` is consequently always `false` for
it (`sku-stock.view.ts:79-82`) — correct, and not a sellability defect. Nothing
in Wave-1 Ready-Made commerce reads the threshold.

Carried unchanged as `FU-APP12-U01-LOW-STOCK-AUTHORITY` for pre-`R01` triage.
N02 is **not** inflated to make it configurable.

---

## P. Proposed N02 internal roadmap

Source inspection did not prove a better decomposition than the authorized §4; it
did sharpen the boundaries. No new APP12 top-level checkpoint id is created —
these are internal work packages, following the `M01.*` precedent.

```text
N02.G01   audit                                          THIS PACKAGE — COMPLETE
N02.D01   bounded Admin sellability-authoring design     MANDATORY, blocks A01 (§N.3)
N02.B01   variant write authority + readiness criteria   2 operations, 3 criteria
N02.A01   Admin variant + SKU + stock authoring UI       incl. the stock link (§G.4)
N02.E01   cross-boundary operator authoring acceptance   sold-out AND in-stock
```

### P.1 `N02.B01` — scope and boundaries

```text
IN    adminProductVariant_create, adminProductVariant_update (§K)
      ProductRepository / adapter: updateVariant; addVariant reused
      ProductPublicationSnapshot gains variant + SKU facts (§H.1)
      3 readiness criteria appended to the closed set (§M)
      OpenAPI + generated client regeneration (enum widened by 3)
OUT   any SKU operation (adminSku_create / _update reused unchanged)
      any stock operation (adminSkuStock_* reused unchanged)
      DELETE of a variant (§L)
      low_stock_threshold (§O)
      any migration — no 0040; nothing in §M or §K needs one
```

Guards `N02.B01` must carry: duplicate `(color_name, size_label)` refusal within
the product; server-assigned `display_order`; the lock-then-re-read-then-settle
shape `ProductSkuService` already uses; and **unpublish must continue not to
re-run readiness** (§H.2, §I.4).

### P.2 `N02.A01` — scope

The variant & SKU section on `/products/{productId}`; create-variant and
create-SKU dialogs; the link to `/kho/skus/{skuId}` per SKU
(`FU-APP12-N02-STOCK-REACHABILITY`); the 10-row readiness checklist; the
PUBLISHED lock narrowed on the M01.B2 precedent so a published Product can gain a
variant/SKU without unpublishing. Blocked on `N02.D01` approval; registry ids
recorded in its completion report.

### P.3 `N02.E01` — acceptance shape

Operator-only journeys through the delivered Admin UI, **no SQL and no repository
seam**, in a disposable world:

```text
J1  new Product → variant → SKU → stock left at 0 → readiness truthful → publish
    → public Product structurally buyable, rendered "Tạm hết hàng"   (SOLD OUT)
J2  same, + stock adjustment > 0 → public Product purchasable        (IN STOCK)
J3  readiness refuses at each missing step: no variant, variant-but-no-SKU,
    SKU-with-zero-resolved-price
J4  a second order-eligible SKU on one variant is refused (SKU_ORDER_ELIGIBLE_AMBIGUOUS)
J5  a variant/SKU added to an already-PUBLISHED Product without unpublishing
J6  publish still succeeds for a Product whose SKU has never had its stock opened
    (proves SKU_STOCK_AUTHORITY_EXISTS was correctly NOT_REQUIRED)
```

### P.4 Follow-ups

```text
RAISED BY N02.G01
FU-APP12-N02-STOCK-REACHABILITY   blocking for N02
  /kho/skus/{skuId} is linked only from an order row; circular for a new SKU.
  Owner: N02.A01. No new operation required.

FU-APP12-N02-VARIANT-IDENTITY     nonblocking
  product_variants has no UNIQUE on (product_id, color_name, size_label) and both
  columns are nullable. Enforced in the application by N02.B01; a schema-level
  rule, if ever wanted, needs its own database-change checkpoint.

FU-APP12-N01-OPS-01..03           pre-R01 triage (from N01, not N02 work)
  01 dev worker image stale after a workspace dependency addition
  02 ordinary dev stack had never configured NOTIFICATION_DELIVERY_ENVELOPE_KEY
  03 gateway retains a stale upstream after an API recreate

CARRIED UNCHANGED
FU-APP12-G03-01                    stale Product Detail authority gate — still red
                                   at HEAD; must be reconciled before R01
FU-APP12-G03-02A                   CLOSED BY N02 on N02.E01 acceptance
FU-APP12-G03-02B /
FU-APP12-U01-LOW-STOCK-AUTHORITY   pre-R01 triage (§O)
FU-APP12-U01-VARIANT-AUTHORING     owned by N02.B01 + N02.A01
FU-APP12-U01-READINESS-FALSE-CLAIM owned by N02.B01
FU-APP12-U01-NOTIFICATION-PROVIDER CLOSED BY N01 (§B)
```

---

## Q. U01-C1 re-entry criteria

`APP12-U01` stays `SUSPENDED_PENDING_BLOCKER_RECOVERY`. It was **not** resumed and
nothing in §8 of its script was executed. `U01-C1` may be authorized only when all
of the following hold:

```text
1  APP12-N02.E01 = COMPLETE, PO PASS
2  a Product created through the Admin UI alone can reach:
       variant → SKU → stock → truthful readiness → PUBLISHED → buyable
   with NO direct SQL and NO repository seam anywhere in the evidence
3  publication readiness reports 10 criteria, and refuses a Product with
   no active variant / no order-eligible SKU / no resolvable SKU price
4  a sold-out Product publishes successfully  (the locked decision, proved)
5  no operation added by N02 can write .env, rotate a credential, or mutate the
   shared development world
6  U01's own shared-source integrity instrument re-runs clean:
       tools/uat-app12-u01-integrity.mjs census digest identical entry/exit
7  the two malformed PUBLISHED rows in §I are unchanged unless the Product Owner
   separately authorizes their repair
```

`U01-C1` re-executes §8 steps 4–6 and 9 and the commerce journey §10–§19 that U01
deliberately did not run. It is **not** executed in N02.

---

## R. Source / contract baseline

Every figure measured at HEAD on this branch; every one matches the authorized §10.

```text
OpenAPI paths       127   ✓        migrations          39    ✓  (no 0040)
OpenAPI operations  140   ✓        DB tables           79    ✓  (live shared DB)
OpenAPI schemas     279   ✓        Admin routes        26    ✓
public operations    49   ✓        Storefront routes   20    ✓
```

```text
variant-bearing paths                       2  (one consumes variantId, one public read)
sku-bearing paths                           5
operations writing product_variants         0
Admin call sites for adminSkuCreate         0
Admin call sites for adminSkuUpdate         0
non-test callers of addVariant              0
application writers of low_stock_threshold  0
callers of adminSkuStockRoute               1  (order-items-table.tsx)
```

Method: `node -e` over `packages/contracts/openapi/openapi.generated.json` for the
contract figures; `ls packages/database/migrations/*.sql | wc -l` for migrations;
`find … -name page.tsx` for routes; `information_schema.tables` over the live
shared database for the table count.

---

## S. Files changed

```text
NEW   docs/implementation/reports/APP12-N02-G01-COMPLETION-REPORT.md
EDIT  docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
        §0    CHECKPOINTS 39 → 41; the N01 (39→40) and N02 (40→41) Human-PO
              overrides recorded; NEXT corrected
        §0.8  rows 29·N1 (APP12-N01) and 29·N2 (APP12-N02) inserted on the
              29·M precedent — rows 30-38 are NOT renumbered; row 30
              APP12-U01 corrected from NOT_STARTED to CORRECTION_REQUIRED /
              SUSPENDED_PENDING_BLOCKER_RECOVERY
```

```text
runtime source changed    0        DB rows written           0
OpenAPI changed           0        Figma nodes changed       0
generated client changed  0        migrations added          0
.env touched              0        shared-dev writes         0
```

Markdown only. Both edits record authority the Product Owner has already given;
neither creates, reorders, merges, splits or renames a checkpoint id.

---

## T. Audit validation

`VALIDATION_GOVERNANCE.md` §3A.1, row **"Docs / Markdown only"**:

```text
REQUIRED     git diff --check
             Prettier on touched docs
             link/anchor consistency for edited docs
CONDITIONAL  phase-status consistency when a status table moved  ← applies
FORBIDDEN    any test suite, any build                           ← none run
```

Read-only database evidence, and how it was kept read-only:

```text
session opened with: set session characteristics as transaction read only
statements issued:   SELECT only
rows written:        0
connection:          node --env-file=.env  → the password went file → process and
                     was never read out, echoed, logged or passed as an argument
                     (CLAUDE.md §8a); no secret-bearing variable was requested or
                     used by hand
```

No test suite, no build, no `pnpm lint`, no OpenAPI regeneration and no Docker
image build was run: none is justified by a Markdown-only change, and running one
would be the repository-wide-aggregate anti-pattern `VALIDATION_GOVERNANCE.md`
§1.1 forbids.

---

## U. Hygiene

```text
RUNTIME_CHANGES = 0     DB_WRITES = 0     FIGMA_CHANGES = 0
MIGRATIONS      = 39, unchanged, no 0040
.env            not read for any secret, not written, no credential rotated
shared dev DB   read-only, 0 writes; no disposable world was needed, so none was
                built and none had to be torn down
scratchpad      one draft probe script written to the session scratchpad and
                superseded by the inline read-only queries actually run; nothing
                left in the repository
branch          feat/app11-s04-seo-infrastructure — not pushed
production      not deployed
U01             not resumed; N02.D01/B01/A01/E01 not implemented
```

```text
APP12-N02.G01 = COMPLETE — AWAITING_PO_REVIEW
APP12-N02     = AUDIT_COMPLETE

APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

NEXT = PO_REVIEW_REQUIRED
```
