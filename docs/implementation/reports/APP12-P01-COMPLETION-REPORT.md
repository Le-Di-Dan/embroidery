# APP12-P01 — Ready-Made Commerce and Dynamic Category Product/Documentation Authority

- Task: `APP12-P01 — Ready-Made Commerce and Dynamic Category Product/Documentation Authority`
- Phase: `APP12 — Hardening, UAT and Production Readiness`
- Type: `PRODUCT / DOMAIN / DOCUMENTATION AUTHORITY`
- Date: 2026-09-01
- Branch: `feat/app11-s04-seo-infrastructure` (HEAD `f9140e5e`)
- Planning input: [`APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md`](./APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md) §Q

---

## A. Verdict

```text
APP12-P01              = COMPLETE
ROADMAP_LOCK           = LOCKED
IMPLEMENTATION_STARTED = true
NEXT_CHECKPOINT        = APP12-G01
```

`APP12-P01` is the first executed APP12 checkpoint. It is documentation
authority only: no runtime source, migration, OpenAPI, generated client, Figma
artifact, design token or category row was changed.

---

## B. Roadmap lock

```text
ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38
APP12-C02      = MANDATORY
APP12-A01      = MANDATORY
```

The 38-checkpoint roadmap accepted from the C1 report §Q is now immutable. No
APP12 checkpoint ID may be invented; discovered work is handled only by a
correction of the current checkpoint or by a later checkpoint already in the
locked roadmap. Correction policy is unchanged — **maximum one correction per
checkpoint, no `C2`**. No checkpoint was reordered, merged, split or renamed.

The canonical status table lives in
[`phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md`](../phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md)
§0.8: 38 rows, `APP12-P01 = COMPLETE`, `APP12-G01 = NEXT`, all others
`NOT_STARTED`.

**`C02` / `A01` are mandatory.** The C1 report §E left a non-blocking scope
option to defer operator category management. The Product Owner has now closed
it: `CATEGORY_MODEL = DYNAMIC` means an operator manages the production taxonomy
without editing source, editing a migration, mutating the database directly or
deploying. A dynamic contract backed only by migration-provisioned rows does not
meet that requirement, so the deferral option is withdrawn and no later
checkpoint may drop `APP12-C02` or `APP12-A01`. Recorded in the phase document
§0.0 and in `IMP-D059`.

---

## C. Business-model reconciliation

```text
BUSINESS_INTENT_TO_SELL_BASE_PRODUCTS      = ALREADY_PRESENT
DIRECT_COMMERCE_REQUIREMENTS_AND_LIFECYCLE = previously under-specified
DIRECT_SALE_RUNTIME                        = not implemented before APP12
```

Charter §3 already states *"Cửa hàng vừa bán sản phẩm nền vừa nhận thêu trên sản
phẩm do khách cung cấp"*, so the intent to sell base products was approved from
the start. What was missing was the requirement detail and lifecycle needed to
build it, and no direct-sale runtime existed. APP12 therefore closes an
already-present Charter-level gap under explicit Product Owner authority.

The documents do not describe Ready-Made as an unrelated new business pivot and
do not write history as if a ready-made runtime existed before APP12. The
Charter itself was not edited — its §3 clause already carries the intent, and
`D-043` records the reconciliation rather than restating the Charter.

---

## D. Ready-Made product authority

Locked in [`../../01-PRODUCT-REQUIREMENTS.md`](../../01-PRODUCT-REQUIREMENTS.md)
§14 and `D-043` / `IMP-D058`.

`READY_MADE` is the purchase of an existing base product with no custom
embroidery. It must not depend on `custom_request`, quotation, design version,
approval snapshot, the Design Studio / Editor or a production job. Shared
infrastructure is reused only where its semantics stay generic and truthful.

Terminology is unchanged from the phase lock: `READY_MADE_COMMERCE` is not
`CUSTOMER_OWNED_PRODUCT`, not `CUSTOM_REQUEST`, not `CATALOG_PERSONALISATION`
and not `DESIGN_STUDIO`.

