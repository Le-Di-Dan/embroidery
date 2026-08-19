# APP6 — Phase Entry Audit and Roadmap Reconciliation

- Checkpoint: `APP6-R00`
- Mode: `AUDIT_ONLY / RECONCILIATION_ONLY`
- Entry branch/HEAD: `production` @ `3d4c74e`
- Date: 2026-08-19

This audit establishes the APP6 execution authority from current repository
truth. It changes documentation only. No runtime source, schema, migration,
generated artifact or Figma node was touched.

---

## 1. Baseline

```text
branch              production
entry HEAD          3d4c74e  docs(app5): record the X01 commit hash in its completion report
working tree        1 unrelated pre-existing change:
                    ` D beginning_app_development_with_flutter_by_rap_payne.pdf`
                    (deleted, unstaged — the user's own, preserved untouched)
APP5 closure commit 4da8947  reachable from HEAD (git merge-base --is-ancestor → true)
```

### 1.1 Handoff expectation vs current truth

Every frozen APP5-X01 value was recomputed from the committed artifacts. **No
delta.**

| Artifact | APP5-X01 expectation | Current truth | Verdict |
|---|---|---|---|
| OpenAPI paths / operations / schemas | 58 / 63 / 132 | **58 / 63 / 132** | identical |
| OpenAPI SHA-256 | `ef5dc35…5cb1f243` | `ef5dc35884d4f38f7adac5164b6401971bceeda326f11cb27a35bf655cb1f243` | identical |
| Migrations | 35 | **35**, latest `0035_add_app5_intake_provenance` | identical |
| APP5 HTTP operations | 10 | 10 (`/api/public/custom-requests`, `…/status`, `…/custom-request-intake/challenges/{challengeId}/assets` ×2, `/api/public/products/{slug}/variants`, `/api/admin/custom-requests` ×2, `…/assets/{assetId}/content`, `…/moderation-notes`, `…/transitions`) | identical |
| Figma references on `APP_05` | 65 | 65, all `APPROVED_FOR_IMPLEMENTATION` | identical |

`APP5-X01 = COMPLETE`, phase verdict `PASS_WITH_FOLLOW_UPS`, blocking
follow-ups `0` — verified in
[`../reports/APP5-X01-COMPLETION-REPORT.md`](../reports/APP5-X01-COMPLETION-REPORT.md).
APP5 is not reopened.

### 1.2 APP6 authority discovery

The canonical phase document **exists**:
[`../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`](../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md).
No `DOC_GAP` is raised. The master roadmap
([`../10-MASTER-APPLICATION-ROADMAP.md`](../10-MASTER-APPLICATION-ROADMAP.md) §17)
and the traceability matrix agree on the outcome and the R3 release binding; the
phase source map agrees on the source set.

---

## 2. What APP5 actually hands APP6

| Handoff | Classification | Evidence |
|---|---|---|
| Eligible Custom Request states (`NEW` / `UNDER_REVIEW` / `NEEDS_CLARIFICATION` reachable; `REJECTED` / `CANCELLED` terminal) | `READY_AS_IS` | `CUSTOM_REQUEST_STATES` in `packages/database/src/schema/ordering/custom-requests.ts`; APP5-B05 delivered TR-LC11-01/02/03/04/10/11 |
| Request transition history + moderation notes | `READY_AS_IS` | `custom_request_transitions`, `request_moderation_notes`; the APP5-B04 detail read exposes both |
| Customer-owned-product branch (TBL-038) | `READY_WITH_APP6_EXTENSION` | The row exists and is written at submission; **it cannot yet reach a design version** — §4 |
| Request-bound COP evidence/assets + private streaming | `READY_AS_IS` | `custom_request_assets`; `GET /api/admin/custom-requests/{requestId}/assets/{assetId}/content` (APP5-B06) |
| Quantity lines (`custom_request_quantity_breakdowns`) | `READY_AS_IS` | Written at submission; both the approval snapshot's `quantity_total` and the quotation version's `quantity_total` bind to it |
| Catalog request provenance / Design Session context | `PARTIAL` | `custom_requests.submitted_session_id` is provenance with **no FK**. LC-07 states *"`SUBMITTED` retention is APP5's and is not purged by APP3"*, and `IDX-085`'s sweep predicate is `status = 'ACTIVE'` — so a submitted session survives, but nothing structurally guarantees it. APP6 must read it defensively and must never treat its absence as an error |
| `REQUEST_ACCESS` secure grant | `READY_AS_IS` | `GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']`; ADR-DB3-004 r1 makes one grant cover `view` / `comment` / `accept-quotation` / `approve-design` for one (Customer, Request). **No new scope kind and no migration is needed for APP6's customer actions** |
| Grant-scoped customer status surface | `READY_WITH_APP6_EXTENSION` | `POST /api/public/custom-requests/status` (APP5-B03) is the reuse pattern for every APP6 customer read: POST, token in the body, one uniform `404 / SECURE_LINK_UNAVAILABLE` for every failure cause |
| Admin request queue / detail / moderation surface | `READY_WITH_APP6_EXTENSION` | `/requests` and `/requests/{requestId}` in `apps/admin`; the APP5-B05 transitions endpoint is the natural host for APP6's one admin-commanded transition (§5.4) |
| Notification / outbox foundation | `READY_AS_IS` | APP4 notification intent + delivery worker + replay; the SE-003/SE-004/SE-012 mapping is delivered. APP6 adds the `design.review-ready`, `design.revision-requested`, `design.approved` and `quotation.sent` event kinds — data, not architecture |

Nothing in this list needs rebuilding.

---

## 3. Lifecycle and commercial ordering (reconstructed, not invented)

`ADR-DB3-001` (Accepted, DEC-16) locks **Option A**:

```text
Request review → Quotation sent → Customer ACCEPTS quotation (secure flow)
→ Digitizing → Design review loop → Customer APPROVES exact design version
→ [APP7] Order created (AWAITING_DEPOSIT) + both payment obligations
```

