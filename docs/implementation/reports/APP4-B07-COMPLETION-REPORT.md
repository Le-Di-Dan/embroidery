# APP4-B07 — Admin Customer, Verification and Secure-Grant Support — Completion Report

## A. Verdict

**PASS.**

Three Admin operations, and no fourth:

```text
GET  /api/admin/customers/{customerId}         adminCustomerSupport_detail
GET  /api/admin/customers/{customerId}/grants  adminCustomerSupport_grants
POST /api/admin/secure-grants/{grantId}/revoke adminSecureGrant_revoke
```

The published surface grew by exactly three operations, 47 → 50.

**Authentication is APP1's, unchanged.** All three routes carry the delivered
`AuthenticatedAdminGuard` — the same class `GET /api/staff/me` and every Admin
catalogue and template route already use. B07 defines no guard, parses no cookie,
looks up no session and accepts no caller-supplied Admin id. There is no role
check because there is no role model, and B07 did not invent one.

**A contact leaves this API masked or not at all.** `maskContact` — the APP4-P01
primitive — is called in one place, there is no branch that skips it, and the
normalized and display values are dropped inside a projection function whose
return type has nowhere to put them.

**Revocation is B05's transition, attributed to the real operator.**
`SecureGrantIssuer.revoke` runs the guarded `ACTIVE → REVOKED` compare-and-set
and writes the audit row in the same transaction. B07 supplies the actor, taken
from the request context the guard bound, and the persisted row carries
`actor_kind = ADMIN` with the authenticated session's `admin_id`. B07 never calls
the repository's `revoke`.

**The digest is structurally absent, not merely unpublished.** The new
`listForCustomer` read projects an explicit column list that does not include
`token_hash`, so no object reaching the application layer has a digest to leak.

No `BLOCKED_BY_AUTHORITY` condition was reached. In particular §30.1 does **not**
apply: `SecureGrantAuditRecorder.recordRevoked` has accepted an optional
`AuditActor` since B05, documented for this caller; B07 threads it through
`SecureGrantIssuer.revoke` rather than bypassing the lifecycle or writing a
second compensating event (§I, §J).

**No full regression/test chain was run.**

---

## B. Entry state

| Fact | Value |
|---|---|
| P00 | `CLOSED_AFTER_MANDATORY_DIRECTIVE` |
| G01 | `PASS` |
| P01, B01 | `PASS_AFTER_C1` |
| W01, B02, B03, B04, B05, B06 | `PASS` |
| Migrations | 34 (`NO_APP4_MIGRATION`) |
| OpenAPI at entry | 42 paths / 47 operations / 90 schemas — **measured**, not assumed |
| OpenAPI at exit | 45 paths / 50 operations / 95 schemas |
| Delta | +3 paths / **+3 operations** / +5 schemas |
| Migrations at exit | 34 — unchanged |

Baseline measured at `afec392` before any edit; exit measured from the
regenerated artifact.

---

## C. Authority and repository audit

Recorded before any code was written (§4).

| # | Question | Finding |
|---|---|---|
| 1 | Exact Admin guard | `AuthenticatedAdminGuard` — `apps/api/src/modules/identity/presentation/guards/authenticated-admin.guard.ts`, exported by `IdentityModule` |
| 2 | Authenticated non-Admin principal | **None.** `NON_ADMIN_AUTHENTICATED_PRINCIPAL = NOT_REPRESENTABLE_BY_CURRENT_AUTHORITY` — the guard's own header records that APP1-B01 is a binary authenticated-admin gate with no role check, and no other authenticated principal type exists in the API |
| 3 | Safe Customer fields | `Customer` carries `id`, `displayName`, `verifiedAt`, `mergedIntoCustomerId`, `anonymizedAt`. B07 publishes `id` and `verifiedAt` only |
| 4 | Contact-read semantics | `listContactPoints(customerId)` returns **all** rows including `deactivatedAt` ones; application-level filtering is sufficient, so no history query option was added (§8) |
| 5 | P01 mask API | `maskContact(kind, normalizedValue)` — takes the **normalized** value, deterministic, one-way |
| 6 | Grant-list repository capability | **Absent.** `resolveActive`, `resolveActiveByTokenDigest`, `findById` and `listActiveForRequest` are all live-grant or request-keyed reads; none can list one customer's grants across states |
| 7 | Exact B05 revoke call | `SecureGrantIssuer.revoke(grantId, reason)`; failures `GRANT_REVOKE_REASON_REQUIRED` and `GRANT_NOT_ACTIVE` (raised for an unknown id **and** a non-ACTIVE row alike) |
| 8 | B05 audit actor behaviour | `RecordGrantRevokedInput.actor?: AuditActor` already existed, defaulting to `CUSTOMER`, with the doc comment "`APP4-B07` supplies an Admin". `SecureGrantIssuer.revoke` did not yet accept or forward one |
| 9 | Repository extension required | **One**: `listForCustomer(customerId)`. Proven necessary by (6) |
| 10 | Older checkers affected | `b02`, `b03`, `b04`, `b05`, `b06` — see §L |
| 11 | OpenAPI/client baseline | 42 / 47 / 90; generated client tree hash recomputed after regeneration |

