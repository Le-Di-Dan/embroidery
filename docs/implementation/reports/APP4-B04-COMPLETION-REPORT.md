# APP4-B04 — Verification Submit and Status — Completion Report

## A. Verdict

**PASS.**

Two public operations answer and observe a verification challenge. A submitted
code is validated on the wire as a six-decimal-character string, compared in
constant time through the `APP4-P01` peppered verifier, and recorded as an
append-only `MATCH` / `MISMATCH` / `EXPIRED_AT_ENTRY` row. The attempt budget is
read from the published `verification.challenge` policy and derived from
`contact_verification_attempts`; no counter, lockout column or fallback constant
exists. Expiry is enforced before any comparison. A correct answer consumes the
challenge exactly once through the guarded `ISSUED → VERIFIED` transition and,
for `purpose = SUBMISSION`, establishes the customer identity through the
accepted `APP4-B02` service **inside the same transaction**. `STEP_UP`
completion is verification evidence only. The status endpoint discloses a
challenge id, an LC-02 state and an expiry, and writes nothing.

The accepted `APP4-B03` gate was reconciled — B04's routes are now authorized —
without weakening a single B03 assertion.

No `BLOCKED_BY_AUTHORITY` condition was reached. In particular the B02 evidence
contract **is** representable from challenge-owned facts (§F), so §30.1 does not
apply.

---

## B. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `d8e3d96` (`docs(app4): record APP4-B03 commit evidence`) |
| Working tree at entry | clean |
| Accepted predecessors | P00 `CLOSED_AFTER_MANDATORY_DIRECTIVE`, G01 `PASS`, D01 `PASS`, P01 `PASS_AFTER_C1`, B01 `PASS_AFTER_C1`, W01 `PASS`, B02 `PASS`, B03 `PASS` |
| Entry OpenAPI counts | 39 paths, 44 operations, 86 schemas |
| Entry OpenAPI sha256 | `c8e5e2a0b1bf5550c9885f017cc2df6898ad30d7380f0475ba648d23be851be8` |
| Entry api-client tree hash | `c36d7b17d217d783dee9be005aeb58e39d67134aef6f9be0d763ed99f784d1d6` |
| Migrations at entry | 34 (`NO_APP4_MIGRATION` holds) |
| Design | `NONE` — no Figma artifact, no registry entry, no UI |

---

## C. Authority and repository audit

Read before editing: `APP4_PHASE_ENTRY_AUDIT.md` §`APP4-B04`;
`ADR-APP4-001` §1.3 (challenge policy and its five semantics) and §1.4;
`DB3_LIFECYCLE_SPECIFICATIONS.md` LC-02 `TR-LC02-01…05`;
`DB3_TRANSITION_GUARD_CATALOG.md` GRD-001/GRD-026;
`DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md` §1–§2;
TBL-006 and TBL-007 headers; and the delivered customer-module source in full.

### Current state as found

