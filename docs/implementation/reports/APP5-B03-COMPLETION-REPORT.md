# APP5-B03 — Grant-Scoped Request Status Read — Completion Report

**Date:** 2026-08-16 · **Branch:** `production` · **HEAD at entry:** `99025f1`
**Checkpoint type:** backend feature · 1 public read endpoint · no migration, no
worker, no Figma.

---

## 1. Verdict

```text
APP5-B03 = COMPLETE
```

---

## 2. Baseline

| Fact | Value |
|---|---|
| Entry HEAD | `99025f1` — *feat(app5): take customer attachments before submission* |
| `APP5-B01` | `COMPLETE` — `POST /api/public/custom-requests` (`publicCustomRequest_submit`), TR-LC11-01 in one transaction |
| `APP5-DB01` | `COMPLETE` — migration `0035_add_app5_intake_provenance` |
| `APP5-B02` | `COMPLETE` — two intake operations; surface at entry **51 paths / 56 operations / 109 schemas** |
| Migration added | **none** |
| Worker changed | **none** |
| Figma changed | **none** |

---

## 3. APP4 secure-access reuse

```text
secure link (token in the URL fragment)
  → POST /api/public/custom-requests/status   { token }
  → AuthorizeSecureLink            ← APP4, exported capability
      1. SecureLinkPolicyReader.require()      fail closed, before the token is read
      2. SecureLinkRateLimiter.check(key)      charged once, before any HMAC
      3. ResolveSecureLink.resolve({ token })  digestSecret → resolveActiveByTokenDigest
  → ResolvedSecureLink.customRequestId         ← read from the grant row
  → CustomRequestStatusRepository.findRequest(id)
  → CustomRequestStatusResponse
```

### What was reused, and what was deliberately not created

| Reused, unchanged | Where |
|---|---|
| Secure grant schema and repository | `secure_access_grants`, `SecureAccessGrantRepository.resolveActiveByTokenDigest` |
| `REQUEST_ACCESS` purpose/reference semantics | module constant in `resolve-secure-link.query.ts` (ADR-DB3-004 r1) |
| Raw-token → digest boundary | `digestSecret` (`APP4-P01`) |
| Expiry, revocation, supersession, scope | all inside `resolveActiveByTokenDigest` under CST-008 |
| Non-enumeration vocabulary | `SECURE_LINK_UNAVAILABLE`, one code, one message |
| Abuse budget | `secure_link.resolve`, the **same** limiter dimension and network key as `APP4-B06` |
| Request ↔ customer association | created by `APP5-B01`'s W1 transaction; read, never rebuilt |

**Not created:** no second token format, no second grant table, no second
verification algorithm, no customer session or login, no secure-link bootstrap
route (`APP4-B06`'s `POST /api/public/secure-links/resolve` already exists and is
untouched).

### The one new APP4 seam, and why it is a seam rather than a copy

`ResolveSecureLink`, `SecureLinkPolicyReader`, `SecureLinkRateLimiter` and
`PublicNetworkKeyService` were all module-private. A second public surface that
accepts a token needs all four, in one order that is itself the security model.
Two options existed and both were rejected:

- **export the four providers** — B03 would then re-derive the order, and a
  future edit could reverse steps 2 and 3, making the abuse budget depend on the
  credential;
- **refactor `PublicSecureLinkController` to share a helper** — that controller's
  structure is frozen by an accepted checkpoint gate
  (`tools/check-app4-b06-contract.mjs`), and rewriting it is exactly the
  unrelated refactoring change discipline forbids.

So `AuthorizeSecureLink` was added as one exported **capability**, on the
precedent `CustomerModule` already records for `SecureGrantIssuer` — *"a future
APP5 submission calls `SecureGrantIssuer.issue` … rather than composing a token
issuer, a repository and a notification use case itself"*. The four providers
stay unexported: a caller holding `ResolveSecureLink` alone could skip the
fail-closed policy read and the abuse budget.

`APP4-B06`'s controller, its query, its errors, its limiter and its published
operation are **byte-identical to entry**. The only APP4 file changed is
`customer.module.ts`, and only additively (one provider, one export).

---

## 4. Endpoint

