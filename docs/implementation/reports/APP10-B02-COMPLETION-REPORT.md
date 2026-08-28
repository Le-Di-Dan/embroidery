# APP10-B02 — Customer Merge Case Lifecycle & Consequence Preview — Completion Report

Date: 2026-08-28 · Branch: `production` · Mode: IMPLEMENTATION

## A. Verdict

```text
APP10-B02 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEW_HTTP_OPERATIONS = 3
MIGRATIONS_ADDED = 0
NEXT_CHECKPOINT = APP10-B03
```

## B. Implemented HTTP contract

| Method | Path | Operation id | Success |
|---|---|---|---|
| POST | `/api/admin/customer-merges` | `adminCustomerMerge_open` | `201` + `{ mergeCaseId, status }` |
| GET | `/api/admin/customer-merges/{caseId}` | `adminCustomerMerge_detail` | `200` + case, both masked cards, preview |
| POST | `/api/admin/customer-merges/{caseId}/reject` | `adminCustomerMerge_reject` | `204` |

Operation ids are **derived**, not declared: `createOperationId` builds them from
`AdminCustomerMergeController#open|detail|reject`. No `CONTROLLER_DOMAIN_KEYS`
entry was needed.

Error semantics:

| Status | Open | Detail | Reject |
|---|---|---|---|
| `400` | malformed/unknown field, blank or >1000-char reason, **self-merge** | malformed `caseId` | malformed id or body, blank/over-long reason |
| `401` | no live Admin session | same | same |
| `403` | origin outside the Admin allowlist | same | same |
| `404` | `SURVIVOR_NOT_FOUND`, `LOSER_NOT_FOUND` | `MERGE_CASE_NOT_FOUND` | `MERGE_CASE_NOT_FOUND` |
| `409` | `SURVIVOR_ALREADY_MERGED`, `LOSER_ALREADY_MERGED`, `MERGE_CASE_ALREADY_OPEN` | — | `MERGE_CASE_NOT_REQUESTED` |
| `415` | body not `application/json` | — | body not `application/json` |

Every refusal message is a fixed, server-authored string. None interpolates an
id, a contact value, a mask, a display name or an operator reason.

**No fourth operation.** There is no execute, approve, cancel, reopen, bulk
merge, customer list, duplicate-candidate search or merge scoring. The route
root is `admin/customer-merges` rather than a sub-resource of a customer,
because a merge case belongs to two customers and neither is more its owner.

## C. Merge lifecycle authority

**States used.** `CUSTOMER_MERGE_CASE_STATES` unchanged — `REQUESTED`,
`EXECUTED`, `REJECTED`. B02 **writes** only the first two of the three
transitions it can reach: a case is created `REQUESTED` and may move to
`REJECTED`. `EXECUTED` is published by the detail read and refuses a rejection,
but nothing in B02 writes it. **No pseudo-state was invented** — no `PREVIEWED`,
`APPROVED`, `READY` or `CONFIRMED`: a preview is derived from current rows on
every read, so persisting that it happened would record a page view as a
workflow step.

**Allowed transitions.**

```text
(none) --open--> REQUESTED --reject--> REJECTED
                 REQUESTED --execute--> EXECUTED    (APP10-B03, not delivered here)
```

**Duplicate-open behaviour.** Two layers, and the second is the authority:

1. `OpenCustomerMergeCase` reads `findOpenForPair(survivor, loser)` first, so an
   ordinary duplicate is a clean `409` rather than a caught driver error.
2. `uq_customer_merge_cases__survivor_loser__requested` (CST-010) rejects the
   second INSERT. `CONSTRAINT_MEANINGS` already maps it to the client-safe code
   `MERGE_CASE_ALREADY_OPEN`, which the use case catches by **code** — the
   constraint name never reaches application code — and converts to the same
   `CustomerMergeError` the pre-check raises. A caller cannot tell whether it
   lost a race, and does not need to.

The pair is **ordered**, matching the index: `(A→B)` and `(B→A)` are different
cases to CST-010, and `findOpenForPair` asks about exactly the pair it is given.