Two rules make this an **execution-order** constraint, not merely a business
preference:

1. **GRD-005** — a request enters `DIGITIZING` only from `QUOTE_ACCEPTED`, with
   no admin override (`DB3_TRANSITION_GUARD_CATALOG.md`, GRD-005; ADR-DB3-001
   rule 1).
2. **TR-LC08-01** — a design version may be created only when the request is in
   `{DIGITIZING, DESIGN_REVIEW}`, or on an ADR-DB3-003 reopen.

Therefore **no design version can exist until a quotation has been sent and
accepted.** The candidate checkpoint list delivers design review first and
quotation second; that order is unreachable at runtime. §6 reorders it.

`06-ORDER-AND-DESIGN-LIFECYCLE.md` §141 (*"Terms version accepted"*) and
`GRD-008` place the agreement ceremony **inside** design approval rather than in
a separate flow — `DB3_AGREEMENT_ACCEPTANCE_SPEC.md`: *"một ceremony tại
approval là đủ"*.

No conflict between sources was found, so no precedence rule had to be applied
and no source is superseded.

### 3.1 APP6 boundary

APP6 ends at the approval event. `TR-LC11-09`'s after-commit consequence
(*"order creation triggered (LC-14)"*) and `TR-LC14-01` are **APP7**. APP6 emits
`SE-005 design.approved`; it must not create an Order, an Order Item, a payment
obligation, a soft hold or a reservation.

---

## 4. The customer-owned-product design-version contradiction

### 4.1 Is it still present at HEAD?

**Yes.** Verified in source, not carried over from the APP5 report.

`packages/database/src/schema/design/design-versions.ts`:

```text
productId:         idReference('product_id').notNull()
productVariantId:  idReference('product_variant_id').notNull()
productSideId:     idReference('product_side_id').notNull()
embroideryAreaId:  idReference('embroidery_area_id').notNull()
```

The same four columns are `NOT NULL` again on
`packages/database/src/schema/design/approval-snapshots.ts`, each with a
`restrict` FK into Catalog.

A customer-owned-product request has **none** of them:
`custom_requests.product_id` / `product_variant_id` are nullable and stay NULL
on the COP branch, and TBL-038 carries *"no `sku_id`, no stock columns and no
price authority"* — INV-13, *"**Never a SKU**"*.

### 4.2 Is a formal design version required for a COP request?

**Yes, unavoidably.** A COP request must be able to reach `APPROVED`
(`TR-LC11-09`), which is `system (approval)` guarded by *"TR-LC08-04 done"* — a
design-version transition. `TR-LC08-04` in turn creates the Approval Snapshot,
the row that authorizes the order, the production job and the machine file.
There is no approval path that bypasses a design version.

### 4.3 Can the current schema express it honestly?

**No.** The only ways to satisfy four `NOT NULL` Catalog FKs for a garment the
customer supplied are to create a fake product/variant/side/area or to point at
an unrelated real one. Both fabricate a catalog SKU for a COP, contradicting
INV-13 and the explicit dictionary note. Neither is acceptable.

### 4.4 The minimal forward change — and its precedent

The repository **already models this exact branch**, one table away.
`packages/database/src/schema/ordering/order-items.ts`:

```text
skuId:                  idReference('sku_id')                    -- nullable
customerOwnedProductId: idReference('customer_owned_product_id') -- nullable
check: (sku_id is not null and customer_owned_product_id is null)
    or (sku_id is null     and customer_owned_product_id is not null)
```

So the minimal forward direction is not an invention: apply the delivered
catalog-XOR-COP shape to `design_versions` and `approval_snapshots` — relax the
four placement FKs to nullable, add a nullable `customer_owned_product_id` FK,
and add one exactly-one-branch `CHECK` per table. `physical_width_mm` /
`physical_height_mm` stay `NOT NULL` and positive on both tables; on the COP
branch they are the only geometry, and the admin freezes real values at send.

`production_specifications` is **unaffected** — it carries only denormalised
`product_name` / `side_name` / `area_name` text and no placement FK, so a COP
name already flows through it truthfully.

### 4.5 What still needs an authority ruling first

The column shape is mechanical; three semantics are not, and a migration must
not front-run them:

1. **What bounds a COP design?** `packages/design-engine`'s out-of-bounds
   invariant is stated against an exact `embroidery_area_id`. A COP has no area.
   The candidate answer is the COP's own physical dimensions, but that changes
   what the geometry guard means and must be ruled, not assumed.
2. **What are `product_name` / `side_name` / `area_name` on a COP approval
   snapshot?** All three are `NOT NULL` text and are the *human* evidence of
   what was embroidered. The COP's `name` covers one; the other two need a
   locked representation.
3. **Does the version's placement remain "frozen at send" on the COP branch?**
   `customer_owned_products.physical_width_mm` / `physical_height_mm` are
   themselves nullable, so the freeze source differs from the catalog branch.

### 4.6 Disposition

```text
APP6_SCHEMA_DISPOSITION = MIGRATION_REQUIRED
```

Blocked until it lands: every checkpoint that creates a formal design version, a
design review or an approval snapshot for a COP request. The revised roadmap
places `APP6-G01` (authority + ADR) and `APP6-DB01` (forward migration) ahead of
all of them.

**R00 wrote no SQL and no ADR.**

---

## 5. Capability inventory

### 5.1 Design authority

