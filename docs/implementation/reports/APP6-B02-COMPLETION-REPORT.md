# APP6-B02 — Admin Quotation Read: Version History + Version Detail

**Status:** `COMPLETE` — delivered for Product Owner review
**Date:** 2026-08-20
**Scope:** Two Admin read operations over the delivered AGG-14 quotation
persistence. Read-only. No migration, no send, no customer surface.

---

## 1. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `f1ab02b` — *docs(app6): record the APP6-B01 commit hash in its completion report* |
| Working tree at entry | **Clean** — `git status --porcelain` empty |
| `1f5ba22` reachable from HEAD | **Yes** — `git merge-base --is-ancestor 1f5ba22 HEAD` exits 0 |
| Branch | `production` |
| OpenAPI at entry | 60 paths / **65 operations** / 135 schemas |
| Unrelated user changes | None. The whole diff below is this checkpoint's. |

`APP6-B01 = ACCEPTED` per the Product Owner decision recorded in the B02 brief.

---

## 2. Delivered surface — exactly two operations

```text
GET /api/admin/quotations/{quotationId}/versions             → adminQuotation_versionHistory
GET /api/admin/quotations/{quotationId}/versions/{versionId} → adminQuotation_versionDetail
```

Both are Admin-only, both are `GET`, neither accepts a body, and neither accepts
an operator identity — `AuthenticatedAdminGuard` binds the Admin server-side and
`quotationId` / `versionId` are resource locators.

### Operation-id family

The reads live on a **second controller** (`AdminQuotationVersionController`)
rather than on `APP6-B01`'s, because B01's contract test states that its class
exposes exactly two handlers and because a read surface sharing a class with a
write surface acquires the write surface's guards and DI. Left to the default
policy that split would have minted `adminQuotationVersion_versionHistory`,
letting a file-layout decision name a public identifier — so
`CONTROLLER_DOMAIN_KEYS` now declares both classes as the one `adminQuotation`
domain, the same mechanism `APP3-B04A` and `APP5-B05` used.

`APP6-B01`'s two accepted ids are **unchanged**, and a contract test asserts it.

### Guard composition

| Guard | B01 mutations | B02 reads | Why |
|---|---|---|---|
| `AuthenticatedAdminGuard` | controller | controller | The whole gate; identical to every Admin read in the repository |
| `StaffOriginGuard` | per handler | **absent** | A CSRF-shaped check for state-changing requests |
| `StaffJsonBodyGuard` | per handler | **absent** | A GET has no body to content-type check |

Cargo-culting either onto a GET would reject legitimate reads; a contract test
asserts both are absent.

---

## 3. Response contracts

Five new bounded response schemas, none reusing a write-request DTO:

| Schema | Role |
|---|---|
| `AdminQuotationVersionHistoryResponse` | header + the version list |
| `AdminQuotationVersionDetailResponse` | header + one version + its lines |
| `AdminQuotationHeaderResponse` | the quotation a version belongs to |
| `AdminQuotationVersionResponse` | one historical version's recorded facts |
| `AdminQuotationLineItemResponse` | one frozen priced line |

Standard API envelope, canonical enum values (`QUOTATION_VERSION_STATES`,
`QUOTATION_LINE_KINDS` from the schema package), ISO-8601 timestamps, exact-money
strings.

### Errors — two, and only two

```text
QUOTATION_NOT_FOUND          404 — no such quotation
QUOTATION_VERSION_NOT_FOUND  404 — this quotation has no version with that id
```

No write or conflict code was invented for a read: the published statuses are
`200 / 400 / 401 / 404`, and a contract test asserts `409`, `415` and `503` are
**absent** from both operations.

`QUOTATION_VERSION_NOT_FOUND` is deliberately the same answer for "no such
version" and "that version belongs to a different quotation" — otherwise the
wrong path would confirm that another quotation's row exists.

---

## 4. Historical explainability — the load-bearing evidence

### What was widened, and why it is not a schema change

`QuotationVersion` (the AGG-14 domain projection) previously carried nine of the
row's columns. The adjustment, its reason, the deposit percent, the stitch count
and every lifecycle timestamp were **persisted but not projected** — so a read
that had to explain a historical version would have been forced either to
recompute them or to re-read current policy. Both are explicitly forbidden by
§5.

The projection and its row mapper were therefore widened to carry
`stitchCount`, `manualAdjustmentAmount`, `adjustmentReason`, `depositPercent`,
`validFrom`, `supersededAt`, `expiredAt` and `createdAt`. Every one is an
existing column, read straight through. **No migration, no DDL, no dataset
change, and no change to B01 pricing or policy semantics.** The drafting path
compiles and behaves unchanged (123/123 across the module).

