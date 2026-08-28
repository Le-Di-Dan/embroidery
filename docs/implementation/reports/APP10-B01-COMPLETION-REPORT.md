# APP10-B01 — Completion Report

**Checkpoint:** `APP10-B01` — Customer Profile & Contact Maintenance
**Phase:** APP10 — Customer Operations and Communication
**Date:** 2026-08-28 · **Mode:** IMPLEMENTATION

## A. Verdict

```text
APP10-B01            = COMPLETE
PO_DECISION_REQUIRED = NONE
NEW_HTTP_OPERATIONS  = 3   (exactly the three APP10-G01 §E.1 fixed)
MIGRATIONS_ADDED     = 0   (APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED, honoured)
FULL_MONOREPO_TEST   = NOT_RUN
FULL_E2E             = NOT_RUN
NEXT_CHECKPOINT      = APP10-B02
NOT_PUSHED           = true
```

No customer list, no search, no contact-create operation, no fourth route, no
`verified_at` write, no contact value overwritten, no migration.

## B. Implemented capability

Three Admin mutations, and nothing else.

```text
PATCH /api/admin/customers/{customerId}                                  adminCustomer_update
POST  /api/admin/customers/{customerId}/contacts/{contactId}/primary     adminCustomerContact_promote
POST  /api/admin/customers/{customerId}/contacts/{contactId}/deactivate  adminCustomerContact_deactivate
```

**1 · `adminCustomer_update`.** A bounded partial update of two profile fields,
`customers.display_name` and `customers.notes`. Omitted leaves a field
unchanged; `null` or a blank string clears it to NULL; any other text is stored
— the contract `APP2-B02-C1` §9 already fixed for a product description, reused
rather than reinvented. A patch whose supplied values already match the stored
ones writes nothing and appends no audit event. `204 No Content`.

**2 · `adminCustomerContact_promote`.** Moves the primary designation to a
contact that already belongs to the customer, is active and is **already
verified**. One transaction: the previous primary is cleared and the target set,
arbitrated by CST-006's partial unique. Promoting the contact that is already
primary is an idempotent success — no write, no audit row. `204`.

**3 · `adminCustomerContact_deactivate`.** Sets `deactivated_at` on an owned
contact. Soft and never destructive: the row stays, and its value,
`verified_at` and `verified_source` are untouched. Refuses the primary contact
and the customer's last active verified contact, and promotes nothing as a side
effect. Re-deactivating an already-retired contact is an idempotent success with
no write and no audit row. `204`.

All three refuse a customer carrying `merged_into_customer_id` with `409`, and
none redirects the write to the survivor.

## C. Contract changes

### C.1 Paths and operation ids

| Method | Path | Operation id | Success |
|---|---|---|---|
| `PATCH` | `/api/admin/customers/{customerId}` | `adminCustomer_update` | 204 |
| `POST` | `/api/admin/customers/{customerId}/contacts/{contactId}/primary` | `adminCustomerContact_promote` | 204 |
| `POST` | `/api/admin/customers/{customerId}/contacts/{contactId}/deactivate` | `adminCustomerContact_deactivate` | 204 |

The three ids are **derived**, not declared: `createOperationId` turns
`AdminCustomerController#update` and `AdminCustomerContactController#promote` /
`#deactivate` into exactly the names `APP10-G01` §E.1 predicted, so no
`CONTROLLER_DOMAIN_KEYS` entry is owed. That is why B01 ships two new controller
classes rather than three more methods on `AdminCustomerSupportController` — the
other reason is §E.3 below.

### C.2 Request schema — one new component

`UpdateCustomerProfileBody` (`.strict()`, at least one field required):

| Field | Type | Semantics |
|---|---|---|
| `displayName` | `string(≤200)`, nullable, optional | absent → unchanged; null/blank → NULL; else stored |
| `notes` | `string(≤2000)`, nullable, optional | same |

`.strict()` is load-bearing rather than tidy: a body naming `verifiedAt`,
`mergedIntoCustomerId`, `anonymizedAt` or any contact field is a **400**, not a
silently dropped key. Both length caps are denial-of-service bounds on `text`
columns that have no database cap, following `REVOKE_REASON_MAX_LENGTH`.

