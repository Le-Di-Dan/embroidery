# APP6-B11 — Customer Design Approval and Revision Request — Completion Report

```text
APP6-B10  = ACCEPTED (COMMIT 863765c)
APP6-B11  = COMPLETE
HTTP OPERATIONS ADDED = 2
DATABASE MIGRATION = NONE (COUNT 36)
NEXT CHECKPOINT = APP6-A01
```

---

## 1. Entry state

```text
git log --oneline -3
  afd656c docs(app6): record the APP6-B10 commit hash in its completion report
  863765c feat(app6): deliver APP6-B10 customer secure design review read
  198fddc docs(app6): record the APP6-B09 commit hash in its completion report

git merge-base --is-ancestor 863765c HEAD   -> 863765c REACHABLE
git status --porcelain                       -> (clean)
migrations                                   -> 0000..0036, last = 0036 (37 files, 0017 absent)
OpenAPI at entry                             -> 69 paths / 76 operations / 159 schemas
```

The entry artifact counts match `APP6-B10`'s accepted baseline exactly, so nothing
had drifted between checkpoints.

Before any edit the following were inspected: the B10 controller, request schema,
read query, `DESIGN_REVIEW_PORT`, `EffectiveAgreementsReader`,
`DesignApprovalAgreementsPolicyReader` and both B10 modules; the B05 sensitive-write
composition (`AcceptQuotationUseCase`, `QuotationDecisionTargetResolver`,
`ReauthorizeSecureGrant`, `StepUpEvidenceResolver`, the decision error vocabulary and
the accept idempotency binding); the B09 send use case, its recorder and its
active-review/version locking; `DesignCaseRepository.recordReview`, `lockVersion`,
`ApprovalSnapshotRepository`, migration `0036`, the `design_reviews`,
`approval_snapshots` and `approval_snapshot_thread_colors` schemas; the LC-08 /
LC-11 / GRD-002/003/007/008 / SE-004 / SE-005 / CC-02/04/16 authority rows; and the
audit, outbox, idempotency and Custom Request transition ports.

**No stop condition from §36 was true.** Every capability the checkpoint needs
already existed; two gaps were found and both were ordinary implementation work, not
authority or schema contradictions (§5 below).

---

## 2. The two operations

```text
POST /api/public/design-reviews/approve            -> publicDesignReview_approve
POST /api/public/design-reviews/request-revision   -> publicDesignReview_requestRevision
```

Both are `POST`, both address fixed public literals, and the design-review base path
now carries exactly three routes — `current`, `approve`, `request-revision` — none of
which contains a path parameter. There is no generic `/decision`, no status-mutation
route, no identified `/{designVersionId}` read, no third step-up operation and no
separate agreement-acceptance endpoint.

A second controller class keeps B10 read-only, and
`CONTROLLER_DOMAIN_KEYS['PublicDesignReviewDecisionController'] = 'publicDesignReview'`
maps it onto the existing family rather than minting
`publicDesignReviewDecision_approve`. B10's `publicDesignReview_current` operation
object is **byte-identical** before and after generation, and B07/B08/B09's ids
(`adminCustomRequestDesignVersion_create/_list/_send`) are unchanged.

---

## 3. The bodies

Both are `.strict()`. The sole published parameter on either operation is the
platform `X-Request-ID` correlation header.

```text
ApproveDesignVersionBody   = token, versionId, documentHash, acceptedAgreements[]
                             acceptedAgreements[] = { agreementVersionId, contentHash }  (.strict)
RequestDesignRevisionBody  = token, versionId, feedback
```

`feedback` is required on the revision path (LC-09 records the outcome as
`REQUEST_REVISION` **(+feedback)**), trimmed, non-blank and bounded at 2 000
characters — `design_reviews.feedback` is unconstrained `text`, and a public route
that accepts unbounded text stores unbounded text.

The revision body carries **no** `documentHash` and **no** `acceptedAgreements`:
GRD-007 and GRD-008 guard `TR-LC08-04` alone, and asking a customer who wants a
change to first prove the design is unchanged would refuse them for the very reason
they are writing.

A 40-name forbidden-field matrix runs against both schemas in the contract suite:
no `customerId`, `email`, `phone`, `contact`, `requestId`, `code`, `designCaseId`,
`grantId`, `scopeKind`, `challengeId`, `stepUpChallengeId`, `adminId`, `status`,
`toStatus`, `outcome`, `approvedAt`, `decidedAt`, `approvalSnapshotId`, `previewHash`,
Catalog/COP ids, `productName`, `sideName`, `areaName`, `quantityTotal`,
`threadColors`, `correlationId`, `eventType` or `auditId`. `agreementType` and
`content` are absent from the acceptance item for the same reason: the type is
derivable from the Agreement Version, and accepting prose would let a caller submit
the terms it wrote itself.

