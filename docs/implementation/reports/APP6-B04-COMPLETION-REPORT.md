# APP6-B04 — Customer Secure Quotation Read — Completion Report

## 1. Verdict

```text
APP6-B03 = ACCEPTED
APP6-B04 = COMPLETE
HTTP OPERATIONS ADDED = 1
PUBLIC METHOD = POST
SECURE TOKEN = BODY ONLY
REQUEST_ACCESS = REUSED
NEW GRANT ISSUANCE = NONE
CUSTOMER IDENTITY = GRANT-DERIVED
REQUEST TARGET = GRANT-DERIVED
CURRENT QUOTATION = POINTER-DERIVED
CURRENT VERSION = POINTER-DERIVED
EXACT VERSION ID = RETURNED
EXACT MONEY = STRING END TO END
EXPIRED QUOTATION = READABLE WITHOUT MUTATION
SECURE/TARGET UNAVAILABLE = ONE 404 / SECURE_LINK_UNAVAILABLE
READ SIDE EFFECTS = NONE
DATABASE MIGRATION = NONE
B05 = NOT STARTED
NEXT CHECKPOINT = APP6-B05
```

## 2. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `0bf822d` — *docs(app6): record the APP6-B03 commit hash in its completion report* |
| Branch | `production` |
| Working tree at entry | clean (`git status --porcelain` empty) |
| `0d08be5` reachable from HEAD | **yes** — `git merge-base --is-ancestor 0d08be5 HEAD` succeeded |
| OpenAPI artifact at entry | 62 paths / 68 operations / 141 schemas — matches the accepted B03 baseline exactly |
| Migrations at entry | 36 (unchanged at exit) |

The five accepted Admin quotation operation ids were verified unchanged, both by
reading the delivered controllers and by assertion in the new contract spec
(§9): `adminQuotation_create`, `adminQuotation_addVersion`,
`adminQuotation_versionHistory`, `adminQuotation_versionDetail`,
`adminQuotation_sendVersion`.

The delivered APP4/APP5 secure-link implementation was read before anything was
composed — `AuthorizeSecureLink`, `ResolveSecureLink`, `secure-link.errors.ts`,
`ReadGrantScopedRequest`, `PublicCustomRequestStatusController` and
`custom-request-status.request.ts`. B04 follows that lane rather than
re-deriving it.

## 3. Product Owner clarification recorded

The `APP6-B03` completion report contains a sentence saying the customer-facing
secure link is "issued by `APP6-B04`". The Product Owner has ruled that sentence
**not authority**. Canonical APP6 authority stands:

```text
REQUEST_ACCESS secure grant = READY_AS_IS
one grant covers the Customer + Request secure-flow capability
no new scope kind, no new token format, no second secure-link architecture
```

`APP6-B04` therefore **reuses** the `REQUEST_ACCESS` grant APP5 created at
request submission. It issues nothing, rotates nothing, re-scopes nothing and
mints no token. No B03 runtime file was edited on account of that imprecise
sentence — the report prose was left as the Product Owner reviewed it, and this
section is the correction of record.

## 4. Published operation

```text
POST /api/public/quotations/current   →   publicQuotation_current
```

- exactly **one** operation on the class and one path under `/api/public/quotations`;
- `POST`, not `GET`, because the credential is a bearer token and a path or query
  carrier is `FORBIDDEN` with no fallback (`ADR-APP4-001` §11);
- the route contains no `{` — no path parameter of any kind;
- the class name derives its own domain key, so **no `CONTROLLER_DOMAIN_KEYS`
  entry was added** and no existing operation id was reissued;
- idempotent and consuming nothing despite the verb: ADR-DB3-004 r2 keeps a link
  multi-use within its validity, so refreshing the page must not burn it.

There is no public quotation collection, no history read, no identified
`/public/quotations/{id}` and no second "resolve quotation" endpoint. The
contract spec asserts that `/api/public/quotations*` contains exactly this one
path.

## 5. Request schema, and the proof the token is body-only

`ReadCurrentQuotationBody` (`presentation/schemas/public-quotation.request.ts`):

```ts
z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
```

One field. `.strict()` refuses everything else by construction, so there is no
`quotationId`, `versionId`, `requestId`, request `code`, `customerId`, contact
value, `grantId`, `scopeKind` or `challengeId` — not declined, *unrepresentable*.

Proved in `public-quotation.contract.spec.ts`:

