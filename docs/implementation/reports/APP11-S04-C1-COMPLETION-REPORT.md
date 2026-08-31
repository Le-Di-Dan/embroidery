# APP11-S04-C1 — Product Breadcrumb Canonical-Category Correction — Completion Report

## A. Verdict

```text
APP11-S04-C1    = COMPLETE
APP11-S04       = COMPLETE
CORRECTION_USED = 1 / 1
NEXT_CHECKPOINT = APP11-S05
```

One finding is reported rather than resolved, because resolving it is a backend
change this correction may not make: the defect's root cause is a divergence
between the **committed OpenAPI contract** and the **persisted data**, not the
absence of a constraint the S04 report assumed. See §C and `FU-APP11-S04-C1-02`.
The correction is complete and correct either way — it is what a boundary must
do when a declared type and the running system disagree.

---

## B. Frozen S04 infrastructure

Nothing in the accepted S04 surface was reopened. Re-verified live and by gate
after the change:

```text
STOREFRONT_PUBLIC_ORIGIN validation   unchanged  (file untouched)
metadataBase                          unchanged  (file untouched)
robots.ts / robots.txt                unchanged  — GET 200, byte-identical rules
sitemap.ts / sitemap.xml              unchanged  — GET 200, 21 <loc> entries
public static sitemap inventory       unchanged  (file untouched)
50,000 final capacity invariant       unchanged  (file untouched)
private-route noindex                 unchanged  (file untouched)
Gallery BreadcrumbList                unchanged  — live JSON-LD identical
Open Graph architecture               unchanged  (file untouched)
secure-route metadata boundary        unchanged  (file untouched)
api-client sitemap export             unchanged  (file untouched)
environment wiring                    unchanged  (files untouched)
```

`git diff` touches no file under `features/storefront-seo/`, `app/robots.ts`,
`app/sitemap.ts`, `config/public-origin.ts`, `app/layout.tsx`, the compose files
or the Dockerfile.

---

## C. Defect

Recorded live in the S04 report, and reproduced before the change:

```text
Product         ao-thun-cotton
category.slug   ao-thun

S04 visible breadcrumb   Khám phá / Áo thun / Áo thun cotton
S04 BreadcrumbList[2]    item = http://embroidery.local/kham-pha?category=ao-thun

GET /kham-pha?category=ao-thun   ->  HTTP 404, noindex, public not-found surface
```

So S04 published structured navigation whose intermediate item is not a
navigable URL. That is worse than emitting no trail: it tells a crawler the
store's own navigation is broken. The S04 report routed it to `APP11-E01` /
`APP12` on the reasoning that the rendered `<nav>` had linked there since
`APP2-S02`. **That routing was wrong and the Product Owner correctly rejected
it** — S04 is what promoted a pre-existing dead link into published structured
data, so S04 owns the output.

### The root cause is not what S04 recorded

S04 stated that "a Product's category slug is not constrained to the four
`PublicProductListCategorySlug` values". Measured against the artifacts, that is
false, and the truth is more serious:

```text
packages/contracts/openapi/openapi.generated.json
  PublicCategoryResponse.slug
    { "enum": ["thu-bong", "khan", "quan-ao", "khac"], "type": "string" }

packages/api-client/src/generated/embroidery-api.schemas.ts
  PublicCategoryResponseSlug = { 'thu-bong', 'khan', 'quan-ao', 'khac' }
```

The contract declares a Product's category slug and the Discover filter as the
**same closed four-value enum**. The generated type says `ao-thun` cannot occur.
The running system disagrees:

```text
categories.slug    text NOT NULL, only uq_categories__slug  — no CHECK, no enum
categories rows    ao-thun | khac | khan | quan-ao | thu-bong      (five)
GET /api/public/products/ao-thun-cotton
  -> "category": { "slug": "ao-thun", "name": "Áo thun" }
```

So the API is emitting a value outside its own published schema, because the
persistence layer never constrained the column the contract narrowed. `APP11-S04`
trusted the declared type and dereferenced it into a URL. This correction stops
trusting it at the one boundary that publishes URLs; the divergence itself is a
backend and database-change concern outside this correction's allowed scope, and
is recorded as `FU-APP11-S04-C1-02` rather than silently absorbed
(`CLAUDE.md` §2 — contradictions are reported, not resolved in passing).

---

## D. Breadcrumb resolution rule

`apps/storefront/src/features/product-detail/model/product-breadcrumb.ts`:

```text
category slug is one of the four canonical Discover filters
  ->  Khám phá  /  <category name>  /  <product title>

anything else
  ->  Khám phá  /  <product title>
```

The membership test is `toDiscoverCategorySlug`, the **same narrowing the
`/kham-pha` route already applies** to a `?category=` value when deciding
whether to render the feed or its not-found boundary. It is now exported from
the `product-discovery` barrel and has two consumers. One predicate means a
crumb can only ever be built for a state the route will actually render, and a
contract change moves both together.

**No mapping was invented.** `ao-thun` is not rewritten to `quan-ao` or to
anything else: no repository authority defines such a mapping, and inventing a
coarse taxonomy here would be the Storefront deciding what the catalogue means.
A focused test asserts that none of the four canonical slugs appears anywhere in
the resolved trail for a non-canonical Product.

The two-level trail is truthful rather than degraded: `Khám phá` really is where
this Product was reached from, and it really does resolve.

---

## E. Visible Product breadcrumb

`DetailBreadcrumb` no longer assembles a list. It maps the resolved items:
an item with a `path` renders a `<Link>`, the item without one renders text with
`aria-current="page"` — which is the same rule as before, now expressed as a
property of the model rather than as a hand-written last `<li>`.

Preserved exactly: the `product-detail__breadcrumb` / `__crumbs` / `__crumb`
class names and every rule attached to them, the decorative drawn separator, the
touch-target minimum on crumb anchors, the `← Quay lại Khám phá` mobile back
link, and the desktop/mobile CSS swap. **No SCSS was changed** (`SCSS_CHANGED =
false`), so typography, spacing and responsive behaviour cannot have moved.

Confirmed in the browser at 1440×900: `.product-detail__crumbs` computes to
`display: flex` and `.product-detail__back-link` to `display: none` — the
desktop half of the approved swap still behaves as `APP2-S02` built it.

The only visual delta is the permitted one: three levels for a canonical
category, two otherwise. The Product's category is still shown in the identity
block (`.product-detail__category` → `Áo thun`), which has an independent,
truthful use for it — this correction removed a dead *link*, not a fact.

---

## F. `BreadcrumbList`

The route segment no longer builds its own item list. It calls the same
`resolveProductBreadcrumb`, so the rendered `<nav>` and the JSON-LD are two
consumers of one sequence rather than two lists that happened to agree — which
is precisely how the defect reached both at once.

Every emitted `item` URL is absolute, composed by `BreadcrumbJsonLd` through the
`STOREFRONT_PUBLIC_ORIGIN` authority, and — now — navigable. The final item
still carries a name and no `item` URL. The item type is `{ name, path? }`, so
there is structurally no field an id, `isIndexable`, media reference or category
id could travel in.

Gallery Detail's `BreadcrumbList` is untouched and was re-verified live.

---

## G. Live `ao-thun-cotton` evidence

Through the canonical gateway, after restarting the Storefront container (a new
module was added; the dev server does not always pick one up in place).

```text
GET /san-pham/ao-thun-cotton = 200
```

Rendered breadcrumb, server HTML:

```html
<nav class="product-detail__breadcrumb" aria-label="Đường dẫn">
  <a class="product-detail__back-link" href="/kham-pha">← Quay lại Khám phá</a>
  <ol class="product-detail__crumbs">
    <li class="product-detail__crumb"><a href="/kham-pha">Khám phá</a></li>
    <li class="product-detail__crumb" aria-current="page">Áo thun cotton</li>
  </ol>
</nav>
```

`BreadcrumbList`, parsed from the DOM as JSON (not substring-matched):

```json
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
 {"@type":"ListItem","position":1,"name":"Khám phá","item":"http://embroidery.local/kham-pha"},
 {"@type":"ListItem","position":2,"name":"Áo thun cotton"}]}
```

Browser assertions at 1440×900:

```text
visible crumbs                     ["Khám phá", "Áo thun cotton"]
breadcrumb anchor hrefs            ["/kham-pha", "/kham-pha"]   (back link + crumb)
any breadcrumb href with category= false
JSON-LD documents                  1
JSON-LD names                      ["Khám phá", "Áo thun cotton"]   == visible crumbs
h1                                 "Áo thun cotton"                 (unchanged)
identity category label            "Áo thun"                        (unchanged)
console errors                     1 — the pre-existing favicon 404 only
```

Click-through: clicking the `Khám phá` crumb navigated to
`http://embroidery.local/kham-pha`, `h1 = Khám phá`, canonical
`http://embroidery.local/kham-pha`, feed rendered with cards. There is **no
click target anywhere in the breadcrumb** to the invalid `ao-thun` category
state.

