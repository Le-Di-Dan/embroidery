> ### Correction notice — `APP12-S02-C1` (2026-09-02)
>
> **`FU-APP12-S02-04` was rejected as deferred `APP12-H01` debt.**
>
> The native pre-hydration GET can destroy SKU/quantity state on the new Wave-1
> checkout route, so it belongs to S02 correctness rather than to a later
> hardening checkpoint.
>
> `APP12-S02-C1` makes the server-rendered pre-hydration form non-destructive
> and proves it deterministically in real Chromium. The original evidence below
> is unchanged and remains accurate; only §AC's disposition of
> `FU-APP12-S02-04` is superseded — it is now `CLOSED_BY_APP12_S02_C1`.
>
> ```text
> APP12-S02 = COMPLETE_AFTER_C1
> CORRECTION_USED = 1 / 1
> ```
>
> See `docs/implementation/reports/APP12-S02-C1-COMPLETION-REPORT.md`.

# APP12-S02 — Ready-Made Checkout · Completion Report

```text
CHECKPOINT   = APP12-S02 — Ready-Made Checkout
PHASE        = APP12 — Hardening, UAT and Production Readiness
TYPE         = STOREFRONT / NEW WAVE-1 ROUTE · VERIFIED CUSTOMER CHECKOUT
               DELIVERY FORM · READY_MADE ORDER CREATION
               NO PAYMENT UI · NO SECURE ORDER PAGE
DATE         = 2026-09-02
```

---

## A. Verdict

```text
APP12-S02 = COMPLETE
```

One Storefront route added — `/mua-hang/[slug]` — consuming the delivered
`APP12-B01`, `APP12-B02` and `APP4` contracts and widening none of them. Nineteen
live Playwright cases pass in real Chromium at 1440, 1024 and 390 against a real
API and a **disposable** PostgreSQL that is dropped with the run; the shared
development database received nothing.

Three **design ↔ contract reconciliations** were required and are recorded rather
than resolved by inventing UX or by widening an API (§C.3). None of them blocks
the approved journey, so the checkpoint is not `BLOCKED_CONTRACT_GAP`.

---

## B. S01 PO ruling and reconciliation

Recorded as instructed, and acted on:

```text
APP12-S01               = COMPLETE — PO PASS
CORRECTION_USED         = 0 / 1
PO-APP12-S01-A          = ACCEPTED_FAIL_CLOSED_INVALID_STATE
```

The ambiguous-SKU rule is **preserved, not merely repeated**. `APP12-B01`
publishes every order-eligible SKU and names no winner; `resolveVariantSubject`
therefore projects such a variant as `ambiguous`, and `resolveCheckoutSelection`
only ever matches a subject of kind `buyable`. A URL naming either SKU of an
ambiguous variant resolves to a refusal — proved against both ids in the unit
suite, in the component suite and live in the browser. No heuristic winner
exists anywhere in the feature, and no `skuId` is rendered as customer copy.

### S01 follow-up routing

| id | subject | routed to |
|---|---|---|
| `FU-APP12-S01-01` | degraded purchase-projection failure has no approved frame | `APP12-V02` |
| `FU-APP12-S01-02` | exact-money formatter duplicated across Storefront features | `APP12-H01` |
| `FU-APP12-S01-03` | `product-detail.scss` 555 lines, pre-existing hard-limit debt | `APP12-H01` |

None was absorbed here. In particular the money helper was **reused across the
feature boundary** (`ready-made-purchase/model/purchase-money`) rather than
copied a fifth time, so S02 adds no new instance of the debt `FU-APP12-S01-02`
tracks and does not perform the promotion that checkpoint owns.

---

## C. D01 and source preflight

### C.1 Design authority

`docs/design/FIGMA_DESIGN_INDEX.md` rows resolved, all
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP12-D01-PO-001`, all read at
their exact nodes in file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_12`:

| registry id | frame | read |
|---|---|---|
| `FIG-APP12-S02-CHECKOUT-DESKTOP` | `907:142` | full node tree |
| `FIG-APP12-S02-CHECKOUT-TABLET` | `907:252` | registry row |
| `FIG-APP12-S02-CHECKOUT-MOBILE` | `907:5738` | full node tree |
| `FIG-APP12-S02-CHECKOUT-VALIDATION` | `909:256` | full node tree (`909:255` section) |
| `FIG-APP12-S02-CHECKOUT-SUBMIT-PENDING` | `909:266` | full node tree |
| `FIG-APP12-S02-CHECKOUT-REFUSAL` | `909:274` | full node tree |
| `FIG-APP12-D01-OVERVIEW` | `901:5` | journey + Wave-1 prohibitions |
| `FIG-APP12-D01-REUSE-MATRIX` | `917:348` | reuse classes, source mapping, `918:347` reconciliation note |

Every Vietnamese string in `ready-made-checkout-copy.ts` and
`checkout-failure.ts` carries its node id. **No copy was written from a DTO field
name, an enum member or a backend message.**

`FIGMA_DELTA = 0` — no node was created, modified or moved.

### C.2 Delivered source

| question | measured answer |
|---|---|
| create operation | `publicReadyMadeOrderCreate` → `POST /api/public/ready-made-orders` |
| authorization | a VERIFIED, unexpired **SUBMISSION** challenge; no guard, re-read inside B02's own transaction |
| **idempotency carrier** | **the challenge id.** No `Idempotency-Key` parameter exists on this operation |
| idempotency fingerprint | `(skuId, quantity, delivery)`, server-side; price deliberately excluded |
| refusal vocabulary | `VERIFIED_CONTACT_REQUIRED`, `SKU_NOT_AVAILABLE`, `INSUFFICIENT_STOCK` (422); `IDEMPOTENCY_CONFLICT`, `DUPLICATE_OPERATION` (409) |
| create response | `orderCode`, `status`, `merchandiseSubtotal`, `reservationExpiresAt`, `access{delivered, expiresAt, scopeKind}` — **no token field** |
| delivery contract | `recipientName`, `recipientPhone`, `addressLine`, `province` required; `ward`, `district` optional; **no note field** |
| APP4 reuse surface | `useContactVerification` + `ContactEntryCard` / `CodeEntryCard` / `VerificationOutcomeCard`, released for `APP5-S01` |
| verified-id retention | `APP4` clears `challenge` on `VERIFIED`; `APP5-S01` observes it without changing the reducer |
| Wave-2 gate | `isWithheldWave2Route` — exact matches plus the Studio shape; `/mua-hang/*` is in neither |
| private-route SEO | `robots {index:false, follow:false}`, no `alternates`, no `openGraph` (nine routes asserted) |
| sitemap | `PUBLIC_STATIC_ROUTES` + the API's live indexable entity inventory |
| money helper | `formatExactAmount` / `formatExactMoney`, string-only |

### C.3 Design ↔ contract reconciliations

Three, each recorded and none resolved by inventing UX or widening an API.

**1. `province` is contracted and not drawn.** `ReadyMadeOrderDelivery.province`
is required; the frames draw one free-form `Địa chỉ nhận hàng` whose placeholder
merely *ends* in a province. An order cannot be created without the field, and
splitting a free-form address on commas in the browser would post administrative
facts the customer never stated. The field is rendered in the same drawn field
pattern under the label the repository **already ships for this exact column** —
`Tỉnh/Thành`, from `apps/admin/.../fulfillment-copy.ts` — rather than a label
coined here. `ward`/`district` are contract-optional and are **not** added: the
approved address line is where the customer writes them, exactly as the drawn
placeholder does. → `FU-APP12-S02-01`.

**2. `Ghi chú cho xưởng (không bắt buộc)` is drawn and not contracted.** No
Ready-Made creation field carries it. §18 admits a field only when it is approved
*and* contracted, so it is omitted rather than rendered inert — an input that
silently discards its value is worse than no input. → `FU-APP12-S02-02`.

**3. There is no drawn checkout success frame.** `APP12-D01` draws the checkout,
its validation, its pending state and its refusal, then continues at
`/truy-cap/don-hang` — which §25 forbids navigating to, because this route never
holds the `ORDER_ACCESS` token. The confirmation is therefore composed from the
**delivered `APP5-S02` surface** (`660:11` … `660:21`), which states the same
three facts about a just-created record and a secure link sent to a verified
contact, rendered in the checkout's own card language. → `FU-APP12-S02-03`.