- `ReadCurrentQuotationBody` publishes exactly `['token']` and
  `additionalProperties: false`;
- the operation's `parameters` are exactly `['header:X-Request-ID']` — the
  platform correlation id, which is not a credential. No path, query or cookie
  parameter exists;
- the path string contains no `{`;
- the token property publishes **no `example`**: an example token is a
  credential-shaped string rendered in Swagger UI and pre-filled into "try it
  out".

## 6. `AuthorizeSecureLink` reuse path

```text
PublicQuotationController.current
  → ReadCurrentQuotation.read
    → AuthorizeSecureLink.authorize(request, token)
        1. SecureLinkPolicyReader.require()      — fail-closed, before the token is looked at
        2. SecureLinkRateLimiter.check(...)      — one charge, before any HMAC work
        3. ResolveSecureLink.resolve({ token })  — one digest, one query, one answer
    → ResolvedSecureLink { customRequestId, scopeKind, expiresAt }
```

B04 contains **no** `digestSecret` call, no query against `secure_access_grants`,
no rate limiter, no token-resolution ordering of its own, no diagnostic query
after a failed lookup, no second abuse budget, and no caller-supplied target.
Customer identity and request target come from the resolved grant and from
nothing else. Both public secure-link surfaces share the same limiter dimension
and key, so a caller cannot escape `secure_link.resolve`'s budget by spreading
guesses across two routes.

`AuthorizeSecureLink`, `CustomerModule` and every APP4 file were left
**unmodified**, which is why the APP5-B03 and APP4-B06 suites were not re-run
(§11).

## 7. Grant-derived target chain

```text
resolved REQUEST_ACCESS grant
  → customRequestId                                   (the grant row)
  → custom_requests.current_quotation_id              (set by APP6-B03)
  → quotations.current_version_id                     (set by APP6-B03)
  → that exact quotation version
  → that version's own line items, ascending by position (CST-037)
```

Both containment invariants are **proved, not assumed** — `findById` and
`loadVersion` address their tables globally, so a pointer naming a foreign row
would resolve perfectly well:

| Invariant | Where |
|---|---|
| `quotation.customRequestId === grant.customRequestId` (G-DB7-04) | `read-current-quotation.query.ts` |
| `quotation.currentVersionId !== undefined` | same |
| `version.quotationId === quotation.id` (G-DB7-03) | same |

No "latest by `created_at`", no `max(version)`, no history scan, no "only `SENT`
sibling" heuristic. A superseded version is still `SENT`-shaped history, and
picking by recency would show a customer a price the workshop has replaced.

### The Ordering pointer port

`custom_requests.current_quotation_id` was not reachable safely:

- `CustomRequestStatusRepository` deliberately **excludes** it — its row type
  names the pointer in the list of columns absent by construction, because the
  APP5 status screen must not learn a quotation exists. Widening it would delete
  that property for `APP5-B03` too;
- `CUSTOM_REQUEST_REPOSITORY` carries `submit`, `transition`, `lockById` and
  `setCurrentQuotation` — the whole AGG-13 write side. Importing `OrderModule`
  into a public, unauthenticated surface would put a lifecycle transition one
  injection away from an anonymous caller.

So Ordering publishes one new **read-only** port on a module of its own:

| File | Purpose |
|---|---|
| `order/domain/repositories/custom-request-quotation-pointer.port.ts` | one method, returns two ids |
| `order/infrastructure/persistence/drizzle-custom-request-quotation-pointer.adapter.ts` | two named columns, one `select`, no transaction |
| `order/custom-request-quotation-pointer.module.ts` | exports only `CUSTOM_REQUEST_QUOTATION_POINTER_PORT` |

AGG-13 ownership does not move: the contract is Ordering's and it reads
Ordering's own table. CTX-QUO consumes a port and never reads `custom_requests`
(`BACKEND_CONVENTIONS.md` §10). No schema change was involved.

## 8. Public response projection

`CustomerQuotationResponse` / `CustomerQuotationLineItemResponse` — a bounded
projection written for this surface, **not** an Admin DTO reused.

**Published:** `quotationCode`, `versionId`, `version`, `status`,
`quotationStatus`, `currencyCode`, `quantityTotal`, `subtotalAmount`,
`manualAdjustmentAmount`, `shippingFeeAmount`, `totalAmount`, `depositPercent`,
`depositAmount`, `remainingAmount`, `lineItems[]` (`position`, `lineKind`,
`description`, `quantity`, `unitPriceAmount`, `lineTotalAmount`), `sentAt`,
`validFrom`, `validUntil`, `expired`, `accessExpiresAt`.

