# APP4-B02 — Customer/contact application core — completion report

## A. Verdict

```text
PASS
```

`CustomerModule` is composed into the API `AppModule`, the verified-identity
resolution rule of `ADR-DB2-001` r5 exists exactly once, CST-005 and CST-006
remain the database arbiters, a lost verification race produces a bounded
outcome with no orphan customer and no PostgreSQL detail, and every actual
identity link writes an audit event carrying no contact value.

No stop condition was reached. No merge, no migration, no endpoint.

## B. Entry state

- `APP4-P00 = PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`
- `APP4-G01 = PASS`, `APP4-D01 = PASS`
- `APP4-P01 = PASS_AFTER_C1`
- `APP4-B01 = PASS_AFTER_C1` (`APP4-B01-C1` closed; policy publication closed)
- `APP4-W01 = PASS`
- `NotificationModule` and `PolicyModule` were already composed and still are —
  the checker asserts both by name, in the imports array, exactly once.
- `NO_APP4_MIGRATION` holds: 34 migrations before and after.

## C. Repository/authority reuse audit

Everything below was read in the working tree before any code was written.

| Question | Answer, as found in source |
|---|---|
| `CustomerRepository` methods available | `createWithVerifiedContact`, `addContactPoint`, `markContactVerified`, `setPrimaryContact`, `upsertBusinessProfile`, `anonymize`, `findById`, `findByVerifiedContact`, `listContactPoints`, `findContactPoint`. |
| Verified-active lookup semantics | `findByVerifiedContact(kind, normalizedValue)` filters `verified_at IS NOT NULL AND deactivated_at IS NULL` — **exactly** the CST-005 index predicate, so it uses that index and can match at most one row. |
| Create / attach / verify / primary | `createWithVerifiedContact` writes both tables in one transaction and sets `is_primary = true` itself. `addContactPoint` inserts **unverified and non-primary**. `markContactVerified` verifies an active contact. `setPrimaryContact` rotates the primary — **not called by B02**. |
| Transaction owner | `TransactionManager.runInTransaction` (`@embroidery/persistence`). A nested call **joins** the enclosing transaction by default, which is what lets `APP4-B04` wrap this service without a second boundary. |
| CST-005 physical name | `uq_customer_contact_points__kind_value__verified` (IDX-004), partial on `verified_at is not null and deactivated_at is null`. |
| CST-006 physical name | `uq_customer_contact_points__customer__primary` (IDX-005), partial on `is_primary`. |
| Existing conflict pattern | `CONSTRAINT_MEANINGS` in `packages/database/src/errors/constraint-catalog.ts` already maps both by name: CST-005 → `CONFLICT` / `CONTACT_ALREADY_VERIFIED`, CST-006 → `CONFLICT` / `PRIMARY_CONTACT_ALREADY_SET`. `withMappedErrors` applies it in every repository method, and `PersistenceError` keeps the SQLSTATE and constraint on a **non-enumerable** `diagnostics` property. |
| Audit writer API | `AuditEventRepository.append({ occurredAt, actor, action, targetKind, targetId, summary?, reason?, correlationId })`, joining the caller's transaction. Actor is `ADMIN` / `CUSTOMER` / `SYSTEM`; CST-072 requires the matching reference column, and `fk_audit_events__customer_id` is a real FK. |
| Required actor/correlation fields | `RequestContextService.requireRequestId()` for `correlation_id`; `AuditClock.now()` for `occurred_at`. Precedent: `DesignTemplateAuditRecorder`. |
| Repository extension required? | **No.** Nothing was added to the port or the adapter. |

### Why no repository extension

Two candidates looked necessary and were not:

1. **A lookup returning the contact point, not just the customer.**
   `findByVerifiedContact` returns only the `Customer`, and the result contract
   names the contact point. Resolved with `listContactPoints(customerId)` — a
   read already on the port, scoped to one customer through IDX-134 — rather
   than a new arbitrary contact lookup, which is the shape `APP4-B07` owns.