| Fact | As delivered at entry |
|---|---|
| Challenge states | `ISSUED`, `VERIFIED`, `FAILED`, `EXPIRED`, `CANCELLED` (LC-02) |
| Attempt outcomes | `MATCH`, `MISMATCH`, `EXPIRED_AT_ENTRY` (TBL-007 closed set) |
| `recordAttempt` | `@requiresTransaction`; appends `(challengeId, outcome, attemptedAt)` |
| `countAttempts` | `count(*)` over the ledger for one challenge — the only counter |
| `completeChallenge` | guarded update `status = 'ISSUED' AND expires_at > verifiedAt`; throws `notFoundError` when it matches nothing |
| `failChallenge` | guarded `ISSUED → FAILED` |
| `expireStale` | guarded `ISSUED → EXPIRED` for a target where `expires_at <= now`; returns the count |
| `lockTarget` | `pg_advisory_xact_lock` on a hash of (kind, value, purpose), released on commit/rollback |
| `hasRecentCompleted` | `VERIFIED` + `verified_at >= notBefore` for (kind, value, purpose) |
| Challenge read fields | id, contactKind, normalizedValue, purpose, status, expiresAt, createdAt, verifiedAt, sessionId, contactPointId — **no `code_hash`** |
| Transaction semantics | `TransactionManager.runInTransaction` **joins** an enclosing transaction by default; the callback takes no handle |
| Policy reader | `VerificationPolicyReader.require()` reads `verification.challenge` at the point of use and throws the bounded `VERIFICATION_POLICY_UNAVAILABLE`; no default anywhere |
| B02 result | `{ outcome: RESOLVED \| CREATED, customerId, contactPointId }`; bounded failures incl. `CONCURRENT_VERIFICATION_LOSS`, which always travels with a rollback |
| Audit conventions | `AuditEventRepository.append` joins the caller's transaction; actor `CUSTOMER`/`ADMIN`/`SYSTEM`; `ANONYMOUS` is not persistable; `StaffAuditWriter.loginFailed` is the delivered SYSTEM-actor precedent for a pre-identity outcome |
| B03 checker rule that forbade B04 | `checkPublishedContract` step 3 rejected any path matching `attempts\|/verify\|challenges/{…}$`, and required the verification path set to be exactly the issue/resend pair |

### The one repository extension

`VerificationChallengeRepository.findCodeDigest(id)` was added, with its Drizzle
adapter. It is not a convenience: constant-time comparison is
application-security-owned (TBL-006 header), so the digest must reach the
application layer, and the alternative — putting `codeHash` on
`VerificationChallenge` — would hand the digest to the issue path, the resend
path, the status projection and every future reader. It selects one column, has
no lookup *by* hash, and is called from exactly one place.

---

## D. HTTP contracts

```text
POST /api/public/verification/challenges/{challengeId}/attempts   publicVerification_submitAttempt
GET  /api/public/verification/challenges/{challengeId}            publicVerification_readStatus
```

Both live on the delivered `PublicVerificationController`. The controller was
**not** split: Nest derives every `operationId` from the class name, so a split
would silently rename B03's two published operations.

### Request

```jsonc
// POST … /attempts
{ "code": "042315" }   // exactly ^[0-9]{6}$, strict, string not number
```

`.strict()` refuses everything else by construction — no contact, purpose,
customerId, contactPointId, sessionId, expiry or limit override. The value is a
**string** so a leading zero survives; a JSON number would silently turn one in
ten valid codes into a guaranteed mismatch. The platform Zod pipe maps a bad
body to `{ field, code, message }` from a closed set and never echoes the
received value, so a malformed code cannot come back inside its own error.

`GET` takes no body.

### Response

Both operations answer with one component,
`VerificationChallengeStatusResponse`:

```jsonc
{ "challengeId": "…", "state": "VERIFIED", "expiresAt": "2026-08-14T09:10:00.000Z" }
```

Absent by contract: code, digest, contact (normalized, display or masked),
purpose, customer id, contact-point id, session id, attempt count or history,
notification/intent/outbox state, policy values.

### Refusals

| Condition | Status | Public meaning |
|---|---|---|
| Malformed body or id | 400 | platform pipe |
| Wrong code, budget remaining | 422 | `That code is not correct.` |
| Unknown id, terminal, expired, replayed | 422 | `That verification challenge can no longer be answered.` |
| Budget spent (challenge now `FAILED`) | 429 | `Too many incorrect codes. Please request a new one.` |
| Identity not resolvable | 422 | `That verification could not be completed.` |
| Policy unpublished/invalid, or a second lost identity race | 503 | `Verification is temporarily unavailable.` |
| `GET` unknown id | 404 | the delivered public not-found precedent |

Unknown id and closed challenge share one 422 class, so the shape of a refusal
cannot confirm that a guessed id is real. Wrong-code and closed are separated
because the client's next step genuinely differs, and both are facts about the
caller's own challenge — never about who owns the destination.

---

## E. Attempt state machine

One transaction per pass, in this order:

```text
1  find the challenge (unlocked) — only to learn which target to lock
2  lockTarget(kind, value, purpose)          — the delivered B03 advisory lock
3  re-read under the lock; status !== ISSUED → NOT_ANSWERABLE, nothing written
4  now >= expiresAt →  append EXPIRED_AT_ENTRY
                       expireStale → ISSUED → EXPIRED
                       audit verification.challenge.expired
                       return NOT_ANSWERABLE            (commit)
5  spent = countAttempts(challenge)
6  spent >= policy.maxAttempts → failChallenge, audit, LOCKED; no comparison
7  verifySecretDigest(pepper, code, findCodeDigest(challenge))
8  mismatch → append MISMATCH
9            spent + 1 >= maxAttempts → failChallenge → FAILED, audit, LOCKED
10 match   → append MATCH → completeChallenge (guarded) → VERIFIED
             SUBMISSION → APP4-B02 in this same transaction
11 audit verification.challenge.verified
12 commit
```

**Refusals are returned, not thrown.** A `MISMATCH` row, an `EXPIRED_AT_ENTRY`
row and a terminal transition are durable evidence written on paths the caller
experiences as failure; throwing would roll back exactly the record that makes
the attempt budget real, and the fifth guess would be free forever. The
controller converts the returned outcome into a status *after* the transaction
has closed. Only a failure whose transaction must be undone travels as an error.

Expiry is checked **before** the digest is read, so a correct code submitted at
or after `expires_at` never reaches the comparison. `now >= expiresAt` matches
`expireStale`'s `expires_at <= now` and the inverse of `resolveOpen`'s
`expires_at > now`, so no row can be neither live nor sweepable.

---

## F. SUBMISSION identity completion

`ResolveOrCreateVerifiedCustomer.resolve(evidence)` is called from inside the
attempt transaction. `TransactionManager` joins rather than nesting, so
challenge consumption and identity resolution are one atomic act: a committed
`VERIFIED` without its customer is not a representable state, and the suite
asserts it after every path.

### The evidence is representable — §30.1 does not apply

`VerifiedContactEvidence` requires a `NormalizedContact`, which cannot be built
by hand. `challenge-verified-evidence.ts` therefore passes the challenge's own
`normalized_value` back through the **same** `APP4-P01` normalizer that produced
it and accepts the result only if normalization is a fixed point on it. Nothing
is fabricated:

- `contact` — the P01 normalizer's own output for the challenge's target;
- `display` — the canonical value. A challenge never captured an as-entered
  form (B03 persists the normalized target only, deliberately), so the canonical
  value is the honest display value: it is the address possession was proven
  for. Inventing a prettier one would put a string into a PII column no caller
  ever typed.
- `verifiedAt` — the completion instant, so the customer's immutable
  `verified_at` and the challenge's cannot disagree;
- `verifiedSource` — `VERIFICATION_SUBMISSION`, a bounded uppercase reference
  matching `isWellFormedVerifiedSource`. Never the challenge id, which would
  dangle once the transient family is TTL-deleted.

A row whose stored value is not its own canonical form yields no evidence and
the whole transaction is refused (`IDENTITY_NOT_RESOLVABLE`) rather than
registering an identity under a value CST-005 reads differently.

**No replacement contact is accepted from the request**, which carries a code
and nothing else, and nothing is re-normalized through a second implementation.

Proven end-to-end: one `MATCH`, `VERIFIED`, exactly one `customers` row, one
active verified contact point, `is_primary = true`,
`verified_source = VERIFICATION_SUBMISSION`, and a phone target linked as E.164
rather than the trunk-zero form the caller typed.

---

## G. STEP_UP evidence

`purpose = STEP_UP` appends `MATCH`, completes the challenge `VERIFIED`, and
stops. The suite proves that after completion:

- `hasRecentCompleted('EMAIL', …, 'STEP_UP', notBefore) === true`;
- `customers` and `customer_contact_points` are both empty;
- `secure_access_grants` is empty;
- no Custom Request, quotation, design or payment row is touched (B04 imports
  none of those modules, and the checker asserts the absence);
