# APP11-B04-C1 — Global Sitemap Capacity Invariant Correction — Completion Report

## A. Verdict

```text
APP11-B04-C1         = COMPLETE
APP11-B04            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT      = APP11-A01
```

```text
OLD_CAP                    = 50_000 per kind
NEW_CAP                    = 50_000 total combined
PARTIAL_INVENTORY_POSSIBLE = false
```

One constant was replaced, one check moved from two halves to their sum, and the
boundary arithmetic was put under test. No wire change, no schema change, no
migration, no new operation.

---

## B. Accepted B04 contract — unchanged

Everything the Product Owner froze at `APP11-B04` is identical after this
correction:

```text
GET /api/public/sitemap-entries          unchanged
operationId publicSitemapEntry_list      unchanged
anonymous, no guard decorator            unchanged
no query parameter of any kind           unchanged
path-agnostic { kind, slug, updatedAt }  unchanged
PRODUCT  = canonical public visibility AND is_indexable    unchanged
GALLERY  = PUBLISHED AND is_indexable AND B03-renderable   unchanged
static Storefront routes excluded        unchanged
content_pages excluded                   unchanged
no full/browser URLs                     unchanged
no mutation, no write, no lock           unchanged
ordering: kind then slug                 unchanged
Cache-Control: no-store                  unchanged
```

Neither eligibility predicate was touched: this correction never entered the
Catalog or Gallery module. Both are still read through
`PUBLIC_PRODUCT_REPOSITORY.listIndexable` and
`PUBLIC_GALLERY_ENTRY_REPOSITORY.listIndexable`, and the diff proves no file
outside `modules/content` changed.

Nothing forbidden by §3 was added: no truncation, no kind preference, no
pagination, no cursor, no sitemap-index support, no second operation.

---

## C. The capacity defect, and the correction

### What was wrong

`APP11-B04` declared `PUBLIC_SITEMAP_MAX_ENTRIES_PER_KIND = 50_000` and asserted
it **twice, independently**:

```ts
this.assertWithinCap(products.length);
this.assertWithinCap(gallery.length);
```

50 000 is the sitemap protocol's per-**file** URL limit, and this operation
answers with exactly one file's worth of URLs. Checking each kind separately
therefore admitted a response every individual check called safe and the protocol
forbids:

```text
30_000 PRODUCT + 30_000 GALLERY = 60_000 URLs   -> served, 200 OK   (defect)
```

### What is authoritative now

`apps/api/src/modules/content/domain/public-sitemap.policy.ts`

```ts
export const PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES = 50_000;
```

The per-kind name no longer exists anywhere in the repository — not as an alias,
not as a deprecated re-export. A surviving second cap is a second cap someone
reads again, so it was removed rather than retired.

`apps/api/src/modules/content/application/public-sitemap.query.ts`

```ts
const FETCH_LIMIT_PER_SOURCE = PUBLIC_SITEMAP_MAX_TOTAL_ENTRIES + 1;

const [products, gallery] = await Promise.all([
  this.products.listIndexable(FETCH_LIMIT_PER_SOURCE),
  this.gallery.listIndexable(FETCH_LIMIT_PER_SOURCE),
]);

this.assertWithinCap(products.length + gallery.length);
```

```text
invariant   eligible PRODUCT + eligible GALLERY <= 50_000
success     the complete combined inventory
overflow    PUBLIC_SITEMAP_INVENTORY_TOO_LARGE -> HTTP 503, nothing partial
```

### Why the per-source bound is `total + 1`, not `total / 2`

Either kind alone may legitimately fill the entire file — 50 000 Products and no
gallery entries is a valid complete inventory — so neither source may be bounded
below the total. Asking each for `cap + 1` keeps both reads bounded (§4's
strategy exactly), leaves the only cap that matters to be decided after both have
answered, and makes overflow **detectable** rather than something the fetch bound
has already silently performed. `.slice(...)` still appears nowhere in the
feature, still asserted structurally.