**Self-merge.** Refused by `openCustomerMergeBodySchema.refine()` — a `400`, one
step before any database round trip, matching how `updateCustomerProfileBodySchema`
refuses an empty patch. It is a contradiction decidable from the body alone.
CST-069's `ck_customer_merge_cases__no_self_merge` remains the physical backstop
and is deliberately **not** re-implemented in the domain.

**Already-merged participants.** `requireEligibleSurvivor` and
`requireEligibleLoser` refuse a customer carrying `merged_into_customer_id`,
separately (`409` each). Nothing follows or flattens a merge chain, nothing
selects a different survivor, and nothing reverses the operator's choice.

**Reject idempotency — the chosen behaviour.** A rejection of a case that is
already `REJECTED` or `EXECUTED` is a **409 transition conflict**, not an
idempotent `204`. Reasons, in order of weight:

- `adminSecureGrant_revoke` already establishes this for the repository —
  "revoking a grant that is already revoked or expired is a conflict";
- a rejection carries a **mandatory operator reason** and
  `customer_merge_cases` has no idempotency key, so a replay is
  indistinguishable from a second operator deciding the same case; a `204`
  would silently discard the second reason;
- `APP10-B01`'s idempotent promote/deactivate are not a counter-example —
  neither takes an operator payload, so a replay there genuinely describes a
  world that is already the requested one.

The guard is enforced twice, and the second is the real one: the policy refuses
a non-`REQUESTED` case it read, and the UPDATE carries `status = 'REQUESTED'` in
its own predicate, so a case decided in between matches nothing and is refused
rather than overwritten.

## D. Consequence preview

Six categories. Each corresponds to a table with a **live** `customers` foreign
key, as settled by `APP10-G01` §E.2 from `DB4_SCHEMA_IDENTITY_CUSTOMER.md` §7
and `DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md` §4. All are counted for the
**loser** — the side that moves.

| Category | Table / column | Owner | Query authority | Live? | Why included |
|---|---|---|---|---|---|
| `contactPoints` | `customer_contact_points.customer_id` | CTX-CUS | `CUSTOMER_MERGE_PREVIEW_PORT` | yes — `CONTACT_MOVE` | every row, deactivated included: each carries the reference under a `RESTRICT` FK, so leaving one behind attaches it to a tombstone |
| `activeSecureAccessGrants` | `secure_access_grants.customer_id`, `status = 'ACTIVE'` | CTX-CUS | same | yes — `GRANT_REVOKE` | DB3 §4 step 4 revokes the loser's *active* grants with reason `merge`; an EXPIRED or REVOKED grant opens nothing and execution leaves it alone |
| `businessProfile` | `business_profiles.customer_id` | CTX-CUS | same | yes — `OWNERSHIP_TRANSFER` | `uq_business_profiles__customer` (CST-051) caps it at one per customer, so a **boolean** rather than a number |
| `customRequests` | `custom_requests.customer_id` | CTX-ORD | `ORDERING_MERGE_CONSEQUENCE_PORT` | yes — `OWNERSHIP_TRANSFER` | repointed by DB4 §7; every row whatever its state, since a rejected request still carries the FK |
| `orders` | `orders.customer_id` | CTX-ORD | same | yes — `OWNERSHIP_TRANSFER` | repointed; `ix_orders__customer` exists in the schema **labelled "CC-27 merge"**, an index whose only purpose is letting a merge find them |
| `uploadedAssets` | `assets.uploaded_by_customer_id` | CTX-AST | `ASSET_MERGE_CONSEQUENCE_PORT` | yes — `OWNERSHIP_TRANSFER` | listed by G01 §E.2 among the repointed columns; every row, since a deleted asset still carries the column |

**No G01-predicted category was dropped.** All five named in `APP10-G01` §E.2
(`custom_requests`, `orders`, `assets.uploaded_by_customer_id`,
`customer_contact_points`, `business_profiles`) are present, plus
`activeSecureAccessGrants`, which the B02 prompt §8.1 names and DB3 §4 step 4
supports.

