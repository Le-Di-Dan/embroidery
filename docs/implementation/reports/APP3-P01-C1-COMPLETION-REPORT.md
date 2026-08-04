# APP3-P01-C1 — Correction Report

**Checkpoint:** `APP3-P01-C1` — Align decoded-pixel accounting with Asset authority
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `c114fdc` (`docs(app3): record resumed APP3-P01 evidence`)
**Commit A:** `c836c13d364278a413039dfe3f028dae40377bd9`
**Directive:** CLAUDE FINAL CORRECTION DIRECTIVE — APP3-P01-C1

---

## 1. Human review verdict

```text
APP3-P01 = COMPLETE — CORRECTION_REQUIRED
```

The production foundation was otherwise accepted. One contradiction remained in
the delivered evidence, and this is the only ordinary correction allowed for
`APP3-P01`.

---

## 2. The contradiction

| Source | Said |
|---|---|
| `IMP-D044` / `APP3-G04` | repeated references to one **Asset** count once toward the unique-asset limit **and** toward the decoded-pixel total |
| `APP3-P01` implementation and report | decoded pixels summed over unique **`derivativeId`** values |

The two are equivalent only while each Asset is reached through a single
derivative — which is why the delivered tests all passed. They diverge the moment
one `assetId` appears with two different `derivativeId` values: derivative-keying
then charges the budget twice for a document the Asset rule says costs one
decode.

**The verdict was correct.** The `20` unique-asset limit in
`validation/complexity.ts` already keyed on `assetId`; only the decoded-pixel
total in `validation/context.ts` keyed on the derivative. Two budgets that
IMP-D044 defines with one identity were being computed with two.

This correction **restores** the existing ruling. It creates no new Product Owner
decision id, changes no product policy, and does not weaken IMP-D044 — so the
§0/§11 stop condition did not fire.

---

## 3. The changed algorithm

Before — derivative-keyed:

```ts
const countedDerivatives = new Map<string, number>();
if (record !== undefined && !countedDerivatives.has(record.derivativeId)) {
  countedDerivatives.set(record.derivativeId, widthPx * heightPx);
}
```

After — Asset-keyed, with a recorded derivative selection per Asset:

```ts
interface CountedAsset {
  readonly derivativeId: string;
  readonly decodedPixels: number;
}
const countedAssets = new Map<string, CountedAsset>();

const seen = countedAssets.get(record.assetId);
if (seen === undefined) {
  countedAssets.set(record.assetId, {
    derivativeId: record.derivativeId,
    decodedPixels: widthPx * heightPx,
  });
} else if (seen.derivativeId !== record.derivativeId) {
  findings.push(
    finding('DERIVATIVE_METADATA_MISMATCH', `${path}.derivativeId`, '…'),
  );
}
```

| Case | Result |
|---|---|
| `assetId` unseen | record its derivative, charge its pixels **once** |
| `assetId` seen, **same** `derivativeId` | charge **nothing** |
| `assetId` seen, **different** `derivativeId` | `DERIVATIVE_METADATA_MISMATCH` |

Every image element still counts toward the 20-image-element limit. Complexity
validation's 20 unique assets already used `assetId` and is unchanged. Neither
the document nor the caller's authority map is mutated — the accumulator is
local, and a test asserts both are untouched afterwards.

The existing typed code `DERIVATIVE_METADATA_MISMATCH` carries the conflict; no
new code was added. The finding path names the **later** conflicting element
(`$.elements[1].derivativeId` in the regression) and carries no storage data, URL
or document content — asserted by a test that also bounds the serialized finding
under 400 bytes.

---

## 4. Why the conflict is rejected rather than resolved

Every way of resolving it breaks something the directive and IMP-D044 already
lock:

| Resolution | What it breaks |
|---|---|
| count the first derivative | budget depends on element order |
| count the last derivative | same, in the other direction |
| count the smallest | under-charges decoded memory |
| count the largest | over-charges a cheap document |
| sum all derivatives | charges one Asset more than once — the exact rule being restored |
| normalize every reference to one derivative | silently rewrites what the customer placed |

The ambiguity is also unanswerable for canonical media identity, for
intrinsic-dimension validation (which of the two dimensions is "the" canonical
one?) and for future deterministic rendering. Rejecting it preserves **both**
G04 rules at once: a repeated Asset costs one decode, and the canonical
derivative metadata stays exact.

This restricts one derivative selection **per Asset inside one document**. It
does not restrict an Asset to a single derivative globally — an Asset may still
have `THUMBNAIL`, `CATALOG_PREVIEW` and `NORMALIZED` rows, and two different
documents may legitimately select different ones.

---

## 5. Tests

**Package: 151 → 162 tests, 9 suites, all passing.**

| # | Directive requirement | Test |
|---|---|---|
| 1 | one image, one Asset counts once | `counts one image using one Asset exactly once` |
| 2 | many elements, same asset + derivative count once | `charges a repeated Asset once, because it decodes once` |
| 3 | 20 elements of one Asset = one unique Asset | `counts twenty placements of one asset as one unique asset` |
| 4 | 21 elements of one Asset trip **only** the image-element limit | `trips only the image-element limit, never the asset or pixel budget` |
| 5 | two Assets summed independently | `sums two different Assets independently` |
| 6 | boundary passes at `33,554,432` | `accepts a total at exactly the ceiling` |
| 7 | boundary fails at `33,554,433` | `rejects one pixel beyond the ceiling` |
| 8 | one `assetId`, two derivative ids rejected | `rejects one assetId placed through two different derivative ids` |
| 9 | conflict uses `DERIVATIVE_METADATA_MISMATCH` | same, plus `names the later conflicting element…` |
| 10 | authority `assetId` disagreement rejected | `rejects a derivative whose authority names a different Asset` |
| 11 | repeated validation deterministic | `is deterministic across repeated validation` |
| 12 | no mutation of document or authority map | `does not mutate the document or the caller authority map` |

