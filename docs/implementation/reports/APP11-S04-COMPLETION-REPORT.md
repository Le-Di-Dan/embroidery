# APP11-S04 — SEO Infrastructure — Completion Report

## A. Verdict

```text
APP11-S04            = COMPLETE (after APP11-S04-C1)
CORRECTION_USED      = 1 / 1  — APP11-S04-C1
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-S05
```

> **Correction note (`APP11-S04-C1`).** The Product Owner returned this
> checkpoint as `CORRECTION_REQUIRED` on one defect: the Product
> `BreadcrumbList` §J introduced advertised `/kham-pha?category=ao-thun`, an
> intermediate item that is not a navigable Storefront URL. It was recorded
> below as `FU-APP11-S04-02` and routed to a later phase; that routing was
> wrong — it is an S04 **output** defect, and structured data naming a page
> that does not resolve is worse than emitting none. `APP11-S04-C1` corrected
> it. Everything else in this report stands as accepted and unchanged; see
> `APP11-S04-C1-COMPLETION-REPORT.md`. Where §J describes the Product trail as
> unconditionally three levels, C1 supersedes it: three when the category is a
> canonical Discover filter, two otherwise.

Two decisions are recorded as **read** rather than as questions, because each
follows from an authority already locked and neither changes what a later
checkpoint may do. Both are stated in full where they arise (§H, §J) and
summarised in §R.

---

## B. Entry / frozen baseline

Measured, not restated:

```text
OpenAPI            = 116 paths / 128 operations / 252 schemas   (unchanged)
migrations         = 37                                          (unchanged)
Admin page routes  = 25                                          (unchanged)
Storefront pages   = 14                                          (unchanged)
Figma registry     = 532 rows, gate passes                       (unchanged)
```

`pnpm --filter @embroidery/api openapi:check` reports the committed artifact up
to date; `pnpm --filter @embroidery/api-client check:generated` reports the
generated tree in sync at hash `a19cb87a…`. No operation was added, no schema
changed, no migration written.

---

## C. Public-origin authority

```text
variable    = STOREFRONT_PUBLIC_ORIGIN     (the one locked by IMP-D050 / APP4-B05)
ownership   = server-only
fallback    = none
default     = none
```

**One variable, two consumers.** The worker has read it since `APP4-B05` to mint
absolute secure links. `APP11-S04` promotes the *same* variable into the
Storefront server runtime for `metadataBase`, every canonical URL, the sitemap
URL inside `robots.txt` and every URL inside `sitemap.xml`. No second variable
was introduced and no lookalike was repurposed: `STOREFRONT_HOST` is a bare
gateway hostname, `INTERNAL_API_BASE_URL` is the API's compose-network address,
and `STAFF_ALLOWED_ORIGINS` / `DESIGN_SESSION_ALLOWED_ORIGINS` are CSRF
allowlists that answer "may this origin call us", never "where do customers
live". The worker's source is untouched.

**Validation** — `apps/storefront/src/config/public-origin.ts`, preserving the
worker's contract clause for clause: absolute URL; `http:` or `https:` only;
host required; no credentials, query, fragment or non-root path; normalised to
`URL.origin`, which is already trailing-slash-free. It is a Storefront-local
implementation rather than a shared package because sharing it would have meant
a new workspace package or a worker source change, both outside this
checkpoint; the parity is asserted by test instead (§P), which is what keeps the
two from drifting.

**Server-only.** No `NEXT_PUBLIC_` twin exists. The consumers are
`generateMetadata`, two metadata routes and a JSON-LD builder — all server-side.
A client copy would be a second declaration of one authority.

**No memoisation.** The validator is a few string checks, and caching would mean
a corrected configuration needed a restart while a stale one kept being
published.

**Environment wiring.** `infrastructure/compose/docker-compose.dev.yml` now
passes `STOREFRONT_PUBLIC_ORIGIN: ${STOREFRONT_PUBLIC_ORIGIN:-}` to the
`storefront` service, exactly as it already did for `worker`. `.env.example`'s
existing declaration was kept and its note extended to name both consumers; no
second declaration was added.

