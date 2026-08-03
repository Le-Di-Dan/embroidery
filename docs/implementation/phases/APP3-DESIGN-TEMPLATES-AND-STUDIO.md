# APP3 — Design Templates and 2D Design Studio

## 1. Outcome

Deliver the product differentiation core: Admin defines versioned product-compatible embroidery templates and customers create a validated, watermark-protected 2D customization session.

## 2. Dependencies

APP2 complete; APP0 editor spike approved; design-document/design-engine ownership and serialization baseline confirmed.

## 3. Design policy

Audit prior wireframes/high-fidelity Studio work and Design System. **The expected `REUSE`/`SUPPLEMENT` classification did not survive contact with the registry:** `APP3-PRE-AUDIT` audited all 86 rows of [`FIGMA_DESIGN_INDEX.md`](../../design/FIGMA_DESIGN_INDEX.md) and found **no Studio and no Admin-Template authority of any kind** — every APP3 screen classifies as `MISSING`. The shells (`APP1-D01`/`APP1-D02`) and the DS component sets are genuine `REUSE`; `FIG-DS-INPUT` and `FIG-DS-SCRIM-TOKEN` remain library gaps (`GAP-D01`/`GAP-D02`) that the Studio's property panels and dialogs will hit. UI04/UI05 exist as pages in the product file but carry **no registry row** and are therefore `NONE` as authority — they may only become reusable after being registered and reconciled with Product Owner approval, never promoted directly.

Missing Admin template screens and customer editor states are completed in one coherent APP3 package (`APP3-D01`) into a new `APP_03` page. No 3D or download UI.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Template create/edit/version/publish/unpublish/archive and product scope.
- **Product side and embroidery-area authority** — the placement substrate the
  Studio, templates and sessions all depend on (added by `APP3-PRE-AUDIT` §G1).
- Allowed tools/assets/fonts/colors and constraints.
- Design session bootstrap/load/autosave/conflict/resume/expiry.
- Canonical design document and server validation.
- 2D preview on product images.
- Text/image layer interaction, transforms, mobile controls.
- Watermark and private asset protection.
- Autosave/recovery and version consistency.

> **Canonical session states.** `ACTIVE | SUBMITTED | EXPIRED | DELETED` (LC-07).
> `ABANDONED` was **eliminated at DB3** (merged into `EXPIRED`) and is not a
> storable value — `ck_design_sessions__status_allowed` rejects it. The earlier
> wording "create/load/update/**abandon**/expiry" came from `06 §2`, which
> self-describes its list as *suggested conceptual states*; DB3 and the schema
> are the binding authority. `SUBMITTED` is **APP5's** transition (`TR-LC07-03`)
> and must not be implemented in APP3.

## 5. Out of scope

- 3D previews.
- Customer download/export.
- Digitized production file generation.
- Review/approval and quotation.
- Unbounded free-form graphic editor features.

## 6. Candidate engineering checkpoints

> **Superseded by §6.1.** These were the pre-audit planning slices, kept as dated
> history. `APP3-PRE-AUDIT` replaced them with the corrected, evidence-grounded
> map below. Where the two disagree, §6.1 governs.

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP3-C01 — Template core contract:** Define list, detail, create, update, and version/read operations.
- **APP3-B01 — Template core backend:** Implement template ownership, validation, version semantics and repository tests.
- **APP3-A01 — Admin template list:** Implement list/status/filter and navigation.
- **APP3-A02 — Admin template editor:** Implement product side/area/tool constraints and validation against the approved design.
- **APP3-C02 — Template publication contract:** Define publish, deactivate, compatibility check, and public compatible-template read operations.
- **APP3-B02 — Template publication backend:** Implement immutable/versioned publication and compatibility rules.
- **APP3-A03 — Admin template publication:** Implement readiness and lifecycle actions.
- **APP3-C03 — Design session core contract:** Define create, get, update/autosave, and abandon operations.
- **APP3-B03 — Design session backend:** Implement ownership, canonical document validation, expiry, optimistic conflict/version behavior and tests.
- **APP3-S01 — Studio route shell:** Implement server-rendered route shell, product/template bootstrap and client boundary.
- **APP3-S02 — Canvas renderer and selection:** Implement 2D render, selection and viewport using design-engine; no inline CSS positioning.
- **APP3-S03 — Text layer capability:** Implement add/edit/style text within approved constraints.
- **APP3-S04 — Image layer capability:** Implement approved asset/image placement within constraints.
- **APP3-S05 — Transform capability:** Implement move/resize/rotate, bounds, keyboard/touch behavior and accessible fallback where feasible.
- **APP3-S06 — Watermark and preview:** Implement consistent watermark and non-exportable customer preview.
- **APP3-S07 — Autosave and recovery:** Implement pending/saved/error/conflict/expired recovery behavior.
- **APP3-E01 — Studio E2E:** Published template → customer creates session → customizes → autosaves → reloads → server rejects invalid out-of-bounds/tampered document.
- **APP3-X01 — Phase closure:** Close R2 Customization Alpha and hand off session/customer secure journey needs to APP4.

