# APP5-B02 — Customer Attachment Intake

## 1. Verdict

```text
BLOCKED — APP5_B02_PERSISTENT_INTAKE_PROVENANCE_REQUIRED
```

The upload lane itself is buildable from existing components — `IMP-D048`'s
streamed multipart path, the media-signature and decode controls, the asset
state machine and the inspection outbox handoff are all present and reusable
without modification. What is **not** representable in the current schema is the
one fact the locked `APP5-G01` §7 abuse policy is written in terms of: **which
verification challenge a customer upload was made under**.

Two independent §5/§9 requirements of this checkpoint depend on that single
missing fact:

1. **`G01-D13` — max 20 accepted uploads per challenge.** There is no persisted
   challenge-scoped counter, and no existing column, index or platform store
   from which a challenge-scoped count can be derived.
2. **Pre-submission orphan lifecycle.** `G01` §7 states that unbound B02 assets
   *"expire with their challenge's TTL class"*. An `assets` row carries no
   challenge reference and no intake expiry, so no sweep — the existing one
   included — can identify a B02 orphan or decide when it is due.

Per `docs/implementation/08-DATABASE-CHANGE-CONTROL.md` §3, the dependent
checkpoint stops and a database change request is raised rather than a migration
being smuggled into a feature checkpoint. **No runtime code, schema, migration,
contract, generated artifact or Figma node was changed by this checkpoint.**

---

## 2. Baseline and authority

| Item | Value |
| --- | --- |
| Branch | `production` |
| HEAD at entry | `0adc7fc` |
| Working tree at entry | clean |
| HEAD at exit | `0adc7fc` (documentation commit only — §10) |
| Governing authority | `docs/implementation/audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md` §6, §7 |
| B01 baseline | `POST /api/public/custom-requests` — `publicCustomRequest_submit`, delivered `a28c3cc` |
| Latest migration | `0034_add_app3_placement_and_derivative_authority` |
| Schema / migrations | untouched |
| Generated artifacts | untouched |
| Figma | not opened, not read live, not modified |

### 2.1 Existing intake components audited for reuse

All of these were read and all are reusable **as-is**; none is the blocker.

| Component | Path | Verdict |
| --- | --- | --- |
| Public streamed session upload (the `IMP-D048` precedent) | `apps/api/src/modules/design/presentation/public-design-session-asset.controller.ts` | reusable shape |
| Session intake orchestrator | `apps/api/src/modules/design/application/session-asset-intake.service.ts` | reusable shape |
| Admin intake orchestrator | `apps/api/src/modules/asset/application/asset-intake.service.ts` | reusable shape |
| Multipart parser | `apps/api/src/modules/asset/infrastructure/http/multipart-upload.parser.ts` | reusable verbatim |
| Stream validator (size/signature/decode/pixels) | `apps/api/src/modules/asset/infrastructure/http/validated-file.reader.ts` | reusable verbatim |
| Media signature allowlist | `apps/api/src/modules/asset/domain/media-signature.ts` | reusable verbatim |
| Tx A / Tx B + inspection dispatch | `apps/api/src/modules/asset/application/upload-transactions.service.ts` | reusable verbatim |
| Object storage port (no presign operation exists) | `apps/api/src/modules/asset/infrastructure/storage/object-storage.provider.ts` | reusable verbatim |
| Asset ownership projection | `apps/api/src/modules/asset/domain/repositories/asset.repository.ts` — `uploadedByCustomerId` | reusable verbatim |
| B01 binder expectations | `apps/api/src/modules/order/application/request-asset-binder.ts` | satisfied by the above |

---

## 3. Persistence-capability preflight (§5) — the blocker in detail

### 3.1 The exact missing persisted fact

> **A durable, challenge-scoped reference from a customer upload back to the
> `contact_verification_challenges` row that authorized it**, together with the
> intake expiry that reference implies.

Concretely, the natural expression is one nullable provenance column on TBL-022
beside the two that already exist —

