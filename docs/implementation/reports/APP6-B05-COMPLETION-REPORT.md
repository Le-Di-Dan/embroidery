# APP6-B05 — Customer Quotation Acceptance and Rejection — Completion Report

## 1. Verdict

```text
APP6-B04 = ACCEPTED (cef99b7)
APP6-B05 = COMPLETE
HTTP OPERATIONS ADDED = 2
ACCEPT = TR-LC12-03 DELIVERED
REJECT = TR-LC12-06 DELIVERED
REQUEST_ACCESS = REUSED
CUSTOMER/REQUEST AUTHORITY = GRANT-DERIVED
ACCEPT EXACT VERSION = ENFORCED
ACCEPT STEP-UP = ENFORCED
REJECT STEP-UP = NOT REQUIRED
GRD-006 CURRENT+SENT+UNEXPIRED = IN-TRANSACTION
CC-05 = PROVED
CC-06 = PROVED
CC-16 = PROVED
QUOTATION.ACCEPT IDEMPOTENCY = DELIVERED
ACCEPTANCE EVIDENCE = IMMUTABLE / SINGLE
TR-LC11-06 = SYSTEM PROJECTION IN SAME TX
DIRECT QUOTE_ACCEPTED COMMAND = ABSENT
REJECTION DOES NOT PROJECT REQUEST TO REJECTED
QUOTATION.ACCEPTED OUTBOX EVENT = ABSENT
QUOTATION.REJECTED OUTBOX EVENT = ABSENT
ORDER/PAYMENT/INVENTORY SIDE EFFECTS = NONE
EXACT MONEY = STRING END TO END
DATABASE MIGRATION = NONE
B06 = NOT STARTED
NEXT CHECKPOINT = APP6-B06
```

## 2. Entry state

| Fact | Value |
|---|---|
| Entry `HEAD` | `63393e9` |
| `APP6-B04` commit | `cef99b7` — verified reachable (`git merge-base --is-ancestor cef99b7 HEAD`) |
| Working tree at entry | clean |
| Branch | `production` |
| OpenAPI at entry | 63 paths · 69 operations · 144 schemas |

The five accepted Admin quotation operation ids and `publicQuotation_current`
were confirmed present and unchanged both before the work and in the regenerated
artifact (§18).

## 3. The two operations

```text
POST /api/public/quotations/accept  → publicQuotation_accept
POST /api/public/quotations/reject  → publicQuotation_reject
```

Both publish under the **existing** `publicQuotation` domain. They live on a
second controller class, `PublicQuotationDecisionController`, mapped onto that
domain by `CONTROLLER_DOMAIN_KEYS` — the same device, and the same reason, as
`AdminCustomRequestController` / `AdminCustomRequestModerationController`:
`APP6-B04`'s read module is *defined* by holding no `TransactionManager` and no
write repository, and these two writes need both. Merging them in would delete
`APP6-B04`'s documented security property to gain nothing, and without the
registry entry a file-layout decision would have minted
`publicQuotationDecision_accept`.

Not published, and deliberately: no `/status`, `/respond` or `/decision`, no
generic state mutation, no `PATCH /quotations/{id}`, no identified public
quotation path (asserted: every `/api/public/quotations*` path is a fixed
segment with no `{` in it), and no third operation for step-up — re-verification
is APP4's existing public flow, unchanged.

Verb: `POST` for both. `ADR-APP4-001` §11 makes the URL fragment the sole
browser carrier and declares a path or query carrier `FORBIDDEN` with no
fallback. Both operations also genuinely mutate, so the verb is honest as well
as necessary.

## 4. Request bodies

```jsonc
// AcceptQuotationBody, RejectQuotationBody — identical, both .strict()
{ "token": "<43 base64url chars>", "versionId": "<uuid>" }
```

Two fields. Every absence is a rule:

- no `quotationId`, `requestId` or request `code` — the quotation is reached
  through the two pointers `APP6-B03` set, from the request the **grant row**
  names;
- no `customerId`, `email` or `phone` — identity is grant-derived (`APP6-G01`
  §8);
- no `grantId`, no `scopeKind` — `REQUEST_ACCESS` is authority (ADR-DB3-004 r1),
  not input;
- **no `challengeId`** — the field `APP6-B04` §5 explicitly reserved for this
  checkpoint. GRD-003 is satisfied by evidence the server *derives* from the
  grant's customer (§7). The rejected alternative was not unsafe; it was
  pointless and fragile — everything a server would have to prove about a
  client-supplied id is the query it can run anyway, and a customer who verified
  twice, or verified on their second contact, would be refused for sending an id
  that was real, theirs and fresh;