The two contact operations publish **no request body** and take no query
parameter; both ids are UUID path parameters, rejected before any repository
call.

### C.3 Customer-detail projection — two added members, and only two

`GET /api/admin/customers/{customerId}` (`adminCustomerSupport_detail`,
delivered by APP4-B07) now publishes:

```text
AdminCustomerContactResponse  [contactId, kind, maskedValue, primary, verified]   (+contactId)
AdminCustomerDetailResponse   [contacts, customerId, displayName, notes, verifiedAt]  (+notes)
```

- **`contactId`** — the minimum publication change §7 requires. B07 deliberately
  published no id because it had no per-contact operation; B01 delivers two, so
  the id now addresses something real. It is the server-generated
  `customer_contact_points.id`: opaque, not derived from the contact value, and
  useless against a customer whose detail read did not already publish it.
- **`notes`** — added under §7's conditional. It was **absent** before (checked:
  neither the response class, the view type nor the domain `Customer` carried
  it), and without it `APP10-A01` could not render the field B01 makes writable.
  Omitted rather than null when no operator has written one.

Masking is unchanged and still total: `maskedValue` remains the only
representation of a contact anywhere in the response, produced by APP4-P01's
`maskContact` in the one projection function that has nowhere to put a raw
value.

### C.4 Measured OpenAPI counts

| Artifact | Before | After | Δ |
|---|--:|--:|--:|
| Paths | 100 | 102 | +2 |
| Operations | 108 | 111 | +3 |
| Schemas | 222 | 223 | +1 |

Regenerated through the established path only:
`pnpm --filter @embroidery/api openapi:generate` (`CMD-OPENAPI-GENERATE`) and
`pnpm --filter @embroidery/api-client generate` (`CMD-API-CLIENT-GENERATE`).
`openapi:check` reports the committed artifact up to date. No generated file was
hand-edited and no unrelated OpenAPI content was reformatted.

`APP10-G01` predicted 115 operations at phase end (108 + 7). B01 spends 3 of
those 7; the remaining 4 belong to B02 (3) and B03 (1).

## D. Domain and persistence behaviour

### D.1 Writable surface

`customers.display_name` and `customers.notes`. That bound is structural, not a
checked list: `MaintainCustomerProfileCommand` declares two members,
`UpdateCustomerProfileInput` declares the same two, and the Drizzle `set` object
is assembled member by member from them. There is no spread of a caller-supplied
object anywhere on the path, so no column outside those two is reachable even by
a caller that invents a key.

Never written by B01: `verified_at` (NOT NULL and immutable, ADR-DB2-001 option
A), `merged_into_customer_id` (B03's), `anonymized_at` (retention's), every
contact value, `verified_source`, `is_primary` except through the promotion
rotation, and `deactivated_at` except through deactivation.

### D.2 Merged-customer guard

`requireMaintainableCustomer` refuses `undefined` with 404 and a row carrying
`merged_into_customer_id` with 409, before any write, on all three operations.
The write is not redirected to the survivor — an operator must not believe they
edited the customer they addressed.

### D.3 Promotion rules

Owned → active → verified, in that order after the already-primary short-circuit.
Contacts are loaded by **customer** (`listContactPoints`), never by contact id:
`findContactPoint` would return any customer's row and make the ownership test a
comparison performed on a foreign record already read. Rotation delegates to the
delivered `CustomerRepository.setPrimaryContact`, which clears then sets inside
one transaction under CST-006 — B01 added no second rotation path.

### D.4 Deactivation rules

Refused for: a contact of another customer (404, see §E.4), a merged customer
(409), the current primary (409), and the last active verified contact (409).
The primary refusal exists because CST-006 is partial on `is_primary` alone — a
deactivated primary would still occupy the single primary slot while being
unreachable. The last-verified refusal exists because a customer exists *because*
a verified contact was proven. Neither is resolved by promoting a replacement
silently.

The repository UPDATE carries the same two conditions as its own predicate
(`deactivated_at IS NULL AND is_primary = false`), so the application rule has a
physical second stop.

### D.5 Idempotent no-ops

