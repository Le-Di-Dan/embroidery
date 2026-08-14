# APP4-B05 — Secure Grant Issuance, Reissue, Revocation and Step-Up Window — Completion Report

## A. Verdict

**PASS.**

`SecureGrantIssuer` is the one internal capability a future APP5 submission calls
to mint a customer's credential for a request. It mints through the `APP4-P01`
issuer, persists only the peppered digest, sets expiry from the published
`secure_grant` policy, and returns the raw token exactly once to its in-process
caller. It publishes **zero HTTP endpoints** — the operation count is unchanged
at 46 — and adds no controller, DTO, schema, migration or generated client.

Business reissue rotates: a new grant id, a new token, a new digest, a new
expiry, and — when notification is requested — a new intent, a new outbox event
and a **new envelope**. The source becomes `REVOKED` with the canonical
`superseded` reason and its `superseded_by_grant_id` points at the replacement.
Nothing is copied from the old grant, which is what keeps business reissue
distinct from `APP4-W01` transport retry and `APP4-B08` Admin replay
(`ADR-APP4-001` PO-10). Two reissues that hold the same source end with exactly
one `ACTIVE` replacement, arbitrated by the database — the `status = 'ACTIVE'`
predicate on the revoke `UPDATE` is a compare-and-set, and there is no mutex.

Revoke demands a reason, moves `ACTIVE → REVOKED`, audits, mints nothing and
offers no path back. `StepUpWindow` answers one boolean over B04's
`hasRecentCompleted`, pinned to `STEP_UP`, and authorizes nothing.

**A `BLOCKED_BY_AUTHORITY` condition was reached during the mandatory
pre-implementation audit and resolved before implementation** — §26.8,
`STOREFRONT_ORIGIN_AUTHORITY_ABSENT`. See §C.1. It was lifted by an approved
narrow Product Owner authority unblock, recorded as IMP-D050 and
`ADR-APP4-001` §11.0. No other stop condition applied.

**No full regression/test chain was run.**

---

## B. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `5e40eee` (`docs(app4): record APP4-B04 commit evidence`) |
| Working tree at entry | clean |
| Accepted predecessors | P00 `CLOSED_AFTER_MANDATORY_DIRECTIVE`, G01 `PASS`, D01 `PASS`, P01 `PASS_AFTER_C1`, B01 `PASS_AFTER_C1`, W01 `PASS`, B02/B03/B04 `PASS` |
| Published operations at entry | 46 — unchanged at exit |
| Migrations at entry | 34 — unchanged at exit (`NO_APP4_MIGRATION` holds) |
| Endpoints delivered | **0** |
| Design | `NONE` — no Figma artifact, no registry entry, no UI |
| APP5 | not implemented; `custom_requests` rows in B05 tests are fixture scaffolding only |

---

## C. Authority / repository audit

Every path below was read before any edit.

### C.1 The one blocking finding, and its resolution

`ADR-APP4-001` §11 and its §14.1 fact table state the link form as
`https://<storefront-origin>/truy-cap#t=<opaque-token>`. The **route** is locked
(IMP-D049 PO-05, asserted by `tools/check-app4-g01-authority.mjs`). The
**origin** was an unresolved placeholder, and the audit found no canonical
authority for it anywhere:

| Candidate | Why it may not serve |
|---|---|
| `STOREFRONT_HOST` | bare hostname, no scheme; a dev-gateway routing name |
| `INTERNAL_API_BASE_URL` | the API's address on the compose network |
| `DESIGN_SESSION_ALLOWED_ORIGINS` | a CSRF allowlist — plural, owned by APP3 |
| `STAFF_ALLOWED_ORIGINS` | a CSRF allowlist — plural, owned by APP1 |

§13 and §26.8 both forbid hard-coding a domain, so this was reported as
`BLOCKED_BY_AUTHORITY — STOREFRONT_ORIGIN_AUTHORITY_ABSENT` **before**
implementation began.

It was resolved by an **approved narrow Product Owner authority unblock**: a
single canonical variable `STOREFRONT_PUBLIC_ORIGIN`, fail-closed, no default,
tokens only in fragments; no separate G-checkpoint. Recorded as **IMP-D050** and
as the addendum **`ADR-APP4-001` §11.0**, plus three §14.1 facts
(`secure_link.originConfig`, `originDefault`, `originRenderedBy`). No production
domain appears in source; the only example values are in tests.