**Operator action required — recorded, not worked around.** The repository's
`.env` does **not** currently define `STOREFRONT_PUBLIC_ORIGIN` at all (the
worker has therefore been failing closed on it too, which predates this
checkpoint). `.env` is never written by this process. Live acceptance was
performed by supplying the value to the compose invocation from the shell —
`STOREFRONT_PUBLIC_ORIGIN=http://embroidery.local node tools/docker-dev.mjs up -d
--force-recreate storefront` — which is non-destructive and repeatable. **The
operator must add `STOREFRONT_PUBLIC_ORIGIN=http://embroidery.local` to `.env`
for the dev stack to keep the value across an ordinary `up`.** Tracked as
`FU-APP11-S04-01`.

---

## D. `metadataBase`

Set in the root layout (`apps/storefront/src/app/layout.tsx`) from the validated
origin, as `generateMetadata` rather than a static object. The distinction
matters: a static `export const metadata` reads the environment the moment the
module is imported — by a component test, by a tool walking the route tree — and
turns a configuration concern into an import-time crash in places that publish
no URL. As a function it fails closed exactly where it should, at the request
that would otherwise have served a wrong canonical.

`metadataBase` is the **only** SEO field at the root, and that is the §7
boundary made structural rather than remembered — see §I.

Both pre-existing route-relative canonicals now resolve absolute, with their
route models untouched (§H).

---

## E. `robots.txt`

`apps/storefront/src/app/robots.ts` (framework metadata route). Live output:

```text
User-Agent: *
Allow: /
Disallow: /truy-cap
Disallow: /xac-minh-lien-he
Disallow: /yeu-cau
Disallow: /san-pham/*/thiet-ke

Sitemap: http://embroidery.local/sitemap.xml
```

- **Disallowed by family, not by page** — a prefix covers the pages that exist
  and the ones a later checkpoint adds beneath them, which is the failure mode
  an enumerated list has. `/yeu-cau` is derived from
  `STOREFRONT_CUSTOM_REQUEST_ROUTE` rather than written as a literal.
- **Not disallowed:** `/san-pham/*` and `/bo-suu-tap/*` as families. A `noindex`
  Product or gallery entry is still a public, readable page, and that decision
  belongs to the entity's own robots directive, per entity. Blocking the family
  would take a per-entity operator decision and apply it to every sibling.
- **`robots.txt` does not replace `noindex`.** A `Disallow` asks a crawler not to
  *fetch*; it removes nothing already indexed, and a page never fetched can never
  have its `noindex` read. All nine private routes keep their own directive.
- Exactly one sitemap, absolute. No Admin path is named — Admin is a separate
  hostname with its own document root, and naming its paths here would publish a
  map of an application this host does not serve. No environment value appears.

---

## F. `sitemap.xml`

`apps/storefront/src/app/sitemap.ts` + `features/storefront-seo/model/
sitemap-composition.ts`.

**Static URLs (7), in route-authority order** — home, Discover, its four
canonical category states, the gallery feed. The four category slugs come from
the contract enum via `DISCOVER_CATEGORY_SLUGS`, never a hand-kept list, so a
contract change is a build failure rather than a sitemap advertising a category
that 404s. `/kham-pha?category=<slug>` is the canonical address of a filtered
feed (IMP-D038); there is no `/danh-muc/[slug]`.

**Dynamic mapping** — `PRODUCT → buildStorefrontProductDetailPath`,
`GALLERY → buildStorefrontGalleryDetailPath`. No path literal, no id-based
route. The `switch` is exhaustive against the generated enum, so a third `kind`
is a compile error rather than a silently skipped entry.

**`lastModified`** — the entity's own `updatedAt`, only for dynamic entries.
Static routes carry none: `Date.now()`, the build time or the request time would
each be a freshness claim renewed on every crawl. No `priority`, no
`changeFrequency` — no canonical SEO authority in this repository sets either.

**Ordering** — static first, then `APP11-B04`'s own deterministic `kind`-then-
`slug` order, preserved rather than re-sorted. Two ordered arrays concatenated;
never object key order.

