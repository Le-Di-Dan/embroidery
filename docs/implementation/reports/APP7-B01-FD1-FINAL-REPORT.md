# APP7-B01-FD1 — Final authority repair report

**Phase:** APP7 — Deposit Payment and Order Creation
**Parent checkpoint:** `APP7-B01`
**Previous correction:** `APP7-B01-C1`
**Mode:** FINAL_MANDATORY_DIRECTIVE / NO_FURTHER_CORRECTION
**Date:** 2026-08-22

---

## 1. Verdict

```text
APP7-B01-FD1 = COMPLETE
APP7-B01-C1  = SUPERSEDED_BY_FINAL_AUTHORITY_REPAIR
APP7-B01     = COMPLETE — CORRECTED — REVIEW_READY
APP7-B01-C2  = MUST_NOT_BE_CREATED

SKU_CODE_TYPE              = STRING
SKU_CODE_NULLABILITY_AT_DB = NOT_NULL
SKU_CODE_MAX_LENGTH        = NONE
SKU_CODE_NONEMPTY_RULE     = NONE
SKU_CODE_ALPHABET          = NONE
SKU_CODE_NORMALIZATION     = NONE
SKU_CODE_COMPARISON        = BYTEWISE_EXACT
SKU_CODE_UNIQUENESS        = GLOBAL_DB_UNIQUE

HTTP_OPERATIONS    = 2
SCHEMA_CHANGE      = NONE
MIGRATION_CHANGE   = NONE
CONCURRENCY_CHANGE = NONE

NEXT_CHECKPOINT = APP7-W01
```

The request schema for both bodies is now exactly:

```ts
const skuCodeSchema = z.string();
```

`SKU_CODE_MAX_LENGTH` is **deleted**, not lowered or raised. No constant, comment
or test now claims that 64 is the SKU-code bound.

---

## 2. The ruling, accepted

`APP7-B01-C1` produced the correct audit and then did not finish acting on it. It
recorded `max length = NONE` and `nonblank = NONE`, kept `.min(1).max(64)`
anyway, and defended them as payload bounds. The Product Owner's ruling is right
on both counts, and the second is the one worth restating:

> A field-specific rule that rejects an otherwise authority-valid database value
> is a domain/API contract constraint, regardless of whether the comment calls it
> a "payload bound".

Labelling a constraint does not change what it does. A 65-character SKU code was
legal in the database, legal under every ADR, and rejected by the API — the same
class of defect as the ASCII alphabet, one layer less visible. Transport abuse is
the delivered body-size controls' concern, and this directive changes none of
them.

C1's report did name `max(64)` as "the one line to remove" if the scope was read
that way. It was, and it is removed.

---

## 3. Physical-truth check (directive §10)

The directive permits stopping only if `skus.code` carries a pre-B01 CHECK or
type constraint contradicting the C1 audit. It does not:

```sql
-- packages/database/migrations/0007_create_catalog_tables.sql:56-69
CREATE TABLE "skus" (
    ...
    "code" text NOT NULL,
    ...
    CONSTRAINT "uq_skus__code" UNIQUE("code"),
    CONSTRAINT "ck_skus__price_override_non_negative" CHECK (...),
    CONSTRAINT "ck_skus__currency_allowed"           CHECK (...),
    CONSTRAINT "ck_skus__currency_scale"             CHECK (...)
);
```

The three CHECKs are the two money columns' rules. **No CHECK touches `code`**,
the type is unbounded `text`, and the three later migrations that mention `skus`
(`0008`, `0021`, `0023`) only add foreign keys pointing at `skus.id`. The C1
audit is confirmed against physical truth, not just against the schema module.

**Second runtime layer:** none. `ProductSkuService` passes `command.code`
straight to the repository and `DrizzleProductSkuRepository` writes it
unmodified; neither contains a length, character or emptiness rule. So per
directive §8, schema and contract tests are sufficient and no database or HTTP
round trip was added.

---

## 4. Exact changes

| File | Change |
|---|---|
| `domain/product-sku.policy.ts` | `SKU_CODE_MAX_LENGTH` **deleted**. The doc block is rewritten to record the authority (now citing the physical DDL line numbers) and to state both absences — no alphabet, no length/nonblank bound — with the reason each was removed. No dead constant, no comment claiming 64. |
| `presentation/schemas/admin-sku.request.ts` | `skuCodeSchema` is `z.string()`. `.min(1)`, `.max(...)` and the `SKU_CODE_MAX_LENGTH` import removed. No `.regex`, `.trim`, `.transform`, `.toLowerCase`, `.toUpperCase`, normalization, `format` or enum was introduced. |
| `domain/product-sku.policy.spec.ts` | The `SKU_CODE_MAX_LENGTH = 64` assertion is replaced by a guard that **no `SKU_CODE*` export exists at all**, so a successor bound under another name fails. The C1 guards (no `RegExp`, no normalizer) are untouched. |
| `presentation/schemas/admin-sku.request.spec.ts` | Three values added to the authority-derived table: the empty string, a whitespace-only value and a 300-character value. The "still bounds the payload length" test is **removed** — it asserted a rule that is no longer authoritative. A non-string is still refused, which is the wire type, not a SKU rule. |
| `presentation/admin-sku.contract.spec.ts` | The published `code` must be `{"type":"string"}` and carry none of `pattern`, `format`, `enum`, `minLength`, `maxLength`. The generated-client guard is now scoped to the `code` declaration alone. |
| `packages/contracts/openapi/openapi.generated.json` | generated — 4 deleted lines |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | generated — 8 deleted lines (two JSDoc blocks) |
| phase plan, master roadmap, this report | status |

