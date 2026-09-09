# APP12-G03 — Representative UAT Readiness Data — Completion Report

```text
APP12-G03                 = COMPLETE
G03_PERSISTENT_UAT_DATA   = READY

APP12-U01                 = NEXT — NOT_EXECUTED
APP12-E01                 = NOT_AUTHORIZED

APP12-M01                 = COMPLETE — PO CLOSED
ROADMAP_CHECKPOINTS       = 39

PRODUCTION_DEPLOYED       = false
PUSHED                    = false
```

Date: 2026-09-09 · Branch: `feat/app11-s04-seo-infrastructure`

---

## A. Verdict

`APP12-G03` is **COMPLETE**. A persistent, representative Wave-1 UAT catalog now
exists in the shared development database: **4 published dynamic categories**,
**7 published Ready-Made Products** spanning all four, **47 real processed
images**, **16 variants**, **14 SKUs**, both price paths, and in-stock,
low-stock and out-of-stock coverage including three Products with mixed
availability. Every business object for which the application publishes a write
operation was created through that operation; two columns for which no write
authority exists anywhere in the system were written directly, and each is
documented in §C.

The dataset was verified in the real Admin and the real Storefront through a
browser, not only through the API. `APP12-U01` was not executed, nothing was
deployed, and nothing was pushed.

One defect was found while running the §21 validation set. It is **not** a G03
regression and is **not** fixable inside G03's change budget; it is routed in
§S as `FU-APP12-G03-01`.

---

## B. M01 PO closure reconciliation

The Product Owner's closure was taken as given and `APP12-M01` was not reopened.
The M01 work that was still uncommitted at G03 entry was committed unchanged, in
three commits that add nothing and alter nothing:

```text
4bf1a3e5  test(app12): the cross-boundary suite runs against processes it starts itself (APP12-M01-E1)
e6a225a4  fix(app12): the truth goes beside the photograph, never instead of it (APP12-M01-E1-C1)
ec43333c  docs(app12): the E1 and E1-C1 reports, and the chevrons Figma had all along (APP12-M01-E1-C1)
```

No M01 assertion was weakened, no M01 file was edited during G03, and the M01
follow-ups listed in the brief's §19 were carried forward untouched (§S).

---

## C. G03 authority and the persistent-data exception

### C.1 The permission, and its shape

`G03_PERSISTENT_DATA_WRITE = AUTHORIZED`, `G03_DATA_TEARDOWN = NOT_REQUIRED`.
Every prior APP12 fixture refuses to run against anything but a disposable
`embroidery_db7_*` database. G03's seeder carries the **inverse** guard —
`assertPersistentDatabase` refuses a disposable name — because the mistake worth
catching here is seeding a UAT baseline into a database that is dropped with its
run.

### C.2 Everything with a delivered write operation used it

```text
categories        adminCategory_create · adminCategory_update · adminCategory_transition
products          adminProduct_create · adminProduct_update
media (upload)    adminAsset_upload → the real inspection and derivation pipeline
media (attach)    adminProduct_update mediaAssetIds (DRAFT)
media (published) adminProductMedia_replace
SKUs              adminSku_create · adminSku_update
stock             adminSkuStock_get (lazily provisions the anchor) · adminSkuStock_adjust
publication       adminProduct_publicationReadiness · adminProduct_publish
```

Each call carries the same `expectedUpdatedAt` optimistic-concurrency token an
operator's browser sends, so the publication gate, the audited stock ledger, the
migration-`0039` media invariants and the category lifecycle judged this dataset
exactly as they judge an operator's.

### C.3 Direct database writes — two, both documented

`APP12-G03` §1 permits a direct write only for a prerequisite with **no**
delivered write authority, and only with the missing operation, the UAT
necessity and the semantic equivalence recorded. Both exceptions are documented
at length in the header of `tools/seed-app12-g03-direct.mjs`; summarised:

**Exception 1 — `product_variants` (14 rows).**
No published operation creates a variant. `adminSku_create` is
`POST /api/admin/products/{productId}/variants/{variantId}/skus` and *requires a
variant that already exists*. `DrizzleProductRepository.addVariant` exists in
`apps/api` with **zero non-test callers** — the same shape `APP8-R00` found for
`ensureStockRow`. Required because §9/§23.20/§23.21 ask for multiple variants and
multiple SKUs, and `fk_skus__product_variant_id` means that with no variant row
there is no purchasable catalog at all. Semantically equivalent because the
insert writes exactly the columns `addVariant` writes, with the same defaults and
a UUIDv7 minted from `packages/database`'s own `uuidv7` dependency;
`product_variants` carries no status machine, no audit obligation and no outbox
event, so there is no lifecycle for a direct write to skip.

