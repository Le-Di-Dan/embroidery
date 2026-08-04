# APP3-P01 — Completion Report (resumed)

**Checkpoint:** `APP3-P01` — Production design-document foundation
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `053f4a3` (`docs(app3): record APP3-F01 evidence`)
**Commit A:** `0cbc5919e1ee1505098139457135b35b387ae43c`
**Directive:** CLAUDE MANUAL INTERVENTION RESUME DIRECTIVE — APP3-P01

---

## 1. First attempt and its resolution

The first `APP3-P01` execution stopped at `FAILED — MANUAL INTERVENTION
REQUIRED`, cause `NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE`. It wrote
nothing, changed nothing and committed nothing.

`APP3-F01` supplied the missing prerequisite and is accepted. Its gate was
re-run at entry and again after this implementation:

```text
node tools/check-app3-f01-font-assets.mjs → PASS
```

Nothing about the P01 contract changed. This is a resumption, not a second
attempt with a relaxed target: no other font was considered, no registry field
was weakened, and no font byte was touched.

**Package inventory before implementation:** `src/index.ts` was `export {}`;
`package.json` declared only `lint` and `typecheck` — no `test`, no `build`, no
`exports` subpath; no dependencies of any kind.

---

## 2. Quantization authority

Reconciled and **not** in conflict, so the §3 stop condition did not fire:

| Source | Says |
|---|---|
| `ADR-DB1-012` §7 | numbers must be JSON-interoperable, arrays keep order, omitted fields stay omitted, NFC at the input boundary. **No precision.** |
| `ADR-APP0-001` §4 | "numbers are quantized before hashing so accumulated float noise cannot change a hash". **No precision**, but names `spikes/app0-r01-design-studio/` as the ADR's formal **Evidence**. |
| `APP0-R01` evidence, `src/document/canonical.ts:19` | `const NUMERIC_SCALE = 10_000` — `Math.round(v * 10_000) / 10_000`, `-0 → 0`. |

That is the precision that produced the cross-engine canonical hash recorded in
the accepted APP0-R01 report (`sha256:d6be2ccb…`, identical across three
engines, two platforms, five runs). Exactly one number exists in accepted
authority, so this checkpoint reused it rather than choosing one.

Implemented in `src/quantization/quantize.ts` as
`DESIGN_DOCUMENT_QUANTIZATION_SCALE = 10_000` (with `_STEP`, `_DECIMALS` and an
exported `_AUTHORITY` string naming the source), so a gate can assert the
constant instead of trusting prose.

**Covered fields** — persisted floats only: transform (`x`, `y`, `width`,
`height`, `rotationDeg`, `scaleX`, `scaleY`), `opacity`, `fontSizePx`,
`strokeWidthPx`, freehand point `x`/`y`, and placement `canvasWidthPx`,
`canvasHeightPx`, `physicalWidthMm`, `physicalHeightMm`, `pxPerMm`. **Not**
covered: `schemaVersion`, `fontWeight` and the intrinsic image dimensions are
integers validated as such; strings, ids and array order are never touched.

---

## 3. Document v1

| Key | Value |
|---|---|
| `CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION` | `1` |
| Root fields | `schemaVersion`, `placement`, `elements` |
| Unknown root or element field | rejected |
| Element kinds | `text`, `image`, `shape`, `freehand`, `group` |
| Shape kinds | `rectangle`, `ellipse`, `line` |
| Z-order | array order |
| Element identity | stable opaque string, never an index, never regenerated |

`placement` carries `productSideId`, `embroideryAreaId`, `canvasWidthPx`,
`canvasHeightPx`, `physicalWidthMm`, `physicalHeightMm`, `pxPerMm` — validated
as opaque non-empty ids and finite positive numbers, and nothing more. Whether
they agree with each other or with the real Product Side is geometry, and
belongs to `APP3-P02` and the placement APIs.

Absent by design: publication state, customer identity, session secret, storage
key, source or private URL, watermark, viewport, selection, undo stack, renderer
node. The types are closed over JSON scalars, so most of those are
unrepresentable rather than merely rejected.

### Deliberate normalization from the APP0-R01 spike

The spike shape is research evidence; four differences are intentional and
recorded here rather than silently absorbed:

| Spike | Production | Why |
|---|---|---|
| `svg` element kind | none | sanitized SVG arrives as an Asset (IMP-D044 PO-04/05); a document never carries markup |
| `fontFamily: string` | `fontId: string` | PO-10 forbids a CSS family, URL or bytes in a document |
| `AssetRef` carrying a `url` | `assetId` + `derivativeId` | §5.2 forbids a storage key or source URL |
| `groupId` on every element | `childIds` on the group | membership is the group's fact; it also makes "one parent" checkable in one place |
| no `freehand` | `freehand` with bounded points | §5.2 requires it |

No spike code was imported.

---

## 4. Validation layers

| Layer | Owns | Does **not** own |
|---|---|---|
| Structural | version, required fields, union shape, finite numbers, ranges, unique ids, group graph, NFC, unknown-field rejection | any geometric consequence |
| Complexity | the nine IMP-D044 limits | decoded pixels (needs caller authority) |
| Contextual | derivative eligibility and metadata equality, decoded pixels, font variants | anything needing a database or object-storage read |

**No coercion anywhere.** `"12"` is not `12`; a missing version is not v1; an
unknown type is not a shape; `NaN`/`Infinity`/negative dimensions fail. Validation
never mutates its input and never returns it — every element is rebuilt field by
field from checked values, so the object that gets hashed is the object that was
validated.

**Group graph.** Three failures get three codes because a caller shows a
different message for each: `INVALID_GROUP_REFERENCE` (child absent, or listed
twice), `MULTIPLE_GROUP_PARENTS`, `GROUP_CYCLE`. Cycle detection walks *upward*
through the parent map — each step has at most one successor, so the walk
terminates without recursing over a branching child list. Nesting depth counts a
leaf's **ancestor groups**: eight nested groups pass, nine fail.

**NFC.** ADR-DB1-012 §7 puts Unicode normalization at the input boundary, and the
implementation **rejects** rather than silently rewriting — quietly changing a
customer's text is still changing it. Without this, `"Thêu"` composed and
decomposed canonicalize to different bytes and hash differently.

### Geometry exclusion

`APP3-P01` validates no in-area containment, rotated bounds, collision, snapping,
px↔mm conversion, placement consistency, resize handles or matrix composition.
Both the gate and `src/architecture.spec.ts` assert the absence mechanically —
no `Math.cos/sin/atan/tan/hypot`, no `pxPerMm` multiplication or division, no
bounds/collision/unit-conversion function names.

---

## 5. Complexity limits

| Limit | Value | Boundary tested |
|---|---|---|
| canonical serialized bytes | 524 288 | ✅ at / +1 |
| total elements | 100 | ✅ at / +1 |
| image elements | 20 | ✅ at / +1 |
| text elements | 80 | ✅ at / +1 |
| unique referenced assets | 20 | ✅ at / +1 |
| group nesting depth | 8 | ✅ at / +1 |
| characters per text element | 500 | ✅ at / +1 |
| total text characters | 5 000 | ✅ at / +1 |
| decoded pixels | 33 554 432 | ✅ at / +1 |

Three counting decisions are load-bearing and each has its own test:

- **Canonical size is UTF-8 bytes**, measured after quantization and
  canonicalization. A Vietnamese document is mostly multi-byte, so counting
  string length would have let roughly twice the ruled limit through.
- **Text length counts code points**, not UTF-16 units, so an astral character
  costs one of the customer's 500 rather than two.
- **A repeated Asset counts once** toward the asset and decoded-pixel budgets and
  **each time** toward image elements. The budgets are about distinct media to
  fetch and decode; the element total is about what the editor must draw. One
  test places 21 copies of a single asset and asserts exactly one of the two
  limits fires.

Hidden, locked and off-canvas elements count. A failing document is rejected
whole — nothing is truncated, dropped or normalized into compliance.

---

## 6. Contextual derivative validation

Authority is supplied by the caller as a `ReadonlyMap<derivativeId,
DerivativeAuthorityRecord>` carrying exactly the canonical columns `APP3-DB01`
added — `kind`, `status`, `widthPx`, `heightPx`, `mediaType`, `byteSize` — and no
storage key, URL or grant. The package opens no database connection and no
object-storage client, which also satisfies IMP-D044's ban on an object-storage
read during a document write.

