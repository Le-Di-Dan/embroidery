# APP10-G01 — Completion Report

**Checkpoint:** `APP10-G01` — Phase Entry Baseline & Canonical Roadmap Audit
**Phase:** APP10 — Customer Operations and Communication
**Date:** 2026-08-28 · **Mode:** AUDIT / DOCUMENTATION_ONLY

## A. Verdict

```text
APP10-G01                  = COMPLETE
MODE                       = AUDIT / DOCUMENTATION_ONLY
CANDIDATES_AUDITED         = 15 / 15
ACTIVE_APP10_CHECKPOINTS   = 10  (was 15 candidates)
ALREADY_DELIVERED          = 3   (B03 agreements, B04, A03)
REMOVED                    = 4   (C01, C02, C03, C04)
DEFERRED                   = 1   (S01)
SPLIT                      = 2   (B01, B02)
RENAMED                    = 2   (B01, A01)
KEPT_AS_IS                 = 4   (A02, I01, E01, X01)
NEW_CHECKPOINTS            = 1   (APP10-D01)
NEW_HTTP_OPERATIONS        = 7   (predicted; none reaches the 5-op maximum)
MIGRATIONS_REQUIRED        = 0   (APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED)
WORKER_CHANGES_REQUIRED    = 0
NEXT_CHECKPOINT            = APP10-B01
PO_DECISION_REQUIRED       = NONE
NOT_PUSHED                 = true
```

No runtime behaviour was implemented. No source file, test, schema, migration,
generated artifact, OpenAPI document, generated client or Figma node was
touched.

```text
CONTRADICTION_WITH_STRONGER_AUTHORITY = ONE FOUND
                                        (§H.1 — resolved by source-of-truth order,
                                         recorded for the merge checkpoints)
```

## B. Repository baseline summary

Measured read-only against the committed working tree.

```text
BRANCH          production
ENTRY_HEAD      644b204  docs(app9): close the remaining payment and fulfillment phase (APP9-X01)
WORKING_TREE    clean at entry
PREVIOUS_PHASE  APP9 = CLOSED (PASS_WITH_FOLLOW_UPS, 0 blocking)
APP10_EXECUTION NONE at entry
```

| Baseline | Count | Source |
|---|--:|---|
| OpenAPI paths | 100 | `packages/contracts/openapi/openapi.generated.json` |
| OpenAPI operations | 108 | same |
| OpenAPI schemas | 222 | same |
| Migrations | 37 | `packages/database/migrations/*.sql` |
| Admin routes (`page.tsx`) | 21 | `apps/admin/src/app` |
| Storefront routes (`page.tsx`) | 12 | `apps/storefront/src/app` |
| Figma registry rows | 495 | `docs/design/FIGMA_DESIGN_INDEX.md` |

These match the APP9-X01 closure baseline exactly; nothing drifted between
phases.

### B.1 Customer / notification HTTP surface that exists today

Five operations, all APP4, all Admin-guarded:

```text
POST /api/admin/customers/resolve                       adminCustomerSupport_resolve   (APP4-B07)
GET  /api/admin/customers/{customerId}                  adminCustomerSupport_detail    (APP4-B07)
GET  /api/admin/customers/{customerId}/grants           adminCustomerSupport_grants    (APP4-B07)
GET  /api/admin/notification-intents                    adminNotificationIntent_list   (APP4-B08)
POST /api/admin/notification-intents/{intentId}/replay  adminNotificationIntent_replay (APP4-B08)
```

There is **no** `GET /api/admin/customers` list and no customer search. This is
a deliberate, reasoned APP4-B07 refusal — *"a masked-value list is a customer
database with a thin veil, and a partial-match query is an oracle over whether
an address belongs to anybody"* — and it agrees with APP10's own out-of-scope
line *Cross-customer data exposure*. §D keeps it refused.

There is **no** customer mutation of any kind: no create, edit, contact
verify/unverify, primary rotation, merge or anonymization.

### B.2 Modules, tables and surfaces

