# APP2-D01 — Assets and Catalog Publication Design Package — Completion Report

**Checkpoint:** `APP2-D01` — deliver the Assets and Catalog Publication design package
**Classification:** Admin `NEW` + Storefront list/detail `SUPPLEMENT` · **Status:** `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`
**Date:** 2026-07-26 · **Design Commit A:** `6f6a33e5e5b48abed507b04b6bdb9c109734d37a`

---

## A. Preflight and decision chain

- Branch `production`; preflight HEAD `146c2bd` (APP2-DEC-JOBS-C1 Commit D); tree clean.
- Decision chain verified from Git: `APP2-DEC-STORAGE` A `52d582e` + B `ecef0cd`, C1 `0c8afd5`/`3fce01b`,
  C2 `86d3b91`/`3b167dc`; **`APP2-DEC-JOBS` A `8211214ed2885ff8af4981e688df7cadce258e8b`** + B `27c324e`;
  **`APP2-DEC-JOBS-C1` C `a9ef895bf78d9abcd66f52a44d153f52aadccb44`** + D `146c2bd`. Both hashes match §1.
- `D01_PREFLIGHT = PASS`: `pnpm quality` (exit 0), `check:figma-design-index` (39 IDs at entry),
  tool tests 19/19, `check:styles`, `check:e2e`, `check:openapi`, `check:api-client`,
  `db:check:manifest`, `git diff --check` — all clean.
- Frozen artifacts re-verified unchanged: OpenAPI `ae015dd6…` up to date; API-client tree hash
  **`89c1aace328eef1ee05a74950faa48bf907babece025a6abb9ca1baa1574502f`**; DB **78 tables / 833
  columns / 84 IDX rows**, fingerprint `4ca56a59…`.
- **Deviation from §2 (Product Owner instruction).** The prompt named page `APP_01` (`371:3`).
  Mid-checkpoint the Product Owner directed the package to a new page **`APP_02` (`419:3`)**.
  All APP2 work was authored there; `APP_01` was read only. Registry `Page` column reads `APP_02`.
- Figma write access proven before any mutation (OAuth; Full seat, Pro plan). No node fabricated.

## B. Existing-design audit

Enumerated `FIG-FILE-PRODUCT` — **5 pages** (registry §10 recorded 4; `APP_02` is new and is now
recorded). Audit findings:

| Page | Contents | Decision |
|---|---|---|
| APP_01 `371:3` | APP1-D01 section `375:11` (19 children), APP1-D02 section `405:2224` (9 children) | `REUSE` — read only, never mutated |
| APP_02 `419:3` | empty (0 children) | APP2 write target |
| Wireframe `17:55` | WF01–WF05, WF07–WF09 | `REFERENCE_ONLY` — **no Admin asset/catalog wireframe exists** |
| User Interface `166:1457` | UI01 Homepage, UI02 Discover, UI03 Work Detail, UI04 Commission, UI05 Collections (all DRAFT) | `REFERENCE_ONLY` — nearest analogues only |

No existing product list/detail canonical entry exists. No reference node was promoted or altered.
DS re-audited via `search_design_system`: **GAP-D01 (no Input) and GAP-D02 (no scrim token) both
still stand** on 2026-07-26.

## C. Classification

- **Admin asset / product draft / catalog / publication = `NEW`.** Nothing in the file covers Admin
  business surfaces — APP1-D01 delivered only staff access and an empty shell.
- **Storefront product list / detail = `SUPPLEMENT`.** The visual language exists (UI02/UI03/UI05
  drafts) and the shell is approved (APP1-D02); APP2 adds the real catalog surfaces without
  redesigning the brand.
- **APP1 Admin shell and APP1 Storefront shell/not-found = `REUSE`**, unmodified.

## D. Section and frames

Section **`423:3`** — `APP2-D01 · Assets & Catalog Publication`, page APP_02, 9400×13300, eight
labelled bands. Final content: **29 frames + 1 component set + 10 labels = 40 children**.
Verified programmatically: **0 nodes outside section bounds, 0 frame overlaps, 0 scratch frames.**

