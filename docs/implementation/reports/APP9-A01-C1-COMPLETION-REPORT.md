# APP9-A01-C1 — Curated API-Client Barrel Hard-Limit Correction — Completion Report

## 1. Verdict

```text
APP9-A01 = COMPLETE
APP9-A01-C1 = PASS
API_CLIENT_ROOT_BARREL = SPLIT_BY_RESPONSIBILITY
HANDWRITTEN_SOURCE_HARD_LIMIT = PASS
ROOT_PUBLIC_API = UNCHANGED (414 names in, 414 names out)
ADMIN_APPLICATION_SOURCE_CHANGED = 0 files
GENERATED_FILES_EDITED = 0
OPENAPI_CHANGES = 0
FIGMA_APPROVAL = FIG-APPROVAL-APP9-D01-PO-001 (untouched)
NEW_ADMIN_ROUTES = 0
NEXT_CHECKPOINT = APP9-S01
NOT_PUSHED = true
```

## 2. Correction reason

The first `APP9-A01` attempt added a 63-line curated APP9 block to
`packages/api-client/src/index.ts`, taking it from **1168** to **1231** lines,
and disposed of the overrun as a nonblocking finding for a later checkpoint.

The Product Owner refused that disposition, correctly. The file is handwritten
source, not generated tooling, so CLAUDE.md §6's hard maximum of 400 lines
applies to it, and A01 modified it. A checkpoint cannot pass while a source file
it edited stands at three times the limit — and "a later checkpoint" is how a
file reaches 1231 lines in the first place, one appended block at a time.

The overrun is a symptom worth naming: the file had **no responsibility of its
own**. It was the place every delivered capability appended its exports to, which
is exactly the shape CLAUDE.md §5 warns about. C1 gives each part of the surface
a subject.

## 3. Branch, entry HEAD, push state

```text
branch           production
A01/C1 entry HEAD 4884e2e   (docs(app9): deliver the APP9 design package …)
C1 commit         none — the working tree carries A01 + C1, uncommitted
push              NOT_PUSHED = true — nothing was pushed at any point
```

## 4. The A01 tree was corrected in place

No part of A01 was discarded or re-implemented. The accepted A01 working tree was
carried forward unchanged and C1 edited **10 files** on top of it:

```text
9  packages/api-client/src/*.ts      the split (1 rewritten root + 8 new barrels)
1  apps/admin/test/support/fulfillment-fixture.ts   §12
```

Verified by modification time across `packages/api-client/src`, `apps/admin/src`,
`apps/admin/test` and `docs` — the only files touched in the C1 window are those
ten, plus the two documents in §18. **Zero Admin application source files were
changed.**

## 5. Original line count

```text
packages/api-client/src/index.ts
  at A01 entry HEAD (4884e2e)   1168
  after A01                     1231   ← the blocking defect
```

## 6. Final root line count

```text
packages/api-client/src/index.ts   46
```

A thin root barrel: a doc comment recording why the surface is split and the
rules that govern what may be on it, then eight `export * from` lines.

## 7. New curated barrels

| File | Responsibility | Lines |
|---|---|---|
| `platform.ts` | The transport itself — client factories, per-call options, error normalization, envelope types, health. No product domain. | **43** |
| `identity.ts` | Who is calling and how they proved it — staff sessions (`APP1`), customer verification and secure-link resolution (`APP4-B03/B04/B06`), Admin customer support and notification delivery (`APP4-B07/B08`). | **142** |
| `catalog.ts` | Assets, products and publication (`APP2`) — Admin authoring beside the anonymous public reads that serve the same catalog. | **122** |
| `design-studio.ts` | The 2D Studio (`APP3`) — placement authoring, template management, private assets, Design Document types, anonymous bootstrap/session/autosave. | **250** |
| `custom-requests.ts` | Customer-owned products and custom requests (`APP5`) — public submission and grant-scoped status beside the Admin queue, detail and moderation. | **200** |
| `quotation-and-design-review.ts` | One negotiation, both sides (`APP6`) — customer secure quotation and design review, Admin quotation and design-case workbenches. | **246** |
| `orders-and-payments.ts` | Orders and the money against them (`APP7` + `APP9`) — Admin order/deposit workspace, customer secure deposit surface, Admin commerce completion. | **243** |
| `inventory-and-production.ts` | Inventory reservation and production operations (`APP8`) — SKU stock, work queue, job detail and guarded transitions. | **100** |

