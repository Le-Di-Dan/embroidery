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
| `APP6-B02` | `INCOMPLETE` | **Next** — Quotation read — 2 operations |
| `APP6-B03` | `INCOMPLETE` | Quotation send — 1 operation; projects `TR-LC11-05` |
| `APP6-B04` | `INCOMPLETE` | Customer secure quotation read — 1 operation |
| `APP6-B05` | `INCOMPLETE` | Quotation acceptance and rejection — 2 operations; projects `TR-LC11-06` |
| `APP6-B06` | `INCOMPLETE` | Digitizing transition — `TR-LC11-07` under `GRD-005`; 0 new operations |
| `APP6-B07` | `INCOMPLETE` | Admin submitted-design read — 1 operation; closes `FU-APP5-B04-DESIGN-PREVIEW-01` |
| `APP6-B08` | `INCOMPLETE` | Design version authoring — 2 operations; also owns the `packages/design-document` COP placement widening (ADR-APP6-001 §3.4) |
| `APP6-B09` | `INCOMPLETE` | Send version for review — 1 operation; projects `TR-LC11-08` |
| `APP6-B10` | `INCOMPLETE` | Customer secure review read — 1 operation; also owns agreement content publication for the required type set (ADR-APP6-001 §6.3, authority §5.4) |
| `APP6-B11` | `INCOMPLETE` | Approval and revision request — 2 operations; projects `TR-LC11-09` |
| `APP6-A01` | `INCOMPLETE` | Admin quotation workbench |
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
HTTP OPERATIONS ADDED = 2
QUOTATION CREATE + FIRST DRAFT = DELIVERED
TR-LC12-01 ADD DRAFT VERSION = DELIVERED
APP6 POLICY DATASET READER = DELIVERED
APP6 POLICY PUBLICATION = DELIVERED
POLICY KEYS PUBLISHED = 3
EXACT MONEY = STRING END TO END
REQUEST PROJECTED TO QUOTED = NO
QUOTATION.SENT EMITTED = NO
DATABASE MIGRATION = NONE
B02/B03/B04/B05 = NOT STARTED
NEXT CHECKPOINT = APP6-B02
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
