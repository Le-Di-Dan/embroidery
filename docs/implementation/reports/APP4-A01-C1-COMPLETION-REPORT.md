# APP4-A01-C1 — Production notification-to-Customer binding · Completion report

## A. Verdict

```text
PASS
APP4-A01 = PASS_AFTER_C1
```

`FU-APP4-A01-INTENT-BINDING-COVERAGE-01` is closed. The production
`B05 → B01` path now writes `notification_intents.recipient_contact_point_id`,
so `APP4-A01`'s Customer-filtered notification region returns real
notifications instead of always reporting "no delivery failure".

No schema, no migration, no endpoint, no OpenAPI or generated-client change.
None of the three Product Owner authority rulings was reopened.

**No full regression/test chain was run.**

---

## B. Root cause

The defect was not in any rule — it was in what the evidence could see.

`notification_intents.recipient_contact_point_id` existed (G-DB7-48) and
`CreateIntentInput.recipientContactPointId?` accepted it, but **no caller ever
supplied one**: `NotificationRequest` had no such field, so `APP4-B01`'s intake
could not forward one even if a caller had it. `APP4-B08`'s Customer filter
joined through that column correctly, and `APP4-A01`'s panel queried it
correctly, and both were provably right over a column nothing wrote.

A01's own integration proof wrote the binding with `UPDATE … SET
recipient_contact_point_id = …` and then asserted the filter honoured it. Every
assertion passed. A fixture that supplies the fact under test can only prove the
consumer; it says nothing about whether a producer exists. That is the exact
shape of this gap, and §I records how the gate now refuses it.

`APP4-B05`'s `SecureGrantNotifier` already resolved the customer's primary
verified contact point — it held the whole `ContactPoint`, `id` included — and
then passed only its `normalizedValue` onward. The missing link was one field
wide.

---

## C. §17 stop conditions — checked before editing

| Condition that would have stopped C1 | Verified |
| --- | --- |
| B05's delivery-target read exposes no stable persisted Contact Point identity | **False** — `resolveTarget` returns the full `ContactPoint`, whose `id` is the persisted primary key |
| Obtaining it needs a schema change | **False** — column and optional input already existed |
| …or a broad `CustomerRepository` redesign | **False** — `listContactPoints` unchanged, no new method |
| …or caller-controlled recipient selection | **False** — the id comes from the same server-side resolution as the address |
| …or raw/masked-recipient inference | **False** — nothing reads a mask |

No stop condition applied.

---

## D. B01 — one optional field, forwarded

`NotificationRequest` gains:

```ts
readonly recipientContactPointId?: string | undefined;
```

`RequestNotificationUseCase` forwards it, conditionally spread, to the existing
`createIdempotent` input. B01 resolves nothing: it imports no customer
repository and would not read this field to choose a destination — delivery
still goes to `normalizedRecipient`.

Three places it deliberately does **not** reach, each now gated (§I):

- **the intent key.** The load-bearing one. Adding an ownership reference to the
  idempotency tuple would split one business decision into two intents the
  moment callers started supplying the field — a second copy of the same
  credential, in production only.
- **`params`.** Still the closed reference union, secret-free by construction.
- **the sealed envelope.** Untouched; B01 still seals exactly what it sealed.

**It stays optional, globally.** A verification code delivered before a Customer
exists has no contact point to name, and §4 forbids inventing one or creating a
Customer to have one. A test asserts that path still writes `NULL` — the
truthful answer, not a defect.

---

## E. B05 — the server-resolved contact point

`SecureGrantNotifier.notify` passes `recipientContactPointId: target.id` — the
same `ContactPoint` `resolveTarget` just selected as the authorized destination.

The redirect surface is unchanged and unopened: `NotifyGrantInput` still takes a
`customerId` and no destination, and `IssueGrantCommand` still takes
`notify?: boolean` and no recipient. A caller holding a grant target still
cannot say where the link goes — it now cannot say who owns the record either.

Both §6 flows are covered by one seam: `issue` and `reissue` both mint through
the private `mint(...)`, which is the sole `notify` call site.

---

## F. Production-path evidence

`secure-grant-notification-binding.integration.spec.ts` — **6 passed**. Nothing
in it writes the binding; the intents are created by `SecureGrantIssuer` with
`notify: true`.

| Claim | Evidence |
| --- | --- |
| Notified issue binds to the customer's own primary contact point | `recipient_contact_point_id === target.contactPointId` |
| The binding cost nothing | `params` is grant-reference-only; the serialized params contain neither the address, the contact-point id nor the token; mask still P01's and ≠ the address; exactly one intent and one outbox event |
| Reissue binds the same way | both intents carry the same contact point; the second references the replacement grant |
| Pre-Customer verification stays unbound | `recipient_contact_point_id` is `NULL` |
| The real B08 filter returns the production-created intent | `listForAdmin({ customerId })` → 1 row, correct binding |
| Same mask, no binding, still excluded | two intents share `recipientMasked`; the filter returns only the bound one |
| Terminal failure stays visible | `recordAttempt`/`markFailed`/`markDeadLetter` — the methods W01 calls — then `listForAdmin({ customerId, status: 'FAILED' })` returns it with its attempt timeline |

**The suite was mutation-checked against the pre-C1 world.** With
`recipientContactPointId: target.id` removed, **5 of 6 fail**. The survivor is
the pre-Customer `NULL` case, which must pass either way — exactly the expected
signature.

---

## G. Replay binding evidence

`admin-notification-replay-binding.integration.spec.ts` — **1 passed**. The
origin is bound through the **real intake** (the fixture now threads
`recipientContactPointId` into `RequestNotificationUseCase`, not into the
column).

```text
bound FAILED origin → Admin replay → outcome CREATED
replay.recipient_contact_point_id === origin.recipient_contact_point_id
origin still FAILED, still bound
Customer-filtered query now returns both
```

B08 already copied the field; what was never provable is that it *mattered*,
because no production intent had one to copy. Replay idempotency, the ciphertext
copy and `DEAD_LETTER` semantics are untouched, and the full replay matrix was
not re-run.

---

## H. Checker reconciliation

**B01** — five new rules, five new mutation tests, all biting: the contact point
must not enter `deriveNotificationIntentKey` (asserted on both the derivation
module and the call site), must not enter `params`, must not be sealed into the
envelope, must stay optional, and B01 must still import no customer repository.
The pre-existing union-scoped rule already tolerated the field correctly.

**B05** — a new invariant asserting `recipientContactPointId: target.id`
specifically, so a binding taken from anywhere but the resolved target fails;
plus rules that the primary-verified resolution still happens here, that
`NotifyGrantInput` and `IssueGrantCommand` accept no contact point, recipient or
address, and that the binding is never derived from a mask. Five new mutation
tests. Its stale `EXPECTED_OPERATIONS` was also moved 52 → 53 — the count went
stale when the already-approved A01 resolver landed, and a gate whose count is
permanently red asserts nothing about B05 growing a surface.

**A01** — strengthened where it was weakest. The old gate proved the consumer
and would have passed a screen that was empty in production forever. It now
asserts, by name and only for the one producer its region depends on, that the
grant notifier binds and that the intake contract carries the optional field.

**A01 test harness — a real defect found and fixed here.** The two new A01 cases
initially passed *vacuously*: `rootWith` never copied `apps/api/src`, so the
producer file was simply missing from every throwaway root and the rules fired
unconditionally. The harness now copies the two named backend files, and a
no-op mutation was confirmed to make the test **fail** — proving the case
depends on the mutation rather than on an absent file.

**B08's filter checker needed no change**; its source facts did not move.

---

## I. Pre-existing failures, reported not adopted

Two gates were already red at `HEAD` before C1, verified by running them against
a pristine `git worktree` of `HEAD` and diffing the failure sets — **byte
identical** before and after:

- `check-app4-b01.mjs` — **7 failures**, all "restates the policy value" in
  `secure-grant-policy.ts`, `secure-link-policy.ts` and
  `verification-challenge-policy.ts`. Files C1 never touched. Its test suite is
  correspondingly red (**4 failures**, the "pristine tree passes" assertions),
  also identical before and after; C1 took it from 44→49 tests and 40→45 passes.
- `check-app4-b05.mjs` — **1 failure**, the stale operation count. This one C1
  *did* fix, because it was editing that gate anyway and a permanently-red count
  gate is a gate nobody reads.

The B01 debt is left alone deliberately: it belongs to another checkpoint, B01
has already used its correction (§1), and repairing it here would be scope C1
was not given. It is worth an owner.

---

## J. Validation ledger

| # | Command | Result |
| --- | --- | --- |
| 1 | `jest secure-grant-notification-binding` | 6 passed |
| 2 | mutation check — same suite with the binding removed | 5 failed, 1 passed (expected) |
| 3 | `jest admin-notification-replay-binding` | 1 passed |
| 4 | `tsc --noEmit` (API) | clean (after fixing an `interface`→`type` index-signature error `jest` had tolerated) |
| 5 | `check-app4-b05` + tests | pass; 60 tests |
| 6 | `check-app4-b01` + tests | 7 pre-existing failures unchanged; 49 tests, 45 pass, same 4 pre-existing |
| 7 | `check-app4-a01` + tests | pass; 33 tests |
| 8 | `check-app4-b08-contract` | pass (unchanged, confirming no source fact moved) |
| 9 | scoped `eslint` (6 changed API files) | clean |
| 10 | scoped `prettier` | clean |
| 11 | `check-report-secrets` | pass |
| 12 | `git diff --cached --check` | clean |

Not run, deliberately: full B01/B05/B08 runtime suites, full A01 component and
browser suites, worker, S01/S02, OpenAPI generation, generated-client
generation, DB regression, Figma checker, G01, Sonar, repo-wide chains.

**No full regression/test chain was run.**

---

## K. Files changed

```text
apps/api/src/modules/notification/domain/notification-request.ts
apps/api/src/modules/notification/application/request-notification.use-case.ts
apps/api/src/modules/customer/application/secure-grant.notifier.ts
apps/api/src/modules/customer/tests/integration/secure-grant-notification-binding.integration.spec.ts  (new)
apps/api/src/modules/notification/tests/integration/admin-notification-replay-binding.integration.spec.ts  (new)
apps/api/src/modules/notification/tests/integration/admin-notification-context.ts
tools/check-app4-b01.mjs + .test.mjs
tools/check-app4-b05.mjs + .test.mjs
tools/check-app4-a01.mjs + .test.mjs
docs/implementation/reports/APP4-A01-C1-COMPLETION-REPORT.md  (new)
docs/implementation/reports/APP4-A01-COMPLETION-REPORT.md      (correction note only)
```

Three runtime source files changed, totalling one new optional field and one new
argument.

---

## K.1 Git evidence

```text
257f17a  fix(api): bind production notifications to their Customer
```

One commit, carrying the runtime change, both focused suites, the three
reconciled checkers with their mutation tests, and this report. Not pushed, not
amended, not squashed.

Its position in the A01 history:

```text
257f17a  fix(api): bind production notifications to their Customer   ← APP4-A01-C1
9893dcc  docs(app4): record Admin customer access support evidence
97d11a9  feat(admin): implement APP4 customer access support
bc259c2  design(app4): amend the A01 frames for the authority unblock
96a7c8d  feat(api): apply the APP4-A01 authority unblock to B07 and B08
1b0e3e4  docs(app4): record APP4-A01 authority block
```

The three commits below `9893dcc` are the Product Owner authority unblock, which
is **not** a correction and is not counted as one. `257f17a` is the single and
final A01 correction; there is no `APP4-A01-C2`.

A later documentation-only commit reconciles the canonical A01 report with this
one — correction count, the superseded §E limitation and the closed follow-up.
It changes no runtime source.

---

## L. Report secret boundary

No raw contact, verification code, token, digest, ciphertext or session
credential appears here. Fixture addresses referenced in passing are synthetic
and generated per run.

---

## M. Status and next checkpoint

```text
APP4-A01   = PASS_AFTER_C1
APP4-A01-C1 = COMPLETE
APP4-E01   = READY — NOT STARTED
FU-APP4-A01-INTENT-BINDING-COVERAGE-01 = CLOSED
```

`APP4-E01` can now prove what it must: a terminal delivery failure raised by the
real B05/B01/W01 path is visible on the Admin support screen and replayable from
it. It was not started, and neither was `APP4-X01` or `APP5`–`APP7`.

One follow-up is raised, owned by nobody yet:

- `FU-APP4-B01-POLICY-GATE-STALE-01` — `check-app4-b01.mjs` has 7 pre-existing
  "restates the policy value" failures and 4 correspondingly red self-tests,
  unrelated to C1 and present before it (§I).
