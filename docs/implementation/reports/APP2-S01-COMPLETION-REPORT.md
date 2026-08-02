# APP2-S01 — Storefront Product Discovery Feed — Completion Report

**Verdict: `PASS`.** The anonymous Discover feed ships at `/kham-pha`, server-rendered,
consuming `APP2-B04` only, preserving UI02's masonry, and proved against a real
production Storefront behind the real gateway.

---

## A. Preflight and `APP2-S01-G01` entry

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `a134c7336747669ec9cc034962fa74fa64ed7c3c` — `docs(app2): record S01 route-gate evidence` (1 file, +304) |
| Tracked/staged tree | clean |
| Ignored user-owned `evidences/` | untouched |
| Local commits ahead | 56 at entry; nothing pushed |

Accepted history verified unchanged: `fa8e05e` (B04, 19 files), `559237d`, `0c331aa`
(21 files, +1695/−23) and the `APP2-S01-G01` authority commit `b968194` (8 files,
+595/−4).

`APP2_S01_PREFLIGHT = PASS` — `check:secrets` (357 documents / 1713 files),
`check:lifecycle`, `check:pagination-authority` + 14 tests,
`check:storefront-route-authority` + 22 tests, `pnpm quality` (exit 0),
`check:openapi`, `check:api-client`, `check:figma-design-index` + 31 tests,
`db:check:manifest`, `git diff --check`.

---

## B. Live UI02 and shell audit

Figma was audited live (file `BQwqV8GdfUIELvsQDB1UQE`) after the operator authorised
the session. Measured from the frames themselves, not from the registry summary:

| Node | Frame | Page padding | Content | Columns | Gap |
|---|---|---|---|---|---|
| `208:2002` desktop | 1440 × 7241 | 80 | 1280 | **5 × 236.8** | 24 |
| `224:871` tablet | 1024 × 5137 | 48 | 928 | **3 × 293.3** | 24 |
| `226:1038` mobile | 390 × 4533 | 24 | 342 | **2 × 163** | 16 |

`208:538` is the section containing those three frames; its own dump exceeds the tool's
response limit, so the three child frames — which are the authority — were read
individually. Card structure (`217:676`): artwork image, 12px gap, `Title`, 4px gap,
`Category`. Card heights across the frames run 298 → 825px, confirming variable heights.
The shell frame `405:2225` is Header 72 + content slot + Footer 327, and the UI02
frames embed those same Header/Footer instances — so the Discover page composes into
the existing shell rather than beside it.

Registry facts re-verified: S01 reuse policy `REUSE_AND_SUPPLEMENT_ONLY`; S02
`NOT_APPROVED` / `WITHHELD_PENDING_UI03_RECONCILIATION`; UI03 roots `261:1290` /
`262:1291` / `273:1409` / `279:1504`. **No Figma node was modified**; the registry
stays at 72 IDs / 72 node rows.

---

## C. `APP2-S01-G01` integrity gate — `PASS`

`IMP-D038` exists exactly once and is `LOCKED`; `/kham-pha` is recorded as the S01
route; `/` remains Homepage-owned; the query key is `category`; the four fixed slugs
are present; S01 cards are explicitly non-interactive; S02 remains
`BLOCKED_BY_UI03_RECONCILIATION`; `/san-pham/<slug>` remains proposal-only.
`pnpm check:storefront-route-authority` passes and its 22 regressions pass.

---

## D. `/kham-pha` implementation

One route segment, `apps/storefront/src/app/kham-pha/page.tsx`. It resolves the
category, seeds the first keyset page into a request-scoped `QueryClient` and hands the
dehydrated cache to the client island.

`export const dynamic = 'force-dynamic'` is a **correctness** requirement rather than a
performance preference: publication is re-read on every API request precisely because
nothing in this system invalidates a cache, so a build-time or full-route cached copy
could keep showing a product the operator has unpublished. The production build
confirms it: `next build` lists `/kham-pha` as `ƒ (Dynamic) server-rendered on demand`,
alongside `○ (Static)` for `/`.

No alias and no redirect were added. The path literal is written **once**, in the
shell's navigation model (`STOREFRONT_DISCOVER_ROUTE`), because routes are shell IA —
the header nav, the not-found recovery and the feature all read that one constant, and
two literals for one path is how an alias appears by accident.

---

## E. Staged non-interactive cards

