# APP12-N02.A01 — Admin Ready-Made Sellability Authoring UI

**Package** `APP12-N02.A01` (Admin frontend package of `APP12-N02 — READY-MADE
SELLABILITY AUTHORING & PUBLICATION READINESS`)
**Date** 2026-09-10
**Branch** `feat/app11-s04-seo-infrastructure` (not pushed)

---

## A. Verdict

```text
APP12-N02.A01 = COMPLETE — AWAITING_PO_REVIEW
APP12-N02     = IMPLEMENTATION_IN_PROGRESS

APP12-N02.E01 = NEXT — NOT_EXECUTED

APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

PRODUCTION_DEPLOYED = false
PUSHED              = false
```

`B01` gave `product_variants` a writer. This package gives that writer an
operator. The Product editor now carries one bounded section, `Phiên bản & SKU`,
and with it the Admin can finally do the thing `N02.G01` proved it could not: make
a Ready-Made Product buyable, and repair a live one that is not.

Three things are worth stating up front because they shaped the work.

1. **The two malformed PUBLISHED shapes did not have to be manufactured.** Every
   `PUBLISHED` Product in every world has zero variants, because no delivered
   operation had ever created one. The live acceptance run opens the seeded
   published Product and finds the warning already there — the historical shape
   reproduced by doing nothing.
2. **`Chưa xét` is presentation and is provably only presentation.** The
   evaluator marks a dependent commerce criterion *vacuously satisfied*, and the
   rows still carry `data-satisfied="true"` while reading `Chưa xét`. Server
   eligibility is untouched, and the tests assert both halves of that.
3. **The live run found a real accessibility defect the jsdom tier could not.**
   An expanded variant card rendered three buttons named `Sửa` — one for the
   variant, one per SKU — indistinguishable in the accessibility tree. Fixed by
   naming the subject in each accessible name (§U).

---

## B. B01 PO reconciliation

Consumed exactly as delivered, reinterpreted nowhere:

```text
adminProductVariant_list      the authoring read — every variant, every SKU,
                              inactive rows included
adminProductVariant_create    create
adminProductVariant_update    labels, activate, deactivate — there is no delete
```

Reused, unchanged:

```text
adminSku_create · adminSku_update
adminSkuStock_get / _adjust / _ledger   (linked to, never called)
adminProduct_publicationReadiness · _publish · _unpublish
```

No variant DELETE exists and none was invented. `publicProductVariant_list` is not
used for Admin authoring anywhere, and the boundary test proves it mechanically.

---

## C. D01 implementation authority

`FIG-APPROVAL-APP12-N02-D01-PO-001` remains valid; the design-index gate passes
(613 registry IDs). No Figma was modified in this package.

Implemented from the approved states rather than redesigned:

```text
971:187  1440 DRAFT empty            → the section's empty state
972:187  1440 DRAFT populated        → compact rows, one expanded
973:187  1440 PUBLISHED editable     → section editable, core fields still locked
974:187  1440 PUBLISHED unsellable   → the structural warning and its evidence block
975:187 / 975:220 / 975:254          → variant create · refusals · last-variant confirm
976:187 / 976:269 / 976:300          → SKU create/edit · ambiguity · last-SKU confirm
977:187…977:638                      → the five readiness states, including 10/10 at stock 0
978:187                              → 1024 composition
979:187 / 979:222 / 979:321          → 390 empty · populated · recovery
```

One deliberate departure, recorded rather than hidden: the accessible names of the
per-row controls now name their subject (§U). The visible labels are the design's,
unchanged.

---

## D. API-client exports

`packages/api-client/src/catalog.ts` gains one curated block — five operations and
eight types:

```text
adminProductVariantList · adminProductVariantCreate · adminProductVariantUpdate
adminSkuCreate · adminSkuUpdate

AdminProductVariantListResponse · AdminProductVariantResponse
AdminVariantSkuResponse · AdminSkuResponse
CreateProductVariantBody · UpdateProductVariantBody · CreateSkuBody · UpdateSkuBody
```

`adminSkuCreate` and `adminSkuUpdate` had been on the contract since `APP7-B01`
with **zero call sites**, for the reason `G01` documented: a SKU is created under a
variant, and nothing could create a variant. This is the first caller either has
had.

No enum crosses as a value — `AdminVariantSkuResponseCurrencyCode` has one
server-owned member no screen branches on. No generated file was hand-edited.

```text
OpenAPI drift          = clean
generated-client drift = clean (tree hash d9b0741c…)
```

---

## E. Product editor integration