Also inspected for convention: `StaffSelfController` (APP1 protected read),
`AdminProductController` (APP2 Admin business surface) and
`AdminDesignTemplateLifecycleController` (APP3 Admin mutation) — for guard
placement, path-param validation, cache behaviour, 404/409 mapping and
operation-id derivation.

---

## D. Admin authentication reuse

- `@UseGuards(AuthenticatedAdminGuard)` is applied at **controller** level on
  both classes, so it covers all three handlers.
- The revoke mutation additionally carries `StaffOriginGuard` and
  `StaffJsonBodyGuard`. These are **not** a second authentication guard: they are
  APP1's CSRF layering (`ADR-APP1-001` §6), applied to every Admin mutation in
  APP2 and APP3, and they authenticate nobody. The B07 gate asserts that this
  checkpoint declares no class implementing `CanActivate`.
- No role or permission vocabulary appears in any B07 file (gate-asserted).
- Missing, invalid, revoked and expired sessions stay APP1-owned. Proven at HTTP
  level with the **real** guard (§N).

---

## E. Customer detail

```text
customerId
verifiedAt
contacts[]: kind · maskedValue · verified · primary
```

`verifiedAt` is the verification fact: `ADR-DB2-001` r5 admits no unverified
Customer, `customers.verified_at` is NOT NULL, so its presence *is* the answer.
No separate always-true boolean was invented.

**Contact visibility.** Current contacts only — rows with `deactivated_at` set
are filtered in the query, in the one caller that publishes them, rather than by
adding a filtered repository read that would make history a supported request
shape. `ADR-DB2-003` r7 forbids a contact-history surface; no locked D01 or
support authority requires historical contact detail, so §8's stop condition was
not reached.

Ordering is deterministic: primary first, then kind, then normalized value.

**Absent by construction:** `contactPointId` (B07 has no per-contact operation),
`verifiedSource`, `displayName`, Business Profile, merge and anonymization state,
and every credential. Unknown Customer → `404`.

---

## F. Masking and privacy

- One masker: `maskContact` from `APP4-P01`. The gate refuses a second
  implementation, including an inline `.replace(…***…)`.
- The normalized and display values are dropped inside `toContactView`, whose
  return type cannot hold them, so a later edit to the view cannot leak one
  without changing that function.
- No B07 file logs a contact in any form.
- Both kinds are exercised through normal B07 integration (§N). The P01 suite was
  **not** re-run.

---

## G. Grant list

```text
grantId · customRequestId · scopeKind · status · expiresAt
```

Customer-scoped, newest-issued first with `id` as the tie-breaker (two grants
minted in one transaction share a `created_at`). Every state is listed —
a revoked or expired grant is exactly what explains a link that stopped working.

**Never returned:** raw token, `token_hash`, ciphertext, notification intent /
outbox / attempt ids, recipient, `revoke_reason`, `superseded_by_grant_id`, and
any APP5–APP7 business content. `customRequestId` is published as an opaque
correlation reference only.

**Repository seam.** One narrow addition, `listForCustomer(customerId)`:
customer-scoped, read-only, deterministically ordered, no status or date filter,
no cursor, no search. It rides `ix_secure_access_grants__customer_id` (IDX-107),
which DB5 records as required *despite* IDX-008 precisely because IDX-008 is
partial over ACTIVE rows and a customer-wide read must see every status. No
`/api/admin/secure-grants` global listing was added.

