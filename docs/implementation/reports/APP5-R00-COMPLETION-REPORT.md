# APP5-R00 — Phase Entry Audit & Roadmap Reconciliation · Completion report

## 1. Verdict

```text
APP5-R00 = COMPLETE
```

Documentation only. No runtime code, schema, migration, API contract, generated
artifact or Figma node was changed, and no APP5 checkpoint was started.

Full audit: [`../audits/APP5_PHASE_ENTRY_AUDIT.md`](../audits/APP5_PHASE_ENTRY_AUDIT.md).

## 2. Repository baseline

```text
branch                = production
HEAD at entry         = 2f8f250  docs(app4): record phase closure evidence
working tree at entry = clean
APP4                  = COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW (closed at APP4-X01)
APP5 at entry         = NOT_STARTED
```

Frozen APP4 baselines re-measured, not regenerated, and matching exactly:
OpenAPI **48 paths / 53 operations / 101 schemas**; DB **34 migrations**, latest
`0034` APP3-owned; **48 APP4 Figma rows**. No user changes were present or
touched.

APP2/APP3 authority inspected: `APP3-CLOSURE-MATRIX.md` (records
`request submission = APP5`), APP3 design-session persistence and public
controllers, APP2 catalog/asset schema and public reads.

## 3. Authority inspected

- **Phase/closure:** APP5 phase plan; `APP4-X01-COMPLETION-REPORT.md` (§Q handoff);
  `APP4-CLOSURE-MATRIX.md` §10; `APP3-CLOSURE-MATRIX.md`;
  `10-MASTER-APPLICATION-ROADMAP.md` §6; governance docs `01`–`08`.
- **Database/domain:** `DB3_LIFECYCLE_SPECIFICATIONS.md` §LC-11;
  `DB4_TABLE_CATALOG.md` TBL-037…042; `DB2_AGGREGATE_CATALOG.md` AGG-13;
  `packages/database/src/schema/{ordering,design,platform}/*`; migrations `0000`–`0034`.
- **Backend/API:** `apps/api/src/modules/order/**`, `customer/**`,
  `design/presentation/*.controller.ts`;
  `packages/persistence/src/platform/idempotency-*.ts`;
  `packages/contracts/openapi/openapi.generated.json`.
- **Frontend:** storefront routes/features (7 + 7), admin routes (12).
- **Design (read-only):** `docs/design/FIGMA_DESIGN_INDEX.md` §4, §5, §10.
- **Event/audit/notification:** APP4 notification module + worker;
  `custom_request_transitions`; `request_moderation_notes`; `audit_events`;
  `idempotency_records` (LC-23).

## 4. Dependency audit

| Dependency | Status | Capability APP5 needs | Evidence / location | APP5 implication |
| --- | --- | --- | --- | --- |
| APP2 catalog/assets | `SATISFIED` | Product/variant subject references; asset storage | Public catalog controllers; `custom_requests` FKs → `products`/`product_variants`; `assets` | Reuse as-is; no APP2 change |
| APP3 design sessions | `SATISFIED_WITH_INTEGRATION_WORK` | `ACTIVE` → `SUBMITTED` with request provenance | `drizzle-design-session.repository.ts:299` `submit()` exists + tested; **no HTTP publishes it** | APP5 calls it inside its own transaction; no new session endpoint |
| APP4 customer/contact | `SATISFIED_WITH_INTEGRATION_WORK` | Verified customer, `REQUEST_ACCESS` grant, notification | `ResolveOrCreateVerifiedCustomer`; `SecureGrantIssuer.issue({customRequestId})`; notification intake/outbox/worker | APP5 supplies the `customRequestId` the issuer already requires; owns `FU-APP4-S01-SUCCESS-HANDOFF-01` |

No `BLOCKING_GAP`. Constraint carried in: **no customer account session exists** —
customer authorization is per-request grant only.

## 5. Existing-capability inventory

Full table in the audit §4. Summary:

- **Present and directly reusable:** the entire AGG-13 persistence layer
  (`custom_requests`, `customer_owned_products`,
  `custom_request_quantity_breakdowns`, `custom_request_assets`,
  `request_moderation_notes`, `custom_request_transitions`); the LC-11 legal-
  transition table `apps/api/.../order/domain/lifecycle/request-transitions.ts`;
  `CustomRequestRepository` with `submit` / `replaceBreakdown` / `attachAsset` /
  `appendModerationNote` / `transition` / `setCurrentQuotation` plus its Drizzle
  adapter and integration specs; idempotency infrastructure (LC-23 table +
  `IdempotencyStore` / `IdempotencyAllocationStore`); APP4 customer resolution,
  grant issuance and notification pipeline; design-case header schema and port;
  design-session `submit()`.
- **Absent entirely:** every APP5 HTTP endpoint, every APP5 application service,
  every APP5 frontend route/feature, every APP5 Figma registry row.

A path grep of the committed OpenAPI artifact returns **zero** matches for
`request`, `owned` or `order`.

## 6. Gap map

| APP5 capability | Already exists | Missing | Owner / bounded context | Consequence for roadmap |
| --- | --- | --- | --- | --- |
| Customer-owned product | Table, constraint, port field | Nothing to build standalone | CTX-ORD / AGG-13 | Standalone C01/B01/S01 removed; COP folds into submission + one form section |
| Request draft | — | **Unrepresentable** (no pre-`NEW` state, `customer_id NOT NULL`) | CTX-ORD | C02/B02 removed; draft continuity is the APP3 session |
| Request submission | Repository `submit()`, idempotency infra, grant issuer, notification intake, session `submit()` | Application service + 1 endpoint composing them into the TR-LC11-01 W1 transaction | CTX-ORD orchestrating CUS/DSN/NTF | `APP5-B01` — the phase spine |
| Request attachments | Table + roles incl. `COP_IMAGE` | **Customer upload path for the COP branch** (only session-scoped upload exists; COP has no session) | CTX-ORD + asset intake | New `APP5-B02`; abuse policy locked at `APP5-G01` |
| Quantity breakdown | Table + port field | Intake capture; absent from all original checkpoints | CTX-ORD | Added to `APP5-B01` and `APP5-S01` |
| Customer status view | Grant + secure-link resolution (APP4) | Grant-scoped read endpoint + screen | CTX-ORD + CTX-CUS | `APP5-B03`/`S02`; a request **list** is out of reach without a customer session |
| Admin queue/detail | Index `ix_custom_requests__status_created_id`; repository reads | Query services + 2 endpoints + screens | CTX-ORD | `APP5-B04` / `A01` |
| Moderation notes & transitions | Append-only table; transition audit table; LC-11 legality guard | Guarded services + 2 endpoints + screen; **APP5 transition subset** | CTX-ORD | `APP5-B05` / `A02` |
| Duplicate-submit protection | `idempotency_records` + stores, proven in asset intake | `request.submit` namespace claim + CC-18 handling | CTX-PLT → CTX-ORD | Locked at `APP5-G01`, implemented at `APP5-B01` |
| Audit/event vocabulary | Transitions with actor kind, `grant_id`, `correlation_id`; `audit_events` | Nothing new | CTX-ORD | No new event vocabulary — R00 invented none |
| Design authority | — | All APP5 flows | Design | `APP5-D01` before any UI |
| Schema | TBL-037…042 all present | Nothing identified | CTX-ORD | `NO_APP5_MIGRATION` expected |

## 7. Original checkpoint reconciliation

All fifteen dispositioned; none omitted. Full table with reasons in audit §6.