The section is composed into the existing `/products/{productId}` screen, in both
editable branches:

```text
DRAFT      ProductEditForm → ProductSellabilitySection
PUBLISHED  StructuralUnsellabilityWarning → ProductPublishedMediaForm
           → ProductSellabilitySection
```

Placement follows `D01` §D — after pricing, immediately before the publication
handoff. The warning sits **above** the form on purpose: a published Product that
cannot be ordered looks healthy everywhere else in the Admin.

Readiness invalidation is wired from the product screen, not from inside the new
feature: the readiness entry belongs to the product capability's key factory, and a
feature that invalidated another's cache entry by name would couple the two through
a string nothing checks.

---

## F. Variant list and progressive disclosure

Compact rows; exactly one variant expanded at a time, owned by the list rather than
the card. Collapsed rows still carry the sellability truth — title, active/inactive
badge, and either `SKU đang bán: <code>` or `Chưa có SKU nào đang bán — phiên bản
này chưa thể đặt hàng`.

Inactive variants and inactive SKUs stay in place as history, in the server's
creation order. No sorting by state, no table at any width, no permanently expanded
nested forms.

The disclosure carries `aria-expanded` and `aria-controls`; the SKU region carries
the matching id.

---

## G. Variant create / edit / deactivate

```text
create        adminProductVariant_create — Màu sắc, Kích thước, Đang hoạt động
edit          adminProductVariant_update — labels only
deactivate    adminProductVariant_update — { isActive: false }
reactivate    adminProductVariant_update — { isActive: true }
```

`displayOrder` is never sent. `isActive` is never sent on a label edit, and the
reason is not tidiness: the edit dialog is seeded from a record that may be stale,
and echoing the flag back would resurrect a variant someone else deactivated. So
activation is authored on **create** and changed afterwards only through the row's
own control — the one path that carries the confirmation.

After every mutation the authoritative list is re-read and readiness invalidated,
without a hard reload and without touching the Product form or its media state.

---

## H. Variant error mapping

Classified from the normalized envelope, never from a message string:

```text
VARIANT_LABEL_REQUIRED           → the field-level rule, checked locally first
PRODUCT_VARIANT_DUPLICATE        → names the collision, offers "open the existing one,
                                   which may merely be deactivated"
VARIANT_PRODUCT_NOT_AUTHORABLE   → notAuthorable
VARIANT_PRODUCT_NOT_FOUND
VARIANT_NOT_FOUND                → one reload-shaped outcome; three sentences for
VARIANT_PRODUCT_MISMATCH           one action would help nobody
```

The client does **not** attempt the duplicate check itself: uniqueness is decided
against rows the dialog cannot see, including deactivated ones. Staged input
survives every refusal except a lost session.

---

## I. SKU history, create, edit, deactivate

Active and inactive SKUs are both rendered, oldest first, from the Admin authoring
read. `adminSku_create` and `adminSku_update` do all four operations; there is no
SKU delete and none was added.

Fields are the contract's and nothing more: `Mã SKU`, the price mode, `Đang bán`.
No second SKU price model was introduced.

---

## J. SKU ambiguity handling

`SKU_ORDER_ELIGIBLE_AMBIGUOUS` renders the approved refusal: it names the SKU
already selling (read from the authoritative list — the server sends a code and a
sanitized sentence, not the row), numbers the two recovery steps, states in its own
sentence that the system will **not** deactivate the old SKU, and offers the second
legitimate path — create the new SKU inactive now.

Nothing retries. Nothing is deactivated automatically. The staged code survives, so
the operator can take either path without retyping. The live run asserts all four
of those.

---

## K. Effective-price presentation

```text
no override    Dùng giá sản phẩm: 480.000 ₫
override       Giá riêng cho SKU: 385.000 ₫
unusable       … + "Chưa có giá bán hợp lệ"
```

The dialog draws the two-way radio the design specifies rather than a bare optional
field, because "return this SKU to the Product's price" has nowhere to be expressed
otherwise — on update, inheritance is sent as an explicit `null`.

`"0"` is an override and is carried as one. It is never reinterpreted as
inheritance: doing so would publish a Product at a price nobody chose. The row says
so, and `SKU_PRICE_RESOLVABLE` is what refuses it.

All price work is on digit strings — no `Number`, no `parseInt`, no arithmetic
operator applied to an amount. Grouping reuses the Admin-shared `formatGroupedAmount`
rather than adding a second money authority.

---

## L. Stock handoff — `FU-APP12-N02-STOCK-REACHABILITY` closed