**Capacity invariant — S04 owns the final composition.** `APP11-B04-C1` caps the
*inventory* at 50 000 combined. But the API answers with entities and this app
adds seven URLs on top, so an inventory of exactly 50 000 composes into 50 007
URLs — a file that breaches the protocol with every individual check having
passed. `composeSitemap` therefore re-applies the bound to
`static + inventory` and throws `SitemapCapacityExceededError`. Proved at the
cap, one over, and at `SITEMAP_MAX_URLS` inventory, by arithmetic against
programmatically built arrays rather than fifty thousand database rows. No
truncation, no partial file, no preference between kinds, no sitemap-index or
sharding added.

**Failure propagation** — `sitemap.ts` has no `try`/`catch`. A failed inventory
read and an over-capacity composition both propagate and no file is served. This
is deliberately the opposite of every feed loader in the app: a crawler cannot
distinguish a partial sitemap from a complete one, so a static-only fallback, an
empty `<urlset>` or a stale copy would each say that real pages have been
delisted. A missing file says nothing, and nothing is the safe answer.

**Indexability is never re-checked here.** `APP11-B04` already excluded
`noindex` entities; a second rule in the consumer would be a second place for the
two to disagree.

---

## G. Curated api-client boundary

Released on a **new** `packages/api-client/src/seo.ts` barrel, re-exported from
the package root:

```text
publicSitemapEntryList              (operation)
PublicSitemapEntryResponseKind      (value — the Storefront branches on it)
PublicSitemapEntryResponse          (type)
PublicSitemapListResponse           (type)
```

It is not on the gallery barrel, which is where it had twice been reserved: the
operation answers one question spanning Catalog *and* Gallery, and filing a
cross-domain operation under either domain would make it the property of
whichever barrel noticed it first. `gallery.ts`'s two withholding notes were
updated to say where it went, and its boundary suite's "withholds every sitemap
operation" case became "keeps the sitemap family off the gallery barrel" —
asserted against that barrel's own module namespace, since the package root
re-exports both. No generated file was edited and no regeneration occurred.

---

## H. Canonical

| Surface | Canonical | Evidence |
|---|---|---|
| `/` | `http://embroidery.local` | live |
| `/kham-pha` (unfiltered) | `http://embroidery.local/kham-pha` — no category query | live |
| `/kham-pha?category=khan` | `…/kham-pha?category=khan` | live |
| the other three category states | self-canonical, one query parameter each | focused test |
| `/san-pham/[slug]` | `…/san-pham/ao-thun-cotton` | live |
| `/bo-suu-tap/[slug]` | `…/bo-suu-tap/ky-niem-duoc-giu-lai-xom5` | live |
| public `noindex` gallery entry | self-canonical retained, `noindex, follow` | live |

`FU-APP11-G01-05` is closed: `/kham-pha` now self-canonicalises and the stale
comment — which justified the missing canonical with "the Product Detail route is
unresolved (IMP-D038)" — is replaced by the real reason it was missing (no
origin existed) and the reason it now exists. Discover's layout, query behaviour
and feed are untouched.

Category canonicals are **rebuilt from the resolved selection** through
`buildDiscoverHref`, never echoed from the URL, so a tracking or pagination
parameter someone appends cannot enter the canonical. An unknown or repeated
`?category=` takes the existing not-found boundary and emits no canonical at all
(verified live: `/kham-pha?category=khong-hop-le` → HTTP 404, `noindex`, no
canonical).

Product and Gallery detail keep their route models exactly. What changed is
resolution: their canonical path still comes from the one route builder, now
composed against the configured origin. Both are emitted **absolute** rather than
left relative for `metadataBase` to resolve, so that a page's canonical, its
`og:url` and its `sitemap.xml` entry are produced by one function from one
origin and cannot disagree.

**Read recorded (1/2).** The Homepage canonical renders as
`http://embroidery.local` while its sitemap entry is `http://embroidery.local/`.
Both address the same resource and the difference is Next's own canonical
normalisation of a root path, not a value this checkpoint composed two ways.

---

## I. Open Graph — public only, by construction

