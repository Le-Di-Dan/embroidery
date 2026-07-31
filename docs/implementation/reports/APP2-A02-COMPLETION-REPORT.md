# APP2-A02 — Admin Product List — Completion Report

**Checkpoint:** `APP2-A02` — Implement the approved read-only Admin Product List
**Phase:** APP2 — Assets and Catalog Publication
**Status:** `COMPLETE — DELIVERED_FOR_REVIEW`
**Verdict:** `PASS`
**Date:** 2026-07-31

---

## A. Preflight and accepted chains

`APP2_A02_PREFLIGHT = PASS`.

| Check | Result |
| --- | --- |
| Branch | `production` |
| Entry `HEAD` | `5b2f78e335e2ec329d7ddc93110a28edad0925f1` — `docs(app2): record Admin Product List design evidence` (the exact `APP2-D03` evidence Commit B) |
| Tracked/staged changes | none |
| Untracked | `evidences/` only (user-owned; untouched, unstaged, excluded from both commits) |
| Prior A02 implementation | none — no `products` route segment, no `features/products`, no product operation reachable from `@embroidery/api-client` |
| `pnpm quality` | EXIT 0 |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | tree hash `3e3e267d…` |
| `pnpm check:figma-design-index` | 71 registry IDs |
| `node --test tools/check-figma-design-index.test.mjs` | 19/19 pass |
| `pnpm db:check:manifest` | all checks passed |
| `git diff --check` | clean |

Consumed chains, verified from Git history:

| Checkpoint | Commits | State |
| --- | --- | --- |
| `APP2-D03` | A `561c058` + B `5b2f78e` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP2-B02` / C1 | A `14c80f0` + B `13fa4f2`, C1 C `90e00d7` + D `0bf4686` | `COMPLETE — CORRECTED (C1) — REVIEW_ACCEPTED` |
| `APP2-B02-G01` | A `356d6e7` + B `fffa495` | `COMPLETE — ENTRY_GATE_CLOSED` |
| `APP2-A01` / C1 | A `5816412` + B `6f12c4d`, C1 C `77691ab` + D `bb4ebb9` | `COMPLETE — CORRECTED (C1)` |
| APP1 Admin foundations | `APP1-A01`/C1/C2, `APP1-A02` | `PRODUCT_OWNER_ACCEPTED` |

---

## B. Live design authority

Every approved node was re-opened in Figma (file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_02` `419:3`) and read structurally — auto-layout, sizing, bound variables, text styles — plus rendered screenshots at both viewports.

| Registry ID | Node | Status | Read |
| --- | --- | --- | --- |
| `FIG-ADMIN-CATALOG-DESKTOP-DEFAULT` | `439:100` | `APPROVED_FOR_IMPLEMENTATION` | 1440×1024, filters `493:273`, table `439:186`, continuation `493:284` |
| `FIG-ADMIN-CATALOG-DESKTOP-EMPTY` | `440:102` | `APPROVED_FOR_IMPLEMENTATION` | 1440×1024, filters `494:274`, empty state `440:186` |
| `FIG-ADMIN-CATALOG-MOBILE-DEFAULT` | `440:191` | `APPROVED_FOR_IMPLEMENTATION` | 390×844, filters `495:273`, cards `440:236`, continuation `495:284` |
| `FIG-ADMIN-CATALOG-FILTERS-ACTIONS-HANDOFF` | `498:272` | `REVIEW_REQUIRED` (annotation) | normative handoff — filters, continuation, staged actions, exclusions |

Approval evidence `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001` is recorded against all three screen rows.

Also inspected: `450:404` (D01 handoff notes — checkpoint ownership now reads **A02 → Admin product list … Danh sách CHỈ ĐỌC + bộ lọc**, consistent with §6.1 of the phase plan), `451:404` (reuse/supersession map), the APP1 Admin shell authority, and the DS Input supplement `424:35`.

**No contradiction found.** The three frozen nodes now carry filters and continuation and carry no `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ` or `Xoá` control; the annotation, the phase plan and the registry agree on ownership. The block that produced `APP2-D03` is fully cured.

