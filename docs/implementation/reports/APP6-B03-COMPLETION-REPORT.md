# APP6-B03 — Quotation Send Transaction — Completion Report

```text
APP6-B02 = ACCEPTED
APP6-B03 = COMPLETE
HTTP OPERATIONS ADDED = 1
TR-LC12-02 = DELIVERED
VALIDITY POLICY = CONSUMED FROM PUBLISHED DATA
SENT VERSION = FROZEN / NOT REPRICED
PRIOR SENT VERSION = SUPERSEDED WHEN APPLICABLE
QUOTATION CURRENT VERSION POINTER = SET
REQUEST CURRENT QUOTATION POINTER = SET
FU-APP6-B01-CURRENT-QUOTATION-POINTER-01 = CLOSED
TR-LC11-05 = SYSTEM PROJECTION ONLY
QUOTED ADMIN COMMAND = ABSENT
SE-004 QUOTATION.SENT = EMITTED ONCE PER NEW SEND
DUPLICATE SAME-VERSION SEND = REPLAY
ATOMIC ROLLBACK = PROVED
DATABASE MIGRATION = NONE
B04/B05 = NOT STARTED
NEXT CHECKPOINT = APP6-B04
```

---

## 1. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `58d8b93` — *docs(app6): record the APP6-B02 commit hash in its completion report* |
| Working tree at entry | clean (`git status --porcelain` empty) |
| `6c63f1a` reachable from HEAD | **yes** — `git merge-base --is-ancestor 6c63f1a HEAD` succeeded |
| Branch | `production`, 15 commits ahead of `origin/production`, nothing pushed |
| OpenAPI artifact at entry | 61 paths / 67 operations / 140 schemas — matches the accepted B02 baseline |

The four accepted operation ids were verified present and unchanged in the
committed artifact before and after generation (§8).

---

## 2. The published operation

```text
POST /api/admin/quotations/{quotationId}/versions/{versionId}/send
  → adminQuotation_sendVersion
```

One operation, and no second. There is no `/resend` verb — re-issuing a version
is the *same* command and replays through this route — and no `/current/send`
shortcut, because a send must state which price went out.

| Property | Value |
|---|---|
| Success status | `200` (`QUOTATION_SENT`) |
| Request body | **none** |
| Controller | `AdminQuotationSendController` (`admin/quotations`) |
| Module | `QuotationSendModule` |
| Guards | `AuthenticatedAdminGuard` (controller) + `StaffOriginGuard` (handler) |
| `StaffJsonBodyGuard` | **absent** — there is no body, so there is no content type to check, and requiring `application/json` would reject a legitimate bodyless POST |
| Operation-id domain | `adminQuotation`, via a new `CONTROLLER_DOMAIN_KEYS` entry |

The absence of a body is the contract, not an omission: the operator identity,
the send instant, the validity window, the totals and the target state are all
server-derived, so there is no field through which a caller could supply one.
`QUOTED` appears in the response as a **reported** state and nowhere as an
input; no generic status route, no `POST /requests/{id}/quoted`, and
`APP5-B05`'s Admin transition allow-list is untouched.

`AdminQuotationSendController` is a third class in the same published domain as
`AdminQuotationController` (B01) and `AdminQuotationVersionController` (B02). It
is its own class because its module is the only APP6 surface holding the order
repository, the outbox and the audit repository — a boundary that keeps a read
or a draft route from reaching `transition()`. The `CONTROLLER_DOMAIN_KEYS`
entry is what stops that split from reissuing any accepted id.

---

## 3. The send transaction map

