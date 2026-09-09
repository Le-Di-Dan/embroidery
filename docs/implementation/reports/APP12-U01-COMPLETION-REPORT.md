# APP12-U01 — Wave 1 Role-Based Business UAT — Completion Report

```text
APP12-U01                 = CORRECTION_REQUIRED
U01_BLOCKER               = OPERATOR_VARIANT_AUTHORING_UNREACHABLE
U01_VARIANT_AUTHORING     = FAIL

APP12-E01                 = NOT_AUTHORIZED
APP12-R01                 = NOT_AUTHORIZED
NEXT                      = PO_REVIEW_REQUIRED

APP12-M01                 = COMPLETE — PO CLOSED
APP12-G03                 = COMPLETE — PO PASS
ROADMAP_CHECKPOINTS       = 39

PRODUCTION_DEPLOYED       = false
PUSHED                    = false
```

Date: 2026-09-09 · Branch: `feat/app11-s04-seo-infrastructure`

---

## A. Verdict

`APP12-U01` is **CORRECTION_REQUIRED**.

Two independent Wave-1 business failures were found, either of which alone
prevents the checkpoint from passing. Neither is a regression; both are gaps that
no previous checkpoint's evidence could have exposed, because both are about what
an operator and a customer *cannot do* rather than about what a contract returns.

**Blocker 1 — the operator cannot make a Product sellable (§6.1, §8 step 4).**
Working only through the delivered Admin UI, an operator can create a Ready-Made
Product, price it, attach media, pass publication readiness and publish it — and
cannot give it a variant, a SKU or stock, because no delivered surface creates
one. The Product publishes, becomes publicly visible, and is permanently
unbuyable. Publication readiness reports **all seven criteria green** while this
is true, which is a materially false operator claim in its own right.

**Blocker 2 — no verification code can reach a customer (`IMP-O006`).**
Wave-1 checkout requires contact verification before an order can be created. The
repository contains exactly one `NotificationChannelPort` implementation, the
in-memory recording adapter, wired unconditionally; there is no email or SMS
provider and no SDK for one. A real customer can never receive the code, so no
real customer can complete checkout. This is a known open decision routed to
APP12 at `APP4-X01`, and **no APP12 checkpoint owns it**.

The commerce journey downstream of verification (§10 order creation through §19
completion) was **deliberately not executed**; §S records why and on whose
instruction.

The shared G03 world is byte-identical at exit. The disposable world was dropped.
Nothing was deployed and nothing was pushed.

---

## B. G03 PO reconciliation

`APP12-G03 = COMPLETE — PO PASS` was taken as given and not reopened.

The manifest was reconciled against the live shared database by re-running the
generator that reads the rows back out of PostgreSQL:

```text
node --env-file=.env tools/seed-app12-g03-manifest.mjs
git diff --exit-code docs/implementation/evidences/APP12-G03-UAT-DATA-MANIFEST.md
  → byte identical, both at entry and at exit
```

Persisted G03 truth, confirmed:

```text
4 published dynamic categories      7 published Ready-Made Products
47 processed Product images         14 SKUs
16 product_variants rows (14 under uat- Products)
1 / 8 / 20-image Product coverage   base-price and SKU-override price paths
in-stock / low-stock / out-of-stock coverage
```

---

## C. Shared-source read-only proof

The shared development world was opened exactly twice, both times read-only: once
by `pg_dump`, once by the object-store lister. No process in this run held a
write path to it.

`tools/uat-app12-u01-integrity.mjs` is the instrument. It issues nothing but
`select`, and opens its session with `set session characteristics as transaction
read only`, so a future edit that added a write would be refused by PostgreSQL
rather than by a reviewer. It emits commercial counts, catalog counts and a
SHA-256 census digest over the ordered identity **and business** columns of every
G03 row — status, price, stock, threshold, media order and role — so a silently
re-priced SKU could not read as "unchanged".

```text
entry   censusDigest 559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343
exit    censusDigest 559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343
diff(entry, exit) excluding the label field → IDENTICAL
```

