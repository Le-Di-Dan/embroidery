# APP0-R01 — 2D Canvas/SVG Feasibility Spike — Completion Report

Checkpoint `APP0-R01 — 2D canvas/SVG feasibility spike`. Verdict **PASS**. `IMP-O004` resolved by **IMP-D026** / `ADR-APP0-001`.

## A. Preflight + APP0-T02B revalidation

Initial state: branch `production`, HEAD `adb28efbed4c8af66ab2c50f244e0aa9360aaa97`, `git status --short` empty.

| T02B evidence | Result |
| --- | --- |
| Implementation commit | `a90a9f9aa9fa58540668d314045e6949956866cc` — `test(e2e): add Playwright gateway smoke foundation` (32 files) |
| Evidence commit | `adb28efbed4c8af66ab2c50f244e0aa9360aaa97` — `docs(app0): record APP0-T02B completion evidence` |
| Reports present | `APP0-T02B-COMPLETION-REPORT.md`, `APP0-DEC-E2E-COMPLETION-REPORT.md` |
| `pnpm --filter @embroidery/e2e-testing test` | 0 — 4 suites, **14 tests** |
| `pnpm check:e2e` | 0 — boundary clean, 15 tests collected, pin `1.61.1` asserted, **no browser launched** |
| `pnpm quality` | 0 |
| `pnpm quality:e2e` | 0 — **15 tests** across 6 projects (Chromium/Firefox/WebKit × storefront/admin), 13.4 s |
| Version alignment | npm `@playwright/test 1.61.1` ↔ image `mcr.microsoft.com/playwright:v1.61.1-noble` digest `sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48` |
| Residue | no `emb-e2e*` container; ports 5544/8090/4400/4310/4311 closed; disposable DB dropped |

`T02B_REVALIDATION = PASS`.

## B. Product / architecture gates

Read before designing: `05` (full), `09 §4–§6`, `10 §3/§6/§7`, `12` D-004/D-005/D-007/D-008/D-009, `13`, `APP3-…-STUDIO.md`, `FRONTEND_CONVENTIONS.md` §3/§10/§12/§15/§17, `REPOSITORY_STRUCTURE.md` §11, and — decisive — `ADR-DB1-012`: `packages/design-document` owns types/validation/RFC 8785 JCS canonicalization/SHA-256/document migrations; the DB stores the payload opaquely with `document_schema_version` + hash columns; approved snapshots are frozen.

No persistence schema was invented. The spike document is spike-only and carries the DB-mandated shape (schema version, stable ids, product side + embroidery area, pixel **and** physical dimensions, z-ordered array, asset references) without proposing columns.

## C. Candidate matrix

| # | Candidate | Version | License | Latest release | Runtime deps | Spiked |
| --- | --- | --- | --- | --- | --- | --- |
| A | `konva` + `react-konva` | `10.3.0` / `19.2.5` | MIT / MIT | 2026-04-30 / 2026-06-09 | 0 / 4 (`react-reconciler`, `scheduler`, `its-fine`, types) | **Yes** |
| B | `fabric` | `7.4.0` | MIT | 2026-05-18 | 0 (`engines.node >=20`) | **Yes** |
| C | native SVG + React 19 | — | platform | — | 0 | **Yes** |
| D | `pixi.js` (+ `@pixi/react`) | `8.19.0` / `8.0.5` | MIT | 2026-07-13 / 2025-12-01 | 10 (incl. `@xmldom/xmldom`, `parse-svg-path`, `@webgpu/types`) | No — rejected pre-spike |

Metadata from the npm registry (versions, licenses, dependency lists, publish dates) plus each project's official site/repository. No candidate runs an install script in a consumer install; `konva`'s optional native `canvas` backend is explicitly denied in `pnpm-workspace.yaml` (browser-only spike). `interactjs 1.10.27` was reviewed as candidate C's pointer layer and rejected — last release **2024-03-28**; the platform Pointer Events API covered every required gesture instead.

