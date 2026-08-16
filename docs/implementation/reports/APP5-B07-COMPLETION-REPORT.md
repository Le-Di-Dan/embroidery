# APP5-B07 — Public Catalog Variant Selection — Completion Report

## Verdict

```text
APP5-B07 = COMPLETE
```

One public Catalog read now publishes the fact `APP5-S01` was blocked on. The
blocker `CATALOG_VARIANT_PUBLIC_READ_REQUIRED` is closed.

Explicitly, as required:

- **APP3 Studio was unchanged.** No Design Session schema, contract, use case,
  repository or Storefront file was touched. The variant was never the session's
  fact to carry, which is exactly why the gap could not be closed there.
- **`APP5-B01` still requires `productVariantId`.**
  `CustomRequestCatalogSubject.productVariantId` is unchanged and still required;
  nothing in `submit-custom-request.use-case.ts` or its request schema was
  edited.
- **No default, primary or fallback variant was introduced.** No such concept
  exists in the domain, the projection, the response or the SQL, and the contract
  spec asserts the words are absent from every owned source file.
- **`APP5-S01` is unblocked** and resumes unchanged in product scope — both
  branches, all 28 approved design rows, no re-approval owed.

---

## 1. Baseline

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `2b438f4` — *docs(app5): block S01 on the missing public catalog variant read* |
| Working tree at entry | clean |
| Migration | **none added**; APP5 still owns exactly `0035` (`APP5-DB01`) |
| Contract before | 56 paths / 61 operations / 130 schemas |
| Contract after | **57 paths / 62 operations / 132 schemas** |

`product_variants` (TBL-013) and its `is_active` column already existed, so this
checkpoint is a read over delivered persistence and needs no database change.

---

## 2. The endpoint

```text
GET /api/public/products/{slug}/variants
```

| Property | Value |
|---|---|
| Operation id | `publicProductVariant_list` |
| Tag | `publicProductVariant` |
| Auth | none — anonymous, no guard, no cookie, no Origin allowlist |
| Request | one path parameter (`slug`); **no body, no query parameter** |
| `Cache-Control` | `no-store` (`PUBLIC_CATALOG_CACHE_CONTROL`) |
| Responses | `200`, `400` (malformed slug), `404` (not publicly visible) |

The operation id is **derived**, not overridden: `PublicProductVariantController`
+ `list` is what `createOperationId` produces anyway, so no
`CONTROLLER_DOMAIN_KEYS` entry is owed and no accepted id was reissued. The
contract spec asserts the declared id and the derived id are equal, so the two
cannot drift.

### Why its own controller

`public-product.contract.spec.ts` asserts that `PublicProductController`
declares **exactly two** operations — a real guarantee about the `APP2-B04`
surface. A third method would have deleted that guarantee to add an APP5
operation. A separate class keeps it intact and lets this operation's own
absences be asserted against its own source.

---

## 3. Response contract

```jsonc
{
  "productId": "019a…",                  // string, uuid
  "variants": [
    {
      "productVariantId": "019a…",       // string, uuid
      "colorName": "Xanh rêu",           // string | null
      "sizeLabel": "M"                   // string | null
    }
  ]
}
```

Five properties, and the field names are the ones
`SubmitCustomRequestBody.catalog` expects, so `S01` copies them verbatim rather
than renaming on the way through.

**Why `colorName`/`sizeLabel` and not `name`.** `product_variants` has no name
column: DB4 locked two relational attribute columns and both are nullable. They
are published as stored and never joined into an invented variant name — the same
rule `catalog-subject.port.ts` already applies for the Admin and status
projections, so one variant is described identically wherever it appears.

**Why `productId` is here at all.** The public catalogue deliberately publishes no
product id. The public **placement manifest** already does
(`PublicProductPlacementResponse.productId`, IMP-D041 PO-02), and the reason is
the same: a caller assembling a catalog subject must send `productId` and
`productVariantId` together, and correlating two endpoints is a way for them to
disagree about which product is on screen.

**A published-schema defect caught before the client was generated.** The first
generation typed both nullable labels as `type: object`, which Orval renders as
`{ [key: string]: unknown } | null` — the same shape
`CatalogRequestSubjectResponse` already carries, and useless to a selector.
Swagger reflects the *design-time* type and a `string | null` union reflects as
`Object`, so `type: String` is now stated explicitly. The client types are
`string | null`.

