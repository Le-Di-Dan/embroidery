# 04 — Business Rules

**Status:** Approved baseline  
**Version:** 0.1.0

## BR-001 — Primary market

The primary market is Vietnam.

## BR-002 — Business mix

Target mix is 70% B2C and 30% B2B. B2C is the current delivery priority.

## BR-003 — Product ownership

The system supports:

- Store-owned base products.
- Customer-owned products submitted for embroidery.

## BR-004 — Pricing

Quotation is manual.

Pricing inputs may include:

- Physical dimensions.
- Number of colors.
- Estimated stitch count.
- Quantity.
- Base product price.
- Digitizing fee.
- Shipping.
- Manual adjustment.

## BR-005 — Deposit timing

Deposit is paid only after:

1. Digitizing.
2. Customer review.
3. Customer approval.

Deposit amount is 40% of accepted total.

## BR-006 — Remaining payment

Remaining 60% must be paid before delivery.

## BR-007 — Revision count

There is no hard system limit on revision count.

Admin retains the right to:

- Refuse abusive requests.
- Pause processing.
- Cancel spam.
- Request clarification.
- Apply additional terms manually where appropriate.

## BR-008 — Approval authority

Only explicit approval through the secure customer flow is authoritative.

Zalo or Messenger messages are not the system of record for design approval.

## BR-009 — Approved design immutability

An approved design version cannot be edited.

Any post-approval change creates a new version and requires new approval.

## BR-010 — Production version integrity

Production must reference the exact approved version or a production artifact cryptographically linked to it.

## BR-011 — Customer export prohibition

Customers cannot export or download:

- Scene document.
- High-resolution preview.
- Store-owned artwork.
- Production file.
- Digitized embroidery file.

## BR-012 — Watermark

Customer-visible previews must contain watermark.

Internal production artifacts must not contain customer-facing watermark.

## BR-013 — Temporary save

Unsaved designs are stored as temporary sessions and expire after a configurable period.

## BR-014 — Customer identity

Customer may start as guest but must verify email or phone before submitting a request.

## BR-015 — Inventory reservation

Inventory is not officially reserved at draft or request submission.

Official reservation occurs after approval and successful deposit.

This rule governs the **custom** branch. Ready-Made reservation timing is
`BR-024`.

## BR-016 — One Admin

The current system has one Admin account and no role hierarchy.

## BR-017 — Shipping

Shipping fee is manually confirmed by Admin.

No shipping API or customer shipment tracking is required.

Ready-Made shipping-fee authority and its position in the payment sequence are
`BR-027`..`BR-029`.

## BR-018 — Communication

Zalo and Messenger are simple external contact channels.

The platform does not own or synchronize the conversation history.

## BR-019 — SEO

SEO is a core product requirement.

Blog functionality is not required.

## BR-020 — Self-hosting

Production is hosted on infrastructure physically located at or controlled from the store.

External backup and uptime monitoring remain mandatory operational requirements.

---

# Ready-Made direct commerce (Wave 1)

`BR-021`..`BR-032` are added by `APP12-P01` under decisions `D-043` /
`IMP-D058`. They govern orders whose origin is `READY_MADE` and change no
custom-embroidery rule above.

## BR-021 — Ready-Made pricing is server-authoritative

The purchasable subject is a SKU. Unit price is
`COALESCE(skus.price_override_amount, products.base_price_amount)` in `VND`,
resolved by the server; merchandise subtotal is `unit_price × quantity`,
computed by the server.

The client is never authoritative for unit price, subtotal, shipping fee or
final payable total. A client-supplied amount is never trusted and never
persisted as money.

At order creation the line snapshot freezes product name, variant label, size
label, SKU identity, unit price, quantity, line total and currency. Later
Catalog edits never change an existing order.

## BR-022 — Ready-Made SKU availability

A public Product is not the same thing as a currently buyable SKU.

A SKU is purchasable only when, at the time of the check, the Product is
published, its category is public enough for the Product to be published, the
Product Variant is active, the SKU is active, the resolved price is valid, and
available stock is greater than zero.

Available stock is `sku_stocks` minus currently active reservations.
`products.is_display_out_of_stock` is presentation authority only and is never
inventory truth.

When no SKU is purchasable, the Product Detail page stays public where current
publication rules allow, the purchase call to action becomes unavailable or
out-of-stock, and no Ready-Made order may be created.

## BR-023 — Ready-Made order idempotency

Ready-Made order creation must be idempotent. A duplicate submission of the
same checkout intent must not create a second order, a second reservation or a
second payment obligation.

## BR-024 — Ready-Made reservation timing

The inventory reservation is created at durable Ready-Made order creation.

It is never created on Product Detail, never on temporary SKU selection and
never after payment, because stock must be protected across a manual
shipping-fee and payment cycle.

## BR-025 — Ready-Made pre-payment reservation windows

```text
READY_MADE_INITIAL_RESERVATION_WINDOW = 24 hours
READY_MADE_PAYMENT_RESERVATION_WINDOW = 24 hours
```

At order creation the reservation expires at `order_created_at + 24h` and the
order is `AWAITING_SHIPPING_FEE`.

When Admin confirms the shipping fee and the first current `FULL` obligation is
created, the reservation expiry is reset to `shipping_fee_confirmed_at + 24h`
and the order becomes `AWAITING_PAYMENT`.

When the `FULL` payment is verified, the reservation is no longer
expiry-eligible.

This policy is origin-scoped. `PO-APP8-002` no-expiry semantics for **custom**
reservations are unchanged.

## BR-026 — Ready-Made reservation expiry

If either pre-payment window elapses, the reservation is released or expired
with a reason, the order becomes `CANCELLED` with an expiry reason, any live
`FULL` obligation is cancelled, the secure order surface reports the terminal
expired/cancelled state, and later `FULL` verification is refused.