---

## E. SKU / price / sellability authority

```text
BUYABLE_SUBJECT = SKU        (Product → Product Variant → SKU)
PURCHASE        = one SKU × quantity
unit_price      = COALESCE(skus.price_override_amount, products.base_price_amount)
currency        = VND
subtotal        = unit_price × quantity      (server-computed)
```

No second sellable Product model, no cart, no bundle, no custom-design
dependency. The client is never authoritative for unit price, subtotal, shipping
fee or final payable total (`BR-021`).

Order-line snapshots freeze at creation: product name, variant label, size
label, SKU identity, unit price, quantity, line total, currency. Later Catalog
edits never change an existing order.

**Sellability is distinct from public visibility** (`BR-022`):

```text
PUBLIC PRODUCT != CURRENTLY BUYABLE SKU
```

A SKU is purchasable only when the Product is published, its category is public
enough for that publication, the Variant is active, the SKU is active, the
resolved price is valid, and available stock > 0. Stock truth is `sku_stocks`
minus currently active reservations — never `products.is_display_out_of_stock`,
which stays presentation authority only. When no SKU is purchasable the Product
Detail page remains public where publication rules allow, the purchase CTA
becomes unavailable/out-of-stock, and no Ready-Made order may be created.

Column names were verified read-only against the live schema
(`packages/database/src/schema/catalog/skus.ts`, `.../catalog/products.ts`,
`.../inventory/sku-stocks.ts`).

---

## F. Direct checkout authority

```text
CHECKOUT_MODEL = SINGLE_PRODUCT_DIRECT_CHECKOUT

existing:    /san-pham/[slug]      Product Detail, gains the purchase state
new:         /mua-hang/[slug]      single-product direct checkout
new secure:  /truy-cap/don-hang    ORDER_ACCESS order/payment/status surface
```

No cart route, no customer account, no separate generic checkout shell, and no
separate confirmation route unless `APP12-D01` proves one is necessary and the
Product Owner explicitly changes this authority. `/truy-cap/don-hang` is the
single secure order surface; confirmation is its entry state.

---

## G. Contact / delivery authority

Ready-Made checkout reuses APP4 contact verification as a **shared primitive**.
No customer account is required.

```text
A Ready-Made order cannot be created for an unverified customer identity.
```

Verification is not turned into custom-request semantics, and the customer is
never required to start `/yeu-cau/moi`.

Checkout collects only the delivery facts the existing order-scoped shipping
model actually needs for fulfilment. No carrier integration, no address or
postcode features unsupported by current product authority, and no delivery-time
guarantee is documented.

---

## H. Shipping-fee authority

```text
READY_MADE_SHIPPING_FEE = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT
```

Checkout shows the merchandise subtotal, the shipping fee as pending operator
confirmation, and a final payable total that is not yet payable. A fabricated
shipping-inclusive total is prohibited (`BR-027`).

```text
order created            → AWAITING_SHIPPING_FEE, stock RESERVED
Admin reviews delivery facts and sets the exact fee
server freezes subtotal + fee + exact payable total
server creates the FULL obligation
                         → AWAITING_PAYMENT, payable QR may now be issued
```

Correction semantics (`BR-028`): while the current `FULL` obligation is
`PENDING`, a fee change supersedes it and creates a successor obligation with
the order still `AWAITING_PAYMENT`; the customer surface exposes only the current
obligation. Once `FULL` is `SATISFIED`, an ordinary fee edit is **refused** and
any commercial correction uses the explicit cancellation/refund/compensating
authority. Paid money is never silently reopened.

The custom shipping-fee acknowledgement protocol is **not** reused for initial
Ready-Made pricing.

---

## I. FULL payment authority

```text
READY_MADE_PAYMENT_KIND = FULL
```

One obligation, one exact total, manual bank transfer, dynamic QR, optional
transfer evidence where the existing evidence model supports it, Admin
verification (`BR-029`).

