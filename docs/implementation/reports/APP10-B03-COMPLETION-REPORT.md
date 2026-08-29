# APP10-B03 — Customer Merge Execution & Immutable Event History — Completion Report

Date: 2026-08-29 · Branch: `production` · Mode: IMPLEMENTATION

## A. Verdict

```text
APP10-B03 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEW_HTTP_OPERATIONS = 1
MIGRATIONS_ADDED = 0
NEXT_CHECKPOINT = APP10-D01
```

## B. Execute HTTP contract

| Method | Path | Operation id | Body | Success |
|---|---|---|---|---|
| POST | `/api/admin/customer-merges/{caseId}/execute` | `adminCustomerMerge_execute` | **none** | `200` + `{ mergeCaseId, status, outcome }` |

The operation id is **derived**, not declared: `createOperationId` builds it from
`AdminCustomerMergeController#execute`, the identity `APP10-G01` §E.2 fixed. No
`CONTROLLER_DOMAIN_KEYS` entry was needed and no second controller was created.

**The route is bodyless, and that is the security property.** Survivor and loser
come from the case an operator already opened and reviewed. A body could only
repeat them, and a repeated id is an id a caller could change. Nothing lets a
request choose which identity survives, override an eligibility rule, skip a step
or pass an execution option — the only thing an execute request decides is *which
case*. `StaffJsonBodyGuard` is therefore deliberately absent: there is no JSON to
type-check, and adding a body so the guard would have something to check would be
inventing an attack surface in order to protect it.

**Outcomes.**

| `outcome` | When | What it wrote |
|---|---|---|
| `EXECUTED` | the case was `REQUESTED` and this request merged it | everything in §C |
| `ALREADY_EXECUTED` | the case was already `EXECUTED` | **nothing** |

Two values on the precedent `adminNotificationIntent_replay` set with
`CREATED`/`EXISTING`. `200` rather than `204`: a replay is a success that changed
nothing, and an empty body could not tell an operator that apart from the request
that performed the merge. Not `201` either — nothing was created; a decision was
carried out.

**Errors.**

| Status | Cause |
|---|---|
| `400` | malformed `caseId` |
| `401` | no live Admin session |
| `403` | origin outside the Admin allowlist |
| `404` | `MERGE_CASE_NOT_FOUND`, `SURVIVOR_NOT_FOUND`, `LOSER_NOT_FOUND` |
| `409` | `MERGE_CASE_NOT_EXECUTABLE` (`REJECTED`), `SURVIVOR_ALREADY_MERGED`, `LOSER_ALREADY_MERGED`, `MERGE_BUSINESS_PROFILE_CONFLICT`, `MERGE_CONTACT_COLLISION` |

Every message is a fixed, server-authored string. None interpolates an id, a
contact value, a mask, a display name or an operator reason.

## C. Transaction protocol

One `runInTransaction`, in `ExecuteCustomerMerge`. Every collaborator joins it
through `DatabaseExecutor`'s ambient handle; none opens a boundary of its own.

| # | Step | Statement | Why here |
|--:|---|---|---|
| 1 | lock the case | `SELECT … FOR UPDATE` on `customer_merge_cases` | the serialization point: two executes of one case queue here |
| 2 | classify | pure | `REQUESTED` → execute · `EXECUTED` → idempotent success, **early return** · `REJECTED` → 409 |
| 3 | lock both customers | `SELECT … WHERE id IN (…) ORDER BY id FOR UPDATE` | CC-27 / D8-18 ordered locks |
| 4 | revalidate participants | pure over the locked rows | both exist, neither already merged |
| 5 | lock + check business profiles | `SELECT customer_id … FOR UPDATE` | fail closed **before** any destructive write |
| 6 | contacts | lock both sides, demote, `UPDATE … SET customer_id` | §E |
| 7 | grants | `listForCustomer` → `revoke(id, 'merge')` per ACTIVE row | §G |
| 8 | ownership | Ordering `repointCustomer`, Asset `repointUploader`, `moveBusinessProfile` | §D |
| 9 | tombstone | `UPDATE customers SET merged_into_customer_id … WHERE merged_into_customer_id IS NULL` | last: it is the claim the loser owns nothing live |
| 10 | merge events | one `INSERT` of the seven-row sequence | §H |
| 11 | case transition | `UPDATE … SET status='EXECUTED' WHERE status='REQUESTED'` | §I |
| 12 | Admin audit | `audit_events` append | §L |

