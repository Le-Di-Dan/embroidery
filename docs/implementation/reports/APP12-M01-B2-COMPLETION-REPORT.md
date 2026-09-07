# APP12-M01.B2 — Published Product media curation authority

`APP12-M01.B2 = COMPLETE`

Internal work package inside the single `APP12-M01` checkpoint. Not a new APP12
checkpoint id. Nothing was pushed, nothing was deployed, no `APP12-G03` data was
created, no Admin or Storefront UI was touched, no Figma artifact was changed,
and the shared development database was not written to.

---

## A. Verdict

A published Product's images could not be corrected at all. `APP2-B02`'s patch is
locked to `DRAFT` by `PRODUCT_EDITABLE_STATES`, so the only route to a new
photograph was unpublish → edit → republish — which takes the Product off
Discover, drops its address out of the catalog, and is visible to every customer
browsing at that moment.

B2 adds exactly one bounded operation:

```text
PUT /api/admin/products/{productId}/media    adminProductMedia_replace
```

and widens nothing else. `PRODUCT_EDITABLE_STATES` is untouched, so every generic
Product field — title, description, category, price, SKU, inventory, shipping,
publication status — remains as locked in `PUBLISHED` as `APP2-B02` left it. The
exception is one file, one route and one body, not a state list quietly widened
inside a shared handler.

The ordered array is the entire write model. `mediaAssetIds[0]` is the primary,
array order is display order, an omitted id is removed. There is no `isPrimary`,
no `role`, no `position`, and no separate add / remove / reorder / set-primary
endpoint — so no request can describe a selection with two primaries or a gap.

```text
NEW HTTP PATHS       1
NEW HTTP OPERATIONS  1
NEW REQUEST SCHEMAS  1
NEW RESPONSE SCHEMAS 0     (reuses AdminProductDetailResponse)

OpenAPI paths       126 -> 127
OpenAPI operations  139 -> 140
OpenAPI schemas     278 -> 279
public operations    49 ->  49
```

No migration. No new table, column, index, trigger or constraint.

---

## B. DB1 PO reconciliation

Nothing `DB1` or `B1` established was reopened or weakened.

| Authority | State after B2 |
|---|---|
| `MAX_PRODUCT_MEDIA_ITEMS = 20` | unchanged, and now read by a **fifth** consumer — the new request DTO — from the same constant |
| `UNIQUE(product_id, asset_id)` | unchanged; the duplicate refusal happens in the domain before a row is written |
| `UNIQUE(product_id, display_order)` | unchanged; positions are still assigned `0..N-1` from array order |
| `display_order ∈ [0,19]` | unchanged |
| position 0 ⟺ `THUMBNAIL` | unchanged; the write still derives the role from position, never from the client |
| domain: contiguous `0..N-1`, count ≤ 20 | unchanged — B2 calls the **same** `ProductMediaSelection.resolve`, not a copy |
| migrations = 39, DB tables = 79 | unchanged; no `0040` exists |
| B1: stored eligible primary wins, else first eligible ordered | unchanged — no read-path file was touched |
| B1: public `GET`/SEO never mutates `product_media` | unchanged |
| B1: Product Detail stage = `CATALOG_PREVIEW`, strip = `THUMBNAIL` | unchanged |
| public operations = 49 | unchanged; the addition is Admin-only |

The DB1 constraint smoke and the DB1 cap suite were both re-run green (§T).

**One DB1 authority is now the write side of B1's read side.** B1 made the four
public surfaces agree about the effective primary by *reading* — a stored primary
that has become undeliverable falls back to the first eligible ordered image.
B2's set-primary is a *write*: the stored `THUMBNAIL` row actually moves. §K
asserts the stored rows, not just the projected answer, precisely so the two are
not confused.

---

## C. Published-media business authority

The rule B2 owns, stated once:

```text
a PUBLISHED Product may change which images it shows, and nothing else
```