| Area | Delivered artefact | Phase |
|---|---|---|
| Customer module | `apps/api/src/modules/customer` — 4 controllers, `CustomerRepository`, `AdminCustomerSummaryPort`, contact normalization + masking, secure grants, verification | APP4 |
| Notification module | `apps/api/src/modules/notification` — intent intake, admin list query, replay use case, replay eligibility, manual-replay idempotency key | APP4 |
| Notification worker | `apps/worker/src/jobs/notification-delivery` — attempt loop, `notification.delivery` policy (`maxAttempts` + `retryDelaysSeconds`, fail-closed, no in-code default), bounded `errorClass`, sealed envelope | APP4-W01 |
| Content module | `apps/api/src/modules/content` — `AgreementRepository`, `PublishApp6AgreementsUseCase` | APP6 |
| Agreement acceptance | `design/application/deciding/accepted-terms.authority.ts`, `approval_snapshot_agreement_acceptances` | APP6-B11 |
| Admin surface | `/support/customer-access` — lookup, contact, grant, **notification + replay** panels | APP4-A01 |
| Merge tables | `customer_merge_cases` (TBL-009), `customer_merge_events` (TBL-010), `customers.merged_into_customer_id` | DB, migration `0014` |
| Agreement tables | `agreements` (TBL-068), `agreement_versions` (TBL-069) | DB, migrations `0018`/`0019` |

## C. Existing authority map — what APP10 reuses

APP10 writes almost no new foundation. It reuses:

| Reused authority | Where | APP10 consumer |
|---|---|---|
| `AuthenticatedAdminGuard` (binary, no role model) | `identity/presentation/guards` | every APP10 Admin endpoint |
| `StaffOriginGuard` / `StaffJsonBodyGuard` (CSRF layering on staff mutations) | same | B01, B02, B03 |
| Contact masking (`mask-contact.ts`) and the "masked and only masked" projection rule | `customer/domain/contact` | B01, B02, A01, A02 |
| `resolveByContact` equality lookup (no enumeration, uniform 404) | `AdminCustomerSupportQuery` | how an operator *finds* both merge participants |
| `CustomerRepository`, `AdminCustomerSummaryPort` | `customer/domain/repositories` | B01, B02, B03 |
| `SecureAccessGrantRepository` + revoke use case | `customer/...` | B03 `GRANT_REVOKE` step |
| Merge schema, `CUSTOMER_MERGE_CASE_STATES`, `MERGE_EVENT_STEP_KINDS`, CST-010 partial unique | `packages/database` | B02, B03 — **no migration** |
| Notification list + replay + `ReplayEligibilityResolver` + `manual-replay-key` idempotency | `notification/...` | reused unchanged by E01 |
| Agreement versioning + immutable acceptance evidence (GRD-008) | `content` + `design` | reused unchanged; APP10 adds nothing |
| Standard API envelope, `ApiSuccessCode`, audit recorders | `platform/...`, `audit` | all |
| `/support/customer-access` screen + its 18 approved Figma frames | `apps/admin`, `FIGMA_DESIGN_INDEX` | A01 extends, does not replace |

**Authorization reality (recorded, not changed).** APP1-B01 is a *binary*
authenticated-admin gate: `admin_accounts` carries no role column and
`AuthenticatedAdminGuard` performs no role check. The critical journey's
"unauthorized staff cannot access or merge customer data" is therefore
satisfied by the 401 path (no session, invalid, expired, revoked, or disabled
account) together with `StaffOriginGuard` on mutations. Introducing an RBAC
model in APP10 would be speculative architecture requiring an ADR, and is
**not** in the roadmap.

## D. Candidate checkpoint audit matrix

Every one of the 15 candidates in the phase document receives a decision.

