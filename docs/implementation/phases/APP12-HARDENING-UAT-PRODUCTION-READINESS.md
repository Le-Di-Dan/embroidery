# APP12 — Hardening, UAT and Production Readiness

## 0. Roadmap status

```text
ROADMAP_STATUS         = LOCKED
ROADMAP_LOCK           = LOCKED
IMPLEMENTATION_STARTED = true
CHECKPOINTS            = 41
NEXT                   = APP12-N02 (Ready-Made sellability authoring &
                         publication readiness) — AUTHORIZED; N02.G01 PO PASS,
                         internal package N02.D01 COMPLETE —
                         AWAITING_PO_REVIEW (design)
                         APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY
CORRECTION             = PRE_IMPLEMENTATION_AUDIT_C1 (2026-09-01)
                         APP12-G02-C1 (2026-09-01, 1/1 — no C2)
                         APP12-C01-C1 (2026-09-01, 1/1 — no C2)
                         APP12-B01-C1 (2026-09-02, 1/1 — no C2)
                         APP12-B04-C1 (2026-09-02, 1/1 — no C2)
                         APP12-S02-C1 (2026-09-02, 1/1 — no C2)
                         APP12-S03-C1 (2026-09-03, 1/1 — no C2)
                         APP12-A02-C1 (2026-09-03, 1/1 — no C2)
                         APP12-H03-C1 (2026-09-04, 1/1 — no C2)
                         APP12-H04-C1 (2026-09-04, 1/1 — no C2)
                         APP12-H05-C1 (2026-09-04, 1/1 — no C2)
                         APP12-V02-C1 (2026-09-05, 1/2 — Human-PO exception)
                         APP12-V02-C2 (2026-09-05, 2/2 — no C3)
LOCKED_AT              = APP12-P01 entry, 2026-09-01, Product Owner authority
OVERRIDE               = APP12-M01 inserted 2026-09-05 by explicit Human Product
                         Owner override of the 38-checkpoint lock (38 → 39).
                         Sequence: … V01 → V02 → M01 → G03 → U01 → E01 → R01 …
                         Exactly one checkpoint id was created. `APP12-M01.A`
                         (audit) is COMPLETE — PO PASS; `APP12-M01.B`
                         (implementation) is AUTHORIZED and runs as internal work
                         packages, not as new checkpoint ids:
                           M01.B1  rendition / dimensions / effective primary  COMPLETE
                           M01.DB1 invariants and the 20 cap                   COMPLETE
                           M01.B2  published media curation authority          COMPLETE
                           M01.D1  bounded Figma amendment                     COMPLETE_AFTER_C1
                           M01.D1-C1 Admin mobile media management (1/1)       COMPLETE
                           M01.A1  Admin media management UI                   COMPLETE
                           M01.S1  Product Detail visible counter              COMPLETE_AFTER_C1
                           M01.S1-C1 lightbox overlay (1/1)                    COMPLETE
                           M01.E1  cross-boundary acceptance                   COMPLETE_AFTER_C1
                           M01.E1-C1 degraded signal + Figma (1/1)             COMPLETE
                         `APP12-M01 = COMPLETE — PO CLOSED` (2026-09-09).
                         `APP12-G03` was authorized on that closure and is
                         COMPLETE (2026-09-09).

                         APP12-N01 inserted 2026-09-09 by explicit Human Product
                         Owner override (39 → 40). Email-only OTP delivery.
                         Sequence: … G03 → N01 → U01 → E01 → R01 …
                         Internal packages, not new checkpoint ids:
                           N01.B01 OTP leaves the process               COMPLETE
                           N01.S01 email is the verification identity   COMPLETE
                           N01.E01 cross-boundary email acceptance      COMPLETE
                         `APP12-N01 = COMPLETE — PO CLOSED` (2026-09-09).
                         REAL_INBOX_MANUAL = PASS;
                         PHONE_SMS_VERIFICATION_PRESENT = false.

                         APP12-N02 inserted 2026-09-10 by explicit Human Product
                         Owner override (40 → 41). Ready-Made sellability
                         authoring and publication readiness — it owns the
                         `APP12-U01` operator blocker (no delivered operation
                         creates a `product_variants` row; `adminSku_create` has
                         no Admin call site; readiness reports 7/7 green for a
                         Product that can never be bought).
                         Sequence: … G03 → N01 → N02 → U01 → E01 → R01 …
                         Internal packages, not new checkpoint ids:
                           N02.G01 gap audit                   COMPLETE — PO PASS
                           N02.D01 bounded Admin sellability design     COMPLETE
                                   — AWAITING_PO_REVIEW (21 Figma frames,
                                   21 registry rows REVIEW_REQUIRED)
                           N02.B01 variant write authority + criteria   PENDING
                           N02.A01 Admin variant/SKU/stock authoring    PENDING
                           N02.E01 operator authoring acceptance        PENDING
                         `APP12-U01 = SUSPENDED_PENDING_BLOCKER_RECOVERY` until
                         N02 closes; `APP12-E01` / `APP12-R01` NOT_AUTHORIZED.
```