A third snapshot was taken after an unrelated Docker Desktop engine restart
mid-run; it carried the same digest, so the restart moved nothing either.

---

## D. Disposable G03-derived world

Built from the actual persisted G03 world, not from a re-seed.

```text
pg_dump embroidery (read-only)  479 108 bytes
  → restore into embroidery_db7_u01_18312d8f943 on the run's ephemeral PostgreSQL

object store, key for key, into the run's ephemeral MinIO
  embroidery-dev-originals    → e2e-originals      101 objects
  embroidery-dev-derivatives  → e2e-derivatives    172 objects
```

Keys were preserved because the cloned `assets.storage_key` rows point at them; a
rewritten key would have produced a catalog of broken images. The development
MinIO publishes no host port by design (`APP2-I03`), so a throwaway `socat`
container bridged it on loopback for the duration of the copy and was removed
immediately after.

The clone was verified to carry G03 truth rather than merely to exist:

```text
clone censusDigest 559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343
                   ← identical to the shared world's
clone tables       79
```

Topology — every port the E2E edge's, never the dev stack's:

```text
ephemeral PostgreSQL (tmpfs) 5544    API host process        4400
ephemeral MinIO      (tmpfs) 9500    Storefront (next start) 4310
real Nginx gateway           8090    Admin      (next start) 4311
in-process API + worker contexts     U01 control server      4499
```

`assertDisposableTarget` refuses any database name that is not
`embroidery_db7_u01_*`, so the clone cannot be aimed at the shared world by a
mistyped port. The G03 seeder's persistent-DB guard was **not** weakened; it was
not used at all.

### D.1 The operator account, and a credential decision

The clone inherits the shared world's staff account, and the system permits
exactly one active admin (`ADMIN_ACCOUNT_ALREADY_ACTIVE`), so `staff-bootstrap`
refused to mint a U01-specific operator. The run therefore **reuses** the
operator the clone already carries and never reads, writes or rotates its
credential; the Product Owner supplied the password for this run through the
prompt, per `CLAUDE.md` §8a, and it appears in no file, log, report or argv.
Rotation was offered and deliberately not taken.

---

## E. Operator Product authoring

Performed at 1440 in a real browser against the real Admin through the real
gateway. Steps 1–3 and 7–9 succeeded; steps 4–6 are the blocker.

| §8 step | Result |
|---|---|
| 1 Create Ready-Made Product under a G03 dynamic category | **PASS** — `Túi đeo chéo thêu hoa mai`, category `Túi vải thêu` (`uat-tui-vai-theu`) |
| 2 Vietnamese name, description, VND base price | **PASS** — 345 000 ₫ VND, real Vietnamese copy |
| 3 Attach real eligible cloned G03 media | **PASS** — 3 cloned Assets through the delivered picker |
| 4 Create the Product's variant(s) | **FAIL — no delivered surface exists** |
| 5 Create at least one active SKU | **UNREACHABLE** — requires a variant, and has no Admin surface either |
| 6 Configure stock | **UNREACHABLE** — stock is per-SKU |
| 7 Run publication readiness | **PASS** — and this is itself a defect; see §F.2 |
| 8 Publish | **PASS** — Product reached PUBLISHED |
| 9 Verify public visibility and buyability | **VISIBLE, NOT BUYABLE** |

Persisted result of steps 1–3, read from the clone:

```text
name  Túi đeo chéo thêu hoa mai    slug  tui-deo-cheo-theu-hoa-mai
status DRAFT → PUBLISHED           base_price 345000.00 VND
media 3                            variants 0
```

No DB substitute was used for steps 4–8. No SQL, no repository adapter call, no
fixture insert, and no pre-seeded G03 variant was borrowed.

---

## F. Variant / SKU reachability — the blocker

### F.1 What the operator can reach

The Product edit screen offers exactly four groups — basic information, category,
price, product images — and two links, *Xuất bản* (publication) and *Vị trí thêu*
(embroidery placement). There is no variant section, no SKU section and no stock
section. The placement screen governs product sides and embroidery areas and has
nothing to do with variants.