Public surfaces carrying a block at S04 exit: `/`, `/kham-pha` (and its category
states), `/bo-suu-tap`, `/san-pham/[slug]`, `/bo-suu-tap/[slug]`.

Fields: `type=website`, `url`, `title`, `description`, `locale=vi_VN`, and
`images` only where a genuinely public image path exists.

**No `siteName`.** The `Xưởng Thêu` / `Nét Thêu` wordmark divergence is an open
Product Owner copy question, and `og:site_name` is precisely the field that would
settle it by accident, in published markup, without anybody deciding. Omitted
deliberately.

**The secure-route boundary is structural, not remembered.** Next merges metadata
field by field down the segment tree, so a root `openGraph` would be inherited by
every route that did not think to override it — and a route that *forgot* to opt
out would look identical, in source, to one that never needed to. `APP11-G01`
warned about exactly this. The composition is therefore inverted: the root layout
carries only `metadataBase` (URL resolution, which emits no tag), and each public
page *requests* its block through `publicPageMetadata`. A private route inherits
nothing because there is nothing to inherit. No route groups were introduced.

**Images.** Product Detail uses `media[0].url` and Gallery Detail uses
`assets[0].url` — the first already-public, publication-gated delivery path each
contract returns, in the persisted order the page itself renders, resolved
against the same origin. Nothing is queried for bytes, no storage URL is
constructed, no "primary" image is inferred from `role`, and no
`opengraph-image.ts` route was added. The live gallery `og:image` was fetched and
answers `200 image/webp`.

Where there is no canonical representative image, none is invented: the
Homepage, Discover and the gallery feed emit an OG block with no `images`. The
gallery feed specifically does **not** promote the first card's cover — the
leading card changes whenever an operator reorders the feed, so a social preview
built from it would silently re-present the collection as whatever was published
most recently. The one live indexable Product has no media at all, and correctly
emits no `og:image`.

`FU-APP11-S03-04` is closed: S03's reason for deferring was exact — an OG image
must be absolute, and without a `metadataBase` the framework would have guessed
`localhost` — and it no longer holds.

---

## J. `BreadcrumbList`

Emitted only on the two public detail pages that already draw a visible trail.
Structured data describes what the page shows, so the visible `<nav>` is the
authority: the same copy constants and the same route builders feed both.

**Product Detail — three levels**, matching its rendered trail:

```json
[{"position":1,"name":"Khám phá","item":"…/kham-pha"},
 {"position":2,"name":"Áo thun","item":"…/kham-pha?category=ao-thun"},
 {"position":3,"name":"Áo thun cotton"}]
```

**Read recorded (2/2).** The prompt's §26 sketch for Product Detail was
`Khám phá → Product title`, marked "conceptually", alongside the binding
instructions "use its accepted visible hierarchy" and "use visible breadcrumb
semantics as authority". Those two rules govern, and the delivered Product Detail
visibly renders a three-level trail including the category. The Gallery
constraint — flat, two levels, no third — is separate, explicit, and honoured.
Browser-parsed parity was confirmed on both pages: JSON-LD names equal the
visible crumb text exactly.

**Gallery Detail — two levels**, flat: `Bộ sưu tập → <entry title>`.
`NESTED_COLLECTION_WORK_MODEL = false`, so a third crumb would have to name a
grouping the data model does not have.

**Safety.** The last item carries a name and no `item` URL — it is the page the
visitor is already on, the same reason the visible crumb is text rather than a
link. The builder's input is `{ name, path }` pairs, so there is structurally no
field for `galleryEntryId`, `assetId`, `isIndexable`, `displayOrder`, a storage
key, Admin state or a customer fact; browser inspection confirmed none appears.
Serialisation escapes `<` and `&` to their unicode forms, making `</script>`
unwritable while leaving the JSON byte-equivalent for any parser — **a real
defect the focused test caught before delivery**, since the first
implementation's escape sequence was itself interpreted by the TypeScript
compiler and did nothing. No JSON-LD on private routes, none on not-found, and
no `Product`, `LocalBusiness`, `Organization`, review or rating schema anywhere.

---

## K. Private-route `noindex` matrix — live

