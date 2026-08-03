# Testing and Acceptance Gates

## 1. Principle

Testing follows the smallest authoritative boundary. Passing tests do not excuse an oversized or unreviewable checkpoint.

## 2. Backend checkpoint gates

Required as applicable:

- Domain or application unit tests.
- Repository integration tests against disposable PostgreSQL.
- HTTP integration tests.
- Transport validation tests.
- Authorization and ownership negative tests.
- Lifecycle/state conflict tests.
- Idempotency tests.
- Audit/outbox tests.
- Safe error-envelope tests.
- Swagger/OpenAPI generation.

Do not use a mocked database to prove persistence, constraints, locking, or transaction behavior.

## 3. Frontend checkpoint gates

Required as applicable:

- Type check.
- Lint/format.
- Pure logic tests.
- Component interaction tests.
- Form validation tests.
- TanStack Query behavior tests.
- Zustand store tests for interaction state.
- Real generated client integration or controlled contract mock at the network boundary.
- Accessibility checks.
- Responsive review evidence.
- No prohibited styling patterns.

A snapshot alone is not sufficient.

### 3.1 Frontend component-test stack (locked)

The component/interaction and accessibility gates above run on the stack locked by `APP0-DEC-COMPONENT-TEST` (IMP-D024): **Jest** (the sole unit/integration runner, IMP-D016) with the **`next/jest`** transformer, the **`jsdom`** environment, **React Testing Library** + **`@testing-library/user-event`**, and **`@testing-library/jest-dom`** matchers. Rules:

- **Runner is not reopened** — no second unit/component runner (Vitest, Playwright CT) without an ADR overriding IMP-D016.
- **Config is per app** (`jest.config.mjs` via `next/jest`, app-root `jest.setup.ts`); shared render helpers, the `QueryClient` factory and `next/navigation` mocks live in `@embroidery/frontend-testing`, not in the backend-neutral `@embroidery/test-utils`.
- **Tests live under `apps/<app>/test/**`** (APP0-T02A convention), never under production `src/**`: `test/components/**` (jsdom), `test/smoke/**` (route-handler/server-only, Node environment via a `@jest-environment node` docblock), `test/fixtures/**` (test-only components), `test/support/**` (app-specific support). The production `next build` (`.next`) must contain no test code, enforced by `tools/check-frontend-test-boundaries.mjs` (static) and `tools/check-frontend-build-boundary.mjs` (post-build).
- **Async Server Components are not rendered in `jsdom`** — assert their composition through the browser E2E harness; component tests cover synchronous Server/Client components, props, state, interaction, accessibility semantics, providers, and loading/error/empty states.
- **No live network** — the generated Axios client is exercised through an injected mocked Axios instance or a mocked operation/feature service (no MSW without evidence).
- **Snapshots are not the primary assertion**; role/label/behaviour queries are.
- Coverage uses the `v8` provider from app `src` (generated/vendor/test-support excluded); no coverage threshold is imposed in APP0.

Detailed tooling versions and the APP0-T02A handoff are in `reports/APP0-DEC-COMPONENT-TEST-COMPLETION-REPORT.md`.

## 4. Worker/integration gates

- Job receives stable IDs rather than mutable object payloads.
- Current authoritative state is reloaded.
- Duplicate delivery is safe.
- Retry is bounded.
- Attempts are recorded.
- Terminal/manual-review behavior exists.
- Provider errors are classified and redacted.
- Outbox/transaction ordering is tested.
- Metrics/log correlation is present.

## 5. End-to-end gates

Each phase defines one or more critical journeys. E2E uses real application services and a disposable test environment; external providers may use faithful sandbox/fake adapters at the provider boundary.

E2E evidence must include:

- Starting state/fixtures.
- Actor and permissions.
- Steps.
- Expected state transitions.
- Database and UI outcome.
- Negative/retry case where critical.

### 5.1 Browser E2E stack (locked)

Browser E2E runs on the stack locked by `APP0-DEC-E2E` (IMP-D025): **Playwright Test** (`@playwright/test`, pinned `1.61.1`, Apache-2.0). This is a **separate tier** from the unit/component runner — Jest (IMP-D016) is not reopened; Playwright drives real browsers only. Rules:

