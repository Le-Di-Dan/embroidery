# APP0-T02A — Frontend Component-Test Foundation — Completion Report

**Checkpoint:** APP0-T02A · **Branch:** `production` · **Verdict:** `PASS`
**Implementation commit (A):** `711b9ea522f07dd611d8846dddf6f187cda93657` — `test(frontend): add shared component-test foundation`

---

## A. Preflight

- Initial HEAD `9e82005` (`docs(app0): record component-test decision evidence`); working tree clean; no unrelated user changes.
- Decision chain verified: `APP0-DEC-COMPONENT-TEST` — implementation `ce9c8d834fa1f25f12df29e5f684bd3ac07bcb01`, evidence `9e8200594341f45f207a0330a16cf93dceb552ef` (from `git log`); report `APP0-DEC-COMPONENT-TEST-COMPLETION-REPORT.md` present, verdict PASS.
- Initial frontend inventory: both apps on `next 16.2.10`, `react 19.2.7`, `typescript 5.9.3`, `jest 30.4.2`, `ts-jest 29.4.11`; per-app `jest.config.mjs` with `testEnvironment: 'node'` + ts-jest; **2** tests each under `apps/<app>/src/tests/smoke/` (route handler + `renderToStaticMarkup`). No RTL/jsdom present.

## B. Locked implementation

- **Stack (IMP-D024):** Jest + `next/jest` (SWC) + `jsdom` + React Testing Library. Installed dev versions: `@testing-library/react 16.3.2`, `@testing-library/dom 10.4.1`, `@testing-library/user-event 14.6.1`, `@testing-library/jest-dom 7.0.0`, `jest-environment-jsdom 30.4.1` (all MIT). `next/jest` comes from the installed `next` (no new runtime). `ts-jest` removed from both apps (kept for backend/packages).
- **Environment split:** apps default to `jsdom`; server-only tests declare `@jest-environment node`.
- **Placement (stricter than colocation):** all tests + support under `apps/<app>/test/**` (`components/`, `smoke/`, `fixtures/`), never under production `src/**`.
- **Network:** no live network — the generated api-client operation runs with an injected mocked Axios instance; the `fetch` guard proves no global fetch. **Snapshots:** none (role/label/behaviour queries). **Coverage:** `v8`, collected from app `src`.
- **Dependency ownership:** each app declares what it imports (`@embroidery/frontend-testing`, `@testing-library/jest-dom`, `jest-environment-jsdom`); RTL/user-event are owned by the shared package and consumed through it. `@embroidery/frontend-testing` declares its imports (`@testing-library/react`, `@testing-library/user-event` as deps; `react`/`react-dom`/`@tanstack/react-query` as peers + dev). No reliance on hoisting.

## C. Implementation Commit A evidence

- Hash `711b9ea522f07dd611d8846dddf6f187cda93657`; parent `9e82005`; **43 files, +1465 / −49**.
- New package `packages/frontend-testing/**` (13 files: package/tsconfig/eslint/jest/setup + `src/{index,render,query-client,user,navigation}` + 4 tests). Apps: `jest.config.mjs` (rewritten), `jest.setup.ts` (new), `package.json`, `tsconfig.json`, 2 renamed smoke tests, 3 fixtures, 2 component tests each. Tools: `check-frontend-test-boundaries.mjs`, `check-frontend-build-boundary.mjs`. Root `package.json` (scripts + quality). Docs: `REPOSITORY_STRUCTURE.md`, `FRONTEND_CONVENTIONS.md`, `07-TESTING-AND-ACCEPTANCE-GATES.md`. `pnpm-lock.yaml` (pnpm-managed).
- No change to `apps/api`, `apps/worker`, `database`, `infrastructure`, `packages/api-client/src/generated`, `packages/contracts/openapi`, or `packages/styles`.

## D. Test migration and environment proof

| File | From | To | Environment |
|---|---|---|---|
| `health-route.test.ts` (admin, storefront) | `src/tests/smoke/` | `test/smoke/` | `node` (route handler) |
| `home-page.test.tsx` (admin, storefront) | `src/tests/smoke/` | `test/smoke/` | `node` (server-markup via `renderToStaticMarkup`) |

- Assertions unchanged (only import path `../../app → ../../src/app` and the added `@jest-environment node` docblock). No smoke test deleted or weakened. Counts: **2 → 4** tests per app (2 preserved smoke + 2 new component suites contributing 6 tests → 8 total per app).
- jsdom proof: a component test asserts `typeof window === 'object'` / `typeof document === 'object'`; Node proof: the moved route/markup tests run green under `@jest-environment node`. Both environments coexist under one per-app `next/jest` config (no second runner).

## E. Shared package and app proof

- **`@embroidery/frontend-testing` API:** `renderWithProviders` (fresh `QueryClient` per call unless supplied), `createTestQueryClient` (`retry:false`, `gcTime:0`, `staleTime:0`), `createUser` (`user-event`), `createNavigationMock` (narrow `next/navigation` router/pathname/searchParams with per-mock spies), re-exported `screen/waitFor/within/fireEvent`. Package self-tests (10) prove: render inside provider + query resolution, fresh client per call, **no cache leakage** between clients, stable router + independent spies, user interaction, no network.
- **App component proof (each app):** jsdom render; user interaction increments state; `next/link` (accessible `href`) and `next/image` (accessible `img`) render; mocked `next/navigation` router `.back()` invoked; TanStack Query provider drives loading→resolved; the **public** `@embroidery/api-client` `healthReadiness` runs through the real `apiRequest` mutator against a mocked Axios instance (called with `/api/health/readiness`, `GET`); no live network. SCSS side-effect import (`sample-widget.scss`) handled by `next/jest` with no manual mapper.
- This closes the C02 follow-up: both apps import and exercise the public generated client at their boundary.

