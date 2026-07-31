# APP2-B02-C1 — Catalog Draft Security & Concurrency Correction Report

**Correction:** `APP2-B02-C1` — close the mutation-protection, concurrency-token
and media-validation gaps, and the asset-eligibility race.
**Verdict:** `PASS`
**Status:** `COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW`
**Date:** 2026-07-31
**Correction commit (C):** `90e00d7780183b451d6da07526f64d4fbc704839`

---

## A. Preflight and exact A/B chain

`APP2_B02_C1_PREFLIGHT = PASS`.

| Requirement | Observed |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `13fa4f2fb3bee8f33afc4dbca1e2b0fc02c16314` — `docs(app2): record catalog draft backend evidence`, the exact `APP2-B02` evidence Commit B read from Git |
| B02 Commit A | `14c80f06976c6f01344279e284fafeffc9a8ddda` |
| Tracked / staged change | none |
| Correction residue | none |
| `pnpm quality` (before editing) | `EXIT=0` |
| `pnpm test:catalog-draft:integration` | 21 passed |
| `pnpm test:catalog-draft:api` | 14 passed |
| `pnpm test:catalog-draft:gateway` | 6 passed / 0 failed |
| OpenAPI / client / DB / Figma baselines | `b789cc99…` / `66d1c991…` / 33 migrations · 78 · 833 · 190 · `82864268…` / 70 — all as accepted |

**User-owned evidence.** `evidences/` stayed untracked, unstaged and untouched;
every `git add` used `-- ':!evidences'`.

The five operations and their IDs are unchanged: `adminProduct_list`,
`adminProduct_detail`, `adminProduct_create`, `adminProduct_update`,
`adminProduct_archive`.

---

## B. Reviewer defects reproduced

Each defect was reproduced against the delivered code before it was fixed —
not inferred from reading it.

**C1-01 — no content-type protection.** The committed controller applied only
`StaffOriginGuard` to the three mutations (`git show 14c80f0` shows
`@UseGuards(StaffOriginGuard)` three times), and `StaffJsonBodyGuard` was not
even exported from `IdentityModule`. Removing the new guard again and running
the new test reproduces it exactly:

```text
● rejects a wrong content type on every mutation with 415
    Object { "mutation": "create", - "status": 415, + "status": 400 }
```

A cross-site `text/plain` post was therefore not rejected on content type at
all — it reached body validation and came back as an ordinary 400.

**C1-02 — the token could move backwards.** With the delivered
`date_trunc('milliseconds', clock_timestamp())` restored, the deterministic test
fails with the published token going *backwards*:

```text
● advances the token even when the stored one is not behind the clock
    Expected: > 1785435605202
    Received:   1785435603211
```

A token that can repeat — or regress — is not a concurrency token: the
superseded value still matches the guard.

**Worth recording, because it nearly hid the defect.** My first attempt at this
test simply issued eight back-to-back writes and asserted the tokens differed.
It **passed against the broken code**: each round trip happened to exceed a
millisecond, so the collision never occurred. A test that only fails on a fast
enough machine is exactly how this survived B02, so it was replaced with the
deterministic form described in §E.

**C1-03 — an invented product limit.** `git show 14c80f0` carries
`export const MAX_PRODUCT_MEDIA_ITEMS = 12;` and a single `findScoped` call
inside a per-item `for` loop. Neither the product, domain nor design authority
defines a twelve-image maximum; the constant's own comment admitted it existed
"so the validation loop can never become a scan".

**C1-04 — eligibility could go stale.** Validation read each asset and the media
write happened afterwards in the same transaction, but at `READ COMMITTED` a
plain read takes no lock, so a concurrent transition out of `ACCEPTED` could
commit in between and the association would be written against truth that no
longer held.

---

## C. Origin / JSON guard correction

Every mutation now carries the canonical composition, and only the existing
implementations are used:

```ts
@Controller('admin/products')
@UseGuards(AuthenticatedAdminGuard)          // all five operations
…
@UseGuards(StaffOriginGuard, StaffJsonBodyGuard)   // create, update, archive
```

`StaffJsonBodyGuard` was added to `IdentityModule`'s exports (one line) so it
could be reused; §5's "do not duplicate Origin parsing, allowed-origin
configuration, JSON content-type parsing, or error mapping" is honoured —
nothing of the sort exists in the Catalog module.

**Exact public behaviour, as the existing guards define it:**

| Case | Result |
|---|---|
| authenticated, allowlisted Origin, `application/json` | succeeds |
| foreign Origin (`http://evil.example`) | **403** `FORBIDDEN` |
| literal `null` Origin | **403** `FORBIDDEN` |
| suffix lookalike (`http://admin.embroidery.local.evil`) | **403** `FORBIDDEN` |
| `Content-Type: text/plain` | **415** `UNSUPPORTED_MEDIA_TYPE` |
| no session | **401**, decided before Origin or content type |
| GET list / detail, no Origin, no body | **200** |

