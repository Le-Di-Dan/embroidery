# APP3-B01-C1 — Completion Report

**Checkpoint:** `APP3-B01-C1` — Complete placement concurrency contract and evidence
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `6a1995b` (`docs(app3): record APP3-B01 evidence`)
**Commit A:** `7e64c4d641309488108cf83da88da6da38b61a95`
**Directive:** CLAUDE FINAL CORRECTION DIRECTIVE — APP3-B01-C1

---

## 1. Human correction verdict

```text
APP3-B01 = COMPLETE — CORRECTION_REQUIRED
```

The three-operation backend, DB01 protection, public projection, Studio
eligibility predicate, geometry delegation and disposable-database coverage were
accepted. One HTTP-contract gap was not, and the generated-client evidence
compared two incomparable hash representations.

## 2. What was actually wrong

The compare-and-set was correct and enforced. It was not **published**.

| Published fact | Delivered state |
|---|---|
| Admin read returns the token | present — `AdminProductPlacementResponse.updatedAt`, required |
| Successful replace returns a fresh token | present — the 200 payload is the same model |
| Admin replace accepts the token | **absent** — `ReplaceProductPlacementBody` rendered as `{}` |

A client reading the committed document could not see that `expectedUpdatedAt`
exists, let alone that it is mandatory, and the generated client typed the body
as an empty interface. A server-side CAS whose token the client cannot obtain
and submit is not a complete concurrency contract.

**The cause is platform-wide, not placement-specific.** `createZodDto` carries
the Zod schema for the validation pipe and no OpenAPI metadata, so *every*
schema-backed body in the repository publishes empty — measured:

```text
ArchiveProductBody           (EMPTY)
CreateProductBody            (EMPTY)
PublishProductBody           (EMPTY)
ReplaceProductPlacementBody  (EMPTY)
UnpublishProductBody         (EMPTY)
UpdateProductBody            (EMPTY)
```

Runtime validation was never affected. The correction is scoped to the placement
body: repairing `createZodDto` would change five APP2 schemas belonging to
accepted checkpoints, and `apps/api/src/platform/**` is outside §10 anyway. The
wider gap is recorded here rather than silently fixed or silently ignored.

## 3. Inspected APP2 convention

Files read before editing:

```text
apps/api/src/modules/catalog/presentation/schemas/admin-product.request.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product.response.ts
apps/api/src/modules/catalog/presentation/schemas/admin-product-publication.request.ts
apps/api/src/modules/catalog/application/product-draft.service.ts
apps/api/src/modules/catalog/domain/product-draft.errors.ts
apps/api/src/modules/catalog/infrastructure/persistence/product-concurrency-token.ts
```

| Convention | Canonical value | Source |
|---|---|---|
| Current token (response) | `updatedAt`, `format: date-time` | `AdminProductDetailResponse.updatedAt` — "Optimistic-concurrency token; send it back as `expectedUpdatedAt`." |
| Expected token (request) | `expectedUpdatedAt` | `UpdateProductBody`, `ArchiveProductBody`, `PublishProductBody`, `UnpublishProductBody` |
| Wire format | `z.string().datetime({ offset: true })` | all four bodies above |
| Stale-write treatment | a feature-scoped `*_VERSION_CONFLICT` code, **409**, message "This product changed since it was loaded. Reload and try again." | `PRODUCT_VERSION_CONFLICT` |

There is no conditional-header convention in this repository; every Product
mutation carries the token as a JSON field. No new convention was chosen.

**Names adopted:** `updatedAt` / `expectedUpdatedAt`, unchanged from APP2.

**Stale-write code:** `PLACEMENT_VERSION_CONFLICT`, kept. It is the same
*convention* — feature-scoped code, 409, the identical user-facing message —
applied by the feature that owns its own error union, exactly as
`product-draft.errors.ts` owns `PRODUCT_VERSION_CONFLICT`. This is not a second
token vocabulary: the token field names are shared, and only the error code is
namespaced, which is what every Catalog feature already does.

**A real divergence was found and corrected.** The placement body used a bare
`z.string().datetime()` — no `{ offset: true }` — so it refused a token carrying
`+07:00` that the same client could send to every other Admin Product write. One
column, two rules.

## 4. The delivered contract

```text
GET  /api/admin/products/{productId}/placement   → updatedAt = T1   (required)
PUT  /api/admin/products/{productId}/placement   expectedUpdatedAt = T1 (required)
     → CAS succeeds, the whole placement transaction commits
     → 200 with the complete model and updatedAt = T2
PUT  again with expectedUpdatedAt = T1
     → PLACEMENT_VERSION_CONFLICT (409), no side or area written
```