---

## H. Canonical-category branch evidence

```text
LIVE_CANONICAL_CATEGORY_PRODUCT = NOT_AVAILABLE
```

Measured, not assumed: exactly one Product is `PUBLISHED` in the dev database
(`ao-thun-cotton`), and its category is `ao-thun`. No Product data was mutated to
manufacture a live fixture.

The three-level branch is therefore proved by focused tests, driven from the
contract enum rather than transcribed slugs:

- all four canonical slugs resolve to `Khám phá / <category> / <product>`;
- the category `path` is `buildDiscoverHref(slug)` and equals
  `/kham-pha?category=<slug>`;
- the same branch, rendered end-to-end through the real page component, produces
  a three-item `BreadcrumbList` whose names equal the three visible `<li>` texts
  (`makePublicDetail()`'s category is `thu-bong`, a canonical slug — this branch
  is exercised by every pre-existing Product Detail test as well).

Non-canonical inputs proved to drop the crumb: `ao-thun`, `khong-ton-tai`, `''`,
`THU-BONG`, `thu bong`, `quan-ao-nam`.

Expressing the out-of-contract case in a test required one deliberate,
documented type conversion, isolated in a single fixture builder
(`makePublicDetailWithUncontractedCategory`) — because the generated type says
the live response cannot exist. The compiler rejecting the fixture is itself
evidence for `FU-APP11-S04-C1-02`.

---

## I. Metadata regression

Live on `/san-pham/ao-thun-cotton`, after the change:

```text
robots      index, follow                                        unchanged
canonical   http://embroidery.local/san-pham/ao-thun-cotton      unchanged
og:url      http://embroidery.local/san-pham/ao-thun-cotton      unchanged
og:title    Áo thun cotton                                       unchanged
og:type     website          og:locale  vi_VN                    unchanged
og:image    absent (this Product has no media)                   unchanged
```

`generateMetadata` was not touched by this correction — the diff to
`app/san-pham/[slug]/page.tsx` is confined to imports and the JSX call site.

S04 infrastructure re-verified live after the change:

```text
GET /robots.txt   200, rules byte-identical to the S04 report §E
GET /sitemap.xml  200, 21 <loc> entries (unchanged count and content)
Gallery Detail BreadcrumbList   identical to the S04 report §J
```

---

## J. Frozen artifacts

```text
OpenAPI            = 116 / 128 / 252   (openapi:check — artifact up to date)
generated client   = a19cb87a…         (check:generated — in sync)
migrations         = 37                (no migration written)
Admin page routes  = 25                (untouched)
Storefront pages   = 14                (build output)
apps/api           untouched
apps/worker        untouched
packages/database  untouched
Figma              untouched
dependencies       none added
```

No Product or category persistence, API or backend change of any kind. The
`ao-thun` row and the `ao-thun-cotton` Product are exactly as they were.

---

## K. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `pnpm --filter @embroidery/storefront lint` | PASS |
| `STOREFRONT_PUBLIC_ORIGIN=… pnpm --filter @embroidery/storefront build` | PASS — 14 page routes, `/robots.txt` + `/sitemap.xml` |
| `pnpm --filter @embroidery/storefront test -- test/unit/product-breadcrumb-model.test.ts` | PASS — 16 tests |
| `pnpm --filter @embroidery/storefront exec jest --testPathPatterns="seo-"` (`CMD-TEST-APP11-S04-SEO`) | PASS — 6 suites, 104 tests |
| Affected sweep: `test/smoke` · `test/boundary` · Product Detail component/model suites | PASS — 26 suites, 466 tests |
| `pnpm --filter @embroidery/api openapi:check` | PASS |
| `pnpm --filter @embroidery/api-client check:generated` | PASS |
| `node tools/check-app-scss.mjs storefront` | PASS — regression evidence; `SCSS_CHANGED = false` |
| `npx prettier --check` (changed paths) | PASS |
| targeted live HTTP + browser acceptance | PASS (§G) |

**Not run**, and why: full monorepo, full Storefront/Admin suites, API and
worker suites, DB regression, full Playwright, `APP11-E01`, historical phase
suites. No backend, worker, database, contract, Admin or generated-client code
was touched, and `VALIDATION_GOVERNANCE.md` §3 selects validation by change
impact rather than as a repository-wide aggregate.