Three, all silent — no row written, no audit event appended, `updated_at`
unmoved:

| Operation | No-op condition |
|---|---|
| `adminCustomer_update` | every supplied field already holds the supplied value (clearing an already-NULL column counts) |
| `adminCustomerContact_promote` | the target is already primary |
| `adminCustomerContact_deactivate` | the target is already deactivated |

`audit_events` is append-only and outlives its subject (G-DB7-46); a row saying
an operator changed something they did not is a false record with no correction
path, and a screen that saves on blur would produce one per visit.

### D.6 No migration

`packages/database/migrations` holds **37** `.sql` files before and after. Every
column B01 writes was delivered: `customers.display_name`, `customers.notes`,
`customer_contact_points.is_primary`, `customer_contact_points.deactivated_at`,
with CST-005 and CST-006 as the arbiters. `APP10-G01`'s
`NO_MIGRATION_REQUIRED` disposition was correct — no schema discrepancy was
found.

## E. Privacy and authorization proof

### E.1 Guards

| Operation | Guards |
|---|---|
| `adminCustomer_update` | `AuthenticatedAdminGuard`, `StaffOriginGuard`, `StaffJsonBodyGuard` |
| `adminCustomerContact_promote` | `AuthenticatedAdminGuard`, `StaffOriginGuard` |
| `adminCustomerContact_deactivate` | `AuthenticatedAdminGuard`, `StaffOriginGuard` |

The exact APP1 guards, reused. No new guard, no role or permission vocabulary,
no session parsing in a controller, no caller-supplied Admin id. RBAC was not
introduced: APP1-B01 is a binary authenticated-admin gate.

`StaffJsonBodyGuard` is deliberately **absent** from the two bodyless routes.
It requires `application/json` and exists to stop a cross-site HTML form post
reaching a route that reads a body; these two read no body, so applying it would
only oblige every client to state a content type for a request with no content —
and, as the run in §G.1 proved, would answer 415 to every legitimate call. This
is the shape `adminOrder_dispatch` (`APP9-B05`) already uses for a bodyless Admin
transition, and the reason APP1 applies the JSON guard to login but not logout.
CSRF layering is unchanged: `SameSite=Strict` session cookie plus the origin
allowlist.

### E.2 Masking

Unchanged and reused, never re-implemented. The single projection
(`toContactView` → `toDetailPayload`) calls APP4-P01's `maskContact`, and its
return type has nowhere to put a normalized or display value. The three
mutations publish **no customer at all** — they answer 204 — so there is no
second place a contact could be rendered and no second copy of the masking rule.

### E.3 No raw contact value can be published

| Channel | Proof |
|---|---|
| Responses | all three answer 204 with no body; the one customer projection is B07's, and is masked-only |
| Errors | every message in `customer-maintenance.errors.ts` is a fixed server-authored string; none interpolates an id, value, mask, name or note |
| Audit | summaries carry field **names**, a contact point id and a contact **kind**; §F |
| URLs / query strings | both ids are UUIDs; no contact value is accepted in a path, query or header by any B01 operation |
| Logs | B01 adds no log statement; the platform's request log carries method, route template, status and duration |

Asserted directly: the B01 suites search the whole serialized body of a success
and of a refusal for the fixture email, the fixture phone, the mask, and the
strings `normalizedValue` / `displayValue`.

### E.4 Foreign-contact non-enumeration

A `contactId` naming another customer's row and one naming nothing at all
produce the **same** status, code and message. The mechanism is structural: the
use case lists the addressed customer's own contacts and looks the id up in that
list, so a foreign row is never loaded and then reasoned about — there is no
branch that has seen it and decided what to say. The suite asserts the two
refusals are equal on status, code, message and `success` (the envelope's
`requestId` and `timestamp` differ between any two requests by construction), and
that the foreign customer's id, contact id and contact values appear nowhere in
the body.

## F. Audit behaviour

Three new actions on the existing mechanism (`AuditEventRepository.append`,
`AuditClock`, `RequestContextService`). No second audit subsystem, no new
`target_kind` — `CUSTOMER` was already in the closed set.

