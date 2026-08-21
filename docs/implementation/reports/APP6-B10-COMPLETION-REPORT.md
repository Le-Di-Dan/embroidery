# APP6-B10 — Customer Secure Design Review Read + Agreement Publication

**Status:** `COMPLETE` — delivered for review
**Predecessor:** `APP6-B09` = `PASS`, commit `4b1bb17`
**Local commit:** `863765c` (not pushed)
**Next checkpoint:** `APP6-B11`

---

## 1. Entry

| Check | Result |
|---|---|
| `4b1bb17` reachable | Yes — `git cat-file -t 4b1bb17` → `commit`; `4b1bb17 feat(app6): deliver APP6-B09 design version send for review`, reachable from `production` HEAD `198fddc` |
| Working tree at entry | Clean (`git status --porcelain` empty) |
| B07/B08/B09 operation ids | Unchanged — asserted in the contract suite and in the OpenAPI semantic diff (§7) |
| B09 active-review seam | `DesignCaseRepository.findVersionInReview` (status `SENT_FOR_REVIEW`, arbitrated by `uq_design_versions__case__sent_for_review`) |
| B04 secure-link pattern | `AuthorizeSecureLink` + token-only strict body + uniform 404, `PublicQuotationController` / `ReadCurrentQuotation` |
| Agreement persistence | `AgreementRepository.effectiveVersions` / `publishVersion` / `ensureAgreement` / `addVersion` — all delivered, none re-implemented |
| Bootstrap publication precedent | `staff-bootstrap.ts` → `PublishApp4PolicyUseCase`, `PublishApp6PolicyUseCase`, both gated on a resolved Admin id |
| G01-C1 §5.5–§5.6 | Read at execution time from `docs/implementation/audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md`; 11 + 12 sentences, Vietnamese |
| P01 DesignDocument publication | `applyDesignDocumentSchemas` + the `x-embroidery-published-schema` marker (`APP3-B08-C1`), one `DesignDocument` component |

---

## 2. The one HTTP operation

```text
POST /api/public/design-reviews/current
→ publicDesignReview_current
```

- **One** new operation. `PublicDesignReviewController` derives its own domain key
  from the class name, so **no `CONTROLLER_DOMAIN_KEYS` entry was added** and no
  accepted operation id was reissued.
- **POST, not GET.** `ADR-APP4-001` §11 makes the URL fragment the only browser
  carrier and declares a path or query carrier `FORBIDDEN`; a `GET` would write
  the token to the gateway log, the application log, every proxy and the
  `Referer`.
- **Body-only credential.** The contract suite asserts the operation's parameter
  list is exactly `['header:X-Request-ID']` — no path, query or cookie parameter
  — and that the path contains no `{`.
- **Nothing about the target is accepted.** `ReadCurrentDesignReviewBody` is
  `.strict()` with one property. The suite asserts the absence of
  `designVersionId`, `versionId`, `designCaseId`, `requestId`, `code`,
  `customerId`, `grantId`, `scopeKind`, `challengeId`, `agreementVersionId`,
  `acceptedAgreements` and `documentHash`.
- **No example token** is published.
- The public base path holds exactly one route; no history, no list, no second
  resolve endpoint, no identified read.

---

## 3. `AuthorizeSecureLink` path

```text
ReadCurrentDesignReview.read
  → AuthorizeSecureLink.authorize(request, token)
      → SecureLinkPolicyReader.require()      (published policy, fail-closed)
      → SecureLinkRateLimiter.check(...)      (the same budget B04 charges)
      → ResolveSecureLink.resolve({ token })  (digestSecret, REQUEST_ACCESS only)
  → ResolvedSecureLink.customRequestId
```

`CustomerDesignReviewModule` imports `CustomerModule` for that one capability.
It does **not** query `secure_access_grants`, call `digestSecret`, duplicate rate
limiting, define a scope kind, or issue / reissue / rotate / revoke a grant —
none of which is reachable from its injector. `REQUEST_ACCESS` remains the only
scope; the resolver hard-codes it.

---

## 4. The resolution chain, and what is deliberately not in it

```text
REQUEST_ACCESS grant
  → admission.link.customRequestId
  → CustomRequestDesignContextPort.findDesignContext(requestId)   (unlocked)
  → context.currentDesignCaseId                                   (APP6-B08 set it)
  → DesignReviewPort.findReviewCase(caseId)
  → DesignReviewPort.findVersionInReview(caseId)                  (SENT_FOR_REVIEW)
  → requireSendEvidence(version)                                  (hash + instant)
```

