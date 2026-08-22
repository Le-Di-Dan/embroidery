# APP7-B01-C1 — Correction report

**Phase:** APP7 — Deposit Payment and Order Creation
**Checkpoint:** `APP7-B01-C1` — remove the invented SKU-code alphabet
**Parent:** `APP7-B01`
**Correction budget:** 1 / 1 — used
**Mode:** NARROW CONTRACT / VALIDATION CORRECTION
**Date:** 2026-08-22

---

## 1. Verdict

```text
APP7-B01-C1 = COMPLETE
APP7-B01    = COMPLETE — CORRECTED (C1)
APP7-B01-C2 = MUST_NOT_BE_CREATED

DEFECT = INVENTED_SKU_CODE_CHARACTER_POLICY
DEFECT_DISPOSITION = REMOVED, NOT REPLACED

REMOVED = ^[A-Za-z0-9][A-Za-z0-9._-]*$   (request schema + both OpenAPI bodies
                                          + both generated-client types)
REPLACEMENT_ALPHABET = NONE
INVENTED_NORMALIZATION = NONE (none existed in B01 and none was added)

OPENAPI_BEFORE = 74 paths / 81 operations / 170 schemas
OPENAPI_AFTER  = 74 paths / 81 operations / 170 schemas
OPENAPI_DELTA  = 2 deleted lines, both the `pattern` key —
                 CreateSkuBody.code and UpdateSkuBody.code. Nothing else.

SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE
CONCURRENCY_CHANGE = NONE
RACE_SUITE_RERUN = NO — no concurrency or eligibility input changed

NEXT_CHECKPOINT = APP7-W01
```

The Product Owner's finding is accepted without argument. `APP7-B01` was told to
reuse existing SKU-code authority exactly and instead narrowed a `text` column to
an ASCII alphabet no accepted source establishes. A Vietnamese SKU code —
`ÁO-THUN-ĐEN-M` — was legal in the database, legal under every ADR, and rejected
by the API and by every generated client. In a Vietnamese embroidery catalog that
is not a theoretical narrowing.

---

## 2. Authority audit — `skus.code`, pre-B01

Sources inspected:

| Source | What it establishes about `code` |
|---|---|
| `packages/database/src/schema/catalog/skus.ts:20,50,59-60` | `code: text('code').notNull()`; `unique('uq_skus__code')`; the file comment: "a technical exact identifier, unique globally, bytewise comparison". **No CHECK constraint on this column.** |
| `docs/database/DB4_COLUMN_DICTIONARY.md:208` | `COL-TBL014-02 \| code \| text \| no \| yes \| UQ; business SKU code` — type, NOT NULL, mutable, unique. No length, no pattern. |
| `docs/database/DB4_KEYS_AND_CONSTRAINTS.md:47` | `CST-012 \| UQ \| skus \| code \| REQ-VAR-002 \| duplicate SKU code` — a uniqueness constraint and nothing else. |
| `docs/database/DB5_CONSTRAINT_INDEX_MAP.md:44`, `DB5_INDEX_CATALOG.md:44` | `IDX-014`, the constraint-created unique B-tree. |
| `docs/database/DB5_INDEXES_CATALOG_GALLERY_CONTENT.md:73` | "SKU code lookup uses IDX-014 (CST-012) — bytewise exact, per ADR-DB5-002 R2." |
| `ADR-DB5-002` R1 | Files `skus.code` under **Population A — technical exact-match identifiers**, alongside `slug`, `storage_key`, `token_hash`. Bytewise semantics are *required*. |
| `ADR-DB5-002` R2 | No `COLLATE` clause; comparison is bytewise; equality is byte equality; the unique constraint is the whole index story. |
| `ADR-DB5-002` R3 | Names the columns stored **already normalized**: lowercase email, E.164-style phone (CON-163/164), slugified paths. A SKU code is **not** among them. |
| `docs/database/DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` G5 | TBL-014 implemented with CST-012 (IDX-014); the only CHECKs recorded for the group are the two money groups (CST-063/068/DEV-DB6-005). No text CHECK. |
| `apps/api/.../catalog-persistence.integration.spec.ts:240-255` | Pre-B01 `ProductRepository.addSku` tests use `'TEE-BLK-M'` and `'STRUCT-1'`. **Usage, not a rule** — no test asserts any character policy. |
| Repository-wide grep | No `btrim`, non-blank or length CHECK exists on `skus.code`, or on any other `code` column. |

### Disposition table