Four columns were deliberately **not** projected — `colorCount`,
`physicalWidthMm`, `physicalHeightMm`, `productName`/`variantLabel`. Nothing in
the delivered era writes them, so publishing them would be fabricating display
facts that are always `null`.

### Proved against real rows

| Property | Evidence |
|---|---|
| History returns all versions in deterministic order | Three versions priced 100k / 120k / 90k return `[1,2,3]` — a sort on any amount would give a different sequence |
| Detail returns version N, never the current one | Version 1 read while versions 1–2 exist returns 1's total and 1's line, not 2's |
| Later versions do not change earlier ones | A version is read, two more are appended, and the identical read is asserted `toEqual` the first — plus the adjustment, reason, total, stitch count and unit price named individually so an equally-wrong pair cannot pass |
| Deposit share is the one priced at, not today's | Two versions at `30.00` and `50.00` both read back their own share |
| A superseded version stays explainable | After `send(v1)` then `send(v2)`, v1 reads `SUPERSEDED` with its original `sentAt`, `validUntil` and total intact |
| A not-yet-reached fact is absent, not invented | A `DRAFT` reads `sentAt`/`validFrom`/`validUntil`/`acceptedAt`/`supersededAt`/`expiredAt`/`adjustmentReason` all undefined |
| Wrong quotation + version fails cleanly | A version of quotation B addressed through quotation A's path → `QUOTATION_VERSION_NOT_FOUND` |
| Missing quotation / version fail cleanly | Both refusals asserted separately, including the ordering (quotation checked first) |
| Line items are the version's own, by position | Lines inserted at positions 3, 1, 2 read back `[1,2,3]` with matching kinds |

The `SENT` and `SUPERSEDED` fixtures are seeded through
`QuotationRepository.send` — the DB7-CP4 **persistence** operation delivered long
before this phase. No application send was implemented to manufacture a state.

---

## 5. Exact money

```text
DB numeric(14,2) → persistence string → application string → OpenAPI string → generated client string
```

- B02 performs **no** money arithmetic. There is no `Number()`, no `parseFloat`,
  no recalculation of subtotal/total/deposit/remaining, and no re-rounding of a
  persisted amount anywhere on the read path — the projection assigns the column
  and stops.
- Every money property of all five schemas publishes `type: string`; a contract
  test walks the schemas by `$ref` and asserts it, with a companion test that
  counts what it found (7 on the version, 2 on the line, 0 on the header) so the
  assertion cannot pass vacuously.
- The generated client types all nine money field names `string`, and is asserted
  **not** to type any of them `number`.
- One integration test drives an odd total whose 40% share is not a whole đồng:
  the read returns the recorded `420000.00` / `629999.00`, not the `419999.60`
  that re-deriving from `depositPercent` would produce — a figure the customer
  was never shown and, per `currencyScaleCheck` (DEV-DB6-005), one the column
  cannot even hold.

### Nullable metadata — the `type: object` debt was not extended

`nullable: true` without an explicit `type` publishes `type: object`, which Orval
turns into an index signature; the repository carries ~18 such properties from
earlier checkpoints. Every new nullable property here passes `type: String` or
`type: Number`, so:

```text
AdminQuotationVersionResponse.adjustmentReason  {"type":"string","nullable":true}
AdminQuotationVersionResponse.stitchCount       {"type":"number","nullable":true}
AdminQuotationHeaderResponse.currentVersionId   {"type":"string","nullable":true}
AdminQuotationLineItemResponse.skuId            {"type":"string","nullable":true}
… and validFrom / validUntil / sentAt / acceptedAt / supersededAt / expiredAt
```

and the generated client says `string | null` / `number | null`. Two contract
tests enforce this — one rejecting `type: object` on any nullable property of the
five schemas, one asserting the union in the generated client.

---

## 6. Read-side effects = none

Structural first: `QuotationReadModule` imports **only** `QuotationModule` and
`IdentityModule`. There is no `DatabaseModule`, so no `TransactionManager` and no
executor can be injected — nothing composed in the read surface can open a
transaction, and adding a write would require changing that module. There is no
`OrderModule`, so `custom_requests` is unreachable; no policy reader, so a
deposit share cannot be recomputed; no outbox recorder, no notification module,
no grant issuer.

Proved behaviourally against real rows:

| Claim | Evidence |
|---|---|
| No row, pointer or state changes | Full `select *` snapshot of `quotations`, `quotation_versions` and `quotation_line_items` before and after three reads — asserted `toEqual` |
| No version is appended, no line added | Row counts of both tables unchanged |
| No request transition, no outbox event | `custom_request_transitions` and `outbox_events` counts unchanged |
| The custom request is untouched | `status`, `current_quotation_id` and `updated_at` unchanged; `current_quotation_id` still `NULL` |
| No expiry-on-read | A `SENT` version with a `validUntil` an hour in the past reads back `SENT` with `expiredAt` null, and the row is re-queried directly to confirm |

`custom_requests.current_quotation_id` was **not** set. The APP6 expiry sweep
remains deferred.

---

## 7. OpenAPI / generated client — one cycle, no loop

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec tsc --noEmit` | clean |
| 2 | `pnpm --filter @embroidery/api openapi:generate` | paths 60 → **61**, operations 65 → **67**, schemas 135 → **140** |
| 3 | diff against `HEAD:openapi.generated.json` | **+2 operations, +5 schemas, 0 removed, 0 renamed** (below) |
| 4 | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 5 | `pnpm --filter @embroidery/api-client generate` | 2 files, 4763 lines, tree hash `e64c1ddd…` |
| 6 | `pnpm --filter @embroidery/api-client check:generated` | up to date, same tree hash |
| 7 | `tsc --noEmit` on `@embroidery/api` and `@embroidery/api-client` | both clean |

```text
ADDED:
  + GET /api/admin/quotations/{quotationId}/versions              adminQuotation_versionHistory
  + GET /api/admin/quotations/{quotationId}/versions/{versionId}  adminQuotation_versionDetail
REMOVED: (none)
SCHEMAS ADDED: AdminQuotationHeaderResponse, AdminQuotationLineItemResponse,
               AdminQuotationVersionDetailResponse, AdminQuotationVersionHistoryResponse,
               AdminQuotationVersionResponse
