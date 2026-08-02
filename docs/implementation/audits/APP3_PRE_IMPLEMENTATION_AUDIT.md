# APP3 — Pre-implementation audit (Design Templates and 2D Design Studio)

**Checkpoint:** `APP3-PRE-IMPLEMENTATION-AUDIT` · **Date:** 2026-08-02
**Entry HEAD:** `8b5f3b0279b1920babd05b52014af3b853f526c0` (branch `production`)
**Scope:** documentation only. No source, schema, Figma, manifest or lockfile change.

---

## A. Executive verdict

`PASS_WITH_REQUIRED_GATES`.

APP3 is entered from a genuinely closed APP2 and from a **much stronger**
persistence position than APP2 was: the Design Template and Design Session
aggregates are already implemented as repositories with their DB7 guards and
DB9 race proofs. The blocking problems are not schema problems. They are four
authority gaps and two empty packages:

1. **Nothing in the running system can produce a `product_sides` or an
   `embroidery_areas` row, and nothing can read one.** `design_sessions`
   requires `product_side_id` **and** `embroidery_area_id` as `NOT NULL`. The
   Studio's product background, safe area and px↔mm mapping (`05 §5`, `05 §6`)
   all live on those two tables. The tables exist and the catalog repository can
   write them, but no Admin operation authors them, no public operation returns
   them, and the delivered media route cannot serve a side background. **This is
   the single hard blocker for every other APP3 capability.**
2. The Design Template lifecycle has **no transition identifiers and no guard
   rows** — the exact shape that blocked `APP2-B03` — and the delivered
   repository silently publishes on version creation, cannot unpublish, and
   cannot unarchive.
3. The **editor-safe derivative** ADR-APP0-001 §5 mandates does not exist as a
   named kind, and `CATALOG_PREVIEW` is not it.
4. The design-session TTL is an **open business decision** (O-008) and the
   anonymous transport contract is undefined.
5. `packages/design-document` and `packages/design-engine` are `export {}`.
6. Figma carries **zero** Studio or Admin-Template authority rows.

Verdict is `PASS_WITH_REQUIRED_GATES` rather than `BLOCKED` because every one of
these is decidable from existing authority plus a Product Owner ruling, and none
requires reopening a locked decision. `NO_APP3_MIGRATION` is **not** asserted
unconditionally — see §H.

Recommended first gate: **`APP3-G01` — Product placement and side-media
authority** (§P).

---

## B. APP2 entry and repository state

Read from Git at audit time, not from prose:

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD | `8b5f3b0279b1920babd05b52014af3b853f526c0` |
| HEAD subject | `docs(app2): record phase closure evidence` |
| HEAD files | `docs/implementation/reports/APP2-X01-COMPLETION-REPORT.md` (+541, 1 file) |
| APP2-X01 evidence Commit B | `8b5f3b0…` — identical to HEAD, as required |
| APP2 closure Commit A | `bcb810f829175c22e47467474b37e9d4d5c6f628` — `docs(app2): close assets and catalog publication`, 8 files |
| Tracked/staged tree | clean (`git status --short` empty) |
| `evidences/` | untracked-ignored, one file, untouched |
| Remote | `origin/production` = HEAD; nothing new pushed by this audit |
| APP3 implementation/report | none — no `APP3-*` report, no APP3 source, no APP3 migration |

Accepted entry statuses hold: `APP2-X01 = COMPLETE — REVIEW_ACCEPTED`,
`APP2 = COMPLETE — PASS_WITH_FOLLOW_UPS — REVIEW_ACCEPTED`,
`APP3 = READY — NOT STARTED`.

### Frozen inherited baseline — verified, not copied

| Artifact | Declared | Measured this audit |
|---|---|---|
| OpenAPI paths / operations / schemas | 16 / 19 / 34 | 16 / 19 / 34 (`pnpm check:openapi` clean) |
| Generated-client tree hash | `7524fc91…8ecf5a2` | identical (`check:api-client`) |
| Migrations / tables / columns | 33 / 78 / 833 | 78 tables, 833 columns (`db:check:manifest`) |
| Figma registry IDs / node rows / tables | 86 / 86 / 11 | 86 / 86 / 11 (`check:figma-design-index`) |
| Accepted routes | `/kham-pha`, `/san-pham/[slug]` | both present; no third storefront route |

`APP3_PRE_AUDIT_PREFLIGHT = PASS` — every command in §17 of the checkpoint
prompt ran and exited 0, including `pnpm quality` and `git diff --check`.

---

## C. Canonical APP3 scope and exclusions

**Outcome.** Admin publishes compatible Design Templates. An anonymous customer
creates a watermark-protected 2D customization from published Product/Template
authority.

**In scope:** Template header/version/publication and product scope; product
side and embroidery-area authority as the Studio's placement substrate; design
session bootstrap/load/autosave/conflict/expiry/resume; canonical design
document with server-side validation; SVG stage, selection, transforms, layer
operations, text, approved assets, zoom/pan/safe area, mobile core editing;
runtime watermark; editor-safe media.

**Out of scope and prohibited** (`docs/12-DECISION-LOG.md` D-004/D-005/D-007,
`05 §1`/`§11`, ADR-APP0-001): customer export or download in any form; 3D;
stitch simulation; digitizing / production-file generation; professional vector
node editing; Canva-clone breadth.

**Must not be pulled forward:** APP4 customer identity and verification; APP5
custom-request submission; APP6 design review, versioning-for-review and
quotation; payments; orders; production. `design_sessions.submitted_request_id`
and the `design_cases` / `design_versions` / `approval_snapshots` tables belong
to APP5/APP6 and are read-only context for APP3.

**Reported contradiction (not silently resolved).** `06 §2` lists `ABANDONED`
as a design-session state and the current APP3 phase file §4 says
"create/load/update/**abandon**/expiry". DB3 LC-07 explicitly **eliminated
`ABANDONED`, merging it into `EXPIRED`**, and the implemented CHECK
(`ck_design_sessions__status_allowed`) permits exactly
`ACTIVE | SUBMITTED | EXPIRED | DELETED`. `06 §2` self-describes its list as
"suggested conceptual states"; DB3 and the schema are the later, binding
authority. APP3 uses the four canonical states and the phase text is corrected;
no `ABANDONED` transition may be implemented.

---

## D. Repository inventory

Classification vocabulary: `IMPLEMENTED` / `PARTIAL` / `SCAFFOLD` / `MISSING` /
`OUT_OF_SCOPE` / `RESEARCH_ONLY`. Spike code is never counted as production.

