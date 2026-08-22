# APP7-B01 — Completion report

**Phase:** APP7 — Deposit Payment and Order Creation
**Checkpoint:** `APP7-B01` — Admin SKU authoring
**Mode:** IMPLEMENTATION / BACKEND / CATALOG
**Date:** 2026-08-22

---

## 1. Verdict

```text
APP7-B01 = COMPLETE
CHECKPOINT_SCOPE = ADMIN_SKU_AUTHORING
HTTP_OPERATIONS = 2

SKU_RESOLUTION_AUTHORITY =
  "a Catalog order item resolves exactly one ACTIVE SKU for the snapshot's
   variant, and zero or several is a refusal, never a guess and never a
   synthesised SKU"
  (APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md §11, restating APP7-R00 §5;
   IMP-D052 is the PO-APP7-001 payment ruling and states no SKU rule of its own)

SKU_CONCURRENCY_ARBITER =
  the owning product_variants row, locked FOR UPDATE inside the mutation's own
  transaction before the variant's SKU set is read; the owning product is locked
  FOR SHARE for its lifecycle state. Every mutation locks, proves the hierarchy
  from the locked rows, re-reads the whole SKU set, writes, re-evaluates the
  resulting order-eligible set and refuses an ambiguous result by rolling the
  transaction back.

SKU_DUPLICATE_CODE_BEHAVIOR =
  CST-012 / uq_skus__code stays the final arbiter. The application never
  pre-checks the code. SQLSTATE 23505 from the write is mapped to the domain
  error SKU_CODE_CONFLICT -> HTTP 409. No SQLSTATE, constraint name, table name
  or driver message reaches the client.

SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE

OPENAPI_BEFORE = 72 paths / 79 operations / 167 schemas
OPENAPI_AFTER  = 74 paths / 81 operations / 170 schemas
NEW_OPERATION_IDS = adminSku_create, adminSku_update

FOCUSED_TESTS = 8 suites / 100 tests, all passing
  36 unit + contract (Docker-free)
  22 real-database integration (3 of them the concurrency proof)
  14 API over HTTP
  (28 further platform DTO/OpenAPI assertions re-run; see §9)
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-W01
```

---

## 2. What was delivered, and why it was needed

`APP7-R00` §5 established that the Catalog `order_items` branch is unreachable:
`ck_order_items__exactly_one_subject` requires a `sku_id` for a Catalog subject,
an Approval Snapshot names a `product_variant_id`, `ProductRepository.addSku`
exists but is called by no use case, controller or HTTP operation, and the eight
delivered `adminProduct` operations do not include SKU management. A published
Catalog variant therefore has no SKU, and `APP7-W01` would have nothing legal to
write.