## 6.1 Corrected checkpoint map (`APP3-PRE-AUDIT`)

The §6 candidate slices are corrected here from repository truth. Full evidence:
[`audits/APP3_PRE_IMPLEMENTATION_AUDIT.md`](../audits/APP3_PRE_IMPLEMENTATION_AUDIT.md).
Four corrections drive the difference:

1. **Contract-only `C0x` slices are merged into their backend checkpoint.**
   `IMP-D019` generates OpenAPI from decorated NestJS controllers, so a
   contract-only checkpoint that writes no controller cannot produce the
   committed artifact. This is the same correction APP2 applied.
2. **Product placement geometry is added as first-class scope.** `product_sides`
   and `embroidery_areas` exist physically and are written/read by
   `DrizzleProductRepository`, but **no API authors or returns them** and the
   delivered media route cannot serve a side background. `design_sessions`
   requires both ids as `NOT NULL`, so nothing in APP3 can run without this.
3. **Four authority gates precede code.** Template lifecycle transitions,
   session TTL/transport, and the editor-safe derivative are all undecided;
   inventing any of them inside an implementation checkpoint is prohibited.
4. **One phase-level design package precedes every frontend checkpoint.** Figma
   carries zero Studio or Admin-Template rows.

Migration verdict (corrected by `APP3-PRE-AUDIT-C1`, **`G01` resolved by
`APP3-G01`**): **`NO_APP3_MIGRATION_UNLESS_G01_OR_G02_OR_G04_PROVES_ONE`** — and
`G01` has now proved one, so a migration **is** required (§6.4.3).

- **`G01` — RULED, `REQUIRES_APP3_DB01` (IMP-D041).** Of the four candidate
  paths the pre-audit listed, three were **not taken**: PO-03 keeps the canonical
  association on `product_sides.background_asset_id` rather than a new
  `product_media.role`; it leaves the background derivative kind to `APP3-G04`;
  and PO-02 makes the placement manifest a **public** read for a publicly visible
  Product, so no anonymous-session grant is needed and
  `secure_access_grants` is untouched. What remains is the fourth path, now
  binding: PO-02 requires *active* rows and a *stable code*, and PO-07 requires
  retirement-without-deletion and immutability after first reference — and
  `product_sides`/`embroidery_areas` carry **no** active/retired flag, no
  supersession pointer, no stable code and no lock column.
- **`G02`** — a template↔product many-to-many compatibility relation.
- **`G04`** — a new `asset_derivatives.kind` for the editor-safe *customer*
  derivative, and the side-background derivative kind PO-03 deferred to it.

`G01` alone already fires the checkpoint. `APP3-DB01` therefore stays
**conditional only in scope**, not in existence: it will run as one combined
forward-only migration once `G02` and `G04` have added or withheld their own
contributions.

### Conditional `APP3-DB01` — terminal semantics

```text
1. COMPLETE
   A required forward-only migration was implemented and accepted.

2. NOT_REQUIRED — GATE_RESOLVED
   G01/G02/G04 collectively proved the current schema sufficient.
```

Dependents wait on the **disposition**, never on a migration having run:

```text
DB-DISPOSITION-RESOLVED
```

is satisfied by **either** terminal outcome, so a `NOT_REQUIRED` result cannot
deadlock `APP3-B01`, `APP3-B03`, `APP3-W01` or anything behind them.

### Package dependency rule

`packages/design-document` (`APP3-P01`) owns document schema, validation,
canonicalization, quantization, unsupported-version failure, JCS/hash support
and document migrations. It is **mandatory before every API that accepts or
persists a design document** — `B03`, `B04`, `B05`, `B07`, `B08`.

`packages/design-engine` (`APP3-P02`) owns geometry, transforms and px↔mm
conversion. It **does not block backend writes generically**. It blocks only a
write carrying a named server-side geometry or placement invariant — the exit
gate's out-of-bounds/tampered-document rejection (§7/§8) — which is `B04`
(publish must be in-bounds for its scope), `B07` (bootstrap/clone) and `B08`
(autosave). Elsewhere it is routed before the exact Studio and placement
checkpoints that consume it (`A01`, `A03`, `S02`, `S07`). The two packages are
independent and may proceed in parallel; neither may take a rendering dependency
or be collapsed into the other or into the API.