Four consequences, each enforced rather than documented:

1. **`PRODUCT_MEDIA_CURATION_STATES = [DRAFT, PUBLISHED]`** — declared in
   `product-publication.policy.ts` beside the publication state lists, and used
   by exactly one use case. `PRODUCT_EDITABLE_STATES` (`[DRAFT]`) is untouched,
   so no other write gained `PUBLISHED`.
2. **`ARCHIVED` is refused.** An archived Product has no public surface to
   curate and its lifecycle is still deferred
   (`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`); a media write there would edit a
   retired row no reader can see. It answers `409 PRODUCT_NOT_EDITABLE`.
3. **No auto-unpublish.** An invalid selection on a published Product is refused
   whole. The Product is never quietly demoted to `DRAFT` to make the write
   succeed.
4. **No silent narrowing.** An ineligible Asset is never dropped from the set to
   save the remainder. All of it lands or none of it does.

---

## D. State matrix

| Product state | Empty selection | 1..20 valid | ineligible member | > 20 / duplicate |
|---|---|---|---|---|
| `DRAFT` | **PASS** (clears) | **PASS** | **PASS** — DRAFT eligibility is `ACCEPTED` in the catalog lane, as `APP2-B02` always allowed | REFUSE |
| `PUBLISHED` | REFUSE `PRODUCT_MEDIA_NOT_PUBLISHABLE` | **PASS** | REFUSE | REFUSE |
| `ARCHIVED` | REFUSE `PRODUCT_NOT_EDITABLE` | REFUSE | REFUSE | REFUSE |