---

## D. Route architecture

```text
apps/storefront/src/app/mua-hang/[slug]/page.tsx     Server Component, force-dynamic
  ├── loadProductDetail(slug)                        → not-found / error decision
  ├── loadReadyMadePurchase(slug)                    → current purchase projection
  ├── resolveCheckoutSelection({view, skuHint, quantityHint})
  └── <CheckoutQueryProvider view={…}/>              → the one client island
```

`force-dynamic` here is inventory correctness, not performance: the summary
states a live unit price and is bounded by a live availability, so a cached copy
would offer stock that has since been reserved.

The island is bounded to the form. It receives the resolved view as props and
**has no catalog client at all** — asserted in the boundary suite — so the
summary a customer sees is the one that request produced and cannot be
re-decided in the browser.

**One `<form>` subtlety, and it was a real defect caught by the component
suite.** The screen initially wrapped both columns in a single `<form>`, which
nested one inside `APP4`'s own `ContactEntryCard` form; React warned and the DOM
dropped the inner one, which would have broken verification. The delivery card
now has its own `<form id>`, the summary's button joins it with the `form`
attribute, and the `APP4` forms stay siblings. One submit event, three
well-formed forms, source order preserved.

---

## E. Query-hint validation

`sku` and `quantity` are navigation hints and never an authority.

| address | outcome |
|---|---|
| valid SKU, valid quantity | prefilled summary |
| **no** `sku` | invalid-selection card, return path, no form |
| SKU of another Product | `unknown-sku` → invalid-selection |
| SKU published here but sold out | `not-purchasable` → invalid-selection |
| **either** SKU of an ambiguous variant | `unknown-sku` → invalid-selection |
| projection unreadable | `unavailable` → invalid-selection |
| `0`, `-4`, `2.5`, `2e3`, `12abc`, `١٢`, `99999999` | reset to `1` or clamped to availability; never a 500 |
| repeated `?sku=a&sku=b` | treated as absent — a repeated parameter is not a choice |

The four refusal reasons render **one** state deliberately: distinguishing them
would publish whether a SKU id exists, which is the same disclosure `APP12-B02`
collapses into a single `SKU_NOT_AVAILABLE`. The remedy is identical in all four
cases.

A malformed quantity is **reset, not coerced**: `Number.parseInt` would accept
`12abc`, so the pattern decides first and the parse only runs on digits.

---

## F. Checkout SKU and price summary

`Tiền hàng` is the only figure this screen computes: current unit price ×
quantity, exactly, by `multiplyExactAmount` — `BigInt` over the amount scaled to
minor units. There is no `Number()`, no `parseFloat`, no unary `+` and no
arithmetic operator applied to an amount anywhere in the feature, asserted
statically. An amount outside the contract shape is rendered as `—` rather than
approximated.

The value is **presentation only**. `CreateReadyMadeOrderBody` has no field an
amount could travel in, and the live suite asserts the posted body contains
neither `399000` nor `798000`.

```text
Tiền hàng        798.000 VND        ← current unit price × quantity
Phí giao hàng    Xưởng xác nhận sau ← approved string, never a zero
Tổng thanh toán  Có sau khi xác nhận phí ← BR-027, never fabricated
```

---

## G. APP4 verification reuse

One verification system, and it is the delivered one. `useContactVerification`
with `purpose: 'SUBMISSION'` — the purpose `APP12-B02`'s guard requires — driving
the three approved `APP4-D01` cards. The feature creates **no** account,
password, login, second OTP or local-only verified boolean; asserted statically.

The verification **code** never touches this feature: it lives in `APP4`'s own
ref and in the code input, and no export on that boundary can reach it.

---

## H. Verification invalidation (§16)

`APP4`'s `CONTACT_CHANGED` deliberately changes only `contact` — it is an input
event, not a lifecycle one — so the flow can sit at `SUCCESS` while the field
beneath it says something else. Correct for `APP4`, which ends at success; a
defect here, where success is a credential the next screen spends.