**Lock ordering.** `ORDER BY id` sits above `FOR UPDATE` in the plan, so the rows
are locked in sorted order rather than in scan order. The ordering is decided
*inside the statement*, not by the caller, so a discipline a use case could forget
is one it cannot get wrong. Survivor and loser keep their product meaning
unchanged; only the lock sequence is normalized. The **case row is locked first**,
so two executes of one case queue on the case, and two executes of different cases
sharing a customer are serialized by the ordered customer locks.

**No irreversible side effect is inside the boundary.** No notification, provider
call, queued job or outbox emission — anything leaving the process cannot be
rolled back.

## D. Live ownership disposition

For a loser with the standard fixture (2 contacts, 2 requests, 1 order, 1 ACTIVE
grant, 2 uploads, 1 business profile):

| Category | Column | Before | Operation | After | Owning module / port | Count authority |
|---|---|--:|---|--:|---|---|
| contact points | `customer_contact_points.customer_id` | 2 | repointed (+ primary demotion) | 0 | CTX-CUS · `CUSTOMER_MERGE_EXECUTION_PORT` | `UPDATE … RETURNING id` |
| secure grants | `secure_access_grants.status` | 1 ACTIVE | **revoked**, not repointed | 0 ACTIVE | CTX-CUS · `SECURE_ACCESS_GRANT_REPOSITORY.revoke` | count of ACTIVE rows revoked |
| custom requests | `custom_requests.customer_id` | 2 | repointed | 0 | CTX-ORD · `ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT` | `UPDATE … RETURNING id` |
| orders | `orders.customer_id` | 1 | repointed | 0 | CTX-ORD · same port | `UPDATE … RETURNING id` |
| uploaded assets | `assets.uploaded_by_customer_id` | 2 | repointed | 0 | CTX-AST · `ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT` | `UPDATE … RETURNING id` |
| business profile | `business_profiles.customer_id` | 1 | repointed when no collision | 0 | CTX-CUS · execution port | `UPDATE … RETURNING id` |
| tombstone | `customers.merged_into_customer_id` | NULL | set to survivor | survivor | CTX-CUS · execution port | guarded `UPDATE`, 1 row |

**The cross-module seam.** Two new ports, one method each,
`repointCustomer(from, to)` and `repointUploader(from, to)`, each implemented by
the module that owns the table and published from a module of its own
(`CustomerOwnershipTransferModule`, `AssetCustomerOwnershipTransferModule`). They
are **separate from** the `APP10-B02` count-only consequence ports on purpose: one
module exporting both would put a cross-module `UPDATE` one injection away from a
preview that must not write.

Neither takes a `tx` parameter, and that is the repository's native mechanism
rather than an omission. `DatabaseExecutor` resolves the ambient transaction
through `AsyncLocalStorage`, so an implementation issuing a statement inside
`runInTransaction` is already in that transaction; each also calls
`requireTransaction`, so a caller that forgot the boundary fails loudly instead of
committing a repoint on its own. Passing a handle across a module boundary would
be the leak `BACKEND_CONVENTIONS.md` §5.14 forbids, and a generic ORM-shaped
transaction argument would be a second transaction model beside the delivered one.
No general ownership framework was created.

## E. Collision rules

### E.1 Business profile — fail closed

`uq_business_profiles__customer` (CST-051) caps the table at one row per customer.

```text
loserHasProfile AND survivorHasProfile  →  409 MERGE_BUSINESS_PROFILE_CONFLICT
                                           before any destructive write
```

Nothing is overwritten, deleted, field-merged or silently chosen: every resolution
available to code destroys data the operator never saw. The check runs on rows
read **under `FOR UPDATE` inside the transaction**, so a profile created for the
survivor after the preview was drawn is caught too. Proven by
`fails closed before any destructive write`: the loser still owns its order, its
ACTIVE grant, its contacts and its uploads, is not tombstoned, and the case is
still `REQUESTED`.

### E.2 Contact collisions — which forms the schema actually permits