```text
assets.uploaded_by_customer_id   -- exists (REL-033, customers edge)
assets.uploaded_via_session_id   -- exists (REL-033, design_sessions edge, FK added in 0010)
assets.uploaded_via_challenge_id -- MISSING
```

— plus the partial index that makes the count and the sweep bounded.

### 3.2 Why each existing mechanism cannot enforce `G01-D13`

Every mechanism §5 names as acceptable was examined against the actual code and
schema, not against expectation.

| Candidate mechanism | Actual state | Why it cannot carry the rule |
| --- | --- | --- |
| Provenance already on the asset/intake model | `assets` has `uploaded_by_customer_id` and `uploaded_via_session_id` (`packages/database/src/schema/asset/assets.ts:85-86`) | Customer scope is **not** challenge scope: `CST-007` makes at most one *ISSUED* challenge unique per `(contact_kind, normalized_value, purpose)`, so one customer with an EMAIL and a PHONE contact point can hold two concurrent `VERIFIED` `SUBMISSION` challenges. Counting by customer is the customer-wide weakening §2.6 forbids. The session edge is a real FK to `design_sessions` (migration `0010`) and the COP branch has **no session at all** (`G01` §3) — it cannot hold a challenge id without lying about the column |
| An existing DB-backed rate/quota record keyed by challenge | The only limiter is `SlidingWindowRateLimiter` (`apps/api/src/platform/rate-limit/sliding-window-rate-limiter.ts`) | Its own header states counters are *"in-memory… reset on restart and are not shared across replicas"*. §5 explicitly forbids an in-memory map and process-local state. No rate-limit or quota **table** exists anywhere in the schema |
| An existing security/abuse allocation store at challenge scope | `IdempotencyAllocationStore` over `idempotency_records` (`packages/persistence/src/platform/idempotency-allocation.ts`) | The store exposes claim / lock / renew / complete only — `IdempotencyStore` adds claim / complete / release / find. **There is no count, group or scan operation, and the columns cannot support one**: `scope_key` is a SHA-256 digest by construction (`asset/domain/idempotency-key.ts` — `buildScopeKey` hashes `staff:{actor}:{key}`), and `ADR-DB1-017` r1 fixes `operation_namespace` as a constant, not a free string. Making the challenge id countable would mean either storing the live submission credential in clear in a table, or adding a second 20-row slot ledger beside the upload's own record — duplicate state, which §5 forbids |
| Asset ownership metadata **plus** another persisted authority retaining challenge scope | `contact_verification_challenges` (`packages/database/src/schema/customer/contact-verification-challenges.ts`) | The table has no customer column, no counter, no lockout state and no next-attempt timestamp — its own header records that DB4 stores none and *"none is invented"*. Joining customer → contact point → challenge yields the **set** of a customer's challenges; nothing anywhere records which of them an individual asset came through, so the join cannot attribute an upload to a challenge |
| `contact_verification_attempts` as the counter | `packages/database/src/schema/customer/contact-verification-attempts.ts` | It is challenge-keyed (`IDX-111`), which is why it was checked. It is nonetheless unusable twice over: its `outcome` is a CHECK-enforced closed set `MATCH \| MISMATCH \| EXPIRED_AT_ENTRY` with no upload member, and these rows **are** the GRD-026 rate-limit window — writing upload rows here would corrupt the OTP failure budget it exists to compute |
| `custom_request_assets` as a pre-binding ledger | `packages/database/src/schema/ordering/custom-request-assets.ts` | `custom_request_id` is `NOT NULL` with a `restrict` FK. A pre-submission row is unrepresentable, which is the correct design — B02 must not create or bind a request (§20) |
| `audit_events` as the counter | `packages/database/src/schema/audit/audit-events.ts` | `G01` §9.2 bounds APP5's use of this table to guard-failure abuse signals; it is Tier-B log data, not a quota arbiter, and deriving an enforcement decision from a retention-swept log would be exactly the pretence §5 forbids |

