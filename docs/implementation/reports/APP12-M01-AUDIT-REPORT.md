# APP12-M01.A — Product Multi-Image Gallery: architecture and runtime audit

`APP12-M01.A = AUDIT_COMPLETE — AWAITING_PO_REVIEW`

Audit stage only. No implementation was performed, and none is self-authorized.

---

## A. Verdict

**The Product multi-image gallery is already delivered, end to end.** Database,
domain service, Admin API, Admin UI, generated client, public API and the
Storefront Product Detail gallery all support N ordered images with a canonical
primary **today**, and have since `APP2`. Nothing in the source collapses a
Product to one image.

What the Product Owner observed is a **data state**. In the shared development
database, the maximum number of images on any of the 30 Products is **one**:

```text
3 Products with 1 image · 27 Products with 0 · max = 1
```

The delivered `APP12-V01` density fixture, by contrast, gives every Product three
images — which is why the multi-image gallery, its thumbnail strip and its
lightbox are already visible in the committed `APP12-V02` evidence at 1440, 1024
and 390. The capability was built, proven and photographed; it was never
populated.

To confirm this against something other than a reading of the code, a disposable
audit world was stood up carrying Products of **8, 20 and 30** ordered images.
All three rendered correctly through the real gateway, the real API and the real
Storefront, at every required viewport, with correct ordering, correct primary,
correct keyboard operation and no layout overflow.

**Three real gaps remain**, and they are what `M01.B` should own:

| # | Gap | Severity |
|---|---|---|
| G1 | The thumbnail strip requests `catalog-preview`, not `thumbnail` — already open as **`FU-APP12-H05-03`**. Projected at 20 images on real media: **6.63 MB** of first-render image weight instead of **1.76 MB**. | **Blocking** — without this, no cap is safe |
| G2 | No **visible** image counter on the inline gallery. The string and the function exist; they are rendered only inside the lightbox. | Product-visible |
| G3 | No **set-primary** control in Admin, and a 20-image editor is a 3 222 px single-column stack. Promoting image 20 to primary takes **19 clicks**. | Operational |

**And one behaviour requiring a Product Owner ruling:** when an associated Asset
becomes unavailable on a published Product, three public surfaces answer three
different ways, with no operator signal (§I).

`IMPLEMENTATION_RECOMMENDATION = GO`, at a scope far smaller than the checkpoint
brief anticipates: one rendition fix, one invariants migration, two small UI
additions.

---

## B. Human PO roadmap override

Recorded as instructed. Nothing else in the roadmap is touched.

```text
PREVIOUS_CHECKPOINT_COUNT = 38
NEW_CHECKPOINT_COUNT      = 39

APP12-V02-C2 = COMPLETE — PO PASS
APP12-V02    = COMPLETE_AFTER_C2

APP12-M01    = AUTHORIZED — AUDIT_STAGE_ONLY
APP12-M01.A  = AUDIT_COMPLETE — AWAITING_PO_REVIEW
APP12-M01.B  = NOT_AUTHORIZED
APP12-G03    = NOT_AUTHORIZED

ROADMAP: … V01 → V02 → M01 → G03 → U01 → E01 → R01 …
```

No other checkpoint id was created. No `M02`, no `M01-C1`, no `M01-B01`.

### Data policy compliance

The Product Owner's M01.A directive required a disposable audit world and a
read-only shared development stack.

```text
shared_dev_mutations      = 0
disposable_audit_world    = used
G03_data_created          = false
disposable_data_teardown  = PASS
```

Shared dev was read only, for the current data state and for real derivative
weights. `before-product-media.txt` and `after-product-media.txt` are the same
row with the same `updated_at` (`2026-09-05 10:43:13.437+00`); `product_media`
held 3 rows before and 3 after.

The disposable world was the repository's own isolated E2E edge
(`docker-compose.e2e.yml` — tmpfs PostgreSQL, tmpfs MinIO, the real Nginx
gateway, host API/Storefront/Admin processes) on migrations 1..38, seeded with
the delivered `seedS02Catalog` and `seedV01Density` fixtures plus three M01 probe
Products. Teardown verified: **0 containers, 0 volumes, 6/6 ports closed**, the
run's synthetic operator credential deleted.

---

## C. Current media authority

Preserved intact; nothing in this audit redesigns the media pipeline. The
`APP12-V02-C2` baseline holds: Admin upload works, the worker processes, both
`THUMBNAIL` and `CATALOG_PREVIEW` derivatives exist, the Admin authenticated
preview contract exists, Product and Gallery public delivery work, intrinsic
dimensions are persisted, and valid media renders real pixels.

Baseline counts, re-verified from `openapi.generated.json` and the migration
directory, all unchanged:

```text
OpenAPI paths 126 · operations 139 · schemas 278 · public operations 49
migrations 38 · DB tables 79 · Admin routes 26 · Storefront routes 20
```

---

## D. End-to-end Product media trace