Admin route inventory (26 routes) contains `/(protected)/kho/skus/[skuId]` — a
stock screen that requires a SKU id that must **already exist** — and no route
that creates a variant or a SKU.

### F.2 What the delivered contract offers

```text
POST   /api/admin/products/{productId}/variants/{variantId}/skus   adminSku_create
PATCH  /api/admin/skus/{skuId}                                     adminSku_update
GET    /api/admin/skus/{skuId}/stock                               adminSkuStock_get
POST   /api/admin/skus/{skuId}/stock/adjustments                   adminSkuStock_adjust
GET    /api/admin/skus/{skuId}/stock/ledger                        adminSkuStock_ledger
GET    /api/public/products/{slug}/variants                        publicProductVariant_list
```

Two facts follow, and U01 confirms both against the running system rather than
only against source:

1. **No operation anywhere in the 140-operation contract creates a
   `product_variants` row.** `adminSku_create` is nested under a variant that must
   already exist. This is `FU-APP12-G03-02A`, and U01 is its mandatory probe.
2. **`adminSkuCreate` exists in the generated client and has zero Admin call
   sites.** So even an operator who somehow possessed a variant has no delivered
   UI with which to give it a SKU.

Consequently `U01_VARIANT_AUTHORING = FAIL`. Per §6.1 this was not waived with
direct SQL, and per §28 the verdict is `CORRECTION_REQUIRED`.

### F.3 A second, separable defect: readiness makes a false claim

With zero variants, zero SKUs and zero stock, publication readiness reported
**seven of seven criteria green** and offered *Xuất bản*:

```text
✓ Tên sản phẩm và đường dẫn đã sẵn sàng     ✓ Đã đặt giá sản phẩm
✓ Đã có mô tả sản phẩm                      ✓ Thứ tự ảnh sản phẩm hợp lệ
✓ Danh mục đang được xuất bản               ✓ Tất cả ảnh đã được duyệt
                                            ✓ Ảnh hiển thị công khai đã sẵn sàng
```

No criterion mentions a variant, a SKU or stock. "Ready to publish" is therefore
a claim about presentation only, while the operator reads it as a claim about
sellability. This is classified separately as a UAT defect under §6.2's last
sentence, because it is the *reason* an operator would never discover blocker 1
until a customer complained.

Evidence: `evidences/app_12/u01/operator/u01-operator-publication-readiness-no-variant.png`

### F.4 The business consequence, observed

The Product published and is publicly visible. The delivered public read returns
an empty selection set, and the customer is shown a permanent dead end:

```text
GET /api/public/products/tui-deo-cheo-theu-hoa-mai/variants
  → 200 PUBLIC_PRODUCT_VARIANT_LIST_READ  data.variants = []

Storefront /san-pham/tui-deo-cheo-theu-hoa-mai at 390
  → "Hiện chưa có phân loại nào còn hàng."
  → "Tạm hết hàng"
```

The operator has no delivered way to correct it.

Evidence: `evidences/app_12/u01/customer/u01-customer-published-product-unbuyable.png`

---

## G. Publication

Publication itself works. `DRAFT → PUBLISHED` succeeded through the delivered
Admin surface, the Product appeared in the public catalog, its slug resolved, its
three cloned images rendered from the disposable object store, and the Admin list
showed it as *Đã xuất bản*. The defect is not that publication fails; it is that
publication succeeds for something that cannot be sold.

---

## H. Customer Product / SKU selection

Performed at 390 in a real browser. Subject: a mixed-availability G03-derived
Product, `Nón lưỡi trai thêu logo` (`uat-non-luoi-trai-theu-logo`), chosen because
it carries every axis §9 asks for.

Recorded SKU baseline before any customer action:

| variant | SKU | override | stock | threshold |
|---|---|---|---|---|
| Đen / S | `UAT-G03-NON-DEN-S` | base price | 30 | — |
| Đen / L | `UAT-G03-NON-DEN-L` | 245 000 ₫ | 6 | — |
| Be / S | `UAT-G03-NON-BE-S` | base price | 0 | — |
| Be / L | `UAT-G03-NON-BE-L` | base price | 1 | 3 |

Proven:

```text
dynamic category visible                 ✓ "Nón mũ thêu", /kham-pha?category=uat-non-mu-theu
card uses primary thumbnail only         ✓ discover grid shows one image per Product
Product Detail media real                ✓ 6 real cloned images, "1 / 6", strip + lightbox
variant/SKU availability truthful        ✓ see below
out-of-stock option cannot be purchased  ✓ see below
```

**The out-of-stock refusal is real, not cosmetic.** Selecting `Be` disables size
`S` and labels it `· hết`; Playwright could not click it — *"element is not
enabled"* — which is the strongest available proof that the control is genuinely
inert rather than merely styled as unavailable.

**Price follows server authority, not the base price.** Selecting `Đen / L`
switched the displayed price from the Product base 210 000 ₫ to the SKU override
**245 000 ₫**, matching `skus.price_override_amount` in the clone exactly, and
stock read `Còn 6 sản phẩm`, matching `sku_stocks.quantity_on_hand`.

Evidence: `evidences/app_12/u01/customer/u01-customer-product-selection.png`

---

## I. Verification and checkout

The delivered route contract holds. From Product Detail the buy control is a link
to the exact §10 shape, carrying the SKU the customer actually selected:

```text
/san-pham/uat-non-luoi-trai-theu-logo
  → /mua-hang/uat-non-luoi-trai-theu-logo
      ?sku=01a08485-7757-7bc5-857b-2093594f417f&quantity=2
```

That SKU id is `UAT-G03-NON-DEN-L` in the G03 manifest.

The checkout screen computed the subtotal from the frozen unit price and refused
to fabricate anything downstream of it:

```text
Sản phẩm         Nón lưỡi trai thêu logo · Đen · L · SL 2 · 245.000 VND
Tiền hàng        490.000 VND            = 245 000 × 2
Phí giao hàng    "Xưởng xác nhận sau"   not fabricated
Tổng thanh toán  "Có sau khi xác nhận phí"  not fabricated
```

The copy states FULL semantics — *"gửi bạn liên kết để thanh toán một lần"* — and
carries no deposit or remaining-payment terminology.

### I.1 The verification step, and what it does and does not prove

APP4 contact verification was exercised twice with a synthetic identity
(`@vidu.test`, a reserved test domain) in the disposable world. Both runs passed:
the challenge was issued, the real worker executed the delivery job, the code was
accepted and the card reported `✓ Đã xác minh`.

**That result must not be read as "OTP delivery works".** The run generated the
identity, read the code out of the worker's in-process recording adapter and
typed it back into the form. It proves the challenge state machine, the code
format, the masking (`u***@vidu.test`), the 10-minute TTL and the resend cooldown.
It proves nothing whatever about whether a code can reach a human being — see §M,
which is the second blocker.

The delivered verification adapter was used throughout. No production bypass was
hard-coded.

---

## J. ORDER_ACCESS

**Not executed.** No order was created, so no `ORDER_ACCESS` grant was issued and
there was nothing to open.

The harness seam for it was built and left unused: `GET /open/order-access` on the
U01 control server answers `302` with the delivered secure link in `Location`, so
the browser — and only the browser — would ever see the token, keeping it out of
this report, the evidence filenames and the session transcript entirely. It was
never called.

`secure_access_grants` in the clone stayed at **4**, the pre-existing count
inherited from the shared world. U01 issued none.

---

## K. Admin order read

**Not executed.** No order existed to find.

---

## L. Shipping fee

**Not executed.** No order existed to price.

---

## M. FULL payment instruction — the second blocker

The FULL-payment surface was not reached, because no order was created. But the
precondition for *any* customer ever reaching it was audited, and it fails.