**Pre-spike rejection of D, recorded not dropped:** PixiJS is a WebGL/WebGPU renderer for graphics/game workloads; ten runtime dependencies for capabilities SVG has natively, no accessibility story for editor semantics, GPU context-loss failure modes on mobile — for throughput this product (<10 concurrent editors, `10 §3`) does not need.

## D. Spike design, environment, frozen budgets and weights

`spikes/app0-r01-design-studio/` — a private Next **16.2.10** / React **19.2.7** / TypeScript **5.9.3** app in the workspace, never a dependency of any app or package.

- **One document model** (`src/document/`): types, RFC-8785-shaped canonical form, SHA-256 (Web Crypto + pure-JS fallback), validation, S/M/L + common scenes, px↔mm units.
- **One adapter contract** (`src/adapters/types.ts`) implemented identically by all three candidates; `DocumentState` holds the truth for all of them.
- **One measurement driver** (`src/harness/`): `window.__spike` exposes mount/load/gesture/selection/undo/serialization/leak/pointer probes. Gestures are 60 rAF-driven frames; loads are 7 samples after 2 warm-up samples.
- **Common scene**: 1 product background, 1 safe area, 2 multiline texts, 1 curved-text probe, 2 rasters (PNG + JPG), 1 sanitized SVG, 2 shapes, 1 mixed group (3 children), 1 locked item, 1 hidden item, plus the policy-supplied repeated watermark. All assets generated locally by `scripts/generate-assets.mjs`; fonts and images awaited before measuring.

Environment (`results/environment.{windows,linux}.json`): Windows_NT 10.0.26100, Intel i7-12700K, 20 cores, 31.7 GB, Node v22.14.0, headless, no CPU/network throttling, mains power. Linux tier = pinned `mcr.microsoft.com/playwright:v1.61.1-noble` (`sha256:5b8f294a…`, Node 24) on the same host hardware. Playwright `1.61.1` on both, installed **separately** inside the image (the image ships browsers and system dependencies, not the npm package). WebKit is a Safari approximation; Pixel-7 emulation is **not** a real device.

**Frozen before any result was read** (`scripts/summarize.mjs`; §21 defaults, since `10 §3` defers exact budgets): transform frame p95 ≤20 ms desktop / ≤33 ms mobile at M; no long task >100 ms; scene-load-to-usable ≤500 ms desktop / ≤1000 ms mobile at M; canonical serialize ≤100 ms / deserialize ≤300 ms at L; renderer gzip ≤200 KB; no monotonic heap growth over 20 mount/destroy cycles. **Weights**: capability 25, architecture 20, React/Next 15, mobile 15, performance/bundle 15, accessibility 5, supply chain 5.

## E. Capability, mobile and watermark results

All three candidates passed every functional gate on every project: multiline text · curved text · raster transform (move/rotate/flip/opacity) · SVG element loaded · multi-select · z-order · group/ungroup · lock/hide · viewport independent of the document · out-of-area warning · domain undo/redo.

Differences that matter:

- **SVG recolour** — Fabric (real vector objects via `loadSVGFromURL`) and native SVG can recolour an imported SVG; **Konva cannot**, it rasterises SVG through `HTMLImageElement`.
- **Script safety** — the fixture deliberately contains a `<script>` and an `onload` attribute; `svgScriptExecuted = false` in every run on every engine, and the SVG candidate reports the nodes it stripped.
- **Fabric geometry divergence** — an imported SVG group's Fabric layout origin does not match the document box, so the document box centre is not a reliable hit point. Hit testing must be asked of the engine, never derived from document geometry.

**Watermark** (identical policy for all, six probes, all true in every run): select-all excludes it · deleting every element leaves it · canonical serialization never contains the marker · reloading recreates it · it stays topmost after zoom 3× and pan · the marker carries no raw PII.