[Open the section](https://www.figma.com/design/BQwqV8GdfUIELvsQDB1UQE/embroidery?node-id=423-3)

## E. Admin Assets (A01)

| Registry ID | Node | Represents |
|---|---|---|
| FIG-ADMIN-ASSETS-DESKTOP-DEFAULT | `426:13` | accepted Admin shell, upload action, asset grid with all four statuses |
| FIG-ADMIN-ASSETS-DESKTOP-EMPTY | `429:6` | no assets yet, safe guidance |
| FIG-ADMIN-ASSETS-DESKTOP-UPLOADING | `429:89` | **determinate** 62% progress, cancel, keep-page-open help |
| FIG-ADMIN-ASSETS-DESKTOP-PROCESSING | `430:12` | **indeterminate** segment, explicitly no percentage |
| FIG-ADMIN-ASSETS-DESKTOP-REJECTED | `430:98` | validation alert, plain-language reason, safe actions |
| FIG-ADMIN-ASSETS-MOBILE-DEFAULT | `432:18` | 390 fit, 44×44 menu button, single-column list |
| FIG-ADMIN-ASSETS-MOBILE-UPLOAD | `433:19` | progress + explicit non-drag alternative |

Upload affordance is a keyboard-reachable **“Chọn tệp” button plus optional drag/drop**, never
drag-only. Supported types are stated (PNG/JPEG/WebP); **no numeric size limit is shown**. No
object key, bucket, job, lease, hash, private URL or raw error appears anywhere.

## F. Product Draft, Catalog and Publication (A02–A04)

| Registry ID | Node | Notes |
|---|---|---|
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-DEFAULT | `434:20` | groups: Thông tin cơ bản · Danh mục · Ảnh sản phẩm · Phiên bản & SKU · readiness rail |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-VALIDATION | `436:37` | `role="alert"` summary + Error Input variant |
| FIG-ADMIN-PRODUCT-DRAFT-DESKTOP-SAVING | `436:140` | `role="status"`, disabled actions, `aria-busy` |
| FIG-ADMIN-PRODUCT-DRAFT-MOBILE-DEFAULT | `438:90` | stacked groups, full-width actions |
| FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP | `437:73` | dialog; **only `ACCEPTED` media selectable** |
| FIG-ADMIN-CATALOG-DESKTOP-DEFAULT | `439:100` | product · primary media · draft/published · edit · publication action |
| FIG-ADMIN-CATALOG-DESKTOP-EMPTY | `440:102` | empty state + create CTA |
| FIG-ADMIN-CATALOG-MOBILE-DEFAULT | `440:191` | table → card list |
| FIG-ADMIN-PUBLICATION-DESKTOP-READY | `441:106` | readiness met, publish eligible, consequence stated |
| FIG-ADMIN-PUBLICATION-DESKTOP-BLOCKED | `442:110` | missing requirements, publish `aria-disabled` with reason |
| FIG-ADMIN-PUBLICATION-DESKTOP-CONFIRM-UNPUBLISH | `442:205` | published + safe success banner + `role="alertdialog"` |
| FIG-ADMIN-PUBLICATION-MOBILE | `443:121` | readiness and publish on 390 |

**Save Draft and Publish are distinct throughout.** Variant/SKU is present but explicitly optional
("chỉ bắt buộc khi việc xuất bản yêu cầu"). Unpublish copy states twice that it removes public
visibility and **is not deletion**. No discounts, campaigns, reviews, shipping, SEO score, AI copy,
bulk actions, analytics or unsupported filters.

## G. Storefront (S01–S02)

| Registry ID | Node | Notes |
|---|---|---|
| FIG-STOREFRONT-PRODUCT-LIST-DESKTOP / TABLET / MOBILE / EMPTY | `444:204` · `445:204` · `445:210` · `446:223` | editorial grid, approved derivative, title, safe copy, detail link, single `h1` |
| FIG-STOREFRONT-PRODUCT-DETAIL-DESKTOP / TABLET / MOBILE | `447:204` · `448:204` · `448:210` | gallery of approved derivatives, description, public variants, embroidery context |
| FIG-STOREFRONT-PRODUCT-DETAIL-MEDIA-STATE | `449:357` | safe image fallback, no technical detail |

All six frames are **clones of the approved APP1-D02 shells** (`405:2225`/`405:3733`/`405:3786`)
with only the `<main>` content slot replaced. Published products only. Embroidery/customization
context is descriptive prose with **no Design Studio entry point**. Unpublished/missing products
reuse `FIG-STOREFRONT-NOTFOUND` — APP2 adds no not-found. No cart, wishlist, ratings,
personalization or working search. SEO annotations (server-rendered core content, canonical path,
meaningful alt, never a private-original URL) are recorded in the notes frame.

## H. Design system

- **Reused as remote instances** (never detached): Button `Primary 23e53f1d…` / `Secondary 834213e1…`
  / `Ghost 8491f981…`, Header `Full 3014ae96…` / `Compact fc1272c6…`, Footer `f38e2450…`,
  NavLink `9c7a4d8a…`/`58098a05…`, SearchBar `54658ca4…`.
- **Tokens/styles**: only the approved DS set — 19 semantic colours, spacing, radius, `Display/M`,
  `Heading/{XL,M,S}`, `Body/{L,M,S}`, `Caption`, `Elevation/Modal`. **No colour was derived from a
  wireframe.**
- **`FIG-DS-INPUT-APP2` (`424:35`)** — new component set `APP2 Supplement / Input`, five variants
  (Default/Focus/Filled/Error/Disabled), label→field→help/error structure, token-bound. Created in
  the **product file**, not the DS library, because `FIG-FILE-DS` is read-only; `GAP-D01` therefore
  stays open at library level. `REVIEW_REQUIRED`.
- **GAP-D02** unchanged — dialogs reuse the APP1-D02 local `ink/900 @45%` scrim. No new token.
- **FU-A15** (inverse/disabled tokens) and **FU-A16** (breakpoint handoff) were **not activated**:
  APP2 consumes existing `text/inverse` and `action/disabled` unchanged and introduces no global
  breakpoint token. Consistent with APP1-D02.
- DS `Chip`, `StudioWorkCard`, `EditorialMediaBlock` audited and **deliberately not used** —
  semantically wrong for asset status. Status badges are local compositions; a semantic status-badge
  component is logged as a future DS gap candidate, not activated here.

## I. Responsive and accessibility

Reviewed at **1440 / 1024 / 390**; APP1 shell breakpoint behaviour preserved. Annotated: side nav →
44×44 menu button; table → card list; 4-column grid → 1 column; 2-column form → stacked; dialog
behaviour; media handling; overflow. **No 390px horizontal overflow** (mobile frames are exactly
390 wide with all children `FILL`).

Accessibility notes recorded: single `h1`; `<label for>` + `aria-describedby` on the Input
supplement; `role="alert"` validation summaries; `role="status"` + `aria-live="polite"` for
saving/processing; determinate vs indeterminate progress semantics; focus order; dialog
focus enter/trap/return with Escape and backdrop close; **non-colour status cues (dot + text)**;
≥44px targets; meaningful alt; reduced motion. **Full WCAG conformance is not claimed** — contrast
verification is left to the implementing checkpoints.

## J. Registry and handoff

- `FIGMA_DESIGN_INDEX.md`: new **§4.3** (29 rows) and **§6.1b** (1 DS-supplement row); §3 records
  the `APP_02` write target; §7 GAP rows re-dated with the 2026-07-26 re-confirmation; §10 coverage
  rewritten. **Final registry count: 69 registry IDs / 69 node rows / 8 tables.**
- Every new row is `REVIEW_REQUIRED` with **no approval evidence ID**. No APP1 row was modified;
  no draft/reference row was promoted; **APP2-D01 supersedes nothing**.
- Phase plan **§6.2** adds the six-checkpoint handoff (A01→Assets, A02→Draft, A03→Catalog,
  A04→Publication, S01→List, S02→Detail) with states, responsive evidence, interaction/a11y
  obligations, domain semantics, exclusions and the Product Owner approval gate.

## K. Follow-ups and blockers

- **Activated (design-owned):** `GAP-D01` → `FIG-DS-INPUT-APP2` (product-file supplement).
- **Not activated:** `GAP-D02`, `FU-A15`, `FU-A16` — no genuine APP2 consumer.
- **Untouched:** `APP1-FU01`, `FU-A17`, `FU-A20`, Storefront favicon — none is design-owned at D01.
- **Preserved unchanged:** `STORAGE-BLK-01`, `STORAGE-BLK-02`, `STORAGE-BLK-03` — they gate
  `APP2-B01`, not `APP2-D01`.
- **New open item raised (not invented):** the public product **URL pattern**. The repository locks
  only `GET /api/public/products/{slug}`; no page route exists. `/san-pham/<slug>` is drawn and
  labelled a **proposal** in the notes frame, registry §4.3 and phase plan §6.2, requiring Product
  Owner confirmation before `APP2-S02`.

## L. Commit A

- **`6f6a33e5e5b48abed507b04b6bdb9c109734d37a`** — `design(app2): deliver assets and catalog design package`.
- Files (4): `docs/design/FIGMA_DESIGN_INDEX.md`,
  `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`,
  `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`,
  `docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md`.
  No completion report, no source/schema/infra/dependency/generated-client change.

## M. Validation

| Gate | Result |
|---|---|
| `pnpm quality` | PASS (exit 0) |
| `pnpm check:figma-design-index` | PASS — **69 registry IDs, 69 node rows, 8 tables** |
| `node --test tools/check-figma-design-index.test.mjs` | PASS 19/19 |
| `pnpm check:styles` | PASS |
| `pnpm check:e2e` | PASS (32 tests collect) |
| `pnpm check:openapi` | PASS — artifact up to date |
| `pnpm check:api-client` | PASS — `89c1aace…` unchanged |
| `pnpm db:check:manifest` | PASS — 78 tables / 833 columns unchanged |
| `node tools/check-file-size.mjs` | PASS (no new violation) |
| `git diff --check` | clean |
| Final nodes re-read | 40 section children resolve; 0 outside bounds; 0 overlaps |
| APP1 preserved | `375:11` (19 children) + `405:2224` (9 children) byte-identical to the entry audit; all 23 APP1 registry nodes resolve unchanged |
| Screenshots reviewed | Input set, Assets Default (×2), Product Draft, Catalog, Storefront List, Media Select, Confirm Unpublish (×2), Product Detail, full-section overview |

Two defects were found by screenshot review and fixed before freeze: DS Button instances kept their
default label (relabelled), and asset cards collapsed because `resize()` resets
`primaryAxisSizingMode` to `FIXED` (hug restored). A third — scrim rendering fully opaque because
paint-level opacity is lost when spreading a bound-variable paint — was fixed by applying 45% at
node level. All three were verified visually after the fix.

## N. Acceptance

All §25 criteria met: decision chain verified; Figma writable; APP1 frames preserved; existing
references audited without promotion; classification correct; one new section; all required Admin
and Storefront frames created; not-found reused; no non-scope surface; no invented parameter;
upload/processing, save/publish and unpublish semantics honest; responsive and a11y reviewed;
GAP-D01 handled and GAP-D02 left local; no wireframe token authority; notes complete; every frame
registered with exact links; new rows `REVIEW_REQUIRED`; APP1 approvals unchanged; six handoffs
exact; storage blockers preserved; screenshots reviewed; nodes re-read; scratch removed; gates pass;
frozen artifacts unchanged; two scoped commits; clean tree; not pushed; no implementation started;
**no correction auto-created**.

Two deviations are recorded rather than silently resolved: the **page override to `APP_02`**
(Product Owner instruction, §A) and four **§3 document paths that do not exist** under the names
given — the real files are `docs/design/DESIGN_VISION.md`, `docs/design/USER_FLOW_ARCHITECTURE.md`,
`docs/07-ADMIN-OPERATIONS.md` and `docs/11-DOMAIN-GLOSSARY.md` (the prompt listed `VISION.md`,
`USER_FLOW.md`, `07-DOMAIN-LIFECYCLE.md`/`08-ADMIN-OPERATIONS.md` and `11-GLOSSARY.md`); the real
files were read.

## O. Scope

No `apps/**`, `packages/**`, database, migration, infrastructure, environment, manifest, lockfile,
OpenAPI, generated-client or dependency change. No Figma node on `APP_01` mutated. Only
`FIG-FILE-PRODUCT` page `APP_02` mutations plus four documentation files.

## P. Evidence closure

- **`APP2-D01` = `DELIVERED_FOR_PRODUCT_OWNER_REVIEW`.**
- **`APP2-I01` / `APP2-I02` = `READY, NOT STARTED`.**
- **`APP2-B01` = `BLOCKED_BY_STORAGE-BLK-01..03`.**
- **`APP2-A01..A04` = `BLOCKED_BY_D01_APPROVAL_AND_BACKEND`.**
- **`APP2-S01` / `APP2-S02` = `BLOCKED_BY_D01_APPROVAL_AND_PUBLIC_BACKEND`.**
- **`APP2-W01` = `BLOCKED_BY_I02_AND_B01`.** **APP2 product engineering = `NOT_STARTED`.**
- Two commits (A design/registry, B evidence); clean tree; **not pushed**; design **not self-approved**.
