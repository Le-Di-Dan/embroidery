# APP4-B03 — Verification challenge issue and business resend — completion report

## A. Verdict

```text
PASS
```

Two public POST operations issue and reissue one-time codes. The code is minted
and digested by `APP4-P01`, the challenge stores only the digest, the challenge
and its delivery hand-off commit in one transaction, CST-007 stays the
single-open arbiter, and the plaintext leaves the request only inside the sealed
`APP4-B01` envelope.

No stop condition was reached. Two deliberate narrowings are recorded in §Q:
`sessionId` is not accepted, and the recording-adapter handoff is proven in two
halves that meet at the envelope bytes.

## B. Entry state

- `APP4-P00 = PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`
- `APP4-G01 = PASS`, `APP4-D01 = PASS`, `APP4-P01 = PASS_AFTER_C1`
- `APP4-B01 = PASS_AFTER_C1`, `APP4-W01 = PASS`, `APP4-B02 = PASS`
- APP4 policy publication is closed by `APP4-B01-C1`; B03 consumes only.
- `NO_APP4_MIGRATION` holds: 34 migrations before and after.

## C. Authority/repository audit

| Question | Answer, as found in source |
|---|---|
| CST-007 physical name | `uq_verification_challenges__kind_value_purpose__issued` (IDX-006), partial on `status = 'ISSUED'`. |
| Catalogued conflict code | `CONSTRAINT_MEANINGS` already maps it to `CONFLICT` / `CHALLENGE_ALREADY_OPEN`. No new mapping was added. |
| Expiry semantics | TBL-006's own header: "expiry does **not** remove a row from the partial index — the issue transaction must first mark the stale row EXPIRED, then insert, handling 23505 as the concurrent-issuer loss (CC-17)". |
| Replacement transition | DB3 §1, verbatim: "một open challenge per (contact, purpose); challenge mới **CANCELLED** challenge cũ". The conservative default the brief offered is the locked authority. |
| Repository methods available | `openChallenge`, `recordAttempt`, `completeChallenge`, `failChallenge`, `resolveOpen`, `countAttempts`, `hasRecentCompleted`, `findById`. |
| Policy reader | `PolicyConfigurationRepository.currentValue`, read **at the point of use** — the rule `PolicyModule`'s own doc states. |
| Transaction owner | `TransactionManager.runInTransaction`, joining an enclosing boundary by default. |
| B01 hand-off | `RequestNotificationUseCase.request(...)` creates the intent and appends the outbox event inside the caller's transaction, and is the only API seam that calls `sealDeliveryEnvelope`. |
| Controller conventions | `@ApiTags` + `@Controller('public/...')`, Zod DTOs through `createZodDto`/`registerZodDtos`, `@ApiSuccessCode`, `envelopeSchemaOf(...)`, refusals as bare `HttpException`s from a domain error file. |
| Entry OpenAPI counts | 37 paths, 42 operations, 84 schemas. |

### Repository extension — four methods, each unavoidable

Nothing in the delivered surface could expire a stale row, cancel a live one,
count issuances in a window, or report a challenge's **status** (`findById`
returned a challenge with no state, so "is this resendable" was unanswerable).
So the port gained exactly four methods and the read model gained `status`,
`createdAt`, `sessionId` and `contactPointId`.

`lockTarget` deserves its own justification. The rate limit is a *count over
durable history*, which is read-then-write: two concurrent issuances both see
four in the window and both insert a fifth. There is no row to lock instead —
the row that would breach the limit is the one being created — and a counter
table is forbidden. A transaction-scoped `pg_advisory_xact_lock` keyed on a
**hash** of the target (advisory locks are visible in `pg_locks`; a normalized
email as a lock key would put contact values in an operational view) is the
narrow, no-schema answer §9 authorizes. It also turns the CST-007 race into a
serialization, which is why the concurrency test observes two successes rather
than one loss.

`OpenChallengeInput` also gained `issuedAt`, written explicitly to `created_at`.
This was found by a failing assertion, and it is a real defect rather than a
test artifact: `expires_at` is computed by the application while `created_at`
came from PostgreSQL's `defaultNow()`, so the resend cooldown and the rate
window were measured against a *different clock* from the expiry beside them. In
production the two agree to within milliseconds, which is exactly what would
have kept it invisible.