| # | ID | Type | Scope | API / screens | Predecessors | Migration? | Figma? | Perf gate? |
|---|---|---|---|---|---|---|---|---|
| 1 | `APP3-PRE-AUDIT` | audit | this audit | — | `APP2-X01` | no | no | no |
| 2 | **`APP3-G01`** | gate | product placement + side-media authority; Studio route authority; existing-data/invariant rollout evidence — **`READY — NOT STARTED`** | 0 | PRE-AUDIT | **decides DB01** | no | no |
| 3 | `APP3-G02` | gate | Design Template authority — `TR-` ids for publish/unpublish/archive/unarchive, scope-vs-M:N compatibility, allowed tools/fonts/colours | 0 | G01 | decides DB01 | no | no |
| 4 | `APP3-G03` | gate | Design Session authority — O-008 TTL, anonymous transport/issuance/rotation, `09 §7` quotas, autosave cadence + conflict policy, document limits | 0 | G01 | no | no | no |
| 5 | `APP3-G04` | gate | editor media authority — editor-safe derivative kind, customer/template intake lanes, SVG acceptance + sanitizer, dimensions metadata | 0 | G01 | decides DB01 | no | no |
| 6 | `APP3-P01` | package | `packages/design-document` — canonical form, JCS + SHA-256, fail-loud `schemaVersion`, document migrations, validation | — | G02, G03 | no | no | `spike:editor:test` |
| 7 | `APP3-P02` | package | `packages/design-engine` — geometry, px↔mm, bounds and safe-area math | — | G01 | no | no | `spike:editor:test` |
| 8 | `APP3-DB01` | database | **conditional** — only if G01 rules a role/kind/grant/immutability change, G02 rules M:N or G04 rules a new derivative kind. Terminals: `COMPLETE` or `NOT_REQUIRED — GATE_RESOLVED` | — | G01, G02, G04 | yes, if fired | no | no |
| 9 | `APP3-B01` | backend | placement authoring + public placement read | 3 | G01, `DB-DISPOSITION-RESOLVED` | no | no | no |
| 10 | `APP3-B02` | backend | side-background delivery | 1 | B01 | no | no | no |
| 11 | `APP3-D01` | design | **one** phase-level package — Admin Template screens + full Studio (states, mobile, watermark, safe area) into a new `APP_03` page | — | G01–G04 | no | yes | no |
| 12 | `APP3-A01` | frontend | Admin placement authoring | 1 screen | B01, D01 | no | yes | no |
| 13 | `APP3-B03` | backend | template draft authoring | 3 | G02, P01, `DB-DISPOSITION-RESOLVED` | no | no | no |
| 14 | `APP3-B04` | backend | template lifecycle (publish / unpublish / archive) | 3 | B03, **P02** (in-bounds invariant) | no | no | no |
| 15 | `APP3-B05` | backend | public published-template read for a product scope | 2 | B04, B01 | no | no | no |
| 16 | `APP3-A02` | frontend | Admin template list | 1 screen | B03, D01 | no | yes | no |
| 17 | `APP3-A03` | frontend | Admin template editor | 1 screen | B03, D01, P01, P02 | no | yes | `spike:editor:test` |
| 18 | `APP3-A04` | frontend | Admin template publication interaction | 1 screen | B04, D01 | no | yes | no |
| 19 | `APP3-W01` | worker | editor-safe derivative + customer-upload inspection lane | 0 HTTP | G04, `DB-DISPOSITION-RESOLVED` | no | no | no |
| 20 | `APP3-B06` | backend | session-scoped customer asset intake + granted delivery | 2 | G04, W01 | no | no | no |
| 21 | `APP3-B07` | backend | session bootstrap (blank + clone) and resume | 2 | G03, P01, **P02**, B01 | no | no | no |
| 22 | `APP3-B08` | backend | session autosave with `autosave_revision` CAS | 1 | B07, **P02** (out-of-bounds rejection) | no | no | no |
| 23 | `APP3-S01` | frontend | Studio bootstrap shell + product/template selection | 1 capability | B07, B05, D01 | no | yes | no |
| 24 | `APP3-S02` | frontend | SVG stage, renderer adapter, selection | 1 capability | S01, P01, P02 | no | yes | **benchmark** |
| 25 | `APP3-S03` | frontend | transforms and DOM handles (≥44 px, outside the element box) | 1 capability | S02 | no | yes | **benchmark** |
| 26 | `APP3-S04` | frontend | layer list, z-order, lock, hide, group | 1 capability | S02 | no | yes | no |
| 27 | `APP3-S05` | frontend | text capability within whitelist constraints | 1 capability | S02, P01 | no | yes | no |
| 28 | `APP3-S06` | frontend | asset/image (and SVG once ruled) capability | 1 capability | S02, B06 | no | yes | no |
| 29 | `APP3-S07` | frontend | zoom / pan / safe area / product background | 1 capability | S02, B02 | no | yes | **benchmark** |
| 30 | `APP3-S08` | frontend | undo / redo as document commands | 1 capability | S02 | no | yes | no |
| 31 | `APP3-S09` | frontend | runtime watermark | 1 capability | S02 | no | yes | no |
| 32 | `APP3-S10` | frontend | autosave / conflict / resume / expiry UI | 1 capability | S01, B08 | no | yes | no |
| 33 | `APP3-S11` | frontend | mobile controls and touch gestures | 1 capability | S03, S07 | no | yes | **benchmark** |
| 34 | `APP3-S12` | frontend | shapes, freehand, curved text (`LATER_APP3`) | 1 capability | S02 | no | yes | no |
| 35 | `APP3-S13` | frontend | align / distribute / snap / guides / crop (`LATER_APP3`) | 1 capability | S02 | no | yes | no |
| 36 | `APP3-E01` | E2E | cross-layer journey (§7) | — | S10, S11, B05 | no | no | **benchmark** |
| 37 | `APP3-X01` | closure | close R2 Customization Alpha; hand off to APP4/APP5 | — | E01 | no | no | no |