Proved rather than assumed, both directions:

```text
designCase.customRequestId  === request id from the grant   (G-DB7-09, read side)
reviewVersion.designCaseId  === designCase.id
reviewVersion.status        === SENT_FOR_REVIEW              (the port's own predicate)
reviewVersion.documentHash  !== undefined
```

### `current_version_id` is not the review authority

`design_cases.current_version_id` is **never read** on this path. The narrow
`DesignReviewPort` offers no method that returns it, and
`drizzle-design-review.adapter.ts` does not name the column in either
projection. There is no `orderBy`, no `max(version)`, no `created_at` sort and
no caller-supplied version id anywhere in the chain.

**The focused negative** (`customer-design-review.integration.spec.ts`, "returns
the older SENT_FOR_REVIEW version while the pointer names a newer DRAFT"): a case
with version 3 `SENT_FOR_REVIEW` and version 4 `DRAFT`, the case pointer moved to
4. The read returns version 3's id and document, is asserted **not** to return
4's, and the pointer is re-read afterwards and confirmed still to name 4.

A later legitimate send is visible on a fresh read with nothing pinned
("shows a later legitimate send on a fresh read"): the same token returns
version 1, then version 2 with its own hash after the workshop supersedes and
re-sends.

A case with four versions in `DRAFT` / `REVISION_REQUESTED` / `SUPERSEDED` /
`APPROVED` and none in review is refused, identically to an unknown token.

---

## 5. The document and the hash

| Claim | Evidence |
|---|---|
| Catalog **v1** document readable | Deep equality against the seeded fixture, `documentSchemaVersion` = 1 |
| COP **v2** document readable | Deep equality, `documentSchemaVersion` = 2, and both v2 placement discriminators asserted still `null` |
| No migration or rewrite on read | The adapter selects `design_document` and the controller passes the value through; there is no clone, no `JSON.parse(JSON.stringify(...))`, no canonicalizer on the read path |
| Hash is the **stored** B09 value | `documentHash` compared to the exact seeded row value; the query has no hashing import at all |
| Row untouched by the read | `status`, `document_hash`, `sent_at`, `design_document` re-read after the call and compared to a `before` snapshot |
| One published `DesignDocument` component | Contract suite: `document` resolves to `allOf: [$ref: '#/components/schemas/DesignDocument']`, and the schema names matching `/^DesignDocument/` are exactly `['DesignDocument']` |

A test **does** recompute a hash independently — but only over agreement content,
as an integrity assertion (§8). Nothing recomputes a *document* hash.

---

## 6. Privacy, rendering and `no-store`

- `Cache-Control: no-store` is set on the success path
  (`REVIEW_CACHE_CONTROL`), and documented on the `200` response; the contract
  suite asserts the documented header.
- No rasterization, no Sharp, no preview derivative, no preview hash, no export
  or download route, no screenshot claim.
- No storage key, bucket, object key, provider URL, derivative id or asset id in
  the response — asserted by name in the contract suite, plus a serialized
  `/s3|bucket|presigned/i` scan of the whole path item.
- `CustomerDesignReviewModule` imports **no** `AssetModule` and **no**
  `ObjectStorageModule`, so no byte path is reachable from this surface at all.
- The Design Document body is never logged: the query and controller contain no
  logger, and the platform request logger records no body.
- Rendering stays `safe DesignDocument → APP3 native SVG → APP3-S09 watermark →
  APP6-S02`. B10 adds no renderer.

---

## 7. OpenAPI / client — one controlled cycle

| Step | Result |
|---|---|
| Focused API typecheck | `pnpm --filter @embroidery/api typecheck` — clean, before generation |
| Contract suite | 14/14, before the generation slot was spent |
| OpenAPI generate (once) | `69 paths / 76 operations / 159 schemas` |
| Semantic diff | Added ops: `['publicDesignReview_current']`. Removed: `[]`. Changed paths: `[]`. Added schemas: `CustomerDesignReviewResponse`, `DesignReviewAgreementResponse`, `ReadCurrentDesignReviewBody`. Removed: `[]`. `DesignDocument` components: `['DesignDocument']` |
| Raw diff | `306 insertions(+), 0 deletions(-)` — pure addition |
| OpenAPI check | up to date |
| Client generate (once) | 2 files, tree hash `176f6063…3cbdc1` |
| Generated-client check | up to date, same tree hash; `71 insertions(+), 0 deletions(-)` |
| Affected typechecks | `@embroidery/api`, `@embroidery/api-client`, `@embroidery/database` — all clean |

```text
operations 75 → 76        (agreement publication adds 0)
paths      68 → 69
schemas   156 → 159
```

The generated client types `document: DesignDocument`, not an unbounded map.
**No Admin agreement-publish endpoint exists** — the contract suite asserts zero
paths and zero operation ids matching `/agreement/i` anywhere in the document.

---

## 8. Agreement content publication

### Source

`packages/database/seed/app6-agreement-content.seed.json` — a committed data
file, generated **from the authority document** so it is verbatim by
construction. Read by `loadApp6AgreementContentDataset`
(`packages/database/src/seed/app6-agreement-content-dataset.ts`), a structural
validator that restates no sentence. Both mirror the `APP6-G01` policy dataset /
`APP6-B01` reader precedent exactly; no seed framework, no schema change, no new
dependency.

### Verbatim proof

`app6-agreement-content-dataset.spec.ts` **re-extracts** §5.6.1 and §5.6.2 from
`APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md` at test time and compares
them to the committed content with `toBe`. A copy of the sentences in the test
would have been a third place the policy lived; extracting them makes "published
verbatim" a fact about the authority document. Also asserted: 11 and 12
sentences, `language = 'vi'`, no `DESIGN_APPROVAL_TERMS` anywhere, and — because
`ADR-DB3-002`'s refund **amounts** are deferred (`IMP-O008`, owner APP9) — that
the return policy contains no percentage and no currency figure outside its
sentence labels. No fee, refund number, warranty, waiver, timing promise,
cancellation right or exception was drafted.

### Architecture

```text
staff-bootstrap.ts (the one Admin-bearing path)
  → BootstrapStaffUseCase.ensure(...) → result.adminId
  → PublishApp4PolicyUseCase.publish(adminId)
  → PublishApp6PolicyUseCase.publish(adminId)      (which types are required)
  → PublishApp6AgreementsUseCase.publish(adminId)  (what those types say)   ← new
```

`PublishApp6AgreementsUseCase` lives on `ContentModule` — Content owns AGG-21
(`DB2_BOUNDED_CONTEXT_MAP`), while `PolicyModule` publishes
`policy_configurations` and nothing else. It publishes through the delivered
`AgreementRepository` only; there is no raw SQL and no second repository.
`ContentModule` was registered in `AppModule` so the CLI can reach it; it
declares no controller, so **zero HTTP operations** were added.

`adminId` is required and validated, and deliberately **not stored**: TBL-069
carries no actor column (unlike `policy_configuration_versions`), so recording
it would be a schema change B10 does not own. Requiring it in the signature is
what keeps publication on the Admin-bearing seam rather than reachable from the
worker or a request. A blank id is refused and writes nothing — asserted.

Ordering is deliberate: the policy (which types are required) publishes before
the content (what they say), so a boot that fails partway leaves a known
required set with missing content — which the read fails closed on — rather than
content nothing requires.

### Idempotency and history

| Case | Behaviour | Evidence |
|---|---|---|
| Missing | `ensureAgreement` → `addVersion` → `publishVersion`, one transaction per type | version 1, `PUBLISHED`, current pointer set, container name from the dataset |
| Identical rerun | Nothing appended | Three bootstraps → two rows; full row set compared with `toEqual` |
| Reported outcome | `unchanged`, same version and hash | second `publish()` returns `['unchanged','unchanged']`, versions `[1,1]` |
| Content drift | Immutable successor appended, pointer advanced | Drift injected in a **fixture dataset** (the delivered `resolvePackageJson` hook), not in the row: `PAYMENT_POLICY` → version 2 `PUBLISHED`; version 1 keeps its exact content and hash and becomes `SUPERSEDED`; `RETURN_POLICY` reports `unchanged` and stays at one row |
| Editing history | Impossible | The S24 immutability trigger refuses an `UPDATE` on a published version even from raw SQL — asserted, and the reason the drift test changes the dataset instead |

The comparand is the **content hash**, not the text: `content_hash` is exactly
what `GRD-008` binds an approval to, so "unchanged" means unchanged to the thing
acceptance is bound by. Hashing uses the delivered `sha256Hex` convention
(`sha256:<64 hex>`, `CST-070`) — no second algorithm. The publication suite
recomputes each stored hash independently and asserts the format.

---

## 9. The effective agreement set

```text
DesignApprovalAgreementsPolicyReader.require()
  → design_approval.agreements → requiredAgreementTypes, in published order
AgreementRepository.effectiveVersions(types, AuditClock.now())
  → PUBLISHED, effective_from <= now, joined through agreements.current_version_id
    (SUPERSEDED and WITHDRAWN excluded structurally)
per required type: exactly one, or refuse
```

- **Read from policy, never a second allow-list.** The domain file names no
  agreement type; `DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY` is the only literal.
  Proved by publishing a one-type policy and observing the read return one term.
- **`[PAYMENT_POLICY, RETURN_POLICY]`** is the delivered required set, from the
  `APP6-G01` dataset. **No `DESIGN_APPROVAL_TERMS` agreement** exists — asserted
  in both the dataset suite and the publication suite.
- **Deterministic order** — the published required-type order, imposed by the
  reader rather than taken from the `IN (...)` result, which PostgreSQL does not
  order.
- **Returned per type**: `agreementVersionId`, `agreementType`, `version`,
  `contentHash`, `language`, `content` — each asserted equal to the persisted
  `agreements ⋈ agreement_versions` current row, with `status = 'PUBLISHED'`.
- **B10 records no acceptance.** No `approval_snapshot_agreement_acceptances`
  row, and none is reachable.

### Fail-closed matrix

| Condition | Outcome |
|---|---|
| Required policy missing / pointer cleared | `503`, asserted |
| Required policy malformed (non-array, empty, blank or duplicate member) | `503` (parser) |
| A required type with no content published | `503`, asserted |
| A required type withdrawn (pointer cleared) | `503`, asserted |
| Zero or more than one effective version for a type | `503` |
| Missing hash or blank content | `503` |

None of these silently omits or substitutes a term, and none is disguised as an
invalid token. The `503` names no policy key and no agreement type. The agreement
set is resolved **after** the review target, so an unconfigured deployment
cannot answer `503` to a token that would otherwise have got `404` — which would
make the 503 a grant-existence oracle.

---

## 10. Uniform secure-target 404

Every one of these leaves as `404 SECURE_LINK_UNAVAILABLE`, identical in status,
code, message and shape:

| Cause | Tested |
|---|---|
| Unknown token | ✔ |
| Expired grant | ✔ |
| Revoked grant | ✔ |
| Superseded grant / wrong scope | Structurally — `resolveActiveByTokenDigest` returns `undefined` for all six causes and cannot tell them apart |
| Request row unreadable | Same branch as an unset pointer |
| No design case pointer | ✔ |
| Dangling case pointer | **Unrepresentable** — `fk_custom_requests__current_design_case_id` refuses the delete; asserted directly, and the code's `undefined` branch is defence in depth |
| Case belonging to another request | ✔ (pointer repointed at a foreign case; refused) |
| No active review | ✔ |
| Review version not owned by the case | Guarded in the query |
| Sent version missing hash or instant | Guarded (`requireSendEvidence`) |
| One customer's link seeing another's design | ✔ (explicit cross-customer negative) |

No `DESIGN_CASE_UNRESOLVED`, `DESIGN_VERSION_NOT_FOUND`, `REVIEW_ALREADY_ACTIVE`,
`DESIGN_REVIEW_TERMS_UNAVAILABLE`, grant reason, id, SQL or constraint detail
appears in the published document — asserted. No diagnostic follow-up query runs
after a definitive refusal. `400`, `429`, `503` and the platform `500` keep their
own meanings; the documented status set is exactly
`['200','400','404','429','500','503']`, matching B04.

---

## 11. Read-only, and no step-up

| Claim | Evidence |
|---|---|
| No transition, review, snapshot, acceptance, outbox, notification or challenge row appended | Before/after counts on all seven tables |
| Grant not consumed | Three reads; `status = ACTIVE`, `revoked_at` null, `expires_at` unchanged |
| No pointer advanced, no status moved | Case `current_version_id` left `null` after a read; request status unchanged |
| Version row untouched | Full-column before/after comparison |
| No step-up required or consumed | `contact_verification_challenges` is empty before and after, and the read succeeds |
| Structurally unable to write | `CustomerDesignReviewModule` imports no `DatabaseModule` (so no `TransactionManager`, no executor, no `OutboxEventStore`), no `DesignModule`, no `ContentModule`, no `OrderModule`, no `AuditModule`, no grant issuer, no notification module. `DesignReviewReadModule` absorbs `DatabaseModule` and `ContentModule` and re-exports neither |

Agreement publication is startup work on the CLI seam and never runs inside the
public read.

---

## 12. `FU-APP6-B09-CASE-REPO-SIZE-01`

**Closed without touching the file.** `drizzle-design-case.repository.ts` is
still 399 lines and shows no modification. B10 reads through a new narrow
read-only port (`design-review.port.ts`, 85 lines) and its own adapter
(`drizzle-design-review.adapter.ts`, 102 lines) — the read-projection seam the
follow-up named as preferred. That also buys the security property: the public
module never holds `createVersion`, `sendForReview`, `recordReview`,
`setCurrentVersion` or `supersede`.

Kept untouched as directed: `FU-APP6-B08-P01-GATE-01`, `FU-APP6-DB01-01`, the
`APP6-A02` exact-version question. No migration generated, no APP3 historical
gate touched.

---

## 13. Database

```text
DATABASE MIGRATION = NONE
```

36 migrations before and after; `git status packages/database/migrations` is
empty. No column, CHECK, index, table or grant scope was added.

---

## 14. Test ledger

| Suite | Command | Result |
|---|---|---|
| B10 published contract | `pnpm --filter @embroidery/api exec jest src/modules/design/presentation/public-design-review.contract.spec.ts` | 14 passed |
| B10 read, end to end | `… jest --runInBand src/modules/design/tests/integration/customer-design-review.integration.spec.ts` | 23 passed |
| Agreement publication | `… jest --runInBand src/modules/design/tests/integration/app6-agreement-publication.integration.spec.ts` | 7 passed |
| Agreement + policy datasets | `pnpm --filter @embroidery/database exec jest src/seed/app6-agreement-content-dataset.spec.ts src/seed/app6-policy-dataset.spec.ts` | 13 passed |
| Bootstrap / CLI (changed file) | `pnpm --filter @embroidery/api exec jest src/cli src/bootstrap` | 30 passed |
| Typecheck | `pnpm --filter @embroidery/{api,api-client,database} typecheck` | clean |
| Lint | `pnpm --filter @embroidery/{api,database} lint` | clean |
| Prettier | `npx prettier --write` over the changed trees | applied |
| Whitespace | `git diff --check` | clean |
| OpenAPI | `CMD-API-OPENAPI-GENERATE` ×1, `CMD-API-OPENAPI-CHECK` ×1 | §7 |
| Client | `CMD-API-CLIENT-GENERATE` ×1, `CMD-API-CLIENT-CHECK` ×1 | §7 |

### Justified reruns

- The three B10 API suites were re-run **once** after Prettier reformatted them
  (44 passed together), because the formatter edited the files under test.
- The contract suite ran before generation and again in that combined run.

### Deliberately not run

`packages/design-document` (unchanged — its 183-test suite was **not** run and
its schema was **not** regenerated); B09 send / race / atomicity; B03–B06 suites;
the B04 full integration suite; APP3 session / P01 / P02 suites; the full API and
repository suites; worker; frontend; Playwright; DB global gates; migration
checks; Figma; Sonar. None of their owned sources changed.

`SCOPED_COMMAND_INDEX.md` was **not** updated: B10 introduces no new reusable
command or checker — every command above is an existing indexed entry or a
direct focused `jest` invocation.

---

## 15. Files

**New — runtime**

```text
apps/api/src/modules/design/domain/repositories/design-review.port.ts
apps/api/src/modules/design/domain/review/design-approval-agreements.policy.ts
apps/api/src/modules/design/domain/review/design-review.errors.ts
apps/api/src/modules/design/infrastructure/persistence/drizzle-design-review.adapter.ts
apps/api/src/modules/design/infrastructure/policy/design-approval-agreements-policy.reader.ts
apps/api/src/modules/design/application/review/customer-design-review.view.ts
apps/api/src/modules/design/application/review/effective-agreements.reader.ts
apps/api/src/modules/design/application/review/read-current-design-review.query.ts
apps/api/src/modules/design/presentation/public-design-review.controller.ts
apps/api/src/modules/design/presentation/schemas/public-design-review.request.ts
apps/api/src/modules/design/presentation/schemas/public-design-review.response.ts
apps/api/src/modules/design/customer-design-review.module.ts
apps/api/src/modules/design/design-review-read.module.ts
apps/api/src/modules/content/application/publish-app6-agreements.use-case.ts
packages/database/src/seed/app6-agreement-content-dataset.ts
packages/database/seed/app6-agreement-content.seed.json
```

**New — tests**

```text
apps/api/src/modules/design/presentation/public-design-review.contract.spec.ts
apps/api/src/modules/design/tests/integration/customer-design-review-context.ts
apps/api/src/modules/design/tests/integration/customer-design-review.integration.spec.ts
apps/api/src/modules/design/tests/integration/app6-agreement-publication.integration.spec.ts
packages/database/src/seed/app6-agreement-content-dataset.spec.ts
```

**Modified**

```text
apps/api/src/bootstrap/app.module.ts          ContentModule + CustomerDesignReviewModule
apps/api/src/cli/staff-bootstrap.ts           third publisher on the Admin-bearing seam
apps/api/src/modules/content/content.module.ts  publisher provider + export
packages/database/src/index.ts                dataset reader exports
packages/contracts/openapi/openapi.generated.json   +306 / −0
packages/api-client/src/generated/*                 +71 / −0
```

Every runtime file is ≤ 400 lines and every test file ≤ 600 (largest: the
read integration suite at 557).

---

## 16. Follow-ups

| Id | Disposition |
|---|---|
| `FU-APP6-B09-CASE-REPO-SIZE-01` | **CLOSED** — B10 added no method to the 399-line adapter; the read went to a new narrow port (§12) |
| `FU-APP6-B08-P01-GATE-01` | `NONBLOCKING_PREEXISTING / OUTSIDE_B10` — untouched |
| `FU-APP6-DB01-01` | Deferred to the next real database-change checkpoint — untouched |
| `APP6-A02` exact-version Admin detail | Future bounded question — untouched |
| `FU-APP6-B10-AGREEMENT-ACTOR-01` | **NEW, non-blocking.** `agreement_versions` records no publishing Admin, unlike `policy_configuration_versions.created_by_admin_id`. B10 requires a resolved Admin id in the publisher signature but cannot persist it without a schema change. If agreement-publication attribution is wanted in the record, it belongs to a future database-change checkpoint |

---

## 17. Verdict

```text
APP6-B09 = ACCEPTED
APP6-B10 = COMPLETE
HTTP OPERATIONS ADDED = 1
PUBLIC METHOD = POST
SECURE TOKEN = BODY ONLY
REQUEST_ACCESS = REUSED
NEW GRANT ISSUANCE = NONE
CUSTOMER/REQUEST AUTHORITY = GRANT-DERIVED
DESIGN CASE = REQUEST-POINTER-DERIVED
ACTIVE REVIEW = SENT_FOR_REVIEW-ARBITER-DERIVED
CURRENT_VERSION_ID AS REVIEW AUTHORITY = NOT READ (no port method exposes it)
EXACT REVIEW VERSION = RETURNED
CATALOG V1 DOCUMENT = READABLE
COP V2 DOCUMENT = READABLE
DOCUMENT HASH = STORED B09 HASH
DOCUMENT REWRITE = NONE
SERVER RASTER / PRIVATE ORIGINAL / STORAGE LEAK = NONE
CACHE-CONTROL = NO-STORE
REQUIRED AGREEMENT TYPES = PAYMENT_POLICY + RETURN_POLICY
DESIGN_APPROVAL_TERMS AGREEMENT = ABSENT
G01-C1 §5.6 CONTENT = PUBLISHED VERBATIM
AGREEMENT PUBLICATION = IDEMPOTENT / APPEND-ONLY
EFFECTIVE AGREEMENT SET = EXACT / COMPLETE
AGREEMENT IDS + HASHES + CONTENT = RETURNED
READ STEP-UP = NOT REQUIRED
SECURE/TARGET UNAVAILABLE = ONE 404 / SECURE_LINK_UNAVAILABLE
PUBLIC READ SIDE EFFECTS = NONE
DATABASE MIGRATION = NONE
B11 = NOT STARTED
NEXT = APP6-B11
```