2. **A combined "add and verify" method.** `addContactPoint` +
   `markContactVerified` inside one transaction already produces exactly the
   required order, and that order is load-bearing: the row is not subject to
   CST-005 until it is verified.

## D. Application contract

`apps/api/src/modules/customer/application/resolve-or-create-verified-customer.service.ts`

```ts
resolve(evidence: VerifiedContactEvidence): Promise<VerifiedIdentityResolution>
attachVerifiedContact({ customerId, evidence }): Promise<VerifiedContactAttachment>
```

The input type is the whole enforcement mechanism:

```ts
interface VerifiedContactEvidence {
  readonly contact: NormalizedContact;   // APP4-P01 — cannot be built by hand
  readonly verifiedAt: Date;
  readonly verifiedSource: string;       // bounded evidence reference
}
```

`NormalizedContact` is obtainable only from the P01 normalizers, so a caller
holding a raw string cannot reach this service at all — r5's "raw string matches
on unverified contacts never link identities" expressed as a type rather than as
a runtime check. `verifiedSource` is validated against `^[A-Z][A-Z0-9_]{0,31}$`:
it is the one caller-supplied field, it lands in a PII-bearing table, and an
evidence *reference* is what COL-TBL005-07 asks for.

Deliberately absent: no code, hash, token or secret (B02 verifies nothing — it is
told verification succeeded); no `correlationId` (the recorder reads the request
context, so a caller cannot file a mutation under a correlation that never
happened); no `displayName` (nothing in the identity rule needs one, and
accepting free text from an anonymous submission into a PII column has no
requirement behind it).

Outcomes are a closed set: `RESOLVED` / `CREATED`, `ALREADY_OWNED` / `ATTACHED`,
and five refusals — `CONCURRENT_VERIFICATION_LOSS`,
`CONTACT_OWNED_BY_ANOTHER_CUSTOMER`, `CONTACT_OWNED_BY_MERGED_CUSTOMER`,
`CUSTOMER_NOT_FOUND`, `VERIFIED_SOURCE_NOT_ALLOWED`. The error's message **is**
its failure code, and it carries no cause.

## E. Resolution behavior

```text
resolve(evidence)
  → bounded verifiedSource check (before any read)
  → join / open the transaction
  → findByVerifiedContact(kind, normalized)          ← the CST-005 predicate
      found     → refuse if the owner is a merge tombstone
                → RESOLVED (no write, no audit)      ← Case A
      not found → createWithVerifiedContact(...)     ← Case B, both tables
                → audit customer.identity_created
                → CREATED
  → CST-005 23505 anywhere above ⇒ CONCURRENT_VERIFICATION_LOSS
```

**Case A** writes nothing: no second customer, no duplicate contact, no
re-verification of a link already verified — and therefore no audit row, because
r5 audits the *link* and no link was made.

**Case B** creates the customer and its first verified contact through the one
repository method that writes both, so a customer without its identity contact is
not representable.

**Additional contact** (`ADR-DB2-001` r7 — supported, so not
`NOT_APPLICABLE_BY_AUTHORITY`): if the identity already belongs to this customer
the call is idempotent and writes nothing; if it belongs to a **different**
customer it is refused, never reassigned and never merged; otherwise the contact
is added unverified/non-primary and then verified, and the attachment is audited.

**Merge tombstones** are refused rather than followed. The ADR says the pointer is
followed forward, but *how far*, and what happens to the loser's contacts, are
merge mechanics it defers to G10 — which is not implemented. Following it here
would be inventing merge inside a checkpoint forbidden to have any. No delivered
code can produce this state today; the guard exists so that when merge arrives an
unmigrated contact fails loudly instead of quietly attaching new submissions to a
dead identity.

## F. Primary-contact invariant

CST-006 remains the arbiter and B02 never calls `setPrimaryContact`.