| # | Layer | Cardinality | Order authority | Primary authority | Must change |
|---|---|---|---|---|---|
| 1 | `assets` / `asset_derivatives` | N | — | — | no |
| 2 | `product_media` | **N** | `display_order` | `role='THUMBNAIL'` | invariants only |
| 3 | `ProductMediaSelection` | **N, uncapped** | array position | position 0 | cap only |
| 4 | Admin write (`mediaAssetIds[]`) | **N** | array order | position 0 | cap only |
| 5 | Admin read (`media[]`, `primaryMedia`) | **N** | `position` | `role` | no |
| 6 | Generated client | **N** | — | — | regen only |
| 7 | Admin Product editor | **N** | move earlier/later | first row | set-primary + density |
| 8 | Public list projection | **1** by design | — | `role` + `limit 1` | **no** |
| 9 | Public detail projection | **N, no LIMIT** | `(display_order, id)` | position 0 | +`thumbnailUrl` |
| 10 | Storefront card | **1** | — | server's | **no** |
| 11 | Storefront Product Detail | **N** | server order | position 0 | rendition + counter |
| 12 | SEO / OG / JSON-LD | OG 1, JSON-LD **N** | server order | `media[0]` | **no** |

**Eleven of twelve layers already support multiplicity. None collapses the
Product to one image.** Layer 8 is *deliberately* one image and is exactly the
behaviour §17 asks for.

---

## E. Database and cardinality audit

`product_media` (TBL-017), shipped in migration `0007`:

```sql
id uuid PK · product_id uuid FK→products RESTRICT · asset_id uuid FK→assets RESTRICT
role text CHECK IN ('GALLERY','THUMBNAIL','DETAIL') · display_order integer NOT NULL
UNIQUE (product_id, asset_id, role)          -- IDX-015
```

| requirement | supported | by what |
|---|---|---|
| N images per Product | **yes** | no cardinality constraint exists |
| stable ordering | **yes** | `display_order`, `id` as total-order tie-break |
| one canonical primary | **partly** | the role exists; uniqueness is not enforced |
| no duplicate Asset per Product | **no** | uniqueness includes `role` |

### Proven, not argued

Three writes issued with `psql` directly against the disposable database,
deliberately bypassing the service:

```text
A  same (product_id, asset_id, role) twice    → REFUSED
B  same asset_id again under GALLERY          → ACCEPTED
C  a second THUMBNAIL on the same product     → ACCEPTED
```

The public API immediately afterwards returned **10 items for an 8-image
Product, with the same image twice and two items claiming `THUMBNAIL`**. The card
stayed deterministic only because the repository applies `limit 1` under an
explicit total order — which it documents as a deliberate refusal to rely on
"there can only be one".

So duplicate suppression, primary uniqueness and order contiguity are all
**service-layer** rules today. They are correct on every path the delivered API
offers. None is a schema guarantee.

### Minimum delta — one migration, four constraints, all additive

```sql
ALTER TABLE product_media ADD CONSTRAINT uq_product_media__product_asset
  UNIQUE (product_id, asset_id);
CREATE UNIQUE INDEX uq_product_media__one_primary
  ON product_media (product_id) WHERE role = 'THUMBNAIL';
CREATE UNIQUE INDEX uq_product_media__product_position
  ON product_media (product_id, display_order);
ALTER TABLE product_media ADD CONSTRAINT ck_product_media__display_order_bounds
  CHECK (display_order >= 0 AND display_order < 20);
```

Not written, not applied. `migrations 38 → 39`, `DB tables 79 → 79`.

---

## F. Existing-data migration analysis

**No backfill is required, and none may be written.** Every existing row already
satisfies all four constraints, because every row that exists was written by
`ProductMediaSelection`, which has always derived role from position, always
rejected duplicates, and always produced contiguous `display_order` from zero.

Verified across both environments: shared dev (3 rows, each `THUMBNAIL` at
`display_order 0`) and the disposable world's 60 fixture rows plus 58 probe rows.

The §7 rules the brief asks for are therefore already true of the data:

```text
existing single Product image → remains associated               ✓ (no row is touched)
                              → is already the canonical primary ✓ (role THUMBNAIL)
                              → already holds display_order 0     ✓
```

**No existing Product can lose its public image**, because the migration adds
constraints the data already satisfies and moves no row.

```text
fully deterministic  = YES
online-safe          = YES
manual steps         = NONE
```

`ADD CONSTRAINT … UNIQUE` takes `ACCESS EXCLUSIVE` while building its index — at
Wave-1 size (hundreds of rows) this is milliseconds. Should scale ever make that
false, `CREATE UNIQUE INDEX CONCURRENTLY` + `ADD CONSTRAINT … USING INDEX` is the
standard escape and remains forward-only.

---

## G. Primary and order invariant — recommend **Model B**

**Primary is always `display_order = 0`. `primary_is_first = true`.**

This is not merely the cleanest option; it is what the system already implements
at every layer:

- `ProductMediaSelection` derives `role` from array position;
- `isPublishableMedia` **refuses to publish** unless `display_order` is
  contiguous from zero and position 0 is the `THUMBNAIL`;
- the Admin help text tells the operator so;
- the Storefront takes `media[0]` for the stage, and the page takes it for
  `og:image`.

| criterion | Model A (`is_primary` + `display_order`) | **Model B (position 0)** |
|---|---|---|
| Admin mental model | two concepts; "primary" and "first" can disagree | one: the first image is the main image |
| DB integrity | needs its own partial unique index anyway | same index, and order already carries it |
| API simplicity | a boolean the client must scan for | `media[0]`, already true |
| initial counter | ambiguous — does the strip start at the primary or at position 1? | **always 1** |
| reordering | moving the primary must carry a flag along | moving to position 1 *is* promoting |
| concurrency | two independent fields to conflict on | one array under one token |
| migration | new column + backfill | **none** |