Colour, radius, spacing and type were read back from the nodes' **bound variables** rather than eyeballed, and each maps onto an existing `@embroidery/styles` token:

| Figma bound variable | Token |
| --- | --- |
| `background/surface` | `$color-surface-primary` |
| `background/secondary` | `$color-background-secondary` |
| `border/primary` | `$color-border-primary` |
| `text/primary` · `text/secondary` · `text/tertiary` | `$color-text-*` |
| `status/success` (published pill) · `status/warning` (draft pill) | `$color-status-success` · `$color-status-warning` |
| radius 16 (table, card, field, pill, media tile) | `$radius-md` / `$radius-input` |

---

## C. Existing Admin and client architecture

Audited before writing anything: `apps/admin/**`, `packages/api-client/**`, `packages/frontend-testing/**`, `packages/styles/**`, `packages/e2e-testing/**`, the APP1 Admin shell reports, the `APP2-B01`/`B02`/`B02-C1` reports, the `APP2-D03` report and approval, the phase plan, and the frontend/test conventions.

Recorded facts that shaped the implementation:

- Routing: a capability owns its own route constant in its `model/` folder (`ADMIN_ASSETS_ROUTE`), re-exported through the feature barrel; `config/routes.ts` holds only the login and authenticated-home constants shared with the Edge proxy.
- The authenticated shell is `app/(protected)/layout.tsx`; a route segment is thin and only prefetches.
- `providers/app-providers.tsx` owns the single `QueryClient`; segments hydrate through `HydrationBoundary`.
- Feature-first structure in this app is `components/ hooks/ model/ services/ styles/` — not the `utils/ constants/ types/` triple named in the brief. The existing convention was followed.
- Generated names: `adminProductList`, `AdminProductListParams`, `AdminProductListResponse`, `AdminProductSummaryResponse`, `AdminProductListStatus`, `AdminProductListCategorySlug`.
- Errors normalize through `normalizeApiClientError` into a `NormalizedApiError`; a feature-owned error class carries it and nothing else.
- Global Sass entry `apps/admin/src/styles/main.scss` composes one leaf stylesheet per feature.
- Tests live in `apps/admin/test/{components,model,smoke}` with shared fixtures in `test/support`; the generated client is the mocked boundary.
- Breakpoint 1024px, shared with the shell and the asset library.

---

## D. Route and feature ownership

`/products`, inside the authenticated Admin shell.

The route is not written down in a canonical document, so it was derived and is stated here explicitly rather than assumed: the approved frames carry a **`Sản phẩm`** navigation destination in the Admin rail (`439:118`, `440:120`, and the mobile drawer), the phase plan §6.1 names the checkpoint *Admin product list*, and the sibling capability owns `/assets` under the same convention. No authority names a different path, and no alias (`/admin/products`, `/catalog`, `/san-pham`) exists anywhere in the tree — asserted by test.

```
apps/admin/src/app/(protected)/products/page.tsx   thin prefetch boundary
apps/admin/src/features/products/
  components/   product-list-screen · product-filter-bar · product-collection
                product-table · product-card-list · product-status-badge
                product-media-placeholder · product-continuation
  hooks/        use-product-filters · use-product-list-query
  model/        product-route · product-copy · product-status · product-category
                product-filters · product-query-keys · product-pages · product-failure
  services/     product-catalog.service (browser) · product-catalog.server (RSC)
  styles/       products.scss
  index.ts      public surface
```

No empty folders, one production component per file, and the server-only prefetch service is deliberately **not** re-exported from `index.ts` (it imports `next/headers`, and the barrel is reachable from Client Components).

The shell navigation gained one entry, `{ id: 'products', label: PRODUCT_COPY.page.title, href: ADMIN_PRODUCTS_ROUTE }` — the label and the route both come from the owning capability, so there is one spelling of each.

Largest new source file: `products.scss` at 462 lines (a stylesheet, not logic). Largest TypeScript file: `product-filters.ts` at 124 lines. Largest test: `product-list-render.test.tsx` at 298 lines. All within limits; `node tools/check-file-size.mjs` reports no new file above a review threshold.

---

## E. Query and hydration boundary