Two files still fail `prettier --check` repository-wide and are untouched by
this correction and by S04 — `secure-design-review/ui/design-review-content.tsx`
and `test/acceptance/app10-e01-contact-handoff.acceptance.test.tsx`.

**File sizes** (this correction's files only, not a repository-wide claim):
`product-breadcrumb.ts` 104, `detail-breadcrumb.tsx` 65,
`product-breadcrumb-model.test.ts` 117, `seo-detail-metadata.test.tsx` 250,
`product-detail-fixture.ts` 116. All inside 400 / 600, and inside the 300 / 500
review thresholds.

---

## L. Files changed (git-authoritative)

**Added (2)**

```text
apps/storefront/src/features/product-detail/model/product-breadcrumb.ts
apps/storefront/test/unit/product-breadcrumb-model.test.ts
```

**Modified — source (5)**

```text
apps/storefront/src/features/product-detail/components/detail-breadcrumb.tsx
    renders the resolved items; assembles no list
apps/storefront/src/features/product-detail/index.ts
    publishes resolveProductBreadcrumb and its types
apps/storefront/src/features/product-discovery/index.ts
    publishes toDiscoverCategorySlug, the canonical membership test
apps/storefront/src/app/san-pham/[slug]/page.tsx
    JSON-LD reads the shared model; local item list and its imports removed
```

**Modified — tests (2)**

```text
apps/storefront/test/support/product-detail-fixture.ts
    makePublicDetailWithUncontractedCategory — the one documented conversion
apps/storefront/test/smoke/seo-detail-metadata.test.tsx
    both branches at the rendered page; visible-vs-JSON-LD parity
```

**Modified — docs (3)**

```text
docs/implementation/reports/APP11-S04-COMPLETION-REPORT.md   correction note; FU closed
docs/implementation/reports/APP11-S04-C1-COMPLETION-REPORT.md (this file)
docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md   roadmap
```

No SCSS. No push. No commit.

---

## M. Follow-ups

| Follow-up | Status |
|---|---|
| `FU-APP11-S04-02` — Product breadcrumb links an invalid Discover filter | **CLOSED** by this correction (§D, §G) |
| `FU-APP11-S04-01` — `STOREFRONT_PUBLIC_ORIGIN` absent from `.env` | **OPEN** — operator action; `.env` is never written by this process, and fail-closed configuration was not weakened to make an ordinary `up` succeed |
| `FU-APP11-S01-01` — Storefront favicon 404 | **OPEN** — unchanged; observed again as the only console error in §G |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` — dynamic-segment 200 | **OPEN** — unchanged, not attempted |
| `FU-APP11-B03A-01` — no gallery-asset deletion operation | **OPEN** — unchanged |

**Opened by this correction**

| New | Detail |
|---|---|
| `FU-APP11-S04-C1-01` | The `Tiếp tục khám phá` section on Product Detail still links `buildDiscoverHref(product.category.slug)` unconditionally, so on `ao-thun-cotton` it renders a second visible link to `/kham-pha?category=ao-thun`. Same defect class as the one corrected here, and it survives only because `APP11-S04-C1` §7/§20 scope this correction to "breadcrumb navigation + BreadcrumbList" and forbid unrelated Product Detail changes — removing or conditioning a visible call to action is a composition decision. It is **not** in structured data and not in the sitemap, so no crawler is misled; a visitor can still click it and reach the safe not-found. `resolveProductBreadcrumb`'s predicate is directly reusable. Recommend the Product Owner route it to `APP11-S05` or `APP11-E01`. |
| `FU-APP11-S04-C1-02` | **Contract/persistence divergence.** `PublicCategoryResponse.slug` is declared in the committed OpenAPI artifact as the closed enum `thu-bong \| khan \| quan-ao \| khac`, but `categories.slug` is an unconstrained `text` column with only a uniqueness index, the dev database holds a fifth row `ao-thun`, and the public API returns it — so the API emits responses its own published schema forbids, and every generated-client consumer is typed against a guarantee the runtime does not keep. This checkpoint may not change the backend, the database or the contract, so the Storefront now validates at its own boundary instead. The real fix is a decision between constraining the data and widening the contract, and belongs to a backend or database-change checkpoint (`08-DATABASE-CHANGE-CONTROL.md`). Owner: Product Owner to route. |

---

## N. Roadmap

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
                             APP11-S04-C1   COMPLETE

APP11-S05      NEXT
APP11-E01      NOT STARTED
APP11-X01      NOT STARTED
```

Exactly one `NEXT`. `APP11-S05` is not started.