| Rule | Accepted authority | C1 disposition |
|---|---|---|
| string type | `text` — `catalog/skus.ts:50`, COL-TBL014-02 | **keep** |
| nullability | `.notNull()` — COL-TBL014-02 "N? = no" | **keep** |
| maximum length | **NONE** — `text`, not `varchar(n)`; DB4 records no length | see §3 |
| non-empty / nonblank | **NONE** — no CHECK on this or any `code` column | see §3 |
| case / exact comparison | bytewise, `C` collation, no `COLLATE` — ADR-DB5-002 R1 + R2 | **keep**, unchanged |
| uniqueness scope | global on `code` — CST-012 / `uq_skus__code` / IDX-014 | **keep**, unchanged |
| **allowed-character alphabet** | **NONE** | **REMOVED** |
| **normalization / trimming** | **NONE** for this column — ADR-DB5-002 R3 names email, phone and slug, not SKU codes | **none exists; none added** |

Two rows deserve to be stated plainly rather than buried: **`text` restricts no
character, and "bytewise comparison" is a statement about equality, not about
which bytes may be stored.** B01 cited the second as if it implied the first. It
does not, and that was the whole error.

---

## 3. What changed, and the two bounds that remain

**Removed.** `SKU_CODE_PATTERN` is deleted from `product-sku.policy.ts` and the
`.regex(...)` call is deleted from `skuCodeSchema`. It was **not replaced** — no
second alphabet, no `format`, no enum, no uppercase/lowercase/ASCII/slug-safe/
URL-safe/bank-reference-safe rule. The SKU code is not the APP7 transfer
reference and does not borrow its `^[A-Z0-9]{15}$` shape.

**No normalization was introduced.** B01 already trimmed nothing, folded nothing
and replaced nothing; C1 keeps it that way, and the request spec now proves it
with a value that would betray any silent fix (`'  tee blk  '` round-trips
byte-identical through the schema).

**Two bounds remain, and both are reported rather than assumed acceptable:**

- `.max(64)` — the audit records **no** authoritative maximum, so this is a
  request-payload bound, not an identifier rule. It is kept because the column is
  unbounded `text` and an unbounded string accepted from an HTTP body is an
  abuse surface; the repository already has this exact precedent, `APP2-B02`'s
  `PRODUCT_NAME_MAX_LENGTH` / `PRODUCT_DESCRIPTION_MAX_LENGTH`, which its own
  policy file labels "mirroring nothing but sane input". It restricts no
  character and changes no stored byte. **If the Product Owner reads the C1
  scope as covering length too, this is the one line to remove** — the code and
  the tests are written so that removing `.max(...)` touches nothing else.
- `.min(1)` — the audit records no blank rule either. Per the directive's §2,
  none was invented in C1; this is B01's pre-existing bound, and it refuses only
  a body that sends `code: ""`, which is a request that names no identifier at
  all. It performs no trimming, so `'   '` is accepted and stored verbatim.

Both are documented in the source as payload bounds, so a later reader cannot
mistake either for an authority-derived rule.

---

## 4. What was deliberately not touched

Frozen exactly as `APP7-B01` delivered it, and verified untouched by diff:

```text
2 Admin SKU operations, adminSku_create / adminSku_update
Catalog bounded-context ownership
product/variant hierarchy checks
immutable SKU -> variant ownership
order-eligible = skus.is_active
exactly-one eligible invariant; zero remains legal; ambiguous refused
product_variant FOR UPDATE arbiter; product FOR SHARE lifecycle read
CST-012 as final duplicate arbiter; 23505 -> SKU_CODE_CONFLICT -> 409
DRAFT/PUBLISHED authoring, ARCHIVED refusal
Admin guard chain; audit transaction behaviour
no schema, no migration, no Order/payment/QR/evidence work
```

No file under `application/`, `infrastructure/`, `domain/repositories/`, the
controller, the response schema, the module or `sku-fixture.ts` was modified.
That last one matters for §6: the race suite's inputs are provably unchanged.

Not widened into, as instructed: `FU-APP7-B01-01` (audit readability), the
missing `expectedUpdatedAt` on `PATCH`, the stale APP3 Zod/OpenAPI assertions,
and the pre-existing file-size violations. `APP7-W01` was not started.

---

## 5. Discriminating regression

The values were **derived from the audit, then tested** — not chosen and then
justified. The derivation is recorded in the spec itself so the next reader can
check it:

- `skus.code` is `text NOT NULL`, and `text` restricts no character.
- ADR-DB5-002 R1 files it under Population A, compared bytewise under `C` (R2).
  That ADR's own decision drivers name `Đ` and `à` as characters whose *ordering*
  is arbitrary under `C` while equality stays exact — so a Vietnamese code is
  precisely the case the collation choice was made to handle, not one it excludes.
- R3 lists the pre-normalized columns; a SKU code is not one, so no normalization
  may narrow it either.

| Value | Legal per authority | Refused by B01's regex |
|---|---|---|
| `ÁO-THUN-ĐEN-M` | yes | yes — non-ASCII |
| `TEE/BLK M#1` | yes | yes — `/`, space, `#` |