- **Ownership** — a dedicated private workspace package `@embroidery/e2e-testing` (`packages/e2e-testing/`) owns `playwright.config.ts`, `specs/**`, and `support/**` (fixtures, orchestration, disposable-DB adapter). No E2E code lives under any app `src/`. `@playwright/test` and browsers are devDependencies of that package only.
- **Browser matrix (tiered)** — local smoke: Chromium; CI-required (per PR): Chromium (admin + storefront projects); CI full/scheduled: Chromium + Firefox + WebKit. No mobile emulation in APP0-T02B; WebKit is a Safari **approximation**, not real iOS Safari.
- **Startup** — one canonical orchestrator (Playwright `globalSetup` + repo/package script; `webServer` may own the two Next apps in production `next start` mode) composes the real Nginx gateway + admin + storefront + API + a **disposable** PostgreSQL provisioned through the canonical T01/DB7 harness (never the persistent dev database), readiness-gated with full teardown; no per-spec process starting.
- **Data** — disposable DB with a unique per-run name and the persistent-DB refusal guard; seed only via approved API / fixture-seed adapter / canonical repository helper; no raw ad-hoc business SQL in specs; cleanup on success and failure.
- **Auth (future-compatible)** — APP0-T02B tests public routes only; later, deterministic test users via Playwright `storageState` / API session setup, role isolation, secrets from env/CI store, no committed tokens.
- **Network** — real app HTTP + real owned API by default; route interception only for non-owned/third-party/failure-simulation; no live payment/shipping calls; no credentials in traces/reports.
- **Locators/flake** — `getByRole`/`getByLabel`/visible text, `data-testid` last; no arbitrary sleeps (auto-waiting); retries only in CI and bounded, trace on retry/failure; test independence.
- **Artifacts** — screenshot only-on-failure, trace retain-on-failure/on-first-retry, HTML report + `test-results/`, all gitignored and never committed; visual regression is a **separate** concern (no broad screenshot baselines in T02B).
- **Accessibility** — semantic-locator policy plus optional keyboard/focus smoke; a targeted `@axe-core/playwright` scan is deferred to T02B (version locked only after official-source review); no full-WCAG claim.
- **CI/quality tier** — E2E is **not** part of the browser-free scoped validation a change ordinarily runs; it runs in its own CI job with browser-install caching and per-project sharding. The commands (T02B) are owned by `@embroidery/e2e-testing` and invoked directly — `pnpm --filter @embroidery/e2e-testing e2e` / `e2e:headed` / `e2e:debug` / `e2e:report` / `e2e:install` / `e2e:smoke` / `e2e:full` / `check:e2e` (`SCOPED_COMMAND_INDEX.md` `CMD-E2E-*`).

The full APP0-T02B handoff and spike evidence are in `reports/APP0-DEC-E2E-COMPLETION-REPORT.md`.

### 5.2 Research benchmark tier (spikes)

Feasibility spikes under `spikes/*` may run their own browser tier for
measurement. It is a **research** tier, not a product gate:

- it reuses the locked Playwright version and the pinned
  `mcr.microsoft.com/playwright:v1.61.1-noble` image, so the repository has one
  browser toolchain;
- it never joins the browser-free tier or the browser tier — only the spike's
  static isolation gate (`node tools/check-spike-boundaries.mjs`) runs there, and
  only when the change touches the spike boundary;
- its orchestrator owns every process it starts and tears down in `finally`;
- results are committed as small JSON evidence with no machine path, secret or
  external URL, and every number is reported with its environment.

APP0-R01 (`pnpm --filter @embroidery-spike/design-studio spike:bench`, `pnpm --filter @embroidery-spike/design-studio spike:bench --container`) is
the reference implementation, and its S/M/L scenes are the Design Studio
performance-regression scenes handed to APP3 (IMP-D026).

### 5.3 Tier boundaries and known limits (locked at APP0 closure)

> **Superseded in part by `GOV-Q01` (2026-08-04) —
> [`VALIDATION_GOVERNANCE.md`](./VALIDATION_GOVERNANCE.md).** The
> `pnpm quality` aggregate **no longer exists**. Its premise — one browser-free
> chain cheap enough to be the per-change gate — stopped holding once every
> checkpoint appended its own gate to it. The tier *boundaries* below remain
> correct and are still authority; read every "`pnpm quality`" in this section as
> "the browser-free scoped validations a change justifies". Only Prettier,
> ESLint and SonarQube are global controls.
>
> **`GOV-Q01-C1` then removed the remaining 71 root aliases**, so
> `pnpm quality:e2e`, `pnpm check:*`, `pnpm test:*`, `pnpm e2e*`,
> `pnpm spike:*`, `pnpm smoke:*` and `pnpm bench:*` no longer exist as root
> commands. Every one of them is still runnable from its owner — see
> [`SCOPED_COMMAND_INDEX.md`](./SCOPED_COMMAND_INDEX.md).

