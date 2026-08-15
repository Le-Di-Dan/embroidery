# APP4-E01-H01 — Runtime Harness Foundation · Completion report

## A. Verdict

```text
APP4-E01-H01 = PASS
APP4-E01-H02 = READY — NOT STARTED
APP4-X01     = NOT READY
```

The E01 runtime foundation exists and is proven by one focused smoke run:
`APP4_E01_HARNESS_READY`, 13 proofs, against the real API HTTP process, a real
disposable PostgreSQL, the real API application context and the real
`WorkerModule` context with polling held closed.

**No APP4 acceptance proof E01-01..E01-18 was executed.**
**No full regression/test chain was run.**

No APP4 fixture was seeded, no challenge or grant was issued, no job was
executed, and no browser was opened.

---

## B. Entry / E01 replan

Entered as an E01 replan sub-checkpoint, not a correction:

```text
APP4-A01 = PASS_AFTER_C1
APP4-E01 = NOT COMPLETE   (correction count = 0)
APP4-X01 = NOT READY
```

The accepted findings from the first E01 attempt were reused, not reopened or
re-proved: the repaired API topology, the closed `FU-APP4-DEV-API-IMAGE-01`, the
two Dockerfile visibility fixes, and the feasibility of an in-process worker
context with polling held.

---

## C. Reused environment repair

Unchanged and relied upon. `api.Dockerfile` and `worker.Dockerfile` keep the
`@embroidery/notification-delivery` visibility fix from the previous checkpoint;
neither was edited here. The development stack stayed healthy throughout
(`embroidery-dev-api-1 … (healthy)`), and no Docker image was rebuilt: current
source already executes.

H01 does not run against the development stack. It provisions its own
run-namespaced topology and drops it again, so nothing it does can disturb the
repaired development environment.

---

## D. Orchestrator APP4 mode

Added to the established entry point, `packages/e2e-testing/scripts/run-e2e.mjs`,
following its existing flag convention (`--smoke`, `--full`, `--app1`):

```text
node scripts/run-e2e.mjs --app4     (pnpm --filter @embroidery/e2e-testing e2e:app4)
```

`--app4` is deliberately **not** a Playwright mode. It short-circuits in `main`
before any project/runner machinery, starts its own lean topology, runs the H01
smoke as a plain Node child, and tears the topology down in `finally`.

The existing modes are untouched: `parseArgs` gains one flag and one `mode`
branch, and every existing return value (`projects`, `runner`, `extraArgs`,
`app1`) keeps its previous meaning. `smoke`, `full` and `app1` resolve exactly as
before.

**Why lean.** `startApp4Environment` starts PostgreSQL, MinIO and the API HTTP
process — and not the two Next apps or the Nginx gateway. H01 is forbidden from
opening a browser, so the browser tier would contribute most of the startup cost
and none of the evidence. MinIO is still required, because the API verifies its
private buckets before it listens (APP2-I03); without it the run would fail at
API start with a message about buckets rather than about the thing under test.
`APP4-E01-H02` adds the browser tier, and should do so by extending the canonical
`startEnvironment` rather than growing the lean file.

Every piece is reused, not reimplemented: the same Compose project and file, the
same `CleanupStack`, the same canonical disposable-database harness, the same
`createApiService` lifecycle handle, the same port/health waiters.

---

## E. Ephemeral config

`createApp4SecretConfig(runId)` sits beside the existing `createAdminCredentials`
in `support/orchestration/config.mjs` — the established precedent for per-run
in-memory credentials — and generates, per run, via `node:crypto`:

| Key | Shape asserted | Never |
| --- | --- | --- |
| `VERIFICATION_CODE_SECRET_PEPPER` | ≥ 32 characters | committed, printed, defaulted |
| `SECURE_LINK_TOKEN_SECRET_PEPPER` | ≥ 32 characters | committed, printed, defaulted |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | decodes to **exactly 32 bytes** | committed, printed, defaulted |
| `STOREFRONT_PUBLIC_ORIGIN` | not secret; an RFC 6761 `.invalid` host | a registrable domain |

The three secret values are generated **independently**, not derived from one
seed, because `loadApp4SecretPepperConfig` rejects a pair that reuses another's
value — a shared seed would be a startup failure, not a convenience.