Proved, at every layer the directive names:

| Claim | Where | Result |
|---|---|---|
| request schema accepts it (create and update) | `admin-sku.request.spec.ts` | PASS |
| HTTP accepts it, end to end through Zod → service → column | `catalog-sku-api.integration.spec.ts` | 201 |
| the database stores the exact value unchanged | `catalog-sku-eligibility.integration.spec.ts` — re-read via `where code = $1` | PASS |
| the response returns the exact value unchanged | both integration suites | PASS |
| an exact duplicate is still refused by DB uniqueness | both integration suites | `SKU_CODE_CONFLICT` / 409 |
| the value is not trimmed, folded or replaced | `admin-sku.request.spec.ts` (`'  tee blk  '`) | round-trips identical |
| the payload bound still restricts length, not characters | `admin-sku.request.spec.ts` | 64 `Đ` accepted; 65 `A` refused |

**Negative tests removed**, because they asserted a rule that is no longer
authoritative: the former `SKU code shape` block in `product-sku.policy.spec.ts`
(leading/trailing/inner space, leading separator, non-breaking space,
zero-width joiner, anchoring). Nothing was left behind that would fail if the
regex returned — the opposite: two new guards make its return a test failure.

**New guards against re-invention:**

- `product-sku.policy.spec.ts` asserts the module exports **no `RegExp` at all**
  and no `SKU_CODE_PATTERN`, and no export whose name matches
  `normal|slug|trim|fold|canonical`. A replacement alphabet under another name
  fails this.
- `admin-sku.contract.spec.ts` asserts the published `CreateSkuBody.code` and
  `UpdateSkuBody.code` carry no `pattern`, no `format` and no `enum`, and that
  the generated client contains no such regex.

---

## 6. Why the race suite was not rerun

`catalog-sku-race.integration.spec.ts` exercises `ProductSkuService`, the Drizzle
adapter, the eligibility evaluator and `sku-fixture.ts`. **None of those files
was modified.** The correction touched only the code-validation constant, the
request schema, three spec files and the two generated artifacts.

Code validation and eligibility do share one source file
(`product-sku.policy.ts`), and the directive is explicit that a file-level edit
is not on its own a reason to rerun unrelated DB races. The edit deleted one
exported constant that no concurrency path reads: `evaluateOrderEligibility`,
`MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT`, `SKU_ORDER_ELIGIBLE_IS_ACTIVE`,
`SKU_AUTHORABLE_PRODUCT_STATES` and `SKU_CURRENCY` are byte-identical. The B01
race evidence therefore stands unchanged.

`catalog-sku.integration.spec.ts` (hierarchy and lifecycle) and
`product-sku.errors.spec.ts` were not rerun for the same reason — no input of
theirs changed.

---

## 7. Command ledger

| Command/check | Changed input / question | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="product-sku.policy\|admin-sku.request"` | the two files carrying code validation: is the alphabet gone, are the authority-legal codes accepted, is nothing normalized? | PASS — 2 suites / 37 tests | 0 | The only unit-level inputs that changed. Passed first run. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-sku.contract"` | does the published contract still advertise the pattern? | PASS — 1 suite / 17 tests | 1 | Run once after adding the no-pattern assertions; re-run once after Prettier reformatted this same spec file, which is its own input. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="catalog-sku-eligibility\|catalog-sku-api"` | real DB + HTTP: is a formerly-rejected code accepted, stored byte-identical, returned unchanged, and still one identity for uniqueness? | PASS — 2 suites / 25 tests | 0 | The two suites that gained a discriminating case. Passed first run. |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-sku.contract\|catalog-sku-api"` | do the two Prettier-reformatted spec files still pass? | PASS — 2 suites / 32 tests | — | Not a repeat on unchanged input: Prettier rewrote both files after their previous run. |
| `pnpm --filter @embroidery/api openapi:generate` | regenerate after the schema change | 74/81/170 | 0 | Generated **once**, after the corrected schema was stable and its unit tests passed. |
| `pnpm --filter @embroidery/api openapi:check` | has the committed artifact drifted? | PASS | 0 | Run once after generation. The later Prettier pass touched only spec files, not the DTO or controller, so its inputs did not change again. |
| `pnpm --filter @embroidery/api-client generate` | the OpenAPI input changed | 2 files, tree hash `dd7ee08d…` | 0 | Generated **once**. |
| `pnpm --filter @embroidery/api-client check:generated` | has the generated client drifted? | PASS, same hash | 0 | Run once after generation. |
| `pnpm --filter @embroidery/api typecheck` | does the API still compile with the constant removed? | PASS | 0 | Only affected package with source changes. |
| `pnpm --filter @embroidery/api-client typecheck` | does the regenerated client compile? | PASS | 0 | The other package whose input changed. |
| `pnpm exec prettier --write <7 changed files>` | are the changed files formatted? | 2 rewritten, 5 already clean | 0 | Changed files only. |
| `pnpm exec eslint <7 changed files>` | do they pass lint? | PASS — no output | 0 | Changed files only. |
| `git diff --check` | whitespace errors in the diff? | clean | 0 | — |
| `grep -rn "SKU_CODE_PATTERN\|A-Za-z0-9]\[A-Za-z0-9"` over `apps/api/src`, `packages/api-client/src`, `packages/contracts` | does the alphabet survive anywhere? | 2 hits, both intentional: the regression guard in the policy spec and the historical note in the policy doc comment | 0 | Narrow diagnostic instead of a broad suite. |