**One divergence from the brief, stated plainly.** §5 asks to prove that "missing
Origin is rejected by canonical semantics". The canonical semantics are the
opposite: `RequestOriginPolicy` treats a request carrying **neither** `Origin`
nor `Referer` as non-browser (server-to-server, CLI, test) and **allows** it —
documented in that file and relied on by APP1 login and by B01's upload route.
A browser cross-site request always sends one and is refused. The test therefore
asserts the real behaviour and says why; changing the policy would be a
cross-cutting APP1 decision this correction has no authority to make.

---

## D. Monotonic `updatedAt` contract

The public contract is unchanged: responses expose `updatedAt`; `PATCH` and
archive require `expectedUpdatedAt`.

What changed is who computes the next value:

```sql
greatest(
  date_trunc('milliseconds', clock_timestamp()),
  date_trunc('milliseconds', products.updated_at) + interval '1 millisecond'
)
```

- **Database-owned.** No `new Date()` remains anywhere on the write path —
  `create`, `updateGuarded` and `archiveGuarded` all take their instant from the
  database, and `CreateProductDraftInput`/`UpdateProductDraftInput`/
  `ArchiveProductDraftInput` no longer carry an `at` field at all. A skewed API
  host can no longer publish a token that moves backwards.
- **`clock_timestamp()`, not `now()`.** `now()` is fixed for the whole
  transaction, so two writes inside one transaction would tie again.
- **Millisecond precision**, matching exactly what the ISO token carries.
- **Strictly greater than the row's own token**, which is the property that was
  missing.
- **`RETURNING` supplies the committed token**, so the value published is the
  one the database actually stored.
- Identity, allowed source state and expected token remain in the **same**
  guarded statement.
- Archive takes the same value for `archived_at` and `updated_at`.

No version column, no migration, no schema change.

---

## E. Same-token concurrency proof

Twelve live-PostgreSQL tests in
`apps/api/test/integration/catalog-draft-concurrency.integration.spec.ts`.

| §6 case | Test |
|---|---|
| 1 immediate PATCH returns a different token | "advances the public token on an immediate PATCH" |
| 2 old token conflicts | "rejects the old token and accepts the new one" |
| 3 new token succeeds | same test |
| 4 two concurrent PATCHes → exactly one winner | "yields exactly one winner when two writes race on one token" — `Promise.allSettled`, asserting one fulfilled and one `PRODUCT_VERSION_CONFLICT` |
| 5 archive obeys the same rule | "advances the token on archive too" |
| 6 a stale mutation changes nothing | "changes nothing at all when a mutation is rejected as stale" — the whole detail projection is compared before and after |

**How the same-millisecond window is exercised without sleeping.** Rather than
hoping two writes collide, the row's own token is placed clearly ahead of the
clock — which is what a same-millisecond predecessor, or any host clock skew,
looks like to the next writer. The delivered expression then yields a token that
is *not greater* than the published one; the corrected expression always
advances. The offset (two seconds) exists only so the round trip cannot overtake
it; the invariant under test is size-independent. A supporting test also runs
eight rapid successive writes and asserts strictly increasing, all-distinct
tokens and that **every** superseded token is rejected.

---

## F. Media maximum removal and batch query

`MAX_PRODUCT_MEDIA_ITEMS` is gone from the domain policy, from the request
schema (`z.array(z.string().uuid())` with no `.max`), and from the error copy
and tests. **No replacement count limit was introduced.** The platform's JSON
body limit remains the finite transport bound.

**Recorded precisely:** there was no `maxItems: 12` in the published contract to
remove. `createZodDto`'s `.max()` never reached the OpenAPI document — the
committed `UpdateProductBody` schema has no `maxItems` at all — so the cap was a
runtime-only restriction. The correction removes it where it actually lived.

Validation is now a single query:

```ts
const locked = await this.assets.lockScopedByIds(assetIds, SCOPE);
```

- one transaction-scoped statement for the whole distinct selection;
- the result is checked against the **complete requested id set**, id by id, not
  against a row count — so the caller learns *which* item was wrong;
- an id absent from the scoped read is `PRODUCT_MEDIA_ASSET_NOT_FOUND`, whether
  it does not exist or lies outside the catalog-media lane, so the endpoint
  cannot confirm that a customer's private artwork exists;
- an id present but not `ACCEPTED` is `PRODUCT_MEDIA_ASSET_UNAVAILABLE`;
- request order still decides roles: first `THUMBNAIL`, rest `GALLERY`,
  `DETAIL` never written.

