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
| `APP5-B05` | `COMPLETE` | Admin moderation notes & guarded transitions — `POST /api/admin/custom-requests/{requestId}/moderation-notes` (`adminCustomRequest_appendNote`) and `POST …/transitions` (`adminCustomRequest_transition`); the APP5 subset as an application-layer restriction, both reason texts, append-only notes and a real competing-transition race. See [`../reports/APP5-B05-COMPLETION-REPORT.md`](../reports/APP5-B05-COMPLETION-REPORT.md) |
| `APP5-B07` | `COMPLETE` | **Inserted by `APP5-S01`** — Public catalog variant selection — `GET /api/public/products/{slug}/variants` (`publicProductVariant_list`); Catalog-owned, anonymous, selection-only, `is_active` eligibility and `display_order, id` ordering. Unblocks `APP5-S01`. See [`../reports/APP5-B07-COMPLETION-REPORT.md`](../reports/APP5-B07-COMPLETION-REPORT.md) |
| `APP5-S01` | `COMPLETE` | Request creation & submission screen at `/yeu-cau/moi` — subject XOR, catalog branch on `publicProductVariantList` with one explicitly chosen variant, customer-owned branch, embedded APP4 verification, `APP5-B02` uploads gated on `bindable`, review, duplicate-safe `APP5-B01` submission and the `APP5-S02` hand-off. See [`../reports/APP5-S01-COMPLETION-REPORT.md`](../reports/APP5-S01-COMPLETION-REPORT.md) |
| `APP5-S02` | `COMPLETE` | Confirmation at `/yeu-cau/da-gui` and grant-scoped single-request status at `/truy-cap` — the request code display-only with no lookup, the APP4 fragment/strip/credential machinery generalised and reused, and `publicCustomRequestStatus` as the **single** status resolution call with `publicSecureLinkResolve` never chained in front of it. Closes `FU-APP4-S01-SUCCESS-HANDOFF-01`. See [`../reports/APP5-S02-COMPLETION-REPORT.md`](../reports/APP5-S02-COMPLETION-REPORT.md) |
| `APP5-A01` | `COMPLETE` | Admin request queue at `/requests` — `adminCustomRequestList` only, the default triage scope stated from the server's `appliedStatuses`, status and subject-kind filters in the URL, opaque keyset continuation, the five approved states and entry into the `APP5-A02` detail route. See [`../reports/APP5-A01-COMPLETION-REPORT.md`](../reports/APP5-A01-COMPLETION-REPORT.md) |
| `APP5-B06` | `COMPLETE` | **Inserted by `APP5-B05`** — Admin private request-asset delivery — `GET /api/admin/custom-requests/{requestId}/assets/{assetId}/content` (`adminCustomRequestAsset_get`); request-bound `COP_IMAGE`/`REFERENCE` only, the **inspection-approved source** streamed through the API because `APP5-B02` writes no derivative, descriptor-before-storage with zero provider calls on a private miss. Closes `FU-APP5-B04-COP-ASSET-DELIVERY-01`. See [`../reports/APP5-B06-COMPLETION-REPORT.md`](../reports/APP5-B06-COMPLETION-REPORT.md) |
| `APP5-A02` | `INCOMPLETE` | **Next** — Admin request detail & moderation — **depends on `APP5-B06`** |
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

**Budget spent, and one slice added (`APP5-B05`, 2026-08-16).** The two Admin
mutations `adminCustomRequest_appendNote` and `adminCustomRequest_transition`
complete the eight planned APP5 operations — four public, four Admin. The
published document moves **54 paths / 59 operations / 126 schemas → 56 / 61 /
130**; B05 added exactly two operations, deleted none and reissued none.

**`APP5-B06` delivered (2026-08-17).** One operation,
`adminCustomRequestAsset_get`, on its own published domain — B04's and B05's four
ids are untouched. The document moves **57 paths / 62 operations / 132 schemas →
58 / 63 / 132**: exactly one operation and one path added, no schema added,
none deleted and none reissued. It serves the **source** object rather than a
derivative, because `APP5-B02` emits no normalization event and one cannot be
invented on a read path.

`APP5-B06` is an **addition** to that budget rather than a re-slice of it, and it
is recorded rather than absorbed: `APP5-B04` found that the Admin detail
describes attachments but publishes no way to open one, and the approved
`FIG-APP5-A02-DETAIL-DESKTOP-COP` (`665:115`) is where a customer-owned garment is
triaged from photographs that are — per `G01-D10` — the only description of the
physical object in the whole record. A frontend checkpoint must not be left to
invent that backend capability.

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

### 10.6 Catalog branch blocked; `APP5-B07` inserted (`APP5-S01`, 2026-08-16)

`APP5-S01` stopped at its design/contract audit without writing runtime code.
The approved catalog frames cannot be implemented against the delivered
platform, and the gap is a missing **public contract**, not a frontend problem:

```text
required by SubmitCustomRequestBody.catalog  = productId + productVariantId + designSessionId
obtainable today                              = productId (publicProductPlacementGet)
                                                designSessionId (APP3 resume handle)
missing                                       = productVariantId — no public read anywhere
```

Evidence, from the delivered artefacts rather than from prose:

- the published document is **56 paths**; no path matches `variant`, and no
  public operation's response schema contains `productVariantId`;
