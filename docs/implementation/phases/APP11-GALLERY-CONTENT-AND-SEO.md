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
| `APP11-B02` | Admin gallery media + publication | **NEXT** |
| `APP11-B03` | Public gallery reads + media delivery | NOT STARTED |
| `APP11-B04` | Public SEO inventory (sitemap) | NOT STARTED |
| `APP11-A01` | Admin gallery list | NOT STARTED |
| `APP11-A02` | Admin gallery editor + publication | NOT STARTED |
| `APP11-S01` | Homepage / store introduction (+ SCSS compile gate) | NOT STARTED |
| `APP11-S02` | Public gallery feed | NOT STARTED |
| `APP11-S03` | Gallery entry detail | NOT STARTED |
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
EXPECTED_APP11_MIGRATION_DELTA = 0 (stays at 37)
EXPECTED_APP11_ROUTE_DELTA     = Storefront 12 → 18 pages (+2 route files)
                                 Admin      23 → 25 pages
```

### 3.1 The persistence already exists

Migration `0018_create_content_gallery_agreement_tables.sql` created
`gallery_entries` (TBL-064), `gallery_entry_assets` (TBL-065), `content_pages`
(TBL-066) and `redirect_rules` (TBL-067), with `IDX-066` (published gallery
listing) and `IDX-067` (DB5's "Q-06 sitemap scan") already built. The API
`GalleryModule` and `ContentModule` compose their repositories today. APP11 adds
the missing read models, HTTP operations and UI — **it creates no table**.

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
| `APP11-B04` | Public indexable-URL inventory for the sitemap | +1 | 0 |
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
- Migration count still 37; OpenAPI delta exactly +11 operations.
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