Stock returns to availability on expiry.

## BR-027 — Manual Ready-Made shipping fee before payment

```text
READY_MADE_SHIPPING_FEE = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT
```

There is no automatic calculation, no carrier quote and no fabricated flat rate.

Checkout shows the merchandise subtotal, the shipping fee as pending operator
confirmation, and a final payable total that does not yet exist. Checkout must
never display a fabricated shipping-inclusive total.

The exact payable total exists only after Admin sets the fee, at which point the
server freezes merchandise subtotal, shipping fee and payable total and creates
the `FULL` obligation.

The custom shipping-fee acknowledgement protocol is not reused for initial
Ready-Made pricing.

## BR-028 — Ready-Made shipping-fee correction and `FULL` supersession

While the current `FULL` obligation is `PENDING`, Admin may correct the shipping
fee. The correction supersedes the pending obligation and creates a successor
obligation; the order remains `AWAITING_PAYMENT`.

The customer surface exposes only the current obligation and its amount.

Once `FULL` is `SATISFIED`, an ordinary shipping-fee edit is refused. Any
commercial correction requires the explicit cancellation, refund or compensating
authority. Paid money is never silently reopened.

## BR-029 — Ready-Made payment is a single `FULL` obligation

Ready-Made uses exactly one payment obligation of kind `FULL`, for one exact
total, paid by manual bank transfer with a dynamic QR, with optional transfer
evidence where the existing evidence model supports it, and verified by Admin.

`DEPOSIT`, `REMAINING` and the 40/60 split are custom-commerce semantics and are
never used for Ready-Made.

Successful `FULL` verification moves the order from `AWAITING_PAYMENT` to
`READY_FOR_DELIVERY`. No separate `PAID` order state exists: payment truth lives
in the obligation.

## BR-030 — Ready-Made skips production

A Ready-Made order never creates a production job and never enters
`IN_PRODUCTION` or `PRODUCTION_COMPLETED`.

## BR-031 — Order origin constraints

Every order has exactly one origin: `CUSTOM` or `READY_MADE`.

A `CUSTOM` order still requires its custom request, accepted quotation version
and approval snapshot. A `READY_MADE` order has none of them and requires a SKU
order item.

Placeholder or fabricated custom records must never be created to make a
Ready-Made order representable, and no custom invariant is weakened for that
purpose.

## BR-032 — `ORDER_ACCESS` privacy

The secure order surface is order-scoped: one grant resolves exactly one order.

It exposes only customer-safe facts — order reference, item summary, delivery
summary, shipping-fee pending state, the current `FULL` payable amount when
available, payment instruction and QR, evidence state, fulfilment state and
terminal states.

It exposes no raw internal identifier, no other order and no customer account.
Tokens follow the existing secure-access security model.

---

# Dynamic product category (Wave 1)

`BR-033`..`BR-037` are added by `APP12-P01` under decisions `D-044` /
`IMP-D059`, superseding the closed four-value taxonomy clauses of `IMP-D032` and
`IMP-D038`.

## BR-033 — Category slug syntax

```text
CATEGORY_SLUG_RULE = ^[a-z0-9-]+$
```

Public category slugs are stable, globally unique, ASCII and URL-safe. Unicode
slugs are not permitted. `ao-thun` is a valid category slug.

The taxonomy is **flat**: no nesting, no parent, no merge, no bulk taxonomy
operation and no category-specific media.

## BR-034 — Category publication visibility

A category has the lifecycle `DRAFT → PUBLISHED → ARCHIVED`. No hard delete is
required.

Only a `PUBLISHED`, non-archived category is public. `DRAFT` and `ARCHIVED`
categories are never exposed publicly.

A published but non-indexable category may be used as a customer-facing filter
but is omitted from sitemap and canonical/indexing authority. A published and
indexable category may be both filterable and indexable.

Category labels come from the persisted category name. Vietnamese labels are
never hard-coded in the production Storefront or Admin category option model.

## BR-035 — Published category slug immutability

```text
CATEGORY_SLUG = IMMUTABLE ONCE PUBLISHED
```

A slug may be edited while the category is still pre-publication. After first
publication the slug is immutable, so every Discover URL, breadcrumb link,
sitemap entry and external link stays stable. The name may change without
changing the slug.

Category re-slug with a redirect and canonical lifecycle is not in scope.

## BR-036 — Category archive guard

```text
archive category with PUBLISHED dependent Products = REFUSED
```

The operator must reassign or unpublish the affected Products first. This keeps
public Product truth deterministic.

## BR-037 — Dynamic Discover and sitemap authority

The public category inventory is runtime authority, not a compiled-in list.

It drives Discover filtering and navigation, the Product breadcrumb category
link, the Product continuation call to action, category canonical state, and
category URLs in the sitemap.

For a valid public Product category the breadcrumb is
`Khám phá → <category> → <product>` and the continuation is
`/kham-pha?category=<slug>`. When the category is missing or non-public the
breadcrumb is `Khám phá → <product>` and the continuation is `/kham-pha`.

The sitemap no longer hard-codes four category slugs. The existing 50,000
total-URL guard is unchanged.

---

## BR-038 — Release wave withholding

```text
WAVE 1 = READY_MADE / BASE_PRODUCT DIRECT COMMERCE
WAVE 2 = ALL CUSTOM EMBROIDERY
```

Wave 2 covers customer-owned-product embroidery, catalog personalisation, the
Design Studio and Editor, custom request intake, manual quotation, design
version review and approval, deposit and remaining payment, custom production
and custom fulfilment.

Custom business entry points, custom-start APIs and custom-specific secure
flows are withheld from public exposure until Wave 2 is released. Shared
infrastructure is not disabled merely because custom flows also use it.
