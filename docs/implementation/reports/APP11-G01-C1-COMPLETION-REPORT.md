# APP11-G01-C1 — Live Figma Authority Reconciliation & Route Lock

**Correction of:** `APP11-G01` (`./APP11-G01-COMPLETION-REPORT.md`)
**Scope:** live Figma authority reconciliation + Product Owner route lock only.
The baseline, API, database, content and SEO audits are **not** re-run.

---

## A. Correction verdict

```text
APP11-G01-C1         = COMPLETE
APP11-G01            = COMPLETE
PO_DECISION_REQUIRED = NONE
BLOCKER              = NONE
NEXT_CHECKPOINT      = APP11-D01
```

The blocking defect — *"no relevant live Figma node was opened"* — is closed.
Live design authority was read for the Storefront shell, UI01, UI02, **UI05**,
Product Detail, the Admin precedent and the APP10 handoff frames.

The material correction demanded by the Product Owner is confirmed: **UI05 is
real APP11 Gallery authority.** The `APP11-G01` conclusion that it was out of
scope is withdrawn, and the Gallery feed is **no longer scheduled for redraw**.

---

## B. Accepted G01 baseline (unchanged, not re-audited)

```text
HEAD        = fb8f6a6b925be804ee782dc9b7add083eb919836
OPENAPI     = 106 paths / 115 operations / 232 schemas
MIGRATIONS  = 37
ADMIN       = 23 routes
STOREFRONT  = 12 routes
FIGMA       = 491 registry rows (gate re-run at C1: PASS)

APP11_SCHEMA_DISPOSITION       = NO_MIGRATION_REQUIRED
EXPECTED_APP11_MIGRATION_DELTA = 0
APP11_CONTENT_MODEL            = EXISTING_MODELS_SUFFICIENT
planned HTTP delta             = +11 operations (subject to later contract checkpoints)
no generic CMS · no blog engine · no cache/revalidation worker
change-impact testing strategy = accepted
```

One structural fact from the accepted baseline governs every live finding below,
and is quoted because the UI05 classification turns on it:

```sql
CREATE TABLE "gallery_entries" (
  "id" uuid NOT NULL, "title" text NOT NULL, "slug" text NOT NULL,
  "description" text NOT NULL, "status" text NOT NULL,
  "display_order" integer NOT NULL, "linked_product_id" uuid,
  "seo_title" text, "seo_description" text, "is_indexable" boolean NOT NULL, …
);
```

`gallery_entries` is **flat**. There is no parent-collection foreign key, no
grouping table, and `APP11_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED` forbids
creating one. Every live design claim below is measured against that.

---

## C. Figma access evidence

```text
FIGMA_LIVE_ACCESS = PASS
```

| Item | Value |
|---|---|
| Mechanism | Remote Figma MCP server, OAuth authorization code + PKCE, completed by the operator in-session |
| Local `figma-desktop` MCP | **ConnectionRefused** — not used; the remote server carried the whole correction |
| Authenticated identity | handle `Di Đan Lê`, plan `Di Đan Lê's team` (pro), seat Full |
| File opened | `BQwqV8GdfUIELvsQDB1UQE` — `embroidery` (`FIG-FILE-PRODUCT`) |
| Access class | read-only. **No node was created, edited, moved or deleted** |

**Method note (recorded because it changes what a future audit must do).**
`get_metadata` with no `nodeId` reported **one** page (`0:1 Information
Architecture`), and its full-page dump contained none of the registry node IDs.
That listing is incomplete. A read-only `use_figma` enumeration of
`figma.root.children` returned the true structure — **14 pages**:

```text
0:1 Information Architecture   166:1457 User Interface   17:55 Wireframe
371:3 APP_01   419:3 APP_02   592:3 APP_03   620:3 APP_04   641:3 APP_05
678:3 APP_06   726:3 APP_07   766:3 APP_08   766:2 APP_09   825:3 APP_10
544:2409 LOGO_SYSTEM
```

There is **no `APP_11` page**. `loadAllPagesAsync` is unsupported on this server;
cross-page reads must fan out one `setCurrentPageAsync` per call.

**Live nodes read at C1**

