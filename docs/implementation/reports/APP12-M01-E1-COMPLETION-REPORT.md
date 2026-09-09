# APP12-M01.E1 — Product Multi-Image Gallery · Final Cross-Boundary Acceptance

`APP12-M01.E1 = CORRECTION_REQUIRED`

The final internal acceptance package inside the single `APP12-M01` checkpoint.
Not a new APP12 checkpoint id. Nothing was pushed, nothing was deployed, no
`APP12-G03` data was created, no shared development database was written, no
runtime implementation file was changed, no migration was added and no HTTP
operation was added.

---

## A. Verdict

```text
APP12-M01.E1 = CORRECTION_REQUIRED
APP12-M01    = IMPLEMENTATION_IN_PROGRESS
APP12-G03    = NOT_AUTHORIZED
```

Thirty-three cross-boundary journeys were built and run against one disposable,
production-like world. **Thirty-one pass.** Two things stop closure, and neither
is a matter of judgement:

**1. §13 — the Admin cannot tell an operator that the stored primary is
degraded.** Reproduced in eight consecutive runs. The Admin *contract* publishes
the truthful state (`AdminProductMediaResponse.status = "REJECTED"`), the
approved Vietnamese caption for it already exists and is already rendered
elsewhere on the Admin — and the media editor shows none of it, because the
screen throws the status away before it can be drawn. Public surfaces silently
serve a fallback while the operator's screen looks entirely healthy. §13 forbids
waiving this and forbids fixing it inside E1. The exact seam and the smallest
correction are in §L.

**2. §2 — the mandatory lightbox Figma reconciliation could not be executed.**
The Figma Desktop MCP server (`http://127.0.0.1:3845/mcp`, the repository's only
configured Figma authority) refused every connection attempt across the whole
session; nothing is listening on the port. §2 requires runtime and current Figma
authority to agree **before** cross-boundary acceptance begins, so this is a
precondition that was never met rather than a step that was skipped. The registry
was deliberately **not** edited — see §C.

Runtime acceptance was run anyway, so the correction has a complete picture
rather than one blocked item hiding others. It found exactly one more, and that
one is §13.

```text
NEW HTTP OPERATIONS   0
NEW ROUTES            0
NEW MIGRATIONS        0
NEW MESSAGE KEYS      0
NEW FIGMA ARTIFACTS   0
NEW DEPENDENCIES      0
RUNTIME FILES CHANGED 0
```

---

## B. S1-C1 Product Owner reconciliation

`APP12-M01.S1-C1 = COMPLETE — PO PASS` is unchanged and was re-proved live rather
than assumed. Every clause of §1's canonical runtime authority is asserted by
this run, on the final world and with the real purchase controls that caused the
original defect present:

| §1 clause | Where it is proved | Result |
|---|---|---|
| rendered at viewport level through a portal | §P hit tests, 1440 / 1024 / 390 | pass |
| shell header remains below overlay | §P, all three viewports | pass |
| purchase panel remains below overlay | §P, 1440 / 1024 (below fold at 390 — §P.2) | pass |
| variant controls remain below overlay | §P, 1440 / 1024 | pass |
| background scroll locked while open | §P, `body.style.overflow === 'hidden'`, wheel moves nothing | pass |
| scrollbar width compensated | §P, header box width identical while locked | pass |
| prior scroll/body styles restored on close | §P, `overflow` and `paddingRight` both back to `''`, scrollY kept | pass |
| focus remains inside modal | §P, eight consecutive `Tab` presses | pass |
| focus returns to opener on close | §O | pass |
| circular outline chevron buttons | §U.1, measured geometry | pass |
| accessible names `Ảnh trước` / `Ảnh sau` | §U.1 | pass |

The portal is untouched. No local `z-index` workaround was introduced anywhere.

---

## C. Lightbox Figma reconciliation — NOT EXECUTED

### C.1 Why

```text
figma-desktop MCP  http://127.0.0.1:3845/mcp   ConnectionRefused
port 3845                                       nothing listening (netstat: 0 matches)
curl probe                                      HTTP 000, three separate attempts
```

`~/.claude.json` declares exactly one Figma server, `figma-desktop`, of type
`http` at that address. It is the same authority every prior design package in
this phase used. The Figma desktop application was not running with its local MCP
server enabled at any point during this session, and the user was told at the
first attempt.

There is no second path. The Figma REST API is not configured in this repository,
and inventing one would be a new integration inside an acceptance package that
§3 caps at zero implementation changes.

### C.2 What was deliberately not done

`docs/design/FIGMA_DESIGN_INDEX.md` was **not edited.**

Editing the registry row without redrawing the frame would record
`FIG-APPROVAL-APP12-M01-S1-C1-PO-001` against a drawing that still shows text
buttons — the registry would then assert agreement that does not exist, and the
mechanical gate cannot detect that (it checks registry integrity, not what a
frame depicts). `APP12-M01.S1-C1` §T.1 refused the same shortcut for the same
reason. The gap stays recorded and unclaimed.

```text
node tools/check-figma-design-index.mjs
→ passed (578 registry IDs, 578 node rows, 26 registry tables)
```

The registry is internally consistent. It is the drawing that is stale.

### C.3 §2.2 — the historical frames, inspected as required

§2.2 asks the registry to be inspected before anything is touched. It was:

| Registry ID | Node | Status | Owning phase | Supersedes/By |
|---|---|---|---|---|
| `FIG-APP12-M01-D1-SF-LIGHTBOX` | `944:187` | `APPROVED_FOR_IMPLEMENTATION` | `APP12-M01.D1` | — |
| `FIG-S02-PRODUCT-DETAIL-LIGHTBOX-DESKTOP` | `533:3` | `APPROVED_FOR_IMPLEMENTATION` | `APP2-S02-G01` | — |
| `FIG-S02-PRODUCT-DETAIL-LIGHTBOX-MOBILE` | `533:26` | `APPROVED_FOR_IMPLEMENTATION` | `APP2-S02-G01` | — |

**The finding is that `533:3` and `533:26` are not historical.** Neither carries
`SUPERSEDED`, and neither points at a replacement in the `Supersedes/By` column —
the registry's own documented convention for a retired row (§56 of the index:
"`SUPERSEDED` rows point to a replacement", as used for the three
`FIG-STOREFRONT-SHELL-*` rows). Both are therefore still **active implementation
authority for this exact lightbox control**, and both draw text navigation
buttons. §2.2's second branch applies, not its first.

**Recommended decision, for the correction to execute** (stated here rather than
applied, because it needs the Figma write §2.1 gates on):