| Original checkpoint | Action |
| --- | --- |
| `C01` Customer-owned product contract | `REMOVE` |
| `B01` Customer-owned product backend | `MERGE` → new `B01` submission |
| `S01` Customer-owned product UI | `MERGE` → new `S01` |
| `C02` Request draft contract | `REMOVE` |
| `B02` Request draft backend | `REMOVE` |
| `S02` Request creation screen | `REDEFINE` (+ `REORDER`) → new `S01` |
| `S03` Request confirmation/status | `REDEFINE` → new `S02` |
| `C03` Submission/transition contract | `REMOVE` (authority → `G01`) |
| `B03` Request submission backend | `KEEP` → renumbered `B01` |
| `C04` Admin operations contract | `REMOVE` (authority → `G01`) |
| `B04` Admin operations backend | `SPLIT` → `B04` + `B05` |
| `A01` Admin request queue | `KEEP` (reordered) |
| `A02` Admin request detail/moderation | `KEEP` (reordered) |
| `E01` Request E2E | `KEEP` |
| `X01` Phase closure | `KEEP` |

Three findings drove most of it: **there is no draft state**, **the COP is a
request-bound child with no lifecycle**, and **no customer session exists**.

## 8. Missing checkpoints discovered

Two, both evidence-backed:

1. **`APP5-G01` — Submission, moderation and intake-abuse authority.** The
   catalog-XOR-COP subject rule is explicitly assigned to TX/App by DB4 because
   *no same-row CHECK can see it*; the APP5 transition subset (six of LC-11's
   eleven) has no database expression; the `request.submit` idempotency contract
   and the unauthenticated-upload abuse policy must be settled before code.
   Precedent: `APP4-G01`, `APP3-G01…G07`.
2. **`APP5-B02` — Customer request attachment intake.** The COP branch cannot
   have a design session (`design_sessions.product_id` is `NOT NULL`), so the
   only existing customer upload path is unavailable to it. Without this the COP
   journey cannot be delivered.

`APP5-D01` is also new to the roadmap, though anticipated by the phase plan's §3
design policy.

## 9. Design-gate decision

```text
DESIGN_REQUIRED_BEFORE_UI_ONLY
```

`FIGMA_DESIGN_INDEX.md` carries **zero APP5 rows** — the §4 registry ends at
`4.10 APP4-D01` and the §10 summary enumerates APP1–APP4 and BRD0 only. The
UI01–UI05 and `FIG-WF-*` nodes (including the UI04 commission flow) are
`REFERENCE_ONLY`, which §5 states *"inform, but do not authorize,
implementation"*. Backend slices need no design authority, so design gates
`S01`, `S02`, `A01`, `A02` and nothing earlier. `APP5-D01` sits at order 2 so its
lead time overlaps backend work; its required coverage is listed in audit §8.

**No design work was performed. No Figma file was opened, read live or mutated.**

## 10. Contract-gate decisions (C01–C04)

All four **removed** as separate checkpoints:

- `06-OPENAPI-AND-CLIENT-CONTRACT.md` fixes the direction NestJS/Zod → generated
  OpenAPI → Orval client, so a contract checkpoint preceding the backend has
  nothing executable to produce.
- APP4 tried this exact structure and replaced it during execution — its phase
  doc records *"Backend split `APP4-C01…C04` → `APP4-B02…B08`"*.
- The domain contract already exists as locked authority: LC-11, TBL-037…042 and
  the `CustomRequestRepository` port types.

What a contract checkpoint would legitimately have locked — cross-context
invariants with no database enforcement — is preserved as `APP5-G01`.

## 11. Revised authoritative APP5 roadmap

