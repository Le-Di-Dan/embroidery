# APP5 — Phase Entry Audit and Roadmap Reconciliation (`APP5-R00`)

**Date:** 2026-08-16 · **Branch:** `production` · **HEAD at entry:** `2f8f250`
· **Working tree at entry:** clean
**Checkpoint type:** audit / replanning. No runtime code, schema, contract,
generated artifact or Figma node was changed.

---

## 1. Why this audit exists

The APP5 phase plan
([`../phases/APP5-CUSTOM-REQUESTS.md`](../phases/APP5-CUSTOM-REQUESTS.md) §6)
carries fifteen candidate checkpoints authored before APP2, APP3 and APP4 were
executed and before the delivered database was consulted. This audit tests every
one of them against the repository as it exists after APP4 closure.

The headline result: **the APP5 persistence layer already exists in full**, and
two of the planning assumptions — a server-side *request draft* and a
*standalone customer-owned product aggregate* — are contradicted by locked
database authority. Neither can be implemented as written.

---

## 2. Authority inspected

### 2.1 Phase and closure authority

| Source | Used for |
| --- | --- |
| [`../phases/APP5-CUSTOM-REQUESTS.md`](../phases/APP5-CUSTOM-REQUESTS.md) | Planning baseline (outcome, scope, 15 candidate checkpoints) |
| [`../reports/APP4-X01-COMPLETION-REPORT.md`](../reports/APP4-X01-COMPLETION-REPORT.md) | APP4 closure verdict, frozen baselines, §Q APP5 handoff boundary |
| [`../reports/APP4-CLOSURE-MATRIX.md`](../reports/APP4-CLOSURE-MATRIX.md) §10 | Accepted capability list handed to APP5; APP5-owned follow-up |
| [`../reports/APP3-CLOSURE-MATRIX.md`](../reports/APP3-CLOSURE-MATRIX.md) | APP3 handoff (`request submission = APP5`), open APP3 follow-ups |
| [`../10-MASTER-APPLICATION-ROADMAP.md`](../10-MASTER-APPLICATION-ROADMAP.md) §6 | Canonical phase status (APP5 = `NOT_STARTED`) |
| [`../01-DELIVERY-GOVERNANCE.md`](../01-DELIVERY-GOVERNANCE.md), [`../02-PHASE-AND-CHECKPOINT-MODEL.md`](../02-PHASE-AND-CHECKPOINT-MODEL.md), [`../03-DESIGN-DELIVERY-POLICY.md`](../03-DESIGN-DELIVERY-POLICY.md), [`../04-BACKEND-API-DELIVERY-STANDARD.md`](../04-BACKEND-API-DELIVERY-STANDARD.md), [`../06-OPENAPI-AND-CLIENT-CONTRACT.md`](../06-OPENAPI-AND-CLIENT-CONTRACT.md), [`../08-DATABASE-CHANGE-CONTROL.md`](../08-DATABASE-CHANGE-CONTROL.md) | Slicing, design, endpoint-cap, contract and schema-change rules |

> `docs/implementation/README.md`'s delivery-status blurb still names APP4 as the
> next phase. It is stale by its own rule — that file defers phase status to
> `10-MASTER-APPLICATION-ROADMAP.md` §6, which records APP4 closed. No conflict:
> documented precedence resolves it. Not edited here (out of R00 scope).

### 2.2 Database / domain authority

`DB0_LIFECYCLE_INVENTORY.md` LC-11 · `DB2_AGGREGATE_CATALOG.md` AGG-13 ·
`DB2_BOUNDED_CONTEXT_MAP.md` CTX-ORD · **`DB3_LIFECYCLE_SPECIFICATIONS.md`
§LC-11** (the eleven transitions TR-LC11-01…11) · `DB4_TABLE_CATALOG.md`
TBL-037…042 · `DB4_STATE_AND_TRANSITION_STORAGE.md` · `DB4_COLUMN_DICTIONARY.md`
· `packages/database/src/schema/ordering/*` ·
`packages/database/src/schema/design/{design-sessions,design-cases,design-versions}.ts`
· `packages/database/src/schema/platform/idempotency-records.ts` ·
`packages/database/migrations/0000…0034`.

### 2.3 Backend / API authority