---

## H. Effective live semantics

No effective-state abstraction has been delivered anywhere in APP4, so §11's
second option applies: **persisted `status` + `expiresAt`, and no `isLive`.**

LC-03 has no sweep, so a grant can be stored `ACTIVE` with `expires_at` in the
past while `resolveActive` refuses it by time. B07 reports that pair exactly:

- the read applies **no** expiry predicate — unlike `resolveActive`, which must
  refuse a stale grant, this read must *report* one;
- the published `status` description states the rule ("ACTIVE **and**
  `expiresAt` in the future is the only combination that is still live");
- no persisted `EXPIRED` transition was invented and no status is rewritten on
  the way out.

Both GETs are reads: no transaction, no audit event, no lifecycle mutation. A
test asserts that two consecutive list calls leave every grant row byte-identical
including `updated_at`.

---

## I. Revoke lifecycle

`POST /api/admin/secure-grants/{grantId}/revoke` → **204 No Content**.

Body: `{ reason }`, `.strict()`, trimmed, non-blank, ≤ 500 characters. Rejected
by name: `customerId`, `customRequestId`, `token`, `scopeKind`, `actorId`,
`replacementGrantId`.

The use case does three things and delegates the fourth:

1. `findById` — establishes the grant exists, so `404` and `409` can be told
   apart. B05's vocabulary raises `GRANT_NOT_ACTIVE` for both an unknown id and a
   dead row, and support needs the difference.
2. resolves the authenticated Admin actor from the bound request context;
3. calls `SecureGrantIssuer.revoke(grantId, reason, actor)`;
4. **B05** owns the transition, the reason rule, the compare-and-set and the
   audit row.

The pre-read decides a *status code*, not authorization. A concurrent revoke
between the read and the transaction is arbitrated by the `status = 'ACTIVE'`
predicate inside B05, and the loser is told the grant is not revocable.

`409` on a second revoke and on an `EXPIRED` grant; `404` on an unknown id;
`400` on a missing, blank or over-long reason and on a malformed id. Revocation
mints nothing — no replacement grant, no token, no notification.

**204, not a grant projection.** A mutation that returned a grant would be a
second place for that shape to drift from the list endpoint that owns it, and a
second body a future edit could put a digest into. `DELETE /api/staff/session`
answers 204 for the same reason.

---

## J. Admin audit attribution

`SecureGrantIssuer.revoke` gained a third parameter, `actor?: AuditActor`,
forwarded to `SecureGrantAuditRecorder.recordRevoked` — the optional field that
recorder has carried since B05 for exactly this caller.

A **parameter**, not a context read inside B05: B05's other callers are
in-process APP5 business actions with no Admin bound, and a context read would
either fabricate an actor for them or make the method fail outside HTTP. Every
existing path keeps the behaviour it was accepted with.

The actor comes from `RequestContextService.requireActor()` and is refused unless
`kind === 'ADMIN'` — never from a body, header or query, or an operator could
file their action against a colleague. There is no fallback: an unattributable
revocation fails rather than being recorded as `SYSTEM` or as the customer.

Verified against the persisted row (§N): exactly one `secure_grant.revoked`
event, `actor_kind = 'ADMIN'`, `admin_id` equal to the authenticating session's
account, `customer_id` NULL, `reason` the operator's string, and no token, digest
or contact value anywhere in the row.

No read-audit events were added — `ADR-DB3-004` r11 audits issue,
use-for-sensitive-action, revoke, reissue and step-up, and a support read is none
of them.

---

## K. OpenAPI and generated client

| Step | Command | Result |
|---|---|---|
| Generate | `pnpm --filter @embroidery/api openapi:generate` | 45 paths / 50 operations / 95 schemas |
| Check | `pnpm --filter @embroidery/api openapi:check` | up to date |
| Client generate | `pnpm --filter @embroidery/api-client generate` | 2 files, 3033 lines, tree hash `94ab780e…` |
| Client check | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| Client typecheck | `pnpm --filter @embroidery/api-client typecheck` | clean |

- Exactly **3** B07 operations; delta over B06 is **+3**.
- All three publish `security: [{ adminSession: [] }]`.
- New schemas (5): `AdminCustomerContactResponse`, `AdminCustomerDetailResponse`,
  `AdminCustomerGrantsResponse`, `AdminSecureGrantResponse`,
  `RevokeSecureGrantBody`.
- New client symbols: `adminCustomerSupportDetail`, `adminCustomerSupportGrants`,
  `adminSecureGrantRevoke`. No TanStack hook was generated or written.
- `RevokeSecureGrantBody` requires `reason` with `minLength: 1` and
  `additionalProperties: false`.
- No credential field in any generated schema (gate-asserted over both generated
  files).
- Every prior operation id is unchanged — no delivered controller was split,
  renamed or re-prefixed.
- No generated file was hand-edited.

---

## L. Older checker reconciliation

Every checker was first run against a **pristine `afec392` worktree** to
establish whether B07 caused a failure or inherited one.

| Gate | At `afec392` | Cause | Action |
|---|---|---|---|
| `b01` | **7 failures** | Pre-existing; unrelated to B07 (policy-restatement rules over B03/B05/W01 files) | **Not touched.** Identical failure text before and after |
| `b02` | **23 failures**, 5 test failures | Pre-existing: its "B02 publishes no HTTP surface" rule scans the whole customer module and has been stale since B03 shipped a controller there. B07 adds 16 more of the same kind | **One rule reconciled** — the OpenAPI customer-path rule, which *passed* at `afec392` and B07 newly broke. The stale presentation-scan rule was **not** rewritten (§L.1) |
| `b03` | PASS | B07's two grant-named paths tripped the "no public grant surface" loop; the document-wide `customerId` ban caught B07's Admin path items and detail schema | Grant paths authorized by exact name; the `customerId` scan lifts out the two Admin path items and `AdminCustomerDetailResponse` **by name**, so the ban still holds over every other path and schema, and `contactPointId`/`codeHash`/`otp` stay refused everywhere |
| `b04` | PASS | Operation count; grant-path loop | Count 47 → 50; grant paths authorized from the shared list |
| `b05` | PASS | Operation count; grant-path filter | Count 47 → 50; paths authorized, **plus a new rule** pinning one verb per authorized path so an issue sibling cannot appear on one |
| `b06` | PASS | Operation count; `linkPaths` equality | Count 47 → 50; the expected set is now the resolver plus the two Admin paths |

The authorized list is declared **once**, as `B07_ADMIN_GRANT_PATHS` in
`check-app4-b03-contract.mjs`, and imported by `b04`, `b05` and `b06` — four
copies would be four chances for a fifth route to be added to one of them.

Prior invariants are preserved: an Admin issue or reissue route, a global
`/api/admin/secure-grants` listing, a public grant route and a second verb on an
authorized path all still fail. Mutation assertions for each were added to the
`b04`, `b05` and `b06` test files.

No old completion report was edited. No old runtime integration suite was re-run
because of checker evolution.

### L.1 Pre-existing condition, not repaired by B07

`tools/check-app4-b02.mjs` fails at `afec392` with **23 failures** and its test
file fails 5 of 36 — verified by running both against a clean worktree at that
commit, with an identical failure set before and after B07. The stale rule
asserts "B02 publishes no HTTP surface" by scanning the whole customer module's
`presentation/` folder, which stopped being a valid inference when `APP4-B03`
shipped the module's first controller. B03, B04 and B06 each left it.

B07 reconciled only the one `b02` rule it newly broke. Rewriting the stale rule
would mean re-scoping another checkpoint's gate inside this one and would obscure
whose debt it is. **Recommended follow-up: `FU-APP4-B02-GATE-SCOPE-01` — re-scope
the B02 no-HTTP-surface rule to B02's own canonical file list.**

---

## M. B07 checker

`tools/check-app4-b07-contract.mjs` + `tools/check-app4-b07-contract.test.mjs`.

Reads the generated OpenAPI document, the generated client and **source with
comments stripped**. Never prose, never this report.

Covers all 28 required assertions:

| # | Assertion | Where |
|---|---|---|
| 1–5 | exactly 3 operations, exact routes, one verb each, GET/GET/POST | `checkPublishedSurface` |
| 6–8 | the existing Admin guard on both controllers, no second guard, no roles | `checkAdminAuthorization` |
| 9–11 | no customer search or collection route, no lookup parameter, no customer mutation, no merge or anonymization read | `checkForbiddenOperations` |
| 12–15 | no raw/normalized/display/source contact field, P01 mask reused with no second masker, verified and primary present, no Business Profile | `checkContactProjection` |
| 16–19 | grant status and expiry present, no token/hash/digest/ciphertext, customer-scoped read, no global listing | `checkGrantProjection` |
| 20–23 | reason required and non-blank and strict, revoke routed through B05, no direct repository revoke or supersede, no issue/reissue | `checkRevocation` |
| 24–26 | no notification import/table/module, no schema or migration, no APP5–APP7 content | `checkScopeBoundaries` |
| 27–28 | no credential field in the generated client, +3 operations over the B06 baseline | `checkTransportAndClient`, `checkPublishedSurface` |

Additionally: operation ids pinned by name; `adminSession` security on all three;
`no-store` on both GETs from one named policy constant; the repository read
proven to filter by customer id, to select no digest, to write nothing and to
order deterministically; and the 204/401/404/409 revoke responses.

**51 mutation tests, all passing.** Four keep the gate honest — it passes against
the real repository, against a faithful copy at another path, it fails when an
owned file is deleted, and it **reads code rather than prose** (a doc comment
naming every forbidden term does not fail it).

---

## N. Focused tests

Three new HTTP suites plus two cases added to the delivered repository suite.
**50 tests, 4 suites, all passing.**

Unlike every prior APP4 integration context, the harness boots a **real HTTP
application with the real `AuthenticatedAdminGuard` and overrides no guard** —
B07's defining claim is that three routes are protected by APP1's guard, and a
stubbed guard proves only that something let the handler run. Sessions are real
`admin_sessions` rows whose `token_hash` is computed by the production hash.

**Auth (§20).** All three routes: no cookie → 401; a cookie resolving to no
session → 401; a live session → the handler is reached. One representative
invalid-session case only — APP1 owns expiry, revocation, sliding renewal and
disabled accounts, and its guard is unchanged here.

**Customer detail (§21).** One verified Customer with a primary EMAIL and a
non-primary PHONE. Asserted: correct id; verification instant; both kinds;
exactly one primary; both verified flags; the P01 masks for both kinds. The
**whole serialized body** is searched for the raw address, the raw E.164 number
and the bare national digits — an assertion on the mask alone would still pass if
the raw value sat in a second field. The field sets are asserted exactly, and the
body is searched for `businessprofile`, `companyname`, `taxcode`, `mergedinto`,
`anonymized`, `normalizedvalue`, `displayvalue`, `verifiedsource`, `tokenhash`,
`digest`, `ciphertext`, `password`, `session` and `notification`. A deactivated
contact is proven absent. Unknown Customer → 404; malformed id → 400. Both GETs
return `Cache-Control: no-store`.

**Grants (§22).** The subject Customer holds five grants covering every honest
state — live ACTIVE; **physically ACTIVE but past its expiry**; REVOKED; a
superseded source with its live replacement — and a second Customer holds one of
its own. Asserted: only the requested Customer's grants (the foreign grant id is
absent from the serialized payload, not merely from the id list); the second
Customer's list contains only its own; status and expiry truthful for all four
states, including the stale ACTIVE row; the exact field set; every seeded synthetic
digest absent by value; and no recipient, notification, outbox or business term.
Two consecutive reads leave every row byte-identical. Unknown Customer → 404; a
Customer with no grants → `[]`.