`DEPOSIT`, `REMAINING` and 40/60 remain custom-commerce semantics and are never
used for Ready-Made. Successful `FULL` verification performs
`AWAITING_PAYMENT → READY_FOR_DELIVERY`. **No separate `PAID` order state** is
added — payment truth lives in the obligation.

---

## J. Ready-Made lifecycle

```text
AWAITING_SHIPPING_FEE
→ AWAITING_PAYMENT
→ READY_FOR_DELIVERY
→ DELIVERED
→ COMPLETED
```

Existing exception states `ON_HOLD`, `CANCELLING` and `CANCELLED` remain
applicable. `AWAITING_DEPOSIT`, `DEPOSIT_PAID`, `IN_PRODUCTION`,
`PRODUCTION_COMPLETED` and `AWAITING_FINAL_PAYMENT` are never used for
Ready-Made, and **no production job is created** (`BR-030`).

The transition table with actor and condition per step is
[`../../06-ORDER-AND-DESIGN-LIFECYCLE.md`](../../06-ORDER-AND-DESIGN-LIFECYCLE.md)
§12.3.

---

## K. Reservation / expiry authority

```text
READY_MADE_INITIAL_RESERVATION_WINDOW = 24 hours
READY_MADE_PAYMENT_RESERVATION_WINDOW = 24 hours
```

```text
Ready-Made order created
→ inventory reservation created
→ expires_at = order_created_at + 24h
→ order = AWAITING_SHIPPING_FEE

Admin confirms the shipping fee, first current FULL obligation created
→ reservation expiry = shipping_fee_confirmed_at + 24h
→ order = AWAITING_PAYMENT

FULL payment verified
→ reservation is no longer expiry-eligible
→ payment truth = SATISFIED
→ order = READY_FOR_DELIVERY
```

The reservation is created at **durable Ready-Made order creation** only — never
on Product Detail, never on temporary SKU selection, never after payment —
because stock must be protected across a manual shipping-fee and payment cycle
(`BR-024`).

On expiry of either pre-payment window (`BR-026`): the reservation is
released/expired with a reason, stock returns to availability, the order becomes
`CANCELLED` with an expiry reason, any live `FULL` obligation is cancelled,
`ORDER_ACCESS` shows the terminal expired/cancelled state, and later `FULL`
verification is refused.

`P01` locks the business rule, not the persistence technique; the safest
representation is chosen at `APP12-DB01` / `APP12-B02`.

---

## L. Order-origin authority

```text
ORDER_ORIGIN = CUSTOM | READY_MADE      (exactly one branch)
```

`CUSTOM` still requires the existing `custom_request`, accepted quotation,
approval snapshot and custom lifecycle. `READY_MADE` has none of them and
requires a SKU order item.

No placeholder or fake custom record may be created, and no `CUSTOM` invariant
is weakened merely to make Ready-Made possible (`BR-031`). Physical constraints
are owned by `APP12-DB01`.

---

## M. `ORDER_ACCESS` authority

An order-scoped secure-access authority at `/truy-cap/don-hang` (`BR-032`)
showing: order reference, selected item summary, delivery summary, shipping-fee
pending state, the exact current `FULL` payable amount when available,
QR/payment instruction, payment evidence state where applicable, ready-for-
delivery, delivery/tracking where applicable, completed, and cancelled/expired.

No customer account, no raw internal ids, no cross-order access. Tokens remain
governed by the existing secure-access security model. Physical and API
implementation belong to `APP12-DB01` / `APP12-B04`.

Read-only evidence note: `GRANT_SCOPE_KINDS` is currently `['REQUEST_ACCESS']`
(`packages/database/src/schema/customer/secure-access-grants.ts:51`), so
`ORDER_ACCESS` is a new scope value for `APP12-DB01` to add — it is not silently
assumed to exist.

---

## N. Admin authority

Documented in [`../../07-ADMIN-OPERATIONS.md`](../../07-ADMIN-OPERATIONS.md) §8,
§11 and the new §13. Ready-Made lives in the **existing** Admin Order
application; no second order application is created.

