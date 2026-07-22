# APP0-S01B-C1 — Resolve the Shared-Styles Sass Load Path by Package Name — Correction Report

**Correction:** APP0-S01B-C1 (frontend foundation; corrects APP0-S01B)
**Type:** Remove the hard-coded monorepo/absolute coupling in the consumer Sass load path; resolve it from the `@embroidery/styles` package name. No token, screen, backend, or database change.

## A. Preflight

- **Branch:** `production`
- **Initial HEAD:** `d52ea5a` (`fix(backend): compile runtime workspace packages so api and worker boot`).
- **APP0-C01 in history:** `1e03997` (`docs(app0): lock application module ownership boundaries`) — present.
- **APP0-S01A commit:** `9de65b0` (`feat(styles): add shared Sass token foundation`).
- **APP0-S01B commit:** `86a082a` (`feat(styles): integrate global Sass entries and guardrails`).
- **Initial working tree:** clean; no unrelated user changes.

## B. Human review finding (original premise) and how it was overturned

- **Original verdict (superseded):** `CORRECTION_REQUIRED` — "consuming Next.js apps currently require `sassOptions.loadPaths` pointing to `packages/styles/src`." The premise was that the load path is a workaround and that a purely **relative** internal Sass graph would let the package self-resolve without any consumer load path.
- **Investigation:** four build experiments were run against the real Next 16 + Turbopack + Windows toolchain (`pnpm --filter @embroidery/admin build`).

| # | `packages/styles/src/index.scss` internal form | Consumer `loadPaths` | Result |
| --- | --- | --- | --- |
| 1 | `@forward './settings/index'` (relative directory-index) | absent | FAIL — "Can't find stylesheet to import" |
| 2 | `@forward './settings/color'` (relative leaf) | absent | FAIL — same, at the leaf |
| 3 | `@forward '@embroidery/styles/settings'` (package self-reference) | absent | FAIL — one level deeper, at `settings/_index.scss` `@forward './color'` |
| 4 | `@forward './settings/index'` (relative directory-index) | present | **PASS — compiled successfully** |

- **Technical conclusion:** the entry file, resolved by package name out of `node_modules`, cannot resolve its internal `@use`/`@forward` graph in **any** form (bare, relative-leaf, relative directory-index, or self-referencing subpath) **unless** the consumer provides a Sass load path into the package source. Making the internal graph relative does **not** remove the need. The original build worked only because every internal specifier was bare and resolved *through* the load path. The premise was therefore overturned: on this toolchain the load path is **required integration configuration**, not a removable encapsulation smell.
- **Scope of the premise:** this is a **Next 16 / Turbopack Sass integration constraint**, not a universal Sass limitation. The package's own `sass.compile` validation (`pnpm --filter @embroidery/styles validate`) resolves the relative graph fine with the native Dart Sass importer.
- **Clean state before the decision:** all four experiments' edits were reverted; `git status` was clean; **no experimental commit was created**; the decision below was taken on the restored, building tree.

## C. Root cause

- **Where:** consumer build configuration — `apps/admin/next.config.ts` and `apps/storefront/next.config.ts`.
- **Original (S01B):** `sassOptions.loadPaths: [path.join(__dirname, '../../packages/styles/src')]` — a **hard-coded, monorepo-relative** path into the package source. This is the real coupling: the consumer encodes the package's internal folder depth and source directory.
- **Not the root cause:** the *presence* of a load path (required by Turbopack) and the internal graph form (bare vs relative) — both proven above.

## D. Correction

