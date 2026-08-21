# APP6-B09 — Send Design Version for Review — Completion Report

`TR-LC08-02`. One Admin HTTP operation, one business action: **send one exact
persisted Design Version for customer review.**

---

## 1. Entry state

| Fact | Value |
|---|---|
| Entry HEAD | `23305b4` (docs: record the APP6-B08 commit hash) |
| `8debf9f` reachable from HEAD | **yes** (`git merge-base --is-ancestor 8debf9f HEAD` → 0) |
| Working tree at entry | **clean** (`git status --porcelain` empty) |
| B08 operation ids at entry | `adminCustomRequestDesignVersion_create`, `adminCustomRequestDesignVersion_list` — both verified unchanged in the post-B09 artifact |
| Branch | `production` |
| Pushed | **no** |

---

## 2. The operation

```text
POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send
  → adminCustomRequestDesignVersion_send
```

`AuthenticatedAdminGuard` (controller) + `StaffOriginGuard` (handler).
`Cache-Control: no-store`. HTTP **200** on success.

### Request body: none

Not an empty schema — **no `requestBody` in the document at all**, asserted by
the contract suite. Every fact a body could carry is server-derived: the Admin
identity (session cookie → `RequestContextService`), the request identity and the
design case (path + the request's own pointer), the persisted version and its
document (the row), the branch and placement (derived from the request), the send
instant (`AuditClock`), the hash (computed here) and both target states. So
`StaffJsonBodyGuard` is **absent** — requiring `application/json` would reject a
legitimate bodyless POST — which is the accepted `APP6-B03` send precedent, taken
for the same reason.

`versionId` is an exact **locator**, never authority: containment is re-proved in
the transaction (§4).

### Operation id

`AdminCustomRequestDesignVersionSendController` is a new class, so the default
policy would have minted `adminCustomRequestDesignVersionSend_send`. One
`CONTROLLER_DOMAIN_KEYS` entry maps it onto `adminCustomRequestDesignVersion`, so
the published family reads `_create`, `_list`, `_send` and **neither accepted B08
id is reissued**. It is a separate class because `DesignVersionAuthoringModule` is
*defined* by holding no order write repository and no outbox — the boundary that
lets B08's suite claim an authoring route cannot move a request — and the send
needs both.

---

## 3. Request → case → version authority chain

Re-proved **inside** the send transaction, in this order:

```text
lockDesignContext(requestId)          FOR UPDATE on custom_requests
  → request.currentDesignCaseId       the canonical pointer (G-DB7-09)
  → cases.findById(caseId)
  → require designCase.customRequestId === request.requestId    (both directions)
  → cases.lockVersion(versionId)      FOR UPDATE on design_versions
  → require version.designCaseId === designCase.id
```

- A missing request → `404 REQUEST_NOT_FOUND`.
- An absent, dangling or foreign case pointer → `409 DESIGN_CASE_UNRESOLVED`,
  **reported, never repaired**: no case is created and none is rebound.
- A version that does not exist and a version belonging to **another request's**
  case get the **same** `404 DESIGN_VERSION_NOT_FOUND`. The integration suite
  asserts the response body contains neither the owning request id nor its case
  id, so a wrong path cannot confirm that a version exists elsewhere.

No global version lookup is trusted, no "latest case" is inferred, no case is
rebound and no second case is created.

---

## 4. Version eligibility and replay matrix

| Persisted status | Outcome |
|---|---|
| `DRAFT` | send proceeds (`TR-LC08-02`) |
| `SENT_FOR_REVIEW` | **replay** — committed facts returned, **zero writes** |
| `REVISION_REQUESTED` | `409 DESIGN_VERSION_NOT_SENDABLE` |
| `APPROVED` | `409 DESIGN_VERSION_NOT_SENDABLE` |
| `SUPERSEDED` | `409 DESIGN_VERSION_NOT_SENDABLE` |
| `VOID` | `409 DESIGN_VERSION_NOT_SENDABLE` |
| another version of the case is `SENT_FOR_REVIEW` | `409 REVIEW_ALREADY_ACTIVE` |

`SENT_FOR_REVIEW` alone is sufficient to identify the replay case: the partial
unique index makes it the case's **only** active review, so a version in that
status *is* the committed active review version.

Replay writes nothing — no re-hash, no new `sent_at`, no supersession, no
transition row, no audit row, no outbox row — proved by comparing
`document_hash`, `sent_at` and the three row counts before and after a second
call.

### Current-version rule at send

**No current-version guard was added**, and the decision is deliberate:

- LC-08 `TR-LC08-02` states nothing about `design_cases.current_version_id`;
- G-DB7-02 requires only that the pointer name a version of the same case;
- `APP6-B08` advances the pointer to mean *"the newest authored draft"*, and its
  own source comment states that advancing it while an older version is under
  review "takes nothing away from B09's arbitration";
- inventing the guard would make the phase's **own CC-03 acceptance criterion
  unreachable** — two distinct eligible drafts on one case could never race,
  because only one would ever pass it.

Consequently the send **preserves** the pointer rather than moving it. Re-pointing
it at whatever was just sent would quietly redefine it as "the version under
review", which `findVersionInReview` and the partial unique index already answer
exactly. An integration test sends a non-current draft and asserts the pointer is
untouched.

---

## 5. Request-state matrix

| Request state at send | Outcome |
|---|---|
| `DIGITIZING` | send commits; **`TR-LC11-08` projected** `DIGITIZING → DESIGN_REVIEW`, actor `SYSTEM`, `system_job_key = design.version.send`, `expectedFrom = DIGITIZING` |
| `DESIGN_REVIEW` | send commits; **no transition row appended** — LC-11 has no self-edge |
| every other LC-11 state | `409 REQUEST_NOT_SENDABLE`; nothing written |

The Admin commands a **send**, never a status. The command type carries two
identifiers and nothing else, so no field exists through which `DESIGN_REVIEW`
could be requested; `requestStatus` appears in the response as a *reported* state
and in the OpenAPI document as a single-member enum on a response schema only.
`APP5-B05`/`B06`'s Admin transition allow-list is **untouched**.

---

## 6. Canonicalization and hash

Source: **`design_versions.design_document`** — the persisted row. No document
reaches this operation from a caller, and no hash is accepted from one.

```text
stored JSON
  → prepareDesignDocument            (structure, complexity, quantization, revalidation)
  → canonicalizeDesignDocumentToBytes (JCS)
  → hashDesignDocumentSha256          (node:crypto SHA-256)
  → formatDesignDocumentHash          → "sha256:<64 hex>"
  → design_versions.document_hash
```

Reached through `@embroidery/design-document/server`, the one server-only hash
export. No `JSON.stringify` hashing anywhere on the path and no second
canonicalizer.

**Evidence.** Both branch tests recompute the digest independently from what the
database actually holds — `expectedHashOf(row.design_document)` — and assert it
equals `design_versions.document_hash` and the value in the response. A send that
hashed anything other than the stored row fails. The format is separately asserted
against `/^sha256:[0-9a-f]{64}$/`.

- **Catalog v1** — hashed and stored; `document_schema_version` stays `1`.
- **COP v2** — hashed and stored; `document_schema_version` stays `2`.
- The stored `design_document` is compared byte-for-byte before and after: **no
  rewrite**, no v1→v2 migration, no re-quantization written back.

### One resolution note

`apps/api` compiles with `moduleResolution: Node`, which does not read the
`exports` map, so `@embroidery/design-document/server` resolved at runtime but not
at type-check time. Fixed by adding a `typesVersions` entry to
`packages/design-document/package.json` pointing the one subpath at the
declaration file `exports` already names. It is a **resolution hint only**: no
package source changed, the two entry points are exactly what `exports` says, and
nothing makes the Node-only hasher reachable from the package root. Consequently
the package's schema was **not** regenerated and its 183-test suite was **not**
re-run (§11).

---

## 7. Freeze boundary — branch, placement, geometry

`ADR-APP6-001` makes send the freeze boundary, so B08's authoring-time validation
is **re-established**, not trusted. `DesignVersionFreezeAuthority`:

**Branch** — the derived branch must equal the persisted branch. A Catalog↔COP
switch at send is `409 PLACEMENT_FROZEN_MISMATCH`.

**Catalog** — all four quartet columns compared individually against the freshly
resolved authority (product and variant from the request, side and area from the
exact submitted session, correlated by `submitted_request_id`), plus the Side's
own `physical_width_mm`/`physical_height_mm` compared numerically (the row stores
`numeric` as a string, so `'400.00'` and `400` are one measurement). Any
difference refuses; **nothing is substituted** — no other variant, no first side,
no latest area. An unresolvable chain is `409 PLACEMENT_AUTHORITY_UNRESOLVED`.
The document is then reconciled against the **live** Side and Area through
`FormalDesignVersionAuthority.validateCatalog` in `HISTORICAL_RENDER` mode, so a
Side retired since submission does not strand a quote-accepted request (PO-11)
while a Side whose geometry *changed* does stop the send.

**COP** — `customer_owned_product_id` must equal the request's COP row; both
placement labels must be nonblank (CST-130 restated at the boundary, because
`approval_snapshots.side_name`/`area_name` downstream are NOT NULL with no FK to
read through); the envelope must be positive on both axes. Containment is against
the **version's frozen envelope**, never `customer_owned_products`' nullable item
dimensions — the COP test seeds a 600×800 garment and a 120×90 envelope and
asserts the frozen row keeps 120.

Tested: a request re-pointed at a second variant → `PLACEMENT_FROZEN_MISMATCH`
with the version still `DRAFT` and its `product_variant_id` unchanged; a request
whose variant is nulled → `PLACEMENT_AUTHORITY_UNRESOLVED`.

---

## 8. Supersession — the exact `TR-LC08-05` rule used

```text
source status = REVISION_REQUESTED  (only)
target        = SUPERSEDED
scope         = siblings of the same design case, excluding the version being sent
actor         = system (the send committed)
transaction   = the send's own, per LC-08 "with TR-02 in same tx"
```

LC-08 names **`SENT_FOR_REVIEW`/`REVISION_REQUESTED` → `SUPERSEDED`** as
`TR-LC08-05`'s sources. The `SENT_FOR_REVIEW` source is **unreachable from B09
by construction**: GRD-004 refuses the send several statements before supersession
is considered, so a send can never be the thing that clears an active review. The
repository query is bounded to `REVISION_REQUESTED` so that is a property of the
statement rather than of the caller's discipline.

Nothing is fabricated when there is no predecessor. History is preserved: only
`status` and `superseded_at` change — the two columns the CST-090 S24 trigger
permits on a frozen row — and the document, placement, geometry, hash and lineage
of the superseded row are untouched. `parent_version_id` is never rewritten.

---

## 9. GRD-004 and CC-03

**Arbiter:** `uq_design_versions__case__sent_for_review` (migration `0015`), the
delivered partial unique index. It is *not* replaced by a mutex, an in-memory
lock or an application-only check.

**Mapping:** the delivered `CONSTRAINT_MEANINGS` catalog already resolves that
exact index name to code `REVIEW_ALREADY_ACTIVE`, so `classify()` matches on the
code rather than pattern-matching a constraint string. Every other unique arbiter
still reports a generic `DUPLICATE_RESOURCE` and travels to the platform filter
untouched. No SQL text, constraint name or column reaches a client.

A preflight `findVersionInReview` runs first, for diagnostics only.

### Proof 1 — CC-03 on real independent connections

Three actors, each its own pool and backend. A holder takes the request row lock
first; both senders then block on their own `FOR UPDATE`; the suite waits for the
**real condition** (`select count(*) from pg_locks where not granted` ≥ 2) rather
than for a duration, then releases the holder. No sleep is the correctness
mechanism. Which sender wins is left to PostgreSQL and never asserted.

Result: exactly one `fulfilled`, exactly one `rejected` carrying
`REVIEW_ALREADY_ACTIVE`, and

```text
design_versions in SENT_FOR_REVIEW for the case = 1
custom_request_transitions for the request      = 1
audit_events design_version.sent                = 1
outbox_events design.review-ready               = 1
custom_requests.status                          = DESIGN_REVIEW
```

so the request, the audit trail and the outbox match **only the winner**.

### Proof 2 — the index alone

`DesignCaseRepository.sendForReview` is driven directly, with no preflight
anywhere in the call stack. The second call is rejected by the index; the raised
`PersistenceError` already carries `code = REVIEW_ALREADY_ACTIVE`, its message
does not contain `uq_design_versions`, and one active review remains. A defect
that deleted the preflight would still leave one active review.

### Proof 3 — same-version concurrency replays

`lockVersion` was added precisely for this: without a row lock two senders of the
same version both read `DRAFT`, both reach the conditional `UPDATE`, and the
loser's statement matches no row — a bare "not a draft" refusal for what is one
command issued twice. Holding the row makes the second re-read `SENT_FOR_REVIEW`
and take the replay branch. Sequential duplicate send is asserted directly
(zero writes); the row lock is what extends it to the concurrent case.

---

## 10. Transaction map, evidence and rollback

```text
requireAdminActorId(requestContext)          ← before the transaction; no operator, no read
requireRequestId(requestContext)             ← correlation

BEGIN
  lockDesignContext(requestId)               FOR UPDATE custom_requests
  resolveCase                                 pointer both directions
  lockVersion(versionId)                     FOR UPDATE design_versions
  replay? → return committed facts, 0 writes
  require DRAFT                              else DESIGN_VERSION_NOT_SENDABLE
  findVersionInReview                        GRD-004 preflight
  require request state ∈ {DIGITIZING, DESIGN_REVIEW}
  branches.resolve(request)                  else PLACEMENT_AUTHORITY_UNRESOLVED
  freeze.hashFrozenDocument(version, branch) branch/placement/geometry + canonical hash
  cases.sendForReview(id, hash, sentAt)      DRAFT → SENT_FOR_REVIEW  ← index arbitrates
  cases.supersede(each REVISION_REQUESTED predecessor, sentAt)
  (design case pointer: preserved — no write)
  requests.transition(→ DESIGN_REVIEW, SYSTEM, expectedFrom) — only from DIGITIZING
  recorder.record(...)                       audit row + outbox row
COMMIT
```

There is **no `try`/`catch` inside the transaction**; `classify()` runs outside it
and only translates persistence codes into the bounded vocabulary. No compensation
workflow exists.

### Before/after (first catalog send)

| | before | after |
|---|---|---|
| `design_versions.status` | `DRAFT` | `SENT_FOR_REVIEW` |
| `document_hash` | `NULL` | `sha256:<64 hex>` (recomputed from the row) |
| `sent_at` | `NULL` | the send instant |
| `design_document` / `document_schema_version` | v1 | **identical** |
| placement columns | quartet | **identical** |
| `preview_derivative_id` / `preview_hash` | `NULL` | **`NULL`** |
| `custom_requests.status` | `DIGITIZING` | `DESIGN_REVIEW` |
| transitions | 0 | 1 (`SYSTEM`, `design.version.send`) |
| `audit_events` | 0 | 1 (`design_version.sent`, `ADMIN`) |
| `outbox_events` | 0 | 1 (`design.review-ready`) |

### Atomic rollback

`DesignVersionSendRecorder` is replaced with one that throws — the **last**
collaborator, so by the time it runs the transaction has already moved the
version, superseded the predecessor, and appended the transition. Everything else
is the real application: real routes, real guards, real repositories, real
transaction boundary.

Both injections (a `DESIGN_REVIEW` revision send with a predecessor, and a
`DIGITIZING` first send) return **500** — the platform filter's sanitised answer
for a defect, deliberately not shaped into a business refusal — and leave:
version `DRAFT` with `document_hash` and `sent_at` `NULL`; predecessor still
`REVISION_REQUESTED` with `superseded_at` `NULL`; the design case pointer
identical; the request status unchanged with **zero** transition rows; and zero
audit and zero outbox rows.

---

## 11. Audit and `SE-004 design.review-ready`

### Audit — `design_version.sent`

Actor **`ADMIN`** (the operator commanded the send; only the request move is the
system's). `targetKind = DESIGN_VERSION`, `targetId = versionId`,
`occurredAt = sentAt` (the same `Date` as `sent_at`, so the evidence cannot
disagree with the row), `correlationId` from the request context.

Summary: `designCaseId`, `customRequestId`, `version`, `fromStatus = DRAFT`,
`toStatus = SENT_FOR_REVIEW`, `branch`, `documentSchemaVersion`, `documentHash`,
`supersededVersionIds`, `requestTransitioned`.

`DB3_AUDIT_SPECIFICATION.md` audits design-version send with "version refs/state"
and, verbatim, *"document content never in audit (hash ref only)"* — so the hash
reference is present and nothing it hashes is. Asserted: the summary does not
contain the seeded element id.

### Outbox — `design.review-ready`

```text
event_type            design.review-ready
aggregate_kind        DESIGN_VERSION          (SE-004: "per (version)")
aggregate_id          the design version id
payload_schema_version 1
payload               { schemaVersion, designVersionId, designCaseId,
                        customRequestId, version, sentAt }
```

**The payload carries no hash.** SE-004's annotation is *"amounts OK; no doc
content"* and DB3 authorizes a hash reference for the **audit trail**; nothing in
the side-effect catalog or the delivered payload convention authorizes one in the
event, so none was added by intuition. A consumer that genuinely needs it reads
`design_versions.document_hash`.

Privacy asserted by serializing the payload and requiring the absence of
`sha256:`, the seeded element id, and each of `token`, `secret`, `storageKey`,
`bucket`, `grant`, `elements`. The key set is asserted exactly, so a field added
later fails the test.

**No notification intent** is created — the accepted `APP6-B03` precedent. APP4's
`NotificationRequest` is secret-bearing by construction (it requires a `secret`,
a `secretKind` and a `reference` from a closed union), and the customer-facing
secure link a design-review notification eventually carries comes from the
existing `REQUEST_ACCESS` grant architecture that `APP6-B10` consumes. Creating
an intent here would mean inventing a secretless delivery path — a change to
APP4's notification architecture that no APP6 checkpoint owns.

Exactly one audit row and one event per **new committed send**; zero on replay;
zero surviving a rollback.

---

## 12. Secure-grant, preview and B10 boundary

No grant kind added, no token minted, no token in the response, no customer id
accepted, no grant resolved, no step-up. `DesignVersionSendModule` holds no
grant issuer, no notification module, no approval-snapshot repository, no
agreement repository, no asset repository and no object-storage client, so none
of it is reachable rather than merely unused.

No raster, no derivative, no Sharp, no preview bytes, no export, no download.
`preview_derivative_id` and `preview_hash` stay `NULL`, asserted. APP6 review
rendering remains: safe formal DesignDocument → APP3 native-SVG renderer →
APP3-S09 runtime watermark → Storefront review UI, which `APP6-B10`/`S02` own.

**B10 is not started.** No public/customer read, no agreement publication, no
approval, no revision request, no Approval Snapshot, no `design.approve`
idempotency, no `TR-LC11-09`, no `design.approved`, no order, no payment, no
inventory, no production job.

---

## 13. Error contract

| Code | Status |
|---|---|
| `REQUEST_NOT_FOUND` | 404 |
| `DESIGN_VERSION_NOT_FOUND` | 404 |
| `DESIGN_CASE_UNRESOLVED` | 409 |
| `DESIGN_VERSION_NOT_SENDABLE` | 409 |
| `REVIEW_ALREADY_ACTIVE` | 409 |
| `REQUEST_NOT_SENDABLE` | 409 |
| `REQUEST_TRANSITION_STALE` | 409 |
| `INVALID_TRANSITION` | 409 |
| `PLACEMENT_AUTHORITY_UNRESOLVED` | 409 |
| `PLACEMENT_FROZEN_MISMATCH` | 409 |
| `DOCUMENT_REJECTED` | 422 (+ bounded `reason`, the P01/P02 rejection class only — never findings) |

An exhaustive `Record`, so a new failure without a status stops compiling. No
constraint name, SQL text, column or customer value appears in any message. The
platform filter's `500` is published on the operation as it is on every operation.

---

## 14. OpenAPI and generated client — one controlled cycle

| | before | after |
|---|---|---|
| paths | 67 | **68** |
| operations | 74 | **75** |
| schemas | 155 | **156** |

Artifact diff: **323 insertions, 0 deletions** — purely additive.

Semantic diff (computed against `git show HEAD:…`):

```text
ADDED OPS      [ adminCustomRequestDesignVersion_send ]
REMOVED OPS    []
ADDED PATHS    [ /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send ]
REMOVED PATHS  []
ADDED SCHEMAS  [ DesignVersionSentResponse ]
REMOVED SCHEMAS []
```

B08's two ids and B07's operation are byte-identical. No customer or public
operation added. No DesignDocument schema duplication (asserted: at most one
`DesignDocument*` component).

Generation ran **once** each:

- `pnpm --filter @embroidery/api openapi:generate` → 68/75/156
- `pnpm --filter @embroidery/api openapi:check` → up to date
- `pnpm --filter @embroidery/api-client generate` → 2 files, tree hash `ff163f38…`
- `pnpm --filter @embroidery/api-client check:generated` → up to date

`openapi:check` was re-run once after adding the `@Header('Cache-Control')`
decorator (a source change to the controller) and confirmed **no drift** — a
`@Header` does not alter the document. No generation loop.

Generated client: real fields, no index signature — `DesignVersionSentResponse`
with `documentHash: string`, `supersededVersionIds: string[]`, and three
single/two-member const enums for `branch`, `versionStatus`, `requestStatus`.

`packages/design-document` schema was **not** regenerated: no package source
changed (only `package.json` gained a `typesVersions` resolution hint).

---

## 15. Focused validation ledger

| Command | Result | Why it ran |
|---|---|---|
| `git merge-base --is-ancestor 8debf9f HEAD` | pass | entry gate |
| `pnpm --filter @embroidery/api typecheck` | pass | API source changed |
| `pnpm --filter @embroidery/api-client typecheck` | pass | client regenerated |
| `pnpm --filter @embroidery/design-document typecheck` | pass | package.json touched |
| `npx prettier --check` (changed paths) | pass after `--write` | changed paths |
| `pnpm --filter @embroidery/api exec eslint src/modules/design src/openapi/operation-id.ts src/bootstrap/app.module.ts src/modules/order/presentation` | pass | changed paths; **caught a real defect** — the declared `Cache-Control` constant was unused because the `@Header` decorator was missing |
| `git diff --check` | pass | whitespace |
| `pnpm --filter @embroidery/api openapi:generate` | 68/75/156 | one operation added |
| `pnpm --filter @embroidery/api openapi:check` | pass ×2 | after generation; re-run after the `@Header` source change |
| `pnpm --filter @embroidery/api-client generate` | 2 files | after the OpenAPI change |
| `pnpm --filter @embroidery/api-client check:generated` | pass | after generation |
| `node tools/check-app6-g01-authority.mjs` | pass (exit 0) | it reads the generated OpenAPI artifact |

### Jest — 9 suites, 99 tests, all green (final consolidated run)

| Suite | Tests | Why |
|---|---|---|
| `admin-custom-request-design-version-send.contract.spec.ts` | 9 | B09-owned |
| `design-version-send.integration.spec.ts` | 16 | B09-owned |
| `design-version-send-race.integration.spec.ts` | 2 | B09-owned (CC-03) |
| `design-version-send-atomicity.integration.spec.ts` | 2 | B09-owned |
| `design-version-authoring.integration.spec.ts` (B08) | 31 | its fixture `design-version-context.ts` changed |
| `admin-custom-request-design-version.contract.spec.ts` (B08) | 10 | its frozen-surface assertion had to be reconciled |
| `admin-custom-request-submitted-design.contract.spec.ts` (B07) | 10 | its frozen Admin mutation list had to be reconciled |
| `admin-custom-request.contract.spec.ts` (B04) | 9 | frozen Admin mutation list (see §16) |
| `admin-custom-request-asset.contract.spec.ts` (B06) | 10 | frozen Admin mutation list (see §16) |

Every rerun above names the concrete input change that justified it. No command
was re-run on unchanged inputs.

### Deliberately NOT run

APP6-B07 integration; APP6-B06 transition/race; APP6-B05 quotation races;
APP6-B03 quotation send; full APP3 Design Session; the APP3 P01/P02 gate chain;
`@embroidery/design-document`'s 183-test suite and its schema generation (no
package source changed); `@embroidery/design-engine`'s 137-test suite (unchanged);
full API regression; the full repository suite; Admin frontend; Storefront
frontend; the worker suite; Playwright/E2E; DB manifest/fingerprint/index/checksum
suites; migration generation and check; the Figma checker; full SonarQube.

---

## 16. Two pre-existing red checkers, reconciled

`admin-custom-request.contract.spec.ts` (APP5-B04) and
`admin-custom-request-asset.contract.spec.ts` (APP5-B06) each freeze the *whole*
`POST /api/admin/custom-requests/**` surface as a literal list. Both were
**already failing at HEAD** — verified by `git stash push -u`, running them
against a pristine tree (identical `2 failed, 17 passed`), then `git stash pop`.
`APP6-B08` published `…/design-versions` without reconciling either.

Both lists are now reconciled to the four delivered mutations (B05's two, B08's
authoring route, B09's send), with the reason recorded in each file's comment.
This is not scope creep: B09 publishes a route under the same frozen prefix, so
leaving them red would make it impossible to tell whether B09 broke them. The
assertions are **not relaxed** — a fifth mutation, a note edit, a per-transition
route, or any route that set a request status directly would still fail.

---

## 17. Database boundary

```text
DATABASE MIGRATION = NONE
```

Every physical mechanism already existed: `uq_design_versions__case__sent_for_review`
(migration `0015`), the CST-090 S24 freeze trigger whose exception list already
carries `status`/`sent_at`/`superseded_at` (migration `0030`), CST-074's
hash-required-once-sent CHECK, `design_versions.document_hash`, and the
transition, audit and outbox tables. No index was altered, no lock table added,
no column added, no pointer added, and no historical migration constant repaired.

---

## 18. Follow-ups

| Id | Disposition |
|---|---|
| `FU-APP6-B08-P01-GATE-01` | **Carried, unrepaired.** `NONBLOCKING_PREEXISTING` / `OUTSIDE_B09`. No APP3 gate sweep was run, no migration-count constant was touched, no journal metadata was edited. Carry to the next checkpoint that owns the database/tooling baseline, or to `APP6-X01`. |
| `FU-APP6-DB01-01` | **Carried.** drizzle-kit spurious regex pair → next real database-change checkpoint. No migration generated in B09. |
| APP6-A02 exact-version document detail | **Still a bounded future UI/API question.** No third read operation was added. |
| `FU-APP6-B09-CASE-REPO-SIZE-01` | **New, open.** `drizzle-design-case.repository.ts` is now **399 lines** against the 400-line hard maximum. The next checkpoint that adds an AGG-10 persistence method must split it by responsibility first (the read projections are the natural seam). Non-blocking for B09. |

---

## 19. Files changed

**New (11)**

```text
apps/api/src/modules/design/domain/design-version-send.errors.ts
apps/api/src/modules/design/domain/design-version-send-eligibility.ts
apps/api/src/modules/design/application/sending/design-version-freeze.authority.ts
apps/api/src/modules/design/application/sending/design-version-send.recorder.ts
apps/api/src/modules/design/application/sending/design-version-sent.view.ts
apps/api/src/modules/design/application/sending/send-design-version.use-case.ts
apps/api/src/modules/design/presentation/admin-custom-request-design-version-send.controller.ts
apps/api/src/modules/design/presentation/schemas/admin-design-version-send.request.ts
apps/api/src/modules/design/presentation/schemas/admin-design-version-send.response.ts
apps/api/src/modules/design/design-version-send.module.ts
apps/api/src/modules/design/presentation/admin-custom-request-design-version-send.contract.spec.ts
apps/api/src/modules/design/tests/integration/design-version-send.integration.spec.ts
apps/api/src/modules/design/tests/integration/design-version-send-race.integration.spec.ts
apps/api/src/modules/design/tests/integration/design-version-send-atomicity.integration.spec.ts
```

**Modified**

```text
apps/api/src/modules/design/domain/repositories/design-case.repository.ts       + lockVersion, listRevisionRequestedVersionIds
apps/api/src/modules/design/infrastructure/persistence/drizzle-design-case.repository.ts
apps/api/src/openapi/operation-id.ts                                            + one CONTROLLER_DOMAIN_KEYS entry
apps/api/src/bootstrap/app.module.ts                                            + DesignVersionSendModule
apps/api/src/modules/design/tests/integration/design-version-context.ts         + module param, configure hook, seedVersion, ROUTE.send
apps/api/src/modules/design/presentation/admin-custom-request-design-version.contract.spec.ts
apps/api/src/modules/order/presentation/admin-custom-request-submitted-design.contract.spec.ts
apps/api/src/modules/order/presentation/admin-custom-request.contract.spec.ts
apps/api/src/modules/order/presentation/admin-custom-request-asset.contract.spec.ts
packages/design-document/package.json                                           + typesVersions resolution hint
packages/contracts/openapi/openapi.generated.json                               generated
packages/api-client/src/generated/*                                             generated
docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md
docs/implementation/reports/APP6-B09-COMPLETION-REPORT.md                        this file
```

`SCOPED_COMMAND_INDEX.md` is **unchanged**: B09 introduced no new reusable
command or checker — the behaviour a bespoke checker would assert is proved
better by the four focused suites.

---

## 20. Verdict

```text
APP6-B08 = ACCEPTED
APP6-B09 = COMPLETE
HTTP OPERATIONS ADDED = 1
TR-LC08-02 = DELIVERED
EXACT REQUEST/CASE/VERSION AUTHORITY = PROVED
PERSISTED DOCUMENT = ONLY SEND SOURCE
CATALOG V1 CANONICAL HASH = DELIVERED
COP V2 CANONICAL HASH = DELIVERED
DOCUMENT HASH = STORED / EXACT
DOCUMENT SCHEMA VERSION REWRITE = NONE
VERSION STATUS = SENT_FOR_REVIEW
BRANCH / PLACEMENT / GEOMETRY = FROZEN
GRD-004 = ENFORCED BY DELIVERED PARTIAL UNIQUE INDEX
CC-03 = ONE WINNER / REVIEW_ALREADY_ACTIVE LOSER
LEGITIMATE PREDECESSOR SUPERSESSION = DELIVERED
TR-LC11-08 = SYSTEM PROJECTION ONLY
DIGITIZING -> DESIGN_REVIEW = SAME TRANSACTION
DESIGN_REVIEW -> DESIGN_REVIEW SELF TRANSITION = ABSENT
DESIGN.REVIEW-READY = EMITTED ONCE PER NEW SEND
AUDIT = EMITTED ONCE PER NEW SEND
DUPLICATE SAME-VERSION SEND = REPLAY / ZERO WRITES
ATOMIC ROLLBACK = PROVED
SERVER RASTER PREVIEW = NONE
SECURE GRANT ISSUANCE = NONE
DATABASE MIGRATION = NONE
B10 = NOT STARTED
NEXT CHECKPOINT = APP6-B10
```

Local commit only. Nothing pushed.
