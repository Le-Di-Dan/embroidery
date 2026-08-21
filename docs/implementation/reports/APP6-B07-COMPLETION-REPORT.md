# APP6-B07 — Admin Submitted-Design Read — Completion Report

```text
APP6-B06 = ACCEPTED
APP6-B07 = COMPLETE
HTTP OPERATIONS ADDED = 1
ADMIN SUBMITTED-DESIGN READ = DELIVERED
AUTHORITY = AUTHENTICATED ADMIN + REQUEST-BOUND POINTER
CALLER SESSION ID = ABSENT
SESSION SECRET = NOT REQUIRED / NOT FABRICATED
SUBMITTED_SESSION_ID = PROVENANCE ONLY
EXACT POINTED SESSION = ENFORCED
DESIGN DOCUMENT = CONCRETE P01 AUTHORITY
COP SOURCE = EMPTY / SUCCESS
MISSING OR PURGED SESSION = EMPTY / SUCCESS
FOREIGN SESSION SUBSTITUTION = ABSENT
SERVER RASTER PREVIEW = ABSENT
STORAGE/SECRET LEAK = ABSENT
CACHE-CONTROL = NO-STORE
READ SIDE EFFECTS = NONE
DATABASE MIGRATION = NONE
FU-APP5-B04-DESIGN-PREVIEW-01 = CLOSED_BY_APP6_B07
B08 = NOT STARTED
NEXT CHECKPOINT = APP6-B08
```

---

## 1. Entry state

| Fact | Value |
|---|---|
| Entry `HEAD` | `613e6c04258670b1f77bfdaf227678044737bca2` (`docs(app6): record the APP6-B06 commit hash in its completion report`) |
| Branch | `production` |
| Working tree at entry | clean — `git status --porcelain` produced no output |
| `bf7e6fa` reachable from `HEAD` | **yes** — `git merge-base --is-ancestor bf7e6fa HEAD` exited 0 |
| Predecessor verdict applied | `APP6-B06 = PASS`, `CORRECTION = NONE` |

No unrelated user change was present, so the commit below is a clean
path-scoped commit of this checkpoint's work only.

### 1.1 What was inspected before any edit

- `APP5-B04`'s Admin request detail — its controller, its module's deliberate
  exclusion of `OrderModule`, and the `AdminRequestDetailRow.submittedSessionId`
  it already publishes as `subject.designSessionId`;
- `APP5-B06`'s private request-asset delivery module, for the precedent that a
  third surface on the same base path is a third **module**;
- `APP5-B01`'s `submit-custom-request.use-case.ts`, which is where
  `submittedSessionId: session?.id` is written at submission — and where a COP
  submission writes nothing;
- `DesignSessionRepository.findById` and the whole AGG-09 write contract, which
  is what this checkpoint had to avoid injecting;
- the real `design_sessions` row (TBL-025): `submitted_request_id` is handover
  evidence with **no FK**, and the family is hard-deleted after TTL;
- `APP3-B08-C1`'s concrete `DesignDocument` OpenAPI publication
  (`openapi/design-document-schema.augmentation.ts`) and its single existing
  consumer, `DesignSessionSnapshotResponse`;
- the existing read-module seams: `CustomRequestQuotationPointerModule`
  (`APP6-B04`), `QuotationReadModule` (`APP6-B02`) and
  `CatalogPlacementReadModule` (`APP3-B07`).

---

## 2. The published operation

```text
GET /api/admin/custom-requests/{requestId}/submitted-design
    operationId = adminCustomRequestSubmittedDesign_get
    guard       = AuthenticatedAdminGuard   (APP1-B01, unchanged)
    body        = none
    query       = none
    path        = requestId (uuid) only
```

The id is **derived**, not declared: `AdminCustomRequestSubmittedDesignController`
minus the `Controller` suffix, lower-camelled, plus the `get` method name. No
`CONTROLLER_DOMAIN_KEYS` entry was added — that table exists to hold classes
split for *file-layout* reasons inside one published domain, and this is a
different published surface with its own response contract and its own
dependency. Adding an entry would have folded it into `adminCustomRequest`, which
is the opposite of what §3 asks for.

Nothing else was published: no `/design-sessions/{sessionId}`, no generic session
lookup, no preview-render route, no asset route, no version route and no metadata
companion. The contract suite asserts that **no** Admin path anywhere in the
document contains the word "session".