Every SKU row, active or inactive, carries `Quản lý tồn kho` → `/kho/skus/{skuId}`,
built with the inventory feature's own `adminSkuStockRoute` on its public boundary.
No second stock route, no inline stock write, no low-stock-threshold field, and no
stock read added to the authoring contract.

The live run clicks it for a SKU created seconds earlier, with **no order anywhere
in the world**, and lands on the real stock screen — the exact circularity `G01`
found, where `/kho/skus/{skuId}` was reachable only from an order row for a Product
that could not be ordered.

---

## M. PUBLISHED recovery

Both historical malformed shapes are repaired in place, live:

```text
Product A   PUBLISHED, 0 variants          → create variant → create SKU → clear
Product B   PUBLISHED, active variant, 0 selling SKUs → reactivate → clear
```

Neither required an unpublish. Status stayed `PUBLISHED` throughout, asserted after
the break, after the repair and after a full reload. Core Product fields stayed
behind the existing read-only lock and `M01`'s media curation was untouched.

Product A's shape was not manufactured: the seeded published Product has zero
variants because nothing has ever created one.

---

## N. Structural-unsellability warning

Rendered only for `PUBLISHED`, only from the variant structure, and never from
stock:

```text
badge      Không thể đặt hàng          (a word, not a colour)
heading    the Product is published and currently has nothing orderable
evidence   Phiên bản đang hoạt động: 1 · SKU có thể đặt hàng: 0
sentence   this is NOT hết hàng — that is stock 0 on a SKU still selling
routes     Đi tới Phiên bản & SKU · Xem điều kiện xuất bản
```

`role="alert"`, a text badge, a heading and a counted evidence block: four
non-colour carriers. It repairs nothing on its own and renders nothing at all
before the authoritative list has arrived — an unproven warning about a live
Product is worse than none.

A structurally valid Product renders no warning whatever its stock is.

---

## O. Ten-criterion readiness

All ten render, in the server's order, with the existing seven keeping their
labels. The three new labels come from `productRequirementLabel.*` in the canonical
message repository (added by B01), not from this package.

No second frontend evaluator exists. `satisfied` and `eligible` remain the server's;
the publish gate still reads `eligible` from the report, not from the rows.

---

## P. `Chưa xét` presentation

One rule, owned here, derived from the three criterion codes the client already
holds:

```text
HAS_ACTIVE_VARIANT unsatisfied   → the two dependants read Chưa xét
HAS_ORDER_ELIGIBLE_SKU unsatisfied → SKU_PRICE_RESOLVABLE reads Chưa xét
```

Rendered as a neutral dash plus an off-screen word, so it is not colour-only. A
criterion the report does not carry cannot defer one that follows it, so an older
server does not turn the checklist grey.

Proved in both tiers. States A, B and C each show **exactly one** actionable
failure, and the deferred rows still carry `data-satisfied="true"` — the contract
value, unrewritten.

---

## Q. Sold-out readiness

A structurally valid Product whose stock has never been touched — genuinely zero,
no order anywhere — renders 10/10 and offers publish. Stock is absent from the
criteria, absent from the counts and absent from the copy.

Publish is asserted **available** and deliberately not pressed: this package
authors sellability; the lifecycle transition is not its to make.

---

## R. 1440 browser

Variant header composes horizontally with actions on their own row; no label is
compressed. Section, cards, SKU rows, both dialogs, both confirmations and the
warning all render as approved. Asserted live.

## S. 1024 browser

The same composition at the shell breakpoint, with the narrowed navigation. Every
control visible, the stock link reachable, overflow 0.

## T. 390 browser

Stacked cards, title and badge on separate lines, actions wrapping, the stock link
on its own row, dialogs fitting the viewport with the primary action in view.

```text
horizontal document overflow at 390 = 0
horizontal overflow with a dialog open = 0
```

No table at any width.

---

## U. Accessibility

```text
axe serious = 0
axe critical = 0        on six scanned surfaces, at 1440 and at 390
no new axe exclusion    (color-contrast remains gated out under PO-APP12-004)
```

Carried structurally: `aria-expanded`/`aria-controls` on every disclosure; dialog
name and description on every dialog; form errors associated with their fields;
active/inactive as a word, not a colour; the structural warning as `role="alert"`
with a text badge; `Giữ nguyên` as the safe first action in both destructive
confirmations; `Chưa xét` with an off-screen state word.