Not run, with no changed input to justify them: `catalog-sku-race.integration.spec.ts`
(see §6), `catalog-sku.integration.spec.ts`, `product-sku.errors.spec.ts`, the
full Catalog suite, the full API suite, full Jest, `pnpm quality`, `quality:e2e`,
the Order / Payment / Asset / Design suites, Playwright and SonarQube.

---

## 8. OpenAPI and generated-client delta

The generation counts are unchanged, which is the point — this correction removes
a claim, it does not move the surface:

```text
paths      74 -> 74
operations 81 -> 81   (adminSku_create, adminSku_update — no new route)
schemas   170 -> 170
```

The complete artifact diff is two deleted lines:

```diff
-            "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$",     (CreateSkuBody.code)
-            "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$",     (UpdateSkuBody.code)
```

The complete generated-client diff is two deleted lines:

```diff
-   * @pattern ^[A-Za-z0-9][A-Za-z0-9._-]*$
-   * @pattern ^[A-Za-z0-9][A-Za-z0-9._-]*$
```

`maxLength: 64` remains on both, as the payload bound §3 explains. Client tree
hash moved `bf18d05a…` → `dd7ee08d…`, and `check:generated` confirms the
committed client matches.

---

## 9. Changed files

```text
apps/api/src/modules/catalog/domain/product-sku.policy.ts
    - SKU_CODE_PATTERN deleted; the authority audit recorded in the doc comment;
      SKU_CODE_MAX_LENGTH re-documented as a payload bound
apps/api/src/modules/catalog/presentation/schemas/admin-sku.request.ts
    - .regex(...) and its import removed; skuCodeSchema is now .string().min(1).max(64)
apps/api/src/modules/catalog/domain/product-sku.policy.spec.ts
    - alphabet block removed; replaced by no-RegExp / no-normalizer guards
apps/api/src/modules/catalog/presentation/schemas/admin-sku.request.spec.ts
    - discriminating acceptance cases + no-mutation + length-not-characters
apps/api/src/modules/catalog/presentation/admin-sku.contract.spec.ts
    - published schemas carry no pattern/format/enum on `code`; client carries no regex
apps/api/src/modules/catalog/tests/integration/catalog-sku-eligibility.integration.spec.ts
    - real-DB exact-storage + duplicate-refusal proof for ÁO-THUN-ĐEN-M
apps/api/test/integration/catalog-sku-api.integration.spec.ts
    - HTTP acceptance, exact round-trip and 409 on the exact duplicate
packages/contracts/openapi/openapi.generated.json          (generated, -2 lines)
packages/api-client/src/generated/embroidery-api.schemas.ts (generated, -2 lines)
docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
docs/implementation/reports/APP7-B01-C1-CORRECTION-REPORT.md  (this file)
```

No schema file, no migration, no service, adapter, port, controller, module or
shared fixture.

---

## 10. History

`APP7-B01-COMPLETION-REPORT.md` is **left as written**. It records the pattern in
§7 and in its OpenAPI excerpt, and that record stays: rewriting it would erase
the fact that the defect shipped and was caught in review. This report supersedes
those two passages and is linked from both roadmap entries. The policy source
also keeps a one-line note of what B01 shipped and why it was wrong, so the next
person to reach for a convenient regex finds the reason not to.

---

## 11. Git

```text
branch: production
Commit C = 079f812  fix(app7): remove the invented SKU-code alphabet (APP7-B01-C1)
                    validation/contract correction + focused regressions + generated artifacts
Commit D = <this commit>  docs(app7): record APP7-B01-C1 and mark B01 corrected
push status = NOT_PUSHED
```

No `APP7-B01`, `APP7-G01` or `APP7-R00` commit was amended.

---

## 12. Next

```text
APP7-B01-C1 = COMPLETE
APP7-B01    = COMPLETE — CORRECTED (C1)
APP7-B01-C2 = MUST_NOT_BE_CREATED
NEXT_CHECKPOINT = APP7-W01
```

`APP7-W01` — the `design.approved` (SE-005) order-conversion consumer — was not
started.