| Form | Reachable? | Behaviour |
|---|---|---|
| two **verified + active** rows with the same `(kind, normalized_value)` on both customers | **no** — CST-005 is a *global* partial unique over exactly that predicate | unreachable by construction; if it somehow occurred, the catalogued `CONTACT_ALREADY_VERIFIED` code is translated to `409 MERGE_CONTACT_COLLISION` and the transaction rolls back |
| loser holds an **unverified** duplicate of a survivor's verified contact | yes | moves intact; nothing promotes or verifies it |
| loser holds a **verified but deactivated** duplicate | yes | moves intact; nothing revives it |
| both customers have an `is_primary` row (CST-006) | yes, and it is the ordinary case | the loser's primary is **demoted** before the move |

Both reachable duplicate forms are proven by tests that compare the moved row
against its original: value, `verified_at`, `verified_source` and
`deactivated_at` are unchanged, and only `customer_id` (and `is_primary`, where
demoted) differs. **No verification evidence is forged, rewritten or deleted**,
and no historical audit or verification record is touched.

### E.3 Primary-contact resolution

Deterministic and one-directional: **the survivor's existing primary wins.** When
the survivor has no primary, the loser's stays primary and simply moves. Only
`is_primary` is written, only on the loser's side. The plan is a pure function
(`planPrimaryContactDemotions`) over rows locked from both customers, ordered by
id, so a loser holding more than one primary (which CST-006 forbids) still
resolves deterministically. Result asserted directly: after a merge the survivor
has **exactly one** `is_primary` row, and it is the one it already had.

### E.4 Exact fail-closed conditions

```text
REJECTED case                         → 409, nothing written
survivor or loser already merged      → 409, nothing written
both customers hold a business profile→ 409, nothing written
a contact uniqueness arbiter fires    → 409, whole transaction rolled back
the guarded tombstone matches nothing → 409, whole transaction rolled back
the case transition matches nothing   → 409, whole transaction rolled back
```

## F. Frozen evidence proof

```text
orders.customer_id                     = LIVE AND REPOINTED
order_transitions / frozen order evidence = HISTORICAL AND UNCHANGED
```

Verified unchanged, by reading the owner of every row of each table before and
after a merge and asserting the lists are identical:

| Table | Still names | Proof |
|---|---|---|
| `approval_snapshots` | the merged-away customer | `frozenEvidenceOwners` before/after equality |
| `quotation_acceptances` | the merged-away customer | same |
| `order_transitions` | the merged-away customer | same, on a row seeded before the merge |
| `custom_request_transitions` | the merged-away customer | same, on a row seeded before the merge |
| `audit_events` | append-only; no row rewritten | the execute row is an **append**, and the merge appends nothing else |
| `design_reviews` | untouched — no statement in this checkpoint names the table | code inspection; no adapter reaches it |

The same assertion pins both directions at once: in the very test where
`orders.customer_id` moved from loser to survivor, the loser's
`order_transitions` row still names the loser, and its `approval_snapshots` and
`quotation_acceptances` counts are still `1`.

**The stale schema comment is corrected.**
`packages/database/src/schema/customer/customer-merge-cases.ts` previously said
that *"Orders … keep their original `customer_id`"*. It now distinguishes, per
column: the live ownership row is repointed (`orders`, `custom_requests`,
`customer_contact_points`, `business_profiles`, `assets.uploaded_by_customer_id`
— DB4 §7, DB3 §4 step 2, IDX-118 labelled "CC-27 merge"); the frozen evidence and
append-only history are never rewritten. This closes `FU-APP10-G01-01`. The edit
is comments only — no column, constraint, index or migration changed.

## G. Secure grant disposition

| Grant state before | Count | After | `revoke_reason` |
|---|--:|---|---|
| `ACTIVE` (loser) | 1 | `REVOKED` | `merge` |
| `EXPIRED` (loser) | 1 | `EXPIRED` | unchanged |
| `REVOKED` (loser) | 1 | `REVOKED` | *unchanged* — `operator closed the ticket` survives |

**No grant is repointed.** Every row still carries `customer_id = loser` after the
merge, asserted for all three. A secure link was issued to a person for one
request; handing it to another identity would let a link somebody already holds
start opening a different customer's data (DB3 §4 step 4). Proof that no old link
is live: `activeGrants` for the loser is `0` afterwards.