`ProductCard` renders a semantic `<article>` with a thumbnail (or an honest
placeholder), the Product name and the Category name. No `href`, click handler, button
role, pointer cursor, hover treatment or *Xem chi tiết*. This is accepted authority
(IMP-D038), and the boundary test asserts the absence structurally: the card source
contains no `href=`, `onClick=`, `<Link`, `<a` or `cursor: pointer`, and the browser run
measured **0** interactive descendants inside the masonry.

`APP2-S02` can wrap this same markup in a link once UI03 reconciliation supplies a
destination, without touching the masonry.

---

## F. UI02 reconciliation

**Preserved:** image-led discovery; the compact *Khám phá* introduction; artwork
beginning immediately after the intro and chips (measured 405px from the top of the
desktop frame, inside the first viewport); lightweight guidance; variable-height
masonry at 5 / 3 / 2 columns; linear DOM order; editorial whitespace at the measured
24 / 16px gaps; minimal card metadata; continuous keyset exploration; the existing APP1
shell.

**Omitted rather than faked** — `APP2-B04` supports none of them, and a control that
cannot act is worse than no control: the intro's `Tinh chỉnh` and `Bố cục` buttons;
the six unsupported chips (`Phong cách ▾`, `Chủ đề ▾`, `Bộ sưu tập ▾`, `Tối giản`,
`Đám cưới`, `Thêm…`); and the five feed modules — Collection Prompt, Trending Now,
Related Exploration, Recently Completed and Soft Commission. The browser run asserts
their absence from the rendered text.

**Two honest deviations, both stated rather than hidden:**

1. **Column width.** The approved shell owns the page container (max 1200px with its
   own padding), so rendered columns are proportionally narrower than UI02's
   1440-frame values. What UI02 locks is the column *count*, the variable heights and
   the rhythm; all three are preserved. Changing the shell container was out of scope
   and would have altered an approved APP1 artifact.
2. **Chip height.** UI02 draws a 33px chip; the locked minimum touch target is 44px.
   The control is grown to 44px. Accessibility wins over the drawn height, and the
   browser run measured **zero** undersized controls at all three viewports.

UI02's chip row also carries category-*style* labels; S01 reuses the chip *treatment*
and supplies the five truthful categories the backend actually filters by.

---

## G. Route, layout and server ownership

Root layout → `StorefrontShell` → one `main#main-content` → the page. The page adds no
header, footer, drawer, `<main>`, skip link or search. Measured in production HTML:
exactly **1** `<h1>` and exactly **1** `<main>`.

---

## H. Client boundary

Five client files: the feed island, the continuation control, the route-local query
provider and the two hooks they use. The route segment, intro, chips, masonry, cards
and every state stay Server Components — asserted structurally by the boundary test.

The query provider is deliberately **route-local**, not a global Storefront provider:
every other Storefront route renders without client server-state, and a root provider
would put a client boundary above pages that do not need one.

The selection reaches the island as a **prop from the server**, not from
`useSearchParams`. Chips are ordinary links, so a chip click re-runs the server page,
which resolves the URL and fetches the matching first page; the island then mounts
against a query key that already contains the new category. That is what makes a
category change start a fresh cursor sequence — required, because `APP2-B04` rejects a
cursor replayed under a different filter.

---

## I. SSR and hydration

Proved twice, at two levels.

- **Node**: `renderToStaticMarkup` of the real server component produces the `<h1>`,
  the five chips, both fixture products and the thumbnail path, from **exactly one**
  API request (`{ limit: 20 }`).
- **Production HTTP**: a raw request through the gateway — no JavaScript at all —
  returned 32,707 bytes containing the heading, all five chips, the target product and
  a real `/api/public/products/…/media/…` path.

A failed prefetch is absorbed by design: the page still renders with the pending state,
the client re-issues the request, and only a second failure becomes the approved
"Chưa thể tải các tác phẩm". A transient API blip must never cost the visitor the whole
page. The SSR test asserts this and also that no technical detail (`ECONNREFUSED`, the
upstream address) reaches the HTML.

---

## J. Category URL state

`/kham-pha` unfiltered; `/kham-pha?category=<slug>` over exactly `thu-bong`, `khan`,
`quan-ao`, `khac`, rendered *Tất cả* / *Thú bông* / *Khăn* / *Quần áo* / *Khác*. "All"
omits the query. The slugs are derived from the generated contract enum, so a contract
change surfaces as a build failure rather than a chip that silently 404s.