**Exception 2 — `sku_stocks.low_stock_threshold` (5 rows).**
`adminSkuStock_adjust`'s request schema is `.strict()` and names
`lowStockThreshold` among the fields that are *unrepresentable by design*
("server-owned or repository-owned … Sent, any of them is a `400` naming the
unrecognised key"). No other operation writes it: the column has a reader
(`AdminSkuStockResponse.lowStock`) and no writer anywhere. Required because §11
and §23.25 ask for a low-stock SKU, and `lowStock` is computed as
`quantityOnHand <= lowStockThreshold` — with no threshold **no SKU can ever
report low stock at any quantity**. Semantically equivalent because the threshold
is a display annotation on an anchor the delivered provisioner already created;
it takes part in no transition, ledger entry or reservation arithmetic. The
quantity itself was never written directly — it moves only through the audited
adjustment. The Admin screen states the same fact in its own copy: *"Ngưỡng do hệ
thống đặt và không sửa được tại đây."*

Both exceptions are worth a runtime follow-up rather than a permanent tooling
crutch (§S).

### C.4 The operator credential was never handled

`STAFF_BOOTSTRAP_PASSWORD` is protected by `.env-ignore`. It was never read out,
echoed, logged, written to a report or passed as an argument. The seeder runs as
`node --env-file=.env tools/seed-app12-g03.mjs`, which is the file → process
handling `CLAUDE.md` §8a permits without asking; `redact()` in the API client is
the backstop. Browser verification used a **session cookie minted by the same
route**, so the browser was authenticated without the password being in hand
either. Nothing was written to `.env`.

---

## D. Shared-world preflight

Read-only, before any write. Source and contract baseline at entry, re-measured
at exit and unchanged (§T).

```text
categories                5   (all PUBLISHED: ao-thun, thu-bong, khan, quan-ao, khac)
products                 30   (2 PUBLISHED, 3 ARCHIVED, 25 DRAFT)
product_variants          2
skus                      0
sku_stocks                0
product_media             4
assets                   53   (48 ACCEPTED, 3 REJECTED, 2 UPLOADED)
asset_derivatives        78
inventory_ledger_entries  0
customers                 3
orders                    0
order_items               0
payment_obligations       0
payment_attempts          0
secure_access_grants      4
```

The finding that shaped the checkpoint: **the shared world had no sellable
catalog at all.** Two PUBLISHED Products, zero SKUs anywhere, zero stock rows.
G03 was not topping a dataset up; it was building the first one.

No G03-owned rows existed from an interrupted prior attempt — no `uat-` slug and
no `UAT-G03-` code was present — so §17's reconciliation path started from empty.

`APP12-A02 = COMPLETE_AFTER_C1` was taken from the current phase plan, not from
the superseded blocked A02 report; origin-aware Ready-Made Admin order reads are
delivered. G03 exercised no order surface (§P), so this bore on scope rather than
on any assertion here.

---

## E. Dataset provenance

One deterministic convention (§4):

```text
category slug   uat-<family>                    client-supplied
product slug    uat-<name>                      server-derived — see below
SKU code        UAT-G03-<PRODUCT>-<VARIANT>
human names     ordinary Vietnamese, no marker anywhere
```

**The product slug needed a mechanism, not a decision.** `products.slug` is
server-derived from the name and a rename never changes it (`APP2-B02-G01` /
IMP-D032 §4.2), so a client cannot ask for `uat-…`. Each Product was therefore
created under a `creationName` carrying a leading `UAT` — which derives the
marked public address — and then renamed to its clean Vietnamese name through the
ordinary `adminProduct_update`. Both steps are delivered operations; nothing
wrote a slug. The result is exactly §4's stated preference: the address carries
the marker, the shopper sees `Túi vải thêu hoa cúc`.

No Lorem ipsum, no `Test 1`, no UUID-shaped customer-facing name, no raw enum.
The manifest, not ugly copy, is the ownership ledger.

---

## F. Dynamic categories

Four created and published through `adminCategory_create` +
`adminCategory_transition`. None duplicates the semantic identity of one of the
five historical seed categories, and none of those five was altered.

| slug | name | status | indexable | display order |
|---|---|---|---|---|
| `uat-tui-vai-theu` | Túi vải thêu | PUBLISHED | yes | 210 |
| `uat-goi-tua-theu` | Gối tựa thêu | PUBLISHED | yes | 220 |
| `uat-non-mu-theu` | Nón mũ thêu | PUBLISHED | yes | 230 |
| `uat-phu-kien-theu` | Phụ kiện thêu | PUBLISHED | **no** | 240 |

Three indexable clears §5's floor of two. The fourth is published-but-not-indexable
on purpose: indexability is operator-controlled, and a UAT world in which every
category answers the same way cannot show that the control works. `GET
/api/public/categories` reports it as `isIndexable: false` while still listing it.

Ids are in the manifest.

---

## G. Product inventory

Seven PUBLISHED Ready-Made Products across all four categories. None depends on a
custom request, quotation, design case, approval snapshot, Design Studio session
or production job.

| slug | category | base price | images | variants | SKUs |
|---|---|---|---|---|---|
| `uat-tui-vai-theu-hoa-cuc` | tui-vai | 320.000 ₫ | **20** | 3 | 3 |
| `uat-tui-tote-theu-chi-vang` | tui-vai | 280.000 ₫ | **8** | 1 | 1 |
| `uat-goi-tua-theu-hoa-sen` | goi-tua | 450.000 ₫ | **1** | 1 | 1 |
| `uat-goi-tua-theu-chim-hac` | goi-tua | 520.000 ₫ | 5 | 2 | 2 |
| `uat-non-luoi-trai-theu-logo` | non-mu | 210.000 ₫ | 6 | 4 | 4 |
| `uat-mu-noi-theu-hoa-nhi` | non-mu | 265.000 ₫ | 3 | 1 | 1 |
| `uat-khan-choang-theu-vien` | phu-kien | 390.000 ₫ | 4 | 2 | 2 |

Every Product carries a real Vietnamese name, a description written for UI
review, a VND base price, at least one variant, at least one SKU, real stock
authority and at least one eligible image.

---

## H. M01 multi-image representation

`1 / 8 / 20` are carried by named Products, not by a count:

```text
1 image      uat-goi-tua-theu-hoa-sen
8 images     uat-tui-tote-theu-chi-vang
20 images    uat-tui-vai-theu-hoa-cuc      (the cap)
```

For every multi-image Product: all Assets `ACCEPTED`, real `THUMBNAIL` and real
`CATALOG_PREVIEW` derivatives `READY`, position 0 the stored primary
(`role = THUMBNAIL`, satisfying `ck_product_media__primary_role_at_zero`), and no
Asset attached twice to one Product (`uq_product_media__product_asset`).

### H.1 The hand-curation journey (§7)

Performed in the **real Admin at 1440**, on the eight-image Product, through the
delivered controls — not through the API:

```text
stored before   A0 A1 A2 A3 A4 A5 A6 A7      (A0 primary)
★ on tile 5     A4 A0 A1 A2 A3 A5 A6 A7      a non-first image becomes primary
→ on tile 3     A4 A0 A2 A1 A3 A5 A6 A7      a non-primary image is reordered
→ on tile 4     A4 A0 A2 A3 A1 A5 A6 A7
Lưu ảnh sản phẩm  → saved (product never left PUBLISHED)
hard reload     A4 A0 A2 A3 A1 A5 A6 A7      identical
```

Stored order after save, read from PostgreSQL, is exactly that sequence with
`display_order` 0..7 and `role` `THUMBNAIL, GALLERY×7`.

**Public order agrees with stored order, 8/8.** Public media URLs carry
`product_media.id`, not `asset_id`, so the two were compared by joining that id:
the `GET /api/public/products/uat-tui-tote-theu-chi-vang` media array is
byte-identical to `select id from product_media … order by display_order`.

Evidence: `evidences/app_12/g03/admin-curation-pending-1440.png`,
`admin-curation-after-reload-1440.png`, `storefront-detail-8-images-1440.png`.
The generated imagery makes this readable by eye — each image carries a tally of
stitch dots equal to its own position, and the reloaded grid reads
`5 1 3 4 2 6 7 8`.

No `product_media` row was inserted directly anywhere in this checkpoint.

---

## I. Media processing and readiness

**"Real media" means bytes the application stored, inspected and derived from.**
Every one of the 47 images was posted to `adminAsset_upload` as a
1600×1600 JPEG of ~390 KiB, answered `202`, and was then polled until the
delivered pipeline had made it publishable. 47 Assets in, **94 derivatives out**
(2 per Asset), all `READY`, unwatermarked, with durable storage keys.

Readiness was confirmed through reads the Admin screen itself makes, because
`adminAsset_detail` has no `derivatives` field and can report `ACCEPTED` while the
renditions are still being written: the wait polls `adminAsset_detail` for
`ACCEPTED` **and** `adminAsset_preview` for a `200 image/*` on both `thumbnail`
and `catalog-preview`. An Asset the seeder accepts is therefore an Asset the
operator will see as a photograph.

### I.1 Provenance of the imagery

§8's preference order is the operator's own photographs → repository-owned
sources → repository-owned generated imagery. The repository owns no product
photographs; its only image sources (`APP12-H05`/`H06`) generate **derivatives**
written straight to storage, which is the wrong end of the pipeline for a
checkpoint whose point is that the image enters through the upload route. The
Product Owner chose generated in-repo imagery in session on 2026-09-09. Nothing
was downloaded; the generator does no network I/O.

The picture is a rosette worked on woven linen with a soft vignette — plausible
enough that a UAT operator reads it as product imagery, obviously synthetic
enough that nobody mistakes it for a photograph, and structured enough that it
compresses like one (a flat placeholder would understate every payload
measurement made against this catalog afterwards). Two position cues, both
deliberate: petal count and a tally of stitch dots equal to `position + 1`.

**A property worth recording:** petals are `5 + position % 7`, so shape repeats
every seventh position — images 0, 7 and 14 of a twenty-image gallery share a
rosette. The tally never repeats and is what disambiguates them. The test
`no two positions in a twenty-image gallery look the same` pins the actual
contract — *at least one* cue separates every one of the 190 pairs — because
asserting on either cue alone would be false in one direction or the other.

### I.2 Pixel checks (§8)

Across all seven Product Detail pages and the twenty-tile Admin grid:

```text
HTTP 200                            every page and every rendition
content-type                        image/* on every derivative read
naturalWidth / naturalHeight > 0    every image
broken-image glyphs                 0
hero intrinsic size                 1600×1600 (catalog-preview)
Admin tile intrinsic size            480×480  (thumbnail)
```

---

## J. Variants and SKUs

16 variants and 14 SKUs; the two pre-existing variants belong to unrelated
DRAFT rows and were not touched.

```text
multiple variants   tui-vai-theu-hoa-cuc (3 colours), non-luoi-trai (2 colours × 2 sizes),
                    goi-tua-theu-chim-hac (2 sizes), khan-choang (2 colours)
multiple SKUs       the same four Products
```

Every variant dimension is one a shopper would actually choose between — colour
and size — and every variant owns a SKU. No dimension exists to raise a count,
and no variant is left without something to sell.

---

## K. Price coverage

Both public price paths are represented and are visibly distinct on the page, so
a UAT operator can tell which is active without querying the database.

| path | example | shown on Product Detail |
|---|---|---|
| Product base price | `UAT-G03-TUI-HOACUC-KEM`, no override | **320.000 VND** |
| SKU price override | `UAT-G03-TUI-HOACUC-XANH`, override 385000 | **385.000 VND** |

Proved in the real Storefront by selecting each variant on
`/san-pham/uat-tui-vai-theu-hoa-cuc` and reading the rendered price and the
resolved `?sku=` on the continue link. Four SKUs across four Products carry an
override; ten resolve from the base price. The page's own JSON-LD independently
agrees: `AggregateOffer` with `lowPrice 320000`, `highPrice 385000`,
`offerCount 3`.

All amounts are plausible whole-đồng VND retail figures. No zero prices, no
one-unit gimmicks; every override differs from its base by at least 25.000 ₫.

---

## L. Stock coverage

Every unit was moved by the audited `adminSkuStock_adjust`, each carrying the
reason *"APP12-G03 — thiết lập tồn kho ban đầu cho dữ liệu UAT (không phải tồn
kho thực tế)"*, which is now in the ledger where anyone who meets these rows will
read it. 10 ledger entries — the four zero-stock SKUs needed no adjustment.