**The regression** reproduces the delivered ambiguity exactly: one `assetId`, two
**eligible** `READY` `NORMALIZED` derivative records with correct metadata,
different `derivativeId` values, nothing else wrong. Under the delivered code it
passed silently while double-charging; it now returns
`['DERIVATIVE_METADATA_MISMATCH']`. A companion case runs it with the larger
derivative first and second, so the outcome cannot depend on ordering.

No existing test was weakened. Two were renamed for accuracy (`charges a
repeated derivative once` → `…repeated Asset once`).

**Checker: 39 → 45 tests, all passing.** The six new cases each break one
property of the restored rule: reverting to derivative-keyed accumulation, keying
the accumulator on `derivativeId`, dropping the conflict check, removing G04's
`ONCE_FOR_ASSET_BUDGETS_EACH_FOR_ELEMENTS` ruling, rewording its decoded-pixel
ruling away from assets, and dropping the regression from the package tests.

---

## 6. Changed files

**Commit A — 9 files, +376 / −89**

| File | Change |
|---|---|
| `src/validation/context.ts` | Asset-keyed accumulator, conflict detection, reasoning comment |
| `src/validation/context.spec.ts` | boundary/identity cases + the conflict regression suite |
| `src/validation/complexity.spec.ts` | 20-of-one-asset case and the cross-validator "only image elements" case |
| `tools/check-app3-p01.mjs` | `checkAssetKeyedPixels`, `PHASE_FILE`, success message |
| `tools/check-app3-p01.test.mjs` | six new checker cases |
| `docs/…/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | new §6.10.6 forward correction note, §10 statuses |
| `docs/implementation/10-…`, `11-…`, `13-…` | forward correction record |

Untouched and verified so: `packages/design-document/assets/**` (fonts,
manifests, licence, `.gitattributes`), `packages/design-document/package.json`,
`pnpm-lock.yaml`, root `package.json`, `packages/design-engine`,
`packages/database`, `packages/persistence`, `apps/**`, OpenAPI, generated
client, worker, Figma, `docs/design/**`, `spikes/**`, `infrastructure/**`. No
dependency added. The public API is unchanged — the existing types represented
the corrected behaviour without modification.

`APP3-G04-COMPLETION-REPORT.md` and `APP3-P01-COMPLETION-REPORT.md` were **not**
rewritten; they are historical evidence, and §6.10.6 is the forward record.

### Line counts

| File | Lines | Limit |
|---|---|---|
| `src/validation/context.ts` | 248 | ≤ 400 |
| `src/validation/context.spec.ts` | 326 | ≤ 600 |
| `src/validation/complexity.spec.ts` | 200 | ≤ 600 |
| `tools/check-app3-p01.mjs` | 400 | ≤ 400 |
| `tools/check-app3-p01.test.mjs` | 384 | ≤ 600 |

The checker reached 442 lines with the new check and was brought back to 400 by
consolidating two near-duplicate directory walkers into one `sourceFiles` helper
and compressing two token lists — no check was removed, and no second tools file
was created.

---

## 7. Scoped validation

`pnpm quality` was **not** run. No root script was added.

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/design-document test` | **162/162**, 9/9 suites |
| `pnpm --filter @embroidery/design-document typecheck` | **PASS** |
| `pnpm --filter @embroidery/design-document build` | **PASS** |
| `node tools/check-app3-p01.mjs` | **PASS** |
| `node --test tools/check-app3-p01.test.mjs` | **45/45** |
| `node tools/check-app3-g04.mjs` | **PASS — DERIVATIVE_METADATA_IMPLEMENTED** |
| `node tools/check-app3-f01-font-assets.mjs` | **PASS** |
| `pnpm format:check` | **PASS** |
| `pnpm lint` | **PASS** — 21/21 tasks |
| `git diff --check` | **clean** |

G04 was in scope because this correction restores its locked unique-Asset pixel
rule; F01 because P01 still depends on the immutable controlled font authority,
which was not changed. P02, database, API, worker, root tests, E2E, smoke,
OpenAPI, Figma, spike and full-regression suites were not run — no owned input of
any changed. Nothing was backgrounded and nothing was polled.

---

## 8. Status

```text
APP3-P01-C1 =
COMPLETE — REVIEW_DELIVERED

APP3-P01 =
COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW

APP3-P02 =
READY — NOT STARTED
```

Human review owns `APP3-P01 = COMPLETE — REVIEW_ACCEPTED`.

---

## 9. Confirmations

- **Commit A:** `c836c13d364278a413039dfe3f028dae40377bd9`.
- **Working tree clean** after Commit A; Commit B adds only this report.
- **Nothing pushed.** `origin/production` remains at `8b5f3b0`.
- **No `APP3-P02`, backend, API, OpenAPI, generated-client, worker, database or
  migration change.**
- **No renderer or geometry change**; no React, Next, NestJS, DOM, canvas or SVG
  code, and no spike import.
- **No font binary, manifest, licence or `.gitattributes` byte changed.**
- **No schema, canonicalization, hashing, quantization or migration behaviour
  changed.**
- **No new decision id**; IMP-D044 is restored, not amended.
- **No root `package.json` script**, no manifest change, no lockfile change, no
  new dependency.
- **`pnpm quality` not run**; no repository-wide aggregate validation.
- **No credential read, written, echoed or rotated;** `.env` untouched.