## D. HTTP contracts

```text
POST /api/public/verification/challenges                      publicVerification_issue    202
POST /api/public/verification/challenges/{challengeId}/resend publicVerification_resend   202
```

Request body (issue): `contactKind` (`EMAIL`|`PHONE`), `contact`, `purpose`
(`SUBMISSION`|`STEP_UP`), `.strict()`. The resend has **no body**: its target
comes from the source challenge, because accepting a contact would turn a resend
into an unauthenticated redirect of someone else's code.

Response (both): `challengeId`, `expiresAt`, `resendAvailableAt`. Never a code,
digest, contact, mask, customer or contact-point id, intent id, outbox id,
envelope or attempt count — and never the `outcome`, because whether the
challenge was created by this call or already existed is itself a fact a caller
must not read.

Refusals: 400 malformed (platform pipe), 422 unusable contact / unresendable
challenge / bad session reference, 429 cooldown or budget, 503 unconfigured.
`CHALLENGE_NOT_RESENDABLE` is 422 rather than 404 on purpose — an id that
answers differently is an id an attacker can confirm. Nothing depends on who
owns the destination, and `IssueVerificationChallengeUseCase` does not depend on
`CustomerRepository` at all, so it *cannot* branch on it.

## E. Issue semantics

```text
normalize through P01 (once)
→ read verification.challenge policy   (missing/malformed ⇒ 503, nothing written)
→ transaction:
    lockTarget(kind, normalized, purpose)      ← serializes this target
    expireStale(...)                           ← frees the CST-007 slot
    resolveOpen(...)  found ⇒ ALREADY_OPEN, return it unchanged
    countIssuedSince(...) ≥ budget ⇒ ISSUANCE_RATE_EXCEEDED
    issue: mint → digest → insert (hash only) → B01 intent + outbox
```

A live challenge is **returned, not rotated**. Minting on every issue call would
make the initial endpoint a cooldown-free resend, reachable by any client that
simply calls the other route. The response is byte-identical to the one that
created the challenge, including `resendAvailableAt`.

## F. Resend semantics

Eligibility is read from the source and re-read **under the lock**, because
between the first read and the decision the source may have been answered, swept
or already replaced. A resend requires a live `ISSUED` source, an elapsed
cooldown and remaining budget; every other case is one refusal.

The source moves `ISSUED → CANCELLED` (DB3 §1), then a replacement is issued with
a new code, digest, challenge, intent, outbox event and envelope. The old
ciphertext is never re-sent and the old digest is never read. The replacement
inherits the source's kind, normalized value, purpose, session and contact-point
bindings — nothing comes from the request.

Not `EXPIRED`: the source had not reached its `expires_at`, and recording that it
had would falsify the column. Not `FAILED`: no attempt limit was reached.

## G. Atomicity

All four steps share one `runInTransaction`. The issuer opens no boundary of its
own — the lock, the sweep and the rate decision live in the same transaction, and
a nested boundary would let the challenge commit while those rolled back.

Proven by injecting a failure through the existing transaction seam: an
enclosing transaction that throws after the use case returns leaves zero
challenges, zero intents and zero outbox events. No production failure-injection
code was added.

## H. Secret-lifetime evidence

The plaintext exists in exactly three places: the local `const` inside
`VerificationChallengeIssuer.issue`, the sealed ciphertext, and the worker's
outbound sink after it claims. `code_hash` is a peppered HMAC through the P01
authority — asserted to differ from the code and to be longer than it.

`codeAppearsAnywhere` sweeps every textual and JSON column the issue path writes
— `contact_verification_challenges`, `notification_intents`, `outbox_events`
(excluding the ciphertext, the one place it belongs), `audit_events`,
`background_job_attempts` — and returns empty for every code in every test.

B03 writes **no audit row**. Verification outcome auditing is B04's, identity
link/attach is B02's, grant lifecycle is B05's, and no locked DB3 rule requires
an issuance audit. Asserted, not assumed: the first issue test checks the audit
table is empty.

No code value appears in this report.

## I. Recording-adapter handoff

**Delivered in two halves, and this is a deliberate deviation from §21's literal
shape.** A single test spanning both apps is forbidden by the delivered gates:
`check-app4-b01.mjs` and `check-app4-w01.mjs` both fail on any import between
`apps/api/src` and `apps/worker`, and neither exempts test files. Writing that
test would have broken two accepted checkpoints' gates.