### 3.3 Why the orphan lifecycle fails on the same fact (§9)

`G01` §7 defers orphan cleanup to *"the existing scheduled sweep (SE-015) with
two-phase binary deletion (SE-014)"* and instructs that **APP5 adds no new
sweep**. Two findings:

- **No orphan sweep exists.** The worker ships exactly three jobs —
  `asset-inspection`, `asset-normalization`, `notification-delivery`
  (`apps/worker/src/jobs/`). SE-014/SE-015 are specified but not implemented.
- More importantly, **a future sweep still could not identify a B02 orphan.**
  With no challenge reference and no intake expiry on the asset row, an unbound
  `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` asset is indistinguishable from one
  whose submission is legitimately still in progress. The sweep needs the same
  column the quota needs.

Per §9's instruction, this is reported under the §5 blocker discipline rather
than resolved by inventing ungoverned cleanup.

### 3.4 What is **not** the blocker

Stated explicitly, because §5 rules these out as blockers:

- No controller, use case, DTO, module wiring or test file is missing in a way
  that matters — those are B02's own work and were never the obstacle.
- Customer **ownership** provenance is fully available: `uploaded_by_customer_id`
  exists on TBL-022 with its `REL-033` FK, is already accepted by
  `RegisterAssetInput`, and is already read by B01's `RequestAssetBinder`. §7 of
  the checkpoint brief is satisfiable today.
- The media policy, byte/pixel limits, signature and decode controls, the
  private classification, the inspection handoff and the no-presign transport
  are all reusable without a single change.

Had `G01-D13` been a customer-scoped or a global bound, B02 would have shipped.
It is challenge-scoped, and that scope has no persistent home.

### 3.5 Reconciliation with `APP5-R00`

`APP5-R00` recorded the baseline expectation `NO_APP5_MIGRATION expected —
TBL-037…042 + idempotency_records all exist`. That expectation is **correct for
what it examined** — every *request-side* table B01 needed does exist, and B01
shipped with no migration. What R00 did not examine, because the policy did not
exist yet, was the *intake-lane* provenance that `APP5-G01` §7 subsequently
locked. `G01` is an authority checkpoint that changed no code and ran no schema
audit; it set a challenge-scoped bound without confirming a challenge↔asset link
exists. B02 is the first checkpoint in a position to discover that, and does.

This is a genuine persistence gap under `08-DATABASE-CHANGE-CONTROL.md` §3 step
5 — **not** a defect in a delivered component and **not** an implementation
misunderstanding.

---

## 4. Smallest database checkpoint required

Recommended as **`APP5-DB01`**, following the `APP2-DB01` / `APP3-DB01`
precedent in the application-era migration log, as its own checkpoint and not
combined with the feature API implementation (`08-DATABASE-CHANGE-CONTROL.md`
§4).

| Element | Proposal |
| --- | --- |
| Migration | one forward-only migration, `0035_add_app5_intake_provenance` |
| Column | `assets.uploaded_via_challenge_id` — nullable `idReference`, FK → `contact_verification_challenges.id`, `ON DELETE SET NULL` (the challenge family is hard-TTL-deleted, so this matches the existing `REL-007` and `uploaded_via_session_id` precedents exactly) |
| Index | one partial index on `(uploaded_via_challenge_id)` restricted to live intake states, serving both the quota count and the orphan sweep |
| Optional second column | an intake expiry instant, if DB review prefers the orphan due-date to be materialised rather than joined through the challenge |
| Documentation | `DB4_COLUMN_DICTIONARY.md` (new `COL-TBL022-*` row), `DB4_TABLE_CATALOG.md` TBL-022, the `REL-033` relationship note, and the application-era migration log |
| Tests | fresh install, upgrade path, no-op/drift, FK and index behaviour, per §4 of the standard |
| Handoff | unblocks `APP5-B02`; nothing else is waiting on it |