`useVerifiedContact` captures `{challengeId, contactKind, contact}` **once**, at
the edge into success, and re-captures never. A divergence in either half drops
the retained authorization on the spot. `APP4` is untouched: same reducer, same
actions, same moment of forgetting.

Proved three ways: the capture-once/compare-always shape is asserted in source,
the behaviour is driven in the component suite, and the live suite verifies a
contact, edits it, submits, and confirms the refusal with **zero orders
created**.

---

## I. Delivery form

The four contracted required fields, in the drawn field pattern, inside a
`<fieldset>` whose `<legend>` is the drawn `Giao hàng` heading.

Client validation is presence-and-shape only and is **UX, never authority** —
`APP12-B02` re-validates the same body. There is deliberately **no phone-format
rule**: the contract asks for 1–32 characters and takes no position, and a rule
invented here would reject a legitimate number the server would have accepted.

Errors are bound to their field through `aria-describedby` and carry `role=alert`
— `909:258` requires exactly this and forbids a toast — and the submit button
stays pressable while the form is incomplete, because a disabled submit publishes
nothing to a keyboard-only customer.

---

## J. Shipping-fee pending semantics

`MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT` is honoured literally. The fee row
reads `Xưởng xác nhận sau`, the total reads `Có sau khi xác nhận phí`, and the
notice block states the sequence. Asserted against the rendered rows themselves
rather than against page text, because a substring search for `0 VND` matches the
tail of every amount ending in a zero. No carrier, no estimate, no automatic fee,
and no customer shipping-fee acknowledgement.

---

## K. Idempotency lifecycle

**The key is the verified challenge id**, because that is the contract:
`APP12-B02` scopes `readyMadeOrder.create` by `challengeId` and fingerprints
`(skuId, quantity, delivery)` inside it. There is no `Idempotency-Key` parameter
on this operation, and minting one would be a second, weaker authority the server
never reads — while adding the parameter is a widening §41 forbids.

The challenge id is none of the four things §20 rejects: not a customer id, not
the SKU id, not a timestamp, not the route slug. It is server-issued,
single-purpose and unguessable.

| §20 requirement | how it holds |
|---|---|
| same payload retry → same key | the challenge does not change between retries |
| double click → one submission | `inFlightRef` refuses re-entry before a render; the server replays regardless |
| material input change → rotated authority | a changed fingerprint on the same challenge is refused `IDEMPOTENCY_CONFLICT`; a new order needs a new verification |

The client additionally tracks a **material fingerprint** so a settled refusal is
dropped when the inputs it described change — never shown beside inputs it was
not about. It is not sent and is not a second fingerprint algorithm.

---

## L. Ready-Made create command

`publicReadyMadeOrder_create`, through the generated operation only. No path
string, no `fetch`, no second Axios instance and no handwritten DTO exist in the
feature — asserted statically. The operation crossed the `@embroidery/api-client`
boundary consumer-driven at this checkpoint; `publicReadyMadeOrder_current` is
deliberately **withheld** and says so where it would sit, because it is
`APP12-S03`'s token-carrying read.

---

## M. Success state and ORDER_ACCESS delivery

Renders only what the response returned: `orderCode`, the **frozen**
`merchandiseSubtotal`, `reservationExpiresAt` (read and never recomputed — §26
forbids `now + 24h`), and the `access.delivered` fact. When `delivered` is false
the promise of a message is withheld and the fallback advice stands alone.

It does not navigate, does not claim payment, and prints no internal id. The
panel takes focus on mount and carries the live heading. The form is gone, so a
refresh-less resubmit is impossible.

---

## N. Error and refusal mapping

Branching is on the **business code**, never the message or the status alone —
`409` covers two outcomes with different remedies.

| wire code | state | approved copy source |
|---|---|---|
| `INSUFFICIENT_STOCK` | `INSUFFICIENT_STOCK` | `909:279`/`909:280` verbatim |
| `SKU_NOT_AVAILABLE` | `SKU_UNAVAILABLE` | `909:276` voice |
| `VERIFIED_CONTACT_REQUIRED` | `VERIFICATION_REQUIRED` | `909:276` voice |
| `IDEMPOTENCY_CONFLICT` | `ALREADY_ORDERED` | `909:276` voice |
| `DUPLICATE_OPERATION` | `IN_FLIGHT` | `909:276` voice |
| `BAD_REQUEST` / 400 | `INVALID_DELIVERY` | `909:276` voice |
| anything else | `UNEXPECTED` | `909:276` voice |

