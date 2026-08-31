# APP11 — Gallery, Content, SEO and Store Presentation

**Phase authority:** locked at `APP11-G01`
(`../reports/APP11-G01-COMPLETION-REPORT.md`), **corrected at `APP11-G01-C1`**
(`../reports/APP11-G01-C1-COMPLETION-REPORT.md`) — live Figma authority
reconciliation and the Product Owner route lock. Where the two disagree, C1
governs.
The candidate roadmap that previously stood here was audited against repository
truth and replaced. Do not re-derive scope from the superseded candidate list.

---

## 0. Roadmap status

Exactly one checkpoint is `NEXT`. **Every APP11 checkpoint must update this table
in the same checkpoint that completes it.** This rule is binding for the whole
phase.

| Checkpoint | Capability | Status |
|---|---|---|
| `APP11-G01` | Phase-entry baseline, design authority & canonical roadmap audit | **COMPLETE** |
| `APP11-G01-C1` | Live Figma authority reconciliation & route lock | **COMPLETE** |
| `APP11-D01` | Design authority registration, reconciliation & supplement package | **COMPLETE** |
| `APP11-D01-C1` | Design authority consistency & responsive footer correction | **COMPLETE** |
| `APP11-B01` | Admin gallery entry authoring | **COMPLETE** |
| `APP11-B01-C1` | File-size compliance & evidence reconciliation | **COMPLETE** |
| `APP11-B02` | Admin gallery media + publication | **COMPLETE** |
| `APP11-B03` | Public gallery reads + media delivery | **COMPLETE** |
| `APP11-B03-C1` | Composition compliance & media-intake roadmap reconciliation | **COMPLETE** |
| `APP11-B03A` | Admin gallery media intake & public derivative preparation | **COMPLETE** |
| `APP11-B04` | Public SEO inventory (sitemap) | **COMPLETE** |
| `APP11-B04-C1` | Global sitemap capacity invariant correction | **COMPLETE** |
| `APP11-A01` | Admin gallery list | **COMPLETE** |
| `APP11-A02` | Admin gallery editor + publication | **COMPLETE** |
| `APP11-A02-C1` | SCSS source-size compliance | **COMPLETE** |
| `APP11-S01` | Homepage / store introduction (+ SCSS compile gate) | **COMPLETE** |
| `APP11-S02` | Public gallery feed | **COMPLETE** |
| `APP11-S03` | Gallery entry detail | **NEXT** |
| `APP11-S04` | SEO infrastructure | NOT STARTED |
| `APP11-S05` | Static content pages + footer store presentation | NOT STARTED |
| `APP11-E01` | Cross-boundary acceptance | NOT STARTED |
| `APP11-X01` | Phase closure (R5 Operational Beta → APP12) | NOT STARTED |

---

## 1. Outcome

Complete the public store presentation: a real Homepage, a managed public
gallery, the canonical SEO-capable content pages, and the technical SEO
infrastructure (absolute canonical URLs, sitemap, robots, Open Graph, structured
data) — **without** rebuilding any discovery, catalog or detail capability
APP1–APP10 already delivered.

## 2. Entry baseline (measured at `APP11-G01`)

```text
HEAD        = fb8f6a6b925be804ee782dc9b7add083eb919836
OPENAPI     = 106 paths / 115 operations / 232 schemas
MIGRATIONS  = 37
ADMIN       = 23 routes
STOREFRONT  = 12 routes
FIGMA       = 491 registry rows (gate passes)
```

## 3. Locked phase dispositions

```text
APP11_DESIGN_DISPOSITION  = REUSE_AND_SUPPLEMENT
APP11_D01_REQUIRED        = true
APP11_CONTENT_MODEL       = EXISTING_MODELS_SUFFICIENT
APP11_SCHEMA_DISPOSITION  = NO_MIGRATION_REQUIRED

EXPECTED_APP11_HTTP_DELTA      = +11 operations (115 → 126)
APP11_ORIGINAL_HTTP_DELTA      = +11
APP11_MEDIA_INTAKE_DELTA       = TBD_BY_APP11_B03A_PREFLIGHT (see §3.2; not 0)
EXPECTED_APP11_MIGRATION_DELTA = 0 (stays at 37)
EXPECTED_APP11_ROUTE_DELTA     = Storefront 12 → 18 pages (+2 route files)
                                 Admin      23 → 25 pages
```

### 3.2 The media-intake gap (`APP11-B03-C1`)