Required per image: the derivative exists; **its `assetId` matches the
document's**; `kind = NORMALIZED`; `status = READY`; all four metadata values
present, positive and non-blank; and the document's intrinsic dimensions equal
the canonical ones. Unmeasured is ineligible — never guessed.

The cross-asset case is the one worth naming: a document that says asset A but
derivative D, where D belongs to asset B, is how a reference to somebody else's
media would be smuggled past a check that only looked at the derivative. It has
its own test.

Decoded pixels are summed over **unique** derivatives (`2 × 4096² = 33 554 432`
exactly at the ceiling; one more pixel fails). Source-asset metadata is not a
substitute — a record carrying only the source binary's facts is still
unmeasured, and has its own test.

Font validation resolves `fontId` through the controlled registry and checks
style and weight. Unknown id → `UNKNOWN_FONT_ID`; unsupported variant →
`UNSUPPORTED_FONT_VARIANT`. No system fallback, no geometry-changing substitute.
A test asserts no finding ever contains a `.woff2` path, an asset path or a URL.

---

## 7. Canonicalization

RFC 8785 JCS implemented in-package, as ADR-DB1-012 requires — the hash is the
integrity link between version, approval and production artifact, so its input
must be a *specified* form rather than one library's incidental behaviour. No
dependency was added.

| Property | Implementation |
|---|---|
| Key order | `Object.keys().sort()` — JavaScript string comparison **is** UTF-16 code-unit order. `localeCompare` would reorder under a Vietnamese locale and is a bug. |
| Numbers | `String(n)` — the ECMAScript algorithm JCS §3.2.2.3 adopts by reference |
| Strings | `JSON.stringify` — shortest control escapes, `\uXXXX` for lone surrogates |
| `undefined` | omitted entirely; explicit `null` preserved |
| Arrays | order preserved, never sorted |
| Non-JSON values | rejected (`NaN`, function, symbol, bigint, `Date`, class instance) |

Conformance vectors cover key ordering (including `"Z"` before `"a"` and a
Vietnamese key sorting by code point), nested independent sorting, array order,
number forms (`1`, `1.5`, `-0 → 0`, `1e+21`, `1e-7`), control-character and
lone-surrogate escaping, `undefined`/`null`, and byte-identical repetition.

**Pipeline:** `version → structure → complexity → quantization → revalidation →
canonical bytes → size`. The revalidation pass is not belt-and-braces: a width of
`0.00004` is a legal positive number that quantizes to `0`, which the schema
forbids. Without it, that document would be canonicalized and hashed in a state
it never legally held. It has its own test.

Exports: `canonicalizeDesignDocument`, `canonicalizeDesignDocumentToBytes`,
`prepareDesignDocument`. Failures return a typed `CANONICALIZATION_FAILED`
finding naming a path and a kind, never the document.

---

## 8. Server-only SHA-256

`@embroidery/design-document/server` is the **only** module importing anything
from `node:`. It exports `hashDesignDocumentSha256`,
`hashCanonicalDesignDocumentBytesSha256` and `formatDesignDocumentHash`
(`sha256:<hex>`, per ADR-DB1-006). Lowercase hex; canonical bytes only, never
`JSON.stringify`.

A subpath rather than a runtime branch, because APP0-R01 measured the reason:
`crypto.subtle` exists only in a secure context, so on a plain-HTTP origin a
browser-side implementation is `undefined` and throws. A build-time boundary
cannot be broken by a later edit the way a convention can. **No browser pure-JS
fallback** was added — a second implementation is a second thing that can
disagree about a value an approval is bound to.

Both the package test and the gate **walk the module graph reachable from the
root export** rather than reading its import list, because the realistic failure
is a re-export three files deep. Vectors: FIPS 180-4 `"abc"`, the empty-input
digest, insertion-order equality, array-order inequality, repetition stability.

---

## 9. Migration registry

`DESIGN_DOCUMENT_MIGRATIONS` is empty at v1, and building it now is the point:
the API a caller writes against today is the one that still works at v4. Steps
are ordered, single-version and pure; `assertContiguous` runs at **module load**,
so a registry with a hole fails the build's first import rather than the first
customer document old enough to need it. Output is validated before return;
input is never mutated.

`migrateDesignDocument` fails a missing version and a future version with
`UNSUPPORTED_SCHEMA_VERSION`. **No v0 step was fabricated** — the APP0-R01 spike
used a different shape, but a spike fixture is research evidence, not deployed
production data, and inventing a migration from it would create a path that reads
documents nobody ever wrote and must then be maintained forever.