| Capability | Status | Current owner / evidence | Gap | Roadmap consequence |
|---|---|---|---|---|
| Design Case root + current pointer | `DELIVERED` | `DesignCaseRepository.createForRequest` / `setCurrentVersion`; `custom_requests.current_design_case_id`; APP5-B01 creates the case at submission | — | Reuse; APP6 creates no case |
| Formal design version creation | `PARTIAL` | Port `createVersion` and `drizzle-design-case.repository.ts` exist; **no application use case, no module wiring, no HTTP operation** | Application + API + UI | `APP6-B08` |
| Immutable / versioned document semantics | `DELIVERED` | `uq_design_versions__case_version`; the CST-090 immutability triggers from migration `0030_add_integrity_triggers` | — | Prove, don't build |
| Canonicalization / hash / integrity | `DELIVERED` | `packages/design-document` — `canonicalizeDesignDocumentToBytes`, `hashDesignDocumentSha256`, `formatDesignDocumentHash` on a server-only subpath (ADR-DB1-012 §8) | — | `APP6-B09` consumes it |
| Parent / supersede relationship | `DELIVERED` | `parent_version_id` self-FK; `DesignCaseRepository.supersede` | — | Reuse |
| One active review rule (INV-16) | `DELIVERED` | `uq_design_versions__case__sent_for_review` partial unique — the CC-03 arbiter | — | `APP6-B09` maps the constraint failure to `REVIEW_ALREADY_ACTIVE` |
| Preview / render artifact authority | `ABSENT` (by design) | `preview_derivative_id` / `preview_hash` are **nullable**; no server-side design→raster pipeline exists anywhere | No server render | `APP6-G01` rules that APP6 renders the document client-side through the delivered APP3 SVG renderer plus the `APP3-S09` watermark, leaves both preview columns NULL and creates no raster pipeline. A server-rendered production artifact is APP8 territory |
| Admin access to request/design evidence | `PARTIAL` | APP5-B04 detail and APP5-B06 asset streaming exist; **no authorised read of the submitted Design Session document** | The digitizing source | `APP6-B07` — also closes `FU-APP5-B04-DESIGN-PREVIEW-01` |
| Customer secure delivery of a review version | `ABSENT` | — | Everything | `APP6-B10` |
| Revision-request recording | `PARTIAL` | `design_reviews` table + `DesignCaseRepository.recordReview` | Application + API + UI | `APP6-B11` |
| Review outcome / history | `PARTIAL` | `DESIGN_REVIEW_OUTCOMES = ['APPROVE','REQUEST_REVISION']`; `listVersions` | Projection + surface | `APP6-B08`, `APP6-A02` |

### 5.2 Approval

| Capability | Status | Current owner / evidence | Gap | Roadmap consequence |
|---|---|---|---|---|
| Exact-version approval (GRD-007) | `PARTIAL` | `ApprovalSnapshotRepository.createFromVersion(submittedDocumentHash)`; the port offers no update and no delete, by design | Application + API | `APP6-B11` |
| Document / preview hash evidence | `DELIVERED` | `approval_snapshots.document_hash` `NOT NULL` + format CHECK; CST-074 forces a hash once a version leaves `DRAFT` | — | Prove |
| Customer identity evidence | `DELIVERED` | `customer_id` plus `contact_name` / `contact_email` / `contact_phone`, denormalised at approval | — | Reuse |
| Secure grant scope / purpose | `DELIVERED` | `REQUEST_ACCESS`; ADR-DB3-004 r1 action-scope set | — | No new scope kind |
| Step-up re-verification (GRD-003) | `DELIVERED` | `apps/api/src/modules/customer/application/step-up-window.service.ts` and `stepUpNotBefore`; `approval_snapshots.step_up_challenge_id` is `NOT NULL` | — | `APP6-B11` composes it |
| Agreement / terms acceptance (GRD-008) | `PARTIAL` | `AgreementRepository.effectiveVersions` / `publishVersion` and `approval_snapshot_agreement_acceptances` exist; **no agreement content is published and the required type set is unspecified** — it is policy configuration (CON-144) | Data + the required-type ruling | `APP6-G01` locks the type set and ships agreement content plus the policy values as a dataset on the delivered `PublishApp4PolicyUseCase` precedent; `APP6-B10` returns the effective set alongside the version so the customer sees exactly what `APP6-B11` records |
| Approval Snapshot persistence | `PARTIAL` | Repository + S24 immutability triggers delivered | Application + API | `APP6-B11` |
| Idempotency | `DELIVERED` (infrastructure) | `idempotency_records`; namespace `design.approve`, scope *(design version)*, fingerprint *version id + document hash + terms version*, replay returns the snapshot (`DB3_IDEMPOTENCY_SPECIFICATION.md`) | Wiring | `APP6-B11` |
| Approval vs supersede / duplicate approval | `PARTIAL` | CC-02 / CC-04 defined; `design-races.integration.spec.ts` exists at the persistence layer | Application-level race proof | `APP6-B11`, `APP6-E01` |
| Immutable historical approval evidence | `DELIVERED` | S24 rejects update and delete; the port exposes neither | — | Prove |

### 5.3 Quotation

| Capability | Status | Current owner / evidence | Gap | Roadmap consequence |
|---|---|---|---|---|
| Quotation root + version + line items | `DELIVERED` (persistence) | `QuotationRepository` — `createForRequest`, `addVersion`, `send`, `setCurrentVersion`, `accept`, `expire`, `loadLineItems`, `listVersions`, `acceptedVersionForRequest`; `QuotationModule` is composed and exports the port | No application layer, no HTTP, no UI | `APP6-B01`…`APP6-B05` |
| Stitch count / pricing inputs / manual adjustment | `DELIVERED` (persistence) | `AddQuotationVersionInput.stitchCount`, `manualAdjustmentAmount`, `adjustmentReason` | Authoring surface | `APP6-B01`, `APP6-A01` |
| Currency / exact money | `DELIVERED` | Every amount is `numeric(14,2)` and crosses the port as a **string** — the port states outright that `numeric` must never become a JS number | — | Enforce through the projections and the generated client |
| Validity / expiry | `PARTIAL` | `valid_until` and `expire()` exist; the duration is a deferred config value (ADR-DB3-001 *Deferred Details*) | The value | `APP6-G01` publishes it. The `TR-LC12-05` **sweep** is `SE-015` scheduled work and is deferred out of APP6 — see §13 risk 6 |
| SENT immutability; revision as a new version | `DELIVERED` | S24 freeze triggers; the port offers no reprice method | — | Prove |
| Current-version pointer semantics | `DELIVERED` | `setCurrentVersion` + G-DB7-03 | — | Reuse |
| Customer secure quotation read | `ABSENT` | — | Everything | `APP6-B04` |
| Acceptance / rejection | `PARTIAL` | `accept(AcceptQuotationInput)`; `TR-LC12-06` reject | Application + API + UI | `APP6-B05` |
| Stale-version acceptance prevention (GRD-006) | `DELIVERED` (contract) | The port carries G-DB7-20: *"acceptance binds the exact current, sent, unexpired version"* | Wiring + race proof | `APP6-B05` |
| Quotation acceptance evidence | `DELIVERED` (persistence) | `quotation_acceptances` | Application | `APP6-B05` |
| Idempotency `quotation.accept` | `DELIVERED` (infrastructure) | Scope *(quotation version)*, fingerprint *version id + accepted total*, replay returns the acceptance evidence | Wiring | `APP6-B05` |
| Audit / outbox / notification | `DELIVERED` | `audit_events`, `outbox_events`, notification intent + worker | Event kinds only | `APP6-B03`, `APP6-B09`, `APP6-B11` |