One value that is **not** APP4 material is carried with them and the report is
explicit about why: `DESIGN_SESSION_SECRET_PEPPER`. `APP3-B07` composed the
Design module into `AppModule`, and anonymous Design Session secrets are verified
with a peppered HMAC that has no unpeppered fallback — so the *real* API graph
cannot be constructed without one, in-process or as an HTTP process. It is
generated per run for the same reason as the values beside it.

This surfaced a genuine pre-existing gap, recorded rather than repaired: the
existing `api-service.mjs` supplied **none** of these four variables, so the E2E
API host process could not have booted against current source in any mode. H01
fixes it for its own mode through one additive `extraEnv` seam on
`createApiService`; the existing modes' env is otherwise byte-identical.

Nothing was written to `.env`, no `.env.example` was touched, no secret was
passed as a command-line argument (process environment only), and no secret
appears in this report.

---

## F. API in-process context

`bootApiContext` composes the API's **real `AppModule`** from
`apps/api/dist/bootstrap/app.module.js` and resolves the real
`SecureGrantIssuer` from it.

`AppModule` rather than a hand-picked module subset, deliberately: the later E01
proof that `B05 → B01` writes a real `recipient_contact_point_id` is only
meaningful if the issuer is the one the production graph builds, with the
production `NotificationModule` behind it. A graph assembled by the test would be
proving the test's wiring.

- no production debug endpoint was added;
- no alternate or mocked `SecureGrantIssuer`;
- the context never listens — it is a provider graph, not a second API;
- it fails closed if required APP4 configuration is missing (demonstrated: the
  first smoke attempt refused on the missing Design pepper rather than booting a
  half-configured graph).

