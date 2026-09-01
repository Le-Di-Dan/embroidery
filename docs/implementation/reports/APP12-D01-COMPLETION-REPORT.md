# APP12-D01 — Ready-Made Commerce Design Package

Phase: `APP12 — Hardening, UAT and Production Readiness`
Type: `PHASE-LEVEL FIGMA DESIGN AUTHORITY` · `SOURCE-ALIGNED EXTENSION DESIGN` · `NO RUNTIME IMPLEMENTATION`
Date: 2026-09-01
Branch: `feat/app11-s04-seo-infrastructure`

---

## A. Verdict

```text
APP12-D01 = COMPLETE_PENDING_PO_REVIEW
```

21 real Figma frames and boards exist on page `APP_12` (`896:3`), under one
package section `901:3`, every one carrying a real node id and a registry row at
`REVIEW_REQUIRED`. The registry gate passes at 553 rows.

The package extends the delivered product. It replaces no shell, no token, no
component contract, no route and no page architecture — proven frame by frame in
§R, not asserted.

`APP12-D01` does **not** self-approve. Nothing is `APPROVED_FOR_IMPLEMENTATION`.

---

## B. Entry authority

```text
APP12-P01 = COMPLETE            APP12-G02 = COMPLETE_AFTER_C1
APP12-G01 = COMPLETE            ROADMAP_STATUS = LOCKED · CHECKPOINTS = 38
```

Business authority consumed, not reopened: `BR-021`…`BR-032` (Ready-Made direct
commerce) and `BR-033`…`BR-037` (dynamic category), under `D-043`/`IMP-D058` and
`D-044`/`IMP-D059`. `APP12-DB01` is not started; no persistence decision is made
here.

---

## C. Existing Figma foundation audit

Read **before** any frame was drawn.

| Artifact | Node | What it settled for this package |
|---|---|---|
| `APP_12` page | `896:3` | Existed, **empty**. Reused, not re-created. |
| Product Detail authority | `529:2225` / `529:2431` / `529:2575` | The exact delivered composition: Header → Breadcrumb → Immersive Work Hero (MediaStage 660×880, zoom hint, thumbnail strip, category chip, title, Share) → Story (640 measure) → Continue → Footer. Gutter 80 / 48 / 24. |
| APP9 secure payment | `816:3` · `816:4` · `818:3` | The one-route/state-variant model, the `Columns` main+aside band, the amount highlight, the transfer-instructions card and the access-expiry note. |
| APP7 deposit workspace | `734:3` · `736:3` | The Admin two-column order workspace: frozen facts left, live workbench right. |
| APP7 order queue | `732:3` · `732:110` | The queue table and the multi-select status fieldset the origin filter copies. |
| APP2 Product list / form | `498:272` · `521:284` | The Admin list and form language the category screens inherit. |
| DS components | Button `39:27`, Header `54:27`, Footer `45:15`, Input `76:29`, Chip, SectionHeader | The published primitives; keys resolved from live instances and imported. |
| Variables / styles | `Primitive` · `Semantic` · `Foundation`; `Typography/*` | 52 variables, 11 text styles — the only colour and type sources used. |

**Registry pre-draw audit.** `FIGMA_DESIGN_INDEX.md` was searched for `APP12`,
`APP_12`, `ready-made`, `mua-hang`, `don-hang`, `category`, `checkout` and
`shipping fee`. **No row existed**; §4 ended at `4.17 APP11-D01`. No existing row
was edited, superseded or removed.

---

## D. Existing source foundation audit

Read **before** any frame was drawn, and it changed the design (see §G).

**Storefront** — 21 features, 18 routes. `product-detail` (screen, gallery,
story, breadcrumb, continue, share), `storefront-shell`, `contact-verification`,
`custom-request` (variant selector, quantity breakdown, upload tiles, step rail),
`secure-link-access` (`SecureLinkShell`), `secure-deposit-payment`,
`secure-final-payment` (`panelOf`, `FinalPaymentPill`, `OrderFactsCard`,
`TransferInstructionsCard`, QR panel, evidence section), `content-pages`,
`store-presentation`, `release-isolation`.

