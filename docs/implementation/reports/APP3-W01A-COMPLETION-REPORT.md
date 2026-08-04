# APP3-W01A — Completion Report

**Checkpoint:** `APP3-W01A` — Editor-safe raster normalization consumer
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `090282b` (`docs(app3): record APP3-G06 evidence`)
**Commit A:** `46724913f9b5e9ea87a3613eda524ba1418da142`
**Directive:** CLAUDE EXECUTION PROMPT — APP3-W01A

---

## 1. Accepted entry

```text
APP3-G01/G02/G03/G04 = COMPLETE — REVIEW_ACCEPTED
APP3-DB01 = COMPLETE — REVIEW_ACCEPTED
APP3-F01/P01 = COMPLETE — REVIEW_ACCEPTED
APP3-G05/G05-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-P02/P02-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B01/B01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-G06 = COMPLETE — REVIEW_ACCEPTED, IMP-D046 = LOCKED
APP3-W01 = REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B
```

Clean tree at entry; `node tools/check-app3-g06.mjs` PASS before any edit.
`IMP-D041`…`IMP-D046`, `ADR-APP0-001`, `ADR-APP2-001` and `ADR-DB1-012` are
preserved and unmodified.

## 2. §3 stop conditions — evaluated, none fired

The directive required a clean stop if any raster-policy property was
unestablished. All eight are established by APP2's frozen derivative policy and
its accepted Sharp pipeline (`ADR-APP2-001`, `APP2-W01`, `APP2-DB01`): output
container and encoder settings, colour space, orientation handling, metadata
disposition, resize semantics, upscaling rule, alpha handling and the checksum /
byte-size measurement point. `APP3-G06` fixed everything association-shaped that
`APP3-W01` had stopped for. Nothing new needed selecting, so the checkpoint
proceeded and no `NOT_AVAILABLE` outcome was invented to paper over a gap.

The one property W01A does **not** have is a Template SVG capability — that is
staged by design, not missing by accident (§6).

## 3. What was implemented

`apps/worker/src/jobs/asset-normalization/` — one job module in the same shape as
`asset-inspection`:

| Layer | File | Responsibility |
| --- | --- | --- |
| domain | `asset-normalization.payload.ts` | the event type, schema version 1, exact-key validation, the discriminated `associationRef`, the effect key |
| domain | `normalization-policy.ts` | policy version 1, the three profiles, the raster allowlist, the four limits, the frozen output policy |
| domain | `normalization-outcome.ts` | the nine bounded outcome codes, rejections carried as data |
| domain | `repositories/asset-normalization.repository.ts` | the port — by-id association lookup only |
| application | `association-resolution.service.ts` | association → profile → asset lane |
| application | `normalized-derivative.service.ts` | admission, source verification, encode, measure, discard |
| application | `asset-normalization.usecase.ts` | the order of operations |
| infrastructure | `sql-asset-normalization.repository.ts` | every statement scoped to `kind = 'NORMALIZED'` |
| composition | `asset-normalization.handler.ts`, `asset-normalization.module.ts` | registration on the existing registry |

`apps/worker/src/jobs/asset-inspection/infrastructure/image/sharp-pipeline.ts`
gained a two-line widening (`RasterEncodePolicy`) so the shared pipeline accepts
this checkpoint's output policy **without** growing `CatalogDerivativeKind`. The
worker composition root imports the new module. Nothing else in APP2 changed.

## 4. The rulings, and where each is enforced

