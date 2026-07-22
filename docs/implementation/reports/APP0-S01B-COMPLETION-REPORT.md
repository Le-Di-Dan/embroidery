# APP0-S01B — App SCSS Entry Integration and Styling Guardrails — Completion Report

**Checkpoint:** APP0-S01B (frontend foundation; dep: S01A)
**Type:** Integrate the shared Sass foundation into both Next.js apps and add a styling-boundary guardrail. No screen styling, no component library, no backend/database change.

## A. Preflight

- **Branch:** `production`
- **Initial HEAD:** `9de65b025c74eaa7e66e9720cca78f6a6ada10c5` (`feat(styles): add shared Sass token foundation`).
- **Initial working tree:** clean; no unrelated user changes.
- **Verified S01A commit:** `9de65b0` — subject `feat(styles): add shared Sass token foundation`; confirmed as a descendant of APP0-C01 `1e03997` and equal to initial HEAD. `git show --stat` confirms it contains only the `packages/styles/**` foundation, lockfile/workspace additions for `sass`, and the S01A docs — expected scope.
- **S01A completion-report status:** present at `docs/implementation/reports/APP0-S01A-COMPLETION-REPORT.md`, verdict `PASS_WITH_FOLLOW_UPS`.
- **S01A validation re-run:** `pnpm --filter @embroidery/styles validate` → PASS ("11 .scss files; entry emits no CSS; tokens resolve").

## B. Existing styling audit

- **Existing style files:** none. No `.css`/`.scss`/`.sass` anywhere in `apps/*/src`.
- **Existing violations:** none. No Tailwind, no PostCSS, no CSS Modules, no CSS-in-JS (styled-components/Emotion/Stitches/styled-jsx), no shadcn styling, no inline `style` props, no existing global CSS import.
- **Classification:** `NONE`. Both root layouts were minimal scaffolds (`<html><body>{children}</body></html>`).

## C. App integration

- **Admin `main.scss`:** `apps/admin/src/styles/main.scss` (canonical path).
- **Storefront `main.scss`:** `apps/storefront/src/styles/main.scss` (canonical path).
- **Root layout imports:** each `src/app/layout.tsx` adds exactly one side-effect import `import '../styles/main.scss';`. No metadata, font, or HTML-structure change.
- **Direct dependencies:** each app manifest adds `@embroidery/styles: workspace:*` (dependency) and `sass: ^1.83.0` (devDependency) — declared directly per app, not relying on hoisting or transitive resolution. Lockfile updated by pnpm (`@embroidery/styles` + `sass` recorded under both apps).
- **Sass resolution method:** each app imports the package by name (`@use '@embroidery/styles' as styles;`). Next's Sass loader resolves the package entry via the package `exports`/`sass` field, but under Next 16 + Turbopack it cannot resolve the package's own internal `@use`/`@forward` graph unless the package's Sass source directory is on the Sass load path; each `next.config.ts` therefore sets `sassOptions.loadPaths`. **This load path is required toolchain infrastructure, not a removable workaround** — see the correction history below and `APP0-S01B-C1-CORRECTION-REPORT.md`. Post-correction, the load path is **resolved from the installed package name** (`path.dirname(require.resolve('@embroidery/styles'))`), so no consumer hard-codes the monorepo layout or an absolute path, and no app SCSS imports `@embroidery/styles/src` internals.
- **Docker wiring (post-review addendum):** the new `packages/styles` workspace member was not enumerated in the four `infrastructure/docker/*.Dockerfile` deps stages, so a container `pnpm install --frozen-lockfile` would fail once the app manifests depend on `@embroidery/styles`. Added `COPY packages/styles/package.json packages/styles/` to each Dockerfile (both install stages for api/worker), and changed the root `docker:dev:up` script to `up -d --build` so the dev stack rebuilds images automatically. Infra-only; no application, screen, backend, or database change.

## D. Emitted CSS scope

Each `main.scss` is identical and emits three fully traceable global rules:

1. `*, *::before, *::after { box-sizing: border-box; }` — browser normalization (predictable box model).
2. `body { margin: 0; }` — browser normalization (remove default user-agent body margin).
3. `body { background; color; font-family; }` bound to `styles.$color-background-primary`, `styles.$color-text-primary`, `styles.$font-family-primary` — document baseline from the approved design foundation (`DESIGN_SYSTEM_FOUNDATION.md §4` background/text, `§5` primary font).

No screen, component, layout, utility, theme, dark-mode, or aesthetic styling is emitted. Build output confirms the pipeline: the compiled admin CSS chunk contains `#171717`, `#faf8f5`, and `border-box`, proving tokens flow `main.scss → @use @embroidery/styles → tokens → app CSS`.

## E. Guardrail implementation

