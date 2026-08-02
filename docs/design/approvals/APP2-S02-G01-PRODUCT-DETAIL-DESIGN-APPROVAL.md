# APP2-S02-G01 — Storefront Product Detail Reconciliation Approval

**Evidence ID:** `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`
**Date:** 2026-08-02
**Gate:** `APP2-S02-G01` — supplemental design/authority gate under `APP2-S02` ownership
**File:** `BQwqV8GdfUIELvsQDB1UQE` · page `User Interface` (`166:1457`) · section `529:2224`
**Decision:** `IMP-D039`
**Status:** Product Owner reconciliation recorded; ten reconciled Product Detail rows
promoted to `APPROVED_FOR_IMPLEMENTATION`.

---

## 1. Why this record exists

`APP2-S02` was `BLOCKED_BY_UI03_RECONCILIATION`. Two things were missing and neither could
be invented by an implementation checkpoint:

1. **No approved design authority.** UI03 – Studio Work Detail was a Draft, and the four
   `APP2-D01` Product Detail frames were explicitly
   `NOT_APPROVED — WITHHELD_PENDING_UI03_RECONCILIATION`.
2. **No Product Detail browser route.** `/san-pham/<slug>` had been drawn in Figma as a
   *proposal*; `APP2-S01-G01` (IMP-D038) confirmed it was `CHƯA CHỐT` / `NOT_CANONICAL`
   and that a Figma label is not a URL contract.

This gate resolves both. It is **not** `APP2-S02` implementation, and **not** an `APP2-S01`
correction.

---

## 2. The proven contradiction

All twelve UI03 draft roots were audited live before any edit. The draft is a rich studio
narrative; the delivered `APP2-B04` `publicProductDetail` contract returns exactly:

```text
slug · name · description? · category{slug,name} · price{amount,currency}
isDisplayOutOfStock · media[]{url,role} · seo{title?,description?,isIndexable}
```

| # | Drawn in UI03 | Field or operation behind it |
| --- | --- | --- |
| C1 | Metadata line `Xưởng Thêu · 2026 · Thêu tay phối chỉ tơ · 30 × 40 cm` | **none** — no year, technique or dimension field exists |
| C2 | `Bộ sưu tập Kỷ niệm` breadcrumb + chip | **none** — no collection data in any operation |
| C3 | Three story fields `Cảm hứng` / `Ý tưởng` / `Ý nghĩa` | one optional `description` string |
| C4 | `Section / Materials & Craftsmanship` (chips + 5 macro images) | **none** |
| C5 | `Section / Creation Process` (4 steps, 4 images) | **none** |
| C6 | `Section / Related Works` (8 cards + tabs) | **no related-Product operation exists** |
| C7 | `Section / Soft Commission CTA` + mobile `StickyCommissionBar` | **none** |
| C8 | `Lưu cảm hứng` (save/favourite) | **none** — no persistence, no auth |
| C9 | Supporting story image (`SupportingImage / TEMP_ASSET`) | not in `media[]`; `media[]` is the only image source |
| C10 | Fixed 3:4 artwork crop | contract returns **no width/height** |

Price and `isDisplayOutOfStock` **are** returned. They are still not displayed: this page is
a studio Work Detail, not an ecommerce PDP (§4 below).

**The reconciliation removes what the contract cannot feed. It does not create backend
requirements to preserve fictional draft content.**

---

## 3. Route ruling (Product Owner, locked as IMP-D039)

```text
route            /san-pham/[slug]
rendered         /san-pham/<server-owned-product-slug>
slug source      APP2-B04 only; immutable; server-owned
rejected         Product UUID · query-mode detail route · trailing-slash authority
rejected alias   /product/* · /products/* · /catalog/* · /tac-pham/* · /kham-pha/*
unchanged        /kham-pha remains Discover; / remains Homepage-owned
```

This supersedes the former `CHƯA CHỐT` proposal status recorded by `APP2-D01` and
`APP2-S01-G01`. The route came from the Product Owner, not from a Figma label.

**S01 card upgrade.** After `APP2-S02` implementation is accepted, the existing S01 card
`<article>` may become **one** semantic link to `/san-pham/<slug>` without changing masonry,
visible card content or DOM order. Until then S01 cards remain non-interactive (IMP-D038).

---

## 4. Scope decisions

**Commerce.** Although `publicProductDetail` returns `price` and `isDisplayOutOfStock`,
`APP2-S02` displays **no** price, stock, buy-box, cart, rating or SKU. Studio Work Detail,
not PDP.

**Description.** `description` present → exactly one section `Câu chuyện về tác phẩm`.
Absent → the section is omitted cleanly. One description is never split into invented
semantic fields, and no copy is generated to fill it.

**Continue discovery** replaces the unsupported related feed:

```text
Tiếp tục khám phá
  Khám phá tất cả        → /kham-pha
  Khám phá {category.name} → /kham-pha?category={category.slug}
```

No related Product cards, and no extra list request.

**Share.** One browser-local action, `Chia sẻ`: Web Share when available, otherwise copy the
canonical Product URL and announce success. No auth, persistence, SDK or analytics. No
favourite/save.