| Candidate | Decision | Evidence | Reason | Replacement / New ID |
|---|---|---|---|---|
| `APP10-C01` Customer profile operations contract | `REMOVE` | APP4-B07 already fixed the contract shape (envelope, masking, `resolve`-by-contact, `AdminCustomerDetailResponse`) | No cross-context decision, no reuse across multiple checkpoints, no blocking ambiguity — all §5.2 criteria fail. This is a one-file planning checkpoint | folded into `APP10-B01` |
| `APP10-B01` Customer profile operations backend | `SPLIT` → `RENAME` | *search* and *read* ship as `adminCustomerSupport_resolve` + `_detail`; **no mutation exists anywhere** | Only the bounded **update** half is undelivered. Keeping "search/read/update" would re-deliver two thirds of APP4-B07 | `APP10-B01` — Customer profile & contact maintenance (3 ops) |
| `APP10-A01` Admin customer list/detail | `RENAME` | `/support/customer-access` exists with lookup + contact panels and 18 approved frames; `GET /api/admin/customers` deliberately does not exist | A **list** contradicts a delivered, reasoned APP4-B07 refusal and APP10's own out-of-scope *cross-customer data exposure*. The screen is extended, not created | `APP10-A01` — Admin customer profile maintenance UI |
| `APP10-C02` Customer merge contract | `REMOVE` | the cross-module ownership-transfer seam and the DB3/TBL-009 contradiction are settled in this report (§E.2, §H.1) | The one thing that justified a contract checkpoint is resolved here; a separate document-only checkpoint would merely restate it | absorbed into `APP10-G01` |
| `APP10-B02` Customer merge backend | `SPLIT` | five step kinds across four modules (`customers`, `customer_contact_points`, `secure_access_grants`, `custom_requests`, `orders`, `assets`), ordered two-row locks (CC-27), preview + execute + reject | One checkpoint would mix a 3-op read/lifecycle surface with the heaviest transaction in the phase. Reviewability fails | `APP10-B02` (lifecycle + preview, 3 ops) and `APP10-B03` (execution, 1 op) |
| `APP10-A02` Admin customer merge workflow | `KEEP` | no Figma merge rows exist; no Admin merge UI exists | Valid as-is: one screen, one bounded workflow | `APP10-A02` (depends on `D01`) |
| `APP10-C03` Agreement contract | `REMOVE` | `agreements`/`agreement_versions` shipped in `0018`/`0019`; `AgreementRepository.effectiveVersions` resolves the PUBLISHED, in-window, non-superseded row | The contract already exists and is exercised by production code | — |
| `APP10-B03` Agreement backend | `ALREADY_DELIVERED` | `PublishApp6AgreementsUseCase`, `EffectiveAgreementsReader`, `AcceptedTermsAuthority` (GRD-008 re-resolved **inside** the approval transaction), `approval_snapshot_agreement_acceptances` (CST-091 immutable; the hash is taken from persistence, never from the caller), `app6-agreement-publication.integration.spec.ts`, storefront `agreement-list.tsx` | Versioned agreement **and** immutable acceptance evidence both ship. APP10's "where required" clause is satisfied by APP6; a second agreement subsystem would be speculative and would create a rival source of legal truth | — (renumbering frees `B03` for merge execution) |
| `APP10-C04` Notification operations contract | `REMOVE` | `adminNotificationIntent_list` / `_replay` published, with `PUBLISHED_INTENT_STATES`, masked recipient and bounded `errorClass` | Contract delivered by APP4-B08 | — |
| `APP10-B04` Notification operations backend | `ALREADY_DELIVERED` | list with `status` + `customerId` filters and a fixed page size; `ReplayNotificationDeliveryUseCase` with `manual-replay-key` idempotency (`CREATED`/`EXISTING`); `ReplayEligibilityResolver` → `REISSUE_REQUIRED`; refusals `REPLAY_NOT_APPLICABLE` and `REPLAY_SOURCE_UNAVAILABLE`; redaction enforced by total projection functions; 6 integration specs | "Safe search, retry eligibility, redaction and audit" all ship. The deliberate absence of a message body, provider response and raw recipient is a **security property**, not a gap | — |
| `APP10-A03` Admin notification operations | `ALREADY_DELIVERED` | `notification-panel.tsx` (attempt timeline: instant, outcome, `errorClass`), `replay-dialog.tsx`, `use-notification-replay.ts`, and 6 approved `FIG-ADMIN-DELIVERY-*` frames including `REPLAYDUPLICATE` and `REISSUEREQUIRED` | Attempt history, failure class and authorized retry all ship inside APP4-A01 | — |
| `APP10-S01` Customer profile/contact preferences | `DEFER` | PRD §4 *"Khách không bắt buộc tạo tài khoản bằng mật khẩu"*; `customers` carries no credential column by design (DB4 §2); customer reach is per-grant secure links (`REQUEST_ACCESS`, one grant per (customer, request)) bound to a single request | There is **no customer account**, so there is no session in which a customer could own and edit a profile. A grant-scoped preferences screen would let a link issued for one request mutate identity-wide state. No approved flow requires it | deferred; owner = PO, revisit only with an account model |
| `APP10-I01` Zalo/Messenger simple handoff | `KEEP` | zero Zalo/Messenger implementation exists; `storefront-shell-footer.test.tsx` actively asserts **no** social/contact link is rendered; PRD §11 requires *"Hiển thị nút Zalo / nút Messenger"*; BR-018 and SYSTEM_ARCHITECTURE §76 lock them to external contact links | Real, required, undelivered — and correctly tiny. Configured URLs only | `APP10-I01` (storefront only, 0 endpoints) |
| `APP10-E01` Customer operations E2E | `KEEP` | — | Phase acceptance | `APP10-E01` |
| `APP10-X01` Phase closure | `KEEP` | — | Phase closure | `APP10-X01` |
| *(new)* | `NEW` | the registry was searched for `merge`, `zalo` and `messenger` — **zero** rows for each | Material UI is missing for three surfaces; the project rule delivers design as **one** package | `APP10-D01` |