### C.2 Delivered state the checkpoint builds on

| Question | Finding |
|---|---|
| Grant states | `ACTIVE`, `EXPIRED`, `REVOKED` (LC-03, `SECURE_ACCESS_GRANT_STATES`) |
| Transition methods | `issue`, `revoke(id, reason)`, `supersede(id, replacementId, reason)` — all `@requiresTransaction` |
| `resolveActive` | `(tokenHash, {customerId, customRequestId, scopeKind}, now)`; all four guards plus `expires_at > now` are predicates of **one** query, so a wrong token, wrong customer, wrong request and wrong scope are indistinguishable (G-DB7-38/39/40) |
| Reissue lineage field | **No `reissued_from_grant_id` column exists.** The delivered field is `superseded_by_grant_id` (REL-011, self-FK, nullable) — a *forward* pointer on the old row, set by `supersede`. B05 uses it; the audit summary carries the backward view as `reissuedFromGrantId`. |
| CST-008 | `uq_secure_access_grants__token_hash` → catalogued code `GRANT_TOKEN_COLLISION` |
| CST-009 | `uq_secure_access_grants__customer_request__active` (partial, `WHERE status = 'ACTIVE'`) → `GRANT_ALREADY_ACTIVE` |
| Revoke-reason CHECK | `ck_secure_access_grants__revoke_reason_required` — `status <> 'REVOKED' or revoke_reason is not null` |
| Policy key / shape | `secure_grant` → `{ standardTtlSeconds: 604800, stepUpWindowSeconds: 900 }`, published by B01-C1 from `packages/database/seed/app4-policy-configuration.seed.json` |
| Transaction pattern | `TransactionManager.runInTransaction`; a nested call **joins** by default |
| B01 input shape | `RequestNotificationUseCase.request(NotificationRequest)`; `reference` is a closed union already carrying `{ kind: 'SECURE_ACCESS_GRANT', grantId }`, `secretKind` already admits `SECURE_LINK_TOKEN` |
| `hasRecentCompleted` | `(contactKind, normalizedValue, purpose, notBefore) => Promise<boolean>` |
| Fixture path | `apps/api/src/modules/order/tests/integration/order-fixture.ts` — inspected; **not used**, see §N.1 |
| Repository extension required? | **No.** Every method B05 needs was delivered by DB7. Zero changes to the port or the Drizzle adapter. |

W01's outbound path was inspected for a rendering seam: **none existed.** The
adapter received `secret` + `secretKind` and recorded them; no URL was ever
composed. Per §13's ordering, rule 1 did not apply and rule 2 did — the smallest
provider-neutral renderer was added.

---

## D. Internal port contract

```text
SecureGrantIssuer                                    (exported from CustomerModule)
  issue({ customerId, customRequestId, notify? })    → { grantId, expiresAt, rawToken }
  reissue({ customerId, customRequestId, notify? })  → { grantId, expiresAt, rawToken }
  revoke(grantId, reason)                            → void

StepUpWindow                                         (exported from CustomerModule)
  isSatisfied({ contactKind, normalizedValue, now }) → boolean
```

Three properties are structural rather than remembered:

- **No scope parameter.** `REQUEST_ACCESS` is written by the issuer. A parameter
  offering one legal value is an invitation to add a second without an ADR.
- **No recipient parameter.** `notify` is a boolean; `SecureGrantNotifier`
  resolves the destination from the customer's own primary verified contact. A
  caller holding a grant target cannot redirect the link that grants it.
- **`custom_requests` is never written.** The id arrives from the authorized
  caller; the FK RESTRICT is the arbiter and B05 has no create path.

`SecureGrantNotifier`, `SecureGrantAuditRecorder`, `SecureLinkTokenMinter` and
`SecureGrantPolicyReader` are **not** exported — a caller that could reach the
notifier could deliver a token without a grant.

---

## E. Issue

One transaction: validate the customer → read policy → refuse an existing
`ACTIVE` → mint → digest → insert with fixed scope and policy-derived expiry →
audit → optionally hand off to B01 → commit → return the raw token once.

- **Expiry is policy-derived.** `issuedAt + standardTtlSeconds`, asserted against
  the fake clock to the millisecond. LC-03 gains no persisted `EXPIRED`
  transition — `resolveActive` enforces `expires_at > now` on read.