Model B also answers §30 by dissolving it: "if the primary is moved, does it stay
primary?" has no meaning. Moving image 3 to position 1 *is* how it becomes
primary, and the image that was at position 1 becomes `GALLERY` in the same
atomic write.

**Model C is not proposed.** No third representation in the repository is a
better fit, and inventing one would fork an invariant four layers already agree
on.

---

## H. Cap analysis — recommend **20**

### What is not the reason

**Payload is not the reason.** Measured on the live public API:

```text
probe-8   media[] = 8    1 697 B
probe-20  media[] = 20   3 520 B
probe-30  media[] = 30   5 030 B     ≈ 166 B per item
```

A 30-image detail document is 5 KB. **Structured data is not the reason either**:
JSON-LD publishes the same ordered array and is bounded by the same number.

### What is the reason

**First-render image weight**, using the measured real derivative means
(`CATALOG_PREVIEW` 389 731 B, `THUMBNAIL` 72 277 B — a 5.4× ratio) and the
measured request counts:

| images | today (strip = `catalog-preview`) | corrected (stage 1 preview + strip N thumbnails) |
|---|---|---|
| 3 | 1.17 MB | 0.53 MB |
| 8 | 3.12 MB | 0.90 MB |
| **20** | **6.63 MB** | **1.76 MB** |
| **30** | **9.74 MB** | **2.49 MB** |

Lazy loading does not rescue this: at 1440 the browser issued **17 of 20**
`catalog-preview` requests on first render, because the strip sits at the fold.

**And Admin manageability.** Measured at 20 images: the media editor is
**3 222 px** tall in a single column — 3.6 screens — with every row reading the
same `Ảnh WebP · 13,8 KB · 05/09/2026`. At 30 it is 5.4 screens.

### The decision

Once the rendition is corrected, 20 → 30 costs **≈ 0.73 MB** of additional
*deferred*, below-the-fold thumbnails, and **1.8 further screens** of operator
scroll. The audit found no evidence that 30 delivers meaningful product value: no
Wave-1 Product has ever carried more than one image, and the eight view types the
brief lists (front, back, detail, material, scale, close-up, packaging, variant
context) fit comfortably inside 20 with room to double up.

**`max_images = 20`.** The Product Owner's stated default stands, and the audit
did not find the evidence that would displace it.

---

## I. Asset eligibility and publication semantics

### Eligibility (§11) — already defined and enforced in three places

An Asset may join a Product gallery only if it is `CATALOG_MEDIA` +
`PRODUCTION_SENSITIVE` + `ACCEPTED`, not soft-deleted, and carries both a
`THUMBNAIL` and a `CATALOG_PREVIEW` derivative that are `READY`, unwatermarked
and hold a storage key. This is checked at selection (under a `FOR SHARE` lock,
so it still holds at commit), re-checked at publish, and re-checked on every
public read. The Admin picker offers only `Sẵn sàng` assets, filtered from the
response rather than assumed of it.

### Publication (§12) — already answered by delivered code

**A Product cannot be published with zero images.** `PRODUCT_MEDIA_READY` is an
unconditional publication requirement, so **every published Product has at least
one deliverable primary image**. That is the invariant Wave-1 commerce needs, and
it already holds.

### The behaviour that needs a ruling

Publication readiness is evaluated **at publish time and never again**. Proven
live: `app12-m01-probe-30`, PUBLISHED with 30 images, had its primary Asset set
to `REJECTED`. Nothing else changed.

| surface | before | after |
|---|---|---|
| Product Detail `media[]` | 30, first role `THUMBNAIL` | **29**, first role `GALLERY` |
| Discover card `thumbnail` | present | **absent** — still listed, still purchasable, **no image at all** |
| `og:image` | the primary | **the first surviving gallery image**, silently substituted |

Three surfaces, three different answers, no operator signal anywhere, and the
Product stays `PUBLISHED` and sellable.

**The audit does not invent the answer.** Four options, with the recommendation
stated and the reasoning given:

| option | consequence |
|---|---|
| **A. Remain published with a deliberate no-image fallback** | today's behaviour on the card, but it is *accidental*, and the detail page and OG disagree with it |
| **B. Become non-indexable** | punishes SEO for an operational fault and still shows an imageless card to a live visitor |
| **C. Fail publication / auto-unpublish** | removes a selling Product from the storefront without an operator ever acting — too aggressive for Wave 1 |
| **D. Automatically promote the next image** | already what the *detail page and OG effectively do*; makes all three surfaces agree; but it silently changes what the operator chose |

**Recommendation: D, made explicit and made visible** — re-evaluate readiness
when an Asset leaves eligibility, promote the next deliverable image to
`THUMBNAIL` in a single write so card, detail and OG agree by construction, and
**surface the change to the operator** in the Admin Product screen. Never a
silent substitution: the brief is explicit that no image may be silently
substituted, and today's behaviour already substitutes one on two surfaces
without saying so. Option D differs from the status quo precisely by ending the
silence and the disagreement.

This is the largest single scope decision in M01 and the audit does not assume
it. If the PO prefers to keep Wave 1 small, choosing **A** and recording the
divergence as a known limitation is defensible — but then the card should fall
back to the first deliverable image so that at least the three surfaces agree.

---

## J. Admin current-state live audit

Driven through the real Admin behind the real gateway in the disposable world, at
a Product with 20 images.

