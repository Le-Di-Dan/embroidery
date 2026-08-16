# APP5 — Custom Requests and Customer-Owned Products

## 1. Outcome

Allow customers to submit embroidery requests for store products or customer-owned products and give Admin a controlled moderation/triage workflow.

## 2. Dependencies

APP2 catalog/assets, APP3 design sessions, and APP4 customer/contact foundations complete.

## 3. Design policy

Audit request and Admin operation flows. If incomplete, produce one APP5 design package covering customer request creation/status and Admin queue/detail/moderation. Reuse APP3 Studio patterns where a design session is attached.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Customer-owned product create/read/update/archive within allowed lifecycle.
- Request draft/create/edit/asset attachment/submit.
- Request list/detail/status for customer where in scope.
- Admin request queue/detail.
- Moderation notes and request transitions.
- Duplicate-submit protection and audit.

## 5. Out of scope

- Design review/approval.
- Quotation pricing/versioning.
- Deposit/payment/order.
- Production scheduling.
- General CRM behavior.

## 6. Candidate engineering checkpoints (SUPERSEDED by `APP5-R00` — see §10)

> **These fifteen slices are the original planning hypothesis and are no longer
> the execution order.** `APP5-R00` audited every one of them against the
> delivered repository; the authoritative roadmap is §10 below. This list is
> retained as history — see
> [`../audits/APP5_PHASE_ENTRY_AUDIT.md`](../audits/APP5_PHASE_ENTRY_AUDIT.md) §6
> for the per-checkpoint disposition.

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP5-C01 — Customer-owned product contract:** Define create, list, detail, update, and archive operations.
- **APP5-B01 — Customer-owned product backend:** Implement ownership, asset references, lifecycle and validation.
- **APP5-S01 — Customer-owned product UI:** Implement bounded registration/list/detail capability if exposed in the approved journey.
- **APP5-C02 — Request draft contract:** Define create, list, detail, update, and asset/design attachment behavior, re-sliced if five endpoint limit requires.
- **APP5-B02 — Request draft backend:** Implement request ownership, snapshots/references, validation and duplicate safety.
- **APP5-S02 — Request creation screen:** Implement product/design/contact/details entry with recovery and validation.
- **APP5-S03 — Request confirmation/status:** Implement submitted state and bounded customer status view.
- **APP5-C03 — Request submission/transition contract:** Define submit and any customer cancellation-before-review operation separately from Admin moderation.
- **APP5-B03 — Request submission backend:** Implement submission transaction, idempotency, immutable submission facts and notification consequence.
- **APP5-C04 — Admin request operations contract:** Define queue, detail, add moderation note, and allowed moderation transitions.
- **APP5-B04 — Admin request operations backend:** Implement filters/queries, transition guards, notes, audit and tests.
- **APP5-A01 — Admin request queue:** Implement filters, pagination, status and error/empty states.
- **APP5-A02 — Admin request detail/moderation:** Implement evidence/design/assets, notes and guarded transitions.
- **APP5-E01 — Request E2E:** Verified customer creates or selects product context, attaches design/assets, submits once despite retry, and Admin triages it through an allowed transition.
- **APP5-X01 — Phase closure:** Hand accepted requests to APP6 review and quotation.

## 7. Critical end-to-end journey

A verified customer submits a request with a valid product/design or customer-owned product, retry does not duplicate it, Admin sees the request and performs only allowed moderation transitions with audit evidence.

## 8. Exit gate

- Ownership and duplicate protection pass.
- Submitted facts are stable.
- Admin transitions obey lifecycle guards.
- Notifications do not break transaction correctness.
- E2E passes.

## 9. Handoff

APP6 creates versioned design review and quotation only from eligible request states.

---

## 10. Audited roadmap (`APP5-R00`, 2026-08-16)

Authority: [`../audits/APP5_PHASE_ENTRY_AUDIT.md`](../audits/APP5_PHASE_ENTRY_AUDIT.md).
This section supersedes §6 for execution order and scope. §1–§5 and §7–§9 stand,
with the three scope corrections noted below.

### 10.1 Status table