No token example is published on either body.

---

## 4. Secure preflight and the exact decision target

The outer admission is `AuthorizeSecureLink.authorize` — the delivered policy →
abuse budget → digest path, identical to B10's, so a caller cannot escape the
`secure_link.resolve` budget by spreading guesses across the read and the two
decisions. `digestSecret` is never called at the controller edge, no grant row is
queried there, no rate limiting is cloned, no scope is added, and no grant is issued,
reissued or rotated.

Inside each transaction `DesignDecisionTargetResolver` re-walks and locks:

```text
ReauthorizeSecureGrant.reauthorize(token, now)      -> grant row LOCKED (ACTIVE, unexpired, REQUEST_ACCESS)
grant.customRequestId
  -> lockDesignContext(requestId)                   -> custom_requests row LOCKED
  -> request.currentDesignCaseId
  -> cases.findById(caseId)                         -> case.customRequestId === requestId   (G-DB7-09)
  -> cases.lockVersion(command.versionId)           -> design_versions row LOCKED
  -> version.designCaseId === case.id
```

The lock order — **grant → request → version** — is the phase's, matching B03, B05,
B08 and B09, so the two decisions serialise against each other and against a
concurrent send rather than inverting. There is no process-local mutex anywhere on
either path.

Every definitive absence leaves as one `404 SECURE_LINK_UNAVAILABLE`, thrown from
APP4's own `secureLinkUnavailable()` so a bad token gets the *same object* on a write
as on B10's read: dead grant, missing request row, unset case pointer, foreign case,
unknown version id, foreign version. There is no cause diagnostic and no follow-up
read anywhere on either path.

### Active review vs the current-version pointer

`design_cases.current_version_id` is **never read** by either decision.
`CustomRequestDesignContextPort` does not expose it and `DesignDecisionTargetResolver`
does not ask for it. Nor is `findVersionInReview` called a second time: because
`uq_design_versions__case__sent_for_review` permits at most one `SENT_FOR_REVIEW`
version per case, *"belongs to this case"* + *"is `SENT_FOR_REVIEW`"* — both proved on
the locked row — **is** the statement *"is this case's one active review"*. A second
query would be a second authority for a fact the index already decides, and would read
outside the lock just taken.

This is proved from both directions in one test: a case whose pointer names a newer
`DRAFT` while an older version is in review answers `APPROVAL_VERSION_MISMATCH` for the
pointed-at draft and **approves** the version actually in review.

The current pointer is not used as a stale-approval validation either. The canonical
superseding fact is the version's own `SUPERSEDED` status, which CC-02 exercises
directly; introducing the pointer as a second staleness source would have created the
competing authority B10 exists to prevent.

---

## 5. Two implementation gaps found and closed

Neither was a stop condition; both were resolved from accepted authority.

**(a) The AGG-11 adapter was Catalog-only.** `createFromVersion` called
`assertValidPlacement` unconditionally and never wrote `customer_owned_product_id`,
so a COP approval could not be represented even though migration `0036` had already
opened the branch. Fixed: the adapter branches on the CST-129 discriminator, skips the
Catalog hierarchy assertion on the COP branch (the ADR-APP6-001 §3.3 rule
`createVersion` already follows — all four quartet columns are NULL there, so the call
could only pass by inventing them), and copies `customer_owned_product_id` through.
`ApprovalSnapshot.placement` became a CST-131 union, and `toSnapshot` reads the COP
column first. The one existing assertion that indexed the quartet now narrows on the
branch first.

**(b) No truthful source existed for two snapshot columns on a public path.**
`approval_snapshots.quantity_total` is `NOT NULL` with a positive CHECK, and
`product_name` is `NOT NULL` on both branches; on the COP branch the only truthful
name is `customer_owned_products.name`. Both live in Ordering. Added
`CUSTOM_REQUEST_APPROVAL_FACTS_PORT` — a sixth narrow read-only Ordering contract
beside the five that already exist — with a Drizzle adapter that sums TBL-039 in SQL
and reads the COP name, and its own provider-only module. The evidence resolver holds
this port and not `CUSTOM_REQUEST_REPOSITORY`, so it cannot rewrite the breakdown whose
total it is freezing.

---

## 6. The approval transaction