| Key | Value |
|---|---|
| Token authority | `products.updated_at`; no placement revision column |
| Response field | `updatedAt`, required in `AdminProductPlacementResponse` |
| Request field | `expectedUpdatedAt`, required in `ReplaceProductPlacementBody` |
| Wire format | `z.string().datetime({ offset: true })` |
| Stale-write code | `PLACEMENT_VERSION_CONFLICT` → 409 |
| Public exposure | none — the manifest carries neither field |
| Missing token | rejected; never defaulted, never read from the database |
| Token on Side/Area rows | none — one Product-level serialization token |

## 5. Atomic CAS ordering (unchanged)

```ts
await this.db
  .update(products)
  .set({ updatedAt: new Date() })
  .where(and(eq(products.id, productId), eq(products.updatedAt, expectedUpdatedAt)))
  .returning({ id, slug, status, updatedAt });
```

Zero rows returned maps to `PLACEMENT_VERSION_CONFLICT`; the returned
`updated_at` becomes the response token. The statement remains the **opening**
write of the replacement transaction — lock, then plan, then apply — so no side
or area is touched before the token is proven. There is no separate unlocked
read, no second check after the placement writes, and no automatic retry.
Rollback, audit, request and actor context are untouched.

**No implementation behaviour changed in this correction.** The only source
edits are the request schema's format, the documented shapes, and controller
prose.

## 6. Tests

| Suite | Before | After |
|---|---|---|
| `product-placement.contract.spec.ts` | 13 | **23** |
| `product-placement-concurrency.integration.spec.ts` (new) | — | **10** |
| `tools/check-app3-b01.test.mjs` | 27 | **40** |
| Whole catalog module | 279 | **289** |
| Placement live-database suites | 39 | **49** |

Contract (§5.1–§5.6): the read returns and requires the token; the body requires
it; the 200 payload carries the fresh one; the public schemas carry neither; the
generated client types both directions; the operation count is still three; the
documented body and the Zod schema describe the same field set; an offset-bearing
token is accepted; a missing, blank or malformed one is refused.

Service and live database (§5.7–§5.21): the read returns the exact
`products.updated_at` in canonical wire format; a matching token succeeds and
returns a **different** token; a stale one maps to `PLACEMENT_VERSION_CONFLICT`;
an unusable token value mutates nothing; a validation failure *after* the CAS
leaves the token unchanged, which matters because the CAS advances it first; a
display-only update and a full retirement both advance it; two writers on one
token produce exactly one winner whose returned token is the stored one while the
loser gets the stale-write error and leaves no partial side or area; the loser
then succeeds with the returned fresh token and still fails with the original.

Every token in the concurrency suite is passed as an explicit argument. The
helper is `replaceWith(productId, token, sides)` — a helper that re-read the
current value would make every case pass while proving nothing. The existing race
test in `product-placement.integration.spec.ts` was not weakened or removed.

## 7. OpenAPI and generated client

| Metric | Accepted B01 | Corrected |
|---|---|---|
| Paths | 18 | **18** |
| Operations | 22 | **22** |
| Schemas | 42 | **44** |
| OpenAPI SHA-256 | `7720c2d68f413502028c40513562345dc1d1b632a3da3b2b9f1d3f6394e574cd` | `53ef5650c7e09cb93db885b452f2ae0a15ff4237de0eada9991807ce1629349e` |

Zero new paths, zero new operations. The two added schemas are
`ReplacePlacementSideBody` and `ReplacePlacementAreaBody`: without them the body
would document its token while leaving `sides` opaque, so a client that supplied
the token correctly would still be unable to build a valid request. Public
schemas are unchanged. Nothing was hand-edited; both artifacts come from their
canonical generation commands and both currentness checks pass.

## 8. Comparable client-tree evidence

The accepted report compared a 40-character Git tree object id against a
64-character content hash. Both states are now hashed with the **same** command
and rules — `hashGeneratedTree` from
`packages/api-client/scripts/generated-tree.mjs`, the repository's own
deterministic method (sorted relative paths, LF-normalised content, one SHA-256).