The accepted server-prefetch model was preserved. `page.tsx` normalizes the requested filters, prefetches exactly the matching first cursor page into a request-scoped `QueryClient`, dehydrates once and hydrates once — so the client does not re-request page one on mount.

The key correctness property here is that **the server and the client must derive the same query key**. Both call the same total function `normalizeProductFilters` on the same raw parameters, so they agree even for `?status=nonsense`, which both read as "all". A hand-rolled server-side parse would have produced a hydration miss for exactly the inputs least likely to be tested.

`prefetchInfiniteQuery` absorbs its own failure by design: a prefetch that cannot reach the API dehydrates nothing, the client issues the request itself, and a real outage surfaces as the approved "list unavailable" state rather than a rendered error page.

One query-key factory owns the list:

```ts
productQueryKeys.list(filters) =
  ['admin', 'products', 'list', { pageSize, status, category }]
```

The filters are part of the key on purpose. That is what makes "reset pagination, fetch a fresh first page, never merge pages across filters" **structural** rather than a rule a component has to remember: a filter change addresses a different cache entry, so pages fetched under the previous filters cannot be merged into it, and the superseded request is aborted through the `signal` TanStack Query supplies. No credential, `AbortController`, DOM node, raw error or non-serializable value appears in any key.

---

## F. List projection

Consumes `items`, `hasNext`, `nextCursor`. The unfiltered page truthfully carries `DRAFT`, `PUBLISHED` and `ARCHIVED` alike — **archived products are not hidden**, asserted by test and confirmed live.

Rendered: product name, category label, status label, and a generic media placeholder.

Never rendered — asserted against the full container text with contract-shaped fixtures that *do* carry these fields: `basePriceAmount`, `currencyCode`, `slug`, `updatedAt`, `createdAt`, `productId`, the category UUID (absent from the contract), and any storage, checksum, derivative or inspection value.

Price is intentionally excluded by `APP2-D03`/IMP-D033; it belongs to `APP2-A03` and publication readiness.

---

## G. Status and category

Both are **parsed, not cast**. The contract types them as closed unions, but a running server may answer with a value this build predates, and a cast would render that raw string into the DOM.

| Wire | Label |
| --- | --- |
| `DRAFT` | Bản nháp |
| `PUBLISHED` | Đã xuất bản |
| `ARCHIVED` | Đã lưu trữ |
| anything else | Chưa xác định (neutral; never "ready", never the raw value) |

| Slug | Label |
| --- | --- |
| `thu-bong` | Thú bông |
| `khan` | Khăn |
| `quan-ao` | Quần áo |
| `khac` | Khác |
| anything else | Chưa xác định |

Both mappings are keyed by the **generated enum objects**, so a value added to the contract fails the build here rather than silently degrading to the fallback. The database package is never imported and no category endpoint is called — there is none.

The response also carries a server-side `category.name`. It is deliberately **not** rendered: one screen, one spelling, and an unrecognised server string never reaches the DOM. A fixture with a deliberately stale server label proves the approved label wins.

Status is never colour-only: every badge carries its text label, and the coloured dot is `aria-hidden`.

---

## H. Filters

Exactly two, in the approved order, each with a permanently visible label above a 48px control.

| Filter | Options | Wire |
| --- | --- | --- |
| Trạng thái | Tất cả trạng thái · Bản nháp · Đã xuất bản · Đã lưu trữ | `all` → omit `status`; otherwise `DRAFT` / `PUBLISHED` / `ARCHIVED` |
| Danh mục | Tất cả danh mục · Thú bông · Khăn · Quần áo · Khác | `all` → omit `categorySlug`; otherwise the slug |

"All" is a presentation value, never a wire value — `status=all` is never sent.

**State lives in the URL.** A filtered list is something an operator can bookmark, reload and share, and the server segment reads the same parameters to prefetch the matching page. `router.replace` with `scroll: false`: narrowing a list is not a navigation step, and a back button that walked a filter history would be a surprise. A filter returning to "all" is dropped from the URL, so the unfiltered screen has a clean address.