## 6.2 Locked inheritance for every APP3 checkpoint

- **Rendering is IMP-D026 / `ADR-APP0-001`** and is not reopened: native SVG
  rendered by React 19, no rendering-engine dependency, engine-neutral document
  as the single source of truth, mandatory renderer-adapter boundary, runtime-only
  selection/handles/viewport/watermark, no mutable runtime object in Zustand,
  geometry outside components, undo/redo as a domain concern, client-only lazy
  Studio behind a server-rendered shell. Konva, Fabric and interact.js must never
  enter a production manifest; `pnpm check:spike-boundaries` enforces it.
- **Performance authority** is `ADR-APP0-001` §6 with the APP0-R01 S/M/L scenes.
  `pnpm spike:editor:check` stays in `pnpm quality`; `pnpm spike:editor:test`
  runs at any checkpoint touching `design-document`, `design-engine` or an
  adapter; **`pnpm spike:editor:benchmark` stays outside fast quality** and is
  rerun at `S02`, `S03`, `S07`, `S11` and `E01`. The measured WebKit
  continuous-scale risk (41 ms p95 versus 16.7 ms Chromium) is `APP3-S07`'s to
  mitigate and re-measure.
- **Testing reuses what exists**: the disposable-PG integration harness, the
  `next/jest` component harness, and `@embroidery/e2e-testing` with APP2's
  canonical **migrated** disposable production topology. No second database or
  E2E architecture.
- **Security**: no export surface of any kind, no private original in the
  browser, asset id + approved derivative only, sanitized SVG before rendering,
  watermark regenerated on load with an opaque token carrying no raw PII.

## 6.3 Open decisions APP3 owns

| Item | Source | Owning gate |
|---|---|---|
| Design-session TTL (`O-008` / `DP-RET-01`) | `12-DECISION-LOG.md`, ADR-DB1-011 | `APP3-G03` |
| Anonymous session transport, issuance, rotation, enumeration controls | `09 §2`/`§7`, ADR-DB2-001 | `APP3-G03` |
| Autosave cadence and conflict policy | `ADR-APP0-001` deferred details | `APP3-G03` |
| Document complexity / layer / image limits and anonymous quotas | `09 §7` | `APP3-G03` |
| Template transition identifiers and guards (publish/unpublish/archive/unarchive) | DB3 "Additional lifecycles" — states without `TR-` ids | `APP3-G02` |
| Template↔product compatibility: scope filter or many-to-many | DB2 GAP-08 versus §6 wording | `APP3-G02` |
| Font whitelist and thread-colour mechanics | `05 §4.1`, `ADR-APP0-001` deferred | `APP3-G02` |
| Editor-safe derivative kind | `ADR-APP0-001` §5 versus `ASSET_DERIVATIVE_KINDS` | `APP3-G04` |
| Customer/template asset intake lanes | `asset-intake.policy.ts` is `CATALOG_MEDIA`-only | `APP3-G04` |
| SVG acceptance + sanitizer selection | `ADR-APP2-001` §4 ("future, separately-decided scope"), `ADR-APP0-001` deferred | `APP3-G04` |
| Media dimensions metadata (`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`) | APP2 follow-up, activated | `APP3-G04` |
| Product placement ownership, public contract, background delivery, Studio route | audit §G1/§G7 | `APP3-G01` |
| Background removal (`05 §4.2`) | no locked authority requires it | Product Owner — `DEFERRED` |
| Snapping/guide rules, marquee multi-select, crop UX, freehand smoothing | `ADR-APP0-001` deferred | `APP3-S12`/`S13` |
| Whether `design-engine` or the Studio owns each geometry helper | `ADR-APP0-001` deferred → `APP3-S02` | `APP3-P02`/`S02` |

## 6.4 `APP3-G01` — Product placement and side-media authority (IMP-D041)

The first APP3 execution checkpoint. Authority, dependency reconciliation and a
mechanical gate only — **no application source, schema, migration, OpenAPI,
generated-client, Figma or dependency change**.

The pre-audit proved the hard blocker: `product_sides` and `embroidery_areas`
exist and are written by `DrizzleProductRepository`, yet no operation authors or
returns them, while `design_sessions.product_side_id` and
`design_sessions.embroidery_area_id` are both `NOT NULL`. Seven Product Owner
rulings close that gap.

### 6.4.1 Machine-checked placement facts

`pnpm check:app3-g01` recomputes each of these against the repository. Do not
edit a value here without changing the ruling it encodes.