An unrecognised code **never borrows the stock sentence**. The server's own
English message is proved absent from the rendered page. `BAD_REQUEST` is the
real platform code for a refused body — `errorCodeForStatus` maps every 400 to
it, and no invented `VALIDATION_ERROR` exists.

---

## O. Stock and price race behaviour

**Stock.** The live suite loads a checkout while one unit stands, verifies,
fills, then takes that unit **through real inventory** and submits. The approved
refusal appears, the reason is stated, the return path is offered, no order
exists, and the quantity the customer chose is unchanged — no silent
auto-reduction, and a retry sends the identical body.

**Price.** The pre-submit figure is never trusted: it is not sent, and the
confirmation renders the **frozen** `merchandiseSubtotal` the order line carries.
If the catalog price moved between render and commit, what the customer sees is
what was written. The contract carries enough frozen detail for the approved
success state, so this is not a `BLOCKED_CONTRACT_GAP` under §29.

---

## P. Wave-1 isolation

`/mua-hang/[slug]` is Wave 1 and is in neither the withheld list nor the Studio
shape, so `isWithheldWave2Route` returns false for it — asserted for the plain
path, the trailing-slash form and the family root. The live suite runs the entire
journey with `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`.

No second release flag: the feature reads no `*_ENABLED` variable and no
`process.env` at all.

---

## Q. SEO, sitemap and route authority

```text
noindex           = PASS   robots {index:false, follow:false}, verified in a browser
canonical         = none   asserted absent
openGraph         = none   asserted absent
sitemap           = PASS   /mua-hang absent from the served sitemap.xml
robots.txt        = unchanged (no Disallow added — the directive is the fence)
```

The route joined `seo-private-metadata.test.ts`, which now drives **nine** static
private routes. Its metadata is a static object although the segment is dynamic,
deliberately: a title derived from the Product, SKU or quantity would put
per-customer state into a browser history and a shared screenshot.

Sitemap absence is **structural** — nothing had to be removed, because the
sitemap is the static route list plus the API's live indexable entity inventory
and a checkout is in neither.

Route-count authority updated in the five suites that pin it (18 → 19), each in
the same change that adds the route.

```text
node tools/check-storefront-route-authority.mjs          PASS
node tools/check-storefront-product-detail-authority.mjs PASS
node tools/check-category-source-of-truth.mjs            PASS — 2 484 files
```

---

## R. Accessibility and responsive implementation

Real `<label for>`, `<fieldset>`/`<legend>`, `aria-describedby` on hint and
error, `aria-invalid`, `role="alert"` on errors and refusals, `role="status"` on
the pending caption, a visually-hidden live region for the two `APP4`
transitions that render no alert of their own, and focus moved to the
confirmation heading on mount. Ids come from `useId`, never literals. No
clickable-div control anywhere; every control is a real `button`, `input` or
`a`.

Keyboard-only completion is proved **live**: focus the first field, type, Tab,
type, Tab, type, Tab, type, `Enter` — one real order created, focus landing on
`#checkout-success-heading`.

Responsive at the three approved viewports. At 390 the band collapses to one
column **and the summary leads**, matching `907:5738`; `order` is used rather
than a reordered DOM so tab and reading order stay the source order. Grid tracks
are `minmax(0, 1fr)` so a long Vietnamese address shrinks the column instead of
widening the page — zero horizontal overflow measured at all three viewports, and
the floating contact dock never overlaps the order action.

---

## S. Playwright live evidence

`pnpm --filter @embroidery/e2e-testing e2e:app12:s02` — **19 passed**.