```text
BEGIN
  resolve + lock grant, request, exact version            (§4; CC-16 lives here)
  GRD-007 half one: submitted documentHash == stored hash
  claim design.approve (scope = version, fingerprint = version + stored hash + terms set)
    replay?      -> return the committed snapshot, write nothing
    in_progress? -> DUPLICATE_OPERATION
  GRD-007 half two: version still SENT_FOR_REVIEW          (CC-02 and CC-04 land here)
  request still DESIGN_REVIEW and the LC-11 move legal
  GRD-003: fresh STEP_UP, server-derived from the grant's customer
  GRD-008: re-resolve the effective set; require the submission exactly
  resolve the approval evidence (labels, quantity, contact, thread colours)
  recordReview(APPROVE, stepUpChallengeId)                 -> version APPROVED
  createFromVersion(...)                                   -> snapshot + colours + acceptances
  transition(DESIGN_REVIEW -> APPROVED, actor = SYSTEM, expectedFrom)
  recordApproval(...)                                      -> audit row + SE-005
  idempotency.complete(key, result)
COMMIT
```

There is no `try`/`catch` inside the transaction that could let a subset commit, and
no compensation path.

**The hash check precedes the claim** deliberately. The stored hash is frozen for the
life of the row (CST-090 excepts only the lifecycle columns), so the test gives the
same answer whether the version is still in review or already approved — which is what
lets a genuine duplicate reach the replay while a submission quoting the wrong artwork
is refused **without ever claiming the scope**. A refused first attempt therefore leaves
no idempotency row of any status, which is asserted directly.

**The replay precedes GRD-003**, on the B05 precedent: a replay performs no write, and
gating it on a still-open step-up window would tell a customer retrying after a dropped
response to re-verify in order to be shown a decision they already made. It discloses
nothing new, since B10 already answers the same holder of the same live grant.

### Step-up

`StepUpEvidenceResolver.resolve(grant.customerId, now)` — reused unchanged, joining the
approval's transaction, so the proof recorded is the proof that was live at commit. No
challenge id is accepted from the body, so a wrong-purpose, stale or other-customer
challenge is not merely rejected but **unnameable**. A valid grant with no qualifying
STEP_UP answers `403 REVERIFICATION_REQUIRED`.

### GRD-008, re-evaluated in transaction

`AcceptedTermsAuthority` reads the required type set from the
`design_approval.agreements` policy, resolves the exact effective version of every
required type through the delivered `EffectiveAgreementsReader`, and requires the
submission to be exactly that set: size equality plus every required id present (set
equality in both directions), every content hash equal to persistence, and no duplicate.
The frozen acceptance takes its `agreementType` and `contentHash` from the **Agreement
Version**, never from the body.

The consequence is the one the authority requires: **if the terms changed after the
customer read them, the approval fails.** It never substitutes. A type with no effective
version at all is a deployment fault and travels as B10's bounded `503`, not as
`TERMS_NOT_ACCEPTED` — the customer must not be told their submission was wrong when it
was not.

The exact-design confirmation is **not** an agreement: it is the action's own
`versionId + documentHash` under GRD-007, and no `DESIGN_APPROVAL_TERMS` row is created
or expected anywhere.

---

## 7. The revision transaction

```text
BEGIN
  resolve + lock grant, request, exact version
  require the version still SENT_FOR_REVIEW               (CC-04, first decision wins)
  recordReview(REQUEST_REVISION, feedback)                -> version REVISION_REQUESTED
  recordRevisionRequest(...)                              -> audit row + SE-004
COMMIT
```

**No step-up, structurally.** `RequestDesignRevisionUseCase` does not inject
`StepUpEvidenceResolver`, reads no challenge, creates none, consumes none, and cannot
return `REVERIFICATION_REQUIRED` — the code is unreachable from any statement in the
file. `design_reviews.step_up_challenge_id` stays NULL. Two tests run the whole path
with **zero** verification challenges in the database and assert none is created.

**No request movement.** The class does not inject `CUSTOM_REQUEST_REPOSITORY`, so
"a revision request does not move the request" is structural rather than remembered. The
request stays `DESIGN_REVIEW`, no transition row is written, there is no
`DESIGN_REVIEW → DESIGN_REVIEW` self-edge and no backward move to `DIGITIZING`. The
request row is still locked, for lock-order consistency with the approval — locked to
order the race, never to be written.

**No next draft.** `APP6-B08` owns revision authoring; the case still has exactly one
version when this commits.

**Naturally idempotent, no namespace** (`APP6-G01` §10): no `IdempotencyStore` is
injected, and a second decision on a decided version is refused rather than duplicated.

---

## 8. The Approval Snapshot

Created through the delivered `ApprovalSnapshotRepository.createFromVersion`; no second
snapshot model exists. The document hash is re-proved a third time inside the repository
against the row it locks itself, because this row authorises production.