DRAFT is deliberately **not** made stricter (§20 of the package). A DRAFT
legitimately holds an accepted image whose derivatives the worker has not
finished producing; that is what the publication readiness gate is for, and
moving the check earlier would block an operator from assembling a gallery while
the worker is still running. Proved live in §T ("accepts an asset a published
product could not carry").

---

## E. Endpoint / OpenAPI contract

```text
PUT /api/admin/products/{productId}/media
operationId  adminProductMedia_replace
success code PRODUCT_MEDIA_REPLACED
```

`PUT`, not `PATCH`: the body carries the complete intended selection, so the
request is idempotent and replaying it is safe.

The operation id is **derived**, not declared — `AdminProductMediaController` +
`replace` under the `APP0-B01` policy — so no `CONTROLLER_DOMAIN_KEYS` entry is
owed and a future file-layout decision cannot rename a public identifier.

Request (`ReplaceProductMediaBody`, the one new schema):

```jsonc
{
  "expectedUpdatedAt": "2026-09-07T03:12:44.512Z",   // required
  "mediaAssetIds": ["asset-primary", "asset-2"]      // required, maxItems 20
}
```

`additionalProperties: false`. `mediaAssetIds` is **required**, not optional: an
absent array would have to mean either "clear the selection" or "change
nothing", and neither reading is safe to guess. `[]` is the explicit clear.

`maxItems` is rendered from `MAX_PRODUCT_MEDIA_ITEMS`, so a client reading the
schema and a service refusing the request cannot disagree about the number. The
generated client carries `mediaAssetIds: string[]` with `@maxItems 20` and no
role, position or primary field.

Response: `AdminProductDetailResponse` — the same payload `adminProduct_detail`
returns, carrying the new ordered selection and the new `updatedAt` token. That
is why the schema count moved by exactly one.

Refusals:

| Status | Code | Cause |
|---|---|---|
| 400 | *(platform validation)* | malformed body, unknown field, more than 20 ids |
| 400 | `PRODUCT_MEDIA_DUPLICATE` | the same Asset twice |
| 400 | `PRODUCT_MEDIA_ASSET_NOT_FOUND` | unknown id, or an Asset outside the catalog-media lane |
| 401 | — | no live Admin session |
| 403 | — | origin outside the Admin allowlist |
| 404 | `PRODUCT_NOT_FOUND` | no such Product |
| 409 | `PRODUCT_NOT_EDITABLE` | `ARCHIVED`, or any state not in the curation set |
| 409 | `PRODUCT_VERSION_CONFLICT` | stale `expectedUpdatedAt` |
| 409 | `PRODUCT_MEDIA_ASSET_UNAVAILABLE` | an Asset that is not `ACCEPTED` (rejected, tombstoned) |
| 409 | `PRODUCT_MEDIA_NOT_PUBLISHABLE` | the set cannot stand on a published Product |
| 415 | — | body is not `application/json` |

`PRODUCT_MEDIA_NOT_PUBLISHABLE` is the one new error code. It carries the
unsatisfied media requirement codes in the platform's `errors` array — a closed
set of literals the feature owns, never a row value — so a client learns *which*
of the three rules failed without a second request. No copy is hard-coded in the
controller; `M01.A1` owns the Vietnamese mapping later.

---

## F. Application-service design

One use case, `ReplaceProductMediaUseCase`
(`application/replace-product-media.use-case.ts`, 235 lines).

Dependencies, and what they deliberately are not:

```text
ProductDraftRepository        replaceMedia · updateGuarded · findMedia
ProductPublicationRepository  lockSnapshot
AssetRepository               lockScopedByIds · lockDerivativesFor
ProductMediaSelection         the APP2-B02 ordering/eligibility authority
TransactionManager

no Audit recorder · no Outbox · no SKU · no inventory · no shipping
no payment · no order · no Gallery · no object storage · no network
```

`CatalogProductMediaModule` composes exactly those, which is what makes
"media-only" reviewable in one file: the seam is structurally incapable of
reaching a commercial fact.

`ProductPublicationRepository.lockSnapshot` is **reused** rather than
reimplemented. It locks the Product root `FOR UPDATE` and its category and
current media `FOR SHARE` — exactly the rows this decision depends on — and it
is the same seam the publish transaction takes, so a media curation and a
publish racing over one Product serialise on the same row lock whichever
operation the two writers chose.

The controller owns the HTTP contract and nothing else. There is no validation
in it beyond the DTO, and one translation point from `ProductDraftError` to the
canonical exception.

**One eligibility model, not two.** Published viability runs
`evaluatePublicationReadiness` — the same pure evaluator the publish transaction
runs — over the *requested* links rather than the stored ones, and then filters
the verdict to `PRODUCT_MEDIA_PUBLICATION_REQUIREMENT_CODES`. Writing that as a
filter over one verdict, rather than as a second evaluator over the same facts,
is what makes "publish and media curation agree about an image" a structural
property instead of two functions that must be kept in step by inspection.

---

## G. Publication-viability validation

The three requirements a `PUBLISHED` selection must satisfy, all evaluated by
existing `APP2-B03` code:

```text
PRODUCT_MEDIA_READY              non-empty, contiguous 0..N-1, THUMBNAIL at 0
PRODUCT_MEDIA_ASSETS_READY       CATALOG_MEDIA · PRODUCTION_SENSITIVE ·
                                 ACCEPTED · not tombstoned
PRODUCT_MEDIA_DERIVATIVES_READY  THUMBNAIL and CATALOG_PREVIEW both READY,
                                 unwatermarked, with a durable storage key
```

**Four requirements are deliberately excluded**, and the exclusion is the
contract as much as the inclusion. `PRODUCT_NAME_READY`,
`PRODUCT_DESCRIPTION_READY`, `PRODUCT_PRICE_READY` and `PRODUCT_CATEGORY_READY`
are already true of a published Product, and none is a fact a media write can
change. The category one matters: a category can be archived *after* publication,
and such a Product is exactly the one an operator most needs to be able to fix an
image on. Refusing a photograph correction because of an unrelated category
problem would turn a lifecycle problem into an image problem.

Both Asset reads are **batched and locking**: a twenty-image curation costs two
statements, and an Asset cannot be rejected or a derivative regenerated between
the check and the commit. An empty selection short-circuits both reads rather
than issuing a query for no ids — `PRODUCT_MEDIA_READY` already fails on it, and
that is the honest requirement to report for "a published product must keep at
least one image".

The storage *key* is read only to confirm it exists. No object-storage call is
made anywhere in this path, and no key, bucket or locator reaches a response.

---

## H. Concurrency and atomicity

One transaction, in this order:

```text
1  lockSnapshot           Product FOR UPDATE, category + media FOR SHARE
2  state check            PRODUCT_MEDIA_CURATION_STATES, against the locked row
3  token check            updatedAt == expectedUpdatedAt, against the locked row
4  selection resolve      count · duplicates · lane · existence · ACCEPTED,
                          with the Assets locked FOR SHARE
5  published viability    §G, if and only if status = PUBLISHED
6  updateGuarded          identity + allowed states + exact token, one statement,
                          fields = {} so only updated_at is written
7  replaceMedia           delete + insert the whole selection
8  findMedia + project    read back, commit
```

Steps 2 and 3 are the package's stated order. Step 6 issues the guarded UPDATE
**before** the rows are rewritten. Both orders are safe inside one transaction,
but this one is strictly stronger: a writer that has already lost the concurrency
race never deletes a media row at all, rather than deleting it and relying on the
rollback.

`fields = {}` is what makes "media-only" provable rather than promised — the
statement can write `updated_at` and nothing else. The row is still touched
because `updated_at` is the concurrency token for the whole Product; a media
replacement that left it alone would let a stale field write land afterwards.

Any failure at any step rolls the whole transaction back: the old selection, the
status, and every commercial field are exactly as they were. §M proves that
against the stored rows rather than against the response.

---

## I. Dead `attachMedia` disposition

**Removed** — port method and adapter implementation.

`ProductRepository.attachMedia` was a DB7 seam sketch: a **per-row append**, one
call, one Asset, one role. A repository-wide search found no caller anywhere in
`apps/`, `packages/` or the test tree; the only remaining references were the
port declaration, the adapter, and documentation.

`APP12-M01.DB1` then made it structurally unusable, which is why leaving it would
have been worse than removing it. It wrote `display_order = 0` unconditionally,
so under `uq_product_media__product_display_order` a second call for the same
Product always fails, and under `ck_product_media__primary_role_at_zero` a first
call with any role but `THUMBNAIL` also fails. It could only ever have succeeded
once per Product, for the primary image — a shape a future caller could
reasonably have reached for and then discovered was a dead end at the twenty-first
insert.

The ordered whole-selection replacement (`ProductDraftRepository.replaceMedia`)
is the single media-write authority, used by the `APP2-B02` draft patch and by
`adminProductMedia_replace`. `docs/database/DB7_REPOSITORY_CONTRACTS.md` records
the retirement and the reason, in the DB7 document itself rather than only here.

No other DB7 port method was touched. The unused `newId` import the removal
orphaned in the adapter was dropped with it.

---

## J. Live PUBLISHED reorder journey

Disposable production-like world: the real `AppModule`, the real
`AuthenticatedAdminGuard`, a real Admin session cookie, a **disposable**
PostgreSQL carrying migrations `0000–0039`. Every Product reaches `PUBLISHED`
through the delivered patch-and-publish path, never a fixture that writes a
status column — so no journey can prove itself with a Product that B2 itself put
into `PUBLISHED`.

```text
before  [A, B, C]      A=THUMBNAIL/0  B=GALLERY/1  C=GALLERY/2
PUT     [A, C, B]      200 PRODUCT_MEDIA_REPLACED
after   [A, C, B]      A=THUMBNAIL/0  C=GALLERY/1  B=GALLERY/2

product status  PUBLISHED throughout
unpublish/republish steps  0
```

Asserted against `product_media` directly, row by row — `asset_id`, `role` and
`display_order` — not against the response body.

---

## K. Live set-primary journey

```text
before  [A, C, B]
PUT     [C, A, B]      200
after   C = THUMBNAIL / display_order 0
        A = GALLERY   / 1
        B = GALLERY   / 2
```

The **stored** `THUMBNAIL` row moved. That is the distinction from B1: B1's
effective primary is a read-side answer that can differ from storage when the
stored primary becomes undeliverable, and this is the write that changes storage
itself. Changing `mediaAssetIds[0]` *is* the set-primary operation; there is no
second endpoint and no flag.

Product status `PUBLISHED` before and after, with no lifecycle transition
recorded.

---

## L. Live remove-primary journey

```text
before  [C, A, B]
PUT     [A, B]         200
after   A = THUMBNAIL / 0
        B = GALLERY   / 1
```

Explicit write intent, not B1's read-side fallback: `C`'s row is gone from
`product_media`, and `A` carries the `THUMBNAIL` role in storage. `C`'s Asset,
its derivatives and its stored objects are untouched — this table holds the
association, never the media.

The same suite also drives `1 → 20 → 1`: a single image grows to a full
twenty-image gallery at `0..19` and shrinks back to one, all while `PUBLISHED`.

---

## M. Invalid-write preservation proof

Nine refusals, each proved the same way, by one shared helper so no case can
quietly assert less than another: the request fails, **and** `product_media` is
row-for-row what it was, **and** the nine commercial columns are identical, **and**
the status is still `PUBLISHED`.

```text
PUBLISHED + []                           409 PRODUCT_MEDIA_NOT_PUBLISHABLE
PUBLISHED + rejected Asset               409 PRODUCT_MEDIA_ASSET_UNAVAILABLE
PUBLISHED + tombstoned Asset             409 PRODUCT_MEDIA_ASSET_UNAVAILABLE
PUBLISHED + missing CATALOG_PREVIEW      409 PRODUCT_MEDIA_NOT_PUBLISHABLE
                                             errors[0].code =
                                             PRODUCT_MEDIA_DERIVATIVES_READY
PUBLISHED + duplicate Asset              400 PRODUCT_MEDIA_DUPLICATE
PUBLISHED + 21 Assets                    400 (published maxItems)
PUBLISHED + unknown Asset id             400 PRODUCT_MEDIA_ASSET_NOT_FOUND
PUBLISHED + stale expectedUpdatedAt      409 PRODUCT_VERSION_CONFLICT
ARCHIVED  + a valid READY Asset          409 PRODUCT_NOT_EDITABLE

each:  stored media unchanged (row for row)
       name · slug · description · category_id · base_price_amount ·
       currency_code · status · display_order · archived_at   unchanged
       status still PUBLISHED (ARCHIVED case: still ARCHIVED)
```

The rejected-Asset fixture deliberately carries **both** derivatives: it must be
refused for its *status*, and an Asset that also happened to be missing a
derivative would not prove which rule did the refusing.

The stale-token case makes a legitimate write first and then replays the original
token, so "stale" is a real lost race rather than a fabricated timestamp; the
"unchanged" comparison is taken after that winning write, because unchanged must
mean unchanged from the state the refused request actually met.

---

## N. Public read consistency

After a successful set-primary on a `PUBLISHED` Product, with no unpublish step:

```text
GET /api/public/products/{slug}       media[0].url  contains C's association id
                                      media[1].url  contains B's
                                      media[2].url  contains A's
GET /api/public/products              thumbnail.url contains C's association id
product_media                         C = THUMBNAIL / 0
```

`og:image` and JSON-LD `image[0]` are not separate reads and have no separate
authority to disagree with. `apps/storefront/src/app/san-pham/[slug]/page.tsx`
derives both from the same projected value:

```text
og:image      product.media[0].url
JSON-LD image product.media.map((item) => item.url)   → image[0] = media[0].url
```

So the chain is: stored primary → public detail `media[0]` → Discover card,
`og:image` and JSON-LD `image[0]`. The API half is proved live above; the
derivation half is proved by the seven Storefront `seo-*` suites, re-run green
(§T). No cache architecture was added, and B1's rendition policy — stage
`CATALOG_PREVIEW`, strip `THUMBNAIL` — is untouched.

---

## O. Commercial-isolation proof

Three independent guarantees, not one:

1. **Structural.** `CatalogProductMediaModule` composes two Catalog persistence
   ports and the Asset boundary. It cannot inject a SKU, inventory, shipping,
   payment, order or Gallery dependency, so the seam has nothing to reach.
2. **Statement-level.** `updateGuarded` is called with `fields: {}`. The emitted
   UPDATE sets `updated_at` and nothing else — there is no branch in which a
   commercial column appears in the statement.
3. **Observed.** Every refusal case above compares nine commercial columns before
   and after, and every success journey re-reads the Product and finds it still
   `PUBLISHED` with its price and category intact. The 20-image journey also
   leaves the Product buyable: no SKU, stock or reservation row is read or
   written on this path.

`PRODUCT_EDITABLE_STATES` remains `[DRAFT]`. The generic `APP2-B02` patch was not
broadened, still refuses a `PUBLISHED` Product for every field, and still accepts
`mediaAssetIds` for `DRAFT` — both paths reusing the same
`ProductMediaSelection`, so the two can never disagree about ordering or the cap.
`adminProductMedia_replace` is the canonical media-only authority `M01.A1` will
consume.

---

## P. Generated client

```text
pnpm --filter @embroidery/api openapi:generate   127 paths · 140 operations · 279 schemas
pnpm --filter @embroidery/api openapi:check      up to date
pnpm --filter @embroidery/api-client generate    2 files · 10 368 lines
                                                 tree hash bc52dada…52ec58
```

Published to the client as:

```ts
export interface ReplaceProductMediaBody {
  expectedUpdatedAt: string;
  /** @maxItems 20 */
  mediaAssetIds: string[];
}
export const adminProductMediaReplace = (...)
```

Asserted, not assumed: `admin-product-media.contract.spec.ts` reads the committed
artifact and the generated file and checks the declaration contains
`mediaAssetIds: string[]` and matches none of `isPrimary`, `role`, `position` or
`displayOrder`.

No handwritten TanStack Query hook was added — the Admin UI is `M01.A1`'s.

---

## Q. Historical DB-test debt note

```text
HISTORICAL_DB_BASELINE_TEST_DEBT = PRE_EXISTING
```

`DB1` recorded 22 failures across 9 `@embroidery/database` suites carrying stale
per-era migration and table-count baselines, red at the entry HEAD and unrelated
to product media. B2 did not absorb that cleanup and did not run the full
database package to rediscover it. Only the DB1 constraint smoke was run, scoped
(§T). The debt must be reconciled before the final APP12 release/closure quality
gate; it is not a B2 blocker.

**A second pre-existing failure, found and proved not to be B2's.**
`test/acceptance/app6-e01/e01-01-catalog-happy-path.acceptance.spec.ts` reports 9
failures. Verified by stashing every change and re-running it on the clean tree
under its own config (`jest.app6-e01.config.mjs`): **the same 9 failures**, same
names. It appears in the scoped run above only because the default config's path
pattern matches `catalog`. Recorded rather than fixed — it is not B2's to repair.

**Two frozen baselines legitimately moved and were updated.**
`admin-category.contract.spec.ts` and `public-category.contract.spec.ts` each
assert a total operation count, which B2's single new operation takes from 139 to
140. Both were updated with the reason recorded in the comment, and — the number
that actually guards those surfaces — **both still assert 49 public operations**,
unchanged.

---

## R. Files changed

**New (7)**

```text
apps/api/src/modules/catalog/application/replace-product-media.use-case.ts
apps/api/src/modules/catalog/catalog-product-media.module.ts
apps/api/src/modules/catalog/presentation/admin-product-media.controller.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product-media.request.ts
apps/api/src/modules/catalog/presentation/admin-product-media.contract.spec.ts
apps/api/test/integration/admin-product-media-curation.integration.spec.ts
apps/api/test/support/product-media-curation-fixture.ts
```

**Modified (14)**

```text
apps/api/src/bootstrap/app.module.ts                     register the module
apps/api/src/modules/catalog/domain/product-publication.policy.ts
                                                         curation states +
                                                         media requirement subset
apps/api/src/modules/catalog/domain/product-publication.readiness.ts
                                                         unsatisfiedMediaRequirements
apps/api/src/modules/catalog/domain/product-draft.errors.ts
                                                         PRODUCT_MEDIA_NOT_PUBLISHABLE
apps/api/src/modules/catalog/domain/product-draft.errors.spec.ts   its status
apps/api/src/modules/catalog/domain/repositories/product.repository.ts
                                                         attachMedia removed
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product.repository.ts
                                                         attachMedia removed
apps/api/src/modules/catalog/presentation/admin-category.contract.spec.ts   139 -> 140
apps/api/src/modules/catalog/presentation/public-category.contract.spec.ts  139 -> 140
packages/contracts/openapi/openapi.generated.json        generated
packages/api-client/src/generated/embroidery-api.ts      generated
packages/api-client/src/generated/embroidery-api.schemas.ts  generated
docs/database/DB7_REPOSITORY_CONTRACTS.md                attachMedia retirement
docs/implementation/SCOPED_COMMAND_INDEX.md              2 new scoped commands
```

No Admin file, no Storefront file, no SCSS, no Figma artifact, no migration.

---

## S. File-size

`node tools/check-file-size.mjs --paths <every changed .ts, excluding generated>`

```text
Scoped file-size check passed (16 files, 1 above the review threshold).
```

New files, against 400 source / 600 test:

```text
replace-product-media.use-case.ts                235
admin-product-media.controller.ts                127
admin-product-media.contract.spec.ts             156
catalog-product-media.module.ts                   47
admin-product-media.request.ts                    43
admin-product-media-curation.integration.spec.ts 431
product-media-curation-fixture.ts                226
```

The one review-threshold entry is `app.module.ts` at 376 lines (limit 400, review
300) — already above the threshold before this package, which added six lines to
it. Not split here: the composition root is a single ordered import list whose
order is itself contract, and B2 does not own its decomposition.

The repository-wide sweep still reports its historical debt, including one hard
FAIL in `drizzle-product-placement.repository.ts` (442 lines) that B2 does not
touch. Per `CMD-CHECK-FILE-SIZE`, that sweep is not a checkpoint gate.

---

## T. Validation

Change-impact only. Every command was run; results are quoted, not summarised.

```text
git diff --check                                                       clean
tsc --noEmit      @embroidery/api                                      clean
eslint            @embroidery/api (src + test) --max-warnings=0        clean
prettier --check  every changed file                                   clean

pnpm --filter @embroidery/api openapi:generate    127 paths · 140 operations · 279 schemas
pnpm --filter @embroidery/api openapi:check       up to date
pnpm --filter @embroidery/api-client generate     up to date · tree hash bc52dada…52ec58

pnpm --filter @embroidery/api exec jest \
  --testPathPatterns="catalog|product-media|product-publication|release-gate|product-draft" \
  --runInBand
      Test Suites: 1 failed, 56 passed, 57 total
      Tests:       9 failed, 807 passed, 816 total
      the 9 are APP6-E01-01, pre-existing — proved on the clean tree (§Q)
      includes the release-gate contract suite: public operations still 49

CMD-TEST-APP12-M01-B2-CONTRACT
pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-product-media"
      Test Suites: 1 passed        Tests: 9 passed

CMD-TEST-APP12-M01-B2-CURATION
pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand \
  --runTestsByPath test/integration/admin-product-media-curation.integration.spec.ts
      Test Suites: 1 passed        Tests: 20 passed

DB1 focused smoke (constraints, cap, no 0040)
pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand \
  --runTestsByPath test/integration/product-media-cap.integration.spec.ts
      Tests: 4 passed
pnpm --filter @embroidery/database exec jest --testPathPatterns="product-media-invariants"
      Test Suites: 1 passed        Tests: 14 passed
ls packages/database/migrations/*.sql | wc -l                          39
migrations matching 0040*                                              0

B1 public-consistency chain
pnpm --filter @embroidery/storefront exec jest --testPathPatterns="seo-"
      Test Suites: 7 passed        Tests: 133 passed

node tools/check-storefront-route-authority.mjs                        pass
node tools/check-file-size.mjs --paths <changed .ts, non-generated>     pass
node tools/check-report-secrets.mjs                                     pass
```

The full `@embroidery/database` package was **not** run: `DB1` already recorded
its known stale-baseline failures, and re-running it would only rediscover them
(§Q). No E2E tier was run — B2 introduces no UI and no browser-visible route.

No i18n gate was needed: no user-facing Vietnamese string was added. The one new
error message is server-side English in the existing safe-error contract, which
`M01.A1` maps.

---

## U. Hygiene

```text
shared_dev_mutations   0     every suite runs on a disposable database whose
                             harness refuses the persistent database by name
G03_data_created       false
production_deployed    false
pushed                 false
migration 0040         absent
Admin UI               unchanged
Storefront UI          unchanged
Figma                  unchanged
.env                   not read, not written
credentials            none; every fixture password is synthetic
storage keys           none in any response, log or report
```

No drag-and-drop, no compact grid, no set-primary control, no visible counter, no
asset-picker change, no SKU-specific imagery, no order image snapshot. Those
belong to `M01.D1`, `M01.A1` and `M01.S1`.

---

## V. Baseline

```text
OpenAPI paths        126 -> 127
OpenAPI operations   139 -> 140
OpenAPI schemas      278 -> 279
public operations    49        unchanged
new HTTP paths       1
new HTTP operations  1
new request schemas  1
new response schemas 0

migrations           39        unchanged (no 0040)
DB tables            79        unchanged
Admin routes         26        unchanged
Storefront routes    20        unchanged
Figma                          unchanged
ROADMAP_CHECKPOINTS  39        unchanged
```

---

## W. M01 internal roadmap

```text
APP12-M01.A   COMPLETE — PO PASS
APP12-M01.B1  COMPLETE — PO PASS
APP12-M01.DB1 COMPLETE — PO PASS
APP12-M01.B2  COMPLETE

APP12-M01     IMPLEMENTATION_IN_PROGRESS

INTERNAL_NEXT = M01.D1   (not executed)
M01.D1 / M01.A1 / M01.S1 / M01.E1   NOT_AUTHORIZED
APP12-G03                           NOT_AUTHORIZED
```

Not executed here, and explicitly still owned by later packages: the Admin
compact media grid and its design package, the set-primary control,
drag-and-drop, the visible Product Detail counter, per-SKU imagery and order
image snapshotting.

Two items for the PO when sequencing `M01.D1`:

1. The Admin surface `M01.A1` will build against is complete and typed — the
   generated `adminProductMediaReplace` operation takes the ordered array and the
   concurrency token, and answers with the same detail payload the existing
   Admin product screen already renders. The only client-side decision left open
   is how a `PRODUCT_MEDIA_NOT_PUBLISHABLE` refusal's three requirement codes are
   worded in Vietnamese.
2. Two frozen operation-count baselines now read 140 (§Q). The next package that
   publishes an operation will move them again; the public count of 49 is the one
   that should stay still.