**Admin** — 21 features, 25 routes. `admin-shell` (app bar, sidebar, drawer,
9-item nav), `order-queue` (filter bar, table, pagination), `order-detail`
(frozen facts, items table, deposit workbench, fulfilment panel, shipping-fee
card, dispatch, completion), `products` (list, filter bar, form, publication),
`sku-stock`, shared `AdminStatusBadge` and `AdminTextField`.

**Shared** — `packages/styles`: colour, typography, spacing (base-4), radius,
layout (container 1440 / content 1280 / reading 720; padding 64/24; touch target
44). `packages/ui` is an empty barrel — there is no cross-app component library
to extend, which is why new work lands in app-scoped features.

**The decisive source fact.** `product-detail.scss` renders the page as a
**single centred column** at every breakpoint:

```scss
.product-detail__identity { display: flex; flex-direction: column;
                            align-items: center; text-align: center; }
```

There is no media-left/buy-box-right grid anywhere in the delivered page.

---

## E. Figma ↔ source discrepancies

Recorded, drawn in `917:348`, **not silently resolved**.

| # | Divergence | Resolution taken | Owner |
|---|---|---|---|
| 1 | `FIG-DS-INPUT` (`76:29`) is not published, so it cannot be instanced cross-file; the APP2 supplement `424:35` is `SUPERSEDED`. | Form fields are drawn as local compositions bound to exactly the tokens `FIG-DS-INPUT` specifies, named `Field / …` + `Control`. Source (`AdminTextField`, APP5 form fields) already matches the DS contract, so implementation inherits no debt. | `FU-DESIGN-PUBLISH-DS-INPUT-01` |
| 2 | The DS `Header` still draws `Studio` · `Đặt thêu` · `Nhật ký` as **active links**. | Runtime has rendered those through the shell's *unavailable* affordance since `APP1-S01A`, and `APP12-G02`/`G02-C1` routed `Đặt thêu` into that same branch while Wave 2 is withheld. The DS component is **not** modified; Wave-1 frames inherit the runtime's behaviour, not the frame's. Recorded so a reviewer does not read the header as a Wave-1 custom CTA. | `APP12-H08` (DS reconciliation) |
| 3 | DS `Header`/`Footer` are fixed-1440 components. | Tablet and mobile frames use the real `Layout=Compact` header variant; the Footer has no compact variant, so its overflow in a 390 frame is a Figma-component limitation, not a source one — the runtime shell is genuinely responsive. | `APP12-H08` |
| 4 | Product Detail is a centred single column, not a two-column commerce layout. | The purchase panel is inserted as a **centred block after the identity group**, capped at the existing 640 measure. No media/buy-box split was drawn. See §G. | resolved here |

---

## F. Foundation reuse matrix

Drawn in full at `917:348`. Summary:

| Classification | Count | Examples |
|---|---|---|
| `NOT_ALLOWED_TO_REPLACE` | 1 | Storefront shell (header, footer, skip link) |
| `REUSE_AS_IS` | 10 | Media block, title/chip, DS Button, contact verification, `SecureLinkShell`, evidence model, status pill, Admin badge, Admin 2-column order workspace, `AdminTextField` |
| `REUSE_WITH_VARIANT` | 6 | Breadcrumb (runtime category source), form input, payment QR + bank details, Admin shell/sidebar, Admin table/filter bar, order-status presentation |
| `COMPOSE_EXISTING` | 2 | Variant/size selector, quantity control |
| `NEW_BOUNDED_COMPONENT` | 4 | Price display, purchase panel, Ready-Made shipping-fee card, category management |

**Justification for each `NEW_BOUNDED_COMPONENT`:**

1. **Price display** — the Storefront has never rendered a price. `PRODUCT_DETAIL_COPY` contains no money string and `publicProductDetail` carries no amount today. Lives in the new purchase feature; inherits `Typography/Heading/M` + `Body/S` and the card language. Nothing shared changes.
2. **Ready-Made purchase panel** — variant + size + quantity + availability + CTA is a composition, not a primitive; its parts are `COMPOSE_EXISTING` (§F row 4–5) and its CTA is a DS instance. It is one new feature folder under `apps/storefront/src/features`, at the narrowest valid scope (CLAUDE.md §5).
3. **Shipping-fee card** — custom commerce has no manual pre-payment fee step; `APP9`'s `shipping-fee-card` is a *post-payment recalculation* control bound to the customer-acknowledgement protocol, which `BR-027` explicitly forbids reusing here. Lives in `features/order-detail/components` beside the panels it joins.
4. **Category management** — no category CRUD surface exists (`IMP-D032` had no category endpoint). Drawn entirely in the delivered Admin list/form language; no CMS shell, no taxonomy-specific visual system.