Proved by: **13 distinct valid assets accepted** with correct roles and
positions; a spy asserting `lockScopedByIds` is called **once** and the old
per-item `findScoped` **never**; and the duplicate / missing / unavailable cases
still failing all-or-nothing with no link written and no token movement.

---

## G. Asset eligibility race proof

The new port method is the minimal extension §8 allows:

```ts
/** @requiresTransaction */
lockScopedByIds(ids, filter): Promise<Asset[]>   // SELECT … FOR SHARE
```

Implemented in `DrizzleAssetRepository` with `requireTransaction`, so a caller
that forgot the transaction fails loudly rather than taking a lock that is
released immediately. No asset lifecycle semantics changed, and no controller or
application service reads the asset tables directly.

**The race test uses two real transactions.** Two independent
`TransactionManager.runInTransaction` calls are two pooled connections and
therefore two genuine PostgreSQL transactions — no second driver, and **no new
dependency** (`pg` is not a dependency of `apps/api`, so the first draft of this
test was rewritten).

Recorded lock/order behaviour:

| Step | Observed |
|---|---|
| Product transaction validates and locks the asset (`FOR SHARE`), stays open | lock held |
| Rival transaction sets `lock_timeout = '750ms'` and attempts `status → REJECTED` | **fails, SQLSTATE `55P03`** (`lock_not_available`) |
| Asset re-read | still `ACCEPTED` — the value the product transaction validated |
| Product transaction commits, then the transition is retried | **succeeds**; the asset becomes `REJECTED` |
| Already-committed association | survives; publication readiness is `APP2-B03`'s concern |

That is the accepted outcome "product PATCH commits first, then the Asset
transition follows" — serialized, not prevented. The forbidden outcome (media
committed on stale eligibility truth) cannot occur while the lock is held.

**A detail worth keeping:** the assertion is on the **SQLSTATE**, not the
message. Drizzle wraps driver errors, so the surfaced text is a generic
`Failed query: …`; `driverErrorCode(error) === SQLSTATE.LOCK_NOT_AVAILABLE` is
the fact that actually proves the block.

---

## H. Description semantics

One contract, stated once in the controller, once in the request schema, once in
the OpenAPI description, and asserted end to end:

```text
description absent          -> leave the stored value unchanged
description null or blank   -> clear it to NULL
description any other text  -> store it
```

The earlier report's two phrasings ("normalised to absent" / "normalised to
clear") described the same behaviour; the ambiguity was in the wording, not the
code. The HTTP test walks the full cycle: set text → rename with `description`
omitted (still there) → send `'   '` (cleared) → set text again → send `null`
(cleared).

---

## I. OpenAPI and generated client changes

| Artifact | Before | After |
|---|---|---|
| OpenAPI SHA-256 | `b789cc9983dc583e9ee59469d00885a74198c8f8997f70436273d1d856ef7e8c` | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` |
| API-client tree SHA-256 | `66d1c991c6b3846321def3d8d70708f1409593a562599321394e51ae3abb52c3` | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` |
| Paths / operations | 10 / 13 | **10 / 13 (unchanged)** |
| Operation IDs | five product IDs | **unchanged** |

The whole OpenAPI diff is: one `description` string, and the `403` + `415`
responses now documented on the three mutations (each with the standard
`ApiErrorResponse` schema and the `X-Request-ID` header the generator attaches).
The generated client diff is **one line** — the same description string. No
thumbnail, category or publication operation or field, and no unrelated churn.

---

## J. Regression and boundaries

| Artifact | State |
|---|---|
| Database schema / migrations / fingerprint | **unchanged** — 33 / 78 / 833 / 190 / `82864268…`; `db:check:manifest` passes |
| Figma registry | **unchanged** — 70 IDs |
| `apps/admin`, `apps/storefront`, `apps/worker` | untouched |
| `packages/object-storage` | untouched |
| Nginx / Compose | untouched; the gateway seam test still passes 6/6 |
| Dependencies / lockfile | **none added** — the race test was rewritten to avoid needing `pg` |
| B02 accepted behaviour | preserved: five operations, closed `categorySlug`, immutable slug, DRAFT defaults, money-safe VND strings, keyset paging, `status`/`categorySlug` filters only, no search, safe projections, ordered complete media replacement, first `THUMBNAIL` / rest `GALLERY`, `DETAIL` excluded, canonical archive, no publication, no thumbnail delivery, no migration |

Two files outside `apps/api/src/modules/catalog/**` changed, both allowed by §11
and disclosed here: `identity.module.ts` (export the existing guard) and the
Asset module's port plus its Drizzle implementation (the minimal
transaction-scoped batch locking read).

---

## K. Commit C evidence

```text
90e00d7780183b451d6da07526f64d4fbc704839
fix(api): harden catalog draft mutations
16 files changed, 904 insertions(+), 69 deletions(-)
```