- `hasRecentCompleted(… 'SUBMISSION' …)` is `false` for the same window — the
  purpose is part of the question, so one cannot substitute for the other.

The reverse is proven too: a verified `SUBMISSION` leaves
`hasRecentCompleted(… STEP_UP …)` false. `StepUpWindow` is **not** implemented
here; it is `APP4-B05`'s.

The attempt body carries no purpose. Purpose comes only from the persisted
challenge.

---

## H. Concurrency

| Race | Arbiter | Result |
|---|---|---|
| Two concurrent correct submissions | `lockTarget` serializes; `completeChallenge` is a guarded CAS | one `VERIFIED`, one `MATCH` row, one customer, one audit row; the loser writes nothing |
| Two wrong answers contending for the last slot (4 prior `MISMATCH`) | same lock; budget re-derived under it | exactly `maxAttempts` durable attempts, never a sixth; challenge `FAILED` |
| Verify vs expire at the same instant | same lock; attempt and B03 issue-sweep contend | `EXPIRED` wins, no customer, at most one attempt and it is `EXPIRED_AT_ENTRY` |
| B02 `CONCURRENT_VERIFICATION_LOSS` | bounded two-pass retry | one canonical customer, one attempt row |

No process-local mutex exists, and the checker refuses one: a JavaScript guard
would be silent about the second API replica.

**On the identity-race test.** A genuine CST-005 loss is unreachable through two
attempts — CST-007 permits one open `SUBMISSION` challenge per target and every
attempt for that target queues behind the same advisory lock. The loss is
therefore injected at the exact seam that can raise it (the B02 call, via
`jest.spyOn`), and everything downstream stays real: the rollback, the second
pass, the arbiter, and the single customer it resolves. This is disclosed rather
than presented as a raced test. Both directions are proven: one loss recovers to
one canonical customer with one attempt row; a permanent loss ends bounded as
`VERIFICATION_CONFLICT_UNRESOLVED` with the challenge still `ISSUED`, no
attempts, no customer and no audit row — never `VERIFIED` alone.

---

## I. Audit evidence (INV-14)

`VerificationOutcomeAuditRecorder` writes one row per **terminal outcome**:

| Action | When | Actor | `failure_code` |
|---|---|---|---|
| `verification.challenge.verified` | a correct answer consumed the challenge | `CUSTOMER` (the identity just established) for SUBMISSION; `SYSTEM` for STEP_UP | — |
| `verification.challenge.locked` | the budget was spent | `SYSTEM` | `ATTEMPT_LIMIT_REACHED` |
| `verification.challenge.expired` | an answer arrived at/after expiry | `SYSTEM` | `EXPIRED_AT_ENTRY` |

A wrong code below the cap writes no audit row:
`contact_verification_attempts` is already the append-only ledger of every
guess, and duplicating each into `audit_events` would put the noisiest path in
the system into the trail an operator reads for business actions.

`target_kind` is `CONTACT_VERIFICATION_CHALLENGE`, added to the application's
`AUDIT_TARGET_KINDS` guard. **This is not a schema change**: `target_kind` is
open text with no CHECK by DB4 design and REL-103 gives the polymorphic target
no foreign key, which is exactly why an audit row can outlive the transient row
it describes. `APP2-B03` (`PRODUCT`) and `APP3-B03` (`DESIGN_TEMPLATE`) set the
precedent, and neither needed a migration.

The actor choice follows the delivered `StaffAuditWriter.loginFailed`
precedent: `ANONYMOUS` is not persistable (CST-072), and inventing a customer id
for a pre-identity outcome would file evidence against a customer that does not
exist.

`summary` is `{ purpose, contactKind, outcome }` — bounded, server-owned tokens.
Never the submitted code, the digest, the normalized or display contact, a mask,
the raw body, a SQLSTATE or PostgreSQL `DETAIL`. Correlation is
`RequestContextService.requireRequestId()`, the same source every audited use
case in the repository uses.

---

## J. Status endpoint