Reading is **total**: an unknown, blank, injected or repeated parameter normalizes to "all" and is never echoed into the DOM. Verified live with `?status=DELETED&category=<script>` — both selects read "Tất cả …", the request carried neither parameter, and neither string appears anywhere in the page.

Controls stay mounted and enabled while a page loads, so the operator can always see and change what they asked for.

Native `<select>` by deliberate choice: keyboard- and screen-reader-correct with no interaction code, the platform picker on touch, and the approved field *is* a labelled select with a chevron — not a custom listbox.

No search, sort, price, date or owner control, and no "clear all" (the design defines none).

---

## I. Continuation

`Tải thêm sản phẩm`, reusing the `APP2-D02` cursor pattern, placed after the collection in normal content flow. Full width at 390, auto width from the breakpoint up.

- Offered only when the last page reported `hasNext` **and** a usable cursor — a `hasNext: true` with an empty `nextCursor` offers nothing and issues no request.
- Appends; existing items and scroll position are preserved.
- Deduplicates by `productId`, keeping the first occurrence, because a shifting keyset window can legitimately repeat a row; re-sorting would move rows under the operator's cursor.
- Loading: disabled, `Đang tải thêm…`, `aria-busy="true"`, accumulated items still on screen.
- Failure: `Không thể tải thêm sản phẩm.` in a `role="alert"`, a `Thử lại` that re-sends **the very same cursor** (asserted by comparing the two recorded call arguments), and the collection stays intact — a continuation failure never becomes the full-page unavailable state and never becomes an empty state.
- One polite announcement per successful append, not one per query event.

No infinite scroll, viewport trigger, offset, page number or total count — the contract exposes none, so any such copy would be invented.

---

## J. Empty, loading and error

Four mutually exclusive presentations derived from the query, never from a local flag.

| State | Condition | Copy |
| --- | --- | --- |
| Loading | `isPending` | `Đang tải danh sách sản phẩm…` (`role="status"`) |
| Unavailable | error **and** zero pages loaded | `Không thể tải danh sách sản phẩm` + safe body + `Thử lại` (`role="alert"`) |
| Empty (unfiltered) | success, zero items, no filter active | `Chưa có sản phẩm` / `Các sản phẩm sẽ xuất hiện tại đây sau khi bản nháp đầu tiên được tạo.` |
| Empty (filtered) | success, zero items, a filter active | `Không có sản phẩm phù hợp` / `Hãy thử chọn trạng thái hoặc danh mục khác.` |

Which empty state applies is decided by the **filters**, not by the response. Getting that backwards would send an operator hunting for a filter they never set, or tell them the catalogue is empty when they merely narrowed it.

Empty is never shown while loading and never after a failure. Full-page and continuation errors are strictly distinct: once any page has loaded, a later failure stays confined to the control below the collection.

Only the normalized error is used, and only to decide *that* something failed — the server `message`, `code`, `requestId` and field errors are never read for display. A fixture carrying `PRODUCT_LIST_EXPLODED` and `relation "products" does not exist` proves none of it reaches the DOM.

---

## K. Read-only exclusions

The screen renders **no** `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ`, `Xoá`, action column, row menu, card menu, row link or search box — in either viewport, in the populated state or the empty state. Asserted as text absence, as `queryAllByRole('button') → 0` on a populated single-page list, and as `queryAllByRole('link') → 0`; re-confirmed live against the production build.

The exclusion is enforced one layer deeper than the UI: **only `adminProductList` is re-exported from `@embroidery/api-client`.** `adminProductCreate`, `adminProductDetail`, `adminProductUpdate` and `adminProductArchive` remain unexported from the package boundary, so no Admin screen can reach a product mutation before the checkpoint that owns it ships. That is a deliberate, reversible boundary decision recorded here for `APP2-A03`, which will re-export what it needs.

Ownership stays: `APP2-A03` → create/edit/detail; `APP2-A04` → publication interactions.

---

## L. Desktop and mobile

**Desktop (≥1024px)** — a real `<table>` with a visually-hidden `<caption>`, three `<th scope="col">` headers (`Sản phẩm` / `Danh mục` / `Trạng thái`), and one `<th scope="row">` per product. The approved layout *is* a table, so it is marked up as one. Column widths follow the approved 692 / 200 / 160 proportions via `table-layout: fixed` with the product column taking the remainder.