No row is `GLOBAL_FOUNDATION_REWRITE`. No global component is replaced.

---

## G. Product Detail extension design

`FIG-APP12-S01-PURCHASE-{DESKTOP,TABLET,MOBILE}` — `902:4` / `905:67` / `905:187`
`FIG-APP12-S01-PURCHASE-{OUT-OF-STOCK,SELECTION-INCOMPLETE}` — `906:140` / `906:186`

**The composition is additive and nothing else moved.** Order on every frame:

```text
Header (DS)  ·  Breadcrumb  ·  Hero[ media · zoom hint · thumbnails · chip ·
title · Share ]  ·  [NEW] PurchasePanel  ·  Story  ·  Continue  ·  Footer (DS)
```

The purchase panel is **one new sibling** in `ProductDetailScreen`'s `<article>`,
placed after the identity group. Media hierarchy, breadcrumb, chip-as-identity,
Share, the 640 story measure, the continuation section and the shell are all
untouched — and are labelled `UNCHANGED` in the frames themselves.

**Why a centred block and not a right-hand buy box.** §7 and §28 require the
purchase state to adapt to the page. The delivered page is a centred editorial
column (§D). A media-left/buy-box-right split would restructure the hero, change
the page's reading order, and read as the marketplace conversion §8 forbids —
that is an aesthetic preference, not a `SOURCE_CONSTRAINT`, so it was not drawn.

**Panel content** — price (server-resolved, `BR-021`) with one caption line, a
variant fieldset, a size fieldset that resolves the SKU, a 44px quantity stepper,
availability **stacked beneath the stepper**, and a DS Primary CTA to
`/mua-hang/[slug]`. Nothing else: no wishlist, no compare, no reviews, no
trust badges, no delivery estimate.

**Responsive** — 1440 / 1024 / 390 at the existing 80 / 48 / 24 gutters. Option
rows wrap at 390; the mobile breadcrumb collapses to the delivered single back
link; the header uses the DS `Layout=Compact` variant.

**Unavailable states** — `OUT_OF_STOCK` disables every option and swaps the CTA
to `Style=Primary, State=Disabled` reading `Tạm hết hàng`, with the price line
replaced by a factual sentence. `SELECTION_INCOMPLETE` keeps the CTA disabled and
binds the error to the fieldset. Neither invents a "coming soon" or a restock
promise. Both are panel-level variants — no duplicate page frames (§27).

---

## H. Checkout design

`FIG-APP12-S02-CHECKOUT-{DESKTOP,TABLET,MOBILE}` — `907:142` / `907:252` / `907:5738`
`FIG-APP12-S02-CHECKOUT-{VALIDATION,SUBMIT-PENDING,REFUSAL}` — `909:256` / `909:266` / `909:274`

Route `/mua-hang/[slug]`. **Single page, no wizard** — no source constraint
demands one. Assembled from existing patterns: the shell page container, the
`Columns` main+aside band reused from `816:4`, existing card and field language,
the APP4 contact-verification step, and DS Buttons.

Structure: **main** = contact (with the delivered verification affordance) and
delivery (recipient, phone, address, optional note); **aside** = item snapshot,
subtotal, shipping fee *pending*, total *not yet computed*, notice, CTA.

**`BR-027` is honoured literally.** `Tổng thanh toán` reads
`Có sau khi xác nhận phí` — there is no fabricated shipping-inclusive total
anywhere, and no QR. On mobile the summary leads and the form follows, matching
the single-column source flow.

States: field-bound validation (never a toast), a disabled pending button naming
idempotency (`BR-023`), and a refusal that states the stock reason (`BR-022`) and
returns the customer to the product.

---

## I. Secure order surface design