### M.1 There is no channel that reaches a customer

```text
implementations of NotificationChannelPort in the repository   1
  apps/worker/src/jobs/notification-delivery/infrastructure/
    channel/recording-notification-channel.adapter.ts

wiring in NotificationDeliveryModule                           unconditional
  { provide: NOTIFICATION_CHANNEL_PORT,
    useExisting: RecordingNotificationChannelAdapter }
  no NODE_ENV switch · no alternative provider · no override seam

email or SMS SDKs across every package.json                    0
  nodemailer · twilio · sendgrid · @aws-sdk/client-ses
  postmark · mailgun · resend · vonage · esms — none present
```

The adapter states its own status:

> *"It appends to an array in the current process's memory, and that array dies
> with the process. … **It is not a production transport and must never be
> presented as one. A deployment running this adapter has delivered nothing to
> anybody.**"*

### M.2 This is a known open decision that nobody owns

`IMP-O006` in the decision register:

> *"Contact/notification providers and delivery channels. **Still open after APP4
> closure, by design**: APP4 ships `NotificationChannelPort` + the in-memory
> recording adapter and delivers to nobody. Routed to **APP12 — Hardening, UAT and
> Production Readiness**. Before production notification delivery."*

It was routed into this phase at `APP4-X01`. Searching the master roadmap and the
APP12 phase plan for a checkpoint that owns it returns **nothing**: the roadmap is
locked at 39 checkpoints and none of them carries it.

### M.3 Why this is a Wave-1 release blocker, not a Wave-2 concern

Wave-1 Ready-Made checkout **requires** contact verification before an order can
be created — the *Đặt hàng* control is gated behind `✓ Đã xác minh`. With no
delivery channel:

```text
a real customer cannot receive the verification code
  → cannot verify
    → cannot create an order
      → the entire Wave-1 commerce flow is unreachable in production
```

Every layer beneath verification may be correct and it would not matter. Routed as
`FU-APP12-U01-NOTIFICATION-PROVIDER` in §W.

---

## N. Evidence upload

**Not executed** (optional under §15, and unreachable without an order).

---

## O. Payment verification

**Not executed.**

---

## P. READY_FOR_DELIVERY

**Not executed.**

---

## Q. Dispatch

**Not executed.**

---

## R. Completion

**Not executed.**

---

## S. Customer secure milestones — and why the journey stopped

§10 order creation through §19 completion were not run. The Product Owner halted
the journey during checkout, on the following grounds, which this report records
as the finding rather than as an excuse:

> The verification being exercised was circular. The customer identity, the email
> and the phone number were all created by the run; the code was read out of the
> run's own process memory and typed back by the run. Nothing in that loop tests
> whether the system can verify a *real* customer. Full manual verification of the
> customer-authentication feature will be performed by the Product Owner after the
> Wave-1 release is assembled.

The instruction is accepted and the audit was redirected to the question that
actually matters — *can a code reach a customer at all* — which is answered in §M.

No order, order item, reservation, obligation, attempt, evidence row, shipping
snapshot or grant was created anywhere, in the clone or in the shared world.

---

## T. Frozen snapshots

Partially proven. The pre-order facts were recorded and the checkout surface was
shown to compute from them:

```text
Product      Nón lưỡi trai thêu logo   uat-non-luoi-trai-theu-logo
variant      Đen / L
SKU          UAT-G03-NON-DEN-L         01a08485-7757-7bc5-857b-2093594f417f
unit price   245 000 ₫ VND             SKU override, distinct from base 210 000 ₫
quantity     2
subtotal     490 000 ₫ VND             = 245 000 × 2, rendered by the server
```

The claim U01 was to prove — that the **order** carries frozen snapshots
independent of later catalog edits — was not reached, because no order exists.
It remains open for the re-run.

---

## U. Inventory

No inventory effect occurred anywhere, which is the correct outcome for a journey
that stopped before order creation.