### Not published, and structurally so

SKU, SKU code, price, currency, stock, inventory, availability, `is_active`,
`display_order`, `created_at`/`updated_at`, category, and every product authoring
field. The repository never names `skus` and never selects a price column, so the
omission cannot be undone by widening a projection that never loaded the data —
asserted by the contract spec against the repository source.

---

## 4. Eligibility and refusal

**Product visibility** is the catalogue's own predicate, in the statement:

```sql
products.status = 'PUBLISHED'
  and categories.status = 'PUBLISHED'
  and categories.archived_at is null
```

the same three conditions `drizzle-public-product.repository.ts` and
`drizzle-product-placement.repository.ts` apply. Unknown slug, draft, archived and
non-public category collapse to one `PUBLIC_PRODUCT_NOT_FOUND` → `404`, so the
route cannot be used to enumerate unreleased work. No new lifecycle was invented.

**Variant eligibility** is `is_active`. TBL-013 records that it "delists a variant
without archiving it", and that is the whole authority — `product_variants` has no
publication state and no archive column.

**An empty list is truthful, not a 404.** A published product with no selectable
variant genuinely exists and genuinely cannot form an APP5 catalog request.
Answering 404 would tell the customer the product does not exist, and would make
the two cases indistinguishable to the Storefront that has to render different
states for them. This is also why the repository uses two statements rather than
one join: a join returns zero rows for both cases.

---

## 5. Deterministic ordering

```text
order by display_order asc, id asc
```

`IDX-068`'s own key order, with `id` making it total. `display_order` is not
unique, so ordering by it alone would let PostgreSQL return two equally-ordered
variants in either sequence — and a selector that reshuffles between reads is a
selector a customer can click wrong. Proved twice: repeated reads are identical,
and three variants sharing one `display_order` come back in ascending id order.

---

## 6. Architecture

| Concern | Placement |
|---|---|
| Controller | `catalog/presentation/public-product-variant.controller.ts` |
| Query + projection | `catalog/application/public-product-variant.query.ts` |
| Port | `catalog/domain/repositories/public-product-variant.repository.ts` |
| Adapter | `catalog/infrastructure/persistence/drizzle-public-product-variant.repository.ts` |
| Response classes | `catalog/presentation/schemas/public-product-variant.response.ts` |
| Module | `CatalogPublicModule` (extended) |

**Catalog owns it, despite APP5 consuming it.** Ordering must not query
`product_variants` (`BACKEND_CONVENTIONS.md` §10), and the module that already
owns the public-visibility predicate is the one place it cannot drift from.

It joined `CatalogPublicModule` rather than starting a new one: same concern by
every measure that put the other two operations there — an anonymous JSON read of
published Catalog data, resolved by slug, needing a database and nothing else.
That graph still has **no object-storage provider**, no Admin provider and no
identity dependency.

No transaction (DEC-DB7-006 — ordinary reads). No audit, no outbox, no mutation.

---

## 7. Focused evidence

### Contract / unit — 13 tests, Docker-free

`public-product-variant.contract.spec.ts` asserts what has no runtime signal:

- no `@UseGuards`, no `@ApiCookieAuth`/`@ApiBearerAuth`, and **no identity import
  at all**, so no guard is even in scope to be applied;
- exactly one handler and it is a `@Get`; no `@Post`/`@Patch`/`@Put`/`@Delete`
  anywhere under the path;
- no `@Body`, no `@Query`, no `@ApiQuery` — a lifecycle selector cannot be
  smuggled in as a documented parameter;
- the slug schema rejects empty, uppercase, underscored, spaced, traversal-shaped
  and over-length values, and is `.strict()` so `{ slug, status: 'DRAFT' }` is a
  rejected request rather than a silent drop;
- the published payload is exactly the five documented properties, and none of
  the 21 forbidden commerce/lifecycle/authoring names appears;
- the repository source contains no `skus` and no price column;
- no `isDefault`/`defaultVariant`/`primaryVariant`/`fallbackVariant` anywhere;
- `no-store`, the mount path, and the derived-equals-declared operation id.

### PostgreSQL integration — 12 tests, disposable database

`public-product-variant.integration.spec.ts`, compiling the real
`CatalogPublicModule` graph against real SQL:

| # | Proves |
|---|---|
| 1 | multiple variants return their **real** ids, each verified present in `product_variants` under that product — so `fk_custom_requests__product_variant_id` will accept them |
| 2 | both attribute columns published exactly as stored, across all four combinations (both, colour only, size only, neither) |
| 3 | a variant with a **priced SKU** leaks neither the amount nor the code |
| 4 | ordering by `display_order` then id, identical across repeated reads |
| 5 | three variants sharing one `display_order` come back in ascending id order, not heap order |
| 6 | another product's variants never appear under this slug |
| 7 | a delisted variant is excluded **while its row still exists** — the exclusion is the read's doing, not the fixture's |
| 8 | empty list (no rows, and all-delisted) rather than 404 |
| 9 | unknown / DRAFT / ARCHIVED / non-public-category → one identical `PUBLIC_PRODUCT_NOT_FOUND` |
| 10 | a draft product's variants exist in the database and are still unreachable — the predicate is in the statement, not in a filter over rows that already arrived |
| 11 | a published product becomes unreachable the moment it is archived (nothing caches) |
| 12 | a successful read **and** a refusal write no `audit_events`, no `outbox_events` and no domain row |

---

## 8. OpenAPI / client delta

| Artifact | Before | After | Delta |
|---|---|---|---|
| Paths | 56 | 57 | **+1** |
| Operations | 61 | 62 | **+1** |
| Schemas | 130 | 132 | **+2** (`PublicProductVariantResponse`, `PublicProductVariantListResponse`) |

No operation was deleted, renamed or reissued.

Generated client: `publicProductVariantList` +
`PublicProductVariantList200` / `…ListResponse` / `…Response` types, with
`productVariantId: string`, `productId: string`, `colorName: string | null`,
`sizeLabel: string | null`.

**Generation counts.** `openapi:generate` ran **twice** — the second run was the
fix for the `type: object` defect the first run exposed, not a repeat of a
passing command. `api-client generate` ran **once**. Both drift gates and the
api-client typecheck ran once each and pass.

`packages/api-client/src/index.ts` was **not** touched. The curated boundary is
consumer-driven in this repository, and §8 leaves that export to `S01`, which is
the checkpoint that will import it.

One pre-existing artefact, unchanged by B07 and noted for `S01`: the generated
`slug` parameter is typed `unknown`, exactly as it already is for
`publicProductDetail`, `publicProductPlacementGet` and
`publicProductSideBackgroundGet`. It comes from `@ApiParam` carrying no `schema`
and is the established convention across all four; a `string` argument is
assignable to it.

---

## 9. Validation ledger

| Command | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api exec tsc --noEmit` | new controller, query, port, adapter, response classes and module wiring | PASS | 2 (after the nullable-type fix; after the lint fix) |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-product-variant.contract"` | the new contract spec and the sources it scans | PASS · 13 tests | 1 (after the nullable-type fix) |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-product-variant.integration"` | the new query, repository and SQL, against real PostgreSQL | PASS · 12 tests | 1 (after the UUIDv7 slug-collision fix) |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="public-product-variant"` | both halves after Prettier and the ESLint fix | PASS · 2 suites / 25 tests | 0 |
| `pnpm --filter @embroidery/api openapi:generate` | one new operation and two new schemas | PASS · 57/62/132 | 1 (the `type: object` fix) |
| `pnpm --filter @embroidery/api openapi:check` | contract drift gate after generation | PASS | 0 |
| `pnpm --filter @embroidery/api-client generate` | regenerate the client for the new operation | PASS · tree `d090fb13…` | 0 |
| `pnpm --filter @embroidery/api-client check:generated` | client drift gate | PASS | 0 |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | the generated types must compile | PASS | 0 |
| `pnpm --filter @embroidery/api exec eslint <8 changed files>` | changed API source | PASS | 1 (unnecessary type assertion in the spec) |
| `npx prettier --write/--check <changed files>` | formatting of changed files | PASS | 0 |
| `git status --short`, `git diff --check` | changed-file scope and whitespace | PASS | 0 |

**Not run, per §10:** full APP2 regression, the historical public-catalog groups,
APP3 Studio suites, `B01`–`B05` tests, `S01` frontend tests, DB regression, worker
tests, Playwright, the Figma checker, the APP3/APP4 operation-count gates,
SonarQube, and any all-workspace build or typecheck.