| IMP-D046 ruling | Enforcement | Gate check |
| --- | --- | --- |
| One event, existing Outbox, existing registry, `ASSET_PROCESSING` | `asset-normalization.handler.ts`, `.module.ts` | 2 |
| No queue, scheduler, sweep, claim table or retry framework | absence, asserted over every job source | 2 |
| Payload names the **association**, never the profile | `asset-normalization.payload.ts` | 1, 3 |
| Profile derived at claim time from the association by id | `association-resolution.service.ts` | 3, 4 |
| Pointer, active flag and asset lane all proven | same | 4 |
| Raster sources JPEG/PNG/WebP only | `normalization-policy.ts` | 5 |
| 10 MiB / 4096 px / 16,777,216 decoded pixels | same | 5 |
| Template SVG authorized but operationally unavailable | `TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE`; no sanitizer in the manifest | 6 |
| One `NORMALIZED` WebP output, `isWatermarked: false` | `NORMALIZED_OUTPUT_POLICY` | 7 |
| The IMP-D044 quartet is **measured**, never copied | `normalized-derivative.service.ts` | 8 |
| `READY` + quartet in one claim-guarded statement | `sql-asset-normalization.repository.ts` | 9 |
| Idempotency = Asset + policy version + kind | `deriveAssetNormalizationEffectKey` | 10 |
| Stale context → bounded non-retryable outcome | `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` | 3 |
| No profile or association id persisted | `asset_derivatives` unchanged | 11 |
| No migration, HTTP operation, producer or root script | absence, recomputed | 11, 12, 13 |

## 5. Two defects the live suites caught

Both were found by the disposable-stack suites, not by reasoning, and both were
real:

1. **The object could be absent after a successful "upload".** The upload was
   started inside `streamPipeline`'s final-destination callback, which resolved
   before the multipart completion did, so a `READY` row could name bytes that
   were not there yet. Replaced with APP2's accepted pattern: the upload promise
   is created up front, its failure is captured, and the pipeline and the upload
   are settled together.
2. **A losing concurrent attempt deleted the winner's bytes.** The storage key is
   deterministic per Asset, so the loser's cleanup `discardObject` removed the
   object the winner's `READY` row pointed at — one row, zero objects. The loser
   now re-reads the row and, when it is `READY` at the same key, returns
   `ALREADY_NORMALIZED` and deletes nothing.

Both are covered by regression cases in
`asset-normalization-idempotency.integration.spec.ts`.

## 6. Template SVG

`TEMPLATE_ASSET` sources of `image/svg+xml` are admitted by IMP-D044 and refused
here as `TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE` — a bounded, non-retryable
outcome. No Sharp rasterization, no regex sanitization, no browser DOM as an
implicit sanitizer, and **no package chosen**: the worker manifest gained no
dependency at all. The gate asserts the absence of five candidate sanitizers by
name, and asserts that `image/svg+xml` appears in the policy exactly once — as
the staged constant. `APP3-G07` selects the sanitizer; `APP3-W01B` implements it.

## 7. Gate

`node tools/check-app3-w01a.mjs` (379 lines) recomputes thirteen groups of facts
against the real source tree, the real schema, the real OpenAPI document and the
real manifests, and chains `checkApp3G06` — which chains B01 → P02 → G05 → P01 →
F01/DB01 → G04 → G03 → G02 → G01. It asserts the **negations** that would compile
silently: no profile field on the payload, no association scan on the port, no
source metadata substituted into the quartet, no SVG branch, no scheduler, no
migration, no HTTP operation, no root script.

`node --test tools/check-app3-w01a.test.mjs` — 34 cases, each breaking exactly
one property in a throwaway repository copy. All pass.

## 8. Disclosed narrow-scope deviation

`tools/check-app3-g06.mjs` and `tools/check-app3-g06.test.mjs` are outside §13's
allowed list and were modified.

`APP3-G06`'s no-implementation check asserted that **no** application source
mentions `asset.normalization.requested`. Delivering W01A necessarily falsifies
that. The check is now mode-aware and accepts exactly two consistent worlds:

- before W01A is recorded complete, no application may mention the event;
- after it, the worker must, and `apps/api/**` still must not — the producer is
  `APP3-B01N`'s and has not run.

Every mixture fails, including a delivered W01A whose consumer has disappeared.
The public-media blocker check was likewise narrowed to what stays true as
predecessors land: it must name `APP3-B01N` and must not name `APP3-B06`.

This is the same pattern disclosed at `APP3-B01` for `APP3-G01` and `APP3-DB01`
— the fifth time an absence-asserting gate has needed a mode. Three G06 gate
tests were rewritten to the two-world contract; the suite is 43/43.