```text
requireAdminActorId(requestContext)          — no operator ⇒ fail before any read
requireRequestId(requestContext)             — the correlation id TBL-042 requires
QuotationValidityPolicyReader.require()      — OUTSIDE the transaction; a refusal writes nothing
BEGIN
  quotations.findById(quotationId)           — QUOTATION_NOT_FOUND
  quotations.loadVersion(versionId)          — QUOTATION_VERSION_NOT_FOUND (missing OR another quotation's)
  ── replay branch ────────────────────────────────────────────────────
  version.status = SENT AND quotation.current_version_id = version.id
    ⇒ return the committed result; NO write of any kind
  ── eligibility ──────────────────────────────────────────────────────
  version.status ≠ DRAFT                     ⇒ QUOTATION_VERSION_NOT_SENDABLE
  requests.lockById(customRequestId)          — FOR UPDATE, before any write
  request.status ∉ {UNDER_REVIEW, QUOTED}     ⇒ REQUEST_NOT_SENDABLE
  ── writes ───────────────────────────────────────────────────────────
  quotations.send(versionId, validUntil, sentAt)
        → status SENT, sent_at, valid_from, valid_until
        → every other SENT sibling → SUPERSEDED + superseded_at   (TR-LC12-04)
        → quotations.status = SENT, quotations.current_version_id = versionId
  quotations.setCurrentVersion(quotationId, versionId)   — G-DB7-03 ownership guard
  requests.setCurrentQuotation(requestId, quotationId)   — G-DB7-04 ownership guard
  if request.status = UNDER_REVIEW:
      requests.transition({ to: QUOTED, actor: SYSTEM/'quotation.send',
                            expectedFrom: UNDER_REVIEW, correlationId })   — TR-LC11-05
  QuotationSendRecorder.record(...)
        → audit_events  : quotation.sent on QUOTATION_VERSION, actor ADMIN
        → outbox_events : quotation.sent on QUOTATION, PENDING          — SE-004
COMMIT
```

There is no `try`/`catch` inside the transaction that could let a subset commit,
and no compensation path anywhere: the rollback is PostgreSQL's.

`sentAt` is a single `Date` used for `sent_at`, `valid_from`, `valid_until`'s
origin and the audit's `occurred_at`, so the evidence cannot disagree with the
row about when the price went out.

### Why the request row is locked before anything is frozen

The eligibility decision and the freeze must see one state. On the
already-`QUOTED` branch **no** transition is appended, so there is no
`expectedFrom` precondition to fall back on — without the lock, a moderator
could move the request to `CANCELLED` between the check and the commit and the
send would have frozen a version onto a request that had left the lifecycle.
`lockById` is a new method on the delivered `CustomRequestRepository` port
(`@requiresTransaction`); it takes the same `FOR UPDATE` that `transition()` and
`replaceBreakdown()` already take, exposed on its own so a caller need not open
with a write it does not want to perform.

---

## 4. Eligibility and replay rules

### Version