**Deliberately absent**, each for a stated reason:

| Excluded | Why |
|---|---|
| `adjustmentReason` | TBL-051 describes it as the **evidence** for why a total was moved off-list. No repository or product authority makes it customer-facing, and the repository's pattern for customer-readable text is a *dedicated* column (`cancelled_customer_reason` beside `cancelled_reason`) — the quotation has only the internal one. The amount is shown; the operator's note is not. Routed as a follow-up (§14) |
| `stitchCount` | An admin-entered pricing input (GAP-10), not a fact about what the customer owes |
| `skuId` on a line | An internal catalogue key this surface publishes no way to resolve |
| `customerId`, `customRequestId`, `quotationId`, `grantId`, `scopeKind`, token/digest | The response echoes back nothing presented to obtain it, and names no identifier the caller did not already hold |
| `acceptedAt`, `supersededAt`, `expiredAt`, `createdAt` | Timestamps of states this page does not render |
| Admin actor / audit / outbox / correlation / policy-version ids | Internal evidence |
| Version history, superseded siblings, superseded line items | One version: the one the pointers name |

Both the runtime view and the HTTP view are assembled **field by field**, so a
column added to `QuotationVersion` later cannot reach an anonymous browser
without an edit in this checkpoint's files.

`APP6-B02`'s Admin schemas were **not** reused. They are an operator archive and
carry `customRequestId`, `stitchCount`, `adjustmentReason` and the full
lifecycle timestamp set; sharing them would mean every fact the Admin surface
later needs arrives on the customer's screen by default.

## 9. Exact-version and stale-decision contract

- B04 resolves from the current pointers **at read time**, every time;
- the exact `versionId` is returned, so `APP6-B05` can bind acceptance to the
  version the customer actually saw (GRD-006 / G-DB7-20) and refuse a stale one
  without a hidden "latest" lookup;
- no caller-supplied version id is accepted (§5);
- B04 does **not** implement `QUOTE_VERSION_STALE`; B05 owns the stale-write
  refusal;
- proved by integration test *"returns the newer version after a later send, and
  never the superseded one"*: version 1 is read, version 2 is drafted and sent,
  a fresh read returns version 2 with version 2's line prices, and version 1 is
  confirmed `SUPERSEDED` on disk and never served as current again.

## 10. Exact money

```text
DB numeric(14,2) → repository string → domain view string → OpenAPI `type: string`
                 → generated client `string`
```

There is no `Number()`, no `parseFloat` and no arithmetic operator applied to an
amount in any B04 file. Nothing recomputes a line total, a subtotal, a total, a
deposit or a remainder, and no deposit policy reader is reachable from this
module's injector — `depositPercent` is the share the version was *priced at*,
read from its own row.

Evidence:

- integration: a version priced at 150 000 × 10 + 20 000 adjustment + 50 000
  shipping reads back exactly `'1500000.00'`, `'20000.00'`, `'50000.00'`,
  `'1570000.00'`, `'40.00'`, `'628000.00'`, `'942000.00'`, each asserted
  `typeof === 'string'`;
- contract: all seven amount properties and both line amounts publish
  `type: string`;
- generated client: `subtotalAmount: string`, `totalAmount: string`,
  `depositPercent: string`, … (inspected in
  `packages/api-client/src/generated/embroidery-api.schemas.ts`).

## 11. Expired quotation vs unavailable secure access

The two states are kept distinct, exactly as the approved `APP6-S01` design
requires.

| Situation | Answer |
|---|---|
| Live grant, current quotation still within validity | `200`, `expired: false` |
| Live grant, current quotation whose `valid_until` has passed | `200`, **full quotation**, `expired: true`, stored `status` still `SENT`, **nothing written** |
| Live grant, version the out-of-APP6 sweep already moved to `EXPIRED` | `200`, `status: 'EXPIRED'`, `expired: true` — the persisted state reported truthfully |
| Token unusable, or no readable current quotation | `404 / SECURE_LINK_UNAVAILABLE` |

`expired` is derived as `status === 'EXPIRED' || now >= validUntil` and stored
nowhere. B04 runs no expiry sweep, opens no transaction and mutates no row;
`APP6-B05` will independently reject acceptance in-transaction under the
canonical rule and does not trust this advisory flag.