`FIG-APP12-S03-ORDER-ACCESS-{DESKTOP,MOBILE}` — `910:258` / `911:366`
`FIG-APP12-S03-ORDER-ACCESS-STATES` — `911:305`

Route `/truy-cap/don-hang`. **One route, one page, eight state variants** — the
exact `panelOf()` model APP9 delivered, so implementation duplicates no page.

Reused from APP7/APP9 without redesign: the `SecureLinkShell` access states, the
heading + status pill, the order line, the amount highlight, the
transfer-instructions card (bank, account, holder, transfer reference), the QR
panel with its textual fallback, the evidence upload, and the access-expiry note.

Ready-Made differences only: **one exact `FULL` total** with its two contributing
rows, no `DEPOSIT`/`REMAINING` language, no 40/60 split, no shipping tracking and
no "tôi đã chuyển khoản" button (APP9 collapsed that state deliberately).

The eight variants — `AWAITING_SHIPPING_FEE`, `AWAITING_PAYMENT`,
`PAYMENT_UNDER_REVIEW`, `READY_FOR_DELIVERY`, `DELIVERED`, `COMPLETED`,
`CANCELLED`, `EXPIRED` — change three blocks only: the pill, the next-action
block and the payment/fulfilment block. `AWAITING_SHIPPING_FEE` shows **no QR and
no total**, which is the customer-facing half of `BR-027`.

---

## J. Admin Ready-Made branch design

`FIG-APP12-A03-ORDER-QUEUE-DESKTOP` — `912:337`
`FIG-APP12-A03-ORDER-DETAIL-DESKTOP` — `913:337`
`FIG-APP12-A03-WORKBENCH-PANELS` — `914:361`

**No second order application.** The existing queue and the existing two-column
detail are extended:

- **Queue** — one additional `Nguồn đơn` fieldset in the delivered multi-select filter bar, and one `Nguồn` column rendering the **existing** `AdminStatusBadge`. Column proportions, row links and the "no search box" scope note are unchanged.
- **Detail** — the delivered header row gains one origin badge. Left column: frozen facts (with `Nguồn đơn` and the reservation deadline) and the SKU items table. Right column: the new shipping-fee card, the payment panel as a `FULL` variant of the deposit workbench, and the existing fulfilment rail. Custom-only sections are **omitted and said to be omitted** (`BR-031`), rather than rendered empty.
- **Panels** — `FULL` verification reuses the delivered expected-vs-observed reconciliation and its two decisions; fulfilment reuses the APP9 rail with the production step simply absent (`BR-030`); the shipping-fee refusal after `SATISFIED` states the rule and the legitimate path (`BR-028`).

`NEW_ADMIN_ROUTES` for the order branch = **0**.

---

## K. Admin category-management design

`FIG-APP12-A04-CATEGORY-LIST-DESKTOP` — `915:342`
`FIG-APP12-A04-CATEGORY-FORM-STATES` — `916:343`

Mandatory per `APP12-C02` / `APP12-A01`. Drawn in the delivered Product
list/form language: the same table, the same field grouping, the same
save/publish action placement, the same refusal presentation.

List: name, slug, lifecycle badge, live-product count, indexability. Form:
`DRAFT` with an editable slug and its format rule; `PUBLISHED` with the slug
**disabled and labelled locked** (`BR-035`) while the name stays editable;
archive **refused** with the blocking count and the operator's next action
(`BR-036`).

No CMS shell, no nesting, no parent, no category media, no bulk taxonomy
operation, no compiled-in Vietnamese label table (`BR-033`, `BR-034`).

The Admin sidebar gains **one** item, `Danh mục`. Nothing is renamed, reordered
or regrouped — see §R.

---

## L. Responsive matrix

| Surface | 1440 | 1024 | 390 |
|---|---|---|---|
| Product Detail + purchase | `902:4` | `905:67` | `905:187` |
| Checkout | `907:142` | `907:252` | `907:5738` |
| Order Access | `910:258` | — (between 1440 and 390 the band interpolates; no new rule) | `911:366` |
| Admin queue / detail / categories | `912:337` · `913:337` · `915:342` | Admin is a desktop operator tool; no new breakpoint introduced | — |