### Frozen categories explicitly excluded

The schema has **fourteen** foreign keys to `customers.id` across twelve tables
(two of them are the merge case's own survivor/loser halves). Having a
`customer_id` is therefore not the test — being *repointable* is. Excluded, and
why:

| Table | Why it is never counted |
|---|---|
| `approval_snapshots` | frozen commercial evidence of what the customer approved for production |
| `quotation_acceptances` | immutable acceptance evidence (CST-091) |
| `design_reviews` | frozen design-review evidence |
| `audit_events` | append-only, outlives its subject by design (G-DB7-46) |
| `custom_request_transitions` | append-only transition history |
| `order_transitions` | append-only transition history |

The schema comment on `customer_merge_cases` states the rule directly:
*"Executing a merge does **not** rewrite history: Orders, Quotations, Payments,
Notifications, Audit and design snapshots keep their original `customer_id`."*
Counting any of these would tell an operator that confirming a merge rewrites
what a customer already agreed to.

**Not persisted.** No count is stored anywhere. `MergeConsequencePreviewReader`
computes all six on every read — including for a `REJECTED` or `EXECUTED` case —
because rows arrive and leave between opening a case and executing it, and
`APP10-B03` re-evaluates actual state inside the transaction that moves it. A
preview is decision support, not a reservation. This is proven directly: a suite
reads a case, seeds three uploads, reads again, and sees `0 → 3`.

## E. Persistence / concurrency

**Case creation transaction.** `OpenCustomerMergeCase.open` runs one
`TransactionManager.runInTransaction`: read survivor → read loser → read for an
open pair → INSERT → append audit. The transaction exists because the audit row
must commit with the case or not at all. The acting Admin is resolved from the
bound request actor *before* the transaction opens, so an unattributable request
costs no database work.

**Uniqueness authority.** `uq_customer_merge_cases__survivor_loser__requested`
(CST-010 / IDX-009), a partial unique on `(survivor_customer_id,
loser_customer_id) WHERE status = 'REQUESTED'`. It shipped in migration `0014`;
B02 adds nothing to it.

**Concurrent duplicate proof.**
`admin-customer-merge-lifecycle.integration.spec.ts` → *"lets two concurrent
opens of the same pair create only one case"*: two `POST`s issued through
`Promise.all` against the real HTTP application. Both pass the pre-check before
either inserts; the observed statuses are `[201, 409]` and
`customer_merge_cases` holds exactly one row. `customer_merge_events` is still
empty afterwards.

**No ownership transfer occurs.** Proven by row comparison rather than by
response inspection. `ownershipSnapshot()` reads nine facts about a customer —
`merged_into_customer_id` plus eight counts — and suites assert it is
**identical** before and after opening a case, after rejecting one, and across
two detail reads. `mergeEventCount()` is a *global* count of
`customer_merge_events` and is asserted `0` on every one of those paths.

**No heavy lock protocol.** B02 introduces no ordered two-customer execution
lock. `APP10-B03` owns that (CC-27 / D8-18); adding it for a preview would be a
deadlock surface protecting nothing.

## F. Privacy / authorization

**Guards.** `AuthenticatedAdminGuard` + `StaffOriginGuard` on the controller;
`StaffJsonBodyGuard` additionally on the two body-bearing POSTs. Exactly the
treatment `adminSecureGrant_revoke` and `APP10-B01` use. The controller parses
no cookie, looks up no session, accepts no caller-supplied Admin id and defines
no guard of its own. No role check, because APP1-B01 is a binary
authenticated-admin gate and a permission matrix here would have no authority
behind it.

**Masked projections.** Both participants come from the delivered
`ADMIN_CUSTOMER_SUMMARY_PORT.findDetailSummary` (`APP5-B04`), which applies
`APP4-P01`'s `maskContact` inside Customer's own adapter and whose return type
has nowhere to hold `normalizedValue` or `displayValue`. **No second projection
was built**, so there is no second place to keep the masking rule in step with.
The merge card publishes strictly less than the support detail read: no `notes`,
no `contactId`.

**Absence of raw contact values.** Asserted directly: the preview suite
stringifies the whole response body and requires that all four fixture contact
values — two emails and two phone numbers, across both participants — appear
nowhere, along with `mergedIntoCustomerId`, `anonymizedAt`, `notes` and
`contactId`. A document-wide scan of the generated OpenAPI confirms none of
`normalizedValue`, `normalized_value`, `displayValue`, `display_value`,
`rawValue`, `e164`, `verifiedSource`, `contactPointId`, `companyName`, `taxCode`,
`billingContact`, `passwordHash` or `sessionToken` is published.

**Non-enumeration.** The API accepts **opaque ids only** — no email, no phone,
no contact field of any kind. Both participants are found with the delivered
exact-contact resolver, which refuses to distinguish an unknown contact from an
unverified, deactivated or malformed one. No customer list, search, prefix,
fuzzy match or paging was added. `SURVIVOR_NOT_FOUND` and `LOSER_NOT_FOUND` are
distinct on purpose: reaching them needs an authenticated Admin session **and**
two ids only the resolver hands out, and a single "one of these is wrong" would
send an operator back to re-resolve both contacts.

**Preview carries no PII.** Six numbers and a boolean. No row, no code, no name,
no amount.

## G. Audit / merge events

**Rows emitted.** Exactly one per actual state change:

| Operation | `action` | `target_kind` | `target_id` | `summary` | `reason` |
|---|---|---|---|---|---|
| open | `customer.merge_case_opened` | `CUSTOMER_MERGE_CASE` | the case id | `{ survivorCustomerId, loserCustomerId, status: 'REQUESTED' }` | **null** |
| reject | `customer.merge_case_rejected` | `CUSTOMER_MERGE_CASE` | the case id | `{ survivorCustomerId, loserCustomerId, status: 'REJECTED' }` | the operator's declining reason |

A detail read, a consequence preview and every refusal append **nothing**.

**`CUSTOMER_MERGE_CASE` is new in `AUDIT_TARGET_KINDS`**, on the same footing
`PRODUCT`, `DESIGN_TEMPLATE` and `CONTACT_VERIFICATION_CHALLENGE` already sit
on: `target_kind` is open text with no CHECK by DB4 design, so the list is the
application's own G-DB7-46 guard and adding a kind needs **no migration**. The
target is the *case*, not either customer: a merge case is about two identities
and neither is more its subject, so filing the row under one would hide the
decision from the other's timeline. Both ids travel in the summary.

**The two reasons are handled differently, and deliberately.** The **open**
reason is stored once, on `customer_merge_cases.reason`, and is *not* copied
into audit — the rule `CustomerMaintenanceAuditRecorder` records for
`customers.notes`: duplicating operator free text into an append-only table
creates a second copy with no scrub path. The **rejection** reason goes to
`audit_events.reason`, and that is the only durable home available:
`customer_merge_cases` has one `reason` column, it holds why the case was
raised, and overwriting it would destroy that in order to record why the case
was declined. `audit_events.reason` is the repository's canonical home for an
operator's stated reason on an action (`SecureGrantAuditRecorder`,
`StockAdjustmentRecorder`, `PaymentDecisionRecorder`), and the value is
length-bounded and trimmed by the request schema before it arrives. A suite
asserts the open reason is still intact on the case row after a rejection.

