# APP4-E01 — Secure Contact Cross-Layer Acceptance · Completion report

## A. Verdict

```text
APP4-E01 = NOT COMPLETE
STOP — E01_HARNESS_NOT_DELIVERABLE_IN_BUDGET
```

The canonical E01 cross-layer acceptance run **was not executed**. None of the
18 proof items (E01-01 … E01-18) has runtime evidence, so `APP4-E01` cannot be
reported as `PASS` and `APP4-X01` is **not** recommended yet.

This is **not** one of the three runtime stop conditions, and the distinction
matters for the Product Owner's decision:

- it is **not** `BLOCKED_BY_ENVIRONMENT` — the live topology is now healthy, and
  the environment defect E01 inherited was found, fixed and verified (§C);
- it is **not** `FAILED — APP4_E01_INTEGRATION_DEFECT` — no APP4 runtime
  behaviour was observed to violate an acceptance item, because no acceptance
  item was executed;
- it is **not** `BLOCKED_BY_AUTHORITY` — no new cross-layer product or security
  decision is required.

What was reached is a **scope-versus-budget** limit, reported in §T. Two
genuinely complete results are delivered and evidenced below: the environment
repair (§C), and an executable proof that the §6 preferred worker topology is
buildable (§C.3).

**No full regression/test chain was run.** No broad suite, no `pnpm quality`, no
Playwright suite, no checkpoint test suite was executed.

---

## B. Entry and A01-C1 accepted closure

The §4 evidence preflight was performed first and **passes unchanged**. Read
from the canonical reports, not from memory:

| Preflight obligation | Source | Observed |
| --- | --- | --- |
| `APP4-A01 = PASS_AFTER_C1` | `APP4-A01-COMPLETION-REPORT.md:6,501` | confirmed |
| correction count = 1 | `APP4-A01-COMPLETION-REPORT.md:34` | `A01 correction count = 1` |
| `APP4-A01-C1` single/final | `APP4-A01-COMPLETION-REPORT.md:44` | "No `APP4-A01-C2` exists and none is permitted." |
| `FU-APP4-A01-INTENT-BINDING-COVERAGE-01` closed | `APP4-A01-COMPLETION-REPORT.md:477,503` | `CLOSED_BY_APP4_A01_C1` |
| `APP4-A01-C1-COMPLETION-REPORT.md` exists | filesystem | present |
| no `APP4-A01-C2` | filesystem | absent |

The canonical reports are already reconciled, so the §4 documentation-repair
branch was **not** entered and no A01 wording was edited. **A01 was not
reopened, and no C1 test was rerun.**

`FU-APP4-A01-INTENT-BINDING-COVERAGE-01` remains **CLOSED** (acceptance
criterion 58 holds).

---

## C. Live topology / environment repair

### C.1 Health inspection (§5)

One inspection command against the development stack:

```text
admin        running  Up 35 hours (healthy)
api          running  Up 35 hours (UNHEALTHY)
gateway      running  Up 35 hours (healthy)
minio        running  Up 35 hours (healthy)
postgres     running  Up 35 hours (healthy)
storefront   running  Up 8 hours  (healthy)
worker       running  Up 35 hours
```

The API was `unhealthy` — the carried `FU-APP4-DEV-API-IMAGE-01`, unresolved
since S01/S02/A01. Its log showed 9 TypeScript errors, all one family:

```text
TS2307: Cannot find module '@embroidery/notification-delivery'   (×3)
TS2305: '@embroidery/database' has no exported member 'loadApp4PolicyDataset'
TS2322: '"NOTIFICATION_INTENT"' is not assignable to OutboxAggregateKind
```

### C.2 Root cause and the narrow §5.2 fix

The failure was **exactly** the §5.2 case: Docker did not make a workspace
package that current production source requires visible to the build.

`api.Dockerfile` and `worker.Dockerfile` both enumerate workspace
`package.json` files in their `deps` / `prod-deps` stages, and **neither listed
`packages/notification-delivery`** — the package `APP4-B01` introduced. Because
that copy governs which directories exist when `pnpm install --frozen-lockfile`
runs, the package was never an *importer* of the install, so pnpm never created
its `node_modules` symlink. The later `COPY . .` brought the sources in without
ever linking them, and the stale image additionally carried pre-APP4 `dist`
output for `@embroidery/database` and `@embroidery/persistence` — which is why
`loadApp4PolicyDataset` and the `NOTIFICATION_INTENT` aggregate kind appeared
absent.