SCHEMAS REMOVED: (none)
```

Paths went 60 → 61 rather than 60 → 62 because `{quotationId}/versions` already
existed as a `POST` path item; the history read is a second method on it.

**Regenerations: 1.** No decorator, path, operation id or DTO changed after
step 2. Prettier later reflowed comment whitespace in the response schema file,
so `openapi:check` was rerun to prove the artifact still matched — it did.

---

## 8. Test ledger

Change-impact scoped. Every rerun below follows a **real input change**.

| Suite | Command | Tests | Runs | Why more than once |
|---|---|---|---|---|
| B02 read (integration) | `… jest src/modules/quotation/tests/integration/quotation-read.integration.spec.ts` | 20 | 2 | First run: 17/20. Three real fixture defects — two truncated codes colliding on `uq_quotations__code` (UUIDv7 is time-ordered, so ids minted in the same millisecond share a long prefix) and one fixture using a fractional đồng that `currencyScaleCheck` rejects outright. Fixed, rerun green. |
| B02 published surface (contract) | `… jest src/modules/quotation/presentation/admin-quotation-version.contract.spec.ts` | 22 | 2 | First run: one failure — the money assertion required every listed schema to carry an amount, which the quotation **header** correctly does not. Replaced with a per-schema count so it stays non-vacuous without being false. |
| B01 published surface (contract) | `… jest src/modules/quotation/presentation` | 18 | 2 | Its "exactly two quotation operations" claim was path-based and B02 added two `GET`s. Narrowed to the mutations it owns; the family total is now asserted once, by B02's suite. Rerun after the edit. |
| Whole quotation module | `… jest src/modules/quotation` | **123 / 7 suites** | 2 | Rerun after Prettier reflowed four files |
| API typecheck | `pnpm --filter @embroidery/api exec tsc --noEmit` | — | 2 | Once before generation, once after the contract spec landed |
| api-client typecheck | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | — | 1 | — |
| Lint | `pnpm --filter @embroidery/api exec eslint src/modules/quotation src/openapi/operation-id.ts src/bootstrap/app.module.ts` | — | 1 | clean |
| Format | `npx prettier --write <16 changed sources>` | — | 1 | 4 files reflowed |
| Whitespace | `git diff --check` | — | 1 | clean |

**Totals: 42 new focused tests; 123 green across the whole quotation module.**

### Explicitly not run

B01 policy publication integration; B01 pricing suite (pricing source unchanged);
the APP6 dataset-reader suite; full API regression; full repository tests; worker;
Admin/Storefront; Playwright/E2E; DB manifest/fingerprint/checksum/index suites;
historical APP3/APP4/APP5 gates; the Figma checker; SonarQube. No B02 change
touches their owning inputs. The B01 *drafting* integration suite **was** run —
inside the module run above — because the repository port and row mapper it
depends on were widened.

No new scoped command or checker was added, so
`SCOPED_COMMAND_INDEX.md` is unchanged (§16 condition not met). Focused tests
prove the boundaries a bespoke checker would have.

---

## 9. Files changed

**New — quotation read surface (9)**

```text
apps/api/src/modules/quotation/domain/reads/quotation-read.errors.ts
apps/api/src/modules/quotation/application/reads/quotation-version.view.ts
apps/api/src/modules/quotation/application/reads/quotation-version.projection.ts
apps/api/src/modules/quotation/application/reads/read-quotation-version-history.query.ts
apps/api/src/modules/quotation/application/reads/read-quotation-version-detail.query.ts
apps/api/src/modules/quotation/presentation/admin-quotation-version.controller.ts
apps/api/src/modules/quotation/presentation/schemas/admin-quotation-version.request.ts
apps/api/src/modules/quotation/presentation/schemas/admin-quotation-version.response.ts
apps/api/src/modules/quotation/quotation-read.module.ts
```

**New — tests (2)**

```text
apps/api/src/modules/quotation/presentation/admin-quotation-version.contract.spec.ts
apps/api/src/modules/quotation/tests/integration/quotation-read.integration.spec.ts
```

**Modified (5)**

```text
apps/api/src/modules/quotation/domain/repositories/quotation.repository.ts   — widened QuotationVersion projection
apps/api/src/modules/quotation/infrastructure/persistence/quotation-row.mapper.ts — project the widened columns
apps/api/src/modules/quotation/presentation/admin-quotation.contract.spec.ts — narrowed to the mutations it owns
apps/api/src/openapi/operation-id.ts                                        — adminQuotation domain, two classes
apps/api/src/bootstrap/app.module.ts                                        — register QuotationReadModule
```

**Generated (2)** — `packages/contracts/openapi/openapi.generated.json`,
`packages/api-client/src/generated/*`

**Docs (2)** — this report and the APP6 phase plan.

### File-size compliance

| File | Lines | Limit |
|---|---|---|
| `admin-quotation-version.response.ts` | 324 | 400 |
| `admin-quotation-version.controller.ts` | 258 | 400 |
| `admin-quotation-version.contract.spec.ts` | 275 | 600 |
| `quotation-read.integration.spec.ts` | 556 | 600 |

Every other new file is well under. No `tools/check-*.mjs` was added.

---

## 10. Scope guard

Not modified: database schema or migrations; the APP6 policy dataset; B01 pricing
semantics; quotation send logic; custom-request transitions; customer secure
access; frontend or Figma; the worker; design documents; agreements; payment,
order or inventory behaviour. No new dependency.

---

## 11. Follow-up routing

| Follow-up | Disposition |
|---|---|
| `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01` | `CARRIED_TO_B03` — unchanged. B02 is read-only and `current_quotation_id` is still `NULL`, asserted by an integration test. |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | `LATER_IF_THIRD_CONSUMER` — no third consumer appeared. |
| `FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01` | `OUTSIDE_B02` — untouched. |

**New follow-up raised by B02:**

| Id | Description |
|---|---|
| `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` | Roughly 18 nullable properties in older schemas (`AdminPlacementAreaResponse`, `CatalogRequestSubjectResponse`, `CustomerOwnedRequestSubjectResponse`, `CustomRequestStatusResponse`, …) publish `type: object` because `nullable: true` was set without an explicit `type`, so the generated client gives them an index signature instead of `T \| null`. B02 did not extend the debt and did not repair it — repairing it changes accepted published contracts and belongs in its own checkpoint. |

---

## 12. Verdict

```text
APP6-B01 = ACCEPTED
APP6-B02 = COMPLETE
HTTP OPERATIONS ADDED = 2
VERSION HISTORY READ = DELIVERED
EXACT VERSION DETAIL + LINE ITEMS = DELIVERED
HISTORICAL VERSIONS = READABLE
HISTORICAL FACTS = NOT RECALCULATED
EXACT MONEY = STRING END TO END
READ SIDE EFFECTS = NONE
CURRENT_QUOTATION_POINTER FOLLOW-UP = CARRIED TO B03
DATABASE MIGRATION = NONE
B03/B04/B05 = NOT STARTED
NEXT CHECKPOINT = APP6-B03
```

Committed locally as `<recorded below>`. **Nothing pushed.**

**Local commit:** `PENDING`