- **no `acceptedTotalAmount`** and no confirmation boolean. A sent version's
  amounts are frozen by `trg_quotation_versions__reject_mutation`, so naming the
  version *is* naming the price; an amount field would only add a way for a
  correct decision to be refused over `1500000.00` versus `1500000.0`. The
  `APP6-G01` §10 fingerprint still carries the total — read off the frozen row
  **inside** the transaction, where it is authority rather than a claim;
- **no rejection reason.** LC-12 marks it optional and the schema offers nowhere
  to keep one: `quotation_versions` has `void_reason` for `TR-LC12-07` and
  nothing for a rejection, and `quotations` has no reason column at all.
  Accepting text the database cannot store would be a promise to the customer
  that nothing honours. The rejection instant lives in the audit row (§8).

`versionId` is a **fingerprint, not a locator**: it must equal the version the
two server-side pointers already reached. A version id belonging to another
quotation resolves to a real row and is refused before anything is written.

No `example` is published for the token, and neither operation declares a
security scheme or any parameter beyond the platform-wide `X-Request-ID` header.

## 5. Secure preflight, and why it is not the write's authority

Both routes run `AuthorizeSecureLink` **before** the transaction opens — the
identical fail-closed policy read, `secure_link.resolve` abuse budget and
peppered digest `APP6-B04` uses, so a caller cannot escape that budget by
spreading token guesses across the read and the two decisions. A refusal there
writes nothing, because there is no transaction yet.

That admission is a **snapshot**, and ADR-DB3-004 r9 requires a sensitive action
to re-establish its authority inside its own transaction. Two new APP4
capabilities close the gap; both are exported as capabilities, never as
machinery, on the rule `CustomerModule` already records.

### `ReauthorizeSecureGrant` (new)

Digests the raw token and re-resolves the grant **under its row lock**, via a
new repository method:

```text
SecureAccessGrantRepository.lockActiveByTokenDigest(tokenHash, scopeKind, now)
  → SELECT … WHERE token_hash = … AND scope_kind = 'REQUEST_ACCESS'
              AND status = 'ACTIVE' AND expires_at > now
    FOR UPDATE
```

The predicate is character-for-character `resolveActiveByTokenDigest`'s, so the
write can never re-check a different definition of "live" from the read that
admitted it. The lock is what makes CC-16 decidable in **both** directions: a
revoke that commits first is seen; a revoke arriving later blocks on the row
until the acceptance transaction ends, rather than committing beside it.

It re-establishes the *authorization fact* only — the policy is not re-read, the
abuse budget is not charged twice and no second resolution-audit row is
appended. It also returns what `ResolvedSecureLink` deliberately withholds
(`grantId`, `customerId`), which TBL-053 requires under real foreign keys, taken
**from the grant row** rather than from any caller.

Every failing reason — unknown digest, expired, revoked, superseded, wrong scope
— leaves as the same `SECURE_LINK_UNAVAILABLE` object APP4 throws. There is no
diagnostic follow-up read.

### The chain, re-walked in the transaction

`QuotationDecisionTargetResolver` re-walks and re-proves the whole path, with
every containment invariant checked rather than assumed:

```text
grant (locked)
  → grant.customRequestId
  → custom_requests.current_quotation_id
  → quotations.current_version_id
  → the named version, which must be that one

quotation.customRequestId === grant.customRequestId   (G-DB7-04)
version.quotationId       === quotation.id            (G-DB7-03)
quotation.currentVersionId === the version named       (GRD-006)
```

Missing request row, unset pointer, foreign quotation, foreign version and a
dead grant all leave as one `SECURE_LINK_UNAVAILABLE`.

The "named version is not the current one" code is the **caller's**, because the
two decisions publish different codes for the same fact and the difference is
authority: GRD-006 guards acceptance (`QUOTE_VERSION_STALE`), while
`TR-LC12-06` has no GRD-006 and `APP6-G01` §10 names `INVALID_TRANSITION` for a
rejection the version's state cannot start from — the same answer a repeat
rejection gets. One shared code would have published an invented refusal on one
of the two surfaces.

## 6. Acceptance transaction (`TR-LC12-03` + `TR-LC11-06`)

