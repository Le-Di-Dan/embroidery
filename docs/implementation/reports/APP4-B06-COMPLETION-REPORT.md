# APP4-B06 — Public Secure-Link Resolution — Completion Report

## A. Verdict

**PASS.**

One public operation — `POST /api/public/secure-links/resolve` — exchanges an
opaque secure-link token for the request it opens. The token travels in the JSON
body only: no path segment, no query parameter, no header, and no `GET` form. The
published surface grew by exactly one operation, 46 → 47.

**The target is read, never accepted.** The request has one field. The resolver
digests the token through the `APP4-P01` primitive and looks the grant up by that
digest alone; the customer and the request come back *from the grant row*. That
is a stronger binding than checking a caller-supplied pair — there is no pair for
a caller to get wrong, and no field in which to assert whose grant a token is.
`REQUEST_ACCESS` is a module constant passed positionally, never input.

Every unusable credential collapses to one `404 / SECURE_LINK_UNAVAILABLE`,
identical in status, code, message, field set and header set. There is no
cause-specific code and — the rule that is easiest to violate while feeling
helpful — **no second query after a miss** to discover why.

The abuse limit is read from the published `secure_link.resolve` policy on every
request, charged once per request **before** any HMAC work, and keyed on the
`X-Forwarded-For` entry the gateway itself appended. The limiter's signature
cannot see an outcome, so a valid token and a garbage token cost exactly the
same.

No `BLOCKED_BY_AUTHORITY` condition was reached. In particular §27.1 does **not**
apply: token-only resolution preserves target, purpose and scope semantics
without a public identifier, a weakened guard or a schema change (§D).

**No full regression/test chain was run.**

---

## B. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `a7c3844` (`docs(app4): record APP4-B05 commit evidence`) |
| Working tree at entry | clean |
| Accepted predecessors | P00 `CLOSED_AFTER_MANDATORY_DIRECTIVE`, G01 `PASS`, D01 `PASS`, P01 `PASS_AFTER_C1`, B01 `PASS_AFTER_C1`, W01 `PASS`, B02–B05 `PASS` |
| OpenAPI at entry | 41 paths, 46 operations, 88 schemas |
| OpenAPI at exit | 42 paths, **47** operations, 90 schemas |
| Migrations | 34 at entry, 34 at exit (`NO_APP4_MIGRATION` holds) |
| Endpoints delivered | **1** |
| Design | `NONE` — `APP4-S02` owns the screen |

---

## C. Authority / repository audit

Every path in §4 was read before any edit. The thirteen required facts:

| # | Question | Finding |
|---|---|---|
| 1 | `resolveActive` signature | `(tokenHash, { customerId, customRequestId, scopeKind }, now)` — all guards plus `expires_at > now` as predicates of **one** query |
| 2 | Can a delivered read resolve from digest alone? | **No.** `resolveActive` requires the target up front; `findById` takes a grant id; `listActiveForRequest` takes a request id. No token-only read existed. |
| 3 | Predicates the resolver requires | `token_hash`, `customer_id`, `custom_request_id`, `scope_kind`, `status = 'ACTIVE'`, `expires_at > now` |
| 4 | Authoritative caller context at B06 entry | **None.** The caller is anonymous; the secure link carries the token and nothing else. There is no customer session in APP4 (D-018). |
| 5 | Fields available for a safe projection | `custom_request_id`, `scope_kind`, `expires_at` (plus `id`, `customer_id`, which are withheld) |
| 6 | Canonical P01 digest | `digestSecret(pepper, raw)` — peppered `HMAC-SHA-256`, base64 |
| 7 | `secure_link.resolve` policy | `{ maxRequestsPerIpPerMinute: 30 }`, published by B01-C1; **no reader existed** — B06 adds one |
| 8 | Trusted client IP | `EphemeralNetworkKeyService` (Design module) — HMAC of the **right-most** `X-Forwarded-For` entry, the `APP3-E01` correction |
| 9 | Reusable limiter | `platform/rate-limit/sliding-window-rate-limiter.ts`, already shared by `LoginRateLimiter` and `DesignSessionRateLimiter` |
| 10 | Pre-identity audit writer | `StaffAuditWriter.loginFailed` — `SYSTEM` actor, sentinel target id, bounded `failureCode` |
| 11 | Request logging | `RequestLoggingInterceptor` logs route/method/status/duration; `safeRoute` strips query and fragment; `token`/`tokenhash`/`rawtoken` already in the redaction denylist. **No logger change needed.** |
| 12 | OpenAPI operation count at entry | 46 |
| 13 | Older checkers parsing the Customer HTTP surface | `check-app4-b03-contract.mjs`, `check-app4-b04-contract.mjs`, `check-app4-b05.mjs` — all three reconciled (§O.2) |