Gutters 80 / 48 / 24 and the 44px touch target are the delivered values. No
breakpoint system was invented. Mobile 390 is usable on all three customer
surfaces: option rows wrap, the quantity stepper keeps 44px targets, summary
rows stack rather than truncate, and the QR sits directly under the amount it
encodes.

---

## M. Copy-density review

Drawn at `917:348`. Per surface: primary task · primary action · at most one
supporting line · what was removed.

Removed deliberately: any retelling of the ordering process on Product Detail, a
fabricated shipping-inclusive total at checkout, shipment tracking and a
"tôi đã chuyển khoản" button on the order surface, and internal vocabulary in
customer labels.

**No internal term leaks to a customer surface.** `FULL`, `ORDER_ACCESS`,
`origin`, `reservation`, `superseded obligation` and `AWAITING_SHIPPING_FEE`
appear only in Admin frames and in annotation text — the state board prints the
stored token in a caption explicitly labelled *not rendered to the customer*.

---

## N. Accessibility notes

Existing primitives only. Every option is a radio in a labelled fieldset; every
field has a real label and its error bound beside it, never a toast; the quantity
stepper keeps 44px targets; status is never colour-only (symbol + label + tone,
the `753:120` vocabulary); the QR always ships its textual transfer fallback; the
disabled CTA states *why* in adjacent text rather than only by appearance.

No input or button system was replaced to achieve any of this.

Carried, not solved here: the three contrast-failing shared tokens are `APP12-V02`'s
(`PO-APP12-004`), and none of them blocks this design — the package uses the
current semantic roles as-is.

---

## O. Token / contrast dependencies

```text
GLOBAL_TOKENS_ADDED    = 0
GLOBAL_TOKENS_MODIFIED = 0
LOCAL_HEX_WORKAROUNDS  = 0
```

Every fill and stroke is bound to a `Semantic` collection variable; every text
node uses an existing `Typography/*` style. One repair pass resolved each bound
paint's literal fallback to its variable's value so the canvas renders what the
token means.

`TOKEN_DEPENDENCY` recorded, not acted on: `Color/Text/Tertiary` on
`Color/Background/Secondary` is used for supporting captions in several frames
and is one of the contrast pairs `APP12-V02` owns. No local colour was invented
to avoid it.

---

## P. Design → source mapping

Full table at `917:348`; every major frame is mapped. Summary:

| Figma | Intended source | Impact class | Owner |
|---|---|---|---|
| Product Detail purchase (D/T/M) | `features/product-detail/components/product-detail-screen.tsx` | `EXISTING_SCREEN_COMPOSITION_CHANGE` (one added child) | `APP12-S01` |
| PurchasePanel + its states | `features/ready-made-purchase` (new) | `NEW_FEATURE_COMPONENT` | `APP12-S01` |
| Checkout + states | `app/mua-hang/[slug]/page.tsx` (new) | `NEW_ROUTE_SCREEN` | `APP12-S02` |
| Order Access + 8 states | `app/truy-cap/don-hang/page.tsx` (new) + `SecureLinkShell` | `NEW_ROUTE_SCREEN` | `APP12-S03` |
| Admin origin filter + column | `features/order-queue` | `EXISTING_COMPONENT_VARIANT` | `APP12-A03` |
| Admin Ready-Made detail branch | `features/order-detail` | `EXISTING_SCREEN_COMPOSITION_CHANGE` | `APP12-A03` |
| ShippingFeeCard | `features/order-detail/components` | `NEW_FEATURE_COMPONENT` | `APP12-A03` |
| FULL payment · fulfilment · fee refusal | `features/order-detail` | `EXISTING_COMPONENT_VARIANT` | `APP12-A03` |
| Categories list / form / refusal | `features/categories` (new) | `NEW_ROUTE_SCREEN` | `APP12-A01` |
| Sidebar `Danh mục` item | `features/admin-shell/model/admin-shell-nav.ts` | `EXISTING_COMPONENT_VARIANT` (one array entry) | `APP12-A01` |

No orphan concepts: every frame in §S maps to a row here or is an annotation
board.

`GLOBAL_FOUNDATION_REWRITE` appears **nowhere**.

---

## Q. Component delta budget