- **The browser-free tier** is format, lint, typecheck, the Jest tiers, and the
  static boundary/artifact gates. It launches no browser and runs no benchmark.
  It is selected per change, not run wholesale.
- **The browser tier is `check:e2e` + the full Playwright matrix**, now run as
  two owner commands (`CMD-CHECK-E2E`, `CMD-E2E-FULL`). A release or CI workflow
  must run it in its own job per §5.1; the browser-free tier is **not** evidence
  that the browser tier passed, and no report may claim E2E coverage without it.
- **Post-build gates belong to the build/CI stage, not to `quality`.**
  `tools/check-frontend-build-boundary.mjs` and
  `node tools/check-spike-boundaries.mjs --build` inspect `.next`/`dist` output
  and therefore require a prior build; wire them after the build step. Their
  static counterparts (`tools/check-frontend-test-boundaries.mjs`,
  `tools/check-spike-boundaries.mjs`) are the browser-free ones, run when the
  change touches their inputs.
- **Browser-tier artifacts must stay out of the formatter.** Playwright writes
  machine-generated JSON into `test-results/`, `playwright-report/` and the
  spike's `bench-results/`; these are git-ignored *and* Prettier-ignored, so a
  formatting check that follows a browser run still passes.
- **Gateway template drift.** The E2E gateway template mirrors production
  routing with only upstream targets parameterized. Whenever production routing
  changes, re-check the E2E template in the same change.
- **Known parity limit.** The E2E API process runs `NODE_ENV=test` (production
  mode rejects the local non-TLS disposable database by design), while both Next
  apps run `NODE_ENV=production`. The tier therefore proves routing, rendering
  and contract behaviour end to end — **not** full production configuration
  parity. Production certification remains APP12's (IMP-D015).

## 6. Design acceptance

Design packages use visual/system review rather than coding checkpoints. See `03-DESIGN-DELIVERY-POLICY.md`.

### 6.1 Figma registry consistency gate (locked at APP1-D01)

```text
FIGMA_INDEX_CONSISTENCY = PASS
```

The canonical Figma registry `docs/design/FIGMA_DESIGN_INDEX.md` is enforced by the
static gate `node tools/check-figma-design-index.mjs`.
It never calls the Figma network. It is scoped validation: run it on any design or
frontend UI checkpoint, and on any change that touches the registry.

For a **design** checkpoint, the gate requires that every created/moved/superseded
frame is reflected in the index, node URLs are exact and valid (file key + node id
match the row, no `t=` tracker/secret), and status/approval are explicit; new
frames are `REVIEW_REQUIRED`.

For a **frontend** checkpoint, the completion report records the exact registry IDs
used; only `APPROVED_FOR_IMPLEMENTATION` nodes may be implemented, and a missing,
stale, superseded, or unapproved design **blocks** coding.

## 7. Phase closure gates

- All checkpoint-specific gates pass.
- Critical E2E passes.
- No mock data in production paths.
- OpenAPI/client are synchronized.
- Relevant design package is approved.
- Security-sensitive negative paths pass.
- Performance is within phase budgets or measured with explicit deferred tuning.
- Documentation and runbooks are current.
- Phase report lists exact deferred work.

## 8. Regression strategy

Maintain layered suites:

- Fast unit/component suite per checkpoint.
- Module integration suite per phase.
- Critical E2E smoke suite per milestone.
- Database correctness/concurrency suites remain preserved.
- Production-candidate regression suite at APP12.

Do not run only the new tests and ignore the required regression subset.

**The required subset is derived, not fixed** (`GOV-Q01`). It is the set of
suites whose owned inputs or invariants the current change touches — see
[`VALIDATION_GOVERNANCE.md`](./VALIDATION_GOVERNANCE.md) §3 and §4. A closed
checkpoint's gate is not part of that subset merely because it exists. A **full**
regression needs one of the explicit triggers in §7 of that document and is a
separate checkpoint or release activity.

## 9. Evidence language

Allowed:

- `PASS — command and result recorded`.
- `FAIL — defect recorded`.
- `N/A — reason recorded`.

Avoid vague claims such as “looks good,” “mostly done,” or “should work.”