| Node | Name | Purpose |
|---|---|---|
| `375:11` | APP1-D01 · Staff Access & Application Shells | Admin shell precedent |
| `405:2224` | APP1-D02 · Storefront Shell & Not-found | §6.1 shell section |
| `405:2225` / `405:3733` / `405:3786` / `410:2311` | Shell Desktop / Tablet / Mobile / Nav-open | §6.1 |
| `183:2` → `183:7`, `189:266`, `191:412`, `183:118` | UI01 Homepage + Page Body | §6.2 |
| `208:538` → `208:2002`, `224:871`, `226:1038`, `208:2052` | UI02 Discover + Page Body | §6.3 |
| `328:1739` → `329:2`, `334:6`, `339:2`, `341:2`, `343:2`, `348:2`, `353:2`, `357:3`, `358:3`, `358:31`, `358:51` | **UI05 Collections Experience** | §6.4 |
| `529:2224` → `529:2225`, `533:3`, `533:26`, `537:3`, `537:38` | Product Detail + lightboxes | §6.5 |
| `423:3` → `439:100`, `434:20`, `437:73`, `441:106`, `442:205` | APP2-D01 Admin catalog/form/media/publication | §6.6 |
| `828:3` → `842:3`, `842:48`, `843:3`, `843:44` | APP10-I01 contact handoff | §6.7 |

**Screenshots rendered and visually inspected:** `329:2` (UI05 Collections Index
/ Desktop, 1440×3850) and `334:6` (UI05 Collection Detail / Desktop, 1440×4942).
Both are described below from the render, not from layer names.

---

## D. Live UI01 finding — Homepage

```text
UI01_CLASSIFICATION = REUSE_AND_SUPPLEMENT
```

`183:7` (Desktop 1440×5416), `189:266` (Tablet 1024), `191:412` (Mobile 390) are
live and intact. Each is `Header` + `Page Body` + `Footer`.

The **shell** role is genuinely superseded — `APP1-D02` (`405:2224`) is the
standalone shell authority. But the shell is only the outer instance pair. The
**content** authority lives in `Page Body` (`183:118`) and is fully drawn:

| Section | Node | APP11 disposition |
|---|---|---|
| Hero | `183:120` | reuse |
| Featured Works | `183:136` | reuse |
| Discover Feed | `183:137` | reuse (preview band, not `/kham-pha`) |
| **Collections** | `183:138` | reuse — a Homepage entry point to `/bo-suu-tap` already exists |
| Studio Story | `183:139` | reuse |
| **Journal** | `183:140` (+ `JournalCard` `187:258` / `187:264` / `187:270`) | **REMOVE FROM SCOPE** — blog excluded by `08` §2 and PRD §2.3; no persistence |
| Commission CTA | `183:141` | reuse |

**"Shell superseded" was not equated with "all Homepage content invalid".** Six
of seven sections are reusable Homepage authority at three breakpoints. The
`APP11-G01` claim that "the only Homepage authority is three superseded frames"
understated it: the frames are superseded *as shell*, and are live, complete
Homepage **content** authority.

D01 therefore **reconciles and registers** a Homepage package from these three
frames minus `Journal`. It does not invent a Homepage.

---

## E. Live UI02 finding — Discover / masonry

```text
UI02_DISPOSITION = APPROVED_REUSABLE — /kham-pha UNCHANGED
```

`208:2002` = `Header` + `Page Body` (`208:2052`) + `Footer`. The body is
`Discover Intro` (`210:585`), `Discovery Chips` (`214:587`), `Discover Feed`
(`215:598`).

Measured live, not quoted from the registry:

| Invariant | Live evidence |
|---|---|
| Variable-height masonry | `Masonry Block 1–4`, per-column heights 763 / 825 / 856 / 906 / 968 / 1085 / 1228 |
| **5 desktop columns** | `215:599`, `217:674`, `219:740`, `221:2293` each hold **5** `Column` frames at **237px** |
| Tablet / mobile | `224:871` (1024) and `226:1038` (390) present as separate recompositions |
| Chip / filter treatment | `Discovery Chips` `214:587` |
| Image-led cards, minimal metadata | `StudioWorkCard · TEMP_ASSET` instances |
| Linear semantic / source order | locked in the UI02 accessibility notes |

**Reuse limit — and a correction.** UI02's density is **5/3/2 at 237px**, tuned
for product discovery. UI05's Collections Index is **3/2/1 at 410/452/342px**,
tuned for an editorial entity carrying a title and a short description — which is
exactly the `gallery_entries` shape (`description` is `NOT NULL`).