## E. Canonical APP10 roadmap

Ten checkpoints. Seven new HTTP operations, zero migrations, zero worker
changes, zero new backend modules.

| Order | ID | Capability | Scope | Expected API/UI size | Depends on | Status |
|--:|---|---|---|--:|---|---|
| 1 | `APP10-G01` | Phase-entry baseline & canonical roadmap audit | docs | 0 ops | APP9 closed | `COMPLETE` |
| 2 | `APP10-B01` | Customer profile & contact maintenance | `customer` module | 3 ops | G01 | `NEXT` |
| 3 | `APP10-B02` | Merge case lifecycle & consequence preview | `customer` module | 3 ops | B01 | `INCOMPLETE` |
| 4 | `APP10-B03` | Merge execution & immutable event history | `customer` module + transfer seam | 1 op | B02 | `INCOMPLETE` |
| 5 | `APP10-D01` | One complete APP10 Figma design package (`APP_10` page) | `docs/design` + Figma | 0 ops | B03 | `INCOMPLETE` |
| 6 | `APP10-A01` | Admin customer profile maintenance UI | `apps/admin` | 0 ops | D01 approved | `INCOMPLETE` |
| 7 | `APP10-A02` | Admin customer merge workflow | `apps/admin` | 0 ops | D01 approved, B03 | `INCOMPLETE` |
| 8 | `APP10-I01` | Zalo/Messenger simple handoff | `apps/storefront` | 0 ops | D01 approved | `INCOMPLETE` |
| 9 | `APP10-E01` | Customer operations cross-boundary acceptance | scoped api/admin commands | 0 ops | A01, A02, I01 | `INCOMPLETE` |
| 10 | `APP10-X01` | Phase closure, baselines, follow-up classification | docs | 0 ops | E01 | `INCOMPLETE` |

Backend order precedes design, matching the APP9 precedent (B01…B05 → D01 →
A01/S01): the approved frames must be drawn against a contract that exists.

### E.1 `APP10-B01` — Customer profile & contact maintenance (3 operations)

```text
PATCH /api/admin/customers/{customerId}                                  adminCustomer_update
POST  /api/admin/customers/{customerId}/contacts/{contactId}/primary     adminCustomerContact_promote
POST  /api/admin/customers/{customerId}/contacts/{contactId}/deactivate  adminCustomerContact_deactivate
```