**Mobile (<1024px)** — a single-column `<ul>` of informational cards: media placeholder, name, category, then the status badge. Filters stack full width; controls are 48px; the continuation control is full width after the last card.

Both trees are rendered and the stylesheet shows exactly one. `display: none` removes a subtree from the **accessibility tree** as well as from view, so nothing is ever announced twice — this is why the approach is safe, and it is also why the component tests scope every assertion to the table or to the card list (jsdom applies no stylesheet, so both are queryable there).

The approved frames carry different subtitles at 1440 and 390; both are present and switched the same way, so each viewport shows its approved copy.

Measured live at 390: `scrollWidth - clientWidth = 0` — no horizontal overflow. APP1 shell behaviour (rail at desktop, 44×44 menu button and drawer at mobile) is unchanged.

---

## M. Accessibility, styling and security

- One `<h1>` per page, inside the shell `<main>`.
- Semantic table with scoped headers; semantic mobile collection with an accessible name.
- Every filter has a real `<label for>`; no unlabelled icon buttons.
- Status is text plus a decorative `aria-hidden` dot — never colour alone.
- Continuation is a keyboard-operable `<button>` with `aria-busy` while loading; appended results are announced once through a polite live region; focus is **not** forced to appended items.
- Errors use `role="alert"`; the loading line uses `role="status"`.
- The media placeholder is `role="img"` with an honest accessible name (`Chưa có ảnh xem trước`).
- Motion (the continuation spinner) is behind `@include styles.motion-safe`.
- Styling is global Sass only: `products.scss` → `main.scss` → `@embroidery/styles`. No inline styles, `style jsx`, CSS Modules, Tailwind, CSS-in-JS, duplicated tokens or wireframe colours. `pnpm check:styles` passes across all ten rules.
- No cookie, header, category UUID, storage fact or raw client error is rendered or logged; no `dangerouslySetInnerHTML` anywhere.

---

## N. Honest media placeholder

There is no thumbnail URL in APP2. The tile is a neutral block with a real accessible description — never an `<img>`, never a URL derived from an asset id, never a blob request. Asserted: the rendered container contains no `<img>` element and its HTML matches no `http:`, `blob:`, `/api/`, `minio` or `s3` pattern, and exactly one list request is issued for a rendered page.

Real thumbnail delivery remains `APP2-T01 = ROUTED — NOT PLANNED_FOR_EXECUTION`. `ProductMediaPlaceholder` is the single component that will change when it ships. `APP2-A01` was not modified.

---

## O. Tests and browser verification

**Component tests — 50 new across 4 files**, mocking the generated-client boundary (never a raw URL), so the feature service, the query hook and the components all run their real code.

| File | Tests | Covers |
| --- | --- | --- |
| `product-list-render.test.tsx` | 17 | loading · unfiltered empty · filtered empty · full error · no raw error detail · first-page request shape · all three statuses present · approved category labels over the server name · unknown status/category fallback · safe projection · placeholder with no media request · table headers · mobile cards · non-colour-only status · read-only exclusions · no action in the empty state · unavailable retry |
| `product-list-filters.test.tsx` | 21 | exactly two labelled filters in order · exact option sets and defaults · no search/sort/price/clear-all · filters usable while loading · every status and category wire mapping · both filters together · `all` never sent · four unsafe URL shapes normalized without echo · `replace` not `push` · filter dropped from the URL · fresh first page with no cross-filter merge |
| `product-list-continuation.test.tsx` | 8 | offered only with `hasNext` · withheld on an unusable cursor · no total/page number/infinite scroll · exact cursor sent and page appended in server order · dedupe by `productId` · disabled + `aria-busy` + polite announcement · items kept through failure and retry re-sends the same cursor · never empty after a continuation failure |
| `products-navigation.test.tsx` | 4 | canonical route constant · current destination is not a link · exactly one `<h1>` inside `<main>` · no alias and no link to an unbuilt `APP2-A03` screen |

