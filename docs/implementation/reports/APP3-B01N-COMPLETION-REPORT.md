# APP3-B01N — Completion Report

**Checkpoint:** `APP3-B01N` — Product Side normalization request producer
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `2c4303d` (`docs(app3): record APP3-W01A evidence`)
**Commit A:** `2ada7033ebfa73042bcf8516ff2ce3db131d90b8`
**Directive:** CLAUDE EXECUTION PROMPT — APP3-B01N

---

## 1. Accepted entry

```text
APP3-B01/B01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-G06 = COMPLETE — REVIEW_ACCEPTED, IMP-D046 = LOCKED
APP3-W01A = COMPLETE — REVIEW_ACCEPTED
APP3-B01N = READY — NOT STARTED
```

Local `production`, clean tree at `2c4303d`. `check-app3-b01`, `check-app3-w01a`
and `check-app3-g06` PASS; both applications typecheck and build; `format:check`
and `lint` PASS. `IMP-D041`…`IMP-D046` and the accepted ADRs are preserved and
unmodified. `FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01` stays open; B01N adds no
HTTP body and is not blocked by it.

## 2. The shared event contract

`packages/domain-types/src/events/asset-normalization-requested.ts` owns the
whole vocabulary and nothing else:

| Export | Value |
| --- | --- |
| `ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE` | `asset.normalization.requested` |
| `ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION` | `1` |
| `ASSET_NORMALIZATION_POLICY_VERSION` | `1` |
| `ASSET_NORMALIZATION_ASSOCIATION_REF_FIELDS` | the three kinds → their id field |
| `AssetNormalizationAssociationRef` / `…Payload` | the discriminated types |
| `buildAssetNormalizationRequestedPayload` | pure builder; fixes both versions itself |

Runtime parsing and exact-key validation stay worker-owned. The worker's payload
module now aliases the shared names (`ASSET_NORMALIZATION_EVENT_TYPE`,
`ASSET_NORMALIZATION_PAYLOAD_VERSION`, `ASSOCIATION_REF_FIELDS`) so nothing else
in `APP3-W01A` changed, and `NORMALIZATION_POLICY_VERSION` is taken from the
contract rather than re-declared. Neither application imports the other; the gate
asserts that in three spellings, including the relative path that climbs out of
one app and back into the other, and refuses any second declaration of the event
string in either source tree.

### The manifest conflict, raised and resolved

`@embroidery/domain-types` resolved to TypeScript source (`main:
./src/index.ts`) with no build output. The shared contract exports runtime
**values**, so `import type` erasure could not hide the requirement: under
IMP-D018 the compiled API and worker would fail at load inside the container —
the exact `APP2-T01` defect that `contracts-package-boundary.spec.ts` exists to
catch, and one no unit test would have found. This was raised before any edit.

Authorized resolution (Option 1): give the package the standard IMP-D018 runtime
build, matching `@embroidery/design-engine` exactly — `dist` main, types and
exports, `tsc -p tsconfig.build.json`, `rimraf dist` — and declare it under
**dependencies** in both applications.

```text
APPROVED_NARROW_SCOPE_DEVIATION = DOMAIN_TYPES_RUNTIME_BUILD_AND_DUAL_APP_WORKSPACE_LINK
```

Proof of the lockfile delta — the whole diff is 16 lines:

```text
apps/api      importer: '@embroidery/domain-types' → link:../../packages/domain-types
apps/worker   importer: '@embroidery/domain-types' → link:../../packages/domain-types
domain-types  importer: '@types/node' 26.1.1, rimraf 6.1.3 (already-resolved versions)
```

No new external resolution, no version upgrade, no unrelated importer change, no
root `package.json` change. Runtime resolution proven from both compiled outputs:

```text
require.resolve('@embroidery/domain-types', { paths: ['./apps/api/dist'] })
  → packages/domain-types/dist/index.js  → 'asset.normalization.requested'
require.resolve('@embroidery/domain-types', { paths: ['./apps/worker/dist'] })
  → packages/domain-types/dist/index.js  → loads
```

`contracts-package-boundary.spec.ts` still passes 2/2 and
`check-api-dist-boundary` reports 501 clean built files.

## 3. Payload