`APP11-B03` discovered, and `APP11-B03-C1` reclassified as
`BLOCKING_PHASE_GAP`, that no delivered product path creates the asset the
gallery is built on:

```text
FU-APP11-B03-01 = CLOSED by APP11-B03A
ROUTED_TO       = APP11-B03A
CLOSED_BY       = POST /api/admin/gallery-assets (adminGalleryAsset_create)
```

`APP11-B02` may attach only a `PUBLIC`, non-tombstoned asset and
`APP11-B03` may deliver only such an asset, but the one delivered operator
intake — `POST /api/admin/assets/upload` — fixes
`kind = CATALOG_MEDIA` and `classification = PRODUCTION_SENSITIVE`, neither
client-selectable, on the stated INV-09 rule that "intake is never `PUBLIC`:
public visibility is reached only through a publication flow". No delivered code
writes `assets.classification` after insert, and the Admin asset reads are
hard-scoped to that same pair, so a `PUBLIC` asset would also be invisible to
the operator. The original `+11` estimate did not account for this; correctness
takes precedence over the estimate.

`APP11-B03A` closed the gap without touching either half of that rule. Intake
still cannot express `PUBLIC`, and no code updates an existing asset's
classification: the preparation operation **copies** an already-`ACCEPTED`
catalog asset into a new `GALLERY_MEDIA` / `PUBLIC` row with its own object keys,
which is precisely the "publication flow" INV-09 names. Operator visibility was
closed by giving the two existing Admin reads an optional `scope`, defaulting to
the catalog lane they always served. See §7.1.

### 3.1 The persistence already exists