Two existing shell tests were updated — not disabled — because they encode the navigation contract that legitimately changed: `admin-shell-model.test.ts` (the implemented-routes list) and `admin-shell-drawer.test.tsx` (the drawer focus cycle now includes the products link).

`pnpm --filter @embroidery/admin test` run **twice**: **34 suites / 272 tests pass** both times. `pnpm --filter @embroidery/frontend-testing test`: 4 suites / 10 tests pass.

**Production browser verification.** A production Admin image (`--target runner`, `next build` + `next start`) was built and run behind the **real Nginx gateway** on the dev network in place of the dev container, so what was reviewed is the production bundle at `http://admin.embroidery.local`, not a dev server.

Two stale dev images blocked this and were rebuilt (no tracked file changed): the API image predated `APP2-B02-G01`'s `@embroidery/database` additions, and the migration image predated migration `0033`, so the category taxonomy had never been seeded — visible as `PRODUCT_CATEGORY_INVALID` on every create. After rebuilding both, the database reports 33 migrations and all four categories.

Data was made real rather than faked wherever the contract allows it: 27 product drafts were created through the documented `POST /api/admin/products`, and three were archived through `POST /api/admin/products/{id}/archive`. `PUBLISHED` is unreachable — `APP2-B02` exposes no publish operation and status is server-owned — so that one state was produced by intercepting the **continuation** response, which is a genuine browser request. Everything else below is real end-to-end.

| State | Viewport | Result |
| --- | --- | --- |
| Default empty (real, before seeding) | 1440 · 390 | `Chưa có sản phẩm` + approved body, no action |
| Populated, mixed status (real) | 1440 · 390 | 20 rows / 20 cards; `Bản nháp` and `Đã lưu trữ` both present — archived not hidden |
| Selected filters (real) | 1440 | `?status=ARCHIVED` → 3 rows, all `Đã lưu trữ`, selects read `Đã lưu trữ` |
| Filter empty (real) | 1440 · 390 | `?status=ARCHIVED&category=quan-ao` → `Không có sản phẩm phù hợp` + `Hãy thử chọn trạng thái hoặc danh mục khác.` |
| Unsafe URL (real) | 1440 | `?status=DELETED&category=<script>` → both selects `Tất cả …`, no parameter sent, neither string in the DOM |
| Continuation available → appended (real) | 1440 | 20 → 27 rows, control disappears when exhausted, polite `Đã tải thêm sản phẩm.` announced |
| Continuation loading (real request, delayed) | 1440 | label `Đang tải thêm…`, `disabled`, `aria-busy="true"`, 20 rows still on screen |
| Continuation error (intercepted 503) | 1440 | `Không thể tải thêm sản phẩm.` + `Thử lại`, still 20 rows, no full-page error |
| `PUBLISHED` badge (intercepted continuation) | 1440 | third status renders as `Đã xuất bản` with the approved success accent |
| Read-only sweep | 1440 · 390 | zero occurrences of `Tạo sản phẩm`, `Chỉnh sửa`, `Xuất bản`, `Gỡ xuất bản`, `Lưu trữ`, `Xoá`, `Tìm kiếm` |
| Horizontal overflow | 390 | `scrollWidth − clientWidth = 0` |

The verification container and image were removed, the dev Admin container restarted, and the full stack verified healthy. No screenshot, trace, fixture or driver script was committed — all of it lived in the session scratchpad outside the repository. `APP2-E01` still owns the final phase E2E.

---

## P. Frozen artifacts

| Artifact | Expected | Actual |
| --- | --- | --- |
| OpenAPI SHA-256 | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` | unchanged (direct hash + `check:openapi`) |
| Generated client tree hash | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` | unchanged |
| Database | 33 migrations · 78 tables · 833 columns · 190 CHECK · `82864268…` | unchanged |
| Figma registry | 71 IDs | unchanged |

`packages/api-client/src/index.ts` gained re-exports of already-generated symbols. That file is hand-written and outside `src/generated`, which is what the drift gate hashes — the generated tree is byte-identical, confirmed by `check:api-client`.