**The split is by responsibility, not by line count.** The boundaries are the
section comments the original list already carried; no section was cut in half
and no barrel is a line range. The check that proves it: the splitter asserted
every non-blank line of the original was claimed by exactly one barrel, and it
would have thrown otherwise.

Two groupings deserve their reason stated, because both merge what a naive
by-phase split would have separated:

- **`orders-and-payments.ts`** holds `APP7` and `APP9` together. An order's
  lifecycle and its obligations are one subject: the same verification operation
  settles a deposit and a balance, and the dispatch guard reads an obligation the
  payment half owns. Splitting them would put the guard and the thing it guards
  in different files.
- **`quotation-and-design-review.ts`** holds the customer and Admin halves of
  `APP6` together, because a version the Admin sends is the version the customer
  decides on. The correspondence is the point.

Conversely, `APP2`'s public catalog reads live with `APP2`'s Admin authoring
rather than in a "storefront" barrel: they are two views of one catalog, and an
actor-based split would have hidden that an operator publishing a product decides
exactly what a customer then reads.

## 8. Every changed handwritten source file is within the limit

```text
  250  packages/api-client/src/design-studio.ts
  246  packages/api-client/src/quotation-and-design-review.ts
  243  packages/api-client/src/orders-and-payments.ts
  200  packages/api-client/src/custom-requests.ts
  142  packages/api-client/src/identity.ts
  122  packages/api-client/src/catalog.ts
  100  packages/api-client/src/inventory-and-production.ts
   46  packages/api-client/src/index.ts
   43  packages/api-client/src/platform.ts
```

Hard maximum **400**: every file passes, and every one is also under the 300-line
review threshold. No 600–1000 line replacement barrel was created; the largest is
250.

The one Admin file C1 touched is a test-support fixture:

```text
  158  apps/admin/test/support/fulfillment-fixture.ts   (test limit 600)
```

## 9. Proof the root public API remains compatible

Three independent checks.

**Name-level diff.** The export surface of the pre-split barrel — reconstructed
as the A01 entry HEAD file plus the 17 names the accepted APP9 block added — was
compared against the union of the eight new barrels:

```text
expected (HEAD + APP9)   414
after split              414
missing                  none
unexpected new           none
duplicate across barrels none
```

Comments are stripped before extraction, so a symbol merely *mentioned* in prose
is never miscounted as exported. No symbol was renamed; no value export became a
type-only export or the reverse — the `export` / `export type` form of every
statement moved verbatim.

**Consumer type-check.** `apps/admin` type-checks clean against the package root.
The Admin app imports from `@embroidery/api-client` in dozens of feature services
and every one still resolves, which is the strongest available proof that the
root boundary is unchanged in practice.

**The package's own root-barrel smoke test.** `src/public-api.smoke.test.ts`
imports from `./index` both as a namespace and by named value and type imports,
and asserts the generated operations and the handwritten runtime are re-exported
together. It passes unmodified — 12/12.

No consumer needs a new import path. Nothing imports a barrel by subpath, and
`package.json` still publishes exactly one entry (`"." → "./src/index.ts"`),
unchanged.

## 10. APP9 curated exports disposition

All 17 names the accepted A01 block added remain reachable from the package root,
now living in `orders-and-payments.ts` beside the `APP7` order and payment
operations they belong with:

```text
operations  adminOrderTransition, adminOrderShippingRead, adminOrderShippingSave,
            adminOrderDispatch, adminOrderComplete
enums       TransitionAdminOrderBodyTo, AdminShippingDetailResponseStatus,
            AdminOrderTransitionResultResponseStatus,
            AdminOrderDispatchResponseStatus
types       TransitionAdminOrderBody, AdminOrderTransitionResultResponse,
            AdminShippingDetailResponse, AdminShippingDetailSavedResponse,
            AdminShippingFeeOutcomeResponse, SaveShippingDetailBody,
            AdminOrderDispatchResponse, AdminOrderCompletionResponse
```