Revocation is written through the delivered `SecureAccessGrantRepository`, which
joins the merge transaction, rather than through `RevokeSecureGrantUseCase` —
that use case opens a transaction of its own and appends an Admin audit row per
grant, which would both break atomicity and file one revocation event per grant
against a merge.

## H. Immutable merge events

A fixed **seven-row** sequence per executed merge, in append order:

| # | `step_kind` | `subject_table` | `affectedCount` (standard fixture) |
|--:|---|---|--:|
| 1 | `CONTACT_MOVE` | `customer_contact_points` | 2 (+ `primaryDemoted: true`) |
| 2 | `GRANT_REVOKE` | `secure_access_grants` | 1 |
| 3 | `OWNERSHIP_TRANSFER` | `custom_requests` | 2 |
| 4 | `OWNERSHIP_TRANSFER` | `orders` | 1 |
| 5 | `OWNERSHIP_TRANSFER` | `assets` | 2 |
| 6 | `OWNERSHIP_TRANSFER` | `business_profiles` | 1 |
| 7 | `TOMBSTONE` | `customers` | 1 |

Only the four delivered `MERGE_EVENT_STEP_KINDS` are used. No `OPENED` or
`REJECTED` step was invented, and no new kind was added — so no migration.

**One row per owning category**, even when a category moved nothing, so the
history reconciles category by category rather than hiding several tables inside
one opaque number. `subject_id` is the **loser's id** — the customer reference
that moved — because naming one arbitrary row out of forty would describe the step
worse than naming what all of them had in common; `detail` carries
`{ toCustomerId, affectedCount }` (plus `primaryDemoted` on the contact step), so
each row states its own transfer direction.

**Counts are the transaction's own.** Every number comes from an
`UPDATE … RETURNING`, never from the `APP10-B02` preview. Proven directly: a suite
reads the preview (`uploadedAssets: 0`), *then* seeds the commerce fixture, then
executes — and the evidence records `assets: 2`, `orders: 1`.

**No PII.** The whole serialized event set is asserted to contain neither fixture
email, neither fixture phone, no display name, no company name and no operator
reason.

**Append-only.** `CustomerMergeEventRepository` has exactly one method, `append`.
There is no update, no delete and no read on the contract or the adapter, so no
caller has a path to correct an event in place. CST-098's database-level trigger
remains the inherited DB-phase gap `FU-APP10-G01-04` records — see §R.

**Replay appends none.** After a second execute of the same case, the full
`customer_merge_events` row set is asserted **equal** to the set after the first.

## I. Idempotency / concurrency

**Single replay.** Execute → `200 EXECUTED`; execute again → `200
ALREADY_EXECUTED`. The second call's assertions: both ownership snapshots, the
full contact row set and the full grant row set are `toEqual` their post-first
values; `customer_merge_events` is unchanged row for row; the global
`audit_events` count is unchanged; exactly one merge audit row exists. The replay
returns **before** the participants are read, so it cannot fail merely because the
loser it merged is now a tombstone.

**Concurrent execute.** Two `POST`s issued through `Promise.all` against the real
HTTP application. Observed: `[200, 200]`, outcomes `['ALREADY_EXECUTED',
'EXECUTED']` (sorted), exactly **7** merge events, exactly **1** execute audit
row, one tombstone, and the survivor owning the order. No deadlock. The case row
lock is what makes the second transaction wait rather than race; the guarded
`WHERE status = 'REQUESTED'` on the transition is the second arbiter behind it.

No idempotency-key header was added: case identity plus the row lock plus the
guarded transition already provide the authority.

## J. Rollback proof

Injected at the narrowest seam the composition offers — the append-only evidence
writer, which runs **after** every transfer and after the tombstone. The provider
is a singleton in the running application; `jest.spyOn(events, 'append')` rejects
once and is restored in a `finally`. **No production-only flag, branch or
environment variable was added.**

| | Before | After the failed request |
|---|---|---|
| loser `merged_into_customer_id` | NULL | **NULL** |
| contact rows (all) | seeded set | **identical** |
| grant rows (all) | 1 ACTIVE | **identical** |
| loser orders / requests / assets / profile | 1 / 2 / 2 / 1 | **identical** |
| survivor ownership snapshot | seeded | **identical** |
| `customer_merge_events` | 0 | **0** |
| merge audit rows for the case | 0 | **0** |
| global `audit_events` count | *n* | ***n*** |
| case status | `REQUESTED` | **`REQUESTED`** |