| Action | Emitted when | Summary |
|---|---|---|
| `customer.profile_updated` | a field actually changed | `{ changedFields: ['displayName' \| 'notes', …] }` |
| `customer.primary_contact_changed` | the designation actually moved | `{ contactPointId, contactKind, previousPrimaryContactPointId? }` |
| `customer.contact_deactivated` | a contact was actually retired | `{ contactPointId, contactKind }` |

- **Actor** — `{ kind: 'ADMIN', adminId }`, resolved from the bound request
  context, never from a body or header. A non-ADMIN actor is a hard stop, not a
  coercion: the coercion is what would file a staff edit against the customer.
  Asserted against the seeded `admin_accounts` id.
- **Target** — the customer on all three, so "what was done to this customer"
  finds every row under one target. A contact point has no `target_kind` of its
  own.
- **Committed with the change** — each recorder call is inside the same
  transaction as the write it describes.
- **No raw PII.** No normalized value, no display value, no mask (a mask is
  still derived from a real address), no `verified_source`, no secret, no token.
  And no before/after snapshot of `display_name` or `notes` — `notes` is free
  text an operator types, so it can hold a customer's address written out in
  full, and copying it into an append-only table with no anonymization path of
  its own is a leak with a longer life than the record it came from. *That a
  field changed* answers the operational question.
- **No duplicate on replay.** The three idempotent no-ops append nothing;
  asserted by row count in both suites.

## G. Tests executed

Change-impact only. Every command below is justified by a file this checkpoint
actually changed.

### G.1 New — the B01 capability