**Media.** Ordered `media[]` by persisted `display_order`; first available item is the
initial main artwork; thumbnail controls preserve server order; `media = []` renders an
honest placeholder; an individual failure preserves Product text and controls.
`APP2-T01` catalog-preview only — never a private original, never a storage-provider URL,
and no thumbnail fallback.

**Natural ratio.** With no dimensions in the contract, the artwork sits in a neutral bounded
stage with `contain`/natural-ratio behaviour. Universal 3:4 cropping is **not** locked and
width/height are **not** fabricated. The retained 3:4 `TEMP_ASSET` is annotated on-canvas as
an example only.

**Lightbox.** `role=dialog` with an accessible title; focus enters, is trapped, and returns;
Escape closes; previous/next follow media order; the selected position is exposed textually;
controls are ≥44px; reduced motion means an immediate transition; one image → no
previous/next; `media = []` → no lightbox affordance at all.

**Navigation and SEO.**

```text
breadcrumb (desktop/tablet)  Khám phá → /kham-pha
                             {category.name} → /kham-pha?category={category.slug}
                             {name} — current, not linked
mobile                       ← Quay lại Khám phá → /kham-pha
canonical                    /san-pham/{slug}
title                        seo.title ?? name
description                  seo.description ?? description ?? approved generic description
robots.index                 seo.isIndexable
robots.follow                true
```

No invented published date, author, technique, dimensions, collection, rating, availability
schema or price rich-result schema. Product media is **not** used as an OG image until a
social-image policy exists, and no Product structured data is promised by this gate.
`APP2-S02` must remain dynamic/`no-store` so an unpublish cannot leave a stale detail page.

---

## 5. Deliverables

Section `529:2224` — *APP2-S02-G01 / Storefront Product Detail / Reconciled*, a **sibling**
of UI01–UI05 on page `User Interface` at `x = 26180, y = 0`.

| Node | Frame | Size |
| --- | --- | --- |
| `538:3` | 00 – Scope & Source of Truth | 1240×191 |
| `529:2225` | Desktop / Default | 1440×2470 |
| `529:2431` | Tablet / Default | 1024×2063 |
| `529:2575` | Mobile / Default | 390×1674 |
| `532:3` | Desktop / Media Empty | 1440×2317 |
| `532:105` | Mobile / Media Error | 390×1674 |
| `533:3` | Lightbox / Desktop | 1440×900 |
| `533:26` | Lightbox / Mobile | 390×844 |
| `537:3` | Product Detail Contract Handoff | 1240×563 |
| `537:38` | Product Detail State Authority | 1240×319 |

The three viewport defaults were **cloned from the UI03 draft**, so the approved APP1 shell
instances, DS component instances, variables and text styles carry over unchanged; the
deferred sections were then removed and the remaining sections reconciled. The originals
were not touched.

**State authority** (`537:38`) covers initial loading, safe Product not found, `media = []`,
main-media failure, description absent, one image, multiple images, share success and
lightbox open.

---

## 6. Integrity

```text
UI03 draft 261:1290                unmodified, 16 children intact — HISTORICAL_DRAFT_SOURCE
UI01 183:2 · UI02 208:538          unmoved, unresized, unmodified
UI04 298:1568 · UI05 328:1739      unmoved, unresized, unmodified
DS file hsxSjwkqQKM9vuyRgWSesU     not modified
detached instances                 0
new component masters              0
new variables / text styles        0
community components               0
undersized interactive targets     0 (all controls ≥ 44px)
mobile horizontal overflow         0 (the 424px swipe row is clipped inside a 342px strip)
```

The only non-variable colour used is the scrim treatment cloned from the UI03 draft's own
`ZoomOverlay` (`ink 92%`) and its on-scrim control surface (`white 14%`) — the known
**GAP-D02** (the DS has no scrim token). Nothing new was invented for it.

**Two deviations, disclosed not hidden:**

1. The DS `Button` set offers `Primary`/`Secondary`/`Ghost` only, none legible on a dark
   scrim, so the three lightbox controls reuse the draft's own on-scrim 44px control
   treatment rather than a DS Button instance.
2. The Header instance shows a search affordance. That is APP1 approved shell surface, not
   `APP2-S02` scope; this gate does not modify the APP1 shell, and S02 adds no working
   search (`FU-APP2-STOREFRONT-CONTENT-BAND-01`).

---

## 7. Follow-ups routed (both non-blocking)

```text
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
  APP2-B04 publishes no width/height; S02 uses natural-ratio/contain behaviour.

FU-APP2-STOREFRONT-CONTENT-BAND-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
  The APP1 shell max width stays 1200px although source frames draw 1280px.
  The APP1 shell is not altered by this gate.
```

---

## 8. Consequent status

```text
APP2-S02-G01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-S02     = READY — NOT STARTED
APP2-E01     = BLOCKED_BY_APP2-S02
APP2-X01     = BLOCKED_BY_APP2-E01
```

Gated by `pnpm check:storefront-product-detail-authority` and
`pnpm check:figma-design-index`.