Every route inspected through the gateway at `http://embroidery.local`:

| Route | HTTP | robots | canonical | og:* | JSON-LD |
|---|---|---|---|---|---|
| `/san-pham/[slug]/thiet-ke` | 200 | `noindex, nofollow` | none | none | none |
| `/truy-cap` | 200 | `noindex, nofollow` | none | none | none |
| `/truy-cap/bao-gia` | 200 | `noindex, nofollow` | none | none | none |
| `/truy-cap/duyet-thiet-ke` | 200 | `noindex, nofollow` | none | none | none |
| `/truy-cap/thanh-toan` | 200 | `noindex, nofollow` | none | none | none |
| `/truy-cap/thanh-toan-con-lai` | 200 | `noindex, nofollow` | none | none | none |
| `/xac-minh-lien-he` | 200 | `noindex, nofollow` | none | none | none |
| `/yeu-cau/moi` | 200 | `noindex, nofollow` | none | none | none |
| `/yeu-cau/da-gui` | 200 | `noindex, nofollow` | none | none | none |

Three of these were also opened in a real browser (`/truy-cap`, `/yeu-cau/moi`,
the Studio) and the DOM inspected for `meta[property^="og:"]`, `link[rel=canonical]`
and `script[type="application/ld+json"]`: all empty, and no head node mentions
the public origin.

**`FU-APP11-G01-07` — the five unverified routes.** Four of the five
(`/truy-cap/duyet-thiet-ke`, `/truy-cap/thanh-toan`,
`/truy-cap/thanh-toan-con-lai`, `/yeu-cau/da-gui`) were already correct and were
verified, not rewritten. The fifth, `/san-pham/[slug]/thiet-ke`, was **not**
correct and was fixed at its metadata boundary only:

- `follow` was `true`, alone among the nine. A page a crawler is told not to
  index is not a page whose outbound links it should be mining. Now `false`.
- It carried a **self-canonical**. A canonical tag is a request to index *this*
  address — the opposite of the directive beside it — and with `metadataBase` now
  set it would have resolved to a real absolute URL for a per-Product design
  tool. Removed, along with the now-unused route-builder import.

Its route, Product resolution, not-found behaviour and runtime flow are
unchanged; a focused test asserts the Product is still resolved and the title
still names it.

**Metadata secrecy.** No private route's metadata contains a token, request id,
order id, payment reference, customer contact or the public origin. These routes
resolve their subject from a URL fragment the server never sees, so there is
nothing request-shaped for a static metadata object to have captured; the static
titles (`Thanh toán`, etc.) are the accepted ones and are unchanged.

---

## L. Not-found SEO safety — measured honestly

| Surface | HTTP | robots | canonical | og:* | JSON-LD |
|---|---|---|---|---|---|
| `/san-pham/khong-ton-tai` | **200** | `noindex` | none | none | none |
| `/bo-suu-tap/khong-ton-tai` | **200** | `noindex` | none | none | none |
| `/kham-pha?category=khong-hop-le` | 404 | `noindex` | none | none | none |

The two `200`s are `FU-APP2-DETAIL-NOT-FOUND-STATUS-01`, the known
dynamic-segment transport defect re-measured rather than assumed. **S04 did not
attempt to fix it and does not claim it fixed.** The bodies remain the safe,
cause-free surfaces; only the status line is wrong.

The property S04 owed here is the one that could have regressed: adding
`metadataBase` did **not** make a canonical appear on a not-found surface. It
did not, on any of the three — verified live after the change.

---

## M. `APP11-S05` boundary

No S05 route exists and none is advertised. `/dich-vu`,
`/cau-hoi-thuong-gap`, `/cua-hang` and `/chinh-sach` are absent from the App
Router tree (boundary suite), absent from `sitemap.xml` (live output above and a
focused test), and absent from the static inventory.

**The seam S05 extends** is `features/storefront-seo/model/public-static-routes.ts`
— a small explicit array of `{ id, path }`. S05 appends its four routes there and
`sitemap.ts` is not touched. No CMS, no generic page registry, no content-page
API, no redirect runtime, no `middleware.ts`, no sitemap index, no manifest.

