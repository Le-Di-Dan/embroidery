# APP4-E01-H02 — Fixture and Browser Evidence Helpers · Completion report

## A. Verdict

```text
APP4-E01-H02 = NOT COMPLETE
STOP — E01_H02_RUNTIME_DEPENDENCY_DEFECT
```

Every helper group §1 asks for is delivered, linted and — where it carries real
rules — unit-tested. The browser topology is wired. The **readiness smoke could
not run**, because the topology cannot be bootstrapped: the production
`staff-bootstrap` CLI exits `1` and prints nothing at all, which §22 makes an
explicit stop rather than something H02 may debug.

```text
APP4-E01-R01 = STILL BLOCKED_ON_H02
APP4-X01     = NOT READY
```

**No APP4 acceptance proof E01-01..E01-18 was executed.**
**No full regression/test chain was run.**

No challenge was issued, no Customer created, no grant issued, no notification
delivered, nothing replayed or revoked.

| Group (§1) | Status |
| --- | --- |
| Canonical fixture universe | delivered |
| Custom Request scaffolding | delivered |
| DB evidence helper | delivered |
| Worker-control helper | delivered |
| Recording-adapter safe observation | delivered |
| Secret-safe comparison / scan helpers | delivered, unit-tested |
| S01 browser driver | delivered |
| S02 fragment instrumentation | delivered |
| A01 browser driver | delivered |
| Safe network observer | delivered |
| Browser topology extension | wired; **cannot bootstrap** (§C) |
| H02 readiness smoke | written; **not run** (§M) |

---

## B. Entry / H01 inheritance

H01 was reused unchanged and not reopened: its `--app4` mode, per-run secret
universe, disposable database, API application context, `SecureGrantIssuer`,
worker context with polling held, `JobExecutionService` and recording adapter.
Every helper is built on those handles rather than beside them.

### One H01 defect found and corrected

`RecordingNotificationChannelAdapter.records()` is a **method**, not a property.
H01's smoke asserted `recordingAdapter.records.length === 0`, which reads the
function's *arity* — also `0` — so it passed while proving nothing about the
sink. Corrected to `records().length === 0`, with a comment recording the trap.

This is disclosed rather than quietly fixed, because H01's §I listed
`recording adapter starts empty` as proven evidence and it was not. H01's other
twelve proofs are unaffected: each asserts a constructor name, an HTTP status, or
a value read back from a live pool.

---

## C. Browser topology extension — wired, blocked at bootstrap

Wired exactly as H01's report recommended: by extending the **canonical**
`startEnvironment` (which already starts Storefront, Admin and the real Nginx
gateway) with one optional `withApp4` parameter, rather than growing H01's lean
APP4 owner. Absent that parameter the existing modes' environment is
byte-identical to what it always was.

- `--app4-browser` mode with two host/Chromium Playwright projects
  (`app4-storefront-chromium`, `app4-admin-chromium`), split by base URL;
- the API HTTP process and the `staff-bootstrap` CLI both receive the run's
  ephemeral APP4 secret material;
- **no second worker** is started — the worker stays H01's in-process context,
  so nothing competes for jobs;
- one cleanup owner (the existing `CleanupStack`), and the development stack is
  untouched.

Both Next apps were already production-built, so the browser tier itself was not
the obstacle.

### The blocking defect

The run fails before any browser opens:

```text
[e2e] bootstrapping admin
[e2e] FAILED: Admin bootstrap failed (exit 1, status UNKNOWN).
bootstrap output:
```

The output is empty because the CLI produced none. Reproduced **directly, with
no harness involvement**, running the built CLI by hand with a complete
configuration (database, staff bootstrap variables, APP3 Design pepper, all three
APP4 values, and a full offline object-storage block), stdio inherited:

```text
node dist/cli/staff-bootstrap.js   →   EXIT=1, stdout empty, stderr empty
```

This contradicts the CLI's own contract. `apps/api/src/cli/staff-bootstrap.ts`
ends in a `.catch` that writes `result=FAILED_BOOTSTRAP <message>` straight to
`process.stderr` — with a comment explaining it bypasses the Nest logger
precisely because a booted context may have silenced it — and `report()` does the
same for handled refusals. A silent exit `1` is a path neither covers.