| Capability | Status | Evidence |
|---|---|---|
| Template aggregate + repository | **IMPLEMENTED (persistence only)** | `apps/api/src/modules/design/domain/repositories/design-template.repository.ts`, `…/infrastructure/persistence/drizzle-design-template.repository.ts`, `…/tests/integration/design-template.integration.spec.ts` |
| Template version + immutability | **IMPLEMENTED (persistence only)** | `design_template_versions` + S24 reject-mutation trigger target; `uq_design_template_versions__template_version` |
| Template document validation | **MISSING** | `design_document` is bare `jsonb`; no validator exists anywhere |
| Template/Product compatibility | **MISSING as modeled by the phase file** | schema has optional single scope (`product_id`/`product_side_id`/`embroidery_area_id` nullable FKs); no M:N table — see §G4 |
| Template publication surface | **PARTIAL** | `publishVersion` flips `status='PUBLISHED'`; no unpublish, no unarchive, unguarded `archive` — §G3 |
| Product side / embroidery-area authority | **SCHEMA ONLY** | `packages/database/src/schema/catalog/product-sides.ts`, `embroidery-areas.ts`; written/read by `drizzle-product.repository.ts`; **no API surface at all** — §G1 |
| Design Session aggregate + repository | **IMPLEMENTED (persistence only)** | `design-session.repository.ts`, `drizzle-design-session.repository.ts`; `open` / `cloneFromTemplate` / `saveDocument` / `attachAsset` / `submit` / `expire` |
| Autosave optimistic concurrency | **IMPLEMENTED + PROVEN** | `autosave_revision` compare-and-set; CC-01 `PASS` at DB9-CP0 — `design-races.integration.spec.ts` (`STALE_WRITE`, 10-iteration single-increment) |
| Placement-chain validation | **IMPLEMENTED** | `DrizzlePlacementHierarchyAdapter` (G-DB7-10..13), one query per chain |
| Design module composition | **MISSING** | `DesignModule` is **not** imported by `apps/api/src/bootstrap/app.module.ts` — the repositories are unreachable at runtime |
| Stable element IDs + canonical hashing | **SCAFFOLD** | `packages/design-document/src/index.ts` = `export {}`; authority is ADR-DB1-012 (RFC 8785 JCS + SHA-256) |
| `design-engine` geometry / px↔mm | **SCAFFOLD** | `packages/design-engine/src/index.ts` = `export {}` |
| Renderer adapter | **RESEARCH_ONLY** | `spikes/app0-r01-design-studio/src/adapters/**` (three adapters, one contract); fenced by `pnpm check:spike-boundaries` |
| Editor-safe media derivative | **MISSING** | kind set is `PREVIEW_WATERMARKED / MOCKUP / NORMALIZED / THUMBNAIL / CATALOG_PREVIEW` — none is an editor-safe customer derivative, §I |
| Customer / template asset intake | **MISSING** | intake is Admin-only and hard-locked to `INTAKE_ASSET_KIND = 'CATALOG_MEDIA'`, `PRODUCTION_SENSITIVE`, raster-only (`asset-intake.policy.ts`) |
| Worker job families | **PARTIAL** | one family, `ASSET_PROCESSING`, producing `THUMBNAIL` + `CATALOG_PREVIEW` for the catalog lane only |
| Admin Template routes/UI | **MISSING** | `apps/admin/src/app/(protected)/` = `assets`, `products` only |
| Storefront Studio route/UI | **MISSING** | `apps/storefront/src/app/` = `kham-pha`, `san-pham/[slug]`, `healthz` |
| Anonymous session identity | **PARTIAL** | `session_secret_hash` UNIQUE + `findActiveBySecretHash` exist; no transport, no issuance, no quota — §G6 |
| OpenAPI / generated client | **MISSING for APP3** | 19 operations, none design-related |
| Test harnesses | **IMPLEMENTED and reusable** | disposable-PG integration harness, `next/jest` component harness, Playwright `@embroidery/e2e-testing` with the APP2 disposable production topology |
| Performance harness | **IMPLEMENTED** | root scripts `spike:editor:test` / `spike:editor:benchmark` / `spike:editor:check`; `check` already inside `pnpm quality`, `benchmark` deliberately outside |

Infrastructure (`infrastructure/**`), styles, observability, validation,
object-storage and `e2e-testing` are inherited unchanged and need no APP3
foundation work of their own.

---

## E. APP0 rendering architecture handoff

Locked by IMP-D026 / `ADR-APP0-001` and **not reopened by this audit**: native
SVG rendered by React 19, no rendering-engine dependency, engine-neutral
document as the single source of truth, a mandatory renderer-adapter boundary,
runtime-only selection/handles/viewport/watermark, no mutable runtime object in
Zustand, geometry outside components, undo/redo as a domain concern, DOM
transform handles ≥44 px outside the element box, client-only lazily loaded
Studio behind a server-rendered shell, asset-id + approved-derivative only,
sanitized SVG, no export surface, and no browser dependency on `crypto.subtle`.

Budgets (§6 of the ADR) stand as inherited authority until APP12 replaces them:
transform frame p95 ≤20 ms desktop / ≤33 ms mobile at 50 elements; no repeated
long task >100 ms in a 2 s gesture; load-to-usable ≤500/1000 ms at 50 elements;
canonical serialize/deserialize ≤100/300 ms at 150 elements; ≤200 KB additional
gzip; no monotonic heap growth over 20 mount/destroy cycles.