Real links, server-resolved active state, `aria-current="page"`, and an active
treatment that is not colour alone (filled chip **and** heavier label). Verified in
production: every href exact, the requested chip current, and browser **back** restoring
the previous selection.

An unknown value — and a repeated `?category=a&category=b`, which names no single
selection — takes the approved not-found boundary rather than quietly answering
"everything". Measured in production: **404** carrying the approved *Không tìm thấy
trang*.

---

## K. Keyset continuation

The cursor is opaque: passed back exactly as issued, never parsed, composed or
rendered. Continuation is gated on `hasNext` **and** a usable cursor, so a malformed
page (`hasNext: true, nextCursor: null`) cannot drive an endless cursor-less request.

**A real defect was found and fixed here.** The first implementation guarded
`loadMore` on `isFetchingNextPage`, which is render state. Three synchronous observer
callbacks in one batch all read the same stale `false` and each started a request for
the same cursor — the test that fires the sentinel three times caught it. The in-flight
cursor is now tracked in a ref, updated immediately; the guard holds for a sentinel that
fires faster than React re-renders.

Retries are off. A hidden automatic retry replays a failed cursor without the visitor
knowing; the approved *Thử lại* replays the **exact** `pageParam` that failed (asserted:
call 3 carries `cursor-1`). Automatic loading also stops after a failure, so a sentinel
that stays in view cannot become a retry loop.

Measured in production with 24 published products: first page **20**, scrolling appended
to **24**, **24 unique** slugs, then *Bạn đã xem hết các tác phẩm hiện có.* — with no
page number and no total anywhere.

---

## L. Masonry and DOM order

CSS multi-column (`columns` + `break-inside: avoid`), no dependency, no JavaScript
column split. One `<ul>` in server order is distributed visually by the browser, so
assistive technology and "view source" both read the products in the order the server
returned them. Slicing the list into per-column arrays would have reordered the DOM to
match the layout, which is exactly what the linear-DOM invariant forbids.

Measured in a real browser at each viewport by counting the distinct left edges of the
laid-out cards:

| Viewport | Columns measured | Cards | Distinct heights | Page overflow |
|---|---|---|---|---|
| 1440 | **5** | 20 | 2 | none |
| 1024 | **3** | 20 | 2 | none |
| 390 | **2** | 20 | 2 | none |

DOM reading order was captured at each width and is **identical** across all three.

Images use their natural WebP ratio (`width: 100%; height: auto`); no dimension is
fabricated and no artwork is cropped to a uniform box. The only declared ratio belongs
to the empty-state placeholder, which describes nothing about a product. The
consequence is disclosed rather than hidden: without intrinsic dimensions the browser
cannot reserve space, so images cause layout movement as they load. A neutral surface
covers the gap. Fixing it properly needs derivative dimensions the contract does not
expose — recorded below as a handoff item, not silently absorbed.

`loading="lazy"` is on every card image, and `priority` on none: the rule is that
priority is for a *measured* LCP candidate, none was measured, and multi-column fill
means the first DOM item is not reliably the first visible one. Browsers fetch
in-viewport lazy images immediately, so this is correct rather than merely safe.

---

## M. Card, media and fallback

Rendered: thumbnail or placeholder, Product name, Category name. Nothing else —
`toDiscoverCard` drops `price` and `isDisplayOutOfStock` **at the boundary**, so the
components cannot leak what they never receive. No internal id, `productMediaId`,
status, timestamp or storage metadata is exposed.

The thumbnail URL is used exactly as returned: relative, same-origin, never rewritten,
never composed locally, never persisted beyond the current query result (media
associations are replaced wholesale when an operator edits a product's images, so a
stored path can outlive the object it names). `alt` is the Product name; filename and
upload metadata are never used.

When a product has no deliverable thumbnail the card shows a neutral placeholder with
an accessible label and keeps its name and category. No fabricated URL, and never the
`catalog-preview` rendition — that is a detail-page derivative.

A plain `<img>` is used rather than `next/image`, with the reason in the source:
`next/image` demands intrinsic dimensions, `APP2-B04` exposes none, and supplying them
would mean inventing a ratio and cropping every artwork to it.

Production measurement: 15/15 images loaded real bytes, every source relative and
under `/api/`.

---

## N. States

Initial loading, unfiltered empty, filtered empty (with a real link back to
`/kham-pha`), initial failure with a working refetch, continuation pending, continuation
failure with retry, and end-of-feed — all with the locked copy. `role="status"` +
`aria-live="polite"` for progress, `role="alert"` for actionable failures, `aria-busy`
on the continuation region.