### 5.4 Custom Request integration — the APP6-owned transitions

APP5 owns TR-LC11-01/02/03/04/10/11. **APP6 owns exactly five**, and the actor
column decides how each must be implemented:

| TR | From→To | Actor per `DB3_LIFECYCLE_SPECIFICATIONS.md` | Source aggregate event | Guard | Transactional boundary | After-commit | Implementation rule |
|---|---|---|---|---|---|---|---|
| TR-LC11-05 | `UNDER_REVIEW`→`QUOTED` | **system** (quotation sent, LC-12) | `TR-LC12-02` | quotation version `SENT` | same transaction as the send | `SE-004 quotation.sent` | **Projected** inside `APP6-B03`'s transaction. Never an admin command |
| TR-LC11-06 | `QUOTED`→`QUOTE_ACCEPTED` | **system** (acceptance, LC-12) | `TR-LC12-03` | GRD-006 | same transaction as the acceptance | optional soft hold — **not APP6** | **Projected** inside `APP6-B05`'s transaction |
| TR-LC11-07 | `QUOTE_ACCEPTED`→`DIGITIZING` | **admin** | — | **GRD-005** | own transaction | optional | The **only** directly commanded APP6 transition; extends the delivered APP5-B05 endpoint |
| TR-LC11-08 | `DIGITIZING`→`DESIGN_REVIEW` | **system** (version sent) | `TR-LC08-02` | TR-LC08-02 done | same transaction as the send | `SE-004 design.review-ready` | **Projected** inside `APP6-B09`'s transaction |
| TR-LC11-09 | `DESIGN_REVIEW`→`APPROVED` | **system** (approval) | `TR-LC08-04` | TR-LC08-04 done | same transaction as the approval | `SE-005 design.approved` → **APP7** order creation | **Projected** inside `APP6-B11`'s transaction |

Every one of the five is audited (`DB3_AUDIT_SPECIFICATION.md`; the delivered
`custom_request_transitions` row is the evidence APP5-B05 already writes).

**Locked implementation rule.** Four of the five are `system`. No APP6
checkpoint may expose them as an admin-selectable target on the transitions
endpoint, and no APP6 checkpoint may reach `QUOTED`, `QUOTE_ACCEPTED`,
`DESIGN_REVIEW` or `APPROVED` other than as a projection of the owning
aggregate's committed event. The APP5-B05 application-layer restriction — a
target allow-list independent of the shared LC-11 guard — is the delivered
mechanism, and `APP6-B06` widens it by exactly one value.

### 5.5 Notification and secure access

| Capability | Status | Evidence |
|---|---|---|
| Secure grant issuance / revoke / reissue | `DELIVERED` | `secure-grant.issuer.ts`, `revoke-secure-grant.use-case.ts`, `POST /api/admin/secure-grants/{grantId}/revoke` |
| Secure-link resolution + non-enumeration | `DELIVERED` | `public-secure-link.controller.ts`; APP5-B03 established the one-uniform-404 pattern |
| Customer-safe fragment handling | `DELIVERED` | `#t=` captured then stripped before any request (APP4-S02, reused by APP5-S02, proved by `APP5-E01-05`) |
| Notification intent, worker delivery, replay | `DELIVERED` | APP4-B01 / W01 / B08 |
| Sensitive-action step-up | `DELIVERED` | `StepUpWindow` (§5.2) |

APP6 invents no second secure-link architecture, adds no grant scope kind, and
selects **no external notification provider**.

### 5.6 Admin surface seams

`apps/admin/src/app/(protected)/requests/[requestId]` (APP5-A02) is the entry
point. APP6 adds two sibling screens rather than growing it: a quotation
workbench and a design-case workbench. Extending the existing detail screen with
version management, quotation authoring and review history would produce exactly
the oversized review surface the slicing policy forbids.

### 5.7 Storefront surface seams

`/truy-cap` (the APP4-S02 landing, extended by APP5-S02 into the grant-scoped
status view) is the customer entry. APP6 adds two screens under the same
credential machinery. **No customer account portal and no request list** —
APP5-B03's reasoning holds unchanged: no identity exists for a list to be scoped
to, and scoping one to a contact value would make the endpoint an enumeration
oracle.

---

## 6. Candidate-checkpoint reconciliation

Every candidate in
[`../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`](../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md)
§6 is audited. None is omitted.