```json
{
  "schemaVersion": 1,
  "assetId": "<resulting background_asset_id>",
  "normalizationPolicyVersion": 1,
  "associationRef": { "kind": "PRODUCT_SIDE_BACKGROUND", "productSideId": "<resulting side id>" }
}
```

Written to `outbox_events` as `event_type = asset.normalization.requested`,
`aggregate_kind = ASSET` (the durable effect is one derivative per Asset;
`ASSET` was already in `OUTBOX_AGGREGATE_KINDS`, so no new kind and no
migration), `aggregate_id = assetId`, `payload_schema_version = 1`,
`status = PENDING`. No profile, storage key, owner, secret, URL or media type —
asserted by both a unit case and the live suite.

## 4. Transaction ordering

```text
CAS on products.updated_at succeeds        ← lockProductForReplace
backgrounds proven usable
placement plan validates
sides/areas written                        ← this.apply(plan)
audit row appended
normalization events appended              ← this.normalization.record(...)
transaction commits
```

The append is the last write and sits inside `runInTransaction`, after the Side
rows exist, before the response is built. The recorder joins the caller's
transaction — it never opens one, makes no network call and is never
fire-and-forget. The gate asserts all five positions by source index, not by
comment.

## 5. Append / no-append matrix

| Case | Events | Proven by |
| --- | --- | --- |
| new active Side with background B | 1 (B) | unit + live |
| existing Side A → B | 1 (B only) | unit + live |
| new superseding Side with background B | 1 (B) | unit |
| two new/changed Sides | 2, in plan order | unit + live |
| two Sides sharing one Asset | 2 | unit + live |
| same background re-sent | 0 | unit + live |
| display-name / display-order only | 0 | unit + live |
| geometry only | 0 | unit |
| Area only | 0 | unit + live |
| retirement by omission | 0 | unit + live |
| already-retired Side omitted again | 0 | live |
| Admin read | 0 | live |
| stale CAS | 0 | live |
| validation failure | 0 | live |
| database guard rollback | 0 | live |
| failure after the append | 0 | live |
| concurrent replace, one winner | only the winner's | live |

The rule is derived from the **plan**, not from the request:
`changedSideFields` already omits `backgroundAssetId` when the requested Asset is
the stored one, so every no-append case above falls out of one condition rather
than an enumeration that would eventually miss a case. Changing A → B schedules B
only; A's `NORMALIZED` derivative is never deleted — asserted directly against
`asset_derivatives` after the change.

## 6. Idempotency

One new or changed association produces exactly one event. Ordering is
deterministic: created Sides in request order, then repointed Sides in request
order — the same order `apply` writes them. Two Sides on one Asset produce two
events and `APP3-W01A` converges them onto one derivative, because the effect key
is Asset + policy version and deliberately excludes the association. No profile
and no association id appears in the Outbox row's identity. Changing away from an
Asset and later back produces a new event, which the consumer answers from the
existing `READY` derivative after revalidating the new association.

## 7. Consumer compatibility, and its exact boundary

Proven as a chain, because no harness composes both applications:

1. the live API suite asserts the **committed row's payload** equals
   `buildAssetNormalizationRequestedPayload(...)` exactly;
2. the worker suite asserts `parseAssetNormalizationPayload` **accepts** that
   builder's output, for every authorized association kind, and still refuses a
   hand-added `profile` field;
3. both applications are asserted to use the same constants — by identity, not by
   value copy.

**Stated boundary (§7 case 29).** The API integration context composes only the
API; the W01A context composes only the worker and starts MinIO. Neither composes
both, and this checkpoint did not create an orchestrator to make case 29 possible
— that would be a new architecture the directive forbids. So "the producer's
event drives a `READY NORMALIZED` derivative end to end" is **not** proven here.
What is proven is each half plus their exact meeting point. Case 30 (duplicate
association events converge) is covered by W01A's idempotency suite, re-run green.

## 8. Files