Contiguity is exercised with synthetic step lists (skipped version, gap,
wrong start, overshoot), since the real list is empty.

---

## 10. Controlled Inter registry

Registry version `1`, one entry, exactly as §6.9.4 locked it:

| Key | Value |
|---|---|
| `fontId` | `inter` |
| `family` | `Inter` |
| `styles` | `normal`, `italic` |
| weights | `100`–`900` |
| normal file | `packages/design-document/assets/fonts/inter/4.1/InterVariable.woff2` |
| italic file | `packages/design-document/assets/fonts/inter/4.1/InterVariable-Italic.woff2` |
| licence | `packages/design-document/assets/fonts/inter/4.1/LICENSE.txt` |
| `fallbackPolicy` | `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE` |
| normal SHA-256 | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| italic SHA-256 | `e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a` |
| SPDX | `OFL-1.1` |
| Vietnamese coverage | `VERIFIED_COMPLETE` |
| coverage evidence | `…/VIETNAMESE-COVERAGE.json` |
| provenance evidence | `…/FONT-PROVENANCE.json` |

**Why the metadata is transcribed rather than imported.** The package must stay
browser-safe and must not read a filesystem, and the build emits only `src/`, so
importing JSON from `assets/` would either break `rootDir` or drag Node APIs into
a browser bundle. Transcription is safe **because a test proves it**:
`fonts/registry.spec.ts` reads the committed manifests *and re-hashes the
committed binaries*, failing on a single character of drift. The P01 gate
re-hashes them independently — a registry and a manifest can agree with each
other and both be wrong about the file on disk.

General Sans is not registered. No font byte lives in TypeScript, no remote URL
appears, and a test asserts the serialized registry is under 2 KB and contains no
`http`/`https`/`base64`. **No font asset, manifest, licence or `.gitattributes`
was modified** — `git diff --cached --stat -- packages/design-document/assets`
was empty for Commit A.

---

## 11. Public API

Root export (browser-safe): document and element types; schema-version,
complexity, value-range and eligibility constants; `readSchemaVersion`,
`validateDesignDocumentStructure`, `validateDesignDocumentComplexity`,
`validateCanonicalSize`, `validateDesignDocumentContext`;
`quantizeDesignDocument`, `quantizeNumber` and the quantization constants;
`canonicalizeDesignDocument`, `canonicalizeDesignDocumentToBytes`,
`prepareDesignDocument`; `migrateDesignDocument`, `DESIGN_DOCUMENT_MIGRATIONS`;
`DESIGN_FONT_REGISTRY`, `INTER_CONTROLLED_FONT`, `findControlledFont`,
`supportsVariant`; typed finding and result types; three typed error classes.

Server export: the three hashing functions and nothing else.

Not exported: internal parser helpers (`primitives`, `element`, `groups`), the
JCS encoder internals, and the test-only fixtures.

---

## 12. Changed files

**Commit A — 41 files, +4 878 / −97**

| Area | Files |
|---|---|
| Schema | `schema/constants.ts`, `schema/document.ts`, `schema/elements.ts` |
| Findings | `findings/finding.ts` |
| Validation | `validation/primitives.ts`, `element.ts`, `groups.ts`, `structure.ts`, `complexity.ts`, `context.ts` |
| Quantization | `quantization/quantize.ts` |
| Canonicalization | `canonical/jcs.ts`, `canonical/canonicalize.ts` |
| Migration | `migration/registry.ts` |
| Fonts | `fonts/registry.ts` |
| Server | `server/index.ts` |
| Root | `src/index.ts` |
| Tests | 9 `*.spec.ts` + `testing/fixtures.ts` |
| Package config | `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.mjs` |
| Gate | `tools/check-app3-p01.mjs`, `tools/check-app3-p01.test.mjs` |
| F01 gate (deviation, §14) | `tools/check-app3-f01-font-assets.mjs`, `.test.mjs` |
| Docs | phase plan §6.10 + statuses, roadmap, traceability matrix, phase source map, command index |
| Lockfile | `pnpm-lock.yaml` |

