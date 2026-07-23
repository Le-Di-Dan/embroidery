# APP0-DEC-COMPONENT-TEST — Frontend Component-Test Stack Decision — Completion Report

**Checkpoint:** APP0-DEC-COMPONENT-TEST · **Branch:** `production` · **Verdict:** `PASS`
**Decision commit (A):** `ce9c8d834fa1f25f12df29e5f684bd3ac07bcb01` — `docs(app0): select frontend component-test stack`
**Decision:** IMP-D024 (resolves IMP-O005(a)); runner Jest not reopened (IMP-D016).

---

## A. Preflight and T01-C1 revalidation

- Initial HEAD `c2cc4d0` (`docs(app0): record APP0-T01-C1 correction evidence`); working tree clean at start.
- T01 chain: impl `7bc3793a6826b50c7c4eed11b2e81ed079fdffc2`, evidence `c062b74bf46647506b3d175d2ca0de77c5d39af5`.
- T01-C1 chain: impl `2f7f274f6e4a6b02af414c2e2e6562dc6f9ba1e7`, evidence `c2cc4d0ae62e59d7c6461c33be403e80ab83d63c` (read from `git log`).

| Revalidation command | Exit | Result |
|---|---:|---|
| `git status --short` (start) | 0 | clean |
| `git show --stat 2f7f274` / `diff-tree --name-only` | 0 | 4 renames `src/tests/{support,integration}` → `test/{support,integration}` + jest/tsconfig/build/docs/tool |
| `pnpm --filter @embroidery/api build` | 0 | `nest build` ok |
| `node tools/check-api-dist-boundary.mjs` | 0 | clean: 257 built files, no test code |
| `pnpm --filter @embroidery/api test` | 0 | 779 tests pass |
| `pnpm check:openapi` | 0 | artifact byte-identical |
| `pnpm check:api-client` | 0 | tree hash `3ca2b2e…` unchanged |

Verified: no T01 support/spec under `apps/api/src/**` (all under `apps/api/test/**`); dist boundary passes; the direct `verifySchemaBaseline` proof is present; the correction evidence commit exists; working tree clean after revalidation.

**`T01_C1_REVALIDATION = PASS`.**

## B. Existing frontend test audit

- Actual versions (both apps): `next 16.2.10`, `react`/`react-dom 19.2.7`, `typescript 5.9.3`, `jest 30.4.2`, `ts-jest 29.4.11`, `sass 1.83.0`, `@tanstack/react-query 5.101.2`, `axios 1.18.1`, `zustand 5.0.14`. No RTL/jsdom/user-event/jest-dom installed yet.
- Existing config: per-app `jest.config.mjs` with `testEnvironment: 'node'`, ts-jest transform, `roots: ['<rootDir>/src']`. Two tests per app under `apps/<app>/src/tests/smoke/`: a route-handler test and a `renderToStaticMarkup` server-markup test (no DOM).
- **Jest authority:** IMP-D016 locks Jest as the **sole** unit/integration runner across `apps/*`/`packages/*`; IMP-O005 states it "is not reopened". Runner selection is therefore **closed** — this checkpoint locks the DOM/rendering/transform stack *around* Jest, not a new runner.

## C. Candidate matrix

| # | Stack | Runner vs IMP-D016 | App Router fit | Browser binary | Verdict |
|---|---|---|---|---|---|
| A | **Jest + `next/jest` + jsdom + RTL + user-event + jest-dom** | Jest (compliant) | Official Next path; SWC transform; auto-mocks css/scss/image/font; `.env`/`next.config` loaded | none | **SELECTED** |
| A′ | Jest + **ts-jest** + jsdom + RTL (transform alternative) | Jest (compliant) | Manual scss mapper, manual tsconfig, no `next/font`/image/`.env`; ~2× slower | none | rejected transform |
| B | Vitest + RTL + jsdom | **second runner** (needs ADR to override IMP-D016) | separate Vite/Sass config; capable | none | rejected |
| C | Playwright Component Testing | second runner | experimental; belongs to E2E tier | **requires browsers** | rejected → APP0-DEC-E2E |