Assessment, stated as such rather than as a conclusion:

- **owning checkpoint**: `APP1` (the CLI and `ADR-APP1-001` §8 bootstrap
  contract), not APP4;
- **impact beyond APP4**: the accepted `--app1` E01 mode calls the same helper,
  so the existing cross-layer browser suite is very likely unbootstrappable at
  HEAD too. H02 did not run `--app1` to confirm — that is another checkpoint's
  suite and outside this scope;
- **smallest likely fix**: whatever swallows the failure, the observable bug is
  that a failing bootstrap must still print its status line; the diagnosis
  belongs to whoever owns the CLI;
- **not attempted here**: §22 forbids debugging passed checkpoints inside H02, so
  no application source was touched.

One harness improvement was made while diagnosing and is kept, because the
failure was otherwise unactionable: `bootstrapAdmin` now includes the child's own
output in its error, with the bootstrap password redacted from that text first.
The CLI never prints the password; the redaction guarantees a future one could
not either.

## D. Fixture universe helper

`support/app4/fixture-universe.mjs` — `createApp4FixtureUniverse(runtime)`.

Deliberately thin, because E01's claim is that the *production* path creates the
Customer, Contact Point, challenge, grant and notification binding — a builder
that pre-created any of them would manufacture the evidence. It provides only a
synthetic contact for the Storefront to type, the one prerequisite row a grant
needs, and safe readers over whatever the production path then produced.

`createSyntheticContact(runId)` returns a per-run email under the reserved
`*.example.test` domain and a Vietnamese national-form `09xx` number — generated,
not fixed, so two runs never collide on the identifier-scoped rate limit — plus
pre-masked forms. The contact is not secret but is personal-data-shaped, so
nothing prints it whole. No raw secret is exposed through the universe object.

## E. Custom Request scaffolding

`seedCustomRequestScaffolding` writes exactly the row `APP4-B05`'s own context
writes, through the same raw insert:

```text
INSERT INTO custom_requests (id, code, customer_id, status) VALUES (…, 'NEW')
```

**Test scaffolding only — not an APP5 submission.**
`secure_access_grants.custom_request_id` is NOT NULL behind an FK RESTRICT, so a
grant cannot exist without one; APP5 is not implemented and `APP4-B05`
deliberately does not create requests. The helper returns
`isApp5Submission: false`, so a call site states the boundary rather than assumes
it. No APP5 action exists to call, none is modelled, no unrelated content seeded.

## F. DB evidence helper

`support/app4/db-evidence.mjs` — one reader per question E01 actually asks
(challenge, verification attempts, customer count, contact points, notification
intent, delivery attempts, outbox event, grant, active-grant count, terminal
snapshot). No generic SQL console: arbitrary SQL would move the evidence contract
into eighteen call sites.

The safety property is inverted from the usual allowlist. Every read passes
through `projectSafe`, which **removes** any column matching
`hash|digest|cipher|iv|auth_tag|token|code|secret|pepper` and replaces it with a
`has<Column>` boolean. A forgotten allowlist entry leaks; a forgotten denylist
entry merely omits a boolean. Unit-tested, including a column invented by the
test, to prove a *newly named* digest is withheld without the helper being told
about it.

`snapshotTerminalOutbox` returns the safe projection plus an in-memory
**fingerprint** — a per-field SHA-256 of the envelope values — so `E01-13` and
`E01-14` can prove byte-identity and immutability without any caller holding
ciphertext, IV or auth tag.

## G. Worker-control helper

`support/app4/worker-control.mjs` claims through the same
`WorkerJobQueueRepository` the poll loop uses and executes through H01's real
`JobExecutionService`, one job per call — a larger batch would lease rows the
harness never executes, and a later "no second send" assertion would be measuring
an abandoned lease instead of the guard it targets.

`DELIVERY_OUTCOME` names the three patterns §10 requires — `SENT`,
`RETRYABLE_FAILURE`, `TERMINAL_FAILURE` — over the adapter's existing `program`
seam, which scripts what the adapter *reports*, never what it is sent. No second
worker implementation; the gate stays closed.

`safeDelivery(i)` returns channel, secret kind, timestamps, `hasSecret` /
`hasSecureLinkUrl` booleans and a masked recipient. The plaintext is reachable
only through the separately named `secretOf(i)` / `secureLinkOf(i)`, so a caller
must ask on purpose and the sanctioned next step is a boolean comparison.