| Fact | Value |
|---|---|
| `Placement authoring actor` | `ADMIN_ONLY` |
| `Placement authoring checkpoint` | `APP3-A01` |
| `Placement owning module` | `PRODUCT` |
| `Public placement contract` | `READ_ONLY_MANIFEST` |
| `Public placement checkpoint` | `APP3-B01` |
| `Studio eligibility flag` | `studioEligible` |
| `Side background association` | `product_sides.background_asset_id` |
| `Side background delivery checkpoint` | `APP3-B02` |
| `Side background derivative kind owner` | `APP3-G04` |
| `Customer side selection` | `AUTO_WHEN_SINGLE_ELSE_CUSTOMER` |
| `Customer area selection` | `AUTO_WHEN_SINGLE_ELSE_CUSTOMER` |
| `Deterministic initial choice` | `FIRST_ACTIVE_BY_DISPLAY_ORDER` |
| `Canonical Studio route` | `/san-pham/[slug]/thiet-ke` |
| `Studio route base` | `/san-pham/[slug]` |
| `Publication requires placement` | `NO` |
| `Studio eligibility requires placement` | `YES` |
| `Referenced placement mutability` | `IMMUTABLE_AFTER_FIRST_REFERENCE` |
| `Referenced placement deletion` | `NO_HARD_DELETE` |
| `Placement change representation` | `REPLACEMENT_ROW_WITH_RETIREMENT` |
| `G01_DB_DISPOSITION` | `REQUIRES_APP3_DB01` |

Rejected as canonical Studio routes: `/studio`, `/editor`, `/thiet-ke/[id]`.

### 6.4.2 The seven rulings

**PO-01 — Placement authoring owner.** Product Side and Embroidery Area are
**Product aggregate** placement authority. Only authenticated **Admin** users may
author them, through **`APP3-A01`**. Placement application operations belong to
the **Product/Catalog module**, not the Design module. Design Template, Design
Session and Storefront code may reference placement authority but may never
create or mutate it — no customer-authored side or area, and no Template-owned
duplicate placement geometry.

**PO-02 — Public placement read contract.** A published Product may expose one
**read-only placement manifest**: product id/slug, `studioEligible`, and ordered
active sides (id, stable code/name, display order, image width/height px,
physical width/height mm, `px_per_mm`, a dedicated background-delivery
reference), each with ordered active embroidery areas (id, stable code/name,
display order, x/y origin, width/height, physical maxima when present). Public
read only while the Product is publicly visible. No private original URL, no
storage key, no customer-private data, no mutation field. Deterministic ordering;
IDs are opaque identifiers, never authorization tokens. Incomplete placement
returns **`studioEligible = false`**, never fabricated geometry. Owner:
**`APP3-B01`**.

**PO-03 — Side-background association and delivery.** Canonical association is
**`product_sides.background_asset_id`**. Side backgrounds are **not** duplicated
into `product_media`. Delivery is one dedicated public operation owned by
**`APP3-B02`** — published Product + active Side + `background_asset_id` →
approved browser-safe derivative. Originals are never delivered; the operation
must verify the side belongs to the addressed Product; archived/unpublished
Products and retired sides are not deliverable; delivery derives from
`background_asset_id`, never a second association row. **The derivative kind and
processing lane remain owned by `APP3-G04`**, so `APP3-G01` approves no kind and
`APP3-B02` is blocked by **both** gates.

**PO-04 — Customer side and area selection.** One active side selects
automatically; multiple active sides are customer-selected. Same rule for areas
on the selected side. The deterministic initial choice is the first active row by
`display_order` with a stable tie-breaker. The chosen `product_side_id` and
`embroidery_area_id` persist on the Design Session, and a customer may never
submit identifiers outside the validated Product → Side → Area chain.

**PO-05 — Canonical Studio route.** **`/san-pham/[slug]/thiet-ke`**, extending
the accepted detail route `/san-pham/[slug]` (IMP-D039). Side and area
identifiers are not path authority; selection lives in bootstrap/session state.
Server shell + lazy client-only Studio. `/studio`, `/editor` and `/thiet-ke/[id]`
are rejected. The existing route-authority mechanism is extended, not duplicated.

**PO-06 — Publication versus Studio eligibility.** Global Product publication
**does not** require placement, and **no global publication guard requiring
placement may be added**. Studio eligibility is separately derived: published
Product + ≥1 active Side + that side has ≥1 active Area + an eligible approved
side background. Product detail stays public while the Studio CTA is absent or
disabled; the public read reports `studioEligible = false`; existing published
catalogs need **no forced grandfathering**; Admin publication and placement
authoring stay separate workflows.

**PO-07 — Referenced placement mutability.** Placement identity and geometry are
mutable **only before first reference**. Once referenced by a Design Template
version or a non-terminal Design Session, the parent relationship, stable code,
background asset, pixel dimensions, physical dimensions, `px_per_mm`, area
origin, area extent and physical maxima become **immutable**, and the row can
**never be hard-deleted**. A change is a **new replacement row**; the old row is
retired from future selection and retained for historical references. Display-only
text and ordering may change only where identity, geometry and historical
rendering are unaffected.