`APP11-G01` §F.2 required the gallery feed to "**extend the UI02 masonry
architecture**". That is corrected: `/bo-suu-tap` follows **UI05's own masonry**,
which is itself derived from UI02's masonry language (UI05 `358:3` names UI02 as
a source). The gallery feed reuses UI02's *architecture* — variable-height
masonry, image-led cards, linear source order — at UI05's *density*.

`/kham-pha` is not redrawn, not relabelled and not aliased.

---

## F. Live UI05 / "Bộ sưu tập" finding — CRITICAL

```text
UI05_CLASSIFICATION     = APP11_GALLERY_PARTIAL_AUTHORITY
GALLERY_FEED_COVERAGE   = FULL
GALLERY_DETAIL_COVERAGE = PARTIAL
```

### F.1 What was searched

Searched live for `UI05`, `Bộ sưu tập`, `Bo suu tap`, `Collection`,
`Collections`, `Gallery`, `Work gallery`, `Studio work`. Result: section
**`328:1739` — "UI05 – Collections Experience – Draft"**, page `User Interface`,
5420×10866, **21 children**. Not a stub — a complete package:

| Frame | Node | Size |
|---|---|---|
| Collections Index / Desktop | `329:2` | 1440×3850 |
| Collections Index / Tablet | `339:2` | 1024×4211 |
| Collections Index / Mobile | `343:2` | 390×5574 |
| Collection Detail / Desktop | `334:6` | 1440×4942 |
| Collection Detail / Tablet | `341:2` | 1024×5162 |
| Collection Detail / Mobile | `348:2` | 390×4552 |
| 07 Collection & Card Interaction States | `353:2` | 1400×1892 |
| 08 Loading, Empty & Error States | `357:3` | 1400×1776 |
| 00 Scope & Source of Truth | `358:3` | 1200×920 |
| 09 Responsive Notes | `358:31` | 1200×650 |
| 10 Accessibility & SEO Notes | `358:51` | 1200×796 |
| 11 DS Usage Audit · 12 Content & Asset Audit · 13 Placement & Integrity Audit | `359:3`, `360:3`, `360:201` | — |

### F.2 It was not classified from naming

**Its own scope board (`358:3`) states:**

> "UI05 – Collections Experience is the production UI for the approved
> Collections public domain: a Collections Index (masonry of collection covers)
> and a Collection Detail (hero + narrative + member works)."
>
> "**Not** an ecommerce category, product-listing or marketplace taxonomy page.
> No cart, checkout, price, rating, sold-count, stock, sale badge."

**Its accessibility / SEO board (`358:51`) states:**

> "One H1 per page: **Index H1 = 'Bộ sưu tập'**"
>
> "Public indexable pages. Meaningful `<title>` + concise meta description per
> collection. **Canonical URL per Collection Detail. OG image = collection
> cover.** Descriptive alt text on every cover/hero/member image."
>
> "Masonry reading order — visual columns must linearize to a meaningful
> DOM/source order; keyboard order follows source order."

**Rendered evidence, `329:2`:** a header nav with **`Bộ sưu tập` active**; H1
**`Bộ sưu tập`**; eyebrow `BỘ SƯU TẬP CỦA XƯỞNG · PROVISIONAL_COPY`; a
three-column variable-height masonry of image-led cards, each = cover + title +
one short meta line + a text link; then a featured editorial band, a discovery
continuation row, a soft commission band, and the shared footer.