```text
selected SKU stock at entry   UAT-G03-NON-DEN-L = 6
selected SKU stock at exit    UAT-G03-NON-DEN-L = 6
inventory_reservations in the clone           0
inventory_ledger_entries in the shared world  10 → 10 (unchanged)
```

All four SKUs of the subject Product were unchanged at exit
(`30 / 6 / 0 / 1`). No direct inventory mutation was performed. Stock race and
expiry remain E01/H04 concerns and were not touched.

---

## V. Business usability

Recorded at each milestone reached.

| Milestone | User goal | Next action clear? | Business truthful? | Needs DB knowledge? | READY_MADE terms correct? |
|---|---|---|---|---|---|
| Admin Product list | see what the shop sells | yes | yes | no | yes |
| Create draft | add a new product | yes | yes | no | yes |
| Edit: price + media | make it presentable | yes | yes | no | yes |
| **Edit: make it sellable** | **add variant/SKU/stock** | **no — the goal is unreachable and unmentioned** | **no** | **yes — and even DB knowledge has no UI** | n/a |
| **Publication readiness** | **know if it can go live** | yes | **no — claims ready while unsellable** | no | yes |
| Publish | make it public | yes | yes | no | yes |
| Discover / Product Detail | browse and choose | yes | yes | no | yes |
| Variant + size selection | pick what I want | yes | yes — price and stock match server | no | yes |
| Out-of-stock option | understand I can't have it | yes — `· hết`, disabled | yes | no | yes |
| Checkout summary | know what I'll pay | yes | yes — fee and total honestly deferred | no | yes — FULL, no deposit terms |
| **Contact verification** | **prove it's me** | yes in the UI | **no — the code cannot be delivered** | no | yes |

Two entries fail on *business truthfulness* while their HTTP contracts are
technically correct, which is precisely the case §22 says may fail U01.

No cosmetic V02 preference was reopened.

---

## W. G03 follow-up disposition

```text
FU-APP12-G03-01   stale Product Detail authority gate
                  → nonblocking for U01, unchanged, still red at HEAD
                  → must be reconciled before R01
                  → preferred owner: E01 pre-release tooling reconciliation

FU-APP12-G03-02A  no delivered variant authoring operation
                  → PROBED, CONFIRMED BLOCKING (§F)
                  → operator cannot publish a sellable Product without DB
                    intervention, and no DB intervention has a UI either
                  → escalates to U01_BLOCKER

FU-APP12-G03-02B  no normal low-stock-threshold writer
                  → OBSERVED, NOT FABRICATED. No threshold was written by U01.
                  → the newly provisioned Product never reached the SKU stage, so
                    the "newly provisioned SKU has no threshold" case could not be
                    observed; it is blocked behind FU-APP12-G03-02A
                  → routed as FU-APP12-U01-LOW-STOCK-AUTHORITY for pre-R01 triage
```

New follow-ups raised by U01:

```text
FU-APP12-U01-VARIANT-AUTHORING          blocking
  No delivered surface creates a product_variant, and adminSkuCreate has no Admin
  call site. Operator cannot make any new Product sellable.

FU-APP12-U01-READINESS-FALSE-CLAIM      blocking (business truthfulness)
  Publication readiness reports 7/7 green and offers Publish for a Product with no
  variant, no SKU and no stock. Separable from the above: even after variant
  authoring ships, readiness would still not check sellability.

FU-APP12-U01-NOTIFICATION-PROVIDER      blocking for Wave-1 release
  IMP-O006 is routed to APP12 and owned by no APP12 checkpoint. Without a
  provider no real customer can verify, so no real customer can order.

FU-APP12-U01-LOW-STOCK-AUTHORITY        pre-R01 triage
  Carries FU-APP12-G03-02B forward; unobservable until variant authoring exists.
```

No "future backend checkpoint" was invented. The roadmap stays locked at 39.

---

## X. Evidence