Aggregate boundaries are preserved: the query still owns no visibility rule, and
no cross-context SQL was introduced for this correction.

---

## D. Mixed-kind boundary tests

`apps/api/src/modules/content/application/public-sitemap-capacity.spec.ts` (new,
166 lines) drives the real `PublicSitemapQuery` against repository fakes that
honour the `limit` they are given. No rows were seeded to prove arithmetic.

| PRODUCT | GALLERY | total | expected | result |
|---|---|---|---|---|
| 50 000 | 0 | 50 000 | success | PASS |
| 0 | 50 000 | 50 000 | success | PASS |
| 25 000 | 25 000 | 50 000 | success | PASS |
| 49 999 | 0 | 49 999 | success | PASS |
| 30 000 | 20 001 | 50 001 | 503 | PASS |
| 20 001 | 30 000 | 50 001 | 503 | PASS |
| 50 000 | 1 | 50 001 | 503 | PASS |
| 1 | 50 000 | 50 001 | 503 | PASS |
| 50 001 | 0 | 50 001 | 503 | PASS |
| 0 | 50 001 | 50 001 | 503 | PASS |

Also proved there:

- overflow **rejects** rather than resolving — there is no shorter `items` array
  a caller could read as a complete inventory, and no kind is preferred;
- each source is asked for exactly `50_001`, read back from the fake, so a future
  half-bound regression fails the suite;
- `kind`-then-`slug` ordering is unchanged across the boundary.

`apps/api/src/modules/content/presentation/public-sitemap-overflow.http.spec.ts`
(new, 120 lines) is the one bounded HTTP case: the real controller, real query
and the real envelope/exception filter on a purpose-built module — the pattern
`api-response.integration.spec.ts` established — with 30 000 + 20 001 faked rows
and no PostgreSQL. It proves the 503 status, that the body carries no `data` and
no slug of either kind, and that the business code is redacted to
`INTERNAL_SERVER_ERROR` as every 5xx on this surface must be.

The `APP11-B04` contract suite gained one structural assertion: the cap is
asserted once over `products.length + gallery.length`, `assertWithinCap` has one
call site and one definition, and `PER_KIND` appears in neither the query nor the
policy.

---

## E. Visibility and query stability

```text
QUERY_PLAN_CHANGED = false
```

No SQL changed. Only the numeric argument passed to two already-delivered
repository methods is recomputed from a renamed constant, and its value is
unchanged (`50_001`). EXPLAIN was not rerun: with identical statements and
identical bound values there is nothing for it to observe.

The `APP11-B04` index reconciliation stands as accepted:

```text
IDX-067 = content_pages, unused by B04
PRODUCT = existing IDX-065 authority
GALLERY = existing IDX-066 + indexed deliverability joins
```

```text
migrations = 37   (unchanged; no migration, no index added)
```

---

## F. OpenAPI and generated-client stability

No decorator, response class or schema changed, so nothing was regenerated.

```text
pnpm --filter @embroidery/api openapi:check
  -> OpenAPI artifact is up to date

pnpm --filter @embroidery/api-client check:generated
  -> generated client is up to date (tree hash a19cb87a...988a70)
```

Measured from the committed artifact:

```text
paths      = 116
operations = 128
schemas    = 252
```

---

## G. File-size compliance

```text
node tools/check-file-size.mjs apps/api/src/modules/content
  -> File-size check passed (0 file(s) above the review threshold).
```

| File | Lines | Limit | Threshold |
|---|---|---|---|
| `application/public-sitemap.query.ts` | 108 | 400 | 300 |
| `domain/public-sitemap.policy.ts` | 100 | 400 | 300 |
| `presentation/public-sitemap-entry.contract.spec.ts` | 317 | 600 | 500 |
| `application/public-sitemap-capacity.spec.ts` (new) | 166 | 600 | 500 |
| `presentation/public-sitemap-overflow.http.spec.ts` (new) | 120 | 600 | 500 |