```text
clearly in stock    UAT-G03-TOTE-MOC 40 · NON-DEN-S 30 · TUI-HOACUC-KEM 24 · GOI-HAC-45 18
low stock           TUI-HOACUC-XANH 3/5 · GOI-HAC-50 2/5 · NON-BE-L 1/3
out of stock        TUI-HOACUC-NAU · NON-BE-S · MU-NOI-DO · KHAN-DO
mixed in one Product tui-vai-theu-hoa-cuc · non-luoi-trai · khan-choang
```

Public Product Detail exposes this truthfully: `Còn 24 sản phẩm` for the in-stock
SKU, `Còn 3 sản phẩm` for the low one, the out-of-stock variant rendered
`Nâu đất · hết` and **not selectable**, and the wholly sold-out Product answering
`Hiện chưa có phân loại nào còn hàng` / `Tạm hết hàng`. Nothing is faked in
frontend data. The Admin SKU screen shows `Sắp hết hàng` and
`Dưới ngưỡng cảnh báo (5)` for the low-stock SKU
(`evidences/app_12/g03/admin-sku-low-stock-1440.png`).

---

## M. Publication proof

Every Product reached `PUBLISHED` through `adminProduct_publish`, and only after
`adminProduct_publicationReadiness` reported `eligible`. There is no code path in
the seeder that could write a status directly, and a refusal would have carried
the unsatisfied requirement codes rather than being retried.