| Order | Checkpoint | Purpose | Depends on | Main affected area | Acceptance focus |
| ---: | --- | --- | --- | --- | --- |
| 1 | `APP5-G01` Submission & moderation authority | Transition subset, subject XOR rule, `request.submit` idempotency, code format, asset-role + upload-abuse policy, notification mapping | APP4 closure | Docs + policy data | Every rule traced to LC-11/DB4/GRD; none invented |
| 2 | `APP5-D01` Design package | Request creation (catalog + COP), attachments, confirmation, grant-scoped status, Admin queue, Admin detail/moderation | `G01` | Figma + design index | Registry rows with exact node IDs; PO approval before any UI |
| 3 | `APP5-B01` Request submission backend | TR-LC11-01 W1 transaction + `request.submit` idempotency + SE-003 | `G01` | `apps/api` order | **1 endpoint** `POST /api/public/custom-requests`; retry does not duplicate |
| 4 | `APP5-B02` Customer attachment intake | `COP_IMAGE`/`REFERENCE` upload, bound at submission | `G01`, `B01` | `apps/api` asset/order | **≤2 endpoints**; quota/type/scan enforced |
| 5 | `APP5-B03` Grant-scoped status read | One request via its `REQUEST_ACCESS` grant | `B01` | `apps/api` order + APP4 grant | **1 endpoint**; wrong/expired/revoked grant reveals nothing |
| 6 | `APP5-B04` Admin queue & detail | Filtered queue + full detail | `G01`, `B01` | `apps/api` order | **2 endpoints**; staff-guarded |
| 7 | `APP5-B05` Admin notes & transitions | Append-only notes; guarded transitions | `G01`, `B04` | `apps/api` order | **2 endpoints**; TR-LC11-05…09 rejected; every move audited |
| 8 | `APP5-S01` Request creation & submission | Subject selection, COP form, quantity, attachments, contact, submit-once | `D01`, `B01`, `B02` | `apps/storefront` | Double-submit yields one request |
| 9 | `APP5-S02` Confirmation & status | Post-submit confirmation + grant-scoped status; closes `FU-APP4-S01-SUCCESS-HANDOFF-01` | `D01`, `B03` | `apps/storefront` | Verification success now leads somewhere |
| 10 | `APP5-A01` Admin request queue | Filters, pagination, empty/error states | `D01`, `B04` | `apps/admin` | Approved registry rows cited |
| 11 | `APP5-A02` Admin detail & moderation | Evidence, assets, notes, guarded transitions | `D01`, `B05` | `apps/admin` | Disallowed transitions not offerable |
| 12 | `APP5-E01` Cross-layer acceptance | Both subjects submitted, retry-safe, Admin triage with audit | 1–11 | Runtime | Real API + worker |
| 13 | `APP5-X01` Phase closure | Freeze baselines, disposition follow-ups, APP6 handoff | `E01` | Docs | Records the COP/design-version constraint |

8 feature endpoints across five backend slices, all within the five-endpoint cap.
`NO_APP5_MIGRATION` expected; a real gap would require its own database-change
checkpoint under `08-DATABASE-CHANGE-CONTROL.md`.

```text
NEXT CHECKPOINT: APP5-G01 — Submission, moderation and intake-abuse authority
```

Not executed by this checkpoint.

## 12. Validation / command ledger

| Command / check | Audit question | Result | Reruns | Justification |
| --- | --- | --- | --- | --- |
| `git status --short` · `git log -1` · `git branch --show-current` | Baseline | clean · `2f8f250` · `production` | 0 | Cheapest baseline |
| Targeted `grep`/`rg` over schema, API modules, app routes, closure gate | Which APP5 concepts exist, under which real names? | 6 ordering tables; `order` module with lifecycle + port + adapter; 0 APP5 routes | 0 | Read-only |
| File reads: LC-11 spec, TBL-037…042, design session/case/version schema, repository ports, idempotency store, Figma index, APP3/APP4 closure records | Establish real lifecycle, ownership and design coverage | Audit §4–§5 | 0 | Read-only; the only way to disprove the planning assumptions |
| `node -e` count over `packages/contracts/openapi/openapi.generated.json` | Exact current API surface; any APP5 path? | **48 / 53 / 101**; zero APP5 paths | 0 | Reads the committed artifact; matched the frozen APP4-X01 baseline exactly, so no generation or freshness command was needed |
| `grep` of `tools/check-app4-closure.mjs` | Does R00 invalidate the APP4 closure gate? | No — its `APP5 = NOT_STARTED` rule targets the frozen APP4 matrix, which R00 does not edit | 0 | One grep instead of running the gate |

**Broad regression was not run.** Explicitly not executed: `pnpm quality`, any
Jest suite, the integration suite, Playwright/E2E, all-workspace typecheck, any
build, DB regression, OpenAPI generation or freshness check, generated-client
regeneration, SonarQube, any APP2/APP3/APP4 suite, and
`tools/check-figma-design-index.mjs` (no registry row added, moved or edited).
R00 changed only documentation; under `VALIDATION_GOVERNANCE.md` §3 no runtime
validation is justified, and running one would produce evidence about code this
checkpoint did not touch.

