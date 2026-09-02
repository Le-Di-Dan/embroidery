# APP12-S01 — Product Detail Ready-Made Purchase State

Checkpoint: `APP12-S01 — Product Detail purchase state`
Phase: `APP12 — Hardening, UAT and Production Readiness`
Date: 2026-09-02

---

## A. Verdict

```text
APP12-S01 = COMPLETE

route                 = /san-pham/[slug]   (reused, extended)
new_Storefront_routes = 0
new_HTTP_operations   = 0
new_migrations        = 0
DB_schema_delta       = 0
FIGMA_DELTA           = 0
commercial_writes     = 0
```

`APP12-B05` remains `COMPLETE`. The roadmap remains `LOCKED` at 38 checkpoints.
Exactly one checkpoint is `NEXT`: `APP12-S02`.

One judgement is flagged for the Product Owner rather than buried — the
multi-SKU disposition in §G. It is not a request to reopen anything; it is the
one place where the prompt's §9 and the delivered write-side authority point at
two different verdicts, and the reasoning is set out in full so the ruling can be
made on the facts.

---

## B. B05 bookkeeping reconciliation

Documentation only. No runtime, contract, test or schema change, and
`APP12-B05` is not reopened.

| item | before | after |
|---|---|---|
| `APP12-B05-COMPLETION-REPORT.md` §W | `**New (11)**` above a list of 13 paths | `**New (13)**`, with the correction and its provenance stated inline. The list itself was always right and is byte-identical. |
| `FU-APP12-B05-03` | open, routed to `APP12-H01` | struck through and closed as a **duplicate**, merged into the existing `APP12-H02` stale table-count debt, on Product Owner routing |

Kept open and untouched, as instructed: `FU-APP12-B05-01` → `APP12-H01`,
`FU-APP12-B05-02` → `APP12-H01`.

---

## C. D01 / source preflight

Both halves were measured before any edit.

### C.1 Design authority

`docs/design/FIGMA_DESIGN_INDEX.md` rows resolved, all
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP12-D01-PO-001`, all read at
their exact nodes in file `BQwqV8GdfUIELvsQDB1UQE`:

| registry id | frame | panel node |
|---|---|---|
| `FIG-APP12-S01-PURCHASE-DESKTOP` | `902:4` | `904:40` |
| `FIG-APP12-S01-PURCHASE-TABLET` | `905:67` | `905:89` |
| `FIG-APP12-S01-PURCHASE-MOBILE` | `905:187` | `905:209` |
| `FIG-APP12-S01-PURCHASE-OUT-OF-STOCK` | `906:140` | `906:143` |
| `FIG-APP12-S01-PURCHASE-SELECTION-INCOMPLETE` | `906:186` | `906:189` |

**Access was blocked and then restored, and this is recorded because it changed
how the checkpoint ran.** The `figma-desktop` MCP server was
`ConnectionRefused` for the whole session and the remote Figma MCP was
unauthorized. The `APP12-D01` report describes the panel's *structure* but
records only one of its copy strings (`Tạm hết hàng`), so implementing from it
alone would have meant inventing customer-facing Vietnamese copy — precisely what
§4 (*reuse first, invent last*) and §5 (*do not infer UI labels from backend
field names*) forbid. The blocker was raised, the operator authorized the remote
server, and every string below was then transcribed from the frames themselves.
No copy in this checkpoint was written from a field name or from imagination.

### C.2 Delivered source

| question | measured answer |
|---|---|
| route | `apps/storefront/src/app/san-pham/[slug]/page.tsx`, `export const dynamic = 'force-dynamic'` |
| data fetch | `loadProductDetail`, React `cache()`d, server-only, deep-imported past the feature barrel |
| composition | `ProductDetailScreen` is a **Server Component**; only the gallery and Share are client islands |
| client state | `use-gallery-selection`, `use-share`, `use-dialog-focus` — all feature-internal |
| category link | `resolveProductBreadcrumb` + `DetailContinueDiscover` → `/kham-pha?category=<slug>`, dynamic since `APP12-C03` |
| Wave-2 suppression | `release-isolation` + `src/proxy.ts`; `/san-pham/[slug]` is allowed and only the `/thiet-ke` child is withheld. Product Detail draws **no** custom CTA today |
| variant labels | `variantLabel()` — `colorName · sizeLabel`, approved fallback when both are null |
| SKU cardinality | `MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT = 1`, **write side only**; `APP12-B01` projects every eligible SKU in id order and refuses a tie-break |
| public SKU differentiator | **none**: `PublicProductSkuResponse` is `skuId` + `unitPrice` + `availableQuantity` |
| money helper | `formatExactAmount` / `formatExactMoney`, string-only, currently feature-local in three secure-payment features |
| D01 quantity control | 44px stepper `−  1  +` (`904:68`), availability stacked beneath it (`904:76`) |
| D01 unavailable state | `906:143` — price kept, caption swapped, every option disabled, quantity block **removed**, CTA disabled reading `Tạm hết hàng` |
| Next.js caching | segment already `force-dynamic`; no `revalidate`, no `generateStaticParams` |
| test harness | Jest + `next/jest` + jsdom + RTL through `@embroidery/frontend-testing`; Playwright in `packages/e2e-testing` |

---

## D. Product Detail architecture

**One new sibling, and nothing moved.** `ProductDetailScreen` gains exactly one
child, after the identity group and before the story, as all three viewport
frames draw it:

```text
Breadcrumb · Gallery · identity(chip · title · Share) · [NEW] PurchasePanel ·
Story · Continue
```

The media hierarchy, the breadcrumb, the category chip, Share, the 640 story
measure and the continuation section are labelled `UNCHANGED` in the frames and
are unchanged in the source. No buy-box split, no restructured hero, no change to
global navigation or tokens.

**The island is bounded.** `ProductDetailScreen` stays a Server Component; a
boundary test asserts it carries no `'use client'` and that exactly three files
in the new feature do. The purchase *data* is read on the server in the route and
handed to the island as props, so the island issues no browser request, holds no
query cache, and has no loading state to flash.

```text
apps/storefront/src/features/ready-made-purchase/
  model/      purchase-projection · purchase-selection · purchase-continue-url
              purchase-money · ready-made-purchase-copy
  services/   ready-made-purchase.server        (server-only, NOT in the barrel)
  components/ ready-made-purchase-panel · purchase-option-fieldset
              purchase-quantity-stepper
  styles/     ready-made-purchase.scss · _ready-made-purchase-tokens.scss