Proof: the expired-quotation test snapshots `status`, `sent_at`, `valid_until`
and `expired_at` before the read and asserts the row is byte-identical after it.

A fixture note worth recording: a lapsed window can only be created **at send
time**. `ck_quotation_versions__validity_window` requires
`valid_from < valid_until`, and `trg_quotation_versions__reject_mutation`
(migration `0030`) freezes both columns the moment a version leaves `DRAFT` —
so no code, fixture or operator can back-date a validity window after the fact.

## 12. Uniform-404 matrix

Every definitive "this credential cannot obtain a current quotation" outcome
collapses to one response: `404`, code `SECURE_LINK_UNAVAILABLE`, message
*"That secure link is not available."* — identical in status, code, message and
shape.

| Cause | Decided by | Proved |
|---|---|---|
| Unknown token | APP4 `ResolveSecureLink` | integration |
| Expired grant | APP4 (`resolveActiveByTokenDigest` under CST-008) | integration |
| Revoked grant | APP4 | integration |
| Superseded grant (a revoked grant) | APP4 | APP4-B06's own suite |
| Wrong scope | APP4 | **unrepresentable** — `GRANT_SCOPE_KINDS` has one member and `ck_secure_access_grants__scope_kind_allowed` rejects any other; exercised where it is owned |
| Wrong target | APP4 | unrepresentable by construction — the target is *read*, never accepted |
| Request row unreadable | B04 | same branch as the next row |
| Request has no current quotation | B04 | integration |
| Current quotation pointer unresolvable | B04 | covered by the same branch |
| Current version pointer unset | B04 | integration |
| Quotation belongs to another request (G-DB7-04) | B04 | integration |
| Version belongs to another quotation (G-DB7-03) | B04 | same branch |

There is **no diagnostic follow-up read** after any definitive unavailable
result, in B04 or in the capability it calls. No `QUOTATION_NOT_FOUND`,
`CURRENT_QUOTATION_MISSING` or `GRANT_REVOKED` is published on this operation —
the contract spec asserts the document never mentions `QUOTATION_NOT_FOUND`.

Preserved platform categories, unchanged: `400` malformed body, `429` abuse
budget with `Retry-After`, `503` secure-link policy unavailable, `500` the
platform's own sanitised failure. The controller catches only `SecureLinkError`;
everything else propagates to the platform filter, so a `PersistenceError` can
never become a token-validity signal.

## 13. Same-customer isolation

Fixture:

```text
Customer C
  ├─ Request A → Grant A (token A) → Quotation A → current Version A (unit 111 000)
  └─ Request B → Grant B (token B) → Quotation B → current Version B (unit 222 000)
```

Proved: token A returns version A with A's line prices and A's quotation code;
token B returns version B with B's; the two codes differ; lines never mix. And
there is no field in the command through which token A could have asked for B —
`ReadCurrentQuotationCommand` carries a token and nothing else, which is why
this is an isolation *property* rather than a comparison that could be deleted.

The full APP5-B03 security suite was **not** re-run: B04 modifies no file of
that capability (§17).

## 14. Zero-side-effect evidence

Two consecutive reads of a live quotation leave `custom_requests`, `quotations`,
`quotation_versions`, `quotation_line_items` and `secure_access_grants`
byte-identical (full-row snapshot compared with `toEqual`). Additionally
asserted zero rows in `custom_request_transitions`, zero rows in
`outbox_events`, and zero `audit_events` whose `action` starts with `quotation`.

The read therefore does not: mutate either pointer, mutate quotation or version
state, expire a version, append a version, append a transition, append quotation
audit evidence, emit an outbox event, create a notification intent, issue,
reissue or revoke a grant, consume step-up, or publish policy. The grant is not
consumed.

**One row is written, and it is not B04's:** APP4's `SecureLinkAuditRecorder`
appends its own grant-resolution evidence, because a token was resolved — the
same row `APP5-B03` produces on every status read. The suite asserts that at
least one `audit_events` row exists *and* that none of them is a `quotation.*`
action, so the distinction is proved rather than asserted in prose.

Composition guarantees the rest: `CustomerQuotationModule` imports no
`DatabaseModule` (no `TransactionManager`, no executor — nothing composed here
can open a transaction), no `OrderModule` (no `CUSTOM_REQUEST_REPOSITORY`), no
`QuotationSendModule` or `QuotationDraftingModule` (no Admin mutation service in
reach of a public controller), no `AuditModule`, no outbox store, no policy
reader, no grant issuer, no step-up window and no notification module.

