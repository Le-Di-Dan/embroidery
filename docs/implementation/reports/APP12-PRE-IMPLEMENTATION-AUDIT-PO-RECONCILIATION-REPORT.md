# APP12 — Pre-Implementation Audit — Product Owner Reconciliation

- Task: `APP12 — PRE-IMPLEMENTATION AUDIT · PO DECISION + ROADMAP RECONCILIATION`
- Phase: `APP12 — Hardening, UAT and Production Readiness`
- Date: 2026-09-01
- Branch: `feat/app11-s04-seo-infrastructure` (HEAD `f9140e5e`)
- Supersedes §T of: [`APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](./APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md)

> **§Z9 is superseded by `PRE_IMPLEMENTATION_AUDIT_C1` (2026-09-01).**
>
> The Product Owner accepted the Ready-Made architecture direction with
> corrections. Everything in this report stands **except the §Z9 32-checkpoint
> roadmap**, which is replaced by the 38-checkpoint roadmap in
> [`APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md`](./APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md) §Q.
>
> Corrections applied there: the category taxonomy is **dynamic**
> (`ao-thun` valid; the APP2 four-value set is an alpha baseline, not a ceiling);
> ready-made shipping fee is **manual Admin before payment**, adding an
> `AWAITING_SHIPPING_FEE` state and removing the redundant `PAID` state;
> reservation expiry is a bounded new capability rather than free reuse
> (§Z4.10's "no schema change" claim was wrong — `PO-APP8-002` made reservations
> deliberately no-expiry); and the oversized `G01` and `H07` slices are split.

---

## Z0. Verdict

```text
APP12_PRE_IMPLEMENTATION_AUDIT  = PO_RECONCILIATION_COMPLETE
CURRENT_20_CHECKPOINT_PROPOSAL  = SUPERSEDED_BY_PO_APP12_READY_MADE_WAVE1_DECISION
ROADMAP_LOCK                    = PENDING_PO_REVIEW
IMPLEMENTATION_STARTED          = false
NEW_PO_DECISION_REQUIRED        = NONE
```

---

## Z1. PO review verdict

```text
AUDIT_EVIDENCE                = ACCEPTED_WITH_MANDATORY_PLANNING_RECONCILIATION
CURRENT_20_CHECKPOINT_ROADMAP = NOT_ACCEPTED
```

The evidence in the original report stands unchanged and is **not** rewritten.
Its §T roadmap is superseded because it defined Wave 1 as customer-owned-product
(COP) custom embroidery, which the Product Owner has rejected.

---

## Z2. Product-authority reconciliation — the audit's claim was too strong

The original report §A.1 stated normal-product commerce *"does not exist in this
repository, and none was ever specified."*

**The second half of that sentence is wrong, and the correction is accepted.**

`docs/00-PROJECT-CHARTER.md:46`, inside §3 *Mô hình kinh doanh* (Business model),
an Approved baseline document, states:

```text
Cửa hàng vừa bán sản phẩm nền vừa nhận thêu trên sản phẩm do khách cung cấp.
(The shop both sells base products and accepts embroidery on
 customer-supplied products.)
```

The audit read Charter §2 (vision) and §3 (B2C/B2B ratios) but did not carry
line 46 into the finding. Direct sale of base products was **business intent from
the approved baseline**. The corrected statement is:

```text
BUSINESS_INTENT_TO_SELL_BASE_PRODUCTS      = ALREADY_PRESENT (Charter §3:46)
DIRECT_COMMERCE_REQUIREMENTS_AND_LIFECYCLE = UNDER_SPECIFIED
DIRECT_SALE_RUNTIME                        = NOT_IMPLEMENTED
```

What the original report proved remains true and is unaffected: no direct
purchase path exists in runtime, schema or contract today. `docs/01`, `03`, `04`
and `06` elaborated only the custom-request lifecycle, and the implementation
followed those documents. The gap is between the Charter's business model and the
downstream requirement set — not a Charter that was silent.

This reconciliation is to be recorded in `docs/12-DECISION-LOG.md` and the
affected requirement, journey and lifecycle documents by `APP12-P01` under normal
documentation governance. **Historical evidence is not rewritten to pretend the
direct-sale flow existed.**

---

## Z3. `PO-APP12-001` … `PO-APP12-006` — dispositions recorded

| Decision | Disposition |
|---|---|
| `PO-APP12-001` | **RESOLVED — Option C with explicit PO scope authority.** Wave 1 = `READY_MADE / BASE_PRODUCT_DIRECT_COMMERCE`. Wave 2 = all custom embroidery. |
| `PO-APP12-002` | **RESOLVED** — address, opening hours, phone and e-mail are **all four** Wave-1 release prerequisites. Values `NOT_SUPPLIED_YET`; none invented. Tracked as `PO_INPUT_REQUIRED_BEFORE_R01`. No CMS. |
| `PO-APP12-003` | **RESOLVED** — canonical brand `Nét Thêu`; `Xưởng Thêu` is stale customer-facing branding to be corrected in Wave-1 visual/content hardening (`Xưởng thêu cá nhân hóa` may remain as a descriptor). UI05 editorial bands not built by default. No CMS / no `content_pages` consumer. Alt text stays `DERIVED_NOT_PERSISTED`; stale documentation corrected. Gallery grouping deferred outside APP12. |
| `PO-APP12-004` | **RESOLVED** — bounded design-token correction authority granted for `$color-action-primary`, `$color-text-tertiary`, `$color-text-secondary` only. Minimum values necessary; measure before/after; both apps; all states; update `DESIGN_SYSTEM_FOUNDATION.md` and token tests; Figma sync tracked, non-blocking. `BOUNDED_FOUNDATION_CORRECTION`, not a brand redesign. |
| `PO-APP12-005` | **RESOLVED** — LCP ≤ 2.5 s, CLS ≤ 0.10, INP ≤ 200 ms, TTFB ≤ 800 ms, all at p75, on representative production-like Wave-1 surfaces with a representative dataset. Lab and production-like measurement reported separately; a single local run is never called "p75"; unmeasurable metrics get the strongest production-like proxy plus an explicit post-launch field-monitoring requirement. Thresholds are never silently relaxed. |
| `PO-APP12-006` | **RESOLVED** — operator action; non-blocking for roadmap lock and for the live runtime UI/UX audit. Follow-up stays open until restored. |

None of the six remains open.

### Z3.1 Terminology lock

```text
READY_MADE_COMMERCE  !=  CUSTOMER_OWNED_PRODUCT
                     !=  CUSTOM_REQUEST
                     !=  CATALOG_PERSONALISATION
                     !=  DESIGN_STUDIO
```

COP is **not** "normal-product commerce" and is not referred to as such below.

### Z3.2 APP12 scope exception

The phase's "no new business features" rule is amended by one explicit,
bounded Product Owner exception: APP12 **may** implement the minimum
production-grade ready-made / base-product direct commerce capability required
for Wave 1. It does **not** authorize marketplace, promotions, discounts,
coupons, wishlist, reviews, loyalty, multi-seller, B2B ordering, complex
merchandising, a third-party payment provider, or any broader ecommerce
expansion. Every other "no new business features" restriction remains in force.

---

## Z4. `READY_MADE_COMMERCE_GAP_ANALYSIS`

All findings below are read-only evidence from the live schema, the generated
OpenAPI artifact and source. Nothing was implemented, migrated or seeded.

### Z4.1 Buyable subject — **RESOLVED, no new Catalog model needed**

The Catalog already carries a three-level model, and the purchasable identity is
already unambiguous:

```text
products → product_variants → skus
```

| Evidence | Consequence |
|---|---|
| `order_items.sku_id` → `skus(id)` | The order line's purchasable subject is **already the SKU** |
| `sku_stocks.sku_id` UNIQUE → `skus(id)` | Stock is **already held per SKU** |
| `skus.is_active`, `product_variants.is_active` | Availability gating already exists |
| `product_variants.color_name`, `.size_label` | The selection axes the PRD §2.2 requires |

```text
BUYABLE_SUBJECT = SKU     (one authoritative purchasable identity; no second model)
```

### Z4.2 Price authority — **RESOLVED**

```text
products.base_price_amount    numeric(14,2) NOT NULL   CHECK >= 0
skus.price_override_amount    numeric(14,2) NULL       CHECK >= 0
both: currency_code CHECK = 'VND'; CHECK amount = trunc(amount)  (integer VND)
```

The chain is already modelled and needs no invention:

```text
unit_price = COALESCE(sku.price_override_amount, product.base_price_amount)
line_total = unit_price × quantity
total      = Σ line_total + shipping fee
currency   = VND (locked by CHECK)
```

**Money already freezes correctly at order creation.** `order_items` stores
`product_name`, `variant_label`, `size_label`, `unit_price_amount`,
`line_total_amount` and `currency_code` as denormalised snapshots, so a completed
order is never recomputed from mutable Catalog prices. No quotation money is
involved, and none is needed.

### Z4.3 Stock authority — **RESOLVED, with one caution**

```text
sku_stocks.quantity_on_hand      NOT NULL CHECK >= 0
sku_stocks.low_stock_threshold   NULL
inventory_reservations(order_id, sku_stock_id, quantity, status, expires_at)
inventory_soft_holds(custom_request_id, sku_stock_id, …)
inventory_ledger_entries(sku_stock_id, order_id, …)
```

Caution: `products.is_display_out_of_stock` is a **manual Admin display flag**,
not a stock fact. Ready-made availability must be derived from `sku_stocks`
minus live `RESERVED` quantity, never from that boolean.

### Z4.4 Order aggregate — the real blocker, and its existing precedent

Blocking `NOT NULL`s on the custom chain:

```text
orders.custom_request_id             NOT NULL, UNIQUE (uq_orders__request)
orders.accepted_quotation_version_id NOT NULL
orders.current_approval_snapshot_id  NOT NULL
order_items.approval_snapshot_id     NOT NULL
payment_obligations.source_quotation_version_id NOT NULL
inventory_soft_holds.custom_request_id          NOT NULL
secure_access_grants.custom_request_id          NOT NULL
secure_access_grants.scope_kind      CHECK = 'REQUEST_ACCESS'   (single value)
payment_obligations.kind             CHECK IN ('DEPOSIT','REMAINING')
```

**The exactly-one-origin pattern the roadmap needs already exists in this
schema**, at line level:

```text
ck_order_items__exactly_one_subject
  CHECK ((sku_id IS NOT NULL AND customer_owned_product_id IS NULL)
      OR (sku_id IS NULL AND customer_owned_product_id IS NOT NULL))
```

So the proposed order-origin discriminator is not a foreign idea imported into
the model — it is the same invariant style the database already enforces, raised
to the order header. Two further facts make the change smaller than it looks:

- `uq_orders__request` is a UNIQUE constraint on a **nullable-able** column;
  PostgreSQL permits many `NULL`s under UNIQUE, so making `custom_request_id`
  nullable preserves "at most one order per custom request" **without touching
  the index**.
- `orders.status` already contains the entire ready-made tail:
  `READY_FOR_DELIVERY`, `DELIVERED`, `COMPLETED`, `ON_HOLD`, `CANCELLING`,
  `CANCELLED`.

### Z4.5 Order lifecycle — proposed

Custom-only states (`AWAITING_DEPOSIT`, `DEPOSIT_PAID`, `IN_PRODUCTION`,
`PRODUCTION_COMPLETED`, `AWAITING_FINAL_PAYMENT`) are **not** reused or
reinterpreted for ready-made — the Product Owner's instruction not to fake the
custom chain applies to state names as much as to foreign keys.

```text
READY_MADE:
  AWAITING_PAYMENT → PAID → READY_FOR_DELIVERY → DELIVERED → COMPLETED
  with ON_HOLD / CANCELLING / CANCELLED available throughout

  production is SKIPPED ENTIRELY — no production job is created
```

Two new status values (`AWAITING_PAYMENT`, `PAID`); the last three states and the
whole exception set are reused verbatim, which is why Admin fulfilment,
dispatch and completion operations carry over.

### Z4.6 Payment model — recommended

The delivered manual bank-transfer infrastructure (`payment_obligations` →
`payment_attempts` → `payment_transfer_evidence` → `payment_reconciliations`,
plus the QR and Admin-verification operations proven in APP7/APP9) is entirely
**order-scoped** and reuses without semantic distortion.

```text
RECOMMENDED = ONE FULL-PAYMENT OBLIGATION for the final checkout total
              manual bank transfer + QR + Admin verification
```

Deliberately **not** 40/60. Evaluated against the required criteria:

| Criterion | Full single payment | Deposit + remaining |
|---|---|---|
| Reuse complexity | One obligation, one verification | Two obligations, two verifications, two customer touchpoints |
| Order lifecycle | 5 states | Adds a second payment gate mid-flow |
| Fulfilment sequencing | Dispatch after one verified payment | Dispatch blocked pending a second collection |
| Customer UX | Pay once, receive goods | Pay twice for an in-stock item — hostile |
| Operator UX | One reconciliation per order | Two, at <100 orders/month |
| Accounting | One inbound transfer per order | Split ledger for no reason |

A deposit exists in the custom flow because embroidery is made-to-order labour
begun before delivery. A ready-made item is already in stock, so the commercial
justification for splitting payment does not transfer. Business-rule support:
PRD §6's 40/60 sits under *Manual quotation*, which ready-made sale does not use.

Schema consequence: `payment_obligations.kind` gains `FULL`, and
`source_quotation_version_id` becomes nullable under an origin-consistent CHECK.

**This is a recommendation, not an irreducible choice** — repository authority
resolves it, so no new PO decision is raised.

### Z4.7 Checkout scope — recommended **A, single-product direct checkout**

| Consideration | Evidence |
|---|---|
| Scale | Charter §7: 20–100 products, **under 100 orders/month** |
| Business shape | A made-to-order embroidery studio; ready-made is a second line, not a supermarket |
| DB model | **No cart/basket table exists**; a cart needs session identity, persistence, expiry and merge-on-verify |
| Extensibility | `order_items` is **already multi-item** (`position`, `uq_order_items__order_position`) |
| Operator workflow | One order = one reconciliation and one dispatch |
| Buyer expectation | For a single-artisan studio, a direct "buy this" is professional and complete |

The decisive point is that **choosing A costs nothing later**: because
`order_items` already supports many lines per order, adding a cart in a future
phase is additive and requires no order-schema migration. Choosing B now would
add session and merge machinery to the critical path of the first release for no
Wave-1 benefit.

```text
CHECKOUT_RECOMMENDATION = A — single-product direct checkout
                          (cart remains a zero-migration future option)
```

### Z4.8 Customer identity — **shared infrastructure, released in Wave 1**

```text
customers.verified_at  timestamp  NOT NULL
orders.customer_id     NOT NULL → customers(id)
```

A customer row cannot exist unverified, and an order cannot exist without a
customer. Therefore ready-made checkout **must** run APP4 contact verification.
This is a genuine shared primitive, not custom-business capability, so §Z6 keeps
`/xac-minh-lien-he` and the verification API **released** in Wave 1 while the
custom-request entry that also uses it stays withheld. No customer accounts are
proposed.

### Z4.9 Shipping / delivery data — **RESOLVED, fully reusable**

`shipping_details` is order-scoped and already carries `recipient_name`,
`recipient_phone`, `address_line`, `ward`, `district`, `province`,
`country_code`, `fee_amount`, `carrier_name`, `tracking_code`,
`fulfillment_note`, `status` and `frozen_at`. **No new table and no new column is
needed** for ready-made delivery capture or dispatch.

### Z4.10 Inventory timing — proposed

```text
order creation      → inventory_reservations RESERVED (expires_at set)
payment verified    → reservation retained; order → PAID
dispatch            → reservation CONSUMED; ledger entry written
expiry / cancel     → reservation RELEASED with released_reason; stock returns
```

Reserve at **order creation**, not at add-to-cart and not at payment
verification: the order is the first durable, customer-committed artefact, and
`inventory_reservations` is already keyed by `order_id` with `expires_at`,
`status` and `released_reason` — the exact mechanism required, reusable with **no
schema change**. Deliberately avoids `inventory_soft_holds`, whose
`custom_request_id NOT NULL` would otherwise force an extra migration for no
Wave-1 gain.

### Z4.11 Customer order access — reuse with one bounded extension

`secure_access_grants` is the right primitive (hashed token, scope, expiry,
revocation, supersession) but is request-bound:
`custom_request_id NOT NULL` and `scope_kind CHECK = 'REQUEST_ACCESS'` (a
single-value CHECK). Extension: nullable `custom_request_id`, new nullable
`order_id`, new `ORDER_ACCESS` scope, exactly-one-subject CHECK. Tokens stay
hashed at rest and out of URLs, following the APP4 resolution pattern.

### Z4.12 Admin operations — bounded additions only

Reusable as-is: order queue and detail, payment verification, inventory,
shipping, dispatch, completion, notifications — all order-scoped.

Bounded changes required: the operator must truthfully distinguish `READY_MADE`
from `CUSTOM` (badge plus filter); ready-made order detail must not render
quotation, design-version or approval panels; the payment panel must present one
`FULL` obligation. **No second Admin order application.**

### Z4.13 Expected deltas

```text
migration           = REQUIRED — one database change-control checkpoint
OpenAPI             = ~10–12 new operations (public + admin), all additive
generated client    = regenerated once per contract checkpoint
storefront routes   = +2 or +3 (checkout, order status; confirmation may be a state)
admin routes        = +0 (existing order routes gain a branch)
new design package  = REQUIRED (one, ready-made only)
```

### Z4.14 Cross-cutting

- **SEO** — ready-made Product Detail becomes transactional; `Offer`/`Product`
  structured data with price and availability becomes meaningful for the first
  time. Checkout, payment and order-status pages are `noindex`.
- **Security** — first customer-money-adjacent public write path: price and total
  must be server-recomputed and never trusted from the client; idempotent order
  creation; rate limiting; stock race safety at reservation.
- **Observability** — the §J gap now covers checkout, order creation, payment
  verification, reservation and dispatch.
- **Runbooks** — reconciliation and stuck-order recovery become Wave-1 critical.

---

## Z5. `READY_MADE_TARGET_JOURNEY`

```text
Admin creates Product → variants → SKUs → price → stock → PUBLISH
  → customer discovers on /kham-pha
  → Product Detail: variant/SKU selection, quantity, live availability, price
  → purchase CTA
  → checkout: contact (APP4 verification), delivery address, order summary,
    exact payable total including shipping
  → READY_MADE order created (AWAITING_PAYMENT) + inventory reserved
  → payment instruction + bank-transfer QR for the full total
  → customer transfers and submits evidence
  → Admin verifies payment → order PAID
  → READY_FOR_DELIVERY → dispatch (reservation CONSUMED, tracking recorded)
  → DELIVERED → COMPLETED
  → customer follows the order throughout via a secure ORDER_ACCESS link
```

Dependency assertion:

```text
custom_request      dependency = false
manual quotation    dependency = false
design version      dependency = false
approval snapshot   dependency = false
Design Studio       dependency = false
production job      dependency = false

shared primitives reused WITHOUT custom semantics:
  APP4 contact verification · secure-link mechanism · manual bank transfer + QR
  · payment verification · inventory reservations · shipping/dispatch · orders
  · notifications · audit/outbox
```

---

## Z6. Wave isolation — corrected and broadened

Wave 2 is now **all custom embroidery**, so isolation covers far more than the
Editor. The release gate must distinguish *shared infrastructure* from
*custom-business capability* — disabling the former would break Wave 1.

| Surface | Wave | Release posture |
|---|---|---|
| `/`, `/kham-pha`, `/san-pham/[slug]`, `/bo-suu-tap*`, content and policy pages | 1 | RELEASED |
| Checkout, payment, order-status routes (new) | 1 | RELEASED |
| `/xac-minh-lien-he` + verification API | 1 | **RELEASED — shared primitive** (§Z4.8) |
| Secure-link resolve + `ORDER_ACCESS` grants | 1 | RELEASED (order scope only) |
| Admin catalog, inventory, order, payment, fulfilment | 1 | RELEASED |
| `/yeu-cau/moi` (both branches — COP **and** catalog) | 2 | **WITHHELD** |
| `/san-pham/[slug]/thiet-ke` (Design Studio) | 2 | WITHHELD |
| `/truy-cap/bao-gia`, `/truy-cap/duyet-thiet-ke` | 2 | WITHHELD |
| `/truy-cap/thanh-toan`, `/thanh-toan-con-lai` (deposit/final) | 2 | WITHHELD |
| `POST /api/public/custom-requests`, custom-request intake, design-session APIs, quotation and design-review APIs | 2 | WITHHELD — custom-business creation |
| `REQUEST_ACCESS` secure grants | 2 | WITHHELD |
| Admin design/template/quotation/production surfaces | 2 | Staff-only; withheld from Wave-1 operator scope |

Rules the gate must honour: fail closed; enforce at route **and** API, not by
hiding navigation; never disable a shared primitive Wave 1 truthfully reuses;
read-only public Catalog infrastructure stays public. Verified at `R01` by
proving the withheld routes and custom-start APIs refuse while Wave-1 journeys
pass.

---

## Z7. Follow-up reclassification — all 36 against the new wave model

Old classifications assumed COP Wave 1 and are **not** carried by inertia. Only
changed rows are listed with a reason; unchanged rows are summarised after.

### Z7.1 Moved to Wave 2 (custom-only; ready-made does not depend on them)

| ID | Was | Now | Reason |
|---|---|---|---|
| `FU-APP10-G01-02` | `WAVE1_BLOCKER` | `WAVE2_BLOCKER` | `payment.final-requested` is the **custom** remaining-payment event; ready-made has one `FULL` obligation and no final-payment step |
| `FU-APP10-G01-03` | `WAVE1_BLOCKER` | `WAVE2_BLOCKER` | Shipping-fee acknowledgement belongs to the custom quotation/recalculation flow; ready-made freezes shipping at checkout |
| `FU-APP11-S03-03` | `WAVE1_HARDENING` | `WAVE2_HARDENING` | Consequence of gallery promotion, exercised through custom/gallery operations |
| `FU-APP11-A01-03` | `WAVE1_HARDENING` | `WAVE2_HARDENING` | Admin gallery continuation retry — not on the ready-made path |
| `FU-APP11-A02-03` | `WAVE1_HARDENING` | `WAVE2_HARDENING` | Catalog **source**-tile preview is a custom-request authoring affordance |
| `FU-APP11-A01-01`, `FU-APP11-A02-02` | `WAVE1_UAT` | `WAVE2_UAT` | Admin **gallery** design spot-checks; not ready-made commerce surfaces |

### Z7.2 Raised for Wave 1 (heightened scrutiny under ready-made)

| ID | Was | Now | Reason |
|---|---|---|---|
| `FU-APP11-S04-C1-02` | `WAVE1_BLOCKER` | `WAVE1_BLOCKER` (**scope widened**) | Category UAT must now also prove filter/navigation and **purchase** flow work on legitimate slugs including `ao-thun` |
| `FU-APP11-B03-02` | `WAVE1_HARDENING` | `WAVE1_HARDENING` (**raised**) | `no-store` on public Product reads now sits in front of a transactional funnel; cache policy affects price/availability freshness |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | `WAVE1_HARDENING` | `WAVE1_HARDENING` (**raised**) | Product Detail is now a selling page; soft-404 indexing is commercially harmful |
| `FU-APP11-S01-02` | `PRODUCT_OWNER_INPUT` | `WAVE1_HARDENING` | Resolved by `PO-APP12-003`: `Nét Thêu` canonical; now a bounded correction, no longer a question |
| `FU-APP11-S05-01` | `PRODUCT_OWNER_INPUT` | `PO_INPUT_REQUIRED_BEFORE_R01` | All four store facts are now hard Wave-1 release prerequisites |
| `FU-APP11-A01-04` | `OPERATOR_INPUT` | `WAVE1_BLOCKER` | The stale API image must not reach a staging/production build of a money path |

### Z7.3 Resolved by PO decision (no longer open questions)

`FU-APP11-G01-01` (no CMS), `FU-APP11-G01-03` (alt stays derived; docs
corrected), `FU-APP11-G01-04` (gallery grouping deferred outside APP12),
`FU-APP11-S02-01` (editorial bands not built by default) — all now
`PO_RESOLVED`, carried as documentation corrections in `APP12-P01` / `V02`.

### Z7.4 Unchanged

`FU-APP11-S04-01` (`WAVE1_BLOCKER`, deployment config) · `FU-APP11-S01-01`
favicon and the soft-404 pair (`WAVE1_HARDENING`) · the three stale specs and
three governance items (`APP12-G01`) · `FU-APP11-B03A-01`/`-02`/`-03` gallery
deletion and idempotency (`WAVE1_HARDENING`, §R.4 reasoning stands — gallery is
Wave-1 buyer-confidence content) · `FU-APP11-S03-01` (operator, non-blocking) ·
`FU-APP11-S01-03`/`-04`, `FU-APP11-A01-05`/`A02-04`/`S02-03` · the seven
`NONBLOCKING_DEFER` items · `FU-APP11-B04-03` and `FU-APP8-A01-04`
(`INTENTIONAL_LIMITATION`) · three duplicates.

### Z7.5 Counts under the ready-made wave model

```text
TOTAL RECONCILED           = 36
WAVE1_BLOCKER              =  4   S04-C1-02 · S04-01 · A01-04 · + production secret mechanism
WAVE1_HARDENING            = 11
WAVE1_UAT                  =  1
WAVE2_BLOCKER              =  2   FU-APP10-G01-02 · FU-APP10-G01-03
WAVE2_HARDENING / UAT      =  6
PO_INPUT_BEFORE_R01        =  1   FU-APP11-S05-01 (four store facts)
PO_RESOLVED                =  4
OPERATOR_INPUT             =  3
SHARED / GOVERNANCE        =  6
NONBLOCKING_DEFER          =  7
INTENTIONAL_LIMITATION     =  2
DUPLICATES                 =  3
```

Rows exceed 36 because duplicates and aliases appear under both entries. Three
non-follow-up Wave-1 blockers remain from the original audit and are unaffected
by the wave change: **deployment infrastructure**, **observability**, and the
**production secret mechanism**.

---

## Z8. Candidate roadmap supersession

```text
APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md §T
  = SUPERSEDED_BY_PO_APP12_READY_MADE_WAVE1_DECISION
```

Retained in history, not deleted; none of its checkpoints is executable. It is
superseded because it placed custom request, quotation, design review and custom
payment inside Wave 1. The checkpoint identities that remain coherent under the
new model (`H01`–`H07`, `V01`, `V02`, `U01`, `E01`, `R01`, `W01`–`W03`, `R02`,
`X01`) are reused below rather than renumbered, so review history stays legible.

---

## Z9. Revised proposed roadmap

```text
ROADMAP_STATUS         = PROPOSED_FOR_PO_LOCK
ROADMAP_LOCK           = PENDING_PO_REVIEW
IMPLEMENTATION_STARTED = false
CHECKPOINTS            = 32
PROPOSED_NEXT          = APP12-P01
```

Backend slices hold to 1–3 related operations (hard maximum 5); frontend slices
are one screen or one small capability. Ready-made commerce is decomposed
honestly rather than compressed into one checkpoint.

### Wave 0 — Ready-Made authority, design and commerce enablement

| ID | Name | Type | Scope and expected delta |
|---|---|---|---|
| `APP12-P01` | Ready-Made product and documentation authority | docs | Record the Charter §3:46 reconciliation in `docs/12-DECISION-LOG.md`; specify the ready-made branch **only** in `01-PRODUCT-REQUIREMENTS`, `03-USER-JOURNEYS`, `04-BUSINESS-RULES`, `06-ORDER-AND-DESIGN-LIFECYCLE`, `07-ADMIN-OPERATIONS`; lock terminology, payment semantics, lifecycle states, price and stock authority; correct the stale alt-text §4 claim. API Δ 0 · migration Δ 0. **Prevents code creating a second undocumented commerce model.** |
| `APP12-G01` | Wave scope lock, release isolation and UAT readiness | governance + bounded runtime | Lock wave membership per route and operation per §Z6; specify the fail-closed release gate distinguishing shared primitives from custom-business capability; seed a representative published catalog with media, variants, SKUs, prices and stock; rebuild the stale API image; re-scope the three stale specs; file-size/`.scss`/registry-doc governance. Owns `B01-02`, `B03A-04`, `B04-01`, `B01-C1-02`, `B04-02`, `A02-C1-01`, `G01-06`, `A01-04`, `S01-03`, `S01-04`, residue items. |
| `APP12-D01` | Ready-Made commerce design package | design (phase-level, one package) | Product Detail buy state · variant/SKU selection · quantity · direct checkout · payment/QR · confirmation and order status · Admin order-branch changes · responsive states · loading/empty/error/**out-of-stock**. Registry updated with node IDs; new frames enter `REVIEW_REQUIRED`. **No unrelated visual polish.** |
| `APP12-DB01` | Order origin and ready-made persistence — database change control | database | `orders.origin` discriminator + exactly-one-origin CHECK; nullable `custom_request_id`, `accepted_quotation_version_id`, `current_approval_snapshot_id`; nullable `order_items.approval_snapshot_id` under the same rule; two new order statuses; `payment_obligations.kind` gains `FULL` and `source_quotation_version_id` becomes nullable; `secure_access_grants` gains `order_id` + `ORDER_ACCESS`. Forward-only; existing custom orders backfilled to `origin='CUSTOM'`. **Migration Δ +1.** Precedes all dependent backend code. |
| `APP12-C01` | Public category contract correction | contract | Closed enum → pattern-validated slug; regenerate client. **API Δ 1 schema.** Owns `FU-APP11-S04-C1-02`. |
| `APP12-B01` | Public purchasable catalog read | backend | SKU-level purchasable projection: SKU id, resolved price, availability, variant labels. **≤2 operations** (extend `GET /api/public/products/{slug}/variants`, which today returns only `{productVariantId, colorName, sizeLabel}` — no SKU, price or stock). |
| `APP12-B02` | Ready-Made checkout and order creation | backend | Server-recomputed totals; idempotent creation; customer binding via verified challenge; shipping capture; reservation at creation. **≤3 operations.** |
| `APP12-B03` | Ready-Made payment obligation, QR and evidence | backend | One `FULL` obligation; QR; attempts; transfer evidence. **≤4 operations**, mirroring the proven APP7 chain. |
| `APP12-B04` | Ready-Made customer order access | backend | `ORDER_ACCESS` grant issue and resolve; order status read. **≤3 operations.** |
| `APP12-B05` | Admin Ready-Made order operations | backend | Origin filter and badge on list/detail; ready-made payment verification; dispatch/completion branch. **≤5 operations.** |
| `APP12-S01` | Product Detail purchase state | frontend | Variant/SKU selection, quantity, live availability, price, purchase CTA, out-of-stock state. One screen. |
| `APP12-S02` | Ready-Made checkout screen | frontend | Contact verification, delivery address, order summary, exact total. One screen. |
| `APP12-S03` | Payment instruction and order confirmation/status | frontend | QR and instruction, evidence submission, confirmation, secure order status. One capability. |
| `APP12-A01` | Admin Ready-Made order branch UI | frontend | Origin badge and filter; ready-made detail without quotation/design panels; single-obligation payment panel. One capability. |

### Wave 1 — Ready-Made hardening and UAT

| ID | Name | Notes |
|---|---|---|
| `APP12-H01` | Authorization and security audit (Wave 1) | Adds money-path scrutiny: server-side price/total recomputation, order-creation idempotency, stock race safety, rate limits, plus CSP, HSTS, `X-Powered-By`, ownership matrix, PII redaction |
| `APP12-H02` | Production deployment and configuration readiness | Staging/production topology, ingress, TLS, config and **secrets**, image build, migration procedure, persistent services, health/readiness, rollback. Owns `FU-APP11-S04-01`, `FU-APP10-I01-02` |
| `APP12-H03` | Observability and alerting (build) | Bounded to detecting and diagnosing checkout, order, payment, inventory and fulfilment failures without unsafe DB manipulation |
| `APP12-H04` | Resilience and failure rehearsal (Wave 1) | Restart, worker retry/idempotency, duplicate submission, duplicate payment verification, manual payment recovery, storage/DB failure, **stock race**, reservation expiry, fulfilment recovery |
| `APP12-H05` | Performance and CWV measurement (Wave 1) | `PO-APP12-005` thresholds at p75 on a representative dataset; lab vs production-like reported separately; post-launch field monitoring named where a metric cannot be credibly measured pre-traffic. Owns `FU-APP11-B03-02` |
| `APP12-H06` | SEO and public readiness (Wave 1) | Soft-404 → real 404; favicon; redirects; `Product`/`Offer` structured data with price and availability; `noindex` on checkout/payment/status |
| `APP12-H07` | Operational hardening and runbooks (Wave 1) | Deployment, rollback, staff bootstrap, secret rotation, **payment reconciliation**, stuck order/job, storage incident, health diagnostics, log inspection, go-live checklist, incident response; gallery withdraw + promotion idempotency. **≤2 operations** |
| `APP12-V01` | Runtime Visual & Content UAT — audit (Wave 1) | **All** Wave-1 customer and operator surfaces including the new ready-made screens, at 1440/1024/390. Density, copy, hierarchy, measured contrast, before-state capture. Docs only; no corrections |
| `APP12-V02` | Runtime Visual & Content corrections and live re-verification | Bounded corrections with before/after evidence; brand unification to `Nét Thêu`; the `PO-APP12-004` token correction with before/after measurement across both apps and all states, plus `DESIGN_SYSTEM_FOUNDATION.md` and token tests. Only measured copy defects are rewritten |
| `APP12-A02` | Accessibility and compatibility (Wave 1) | Customer purchase flow and Admin commerce flows; browser/device matrix; contrast judged post-`V02` |
| `APP12-U01` | Wave 1 role-based business UAT | Operator publishes a ready-made Product; customer buys it; operator verifies payment, dispatches and completes; customer follows via secure order access |
| `APP12-E01` | Wave 1 commerce regression, positive and negative | Full ready-made lifecycle plus authorization denial, duplicate submit, duplicate payment verification, expired order/grant, **stock race**, reservation expiry, worker retry |
| `APP12-R01` | **WAVE 1 RELEASE GATE** | `READY_MADE_GO_LIVE_BLOCKERS = n`; `RELEASE_WAVE_1_RECOMMENDATION = GO \| NO_GO` (GO requires `n = 0`, all four store facts supplied, and Wave-2 isolation verified). **Does not deploy** |

### Wave 2 — Custom embroidery and Editor

| ID | Name | Notes |
|---|---|---|
| `APP12-W01` | Custom embroidery deep UAT | COP **and** catalog personalisation, Design Studio/Editor, custom request intake, manual quotation, design version/review/approval, deposit + remaining payment, custom production and fulfilment; Wave-2 runbook extensions. Owns `FU-APP10-G01-02`, `-03` |
| `APP12-W02` | Custom and Editor runtime UI/UX, accessibility, resilience | `V01`/`V02` loop applied to custom and Editor surfaces; Editor keyboard, focus, upload/preview, mobile; session loss and autosave recovery |
| `APP12-W03` | Wave 2 regression | Full custom lifecycle plus Editor negatives; **change-impact revalidation** of Wave 1 rather than a wholesale rerun |
| `APP12-R02` | **WAVE 2 RELEASE GATE** | `CUSTOM_EMBROIDERY_GO_LIVE_BLOCKERS = n`; `RELEASE_WAVE_2_RECOMMENDATION = GO \| NO_GO`. **Does not deploy** |
| `APP12-X01` | Final APP12 closure | Reconciles both wave decisions, residual limitations, release manifests, production config, runbooks, rollback and go-live evidence. Phase verdict stays separate from deployment |

### Z9.1 Sequence

```text
P01 → G01 → D01 → DB01 → C01
   → B01 → B02 → B03 → B04 → B05
   → S01 → S02 → S03 → A01
   → { H01, H02 } → H03 → H04 → H05 → H06 → H07
   → V01 → V02 → A02 → U01 → E01 → R01     ← WAVE 1 GO/NO-GO
R01(GO) → W01 → W02 → W03 → R02            ← WAVE 2 GO/NO-GO
                              ↘ X01
```

---

## Z10. Wave-1 release gate matrix

| Evidence set | Owner |
|---|---|
| `READY_MADE_BUSINESS_UAT` | `U01`, `E01` |
| `CUSTOMER_UI_UX` / `OPERATOR_UI_UX` / `CONTENT_QUALITY` | `V01`, `V02` |
| `SECURITY` (incl. money-path) | `H01` |
| `ACCESSIBILITY` | `A02` |
| `PERFORMANCE` | `H05` against `PO-APP12-005` |
| `PRODUCTION_CONFIG` | `H02` |
| `OBSERVABILITY` | `H03` |
| `RECOVERY` | `H04` |
| `RUNBOOKS` | `H07` |
| `SEO_PUBLIC_READINESS` | `H06` |
| `STORE_FACTS_SUPPLIED` | `PO-APP12-002`, verified at `R01` |
| `WAVE_2_ISOLATION_ENFORCED` | `G01`, verified at `R01` |

Wave 1 GO does not require any custom-embroidery UAT to pass — only proof that
custom capability is not exposed.

---

## Z11. New Product Owner decisions

```text
NEW_PO_DECISION_REQUIRED = NONE
```

The four candidate areas the directive flagged were all resolvable from
repository authority, so each is answered with a recommendation rather than
escalated:

- **Cart vs direct checkout** — recommended A, from Charter §7 scale and the fact
  that `order_items` already supports multiple lines, making a later cart a
  zero-migration addition (§Z4.7).
- **Ready-made payment semantics** — recommended one `FULL` obligation; 40/60 is
  scoped by PRD §6 to manual quotation, which ready-made does not use (§Z4.6).
- **Shipping-fee rule** — `shipping_details.fee_amount` with `frozen_at` already
  exists and freezes at checkout; no new commercial rule is required (§Z4.9).
- **Cancellation/refund rule** — `order_cancellation_requests` and `refunds`
  already exist and are order-scoped; ready-made reuses them. `APP12-P01`
  documents the branch; only if that specification exposes a genuine commercial
  ambiguity would a PO decision be raised then.

---

## Z12. Validation and evidence

### `EVIDENCE_RUN`

```text
git status --short                                  → clean at start and end
docs/00-PROJECT-CHARTER.md:46                       → Charter direct-sale statement verified
read-only psql \d: products · product_variants · skus · sku_stocks · order_items
  · orders · payment_obligations · shipping_details · customers
  · secure_access_grants · inventory_reservations · inventory_soft_holds
read-only psql: secure_access_grants CHECK definitions
OpenAPI inspection: 46 public operations enumerated; PublicProductVariantResponse
  proven to carry no SKU, price or stock
prior audit evidence (baseline, live capture, contrast, dataset) carried forward
```

### `EVIDENCE_NOT_RUN` / `WHY_NOT_RUN`

```text
No implementation, migration, contract change or client regeneration — §40 forbids it.
No business data seeded or mutated — read-only evidence sufficed.
No new live Playwright sampling — the prior sample already answered the
  UI/UX planning questions; ready-made screens do not exist yet to sample.
Figma unchanged — MCP remains ConnectionRefused (PO-APP12-006), non-blocking here.
```

---

## Z13. Stop confirmation

```text
IMPLEMENTATION_STARTED = false
ROADMAP_LOCK           = PENDING_PO_REVIEW
CURRENT_20_CHECKPOINT_PROPOSAL = SUPERSEDED
NO APP12 ENGINEERING CHECKPOINT EXECUTED
NO READY-MADE COMMERCE IMPLEMENTED
NO DB / OPENAPI / CLIENT / FIGMA / TOKEN / RUNTIME CHANGE
NO PRODUCTION DEPLOYMENT
NO PUSH
PROPOSED_NEXT = APP12-P01   (not started; not executable before PO lock)
```