`apps/api/src/modules/order/**` (lifecycle table, repository port, Drizzle
adapter, integration specs) · `apps/api/src/modules/customer/**` (APP4) ·
`apps/api/src/modules/design/presentation/*.controller.ts` ·
`packages/persistence/src/platform/{idempotency-store,idempotency-allocation}.ts`
· `packages/contracts/openapi/openapi.generated.json`.

### 2.4 Frontend authority

`apps/storefront/src/app/**` (7 routes), `apps/storefront/src/features/**` (7
features), `apps/admin/src/app/**` (12 routes).

### 2.5 Design authority — read only

[`../../design/FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md)
§4 registry and §10 coverage summary. **No Figma file was opened, read live or
mutated. No OAuth. No node created, moved or edited.**

### 2.6 Event / audit / notification authority

APP4 notification intake + outbox + worker (`apps/api/src/modules/notification`,
`apps/worker`), `custom_request_transitions` (TBL-042), `request_moderation_notes`
(TBL-041), `audit_events` (migration `0029`), `idempotency_records` (LC-23).

---

## 3. Dependency audit

| Dependency | Status | Capability APP5 needs | Evidence / location | APP5 implication |
| --- | --- | --- | --- | --- |
| **APP2** — catalog / assets | `SATISFIED` | Public product + variant reads to form the request subject; asset intake + storage for attachments | `public-*` catalog controllers; `assets` table; `custom_requests.product_id`/`product_variant_id` FK → `products`/`product_variants` | Subject selection reuses published catalog reads. No catalog change. |
| **APP3** — design sessions | `SATISFIED_WITH_INTEGRATION_WORK` | Take an `ACTIVE` session to `SUBMITTED` and record it as request provenance | `drizzle-design-session.repository.ts:299` `submit(id, customRequestId, at)` exists and is tested (`design-session.integration.spec.ts:237`); **no HTTP surface publishes it** — `public-design-session.controller.ts` exposes only `POST` create and `POST :sessionId/resume` | APP5 calls the existing repository method *inside* its submission transaction. No new session endpoint; no APP3 change. |
| **APP4** — customer / contact | `SATISFIED_WITH_INTEGRATION_WORK` | Verified customer resolution, `REQUEST_ACCESS` grant issuance, notification emission | `ResolveOrCreateVerifiedCustomer`, `SecureGrantIssuer.issue({customRequestId,…})` (internal, no HTTP), notification intake, public secure-link resolution | APP5 supplies the missing `customRequestId` the issuer already demands. Owns `FU-APP4-S01-SUCCESS-HANDOFF-01`. |

No dependency is a `BLOCKING_GAP`. The integration work in APP3/APP4 is exactly
the work APP5 exists to do.

**Constraint carried in from APP4:** there is **no customer account session**.
The only customer-side authorization primitive is the per-request
`REQUEST_ACCESS` grant. Guards present in `apps/api` are staff guards
(`AuthenticatedAdminGuard`, `StaffOriginGuard`, `StaffJsonBodyGuard`) and
session-token guards (`DesignSessionGuard`, `DesignSessionReadGuard`) — nothing
authenticates a *customer*.

**APP3 residue:** `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` (suites importing
`DesignModule` fail when `DESIGN_SESSION_SECRET_PEPPER` is unset) was routed to
APP4 but never dispositioned in APP4's entry audit or closure matrix. It is
resolved in practice — `apps/api/src/modules/customer/config/app4-secret-pepper.config.ts`
governs the variable and the integration harness sets it — but APP5 integration
tests import `DesignModule`, so the first APP5 backend checkpoint must confirm it
rather than assume it.

---

## 4. Existing-capability inventory

| Capability | Exists? | Current owner / location | Reusable by APP5? | Gap |
| --- | --- | --- | --- | --- |
| `custom_requests` root (TBL-037) | **Yes** | `packages/database/src/schema/ordering/custom-requests.ts` | Directly | None |
| `customer_owned_products` (TBL-038) | **Yes** | `.../customer-owned-products.ts` | Directly | Not a standalone aggregate — see §5.2 |
| Quantity breakdown (TBL-039) | **Yes** | `.../custom-request-quantity-breakdowns.ts` | Directly | **Absent from every original checkpoint** — §5.6 |
| Request assets (TBL-040), roles `COP_IMAGE`/`REFERENCE`/`ATTACHMENT` | **Yes** | `.../custom-request-assets.ts` | Directly | Customer upload path for the COP case — §5.5 |
| Moderation notes (TBL-041), append-only, kinds `SPAM/REJECT/PAUSE/CLARIFY/NOTE` | **Yes** | `.../request-moderation-notes.ts` | Directly | None |
| Transition audit (TBL-042) with actor kind, `admin_id`/`customer_id`/`grant_id`, `correlation_id` | **Yes** | `.../custom-request-transitions.ts` | Directly | None — APP5 needs no new audit vocabulary |
| LC-11 legal-transition guard | **Yes** | `apps/api/src/modules/order/domain/lifecycle/request-transitions.ts` | Directly | Must be *narrowed* to the APP5 subset — §5.4 |
| Request repository port + Drizzle adapter (`submit`, `replaceBreakdown`, `attachAsset`, `appendModerationNote`, `transition`, `setCurrentQuotation`) | **Yes** | `apps/api/src/modules/order/{domain,infrastructure}` + `tests/integration/custom-request.integration.spec.ts` | Directly | No application service, no controller, no HTTP |
| Idempotency infrastructure (LC-23) | **Yes** | `idempotency_records` + `packages/persistence/src/platform/idempotency-{store,allocation}.ts`; proven in asset intake | Directly | `request.submit` namespace not yet claimed |
| Verified-customer resolution | **Yes** | APP4 `ResolveOrCreateVerifiedCustomer` | Directly | None |
| `REQUEST_ACCESS` grant issuance | **Yes** | APP4 `SecureGrantIssuer` (internal, no HTTP) | Directly | Needs a real `customRequestId` — supplied by APP5 |
| Notification intake / outbox / worker / replay | **Yes** | APP4 notification module + `apps/worker` | Directly | SE-003/SE-004/SE-012 event mapping not yet defined |
| Design-session → request transition | **Yes** (persistence) | `drizzle-design-session.repository.ts` `submit()` | Directly | No transport |
| Design case header creation | **Yes** (schema + port) | `design_cases`, `design-case.repository.ts` | Directly | Created by APP5 per TR-LC11-01 |
| **Any APP5 HTTP endpoint** | **No** | — | — | Entire presentation + application layer |
| **Any APP5 frontend route/feature** | **No** | — | — | Storefront request creation/status; Admin queue/detail |
| **Any APP5 Figma registry row** | **No** | — | — | Design package required |

Measured OpenAPI surface: **48 paths / 53 operations / 101 schemas** — identical
to the frozen APP4-X01 baseline, i.e. no drift. A path grep for
`request` / `owned` / `order` returns **zero** matches.

---

## 5. Findings that change the plan

### 5.1 There is no request DRAFT — server-side draft checkpoints are invalid

`CUSTOM_REQUEST_STATES` begins at `NEW`. `custom-requests.ts` states it verbatim:

> *"A request is not an order, a quotation, or a design session. It exists only
> after a verified submission (ADR-DB2-001): `customer_id` is NOT NULL because
> the submission transaction creates/resolves the customer first."*

`customer_id` is `NOT NULL` and LC-11 has no pre-`NEW` state. A persisted draft
is therefore unrepresentable. Draft continuity already exists elsewhere: the
APP3 design session **is** the draft — it autosaves (`APP3-B08`), survives
resume (`APP3-B07`) and carries the design document.

**Consequence:** `APP5-C02`, `APP5-B02` (request draft contract/backend) are
removed. `APP5-S02` is redefined from "draft editing screen" to a submission
screen whose recovery is the session, not a server draft.

### 5.2 The customer-owned product is a request child, not an aggregate

`customer_owned_products.custom_request_id` is `NOT NULL`, with
`uq_customer_owned_products__request` giving *at most one COP per request*. The
table has **no status, no lifecycle and no archive column**, and the docblock
fixes ownership as "derived through the request's customer (request-bound
child)".

The existing repository port confirms the intended shape — COP arrives as a
member of the submission input:

```ts
export interface SubmitRequestInput {
  readonly customerOwnedProduct?: CustomerOwnedProduct | undefined;
  …
}
```

A COP therefore cannot be created, listed, updated or archived before or
independently of its request.

**Consequence:** `APP5-C01`, `APP5-B01`, `APP5-S01` (standalone COP
contract/backend/UI, "create/read/update/archive within allowed lifecycle") are
removed as separate slices; the COP becomes a branch of the submission payload
and a form section of the request-creation screen.

### 5.3 No customer session exists — a customer request *list* is not buildable

APP4 delivered grant-scoped access only. There is no customer login, no customer
session guard, and `SecureGrantIssuer` deliberately has no HTTP surface ("an
unauthenticated 'issue a grant' route would be a way to mint someone's only
credential"). A `GET /custom-requests` returning *the customer's requests*
requires an authenticated customer principal that does not exist and that APP5
is not scoped to invent.

**Consequence:** the phase-plan scope line "Request list/detail/status for
customer" narrows to **grant-scoped single-request status**, reached from the
secure link APP4 already resolves. `APP5-S03` is redefined accordingly.

### 5.4 Only five of the eleven LC-11 transitions belong to APP5

From `DB3_LIFECYCLE_SPECIFICATIONS.md` §LC-11:

| APP5-owned | Actor |
| --- | --- |
| TR-LC11-01 `(submit) → NEW` | customer |
| TR-LC11-02 `NEW → UNDER_REVIEW` | admin |
| TR-LC11-03 `UNDER_REVIEW → NEEDS_CLARIFICATION` | admin |
| TR-LC11-04 `NEEDS_CLARIFICATION → UNDER_REVIEW` | admin / customer info |
| TR-LC11-10 `UNDER_REVIEW\|NEEDS_CLARIFICATION → REJECTED` | admin |
| TR-LC11-11 `(non-terminal) → CANCELLED` | per stage matrix, GRD-020 |

TR-LC11-05…09 (`QUOTED`, `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW`,
`APPROVED`) are driven by quotation and design-version events owned by **APP6+**.
`isLegalRequestTransition` permits all of them because it encodes LC-11 in full —
correctly, since it is the lifecycle table, not a phase gate. APP5's moderation
service must apply an **additional APP5 authority subset** on top of it, or
Admin will be able to drive a request to `QUOTED` with no quotation behind it.
TR-LC11-11 (`CANCELLED`) carries GRD-020 and a compensation saga (LC-21) whose
downstream steps do not exist yet; in APP5 only the pre-quotation stages are
cancellable, and that boundary must be written down before it is coded.

### 5.5 COP requests have no design session — and no customer upload path

`design_sessions.product_id`, `product_side_id` and `embroidery_area_id` are all
`NOT NULL` FKs into the catalog placement hierarchy. A customer-owned garment has
no catalog product, so **a COP request can never have a design session**. The
schema is self-consistent about this: `REQUEST_ASSET_ROLES` includes `COP_IMAGE`,
so a COP is described by name/description/dimensions plus photographs.

But the only customer-facing upload today is
`POST /api/public/design-sessions/{sessionId}/assets` — session-scoped. With no
session on the COP path, **there is no way for a customer to upload a COP
photograph.** This is a real gap, invisible in the original checkpoint list, and
it is an unauthenticated-upload abuse surface that needs a policy decision before
code (`docs/09-SECURITY-AND-ABUSE-PREVENTION.md`).

*Forward risk, not APP5's:* `design_versions` requires the same four placement
columns `NOT NULL`, so a COP request's design case can never hold a design
version. APP5 creates only the design-case header (TR-LC11-01), so APP5 is
unaffected — but **APP6 digitizing of a COP request is unrepresentable under the
current schema.** Recorded here for APP6 entry.

### 5.6 Quantity breakdown is intake data no checkpoint claimed

`custom_request_quantity_breakdowns` (TBL-039, `quantity > 0`, unique per
request/variant/size) is a child of the request and is present in
`SubmitRequestInput.breakdown`. It is captured at intake — APP6 quotation prices
*from* it — yet no original APP5 checkpoint mentions quantity at all. It belongs
to the submission payload and the request-creation screen.

### 5.7 The submission is one cross-context transaction, not a CRUD write

TR-LC11-01 specifies the whole thing: guards GRD-001/002/027, **"W1 tx (request
+ design case + grant)"**, idempotency namespace **`request.submit`**,
concurrency case **CC-18 duplicate submit**, after-commit **SE-003 admin alert +
confirmation**. One transaction spans four bounded contexts — Ordering, Customer,
Design and Notification — and the "duplicate-submit protection" the phase plan
lists as a scope bullet is this named idempotency contract, satisfied by
infrastructure that already exists (`IdempotencyStore`, `IdempotencyAllocationStore`).

---

## 6. Original checkpoint reconciliation

Every one of the fifteen candidates is dispositioned.

| Original checkpoint | Action | Why | Required predecessor | Revised scope |
| --- | --- | --- | --- | --- |
| `APP5-C01` — Customer-owned product contract | `REMOVE` | COP is a request-bound child with no independent lifecycle (§5.2); a create/list/detail/update/archive contract describes an aggregate that cannot exist. Contract-first is also not this repository's mechanism (§7). | — | Absorbed into `APP5-B01` submission payload |
| `APP5-B01` — Customer-owned product backend | `MERGE` → `APP5-B01` | `SubmitRequestInput.customerOwnedProduct` already exists on the repository port; COP rows are written by the submission transaction. A separate backend slice would need endpoints the model forbids. | `APP5-G01` | Becomes the COP branch of the submission transaction |
| `APP5-S01` — Customer-owned product UI | `MERGE` → `APP5-S01` (new) | No COP screen can precede a request. Registration is a form section, not a capability. | `APP5-D01`, `APP5-B01` | COP form section of the request-creation screen |
| `APP5-C02` — Request draft contract | `REMOVE` | LC-11 has no draft state and `customer_id` is `NOT NULL` (§5.1). Contracts cannot be defined for unrepresentable states. | — | — |
| `APP5-B02` — Request draft backend | `REMOVE` | Same. Draft continuity is the APP3 design session, already delivered (autosave `APP3-B08`, resume `APP3-B07`). | — | — |
| `APP5-S02` — Request creation screen | `REDEFINE` (secondary: `REORDER`) | Still needed, but as a submit-once screen over a session/COP subject — not a draft editor. Must also carry quantity breakdown (§5.6). Moves after design + submission backend. | `APP5-D01`, `APP5-B01`, `APP5-B02` | Becomes `APP5-S01` — subject selection, COP form, quantity, attachments, contact, submit |
| `APP5-S03` — Request confirmation/status | `REDEFINE` | No customer session exists, so no request *list* is buildable (§5.3). Status is grant-scoped and single-request. Also closes `FU-APP4-S01-SUCCESS-HANDOFF-01`. | `APP5-D01`, `APP5-B03` | Becomes `APP5-S02` — confirmation + grant-scoped status |
| `APP5-C03` — Request submission/transition contract | `REMOVE` | The submission contract is the LC-11/TR-LC11-01 specification plus the existing repository port; what genuinely needs pre-locking is cross-context (§5.7) and moves to `APP5-G01`. OpenAPI is generated from the implementation (§7). | — | Authority content → `APP5-G01` |
| `APP5-B03` — Request submission backend | `KEEP` (renumbered `APP5-B01`) | The phase's spine and correctly scoped: submission transaction, idempotency, immutable facts, notification consequence. Absorbs the removed C01/B01/C02/B02 content. | `APP5-G01` | 1 endpoint — `POST /api/public/custom-requests` |
| `APP5-C04` — Admin request operations contract | `REMOVE` | Same generated-contract reasoning; the moderation-transition subset and note-kind policy are authority, not a contract slice, and move to `APP5-G01`. | — | Authority content → `APP5-G01` |
| `APP5-B04` — Admin request operations backend | `SPLIT` → `APP5-B04` + `APP5-B05` | As written it bundles queue filters, detail, notes, transition guards and audit. Reads and guarded writes are different review objects, and the guard work carries the APP5 transition subset (§5.4). | `APP5-G01` | B04 = queue + detail (2 read endpoints); B05 = notes + transitions (2 write endpoints) |
| `APP5-A01` — Admin request queue | `KEEP` (reordered) | Scope stands. | `APP5-D01`, `APP5-B04` | Unchanged |
| `APP5-A02` — Admin request detail/moderation | `KEEP` (reordered) | Scope stands, guarded to the APP5 transition subset. | `APP5-D01`, `APP5-B05` | Unchanged |
| `APP5-E01` — Request E2E | `KEEP` | Journey unchanged and still the right exit proof. | all preceding | Adds the COP path and the grant-scoped status read |
| `APP5-X01` — Phase closure | `KEEP` | Unchanged. | `APP5-E01` | Hand eligible requests to APP6; record the COP/design-version constraint (§5.5) |

---

## 7. Contract-gate decision (C01–C04)

**All four separate contract checkpoints are removed.** Three independent lines
of evidence:

1. **The repository generates contracts from the implementation.**
   `06-OPENAPI-AND-CLIENT-CONTRACT.md` fixes the direction NestJS/Zod →
   `openapi.generated.json` → Orval client. A contract checkpoint that precedes
   the backend has nothing executable to produce.
2. **Direct in-repo precedent.** APP4 planned exactly this shape and abandoned
   it during execution — its phase-doc reconciliation records
   *"Backend split `APP4-C01…C04` → `APP4-B02…B08`"*. APP5 should not re-adopt
   a structure the previous phase measured and replaced.
3. **The domain contract already exists** as locked authority: LC-11, the TBL-037…042
   schema, and the `CustomRequestRepository` port with its `SubmitRequestInput`,
   `TransitionRequestInput` and `RequestActor` types.

What a contract checkpoint *would* legitimately have locked — cross-context
invariants with no single owner — is real and is preserved as `APP5-G01`
(§8), following the `APP4-G01` / `APP3-G01…G07` authority-checkpoint precedent.

---

## 8. Design-gate decision

```text
DESIGN_REQUIRED_BEFORE_UI_ONLY
```

Evidence: `FIGMA_DESIGN_INDEX.md` carries **zero APP5 rows** — the §4 registry
ends at `4.10 APP4-D01`, and the §10 coverage summary enumerates APP1–APP4 and
BRD0 only. The `FIG-WF-*` wireframe and UI01–UI05 nodes (including the UI04
commission flow) are registered `REFERENCE_ONLY`, which §5 states explicitly
*"inform, but do not authorize, implementation"*. Nothing APP3 or APP4 approved
covers request creation, COP entry, confirmation/status, or an Admin request
queue or moderation detail.

Backend checkpoints need no design authority, so design does **not** gate
`APP5-G01`, `B01`–`B05`. It gates every UI checkpoint: `S01`, `S02`, `A01`, `A02`.

`APP5-D01` must cover, as one whole package per `03-DESIGN-DELIVERY-POLICY.md`:
request creation for the catalog+session subject **and** the COP subject
(including the COP form and quantity breakdown), attachment upload states,
submission confirmation, grant-scoped status, Admin request queue with filters
and empty/error states, and Admin request detail with moderation notes and the
APP5 transition subset. Reuse APP3 Studio and APP4 secure-access patterns where
the flows adjoin. It is placed second so its long lead time overlaps backend
execution.

**No design was performed, and no Figma node was read live or modified.**

---

## 9. Missing checkpoints discovered

| New checkpoint | Purpose | Depends on | Why it cannot be absorbed |
| --- | --- | --- | --- |
| `APP5-G01` — Submission, moderation and intake-abuse authority | Lock the APP5 LC-11 transition subset (§5.4); the catalog-XOR-COP subject rule, which DB4 assigns to TX/App because *no same-row CHECK can see it*; the `request.submit` idempotency namespace/scope/fingerprint and CC-18 semantics; request `code` format; asset-role policy; the SE-003/SE-004/SE-012 notification mapping; and the unauthenticated-upload abuse policy for `APP5-B02`. | APP4 closure | These are cross-context invariants spanning ORD, CUS, DSN and NTF with **no database enforcement**. Burying them inside `B01` hides the phase's load-bearing rules in one implementation slice and leaves `B05` re-deriving the transition subset independently. Precedent: `APP4-G01`, `APP3-G01…G07`. |
| `APP5-B02` — Customer request attachment intake | A customer-facing upload path for `COP_IMAGE`/`REFERENCE` assets on the COP branch, which has no design session to upload through (§5.5). Asset ids are bound into `custom_request_assets` by the submission transaction. | `APP5-G01`, `APP5-B01` | Without it the COP journey is undeliverable — the customer cannot photograph the garment. It is an unauthenticated upload surface needing quota, type and scan policy; folding it into `B01` would mix an abuse-bearing intake endpoint into the submission transaction slice. |

`APP5-D01` is not listed as "missing" — the phase plan's §3 design policy already
required this audit to decide it — but it was absent from the §6 candidate list
and is therefore new to the roadmap.

---

## 10. Revised authoritative APP5 roadmap

| Order | Checkpoint | Purpose | Depends on | Main affected area | Acceptance focus |
| ---: | --- | --- | --- | --- | --- |
| 1 | `APP5-G01` — Submission & moderation authority | Lock the APP5 transition subset, subject XOR rule, `request.submit` idempotency contract, code format, asset-role and upload-abuse policy, notification mapping | APP4 closure | Docs + policy data | Every rule traced to LC-11/DB4/GRD authority; no rule invented |
| 2 | `APP5-D01` — Design package | One package: request creation (catalog + COP), attachments, confirmation, grant-scoped status, Admin queue, Admin detail/moderation | `APP5-G01` | Figma + `FIGMA_DESIGN_INDEX.md` | Registry rows with exact node IDs; PO approval before any UI checkpoint |
| 3 | `APP5-B01` — Request submission backend | TR-LC11-01 W1 transaction: resolve verified customer, create request (+COP or catalog subject, quantity, assets), create design case, submit the session, issue the `REQUEST_ACCESS` grant, emit SE-003; `request.submit` idempotency, CC-18 | `APP5-G01` | `apps/api` order module | **1 endpoint** `POST /api/public/custom-requests`; retry does not duplicate; transition + audit rows written |
| 4 | `APP5-B02` — Customer attachment intake | Customer upload for `COP_IMAGE`/`REFERENCE`, bound at submission | `APP5-G01`, `APP5-B01` | `apps/api` asset/order | **≤2 endpoints**; quota/type/scan enforced; orphan assets never reach a request |
| 5 | `APP5-B03` — Grant-scoped request status read | Customer reads one request through its `REQUEST_ACCESS` grant | `APP5-B01` | `apps/api` order + APP4 grant | **1 endpoint**; a wrong/expired/revoked grant reveals nothing |
| 6 | `APP5-B04` — Admin request queue & detail | Filtered, paginated queue and full request detail with COP, assets, notes and transition history | `APP5-G01`, `APP5-B01` | `apps/api` order | **2 endpoints**; staff-guarded; queue uses `ix_custom_requests__status_created_id` |
| 7 | `APP5-B05` — Admin moderation notes & transitions | Append-only notes; guarded transitions restricted to the APP5 subset | `APP5-G01`, `APP5-B04` | `apps/api` order | **2 endpoints**; TR-LC11-05…09 rejected; every move audited with actor + correlation id |
| 8 | `APP5-S01` — Request creation & submission screen | Subject selection (session or COP), COP form, quantity, attachments, contact, submit-once | `APP5-D01`, `APP5-B01`, `APP5-B02` | `apps/storefront` | Approved registry rows cited; double-submit yields one request |
| 9 | `APP5-S02` — Confirmation & grant-scoped status | Post-submit confirmation and the status view reached from the secure link; closes `FU-APP4-S01-SUCCESS-HANDOFF-01` | `APP5-D01`, `APP5-B03` | `apps/storefront` | Verification success now leads somewhere; no request list implied |
| 10 | `APP5-A01` — Admin request queue | Filters, pagination, status, empty/error states | `APP5-D01`, `APP5-B04` | `apps/admin` | Approved registry rows cited |
| 11 | `APP5-A02` — Admin request detail & moderation | Evidence, design/assets, notes, guarded transitions | `APP5-D01`, `APP5-B05` | `apps/admin` | Disallowed transitions are not offerable, not merely rejected |
| 12 | `APP5-E01` — Cross-layer acceptance | Verified customer submits (both subjects), retry does not duplicate, Admin triages through an allowed transition with audit | 1–11 | Runtime | Real API + worker; §7 journey proven end to end |
| 13 | `APP5-X01` — Phase closure | Freeze baselines, disposition follow-ups, hand off to APP6 | `APP5-E01` | Docs | Records the COP/design-version constraint (§5.5) for APP6 |

**Endpoint budget:** 8 feature endpoints across five backend slices, each within
the cap of five tightly related endpoints.

**Schema expectation:** `NO_APP5_MIGRATION` — every table APP5 needs exists
(TBL-037…042 plus `idempotency_records`), and migration `0034` is APP3-owned. If
a backend checkpoint discovers a genuine gap, `08-DATABASE-CHANGE-CONTROL.md`
requires a dedicated forward-only database-change checkpoint; it is not to be
smuggled into a feature slice.

```text
NEXT CHECKPOINT: APP5-G01 — Submission, moderation and intake-abuse authority
```

---

## 11. Risks and unresolved decisions

| # | Item | Impact | Disposition |
| --- | --- | --- | --- |
| 1 | **COP requests cannot hold a design version** — `design_versions` requires four placement columns `NOT NULL` (§5.5) | APP6 digitizing of a customer-owned garment is unrepresentable | Not an APP5 blocker (APP5 creates only the design-case header). Must be resolved at **APP6 entry**, likely by ADR + schema change. Recorded at `APP5-X01`. |
| 2 | **Cancellation saga (LC-21) is not built** — TR-LC11-11 carries GRD-020 and compensation steps whose downstream targets are APP7+ | An unbounded "cancel" would promise compensation that cannot run | `APP5-G01` restricts APP5 cancellation to pre-quotation stages, where no compensation target exists. |
| 3 | **No customer session** (§5.3) | "Request list/detail/status for customer" is narrowed to a grant-scoped single request | Locked by this audit. A customer account is not an APP5 concern. |
| 4 | `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` never formally dispositioned | APP5 integration tests import `DesignModule` | `APP5-B01` confirms the harness supplies `DESIGN_SESSION_SECRET_PEPPER` before claiming a green suite. **No credential may be rotated or written to `.env` to achieve this.** |
| 5 | `docs/implementation/README.md` delivery-status blurb is stale | Cosmetic; precedence documented | Left unchanged — outside R00's allowed scope. Route to `APP5-X01` or a docs checkpoint. |
| 6 | `tools/check-app4-closure.mjs` asserts `APP5 = NOT_STARTED` | Could appear to conflict with APP5 starting | No conflict: the rule matches that string in `APP4-CLOSURE-MATRIX.md`, which is frozen closure history and is not edited by APP5. Verified by reading the gate. |

---

## 12. Command ledger

| Command / check | Audit question | Result | Reruns | Justification |
| --- | --- | --- | --- | --- |
| `git status --short`, `git log -1`, `git branch --show-current` | Baseline | clean · `2f8f250` · `production` | 0 | Cheapest possible baseline |
| Targeted `grep`/`rg` over `packages/database/src/schema`, `apps/api/src/modules`, `apps/*/src/app` | Do APP5 concepts already exist, and under what names? | 6 ordering tables, order module, 0 APP5 routes | 0 | Read-only |
| File reads: LC-11 spec, TBL-037…042, design-session/case/version schema, repository ports, idempotency store, Figma index | Establish authority and real column/lifecycle shape | §4–§5 findings | 0 | Read-only; the only way to disprove the planning assumptions |
| `node -e` count over `packages/contracts/openapi/openapi.generated.json` | Exact current API surface, and does any APP5 path exist? | **48 paths / 53 ops / 101 schemas**; zero request/COP/order paths | 0 | Reads the committed artifact. Matches the frozen APP4-X01 baseline exactly, so no generation or freshness command was needed. |
| `grep` of `tools/check-app4-closure.mjs` | Does R00 invalidate the APP4 closure gate? | No — its `APP5 = NOT_STARTED` rule targets the frozen APP4 matrix | 0 | One targeted grep instead of running the gate |

**No test, build, generation or regression command was run.** Specifically not
run: `pnpm quality`, any Jest suite, the integration suite, Playwright/E2E,
all-workspace typecheck, any build, DB regression, OpenAPI generation or
freshness, generated-client regeneration, SonarQube, any APP2/APP3/APP4 suite,
and `tools/check-figma-design-index.mjs` (no registry row was added or moved).
R00 changed only documentation, so under `VALIDATION_GOVERNANCE.md` §3 no runtime
validation is justified — running any would produce evidence about code this
checkpoint did not touch.
