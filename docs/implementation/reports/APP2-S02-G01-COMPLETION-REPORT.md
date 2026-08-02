# APP2-S02-G01 — Completion report

**Checkpoint:** `APP2-S02-G01` — reconcile draft UI03 with the delivered `APP2-B04`
Product-detail contract, lock the public Product-detail browser route, and create approved
responsive implementation authority for `APP2-S02`.
**Date:** 2026-08-02 · **Branch:** `production` · **Verdict:** `PASS`
**Type:** supplemental design/authority gate. No application source changed.

---

## A. Preflight

```text
APP2_S02_G01_PREFLIGHT = PASS
```

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` at entry | `7fe835bb6905c08c2a10395f3b161bc7596014a3` |
| Entry HEAD subject | `docs(app2): record Storefront Product List evidence` (3 files, +555 −3) |
| `git status --short` | empty (clean tracked + staged) |
| Accepted history | `4051bb9` and `b968194` present and unmodified |
| Ignored `evidences/` | untouched, unstaged, unclaimed |
| Pushed | nothing — 58 commits ahead of `origin/production` at entry |
| S02/E01/X01 implementation | none present |

Preflight gates, all green before any edit: `check:secrets` (358 documents / 1754 tracked
files), `check:lifecycle` (LC-04 5 transitions), `check:pagination-authority` +
14 regressions, `check:storefront-route-authority` + 22 regressions,
`check:figma-design-index` (72 registry IDs / 72 node rows / 9 tables) + 31 regressions,
`check:openapi`, `check:api-client`, `db:check:manifest`, `git diff --check`, and
`pnpm quality` (exit 0).

**One preflight interruption, disclosed:** the Figma MCP server had disconnected between
sessions, so the live audit and every write in §C were impossible at first. §4 of the
checkpoint forbids substituting a docs-only approval for the design reconciliation, so no
Git edit was made until access was restored through the OAuth flow and `use_figma`,
`get_metadata` and `get_screenshot` were confirmed working against the canonical file.

---

## B. Original UI03 audit (live, before any edit)

All twelve required roots were opened live in `BQwqV8GdfUIELvsQDB1UQE`. All exist, all sit
inside section `261:1290`, which is a direct child of page `User Interface` (`166:1457`) and
a sibling of UI01/UI02/UI04/UI05.

| Node | Name | Size |
|---|---|---|
| `261:1290` | UI03 – Studio Work Detail – Draft (SECTION, 16 children) | 4880×8260 |
| `262:1291` | Desktop / Draft | 1440×6078 |
| `273:1409` | Tablet / Draft | 1024×5728 |
| `279:1504` | Mobile / Draft | 390×4137 |
| `283:1528` | 04 – Hero Gallery & Interaction States | 1240×1463 |
| `290:1533` | 05 – Related Discovery States | 1240×1405 |
| `291:1567` | 06 – Loading, Empty & Error States | 1240×1375 |
| `292:1568` | 07 – Responsive Notes | 1240×451 |
| `292:1582` | 08 – Accessibility Notes | 1240×615 |
| `293:1568` | 09 – DS Usage Audit | 1240×613 |
| `294:1568` | 10 – Content & Asset Audit | 1240×529 |
| `294:1588` | 11 – Placement & Integrity Audit | 1240×467 |

Confirmed at audit time: UI03 is still Draft; every image is `TEMP_ASSET` and every string
`PROVISIONAL_COPY` (board `294:1568` lists both explicitly); UI01 `183:2` and UI02 `208:538`
are unchanged at `x = 0` and `x = 5160`; and **no hidden approved authority appeared** — the
only Product Detail rows in the registry were the four `APP2-D01` frames, still
`NOT_APPROVED — WITHHELD_PENDING_UI03_RECONCILIATION`.

Draft desktop composition: `Header`, `Breadcrumb`, `Immersive Work Hero`, `Story`,
`Materials & Craftsmanship`, `Creation Process`, `Related Works`, `Soft Commission CTA`,
`Footer` — plus, on mobile only, `StickyCommissionBar / Default`.

---

## C. B04 contract audit and the proven contradiction

`publicProductDetail` (`GET /api/public/products/:slug`) returns exactly:

```text
slug · name · description? · category{slug,name} · price{amount,currency}
isDisplayOutOfStock · media[]{url,role} · seo{title?,description?,isIndexable}
```

with `media[]` in persisted `display_order`, relative `APP2-T01` catalog-preview URLs,
possibly empty; unknown/`DRAFT`/`ARCHIVED`/non-public-category all returning the **same**
safe 404; `no-store`; and no `publishedAt`, no image dimensions, no material/technique/
process/story-subfield data, no related-Product operation and no collection data.

| # | Drawn in UI03 | Field or operation behind it |
|---|---|---|
| C1 | `Xưởng Thêu · 2026 · Thêu tay phối chỉ tơ · 30 × 40 cm` | **none** |
| C2 | `Bộ sưu tập Kỷ niệm` breadcrumb + hero chip | **none** |
| C3 | `Cảm hứng` / `Ý tưởng` / `Ý nghĩa` | one optional `description` |
| C4 | Materials & Craftsmanship (chips + 5 macro images) | **none** |
| C5 | Creation Process (4 steps, 4 images) | **none** |
| C6 | Related Works (8 cards + tabs) | **no related operation exists** |
| C7 | Soft Commission CTA + mobile sticky bar | **none** |
| C8 | `Lưu cảm hứng` (save/favourite) | **none** |
| C9 | Story supporting image | not in `media[]` |
| C10 | Fixed 3:4 artwork crop | **no width/height returned** |

Price and `isDisplayOutOfStock` *are* returned — and are deliberately not displayed.

---

## D. Route ruling (IMP-D039)

```text
route          /san-pham/[slug]
rendered       /san-pham/<server-owned-product-slug>
slug           from APP2-B04 only; immutable; server-owned
rejected       Product UUID · query-mode detail route · trailing-slash authority
rejected alias /product/* · /products/* · /catalog/* · /tac-pham/* · /kham-pha/*
unchanged      /kham-pha = Discover; / = Homepage
```

This supersedes the `CHƯA CHỐT` proposal status. After `APP2-S02` is accepted, the existing
S01 card `<article>` may become **one** link to `/san-pham/<slug>` without changing masonry,
visible card content or DOM order; until then IMP-D038 keeps S01 cards non-interactive.

---

## E. Supported / deferred matrix

**Supported and drawn:** APP1 shell · breadcrumb (desktop/tablet) and
`← Quay lại Khám phá` (mobile) → `/kham-pha` · image-led hero with ordered gallery and
thumbnails · keyboard-accessible selection · accessible lightbox · `name` as H1 · category
identity · **one** description section `Câu chuyện về tác phẩm` · media loading/empty/error
states · browser-local `Chia sẻ` · `Tiếp tục khám phá` into Discover.

**Deferred (no field, no operation):** year · technique label · dimensions · collection
membership · separate `Cảm hứng`/`Ý tưởng`/`Ý nghĩa` · materials and techniques · craft
macro taxonomy · four-step process · related tabs/cards/recommendations · save/favourite ·
commission actions · soft-commission CTA · mobile commission sticky bar ·
price/stock/buy-box/cart/rating/SKU · working global search.

**Story.** `description` present → one section; absent → the section is omitted cleanly.
Never split into invented sub-fields, never generated.

**Commerce.** Studio Work Detail, not an ecommerce PDP. No price, stock or buying control.

**Related.** Replaced by `Tiếp tục khám phá`: *Khám phá tất cả* → `/kham-pha`,
*Khám phá {category.name}* → `/kham-pha?category={category.slug}`. No related cards and no
extra list request.

**Share.** One browser-local action — Web Share when available, otherwise copy the canonical
URL and announce success. No auth, persistence, SDK or analytics. No favourite/save.

---

## F. Gallery, media and lightbox contract

Ordered `media[]` by persisted `display_order`; first available item is the initial main
artwork; thumbnail controls preserve server order; `media = []` renders an honest
placeholder; an individual failure preserves Product text and controls; catalog-preview
only; no thumbnail fallback, no private original, no storage-provider URL.

Because the contract has no dimensions, the artwork uses a **neutral bounded stage with
`contain`/natural-ratio behaviour**. Universal 3:4 cropping is not locked and width/height
are not fabricated; the retained 3:4 `TEMP_ASSET` is annotated on-canvas as an example only.

Lightbox: `role=dialog` · accessible title · focus enters/traps/returns · Escape closes ·
previous/next follow media order · selected position exposed textually · 44px controls ·
reduced-motion immediate transition · one image → no previous/next · `media = []` → no
lightbox affordance.

---

## G. Navigation and SEO authority

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
schema or price rich-result schema. Product media is not used as an OG image until a
social-image policy exists, and no Product structured data is promised here. `APP2-S02` must
remain dynamic/`no-store` so an unpublish cannot leave a stale detail page.

---

## H. Figma deliverables

Section **`529:2224`** — *APP2-S02-G01 / Storefront Product Detail / Reconciled*, page
`User Interface` (`166:1457`), sibling of UI01–UI05 at `x = 26180, y = 0`, sized 10080×2970.

| Node | Frame | Size |
|---|---|---|
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

**Method.** The three viewport defaults were **cloned from the UI03 draft**, so the approved
APP1 shell instances, DS component instances, variables and text styles carry over
unchanged; the five deferred sections were then removed and the remainder reconciled. The
originals were never touched. Removed from the clones, with the exact text recorded at
removal: the metadata line, `Tạo một tác phẩm tương tự`, `Lưu cảm hứng`, `StoryBlock / Ý
tưởng`, `StoryBlock / Ý nghĩa`, the `Cảm hứng` eyebrow, `StoryMedia`/`SupportingImage`, and
on mobile `StickyCommissionBar / Default`.

**Reviewed by screenshot** at desktop, mobile, media-empty and both lightboxes. Desktop
reads header → breadcrumb → media stage → thumbnails → category chip → H1 → `Chia sẻ` →
`Câu chuyện về tác phẩm` → `Tiếp tục khám phá` → footer. Media Empty drops the thumbnail
strip and the zoom hint entirely while keeping every text element and both discover links.

**State authority** (`537:38`) covers all nine required states: initial loading, safe
Product not found, `media = []`, main-media failure, description absent, one image, multiple
images, share success, lightbox open.

---

## I. Responsive, accessibility and DS integrity

```text
Desktop 1440  full shell · central bounded stage · thumbnail row · H1 + category
              · single-column story measure · Discover continuation
Tablet 1024   compact shell · central stage · thumbnail row · single-column story
Mobile 390    24px gutter · 342px content · horizontal swipe thumbnails · one column
              · no sticky commission bar
```

```text
undersized interactive targets   0 (measured across all five page frames + both lightboxes)
mobile horizontal overflow       0 (the 424px swipe row is clipped inside a 342px strip
                                    whose own frame also clips)
detached instances               0
new component masters            0
new variables / text styles      0
community components             0
UI01 183:2 · UI02 208:538        unmoved, unresized, unmodified
UI04 298:1568 · UI05 328:1739    unmoved, unresized, unmodified
UI03 261:1290                    unmodified, 16 children intact
DS file hsxSjwkqQKM9vuyRgWSesU   not modified
```

Component instances in the new section resolve to existing DS sets only: `Header` ×5,
`Footer` ×3, `Button` ×15, `Chip` ×5, `SectionHeader` ×6.

**Two deviations, disclosed rather than hidden.**

1. **Lightbox controls are not DS `Button` instances.** The DS `Button` set offers
   `Style = Primary | Secondary | Ghost`; on a near-black scrim the Ghost variant rendered
   as invisible dark-on-dark and the filled variants as heavy white slabs — verified by
   screenshot, not assumed. The three controls therefore reuse the UI03 draft's own
   approved on-scrim treatment (44×44, `white @14%` surface, white glyph, from
   `283:1577`/`283:1579`). No new colour was invented; the underlying scrim gap is the
   already-recorded **GAP-D02** (the DS has no scrim token).
2. **The Header instance shows a search affordance.** That is approved APP1 shell surface,
   not `APP2-S02` scope. This gate does not alter the APP1 shell, and S02 adds no working
   search — consistent with the checkpoint's "no working global search".

---

## J. Registry, approval and decision delta

| | Before | After |
|---|---|---|
| Registry IDs | 72 | **86** |
| Node rows | 72 | **86** |
| Registry tables | 9 | **11** |

Added: 10 reconciled rows (§4.5.1, all `APPROVED_FOR_IMPLEMENTATION`) and 4 UI03 draft rows
(§4.5.2, `REFERENCE_ONLY` — `HISTORICAL_DRAFT_SOURCE — NOT_IMPLEMENTATION_AUTHORITY`).
Changed: the four `APP2-D01` Product Detail rows `REVIEW_REQUIRED` → `REFERENCE_ONLY` with
the same historical label. Nothing was deleted.

**A note on `Status` values.** `HISTORICAL_DRAFT_SOURCE` is not a member of the registry's
allowed `Status` set, so it is carried in the `Approval Evidence` column exactly as the
prior withheld label was, with `Status = REFERENCE_ONLY` — which is also what frees the
canonical composite key (`Storefront | … | Product Detail | Default | Desktop 1440`) for the
new approved row. Leaving the old rows at `REVIEW_REQUIRED` would have produced a duplicate
canonical composite.

Approval: **`FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`** —
[`approvals/APP2-S02-G01-PRODUCT-DETAIL-DESIGN-APPROVAL.md`](../../design/approvals/APP2-S02-G01-PRODUCT-DETAIL-DESIGN-APPROVAL.md).
It states the route, the contract, the media rendition and that the deferred draft sections
are outside S02.

Decision: **`IMP-D039`**, `LOCKED`, the next actual ID after `IMP-D038`.

---

## K. Follow-ups routed (neither blocking)

```text
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
FU-APP2-STOREFRONT-CONTENT-BAND-01 = ROUTED — NONBLOCKING_FOR_APP2-S02
```

The first records that `APP2-B04` publishes no width/height, so S02 uses natural-ratio/
contain behaviour. The second records that the APP1 shell keeps its 1200px content band
although the source frames draw 1280px; the APP1 shell is not altered by this gate.

---

## L. Authority checker

New: `tools/check-storefront-product-detail-authority.mjs` (344 lines) with its pure line
scanners split into `…-authority.scan.mjs` (103 lines) to stay under the 400-line hard
limit, and **29 regressions** in `…-authority.test.mjs`. It reads one fact table, one
register row, one approval file and a bounded `### 6.2.3` block in six named files — it is
not a Markdown parser.

Regressions fail when: the route drifts or becomes a UUID route; a detail alias is approved;
a second operation is invented, in the table or in prose; the media rendition drifts or a
private original is allowed; the one description becomes three story fields, in the table or
in prose; price/stock become visible or an ecommerce surface is required; deferred scope
shrinks; the S01 card upgrade is reassigned; `IMP-D039` is unlocked or removed; the approval
record is lost; a reconciled root is not `APPROVED_FOR_IMPLEMENTATION`; a UI03 root is
deleted from the registry or promoted back to implementation authority; the route is dropped
from a downstream authority; the ruling block disappears; or **`APP2-S02` is declared ready
while the approval it depends on does not exist**. Explicit historical, rejected and
deferred prose stays legal, and six paired helper cases prove that the same sentence
*without* its label is caught.

**The `APP2-S01-G01` gate was superseded, in the open.** Running it after the ruling
produced exactly three failures and no others — `Product detail browser route`,
`APP2-S02 status`, and the roadmap's readiness claim — which is the gate doing precisely the
job it was built for. Its `EXPECTED` moves with the ruling instead of the fact table being
duplicated, so there is still exactly one live route ruling; `/san-pham` leaves its
rejected-path list because it is now guarded by the detail gate instead; and the readiness
assertion moves to the detail gate, which pairs it with the approval evidence. Its
regression suite went 22 → 21: two cases that could only test a superseded ruling were
retired with an explicit comment, one was re-armed against the new locked value, and one was
re-pointed at a still-rejected Discover path. The `IMP-D038` row itself was **not** rewritten
— it is a dated ruling that correctly records S02 as blocked at the time it was made.

---

## M. Validation

| Command | Result |
|---|---|
| Live pre/post Figma metadata + screenshot inspection | performed (§B, §H, §I) |
| Placement / integrity inspection | pass (§I) |
| `node --test tools/check-storefront-product-detail-authority.test.mjs` | **29 pass / 0 fail** |
| `pnpm check:storefront-product-detail-authority` | pass |
| `pnpm check:secrets` | pass — 358 documents, 1754 tracked files |
| `pnpm check:lifecycle` | pass — LC-04 5 transitions |
| `pnpm check:pagination-authority` + 14 regressions | pass |
| `pnpm check:storefront-route-authority` + **21** regressions | pass |
| `pnpm check:figma-design-index` + 31 regressions | pass — **86 IDs / 86 rows / 11 tables** |
| `pnpm check:openapi` | pass — artifact up to date |
| `pnpm check:api-client` | pass — tree hash `7524fc91…` |
| `pnpm db:check:manifest` | pass — 78 tables / 833 columns |
| `node tools/check-file-size.mjs` | pass — 0 hard-limit violations |
| `pnpm quality` | **exit 0** (288 tool assertions, 0 fail) |
| `git diff --check` | clean |

**One correction during validation, disclosed:** the first `pnpm quality` run **failed** at
`format:check` on the four new/edited tool files. A background-task summary reported exit 0
while the log showed exit 1; the log is what was believed. Prettier was run over those four
files and `pnpm quality` was re-run to a verified `EXIT=0`.

No `APP2-S02` application test was run or claimed — none exists.

### Frozen baselines — unchanged

```text
OpenAPI          c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8
Shape            16 paths / 19 operations / 34 schemas
Generated client 7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2
Database         33 migrations / 78 tables / 833 columns / 190 CHECKs
Fingerprint      82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf
```

`apps/**`, runtime package source, OpenAPI, the generated client, the database, migrations,
infrastructure, dependencies and `pnpm-lock.yaml` are all untouched.

---

## N. Commit A evidence

```text
0d178ed8aabb5c333362374d4e41869724e8d378
docs(app2): reconcile Storefront Product Detail authority
12 files changed, 1283 insertions(+), 64 deletions(-)
```

| File | Δ |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | +134 |
| `docs/design/approvals/APP2-S02-G01-PRODUCT-DETAIL-DESIGN-APPROVAL.md` | +224 (new) |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | ±2 |
| `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md` | ±2 |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | +1 |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | +116 |
| `package.json` | ±3 |
| `tools/check-storefront-product-detail-authority.mjs` | +344 (new) |
| `tools/check-storefront-product-detail-authority.scan.mjs` | +103 (new) |
| `tools/check-storefront-product-detail-authority.test.mjs` | +335 (new) |
| `tools/check-storefront-route-authority.mjs` | ±48 |
| `tools/check-storefront-route-authority.test.mjs` | ±35 |

Historical reports, dated audits and the original UI03 rationale were **not** rewritten;
every supersession is a labelled note beside the original text.

---

## O. Acceptance

| Criterion | Result |
|---|---|
| Clean exact S01 entry; accepted history unchanged | ✅ |
| No S02 application code | ✅ |
| All original UI03 nodes audited live; draft preserved as historical | ✅ |
| New reconciled section, responsive roots, state + contract-handoff authority | ✅ |
| Correct placement; no UI01/UI02/UI04/UI05 or DS mutation | ✅ |
| Route exactly `/san-pham/[slug]`; no alias; `/kham-pha` still Discover | ✅ |
| `publicProductDetail` only; ordered catalog-preview media | ✅ |
| Media empty/error/natural-ratio behaviour; accessible lightbox | ✅ |
| One description section; no invented story fields | ✅ |
| No price/stock/ecommerce; deferred scope deferred; share is browser-local | ✅ |
| Truthful Discover links; canonical/SEO mapping | ✅ |
| Desktop/tablet/mobile approved; 44px controls; no overflow; APP1 shell preserved | ✅ |
| Both follow-ups routed; approval and registry exact; `IMP-D039` LOCKED | ✅ |
| Checker regressions pass; OpenAPI/client/DB/runtime/dependencies unchanged | ✅ |
| Full quality passes; two scoped commits; clean tree; nothing pushed | ✅ |

```text
VERDICT = PASS
```

No failed design criterion is hidden behind a follow-up, and no correction prompt was
created.

---

## P. Handoff to `APP2-S02`

```text
APP2-S02-G01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-S02     = READY — NOT STARTED
APP2-E01     = BLOCKED_BY_APP2-S02
APP2-X01     = BLOCKED_BY_APP2-E01
```

`APP2-S02` implements `/san-pham/[slug]` against design authority `529:2224` and
`FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`, consuming `publicProductDetail` only — which
must first be added to the `@embroidery/api-client` public boundary, where it is currently
withheld with a comment naming exactly this blocker. The page must be dynamic/`no-store`,
must render the same safe 404 for unknown/`DRAFT`/`ARCHIVED`/non-public-category slugs, and
may convert the S01 card wrapper into one link without touching the masonry.