```text
authorize the secure link          (pre-transaction: policy, budget, digest)
BEGIN
  re-establish the grant under its row lock; re-walk grant → request →
    quotation → version, proving every containment          (ADR-DB3-004 r9)
  claim quotation.accept on this exact version
    replay? → return the committed acceptance, write nothing
  require a fresh STEP_UP for this customer                 (GRD-003)
  lock the request row (lockById) and judge QUOTED → QUOTE_ACCEPTED
  QuotationRepository.accept:
      SELECT … FOR UPDATE OF quotation_versions
        WHERE id = versionId AND status = 'SENT'
          AND (valid_until IS NULL OR valid_until > acceptedAt)
      require quotations.current_version_id = versionId      (GRD-006)
      UPDATE version → ACCEPTED, accepted_at
      INSERT quotation_acceptances                           (TBL-053)
      UPDATE quotations → ACCEPTED
  requests.transition(QUOTED → QUOTE_ACCEPTED, actor SYSTEM,
                      expectedFrom = the locked state)       (TR-LC11-06)
  append the quotation.accepted audit row
  idempotency.complete(key, replayable result)
COMMIT
```

There is no `try`/`catch` inside the transaction that could let a subset commit,
and no compensation path.

**Lock order, and a real finding.** The request row is locked **before** the
version row, matching `APP6-B03`'s send. That ordering turned out to be
load-bearing rather than stylistic: `update quotations` re-checks
`fk_quotations__custom_request_id` and therefore takes a key-share lock on the
parent `custom_requests` row. Any AGG-14 write path consequently reaches the
request row, and a transaction that touches the version first and the request
second inverts against every other writer. The delivered send use case and this
acceptance both take it explicitly and first; the inversion was found because a
hand-rolled race fixture skipped it and deadlocked (§9), and the fixture was
corrected to drive the delivered send use case rather than the lock order being
bent to accommodate it.

**Claim before step-up, deliberately.** A replay performs no write. Gating it on
a still-open step-up window would tell a customer retrying an hour after a
dropped response to re-verify in order to be shown a decision they had already
made. It discloses nothing new either: `APP6-B04`'s read already returns the
accepted status to the same holder of the same live grant. Every path that
*writes* still passes GRD-003 first — proved by the suite, which shows a refused
acceptance leaving no idempotency record at all.

## 7. GRD-003 — step-up evidence, server-derived

`StepUpEvidenceResolver` (new, in `CustomerModule`) answers *which* fresh
`STEP_UP` stands for this customer right now:

1. read the published `secure_grant` policy (fail-closed — no constant, no
   default) and compute `stepUpNotBefore`;
2. list the grant-derived customer's contact points, keeping only the
   **verified, non-deactivated** ones;
3. for each, `findRecentCompleted(kind, value, 'STEP_UP', notBefore)` — a new
   repository read beside `hasRecentCompleted`, ordered by `verified_at desc`
   with `id` as a deterministic tie-break;
4. return the most recent proof, or nothing.

`hasRecentCompleted` was **not** widened into an id-returning method: its
consumer `StepUpWindow.isSatisfied` is contractually a boolean and must keep a
query that reads one column and stops at the first row.

Acceptance outcomes stay distinct:

| Condition | Answer |
|---|---|
| grant invalid / unavailable | `404 SECURE_LINK_UNAVAILABLE` |
| grant valid, no fresh `STEP_UP` | `403 REVERIFICATION_REQUIRED` |

The distinction is safe: `REVERIFICATION_REQUIRED` is only reachable *after* the
caller has proved possession of a live grant for this request, so it discloses
nothing it did not already hold — and collapsing the two would leave the screen
unable to tell "confirm your contact again" from "your link is dead".

Proved: no step-up at all, a step-up older than the published window, a fresh
`SUBMISSION` (which is not evidence of presence now), and **another customer's**
fresh `STEP_UP` — all `REVERIFICATION_REQUIRED`, all with zero writes.

Rejection injects no step-up capability at all (`TR-LC12-06` lists GRD-002
alone), so it cannot be made to require one by editing that file.

## 8. Evidence, actors and events

**TBL-053** is written by the delivered `QuotationRepository.accept`; no
application SQL bypasses it. Every column binds a server-validated fact:

| Column | Source |
|---|---|
| `quotation_version_id` | the version the pointers reached |
| `customer_id` | the grant row |
| `grant_id` | the grant row |
| `step_up_challenge_id` | derived evidence (§7) |
| `accepted_total_amount` | the frozen version's own `total_amount`, copied off the row `accept` just locked |
| `currency_code` | the frozen row |

`uq_quotation_acceptances__qversion` (CST-038) makes a second row per version
impossible, and `trg_quotation_acceptances__reject_mutation` makes the row
immutable. Asserted directly against the committed rows.

**Actors are two different facts and stay apart.** The audit row says the
*customer* decided (`CUSTOMER`, carrying `grant_id`); the request transition says
the *system* moved the request (`SYSTEM`, `system_job_key = 'quotation.accept'`,
`admin_id` and `customer_id` both `NULL`). Both asserted.