No warnings. Composition unchanged:

```text
app.module.ts = 339 lines   (untouched; ContentPublicSeoModule still not named there)
```

---

## H. Validation

Change-impact scoped, per `VALIDATION_GOVERNANCE.md` §3. Commands actually run:

```text
1  npx jest --config apps/api/jest.config.mjs --rootDir apps/api src/modules/content
     -> 4 suites, 63 tests, all passed
        (B04 contract suite + the two new C1 suites + the existing content suite)
2  pnpm --filter @embroidery/api typecheck                     -> PASS (tsc --noEmit)
3  pnpm --filter @embroidery/api openapi:check                 -> PASS, artifact current
4  pnpm --filter @embroidery/api-client check:generated        -> PASS, client current
5  npx eslint src/modules/content        (in apps/api)         -> PASS, 0 problems
6  npx prettier --write <the five changed/added source files>  -> formatted, clean
7  node tools/check-file-size.mjs apps/api/src/modules/content -> PASS
8  git status --short / git diff --stat                        -> §I
```

Not run, and why: no Product or Gallery shared seam changed, so their dependency
suites were not rerun; the full monorepo, the full API suite, both frontends, the
worker suite, DB regression, Playwright, `APP11-E01` and historical phase suites
are all outside this correction's change impact and are forbidden here.

### Pre-existing failure

```text
PRE_EXISTING_FAILURE_CONFIRMED = true
B04_CAUSED_FAILURE             = false
C1_CAUSED_FAILURE              = false
```

`catalog/presentation/product-placement.contract.spec.ts` — 1 failed, 23 passed:
`the three placement operations > creates no individual side, area, media,
Template or Session operation`. An APP3-era assertion, already proved
pre-existing on the B04 baseline, and untouchable from here: C1 changed no file
in the Catalog module, and that spec's only mention of the sitemap is a prose
comment. Deliberately not repaired.

---

## I. Git-authoritative files changed

```text
M apps/api/src/modules/content/application/public-sitemap.query.ts
M apps/api/src/modules/content/domain/public-sitemap.policy.ts
M apps/api/src/modules/content/presentation/public-sitemap-entry.contract.spec.ts
M docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
M docs/implementation/reports/APP11-B04-COMPLETION-REPORT.md
A apps/api/src/modules/content/application/public-sitemap-capacity.spec.ts
A apps/api/src/modules/content/presentation/public-sitemap-overflow.http.spec.ts
A docs/implementation/reports/APP11-B04-C1-COMPLETION-REPORT.md
```

`APP11-B04-COMPLETION-REPORT.md` §H carries a superseded note and now states the
combined cap; its follow-up `FU-APP11-B04-03` was rescoped from "50 000 per kind"
to "50 000 in total across both kinds". No other historical report was touched.
`SCOPED_COMMAND_INDEX.md` needed no entry: every command above is already
indexed.

Nothing forbidden by §12 was touched — no schema, no migration, no Figma, no
frontend, no `sitemap.ts`, no `robots.ts`, no worker, no content-page or redirect
runtime, no second HTTP operation, no unrelated cleanup. Not committed, not
pushed.

---

## J. Roadmap

```text
APP11-G01      COMPLETE
APP11-G01-C1   COMPLETE
APP11-D01      COMPLETE
APP11-D01-C1   COMPLETE
APP11-B01      COMPLETE
APP11-B01-C1   COMPLETE
APP11-B02      COMPLETE
APP11-B03      COMPLETE
APP11-B03-C1   COMPLETE
APP11-B03A     COMPLETE
APP11-B04      COMPLETE
APP11-B04-C1   COMPLETE
APP11-A01      NEXT
later          NOT STARTED
```

Exactly one `NEXT`. `APP11-A01` is not started.