**`publicOrderShippingFeeAcknowledge` is still not exported** — verified
programmatically, not by inspection. Grouping the shipping operations into one
barrel made adding it locally tidier, which is exactly the pressure the first A01
authority decision exists to resist: an Admin write may never mint the customer's
acknowledgement of a higher shipping fee (`APP9-B04-C1`). The barrel's own doc
comment now records that it is absent on purpose, so a future editor arranging
this file finds the reason before the gap.

## 11. Generated artifacts untouched

```text
packages/api-client/src/generated/*   UNCHANGED (git reports nothing)
packages/contracts/openapi/*          UNCHANGED (git reports nothing)
OpenAPI regeneration                  NOT RUN
API-client regeneration               NOT RUN
```

C1 moved handwritten re-export statements between handwritten files. Every one of
them still re-exports `./generated/*` by the same path.

## 12. A01 frontend behavior untouched

No file under `apps/admin/src` was modified by C1 — no component, hook, model,
service, style, query key or route. The `/orders` badges, the fulfillment
workspace, the shipping editor, the fee-acknowledgement refusal, dispatch,
completion and the invalidation strategy are byte-identical to the accepted A01
tree.

**One test-support file changed, and it is worth reporting plainly.** The Admin
type-check failed on `apps/admin/test/support/fulfillment-fixture.ts`:

```text
error TS2352: Conversion of type '{ … carrierName: string … }' to type
'AdminShippingDetailResponse' may be a mistake because neither type sufficiently
overlaps with the other.
```

This is a **defect in the first A01 attempt, not in the split**. The `APP9-A01`
validation order runs the type-check at step 4 and writes the focused tests at
step 6, so the fixture was created *after* the only type-check that ran and was
never checked. The first A01 report's claim that "Admin typecheck passes" was
true of the tree at the moment it ran, but it did not cover the test files added
afterwards. C1 surfaced it because it re-ran the consumer type-check.

The fix is minimal and type-only: `as AdminShippingDetailResponse` became
`as unknown as AdminShippingDetailResponse`, with the fixture's existing doc
comment extended to say why. TypeScript is right that `string` and
`{ [key: string]: unknown } | null` do not overlap — that mismatch *is*
`FU-APP9-A01-01` — and the fixture must keep sending the string the server really
sends. The production narrowing in `shipping-detail-form.ts` still uses a real
`typeof` check and no cast at all; the double assertion is confined to this one
fixture.

Type assertions are erased by the TypeScript transform, so the emitted test
JavaScript is unchanged and no runtime behavior moved.

## 13. Figma approval untouched

```text
docs/design/FIGMA_DESIGN_INDEX.md   not modified by C1
36 APP9 rows                        APPROVED_FOR_IMPLEMENTATION
approval evidence                   FIG-APPROVAL-APP9-D01-PO-001
```

No Figma node was opened, no design work was rerun, and the design-index gate was
not run — C1 changed nothing the gate reads.

## 14. Commands run

| Command | Result |
|---|---|
| `npx prettier --write packages/api-client/src/*.ts` | passed — all unchanged |
| `npx eslint` (root + all 8 barrels, scoped) | **passed** |
| `pnpm --filter @embroidery/api-client typecheck` | **passed** |
| `npx tsc --noEmit` (`apps/admin`) — first run | **failed** — 1 error, §12 |
| `npx tsc --noEmit` (`apps/admin`) — after the fixture fix | **passed** |
| `npx prettier --check apps/admin/test/support/fulfillment-fixture.ts` | passed |
| `npx eslint apps/admin/test/support/fulfillment-fixture.ts` | **passed** |
| `npx jest src/public-api.smoke.test.ts` (api-client) | **passed** — 12/12 |

Repository-wide ESLint was **not** run, per §12 of the correction brief. The
inherited APP6 Admin test lint finding was not touched.

## 15. Narrow export test

`packages/api-client/src/public-api.smoke.test.ts` — **12/12, run once**.

It is the one test that directly covers the root barrel: it imports `./index` as
a namespace *and* by named value and type imports, and asserts that the generated
operations and the handwritten runtime cross together. Exactly the property the
split could have broken.

## 16. A01 UI tests were not rerun

```text
Admin application source changed by C1:  0 files
A01 UI suites rerun:                     none
```

Neither the 11 focused APP9 cases nor the 9 existing order suites were rerun. Per
§10 of the correction brief, the Admin type-check is the proof that root imports
remain valid across the consumer, and it passes.