**Mobile/touch** (Pixel 7 emulation, `hasTouch`, dsf 3; trusted multi-touch via CDP `Input.dispatchTouchEvent`) — all pass for all three engines: tap-select, one-finger drag (element moved 32 px), touch resize and rotate through DOM handles, pinch zoom (1 → 3), two-finger pan, and `touchCancel` leaving `mode = idle` with 0 active pointers. Handles measure 44 px ≥ the 44 px provisional target; the stage owns `touch-action: none` so page scroll cannot steal an active edit. WebKit has no CDP channel in Playwright, so multi-touch there is recorded as **not executed** rather than assumed.

## F. Serialization results

| Property | Result |
| --- | --- |
| Common-scene canonical hash | `sha256:d6be2ccb689b66cfe8cbae03ca7cf8340de38f73bc6cbf63fb7e7768272586e2` — identical for **all three engines, both platforms, all five runs** |
| Cross-engine common subset | `sha256:d8a4f67d07c5e27aee2de8264ae4848405339e09114b10cfe6b6fcc7137b7d81` — identical everywhere |
| Round trip | semantic equality and hash stability across load → serialize → reload → serialize |
| After transforms | hash stable across a further serialize/reload cycle (float noise quantized) |
| Transient fields | rejected (`viewport`, `selected`, `watermark`, `objectURL`, `canvas`, …) |
| Unknown `schemaVersion` | rejected loudly |
| Canonical size | 5 160 bytes (common scene) / 52 559 bytes (L) |
| Hash implementation | `web-crypto` on Windows, `pure-js` on Linux — **same digest** |

The pure-JS path is not a convenience: `crypto.subtle` exists only in a **secure context**, so it is `undefined` over the container's plain-HTTP origin. Recorded as an APP3 trap — canonical hashing stays server-side.

## G. Performance and bundle

Worst value across the five runs (Windows desktop/mobile Chromium; Linux desktop/mobile Chromium + desktop WebKit); budgets in brackets.

| Metric | konva | fabric | **svg** |
| --- | --- | --- | --- |
| Transform p95, M, desktop [≤20 ms] | 20 | **42** | **17** |
| Transform p95, M, mobile [≤33 ms] | **33.4** | **50.1** | **16.8** |
| Transform p95, L (worst) | 50 | 83.4 | 17 |
| Dropped frames, L drag (of 60) | 19 | 59 | **0** |
| Long task max [≤100 ms] | 96 | **179** | **0** |
| Load-to-usable p95, M [≤500 / 1000 ms] | 36.9 | 166.2 | 34.6 |
| Load-to-usable p95, L | 81 | 481.3 | 33.4 |
| Canonical serialize / deserialize p95, L [≤100 / 300 ms] | 2 / 1 | 2 / 1 | 1.1 / 1 |
| Heap growth over 20 mount/destroy cycles | none | none | none |
| Nodes at L (engine / DOM) | 229 / 4 | 230 / 2 | 151 / **508** |
| Incremental gzip [≤200 KB] | 92.3 KB | 90 KB | **0 KB** |
| **Hard gates** | **FAIL** | **FAIL** | **PASS** |

Bundle measured with one bundler/minifier for all (`esbuild 0.28.1`, ESM, es2022, minified, React/React-DOM/Next external): `konva`+`react-konva` 92.3 KB gzip of which `konva` alone is 49.2 KB — the react-konva reconciler binding is ~43 KB; `fabric` 90 KB; native SVG adds **no engine bytes**.

**Attribution run** (same M scene, watermark tile count made negligible): Fabric's desktop drag p95 falls 33.4 → 16.7 ms and its mobile drag 50.1 → 33.4 ms, while Konva and SVG are unchanged. Fabric's failure is therefore caused by the **mandatory repeated watermark** (D-008) meeting a single-canvas full-repaint model — a product requirement, not an artificial benchmark. Konva's mobile cost is device-pixel-ratio repaint, not the watermark.