**Already delivered:** an ordered list with real preview thumbnails (via
`adminAsset_preview`, `APP12-V02-C2`), `Di chuyển trước` / `Di chuyển sau` /
`Gỡ ảnh` per row, first/last move buttons correctly disabled, an `Ảnh đại diện`
badge on row 1 and `Ảnh thư viện` on the rest, a polite live region announcing
reorder and removal, and position-carrying accessible names.

The picker is **already a multi-select grid**: four columns of checkbox tiles
with real previews, each marked `Sẵn sàng`, a live `Đã chọn 20 ảnh` count,
cursor-based continuation, and staged selection applied only on confirm.

**So §14's requirement list is almost entirely already met**, and the answer to
"multi-select in one session or repeated single select" is that multi-select
already exists and must be kept.

**Measured breakdown at 20:**

```text
20 rows · media section 3 222 px · document 4 413 px · ≈161 px per row
≈5.5 rows per 900 px screen · every row reads "Ảnh WebP · 13,8 KB · 05/09/2026"
set-primary controls found: 0
```

Promoting image 20 to primary is **19 clicks** of `Di chuyển trước`, each
re-rendering a 3 222 px list.

### A delivered constraint the PO should know about

**A PUBLISHED Product's media cannot be edited at all.**
`product-edit-form.tsx:98` gates the whole form on `status === DRAFT`; a published
Product renders *"Sản phẩm không thể chỉnh sửa · Chỉ bản nháp mới có thể chỉnh
sửa tại màn hình này."* Adding a photograph to a Product that is currently
selling therefore requires unpublishing it first.

This is pre-existing `APP2` behaviour, not an M01 regression, and M01 need not
change it. But gallery curation is exactly the kind of edit an operator makes on
a live Product, so a multi-image gallery is a far stronger reason to revisit it
than a single image ever was. Flagged for the PO; **not** in the recommended
M01.B scope.

---

## K. Admin target UX recommendation

Ranked by value per unit of risk.

1. **`Đặt làm ảnh đại diện` on every non-primary row.** One click replaces 19.
   No new dependency; it maps onto `moveSelection(selection, index, -index)`,
   which the delivered model already supports. The copy is correct, concise
   production Vietnamese and matches the existing `Ảnh đại diện` badge.
2. **Make the selected list a compact grid, as the picker already is.** Four
   columns of ~180 px tiles turns 3 222 px into ~900 px — 20 images on one screen
   — and makes the *images* the thing the operator scans rather than 20 identical
   metadata lines.
3. **Show `{n}/20`** beside the section heading, read from the published constant
   rather than hard-coded (`CLAUDE.md` §5), and disable the picker's confirm when
   the staged selection would exceed the cap.

**§15 — reordering: keep the buttons; add the set-primary shortcut; defer
drag-and-drop.** The buttons are the accessible mechanism (SC 2.1.1) and must
remain. Drag-and-drop is a genuinely good fit for fine reordering inside a
compact grid — but it is a new dependency on a design-approved surface, HTML5
drag has poor touch support in the compact Admin, and once (1) and (2) land the
need that motivates it is largely gone. **`reorder_UI = buttons` for M01.B, with
drag-and-drop recorded as a deferred enhancement.** No drag/drop package was
installed in M01.A.

All copy stays in `packages/i18n/messages/vi/admin.json`. Any of this work is a
frontend UI checkpoint and therefore needs a `FIGMA_DESIGN_INDEX.md` entry at
`APPROVED_FOR_IMPLEMENTATION` **before** it opens (`CLAUDE.md` §3).

---

## L. Storefront non-detail audit

Every Product-card consumer reads `PublicProductSummary`, which carries one
`thumbnail` and **no `media` array**. Verified live with a 30-image Product in
the feed: `/kham-pha` issued exactly **one** image request for it, at the
`thumbnail` rendition, `naturalWidth 480`, `loading="lazy"`.

| surface | Product imagery | requests |
|---|---|---|
| Homepage featured works | yes | 1 |
| Discover feed / filtered Discover | yes | 1 per card |
| Gallery-detail related product | yes | 1 |
| Checkout Product summary | text only | 0 |
| Secure order surface | text only | 0 |
| Admin order detail | text only | 0 |

**`list_projection = primary-only` is already the delivered behaviour. Zero
delta.** No card becomes a carousel, no hover gallery, no extra request.

---

## M. Product Detail target UX

The composition the brief asks for is what already ships: a large stage, a
thumbnail strip immediately beneath it, and a lightbox — with the strip rendered
only when there is more than one image, and an honest empty state when there are
none.

Measured at the three required viewports:

| | 1440 (20 images) | 390 (30 images) |
|---|---|---|
| thumbnail controls | 20 | 30 |
| strip scroll / client width | 1 508 / 607 | 2 268 / 327 |
| page horizontal overflow | none | **none** (`scrollWidth` 375 = viewport) |
| stage top / height | 213 / 554 | 196 / 327 |
| strip top | 816 | 572 |
| price top | 349 | 789 (inside the 844 fold) |
| CTA top | 607 | below fold, as designed |

1024 is the same `$bp-detail-hero-split` branch as 1440 and was measured
explicitly by `APP12-V02`.

**§19 — the gallery does not cost the purchase decision.** The hero is a
two-column grid from 1024; the strip grows the *media* column only:

```text
gallery column   587 px at 1 image  →  682 px at 20 images   (+95 px)
price top        349 px             →  349 px  (unchanged)
CTA top          607 px             →  607 px  (unchanged)
```

