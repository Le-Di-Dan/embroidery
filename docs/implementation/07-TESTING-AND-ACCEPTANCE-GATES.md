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