## 15. B03 report wording created no scope

No notification intent, worker event handling, secure-link issuance or token
delivery was backfilled. `quotation.sent` remains emitted by B03 and consumed by
the delivered APP4 worker after commit. Nothing was implemented on account of
prose.

## 16. OpenAPI and generated client — one controlled cycle

| Step | Command | Result |
|---|---|---|
| 1. focused typecheck | `pnpm --filter @embroidery/api typecheck` | clean |
| 2. contract spec (pre-generation) | `npx jest …/public-quotation.contract.spec.ts` | 10/10 |
| 3. generation (**once**) | `pnpm --filter @embroidery/api openapi:generate` | 63 paths / 69 operations / 144 schemas |
| 4. diff inspection | `git diff` | **401 insertions, 0 content deletions** |
| 5. drift check | `pnpm --filter @embroidery/api openapi:check` | up to date |
| 6. client generation (**once**) | `pnpm --filter @embroidery/api-client generate` | 2 files, tree hash `6bfd5132…` |
| 7. client drift check | `pnpm --filter @embroidery/api-client check:generated` | up to date |
| 8. package typechecks | api + api-client `tsc --noEmit` | clean |

```text
paths       62 → 63   (+1)
operations  68 → 69   (+1)
schemas    141 → 144  (+3: ReadCurrentQuotationBody, CustomerQuotationResponse,
                           CustomerQuotationLineItemResponse)
```

Exactly one operation id added — `publicQuotation_current`. The diff contains no
removed or renamed line, so every previously accepted id is byte-identical; the
five Admin quotation ids and the two APP5 public secure-link ids are also
asserted explicitly in the contract spec. No regeneration loop: generation ran
once and the check passed on the first attempt.

Generated client spot-check: money fields type as `string`, nullable instants as
`string | null` (not an index signature) — the `type: object` nullable debt was
not extended.

## 17. Focused validation ledger

Every command below was run once on the inputs named; no command was re-run on
unchanged inputs except where a concrete input change is stated.