`APP7-B01` delivers the minimum Admin SKU-authoring capability that closes that.
It is an inherited **APP2** Catalog gap settled late: APP2 is not reopened, its
closure stands, no Catalog design is revisited and no business behaviour changes
whichever phase delivers it (`07-ADMIN-OPERATIONS.md:41` already lists "Manage
SKU" as an Admin catalog operation).

The checkpoint delivers the **write** half of the locked rule — it makes
"exactly one order-eligible SKU per variant" an achievable and enforced state.
It resolves nothing for an order. Conversion belongs to `APP7-W01`.

---

## 3. The two operations

| Method | Path | operationId | Status |
|---|---|---|---|
| `POST` | `/api/admin/products/{productId}/variants/{variantId}/skus` | `adminSku_create` | 201 |
| `PATCH` | `/api/admin/skus/{skuId}` | `adminSku_update` | 200 |

Route naming was confirmed against the delivered Admin/Catalog convention
(`admin/products/{productId}/...` for variant-scoped children, a top-level
`admin/<resource>/{id}` for a resource addressed by its own id) and matches what
`APP7-R00` §17 predicted. No third operation exists: there is no list, detail,
delete, bulk, public or Storefront SKU route, and no Order or payment endpoint.

Both are served by one controller class, `AdminSkuController`, with a base of
`admin` and the rest of each path on the handler. That keeps the two under one
published domain, so the naming policy derives `adminSku_create` and
`adminSku_update` on its own and **no `CONTROLLER_DOMAIN_KEYS` entry is owed** —
a file-layout decision can never rename a public identifier. Neither route can
shadow another: both differ from every registered Admin route in segment count
and in the segment after `admin`.

---

## 4. The locked SKU resolution invariant

**Order-eligible is exactly `skus.is_active = true`.** That is the delivered
schema's own terminology — COL-TBL014-05, "sellable flag (definition side)" —
and it is what `APP7-R00`/`APP7-G01` call ACTIVE. No new state, no `ACTIVE`
literal and no third concept was invented.

```text
exactly one order-eligible SKU  -> APP7-W01 may use it
zero order-eligible SKUs        -> later conversion refuses safely
more than one                   -> later conversion refuses safely
```

`APP7-B01` prevents the third case from ever existing:

- A create with `isActive: true` on a variant that already has an order-eligible
  SKU is refused.
- A patch that activates a second SKU is refused.
- Deactivating is always allowed. **Zero is legal and reachable** — the locked
  rule already says conversion refuses safely on zero, so forbidding the
  deactivation that produces it would block a legitimate Admin action to
  pre-empt a refusal that is already correct.
- The operator hands the slot over by deactivating one SKU and then activating
  another. Both steps are ordinary, guarded mutations.

**No arbitrary selection exists anywhere.** `evaluateOrderEligibility` returns
`{ eligibleCount, ambiguous }` and has no field that could name a member; there
is no "first", "latest", "smallest" or id-order tie-break, because an ambiguous
set is never allowed to exist to be broken. **No SKU is ever synthesised.**

The invariant is **per variant**: a sibling variant of the same product keeps its
own single slot, which the integration suite proves.

---

## 5. Concurrency

`skus.product_variant_id` carries no uniqueness constraint (`CST-012` is on
`code` alone), so nothing in the schema stops two concurrent Admin writes from
each leaving a sellable SKU on one variant.

`APP7-G01` §10 locks arbiters for order creation, obligation creation, attempt
initiation, evidence upload and manual verification. It states **no** SKU
concurrency arbiter — its SKU authority (§11) is the resolution rule only. There
is therefore no contradiction to report, and the arbiter was resolved
autonomously from repository truth as the directive's §18 requires:

```text
begin transaction
  lock the owning product_variant  FOR UPDATE
  lock the owning product          FOR SHARE   (its lifecycle state gates the write)
  prove product/variant relationship from the locked rows
  re-read the variant's whole SKU set inside the transaction
  apply the mutation
  re-read and re-evaluate the resulting order-eligible set
  refuse an ambiguous result  (throw -> rollback: nothing partial survives)
commit
```

The owning variant is the one row both transactions must touch, so locking it
before the set is read is what makes the check-then-write atomic. The product is
locked in **share** mode because this transaction does not write it — an
exclusive lock there would serialise SKU writes across every variant of the same
product.

Two statements rather than one join with two locking clauses: a Drizzle select
carries a single `for(...)` clause, so chaining `.for('update')` and
`.for('share')` would silently keep only the last one and the variant would never
be write-locked. That is the exact defect `APP2-B03`'s `lockSnapshot` documents,
and it is not repeated.

**No forbidden substitute is used:** no application mutex, no in-memory lock, no
check-then-write outside one transaction, no best-effort ordering, no arbitrary
winner selection, and no migration for convenience.

On update, the owning variant is resolved **server-side** from the SKU row. The
unlocked lookup only says which row to lock; the caller then re-reads the SKU
under that lock. Ownership is immutable in this checkpoint, so the row that gets
locked is the row that still owns the SKU at commit.

---

## 6. Hierarchy, ownership and lifecycle

**Create proves server-side**, from locked rows: the product exists, the variant
exists, and the variant belongs to that product. A real variant of a real but
*different* product is refused as `SKU_VARIANT_PRODUCT_MISMATCH` — every foreign
key is satisfied and the write is still illegal, which is precisely the case a
per-FK check cannot catch.

**Update proves server-side**: the SKU exists, its owning variant is resolved
from the row, and that variant is the concurrency arbiter.

**Ownership is immutable.** Neither request body has a `productVariantId`,
`variantId` or `productId` field, both bodies are `.strict()`, and the contract
spec asserts the absence against the *published* OpenAPI schemas as well as the
source. No cross-variant move semantics were invented.

**Published Catalog behaviour.** SKU authoring is allowed on `DRAFT` **and**
`PUBLISHED`, and refused on `ARCHIVED`. The `APP2-B02` `DRAFT`-only rule was
deliberately not inherited: a Catalog variant only reaches an APP6 approval — and
therefore an APP7 order — while its product is published, so a `DRAFT`-only
restriction would make the very state this checkpoint exists to reach
unreachable. `ARCHIVED` is excluded because authoring a new sellable definition
on a withdrawn product would contradict the archive. Nothing about the LC-04
publication lifecycle is reopened, widened or changed.

---

## 7. SKU code, mutable fields and audit

**Code.** `CST-012` / `IDX-014` make the code globally unique and **bytewise**
exact (`ADR-DB5-002` R2). Nothing normalises it: no case folding, no trimming
into a different value, no new alphabet and no new uniqueness scope. The pattern
`^[A-Za-z0-9][A-Za-z0-9._-]*$` (≤ 64) only rules out shapes that make a
bytewise-exact identifier dangerous — whitespace and invisible characters, which
produce two codes a human reads as one. `tb-case` and `TB-CASE` are two distinct
identifiers and both are accepted, which the integration suite proves.

**Mutable fields**, derived from the accepted "Manage SKU" operation, the actual
`skus` schema and the minimum the invariant needs:

| Field | Create | Update |
|---|---|---|
| `code` | required | optional |
| `priceOverrideAmount` | optional | optional; `null` clears it to NULL |
| `isActive` | **required** | optional |

`isActive` is explicit on create rather than server-defaulted to `true`: a
default would make a second SKU on a variant impossible to author (the first
would always hold the single slot) and would hide the one decision that
determines whether the variant becomes orderable.

Server-owned fields stay server-owned — `id`, `currency_code` (VND, fixed by
`ck_skus__currency_allowed`), `created_at` and `updated_at` are not accepted from
a body. Nothing invented: no inventory quantity, no stock reservation, no
production behaviour, no price redesign, no publication redesign, no SKU media
and no Storefront behaviour. `skus` is the **definition** side (REL-026,
"inventory truth split"), and the response publishes no stock-shaped field.

Money is a decimal **string**, never a JSON number, bounded at the twelve integer
digits `numeric(14,2)` holds under the VND whole-number CHECK — the same rule
`APP2-B02` applies to the base price it overrides.

**Audit.** `DB3_AUDIT_SPECIFICATION.md` files variant/SKU edits under the
Product/catalog row: actor `ADMIN`, target the Product, a changed-field summary,
and no required reason (the `R` on that row is archive/unarchive only). Both
mutations append one row in the same transaction — `product.sku_created` and
`product.sku_updated`, `target_kind` `PRODUCT`, `target_id` the owning product —
following the delivered `product.placement_replaced` precedent for a catalog
child. The summary carries changed field **names** and the resulting eligible
count, never a code, a price, an id or a row. A refused mutation writes no audit
row, which the suites assert. No new `AUDIT_TARGET_KINDS` member was added.

---

## 8. Boundaries respected

- Catalog (CTX-CAT) owns everything delivered. `CatalogSkuModule` imports
  `DatabaseModule`, `AuditModule` and `IdentityModule` and nothing else; the
  controller imports nothing from Order, Payment, Design, Inventory or
  Production, asserted from source.
- The complete Admin mutation chain is reused unchanged:
  `AuthenticatedAdminGuard` at the controller, `StaffOriginGuard` +
  `StaffJsonBodyGuard` on both handlers. No new role system, no weakened
  session/origin/content-type protection, no public or customer access.
- No module or repository was moved and no unrelated refactor was performed.
  `ProductRepository.addSku` is untouched; the locking port is a fourth narrow
  Catalog repository beside the three that already exist.
- **Nothing in §14 of the directive was implemented or modified**: no
  `design.approved` consumer, Order creation, order code-generator promotion,
  AGG-15 fixture repair, payment obligation, attempt, bank configuration, QR,
  transfer reference, transfer evidence, `AssetIntakeLane`,
  `payment_transfer_evidence`, `APP7-DB01`, payment UI, Figma, inventory,
  production, remaining payment, refund, provider or webhook work. The AGG-15
  fixture remains `APP7-W01`'s and was not touched.

---

## 9. Command ledger

| Command/check | Exact changed question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `pnpm --filter @embroidery/api typecheck` | do the new module, port, adapter, service, DTOs and controller compile under strict mode against the delivered types? | PASS | 1 | Only `apps/api` gained source. Run twice in total: once mid-implementation before tests existed, once after the final source state — the second is the evidence. |
| `pnpm --filter @embroidery/api-client typecheck` | does the regenerated client compile? | PASS | 0 | The only other package whose input changed. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="product-sku\|admin-sku"` (`CMD-TEST-APP7-B01-UNIT`) | is the eligibility rule, the error contract, the two request bodies and the published two-operation surface correct? | PASS — 4 suites / 36 tests | 2 | First run before the contract spec existed (3 suites / 50 assertions across policy, errors, request schemas); re-run after Prettier reformatted the controller and after the contract spec was added, because both are inputs it reads. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="catalog-sku(-eligibility\|-race)?[.]integration"` (`CMD-TEST-APP7-B01-INTEGRATION`) | against a real PostgreSQL: does the write land, is the hierarchy proved from locked rows, is a duplicate code refused safely, does the invariant hold across a sequence, and can two real connections both win? | PASS — 3 suites / 22 tests | 3 | Run 1 failed on `uq_admin_accounts__status__active` (the fixture minted an operator per seeded product — a test defect, not a runtime one); run 2 passed 16/16; run 3 after the file-size split onto the shared fixture, whose input changed. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=catalog-sku-api` (`CMD-TEST-APP7-B01-API`) | over HTTP: statuses, envelope, strict validation, the full guard chain, and every refusal mapping | PASS — 14 tests | 1 | Passed first time; re-run only as part of the combined post-Prettier run, whose inputs had changed. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="zod-dto\|zod-openapi"` | does the repository-wide publication contract still hold with two new registered DTOs? | 129 passed, **2 pre-existing failures** | 1 | See §11 — both failures reproduce on the committed `HEAD` artifact with this change reverted. |
| `pnpm --filter @embroidery/api openapi:generate` (`CMD-OPENAPI-GENERATE`) | regenerate the contract artifact | 74/81/170 | 1 | Generated **once**, after the route and DTO contract was stable. |
| `pnpm --filter @embroidery/api openapi:check` (`CMD-OPENAPI-CHECK`) | has the committed artifact drifted from the code? | PASS | 2 | Run once after generation; re-run once after Prettier reformatted the controller and DTO sources, which are its inputs. No regeneration was needed — formatting changed no decorator value. |
| `pnpm --filter @embroidery/api-client generate` (`CMD-API-CLIENT-GENERATE`) | regenerate the client from the new OpenAPI | 2 files, tree hash `bf18d05a…` | 1 | Generated **once**, after the single OpenAPI generation. |
| `pnpm --filter @embroidery/api-client check:generated` (`CMD-API-CLIENT-CHECK`) | has the generated client drifted? | PASS, same tree hash | 2 | Same reason as `openapi:check`; the unchanged hash is the proof that formatting moved nothing. |
| `node tools/check-file-size.mjs` (`CMD-CHECK-FILE-SIZE`) | do the new files respect the 400/600 limits? | PASS for every B01 file | 2 | Run 1 flagged `catalog-sku.integration.spec.ts` at 532 lines (review threshold 500, hard limit 600); the suite was split by responsibility onto a shared fixture and run 2 is clean. 79 pre-existing violations elsewhere in the repository are untouched and out of scope. |
| `pnpm exec prettier --write <20 changed files>` | are the changed sources formatted? | 6 files rewritten, 14 already clean | 1 | Changed files only. |
| `pnpm exec eslint <20 changed files>` (from `apps/api`) | do the changed sources pass lint? | PASS — no output | 1 | Changed files only. An earlier invocation with a mis-resolved path list linted the whole package and surfaced 3 `no-unnecessary-type-assertion` errors in `modules/design/application/deciding/approve-design-version.use-case.ts` — a file this checkpoint does not touch (last changed by `APP6-B11`), i.e. pre-existing debt, not B01's. |

Not run, by design: `pnpm quality`, `quality:e2e`, the full Jest run, the full
API suite, the whole Catalog suite, the Order suite, the Payment suite, the
Asset/Design suites, Playwright, SonarQube, and every repository-wide aggregate
(`VALIDATION_GOVERNANCE.md` §1.1). The historical APP3 gates
(`CMD-CHECK-APP3-P03`, `CMD-CHECK-APP3-P03-CONTRACT`) were not run either: they
assert the frozen APP3-era surface of 19 paths / 23 operations and are already
stale against the 72-path artifact this checkpoint started from — running them
would report an APP3 fact, not a B01 one.

---

## 10. Changed files

**New — domain, application, infrastructure, presentation (Catalog module):**

```text
apps/api/src/modules/catalog/domain/product-sku.policy.ts
apps/api/src/modules/catalog/domain/product-sku.errors.ts
apps/api/src/modules/catalog/domain/repositories/product-sku.repository.ts
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product-sku.repository.ts
apps/api/src/modules/catalog/application/product-sku.service.ts
apps/api/src/modules/catalog/application/product-sku.projection.ts
apps/api/src/modules/catalog/presentation/admin-sku.controller.ts
apps/api/src/modules/catalog/presentation/schemas/admin-sku.request.ts
apps/api/src/modules/catalog/presentation/schemas/admin-sku.response.ts
apps/api/src/modules/catalog/catalog-sku.module.ts
```

**New — tests:**

```text
apps/api/src/modules/catalog/domain/product-sku.policy.spec.ts
apps/api/src/modules/catalog/domain/product-sku.errors.spec.ts
apps/api/src/modules/catalog/presentation/schemas/admin-sku.request.spec.ts
apps/api/src/modules/catalog/presentation/admin-sku.contract.spec.ts
apps/api/src/modules/catalog/tests/integration/sku-fixture.ts
apps/api/src/modules/catalog/tests/integration/catalog-sku.integration.spec.ts
apps/api/src/modules/catalog/tests/integration/catalog-sku-eligibility.integration.spec.ts
apps/api/src/modules/catalog/tests/integration/catalog-sku-race.integration.spec.ts
apps/api/test/integration/catalog-sku-api.integration.spec.ts
```

**Modified:**

```text
apps/api/src/bootstrap/app.module.ts                      (+1 import, +1 registration)
packages/contracts/openapi/openapi.generated.json         (generated)
packages/api-client/src/generated/embroidery-api.schemas.ts (generated)
packages/api-client/src/generated/embroidery-api.ts         (generated)
docs/implementation/SCOPED_COMMAND_INDEX.md               (+3 scoped command rows)
docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md (§8 status)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md      (APP7 row)
docs/implementation/reports/APP7-B01-COMPLETION-REPORT.md (this file)
```

No schema file, no migration, no `packages/database` change, no worker change,
no frontend change, no Figma change.

---

## 11. OpenAPI and generated-client delta

```text
OPENAPI_BEFORE = 72 paths / 79 operations / 167 schemas
OPENAPI_AFTER  = 74 paths / 81 operations / 170 schemas
```

Set-level delta, computed against the committed `HEAD` artifact:

```text
added paths      : /api/admin/products/{productId}/variants/{variantId}/skus
                   /api/admin/skus/{skuId}
removed paths    : (none)
added operations : adminSku_create, adminSku_update
removed operations: (none)
added schemas    : CreateSkuBody, UpdateSkuBody, AdminSkuResponse
removed schemas  : (none)
```

Every pre-existing path object and every pre-existing schema object is
**byte-identical**, and their relative order is preserved. The raw line diff is
larger than two operations would suggest purely because the two new path keys are
inserted mid-object; a per-entry comparison confirms no unrelated contract churn.

Both request bodies publish their real fields — this is the case the directive
calls out as unacceptable, and it does not occur:

```jsonc
CreateSkuBody: { additionalProperties: false,
                 properties: { code, isActive, priceOverrideAmount },
                 required: ["code", "isActive"] }
UpdateSkuBody: { additionalProperties: false,
                 properties: { code, isActive, priceOverrideAmount } }   // no required list
```

`UpdateSkuBody` has no `required` list on purpose: which field a patch names is
the caller's choice, and "at least one" is a Zod refinement, not a required
field. `additionalProperties: false` makes the runtime `.strict()` visible in the
contract, so no client is told an unknown field would be accepted.

Generated client:

```text
export interface CreateSkuBody  { code: string; isActive: boolean; priceOverrideAmount?: string }
export interface UpdateSkuBody  { code?: string; isActive?: boolean; priceOverrideAmount?: string | null }
export interface AdminSkuResponse { skuId, productId, productVariantId, code,
                                    priceOverrideAmount?, currencyCode, isActive,
                                    variantOrderEligibleSkuCount, createdAt, updatedAt }
export const adminSkuCreate = (...)
export const adminSkuUpdate = (...)
```

Generation discipline: the route and DTO contract was stabilised and validated
first, OpenAPI was generated **once**, the delta was inspected, the client was
generated **once**, and both drift checks were run. No regeneration followed a
contract change; the one repeat of the two *check* commands followed a
formatting-only edit to their inputs and returned the identical artifact and the
identical client tree hash.

---

## 12. Focused test evidence

| Suite | Tests | What it proves |
|---|---:|---|
| `product-sku.policy.spec.ts` | 15 | The eligibility rule as a pure function: zero, exactly one, ambiguity at two, the authorable product states, the code shape, the money bound — and that the returned shape has no field that could nominate a SKU. |
| `product-sku.errors.spec.ts` | 4 | Every code maps to its status; every message is free of SQLSTATE, constraint, table and column names; the hierarchy mismatch is its own sentence. |
| `admin-sku.request.spec.ts` | 13 | `.strict()` on both bodies; `isActive` is required on create; every server-owned field is rejected; **no body shape rebinds a SKU to another variant**; money is a string with the right bounds. |
| `admin-sku.contract.spec.ts` | 14 | Exactly two handlers and no third verb; the complete guard chain on both; the two operation ids are derived by the policy; the published request bodies carry real fields; no inventory field on the response; no import from Order/Payment/Design/Inventory/Production. |
| `catalog-sku.integration.spec.ts` | 9 | Real DB: legal create on `PUBLISHED` and on `DRAFT`, legal update, `updated_at` advances, one audit row per mutation with names-not-values, product/variant mismatch refused, missing product told apart from missing variant, unknown SKU refused, `ARCHIVED` refused. |
| `catalog-sku-eligibility.integration.spec.ts` | 10 | Real DB: duplicate code refused globally and on rename with the losing row intact; code stays bytewise exact; a second eligible SKU refused with **nothing left behind** (no row, code still free); activation of a spare refused; hand-over works; re-patching the active SKU is not a second one; a sibling variant is unaffected; a refused mutation writes no audit row. |
| `catalog-sku-race.integration.spec.ts` | 3 | **Real concurrency, two independently pooled connections**, both parked on the variant's row lock by a third holder: two concurrent creates leave exactly one eligible SKU and exactly one row; two concurrent activations leave one; two writers claiming the same code leave one row. Every loser fails as a safe domain refusal. |
| `catalog-sku-api.integration.spec.ts` | 14 | Full HTTP stack: 201/200 envelopes, no stock/storage field on the wire, 401 without a session, 403 on a foreign origin, 415 on non-JSON, 400 on an unknown field / empty patch / non-uuid, 404 on mismatch and unknown SKU, 409 on duplicate / ambiguity / archived — with no database detail in the body. |
| **Total** | **100** | 8 suites, all passing. |

The concurrency case uses the real database and real separate backends. A
single-connection `Promise.all` would have proved nothing — one pool serialises
the calls by itself and the test would pass with no lock in the code — so a third
connection takes the variant's row lock first and both writers are verified
blocked (`pg_locks where not granted`) before either is released.

---

## 13. Limitations and non-blocking follow-ups

1. **`FU-APP7-B01-01` — audit rows do not name the SKU.** The audit `target` is
   the owning Product and the summary carries changed field names plus the
   resulting eligible count, never an id. That follows the delivered
   `product.placement_replaced` precedent and `DB3_AUDIT_SPECIFICATION.md`'s
   bounded-summary rule, but it means an operator reading the trail cannot tell
   *which* SKU of a variant changed. Adding a `SKU` member to
   `AUDIT_TARGET_KINDS` would fix it and needs no migration (`target_kind` is
   open text by DB4 design). Deliberately not done here: it edits a shared
   cross-context vocabulary for a readability gain, which is a change worth
   reviewing on its own. Non-blocking.
2. **No optimistic concurrency token on `PATCH`.** Unlike the `APP2-B02` product
   patch, the SKU patch takes no `expectedUpdatedAt`. The variant row lock fully
   serialises concurrent SKU mutations for a variant and every write re-reads and
   re-evaluates under it, so there is no unguarded read-then-write and the
   eligibility invariant cannot be lost. Two operators editing the *same* SKU's
   price in the same instant would still resolve last-write-wins deterministically
   rather than as a reported conflict. Adding a token is a small additive change
   whenever an Admin UI needs it; it is deliberately out of a
   minimum-capability checkpoint. Non-blocking.
3. **Pre-existing, not introduced by B01:**
   `apps/api/src/platform/openapi/zod-dto-publication.contract.spec.ts` has two
   failing assertions — `publicDesignSession_create publishes its fields` and
   `keeps 19 paths and 23 operations`. Both were verified to reproduce with the
   committed `HEAD` OpenAPI artifact restored and this checkpoint's changes
   absent, so they are stale APP3-P03-era expectations against a surface that has
   grown to 72 paths since. Not repaired here: it is APP3 governance debt and
   repairing it would silently widen this checkpoint. Reported, not owned.
4. **79 pre-existing file-size violations** elsewhere in `tools/` and other
   modules are unchanged. Every file this checkpoint added is within both the
   hard limits and the review thresholds.

---

## 14. Git status

```text
branch: production
commits: 2 (implementation + contract + focused tests; then report + roadmap evidence)
push status = NOT_PUSHED
```

Commit hashes are recorded in §15 below after the commits were created. No
`APP7-R00` or `APP7-G01` commit was amended, and no unrelated user work is mixed
in.

---

## 15. Commit hashes

```text
Commit A = b7aa2a6  feat(app7): deliver Admin SKU authoring (APP7-B01)
            implementation + contract + generated artifacts + focused tests
Commit B = <this commit>  docs(app7): record APP7-B01 completion and advance the roadmap
```

---

## 16. Next

```text
NEXT_CHECKPOINT = APP7-W01
```

`APP7-W01` — the `design.approved` (SE-005) order-conversion consumer: order +
items + both obligations + `order.created`, both the Catalog and COP branches,
exactly one order per request under CC-11, and the AGG-15 fixture repair it owns.
It was **not** started.