**Events.** `QuotationDecisionRecorder` has no `OutboxEventStore` in its
constructor and `CustomerQuotationDecisionModule` binds none, so neither decision
can emit one — `APP6-G01` §9 records `quotation.accepted` and
`quotation.rejected` as **not** emitted. Asserted as a zero count on
`outbox_events` for both event types. No notification intent was created and
APP4's notification architecture was not touched.

The rejection audit row carries `{ quotationId, version }` and **no amount**: a
rejection agrees to nothing, so republishing the declined price would add a money
fact to a record whose whole content is that the customer said no. It is also the
only durable home for the rejection instant, since the version row has
`accepted_at`, `superseded_at`, `expired_at` and no rejected timestamp.

## 9. `quotation.accept` idempotency

```text
namespace   = quotation.accept
scope key   = the exact quotation version id
fingerprint = sha256(len:versionId | len:acceptedTotalAmount)
ttl         = 24h
replay      = the committed acceptance projection
```

The delivered `IdempotencyStore` is used exactly; no parallel mechanism and no
`Idempotency-Key` header were introduced. The scope key is the version id
itself, not a hash of it — `APP5-B01` uses the verified challenge id on the same
reasoning, and hashing an already-opaque server-chosen id would only make a stuck
claim unreadable to an operator.