---

## D. Target-context resolution decision

This was the checkpoint's decisive question (§5), and the answer is **not** a
block.

**The problem.** `resolveActive` needs a customer, a request and a scope. The
public caller has a token. The two obvious ways to bridge that are both
forbidden: adding `customerId`/`customRequestId` to the request body would let
anyone holding a token assert whose grant it is, and dropping the predicates
would discard the binding altogether.

**The resolution.** `secure_access_grants.token_hash` is **globally unique**
(CST-008 / IDX-007), so a digest identifies at most one grant — and that grant
row *carries its own* `customer_id` and `custom_request_id`. So the binding is
**read from persistence instead of supplied to the query**:

```text
resolveActiveByTokenDigest(tokenHash, scopeKind, now)
  → token_hash = $1 AND scope_kind = $2 AND status = 'ACTIVE' AND expires_at > $3
```

This preserves G-DB7-38/39 rather than weakening them. A caller cannot influence
the target at all, which is strictly stronger than checking a pair it handed in.
`scopeKind` stays an argument — exactly as on `resolveActive` — because the one
legal value is business authority (ADR-DB3-004 r1) and belongs in the application
layer, not the adapter.

**Consequence for the six causes.** Two of them become *unreachable by
construction* rather than merely handled:

- **wrong target** — inexpressible. There is no request field to get wrong.
- **wrong scope** — unstorable. `GRANT_SCOPE_KINDS` has one member and
  `ck_secure_access_grants__scope_kind_allowed` refuses any other value, so no
  row can exist for the predicate to reject.

Both are covered honestly rather than faked: the target binding is proved
*positively* (each token opens only its own request), and the scope predicate is
exercised where it **is** expressible — from the argument side, in the repository
suite. Seeding either would have required dropping a CHECK or adding a request
field, i.e. breaking the guarantee in order to test it.

---

## E. HTTP contract

```text
POST /api/public/secure-links/resolve      publicSecureLink_resolve
body: { "token": "<43 base64url chars>" }  strict — additionalProperties: false
```

A **new controller** (`PublicSecureLinkController`), not a fifth method on
`PublicVerificationController`: the route prefix differs and Nest derives an
`operationId` from the class name, so folding it in would have published it under
`/public/verification/challenges` or renamed B03's and B04's four accepted
operations. No controller was split, renamed or re-prefixed; every prior
operation id is untouched.

**POST, not GET**, and not because a read "should" be a POST: a `GET` must carry
the token in a path or query, and both are written to the Nginx access log, the
application request log, every proxy between, and the `Referer` of any link the
landing page later renders. `ADR-APP4-001` §11 makes a query or path carrier
`FORBIDDEN` with no fallback.

Responses: `200`, `400` (malformed body), `404` (`SECURE_LINK_UNAVAILABLE`),
`429` (with `Retry-After`), `503` (unconfigured). The only declared parameter is
the platform's optional `X-Request-ID` header, which every operation carries.

---

## F. Token / digest lifetime

The raw token exists in exactly three places and no others: the request body, the
controller's validated `input.token`, and the first statement of
`ResolveSecureLink.resolve`, where it becomes a digest. It is never assigned to a
field, logged, echoed, audited, put in an error, or persisted.

The **digest** is treated as nearly as sensitive: it is the lookup key for the
credential (CST-008), so it too is a local that reaches only the repository
argument. It appears in no log, no audit summary and no response.

- P01's `digestSecret` is the only HMAC in the checkpoint. The checker refuses
  `createHmac`/`createHash`/`scrypt`/`timingSafeEqual` in every B06 file except
  the network-key service, which hashes an *address*, never a token.