| Version state | Outcome |
|---|---|
| `DRAFT` | sent — the only state `QuotationRepository.send` accepts |
| `SENT` **and** the quotation's current version | **replay** — committed result returned, nothing written |
| `SENT` but not current, `ACCEPTED`, `SUPERSEDED`, `EXPIRED`, `REJECTED`, `VOID` | `QUOTATION_VERSION_NOT_SENDABLE` |
| belongs to another quotation, or does not exist | `QUOTATION_VERSION_NOT_FOUND` (the same answer, so a wrong path cannot confirm another quotation's row) |

Replay is the rule `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-12 records for
`TR-LC12-02` ("resend replays") and `APP6-G01` §"Quotation send, duplicate or
concurrent" restates: "a version already `SENT` is not re-frozen and not
re-priced, and the current pointer is not re-advanced".

### Request

| Request state | Outcome |
|---|---|
| `UNDER_REVIEW` | send commits **and** projects `TR-LC11-05` `UNDER_REVIEW → QUOTED` |
| `QUOTED` | send commits; the customer-current version is replaced; **no** transition appended — LC-11 has no `QUOTED → QUOTED` edge, and a self-edge would be evidence of a move that never happened |
| `NEW`, `NEEDS_CLARIFICATION`, `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED` | `REQUEST_NOT_SENDABLE` — refused cleanly, nothing written |

This is deliberately **narrower** than B01's drafting rule, and the two files say
so. `quotation-eligibility.ts` still allows a *draft* to be written against any
request from `UNDER_REVIEW` onward, because ADR-DB3-001 rule 4 re-prices by
adding a version. Sending one is a different question, because a send projects a
transition and LC-11 offers no other edge into `QUOTED`
(`request-transitions.ts`: `QUOTED` is reachable only from `UNDER_REVIEW`).

`NEEDS_CLARIFICATION` refuses because LC-11 routes it back through
`UNDER_REVIEW` — the operator's move is to return the request to review and then
send.

### The re-quote-after-acceptance edge, and why it refuses

ADR-DB3-001 rule 4 says a revision after acceptance "**requires
re-acceptance**". Re-acceptance is `TR-LC11-06` `QUOTED → QUOTE_ACCEPTED`, and
LC-11's legal destinations from `QUOTE_ACCEPTED` are `[DIGITIZING, CANCELLED]` —
there is no edge back to `QUOTED` from `QUOTE_ACCEPTED` or from anything beyond
it. Sending from those states would therefore freeze a version that no customer
could ever accept, while inventing the reopening edge is precisely what
`APP6-G01` §4.1 forbids.

Per the PO ruling (§6.4: "If accepted DB3 authority does not explicitly
authorize send in that state, refuse the send cleanly"), B03 refuses. The
unresolved lifecycle edge is **reported, not decided** — see
`FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` in §11.

---

## 5. Validity policy — evidence that no `7` is hard-coded

| Element | File |
|---|---|
| Shape + key + `addCalendarDays` | `apps/api/src/modules/quotation/domain/sending/quotation-validity-policy.ts` |
| Runtime reader | `apps/api/src/modules/quotation/infrastructure/policy/quotation-validity-policy.reader.ts` |
| Published value | `packages/database/seed/app6-policy-configuration.seed.json` → `quotation.validity.validityDays = 7` (published by `PublishApp6PolicyUseCase`, B01) |

`grep -rn "validityDays" apps/api/src` returns the shape declaration, the parse
guard and the single consumption site. **No numeric literal `7` appears anywhere
on the send path.** The reader follows the B01 deposit-reader architecture
exactly — one key, per-call read through `PolicyConfigurationRepository`, no
cache, no publish path, no Admin identity — rather than introducing a second
policy framework.

The decisive test republishes the policy at **three** days and asserts the
persisted window is exactly three days
(`quotation-send.integration.spec.ts` › *uses the published number of calendar
days, not a literal*). A hard-coded `7` anywhere on the path survives the
republication and fails there. A companion test asserts seven days under the
dataset value, so the assertion is not vacuous in either direction.

Refusals: an unpublished key and an incoherent value (`validityDays: 0`, which
`ck_quotation_versions__validity_window` would reject *after* the version had
been frozen) both answer `QUOTATION_POLICY_UNAVAILABLE` (**503**, the B01
precedent) **before the transaction opens** — proved by asserting the version is
still `DRAFT` with no `sent_at`, zero transitions and zero outbox rows.

`valid_from` is the committed send instant and `valid_until` is
`valid_from + validityDays` calendar days, computed on date components rather
than as a millisecond multiple. The two agree here because `Asia/Ho_Chi_Minh`
observes no daylight saving; writing it as date arithmetic keeps the code saying
what `APP6-G01` §6.1 locked. The expiry sweep (`TR-LC12-05`, `SE-015`) stays out
of APP6 and nothing here expires a version.

---

## 6. Before / after state

For a first send of version 1 on an `UNDER_REVIEW` request:

| Fact | Before | After |
|---|---|---|
| `quotation_versions.status` | `DRAFT` | `SENT` |
| `quotation_versions.sent_at` / `valid_from` / `valid_until` | `NULL` | set; `valid_from = sent_at`, `valid_until = valid_from + 7d` |
| every `*_amount`, `deposit_percent`, line items | as drafted | **byte-identical** |
| `quotations.status` | `DRAFT` | `SENT` |
| `quotations.current_version_id` | `NULL` | the sent version |
| `custom_requests.status` | `UNDER_REVIEW` | `QUOTED` |
| `custom_requests.current_quotation_id` | `NULL` | the quotation |
| `custom_request_transitions` | 0 rows | 1 row, `UNDER_REVIEW → QUOTED`, `actor_kind = SYSTEM`, `system_job_key = quotation.send`, `admin_id = NULL` |
| `audit_events` | 0 rows | 1 row, `quotation.sent` / `QUOTATION_VERSION` / `ADMIN` |
| `outbox_events` | 0 rows | 1 row, `quotation.sent` / `QUOTATION` / `PENDING` |

The "re-prices nothing" test snapshots the version row and its line items before
the send and asserts equality after, so the freeze is proved against the rows
rather than against the response.

---

## 7. Pointer closure — `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01`

Closed. The proof is a single post-commit join asserted as one object
(`quotation-send.integration.spec.ts` › *makes the four pointer facts agree
after commit*):

```sql
select r.current_quotation_id as request_points_at,
       q.current_version_id   as quotation_points_at,
       v.quotation_id         as version_belongs_to,
       q.custom_request_id    as quotation_belongs_to
  from custom_requests r
  join quotations q on q.id = r.current_quotation_id
  join quotation_versions v on v.id = q.current_version_id
 where r.id = :requestId
```

```text
request_points_at    == quotation.id
quotation_points_at  == sentVersion.id
version_belongs_to   == quotation.id
quotation_belongs_to == request.id
```

The join is read back from the rows rather than from the response, because
same-request / same-quotation ownership is a **transaction-level** fact:
`DB4_RELATIONSHIP_AND_FK_MODEL.md` classifies REL-068 as "TX consistency", so
the physical FKs prove existence but not ownership. Both application-layer
guards run in the transaction — `QuotationRepository.setCurrentVersion`
(G-DB7-03) and `CustomRequestRepository.setCurrentQuotation` (G-DB7-04) — each
of which reads the owner and refuses a cross-aggregate pointer.

`setCurrentVersion` is called explicitly even though `send` already advances the
header pointer: the extra call is the G-DB7-03 ownership guard applied to the
same fact, on the same row, in the same transaction.

Rollback leaves the previous pointer pair untouched — see §9.

---

## 8. `quotation.sent` — audit and outbox evidence

| Aspect | Value |
|---|---|
| Outbox `event_type` | `quotation.sent` (exactly, per `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` SE-004) |
| `aggregate_kind` / `aggregate_id` | `QUOTATION` / the quotation id (already in `OUTBOX_AGGREGATE_KINDS`; no new kind, no migration) |
| `status` on append | `PENDING` — delivery is after commit, through the delivered APP4 worker |
| Audit `action` / `target_kind` | `quotation.sent` / `QUOTATION_VERSION` (already in `AUDIT_TARGET_KINDS`) |
| Audit actor | `ADMIN` — an operator commanded the send |
| Transition actor | `SYSTEM` / `quotation.send` — the move is a consequence of the commit |
| Payload amounts | exact persisted **strings**: `totalAmount`, `depositAmount`, `remainingAmount`, plus `currencyCode` |

Payload contents were asserted positively (`'1550000.00'`, `'620000.00'`,
`'930000.00'`, each `typeof === 'string'`, each equal to the response's value)
and negatively: the test asserts the payload key set contains none of
`lineItems`, `document`, `designDocument`, `customerId`, `grantId`, `token`,
`storageKey`, `adminId`. SE-004's annotation is "amounts OK; **no doc
content**", and nothing that authorizes a customer travels either.

No notification intent is created and no second event platform is introduced.
APP4's `NotificationRequest` is secret-bearing by construction — it requires a
`secret`, a `secretKind` and a `reference` from a closed union — and the
customer-facing secure link a quotation notification eventually carries is
issued by `APP6-B04`. This is the same boundary `RequestSubmissionRecorder` and
`RequestModerationRecorder` already hold.

Replay appends **no** second event: after a replayed send the suite asserts
exactly 1 outbox row, 1 audit row and 1 transition row.

---

## 9. Rollback proof

`quotation-send-atomicity.integration.spec.ts`. The injection point is the
**outbox append** — the last write in the transaction, chosen because by then
the version is frozen, both pointers are advanced, the request has moved and the
audit row is already written. It is therefore the only failure that can leave
every other write performed and waiting for a commit that never comes. The only
substituted collaborator is an `OutboxEventStore` whose `append` rejects;
everything else is production code.

Three tests:

1. **every write rolls back** — the whole state object (version status, `sent_at`,
   `valid_from`, `valid_until`, request status, `current_quotation_id`, quotation
   status, `current_version_id`, transition count, audit count, outbox count) is
   captured before the attempt and asserted **identical** after it, and asserted
   equal to the pristine baseline (`DRAFT` / all-`NULL` / `UNDER_REVIEW` / 0 / 0 / 0);
2. **a supersession rolls back** — with version 1 already live and version 2
   failing mid-send, version 1 is still `SENT`, still the current version, with
   the send facts and the window the customer was actually told about, and
   version 2 is still a `DRAFT`;
3. **the send is still available afterwards** — the identical command on the real
   outbox then succeeds. A partially applied attempt would have failed here with
   `QUOTATION_VERSION_NOT_SENDABLE` instead.

No compensation workflow exists anywhere on the path, and none was added.

---

## 10. Request-state race proof

`quotation-send-race.integration.spec.ts`, on the DB8 concurrency harness —
**independent physical connections**, not `Promise.all` on one pool.

Deterministic and run once: a third connection takes the request's row lock
first and holds it; the send and a concurrent `→ CANCELLED` moderation both
start their real transactions and block on `SELECT … FOR UPDATE`; the suite
waits for a *real condition* — two ungranted locks in `pg_locks` — rather than
for a duration, then releases the holder. Which of the two wins is left to
PostgreSQL and is never asserted; both outcomes are asserted whole:

- **send wins** — version `SENT` with `sent_at`, `custom_requests.current_quotation_id`
  set, `quotations.current_version_id` set, exactly 1 `quotation.sent` event; the
  cancellation that follows is a legal `QUOTED → CANCELLED` move that leaves all
  of it intact;
- **cancellation wins** — the send refuses `REQUEST_NOT_SENDABLE`, the version is
  still `DRAFT` with `sent_at NULL`, **neither** pointer moved, **zero**
  `quotation.sent` events, request `CANCELLED`.

Either way the suite asserts the request moved exactly once out of
`UNDER_REVIEW` and that no transition row is a self-edge.

There is no process-local mutex anywhere on the send path, and there must not be
— one would be silent about the second API replica.

Related negatives proved elsewhere: no Admin command can reach the system-only
transition (the contract suite asserts no `QUOTED` target, no generic status
route, and no request body on the send), and a replay creates no duplicate
`custom_request_transitions` row (§8).

---

## 11. Follow-ups

| Follow-up | Disposition |
|---|---|
| `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01` | **CLOSED_BY_B03** — §7, with real integration evidence |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | **OPEN, carried.** B03 introduces no third shared consumer of the code generator, so extraction would not be lower-risk than duplication |
| `FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01` | **OPEN, carried.** Untouched by B03 |
| `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` | **OPEN, carried, not extended.** The one new schema adds two booleans and a string; its contract test asserts that no nullable property of `AdminQuotationSentResponse` publishes `type: object`. No historical schema was mass-repaired |
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | **NEW — for Product Owner decision.** ADR-DB3-001 rule 4 requires re-acceptance after a post-acceptance revision, but LC-11 has no edge back into `QUOTED` from `QUOTE_ACCEPTED` or beyond, so `TR-LC11-06` could never fire. B03 refuses the send from those states rather than invent the edge (§4). Resolving it needs either an accepted LC-11 amendment or an explicit ruling that the path stays unreachable. Owner: whichever checkpoint the PO assigns; **not** B04 or B05 as currently scoped |
| `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` | **NEW — pre-existing, not caused by B03.** `order.integration.spec.ts`, `order-outbox.integration.spec.ts` and `order-races.integration.spec.ts` fail identically (36 tests) at pristine `58d8b93` and after this change, all in the `seedOrderChain` AGG-15 fixture. Verified by stashing the working tree and re-running. Out of B03's change impact |

---

## 12. Repository-change note — the supersede predicate

`DrizzleQuotationRepository.send` superseded only the version numbered
`row.version - 1`. Drafting is an append (`TR-LC12-01`), so an operator may
revise twice before sending: sending version 3 while version 1 was the live one
left version 1 `SENT`, and the quotation carried **two** live prices with only
one of them reachable through `current_version_id` — contradicting both the
method's own comment ("so the customer only ever has one live price") and
`TR-LC12-04`.

The predicate is now "every other `SENT` sibling of this quotation". Behaviour in
the common adjacent case is unchanged; the gap is closed. B03 is the first real
consumer of this method, which is why it surfaced here. Proved by
*supersedes a live version that is not the immediately preceding one*, which
asserts exactly one `SENT` version remains, and by *leaves a superseded
version's own recorded facts intact*.

---

## 13. Focused test ledger

Only checks B03's changes justify were run. Each command was run once per source
change; rerun counts below are the number of executions and every rerun followed
a real change.

| # | Command | Scope / why | Result | Runs |
|---|---|---|---|---|
| 1 | `git merge-base --is-ancestor 6c63f1a HEAD` | B02 reachability | reachable | 1 |
| 2 | `npx tsc --noEmit` (`apps/api`) | new module compiles | clean | 4 (after use case, after tests, after race spec, after lint fix) |
| 3 | `npm run openapi:generate` (`apps/api`) | canonical generation, **once** | 62 / 68 / 141 | 1 |
| 4 | `npm run openapi:check` (`apps/api`) | artifact is up to date | pass | 1 |
| 5 | `npm run generate` (`packages/api-client`) | client generation, **once** | 2 files, tree hash `b32c4400…` | 1 |
| 6 | `npm run check:generated` (`packages/api-client`) | client is up to date | pass | 1 |
| 7 | `npx jest src/modules/quotation/presentation` | contract suites, incl. two older ones this route unfroze | 53 passed / 3 suites | 3 (initial red, helper fix, final) |
| 8 | `npx jest …/quotation-send.integration.spec.ts` | the send transaction | 23 passed | 2 (fixture fixes, final) |
| 9 | `npx jest …/quotation-send-atomicity.integration.spec.ts` | rollback | 3 passed | 1 |
| 10 | `npx jest …/quotation-send-race.integration.spec.ts` | request-state race | 1 passed | 1 |
| 11 | `npx jest src/modules/quotation src/openapi` | whole module + operation-id policy | **225 passed / 18 suites** | 1 |
| 12 | `npx jest src/modules/order/tests/integration` | the changed AGG-13 port | 167 passed, 36 failed — **all 36 red at pristine HEAD too** | 1 (+1 stashed baseline) |
| 13 | `npx tsc --noEmit` (`packages/api-client`, `packages/contracts`) | directly affected packages | clean | 1 each |
| 14 | `prettier --check` (changed paths) | scoped formatting | 4 pre-existing B01 files remain over-width; **baseline verified by stashing** — 4 before, 4 after | 3 (baseline, write, recheck) |
| 15 | `eslint` (changed paths) | scoped lint | clean after one `import type` fix | 2 |
| 16 | `git diff --check` | whitespace | clean | 1 |
| 17 | `node tools/check-app6-g01.mjs` | **diagnostic only** — to confirm the OpenAPI change was not its cause | 17 failures, all pre-existing since APP6-DB01/B01 (the gate freezes negations those checkpoints intentionally invalidated, incl. 58/63/132) | 1 |

Deliberately **not** run (§14): the full repository suite, full API regression,
Admin/Storefront, the worker suite, Playwright/E2E, DB manifest/fingerprint/
index/checksum checks, historical APP3/APP4/APP5 gates, the Figma checker, the
B01 dataset-publisher suite (publication source unchanged), the B01 pricing
arithmetic suite (pricing source unchanged) and any SonarQube scan.

### New focused tests: 39

| Suite | Tests |
|---|---|
| `admin-quotation-send.contract.spec.ts` | 12 |
| `quotation-send.integration.spec.ts` | 23 |
| `quotation-send-atomicity.integration.spec.ts` | 3 |
| `quotation-send-race.integration.spec.ts` | 1 |
| **total** | **39** |

B01's contract spec also gained one test, where the blanket "no `/send` route"
rule was narrowed rather than deleted. The whole quotation module is green at
**163 across 11 suites**, up from B02's 123 across 7.

---

## 14. OpenAPI and generated client

| Metric | Before | After | Δ |
|---|---|---|---|
| paths | 61 | 62 | +1 |
| operations | 67 | 68 | +1 |
| schemas | 140 | 141 | +1 |

Diff of the committed artifact, computed against `HEAD`:

```text
ADDED:   adminQuotation_sendVersion  POST /api/admin/quotations/{quotationId}/versions/{versionId}/send
REMOVED: (none)
SCHEMAS ADDED:   AdminQuotationSentResponse
SCHEMAS REMOVED: (none)
```

`git diff --stat` on the artifact: **281 insertions, 0 deletions** — purely
additive, so no accepted operation id, path or schema moved.

One generation cycle and one client generation, in that order, with no
regeneration loop: the route and DTO surface were stable before generation, and
nothing was changed after it.

Generated client: `adminQuotationSendVersion(...)`,
`AdminQuotationSendVersion200`, `AdminQuotationSendVersionResult`, and
`AdminQuotationSentResponse` typed as

```ts
export interface AdminQuotationSentResponse {
  lineItems: AdminQuotationLineItemResponse[];
  quotation: AdminQuotationHeaderResponse;
  replayed: boolean;
  requestStatus: string;
  requestTransitioned: boolean;
  version: AdminQuotationVersionResponse;
}
```

It **references** B02's accepted types rather than minting a second twenty-field
version type the two would have to be kept identical by hand — which is also why
the schema count rose by one rather than by four. Every amount stays `string` in
the document and in the client; the contract suite asserts at least nine money
fields reachable from the new schema and that every one is `type: string`.

---

## 15. Files changed

### New (12)

```text
apps/api/src/modules/quotation/domain/sending/quotation-validity-policy.ts          68
apps/api/src/modules/quotation/domain/sending/quotation-send-eligibility.ts         58
apps/api/src/modules/quotation/domain/sending/quotation-send.errors.ts             146
apps/api/src/modules/quotation/infrastructure/policy/quotation-validity-policy.reader.ts 45
apps/api/src/modules/quotation/application/sending/quotation-sent.view.ts           34
apps/api/src/modules/quotation/application/sending/quotation-send.recorder.ts      129
apps/api/src/modules/quotation/application/sending/send-quotation-version.use-case.ts 317
apps/api/src/modules/quotation/presentation/schemas/admin-quotation-send.response.ts 87
apps/api/src/modules/quotation/presentation/admin-quotation-send.controller.ts     212
apps/api/src/modules/quotation/quotation-send.module.ts                             51
apps/api/src/modules/quotation/presentation/admin-quotation-send.contract.spec.ts  235
apps/api/src/modules/quotation/tests/integration/quotation-send-context.ts         284
apps/api/src/modules/quotation/tests/integration/quotation-send.integration.spec.ts 481
apps/api/src/modules/quotation/tests/integration/quotation-send-atomicity.integration.spec.ts 185
apps/api/src/modules/quotation/tests/integration/quotation-send-race.integration.spec.ts 299
```

Every source file is under the 400-line hard maximum and every test file under
600. Nothing needed splitting for size.

### Modified (11)

| File | Change |
|---|---|
| `apps/api/src/openapi/operation-id.ts` | one `CONTROLLER_DOMAIN_KEYS` entry, so the third class keeps the `adminQuotation` domain |
| `apps/api/src/bootstrap/app.module.ts` | registers `QuotationSendModule` |
| `apps/api/src/modules/order/domain/repositories/custom-request.repository.ts` | `lockById` added to the port |
| `apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request.repository.ts` | `lockById` implementation |
| `apps/api/src/modules/quotation/infrastructure/persistence/drizzle-quotation.repository.ts` | supersede predicate (§12) |
| `apps/api/src/modules/quotation/presentation/admin-quotation.contract.spec.ts` | B01's frozen surface reconciled: the blanket "no `/send`" rule narrowed to "exactly one send exists and drafting does not own it"; the drafting-operation helper excludes it |
| `apps/api/src/modules/quotation/presentation/admin-quotation-version.contract.spec.ts` | family count 4 → 5; the accepted-id assertion excludes the send by path |
| `docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md` | B03 status row + phase state block |
| `packages/contracts/openapi/openapi.generated.json` | generated |
| `packages/api-client/src/generated/embroidery-api.schemas.ts` | generated |
| `packages/api-client/src/generated/embroidery-api.ts` | generated |

No migration. No change to `packages/database`. `docs/implementation/SCOPED_COMMAND_INDEX.md`
is untouched: B03 introduces no new scoped command or checker — the transaction
is proved by focused integration and contract tests, not by a bespoke checker.

---

## 16. Scope guard

Not implemented, and not reachable from anything composed here: customer secure
quotation read (`B04`), acceptance/rejection (`B05`), step-up, customer grant
resolution or issuance, the digitizing transition (`B06`), design authoring or
review, any frontend, any Figma work, order creation, payment obligations,
reservations or stock holds, the expiry sweep, agreement content, and any
database migration.

`QuotationSendModule` imports no notification module, no grant issuer, no
pricing and no design module, so none of the above could be added without
changing that file.

---

## 17. Commit

```text
local commit: 41f7be1
pushed:       no
```

**Next checkpoint: `APP6-B04` — customer secure quotation read.**