- **A duplicate does not rotate.** `GRANT_ALREADY_ACTIVE`, and the live link the
  customer already holds is untouched. CST-009 remains the arbiter behind the
  early refusal; the insert path classifies its conflict on the catalogued
  **code**, never a SQLSTATE.
- **Fail-closed on policy.** A missing or malformed `secure_grant` refuses and
  writes nothing. There is no fallback constant to observe — the gate proves the
  literals `604800`, `604_800` and `900` appear in no source file.

---

## F. Notification and fragment rendering

`notify: true` puts the grant write and the notification hand-off in **one**
transaction. B05 calls `RequestNotificationUseCase` and never
`sealDeliveryEnvelope`; B01 remains the only sealing seam.

| Sink | Content |
|---|---|
| `secure_access_grants.token_hash` | peppered HMAC only |
| `notification_intents.params` | `{ schemaVersion, reference: { kind: 'SECURE_ACCESS_GRANT', grantId } }` — the closed union, token-free by construction |
| `notification_intents.recipient_masked` | P01 mask, never the normalized destination |
| `outbox_events.payload` outer JSON | `version`, `algorithm`, `iv`, `ciphertext`, `authTag` — asserted to be exactly those five keys |
| envelope plaintext | `secretKind: SECURE_LINK_TOKEN` + the issued token |

**Rendering seam.** No renderer existed, so the smallest provider-neutral one was
added at the worker's outbound boundary:

```text
apps/worker/.../config/storefront-origin.config.ts    validate + normalize the origin
apps/worker/.../config/storefront-origin.provider.ts  lazy, fail-closed handle
apps/worker/.../domain/secure-link.renderer.ts        <origin>/truy-cap#t=<token>
```

Composition happens in the statement immediately before `channel.send`, from the
already-decrypted worker-local token. It is not persisted, not logged, and not
returned upward. A missing or malformed origin yields the additive, **retryable**
class `NOTIFICATION_LINK_ORIGIN_UNAVAILABLE` — returned rather than thrown, so it
settles through the existing evidence path instead of escaping `attempt` after
`beginProcessing` and stranding an intent in `PROCESSING`.

Verification-code delivery is untouched: the renderer is reached only by the
`SECURE_LINK_TOKEN` discriminator, never consults the origin for a code, and a
regression test asserts a code delivery carries no `secureLinkUrl`.

No general template system was created: the renderer returns a URL and has no
body, subject, locale or channel branch.

---

## G. Reissue

| Property | Evidence |
|---|---|
| New grant id | asserted ≠ source |
| New raw token, new digest | asserted ≠ source, both |
| New expiry | asserted strictly later |
| Source terminal | `REVOKED`, `revoked_at` set |
| Canonical reason | `superseded`, at **both** the revoke and the supersede call — the gate asserts the constant at each call site, since one string differing would make the row's reason and its lineage tell two stories |
| Lineage | `superseded_by_grant_id` → replacement |
| Exactly one `ACTIVE` | asserted |
| Old ciphertext not copied | new `iv`, new `ciphertext`, and the decisive assertion — the opened plaintext is the **new** token |
| Notified reissue | a second intent with a different `intent_key`, a second `PENDING` outbox row, a fresh envelope |
| Audit | `secure_grant.reissued` carrying `reissuedFromGrantId` |
| Atomicity | a forced failure leaves the source `ACTIVE` and the only row — never a revoked link with no replacement |

The three steps are ordered by the schema, not by preference: the old row must be
`REVOKED` before a new one may be `ACTIVE` (CST-009 admits one), and the
replacement must exist before `superseded_by_grant_id` may point at it (the
self-FK rejects a dangling pointer).

---

## H. Revoke

- A blank or whitespace-only reason is refused as `GRANT_REVOKE_REASON_REQUIRED`
  and changes nothing; the CHECK is the second line of defence, not the first.
- `ACTIVE → REVOKED` through the delivered guard; the reason is persisted and is
  also the audit row's own `reason` column.
- No token minted, no notification requested, no replacement grant created.
- A second revoke is refused. LC-03 has no `REVOKED → ACTIVE` edge, and the gate
  additionally forbids any `reactivate`/`unrevoke` symbol.

---

## I. StepUpWindow

`isSatisfied` reads `stepUpWindowSeconds`, computes `notBefore = now - window`,
and asks `hasRecentCompleted(..., STEP_UP, notBefore)`.