## H. Secret-safe comparison / scan helpers

`support/app4/secret-compare.mjs` — `assertSecretEqual`, `assertSecretDifferent`,
`compareFields`, `assertByteFieldsEqual`, `assertAbsentFromText`,
`scanTextsForSecret`.

These exist because `expect(a).toBe(b)` on two codes prints both the moment it
fails — a test that leaks only when it breaks leaks at the worst possible time.
Every failure message is built from field names, booleans, counts and safe ids. A
unit test forces each failure and asserts the message contains **neither**
operand.

`specs/app4/support/browser-secret-scan.ts` covers URL, hash, history state, both
storages, cookies, DOM text/HTML and captured console. The secret is compared
**inside** the page, so only `present` plus surface names cross back; no matching
snippet ever does. It serves all three secrets: S01 code, S02 token, Admin raw
contact.

## I. S01 browser driver

`specs/app4/support/s01-verification-driver.ts` — the full operation set §11
requires.

Selectors are accessible ones: roles, labels, approved copy. Not a stylistic
preference — the form's ids come from React `useId()`, so they are generated per
render and are **not** a stable contract, while the label and button name are.
**No production test id was added and none was needed**, so §19's stop condition
was never approached.

Approved Vietnamese copy is duplicated as a test expectation, exactly as the
accepted APP1 helpers duplicate the login copy: the assertion must fail when the
wording changes, which is only true if it is written down rather than imported
from the thing it checks. No policy duration is hard-coded.
`readMaskedDestination` returns the card text so a suite can assert it is masked,
and never compares it against the raw contact.

## J. S02 fragment instrumentation

`specs/app4/support/s02-fragment-instrumentation.ts` installs via
`addInitScript`, i.e. **before any application script** — a hook installed after
hydration cannot observe the call it exists to witness.

It encodes the subtlety `APP4-S02` established: Next's own hydration calls
`history.replaceState` first, so "the first replaceState" is the wrong event to
measure. The **cleaning** call is identified by a transition — the hash carried
the token before it, and does not after — rather than by position, and
`stripBeforeRequest` compares that call's sequence number against the resolve
request's.

Both transports are patched: `fetch` alone would observe nothing, because Axios —
the only approved frontend HTTP client — uses `XMLHttpRequest` in the browser.
Exported facts are booleans, counts and safe names only, including
`requestBodyKeys` and `requestBodyHasTokenField`, so `E01-05` can prove the token
travels in the body and not the URL without the token entering a diagnostic.

## K. A01 browser driver / auth

`specs/app4/support/a01-customer-access-driver.ts` — the full operation set §13
requires, against the approved admin copy.

Authentication is not reimplemented: the accepted APP1 E01 mechanism (a real
login through the real form against a bootstrap Admin) is the path; no guard is
disabled and no cookie injected. `readReplayOutcome` matches only the published
vocabulary — `CREATED`, `EXISTING`, `REISSUE_REQUIRED` — and returns `UNKNOWN`
rather than guessing, because an outcome inferred from a status code would make
`E01-16`/`E01-17` unfalsifiable. `isLookupDraftCleared` returns a boolean, never
the field value, since the draft under test *is* the raw contact.

## L. Network observation

`specs/app4/support/network-observer.ts` watches only: it never fulfils, aborts
or rewrites a request, so no APP4 backend behaviour is ever mocked. It records
method, pathname, status and order, and for bodies reports **shape, not
content** — key names plus a boolean per key. `POST /api/public/secure-links/resolve`
therefore yields `bodyKeys: ['token']` and a presence boolean, which is what
`E01-05` must prove, with the token never leaving the browser process. Headers
are exposed only through an explicit allowlist.

## M. H02 readiness smoke — written, not run

`specs/app4/h02-helpers.smoke.spec.ts` is written and covers exactly §18's list
minus the runtime items H01 already owns: S01 initial UI identified through
accessible selectors only, S02 instrumentation installed and readable after
hydration on `/truy-cap`, and the A01 lookup UI identified after a **real** login.
It issues no challenge, submits no code, creates nothing, and clicks neither
submit control.

