# APP11 — Closure Matrix

- Phase: `APP11 — Gallery, Content, SEO and Store Presentation`
- Produced by: `APP11-X01`
- Date: 2026-08-31
- Companion: [`APP11-X01-COMPLETION-REPORT.md`](./APP11-X01-COMPLETION-REPORT.md)

```text
APP11 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED
NEXT_PHASE = APP12 — Hardening, UAT and Production Readiness
```

Every row is read from the committed repository — the accepted completion
reports, the commit ledger, the generated OpenAPI artifact, the migration
journal, the Figma registry and the delivered source. Nothing was regenerated,
re-executed or inferred. `APP11-E01` was **not** re-run.

---

## 1. Canonical checkpoint count

```text
canonical checkpoints        = 16 identities
  G01 D01 B01 B02 B03 B03A B04 A01 A02 S01 S02 S03 S04 S05 E01 X01

correction checkpoints       =  8
  G01-C1 D01-C1 B01-C1 B03-C1 B04-C1 A02-C1 S03-C1 S04-C1

unused correction slots      =  8
  B02-C1 B03A-C1 A01-C1 S01-C1 S02-C1 S05-C1 E01-C1 X01-C1

non-checkpoint interventions =  0
pre-closure APP11 commits    = 18
closure commit               =  1 (this checkpoint)
```

`APP11-B03A` is a **canonical checkpoint added mid-phase**, not a correction. It
was created by the `APP11-B03-C1` reclassification of `FU-APP11-B03-01` from
`NONBLOCKING` to `BLOCKING_PHASE_GAP`, and it is the only checkpoint in the
phase that was not forecast at `APP11-G01`. Its runtime stands and is neither
absorbed nor reversed by closure.

`APP11-D01` occupies two commits (`f11e2fbf`, then `3c7cace3` — a frame-placement
and publication-copy fix inside the same checkpoint) and was then corrected by
`APP11-D01-C1` (`b4e97570`). `APP11-G01` and `APP11-G01-C1` share one commit
because both are documentation and the correction was authored before the
checkpoint was committed.

---

## 2. Checkpoint matrix

| # | Checkpoint | Type | Capability | Final status | PO acceptance | Correction | Commit | Report | Blocking FU | Nonblocking FU |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `APP11-G01` | governance | Phase-entry baseline, design-authority audit, canonical roadmap | `COMPLETE` | accepted | used (`-C1`) | `956364b9` | `APP11-G01-COMPLETION-REPORT.md` | 0 | 7 |
| 2 | `APP11-G01-C1` | correction | Live Figma authority reconciliation + PO route lock | `COMPLETE` | accepted | — | `956364b9` | `APP11-G01-C1-COMPLETION-REPORT.md` | 0 | 0 |
| 3 | `APP11-D01` | design | Phase design package — 38 rows registered on page `APP_11` (491 → 529) | `COMPLETE` / `PO APPROVED` | `FIG-APPROVAL-APP11-D01-PO-001` | used (`-C1`) | `f11e2fbf`, `3c7cace3` | `APP11-D01-COMPLETION-REPORT.md` | 0 | 0 |
| 4 | `APP11-D01-C1` | correction | Alt-text authority + responsive footer supplement (529 → 532) | `COMPLETE` / `PO APPROVED` | same token | — | `b4e97570` | `APP11-D01-C1-COMPLETION-REPORT.md` | 0 | 0 |
| 5 | `APP11-B01` | backend | Admin gallery entry authoring — list, create, detail, update (+4 ops) | `COMPLETE` | accepted | used (`-C1`) | `d2eba060` | `APP11-B01-COMPLETION-REPORT.md` | 0 | 4 |
| 6 | `APP11-B01-C1` | correction | File-size compliance & evidence reconciliation | `COMPLETE` | accepted | — | `d2eba060` | `APP11-B01-C1-COMPLETION-REPORT.md` | 0 | 2 |
| 7 | `APP11-B02` | backend | Admin gallery media selection + publish/unpublish (+3 ops) | `COMPLETE` | accepted | unused | `a0bc4cb5` | `APP11-B02-COMPLETION-REPORT.md` | 0 | 2 |
| 8 | `APP11-B03` | backend | Public gallery feed, entry by slug, public derivative delivery (+3 ops) | `COMPLETE` | accepted | used (`-C1`) | `8c08e27c` | `APP11-B03-COMPLETION-REPORT.md` | 1 → routed to `B03A` | 1 |
| 9 | `APP11-B03-C1` | correction | Composition compliance + media-intake gap reclassification | `COMPLETE` | accepted | — | `8c08e27c` | `APP11-B03-C1-COMPLETION-REPORT.md` | 0 | 0 |
| 10 | `APP11-B03A` | backend | Admin gallery media intake & public derivative preparation (+2 ops) | **`COMPLETE`** | accepted | unused | `5ec546c9` | `APP11-B03A-COMPLETION-REPORT.md` | 0 | 5 |
| 11 | `APP11-B04` | backend | Public indexable-URL inventory for the sitemap (+1 op) | `COMPLETE` | accepted | used (`-C1`) | `73ef10c4` | `APP11-B04-COMPLETION-REPORT.md` | 0 | 4 |
| 12 | `APP11-B04-C1` | correction | Global sitemap capacity invariant (cap the sum, not each source) | `COMPLETE` | accepted | — | `d94daafa` | `APP11-B04-C1-COMPLETION-REPORT.md` | 0 | 0 |
| 13 | `APP11-A01` | admin UI | Admin gallery list + nav entry (`/gallery`) | `COMPLETE` | accepted, with a PO directive applied mid-checkpoint | unused | `235720f4` | `APP11-A01-COMPLETION-REPORT.md` | 0 | 4 |
| 14 | `APP11-A02` | admin UI | Admin gallery editor + publication panel (`/gallery/[entryId]`) | `COMPLETE` | accepted | used (`-C1`) | `cc5fd0f4` | `APP11-A02-COMPLETION-REPORT.md` | 0 | 4 |
| 15 | `APP11-A02-C1` | correction | SCSS source-size compliance | `COMPLETE` | accepted | — | `cc5fd0f4` | `APP11-A02-C1-COMPLETION-REPORT.md` | 0 | 1 |
| 16 | `APP11-S01` | storefront | Homepage / store introduction + the scoped SCSS compile gate | `COMPLETE` | accepted | unused | `bc4cff53` | `APP11-S01-COMPLETION-REPORT.md` | 0 | 5 |
| 17 | `APP11-S02` | storefront | Public gallery feed `/bo-suu-tap` at 3 / 2 / 1 | `COMPLETE` | accepted | unused | `dee89ce7` | `APP11-S02-COMPLETION-REPORT.md` | 0 | 4 |
| 18 | `APP11-S03` | storefront | Gallery entry detail `/bo-suu-tap/[slug]` + lightbox | `COMPLETE` | accepted | used (`-C1`) | `a40228e0` | `APP11-S03-COMPLETION-REPORT.md` | 0 | 4 |
| 19 | `APP11-S03-C1` | correction | Mandatory live gallery-detail acceptance closure | `COMPLETE` | accepted | — | `a40228e0` | `APP11-S03-C1-COMPLETION-REPORT.md` | 0 | 0 |
| 20 | `APP11-S04` | storefront | SEO infrastructure — public origin, `metadataBase`, robots, sitemap, canonical, OG, `BreadcrumbList` | `COMPLETE` | accepted | used (`-C1`) | `d452dccd` | `APP11-S04-COMPLETION-REPORT.md` | 0 | 2 |
| 21 | `APP11-S04-C1` | correction | Product breadcrumb canonical-category correction | `COMPLETE` | accepted | — | `d452dccd` | `APP11-S04-C1-COMPLETION-REPORT.md` | 0 | 2 |
| 22 | `APP11-S05` | storefront | Static content pages + footer store presentation | `COMPLETE` | accepted | unused | `85a145a0` | `APP11-S05-COMPLETION-REPORT.md` | 0 | 1 |
| 23 | `APP11-E01` | acceptance | Cross-boundary acceptance — 4 journeys / 11 cases | `COMPLETE` / **PO PASS** | `CORRECTION_USED = 0 / 1` | unused | `f1872358` | `APP11-E01-COMPLETION-REPORT.md` | 0 | 7 carried |
| 24 | `APP11-X01` | closure | Phase closure and final authority lock | `COMPLETE` | — | unused | this closure commit | `APP11-X01-COMPLETION-REPORT.md` | 0 | 0 |