The gate's own conditions therefore held for all seven: category PUBLISHED and
not archived, name/slug/description present, price a publishable whole-đồng VND
amount, media contiguous from `display_order` 0 with `THUMBNAIL` first, every
Asset `ACCEPTED` catalog media, and both required derivatives `READY`,
unwatermarked, with storage keys.

No Product in the final dataset returns a broken or empty public media state.

---

## N. Admin verification (real browser, 1440)

```text
✓ all four categories visible in the category screen and in the product form's selector
✓ all seven Products listed with real thumbnails and correct categories
✓ every Product badged "Đã xuất bản"
✓ media counts 20/20, 8/20, 1/20, 5/20, 6/20, 3/20, 4/20 — correct
✓ primary badge ("Ảnh đại diện") on position 0 of every gallery
✓ 20-image Product: "Thêm ảnh" is disabled — the cap is visibly enforced
✓ 0 broken images across the twenty-tile grid; 480×480 real pixels
✓ variants and SKUs correct; the SKU stock screen shows quantity, availability,
  the low-stock badge, the threshold and the G03 ledger entry
```

The price override is not surfaced by the current Admin UI — the product form
shows only the Product base price, and the SKU screen is stock-only — so it was
verified through the public read and the database instead. No Admin source was
changed.

---

## O. Storefront verification (real browser, 1440 and 390)