`ReadVerificationChallengeStatus` has no `TransactionManager`, reaches no
writing repository method, and issues one query. Effective expiry is **computed**:
a persisted `ISSUED` row past `expires_at` reads `EXPIRED` with no durable
mutation, because it is already unanswerable and telling a client to keep
waiting is the one thing this endpoint exists to prevent. The physical
`ISSUED → EXPIRED` transition stays with the B03 issue path and the B04 attempt
path.

Proven for every LC-02 state — `ISSUED`, `VERIFIED`, `FAILED`, `CANCELLED`,
swept `EXPIRED`, and persisted-`ISSUED`-but-time-expired — plus: two reads of a
time-expired row leave `status = 'ISSUED'`, zero attempts and an unchanged audit
count. Unknown id → 404.

---

## K. OpenAPI and generated client

| | entry | final |
|---|---|---|
| paths | 39 | **41** |
| operations | 44 | **46** |
| schemas | 86 | **88** |

New paths: the attempt and status routes. New schemas:
`SubmitVerificationAttemptBody`, `VerificationChallengeStatusResponse`. Delta is
exactly **+2 operations**, as required.

```text
openapi.generated.json sha256   352126672c83f7528ac182eb75f57b33e0de371a7924a22a33f314a4c146ab6a
api-client tree hash            07c1dd3927b52bb10863ef14ca071f0a46396ef899308d9c0fb8b417542187ee
```

Generated artifacts were produced by their canonical commands only; nothing was
edited by hand. The client diff is +85 lines across the two generated files.

---

## L. B03 checker reconciliation

The accepted B03 gate asserted that no attempt or status route existed anywhere.
That was correct at B03's closure and became stale the moment B04 published
both. Four narrow changes, none of which weakens a B03 assertion:

1. **`ATTEMPT_PATH` / `STATUS_PATH` are named and exported.** The rule is now an
   exact **four-path world** rather than "tolerate anything B04-shaped": an
   unauthorized fifth verification route, a `/verification/attempts` alias, a
   renamed issue path and a third method on any of the four all still fail.
2. **Per-path verb assertion.** Issue, resend and attempt must each publish
   exactly one `post`; status exactly one `get`. B03's pair is asserted by name
   *and* by verb, which the old aggregate count did not do.
3. **A B05 guard replaces the removed B04 guard**, so the gate still refuses a
   grant/secure-link/step-up route — it did not simply lose a prohibition.
4. **`B04_FILES` exempts B04's own sources from the owned-source sweep**, as
   `B03_APPLICATION_FILES` already did for B02's identity service. It is an
   explicit file list, never a pattern, and `checkExclusionIsReal` fails if any
   entry stops existing, so it cannot decay into a hole.