**Revoke (§23).** Missing reason, blank reason and a body carrying `actorId` or
`customerId` are all refused with the grant unchanged and **zero** audit rows.
On success: the link is live before the call and dead after — asked through
`resolveActiveByTokenDigest`, the repository's own live-grant resolver, not by
re-reading `status`; ACTIVE → REVOKED; the reason persisted; exactly one audit
row with `actor_kind = ADMIN` and the session's `admin_id`; `customer_id` NULL;
no replacement grant; `superseded_by_grant_id` NULL; `notification_intents` and
`outbox_events` both empty; an empty response body. A second revoke returns 409,
leaves every column identical to the first revoke's result and appends no second
audit row. An `EXPIRED` grant returns 409 and writes nothing. Unknown id → 404.

**Repository (§25).** Two cases added to
`verification-and-grants.integration.spec.ts` — the delivered AGG-04 suite —
because `listForCustomer` changed the port and the adapter: it lists both an
ACTIVE and a REVOKED grant for one customer, excludes another customer's, exposes
exactly the five summary keys, contains neither seeded digest by value, and
returns `[]` for a customer with none. The full persistence suite was **not**
run.

---

## O. PII and secret evidence

All fixtures are deterministic and synthetic. No real contact, token, hash or
session value appears in the repository, the tests or this report.