Bounded deliberately:

- **Mutable:** `customers.display_name`, `customers.notes`. DB4 classifies the
  row `mutable`; both columns exist and are written by nothing today.
- **Immutable, and must stay so:** `verified_at` (NOT NULL and immutable per
  ADR-DB2-001 Option A), `merged_into_customer_id` (owned by B03) and
  `anonymized_at` (retention, not APP10).
- **A verified contact is never overwritten in place.** Promotion only moves
  `is_primary` between contacts that are *already verified and active*, with
  the CST-006 partial unique as the arbiter. Deactivation sets
  `deactivated_at`, never deletes, and must refuse both the last verified
  contact and the primary one.
- **No contact *creation* here.** Minting a verified contact requires a
  verification challenge (LC-02); an Admin write that created one would forge
  the proof the whole identity model rests on. Adding a contact remains the
  customer verification flow's job, and DB3 §6 already lists *contact change*
  among the step-up-sensitive actions.
- **Publication change required.** `AdminCustomerDetailResponse` currently
  publishes contacts with no id (`kind`, `maskedValue`, `verified`, `primary`).
  B01 must add an opaque `contactId` so the two contact operations are
  addressable — a deliberate, reviewable projection change, and the only one.

### E.2 `APP10-B02` / `APP10-B03` — merge, split at the transaction boundary

```text
B02  POST /api/admin/customer-merges                  adminCustomerMerge_open    (REQUESTED)
     GET  /api/admin/customer-merges/{caseId}         adminCustomerMerge_detail  (+ consequence preview)
     POST /api/admin/customer-merges/{caseId}/reject  adminCustomerMerge_reject  (REJECTED, reason required)

B03  POST /api/admin/customer-merges/{caseId}/execute adminCustomerMerge_execute (EXECUTED)
```

Both participants are found with the existing `resolve`-by-contact lookup — no
customer list is introduced.

**B02** owns the case lifecycle and the *preview*: it counts, without writing,
what execution would move — requests, orders, uploaded assets, contact points,
active grants — so the operator confirms consequences before committing. A
reason is mandatory on open and on reject (DB3 §4). CST-010's partial unique
rejects a second open case for the same pair outright.

**B03** owns one transaction and nothing else. Per DB3 §4 and DB4 §7, in order:
ordered locks on both `customers` rows (CC-27 — the only real deadlock risk in
the schema, `DB5_DB6_HANDOFF` row 3), `CONTACT_MOVE`, `GRANT_REVOKE` (reason:
merge), `OWNERSHIP_TRANSFER` of live identity references, `TOMBSTONE`
(`merged_into_customer_id`), and one appended `customer_merge_events` row per
step. Idempotent per (survivor, loser): a replay returns the existing record.

**Live versus frozen (settled here — see §H.1).** Repointed:
`custom_requests`, `orders`, `assets.uploaded_by_customer_id`,
`customer_contact_points`, `business_profiles`. Never rewritten:
`approval_snapshots`, `quotation_acceptances`, `design_reviews`,
`audit_events`, and every `*_transitions` append-only table — these hold frozen
commercial evidence.

**Cross-module seam.** `custom_requests`, `orders` and `assets` belong to other
modules, and CLAUDE.md §5 forbids reaching into another module's persistence.
B03 must therefore define a narrow `CustomerOwnershipTransferPort` implemented
once per owning module and injected into the merge use case — one method,
`repointCustomer(from, to, tx)`, returning the affected count for the event
row. This is the *only* new abstraction APP10 introduces, and it exists because
a concrete requirement forces it, not for future reuse.

### E.3 `APP10-I01` — Zalo/Messenger handoff

