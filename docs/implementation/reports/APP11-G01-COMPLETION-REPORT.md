# APP11-G01 — Phase-Entry Baseline, Design Authority & Canonical Roadmap Audit

**Checkpoint:** `APP11-G01`
**Phase:** APP11 — Gallery, Content, SEO and Store Presentation
**Mode:** AUDIT · PLANNING · AUTHORITY RECONCILIATION · ROADMAP LOCK
**Implementation:** NONE
**Date:** 2026-08-29

> **CORRECTED BY `APP11-G01-C1`** (`./APP11-G01-C1-COMPLETION-REPORT.md`).
> This report was written without live Figma access. C1 opened the live file and
> **withdrew three conclusions**: UI05 is APP11 Gallery authority (not out of
> scope), the gallery feed is registered rather than redrawn, and the gallery
> entry detail is supplemented from UI05 + Product Detail. The §L.1 route
> defaults are superseded by the Product Owner lock (`PO-APP11-001 = RESOLVED`).
> Everything else in this report stands. Where this report and C1 disagree,
> **C1 governs.**

---

## A. Verdict

```text
APP11-G01 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-D01
```

Two items are recorded rather than escalated, because neither blocks locking the
roadmap and both are resolved inside a later checkpoint that already needs the
input:

- `PO-APP11-001` — the public route paths for the gallery and static-content
  surfaces. Route authority is Product Owner authority, never a Figma label
  (IMP-D038, IMP-D039); the Product Owner locked `/kham-pha` and
  `/san-pham/[slug]` the same way. §L records the recommended defaults, and the
  decision lands **at `APP11-D01`**, which must draw those routes anyway.
- `OPS-APP11-001` — the `figma-desktop` MCP server answered `ConnectionRefused`
  for this entire session and the hosted Figma plugin requires an interactive
  OAuth grant. **No live Figma node could be opened.** §C and §F state exactly
  what this cost and how it is repaid at `APP11-D01`, which cannot run without
  Figma access under any circumstances.

---

## B. Measured entry baseline

Every value below was re-measured from the working tree at HEAD. It is not
copied from the APP10 closure.

```text
BRANCH                = production
HEAD                  = fb8f6a6b925be804ee782dc9b7add083eb919836
WORKING_TREE          = clean
PUSH_STATE            = ahead of origin/production by 123 commits (not pushed)

OPENAPI_PATHS         = 106
OPENAPI_OPERATIONS    = 115
OPENAPI_SCHEMAS       = 232
OPENAPI_FINGERPRINT   = 71d116bcc52c4bb6db4c59ec7549040861c36533
                        (packages/contracts/openapi/openapi.generated.json)

GENERATED_CLIENT      = packages/api-client/src/generated/
  embroidery-api.ts         = 6f7b4d51664230793464e47cc252f6d10fbaf871
  embroidery-api.schemas.ts = 1e46c1cae13a6ef153886cbdc0f556512454d482

MIGRATION_COUNT       = 37
LAST_MIGRATION        = 0037_add_app7_transfer_evidence_association.sql

ADMIN_ROUTE_COUNT     = 23   (apps/admin/src/app/**/page.tsx)
STOREFRONT_ROUTE_COUNT= 12   (apps/storefront/src/app/**/page.tsx)

FIGMA_REGISTRY_COUNT  = 491  (gate: 491 registry ids, 491 node rows, 22 tables)
```

Figma status distribution, parsed from the registry's own data rows:

| Status | Rows |
|---|---|
| `APPROVED_FOR_IMPLEMENTATION` | 435 |
| `REFERENCE_ONLY` | 23 |
| `REVIEW_REQUIRED` | 17 |
| `APPROVED` (stable DS reference assets, registry §9) | 7 |
| `SUPERSEDED` | 4 |
| `DRAFT` | 4 |
| `OBSOLETE` | 1 |
| **Total** | **491** |

### B.1 Reconciliation against the APP10 closure expectation

| Expected at APP10 closure | Measured now | Result |
|---|---|---|
| OpenAPI 106 / 115 / 232 | 106 / 115 / 232 | exact |
| Migrations 37 | 37 | exact |
| Admin routes 23 | 23 | exact |
| Storefront routes 12 | 12 | exact |
| Figma registry 491 rows | 491 | exact |
| Working tree clean | clean | exact |

**No value differs.** No baseline number was silently updated.

### B.2 APP11-owned artifacts that already exist

```text
APP11_OWNED_EXISTING_OPERATIONS = 0
```

There is **no** gallery or content HTTP operation anywhere in the contract, and
the generated client contains zero `gallery`/`contentPage` occurrences.

```text
APP11_OWNED_EXISTING_ROUTES = 3 Storefront / 0 Admin
```