**Zero `customer_merge_events` rows.** `MERGE_EVENT_STEP_KINDS` is closed and
every member — `OWNERSHIP_TRANSFER`, `CONTACT_MOVE`, `GRANT_REVOKE`,
`TOMBSTONE` — names a step of *execution*. There is no `OPENED` or `REJECTED`
kind and B02 invents neither: appending a row for a case that moved nothing
would put a false step into the append-only evidence table `APP10-B03` will read
as the record of what a merge actually did. `mergeEventCount()` (a **global**
count, so a stray row under another case cannot hide) is asserted `0` after
open, after reject, after a concurrent-open race, and after two detail reads.

## H. OpenAPI delta

| | Before (B01 baseline) | After | Δ |
|---|--:|--:|--:|
| paths | 102 | 105 | +3 |
| operations | 111 | 114 | **+3** |
| schemas | 223 | 230 | +7 |

Matches the `APP10-G01` prediction of `B02 = +3 operations` exactly.

The seven new schemas are the minimum the three operations need:
`OpenCustomerMergeBody`, `RejectCustomerMergeBody`,
`AdminCustomerMergeOpenedResponse`, `AdminCustomerMergeCaseResponse`,
`MergeParticipantResponse`, `MergeParticipantContactResponse`,
`MergeConsequencePreviewResponse`.