---

## N. Frozen artifacts — unchanged

```text
apps/api                        untouched
apps/worker                     untouched (no source change of any kind)
packages/database, migrations   untouched (37)
packages/contracts/openapi      untouched (116 / 128 / 252)
packages/api-client/src/generated  untouched (hash a19cb87a…)
Figma                           untouched (532 rows, gate passes)
Admin application               untouched (25 routes)
dependencies                    none added
```

---

## O. File size / SCSS

```text
SCSS_CHANGED = false
```

No stylesheet was added or edited — S04 is non-visual. The scoped compile gate
was run anyway because Storefront application source changed:
`node tools/check-app-scss.mjs storefront` → **PASS** (133 087 bytes CSS,
1 pre-existing deprecation warning, nothing written to disk).

Every S04 source file is well inside the 400-line limit and every test inside
600. Largest source: `public-origin.ts` at 137; largest new feature file:
`sitemap-composition.ts` at 108. Largest test: `seo-sitemap-composition.test.ts`
at 188. All are also inside the 300/500 review thresholds. This is a statement
about the files this checkpoint touched, not a repository-wide claim.

---

## P. Validation and live evidence

### `CHANGE_IMPACT`

Storefront server config, root `metadataBase`, two new framework metadata
routes, the new `storefront-seo` feature, five public route segments' metadata,
one private route's metadata boundary, one api-client barrel, and environment
wiring for a variable that already existed.

### `TESTS_RUN`

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `pnpm --filter @embroidery/storefront lint` | PASS |
| `STOREFRONT_PUBLIC_ORIGIN=… pnpm --filter @embroidery/storefront build` | PASS — `/robots.txt` and `/sitemap.xml` listed as metadata routes; 14 page routes |
| `pnpm --filter @embroidery/storefront exec jest --testPathPatterns="seo-"` (`CMD-TEST-APP11-S04-SEO`) | PASS — 6 suites, 102 tests |
| `pnpm --filter @embroidery/storefront test -- test/boundary test/smoke test/unit/seo-*` | PASS — 25 suites, 458 tests |
| `pnpm --filter @embroidery/api-client typecheck` · `lint` · `test` | PASS — 8 suites, 53 tests + 7 node:test |
| `pnpm --filter @embroidery/api openapi:check` | PASS — artifact up to date |
| `pnpm --filter @embroidery/api-client check:generated` | PASS — in sync |
| `node tools/check-app-scss.mjs storefront` | PASS |
| `node tools/check-figma-design-index.mjs` | PASS — 532 rows |
| `npx prettier --check` (changed paths) | PASS |
| `node tools/docker-dev.mjs config` | PASS — compose parses with the new `args` block |
| live HTTP + browser acceptance | PASS (below) |

Two files fail `prettier --check` repository-wide and are **untouched by this
checkpoint** — `src/features/secure-design-review/ui/design-review-content.tsx`
and `test/acceptance/app10-e01-contact-handoff.acceptance.test.tsx`. Pre-existing;
not adopted here.

### `TESTS_NOT_RUN` / `WHY_NOT_RUN`

Full monorepo, the full Storefront and Admin suites, the API and worker suites,
DB regression, the full Playwright suite, `APP11-E01`, and historical phase
suites. None is justified by this change: no backend, worker, database,
contract, Admin or generated-client code was modified, and per
`VALIDATION_GOVERNANCE.md` §3 validation is selected by change impact, never run
as a repository-wide aggregate. The Storefront `test/components` and
`test/model` directories were not run either — no component, stylesheet or
interaction model was touched.

### Negative configuration — proved without breaking the stack

Fail-closed behaviour is proved by focused tests (missing, empty, relative,
non-http, credential-bearing, query-bearing, fragment-bearing and path-bearing
values; nine lookalike variables that cannot substitute) and by one build run
with the variable removed, which exits non-zero with
`Error: STOREFRONT_PUBLIC_ORIGIN is not set.` at prerender. `.env` was never
written and no service was restarted with an invalid configuration.