So the seam is proven where each half lives, and the halves meet at the envelope
bytes:

- **B03 half (here).** `seals the issued code, and only it, into the envelope`
  opens the persisted `outbox_events.payload` with the test's envelope key and
  asserts the plaintext is exactly the minted code, with the channel, normalized
  recipient, secret kind and expiry W01 will hand to its adapter. The code comes
  from an overridden minter, so this compares the *issued* value rather than
  proving a round trip.
- **W01 half (accepted).** W01's delivered suite proves the opened plaintext
  reaches `RecordingNotificationChannelAdapter` unchanged, that the adapter makes
  no external call, and that the secret reaches no persisted column or log.

There is no gap between the halves: the envelope row asserted here is the same
row W01 claims. Nothing in W01 was re-run and nothing in it changed.

## J. Rate policy

`maxIssuesPerTargetPerWindow = 5` per normalized target **and purpose** per
`rateWindowSeconds = 900`, counted over `contact_verification_challenges.created_at`.
Every row counts regardless of state: each is an issuance that reached the
destination, and counting only open ones would make the limit resettable by
answering wrongly. Business resends count because they create challenges.

Concurrency is enforced, not deferred: with one slot left and no live challenge,
two concurrent issuances produce exactly one new challenge. The advisory lock is
what makes the read-then-insert safe.

The refusal is identical for a known and an unknown destination, and both 429s
describe the caller's own behaviour rather than anything about the target.

## K. OpenAPI/client evidence

| Artifact | Entry | Final |
|---|---|---|
| paths | 37 | 39 |
| operations | 42 | 44 |
| schemas | 84 | 86 |

New schemas: `IssueVerificationChallengeBody`, `VerificationChallengeResponse`.
Delta is exactly **+2 operations**, as required.

```text
openapi.generated.json sha256  c8e5e2a0b1bf5550c9885f017cc2df6898ad30d7380f0475ba648d23be851be8
api-client tree hash           c36d7b17d217d783dee9be005aeb58e39d67134aef6f9be0d763ed99f784d1d6
```

The first generation produced a **dangling `$ref`**: the 202 referenced
`VerificationChallengeResponse` while the component was never published, because
referencing a class from a response is not the same as registering it. Fixed with
`@ApiExtraModels`, following the delivered design-session controller, and
regenerated once. No generated artifact was edited by hand.

## L. Contract checker

```text
node tools/check-app4-b03-contract.mjs            → pass
node --test tools/check-app4-b03-contract.test.mjs → 37 tests, 37 pass
```

449 and 411 lines, both under the 450/700 tooling caps. All 23 required
assertions are covered, reading the generated document and comment-stripped
source.

Two of the gate's own rules were too weak and were caught by mutation cases
rather than by review:

- the B04-route scan sat *after* a path-set comparison that returns early, so a
  `/verification/attempts` route produced the generic failure instead of the
  specific one. Moved ahead of it.
- "does not reach customer identity" matched only type and token names, so
  `this.customers.findByVerifiedContact()` slipped past. It now also matches the
  customer repository's own method names.

A third case exists to keep the gate honest in the other direction: `tolerates
the B02 identity service, which legitimately reaches the customer` — B02's
service lives in the same `application/` directory, so a gate scoped to the
directory rather than to B03's own files would fail on the checkpoint whose job
is to touch `CustomerRepository`.

## M. Focused tests

| File | Tests | Scenario |
|---|---|---|
| `verification-challenge-issue.integration.spec.ts` | 10 | New EMAIL issue (hash-only storage, policy-derived timing, secret-free intent, one `PENDING` event, ciphertext payload, no code anywhere, no audit row); the sealed envelope carrying exactly the issued code; new PHONE issue through E.164 with `SMS`; unusable contact refused with nothing written; a live challenge returned unrotated; `SUBMISSION`/`STEP_UP` isolation; stale expiry before replacement with one open challenge remaining; concurrent issue converging on one challenge/intent/event; rollback leaving no partial rows; CST-007 refusing a second open row inserted behind the application. |
| `verification-challenge-resend.integration.spec.ts` | 9 | Immediate resend refused with nothing written and the source untouched; refused one second early and allowed on the instant; full replacement (new id, digest, intent, intent key, ciphertext, IV, envelope plaintext) with the source `CANCELLED` while still unexpired and one open challenge remaining; lineage inherited from the source; unknown and expired sources answering identically; budget exhaustion writing nothing; recovery after the window; per-purpose budget scoping; two concurrent callers not sharing the last slot; malformed policy failing closed. |
| `verification-unconfigured.integration.spec.ts` | 1 | No published policy: refusal before the transaction opens, then success once published — proving the point-of-use read needs no restart. |