| # | Command | Why change-impact relevant | Result |
|--:|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath src/modules/customer/tests/integration/admin-customer-profile.integration.spec.ts` (`CMD-TEST-APP10-B01-PROFILE`) | the new PATCH operation, the profile use case, the bounded repository write and the detail projection | **26 passed / 0 failed** |
| 2 | `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath src/modules/customer/tests/integration/admin-customer-contact-maintenance.integration.spec.ts` (`CMD-TEST-APP10-B01-CONTACT`) | the two new POST operations, the contact use case, the maintenance policy and both repository writes | **20 passed / 0 failed** |

Both boot the **real** HTTP application with the **real**
`AuthenticatedAdminGuard` against a disposable PostgreSQL and a real
`admin_sessions` row — no guard is overridden anywhere, following
`admin-support-context.ts`'s reasoning that a stubbed guard proves only that the
handler runs once something lets it.

Coverage against §13.1, item by item:

*Profile update* — authenticated mutation succeeds and stores both fields ·
only the allowed fields mutate (`verified_at`, `merged_into_customer_id`,
`anonymized_at` and every contact row asserted unchanged) · an omitted field is
left alone · `null` and a blank string clear · invalid bodies rejected (empty
patch, unknown field, non-string value, over-long name, over-long note) · a body
naming `verifiedAt` / `mergedIntoCustomerId` / `anonymizedAt` / a contact value /
a contact verification flag is **rejected**, not ignored · merged customer
refused 409 with the loser untouched *and* the survivor untouched · unknown 404 ·
malformed id 400 · a value-identical patch leaves the row byte-identical
(`updated_at` included) and appends no audit row · audit emitted exactly once
per real change, with the ADMIN actor and the changed-field names.

*Primary promotion* — a verified, active, owned contact becomes primary · the
previous primary is cleared in the same transaction and exactly one primary
remains · already-primary replay is idempotent and audit-silent · unverified
refused 409 **with no verification evidence minted** · deactivated refused ·
merged customer refused · foreign and missing contact answer identically ·
CST-006 remains satisfied · no contact value, `verified_at`, `verified_source`
or `deactivated_at` rewritten on any contact · no contact duplicated.

*Deactivation* — an eligible contact is retired softly, row and evidence intact ·
primary refused · last active verified contact refused (on a fixture whose one
verified contact is deliberately *not* the primary, so the primary rule cannot
be what refuses it) · already-deactivated replay is idempotent and does not move
the recorded instant · nothing promoted as a side effect · foreign/missing
identical · audit emitted once.

*Projection* — `contactId` present for every published contact and equal to the
seeded ids · a deactivated contact's id is not published · `notes` published
when set and omitted when not · the contact object has exactly the five
authorized keys · no raw, normalized or display value anywhere in the body.

*Guards* — unauthenticated 401 on all three · a foreign `Origin` 403 on all
three · a non-JSON body 415 on the PATCH · every refusal asserted to have
written nothing.

**One defect was found and fixed by these tests before completion.** The two
bodyless routes initially carried `StaffJsonBodyGuard`, which answered 415 to
every call because a POST with no body states no content type (16 failures). The
guard was removed from those two routes for the reason recorded in §E.1; the
PATCH keeps it.

### G.2 Delivered suites the change touches

| # | Command | Why change-impact relevant | Result |
|--:|---|---|---|
| 3 | `pnpm --filter @embroidery/api exec jest --config jest.config.mjs --runInBand --runTestsByPath src/modules/customer/tests/integration/admin-customer-support.integration.spec.ts …grants… …revoke… …resolve…` (`CMD-TEST-APP4-B07-SUPPORT`, plus the resolve suite) | the detail projection they assert on changed | **48 passed / 0 failed** (after the one edit below) |
| 4 | `pnpm --filter @embroidery/admin exec jest --runTestsByPath test/components/customer-access-{grant,lookup,notification,security}.test.tsx` (`CMD-TEST-APP10-B01-ADMIN-FIXTURE`) | `customer-access-fixture.ts` had to gain `contactId`, now required by the generated type | **50 passed / 0 failed** |

`admin-customer-support.integration.spec.ts` asserts the contact projection's
keys exhaustively. That list was extended by `contactId` — the authorized
addition — with a comment recording the authority, exactly as the file already
does for `displayName`. Its purpose is unchanged: an unauthorized field arriving
beside it still fails. The customer-level key list was **not** changed, because
`notes` is omitted for a customer that has none; a comment records why, and the
B01 suite asserts its presence.

### G.3 Contract and type gates

| # | Command | Why | Result |
|--:|---|---|---|
| 5 | `pnpm --filter @embroidery/api openapi:generate` (`CMD-OPENAPI-GENERATE`) | 3 new operations | 102 paths / 111 operations / 223 schemas |
| 6 | `pnpm --filter @embroidery/api-client generate` (`CMD-API-CLIENT-GENERATE`) | after the OpenAPI change | 2 files, 8 418 lines |
| 7 | `pnpm --filter @embroidery/api openapi:check` (`CMD-OPENAPI-CHECK`) | committed-artifact drift | **up to date** |
| 8 | `pnpm --filter @embroidery/api typecheck` | new source and tests | **pass** |
| 9 | `pnpm --filter @embroidery/api-client typecheck` | regenerated client | **pass** |
| 10 | `pnpm --filter @embroidery/admin typecheck` | consumes the changed contact type | **pass** (after the fixture edit) |
| 11 | `pnpm --filter @embroidery/storefront typecheck` | shares the generated client | **pass** |

### G.4 Explicitly not run

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E           = NOT_RUN
```

Also not run, deliberately: all API tests, all Admin tests, `APP10-E01`, every
lifecycle/checker script not named above, DB-wide regression, and the
notification, payment, inventory and unrelated APP4 suites. No already-passing
focused suite was re-run after a documentation-only edit.

## H. Quality validation

| Mechanism | Command | Result |
|---|---|---|
| Prettier | `pnpm exec prettier --write <the 20 changed .ts files>` then `--check` on the fixture and the two generated artifacts | **all files conform** (one file reformatted: `admin-customer.controller.ts`, import wrapping) |
| ESLint | `pnpm --filter @embroidery/api exec eslint <the 20 B01-touched paths>` | **0 problems** |
| ESLint (workspace) | `pnpm --filter @embroidery/api lint` | **3 errors, all pre-existing** — see below |
| SonarQube | not run | repository-global control, not run per checkpoint; the established treatment in this phase series |