**Variance, stated honestly:** Konva sits *on* the boundary. Across repeated runs its desktop-WebKit transform p95 measured 20–23 ms (budget 20) and its mobile long task 96–109 ms (budget 100), so its verdict flips run to run; only the mobile transform breach (33.4 vs 33) was constant. SVG measured 16.7–17 ms with zero dropped frames and zero long tasks in every run.

SHA-256 of the committed result files:

```text
de83fb0c72b15b89a169904250f6464bdc77087536f3b170e9e90d32374733a5  results/bundle.json
e2a4ddd82e16a04df837ecbe09aaca1227e1b2c6bbf4120b6547d067477eaecc  results/environment.linux.json
9753a5ca06d59f0a32ea4de38d2f8d244d65b2ceca71cd5ca010f8da67e8eb76  results/environment.windows.json
23c1f0c9f869b5fa596d0f137b0d7545905e9167ac9c3c3d84bdb69aca4a69d8  results/fabric.summary.json
fb9b759c5890d84f0aea8f3418fff11897d526271b374f0abb16e08a26a99442  results/konva.summary.json
fd07368aed9ecf2e8560d03473b58060ab6391393d87a72b6e7a284cd3933495  results/scoring.json
b2159d694859e98ef4a9853a0337df0fc97c0f5b289e95f991686f77cc6a6c4b  results/svg.summary.json
```

36 raw per-run files: `spikes/app0-r01-design-studio/results/raw/{capability,performance,mobile}.<engine>.<project>.<platform>.json`.

## H. Decision, ADR, rejections

Weighted score (`results/scoring.json`): **svg 96.0**, konva 74.2, fabric 61.1. Only **svg** passes all nine hard gates; `scoring.selected = "svg"`.

**Selected: native SVG rendered by React 19, with no rendering engine and no interaction library**, behind an engine-neutral document plus a mandatory renderer-adapter boundary. ADR `docs/adr/frontend/ADR-APP0-001-2D-RENDERING-ARCHITECTURE.md`; register entry IMP-D026 resolving IMP-O004.

Rejected — **Fabric.js**: fails the frozen budgets at product scale, driven by a mandatory product requirement; no React binding; imported-SVG geometry divergence. **Konva + react-konva**: *runner-up and documented fallback* — functionally complete and passing on desktop Chromium, but boundary-marginal on mobile/WebKit, +92 KB gzip, cannot recolour imported SVG, opaque to assistive technology. **PixiJS**: rejected pre-spike on official API/architecture evidence. **interact.js**: unmaintained since 2024-03-28.

## I. APP3 handoff

- **Ownership** — `packages/design-document` owns document/canonical form/hashing (ADR-DB1-012); `packages/design-engine` owns geometry and px↔mm conversion; the Studio feature owns the adapter + React scene. No rendering dependency enters any app manifest.
- **Adapter interface** — reviewed shape at `spikes/app0-r01-design-studio/src/adapters/types.ts`; production home is APP3-S02.
- **Runtime rules** — document = truth; the adapter owns mutable runtime objects; Zustand holds ids/tool/viewport only; client-only lazy load behind a server-rendered shell; scene lifecycle mount → load → destroy, proven to leave zero DOM nodes.
- **Assets** — id + `editor-preview` derivative only; never originals or high-resolution previews; SVG sanitized before rendering.
- **Watermark** — policy at mount/load; non-selectable, non-deletable, topmost, regenerated on load, opaque marker, never serialized.
- **Serialization** — canonical JSON + SHA-256 server-side; unknown version fails; document migrations are code in the owning package.
- **Undo/redo** — domain commands/snapshots, never an engine history stack.
- **Touch** — shared gesture controller; DOM handles outside the element box, ≥44 px, focusable; `touch-action: none` on the stage.
- **Accessibility** — renderer plus accessible non-canvas controls (layer list, property panel, keyboard nudge). No WCAG claim.
- **Regression scenes** — the S/M/L scenes and `pnpm spike:editor:benchmark` are the performance-regression harness for APP3/APP12.
- **Prohibited in APP3** — persisting engine JSON, mutable engine objects in Zustand, any export/download surface, an editable watermark, loading original high-resolution assets by default, 3D/digitizing/stitch simulation.