| State | Generated-client SHA-256 |
|---|---|
| Pre-B01 (`fb1dcbd`) | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` |
| Accepted B01 (`6a1995b`) | `595bed36ea8fbedc9cdc8052f5fa58f185d7a95b3ebe249af8494f0122f7e000` |
| Corrected (this commit) | `7c44662902317e306d2deecd128b544ab2ad9faf5298bed7d813d3377a6b19bf` |

The two historical values were computed inside temporary detached
`git worktree` materializations and the worktrees were removed afterwards; the
active working tree was never altered to obtain them. `git worktree list` shows
only the repository itself.

The corrected client types the token in both directions:

```ts
export interface ReplaceProductPlacementBody {
  /** The Product concurrency token, exactly as the Admin placement read returned it… */
  expectedUpdatedAt: string;
  …
}
```

## 9. Changed files

| File | Change | Lines |
|---|---|---|
| `…/schemas/admin-product-placement.request.ts` | `{ offset: true }`; documented body and two nested classes | 250 |
| `…/schemas/product-placement.response.ts` | token description aligned with APP2 | 205 |
| `…/admin-product-placement.controller.ts` | replace description states the full token flow | 165 |
| `…/product-placement.contract.spec.ts` | 10 new contract proofs | 319 |
| `apps/api/test/integration/product-placement-concurrency.integration.spec.ts` | new | 270 |
| `tools/check-app3-b01.mjs` | delegates the concurrency half | 399 |
| `tools/check-app3-b01-concurrency.mjs` | new | 176 |
| `tools/check-app3-b01.test.mjs` | 13 new regressions | 527 |
| `packages/contracts/openapi/openapi.generated.json` | regenerated | — |
| `packages/api-client/src/generated/*` | regenerated | — |
| `docs/implementation/**` | phase §6.15, roadmap, source map, command index | — |

No file exceeds the 400/600 limits. `11-TRACEABILITY-AND-STATUS-MATRIX.md` was
inspected and not changed: it owns no non-duplicated B01 contract fact — status
lives once, in the roadmap.

No Catalog file outside the placement feature was touched, so §10's conditional
allowance for a shared APP2 helper was not needed.

## 10. Gate

`node tools/check-app3-b01.mjs` (399 lines) now delegates the concurrency half to
`tools/check-app3-b01-concurrency.mjs` (176 lines) — the responsibility split
§8 permits, taken because the checks would otherwise have pushed the checker past
400. Together they verify all twelve required properties, reading the
**committed** document and the **generated** client rather than the source that
produced them:

three operations unchanged; the Admin read exposes `updatedAt` and it is
required; the replace requires `expectedUpdatedAt` and the body publishes at
least one property at all; a successful PUT returns the model carrying the fresh
token; the public schemas expose neither field; the request uses the Catalog
`datetime({ offset: true })` format and the token is not optional;
`PLACEMENT_VERSION_CONFLICT` exists and a failed CAS maps to it; the guarded
update compares the caller token against `products.updated_at` and returns it,
with no read-then-update pattern; lock precedes plan precedes apply; no
missing-token fallback; the focused contract and concurrency regressions exist by
name; the generated client is current; G01/DB01/G04/P02 authority holds through
the chain; and the root script count is still 30.

40 checker regressions, 13 of them new, including the exact defect that shipped:
an empty published body.

## 11. Scoped validation

```text
pnpm --filter @embroidery/api exec jest src/modules/catalog        → 289/289, 19 suites
pnpm --filter @embroidery/api exec jest --runInBand
    test/integration/product-placement*.integration.spec.ts        → 49/49, 3 suites
pnpm --filter @embroidery/api openapi:generate                     → 18 / 22 / 44
pnpm --filter @embroidery/api openapi:check                        → up to date
pnpm --filter @embroidery/api-client generate                      → tree 7c446629…
pnpm --filter @embroidery/api-client check:generated               → up to date
pnpm --filter @embroidery/api-client typecheck                     → PASS
pnpm --filter @embroidery/api-client test                          → 44 + 7
node tools/check-app3-b01.mjs                                      → PASS
node --test tools/check-app3-b01.test.mjs                          → 40/40
node tools/check-app3-p02.mjs                                      → PASS
node tools/check-app3-g01.mjs                                      → PASS
node tools/check-app3-db01.mjs                                     → PASS
node tools/check-app3-g04.mjs                                      → PASS
pnpm --filter @embroidery/api exec tsc --noEmit                    → PASS
pnpm --filter @embroidery/api build                                → PASS
pnpm format:check                                                  → PASS
pnpm lint                                                          → PASS (23 tasks)
git diff --check                                                   → clean
```

`pnpm quality` was not run. No root test, E2E, worker suite, full database suite,
Figma, benchmark or full-regression command was run; nothing was backgrounded.

## 12. What did not change

- **No new operation and no new path** — 22 operations before and after.
- No database schema, migration, worker, Admin app, Storefront, infrastructure,
  spike or Figma change.
- No dependency change: `apps/api/package.json`, `pnpm-lock.yaml` and the root
  `package.json` are untouched, and the approved workspace wiring stands as
  delivered. Root scripts still **30**.
- `packages/design-engine` and `packages/design-document` untouched.
- Placement lifecycle, retirement, supersession, public eligibility and the
  `studioEligible` derivation are unchanged.
- `APP3-B01-COMPLETION-REPORT.md` is untouched historical evidence, and Commit
  A's original message was not amended.

## 13. Status

```text
APP3-B01-C1 = COMPLETE — REVIEW_DELIVERED
APP3-B01 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
```

Human review owns:

```text
APP3-B01 = COMPLETE — REVIEW_ACCEPTED
```

The working tree is clean and nothing has been pushed; `origin/production`
remains at `8b5f3b0`. No `APP3-B02`, `APP3-B06`, `APP3-W01`, `APP3-D01`,
`APP3-A01` or Studio work was started.