No raw API message, code, request id, cursor or stack ever reaches the page; the
component test feeds a failure carrying `ECONNREFUSED 10.0.0.4:4000`, a 500 and
`INTERNAL_SERVER_ERROR` and asserts none of it renders. No fake count and no commission
CTA as an empty-state consolation.

The filtered empty state was exercised in production against the deliberately empty
`khac` category, including its *Xem tất cả* recovery.

---

## O. SEO and route honesty

Static, source-grounded metadata: title and description from the copy catalogue. **No**
canonical URL, no structured product data, no collection or search URL, and no
API-as-browser canonical — the Product Detail route is unresolved and inventing one
here would quietly lock it. Asserted in the test (`metadata` has no `alternates`, no
`/san-pham`) and in production HTML (the string `/san-pham` does not appear).

---

## P. Shell

Reused unchanged in structure. The one narrow activation: nav id `discover` → label
*Khám phá* → route `/kham-pha`, with `aria-current` when active, matched on pathname so
`?category=khan` still marks Discover as current — a category is a filter within the
area, not a different area. `StorefrontNavLink` is a small client island purely so the
active area can be marked; the header, footer and shell stay Server Components.

Collections, Studio, Commission, Journal and Search remain unrouted and inert. Their
"Sắp ra mắt" treatment is unchanged; the nav note now reads *Các khu vực còn lại sẽ sớm
ra mắt* because the original sentence became untrue once Discover shipped.

The approved 404's *Khám phá tác phẩm* recovery became a real link to `/kham-pha` and
lost its `Sắp ra mắt` tag and its "chưa khả dụng" screen-reader suffix — an available
action must not describe itself as unavailable. Three existing shell/not-found tests
asserted the old "everything unavailable" behaviour and were updated to assert the new,
narrower truth: exactly one nav link, every other item still `aria-disabled`, and no
dead anchor anywhere.

---

## Q. Responsive, accessibility and styles

Global Sass through the existing Storefront stylesheet and `@embroidery/styles`. No
Tailwind, CSS Modules, style-jsx, CSS-in-JS, inline visual styles, new tokens or new
dependency — asserted structurally, including that the feature stylesheet contains no
raw hex, no `rgb()` and no literal font size.

One `<h1>`; semantic list and articles; linear DOM order; name-derived alt; active chip
not colour-only plus `aria-current`; polite loading announcements; `role="alert"` for
actionable failures; `aria-busy` continuation; visible focus rings; ≥44px controls
(measured: zero undersized at 1440/1024/390); no forced focus or scroll after append;
no duplicate landmarks; no horizontal overflow at 390.

Reduced motion needs no handling: the feed introduces no animation or transition.

**No claim of full WCAG conformance is made.** These are the specific properties that
were measured.

---

## R. Security

Anonymous throughout. The Storefront server client forwards no cookie and its callers
must not add one; the page inspects no staff or customer cookie. No direct MinIO/S3
access, no analytics, no `dangerouslySetInnerHTML`. The boundary test asserts the
feature contains no `fetch(`, no `axios`, no hand-built `/api/public/products` path, no
`localStorage`/`sessionStorage`/Zustand/`document.cookie`, no absolute URL, no storage
or vendor reference, and no cursor decoding.

The production smoke uses **no credential**: every route under test is anonymous. The
disposable database's password is generated for the run's throwaway container, travels
file → container environment, never appears on a command line, and dies with the
container. Nothing is rotated or re-seeded.

---

## S. Tests

`pnpm --filter @embroidery/storefront test` — **17 suites, 118 tests, all passing**.
The focused S01 suite (6 suites, **65 tests**) was run **twice** with identical results.