5. **`checkSharedController` is new.** The controller is shared, so it left the
   sweep — and its B03 obligations are asserted directly instead of dropped:
   the class name (every `operationId` derives from it), the route prefix, both
   B03 handlers, B03's **own** guard mapping through `verificationFailureResponse`
   (matched inside `private async guard(`, so B04's guard cannot satisfy it),
   and the absence of sealing, minting, digesting and customer-repository
   access.

Six new mutation tests cover the reconciliation; two stale ones were retargeted
from "B04 must not exist" to "a fifth operation / an uncanonical attempt route
must not exist". `APP4-B03-COMPLETION-REPORT.md` was **not** edited.

---

## M. B04 contract checker

`tools/check-app4-b04-contract.mjs` (+ `.test.mjs`). It reads the generated
OpenAPI document and real source with comments stripped — never prose, never a
report. All 26 required assertions are present, grouped into 12 checks:

surface (1, 2, 3, 4, 25, 26) · attempt body (5, 6, 7) · responses (8, 9, 10) ·
verifier reuse (11, 12) · budget (13, 14, 16) · state machine (15, 23) ·
purpose effects (17, 18) · issuance/delivery (19, 20) · audit (22) ·
status read-only (24) · schema/migrations (21) · owned files exist.

53 mutation tests pass, each breaking exactly one ruling in a throwaway copy —
`===` on the digest, a `?? 5` fallback, an `attemptCount` field, a `WRONG_CODE`
outcome, a swept status GET, a disclosed `customerId`, a grant import, an
unbounded retry, a lost fixed-point check. The `reads code rather than prose`
case proves the gate does not fail on the files' own documentation of what they
deliberately do not do.

---

## N. Focused tests

23 tests across three suites, all passing, against a disposable PostgreSQL with
every migration applied and the real module graph (real controller wiring, real
repository, real `TransactionManager`, real audit trail). Only the clock and the
code minter are substituted — the two seams `APP4-B03` already substitutes.

| Suite | Covers |
|---|---|
| `verification-attempt.integration.spec.ts` | correct SUBMISSION (one MATCH, VERIFIED, one customer, one verified active primary contact, B04 audit, no intent/outbox/grant, no plaintext anywhere); phone E.164 linking; replay rejected with nothing duplicated; second challenge resolves onto the existing identity; mismatch below cap stays ISSUED; cap-reaching mismatch → FAILED; sixth submission with the *correct* code appends nothing; expiry at entry; repeated expired call appends nothing; STEP_UP evidence and `hasRecentCompleted`; SUBMISSION ≠ STEP_UP; unknown challenge writes nothing |
| `verification-status.integration.spec.ts` | ISSUED, VERIFIED, FAILED, CANCELLED, swept EXPIRED, persisted-ISSUED-time-expired; GET writes nothing |
| `verification-attempt-concurrency.integration.spec.ts` | concurrent correct submissions; last-slot mismatch race; verify-vs-expire; B02 loss recovery and its bounded exhaustion |

No real-time waits: every temporal claim is made by moving the injected clock.

**§20 — no plaintext evidence.** With a scripted code, the suite sweeps
`contact_verification_challenges`, `contact_verification_attempts`,
`customers`, `customer_contact_points`, `notification_intents`,
`outbox_events` (minus the ciphertext, which is where the code is *supposed* to
be), `audit_events` and `background_job_attempts`. The code appears in none of
them. No submitted code value appears in this report.

---

## O. Validation ledger

**No full regression/test chain was run.**

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="verification-attempt\|verification-status" --runInBand` | 3 suites, **23 passed** |
| 2 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="verification-and-grants" --runInBand` | 1 suite, **20 passed** (run because the repository port and adapter changed) |
| 3 | `pnpm --filter @embroidery/api exec tsc --noEmit` | exit 0 |
| 4 | `pnpm --filter @embroidery/api openapi:generate` | 41 paths / 46 operations / 88 schemas |
| 5 | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 6 | `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `07c1dd39…` |
| 7 | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| 8 | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | exit 0 (smallest client typecheck) |
| 9 | `node tools/check-app4-b04-contract.mjs` | pass |
| 10 | `node --test tools/check-app4-b04-contract.test.mjs` | **53 passed** |
| 11 | `node tools/check-app4-b03-contract.mjs` | pass |
| 12 | `node --test tools/check-app4-b03-contract.test.mjs` | **47 passed** |
| 13 | `pnpm --filter @embroidery/api exec eslint src/modules/customer src/modules/audit/domain/repositories/audit-event.repository.ts` | exit 0 |
| 14 | `npx prettier --write` on the changed tools and API sources, then `--check` | formatted; clean |
| 15 | `node tools/check-report-secrets.mjs` | see §Q |
| 16 | `git diff --cached --check` | see §Q |

Deliberately **not** run: full API Jest, full CustomerModule/persistence suite,
worker/W01, B01/B01-C1, B02's full suite, B03 issue/resend integration (its
business source is unchanged), full P01 suite, frontend/Playwright, DB
manifest/migration regression, Figma/G01 checker, SonarQube, repo-wide
build/typecheck/lint, and any aggregate chain.

No successful command was repeated except where a covered file changed
afterwards: the API typecheck, both checkers, both checker test suites and the
B04 integration suite were re-run once after Prettier reformatted source they
read, because a formatting change moves the exact text those gates match. One
checker-test anchor and one ESLint finding were fixed in that pass.

`tools/*.mjs` are not covered by an ESLint configuration in this repository
(there is no root `eslint.config.*`), so item 13 is the whole of the scoped
lint surface.

---

## P. Files changed

### Added — runtime

```text
apps/api/src/modules/customer/domain/verification/verification-attempt-outcome.ts
apps/api/src/modules/customer/domain/verification/verification-attempt-http.errors.ts
apps/api/src/modules/customer/domain/verification/challenge-verified-evidence.ts
apps/api/src/modules/customer/application/submit-verification-attempt.use-case.ts
apps/api/src/modules/customer/application/read-verification-challenge-status.query.ts
apps/api/src/modules/customer/application/verification-outcome-audit.recorder.ts
apps/api/src/modules/customer/presentation/schemas/verification-attempt.request.ts
apps/api/src/modules/customer/presentation/schemas/verification-challenge-status.response.ts
```

### Added — tests and tooling

```text
apps/api/src/modules/customer/tests/integration/verification-attempt-context.ts
apps/api/src/modules/customer/tests/integration/verification-attempt-queries.ts
apps/api/src/modules/customer/tests/integration/verification-attempt.integration.spec.ts
apps/api/src/modules/customer/tests/integration/verification-status.integration.spec.ts
apps/api/src/modules/customer/tests/integration/verification-attempt-concurrency.integration.spec.ts
tools/check-app4-b04-contract.mjs
tools/check-app4-b04-contract.test.mjs
```

### Modified

```text
apps/api/src/modules/customer/presentation/public-verification.controller.ts   (+2 handlers)
apps/api/src/modules/customer/customer.module.ts                               (3 providers)
apps/api/src/modules/customer/domain/repositories/verification-challenge.repository.ts   (findCodeDigest)
apps/api/src/modules/customer/infrastructure/persistence/drizzle-verification-challenge.repository.ts
apps/api/src/modules/audit/domain/repositories/audit-event.repository.ts       (+1 target kind)
tools/check-app4-b03-contract.mjs                                              (reconciliation)
tools/check-app4-b03-contract.test.mjs                                         (reconciliation)
packages/contracts/openapi/openapi.generated.json                              (generated)
packages/api-client/src/generated/embroidery-api.ts                            (generated)
packages/api-client/src/generated/embroidery-api.schemas.ts                    (generated)
```

**No migration, no schema module, no root script, no `.env` write.** Migrations
remain 34.

### File-size governance

Every runtime source file is within the 400-line hard limit; the largest is the
shared controller at 385 (above the 300-line review threshold, and deliberately
not split because splitting renames B03's published `operationId`s — flagged for
the reviewer). Every test file is within 600; the largest is 318.

Two tooling files exceed the 450-line **soft** cap:
`tools/check-app4-b04-contract.mjs` (580) and, after reconciliation,
`tools/check-app4-b03-contract.mjs` (587, from 455 at entry). Disclosed rather
than corrected, per §27's instruction not to create a correction for tooling-size
trivia: the length is 26 assertions plus the reasoning each rule needs to survive
its next reader, and the B03 file was already over the soft cap at entry. The
test files (553 and 506) are within the 700-line cap.

---

## Q. Git evidence

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `d8e3d96` |
| Implementation commit | `7edde3a` — `feat(app4): verify submitted codes and read challenge status` (25 files, +3861 / −28) |
| Evidence commit | this report, committed immediately after it |
| Pushed | **no** |
| `git diff --cached --check` | clean (exit 0), run once over the staged set |
| `node tools/check-report-secrets.mjs` | passed — 455 documents, 2787 tracked files |
| Working tree after both commits | clean |

---

## R. Next checkpoint

```text
APP4-B05
```

Secure grant issuance, reissue, revocation and the step-up window — no public
surface. It is **not** started here: B04 issues no grant, and
`hasRecentCompleted` is left as the readable evidence B05 will consume.