## F. Production and Linux boundary evidence

- **Windows `next build`:** admin PASS, storefront PASS (`output: 'standalone'`). `tools/check-frontend-build-boundary.mjs` → clean, **2238** built files scanned, no test code. Verified `@embroidery/frontend-testing` is **not** traced into `.next/standalone/**/node_modules` (only the copied `package.json` manifest lists its devDependency name — exempted as metadata, not code).
- **Test-only package placement:** `@embroidery/frontend-testing` is a `devDependency` of both apps (never a runtime dependency); no production `src/**` imports it — enforced by `tools/check-frontend-test-boundaries.mjs`.
- **Linux/container equivalence** (`node:22-bookworm`, Node 22.23.1, pnpm 11.5.2, isolated copy, fresh `pnpm install`): frontend-testing **10** tests, admin **8**, storefront **8**; admin build PASS; storefront build PASS; static boundary clean; build boundary clean (**2240** files). All green (`set -e`). Temp copy deleted after the run.

## G. Validation matrix

| Command | Exit | Suites / tests / result |
|---|---:|---|
| `pnpm --filter @embroidery/frontend-testing typecheck` / `lint` / `test` | 0 | 4 suites / **10** |
| `pnpm --filter @embroidery/frontend-testing test:coverage` | 0 | 100 % (statements/branch/funcs/lines) |
| `pnpm --filter @embroidery/admin typecheck` / `lint` / `test` | 0 | 4 suites / **8** (was 2 / 2) |
| `pnpm --filter @embroidery/admin test:coverage` / `build` | 0 | 100 %; `next build` standalone OK |
| `pnpm --filter @embroidery/storefront typecheck` / `lint` / `test` | 0 | 4 suites / **8** (was 2 / 2) |
| `pnpm --filter @embroidery/storefront test:coverage` / `build` | 0 | 100 %; `next build` standalone OK |
| `node tools/check-frontend-test-boundaries.mjs` | 0 | clean |
| `node tools/check-frontend-build-boundary.mjs` | 0 | clean, 2238 files (Win) / 2240 (Linux) |
| `pnpm check:openapi` / `check:api-client` | 0 | artifact byte-identical; tree hash `3ca2b2e…` unchanged |
| `node tools/check-file-size.mjs` / `git diff --check` | 0 | clean |
| Linux container: FT/admin/storefront tests + both builds + boundaries | 0 | all green |
| `pnpm quality` (PostgreSQL up) | 0 | full chain green (api tests, styles, frontend-boundaries, db-manifest 78 tables) |

## H. Deviations / follow-ups

- **D-1 (transform of the shared package):** `next/jest` requires an app/pages directory, so it cannot run inside the framework-agnostic `@embroidery/frontend-testing` package. Because that package imports **no** Next assets (no SCSS/`next/image`/`next/font`), its own unit tests use ts-jest + jsdom. The locked `next/jest` transform still governs the apps' component tests (where Next asset handling is required). Non-blocking.
- **D-2 (build-boundary in quality):** `check:frontend-build-boundary` needs a prior `next build`, which the default `quality` chain does not run for apps; it is a separate root script for post-build/CI use. The static `check:frontend-boundaries` is wired into `quality`. Non-blocking.
- **F-1 (informational):** pre-existing backend `apps/api/src/tests/**` (DB8/9/10 benchmark/durability suites) remain out of scope.

## I. Acceptance matrix

| Gate group | Evidence | Result |
|---|---|---|
| Decision chain verified; exact versions installed; Jest sole runner | §A, §B, §C | PASS |
| next/jest both apps; jsdom default; Node for server-only tests | §B, §D | PASS |
| Smoke tests preserved and moved out of `src`; no new support under `src` | §D, §F | PASS |
| Shared package created; ownership correct; no IMP-D018 issue (JIT source, symlinked) | §B, §E | PASS |
| Fresh QueryClient per test; no cache leak; interaction; App Router mock; link/image; SCSS | §E | PASS |
| Public generated api-client import + mock; no live network; no MSW/2nd runner/browser | §E | PASS |
| Coverage v8 works; no invented threshold | §G | PASS |
| Admin/storefront/package typecheck+lint+test+build PASS | §G | PASS |
| Production `.next` excludes test code; test package dev-only | §F | PASS |
| Linux/container test + build PASS | §F | PASS |
| OpenAPI + generated client unchanged; full quality PASS | §G | PASS |

## J. Scope confirmation

No feature UI, no browser E2E, no visual regression, no API/worker/database/Nginx change, no schema/migration, no generated-client or OpenAPI change, no auth. APP0-DEC-E2E not started.

## K. Evidence closure

- Implementation commit `711b9ea522f07dd611d8846dddf6f187cda93657` (frozen; boundary gates + tree-clean re-confirmed after commit).
- Evidence commit subject: `docs(app0): record APP0-T02A completion evidence`.
- Working tree before the evidence commit: clean except the staged phase doc + traceability note and the untracked report.
- Push status: **NOT PUSHED**.
- Verdict: **`PASS`**.