```text
944:187   reconcile   redraw previous/next as circular outline chevrons
                      keep counter, stage, strip, close treatment, image, layout
                      Approval Evidence → FIG-APPROVAL-APP12-M01-S1-C1-PO-001

533:3     supersede   status → SUPERSEDED
533:26                Supersedes/By → FIG-APP12-M01-D1-SF-LIGHTBOX
                      note: "Product Detail lightbox authority moved to the
                      APP12-M01.D1 package"
```

Superseding rather than redrawing the two `APP2` frames, because they are an
earlier era's single-image lightbox: `944:187` already replaced them in substance
when `M01.D1` drew the multi-image gallery, and §2.2 forbids editing history
merely to make it look current. Redrawing them would produce two more frames to
keep in step with a control that has one owner.

### C.4 What the runtime actually is

Measured, so the redraw has a specification rather than a description
(§U.1, `evidences/m01-e1/desktop/sf-lightbox-chevrons.png`):

```text
box            44 × 44 CSS px, square           (= $size-touch-target-min)
border-radius  50%                              (a real circle, not a rounded pill)
border         1px solid, non-zero              (outline treatment)
background     transparent at rest              (rgba(…, 0))
icon           inline <svg>, aria-hidden="true"
visible text   none
accessible name "Ảnh trước" / "Ảnh sau"          (byte-identical to the approved copy)
```

---

## D. Final architecture authority — re-proved, not restated

| §4 rule | Proof | Result |
|---|---|---|
| `MAX_PRODUCT_MEDIA_ITEMS = 20` | §F domain, §G cap journey | pass |
| same Asset at most once per Product | §F DB + §F domain + picker partition | pass |
| ordered positions `0..N-1` | §F, read from `product_media` | pass |
| position 0 = canonical stored primary | §F, §H | pass |
| position 0 role = `THUMBNAIL` | §F, §H | pass |
| no per-SKU image model | no such association exists; contract unchanged | pass |
| no order image snapshotting | no such write exists; contract unchanged | pass |
| stored primary eligible → public primary = stored primary | §J | pass |
| stored primary ineligible → lowest-display-order eligible | §K | pass |
| public reads never mutate `product_media` | §K, rows compared before/after | pass |
| non-detail Storefront = one primary thumbnail, no card carousel | §J Discover card | pass |
| Product Detail ordered gallery / stage `CATALOG_PREVIEW` / strip `THUMBNAIL` | §M, §Q | pass |
| counter visible when total > 1, absent at 1 | §M | pass |
| one horizontal strip | §M, distinct `y` offsets | pass |
| lightbox opens selected image | §O | pass |
| DRAFT: whole-form atomic save | §G | pass |
| PUBLISHED: core read-only, media editable, `adminProductMedia_replace`, stays PUBLISHED | §H | pass |

---

## E. Disposable acceptance world

One world, built and dropped by the run. A new orchestrator mode,
`--app12-m01e1`, and the first in the repository to start the **Admin and the
Storefront over one catalog** — which is the whole point: §11 and §12 are claims
about an operator's write reaching a visitor's page, and neither the `A1`
topology (no Storefront) nor the `S1` one (no operator) can carry them.

```text
real PostgreSQL              disposable embroidery_db7_e2e_*, migrations 1..39
real API                     the compiled AppModule, real guards, real session
real Admin                   next start, production build, real login form
real Storefront              next start, production build
real gateway                 the E2E Nginx, proxy_cache off
real object storage          this run's MinIO
real processed derivatives   86 Assets, 172 real WebP derivative objects
real browser                 headed Chromium, every run visible
```

Fixtures, seeded in order into the one database:

```text
APP12-M01.A1 media fixture     30 assets, 60 derivative objects
APP12-M01.S1 gallery fixture   20 assets, 40 derivative objects
APP12-M01.E1 acceptance        36 assets, 72 derivative objects   ← new
```

§6's required representative states, and where each comes from:

| §6 state | Product | Fixture |
|---|---|---|
| DRAFT with 0 images | `m01a1-draft-0` | A1 |
| DRAFT with 8 images | `m01a1-draft-8` | A1 |
| DRAFT with 20 images | `m01a1-draft-20` | A1 |
| PUBLISHED with 1 image | `m01a1-pub-1` | A1 |
| PUBLISHED with 20 images | `m01s1-anh-20` | S1 |
| PUBLISHED, canonical primary made unavailable | `m01e1-suy-giam` | E1 |

The E1 fixture adds only what neither of the others holds — six Products, each
with its **own** Assets:

```text
m01e1-lan-truyen     PUBLISHED   3 images   §11 stored-primary propagation
m01e1-suy-giam       PUBLISHED   3 images   §12 effective-primary degradation
m01e1-xuat-ban       PUBLISHED   3 images   §9  the three PUBLISHED saves
m01e1-tu-choi        PUBLISHED   3 images   §10 invalid-write refusals
m01e1-tin-hieu       PUBLISHED   3 images   §13 the degraded-primary audit
m01e1-mien-nghiep-vu DRAFT       0 images   §7  + a 21-Asset pool
```

Asset isolation is not tidiness. §10 permanently rejects an Asset, §12 degrades
one and §13 degrades another, and **the first version shared a Product between
§12 and §13**: a failing §13 left its Asset rejected, §12 then failed for §13's
reason, and the run reported two defects where there was one. Recorded in the
fixture, because it is the kind of coupling that makes an acceptance run lie.

Teardown, from the run's own output:

```text
[e2e] tearing down environment
[e2e] cleanup verified: all E2E ports closed, disposable database dropped
```

Every fixture and every mutation helper refuses any database not named
`embroidery_db7_*` before it opens a connection.

---

## F. DB and domain invariant acceptance (§7)

### F.1 — the database half

`APP12-M01.DB1`'s own integration suite, run as itself against a real PostgreSQL
rather than re-implemented here (a second copy of the same DDL assertions against
the same server proves nothing new):

```text
pnpm --filter @embroidery/database test -- app12-product-media
→ 2 suites, 23 tests, all pass
```

Covering, per §7 exactly:

```text
duplicate Product+Asset refused              ✓
duplicate Product+display_order refused      ✓
position < 0 refused                         ✓
position >= 20 refused                       ✓
THUMBNAIL above position 0 refused           ✓
non-THUMBNAIL at position 0 refused          ✓
valid positions 0..19 accepted               ✓
the four constraints 0039 names are installed ✓
```

### F.2 — the application half

The half no constraint can prove: that the application composes a legal write in
the first place. Driven over real HTTP against the real API with a real Admin
session, because **no screen can compose the refusals** — no control offers a
twenty-first image and none offers the same image twice.

Asserted against the rows the service wrote, read straight out of the database
rather than back through the projection that produced them.