- No raw-token comparison against persistence exists, because no raw value is
  stored.
- The published request schema carries **no `example`**: an example token is a
  credential-shaped literal rendered in Swagger UI and pre-filled into "try it
  out". The checker fails on `example`, `default` or `examples`.

---

## G. Eligibility and non-enumeration

One code, one message, one mapping:

```text
SECURE_LINK_UNAVAILABLE → 404 → "That secure link is not available."
```

`secureLinkUnavailable()` takes **no argument**, so there is nothing a caller
could pass that could vary the answer. `SECURE_LINK_ERROR_CODES` has exactly one
member; the checker fails if a second appears, in source or in the published
contract.

Structural same-path proof (§9) rather than a timing benchmark:

| Property | Evidence |
|---|---|
| one digest path | a single `digestSecret` call |
| one eligibility query | a single `resolveActiveByTokenDigest` call |
| one refusal mapping | `toSecureLinkHttpException`, one branch |
| **no diagnostic query after a miss** | the checker parses the `grant === undefined` branch and fails on any repository call inside it |
| no cause-specific provider call | no provider exists |

Observed equivalence, comparing responses **to each other** rather than to a
literal (a literal still passes if every cause drifts together): identical
status, identical `code`, identical body after normalizing only `requestId` and
`timestamp` — the two envelope fields that vary per *request* on every response
the platform emits — and an identical header set.

---

## H. Success projection

```json
{ "customRequestId": "…", "scopeKind": "REQUEST_ACCESS", "expiresAt": "…" }
```

Three fields, asserted closed both in the published schema and in the live
response body.

`grantId` is **excluded**: §10 admits it only if a delivered handoff proves it is
needed, and none does — `APP4-S02` renders the request, `APP4-B07` is Admin-side
with its own reads. Publishing it would be the natural thing for a later client
to put in a URL. `customerId` is excluded because naming a customer would turn a
token into a lookup into the identity graph. No contact, notification state,
audit field, revoke reason, lineage or APP5/APP6/APP7 business content appears.

---

## I. Rate limiting

`secure_link.resolve` → `maxRequestsPerIpPerMinute: 30`, read from
`PolicyConfigurationRepository` per request. No fallback: the literal `30` appears
in no source file (checker-asserted), and a missing or malformed value refuses.

**Outcome independence is structural.** `SecureLinkRateLimiter.check(networkKey,
policy)` has no parameter for a token, a grant or a result, and the controller
calls it exactly once, before resolution. The checker asserts the signature is
outcome-free, that the charge precedes the resolve, and that there is exactly one
charge per request.

Observed: 30 requests through, the 31st `429` with an integer `Retry-After`; a
budget fully spent on **failing** tokens still refuses a subsequent **valid**
one; the window reopens on an injected clock with no sleep; distinct sources are
independent.

Reuse rather than a new limiter: the algorithm is the platform's
`SlidingWindowRateLimiter`, provided in `CustomerModule` exactly as `DesignModule`
provides its own instance. In-process counters reset on restart and are not
shared across replicas — the documented, accepted limitation of every limiter
here; a distributed replacement is APP12.

**503, not 404,** for an unconfigured policy: it is a fact about the server, and
it is read before any token work, so the answer is identical for a valid token, a
garbage token and no token — it cannot be used to probe.

---

## J. Trusted client IP

`PublicNetworkKeyService` HMACs the **right-most** `X-Forwarded-For` entry under
a per-process CSPRNG salt. The right-most entry is the one the gateway appended
via `$proxy_add_x_forwarded_for`; the left-most is whatever the client sent.

This is the `APP3-E01` defect, and the suite reproduces the exact attack: 30
requests carrying a **different forged left-most entry each time** but the same
real client are all charged to one bucket, and the 31st is refused. A left-most
read would have allowed every one of them.