**Rendered evidence, `334:6`:** breadcrumb → `Collection Hero` (eyebrow, title
"Kỷ niệm được giữ lại", narrative paragraph, meta "12 tác phẩm · Thêu tay trên
vải lanh", primary artwork 776×608 + supporting image 440×296) → `Collection
Narrative` (story column ≤736 + media) → `Collection Attributes` (chip row) →
**`Member Works`** ("12 tác phẩm được tuyển chọn" — a 4-up masonry of *other
works* plus a "see more" button) → `Related Collections` (3-up) → `Continue
Discovering` → soft commission band → footer.

### F.3 Why it is authority, and why it is only partial

This is the `FIGMA_DESIGN_INDEX.md` §4.3.1 situation exactly. UI05 has **no
registry row** (searching the registry for `328:1739`, `329:2`, `334:6` returns
0 rows) and is titled "Collections", not "APP11 Gallery". §4.3.1 forbids
redrawing a covered capability because "its existing registry title did not
literally read 'Product List'", and §4.4.2 records that `DRAFT` is *content
maturity*, not absence of authority. Registry §7 already files UI01–UI05 as
"parallel hi-fi (DRAFT) renditions of the public surfaces". **Redrawing a Gallery
feed here would repeat the rejected `APP2-D01` regression.**

**Feed = FULL.** The Index screen *is* the gallery feed. Same surface, same H1
(`Bộ sưu tập` → `/bo-suu-tap`), same card contract (cover + title + short
description → `gallery_entries.title` + `description NOT NULL` + ordered
`gallery_entry_assets` cover), three breakpoints, plus interaction, loading,
empty and error states and responsive / a11y / SEO boards. Nothing about the feed
needs drawing; it needs registering and relabelling.

**Detail = PARTIAL,** and the gap is structural, not cosmetic. UI05's Collection
Detail is a **two-level** model — one collection *containing many member works*,
each linking onward to a Work Detail (`/works/{work-slug}`). APP11's
`gallery_entries` is **flat**: an entry owns an *ordered set of images*, not a
set of child entities, and `NO_MIGRATION_REQUIRED` means no grouping table will
exist.

| Detail section | Node | APP11 gallery entry |
|---|---|---|
| Breadcrumb | `334:72` | reuse |
| Collection Hero | `335:2` | reuse — maps to title + `description` + lead image |
| Collection Narrative | `336:2` | reuse — maps to the `description` body |
| Collection Attributes | `336:30` | reuse (optional) |
| **Member Works** | `336:3366` | **NOT REUSABLE** — no persistence; must be replaced by the entry's ordered image set + lightbox |
| Related Collections | `337:2` | reuse as "related entries" |
| Continue Discovering / Commission CTA / Footer | `337:42`, `337:47`, `337:85` | reuse |
| *(absent)* ordered multi-image gallery + lightbox | — | **supplement** — take from Product Detail `533:3` / `533:26` |
| *(absent)* optional linked-product affordance | — | **supplement** — `linked_product_id` → `/san-pham/[slug]` |

### F.4 Superseded inside UI05

UI05 `358:51` proposes conceptual routes `/collections`, `/collections/{slug}`,
`/works/{slug}` and marks them "not finalized · Final slugs pending
routing-convention approval". §J below supersedes them with Product Owner
authority. Route labels on canvas are reconciled at D01; **no Figma node is
edited in C1.**

---

## G. Admin precedent finding

Live on page `APP_02`, section **`423:3` — "APP2-D01 · Assets & Catalog
Publication"**:

| Precedent | Node | Reused for |
|---|---|---|
| Admin / Catalog / Desktop Default · Empty · Mobile | `439:100`, `440:102`, `440:191` | **Admin gallery list** `/gallery` — table, filters, empty state, mobile |
| Admin / Product / Edit-Detail Desktop Default · Validation · Saving · Mobile | `434:20`, `436:37`, `436:140`, `438:90` | **Admin gallery editor** `/gallery/[entryId]` — form, validation, saving |
| Admin / Product / Media Select / Desktop | `437:73` | gallery image selection + ordering |
| Admin / Publication Ready · Blocked · Confirm Unpublish · Mobile | `441:106`, `442:110`, `442:205`, `443:121` | publish / unpublish + confirmation |
| `APP2 Supplement / Input` component set | `424:35` | form primitives (the DS has no Input — GAP-D01) |
| APP2-D03 Product List notes · APP2-A03-G01 Product Form notes | `498:272`, `521:284` | list / form handoff conventions |

**A live search was run before concluding that new Admin design is required.**
Page `APP_02` was searched for `gallery|showcase|portfolio|content|bộ sưu
tập|thư viện`; every hit is either a generic `Content` layout frame or a
`Role badge / Ảnh thư viện` **product-media role chip** — none is a gallery
screen. There is no `APP_11` page anywhere in the file. **No Admin Gallery,
Content, Showcase or Portfolio design exists.**

Conclusion: the two Admin screens are **structurally reusable but not drawn** —
`SUPPLEMENT` at the structure level, `NEW_DESIGN_REQUIRED` as frames.
**List + editor/publication remain two implementation screens**; publication is a
panel inside the editor, since `441:106` is a state of the product surface rather
than a third route.

---

## H. Floating handoff finding

Live on page `APP_10`, section `828:3`:

| Node | Name |
|---|---|
| `842:3` | I01 · **Chân trang Storefront** — CTA Zalo & Messenger · Desktop 1440 |
| `842:48` | I01 · **Chân trang Storefront** — CTA Zalo & Messenger · Mobile 390 |
| `843:3` | I01 · Trạng thái CTA và cấu hình thiếu |
| `843:44` | I01 · Đặc tả bàn giao ra kênh ngoài |

Confirmed live: all four still draw the handoff as a **footer column**
("Chân trang" = footer). The accepted runtime is a **floating bottom-right dock**.

```text
RUNTIME AUTHORITY (unchanged, locked)
Zalo + Messenger = floating bottom-right dock
NOT footer-integrated · NOT Drift
```

`FU-APP10-E01-01` is therefore **confirmed by live evidence**, not inferred.
D01's action is documentation-only: reconcile these four frames to record the
accepted dock placement, while it supplements the footer with the store
presentation and policy block (`FU-APP10-D01-05`). **The runtime is not reverted
to the footer, and the dock is not redrawn.**

---

## I. Corrected live design coverage matrix

`CURRENT_RUNTIME`, `LIVE_VISUAL_FINDING` and `D01_ACTION` are taken from the live
file.

| APP11 capability | Route / surface | Current runtime | Registry ID | Live node | Live node name | Live visual finding | Authority status | Reuse provenance | Actual gap | Final disposition | D01 action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shared shell | all Storefront | `APP1-S01A` | `FIG-STOREFRONT-SHELL-*` | `405:2225`, `405:3733`, `405:3786`, `410:2311` | Storefront Shell / Desktop · Tablet · Mobile · Nav-open | Header + content slot + Footer at 3 breakpoints; nav-open = scrim + MobileMenu; all live | `APPROVED_FOR_IMPLEMENTATION` | APP1-D02 | none | `APPROVED_REUSABLE` | **`NONE_REUSE_AS_IS`** |
| Not-found | `/404` | `APP1-S01B` | `FIG-STOREFRONT-NOTFOUND*` | `411:2337`, `411:3851` | Storefront Not-found Desktop · Mobile | present in section `405:2224` | `APPROVED_FOR_IMPLEMENTATION` | APP1-D02 | none | `APPROVED_REUSABLE` | **`NONE_REUSE_AS_IS`** |
| Product discovery | `/kham-pha` | `APP2-S01` | `FIG-UI02-DISCOVER-*` | `208:2002`, `224:871`, `226:1038` | UI02 / Discover / Desktop · Tablet · Mobile | 4 masonry blocks × **5 columns @237px**, chips, variable heights | `DRAFT` content maturity; visual + structural `REQUIRED` | APP2-D01-C1 | none | `APPROVED_REUSABLE` | **`NONE_REUSE_AS_IS`** — untouched |
| Product detail | `/san-pham/[slug]` | `APP2-S02` | 10 × `FIG-S02-PRODUCT-DETAIL-*` | `529:2225`, `533:3`, `533:26`, `537:3`, `537:38` | Product Detail Default / Lightbox / Contract Handoff | hero + thumbnail strip, lightbox with focus trap, media empty + error | `APPROVED_FOR_IMPLEMENTATION` | APP2-S02-G01 | none | `APPROVED_REUSABLE` | **`NONE_REUSE_AS_IS`** |
| **Homepage** | `/` | CP0 placeholder | *(existing rows are shell rows)* | `183:7`, `189:266`, `191:412` | UI01 / Homepage / Desktop · Tablet · Mobile | 7 body sections drawn at 3 breakpoints; `Journal` present | shell role `SUPERSEDED`; **content authority live, unregistered** | UI01 + APP1-D02 shell | no approved Homepage row; `Journal` out of scope | `REUSE_AND_SUPPLEMENT` | **`RECONCILE_EXISTING`** — register Homepage content minus `Journal` |
| **Gallery feed** | `/bo-suu-tap` | none | **none** | `329:2`, `339:2`, `343:2` (+ `353:2`, `357:3`) | UI05 / Collections Index / Desktop · Tablet · Mobile | H1 `Bộ sưu tập`, 3/2/1 masonry @410/452/342, image-led cards, states drawn | live authority, **unregistered**, `DRAFT` content maturity | **UI05** (masonry language from UI02) | entity reads "collection"; unregistered; canvas routes say `/collections` | **`APP11_GALLERY_FULL_AUTHORITY` for the feed** | **`REGISTER_EXISTING`** — no redraw |
| **Gallery entry detail** | `/bo-suu-tap/[slug]` | none | **none** | `334:6`, `341:2`, `348:2` | UI05 / Collection Detail / Desktop · Tablet · Mobile | breadcrumb, hero, narrative, attributes, **Member Works**, related, CTA | live authority, **unregistered**, partial | **UI05** + Product Detail `533:3` / `533:26` | `Member Works` has no persistence; no ordered image set or lightbox; no linked-product affordance | `APP11_GALLERY_PARTIAL_AUTHORITY` | **`SUPPLEMENT_EXISTING`** — swap Member Works for the ordered asset gallery + lightbox |
| **Footer store presentation** | shell footer | delivered, content-free | `FIG-DS-FOOTER` | DS `hsxSjwkqQKM9vuyRgWSesU` | Footer | no contact block, address or policy column | `APPROVED` (DS) | APP1-D02 | store block + policy column absent | `APPROVED_REQUIRES_SUPPLEMENT` | **`SUPPLEMENT_EXISTING`** — closes `FU-APP10-D01-05` |
| **External contact handoff** | shell, all pages | floating dock (`APP10-I01` + E01) | `FIG-APP10-I01-*` | `842:3`, `842:48`, `843:3`, `843:44` | I01 · **Chân trang** — CTA Zalo & Messenger | still drawn as a **footer column** | `REVIEW_REQUIRED` — **stale** | APP10-I01 | documentation contradicts the accepted runtime | `STALE` | **`RECONCILE_EXISTING`** — docs only; runtime stays a dock |
| **Static content pages** | `/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang`, `/chinh-sach/[slug]` | none | none | **none found** | — | live search across `User Interface` + `Wireframe` returns only footer link labels (`Liên hệ`, `Chính sách bảo mật · Điều khoản sử dụng`) and WF01 IA prose | **MISSING** | — | no page-level frame for any of the four | `MISSING` | **`NEW_DESIGN_REQUIRED`** — one shared template, absence proven |
| **Admin gallery list** | Admin `/gallery` | none | none | **none found** | — | no `APP_11` page; `APP_02` search returns only `Content` frames and `Ảnh thư viện` role chips | **MISSING** | precedent `439:100`, `440:102`, `440:191` | no gallery Admin frame | `MISSING` | **`NEW_DESIGN_REQUIRED`** on APP2 structure |
| **Admin gallery editor + publication** | Admin `/gallery/[entryId]` | none | none | **none found** | — | as above | **MISSING** | precedent `434:20`, `437:73`, `441:106`, `442:205` | no gallery Admin frame | `MISSING` | **`NEW_DESIGN_REQUIRED`** on APP2 structure |
| Admin content-page CMS | — | none | — | — | — | `07-ADMIN-OPERATIONS` defines no such operation | `NOT_REQUIRED` | — | — | `NOT_REQUIRED` | **`REMOVE_FROM_SCOPE`** |
| Journal / blog | — | none | — | `183:140`, `187:258` | Journal · JournalCard | drawn on UI01 at 3 breakpoints | excluded by `08` §2 + PRD §2.3 | — | no persistence, not required | `NOT_REQUIRED` | **`REMOVE_FROM_SCOPE`** |
| robots / sitemap / OG | `/robots.txt`, `/sitemap.xml` | none | — | — | — | non-visual framework artifacts | `NOT_REQUIRED` | — | — | `NOT_REQUIRED` | **`REMOVE_FROM_SCOPE`** (no design) |

Every retained `NEW_DESIGN_REQUIRED` row is backed by a live search that returned
no covering frame (acceptance criterion 11).

---

## J. Locked route authority

```text
PO-APP11-001 = RESOLVED
```

### Public Storefront

```text
Product discovery        /kham-pha            (unchanged)
Product detail           /san-pham/[slug]     (unchanged)
Gallery feed             /bo-suu-tap
Gallery entry detail     /bo-suu-tap/[slug]
Service                  /dich-vu
FAQ                      /cau-hoi-thuong-gap
Local/store              /cua-hang
Policy family            /chinh-sach/[slug]
```

### Admin

```text
Gallery list             /gallery
Gallery detail/editor    /gallery/[entryId]
```

Recorded rationale: `/bo-suu-tap` matches the existing Storefront navigation
label `Bộ sưu tập` and differentiates Gallery from product discovery
`/kham-pha`; the business currently has one physical store, so `/cua-hang` is
intentionally singular and non-parameterized; the current canonical scope
requires one Service page rather than a speculative service CMS family, so
`/dich-vu` is intentionally singular; policies legitimately support multiple
slugs; Admin uses technical route naming instead of forcing public Vietnamese
route conventions into the Admin app.

**No aliases** — `/thu-vien`, Storefront `/gallery`, `/collections` and `/store`
are rejected, and **APP11 creates no redirects for them**.

Two consequences are recorded:

1. The `APP11-G01` §L.1 defaults (`/thu-vien`, `/dich-vu/[slug]`,
   `/cua-hang/[slug]`, Admin `/thu-vien`) are **superseded**.
2. `content_pages` is keyed `(page_type, slug)`. The singular routes stay
   unambiguous because each binds a fixed `page_type` to one canonical slug
   (`SERVICE`/`dich-vu`, `FAQ`/`cau-hoi-thuong-gap`, `LOCAL`/`cua-hang`); only
   the policy family varies its slug, and it keeps `/chinh-sach/[slug]`. No
   catch-all `/[slug]` is introduced.

`EXPECTED_APP11_ROUTE_DELTA` is unchanged by the lock: Storefront 12 → 18 pages
(+2 route files), Admin 23 → 25 pages.

---

## K. Final design disposition

```text
APP11_DESIGN_DISPOSITION = REUSE_AND_SUPPLEMENT
APP11_D01_REQUIRED       = true
```

`REUSE_AND_SUPPLEMENT` is **confirmed**, but its content changes materially.
`APP11-G01` justified D01 by "seven surfaces with no approved authority". Live
evidence reduces that to **three** surfaces with no authority at all; the other
four are register / reconcile / supplement work on design that already exists.

D01 remains required because the content-page template and the two Admin gallery
screens genuinely have no live authority, and because registering and reconciling
UI01, UI05 and the APP10-I01 frames is itself design-governance work that only
D01 may perform.

---

## L. Corrected D01 scope — the smallest actual design delta

| # | Item | Action | Live basis | Explicitly forbidden |
|---|---|---|---|---|
| 1 | Gallery feed `/bo-suu-tap` | **`REGISTER_EXISTING`** | `329:2`, `339:2`, `343:2`, `353:2`, `357:3` | **Do not redraw the feed.** Do not create a second discovery language. Do not restyle to UI02's 5/3/2 |
| 2 | Gallery entry detail `/bo-suu-tap/[slug]` | **`SUPPLEMENT_EXISTING`** | reuse `334:6` / `341:2` / `348:2` hero, narrative, breadcrumb, attributes, related, CTA; replace `Member Works` `336:3366` with the ordered `gallery_entry_assets` set + lightbox from `533:3` / `533:26`; add the optional `linked_product_id` affordance to `/san-pham/[slug]` | Do not redraw hero / narrative / related. Do not model a collection→works hierarchy |
| 3 | Homepage `/` | **`RECONCILE_EXISTING`** | register `183:7`, `189:266`, `191:412` content; shell from `405:2224`; **drop `Journal` `183:140`** | Do not invent a Homepage. Do not ship a blog section |
| 4 | Content-page template | **`NEW_DESIGN_REQUIRED`** | none — absence proven | One shared template with per-type slots, not four bespoke screens |
| 5 | Admin gallery list `/gallery` | **`NEW_DESIGN_REQUIRED`** on APP2 structure | `439:100`, `440:102`, `440:191` | Do not invent new Admin list conventions |
| 6 | Admin gallery editor `/gallery/[entryId]` | **`NEW_DESIGN_REQUIRED`** on APP2 structure | `434:20`, `437:73`, `441:106`, `442:205` | Do not create a third Admin route for publication |
| 7 | Footer store presentation + policy column | **`SUPPLEMENT_EXISTING`** | `FIG-DS-FOOTER` | Do not modify the DS file |
| 8 | APP10-I01 handoff reconciliation | **`RECONCILE_EXISTING`** | `842:3`, `842:48`, `843:3`, `843:44` | Documentation only. **Do not revert the runtime to the footer** |

D01 also relabels UI05's provisional route strings (`/collections`,
`/collections/{slug}`, `/works/{slug}`) to the §J authority, and registers every
node it adopts with exact node IDs and deep links, entering as `REVIEW_REQUIRED`.

**Net change to D01:** two of the seven "no authority" surfaces — the gallery
feed and the gallery entry detail — are removed from the drawing list. The feed
is not drawn at all.

---

## M. Canonical roadmap delta

Only rows changed by live design evidence.

| Location | Before | After | Cause |
|---|---|---|---|
| Phase §0 roadmap table | `APP11-G01` **COMPLETE**, `APP11-D01` **NEXT** | adds `APP11-G01-C1` **COMPLETE**; `APP11-D01` stays the single **NEXT** | correction closed |
| Phase §3.2 design policy | D01 covers "seven surfaces with no approved authority", including gallery feed + detail | D01 covers **three** new surfaces + five register / reconcile / supplement items | §I matrix |
| Phase §3.2 preconditions | `OPS-APP11-001` (Figma access) and `PO-APP11-001` (routes) both open | **both RESOLVED** | §C, §J |
| Phase §6 `APP11-S02` | "on the UI02 masonry architecture" | "on the **UI05 Collections Index** authority (`329:2` / `339:2` / `343:2`) — UI02 masonry language at UI05 density" | §E, §F |
| Phase §6 `APP11-S03` | implied new design | reuses UI05 Collection Detail + the Product Detail lightbox | §F.3 |
| Phase §4 in-scope routes | route names unstated | §J paths recorded verbatim | §J |
| G01 §F.2 UI05 row | `NOT_REQUIRED` — "out of APP11 scope … route: null" | **withdrawn** → `APP11_GALLERY_PARTIAL_AUTHORITY` | §F |
| G01 §F.2 gallery feed row | `MISSING` → "must extend the UI02 masonry architecture" | `REGISTER_EXISTING` on UI05 | §F |
| G01 §F.2 gallery detail row | `MISSING` | `SUPPLEMENT_EXISTING` on UI05 + Product Detail | §F.3 |
| G01 §L.1 route defaults | `/thu-vien`, `/dich-vu/[slug]`, `/cua-hang/[slug]` | **superseded** by §J | §J |

**Unchanged and not re-audited:** schema disposition, migration delta, content
model, the +11 HTTP operations, the no-CMS / no-blog / no-redirect-runtime
exclusions, the change-impact testing policy, and every §O exit criterion except
those referencing design provenance.

---

## N. Validation — change-impact only

```text
CHANGE_IMPACT = documentation only.
  3 markdown files under docs/implementation/.
  0 runtime files · 0 SCSS · 0 OpenAPI · 0 generated client
  0 migrations · 0 dependencies · 0 infrastructure
  0 Figma nodes created, edited, moved or deleted
  0 FIGMA_DESIGN_INDEX.md rows added, removed or modified
```

```text
TESTS_RUN
  node tools/check-figma-design-index.mjs
    → PASS — "491 registry IDs, 491 node rows, 22 registry table(s);
       canonical files + statuses + deep links + composites verified"
  live Figma reads — 10 read-only use_figma calls, get_metadata on 375:11,
    and 2 rendered screenshots (329:2, 334:6)
  git status / git diff — confirmed only the three permitted files changed
```

```text
TESTS_NOT_RUN
  full monorepo test · full E2E · functional regression
  APP10-E01 rerun · API / Admin / Storefront / worker / DB suites
  Playwright · SCSS compile · OpenAPI generator check

WHY_NOT_RUN
  Forbidden by the correction prompt §10 and by the phase change-impact policy.
  No executable artifact changed, so no suite has a dependency reason to run.
  The registry gate was run because C1 reasons about registry integrity, even
  though C1 modifies no registry row.
```

**Not claimed:** no runtime behavior was exercised. Every finding in this report
is design authority and documentation.

---

## O. Files changed

```text
M docs/implementation/reports/APP11-G01-COMPLETION-REPORT.md
    §F.2 UI05 / gallery feed / gallery detail / Homepage rows corrected;
    §F.3 D01 scope corrected; §L.1 route defaults superseded by the PO lock.
A docs/implementation/reports/APP11-G01-C1-COMPLETION-REPORT.md
    this report.
M docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
    §0 roadmap table (+G01-C1 row, exactly one NEXT); §3.2 design policy and
    preconditions; §4 route names; §6 S02 / S03 provenance.
```

No other file in the repository was modified.