```text
✓ /kham-pha lists all seven Products across four dynamic categories
✓ nine category chips render, the four new ones among them
✓ ?category=<slug> filters correctly for all four:
    uat-tui-vai-theu   → hoa-cuc, tote
    uat-goi-tua-theu   → hoa-sen, chim-hac
    uat-non-mu-theu    → non-luoi-trai, mu-noi
    uat-phu-kien-theu  → khan-choang
✓ product cards show the primary thumbnail only — one image per card
✓ 20-image detail: counter "1 / 20", ordered gallery, hero = media[0]
✓ 8-image detail: counter "1 / 8", the curated order, hero = the promoted image
✓ 1-image detail: clean — no counter, no thumbnail strip
✓ base-price and override-price SKU paths both render (§K)
✓ in-stock selectable, out-of-stock refused, sold-out Product truthful (§L)
✓ zero horizontal document overflow at 1440 and at 390
✓ zero broken images on any page
```

No Storefront source was changed, and no data problem required one. Evidence:
`storefront-discover-1440.png`, `storefront-detail-20-images-1440.png`,
`storefront-detail-20-images-390.png`, `storefront-detail-8-images-1440.png`,
`storefront-detail-1-image-1440.png`, `storefront-detail-sold-out-1440.png`.

---

## P. Transactional and commercial data boundary

```text
G03 persistent commercial transactions = 0
```