Storefront only. Two configured absolute URLs surfaced as contact CTAs, with
the request code appended to the opening text where the platform supports it
(PRD §11). No backend endpoint, no provider SDK, no webhook, no adapter, no
message persistence, no unified inbox — BR-018 and SYSTEM_ARCHITECTURE §76 make
these external contact links that *"do not participate in authoritative
business workflows"*, and PRD §11 lists chatbot, AI advice, conversation
webhooks, unified inbox and message sync as explicit non-goals.
`storefront-shell-footer.test.tsx` must be updated in the same checkpoint,
because it currently asserts the absence of exactly these links.

## F. Design decision

```text
APP10_DESIGN_REQUIRED = YES — ONE PACKAGE (APP10-D01)
```

The registry was audited for APP10-relevant rows. Result:

- **Covered and approved:** `/support/customer-access` — 18 `APP4-D01` frames
  under `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`, including the full notification
  delivery set (`NOFAILURE`, `TERMINALFAILURE`, `REPLAYCONFIRM`, `REPLAYING`,
  `REPLAYED`, `REPLAYDUPLICATE`, `REISSUEREQUIRED`), the grant set, lookup,
  loading, load-error, not-found and a 1280 narrow reference.
- **Missing entirely:** the merge workflow (comparison, consequence preview,
  confirmation, forbidden/conflict, executed/audit states) — **zero** rows
  matching `merge`; the profile-maintenance states on the customer/contact
  panel; and any Zalo/Messenger contact CTA — **zero** rows matching `zalo` or
  `messenger`.

So `APP10-A03` needs no design (it is already delivered), while A01, A02 and
I01 are blocked without one. One package, one `APP_10` page, gated by
`node tools/check-figma-design-index.mjs` — never split across coding
checkpoints (`docs/implementation/03-DESIGN-DELIVERY-POLICY.md`).

## G. Data / API impact expectations

| Checkpoint | Migration | New HTTP ops | Worker | New UI route | Notes |
|---|---|--:|---|---|---|
| `APP10-B01` | **no** | 3 | no | — | `display_name`, `notes`, `is_primary`, `deactivated_at` all exist |
| `APP10-B02` | **no** | 3 | no | — | `customer_merge_cases` shipped in migration `0014` |
| `APP10-B03` | **no** | 1 | no | — | `customer_merge_events` shipped in `0014`; IDX-107/117/118/119 exist for the sweep |
| `APP10-D01` | no | 0 | no | — | Figma + registry rows only |
| `APP10-A01` | no | 0 | no | 0 (extends `/support/customer-access`) | |
| `APP10-A02` | no | 0 | no | 1 (Admin merge workflow) | |
| `APP10-I01` | no | 0 | no | 0 (shell/footer CTA) | two non-secret config values |
| `APP10-E01` | no | 0 | no | — | acceptance only |
| `APP10-X01` | no | 0 | no | — | documentation only |