Three ADR-named risks are APP3's to carry, and each is assigned an owner in the
map (§O): DOM-node growth at large scenes (regression scene at the renderer
checkpoint), **WebKit re-rasterisation on continuous viewport scale — measured
41 ms p95 versus 16.7 ms on Chromium** (owner: the zoom/pan checkpoint, which
must step zoom discretely or transform a wrapper and re-measure), and adapter-
boundary erosion (owner: the renderer checkpoint's reviewed contract).

Deferred details ADR-APP0-001 assigns to **APP3**: SVG sanitizer selection, font
loading/whitelist mechanics, snapping/guide rules, marquee multi-select, crop
UX, freehand smoothing, autosave cadence and conflict policy, and whether
`design-engine` or the Studio feature owns each geometry helper. Each is routed
to a named gate or checkpoint below; none may be invented inside an
implementation checkpoint.

---

## F. Product and actor capability classification

`REQUIRED_MVP` = must exist for the phase outcome. `LATER_APP3` = inside APP3
but after the MVP spine. `DEFERRED` = beyond APP3, needs authority.
`PROHIBITED` = locked out.

| Capability (`05 §4`–`§7`) | Class | Owner |
|---|---|---|
| Text element: add/edit, font whitelist, size, alignment, thread colour | `REQUIRED_MVP` | `APP3-S05` |
| Raster image element from an approved asset | `REQUIRED_MVP` | `APP3-S06` |
| Validated + sanitized SVG element | `LATER_APP3` — blocked on an acceptance decision (§I) | `APP3-G04` → `APP3-S06` |
| Basic shapes | `LATER_APP3` | `APP3-S12` |
| Freehand drawing (incl. smoothing) | `LATER_APP3` | `APP3-S12` |
| Selection, multi-select, reorder, group/ungroup, lock, hide, duplicate, delete | `REQUIRED_MVP` (marquee multi-select `LATER_APP3`) | `APP3-S02` / `APP3-S04` |
| Move / resize / rotate / flip / opacity | `REQUIRED_MVP` | `APP3-S03` |
| Align / distribute / snap / guides | `LATER_APP3` | `APP3-S13` |
| Zoom / pan / safe area / product background | `REQUIRED_MVP` | `APP3-S07` |
| Undo / redo | `REQUIRED_MVP` | `APP3-S08` |
| Crop | `LATER_APP3` | `APP3-S13` |
| Curved text | `LATER_APP3` | `APP3-S12` |
| Background removal (`05 §4.2`) | `DEFERRED` — needs a Product Owner ruling; ADR-APP0-001 forbids adding it without locked authority | Product Owner |
| Font whitelist + thread colours as configured data | `REQUIRED_MVP` (mechanics decided at `APP3-G02`) | `APP3-B03` |
| Physical-unit mapping and advisory warnings (`05 §6`) | `REQUIRED_MVP` for mapping; warnings `LATER_APP3` | `APP3-P02` / `APP3-S07` |
| Mobile core editing (`05 §7`) | `REQUIRED_MVP` | `APP3-S11` |
| Autosave-ready document, save-state indication, refresh survival | `REQUIRED_MVP` | `APP3-S10` |
| Repeated runtime watermark | `REQUIRED_MVP` | `APP3-S09` |
| Export / download / scene JSON / high-res URL | `PROHIBITED` | — |
| 3D, stitch simulation, digitizing, vector node editing | `PROHIBITED` | — |

### Anonymous actor — what current authority already settles

- **Identification exists at the data layer.** `design_sessions.session_secret_hash`
  is `NOT NULL UNIQUE`, and `findActiveBySecretHash` is the lookup. The raw
  secret is never stored; ADR-DB2-001 records that "the raw session id is never
  an authorization input on its own".
- **A session is not a customer.** No customer FK, no identity residue, whole
  family hard-deleted after TTL (ADR-DB1-011, ADR-DB2-001 rule 13). **Email and
  phone are therefore prohibited on a design session** — collecting them is
  APP4's verification flow, not APP3's.
- **Expiry mechanics exist; the duration does not.** `expires_at` and
  `last_activity_at` are `NOT NULL`, `IDX-085` indexes the ACTIVE sweep, and
  `expire()` is implemented. The **duration is O-008 / `DP-RET-01`, explicitly
  `DEFERRED — business`** with *no value set anywhere in the repository*.
- **Ownership transfer/merge is out of bounds.** `submitted_request_id` is
  handover evidence with no FK; the transfer itself is APP5's submission
  transaction (`TR-LC07-03`, GRD-001). APP3 stops at `ACTIVE` and must not
  implement `SUBMITTED`.
- **Missing:** the transport contract (cookie versus opaque handle), issuance and
  rotation, enumeration controls, and the `09 §7` quotas (session quota,
  concurrent-session limit, throttling). APP1's staff cookie — host-only,
  `Strict`, layered CSRF, authenticated — is **not** transferable to an
  anonymous storefront session and must not be assumed.

**A missing ownership/grant contract becomes a dedicated gate before any session
API.** That gate is `APP3-G03`.

---

## G. Proven gaps, one by one

### G1 — Placement geometry has no API surface *(hard blocker)*

`product_sides` carries `background_asset_id`, `image_width_px`,
`image_height_px`, `physical_width_mm`, `physical_height_mm`, `px_per_mm`
(all `NOT NULL`, all CHECK-guarded `> 0`). `embroidery_areas` carries the
canvas-space bounds and optional physical maxima. `DrizzleProductRepository`
inserts and reads both.

Measured absence:

- `admin-product.request.ts` contains **no** side or area field — the five
  delivered Admin Product operations cannot author placement.
- `public-product.response.ts` contains **no** side or area field — the public
  detail contract cannot expose it.
- `publicProductMedia_get` resolves `product_media` rows and the two renditions
  `thumbnail` / `catalog-preview`. A side background is an `assets` reference,
  **not** a `product_media` row, so the delivered route **cannot** serve it.

Consequence: `design_sessions` cannot be inserted (both ids `NOT NULL`), the
Studio has no product image, no safe area and no px↔mm mapping, and template
scope cannot be chosen. Classification: **schema sufficient; repository present;
application/API surface MISSING.** No migration implied.

### G2 — `DesignModule` is not composed

`apps/api/src/bootstrap/app.module.ts` imports Health, Identity, AssetIntake and
four Catalog modules. `DesignModule` is instantiated only inside integration
specs. Every design repository is therefore dead code at runtime — real,
tested, and unreachable.

### G3 — Template lifecycle: states without transitions

DB3 records the machine as `DRAFT` → `PUBLISHED` (version++ per publish) →
`ARCHIVED`, "unarchive allowed audited", clone requires `PUBLISHED` (GRD-028).
It assigns **no `TR-` identifiers and no guard-catalog rows** — unlike LC-04,
which `pnpm check:lifecycle` now enforces. The delivered repository:

| Behaviour | Delivered | Problem |
|---|---|---|
| `publishVersion` | inserts the version **and** sets `status='PUBLISHED'` in one transaction | there is no way to write a *draft* version, although `published_at` is nullable and the S24 trigger is designed to scope on `published_at IS NOT NULL`. Publication and version creation are fused. |
| unpublish (`PUBLISHED → DRAFT`) | **absent** | precisely the gap `TR-LC04-05` / IMP-D035 had to close for Products after `APP2-B03` blocked |
| unarchive (`ARCHIVED → DRAFT`) | **absent** | DB3 says it is allowed and audited |
| `archive` | unconditional update from any state | no source-state guard, no `GRD-019` legality check |

"A state being storable is not a transition being authorized" — the same finding
that produced `APP2-B03-G01`. A Template backend checkpoint must not start
before this is ruled.

### G4 — "Compatibility" has two incompatible readings

DB2 GAP-08 decided **optional scoping**: a template is global or scoped to one
`ProductId`, optionally to a side and an area, and "Catalog only *references*
suggested TemplateIds for product-page display". The schema implements exactly
that: three nullable FKs on `design_templates`, and **no join table**.

The current APP3 phase file promises "product compatibility", a "compatibility
check" operation and a "public compatible-template read". If that means
*filter published templates by scope*, it is available today with no schema
change. If it means *many-to-many compatibility*, it is a **genuine schema gap**
requiring one forward-only APP3 database checkpoint. The audit does not choose;
`APP3-G02` must.

### G5 — Document packages are empty; nothing validates a document

`packages/design-document` and `packages/design-engine` both export `{}`.
`design_template_versions.design_document` and `design_sessions.design_document`
are bare `jsonb` with an integer `document_schema_version` and **no validator on
any path**. ADR-DB1-012 already assigns canonical form, RFC 8785 JCS
serialization, SHA-256 hashing and document migrations to `design-document`;
ADR-APP0-001 §4 adds "unknown `schemaVersion` fails loudly" and number
quantization before hashing. Note that neither table carries a hash column by
design (working documents are mutable; hashing begins at the formal design
version, G11) — APP3 must not invent one.

Server-side validation is therefore a **backend** dependency as much as a Studio
one, and both packages must land before the first Template or Session write API.

### G6 — Session TTL and transport

Covered in §F. `O-008` is open **business** authority; `DP-RET-01` records
"*none set* — DEFERRED — business (O-008)". Inventing a number here would be
exactly the prohibited shortcut.

### G7 — Storefront route authority for the Studio is undecided

`pnpm check:storefront-route-authority` locks `/kham-pha` for Discover, `/` for
Homepage, and (via `check:storefront-product-detail-authority`)
`/san-pham/[slug]` for detail. No Studio path exists in any document. APP2 lost
a full checkpoint to exactly this omission (`APP2-S01` blocked, cured by
`APP2-S01-G01`/IMP-D038). The Studio route must be ruled **before** `APP3-S01`,
and the ruling should extend the existing route-authority gate rather than
create a competing one.

---

## H. Database readiness and migration classification

Per behaviour, using the required vocabulary:

| Behaviour | Classification |
|---|---|
| Template publication + version immutability | schema sufficient; **application guard missing** (§G3); S24 trigger present |
| Template/Product compatibility | schema sufficient **for scope**; **genuine schema gap only if M:N is ruled** (§G4) |
| Safe-area physical dimensions (`px_per_mm`, bounds, max mm) | schema sufficient; **query missing**, **application surface missing** (§G1) |
| Design Session lifecycle (ACTIVE/SUBMITTED/EXPIRED/DELETED) | schema sufficient; repository present; `SUBMITTED` is APP5's |
| Canonical document version / integrity hash | schema sufficient **as designed** (no hash column on working documents, by ADR-DB4 JSONB map); **document package missing** |
| Autosave optimistic concurrency | schema sufficient; repository present; **concurrency proof present** (CC-01 `PASS`, DB9-CP0) |
| Snapshot / version boundaries | `OUT_OF_SCOPE` for APP3 — `design_versions` / `approval_snapshots` are APP5/APP6 |
| Asset references and grants | `design_session_assets` and `design_template_assets` present (cascade-temp / restrict); **intake lanes missing** (§I) |
| Anonymous ownership + expiry | schema sufficient; **duration and transport missing** (§G6) |
| Audit / Outbox | infrastructure present and exercised by APP2; **APP3 event kinds undefined** — note APP2 proved kinds are app guards, not CHECKs, so new kinds imply **no migration** |

**Migration verdict:**
`NO_APP3_MIGRATION_UNLESS_G02_OR_G04_PROVES_ONE`.

Two — and only two — candidate schema gaps exist, and both are downstream of a
decision this audit is not permitted to make:

1. a template↔product compatibility relation, **if** `APP3-G02` rules many-to-many;
2. a new `asset_derivatives.kind` value for the editor-safe derivative, **if**
   `APP3-G04` rules that `NORMALIZED` cannot carry that meaning.

If either fires, it is one dedicated forward-only checkpoint (`APP3-DB01`) before
any dependent code — the shape `APP2-DB01` and `APP2-B02-G01` already proved
(data-only kind-set + CHECK change, tables and column counts unchanged). This
audit creates and modifies no migration. Engine-native JSON is never persisted
(ADR-APP0-001 §2.1).

---

## I. Asset and editor-safe media boundary

ADR-APP0-001 §5 is unambiguous: elements reference an **asset id plus an
approved derivative**; originals and high-resolution previews are never loaded
by the customer editor.

Measured state of the derivative kind set
(`ASSET_DERIVATIVE_KINDS`, `CST-126`):

| Kind | Fits the editor? |
|---|---|
| `PREVIEW_WATERMARKED` | **No.** Watermarked in the *bytes* by CHECK. ADR-APP0-001 §3 makes the watermark **runtime preview policy, regenerated on every load and never part of the document** — baking it into a customer's own uploaded artwork contradicts the locked model and would double-watermark the stage. |
| `CATALOG_PREVIEW` | **No.** CHECK-forbidden from being watermarked, and defined as store-owned *marketing* media for Admin/Storefront presentation. |
| `NORMALIZED` | **Candidate.** Explicitly the artwork-pipeline kind and explicitly "not a display preview" — which is arguably right for an editor input. Reuse requires a ruling, not an assumption. |
| `THUMBNAIL` / `MOCKUP` | No — list imagery and mockup composition. |

`CATALOG_PREVIEW` is **not** an editor preview and must not be treated as one.

Further measured gaps:

- **Intake is Admin-only and single-lane.** `INTAKE_ASSET_KIND = 'CATALOG_MEDIA'`,
  `classification = PRODUCTION_SENSITIVE`, `ACCEPTED_MEDIA_TYPES =
  image/png|jpeg|webp`. The `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` lane the
  Studio needs and the `TEMPLATE_SOURCE` lane Admin templates need have **no
  route**.
- **SVG is rejected at intake** (IMP-D028, `ADR-APP2-001` §4). That ADR states
  the rejection is "independent of APP0's native-SVG editor rendering" and that
  "accepting sanitized SVG is a future, separately-decided scope" — so this is
  an **open decision APP3 owns**, not a contradiction with a locked one. It
  pairs with ADR-APP0-001's deferred "SVG sanitizer selection — owner: APP3".
- **The worker has one job family** producing `THUMBNAIL` + `CATALOG_PREVIEW` for
  the catalog lane. An editor-safe derivative implies a second handler or a
  widened one, plus the `05 §6` resolution warning.
- **Delivery.** `publicProductMedia_get` is publication-gated on a *product*
  and keyed to `product_media`. A session-scoped customer asset is neither, so
  a separate granted-access delivery contract is required. `no-store` is the
  inherited default until an invalidation consumer exists.
- **Dimensions metadata.** `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` is routed and
  nonblocking for APP2 — but the Studio *needs* intrinsic dimensions to place an
  element, so APP3 activates it (§N).
- **Product background versus customer asset** are different lanes with
  different authorization: the background is store-owned and publication-gated;
  the customer asset is session-granted and private. Never conflate them, and
  never load a private original into the editor.

Background removal is **not** added — `05 §4.2` mentions it, ADR-APP0-001 says
do not add it without locked authority, and no locked authority requires it.

---

## J. Lifecycle and API decomposition

Canonical state names, used verbatim and never renamed:

- **Design Template** (DB3 "Additional lifecycles"): `DRAFT` → `PUBLISHED` →
  `ARCHIVED`; unarchive allowed and audited; clone requires `PUBLISHED`
  (GRD-028). Transition identifiers do **not** exist yet — `APP3-G02` assigns
  them.
- **Design Session** (LC-07): `ACTIVE` (initial) → `SUBMITTED` | `EXPIRED` →
  `DELETED`, with `TR-LC07-01..05` already specified. APP3 owns `TR-LC07-01`
  (bootstrap), `TR-LC07-02` (autosave) and `TR-LC07-04` (expiry sweep).
  `TR-LC07-03` (`→ SUBMITTED`) is **APP5's** and must not be implemented.
  `TR-LC07-05` (`EXPIRED → DELETED`) is the retention worker, already mechanised
  by DB10 with a caller-supplied cutoff.

Per-mutation record (preconditions · transaction · concurrency token ·
idempotency · audit · outbox · consequence):

| Mutation | Pre | Tx | Token | Idem | Audit | Outbox | Consequence |
|---|---|---|---|---|---|---|---|
| Template create | slug unique | one | — | client key | yes | no | draft appears in Admin list |
| Template version write (draft) | template not `ARCHIVED` | one, `FOR UPDATE` on header | `current_version` | version number | yes | no | none public |
| Template publish | a version exists; scope resolves | one, header locked | `current_version` | version number | yes | candidate | template becomes clonable |
| Template unpublish | state `PUBLISHED` | one | header `updated_at` | natural | yes | candidate | clone attempts fail `TEMPLATE_NOT_AVAILABLE` |
| Template archive | ruled source states only | one | header `updated_at` | natural | yes | candidate | removed from public listing |
| Template unarchive | state `ARCHIVED` | one | header `updated_at` | natural | **yes (DB3 requires audited)** | candidate | back to `DRAFT` |
| Session bootstrap (blank) | placement chain valid (G-DB7-13); quota | one | — | session secret | no (LC-07: low) | no | Studio loads |
| Session bootstrap (clone) | + template `PUBLISHED` at this instant (G-DB7-18) | one | — | session secret | no | no | document copied, `(template, version)` stamped |
| Session autosave | `ACTIVE`, unexpired (G-DB7-19) | one | **`autosave_revision` CAS** | autosave seq | no | no | `STALE_WRITE` on mismatch |
| Session expire (sweep) | TTL passed | one | — | natural | no | no | session unusable |

**Endpoint matrix.** Backend checkpoints are 1–3 related operations and never
more than 5. Paths are provisional; CRUD completeness is not a goal.

| Checkpoint | Method / path candidate | Purpose | Actor | Lifecycle / query | Depends on | DB / media | Frontend consumer | Ops |
|---|---|---|---|---|---|---|---|---|
| `APP3-B01` | `GET /api/admin/products/{id}/sides` · `PUT …/sides` · `GET /api/public/products/{slug}/placement` | author + read placement geometry | Admin / anonymous | Q-02 side/area by product | G01 | none | Admin placement screen, Studio bootstrap | 3 |
| `APP3-B02` | `GET /api/public/products/{slug}/sides/{sideId}/background` | stream a side background derivative | anonymous | publication-gated | B01 | derivative | Studio stage | 1 |
| `APP3-B03` | `POST /api/admin/design-templates` · `GET …` (list) · `GET …/{id}` | template draft authoring | Admin | template `DRAFT` | G02, P01 | none | Admin template screens | 3 |
| `APP3-B04` | `POST …/{id}/publish` · `POST …/{id}/unpublish` · `POST …/{id}/archive` | template lifecycle | Admin | template TRs from G02 | B03 | none | Admin publication screen | 3 |
| `APP3-B05` | `GET /api/public/design-templates` · `GET /api/public/design-templates/{slug}` | published templates for a product scope | anonymous | scope filter (or M:N if ruled) | B04, B01 | preview derivative | Studio template picker | 2 |
| `APP3-B06` | `POST /api/public/design-sessions/{id}/assets` · `GET …/assets/{assetId}/editor-preview` | session-scoped customer upload + granted delivery | anonymous | asset lane from G04 | G04, W01 | derivative | Studio asset control | 2 |
| `APP3-B07` | `POST /api/public/design-sessions` · `GET /api/public/design-sessions/current` | bootstrap (blank or clone) and resume | anonymous | `TR-LC07-01` | G03, P01, B01 | none | Studio bootstrap | 2 |
| `APP3-B08` | `PUT /api/public/design-sessions/current/document` | autosave with `autosave_revision` CAS | anonymous | `TR-LC07-02` | B07 | none | Studio autosave | 1 |

Every row is ≤3 operations. No row implements `TR-LC07-03`, review, quotation or
submission.

---

## K. Frontend decomposition

### Admin

| Checkpoint | Capability | Route proposal | Backend dep | Figma | SSR/client | Tests |
|---|---|---|---|---|---|---|
| `APP3-A01` | product placement authoring (sides, areas, background, px↔mm) | `/products/{productId}/placement` | `APP3-B01` | `APP3-D01` | server shell + client form | component + integration |
| `APP3-A02` | template list (status/scope filters, cursor continuation) | `/design-templates` | `APP3-B03` | `APP3-D01` | server-first | component |
| `APP3-A03` | template editor (document, scope, allowed tools/fonts/colours) | `/design-templates/{id}` | `APP3-B03`, `P01`, `P02` | `APP3-D01` | client editor behind server shell | component |
| `APP3-A04` | template publication interaction (readiness, publish/unpublish/archive) | `/design-templates/{id}/publication` | `APP3-B04` | `APP3-D01` | client | component |

Deliberately **not** one "Template Management" checkpoint: APP2 proved that a
list, a form and a publication interaction are three different review surfaces
with three different failure modes (`APP2-A02`/`A03`/`A04`).

### Storefront Studio

| Checkpoint | Capability | Backend / package dep | SSR boundary | Perf gate | Test scope |
|---|---|---|---|---|---|
| `APP3-S01` | Studio bootstrap shell + product/template selection | `B07`, `B05` | server shell, lazy client scene | — | component + E2E entry |
| `APP3-S02` | SVG stage, renderer adapter, selection | `P01`, `P02` | client-only | **yes** — adapter contract + S/M/L scenes | component + benchmark |
| `APP3-S03` | transforms: move/resize/rotate/flip/opacity, DOM handles ≥44 px | `S02` | client | **yes** — transform p95 | component + benchmark |
| `APP3-S04` | layer list: reorder, group, lock, hide, duplicate, delete | `S02` | client | — | component |
| `APP3-S05` | text capability within whitelist constraints | `S02`, `P01` | client | — | component |
| `APP3-S06` | approved asset / image (and SVG once ruled) placement | `S02`, `B06` | client | — | component |
| `APP3-S07` | zoom / pan / safe area / product background | `S02`, `B02` | client | **yes** — WebKit zoom mitigation re-measured | component + benchmark |
| `APP3-S08` | undo / redo as document commands | `S02` | client | — | component |
| `APP3-S09` | repeated runtime watermark | `S02` | client | — | component + E2E (non-selectable, non-deletable, not serialized) |
| `APP3-S10` | autosave / conflict / resume / expiry UI | `S01`, `B08` | client | — | component + E2E |
| `APP3-S11` | mobile controls and touch gestures | `S03`, `S07` | client | **yes** — mobile transform p95 | component + mobile benchmark |
| `APP3-S12` | shapes, freehand, curved text (`LATER_APP3`) | `S02` | client | — | component |
| `APP3-S13` | align / distribute / snap / guides / crop (`LATER_APP3`) | `S02` | client | — | component |

No full-Studio mega-checkpoint. Accessibility is not a separate row because
ADR-APP0-001 makes it structural: real focusable DOM nodes, `aria-*`, keyboard
handling and ≥44 px handles are acceptance criteria **inside** `S02`/`S03`/`S04`.

---

## L. Figma and design classification

File in use: `BQwqV8GdfUIELvsQDB1UQE`. Registry state measured live:
86 IDs / 86 node rows / 11 tables, gate clean.

Classification uses only `NONE / REUSE / SUPPLEMENT / NEW / MISSING`.

| Surface | Class | Evidence |
|---|---|---|
| Admin template list / editor / publication | **MISSING** | no registry row matches template/studio/editor |
| Studio bootstrap, stage, layer list, property panels | **MISSING** | idem |
| Studio loading / error / empty / conflict / autosave states | **MISSING** | idem |
| Mobile touch controls | **MISSING** | idem |
| Watermark and safe-area treatment | **MISSING** | idem |
| Admin shell, Storefront shell | **REUSE** | `APP1-D01` / `APP1-D02` rows, `APPROVED_FOR_IMPLEMENTATION` |
| Design-system components (Button, Header, Footer, …) | **REUSE** | §6.1, `APPROVED`, published library |
| `FIG-DS-INPUT` (form input) | **MISSING** (library gap `GAP-D01`) | §7 — APP2 supplemented it locally as `FIG-DS-INPUT-APP2`; the Studio's property panels need it heavily |
| `FIG-DS-SCRIM-TOKEN` | **MISSING** (`GAP-D02`) | §7 — the Studio needs modal/scrim treatment |
| UI04 (Commission flow) / UI05 (Collections) | **NONE as authority** | they exist as pages in `FIG-FILE-PRODUCT` but carry **no registry row**; §7 records that no wireframe is `APPROVED_FOR_IMPLEMENTATION` |

Consequences, both binding:

1. **One coherent phase-level design package (`APP3-D01`) is required before any
   APP3 frontend checkpoint**, delivering Admin Template screens and the Studio
   as a single package (per the phase design policy) into a new `APP_03` page.
   New frames enter `REVIEW_REQUIRED`; only a human promotes them.
2. **No Draft or Reference node may be promoted without Product Owner
   approval.** If UI04/UI05 turn out to contain reusable Studio material, they
   must first be *registered* and then reconciled — the pattern `APP2-S02-G01`
   established (clone draft frames; retire old rows to `REFERENCE_ONLY`;
   `HISTORICAL_DRAFT_SOURCE` is a label, never a `Status`).

This audit modified no Figma node and created no registry row.

---

## M. Security, performance and testing

### Security (`09 §4`–`§7`, `05 §10`–`§11`, ADR-APP0-001)

| Control | Position entering APP3 |
|---|---|
| Document complexity / layer / image / SVG limits | **no values exist** — a blocking value becomes a decision at `APP3-G03`/`G04`; none is invented here |
| Font whitelist | mechanism undecided (ADR-APP0-001 deferred → APP3) |
| SVG sanitization | mandatory when SVG is accepted; sanitizer selection is APP3's; intake currently rejects SVG |
| Network isolation of the editor | ADR-APP0-001: no engine dependency, no external fetch; CSP already a `09 §9` baseline |
| Watermark regeneration | runtime-only, topmost, non-selectable, non-deletable, opaque token with **no raw PII**, never serialized |
| No export | no download control, no scene JSON, no high-res URL, no stable public preview URL |
| Private-original denial | asset id + approved derivative only; originals never reach the browser |
| Safe errors | inherited envelope; 5xx redacted to `INTERNAL_SERVER_ERROR` (APP2-T01) |
| Anonymous rate limits / session quota / concurrent-session cap | `09 §7` requires them; **no values exist** → `APP3-G03` |
| Autosave replay / idempotency | `autosave_revision` CAS is implemented and proven; replay policy for a repeated identical revision is undecided |
| Unsupported document version | must fail loudly (ADR-APP0-001 §4) — acceptance criterion of `APP3-P01` |

### Performance

Inherited authority is ADR-APP0-001 §6 with the APP0-R01 S/M/L scenes.
`pnpm spike:editor:check` stays inside `pnpm quality` (it is a static/isolation
check). `pnpm spike:editor:test` runs at every checkpoint that touches
`design-document`, `design-engine` or an adapter. **`pnpm spike:editor:benchmark`
is heavy and stays outside fast quality**, rerun at exactly `APP3-S02`,
`APP3-S03`, `APP3-S07`, `APP3-S11` and `APP3-E01`.

### Testing ownership

| Layer | Owner | Harness (reused, not rebuilt) |
|---|---|---|
| Package | `design-document`, `design-engine` | Jest unit, `packages/*/jest.config.mjs` |
| Backend | design + catalog modules | disposable-PG integration harness (`createPersistenceTestContext`), contract specs |
| Concurrency | autosave, publish | `createConcurrencyTestContext` — CC-01 already `PASS` |
| Frontend | Admin + Studio | `next/jest` + jsdom + RTL (IMP-D024) |
| Browser | `APP3-E01` | `@embroidery/e2e-testing` + the **APP2 canonical disposable production topology** (migrated, never dumped) |

**No new database architecture and no new E2E architecture.** APP2's `db-migrate`
one-shot is the canonical runner, `db:status` exit 0 is the history assertion,
and the seven committed DB6 checkers are reused.

---

## N. Follow-up routing

| Follow-up | Disposition | Owner in APP3 |
|---|---|---|
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | **ACTIVATE_IN_APP3** — the Studio cannot place an element without intrinsic dimensions | `APP3-G04` (decision) → `APP3-B01`/`B06` |
| `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` (`DRAFT → ARCHIVED` unauthorized) | **ACTIVATE_IN_APP3** — the identical hole exists on templates (§G3); ruling both in one lifecycle gate is cheaper and safer than ruling them apart | `APP3-G02` |
| publication Outbox `PENDING` (no consumer) | **KEEP_ROUTED_LATER** — APP3 adds no consumer; if template publication emits events, `APP3-G02` must say whether they also stay `PENDING` and `APP3-E01` owns the assertion | later |
| `FU-APP2-STOREFRONT-CONTENT-BAND-01` | **KEEP_ROUTED_LATER** — APP1 shell owner; the Studio is a full-bleed surface and is not blocked by it | later |
| `FU-APP1-SHELL-BRAND-TOUCH-TARGET-01` | **KEEP_ROUTED_LATER** | later |
| `FU-APP2-DETAIL-NOT-FOUND-STATUS-01` | **KEEP_ROUTED_LATER** — framework tracking; `SAFE_STREAMED_NOT_FOUND` remains the canonical name | later |
| `APP1-FU02` (WebKit 504 gateway flake) | **ACTIVATE_IN_APP3** — `APP3-E01` will run WebKit, and the ADR's WebKit zoom risk makes WebKit non-optional here | `APP3-E01` |
| `FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01` / `FU-APP2-THUMBNAIL-01` | **KEEP_ROUTED_LATER** — Admin surface owner | later |
| `FU-APP2-PRODUCT-ARCHIVE-UI-01` | **KEEP_ROUTED_LATER** — Product Owner surface decision | later |
| `FU-APP2-CATEGORY-MANAGEMENT-01` | **KEEP_ROUTED_LATER** | later |
| `FU-APP2-PRODUCT-VARIANTS-SKU-01` | **KEEP_ROUTED_LATER** — note `design_sessions.product_variant_id` is nullable, so APP3 is not blocked | later |

No follow-up is implemented by this audit. APP3 absorbs no unrelated
archive/catalog/content work.

---

## O. Corrected APP3 checkpoint map

Dependency-correct and acyclic. Decisions before code; design before frontend;
database (if any) before backend; backend before its frontend consumer. Every
backend row is ≤3 operations. No row implements APP4 identity or APP5/APP6
submission, review or quotation.

| # | ID | Type | Scope | API count / screens | Predecessors | Human-review output | Migration? | Figma dep? | Perf gate? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `APP3-PRE-AUDIT` | audit | this document | — | `APP2-X01` | audit + phase map + report | no | no | no |
| 2 | **`APP3-G01`** | gate | product placement and side-media authority (§G1, §G7 route ruling) | 0 | PRE-AUDIT | authority ruling + register row + gate script | no | no | no |
| 3 | `APP3-G02` | gate | Design Template authority: `TR-` ids for publish/unpublish/archive/unarchive, scope-vs-M:N compatibility, allowed tools/fonts/colours shape | 0 | G01 | ruling + `check:lifecycle` extension | decides `DB01` | no | no |
| 4 | `APP3-G03` | gate | Design Session authority: O-008 TTL, anonymous transport/issuance/rotation, `09 §7` quotas, autosave cadence + conflict policy, document limits | 0 | G01 | ruling + register rows | no | no | no |
| 5 | `APP3-G04` | gate | editor media authority: editor-safe derivative kind, customer/template intake lanes, SVG acceptance + sanitizer, dimensions metadata | 0 | G01 | ruling + ADR if a new kind is chosen | decides `DB01` | no | no |
| 6 | `APP3-P01` | package | `packages/design-document` — canonical form, JCS + SHA-256, `schemaVersion` fail-loud, document migrations, validation | — | G02, G03 | package + tests | no | no | `spike:editor:test` |
| 7 | `APP3-P02` | package | `packages/design-engine` — geometry, px↔mm, bounds and safe-area math | — | G01, P01 | package + tests | no | no | `spike:editor:test` |
| 8 | `APP3-DB01` | database | **conditional** — only if G02 rules M:N compatibility or G04 rules a new derivative kind | — | G02, G04 | forward-only migration + manifest evidence | **yes, if fired** | no | no |
| 9 | `APP3-B01` | backend | placement authoring + public placement read | 3 | G01, (DB01) | API + OpenAPI/client | no | no | no |
| 10 | `APP3-B02` | backend | side-background delivery | 1 | B01 | API + OpenAPI/client | no | no | no |
| 11 | `APP3-D01` | design | **one** phase-level package: Admin Template screens + full Studio (states, mobile, watermark, safe area) into a new `APP_03` page | — | G01–G04 | registry rows `REVIEW_REQUIRED` | no | **yes** | no |
| 12 | `APP3-A01` | frontend | Admin placement authoring screen | 1 screen | B01, D01 | screen | no | yes | no |
| 13 | `APP3-B03` | backend | template draft authoring | 3 | G02, P01 | API | no | no | no |
| 14 | `APP3-B04` | backend | template lifecycle (publish / unpublish / archive) | 3 | B03 | API | no | no | no |
| 15 | `APP3-B05` | backend | public published-template read for a product scope | 2 | B04, B01 | API | no | no | no |
| 16 | `APP3-A02` | frontend | Admin template list | 1 screen | B03, D01 | screen | no | yes | no |
| 17 | `APP3-A03` | frontend | Admin template editor | 1 screen | B03, D01, P01, P02 | screen | no | yes | `spike:editor:test` |
| 18 | `APP3-A04` | frontend | Admin template publication interaction | 1 screen | B04, D01 | screen | no | yes | no |
| 19 | `APP3-W01` | worker | editor-safe derivative + customer-upload inspection lane | 0 HTTP | G04, (DB01) | worker handler | no | no | no |
| 20 | `APP3-B06` | backend | session-scoped customer asset intake + granted delivery | 2 | G04, W01 | API | no | no | no |
| 21 | `APP3-B07` | backend | session bootstrap (blank + clone) and resume | 2 | G03, P01, B01 | API | no | no | no |
| 22 | `APP3-B08` | backend | session autosave with revision CAS | 1 | B07 | API | no | no | no |
| 23 | `APP3-S01` | frontend | Studio bootstrap shell + selection | 1 capability | B07, B05, D01 | route + shell | no | yes | no |
| 24 | `APP3-S02` | frontend | SVG stage, renderer adapter, selection | 1 capability | S01, P01, P02 | reviewed adapter contract | no | yes | **benchmark** |
| 25 | `APP3-S03` | frontend | transforms and DOM handles | 1 capability | S02 | capability | no | yes | **benchmark** |
| 26 | `APP3-S04` | frontend | layer list and z-order/lock/hide/group | 1 capability | S02 | capability | no | yes | no |
| 27 | `APP3-S05` | frontend | text capability | 1 capability | S02, P01 | capability | no | yes | no |
| 28 | `APP3-S06` | frontend | asset/image (and SVG if ruled) capability | 1 capability | S02, B06 | capability | no | yes | no |
| 29 | `APP3-S07` | frontend | zoom / pan / safe area / product background | 1 capability | S02, B02 | capability + WebKit re-measurement | no | yes | **benchmark** |
| 30 | `APP3-S08` | frontend | undo / redo | 1 capability | S02 | capability | no | yes | no |
| 31 | `APP3-S09` | frontend | runtime watermark | 1 capability | S02 | capability | no | yes | no |
| 32 | `APP3-S10` | frontend | autosave / conflict / resume / expiry UI | 1 capability | S01, B08 | capability | no | yes | no |
| 33 | `APP3-S11` | frontend | mobile controls | 1 capability | S03, S07 | capability | no | yes | **benchmark** |
| 34 | `APP3-S12` | frontend | shapes, freehand, curved text (`LATER_APP3`) | 1 capability | S02 | capability | no | yes | no |
| 35 | `APP3-S13` | frontend | align/distribute/snap/guides/crop (`LATER_APP3`) | 1 capability | S02 | capability | no | yes | no |
| 36 | `APP3-E01` | E2E | cross-layer journey: publish template → anonymous session → customize → autosave → reload → tampered/out-of-bounds document rejected → private original denied → no export surface | — | S10, S11, B05 | E2E evidence | no | no | **benchmark** |
| 37 | `APP3-X01` | closure | close R2 Customization Alpha; hand off session→request ownership to APP4/APP5 | — | E01 | closure matrix + gate | no | no | no |

**Validation of the map.** Acyclic (every predecessor has a strictly lower row
number except the conditional `DB01`, which precedes both its consumers). No
backend row exceeds 3 operations, well inside the 5 limit. No frontend row spans
more than one screen or bounded capability. `D01` precedes every frontend row.
`DB01` precedes `B01`, `B03` and `W01`. No row touches APP4 identity, APP5
submission, or APP6 review/quotation.

---

## P. First checkpoint recommendation

**`APP3-G01` — Product placement and side-media authority.**

### Why this one, first

Because it is the only gap that makes *every other APP3 capability physically
impossible*, and it is invisible in the current phase plan. `design_sessions`
requires `product_side_id` and `embroidery_area_id` as `NOT NULL`; templates
scope onto the same two ids; the Studio stage renders the side background at
`px_per_mm`; the safe area *is* an `embroidery_areas` row. All of that data
exists as tables and repository methods — and **nothing in the running system
can create or read a single row**. Starting `APP3-P01`, `APP3-B03` or `APP3-D01`
before this is ruled means designing and coding against geometry nobody can
supply.

Second reason: the route gap (§G7). APP2 lost a whole checkpoint to an
undecided storefront path and had to cure it with `APP2-S01-G01`. The Studio
route is the same omission, visible now, and it costs nothing to rule here.

### What it resolves

- Who authors product sides and embroidery areas — Admin UI in APP3, seed data,
  or a deferred surface — and therefore whether `APP3-A01` exists.
- The public placement read contract: which fields an anonymous Studio may see
  (`image_width_px`, `physical_*_mm`, `px_per_mm`, area bounds, `max_*_mm`) and
  which stay internal.
- How a side background is delivered, given that the delivered
  `publicProductMedia_get` is bound to `product_media` and cannot serve an
  `assets` reference — a second route, a widened one, or a new media role.
- Whether a customer chooses a side/area, or the Studio is entered with one
  already fixed by the product.
- The canonical Studio storefront route (Vietnamese path), extending
  `check:storefront-route-authority` rather than competing with it.
- Whether a product must have at least one side + area before it may be
  published (an addition to the APP2 readiness evaluator, or explicitly not).

### What stays blocked after it

`APP3-G02` (template lifecycle and compatibility), `APP3-G03` (TTL, anonymous
transport, quotas), `APP3-G04` (editor-safe derivative, intake lanes, SVG) and
everything downstream. `APP3-G01` unblocks `APP3-P02`, `APP3-B01`, and the
placement half of `APP3-D01` — nothing more, and it should not pretend otherwise.

### Allowed file categories

`docs/implementation/**` (audit, phase, register, roadmap, traceability),
`docs/adr/**` if the Product Owner's ruling is consequential enough to need one,
`tools/check-*.mjs` plus its `node --test` companion for the new authority gate,
and `package.json` **only** to register that gate script. **No** application
source, no schema, no migration, no OpenAPI, no generated client, no Figma node,
no dependency.

### Required evidence

The ruling recorded in the decision register with a new `IMP-D0xx` id; the phase
file updated in the same checkpoint; a mechanical gate that *recomputes* the
ruled facts rather than trusting prose (the `check:app2-closure` pattern), with
its own tests; and a completion report naming the exact commits. Preflight and
pre-commit gate runs as in §17 of the checkpoint prompt.

### Product Owner questions this gate must put

1. Who authors product sides and embroidery areas, and does APP3 build that
   Admin surface or consume seeded geometry?
2. Must a published product carry at least one side and one embroidery area?
   (This changes the APP2 publication readiness evaluator.)
3. Does the customer choose product side and embroidery area in the Studio, or
   is the Studio always entered with both already fixed?
4. What is the canonical Studio route?
5. May the public placement contract expose physical millimetres, or is that
   internal-only manufacturing data?
6. Is a product side background public like catalog media, or granted like a
   customer asset?

---

## Q. Entry-gate acceptance matrix

| Requirement | Status |
|---|---|
| Exact APP2 closure entry read from Git | met (§B) |
| APP0 SVG/React architecture preserved, IMP-D026 unreopened | met (§E) |
| Scope and exclusions exact | met (§C) |
| Repository and DB gaps proven from files, not inferred | met (§D, §G, §H) |
| Template and Session lifecycles mapped with canonical names | met (§J) |
| Anonymous ownership audited; no identity invented | met (§F) |
| Editor-safe media classified | met (§I) |
| API decomposition ≤3 ops per checkpoint, ≤5 limit respected | met (§J) |
| Frontend decomposition bounded, no mega-checkpoint | met (§K) |
| Figma status grounded in the registry | met (§L) |
| Security, watermark, no-export preserved | met (§M) |
| Performance and test ownership defined | met (§M) |
| Follow-ups reconciled with owners | met (§N) |
| Acyclic map with one first gate | met (§O, §P) |
| No implementation prompt written | met |
| Quality and artifact gates pass | met (§B, `APP3_PRE_AUDIT_PREFLIGHT = PASS`) |

## R. Scope confirmation and one disclosed departure

This audit created no application source, no schema, no migration, no Figma
node, no package-manifest entry and no lockfile change. It started no APP3
engineering, and it did not write the execution prompt for `APP3-G01`.

**One departure from "documentation only", disclosed rather than hidden.**
`tools/check-app2-closure.mjs` failed any file in `docs/implementation/reports/`
whose name starts with `APP3-`, with the message *"APP3 must not be started
before closure"*. That assertion was written to stop APP3 work **predating**
closure. APP2 is now closed and accepted, and this audit's mandated report is
`docs/implementation/reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`
— so the gate and the sanctioned next step were in direct conflict, and no
choice of report name resolves it.

Resolution follows the established pattern: **the gate moves with the ruling,
in place, and stays mechanical.** One exact filename is allowlisted —
not a prefix, not a label escape, not a disabled check. Every other `APP3-`
report (a design package, a backend checkpoint, a Studio screen) still fails,
and a near-miss name such as `APP3-PRE-IMPLEMENTATION-AUDIT-C1-REPORT.md` fails
too. Two `node --test` cases pin both halves; the suite is 30 → 32 cases and the
closure verdict itself is byte-for-byte unchanged
(`45 checkpoint rows, 11 routed follow-ups, 0 blocking; OpenAPI 16/19/34,
33 migrations, Figma 86/86/11, SAFE_STREAMED_NOT_FOUND current, APP3 NOT
STARTED`).

Files touched by the departure: `tools/check-app2-closure.mjs`,
`tools/check-app2-closure.test.mjs`. No `package.json` change was needed — the
script was already registered.