- `CustomRequestCatalogSubject.productVariantId` is **required**, and
  `custom_requests.product_variant_id` carries `fk_custom_requests__product_variant_id`
  `ON DELETE restrict` to `product_variants` (migration `0012`), so a fabricated
  id is refused by the database rather than merely unvalidated;
- `APP5-D01` `650:3` draws the variant as *"read-only context from the Studio
  session"* (`G01-D08`, `G01-D09`), but `design_sessions.product_variant_id` is
  nullable and **no public design-session use case ever sets it**;
  `DesignSessionSnapshotResponse` and `DesignSessionScopeResponse` publish no
  variant, and no `productId` either — only `productSlug`.

This is `APP5-S01` §20 hard-blocker conditions 1 **and** 2 simultaneously: the
approved design needs a fact no delivered APP3/APP4/APP5 API can provide, and the
Storefront cannot carry the catalog design-session context into `S01` without a
new backend contract.

**Routing (Product Owner, 2026-08-16).** `APP5-B07 — Public catalog variant
selection` is inserted immediately before the `S01` resume. `S01` then resumes
**unchanged in product scope** — both branches, as `APP5-D01` approved them.
Explicitly refused as unblocks: shipping a COP-only `S01`, narrowing `S01` to COP
permanently, relaxing `productVariantId` to optional, deriving a default variant
without authority, giving `publicProductPlacementGet` variant semantics, and
mutating the APP3 Design Session to carry a fact it never owned.

`APP5-B07`, like `APP5-B06`, is an **addition** to the eight-operation APP5
budget rather than a re-slice of it. The budget was for the *request* lane;
neither Admin private asset delivery nor public variant selection existed in it,
and recording them as additions keeps the original estimate honest instead of
retrofitting it. A future phase-entry audit should note the pattern behind both:
`APP5-R00` inventoried the tables an authority needed but not the **reads a
frontend would need to satisfy it**, which is how `B06` and `B07` were each found
by the checkpoint that first tried to consume them.

**Closed (`APP5-B07`, 2026-08-16).** `GET /api/public/products/{slug}/variants`
(`publicProductVariant_list`) publishes the missing fact, and `APP5-S01` is
unblocked. The operation is **Catalog-owned** — Ordering may not query
`product_variants` (`BACKEND_CONVENTIONS.md` §10) — and deliberately narrow:

```text
returns      = productId + [{ productVariantId, colorName, sizeLabel }]
eligibility  = products PUBLISHED + public category + variants.is_active
ordering     = display_order, then id (IDX-068's key, made total)
never        = SKU, price, stock, inventory, is_active, display_order,
               lifecycle, audit — and no default variant
empty list   = truthful, not a 404; that product cannot form a catalog request
```

The published document moves **56 paths / 61 operations / 130 schemas → 57 / 62 /
132**; B07 added exactly one operation, deleted none and reissued none. No
migration: `product_variants` (TBL-013) and its `is_active` column already
existed, and `APP5` still owns exactly the one migration `DB01` added.

`SubmitCustomRequestBody.catalog.productVariantId` remains **required**, and the
APP3 Design Session was not touched — the variant was never the session's fact to
carry, which is precisely why the gap could not be closed there.

**Consumed (`APP5-S01`, 2026-08-16).** The resumed checkpoint built the catalog
branch on `publicProductVariantList` and the Product Owner's locked reading of
the frame: because B07 marks no variant as a default, `650:3`'s read-only
"variant comes from the Studio session" context becomes an **explicit chooser**,
and the quantity table is scoped beneath the one variant the customer picked.
`product_variants.sizeLabel` and `CustomRequestQuantityLine.sizeLabel` are kept
as two different business fields — nothing copies, defaults or validates one
against the other. B07's empty-list answer is rendered as its own catalog state
and never as `650:187`, which stays reserved for a stale Design Session.

### 10.7 One call resolves the link and reads the request (`APP5-S02`, 2026-08-16)

The Product Owner ruled, before implementation, that `/truy-cap` must **not**
chain `APP4-B06` in front of `APP5-B03`:

```text
capture #t=  →  strip fragment  →  clean URL  →  publicCustomRequestStatus  →  status
```

B03 already performs the whole APP4 authorization chain internally — policy, the
secure-link rate limiter, secure-link resolution, the exact `customRequestId`
the grant names, then the customer-safe projection. A `resolve → status` pair
would authorize the same token twice, spend the same per-IP abuse budget twice,
hold the raw credential across two flights and add a round trip whose only
result is a request id B03 resolves for itself and never discloses.

`APP4-B06` stays published and stays exported from the curated api-client
boundary — APP4 owns that contract; this landing simply does not call it. The
`check-app4-s02` gate now enforces the absence directly, because the mistake is
invisible on screen: a chained page renders identically.

**Consequence for the shared machinery.** The fragment reader, the stripper, the
credential lifetime and the three APP4 access states were generalised over the
authorized payload rather than copied, so there is exactly one fragment parser,
one strip and one credential lifetime in the Storefront. `APP4-D01` drew the
authorized state as an empty handoff slot and `APP5-D01` deliberately reuses
those frames rather than redrawing them (`FIG-APP5-MATRIX-STATUS` `674:3`,
`661:335`); the slot is now the request, and the browser-side `APP4-B06` caller
and its placeholder card were deleted rather than left as a second mount point.