No customer, order, order item, payment obligation, payment attempt, payment
evidence, shipping transaction or `ORDER_ACCESS` grant was created. The seeder
asserts this itself at the end of every run and would fail if any of those tables
moved. No bounded transaction smoke was needed: the purchase path's readiness was
observable without writing one — the continue link resolves to
`/mua-hang/<slug>?sku=<id>&quantity=1` with the correct SKU for each selection —
so nothing had to be created and torn down.

`APP12-U01` starts from a clean catalog baseline with no manufactured commercial
history.

---

## Q. Persistent manifest

```text
docs/implementation/evidences/APP12-G03-UAT-DATA-MANIFEST.md
```

Generated by `node --env-file=.env tools/seed-app12-g03-manifest.mjs`, which
**reads the rows back out of PostgreSQL**. That is the point of §23.36: a
manifest rendered from the seeder's dataset would agree with itself whatever the
database contains. The declared dataset appears only as "matches declaration"
columns, where intent and truth are compared.

It records, for every G03 Product: id, slug, name, category id and slug, status,
base price, media count, primary Asset id, the full ordered Asset list with each
Asset's lifecycle state and both derivative readiness flags, the variant summary,
and every SKU's id, code, override, stock, threshold and expected public
availability. For every category: id, slug, name, status, indexability and
display order. It also carries a §23 coverage table computed from the persisted
rows.

It records **no** object-store credential, no private or signed storage URL, no
password, no session cookie and no merchant secret; media is identified by Asset
id and readiness, never by storage key.
`node tools/check-report-secrets.mjs` passes.

---

## R. Idempotency and rerun safety

`APP12-G03` §17 is satisfied structurally, not by remembering to be careful:

- every object is looked up by **business key** before it is created — category
  by slug, Product by slug, SKU by code, variant by `(product, colour, size)`;
- uploads carry a deterministic `Idempotency-Key` (`app12-g03.<product>.<NN>`)
  and the generator is deterministic, so the same image re-posts to the same
  receipt and writes no second object;
- stock moves by the **difference** between what is on hand and what is
  declared, so a rerun at target issues no adjustment and writes no ledger entry;
- an `ARCHIVED` row under a G03 key raises `DATA_COLLISION` and stops the run
  rather than being revived; nothing is deleted and recreated.

**Proved, not asserted.** A full unfiltered rerun after the dataset was complete
produced `+0` on every one of the seventeen counters.

### R.1 The defect the first rerun found

The first rerun failed with `409 PRODUCT_NOT_EDITABLE`. The cause was worth the
run: after the §7 hand-curation the stored media order no longer matched the
dataset's array order, so the reconciler tried to rewrite it — and a PUBLISHED
Product correctly refuses `adminProduct_update`.

Two things were wrong, and the second was the important one. The reconciler now:

- compares media as a **set**, not as an order. The seeder owns *which* Assets
  are attached; once the set is right, the arrangement belongs to whoever
  arranged it. A seeder that "fixed" the operator's curation on every run would
  destroy the very thing the checkpoint exists to demonstrate.
- uses `adminProductMedia_replace` — `APP12-M01.B2`'s bounded published write —
  when a PUBLISHED Product's media set genuinely does differ, and the atomic
  `adminProduct_update` only while the Product is still DRAFT.

Re-verified: the unfiltered rerun leaves the curated order `A4 A0 A2 A3 A1 A5 A6
A7` exactly as the operator left it.

---

## S. Follow-up routing

Carried forward from M01, **not** absorbed into G03 and not reopened:

```text
FU-APP12-M01-E1-C1-01   Figma lightbox close-control drawing differs from runtime
                        → final design/closure reconciliation
FU-APP12-M01-E1-C1-02   Figma index gate does not validate row column alignment
                        → tooling/governance
FU-APP12-M01-E1-02      historical check:e2e JSON import-attribute debt
FU-APP12-M01-E1-03      historical format debt
```

New, found while running G03's own validation set:

```text
FU-APP12-G03-01  check:storefront-product-detail-authority does not follow a
                 SUPERSEDED registry transition.
                 severity: gate red · owner: M01 closure reconciliation · NOT a G03 regression
```

`tools/check-storefront-product-detail-authority.mjs` holds a frozen
`RECONCILED_ROOTS` list of ten Figma node ids, each of which it requires to be
`APPROVED_FOR_IMPLEMENTATION`. `APP12-M01.E1-C1` correctly marked two of them —
`533:3` and `533:26`, the APP2-era Product Detail lightbox frames — `SUPERSEDED`
when lightbox authority moved to the `APP12-M01.D1` package. The gate has no way
to follow that transition, so it now fails on a registry change that was right.