```text
APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

Every table, constraint, check and index APP10 needs was delivered by the DB
phases: `customer_merge_cases` and `customer_merge_events` with their state
checks, the `no_self_merge` checks on both halves of CST-069, the CST-010
one-open-case-per-pair partial unique, and the four merge-sweep indexes
IDX-107 / IDX-117 / IDX-118 / IDX-119. Predicted end state: **115 operations**
(108 + 7).

## H. Privacy and integrity risks

### H.1 Recorded contradiction — merge ownership-transfer semantics

Two authorities disagree about whether a merge repoints `orders`:

- `packages/database/src/schema/customer/customer-merge-cases.ts` (file
  comment): *"Orders, Quotations, Payments, Notifications, Audit and design
  snapshots keep their original `customer_id`"*.
- `docs/database/DB4_SCHEMA_IDENTITY_CUSTOMER.md` §7: *"merge repoints live
  identity refs and revokes loser grants (TBL-010 steps); immutable snapshots
  keep their frozen contact copies"*; and
  `docs/database/DB3_CUSTOMER_VERIFICATION_MERGE_SPEC.md` §4 step 2, which
  lists requests / orders / design cases / quotations / obligations as
  repointed.

**Resolution (reported, not resolved silently).** DB4/DB5 win. They are
canonical documents in the source-of-truth order and a file comment is not;
`MERGE_EVENT_STEP_KINDS` contains `OWNERSHIP_TRANSFER`, which has no meaning
under the tombstone-only reading; and DB5 provisions IDX-118
`ix_orders__customer` **explicitly labelled "CC-27 merge"** — an index that
exists only so a merge can find a customer's orders in order to repoint them.
The tombstone pointer and repointing are complementary, not alternatives. The
schema file comment is imprecise and should be corrected in `APP10-B03`, the
same checkpoint that implements the transfer. Recorded as `FU-APP10-G01-01`.

### H.2 Risk register

| # | Risk | Owner | Control |
|--:|---|---|---|
| 1 | **PII exposure** — a raw, normalized or display contact leaking into a response, log or URL | B01, B02, A01, A02 | reuse the total projection functions that have nowhere to put a raw value; masked-only; `no-store`; a contact is submitted in a POST body, never a query string |
| 2 | **Unauthorized lookup / enumeration** — a merge surface becoming the customer list APP4-B07 refused | B02 | both participants resolved by exact-contact equality; no list, no prefix match, no paging over customers; uniform 404 |
| 3 | **Verified-contact mutation** — an Admin write forging verification proof | B01 | no contact creation and no `verified_at` write; promotion restricted to already-verified active contacts; CST-005/CST-006 partial uniques as arbiters |
| 4 | **Merge correctness** — a partial merge leaving orphaned references | B03 | one transaction, ordered two-row locks (CC-27), every step emitting its `customer_merge_events` row; per-step affected counts asserted |
| 5 | **Merge rollback / transactionality** — a failure mid-transfer | B03 | single transaction; no outbox emission inside it; the case stays `REQUESTED` on failure so the operator can retry |
| 6 | **Immutable audit history** — a corrected merge editing history | B03 | `customer_merge_events` is append-only with no `updated_at`; a correction is a new row (CST-098; the S24 trigger is a documented, not-yet-built gap inherited from the DB phases) |
| 7 | **Concurrent merge** — two operators merging overlapping pairs | B02, B03 | CST-010 partial unique rejects the second open case; ordered locks serialize execution (D8-18) |
| 8 | **Retry duplication** — a replay sending twice | *already controlled* | `manual-replay-key` idempotency; `outcome: CREATED \| EXISTING`; the original intent stays FAILED and its dead-letter is untouched |
| 9 | **Provider error leakage** — a provider body or stack trace reaching an operator | *already controlled* | only a bounded `errorClass` is persisted and published; the response type cannot carry a body |
| 10 | **Self-merge / already-merged participant** | B02, B03 | `ck_customers__no_self_merge` and `ck_customer_merge_cases__no_self_merge`; a customer already carrying `merged_into_customer_id` must be refused as either participant |
| 11 | **Grant survival across merge** — a loser's live link still opening data after merge | B03 | every ACTIVE grant of the loser revoked with reason `merge` (DB3 §4 step 4), each emitting a `GRANT_REVOKE` event |

## I. Testing plan — change-impact class per checkpoint

Global quality mechanisms remain **only** Prettier, ESLint and SonarQube
(`VALIDATION_GOVERNANCE.md` §1.1). No checkpoint below runs a repository-wide
aggregate, a full monorepo test run, or an unrelated lifecycle suite.

| Checkpoint | Change-impact class | Focused scope |
|---|---|---|
| `APP10-G01` | documentation | static evidence only — targeted searches, schema/migration/OpenAPI inspection, registry read. **No test suite was run** |
| `APP10-B01` | backend route + projection | focused customer-module integration: each mutation's guard, the primary-rotation unique, last-verified-contact refusal, the `contactId` projection, and proof no raw contact is published |
| `APP10-B02` | backend route | focused merge-case integration: open/detail/reject, mandatory reason, CST-010 duplicate-open refusal, self- and already-merged refusal, and that a preview wrote nothing |
| `APP10-B03` | backend transaction + cross-module port | focused merge-execution integration: per-step-kind `customer_merge_events` counts, tombstone set, grants revoked, live refs repointed, **snapshots untouched**, replay idempotent, and two concurrent merges proving lock ordering (D8-18) |
| `APP10-D01` | design | `node tools/check-figma-design-index.mjs` only (`CMD-CHECK-FIGMA-DESIGN-INDEX`) |
| `APP10-A01` | Admin screen | changed component/query tests for the maintenance panel only; existing lookup/grant/notification tests untouched |
| `APP10-A02` | Admin screen | changed component/query/router tests for the merge workflow: preview, confirmation, forbidden/conflict, executed |
| `APP10-I01` | Storefront shell | the footer/CTA component test, **including the updated absence assertion**, plus a boundary test that no provider SDK is imported |
| `APP10-E01` | cross-boundary acceptance | the deliberate APP10 journeys only — one for find → preview → merge → event history, one for inspect → retry (reusing the APP4 capability, not rebuilding it), one negative for the unauthenticated 401 path. Target 3 journeys / 8–12 cases |
| `APP10-X01` | documentation | static evidence only; E01 evidence reused, never re-executed |

## J. Nonblocking follow-ups

| ID | Item | Disposition |
|---|---|---|
| `FU-APP10-G01-01` | `customer-merge-cases.ts` file comment contradicts DB4 §7 / DB3 §4 on repointing (§H.1) | fix in `APP10-B03`, the same checkpoint as the transfer |
| `FU-APP10-G01-02` | **No business-event notification is emitted anywhere.** The only two producers are `verification.code` and the secure-grant link. `FU-APP9-B01-01` (SE-010 `payment.final-requested`) was routed to APP10 by `APP9-G01` §8 | **Not scheduled in APP10.** APP10's in-scope line is notification *visibility* and *retry*, not emission; a business-notification catalogue (which events, which templates, which channel, which locale) is a product decision with no current authority. If the PO wants it, it is one added backend checkpoint and it changes no roadmap row above |
| `FU-APP10-G01-03` | Customer shipping-fee acknowledgement UI (`BACKEND_READY / UI_DEFERRED`), routed to APP10 by `APP9-CLOSURE-MATRIX` | **Not scheduled in APP10.** It is an order-surface debt, not profiles, merge, agreements, notification operations or handoff. Recommend it return to a commerce or hardening phase |
| `FU-APP10-G01-04` | CST-098 / CST-096 append-only and immutability **triggers** (S24) are documented as not-yet-built for `customer_merge_events` and `agreement_versions` | Inherited DB-phase gap, unchanged by APP10. B03 relies on application discipline, exactly as `inventory_ledger_entries` and `custom_request_transitions` already do |
| `FU-APP10-G01-05` | `business_profiles` is read by the customer repository but has no Admin read or write surface | Left out of `APP10-B01` deliberately — APP4-B07 excludes the Business Profile from the support read. Revisit only with a stated requirement |
| `FU-APP10-G01-06` | Duplicate-candidate *detection* is permitted by DB3 §3 as an admin-visible heuristic signal | **Not scheduled.** §5.4 forbids duplicate-detection scoring; the operator brings the evidence, and CST-005 already prevents the only automatic case |

## K. CTA

```text
PO_DECISION_REQUIRED = NONE
```

Every candidate was dispositioned from delivered repository authority, the
explicit APP10 in/out-of-scope lists, and the established architecture. The two
items that could have become decisions — business-notification emission
(`FU-APP10-G01-02`) and storefront self-service (`APP10-S01`) — are both
answered by APP10's own scope statement: the phase owns notification
*visibility and retry*, and there is no customer account model in which
self-service could exist. Neither is invented, and both are recorded above with
an owner so the PO can reopen either without re-auditing.

## L. Files changed

```text
docs/implementation/reports/APP10-G01-COMPLETION-REPORT.md                  (new)
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md   (modified — §6 re-sliced, §7–§11 added)
```

No runtime, test, schema, migration, OpenAPI, generated-client or Figma file
was touched.