The request answers `500` (the injected failure is not a business refusal and is
sanitised by the platform filter). The same suite then retries the case and it
**succeeds**, which is the point of leaving it `REQUESTED`.

## K. Preview refinement

`MergeConsequencePreviewResponse.businessProfile` evolved from a boolean to a
bounded object, on the existing `adminCustomerMerge_detail` operation. **No new
endpoint, no migration, no persisted preview.**

```text
businessProfile: {
  loserHasProfile:    boolean
  survivorHasProfile: boolean
  conflict:           boolean   // derived, never supplied
}
```

Evolved rather than joined by a second field: two members answering overlapping
questions about one table is how a client comes to read the wrong one. It is the
only category read for **both** customers — the others describe rows that move,
and the survivor's are staying where they are. `conflict` is computed by the same
`businessProfileReadiness()` the execution transaction uses, so the warning an
operator sees and the rule that refuses the merge cannot drift apart.

Backed by one new read on the existing preview port,
`hasBusinessProfile(customerId)` — a presence test rather than a second full
count, because the survivor's contact and grant counts describe rows no merge
would move.

**No contact-collision readiness flag was added**, and the reason is §E.2: the
only reachable contact collision is primary uniqueness, which execution resolves
deterministically and which therefore blocks nothing. A flag that was always
`false` would be a warning an operator learns to ignore.

## L. Privacy / authorization / audit

**Guards.** `AuthenticatedAdminGuard` + `StaffOriginGuard`, inherited from the
controller. No `StaffJsonBodyGuard` — see §B. No RBAC was introduced: APP1-B01 is
a binary authenticated-admin gate, and a permission matrix invented here would be
a security model with no authority behind it. No caller-supplied actor or admin id
is accepted anywhere; the acting Admin comes from the bound request actor, and an
unattributable request throws rather than being recorded as `SYSTEM`.

Both refusals are proven against the running guards: no cookie → `401`, foreign
`Origin` → `403`, and in each case `customer_merge_events` is still empty and the
case still `REQUESTED`.

**PII controls.** The execute response carries three fields — a case id, a state
and an outcome — and is asserted to contain no fixture contact value. Merge events
carry no PII (§H). The audit summary carries the two customer ids and the
resulting state, and no count, contact, mask, display name or reason. The
execution adapter never *selects* a contact value, a company name, a tax code or a
billing contact, so those columns are not in hand on this path at all.

**Execute audit row.** Exactly one, inside the transaction:

```text
action      customer.merge_case_executed
actor       ADMIN, from the session
target      CUSTOMER_MERGE_CASE / the case id
summary     { survivorCustomerId, loserCustomerId, status: 'EXECUTED' }
reason      null
```

Filed against the **case**, not either customer — a merge case is about two
identities and neither is more its subject. Asserted: zero `CUSTOMER`-targeted
audit rows are written for either participant, and a replay appends no second row.

## M. OpenAPI delta

| | Before (B02) | After | Δ |
|---|--:|--:|--:|
| paths | 105 | 106 | +1 |
| operations | 114 | **115** | **+1** |
| schemas | 230 | 232 | +2 |

Matches the `APP10-G01` prediction of `115` operations at phase end exactly. The
two new schemas are the minimum the change needs:
`AdminCustomerMergeExecutedResponse` and `MergeBusinessProfileReadinessResponse`.

Regenerated through the established commands only; both drift gates green:

```text
pnpm --filter @embroidery/api openapi:generate       → 106 / 115 / 232
pnpm --filter @embroidery/api-client generate        → tree hash f247109a…
pnpm --filter @embroidery/api openapi:check          → up to date
pnpm --filter @embroidery/api-client check:generated → up to date
```

No generated artifact was hand-edited.