| §7 claim | Result |
|---|---|
| 20 selected images accepted | 200; 20 rows written |
| application writes contiguous `0..N-1` | `[0..19]`, no gap, no repeat |
| exactly one application-written `THUMBNAIL` when N>0 | one, at position 0 |
| 21 refused **atomically** | 400; the accepted 20 byte-identical afterwards |
| duplicate requested Asset refused | 400 `PRODUCT_MEDIA_DUPLICATE`; rows unchanged |
| unknown Asset refused | 400 `PRODUCT_MEDIA_ASSET_NOT_FOUND`; rows unchanged |
| the route still accepts a legal write immediately after | 200; no lock, no partial row |
| empty selection legal on a DRAFT | 200; 0 rows |

**One observation, not a defect.** The twenty-first image is refused as
`BAD_REQUEST` rather than `PRODUCT_MEDIA_TOO_MANY`: the cap is stated twice, once
as `.max(MAX_PRODUCT_MEDIA_ITEMS)` on the request schema and once as a domain
rule behind it, and the schema runs first. Both are 400 and both are whole. The
assertion is on the refusal and on what survived it, not on which layer spoke.

```text
migrations = 39, no 0040   ✓ (§V)
```

---

## G. Admin DRAFT journey (§8)

Real Admin, real operator logged in through the real form, real thumbnails.

```text
open DRAFT Product                       ✓  8 images, 8/20
real thumbnails render                   ✓  every <img> complete, naturalWidth > 0
n/20 visible                             ✓
open multi-select picker                 ✓
already-added Assets not selectable      ✓  checkboxes = options − badges (partition)
remaining capacity visible               ✓  "Còn 1 chỗ" at the cap
add several Assets                       ✓  8 → 10
set non-primary as primary               ✓
reorder non-primary                      ✓
remove non-primary                       ✓  no confirmation dialog (nothing else changes)
save                                     ✓  one PATCH, observed on the wire
reload                                   ✓
```

Required result:

```text
exact server order preserved   ✓  rendered order after reload === staged order
primary = first item           ✓  badge + label, two independent signals
count preserved                ✓  9/20
one normal DRAFT save path     ✓  PATCH /api/admin/products/{id} — and no media PUT
no partial media/commercial    ✓  still DRAFT afterwards; no lifecycle side effect
```

At the cap:

```text
20/20 visible                  ✓
add disabled                   ✓  "Thêm ảnh" programmatically disabled
picker cannot exceed cap       ✓  one place free → one checkbox, the rest aria-disabled
                                  and a forced click leaves them unchecked
```

**The picker assertion had to be corrected during this package.** The first
version required at least one "Đã thêm" badge on the picker's first page. The
picker pages at 24 and this world holds every M01 fixture's Assets, so how many of
a Product's eight land on page one is a property of the cursor, not of the rule
under test — it failed on a larger catalog while the rule held perfectly. The
assertion is now on the *partition*, which is the rule.

Responsive, measured rather than assumed (the media section sits inside a form
column whose width the Admin nav and the 320px metadata rail decide, so a
viewport number says nothing about how many tiles fit):

```text
1440   grid columns = 4    horizontal document overflow = 0
1024   grid columns = 3    horizontal document overflow = 0
 390   grid columns = 2    horizontal document overflow = 0
```

Never one full-width column at any width — the anti-pattern `M01.D1-C1` exists to
remove.

---

## H. Admin PUBLISHED journey (§9)

A PUBLISHED Product with a real buyable composition (variant, SKU, stock), which
the `A1` PUBLISHED Products deliberately do not have.

Locked and unlocked halves, asserted programmatically rather than by appearance:

```text
core fields read-only     ✓  name and price inputs disabled at 1440 and 390
media section interactive ✓  "Thêm ảnh" enabled; "Thay đổi ảnh không làm sản phẩm
                             ngừng xuất bản." on screen
status stays PUBLISHED    ✓  the rail badge reads "Đã xuất bản" after every save
```

The three required saves, each proved on the wire and then in the database:

| Step | Staged | Request | Stored afterwards |
|---|---|---|---|
| reorder | `[A,B,C]` → `[A,C,B]` | `PUT …/media`, body keys exactly `expectedUpdatedAt` + `mediaAssetIds` | `[A,C,B]`, positions `0,1,2`, one THUMBNAIL at 0 |
| set primary | `[A,C,B]` → `[C,A,B]` | same operation | `[C,A,B]` |
| remove primary | `[C,A,B]` → `[A,B]` | same operation | `[A,B]` |

```text
every save used adminProductMedia_replace   ✓  PUT /api/admin/products/{id}/media
no generic PUBLISHED Product PATCH          ✓  watched for 10 s on every save; never seen
no unpublish/republish transition           ✓  PUBLISHED before, during and after
```

Two behaviours worth naming because they are easy to get wrong and were right:

- **Set-primary pushes, it does not swap.** `[A,C,B]` with `C` chosen became
  `[C,A,B]` — the previous primary moved to position 1 rather than to where `C`
  was. A set-primary is not a request to rearrange the gallery.
- **Removing the primary asks first.** It is the one removal that rewrites the
  Product's canonical thumbnail, `og:image` and every non-detail surface, and it
  is the only one that raises a confirmation. The requested first remaining image
  is then promoted.

At 390: banner visible, core fields disabled, media editable, picker sheet opens,
`horizontal document overflow = 0` throughout.

---

## I. Invalid-write and concurrency journeys (§10)

Every case ends with the same three-part check, made against the **rows** rather
than against the response that refused: the stored images are byte-identical, the
Product is still PUBLISHED, and the commercial fields are still locked.

| Case | How it was produced | Refusal | Atomic |
|---|---|---|---|
| empty media set | disabled on screen, then asked of the server directly | control disabled + `Sản phẩm đang xuất bản cần ít nhất một ảnh.`; server 409 `PRODUCT_MEDIA_NOT_PUBLISHABLE` | ✓ |
| rejected Asset | Asset set `REJECTED` between staging and saving | `Một ảnh chưa sẵn sàng` | ✓ |
| tombstoned/ineligible Asset | same mechanism — the real Asset authority | same | ✓ |
| missing required derivative | `CATALOG_PREVIEW` row removed, Asset left `ACCEPTED` | `Không thể lưu bộ ảnh này` | ✓ |
| duplicate Asset | HTTP only — no control offers it | 400 `PRODUCT_MEDIA_DUPLICATE` | ✓ |
| 21 Assets | HTTP only — `Thêm ảnh` disables itself at the cap | 400 | ✓ |
| stale `expectedUpdatedAt` | two real tabs, both holding the same token | `Sản phẩm vừa được người khác cập nhật` | ✓ |