## 13. Files changed

```text
A docs/implementation/audits/APP5_PHASE_ENTRY_AUDIT.md
M docs/implementation/phases/APP5-CUSTOM-REQUESTS.md
A docs/implementation/reports/APP5-R00-COMPLETION-REPORT.md
```

Documentation only. No `apps/**`, no `packages/**`, no schema or migration, no
OpenAPI artifact, no generated client, no Figma, no `package.json`, no lockfile.
Historical reports and the APP4 closure record were not rewritten; the APP5 phase
plan's original §6 is preserved and marked superseded rather than deleted.

## 14. Phase roadmap update

Written back into `phases/APP5-CUSTOM-REQUESTS.md` §10.1:

| Checkpoint | Status | Note |
|---|---|---|
| `APP5-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP5-G01` | `INCOMPLETE` | **Next** — submission, moderation and intake-abuse authority |
| `APP5-D01` | `INCOMPLETE` | One design package; gates all UI checkpoints |
| `APP5-B01` | `INCOMPLETE` | Submission transaction (TR-LC11-01); 1 endpoint |
| `APP5-B02` | `INCOMPLETE` | Customer attachment intake; ≤2 endpoints |
| `APP5-B03` | `INCOMPLETE` | Grant-scoped request status read; 1 endpoint |
| `APP5-B04` | `INCOMPLETE` | Admin queue & detail; 2 endpoints |
| `APP5-B05` | `INCOMPLETE` | Admin notes & guarded transitions; 2 endpoints |
| `APP5-S01` | `INCOMPLETE` | Request creation & submission screen |
| `APP5-S02` | `INCOMPLETE` | Confirmation & grant-scoped status |
| `APP5-A01` | `INCOMPLETE` | Admin request queue |
| `APP5-A02` | `INCOMPLETE` | Admin request detail & moderation |
| `APP5-E01` | `INCOMPLETE` | Cross-layer acceptance |
| `APP5-X01` | `INCOMPLETE` | Phase closure |

Removed checkpoints are documented in §10.1's note and audit §6, not silently
deleted. The repository's existing `COMPLETE`/`INCOMPLETE` vocabulary is
preserved; no status value was invented.

## 15. Risks and unresolved decisions

| # | Item | Disposition |
| --- | --- | --- |
| 1 | **A COP request can never hold a design version** — `design_versions` requires four catalog placement columns `NOT NULL` | Not an APP5 blocker (APP5 creates only the design-case header). Must be resolved at **APP6 entry**, likely by ADR + schema change. Recorded at `APP5-X01`. |
| 2 | Cancellation saga LC-21 does not exist; TR-LC11-11 carries GRD-020 + compensation | `APP5-G01` restricts APP5 cancellation to pre-quotation stages, where no compensation target exists |
| 3 | No customer account session | Locked: customer status is grant-scoped and single-request; a customer account is not APP5's concern |
| 4 | `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` never formally dispositioned by APP4 | Resolved in practice, but `APP5-B01` must confirm the harness supplies `DESIGN_SESSION_SECRET_PEPPER` before claiming a green suite. No credential may be rotated or written to `.env` to achieve it. |
| 5 | `docs/implementation/README.md` delivery-status blurb still names APP4 as next | Stale, not conflicting — that file defers status to `10-MASTER-APPLICATION-ROADMAP.md` §6. Left unchanged (outside R00 scope); route to a docs checkpoint or `APP5-X01`. |
| 6 | `FU-APP4-S01-SUCCESS-HANDOFF-01` is APP5-owned | Closed by `APP5-S02` |

## 16. Commits

One documentation-only commit, no unrelated changes bundled:

```text
docs(app5): reconcile phase entry audit and roadmap
```

Contents: the phase-entry audit, the updated APP5 phase plan and this report.