The `Nonblocking FU` column counts items **opened by** that checkpoint, not a
running total. §8 is the deduplicated inventory.

---

## 3. Correction summary

Eight corrections were used. Each was read from its own report; none is inferred
from a checkpoint name.

| Correction | Why it was required | What changed | Final verdict |
|---|---|---|---|
| `APP11-G01-C1` | `APP11-G01` planned the phase without live Figma (`OPS-APP11-001` unresolved) and with the route paths unconfirmed (`PO-APP11-001`). Both preconditions had to close before a design checkpoint could legally start | **Docs only.** `UI05 – Collections Experience` (`328:1739`) was opened live and confirmed as Gallery authority (H1 `Bộ sưu tập`), so the feed is *registered, not redrawn*; the eight public and two Admin routes were locked and the alias set rejected | `COMPLETE` — accepted; C1 governs where it disagrees with G01 |
| `APP11-D01-C1` | Two Product Owner review defects on the accepted design package: eleven text nodes claimed per-gallery-asset alt text that no column, API field or Admin control exists for, and the APP11 footer supplement carried Desktop authority only | **Design + docs.** `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED` written into the eleven nodes; Tablet 1024 (`888:1006`), Mobile 390 (`888:1058`) and a responsive annotation (`889:1030`) added. Registry 529 → 532. No migration, no API field, no Admin control | `COMPLETE` / `PO APPROVED` under `FIG-APPROVAL-APP11-D01-PO-001` |
| `APP11-B01-C1` | `APP11-B01` shipped a 417-line `app.module.ts` — over the 400-line hard limit — while its report claimed compliance, because `CMD-CHECK-FILE-SIZE` cannot pass repository-wide and so could not fail the checkpoint | **Runtime, structural only.** Composition extracted so the root module returns under the limit; the report's evidence corrected | `COMPLETE` — accepted |
| `APP11-B03-C1` | Two defects: a composition-boundary violation, and `FU-APP11-B03-01` filed as a harmless enhancement when it was in fact a phase blocker — no delivered path could produce the `PUBLIC` asset the gallery is built on | **Runtime + docs.** Module composition corrected (never register a module in `app.module.ts`); the follow-up reclassified `NONBLOCKING` → `BLOCKING_PHASE_GAP` and routed to a new canonical checkpoint `APP11-B03A` | `COMPLETE` — accepted; it is the reason `APP11-B03A` exists |
| `APP11-B04-C1` | The sitemap capacity invariant was applied per source, but the 50 000-entry limit is **per file**, so two sources each under the cap could still produce an over-cap file | **Runtime.** The cap now bounds the combined total; the per-source fetch bound stays `total + 1`, never `total / 2` | `COMPLETE` — accepted |
| `APP11-A02-C1` | An APP11 stylesheet exceeded the source-size limit — and `tools/check-file-size.mjs` does not scan `.scss`, so nothing caught it | **Runtime, stylesheet split only.** Split by responsibility; opened `FU-APP11-A02-C1-01` against the tool's blind spot | `COMPLETE` — accepted |
| `APP11-S03-C1` | `APP11-S03` closed with eight live acceptance checks unexercised because they needed Admin-authored fixtures | **Docs + evidence.** All eight exercised and passing; `FU-APP11-S03-02` closed and `FU-APP11-S03-03` *proven* rather than asserted — the zero-deliverable-media published state is unreachable through delivered flows | `COMPLETE` — accepted |
| `APP11-S04-C1` | `APP11-S04` promoted a Product Detail category link that resolves to Discover's not-found boundary into published `BreadcrumbList` structured data. S04 routed it forward; the Product Owner rejected that routing, because S04 is what turned a visible dead link into structured data | **Runtime.** A category crumb is emitted only for the four canonical Discover filters. Opened `FU-APP11-S04-C1-01` (the sibling CTA, closed later by S05) and `FU-APP11-S04-C1-02` (the underlying contract/persistence divergence) | `COMPLETE` — accepted |