**The three ESLint errors are inherited, not B01's.** They are
`@typescript-eslint/no-unnecessary-type-assertion` at lines 194, 241 and 285 of
`apps/api/src/modules/design/application/deciding/approve-design-version.use-case.ts`,
an APP6 file this checkpoint does not touch. Verified directly rather than
assumed: the working tree was stashed (`git stash push -u`) and the identical
three errors were produced on the **pristine** tree, then the stash was popped.
They are branded-id assertions on grant and request ids with no relation to any
B01 type. Fixing them would be unrelated cleanup, which §11 forbids; recorded as
`FU-APP10-B01-02`.

### H.1 `CMD-CHECK-APP4-B07-CONTRACT` — superseded in part, not repaired

`node tools/check-app4-b07-contract.mjs` reports **6 failures**. Two are frozen
counts that were **already red at HEAD** (111 vs an expected 53 operations — 108
before B01; 37 vs an expected 34 migrations, and B01 adds none), exactly the
condition `SCOPED_COMMAND_INDEX.md` §1.1 describes for the APP3 gates. Four are
rules `APP10-B01` supersedes under locked PO decisions:

```text
✗ /api/admin/customers/{customerId} publishes [get, patch]      — B01 §3
✗ the surface also declares the two .../contacts/... paths      — B01 §3
✗ AdminCustomerContactResponse publishes [contactId, …]         — B01 §7
✗ AdminCustomerDetailResponse publishes [… notes …]             — B01 §7
```

The gate file was **not edited**: it is APP4-B07's acceptance evidence, and
rewriting it so a later world passes is the change that destroys the record it
exists to carry. Instead the row is reclassified `ACTIVE_SCOPED` →
`HISTORICAL_SCOPED` with a new `SCOPED_COMMAND_INDEX.md` §1.2 stating exactly
which four rules are superseded and by what authority — the same disposition
`APP5-X01` applied to 44 APP3 gates.