**One real defect the live run found and this package fixed.** An expanded variant
card rendered three buttons whose accessible name was `Sửa` — the variant's and one
per SKU. Sighted operators tell them apart by position; a screen-reader user hears
three identical names in one region. Every per-row control now names its subject
(`Sửa phiên bản Xanh navy · M`, `Ngừng bán SKU AT-NAVY-M`, `Thêm SKU cho phiên bản
…`), through the message repository, with the visible label unchanged.

---

## V. Live disposable journeys

`pnpm --filter @embroidery/e2e-testing e2e:app12:n02a01` — **9 passed**, real
Chromium, real Admin behind the real Nginx gateway, real API, disposable
PostgreSQL, real operator logged in through the real form.

```text
A  DRAFT empty → sellable        create variant · create SKU · stock screen opens
B  variant refusals              blank labels · normalized duplicate ("  xanh   NAVY " / "m")
C  SKU ambiguity                 refused · existing SKU untouched · inactive path taken
D1 PUBLISHED, 0 variants         warning · repaired in place · still PUBLISHED
D2 PUBLISHED, last selling SKU   confirm · warning · readiness agrees · reactivate · clear
                                 + last-active-variant confirmation, answered safely
E  readiness Chưa xét            states A, B, C — one actionable failure each
F  sold out                      10/10 with stock 0 · publish available
V  visual matrix                 1440 / 1024 / 390 · overflow 0 · dialogs fit
X  accessibility                 axe serious/critical = 0 on six surfaces
```

**Every sellability mutation used as evidence was made through the Admin UI.** The
suite contains no SQL that inserts a variant or a SKU; a fixture that wrote one
would prove the fixture.

The Storefront purchase flow was not run — `N02.E01` owns cross-boundary
acceptance and is not authorized.

Two harness faults were found and fixed rather than worked around: SKU codes that
share a prefix made `hasText` resolve two rows (now matched on the code element,
anchored), and the readiness card's heading is the *verdict*, which the journeys
change (now waited on the checklist itself).

---

## W. Files changed

New — `apps/admin/src/features/product-sellability/` (24 TS/TSX, 6 SCSS):

```text
components/  product-sellability-section · variant-card · variant-sku-row
             sellability-dialog · sellability-dialog-host · variant-dialog
             sku-dialog · structure-break-dialog · sellability-failure-note
             structural-unsellability-warning
hooks/       use-product-variants-query · use-sellability-mutations
             use-sellability-dialogs
model/       sellability-copy · sellability-failure · sellability-keys
             sellability-anchor · sku-effective-price · sku-form
             variant-form · variant-presentation
services/    product-variant.service · variant-sku.service
styles/      product-sellability (+ 5 partials)
index.ts
```

Modified:

```text
apps/admin/src/features/products/components/product-detail-screen.tsx
apps/admin/src/features/products/components/product-requirement-list.tsx
apps/admin/src/features/products/model/product-publication.ts
apps/admin/src/features/products/model/product-publication-copy.ts
apps/admin/src/features/products/styles/product-publication.scss  (split, §X)
apps/admin/src/styles/main.scss
packages/api-client/src/catalog.ts
packages/i18n/messages/vi/admin.json
packages/e2e-testing/{package.json, playwright.config.ts, scripts/run-e2e.mjs}
docs/implementation/SCOPED_COMMAND_INDEX.md
```

Tests, new:

```text
apps/admin/test/model/product-sellability-model.test.ts        30 tests
apps/admin/test/model/publication-vacuity.test.ts               7 tests
apps/admin/test/components/product-sellability-section.test.tsx 20 tests
apps/admin/test/components/product-sellability-warning.test.tsx  7 tests
apps/admin/test/boundary/product-sellability-source.test.ts     11 tests
packages/e2e-testing/specs/app12/n02a01-sellability.acceptance.spec.ts
packages/e2e-testing/specs/app12/support/n02a01-world.ts
```

Tests, modified — three suites render `ProductDetailScreen`, which now composes the
section and therefore always reads. Each was given a variant-list default rather
than being loosened: the media suite gets a *sellable* structure, because with an
empty list its published Product is truthfully unsellable and the resulting banner
is a second `role="alert"` in a suite asserting about media refusals. One assertion
changed rather than being deleted: `product-edit`'s "carries no variant or SKU copy"
was correct until this package delivered exactly that, so it now asserts the section
is present *and* that no delete affordance arrived with it.

---

## X. File-size

Every file this package wrote is inside the limits. Two pre-existing sheets were
split by responsibility rather than by line count:

```text
product-publication.scss  395 → 24 (entry) + tokens/shell/requirements/actions
                          the ten-criterion rows pushed it to 414, over the 400 limit
_product-sellability-section.scss  314 → 89 (frame) + 228 (rows) + 8 (tokens)
```