20 B03 tests, plus the 21 in the delivered DB7 suites this checkpoint's port
change put in scope. 41 total, all passing.

## N. Validation ledger

```text
No full regression/test chain was run.
```

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="verification-challenge\|verification-unconfigured" ...` | 3 suites, 20 tests, pass |
| 2 | `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="verification-and-grants\|customer-identity" ...` — required by §25.3, the port and adapter changed | 2 suites, 21 tests, pass |
| 3 | `pnpm --filter @embroidery/api exec tsc --noEmit` | pass |
| 4 | `pnpm --filter @embroidery/api run openapi:generate` then `openapi:check` | up to date |
| 5 | `pnpm --filter @embroidery/api-client run generate` then `check:generated` | up to date |
| 6 | `pnpm --filter @embroidery/api-client run typecheck` | pass |
| 7 | `node tools/check-app4-b03-contract.mjs` | pass |
| 8 | `node --test tools/check-app4-b03-contract.test.mjs` | 37/37 pass |
| 9 | `pnpm --filter @embroidery/api exec eslint src/modules/customer src/tests/integration/persistence-test-context.ts` | clean |
| 10 | `npx prettier --write <changed files>`, then 3, 7 and 8 re-verified | clean |
| 11 | `docker compose -f infrastructure/compose/docker-compose.dev.yml --env-file .env config` | valid |
| 12 | `node tools/check-report-secrets.mjs` | pass |
| 13 | `git diff --cached --check` | clean |

Not run: full API Jest, full customer regression, worker or W01 suites, B01 and
B01-C1 suites, B02 suites, full P01 suites, Storefront/Admin, Playwright, DB
manifest, migration regression, the Figma and G01 checkers, SonarQube, and any
repository-wide build, typecheck or lint. No real 60/600/900-second wait: every
duration is asserted against the injected clock.

Commands re-run after a failure, each against a covered defect and only that
command: the issue suite twice (the policy version was truncated between tests;
then a second clock behind `created_at`), the OpenAPI generation once (the
dangling `$ref`), and the gate's mutation suite twice (the two weak rules in §L).
Commands 3, 7 and 8 were verified once more after Prettier rewrote the files they
parse — a real input change, not a repeat. Nothing successful was re-run for
reassurance.

## O. Files changed

New:

```text
apps/api/src/modules/customer/domain/verification/verification-challenge-policy.ts
apps/api/src/modules/customer/domain/verification/verification-issue-outcome.ts
apps/api/src/modules/customer/domain/verification/verification-http.errors.ts
apps/api/src/modules/customer/application/verification-challenge.issuer.ts
apps/api/src/modules/customer/application/issue-verification-challenge.use-case.ts
apps/api/src/modules/customer/application/resend-verification-challenge.use-case.ts
apps/api/src/modules/customer/config/app4-secret-pepper.provider.ts
apps/api/src/modules/customer/infrastructure/clock/verification-clock.ts
apps/api/src/modules/customer/infrastructure/crypto/verification-code.minter.ts
apps/api/src/modules/customer/infrastructure/policy/verification-policy.reader.ts
apps/api/src/modules/customer/presentation/public-verification.controller.ts
apps/api/src/modules/customer/presentation/schemas/public-verification.request.ts
apps/api/src/modules/customer/presentation/schemas/verification-challenge.response.ts
apps/api/src/modules/customer/tests/integration/verification-issue-context.ts
apps/api/src/modules/customer/tests/integration/verification-issue-queries.ts
apps/api/src/modules/customer/tests/integration/verification-challenge-issue.integration.spec.ts
apps/api/src/modules/customer/tests/integration/verification-challenge-resend.integration.spec.ts
apps/api/src/modules/customer/tests/integration/verification-unconfigured.integration.spec.ts
tools/check-app4-b03-contract.mjs
tools/check-app4-b03-contract.test.mjs
docs/implementation/reports/APP4-B03-COMPLETION-REPORT.md
```

Modified:

```text
apps/api/src/modules/customer/customer.module.ts                   (controller, 6 providers, NotificationModule)
apps/api/src/modules/customer/domain/repositories/verification-challenge.repository.ts (+4 methods, +5 read fields, +issuedAt)
apps/api/src/modules/customer/infrastructure/persistence/drizzle-verification-challenge.repository.ts
apps/api/src/tests/integration/persistence-test-context.ts         (optional provider-override hook)
apps/api/src/modules/customer/tests/integration/verification-and-grants.integration.spec.ts (issuedAt fixtures, platform modules)
apps/api/src/modules/customer/tests/integration/customer-identity.integration.spec.ts       (platform modules)
infrastructure/compose/docker-compose.dev.yml                      (APP4 secret env anchor)
packages/contracts/openapi/openapi.generated.json                  (generated)
packages/api-client/src/generated/*                                (generated)
docs/implementation/SCOPED_COMMAND_INDEX.md                        (3 new scoped commands)
```

No schema file, no migration, no worker file, no frontend file, no root script.

### Two modified files that were not planned

- **`persistence-test-context.ts`** gained an optional provider-override hook.
  Additive and applied only when supplied, so every existing suite compiles the
  same graph it always did.
- **The two delivered DB7 customer suites** now compose `RequestContextModule`
  and `AuditContextModule` explicitly. `CustomerModule` reaches them through
  `AppModule` in production; once its application layer needed a request
  correlation, a suite composing the module alone could no longer resolve. This
  was a latent break from `APP4-B02` that only surfaced here, because B02's port
  was unchanged and §25.3 correctly kept those suites out of its run.
- **`docker-compose.dev.yml`** gained an `x-app4-secret-env` anchor carrying the
  two peppers and the envelope key, with no defaults, wired into `api`,
  `staff-bootstrap` and (for the envelope key) `worker`. `APP4-W01`'s report
  named this as a follow-up; B03 is the first checkpoint that cannot function in
  dev without it. Unset, nothing breaks at boot — both consumers validate lazily.

## P. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| B03 entry HEAD | `f5a927e` — `docs(app4): record APP4-B02 commit evidence` |
| B03 implementation | see below |
| B03 evidence | `docs(app4): record APP4-B03 commit evidence` — this commit; it carries the implementation hash and cannot carry its own |
| Working tree after both commits | clean |
| Pushed | **no** |

Implementation commit: `1f38854`

## Q. Limitations and deliberate narrowings

1. **`sessionId` is not accepted.** REL-007 is nullable and no authority requires
   B03 to fill it. A Design Session id is a *public* path value in APP3 — its
   credential is a cookie the `DesignSessionGuard` checks — so accepting the id
   alone would let any caller bind a challenge to a session it does not hold,
   and the FK would happily accept it. Applying that guard would make the
   endpoint session-only, which `STEP_UP` is not. Binding belongs with the
   checkpoint that authorizes and consumes it (`APP4-B04`); the repository
   already carries the field forward on a resend, so nothing is foreclosed.
2. **The recording-adapter handoff is proven in two halves** (§I), because a
   cross-app test would break the delivered B01 and W01 gates.
3. **A resend requires a live source.** Once a challenge expires, the resend
   route refuses and the issue route is the path — the client still holds the
   contact it typed. Allowing a resend from an expired source would need a
   second source-transition rule for no locked requirement.
4. **Rate and cooldown are per target, not per caller.** No IP or device
   dimension exists, which §9 forbids adding. A single attacker can still consume
   a victim's budget for a window; that is the trade the locked policy makes, and
   transport-abuse protection on public routes is `secure_link.resolve`'s shape
   in `ADR-APP4-001` §1.6, not this checkpoint's.
5. **The APP4 roadmap row still reads `IN_PROGRESS — APP4-G01 COMPLETE`.** D01,
   P01, B01, W01 and B02 did not append either; the lag is a phase-closure item.

## R. Next checkpoint

```text
APP4-B04
```

Not started.