Admin must be able to distinguish `READY_MADE` from `CUSTOM`, review the
customer and delivery facts, set and correct the shipping fee before payment,
review and verify the `FULL` payment and its evidence, dispatch, complete, and
cancel/refund through existing authority where applicable.

A Ready-Made order detail must not render custom-only panels: quotation, design
version, approval snapshot, production job or the remaining-payment workflow.

Exact HTTP operation allocation stays with `APP12-C02` / `B03` / `B05`; only
conceptual capability names are documented.

---

## O. Dynamic category authority

```text
CATEGORY_MODEL      = DYNAMIC
ao-thun             = VALID
operator_management = REQUIRED     (APP12-C02 + APP12-A01, both mandatory)
CATEGORY_SLUG_RULE  = ^[a-z0-9-]+$
CATEGORY_SLUG       = IMMUTABLE AFTER PUBLICATION
lifecycle           = DRAFT → PUBLISHED → ARCHIVED
```

The APP2 four-value set is recorded as the **initial / alpha taxonomy baseline**,
not a permanent ceiling. `ao-thun` is valid and is not remapped to `quan-ao`,
not deleted, and no Product taxonomy is mutated to satisfy the stale enum.

**Slug.** Stable, globally unique, ASCII and URL-safe. `P01` confirmed no shared
canonical public-slug validator exists to inherit — `isPublicProductSlug` and
`isPublicGalleryEntrySlug` are per-feature syntax gates over the same charset —
so the rule above is stated explicitly, consistent with the existing ASCII route
authority. Editable while pre-publication; immutable after first publication, so
Discover URLs, breadcrumbs, sitemap entries and external links stay stable. The
name may change without changing the slug. Re-slug with redirect/canonical
lifecycle is not implemented by APP12 (`BR-033`, `BR-035`).

**Operator management** (`BR-034`, `07-ADMIN-OPERATIONS.md` §3.1): list, create,
update draft/public-safe fields, publish, archive. No hard delete, no nesting,
no merge, no bulk taxonomy operations, no category-specific media, no generic
taxonomy platform. The model stays flat.

**Archive guard** (`BR-036`):

```text
archive category with PUBLISHED dependent Products = REFUSED
```

The operator reassigns or unpublishes the affected Products first, keeping
public Product truth deterministic.

**Public / indexable distinction** (`BR-034`):

```text
PUBLISHED + non-indexable   usable as a customer filter,
                            omitted from sitemap/indexing authority
PUBLISHED + indexable       filterable and indexable
DRAFT / ARCHIVED            never public
```

Category labels come from persisted category name authority; Vietnamese labels
are never hard-coded in the final production Storefront/Admin option model.

**Discover / sitemap authority** (`BR-037`): the public category inventory is
runtime authority and drives Discover filtering and navigation, the Product
breadcrumb category link, the continuation CTA, the category canonical state and
dynamic sitemap category URLs.

```text
category public and valid:
  breadcrumb   Khám phá → <category> → <product>
  continuation /kham-pha?category=<slug>

category unavailable or non-public:
  breadcrumb   Khám phá → <product>
  continuation /kham-pha
```

The sitemap no longer hard-codes four category slugs; the existing 50,000
total-URL guard is unchanged.

---

## P. Wave isolation authority

```text
WAVE 1 = READY_MADE / BASE_PRODUCT DIRECT COMMERCE
WAVE 2 = ALL CUSTOM EMBROIDERY
```

Released in Wave 1: public catalog, discovery and Product; Ready-Made checkout
and order access; APP4 contact verification as a shared primitive;
`ORDER_ACCESS`; Admin catalog, inventory, order, payment and fulfilment; and the
Gallery, public content and SEO required by Wave 1.

Withheld until Wave 2: `/yeu-cau/moi`, `/san-pham/[slug]/thiet-ke`,
custom-request creation APIs, design-session APIs, quotation and design-review
custom APIs, custom-specific `REQUEST_ACCESS` grant flows, custom deposit and
final-payment Storefront routes, and the custom production operator workflow as
a release capability (`BR-038`).