## D. Spike evidence

Spikes ran in an isolated OS-temp workspace (`…/scratchpad/ct-spike`, deleted before Commit A — repo tree confirmed clean) with faithfully pinned versions matching the apps (`next 16.2.10`, `react 19.2.7`), on Windows (`win32`, Node `v22.14.0`). Components exercised: client counter (state), `next/link`, `next/image`, `next/navigation` `useRouter`, a context provider, a TanStack Query component, an SCSS side-effect import, and an Orval-style generated operation function.

| Stack | Key versions | Cases | Exit | Runtime | Coverage | Deterministic | Notes |
|---|---|---:|---:|---|---|---|---|
| **A** `next/jest` | jest 30.4.2 · env-jsdom 30.4.1 · RTL 16.3.2 · dom 10.4.1 · user-event 14.6.1 · jest-dom 7.0.0 | 6 suites covering cases 1–9 + strict-TS + coverage + 2-run + Windows | 0 | 1.07–1.24 s | 100 % (v8) | yes (two runs identical) | zero manual style/image/font mapping; SWC; strict `tsc --noEmit` (incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) exit 0 |
| A′ ts-jest | + ts-jest 29.4.11 + identity-obj-proxy | same 6 | 0 | 2.42 s | — | — | required manual `moduleNameMapper` for scss, manual tsconfig transform, no `next/font`/image/`.env` handling |
| **B** Vitest | vitest 4.1.10 · @vitejs/plugin-react 5 · jsdom 26 · sass | 1 (render+interaction) | 0 | 0.95 s | (v8 avail) | — | passed only after adding Vite config + `@vitejs/plugin-react` + explicit `sass` + `jest-dom/vitest`; a 2nd runner |
| C Playwright CT | — | not spiked | — | — | — | — | documented rejection: browser binaries + experimental + 2nd runner |

Cases mapped: 1 render · 2 interaction · 3 SCSS side-effect · 4 `next/link` · 5 `next/image` · 6 `next/navigation` mock · 7 provider/context · 8 TanStack Query · 9 mocked generated api-client fn · 10 strict TS · 11 coverage · 12 determinism · 13 Windows (native) · 14 Linux/CI (no native binary → portable).

## E. Decision

**Selected:** Jest + `next/jest` + `jsdom` + React Testing Library (`@testing-library/react 16.3.2` + peer `@testing-library/dom 10.4.1`) + `@testing-library/user-event 14.6.1` + `@testing-library/jest-dom 7.0.0`; DOM env `jest-environment-jsdom 30.4.1`; all MIT.

Top reasons: (1) keeps the single locked runner (IMP-D016) — no runner fragmentation; (2) `next/jest` is the official Next 16 integration and auto-handles SCSS/image/`next/font`/`.env`/aliases that ts-jest needs configured by hand; (3) SWC transform is ~2× faster than ts-jest and deterministic; (4) proven against the real Next 16.2 / React 19.2 versions with strict TS, 100 % v8 coverage, and Windows execution.

**Rejected finalists:** ts-jest transform (more config, slower, no App Router asset handling); Vitest (capable but a second runner requiring an ADR to override IMP-D016, with no compelling advantage); Playwright CT (browser binaries + experimental; reserved for APP0-DEC-E2E).

## F. APP0-T02A handoff