The `APP12-V02` correction that moved the purchase decision into the first
viewport **survives 20 images untouched**. The stage is already capped at
`min(58vh, …)` split and `min(46vh, …)` stacked, introduced for exactly this
reason.

**§20 — mobile.** The horizontal scroll strip the brief names as the strong
candidate is already what ships: `display:flex; max-width:100%; overflow-x:auto`,
with the overflow scoped to the strip so the document never gains a horizontal
scrollbar. At 30 images this holds. There is no vertical stack of thumbnails at
any count.

**§21 — switching.** Verified live: clicking thumbnail 5 moved `aria-current`,
changed the stage alt to `ảnh 5 trên 30`, and opening the enlarged view produced a
dialog resolving to **the same object id as the stage** — the lightbox opens the
*currently selected* image, not the primary, which is exactly what §21 requires.
The dialog offers labelled `Đóng` / `Ảnh trước` / `Ảnh sau`.

**Arrows on the inline stage are not recommended.** The strip is the primary
affordance, the lightbox already has arrows, and inline arrows would place two
targets over the LCP image for no reach the strip does not already provide.

### §22 — the counter

`positionLabel(index, total)` → `Ảnh {position} trên {total}` **exists** and is
rendered **only inside the lightbox** (`detail-lightbox.tsx:127`). On the page
itself a visitor sees 8 of 20 thumbnails at 1440, or 4½ of 30 at 390, and a
scrollbar. Nothing states the total.

**Decision:** render that same string on the inline gallery, beside the zoom
hint, **always — including when `total === 1`**, where it reads `Ảnh 1 trên 1`. A
counter that disappears is a counter the visitor cannot trust. It always begins
at 1, because under Model B position 1 *is* the primary.

---

## N. Accessibility

Measured on the 30-image Product; **already delivered in full**:

| check | result |
|---|---|
| control element | 30 × `<button>` — no clickable `<div>` anywhere |
| accessible names | `Xem ảnh 1 trên 30` … `Xem ảnh 30 trên 30` |
| selected state | `aria-current="true"` on exactly one |
| keyboard | roving tabindex — one Tab stop, Arrow/Home/End within, focus follows selection |
| stage alt | `M01 probe — 30 ảnh — ảnh 5 trên 30` — truthful, index-based, never a filename |
| enlarge trigger | `Mở ảnh 1 trong chế độ xem lớn` |
| lightbox position | `Ảnh 5 trên 30` as text, not colour |
| focus-visible | preserved |

The non-visual equivalent §23 asks for already exists at every position. The
visible counter of §22 is the missing half, not the accessible one.

---

## O. Performance and loading policy

| surface | rendition | loading |
|---|---|---|
| list / card primary | `thumbnail` | lazy — except the first Discover row, the measured LCP element, which wants `fetchpriority="high"` (`FU-APP12-H05-02`) |
| Detail main stage (selected) | `catalog-preview` | **eager**, `fetchpriority="high"` — the Product Detail LCP element |
| Detail thumbnail strip | **`thumbnail`** | lazy, `decoding="async"` |
| Detail non-selected previews | none | **never fetched at first render** |
| Lightbox | `catalog-preview` | on selection — already the behaviour |

Worst-case initial network cost under the proposed model, at the recommended cap
and on real media: **≈ 1.76 MB**, of which the stage is 0.39 MB and the rest is
deferred, below-the-fold thumbnails. Today at the same count it would be
**6.63 MB**.

One further finding: **the published intrinsic dimensions are discarded.**
`ProductDetailMedia` carries only `url`; `role`, `width` and `height` are dropped
at the Storefront view-model boundary, and `detail-media-stage.tsx` still
documents that "`publicProductDetail` publishes no width or height" — a comment
made **stale** by `APP12-H05-C1`, which added both. Neither the stage nor the
strip carries `width`/`height`, so neither reserves a box. CLS is 0.0000 today
because the stage sits in a constrained container, but a 20-image strip of
unsized lazy images is precisely the shape that regressed H05 the first time, and
the contract already carries the fix.

### §25 — H05 follow-up reconciliation

Neither follow-up is closed by this audit.

- **`FU-APP12-H05-03`** (Product Detail thumbnail-strip rendition) — **M01 should
  take ownership.** It is not merely adjacent: it is M01's precondition. It has
  been open since `APP12-H05`, was routed to `V02` by `H05-C1`, and both `V02`
  and `V02-C2` deliberately left it open as out-of-theme. M01.B1 is the natural
  and correct home, because M01 is the change that makes it decisive.
- **`FU-APP12-H05-02`** (above-the-fold lazy / `fetchpriority`) — **keeps its
  existing owner.** M01.B1 will incidentally set `fetchpriority` on the Product
  Detail stage, which is one surface of it; the Homepage and Discover halves are
  not M01's and should not be absorbed.

No new follow-up identifier was created by this audit.

---

## P. Public API audit

Already inherently multi-image, measured live:

```text
detail   probe-8 → media[] 8 · probe-20 → 20 · probe-30 → 30   (no LIMIT)
         ordered by (display_order, id); first item role THUMBNAIL
         1 697 B / 3 520 B / 5 030 B   ≈166 B per item
list     19 items, 7 073 B; each Product carries `thumbnail` and NO `media`
         array — including the 30-image Product
```

`current_public_API_multi_image = YES`. The list/detail split §38 asks for
already exists, with **zero delta**.