**Everything else that gate asserts still passes, by construction.** B01's three
operations live in new classes and new application files precisely so the ten
source files the gate reads keep satisfying its source rules: no rule about
those files failed. `AdminCustomerSupportController` still declares no `@Patch`,
`@Put` or `@Delete` and exactly one `@Post('resolve')`; no B07 source file calls
`setPrimaryContact`, `addContactPoint`, `markContactVerified`, `anonymize` or
any other customer write; the `contactPointId` name is still absent from the
published contract (B01's field is `contactId`); and no customer list, search or
lookup parameter exists.

## I. Files changed

**New — runtime (7)**

```text
apps/api/src/modules/customer/domain/maintenance/customer-maintenance.errors.ts
apps/api/src/modules/customer/domain/maintenance/customer-maintenance.policy.ts
apps/api/src/modules/customer/application/customer-maintenance-audit.recorder.ts
apps/api/src/modules/customer/application/maintain-customer-profile.use-case.ts
apps/api/src/modules/customer/application/maintain-customer-contact.use-case.ts
apps/api/src/modules/customer/presentation/admin-customer.controller.ts
apps/api/src/modules/customer/presentation/admin-customer-contact.controller.ts
apps/api/src/modules/customer/presentation/schemas/admin-customer-maintenance.request.ts
```

**New — tests (3)**

```text
apps/api/src/modules/customer/tests/integration/admin-customer-profile.integration.spec.ts
apps/api/src/modules/customer/tests/integration/admin-customer-contact-maintenance.integration.spec.ts
apps/api/src/modules/customer/tests/integration/customer-maintenance-queries.ts
```

**Modified — runtime (7)**

```text
apps/api/src/modules/customer/domain/repositories/customer.repository.ts        (+notes, +2 methods)
apps/api/src/modules/customer/infrastructure/persistence/customer-row.mapper.ts (+notes)
apps/api/src/modules/customer/infrastructure/persistence/drizzle-customer.repository.ts (+2 methods)
apps/api/src/modules/customer/application/admin-customer-support.query.ts       (+contactPointId, +notes)
apps/api/src/modules/customer/presentation/admin-customer-support.controller.ts (projection +2 members)
apps/api/src/modules/customer/presentation/schemas/admin-customer-support.response.ts (+contactId, +notes)
apps/api/src/modules/customer/customer.module.ts                                (3 providers, 2 exports)
apps/api/src/modules/customer/customer-admin-support.module.ts                  (2 controllers)
```

**Modified — tests (3)**

```text
apps/api/src/modules/customer/tests/integration/admin-support-context.ts        (3 route helpers)
apps/api/src/modules/customer/tests/integration/admin-customer-support.integration.spec.ts (key list)
apps/admin/test/support/customer-access-fixture.ts                              (contactId)
```

**Regenerated (3)** — never hand-edited

```text
packages/contracts/openapi/openapi.generated.json
packages/api-client/src/generated/embroidery-api.ts
packages/api-client/src/generated/embroidery-api.schemas.ts
```

**Documentation (2)**

```text
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md  (§11 status)
docs/implementation/SCOPED_COMMAND_INDEX.md                                (§1.2, 3 new rows, 1 reclassification)
```

No new module, no new package, no migration, no worker change, no Storefront
change, no Figma change, no root script.

### I.1 File sizes

Largest runtime source touched: `drizzle-customer.repository.ts` at **347**
lines (hard limit 400). It crosses the 300-line review threshold; it is one
aggregate's persistence adapter and DB7 §10.1 keeps contact points and the
business profile written through it, so splitting would divide one aggregate's
writes across files rather than by responsibility. Largest test: **348** lines
(hard limit 600). Every other new file is under 200.

## J. Baseline delta

```text
ENTRY_HEAD        644b204  docs(app9): close the remaining payment and fulfillment phase (APP9-X01)
BRANCH            production
WORKING_TREE      dirty — 16 modified, 11 untracked (the B01 change plus the
                  APP10-G01 report, which was untracked at entry)
LOCAL_COMMIT      none — this repository's convention is that the human commits
                  reviewed checkpoint work; nothing was committed here
PUSHED            no
MIGRATIONS        37 → 37   (+0)
OPENAPI PATHS     100 → 102 (+2)
OPENAPI OPERATIONS 108 → 111 (+3)
OPENAPI SCHEMAS   222 → 223 (+1)
ADMIN ROUTES      21 → 21   (+0 — B01 is backend only)
STOREFRONT ROUTES 12 → 12   (+0)
FIGMA REGISTRY    495 → 495 (+0 — no design or frontend UI checkpoint)
```

## K. Follow-ups

Nonblocking, and none of them is a B01 acceptance failure.

| ID | Item | Disposition |
|---|---|---|
| `FU-APP10-B01-01` | `tools/check-app4-b07-contract.mjs` (and its 47-case test suite) still describe the pre-APP10 world; four of its rules are superseded by B01 and two counts were already frozen. | Recorded in `SCOPED_COMMAND_INDEX.md` §1.2 and reclassified `HISTORICAL_SCOPED`. Repair is APP4 / tooling maintenance, not APP10's; doing it here would mean editing a delivered checkpoint's acceptance evidence. |
| `FU-APP10-B01-02` | 3 pre-existing `@typescript-eslint/no-unnecessary-type-assertion` errors in `approve-design-version.use-case.ts` (APP6). | Verified present on a pristine tree. Belongs to a design/hardening checkpoint; §11 forbids unrelated cleanup here. |
| `FU-APP10-B01-03` | `AdminCustomerSummaryPort` (APP5-B04's masked projection) publishes no `contactId`. | Out of scope: it feeds the Admin custom-request surface, which has no contact operation. Revisit only if a screen there needs to address a contact. |
| `FU-APP10-B01-04` | `notes` is now readable by any authenticated Admin and is free text an operator types, so it can accumulate PII with no anonymization path of its own beyond `anonymize()`, which already clears it. | Recorded, not scheduled. `CustomerRepository.anonymize` sets `notes = NULL`, so the retention mechanism already covers it; no gap found. |

## L. Roadmap status

`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` §11
updated:

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge case lifecycle & consequence preview | **`NEXT`** |
| `APP10-B03` | Merge execution & immutable event history | `INCOMPLETE` |
| `APP10-D01` | APP10 design package | `INCOMPLETE` |
| `APP10-A01` | Admin customer profile maintenance UI | `INCOMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `INCOMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `INCOMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `INCOMPLETE` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
APP10-B02 = NEXT
```

No removed candidate checkpoint was restored, and the retired
`APP10-B03 — Agreement backend` label was not used.