Smoke evidence: `real SecureGrantIssuer resolves from the API graph`
(asserted on the resolved instance's constructor, not on a token guess).

---

## G. Worker in-process context

The previous checkpoint's throwaway probe is promoted into committed tooling,
using the exact `APP4-W01` precedent — no second gate, no new mechanism:

- boots the real `WorkerModule` from `apps/worker/dist/bootstrap/worker.module.js`;
- overrides `WORKER_STARTUP_GATE` closed (`errorClass: 'E01_HELD'`), so the poll
  loop claims nothing;
- overrides `WORKER_PROCESS`, so a fatal path cannot `process.exit` and take the
  runner with it;
- resolves the real `JobExecutionService` and the real
  `RecordingNotificationChannelAdapter`.

The runtime logs the gate decision itself during the run —
`Worker startup gate closed (E01_HELD); the worker will claim no job` — which is
the runtime's own statement that it is holding, not a test assertion about it.

Only the handles later checkpoints need are exposed
(`jobExecutionService`, `recordingAdapter`, `close()`); no repository or
provider was added pre-emptively. The recording adapter remains process-memory
only: no HTTP surface, no file, no database sink, no debug endpoint.

---

## H. Disposable DB / universe proof

One universe, proven rather than assumed. The smoke does **not** compare
`DATABASE_URL` strings — that would only prove both contexts were handed the same
configuration. Each context is asked, over its own live pool via its own
`DATABASE_CONNECTION`, which database it is actually connected to:

```text
both contexts are connected to the same database
(embroidery_db7_e2e_app4_25932af300a_25932)
```

That database is the one the canonical DB7/T01 harness provisioned and the one
the API HTTP process was started with, and it passed the frozen DB6
schema-baseline verification before the API started. The existing
persistent-database refusal guard still applies. No new database abstraction was
created, and no full credential was printed — the orchestrator's existing
`redactUrl` covers the one place a URL is logged.

No APP4 fixture was seeded: the database carries migrations only.

---

## I. H01 smoke result

Command:

```text
node scripts/run-e2e.mjs --app4
```

Result — 13 proofs, in order:

```text
ok — envelope key decodes to exactly 32 bytes
ok — both peppers clear the 32-character minimum
ok — the two peppers and the envelope key are three distinct values
ok — API HTTP health responds 200 (200)
ok — disposable database is migrated and bound
ok — API application context booted
ok — real SecureGrantIssuer resolves from the API graph
ok — worker context booted
ok — real JobExecutionService resolves
ok — real RecordingNotificationChannelAdapter resolves
ok — recording adapter starts empty
ok — both contexts are connected to the same database (…)
ok — no secret is exposed through the safe descriptor
APP4_E01_HARNESS_READY
ok — cleanup closed both contexts
ok — leak guard: secretPresent = false (13 proofs)
```

Teardown was verified independently after the run: no `emb-e2e-*` container
remained, and the development stack was still healthy.

Two smoke attempts were used, the maximum §19 allows. Attempt 1 failed in H01
tooling — the real `AppModule` refused to construct without the APP3 Design
pepper — which is the harness gap described in §E, not application behaviour.
Attempt 2 passed. No third attempt, and no rerun for reassurance.

---

## J. Secret-leak proof

Two independent guards, both boolean-only:

1. **Descriptor guard** — the returned `safeMetadata` (`runId`, `databaseName`,
   `apiBaseUrl`, `storefrontOrigin`, `ownsDatabase`) is serialised and checked to
   contain none of the three generated secret values.
2. **Transcript guard** — every line the smoke prints is captured and scanned for
   the three values before exit.

Both compare in memory and report `secretPresent = false`. Neither prints a
secret to demonstrate its absence, and the failure message would report a
**count**, never an operand. No snapshot contains env, and there is no
`console.log(process.env)` anywhere in the harness.

The unit tests follow the same rule: the one equality assertion over secret
material compares with `===` and asserts the resulting boolean, so a failure
cannot print either operand.

---

## K. Validation ledger

Change-impact only:

| Validation | Command | Result |
| --- | --- | --- |
| H01 helper unit test | `jest support/app4` | 6 passed |
| H01 smoke proof | `node scripts/run-e2e.mjs --app4` | PASS (13 proofs) |
| Scoped ESLint | `eslint support/app4 support/orchestration/{config,api-service}.mjs scripts/run-e2e.mjs` | clean |
| Scoped Prettier | `prettier --write` then `--check` on the same files | clean |
| Report secrets | `node tools/check-report-secrets.mjs` | passed |
| Staged whitespace | `git diff --cached --check` | clean |

The unit test was re-run after Prettier reformatted its file, so the recorded
result is the committed state. The smoke was not re-run for formatting-only
changes.

Not run, per §18: the E01 18-item acceptance, full E2E, Playwright, API/worker/
Storefront/Admin Jest, B01–B08 suites, W01 suite, OpenAPI or client generation,
DB regression, Figma, SonarQube, `pnpm quality`, or any repo-wide check. No
Docker image was rebuilt.

---

## L. Wall-clock

```text
H01 start   2026-08-15T12:14:21Z
H01 stop    2026-08-15T12:27:01Z
elapsed     ~13 minutes  (target 35 / hard stop 50)
```

Inside target. The 50-minute stop was not reached.

---

## M. Files changed

```text
A packages/e2e-testing/support/app4/app4-runtime.mjs            (runtime foundation)
A packages/e2e-testing/support/app4/app4-environment.mjs        (lean APP4 topology)
A packages/e2e-testing/support/app4/app4-runtime.smoke.mjs      (H01 smoke proof)
A packages/e2e-testing/support/app4/app4-secret-config.test.mjs (secret-builder unit tests)
M packages/e2e-testing/support/orchestration/config.mjs         (+ ephemeral APP4 config builders)
M packages/e2e-testing/support/orchestration/api-service.mjs    (+ additive extraEnv seam)
M packages/e2e-testing/scripts/run-e2e.mjs                      (+ --app4 mode)
M packages/e2e-testing/package.json                             (+ e2e:app4 script)
A docs/implementation/reports/APP4-E01-H01-COMPLETION-REPORT.md
```

Test and tooling only. **No** application source, schema, migration, OpenAPI
document, generated client or Figma artifact was modified; no APP4 product
semantics changed; no production endpoint was added. The accepted Dockerfile fix
was not touched. `STOP — E01_H01_RUNTIME_DEPENDENCY_DEFECT` was not reached: no
application source had to change for either context to exist.

No browser helper, page object, selector or fragment instrumentation was created
(§15), and no fixture-universe code was written (§16).

## N. Git evidence

Two commits, not pushed, not amended, not squashed:

```text
test(app4): add E01 runtime harness foundation
docs(app4): record E01 harness foundation evidence
```

## O. Next sub-checkpoint

```text
APP4-E01-H02 = READY — NOT STARTED    (fixture + browser evidence helpers)
APP4-E01-R01 = blocked on H02
APP4-X01     = NOT READY
```

H02 was not started. Two notes it inherits: the browser tier should come from
extending the canonical `startEnvironment` rather than the lean APP4 owner, and
the APP4/Design configuration seam added here is the one place the browser tier
will need to reuse so every participant stays on one universe.