| Checkpoint | Status | Note |
|---|---|---|
| `APP5-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP5-G01` | `COMPLETE` | Submission, moderation and intake-abuse authority locked |
| `APP5-D01` | `COMPLETE` | One APP5 design package registered — 65 nodes, `FIGMA_DESIGN_INDEX.md` §4.11; Product Owner approved 2026-08-16 under `FIG-APPROVAL-APP5-D01-PO-001` |
| `APP5-B01` | `COMPLETE` | Request submission backend — `POST /api/public/custom-requests` (`publicCustomRequest_submit`); TR-LC11-01 in one transaction |
| `APP5-DB01` | `COMPLETE` | Intake provenance persistence — migration `0035_add_app5_intake_provenance`: `assets.uploaded_via_challenge_id` (REL-106, `ON DELETE SET NULL`) + `assets.intake_expires_at`, CST-127/CST-128, quota and due-time indexes. See [`../reports/APP5-DB01-COMPLETION-REPORT.md`](../reports/APP5-DB01-COMPLETION-REPORT.md) |
| `APP5-B02` | `COMPLETE` | Customer attachment intake — `POST`/`GET /api/public/custom-request-intake/challenges/{challengeId}/assets…` (`publicCustomRequestAsset_upload`, `_status`); challenge-scoped reservation quota and the APP5 orphan sweep. See [`../reports/APP5-B02-COMPLETION-REPORT.md`](../reports/APP5-B02-COMPLETION-REPORT.md) |
| `APP5-B03` | `COMPLETE` | Grant-scoped request status read — `POST /api/public/custom-requests/status` (`publicCustomRequest_status`); the request id comes from the APP4 `REQUEST_ACCESS` grant, never from the caller. See [`../reports/APP5-B03-COMPLETION-REPORT.md`](../reports/APP5-B03-COMPLETION-REPORT.md) |
| `APP5-B04` | `COMPLETE` | Admin request queue & detail — `GET /api/admin/custom-requests` (`adminCustomRequest_list`) and `GET /api/admin/custom-requests/{requestId}` (`adminCustomRequest_detail`); read-only, behind APP1's `AuthenticatedAdminGuard`. See [`../reports/APP5-B04-COMPLETION-REPORT.md`](../reports/APP5-B04-COMPLETION-REPORT.md) |
| `APP5-B05` | `INCOMPLETE` | **Next** — Admin notes & guarded transitions; 2 endpoints |
| `APP5-S01` | `INCOMPLETE` | Request creation & submission screen (absorbs the COP form) |
| `APP5-S02` | `INCOMPLETE` | Confirmation & grant-scoped status; closes `FU-APP4-S01-SUCCESS-HANDOFF-01` |
| `APP5-A01` | `INCOMPLETE` | Admin request queue |
| `APP5-A02` | `INCOMPLETE` | Admin request detail & moderation |
| `APP5-E01` | `INCOMPLETE` | Cross-layer acceptance |
| `APP5-X01` | `INCOMPLETE` | Phase closure |

Removed by `APP5-R00`, recorded not deleted: `C01`, `C02`, `C03`, `C04` (the
repository generates OpenAPI from the implementation, and APP4 already replaced
its own `C01…C04` with `B02…B08`); original `B02` and the standalone COP slices
`C01`/`B01`/`S01` (no draft state, and the COP is a request-bound child).

### 10.2 Scope corrections to §4

- **No server-side request draft.** LC-11 begins at `NEW` and
  `custom_requests.customer_id` is `NOT NULL`; a request exists only after a
  verified submission. Draft continuity is the APP3 design session.
- **The customer-owned product is not a standalone aggregate.**
  `customer_owned_products.custom_request_id` is `NOT NULL` with at most one row
  per request, and the table has no lifecycle or archive column. "Create/read/
  update/archive within allowed lifecycle" is withdrawn; the COP is part of the
  submission payload.
- **Customer status is grant-scoped, not a list.** No customer account session
  exists; access is per-request `REQUEST_ACCESS`.
- **Quantity breakdown** (TBL-039) is added to intake scope — it was absent from
  §4 and §6 but is a child of the request and an APP6 pricing input.

### 10.3 Baseline expectations

```text
NO_APP5_MIGRATION expected — TBL-037…042 + idempotency_records all exist
APP5 transitions = TR-LC11-01/02/03/04/10/11 only (05–09 are APP6+)
design gate = DESIGN_REQUIRED_BEFORE_UI_ONLY (zero APP5 Figma rows today)
feature endpoints planned = 8
```

**Correction (`APP5-B02`, 2026-08-16).** `NO_APP5_MIGRATION expected` held for
every *request-side* table — `B01` shipped with no migration — but it inventoried
tables only. It did not cover the *intake-lane* provenance that `APP5-G01` §7
later locked: `G01-D13`'s bound is scoped to the verification challenge, and no
column, index or platform store ties a customer upload to one. `APP5-B02` is
blocked on that gap and `APP5-DB01` is added to close it. Future phase-entry
audits should schema-check an authority checkpoint's *policy* bounds, not only
its table inventory.