The one gap: a detail media item publishes **one** `url`, always
`catalog-preview`, even though the `APP2-T01` route already serves **both**
renditions for any `product_media` id
(`PUBLIC_PRODUCT_MEDIA_RENDITIONS = ['thumbnail','catalog-preview']`). The strip
therefore has no address for the small rendition.

**Minimal delta — three optional flat fields on the existing schema:**

```json
{ "url": ".../catalog-preview", "role": "GALLERY", "width": 1250, "height": 1250,
  "thumbnailUrl": ".../thumbnail", "thumbnailWidth": 480, "thumbnailHeight": 480 }
```

Flat rather than nested, so **no new schema is created**.

```text
new paths 0 · new operations 0 · new schemas 0 · changed schemas 1 (additive)
```

This publishes an address that was always resolvable and never stated. Evolving
the existing operation is strictly preferable to adding one, and no new public
HTTP operation is warranted.

---

## Q. Admin API audit

`current_admin_API_multi_image = YES`.

`PATCH /admin/products/{id}` already accepts `mediaAssetIds` — an ordered array
with **no maximum**, where array position is the contract, duplicates are refused
as `PRODUCT_MEDIA_DUPLICATE`, the whole selection is replaced atomically, and
`expectedUpdatedAt` is a mandatory concurrency token. `GET` returns `media[]`
with `assetId, role, position, mediaType, byteSize, status, createdAt`, and the
list returns `primaryMedia`.

The read contract carries **no storage key, no bucket, no derivative object key
and no URL** — the Admin resolves pixels through the separate `adminAsset_preview`
contract keyed by `assetId`. That separation is correct and must be preserved;
the Admin contract must not be coupled to derivative object keys.

**Minimal delta:** `.max(20)` with a named error, and the cap published as a
read-only constant so the editor renders `{n}/20` without hard-coding a business
value.

**No dedicated reorder or set-primary operation is warranted.** Both are
re-orderings of one ordered array; the array is already replaced wholesale under
a concurrency token; a separate operation would need its own token and its own
conflict semantics for no gain. The existing PATCH is the right seam.

---

## R. Concurrency, remove-primary and reorder semantics

### §28 — concurrency, against the delivered contract

| case | behaviour today | verdict |
|---|---|---|
| stale reorder | outdated `expectedUpdatedAt` → refused, nothing overwritten | correct |
| stale primary selection | identical, because primary *is* order | correct |
| duplicate add | `PRODUCT_MEDIA_DUPLICATE`; whole request refused; previous selection intact | correct |
| remove primary | see below | correct under Option B |
| save / retry | validation is all-or-nothing before a single link is written | correct |

Two operators editing one Product's gallery is already handled by the delivered
optimistic-concurrency token. **Nothing distributed is needed and none should be
introduced.**

### §29 — removing the primary: **Option B**

Deterministically promote the next remaining image. Under Model B this is not
even a special case: the client removes the entry and sends the resulting array,
and whatever is now at index 0 becomes the `THUMBNAIL` in the same atomic
whole-set replace. Option A (block removal until another primary is chosen) would
invent a modal refusal for a state that lasts zero milliseconds, and would make
removal the only action in the editor that can fail.

Removing the **last** image leaves the Product with none — legal for a DRAFT, and
exactly what `PRODUCT_MEDIA_READY` refuses to publish.

### §30 — reorder × primary

Under Model B the question dissolves. Examples:

```text
[A*, B, C]  move C earlier ×2  →  [C*, A, B]   C is now primary; A becomes GALLERY
[A*, B, C]  set-primary on C   →  [C*, A, B]   identical result, one click
[A*, B, C]  remove A           →  [B*, C]      B is promoted in the same write
[A*, B, C]  move A later       →  [B*, A, C]   A stops being primary by moving
```

The primary always sits at position 0; moving something to position 0 *is*
promoting it; there is no flag to carry, no second field to conflict on, and the
counter always starts at 1.

---

## S. SEO and share semantics

Already correct, and **no change is proposed**:

- **`og:image` = `media[0]`** — under Model B, the primary. A Product with no
  deliverable media gets **no** `og:image` rather than a fabricated one.
- **Product JSON-LD `image` = the full ordered array**, which is the truthful
  schema.org semantic for a Product gallery.
- Both address the public `APP2-T01` route. **No storage key, no bucket, no
  signed URL, no CDN host** appears anywhere. Verified live on the 30-image
  Product.

**Share** (`Chia sẻ`) shares the page URL and carries no image of its own, so
changing the primary deterministically changes future share presentation with no
share-specific work at all. No social gallery is needed or proposed. Platform
scrape caching means the change applies to future first scrapes, which is a
property of the platforms and not of this system.

The only SEO-visible defect is the §I divergence: when the primary becomes
unavailable, `og:image` silently moves to the first surviving image while the
card loses its image entirely. Answering §I resolves it by construction.

---

## T. Order-snapshot impact

```text
CURRENT   order_items snapshots product_name, variant_label, size_label,
          quantity and money. There is NO media reference of any kind, and no
          order surface — Admin order detail, secure customer order, historical
          presentation — renders a Product image at all. The only image in the
          Admin order area is the payment transfer evidence.

RISK      None. Changing a Product's gallery cannot alter any historical order
          presentation, because no order presentation shows an image.

M01_SCOPE_RECOMMENDATION
          OUT OF SCOPE. Do not add image snapshotting in M01.
```