**Deliberate non-import, disclosed.** `EphemeralNetworkKeyService` does the same
job in the Design module. It was not imported: it is owned by `IMP-D043` PO-07,
it is parsed by four APP3 checkers, and making `CustomerModule` depend on
`DesignModule` for a twelve-line function would couple two contexts — while
editing it to share would have dragged four out-of-scope APP3 gates into this
checkpoint. The repository's own precedent is per-module ownership over one
shared *platform* algorithm. The cost is that the forwarding rule now exists
twice, so it is written out in full in the new file and pinned by the checker
(`hops[hops.length - 1]` required, `hops[0]` refused).

---

## K. Audit

| Outcome | Actor | Target | Detail |
|---|---|---|---|
| resolved | `CUSTOMER` + `customerId` + `grantId` | the grant | `customRequestId`, `scopeKind` |
| unavailable | `SYSTEM` / `customer.secure_link` | sentinel `secure_link_resolve` | `failureCode: SECURE_LINK_UNAVAILABLE` |

The success actor is truthful: after resolution the caller's identity is exactly
what the grant says it is.

The failure actor is the harder case, and §27.2 does **not** apply — the model
represents it without lying. Before resolution there is no identity: the token
may name nothing. `ANONYMOUS` is not persistable (CST-072), so this follows
`StaffAuditWriter.loginFailed` — a `SYSTEM` actor naming the subsystem, a
**sentinel target id** that is not a uuid and cannot collide with a real grant,
and a bounded failure class. `recordUnavailable()` takes **no argument**: the only
datum the request carried was the token, and the only thing derived from it was a
digest. Verified in the database: `customer_id` and `grant_id` are `null`.

The failure class is generic because the resolver genuinely does not know the
cause — recording one would require the diagnostic read §9 forbids.

---

## L. Logging and access-log secrecy

Nothing in B06 changed the logger, and nothing needed to:

- `RequestLoggingInterceptor` reads the request and logs route, method, status
  and duration — **never the body**;
- `safeRoute` strips the query string and fragment;
- `token`, `tokenhash` and `rawtoken` were already in the redaction denylist;
- the validation pipe maps a Zod issue to `{ field, code, message }` from a
  closed set and never carries the received value.

Observed with the recording log sink across both a success and a failure: the
token, its digest and the pepper appear in **no** log record; the logged route is
present and contains no `?`.

**Access-log proof** (§15). The token is in the body, and the URL is a static
literal — `/api/public/secure-links/resolve` — with no path parameter and no
query. Nginx's access log records the request line, i.e. that URL. Since no code
path can place the token in the URL (checker-asserted on the route, the OpenAPI
parameters and the generated client), the access log cannot contain it. No
container was launched for this: §21 permits source-and-config proof where the
routing is body-only, and the alternative would have been a broad Docker E2E for
a claim the static route already settles.

Verified at rest as well: a sweep of `audit_events` and `notification_intents`
for the test token returns nothing.

---

## M. Repository extension

One method, read-only, added to the port and its Drizzle adapter (§16):

```text
resolveActiveByTokenDigest(tokenHash, scopeKind, now): Promise<SecureAccessGrant | undefined>
```

- keyed on a **digest**, never a raw token — checker-asserted on the signature;
- selects only eligibility and safe-projection fields;
- keeps every predicate `resolveActive` enforces except the two target columns,
  which it *returns* instead — checker-asserted per predicate;
- one fixed-shape query, `limit(1)` over an already-unique column;
- no write — proved by snapshotting the row before and after both a hit and a
  miss;
- no schema, no migration.

`APP4-B05`'s issue, reissue and revoke behaviour is untouched.

---

## N. OpenAPI and client evidence

| Fact | Value |
|---|---|
| Paths | 41 → 42 |
| Operations | 46 → **47** |
| Schemas | 88 → 90 (`ResolveSecureLinkBody`, `SecureLinkResolutionResponse`) |
| Operation id | `publicSecureLink_resolve` |
| Verbs on the route | `post` only |
| Token parameters | none — path, query or header |
| Published token example | none |
| Generated client | `publicSecureLinkResolve(resolveSecureLinkBody, options?)` — body first, static URL, no token argument |
| Client determinism | `check:generated` passed; tree hash `081faa7f…` |
| TanStack hooks | none added |

---

## O. Checker evidence

### O.1 The new gate

`tools/check-app4-b06-contract.mjs` — **pass**, 26 rulings across 12 rule groups.
`tools/check-app4-b06-contract.test.mjs` — **42/42 pass**.