**Operator-facing Vietnamese, never a backend code.** Each refusal panel was
asserted to contain the approved copy *and* asserted not to contain any of
`PRODUCT_MEDIA_NOT_PUBLISHABLE`, `PRODUCT_MEDIA_ASSET_UNAVAILABLE`,
`PRODUCT_MEDIA_DUPLICATE`, `PRODUCT_MEDIA_TOO_MANY`, `PRODUCT_VERSION_CONFLICT`.
The copy is transcribed from `packages/i18n/messages/vi/admin.json` rather than
imported — a suite that read the same JSON the application renders would agree
with any wording, including a wrong one.

**Stale concurrency cannot overwrite.** Tab A's write landed; tab B submitted
against the token it had held all along and was refused; the conflict dialog
offers exactly two controls — reload and close — and **no force-save exists**.
The server still held tab A's write afterwards.

**The missing-derivative case restores what it removed.** Left removed, that
Asset would make every later save on the same Product refuse for *this* case's
reason, and the stale-token journey would then prove nothing about concurrency.
Recorded because the first version did exactly that.

---

## J. Stored-primary propagation (§11)

After the operator promotes the third image on a PUBLISHED Product through the
real screen and the real media-only write, all five public surfaces name the same
association:

```text
Discover/list thumbnail   01a08013-b58e-7457-a2f6-ce0194a28498
Product Detail media[0]   01a08013-b58e-7457-a2f6-ce0194a28498
Product Detail stage      01a08013-b58e-7457-a2f6-ce0194a28498
og:image                  01a08013-b58e-7457-a2f6-ce0194a28498
JSON-LD image[0]          01a08013-b58e-7457-a2f6-ce0194a28498
```

and that association is the one the operator chose — verified by reading it back
out of `product_media`: `assetId = C`, `displayOrder = 0`, `role = THUMBNAIL`, on
this Product's slug. No page independently chose anything; the same agreement
holds on a second, independently curated Product, and the visitor's strip is the
operator's stored order rather than a re-sort.

### J.1 — the identity this is compared on, and the mistake that found it

**The public media address carries the `product_media` row's own id, not the
Asset's.** `publicProductMediaPath({ slug, productMediaId, rendition })` is what
the projection composes.

The first version of this suite compared the surfaces against
`product_media.asset_id` and reported a mismatch on pages that were entirely
correct — five surfaces agreeing perfectly on an id that owned no row, three runs
in a row, with the harness confidently pointing at the application. It was chased
through a stale-cache theory (disproved: both routes are `force-dynamic` and the
gateway sets `proxy_cache off`), a gateway-collision theory (disproved: dev on
port 80, E2E on 8090) and a wrong-product theory (disproved by asserting the
resolved URL) before a diagnostic that printed the raw address, the row that owns
it and the API's own payload settled it in one run.

Recorded because it is the more useful half of §11: the claim is that one
*association* drives every surface, and the association is precisely what the URL
identifies. The Admin-side assertions stay on Asset ids, because the operator's
screen addresses images by Asset and the write body is `mediaAssetIds`; the two
identities meet in one read that returns both.

`adminProductMedia_replace` replaces the whole ordered set, so the association ids
are **new** after a write — which is why the surfaces are compared against a
freshly read row rather than one held from before.

---

## K. Degraded-primary fallback (§12)

Start: stored primary `A`, gallery `B`, `C`, Product PUBLISHED, five surfaces
agreeing on `A`.

`A` is made ineligible through the **real Asset authority** — `assets.status`,
the exact column `assetEligibility()` compares — and `product_media` is not
touched.

```text
Discover/list primary     c4e60877-2471-4a96-84f7-f79d07393c5d   = B
Product Detail media[0]   c4e60877-…                             = B
Product Detail stage      c4e60877-…                             = B
og:image                  c4e60877-…                             = B
JSON-LD image[0]          c4e60877-…                             = B
```

The lowest-display-order eligible media wins, on every surface, by the same
comparison — because all five are built from one ordering.

**The read side wrote nothing.** The stored rows were captured before the
degradation and compared afterwards as whole objects — same association ids, same
roles, same positions — and `A` is still the stored canonical primary with
`role = THUMBNAIL` at position 0.

**Recovery needs no repair step.** Restoring the Asset to `ACCEPTED` returns every
surface to `A`, and `product_media` is still byte-identical to where the operator
left it.

---

## L. Admin degraded-primary operator signal (§13) — CORRECTION REQUIRED

### L.1 — what was asked, and how it was asked

§13 permits an already-delivered treatment to satisfy it and forbids inventing an
API in E1, so the journey asks the question rather than answering it: with the
stored primary rejected, and after a **fresh read** of the Admin product media
screen, is anything on that screen true about the degradation?

Four candidate signals are probed as a set, because §13 prescribes no treatment
and any of them would satisfy it. The probe is calibrated first against a healthy
Product, so a result has to be a *change* rather than something the screen always
shows.

### L.2 — the result, reproduced in eight consecutive runs

```text
healthy   {"tileStateCaption":false,"sectionNotice":false,"tileDataAttribute":false,"imageFailed":false}
degraded  {"tileStateCaption":false,"sectionNotice":false,"tileDataAttribute":false,"imageFailed":false}
```

Identical. The screen does not change at all.

Meanwhile, in the same journey and the same moment:

```text
GET /api/admin/products/{id}
→ media[].status === "REJECTED" for the stored primary
```

So the **contract is truthful and the screen discards it.** That is the whole
finding, and it is why this is a small correction rather than a design question.

Evidence: `evidences/m01-e1/desktop/admin-degraded-stored-primary.png` — a media
grid that looks perfectly healthy while the public pages have silently moved to a
fallback.

### L.3 — the exact seam

Three source facts, each verified:

```text
1  apps/admin/src/features/products/model/product-media-selection.ts:44-49
   selectionFromDetailMedia(media: AdminProductMediaResponse[]): readonly string[]
   → narrows the response to asset ids and discards `status`

2  apps/admin/src/features/products/components/product-media-grid.tsx:8
   readonly selection: readonly string[]
   → the grid therefore never receives a status to render

3  apps/admin/src/features/products/components/product-media-grid-tile.tsx:70
   <AssetThumbnail assetId={assetId} state="READY" … />
   → the tile hard-codes the healthy state
```

**Why the already-delivered fallback cannot rescue it by accident.**
`AssetThumbnail` has an `onError` swap that renders `Không tải được ảnh xem trước`
when a preview fails to arrive — but `AdminAssetPreviewService.open` checks the
Asset's *lane*, its `deletedAt` and its derivative's readiness, and never its
`status`. A `REJECTED` Asset keeps its `READY` derivatives, so the preview is
served normally and `onError` never fires. That is a coherent decision on the
delivery route's part; it just means the tile is the only place the truth can
appear.

**What already exists and would be reused** — no new API, no new copy, no new
migration, no new operation:

```text
AdminProductMediaResponse.status            already published by the contract
AssetThumbnailState = 'REJECTED'            already a delivered state
media.rejected = "Ảnh đã bị từ chối"        already an approved message key
ProductMediaTile.toState(status)            already maps exactly this, on the
                                            Product list screen
```

### L.4 — smallest proposed correction

```text
FU-APP12-M01-E1-01

Carry `status` alongside `assetId` from the Admin product read into the media
grid, and map it in the tile with the mapping `ProductMediaTile.toState` already
uses. Three files, one narrowed type widened:

  product-media-selection.ts   selectionFromDetailMedia returns the ordered
                               {assetId, status} pairs the response already
                               carries, rather than ids alone
  product-media-grid.tsx       `selection` carries the pair; passes status down
  product-media-grid-tile.tsx  state={toState(status)} instead of state="READY"

Scope explicitly NOT included: no new API, no new message key, no change to the
Admin preview route, no change to what a refused save says, no change to the
write body (still `mediaAssetIds`), no migration, no OpenAPI change.
```

The existing acceptance journey is already written and already fails on exactly
this, so the correction has its own proof waiting: §13 turns green when the tile
tells the truth, and the second §13 journey (the degradation is reversible and
leaves no residue) then runs and proves the screen goes clean again.

---

## M. Storefront 1 / 8 / 20-image acceptance (§14)

| Claim | 1 image | 8 images | 20 images |
|---|---|---|---|
| initial selection = `media[0]` | ✓ | ✓ | ✓ |
| main stage = `CATALOG_PREVIEW` (width 1600) | ✓ | ✓ | ✓ |
| strip = `THUMBNAIL` (width 800) | n/a | ✓ | ✓ |
| counter visible when total > 1 | absent ✓ | ✓ | ✓ |
| counter absent at total = 1 | ✓ | n/a | n/a |
| exactly one `aria-current` | n/a | ✓ | ✓ |
| strip is one horizontal row | no strip ✓ | ✓ | ✓ |
| no horizontal document overflow | ✓ | ✓ | ✓ |

At one image the strip and the counter are **not present** — not hidden, not
empty — and the lightbox renders no previous/next control it could not navigate.

At twenty images, at all three viewports:

```text
1440   one row, strip scrolls rather than widening, clientWidth ≤ 1440, overflow 0
1024   one row, strip scrolls,                      clientWidth ≤ 1024, overflow 0
 390   one row, strip scrolls,                      clientWidth ≤  390, overflow 0
```

Thumbnail height ≥ 44 px at every viewport — still a realistic touch target after
the strip was made to scroll.

**V02 purchase hierarchy preserved.** The price's document position with twenty
images is within 2 px of its position with eight. The counter is an overlay and
the strip is one row, so the decision column does not move.

---

## N. Responsive 1440 / 1024 / 390

Every state in §21 was captured at its required viewport; the file list is in §T.
Horizontal document overflow was measured as `scrollWidth − clientWidth` on the
document element — not inferred from a screenshot — and is `0` on every required
mobile state, on both applications.

---

## O. Counter, selection and keyboard (§15)

The twenty-image journey, in order:

```text
open Product Detail        counter = 1 / 20
select image 7             main = media[6]        alt "…— ảnh 7 trên 20"
                           counter = 7 / 20
                           aria-current exactly one, on control 7
open lightbox              starts at image 7      "Ảnh 7 trên 20"
next                       → 8
previous                   → 7
Escape                     closed
                           page still selected at image 7
                           focus returned to .product-detail__stage-trigger
```

```text
no stage arrows            the stage frame holds exactly one control — the
                           trigger — and the gallery region carries no
                           previous/next control of its own
roving strip               ArrowRight → 8, End → 20, one Tab stop
selected state             aria-current + opacity step + accent marker
                           (three signals; never colour alone)
```

Admin keyboard, in the same package: a control is reached by `Tab` alone,
operated with `Enter`, and the result is **announced** — `aria-live="polite"`
reading `Đã chuyển ảnh tới vị trí 2 trên 9.` A reorder changes nothing in a tile's
own text, so without the live region a keyboard operator perceives nothing at all.
The primary tile offers no set-primary action and both its arrows are
programmatically disabled.

---

## P. Lightbox viewport-overlay proof (§16)

Mechanical hit tests, not screenshots. `document.elementsFromPoint` — the plural,
so a failure reports *what* was on top rather than only that something was.

```text
target            1440      1024      390
shell header      lightbox  lightbox  lightbox
variant pill      lightbox  lightbox  (below fold — not testable)
purchase CTA      lightbox  lightbox  (below fold — not testable)
```

Plus, at every viewport: the scrim's box top/left/width/height equals
`0, 0, innerWidth, innerHeight` exactly, the close control is not clipped on any
edge, and document overflow is `0`.

### P.1 — the run cannot pass by testing nothing

Points are measured **after** the dialog opens, because the scroll lock freezes
the page beneath and those are the coordinates the controls actually hold while
the overlay is up. Targets outside the viewport are excluded — `elementsFromPoint`
is defined on the viewport, and a below-the-fold coordinate returns an empty stack
that reads exactly like "nothing is on top". The suite then **requires the shell
header to be among the tested targets**, so a run that tested nothing fails
instead of passing silently.

### P.2 — 390, honestly

The purchase panel is not hit-tested at 390 and that is the correct result: it
sits far below the fold and the scroll lock holds it there, so nothing can be
painting over the overlay at a point the visitor cannot see. The header is fixed
to the top of every viewport, was one of the two elements originally observed
painting over the overlay, and is tested at all three.

### P.3 — scroll boundary

```text
body.style.overflow            'hidden' while open
wheel 600px                    scrollY unchanged
page width under the overlay   identical while locked (no scrollbar-reclaim jump)
scrim while locked             still spans the full viewport
on close                       overflow '' , paddingRight '' , scrollY restored
```

The width is measured on a real block-level child of `body`, not on
`documentElement.clientWidth` — that metric *is* viewport-minus-scrollbar by
definition, so it changes the moment the scrollbar goes no matter what `body`
does. `S1-C1` recorded the same correction; this suite inherits it rather than
repeating the mistake.

---

## Q. Network and rendition proof (§18)

Cold twenty-image Product Detail load:

```text
initial CATALOG_PREVIEW requests   1
strip requests                     THUMBNAIL only, > 1 and ≤ 20
unrelated renditions               0
```

Not twenty thumbnails, and that is the delivered behaviour rather than a
shortfall: the strip is lazy and scrolls horizontally, so the browser fetches only
what it laid out inside the viewport. What matters is that everything it did ask
for is a `THUMBNAIL` and that no third rendition appeared from anywhere.