Two properties this buys that no alternative does: the quota becomes an indexed
`count(*)` at exact challenge scope that can be taken under the challenge row's
lock (closing the check-then-act race a derived count cannot), and the orphan
sweep gains the anchor `G01` §7 already promised it.

**A migration was not written, staged or smuggled into this checkpoint.** The
proposal above is a change request for review, not an applied change.

---

## 5. Endpoints

**None.** No route, controller, DTO or module was added. The intended surface —
one streamed multipart operation, with a status read only if the asynchronous
inspection model required it — was not created, because it cannot be published
without the enforcement §2.6 makes a precondition of publishing it.

---

## 6. Upload pipeline map (as audited)

Recorded so the unblocked run does not re-derive it. Every row is an existing
component; the two blocked rows are the checkpoint.

| Concern | Reused / new owner | State |
| --- | --- | --- |
| challenge authorization | `VerificationChallengeRepository` + `submit-verification-attempt` identity path (APP4) | available |
| **quota (20 / challenge)** | — | **BLOCKED — no persisted challenge-scoped counter** |
| stream validation | `consumeValidatedFile` + `assertAcceptedMediaType` | reusable verbatim |
| storage | `ObjectStoragePort.putObjectStream` (no presign operation exists on the port) | reusable verbatim |
| asset row | `AssetRepository.registerOrRecover` (Tx A) | reusable verbatim |
| ownership | `RegisterAssetInput.uploadedByCustomerId` → `assets.uploaded_by_customer_id` | available |
| inspection dispatch | `UploadTransactionsService.commitInspectionHandoff` (Tx B) → outbox → `asset-inspection` worker | reusable verbatim |
| state read | `AssetRepository.findScoped` | available |
| **orphan cleanup** | SE-014 / SE-015 | **BLOCKED — not implemented, and cannot identify a B02 orphan without the same column** |

---

## 7. G01 compliance matrix

| `G01` §7 control | Satisfiable with today's repository? |
| --- | --- |
| Verified, unexpired, `SUBMISSION`-purpose challenge required | yes |
| No customer account/session introduced | yes |
| No client-supplied `customerId` | yes |
| Streamed multipart through the API | yes |
| No presign / storage credential / upload token | yes — `ObjectStoragePort` exposes no presign operation |
| Role allowlist `COP_IMAGE` / `REFERENCE`; `ATTACHMENT` refused | yes |
| JPEG / PNG / WebP only, SVG refused, declared MIME never trusted | yes |
| 10 MiB / 4096×4096 / 16,777,216 pixels | yes |
| `CUSTOMER_UPLOAD` + `CUSTOMER_PRIVATE`, never publicly delivered | yes |
| Not bindable until inspection reaches `ACCEPTED` | yes |
| Bounded rejection disclosure | yes |
| No post-submission mutation | yes |
| **20 accepted uploads per challenge** | **no — §3** |
| **Orphan expiry at the challenge's TTL class** | **no — §3.3** |

Thirteen of fifteen controls are already met by components in the tree. The two
that are not are the two that need the missing fact, and neither can be claimed
without pretending.

---

## 8. B01 interoperability

Not demonstrated, and deliberately not simulated. The proof §23.7 asks for —
B02 upload → inspection `ACCEPTED` → B01 submission → asset bound — requires a
B02 upload to exist. Fabricating the asset row directly and calling that a B02
interoperability proof would be evidence of the fixture, not of the lane.

What *is* established by reading `RequestAssetBinder`: the binder requires
`kind = CUSTOMER_UPLOAD`, `classification = CUSTOMER_PRIVATE`,
`status = ACCEPTED`, `deletedAt` unset and
`uploadedByCustomerId === input.customerId`. Every one of those five is
producible by the intake path audited in §6 once the lane exists, so B01 imposes
no additional blocker.

---

## 9. Validation ledger

| Command | Impact reason | Result | Reruns |
| --- | --- | --- | ---: |
| *(none)* | No runtime, test, contract or generated file was changed, so no validation is justified under `VALIDATION_GOVERNANCE.md` §3 | n/a | 0 |