- The first verified contact is primary because `createWithVerifiedContact` sets
  `is_primary: true` itself.
- A later contact is inserted `is_primary: false` by `addContactPoint`, so the
  partial unique index still sees exactly one.
- No rotation: no locked authority asks for one, and inventing a rule about which
  channel becomes primary would be a product decision made in an implementation
  checkpoint.

Proven by querying the index's own predicate (`is_primary = true`) after each
mutation, not by trusting the return value.

## G. Concurrency evidence

Two `resolve` calls for the same identity run concurrently on separate pooled
connections. Each issues its lookup before either issues its insert; PostgreSQL
then blocks the second inserter on the unique index until the first commits, and
only then reports `23505`. Nothing sleeps and nothing patches the service.

Observed:

| Claim | Evidence |
|---|---|
| One winner | exactly one fulfilled result, `outcome = CREATED`. |
| One owner | exactly one row matching the CST-005 predicate, and it belongs to the winner. |
| No orphan | `customers` count is 1; the loser's transaction rolled back whole. |
| Bounded loss | the rejection is a `VerifiedIdentityConflictError` with `failure = CONCURRENT_VERIFICATION_LOSS`. |
| No leakage | the serialized error (message, stack, JSON) contains none of the contact value, `23505`, `uq_customer_contact_points`, `customer_contact_points`, `DETAIL` or `Key (`; `cause` is `undefined`. |
| No merge | no tombstone written, no contact reassigned. |
| Recoverable | a retry after the loss returns `RESOLVED` for the winner's customer, which is what `APP4-B04` will do with the outcome. |

**Unrelated `23505`s are not swallowed.** The guard matches the catalogued
`CONTACT_ALREADY_VERIFIED` code, never the SQLSTATE and never `kind ===
'CONFLICT'` alone — CST-006 and the primary key are both `23505`. Proven at the
unit tier with a stub repository, because neither state is reachable through a
real database from inside this service (it picks fresh ids and never sets a
second primary): CST-006's `PRIMARY_CONTACT_ALREADY_SET`, an uncatalogued
`DUPLICATE_RESOURCE`, a check violation, an unresolved reference and a plain
`Error` all travel out **by identity** (`expect(failure).toBe(original)`).

## H. Audit evidence

Two actions, both new — `DB3_AUDIT_SPECIFICATION.md` names no customer identity
actions, so they are introduced here in the delivered lowercase dot-namespaced
convention and stay distinct:

- `customer.identity_created` — a customer came into existence;
- `customer.contact_attached` — a further channel joined an existing one.

| Field | Value | Why |
|---|---|---|
| `actor_kind` | `CUSTOMER` | At verification the request has no bound actor, and `ANONYMOUS` is not persistable (CST-072). `SYSTEM` would claim an automated job did it; an admin actor would attribute a customer's action to staff. The customer whose possession was just proven is the truthful actor, and `ADR-DB2-001` r3 says that possession **is** the identity. |
| `customer_id` | the same customer | Written after the customer row inside the transaction, so `fk_audit_events__customer_id` resolves. |
| `target_kind` / `target_id` | `CUSTOMER` / customer id | Already in the closed target set. |
| `summary` | `{ contactPointId, contactKind, isPrimary }` | Server-derived and bounded. |
| `correlation_id` | `requireRequestId()` | The platform request context, never a caller-supplied value. |

Never in the summary: the normalized value, the display value, a **masked** form
(still derived from the address), or `verifiedSource` (caller-supplied, and
already on the contact row where an operator can read it). Asserted by scanning
every textual and JSON field of `audit_events` for the synthetic address, its
as-entered casing, the bare domain and the phone digits — all absent — and
enforced by the checker, which fails on `normalized`, `display`, `mask`,
`verifiedSource` or `.contact` appearing in the recorder at all.

Resolution paths that mutate nothing write nothing. Asserted by counting audit
rows after a repeat resolution and after an idempotent attachment.