```text
evidences/app_12/u01/operator/
  u01-operator-publication-readiness-no-variant.png
      7/7 green readiness for a Product with 0 variants and 0 SKUs

evidences/app_12/u01/customer/
  u01-customer-product-selection.png
      Đen / L selected, override price 245.000 ₫, "Còn 6 sản phẩm", quantity 2
  u01-customer-published-product-unbuyable.png
      the published Product a customer can never buy — "Tạm hết hàng"
```

The variant-authoring dead end is captured, as §23 requires when it is blocked.

These files exist on disk and are **untracked by design**: `.gitignore:46`
ignores `evidences/`, which is the run-artifact directory every prior checkpoint
writes to (`APP12-G03` carved out only `docs/implementation/evidences/`, for the
manifest). They will not appear in the diff; read them from the working tree.

No token, code, password or secret appears in any evidence filename or in this
report. The milestones §23 lists for the unexecuted part of the journey have no
evidence because they have no occurrence.

---

## Y. Contract and baseline

Measured at exit. Every number is the entry number.

```text
OpenAPI paths       127   unchanged
OpenAPI operations  140   unchanged
OpenAPI schemas     279   unchanged
public operations    49   unchanged

migrations           39   unchanged — no 0040
DB tables            79   unchanged (shared and clone)

Admin routes         26   unchanged
Storefront routes    20   unchanged
```

```text
API / OpenAPI changed    = 0
generated client changed = 0
DB schema / migrations   = 0
Figma changed            = 0
new HTTP operations      = 0
```

**`runtime source changed = 1` — U01 does not meet §28.46.** One Storefront UI
correction was made mid-checkpoint on explicit Product Owner instruction; it is
declared in §AB rather than folded into the delta, because a checkpoint that
claims zero runtime delta while carrying a runtime change would be the same class
of false claim this report raises against publication readiness.

---

## Z. Shared-source integrity

```text
categories / Products / variants / SKUs / product_media / stock
  census digest identical at entry and exit (§C)

customers                3 → 3
orders                   0 → 0
order_items              0 → 0
payment_obligations      0 → 0
payment_attempts         0 → 0
inventory_reservations   0 → 0
secure_access_grants     4 → 4
contact_verification_challenges  1 → 1
notification_intents     0 → 0

manifest reconciliation  byte identical
shared object store      read-only; 0 writes, bridge container removed
```

**Shared commercial write delta = 0.**

Everything U01 created lived in the disposable clone and died with it:

```text
in the clone at teardown   products +1 (the authoring probe)
                           customers 3 → 4
                           contact_verification_challenges 1 → 3
                           notification_intents 0 → 2
                           orders / order_items / obligations / attempts /
                             reservations / grants — all 0, none created
```

---

## AA. Teardown

```text
U01 world process           stopped   U01_WORLD_TORN_DOWN {"failures":[]}
disposable database         dropped   embroidery_db7_u01_18312d8f943
compose project             removed   down -v --remove-orphans
residual containers         []
shared-MinIO bridge         removed
ports 5544/4400/4310/4311/8090/9500/4499   all closed
browsers / pages            closed
```

The world was dropped whole rather than by deleting immutable rows one at a time,
as §25 requires. The development stack was untouched throughout and is still up
and healthy on its own ports.

---

## AB. Files and documents changed

New — U01 UAT harness (`tools/`, not runtime):

```text
tools/uat-app12-u01-integrity.mjs   read-only shared-source probe and census digest
tools/uat-app12-u01-clone.mjs       pg_dump/restore + object-store copy, with the
                                    embroidery_db7_u01_* refusal guard
tools/uat-app12-u01-infra.mjs       Docker lifecycle: up / gateway / down
tools/uat-app12-u01-world.mjs       long-lived app tier + in-process worker
tools/uat-app12-u01-control.mjs     loopback control seam; the secure link leaves
                                    only as a 302, never as a value
```

The harness is split by capability rather than by taste: background shells in this
environment cannot reach the Docker named pipe, so containers are driven from the
foreground CLI and the long-lived application tier owns no Docker call.

Changed — runtime, on explicit Product Owner instruction (see §Y):