```text
POST /api/public/custom-requests/status
operationId: publicCustomRequest_status
success:     200 · CUSTOM_REQUEST_STATUS_READ
refusals:    400 malformed body
             404 SECURE_LINK_UNAVAILABLE   (the one answer to every unusable token)
             429 TOO_MANY_REQUESTS + Retry-After
             503 secure-link resolution not configured
```

**Why `POST`.** `ADR-APP4-001` §11 makes the URL fragment the only browser
carrier for a secure-link token and declares a path or query carrier `FORBIDDEN`
with no fallback — both are written to the Nginx access log, the application
request log, every proxy in between, and the `Referer` of any link the page later
renders. A request body is the only position no log records. The operation is
idempotent and consumes nothing despite the verb: ADR-DB3-004 r2 keeps a link
multi-use within its validity.

**Why the operation id is `publicCustomRequest_status` and not
`publicCustomRequestStatus_status`.** `PublicCustomRequestStatusController` is a
second class in the same published domain, split for dependency shape rather than
contract. `CONTROLLER_DOMAIN_KEYS` exists for exactly this and now carries both
`PublicCustomRequestController` and `PublicCustomRequestStatusController` → both
map to `publicCustomRequest`. `APP5-B01`'s `publicCustomRequest_submit` is
unchanged; the generated artifacts show **zero deleted lines**, so no accepted
operation id was reissued.

`PublicCustomRequestAssetController` was deliberately **not** added to that
table: the pre-submission attachment lane is its own domain, not a split of this
one.

---

## 5. Grant authorization

| Requirement | How it holds |
|---|---|
| Valid | `resolveActiveByTokenDigest` returns a row or nothing |
| Correct purpose/scope | `REQUEST_ACCESS` is a module constant, never caller-supplied |
| Not expired | the repository's `now` predicate |
| Not revoked / not superseded | the repository's status predicate (a superseded grant is revoked) |
| Bound to the request returned | the request id is **read from the grant row**; `ReadGrantScopedRequestCommand` has no field to put a caller's id in |

`APP5-G01` `G01-D04` assigns GRD-002 to precisely this surface, and B03 evaluates
none of it itself: it holds no digest, no expiry comparison and no revocation
test. There is no step-up rule to preserve — `GRD-003` attaches to `cancel ≥ S5`,
which APP5 does not reach.

### Non-enumeration

Unknown, malformed-but-well-formed, expired, revoked, superseded, wrong-scope and
wrong-target all leave as one `404 / SECURE_LINK_UNAVAILABLE` with one message.
So does a resolved grant whose request row cannot be read — that case is
unreachable under `restrict` foreign keys, and it is refused identically so that
it stays unreachable *by observation* too, rather than becoming a
`REQUEST_NOT_FOUND` that would distinguish "the grant was real" from "the token
was not". The suite asserts **one distinct answer across four different causes**.

Nothing in the response or any refusal reveals whether a request exists, whether
a grant once existed, whether a customer or contact exists, or whether another
request belongs to the same customer.

---

## 6. Customer projection

```text
requestId              string
code                   string   — display only; returned, never accepted
status                 enum     — all ten LC-11 states published (see §7)
submittedAt            date-time
subject                CatalogRequestSubjectResponse | CustomerOwnedRequestSubjectResponse | null
quantities[]           { productVariantId?, sizeLabel?, quantity }
totalQuantity          integer
assets[]               { assetId, role }            role ∈ { COP_IMAGE, REFERENCE }
customerVisibleReason  string?  — only on NEEDS_CLARIFICATION / REJECTED / CANCELLED
accessExpiresAt        date-time
```

### Subject — a truthful discriminated union

```text
CATALOG          productId, productVariantId?, productName?, productSlug?,
                 variantColorName?, variantSizeLabel?
CUSTOMER_OWNED   name, description?, physicalWidthMm?, physicalHeightMm?
```

Published as `oneOf` with `discriminator: { propertyName: "kind" }`, two separate
components and no shared base, so a consumer cannot read a catalog field off a
customer-owned subject. The generated client renders it as a real TypeScript
union.

`subject` is nullable for one case only: a request row satisfying neither branch,
which `APP5-G01` §3 refuses before any write and which therefore cannot be
created. It is reported as absent rather than raised as a fault, because a
customer holding a valid grant should still learn their code, status and
quantities if the subject rows ever became undescribable.