Migration `0018_create_content_gallery_agreement_tables.sql` created
`gallery_entries` (TBL-064), `gallery_entry_assets` (TBL-065), `content_pages`
(TBL-066) and `redirect_rules` (TBL-067), with `IDX-066` (published gallery
listing) and `IDX-067` (DB5's "Q-06 sitemap scan") already built. The API
`GalleryModule` and `ContentModule` compose their repositories today. APP11 adds
the missing read models, HTTP operations and UI — **it creates no table**.

`APP11-B04` corrected one detail of that sentence. `IDX-067` is
`ix_content_pages__published_indexable`, on **`content_pages`** — so it covers
the content-page half of DB5's Q-06, which this phase does not build. The
sitemap scan B04 actually delivered is served by two other indexes, both
pre-existing and both verified against the live schema: `IDX-065`
(`ix_products__category_display_id__published`, whose schema comment already
names Q-06) for the Product half, and `IDX-066`
(`ix_gallery_entries__display_id__published`) for the Gallery half, with the
"has a deliverable image" term resolved as an indexed semi-join through
`uq_gallery_entry_assets__entry_asset`, `pk_assets` and
`uq_asset_derivatives__asset_kind__not_failed`. No index was added.

### 3.2 Design policy

Substantial public design is already approved and is **reused, never redrawn**:
the APP1-D02 shell and not-found, the locked UI02 masonry discovery architecture
(`208:538`, `208:2002`, `224:871`, `226:1038` — `DRAFT` describes *content
maturity* only; its visual and structural authority is `REQUIRED`), and the ten
approved `APP2-S02-G01` Product Detail rows.

`FIGMA_DESIGN_INDEX.md` §4.3.1 records what happens otherwise: `APP2-D01`
redesigned an already-covered capability because its registry title did not
literally read "Product List", the Product Owner rejected it, and `APP2-D01-C1`
deleted four frames. **APP11 must not repeat that.**

**Corrected at `APP11-G01-C1` from live Figma evidence.** `UI05 – Collections
Experience` (`328:1739`) was opened live and is **APP11 Gallery authority**: its
Collections Index carries H1 `Bộ sưu tập` at three breakpoints with interaction,
loading, empty and error states. The gallery feed is therefore **registered, not
redrawn**. `APP11-D01` is one bounded phase-level package with this scope:

| # | Surface | D01 action | Live basis |
|---|---|---|---|
| 1 | Gallery feed `/bo-suu-tap` | `REGISTER_EXISTING` | `329:2`, `339:2`, `343:2`, `353:2`, `357:3` |
| 2 | Gallery entry detail `/bo-suu-tap/[slug]` | `SUPPLEMENT_EXISTING` | `334:6`, `341:2`, `348:2` + lightbox `533:3`, `533:26` |
| 3 | Homepage `/` | `RECONCILE_EXISTING` | `183:7`, `189:266`, `191:412` **minus `Journal` `183:140`** |
| 4 | Shared content-page template | `NEW_DESIGN_REQUIRED` | none — absence proven live |
| 5 | Admin gallery list `/gallery` | `NEW_DESIGN_REQUIRED` on APP2 structure | `439:100`, `440:102`, `440:191` |
| 6 | Admin gallery editor `/gallery/[entryId]` | `NEW_DESIGN_REQUIRED` on APP2 structure | `434:20`, `437:73`, `441:106`, `442:205` |
| 7 | Footer store presentation + policy column | `SUPPLEMENT_EXISTING` | `FIG-DS-FOOTER` |
| 8 | APP10-I01 handoff reconciliation (docs only) | `RECONCILE_EXISTING` | `842:3`, `842:48`, `843:3`, `843:44` |

Only items 4–6 are new design. The gallery feed is **not drawn**; the gallery
entry detail is drawn **only** where UI05 leaves a real gap — its `Member Works`
section (`336:3366`) models a collection→works hierarchy that `gallery_entries`
has no persistence for, and is replaced by the entry's ordered
`gallery_entry_assets` set plus the approved Product Detail lightbox. It is
delivered whole and is never split across coding checkpoints.

**D01 preconditions — both RESOLVED at `APP11-G01-C1`:**

- ~~`OPS-APP11-001`~~ Figma MCP access — **RESOLVED**, `FIGMA_LIVE_ACCESS = PASS`.
- ~~`PO-APP11-001`~~ route paths — **RESOLVED**, locked in §4.1 below.

**Delivered at `APP11-D01`** (`../reports/APP11-D01-COMPLETION-REPORT.md`): page
`APP_11` (`853:2`), 8 sections, 33 new frames, plus 5 pre-existing UI05 feed nodes
registered in place — **38 new registry rows, all `REVIEW_REQUIRED`** (registry
491 → 529). The gallery feed was **not** redrawn. Implementation checkpoints read
their authority from `FIGMA_DESIGN_INDEX.md` §4.17.

**Corrected at `APP11-D01-C1`** (`../reports/APP11-D01-C1-COMPLETION-REPORT.md`)
on two Product Owner review defects, with the accepted package otherwise
untouched:

1. **Alt-text authority.** `ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED`. Eleven
   Figma text nodes — including `875:1006`, which claimed "Alt text is owned per
   gallery asset" — now state that **no per-image alt column, API property or
   Admin editor exists in APP11** and that accessible image text is derived at
   render time from the gallery entry title plus the image position. No
   migration, no API field and no Admin control were added, so
   `APP11_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED` is unchanged. This closes
   the `docs/07-ADMIN-OPERATIONS` §4 "Configure alt text" divergence **for APP11
   implementation only** — the product documentation stays for the Product Owner
   to reconcile separately.
2. **Responsive footer supplement.** The APP11-owned store-presentation footer
   block now carries explicit authority at all three widths — Desktop `872:1029`
   (unchanged), **Tablet 1024 `888:1006`** (2×2 column grid) and **Mobile 390
   `888:1058`** (single stack, with 100px reserved below the last footer row so
   the floating dock can never cover it) — plus a responsive-authority annotation
   `889:1030` fixing stacking, ordering, link grouping, wrapping and the
   relationships to the DS footer and the dock. `FIG-DS-FOOTER` and the DS file
   were not touched, and the dock remains a separate floating bottom-right layer.

Registry 529 → **532 rows**, the three new rows `REVIEW_REQUIRED`. Store contact
values remain placeholders for the Product Owner to supply before `APP11-S05`.

## 4. In scope

- Homepage and public store introduction (replacing the CP0 placeholder).
- Public gallery feed and gallery entry detail over `gallery_entries`.
- Admin gallery operations — the seven listed in `docs/07-ADMIN-OPERATIONS.md` §4.
- Static, Storefront-owned Service, FAQ, Local and Policy pages.
- Footer store-presentation and policy block (`FU-APP10-D01-05`).
- SEO infrastructure: Storefront public origin + `metadataBase`, `robots.ts`,
  `sitemap.ts`, absolute canonical URLs, Open Graph, `BreadcrumbList` structured
  data, and verified `noindex` boundaries.
- A scoped per-app SCSS compile gate (`FU-APP10-E01-02`), built once at S01.

### 4.1 Locked route authority (`PO-APP11-001 = RESOLVED`)

Product Owner authority, locked at `APP11-G01-C1`. Not re-opened by any
checkpoint; never re-derived from a Figma label.

```text
Public Storefront
  Product discovery        /kham-pha            (unchanged)
  Product detail           /san-pham/[slug]     (unchanged)
  Gallery feed             /bo-suu-tap
  Gallery entry detail     /bo-suu-tap/[slug]
  Service                  /dich-vu
  FAQ                      /cau-hoi-thuong-gap
  Local/store              /cua-hang
  Policy family            /chinh-sach/[slug]

Admin
  Gallery list             /gallery
  Gallery detail/editor    /gallery/[entryId]
```

`/bo-suu-tap` matches the existing Storefront nav label `Bộ sưu tập` and
differentiates Gallery from product discovery. `/cua-hang` and `/dich-vu` are
intentionally singular — one physical store, one Service page. Policies
legitimately support multiple slugs. Admin uses technical route naming.

**No aliases** — `/thu-vien`, Storefront `/gallery`, `/collections` and `/store`
are rejected, and APP11 creates **no redirects** for them. The G01 §L.1 defaults
are superseded.

## 5. Out of scope

- **Rebuilding or redrawing `/kham-pha`, `/san-pham/[slug]` or the shared shell.**
- A generic CMS, page builder, component JSON, plugin system or blog engine
  (`docs/08-SEO-AND-CONTENT.md` §2 and PRD §2.3 both exclude a blog).
- Admin content-page authoring — `docs/07-ADMIN-OPERATIONS.md` defines no such
  operation in any of its twelve sections.
- Any schema change, any new table, any speculative taxonomy.
- Redirect runtime (`redirect_rules` stays unconsumed; recommended to APP12).
- `LANDING` page instances — the type stays available, but §7 of the SEO
  authority forbids mass-generated low-value pages.
- Unrelated APP10 commerce debt (`FU-APP10-G01-02`, `FU-APP10-G01-03`) — routed
  to APP12.
- New business features; reopening the Design Studio lifecycle; analytics
  platform selection; customer design download.

## 6. Canonical engineering checkpoints

Execute and review **one at a time**. Backend slices stay within 1–3 closely
related operations (maximum 5). Full definitions, per-operation justification and
dependency ordering are in the G01 report §N.

| ID | Capability | HTTP Δ | Route Δ |
|---|---|---|---|
| `APP11-D01` | One phase-level design package (§3.2) | 0 | 0 |
| `APP11-B01` | Admin gallery entry authoring — list, create, detail, update | +4 | 0 |
| `APP11-B02` | Admin gallery media selection + publish/unpublish | +3 | 0 |
| `APP11-B03` | Public gallery feed, entry by slug, public derivative delivery | +3 | 0 |
| `APP11-B03A` | Admin gallery media intake & public derivative preparation (§7.1) | +2 | 0 |
| `APP11-B04` | Public indexable-URL inventory for the sitemap | +1 | 0 |

**Backend HTTP budget, reconciled at `APP11-B04`.** The `APP11-G01` forecast was
`+11` (115 → 126). `APP11-B03A` closed a real phase blocker and cost `+2` that
the forecast did not anticipate, so the delivered total is:

```text
ORIGINAL_FORECAST                              = +11
APP11_B03A_DISCOVERED_DELTA                    = +2
APP11_ACTUAL_BACKEND_HTTP_DELTA_AFTER_B04      = +13
APP11_FINAL_BACKEND_OPERATION_COUNT_AFTER_B04  = 128
```

The obsolete `+11` is not preserved: the estimate was wrong about what the phase
needed, and the phase was right to build it.

### 7.1 `APP11-B03A` — Admin Gallery Media Intake & Public Derivative Preparation

The canonical target for the blocker recorded in §3.2. It owns the **smallest**
missing capability and nothing wider:

```text
an authorized operator can create or prepare a Gallery-eligible PUBLIC asset,
which APP11-B02 can attach and APP11-B03 can publicly deliver,
with no direct database mutation and no test-only seeding
```

**Audit findings that bound the design** (measured on the `APP11-B03-C1` tree;
nothing below was implemented):

| Question | Finding | Source |
|---|---|---|
| Is there an operator-usable asset intake? | Yes — `POST /api/admin/assets/upload` (`adminAsset_upload`) | `admin-asset.controller.ts` |
| Can it produce a `PUBLIC` asset? | **No.** `assetKind` and `classification` are single-value enums in the multipart contract and fixed constants in the service | `asset-intake.policy.ts` `INTAKE_ASSET_KIND`/`INTAKE_CLASSIFICATION`; `asset-intake.service.ts` |
| Why fixed? | INV-09: "Intake is never `PUBLIC` … public visibility is reached only through a publication flow" | `asset-intake.policy.ts` |
| Does any code promote an asset to `PUBLIC` later? | **No.** Nothing writes `assets.classification` after insert; the customer-ownership transfer port documents that it changes neither classification nor status | repository-wide grep; `customer-ownership-transfer.port.ts` |
| Do the derivatives `APP11-B03` serves already exist for uploaded assets? | **Yes.** The worker's `CATALOG` inspection lane writes `THUMBNAIL` + `CATALOG_PREVIEW`, unwatermarked and `READY`, and moves the asset to `ACCEPTED` | `asset-inspection-lane.ts` `CATALOG_INSPECTION_LANE` |
| Would such an asset be visible to an operator once `PUBLIC`? | **No.** Every Admin asset read is hard-scoped to `{CATALOG_MEDIA, PRODUCTION_SENSITIVE}` | `asset-scope.filters.ts`; `asset-catalog.query.ts` `SCOPE` |

**Smallest candidate solution — option C (promotion/preparation), not a new
upload lane.** The derivative half of the gap is already solved by delivered
code; only the classification is wrong for Gallery, and the architecture already
states that `PUBLIC` is reached through a publication flow rather than through
intake. `APP11-B03A` should therefore add a guarded Admin **promotion** of an
already-`ACCEPTED` catalog-media asset into the Gallery-public lane, plus
whatever minimum read change lets an operator see the result. Options A, B and D
were considered and are weaker: A and B would have to weaken or fork the INV-09
intake rule, and D found no other producer.

**Delivered.** `APP11-B03A` is `COMPLETE`; `FU-APP11-B03-01` is `CLOSED`. The
four open questions below were answered as follows, and the answers are now the
record rather than the plan:

| # | Question | Answer as delivered |
|---|---|---|
| 1 | In-place mutation vs. derived asset | **Derived, always.** `POST /api/admin/gallery-assets` copies the source's original and both display derivatives to keys namespaced by a new UUIDv7 and writes a new asset row. No statement in the feature updates, locks-for-update or tombstones the source, so a published Product keeps delivering from it — proved end to end against the public product-media route. |
| 2 | `kind` disposition | **`GALLERY_MEDIA` / `PUBLIC`.** Representable with no migration: `ASSET_KINDS` already carries `GALLERY_MEDIA` and no CHECK constrains the `(kind, classification)` pair. The worker owning no `GALLERY_MEDIA` lane is exactly why the copy is created `ACCEPTED` inside the write transaction, with an `asset_inspections` row justifying it — a byte-identical copy of an already-inspected object needs no second inspection, and waiting for one that will never run would leave `APP11-B02` free to attach an image `APP11-B03` cannot serve. |
| 3 | Admin visibility | **The existing scoped reads gained a lane.** `adminAsset_list` and `adminAsset_detail` take an optional `scope` of `CATALOG` \| `GALLERY`; omitting it still means `CATALOG`, so every delivered consumer is unchanged. Only the binary preview needed a new operation, because no Admin asset-delivery route existed to extend. |
| 4 | Lifecycle and cleanup | **Detach and unpublish touch no asset.** A prepared asset survives both, stays selectable and previewable, and is unreachable from the public surface until a `PUBLISHED` entry shows it. No un-promotion and no deletion operation was added — see `FU-APP11-B03A-01`. |

**Open questions `APP11-B03A` had to settle before writing code:**

1. **In-place mutation vs. derived asset.** The Product media route requires
   `classification = PRODUCTION_SENSITIVE` (`PRODUCT_MEDIA_ASSET_CLASSIFICATION`),
   so promoting an asset already attached to a published Product in place would
   silently break that Product's images. B03A must either refuse promotion of an
   in-use product asset, or produce a distinct Gallery asset — and must prove
   which, against the delivered `product_media` associations.
2. **`kind` disposition.** `APP11-B02` deliberately did not scope eligibility
   to `kind`, so a promoted `CATALOG_MEDIA` asset already qualifies; whether
   B03A should also move it to `GALLERY_MEDIA` is a real decision with a
   consequence — the worker owns no `GALLERY_MEDIA` lane, so a re-inspection
   would never run.
3. **Admin visibility.** Whether the existing scoped reads gain a Gallery lane or
   B03A publishes its own narrow read.
4. **Lifecycle and cleanup.** What un-promotion means, and what happens to a
   promoted asset that a curator later detaches.

**Locked constraints:** no migration unless live schema inspection proves the
asset model cannot represent the workflow; `CUSTOMER_PRIVATE` originals stay
unexposed; the `PRODUCTION_SENSITIVE` lane is not weakened; no per-image alt
persistence; no generic CMS; `APP11-B02` and `APP11-B03` behaviour is frozen.

**HTTP delta: `+2`**, measured rather than guessed — `adminGalleryAsset_create`
and `adminGalleryAsset_preview`. Question 3 resolved to "extend the existing
reads", so selection and listing cost no operation at all; the preview cost one
because the repository had no authenticated Admin asset-binary route to extend.
OpenAPI moves `113 / 125 / 247` → `115 / 127 / 250`.
| `APP11-A01` | Admin gallery list + nav entry | 0 | +1 Admin |
| `APP11-A02` | Admin gallery editor + publication panel | 0 | +1 Admin |
| `APP11-S01` | Homepage / store introduction, plus the SCSS compile gate | 0 | 0 |
| `APP11-S02` | Public gallery feed `/bo-suu-tap` on the **UI05 Collections Index** authority (`329:2`/`339:2`/`343:2`) — UI02 masonry language at UI05's 3/2/1 density | 0 | +1 Storefront |
| `APP11-S03` | Gallery entry detail `/bo-suu-tap/[slug]` — UI05 Collection Detail + the approved Product Detail lightbox | 0 | +1 Storefront |
| `APP11-S04` | SEO infrastructure | 0 | +2 route files |
| `APP11-S05` | Static content pages + footer store presentation | 0 | +4 Storefront |
| `APP11-E01` | Cross-boundary acceptance — 4 journeys / 11 cases | 0 | 0 |
| `APP11-X01` | Phase closure | 0 | 0 |

## 7. Critical end-to-end journey

An operator authors a gallery entry with public-derivative images, SEO text and
an optional product link, then publishes it. The Storefront server-renders it in
the gallery feed and on its own entry page with an absolute canonical URL, Open
Graph and breadcrumb data, and it enters `/sitemap.xml`. Unpublishing removes it
from the feed, makes the detail URL answer the safe 404 that is indistinguishable
from an unknown slug, and drops it from the sitemap — while every secure and
private route stays `noindex` and absent from the crawl surface throughout.

## 8. Exit gate

The 27 measurable exit criteria are in the G01 report §O. Summarised:

- Existing approved design continuity preserved; `/kham-pha` byte-identical.
- Draft and archived gallery content is invisible and indistinguishable from
  absent.
- Private assets can never be attached to, or served through, the gallery.
- Every indexable page carries an absolute canonical, Open Graph and correct
  structured data; every private route stays `noindex` and out of the sitemap.
- Migration count still 37; OpenAPI delta `+11` plus the `+2` `APP11-B03A`
  measured for media intake (§3.2, §7.1) — the original estimate is superseded,
  not hidden.
- The Figma index gate passes and its row count matches the closure report.
- The scoped SCSS compile gate passes for both applications.

## 9. Testing policy

Change-impact only, for every checkpoint in this phase:

1. Identify changed files, modules, routes and contracts.
2. Identify direct dependents.
3. Run focused unit/integration/browser tests for the affected behavior only.
4. Run a contract or generator checker **only** when a contract changed.
5. Run live browser / Playwright **only** when UI or runtime behavior changed.
6. Never rerun an accepted prior checkpoint's suite without a dependency reason.
7. Correction testing is scoped to the correction, never the phase.
8. `E01` is bounded cross-boundary acceptance, never historical full regression.

Every completion report states `CHANGE_IMPACT`, `TESTS_RUN`, `TESTS_NOT_RUN` and
`WHY_NOT_RUN`. Prettier, ESLint and SonarQube remain the only global controls; no
repository-wide aggregate validation command may be created.

## 10. Correction governance

```text
initial attempt → at most one correction (-C1) → mandatory Product Owner directive
```

Binding for every APP11 checkpoint.

## 11. Handoff

APP12 receives a feature-complete candidate for security, resilience,
performance, observability, UAT and go-live readiness — plus the items APP11
deliberately routed forward: `FU-APP10-G01-02`, `FU-APP10-G01-03`,
`FU-APP10-I01-02`, and the redirect runtime (`FU-APP11-G01-02`).