> **Schema fact refining PO-07.** In the delivered schema the Template *header*
> (`design_templates.product_side_id` / `embroidery_area_id`, nullable) carries
> template scope — `design_template_versions` holds only the document. A
> template reference is therefore a header reference. `approval_snapshots`
> additionally references both ids `NOT NULL`, so an APP6 approval is a third
> reason a referenced row can never be hard-deleted.

### 6.4.3 Database disposition

```text
G01_DB_DISPOSITION = REQUIRES_APP3_DB01
```

Measured, not assumed: `product_sides` and `embroidery_areas` carry **no**
active/retired flag, no supersession pointer, no stable code column and no lock
column. PO-02 needs "active" rows and a stable code; PO-07 needs retirement
without deletion. Neither is representable today.

`APP3-G01` implements no migration. `APP3-DB01` stays **conditional** at phase
level until `APP3-G02` and `APP3-G04` also rule, after which one combined
forward-only migration checkpoint runs. Because G01 requires it, the collective
disposition **cannot** be `NOT_REQUIRED — GATE_RESOLVED` unless this ruling is
explicitly superseded by later human authority.

### 6.4.4 Dependency reconciliation

> **Dated record — superseded by §6.5.4.** This table states the map *as it stood
> when `APP3-G01` delivered*, and `pnpm check:app3-g01` asserts these exact
> values, so it is not rewritten. Human review has since accepted G01 and
> `APP3-G02` has delivered; §6.5.4 carries the current statuses.