## J. Commit A evidence

`research(editor): select 2D rendering architecture` — **`d7105915b725f4e0a170675835feac2f6813d7d6`** (105 files).

`pnpm-workspace.yaml` (adds `spikes/*`; denies the optional native `canvas` build) · root `package.json` (`spike:editor:*` scripts, `check:spike-boundaries` joined to `quality`) · `pnpm-lock.yaml` · `tools/check-file-size.mjs` (scans `spikes/`) · `tools/check-spike-boundaries.mjs` (new) · `docs/adr/frontend/ADR-APP0-001-2D-RENDERING-ARCHITECTURE.md` (new) · `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` · `docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md` (§5.2) · `docs/architecture/REPOSITORY_STRUCTURE.md` (§11b + `spikes/`) · `docs/architecture/SYSTEM_ARCHITECTURE.md` (canvas library now locked) · `docs/development/FRONTEND_CONVENTIONS.md` (§12) · `spikes/app0-r01-design-studio/**` (94 files).

No app, API, worker, generated client, OpenAPI artifact, styles package, migration or production-infrastructure file was touched. Spike-only dependencies: `konva 10.3.0`, `react-konva 19.2.5`, `fabric 7.4.0`, `next`/`react`/`react-dom` matching the apps, and dev-only `@playwright/test 1.61.1`, `esbuild`, `sharp`, `jest`, `ts-jest`, `typescript`, `eslint`.