Non-selected full previews are not eagerly fetched — after viewing three images
the page had fetched at most three previews, never the other seventeen.

Representative requests, proved rather than assumed:

```text
HTTP 200                    ✓  both the preview and a thumbnail
content-type image/*        ✓
naturalWidth  > 0           ✓  stage and first thumbnail
naturalHeight > 0           ✓
```

A 404 satisfies every `src` assertion in a suite like this, which is why the
pixels are checked.

---

## R. Performance (§19)

Measured on a cold desktop load of the twenty-image Product, with a real
interaction so INP has a meaningful candidate, and with a full lightbox open/close
cycle included so scrollbar-removal shift would show:

```text
              measured     budget
LCP             384 ms   ≤ 2500 ms   ✓
CLS         0.0000134   ≤   0.10     ✓
INP              32 ms  ≤  200 ms    ✓
TTFB             21 ms  ≤  800 ms    ✓
```

Opening and closing the lightbox creates no layout shift: CLS after a full cycle
is 1.3 × 10⁻⁵, four orders of magnitude inside budget. The scroll lock's
padding compensation is what makes that true, and it is asserted directly in §P.3
as well as measured here.

---

## S. Accessibility (§20)

```text
axe serious/critical = 0 on every focused surface
```

| Surface | Result |
|---|---|
| Admin 20-image editor | 0 |
| Admin PUBLISHED media editor | 0 |
| Admin picker | 0 |
| Admin mobile selected-image action bar (390) | 0 |
| Storefront Product Detail 20-image desktop | 0 |
| Storefront Product Detail 20-image mobile | 0 |
| Storefront lightbox 1440 | 0 |
| Storefront lightbox 390 | 0 |

Also proved, beyond the scan:

```text
Admin keyboard reorder / set-primary / remove   ✓ §O
Storefront roving thumbnail keyboard            ✓ §O
focus-visible                                   ✓ (2px outline, offset 2, on the chevrons)
primary state not colour-only                   ✓ badge + text label (Admin)
                                                  aria-current + opacity + marker (Storefront)
one aria-current                                ✓ §M, §O
lightbox modal semantics                        ✓ role=dialog, aria-modal, accessible name
Escape closes                                   ✓ §O
focus cannot move behind modal                  ✓ 8 consecutive Tab presses
focus returns to opener                         ✓ §O
chevron buttons have accessible names           ✓ §C.4
```

`color-contrast` is excluded from the **gate** and from nothing else, for the
reason `APP12-H08` recorded and `PO-APP12-004` ruled: the failing token pairs are
`APP12-V02`'s to change, not this package's. It is the only authorized exception
used, and no other rule was disabled to reach a number.

---

## T. Visual evidence

Under `evidences/m01-e1/`:

```text
desktop/  admin-draft-20-images.png            §21 Admin 1440 DRAFT 20
          admin-published-media-editable.png   §21 Admin 1440 PUBLISHED
          admin-degraded-stored-primary.png    §13 the finding
          cross-stored-primary-propagated.png  §11
          cross-degraded-effective-primary.png §12
          sf-one-image.png                     §21 one-image
          sf-eight-images.png                  §21 1440 / 8
          sf-twenty-images.png                 §21 1440 / 20
          sf-image-7-selected.png              §21 image 7 selected
          sf-lightbox.png                      §21 1440 lightbox
          sf-lightbox-chevrons.png             §17 runtime half of the pair

tablet/   admin-draft-20-images.png            §21 Admin 1024 DRAFT 20
          sf-twenty-images.png                 §21 1024 / 20
          sf-lightbox.png                      §21 1024 lightbox

mobile/   admin-draft-20-images.png            §21 Admin 390 DRAFT 20
          admin-published-media-editable.png   §21 Admin 390 PUBLISHED
          admin-picker.png                     §21 390 picker
          admin-selected-image-action-bar.png  the 390-only Admin surface
          sf-twenty-images.png                 §21 390 / 20
          sf-lightbox.png                      §21 390 lightbox
```

§17's evidence pair is **incomplete by exactly one half**: the runtime side
(`sf-lightbox-chevrons.png`, with the measured geometry in §C.4) exists; the
current-Figma side does not, because §2 could not run.

---

## U. Figma and registry evidence

### U.1 — the runtime half of §17

Both controls, measured in the browser rather than described:

```text
                    Ảnh trước      Ảnh sau
box                 44 × 44        44 × 44        (square, ≥ minimum touch target)
border-radius       50%            50%            (a circle)
border-width        ≥ 1px          ≥ 1px          (outline)
background at rest  transparent    transparent    (not a filled pill)
icon                inline <svg>, aria-hidden="true", one per control
visible text        none           none
accessible name     "Ảnh trước"    "Ảnh sau"
```

### U.2 — registry state

```text
node tools/check-figma-design-index.mjs   passed
                                          578 registry IDs, 578 node rows,
                                          26 registry tables

FIG-APPROVAL-APP12-M01-S1-C1-PO-001       NOT recorded anywhere
docs/design/FIGMA_DESIGN_INDEX.md         unchanged (git diff empty)
Figma artifacts created or modified       0
```

The approval id is deliberately unused. Recording it against an unchanged drawing
is the one way this package could have produced a false claim, and §C.2 says why
it was not done.

---

## V. Contract and baseline (§5)

Verified from the artifacts and from a live database, not quoted:

```text
                      measured   expected
OpenAPI paths            127       127     ✓
OpenAPI operations       140       140     ✓
OpenAPI schemas          279       279     ✓
public operations         49        49     ✓   (operations tagged public*)
migrations                39        39     ✓   (last = 0039; no 0040)
DB tables                 79        79     ✓   (information_schema, live)
Admin routes              26        26     ✓
Storefront routes         20        20     ✓
```

```text
pnpm --filter @embroidery/api openapi:check          up to date
pnpm --filter @embroidery/api-client check:generated up to date
```

Stronger than measurement: `git diff HEAD --name-only` returns **nothing outside
`packages/e2e-testing/`**, so every one of these is unchanged by construction.

---

## W. Historical debt routing (§22)

Two items were found, both pre-existing at the entry HEAD, both verified on a
stashed pristine tree, and **neither fixed here**:

| Debt | Evidence at HEAD | Routing |
|---|---|---|
| `pnpm --filter @embroidery/e2e-testing check:e2e` fails: `specs/app12/support/v02-c2-world.ts` imports `admin.json` without an import attribute, so `playwright test --list` collects 0 tests | reproduced on a pristine stash, identical output | `FU-APP12-M01-E1-02` — owned by `APP12-V02-C2` |
| `pnpm format:check` fails on `support/app12/v02-c1-login-reflow.mjs` | reproduced on a pristine stash | `FU-APP12-M01-E1-03` — owned by `APP12-V02-C1` |