Nothing under `packages/design-engine`, `apps/**`, `packages/database`,
`packages/persistence`, `packages/object-storage`, `packages/styles`,
`docs/design/**`, `spikes/**` or `infrastructure/**`. No root `package.json`
change, no OpenAPI artifact, no generated client, no worker.

**Lockfile.** `pnpm-lock.yaml` gained 15 lines and **zero `resolution:` entries** —
the importer block for this workspace now records `jest@30.4.2`,
`ts-jest@29.4.11`, `rimraf@6.1.3`, `@types/jest@30.0.0` and `@types/node@26.1.1`,
all already used at those exact versions by `packages/database` and
`packages/persistence`. No new external dependency was introduced; this is the
mechanical wiring case §16 permits.

---

## 13. Checker behaviour

`tools/check-app3-p01.mjs` (400 lines) verifies all seventeen ruled properties.
Three are worth naming because they hold boundaries a compiler cannot:

1. **The runtime split** — it walks the module graph reachable from the root
   export and fails on any `node:` import found anywhere in it, plus the server
   entry being reachable, plus the missing `"./server"` subpath.
2. **The geometry line** — trigonometry, `pxPerMm` arithmetic and
   bounds/conversion function names anywhere in the package.
3. **The font evidence** — it re-hashes the committed binaries and requires the
   registry to carry those digests and byte sizes.

It chains `checkApp3F01` and `checkApp3Db01`, so G01→G04, DB01 and F01 authority
is asserted intact on every run.

Two crude-scan defects were found and fixed while building it, both of the same
family: a comment stripper that ate `https://` because `//` inside a URL matched
the line-comment pattern, and a forbidden-token scan that flagged
`upstreamRepository` while looking for `Repository`. Both now strip comments
with `(^|[^:])//` and match declarations rather than substrings.

---

## 14. Deviation: the F01 gate became mode-aware

`tools/check-app3-f01-font-assets.mjs` and its tests are outside §16's allowed
list. They had to change, and the change is a strengthening.

F01 asserted `packages/design-document/src/index.ts` is an empty stub — correct
while F01 was the only checkpoint that had run, and **false the moment P01
legitimately implemented it**. Left alone, the required
`node tools/check-app3-f01-font-assets.mjs` would have failed.

It now accepts exactly **two consistent worlds** and refuses every mixture, the
same pattern `APP3-G04` was rebuilt to use for the derivative-metadata pair:

| World | Phase plan | Package | F01 additionally requires |
|---|---|---|---|
| not started | blocks P01 on F01 acceptance | empty stub | — |
| delivered | records P01 complete | implemented | the registry still references both WOFF2 files and `LICENSE.txt` |

A plan claiming delivery over a stub fails; a stub-less package under a blocking
plan fails; a delivered registry that swaps in a different font file fails. Its
suite grew 35 → **40**, with the not-started world now the simulated one. A gate
frozen to "the stub must stay empty" would have been deleted the day P01 shipped,
and a deleted gate guards nothing.

---

## 15. Test matrix

**Package — 151 tests, 9 suites, all passing.**

| Suite | Tests | Covers |
|---|---|---|
| `validation/structure.spec.ts` | 33 | version, kinds, unknown fields, numbers/ranges, coercion refusal, identity, group graph, freehand, NFC, purity |
| `validation/complexity.spec.ts` | 17 | every limit at boundary and +1, counting rules, code points, hidden/locked, byte-vs-character, no truncation |
| `validation/context.spec.ts` | 19 | eligibility, cross-asset mapping, partial/unusable metadata, dimension equality, media type, decoded-pixel boundary, repeat charging, fonts, finding safety |
| `quantization/quantize.spec.ts` | 14 | locked precision and authority, rounding, `-0`, boundaries, idempotence, non-finite refusal, field coverage, purity |
| `canonical/canonicalize.spec.ts` | 18 | RFC 8785 vectors, insertion order, array order, repetition, UTF-8, pipeline order, revalidation, finding safety |
| `server/hash.spec.ts` | 13 | known vectors, determinism, canonical-bytes-only, purity, export boundary via graph walk, manifest subpath |
| `migration/registry.spec.ts` | 11 | v1 round trip, output validation, missing/future version, purity, contiguity |
| `fonts/registry.spec.ts` | 14 | manifest agreement, **binary re-hash**, licence and coverage evidence, role distinction, exclusions, variant lookup |
| `architecture.spec.ts` | 12 | dependency boundary, DOM/canvas absence, fs/socket absence, geometry absence, forbidden serialized fields, file-size limits |

