# APP6 — Design Review, Approval and Quotation

## 1. Outcome

Turn an eligible request into versioned design review, secure customer approval, and an immutable/versioned quotation accepted or rejected by the customer.

## 2. Dependencies

APP4 secure grants/notifications and APP5 eligible requests complete.

## 3. Design policy

Expected `NEW/SUPPLEMENT` package for Admin review workbench, secure customer review, quotation editor/history and customer quote response. Review the complete journey as one APP6 design package.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

`APP6-R00` confirmed the requirement from the registry: `FIGMA_DESIGN_INDEX.md`
carried **zero** `APP_06` references, so the disposition is
`DESIGN_REQUIRED_BEFORE_UI_ONLY` — one package (`APP6-D01`) gates every APP6 UI
checkpoint and gates no backend checkpoint.

`APP6-D01` delivered that package on 2026-08-20: 56 frames under section `681:3`
on page `APP_06` (`678:3`), registered as 56 `REVIEW_REQUIRED` rows in
[`../../design/FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md) §4.12.
The gate is **still closed**: `APP6-A01`, `APP6-A02`, `APP6-S01` and `APP6-S02`
may not start until a human reviewer promotes the rows their checkpoint consumes.

## 4. In scope

- Design case/version creation and current-version management.
- Review request and secure customer feedback.
- Customer approval bound to exact version.
- Approved snapshot immutability.
- Quotation draft/version, pricing breakdown, send/publish, expiry.
- Customer secure quotation view and accept/reject.
- Audit and notifications.

## 5. Out of scope

- Payment collection.
- Order creation.
- Production files/jobs.
- Arbitrary post-approval design mutation.
- Pricing rules not already approved by product/business sources.

Additionally excluded by `APP6-R00`:

- The `TR-LC12-05` quotation-expiry **sweep** (`SE-015` scheduled worker work).
  `GRD-006` rejects acceptance of an expired version in transaction, so
  correctness does not depend on it.
- Customer-initiated cancellation at any stage — routed to `APP9`, which owns
  the cancellation contract, backend and the LC-21 compensation saga.
- Inventory soft holds (`TR-LC17-01`) — optional at acceptance per ADR-DB3-001
  rule 9, and owned by APP8.

## 6. Candidate engineering checkpoints (superseded — historical)

> **Superseded by §7 (`APP6-R00`, 2026-08-19).** This list is retained as
> planning history. Its four `C0n` contract-only slices describe a step this
> repository does not have (OpenAPI is published from NestJS decorators inside
> the checkpoint that owns the endpoint), and it delivers design review **before**
> quotation — an order `GRD-005` and `TR-LC08-01` make unreachable at runtime.
> The full audit is in
> [`../audits/APP6_PHASE_ENTRY_AUDIT.md`](../audits/APP6_PHASE_ENTRY_AUDIT.md) §6.

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP6-C01 — Design review Admin contract:** Define queue/detail, create version, set current version, and request customer review operations.
- **APP6-B01 — Design review backend:** Implement exact-version/current-pointer guards, request eligibility, audit and tests.
- **APP6-A01 — Admin design review workbench:** Implement request/design evidence, version history, current version and review action.
- **APP6-C02 — Customer review contract:** Define secure review read, feedback submission, approval, and rejection/change request operations.
- **APP6-B02 — Customer review backend:** Implement secure grant purpose/target checks, version eligibility, single/guarded approval and immutable snapshot.
- **APP6-S01 — Secure design review screen:** Implement exact-version preview, feedback, approve/change-request states and expired/invalid link behavior.
- **APP6-C03 — Quotation draft/version contract:** Define quotation list/detail, create version, update draft and pricing breakdown operations.
- **APP6-B03 — Quotation backend:** Implement exact money, version history, immutable sent facts and request/design eligibility.
- **APP6-A02 — Admin quotation editor/history:** Implement breakdown editing, validation, version history and readiness.
- **APP6-C04 — Quotation delivery/response contract:** Define send, secure read, accept and reject operations.
- **APP6-B04 — Quotation send/response backend:** Implement expiry, secure grants, acceptance guard, immutable accepted quotation and notifications.
- **APP6-S02 — Secure quotation screen:** Implement breakdown, validity, accept/reject, stale/expired and recovery states.
- **APP6-E01 — Review-to-quote E2E:** Admin creates exact design version → customer reviews/approves exact version → Admin sends quote → customer accepts → later edits cannot mutate approved/accepted snapshots.
- **APP6-X01 — Phase closure:** Close R3 Request and Quote Beta and hand accepted quotation to APP7.

## 7. Authoritative execution roadmap

Locked by `APP6-R00`. One execution order; execute and review **one checkpoint
at a time**.

| Order | Checkpoint | Purpose | Depends on | Main affected area | Predicted HTTP ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP6-G01` — Review, approval and quotation authority | Lock the COP design-context model (ADR); the APP6-owned LC-11 subset and the projected-vs-commanded rule; `design.approve` / `quotation.accept` idempotency bindings; the required agreement type set, quotation validity duration and deposit percent as a policy dataset; the SE-004/SE-005 mapping; the client-side-render / no-preview-derivative ruling | APP5 closure | Docs + seed data | 0 | Every value traced to a named ADR or specification; nothing invented |
| 2 | `APP6-DB01` — COP design context | Forward migration: nullable placement + `customer_owned_product_id` + one exactly-one-branch `CHECK` on `design_versions` and `approval_snapshots` | `APP6-G01` | `packages/database` | 0 | A COP request reaches a design version and an approval snapshot with **no fabricated catalog row**; the catalog branch is unchanged |
| 3 | `APP6-D01` — Design package | One complete Figma package: Admin quotation workbench, Admin design-case workbench, customer secure quotation, customer secure review, plus stale/expired/revoked, loading, error, empty and responsive states | `APP6-G01` | Figma + `FIGMA_DESIGN_INDEX.md` | 0 | Registry rows with exact node IDs; Product Owner approval before any UI checkpoint |
| 4 | `APP6-B01` — Quotation drafting | Create the quotation header with its first draft version; add a further draft version (`TR-LC12-01`) | `APP6-G01` | `apps/api` quotation | 2 | Staff-guarded; amounts stay strings end to end; a sent version is never repriced |
| 5 | `APP6-B02` — Quotation read | Version history and one version's detail with its line items | `APP6-B01` | `apps/api` quotation | 2 | Exact money; historical versions remain readable and explainable |
| 6 | `APP6-B03` — Quotation send | `TR-LC12-02` in one transaction: freeze, validity window, current pointer, supersede the prior sent version, project `TR-LC11-05` (`→ QUOTED`), emit `SE-004 quotation.sent` | `APP6-B02` | `apps/api` quotation + order | 1 | The request reaches `QUOTED` only as a projection of the committed send |
| 7 | `APP6-B04` — Customer secure quotation read | Grant-scoped read of the current sent version and its breakdown | `APP6-B03` | `apps/api` quotation | 1 | POST with the token in the body; one uniform `404` for every failure cause |
| 8 | `APP6-B05` — Quotation acceptance and rejection | `TR-LC12-03` / `TR-LC12-06` under GRD-002/003/006; acceptance evidence; `quotation.accept` idempotency; project `TR-LC11-06` (`→ QUOTE_ACCEPTED`) | `APP6-B04` | `apps/api` quotation + order | 2 | CC-05 stale version and CC-06 expiry both fail in transaction; a duplicate accept replays the evidence |
| 9 | `APP6-B06` — Digitizing transition | `TR-LC11-07` under `GRD-005`, added to the APP5-B05 application-layer target allow-list | `APP6-B05` | `apps/api` order | **0 new** | `GRD-005` rejects a request that is not `QUOTE_ACCEPTED`; the four `system` targets stay unreachable by command |
| 10 | `APP6-B07` — Admin submitted-design read | Authorised, request-bound read of the submitted Design Session document as the digitizing source. **Closes `FU-APP5-B04-DESIGN-PREVIEW-01`** | `APP6-B06` | `apps/api` design | 1 | No session secret fabricated; `submitted_session_id` stays provenance, never authorization; absence renders as empty, never as an error |
| 11 | `APP6-B08` — Design version authoring | `TR-LC08-01`: create a DRAFT version on the existing design case, catalog **or** COP branch; list the case's versions with review outcomes | `APP6-DB01`, `APP6-B07` | `apps/api` design | 2 | A COP version carries no catalog row; a catalog version fails loudly rather than substituting a missing variant |
| 12 | `APP6-B09` — Send version for review | `TR-LC08-02` in one transaction: canonicalize and hash the document, GRD-004 via the partial unique index, supersede the prior version, project `TR-LC11-08` (`→ DESIGN_REVIEW`), emit `SE-004 design.review-ready` | `APP6-B08` | `apps/api` design + order | 1 | CC-03 concurrent send is arbitrated by the partial unique index and mapped to `REVIEW_ALREADY_ACTIVE` |
| 13 | `APP6-B10` — Customer secure review read | Grant-scoped read of the exact version under review, with the effective agreement set the approval will bind | `APP6-B09` | `apps/api` design | 1 | Exact version only; private originals never exposed; no storage key leaks |
| 14 | `APP6-B11` — Approval and revision request | `TR-LC08-04` / `TR-LC08-03` under GRD-002/003/007/008; the Approval Snapshot; `design.approve` idempotency; project `TR-LC11-09` (`→ APPROVED`); emit `SE-005 design.approved`. **Stops before APP7's order creation** | `APP6-B10` | `apps/api` design + order | 2 | CC-02 and CC-04 both fail in transaction; a duplicate approval replays the snapshot; a hash mismatch is refused |
| 15 | `APP6-A01` — Admin quotation workbench | One screen: draft breakdown and adjustment authoring, totals, validity, version history, send | `APP6-D01`, `APP6-B03` | `apps/admin` | 0 | Approved registry rows cited; exact money never becomes a JS number |
| 16 | `APP6-A02` — Admin design-case workbench | One screen: submitted-design evidence, version list, create version, send for review, review outcome history | `APP6-D01`, `APP6-B09` | `apps/admin` | 0 | Approved registry rows cited; a second concurrent send surfaces `REVIEW_ALREADY_ACTIVE` and forces a re-read |
| 17 | `APP6-S01` — Customer secure quotation screen | One screen: breakdown, validity, accept, reject, stale, expired, revoked | `APP6-D01`, `APP6-B05` | `apps/storefront` | 0 | Fragment stripped before any request; a stale accept re-reads and requires a new decision |
| 18 | `APP6-S02` — Customer secure design review screen | One screen: exact-version watermarked preview, effective agreement set, approve, request revision, stale, expired, revoked | `APP6-D01`, `APP6-B11` | `apps/storefront` | 0 | No export path; the terms shown are exactly the ones recorded |
| 19 | `APP6-E01` — Cross-layer acceptance | One focused run: quote → accept → digitize → version → review → approve, on the catalog **and** COP branches, plus the immutability and stale-version negatives | all preceding | E2E | 0 | Approved design and accepted quotation both remain immutable under a later edit attempt |
| 20 | `APP6-X01` — Phase closure | Freeze baselines, disposition follow-ups, close R3, hand the accepted quotation and approval snapshot to APP7 | `APP6-E01` | Docs | 0 | Zero blocking follow-ups, or each one owned |

Predicted APP6 HTTP operations: **15 new** (`APP6-B06` adds none). Every backend
slice is within the 1–3 normal band except `APP6-B01`, `APP6-B02`, `APP6-B05`,
`APP6-B08` and `APP6-B11` at 2 — all under the hard maximum of five.

### 7.1 Locked transition rule

Of APP6's five LC-11 transitions, **four are `system`**. `QUOTED`,
`QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` may be reached **only** as a
projection of the owning aggregate's committed event, inside that event's own
transaction. No APP6 checkpoint may expose them as an admin-selectable target.
`TR-LC11-07` (`→ DIGITIZING`) is the only directly commanded APP6 transition and
is guarded by `GRD-005`.

## 8. Critical end-to-end journey

An eligible request receives a sent quotation, the customer accepts exactly that
version through a secure grant, the admin digitizes and sends a versioned design,
the customer approves exactly that version through the same grant with step-up
re-verification, and both the accepted quotation and the approved design remain
immutable.

> The original phrasing of this section ran design-first. `ADR-DB3-001` locks
> Option A — acceptance gates digitizing (`GRD-005`) — and `TR-LC08-01` allows a
> design version only from `{DIGITIZING, DESIGN_REVIEW}`, so the quotation half
> necessarily precedes the design half.

## 9. Exit gate

- Exact-version eligibility and snapshot immutability pass.
- Money is exact and historical versions remain explainable.
- Secure links reject wrong target/version/purpose.
- A customer-owned-product request completes the same journey with no fabricated
  catalog row.
- E2E passes.

## 10. Handoff

APP7 creates deposit obligation/attempt and order conversion only from an eligible accepted quotation and approved design.

## 11. Roadmap status

### 11.1 Status table

| Checkpoint | Status | Note |
|---|---|---|
| `APP6-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation. `APP6_SCHEMA_DISPOSITION = MIGRATION_REQUIRED`; design gate `DESIGN_REQUIRED_BEFORE_UI_ONLY`. See [`../audits/APP6_PHASE_ENTRY_AUDIT.md`](../audits/APP6_PHASE_ENTRY_AUDIT.md) and [`../reports/APP6-R00-COMPLETION-REPORT.md`](../reports/APP6-R00-COMPLETION-REPORT.md) |
| `APP6-G01` | `COMPLETE` | APP6 authority locked (`IMP-D051`); `APP6-G01-C1` agreement-authority semantic alignment incorporated. ADR [`../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md`](../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md), authority package [`../audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md`](../audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md), report [`../reports/APP6-G01-COMPLETION-REPORT.md`](../reports/APP6-G01-COMPLETION-REPORT.md). `DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS` |
| `APP6-DB01` | `COMPLETE` | COP design context physically represented. Migration `0036_add_app6_cop_design_context` — exactly the eight operations in ADR-APP6-001 §4: four Catalog placement columns made nullable on each table, `customer_owned_product_id` + REL-107/REL-108 (`ON DELETE RESTRICT`), the `design_versions` placement label pair, and CST-129/CST-130/CST-131. No backfill, no new index, no trigger change. 54/54 across three focused integration suites; all six live checkers green at 78/849/165/52/204/215/34; fingerprint `3fd107f2…` reproduced on a second independently built database. Report [`../reports/APP6-DB01-COMPLETION-REPORT.md`](../reports/APP6-DB01-COMPLETION-REPORT.md) |
| `APP6-D01` | `COMPLETE` | One APP6 Figma package delivered for Product Owner review. The `APP_06` page **already existed** at `678:3` and was empty, so it was reused rather than re-created; root section `681:3`, 11 sub-sections, **56 frames**, **56 new `FIGMA_DESIGN_INDEX.md` rows** (§4.12), all entered `REVIEW_REQUIRED`. **Product Owner passed the complete package**; `APP6-B01` recorded that approval as a documentation preflight — all 56 rows promoted to `APPROVED_FOR_IMPLEMENTATION` under evidence `FIG-APPROVAL-APP6-D01-PO-001`, with no Figma mutation and no `Last Verified` change. APP4 secure-access states and the APP3-S09 watermark referenced, not redrawn. 0 components, 0 instances, 0 new variables or styles. Gate green at 334/334/18. Report [`../reports/APP6-D01-COMPLETION-REPORT.md`](../reports/APP6-D01-COMPLETION-REPORT.md) |
| `APP6-B01` | `COMPLETE` | Quotation drafting. **2 operations** — `adminQuotation_create` (`POST /api/admin/quotations`) and `adminQuotation_addVersion` (`POST /api/admin/quotations/{quotationId}/versions`); OpenAPI 58→60 paths, 63→65 operations, 132→135 schemas. `TR-LC12-01` only: header + first `DRAFT` version in one transaction, a further `DRAFT` version as an append. Every amount is a string end to end and every derived figure — line total, subtotal, total, deposit/remaining — is computed in exact `bigint` decimal, round-half-up on deposit per DB4, `remaining = total − deposit` so CST-064 holds for every total. Also ships the `app6-policy-configuration` dataset reader and publisher (APP4-B01-C1 precedent): **3 keys** published from the `staff-bootstrap` seam, idempotent, drift appended never rewritten. No migration; the request is never moved and no `quotation.sent` is emitted. 103 focused tests green. Report [`../reports/APP6-B01-COMPLETION-REPORT.md`](../reports/APP6-B01-COMPLETION-REPORT.md) |
| `APP6-B02` | `COMPLETE` | Quotation read. **2 operations** — `adminQuotation_versionHistory` (`GET /api/admin/quotations/{quotationId}/versions`) and `adminQuotation_versionDetail` (`GET /api/admin/quotations/{quotationId}/versions/{versionId}`); OpenAPI 60→61 paths, 65→67 operations, 135→140 schemas. Read-only throughout: the read module imports no `DatabaseModule`, so no transaction is reachable from either route. History is the whole version list in version order; detail addresses an **exact** version id, proves it belongs to the quotation in the path, and loads that version’s own lines by position — a version of another quotation answers `QUOTATION_VERSION_NOT_FOUND`, the same answer a missing one gets. Every historical fact is projected, never recalculated: `depositPercent` is the share the version was priced at rather than the share policy carries today, and no `Number()` or rounding touches a persisted amount. The AGG-14 version projection was widened to carry the adjustment and its reason, the deposit percent, the stitch count and the lifecycle timestamps — all existing columns, no schema change. Every nullable field publishes an explicit scalar type, so the generated client says `string | null` rather than adding to the `type: object` debt. **42 new focused tests**, and the whole quotation module green at 123 across 7 suites. No migration; `current_quotation_id` untouched. Report [`../reports/APP6-B02-COMPLETION-REPORT.md`](../reports/APP6-B02-COMPLETION-REPORT.md) |
| `APP6-B03` | `COMPLETE` | Quotation send. **1 operation** — `adminQuotation_sendVersion` (`POST /api/admin/quotations/{quotationId}/versions/{versionId}/send`); OpenAPI 61→62 paths, 67→68 operations, 140→141 schemas. `TR-LC12-02` in **one** transaction: freeze the addressed version with its send facts, supersede every other `SENT` sibling, set `quotations.current_version_id`, set `custom_requests.current_quotation_id`, project `TR-LC11-05` `UNDER_REVIEW → QUOTED` with a **system** actor, append the `quotation.sent` audit row and the `SE-004` outbox event. Rollback is proved by injecting a failure at the last write in the transaction: the version, both pointers, the transition, the audit row and the event all disappear together. Validity is read from published `quotation.validity` at the point of use — the suite republishes it at three days and the window follows, so no `7` is hard-coded. Nothing is re-priced: `send` writes no money column and every amount crosses as the persisted string. The request may send only from `UNDER_REVIEW` or `QUOTED`; an already-`QUOTED` request gains **no** self-transition, and no backward or reopening edge is invented for a state beyond it. Re-sending the same version replays with no second event, no new window and no pointer rewrite. The request row is locked before any write, and the concurrent send-versus-cancellation race is proved deterministic on independent connections. **39 new focused tests**, and the whole quotation module green at 163 across 11 suites. No migration; `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01` closed. Report [`../reports/APP6-B03-COMPLETION-REPORT.md`](../reports/APP6-B03-COMPLETION-REPORT.md) |
| `APP6-B04` | `COMPLETE` | Customer secure quotation read. **1 operation** — `publicQuotation_current` (`POST /api/public/quotations/current`); OpenAPI 62→63 paths, 68→69 operations, 141→144 schemas. The token is in the body and nowhere else, and the body is `.strict()` with one field: no quotation, version, request, customer, grant or scope identifier is accepted, so "grant A cannot read request B's quotation" is an impossibility rather than a comparison. The existing `REQUEST_ACCESS` grant is **reused** — nothing is issued, rotated or re-scoped — through the exported `AuthorizeSecureLink` capability, so the policy read, the abuse budget and the digest keep their single fail-closed ordering. The target chain is entirely server-side: grant → `custom_requests.current_quotation_id` → `quotations.current_version_id` → that exact version and its own lines, with G-DB7-04 and G-DB7-03 containment proved on the read side rather than assumed; no "latest by `created_at`", no `max(version)`, no history search. The exact current version id is returned so `APP6-B05` can bind a decision to it, and a later send makes a fresh read return the newer version while the superseded one is never served as current. Every amount crosses as the persisted `numeric(14,2)` string, in the domain view, the OpenAPI document and the generated client — no `Number()`, no `parseFloat`, no recomputation. A quotation whose validity has elapsed is returned **in full** with a server-derived `expired` flag and **no write**, keeping the expired-quotation state distinct from an unusable link. Every definitive secure/target unavailability — unknown, expired, revoked, superseded token, no current quotation, unset version pointer, foreign quotation or version — collapses to one `404 / SECURE_LINK_UNAVAILABLE` with no diagnostic follow-up read. Ordering publishes one new read-only port (`CUSTOM_REQUEST_QUOTATION_POINTER_PORT`) on its own module, so the public surface never holds `CUSTOM_REQUEST_REPOSITORY`; the read module imports no `DatabaseModule`, so no transaction is reachable. **22 new focused tests** (12 integration, 10 contract) green. No migration; no grant issuance; no audit, outbox, transition or notification write from the read. Report [`../reports/APP6-B04-COMPLETION-REPORT.md`](../reports/APP6-B04-COMPLETION-REPORT.md) |
| `APP6-B05` | `COMPLETE` | Quotation acceptance and rejection. **2 operations** — `publicQuotation_accept` (`POST /api/public/quotations/accept`) and `publicQuotation_reject` (`POST /api/public/quotations/reject`); OpenAPI 63→65 paths, 69→71 operations, 144→148 schemas. Both join `APP6-B04`'s published `publicQuotation` domain through `CONTROLLER_DOMAIN_KEYS`, on a second controller and a fifth quotation module, because the read module is *defined* by holding no transaction manager and no write repository and these two writes need both. Each body is `.strict()` with exactly `token` + `versionId`: no quotation, request, customer, grant, scope, challenge or amount identifier, so the exact version the customer saw is a **fingerprint** compared against the server's own pointer rather than a locator. `TR-LC12-03` is **one** transaction — the grant re-established under its `FOR UPDATE` row lock (ADR-DB3-004 r9, the new `lockActiveByTokenDigest`), the whole grant → request → quotation → version chain re-walked with G-DB7-03/04 proved, the `quotation.accept` claim, GRD-003 satisfied by a **server-derived** step-up (the new `StepUpEvidenceResolver`; no `challengeId` is ever accepted), the request row locked before the version row, GRD-006 re-checked under `FOR UPDATE OF quotation_versions` (current + `SENT` + `now < valid_until`), the immutable TBL-053 evidence, and `TR-LC11-06` `QUOTED → QUOTE_ACCEPTED` appended with a **system** actor. `TR-LC12-06` moves the quotation only: `RejectQuotationUseCase` does not inject `CUSTOM_REQUEST_REPOSITORY` at all, so "a rejected quotation is not a rejected request" is structural, and a repeat, superseded or already-decided rejection answers `INVALID_TRANSITION` under natural idempotency with no `quotation.reject` namespace. Rejection requires no step-up. CC-05, CC-06, CC-16 and the request-state race are each proved on real independent connections with a `pg_locks` barrier, and rollback is proved by injecting a failure at the last write — version, evidence, header, request state, transition, audit row and idempotency record all disappear together and a genuine retry still commits. Exact money crosses as the persisted `numeric(14,2)` string into the evidence, the response, the document and the generated client. **68 new focused tests** (24 contract, 44 integration/race), the whole quotation module green at 253 across 17 suites and the whole customer module at 333 across 23. Neither `quotation.accepted` nor `quotation.rejected` is emitted (`APP6-G01` §9), and no order, payment obligation or reservation is created. Four B01/B02 contract assertions that had been red since `cef99b7` were reconciled. No migration. Report [`../reports/APP6-B05-COMPLETION-REPORT.md`](../reports/APP6-B05-COMPLETION-REPORT.md) |
| `APP6-B06` | `COMPLETE` | Digitizing transition. **0 new operations** — the delivered `adminCustomRequest_transition` (`POST /api/admin/custom-requests/{requestId}/transitions`) is reused unchanged and not reissued; OpenAPI stays 65 paths / 71 operations / 148 schemas, and the artifact changes only where the `toStatus` enum widens on `TransitionCustomRequestBody` and `RequestTransitionedResponse`, plus the operation and `409` descriptions. The application-layer allow-list gains exactly one edge — `QUOTE_ACCEPTED → DIGITIZING` — taking it from 8 to 9; all eight `APP5-B05` edges are unchanged, and the delta is computed against the whole 10×10 state space rather than asserted as a count. `QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` stay uncommandable and die at the `.strict()` schema boundary before the policy is consulted. **GRD-005** is the allow-list row itself — `DIGITIZING` is offered from `QUOTE_ACCEPTED` and nowhere else, so there is no override to write; a genuinely pre-acceptance request (`NEW`, `UNDER_REVIEW`, `NEEDS_CLARIFICATION`, `QUOTED`) is refused `409 QUOTE_NOT_ACCEPTED`, the canonical `DB3_TRANSITION_GUARD_CATALOG` code, while a repeat, later or terminal state keeps the canonical `INVALID_TRANSITION`. `TR-LC11-07` stays an **admin** command: actor `ADMIN`, admin id and correlation id server-derived, `expectedFrom` pinned to the state the policy judged, the root update and its TBL-042 row in the one delivered transaction. Explicitly nothing else — no outbox event, no notification, no quotation or acceptance mutation, no design version, no order, payment obligation or production job, proved by comparing seven downstream tables before and after. Reasons/notes are decided for `DIGITIZING` rather than inherited: both reasons optional-or-forbidden (a customer-visible one is refused, since the move notifies nobody) and the only note kind is `NOTE`. **80 focused tests** — 57 policy unit, 10 contract, 23 new integration — plus the delivered B05 transition suite green at 23. `APP5-B05`'s race suite was deliberately **not** re-run: no lock, transaction boundary or `expectedFrom` semantics changed. No migration. Report [`../reports/APP6-B06-COMPLETION-REPORT.md`](../reports/APP6-B06-COMPLETION-REPORT.md) |
| `APP6-B07` | `COMPLETE` | Admin submitted-design read. **1 operation** — `adminCustomRequestSubmittedDesign_get` (`GET /api/admin/custom-requests/{requestId}/submitted-design`); OpenAPI 65→66 paths, 71→72 operations, 148→150 schemas. The operation id is *derived* from its own controller class, so no `CONTROLLER_DOMAIN_KEYS` entry was added and `APP5-B04`’s two ids are untouched. Authority is `AuthenticatedAdminGuard` **plus the request**: the caller supplies no `sessionId` in any parameter position and there is no request body, so a foreign session cannot be requested rather than merely refused; no APP3 bootstrap or resume is called, no fake customer context is built and `session_secret_hash` is neither a parameter nor a projected column anywhere. `submitted_session_id` stays provenance — read only *after* the request resolves — and the Design port requires **both** ids so the pointed row must name the request back (`submitted_request_id = :requestId`) and still be `SUBMITTED`; a purged row, a reverted row and another request’s `SUBMITTED` session are indistinguishable from each other and all answer `200` with `submittedDesign: null`, as does every COP request. Nothing is fabricated for those cases — no placement, no blank document, no Catalog default, no “latest” substitute. `document` reuses the generated `APP3-P01` component through the `APP3-B08-C1` marker (the *same* `` `DesignSessionSnapshotResponse` carries, asserted identical), so the generated client types it `DesignDocument` rather than an unbounded map. Two new one-port modules keep the surface read-only by construction: `CustomRequestDesignSourceModule` instead of `OrderModule` (no `transition()`) and `DesignSubmittedSourceReadModule` instead of `DesignModule` (no `saveDocument()`, no `rotateSecret()`, no session pepper); no `DatabaseModule` import, so no transaction is reachable. `Cache-Control: no-store`, no query parameter, no document logged, no raster, derivative, hash or download. Zero side effects proved by comparing both rows byte-for-byte across two reads and seven tables before and after. **26 focused tests** — 10 contract, 16 integration — plus the three sibling Admin request contract suites green at 29. No migration; `FU-APP5-B04-DESIGN-PREVIEW-01` **closed**. Report [`../reports/APP6-B07-COMPLETION-REPORT.md`](../reports/APP6-B07-COMPLETION-REPORT.md) |
| `APP6-B08` | `COMPLETE` | Design version authoring. **2 operations** — `adminCustomRequestDesignVersion_create` (`POST /api/admin/custom-requests/{requestId}/design-versions`) and `adminCustomRequestDesignVersion_list` (`GET` on the same path); OpenAPI 66→67 paths, 72→74 operations, 150→155 schemas, and the artifact diff is **purely additive** (623 insertions, 0 deletions), so `APP6-B07`'s operation and every existing schema are byte-identical. Both ids are *derived* from the new controller class, so no `CONTROLLER_DOMAIN_KEYS` entry was added. The request is the address and a design case is never one: no parameter, path segment or body field accepts a `designCaseId`, and the server resolves `requestId → custom_requests.current_design_case_id → the case` and requires the case to name the request back — an absent, dangling or foreign pointer is `409 DESIGN_CASE_UNRESOLVED`, reported and never repaired (no second case is created, none is rebound). `TR-LC08-01` eligibility is `DIGITIZING` **or** `DESIGN_REVIEW` and nothing else; all eight other LC-11 states are refused `409 REQUEST_NOT_DIGITIZING` with no override, and the request is never moved — the module holds no `CustomRequestRepository`, so `TR-LC11-08` is unreachable rather than merely unused. The branch is **server-derived** from `customer_owned_products` (CST-027): a Catalog version freezes the complete quartet — product and variant from the request, side and area from the exact submitted session, correlated by `submitted_request_id` and proved one chain by `PLACEMENT_HIERARCHY_PORT` — and a request missing any part is `409 CATALOG_PLACEMENT_UNRESOLVED` with **nothing written and nothing substituted**; a COP version freezes `customer_owned_product_id`, a NULL quartet, both nonblank labels and its own positive placement envelope, never `customer_owned_products`' nullable item dimensions. `DesignVersionPlacement` is a **union**, so CST-129 is a type-level fact and no mixed row can be built in process. `packages/design-document` gains schema **version 2** through the delivered `SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS` mechanism — `CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION` stays **1**, since APP3's three `=== CURRENT` pins would otherwise emit v2 into Catalog Sessions and refuse every persisted v1 document on its next save (ADR-APP6-001 §3.4 rule 3). v1 is byte-for-byte unchanged and still rejects `null`; v2 accepts both ids non-null or both null and rejects a mixed pair; no migration step is added and no stored document is rewritten. The OpenAPI augmentation gained one structural rewrite — `type: ["string","null"]` → `type: "string", nullable: true` — so the generated client says `string | null` rather than falling back to an index signature. History is append-only: creating v2 leaves v1's row byte-identical, lineage is read from the case (no `parentVersionId` is accepted), and the current-version pointer advances in the create transaction, the site `G-DB7-02` names. Audit is one `design_version.created` row per version with **no document content**; **no outbox event**, no hash, no freeze, no supersession, no preview, no snapshot. **50 focused tests** — 31 integration, 9 contract, plus B07's 10 reconciled — with `@embroidery/design-document` green at 183 and the two DB7 design suites green at 39. No migration; `FU-APP6-DB01-02` = `NOT_REQUIRED_BY_B08_QUERY_SHAPE`. Report [`../reports/APP6-B08-COMPLETION-REPORT.md`](../reports/APP6-B08-COMPLETION-REPORT.md) |
| `APP6-B09` | `COMPLETE` | Send version for review. **1 operation** — `adminCustomRequestDesignVersion_send` (`POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send`); OpenAPI 67→68 paths, 74→75 operations, 155→156 schemas, and the artifact diff is **purely additive** (323 insertions, 0 deletions), so B08’s two ids and every existing schema are byte-identical. The id joins B08’s published domain through one `CONTROLLER_DOMAIN_KEYS` entry, so the family reads `_create`, `_list`, `_send` and no accepted id is reissued. **There is no request body at all** — not an empty one: the document, its hash, the design case, the branch, the placement, the actor, the send instant and both target states are server-derived, so `StaffJsonBodyGuard` is absent and `StaffOriginGuard` is not (the accepted `APP6-B03` bodyless-send precedent). Authority is re-proved inside the send transaction: `requestId → current_design_case_id → case → version.design_case_id`, and a version on another request’s case gets the same `404 DESIGN_VERSION_NOT_FOUND` a missing row gets, leaking neither the owning request nor its case. `TR-LC08-02` commits as **one unit**: the persisted document is canonicalized and hashed through `@embroidery/design-document/server` (JCS → SHA-256, never `JSON.stringify`), the version moves `DRAFT → SENT_FOR_REVIEW` with that hash and one send instant, `TR-LC08-05` marks every `REVISION_REQUESTED` predecessor `SUPERSEDED`, a `DIGITIZING` request is projected to `DESIGN_REVIEW` as **SYSTEM** (`system_job_key = design.version.send`), and the `design_version.sent` audit row and the `SE-004 `design.review-ready`` outbox row are appended. The **persisted row is the only hash source** — proved by recomputing the digest from `design_versions.design_document` and comparing — and the document bytes and schema version are never written back: Catalog v1 stays v1 and COP v2 stays v2. Send is the **freeze boundary**, so the branch, the Catalog quartet, the Side geometry, the COP product, both labels and the envelope are re-established against live authority before anything is frozen; a drifted variant is `409 PLACEMENT_FROZEN_MISMATCH` and an unresolvable chain is `409 PLACEMENT_AUTHORITY_UNRESOLVED`, with **nothing substituted**. GRD-004 is arbitrated by `uq_design_versions__case__sent_for_review`, mapped narrowly to `REVIEW_ALREADY_ACTIVE` through the delivered `CONSTRAINT_MEANINGS` catalog — proved twice: CC-03 on three real connections behind a `pg_locks` barrier yields exactly one winner and one `REVIEW_ALREADY_ACTIVE` loser with one active review, one transition, one audit row and one event; and the index alone refuses a second review with the preflight removed from the call stack. An open review is **never** superseded to make room. A same-version resend **replays** with zero writes, and a revision send on an already-`DESIGN_REVIEW` request appends **no self-transition** — LC-11 has no self-edge. No current-version guard was invented: LC-08 states none, so the case pointer is **preserved** rather than redefined. Atomic rollback proved by injecting a failure after every domain write. No raster, no preview, no grant issuance, no notification intent, and no hash in the event payload (SE-004 authorizes one for the audit trail only). **29 focused tests** — 9 contract, 16 send integration, 2 race, 2 atomicity — plus B08’s 40 and the three sibling Admin request contract suites reconciled and green at 99 total. No migration. Report [`../reports/APP6-B09-COMPLETION-REPORT.md`](../reports/APP6-B09-COMPLETION-REPORT.md) |
| `APP6-B10` | `COMPLETE` | Customer secure design review read + agreement publication. **1 operation** — `publicDesignReview_current` (`POST /api/public/design-reviews/current`); OpenAPI 68→69 paths, 75→76 operations, 156→159 schemas, and the artifact diff is **purely additive** (306 insertions, 0 deletions), so B07/B08/B09’s four ids and every existing schema are byte-identical. The id is *derived* from its own controller class, so no `CONTROLLER_DOMAIN_KEYS` entry was added. `POST` with the token in a `.strict()` **body and nowhere else** (the only parameter is the platform `X-Request-ID` header), no example credential published, and no `designVersionId`, `designCaseId`, `requestId`, `customerId`, `grantId`, `scopeKind`, `challengeId` or agreement acceptance accepted anywhere — B04’s pattern, reusing the delivered `AuthorizeSecureLink` (policy → abuse budget → digest) with `REQUEST_ACCESS` the only scope and no grant issued, reissued or revoked. **The load-bearing distinction is that `design_cases.current_version_id` is never read**: the review target is the row `uq_design_versions__case__sent_for_review` arbitrates, reached as `grant → custom_requests.current_design_case_id → case → its one SENT_FOR_REVIEW version`, with both containment invariants proved on the read side. A new narrow read-only `DESIGN_REVIEW_PORT` exposes no method that returns the pointer and takes no ordering, limit hint or caller version id, so “latest”, `max(version)` and “the newest DRAFT” are unaskable — proved by the focused negative where the pointer names a newer DRAFT and the read returns the older active review, re-reading the pointer afterwards to confirm it still names the draft. Catalog **v1** and COP **v2** documents both cross unchanged (deep equality; the v2 nulls survive), and the returned hash is the **stored B09 value** read from the row, never recomputed. `document` reuses the one generated `APP3-P01` component through the `APP3-B08-C1` marker, so the client types it `DesignDocument`. The effective agreement set is `design_approval.agreements` policy → `AgreementRepository.effectiveVersions` → **exactly one per required type**, returned with id, type, version, hash, language and content equal to the persisted current rows, in the published required-type order; a missing policy, missing type, withdrawn term, zero-or-many result or unusable hash **fails closed** on a bounded `503` that names no key and is resolved *after* the target so it cannot become a grant oracle. B10 also owns **agreement content publication**: `APP6-G01-C1` §5.6 published verbatim from a committed dataset — proved by re-extracting the two blocks from the authority markdown at test time and comparing byte-for-byte — as `[PAYMENT_POLICY, RETURN_POLICY]` only, with **no `DESIGN_APPROVAL_TERMS`** and no refund figure the repository has not locked. Publication runs on the one Admin-bearing `staff-bootstrap` seam after the policy publisher, adds **0 HTTP operations**, is idempotent by content-hash comparison (three bootstraps → two rows) and append-only: a dataset drift appends an immutable successor and advances the pointer while the predecessor keeps its content and hash, and the S24 trigger refuses an `UPDATE` on a published version even from raw SQL. `Cache-Control: no-store`; no raster, storage key, private original, derivative or download; **no step-up required to read**; zero side effects across seven tables, with the composing module holding no `TransactionManager`, no write repository, no storage port and no agreement publisher. Every definitive “this credential cannot obtain a review target” collapses to one `404 SECURE_LINK_UNAVAILABLE` (a dangling case pointer is unrepresentable — the FK refuses the delete). **44 focused tests** — 14 contract, 23 read integration, 7 publication — plus 13 dataset and 30 bootstrap/CLI. No migration; `FU-APP6-B09-CASE-REPO-SIZE-01` **closed** without touching the 399-line adapter. Report [`../reports/APP6-B10-COMPLETION-REPORT.md`](../reports/APP6-B10-COMPLETION-REPORT.md) |
| `APP6-B11` | `COMPLETE` | Customer design approval and revision request. **2 operations** — `publicDesignReview_approve` (`POST /api/public/design-reviews/approve`) and `publicDesignReview_requestRevision` (`POST /api/public/design-reviews/request-revision`); OpenAPI 69→71 paths, 76→78 operations, 159→163 schemas, and the artifact diff is **purely additive in meaning**: 2 operations and 4 schemas added, **0 removed, 0 pre-existing paths changed and 0 pre-existing schemas changed**, with B10's operation object byte-identical and `DesignDocument` untouched. A `CONTROLLER_DOMAIN_KEYS` entry maps the second controller onto `publicDesignReview`, so B10's `_current` is untouched and the family reads `_current`, `_approve`, `_requestRevision`. Both bodies are `.strict()` and body-only (the sole parameter is the platform `X-Request-ID`); neither accepts a customer, request, case, grant, scope, **challenge id**, target status, timestamp, snapshot, placement, quantity, thread colour or contact — proved by a 40-name forbidden-field matrix run against both. **Approval** re-establishes the grant under its row lock (CC-16), locks `custom_requests` then the exact `design_versions` row (the phase lock order), enforces **GRD-007** in two halves — stored hash before the idempotency claim, decidable state after — derives **GRD-003** step-up from the grant's customer with no client challenge, re-resolves **GRD-008** from persistence *inside* the transaction so terms that changed since B10 **refuse rather than substitute**, freezes the immutable Approval Snapshot with its thread-colour and agreement children, projects `TR-LC11-09` with a **SYSTEM** actor, and appends the critical audit row and `SE-005 design.approved` on the `APPROVAL_SNAPSHOT`. The **COP branch is now truthfully representable**: the AGG-11 adapter skips `assertValidPlacement` and writes `customer_owned_product_id` on that branch, and the snapshot's `placement` became a CST-131 union, so a COP approval freezes the customer's own product name and the version's frozen `placement_side_label`/`placement_area_label` with the whole Catalog quartet NULL and **no fabricated SKU**. Thread colours are derived from the frozen document's own declared fills and strokes, deduplicated in z-order, with `color_name` left NULL because **no palette table exists to look one up in**. `design_cases.current_version_id` is **never** consulted — B10's distinction is preserved and re-proved from both directions. **Revision request** composes no step-up resolver at all (so `REVERIFICATION_REQUIRED` is structurally unreachable, proved by suites that run with zero challenges in the database), injects no request repository (so the request cannot move), writes no snapshot, creates no next draft, and emits `SE-004 design.revision-requested`. `design.approve` replays the committed snapshot with **zero** new writes, treats the agreement evidence as an order-independent **set**, and does not demand a still-open step-up window to reveal a committed result. **171 focused tests** across 7 suites — 92 contract, 11 committed-evidence, 25 guard, 8 replay/rollback, 18 revision, 3 races (CC-02, CC-04, CC-16 on independent connections behind a `pg_locks` barrier), plus B10's contract suite re-proved. Rollback is proved by failing the **last** write in each transaction and asserting a complete seven-table census of zeroes, then retrying successfully. No Order, payment, reservation or production row; no grant issued; **no migration** (36). Report [`../reports/APP6-B11-COMPLETION-REPORT.md`](../reports/APP6-B11-COMPLETION-REPORT.md) |
| `APP6-A01` | `INCOMPLETE` | **Next** — Admin quotation workbench |
| `APP6-A02` | `INCOMPLETE` | Admin design-case workbench |
| `APP6-S01` | `INCOMPLETE` | Customer secure quotation screen |
| `APP6-S02` | `INCOMPLETE` | Customer secure design review screen |
| `APP6-E01` | `INCOMPLETE` | Focused cross-layer acceptance |
| `APP6-X01` | `INCOMPLETE` | Phase closure |

```text
APP6 = FIRST RUNTIME SLICE DELIVERED
APP6-R00 = COMPLETE
APP6-G01 = COMPLETE
APP6-DB01 = COMPLETE
APP6 AUTHORITY = LOCKED
DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS
APP6 COP DESIGN CONTEXT = PHYSICALLY REPRESENTABLE
APP6-D01 = COMPLETE
APP6-D01 PRODUCT OWNER APPROVAL = RECORDED (FIG-APPROVAL-APP6-D01-PO-001)
UI_IMPLEMENTATION_GATE = OPEN FOR THE 56 APPROVED APP6-D01 ROWS
APP6-B01 = COMPLETE
QUOTATION CREATE + FIRST DRAFT = DELIVERED
TR-LC12-01 ADD DRAFT VERSION = DELIVERED
APP6 POLICY DATASET READER = DELIVERED
APP6 POLICY PUBLICATION = DELIVERED
POLICY KEYS PUBLISHED = 3
APP6-B02 = COMPLETE
VERSION HISTORY READ = DELIVERED
EXACT VERSION DETAIL + LINE ITEMS = DELIVERED
HISTORICAL VERSIONS = READABLE
HISTORICAL FACTS = NOT RECALCULATED
READ SIDE EFFECTS = NONE
APP6-B03 = COMPLETE
HTTP OPERATIONS ADDED = 1
QUOTATION FAMILY OPERATIONS = 5
TR-LC12-02 = DELIVERED
VALIDITY POLICY = CONSUMED FROM PUBLISHED DATA
SENT VERSION = FROZEN / NOT REPRICED
PRIOR SENT VERSION = SUPERSEDED WHEN APPLICABLE
QUOTATION CURRENT VERSION POINTER = SET
REQUEST CURRENT QUOTATION POINTER = SET
FU-APP6-B01-CURRENT-QUOTATION-POINTER-01 = CLOSED
TR-LC11-05 = SYSTEM PROJECTION ONLY
QUOTED ADMIN COMMAND = ABSENT
SE-004 QUOTATION.SENT = EMITTED ONCE PER NEW SEND
DUPLICATE SAME-VERSION SEND = REPLAY
ATOMIC ROLLBACK = PROVED
REQUEST-STATE RACE = PROVED
EXACT MONEY = STRING END TO END
DATABASE MIGRATION = NONE
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
EXPIRED QUOTATION = READABLE WITHOUT MUTATION
SECURE/TARGET UNAVAILABLE = ONE 404 / SECURE_LINK_UNAVAILABLE
READ SIDE EFFECTS = NONE
APP6-B05 = COMPLETE
HTTP OPERATIONS ADDED = 2
QUOTATION FAMILY OPERATIONS = 8 (5 ADMIN + 3 CUSTOMER)
TR-LC12-03 = DELIVERED
TR-LC12-06 = DELIVERED
REQUEST_ACCESS = REUSED
NEW GRANT ISSUANCE = NONE
SECURE TOKEN = BODY ONLY
CUSTOMER/REQUEST AUTHORITY = GRANT-DERIVED
IN-TRANSACTION GRANT RE-CHECK = DELIVERED (ROW-LOCKED)
ACCEPT EXACT VERSION = ENFORCED
ACCEPT STEP-UP = ENFORCED / SERVER-DERIVED
REJECT STEP-UP = NOT REQUIRED
GRD-006 CURRENT+SENT+UNEXPIRED = IN-TRANSACTION
CC-05 = PROVED
CC-06 = PROVED
CC-16 = PROVED
REQUEST-STATE RACE = PROVED
QUOTATION.ACCEPT IDEMPOTENCY = DELIVERED
DUPLICATE ACCEPT = REPLAY
ACCEPTANCE EVIDENCE = IMMUTABLE / SINGLE
TR-LC11-06 = SYSTEM PROJECTION IN SAME TX
QUOTE_ACCEPTED ADMIN COMMAND = ABSENT
REJECTION PROJECTS REQUEST = NO
QUOTATION.ACCEPTED OUTBOX EVENT = ABSENT
QUOTATION.REJECTED OUTBOX EVENT = ABSENT
ORDER/PAYMENT/INVENTORY SIDE EFFECTS = NONE
ATOMIC ROLLBACK = PROVED
EXACT MONEY = STRING END TO END
DATABASE MIGRATION = NONE
APP6-B06 = COMPLETE
NEW HTTP OPERATIONS = 0
EXISTING OPERATION = adminCustomRequest_transition
OPENAPI PATH COUNT = UNCHANGED (65)
OPENAPI OPERATION COUNT = UNCHANGED (71)
OPENAPI SCHEMA COUNT = UNCHANGED (148)
TOSTATUS ADDED = DIGITIZING ONLY
TR-LC11-07 = DELIVERED
QUOTE_ACCEPTED -> DIGITIZING = ADMIN COMMAND
GRD-005 = ENFORCED
QUOTE_NOT_ACCEPTED = CANONICAL
DIRECT QUOTED COMMAND = ABSENT
DIRECT QUOTE_ACCEPTED COMMAND = ABSENT
DIRECT DESIGN_REVIEW COMMAND = ABSENT
DIRECT APPROVED COMMAND = ABSENT
EXISTING APP5 EDGES = UNCHANGED (8)
NEW COMMANDABLE EDGE COUNT = 1
COMMANDABLE EDGE TOTAL = 9
ADMIN OVERRIDE = NONE
ACTOR + CORRELATION = SERVER-DERIVED
EXPECTEDFROM STALE GUARD = UNCHANGED / EXERCISED
OUTBOX/NOTIFICATION = NONE
QUOTATION/ACCEPTANCE MUTATION = NONE
DESIGN VERSION = NONE
ORDER/PAYMENT/INVENTORY/PRODUCTION SIDE EFFECTS = NONE
DATABASE MIGRATION = NONE
APP6-B07 = COMPLETE
HTTP OPERATIONS ADDED = 1
OPERATION = adminCustomRequestSubmittedDesign_get
OPENAPI PATHS = 65 -> 66
OPENAPI OPERATIONS = 71 -> 72
OPENAPI SCHEMAS = 148 -> 150
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

### 11.2b `APP6-B08` verdict

```text
APP6-B07 = ACCEPTED
APP6-B08 = COMPLETE
HTTP OPERATIONS ADDED = 2
OPERATIONS = adminCustomRequestDesignVersion_create, adminCustomRequestDesignVersion_list
OPENAPI PATHS = 66 -> 67
OPENAPI OPERATIONS = 72 -> 74
OPENAPI SCHEMAS = 150 -> 155
TR-LC08-01 CREATE DRAFT = DELIVERED
VERSION LIST + REVIEW OUTCOMES = DELIVERED
EXISTING DESIGN CASE = REUSED
DESIGN CASE CREATION = ABSENT
CLIENT DESIGN CASE AUTHORITY = ABSENT
REQUEST ELIGIBILITY = DIGITIZING OR DESIGN_REVIEW ONLY
ADMIN OVERRIDE = NONE
CATALOG BRANCH = COMPLETE AUTHORITATIVE CATALOG CONTEXT
CATALOG SUBSTITUTION = ABSENT
COP BRANCH = CUSTOMER_OWNED_PRODUCT + NULL CATALOG QUARTET
COP PLACEMENT LABELS = FROZEN / NONBLANK
COP ENVELOPE = VERSION PHYSICAL DIMENSIONS
COP ITEM DIMENSIONS AS EMBROIDERY ENVELOPE = FORBIDDEN
DESIGN DOCUMENT COP VERSION = DELIVERED VIA SUPPORTED-VERSION MECHANISM
SUPPORTED SCHEMA VERSIONS = [1] -> [1, 2]
CURRENT SCHEMA VERSION = 1 (UNCHANGED)
DESIGN DOCUMENT V1 SEMANTICS = UNCHANGED
MIXED NULL PLACEMENT IDS = REJECTED
DOCUMENT MIGRATION STEP = NONE
STORED DOCUMENT REWRITE = NONE
HISTORICAL VERSION MUTATION = ABSENT
CURRENT VERSION POINTER = ADVANCED IN CREATE TX (G-DB7-02)
AUDIT = design_version.created (NO DOCUMENT CONTENT)
SEND FOR REVIEW = NOT STARTED
TR-LC11-08 = NOT PROJECTED
DESIGN.REVIEW-READY = NOT EMITTED
APPROVAL SNAPSHOT = NONE
SERVER RASTER PREVIEW = NONE
DATABASE MIGRATION = NONE
FU-APP6-DB01-02 = NOT_REQUIRED_BY_B08_QUERY_SHAPE
B09 = NOT STARTED
NEXT CHECKPOINT = APP6-B09
```

### 11.2c `APP6-B09` verdict

```text
APP6-B08 = ACCEPTED
APP6-B09 = COMPLETE
HTTP OPERATIONS ADDED = 1
OPERATION = adminCustomRequestDesignVersion_send
ROUTE = POST /api/admin/custom-requests/{requestId}/design-versions/{versionId}/send
REQUEST BODY = NONE
OPENAPI PATHS = 67 -> 68
OPENAPI OPERATIONS = 74 -> 75
OPENAPI SCHEMAS = 155 -> 156
OPENAPI DIFF = PURELY ADDITIVE (323 INSERTIONS / 0 DELETIONS)
B08 OPERATION IDS = UNCHANGED
TR-LC08-02 = DELIVERED
EXACT REQUEST/CASE/VERSION AUTHORITY = PROVED IN TRANSACTION
FOREIGN VERSION = 404 / NO OWNERSHIP LEAK
PERSISTED DOCUMENT = ONLY SEND SOURCE
CALLER-SUPPLIED HASH = UNREPRESENTABLE
CATALOG V1 CANONICAL HASH = DELIVERED
COP V2 CANONICAL HASH = DELIVERED
DOCUMENT HASH = STORED / sha256:<64 hex> / RECOMPUTED FROM THE ROW
DOCUMENT BYTES REWRITE = NONE
DOCUMENT SCHEMA VERSION REWRITE = NONE
VERSION STATUS = SENT_FOR_REVIEW
BRANCH / PLACEMENT / GEOMETRY = RE-ESTABLISHED THEN FROZEN
BRANCH SWITCH AT SEND = REFUSED
CATALOG SUBSTITUTION = ABSENT
CURRENT-VERSION GUARD = NOT INVENTED (LC-08 STATES NONE)
DESIGN CASE POINTER AT SEND = PRESERVED
GRD-004 = ENFORCED BY uq_design_versions__case__sent_for_review
GRD-004 MAPPING = CONSTRAINT_MEANINGS -> REVIEW_ALREADY_ACTIVE (NARROW)
CC-03 = ONE WINNER / ONE REVIEW_ALREADY_ACTIVE LOSER / ONE ACTIVE REVIEW
INDEX-ONLY ARBITRATION = PROVED WITH PREFLIGHT REMOVED
ACTIVE REVIEW SUPERSEDED TO MAKE ROOM = NEVER
TR-LC08-05 SOURCE = REVISION_REQUESTED ONLY
TR-LC11-08 = SYSTEM PROJECTION ONLY (design.version.send)
DIGITIZING -> DESIGN_REVIEW = SAME TRANSACTION
DESIGN_REVIEW -> DESIGN_REVIEW SELF TRANSITION = ABSENT
ADMIN TRANSITION ALLOW-LIST = UNTOUCHED
AUDIT = design_version.sent / ADMIN / ONCE PER NEW SEND / HASH REF ONLY
DESIGN.REVIEW-READY = ONCE PER NEW SEND / DESIGN_VERSION AGGREGATE
EVENT PAYLOAD HASH = ABSENT (SE-004 AUTHORIZES AUDIT ONLY)
EVENT PAYLOAD DOCUMENT/SECRET/STORAGE = ABSENT
NOTIFICATION INTENT = NONE (B03 PRECEDENT)
DUPLICATE SAME-VERSION SEND = REPLAY / ZERO WRITES
ATOMIC ROLLBACK = PROVED BY LATE FAILURE INJECTION
SERVER RASTER PREVIEW = NONE
SECURE GRANT ISSUANCE = NONE
DATABASE MIGRATION = NONE
FU-APP6-B08-P01-GATE-01 = CARRIED (NONBLOCKING / OUTSIDE B09)
FU-APP6-DB01-01 = CARRIED (NEXT DATABASE-CHANGE CHECKPOINT)
FU-APP6-B09-CASE-REPO-SIZE-01 = OPEN (399/400 LINES)
B10 = NOT STARTED
NEXT CHECKPOINT = APP6-B10
```

### 11.2d `APP6-B10` verdict

```text
APP6-B10 = COMPLETE
HTTP OPERATIONS ADDED = 1
OPERATION ID = publicDesignReview_current (DERIVED, NO DOMAIN-KEY ENTRY)
ROUTE = POST /api/public/design-reviews/current
SECURE TOKEN = STRICT JSON BODY ONLY / NO PATH, QUERY, HEADER OR COOKIE
TOKEN EXAMPLE PUBLISHED = NONE
TARGET SELECTOR ACCEPTED = NONE
AUTHORIZE-SECURE-LINK = REUSED (POLICY -> BUDGET -> DIGEST)
REQUEST_ACCESS = ONLY SCOPE / NEW GRANT ISSUANCE = NONE
CUSTOMER + REQUEST AUTHORITY = GRANT-DERIVED
DESIGN CASE = custom_requests.current_design_case_id, OWNERSHIP PROVED BOTH WAYS
ACTIVE REVIEW = uq_design_versions__case__sent_for_review ARBITER
DESIGN_CASES.CURRENT_VERSION_ID = NEVER READ (NO PORT METHOD EXPOSES IT)
NEWER-DRAFT NEGATIVE = PROVED (OLDER ACTIVE REVIEW RETURNED, POINTER RE-READ)
LATER LEGITIMATE SEND = VISIBLE ON A FRESH READ / NO PINNING
CATALOG V1 + COP V2 DOCUMENTS = RETURNED UNCHANGED (DEEP EQUALITY)
DOCUMENT HASH = STORED B09 VALUE / NEVER RECOMPUTED FOR RESPONSE
DESIGNDOCUMENT COMPONENTS = 1
CACHE-CONTROL = NO-STORE
RASTER / PRIVATE ORIGINAL / STORAGE KEY / DOWNLOAD = NONE
REQUIRED AGREEMENT TYPES = FROM design_approval.agreements POLICY
DELIVERED REQUIRED SET = PAYMENT_POLICY + RETURN_POLICY
DESIGN_APPROVAL_TERMS AGREEMENT = ABSENT
EFFECTIVE SET = EXACTLY ONE PER TYPE / PUBLISHED ORDER
AGREEMENT ID + TYPE + VERSION + HASH + LANGUAGE + CONTENT = RETURNED
INCOMPLETE TERMS = BOUNDED 503 / NAMES NO KEY / RESOLVED AFTER TARGET
G01-C1 SS5.6 CONTENT = PUBLISHED VERBATIM (RE-EXTRACTED AND COMPARED)
AGREEMENT PUBLICATION = STAFF-BOOTSTRAP SEAM / REAL ADMIN / 0 OPERATIONS
PUBLICATION IDEMPOTENCY = CONTENT-HASH COMPARISON (3 BOOTSTRAPS -> 2 ROWS)
PUBLICATION HISTORY = APPEND-ONLY / S24 REFUSES AN UPDATE FROM RAW SQL
READ STEP-UP = NOT REQUIRED
PUBLIC READ SIDE EFFECTS = NONE (SEVEN TABLES COMPARED)
SECURE/TARGET UNAVAILABLE = ONE 404 / SECURE_LINK_UNAVAILABLE
DANGLING CASE POINTER = UNREPRESENTABLE (FK REFUSES THE DELETE)
OPENAPI = 69 PATHS / 76 OPERATIONS / 159 SCHEMAS (+306 / -0)
GENERATED CLIENT = REGENERATED ONCE (+71 / -0)
DATABASE MIGRATION = NONE
FU-APP6-B09-CASE-REPO-SIZE-01 = CLOSED (ADAPTER UNTOUCHED AT 399 LINES)
FU-APP6-B08-P01-GATE-01 = CARRIED (NONBLOCKING / OUTSIDE B10)
FU-APP6-DB01-01 = CARRIED (NEXT DATABASE-CHANGE CHECKPOINT)
FU-APP6-B10-AGREEMENT-ACTOR-01 = NEW (NON-BLOCKING / NEEDS A SCHEMA CHANGE)
B11 = NOT STARTED
NEXT CHECKPOINT = APP6-B11
```

### 11.2e `APP6-B11` verdict

```text
APP6-B11 = COMPLETE
HTTP OPERATIONS ADDED = 2
OPERATION IDS = publicDesignReview_approve / publicDesignReview_requestRevision
DOMAIN KEY ENTRY = PublicDesignReviewDecisionController -> publicDesignReview
B10 OPERATION = UNCHANGED (OPERATION OBJECT BYTE-IDENTICAL)
ROUTES = POST /api/public/design-reviews/approve
         POST /api/public/design-reviews/request-revision
GENERIC DECISION / STATUS / IDENTIFIED ROUTE = ABSENT
SECURE TOKEN = STRICT JSON BODY ONLY / NO PATH, QUERY, HEADER OR COOKIE
TOKEN EXAMPLE PUBLISHED = NONE
CLIENT AUTHORITY FIELDS (40-NAME MATRIX) = ABSENT ON BOTH BODIES
AUTHORIZE-SECURE-LINK = REUSED (POLICY -> BUDGET -> DIGEST)
REQUEST_ACCESS = ONLY SCOPE / NEW GRANT ISSUANCE = NONE
CUSTOMER + REQUEST AUTHORITY = GRANT-DERIVED
LOCK ORDER = secure_access_grants -> custom_requests -> design_versions
APPROVE = TR-LC08-04 DELIVERED
REQUEST REVISION = TR-LC08-03 DELIVERED
APPROVE EXACT VERSION + STORED HASH = ENFORCED (GRD-007, TWO HALVES)
APPROVE STEP-UP = ENFORCED / SERVER-DERIVED FROM THE GRANT'S CUSTOMER
CLIENT STEP-UP CHALLENGE ID = ABSENT
REVISION STEP-UP = NOT REQUIRED / RESOLVER NOT COMPOSED / CODE UNREACHABLE
GRD-007 = ENFORCED IN TRANSACTION ON THE LOCKED ROW
GRD-008 = RE-RESOLVED IN TRANSACTION / CHANGED TERMS REFUSE, NEVER SUBSTITUTE
DESIGN_CASES.CURRENT_VERSION_ID = NEVER READ (PROVED BOTH DIRECTIONS)
ACTIVE REVIEW = uq_design_versions__case__sent_for_review ARBITER
CC-02 = PROVED (COMMITTED-FIRST SUPERSESSION -> APPROVAL_VERSION_MISMATCH)
CC-04 = PROVED (FIRST DECISION WINS / LOSER = INVALID_TRANSITION)
CC-16 = PROVED (COMMITTED REVOKE -> 404, ZERO WRITES)
RACE HARNESS = INDEPENDENT CONNECTIONS + pg_locks BARRIER / NO PROCESS MUTEX
DESIGN.APPROVE IDEMPOTENCY = DELIVERED (SCOPE = VERSION, TERMS AS A SET)
DUPLICATE APPROVAL = APPROVAL SNAPSHOT REPLAY / ZERO NEW WRITES
REFUSED FIRST ATTEMPT = NO POISONED IDEMPOTENCY ROW
APPROVAL SNAPSHOT = IMMUTABLE (UPDATE + DELETE REFUSED FROM RAW SQL)
CATALOG SNAPSHOT = TRUTHFUL (NAMES READ FROM CATALOG AT APPROVAL TIME)
COP SNAPSHOT = TRUTHFUL / QUARTET NULL / NO FABRICATED CATALOG ROW
COP ADAPTER BRANCH = DELIVERED (CST-131 UNION, NO PLACEMENT ASSERTION)
THREAD COLOURS = DERIVED FROM THE FROZEN DOCUMENT / DEDUPLICATED / NO PALETTE
PREVIEW HASH = NULL / NEVER MANUFACTURED
AGREEMENT EVIDENCE = EXACT EFFECTIVE SET / TYPE AND HASH FROM PERSISTENCE
TR-LC11-09 = SYSTEM PROJECTION IN THE SAME TRANSACTION
DIRECT APPROVED COMMAND = ABSENT
REVISION KEEPS REQUEST = DESIGN_REVIEW / NO TRANSITION ROW / NO SELF-EDGE
DESIGN.APPROVED = EMITTED ONCE ON THE APPROVAL_SNAPSHOT
DESIGN.REVISION-REQUESTED = EMITTED ONCE ON THE DESIGN_VERSION
AUDIT = CUSTOMER ACTOR / VERSION TARGET / HASH AND TERMS REFS ONLY
ROLLBACK = LAST-WRITE INJECTION / SEVEN-TABLE ZERO CENSUS / RETRY SUCCEEDS
ORDER/PAYMENT/INVENTORY/PRODUCTION SIDE EFFECTS = NONE (EIGHT TABLES CHECKED)
SERVER RASTER / STORAGE LEAK = NONE
OPENAPI = 71 PATHS / 78 OPERATIONS / 163 SCHEMAS
ARTIFACT DIFF = +2 OPS / +4 SCHEMAS / -0 / 0 PRE-EXISTING PATHS OR SCHEMAS CHANGED
GENERATED CLIENT = REGENERATED ONCE (+218 / -0)
DATABASE MIGRATION = NONE (36)
FOCUSED TESTS = 171 ACROSS 7 SUITES
FU-APP6-B08-P01-GATE-01 = CARRIED (NONBLOCKING_PREEXISTING / DO NOT REPAIR)
FU-APP6-DB01-01 = CARRIED (NEXT DATABASE-CHANGE CHECKPOINT)
FU-APP6-B10-AGREEMENT-ACTOR-01 = CARRIED (OUTSIDE B11 / NO SCHEMA CHANGE)
A01/A02/S01/S02 = NOT STARTED
NEXT CHECKPOINT = APP6-A01
```

### 11.3 Locked APP6 authority (`APP6-G01`, `IMP-D051`)

The authority package is
[`../audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md`](../audits/APP6_G01_DESIGN_REVIEW_AND_QUOTATION_AUTHORITY.md)
and the COP design-context ADR is
[`../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md`](../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md).
Every later APP6 checkpoint reads them instead of re-deciding. In short:

| Topic | Locked value |
|---|---|
| Design context | Catalog **XOR** customer-owned product, on the delivered `order_items` shape; no fabricated or borrowed Catalog row |
| COP geometry | the formal version’s frozen positive `physical_width_mm`/`physical_height_mm` placement envelope, never `customer_owned_products.physical_*_mm` |
| `APP6-DB01` contract | `CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS` — eight operations, ADR-APP6-001 §4 |
| Quotation validity | 7 calendar days from the committed send instant |
| Effective expiry | `now >= valid_until`, in transaction; the `TR-LC12-05` sweep is never the arbiter |
| Deposit | 40 % / 60 % as policy authority; APP6 creates no Order, obligation, attempt or collection |
| Required agreement types | `[PAYMENT_POLICY, RETURN_POLICY]`, as policy configuration. `DESIGN_APPROVAL_TERMS` is **not** a required type; the exact-design confirmation is GRD-007 approval semantics, not an agreement |
| Agreement content | Locked, source-traceable, in the authority package §5.5–§5.6: `PAYMENT_POLICY` from BR-004/005/006/008/010 + D-012/013/014 + ADR-DB3-001; `RETURN_POLICY` from the ADR-DB3-002 stage matrix. `APP6-B10` publishes it and drafts nothing |
| Review rendering | safe document → APP3 native-SVG renderer → `APP3-S09` watermark; no server raster pipeline, no export |
| Secure access | `REQUEST_ACCESS` reused; no new grant kind or token format; `SECURE_LINK_UNAVAILABLE` for every grant-validity failure |
| Transitions | four `system` projections stay non-commandable; `DIGITIZING` is the only direct APP6 Admin transition |
### 11.2 Removed and superseded checkpoints

| Original | Disposition | Where it went |
|---|---|---|
| `APP6-C01` | `REMOVE` | Absorbed into `APP6-B07` / `B08` / `B09` |
| `APP6-C02` | `REMOVE` | Absorbed into `APP6-B10` / `B11` |
| `APP6-C03` | `REMOVE` | Absorbed into `APP6-B01` / `B02` |
| `APP6-C04` | `REMOVE` | Absorbed into `APP6-B03` / `B04` / `B05` |
| `APP6-B01` (old, design review backend) | `SPLIT` + `REORDER` | `APP6-B07`, `APP6-B08`, `APP6-B09` |
| `APP6-B02` (old, customer review backend) | `SPLIT` | `APP6-B10`, `APP6-B11` |
| `APP6-B03` (old, quotation backend) | `SPLIT` + `REORDER` | `APP6-B01`, `APP6-B02`, `APP6-B03` |
| `APP6-B04` (old, quotation send/response) | `SPLIT` (+ partial `DEFER`) | `APP6-B03`, `APP6-B04`, `APP6-B05`; the expiry sweep deferred |
| `APP6-A01` (old, design workbench) | `KEEP` + `REORDER` | `APP6-A02` |
| `APP6-A02` (old, quotation editor) | `KEEP` + `REORDER` | `APP6-A01` |
| `APP6-S01` (old, secure review screen) | `KEEP` + `REORDER` | `APP6-S02` |
| `APP6-S02` (old, secure quotation screen) | `KEEP` + `REORDER` | `APP6-S01` |
| `APP6-E01` | `REDEFINE` | Journey reordered to the locked commercial sequence |
| `APP6-X01` | `KEEP` | Unchanged |