| Suite | Tests | Covers |
|---|---|---|
| `test/unit/discover-model.test.ts` | 19 | route authority and alias refusal, contract-derived categories, URL resolution including unknown and repeated values, category-in-query-key, projection narrowing, dedupe keeping the first, cursor gating |
| `test/components/discover-category-nav.test.tsx` | 6 | five truthful choices in contract order, exact URL mapping, `aria-current`, unsupported UI02 controls absent |
| `test/components/discover-feed.test.tsx` | 12 | one collection, name/category/image only, no price or stock flag, thumbnail attributes, placeholder fallback, non-interactive cards, append/end/retry-exact-cursor, no total or page number, all three states, raw-error redaction |
| `test/components/discover-continuation-sentinel.test.tsx` | 4 | scroll-driven load, no double-fire, no observation after failure or after the last page |
| `test/smoke/discover-page.test.tsx` | 8 | SSR content, one server request, category request and current chip, not-found for unknown category, absorbed prefetch failure, empty state, `force-dynamic`, honest metadata |
| `test/boundary/product-discovery-source.test.ts` | 17 | `publicProductList` only, no `publicProductDetail`/`publicProductMediaGet`, no transport of its own, no storage/vendor/browser state, route spelled once and never as an alias, client-boundary size, one `h1`, no card destination, no inline styles, masonry contract 5/3/2, no JS column redistribution, natural ratios, touch targets, token-only styling |

Generated functions are mocked, never URLs. `@embroidery/api-client` gained 4 tests
(42 total) including one asserting that `publicProductDetail` and
`publicProductMediaGet` are **absent** from the public boundary.

---

## T. Production evidence

`pnpm smoke:app2-s01-discover:production` — **24/24 orchestration, 43/43 browser
scenarios**, run **twice** with identical results.

Topology (the accepted `APP2-T01-C1` / `APP2-B04` one, imported not reimplemented, plus
one added service): production API image from the canonical `api.Dockerfile`,
production Storefront image from the canonical `storefront.Dockerfile` `runner` stage,
disposable TLS PostgreSQL loaded from a read-only dump of the development database,
private MinIO, the real Nginx gateway.

| Runtime fact | Measured |
|---|---|
| Storefront command | `node apps/storefront/server.js` |
| Storefront `NODE_ENV` | `production` |
| Storefront bind mounts | **0** (development container had 3 — verified at entry, which is what makes 0 meaningful) |
| Storefront image | `embroidery-s01-storefront-prod:<run>`, id distinct from the dev image |
| API command / env | `node dist/main.js` / `production`, 0 mounts |
| Disposable database TLS | `ssl = on` |
| Dev database | read only (`pg_dump`, 271,712 bytes); never written |

Both upstreams were swapped and the gateway reloaded — Nginx caches each upstream
address at configuration load, so without the reload the whole run answers 502.

**Fixture.** The development database contains **no published product at all** — every
product is `DRAFT` or `ARCHIVED` — so the run seeds 24 synthetic published products
into the disposable copy across three categories, leaving `khac` empty on purpose.
Products are synthetic; **images are not**: each points at an asset whose `THUMBNAIL`
derivative really exists in MinIO, so the browser fetched real WebP bytes through the
real delivery route (15/15 loaded). Every fourth product is seeded without media to
exercise the placeholder, and `display_order` values are duplicated on purpose so the
`id` tie-breaker is exercised. This is fixture setup, not a Product command: no
readiness evaluation, no concurrency token, no Audit or Outbox row, and it is never
called publish.

Reviewed at 1440 / 1024 / 390: SSR heading and first product, unfiltered and every
category, filtered empty, thumbnail success and absence, 5/3/2 columns, variable
heights, linear DOM order, continuation to the end, no duplicate product, no price or
marketplace chrome, unsupported controls absent, truthful card destination, no
overflow, 44px controls, shell preserved. Assets: 10 `_next` resources, zero failures,
including after a hard refresh. **Zero** console errors and zero uncaught page errors.

**DRAFT removal.** With the product published, the page showed it and its media
returned 200. After moving it to `DRAFT` on the disposable copy: it disappeared from
the next authoritative request, its media path returned **404**, and a fresh page load
showed **0** matching cards — no Storefront route cache preserved it.

Two harness defects were found and fixed rather than argued away: an
`[aria-current="page"]` selector that matched the shell's Discover link before the
chip, and unpadded fixture names where *Tác phẩm thử 1* substring-matched *…10*–*…19*
and turned a visibility check into a false positive. Both were test bugs; neither was a
product defect.

No tracked Compose or Nginx file was changed, and no committed screenshot, trace or
fixture.

---

## U. Cleanup

`dev Storefront restored` and `dev API restored`; restored runtimes classified
`development` with the Storefront's 3 bind mounts back; gateway, API and Storefront all
`healthy`; the temporary override directory removed; **0** residual images and **0**
residual containers. Verified on both runs.

---

## V. Frozen artifacts