## I. Scope compliance

```text
0 HTTP endpoints
0 OpenAPI changes
0 schema changes
0 migrations
0 merge behavior
0 Business Profile authoring
0 customer search
```

Also zero: controllers, DTOs, Swagger decorators, customer credentials or
sessions, anonymization execution, verification challenge handling, grant
lifecycle, new repository methods, new transaction machinery, and any change to
worker or notification code. The generated contract
`packages/contracts/openapi/openapi.generated.json` publishes no customer path
and no customer schema, asserted by the checker rather than by regeneration.

## J. Checker evidence

```text
node tools/check-app4-b02.mjs            → pass
node --test tools/check-app4-b02.test.mjs → 36 tests, 36 pass
```

`tools/check-app4-b02.mjs`, 421 lines — under the 450 tooling soft cap. It reuses
`stripComments`/`importSpecifiers` from the B01 gate rather than copying them.

All 20 required assertions are covered. The two that needed strengthening after a
mutation case caught them are worth naming, because both were the gate agreeing
with itself:

- "uses the existing transaction boundary" originally matched
  `runInTransaction(` **anywhere in the file**, so removing it from `resolve`
  still passed while `attachVerifiedContact` kept its own. Now the source is
  split at the second method and each half is checked separately.
- "writes through the existing audit capability" originally matched `.append(`,
  which the recorder's *internal* delegation `this.append(...)` satisfies. Now it
  requires `this.events.append(`.

Merge assertions are scoped to B02's own files (`application/`,
`domain/identity/`) rather than the whole module, because the delivered DB7 row
mapper legitimately contains `mergedIntoCustomerId:` while *reading* a row — the
gate distinguishes a read of the field from a write of it, and separately asserts
the adapter gained no `set({ ... mergedIntoCustomerId ... })`.

## K. Focused tests

| File | Tests | Scenario |
|---|---|---|
| `application/resolve-or-create-verified-customer.spec.ts` | 7 | Docker-free. The CST-005 code becomes `CONCURRENT_VERIFICATION_LOSS`; CST-006, an uncatalogued unique arbiter, a check violation, an unresolved reference and a plain `Error` all travel as themselves; an unbounded `verifiedSource` is refused before the repository is touched. |
| `tests/integration/verified-identity-resolution.integration.spec.ts` | 14 | First identity (one customer, one primary verified contact, one audit row, no contact value in audit); phone identity; unbounded source refused with no customer written; returning identity resolves the same customer and writes nothing; idempotent across four resolutions; an **unverified** match never links; a **deactivated** match never links; second contact attached with one primary preserved and audited; idempotent attachment; refusal to steal another customer's contact; unknown customer refused; merge tombstone refused; a caller's rollback leaves no customer, contact or audit row; a caller's transaction commits identity and evidence together. |
| `tests/integration/verified-identity-concurrency.integration.spec.ts` | 2 | The real CST-005 race (§G), and the retry after a loss. |

23 tests, all passing. Contact fixtures are synthetic `example.com` addresses and
a Vietnamese test-range phone; every fixture value is normalized by the P01
authority rather than hand-written, so the suites assert against the canonical
form the production path actually produces.

## L. Validation ledger