| Command | Scope | Result |
|---|---|---|
| `git merge-base --is-ancestor 0d08be5 HEAD` | entry proof | pass |
| `pnpm --filter @embroidery/api typecheck` | after runtime files | clean |
| `pnpm --filter @embroidery/api typecheck` | **re-run** — test files added; then again after two `exactOptionalPropertyTypes` fixes | clean |
| `npx jest …/public-quotation.contract.spec.ts` | new contract spec | 10/10 (after correcting one expectation to include the platform's `500`) |
| `npx jest …/customer-quotation-read.integration.spec.ts` | new integration suite | 12/12 (after correcting the lapsed-window fixture — see §11) |
| `npx jest` both suites | **re-run** — Prettier reformatted all three test files | 22/22 |
| `pnpm --filter @embroidery/api openapi:generate` / `openapi:check` | contract artifact | see §16 |
| `pnpm --filter @embroidery/api-client generate` / `check:generated` | client artifact | see §16 |
| `pnpm --filter @embroidery/api-client exec tsc --noEmit` | after client regeneration | clean |
| `npx eslint` on every changed/added file | lint | clean |
| `npx prettier --check` on changed inputs | format | 3 new files formatted; 4 pre-existing `APP6-B01` warnings left untouched (unrelated) |
| `git diff --check` | whitespace | clean |

### Deliberately not run

The full repository suite, full API regression, the order/AGG-15 integration
suites, Admin/Storefront, the worker suite, Playwright/E2E, database
fingerprint/manifest/index/checksum suites, historical APP3/APP4/APP5 gate
sweeps, the Figma checker, the B01 pricing and policy-publisher suites, and
SonarQube. None of their owning inputs changed.

APP5-B03, APP4-B06, APP6-B02 and APP6-B03 suites were **not** run: B04 modifies
no file of `AuthorizeSecureLink`, `CustomerModule`, the shared quotation read
projection or the send path. `quotation-version.projection.ts` and
`quotation-version.view.ts` are untouched — B04 has its own projection.

### Historical gates observed red (pre-existing, not caused by B04)

| Gate | Failure | Status |
|---|---|---|
| `node tools/check-app3-p03-contract.mjs` | asserts a frozen 37-path / 42-operation surface | red since APP4; the surface was already 62/68 at entry |
| `zod-dto-publication.contract.spec.ts` (2 of 123 tests) | asserts a frozen 19-path / 23-operation surface, and a `publicDesignSession_create` body assertion | pre-existing; the regeneration diff contains **zero** content deletions, so no existing schema changed |

Both were run because B04 adds a `createZodDto` consumer, which is the trigger
condition for `CMD-TEST-APP3-P03-CONTRACT`. The DTO-registration half they
protect passed (121/123, and the registry test for consumers is green); the
failures are the APP3-era frozen counts. Not repaired — out of B04 scope, and
routed in §19.

## 18. Files changed

**Added — Ordering (read-only port):**

- `apps/api/src/modules/order/domain/repositories/custom-request-quotation-pointer.port.ts` (58)
- `apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request-quotation-pointer.adapter.ts` (58)
- `apps/api/src/modules/order/custom-request-quotation-pointer.module.ts` (38)

**Added — Quotation (the read):**

- `apps/api/src/modules/quotation/application/customer/customer-quotation.view.ts` (110)
- `apps/api/src/modules/quotation/application/customer/read-current-quotation.query.ts` (227)
- `apps/api/src/modules/quotation/presentation/schemas/public-quotation.request.ts` (73)
- `apps/api/src/modules/quotation/presentation/schemas/public-quotation.response.ts` (252)
- `apps/api/src/modules/quotation/presentation/public-quotation.controller.ts` (219)
- `apps/api/src/modules/quotation/customer-quotation.module.ts` (63)

**Added — tests:**

- `apps/api/src/modules/quotation/presentation/public-quotation.contract.spec.ts` (189)
- `apps/api/src/modules/quotation/tests/integration/customer-quotation-context.ts` (329)
- `apps/api/src/modules/quotation/tests/integration/customer-quotation-read.integration.spec.ts` (373)

**Modified:**

- `apps/api/src/bootstrap/app.module.ts` — registers `CustomerQuotationModule`
- `packages/contracts/openapi/openapi.generated.json` — generated
- `packages/api-client/src/generated/embroidery-api.ts` — generated
- `packages/api-client/src/generated/embroidery-api.schemas.ts` — generated

**Documentation:**

- `docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`
- `docs/implementation/reports/APP6-B04-COMPLETION-REPORT.md` (this file)

`SCOPED_COMMAND_INDEX.md` was **not** touched: B04 adds no checker and no new
scoped command. Focused contract and integration tests prove the security
boundary, so no bespoke `tools/check-*.mjs` was created.

Every source file is within the 400-line limit and every test file within 600.

## 19. Follow-ups

**New:**

| Id | Disposition |
|---|---|
| `FU-APP6-B04-CUSTOMER-ADJUSTMENT-EXPLANATION-01` | `OPEN` · owner **`APP6-S01` / a design-authority decision**. The customer sees a `manualAdjustmentAmount` with no explanation, because the only stored reason is TBL-051's internal operator evidence and no authority makes it customer-facing. If the approved `APP6-S01` screen requires a customer-readable explanation, the repository's own pattern is a *dedicated* column (`cancelled_customer_reason` beside `cancelled_reason`) — which is a schema decision and a database-change checkpoint, not a projection widening. Nothing was invented here. |

**Carried, untouched:**

| Id | Disposition |
|---|---|
| `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` | `NONBLOCKING` — B03 send eligibility not altered; B05 creates no reopen path. Routed to `APP6-X01` / dedicated lifecycle authority |
| `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` | `NONBLOCKING_PREEXISTING` — not run, not repaired |
| `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` | open, untouched |
| `FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01` | open, untouched |
| `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` | open, untouched — B04 adds none to it (every nullable field publishes an explicit scalar type), and repairs none of the history |
| APP3-era frozen-surface gates (`check-app3-p03-contract`, `zod-dto-publication` counts) | pre-existing red since APP4; already outside every APP6 checkpoint's scope |

## 20. Scope guard

Not implemented, and not started: `TR-LC12-03` acceptance, `TR-LC12-06`
rejection, `quotation.accept` idempotency, `TR-LC11-06`, step-up or
re-verification, grant status re-check inside a sensitive write transaction,
quotation send or re-send, post-acceptance re-quote lifecycle work, the expiry
sweep, notifications, Admin quotation UI, Storefront UI, order/payment/inventory
/design behaviour, and any database migration.

`APP6-B05` is **not started**.

## 21. Commit

```text
LOCAL COMMIT = cef99b7
PUSHED = NO
NEXT CHECKPOINT = APP6-B05
```