The audit was read-only: `git log` / `git status`, directory listings, targeted
`grep` and file reads.

Explicitly **not** run, and not needed: full Jest, the full API integration
suite, asset/APP3/APP4 regression, B01's submission group, Playwright/E2E,
Storefront/Admin tests, DB regression, all-workspace typecheck or build,
SonarQube, and — per §15 — `tools/check-app3-p03.mjs` or any other historical
APP3 surface-count gate.

No temporary worktree, directory junction, symlinked `node_modules` or
repository clone was created (§16). The blocker was established by reading the
schema and the stores directly.

---

## 10. OpenAPI / generated client

No generation was run; counts are **0 / 0**. The public API surface is
unchanged, so `openapi.generated.json` and `packages/api-client` remain fresh
against `HEAD`. No route, operation id or schema delta exists to review for
secret or storage disclosure.

---

## 11. Changed files

| Group | Files |
| --- | --- |
| Runtime | *(none)* |
| Tests | *(none)* |
| Generated | *(none)* |
| Schema / migrations | *(none)* |
| Docs | `docs/implementation/reports/APP5-B02-COMPLETION-REPORT.md` (new), `docs/implementation/phases/APP5-CUSTOM-REQUESTS.md` (status row + baseline-expectation correction) |

---

## 12. Roadmap

| Checkpoint | Status | Note |
| --- | --- | --- |
| `APP5-R00` | `COMPLETE` | Phase-entry audit |
| `APP5-G01` | `COMPLETE` | Submission/moderation/intake authority |
| `APP5-D01` | `COMPLETE` | Product Owner approved |
| `APP5-B01` | `COMPLETE` | Request submission backend |
| `APP5-DB01` | `INCOMPLETE` | **Next — new.** Intake provenance change request + migration (§4) |
| `APP5-B02` | `BLOCKED` | `APP5_B02_PERSISTENT_INTAKE_PROVENANCE_REQUIRED` — awaits `APP5-DB01` |
| `APP5-B03` | `INCOMPLETE` | Grant-scoped request status read |
| `APP5-B04` | `INCOMPLETE` | Admin request queue & detail |
| `APP5-B05` | `INCOMPLETE` | Admin notes & transitions |
| `APP5-S01` | `INCOMPLETE` | Request creation & submission |
| `APP5-S02` | `INCOMPLETE` | Confirmation & status |
| `APP5-A01` | `INCOMPLETE` | Admin queue |
| `APP5-A02` | `INCOMPLETE` | Admin detail/moderation |
| `APP5-E01` | `INCOMPLETE` | Cross-layer acceptance |
| `APP5-X01` | `INCOMPLETE` | Phase closure |

`APP5-B03` is **not** started, and is not next: it does not depend on B02, but
the roadmap order stands and B02 is the blocked item awaiting a decision.

---

## 13. Residual risks and follow-ups

| Id | Item |
| --- | --- |
| `FU-APP5-B02-DB-PROVENANCE-01` | The change request of §4 needs Product Owner / DB review before any migration work. Until it closes, APP5 has no customer upload lane, so the **COP branch is unsubmittable end to end** — `G01-D10` requires ≥1 `COP_IMAGE` and nothing can produce one |
| `FU-APP5-B02-ORPHAN-SWEEP-01` | SE-014/SE-015 are specified but unimplemented; no orphan sweep exists for any customer upload, including APP3 session assets. Pre-existing, wider than APP5, and recorded here because §9 required checking it |
| `FU-APP5-B02-R00-BASELINE-01` | `APP5-R00`'s `NO_APP5_MIGRATION expected` baseline is corrected in the phase plan by this checkpoint. Future phase-entry audits should schema-check authority checkpoints' *policy* bounds, not only their table inventory |

No partial implementation, dead code, disabled test or speculative abstraction
was left in the tree.

---

```text
BLOCKED — APP5_B02_PERSISTENT_INTAKE_PROVENANCE_REQUIRED
```