| Original checkpoint | Action | Repository finding | Required predecessor | Revised scope |
|---|---|---|---|---|
| `APP6-C01` — Design review Admin contract | `REMOVE` | This repository publishes OpenAPI from NestJS decorators inside the checkpoint that owns the endpoint (`04-BACKEND-API-DELIVERY-STANDARD`, `06-OPENAPI-AND-CLIENT-CONTRACT`). APP5 shipped ten operations with **zero** contract-only checkpoints. A standalone contract slice describes a step this project does not have | — | Absorbed into `APP6-B07` / `B08` / `B09` |
| `APP6-B01` — Design review backend | `SPLIT` + `REORDER` | One slice covering *"exact-version/current-pointer guards, request eligibility, audit and tests"* spans the submitted-design read, draft authoring and the send-for-review transaction — three different transactional shapes across four endpoints. It is also unreachable before quotation acceptance (§3) | `APP6-DB01` | → `APP6-B07` (submitted-design read, 1 op), `APP6-B08` (version authoring + history, 2 ops), `APP6-B09` (send for review, 1 op) |
| `APP6-A01` — Admin design review workbench | `KEEP` + `REORDER` | Correct as one screen; must follow the quotation surface, because a request cannot be in `DIGITIZING` before acceptance | `APP6-D01`, `APP6-B07`, `APP6-B08`, `APP6-B09` | Becomes `APP6-A02` in the revised order; scope unchanged |
| `APP6-C02` — Customer review contract | `REMOVE` | Same as `C01` | — | Absorbed into `APP6-B10` / `B11` |
| `APP6-B02` — Customer review backend | `SPLIT` | Mixes a read (no consent, no step-up) with the phase's most critical write (GRD-002/003/007/008 + snapshot + idempotency + `TR-LC11-09`). One human review cannot cover both well | `APP6-B09` | → `APP6-B10` (secure review read + effective agreement set, 1 op), `APP6-B11` (approve + request revision, 2 ops) |
| `APP6-S01` — Secure design review screen | `KEEP` + `REORDER` | Correct as one screen | `APP6-D01`, `APP6-B10`, `APP6-B11` | Becomes `APP6-S02` in the revised order |
| `APP6-C03` — Quotation draft/version contract | `REMOVE` | Same as `C01` | — | Absorbed into `APP6-B01` / `B02` |
| `APP6-B03` — Quotation backend | `SPLIT` + `REORDER` | *"exact money, version history, immutable sent facts and request/design eligibility"* is four endpoints across drafting, reading and the send transaction — and all of it must precede every design checkpoint | `APP6-G01` | → `APP6-B01` (create + add version, 2 ops), `APP6-B02` (history + version detail, 2 ops), `APP6-B03` (send, 1 op) |
| `APP6-A02` — Admin quotation editor/history | `KEEP` + `REORDER` | Correct as one screen | `APP6-D01`, `APP6-B01`…`B03` | Becomes `APP6-A01`; scope unchanged |
| `APP6-C04` — Quotation delivery/response contract | `REMOVE` | Same as `C01` | — | Absorbed into `APP6-B03` / `B04` / `B05` |
| `APP6-B04` — Quotation send/response backend | `SPLIT` (+ partial `DEFER`) | *"expiry, secure grants, acceptance guard, immutable accepted quotation and notifications"* mixes an Admin transaction, a customer read and two customer consent writes across two bounded contexts | `APP6-B02` | → `APP6-B03` (Admin send), `APP6-B04` (customer read), `APP6-B05` (accept + reject). The `TR-LC12-05` expiry **sweep** is deferred: it is `SE-015` scheduled worker work, and APP6 proves accept-on-expired fails in transaction (CC-06) without owning a sweep |
| `APP6-S02` — Secure quotation screen | `KEEP` + `REORDER` | Correct as one screen | `APP6-D01`, `APP6-B04`, `APP6-B05` | Becomes `APP6-S01`; scope unchanged |
| `APP6-E01` — Review-to-quote E2E | `REDEFINE` | The stated journey runs design-first, which `GRD-005` and `TR-LC08-01` make impossible. The journey is right; its order is wrong | all preceding | Quote → accept → digitize → version → review → approve, on the catalog **and** COP branches, plus the immutability and stale-version negatives |
| `APP6-X01` — Phase closure | `KEEP` | Unchanged | `APP6-E01` | Close R3; hand the accepted quotation and the approval snapshot to APP7 |

No `MERGE` was applied: no two candidates proved to be one small inseparable
capability, and merging purely to reduce the count is explicitly not a reason.

The original §6 list is preserved as history in the phase document.

---

## 7. Added checkpoints

Four, each with repository evidence.

| New checkpoint | Purpose | Dependency | Bounded scope | Why it cannot be absorbed safely | Affected layer | Acceptance focus |
|---|---|---|---|---|---|---|
| `APP6-G01` | Design review, approval and quotation authority | — | The COP design-context ADR; the APP6-owned LC-11 subset and the projected-vs-commanded rule (§5.4); the `design.approve` / `quotation.accept` idempotency bindings; the required agreement type set, quotation validity duration and deposit percent as a policy dataset; the SE-004/SE-005 event mapping; the client-side-render / no-preview-derivative ruling | These are cross-context rules spanning DSN, QUO, ORD, CNT and PLT with **no database enforcement**. Burying them in a backend slice hides the phase's load-bearing rules and leaves later checkpoints re-deriving the transition subset independently. Precedent: `APP5-G01`, `APP4-G01`, `APP3-G01…G07` | Docs + seed data | Every value traceable to a named ADR or specification; nothing invented |
| `APP6-DB01` | Forward migration for the COP design context | `APP6-G01` | Nullable placement + `customer_owned_product_id` + one exactly-one-branch `CHECK`, on `design_versions` and `approval_snapshots` | `08-DATABASE-CHANGE-CONTROL` requires a dedicated database-change checkpoint, and the change is physically impossible to defer past the first COP design version | `packages/database` | A COP request reaches a design version and an approval snapshot with no fabricated catalog row; the catalog branch is unchanged |
| `APP6-D01` | One complete APP6 Figma package | `APP6-G01` | Admin quotation workbench, Admin design-case workbench, customer secure quotation, customer secure review, plus expired/revoked/stale, loading, error, empty and responsive states | `FIGMA_DESIGN_INDEX.md` carries **zero** `APP_06` references, so every UI checkpoint would otherwise block on a missing registry entry. Design is delivered as one phase package and is never split into coding checkpoints | Figma + registry | Exact node IDs registered; Product Owner approval before any UI checkpoint |
| `APP6-B06` | Digitizing transition | `APP6-B05` | `TR-LC11-07` under `GRD-005`, added to the APP5-B05 application-layer target allow-list | The only admin-commanded APP6 transition, and the exact seam where an unguarded widening would let an operator force `DIGITIZING` without an accepted quotation — the failure ADR-DB3-001 exists to prevent | `apps/api` order module | **0 new HTTP operations**; `GRD-005` rejects a request that is not `QUOTE_ACCEPTED`; the four `system` targets stay unreachable by command |