| Artifact | Value | Status |
|---|---|---|
| OpenAPI SHA-256 | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` | unchanged |
| OpenAPI shape | 16 paths / 19 operations / 34 schemas | unchanged |
| Generated client tree hash | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` | unchanged |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs | unchanged |
| Figma registry | 72 IDs / 72 node rows | unchanged |
| `pnpm-lock.yaml` | — | no diff |
| Backend, Admin, worker, schema, object storage, tracked infrastructure | — | no diff |

---

## W. Commit A evidence

```text
4051bb94ede717b8875a872679ca2e212d604e54
feat(storefront): implement product discovery feed
```

55 files changed, 3,763 insertions(+), 71 deletions(−) — the `/kham-pha` segment, the
`product-discovery` feature (12 components, 2 hooks, 6 model modules, 2 services, 1
stylesheet), 3 Storefront config modules, the `StorefrontNavLink` island, the narrow
shell and not-found activation, 6 test files plus 3 updated shell/not-found tests, the
`publicProductList` boundary export with 4 new api-client tests, 5 production smoke
tools and one root script.

---

## X. Validation

Every command below was executed; none is claimed unrun.

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront lint` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | clean |
| `pnpm --filter @embroidery/storefront test` | 17 suites / 118 tests |
| `pnpm --filter @embroidery/storefront build` | success; `/kham-pha` = `ƒ` dynamic |
| focused S01 suite, **twice** | 6 suites / 65 tests, identical |
| `pnpm --filter @embroidery/frontend-testing test` | 4 suites / 10 tests |
| `pnpm check:styles` | 4 apps / 639 files, 10 rules |
| `pnpm check:frontend-boundaries` | clean |
| `pnpm check:frontend-build-boundary` | 2,451 built files, no test code |
| `pnpm check:e2e` | 32 tests collect; Playwright pinned 1.61.1 |
| `pnpm smoke:app2-s01-discover:production`, **twice** | 24/24 + 43/43, identical |
| `pnpm check:secrets` / `check:lifecycle` | pass |
| `pnpm check:pagination-authority` + 14 tests | pass |
| `pnpm check:storefront-route-authority` + 22 tests | pass |
| `pnpm check:openapi` / `check:api-client` | artifacts unchanged |
| `pnpm check:figma-design-index` + 31 tests | 72/72 |
| `pnpm db:check:manifest` | 78 tables / 833 columns |
| `node tools/check-file-size.mjs` | pass |
| `pnpm quality` | **exit 0** |
| `git diff --check` | clean |

---

## Y. Acceptance

Every §25 rule holds. The ones worth naming: clean entry; four UI02 nodes live-audited;
the G01 integrity gate passes; the route is exactly `/kham-pha` with no alias, redirect
or dead route; 5/3/2 masonry with variable heights and linear DOM measured in a real
browser; unsupported UI02 features absent; `publicProductList` only; SSR first page;
five truthful categories; opaque keyset continuation with dedupe, exact-cursor retry
and no loop; name/category/image only; safe thumbnail fallback; non-interactive card
authority preserved; one shell, one `main`, one `h1`; global Sass and tokens only;
mobile and accessibility measured; focused tests twice; a real production Storefront
behind the gateway with real B04/T01 evidence; DRAFT removal proved; OpenAPI, generated
client, database and Figma unchanged; no backend, detail or UI03 work; two scoped
commits; clean tree; nothing pushed.

---

## Z. Handoff

```text
APP2-S01-G01 = COMPLETE — REVIEW_ACCEPTED
APP2-S01     = COMPLETE — DELIVERED_FOR_REVIEW
APP2-S02     = BLOCKED_BY_UI03_RECONCILIATION
APP2-E01     = BLOCKED_BY_APP2-S02
APP2-X01     = BLOCKED_BY_APP2-E01
```

`APP2-S02` stays blocked by the UI03 reconciliation against `261:1290` / `262:1291` /
`273:1409` / `279:1504`. When it ships it inherits a card wrapper that becomes a link
without touching the masonry, and a `publicProductDetail` operation still deliberately
withheld from the API-client boundary.

Two items are recorded rather than absorbed:

- **Derivative dimensions.** `APP2-B04` publishes no image width or height, so the feed
  cannot reserve space and images shift the layout as they load. Fixing it needs a
  contract change (dimensions on the media reference), which belongs to a backend
  checkpoint, not here.
- **Shell container width.** The approved 1200px shell container narrows UI02's
  1280px content band. Reconciling the two is a design decision about an approved APP1
  artifact, not an S01 implementation choice.