| Checkpoint | Status after `APP3-G01` |
|---|---|
| `APP3-G01` | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-G02` | `READY — NOT STARTED` |
| `APP3-G03` | `NOT STARTED` |
| `APP3-G04` | `NOT STARTED` |
| `APP3-P02` | `READY` for geometry foundation work that does not require `APP3-G04` |
| `APP3-B01` | `READY — NOT STARTED` |
| `APP3-B02` | `BLOCKED_BY_APP3_G04` |
| `APP3-A01` | `PLANNED — BLOCKED_BY_APP3_D01_AND_APP3_B01` |
| `APP3-D01` placement portion | `UNBLOCKED_BY_G01`, phase design checkpoint still not started |
| `APP3-DB01` | `CONDITIONAL — AWAITING_G02_AND_G04_CONTRIBUTIONS` |

No implementation checkpoint is complete.

## 6.5 `APP3-G02` — Design Template lifecycle and Product archive authority (IMP-D042)

The second APP3 execution checkpoint. Authority, lifecycle formalisation,
dependency reconciliation and a mechanical gate only — **no application source,
schema, migration, OpenAPI operation, generated client, Figma node or Admin/
Storefront UI change**.

Two lifecycle contradictions are closed. Design Template had canonical *states*
but **no transition identifiers**, and the delivered repository fused version
creation with publication (`publishVersion` writes a version *and* flips the
header to `PUBLISHED`), offered no unpublish and no restore, and archived from
any source state. Separately, `APP2-B02` shipped Product archive from `DRAFT`
(`PRODUCT_ARCHIVABLE_STATES = [PRODUCT_DRAFT_STATE]`) while LC-04 authorised only
`PUBLISHED → ARCHIVED` — the inherited `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01`.

### 6.5.1 Machine-checked lifecycle facts

`pnpm check:app3-g02` recomputes each of these against the repository.

| Fact | Value |
|---|---|
| `Template lifecycle id` | `LC-24` |
| `Template aggregate module` | `DESIGN` |
| `Template states` | `DRAFT PUBLISHED ARCHIVED` |
| `Template editable state` | `DRAFT` |
| `Template transition count` | `6` |
| `Template create transition` | `TR-LC24-01` |
| `Template publish transition` | `TR-LC24-02` |
| `Template unpublish transition` | `TR-LC24-03` |
| `Template archive draft transition` | `TR-LC24-04` |
| `Template archive published transition` | `TR-LC24-05` |
| `Template restore transition` | `TR-LC24-06` |
| `Template restore target` | `DRAFT` |
| `Template direct archived to published` | `FORBIDDEN` |
| `Template hard delete in APP3` | `NONE` |
| `Template version mutability` | `IMMUTABLE_FROM_CREATION` |
| `Template draft save behaviour` | `NEW_MONOTONIC_VERSION` |
| `Template published_at write` | `SET_ONCE_NEVER_CLEARED` |
| `Template unpublish scope` | `HEADER_ONLY` |
| `Template public read selection` | `HIGHEST_PUBLISHED_VERSION` |
| `Template clone result` | `INDEPENDENT_DOCUMENT_LINEAGE_ONLY` |
| `APP3 template compatibility` | `EXACT_PRODUCT_SIDE_AREA` |
| `APP3 template many to many` | `NOT_AUTHORIZED` |
| `G02_DB_CONTRIBUTION` | `NONE` |
| `Product lifecycle id` | `LC-04` |
| `Product transition count` | `6` |
| `Product archive draft transition` | `TR-LC04-06` |
| `Product archive published transition` | `TR-LC04-02` |
| `Product unpublish transition` | `TR-LC04-05` |
| `Product archive hard delete` | `NONE` |
| `Product archive cascades to template status` | `NO` |

### 6.5.2 The eight rulings

**PO-01 — aggregate and state owner.** Design Template is a **Design-module**
aggregate; ownership does not move to Catalog. The mutable header owns title and
public metadata, placement scope, lifecycle status, the optimistic-concurrency
token and version ordering. A **Design Template Version is an immutable
store-authored design-document snapshot**. Asset owns binary metadata and
storage; Template owns only the semantic association.

**PO-02 — states.** Exactly `DRAFT | PUBLISHED | ARCHIVED`. No `UNPUBLISHED`,
`EDITING`, `DISABLED` or `DELETED`. `DRAFT` is the only editable state;
`PUBLISHED` is public and immutable through normal editing commands; `ARCHIVED`
is retained, non-public and non-editable.

**PO-03 — transition set.** Formalised as **LC-24** with six stable ids
(`DB3_LIFECYCLE_SPECIFICATIONS.md` §LC-24). No direct `ARCHIVED → PUBLISHED`;
restore always lands in `DRAFT` and republication is separate and guarded. No
hard delete in APP3. Archive and unpublish are distinct. Every transition is
Admin-only, audited and concurrency-protected; an invalid source state fails
**without mutation**; archive and restore require an audit reason, publish and
unpublish do not; status mutation, Audit evidence and any future Outbox
consequence are atomic. This gate implements no Audit or Outbox source.

**PO-04 — versions and publication.** Versions are immutable from creation.
Every save while `DRAFT` writes a new version with the next monotonic number;
`published_at` stays `null` until that exact version is first published, is set
**once** by publish, and is **never cleared or rewritten**. Unpublish changes the
header only. Editing after unpublish creates a new immutable version. Public read
while `PUBLISHED` selects the highest version whose `published_at` is not null. A
Template update never mutates an already-cloned Design Session.

**PO-05 — clone authority.** A customer never receives a live mutable reference
to a Template Version. Clone copies a published version into a deep independent
working Design Session document and persists the source Template and Version
**only** as lineage/audit. Later unpublish, archive, restore or new versions never
mutate the clone. No customer export or download is created.

**PO-06 — APP3 scope and compatibility.** APP3 publishes **area-scoped Templates
only**, requiring the exact `product_id → product_side_id → embroidery_area_id`
chain, all three active under IMP-D041. Drafts may hold an incomplete scope while
being authored but cannot publish until it is complete. Public compatibility is
**exact triple equality**. Global, product-wide, side-wide, wildcard, tag-based
and many-to-many compatibility are **not** APP3 scope, so
**`G02_DB_CONTRIBUTION = NONE`**.

**PO-07 — publication guards (GRD-T01).** Publish and republish require all of:
header `DRAFT`; at least one immutable version; the current highest version valid
under `design-document`; a complete and active scope chain; the document in
bounds for the exact Embroidery Area under `design-engine`; all Template assets
eligible under `APP3-G04`; an authenticated Admin actor; a matching concurrency
token. **No backend checkpoint may implement a reduced publish guard.**

**PO-08 — Product archive reconciliation.** LC-04 gains exactly one transition,
**`TR-LC04-06` `DRAFT → ARCHIVED`**, authorising what `APP2-B02` already ships.
LC-04 is now 6 transitions with `TR-LC04-01/02/03/04/05` unchanged and not
renumbered. Archive is durable catalog retirement, distinct from unpublish; an
archived Product is never public; archive hard-deletes nothing. A published
Template scoped to an archived Product becomes **derived-ineligible without any
cascading Template status mutation**; relist re-evaluates Product publication
readiness. Product archive UI stays outside this gate, and no Product application
code is modified.

### 6.5.3 Database contribution

```text
G02_DB_CONTRIBUTION = NONE
```

Measured: `design_templates` already carries `status` (CHECK
`DRAFT|PUBLISHED|ARCHIVED`), `current_version`, `archived_at` and the nullable
scope FKs; `design_template_versions` already carries `version` and a **nullable**
`published_at` — exactly the shape `TR-LC24-02` sets once and `TR-LC24-03` must
never clear. Exact-triple compatibility needs no relation. `TR-LC04-06` needs no
column either.

`APP3-DB01` still runs, but **only** because `APP3-G01` requires it
(`G01_DB_DISPOSITION = REQUIRES_APP3_DB01`, placement retirement authority).

### 6.5.4 Dependency reconciliation

| Checkpoint | Status after `APP3-G02` |
|---|---|
| `APP3-G01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-G03` | `READY — NOT STARTED` |
| `APP3-G04` | `NOT STARTED` |
| `APP3-P01` | `READY — NOT STARTED` |
| `APP3-P02` | `READY — NOT STARTED` |
| `APP3-DB01` | `REQUIRED — AWAITING_G04_CONTRIBUTION` |
| `APP3-B03` | `BLOCKED_BY_APP3_P01_AND_DB_DISPOSITION` |
| `APP3-B04` | `BLOCKED_BY_APP3_P01_APP3_P02_APP3_G04_AND_DB_DISPOSITION` |
| `APP3-B05` | `BLOCKED_BY_APP3_B04` |
| `APP3-D01` template lifecycle portion | `UNBLOCKED_BY_G02`, checkpoint not started |
| `FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` | `COMPLETE — CLOSED_BY_APP3-G02` |
| `FU-APP2-PRODUCT-ARCHIVE-UI-01` | `DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION` |

No implementation checkpoint is complete.

## 7. Critical end-to-end journey

Admin publishes a template compatible with a published product. A customer starts a 2D session, adds text/image within limits, sees watermark, autosaves, reloads the session, and cannot submit tampered geometry or access private production assets.

## 8. Exit gate

- Canonical design document remains independent of React/canvas library.
- Server validates critical editor constraints.
- Template versions explain existing sessions.
- Mobile critical interactions pass.
- No 3D/download scope appears.
- E2E passes.

## 9. Handoff

APP4/APP5 may associate verified customer/contact and request records with valid design sessions without changing editor ownership. `TR-LC07-03` (`ACTIVE → SUBMITTED`) belongs to APP5's submission transaction and is deliberately not implemented here.

## 10. Status

```text
APP3 = IN PROGRESS — SECOND GATE DELIVERED_FOR_REVIEW
APP3-PRE-IMPLEMENTATION-AUDIT = COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION
APP2-X01-C1 = COMPLETE — REVIEW_ACCEPTED
APP2-X01-C2 = COMPLETE — REVIEW_ACCEPTED
FU-APP3-CLOSURE-FIGMA-BASELINE-01 = COMPLETE — CLOSED_BY_APP2-X01-C1
FU-APP2-CLOSURE-NEXTPHASE-GUARD-01 = COMPLETE — CLOSED_BY_APP2-X01-C2
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_DELIVERED
APP3-G03 = READY — NOT STARTED
FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 = COMPLETE — CLOSED_BY_APP3-G02
every other APP3 checkpoint = NOT STARTED
```

`APP3-G01` locked the seven Product Owner placement rulings as **IMP-D041**
(§6.4), reconciled the dependency map (§6.4.4) and added the mechanical gate
`pnpm check:app3-g01`. It implemented **no** application source, schema,
migration, OpenAPI operation, generated client or Figma node — the gate asserts
that absence rather than assuming it.

The accepted governance baseline is on the canonical `production` branch as of
`APP3-ENTRY-BRANCH-RECONCILIATION` (fast-forward `5c0ba1f` → `82ed3f3`), and
`pnpm quality` passes there. `APP3-G01` is executable.

Human review (2026-08-03) returned `ACCEPTED_WITH_REQUIRED_CORRECTIONS`. The
five required corrections were applied by `APP3-PRE-AUDIT-C1` and are visible in
§6.1 (migration verdict now includes `G01`; `APP3-DB01` terminal semantics and
the `DB-DISPOSITION-RESOLVED` predecessor; the `design-document` /
`design-engine` dependency split) and in audit §H/§O/§P/§Q/§R/§S. Every
substantive finding was upheld; the evidence/governance classification was
corrected because **Commit A was not docs-only** — see audit §R for the approved
`APPROVED_NARROW_GOVERNANCE_DEVIATION` disposition.

> **`FU-APP2-CLOSURE-NEXTPHASE-GUARD-01` = `COMPLETE — CLOSED_BY_APP2-X01-C2`.**
> The closure gate used to reject any `reports/APP3-*.md` by filename prefix,
> which blocked two mandated post-closure governance reports. `APP2-X01-C2`
> replaced it with a commit-graph chronology check: an APP3 report added **after**
> the accepted closure commit `8b5f3b0` passes whatever it is called, one added
> before it still fails. **Future APP3 reports use canonical `APP3-*` names.**
>
> **`FU-APP3-CLOSURE-FIGMA-BASELINE-01` = `COMPLETE — CLOSED_BY_APP2-X01-C1`.**
> The unrelated BRD0 commit `2a5d3bf` grew the Figma registry from 86/86/11 to
> **96/96/13**, drifting an APP2 frozen artifact and taking `pnpm quality` to
> exit 1. `APP2-X01-C1` replaced the global-total freeze with verification of the
> **86-record APP2-owned subset** transcribed from the closure commit `8b5f3b0`:
> unrelated rows may be appended, but removal, mutation, duplication, section
> moves, same-count substitution or registry inconsistency of an owned record
> still fail. `pnpm quality` is green; `APP3-G01` = `READY — NOT STARTED`.

Audit: [`audits/APP3_PRE_IMPLEMENTATION_AUDIT.md`](../audits/APP3_PRE_IMPLEMENTATION_AUDIT.md).
Report: [`reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](../reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md).