The brief is right that historical orders must not silently follow current
imagery — but the way that requirement is met today is that orders show no
imagery. Adding a media snapshot would be a new capability with its own retention
and lifecycle questions, justified by a product need nobody has stated. If order
surfaces later gain a thumbnail, snapshotting is the correct design and belongs
to that checkpoint.

---

## U. Asset lifecycle impact

`assets` are soft-deleted (`deleted_at`); `ON DELETE RESTRICT` on both foreign
keys prevents a hard delete while an association exists. A soft-deleted,
`REJECTED` or otherwise ineligible Asset is filtered out of every public read by
`assetEligibility()`; nothing removes the `product_media` row.

So a multi-image Product survives an Asset archive, a failed derivative or a
storage failure by **losing that image from its gallery and keeping every other**
— structurally sound. What it does not survive well is the *primary* becoming
ineligible, which is §I.

**No automatic data repair is proposed.** The only automatic behaviour
recommended is the deterministic promotion in §I option D, and only if the
Product Owner authorizes it.

---

## V. Gallery and SKU boundaries

**§35 — Gallery.** `gallery_entries` / `gallery_entry_assets` (APP11) is a
separate editorial and publication aggregate with its own lifecycle. M01 shares
the Asset and derivative infrastructure with it and **none of its business
semantics**. No conflation exists today and none is proposed.

**§36 — Variants.**

```text
PRODUCT_LEVEL_IMAGES = recommended M01 scope
SKU_SPECIFIC_IMAGES  = NOT SUPPORTED TODAY — DEFER
```

`product_variants` and `skus` carry **no asset column of any kind**. There is no
partially delivered per-SKU imagery to preserve or complete, and the source
proves no different existing authority. The default assumption in the brief is
correct: M01 owns the Product-level gallery only.

---

## W. Recommended logical model

```text
ProductMedia {
  id           uuid    PK
  productId    uuid    FK → products (RESTRICT)
  assetId      uuid    FK → assets   (RESTRICT)
  role         'THUMBNAIL' | 'GALLERY' | 'DETAIL'
  displayOrder integer  contiguous from 0
}
```

No column added, renamed or removed. Only invariants:

```text
I1  ≤ 20 media per Product                          request schema + CHECK
I2  one Asset at most once per Product              + DB UNIQUE (product_id, asset_id)
I3  exactly one THUMBNAIL per Product with media    + partial UNIQUE WHERE role='THUMBNAIL'
I4  display_order contiguous from 0, unique         + DB UNIQUE (product_id, display_order)
I5  the primary IS display_order 0                  unchanged (Model B derivation)
I6  eligible Asset = CATALOG_MEDIA + PRODUCTION_SENSITIVE + ACCEPTED + not deleted,
    both derivatives READY and unwatermarked        unchanged
I7  a published Product has ≥1 deliverable image    publish-time today; §I decides
                                                    whether it is re-evaluated
```

---

## X. Recommended contracts

Full request/response examples are in
`evidences/m01-audit/PROPOSED-CONTRACT.md`. In summary:

- **Public list** — unchanged. `thumbnail` only, no `media` array.
- **Public detail** — `media[]` gains three optional flat fields
  (`thumbnailUrl`, `thumbnailWidth`, `thumbnailHeight`). No new schema.
- **Admin read** — unchanged; identity, order and primary already present; no
  storage key and no URL.
- **Admin write** — unchanged shape; `mediaAssetIds` gains `maxItems: 20` and a
  named refusal.

---

## Y. Implementation impact matrix

Full matrix in `evidences/m01-audit/IMPACT-MATRIX.md`. Summary:

| Layer | Delta | Risk |
|---|---|---|
| DB / migration | 1 migration, 4 additive constraints, **no backfill** | Low |
| Domain / service | cap + named error; §I re-evaluation if authorized | Low / Medium |
| OpenAPI | 1 schema, additive; **0 paths, 0 operations, 0 schemas** | Low |
| Generated client | regenerate | Low |
| Admin editor | set-primary, compact grid, cap indicator | Medium (design-gated) |
| Storefront cards | **none** | None |
| Product Detail | rendition, counter, intrinsic dimensions, `fetchpriority` | Medium (design-gated) |
| SEO | **none** | None |
| Accessibility | none beyond the counter's text | Low |
| Performance | the decisive change; 6.63 MB → 1.76 MB at the cap | Medium if skipped |
| Orders | **none, explicitly out of scope** | None |
| e2e | extend one fixture Product to the cap | Low |

---

## Z. Proposed M01.B work packages

Internal packages inside the one `APP12-M01` checkpoint. **Not new checkpoint
ids. Not executed.**

```text
M01.B1  Rendition and loading policy   — closes FU-APP12-H05-03
M01.B2  Invariants and cap             — the one migration (dedicated DB checkpoint)
M01.A1  Admin media management UI      — set-primary, compact grid, {n}/20
M01.S1  Product Detail counter
M01.E1  Cross-boundary acceptance
```

B1 first: it is the precondition for raising the count at all, and it is
independently valuable and independently measurable at the current three-image
fixture. B1 and B2 are independent of each other; A1 depends on B2's constant;
S1 depends on B1.

**Deferred, not adopted:** drag-and-drop reordering; per-SKU imagery; order media
snapshotting; the DRAFT-only edit restriction.