```text
EXISTING_COMPONENTS_REUSED    = 10   (classification REUSE_AS_IS)
EXISTING_COMPONENTS_VARIANTED = 6    (REUSE_WITH_VARIANT) + 2 COMPOSE_EXISTING
NEW_BOUNDED_COMPONENTS        = 4
GLOBAL_COMPONENTS_REPLACED    = 0
GLOBAL_TOKENS_ADDED           = 0
GLOBAL_ROUTES_RENAMED         = 0

DS instances placed            = 57   (Header 3 · Footer 3 · Button 33 · NavLink + SearchBar nested)
  narrow-frame shells             10   reuse-annotated bands (DS component is fixed 1440 — see §E)
```

Four new bounded components across five new screens is the floor, not a
convenience: each is justified in §F against a specific absence in the delivered
source, and each states where it lives and whose language it inherits.

---

## R. NO FOUNDATION BREAK audit

```text
GLOBAL_SHELL_BREAK            = false
GLOBAL_NAV_BREAK              = false
GLOBAL_TOKEN_BREAK            = false
GLOBAL_COMPONENT_API_BREAK    = false
ROUTE_ARCHITECTURE_BREAK      = false
STATE_MANAGEMENT_BREAK        = false
API_CLIENT_ARCHITECTURE_BREAK = false
RESPONSIVE_FOUNDATION_BREAK   = false
```

- **Shell** — Header and Footer are DS instances used unmodified (8 of each); the Admin app bar and sidebar keep their structure and the `#admin-main` landmark.
- **Navigation** — Storefront IA is untouched. Admin gains exactly one array entry (`Danh mục`); no item is renamed, reordered, regrouped or removed, and the sidebar/drawer architecture is unchanged. An additive entry is not an architecture change.
- **Tokens** — 0 added, 0 modified, 0 local hex workarounds (§O).
- **Component API** — no DS component's props, variants or structure were touched; Button is driven only through its published `Label` / `Style` / `State` properties.
- **Routes** — 2 new customer routes (`/mua-hang/[slug]`, `/truy-cap/don-hang`) and 1 new Admin route (`/categories`). 0 renamed, 0 moved, 0 removed; `/kham-pha`, `/san-pham/[slug]`, `/bo-suu-tap` and the `/truy-cap` family convention are unchanged. `/truy-cap/don-hang` is the exact route `APP12-G01` §2.2 reserved when it refused to block the `/truy-cap` prefix.
- **State management** — nothing implies a pattern beyond TanStack Query for server state and Zustand for interaction state.
- **API client** — nothing implies a call style beyond the Axios feature services and the generated client.
- **Responsive** — the delivered thresholds and gutters; no independent breakpoint system.

No item is `true`. `APP12-D01 != BLOCKED_DESIGN_CONFLICT`.

---

## S. Figma node / frame inventory

File `BQwqV8GdfUIELvsQDB1UQE` · page `APP_12` (`896:3`) · package section `901:3`.

| Sub-section | Node | Frames |
|---|---|---|
| 00 Overview | `901:4` | `901:5` |
| 01 Product Detail purchase | `902:3` | `902:4` · `905:67` · `905:187` |
| 02 Purchase unavailable states | `906:139` | `906:140` · `906:186` |
| 03 Checkout | `907:141` | `907:142` · `907:252` · `907:5738` |
| 04 Checkout states | `909:255` | `909:256` · `909:266` · `909:274` |
| 05 Order Access | `910:257` | `910:258` · `911:366` |
| 06 Order Access state variants | `911:304` | `911:305` |
| 07 Admin order queue | `912:336` | `912:337` |
| 08 Admin order detail | `913:336` | `913:337` |
| 08b Admin workbench panels | `914:360` | `914:361` |
| 09 Admin categories | `915:341` | `915:342` |
| 09b Category form states | `916:342` | `916:343` |
| 10 Shared matrices | `917:347` | `917:348` |

**21 registered nodes**, 13 sub-sections, 1 package section.

---

## T. Registry delta

```text
FIGMA_DESIGN_INDEX rows   532 → 553   (+21)
registry tables            23 → 24
APP12-D01 rows                21
  REVIEW_REQUIRED             21
  APPROVED                     0
  APPROVED_FOR_IMPLEMENTATION  0
existing rows edited           0
existing rows superseded       0
```