| Case | Result |
|---|---|
| nothing verified | `false` |
| fresh `STEP_UP` | `true` |
| window elapsed | `false` |
| edge, inside then outside | `true` then `false` |
| fresh `SUBMISSION` | `false` |
| `STEP_UP` for a different contact | `false` |
| missing/malformed policy | refuses — fails closed |

`SUBMISSION` is **unreachable, not merely unused**: the purpose is a pinned
module constant passed positionally, there is no purpose parameter, and the gate
asserts the third argument of the call is the constant. It issues no challenge,
issues no grant and authorizes no business action — asserted by observing that a
satisfied window leaves zero grants and zero intents.

---

## J. Audit

Three actions on `target_kind = SECURE_ACCESS_GRANT`:
`secure_grant.issued`, `secure_grant.reissued`, `secure_grant.revoked`.

Actor is `CUSTOMER` with the owning customer and the grant id — the truthful
attribution, following `CustomerIdentityAuditRecorder`. `SYSTEM` would claim an
automated job acted, and fabricating an Admin would attribute a customer's flow
to staff; `APP4-B07` will supply its own authenticated Admin actor, and the
recorder already accepts one.

Summaries carry only server-owned bounded values: `customRequestId`, `scopeKind`,
`expiresAt`, `notified`, `reissuedFromGrantId`, and the operator's revoke reason.

**The digest is excluded deliberately, and it is the one that looks safe.**
`token_hash` is not the token, so including it reads like redaction — but it is
the exact value `resolveActive` looks a grant up by (CST-008), and `audit_events`
outlives the grant it describes by design (G-DB7-46), so such a row would outlive
the revocation too. Asserted absent: raw token, digest, fragment URL, ciphertext,
recipient in any form, pepper.

---

## K. Concurrency

Two tests, because the two real interleavings prove different things.

1. **Forced overlap.** A rendezvous holds both transactions open past a read of
   the same `ACTIVE` source before either rotates. The loser blocks on the
   winner's row lock, re-reads under `READ COMMITTED`, matches nothing and
   unwinds with `GRANT_CONCURRENT_REISSUE_LOSS`. Exactly one `ACTIVE`
   replacement, source terminal with its reason, no orphan.
2. **Unsynchronised pair**, asserting **no outcome count**. Two unsynchronised
   reissues legitimately land either way — overlapping, or the second starting
   after the first committed and rotating the replacement instead. The first
   draft of this test demanded one failure and failed on the sequential
   interleaving; timing is not reproducible, so it now asserts only what holds in
   every interleaving: one live end, a lineage that is a chain rather than two
   rows claiming one successor, and a reason on every revoked row.

The arbiter is the database throughout. No mutex, no advisory lock, no schema
object added, CST-009 unweakened. The reissue suite was run three times
consecutively to confirm stability.

---

## L. Secret-lifetime evidence

The raw token exists in: transient issuer memory, the single in-process return,
the sealed ciphertext, worker memory after claim, and the recording sink. Nowhere
else.

`tokenAppearsAnywhere` sweeps `secure_access_grants`, `notification_intents`,
`outbox_events` (minus the ciphertext itself), `audit_events` and
`background_job_attempts` — every textual and JSON column the path writes. It
returns empty for every issued and reissued token in every suite. The rendered
URL contains the token as a substring, so the same sweep covers it.

The W01 suite additionally captures `process.stdout`/`stderr` and asserts no
delivered or refused secret appears in any log line.

No token-shaped literal appears in this report. `node tools/check-report-secrets.mjs`
was run after the final text.

---

## M. Checker evidence

`tools/check-app4-b05.mjs` — **pass**, 31 rulings across 14 rule groups.
`tools/check-app4-b05.test.mjs` — **48/48 pass**, `node --test`.

Every assertion reads real source with comments stripped. One case injects every
forbidden term into a comment and asserts the gate stays silent — these files are
full of sentences like "never `sealDeliveryEnvelope`" and "no `?t=` fallback",
and a gate that failed on its own documentation would be deleted.

**The mutation suite caught four genuinely weak rules on its first run**, each
now strengthened rather than the mutation weakened:

| Weak rule | Why it passed a real defect | Strengthened to |
|---|---|---|
| B01 usage | a stale type annotation survived the import being repointed | assert the **import specifier** and the call |
| superseded reason | the constant appearing anywhere in the method satisfied it | assert it **at each call site** |
| step-up purpose | the constant existing beside a caller-supplied argument satisfied it | assert the **third positional argument** of the call |
| hard-coded domain | the regex stripped `https?:` before testing for `https?://` — it could not match | corrected, applied to renderer and origin config |

Two further mutation anchors were wrong and were corrected against real source.

---

## N. Focused tests

| Suite | Result |
|---|---|
| `secure-grant-policy.spec.ts` | 15 pass |
| `secure-grant-issue.integration.spec.ts` | 16 pass |
| `secure-grant-reissue.integration.spec.ts` | 7 pass (×3 runs) |
| `step-up-window.integration.spec.ts` | 8 pass |
| `storefront-origin.config.spec.ts` | 11 pass |
| `secure-link.renderer.spec.ts` | 7 pass |
| `notification-delivery-success.integration.spec.ts` (W01, directly affected) | 7 pass |

Real PostgreSQL, real `CustomerModule`, real `TransactionManager`, real B01
sealing real envelopes, real audit trail. Two providers are overridden — the
clock and the token minter — so a seven-day expiry and a fifteen-minute window
are provable in milliseconds and the suites know which plaintext must reach
exactly one place. **Fake time throughout; no real 7-day or 15-minute wait.**

### N.1 Fixture scaffolding, and a deviation from §4

§4 asks that test requests be seeded with the existing DB7 order/request fixture.
`seedOrderChain` was inspected and **not** used, because it seeds an `ACTIVE`
grant for its own customer and request — which is precisely the CST-009 slot
every B05 issue test needs free. Using it would have required revoking the
fixture's grant before each test, making the setup less honest rather than more.

`secure-grant-context.ts` therefore seeds the minimum a grant can bind to —
customer, primary verified contact, one `custom_requests` row — with raw SQL, in
the same style as `order-fixture.ts`. It is labelled in the file header and at the
insert: **fixture scaffolding — not an APP5 submission.** Nothing in the
production path can create a Custom Request, and the gate asserts it.

### N.2 The B06 compatibility proof

`issue` → `resolveActive` succeeds for the correct customer, request and scope →
`revoke` → `resolveActive` no longer resolves. No B06 HTTP or error shaping was
implemented.

---

## O. Validation ledger

Change-impact only. Every command below was run once, except the reissue suite
(three times, deliberately, to confirm the race is stable).

| # | Command | Result |
|---|---|---|
| 1 | `npx jest src/modules/customer/domain/grant src/modules/customer/tests/integration/secure-grant src/modules/customer/tests/integration/step-up-window` (apps/api) | 4 suites, 46 tests pass |
| 2 | `npx jest .../storefront-origin .../secure-link.renderer .../notification-delivery-success` (apps/worker) | 3 suites, 25 tests pass |
| 3 | `npx tsc --noEmit` (apps/api) | clean |
| 4 | `npx tsc --noEmit` (apps/worker) | clean |
| 5 | `node tools/check-app4-b05.mjs` | pass |
| 6 | `node --test tools/check-app4-b05.test.mjs` | 48/48 pass |
| 7 | `npx eslint src/modules/customer` (apps/api) | clean |
| 8 | `npx eslint src/jobs/notification-delivery` (apps/worker) | clean |
| 9 | `npx prettier --check` over the changed set | clean |
| 10 | `node tools/check-report-secrets.mjs` | pass |
| 11 | `git diff --cached --check` | clean |

**Not run**, per §23: full API Jest, full CustomerModule/persistence, full
worker/W01, B01/B02/B03/B04 runtime suites, full P01, OpenAPI/client generation
(0 endpoints), frontend/Playwright, DB manifest/migration regression, Figma/G01
authoring gates, Sonar, repo-wide build/typecheck/lint.

**No full regression/test chain was run.**

### O.1 Two disclosures

1. **`tools/check-app4-g01.mjs` was run once**, because B05 edits
   `ADR-APP4-001`, which that gate parses. It reports **6 failures — identical
   before and after this checkpoint**, verified by stashing. They are
   pre-existing: the gate asserts G01 itself implemented nothing, and B01/B03/W01
   have since implemented all of it. The ADR edit introduced no new failure. No
   attempt was made to "fix" a gate that belongs to a closed checkpoint.