## K. Validation matrix

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm install` | 0 | lockfile updated for `spikes/*` only |
| `pnpm spike:editor:build` | 0 | Next 16.2.10 production build; `/`, `/bench/{konva,fabric,svg}` prerendered — no SSR `window` crash |
| `pnpm spike:editor:check` | 0 | isolation clean, 7 artifacts, 36 raw runs, no machine path/secret/external URL; `eslint` 0; `tsc --noEmit` 0 |
| `pnpm spike:editor:test` | 0 | **29 tests**, 2 suites (canonical form, hashing incl. the FIPS 180-4 vector, validation, scenes, units, watermark policy) |
| `pnpm spike:editor:bundle` | 0 | `results/bundle.json` |
| `pnpm spike:editor:benchmark` | 0 | Windows: 2 projects, **15 passed / 3 skipped**, 3.6 min |
| `pnpm spike:editor:benchmark:linux` | 0 | pinned image: 3 projects, **21 passed / 6 skipped**, 5.2 min |
| `pnpm --filter @embroidery/admin build` | 0 | unchanged |
| `pnpm --filter @embroidery/storefront build` | 0 | unchanged |
| `node tools/check-frontend-build-boundary.mjs` | 0 | clean |
| `node tools/check-spike-boundaries.mjs --build` | 0 | no app/package depends on a spike or candidate; built output free of spike/candidate markers |
| `pnpm check:openapi` | 0 | artifact byte-identical |
| `pnpm check:api-client` | 0 | tree hash `3ca2b2e39eaab0f970f620cea932e7cee15463a6e755a66db7b9686b056f6b75` unchanged |
| `pnpm check:e2e` | 0 | still browser-free |
| `node tools/check-file-size.mjs` | 0 | passed; `spikes/` now in scope; 8 pre-existing files above the review threshold, none new |
| `git diff --check` | 0 | no whitespace errors |
| `pnpm quality` | 0 | full chain including the new `check:spike-boundaries`; runs **no** benchmark and launches **no** browser |
| `pnpm quality:e2e` | 0 | 15 tests, unchanged by this checkpoint |

Skipped bench tests are the mobile suite under desktop projects and vice versa — `test.skip` by design, not silenced failures.

## L. Deviations and follow-ups

1. **Pre-existing DB10 flake, twice, then green.** Two `pnpm quality` runs failed on a single DB10 durability test — first `db10-cp4-anonymization`, then `db10-cp2-logical-restore` — both `Command failed: docker exec embroidery-dev-postgres-1 dropdb -U embroidery --if-exists --force embroidery_db10_*`, with 778/779 tests passing each time. The whole durability directory passes in isolation (**5 suites, 31 tests**, exit 0) and the third full `pnpm quality` is **exit 0**. Cause: a `dropdb --force` race when ~10 Jest workers share one dev container — not this checkpoint (Commit A touches no `apps/api` file, no database, no test harness). Hardening it (retry, or a disposable database per durability suite) is worth a later checkpoint and is **not** fixed here: `apps/api/**` is outside the allowed Commit A scope.
2. **Result files vs Prettier** — the scripts emit `JSON.stringify(…, 2)`, which Prettier reformats, so `pnpm format` must follow any regeneration (documented in the spike README). `.prettierignore` was not modified — outside the allowed Commit A scope. Related: re-running the benchmark on the frozen commit (§32.8 post-commit check, 6 passed) rewrites the result files; they were restored with `git checkout` so the committed evidence remains exactly the run reported above, and the SHA-256 list in §G was re-verified after restoring.
3. **`CLAUDE.md` §8** still lists "Canvas library" among open decisions. Outside the allowed Commit A scope, and it already defers to the decision register, which now records IMP-D026. Left for the owner to align.
4. **Konva measured on the budget boundary** — reported as observed variance across runs rather than one run (§G).
5. **Emulation is not a device** — Pixel 7 emulation and WebKit are approximations; real-device validation belongs to APP12.
6. **WebKit SVG zoom** — viewport-scale gestures measured 41 ms p95 on desktop WebKit versus 16.7 ms on Chromium. Not a locked transform gate, but APP3 should step zoom discretely or scale a wrapper rather than the SVG itself.

## M. Acceptance matrix

| Requirement | Status |
| --- | --- |
| T02B chain revalidated incl. direct `quality:e2e` | PASS |
| Product/DB semantics read; no invented schema | PASS |
| ≥4 candidates reviewed | PASS (4) |
| Konva + Fabric executable | PASS |
| Third candidate executable | PASS (native SVG) |
| Common scene + common adapter; no per-engine benchmark | PASS |
| Text/image/SVG/transform/layer probes | PASS |
| Mobile touch suite | PASS (all engines) |
| React 19 + Next 16 production build, no SSR crash, Strict Mode clean | PASS |
| Watermark separation (6 probes) | PASS |
| Engine-neutral deterministic serialization | PASS |
| Cross-engine common-subset load | PASS (identical hash) |
| Budgets and weights frozen before results | PASS |
| S/M/L p50/p95, frames, long tasks, bundle, leak | PASS |
| ADR + IMP-O004 resolution | PASS |
| APP3 handoff | PASS |
| Production isolation (static + build) | PASS |
| App builds and contract checks unchanged | PASS |
| Exactly two commits, clean tree, not pushed | PASS |

## N. Scope confirmation

No Design Studio production implementation; no editor route or component in Admin/Storefront; no persistence, autosave or API; no upload or background-removal flow; no export/download; no 3D, digitizing or stitch simulation; no rendering dependency in any production manifest; no database, OpenAPI, generated-client or production-infrastructure change.

## O. Evidence closure

Commit A `d7105915b725f4e0a170675835feac2f6813d7d6` carries the spike, the ADR and the decision; Commit B carries only APP0 phase status and this report. Nothing is pushed. APP0-R01 = COMPLETE; APP0-X01 = READY, NOT STARTED.