**Catalog labels come from a new narrow port**, `CATALOG_SUBJECT_PORT`, mirroring
`PLACEMENT_HIERARCHY_PORT`: Ordering depends on the interface, Catalog provides a
one-join adapter, and no catalog table is read from the order module.
`ProductRepository.findById` was not reused because it returns the authoring row
(price, currency, `status`, `displayOrder`, `categoryId`) and `loadStructure`
loads every variant, SKU, side and area to answer a question about one variant —
both are the "load an Admin aggregate and redact it afterwards" §10 forbids.
`product_variants` has no `name` column (DB4 locked `color_name` + `size_label`),
so both are projected as stored rather than joined into an invented variant name.

**Publication state is deliberately not a predicate.** `PublicProductRepository`
applies it, which is right for a storefront listing and wrong here: unpublishing
a product afterwards must not make a customer's own request unreadable or make it
describe a different subject.

### Catalog media — a stated, truthful decision

`APP5-B03` §6 permits safe catalog media but does not require it, and §17
explicitly accepts metadata/fallback. **No media reference is returned.** The one
existing authorized public catalog media route is
`GET /api/public/products/{slug}/media/{productMediaId}/{rendition}`, which is
publication-gated and addressed by slug — so binding a request's status page to
it would make the page 404 for merchandising reasons unrelated to the request.
`productSlug` is returned instead: it is the existing public address, so a
storefront can link to the product page when one is live, and nothing is
promised when one is not. **No new binary-delivery endpoint was invented.**

### Request assets

`custom_request_assets` is association-only — *"Asset owns all metadata"* — and
this read stops there. `assetId` + `role` is what the status screen needs to say
*"you attached three item photos and one reference"*. No MIME type, byte size,
checksum, storage key, bucket, path, inspection outcome or signed URL: B03
publishes no way to fetch the binary, so metadata describing one would describe
something unreachable.

### Fields intentionally absent

| Class | Absent |
|---|---|
| Internal moderation | `custom_requests.cancelled_reason`, `custom_request_transitions.reason`, every `request_moderation_notes` field (TBL-041 is not read at all) |
| Staff / audit identity | `actor_kind`, `admin_id`, `customer_id`, `grant_id`, `system_job_key`, `correlation_id`, any `audit_events` row, the transition timeline itself |
| Storage | bucket, object key, internal path, checksum, MIME type, byte size, scanner/inspection output, signed URL |
| Credentials & sessions | the token, its digest, `grantId`, `customerId`, any contact value, `challengeId`, the idempotency key, `submitted_session_id` (`G01-D09` server-owned provenance) |
| Intake data | `customer_note` — what the Admin triages, not status content |
| APP6+ | quotation, price, design version, payment, order, available actions |

Absence is structural, not a mapping step: `CustomRequestStatusRow`,
`…QuantityLine`, `…CustomerOwnedProduct` and `…Asset` have nowhere to put any of
them, and the SQL names its columns explicitly rather than using `select()`.

---

## 7. Status semantics

The **stored** status is returned. All ten LC-11 states are published, guarded by
a `satisfies readonly CustomRequestState[]` plus a `PublishedStatesAreComplete`
proof type, so neither an invented state nor a forgotten one compiles.

Publishing only the APP5 subset was rejected: `APP5-B03` §7 requires truthful read
semantics, and a document enumerating six states would make a genuine `QUOTED`
an out-of-contract value for every generated client. **No APP6 action, control or
copy is added** — this surface offers no action in any state, and none of
`TR-LC11-05…09` is representable anywhere in it.

Asset roles publish only `COP_IMAGE` and `REFERENCE`; `ATTACHMENT` stays out of
the contract per `G01-D14`.

---

## 8. Customer-visible reason privacy

```text
NEEDS_CLARIFICATION → the latest transition INTO that status, customer_visible_reason
REJECTED            → the latest transition INTO that status, customer_visible_reason
CANCELLED           → custom_requests.cancelled_customer_reason, else the transition's
every other status  → nothing, whatever any row carries
```

Three enforcement layers, each independently sufficient:

1. **The query** selects `customer_visible_reason` and no other transition
   column, so `reason`, the three actor references and `correlation_id` are never
   retrieved;