The 41 checkpoints of the accepted C1 roadmap **as amended by the 2026-09-05,
2026-09-09 and 2026-09-10 Product Owner overrides** are immutable. Except through such an explicit
re-planning authority, no APP12 checkpoint ID may be invented, and they may not
be reordered, merged, split or renamed.
Work discovered later is handled only by (1) a correction of the current
checkpoint or (2) a later checkpoint already present in the locked roadmap.
Correction policy is unchanged: **maximum one correction per checkpoint, no
`C2`**.

### 0.0 Category taxonomy — dynamic (Product Owner, C1)

```text
CATEGORY_MODEL = DYNAMIC
ao-thun        = VALID
```

The APP2 four-value set (`thu-bong`, `khan`, `quan-ao`, `khac`) is the **initial
alpha public taxonomy baseline**, not a permanent domain ceiling. APP12
production authority supersedes that limitation so operators can grow the
taxonomy without a code deploy. `categories.slug` stays unique, stable and
format-validated (`^[a-z0-9-]+$`), and remains **immutable once published**.

This supersedes the taxonomy clauses of `IMP-D032` ("closed, provisioned root
set"; "no category HTTP operation is added") and `IMP-D038` ("exactly
`thu-bong`, `khan`, `quan-ao`, `khac`"), recorded by `APP12-P01` as `IMP-D059`
and `D-044`. Their other clauses — slug immutability, `categorySlug` on the
wire, the physical UUID never exposed, `/kham-pha`, the `?category=` key — are
retained.

**Operator management is mandatory (Product Owner, 2026-09-01).**

```text
APP12-C02 = MANDATORY
APP12-A01 = MANDATORY
```

`CATEGORY_MODEL = DYNAMIC` means an operator can grow the production taxonomy
without editing source, editing a migration, mutating the database directly or
deploying the application. A dynamic contract backed only by
migration-provisioned rows does not satisfy that requirement, so the C1 §E
scope option to defer `C02`/`A01` is **withdrawn**; no later checkpoint may drop
either. This is minimum flat taxonomy management, not a taxonomy platform.

### 0.1 Release strategy — Product Owner authority (2026-09-01)

```text
WAVE 1 = READY_MADE / BASE_PRODUCT DIRECT COMMERCE
WAVE 2 = ALL CUSTOM EMBROIDERY
         customer-owned-product embroidery · catalog personalisation
         Design Studio / Editor · custom request intake · manual quotation
         design review and approval · deposit + remaining payment
         custom production and fulfilment
```

Terminology is locked: `READY_MADE_COMMERCE` is not `CUSTOMER_OWNED_PRODUCT`, not
`CUSTOM_REQUEST`, not `CATALOG_PERSONALISATION` and not `DESIGN_STUDIO`.

### 0.2 Bounded scope exception to §5

The Product Owner grants one explicit exception to this phase's "no new business
features" boundary: APP12 **may** implement the minimum production-grade
ready-made / base-product direct commerce capability required for Wave 1, because
Wave 1 cannot exist without it. The exception does **not** authorize marketplace,
promotions, discounts, coupons, wishlist, reviews, loyalty, multi-seller, B2B
ordering, complex merchandising, a third-party payment provider or any broader
ecommerce expansion. Every other §5 restriction remains in force.

### 0.3 Design policy amendment to §3

`NONE` no longer holds for ready-made commerce. One phase-level design package
(`APP12-D01`) is authorized for the ready-made journey **only**, delivered before
its frontend implementation. Unrelated Storefront screens are not redesigned, and
the Runtime Visual & Content UAT remains a defect-correction process rather than
a redesign programme. `PO-APP12-004` additionally grants bounded correction
authority over three contrast-failing design tokens.

### 0.4 Ready-Made lifecycle and shipping-fee authority (C1)

```text
SHIPPING_FEE = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT

AWAITING_SHIPPING_FEE → AWAITING_PAYMENT → READY_FOR_DELIVERY
                      → DELIVERED → COMPLETED
                      (+ ON_HOLD · CANCELLING · CANCELLED)
```

No automatic shipping calculation, no carrier quote, no fabricated flat rate. The
redundant `PAID` order state is removed — payment truth lives in the `FULL`
obligation, whose satisfaction is the authoritative transition to
`READY_FOR_DELIVERY`. A fee change while `FULL` is `PENDING` supersedes that
obligation and creates a successor; a fee edit after `FULL` is `SATISFIED` is
refused and requires the explicit cancellation/refund authority. Inventory is
reserved at durable order creation with an expiry; on expiry the reservation is
released, the order is cancelled and later payment verification is refused.

### 0.5 Roadmap authority

- [`APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md`](../reports/APP12-PRE-IMPLEMENTATION-AUDIT-C1-COMPLETION-REPORT.md)
  — the **accepted and now locked** roadmap (§Q, 38 checkpoints), dynamic category
  architecture (§C–§E), shipping-fee authority (§F), corrected lifecycle (§G),
  reservation expiry (§H), route model (§I), checkpoint splits (§J–§O),
  follow-up ownership (§P).
- [`APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md`](../reports/APP12-PRE-IMPLEMENTATION-AUDIT-PO-RECONCILIATION-REPORT.md)
  — retained. Ready-Made gap analysis (§Z4) and target journey (§Z5) stand; its
  §Z9 32-checkpoint roadmap is `SUPERSEDED_BY_PRE_IMPLEMENTATION_AUDIT_C1`.
- [`APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](../reports/APP12-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md)
  — retained evidence record. Its §T 20-checkpoint roadmap is
  `SUPERSEDED_BY_PO_APP12_READY_MADE_WAVE1_DECISION`.

```text
PO-APP12-001 … PO-APP12-006 = ALL RESOLVED
NEW_PO_DECISION_REQUIRED    = NONE
PO_INPUT_REQUIRED_BEFORE_R01 = canonical store address, opening hours, phone, e-mail
```

### 0.5a Release-wave authority (`APP12-G01`)

Wave ownership and release exposure are locked by
[`../APP12-RELEASE-WAVE-AUTHORITY.md`](../APP12-RELEASE-WAVE-AUTHORITY.md):
the Storefront route matrix, the 128-operation API ownership inventory
(31 of 43 public operations `DENY` in Wave 1), the fail-closed release-exposure
policy, the staff/Admin posture, the `RELEASE_ISOLATION != SEO_ISOLATION`
distinction, and the exact block/allow input `APP12-G02` implements. A
checkpoint that adds a customer-facing surface adds a row there; it does not
invent a local rule.

```text
G01 = docs / tooling / test-governance only
      no runtime, no release gate, no UAT data, no Docker rebuild
```

APP12 scoped validation authority — the change-type validation table, the active
file-size rule and the release-gate test classification — is
[`../VALIDATION_GOVERNANCE.md`](../VALIDATION_GOVERNANCE.md) §3A.

### 0.6 Locked structure (C1, accepted 2026-09-01)

```text
Wave 0   P01 · G01 · G02 · G03 · D01 · DB01
         C01 · C02 · C03 · A01
         B01 · B02 · B03 · B04 · B05
         S01 · S02 · S03 · A02
Wave 1   H01 · H02 · H03 · H04 · H05 · H06 · H07 · H08
         V01 · V02 · U01 · E01
R01      Ready-Made GO / NO-GO
Wave 2   W01 · W02 · W03 · W04
R02      Custom Embroidery GO / NO-GO
X01      Final APP12 closure
```

Namespace semantics: `Pxx` product/document authority · `Gxx` governance and
readiness · `Cxx` contract/category authority · `DBxx` database change control ·
`Dxx` design · `Bxx` backend · `Sxx` Storefront UI · `Axx` **Admin UI only** ·
`Hxx` hardening and release quality (**including accessibility, `H08`**) · `Vxx`
runtime visual/content UAT · `Uxx` business UAT · `Exx` cross-boundary
regression · `Rxx` release gate · `Xxx` closure.

### 0.7 Ready-Made commerce authority (`APP12-P01`)

Product and domain authority for Ready-Made direct commerce and the dynamic
category model is locked by `APP12-P01` in the canonical product documents —
`docs/01-PRODUCT-REQUIREMENTS.md` §14, `docs/03-USER-JOURNEYS.md` J11–J14,
`docs/04-BUSINESS-RULES.md` `BR-021`..`BR-038`,
`docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §12, `docs/07-ADMIN-OPERATIONS.md` §13,
`docs/12-DECISION-LOG.md` `D-043`/`D-044` and the implementation register
`IMP-D058`/`IMP-D059`. Summary of the locked values every later checkpoint
inherits and may not re-decide:

```text
BUYABLE_SUBJECT   = SKU              (Product → Product Variant → SKU)
UNIT_PRICE        = COALESCE(skus.price_override_amount,
                              products.base_price_amount)   currency VND
CHECKOUT_MODEL    = SINGLE_PRODUCT_DIRECT_CHECKOUT   (no cart, no account)
ROUTES            = /san-pham/[slug] · /mua-hang/[slug] · /truy-cap/don-hang
IDENTITY          = APP4 contact verification reused as a shared primitive
SHIPPING_FEE      = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT
PAYMENT_KIND      = FULL             (one obligation, manual transfer + QR)
PRODUCTION        = SKIPPED          (no production job for READY_MADE)
ORDER_ORIGIN      = CUSTOM | READY_MADE   (exactly one branch)
SECURE_SURFACE    = ORDER_ACCESS     (order-scoped secure-access authority)
RESERVATION       = created at durable order creation
                    READY_MADE_INITIAL_RESERVATION_WINDOW = 24 hours
                    READY_MADE_PAYMENT_RESERVATION_WINDOW = 24 hours
                    CUSTOM reservations stay no-expiry (PO-APP8-002)
```

`APP12-P01` is documentation authority only: it changed no runtime source, no
migration, no OpenAPI, no generated client, no Figma, no category data.

### 0.9 Category lifecycle scope and deferred transitions (Product Owner, `APP12-C03`)

The category lifecycle delivered in APP12 is, and remains:

```text
DRAFT -> PUBLISHED -> ARCHIVED
```

`LC-04` additionally authorises `ARCHIVED -> PUBLISHED` (relist) and
`DRAFT -> ARCHIVED`. Neither is delivered in APP12, and `APP12-C02` correctly
refuses both. The Product Owner has ruled on the follow-up that recorded the
gap:

```text
FU-APP12-C02-01 = NONBLOCKING_DEFERRED_PRODUCT_DECISION
OWNER           = POST_APP12_PRODUCT_BACKLOG
```

Not ownerless, and not an APP12 checkpoint. The reason is that a relist is a
product question before it is an engineering one — what becomes of the products
left behind under an archived category has no answer in any current business
rule — and answering it inside APP12 would expand a locked 38-checkpoint scope
for something Wave-1 production readiness does not need.

`FU-APP12-C02-02` (audit and outbox rows left in the **development** database by
C02's live run, which the append-only triggers correctly refuse to delete) is
development-environment audit history. It is informational, owned by the same
backlog, and is not a release blocker.

No APP12 checkpoint may implement either transition without a new Product Owner
ruling recorded here.

### 0.8 Canonical checkpoint status

Exactly one checkpoint may be `NEXT`. Statuses come from
[`../11-TRACEABILITY-AND-STATUS-MATRIX.md`](../11-TRACEABILITY-AND-STATUS-MATRIX.md) §3.

| # | ID | Name | Status |
|---|---|---|---|
| 1 | `APP12-P01` | Ready-Made and dynamic-category product/documentation authority | `COMPLETE` |
| 2 | `APP12-G01` | Wave scope, release-exposure policy and governance reconciliation | `COMPLETE` |
| 3 | `APP12-G02` | Wave-2 release isolation gate | `COMPLETE_AFTER_C1` |
| 3·C1 | `APP12-G02-C1` | Wave-2 customer CTA suppression | `COMPLETE` |
| 4 | `APP12-D01` | Ready-Made commerce design package | `COMPLETE` |
| 5 | `APP12-DB01` | Order origin, Ready-Made lifecycle, FULL obligation, ORDER_ACCESS, reservation expiry | `COMPLETE` |
| 6 | `APP12-C01` | Dynamic public category contract and inventory read | `COMPLETE_AFTER_C1` |
| 6·C1 | `APP12-C01-C1` | Database category source-of-truth correction | `COMPLETE` |
| 7 | `APP12-C02` | Admin category management authority (**MANDATORY**) | `COMPLETE` |
| 8 | `APP12-A01` | Admin category management UI (**MANDATORY**) | `COMPLETE` |
| 9 | `APP12-C03` | Storefront dynamic category discovery, breadcrumb, CTA, sitemap, gate reconciliation | `COMPLETE` |
| 10 | `APP12-G03` | Representative UAT dataset | `COMPLETE` (2026-09-09) — authorized on the M01 PO closure. 4 published dynamic categories, 7 published Ready-Made Products, 47 real processed images (1/8/20), 16 variants, 14 SKUs, both price paths, in/low/out-of-stock. `G03_PERSISTENT_UAT_DATA = READY`, `G03_DATA = UAT_ONLY`. Manifest [`evidences/APP12-G03-UAT-DATA-MANIFEST.md`](../evidences/APP12-G03-UAT-DATA-MANIFEST.md), report [`reports/APP12-G03-COMPLETION-REPORT.md`](../reports/APP12-G03-COMPLETION-REPORT.md) |
| 11 | `APP12-B01` | Public purchasable SKU projection | `COMPLETE_AFTER_C1` |
| 11·C1 | `APP12-B01-C1` | Dev data provenance cleanup | `COMPLETE` |
| 12 | `APP12-B02` | Ready-Made order creation and reservation | `COMPLETE` |
| 13 | `APP12-B03` | Admin shipping fee, total freeze, FULL obligation lifecycle | `COMPLETE` |
| 14 | `APP12-B04` | ORDER_ACCESS read and FULL payment composition | `COMPLETE_AFTER_C1` |
| 14·C1 | `APP12-B04-C1` | Machine-readable Ready-Made termination reason | `COMPLETE` |
| 15 | `APP12-B05` | Admin FULL verification and origin-aware fulfilment | `COMPLETE` |
| 16 | `APP12-S01` | Product Detail purchase state | `COMPLETE` |
| 17 | `APP12-S02` | Ready-Made checkout `/mua-hang/[slug]` | `COMPLETE_AFTER_C1` |
| 17·C1 | `APP12-S02-C1` | Pre-hydration checkout safety | `COMPLETE` |
| 18 | `APP12-S03` | Secure order surface `/truy-cap/don-hang` | `COMPLETE_AFTER_C1` |
| 18·C1 | `APP12-S03-C1` | `ORDER_ACCESS` notification routing | `COMPLETE` |
| 19 | `APP12-A02` | Admin Ready-Made order branch UI | `COMPLETE_AFTER_C1` |
| 19·C1 | `APP12-A02-C1` | Origin-aware Admin order read and Ready-Made Admin UI | `COMPLETE` |
| 20 | `APP12-H01` | Authorization and security audit (Wave 1) | `COMPLETE` |
| 21 | `APP12-H02` | Production deployment and configuration readiness | `COMPLETE` |
| 22 | `APP12-H03` | Observability and alerting (build) | `COMPLETE_AFTER_C1` |
| 22·C1 | `APP12-H03-C1` | Worker runtime policy, Ready-Made event compatibility and outbox normal path | `COMPLETE` |
| 23 | `APP12-H04` | Resilience and failure rehearsal (Wave 1) | `COMPLETE_AFTER_C1` |
| 23·C1 | `APP12-H04-C1` | Startup safety, graceful drain and object-storage failure correction | `COMPLETE` |
| 24 | `APP12-H05` | Performance and CWV measurement (Wave 1) | `COMPLETE_AFTER_C1` |
| 24·C1 | `APP12-H05-C1` | Intrinsic media dimensions and desktop grid CLS correction | `COMPLETE` |
| 25 | `APP12-H06` | SEO and public readiness (Wave 1) | `COMPLETE` |
| 26 | `APP12-H07` | Operational runbooks (Wave 1) | `COMPLETE` |
| 27 | `APP12-H08` | Accessibility and compatibility (Wave 1) | `COMPLETE` |
| 28 | `APP12-V01` | Runtime Visual & Content UAT — audit | `COMPLETE` |
| 29 | `APP12-V02` | Runtime Visual & Content corrections and live re-verification | `COMPLETE_AFTER_C2` |
| 29·C1 | `APP12-V02-C1` | i18n copy authority and Admin login reflow correction | `COMPLETE` |
| 29·C2 | `APP12-V02-C2` | Media upload, processing and image delivery reliability correction | `COMPLETE` |
| 29·M | `APP12-M01` | Product multi-image gallery (PO override, 2026-09-05) — stage A audit / stage B implementation | **`IMPLEMENTATION_IN_PROGRESS`** — `M01.A` AUDIT_COMPLETE (PO PASS); `M01.B1` COMPLETE; `M01.DB1` COMPLETE (migration `0039`, four `product_media` invariants, `MAX_PRODUCT_MEDIA_ITEMS = 20`); `M01.B2` COMPLETE (one bounded Admin media-only write, `adminProductMedia_replace`, published-Product curation without unpublishing); `M01.D1` COMPLETE_AFTER_C1 (18 frames on Figma page `APP_12` section `933:187`; primary anchored at position 0, no stage arrows, multi-select picker kept) + `M01.D1-C1` COMPLETE (correction 1/1 — Admin 390 media management, 7 frames, 20-image grid 1,938 px against 3,748 px in approved `438:90`; 25 registry rows now `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP12-M01-D1-PO-001`); `M01.A1` COMPLETE (Admin media grid at 1440/1024/390, primary anchored at position 0 with an explicit set-primary, the 20 cap enforced in the section and the picker, the whole-form PUBLISHED lock narrowed so commercial fields stay read-only while media curates through `adminProductMedia_replace`, five B2 refusals mapped to approved Vietnamese; eight live headed journeys against a disposable database carrying real WebP derivatives); internal next `M01.S1` |
| 29·N1 | `APP12-N01` | Email-only OTP delivery (PO override, 2026-09-09, 39 → 40) | `COMPLETE — PO CLOSED` (2026-09-09) — `N01.B01` / `N01.S01` / `N01.E01` all PO PASS; `REAL_INBOX_MANUAL = PASS`, `OTP_FROM_REAL_INBOX_VERIFIED = true`, `PHONE_SMS_VERIFICATION_PRESENT = false`. Reports [`reports/APP12-N01-B01-COMPLETION-REPORT.md`](../reports/APP12-N01-B01-COMPLETION-REPORT.md), [`reports/APP12-N01-S01-COMPLETION-REPORT.md`](../reports/APP12-N01-S01-COMPLETION-REPORT.md), [`reports/APP12-N01-E01-COMPLETION-REPORT.md`](../reports/APP12-N01-E01-COMPLETION-REPORT.md), manual [`reports/APP12-N01-REAL-INBOX-MANUAL-REPORT.md`](../reports/APP12-N01-REAL-INBOX-MANUAL-REPORT.md). Closes `FU-APP12-U01-NOTIFICATION-PROVIDER`. |
| 29·N2 | `APP12-N02` | Ready-Made sellability authoring & publication readiness (PO override, 2026-09-10, 40 → 41) | **`DESIGN_REVIEW_REQUIRED`** — `N02.G01` COMPLETE — **PO PASS** ([`reports/APP12-N02-G01-COMPLETION-REPORT.md`](../reports/APP12-N02-G01-COMPLETION-REPORT.md)): 0 operations write `product_variants`, `adminSku_create` has 0 Admin call sites, `ProductPublicationSnapshot` carries no variant/SKU/stock fact, `/kho/skus/{skuId}` is linked only from an order row, and 2 PUBLISHED Products in the shared dev world are already structurally unbuyable. `N02.D01` COMPLETE — AWAITING_PO_REVIEW ([`reports/APP12-N02-D01-COMPLETION-REPORT.md`](../reports/APP12-N02-D01-COMPLETION-REPORT.md)): 21 Figma frames on page `APP_12` section `968:187` and 21 registry rows `REVIEW_REQUIRED` (`FIGMA_DESIGN_INDEX.md` §4.14, 592 → 613); a bounded `Phiên bản & SKU` capability inside `/products/{productId}` with no DELETE at any state, readiness drawn at 10 criteria in five states (including 10/10 with stock 0), PUBLISHED recovery without unpublishing, and a truthful structural-unsellability warning that is never labelled sold-out. Two preflight findings changed the design: `AdminProductDetailResponse` carries **no** `variants`/`skus` (so B01 owns 3 new operations, and the public slug-keyed read may not be reused), and `priceOverrideAmount` accepts `"0"`, giving `SKU_PRICE_RESOLVABLE` a **standalone** failure while `PRODUCT_PRICE_READY` stays green. Runtime/DB/OpenAPI changes 0. Internal next `N02.B01` — NOT_AUTHORIZED until PO approves D01. |
| 30 | `APP12-U01` | Wave 1 Ready-Made business UAT | **`CORRECTION_REQUIRED`** → `SUSPENDED_PENDING_BLOCKER_RECOVERY` — executed 2026-09-09 ([`reports/APP12-U01-COMPLETION-REPORT.md`](../reports/APP12-U01-COMPLETION-REPORT.md)). Blocker 1 (operator cannot make a Product sellable) is owned by `APP12-N02`; blocker 2 (no channel reaches a customer) was closed by `APP12-N01`. Re-entry as `APP12-U01-C1` on the criteria in `APP12-N02-G01` §Q. |
| 31 | `APP12-E01` | Wave 1 commerce regression, positive and negative | `NOT_STARTED` |
| 32 | `APP12-R01` | **WAVE 1 RELEASE GATE** — Ready-Made GO / NO-GO | `NOT_STARTED` |
| 33 | `APP12-W01` | Custom lifecycle UAT excluding Editor deep interaction | `NOT_STARTED` |
| 34 | `APP12-W02` | Editor functional deep UAT | `NOT_STARTED` |
| 35 | `APP12-W03` | Editor runtime visual / UI-UX / accessibility / mobile / resilience | `NOT_STARTED` |
| 36 | `APP12-W04` | Full Custom Embroidery cross-boundary regression | `NOT_STARTED` |
| 37 | `APP12-R02` | **WAVE 2 RELEASE GATE** — Custom Embroidery GO / NO-GO | `NOT_STARTED` |
| 38 | `APP12-X01` | Final APP12 closure | `NOT_STARTED` |

Deliverable detail, dependencies and per-checkpoint API/migration/route deltas
remain in the C1 report §Q; this table is the status record only.

```text
WAVE_1_GO = NOT_DECLARED
WAVE_2_GO = NOT_DECLARED
```

Actual production deployment remains a separately authorized operational action
after either release gate.

Sections 1–9 below remain the locked phase authority, amended only by §0.2 and
§0.3; §6 stays as the pre-audit candidate record.

## 1. Outcome

Prove that the feature-complete system is secure, observable, recoverable, performant, accessible, operationally documented, and acceptable to business users before production approval.

## 2. Dependencies

APP0–APP11 complete; deployment environment and operational owners available.

## 3. Design policy

Classification: `NONE` for new product design. Only approved defect corrections are allowed. Material redesign requires a separate approved design change, not hidden hardening work.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Security and authorization audit.
- Upload/private asset abuse review.
- Payment/provider failure rehearsal.
- Performance/load/query validation at representative scale.
- Worker resilience/dead-letter/manual-review rehearsal.
- Observability dashboards/alerts/log redaction.
- Backup/restore and disaster recovery evidence inherited/verified for release.
- Accessibility, responsive, browser/device and SEO audit.
- UAT by roles and critical journeys.
- Deployment, rollback, incident and Admin runbooks.
- Production configuration/secret validation.
- Final regression and release candidate manifest.

## 5. Out of scope

- New business features.
- Broad visual redesign.
- Silent scope expansion to fix UAT preferences.
- Production launch without explicit approval.
- Claims of SLA/RPO/RTO beyond measured/approved evidence.

## 6. Candidate engineering checkpoints (pre-audit record)

> **Superseded pending lock.** These candidates were reconciled by the
> pre-implementation audit (KEEP / MERGE / SPLIT / REMOVE / REORDER / RENAME per
> candidate — see the audit report §S). They are retained here as the pre-audit
> record. The proposed replacement roadmap is in the audit report §T and is
> `PROPOSED_FOR_PO_LOCK`; neither set is executable before Product Owner
> acceptance.

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP12-H01 — Authorization and security audit:** Audit endpoint/screen matrix, object ownership, secure grants, uploads, sessions, rate limits, secrets and redaction.
- **APP12-H02 — Performance and scalability validation:** Run representative API, SSR, DB, asset and worker workloads; fix only evidence-backed bottlenecks through separate checkpoints.
- **APP12-H03 — Resilience and failure rehearsal:** Exercise provider outage, duplicate callbacks, worker failure, poison jobs, storage errors and recovery/manual review.
- **APP12-H04 — Observability and alerting:** Complete metrics, logs, traces/correlation, dashboards and actionable alerts for critical journeys.
- **APP12-H05 — Accessibility and compatibility audit:** Audit keyboard, screen reader-critical paths, contrast, mobile, supported browsers and editor interactions.
- **APP12-H06 — SEO and public performance audit:** Validate crawl/index rules, metadata, structured data, Core Web Vitals-oriented budgets and cache behavior.
- **APP12-H07 — Operational runbooks:** Finalize deployment, migration, rollback, backup/restore, incident, payment reconciliation, worker/manual-review and Admin procedures.
- **APP12-U01 — Role-based UAT:** Execute approved scripts for Admin, customer and operational roles; defects become bounded correction checkpoints.
- **APP12-E01 — Full commerce regression:** Catalog → Studio → verification → request → review → quote → deposit → order → production → remaining payment → fulfillment → completion.
- **APP12-E02 — Negative/recovery regression:** Authorization denial, duplicate submit/callback, expired link, invalid design, stock race, provider outage and worker retry.
- **APP12-X01 — Production candidate closure:** Create release manifest, exact evidence, known limitations, rollback plan and explicit go/no-go decision request.

## 7. Critical end-to-end journey

The complete commerce journey and major negative/recovery journeys pass in a production-like environment. Operational staff can diagnose and recover defined failures using runbooks without unsafe database manipulation.

## 8. Exit gate

- All blocking security/UAT defects closed.
- Critical regression passes.
- Backup/restore and rollback evidence is current.
- Alerts/runbooks are actionable.
- No production claim exceeds evidence.
- Explicit production approval remains required.

## 9. Handoff

After APP12 PASS, the system is a Production Candidate. Actual production deployment is a separate authorized operational action.