Also recorded, and deliberately not touched:
`packages/e2e-testing/playwright.config.ts` (474 lines at HEAD) and
`scripts/run-e2e.mjs` (1092 lines at HEAD) were **already** past the 400-line
source limit before this package. Every APP12 browser package has extended them
the same way. Splitting the shared orchestrator inside an acceptance package
would be exactly the unrelated refactoring §22 forbids.

No unrelated historical debt was absorbed. Every failure on an M01-owned surface
is reported in §L.

### W.1 — one product observation, outside M01's scope

`staff-auth.config.ts` limits staff logins to **20 per IP per 15 minutes**, and a
*successful* login clears only the identifier dimension — the IP budget is spent
either way. A suite that logs in per test exhausts it partway through a run, and
every later journey then fails at the login form.

This is the rate limiter working correctly and the harness was what changed: one
operator session per spec file, which is also the more faithful journey. Recorded
here only because the behaviour is worth knowing before a future package writes a
long authenticated suite; it is **not** proposed as a change.

---

## X. Files changed

```text
M  packages/e2e-testing/package.json                                   (2 scripts)
M  packages/e2e-testing/playwright.config.ts                           (4 projects)
M  packages/e2e-testing/scripts/run-e2e.mjs                            (the mode)
A  packages/e2e-testing/support/app12/m01e1-acceptance-fixture.mjs     (the world)
A  packages/e2e-testing/support/app12/m01e1-world-mutations.mjs        (its damage + reads)
A  packages/e2e-testing/specs/app12/support/m01e1-world.ts             (run identity)
A  packages/e2e-testing/specs/app12/support/m01e1-public-surfaces.ts   (the five surfaces)
A  packages/e2e-testing/specs/app12/m01e1-domain.acceptance.spec.ts        §7
A  packages/e2e-testing/specs/app12/m01e1-admin-curation.acceptance.spec.ts §8 §9
A  packages/e2e-testing/specs/app12/m01e1-admin-refusals.acceptance.spec.ts §10
A  packages/e2e-testing/specs/app12/m01e1-admin-a11y.acceptance.spec.ts     §20
A  packages/e2e-testing/specs/app12/m01e1-admin-signal.acceptance.spec.ts   §13
A  packages/e2e-testing/specs/app12/m01e1-cross-primary.acceptance.spec.ts  §11 §12
A  packages/e2e-testing/specs/app12/m01e1-sf-gallery.acceptance.spec.ts     §14 §15 §18 §19
A  packages/e2e-testing/specs/app12/m01e1-sf-lightbox.acceptance.spec.ts    §16 §17 §20
A  evidences/m01-e1/**                                                 (20 screenshots)
```

**Zero runtime implementation files.** `git diff HEAD --name-only` lists nothing
outside `packages/e2e-testing/`, and no untracked file exists outside it either —
so §3's `runtime = 0, DB = 0, OpenAPI = 0, generated-client = 0, migrations = 0`
holds by construction rather than by inspection.

The two splits (`m01e1-world-mutations.mjs`, `m01e1-public-surfaces.ts`) exist
because the originals crossed the 400-line source limit, and each is split by
responsibility rather than at a line number: seeding from damaging, and the run's
identity from the surfaces it reads.

`run-e2e.mjs` shows more diff than its logical change because Prettier re-indented
the two nested ternary chains the new mode extends. The reformat is confined to
those two chains.

---

## Y. Validation

```text
git diff --check                                              clean

pnpm --filter @embroidery/e2e-testing typecheck               pass
pnpm --filter @embroidery/e2e-testing lint                    pass
pnpm --filter @embroidery/database test -- app12-product-media
                                                              2 suites, 23 tests, pass
pnpm --filter @embroidery/api test -- product-media           8 suites, 98 tests, pass
pnpm --filter @embroidery/admin test -- product-media         3 suites, 61 tests, pass
pnpm --filter @embroidery/storefront test -- product-detail   8 suites, 136 tests, pass

pnpm --filter @embroidery/api openapi:check                   up to date
pnpm --filter @embroidery/api-client check:generated          up to date

node tools/check-i18n-static-text.mjs                         OK, 0 exemptions
node tools/check-i18n-message-keys.mjs                        OK
node tools/check-figma-design-index.mjs                       passed
node tools/check-storefront-route-authority.mjs               passed
node tools/check-storefront-product-detail-authority.mjs      passed
node tools/check-storefront-product-detail-correction.mjs     passed
node tools/check-report-secrets.mjs                           passed (686 docs, 5408 files)
node tools/check-file-size.mjs --paths <the 12 E1 files>       passed (1 above review
                                                              threshold, 0 over limit)
pnpm format:check                                             baseline-equal (§W)

pnpm --filter @embroidery/e2e-testing e2e:app12:m01e1:headed  31 passed, 1 failed, 1 skipped
```

**Every Playwright run was headed and visible**, never headless or hidden.

No Admin route-authority gate exists in `tools/` — only the Storefront one — so
§23's "Admin/Storefront route-authority gates" is satisfied by the Storefront gate
plus the Admin route count in §V. Recorded rather than glossed.

`check:release-config` requires a `staging|production` argument and is a
deployment gate; E1 deploys nothing, so it was not run.

### Y.1 — five harness faults this package had to correct

Each was the test being wrong while the code was right, and each is recorded
because a suite that had passed on any of them would have proved less than it
claimed:

1. **The wrong identity.** Public media addresses carry the `product_media` row
   id, not the Asset id; comparing against the Asset id reported a mismatch on
   correct pages for three runs. §J.1.
2. **A cursor-dependent assertion.** The picker's "already added" badge count
   depends on where the cursor page falls in a larger catalog, not on the rule
   under test. §G.
3. **A watcher that could only reject.** A DRAFT save issues no media write, so
   arming one left a promise that always failed. §G.
4. **Cross-journey damage.** §13 and §12 shared a Product; a failing §13 left its
   Asset rejected and §12 then failed for §13's reason. §E.
5. **A click that outran the strip.** At 390 the seventh thumbnail starts outside
   a horizontally scrolling strip, and a click dispatched mid-settle lands on a
   neighbour. The selection is now addressed by accessible name and the click and
   its effect are retried together, so a run that merely pressed something cannot
   pass.

---

## Z. Hygiene

```text
shared_dev_mutations       0      (every fixture and mutation helper refuses any
                                   database not named embroidery_db7_*)
G03_data_created           false
production_deployed        false
pushed                     false
migrations_added           0
runtime_files_changed      0
figma_artifacts_changed    0
registry_rows_changed      0
http_operations_added      0
message_keys_added         0
dependencies_added         0
secrets_written            0
.env_mutations             0
disposable_world_teardown  PASS — "cleanup verified: all E2E ports closed,
                                  disposable database dropped"
temporary_processes        0
temporary_ports            closed
temporary databases/containers/volumes  removed
```

