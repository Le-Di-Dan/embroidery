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

## 6. Design acceptance

Design packages use visual/system review rather than coding checkpoints. See `03-DESIGN-DELIVERY-POLICY.md`.

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

## 9. Evidence language

Allowed:

- `PASS — command and result recorded`.
- `FAIL — defect recorded`.
- `N/A — reason recorded`.

Avoid vague claims such as “looks good,” “mostly done,” or “should work.”