---

## 3. The authority chain

```text
Authenticated Admin (APP1 cookie session, guard-derived, never a parameter)
  -> resolve the exact request by the requestId in the path
       absent      -> 404 REQUEST_NOT_FOUND      (the canonical Admin answer)
  -> read the server-owned custom_requests.submitted_session_id
       NULL        -> 200, submittedDesign = null
  -> find that exact Design Session, correlated back to this request and
     still SUBMITTED
       no row      -> 200, submittedDesign = null
       otherwise   -> 200, the persisted document
```

Four properties, each structural rather than conventional:

1. **The caller supplies no session id.** There is no `sessionId` path segment,
   query parameter or body field on the operation — the contract suite asserts
   its absence in every parameter position, and the operation has no request body
   at all. A foreign session cannot be *requested*, so it never has to be refused.
2. **No session secret is required, fabricated or rotated.** `APP3`'s public
   bootstrap and resume paths are not called, no fake customer context is
   constructed to call them, and `session_secret_hash` is neither a parameter of
   the new Design port nor a column it projects. The Admin proves nothing about
   the anonymous Session credential because nothing here asks for one.
3. **`submitted_session_id` is provenance.** It is read only *after* the request
   itself has been authorised and resolved; it selects the source and authorises
   nothing.
4. **The pointer is correlated, not trusted.** The Design port requires *both*
   ids and the SQL asserts `submitted_request_id = :requestId`. The request must
   name the session and the session must name the request back.

---

## 4. Composition — what the read cannot reach

Two new one-port modules were added rather than importing either aggregate:

| Module | Exports | Why not the aggregate module |
|---|---|---|
| `CustomRequestDesignSourceModule` (Ordering) | `CUSTOM_REQUEST_DESIGN_SOURCE_PORT` — one method, returns two ids | `OrderModule` exports `CUSTOM_REQUEST_REPOSITORY`, which carries `submit`, `transition`, `lockById` and `setCurrentQuotation` |
| `DesignSubmittedSourceReadModule` (Design) | `SUBMITTED_DESIGN_SOURCE_REPOSITORY` — one method, returns one document | `DesignModule` exports `DESIGN_SESSION_REPOSITORY` (`saveDocument`, `advanceRevision`, `rotateSecret`, `attachAsset`, `submit`, `expire`) **and** the whole anonymous Session authorization stack including `DESIGN_SESSION_AUTH_CONFIG`'s pepper |

Both follow precedents this repository already set — `APP6-B04`'s
`CustomRequestQuotationPointerModule` for the first, `APP3-B06C`'s
`DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY` and `APP3-B07`'s
`CatalogPlacementReadModule` for the second. A second Ordering pointer contract
was written rather than widening the quotation one because that one is consumed
by `APP6-B04`'s **public** customer surface.

`CustomRequestSubmittedDesignModule` imports exactly three modules —
`IdentityModule`, and the two above. It does **not** import `DatabaseModule`, so
no `TransactionManager` and no executor is injectable: a write could not be added
to this surface without editing the module file. There is no design case or
version repository, no approval-snapshot repository, no quotation repository, no
grant issuer, no asset repository, no object-storage client, no audit recorder and
no outbox in reach. `transition()` is unreachable from this module graph.

Ownership did not move. The `custom_requests` statement is Ordering's, the
`design_sessions` statement is Design's, and Ordering consumes the latter as a
port (`BACKEND_CONVENTIONS.md` §10).

---

## 5. Response contract

```jsonc
{
  "submittedDesign": null | {
    "sessionId": "uuid",
    "document": DesignDocument,   // $ref to the generated APP3-P01 component
    "documentSchemaVersion": 1,
    "revision": 7
  }
}
```

`document` carries the `APP3-B08-C1` publication marker and the augmentation
resolves it to `allOf: [{ $ref: "#/components/schemas/DesignDocument" }]` — the
**same** component `DesignSessionSnapshotResponse` references, asserted
identical in the contract suite. No field of the Design Document is restated
anywhere in this checkpoint, and the generated client types the property as
`document: DesignDocument` rather than an unbounded map.

`submittedDesign` is nullable rather than optional so a client reads one
discriminator; Orval emits
`submittedDesign: AdminSubmittedDesignSourceResponse | null`.