The total is redundant given the scope (a sent version's amounts are frozen), so
`IDEMPOTENCY_CONFLICT` is unreachable through the delivered write paths. It is
carried because the accepted contract names it, and because the redundancy is the
useful kind: were a sent total ever made mutable, a conflict is exactly the
outcome anyone would want instead of a silent replay for a different amount.

Proved:

- a second acceptance returns `replayed: true` with identical version, total and
  `acceptedAt`, and the database still holds **one** TBL-053 row, **one**
  `QUOTED → QUOTE_ACCEPTED` transition and **one** audit row;
- exactly one `idempotency_records` row exists, `COMPLETED`, scoped to the
  version;
- the replay still serves after the step-up window has closed;
- a refused acceptance leaves **no** record — not `COMPLETED`, not a phantom
  `IN_PROGRESS` — and a genuine retry then succeeds as a first acceptance.

## 10. GRD-006 — CC-05 and CC-06

**CC-05 (stale version).** Enforced twice: by the target resolver against the
current pointer, and authoritatively by `QuotationRepository.accept` under
`FOR UPDATE OF quotation_versions`. Proved that after a newer send, the old
version answers `QUOTE_VERSION_STALE` with the old version `SUPERSEDED`, no
evidence row, no transition and the request still `QUOTED`; and that accepting
the **newer** version instead succeeds. The customer must re-read and decide
again — nothing silently accepts the new price.

**CC-06 (validity boundary).** Evaluated in-transaction against
`valid_until > acceptedAt`, so the named instant is already outside the window.
Expressed by constructing a legal window that has already elapsed (sent 120
minutes ago with a 60-minute validity), not by waiting and not by back-dating a
frozen column — `trg_quotation_versions__reject_mutation` freezes both window
columns the moment the version leaves `DRAFT`. Proved that a closed window
refuses with no partial mutation, that a window one minute from closing is
accepted, and that **correctness does not depend on the sweep**: the version is
`SENT` before the refusal and still `SENT` after it, so `TR-LC12-05` never ran
and the refusal wrote nothing either.

## 11. Race proofs

Three cases, each on real independent PostgreSQL connections, each following the
`APP6-B03` shape: a third connection takes the contended row's lock first, both
contenders block, the suite waits on a **real condition** (`pg_locks where not
granted`) rather than a duration, then releases. Which side wins is left to
PostgreSQL and never asserted; what is asserted is that both outcomes are whole.

| Case | Contended row | Outcomes proved |
|---|---|---|
| **CC-05** — acceptance vs the delivered `APP6-B03` send | `custom_requests` (see §6) | *Accept wins:* version `ACCEPTED`, one evidence row, one transition, request `QUOTE_ACCEPTED` — and the send **refuses** rather than inventing a backward reopen, leaving the competing draft a `DRAFT`. *Send wins:* `QUOTE_VERSION_STALE`, version `SUPERSEDED`, no evidence, no transition, request `QUOTED`, the new version `SENT` |
| **CC-16** — grant revoke vs acceptance | `secure_access_grants` | *Accept wins:* everything commits whole and the revoke lands afterwards. *Revoke wins:* `SECURE_LINK_UNAVAILABLE`, version `SENT`, no evidence, no transition, request `QUOTED` |
| **Request-state race** — acceptance vs cancellation | `custom_requests` | *Accept wins:* the acceptance commits whole and the later `QUOTE_ACCEPTED → CANCELLED` is legal. *Cancel wins:* `INVALID_TRANSITION`, nothing accepted, request `CANCELLED`. Either way the request gains no self-edge and no duplicate move out of `QUOTED` |

There is no process-local mutex anywhere on the decision path.

CC-05 originally deadlocked. The cause was a fixture that folded `TR-LC12-01`
and `TR-LC12-02` into one transaction and drove the repository directly, giving
the competing writer a lock order no delivered path takes; the underlying fact it
surfaced — that `update quotations` key-share-locks the parent `custom_requests`
row — is recorded in §6. The fixture now drives the real
`SendQuotationVersionUseCase`.

## 12. Atomic rollback

Failure injected at the **last** write inside the acceptance transaction (the
audit recorder), by which point the version is `ACCEPTED`, the TBL-053 row is
inserted, the header is `ACCEPTED`, the request is `QUOTE_ACCEPTED`, the
transition row exists and the idempotency claim is held.

After the rollback, all of it is gone: version `SENT`, header `SENT`, request
`QUOTED`, zero acceptance rows, zero transition rows, zero audit rows and zero
idempotency records — no falsely `COMPLETED` claim and no orphaned `IN_PROGRESS`
one. A genuine retry then commits as a **first** acceptance (`replayed: false`),
with exactly one evidence row.

## 13. `TR-LC11-06` — system projection only

The customer commands an acceptance; nobody commands a request state.
`AcceptQuotationCommand` carries a credential and a version id and has nowhere to
put a target state, an actor or a timestamp. The transition is appended in the
**same** transaction with `actor = SYSTEM`, `systemJobKey = 'quotation.accept'`
and `expectedFrom` set to the state read under the request's row lock.

`QUOTE_ACCEPTED` did **not** become a generic transition target: APP5-B05's Admin
transition API is untouched, and no separate state-sync call exists anywhere.
When the request has already left `QUOTED`, the acceptance fails atomically with
`INVALID_TRANSITION` rather than accepting the quote and leaving request state
behind — proved against a `CANCELLED` request and in the race above.

## 14. Rejection is quotation-scoped

`RejectQuotationUseCase` does not inject `CUSTOM_REQUEST_REPOSITORY` at all, so
no path there can move the Custom Request — the rule is structural, not
remembered. `APP5-G01` supplies the reason: `REJECTED` on a request is an Admin
moderation outcome from the pre-quotation review lifecycle ("we will not take
this job"), and a customer declining a price means something else.

`QuotationRepository.reject` (new, narrow) takes the same lock and the same
containment proof as `accept`, minus the validity window — GRD-006 guards
acceptance, not refusal, and a customer declining an offer that lapsed while they
thought about it is stating something true. Version `SENT → REJECTED`, header
`→ REJECTED`, and `current_version_id` is left pointing at the rejected version
because it is still the version this quotation last put in front of the customer.

Natural idempotency, no namespace (`APP6-G01` §10). Proved:

- a repeat rejection answers `INVALID_TRANSITION`, with still exactly one audit
  row and the version still `REJECTED`;
- rejecting an already-**accepted** version is refused and leaves the acceptance
  and the `QUOTE_ACCEPTED` request intact;
- rejecting a **superseded** version is refused and the live offer is untouched
  — header still `SENT`, pointer still on the newer version, newer version still
  `SENT`;
- rejecting **another customer's** version answers `INVALID_TRANSITION`, the same
  code a repeat gets, so the two are indistinguishable;
- a revoked grant answers `SECURE_LINK_UNAVAILABLE`;
- the request stays `QUOTED` with **zero** transition rows, and the workshop can
  then send a further version under the existing B01/B03 rules;
- no acceptance evidence, no idempotency record, no outbox event, and the frozen
  amounts and line items are byte-identical before and after.

`REVERIFICATION_REQUIRED` is unreachable from rejection — proved by rejecting
successfully as a customer with **zero** verification challenge rows.

## 15. Exact money

```text
numeric(14,2) → repository string → domain view string → OpenAPI `type: string`
              → generated client `acceptedTotalAmount: string`
```

There is no `Number()`, no `parseFloat`, no arithmetic and no re-rounding on
either decision path. The accepted total is the frozen version's own
`total_amount`, copied into TBL-053 by the repository off the row it just locked,
so the evidence cannot record a figure the application invented. Asserted:
the response, the evidence row and the frozen row carry the identical string,
matching `/^\d+\.\d{2}$/`.

## 16. Public error contract

| Condition | Status | Code |
|---|---|---|
| unknown / expired / revoked / superseded / wrong-scope token, unreachable target | `404` | `SECURE_LINK_UNAVAILABLE` |
| valid grant, no fresh step-up (accept only) | `403` | `REVERIFICATION_REQUIRED` |
| newer version sent, or `now >= valid_until` (accept only) | `409` | `QUOTE_VERSION_STALE` |
| request cannot carry the move; any version state a rejection cannot start from | `409` | `INVALID_TRANSITION` |
| another acceptance of this version in flight | `409` | `DUPLICATE_OPERATION` |
| same scope, conflicting fingerprint | `409` | `IDEMPOTENCY_CONFLICT` |
| `secure_grant` policy unpublished/unusable | `503` | *(no code — opaque message)* |
| malformed body / rate limit / unexpected | `400` / `429` / sanitised `500` | platform |

`403` rather than `401` for re-verification: the caller *is* authenticated as far
as this surface has an identity, and there is no `WWW-Authenticate` challenge a
browser could act on. `SECURE_LINK_UNAVAILABLE` is thrown from APP4's own module
unchanged rather than re-created here, so a bad token gets *the same object* on a
write as on a read. No internal resource-not-found, constraint name or database
diagnostic reaches either surface.

## 17. No downstream side effects

Asserted as zero rows after a committed acceptance: `orders` for the request,
`payment_obligations`, `inventory_reservations`, and `outbox_events` of either
type. No soft hold (LC-12 lists it as *optional* and APP6 stops before APP7). No
order, payment or inventory module is imported by
`CustomerQuotationDecisionModule`, so none is reachable from the injector rather
than merely left undone. The success responses claim nothing about payment or
order creation.

## 18. OpenAPI and generated client — one controlled cycle

| Metric | Before | After |
|---|---|---|
| paths | 63 | **65** |
| operations | 69 | **71** |
| schemas | 144 | **148** |

Diff, computed against `HEAD`'s committed artifact:

```text
ADDED:    publicQuotation_accept  POST /api/public/quotations/accept
          publicQuotation_reject  POST /api/public/quotations/reject
REMOVED:  (none)
SCHEMAS ADDED:   AcceptQuotationBody, RejectQuotationBody,
                 QuotationAcceptedResponse, QuotationRejectedResponse
SCHEMAS REMOVED: (none)
```

`publicQuotation_current`, the five accepted Admin quotation ids and every
APP4/APP5 secure-link id are unchanged (asserted in the contract suite as well as
in the diff). Generation ran **once** for OpenAPI and **once** for the client; no
regeneration loop. Both drift gates pass, and `@embroidery/api-client` and
`@embroidery/contracts` typecheck clean.

## 19. Reconciled older contract assertions

Publishing routes into a frozen surface forces reconciling every older checker
that froze it. Five assertions were touched; **four of them were already red at
`HEAD`** — confirmed by running the presentation suites in a stashed, pristine
tree, which reported `4 failed, 59 passed`. `APP6-B04` had widened the
`publicQuotation` surface without reconciling them.

| File | Assertion | Change |
|---|---|---|
| `admin-quotation.contract.spec.ts` | `quotationOperations()` | Predicate scoped from `path.includes('quotation')` to `path.startsWith('/api/admin/quotations')` — this file's own subject. The wider predicate did not make the assertion stronger; it made it fail for a reason it was not written to detect (**pre-existing red**) |
| `admin-quotation.contract.spec.ts` | "publishes no accept, reject, status or expire route" | Narrowed exactly as the `/send` assertion was narrowed when B03 landed: one accept and one reject now exist, both are customer routes, **neither is on this controller**, and `status`/`expire` remain forbidden outright |
| `admin-quotation-version.contract.spec.ts` | `quotationOperations()` | Same scoping (**pre-existing red**) |
| `admin-quotation-version.contract.spec.ts` | "the whole quotation family at five operations" | Comment reconciled: the count is the **Admin** family, and the three customer operations are a different published domain frozen by their own suites (**pre-existing red** ×2 with the id assertion) |
| `public-quotation.contract.spec.ts` | "exposes no public quotation collection, history or identified read" | The two new fixed sub-paths listed, and the property the test exists for asserted **directly** — no `{` in any public quotation path — where it cannot be lost by adding a name to a list |

No unrelated historical gate was repaired.

## 20. Validation ledger

Every command below was run on the changed inputs it is scoped to. A successful
command was not rerun on unchanged inputs; the reruns are listed with the concrete
change that justified each.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api typecheck` | pass (run 4× — after the APP4 capabilities, after the fixture, after the CC-05 rewrite, after the lint fixes) |
| 2 | `npx jest src/modules/quotation/presentation/public-quotation-decision.contract.spec.ts` | **24 pass** |
| 3 | `npx jest --runInBand src/modules/quotation/tests/integration/customer-quotation-accept.integration.spec.ts` | **25 pass** |
| 4 | `npx jest --runInBand src/modules/quotation/tests/integration/customer-quotation-reject.integration.spec.ts` | **16 pass** |
| 5 | `npx jest --runInBand src/modules/quotation/tests/integration/customer-quotation-decision-race.integration.spec.ts` | **3 pass** |
| 6 | `npx jest --runInBand src/modules/quotation` | **253 pass / 17 suites** |
| 7 | `npx jest --runInBand src/modules/customer` | **333 pass / 23 suites** (APP4 ports, adapters and module all changed) |
| 8 | `pnpm --filter @embroidery/api openapi:generate` | 65 / 71 / 148 — run **once** |
| 9 | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 10 | `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `7c166967…` — run **once** |
| 11 | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| 12 | `pnpm --filter @embroidery/api-client typecheck` · `pnpm --filter @embroidery/contracts typecheck` | pass |
| 13 | `npx prettier --check <changed files>` | pass (after one `--write`) |
| 14 | `npx eslint src/modules/quotation src/modules/customer src/openapi src/bootstrap` | pass (after removing three redundant type assertions and two now-unused imports) |
| 15 | `git diff --check` | clean |

**Reruns and their justification:**

| Rerun | Why |
|---|---|
| contract spec ×2 | run 1 failed 4 assertions that assumed no platform-wide `X-Request-ID` parameter and no platform-wide `500` response; the assertions were corrected to name what is actually platform-owned |
| accept suite ×3 | run 1: the fixture created a quotation and set `custom_requests.current_quotation_id` in one transaction while the pointer statement ran on the pool — split into three steps. run 2: two assertions used `actor_admin_id`/`actor_customer_id`; the columns are `admin_id`/`customer_id`/`grant_id` |
| reject suite ×2 | run 1: a superseded-version rejection answered `QUOTE_VERSION_STALE`; the resolver was changed so the "not current" code is the caller's, and rejection now publishes `INVALID_TRANSITION` per `APP6-G01` §10 |
| race suite ×4 | three runs diagnosing the CC-05 deadlock (the last with a `pg_locks` dump that identified the `custom_requests` key-share lock), then one green run after the fixture was rebuilt on the delivered send use case |
| quotation module ×2 | run 1 surfaced the five contract assertions of §19 — four pre-existing, one mine; run 2 after reconciliation and generation |
| presentation suites ×3 | once red pre-generation (they read the **committed** artifact), once in a stashed pristine tree to prove the four failures pre-dated this work, once green after generation |

**Deliberately not run** (no owned input changed): the full repository suite, full
API regression, the AGG-15/order suite and its pre-existing red fixtures, the
Admin and Storefront apps, the worker suite, Playwright/E2E, DB manifest /
fingerprint / checksum / index suites, the Figma registry checker, unrelated
APP3/APP4/APP5 frozen gates, and any full SonarQube scan.

## 21. Files changed

**Created — APP4 (`CustomerModule`) capabilities:**

- `apps/api/src/modules/customer/application/reauthorize-secure-grant.service.ts` (94)
- `apps/api/src/modules/customer/application/step-up-evidence.resolver.ts` (138)

**Created — APP6 quotation decision slice:**

- `apps/api/src/modules/quotation/domain/decision/quotation-decision.errors.ts` (156)
- `apps/api/src/modules/quotation/domain/decision/quotation-accept-idempotency.ts` (83)
- `apps/api/src/modules/quotation/application/customer/quotation-decision.target.ts` (150)
- `apps/api/src/modules/quotation/application/customer/quotation-decision.view.ts` (84)
- `apps/api/src/modules/quotation/application/customer/quotation-decision.recorder.ts` (121)
- `apps/api/src/modules/quotation/application/customer/accept-quotation.use-case.ts` (310)
- `apps/api/src/modules/quotation/application/customer/reject-quotation.use-case.ts` (150)
- `apps/api/src/modules/quotation/infrastructure/persistence/quotation-decision.lock.ts` (90)
- `apps/api/src/modules/quotation/presentation/schemas/public-quotation-decision.request.ts` (120)
- `apps/api/src/modules/quotation/presentation/schemas/public-quotation-decision.response.ts` (184)
- `apps/api/src/modules/quotation/presentation/public-quotation-decision.controller.ts` (337)
- `apps/api/src/modules/quotation/customer-quotation-decision.module.ts` (101)

**Created — tests:**

- `apps/api/src/modules/quotation/presentation/public-quotation-decision.contract.spec.ts` (292)
- `apps/api/src/modules/quotation/tests/integration/quotation-decision-context.ts` (329)
- `apps/api/src/modules/quotation/tests/integration/customer-quotation-accept.integration.spec.ts` (510)
- `apps/api/src/modules/quotation/tests/integration/customer-quotation-reject.integration.spec.ts` (361)
- `apps/api/src/modules/quotation/tests/integration/customer-quotation-decision-race.integration.spec.ts` (529)

**Modified:**

- `apps/api/src/modules/customer/domain/repositories/secure-access-grant.repository.ts` — `lockActiveByTokenDigest`
- `apps/api/src/modules/customer/infrastructure/persistence/drizzle-secure-access-grant.repository.ts` — its implementation
- `apps/api/src/modules/customer/domain/repositories/verification-challenge.repository.ts` — `findRecentCompleted`
- `apps/api/src/modules/customer/infrastructure/persistence/drizzle-verification-challenge.repository.ts` — its implementation
- `apps/api/src/modules/customer/customer.module.ts` — provides and exports the two new capabilities
- `apps/api/src/modules/quotation/domain/repositories/quotation.repository.ts` — `RejectQuotationInput`, `reject`
- `apps/api/src/modules/quotation/infrastructure/persistence/drizzle-quotation.repository.ts` — `reject`; `accept` and `reject` refactored onto the shared decision lock
- `apps/api/src/openapi/operation-id.ts` — `PublicQuotationDecisionController: 'publicQuotation'`
- `apps/api/src/bootstrap/app.module.ts` — registers `CustomerQuotationDecisionModule`
- `apps/api/src/modules/quotation/presentation/admin-quotation.contract.spec.ts` — §19
- `apps/api/src/modules/quotation/presentation/admin-quotation-version.contract.spec.ts` — §19
- `apps/api/src/modules/quotation/presentation/public-quotation.contract.spec.ts` — §19
- `packages/contracts/openapi/openapi.generated.json` — generated
- `packages/api-client/src/generated/embroidery-api.ts` — generated
- `packages/api-client/src/generated/embroidery-api.schemas.ts` — generated

**Documentation:**

- `docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`
- `docs/implementation/reports/APP6-B05-COMPLETION-REPORT.md` (this file)

`SCOPED_COMMAND_INDEX.md` was **not** touched: B05 adds no checker and no new
scoped command. Focused contract, integration and race tests prove every
boundary, so no bespoke `tools/check-*.mjs` was created.

Every source file is within the 400-line limit and every test file within 600.
No database migration.

## 22. Follow-ups

**New:**

| Id | Disposition |
|---|---|
| `FU-APP6-B05-AGG14-LOCK-ORDER-01` | `OPEN` (documentation only) · owner **`APP6-X01`**. `update quotations` key-share-locks the parent `custom_requests` row, so every AGG-14 write path must reach the request row and must reach it *first*. Both delivered writers do, and the property is recorded in this report and in the race suite's header — but it is not stated in `BACKEND_CONVENTIONS.md` or DB7, and the next AGG-14 writer will not learn it from anywhere except by deadlocking. Nothing was changed to work around it |
| `FU-APP6-B05-B04-FROZEN-SURFACE-DRIFT-01` | `CLOSED_ON_ARRIVAL` · four assertions in the B01/B02 contract suites had been red since `cef99b7` because `APP6-B04` widened the `publicQuotation` surface without reconciling them. Reconciled here (§19). Recorded so the closure is auditable rather than silent |

**Carried, untouched:**

| Id | Disposition |
|---|---|
| `FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01` | `NONBLOCKING` — not resolved here by PO direction. No customer-readable adjustment reason column, no projection widening, no migration, no invented prose |
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | `NONBLOCKING` — no `QUOTE_ACCEPTED → QUOTED` edge exists, acceptance reopens nothing, and B03 send eligibility is unchanged. Routed to `APP6-X01` |
| `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` | `NONBLOCKING_PREEXISTING` — not run, not repaired |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | open, untouched |
| `FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01` | open, untouched |
| `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` | open, untouched — B05 adds none to it (every published field carries an explicit scalar type or an enum), and repairs none of the history |
| APP3-era frozen-surface gates | pre-existing red since APP4; outside every APP6 checkpoint's scope |

## 23. Scope guard

Not implemented, and not started: `APP6-B06` digitizing (`TR-LC11-07`, GRD-005),
any direct `QUOTE_ACCEPTED` state command, post-acceptance re-quote reopening,
quotation send or re-send, the quote-expiry sweep, customer cancellation, design
version creation or review, agreement publication, Admin or Storefront UI,
order/payment/inventory work, a new secure-grant or verification architecture,
any database migration, and the customer adjustment-explanation follow-up.

`APP6-B06` is **not started**.

## 24. Commit

```text
LOCAL COMMIT = 4d18ee3
PUSHED = NO
NEXT CHECKPOINT = APP6-B06
```