New: `apps/api/test/integration/catalog-draft-concurrency.integration.spec.ts`.

Modified — Catalog: `presentation/admin-product.controller.ts`,
`presentation/schemas/admin-product.request.ts`,
`presentation/schemas/admin-product.response.ts`,
`application/product-draft.service.ts`,
`application/product-media-selection.service.ts`,
`domain/product-draft.policy.ts`,
`domain/repositories/product-draft.repository.ts`,
`infrastructure/persistence/drizzle-product-draft.repository.ts`.
Asset: `domain/repositories/asset.repository.ts`,
`infrastructure/persistence/drizzle-asset.repository.ts`.
Identity: `identity.module.ts`.
Tests: `catalog-draft.integration.spec.ts`,
`catalog-draft-api.integration.spec.ts`.
Generated: `packages/contracts/openapi/openapi.generated.json`,
`packages/api-client/src/generated/embroidery-api.schemas.ts`.

---

## L. Validation matrix

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/persistence lint` | clean |
| `pnpm --filter @embroidery/persistence typecheck` | clean |
| `pnpm --filter @embroidery/persistence test` | 112 passed / 9 suites |
| `pnpm --filter @embroidery/api lint` | clean |
| `pnpm --filter @embroidery/api typecheck` | clean |
| `pnpm --filter @embroidery/api test` | **99 suites passed** |
| `pnpm --filter @embroidery/api build` | clean |
| `pnpm test:catalog-draft:integration` | 21 passed |
| `pnpm test:catalog-draft:api` | **21 passed** (14 → 21) |
| `pnpm test:catalog-draft:gateway` | 6 passed / 0 failed |
| all catalog suites (`--testPathPatterns catalog`) | **132 passed / 8 suites** |
| `pnpm openapi:generate` | 10 paths, 13 operations, 22 schemas |
| `pnpm check:openapi` | up to date |
| `pnpm api-client:generate` | 2 files, tree hash `3e3e267d…` |
| `pnpm check:api-client` | up to date |
| `pnpm check:frontend-boundaries` | clean |
| `pnpm check:spike-boundaries` | clean |
| `pnpm check:e2e` | clean |
| `pnpm check:figma-design-index` | 70 registry IDs |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed |
| `node tools/check-file-size.mjs` | passed |
| `pnpm quality` | **`EXIT=0`** |
| `git diff --check` | clean |

New tests added by this correction: **19** (6 mutation-protection + 1 description
contract in the API suite; 12 concurrency, batching and race tests in the new
live suite).

**Two defects in my own tests, found and fixed rather than tolerated.** The 401
case set `Content-Type: text/plain` while passing an **object** to `.send()`;
superagent measures the body itself for a non-JSON type and threw
`TypeError: The "string" argument must be of type string…`, whose open handle
then made `afterAll` exceed its default 120 s budget and the suite appear to
hang for over ten minutes. The body is now a string, and the hook carries the
same explicit 240 s budget as the setup, so a failure can never again present as
a hang.

**Environment.** One leaked disposable database from a killed run was found in
the final sweep and dropped; the environment ends at **0**
`embroidery_db7_*`. No container was started or stopped.

---

## M. Acceptance matrix

All 45 criteria are met. Those carrying a note:

| # | Criterion | Note |
|---|---|---|
| 8 | missing/foreign Origin rejected | foreign, `null` and lookalike origins are 403; an **absent** Origin is allowed, which is the canonical policy — §C |
| 10 | no duplicate guard/parser | the existing guards are reused; one export line was added |
| 12–16 | database-owned, strictly advancing token | §D/§E, with a deterministic same-millisecond exercise |
| 19–20 | `maxItems: 12` removed, no replacement | it was runtime-only and never reached the contract — §F |
| 22–25 | one batch query, transaction-scoped, race serialized | §F/§G, proved by SQLSTATE `55P03` |
| 33 | no dependency | the race test was rewritten so `pg` was not needed |

---

## N. Handoff and scope closure

A02 and A03 inherit exactly the same wire contract as before, with three
behaviours now guaranteed rather than assumed: a mutation must be same-origin
JSON; `updatedAt` strictly advances, so echoing the previous value always
conflicts and never silently overwrites; and a media selection has no hidden
item limit.

Not started and out of scope: `APP2-A02`, `APP2-A03`, thumbnail delivery,
publication, public catalog, any sixth operation, any further correction.

```text
APP2-B02    = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-A02    = BLOCKED_BY_PRODUCT_OWNER_DESIGN_APPROVAL
APP2-A03    = BLOCKED_BY_PRODUCT_OWNER_DESIGN_APPROVAL
APP2-T01    = ROUTED — NOT PLANNED_FOR_EXECUTION
APP2-B02-C2 = MUST_NOT_BE_CREATED
```