`sessionId` is included: it is the value `APP6-B08` needs to bind the first
Design Version to its source, it is already visible to an operator through
`APP5-B04`'s detail, and no route accepts it as an input.

**Absent, and asserted absent:** session secret or hash, token, digest, pepper,
cookie or auth material; storage key, bucket, provider URL or presign; checksum;
customer credential or identity; APP3 auth context; grant token; idempotency key;
server-rendered preview; raster derivative; private source asset; document hash.
The contract suite matches a forbidden-substring list case-insensitively over
both new components and the operation, and the integration suite searches a live
response for a synthetic marker written into the seeded `session_secret_hash`
**and** into the placement background's `storage_key`.

---

## 6. Catalog vs COP, and every absence

| Case | Result | Proved by |
|---|---|---|
| Catalog request + valid pointed submitted session | `200`, concrete document, exact `sessionId`, schema version, revision | integration §"the catalog source" |
| Catalog request + a second submitted session belonging to another request exists | `200`, **its own** session; the other's document never appears | integration, marker-based |
| Catalog request pointing at another request's `SUBMITTED` session | `200`, `null` | integration §"honest absence" |
| Catalog request + pointed session hard-deleted | `200`, `null` | integration §"honest absence" |
| Catalog request + pointed session reverted to `ACTIVE` | `200`, `null` | integration §"honest absence" |
| COP request (`submitted_session_id` NULL, no session by design) | `200`, `null` | integration §"honest absence" |
| Unknown request id | `404 REQUEST_NOT_FOUND` | integration §"the outer request" |
| Malformed request id | `400` | integration §"the outer request" |
| No Admin session / a token never minted | `401` | integration §"authorization" |

Nothing is fabricated for the empty cases: no Catalog placement, no Design
Session, no blank document, no Catalog default and no substituted "latest"
session. No `DESIGN_SESSION_NOT_FOUND`, APP3 secret/auth error, database
diagnostic or storage error reaches the caller — asserted directly, by searching
an empty-case response body for `DESIGN_SESSION`.

Session-state defensiveness is one `WHERE` clause: only a row still in
`SUBMITTED` is truthful submitted evidence, and an `ACTIVE`, `EXPIRED` or
`DELETED` row is indistinguishable from a purged one. No session state is
mutated.

---

## 7. Privacy, caching and rendering

- `Cache-Control: no-store` on the operation, asserted on both the populated and
  the empty response.
- No session identifier travels in a query string — the operation has **no query
  parameter at all**.
- The document body is not logged. Platform request logging is unchanged and the
  suite's captured log lines carry route, method, status and duration only.
- Nothing rasterizes, uses Sharp, creates a preview derivative or hash, or offers
  a download or export. Rendering authority is unchanged: safe formal
  `DesignDocument` → the APP3 native-SVG renderer → the `APP3-S09` runtime
  watermark → the UI. The `200` publishes `application/json` and nothing else,
  asserted in the contract suite.

---

## 8. Zero side effects

The read is structurally incapable of writing (§4), and it is also observed not
to:

- the `custom_requests` row (`status`, `submitted_session_id`, `updated_at`) and
  the `design_sessions` row (`status`, `autosave_revision`, `design_document`,
  `document_schema_version`, `submitted_request_id`, `last_activity_at`,
  `updated_at`) are byte-identical across **two** consecutive reads;
- `custom_request_transitions`, `request_moderation_notes`, `design_cases`,
  `design_versions`, `approval_snapshots`, `outbox_events` and `audit_events` are
  counted before and after and are unchanged — compared rather than asserted
  zero, since a table that was already empty proves nothing.

No migration. No schema change of any kind: every column read already existed.

---

## 9. B08 boundary

B07 creates no Design Version, canonicalizes and hashes nothing for review,
widens `packages/design-document` for nothing, sets no design-case current
version, creates no parent or supersede link and creates no review row. It
imports no authoring code, because none exists yet. `APP6-B08` is **not started**.

---

## 10. OpenAPI and generated client

| Metric | Before | After |
|---|---|---|
| Paths | 65 | **66** |
| Operations | 71 | **72** |
| Schemas | 148 | **150** |

Semantic diff, computed against `HEAD`'s artifact rather than read off the patch:

```text
added ops:      adminCustomRequestSubmittedDesign_get
                  -> GET /api/admin/custom-requests/{requestId}/submitted-design
removed ops:    (none)
renamed/moved:  (none)
added paths:    /api/admin/custom-requests/{requestId}/submitted-design
removed paths:  (none)
added schemas:  AdminSubmittedDesignResponse, AdminSubmittedDesignSourceResponse
removed schemas:(none)
```

The `DesignDocument` component is **reused**, not duplicated. The only occurrence
of the word "secret" anywhere in the added block is the operation description
stating that no Design Session secret is required, fabricated or rotated.

Generation was run **once** each, in the prescribed order, with no regeneration
loop: focused API typecheck → `openapi:generate` → semantic diff → `openapi:check`
→ `api-client generate` → `check:generated` → API/client typechecks.

---

## 11. Validation ledger

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec tsc --noEmit` | pass (exit 0) |
| 2 | `pnpm --filter @embroidery/api exec jest --testPathPatterns=admin-custom-request-submitted-design.contract` | **10/10** |
| 3 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="admin-custom-request(-asset\|-moderation)?\.contract"` | **29/29** (the three sibling APP5 contract suites that enumerate the `/api/admin/custom-requests` prefix) |
| 4 | `pnpm --filter @embroidery/api exec jest --testPathPatterns=admin-submitted-design.integration --runInBand` | **16/16** |
| 5 | `pnpm --filter @embroidery/api openapi:generate` (`CMD-OPENAPI-GENERATE`) | 66 / 72 / 150 |
| 6 | `pnpm --filter @embroidery/api openapi:check` (`CMD-OPENAPI-CHECK`) | up to date |
| 7 | `pnpm --filter @embroidery/api-client generate` (`CMD-API-CLIENT-GENERATE`) | 2 files, tree hash `8da79856…` |
| 8 | `pnpm --filter @embroidery/api-client check:generated` (`CMD-API-CLIENT-CHECK`) | up to date |
| 9 | `pnpm --filter @embroidery/api-client exec tsc --noEmit` | pass |
| 10 | `pnpm --filter @embroidery/contracts exec tsc --noEmit` | pass |
| 11 | `pnpm --filter @embroidery/api exec eslint <14 changed files>` | clean |
| 12 | `pnpm exec prettier --check <changed files>` | clean |
| 13 | `git diff --check` | clean |

### 11.1 Reruns