`APP6-B07` (submitted-design read) is counted above as part of the `APP6-B01`
split rather than as an addition, but it carries its own justification: it is
the authorised Admin read that gives digitizing a source document, and it is the
resolution of `FU-APP5-B04-DESIGN-PREVIEW-01` (§8).

No speculative checkpoint was created.

---

## 8. Follow-up routing

Every open APP5 follow-up from
[`../reports/APP5-CLOSURE-MATRIX.md`](../reports/APP5-CLOSURE-MATRIX.md) and
`APP5-X01` §5, plus the earlier debts the brief names.

| Follow-up | APP6 disposition | Reasoning |
|---|---|---|
| `FU-APP5-B04-DESIGN-PREVIEW-01` | **`ACTIVATE_IN_APP6`** → owner `APP6-B07` | The gap is that no authorised read exposes the submitted Design Session's document to an operator. APP6 must solve exactly that anyway: `TR-LC08-01` creates the first design version *from what the customer designed*, so digitizing has no source without it. `APP6-B07` publishes an Admin-guarded, request-bound read of the submitted session document. No session secret is fabricated, no APP3 private preview is called through a fake customer context, and `submitted_session_id` stays provenance rather than authorization. Missing or purged session data renders as absent, never as an error |
| `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` | `KEEP_ROUTED_LATER` | 19 nullable strings publish as `type: object`. APP6 adds new operations rather than modifying the APP5 surface that carries the debt, so it cannot be resolved narrowly here, and sweeping it would turn APP6 into contract cleanup. **`APP6-G01` does bind the forward rule**: every new APP6 nullable-string property is declared `@ApiProperty({ type: String, nullable: true })`, so APP6 adds none of it |
| Customer-initiated cancellation (deferred from APP5, stage `S1`) | `KEEP_ROUTED_LATER` → APP9 | ADR-DB3-002 puts `S2` (quotation sent, not accepted) and `S3` (accepted, before approval) inside APP6's lifecycle window, and neither involves money. But every stage runs through the **LC-21 compensation saga**, which no phase has built, and `S3` conditionally releases an inventory soft hold (APP8). `APP9-C03` / `APP9-B04` already own the cancellation contract and backend. Building the saga inside a design and quotation phase would import the whole stage matrix. APP6 adds no cancellation control to a design or quotation screen |
| `FU-APP5-S01-STUDIO-ENTRY-01` | `KEEP_ROUTED_LATER` → APP3 maintenance | An APP3 Studio control needing an approved APP3 frame. Untouched by APP6 |
| `FU-APP5-S02-CONFIRMATION-SUMMARY-01` | `KEEP_ROUTED_LATER` | An unauthenticated confirmation panel cannot return request data; APP6 changes nothing about that surface |
| `FU-APP5-S02-MASKED-CONTACT-01` | `KEEP_ROUTED_LATER` | A B03 decision on the APP5 status read |
| `FU-APP5-A01-FILTER-SET-CONFIRM-01` | `MAINTENANCE_OUTSIDE_APP6` | Needs live Figma access against `662:3`; an APP5 registry confirmation |
| `FU-APP5-A01-QUEUE-COUNT-01` | `KEEP_ROUTED_LATER` | An APP5 queue field or a design amendment; the APP6 screens are new routes |
| `FU-APP5-E01-STUDIO-RANDOMUUID-01` | `KEEP_ROUTED_LATER` → APP3 maintenance | `use-studio-image.ts` is an APP3 file. **Not an APP6 blocker**: `APP6-E01` drives Admin and grant-scoped customer screens and reaches the Studio only if a journey opens it. Should it, the `*.localhost` trustworthy-origin harness delivered by `APP5-E01` already works — a narrow, proven path exists, so the blocker test fails |
| `FU-APP5-E01-HOST-COOKIE-DEV-01` | `KEEP_ROUTED_LATER` → dev-environment maintenance | Same reasoning. Production is unaffected (`Secure` is required and set there), and `APP5-E01` ran on a trustworthy origin |
| `FU-APP5-B01-APP3-SURFACE-GATE-01` | `CLOSED_BY_EXISTING_CAPABILITY` | Already `CLOSED_BY_ROUTING / HISTORICAL_GATE_NOT_CURRENT` at `APP5-X01` §6 |
| The 44 `HISTORICAL_SCOPED` APP3 gates | `MAINTENANCE_OUTSIDE_APP6` | Their frozen global-artifact assertions (37/42/84 paths·operations·schemas, 34 migrations) fail by construction on the current tree. **APP6 does not sweep them.** Only a historical scoped checker whose own authoritative inputs a specific APP6 change touches becomes relevant, decided at that checkpoint |
| External notification provider selection | `KEEP_ROUTED_LATER` | No accepted authority moved ownership. The provider-neutral recording adapter is sufficient workflow evidence |

---

## 9. Design gate

```text
DESIGN_REQUIRED_BEFORE_UI_ONLY
```

`docs/design/FIGMA_DESIGN_INDEX.md` carries `APP_01` 27, `APP_02` 32, `APP_03`
76, `APP_04` 54 and `APP_05` 70 references — and **zero for APP6**. A package is
therefore required. It gates UI only, not contracts: this repository derives
OpenAPI from backend decorators (§6), and APP3, APP4 and APP5 all shipped
backend checkpoints ahead of, or independent of, their design packages.