Bisected: the gate **passes** at `aca2e3a4` (before this session's commits) and
fails at `ec43333c` (the M01-E1-C1 registry reconciliation). G03 changed no Figma
artifact, no registry row and no runtime source, and fixing a design-authority
gate is outside the change budget §20 sets for this checkpoint, so it is reported
rather than patched here.

```text
FU-APP12-G03-02  product_variants has a repository writer with zero callers and no
                 HTTP operation; sku_stocks.low_stock_threshold has a reader and no
                 writer anywhere.
                 severity: capability gap · owner: a future backend checkpoint
```

These are the two direct-write exceptions of §C.3. G03's tooling is the wrong
long-term home for them: a UAT seeder should not be the only way to give a Product
a variant, and an operator cannot set a low-stock threshold at all.

None of the above blocked catalog UAT data creation.

---

## T. Source and contract baseline

Measured at exit. Every number is the entry number.

```text
OpenAPI paths       127   unchanged
OpenAPI operations  140   unchanged
OpenAPI schemas     279   unchanged
public operations    49   unchanged

migrations           39   unchanged — no 0040
DB tables            79   unchanged

Admin routes         26   unchanged
Storefront routes    20   unchanged
```

```text
runtime source changed   = 0
API / OpenAPI changed    = 0
generated client changed = 0
DB schema / migrations   = 0
Figma changed            = 0
new HTTP operations      = 0
```

`pnpm --filter @embroidery/api openapi:check` → *"OpenAPI artifact is up to
date."*

---

## U. Files and documents changed

New — repository-owned UAT data tooling (§20's bounded allowance):

```text
tools/seed-app12-g03.mjs                 330  entry: config, preflight, run, verify
tools/seed-app12-g03-admin-api.mjs       318  the delivered Admin HTTP surface
tools/seed-app12-g03-catalog.mjs         383  the per-object reconcilers
tools/seed-app12-g03-dataset.mjs         152  categories, markers, curation, helpers
tools/seed-app12-g03-products.mjs        286  the seven Products (data only)
tools/seed-app12-g03-direct.mjs          310  reads + the two documented exceptions
tools/seed-app12-g03-imagery.mjs         287  deterministic source imagery
tools/seed-app12-g03-manifest.mjs        292  renders the manifest from persisted truth
tools/seed-app12-g03.test.mjs            366  17 tests
```

New — documents:

```text
docs/implementation/evidences/APP12-G03-UAT-DATA-MANIFEST.md
docs/implementation/reports/APP12-G03-COMPLETION-REPORT.md
```

Changed — status documentation, plus one ignore correction:

```text
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
docs/implementation/SCOPED_COMMAND_INDEX.md   three CMD-*-APP12-G03 rows
.gitignore                                    see below
```

The `.gitignore` change is not cosmetic. Its `evidences/` rule is unanchored, so
it also swallowed `docs/implementation/evidences/` — and §16 names
`docs/implementation/evidences/APP12-G03-UAT-DATA-MANIFEST.md` as the canonical
ownership authority for the persistent dataset. A manifest nobody else can read
is not an authority. The rule now tracks **Markdown only** under that one
directory; screenshot directories, including `evidences/app_12/g03/`, stay
ignored exactly as before (verified with `git check-ignore`).

Evidence images under `evidences/app_12/g03/` (git-ignored, as for every prior
APP12 checkpoint).

The tooling was genuinely required: 47 uploads through a real pipeline, seven
publication gates and a rerun-safe reconciliation are not a sequence anyone
performs by hand reproducibly, and §17 demands the run be resumable. It
duplicates no business rule, bypasses no runtime write that exists, and adds no
root script — it is a Level 3 command run directly and indexed in
`SCOPED_COMMAND_INDEX.md`.

---

## V. Validation

Change-impact only. Every command below was run; the result is what is quoted.

| control | command | result |
|---|---|---|
| whitespace | `git diff --check` | clean |
| tool tests | `node --test "tools/seed-app12-g03.test.mjs"` | **17/17 pass** |
| file size | `node tools/check-file-size.mjs --paths <9 files>` | pass (4 above review threshold, none over the hard limit) |
| Prettier | `npx prettier --check "tools/seed-app12-g03*.mjs" <manifest>` | pass |
| OpenAPI drift | `pnpm --filter @embroidery/api openapi:check` | up to date |
| category authority | `node tools/check-category-source-of-truth.mjs` | pass — 2622 files, no compiled category values |
| Storefront routes | `node tools/check-storefront-route-authority.mjs` | pass |
| Figma registry | `node tools/check-figma-design-index.mjs` | pass — 578 registry IDs |
| report secrets | `node tools/check-report-secrets.mjs` | pass — 688 documents |
| Product Detail authority | `node tools/check-storefront-product-detail-authority.mjs` | **fail — 2 findings, pre-existing (`FU-APP12-G03-01`, §S)** |

Live data validation:

```text
seeder run          full dataset created through the delivered operations
seeder rerun        +0 on all 17 counters; curation preserved
manifest            reconciles to persisted truth; every §23 coverage row ✓
Admin browser       §N — 1440
Storefront browser  §O — 1440 and 390
pixel checks        §I.2 — 0 broken images, real intrinsic dimensions
baseline counts     §T — every entry number unchanged
```

ESLint does not cover `tools/` — `pnpm lint` is `turbo run lint` across the
workspaces, and `tools/` is not one. No lint pass is claimed for these files;
Prettier is the formatting control that does apply, and it passes.

No broad APP12 regression was run.

---

## W. Persistent-data hygiene

```text
shared_dev_mutations                  = G03-owned rows only
unrelated rows modified               = 0
unrelated rows deleted                = 0
G03 persistent catalog data           = present (intentionally retained)
G03 persistent commercial transactions = 0
production_deployed                   = false
pushed                                = false
```

"Unrelated rows modified = 0" is a **measurement**. Before and after every run
the seeder computes an MD5 over every category, Product, variant, SKU and
product-media row *outside* the `uat-` / `UAT-G03-` markers, including each row's
`updated_at` so a no-op re-save cannot hide. The digest is identical across the
whole checkpoint:

```text
82fb17eb9c95d13017e36ffa391ff39f  over 41 rows   (before first write and after last)
```

The four historical seed categories were not renamed, re-ordered, re-indexed or
archived. No existing customer or commercial row was reused. No disposable
fixture row was relabelled into a G03 row — every G03 row was created in this
checkpoint and appears in the manifest.

Torn down: the verification browser, the temporary session cookie (revoked), and
the scratch scripts. Not torn down, deliberately: the G03 catalog itself
(`G03_DATA_TEARDOWN = NOT_REQUIRED`). No disposable database, container or port
was created.

---

## X. Before / after data counts

| table | before | after | delta |
|---|---|---|---|
| categories | 5 | 9 | +4 |
| categories PUBLISHED | 5 | 9 | +4 |
| products | 30 | 37 | +7 |
| products PUBLISHED | 2 | 9 | +7 |
| product_variants | 2 | 16 | +14 |
| skus | 0 | 14 | +14 |
| sku_stocks | 0 | 14 | +14 |
| product_media | 4 | 51 | +47 |
| assets | 53 | 100 | +47 |
| asset_derivatives | 78 | 172 | +94 |
| inventory_ledger_entries | 0 | 10 | +10 |
| **customers** | 3 | 3 | **+0** |
| **orders** | 0 | 0 | **+0** |
| **order_items** | 0 | 0 | **+0** |
| **payment_obligations** | 0 | 0 | **+0** |
| **payment_attempts** | 0 | 0 | **+0** |
| **secure_access_grants** | 4 | 4 | **+0** |

Every G03-owned identifier — category ids, Product ids, Asset ids in order, SKU
ids and codes — is enumerated in the manifest.

---

## Y. Roadmap

```text
APP12-M01 = COMPLETE — PO CLOSED
APP12-G03 = COMPLETE
ROADMAP_CHECKPOINTS = 39

NEXT = APP12-U01     (operator/customer UAT) — NOT_EXECUTED
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

G03_DATA = UAT_ONLY
PRODUCTION_CONTENT = false
PRODUCTION_DEPLOYED = false
PUSHED = false
```

`APP12-U01` was not executed. Nothing was deployed. Nothing was pushed. The G03
dataset is UAT-only and no part of it is approved for production publication;
promoting any of it requires separate authorization.