Nothing else was touched. No service, adapter, port, controller, response
schema, module, fixture or migration.

### On the generated-client assertion

Scoping that guard to `code` was not cosmetic. The first version asserted the
whole interface block carried no `@pattern`, and it **failed** — correctly, on
`priceOverrideAmount`'s `@pattern ^\d{1,12}$`, which is the VND whole-đồng rule
`ck_skus__currency_scale` enforces and is exactly the kind of authority-backed
constraint that *should* survive. The assertion was narrowed to the `code`
declaration rather than the money rule being weakened to satisfy it.

---

## 5. Contract requirements (directive §7)

Published schemas after FD1:

```jsonc
CreateSkuBody.properties.code === { "type": "string" }
UpdateSkuBody.properties.code === { "type": "string" }
```

No `pattern`, `format`, `enum`, `minLength` or `maxLength` — and none is emitted
automatically, so there is no generator behaviour to explain: a bare `z.string()`
converts to `{ "type": "string" }` and nothing more.

Surface, unchanged as required:

```text
paths      74
operations 81
schemas   170
operation ids: adminSku_create, adminSku_update
```

No new path, operation or schema. `required: ["code", "isActive"]` on
`CreateSkuBody` is unchanged — requiring the *key* is not a rule about the value.

### OpenAPI delta from C1 — the complete diff

```diff
-            "maxLength": 64,
-            "minLength": 1,     (CreateSkuBody.code)
-            "maxLength": 64,
-            "minLength": 1,     (UpdateSkuBody.code)
```

Four deleted lines, exactly the unauthorized length claims, nothing else.

### Generated-client delta — the complete diff

```diff
-  /**
-   * @minLength 1
-   * @maxLength 64
-   */          (CreateSkuBody.code)
-  /**
-   * @minLength 1
-   * @maxLength 64
-   */          (UpdateSkuBody.code)
```

Resulting declarations:

```ts
export interface CreateSkuBody { code: string;  isActive: boolean;  /* @pattern ^\d{1,12}$ */ priceOverrideAmount?: string }
export interface UpdateSkuBody { code?: string; isActive?: boolean; /* @nullable @pattern ^\d{1,12}$ */ priceOverrideAmount?: string | null }
```

Client tree hash `dd7ee08d…` → `aea58600…`; `check:generated` confirms the
committed client matches.

---

## 6. Regressions (directive §8)

The smallest set that proves the four required claims, all at schema and
contract level, with no new corpus:

| # | Claim | Where | Result |
|--:|---|---|---|
| 1 | a code longer than 64 characters is accepted | `admin-sku.request.spec.ts` — `'X'.repeat(300)`, both bodies | PASS |
| 2 | the empty string is accepted | `admin-sku.request.spec.ts` — `''`, both bodies | PASS |
| 3 | no trim, case-fold or normalization occurs | `admin-sku.request.spec.ts` — `'  tee blk  '`, `'tb-case'`, `'TB-CASE'`, `'ÁO-THUN-ĐEN-M'` all round-trip identical through both bodies | PASS |
| 4 | published OpenAPI has no `pattern`/`format`/`enum`/`minLength`/`maxLength` for `code`, and the client carries no annotation | `admin-sku.contract.spec.ts` | PASS |

Also retained from C1 and still passing: the Vietnamese and ASCII-punctuation
codes, and `'   '` added here — the directive's §3 list is covered by the schema
table without a fixture per value.

Kept as guards against a successor rule: the policy module must export no
`RegExp`, no normalizer, and **no `SKU_CODE*` name at all**.

Removed: the C1 test asserting `Đ`×64 passes and `A`×65 fails. It asserted the
bound this directive deletes.

No real-DB race test, hierarchy test or lifecycle test was rerun.

---

## 7. Everything frozen stayed frozen

Verified by diff — none of these files was touched:

```text
2 Admin operations, adminSku_create / adminSku_update
Catalog ownership; product/variant hierarchy proof; immutable SKU ownership
skus.is_active eligibility; zero legal; exactly one convertible; multiple refused
product_variant FOR UPDATE; product FOR SHARE; post-write re-evaluation; rollback
DRAFT/PUBLISHED authoring; ARCHIVED refusal
Admin guards; audit behaviour; error mapping; response schema; module structure
CST-012 / uq_skus__code -> 23505 -> SKU_CODE_CONFLICT -> 409
no schema, no migration, no index, no collation change, no normalization
```

No concurrency redesign, no optimistic token, no audit-vocabulary change, no
`APP7-W01` work, and no `APP7-B01-C2` created.

---

## 8. Command ledger

| Command/check | Changed input / question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `sed`/`grep` over `migrations/0007…sql:56-69` and every later migration mentioning `skus` | directive §10 — does a physical CHECK or type constraint contradict the C1 audit? | No CHECK on `code`; `text NOT NULL`; later migrations add only FKs to `skus.id` | 0 | Narrow diagnostic; answers the only question that could have stopped this repair. |
| `grep` over `product-sku.service.ts`, `drizzle-product-sku.repository.ts` | directive §8 — is there a second runtime layer bounding the code? | none; pass-through | 0 | Decides that schema + contract tests suffice and no round trip is owed. |
| `jest --testPathPatterns="product-sku.policy\|admin-sku.request"` | the two files carrying code validation: are empty, >64 and unnormalized values accepted, and is every `SKU_CODE*` export gone? | PASS — 2 suites / 43 tests | 0 | The only unit-level inputs that changed. Passed first run. |
| `jest --testPathPatterns="admin-sku.contract"` | do the published schemas or the client still claim a length? | PASS — 1 suite / 17 tests | 2 | Run 1 **failed**: the client guard was written too broadly and caught `priceOverrideAmount`'s legitimate money `@pattern`. Assertion narrowed to the `code` declaration; run 2 passed. Run 3 followed Prettier reformatting this same file, which is its own input. |
| `pnpm --filter @embroidery/api openapi:generate` | regenerate after the schema change | 74/81/170 | 0 | Generated **once**, after the corrected schema and its unit tests passed. |
| `pnpm --filter @embroidery/api openapi:check` | has the committed artifact drifted? | PASS | 0 | Once. The later Prettier pass touched only a spec file, not the DTO or controller. |
| `pnpm --filter @embroidery/api-client generate` | the OpenAPI input changed | 2 files, tree hash `aea58600…` | 0 | **Once.** |
| `pnpm --filter @embroidery/api-client check:generated` | has the client drifted? | PASS, same hash | 0 | Once. |
| `pnpm --filter @embroidery/api typecheck` | does the API compile with the constant deleted? | PASS | 0 | Only affected package with source changes. |
| `pnpm --filter @embroidery/api-client typecheck` | does the regenerated client compile? | PASS | 0 | The other package whose input changed. |
| `grep -rn "SKU_CODE_MAX_LENGTH\|SKU_CODE_PATTERN"` over `apps/api/src`, `packages/` | any dead constant, stale import or misleading comment left? | 4 hits, all intentional: 2 regression guards and 2 historical notes in doc comments | 0 | Narrow diagnostic instead of a broad suite; directly answers §6's "no dead constant or misleading comment". |
| `pnpm exec prettier --write <5 changed files>` | formatting | 1 rewritten, 4 clean | 0 | Changed files only. |
| `pnpm exec eslint <5 changed files>` | lint | PASS — no output | 0 | Changed files only. |
| `git diff --check` | whitespace errors | clean | 0 | — |

Not run, with no changed input to justify them, exactly as §9 directs:
`catalog-sku-race.integration.spec.ts`, `catalog-sku.integration.spec.ts`,
`catalog-sku-eligibility.integration.spec.ts`,
`catalog-sku-api.integration.spec.ts`, `product-sku.errors.spec.ts`, the full
Catalog integration set, the full API suite, full Jest, `pnpm quality`,
`quality:e2e`, the Order / Payment / Asset / Design suites, Playwright and
SonarQube.

The two integration suites deserve their own sentence: loosening a validator
cannot make a previously-accepted value fail, every code they use remains valid,
and no layer they exercise changed. Rerunning them would be a rerun for
confidence.

---

## 9. Git

```text
branch: production
Commit E = a1eccfc  fix(app7): restore exact SKU code authority (APP7-B01-FD1)
                    final authority repair + focused regressions + generated artifacts
Commit F = <this commit>  docs(app7): record APP7-B01-FD1 and mark B01 review-ready
push status = NOT_PUSHED
```

No `APP7-B01`, `APP7-B01-C1`, `APP7-G01` or `APP7-R00` commit was amended; the
repair is recorded forward. The original B01 and C1 reports are left as written.

---

## 10. Next

```text
APP7-B01 = COMPLETE — CORRECTED — REVIEW_READY
NEXT_CHECKPOINT = APP7-W01
```

`APP7-W01` — the `design.approved` (SE-005) order-conversion consumer — was not
started.