Regenerated through the established commands only, and both drift gates are
green:

```text
pnpm --filter @embroidery/api openapi:generate      → 105 / 114 / 230
pnpm --filter @embroidery/api-client generate       → tree hash e0c5c6d2…
pnpm --filter @embroidery/api openapi:check         → up to date
pnpm --filter @embroidery/api-client check:generated → up to date
```

No generated artifact was hand-edited.

## I. Tests executed

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E = NOT_RUN
```

| Command | Why relevant | Result |
|---|---|---|
| `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath src/modules/customer/tests/integration/admin-customer-merge-lifecycle.integration.spec.ts` (`CMD-TEST-APP10-B02-LIFECYCLE`) | the two new mutations, their guards, the concurrency arbiter and the audit rows | **17 passed / 17** |
| `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath src/modules/customer/tests/integration/admin-customer-merge-preview.integration.spec.ts` (`CMD-TEST-APP10-B02-PREVIEW`) | the detail read, the six preview counts, frozen exclusion, masking and the no-write proof | **9 passed / 9** |
| `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath …/admin-customer-profile… …/admin-customer-contact-maintenance… …/admin-customer-support… …/admin-customer-resolve… …/admin-customer-grants… …/admin-secure-grant-revoke…` | `admin-support-context.ts` (shared harness) gained three route builders, and `AUDIT_TARGET_KINDS` gained a member. These six suites are the only consumers of either | **94 passed / 94** |
| `pnpm --filter @embroidery/api typecheck` | new ports crossing three module boundaries | pass |
| `pnpm --filter @embroidery/api openapi:generate` / `openapi:check` | 3 new operations | pass |
| `pnpm --filter @embroidery/api-client generate` / `check:generated` | contract change | pass |
| `node tools/check-app4-b07-contract.mjs` | the change touches the Admin Customer surface | **7 failures, all inherited or superseded — see §J** |

**Total: 120 focused tests pass, 26 of them new.**

Coverage against the prompt's §17.1 checklist:

*Open* — valid case created ✓ · mandatory reason (missing, blank, over-long) ✓ ·
self-merge refusal ✓ · unknown survivor **and** unknown loser, separately ✓ ·
already-merged survivor ✓ · already-merged loser ✓ · duplicate open pair ✓ ·
two concurrent opens produce one case ✓ · no customer/contact/grant/order/
request/asset ownership changed ✓ · audit emitted once ✓.

*Detail / preview* — authorized detail succeeds ✓ · masked-only projections ✓ ·
counts match seeded live references, category by category ✓ · the preview is the
loser's, not the survivor's ✓ · a deactivated contact counts, a non-ACTIVE grant
does not ✓ · frozen evidence exists with the same `customer_id` and is excluded
from every count and every category name ✓ · two reads write nothing ✓ · no
execution-step event appended ✓ · no raw PII in the response ✓ · counts are
recomputed rather than frozen ✓.

*Reject* — `REQUESTED → REJECTED` ✓ · reason validation ✓ · invalid transitions
(unknown, already rejected, executed) ✓ · no customer-owned record changed ✓ ·
audit emitted once with the reason ✓ · no B03 execution-step event ✓ · the open
reason survives ✓.

*Guards* — unauthenticated on all three routes ✓ · foreign origin ✓ ·
`StaffJsonBodyGuard` on both body-bearing POSTs ✓.

**Not run, and deliberately:** the full monorepo suite, all API tests, all Admin
tests, E2E, `APP10-E01`, notification, payment, inventory and production suites,
the DB manifests/checkers, and every APP4/APP10-B01 suite that does not consume
a file this checkpoint changed. `APP10-B03`'s execution tests do not exist yet.

## J. Quality validation

| Control | Treatment | Result |
|---|---|---|
| Prettier | `npx prettier --check` over the exact changed-file list | **clean** (4 files reformatted with `--write` during development) |
| ESLint | `pnpm --filter @embroidery/api exec eslint src/modules/customer src/modules/order src/modules/asset src/modules/audit`, plus `pnpm --filter @embroidery/database lint` | **clean** |
| SonarQube | repository-global control; not invocable from this checkpoint (`FU-GOV-Q01-SONAR-COMMAND-01` still open) | unchanged |

No repository-wide aggregate command was used.

### Inherited failures, recorded transparently

**1. `apps/api` ESLint — 3 pre-existing errors in APP6 code.**

```text
src/modules/design/application/deciding/approve-design-version.use-case.ts
  194:11, 241:7, 285:11  @typescript-eslint/no-unnecessary-type-assertion