**Checkers:** `check-app3-p01.test.mjs` **39/39**;
`check-app3-f01-font-assets.test.mjs` **40/40**.

---

## 16. Scoped validation

`pnpm quality` was **not** run. No root script was added.

| Command | Result |
|---|---|
| `node tools/check-app3-f01-font-assets.mjs` | **PASS** |
| `pnpm --filter @embroidery/design-document test` | **151/151**, 9/9 suites |
| `pnpm --filter @embroidery/design-document typecheck` | **PASS** |
| `pnpm --filter @embroidery/design-document build` | **PASS** — emits `dist/index.js`, `dist/server/index.js` + declarations |
| `node tools/check-app3-p01.mjs` | **PASS** |
| `node --test tools/check-app3-p01.test.mjs` | **39/39** |
| `node --test tools/check-app3-f01-font-assets.test.mjs` | **40/40** |
| `node tools/check-app3-g04.mjs` | **PASS — DERIVATIVE_METADATA_IMPLEMENTED** |
| `node tools/check-app3-db01.mjs` | **PASS** |
| `pnpm format:check` | **PASS** |
| `pnpm lint` | **PASS** — 21/21 tasks |
| `git diff --check` | **clean** |

No consumer typecheck was added: `packages/design-document` has **no dependent
workspace** — nothing imports it yet, which is why `APP3-B03` and the other
document-accepting APIs are the checkpoints this unblocks. P02, API, worker,
database, E2E, smoke, OpenAPI, Figma, spike and full-regression suites were not
run; no owned input of any changed.

### Line counts

| File | Lines | Limit |
|---|---|---|
| `src/validation/element.ts` | 306 | ≤ 400 |
| `src/validation/context.ts` | 212 | ≤ 400 |
| `src/validation/structure.ts` | 185 | ≤ 400 |
| `src/validation/primitives.ts` | 173 | ≤ 400 |
| every other production file | ≤ 155 | ≤ 400 |
| `src/validation/structure.spec.ts` | 260 | ≤ 600 |
| every other test file | ≤ 190 | ≤ 600 |
| `tools/check-app3-p01.mjs` | 400 | ≤ 400 |
| `tools/check-app3-p01.test.mjs` | 328 | ≤ 600 |
| `tools/check-app3-f01-font-assets.mjs` | 400 | ≤ 400 |
| `tools/check-app3-f01-font-assets.test.mjs` | 398 | ≤ 600 |

---

## 17. Status

```text
APP3-F01 = COMPLETE — REVIEW_ACCEPTED
APP3-P01 = COMPLETE — REVIEW_DELIVERED
APP3-P02 = READY — NOT STARTED

APP3-B03 = READY_BY_P01 — NOT STARTED
APP3-B04 = BLOCKED_BY_APP3-P02_AND_APP3-B06
APP3-B05 = READY_BY_P01 — BLOCKED_BY_APP3-B04
APP3-B06 = READY — NOT STARTED
APP3-B07 = BLOCKED_BY_APP3-P02
APP3-B08 = BLOCKED_BY_APP3-P02

APP3 =
IN PROGRESS — DOCUMENT FOUNDATION DELIVERED_FOR_REVIEW
```

No backend checkpoint is complete. Human review owns
`APP3-P01 = COMPLETE — REVIEW_ACCEPTED`.

---

## 18. Confirmations

- **Commit A:** `0cbc5919e1ee1505098139457135b35b387ae43c`.
- **Working tree clean** after Commit A; Commit B adds only this report.
- **Nothing pushed.** `origin/production` remains at `8b5f3b0`.
- **No `APP3-P02`, backend, API, OpenAPI, generated-client, worker, database,
  migration, Figma or UI change.**
- **No renderer**: no React, Next, NestJS, Konva, Fabric, interact.js, DOM,
  canvas or SVG code, and no spike import.
- **No font binary, manifest, licence or `.gitattributes` byte changed.**
- **No root `package.json` script**; no new external dependency; the lockfile
  records existing workspace versions only.
- **`pnpm quality` not run**; no repository-wide aggregate validation.
- **No credential read, written, echoed or rotated;** `.env` untouched.