2. **`selectCustomerVisibleReason`** has no parameter an internal reason could be
   passed through, and returns `undefined` for every status outside the closed
   `REASON_BEARING_STATUSES` set;
3. **The published schema** has no `reason` or `cancelledReason` property, asserted
   by the contract spec.

The reason is scoped to the transition **into the current status**, so an earlier
`NEEDS_CLARIFICATION` message cannot resurface as the explanation of a later
state. On `CANCELLED` the request row wins because COL-TBL037-09 is where a
cancellation's customer-facing text is durably kept; the transition remains the
fallback.

B03 returns **no** Admin moderation history.

`APP5-B05` does not exist yet, so nothing writes these columns in production
today. The suite seeds real TBL-042 rows exactly as B05 will, which is what makes
the privacy rule provable now rather than at B05.

---

## 9. Grant isolation — the same-customer proof

```text
customer C
  ├── request A ── grant A (ACTIVE, REQUEST_ACCESS) ── token A
  └── request B ── grant B (ACTIVE, REQUEST_ACCESS) ── token B

token A → request A          asserted
token B → request B          asserted
code A  → SECURE_LINK_UNAVAILABLE
id A    → SECURE_LINK_UNAVAILABLE
```

`seedRequest({ customerId: first.customerId })` reuses the identity, and the test
asserts the shared `customerId` before asserting the disjoint results — so the
isolation claim cannot pass by accident on two different customers.

Cross-reading request B with grant A is not merely refused, it is
**unrepresentable**: the command carries a token and nothing else, so there is no
second identifier for a check to disagree with.

---

## 10. Status / reason evidence

| State | Seeded as | Asserted |
|---|---|---|
| `NEW` | submission default | status `NEW`, no reason |
| `UNDER_REVIEW` | TR-LC11-02 transition row | status `UNDER_REVIEW`, no reason |
| `NEEDS_CLARIFICATION` | TR-LC11-03 with `reason` **and** `customer_visible_reason` | customer text returned; `INTERNAL-ONLY…` and `spam` absent from the whole serialized view |
| `REJECTED` | TR-LC11-10 with both fields | customer text returned; internal reason absent |
| `CANCELLED` | `cancelled_reason` + `cancelled_customer_reason` on the row | customer text returned; internal reason absent |
| superseded message | CLARIFY then back to `UNDER_REVIEW` | no reason — the earlier message does not resurface |
| `QUOTED` (APP6) | seeded directly | reported truthfully, no reason, no action |

---

## 11. Validation ledger

| Command | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=request-status.projection` | the projection unit spec created here | **18/18** | 1 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=custom-request-status.contract` | the published-contract spec created here | **8/8** | 2 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=request-status.integration` | the live-database suite created here | **27/27** | 3 |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns="request-status\|custom-request-status"` | all three B03 suites after the Prettier pass | **53/53**, 3 suites | 2 |
| `pnpm --filter @embroidery/api typecheck` | API source changed | **PASS** | 3 |
| `pnpm --filter @embroidery/api lint` | API source changed | **PASS** | 2 |
| `pnpm --filter @embroidery/api openapi:generate` | one operation added to the public surface | **52 paths / 57 operations / 115 schemas** | 1 |
| `pnpm --filter @embroidery/api openapi:check` | freshness, then re-checked after the Prettier pass | **up to date** | 2 |
| `pnpm --filter @embroidery/api-client generate` | the OpenAPI artifact changed | 2 files, tree hash `66d8f097…` | 1 |
| `pnpm --filter @embroidery/api-client check:generated` | freshness | **up to date** | 1 |
| `pnpm --filter @embroidery/api-client typecheck` | generated types changed | **PASS** | 1 |
| `pnpm exec prettier --write <4 files>` · `pnpm format:check` | global control | **PASS** | 1 |

### Reruns, and what changed between them

Every rerun followed a code change, per §15. The three integration reruns each
fixed a **fixture** defect the database refused and the code did not:
`RequestContextService` was not active (the real audit recorder needs a
correlation id), `uq_admin_accounts__status__active` permits one `ACTIVE` admin,
a request code derived from a UUIDv7 prefix collided on
`uq_custom_requests__code`, and `ck_secure_access_grants__revoke_reason_required`
refuses a revoked grant with no reason. No production code changed in response to
any of them. The contract rerun followed one assertion correction: the platform's
global `X-Request-ID` header parameter is present on every operation, so
"no parameters at all" was wrong and became "no path, query or cookie parameter,
and the only header is the platform correlation id".