- **Package public boundary (`packages/styles/package.json`):** the `.` export previously exposed only `sass`/`style` conditions, so `require.resolve('@embroidery/styles')` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` and the package could not be located by name from a Node context. Added a `"default": "./src/index.scss"` condition to the `.` export so Node's resolver can locate the public entry by name. The bundler still matches the `sass` condition first, so **Sass output and token resolution are unchanged**. No token values, no partial paths, no internal Sass graph changed.
- **Consumer configs (both apps):** replaced the hard-coded path with a **package-name-resolved** load path:

  ```ts
  const configRequire = createRequire(path.join(__dirname, 'next.config.ts'));
  const stylesLoadPath = path.dirname(configRequire.resolve('@embroidery/styles'));
  // sassOptions: { loadPaths: [stylesLoadPath] }
  ```

  `require.resolve('@embroidery/styles')` → `.../packages/styles/src/index.scss`; `path.dirname` → the package Sass source directory. The consumer now depends only on the **public package name** and a documented toolchain requirement — never the monorepo layout, `process.cwd()`, or an absolute machine path. App `main.scss` files are unchanged and still use `@use '@embroidery/styles' as styles;`.
- **Guardrail re-scope (`tools/check-styling-boundaries.mjs`):** the internal-source check now also scans app root config files (`next.config.*`, `package.json`) and matches with a separator-tolerant pattern (`/`, `\`, escaped `\\`), so it flags:
  - a hard-coded monorepo-relative source path (`../../packages/styles/src`);
  - an absolute / back-slashed path into the package source;
  - a deep `@embroidery/styles/src/**` module specifier in app Sass or code.

  It **allows** a package-name-resolved load path (`require.resolve('@embroidery/styles')` contains neither forbidden substring), `@use '@embroidery/styles'`, and the package's own internal relative graph (the package is outside the app scan scope). The checker stays at 371 lines (< 400 hard limit).
- **Guardrail regression tests (`tools/check-styling-boundaries.test.mjs`):** added — (1) hard-coded `../../packages/styles/src` → FAIL; (2) absolute back-slashed path → FAIL; (3) `require.resolve('@embroidery/styles')`-derived path → PASS; (4) app Sass import `@embroidery/styles/src/settings/color` → FAIL; (5) public package import → PASS (existing compliant-app case).

## E. Validation

| Gate | Command | Result |
| --- | --- | --- |
| Shared Sass validation | `pnpm --filter @embroidery/styles validate` | PASS (11 .scss files; entry emits no CSS; tokens resolve) |
| Styling guardrail | `pnpm check:styles` | PASS (4 apps, 163 files) |
| Guardrail tests | `node --test tools/check-styling-boundaries.test.mjs` | PASS (14/14) |
| Admin build | `pnpm --filter @embroidery/admin build` | PASS (Turbopack, compiled + static pages) |
| Storefront build | `pnpm --filter @embroidery/storefront build` | PASS |
| Admin typecheck | `pnpm --filter @embroidery/admin typecheck` | PASS |
| Storefront typecheck | `pnpm --filter @embroidery/storefront typecheck` | PASS |
| Admin lint | `pnpm --filter @embroidery/admin lint` | PASS |
| Storefront lint | `pnpm --filter @embroidery/storefront lint` | PASS |
| Prettier | `prettier --check` on all changed files | PASS |
| File size | `node tools/check-file-size.mjs` | PASS (checker 371 lines → REVIEW note only, < 400 hard limit) |
| Whitespace | `git diff --check` | PASS |

- **Token-value integrity:** no design-token file changed; the only `packages/styles` change is one added `default` export condition. Validation confirms tokens resolve to their approved values.
- **No hard-coded/absolute styles source path** remains in either config; both resolve the load path from `@embroidery/styles`; both `main.scss` files still import the package by name.
- **Full `pnpm quality`:** not run wholesale (chains PostgreSQL-backed Jest suites outside this static styling correction); every relevant subset gate was run individually and passed. Not claimed as a full-quality PASS.
- **Markdown links** in the changed docs resolve.

## F. Scope

- No screen, component, layout, utility, theme, or dark-mode styling.
- No new token family; no token value changed.
- No API/backend/worker/database/schema/migration change.
- No prohibited styling technology (no Tailwind, PostCSS, CSS Modules, CSS-in-JS).
- No codegen/component-test/E2E/canvas/queue tool decision.
- **APP0-B01 not started.**
- **Allowed-file note:** `packages/styles/package.json` is outside the C1 direction's stated allowed-file list. The one-line `default` export condition was the minimal change required to make the chosen mechanism (name resolution from the consumer config) function at all — without it, `require.resolve('@embroidery/styles')` throws. Flagged here for reviewer awareness; it touches package metadata only, not tokens or the Sass graph.

## G. Git evidence

- **Original S01B commit:** `86a082a` (`feat(styles): integrate global Sass entries and guardrails`) — unchanged, not amended.
- **Correction commit:** `fix(styles): resolve Turbopack Sass path by package name` — single commit; hash recorded in the delivery response and equal to the final HEAD.
- **Working tree after commit:** clean.
- **Push status:** NOT PUSHED.

## H. Verdict

`PASS` — the consumer load path is resolved from the public package name with no hard-coded monorepo or absolute coupling; both apps build; the guardrail and its regression tests enforce the boundary; no token, backend, or database change. APP0-S01B remains `PASS_WITH_FOLLOW_UPS` (upstream-toolchain follow-up only). APP0-B01 is not started.