- **Checker:** `tools/check-styling-boundaries.mjs` (repository-native, following `check-file-size.mjs` conventions: exported `checkStylingBoundaries(rootDir)`, `main()` guarded by `import.meta.url`, `process.exitCode` on failure). Pure Node, cross-platform (no shell, no POSIX-only paths); ran on Windows. Never modifies files.
- **Rules enforced:** no CSS Modules (`*.module.{css,scss,sass}`); no Tailwind (config file, `@tailwind` directive, or `tailwindcss` dependency); no CSS-in-JS (`styled-components`/`@emotion`/`@stitches`/`stitches`/`styled-jsx` dependency or import); no Sass `@import`; exactly one `main.scss` per app; `main.scss` only at `src/styles/main.scss`; global style import only from the root layout and only targeting `main.scss`; no app import of `@embroidery/styles/src/**`; no app-local token declaration; no inline React `style` prop.
- **Detection strategy:** line-scanning with targeted, false-positive-controlled regexes. Inline-style detection uses `/(^|[^.\w])style\s*=\s*[{"']/` on `.tsx`/`.jsx` only — this matches the JSX attribute form (`style={` / `style="`) while excluding object properties (`style:`), member access (`node.style`), and prose. **Limitation (documented):** it is a heuristic, not a full TypeScript-AST parse; adding an AST parser would require making `typescript` root-resolvable, which the checkpoint guidance discourages (no new lint framework for one checkpoint). The verification suite asserts the heuristic flags a real `style={{…}}` and does not flag `{ style: 1 }` or `el.style`.
- **Exclusions:** `node_modules`, `.next`, `dist`, `out`, `coverage`, `.turbo`, `__snapshots__`. Scans `apps/*/src` plus each app's `package.json` and Tailwind config location; the checker itself (`tools/`) is out of scan scope.
- **Output:** PASS prints apps checked, files scanned, and the rule groups; FAIL prints `path:line [rule] message` per violation and exits non-zero.
- **Tests:** `tools/check-styling-boundaries.test.mjs` (`node:test`, fixture repos) — 10 cases covering the pass path and each violation class; picked up by the root `node --test "tools/*.test.mjs"` runner.
- **Quality integration:** root `check:styles` script added and inserted into `quality` between `check:file-size` and `db:check:manifest`. Existing gates unchanged; no empty Turbo task added.

## F. Validation

| Gate | Command | Result |
| --- | --- | --- |
| Shared Sass validation | `pnpm --filter @embroidery/styles validate` | PASS |
| Styling guardrail | `pnpm check:styles` | PASS (4 apps, 163 files) |
| Guardrail tests | `node --test tools/check-styling-boundaries.test.mjs` | PASS (10/10) |
| Admin build | `pnpm --filter @embroidery/admin build` | PASS (Turbopack, compiled + static pages) |
| Storefront build | `pnpm --filter @embroidery/storefront build` | PASS |
| Admin typecheck | `pnpm --filter @embroidery/admin typecheck` | PASS |
| Storefront typecheck | `pnpm --filter @embroidery/storefront typecheck` | PASS |
| Admin lint | `pnpm --filter @embroidery/admin lint` | PASS |
| Storefront lint | `pnpm --filter @embroidery/storefront lint` | PASS |
| Prettier | `prettier --check` on all changed source/docs | PASS |
| File size | `node tools/check-file-size.mjs` | PASS (checker 312 lines → REVIEW warning only, < 400 hard limit; all warnings pre-existing style) |
| Whitespace | `git diff --check` | PASS |
| Lockfile | `pnpm install` | "Already up to date" after edits; additions limited to `@embroidery/styles` + `sass` under both apps |

- **Full `pnpm quality` status:** not run wholesale — it chains `db:check:manifest` and the app/DB Jest suites that require PostgreSQL, which is outside this static styling checkpoint. Every relevant subset gate (format, both apps' lint/typecheck, styles validate, styling guardrail + its tests, file-size, diff-check) was run individually and passed. `check:styles` is now part of the `quality` chain for future full runs. This is not claimed as a full-quality PASS.
- **Markdown link check:** relative links in the changed docs resolve.

## G. Scope confirmation

- No screen styling; no page content change; no button/card/form/component styles.
- No component library, utility-class framework, theme, or dark mode.
- No app-local token duplication; no TypeScript token mirror; no new token family (shadow/breakpoint/z-index/opacity remain deferred).
- No prohibited styling tech added (no Tailwind, PostCSS, CSS Modules, CSS-in-JS, shadcn).
- `packages/styles/**` unchanged (no S01A defect required correction).
- No API/backend/worker/database/schema/migration change.
- No codegen/component-test/E2E/canvas/queue tool decision.

## H. Git evidence

- **Commit:** `feat(styles): integrate global Sass entries and guardrails` — hash recorded on commit.
- **Final HEAD:** the new commit (single commit for this checkpoint).
- **Working tree:** clean after commit.
- **Push status:** NOT PUSHED.

## I. Verdict

`PASS_WITH_FOLLOW_UPS` — both apps integrate the shared foundation and build successfully, a cross-platform styling-boundary guardrail is enforced and wired into `quality`, and no prohibited styling was introduced. Follow-ups: (1) the `sassOptions.loadPaths` requirement was reviewed under **APP0-S01B-C1** and confirmed to be a required Next 16 + Turbopack integration constraint; it is now resolved from the `@embroidery/styles` package name rather than a hard-coded path (see correction history); track upstream removal only if/when the toolchain resolves package-internal Sass imports without a consumer load path; (2) full `pnpm quality` should be run in a PostgreSQL-capable environment at phase closure.

## J. Correction history

- **APP0-S01B-C1 (load-path coupling review).** Human review flagged the original `sassOptions.loadPaths` pointing at the hard-coded monorepo path `packages/styles/src` and requested its removal in favour of a relative internal Sass graph. Four build experiments on the real Next 16 + Turbopack + Windows toolchain proved that the load path is **required** (the by-name-resolved entry cannot resolve its internal graph in any form — bare, relative-leaf, relative directory-index, or self-referencing subpath — without it); making the graph relative does **not** remove the need. The corrected architecture keeps the load path but resolves it from the installed package name (`require.resolve('@embroidery/styles')`), removing the hard-coded monorepo/absolute coupling, and re-scopes the styling guardrail to ban only hard-coded/absolute internal-source paths while allowing package-name-resolved load paths. Full evidence: `APP0-S01B-C1-CORRECTION-REPORT.md`. This is a Next/Turbopack integration constraint, **not** a universal Sass limitation.