It did not run: the topology fails at admin bootstrap (§C). Two run attempts were
made — the §22 maximum — plus three non-smoke diagnostic invocations of the CLI
itself. The first attempt failed on H02 tooling (the bootstrap child was missing
the APP3/APP4 configuration `AppModule` now requires), which was corrected; the
second exposed the production defect, which is where §22 says to stop.

## N. Validation ledger

| Validation | Command | Result |
| --- | --- | --- |
| Helper unit tests | `jest support` | 26 passed, 6 suites |
| Scoped ESLint | `eslint support/app4 specs/app4 support/orchestration scripts` | clean |
| Scoped Prettier | `--write` then `--check` on changed files | clean |
| H02 readiness smoke | `node scripts/run-e2e.mjs --app4-browser` | **blocked** (§C) |
| Report secrets | `node tools/check-report-secrets.mjs` | passed |
| Staged whitespace | `git diff --cached --check` | clean |

Not run: E01-R01, full E2E, the APP1 Playwright suite, any application Jest
suite, APP4 checkpoint suites, OpenAPI/client generation, DB regression, Figma,
SonarQube, `pnpm quality`, repo-wide checks. No Docker rebuild.

## O. Wall-clock

```text
H02 start   2026-08-15T12:58:50Z
H02 stop    2026-08-15T13:15:00Z
elapsed     ~16 minutes  (target 35 / hard stop 50)
```

Inside target; the stop is the §22 defect condition, not the clock.

One process note worth recording against the previous checkpoint's habit: an
earlier draft of this report estimated elapsed time instead of measuring it and
was wrong by roughly 40 minutes, which nearly ended the checkpoint early with
three groups undelivered. The figure above is measured, and the missing groups
were delivered with the budget that estimate would have thrown away.

## P. Files changed

```text
A packages/e2e-testing/support/app4/db-evidence.mjs
A packages/e2e-testing/support/app4/secret-compare.mjs
A packages/e2e-testing/support/app4/worker-control.mjs
A packages/e2e-testing/support/app4/fixture-universe.mjs
A packages/e2e-testing/support/app4/evidence-safety.test.mjs
A packages/e2e-testing/specs/app4/support/browser-secret-scan.ts
A packages/e2e-testing/specs/app4/support/s01-verification-driver.ts
A packages/e2e-testing/specs/app4/support/s02-fragment-instrumentation.ts
A packages/e2e-testing/specs/app4/support/a01-customer-access-driver.ts
A packages/e2e-testing/specs/app4/support/network-observer.ts
A packages/e2e-testing/specs/app4/h02-helpers.smoke.spec.ts
M packages/e2e-testing/support/orchestration/environment.mjs   (withApp4; bootstrap diagnostics)
M packages/e2e-testing/scripts/run-e2e.mjs                     (--app4-browser mode)
M packages/e2e-testing/playwright.config.ts                    (two app4 projects)
M packages/e2e-testing/package.json                            (e2e:app4:browser)
M packages/e2e-testing/support/app4/app4-runtime.smoke.mjs     (H01 records() fix, §B)
A docs/implementation/reports/APP4-E01-H02-COMPLETION-REPORT.md
```

Test and tooling only. No API, worker, Storefront or Admin runtime source; no
schema, migration, OpenAPI document, generated client or Figma artifact; the
accepted Dockerfiles untouched. No production test id or selector hook was added
to any UI. Existing E2E modes are behaviourally unchanged.

## Q. Git evidence

Two commits, not pushed, not amended, not squashed:

```text
test(app4): add E01 fixture and browser evidence helpers
docs(app4): record E01 helper readiness evidence
```

## R. Next sub-checkpoint

The Product Owner's call, because the blocker belongs to another checkpoint:

1. **Disposition the `staff-bootstrap` silent-exit defect** (§C). It plausibly
   blocks the accepted APP1 E01 browser suite as well, so it is worth confirming
   against `--app1` before scoping. Until it is fixed, **no** browser-tier
   evidence can be produced for APP4 or APP1.
2. Re-run the H02 readiness smoke unchanged — the helpers, topology wiring,
   projects and spec are all in place and need no rework.
3. Then `APP4-E01-R01`.

`APP4-E01-R01` stays blocked; `APP4-X01` remains NOT READY.