2. **`tools/check-app4-b05.mjs` is 661 lines**, over the 450 soft cap §20 calls
   preferred. Delivered peers sit at 587 (`check-app4-b03-contract.mjs`) and 580
   (`check-app4-b04-contract.mjs`), so this is in family but the largest. It is
   disclosed rather than resolved by splitting, which would have divided 14
   cohesive rule groups across two files for a line count.

---

## P. Files changed

**New — API (8)**

```text
apps/api/src/modules/customer/domain/grant/secure-grant-policy.ts
apps/api/src/modules/customer/domain/grant/secure-grant-policy.spec.ts
apps/api/src/modules/customer/domain/grant/secure-grant-outcome.ts
apps/api/src/modules/customer/infrastructure/policy/secure-grant-policy.reader.ts
apps/api/src/modules/customer/infrastructure/crypto/secure-link-token.minter.ts
apps/api/src/modules/customer/application/secure-grant.issuer.ts
apps/api/src/modules/customer/application/secure-grant.notifier.ts
apps/api/src/modules/customer/application/secure-grant-audit.recorder.ts
apps/api/src/modules/customer/application/step-up-window.service.ts
```

**New — worker (5)**

```text
apps/worker/src/jobs/notification-delivery/config/storefront-origin.config.ts
apps/worker/src/jobs/notification-delivery/config/storefront-origin.config.spec.ts
apps/worker/src/jobs/notification-delivery/config/storefront-origin.provider.ts
apps/worker/src/jobs/notification-delivery/domain/secure-link.renderer.ts
apps/worker/src/jobs/notification-delivery/domain/secure-link.renderer.spec.ts
```

**New — tests and tooling (6)**

```text
apps/api/src/modules/customer/tests/integration/secure-grant-context.ts
apps/api/src/modules/customer/tests/integration/secure-grant-queries.ts
apps/api/src/modules/customer/tests/integration/secure-grant-issue.integration.spec.ts
apps/api/src/modules/customer/tests/integration/secure-grant-reissue.integration.spec.ts
apps/api/src/modules/customer/tests/integration/step-up-window.integration.spec.ts
tools/check-app4-b05.mjs
tools/check-app4-b05.test.mjs
```

**Modified (11)**

```text
apps/api/src/modules/customer/customer.module.ts                       wiring + exports
apps/api/src/modules/customer/tests/integration/verification-issue-context.ts
                                                                        configure passthrough,
                                                                        generalized publisher
apps/worker/.../application/notification-delivery.usecase.ts            rendering seam
apps/worker/.../domain/channel/notification-channel.port.ts             optional secureLinkUrl
apps/worker/.../domain/delivery-failure.ts                              additive failure class
apps/worker/.../infrastructure/channel/recording-...adapter.ts          records the link
apps/worker/.../notification-delivery.module.ts                         origin provider
apps/worker/.../tests/notification-delivery-context.ts                  origin env
apps/worker/.../tests/notification-delivery-success.integration.spec.ts fragment assertions
.env.example                                                            STOREFRONT_PUBLIC_ORIGIN
infrastructure/compose/docker-compose.dev.yml                           worker service only
docs/adr/backend/ADR-APP4-001-...md                                     §11.0 + 3 facts
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md              IMP-D050
```

`.env` was **not** written. No schema, no migration, no OpenAPI document change,
no generated client change, no repository port or adapter change.

### P.1 File sizes

Largest source file: `secure-grant.issuer.ts` at 364 lines (limit 400, review
threshold 300 — a deliberate single cohesive lifecycle, with delivery and audit
already split into their own files). Largest test file:
`secure-grant-issue.integration.spec.ts` at 442 (limit 600). Checker: see §O.1.2.

---

## Q. Git evidence

Committed on `production`, **not pushed**. Working tree clean at exit.

Implementation commit: `e2c4b66` — `feat(app4): issue, reissue and revoke secure grants with a step-up window`. 35 files, +4553/−17. Not pushed; `origin/production` is unchanged.

---

## R. Next checkpoint

```text
APP4-B06
```

Public secure-link resolution — one endpoint, `POST /public/secure-links/resolve`,
body-only intake, and a single non-enumerating failure for all six rejection
causes. It was **not** started.

Two things B05 deliberately left for it: the HTTP and error shaping of
`resolveActive` (§N.2 proves only the persistence seam), and expired-token public
behaviour (B05 derives expiry and adds no persisted `EXPIRED` transition).