### Explicitly not run

Confirmed **not** run, and not needed by anything B03 changed:

```text
B01 full submission tests            B01 duplicate-submit race
B02 upload / quota / cleanup suites  DB01 provenance / upgrade suites
full APP4 regression                 full API integration      full Jest
worker tests                         Playwright / E2E          Storefront / Admin tests
DB regression                        historical APP3 gates     tools/check-app3-p03.mjs
SonarQube                            all-workspace build / typecheck
```

`FU-APP5-B01-APP3-SURFACE-GATE-01` was not investigated.

### Two pre-existing red gates, disclosed not repaired

`tools/check-app4-b05.mjs` and `tools/check-app4-b06-contract.mjs` pin
`EXPECTED_OPERATIONS` at 53 and 52. Both were already failing at entry HEAD —
`APP5-B02` took the surface to 56 — so B03 is not their cause and, per
`VALIDATION_GOVERNANCE.md` §4, a closed checkpoint is not re-run merely because a
later one exists. They were read rather than run, to confirm B03's one additive
change to `customer.module.ts` does not violate what they assert about it:
`check-app4-b05.mjs` requires the exports list to *include* four names and to
*exclude* `SecureGrantNotifier`, and adding `AuthorizeSecureLink` does neither.
The stale counts are a pre-existing follow-up owned by whoever reconciles the
frozen APP4 gates.

---

## 12. OpenAPI / client

| Fact | Value |
|---|---|
| Generation runs | `openapi:generate` **once**; `api-client generate` **once** |
| Freshness | `openapi:check` and `check:generated` both **up to date** |
| Surface before → after | 51 paths / 56 operations / 109 schemas → **52 / 57 / 115** |
| Operation delta | exactly one added line matching `operationId`: `publicCustomRequest_status` |
| Deletions in generated files | **0** across all three (`0` removed lines in `openapi.generated.json`, `embroidery-api.ts`, `embroidery-api.schemas.ts`) — so no accepted operation id, path or schema was reissued |
| New schemas | `ReadCustomRequestStatusBody`, `CustomRequestStatusResponse`, `CatalogRequestSubjectResponse`, `CustomerOwnedRequestSubjectResponse`, `RequestQuantityLineResponse`, `RequestAssetResponse` |
| Client tree hash | `66d8f097df6009ff1b1e3ab2b408fb305ff8caa6dbe907c7b770c2ec56a76784` |

### Privacy inspection of the generated artifacts

Every added client property was enumerated. The complete new field set is
`token` (request) and `requestId, code, status, submittedAt, subject,
quantities, totalQuantity, assets, customerVisibleReason, accessExpiresAt` plus
the subject/line/asset members. No `storageKey`, `bucket`, `checksum`,
`mediaType`, `byteSize`, `tokenHash`, `grantId`, `customerId`, `sessionId`,
`challengeId`, `idempotencyKey`, `reason`, `cancelledReason`, `adminId`,
`actorKind` or `correlationId` appears anywhere.

**No token-shaped example is published.** `APP4-B05`'s report-hygiene rule is
applied to the contract itself: an example token would be rendered in Swagger UI
and pre-filled into "try it out". The contract spec asserts the absence.

---

## 13. Files changed

### Runtime — APP4 (additive only)

```text
apps/api/src/modules/customer/application/authorize-secure-link.service.ts   NEW
apps/api/src/modules/customer/customer.module.ts                            +1 provider, +1 export
```

### Runtime — Catalog (new narrow port)

```text
apps/api/src/modules/catalog/domain/repositories/catalog-subject.port.ts                 NEW
apps/api/src/modules/catalog/infrastructure/persistence/drizzle-catalog-subject.adapter.ts NEW
apps/api/src/modules/catalog/catalog.module.ts                                           +1 provider, +1 export
```

### Runtime — Ordering (B03 proper)

