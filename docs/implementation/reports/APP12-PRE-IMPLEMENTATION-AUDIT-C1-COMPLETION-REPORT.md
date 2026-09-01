# APP12 — Pre-Implementation Audit C1 — Final Roadmap Correction Before PO Lock

- Task: `APP12 — PRE-IMPLEMENTATION AUDIT C1 · FINAL ROADMAP CORRECTION BEFORE PO LOCK`
- Phase: `APP12 — Hardening, UAT and Production Readiness`
- Date: 2026-09-01
- Branch: `feat/app11-s04-seo-infrastructure` (HEAD `f9140e5e`)
- Corrects: [`APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md`](./APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md) §Z9
- Evidence base: [`APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](./APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md)

---

## A. Verdict

```text
APP12_PRE_IMPLEMENTATION_AUDIT_C1 = COMPLETE
ROADMAP_LOCK                      = PENDING_PO_REVIEW
IMPLEMENTATION_STARTED            = false
CHECKPOINTS                       = 38
PROPOSED_NEXT                     = APP12-P01
NEW_PO_DECISION_REQUIRED          = NONE
```

Every correction in the directive is applied. Three findings materially change
the plan and are stated up front:

1. **Going dynamic is not `enum → string`.** There is **no category HTTP
   operation anywhere in the contract**, and the Vietnamese category labels are
   hard-coded in *both* frontends. Widening the enum alone would leave Discover
   with no label source and no inventory. A public category inventory read is
   mandatory, and `categories.name` — already in the database, currently unused
   by any public projection — becomes its source.
2. **Two locked decisions must be superseded**, not merely widened:
   `IMP-D032` (closed taxonomy, "no category HTTP operation is added") and
   `IMP-D038` (category state over exactly four slugs). A **governance gate**,
   `tools/check-storefront-route-authority.mjs`, hard-codes the four slugs and
   will fail the moment Discover goes dynamic.
3. **Inventory reservations are deliberately no-expiry today.** `PO-APP8-002`
   locked APP8 official reservations as no-expiry, and the absent `expires_at` is
   that table's explicit no-expiry marker. The directive's required Ready-Made
   expiry semantics are therefore a bounded new capability, not free reuse. The
   column and its partial index already exist, so it is representable.

Nothing contradicts the directive, so no `BLOCKED` verdict is raised.

---

## B. Accepted PO decisions preserved

Carried forward unchanged and not reopened: the Wave 1 / Wave 2 release model and
terminology lock; `BUYABLE_SUBJECT = SKU`; the `COALESCE(sku.price_override_amount,
product.base_price_amount)` unit price with money frozen into `order_items`; the
prohibition on ready-made depending on custom request, quotation, design version,
approval snapshot, Design Studio or production job; single-product direct checkout
with no cart and no customer accounts; one `FULL` manual bank-transfer obligation
with dynamic QR and Admin verification, never 40/60; the allowed shared primitives
(APP4 contact verification, secure-link infrastructure, QR, payment verification,
inventory reservation, shipping/dispatch/completion, notifications, audit/outbox);
`Nét Thêu` as canonical brand; all four store facts as R01 prerequisites; no CMS;
`DERIVED_NOT_PERSISTED` alt text; UI05 editorial bands not added by default;
gallery grouping deferred; bounded three-token contrast authority; the four
performance gates at p75; Figma unavailability non-blocking for runtime UAT; and
production deployment separately authorized.

### B.1 One record correction

The directive states the previous draft "attempted to restore the APP2
four-category closed enum as permanent authority." For the record, the prior
reconciliation (§Q.2, §Z7.1) recommended the opposite — widening the closed enum
to a pattern-validated slug and explicitly rejecting the option of constraining
data to the four values. §35.5 of the directive confirms that direction remains
accepted. The correction this C1 actually applies is that widening was **not
far enough**: it stopped at the contract and left Discover, breadcrumbs, the
sitemap, the Admin option list and a governance gate on the four-value list.

---

## C. Dynamic category authority

```text
CATEGORY_MODEL = DYNAMIC
ao-thun        = VALID
```

The four historical values are recorded as the **APP2 initial / alpha public
taxonomy baseline**, not a permanent domain ceiling. APP12 production authority
supersedes that limitation.

### C.1 Evidence

```text
categories.slug = text NOT NULL, UNIQUE (uq_categories__slug)
CHECK constraints on categories: ck_categories__status_allowed  (status only)
→ the database has NEVER constrained slug; the ceiling is contract + client only
```

Migration `0033_provision_catalog_draft_categories.sql` (APP2-B02-G01) provisions
the four rows as reference data, and its own header explains why: *"APP2 ships no
category management API … the four categories the Product Owner locked are
reference data provisioned here rather than data an operator can create."* It is
idempotent per slug, fails loudly rather than overwriting operator data, and
**"Nothing is ever deleted or renamed here."** A fifth row therefore coexists
lawfully — the migration neither removes nor rejects it.

Live rows:

```text
slug      id                                     created_at
thu-bong  019a0000-0000-7000-8000-000000000001   2026-07-31 15:03:07  ← migration 0033
khan      019a0000-0000-7000-8000-000000000002   2026-07-31 15:03:07  ← migration 0033
quan-ao   019a0000-0000-7000-8000-000000000003   2026-07-31 15:03:07  ← migration 0033
khac      019a0000-0000-7000-8000-000000000004   2026-07-31 15:03:07  ← migration 0033
ao-thun   019f9900-0000-7000-8000-000000000060   2026-08-21 12:42:47  ← later fixture insert
```

`ao-thun` carries a different id family and a date three weeks after the migration
run. Since **no category creation API exists in either the public or admin
contract**, it entered the dev database as a test/UAT fixture row rather than
through operator action. Stated plainly because provenance matters for the
decision log: its real significance is that it **proved the contract was narrower
than the data model**, and the Product Owner's forward decision to make the
taxonomy dynamic stands on product grounds independent of how this row arrived.

Per the directive: `ao-thun` is **not** remapped to `quan-ao`, **not** deleted,
and no Product taxonomy is mutated to satisfy the stale enum.

### C.2 Slug validation rule

The repository has no shared public-slug validator to inherit — `isPublicProductSlug`
and `isPublicGalleryEntrySlug` are per-feature syntax gates over the same charset,
and `product-slug.ts` derives ASCII slugs by transliteration (`đ/Đ → d/D`, NFD,
drop combining marks, lowercase, non-`[a-z0-9]` runs → `-`). Consistent with that
existing ASCII authority:

```text
CATEGORY_SLUG_RULE = ^[a-z0-9-]+$      (ASCII only; no Unicode slugs)
```

No arbitrary strings; no Unicode, matching current public route authority.

### C.3 Decisions to supersede

| Decision | Clause superseded | Clause retained |
|---|---|---|
| `IMP-D032` | "closed, provisioned root set"; "**No category HTTP operation is added**"; "the taxonomy is a closed OpenAPI enum sourced from `APP2_CATEGORY_TAXONOMY`" | **Slug immutability** ("Slugs are immutable APP2 reference keys"); `categorySlug` on the wire resolved to `category_id` in-transaction; the physical UUID never exposed; unknown/inactive slug → `PRODUCT_CATEGORY_INVALID` (safe 400); flat model, no parent column |
| `IMP-D038` | "category state is `?category=<slug>` over exactly `thu-bong`, `khan`, `quan-ao`, `khac`" | `/kham-pha` route; `?category=` query key; "all" omits the query; unknown value → approved public not-found policy |

Both supersessions are documentation work owned by `APP12-P01`, recorded in
`docs/12-DECISION-LOG.md` and the decision register, **before** any dependent
code checkpoint.

---

## D. Dynamic public category architecture

The end-state must be dynamic at every seam. Measured blast radius of the
four-value list: **~48 files**, of which the production-code seams are:

```text
contract   apps/api/.../catalog/presentation/schemas/admin-product.response.ts
             (APP2_CATEGORY_TAXONOMY — the enum source)
           packages/contracts/openapi/openapi.generated.json
             PublicCategoryResponse.slug        enum[4]
             AdminProductCategoryResponse.slug  enum[4]
             PublicProductListCategorySlug      enum[4]   (query filter)
             AdminProductListCategorySlug       enum[4]   (query filter)
client     packages/api-client/src/generated/embroidery-api.schemas.ts
storefront product-discovery/model/discover-categories.ts   (labels hard-coded)
           product-detail/model/product-breadcrumb.ts
           storefront-seo/model/public-static-routes.ts      (sitemap category URLs)
admin      products/model/product-category-options.ts        (form options)
           products/model/product-category.ts                (label map)
           products/model/product-filters.ts                 (filter options)
gate       tools/check-storefront-route-authority.mjs        (asserts the 4 slugs)
```

| Concern | Today | Dynamic end state |
|---|---|---|
| Published category inventory | **Does not exist** — zero category paths in 116 | New public read over published, indexable categories, ordered by `display_order` |
| Public category projection | Embedded `{slug, name}` inside product responses; `slug` enum-typed | Same shape, `slug` pattern-validated |
| Category labels | **Hard-coded in both frontends** (`CATEGORY_LABELS`, `PRODUCT_COPY.category`) | Served from `categories.name`, which already exists and is currently unread by any public projection |
| Discover filter source | `Object.values(PublicProductListCategorySlug)` — generated enum | Runtime category inventory |
| Product breadcrumb | Category link suppressed by the APP11-S04-C1 containment | Resolved against the public category inventory |
| Continuation CTA | Falls back to bare `/kham-pha` | `/kham-pha?category=<dynamic-slug>` when the category is public |
| Canonical category URL | Four static `?category=` states | Composed from the inventory |
| Sitemap categories | `DISCOVER_CATEGORY_SLUGS.map(...)` in `public-static-routes.ts:86` | Composed from the inventory; 50 000 guard and fail-closed behaviour unchanged |
| Indexability | `categories.is_indexable` exists, unread publicly | Honoured by sitemap and canonical composition |
| Admin authority | **No category API and no category UI**; the form offers exactly the four enum values | Minimum create / edit / publish / archive |
| Slug lifecycle | `IMP-D032` immutability, migration-provisioned only | Immutability retained and extended to operator-created slugs |

### D.1 Public visibility rule

Only a category satisfying **all** of the following may appear in Discover
filters, public breadcrumb links, sitemap category URLs or canonical category
states:

```text
categories.status      = 'PUBLISHED'
categories.archived_at IS NULL
is_indexable           = true    (for sitemap and canonical only; a non-indexable
                                  published category may still filter Discover)
```

`DRAFT`, `ARCHIVED` and any unreferenced administrative category are never
exposed. This mirrors `product-publication.policy.ts`, which already re-proves
the category's published state when authorising public product media — so the
predicate has an existing precedent to reuse rather than invent.

### D.2 Slug lifecycle

```text
CATEGORY_SLUG = IMMUTABLE ONCE PUBLISHED
```

`IMP-D032` already declares category slugs immutable reference keys, and no
Admin surface can edit one today, so this is a continuation rather than a new
restriction. Renaming a category changes `name` only; the slug — and therefore
every Discover URL, breadcrumb link, sitemap entry and external link — is stable.
A genuine re-slug would require an explicit redirect/canonical lifecycle, which
is **not** proposed for APP12 (§N.2). `APP12-C02` must enforce immutability at
the write boundary so a future Admin screen cannot silently break public URLs.

---

## E. Category checkpoint decomposition

The single `C01` proposed previously cannot hold this: it spans backend contract,
a new public read, Admin backend, Admin UI, Storefront discovery, SEO/sitemap and
a governance gate. Per directive §8 it is split, and the `Cxx` namespace is kept
for contract/category authority.

```text
APP12-C01  Dynamic public category contract and inventory read      backend
APP12-C02  Admin category management authority                      backend
APP12-C03  Storefront dynamic category discovery, breadcrumb,
           CTA, sitemap and route-authority gate reconciliation     storefront
APP12-A01  Admin category management UI                             admin UI
```

`APP12-C02` / `APP12-A01` are the **minimum administration** required for the
Product Owner's stated goal — operator category growth without a code deploy.
Deliberately not a taxonomy platform: no nesting (the model is flat by
`IMP-D032` and has no parent column), no merge, no bulk move, no per-category
media, no reordering beyond `display_order`.

If the Product Owner prefers to defer operator-managed creation, `C02`/`A01` can
be dropped and categories stay migration-provisioned; the dynamic contract still
functions because the runtime authority reads whatever rows exist. That is a
scope option, not a new decision, so it is not raised in §U.

---

## F. Ready-Made shipping-fee authority

The gap was real: `shipping_details.fee_amount` is persistence, not business
authority, and APP9 derives the initial fee from the accepted quotation, which
ready-made does not have.

```text
LOCKED = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT
```

No automatic calculation, no carrier quote, no fabricated flat rate.

**Reuse is closer than expected.** `save-shipping-detail.use-case.ts` (APP9-B04)
already implements an Admin fee write with a baseline resolved as
`QUOTED_FEE_SOURCE` = `quotation_versions.shipping_fee_amount`, superseded by
`CURRENT_SHIPPING_FEE_SOURCE` = `shipping_details.fee_amount` once one is stored.
For ready-made the quoted baseline is simply absent, so the change is an
**origin-aware baseline** — the first Admin fee set *is* the baseline — rather
than a new subsystem.

The custom shipping-fee **acknowledgement** protocol
(`acknowledge-shipping-fee.use-case.ts`, `SHIPPING_FEE_NOT_INCREASED`,
`shipping_fee_acknowledgements`) is **not** reused for initial ready-made
pricing, per the directive. It remains Wave 2.

---

## G. Corrected Ready-Made lifecycle

The redundant `PAID` order state proposed earlier is **removed**. Payment truth
lives in the `FULL` obligation, and mirroring it in the order would create two
sources for one fact.

```text
AWAITING_SHIPPING_FEE
  → AWAITING_PAYMENT          (Admin sets fee; total frozen; FULL obligation created)
  → READY_FOR_DELIVERY        (authoritative transition: FULL obligation SATISFIED)
  → DELIVERED                 (dispatch)
  → COMPLETED
plus ON_HOLD · CANCELLING · CANCELLED
```

Two new status values only — `AWAITING_SHIPPING_FEE` and `AWAITING_PAYMENT`.
`READY_FOR_DELIVERY`, `DELIVERED`, `COMPLETED` and the whole exception set
already exist in `ck_orders__status_allowed` and are reused verbatim, which is
why Admin dispatch and completion carry over. No production job is ever created.

### G.1 Shipping-fee mutation semantics

```text
FULL obligation PENDING   → Admin may set or correct the fee.
                            On change: supersede the PENDING obligation
                            (superseded_by_obligation_id), create the successor,
                            order REMAINS AWAITING_PAYMENT.
                            Customer sees only the current payable amount.

FULL obligation SATISFIED → ordinary fee edit is REFUSED.
                            Correction requires the explicit
                            cancellation/refund authority.
```

The supersession mechanism already exists: `payment_obligations` carries
`superseded_by_obligation_id`, a `SUPERSEDED` status value, and
`uq_payment_obligations__order_kind__live` — a partial unique index over
`(order_id, kind)` limited to `PENDING`/`SATISFIED` — which permits exactly one
live obligation per kind while allowing superseded history to accumulate. The
required semantics are enforceable with **no index change**.

---

## H. Reservation expiry semantics — corrected

The prior reconciliation claimed reservations reuse "with no schema change." That
was **wrong on expiry**, and the correction matters.

```text
reserve-order-inventory.usecase.ts:170-175
  "PO-APP8-002: APP8 official reservations are no-expiry. The canonical
   repository writes no `expires_at`, which is this table's explicit
   no-expiry marker (ADR-DB1-018 r3), so nothing here supplies one."
```

So today nothing writes `expires_at` and nothing expires a reservation. What
already exists in support of expiry:

```text
inventory_reservations.expires_at              nullable column
ix_inventory_reservations__expires_id__reserved
  btree (expires_at, id) WHERE status = 'RESERVED' AND expires_at IS NOT NULL
status CHECK includes 'EXPIRED' and 'RELEASED'
released_reason with ck_..._released_reason_required
```

The table was **designed** for expiring reservations; APP8 simply chose not to
use them. `PO-APP8-002` scopes its no-expiry rule to *APP8 official (custom)
reservations*, so an origin-scoped ready-made expiry policy extends that decision
rather than contradicting it. Flagged here so the Product Owner can confirm that
reading at lock; it is not raised as a new decision because the directive (§15)
already authorizes reserving the smallest change.

Required semantics:

```text
reservation created at durable Ready-Made order creation, with expires_at set
  (never at Product Detail, never at UI selection, never after payment)

on expiry:
  reservation      → RELEASED (or EXPIRED) with released_reason
  order            → CANCELLED  — it must not remain AWAITING_SHIPPING_FEE or
                     AWAITING_PAYMENT once stock is gone
  ORDER_ACCESS     → reports expiry/cancellation truthfully
  FULL verification→ REFUSED thereafter
  live FULL obligation → CANCELLED
```

A sweeper is required; `expires_at` and its partial index make it cheap. Owned by
`APP12-DB01` (state authority) and `APP12-B02` (write path), with the sweeper in
the existing worker.

---

## I. Corrected route model

Locked by `APP12-P01` and `APP12-D01` **before** any frontend checkpoint.

```text
existing  /san-pham/[slug]        Product Detail — gains the purchase state
new       /mua-hang/[slug]        single-product direct checkout
new       /truy-cap/don-hang      ORDER_ACCESS secure order surface
```

The secure surface represents: awaiting shipping fee · awaiting payment · payment
evidence submitted · ready for delivery · delivered · completed · cancelled ·
expired. It joins the existing `/truy-cap/*` family, which is the established
secure-link namespace.

No cart route. No customer account. No separate confirmation route — confirmation
is the entry state of the order surface. Storefront page routes 18 → 20.

`robots.txt` must disallow `/mua-hang` and `/truy-cap/don-hang` — the latter is
already covered by the existing `Disallow: /truy-cap`.

---

## J. Database checkpoint authority — `APP12-DB01`

One dedicated forward-only change-control checkpoint. Unrelated DB changes are
not combined into it.

```text
order origin invariant       orders.origin ∈ {CUSTOM, READY_MADE}
                             exactly-one-origin CHECK, in the same idiom as the
                             existing ck_order_items__exactly_one_subject
CUSTOM-only nullable chain   orders.custom_request_id / accepted_quotation_version_id
                             / current_approval_snapshot_id → nullable,
                             required when origin = CUSTOM
                             (uq_orders__request is unaffected: PostgreSQL allows
                              many NULLs under UNIQUE)
                             order_items.approval_snapshot_id → nullable under the
                             same origin rule
Ready-Made lifecycle         + AWAITING_SHIPPING_FEE, + AWAITING_PAYMENT
                             origin-scoped transition authority
FULL obligation              payment_obligations.kind + 'FULL'
                             source_quotation_version_id → nullable, required
                             when the owning order is CUSTOM
ORDER_ACCESS subject XOR     secure_access_grants + order_id (nullable),
                             custom_request_id → nullable,
                             scope_kind + 'ORDER_ACCESS',
                             exactly-one-subject CHECK
reservation expiry           origin-scoped expiry policy + terminal transition
                             authority (column and index already exist)
backfill                     every existing order → origin = 'CUSTOM'
compatibility                every existing custom invariant still enforced
```

```text
CATEGORY MIGRATION DELTA = 0
```

`categories.slug` is already unconstrained `text` with a UNIQUE index, so the
dynamic model needs **no migration** — the ceiling was always contract and client
code. No new persistence constraint is added merely because the OpenAPI changes.

---

## K. Backend checkpoint split

Re-audited against actual operations rather than guessed. Every slice holds to
1–3 related operations (hard maximum 5).

| ID | Capability | Operations |
|---|---|---|
| `APP12-C01` | Dynamic public category contract and inventory read | 1 new public category list; widen 2 response schemas + 2 filter params (no new op) |
| `APP12-C02` | Admin category management authority | ≤4 (list, create, update, publication state) |
| `APP12-B01` | Public purchasable SKU projection — SKU id, resolved price, availability, variant labels | ≤2 (extend `GET /api/public/products/{slug}/variants`, which today returns only `{productVariantId, colorName, sizeLabel}` — no SKU, price or stock) |
| `APP12-B02` | Verified Ready-Made order creation — delivery facts, reservation with expiry, idempotency | ≤3 |
| `APP12-B03` | Admin shipping fee set/correct, total freeze, FULL obligation create/supersede, `AWAITING_SHIPPING_FEE → AWAITING_PAYMENT` | ≤3 (extends the existing `save-shipping-detail` seam with an origin-aware baseline) |
| `APP12-B04` | `ORDER_ACCESS` read plus current FULL payment / QR / attempt / evidence composition | ≤5, reusing the proven APP7 deposit chain shape |
| `APP12-B05` | Admin FULL verification, `AWAITING_PAYMENT → READY_FOR_DELIVERY`, origin-aware dispatch/completion guards | ≤3 |

```text
EXPECTED_API_DELTA = measured proposal after exact operation audit
                     (each checkpoint states its own bound above;
                      no aggregate figure is published)
```

---

## L. Storefront / Admin checkpoint split

One screen or one small capability each.

| ID | App | Scope |
|---|---|---|
| `APP12-C03` | Storefront | Discover dynamic filters from the inventory; breadcrumb and continuation CTA dynamic-category resolution; sitemap category composition; `tools/check-storefront-route-authority.mjs` reconciled to the dynamic model |
| `APP12-S01` | Storefront | Product Detail purchase state — SKU selection, quantity, live availability, price, purchase CTA, out-of-stock |
| `APP12-S02` | Storefront | `/mua-hang/[slug]` direct checkout — contact verification, delivery, summary, exact total |
| `APP12-S03` | Storefront | `/truy-cap/don-hang` secure order surface — all eight states, QR, evidence submission |
| `APP12-A01` | Admin | Category management UI |
| `APP12-A02` | Admin | Ready-Made order branch — origin badge and filter; detail without quotation/design panels; single-obligation payment panel; shipping-fee set/correct control |

### L.1 Product breadcrumb and CTA behaviour

```text
category public and valid:
  breadcrumb  Khám phá → <category> → <product>
  CTA         /kham-pha?category=<dynamic-slug>

category missing, non-public or absent from the inventory:
  breadcrumb  Khám phá → <product>
  CTA         /kham-pha
```

Raw product category data is never trusted directly; both resolve through the one
public category authority. This replaces the APP11-S04-C1 containment, which was
correct for its contract and is superseded once `C01`/`C03` ship.

---

## M. Governance / release-isolation / UAT-data split

The previous `G01` bundled documentation, runtime, data seeding and a Docker
rebuild. Split into three, with the image work moved out entirely.

| ID | Type | Owns | Explicitly excludes |
|---|---|---|---|
| `APP12-G01` | docs/tooling only | Wave route/API ownership matrix; release-exposure policy; active-vs-stale release-gate test classification; the three stale contract specs; file-size and `.scss` gate gaps; registry doc drift; scoped-command reconciliation | No runtime feature, no data seeding, no Docker rebuild |
| `APP12-G02` | runtime | The fail-closed Wave-2 release gate: Storefront custom-route enforcement, public custom-start API enforcement, shared-primitive exceptions, Admin/staff exposure policy | Independent review because it is runtime code |
| `APP12-G03` | UAT readiness data | Representative published Products, real media, **multiple dynamic categories**, variants, SKUs, base prices, at least one SKU price override, stock, at least one out-of-stock SKU — created through delivered Admin/runtime operations wherever one exists | No direct DB fabrication where a delivered operation exists; not production content unless separately approved |

The stale dev API image rebuild (`FU-APP11-A01-04`) moves to **`APP12-H02`**
(production/staging deployment readiness), where image build and reproducibility
belong.

`APP12-G03` now depends on `APP12-C02`/`A01`, since "multiple dynamic categories"
requires a way to create them.

---

## N. Hardening checkpoint corrections

### N.1 Runbooks contain no feature work

```text
APP12-H07 = operational runbooks / operator recovery ONLY
```

Deployment, rollback, staff bootstrap, secret rotation, payment reconciliation,
stuck order/job recovery, storage incident, health diagnostics, log inspection,
go-live checklist, incident response. **API Δ 0.**

Gallery withdraw/un-promote, promotion idempotency and the Admin source-tile
preview are removed from it and reclassified (§P).

### N.2 SEO owns no redirect runtime

`APP12-H06` owns: dynamic Product/Gallery soft-404 correctness, favicon,
Ready-Made `Product`/`Offer` structured data with price and availability,
canonical, Open Graph, `noindex` on `/mua-hang` and the order surface, public
cache behaviour, and dynamic category sitemap/canonical correctness.

```text
FU-APP11-G01-02  redirect_rules runtime = NONBLOCKING_DEFER
```

Not implemented merely because the table exists; no concrete release or UAT case
requires a redirect.

### N.3 Accessibility namespace

Accessibility moves out of the `Axx` (Admin UI) namespace:

```text
APP12-H08 = Accessibility and compatibility (Wave 1)
```

`Axx` is reserved for Admin UI throughout.

---

## O. Wave-2 deep decomposition

Four distinct pre-reserved scopes plus the gate, so no ad-hoc insertion is needed
after lock.

| ID | Scope |
|---|---|
| `APP12-W01` | Custom lifecycle UAT **excluding** Editor deep interaction — COP, the catalog-custom shared flow, custom request intake, manual quotation, design review and approval, deposit + remaining payment, custom production and fulfilment; inherited custom blockers `FU-APP10-G01-02`, `-03` |
| `APP12-W02` | Editor functional deep UAT — desktop, core editing, transforms, layers, text, image, viewport, undo/redo, watermark, session, upload, autosave |
| `APP12-W03` | Editor runtime visual / UI-UX / accessibility / mobile / resilience, plus bounded corrections using the `V01`/`V02` loop |
| `APP12-W04` | Full Custom Embroidery cross-boundary regression — catalog personalisation + Editor + downstream lifecycle, with change-impact revalidation of Wave 1 rather than a wholesale rerun |
| `APP12-R02` | Custom Embroidery GO / NO-GO |

---

## P. Follow-up ownership changes

All 36 remain reconciled and none is ownerless. Changes from the previous
classification:

| ID | Now | Reason |
|---|---|---|
| `FU-APP11-S04-C1-02` | `DYNAMIC_CATEGORY_CONTRACT_AND_DISCOVERY_REPAIR` → `APP12-C01`/`C03` | Not data drift; not closed-enum restoration |
| `FU-APP11-S04-02`, `FU-APP11-S04-C1-01` | `SUPERSEDED` once `C01`/`C03` ship | Their APP11 containment is replaced by dynamic public-category authority |
| `FU-APP11-B03A-01`, `-02`, `-03` | `WAVE2_HARDENING` (was Wave-1 hardening) | Gallery deletion, promotion idempotency and derivative metadata do not touch ready-made commerce; may return to Wave 1 only if live UAT proves a blocker |
| `FU-APP11-S03-03` | `WAVE2_HARDENING` | Consequence of `B03A-01` |
| `FU-APP11-A02-03` | `NONBLOCKING_DEFER` | Catalog source-tile preview is custom-request authoring |
| `FU-APP11-G01-02` | `NONBLOCKING_DEFER` | Redirect runtime without concrete need (§N.2) |
| `FU-APP11-A01-04` | `WAVE1_BLOCKER` → `APP12-H02` | Moved from governance to deployment readiness |
| `FU-APP10-G01-02`, `-03` | `WAVE2_BLOCKER` → `APP12-W01` | Custom final-payment notification and custom shipping-fee acknowledgement |
| `FU-APP11-S05-01` | `PO_INPUT_REQUIRED_BEFORE_R01` | All four store facts |
| `FU-APP11-S01-02` | `WAVE1_HARDENING` → `APP12-V02` | Brand unification to `Nét Thêu` |
| `FU-APP11-S01-01`, `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | `WAVE1_HARDENING` → `APP12-H06` | Favicon and soft-404 |
| `FU-APP11-B03-02` | `WAVE1_HARDENING` → `APP12-H05` | Public cache policy now fronts a transactional funnel |
| `FU-APP11-A01-01`, `A02-02`, `FU-APP10-E01-01` | `WAVE2_UAT` → `APP12-W03` | Gallery/Editor design spot-checks |
| Three stale specs, three governance items | `APP12-G01` | Unchanged |
| Seven `NONBLOCKING_DEFER`, two `INTENTIONAL_LIMITATION`, three duplicates, four `PO_RESOLVED`, three operator inputs | unchanged | — |

```text
WAVE1_BLOCKER      = 4   S04-C1-02 · S04-01 · A01-04 · production secret mechanism
WAVE1_HARDENING    = 8
WAVE1_UAT          = 0
WAVE2              = 8
PO_INPUT_BEFORE_R01= 1
NONBLOCKING_DEFER  = 9
other              = 12  (governance, operator, resolved, intentional, duplicates)
```

Plus the three non-follow-up Wave-1 blockers that predate this correction:
deployment infrastructure, observability, production secrets.

---

## Q. Final proposed roadmap — 38 checkpoints

```text
ROADMAP_STATUS = PROPOSED_FOR_PO_LOCK    IMPLEMENTATION_STARTED = false
```

### Wave 0 — Ready-Made authority, design and commerce enablement (19)

| ID | Name | Type | Deps | API Δ | Mig Δ | Route Δ | Live evidence | Follow-ups |
|---|---|---|---|---|---|---|---|---|
| `P01` | Ready-Made and dynamic-category product/documentation authority | docs | — | 0 | 0 | 0 | n/a | Charter §3:46 reconciliation; supersede `IMP-D032` taxonomy clause and `IMP-D038` category clause |
| `G01` | Wave scope, release-exposure policy and governance reconciliation | docs/tooling | `P01` | 0 | 0 | 0 | gates run | `B01-02`, `B03A-04`, `B04-01`, `B01-C1-02`, `B04-02`, `A02-C1-01`, `G01-06`, `S01-03`, `S01-04` |
| `G02` | Wave-2 release isolation gate | runtime | `G01` | 0 | 0 | 0 | withheld routes/APIs refuse; Wave-1 journeys pass | — |
| `D01` | Ready-Made commerce design package | design | `P01` | 0 | 0 | 0 | registry updated | — |
| `DB01` | Order origin, Ready-Made lifecycle, FULL obligation, ORDER_ACCESS, reservation expiry | database | `P01` | 0 | **+1** | 0 | fresh-DB migration proof; custom orders intact | — |
| `C01` | Dynamic public category contract and inventory read | backend | `P01`, `DB01` | ≤1 new + 4 schema widenings | 0 | 0 | `ao-thun` served publicly | `S04-C1-02` |
| `C02` | Admin category management authority | backend | `C01` | ≤4 | 0 | 0 | operator creates a category with no deploy | — |
| `A01` | Admin category management UI | admin UI | `C02`, `D01` | 0 | 0 | +1 | live create/publish | — |
| `C03` | Storefront dynamic category discovery, breadcrumb, CTA, sitemap, gate reconciliation | storefront | `C01` | 0 | 0 | 0 | Discover filters on `ao-thun`; sitemap dynamic; route-authority gate green | `S04-02`, `S04-C1-01` |
| `G03` | Representative UAT dataset | UAT data | `C02`, `A01` | 0 | 0 | 0 | Discover renders a real catalog with images | `A01-05`/`A02-04`/`S02-03` |
| `B01` | Public purchasable SKU projection | backend | `DB01` | ≤2 | 0 | 0 | SKU, price, availability served | — |
| `B02` | Ready-Made order creation and reservation | backend | `B01` | ≤3 | 0 | 0 | order created, stock reserved with expiry | — |
| `B03` | Admin shipping fee, total freeze, FULL obligation lifecycle | backend | `B02` | ≤3 | 0 | 0 | fee set → `AWAITING_PAYMENT`; supersede on change | — |
| `B04` | ORDER_ACCESS read and FULL payment composition | backend | `B03` | ≤5 | 0 | 0 | customer sees total + QR; evidence accepted | — |
| `B05` | Admin FULL verification and origin-aware fulfilment | backend | `B04` | ≤3 | 0 | 0 | verify → `READY_FOR_DELIVERY` → dispatch → complete | — |
| `S01` | Product Detail purchase state | storefront | `B01`, `D01` | 0 | 0 | 0 | live buy state incl. out-of-stock | — |
| `S02` | Ready-Made checkout `/mua-hang/[slug]` | storefront | `B02`, `D01` | 0 | 0 | **+1** | live order placed | — |
| `S03` | Secure order surface `/truy-cap/don-hang` | storefront | `B04`, `D01` | 0 | 0 | **+1** | all eight states rendered | — |
| `A02` | Admin Ready-Made order branch UI | admin UI | `B05`, `D01` | 0 | 0 | 0 | operator completes an order | — |

### Wave 1 — hardening, UAT and release (13)

| ID | Name | Deps | Notes |
|---|---|---|---|
| `H01` | Authorization and security audit (Wave 1) | `A02` | Money path: server-recomputed totals, order idempotency, stock race, rate limits; CSP, HSTS, `X-Powered-By`; ownership matrix; PII redaction |
| `H02` | Production deployment and configuration readiness | `G01` | Staging/production topology, ingress, TLS, config and secrets, image build and reproducibility, migration procedure, rollback. Owns `S04-01`, `A01-04`, `FU-APP10-I01-02` |
| `H03` | Observability and alerting (build) | `H02` | Bounded to diagnosing checkout, order, payment, reservation and fulfilment failures |
| `H04` | Resilience and failure rehearsal (Wave 1) | `H03` | Restart, worker retry, duplicate submission, duplicate verification, storage/DB failure, stock race, reservation expiry |
| `H05` | Performance and CWV measurement (Wave 1) | `G03`, `H02` | `PO-APP12-005` at p75; lab vs production-like separated. Owns `B03-02` |
| `H06` | SEO and public readiness (Wave 1) | `C03`, `H02` | §N.2 scope |
| `H07` | Operational runbooks (Wave 1) | `H02`–`H04` | Runbooks only; **API Δ 0** |
| `H08` | Accessibility and compatibility (Wave 1) | `V02` | Purchase flow and Admin commerce flows; browser/device matrix |
| `V01` | Runtime Visual & Content UAT — audit | `G03`, `A02` | All Wave-1 customer and operator surfaces incl. ready-made, at 1440/1024/390; density, copy, hierarchy, contrast, CTA prominence, surface separation, loading/empty/error/out-of-stock, mobile rhythm. Docs only |
| `V02` | Runtime Visual & Content corrections and live re-verification | `V01` | Bounded; before/after live evidence; `Nét Thêu` unification; the three-token contrast correction with `DESIGN_SYSTEM_FOUNDATION.md` and token tests. Only measured copy defects rewritten |
| `U01` | Wave 1 Ready-Made business UAT | `V02`, `H06` | §27 journey exactly |
| `E01` | Wave 1 commerce regression, positive and negative | `U01` | §28 cases |
| `R01` | **WAVE 1 RELEASE GATE** | all Wave 1 | `READY_MADE_GO_LIVE_BLOCKERS = n`; GO requires `n = 0`, four store facts supplied, Wave-2 isolation verified. Does not deploy |

### Wave 2 — Custom embroidery and Editor (5) · Closure (1)

`W01` · `W02` · `W03` · `W04` · `R02` (§O), then `X01` — final closure
reconciling both wave decisions, residual limitations, release manifests,
production config, runbooks, rollback and go-live evidence.

---

## R. Sequence

```text
P01 → G01 → { G02, D01, DB01 }
DB01 → C01 → { C02 → A01, C03 }
C02/A01 → G03
DB01 → B01 → B02 → B03 → B04 → B05
B01/D01 → S01 ; B02/D01 → S02 ; B04/D01 → S03 ; B05/D01 → A02
A02 → { H01, H02 } → H03 → H04 → H05 → H06 → H07
G03/A02 → V01 → V02 → H08 → U01 → E01 → R01     ← WAVE 1 GO/NO-GO
R01(GO) → W01 → W02 → W03 → W04 → R02           ← WAVE 2 GO/NO-GO
                                     ↘ X01
```

---

## S. Wave-1 `R01` matrix

| Evidence set | Owner |
|---|---|
| `READY_MADE_BUSINESS_UAT` | `U01`, `E01` |
| `CUSTOMER_UI_UX` / `OPERATOR_UI_UX` / `CONTENT_QUALITY` | `V01`, `V02` |
| `SECURITY` | `H01` |
| `ACCESSIBILITY` | `H08` |
| `PERFORMANCE` | `H05` |
| `PRODUCTION_CONFIG` | `H02` |
| `OBSERVABILITY` | `H03` |
| `RECOVERY` | `H04` |
| `RUNBOOKS` | `H07` |
| `SEO_PUBLIC_READINESS` | `H06` |
| `DYNAMIC_CATEGORY_CORRECTNESS` | `C03`, verified in `E01` |
| `STORE_FACTS_SUPPLIED` | `PO-APP12-002`, verified at `R01` |
| `WAVE_2_ISOLATION_ENFORCED` | `G02`, verified at `R01` |

No Wave-2 evidence is required for Wave-1 GO — only proof that custom capability
is not exposed.

---

## T. Wave-2 `R02` matrix

| Evidence set | Owner |
|---|---|
| `CUSTOM_LIFECYCLE_UAT` (COP + catalog-custom + inherited blockers) | `W01` |
| `EDITOR_FUNCTIONAL_DEEP_UAT` | `W02` |
| `EDITOR_RUNTIME_UI_UX` / `ACCESSIBILITY` / `MOBILE` / `RESILIENCE` | `W03` |
| `SECURE_DESIGN_FLOW`, `UPLOAD/PREVIEW/REVISION/APPROVAL` | `W01`, `W02` |
| `CUSTOM_PAYMENT / PRODUCTION / FULFILMENT` | `W04` |
| `WAVE_1_CHANGE_IMPACT_REVALIDATION` | `W04` |

---

## U. Remaining Product Owner inputs

```text
PO_INPUT_REQUIRED_BEFORE_R01 =
  canonical store address
  opening hours
  phone
  email

NEW_PO_DECISION_REQUIRED = NONE
```

Two items are surfaced for confirmation at lock rather than as new decisions,
because existing authority resolves both:

- **`PO-APP8-002` boundary** — its no-expiry rule is scoped to APP8 official
  (custom) reservations; the ready-made expiry policy is origin-scoped and
  extends rather than contradicts it (§H).
- **`C02`/`A01` scope option** — operator category management may be deferred,
  leaving categories migration-provisioned, without breaking the dynamic contract
  (§E).

---

## V. Files changed

```text
docs/implementation/reports/APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md  (new)
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md              (roadmap state)
docs/implementation/reports/APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md (§Z9 superseded banner)
```

Documentation only. Runtime code, OpenAPI, generated client, database, category
data, Figma, tokens, infrastructure and dependencies are **unchanged**.

### V.1 Evidence run — read-only

```text
git status --short                        → clean at start and end
read-only psql: categories rows + ids + timestamps; \d categories, skus,
  product_variants, sku_stocks, order_items, orders, payment_obligations,
  shipping_details, customers, secure_access_grants, inventory_reservations,
  inventory_soft_holds; secure_access_grants CHECK definitions
OpenAPI: zero category paths; 4 four-value category enums located
source: migration 0033; IMP-D032; IMP-D038; discover-categories.ts;
  product-breadcrumb.ts; public-static-routes.ts; product-category-options.ts;
  save-shipping-detail.use-case.ts; reserve-order-inventory.usecase.ts;
  tools/check-storefront-route-authority.mjs
blast-radius sweep for the four-value taxonomy → ~48 files
```

Forbidden actions not taken: no data mutation, no migration, no OpenAPI edit, no
client regeneration, no runtime fix, no Figma change, no UAT execution, no
deployment, no push.

---

## W. Stop confirmation

```text
NO APP12 ENGINEERING CHECKPOINT EXECUTED
IMPLEMENTATION_STARTED = false
ROADMAP_LOCK           = PENDING_PO_REVIEW
NO READY-MADE COMMERCE IMPLEMENTED
NO CATEGORY DATA MUTATED
NO DB / OPENAPI / CLIENT / FIGMA / TOKEN / RUNTIME CHANGE
NO PRODUCTION DEPLOYMENT
NO PUSH
PROPOSED_NEXT = APP12-P01   (not started; not executable before PO lock)
```