| File | Lines | Change |
| --- | --- | --- |
| `packages/domain-types/src/events/asset-normalization-requested.ts` | 84 | new — the shared contract |
| `packages/domain-types/src/index.ts` | 12 | exports it |
| `packages/domain-types/package.json`, `tsconfig.build.json` | — | IMP-D018 runtime build |
| `apps/api/src/modules/catalog/application/product-placement.normalization.ts` | 47 | new — pure intent derivation |
| `…/product-placement-normalization.recorder.ts` | 68 | new — the transactional append |
| `…/product-placement.service.ts` | 263 | one call, inside the transaction |
| `…/catalog-placement.module.ts` | 55 | registers the recorder |
| `…/product-placement.normalization.spec.ts` | 143 | new — 12 cases |
| `…/product-placement-normalization.recorder.spec.ts` | 99 | new — 5 cases |
| `apps/api/test/integration/product-placement-normalization.integration.spec.ts` | 481 | new — 18 live cases |
| `apps/worker/…/asset-normalization.payload.ts` | 178 | imports the contract, aliases it |
| `apps/worker/…/normalization-policy.ts` | 144 | takes the policy version from it |
| `apps/worker/…/shared-event-contract.spec.ts` | 107 | new — 6 compatibility cases |
| `apps/api/package.json`, `apps/worker/package.json`, `pnpm-lock.yaml` | — | the workspace link |
| `tools/check-app3-b01n.mjs` | 370 | new gate |
| `tools/check-app3-b01n-artifacts.mjs` | 97 | new — frozen-artifact half |
| `tools/check-app3-b01n.test.mjs` | 449 | new — 34 cases |
| `tools/check-app3-w01a.mjs` / `.test.mjs` | 398 / 437 | follow the contract to its owner |
| `tools/check-app3-g06.mjs` / `.test.mjs` | 400 / 557 | follow the follow-up to its new state |
| `docs/implementation/**` | — | phase, roadmap, matrix, source map, command index |

Every file is within the 400-line source and 600-line test limits.

## 9. Gate

`node tools/check-app3-b01n.mjs` recomputes the sixteen ruled properties against
the real source trees, the real OpenAPI artifact, the real generated client and
the real migrations, and chains `checkApp3W01A` — which chains G06 → B01 → P02 →
G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01. The frozen-artifact half is split
into `check-app3-b01n-artifacts.mjs` because it reproduces `check:generated`'s
tree hash exactly; a count alone would miss one operation swapped for another.

`node --test tools/check-app3-b01n.test.mjs` — 34 cases, each breaking exactly one
property in a throwaway repository copy. All pass.

## 10. Disclosed deviation — two more mode-aware gates

`tools/check-app3-w01a.mjs`, `tools/check-app3-g06.mjs` and both their test
suites are outside §9's allowed list and were modified. Both edits are forced by
this checkpoint's own required outcome:

- **W01A** asserted the event literals *in the worker file*. Extracting the
  contract necessarily moves them. The gate now asserts the values where they
  live and asserts that the consumer **imports and aliases** them — a worker that
  re-declared its own copy would keep compiling and keep passing its own tests
  while silently ceasing to accept what the producer writes.
- **G06** required `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` to name `APP3-B01N` as a
  blocker. §11 requires that follow-up to advance to
  `PROCESSING_AND_TRIGGER_FOUNDATION_READY`. The check now accepts exactly two
  consistent worlds — before B01N the blocker names it, after B01N the follow-up
  records its foundation ready — and refuses `APP3-B06` in both, because PO-11
  took the trigger role away from it permanently.

This is the same pattern disclosed at `APP3-B01` (G01, DB01) and `APP3-W01A`
(G06) — the sixth and seventh time an absence-asserting gate has needed a mode.
Five G06/W01A gate tests were rewritten to the two-world contract; both suites
are green.

## 11. Scoped validation