| Command | Runs | Justification for the rerun |
|---|---|---|
| B07 contract suite (#2) | 2 | run 1 failed on one assertion — the document builder adds a platform `500` to every operation, which the expectation had not accounted for; run 2 green after the expectation named the platform response explicitly |
| B07 integration suite (#4) | 2 | run 1 green; run 2 after Prettier reformatted the spec file. The file's bytes changed, so the prior pass no longer covered the input |
| API lint (#11) | 2 | run 1 flagged one unused type import in the new test context; run 2 clean after removing it |

No other command was rerun on unchanged inputs.

### 11.2 Not run, deliberately

Per §17, and because their owned source carries a zero-line diff:

- **`APP6-B06`'s transition and race suites, and `APP5-B05`'s** — no allow-list
  row, lock, transaction boundary or `expectedFrom` semantic changed, and this
  checkpoint's module cannot reach `transition()` at all.
- **`APP6-B05`'s quotation accept/reject suites** — no quotation code, schema or
  pointer was touched.
- **The full APP3 Design Session suite and the autosave races** — the Design
  context gained one new file pair and one new module; `DesignModule`,
  `DrizzleDesignSessionRepository` and every existing session route are unchanged.
- **`APP5-B04`'s and `APP5-B06`'s integration suites** — no shared read input
  changed. Their *contract* suites were run (#3) because they enumerate the
  `/api/admin/custom-requests` prefix this checkpoint publishes under; both still
  see exactly `APP5-B05`'s two mutations and their own unchanged operation ids.
- **No repository test** for either new adapter beyond the integration suite: no
  existing repository changed, and both new statements are exercised end to end
  through the real route against a real database.
- The full order, design and quotation modules; the full API/repository
  regression; Admin/Storefront frontend suites; the worker; Playwright/E2E; the
  DB manifest/fingerprint/checksum/index suites; the Figma checker; the historical
  APP3/APP4/APP5 gate sweeps; SonarQube.

No new scoped command was added, so `SCOPED_COMMAND_INDEX.md` is unchanged: every
command above is either an already-indexed entry or a direct focused `jest`
invocation of the kind `VALIDATION_GOVERNANCE.md` §3 provides for.

---

## 12. Follow-up closure

```text
FU-APP5-B04-DESIGN-PREVIEW-01 = CLOSED_BY_APP6_B07
```

Closure evidence, each item asserted rather than asserted-about:

| Criterion | Evidence |
|---|---|
| Admin-authenticated | `AuthenticatedAdminGuard`, the unmodified APP1 guard; `401` proved for both no cookie and a token no session was minted for |
| Request-bound | the only address is `{requestId}`; the request is resolved and 404s before any session is looked at |
| Exact submitted session selected server-side | the port takes the request's own `submitted_session_id` and asserts `submitted_request_id = :requestId`; another request's `SUBMITTED` session returns `null` |
| No session secret fabricated | `session_secret_hash` is not a parameter and not a projected column anywhere in the new code; the seeded marker never appears in a response |
| No fake APP3 customer context | APP3 bootstrap/resume are not called; `DesignModule` is not imported |
| Missing or purged source becomes empty | hard-deleted row and reverted-state row both answer `200 / null` |
| Concrete DesignDocument returned when available | `$ref` to the generated `APP3-P01` component, identical to the one the public session snapshot uses; the generated client types it `DesignDocument` |

`APP6-B06`'s policy-file review-threshold follow-up is carried forward
unchanged.

---

## 13. Files changed

**Added (13):**

```text
apps/api/src/modules/order/domain/repositories/custom-request-design-source.port.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request-design-source.adapter.ts
apps/api/src/modules/order/custom-request-design-source.module.ts
apps/api/src/modules/order/application/admin/read-submitted-design.query.ts
apps/api/src/modules/order/presentation/schemas/admin-submitted-design.response.ts
apps/api/src/modules/order/presentation/admin-custom-request-submitted-design.controller.ts
apps/api/src/modules/order/custom-request-submitted-design.module.ts
apps/api/src/modules/order/presentation/admin-custom-request-submitted-design.contract.spec.ts
apps/api/src/modules/order/tests/integration/submitted-design-context.ts
apps/api/src/modules/order/tests/integration/admin-submitted-design.integration.spec.ts
apps/api/src/modules/design/domain/repositories/submitted-design-source.repository.ts
apps/api/src/modules/design/infrastructure/persistence/drizzle-submitted-design-source.repository.ts
apps/api/src/modules/design/design-submitted-source-read.module.ts
```

**Modified (4):**

```text
apps/api/src/bootstrap/app.module.ts                       (+9: one import, one registration)
packages/contracts/openapi/openapi.generated.json          (generated)
packages/api-client/src/generated/embroidery-api.schemas.ts (generated)
packages/api-client/src/generated/embroidery-api.ts         (generated)
```

**Documentation:**

```text
docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md
docs/implementation/reports/APP6-B07-COMPLETION-REPORT.md   (this file)
```

Every runtime source file is well under the 400-line limit (largest: the
controller at 140) and every test file under 600 (largest: the context at 319).

---

## 14. Verdict

```text
APP6-B06 = ACCEPTED
APP6-B07 = COMPLETE
HTTP OPERATIONS ADDED = 1
ADMIN SUBMITTED-DESIGN READ = DELIVERED
AUTHORITY = AUTHENTICATED ADMIN + REQUEST-BOUND POINTER
CALLER SESSION ID = ABSENT
SESSION SECRET = NOT REQUIRED / NOT FABRICATED
SUBMITTED_SESSION_ID = PROVENANCE ONLY
EXACT POINTED SESSION = ENFORCED
DESIGN DOCUMENT = CONCRETE P01 AUTHORITY
COP SOURCE = EMPTY / SUCCESS
MISSING OR PURGED SESSION = EMPTY / SUCCESS
FOREIGN SESSION SUBSTITUTION = ABSENT
SERVER RASTER PREVIEW = ABSENT
STORAGE/SECRET LEAK = ABSENT
CACHE-CONTROL = NO-STORE
READ SIDE EFFECTS = NONE
DATABASE MIGRATION = NONE
FU-APP5-B04-DESIGN-PREVIEW-01 = CLOSED_BY_APP6_B07
B08 = NOT STARTED
NEXT CHECKPOINT = APP6-B08
```

Local commit: `052e1d7` — `feat(app6): deliver APP6-B07 admin submitted-design read`. Not pushed.