No credential was echoed, logged, cached, committed or passed as a command-line
argument. The Admin password travels the child process environment only, exactly
as every prior Admin mode does.

---

## AA. M01 closure matrix

| # | §25 criterion | Result |
|---|---|---|
| 1 | S1-C1 remains PO PASS | ✓ §B |
| 2 | current M01 lightbox Figma matches chevron runtime | **✗ §C — not executed** |
| 3 | approval id recorded correctly | **✗ §C.2 — deliberately not recorded** |
| 4 | no runtime implementation changed by E1 | ✓ §X |
| 5 | DB Product-media invariants remain active | ✓ §F.1 |
| 6 | 20-image cap remains enforced | ✓ §F, §G |
| 7 | DRAFT 20-image Admin flow works | ✓ §G |
| 8 | PUBLISHED media curation without unpublish | ✓ §H |
| 9 | PUBLISHED commercial fields read-only | ✓ §H |
| 10 | set-primary persists position 0 / THUMBNAIL | ✓ §H |
| 11 | remove-primary promotes the requested first remaining image | ✓ §H |
| 12 | reorder persists exact order | ✓ §G, §H |
| 13 | invalid PUBLISHED writes are atomic | ✓ §I |
| 14 | stale concurrency cannot overwrite | ✓ §I |
| 15 | Discover/list primary follows stored/effective primary | ✓ §J, §K |
| 16 | Product Detail media[0] agrees | ✓ §J, §K |
| 17 | og:image agrees | ✓ §J, §K |
| 18 | JSON-LD image[0] agrees | ✓ §J, §K |
| 19 | degraded primary falls back with no read-side mutation | ✓ §K |
| 20 | Admin exposes a truthful degraded-primary signal | **✗ §L — CORRECTION REQUIRED** |
| 21 | one-image Storefront state is clean | ✓ §M |
| 22 | 8-image state works | ✓ §M |
| 23 | 20-image 1440 works | ✓ §M |
| 24 | 20-image 1024 works | ✓ §M |
| 25 | 20-image 390 works | ✓ §M |
| 26 | counter semantics correct | ✓ §M, §O |
| 27 | thumbnail strip uses THUMBNAIL | ✓ §M, §Q |
| 28 | main stage uses CATALOG_PREVIEW | ✓ §M, §Q |
| 29 | non-selected full previews not eagerly fetched | ✓ §Q |
| 30 | lightbox opens the currently selected image | ✓ §O |
| 31 | viewport overlay covers header and purchase controls | ✓ §P |
| 32 | lightbox focus/scroll semantics correct | ✓ §P.3, §O |
| 33 | chevron buttons remain accessible | ✓ §S, §U.1 |
| 34 | LCP ≤ 2.5 s | ✓ 384 ms |
| 35 | CLS ≤ 0.10 | ✓ 0.0000134 |
| 36 | INP ≤ 200 ms | ✓ 32 ms |
| 37 | TTFB ≤ 800 ms | ✓ 21 ms |
| 38 | axe serious/critical = 0 | ✓ §S |
| 39 | no horizontal overflow on required mobile states | ✓ §M, §N |
| 40 | OpenAPI 127/140/279 | ✓ §V |
| 41 | public operations 49 | ✓ §V |
| 42 | migrations 39 | ✓ §V |
| 43 | DB tables 79 | ✓ §V |
| 44 | Admin routes 26 | ✓ §V |
| 45 | Storefront routes 20 | ✓ §V |
| 46 | no migration 0040 | ✓ §V |
| 47 | no new HTTP operation | ✓ §V, §X |
| 48 | shared-dev mutations = 0 | ✓ §Z |
| 49 | G03 data = false | ✓ §Z |
| 50 | disposable teardown = PASS | ✓ §Z |
| 51 | no production deployment | ✓ §Z |
| 52 | no push | ✓ §Z |
| 53 | final M01 report exists | ✓ this document |
| 54 | exactly one NEXT | ✓ §AB |
| 55 | G03 not executed | ✓ §Z |

```text
51 of 55 pass.
3 fail: criteria 2, 3 and 20.
1 (criterion 54) is redefined by the verdict — see §AB.
```

---

## AB. Roadmap

```text
APP12-M01.A      COMPLETE — PO PASS
APP12-M01.B1     COMPLETE — PO PASS
APP12-M01.DB1    COMPLETE — PO PASS
APP12-M01.B2     COMPLETE — PO PASS
APP12-M01.D1     COMPLETE_AFTER_C1 — PO APPROVED
APP12-M01.D1-C1  COMPLETE — PO PASS
APP12-M01.A1     COMPLETE — PO PASS
APP12-M01.S1     COMPLETE_AFTER_C1 — PO PASS
APP12-M01.S1-C1  COMPLETE — PO PASS
APP12-M01.E1     CORRECTION_REQUIRED          ← this package

APP12-M01        IMPLEMENTATION_IN_PROGRESS
APP12-G03        NOT_AUTHORIZED
ROADMAP_CHECKPOINTS  39
S1_CORRECTION_USED   1 / 1
```

`NEXT = PO_DECISION_REQUIRED` — E1 may not self-authorize closure, and two of the
three failing criteria need an environment the run does not control.

Two things are required before E1 can be re-run to completion, and they are
independent:

```text
1  Figma Desktop running with its local MCP server enabled, so §2 can execute.
   Operator action; nothing in the repository can substitute for it.
   Then: reconcile 944:187, supersede 533:3 / 533:26 (§C.3), record
   FIG-APPROVAL-APP12-M01-S1-C1-PO-001, capture the §17 evidence pair.

2  FU-APP12-M01-E1-01 — the Admin degraded-primary signal (§L.4).
   Three frontend files, no new API, no new copy, no new migration.
   Its acceptance journey is already written and already failing on exactly it.
```

Carried forward:

```text
FU-APP12-M01-S1-C1-01   the lightbox chevron / Figma gap        still OPEN (§C)
FU-APP12-M01-E1-01      the Admin degraded-primary signal       NEW, blocking (§L)
FU-APP12-M01-E1-02      check:e2e JSON import attribute         routed to V02-C2 (§W)
FU-APP12-M01-E1-03      format:check on v02-c1-login-reflow.mjs routed to V02-C1 (§W)
```

Everything else E1 was asked to accept — thirty-one journeys across the database,
the domain, the Admin, the Storefront and the boundary between them — passes on a
production-like world, and the harness that proves it is in the repository ready
to re-run.

STOP.

Do not start G03.
Do not close M01.
Do not deploy production.
Do not push.