Shared infrastructure is not disabled merely because custom flows also use it.
Runtime enforcement is owned by `APP12-G02`; `P01` records the policy only.

---

## Q. Historical decision supersession

| Decision | Superseded clauses | Retained clauses |
|---|---|---|
| `IMP-D032` | closed, provisioned root set; "**No category HTTP operation is added**"; taxonomy as a closed OpenAPI enum sourced from `APP2_CATEGORY_TAXONOMY` | slug immutability; `categorySlug` on the wire resolved to `category_id` in-transaction; the physical category UUID never exposed publicly; `PRODUCT_CATEGORY_INVALID` safe invalid-slug behaviour; the flat model with no parent column; and every product-draft, product-slug, draft-price, display-order and media-role clause |
| `IMP-D038` | category state over exactly `thu-bong`, `khan`, `quan-ao`, `khac` | `/kham-pha` with no trailing slash; the `?category=` query key; "all" omits the query; unknown value uses the approved public not-found policy; every non-category clause |

Both rows keep their content and gain an explicit **superseded-in-part** marker
plus a status suffix naming `IMP-D059`. Nothing was deleted, and no historical
completion report was rewritten. The new records carry the
`supersedes` / `superseded-by` relationship in both directions (`IMP-D059`
states what it supersedes; `IMP-D032` / `IMP-D038` state what supersedes them).

**`PO-APP8-002` boundary** — recorded in `BR-025`, `IMP-D058` (11) and
`06-ORDER-AND-DESIGN-LIFECYCLE.md` §12.4:

```text
CUSTOM reservation     = existing PO-APP8-002 no-expiry authority (unchanged)
READY_MADE reservation = APP12 origin-specific expiry authority (new)
```

The Ready-Made policy extends rather than contradicts `PO-APP8-002`, and APP8
history is not rewritten.

---

## R. Documents changed

| Document | Change |
|---|---|
| [`../../01-PRODUCT-REQUIREMENTS.md`](../../01-PRODUCT-REQUIREMENTS.md) | New §14 *Ready-Made direct commerce (Wave 1)* (§14.1–§14.8); pointer additions in §2.1 (two new routes), §8 (40/60 is custom-only), §9 (Ready-Made reservation timing), §10 (manual fee before payment) |
| [`../../03-USER-JOURNEYS.md`](../../03-USER-JOURNEYS.md) | New journeys J11 (Ready-Made happy path), J12 (abandonment/expiry), J13 (dynamic category), J14 (category archive refusal); J1–J10 unchanged |
| [`../../04-BUSINESS-RULES.md`](../../04-BUSINESS-RULES.md) | New `BR-021`..`BR-032` (Ready-Made), `BR-033`..`BR-037` (dynamic category), `BR-038` (wave withholding); scope notes added to `BR-015` and `BR-017` |
| [`../../06-ORDER-AND-DESIGN-LIFECYCLE.md`](../../06-ORDER-AND-DESIGN-LIFECYCLE.md) | New §12 *Ready-Made order lifecycle* (origin, states, transition table, reservation, customer visibility); scope notes in §1, §6, §7, §8, §11 |
| [`../../07-ADMIN-OPERATIONS.md`](../../07-ADMIN-OPERATIONS.md) | New §3.1 *Category management*; new §13 *Ready-Made order operations*; Ready-Made notes in §8 and §11 |
| [`../../12-DECISION-LOG.md`](../../12-DECISION-LOG.md) | New `D-043` (Ready-Made direct commerce as the Wave-1 business branch) and `D-044` (dynamic product category model) |
| [`../14-IMPLEMENTATION-DECISION-REGISTER.md`](../14-IMPLEMENTATION-DECISION-REGISTER.md) | New `IMP-D058` and `IMP-D059`; `IMP-D032` and `IMP-D038` marked superseded-in-part |
| [`../phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md`](../phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md) | Roadmap locked (§0); `C02`/`A01` mandate (§0.0); new §0.7 Ready-Made authority summary; new §0.8 canonical 38-row checkpoint status table |
| [`../10-MASTER-APPLICATION-ROADMAP.md`](../10-MASTER-APPLICATION-ROADMAP.md) | §6 `APP12` status `NOT_STARTED` → `IN_PROGRESS` with the lock, `P01` completion and `NEXT = APP12-G01` |
| `APP12-P01-COMPLETION-REPORT.md` | This report (new) |