- `/` — Homepage. A **CP0 scaffold placeholder** (`h1` plus one status
  paragraph; its own comment reads "Scaffold placeholder preserved — no Homepage
  redesign in this checkpoint").
- `/kham-pha` — the delivered Discover feed (`APP2-S01`).
- `/san-pham/[slug]` — the delivered Product Detail (`APP2-S02`).

```text
APP11_OWNED_EXISTING_DB_ARTIFACTS = 6 tables, all created by migration 0018
```

`0018_create_content_gallery_agreement_tables.sql`:

| Table | Registry | Owner module | Purpose |
|---|---|---|---|
| `gallery_entries` | TBL-064 | Gallery (CTX-GAL, AGG-18) | showcase entry: title, slug, description, LC-04 status, `display_order`, optional `linked_product_id`, `seo_title`, `seo_description`, `is_indexable`, `archived_at` |
| `gallery_entry_assets` | TBL-065 | Gallery | ordered entry↔asset association, **public derivatives only** (CST-123, application-enforced) |
| `content_pages` | TBL-066 | Content (CTX-CNT, AGG-19) | `page_type ∈ {HOME, SERVICE, FAQ, LOCAL, LANDING, POLICY}`, slug, title, body, LC-04 status, SEO fields, `is_indexable` |
| `redirect_rules` | TBL-067 | Content (AGG-20) | `source_path → target_path`, `PERMANENT`/`TEMPORARY`, `is_active` |
| `agreements` | TBL-068 | Content (AGG-21) | policy container — **APP6-owned**, not APP11 |
| `agreement_versions` | TBL-069 | Content (AGG-21) | hashed, effective-windowed legal terms — **APP6-owned**, not APP11 |

Supporting indexes already built for exactly this phase's queries:

- **IDX-066** — `ix_gallery_entries__display_id__published`, partial on
  `status = 'PUBLISHED'`, sorted `(display_order, id)` per ADR-DB5-001. The
  published-listing index.
- **IDX-067** — `ix_content_pages__published_indexable`, partial on
  `status = 'PUBLISHED' and is_indexable`. DB5 names its query **Q-06, "sitemap
  scan"**.
- IDX-012 (gallery slug uniqueness), IDX-050, IDX-052, IDX-053.

The API modules exist and are composed at the persistence layer, with **no
controller and no use-case** beyond APP6's agreement bootstrap:

```text
apps/api/src/modules/gallery/  — GalleryModule, GalleryEntryRepository (+ Drizzle)
apps/api/src/modules/content/  — ContentModule, ContentPageRepository,
                                 RedirectRuleRepository, AgreementRepository
                                 (+ Drizzle), PublishApp6AgreementsUseCase
```

`GalleryEntryRepository` already offers `create`, `attachAsset` (which rejects
any asset not classified `PUBLIC`), `changeStatus`, `findBySlug`, `findById`,
`listAssetIds`. `ContentPageRepository` offers `create`, `updateBody`,
`changeStatus`, `findByTypeAndSlug`, `findById`. Neither offers a **list**
query, and neither offers a **published-listing** query — those are the real
gaps, not the tables.

---

## C. Authorities inspected

**Governance and planning**

- `CLAUDE.md` (source-of-truth order, mandatory code rules, §8a credentials,
  §9 prohibited shortcuts)
- `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` (§2 APP11 row, §3
  dependency chain, §6 phase status — APP11 `NOT_STARTED`)
- `docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md` (the candidate
  roadmap under audit)
- `docs/implementation/SCOPED_COMMAND_INDEX.md` (322 indexed commands)

**APP10 closure entry authority**

- `docs/implementation/reports/APP10-X01-COMPLETION-REPORT.md`
- `docs/implementation/reports/APP10-CLOSURE-MATRIX.md`

**Approved product and business authority**

- `docs/08-SEO-AND-CONTENT.md` — the canonical SEO/content baseline (§2 page
  types, §4 on-page, §5 technical, §6 gallery SEO, §7 content quality)
- `docs/01-PRODUCT-REQUIREMENTS.md` §2.3 (Gallery), §12 (Admin Console)
- `docs/07-ADMIN-OPERATIONS.md` — §3 Catalog operations, **§4 Gallery
  operations**, and the complete section list (§1–§12)
- `docs/02-SCOPE-AND-BOUNDARIES.md`

**Database authority**

- `packages/database/src/schema/gallery/{gallery-entries,gallery-entry-assets}.ts`
- `packages/database/src/schema/content/{content-pages,redirect-rules,agreements,agreement-versions}.ts`
- `packages/database/src/schema/catalog/product-media.ts`,
  `packages/database/src/schema/asset/assets.ts` (alt-text precedent)
- `packages/database/migrations/` (37 files; `0018` inspected in full)

**Runtime**

- `apps/storefront/src/app/` — every one of the 12 `page.tsx` files, plus
  `layout.tsx` and `next.config.ts`
- `apps/storefront/src/features/product-discovery/` (feed, card, category model,
  route model, copy)
- `apps/storefront/src/features/storefront-shell/` (footer, primary nav,
  navigation model, contact handoff)
- `apps/admin/src/features/admin-shell/model/admin-shell-nav.ts`
- `apps/api/src/modules/{gallery,content}/**` (every file)
- `apps/api/src/modules/catalog/` public media delivery family
- `apps/worker/src/jobs/notification-delivery/config/storefront-origin.config.ts`
  (IMP-D050 `STOREFRONT_PUBLIC_ORIGIN`)

**Contract**

- `packages/contracts/openapi/openapi.generated.json` — all 106 paths, the 40
  `/api/public/*` operations enumerated, and the `PublicProduct*` schema family
- `packages/api-client/src/generated/`

**Design**

- `docs/design/FIGMA_DESIGN_INDEX.md` — read in full (1547 lines, 22 registry
  tables), with §4.2 (APP1-D02 shell), §4.3.1 (the removed card grid), §4.4
  (capability → authority map), §4.4.1 (UI02 rows), §4.4.2 (the status
  vocabulary), §4.4.3 (locked visual invariants), §4.5 (reconciled Product
  Detail), §7, §9 and §10 inspected line by line
- `node tools/check-figma-design-index.mjs` — executed, passes

**Live Figma nodes — NOT opened (`OPS-APP11-001`).** The `figma-desktop` MCP
server answered `ConnectionRefused` at session start and never recovered. The
hosted `plugin:figma:figma` server requires an interactive OAuth grant that only
the human bridge can complete. I attempted the authentication handshake; it
returned an authorization URL rather than a session, so **no live node was
read**. This is stated plainly rather than papered over, and it has three
consequences:

1. Every design conclusion in §F rests on the registry's own **recorded live
   measurements** — which are unusually strong here, because `APP2-D01-C1` and
   `APP2-S02-G01` audited these exact nodes live and wrote the measurements into
   the registry (UI02 desktop "measured: 5 × 237px columns", tablet
   "3 × 293px", mobile "2 × 163px"; the removed grid's "desktop 6 × 365×394"
   captured before deletion; the sixteen UI03 children "each audited live by this
   gate").
2. No design row is promoted, demoted, redrawn or re-approved by G01. Nothing
   about the registry changed.
3. `APP11-D01` **must** open every node in the §F matrix live before it draws
   anything. It cannot run without Figma access in any case, so the debt is paid
   at the first checkpoint that can pay it.

---

## D. Original APP11 candidate disposition

The candidate roadmap held 17 slices. Every one is dispositioned.

| # | OLD_ID / NAME | DISPOSITION | Rationale · existing owner · missing capability | Deps | HTTP Δ | Mig Δ | Route Δ | Design dep |
|---|---|---|---|---|---|---|---|---|
| 1 | **APP11-C01** — Gallery/content draft contract | `MERGE_INTO_OTHER` → `APP11-B01` | This repository has no standalone "contract" checkpoint type. Every delivered phase defines its contract inside the backend checkpoint that implements it (`APP2-B02`, `APP6-B01`, `APP9-B04`). A separate C-slice would produce an OpenAPI delta with no runtime behind it — generated-client drift for zero review value | — | 0 | 0 | 0 | none |
| 2 | **APP11-B01** — Gallery/content backend | `SPLIT` → `APP11-B01` + `APP11-B02` | One slice covering drafts, assets, validation and authorization for **two** aggregates breaks the 1–3 (max 5) operation limit and is not reviewable. Split by aggregate and by concern; the content-page half is removed entirely (row 6) | D01 not required | see B01/B02 | 0 | 0 | none |
| 3 | **APP11-A01** — Admin content list | `RENAME` → `APP11-A01` Admin gallery list | The capability survives, the subject narrows: there is no content-page Admin surface to list (row 6). Rename recorded rather than silently recycling the ID | B01 | 0 | 0 | +1 Admin | required |
| 4 | **APP11-A02** — Admin content editor/detail | `RENAME` + `MERGE` ← old A03 → `APP11-A02` | Same narrowing. Gallery publication is a status advance plus a readiness check over four fields and one asset list — far smaller than product publication, which earned its own screen at `APP2-A04` because SKUs, variants, pricing and media all gate it. One editor with a publication panel is the smaller reviewable unit | B01, B02 | 0 | 0 | +1 Admin | required |
| 5 | **APP11-C02** — Publication contract | `MERGE_INTO_OTHER` → `APP11-B02` | Same reason as row 1 | — | 0 | 0 | 0 | none |
| 6 | **APP11-B02** — Content publication backend | `REMOVE` | `docs/07-ADMIN-OPERATIONS.md` enumerates Admin capability in twelve sections and contains **no content-page operations section at all** — only §3 Catalog and §4 Gallery. There is no canonical Admin authority to author, publish or unpublish a content page. Building one would be inventing Admin scope. See §H | — | 0 | 0 | 0 | none |
| 7 | **APP11-A03** — Admin publication interaction | `MERGE_INTO_OTHER` → `APP11-A02` (row 4) | — | — | 0 | 0 | 0 | required |
| 8 | **APP11-C03** — Public discovery contract | `MERGE_INTO_OTHER` → `APP11-B03` | Same reason as row 1 | — | 0 | 0 | 0 | none |
| 9 | **APP11-B03** — Public discovery queries | `SPLIT`/`RENAME` → `APP11-B03` public **gallery** reads + `APP11-B04` sitemap inventory | "Public discovery" as written duplicates `publicProduct_list` / `publicProduct_detail`, delivered by `APP2-B04` and live at `/kham-pha`. What is genuinely absent is the **gallery** read model and a sitemap inventory. Renamed to what is missing | B01, B02 | see B03/B04 | 0 | 0 | none |
| 10 | **APP11-S01** — Homepage/store introduction | `KEEP` → `APP11-S01` | Genuinely missing. `apps/storefront/src/app/page.tsx` is still the CP0 scaffold: `"Embroidery Commerce Storefront"` and `"Ứng dụng storefront đã khởi tạo (checkpoint CP0)."`. The single highest-value indexable page in the product is a placeholder | D01 | 0 | 0 | 0 (extends `/`) | **required — no approved authority exists (§F)** |
| 11 | **APP11-S02** — Discovery/gallery feed | `SPLIT` → `ALREADY_DELIVERED` (discovery) + `APP11-S02` (gallery feed) | The **discovery** half is delivered: `/kham-pha` renders UI02's masonry — 5/3/2 columns, variable heights, linear DOM order, category chips, continuation, empty/loading/error states, and since IMP-D039 each card is one link into Product Detail. Owner `APP2-S01` (+ `APP2-S01-G01`, `APP2-S02`). **It must not be redrawn or rebuilt.** The **gallery** half — `gallery_entries`, a different aggregate with its own slug, description, SEO fields and publication lifecycle — has no surface at all | D01, B03 | 0 | 0 | +1 Storefront | required |
| 12 | **APP11-S03** — Gallery/work detail | `SPLIT` → `ALREADY_DELIVERED` (work detail) + `APP11-S03` (gallery entry detail) | "Work detail" is `/san-pham/[slug]`, delivered by `APP2-S02` against ten `APPROVED_FOR_IMPLEMENTATION` rows under `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`, with hero gallery, lightbox, breadcrumb, share, per-product canonical and per-product `robots`. **Not reopened.** A gallery *entry* detail is a different page over a different table | D01, B03 | 0 | 0 | +1 Storefront | required |
| 13 | **APP11-S04** — SEO infrastructure | `KEEP` → `APP11-S04` | Confirmed missing. No `robots.ts`, no `sitemap.ts`, no `manifest`, no `opengraph-image`, no `metadataBase`, no JSON-LD, no breadcrumb markup anywhere in `apps/storefront/src/app`. See §K | D01, B04 | 0 | 0 | +2 route files | partial |
| 14 | **APP11-W01** — Content asset/revalidation worker | `REMOVE` | Nothing to revalidate: every public Storefront segment is `export const dynamic = 'force-dynamic'`, and its own comment states the reason — "publication is re-read on every API request precisely because nothing in this system invalidates a cache". There is no cache, so there is no invalidation job. Gallery images reuse the APP2 derivative pipeline (§E.5), which already produces its renditions at asset intake; no second worker is justified | — | 0 | 0 | 0 | none |
| 15 | **APP11-E01** — Content publication E2E | `KEEP` → `APP11-E01` | Retained, rescoped to the delivered roadmap. See §P | all | 0 | 0 | 0 | none |
| 16 | **APP11-X01** — Phase closure | `KEEP` → `APP11-X01` | Closes R5 Operational Beta and hands to APP12 | E01 | 0 | 0 | 0 | none |
| 17 | *(not in the candidate list)* Phase design package | `NEW` → `APP11-D01` | The candidate plan's §3 said design "likely requires a package" without deciding. §F decides it: **required**, as exactly one bounded phase-level package | — | 0 | 0 | 0 | is the design |
| 18 | *(not in the candidate list)* Static content pages + footer store presentation | `NEW` → `APP11-S05` | `docs/08-SEO-AND-CONTENT.md` §2 requires Service, FAQ, Local and Policy page types, and none exists. The footer deliberately carries no contact, address or policy link (`FU-APP10-D01-05`, carried from `APP1-S01A`). Storefront-owned static content, no CMS — see §H | D01 | 0 | 0 | +4 Storefront | required |

**Net:** 17 candidates → 4 removed or absorbed as already delivered, 5 merged
away, 5 renamed or split, 4 kept, 2 new.

---

## E. Existing capability inventory

### E.1 Storefront

| Capability | Status | Owner / evidence |
|---|---|---|
| Shared shell (header, `<main>`, footer, mobile drawer) | `ALREADY_DELIVERED` | `APP1-S01A`, against seven approved D02 rows |
| Not-found boundary | `ALREADY_DELIVERED` | `APP1-S01B` |
| Homepage `/` | **`MISSING`** | CP0 scaffold placeholder |
| Discover masonry `/kham-pha` | `ALREADY_DELIVERED` | `APP2-S01`; UI02 5/3/2 columns, variable heights, linear DOM order |
| Category filtering | `ALREADY_DELIVERED` | `?category=<slug>`, four-slug closed set from the contract enum |
| Cursor continuation | `ALREADY_DELIVERED` | `nextCursorOf`, `hasNext` |
| Empty / loading / error states | `ALREADY_DELIVERED` | five dedicated components |
| Product Detail `/san-pham/[slug]` | `ALREADY_DELIVERED` | `APP2-S02`; hero gallery, lightbox, breadcrumb, share |
| Discover → Detail internal link | `ALREADY_DELIVERED` | whole card is one anchor (`product-card.tsx`) |
| Image alt text | `ALREADY_DELIVERED` (derived) | `thumbnailAlt(card.name)`; missing image is `role="img"` + `aria-label` |
| Floating Zalo/Messenger dock | `ALREADY_DELIVERED` | `APP10-I01` + E01 relocation; **stays floating**, not returned to the footer |
| Footer contact / address / policy links | **`MISSING`** | footer comment: "no address, phone number, e-mail or policy route is invented here"; `FU-APP10-D01-05` |
| Gallery entry surfaces | **`MISSING`** | no route, no feature module |
| Service / FAQ / Local / Landing / Policy pages | **`MISSING`** | no routes |
| Nav items `Bộ sưu tập`, `Studio`, `Nhật ký` | `route: null`, non-interactive by design | `STOREFRONT_PRIMARY_NAV`; deliberately never a dead anchor |

### E.2 Admin

23 routes across assets, products, design templates, requests, orders,
production and customer-access support. **No gallery route and no content
route.** `ADMIN_PRIMARY_NAV` has eight entries and no gallery entry. Its rule —
"every item points at a route that exists" — is the reason `Kho` is still absent
(`FU-APP8-A01-04`), and the same rule governs when a gallery entry may join.

### E.3 Backend

115 operations, of which 40 are `/api/public/*`. **Zero** touch gallery or
content. `publicProduct_list` accepts `categorySlug` (four-value enum), `limit`
(1–100) and an opaque `cursor`; `PublicProductSummaryResponse` carries
`category`, `isDisplayOutOfStock`, `name`, `price`, `slug`, `thumbnail`.
`PublicProductDetailResponse` adds `description`, `media` and `seo`;
`PublicProductSeoResponse` is `{ title, description, isIndexable }`.

**There is no public category-list operation, and none is needed** — the four
categories are a closed contract enum mirrored in
`features/product-discovery/model/discover-categories.ts`.

### E.4 Database

See §B.2. Every table APP11 needs already exists, indexed for the exact queries
APP11 will issue.

### E.5 Media and assets

`assets` carries `kind`, `classification`, `storage_key`, `mime_type`,
`checksum`, `deletion_reason`. Public delivery today is **product-scoped**:
`GET /api/public/products/{slug}/media/{productMediaId}/{rendition}`, served by
`apps/api/src/modules/catalog/` with its own policy, service, repository and
contract spec. Derivatives are produced by the APP2 worker at asset intake.

**No alt-text column exists anywhere** — not on `assets`, not on `product_media`,
not on `gallery_entry_assets`. The delivered, accepted precedent is derivation
from the entity's own title (`thumbnailAlt(card.name)`).

### E.6 Content

`content_pages`, `redirect_rules`, `agreements`, `agreement_versions` all exist
with repositories. Only `agreements` has a consumer: `PublishApp6AgreementsUseCase`,
which the Content module documents as "a bootstrap action, not a request, and
there is no agreement-publish HTTP operation anywhere in the API". `content_pages`
and `redirect_rules` have **no consumer at all**.

### E.7 SEO

See §K.

### E.8 Routes

12 Storefront (`/`, `/kham-pha`, `/san-pham/[slug]`, `/san-pham/[slug]/thiet-ke`,
`/truy-cap` ×5, `/xac-minh-lien-he`, `/yeu-cau/moi`, `/yeu-cau/da-gui`) and 23
Admin.

---

## F. Design authority / coverage matrix

### F.1 The reconciliation that governs this section

`docs/design/FIGMA_DESIGN_INDEX.md` §4.3.1 records a governance failure that is
the single most important precedent for APP11, and it describes this phase almost
exactly:

> `APP2-D01` originally created a **uniform, equal-height ecommerce card grid**
> for the Storefront Product List. The Product Owner **rejected that direction**
> … The regression was one of *authority*, not execution — **an already-covered
> capability was redesigned from scratch because its existing registry title did
> not literally read "Product List"**.

`APP2-D01-C1` deleted four frames from Figma and retired their registry IDs.
§4.4.3 then locked the invariants and named the forbidden reasoning verbatim:
"redesigning an already covered capability merely because its registry title does
not literally contain 'Product List'" and "treating `DRAFT` content status as
absence of visual authority."

§4.4.2 is equally binding: approval status, visual authority, structural
authority and **content maturity** are independent axes. The four UI02 rows carry
status `DRAFT` **only** because their 59 cards are named
`StudioWorkCard · TEMP_ASSET` — their visual and structural authority is marked
`REQUIRED`, and the registry states in bold: "`DRAFT` never means 'ignore this
design and create a new screen.'"

**APP11 therefore redraws nothing that already covers a capability.** An APP11
concept called "gallery feed" is satisfied by the approved "Discover Feed"
architecture wherever the capability, interaction and visual contract match.

### F.2 Coverage matrix

| APP11 capability | Route / surface | Current implementation | Figma registry ID | Live node | Approval status | Reuse provenance | Gap | Disposition |
|---|---|---|---|---|---|---|---|---|
| Shared shell (header/nav/main/drawer) | all Storefront | `APP1-S01A` | `FIG-STOREFRONT-SHELL-{DESKTOP,TABLET,MOBILE}-DEFAULT`, `…-MOBILE-NAVOPEN` | `405:2225`, `405:3733`, `405:3786`, `410:2311` | `APPROVED_FOR_IMPLEMENTATION` (`FIG-APPROVAL-APP1-D02-STOREFRONT-001`) | APP1-D02 | none | **`APPROVED_REUSABLE`** — do not redraw |
| Not-found boundary | `/404` | `APP1-S01B` | `FIG-STOREFRONT-NOTFOUND`, `…-MOBILE` | `411:2337`, `411:3851` | `APPROVED_FOR_IMPLEMENTATION` | APP1-D02 | none | **`APPROVED_REUSABLE`** |
| Public discovery masonry | `/kham-pha` | `APP2-S01` | `FIG-UI02-DISCOVER-{SECTION,DESKTOP,TABLET,MOBILE}` | `208:538`, `208:2002`, `224:871`, `226:1038` | `DRAFT` **content maturity**; visual + structural authority `REQUIRED` (§4.4.1/§4.4.2) | APP2-D01-C1, `REUSE_AND_SUPPLEMENT_ONLY` | none for discovery | **`APPROVED_REUSABLE`** — masonry is locked (§4.4.3); redrawing it is the §4.3.1 failure |
| Product Detail | `/san-pham/[slug]` | `APP2-S02` | 10 × `FIG-S02-PRODUCT-DETAIL-*` | `529:2224`, `529:2225`, `529:2431`, `529:2575`, `532:3`, `532:105`, `533:3`, `533:26`, `537:3`, `537:38` | `APPROVED_FOR_IMPLEMENTATION` (`FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001`) | APP2-S02-G01 | none | **`APPROVED_REUSABLE`** |
| **Homepage / store introduction** | `/` | **CP0 placeholder** | `FIG-STOREFRONT-SHELL-{DESKTOP,TABLET,MOBILE}` (UI01 Homepage) | `183:7`, `189:266`, `191:412` | **`SUPERSEDED`** — shell role moved to D02; retained only as "Homepage design references" | APP1-S01 | **No `APPROVED_FOR_IMPLEMENTATION` Homepage row exists anywhere in 491 rows.** The only Homepage authority is three superseded frames | **`APPROVED_REQUIRES_SUPPLEMENT`** → D01 reconciles UI01 into an approved Homepage package, reusing its visual language rather than inventing a new one |
| **Storefront footer — store presentation** | shell footer | delivered, deliberately content-free | `FIG-DS-FOOTER` | DS library | `APPROVED` (stable DS reference) | APP1-D02 | Footer draws **no** contact block, address, store info or policy column | **`APPROVED_REQUIRES_SUPPLEMENT`** → bounded footer supplement in D01; closes `FU-APP10-D01-05` |
| External contact handoff (floating dock) | shell, all pages | `APP10-I01` + E01 relocation | `FIG-APP10-I01-{FOOTER-DESKTOP,FOOTER-MOBILE,CTA-STATES,HANDOFF-SPEC}` | `843:*` family | **`REVIEW_REQUIRED`** — frames still draw a **footer column**; the accepted runtime is a floating dock | APP10-I01 | Documentation lags the PO-accepted runtime (`FU-APP10-E01-01`) | **`STALE`** → reconcile inside D01's footer supplement — same node family, same surface. **Runtime stays floating; it is not reverted to the footer** |
| **Public gallery feed** ⟵ *corrected by C1* | `/bo-suu-tap` | none | unregistered | `329:2`, `339:2`, `343:2`, `353:2`, `357:3` | **`APP11_GALLERY_FULL_AUTHORITY`** — live UI05 Collections Index, H1 `Bộ sưu tập`, 3/2/1 masonry, states drawn | UI05 (UI02 masonry language) | registration + relabelling only | **`REGISTER_EXISTING`** → D01. **Not redrawn.** Follows UI05's density, *not* UI02's 5/3/2 (C1 §E, §F) |
| **Gallery entry detail** ⟵ *corrected by C1* | `/bo-suu-tap/[slug]` | none | unregistered | `334:6`, `341:2`, `348:2` | **`APP11_GALLERY_PARTIAL_AUTHORITY`** — live UI05 Collection Detail | UI05 + `APP2-S02` `533:3`/`533:26` | `Member Works` `336:3366` has no persistence; no ordered image set/lightbox; no linked-product affordance | **`SUPPLEMENT_EXISTING`** → D01. Reuse hero/narrative/breadcrumb/related; swap Member Works for the ordered `gallery_entry_assets` set + lightbox (C1 §F.3) |
| **Static content pages** (Service, FAQ, Local, Policy) | new | none | — | — | **`MISSING`** | — | No frame for any of the four | **`MISSING`** → D01, as **one** shared content-page template with per-type content slots, not four bespoke screens |
| **Admin gallery list** | new | none | — | — | **`MISSING`** | Admin Product List `FIG-ADMIN-CATALOG-*` is the structural precedent | No gallery Admin frame | **`MISSING`** → D01 |
| **Admin gallery editor + publication** | new | none | — | — | **`MISSING`** | Admin Product Form + Publication frames are the structural precedent | No gallery Admin frame | **`MISSING`** → D01 |
| Admin content-page CMS | — | none | — | — | **`NOT_REQUIRED`** | — | — | **`NOT_REQUIRED`** — no canonical Admin operation exists (§H) |
| Discovery category chips / filters | `/kham-pha` | delivered | covered by UI02 §4.4.3 ("chip/filter treatment") | `208:538` | as UI02 | APP2-D01-C1 | none | **`APPROVED_REUSABLE`** |
| ~~`Bộ sưu tập` (UI05) / `Nhật ký` nav areas~~ ⟵ **WITHDRAWN by C1** | — | — | — | — | — | — | — | **This row was wrong.** It bundled two unrelated things and classified UI05 from its name without opening it. C1 opened `328:1739` live: UI05 is a complete 21-child Collections package and **is** APP11 Gallery authority (see the two corrected rows above). `Nhật ký` / `Journal` (`183:140`) separately remains `NOT_REQUIRED` — a blog is excluded by `08` §2 and PRD §2.3 |
| robots / sitemap / OG image | new | none | — | — | **`NOT_REQUIRED`** (non-visual) | — | — | **`NOT_REQUIRED`** — framework artifacts, no design authority needed |

### F.3 Decision

```text
APP11_DESIGN_DISPOSITION = REUSE_AND_SUPPLEMENT
APP11_D01_REQUIRED       = true
```

> **Corrected by `APP11-G01-C1`.** The disposition and `APP11_D01_REQUIRED = true`
> both stand, but the paragraph below overstates the delta. Live evidence reduces
> "seven surfaces with no approved authority" to **three** — the content-page
> template and the two Admin gallery screens. The gallery feed and gallery entry
> detail have live UI05 authority; the Homepage has live UI01 content authority;
> the footer is a supplement. See C1 §L for the corrected scope, which is the
> binding one.

D01 is retained because seven implementation-critical surfaces have **no**
approved authority — Homepage, the footer store-presentation block, the gallery
feed, the gallery entry detail, the content-page template, and the two Admin
gallery screens. It is **one** bounded phase-level package, never split across
coding checkpoints. It **reuses** the approved shell, the locked UI02 masonry
architecture and the approved Product Detail architecture, and it redraws none
of them.

D01 preconditions, both mandatory — **both RESOLVED at `APP11-G01-C1`**:

1. ~~Figma MCP access restored (`OPS-APP11-001`)~~ — **RESOLVED**, remote Figma
   MCP authorized; `FIGMA_LIVE_ACCESS = PASS`.
2. ~~`PO-APP11-001` route paths confirmed~~ — **RESOLVED**, locked in C1 §J.

---

## G. Gallery / discovery disposition

Every APP11 gallery and discovery requirement, classified:

| Requirement (source) | Status | Owner or gap |
|---|---|---|
| Image-led public discovery | `ALREADY_DELIVERED` | `/kham-pha`, `APP2-S01` |
| Pinterest-inspired masonry, 5/3/2 columns, variable heights | `ALREADY_DELIVERED` | UI02 invariants, §4.4.3 |
| Linear DOM/source reading order under visual masonry | `ALREADY_DELIVERED` | locked accessibility invariant |
| Category grouping "theo loại sản phẩm" (PRD §2.3) | `ALREADY_DELIVERED` for products | `?category=<slug>`, four-value enum |
| Continuation / pagination | `ALREADY_DELIVERED` | cursor + `hasNext` |
| Empty / loading / error | `ALREADY_DELIVERED` | five components |
| Work detail page | `ALREADY_DELIVERED` | `/san-pham/[slug]` |
| Internal link discovery → detail | `ALREADY_DELIVERED` | whole-card anchor |
| Real product photography (PRD §2.3 "Hình ảnh sản phẩm thật") | `PARTIAL` | pipeline delivered; gallery entries have no surface |
| Short descriptive copy (PRD §2.3 "Nội dung mô tả ngắn") | `MISSING` | `gallery_entries.description` has no reader |
| Link to related product/service (PRD §2.3) | `MISSING` | `linked_product_id` has no reader |
| Gallery SEO optimization (PRD §2.3, `08` §6) | `MISSING` | `seo_title`, `seo_description`, `is_indexable` have no reader |
| Admin: upload gallery images, title/description, link, categorize, alt text, publish/unpublish, reorder (`07` §4) | `MISSING` | no operation, no screen |
| Grouping "theo phong cách hoặc nhu cầu" (PRD §2.3) | `DEFERRED_BY_PRODUCT_SCOPE` | no column and no taxonomy table; DB4/DB5 modelled `gallery_entries` deliberately without one. See §J.2 |
| Blog | `NOT_REQUIRED` | `08` §2 and PRD §2.3 both exclude it |

### G.1 Does the existing Discover satisfy APP11?

**Partly, and the part it satisfies is not rebuilt.**

`/kham-pha` fully satisfies public *product* discovery. It does **not** satisfy
the gallery requirement, and the difference is structural rather than cosmetic:

| | Product (`products`) | Gallery entry (`gallery_entries`) |
|---|---|---|
| Purpose | a buyable catalog item | a showcase of completed work |
| Slug | `products.slug` | its own `uq_gallery_entries__slug` |
| Body copy | `description` (optional) | `description` **NOT NULL** — `08` §6: "not image-only pages" |
| Ordering | catalog rules | operator-controlled `display_order` (`07` §4 "Reorder") |
| Product link | is the product | **optional** `linked_product_id` |
| Media | `product_media`, roles THUMBNAIL/GALLERY/DETAIL | `gallery_entry_assets`, ordered, **public derivatives only** (CST-123) |
| Category | required, four-value enum | none |
| Aggregate | AGG-06, CTX-CAT | **AGG-18, CTX-GAL** |

They are separate bounded contexts with separate tables, separate uniqueness and
separate lifecycles. A gallery entry can exist with no product at all — that is
the whole point of `linked_product_id` being nullable with `ON DELETE SET NULL`,
"so a delisted/archived product must not orphan the entry."

**No duplicate discovery architecture is created.** The gallery feed reuses
UI02's masonry architecture, `StudioWorkCard` pattern and continuation
treatment; it is a second *dataset* on the approved discovery language, not a
second discovery language. `/kham-pha` remains the sole product Discover route,
and no alias is created around it.

---

## H. Content / CMS disposition

```text
APP11_CONTENT_MODEL = EXISTING_MODELS_SUFFICIENT
```

Resolved separately for the two content families, because the authority differs:

**Gallery — operationally managed, existing model.** `docs/07-ADMIN-OPERATIONS.md`
§4 enumerates seven Admin gallery operations explicitly (upload images, add title
and description, link to products/services, categorize entries, configure alt
text, publish/unpublish, reorder), and PRD §12 lists "Quản lý gallery" among the
single Admin account's capabilities. `gallery_entries` + `gallery_entry_assets`
carry every field those operations need. Admin surfaces are therefore built —
against the **existing** tables.

**Content pages — static, Storefront-owned, no CMS.** Three independent
authorities agree:

1. `docs/07-ADMIN-OPERATIONS.md` has twelve sections and **no content-page
   section**. There is no canonical Admin authority to author, publish or
   unpublish a content page. Building one invents Admin scope.
2. The strongest precedent in this repository is the sibling aggregate in the
   very same module: `PublishApp6AgreementsUseCase` publishes legal agreement
   content with **no HTTP operation at all**, because "publication is a bootstrap
   action, not a request."
3. This repository's established convention for user-facing copy is a typed copy
   module — `DISCOVER_COPY`, `STOREFRONT_SHELL_COPY`, `CUSTOM_REQUEST_COPY`,
   `ASSET_COPY`. Static content in a named copy module **is** the convention, not
   a violation of CLAUDE.md §5, which forbids hard-coding copy inline in
   components, not owning it in a module.

`content_pages` and `redirect_rules` therefore remain **delivered persistence
with no runtime consumer** at the end of APP11. That is recorded as a deliberate
deferral (`FU-APP11-G01-01`, `FU-APP11-G01-02`), not an oversight.

**Not created, and explicitly forbidden for this phase:** a generic CMS, a
page-builder, component JSON, a plugin system, a blog engine, a draft/review
workflow beyond `gallery_entries`' LC-04 states, any role-model expansion, and
any localization architecture.

### H.1 Redirect runtime

`redirect_rules` is delivered and unconsumed. `08` §5 lists "Redirect
management" as a technical SEO requirement, but this is a greenfield site with
**no legacy URLs to redirect** and no public traffic. Building redirect
middleware now would query an empty table on every request. Recorded as
`FU-APP11-G01-02` and recommended to **APP12**, which owns go-live readiness —
the point at which a redirect has something to redirect.

---

## I. OpenAPI / backend disposition

```text
EXPECTED_APP11_HTTP_DELTA = +11 operations   (115 → 126)
```

Every retained operation, justified individually. Paths are proposals subject to
each checkpoint's own contract review; the **count and purpose** are what this
section locks.

### I.1 `APP11-B01` — Admin gallery entry authoring (4)

| Method | Path | Purpose | Authz | Request | Response | Why no existing operation can serve it |
|---|---|---|---|---|---|---|
| GET | `/api/admin/gallery-entries` | list with status filter + pagination | staff session | query | paginated summaries | No gallery operation exists. `adminProduct_*` reads `products`, a different aggregate |
| POST | `/api/admin/gallery-entries` | create a DRAFT entry | staff session | title, slug, description, displayOrder, optional linkedProductId | entry | `GalleryEntryRepository.create` has no caller |
| GET | `/api/admin/gallery-entries/{id}` | full entry incl. assets + SEO | staff session | — | entry detail | — |
| PATCH | `/api/admin/gallery-entries/{id}` | edit title/description/SEO/link/order | staff session | partial | entry | — |

`GalleryEntryRepository` has **no list query**. B01 adds one to the repository
contract; the partial index IDX-066 covers the published case, and the Admin case
is a small unfiltered scan over a deliberately tiny table (DB5 rejection entry
R15: "table is tiny").

### I.2 `APP11-B02` — Admin gallery media + publication (3)

| Method | Path | Purpose | Authz | Notes |
|---|---|---|---|---|
| PUT | `/api/admin/gallery-entries/{id}/assets` | set the ordered asset selection | staff session | Mirrors the `APP2-B02` ordered-media-selection shape. **Must reject any asset not classified `PUBLIC`** — `attachAsset` already enforces CST-123, and this is the operation that exercises it |
| POST | `/api/admin/gallery-entries/{id}/publication` | publish (DRAFT → PUBLISHED) | staff session | Readiness: non-empty title, slug, description, ≥1 public asset |
| DELETE | `/api/admin/gallery-entries/{id}/publication` | unpublish (→ DRAFT or ARCHIVED) | staff session | `archived_at` is evidence only, never a filter (TBL-064) |

### I.3 `APP11-B03` — Public gallery reads + media delivery (3)

| Method | Path | Purpose | Authz | Notes |
|---|---|---|---|---|
| GET | `/api/public/gallery-entries` | published feed, `(display_order, id)` | anonymous | Served by IDX-066, whose partial predicate **is** the security scope — DRAFT/ARCHIVED can never appear |
| GET | `/api/public/gallery-entries/{slug}` | one published entry + ordered assets + SEO | anonymous | Unknown slug, DRAFT and ARCHIVED must be **indistinguishable** — the `APP2-S02` safe-not-found precedent |
| GET | `/api/public/gallery-entries/{slug}/assets/{assetId}/{rendition}` | public derivative | anonymous | **Cannot reuse** `publicProductMedia_get`: that route is keyed by `products.slug` + `product_media.id` and re-checks *product* publication. A gallery entry has neither. Policy, service and repository follow the `catalog/` public-media family exactly |

### I.4 `APP11-B04` — Public SEO inventory (1)

| Method | Path | Purpose | Authz | Notes |
|---|---|---|---|---|
| GET | `/api/public/sitemap-entries` | the indexable URL inventory: `{ kind, slug, updatedAt }` for published + indexable products and gallery entries | anonymous | See I.5 |

### I.5 Why the sitemap needs its own operation

`PublicProductSummaryResponse` carries **no `isIndexable`** — only
`PublicProductDetailResponse.seo` does. A sitemap built by paginating
`publicProduct_list` would therefore list every published product **including
those the operator marked non-indexable**, which is an SEO defect, not a
cosmetic one. The two available fixes are:

- add `isIndexable` to the delivered `APP2-B04` summary contract and crawl the
  whole catalog page by page on every sitemap request; or
- one dedicated inventory read.

The second is chosen: it leaves the delivered APP2 contract untouched, it is a
single operation, and it is precisely the query DB5 built **IDX-067** for and
named **Q-06, "sitemap scan"**. The response is path-agnostic (kind + slug), so
route shape stays Storefront authority and no API operation encodes a browser
path.

### I.6 Rejected backend work

- **Public category list** — the four categories are a closed contract enum,
  already mirrored client-side. No operation.
- **Content-page read/write API** — §H.
- **Redirect resolution API** — §H.1.
- **SEO-metadata API** — title/description/OG defaults for static pages stay
  authoritative in Storefront copy modules. Per-product and per-gallery SEO is
  already contract-carried.
- **Gallery CRUD "because an Admin screen exists"** — every operation above is
  justified by a named `07` §4 Admin operation.

---

## J. Database disposition

```text
APP11_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
EXPECTED_APP11_MIGRATION_DELTA = 0   (stays at 37)
```

Tables inspected in full: `gallery_entries`, `gallery_entry_assets`,
`content_pages`, `redirect_rules`, `agreements`, `agreement_versions`,
`product_media`, `assets`, `products`. Migration `0018` inspected.

Every field APP11 needs already exists, with the required lifecycle states,
uniqueness and indexes. No table is created, altered or dropped.

Two residual limitations are recorded rather than resolved by inventing schema,
because locked database decisions keep their authority (CLAUDE.md §2) and an
implementation phase does not reopen them.

### J.1 Per-image alt text

`07` §4 says Admin can "Configure alt text", but **no alt column exists
anywhere** — not on `assets`, not on `product_media`, not on
`gallery_entry_assets`. The delivered and PO-accepted precedent is derivation
from the entity title: `product-card.tsx` renders `alt={thumbnailAlt(card.name)}`
and gives a missing image `role="img"` with an `aria-label`. **Gallery follows
the same precedent**, deriving alt from `gallery_entries.title`, which satisfies
`08` §4 ("Alt text") and §6 for a page that is not image-only. Per-image
*configurable* alt has no column and is carried as `FU-APP11-G01-03`.

### J.2 Style / need grouping

PRD §2.3 asks for grouping "theo phong cách hoặc nhu cầu". `gallery_entries` has
no taxonomy column, and DB4/DB5 modelled the table deliberately with
`linked_product_id` as its only relationship ("optional SEO link", REL-096) and
no category. Grouping by **product type** is representable today by resolving the
linked product's category — the same four-value closed set the Discover chips
already use — with unlinked entries ungrouped. Style/need grouping is
`DEFERRED_BY_PRODUCT_SCOPE` and carried as `FU-APP11-G01-04`. **No speculative
taxonomy table is proposed.**

---

## K. SEO baseline

Measured against `docs/08-SEO-AND-CONTENT.md` §4 and §5.

### K.1 On-page (§4)

| Item | Status | Ownership | Evidence |
|---|---|---|---|
| SEO title | `PARTIAL` | ROUTE-LEVEL + CONTENT-DRIVEN | 10 of 12 routes export `metadata` or `generateMetadata`. Product Detail uses `product.seo.title ?? product.name`. **Homepage title is the CP0 string** `"Embroidery Commerce — Storefront"` |
| Meta description | `PARTIAL` | same | Same coverage; the root-layout description is a scaffold string |
| Canonical URL | `PARTIAL` | ROUTE-LEVEL | Only `/san-pham/[slug]` sets one, and it is **relative** — the code states "The Storefront declares no `metadataBase`, and fabricating a host to satisfy a canonical tag is how a staging hostname ends up in production markup." `/kham-pha` sets none, and its stated reason — "the Product Detail route is unresolved (IMP-D038)" — **is now stale**: IMP-D039 locked `/san-pham/[slug]` |
| Social preview image | **`MISSING`** | STATIC / FRAMEWORK | No `opengraph-image`, no `openGraph` metadata anywhere. Product Detail explicitly declines: "no social-image policy exists yet, and picking one here would quietly become it" |
| Structured heading hierarchy | `ALREADY_DELIVERED` | ROUTE-LEVEL | Shell owns `<main>`; each page owns its `<h1>`; cards use `<h2>` |
| Alt text | `ALREADY_DELIVERED` (derived) | CONTENT-DRIVEN | §J.1 |
| Internal links | `PARTIAL` | ROUTE-LEVEL | Discover → Detail, Detail → Discover, category chips and empty-state recovery are all live. Homepage links nowhere; three nav areas are `route: null`; the footer has no links |
| Breadcrumb | `PARTIAL` | ROUTE-LEVEL | Product Detail renders a visual breadcrumb (desktop/tablet) and `← Quay lại Khám phá` (mobile). **No `BreadcrumbList` structured data anywhere** |
| Structured data | **`MISSING`** | ROUTE-LEVEL | No JSON-LD in the codebase. Product Detail declines deliberately: price/availability/date/author "would be a claim invented at render time" |
| Index / noindex control | `ALREADY_DELIVERED` | ROUTE-LEVEL + CONTENT-DRIVEN | See K.3 |

### K.2 Technical (§5)

| Item | Status | Ownership | Evidence |
|---|---|---|---|
| Server-rendered indexable content | `ALREADY_DELIVERED` | STATIC / FRAMEWORK | Every public route is a Server Component; `/kham-pha` and `/san-pham/[slug]` are `force-dynamic` with server-side first-page hydration |
| Sitemap | **`MISSING`** | STATIC / FRAMEWORK + BACKEND-DRIVEN | No `sitemap.ts`. Needs B04 |
| Robots control | **`MISSING`** (file) / delivered (per-page) | STATIC / FRAMEWORK | No `robots.ts`. Per-route `robots` metadata is delivered |
| Canonicalization | `PARTIAL` | ROUTE-LEVEL | One route only, and relative |
| Clean URLs | `ALREADY_DELIVERED` | ROUTE-LEVEL | Vietnamese slugs, server-owned, `[a-z0-9-]`, no aliases; `encodeURIComponent` as a second barrier |
| Redirect management | `MISSING` runtime / delivered persistence | BACKEND-DRIVEN | §H.1 — deferred to APP12 |
| Image optimization | `PARTIAL` | ROUTE-LEVEL | `loading="lazy"`, `decoding="async"`, but a plain `<img>` rather than `next/image`, for a recorded reason: the API route is publication-gated and `no-store`, and `APP2-B04` publishes no intrinsic dimensions, so `next/image` "would mean inventing a ratio and cropping every artwork to it, which is exactly what UI02's variable-height masonry must not do." **Not reopened by APP11** |
| Core Web Vitals | `MISSING` (evidence) | — | No budget evidence recorded. Performance and UAT are APP12's |
| Mobile-first | `ALREADY_DELIVERED` | ROUTE-LEVEL | Approved responsive shell; three-viewport designs throughout |
| No critical SEO text inside canvas | `ALREADY_DELIVERED` | ROUTE-LEVEL | The Studio is `noindex`; all indexable copy is DOM text |
| Metadata outside image assets | `ALREADY_DELIVERED` | CONTENT-DRIVEN | Title, description and category are contract fields |

### K.3 Indexing boundaries — audited route by route

| Route | Should index | Current | Verdict |
|---|---|---|---|
| `/` | yes | inherits layout metadata, no `robots` | `PARTIAL` — indexable but scaffold content |
| `/kham-pha` | yes | metadata, no `robots` → indexable | correct; canonical missing |
| `/san-pham/[slug]` | yes, per product | `robots: { index: product.seo.isIndexable, follow: true }` | **correct and content-driven** |
| `/san-pham/[slug]/thiet-ke` | no | `generateMetadata` | **verify at S04** |
| `/truy-cap` | no | `robots: { index: false, follow: false }` | correct |
| `/truy-cap/bao-gia` | no | `index: false, follow: false` | correct |
| `/truy-cap/duyet-thiet-ke` | no | metadata present | verify at S04 |
| `/truy-cap/thanh-toan` | no | metadata present | verify at S04 |
| `/truy-cap/thanh-toan-con-lai` | no | metadata present | verify at S04 |
| `/xac-minh-lien-he` | no | `index: false, follow: false` | correct |
| `/yeu-cau/moi` | no | `index: false, follow: false` | correct |
| `/yeu-cau/da-gui` | no | metadata present | verify at S04 |
| Admin app (23 routes) | no | separate application and hostname | outside the Storefront crawl surface; `robots.ts` must still not advertise it |

The secure routes carry an explicit and well-reasoned convention: "No SEO copy,
no canonical, no Open Graph: none of those fields may carry a token, and the
simplest way to guarantee that is to have none of them." **`APP11-S04` must not
weaken this.** Adding `metadataBase` and default Open Graph at the root layout
would otherwise cause secure routes to *inherit* an OG block they deliberately
refuse — S04 must scope defaults so the four verified-`noindex` routes and the
five still to be verified keep exactly what they have today.

### K.4 The blocking technical dependency

The Storefront declares **no `metadataBase`** and has **no public-origin
configuration of its own**. `STOREFRONT_PUBLIC_ORIGIN` (IMP-D050) exists only in
`apps/worker`, where it is strictly validated (absolute, `https:`/`http:`, no
credentials, no query, no fragment, no path, fail-closed).

Absolute canonical URLs, `sitemap.xml` and Open Graph `url`/`image` **all**
require an absolute origin. `APP11-S04` must therefore promote the same variable
to the Storefront runtime with the same fail-closed validation. Per IMP-D050,
**four lookalike variables exist and none may be promoted in its place** — S04
must read that decision before touching configuration.

---

## L. Route disposition

| Route | Class | Justification |
|---|---|---|
| `/` | **`EXISTING_EXTEND`** | Homepage-owned by locked IA (`STOREFRONT_HOME_ROUTE`); `APP11-S01` replaces the CP0 placeholder |
| `/kham-pha` | **`EXISTING_REUSE`** | Product Discover. No alias, no duplicate, no redirect. Untouched |
| `/kham-pha?category=<slug>` | **`EXISTING_EXTEND`** | Serves `08` §2's "Category page" without a new route. S04 adds a self-canonical per category and lists the four in the sitemap |
| `/san-pham/[slug]` | **`EXISTING_REUSE`** | Product page. Untouched |
| `/san-pham/[slug]/thiet-ke` | **`EXISTING_REUSE`** | Studio. `noindex` to be verified at S04 |
| `/truy-cap/*`, `/xac-minh-lien-he`, `/yeu-cau/*` | **`EXISTING_REUSE`** | Private. Must stay non-indexable and absent from the sitemap |
| Gallery feed | **`NEW_REQUIRED`** | `gallery_entries` is a distinct aggregate (§G.1) with no surface |
| Gallery entry detail | **`NEW_REQUIRED`** | `08` §6 requires a text-bearing entry page |
| Service page | **`NEW_REQUIRED`** | `08` §2 |
| FAQ page | **`NEW_REQUIRED`** | `08` §2 |
| Local / store page | **`NEW_REQUIRED`** | `08` §2 |
| Policy pages | **`NEW_REQUIRED`** | `08` §2; also the footer's missing policy column |
| Landing pages | **`DEFERRED_BY_PRODUCT_SCOPE`** | `08` §3 lists seven example topics but §7 forbids mass-generated low-value pages. The `LANDING` page type stays available in `content_pages`; no instance ships in APP11 |
| Admin gallery list | **`NEW_REQUIRED`** | `07` §4 |
| Admin gallery entry detail | **`NEW_REQUIRED`** | `07` §4 |
| Admin content CMS | **`NOT_REQUIRED`** | §H |
| `/robots.txt`, `/sitemap.xml` | **`NEW_REQUIRED`** | `08` §5; framework route files, not pages |

```text
EXPECTED_APP11_ROUTE_DELTA = +6 Storefront pages, +2 Storefront route files,
                             +2 Admin pages
  Storefront 12 → 18 pages   (gallery feed, gallery detail, service, FAQ,
                              local, policy)
  Admin      23 → 25 pages   (gallery list, gallery entry)
```

### L.1 `PO-APP11-001` — route paths

Route authority is Product Owner authority, never a Figma label (IMP-D038) and
never invented by an implementation checkpoint. The delivered public paths are
Vietnamese, server-owned and alias-free: `/kham-pha`, `/san-pham`, `/yeu-cau`,
`/truy-cap`, `/xac-minh-lien-he`. Recommended defaults, following that pattern:

```text
SUPERSEDED — these were recommendations only. Do not implement them.
gallery feed          /thu-vien              → superseded by /bo-suu-tap
gallery entry detail  /thu-vien/[slug]       → superseded by /bo-suu-tap/[slug]
service page          /dich-vu/[slug]        → superseded by /dich-vu (singular)
FAQ                   /cau-hoi-thuong-gap    → unchanged, confirmed
local / store page    /cua-hang/[slug]       → superseded by /cua-hang (singular)
policy pages          /chinh-sach/[slug]     → unchanged, confirmed
Admin gallery list    /thu-vien              → superseded by /gallery
Admin gallery entry   /thu-vien/[entryId]    → superseded by /gallery/[entryId]
```

**`PO-APP11-001 = RESOLVED` at `APP11-G01-C1`.** The binding paths are in C1 §J:

```text
/kham-pha (unchanged) · /san-pham/[slug] (unchanged)
/bo-suu-tap · /bo-suu-tap/[slug]
/dich-vu · /cau-hoi-thuong-gap · /cua-hang · /chinh-sach/[slug]
Admin: /gallery · /gallery/[entryId]
```

No aliases (`/thu-vien`, Storefront `/gallery`, `/collections`, `/store`) and no
redirects for them. The paragraph below about `(page_type, slug)` still holds:
the three singular routes each bind a fixed `page_type` to one canonical slug, so
the lookup stays unambiguous without a catch-all `/[slug]`.

Because `content_pages` is keyed `(page_type, slug)`, the page type must appear
in the path or the lookup is ambiguous — which is why a single catch-all
`/[slug]` is rejected. ~~The Product Owner confirms these paths **at
`APP11-D01`**~~ — **superseded: the Product Owner locked the paths at
`APP11-G01-C1` (C1 §J).** D01 labels the locked paths on canvas; it does not
choose them. No implementation checkpoint proceeds on an unconfirmed public path.

---

## M. APP10 follow-up disposition

The four items named for re-disposition, plus the two adjacent ones this audit
proved belong to APP11.

| Follow-up | Disposition | Reasoning |
|---|---|---|
| `FU-APP10-G01-02` — no business-event notification producer (absorbs `FU-APP9-B01-01`, SE-010 `payment.final-requested`) | **`NOT_APP11` → route to APP12** | Commerce/order-surface debt. Payment and order events have nothing to do with gallery, content, SEO or store presentation. APP10-X01 itself asked that it "return to a commerce phase"; APP11 is not one, and APP12 owns cross-cutting readiness. **APP11 does not absorb it** |
| `FU-APP10-G01-03` — customer shipping-fee acknowledgement UI (`BACKEND_READY / UI_DEFERRED`) | **`NOT_APP11` → route to APP12** | Same. A secure-link order surface, deliberately `noindex`, outside every APP11 capability |
| `FU-APP10-E01-01` — the four `FIG-APP10-I01-*` frames still draw a footer column while the accepted runtime is a floating dock | **`ABSORB_INTO_APP11-D01`** — bounded, same surface | This is **not** unrelated debt. `APP11-D01` must supplement the Storefront footer anyway to add the store-presentation and policy block (`FU-APP10-D01-05`), and these four rows document that exact node family. Reconciling them in the same package is one pass over one surface, not a cleanup excursion. **The runtime stays a floating bottom-right dock and is not reverted to footer placement** — D01 documents what was accepted; it does not change it |
| `FU-APP10-E01-02` — no SCSS compile gate; six fatal stylesheet defects reached `production` and took both applications down | **`ABSORB_AS_BOUNDED_ITEM_IN_APP11-S01`** | APP11 is the most SCSS-heavy phase remaining — six frontend checkpoints — and `next/jest` mocks SCSS while `check-file-size.mjs` ignores `.scss`, so nothing catches a stylesheet defect before runtime. Building it once, inside the first Storefront checkpoint, protects the five that follow. **Measured finding for whoever builds it:** a plain `sass` CLI invocation **cannot** compile these entrypoints. `main.scss` opens with `@use '@embroidery/styles'`, a bare package specifier resolved by Next's own loader via `sassOptions.loadPaths` (`packages/styles/src`) plus Node package resolution. Four invocations were tried — `sass` CLI with `--load-path` at the package source, at `node_modules`, at both, and the sass JS API with `NodePackageImporter` — and every one failed with `Can't find stylesheet to import` or an entry-point error. The gate must be a small Node script that mirrors `next.config.ts`'s resolution, and it belongs in `SCOPED_COMMAND_INDEX.md` as scoped validation, never a global control |
| `FU-APP10-D01-05` — Storefront footer carries no canonical company contact block (carried from `APP1-S01A`) | **`ADOPT_INTO_APP11`** — `APP11-D01` + `APP11-S05` | Store presentation is APP11's named scope. The footer's own comment states the block is absent because "those values are still not canonical … and the remaining link columns arrive with the phases that own their content." APP11 is that phase |
| `FU-APP10-I01-02` — production Zalo/Messenger URLs unconfigured, so the dock is invisible everywhere | **`NOT_APP11` → configuration, APP12** | Configuration, not implementation. Recorded so it is not mistaken for a defect during APP11 runtime evidence: the dock is *correctly* invisible today |

Every other APP10 follow-up stays with its recorded owner. **APP11 absorbs no
unrelated historical debt.**

---

## N. Canonical APP11 roadmap

Legend — TYPE: `G` governance/audit · `D` design · `B` backend · `A` Admin
frontend · `S` Storefront frontend · `E` acceptance · `X` closure.

| ID | Capability | TYPE | Dependencies | HTTP Δ | Migration Δ | Route Δ | Design dependency | Status |
|---|---|---|---|---|---|---|---|---|
| `APP11-G01` | Phase-entry baseline, design authority & canonical roadmap audit | G | APP10-X01 | 0 | 0 | 0 | none | **COMPLETE** |
| `APP11-D01` | One phase-level design package: Homepage (reconciling UI01), footer store-presentation + policy block (absorbing `FU-APP10-E01-01`), gallery feed (on the locked UI02 masonry), gallery entry detail (on the approved `APP2-S02` architecture), one shared content-page template, Admin gallery list, Admin gallery editor + publication. Reuses the approved shell; redraws nothing already approved | D | G01 · Figma access (`OPS-APP11-001`) · `PO-APP11-001` | 0 | 0 | 0 | is the design | **NEXT** |
| `APP11-B01` | Admin gallery entry authoring — list, create, detail, update | B | G01 | **+4** | 0 | 0 | none | NOT STARTED |
| `APP11-B02` | Admin gallery media selection + publication — ordered public-derivative-only asset set, publish, unpublish | B | B01 | **+3** | 0 | 0 | none | NOT STARTED |
| `APP11-B03` | Public gallery reads + media delivery — published feed, entry by slug, public derivative | B | B02 | **+3** | 0 | 0 | none | NOT STARTED |
| `APP11-B04` | Public SEO inventory — indexable URL inventory for the sitemap (Q-06 / IDX-067) | B | B03 | **+1** | 0 | 0 | none | NOT STARTED |
| `APP11-A01` | Admin gallery list — status filter, pagination, ordering, nav entry | A | D01, B01 | 0 | 0 | +1 Admin | required | NOT STARTED |
| `APP11-A02` | Admin gallery entry editor + publication — content, SEO, product link, ordered media, publish/unpublish | A | D01, B01, B02 | 0 | 0 | +1 Admin | required | NOT STARTED |
| `APP11-S01` | Homepage / store introduction (replaces the CP0 placeholder), **plus the scoped SCSS compile gate** (`FU-APP10-E01-02`) | S | D01 | 0 | 0 | 0 (extends `/`) | required | NOT STARTED |
| `APP11-S02` | Public gallery feed — UI02 masonry architecture over `gallery_entries`, with continuation and empty/loading/error states | S | D01, B03, S01 | 0 | 0 | +1 Storefront | required | NOT STARTED |
| `APP11-S03` | Gallery entry detail — text-bearing entry page, ordered media, related product link, per-entry SEO | S | D01, B03, S02 | 0 | 0 | +1 Storefront | required | NOT STARTED |
| `APP11-S04` | SEO infrastructure — Storefront public origin + `metadataBase`, `robots.ts`, `sitemap.ts`, canonical on Discover and category, Open Graph defaults scoped away from secure routes, `BreadcrumbList` structured data, `noindex` verification across all private routes | S | D01, B04, S03 | 0 | 0 | +2 route files | partial | NOT STARTED |
| `APP11-S05` | Static content pages (Service, FAQ, Local, Policy) on one shared template + footer store-presentation and policy block (`FU-APP10-D01-05`) | S | D01, S04 | 0 | 0 | +4 Storefront | required | NOT STARTED |
| `APP11-E01` | Cross-boundary acceptance — bounded, see §P | E | all above | 0 | 0 | 0 | none | NOT STARTED |
| `APP11-X01` | Phase closure — R5 Operational Beta, handoff to APP12 | X | E01 | 0 | 0 | 0 | none | NOT STARTED |

```text
CANONICAL_CHECKPOINT_COUNT     = 15   (G01 included)
EXPECTED_APP11_HTTP_DELTA      = +11  (115 → 126)
EXPECTED_APP11_MIGRATION_DELTA = 0    (stays at 37)
EXPECTED_APP11_ROUTE_DELTA     = Storefront 12 → 18 pages (+2 route files)
                                 Admin      23 → 25 pages
NEXT                           = APP11-D01   (exactly one)
```

### N.1 Phase-wide change-impact testing governance

Binding for every APP11 checkpoint, restated from `VALIDATION_GOVERNANCE.md`:

1. Identify the files, modules, routes and contracts the checkpoint changed.
2. Identify their direct dependents.
3. Run focused unit/integration/browser tests for the affected behavior only.
4. Run the minimum relevant contract or generator checker **only when a contract
   changed**.
5. Run live browser / Playwright **only** when UI or runtime behavior changed and
   browser evidence is actually useful.
6. Do **not** rerun an accepted prior checkpoint's suite without a dependency
   reason.
7. Correction testing is scoped to the correction's impact, never the phase.
8. `E01` is bounded cross-boundary acceptance, never historical full regression.

Every APP11 completion report must state `CHANGE_IMPACT`, `TESTS_RUN`,
`TESTS_NOT_RUN` and `WHY_NOT_RUN`. Global quality controls remain Prettier,
ESLint and SonarQube — and only those. No repository-wide aggregate validation
command is created (CLAUDE.md §9; GOV-Q01).

### N.2 Binding roadmap-table rule

Every future APP11 checkpoint must update the status table in
`docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md` in the **same**
checkpoint. Exactly one row may be `NEXT` at any time.

---

## O. APP11 exit criteria

Each criterion names the evidence that settles it.

**Public gallery and discovery**

1. `GET /api/public/gallery-entries` returns only `status = 'PUBLISHED'` rows in
   `(display_order, id)` order; a DRAFT and an ARCHIVED entry seeded alongside
   are absent from the response body.
2. `GET /api/public/gallery-entries/{slug}` answers **404** identically for an
   unknown slug, a DRAFT entry and an ARCHIVED entry — the three responses are
   byte-identical apart from request id.
3. The gallery feed renders 5 / 3 / 2 columns at 1440 / 1024 / 390 with variable
   card heights, and its DOM order matches `display_order` exactly (masonry is
   visual only — the locked §4.4.3 invariant).
4. `/kham-pha` is unchanged: its route, category query key, masonry classes,
   card markup and card link are byte-identical to the APP11 entry commit.

**Store presentation**

5. `/` renders the approved Homepage with a single `<h1>`, server-rendered copy,
   and at least one internal link into Discover and one into the gallery. The
   strings `"checkpoint CP0"` and `"Embroidery Commerce Storefront"` appear
   nowhere in the Storefront build output.
6. The footer renders the approved store-presentation block with contact and
   policy links, and every policy link resolves to an HTTP 200 page.
7. The Zalo/Messenger handoff is still a floating bottom-right dock rendered by
   the shell, and is **not** present inside `<footer>`.

**Content**

8. Each of Service, FAQ, Local and Policy answers HTTP 200 with a unique
   `<title>`, a unique meta description, one `<h1>`, and at least one internal
   link. No `LANDING` instance ships.
9. No content-page CRUD operation exists in the OpenAPI document
   (`/api/*content-page*` matches zero paths).

**Admin content operations**

10. An operator can, in the browser: create an entry, set title/description/SEO,
    link a product, select and reorder images, publish, and unpublish — the
    seven `07` §4 operations, each demonstrated.
11. Attaching an asset classified `CUSTOMER_PRIVATE` or `PRODUCTION_SENSITIVE`
    to a gallery entry is refused, and the refusal is proven at the HTTP layer,
    not only in a unit test.
12. Publishing an entry with no public asset, or with an empty title, slug or
    description, is refused.

**SEO**

13. Every indexable page emits an **absolute** canonical URL built from the
    Storefront public origin. Zero relative `<link rel="canonical">` remain.
14. `/robots.txt` responds 200, references the sitemap, and disallows no public
    product, gallery or content path.
15. `/sitemap.xml` responds 200 and contains exactly: `/`, `/kham-pha`, the four
    category URLs, every published **indexable** product, every published
    **indexable** gallery entry, and every shipped content page. A product with
    `seo.isIndexable = false` is provably **absent**.
16. Every indexable page emits Open Graph `title`, `description`, `url` and
    `type`.
17. `BreadcrumbList` structured data validates on Product Detail and gallery
    entry detail. No structured-data property asserts a fact the contract does
    not carry.
18. Every image in the gallery feed and entry detail has a non-empty `alt`, or is
    a decorative placeholder exposed as `role="img"` with an `aria-label`.
19. Every gallery entry page carries visible text beyond its images — never an
    image-only page (`08` §6).

**Indexing boundaries**

20. All nine pre-existing private routes — `/truy-cap` ×5, `/xac-minh-lien-he`,
    `/yeu-cau/moi`, `/yeu-cau/da-gui`, `/san-pham/[slug]/thiet-ke` — emit
    `noindex, nofollow` and appear in neither the sitemap nor `robots.txt`.
21. No secure route emits Open Graph or canonical metadata after S04's root
    defaults land — the K.3 convention survives.
22. No secure-link token, request code or order code appears in any metadata
    value, sitemap entry or structured-data payload.

**Fidelity, responsiveness and non-regression**

23. Each new screen matches its `APPROVED_FOR_IMPLEMENTATION` node at 1440 /
    1024 / 390, and the completion report names the registry IDs used.
24. Exactly one public discovery architecture exists: `/kham-pha` for products
    and the gallery feed for entries, sharing the UI02 language, with no alias
    or redirect around either.
25. `node tools/check-figma-design-index.mjs` passes at X01, and the registry
    row count matches the report's textual count exactly.
26. Migration count is still **37** and the OpenAPI delta is exactly **+11
    operations**, or the closure report explains every deviation.
27. The scoped SCSS compile gate passes for both applications at every
    checkpoint that touches SCSS.

---

## P. APP11-E01 prediction

```text
JOURNEYS = 4
CASES    = 11
```

Bounded cross-boundary acceptance. **Not** a historical regression: no APP1–APP10
suite is rerun except where a journey crosses it directly.

**J1 — Admin authors and publishes a gallery entry → public indexable page (4 cases)**

1. Create a DRAFT entry, set content and SEO, link a product, select and reorder
   two public assets.
2. Publishing is refused while a readiness field is missing; it succeeds once
   complete.
3. The public feed lists the entry at its `display_order`; the entry page
   server-renders its title, description, ordered media and product link.
4. The page's canonical is absolute, its Open Graph is complete, and it appears
   in `/sitemap.xml`.

**J2 — Unpublish removes public visibility everywhere (2 cases)**

5. Unpublish; the feed no longer lists the entry and the detail URL answers the
   safe 404 — indistinguishable from an unknown slug.
6. The entry disappears from `/sitemap.xml`, and its media delivery URL no
   longer serves the derivative.

**J3 — Crawler boundary (3 cases)**

7. `/robots.txt` and `/sitemap.xml` respond 200 and contain only public
   indexable URLs.
8. All nine private routes emit `noindex, nofollow`, are absent from the
   sitemap, and carry no canonical and no Open Graph.
9. A product with `seo.isIndexable = false` is absent from the sitemap while its
   page still resolves for a direct visitor.

**J4 — Private assets never reach the public gallery (2 cases)**

10. Attaching a `CUSTOMER_PRIVATE` or `PRODUCTION_SENSITIVE` asset to an entry
    is refused at the HTTP layer.
11. The gallery media delivery route serves only the public derivative and never
    a private original, including when the asset id of a private original is
    supplied directly.

Deliberately **excluded**: payment, order, inventory, production, merge,
quotation and design-review journeys; the APP10-E01 suite; full DB regression.
None is touched by APP11's roadmap.

---

## Q. Validation

Commands and inspections actually run. This checkpoint changed only planning
documents, so no functional validation is justified.

```text
CHANGE_IMPACT = docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
                docs/implementation/reports/APP11-G01-COMPLETION-REPORT.md
                No runtime, contract, schema, generated artifact or Figma node.
```

**Executed**

| Command | Result |
|---|---|
| `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain`, `git status -sb` | `production`, `fb8f6a6b…`, clean, ahead 123 |
| `node -e` over `packages/contracts/openapi/openapi.generated.json` | 106 paths / 115 operations / 232 schemas; 40 `/api/public/*` operations enumerated |
| `git hash-object` × 3 (OpenAPI + both generated client files) | fingerprints recorded in §B |
| `ls packages/database/migrations/*.sql \| wc -l` | 37 |
| `grep -ln 'gallery_entries\|content_pages\|redirect_rules' packages/database/migrations/*.sql` | `0018_create_content_gallery_agreement_tables.sql` |
| `find apps/{storefront,admin}/src/app -name page.tsx` | 12 / 23 |
| `node tools/check-figma-design-index.mjs` | **PASS** — 491 registry ids, 491 node rows, 22 registry tables |
| `node -e` status tally over the registry's data rows | 491 rows; distribution in §B |
| `grep` for `export const metadata` / `generateMetadata` / `dynamic` / `revalidate` across `apps/storefront/src/app` | 10 of 12 routes carry metadata; three routes `force-dynamic` |
| `find apps/storefront/src/app -maxdepth 2 -name 'robots*' -o -name 'sitemap*' -o -name 'manifest*' -o -name 'opengraph*'` | **no matches** |
| `grep -rn 'STOREFRONT_PUBLIC_ORIGIN\|metadataBase'` across the monorepo | worker-only; no Storefront `metadataBase` |
| `grep -c -i 'gallery\|contentPage' packages/api-client/src/generated/embroidery-api.ts` | **0** |
| Scoped SCSS compile attempts (4 invocations: `sass` CLI with three load-path combinations, plus the sass JS API with `NodePackageImporter`) | all failed on the bare `@embroidery/styles` specifier — the measured finding recorded in §M |
| `mcp__plugin_figma_figma__authenticate` | returned an authorization URL; **no live node read** (`OPS-APP11-001`) |

**Read-only inspection** — every file listed in §C.

**Not run, by design**

```text
FULL_MONOREPO_TEST       = NOT_RUN
FULL_E2E                 = NOT_RUN
APP10_E01_NOT_RERUN      = true
FUNCTIONAL_REGRESSION    = NOT_RUN_BY_DESIGN

TESTS_NOT_RUN = all API / Admin / Storefront / worker unit and integration
                suites; the full Playwright suite; every DB, payment, inventory,
                customer-merge and unrelated-phase suite; every prior phase's
                accepted checkpoint suite.
WHY_NOT_RUN   = APP11-G01 is audit and planning only. It changed no runtime, no
                contract, no schema, no generated artifact and no Figma node, so
                no functional test has any change to exercise. Running them would
                be repository-wide aggregate validation, which CLAUDE.md §9 and
                VALIDATION_GOVERNANCE.md forbid.
```

Prettier, ESLint and SonarQube remain the only global controls. No new global
gate was created and no historical checker was reclassified as global.

---

## R. Files changed

Planning and governance only.

| File | Change |
|---|---|
| `docs/implementation/reports/APP11-G01-COMPLETION-REPORT.md` | **new** — this report |
| `docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md` | **rewritten** — candidate roadmap replaced by the canonical one, plus the mandatory status table, the design disposition, the schema/API/content dispositions and the phase-wide testing rule |

**Not changed:** API runtime, Admin runtime, Storefront runtime, worker runtime,
database schema, migration files, the OpenAPI contract, the generated API client,
`FIGMA_DESIGN_INDEX.md`, any Figma node, `SCOPED_COMMAND_INDEX.md`, dependencies,
infrastructure. No defect found during this audit was fixed in place; each is
recorded as a roadmap input or a follow-up.

---

## S. Follow-ups

All nonblocking.

| ID | Item | Owner |
|---|---|---|
| `FU-APP11-G01-01` | `content_pages` (TBL-066) ships with no runtime consumer and none is planned: `07-ADMIN-OPERATIONS.md` defines no content-page Admin operation, so APP11 serves content statically (§H). Revisit only if the Product Owner adds content-page operations to the Admin authority | product |
| `FU-APP11-G01-02` | `redirect_rules` (TBL-067) ships with no runtime consumer. Greenfield site, no legacy URLs. Recommend APP12, which owns go-live readiness (§H.1) | APP12 |
| `FU-APP11-G01-03` | Per-image alt text has no column anywhere in the media chain, yet `07` §4 says Admin can "Configure alt text". APP11 derives alt from the entity title, following the delivered APP2 precedent (§J.1) | DB / product |
| `FU-APP11-G01-04` | Gallery grouping by style or need (PRD §2.3 "phong cách hoặc nhu cầu") has no column. Product-type grouping is derivable from the linked product's category; style/need is deferred rather than given a speculative taxonomy table (§J.2) | product |
| `FU-APP11-G01-05` | `/kham-pha`'s metadata comment justifies its missing canonical with "the Product Detail route is unresolved (IMP-D038)". **That reason is stale** — IMP-D039 locked `/san-pham/[slug]`. `APP11-S04` fixes both the canonical and the comment | APP11-S04 |
| `FU-APP11-G01-06` | `FIGMA_DESIGN_INDEX.md` §1 still advertises its gate as "`pnpm check:figma-design-index` (static, in `pnpm quality`)". GOV-Q01 deleted `pnpm quality`; the gate is run directly as `node tools/check-figma-design-index.mjs`. Documentation-only drift | governance |
| `FU-APP11-G01-07` | Five Storefront routes carry metadata whose `robots` directive was not verified during this audit — `/truy-cap/duyet-thiet-ke`, `/truy-cap/thanh-toan`, `/truy-cap/thanh-toan-con-lai`, `/yeu-cau/da-gui`, `/san-pham/[slug]/thiet-ke`. `APP11-S04` must verify each emits `noindex` (§K.3) | APP11-S04 |
| `OPS-APP11-001` | Figma MCP access unavailable this session (`figma-desktop` = `ConnectionRefused`; the hosted plugin needs an interactive OAuth grant). No live node was opened. Must be restored before `APP11-D01` (§C, §F.3) | operations |
| `PO-APP11-001` | Public and Admin route paths for the gallery and content surfaces. Recommended defaults in §L.1; confirmed by the Product Owner at `APP11-D01` | Product Owner |

---

```text
APP11-G01 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP11-D01
```
