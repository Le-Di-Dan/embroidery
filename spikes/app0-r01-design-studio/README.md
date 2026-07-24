# APP0-R01 — 2D rendering feasibility spike

Research-only. **Nothing here ships.** No application, package, API or worker may
depend on this workspace, and `node tools/check-spike-boundaries.mjs` (wired into
root `pnpm quality`) fails the build if one ever does.

## What it answers

Which 2D rendering engine and rendering architecture APP3's Design Studio should
use (`IMP-O004`). It does that by driving three candidates through **one
identical adapter contract**, over **one identical document model**, with **one
identical measurement driver**:

| Candidate | Packages |
| --- | --- |
| A | `konva 10.3.0` + `react-konva 19.2.5` |
| B | `fabric 7.4.0` (imperative; no React binding exists) |
| C | native SVG rendered by React 19 itself (no rendering library) |

## Architecture under test

```text
document/            engine-neutral document, canonical form (RFC 8785-shaped), SHA-256, validation, scenes, units
adapters/            one RendererAdapter contract + document-state; konva/, fabric/, svg/ implementations
harness/             watermark policy, pointer/touch controller, metrics, probes, runner (window.__spike)
bench/               Playwright benchmark + capability + watermark + mobile suites
scripts/             asset generation, orchestrator, bundle measurement, summariser, isolation gate
results/             committed evidence (environment, per-candidate summaries, scoring, raw runs)
```

The document is always the source of truth; an engine is only ever a projection
of it. That is what makes `serialize()` produce byte-identical canonical JSON on
every candidate.

## Commands (from the repository root)

```bash
pnpm spike:editor:assets       # regenerate the local PNG/JPG/SVG fixtures
pnpm spike:editor:build        # next build (required before benchmarking)
pnpm spike:editor:check        # isolation gate + eslint + tsc
pnpm spike:editor:test         # Node unit tests (document/canonical/hash/validation)
pnpm spike:editor:bundle       # incremental bundle cost per candidate (esbuild)
pnpm spike:editor:benchmark    # Windows/host tier: desktop + mobile Chromium
pnpm spike:editor:benchmark:linux   # pinned mcr.microsoft.com/playwright:v1.61.1-noble tier (+ WebKit)
```

The benchmark is deliberately **not** part of `pnpm quality`; only the static
isolation gate is.

After regenerating anything under `results/`, run `pnpm format` from the
repository root: the scripts emit `JSON.stringify(…, 2)`, which Prettier
reformats, and `pnpm quality` runs `prettier --check .`.

## Boundaries

- Local assets only — no CDN, no third-party or copyrighted image, no customer data.
- No persistence, no API, no upload, no export/download, no authentication.
- The watermark is preview policy, never document content, and is never claimed
  to prevent screenshots (D-009).