**Blocked pending a PO ruling:** the §I unavailable-Asset behaviour. If option D
is chosen it becomes **M01.B3** and is the largest piece of work in the
checkpoint; if option A is chosen it does not exist.

---

## AA. Change-impact test plan

Twenty tests, listed with tier and owning package in
`evidences/m01-audit/IMPLEMENTATION-PLAN.md`. They cover every item §42
enumerates: DB invariants, the migration against the existing corpus, the cap,
duplicate association, primary uniqueness, reorder, remove-primary, the Admin
editor, list-only-primary, detail switch and counter, the mobile gallery,
keyboard and axe at the cap, SEO primary image, the H05 focused regression, and
one Playwright Admin → Storefront journey at the cap.

The migration/backfill test is the one worth naming here: it asserts that **the
existing row corpus validates unchanged**, which is the mechanical form of "no
existing Product loses its image".

---

## AB. Evidence index

`evidences/m01-audit/`

```text
README.md               the finding, the environments, the audit-only proof
CURRENT-STATE.md        the twelve-layer trace with the source that proves it
DB-AUDIT.md             schema, the three bypass probes, the proposed migration
API-AUDIT.md            measured public and Admin contracts, the minimal delta
ADMIN-UX-AUDIT.md       the editor and picker at 20 images, measured
STOREFRONT-UX-AUDIT.md  the gallery at 1440/1024/390, the two gaps
PERFORMANCE-AUDIT.md    the rendition defect, the cap arithmetic, the policy
SEO-AUDIT.md            og:image, JSON-LD, share
IMPACT-MATRIX.md        layer × current × delta × risk × tests
PROPOSED-CONTRACT.md    the logical model and wire contracts
IMPLEMENTATION-PLAN.md  the M01.B packages and the 20-test plan

data/   before-product-media.txt · after-product-media.txt (identical)
        probe-measurements.md · invariant-probes.md
        list-projection.txt · openapi-baseline.txt
        disposable-world-final-state.txt

admin/  product-editor-state.png            PUBLISHED → not editable
        product-media-editor-20-images.png  the 3 222 px stack
        product-asset-picker.png            the delivered multi-select grid

storefront/ probe20-1440-fold.png           20 images, price and CTA in the fold
            probe30-390-fold.png            30 images, horizontal strip, no overflow
            probe30-lightbox-counter.png    "Ảnh 5 trên 30"
            discover-1440-primary-only.png  one request per card
            detail-1440-current-single-image.png  shared dev, the PO's state
```

`evidences/` is git-ignored by repository convention, as for every prior
checkpoint.

---

## AC. Audit-only proof

```text
runtime Product/media source files changed by M01.A   0
DB migration files added                              0
OpenAPI changed                                       false
generated client changed                              false
Figma writes                                          0
shared-dev mutations                                  0
```

`git status --porcelain` over `apps/`, `packages/`, `tools/` and
`infrastructure/` reports **no change**. The only tracked file this checkpoint
adds is this report.

The disposable world was driven by two temporary uncommitted scripts
(`m01-world.mjs`, `m01-probe.mjs`) which reused the repository's own
orchestration and fixture helpers, changed no runtime source, and were deleted
after the run — per §2's "if a temporary script is sufficient, do not commit it".

Nothing was reverted, because nothing was implemented.

---

## AD. Baseline

Unchanged, and re-verified rather than quoted:

```text
OpenAPI paths       126
OpenAPI operations  139
OpenAPI schemas     278
public operations    49
migrations           38
DB tables            79
Admin routes         26
Storefront routes    20
```

Expected deltas **if** M01.B is authorized as recommended:

```text
migrations         38 → 39   (+1)
DB tables          79 → 79   (0)
OpenAPI paths     126 → 126  (0)
OpenAPI operations 139 → 139 (0)
OpenAPI schemas   278 → 278  (0)
public operations  49 → 49   (0)
Admin routes       26 → 26   (0)
Storefront routes  20 → 20   (0)
```

---

## AE. Product Owner decision requested

| # | Decision | Audit recommendation |
|---|---|---|
| 1 | Maximum images per Product | **20** |
| 2 | Primary model | **Model B — primary is always position 0** |
| 3 | Remove-primary rule | **Option B — deterministically promote the next** |
| 4 | Admin reordering | **Buttons + a set-primary action; drag-and-drop deferred** |
| 5 | **Unavailable associated Asset (§I)** | **Option D — promote deterministically, make it visible to the operator**; option A is defensible for Wave 1 if the card is made to agree |
| 6 | `FU-APP12-H05-03` ownership | **M01.B1 takes it** — it is M01's precondition |
| 7 | Order media snapshotting | **Out of scope** |
| 8 | Per-SKU imagery | **Defer** — no existing authority |
| 9 | DRAFT-only Product editing | **Flagged, not in scope** — decide whether M01 or a later checkpoint revisits it |
| 10 | Authorize `M01.B` | **GO**, at the reduced scope above |

Item 5 is the only one that materially changes the size of M01.B, and it is the
only one the audit declines to assume.

---

## AF. Roadmap

```text
APP12-M01.A = AUDIT_COMPLETE — AWAITING_PO_REVIEW
APP12-M01   = NOT_IMPLEMENTED
APP12-M01.B = NOT_AUTHORIZED
APP12-G03   = NOT_AUTHORIZED

NEXT = PO_REVIEW_REQUIRED
```

No implementation is self-authorized. No `G03` work has begun. Nothing was
pushed.