```text
✓ viewport 1440 · completes one real checkout end to end
✓ viewport 1440 · never scrolls sideways and is not overlapped by the contact dock
✓ viewport 1024 · completes one real checkout end to end
✓ viewport 1024 · never scrolls sideways and is not overlapped by the contact dock
✓ viewport  390 · completes one real checkout end to end
✓ viewport  390 · never scrolls sideways and is not overlapped by the contact dock
✓ refuses a SKU that belongs to no variant of this Product
✓ refuses a checkout with no SKU hint at all
✓ keeps an ambiguous variant fail-closed and publishes no SKU id
✓ resets a malformed quantity instead of coercing it, and never 500s
✓ refuses an unverified submit and creates nothing
✓ binds each delivery field error to its own field, never a toast
✓ invalidates the verification when the contact changes (§16)
✓ one semantic checkout creates exactly one order however hard it is pressed
✓ replays rather than duplicates when the same body is sent twice
✓ refuses truthfully when the stock goes while the customer is on the page
✓ is completable from the keyboard alone
✓ is reached by the exact href APP12-S01 composes, with Wave 2 off
✓ is noindex and absent from the sitemap
```

Emitted proofs (safe facts only — no code, token or contact):

```json
{"viewport_1440":true,"viewport_1024":true,"viewport_390":true,
 "selection_fail_closed":true,"unverified_submit_refused":true,
 "field_bound_validation":true,"contact_change_invalidates":true,
 "secure_link_delivered":true,"double_submit_orders":1,
 "order_access_grants_per_order":1,"raw_order_access_token_read":false,
 "idempotency_replay":true,"idempotency_conflict_refused":true,
 "stock_race_refused":true,"keyboard_completable":true,
 "s01_handoff":true,"noindex":true,"sitemap_excluded":true}
```

Screenshots attached per viewport: ready checkout, verification + delivery form,
success confirmation.

**Two harness facts worth recording.** The staff-bootstrap CLI is run for its
*policy* side effect — `PublishApp4PolicyUseCase` is the canonical publisher of
`verification.challenge`, and a freshly migrated database without it answers
`503 — not configured to issue`, which the Storefront correctly renders as the
approved back-off state. And the worker's poll loop is held closed
(`WORKER_STARTUP_GATE`) so it cannot race assertions, so the run pumps it
explicitly; the verification code is then found **by kind**, newest first, never
positionally — once an order exists the queue also carries its `SECURE_LINK_TOKEN`
delivery.

---

## T. Idempotency live proof

The browser proof and the server proof are separate on purpose.

**Browser.** Three presses and an `Enter` against one semantic checkout, with
every `POST /api/public/ready-made-orders` counted at the transport:

```text
create requests issued        = 1
READY_MADE orders             +1
inventory reservations        +1
active ORDER_ACCESS grants    +1
idempotency records           +1   (namespace readyMadeOrder.create)
notification intents          increased
idempotency statuses          no IN_PROGRESS left behind
```

**Server.** Because the browser issues only one request, it cannot prove server
idempotency. §47's bounded API-level proof drives the exact S02 mutation seam
with the same challenge and the same body twice: both answer `201`, the **same
`orderCode`** comes back, and the order and record counts each rise by exactly
one. A *different* body on the same challenge answers `409 IDEMPOTENCY_CONFLICT`
and creates nothing.

```text
double_submit_orders = 1
```

---

## U. ORDER_ACCESS delivery evidence

```text
raw_ORDER_ACCESS_token_exposed = false
```

The token is never read, and could not be: the create response has no token
field, `secure_access_grants` stores only a hash, and the evidence reader selects
no `token_hash`, `*_digest` or `token` column. Delivery is proved by running the
worker and counting a delivery whose `secretKind` is `SECURE_LINK_TOKEN` — kind
only; `secretOf` is never called for it anywhere in the suite. Nothing is
decrypted, so nothing needed redacting.

The feature source is additionally asserted to contain no `token`/`grantId`/
`outbox` read, no browser persistence of any kind, and no `/truy-cap` path.

---

## V. Disposable DB and shared-dev hygiene

```text
commercial_validation   = DISPOSABLE
disposable database     = embroidery_db7_e2e_*  (migrations 1..38)
teardown                = "cleanup verified: all E2E ports closed, disposable database dropped"
```

`seedS02Catalog` and `createS02Evidence` both refuse any database not named
`embroidery_db7_*`, so §43 is enforced rather than remembered — the reason being
that S02's rows cannot be undone (`order_items` is undeletable by design).

Shared development database, measured after the run:

```text
shared_dev_S02_orders_created        = 0
shared_dev_S02_reservations_created  = 0
shared_dev_S02_grants_created        = 0
shared_dev_S02_idempotency_created   = 0
shared_dev_S02_fixture_rows          = 0   (products and categories)
G03_data_created                     = false
```

---

## W. S01 regression

The full Storefront suite passes (126 suites, 2 322 tests), S01's own model,
component and boundary suites included. Live, the S01 hand-off is walked
end-to-end: the purchase panel renders with Wave 2 off, the two axes resolve a
SKU, the composed `href` is `/mua-hang/<slug>?sku=<mainSku>&quantity=…`, and
**following it lands on a usable checkout** — the assertion S01 could only make
one half of.

S01's "does not implement the checkout route it links to" assertion moved with
the fact rather than being deleted: it now pins that exactly one `mua-hang` page
exists, that `/truy-cap/don-hang` still does not, and that the purchase feature
reaches into the checkout feature nowhere.

---

## X. Figma and source mapping

```text
FIGMA_DELTA = 0
```

| frame / node | implemented in |
|---|---|
| `907:142` · `907:252` · `907:5738` | `checkout-screen.tsx` + the three stylesheets |
| `907:172`…`907:181` | `checkout-contact-card.tsx` |
| `907:182`…`907:195` | `checkout-delivery-card.tsx` + `checkout-field.tsx` |
| `907:200`…`907:225` | `checkout-summary-card.tsx` |
| `909:256`…`909:265` | `checkout-field.tsx` + `delivery-draft.ts` |
| `909:266`…`909:273` | `checkout-summary-card.tsx` pending variant |
| `909:274`…`909:281` | `checkout-refusal-card.tsx` + `checkout-failure.ts` |
| `660:11`…`660:21` (`APP5-S02`, reused) | `checkout-success-panel.tsx` |

---

## Y. Files changed

**New — feature (16)**

```text
apps/storefront/src/app/mua-hang/[slug]/page.tsx
apps/storefront/src/features/ready-made-checkout/index.ts
  api/ready-made-order.client.ts
  hooks/use-checkout-submission.ts · use-verified-contact.ts
  model/checkout-failure.ts · checkout-money.ts · checkout-selection.ts
        checkout-view.ts · delivery-draft.ts · ready-made-checkout-copy.ts
  styles/_ready-made-checkout-tokens.scss · _ready-made-checkout-form.scss
         _ready-made-checkout-summary.scss · ready-made-checkout.scss
  ui/checkout-contact-card.tsx · checkout-delivery-card.tsx · checkout-field.tsx
     checkout-query-provider.tsx · checkout-refusal-card.tsx · checkout-screen.tsx
     checkout-success-panel.tsx · checkout-summary-card.tsx
```

**New — tests (5)**

```text
apps/storefront/test/unit/ready-made-checkout-model.test.ts
apps/storefront/test/components/ready-made-checkout.test.tsx
apps/storefront/test/boundary/ready-made-checkout-source.test.ts
apps/storefront/test/support/ready-made-checkout-fixture.ts
packages/e2e-testing/specs/app12/s02-checkout.acceptance.spec.ts
packages/e2e-testing/support/app12/s02-checkout-fixture.mjs
```

**Modified (11)**

```text
apps/storefront/src/styles/main.scss                       + one @use
packages/api-client/src/orders-and-payments.ts             + the create operation
packages/e2e-testing/{package.json,playwright.config.ts}   + the s02 mode
packages/e2e-testing/scripts/run-e2e.mjs                   + the s02 topology
apps/storefront/test/smoke/seo-private-metadata.test.ts    + the ninth private route
apps/storefront/test/boundary/{homepage,gallery-feed,gallery-detail}-source.test.ts
apps/storefront/test/boundary/ready-made-purchase-source.test.ts
apps/storefront/test/acceptance/{app10-e01-contact-handoff,app11-e01}.*
docs/implementation/{phases/APP12-…md, SCOPED_COMMAND_INDEX.md}
```

---

## Z. File-size evidence