```text
apps/storefront/src/features/storefront-shell/components/storefront-header.tsx  +16 −1
apps/storefront/src/features/storefront-shell/styles/storefront-shell.scss       +5
```

The Storefront compact header placed the navigation trigger **inside** `bar-lead`
and **before** the brand, so at 390 the hamburger sat at 16–60 and the brand at
72–215 — both crowded on the leading edge with the trailing half empty. `APP12-V02`
had already corrected exactly this on the Admin bar; the Storefront never received
the same rule. The trigger is now the header's last child with
`margin-inline-start: auto`, mirroring the Admin rule and its comment.

```text
                brand            trigger      content edges
390    before   72 → 215         16 → 60      16 / 359    ✗ both left
390    after    16 → 159        315 → 359     16 / 359    ✓
768    after    24 → 167        685 → 729     24 / 729    ✓
1440   after    24 → 187        display:none  inline nav 219 → 1401, unchanged
```

The Admin bar was re-verified in the same run and was already correct at 390, 768
and 1808 — the V02 fix is intact; only the Storefront was missing it.

New — documents:

```text
docs/implementation/reports/APP12-U01-COMPLETION-REPORT.md
```

---

## AC. Validation

Change-impact only, per `VALIDATION_GOVERNANCE.md` §3.

| Control | Command | Result |
|---|---|---|
| whitespace | `git diff --check` | pass |
| G03 manifest | `node --env-file=.env tools/seed-app12-g03-manifest.mjs` + `git diff --exit-code` | byte identical |
| shared integrity | `node --env-file=.env tools/uat-app12-u01-integrity.mjs` entry / exit | digests identical |
| baseline counts | OpenAPI 127/140/279, public 49, migrations 39, tables 79, routes 26/20 | unchanged |
| Prettier | `npx prettier --check <2 changed files>` | pass |
| ESLint | `pnpm --filter @embroidery/storefront lint` | pass |
| TypeScript | `pnpm --filter @embroidery/storefront typecheck` | pass |
| SCSS compile | `node tools/check-app-scss.mjs storefront` | pass — 165 400 bytes CSS |
| SCSS file size | `node tools/check-scss-file-size.mjs <changed stylesheet>` | pass — 347 lines, above the 300 review threshold, under the 400 hard limit |
| Storefront tests | `pnpm --filter @embroidery/storefront test` | **134 suites, 2549 tests, all pass** |
| Storefront build | `pnpm --filter @embroidery/storefront build` | pass |

Live topology exercised: real Admin, real Storefront, real API, real in-process
worker, real Nginx gateway, real disposable PostgreSQL, real disposable object
store.

Not run, and why:

```text
E01 regression        forbidden by the brief; APP12-E01 = NOT_AUTHORIZED
(none — the report-secret checker was run; see the row above)
```

`node tools/check-report-secrets.mjs` → **passed** — 690 documents, 5435 tracked
files, this report included. No token, code, password or connection string
appears anywhere in it.


---

## AD. Roadmap

```text
APP12-U01 = CORRECTION_REQUIRED
U01_BLOCKER = OPERATOR_VARIANT_AUTHORING_UNREACHABLE
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED
NEXT = PO_REVIEW_REQUIRED

ROADMAP_CHECKPOINTS = 39   unchanged, locked
PRODUCTION_DEPLOYED = false
PUSHED = false
E01 executed = false
```

Two decisions belong to the Product Owner before U01 can be re-run:

1. **Who owns variant and SKU authoring.** It is a new operator capability — at
   minimum one HTTP operation that creates a `product_variants` row, plus Admin UI
   for both it and the already-published `adminSku_create`. That is
   implementation work and cannot be absorbed by a correction to U01.
2. **Who owns `IMP-O006`.** It is routed to APP12 and held by none of the 39
   checkpoints. Wave 1 cannot be released without it, regardless of decision 1.

Maximum later correction remains 1. Both items above exceed what a U01 correction
may contain, so U01 should be re-run only after they land.