- **Dependencies** (dev, both apps, caret ranges): `@testing-library/react ^16.3.2`, `@testing-library/dom ^10.4.1`, `@testing-library/user-event ^14.6.1`, `@testing-library/jest-dom ^7.0.0`, `jest-environment-jsdom ^30.4.1`. `next/jest` ships with the installed `next`; no `ts-node` (config is `.mjs`).
- **Config paths:** per-app `apps/<app>/jest.config.mjs` importing `next/jest.js` (`createJestConfig`, `testEnvironment: 'jsdom'`, `coverageProvider: 'v8'`, `setupFilesAfterEnv`); per-app app-root `apps/<app>/jest.setup.ts` (`import '@testing-library/jest-dom'`). Migrate the two existing smoke tests onto this config (they must stay green under jsdom).
- **Shared support:** new package `@embroidery/frontend-testing` (`packages/frontend-testing`) — render helper, `QueryClient` wrapper, `next/navigation` + `next/image` mocks. `@embroidery/test-utils` stays backend-neutral (no React).
- **Test placement:** colocated `*.test.tsx` or feature `tests/` folders (REPOSITORY_STRUCTURE §5/§6); no test-support under `src`; prove `.next` (production `next build`) excludes test code.
- **RSC policy:** synchronous Server/Client components in-harness; async Server Components via E2E (not jsdom).
- **Network:** inject a mocked Axios instance into the `apiRequest` mutator and/or `jest.mock` the generated operation/feature service; no MSW.
- **Snapshots:** not primary. **Coverage:** v8 from `src`, excluding generated/vendor/test-support; no threshold in APP0.
- **Commands:** per-app `test` / `test:watch` / `test:coverage`; component tests run inside root `quality` → `pnpm test` (Turbo). T02A implements only the foundation + one representative test.

## G. Deviations / follow-ups

- **F-1 (informational):** the two existing frontend smoke tests move from `testEnvironment: 'node'`/ts-jest to `next/jest`/jsdom at T02A; behaviour is preserved. Non-blocking.
- **F-2 (informational):** `@embroidery/frontend-testing` is created by T02A (concrete reuse across two apps), not in this decision checkpoint. Non-blocking.
- **F-3 (freshness):** versions/licenses were read from the live npm registry and the Next 16 Jest guide (lastUpdated 2026-02-11); no freshness gap.

## H. Acceptance matrix

| Gate group | Evidence | Result |
|---|---|---|
| T01-C1 evidence chain revalidated | §A | PASS |
| Frontend versions/config audited; Jest authority resolved | §B | PASS |
| ≥3 candidates reviewed; ≥2 finalists spiked | §C, §D | PASS |
| Official sources; exact versions/licenses/freshness | §D, §E, §F | PASS |
| Strict TS, client interaction, App Router mocks, SCSS, TanStack Query, generated-client mock, determinism, Windows | §D | PASS |
| Hard gates 1–18 satisfied by Stack A | §C, §D, §E | PASS |
| Server-component / network / snapshot / coverage policies locked | §E, §F | PASS |
| Config/test/support paths + T02A handoff locked | §F | PASS |
| Decision register updated; no source/dependency/lockfile change | §I | PASS |
| No spike output committed; Commit A docs-only | §D, §I | PASS |

## I. Commit A changed files

`ce9c8d834fa1f25f12df29e5f684bd3ac07bcb01` — 4 files, docs-only:

- `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` (IMP-D024 added; IMP-O005(a) resolved)
- `docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md` (§3.1 frontend component-test stack)
- `docs/development/FRONTEND_CONVENTIONS.md` (§18 pointer)
- `docs/architecture/REPOSITORY_STRUCTURE.md` (`packages/frontend-testing`; test-utils no-React note)

No `package.json` / `pnpm-lock.yaml` / `turbo.json` / `apps/**` / `packages/**` / `tools/**` change.

## J. Evidence closure

- Decision Commit A `ce9c8d834fa1f25f12df29e5f684bd3ac07bcb01` (frozen; not amended after this report).
- Evidence Commit B subject: `docs(app0): record component-test decision evidence`.
- Working tree before Commit B: clean except the staged phase doc and the untracked report.
- Push status: **NOT PUSHED**.
- Verdict: **`PASS`**. APP0-T02A `READY, NOT STARTED`; APP0-DEC-E2E remains open.