| Command | Result |
| --- | --- |
| `pnpm --filter @embroidery/api exec jest src/modules/catalog/application/product-placement` | 55/55 |
| `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns='product-placement' --testPathIgnorePatterns=/node_modules/` | 153/153 (10 suites, incl. B01 regression) |
| `pnpm --filter @embroidery/worker exec jest src/jobs/asset-normalization` | 61/61 |
| `pnpm --filter @embroidery/worker exec jest --runInBand --testPathPatterns='asset-normalization.*[.]integration' …` | 22/22 |
| `pnpm --filter @embroidery/api exec jest src/platform/http-response/contracts-package-boundary` | 2/2 |
| `pnpm --filter @embroidery/api exec tsc --noEmit` · `build` | PASS |
| `pnpm --filter @embroidery/worker exec tsc --noEmit` · `build` | PASS |
| `pnpm --filter @embroidery/domain-types run clean` · `build` · `typecheck` | PASS |
| `node tools/check-api-dist-boundary.mjs` | clean, 501 files |
| `pnpm --filter @embroidery/api openapi:check` | up to date, unchanged |
| `pnpm --filter @embroidery/api-client check:generated` | up to date, tree hash `7c446629…` unchanged |
| `node tools/check-app3-b01n.mjs` · `node --test tools/check-app3-b01n.test.mjs` | PASS · 34/34 |
| `node tools/check-app3-w01a.mjs` · `node --test tools/check-app3-w01a.test.mjs` | PASS · 35/35 |
| `node tools/check-app3-g06.mjs` · `node --test tools/check-app3-g06.test.mjs` | PASS · 45/45 |
| `node tools/check-app3-b01.mjs` · `node --test tools/check-app3-b01.test.mjs` | PASS · 40/40 |
| `pnpm format:check` · `pnpm lint` | PASS (24/24 tasks) |
| `git diff --check` | clean |

The frozen artifacts, measured rather than asserted: OpenAPI SHA-256
`53ef5650c7e09cb93db885b452f2ae0a15ff4237de0eada9991807ce1629349e`, 18 paths, 22
operations, 44 schemas; generated-client tree hash
`7c44662902317e306d2deecd128b544ab2ad9faf5298bed7d813d3377a6b19bf`; 34
migrations; 30 root scripts. All identical to the entry commit.

Five commands are indexed in `SCOPED_COMMAND_INDEX.md` as `CMD-CHECK-APP3-B01N`,
`CMD-TEST-APP3-B01N`, `CMD-TEST-APP3-B01N-UNIT`, `CMD-TEST-APP3-B01N-INTEGRATION`
and `CMD-TEST-APP3-B01N-CONSUMER`.

### Limitations, stated

- **No end-to-end producer → consumer → derivative proof exists** (§7). The
  boundary is the harness, not the code, and closing it would mean building an
  orchestrator this checkpoint may not build.
- **`node tools/check-file-size.mjs` reports three hard-limit violations this
  checkpoint did not cause and did not fix:** `tools/check-app3-g01.mjs` (411),
  `tools/check-app3-g03.mjs` (409), `tools/check-app3-g05.test.mjs` (609). All
  three are byte-identical at the entry commit and outside §9's allowed list.
- **`node tools/check-app2-closure.mjs` still fails identically with and without
  this checkpoint's changes** — its frozen APP2 counts were moved by the accepted
  `APP3-DB01` and `APP3-B01`. Not a B01N validation; recorded because it is known.

## 12. Status

```text
APP3-W01A = COMPLETE — REVIEW_ACCEPTED
APP3-B01N = COMPLETE — REVIEW_DELIVERED
APP3-G07 = READY — NOT STARTED
APP3-W01B = BLOCKED_BY_APP3-G07
APP3-B02 = READY_BY_APP3-W01A_AND_APP3-B01N BUT_BLOCKED_WHEN_PLATFORM_ZOD_OPENAPI_FOLLOW_UP_APPLIES
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — FINAL_OWNER_APP3-B02
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 STATE = PROCESSING_AND_TRIGGER_FOUNDATION_READY
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT
```

## 13. What did not change

Zero new HTTP paths, operations or schemas (18 / 22 / 44, unchanged); no OpenAPI
or generated-client change; zero migrations (34, unchanged) and no database
schema change; no new queue, scheduler, claim table or retry framework; no
generic enqueue endpoint; no external dependency; no root script (30, unchanged);
no `apps/admin` or `apps/storefront` change; no SVG sanitizer; no new worker
behavior; no Figma or `docs/design/**` change; and no change to `IMP-D041`…
`IMP-D046` or any ADR. `APP3-B01`'s three operations, its Admin/public auth
split, `updatedAt` / `expectedUpdatedAt`, `PLACEMENT_VERSION_CONFLICT`, the DB01
guard translation, the public projection, the `studioEligible` predicate and the
rule that background bytes are never delivered are all intact and re-proven by
153 passing placement tests.

Working tree clean at Commit B; nothing pushed.