Surfaces the package must cover:

```text
Admin quotation workbench      draft breakdown, adjustment, totals, validity,
                               version history, send
Admin design-case workbench    submitted-design evidence, version list, create version,
                               send for review, review outcome history
Customer secure quotation      breakdown, validity, accept, reject, stale, expired, revoked
Customer secure design review  exact-version preview + watermark, effective agreement set,
                               approve, request revision, stale, expired, revoked
Cross-cutting                  loading, error, empty, responsive
```

Patterns to reuse rather than redraw: the APP5-A02 Admin detail shell and its
action matrix; the APP4-S02 / APP5-S02 secure landing and its uniform
unavailable state; the APP3-S09 runtime watermark.

Position: `APP6-D01`, after `APP6-G01`, gating `APP6-A01`, `APP6-A02`,
`APP6-S01` and `APP6-S02`.

R00 performed **no Figma mutation**.

---

## 10. Database and schema audit

```text
current migrations   35
latest               0035_add_app5_intake_provenance
```

APP6-relevant tables, all already present: `design_cases`, `design_versions`,
`design_version_assets`, `design_reviews`, `approval_snapshots`,
`approval_snapshot_thread_colors`, `approval_snapshot_agreement_acceptances`,
`quotations`, `quotation_versions`, `quotation_line_items`,
`quotation_acceptances`, `agreements`, `agreement_versions`,
`policy_configurations`, `policy_configuration_versions`, `outbox_events`,
`idempotency_records`, `audit_events`, `secure_access_grants`.

APP6-relevant repository ports, all already composed:
`DESIGN_CASE_REPOSITORY`, `APPROVAL_SNAPSHOT_REPOSITORY`,
`QUOTATION_REPOSITORY` and `AgreementRepository`, alongside APP4's
grant/verification services and APP0's audit, idempotency and outbox
infrastructure.

Missing persistence capability: **one** — the COP design context (§4).

```text
APP6_SCHEMA_DISPOSITION = MIGRATION_REQUIRED
```

| Violated invariant / required capability | Current physical cause | Minimal forward direction | Authority required before migration | Blocked downstream |
|---|---|---|---|---|
| A COP request must reach a formal design version and an approval snapshot without becoming a catalog SKU (INV-13) | `design_versions` and `approval_snapshots` each declare `product_id`, `product_variant_id`, `product_side_id` and `embroidery_area_id` `NOT NULL` with `restrict` FKs into Catalog | The delivered `order_items` shape: nullable placement + nullable `customer_owned_product_id` + one exactly-one-branch `CHECK` per table | `APP6-G01` — the geometry bound for a COP design, the `product_name` / `side_name` / `area_name` representation, and the freeze source for COP dimensions (§4.5) | `APP6-B08`, `APP6-B09`, `APP6-B10`, `APP6-B11`, and `APP6-E01`'s COP branch |

R00 wrote no SQL and edited no existing migration.

---

## 11. Security and privacy

Properties APP6 must preserve, and the checkpoint that must prove each:

| Property | Proof owner |
|---|---|
| Private originals never become public | `APP6-B07`, `APP6-B10` |
| No generic asset-by-id access | `APP6-B07`, `APP6-B10` |
| No storage key, bucket or provider endpoint leakage | `APP6-B07`, `APP6-B10` |
| Review access scoped to the exact customer / request / design context | `APP6-B10` |
| Approval acts on the exact version and hash (GRD-007) | `APP6-B11` |
| Quotation access scoped to the exact customer / request / quotation | `APP6-B04` |
| Secure token never in a query string, path, browser history or server log | `APP6-B04`, `APP6-B10` — POST with the token in the body, the APP5-B03 pattern |
| Fragment stripping preserved | `APP6-S01`, `APP6-S02` |
| Non-enumerating uniform response for invalid / expired / revoked / wrong target | `APP6-B04`, `APP6-B05`, `APP6-B10`, `APP6-B11` |
| Admin actor server-derived | `APP6-B01`…`B03`, `APP6-B06`…`B09` |
| Customer actor derived from the grant, never from the client | `APP6-B04`, `APP6-B05`, `APP6-B10`, `APP6-B11` |
| No client-supplied `customerId` or `adminId` as authority | every backend checkpoint |
| Watermark and no-export policy on the customer review preview | `APP6-G01` (rule), `APP6-S02` (surface) |

R00 executed no security regression.

---

## 12. Concurrency and idempotency map

| Scenario | Database arbiter | Application guard | Idempotency namespace / key source | Proof owner |
|---|---|---|---|---|
| CC-03 simultaneous send-for-review | `uq_design_versions__case__sent_for_review` partial unique | GRD-004; constraint failure → `REVIEW_ALREADY_ACTIVE` | — | `APP6-B09` |
| Send while another review is active | the same partial unique | GRD-004 | — | `APP6-B09` |
| CC-04 approval vs revision request | version row lock, first decision wins | loser → `INVALID_TRANSITION` with the recorded first decision | `design.approve` / *(design version)* | `APP6-B11` |
| CC-02 approval vs superseding version creation | version row lock + in-transaction state check | GRD-007 → `APPROVAL_VERSION_MISMATCH` | `design.approve` | `APP6-B11` |
| Duplicate approval | idempotency claim | replay returns the snapshot | `design.approve`, fingerprint *version id + document hash + terms version* | `APP6-B11` |
| Concurrent quotation version creation | `uq` on (quotation, version) | in transaction | — | `APP6-B01` |
| CC-05 accept an old version while a new one is sent | version row + in-transaction state check | GRD-006 → `QUOTE_VERSION_STALE` | `quotation.accept` / *(quotation version)* | `APP6-B05` |
| CC-06 quotation expiry vs acceptance | version row lock; committed-first wins | accept-after-expire fails | `quotation.accept` | `APP6-B05` |
| Duplicate quotation acceptance | idempotency claim | replay returns the acceptance evidence | `quotation.accept`, fingerprint *version id + accepted total* | `APP6-B05` |
| CC-16 in-flight grant revoke | grant status re-read **inside** the action transaction | revocation committed first wins | — | `APP6-B05`, `APP6-B11` |
| Request-state races caused by design or quotation events | the request row is contended inside the owning transaction | the projection lives in that transaction, never in a second call | — | `APP6-B03`, `APP6-B05`, `APP6-B09`, `APP6-B11` |