| Checked for | In | Result |
|---|---|---|
| Raw email (`…@vidu-b07.test`) | detail response body | absent |
| Normalized email | detail response body | absent |
| Raw / E.164 phone, and the bare national digits | detail response body | absent |
| Masked value | detail response body | present, and different from its input |
| Seeded token digests (6 distinct markers) | grants response body | absent, by value |
| `tokenhash` / `digest` / `ciphertext` / `recipient` | grants and detail bodies | absent |
| Token, digest, contact | persisted audit rows | absent |
| Contact values | captured request logs | absent — the log line carries `actor: { kind: ADMIN, id }` and the route template only |
| Credential fields | generated client and schemas | absent (gate-asserted) |

`node tools/check-report-secrets.mjs` — pass.

---

## P. Validation ledger

Change-impact only. Each command run **once** on success; reruns happened only
after a file it covers changed.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runTestsByPath src/modules/customer/tests/integration/admin-customer-support.integration.spec.ts src/modules/customer/tests/integration/admin-customer-grants.integration.spec.ts src/modules/customer/tests/integration/admin-secure-grant-revoke.integration.spec.ts src/modules/customer/tests/integration/verification-and-grants.integration.spec.ts` | 4 suites / 50 tests pass |
| 2 | `pnpm --filter @embroidery/api typecheck` | clean |
| 3 | `pnpm --filter @embroidery/api openapi:generate` | 45 / 50 / 95 |
| 4 | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 5 | `pnpm --filter @embroidery/api-client generate` | tree hash `94ab780e…` |
| 6 | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| 7 | `pnpm --filter @embroidery/api-client typecheck` | clean |
| 8 | `node tools/check-app4-b07-contract.mjs` | pass |
| 9 | `node --test tools/check-app4-b07-contract.test.mjs` | 51 / 51 pass |
| 10 | `node tools/check-app4-b03-contract.mjs` · `b04` · `b05` · `b06` | pass (reconciled) |
| 11 | `node --test tools/check-app4-b03-contract.test.mjs …b04… …b05… …b06…` | 209 / 209 pass |
| 12 | `node tools/check-app4-b02.mjs` and its tests | **unchanged pre-existing failure set** — identical at `afec392` (§L.1) |
| 13 | `pnpm --filter @embroidery/api exec eslint src/modules/customer src/bootstrap/app.module.ts` | clean |
| 14 | `pnpm exec prettier --check` over the changed paths | clean |
| 15 | `node tools/check-report-secrets.mjs` | pass |
| 16 | staged whitespace check | clean |

Reruns and why: (1) and (2) were re-run after the harness signature changed and
again after lint/format edits; (8) and (9) after Prettier reformatted the
checker. Nothing else was repeated.

**Deliberately not run** (§26): full API Jest; full CustomerModule or persistence
suites; the full APP1 auth matrix; the B01/W01/B02/B03/B04/B05/B06 runtime
suites; the full P01 suite; frontend, Admin or Playwright tests; Figma checks; DB
manifest or migration regression; the G01 checker; SonarQube; any repo-wide
build, typecheck or lint; any aggregate regression chain.

**No full regression/test chain was run.**

---

## Q. Files changed

**Added — API (10)**

```text
apps/api/src/modules/customer/customer-admin-support.module.ts
apps/api/src/modules/customer/application/admin-customer-support.query.ts
apps/api/src/modules/customer/application/revoke-secure-grant.use-case.ts
apps/api/src/modules/customer/domain/support/admin-support.errors.ts
apps/api/src/modules/customer/domain/support/admin-support.policy.ts
apps/api/src/modules/customer/presentation/admin-customer-support.controller.ts
apps/api/src/modules/customer/presentation/admin-secure-grant.controller.ts
apps/api/src/modules/customer/presentation/schemas/admin-customer-support.response.ts
apps/api/src/modules/customer/presentation/schemas/admin-secure-grant.response.ts
apps/api/src/modules/customer/presentation/schemas/admin-support.request.ts
```

**Added — tests (4)**

```text
apps/api/src/modules/customer/tests/integration/admin-support-context.ts
apps/api/src/modules/customer/tests/integration/admin-customer-support.integration.spec.ts
apps/api/src/modules/customer/tests/integration/admin-customer-grants.integration.spec.ts
apps/api/src/modules/customer/tests/integration/admin-secure-grant-revoke.integration.spec.ts
```

**Added — tools (2)**

```text
tools/check-app4-b07-contract.mjs
tools/check-app4-b07-contract.test.mjs
```

**Modified (13)**

```text
apps/api/src/bootstrap/app.module.ts                                        (+ CustomerAdminSupportModule)
apps/api/src/modules/customer/application/secure-grant.issuer.ts            (revoke gains `actor?: AuditActor`)
apps/api/src/modules/customer/domain/repositories/secure-access-grant.repository.ts   (+ summary read model, + listForCustomer)
apps/api/src/modules/customer/infrastructure/persistence/drizzle-secure-access-grant.repository.ts (+ listForCustomer)
apps/api/src/modules/customer/tests/integration/verification-and-grants.integration.spec.ts (+ 2 repository cases)
packages/contracts/openapi/openapi.generated.json                           (generated)
packages/api-client/src/generated/embroidery-api.ts                         (generated)
packages/api-client/src/generated/embroidery-api.schemas.ts                 (generated)
tools/check-app4-b02.mjs · b03-contract.mjs · b04-contract.mjs · b05.mjs · b06-contract.mjs   (reconciliation)
tools/check-app4-b04-contract.test.mjs · b05.test.mjs · b06-contract.test.mjs                 (guards)
docs/implementation/SCOPED_COMMAND_INDEX.md                                 (3 new scoped commands)
```

No schema, no migration, no frontend file, no generated file hand-edited, no
`.env` write.

**File-size note.** `verification-and-grants.integration.spec.ts` is now 521
lines — under the 600 hard limit for test files, over the 500 review threshold.
The two added cases belong beside the other AGG-04 repository claims; splitting
the delivered suite was out of scope for this checkpoint.

---

## R. Git evidence

Committed on `production`, **not pushed**. Working tree clean at exit.

Implementation commit: `<recorded in the evidence commit below>`.

---

## S. Next checkpoint

`APP4-B08` — Admin notification delivery operations.

Not started. No B08 file, route, schema or test exists in this change, and the
B07 gate asserts that no B07 file imports a notification symbol, module or table.

---

## Acceptance criteria

All 54 criteria in §29 are met. The ones worth naming explicitly:

- **2, 39** — the canonical routes, +3 operations, measured at both ends.
- **3, 4, 5, 6, 7** — the existing guard on all three routes, no second auth
  guard, no role matrix, unauthenticated rejected at HTTP level through the real
  guard, and no fake customer-auth principal:
  `NON_ADMIN_AUTHENTICATED_PRINCIPAL = NOT_REPRESENTABLE_BY_CURRENT_AUTHORITY`.
- **14, 15, 16** — P01 masking reused; raw, normalized and E.164 values absent
  from the response, asserted over the whole serialized body.
- **22, 25, 26** — no token, hash, digest or ciphertext; no cross-Customer
  leakage; effective-live semantics truthful for a physically ACTIVE, expired
  grant.
- **29, 30, 34, 35** — revoke through B05, no direct repository revoke, audit row
  exists, actor is the authenticated ADMIN.
- **31, 32, 33** — the prior grant no longer resolves; no replacement grant; no
  notification.
- **43** — older checkers reconciled only where B07 newly broke them, with the
  one pre-existing exception documented in §L.1 rather than silently absorbed.
- **47, 48, 49** — change-impact validation only, one run per successful command,
  no full regression chain.