```

Verified pre-existing **at HEAD on a stashed, pristine tree** — same file, same
three lines, same rule. Not touched by B02, and not repaired here: fixing
unrelated APP6 debt to make a workspace-wide command green is exactly what
§18 forbids. Recorded below as `FU-APP10-B02-01`.

**2. `CMD-CHECK-APP4-B07-CONTRACT` — 7 failures.** Six are the ones
`SCOPED_COMMAND_INDEX.md` §1.2 already records as inherited or superseded by
`APP10-B01` (two frozen-artifact counts, four B01 projection/route rules). The
seventh is new and is superseded by B02, documented in a new §1.3: the gate's
document-wide `businessProfile` forbidden-substring scan now fires on
`MergeConsequencePreviewResponse.businessProfile` — a boolean on a different
surface, carrying no column of `business_profiles`. The rule's *intent* is
verifiably intact: `companyName`, `taxCode` and `billingContact` remain absent
from the whole document, and `AdminCustomerDetailResponse` still publishes no
business profile. **No gate logic was changed**, on §1.2's standing rule.

## K. Files changed

**New — Customer module (13)**

```text
apps/api/src/modules/customer/domain/merge/customer-merge.errors.ts
apps/api/src/modules/customer/domain/merge/customer-merge.policy.ts
apps/api/src/modules/customer/domain/repositories/customer-merge-case.repository.ts
apps/api/src/modules/customer/domain/repositories/customer-merge-preview.port.ts
apps/api/src/modules/customer/infrastructure/persistence/customer-merge-case-row.mapper.ts
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer-merge-case.repository.ts
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer-merge-preview.adapter.ts
apps/api/src/modules/customer/application/customer-merge-audit.recorder.ts
apps/api/src/modules/customer/application/customer-merge-case.query.ts
apps/api/src/modules/customer/application/customer-merge-consequence.preview.ts
apps/api/src/modules/customer/application/open-customer-merge-case.use-case.ts
apps/api/src/modules/customer/application/reject-customer-merge-case.use-case.ts
apps/api/src/modules/customer/presentation/admin-customer-merge.controller.ts
apps/api/src/modules/customer/presentation/schemas/admin-customer-merge.request.ts
apps/api/src/modules/customer/presentation/schemas/admin-customer-merge.response.ts
```

**New — cross-module read seams (6)**

```text
apps/api/src/modules/order/domain/repositories/customer-merge-consequence.port.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-customer-merge-consequence.adapter.ts
apps/api/src/modules/order/customer-merge-consequence.module.ts
apps/api/src/modules/asset/domain/repositories/customer-merge-consequence.port.ts
apps/api/src/modules/asset/infrastructure/persistence/drizzle-customer-merge-consequence.adapter.ts
apps/api/src/modules/asset/customer-merge-consequence.module.ts
```

**New — tests (3)**

```text
apps/api/src/modules/customer/tests/integration/admin-customer-merge-lifecycle.integration.spec.ts
apps/api/src/modules/customer/tests/integration/admin-customer-merge-preview.integration.spec.ts
apps/api/src/modules/customer/tests/integration/customer-merge-queries.ts
```

**Modified (8)**

```text
apps/api/src/modules/customer/customer.module.ts            two seam imports, five providers, three exports
apps/api/src/modules/customer/customer-admin-support.module.ts   the merge controller
apps/api/src/modules/audit/domain/repositories/audit-event.repository.ts   + CUSTOMER_MERGE_CASE target kind
apps/api/src/modules/customer/tests/integration/admin-support-context.ts   + three route builders
packages/database/src/index.ts                              + CustomerMergeCaseState type export
packages/contracts/openapi/openapi.generated.json           regenerated
packages/api-client/src/generated/embroidery-api.ts         regenerated
packages/api-client/src/generated/embroidery-api.schemas.ts regenerated
docs/implementation/SCOPED_COMMAND_INDEX.md                 §1.3 + two ACTIVE_SCOPED rows
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md   roadmap
```

No file exceeds its limit: the largest source file is
`admin-customer-merge.controller.ts` at **331** lines (limit 400, mostly Swagger
descriptions); the largest test file is
`admin-customer-merge-lifecycle.integration.spec.ts` at **424** (limit 600).

## L. Baseline delta

| | Entry (B01 close) | Exit |
|---|---|---|
| Branch | `production` | `production` |
| Entry HEAD | `644b204` | unchanged; B02 is uncommitted-then-committed on top |
| Migrations | 37 | **37** |
| OpenAPI paths / operations / schemas | 102 / 111 / 223 | **105 / 114 / 230** |
| Worker changes | — | **none** |
| Admin routes | 21 | **21** (no UI in B02) |
| Storefront routes | 12 | **12** |
| Figma rows | 495 | **495** (no design change) |
| Push status | — | not pushed; committed locally on `production` |

## M. Follow-ups

Non-blocking, out of scope for B02.

| Id | Item | Disposition |
|---|---|---|
| `FU-APP10-B02-01` | 3 pre-existing `@typescript-eslint/no-unnecessary-type-assertion` errors in `approve-design-version.use-case.ts`, red at HEAD | APP6 lint debt. Repair belongs to a hardening or APP6 maintenance slice, not to a merge checkpoint |
| `FU-APP10-B02-02` | The preview reports the loser's `businessProfile` but not whether the **survivor** already has one. `uq_business_profiles__customer` allows one per customer, so an execution that moves a profile onto a survivor that already has one will conflict | `APP10-B03` owns the collision rule inside its transaction, and should decide there whether the preview needs a conflict flag. B02 deliberately does not pre-empt that design |
| `FU-APP10-B02-03` | The operator's **rejection** reason is durable only in `audit_events.reason`, so `APP10-A02` cannot render it beside the case without reading the audit trail | If A02 needs it on the case, `customer_merge_cases` needs a `decision_reason` column — a migration, and therefore a database-change decision, not a B02 workaround |
| `FU-APP10-B01-01` | Repairing `CMD-CHECK-APP4-B07-CONTRACT` for the APP10 world (now seven superseded/inherited failures) | unchanged; still APP4 / tooling maintenance |
| `FU-APP10-G01-04` | CST-098 append-only **trigger** for `customer_merge_events` is documented as not-yet-built | unchanged. B02 appends zero rows to that table, so it is untouched by this gap |

## N. Roadmap

`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` §11
updated:

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge case lifecycle & consequence preview | `COMPLETE` |
| `APP10-B03` | Merge execution & immutable event history | `NEXT` |
| `APP10-D01` | APP10 design package | `INCOMPLETE` |
| `APP10-A01` | Admin customer profile maintenance UI | `INCOMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `INCOMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `INCOMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `INCOMPLETE` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
APP10-B03 = NEXT
```