One case injects every forbidden term into a comment and asserts the gate stays
silent — these files are full of sentences like "no `?t=` fallback" and "no
diagnostic follow-up read", and a gate that failed on its own documentation would
be deleted.

**The mutation suite caught two genuinely weak rules on its first run**, each
strengthened rather than the mutation weakened:

| Weak rule | Why it passed a real defect | Strengthened to |
|---|---|---|
| fixed scope | the constant existing *somewhere in the file* satisfied it, while the call passed `command.scopeKind` | assert the **second positional argument** of `resolveActiveByTokenDigest` |
| 404 mapping | `NotFoundException` appearing anywhere satisfied it, while the import was repointed | assert the mapper's **`return new NotFoundException(`** |

Two further mutation anchors were wrong and were corrected against real source.

### O.2 Reconciliation of three older checkers (§19)

B06 publishes a route that all three older gates were written to forbid, and adds
files into directories B03 sweeps. Each was reconciled **only** where it now
false-positives, following the precedent already recorded in B03's own source
("that was true then and is stale now").

| Checker | Stale assumption | Restated as |
|---|---|---|
| B03 | "no grant/secure-link path exists"; directory sweep covers B06's files | that exact path with that exact verb is authorized; a `B06_FILES` exclusion beside the existing `B04_FILES`, with the same "the exemption names files that exist" guard |
| B04 | 46 operations; "no grant/secure-link path" | 47; the one authorized path, still one POST |
| B05 | 46 operations; zero secure-link paths; no controller matching `SecureLink` | 47; the one authorized path; `PublicSecureLinkController` named explicitly |

**Every relaxation is paired with a negative assertion proving the old invariant
still holds** — added to all three mutation suites: a *second* secure-link route,
a grant route that is not the resolver, a `GET` form of the resolver, a grant
controller registered beside B06's, and a B03 file reaching for a grant all still
fail. Suites: B03 47 → **51**, B04 53 → **56**, B05 48 → **51**, all passing.

No other checker was run. The G01 gate was **not** run: B06 changes no G01-owned
parsed source.

---

## P. Focused tests

| Suite | Result |
|---|---|
| `secure-link-resolve-api.integration.spec.ts` | 15 pass |
| `secure-link-repository.integration.spec.ts` | 7 pass |
| `secure-link-rate-limit.integration.spec.ts` | 6 pass |

Real HTTP through the whole booted application: real controller, real global
validation pipe and exception filter, real repository, real audit trail, real
recording log sink, disposable PostgreSQL with every migration applied. The only
overridden provider is the platform limiter's clock, in the limiter suite alone,
so a sixty-second window is provable in milliseconds. **Nothing sleeps.**

Custom Request rows are seeded with raw SQL and labelled **fixture scaffolding —
not an APP5 submission**; `custom_request_id` is NOT NULL with an FK RESTRICT, so
a grant cannot exist without one.

### P.1 Two test-quality corrections made during the work

1. The repository suite pinned "now" to a literal instant while the fixture
   stored `now() + interval` from the **database** clock. It passed only because
   of the date it ran on. Both instants are now derived from the row's own stored
   expiry.
2. The six-cause body comparison initially failed on the envelope's `timestamp`.
   That is request-invariant rather than cause-specific, so it is normalized
   alongside `requestId` — and only those two.

---

## Q. Validation ledger

Change-impact only. **Every command below ran once.** No successful command was
repeated, and no validation chain was restarted after a failure — each failure
was fixed at its source and only the affected command re-run.