That build behaviour has a deployment consequence, recorded rather than hidden:
`next build` prerenders the statically generated segments, so the root layout's
`metadataBase` is resolved at build time as well as at request time, and the
**production image build now requires the variable**. The Dockerfile's `build`
stage therefore declares `ARG STOREFRONT_PUBLIC_ORIGIN` with **no default** — a
placeholder would be the fallback the authority forbids, silently baking one
host into an image run against another — and `docker-compose.dev.yml` passes it
through `build.args`. The dev stack is unaffected: it runs `target: dev`, which
never prerenders.

### Live HTTP / browser acceptance

Through the canonical gateway, against `STOREFRONT_PUBLIC_ORIGIN =
http://embroidery.local` (public configuration; printing it is not a disclosure).

```text
GET /robots.txt   = 200  text/plain        rules and single sitemap URL as §E
GET /sitemap.xml  = 200  application/xml   21 URLs
```

The 21: the 7 static URLs, one indexable Product (`/san-pham/ao-thun-cotton`) and
13 indexable gallery entries.

Proved **absent** from the live sitemap:

- `khung-cua-go-xom5` — the `PUBLISHED` + `is_indexable = false` gallery fixture,
  confirmed against the database. It is present and readable at its own URL with
  a self-canonical and `noindex, follow` (§H) — indexability is not visibility.
- every `DRAFT` and `ARCHIVED` entity;
- `/truy-cap*`, `/yeu-cau/*`, the Studio, Admin, and every S05 route.

No published `noindex` **Product** fixture exists in the dev data (the one
published Product is indexable), so that case is covered by focused test rather
than live fixture — stated rather than claimed.

Browser (Playwright, real DOM, JSON-LD parsed not substring-matched):

- `/san-pham/ao-thun-cotton` — 1 `BreadcrumbList`, 3 absolute items, names
  identical to the 3 visible crumbs; canonical and `og:url` absolute; `og:image`
  correctly absent (no media); `robots = index, follow`.
- `/bo-suu-tap/ky-niem-duoc-giu-lai-xom5` — 1 `BreadcrumbList`, 2 levels, names
  identical to the visible crumbs and to the `<h1>`; canonical and `og:url`
  absolute; `og:image` present and fetching `200 image/webp`; no
  `galleryEntryId` anywhere in the document.
- Studio, `/truy-cap`, `/yeu-cau/moi` — `noindex, nofollow`, zero `og:*` nodes,
  no canonical, no JSON-LD, no head node naming the origin.

No Figma live-node inspection was performed: S04 is non-visual and changes no
approved composition.

---

## Q. Files changed (git-authoritative)

**Added (11)**

```text
apps/storefront/src/config/public-origin.ts
apps/storefront/src/app/robots.ts
apps/storefront/src/app/sitemap.ts
apps/storefront/src/features/storefront-seo/index.ts
apps/storefront/src/features/storefront-seo/model/public-static-routes.ts
apps/storefront/src/features/storefront-seo/model/public-page-metadata.ts
apps/storefront/src/features/storefront-seo/model/breadcrumb-json-ld.ts
apps/storefront/src/features/storefront-seo/model/robots-policy.ts
apps/storefront/src/features/storefront-seo/model/sitemap-composition.ts
apps/storefront/src/features/storefront-seo/components/breadcrumb-json-ld.tsx
apps/storefront/src/features/storefront-seo/services/sitemap-inventory.server.ts
packages/api-client/src/seo.ts
```

**Added — tests (6)**

```text
apps/storefront/test/unit/seo-public-origin.test.ts
apps/storefront/test/unit/seo-sitemap-composition.test.ts
apps/storefront/test/unit/seo-breadcrumb-json-ld.test.ts
apps/storefront/test/smoke/seo-metadata-routes.test.ts
apps/storefront/test/smoke/seo-private-metadata.test.ts
apps/storefront/test/smoke/seo-detail-metadata.test.tsx
```

**Modified — source (9)**