R00 ran none of these race tests.

---

## 13. Risks and unresolved decisions

| # | Risk | Impact | Handling |
|---|---|---|---|
| 1 | COP design context (§4) | COP digitizing, review and approval are unrepresentable | `BLOCKED_FUTURE_CHECKPOINT` → `APP6-G01` + `APP6-DB01`, placed ahead of every dependent slice |
| 2 | No published agreement content and no locked required-type set, while `GRD-008` is a hard approval guard | Approval either cannot run, or records consent to terms the customer never saw | `APP6-G01` ships the type set and content as a dataset on the delivered `PublishApp4PolicyUseCase` precedent; `APP6-B10` returns the effective set alongside the version |
| 3 | No server-side design→raster pipeline, and `preview_derivative_id` stays NULL | The customer review screen must render from the document itself | `APP6-G01` rules for the delivered APP3 SVG renderer plus the `APP3-S09` watermark. Reversible: a derivative can be added later without remodelling |
| 4 | `custom_requests.submitted_session_id` has no FK, and a submitted session is protected only by a sweep predicate | Digitizing could find no source document | `APP6-B07` treats absence as an empty state, never an error; `APP6-E01` covers the catalog branch end to end |
| 5 | `design_sessions.product_variant_id` is nullable while `design_versions.product_variant_id` is `NOT NULL` on the catalog branch | A catalog request submitted without a variant could not produce a version | Low: APP5-S01 requires an explicit variant and APP5-B07 publishes no default, and `APP5-E01-03` proved the chosen variant persists. `APP6-B08` must still fail loudly rather than substitute one |
| 6 | The `TR-LC12-05` quotation expiry sweep is `SE-015` scheduled work with no owner in APP6 | A sent quotation never flips to `EXPIRED` in the background | Deferred deliberately. `GRD-006` rejects acceptance of a past-`valid_until` version **in transaction**, so correctness never depends on the sweep; only the displayed status lags |

```text
TRUE_PO_DECISION = none
```

Every question above resolves against a named ADR, specification, delivered
schema or delivered code. Risks 1 and 2 are authority *work* for `APP6-G01`, not
choices only the Product Owner can make.

---

## 14. Validation ledger

| Command / check | Audit question | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain` | Baseline | `production` @ `3d4c74e`; one unrelated deleted PDF | 0 | Direct repository state |
| `git merge-base --is-ancestor 4da8947 HEAD` | Is the APP5 closure commit reachable? | yes | 0 | Definitive |
| `git log --oneline -20` | Any post-closure change to an APP6-relevant artifact? | Only the two APP5 closure documentation commits | 0 | Definitive |
| `node -e` count + SHA-256 over `packages/contracts/openapi/openapi.generated.json` | Current API surface and its hash | 58 / 63 / 132, `ef5dc35…` | 0 | Reads the committed artifact. **No generation was run** |
| `node -e` path/method enumeration of the same artifact | Does any design-case, design-version, approval or quotation operation exist? | **Zero.** APP6 is greenfield at the HTTP layer | 0 | Same artifact, already in hand |
| `ls packages/database/migrations/*.sql \| wc -l` | Migration count and latest | 35, `0035_add_app5_intake_provenance` | 0 | Reads the committed directory |
| Source read of `design-versions.ts`, `approval-snapshots.ts`, `custom-requests.ts`, `customer-owned-products.ts`, `order-items.ts`, `production-specifications.ts` | Is the COP contradiction still present, and how far does it reach? | Present on two tables; `order_items` already carries the fix pattern; `production_specifications` unaffected | 0 | Schema source is the authority on nullability |
| Source read of the three APP6 repository ports | What is delivered versus absent? | Full persistence, zero application and HTTP | 0 | The ports are the contract |
| `find` / `grep` over `apps/api/src/modules/{design,quotation,order,customer,notification,content}` and `apps/api/src/platform/policy` | Which application capabilities exist? | §5 | 0 | Directory truth |
| Read of `ADR-DB3-001`, `ADR-DB3-002`, `ADR-DB3-004`, `DB3_LIFECYCLE_SPECIFICATIONS.md` (LC-07/08/11/12), `DB3_TRANSITION_GUARD_CATALOG.md`, `DB3_CONCURRENCY_SPECIFICATION.md`, `DB3_IDEMPOTENCY_SPECIFICATION.md`, `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`, `DB3_AGREEMENT_ACCEPTANCE_SPEC.md` | Ordering, guards, actors, races, namespaces, side effects | §3, §5.4, §12 | 0 | Locked authority |
| `grep -oE "APP_0[0-9]+" docs/design/FIGMA_DESIGN_INDEX.md \| sort \| uniq -c` | APP6 Figma coverage | Zero `APP_06` references | 0 | The registry is canonical |
| Read of `APP5-X01-COMPLETION-REPORT.md`, `APP5_PHASE_ENTRY_AUDIT.md`, `APP5-A02-COMPLETION-REPORT.md` §E | Closure verdict and the follow-up set | §8 | 0 | Accepted evidence |

**No broad regression was run.** No test suite, no build, no typecheck, no
OpenAPI or generated-client generation, no SonarQube, no benchmark, no E2E, no
APP3 historical gate and no repository-wide aggregate. No successful command was
rerun on unchanged inputs. R00 changed documentation only, and no documentation
checker governs the three files it touched.