**Endpoint budget on track (`APP5-B03`, 2026-08-16).** Four of the eight planned
APP5 operations are delivered — `publicCustomRequest_submit`,
`publicCustomRequestAsset_upload`, `publicCustomRequestAsset_status` and
`publicCustomRequest_status` — leaving two for `B04` and two for `B05`. The whole
published document is **52 paths / 57 operations**; B03 added exactly one
operation and reissued none.

**Six of eight delivered (`APP5-B04`, 2026-08-16).** The two Admin reads
`adminCustomRequest_list` and `adminCustomRequest_detail` join the four public
operations, leaving exactly two for `APP5-B05`. The published document moves
**52 paths / 57 operations / 115 schemas → 54 / 59 / 126**; B04 added exactly two
operations, deleted none and reissued none.

**Closed (`APP5-DB01`, 2026-08-16).** Migration `0035_add_app5_intake_provenance`
adds the missing fact. `NO_APP5_MIGRATION expected` is superseded for the phase:
APP5 owns exactly one migration, and it is a database-change checkpoint of its
own, not a smuggled schema edit inside a feature slice.

### 10.4 Locked cross-context authority (`APP5-G01`, 2026-08-16)

[`../audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md`](../audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md)
is the authority every later APP5 checkpoint cites instead of re-deriving
behaviour. Load-bearing conclusions:

```text
transition subset  = TR-LC11-01/02/03/04/10/11; TR-LC11-05…09 unavailable
cancellation       = ADR-DB3-002 stage S1 only, ADMIN-only, no compensation saga
subject invariant  = catalog XOR customer-owned product, TX/App-enforced (no CHECK)
request.submit key = the verified SUBMISSION-purpose challenge id
request code       = REQ- + 10 CSPRNG chars; server-generated; never an authz input
asset roles        = COP_IMAGE (COP, >=1) + REFERENCE; ATTACHMENT not exposed
upload lane        = IMP-D048 streamed API lane, authorized by the verified challenge
notifications      = customer confirmation is the existing grant link; APP5 adds
                     outbox events only and creates no new notification intent
audit              = TBL-042 is the history; creation writes no transition row
```

Fourteen `APP5-G01 DECISION` rules are registered in that document's §12.

### 10.5 Design authority (`APP5-D01`, 2026-08-16)

The APP5 design gate is closed. `FIGMA_DESIGN_INDEX.md` §4.11 registers **65
nodes** under section `644:3` on page `APP_05` (`641:3`), covering `APP5-S01`,
`APP5-S02`, `APP5-A01` and `APP5-A02`.

```text
figma page      = APP_05 641:3 · root section 644:3 · 10 sub-sections · 65 frames
pre-draw audit  = NO_EXISTING_APP5_DESIGN (zero APP5 rows, empty canvas)
registry status = all 65 rows REVIEW_REQUIRED — D01 does not self-approve
routes locked   = /yeu-cau/moi · /yeu-cau/da-gui · /truy-cap · /requests · /requests/{requestId}
access states   = NOT redrawn; APP4-D01 629:3/20/37/53/70/87 remain the authority
new DS assets   = none (0 components, 0 instances, 0 new tokens or styles)
```

**UI gate released (2026-08-16).** The Product Owner reviewed and approved the
complete `APP5-D01` package; `APP5-B01` recorded it in the registry, promoting
all **65** rows `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP5-D01-PO-001` without opening or altering Figma. `APP5-S01`,
`APP5-S02`, `APP5-A01` and `APP5-A02` may now consume their registered nodes and
must cite the exact registry ids they build against.

One design decision needs backend confirmation rather than silent inheritance:
the moderation dialogs treat the **internal reason** and the **customer-visible
text** as two separate required fields on `NEEDS_CLARIFICATION`, `REJECTED` and
`CANCELLED`. `APP5-G01` §2 marks only `reason` as required (`R`); the second
field is a UI-level requirement derived from SE-004/SE-012 carrying
`customer_visible_reason` / `cancelled_customer_reason`. `APP5-B05` must confirm
or correct it.

Carried to APP6: `design_versions` requires four catalog placement columns
`NOT NULL`, so a customer-owned-product request cannot hold a design version
under the current schema.