```text
apps/storefront/src/app/layout.tsx                      metadataBase, and only that
apps/storefront/src/app/page.tsx                        canonical + OG
apps/storefront/src/app/kham-pha/page.tsx               canonical incl. category state + OG
apps/storefront/src/app/bo-suu-tap/page.tsx             canonical + OG
apps/storefront/src/app/san-pham/[slug]/page.tsx        OG + BreadcrumbList
apps/storefront/src/app/bo-suu-tap/[slug]/page.tsx      OG + BreadcrumbList
apps/storefront/src/app/san-pham/[slug]/thiet-ke/page.tsx  metadata boundary only
apps/storefront/src/features/product-discovery/index.ts DISCOVER_CATEGORY_SLUGS as a value
packages/api-client/src/index.ts · gallery.ts           seo barrel; withholding notes
```

**Modified — tests (10)** — nine Storefront suites whose assertions this
checkpoint made obsolete, plus the api-client gallery boundary suite. Each
inverted assertion carries the reason in place; none was deleted or disabled.
While updating `homepage-source.test.ts` a **pre-existing failure** was found and
fixed: its route list had not been extended when `APP11-S03` added
`/bo-suu-tap/[slug]`, so that check had been failing since S03.

**Modified — config / docs (5)**

```text
.env.example                                   note names both consumers
infrastructure/compose/docker-compose.dev.yml  storefront env + build arg
infrastructure/docker/storefront.Dockerfile    ARG for the prerender step
docs/implementation/SCOPED_COMMAND_INDEX.md    CMD-TEST-APP11-S04-SEO
docs/implementation/phases/APP11-…-SEO.md      roadmap
```

No push. No commit.

---

## R. Follow-ups

| Follow-up | Status |
|---|---|
| `FU-APP11-G01-05` — Discover canonical + stale comment | **CLOSED** (§H) |
| `FU-APP11-G01-07` — five unverified private routes | **CLOSED** (§K) — four verified, one fixed |
| `FU-APP11-S03-04` — Gallery Detail Open Graph | **CLOSED** (§I) |
| `FU-APP11-S01-01` — Storefront favicon 404 | **OPEN** — explicitly out of S04 scope; not touched |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` — dynamic-segment 200 | **OPEN** — re-measured, not attempted (§L) |
| `FU-APP11-B03A-01` — no gallery-asset deletion operation | **OPEN** — untouched |

**Opened by this checkpoint**

| New | Detail |
|---|---|
| `FU-APP11-S04-01` | `STOREFRONT_PUBLIC_ORIGIN` is absent from the repository `.env`, so both the worker and now the Storefront fail closed on it under an ordinary `up`. The operator must add `STOREFRONT_PUBLIC_ORIGIN=http://embroidery.local`. Never written by this process (`CLAUDE.md` §8a). |
| `FU-APP11-S04-02` | **CLOSED by `APP11-S04-C1`.** Product Detail's breadcrumb — and therefore its `BreadcrumbList` — linked a category through `buildDiscoverHref(product.category.slug)` for any Catalog slug, and the live `ao-thun-cotton` produced `/kham-pha?category=ao-thun`, which Discover answers with its not-found boundary. Originally routed to `APP11-E01`/`APP12` on the reasoning that the rendered `<nav>` had linked there since `APP2-S02`; the Product Owner correctly rejected that routing, because S04 is what promoted the dead link into published structured data. A category crumb is now emitted only for the four canonical Discover filters. |

---

## S. Roadmap

```text
APP11-G01      COMPLETE      APP11-B04      COMPLETE
APP11-G01-C1   COMPLETE      APP11-B04-C1   COMPLETE
APP11-D01      COMPLETE      APP11-A01      COMPLETE
APP11-D01-C1   COMPLETE      APP11-A02      COMPLETE
APP11-B01      COMPLETE      APP11-A02-C1   COMPLETE
APP11-B01-C1   COMPLETE      APP11-S01      COMPLETE
APP11-B02      COMPLETE      APP11-S02      COMPLETE
APP11-B03      COMPLETE      APP11-S03      COMPLETE
APP11-B03-C1   COMPLETE      APP11-S03-C1   COMPLETE
APP11-B03A     COMPLETE      APP11-S04      COMPLETE

APP11-S05      NEXT
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. `APP11-S05` is not started.