```text
node tools/check-file-size.mjs --paths \
  apps/storefront/src/features/ready-made-checkout \
  apps/storefront/src/app/mua-hang \
  apps/storefront/test/{components,unit,boundary}/ready-made-checkout* \
  apps/storefront/test/support/ready-made-checkout-fixture.ts

→ Scoped file-size check passed (27 file(s), 0 above the review threshold).

node tools/check-scss-file-size.mjs apps/storefront/src/features/ready-made-checkout/styles
→ SCSS file-size check passed (4 stylesheet(s), 0 above the review threshold).
```

The stylesheet was **split by responsibility** when it reached 389 lines — under
the hard limit but past the review threshold: layout/card shell (109), the form
(94), the summary/outcome half (219), tokens (52).

---

## AA. Validation

| command | result |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `pnpm --filter @embroidery/storefront lint` | PASS |
| `pnpm --filter @embroidery/storefront test` | PASS — 126 suites, 2 322 tests |
| `pnpm --filter @embroidery/storefront build` | PASS — 19 routes, `/mua-hang/[slug]` dynamic |
| `pnpm --filter @embroidery/api-client typecheck · lint · test` | PASS — 8 suites, 53 tests |
| `pnpm --filter @embroidery/e2e-testing typecheck · lint` | PASS |
| `node tools/check-app-scss.mjs storefront` | PASS |
| `node tools/check-scss-file-size.mjs …` | PASS |
| `node tools/check-file-size.mjs --paths …` | PASS |
| `node tools/check-styling-boundaries.mjs` | 25 violations — **baseline-neutral**, measured 25 before the change on a clean tree; none in `ready-made-checkout` |
| `node tools/check-category-source-of-truth.mjs` | PASS — 2 484 files |
| `node tools/check-storefront-route-authority.mjs` | PASS |
| `node tools/check-storefront-product-detail-authority.mjs` | PASS |
| `npx jest src/platform/release-gate/release-gate.contract.spec.ts` (api) | PASS — 15 tests |
| `npx prettier --check <41 changed files>` | PASS |
| `pnpm --filter @embroidery/e2e-testing e2e:app12:s02` | PASS — 19/19, database dropped |

Not run, deliberately: no full monorepo aggregate, no Admin suite, no worker
suite, no global UAT, no performance, no Figma write.

---

## AB. Baseline freeze

```text
OpenAPI            = 125 paths / 138 operations / 277 schemas   (unchanged, measured)
public operations  = 49                                          (unchanged, measured)
release matrix     = 28 STATIC_DENY / 18 STATIC_ALLOW / 3 SCOPE_GATED (unchanged)
migrations         = 38                                          (unchanged, counted)
DB schema          = unchanged — no migration 0039
Figma              = unchanged (FIGMA_DELTA = 0)
Storefront routes  = 18 → 19 (+1: /mua-hang/[slug])
Admin              = untouched
```

---

## AC. Follow-ups

| id | subject | owner |
|---|---|---|
| `FU-APP12-S02-01` | `province` is contracted but drawn nowhere; rendered under the delivered Admin label. Draw the field, or fold it into the address line and widen the contract. | `APP12-V02` (design) |
| `FU-APP12-S02-02` | `Ghi chú cho xưởng` is drawn but no contract field carries it; omitted. Contract it or remove it from the frames. | `APP12-V02` (design) |
| `FU-APP12-S02-03` | No drawn checkout confirmation, and none for `Đổi liên hệ` or the invalid-selection state; composed from the delivered `APP5-S02` surface and the drawn refusal card. | `APP12-V02` (design) |
| `FU-APP12-S02-04` | A submit on `APP4`'s contact form **before hydration** performs a native GET that replaces `?sku=&quantity=`, so a mistimed click drops the customer's selection. Harmless on `/xac-minh-lien-he`; on a checkout it loses the purchase. | `APP12-H01` |

Not absorbed, as instructed: `FU-APP12-S01-01/02/03`, `FU-APP12-B05-01/02`, the
B05 stale table-count duplicate, and the earlier H01/H02 debts.

---

## AD. Roadmap

```text
ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38

APP12-S02 COMPLETE
APP12-S03 NEXT
```

`APP12-S03` is **not** started. `/truy-cap/don-hang` does not exist, no
`ORDER_ACCESS` token is exposed anywhere, and no payment, QR or evidence surface
was implemented.