A02 added no API or client generation, no backend source, no database or migration change, no worker or object-storage change, no Nginx or Compose change, no Figma or registry change, and **no dependency** (`package.json` files untouched).

---

## Q. Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/admin lint` | pass |
| `pnpm --filter @embroidery/admin typecheck` | pass |
| `pnpm --filter @embroidery/admin test` (×2) | 34 suites / 272 tests pass |
| `pnpm --filter @embroidery/admin build` | compiled; `/products` emitted as `ƒ` (dynamic) |
| `pnpm --filter @embroidery/frontend-testing test` | 4 suites / 10 tests pass |
| `pnpm check:styles` | pass (4 apps, 525 files, 10 rules) |
| `pnpm check:frontend-boundaries` | pass |
| `pnpm check:frontend-build-boundary` | pass (2462 built files, no test code in output) |
| `pnpm check:e2e` | pass (32 tests collect; Playwright pinned 1.61.1) |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | tree hash unchanged |
| `pnpm check:figma-design-index` | 71 registry IDs |
| `node --test tools/check-figma-design-index.test.mjs` | 19/19 pass |
| `pnpm db:check:manifest` | all checks passed |
| `node tools/check-file-size.mjs` | pass; no new file above a threshold |
| `pnpm quality` | **EXIT 0** |
| `git diff --check` | clean |

Formatting note: `prettier --check` initially flagged seven new files; they were formatted with `prettier --write` and the full gate re-run to EXIT 0.

Residue: none. Working tree carries only the user-owned untracked `evidences/`.

---

## R. Commit A

```
2ae36de6499ca8a6d39eac0b13a3d5a4250b815e
feat(admin): implement product list
33 files changed, 2508 insertions(+), 3 deletions(-)
```

| File | Δ |
| --- | --- |
| `apps/admin/src/app/(protected)/products/page.tsx` | +54 |
| `apps/admin/src/features/admin-shell/model/admin-shell-nav.ts` | +6 −1 |
| `apps/admin/src/features/products/components/product-card-list.tsx` | +41 |
| `apps/admin/src/features/products/components/product-collection.tsx` | +112 |
| `apps/admin/src/features/products/components/product-continuation.tsx` | +57 |
| `apps/admin/src/features/products/components/product-filter-bar.tsx` | +75 |
| `apps/admin/src/features/products/components/product-list-screen.tsx` | +50 |
| `apps/admin/src/features/products/components/product-media-placeholder.tsx` | +27 |
| `apps/admin/src/features/products/components/product-status-badge.tsx` | +21 |
| `apps/admin/src/features/products/components/product-table.tsx` | +61 |
| `apps/admin/src/features/products/hooks/use-product-filters.ts` | +73 |
| `apps/admin/src/features/products/hooks/use-product-list-query.ts` | +58 |
| `apps/admin/src/features/products/index.ts` | +12 |
| `apps/admin/src/features/products/model/product-category.ts` | +43 |
| `apps/admin/src/features/products/model/product-copy.ts` | +91 |
| `apps/admin/src/features/products/model/product-failure.ts` | +23 |
| `apps/admin/src/features/products/model/product-filters.ts` | +124 |
| `apps/admin/src/features/products/model/product-pages.ts` | +45 |
| `apps/admin/src/features/products/model/product-query-keys.ts` | +25 |
| `apps/admin/src/features/products/model/product-route.ts` | +10 |
| `apps/admin/src/features/products/model/product-status.ts` | +52 |
| `apps/admin/src/features/products/services/product-catalog.server.ts` | +37 |
| `apps/admin/src/features/products/services/product-catalog.service.ts` | +50 |
| `apps/admin/src/features/products/styles/products.scss` | +462 |
| `apps/admin/src/styles/main.scss` | +1 |
| `apps/admin/test/components/admin-shell-drawer.test.tsx` | +3 |
| `apps/admin/test/components/product-list-continuation.test.tsx` | +207 |
| `apps/admin/test/components/product-list-filters.test.tsx` | +239 |
| `apps/admin/test/components/product-list-render.test.tsx` | +298 |
| `apps/admin/test/components/products-navigation.test.tsx` | +84 |
| `apps/admin/test/model/admin-shell-model.test.ts` | +6 −1 |
| `apps/admin/test/support/product-fixture.ts` | +44 |
| `packages/api-client/src/index.ts` | +18 |