## 9. Scoped validation

| Command | Result |
| --- | --- |
| `node tools/check-app3-w01a.mjs` | PASS |
| `node --test tools/check-app3-w01a.test.mjs` | 34/34 |
| `node tools/check-app3-g06.mjs` | PASS |
| `node --test tools/check-app3-g06.test.mjs` | 43/43 |
| `node tools/check-app3-{b01,p02,g05,p01,f01-font-assets,db01,g04,g03,g02,g01}.mjs` | PASS |
| `node tools/check-figma-design-index.mjs` | PASS |
| `pnpm --filter @embroidery/worker exec jest src/jobs/asset-normalization` | 55/55 |
| `pnpm --filter @embroidery/worker exec jest --runInBand --testPathPatterns='asset-normalization.*[.]integration' --testPathIgnorePatterns=/node_modules/` | 22/22, three consecutive runs |
| `pnpm --filter @embroidery/worker exec jest --runInBand --testPathPatterns='asset-inspection-.*[.]integration' --testPathIgnorePatterns=/node_modules/` | 52/52 (APP2 regression) |
| `pnpm --filter @embroidery/worker test` | 338/338 |
| `pnpm --filter @embroidery/worker exec tsc --noEmit -p tsconfig.json` | PASS |
| `pnpm --filter @embroidery/worker run build` | PASS |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS (23/23 tasks) |
| `git diff --check` | clean |

The four new commands are indexed in `SCOPED_COMMAND_INDEX.md` as
`CMD-CHECK-APP3-W01A`, `CMD-TEST-APP3-W01A`, `CMD-TEST-APP3-W01A-UNIT` and
`CMD-TEST-APP3-W01A-INTEGRATION`. No root `package.json` script was added; the
root script count is still 30.

### Limitations, stated

- **`node tools/check-file-size.mjs` reports three hard-limit violations that
  this checkpoint did not cause and did not fix:** `tools/check-app3-g01.mjs`
  (411), `tools/check-app3-g03.mjs` (409) and `tools/check-app3-g05.test.mjs`
  (609). All three are byte-identical at the entry commit and are outside §13's
  allowed file list. Every file W01A adds or edits is within limits; the largest
  are `normalized-derivative.service.ts` (345) and
  `asset-normalization-context.ts` (422, a test harness).
- **`node tools/check-app2-closure.mjs` fails identically with and without this
  checkpoint's changes** — the frozen APP2 OpenAPI counts, generated-client hash,
  migration count and database fingerprint were moved by the accepted `APP3-DB01`
  and `APP3-B01`, not here. Verified by stashing the entire working tree and
  re-running: same seven failures. It is not a W01A validation and is recorded
  only because it was run.
- **One integration run flaked once** on a `GET` of a just-written object that a
  preceding listing had already returned — the disposable MinIO's read-after-write
  visibility, previously observed on `HEAD`. The test helper now retries the read
  up to five times at 100 ms. The retry is in the test only; the consumer is
  unchanged, and a genuinely absent object still fails the assertion.
- **No end-to-end proof through a real producer exists**, because no producer
  exists: the suites append the ruled event to the Outbox directly. That is the
  intended shape of the locked order `W01A → B01N → G07 → W01B`.

## 10. Status

```text
APP3-W01A = COMPLETE — REVIEW_DELIVERED
APP3-B01N = READY — NOT STARTED
APP3-G07 = READY — NOT STARTED
APP3-W01B = BLOCKED_BY_APP3-G07
APP3-B02 = BLOCKED_BY_APP3-W01A_AND_APP3-B01N
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — FINAL_OWNER_APP3-B02, BLOCKED_BY = APP3-B01N
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT
```

## 11. What did not change

No HTTP operation (22, unchanged), no OpenAPI or generated-client change, no
producer, no SVG sanitizer, no UI, no Figma, no migration (34, unchanged), no new
queue, scheduler, claim table or retry framework, no new dependency, no lockfile
change, no root script, no schema change, no `assets.status` write, no APP2
derivative kind touched, and no change to `IMP-D041`…`IMP-D046` or any ADR.