The fix is workspace copy/build visibility only — **no runtime business
semantics, no application behaviour, no APP4 source touched**:

- `infrastructure/docker/api.Dockerfile` — `notification-delivery` added to the
  `deps` and `prod-deps` stages, plus its compiled `dist` to the `runner` stage
  (the API seals every envelope through it). No `node_modules` line: the package
  has no runtime dependency of its own (`node:crypto`), exactly like
  `domain-types`.
- `infrastructure/docker/worker.Dockerfile` — the same three placements (W01
  *opens* the envelope through the same package).

### C.3 Verification — one targeted rebuild

One targeted rebuild of `api` + `worker` (the §5.1 allowance; the whole
repository was **not** rebuilt, Storefront/Admin were **not** rebuilt, and no
second reassurance rebuild was run), then recreate:

```text
api   Up 58 seconds (healthy)
```

The API log now shows a clean boot with the APP4 surface mapped, including:

```text
POST /api/public/verification/challenges/:challengeId/resend
POST /api/public/verification/challenges/:challengeId/attempts
POST /api/public/secure-links/resolve
POST /api/admin/customers/resolve
GET  /api/admin/customers/:customerId/grants
POST /api/admin/secure-grants/:grantId/revoke
GET  /api/admin/notification-intents
POST /api/admin/notification-intents/:intentId/replay
"Nest application successfully started"
```

`FU-APP4-DEV-API-IMAGE-01` is **CLOSED** with executable evidence.

One incident is recorded for honesty: a first recreate attempt was issued as a
raw `docker compose -f …` command, which resolves `.env` from the Compose file's
directory and therefore ignored the repository root `.env` (`POSTGRES_PORT=5434`).
It tried to bind Postgres on `5432`, hit the Windows reserved-port refusal, and
stopped the database container. The stack was restored immediately through the
canonical wrapper `node tools/docker-dev.mjs up -d …`, which is the supported
entry point precisely because it passes `--env-file`. All services returned
healthy; no data-bearing volume was removed and no `.env` value was read,
written or echoed.

### C.4 Topology feasibility — proven, not assumed

§6 prefers a topology in which the **real W01 handler executes through the real
worker runtime seam inside the same process that inspects the recording
adapter**, so the sink stays process-memory only and §13's ban on any debug
endpoint holds. Whether that is even constructible was the one genuine
architectural unknown, so it was settled with a throwaway probe (scratchpad
only, **not committed**, deleted after the run):

```text
[probe] dist modules loaded
[probe] disposable database created + migrated
[probe] Worker startup gate closed (E01_HELD); the worker will claim no job.
[probe] worker context initialised (poll gate closed)
[probe] JobExecutionService=JobExecutionService adapter=RecordingNotificationChannelAdapter
[probe] adapter sink keys: constructor,send,records,program,reset
[probe] SEAM_OK
```

Established facts, each load-bearing for the eventual harness:

1. the real `WorkerModule` compiled output boots in a plain Node test process —
   `emitDecoratorMetadata` is already on for the Nest tsconfig, so Nest DI
   resolves from `dist` with no transform concerns;
2. the startup gate can be held **closed** (`E01_HELD`), so the poll loop claims
   nothing and cannot race the harness — the same technique `APP4-W01`'s own
   context uses;
3. `JobExecutionService` and `RecordingNotificationChannelAdapter` are both
   resolvable from that context, so W01 runs through the **real** execution
   service and the sink is readable in-process;
4. the adapter exposes `send`, `records`, `program`, `reset` — `program` is the
   existing failure-scripting seam E01-08 (terminal failure) and E01-09
   (retryable-then-success) require, so **no W01 business behaviour would need
   mocking**;
5. the E2E orchestrator (`packages/e2e-testing/scripts/run-e2e.mjs`) starts
   **no worker process at all**, so an E01 worker context would be the only
   claimer in the topology — §6's isolation requirement is satisfied by the
   existing design rather than by adding anything.

---

## D. E01 fixture universe

**Not created.** No synthetic contact, verification lineage, Customer, fixture
`custom_requests` row, secure-grant lineage or Admin test identity was seeded.

Recorded for the successor run: the `custom_requests` row is **fixture
scaffolding only**, and no APP5 submission action may be called — the
constraint `APP4-B05`'s own `secure-grant-context.ts` already documents and
enforces.

---

## E–R. Proof items E01-01 … E01-18

**Not executed.** No runtime evidence exists for any of the following, and none
is claimed:

| Item | Subject | Status |
| --- | --- | --- |
| E01-01 | live verification issuance and controlled delivery | NOT RUN |
| E01-02 | exact-once intent/delivery evidence | NOT RUN |
| E01-03 | verification creates exactly one Customer | NOT RUN |
| E01-04 | secure grant issuance + controlled link delivery | NOT RUN |
| E01-05 | live secure-link browser bootstrap | NOT RUN |
| E01-06 | non-enumerating rejection | NOT RUN |
| E01-07 | Admin sees identity, revokes, link stops | NOT RUN |
| E01-08 | terminal failure visible and manually replayable | NOT RUN |
| E01-09 | automatic transport retry is the same delivery | NOT RUN |
| E01-10 | business resend is observably different | NOT RUN |
| E01-11 | automatic retry same outbox/envelope | NOT RUN |
| E01-12 | terminal failure produces immutable `DEAD_LETTER` | NOT RUN |
| E01-13 | manual replay creates new identities, copies envelope | NOT RUN |
| E01-14 | old terminal evidence unchanged | NOT RUN |
| E01-15 | source business object unchanged by replay | NOT RUN |
| E01-16 | concurrent Admin replay collapses | NOT RUN |
| E01-17 | stale secret rejects replay (`409 / REISSUE_REQUIRED`) | NOT RUN |
| E01-18 | business resend differs from manual replay | NOT RUN |

Consequently the report sections the prompt reserves for these results —
E (verification issue/delivery), F (Customer creation), G (retry vs resend),
H (grant/binding/link), I (fragment bootstrap), J (rejection matrix), K (Admin
journey), L (failure visibility), M (replay transaction evidence), N (concurrent
replay), O (`REISSUE_REQUIRED`), P (three-contract comparison), Q (secret absence
scan), R (structural wrong-target/purpose proof) — are **deliberately empty**.
Writing them from source reading rather than from a run would be exactly the
fabricated evidence E01 exists to prevent.

Nothing was fabricated, no wrong-target/purpose/scope database state was
manufactured, and no route stub was substituted for APP4 backend behaviour.

---

## S. Follow-up closures / carry-forward

**Closed by this checkpoint, with evidence:**

- `FU-APP4-DEV-API-IMAGE-01` — **CLOSED** (§C). The local API no longer returns
  502/unhealthy; root cause fixed in both Dockerfiles and verified by a healthy
  container serving the mapped APP4 routes.

**Explicitly NOT closed** (E01 did not prove them; they require the acceptance
run and must **not** be closed merely because E01 started):

- `FU-APP4-S02-LIVE-JOURNEY-01`
- B08 replay-through-worker live journey follow-up
- equivalent A01 live B07/B08 lifecycle follow-up

**Carried forward untouched**, as §18/§19 require:

- `FU-APP4-S01-ATTEMPT-COUNT-COPY-01`
- `FU-APP4-S01-SUCCESS-HANDOFF-01`
- `FU-APP4-S01-ERROR-CODE-GRANULARITY-01`
- `FU-APP4-S02-LIVE-REGION-COPY-01`
- `FU-ADMIN-SHARED-DIALOG-01`
- `FU-APP4-B01-POLICY-GATE-STALE-01` — stale checker debt, **not repaired**
- `FU-APP4-B02-GATE-SCOPE-01` — stale checker debt, **not repaired**

Neither stale checker was run as a gate (criterion 60 holds). E01 was not turned
into checker-debt cleanup. `APP4-X01` owns final disposition.

---

## T. Validation ledger and wall-clock

### T.1 Wall-clock

```text
E01 start   2026-08-15T11:46:13Z
E01 stop    2026-08-15T12:07Z
elapsed     ~21 minutes  (budget 45 target / 60 hard)
```

The 60-minute hard stop was **not** reached. Work stopped at ~21 minutes on the
judgement recorded in §T.3, so the remaining budget was deliberately not spent
producing code that could not also be validated inside it.

### T.2 Commands actually run

| Purpose | Count |
| --- | --- |
| Evidence preflight reads (§4) | 2 |
| Environment health inspection (§5) | 2 |
| Targeted image rebuild (`api`, `worker`) | 1 |
| Stack recreate (incl. one corrected invocation, §C.3) | 2 |
| API health/log verification | 1 |
| Workspace build `@embroidery/worker...` | 1 |
| Worker-seam feasibility probe (throwaway) | 2 |