```

---

## E. B01 purchase-data composition

`publicProductVariant_list` is the only purchase-data authority, reached through
the **generated client** (`publicProductVariantList`) with no handwritten DTO. A
boundary test asserts the feature contains no `fetch(`, no `axios.get`, no
`'/api/` literal and no `interface …(Sku|Price)…Response`.

Two curated type exports were opened in `@embroidery/api-client` so the
Storefront could name shapes it already receives — `PublicPriceResponse` beside
the catalog reads, `PublicProductSkuResponse` beside the operation that publishes
it. **Types only; no operation was released, and the OpenAPI artifact is
untouched.** The stale comment on that boundary — which still said the variant
list *"publishes no SKU, price or stock"* — was corrected in the same change.

**One read per render, structurally.** The route reads the projection once, on
the server, memoized by React `cache()` for the request; the panel has no client
to call with, so there is no N+1 to grow. A boundary test asserts no `useQuery`,
`useEffect`, `getBrowserApiClient` or `QueryClient` anywhere in the feature.

**A failure is not zero stock.** Every refusal — malformed slug, safe 404,
transport error, 500 — resolves to `unavailable`, and the panel says it could not
read the purchase state. It never falls back to the Product base price, to
`isDisplayOutOfStock` or to a historical constant. The 404 in particular is left
as `unavailable` rather than promoted to a page-level not-found: the Product's own
read has already decided it is publicly visible, so a 404 here means the two reads
raced an unpublication, and telling the visitor the artwork does not exist while
they are reading it would be the wrong sentence.

---

## F. Variant selection

`APP12-D01` draws two fieldsets — `Phân loại` and a `Kích thước` that *resolves
the SKU*. Both are **derived from the response**: the distinct non-blank
`colorName` and `sizeLabel` values, in the order the server published them.

```text
colorValues  = distinct(colorName), first-seen server order
sizeValues   = distinct(sizeLabel), first-seen server order
```

- **Nothing is hard-coded.** No colour list, size list, ordering or product
  assumption exists in the source; a boundary test asserts the feature names no
  colour, size, category slug or product slug, and the category anti-hardcode
  gate passes over all 2 465 production files.
- **Nothing is re-sorted.** Proved with a fixture whose server order is the
  reverse of alphabetical.
- **Nothing is preselected.** The contract marks no variant as default and none
  is invented; the live suite asserts zero checked radios on load at all three
  viewports.
- **An axis the server published no value for imposes no requirement.** A Product
  whose variants carry only a size renders one fieldset; a single unlabelled
  variant renders none and resolves directly.
- **APP5 semantics are preserved.** Every variant survives the projection,
  including one with no SKU, an inactive SKU or zero stock. Purchasability
  changes whether an option is *selectable*, never whether it exists.

---

## G. Multi-SKU decision

```text
multi_SKU = SUPPORTED_BY_REFUSAL
heuristic_winner = NONE
skuId_rendered_as_copy = false
```

### G.1 The contract fact

`PublicProductSkuResponse` carries `skuId`, `unitPrice` and `availableQuantity`.
`skuId` is internal identity; price and availability are *facts about* a SKU, not
*names for* one. **There is no customer-visible differentiator**, and
`APP12-D01` draws no control that could express one.

### G.2 What was implemented

A variant with more than one order-eligible SKU resolves to the subject kind
`ambiguous`, which carries **no SKU at all**. Its option is rendered, is not
selectable, and is deliberately **not** captioned `· hết` — because nothing about
that refusal is a statement about inventory. Nothing is selected, no price is
shown for it, and no id reaches the page. Both §9 prohibitions are satisfied
structurally rather than by remembering to: there is no member to leak and no
tie-break to take.

### G.3 Why this is a transcription, not an invention

The delivered, locked authority for this exact state is already written, in
`apps/api/src/modules/catalog/domain/product-sku.policy.ts`:

```text
exactly one order-eligible SKU  -> conversion may proceed
zero order-eligible SKUs        -> later conversion refuses safely
more than one                   -> later conversion refuses safely
```

with the module explicit that it *"never selects a SKU by recency, id order or
any other tie-break — there is no tie to break, because an ambiguous set is never
allowed to exist"*. The write side (`MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT = 1`)
makes the state unreachable through the Admin; `APP12-B01` publishes the whole set
precisely so the read would not have to assume the cap. S01 refuses in the same
words the rest of the system refuses in.

### G.4 The flag

The prompt's §9 says that absent a truthful differentiator the checkpoint is
`BLOCKED_CONTRACT_GAP`. Read strictly, that verdict would block the whole
checkpoint over a state the system forbids an operator from creating — while
every other §33 case is delivered and proved. The reading taken here is that §9's
block is aimed at the alternative in which S01 would have to *render a chooser*
among indistinguishable SKUs; since the delivered authority says the correct
answer is to refuse, refusing truthfully is not a gap.

**This is flagged rather than assumed.** If the Product Owner reads §9 as
covering the refusal too, the verdict becomes `BLOCKED_CONTRACT_GAP` and the
remedy is a backend change (`APP12-B01` publishing a customer-visible SKU
differentiator) that S01 may not make from a Storefront checkpoint. No code would
change on that ruling — only the verdict — because the panel already refuses.

The refusal is proved live: the fixture writes two order-eligible SKUs under one
variant directly (no application path will produce it), and the browser suite
asserts the option is disabled, uncaptioned, and that neither SKU price nor id
appears anywhere on the page.

---

## H. Price authority

```text
price_source = B01_RESOLVED (when a SKU is resolved)
             = publicProduct_detail.price (before one is)
client_price_resolution = NONE
```

`selectedSku?.unitPrice ?? product.price`. Both operands are server-published
`PublicPriceResponse` values; nothing is computed, chosen or combined here.

The second operand is `APP12-D01`'s own instruction: `906:189` and `906:143` both
state an amount while no SKU is resolved, and the Product's published catalog
price — the same `products.base_price_amount` that `APP12-B01`'s `COALESCE` falls
back to — is the only truthful thing to state there. `APP2-S02` had dropped
`price` at the projection boundary because the page was a studio Work Detail
(IMP-D039); APP12 made it a place a customer buys something, so that half is
reversed, explicitly and in one place.

**`isDisplayOutOfStock` is still dropped**, and that half is now enforced harder
than before: two tests (the model and the source boundary) assert it never enters
the view model or any Product Detail component.

**No float, anywhere.** The feature contains no `Number(`, `parseFloat`,
`Math.round/floor/ceil`, and exactly one `parseInt` — in the quantity clamp,
which is a count and not money. Asserted by a boundary test that counts the
occurrences. `999999999999` survives formatting intact.

Price follows the SKU immediately and deterministically: proved in the component
suite (`399.000` → `1.250.000` on a variant change) and live in the browser.

---

## I. Availability authority

```text
availability_source = B01_CANONICAL (availableQuantity)
advisory            = true
holds_created       = 0
```

The exact published count, stated as `Còn {n} sản phẩm` — the approved wording of
`904:78`, a quantity rather than an urgency. No scarcity marketing was invented;
`Chỉ còn 2 sản phẩm` and its relatives appear nowhere.

Availability is a read-time UX fact. Nothing is held or reserved by looking, the
panel says nothing about reservation, and `APP12-B02` re-checks the number under
the inventory lock when an order is actually created (`BR-024`).

**`· hết` is earned, not assumed.** An option carries it only when every variant
behind it resolves to one eligible SKU published with zero availability. An
option refused because its variant has *no* SKU, or *several*, is equally
unselectable and carries no caption — proved in both the model and the live
suites, in the same test, so the two cannot drift.

---

## J. Quantity behaviour

```text
minimum = 1 · integers only · maximum = selected SKU availableQuantity
```

Enforced three ways, deliberately: the `max` attribute (so assistive technology
is told the bound), the `+` button's disabled state, and `clampQuantity`
re-deriving the effective value from the raw text on every render. The attribute
alone is insufficient — a browser lets a typed value exceed `max` — and the clamp
alone would let the control display something unbuyable.

`clampQuantity` returns `1` for a blank, a space, `0`, `-1`, `1.5`, `abc`, `NaN`,
`1e3` and a non-ASCII digit, and the ceiling for anything above it. The value that
reaches the continue URL is always a positive integer within the published
availability, even while the control still shows what was typed.

**A SKU change cannot retain an invalid quantity.** The typed value is keyed to
the SKU it was typed for, so a different SKU resets the control to `1` — with no
effect, no synchronisation and no window in which the old number is live.
`APP12-D01` is silent on the transition, so the predictable reset to `1` the
prompt names was taken. Proved: quantity 2 on a 3-stock SKU, switch to the
8-stock SKU, control reads `1` and the href says `quantity=1`.

---

## K. Continue URL contract

```text
/san-pham/<slug>  →  /mua-hang/<slug>?sku=<skuId>&quantity=<n>
```

Composed by `buildPurchaseContinueHref` over `URLSearchParams` and the one
Storefront route builder. `STOREFRONT_CHECKOUT_ROUTE_BASE` and
`buildStorefrontCheckoutPath` were added to `storefront-navigation.ts` — the one
place every Storefront path is written — so the address S01 promises and the route
`APP12-S02` mounts are composed from one function rather than from two literals
that agree today. A boundary test asserts the feature contains no `/mua-hang` or
`/san-pham` literal of its own.

- **Exactly two parameters.** A test enumerates `price`, `unitPrice`, `amount`,
  `currency`, `availableQuantity`, `productId`, `variantId` and `customerId` by
  name and asserts each is absent, so a future addition fails rather than slips.
- **Slug identity is preserved**; no raw Product UUID reaches a customer URL.
- **Quantity is canonical decimal integer text.**
- **A hostile value cannot write the URL**: `sku=sku&quantity=999` round-trips as
  one encoded parameter and the real quantity is unchanged.
- **`/mua-hang/[slug]` is not implemented.** A boundary test walks the App Router
  tree on disk and asserts no `mua-hang` and no `don-hang` segment exists. The
  live suite asserts the `href` and deliberately never follows it.

---

## L. Wave-1 custom isolation

With `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` — which is how the whole live run
was configured — Product Detail advertises no Wave-2 path. The live suite asserts
zero `a[href*="/thiet-ke"]` and zero `a[href^="/yeu-cau"]` on the page, at all
three viewports, while the purchase panel stays fully usable.

**No second release flag was added.** A boundary test asserts the feature never
reads `CUSTOM_EMBROIDERY_RELEASE_ENABLED`, never matches `READY_MADE_*_ENABLED`,
and never touches `process.env` at all — the Ready-Made panel is a released
Wave-1 surface and must not be gated by the Wave-2 switch either. When Wave 2 is
enabled later, the existing custom capability coexists under existing authority
with nothing here to change.

---

## M. Dynamic category regression

Untouched and re-proved. The breadcrumb and the continuation section both address
the category as `category.name` → `/kham-pha?category=<category.slug>`, from
`resolveProductBreadcrumb`, with no fixed list anywhere.

The live proof is stronger than a fixture assertion: the test category
`app12-s01-e2e-do-thu-nghiem` exists only inside one disposable database, so a
compiled taxonomy could not have produced that link at all.

```text
node tools/check-category-source-of-truth.mjs
→ 2465 production source file(s) scanned; no compiled category values,
  no legacy taxonomy imports, no slug-to-label maps.   PASS
```

At 390 the delivered breadcrumb collapses to the single back link, so which of
the two category links is on screen differs by viewport; the suite asserts the
link exists and that at least one is visible, because the collapse is `APP2-S02`
design and not an S01 regression.

---

## N. Loading / error / degraded states

| state | trigger | rendered |
|---|---|---|
| `RESOLVED` | one eligible SKU with stock | `904:40` — price, both fieldsets, quantity, availability, live CTA |
| `INCOMPLETE` | purchase possible, no SKU determined | `906:189` — CTA disabled reading `Mua ngay`, approved error bound to the open fieldset |
| `OUT_OF_STOCK` | no variant is buyable | `906:143` — price kept, caption swapped, options disabled, **quantity block removed**, CTA disabled reading `Tạm hết hàng` |
| `unavailable` | projection could not be read | factual failure line, no price, no options, no CTA |

`OUT_OF_STOCK` covers both "every SKU is at zero" and "there is no purchasable
SKU at all", because that is what frame `906:140`'s own title says — *"Hết hàng —
không còn SKU nào mua được"*. A Product with nothing to sell therefore still
renders in full: gallery, story, breadcrumb and continuation all intact, HTTP 200,
never a 404.

The approved error copy appears only once the customer has started choosing, as
`906:186` depicts — nothing is claimed of a visitor who has just arrived.

**The degraded state is the one thing `APP12-D01` does not draw.** §24 forbids
answering a backend failure with stock copy, and `Tạm hết hàng` would be a claim
about inventory this process never received. Rather than invent a visual system,
the panel reuses the delivered Product Detail error voice
(`PRODUCT_DETAIL_COPY.errorBody`, `537:38`). Recorded as `FU-APP12-S01-01` for
`APP12-D01` to draw, not silently absorbed.

---

## O. Accessibility

- Every option is a native `<input type="radio">` inside a `<fieldset>` with a
  real `<legend>`. The input is visually hidden, never removed, so the group name,
  arrow-key navigation, the checked state and a genuine `disabled` attribute are
  all the platform's. No clickable `div` pseudo-control exists.
- The quantity is a real `<input type="number">` with `min`, `max` and `step`
  between two `<button type="button">`s carrying accessible names.
- The approved error is bound to its fieldset with `aria-describedby` — never a
  toast, as `906:186`'s own annotation requires.
- Focus is visible on every control, including the ones whose input is
  transparent, via `:focus-visible` rings on the rendered pill.
- Status is never colour-only: the `✓` is `aria-hidden` decoration and the count
  beside it carries the whole meaning; a disabled CTA states its reason in its own
  label or in the adjacent bound error.
- 44px targets on every viewport, not only mobile — asserted, and asserted not to
  sit behind a media query.
- The component suite narrows with a real `instanceof HTMLInputElement` check
  rather than a cast, so "these are real inputs" is proved rather than assumed.

Live: keyboard-only selection with `Space`, and `ArrowDown` moving within the
group — behaviour a styled `div` cannot have — at all three viewports.

---

## P. Responsive implementation

Measured from the frames: the panel is 640 / 560 / 342 wide at 1440 / 1024 / 390,
and in every frame it is **exactly the width of the Story column**. So the
stylesheet restates that one delivered measure (`$story-measure-max`, locked by
`APP2-S02-G01-C1`) instead of three viewport numbers that would then have to be
kept in step with a column the panel must always match. A boundary test asserts
the two remain equal.

The only responsive rule the panel needs is `flex-wrap` on the option rows, which
wrap at 390 (`905:215`, `905:224`) and do not at 1024 or 1440. Padding, gaps and
target sizes are identical at all three, exactly as drawn.

Live at all three viewports: no clipping, no overlap, no horizontal overflow
(`scrollWidth - clientWidth <= 0`), and the floating contact dock's rendered
rectangle asserted not to intersect the CTA's — compared as real boxes, not as a
class name.

---

## Q. Playwright live evidence

```text
CMD-E2E-APP12-S01 → pnpm --filter @embroidery/e2e-testing e2e:app12:s01

28 passed (16.9s)   playwright exited with code 0
viewport_1440 = PASS   viewport_1024 = PASS   viewport_390 = PASS
```

Real Chromium → real Nginx gateway (`http://embroidery.local:8090`) → real
Storefront process (production build, `next start`) → real API process → real
PostgreSQL. Nothing mocked at any layer.

Covered, at each of the three viewports: panel renders; nothing preselected; CTA
disabled; the approved error binds to the open fieldset; the selection resolves a
SKU; the price follows it (`450.000` → `399.000` → `450.000` by a different
route); the availability line states the published count; a sold-out size is
disabled and captioned; the ambiguous variant is disabled and uncaptioned with
neither price nor id on the page; the quantity starts at 1, publishes `max=3`,
steps to the ceiling and stops, and refuses a typed `99`; the continue `href`
carries exactly `sku` and `quantity` and targets `/mua-hang/<same-slug>`; a
Product with nothing to sell answers HTTP 200 with the approved unavailable panel
and no navigable action; the dynamic category link resolves; no Wave-2 path is
present; keyboard operation works; the dock does not overlap; nothing overflows.

Plus one global case: a whole page view and interaction sequence issues **no
non-GET request at all** — every request method observed by the browser was
recorded and the list asserted empty.

Screenshots attached to the run for the in-stock and out-of-stock panel at each
viewport (six), and compared against the source frames. Two spec-side defects
found and fixed during the run, both in the harness rather than the product: a
label query for `Số lượng` also matched the two step buttons (now queried by
`spinbutton` role), and a first click landing before hydration was lost to the
controlled input (now a retried check-and-verify, documented in the spec).

---

## R. Figma / source mapping

```text
FIGMA_DELTA = 0     (no Figma node was created, modified or moved)
```

| frame / node | implemented in | state |
|---|---|---|
| `902:4` / `904:40` desktop | `ready-made-purchase-panel.tsx` + `ready-made-purchase.scss` | implemented |
| `905:67` / `905:89` tablet | same, via the shared measure | implemented |
| `905:187` / `905:209` mobile | same, plus option wrapping | implemented |
| `906:140` / `906:143` out of stock | panel `OUT_OF_STOCK` state | implemented |
| `906:186` / `906:189` selection incomplete | panel `INCOMPLETE` state | implemented |
| `904:41` price block | `__price-block` / `__price` / `__caption` | implemented |
| `904:44` / `904:53` fieldsets | `purchase-option-fieldset.tsx` | implemented |
| `904:62` disabled option + `904:64` `· hết` | `__option-input:disabled` + `__option-note` | implemented |
| `904:65`–`904:78` quantity + availability | `purchase-quantity-stepper.tsx` | implemented |
| `904:79` / `183:46` / `183:49` DS Primary | `__cta` and its `:disabled` | implemented |
| Product Detail hero, story, continue | untouched | `UNCHANGED`, as the frames label them |

Intentional foundation-preservation decisions, each recorded in source:

1. The panel width reads the delivered story measure rather than three frame
   numbers, because the frames' own invariant is that the two are equal.
2. `--color-action-disabled` (`#d6d3d1`) is aliased to the existing
   `$color-border-secondary`, which is the token the foundation binds to that
   value. No global token was added or modified; a test asserts the stylesheets
   contain no hex or `rgba()` literal at all.
3. `20px` option padding and the `56px` stepper value box are off the shared
   spacing scale and are documented local literals, on the `APP2-S02` / `APP5-S01`
   precedent — inventing scale steps would change a shared foundation to suit one
   screen.
4. The degraded state has no frame and reuses delivered error copy (§N,
   `FU-APP12-S01-01`).

---

## S. Database / test-data hygiene

```text
G03_data_created                      = false
shared_dev_S01_test_catalog_rows_created = 0
disposable_db_removed                 = true
commercial_writes                     = 0
```

Shared development database, measured **after** the run:

```text
skus 0 · sku_stocks 0 · orders 0 · categories 5 · products 30
products matching 'app12-s01-e2e%'   = 0
categories matching 'app12-s01-e2e%' = 0
```

— identical to its state before the checkpoint began. Nothing was written to it
at any point.

The live acceptance ran entirely on a disposable stack: a tmpfs PostgreSQL
container, a database named `embroidery_db7_e2e_<runId>_<pid>` created by the
canonical harness, migrations 1..38 applied and schema-baseline verified, the
fixture seeded, the suite run, and everything dropped in `finally`
(`cleanup verified: all E2E ports closed, disposable database dropped`).

`seedS01Catalog` refuses outright any database not named `embroidery_db7_*`, so
the rule is enforced by the code rather than by the operator remembering it — the
failure it exists for is a mistyped `E2E_POSTGRES_PORT` pointing the seeder at the
shared stack, where the rows would be indistinguishable from a real catalog.

Every business key carries the `app12-s01-e2e-` prefix, so a row that somehow
outlived its database is recognisable as harness debris and could never be
mistaken for `APP12-G03` data.

**Pre-existing, not absorbed**: the shared development PostgreSQL still hosts 13
leaked `embroidery_db7_*` databases from earlier checkpoints
(`FU-APP12-B02-04` → `APP12-H02`). None is from this run — this run's database
lived on the ephemeral E2E PostgreSQL, which was destroyed with its container —
and cleaning them is `APP12-H02`'s work.

---

## T. Files changed

**New (13)**

```text
apps/storefront/src/features/ready-made-purchase/index.ts
apps/storefront/src/features/ready-made-purchase/model/ready-made-purchase-copy.ts
apps/storefront/src/features/ready-made-purchase/model/purchase-money.ts
apps/storefront/src/features/ready-made-purchase/model/purchase-projection.ts
apps/storefront/src/features/ready-made-purchase/model/purchase-selection.ts
apps/storefront/src/features/ready-made-purchase/model/purchase-continue-url.ts
apps/storefront/src/features/ready-made-purchase/services/ready-made-purchase.server.ts
apps/storefront/src/features/ready-made-purchase/components/ready-made-purchase-panel.tsx
apps/storefront/src/features/ready-made-purchase/components/purchase-option-fieldset.tsx
apps/storefront/src/features/ready-made-purchase/components/purchase-quantity-stepper.tsx
apps/storefront/src/features/ready-made-purchase/styles/ready-made-purchase.scss
apps/storefront/src/features/ready-made-purchase/styles/_ready-made-purchase-tokens.scss
packages/e2e-testing/support/app12/s01-catalog-fixture.mjs
```

**New — tests (4)**

```text
apps/storefront/test/unit/ready-made-purchase-model.test.ts
apps/storefront/test/components/ready-made-purchase-panel.test.tsx
apps/storefront/test/boundary/ready-made-purchase-source.test.ts
apps/storefront/test/support/ready-made-purchase-fixture.ts
packages/e2e-testing/specs/app12/s01-purchase-state.acceptance.spec.ts
```

**Modified — Storefront (6)**

```text
apps/storefront/src/app/san-pham/[slug]/page.tsx              + purchase read, passed as a prop
apps/storefront/src/features/product-detail/components/product-detail-screen.tsx  + one child
apps/storefront/src/features/product-detail/model/product-detail-view.ts          + price (stock flag still dropped)
apps/storefront/src/features/storefront-shell/model/storefront-navigation.ts      + checkout route + builder
apps/storefront/src/features/storefront-shell/index.ts                            + two exports
apps/storefront/src/styles/main.scss                                              + one @use
```

**Modified — contracts client (2)**

```text
packages/api-client/src/catalog.ts          + PublicPriceResponse (type only)
packages/api-client/src/custom-requests.ts  + PublicProductSkuResponse (type only), stale comment corrected
```

**Modified — tests (4)**

```text
apps/storefront/test/unit/product-detail-model.test.ts        price assertion narrowed to the stock flag
apps/storefront/test/boundary/product-detail-source.test.ts   same, plus a delegation boundary
apps/storefront/test/smoke/product-detail-dedupe.test.tsx     mocks the second route read
apps/storefront/test/smoke/seo-detail-metadata.test.tsx       same
```

**Modified — harness (3)**

```text
packages/e2e-testing/support/orchestration/environment.mjs  + withStorefront
packages/e2e-testing/scripts/run-e2e.mjs                    + --app12-s01 mode
packages/e2e-testing/playwright.config.ts                   + app12-s01-chromium project
packages/e2e-testing/package.json                           + e2e:app12:s01, pg 8.22.0
```

**Modified — documentation (3)**

```text
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md  S01 COMPLETE, S02 NEXT
docs/implementation/SCOPED_COMMAND_INDEX.md                             + 2 scoped commands
docs/implementation/reports/APP12-B05-COMPLETION-REPORT.md              §B bookkeeping only
```

---

## U. File-size evidence

```text
node tools/check-file-size.mjs --paths apps/storefront/src/features/ready-made-purchase
→ Scoped file-size check passed (12 file(s), 0 above the review threshold).
```

Largest owned files: `ready-made-purchase.scss` 268, `_ready-made-purchase-tokens.scss`
44, `ready-made-purchase-panel.tsx` 180, `purchase-selection.ts` 173,
`purchase-projection.ts` 142. Every owned source file is under the 300 review
threshold and every owned test under 500.

The stylesheet was split into a tokens partial when the single file measured 304
— over review, under the 400 hard limit — because the design provenance and the
local literals are a different responsibility from the rule set.

**One pre-existing failure, not absorbed.** A wider run reports
`apps/storefront/src/features/product-detail/styles/product-detail.scss` at 555
lines, over the 400 hard limit. That file is **untouched by this checkpoint**
(`git diff` confirms it is not in the change set); it is `APP2-S02`-era debt.
Recorded as `FU-APP12-S01-03` → `APP12-H01`, not fixed here.

---

## V. Validation

Selected from `VALIDATION_GOVERNANCE.md` §3 for what this change actually
touches. Every command below was run; each line is its real result.

| command | result |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `pnpm --filter @embroidery/storefront lint` | PASS |
| `pnpm --filter @embroidery/e2e-testing typecheck` | PASS |
| `pnpm --filter @embroidery/e2e-testing lint` | PASS |
| `pnpm --filter @embroidery/api-client exec eslint src/catalog.ts src/custom-requests.ts` | PASS |
| `prettier --check` over every changed file | PASS |
| `CMD-TEST-APP12-S01-STOREFRONT` | 3 suites / **62 tests** PASS |
| `pnpm --filter @embroidery/storefront exec jest` (whole app) | 123 suites / **2 243 tests** PASS |
| `pnpm --filter @embroidery/api-client exec jest` (generated-client compatibility) | 8 suites / **53 tests** PASS |
| `node tools/check-category-source-of-truth.mjs` | PASS — 2 465 files |
| `node tools/check-file-size.mjs --paths <owned>` | PASS — 12 files |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="release-gate.contract"` | 15 tests PASS |
| `pnpm --filter @embroidery/e2e-testing check:e2e` | PASS — 93 tests collect |
| `next build` (Storefront, production) | PASS — route list unchanged, `/san-pham/[slug]` still `ƒ` dynamic |
| `CMD-E2E-APP12-S01` | **28 passed**, exit 0, disposable database dropped |

Deliberately **not** run, per §42: no full monorepo aggregate, no Admin, no
worker, no full backend suite, no UAT, no performance, no Figma write.

---

## W. Baseline freeze

Measured from the committed artifact and the migration directory after the
change:

```text
OpenAPI            125 paths / 138 operations / 277 schemas   (delta 0)
public operations  49                                          (delta 0)
release matrix     28 STATIC_DENY / 18 STATIC_ALLOW / 3 SCOPE_GATED  (unchanged)
migrations         38                                          (delta 0)
DB schema          unchanged
Figma              unchanged (FIGMA_DELTA = 0)
Storefront routes  unchanged — no /mua-hang, no /truy-cap/don-hang
```

No API contract was widened, and no contract gap was found that would have
required one — apart from the multi-SKU observation in §G, which is flagged for a
ruling rather than acted on.

---

## X. Follow-ups

**Opened**

| id | owner | note |
|---|---|---|
| `FU-APP12-S01-01` | `APP12-D01` (or `APP12-V02`) | The purchase panel's degraded state — projection unreadable — has no approved frame. Implemented in the delivered Product Detail error voice rather than invented; needs drawing. |
| `FU-APP12-S01-02` | a checkpoint owning all four call sites | `formatExactAmount`/`formatExactMoney` now exists in four Storefront features. Four consumers in one app is the moment it belongs in `apps/storefront/src/shared`; moving the other three is unrelated refactoring this checkpoint may not do. |
| `FU-APP12-S01-03` | `APP12-H01` | `product-detail.scss` is 555 lines, over the 400 hard limit. `APP2-S02`-era debt, untouched here. |

**Flagged for a Product Owner ruling**

| id | note |
|---|---|
| `PO-APP12-S01-A` | Multi-SKU disposition (§G). Implemented as a truthful refusal that transcribes the delivered `APP7-G01` authority; §9 read strictly would instead make the checkpoint `BLOCKED_CONTRACT_GAP`. No code changes on either ruling. |

**Not absorbed** (§43), each verified untouched: `FU-APP12-B05-01`,
`FU-APP12-B05-02`, `FU-APP12-B04-02`, `FU-APP12-B04-03`, `FU-APP12-B02-04`, and
the earlier `APP12-H01` / `APP12-H02` debts. `FU-APP12-B05-03` was closed as a
duplicate of the `H02` table-count debt (§B) rather than absorbed.

---

## Y. Roadmap

```text
APP12-S01 COMPLETE
APP12-S02 NEXT
```

`ROADMAP_STATUS = LOCKED` · `CHECKPOINTS = 38` · exactly one `NEXT`.
`APP12-S02` is not started. Nothing was pushed.