```text
CORRECTIONS_USED   = 8
CORRECTIONS_FAILED = 0
MANDATORY_PO_DIRECTIVES_TRIGGERED = 0
```

No checkpoint exhausted its correction budget, and no `-C2` exists anywhere in
APP11. Every checkpoint listed in §2 with `used (-C1)` has a real correction
report; every checkpoint listed `unused` has none in repository truth.

---

## 4. Final capability inventory

### 4.1 Admin — Gallery

`/gallery` and `/gallery/[entryId]` only. Delivered:

```text
Gallery list with filter and keyset continuation
create bootstrap (title + slug; slug read-only after create)
Gallery editor — title, SEO title, SEO description, display order
ordered media attachment (PUT replaces the whole ordered set)
position 0 is the cover
linked Product selection
publication readiness refusal carrying a business code
publish / unpublish
Gallery asset preparation (promotion of an ACCEPTED catalog asset)
Gallery asset preview (authenticated Admin binary)
```

**No generic content CMS.** No Admin Service, FAQ, Local or Policy editor exists
and none was built: `docs/07-ADMIN-OPERATIONS.md` defines no content-page
operation in any of its twelve sections. `content_pages` (TBL-066) remains
without a runtime consumer (`FU-APP11-G01-01`).

### 4.2 Storefront — Gallery

```text
/bo-suu-tap         PUBLISHED-only feed, 3 / 2 / 1, keyset continuation
/bo-suu-tap/[slug]  entry detail, ordered media, lightbox, safe 404 when absent
```

### 4.3 Homepage and store presentation

Six-section Homepage composition. The `StorePresentationBlock` sits **above** the
existing Footer; the floating Zalo/Messenger dock remains a **separate**
bottom-right layer and was not reverted into the footer.

```text
Footer responsive authority
  Desktop 1440   4 columns
  Tablet  1024   2 x 2
  Mobile   390   1 stack + 100px dock-safe reserve
```

### 4.4 Static content

`/dich-vu`, `/cau-hoi-thuong-gap`, `/cua-hang` and the four-slug policy family.
Storefront-owned static content — no page builder, no component JSON, no blog.

Store facts, unchanged in repository truth at closure:

```text
address        NOT_AVAILABLE
opening hours  NOT_AVAILABLE
phone          NOT_AVAILABLE
email          NOT_AVAILABLE
```

The Local page and the footer **omit** each unavailable fact rather than
fabricating it. None was invented at `APP11-X01`.

### 4.5 SEO and indexing

```text
STOREFRONT_PUBLIC_ORIGIN (IMP-D050 — no second variable)
metadataBase
robots.txt
sitemap.xml — current public indexable inventory + the four concrete policy URLs
absolute canonical on every indexable page
public-only Open Graph
Product and Gallery BreadcrumbList
private-route noindex
```

Secure and private Storefront routes carry `noindex, nofollow`, no canonical, no
public Open Graph and no JSON-LD.

### 4.6 Public / private media boundary

```text
Admin asset preparation COPIES an ACCEPTED catalog asset into a new
GALLERY_MEDIA / PUBLIC row with its own object keys — intake still cannot
express PUBLIC, and no code updates an existing asset's classification.

A CUSTOMER_PRIVATE or PRODUCTION_SENSITIVE asset can never be promoted to,
attached to, or served through the public gallery route.

Unpublish removes feed, detail, sitemap and media visibility together.
An unattached prepared asset has no public address at all.
```

Accepted limitation: **no Gallery asset deletion or withdraw operation exists**
(`FU-APP11-B03A-01`). It was not added at `APP11-X01`, and it is not closed on
paper.

### 4.7 Discovery architecture — permanently distinct

```text
Product Discover   /kham-pha      density 5 / 3 / 2   Product-backed
Gallery Feed       /bo-suu-tap    density 3 / 2 / 1   Gallery-entry-backed

NESTED_COLLECTION_WORK_MODEL = false
```

Both surfaces are image-led and editorial. They are **not** the same capability,
and Gallery is **flat** — UI05's `Member Works` collection→works hierarchy
(`336:3366`) has no persistence in `gallery_entries` and was deliberately
replaced by the entry's ordered `gallery_entry_assets` set plus the approved
Product Detail lightbox. No future closure prose may collapse Gallery back into
Product Discover, or restate Gallery as 5 / 3 / 2.

---

## 5. Final measured baseline

Measured at `APP11-X01` from the committed tree, not copied from `APP11-E01`.

| Measure | APP11 entry | APP11 exit | Δ | Source |
|---|---|---|---|---|
| OpenAPI paths | 106 | **116** | **+10** | `packages/contracts/openapi/openapi.generated.json` |
| OpenAPI operations | 115 | **128** | **+13** | same |
| OpenAPI schemas | 232 | **252** | **+20** | same |
| Migrations | 37 | **37** | **0** | `packages/database/migrations/*.sql` |
| Admin page routes | 23 | **25** | +2 | `apps/admin/src/app/**/page.tsx` |
| Storefront page routes | 12 | **18** | +6 | `apps/storefront/src/app/**/page.tsx` |
| Storefront metadata routes | 0 | **2** | +2 | `robots.ts`, `sitemap.ts` — **not** `page.tsx` |
| Figma registry rows | 491 | **532** | +41 | `node tools/check-figma-design-index.mjs` |