New section `4.18 APP12-D01`, plus the `APP_12` page-target line in §3. Gate:

```text
node tools/check-figma-design-index.mjs
Figma Design Index check passed (553 registry IDs, 553 node rows,
24 registry table(s); canonical files + statuses + deep links + composites verified).
```

---

## U. Files changed

```text
docs/design/FIGMA_DESIGN_INDEX.md                               (+ §4.18, + APP_12 page target)
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
                                                                (D01 → REVIEW_REQUIRED; NEXT → NONE_PENDING_PO_REVIEW)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md            (APP12 status line)
docs/implementation/reports/APP12-D01-COMPLETION-REPORT.md       (new)
```

Plus the Figma file itself. **No runtime source file was modified.**

---

## V. Validation

| Check | Result |
|---|---|
| `node tools/check-figma-design-index.mjs` | PASS — 553 rows, 24 tables |
| Duplicate node-id / composite-key check (same gate) | PASS |
| Deep-link ↔ file-key ↔ node consistency (same gate) | PASS |
| Status vocabulary (all D01 rows `REVIEW_REQUIRED`) | PASS |
| `git diff --check` | clean |
| Phase-status consistency (exactly one `NEXT`) | PASS — none; `NONE_PENDING_PO_REVIEW` |
| `git status` — runtime source | unchanged (docs only) |
| Visual verification | every frame screenshotted after its final edit; four frames re-captured after post-hoc fixes |

**Deliberately not run:** any runtime test suite, typecheck, lint, SCSS compile,
OpenAPI or client regeneration — the runtime is frozen (§W), so running them
would produce evidence about code this checkpoint did not touch.

### Canvas integrity

Frame-by-frame screenshots were **not sufficient** — they verify a frame's
interior and say nothing about where the frame sits. The operator caught this:
sub-sections were positioned at hand-written `y` offsets that did not match their
real heights, so the package overlapped itself on canvas while every individual
frame screenshotted cleanly.

A deterministic layout pass now computes the whole package instead: each
sub-section lays its frames out left-to-right at a fixed gap, resizes to contain
them, and is stacked vertically; the package section is then resized to contain
everything. It is re-runnable and was re-run after every subsequent edit.

Final machine check over all 617 frames:

```text
section overlaps          0   (was 2 — 621px and 7px)
frames escaping a section 0   (was 2)
frames clipping content   0   (was 69)
overlapping siblings      0
package section           3494 × 19218, contains every child
```

**Defects found and fixed during the visual pass** (each re-screenshotted):
the canvas layout above; bound paints rendering their black literal fallback; a
collapsed QR aside; a squashed Admin `Main` column; summary values not
right-aligned after a `resize()` reset their fill sizing; text nodes keeping
desktop widths after a clone (24 text + 6 frame refits); option rows overflowing
the 390 band; a media stage losing its height when converted to auto-layout; the
mobile QR caption saying "beside" in a stacked layout; and — on operator
feedback — the stock line moved from beside the quantity stepper to beneath it.

**Fixed-width DS shells on narrow frames.** `Header`/`Footer` are 1440-only
components (§E item 3), so at 1024 and 390 they visibly broke the frame. The ten
narrow-frame instances were replaced with reuse-annotated shell bands naming the
DS component they stand for — the same convention `APP9` uses at `816:4`. All
1440 frames keep real DS instances.

---

## W. Runtime freeze

```text
Storefront runtime  unchanged      OpenAPI            unchanged
Admin runtime       unchanged      generated client   unchanged
API                 unchanged      SCSS               unchanged
worker              unchanged      design tokens      unchanged
database/migrations unchanged      release gate       unchanged
business data       unchanged      Docker images      not rebuilt
```

`git status` shows only the four documentation files in §U. No implementation
code, no `.env` write, nothing pushed.

---

## X. Roadmap

```text
APP12-D01 = REVIEW_REQUIRED
NEXT      = NONE_PENDING_PO_REVIEW
```

`APP12-DB01` is **not** started. The Product Owner reviews foundation
preservation, Figma/source alignment, design quality, implementation
feasibility, component reuse, density and responsive behaviour, then returns
`PASS` or `APP12-D01-C1`.