### Two gate observations, verified by reading rather than running

1. **The APP3 gates are unaffected.** `check-app3-db01.mjs` and its siblings
   select operations with
   `/design-sessions?|design-templates?|template-assets?|session-uploads?|\/background\b|placement|thiet-ke/i`.
   `/api/public/products/{slug}/variants` does not match it, so the new path is
   invisible to every one of those frozen lists.

2. **`zod-dto-publication.contract.spec.ts` was already red, and B07 did not make
   it so.** It asserts the committed artifact keeps "19 paths and 23 operations".
   `git show HEAD:packages/contracts/openapi/openapi.generated.json` counts
   **56 paths / 61 operations** *before* this checkpoint, so the assertion has
   been failing since the APP3-P03 era. It is recorded here rather than fixed:
   repairing another checkpoint's frozen count is not B07's to do, and the
   arithmetic is stated so a later reader does not attribute it to this change.

---

## 10. Files changed

| File | Change |
|---|---|
| `apps/api/…/catalog/domain/repositories/public-product-variant.repository.ts` | new — port, row and result types |
| `apps/api/…/catalog/infrastructure/persistence/drizzle-public-product-variant.repository.ts` | new — two statements, visibility and `is_active` in the SQL |
| `apps/api/…/catalog/application/public-product-variant.query.ts` | new — query + projection + view types |
| `apps/api/…/catalog/presentation/schemas/public-product-variant.response.ts` | new — the two documented response classes |
| `apps/api/…/catalog/presentation/public-product-variant.controller.ts` | new — the one operation |
| `apps/api/…/catalog/catalog-public.module.ts` | wires the controller, query and repository; module doc updated |
| `apps/api/…/catalog/presentation/public-product-variant.contract.spec.ts` | new — 13 contract tests |
| `apps/api/…/catalog/tests/integration/public-product-variant.integration.spec.ts` | new — 12 PostgreSQL tests |
| `packages/contracts/openapi/openapi.generated.json` | generated — +1 path, +1 operation, +2 schemas |
| `packages/api-client/src/generated/embroidery-api.ts` · `…schemas.ts` | generated — the new operation and types |
| `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md` | `B07` `COMPLETE`, `S01` back to `INCOMPLETE — NEXT`; §10.6 closure note |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | `CMD-TEST-APP5-B07-VARIANTS` |
| `docs/implementation/reports/APP5-B07-COMPLETION-REPORT.md` | this report |

No migration, no worker, no Figma, no frontend, no Storefront, no `S01`.

---

## 11. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = COMPLETE
APP5-B07  = COMPLETE
APP5-S01  = INCOMPLETE  NEXT — resume
APP5-S02  = INCOMPLETE
APP5-A01  = INCOMPLETE
APP5-B06  = INCOMPLETE  before A02
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

---

## 12. Residual risks and notes for the S01 resume

1. **The size-label ↔ variant question is still open**, and B07 deliberately did
   not answer it. `CustomRequestQuantityLine` carries `sizeLabel` and no variant,
   and `APP5-B01` sets the variant server-side from the subject — while the
   approved `650:3` draws a **per-variant** quantity table. If a product's sizes
   *are* its variants, the two describe the same data twice. B07 publishes both
   attributes so `S01` can render either shape, but the product decision is
   `S01`'s to take against `673:3`.

2. **Ordering is stable, not meaningful.** `display_order` is the operator's
   authoring order. No checkpoint has published an Admin surface that sets it, so
   in practice it is whatever seeding or fixtures assigned. The selector should
   render the labels, not the position.

3. **No delisting surface exists.** `addVariant` always writes `is_active: true`,
   and no delivered checkpoint can set it false — the integration suite flips the
   column directly for that reason. The read is correct today and the eligibility
   rule is real, but it will not be exercised in production until an Admin
   variant capability exists.

4. **`S01` still owns the api-client boundary export.** The four APP5 public
   operations and this one are generated but not re-exported from
   `packages/api-client/src/index.ts`; adding them is part of the resume.

5. **`650:187` — the "design session expired" fallback — now has a reachable
   trigger again**, and `S01` should confirm it is used only for a genuinely stale
   session, never for a product whose variant list is empty. Those are different
   states and B07 made them distinguishable on purpose.

---

NEXT CHECKPOINT: APP5-S01 — Resume customer request creation & submission