### 5.1 OpenAPI delta reconciliation

```text
G01 predicted operations delta = +11
actual accepted delta          = +13
difference                     = +2
```

The `+2` is `APP11-B03A`, exactly:

```text
POST /api/admin/gallery-assets
  adminGalleryAsset_create

GET  /api/admin/gallery-assets/{assetId}/{rendition}
  adminGalleryAsset_preview
```

`APP11-G01`'s forecast predates the checkpoint. `APP11-B03-C1` proved a real
phase blocker — `APP11-B02` may attach only a `PUBLIC` asset, `APP11-B03` may
serve only a `PUBLIC` asset, and the one delivered operator intake fixes
`CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` on the stated INV-09 rule — and
`APP11-B03A` closed it without weakening either half of that rule. `B03A`'s own
report records `113 / 125 / 247 → 115 / 127 / 250`.

These two operations are **part of the final accepted baseline**. They are not
planning drift, they are not removed, and they are not relabelled. `APP11-E01`
accepted them under live evidence. The obsolete `+11` is superseded, not hidden.

### 5.2 Database

```text
migrations               = 37
APP11 migration delta    = 0
APP11_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

APP11 reused persistence authority that already existed. Migration
`0018_create_content_gallery_agreement_tables.sql` had already created
`gallery_entries` (TBL-064), `gallery_entry_assets` (TBL-065), `content_pages`
(TBL-066) and `redirect_rules` (TBL-067), identified at `APP11-G01`. No index was
added: the sitemap scan is served by the pre-existing `IDX-065` and `IDX-066`
plus an indexed semi-join, and `IDX-067` is on `content_pages`, which this phase
does not build.

No migration was created at `APP11-X01`. The contract/persistence category
divergence (`FU-APP11-S04-C1-02`) is **not** fixed and is **not** claimed fixed —
it remains a routed follow-up under database-change-control authority.

---

## 6. APP11-owned API operation inventory — 13 operations

Read from the committed artifact.

| # | Method | Path | operationId | Checkpoint |
|---|---|---|---|---|
| 1 | `GET` | `/api/admin/gallery-entries` | `adminGalleryEntry_list` | `B01` |
| 2 | `POST` | `/api/admin/gallery-entries` | `adminGalleryEntry_create` | `B01` |
| 3 | `GET` | `/api/admin/gallery-entries/{galleryEntryId}` | `adminGalleryEntry_detail` | `B01` |
| 4 | `PATCH` | `/api/admin/gallery-entries/{galleryEntryId}` | `adminGalleryEntry_update` | `B01` |
| 5 | `PUT` | `/api/admin/gallery-entries/{galleryEntryId}/assets` | `adminGalleryEntry_replaceAssets` | `B02` |
| 6 | `POST` | `/api/admin/gallery-entries/{galleryEntryId}/publication` | `adminGalleryEntry_publish` | `B02` |
| 7 | `DELETE` | `/api/admin/gallery-entries/{galleryEntryId}/publication` | `adminGalleryEntry_unpublish` | `B02` |
| 8 | `GET` | `/api/public/gallery-entries` | `publicGalleryEntry_list` | `B03` |
| 9 | `GET` | `/api/public/gallery-entries/{slug}` | `publicGalleryEntry_detail` | `B03` |
| 10 | `GET` | `/api/public/gallery-entries/{slug}/assets/{assetId}/{rendition}` | `publicGalleryEntry_asset` | `B03` |
| 11 | `POST` | `/api/admin/gallery-assets` | `adminGalleryAsset_create` | **`B03A`** |
| 12 | `GET` | `/api/admin/gallery-assets/{assetId}/{rendition}` | `adminGalleryAsset_preview` | **`B03A`** |
| 13 | `GET` | `/api/public/sitemap-entries` | `publicSitemapEntry_list` | `B04` |

Thirteen operations across ten paths — exactly the `+13 / +10` delta. **Zero**
`content-page` operations exist, by design.

---

## 7. Public route inventory

### 7.1 Storefront page routes — 18

```text
/                              Homepage / store introduction     APP11-S01
/kham-pha                      Product Discover                  APP2, retained authority
/san-pham/[slug]               Product Detail                    APP2, SEO-enhanced
/san-pham/[slug]/thiet-ke      Design Studio                     APP3
/bo-suu-tap                    Gallery feed                      APP11-S02
/bo-suu-tap/[slug]             Gallery entry detail              APP11-S03
/dich-vu                       Service                           APP11-S05
/cau-hoi-thuong-gap            FAQ                               APP11-S05
/cua-hang                      Local / store                     APP11-S05
/chinh-sach/[slug]             Policy family                     APP11-S05
/yeu-cau/moi                   Request creation                  APP5
/yeu-cau/da-gui                Request confirmation              APP5
/xac-minh-lien-he              Contact verification              APP4
/truy-cap                      Secure-link landing               APP4
/truy-cap/bao-gia              Secure quotation                  APP6
/truy-cap/duyet-thiet-ke       Secure design review              APP6
/truy-cap/thanh-toan           Deposit payment                   APP7
/truy-cap/thanh-toan-con-lai   Final payment                     APP9
```

Concrete policy slugs, closed at four (`POLICY_SLUG`):

```text
/chinh-sach/giao-hang     shipping
/chinh-sach/thanh-toan    payment
/chinh-sach/doi-tra       returns
/chinh-sach/bao-mat       privacy
```

### 7.2 Framework metadata routes — recorded separately

```text
/robots.txt    apps/storefront/src/app/robots.ts
/sitemap.xml   apps/storefront/src/app/sitemap.ts
```

These are **not** counted as `page.tsx` routes. The page count is 18 with both
present.

### 7.3 Rejected aliases — still rejected

```text
/collections   /gallery   /thu-vien   /store   /faq   /policy
```

APP11 created no alias and no redirect for any of them, and `redirect_rules`
(TBL-067) remains unconsumed (`FU-APP11-G01-02`). There is **no blog or Journal
route**; `Journal` (`183:140`) was explicitly excluded from the Homepage
reconciliation.

### 7.4 Admin page routes — 25

APP11 added exactly two: `/gallery` and `/gallery/[entryId]`.

---

## 8. Final follow-up inventory

Built mechanically from every APP11 completion report and the phase document,
then deduplicated. Every owner is concrete; none is `TBD`, `future` or `unknown`.

### 8.1 Closed during APP11 — 15

| ID | Origin | Description | Closure evidence |
|---|---|---|---|
| `FU-APP11-B03-01` | `B03` | No delivered producer of gallery-eligible `PUBLIC` media — reclassified to `BLOCKING_PHASE_GAP` | **CLOSED by `APP11-B03A`** — `POST /api/admin/gallery-assets` |
| `FU-APP11-B02-01` | `B02` | Whether a `DELETION_PENDING` asset should be refused by the public gallery predicate | **RESOLVED at `APP11-B03`** §H |
| `FU-APP11-B01-03` | `B01` | `display_order` is caller-chosen and unconstrained; the list UI may want an affordance | **CLOSED at `APP11-A02`** — integer field with help copy; no invented backend semantics |
| `FU-APP11-B01-04` | `B01` | The gallery operations were absent from the curated `@embroidery/api-client` boundary | **CLOSED at `APP11-A02`** §D |
| `FU-APP11-A01-02` | `A01` | Engineer-facing annotations rendered in the Admin UI | **CLOSED at `APP11-A01`** — PO directive applied mid-checkpoint; a regression test asserts none remain |
| `FU-APP11-A01-06` | `A01` | `gallery-status.ts` sat in feature scope with one caller | **CLOSED at `APP11-A02`** — promoted to `src/shared/presentation/` on a genuine second caller |
| `FU-APP11-G01-05` | `G01` | `/kham-pha` canonical missing, justified by a stale IMP-D038 comment | **CLOSED at `APP11-S04`** §H |
| `FU-APP11-G01-07` | `G01` | Five Storefront routes with unverified `robots` directives | **CLOSED at `APP11-S04`** §K — four verified, one fixed |
| `FU-APP11-S03-02` | `S03` | Eight live acceptance checks were fixture-dependent and unexercised | **CLOSED at `APP11-S03-C1`** — all eight exercised, passing |
| `FU-APP11-S03-04` | `S03` | Gallery Detail Open Graph deferred pending `metadataBase` | **CLOSED at `APP11-S04`** §I |
| `FU-APP11-S04-02` | `S04` | Product breadcrumb linked an invalid Discover category filter into structured data | **CLOSED by `APP11-S04-C1`** |
| `FU-APP11-S04-C1-01` | `S04-C1` | The `Tiếp tục khám phá` CTA still linked the same invalid filter | **CLOSED at `APP11-S05`** — live click verified |
| `FU-APP11-B04-04` | `B04` | `sitemap.ts`, absolute URLs, robots, canonical and structured data belong to S04 | **CLOSED at `APP11-S04`** |
| `FU-APP10-D01-05` | APP10 | Footer store-presentation and policy block | **CLOSED** — design at `APP11-D01`, runtime live-verified at `APP11-S05` at 1440 / 1024 / 390 |
| `FU-APP10-E01-02` | APP10 | No SCSS compile gate; six fatal stylesheet defects had reached `production` | **CLOSED at `APP11-S01`** — `tools/check-app-scss.mjs`, scoped per app, indexed in `SCOPED_COMMAND_INDEX.md` |

Two phase-entry preconditions were also resolved at `APP11-G01-C1`:
`OPS-APP11-001` (Figma MCP access) and `PO-APP11-001` (route paths). Figma
tooling later became unavailable again; that is tracked separately as
`FU-APP11-S03-01`, and the precondition's one-time resolution is **not** restated
as current availability.

### 8.2 Open — nonblocking, APP11-owned — 30

| ID | Origin | Description | Class | Owner / next authority |
|---|---|---|---|---|
| `FU-APP11-S04-C1-02` | `S04-C1` | `PublicCategoryResponse.slug` is the closed enum `{thu-bong, khan, quan-ao, khac}` in the committed contract, but `categories.slug` is unconstrained `text` and the runtime emits `ao-thun` | `NONBLOCKING_PREEXISTING_CONTRACT_DATA_DIVERGENCE` | APP12 preflight / next database-contract change authority |
| `FU-APP11-S04-01` | `S04` | `.env` carries no `STOREFRONT_PUBLIC_ORIGIN`; the tracked contract is correct and fail-closed | `OPEN_OPERATOR_CONFIGURATION` | Operator + APP12 production-readiness audit |
| `FU-APP11-S05-01` | `S05` | Canonical store address, opening hours, phone and e-mail remain unavailable | `OPEN_PRODUCT_OWNER_INPUT` | Product Owner / APP12 production-readiness content audit |
| `FU-APP11-S01-01` | `S01` | Storefront ships no favicon; `GET /favicon.ico` 404s site-wide | hardening | APP12 hardening |
| `FU-APP11-B03A-01` | `B03A` | No Gallery asset deletion, withdraw or un-promotion path | operational limitation | APP12 operational-hardening disposition |
| `FU-APP11-S03-01` | `S03` | Live Figma node inspection unavailable — `figma-desktop` `ConnectionRefused`; the hosted server needs an interactive OAuth grant | `OPEN_TOOLING_AVAILABILITY` | Operator / APP12 UAT design spot-check |
| `FU-APP11-S03-03` | `S03` | The zero-deliverable-media published state is unreachable through delivered flows — proven at `S03-C1`, not asserted | consequence of `B03A-01` | APP12, with `FU-APP11-B03A-01` |
| `FU-APP11-G01-01` | `G01` | `content_pages` (TBL-066) has no runtime consumer and none is planned | product decision | Product Owner |
| `FU-APP11-G01-02` | `G01` | `redirect_rules` (TBL-067) has no runtime consumer | go-live readiness | APP12 |
| `FU-APP11-G01-03` | `G01` | `docs/07-ADMIN-OPERATIONS.md` §4 says Admin can "Configure alt text"; no such column, field or control exists. `APP11-D01-C1` closed this **for APP11 implementation** (`DERIVED_NOT_PERSISTED`); the product document is still unreconciled | documentation divergence | Product Owner / database authority |
| `FU-APP11-G01-04` | `G01` | Gallery grouping by style or need (PRD §2.3) has no column; deferred rather than given a speculative taxonomy | product decision | Product Owner |
| `FU-APP11-G01-06` | `G01` | `FIGMA_DESIGN_INDEX.md` §1 still advertises the gate as being "in `pnpm quality`"; GOV-Q01 deleted `pnpm quality` | documentation drift | Delivery governance |
| `FU-APP11-B01-01` | `B01` | `adminGalleryEntry_update` carries no `expectedUpdatedAt` guard — matching the locked contract and the `adminSku_update` precedent | contract decision | APP12, or the next gallery-authoring checkpoint |
| `FU-APP11-B01-02` | `B01` | `zod-dto-publication.contract.spec.ts` pins "19 paths / 23 operations" against a 116-path artifact and fails at HEAD; a sibling case also fails | pre-existing red test | APP12 hardening (test-debt owner) |
| `FU-APP11-B01-C1-01` | `B01-C1` | `app.module.ts` at 339 lines is inside the hard limit but above the 300-line review threshold | structural debt | APP12, or the next composition checkpoint |
| `FU-APP11-B01-C1-02` | `B01-C1` | 79 repository-wide file-size hard-limit violations; `CMD-CHECK-FILE-SIZE` is `ACTIVE_SCOPED` but cannot pass repository-wide, so it cannot fail a checkpoint that adds one | governance gap | Dedicated governance checkpoint (APP12 preflight) |
| `FU-APP11-B04-02` | `B04` | The same 79 violations, 77 of them in `tools/` historical scripts | duplicate of `B01-C1-02` | same owner |
| `FU-APP11-B02-02` | `B02` | `explainGuardedMiss`'s `STATE` → `GALLERY_ENTRY_VERSION_CONFLICT` mapping is unreachable under the current `FOR UPDATE` pre-flight | latent correctness | Next gallery-publication checkpoint |
| `FU-APP11-B03-02` | `B03` | Public gallery responses are `no-store`, inherited from `APP2-B04` / `APP2-T01`; no cache-invalidation consumer exists | deployment decision | APP12 performance / CDN |
| `FU-APP11-B03A-02` | `B03A` | No promotion idempotency — two operator clicks create two independent gallery assets | deliberate; deduplication needs a provenance column | APP12, with `B03A-01` |
| `FU-APP11-B03A-03` | `B03A` | Derived derivative rows carry no `checksum` and none of the `APP3-DB01` metadata quartet | honest null; no delivered predicate reads either | APP12 |
| `FU-APP11-B03A-04` | `B03A` | `packages/object-storage` `object-key.spec.ts` — 2 stale cases expect `image/svg+xml` unsupported; fails identically before B03A | pre-existing red test | APP12 hardening (test-debt owner) |
| `FU-APP11-B03A-05` | `B03A` | Duplicate of `FU-APP11-B01-02` — the same stale contract-spec counts | duplicate | same owner |
| `FU-APP11-B04-01` | `B04` | `product-placement.contract.spec.ts` fails one APP3-era assertion about side-background operations | pre-existing red test | Next Admin side-background checkpoint |
| `FU-APP11-B04-03` | `B04` | `PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES` is a tripwire; crossing 50 000 indexable entities needs a sitemap-index protocol | future contract change | A future SEO checkpoint, only if the store grows into it |
| `FU-APP11-A01-01` | `A01` | The Admin gallery list was verified against the registry and the D01 specification, not against live Figma; the nav ordinal is fixed by no accepted document | design verification | APP12 UAT design spot-check, with `FU-APP11-S03-01` |
| `FU-APP11-A01-03` | `A01` | Continuation failure/retry is covered by test but not exercised live — it needs a fault-injection fixture the dev stack lacks | test-depth gap | APP12 hardening |
| `FU-APP11-A01-04` | `A01` | The dev API container image is stale relative to `B03A` (`packages/object-storage/dist` predates `copyObject`); `docker compose build api` is the durable fix | environment only — no source defect | Operator / APP12 environment readiness |
| `FU-APP11-A01-05`, `FU-APP11-A02-04`, `FU-APP11-S02-03` | `A01`, `A02`, `S02` | Live-testing residue in the dev database — one prepared `GALLERY_MEDIA` asset and DRAFT gallery entries, none removable through a delivered operation | consequence of `B03A-01` | APP12, with `FU-APP11-B03A-01` |
| `FU-APP11-A02-01` | `A02` | The Admin modal shell now has a third implementation; promoting one to shared scope means rewriting two accepted features | deliberate deferral | A dedicated Admin-shared refactor |
| `FU-APP11-A02-02` | `A02` | Live Figma unavailable for the six editor frames; carries `FU-APP11-A01-01` forward | design verification | APP12 UAT design spot-check |
| `FU-APP11-A02-03` | `A02` | A catalog **source** tile has no preview, because APP2 publishes no authenticated product-media delivery route; the tile states the absence rather than rendering a broken image | needs a backend operation | APP12 disposition |
| `FU-APP11-A02-C1-01` | `A02-C1` | `tools/check-file-size.mjs` does not scan `.scss`, so stylesheet size violations are invisible to the gate | governance gap | Delivery governance, with `FU-APP11-B01-C1-02` |
| `FU-APP11-S01-02` | `S01` | Brand-name divergence — the shell wordmark is `Xưởng Thêu` while `/yeu-cau/moi` titles itself `Nét Thêu` | copy decision | Product Owner |
| `FU-APP11-S01-03` | `S01` | Turbopack does not hot-reload a changed SCSS partial in the dev container | dev-environment note | Operator / dev-environment docs |
| `FU-APP11-S01-04` | `S01` | `slash-div` deprecation in `secure-design-review.scss:43` (APP6-owned); removed in Dart Sass 2.0 | dependency deprecation | APP12 hardening |
| `FU-APP11-S01-05` | `S01` | Shared breakpoint scale still deferred (FU-A16); a third feature repeating 640 / 1025 is the trigger | styling architecture | The next frontend checkpoint that needs a third copy |
| `FU-APP11-S02-01` | `S02` | UI05's three lower editorial bands are registered but unbuilt; their copy is `PROVISIONAL_COPY` with no data source | product decision | Product Owner |
| `FU-APP11-S02-02` | `S02` | The dehydrated query cache carries five fields the card projection drops — all already anonymously public today | latent, conditional | Whichever checkpoint first adds a non-public gallery field |
| `FU-APP11-S02-04` | `S02` | Duplicate of `FU-APP11-S01-01` — the favicon 404 | duplicate | same owner |

### 8.3 Open — nonblocking, inherited and routed beyond APP11 — 6

| ID | Origin | Description | Owner / next authority |
|---|---|---|---|
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | APP2 | A `notFound()` from a dynamic segment renders the safe approved surface but answers HTTP 200. Re-measured at `APP11-E01` on one Product and one Gallery route: safe body, `noindex`, no canonical, no OG, no entity leak, and no such URL can enter the sitemap | APP12 hardening |
| `FU-APP10-E01-01` | APP10 | The four `FIG-APP10-I01-*` rows still draw a footer column and remain `REVIEW_REQUIRED`. `APP11-D01` superseded them **for placement only**, without editing their nodes; the runtime remains a floating dock | APP12 UAT / design reconciliation |
| `FU-APP10-G01-02` (absorbs `FU-APP9-B01-01`) | APP10 / APP9 | No business-event notification producer (SE-010 `payment.final-requested`) | APP12 |
| `FU-APP10-G01-03` | APP10 | Customer shipping-fee acknowledgement UI | APP12 |
| `FU-APP10-I01-02` | APP10 | Production Zalo/Messenger URLs unconfigured, so the dock is correctly invisible today | Operator / APP12 production readiness |
| `FU-APP8-A01-04` | APP8 | The `Kho` nav entry is absent because `ADMIN_PRIMARY_NAV` requires a route that exists. Cited by `APP11-G01` as precedent only; it stays in APP8's closed inventory | APP8 inventory, dispositioned by APP12 |

### 8.4 Counts

```text
CLOSED_DURING_APP11        = 15
OPEN_NONBLOCKING_APP11     = 30   (deduplicated; 5 raw ids are duplicates or aliases)
OPEN_NONBLOCKING_INHERITED =  6
OPEN_TOTAL                 = 36
BLOCKING                   =  0
```

`APP11-E01` carried 7 items forward as the phase-critical set. This closure's
mechanical sweep found 29 further open items across the APP11 reports and the
phase document. Each was classified against the 27 APP11 exit criteria in
`APP11-G01` §O: **none violates an exit criterion**. They are pre-existing test
debt, deliberate product deferrals, tooling and environment gaps, documentation
drift, and design-verification items the registry gate already covers.

```text
BLOCKING_FOLLOW_UPS = 0
```

No checkpoint was created for any follow-up, and none was closed on paper to
reach a cleaner verdict.

---

## 9. Design authority

```text
FIGMA_REGISTRY        = 532 rows (gate PASS)
APP11 rows            = 41, all APPROVED_FOR_IMPLEMENTATION
APPROVAL_TOKEN        = FIG-APPROVAL-APP11-D01-PO-001
FIGMA_LIVE_SPOTCHECK  = NOT_AVAILABLE
```

The 41 rows are 17 Storefront gallery/home, 7 content pages, 9 Admin, 5 footer
and dock, and 3 phase specifications — of which 5 register pre-existing UI05
nodes and 36 point at frames created on page `APP_11`. Final authority groups:

```text
Homepage
Gallery feed (registered from UI05, never redrawn)
Gallery detail + lightbox
Shared static content-page template
Admin Gallery list / editor
Footer store supplement (Desktop / Tablet / Mobile + responsive annotation)
```

Live Figma remained unavailable at `APP11-S03`, `APP11-S05`, `APP11-E01` and at
this closure — `figma-desktop` refuses the connection and the hosted server needs
an interactive OAuth grant no checkpoint may complete on the operator's behalf.
This is recorded as unavailability and is **not** reported as live verification.
Closure rests on the registry gate, the accepted `APP11-D01` / `APP11-D01-C1`
package and `APP11-E01`'s live runtime evidence. External tooling unavailability
is nonblocking on that basis. No Figma node or registry row was touched at
`APP11-X01`.

---

## 10. `APP11-E01` evidence pointer

```text
APP11-E01 = COMPLETE — PO PASS
JOURNEYS = 4
CASES = 11
PASSED = 11
FAILED = 0
BLOCKING_FOLLOW_UPS = 0
RUNTIME_SOURCE_CHANGED = false
```

```text
J1  Admin publication -> public Gallery + SEO        cases 1-4    PASS
J2  Unpublish + public asset boundary                cases 5-7    PASS
J3  Crawler/indexing + contract reconciliation       cases 8-9    PASS
J4  Store presentation/content + non-regression      cases 10-11  PASS
```

Full evidence: [`APP11-E01-COMPLETION-REPORT.md`](./APP11-E01-COMPLETION-REPORT.md).
Acceptance artifact: `apps/storefront/test/acceptance/app11-e01.acceptance.test.ts`
(263 lines). `APP11-X01` reuses this evidence and did not re-run it.

---

## 11. Residual risks

| # | Risk | Real consequence | Containment |
|---|---|---|---|
| 1 | Contract/persistence category divergence (`FU-APP11-S04-C1-02`) | The API can emit a `category.slug` its own published schema forbids, so every generated-client consumer is typed against a guarantee the runtime does not keep | The Storefront validates at its own boundary (`toDiscoverCategorySlug`) on both the breadcrumb and the continuation CTA. `APP11-E01` Case 9 verified both sides: 0 invalid links emitted, 0 invalid entries in structured data, 0 in the sitemap, no broken breadcrumb, no broken continuation link, no APP11 runtime crash, and Discover 404s safely on a hand-typed value |
| 2 | No Gallery asset deletion (`FU-APP11-B03A-01`) | Prepared assets and DRAFT entries accumulate in any environment where acceptance runs | An unattached prepared asset has **no public address** — `APP11-B03` requires a `PUBLISHED` association before any binary is served. Storage cost only; no exposure |
| 3 | Dynamic not-found answers HTTP 200 (`FU-APP2-DETAIL-NOT-FOUND-STATUS-01`) | A crawler sees a `200` for a URL that does not exist | The body is the safe generic not-found with `noindex`, no canonical, no OG and no entity leak; sitemap membership is computed from the indexable inventory, so no such URL can be advertised |
| 4 | Operator configuration (`FU-APP11-S04-01`) | An ordinary `up` without `STOREFRONT_PUBLIC_ORIGIN` fails the Storefront's SEO routes closed | Deliberate. `.env.example` documents the variable and focused tests own the fail-closed behaviour. Failing closed is safer than publishing a guessed origin, and `.env` was never written |
| 5 | Pre-existing red tests (`B01-02`, `B03A-04`, `B04-01`) | Three suites fail at HEAD for reasons predating APP11 | Each was reproduced on a clean tree; none is a contract or runtime defect. `openapi:check`, `check:generated` and the per-checkpoint suites are the live gates |
| 6 | Live Figma unavailable (`FU-APP11-S03-01`) | Six detail nodes and the Admin editor frames were never visually diffed against the runtime | The 532-row registry gate passes, all 41 APP11 rows are approved under one token, and `APP11-E01` verified the delivered runtime live |

None of the six invalidates an APP11 exit criterion.

---

## 12. Final repository state

```text
branch        feat/app11-s04-seo-infrastructure
entry HEAD    f1872358  test(app11): deliver bounded cross-boundary acceptance (APP11-E01)
working tree  clean at closure entry
pushed        no
```

Closure changes **documentation only**: this matrix, the `APP11-X01` completion
report, the APP11 phase document and the master application roadmap. No
`apps/**`, no package runtime source, no migration, no OpenAPI artifact, no
generated client, no Figma registry row, no Figma node and no test source was
modified.

---

## 13. APP12 handoff

```text
NEXT_PHASE = APP12 — Hardening, UAT and Production Readiness
```

APP12 owns phase-wide performance evidence and Core Web Vitals, UAT, production
readiness, broad accessibility hardening, infrastructure and reliability debt,
operator configuration readiness, and cross-phase hardening disposition.

The nonblocking follow-ups are carried by authority class. These are **APP12
preflight inputs, not APP12 checkpoints** — APP12 audits and dispositions each
against its own canonical scope. No APP12 checkpoint id is created here, and no
disposition is pre-decided.

```text
PRODUCTION_READINESS
  FU-APP11-S04-01     operator public origin
  FU-APP11-S05-01     canonical store facts
  FU-APP10-I01-02     production handoff URLs
  FU-APP11-A01-04     stale dev API image

HARDENING
  FU-APP11-S01-01                     favicon
  FU-APP2-DETAIL-NOT-FOUND-STATUS-01  dynamic not-found HTTP 200
  FU-APP11-B03A-01 (+ -02, S03-03, A01-05, A02-04, S02-03)   gallery asset deletion
  FU-APP11-S04-C1-02                  contract/persistence divergence
  FU-APP11-B01-02 / B03A-04 / B04-01  pre-existing red tests
  FU-APP11-B03-02                     public cache policy
  FU-APP11-S01-04                     slash-div deprecation
  FU-APP11-B01-C1-01                  app.module.ts review threshold
  FU-APP11-B02-02                     unreachable conflict mapping
  FU-APP10-G01-02 / -03               inherited commerce debt
  FU-APP11-G01-02                     redirect runtime

UAT / DESIGN TOOLING
  FU-APP11-S03-01                             live Figma unavailable
  FU-APP11-A01-01 / A02-02 / FU-APP10-E01-01  design spot-check backlog

GOVERNANCE
  FU-APP11-B01-C1-02 / B04-02 / A02-C1-01   file-size gate cannot pass repo-wide; .scss unscanned
  FU-APP11-G01-06                            registry doc names a deleted command

PRODUCT OWNER
  FU-APP11-G01-01 / -03 / -04    content pages, alt-text doc divergence, gallery grouping
  FU-APP11-S01-02                brand-name divergence
  FU-APP11-S02-01                unbuilt UI05 editorial bands
  FU-APP11-B01-01                gallery PATCH concurrency token
  FU-APP11-A02-01 / A02-03       Admin modal consolidation, source-tile preview
  FU-APP11-S01-05 / S02-02 / B04-03   conditional, trigger-bound items
```

APP12 implementation is **not started**. No APP12 checkpoint was opened, and this
closure writes no APP12 roadmap.

---

## 14. Closure verdict

```text
APP11-X01            = COMPLETE
APP11                = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS  = 0
PHASE                = CLOSED
PO_DECISION_REQUIRED = NONE
NEXT_PHASE           = APP12 — Hardening, UAT and Production Readiness
```