| Evidence | Catalog branch | COP branch |
|---|---|---|
| `design_version_id`, `design_case_id`, `custom_request_id`, `customer_id` | copied from the locked version and its case | same |
| `document_hash` | the stored B09 value | same |
| `preview_hash` | **NULL** — APP6 renders nothing and manufactures none | same |
| placement | the complete Catalog quartet | `customer_owned_product_id`; quartet **all NULL** |
| `product_name` | `products.name` at approval time | `customer_owned_products.name` |
| `variant_label` | `color_name / size_label`, joined only when both exist | **NULL** — a COP has no variant |
| `side_name` / `area_name` | `product_sides.name` / `embroidery_areas.name` | the version's frozen `placement_side_label` / `placement_area_label` |
| `physical_width_mm` / `physical_height_mm` | the version's frozen envelope | same |
| `quantity_total` | summed from TBL-039 | same |
| contact copy | `display_name` + verified, non-deactivated primary EMAIL/PHONE display values | same |
| `grant_id`, `step_up_challenge_id` | the live grant and the server-derived challenge | same |
| thread colours | the frozen document's declared fills and strokes | same |
| agreement acceptances | the exact effective set, type and hash from persistence | same |

Nothing is defaulted. There is no `?? 'Unknown'`, no `?? ''` and no fallback of a
Catalog label onto a COP row; every absence is `APPROVAL_EVIDENCE_UNRESOLVED` (a bounded
`503`), which is unreachable through the delivered paths — placement FKs are `restrict`,
CST-130 forces both COP labels, and a submitted request always carries a breakdown.

### Thread colours

`approval_snapshot_thread_colors` states outright that there is **no palette catalog
table in this schema**, so the only truthful `color_code` is the colour the approved
document declares. The derivation reads `fill` then `stroke` per element in the array's
z-order, deduplicates by first appearance, and numbers positions from 1. `color_name` is
left NULL: a DMC or Madeira number would be a better record and would be **invented**, in
immutable evidence that authorises a machine file. The fixture document declares
`#1d4ed8` twice across two element kinds and yields three colours, not four.

### Immutability

Proved against raw SQL, not merely against the repository's lack of an update method:
CST-091's row-wide `always`/`reject` trigger refuses both an `UPDATE` and a `DELETE`. A
later agreement publication leaves the frozen acceptance hashes unchanged, and a
duplicate approval creates no second snapshot.

---

## 9. Lifecycle, audit and events

`TR-LC11-09` is projected inside the approval transaction with
`actor = { kind: 'SYSTEM', systemJobKey: 'design.approve' }` and `expectedFrom` set to
the status read under the lock. The customer approves the **design**; `APPROVED` on the
request is the system's projection, and no body field can ask for it. Exactly one
transition row exists after an approval, and **zero** after a revision request.

| Path | Audit | Outbox |
|---|---|---|
| Approval | `design_version.approved`, actor `CUSTOMER` + grant, target `DESIGN_VERSION`, summary carrying the snapshot id, hash **reference**, quantity, step-up id and terms refs | `design.approved` (SE-005) on the **`APPROVAL_SNAPSHOT`** |
| Revision | `design_version.revision_requested`, actor `CUSTOMER` + grant, target `DESIGN_VERSION` | `design.revision-requested` (SE-004) on the **`DESIGN_VERSION`** |