```text
No full regression/test chain was run.
```

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="resolve-or-create-verified-customer\|verified-identity" --testPathIgnorePatterns=/node_modules/` | 3 suites, 23 tests, pass |
| 2 | `pnpm --filter @embroidery/api exec tsc --noEmit` | pass |
| 3 | `node tools/check-app4-b02.mjs` | pass |
| 4 | `node --test tools/check-app4-b02.test.mjs` | 36/36 pass |
| 5 | `pnpm --filter @embroidery/api exec eslint src/modules/customer src/bootstrap/app.module.ts` | clean |
| 6 | `npx prettier --write <changed files>` | applied |
| 7 | `node tools/check-report-secrets.mjs` | pass |
| 8 | `git diff --cached --check` | clean |

The delivered DB7 `CustomerRepository` suite was **not** run: neither the port nor
the adapter changed, which is the condition §23.2 attaches to it. Not run either:
full API Jest, full customer regression, persistence tests, worker/W01, B01
intake or publication, P01 suites, B03/B04, frontend, Playwright, OpenAPI
generation, DB manifest, migration regression, the Figma and G01 checkers,
SonarQube, and any repository-wide build, typecheck or lint.

Four commands were re-run after a failure, each against a covered defect and only
that command: the focused suite twice (a `uuid` column concatenated with `''` in
the audit scan, then timestamps arriving from raw SQL as text rather than
`Date`), ESLint once (three findings), and the checker's mutation suite once (the
two weak assertions in §J). Commands 3 and 4 were verified once more after
Prettier rewrote the files they parse — a real input change, not a repeat. Nothing
successful was re-run for reassurance, and the PostgreSQL race test was run once.

## M. Files changed

New:

```text
apps/api/src/modules/customer/domain/identity/verified-contact-evidence.ts
apps/api/src/modules/customer/domain/identity/verified-identity-outcome.ts
apps/api/src/modules/customer/application/resolve-or-create-verified-customer.service.ts
apps/api/src/modules/customer/application/resolve-or-create-verified-customer.spec.ts
apps/api/src/modules/customer/application/customer-identity-audit.recorder.ts
apps/api/src/modules/customer/tests/integration/verified-identity-context.ts
apps/api/src/modules/customer/tests/integration/verified-identity-queries.ts
apps/api/src/modules/customer/tests/integration/verified-identity-resolution.integration.spec.ts
apps/api/src/modules/customer/tests/integration/verified-identity-concurrency.integration.spec.ts
tools/check-app4-b02.mjs
tools/check-app4-b02.test.mjs
docs/implementation/reports/APP4-B02-COMPLETION-REPORT.md
```

Modified:

```text
apps/api/src/bootstrap/app.module.ts          (+ CustomerModule)
apps/api/src/modules/customer/customer.module.ts (+ AuditModule, 2 providers, 1 export)
docs/implementation/SCOPED_COMMAND_INDEX.md   (3 new scoped commands)
```

No schema file, no migration, no generated artifact, no worker file, no frontend
file, no root script. `CustomerRepository` and its Drizzle adapter are untouched.

## N. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| B02 entry HEAD | `703f934` — `docs(app4): record APP4-W01 commit evidence` |
| B02 implementation | see below |
| B02 evidence | `docs(app4): record APP4-B02 commit evidence` — this commit; it carries the implementation hash and cannot carry its own |
| Final HEAD | the evidence commit, the second of the two |
| Working tree after both commits | clean |
| Pushed | **no** |

Implementation commit: `f5bae1c`

## O. Limitations and follow-ups

1. **The capability has no caller yet.** `APP4-B04` is the one the manifest
   names, and it does not exist. The service is exported and proven by focused
   tests; until B04 lands, nothing in a running system reaches it. That is the
   intended state for a checkpoint with zero endpoints, and it is why the
   rollback test exercises the exact nesting shape B04 will use.
2. **`CONTACT_OWNED_BY_MERGED_CUSTOMER` is defensive.** No delivered code can
   set `merged_into_customer_id`, so this refusal is unreachable in production
   today. It is proven with a directly seeded tombstone. When G10 implements
   merge it must decide whether contacts move to the survivor; if they do, this
   guard stays unreachable, and if they do not, it is the thing that stops new
   submissions attaching to a dead identity.
3. **The APP4 roadmap row still reads `IN_PROGRESS — APP4-G01 COMPLETE`.** D01,
   P01, B01 and W01 did not append their statuses either. B02 follows that
   precedent rather than unilaterally editing a phase-level row; the lag is a
   phase-closure item.

## P. Next checkpoint

```text
APP4-B03
```

Not started.