```text
apps/api/src/modules/order/domain/repositories/custom-request-status.repository.ts          NEW
apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request-status.repository.ts NEW
apps/api/src/modules/order/application/status/request-status.projection.ts                  NEW
apps/api/src/modules/order/application/status/read-grant-scoped-request.query.ts            NEW
apps/api/src/modules/order/presentation/schemas/custom-request-status.request.ts            NEW
apps/api/src/modules/order/presentation/schemas/custom-request-status.response.ts           NEW
apps/api/src/modules/order/presentation/public-custom-request-status.controller.ts          NEW
apps/api/src/modules/order/custom-request-status.module.ts                                  NEW
apps/api/src/openapi/operation-id.ts                                        +2 CONTROLLER_DOMAIN_KEYS entries
apps/api/src/bootstrap/app.module.ts                                        +1 module registration
```

`drizzle-custom-request.repository.ts` (391 lines) and every other `APP5-B01` /
`APP5-B02` runtime file are **unchanged**: the read model is a separate contract,
so the write side gained neither a method nor a line.

### Tests

```text
apps/api/src/modules/order/application/status/request-status.projection.spec.ts  NEW  183 lines
apps/api/src/modules/order/presentation/custom-request-status.contract.spec.ts   NEW  174 lines
apps/api/src/modules/order/tests/integration/request-status-context.ts           NEW  344 lines
apps/api/src/modules/order/tests/integration/request-status.integration.spec.ts  NEW  510 lines
```

### Generated

```text
packages/contracts/openapi/openapi.generated.json      +421 / -0
packages/api-client/src/generated/embroidery-api.ts    +24  / -0
packages/api-client/src/generated/embroidery-api.schemas.ts +200 / -0
```

### Documentation

```text
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md     §10.1 status table, endpoint-budget note
docs/implementation/SCOPED_COMMAND_INDEX.md            +CMD-TEST-APP5-B03-STATUS
docs/implementation/reports/APP5-B03-COMPLETION-REPORT.md   this file
```

All runtime source files are ≤ 400 lines and all test files ≤ 600 lines
(`CLAUDE.md` §6). No generated file was hand-edited.

---

## 14. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = INCOMPLETE  NEXT
APP5-B05  = INCOMPLETE
APP5-S01  = INCOMPLETE
APP5-S02  = INCOMPLETE
APP5-A01  = INCOMPLETE
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

`APP5-B04` was not started.

---

## 15. Residual risks

1. **The reason columns have no writer yet.** `APP5-B05` builds the moderation
   transitions, so `customer_visible_reason` and `cancelled_customer_reason` are
   populated only by fixtures today. The privacy rule is proved against real
   TBL-042 rows seeded exactly as B05 will write them, but B05 must confirm it
   writes the customer half on all three of `NEEDS_CLARIFICATION`, `REJECTED` and
   `CANCELLED` — `APP5-D01` residual risk 2 already flags that the design treats
   the two reason fields as separately required while `APP5-G01` §2 marks only
   `reason` as `R`.
2. **The abuse budget is per process.** `SecureLinkRateLimiter` uses the
   platform's in-memory sliding window, so counters reset on restart and are not
   shared across replicas — the documented, accepted limitation of every limiter
   in this repository, and unchanged by B03. A distributed replacement is APP12
   hardening. B03 shares `APP4-B06`'s dimension and key, so the two surfaces do
   not each grant a fresh budget.
3. **`APP5-S02` may want a thumbnail.** §6's catalog-media clause is permissive
   and B03 returns `productSlug` rather than a media reference (§6 above). If the
   approved `661:*` frames turn out to render product imagery, S02 needs either a
   deliberate publication-state-tolerant delivery decision or a fallback; B03
   invents neither, which is what §17 blocker #3 permits.
4. **An unresolvable catalog pair degrades silently.** If a product or variant row
   ever became unreadable, the subject reports `productName`/`productSlug` as
   absent rather than failing. That is the intended truthful behaviour, but it is
   indistinguishable in the response from a subject that never had labels — a
   distinction no customer-facing surface should draw, and one an operator reads
   from the request row instead.
5. **Two APP4 checker gates remain stale.** See §11. They were red at entry HEAD
   and are unrelated to B03's change; reconciling their frozen operation counts is
   still unowned.

---

## 16. Commit

```text
feat(app5): read one request through its secure grant
```

Not pushed.

---

```text
NEXT CHECKPOINT: APP5-B04 — Admin request queue & detail
```