`evidences/` is not part of this commit.

---

## S. Judgement calls disclosed

Three decisions were taken that a reviewer should see stated rather than discover.

1. **The mobile frame's "table-to-list" note is not rendered.** Node `440:235` reads *"Trên màn hình hẹp, bảng sản phẩm hiển thị dưới dạng danh sách thẻ."* — a description of the responsive behaviour written for a design reviewer, not guidance for an operator, who cannot see the table it refers to. It is not among §15's required mobile elements. It was therefore treated as a frame annotation and omitted. If the Product Owner intends it as real UI copy, it is a one-line addition.

2. **Both viewport trees are in the DOM, switched by `display: none`.** The alternative — choosing at runtime from a media query — introduces a hydration mismatch for a purely presentational decision. `display: none` removes the hidden tree from the accessibility tree, so there is no double announcement; the cost is DOM size, and the consequence is that component tests must scope queries.

3. **Only `adminProductList` was re-exported from `@embroidery/api-client`.** Adding all five product operations would have been the smaller diff, but it would leave four mutations reachable from any Admin screen before `APP2-A03`/`APP2-A04` exist. `APP2-A03` should re-export what it needs as part of its own commit.

Two environment facts, not code defects, are also recorded: the dev API and migration images were stale and were rebuilt (§O), and the dev database now holds the 27 seeded product drafts (3 archived) used for the live review. Nothing about either is tracked in Git.

---

## T. Acceptance

| Criterion | Result |
| --- | --- |
| Exact clean `APP2-D03` entry state | PASS |
| Approved nodes and annotation re-read live | PASS |
| One read-only screen | PASS |
| `adminProduct_list` only | PASS |
| Generated client only — no raw Axios URL, `fetch`, manual path, DB/MinIO access | PASS |
| Truthful all-status list | PASS |
| Exact status and category filters | PASS |
| No price, search or action controls | PASS |
| Honest media placeholder | PASS |
| Complete cursor continuation | PASS |
| Truthful empty, loading and error states | PASS |
| Desktop, mobile, accessibility, global Sass | PASS |
| Tests twice + production visual review | PASS |
| Frozen OpenAPI / client / database / Figma | PASS |
| No backend, worker or dependency change | PASS |
| Two scoped commits, clean tree, not pushed | PASS |

**Verdict: `PASS`.**

---

## U. Handoff to `APP2-A03`

`APP2-A03` — Admin product form/detail — is now `READY`. Its design authority is `FIG-ADMIN-PRODUCT-DRAFT-*` plus `FIG-ADMIN-PRODUCT-MEDIA-SELECT-DESKTOP` (5 frames), which remain `REVIEW_REQUIRED` and are **not** covered by `FIG-APPROVAL-APP2-D03-CATALOG-LIST-001` — that approval promoted the three Catalog rows only. A03 must record its own approval evidence before implementation.

What A02 leaves in place for it:

- `/products` and the `products` feature, with `ADMIN_PRODUCTS_ROUTE` as the single route constant to build detail and create routes beneath.
- `PRODUCT_COPY`, `product-status`, `product-category` and `product-filters` — reusable as-is; A03 adds its own copy rather than editing the list's.
- `productQueryKeys`, whose `all` root is the invalidation target after a create or update.
- The `ProductApiError` seam and `product-catalog.service.ts`, where the create/update/detail calls belong.
- The staged restoration the approved annotation prescribes: A03 restores `Tạo sản phẩm` and `Chỉnh sửa / mở chi tiết`; A04 adds `Xuất bản`, `Gỡ xuất bản` and publication-readiness interactions — **both add to the list's approved layout without redefining it.**
- The client boundary to widen: A03 re-exports `adminProductCreate`, `adminProductDetail` and `adminProductUpdate` from `@embroidery/api-client`; `adminProductArchive` waits for the checkpoint that owns archiving.

Still routed and unchanged: `APP2-T01` (thumbnail delivery) — the media placeholder stays honest until it ships.