| # | Command | Result |
|---|---|---|
| 1 | `npx jest test/integration/secure-link-resolve-api …repository …rate-limit` | 3 suites, 28 tests pass |
| 2 | `npx tsc --noEmit` (apps/api) | clean |
| 3 | `pnpm openapi:generate` (apps/api) | 42 paths / 47 operations / 90 schemas |
| 4 | `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `081faa7f…` |
| 5 | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| 6 | `node tools/check-app4-b06-contract.mjs` | pass |
| 7 | `node --test tools/check-app4-b06-contract.test.mjs` | 42/42 pass |
| 8 | `node tools/check-app4-b03-contract.mjs` + its `--test` suite | pass · 51/51 |
| 9 | `node tools/check-app4-b04-contract.mjs` + its `--test` suite | pass · 56/56 |
| 10 | `node tools/check-app4-b05.mjs` + its `--test` suite | pass · 51/51 |
| 11 | `npx eslint` over the changed scope | clean |
| 12 | `npx prettier --check` over the changed set | clean |
| 13 | `node tools/check-report-secrets.mjs` | pass |
| 14 | `git diff --cached --check` | clean |

Rows 8–10 ran **because reconciliation was actually required** (§O.2), which §22.9
permits; they were not run for reassurance.

**Not run**, per §22: full API Jest, full CustomerModule, full persistence, B01/W01
runtime, B02–B05 runtime suites, full P01, worker tests, frontend/Playwright,
Figma, DB manifest/migration regression, the G01 checker, Sonar, repo-wide
build/typecheck/lint, aggregate chains.

**No full regression/test chain was run.**

### Q.1 One disclosure

`tools/check-app4-b06-contract.mjs` is 622 lines against the 450 soft cap §24
calls preferred. §24 also says not to create a correction solely for tooling line
count, so it is disclosed rather than split. Runtime source and tests are all
within the hard limits — largest source 215 lines, largest test 409.

---

## R. Files changed

**New — source (10)**

```text
apps/api/src/modules/customer/domain/grant/secure-link.errors.ts
apps/api/src/modules/customer/domain/grant/secure-link-policy.ts
apps/api/src/modules/customer/infrastructure/policy/secure-link-policy.reader.ts
apps/api/src/modules/customer/infrastructure/rate-limit/secure-link-rate-limiter.ts
apps/api/src/modules/customer/infrastructure/rate-limit/public-network-key.service.ts
apps/api/src/modules/customer/application/resolve-secure-link.query.ts
apps/api/src/modules/customer/application/secure-link-audit.recorder.ts
apps/api/src/modules/customer/presentation/public-secure-link.controller.ts
apps/api/src/modules/customer/presentation/schemas/secure-link-resolve.request.ts
apps/api/src/modules/customer/presentation/schemas/secure-link-resolution.response.ts
```

**New — tests and tooling (6)**

```text
apps/api/test/support/secure-link-fixture.ts
apps/api/test/integration/secure-link-resolve-api.integration.spec.ts
apps/api/test/integration/secure-link-repository.integration.spec.ts
apps/api/test/integration/secure-link-rate-limit.integration.spec.ts
tools/check-app4-b06-contract.mjs
tools/check-app4-b06-contract.test.mjs
```

**Modified (11)**

```text
apps/api/src/modules/customer/customer.module.ts                     controller + providers
apps/api/src/modules/customer/domain/repositories/
  secure-access-grant.repository.ts                                  one read-only method
apps/api/src/modules/customer/infrastructure/persistence/
  drizzle-secure-access-grant.repository.ts                          its implementation
apps/api/test/support/api-integration-context.ts                     optional configure hook
packages/contracts/openapi/openapi.generated.json                    generated
packages/api-client/src/generated/embroidery-api.ts                  generated
packages/api-client/src/generated/embroidery-api.schemas.ts          generated
tools/check-app4-b03-contract.mjs + .test.mjs                        §19 reconciliation
tools/check-app4-b04-contract.mjs + .test.mjs                        §19 reconciliation
tools/check-app4-b05.mjs + .test.mjs                                 §19 reconciliation
```

No schema, no migration, no `.env` write, no frontend, no worker change.

---

## S. Git evidence

Committed on `production`, **not pushed**. Working tree clean at exit.

Implementation commit: `7ad1629` — `feat(app4): resolve public secure links without a caller-supplied target`. 30 files, +4222/−17. Not pushed; `origin/production` is unchanged.

---

## T. Next checkpoint

```text
APP4-B07
```

Admin customer/grant support. It was **not** started.

What B06 deliberately left for later: `APP4-S02` owns the browser fragment
bootstrap (`#t=` read, `history.replaceState`, body POST); `APP4-B07` owns the
Admin grant surface; `APP4-B08` owns manual notification replay.