## N. Tests executed

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E = NOT_RUN
```

| Command | Why relevant | Result |
|---|---|---|
| `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath src/modules/customer/tests/integration/admin-customer-merge-execution.integration.spec.ts` (`CMD-TEST-APP10-B03-EXECUTION`) | the successful merge: every transfer, the tombstone, grant revocation, frozen-evidence immutability, the event sequence, the audit row, the guards | **12 passed / 12** |
| `pnpm --filter @embroidery/api exec jest … admin-customer-merge-execution-guards.integration.spec.ts` (`CMD-TEST-APP10-B03-EXECUTION-GUARDS`) | the business-profile collision, the permitted contact-collision forms, primary resolution, invalid lifecycle, replay, concurrency, rollback | **14 passed / 14** |
| `pnpm --filter @embroidery/api exec jest … admin-customer-merge-preview.integration.spec.ts` (`CMD-TEST-APP10-B02-PREVIEW`) | **directly impacted**: §K changes the preview contract this suite asserts | **9 passed / 9** |
| `pnpm --filter @embroidery/api exec jest … admin-customer-merge-lifecycle.integration.spec.ts` (`CMD-TEST-APP10-B02-LIFECYCLE`) | **directly impacted**: shares `customer-merge.errors.ts`, the case repository and the audit recorder, all of which B03 extends | **17 passed / 17** |
| `pnpm --filter @embroidery/api typecheck` | two new cross-module ports and a changed application contract | pass |
| `pnpm --filter @embroidery/api openapi:generate` / `openapi:check` | 1 new operation | pass |
| `pnpm --filter @embroidery/api-client generate` / `check:generated` | contract change | pass |
| `node tools/check-app4-b02.mjs` | the change touches the Customer module the gate scopes | **74 failures — 70 inherited at HEAD, 4 superseded; see §O** |
| `node tools/check-app4-b07-contract.mjs` | the change touches the Admin Customer surface | **7 failures, all already recorded; see §O** |

**Total: 52 focused tests pass, 26 of them new.**

Coverage against the prompt's §26.1 checklist — *successful execution*: case
becomes `EXECUTED` ✓ · survivor active and unmerged ✓ · loser tombstoned to
survivor ✓ · contacts handled per §11 ✓ · ACTIVE grants revoked ✓ · custom
requests, orders, uploaded assets repointed ✓ · business profile repointed when no
collision ✓ · frozen evidence ownership-identical ✓ · event counts are the
transaction's ✓ · one execute audit row ✓ · all changes commit together ✓.
*Business-profile collision*: preview exposes conflict ✓ · execute fails before
destructive work ✓ · no ownership change, no tombstone, no revoke, no events, case
still `REQUESTED` ✓. *Contact collision*: every form the schema permits seeded ✓ ·
deterministic handling ✓ · no evidence forged or rewritten ✓. *Idempotent replay*:
succeeds ✓ · changes nothing ✓ · zero new events ✓ · zero new audit rows ✓.
*Concurrent execute*: one destructive execution ✓ · correct final state ✓ · one
sequence ✓ · one audit row ✓ · no deadlock ✓. *Invalid lifecycle*: unknown case ✓ ·
`REJECTED` ✓ · malformed id ✓ · participant invalidated after preview, both sides ✓.
*Rollback*: full ✓. *Privacy*: no raw contact in response, events or audit ✓ · no
frozen evidence rewritten ✓.

**Not run, and deliberately:** the full monorepo suite, all API tests, all Admin
tests, E2E, `APP10-E01`, notification/payment/inventory/production suites, the DB
manifests, and every APP4/APP10-B01 suite. `APP10-B01`'s runtime paths are
untouched by B03; `admin-support-context.ts` gained one route builder (purely
additive) and `customer.module.ts` gained providers — and the module composition
is proven by the four suites above, which boot the same `CustomerAdminSupportModule`.

## O. Quality validation

| Control | Treatment | Result |
|---|---|---|
| Prettier | `npx prettier --write` over the exact changed-file list, generated artifacts excluded | **clean** (7 files reformatted during development) |
| ESLint | `pnpm --filter @embroidery/api exec eslint src/modules/customer src/modules/order src/modules/asset src/modules/audit` + `pnpm --filter @embroidery/database lint` | **clean** |
| SonarQube | repository-global control; not invocable from this checkpoint (`FU-GOV-Q01-SONAR-COMMAND-01` still open) | unchanged |
| `node tools/check-report-secrets.mjs` | run because this checkpoint adds a report | **2 failures, both inherited** — `APP6-B04` line 93 and `APP9-G01` line 381, the false positives already recorded at HEAD. **No line of this report is flagged.** |

No repository-wide aggregate command was used. The three inherited APP6 ESLint
errors (`FU-APP10-B02-01`) are outside the linted scope and were not repaired —
fixing unrelated debt to make a workspace-wide command green is what
`VALIDATION_GOVERNANCE.md` §18 forbids.

### Historical scoped checkers

**`CMD-CHECK-APP4-B02` — 70 → 74.** Measured on a stashed, pristine tree: the gate
is already at **70** failures at the `APP10-B02` HEAD. The four new ones are
instances of two scope-boundary rules that `APP10-B03` supersedes — "touches
customer merge cases" on the transfer service and the execute use case, "authors a
business profile" on the transfer service (it *repoints* `customer_id` and writes
none of the three business columns), and "the repository gained a merge write" on
the new execution adapter, which is where the tombstone belongs. The rules remain
true of the code they were written about: `drizzle-customer.repository.ts` still
contains no `merged_into_customer_id` write, and `UpdateCustomerProfileInput`
still has no member for one. **No gate logic was changed**, on the standing §1.2
rule; recorded in `SCOPED_COMMAND_INDEX.md` §1.4 as `FU-APP10-B03-01`.

**`CMD-CHECK-APP4-B07-CONTRACT` — 7, unchanged.** The same seven §1.2/§1.3 already
record. B03 adds **no new failure**: the `businessProfile` forbidden-substring scan
fires on the field name, which is unchanged, and the three members carry no column
of `business_profiles` either. `companyName`, `taxCode` and `billingContact` remain
absent from the whole document. §1.3 was updated for the operation total
(`114` → `115`) and the refined field shape.

## P. Files changed

**New — Customer module (7)**

```text
apps/api/src/modules/customer/domain/merge/customer-merge-execution.policy.ts
apps/api/src/modules/customer/domain/repositories/customer-merge-execution.port.ts
apps/api/src/modules/customer/domain/repositories/customer-merge-event.repository.ts
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer-merge-execution.adapter.ts
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer-merge-event.repository.ts
apps/api/src/modules/customer/application/customer-merge-transfer.service.ts
apps/api/src/modules/customer/application/execute-customer-merge.use-case.ts
```

**New — cross-module ownership-transfer seams (6)**

```text
apps/api/src/modules/order/domain/repositories/customer-ownership-transfer.port.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-customer-ownership-transfer.adapter.ts
apps/api/src/modules/order/customer-ownership-transfer.module.ts
apps/api/src/modules/asset/domain/repositories/customer-ownership-transfer.port.ts
apps/api/src/modules/asset/infrastructure/persistence/drizzle-customer-ownership-transfer.adapter.ts
apps/api/src/modules/asset/customer-ownership-transfer.module.ts
```

**New — presentation split (1)**

```text
apps/api/src/modules/customer/presentation/schemas/admin-customer-merge.projection.ts
```

**New — tests (3)**

```text
apps/api/src/modules/customer/tests/integration/admin-customer-merge-execution.integration.spec.ts
apps/api/src/modules/customer/tests/integration/admin-customer-merge-execution-guards.integration.spec.ts
apps/api/src/modules/customer/tests/integration/customer-merge-execution-queries.ts
```

**Modified (18)**

```text
apps/api/src/modules/customer/domain/merge/customer-merge.errors.ts                three failures added
apps/api/src/modules/customer/domain/repositories/customer-merge-case.repository.ts  + lockById, + execute
apps/api/src/modules/customer/domain/repositories/customer-merge-preview.port.ts     + hasBusinessProfile
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer-merge-case.repository.ts
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer-merge-preview.adapter.ts
apps/api/src/modules/customer/application/customer-merge-audit.recorder.ts           + recordExecuted
apps/api/src/modules/customer/application/customer-merge-case.query.ts               forCase
apps/api/src/modules/customer/application/customer-merge-consequence.preview.ts      readiness
apps/api/src/modules/customer/presentation/admin-customer-merge.controller.ts        + execute
apps/api/src/modules/customer/presentation/schemas/admin-customer-merge.response.ts  + 2 schemas
apps/api/src/modules/customer/customer.module.ts                                     2 imports, 4 providers, 1 export
apps/api/src/modules/customer/tests/integration/admin-support-context.ts             + one route builder
apps/api/src/modules/customer/tests/integration/admin-customer-merge-preview.integration.spec.ts
packages/database/src/index.ts                                                       + MergeEventStepKind type
packages/database/src/schema/customer/customer-merge-cases.ts                        comment correction only
packages/contracts/openapi/openapi.generated.json                                    regenerated
packages/api-client/src/generated/embroidery-api.ts                                  regenerated
packages/api-client/src/generated/embroidery-api.schemas.ts                          regenerated
docs/implementation/SCOPED_COMMAND_INDEX.md                                          §1.3 update, new §1.4, 2 ACTIVE_SCOPED rows
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md            roadmap
```

**File-size policy satisfied.** Largest new source file:
`customer-merge-transfer.service.ts` at **231** lines (limit 400); the execution
adapter is **211** and the execute use case **146**.
`admin-customer-merge.controller.ts` reached **397** with the fourth operation's
Swagger block, so the two projection functions moved to
`admin-customer-merge.projection.ts` — a split by responsibility (serializing a
view versus routing a request), not by line range; the controller is now **356**.
Largest test file: `admin-customer-merge-execution.integration.spec.ts` at
**384** (limit 600).

## Q. Baseline delta

| | Entry (B02 close) | Exit |
|---|---|---|
| Branch | `production` | `production` |
| Entry HEAD | `df1d0bc` | unchanged; B03 sits on top |
| Working tree | clean at entry | B03 changes only |
| Migrations | 37 | **37** |
| OpenAPI paths / operations / schemas | 105 / 114 / 230 | **106 / 115 / 232** |
| Worker changes | — | **none** |
| Provider / notification changes | — | **none** |
| Admin routes | 21 | **21** (no UI in B03) |
| Storefront routes | 12 | **12** |
| Figma rows | 495 | **495** (no design change) |
| Commit / push status | — | **not committed, not pushed** — the changes stand in the working tree on `production` for review |

## R. Follow-ups

Non-blocking, out of scope for B03.

| Id | Item | Disposition |
|---|---|---|
| `FU-APP10-B03-01` | `CMD-CHECK-APP4-B02` reports 74 failures (70 inherited at HEAD, 4 superseded by B03's merge execution). Recorded in `SCOPED_COMMAND_INDEX.md` §1.4 | APP4 / tooling maintenance. The gate is `APP4-B02`'s frozen acceptance evidence; repairing it for the post-APP4 world is a tooling slice, not a merge checkpoint |
| `FU-APP10-G01-04` | CST-098's append-only **trigger** for `customer_merge_events` is still not a database mechanism | **Still true.** B03 is the first checkpoint to write the table, and it relies on application shape: the repository has exactly one method, `append`, and no update, delete or read path exists. Inherited DB-phase debt; a trigger is a migration and therefore a database-change checkpoint |
| `FU-APP10-B02-01` | 3 pre-existing `@typescript-eslint/no-unnecessary-type-assertion` errors in `approve-design-version.use-case.ts` | unchanged; APP6 lint debt |
| `FU-APP10-B02-03` | The rejection reason is durable only in `audit_events.reason` | **unchanged, and deliberately not addressed.** No migration was added, per the PO's §22 direction. If `APP10-A02` needs it beside the case, `customer_merge_cases` needs a `decision_reason` column — a database-change decision |
| `FU-APP10-B01-01` | `CMD-CHECK-APP4-B07-CONTRACT` repair for the APP10 world (7 failures) | unchanged; APP4 / tooling maintenance |
| `FU-APP10-B03-02` | A merged loser's `secure_access_grants` rows keep `customer_id = loser`, so a support read of the *survivor* does not list links the merged identity once held | Correct by DB3 §4 step 4 (revoke, never repoint) and not a defect. If `APP10-A01`/`A02` want to show a merged identity's link history under the survivor, that is a read that follows the tombstone pointer — a UI/query decision, not a merge one |

## S. Roadmap

`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` §11
updated:

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge case lifecycle & consequence preview | `COMPLETE` |
| `APP10-B03` | Merge execution & immutable event history | `COMPLETE` |
| `APP10-D01` | APP10 design package | `NEXT` |
| `APP10-A01` | Admin customer profile maintenance UI | `INCOMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `INCOMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `INCOMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `INCOMPLETE` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
APP10-D01 = NEXT
```