Decision-ID conventions follow the repository: `D-0xx` in the product decision
log (previous highest `D-042`) and `IMP-D0xx` in the implementation register
(previous highest `IMP-D057`). No parallel decision system was invented.

**Unchanged:** all runtime source, database schema and migrations, OpenAPI,
generated client, Figma and the design registry, design tokens, SCSS,
infrastructure, dependencies, category data (`ao-thun` untouched), and every
historical completion report.

---

## S. Validation

```text
CHANGE_IMPACT = documentation authority only
                10 markdown files (9 modified, 1 new)
                0 runtime source · 0 migration · 0 OpenAPI · 0 generated client
                0 Figma · 0 token · 0 route · 0 data
```

`VALIDATION_RUN`

| Command | Result |
|---|---|
| `git diff --check` | clean — no whitespace or conflict-marker defects |
| `git status --short` | only the 10 expected documentation paths, plus the three pre-existing staged APP12 audit reports |
| documentation consistency script (scratchpad `verify.mjs`) | `DOC_CONSISTENCY = PASS` — balanced code fences, every relative markdown link resolves, `BR-001`..`BR-038` complete with no gap or duplicate, `J11`–`J14` / `D-043` / `D-044` / `IMP-D058` / `IMP-D059` / PR §14 / LC §12 / AO §3.1 / AO §13 anchors present, phase table = 38 rows with exactly one `NEXT` |
| read-only schema evidence | `skus.price_override_amount`, `products.base_price_amount`, `products.is_display_out_of_stock`, `sku_stocks`, `inventory_reservations.expires_at`, `ORDER_STATES`, `PAYMENT_OBLIGATION_KINDS` / `PAYMENT_OBLIGATION_STATES` (`SUPERSEDED` present), `GRANT_SCOPE_KINDS`, `CATEGORY_STATES` — every name used in the documentation matches the live schema |

`VALIDATION_NOT_RUN`

```text
full monorepo build/lint/typecheck   full test suites   Playwright E2E
OpenAPI regeneration                 client regeneration
database/integration tests           Admin / Storefront / worker tests
performance tests                    Figma registry gate
```

`WHY_NOT_RUN`

```text
P01 changes documentation authority only. No source, contract, schema, client,
route, style or Figma artifact was touched, so none of the above has a change to
validate. Running them would produce evidence about unmodified code and would
contradict VALIDATION_GOVERNANCE §3, which selects validations by actual change
impact rather than by a fixed list.
```

No repository-wide aggregate command was run. No documentation, link or
decision-register consistency gate exists in `tools/`; the scratchpad script
above is the scoped substitute and is not added to the repository.

---

## T. Product Owner inputs still outstanding

```text
PO_INPUT_REQUIRED_BEFORE_R01 =
  address
  opening hours
  phone
  email
```

Carried unchanged as a Wave-1 GO prerequisite. `P01` neither invents these
values nor is blocked by their absence.

```text
NEW_PO_DECISION_REQUIRED = NONE
```

---

## U. Roadmap

```text
APP12-P01 COMPLETE
APP12-G01 NEXT
```

Exactly one `NEXT`. All 36 remaining checkpoints are `NOT_STARTED`.

---

## V. Stop confirmation

```text
APP12-G01 NOT STARTED
NO RUNTIME CODE IMPLEMENTED
NO MIGRATION CREATED
NO OPENAPI OR GENERATED-CLIENT CHANGE
NO FIGMA CHANGE
NO CATEGORY DATA CHANGE
NO UAT EXECUTED
NO DEPLOYMENT
NO PUSH
```