No `pnpm quality`. No full API/worker/Storefront/Admin Jest. No Playwright suite.
No B03–B08/W01/S01/S02/A01 suites. No OpenAPI generation or check. No
generated-client generation. No DB manifest or regression. No Figma checker. No
SonarQube. No repo-wide build/typecheck/lint. **The prohibited §22 list was not
touched.**

The §22 closing validations (scoped Prettier, `check-report-secrets.mjs`,
staged-whitespace) are run against this report and the two Dockerfile edits —
the only changed files — and are listed in §V.

### T.3 Why the run was not attempted — the scope/budget finding

This is the substantive finding for the Product Owner, and it is a statement
about the checkpoint's *specification*, not about APP4's runtime.

E01 as written requires, before its first assertion can run:

1. orchestrator extension — an APP4 mode in `run-e2e.mjs` generating and
   injecting per-run ephemeral APP4 secret material
   (`VERIFICATION_CODE_SECRET_PEPPER`, `SECURE_LINK_TOKEN_SECRET_PEPPER`,
   `NOTIFICATION_DELIVERY_ENVELOPE_KEY`, `STOREFRONT_PUBLIC_ORIGIN`) into both
   the API host process and the spec child env. The current `api-service.mjs`
   passes **none** of them, so no APP4 issuance would work in the E2E edge today;
2. a second in-process Nest context for the API side — E01-04 mandates calling
   the **internal** `SecureGrantIssuer` port, which has no public endpoint, so
   the harness must compose an API context the way §C.4 proved a worker context
   can be composed;
3. the fixture universe, the DB-evidence layer, the browser-secrecy
   instrumentation, and browser journeys written against S01/S02/A01 markup;
4. one spec carrying 18 forensic items whose assertions are largely
   *identity and byte-equality* comparisons across two processes.

§23 budgets **one** canonical run (a second only if harness code was wrong).
A harness of this size that is green on its first execution is not a realistic
engineering outcome; the normal cost is many short debug cycles, each requiring
a stack bring-up. Authoring it inside the residual ~39 minutes was achievable
only by writing it **unvalidated** — which would have produced placeholder
evidence and a report asserting proofs that never ran, violating the completion
standard ("Never claim success without executable evidence"), §9's prohibition
on placeholder logic, and E01's entire purpose.

Stopping with two verified results and an honest ledger is the correct outcome;
a fabricated `PASS` is not.

### T.4 Recommended disposition

The Product Owner's call. The engineering recommendation is to re-issue E01 with
a budget matched to its scope, split along the seam §C.4 already de-risked:

- **E01-a — harness delivery.** Orchestrator APP4 mode, the API and worker
  in-process contexts, fixture universe, DB-evidence and browser-secrecy
  helpers. Explicitly permits the iteration a new harness needs.
- **E01-b — the acceptance run.** The 18 proof items, against the delivered
  harness, inside the bounded single-run budget §2 intends.

The §2 time governance then applies to the run it was written for, and the
harness's own iteration cost stops competing with it.

---

## U. Files changed

```text
M infrastructure/docker/api.Dockerfile        (§5.2 workspace visibility)
M infrastructure/docker/worker.Dockerfile     (§5.2 workspace visibility)
A docs/implementation/reports/APP4-E01-COMPLETION-REPORT.md
```

No application source, schema, migration, OpenAPI document, generated client,
Figma artifact or checker was modified. No production endpoint was added
(E01 adds 0, as entry requires). The HTTP surface is unchanged at
`48 paths / 53 operations`. No E01 harness or checker file was created — none
would have been validated, and `tools/check-app4-e01.mjs` is deliberately not
invented for a run that did not happen.

**No write of any kind was made to `.env`**, no secret-bearing variable was read
or echoed, and no credential was rotated. The disposable-database helper resolved
its own connection string from `.env` internally (file → tooling), which is the
sanctioned path.

## V. Git evidence

Two commits, neither pushed, neither amended, neither squashed. The §27 Commit A
subject (`test(app4): prove secure contact cross-layer acceptance`) is
**deliberately not used** — it would assert a proof this checkpoint did not
produce.

```text
fix(infra): make notification-delivery visible to the api and worker images
docs(app4): record APP4-E01 environment repair and non-delivery
```

## W. Next checkpoint

```text
APP4-X01 = NOT RECOMMENDED YET
```

`APP4-X01` is the phase-closure checkpoint and must not consume an E01 that did
not run. The next action is the Product Owner's disposition in §T.4.

`APP4-X01` was **not** started. No APP5/APP6/APP7 work was started, and no APP5
business action was executed.