The one Admin file C1 edited is a test fixture, and the edit is a type assertion —
erased at compile time, so the emitted test is byte-identical and no rerun could
observe a difference the type-check did not already prove.

## 17. Reruns and the exact intervening change

**One rerun, of `npx tsc --noEmit` in `apps/admin`.**

- First run: **failed**, `TS2352` on `fulfillment-fixture.ts:49`.
- Intervening change: `fulfillment-fixture.ts` only — `as AdminShippingDetailResponse`
  → `as unknown as AdminShippingDetailResponse`, plus a paragraph in the file's
  doc comment explaining it. Nothing else in the repository changed between the
  two runs.
- Second run: **passed**.

That is a rerun after a real source fix, not a confidence rerun. No other command
was run twice, and no combined final-confidence run was performed.

## 18. Changed files

```text
M  packages/api-client/src/index.ts                       1231 -> 46, thin root barrel
A  packages/api-client/src/platform.ts                    43
A  packages/api-client/src/identity.ts                    142
A  packages/api-client/src/catalog.ts                     122
A  packages/api-client/src/design-studio.ts               250
A  packages/api-client/src/custom-requests.ts             200
A  packages/api-client/src/quotation-and-design-review.ts 246
A  packages/api-client/src/orders-and-payments.ts         243
A  packages/api-client/src/inventory-and-production.ts    100

M  apps/admin/test/support/fulfillment-fixture.ts         type-only fixture fix (§12)

M  docs/implementation/reports/APP9-A01-COMPLETION-REPORT.md
     finding §29.4 retired as RESOLVED BY C1; §32 size claim corrected;
     verdict blocks record APP9-A01-C1 = PASS
M  docs/implementation/phases/APP9-REMAINING-PAYMENT-AND-FULFILLMENT.md
     roadmap only: the A01 entry records the C1 correction
A  docs/implementation/reports/APP9-A01-C1-COMPLETION-REPORT.md
```

No Admin application source, route, style, database, migration, worker, OpenAPI,
generated file or Figma artifact was touched. `package.json` is unchanged — the
package still publishes one entry point.

## 19. Remaining non-blocking findings

Carried forward unchanged:

1. **`FU-APP9-A01-01`** — the shipping contract's nullable string members are
   declared `nullable: true, type: "object"`, so Orval types them
   `{ [key: string]: unknown } | null`. Narrowed at the feature seam with a real
   `typeof` check; the fixture's double assertion in §12 is the same defect seen
   from the test side. **Owner: a later backend checkpoint.**
2. **Three approved Figma figures lack a delivered read** — the
   `PRODUCTION_COMPLETED` and open-dialog "total − deposit" balance, the
   acknowledged-fee amount, and the queue's deposit/remaining columns. Drawn but
   unbacked; A01 renders the approved API-gap treatment instead. **Owner: PO /
   a later checkpoint.**
3. **Inherited Admin ESLint error** — an unused import in an untouched APP6 test
   file, plus the default-heap OOM on whole-app `eslint .`. Not introduced here
   and not fixed here.
4. **`FU-ADMIN-SHARED-DIALOG-01`** — still open and unowned.

**Not carried forward:** the "api-client index is 1231 lines" finding. C1
resolves it, and no replacement debt item was created for the same violation.

## 20. Roadmap

```text
R00   COMPLETE
G01   COMPLETE
B01   COMPLETE
B02   COMPLETE
B03   COMPLETE
W01   COMPLETE
B04   COMPLETE
B05   COMPLETE
D01   COMPLETE
A01   COMPLETE
S01   NEXT
E01   INCOMPLETE
X01   INCOMPLETE
```

Exactly one `NEXT`. S01 was not begun.

## 21. Stop

```text
APP9-A01 = COMPLETE
APP9-A01-C1 = PASS
API_CLIENT_ROOT_BARREL = SPLIT_BY_RESPONSIBILITY
HANDWRITTEN_SOURCE_HARD_LIMIT = PASS
FIGMA_APPROVAL = FIG-APPROVAL-APP9-D01-PO-001
NEW_ADMIN_ROUTES = 0
NEXT_CHECKPOINT = APP9-S01
NOT_PUSHED = true
```