Neither audit summary carries Design Document content (DB3: *"document content never in
audit (hash ref only)"*), agreement prose, a token, a grant secret, a raw challenge
secret or a contact. The revision summary deliberately omits the customer's feedback
text — it lives on the decision record where the Admin surface reads it. Neither payload
carries a token, grant secret, document content, agreement prose, storage key or provider
URL; all four exclusions are asserted by string search over the committed rows.

### The APP7 boundary

```text
accepted quotation + approved immutable design snapshot + design.approved
------------------------------------------------------------------------
APP6 STOPS
```

Eight tables are asserted empty after an approval: `orders`, `order_items`,
`payment_obligations`, `payment_attempts`, `inventory_reservations`,
`inventory_soft_holds`, `production_jobs`, `production_specifications`. No
order-creation, payment, inventory or production module is imported, so APP7's work is
**unreachable** from this injector rather than merely undone. `secure_access_grants`
still holds exactly one row: no grant is issued, reissued or rotated.

---

## 10. Idempotency

```text
namespace   = design.approve
scope       = the exact design version id (not hashed)
fingerprint = sha256(versionId | stored documentHash | canonical terms set)
replay      = the committed Approval Snapshot result
```

The multi-agreement "terms version" is resolved as *the exact set of agreement versions
this approval binds*: each entry encoded as `agreementVersionId=contentHash`, **sorted**,
so a client that re-renders its screen and submits the same evidence in a different order
**replays** rather than raising a false `IDEMPOTENCY_CONFLICT`. Pairing id with hash keeps
a superseding version distinct from the one it replaced. The document hash in the
fingerprint is the **stored** value, never the caller's copy.

A duplicate approval returns the same snapshot id and the same `approvedAt`, with a
complete seven-table census proving **zero** new rows and no rewritten timestamp. A
conflicting fingerprint on the same scope answers `IDEMPOTENCY_CONFLICT`; an in-flight
claim on the same evidence answers `DUPLICATE_OPERATION`.

---

## 11. Concurrency

All three run on **independent connections** through the delivered DB8 harness: a third
connection holds the contended row's lock, the suite waits for a real condition
(`select count(*) from pg_locks where not granted`) rather than a duration, then releases.
Which contender wins is left to PostgreSQL; what is asserted is that the outcome is whole.

- **CC-04 — approval vs revision request.** Contends on the `custom_requests` row, where
  the delivered lock order puts both decisions first. Exactly one wins; the loser is
  `INVALID_TRANSITION`. Both directions are asserted: approval-first gives APPROVE +
  snapshot + request `APPROVED` + `design.approved` once and no revision event;
  revision-first gives `REQUEST_REVISION`, **no snapshot**, request still `DESIGN_REVIEW`
  and `design.revision-requested` once. Exactly one decision row either way.
- **CC-02 — approval vs a superseding fact.** Contends on the `design_versions` row.
  Approval-first survives immutable; supersession-first makes the approval fail
  `APPROVAL_VERSION_MISMATCH` with no stale snapshot and no transition.
- **CC-16 — approval vs grant revoke.** Contends on the `secure_access_grants` row — the
  case a pre-transaction snapshot cannot decide, and the reason ADR-DB3-004 r9 exists.
  Revoke-first gives `404 SECURE_LINK_UNAVAILABLE` with zero writes; approval-first leaves
  the snapshot immutable and its `grant_id` intact, because that reference is evidence of
  how the approval was authorised, not a live capability.

**One honest limitation, recorded rather than papered over.** CC-02's competing writer is
a direct guarded row update, not a delivered use case, because **no delivered path
supersedes a `SENT_FOR_REVIEW` version**: `TR-LC08-05` supersedes `REVISION_REQUESTED`
predecessors only, and GRD-004 refuses a second send while a review is open, so
`APP6-B09` can never be that writer. The update carries
`and status = 'SENT_FOR_REVIEW'`, so it is a genuine committed-first race through the real
lock order rather than an unconditional overwrite. CC-04 is where two **delivered** use
cases genuinely contend.

---

## 12. Public error contract

```text
invalid / unavailable grant, or any definitive secure-target failure
                                     -> 404 SECURE_LINK_UNAVAILABLE
valid grant, approval lacks fresh STEP_UP
                                     -> 403 REVERIFICATION_REQUIRED    (approval only)
approval version stale or hash mismatched
                                     -> 409 APPROVAL_VERSION_MISMATCH  (approval only)
terms not exactly the current effective set
                                     -> 409 TERMS_NOT_ACCEPTED         (approval only)
decision already made / LC-08 or LC-11 refuses
                                     -> 409 INVALID_TRANSITION         (both)
idempotency claim in flight          -> 409 DUPLICATE_OPERATION
same scope, conflicting fingerprint  -> 409 IDEMPOTENCY_CONFLICT
policy or approval evidence unresolvable
                                     -> 503, opaque, no code, names no key
```

The split between `INVALID_TRANSITION` and `APPROVAL_VERSION_MISMATCH` for an ineligible
version is the authority's, not a preference: a version that was **already decided**
(`APPROVED`, `REVISION_REQUESTED`) is CC-04's *"first decision wins"*, while one that was
never decidable (`DRAFT`, `SUPERSEDED`, `VOID`) is GRD-007's *"re-read and decide again"*.
The revision path flattens every ineligible state to `INVALID_TRANSITION`, because
`TR-LC08-03` carries no GRD-007 to report. The published response sets confirm the
asymmetry: approval declares `403`, the revision request does not.

---

## 13. Module boundaries

`CustomerDesignReviewModule` is untouched and keeps its documented absences. The new
`CustomerDesignDecisionModule` imports `CustomerModule` (admission, in-transaction
reauthorization, step-up, and `CUSTOMER_REPOSITORY` for the frozen contact copy),
`CustomRequestDesignContextModule`, `CustomRequestApprovalFactsModule`, `OrderModule`
(the `TR-LC11-09` projection only), `DesignReviewReadModule` (the agreement readers, with
`ContentModule` absorbed and not re-exported), `CatalogModule`,
`CatalogPlacementReadModule`, `DatabaseModule`, `AuditModule`, `AuditContextModule` and
`RequestContextModule`. The AGG-10 and AGG-11 repositories are provided directly rather
than by importing `DesignModule`, which would have booted four public Design Session
controllers and the Session guard's whole dependency closure.

Absent: any order-creation, payment, inventory or production module; `AssetModule` and
object storage; the grant issuer and notification module; the authoring and send modules;
`ContentModule` directly. It exports nothing.

---

## 14. OpenAPI and client — one controlled cycle

```text
focused API typecheck            -> clean
focused B11 contract tests       -> 92 passed  (run BEFORE the generation slot)
openapi:generate                 -> 71 paths / 78 operations / 163 schemas   [1 run]
semantic diff                    -> +2 operations, +4 schemas, -0
                                    0 pre-existing paths changed
                                    0 pre-existing schemas changed
                                    B10 operation object byte-identical
                                    DesignDocument schema unchanged
                                    no generic decision/status operation
openapi:check                    -> up to date
api-client generate              -> 2 files, +218 / -0                        [1 run]
api-client check:generated       -> up to date (tree hash matches)
api-client typecheck             -> clean
```

`76 → 78` operations, as expected. One generation of each; no loop, and no
post-generation DTO or decorator change forced a second.

---

## 15. Focused test ledger

| Suite | Tests | Proves |
|---|---:|---|
| `public-design-decision.contract.spec.ts` | 92 | Two POST operations, ids, fixed literals, no path parameter, `.strict()` bodies, the 40-name forbidden-field matrix, no token example, agreement evidence as ids+hashes only, response shapes, no APP7 or step-up field, published refusal sets |
| `customer-design-approval.integration.spec.ts` | 11 | The committed decision, snapshot, `TR-LC11-09` with a SYSTEM actor, the audit row, `SE-005` once, Catalog and COP snapshot evidence, thread colours, frozen agreement evidence, immutability, and the eight-table APP7 boundary |
| `customer-design-approval-guards.integration.spec.ts` | 25 | GRD-007 (hash mismatch, five version states, foreign version, request left `DESIGN_REVIEW`, pointer never selects), GRD-008 (six malformed submissions, superseded terms, changed required set, unconfigurable set), GRD-002/003 (no step-up, stale window, other customer, wrong purpose, revoked, expired, unknown token) |
| `customer-design-approval-idempotency.integration.spec.ts` | 8 | Fingerprint set semantics, replay with zero new writes, order-independent replay, replay without a fresh step-up, conflict, in-flight claim, and last-write rollback with a retry |
| `customer-design-revision.integration.spec.ts` | 18 | `REQUEST_REVISION` + feedback, zero step-up, request unmoved with no transition row, no snapshot or next draft, `SE-004` once, the audit row without feedback, five ineligible states, repeat, foreign version, dead grants, and rollback |
| `customer-design-decision-race.integration.spec.ts` | 3 | CC-04, CC-02, CC-16 on independent connections behind a `pg_locks` barrier |
| `public-design-review.contract.spec.ts` (B10, updated) | 14 | B10's operation untouched; the design-review base path is now an exact three-literal set with no path parameter |
| **Total** | **171** | |

Other commands run: `apps/api` typecheck (repeatedly, each after a real source change);
`approval-snapshot.integration.spec.ts` (17 passed — its adapter and mapper changed);
all 25 `*.contract.spec` suites (because `operation-id.ts` is shared source I changed);
`openapi:generate`, `openapi:check`, `api-client generate`, `api-client check:generated`,
`api-client typecheck`; scoped Prettier and ESLint over the 28 changed files;
`git diff --check`.

### Reruns, and the concrete input change for each

| Command | Reruns | Why |
|---|---:|---|
| `apps/api` typecheck | 6 | After the union change; after the harness; after the use-case split; after the lint fixes; after the spec edits |
| `customer-design-revision` suite | 2 | First run exposed a fixture that seeded a `VOID` row without `void_reason` |
| `customer-design-approval-guards` suite | 2 | First run exposed two fixture shortcuts the database correctly refused (below) |
| `*.contract.spec` sweep | 3 | Baseline at pristine HEAD; after my change; after generation |
| `approval-snapshot` suite | 3 | Twice to establish the pre-existing environment failure, once with synthetic config |

### Two fixture shortcuts the database refused, and what replaced them

Both were **my** test defects, and both are worth recording because the refusal was
correct:

1. `update agreement_versions set content_hash = ...` was rejected by the `0030`
   immutability trigger. That is the schema stating that published terms are **replaced,
   never rewritten** — so the test now publishes a genuine superseding version through the
   delivered AGG-21 repository, which also makes it a truer model of the scenario, and it
   additionally asserts the customer can approve after re-reading the new terms.
2. `purpose = 'CONTACT_VERIFICATION'` violated the closed set; the real values are
   `SUBMISSION` and `STEP_UP`. The test now re-purposes the challenge to `SUBMISSION`,
   which is a better case anyway: the intake round that created the customer proved they
   own the contact, not that they are present now.

### Suites deliberately not run, and why

Not run by habit, per §30: the full API/repository suite; the APP3 P01/P02/session
suites; `packages/design-document` (source unchanged); B03–B09 broad suites (owned source
unchanged); the worker suite; Admin and Storefront frontend; Playwright/E2E; DB
manifest/fingerprint/checksum/index gates; migration generation or check (no DDL);
historical APP3/APP4/APP5 gate sweeps; the Figma checker (no design or frontend UI work);
full SonarQube.

B10's **read** suite was not rerun: its owned source — the read query, the review port,
the effective-agreements reader and the policy reader — is unchanged; only its *contract*
spec needed an update, and that was run. B09's send and B08's repository suites were not
rerun for the same reason. B05's security and idempotency source is untouched.

### Pre-existing failures, confirmed against a pristine worktree

`git stash` was used to run the same commands at clean `HEAD` before drawing any
conclusion:

- `approval-snapshot.integration.spec.ts` fails **identically at HEAD** in this shell for
  a missing `DESIGN_SESSION_SECRET_PEPPER` (and then object-storage config) — it boots the
  whole `DesignModule`. Re-run with **synthetic** placeholder values and no credentials:
  **17/17 pass.** Nothing was read from `.env`, nothing was written to it, and no
  credential was rotated (`CLAUDE.md` §8a).
- The `*.contract.spec` sweep has **4 failures at pristine HEAD** (an APP6-B03 send-surface
  assertion, two APP3 placement/session assertions, and a 19-paths/23-operations count).
  After this checkpoint the failure list is **the same 4** — my change adds none. They are
  untouched pre-existing debt and were not repaired, per §2 and §30.

---

## 16. Follow-ups

```text
FU-APP6-B10-AGREEMENT-ACTOR-01   = CARRIED / NONBLOCKING / OUTSIDE B11 / no schema change
FU-APP6-B08-P01-GATE-01          = CARRIED / NONBLOCKING_PREEXISTING / DO NOT REPAIR
FU-APP6-DB01-01                  = CARRIED / next real database-change checkpoint
FU-APP6-B09-CASE-REPO-SIZE-01    = CLOSED BY B10 / not reopened
APP6-A02 exact-version detail    = still a future bounded question
```

No new follow-up is raised. The CC-02 harness limitation in §11 is a recorded property of
the delivered lifecycle (GRD-004 makes the competing send unreachable), not a defect
awaiting work.

`SCOPED_COMMAND_INDEX.md` was **not** modified: no reusable command or checker was added,
and no APP6 checkpoint (B05, B09, B10) added entries for its own suites either.

---

## 17. Files

**New — API source (14)**

```text
apps/api/src/modules/design/customer-design-decision.module.ts
apps/api/src/modules/design/application/deciding/accepted-terms.authority.ts
apps/api/src/modules/design/application/deciding/approval-evidence.resolver.ts
apps/api/src/modules/design/application/deciding/approval-failure.classifier.ts
apps/api/src/modules/design/application/deciding/approval-result.ts
apps/api/src/modules/design/application/deciding/approve-design-version.use-case.ts
apps/api/src/modules/design/application/deciding/design-decision.recorder.ts
apps/api/src/modules/design/application/deciding/design-decision.target.ts
apps/api/src/modules/design/application/deciding/design-decision.view.ts
apps/api/src/modules/design/application/deciding/request-design-revision.use-case.ts
apps/api/src/modules/design/domain/review/approval-thread-colors.ts
apps/api/src/modules/design/domain/review/design-approve-idempotency.ts
apps/api/src/modules/design/domain/review/design-decision-eligibility.ts
apps/api/src/modules/design/domain/review/design-decision.errors.ts
```

**New — presentation (3) and Ordering port (3)**

```text
apps/api/src/modules/design/presentation/public-design-review-decision.controller.ts
apps/api/src/modules/design/presentation/schemas/public-design-decision.request.ts
apps/api/src/modules/design/presentation/schemas/public-design-decision.response.ts
apps/api/src/modules/order/custom-request-approval-facts.module.ts
apps/api/src/modules/order/domain/repositories/custom-request-approval-facts.port.ts
apps/api/src/modules/order/infrastructure/persistence/drizzle-custom-request-approval-facts.adapter.ts
```

**New — tests (9)**

```text
apps/api/src/modules/design/presentation/public-design-decision.contract.spec.ts
apps/api/src/modules/design/tests/integration/customer-design-decision-context.ts
apps/api/src/modules/design/tests/integration/customer-design-seed-data.ts
apps/api/src/modules/design/tests/integration/customer-design-approval-fixtures.ts
apps/api/src/modules/design/tests/integration/customer-design-approval.integration.spec.ts
apps/api/src/modules/design/tests/integration/customer-design-approval-guards.integration.spec.ts
apps/api/src/modules/design/tests/integration/customer-design-approval-idempotency.integration.spec.ts
apps/api/src/modules/design/tests/integration/customer-design-revision.integration.spec.ts
apps/api/src/modules/design/tests/integration/customer-design-decision-race.integration.spec.ts
```

**Modified (7)**

```text
apps/api/src/bootstrap/app.module.ts                                              (register the module)
apps/api/src/openapi/operation-id.ts                                              (one domain-key entry)
apps/api/src/modules/design/domain/repositories/approval-snapshot.repository.ts   (CST-131 union)
apps/api/src/modules/design/infrastructure/persistence/drizzle-approval-snapshot.repository.ts  (COP branch)
apps/api/src/modules/design/infrastructure/persistence/design-row.mapper.ts       (branch-aware mapping)
apps/api/src/modules/design/tests/integration/approval-snapshot.integration.spec.ts  (narrow on branch)
apps/api/src/modules/design/presentation/public-design-review.contract.spec.ts    (exact three-literal set)
```

**Generated (2)**

```text
packages/contracts/openapi/openapi.generated.json   (+665 / -14, meaning-additive)
packages/api-client/src/generated/*                 (+218 / -0)
```

All runtime and application source files are within the 400-line limit (largest:
`public-design-review-decision.controller.ts` at 351, then
`approve-design-version.use-case.ts` at 341); all test files are within 600 (largest:
`customer-design-decision-context.ts` at 508).

Two splits were made, both **by responsibility rather than by line range**, and both
because the file had genuinely crossed a limit:

- the approve use case first came in at 435, and `approval-result.ts` (the shape a
  `design.approve` record stores and replays — a compatibility surface with a different
  lifetime from the transaction that writes it) and `approval-failure.classifier.ts`
  (the persistence-verdict → public-code table) moved out;
- the integration harness first came in at 636, and `customer-design-seed-data.ts` (the
  Catalog chain, the COP labels and the fixture document) moved out — the harness wires a
  Nest module and mints credentials, the seed data is fixture material, and they change
  for different reasons.

---

## 18. Completion verdict

```text
APP6-B10 = ACCEPTED
APP6-B11 = COMPLETE
HTTP OPERATIONS ADDED = 2

APPROVE = TR-LC08-04 DELIVERED
REQUEST REVISION = TR-LC08-03 DELIVERED

REQUEST_ACCESS = REUSED
CUSTOMER/REQUEST AUTHORITY = GRANT-DERIVED

APPROVE EXACT VERSION + HASH = ENFORCED
APPROVE STEP-UP = ENFORCED / SERVER-DERIVED
CLIENT STEP-UP CHALLENGE ID = ABSENT
REVISION STEP-UP = NOT REQUIRED

GRD-007 = ENFORCED IN TRANSACTION
GRD-008 = ENFORCED IN TRANSACTION

CC-02 = PROVED
CC-04 = PROVED
CC-16 = PROVED FOR APPROVAL

DESIGN.APPROVE IDEMPOTENCY = DELIVERED
DUPLICATE APPROVAL = APPROVAL SNAPSHOT REPLAY

APPROVAL SNAPSHOT = IMMUTABLE / COMPLETE
CATALOG SNAPSHOT = TRUTHFUL
COP SNAPSHOT = TRUTHFUL / NO FABRICATED CATALOG
AGREEMENT EVIDENCE = EXACT B10 SET / FROZEN

APPROVE REVIEW OUTCOME = RECORDED
REVISION REVIEW OUTCOME = REQUEST_REVISION + FEEDBACK

TR-LC11-09 = SYSTEM PROJECTION IN SAME TX
DIRECT APPROVED COMMAND = ABSENT
REVISION REQUEST KEEPS REQUEST = DESIGN_REVIEW
DESIGN_REVIEW SELF-TRANSITION = ABSENT

DESIGN.REVISION-REQUESTED = EMITTED ONCE
DESIGN.APPROVED = EMITTED ONCE

ORDER/PAYMENT/INVENTORY/PRODUCTION SIDE EFFECTS = NONE
SERVER RASTER / STORAGE LEAK = NONE
NEW GRANT ISSUANCE = NONE
DATABASE MIGRATION = NONE

A01/A02/S01/S02 = NOT STARTED
NEXT CHECKPOINT = APP6-A01
```

```text
LOCAL COMMIT = 1033880
PUSHED = NO
```