```text
scoped file-size (this package's paths)  PASS — 38 files, 1 above review threshold
scoped SCSS file-size                    PASS — 26 stylesheets, 1 above review
```

The one above review is `n02a01-world.ts` at 309 — a single page-object for one
suite, kept whole deliberately.

Two repository-wide `FAIL` rows exist and are **pre-existing debt in files this
package did not touch**: `design-case-workbench.test.tsx` (638) and
`s03-world.ts` (426).

---

## Y. Validation

Commands actually run:

```text
git diff --check                                                clean
pnpm --filter @embroidery/admin typecheck                       PASS
pnpm --filter @embroidery/admin lint                            PASS
pnpm --filter @embroidery/admin test                    143 suites / 2073 tests PASS
pnpm --filter @embroidery/api-client lint                       PASS
pnpm --filter @embroidery/i18n typecheck                        PASS
pnpm --filter @embroidery/i18n test                     3 suites / 28 tests PASS
pnpm --filter @embroidery/e2e-testing typecheck                 PASS
pnpm --filter @embroidery/e2e-testing lint                      PASS
node tools/check-i18n-static-text.mjs                           PASS (0 exemptions)
node tools/check-i18n-message-keys.mjs                          PASS (no orphans)
pnpm --filter @embroidery/api openapi:check                     PASS (no drift)
pnpm --filter @embroidery/api-client check:generated            PASS (no drift)
node tools/check-figma-design-index.mjs                         PASS (613 IDs)
node tools/check-file-size.mjs --paths <this package's paths>    PASS
node tools/check-scss-file-size.mjs <both style dirs>            PASS
pnpm --filter @embroidery/admin build                           PASS (SCSS compiles)
pnpm --filter @embroidery/e2e-testing e2e:app12:n02a01     9 journeys PASS
pnpm format:check                        3 pre-existing files only (see below)
node tools/check-report-secrets.mjs                             PASS
```

`pnpm format:check` reports three files this package did not touch and which were
already unformatted at entry: `packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs`,
`tools/uat-app12-u01-clone.mjs`, `tools/uat-app12-u01-world.mjs`. Every file this
package wrote or edited is Prettier-clean.

`N02.E01` was not run. `U01` was not resumed. No broad APP12 regression was run.

---

## Z. Hygiene

```text
shared_dev_mutations  = 0     every write landed in the run's disposable database
G03_data_created      = false
disposable teardown   = PASS  "cleanup verified: all E2E ports closed,
                               disposable database dropped"
PRODUCTION_DEPLOYED   = false
PUSHED                = false
```

No `.env` was written, no secret-bearing variable was read out, and no credential
was rotated. Test credentials are the orchestrator's synthetic ones.

---

## AA. Baseline

Unchanged, verified after the work:

```text
OpenAPI paths       = 129
OpenAPI operations  = 143
OpenAPI schemas     = 284

migrations          = 39      (no 0040)
Admin routes        = 26
Storefront routes   = 20
```

No API path or operation changed, no route was added, no migration was written, and
no backend or domain code was touched. No backend defect was discovered, so
`CORRECTION_REQUIRED` does not apply.

---

## AB. Remaining follow-ups

```text
FU-APP12-N02-STOCK-REACHABILITY     CLOSED by §L
FU-APP12-U01-LOW-STOCK-AUTHORITY    UNCHANGED — no threshold field, API or
                                    readiness dependency was added
FU-ADMIN-SHARED-DIALOG-01           UNCHANGED — this feature carries a ninth
                                    hand-rolled dialog rather than half-paying
                                    the debt by promoting one for a single caller
FU-APP12-H08-04                     UNCHANGED and re-confirmed the hard way: the
                                    e2e harness runs `next start` and never
                                    builds, so the accessible-name fix was
                                    invisible to the run until `apps/admin` was
                                    rebuilt
```

Pre-existing, untouched, and named so they are not mistaken for this package's:
`design-case-workbench.test.tsx` and `s03-world.ts` exceed the hard file-size
limits, and three files outside this change are not Prettier-clean.

---

## AC. N02 roadmap

```text
APP12-N02.G01 = COMPLETE — PO PASS
APP12-N02.D01 = COMPLETE — PO APPROVED
APP12-N02.B01 = COMPLETE — PO PASS
APP12-N02.A01 = COMPLETE — AWAITING_PO_REVIEW   ← this package
APP12-N02.E01 = NEXT — NOT_EXECUTED

ROADMAP_CHECKPOINTS = 41
```
