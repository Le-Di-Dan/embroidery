# APP3 — Design Templates and 2D Design Studio

## 1. Outcome

> **Command forms below are historical.** `GOV-Q01` and `GOV-Q01-C1` removed
> every non-global root `package.json` alias, so a `pnpm quality`,
> `pnpm check:*`, `pnpm smoke:*`, `pnpm test:*`, `pnpm e2e*`,
> `pnpm spike:*` or `pnpm bench:*` appearing in a dated record below names the
> alias that existed **when that evidence was recorded**. It is preserved, not
> rewritten. For the current invocation of any of them see
> [`../SCOPED_COMMAND_INDEX.md`](../SCOPED_COMMAND_INDEX.md).

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
| 5a | `APP3-F01` | asset | controlled font acquisition — Inter v4.1 WOFF2 pair, OFL-1.1 licence, provenance and Vietnamese-coverage evidence (§6.9) | 0 | G04 | no | no | no |
| 6 | `APP3-P01` | package | `packages/design-document` — canonical form, JCS + SHA-256, fail-loud `schemaVersion`, document migrations, validation | — | G02, G03, **F01** | no | no | `spike:editor:test` |
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
  enter a production manifest; `node tools/check-spike-boundaries.mjs` enforces it.
- **Performance authority** is `ADR-APP0-001` §6 with the APP0-R01 S/M/L scenes.
  `pnpm --filter @embroidery-spike/design-studio spike:check` runs at any
  checkpoint touching the spike boundary;
  `pnpm --filter @embroidery-spike/design-studio spike:test`
  runs at any checkpoint touching `design-document`, `design-engine` or an
  adapter; **the spike benchmark stays outside the browser-free tier** and is
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
- **Validation is scoped** (`GOV-Q01`,
  [`../VALIDATION_GOVERNANCE.md`](../VALIDATION_GOVERNANCE.md)). Every remaining
  APP3 checkpoint:
  - runs only the validations its own changed files justify, selected from the
    §3 decision table, and names them in its report;
  - **invokes its checker and tests directly** —
    `node tools/check-app3-g0N.mjs`, `node --test tools/check-app3-g0N.test.mjs`
    — and **must not** register **any** script in root `package.json`, whose
    30-script boundary is locked by `GOV-Q01-C1`; a reusable command gets a row
    in [`../SCOPED_COMMAND_INDEX.md`](../SCOPED_COMMAND_INDEX.md) instead;
  - **must not** append its checker to any aggregate command; none exists, and
    none may be created;
  - uses the three global controls (`pnpm format:check`, `pnpm lint`, SonarQube)
    separately when appropriate;
  - re-runs a closed checkpoint's gate only when the change touches that
    checkpoint's owned inputs, and says why.
  The delivered `G01`/`G02`/`G03` evidence is historical and is not rewritten;
  the checkers themselves are unchanged and still runnable.

## 6.3 Open decisions APP3 owns

| Item | Source | Owning gate |
|---|---|---|
| Design-session TTL (`O-008` / `DP-RET-01`) | `12-DECISION-LOG.md`, ADR-DB1-011 | **CLOSED by `APP3-G03` (IMP-D043 PO-06)** — 30 days absolute from `created_at` |
| Anonymous session transport, issuance, rotation, enumeration controls | `09 §2`/`§7`, ADR-DB2-001 | **CLOSED by `APP3-G03` (IMP-D043 PO-01…PO-05)** |
| Autosave **conflict** policy | `ADR-APP0-001` deferred details | **CLOSED by `APP3-G03` (IMP-D043 PO-08)** |
| Autosave **cadence** | `ADR-APP0-001` deferred details | **OPEN — owner `APP3-S11`**, routed by `APP3-G04` §6.7; it must choose the UX cadence under the existing 30 writes/minute ceiling and may not invent a timer here |
| Anonymous rate and concurrency quotas | `09 §7` | **CLOSED by `APP3-G03` (IMP-D043 PO-07)** |
| Document complexity / layer / image limits | `09 §7` | **CLOSED by `APP3-G04` (IMP-D044 PO-08/PO-09)** |
| Template transition identifiers and guards (publish/unpublish/archive/unarchive) | DB3 "Additional lifecycles" — states without `TR-` ids | `APP3-G02` |
| Template↔product compatibility: scope filter or many-to-many | DB2 GAP-08 versus §6 wording | `APP3-G02` |
| Font whitelist and thread-colour mechanics | `05 §4.1`, `ADR-APP0-001` deferred | Font mechanics **CLOSED by `APP3-G04` (IMP-D044 PO-10)**; the concrete registry contents are delivered by `APP3-P01`. Thread colour remains `APP3-G02` scope |
| Editor-safe derivative kind | `ADR-APP0-001` §5 versus `ASSET_DERIVATIVE_KINDS` | **CLOSED by `APP3-G04` (IMP-D044 PO-01)** |
| Customer/template asset intake lanes | `asset-intake.policy.ts` is `CATALOG_MEDIA`-only | **CLOSED by `APP3-G04` (IMP-D044 PO-02…PO-05)** |
| SVG acceptance + sanitizer selection | `ADR-APP2-001` §4 ("future, separately-decided scope"), `ADR-APP0-001` deferred | **CLOSED by `APP3-G04` (IMP-D044 PO-04/PO-05)** — acceptance and the mandatory restriction set; the concrete sanitizer library stays an `APP3-P01`/`B06` implementation choice |
| Media dimensions metadata (`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`) | APP2 follow-up, activated | **AUTHORITY LOCKED by `APP3-G04` (IMP-D044 PO-07/PO-12)**; the follow-up itself stays open — final owner `APP3-B02` |
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

`node tools/check-app3-g01.mjs` recomputes each of these against the repository. Do not
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
> when `APP3-G01` delivered*, and `node tools/check-app3-g01.mjs` asserts these exact
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

`node tools/check-app3-g02.mjs` recomputes each of these against the repository.

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

> **Dated record — superseded by §6.6.4.** This table states the map *as it stood
> when `APP3-G02` delivered*, and `node tools/check-app3-g02.mjs` asserts these exact
> values, so it is not rewritten. Human review has since accepted G02 and
> `APP3-G03` has delivered; §6.6.4 carries the current statuses.

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

## 6.6 `APP3-G03` — Anonymous Design Session ownership, transport and retention authority (IMP-D043)

The third APP3 execution checkpoint. Authority, retention reconciliation,
dependency reconciliation and a mechanical gate only — **no Session API, cookie,
middleware, worker job, migration, generated contract, Figma node or UI change**.

The Design Session repository and LC-07 already existed, but nothing said *how an
anonymous visitor proves ownership*. `session_secret_hash` was `NOT NULL` and
`UNIQUE` with no rule for what fills it, `findActiveBySecretHash` could be read as
authorising on the secret alone, `expires_at` was `NOT NULL` with a deferred
duration (`O-008` / `DP-RET-01`), and the retention documents modelled a
**sliding** `last_activity_at + TTL` window. A backend checkpoint starting from
that state would have had to invent an identity model.

### 6.6.1 Machine-checked session facts

`node tools/check-app3-g03.mjs` recomputes each of these against the repository.

| Fact | Value |
|---|---|
| `Session ownership requirement` | `SESSION_ID_AND_SECRET` |
| `Session public handle` | `design_sessions.id` |
| `Session persisted verifier` | `session_secret_hash` |
| `Session id alone authorizes` | `NO` |
| `Session secret alone authorizes` | `NO` |
| `Session secret bytes` | `32` |
| `Session secret source` | `SERVER_CSPRNG` |
| `Session secret encoding` | `BASE64URL_UNPADDED` |
| `Session secret digest` | `HMAC_SHA256_RUNTIME_PEPPER` |
| `Session secret comparison` | `CONSTANT_TIME` |
| `Session secret persistence` | `DIGEST_ONLY` |
| `Session secret browser storage` | `FORBIDDEN` |
| `Session secret url transport` | `FORBIDDEN` |
| `Session secret json transport` | `FORBIDDEN` |
| `Session secret log transport` | `FORBIDDEN` |
| `Session pepper absent behaviour` | `FAIL_LOUDLY_NO_FALLBACK` |
| `Session cookie name` | `__Host-nettheu_ds_<session-id>` |
| `Session cookie value` | `RAW_SECRET_ONLY` |
| `Session cookie same site` | `Lax` |
| `Session cookie path` | `/` |
| `Session cookie domain` | `NONE` |
| `Session cookie http only` | `REQUIRED` |
| `Session cookie secure production` | `REQUIRED` |
| `Session cookie scope` | `ONE_COOKIE_PER_SESSION` |
| `Session cookie max age bound` | `NOT_BEYOND_EXPIRES_AT` |
| `Session cookie removal` | `EXPIRY_INVALIDATION_AND_FAILED_AUTHORIZATION` |
| `Session bootstrap response` | `PUBLIC_ID_ONLY` |
| `Session client persisted handle` | `NON_SECRET_ID_ONLY` |
| `Session bearer transport` | `FORBIDDEN` |
| `Session staff cookie reuse` | `FORBIDDEN` |
| `Studio route` | `/san-pham/[slug]/thiet-ke` |
| `Session rotation trigger` | `AUTHENTICATED_RESUME` |
| `Session rotation write` | `COMPARE_AND_SWAP` |
| `Session rotation winners` | `1` |
| `Session rotation ttl effect` | `NONE` |
| `Session previous secret grace` | `NONE` |
| `Session autosave rotation` | `NONE` |
| `Session recovery credential in APP3` | `NONE` |
| `Session origin policy` | `EXACT_ALLOWLIST` |
| `Session fetch metadata policy` | `SEC_FETCH_SITE_ALLOWLIST` |
| `Session credentialed cors` | `DISABLED` |
| `Session absent origin on mutation` | `REJECTED` |
| `Session same site sole defence` | `FORBIDDEN` |
| `Session error disclosure` | `SINGLE_SAFE_SHAPE` |
| `Session existence disclosure` | `NONE` |
| `SESSION_TTL_DAYS` | `30` |
| `Session ttl basis` | `ABSOLUTE_FROM_CREATED_AT` |
| `Session ttl sliding` | `NONE` |
| `Session expires_at write` | `SET_AT_CREATION_NEVER_EXTENDED` |
| `Session expiry transition` | `TR-LC07-04` |
| `Session expiry sweep interval` | `HOURLY` |
| `Session purge transition` | `TR-LC07-05` |
| `Session purge grace hours` | `24` |
| `Session purge scope` | `EXCLUSIVELY_OWNED_SESSION_FAMILY` |
| `Session purge shared authority` | `NEVER_DELETED` |
| `Session restore after expiry` | `NONE` |
| `Session submitted retention owner` | `APP5` |
| `Session creation rate per hour` | `5` |
| `Session creation burst per minute` | `2` |
| `Session read rate per minute` | `60` |
| `Session authorization failure rate` | `10` |
| `Session authorization failure window minutes` | `15` |
| `Session mutation rate per minute` | `30` |
| `Session concurrent mutations` | `1` |
| `Session rate limit key` | `EPHEMERAL_NETWORK_HMAC_ROTATING_SALT` |
| `Session rate limit key is identity` | `NO` |
| `Session durable browser identity` | `NONE` |
| `Session browser session quota` | `NONE` |
| `Session raw ip persistence` | `NONE` |
| `Session mutation revision requirement` | `EXPECTED_REVISION` |
| `Session revision column` | `autosave_revision` |
| `Session stale write result` | `STALE_WRITE` |
| `Session stale write mutation` | `NONE` |
| `Session retry policy` | `REFETCH_BEFORE_RETRY` |
| `Session blind replay loop` | `FORBIDDEN` |
| `Session idempotency table` | `NONE` |
| `Session customer identity in APP3` | `NONE` |
| `Session contact collection in APP3` | `NONE` |
| `Session ownership transfer owner` | `APP5` |
| `Session submit transition owner` | `APP5` |
| `G03_DB_CONTRIBUTION` | `NONE` |

### 6.6.2 The ten rulings

**PO-01 — anonymous ownership.** Ownership requires **both** a public session id
and a high-entropy session secret. `design_sessions.id` is the public opaque
handle and `session_secret_hash` is the persisted verifier; **neither authorizes
alone**. The raw secret is never persisted, logged, placed in a URL, query string
or fragment, returned in JSON, stored in `localStorage`/`sessionStorage` or
serialized into the document. No Customer, email, phone, name, device fingerprint
or anonymous-user aggregate is created. Every authorized read and write requires
the exact id **plus** a valid secret. Missing, expired and unauthorized sessions
share **one** safe external error shape.

> **Reconciliation.** `DesignSessionRepository.findActiveBySecretHash` is a
> persistence lookup, **not** an authorization decision. `APP3-B07` must resolve
> the session by exact id and then verify the secret; it may not authorize on a
> hash lookup alone.

**PO-02 — secret generation and verification.** At creation the server generates
**32 cryptographically secure random bytes**, encodes them as unpadded
base64url, and persists only `HMAC-SHA-256(server pepper, raw secret)`. The
pepper comes from runtime secret configuration. Browser `crypto.subtle` is not
used. No password hash is required for a uniformly random 256-bit secret. Digests
are compared in **constant time**. Secret and digest never enter logs, Audit
payloads, telemetry or exceptions. A missing pepper **fails loudly**; there is no
fallback and no generated default.

**PO-03 — browser transport.** The raw secret is transported **only** in a
per-session cookie named `__Host-nettheu_ds_<session-id>`, with production
attributes `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, **no** `Domain`, and
`Max-Age` never beyond `expires_at`. Local development may omit `Secure` only
under the explicit dev transport policy. The cookie contains **only** the raw
secret. Bootstrap returns the **non-secret** session id, and the client may
persist only that id as a namespaced resume handle. The Studio route stays
`/san-pham/[slug]/thiet-ke`. Session APIs address the public id and the server
selects the matching cookie; multiple sessions use separate cookies. Cookie
removal is **required** on expiry, invalidation and failed authorization for that
exact session. Forbidden: `Authorization: Bearer <raw secret>`, the secret in a
path, query or fragment, one shared cookie for every session, the APP1 staff
cookie, and any browser storage of the raw secret.

**PO-04 — issuance and rotation.** Creation issues one secret and one cookie. A
**successful authenticated** resume/bootstrap rotates the secret **atomically**:
verify the current id and secret, generate a new 32-byte secret, replace
`session_secret_hash` under **compare-and-swap**, return `Set-Cookie` for the new
secret, and invalidate the old secret **immediately**. Ordinary autosave does not
rotate. Exactly **one** concurrent resume rotation succeeds. Rotation **never**
extends TTL. There is **no previous-secret grace window** and no recovery email,
code or account link in APP3.

**PO-05 — CSRF, origin and enumeration controls.** Every state-changing request
requires an exact allowed `Origin`, an allowed `Sec-Fetch-Site`, a matching
host-only session cookie and the expected optimistic-concurrency revision.
Credentialed cross-origin CORS is **disabled**. A missing or disallowed `Origin`
on a mutation fails. `SameSite` alone is **not** a sufficient defence. Session
ids follow the existing high-entropy identifier authority. Unauthorized, missing,
expired and wrong-chain requests share **one** safe external status, code and
message; no response reveals whether a session id exists; no secret, digest or
raw document appears in an authorization error; repeated failures are
rate-limited.

**PO-06 — retention and expiry.** `SESSION_TTL = 30 days`, **absolute from
`created_at`**. Reads, resume, rotation and autosave do **not** slide or extend
it; `expires_at` is fixed at creation and cookie expiry never exceeds it. At
expiry the session moves `ACTIVE → EXPIRED` under **`TR-LC07-04`**, and an
expired session rejects all access. An **hourly** worker claims eligible rows
safely. An `EXPIRED` session is hard-deleted under **`TR-LC07-05`** after a
**24-hour purge grace**. Purge deletes only the Session family owned exclusively
by that session, including the private associations and derivatives later defined
by `APP3-G04`; shared Product, Template, Catalog Asset and historical authority
are **never** deleted. `SUBMITTED` retention belongs to **APP5** and is not
purged by APP3. There is **no restore after expiry**.

> This closes `O-008` and the `design_sessions` half of `DP-RET-01`, and
> **supersedes** the earlier sliding `last_activity_at + TTL` direction recorded
> in `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md` and
> `DB10_DATA_DURABILITY_MATRIX.md`. `last_activity_at` and `IDX-085` remain — the
> sweep still orders by activity — but they no longer determine expiry.

**PO-07 — rate and concurrency controls.** APP3 creates **no durable browser
identity** and **no cross-session browser quota**. Locked limits: session creation
**5/hour** per ephemeral network key with a burst of **2/minute**;
bootstrap/resume/read **60/minute** per ephemeral network key; authorization
failures **10 per 15 minutes** per ephemeral network key **and** session id;
authorized mutations **30/minute** per session id; and a maximum of **one
in-flight mutation per session**. The network key is an **ephemeral HMAC of
normalized source network data with a rotating runtime salt**; raw IP is **not**
persisted in Design Session tables. The rate-limit key is **not** ownership or
customer identity. There is no "N active sessions per browser" rule.
Rate-limit responses reveal no session existence, and rate limiting **never**
replaces credential or revision checks.

**PO-08 — autosave conflict policy.** Every mutation carries the expected current
revision (`autosave_revision`). A matching revision applies **one atomic update
and increments once**. A stale revision returns **`STALE_WRITE`** with current
revision metadata only and **does not mutate**. Under network ambiguity the
client **refetches before retrying**; there is no blind replay loop. No
idempotency-key table and no write log is added — a duplicate retry carrying the
old revision fails `STALE_WRITE` and therefore cannot increment twice.
Conflict/reload UX is owned by `APP3-S11`.

**PO-09 — APP5 boundary.** APP3 anonymous sessions do not create Customer
identity, collect email or phone, attach to staff auth, submit a custom request or
transfer ownership. **APP5 exclusively owns `TR-LC07-03`**, contact collection,
Customer association and anonymous-to-customer transfer.

**PO-10 — database contribution.** The existing schema already provides every
field this authority needs. **Measured** on `design_sessions`:
`session_secret_hash` (`text NOT NULL`, `uq_design_sessions__session_secret_hash`),
`expires_at` (`timestamptz NOT NULL`), `created_at` (`timestamptz NOT NULL`),
`status` (`text NOT NULL` with `ck_design_sessions__status_allowed` over LC-07)
and `autosave_revision` (`integer NOT NULL`, `>= 0`). No durable browser id,
previous-secret column, sliding-expiry field, idempotency table or recovery
credential is required, and no customer, email, phone, IP or fingerprint column
exists. Therefore **`G03_DB_CONTRIBUTION = NONE`**.

### 6.6.3 Database contribution

```text
G03_DB_CONTRIBUTION = NONE
```

`APP3-DB01` still runs, but **only** because `APP3-G01` requires it
(`G01_DB_DISPOSITION = REQUIRES_APP3_DB01`, placement retirement authority).
Neither `APP3-G02` nor `APP3-G03` contributes a column.

### 6.6.4 Dependency reconciliation

> **Why this table has a portion column.** `APP3-B07`, `APP3-B08` and
> `APP3-W01` are each *partly* unblocked: this gate settles their identity,
> concurrency and expiry authority while other predecessors still block the
> checkpoint as a whole. One status per checkpoint could only be recorded by
> losing one of those two facts.

| Checkpoint | Portion | Status after `APP3-G03` |
|---|---|---|
| `APP3-G01` | whole checkpoint | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-G04` | whole checkpoint | `READY — NOT STARTED` |
| `APP3-P01` | whole checkpoint | `READY — NOT STARTED` |
| `APP3-P02` | whole checkpoint | `READY — NOT STARTED` |
| `APP3-DB01` | whole checkpoint | `REQUIRED — AWAITING_G04_CONTRIBUTION` |
| `APP3-B07` | identity and transport | `UNBLOCKED_BY_G03` |
| `APP3-B07` | overall | `BLOCKED_BY_APP3_P01_APP3_P02_AND_DB_DISPOSITION` |
| `APP3-B08` | session concurrency | `UNBLOCKED_BY_G03` |
| `APP3-B08` | overall | `BLOCKED_BY_APP3_P01_APP3_P02_AND_DB_DISPOSITION` |
| `APP3-W01` | expiry authority | `UNBLOCKED_BY_G03` |
| `APP3-W01` | overall | `BLOCKED_BY_DB_DISPOSITION` |
| `APP3-S11` | conflict/reload UX authority | `UNBLOCKED_BY_G03` — checkpoint not started |
| `O-008` | session TTL | `CLOSED_BY_IMP-D043` |
| `DP-RET-01` | design_sessions | `CLOSED_BY_IMP-D043` |

> **Disclosed tooling defect — `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01`.**
> `check-app3-g02.mjs` reads §6.5.4 with the literal end marker `## 7. `
> rather than "the next heading", which was correct only while §6.5.4 was the
> last subsection before §7. It is not weakened or edited here — `tools/` outside
> `check-app3-g03*` is outside this checkpoint's allowed files — and the
> three-column table above is not a workaround for it: G02 still reads its own
> frozen §6.5.4 rows correctly. The next checkpoint authorized to touch that file
> should bound it by the next heading, as `check-app3-g01.mjs` already does.
>
> **Closed by `APP3-G04` (§9).** `check-app3-g02.mjs` now bounds §6.5.4 at the
> next heading of equal or higher level.
> `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01` = `COMPLETE — CLOSED_BY_APP3-G04`.
> The measured detail worth keeping: the retired literal bound was in practice
> ended by the sentence above that *quotes* the marker, not by §7 — so the block
> stopped before §6.6.4 by accident, which is why no wrong value was ever
> produced. A guard that is correct only because of where its own disclosure sits
> is not a guard.

No implementation checkpoint is complete.

**Remaining open scope this gate did not rule.** `IMP-D043` covers rate and
concurrency quotas, not **autosave cadence** and not **document complexity, layer
or image limits**. Both stay open in §6.3 with no new owner invented here.

## 6.7 `APP3-G04` — Editor-safe media, asset eligibility and complexity authority (IMP-D044)

The fourth APP3 execution checkpoint, delivered under a **manual intervention
directive** after the first attempt stopped at `FAILED — MANUAL INTERVENTION
REQUIRED`. Authority, dependency reconciliation and a mechanical gate only — **no
upload API, media delivery API, worker processor, migration, generated contract,
Studio package, Figma node, Admin UI or Storefront UI**.

The first attempt refused to record the ruling as written. Its PO-12 asserted
that the schema already carried derivative dimensions; the measured schema
carries none, so the ruling could not be locked without encoding a false fact as
a machine-checked one. §6.7.5 records that measurement, and the Product Owner
replaced PO-12 rather than the measurement.

### 6.7.1 Machine-checked media facts

`node tools/check-app3-g04.mjs` recomputes each of these against the repository.
The third column is a boundary note for the reader; only the first two columns
are parsed.

| Fact | Value | Boundary |
|---|---|---|
| `Editor-safe derivative kind` | `NORMALIZED` | an existing kind, **not** a new enum value |
| `New editor derivative kinds` | `NONE` | `EDITOR_SAFE`/`STUDIO_PREVIEW`/`DESIGN_PREVIEW`/`SESSION_PREVIEW` are not authorized |
| `PREVIEW_WATERMARKED studio eligibility` | `NEVER` | the watermark is baked into its bytes |
| `CATALOG_PREVIEW studio eligibility` | `NEVER` | store marketing media, never editor media |
| `Original studio eligibility` | `NEVER` | the private original never reaches the editor |
| `Derivative kind alone grants access` | `NO` | lane, association, owner state and operation all apply |
| `Processing profiles` | `SIDE_BACKGROUND TEMPLATE_ASSET SESSION_UPLOAD` | policy identifiers |
| `Processing profile persistence` | `APPLICATION_POLICY_NOT_DB_ENUM` | never a persisted enum |
| `Processing profile column` | `NONE` | no column is added for a profile |
| `Side background source lane` | `CATALOG_MEDIA` | store-authored |
| `Side background association` | `product_sides.background_asset_id` | the only canonical edge |
| `Side background accepted sources` | `JPEG PNG WEBP` | raster only |
| `Side background svg` | `REJECTED` | no anonymous or public SVG surface |
| `Side background delivery checkpoint` | `APP3-B02` | contextual, not generic |
| `Side background delivery context` | `PUBLISHED_PRODUCT_AND_ACTIVE_SIDE` | archived and retired never deliver |
| `Template asset actor` | `ADMIN` | authenticated staff only |
| `Template asset source lane` | `TEMPLATE_SOURCE` | private originals |
| `Template asset accepted sources` | `JPEG PNG WEBP SVG` | SVG only on this lane |
| `Template asset svg sanitization` | `MANDATORY_SERVER_SIDE` | never client-side, never optional |
| `Template asset svg original to studio` | `NEVER` | only the sanitized derivative |
| `Template publication requires eligible derivative` | `YES` | every referenced asset |
| `Session upload actor` | `ANONYMOUS_SESSION_CREDENTIAL` | the IMP-D043 pair |
| `Session upload source lane` | `CUSTOMER_UPLOAD_CUSTOMER_PRIVATE` | private by default |
| `Session upload accepted sources` | `JPEG PNG WEBP` | raster only |
| `Session upload svg` | `REJECTED_IN_APP3` | no anonymous SVG intake |
| `Session upload visibility` | `PRIVATE_SESSION_OWNED` | one owning session |
| `Session upload reuse as shared media` | `FORBIDDEN` | never promoted to Product/Template/Catalog |
| `Delivery classes` | `3` | side background, published Template asset, Session upload |
| `Generic public asset endpoint` | `NONE` | no `GET /assets/:id` |
| `Storage key in api response` | `FORBIDDEN` | no bucket, key or direct object URL |
| `Object storage url as document authority` | `FORBIDDEN` | never durable document state |
| `Session private delivery cache` | `PRIVATE_NO_STORE` | never a shared cache |
| `Session private delivery credential` | `REQUIRED_EVERY_REQUEST` | id plus per-session cookie |
| `Staff auth for storefront delivery` | `FORBIDDEN` | APP1 staff auth stays Admin-only |
| `secure_access_grants change in APP3` | `NONE` | no purpose value, no schema extension |
| `Contextual reference grants sibling derivative` | `NO` | one reference is not blanket asset access |
| `Studio dimension fields` | `width_px height_px media_type byte_size` | the mandatory quartet |
| `Dimension authority table` | `asset_derivatives` | canonical runtime state |
| `Inspection detail runtime authority` | `NEVER` | append-only evidence only |
| `Source asset metadata as derivative metadata` | `FORBIDDEN` | `assets.mime_type`/`assets.size_bytes` describe the source binary |
| `Missing dimension result` | `INELIGIBLE_NOT_GUESSED` | never inferred, never fabricated |
| `Raster dimension source` | `INSPECTED_DECODED_IMAGE` | measured, not declared |
| `Svg dimension source` | `BOUNDED_VIEWBOX` | of the sanitized output |
| `Svg width height without viewbox` | `INSUFFICIENT` | attributes alone never qualify |
| `Placement scale basis` | `INTRINSIC_DIMENSIONS_AND_PX_PER_MM` | from the selected Product Side |
| `Object storage read on document write` | `FORBIDDEN` | validation reads canonical metadata |
| `Raster upload max bytes` | `10485760` | 10 MiB |
| `Raster max width px` | `4096` | intrinsic |
| `Raster max height px` | `4096` | intrinsic |
| `Raster max decoded pixels` | `16777216` | per asset |
| `Admin svg max bytes` | `1048576` | 1 MiB source |
| `Sanitized svg max nodes` | `10000` | element/node count |
| `Sanitized svg max path characters` | `1000000` | path data |
| `Compressed size overrides decoded limit` | `NO` | decompression bombs are rejected |
| `Document max serialized bytes` | `524288` | 512 KiB canonical document |
| `Document max elements` | `100` | total elements/layers |
| `Document max image elements` | `20` | |
| `Document max text elements` | `80` | |
| `Document max unique assets` | `20` | unique referenced assets |
| `Document max group depth` | `8` | nesting |
| `Document max characters per text element` | `500` | |
| `Document max total text characters` | `5000` | |
| `Document max decoded pixels` | `33554432` | across unique referenced image assets |
| `Document limit enforcement` | `SERVER_SIDE` | `design-document` + `design-engine` |
| `Document client side checks` | `EARLY_FEEDBACK_ONLY` | never the authority |
| `Document partial save on rejection` | `NONE` | rejected documents are not partly saved |
| `Hidden locked offcanvas elements count` | `YES` | visibility does not exempt |
| `Repeated asset reference counting` | `ONCE_FOR_ASSET_BUDGETS_EACH_FOR_ELEMENTS` | |
| `Runtime overlay elements count` | `NO` | they are not serialized elements |
| `Silent limit increase` | `FORBIDDEN` | no checkpoint may raise a value quietly |
| `Document font reference` | `fontId` | never a CSS family, URL or bytes |
| `Font registry owner` | `SERVER_VERSIONED_REGISTRY` | |
| `Font registry delivery checkpoint` | `APP3-P01` | before publication or Session writes |
| `Remote runtime font url` | `FORBIDDEN` | |
| `User uploaded font` | `FORBIDDEN` | |
| `Template embedded font bytes` | `FORBIDDEN` | |
| `Unknown fontId` | `VALIDATION_FAILURE` | never a silent fallback |
| `Font asset budget consumption` | `NONE` | fonts are not document assets |
| `Missing font substitution` | `NEVER_SILENT_GEOMETRY_CHANGE` | |
| `Watermark in editor-safe bytes` | `NEVER` | runtime only |
| `Watermark serialization` | `NEVER` | never a document element |
| `Export or download surface` | `NONE` | |
| `G04_DB_CONTRIBUTION` | `REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA` | |
| `Derivative metadata columns` | `width_px height_px media_type byte_size` | on `asset_derivatives` |
| `Derivative metadata nullability` | `NULLABLE_ALL_OR_NONE` | |
| `Derivative metadata initial not null` | `NO` | historical rows stay representable |
| `Derivative metadata backfill` | `NOT_REQUIRED_FOR_APP3_ENTRY` | |
| `Derivative metadata fabrication` | `FORBIDDEN` | |
| `Derivative metadata write timing` | `ATOMIC_WITH_READY` | |
| `Forbidden derivative columns` | `INSPECTION_REF PROFILE_ENUM GRANT_PURPOSE` | |

### 6.7.2 The twelve rulings

**PO-01 — canonical editor-safe derivative.** APP3 reuses the existing derivative
kind `NORMALIZED` as its **sole** editor-safe kind, and authorizes **no** new
enum value — not `EDITOR_SAFE`, `STUDIO_PREVIEW`, `DESIGN_PREVIEW` or
`SESSION_PREVIEW`. An editor-safe derivative is browser-decodable,
orientation-normalized, metadata-stripped, dimension-bounded, of known intrinsic
size and approved media type, inspection-clean, safe for its exact source lane,
never an original and never watermark-baked. `PREVIEW_WATERMARKED` is **never**
Studio source because its watermark is baked into the bytes; `CATALOG_PREVIEW` is
**never** Studio source because it is store marketing media, CHECK-forbidden from
watermarking and not editor media. Derivative kind alone **never** grants access:
eligibility also requires the correct source lane, association, owner state and
contextual delivery operation.

**PO-02 — processing profiles without a database enum.** The one kind is produced
under three profiles — `SIDE_BACKGROUND`, `TEMPLATE_ASSET` and `SESSION_UPLOAD`.
These are **processing-policy identifiers, not database derivative kinds**: they
belong to future worker/application configuration and are **not** persisted as an
enum or a schema column by this gate. A profile controls the accepted source
type, maximum size, output media type, intrinsic-dimension rules and delivery
eligibility.

**PO-03 — side-background profile.** Source lane `CATALOG_MEDIA`; canonical
association `product_sides.background_asset_id`; accepted sources JPEG, PNG and
WebP with **SVG rejected**; output a raster derivative in JPEG, PNG or WebP
according to transparency and quality policy. Eligibility requires Asset
inspection CLEAN, the derivative READY, intrinsic width and height present, a
published Product, an active Product Side, the side belonging to the addressed
Product, and `background_asset_id` matching the delivered Asset. Delivery belongs
to `APP3-B02` and is public **only** through Product/Side context — it is not a
generic public Asset endpoint. Originals, archived Products, retired Sides and
missing dimensions are never delivered.

**PO-04 — Template asset profile.** Actor: authenticated **Admin**. Source lane
`TEMPLATE_SOURCE`. Accepted sources JPEG, PNG, WebP and SVG. SVG is accepted
**only** for Admin-authored Template assets and **only** after mandatory
server-side sanitization, which must reject or remove at least: `script`,
event-handler attributes, `foreignObject`, external URLs, remote fonts, embedded
HTML, `data:`/`blob:`/`javascript:` URLs, animation, filters outside the approved
subset, unbounded path/node complexity, and a missing or invalid
`viewBox`/dimensions. The sanitized derivative must be **self-contained**, and the
original SVG is **never** sent to the Studio. A Template may publish only when
every referenced asset has an eligible READY derivative under this profile.

**PO-05 — anonymous Session upload profile.** Actor: a valid anonymous Design
Session credential from IMP-D043. Source lane `CUSTOMER_UPLOAD` /
`CUSTOMER_PRIVATE`. Accepted sources JPEG, PNG and WebP; **SVG is rejected in
APP3** — there is no anonymous SVG intake. The upload is owned by exactly one
active Design Session, its derivative stays **private**, and it must not become
Product, Template or Catalog media by reuse. Expiry and purge follow the Session
family rules of IMP-D043. A Session upload never creates Customer identity and
never survives by being silently promoted to shared authority.

**PO-06 — delivery boundaries.** Exactly three delivery classes exist: the side
background, delivered publicly through Product + Side authority; the published
Template asset, delivered publicly through Published Template + Version
authority; and the Session upload, delivered privately through Session id plus a
matching per-session cookie. There is **no** generic `GET /assets/:id` public
endpoint. No API response carries an object-storage key or a private original
URL, and no direct object-storage URL is durable document authority. Public
delivery may use immutable cache validators; Session-private delivery is
`private, no-store` and requires the G03 credential on **every** request. APP1
staff auth is never used for Storefront delivery. APP3 introduces no persistent
`secure_access_grants` purpose or schema extension. A contextual stream or
reference is **not** permission to access another derivative of the same Asset.

**PO-07 — intrinsic dimensions.** Every editor-safe derivative eligible for the
Studio must expose `width_px`, `height_px`, `media_type` and `byte_size` before a
Template or Session document may reference it. Raster dimensions come from the
inspected decoded image; sanitized-SVG dimensions come from a valid bounded
`viewBox`, and `width`/`height` attributes without a valid `viewBox` are
**insufficient**. Missing, zero, negative or contradictory dimensions make the
derivative ineligible. The Studio **never guesses** dimensions. Placement scale
begins from these intrinsic dimensions and the selected Product Side
`px_per_mm`. The public or authorized derivative contract exposes dimensions
without exposing storage keys or originals.

**PO-08 — upload and decoded-image limits.** Locked APP3 source limits: raster
upload **10 MiB** maximum; raster intrinsic width **4096 px** and height
**4096 px** maximum; **16,777,216** decoded pixels maximum per asset; Admin SVG
source **1 MiB** maximum; sanitized SVG **10,000** elements/nodes maximum; and
sanitized SVG **1,000,000** path-data characters maximum. A file exceeding a
limit is rejected before it becomes document-eligible. Compressed byte size
**never** overrides the decoded-pixel limit, and image headers and decoders must
be protected against decompression bombs.

**PO-09 — document and element complexity limits.** One Template Version or
Design Session document is bounded at: **512 KiB** serialized canonical document;
**100** total elements/layers; **20** image elements; **80** text elements; **20**
unique referenced assets; group nesting depth **8**; **500** characters per text
element; **5,000** total text characters; and **33,554,432** decoded pixels across
unique referenced image assets. A rejected document is **not partially saved**.
Limits are checked server-side through `design-document` and `design-engine`;
client checks are early feedback only. Hidden, locked and off-canvas elements
still count. Repeated references to one Asset count **once** toward the
unique-asset and decoded-pixel totals, while each image element counts toward the
image-element total. Watermark, runtime handles and selection overlays never
count, because they are not serialized document elements. No checkpoint may
silently raise these values.

**PO-10 — font allowlist mechanics.** Documents store a `fontId`, never an
arbitrary CSS `font-family`, URL or binary font data. A server-owned **versioned
font registry** maps each `fontId` to an approved family, approved styles and
weights, a bundled or controlled WOFF2 asset, a SHA-256 integrity value, licence
metadata, Vietnamese glyph coverage and a fallback policy. There is no remote
runtime font URL, no user-uploaded font and no Template-embedded font bytes; an
unknown `fontId` fails validation. The initial concrete registry is delivered by
`APP3-P01` before Template publication or Session write APIs, and `APP3-D01`
selects only from that registry. Font files are not Design document assets and do
not consume the 20 unique referenced-asset budget. A missing font never falls back
silently to a geometry-changing substitute.

**PO-11 — watermark separation.** An editor-safe derivative **never** contains the
APP3 watermark. The Studio watermark is runtime-generated, topmost,
non-selectable, non-deletable, not serialized, opaque and free of raw PII, and
regenerated on load. `PREVIEW_WATERMARKED` remains outside Studio source
eligibility, and no export or download surface is created.

**PO-12 — canonical derivative metadata and database contribution.** *(Replaced
by the manual intervention directive; the superseded text is preserved in §6.7.5.)*
Every derivative row may carry canonical output metadata — `width_px`,
`height_px`, `media_type` and `byte_size` — describing the derivative output
represented by that exact `asset_derivatives` row. They **do not** describe the
source Asset: `assets.mime_type` and `assets.size_bytes` remain source-binary
metadata and are never substituted for derivative metadata, and
`asset_inspections.detail` remains **append-only inspection evidence and is never
runtime state authority**. The canonical owner is `asset_derivatives`. Therefore
`G04_DB_CONTRIBUTION = REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA`, and this
gate records that authority **without implementing the migration**.

### 6.7.3 Database contribution

```text
G04_DB_CONTRIBUTION = REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA
```

`APP3-DB01` now owns exactly two contribution groups:

1. Product Side / Embroidery Area retirement, replacement and stable-code
   authority from `APP3-G01`.
2. Canonical derivative metadata on `asset_derivatives` from `APP3-G04`.

> **`G01_DB_DISPOSITION` relabel, not a change.** §6.4.1 records
> `REQUIRES_APP3_DB01` and `check-app3-g01.mjs` asserts that exact string; the
> longer `REQUIRES_APP3_DB01_PLACEMENT_RETIREMENT_AND_STABLE_CODE` used in §10
> names the *same* G01 contribution and exists only to tell the two groups apart
> now that `APP3-DB01` carries two. G01's scope is untouched.

**The locked `APP3-DB01` derivative schema contract.** `APP3-DB01` must add
`width_px`, `height_px`, `media_type` and `byte_size` to `asset_derivatives`
using repository-native types chosen after inspecting existing conventions, with
these semantics: `width_px` and `height_px` positive integers when present;
`media_type` a non-empty canonical MIME type when present; `byte_size` a positive
integer or bigint when present. An **all-or-none** invariant applies: either all
four are null or all four are non-null, with positive-value checks on the
non-null case.

The four columns are deliberately **not** globally `NOT NULL` in the initial
migration, because existing `THUMBNAIL` and `CATALOG_PREVIEW` rows may hold no
canonical metadata, no editor-safe row exists yet, a migration must not call
object storage, historical rows without deterministic metadata must stay
representable, and missing metadata makes a derivative **ineligible rather than
fabricated**.

`APP3-DB01` must not add `inspection_detail_id`, `current_inspection_id`, a
profile enum column, an editor derivative kind, a generic public-asset flag or a
grant-purpose column. No index is required solely for these four columns unless
measured access-path evidence in `APP3-DB01` proves one necessary.

**Write and eligibility semantics.** A worker or application flow may create a
derivative row before processing with the metadata quartet null. A derivative
becomes Studio-eligible only when its status is READY, its kind is the
editor-safe one, `width_px` and `height_px` are present and positive,
`media_type` is present and approved for the processing profile, `byte_size` is
present and positive, the inspection, source-lane and profile rules of this gate
pass, and the contextual owner and association rules pass. The transition to
READY persists the quartet **atomically** with the completed derivative state.
The Studio never infers or lazily guesses dimensions, and document validation
never queries object storage on a Template or Session document write — it reads
canonical metadata from `asset_derivatives`.

**Existing-row and backfill policy.** No APP3 grandfathering is required.
`APP3-DB01` adds the nullable quartet and its checks, leaves historical rows null
where no deterministic canonical value is available, never fabricates a value,
never parses arbitrary inspection history as runtime authority, and is not
blocked by old non-Studio derivatives lacking metadata. A later bounded backfill
may populate a historical derivative **only** when the value can be
deterministically proven from authoritative object metadata or from exact
inspection evidence linked to that derivative. Such a backfill is not required
for APP3 entry.

### 6.7.4 Dependency reconciliation

> **Why the portion labels carry a `post-G04` suffix.** `check-app3-g03.mjs`
> bounds §6.6.4 with the literal `## 7.` marker, so it reads this table too, and
> a repeated `id :: portion` key would silently overwrite the status G03
> asserts. The suffix keeps the two tables' keys disjoint.
> `tools/` outside the G02 and G04 gates is outside this checkpoint's allowed
> files, so the defect is disclosed rather than edited:
> `FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` = `COMPLETE — CLOSED_BY_APP3-DB01`
> (§6.8.5); `check-app3-g03.mjs` now bounds §6.6.4 at the next heading of equal
> or higher level, so the `post-G04` suffix is belt and braces rather than the
> only thing keeping the two tables apart.
>
> **The `APP3-DB01` row above moved from `REQUIRED — READY_FOR_EXECUTION` to
> `COMPLETE — REVIEW_DELIVERED` when migration 0034 landed.** It is the one row
> in this table that is *supposed* to change: `check-app3-g04.mjs` reads it
> against the real schema and refuses either half without the other.

| Checkpoint | Portion | Status after `APP3-G04` |
|---|---|---|
| `APP3-G01` | whole checkpoint, post-G04 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint, post-G04 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint, post-G04 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-G04 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P01` | whole checkpoint, post-G04 | `READY — NOT STARTED` |
| `APP3-P02` | whole checkpoint, post-G04 | `READY — NOT STARTED` |
| `APP3-DB01` | whole checkpoint, post-G04 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-B02` | G04 portion | `UNBLOCKED_BY_G04` |
| `APP3-B04` | asset-eligibility portion | `UNBLOCKED_BY_G04` |
| `APP3-B06` | asset-policy portion | `UNBLOCKED_BY_G04` |
| `APP3-P01` | font/media schema portion | `UNBLOCKED_BY_G04` |
| `APP3-P02` | complexity-validation portion | `UNBLOCKED_BY_G04` |
| `APP3-S11` | autosave cadence ownership | `ROUTED_BY_G04` |
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | authority | `OPEN — AUTHORITY_LOCKED_BY_APP3-G04` |
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | final owner | `APP3-B02` |
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | blocked by | `APP3-DB01 + APP3-B06` |
| `FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01` | whole follow-up | `COMPLETE — CLOSED_BY_APP3-G04` |
| `FU-APP3-G03-QUALITY-AGGREGATE-01` | whole follow-up | `DEFERRED — REGRESSION_ACTIVITY_ONLY` |
| `FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` | whole follow-up | `OPEN` |

The public-media-dimensions follow-up stays **open** on purpose: this gate locks
the authority, `APP3-DB01` adds the fields and constraints, `APP3-B06` and the
worker write canonical metadata for new editor-safe derivatives, and `APP3-B02`
exposes side-background dimensions through the contextual public contract and
closes it after integration evidence passes. Claiming closure here would claim a
schema and a delivery contract that do not exist.

No implementation checkpoint is complete.

### 6.7.5 Measured evidence behind the replaced PO-12

The first `APP3-G04` attempt stopped because the ruling it was given asserted a
schema fact the repository contradicts. The measurement, taken from the Drizzle
source **and** the migrated development database:

| Measured | Result |
|---|---|
| `asset_derivatives` columns | `id, asset_id, kind, status, storage_key, checksum, is_watermarked, created_at, updated_at` |
| derivative width/height/media-type/byte-size column | **absent** |
| repository-wide pixel-dimension columns | only `product_sides` and `embroidery_areas` geometry; every other match is `physical_*_mm` |
| `assets.mime_type` / `assets.size_bytes` | present, describing the **source binary** |
| `asset_inspections.detail` | append-only text; V1 JSON records source and derivative dimensions |
| inspection decoder accepted kinds | exactly `THUMBNAIL` and `CATALOG_PREVIEW`, media type fixed to `image/webp` |
| inspection detail read paths | worker terminal-replay only; no API module reads it |
| editor-safe derivative producer | none exists in the repository |
| editor-safe derivative rows | `0` |

The three reasons the inspection document cannot be the runtime authority: it is
append-only history with no unique link to one derivative row and no current-state
index; its decoder structurally rejects any document that is not exactly the two
catalog kinds; and a per-write decoded-pixel budget check cannot be served from
unindexed append-only text without first deciding which row is authoritative —
which is itself the decision this gate was forbidden to invent.

## 6.8 `APP3-DB01` — placement lifecycle and derivative metadata migration

The APP3 database checkpoint, and the only one. It implements the two
contribution groups the gates resolved, in **one** forward-only migration
(`0034_add_app3_placement_and_derivative_authority.sql`), and nothing else — **no
Product, Template, Session or media API, no worker processing, no generated
contract, no Figma, no Admin or Storefront UI**.

Both groups exist because a gate measured an absence rather than assuming a
presence. `APP3-G01` found that a referenced placement had no stable identity to
be referenced *by*; `APP3-G04` found that no derivative row could say how large
its own output was.

### 6.8.1 Machine-checked migration facts

`node tools/check-app3-db01.mjs` recomputes each of these against the repository
and the committed migration.

| Fact | Value |
|---|---|
| `Migration tag` | `0034_add_app3_placement_and_derivative_authority` |
| `Migration count` | `1` |
| `Migration direction` | `FORWARD_ONLY` |
| `Contribution groups` | `2` |
| `Placement code column` | `code` |
| `Placement code format` | `^[a-z0-9][a-z0-9_-]{0,63}$` |
| `Placement code backfill` | `LEGACY_UUID_WITHOUT_HYPHENS` |
| `Placement code nullability` | `NOT_NULL_AFTER_BACKFILL` |
| `Placement code uniqueness` | `PER_PARENT` |
| `Placement code global uniqueness` | `NO` |
| `Placement retirement column` | `retired_at` |
| `Placement replacement column` | `superseded_by_id` |
| `Placement replacement requires retirement` | `YES` |
| `Placement self replacement` | `REJECTED` |
| `Placement cross parent replacement` | `REJECTED` |
| `Placement direct replacement cycle` | `REJECTED` |
| `Placement replacement graph framework` | `NONE` |
| `Protection sources` | `TEMPLATE_HEADER NON_TERMINAL_SESSION APPROVAL_SNAPSHOT` |
| `Protected session states excluded` | `EXPIRED DELETED` |
| `Protected update result` | `REJECTED` |
| `Protected delete result` | `REJECTED` |
| `Protected display change result` | `ALLOWED` |
| `Protection enforcement` | `DATABASE_TRIGGER` |
| `Protection cascade delete` | `NONE` |
| `Derivative metadata columns` | `width_px height_px media_type byte_size` |
| `Derivative metadata nullability` | `NULLABLE_ALL_OR_NONE` |
| `Derivative metadata positive check` | `REQUIRED` |
| `Derivative media type blank check` | `REQUIRED` |
| `Derivative ready normalized requires metadata` | `YES` |
| `Derivative historical rows may stay null` | `YES` |
| `Derivative metadata backfill` | `NONE` |
| `Migration object storage call` | `NONE` |
| `Migration network call` | `NONE` |
| `New tables` | `0` |
| `New derivative kinds` | `0` |
| `Forbidden columns added` | `0` |
| `G01_DB_CONTRIBUTION_STATE` | `IMPLEMENTED_BY_APP3_DB01` |
| `G04_DB_CONTRIBUTION_STATE` | `IMPLEMENTED_BY_APP3_DB01` |

### 6.8.2 Contribution group A — placement stable identity and retirement

`product_sides` and `embroidery_areas` each gain `code`, `retired_at` and
`superseded_by_id`.

`code` is the stable machine identity inside one parent — `(product_id, code)`
for a Side, `(product_side_id, code)` for an Area — never globally unique,
because two Products may both have a `front`. It is deliberately **not** derived
from `name`: names are display copy, localized, edited and duplicated, and an
identity derived from one would change meaning when the copy changed.

The migration adds `code` nullable, backfills every existing row from its own
immutable id as `legacy-<uuid without hyphens>`, **proves** no null, duplicate or
malformed value survives, and only then sets `NOT NULL` and adds the uniqueness
and format constraints. The proof step is not ceremony: without it a stale row
surfaces as a bare `23502`/`23505`/`23514` naming no row, on a statement that is
not the one that caused it.

Retirement and replacement are constrained in four places, split by what each can
see. A CHECK reads one row, so `superseded_by_id <> id` and "a replacement
pointer requires `retired_at`" are CHECKs. Same-parent and direct-cycle are facts
about the *other* row, so they are a trigger. Only the **direct two-row** cycle
is rejected, as ruled — `a → b → c` is exactly what two successive replacements
look like, and a general graph walk here would reject a legitimate history.

### 6.8.3 Referenced-row protection

A placement becomes protected the moment a Template header scopes to it, a Design
Session whose status is **not** `EXPIRED` or `DELETED` sits on it, or an approval
snapshot froze it. From then on its identity and geometry are what those rows
*mean*.

| Table | Frozen once protected |
|---|---|
| `product_sides` | `product_id`, `code`, `background_asset_id`, `image_width_px`, `image_height_px`, `physical_width_mm`, `physical_height_mm`, `px_per_mm` |
| `embroidery_areas` | `product_side_id`, `code`, `bound_x_px`, `bound_y_px`, `bound_width_px`, `bound_height_px`, `max_width_mm`, `max_height_mm` |

Display copy, display order, the retirement timestamp and the replacement pointer
stay editable, because none of them changes what was referenced. A protected row
cannot be hard-deleted; an unprotected one still can, under the existing FK and
ownership rules. Nothing cascades: no Template, Session, snapshot or placement
history is deleted by this migration or its triggers.

Enforcement is a database trigger, in the same class as the DB6-S24 guards and
for the same reason — an application-only guard is bypassed by every path that is
not that application. `APP3-DB01` changes no API or persistence repository.

> **Disclosed: `design_versions` also references both tables and is *not* a
> protection source.** The ruled set is exactly three. `design_versions` sits
> behind `approval_snapshots` in the APP5 flow, and an approved snapshot — which
> *is* a protection source — is the record the customer agreed to. Widening the
> set would be a fourth contribution this checkpoint is not authorized to make;
> the owner of the formal design flow should confirm it, and this note is here so
> that decision is made rather than inherited.

### 6.8.4 Contribution group B — canonical derivative metadata

`asset_derivatives` gains `width_px`, `height_px`, `media_type` and `byte_size`:
integer, integer, text, bigint, all nullable, with three CHECKs.

`ck_asset_derivatives__metadata_all_or_none` keeps the quartet moving as a unit —
a row with a width and no media type is not "partly measured", it is a row no
eligibility rule can evaluate. `ck_asset_derivatives__metadata_positive` requires
positive dimensions and byte size and a non-blank media type; it trims tabs and
newlines as well as spaces, because the bare `btrim` would let a tab-only media
type satisfy a rule that exists to reject it.
`ck_asset_derivatives__ready_normalized_metadata` is the eligibility half: a
`READY` `NORMALIZED` derivative **must** carry all four. Other kinds keep their
historical freedom, so the existing `READY` `THUMBNAIL` and `CATALOG_PREVIEW`
rows stay valid and unmeasured forever.

The columns are not globally `NOT NULL` for the five reasons IMP-D044 records,
and the migration performs **no** backfill: it never contacts object storage and
never fabricates a value. A row is created before processing with the quartet
null and becomes eligible only when the transition to `READY` writes all four
atomically.

### 6.8.5 Dependency reconciliation

> Portion labels carry a `post-DB01` suffix for the same reason §6.7.4's carry
> `post-G04`: they keep this table's `id :: portion` keys disjoint from the ones
> the earlier gates assert. Both earlier bounds are now repaired, so this is
> defence in depth rather than the only thing separating them.

| Checkpoint | Portion | Status after `APP3-DB01` |
|---|---|---|
| `APP3-G01` | whole checkpoint, post-DB01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint, post-DB01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint, post-DB01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-DB01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-DB01` | whole checkpoint, post-DB01 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P01` | whole checkpoint, post-DB01 | `READY — NOT STARTED` |
| `APP3-P02` | whole checkpoint, post-DB01 | `READY — NOT STARTED` |
| `APP3-B01` | whole checkpoint, post-DB01 | `READY — NOT STARTED` |
| `APP3-B02` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_B01_AND_APP3_B06` |
| `APP3-B03` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_P01` |
| `APP3-B04` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_P01_APP3_P02_AND_APP3_B06` |
| `APP3-B06` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_P01` |
| `APP3-B07` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_P01_AND_APP3_P02` |
| `APP3-B08` | whole checkpoint, post-DB01 | `BLOCKED_BY_APP3_P01_AND_APP3_P02` |
| `APP3-W01` | whole checkpoint, post-DB01 | `READY_BY_DB_DISPOSITION — NOT STARTED` |
| `G01 contribution` | implementation state | `IMPLEMENTED_BY_APP3_DB01` |
| `G04 contribution` | implementation state | `IMPLEMENTED_BY_APP3_DB01` |
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | authority, post-DB01 | `OPEN — AUTHORITY_LOCKED_BY_APP3-G04` |
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | blocked by, post-DB01 | `APP3-B06` |
| `FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01` | whole follow-up, post-DB01 | `COMPLETE — CLOSED_BY_APP3-DB01` |

The dimensions follow-up loses `APP3-DB01` from its blocker list and **stays
open**: the schema now exists, but nothing writes canonical metadata yet
(`APP3-B06` and the worker) and nothing publishes it yet (`APP3-B02`, which
closes it).

No implementation checkpoint is complete. `APP3-DB01` is a database checkpoint;
it delivers no API, worker, package or UI.

## 6.9 `APP3-F01` — controlled font acquisition

`APP3-F01` exists because `APP3-P01`'s first attempt stopped. It is not a
correction of P01; it is the prerequisite P01 turned out to depend on.

### 6.9.1 Why the checkpoint exists

`IMP-D044` PO-10 requires a Design Document to store a server-owned `fontId`
resolved through a registry that names an approved family, approved styles and
weights, a **controlled** WOFF2 asset, a SHA-256 integrity value, licence
metadata, Vietnamese glyph coverage and a fallback policy. `APP3-P01` was
directed to deliver that registry as concrete, file-backed entries.

The repository contained no font binary, no licence artifact, no integrity
baseline and no coverage evidence. The measured absence:

| Probe | Result |
|---|---|
| tracked font binaries (`.woff2`/`.woff`/`.ttf`/`.otf`/`.eot`) | 0 |
| tracked paths matching `font` | 0 |
| filesystem font binaries outside `node_modules` | 0 |
| tracked licence artifact of any kind | 0 |
| font tooling or font package in any manifest | none |

`packages/styles/src/settings/_typography.scss` names General Sans and Inter,
but a CSS family list is a browser-resolution instruction, not a controlled
asset — exactly what PO-10 forbids a document from storing. The one near-miss,
`node_modules/.pnpm/next@…/next-devtools/server/font/geist-*.woff2`, fails on
four counts: untracked, third-party dev-tool property, no licence record here,
and subsetted `latin`/`latin-ext` — the wrong subset for Vietnamese.

The first attempt therefore reported `APP3-P01 = FAILED — MANUAL INTERVENTION
REQUIRED`, wrote nothing and committed nothing. The human intervention split
acquisition and licensing from document implementation.

### 6.9.2 Locked selection

| Key | Value |
|---|---|
| `Font family` | `Inter` |
| `Upstream repository` | `https://github.com/rsms/inter` |
| `Upstream tag` | `v4.1` |
| `Upstream commit` | `e3a3d4c57d5ecc01453a575621882a384c1995a3` |
| `Licence` | `OFL-1.1` (SIL Open Font License 1.1) |
| `Canonical location` | `packages/design-document/assets/fonts/inter/4.1/` |
| `Upright binary` | `InterVariable.woff2` |
| `Italic binary` | `InterVariable-Italic.woff2` |
| `Binary modification` | `FORBIDDEN` |
| `Acquisition source` | `OFFICIAL_PINNED_TAG_ONLY` |

Forbidden sources: General Sans, any system-installed font, any browser fallback
face, anything from `node_modules`, a Google Fonts CDN response, an unpinned
`latest` URL, and any unofficial mirror.

### 6.9.3 Measured evidence

| Key | Value |
|---|---|
| `InterVariable.woff2 sha256` | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| `InterVariable.woff2 bytes` | `352240` |
| `InterVariable-Italic.woff2 sha256` | `e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a` |
| `InterVariable-Italic.woff2 bytes` | `387976` |
| `LICENSE.txt sha256` | `b3195af0fb14368d1b3b10fb9d3fe503b7163ea083859d2ee553bc74da07c320` |
| `Container flavor` | `woff2` (both) |
| `Variable` | `true` (both) |
| `Weight axis` | `wght 100..900` (both) |
| `Upright italic bits` | `false` (`fsSelection` and `macStyle`) |
| `Italic italic bits` | `true` (`fsSelection` and `macStyle`) |
| `Required Vietnamese repertoire` | `156` code points |
| `Covered` | `156 / 156` in both files |
| `Missing` | `[]` in both files |
| `Verification tool` | `fonttools 4.55.3` on Python `3.11.8` |

Coverage was measured from the real `cmap` tables of the committed bytes, never
inferred from a family name, a CSS fallback list, an upstream claim, a filename
or a unicode-range comment. The repertoire is the Vietnamese letters, the six
vowel bases and their lowercase forms, `Đ`/`đ`, the eight combining marks
canonical decomposition requires, and every assigned code point in
`U+1EA0..U+1EF9`.

Inter v4.1 ships italic as a **separate file** rather than as an `ital` axis, so
italic identity rests on the `OS/2` `fsSelection` and `head` `macStyle` bits and
the `Italic` name subfamily. All three separate the two files cleanly.

### 6.9.4 Reserved for `APP3-P01`

`APP3-F01` supplies evidence only. It writes no TypeScript, no registry and no
validation. The registry entry P01 must deliver is locked here:

| Key | Value |
|---|---|
| `fontId` | `inter` |
| `family` | `Inter` |
| `registryVersion` | `1` |
| `styles` | `normal`, `italic` |
| `weights` | `100` through `900` |
| `normalFile` | `packages/design-document/assets/fonts/inter/4.1/InterVariable.woff2` |
| `italicFile` | `packages/design-document/assets/fonts/inter/4.1/InterVariable-Italic.woff2` |
| `license` | `packages/design-document/assets/fonts/inter/4.1/LICENSE.txt` |
| `fallbackPolicy` | `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE` |

P01 may normalize the TypeScript shape. It may not change the family, files,
licence, styles, weight range or fallback semantics without a new authority
decision. The registry references the committed licence **path**, not merely the
SPDX string. Fonts stay outside the Design Document asset budget, and no font
bytes and no font URL ever enter a Design Document.

### 6.9.5 UI styling versus document font authority

These are different questions and the checkpoint keeps them apart:

| Key | Value |
|---|---|
| `UI CSS family stack` | may name General Sans, Inter, `sans-serif` under UI styling authority |
| `Design Document fontId` | resolves only through the controlled registry, beginning with Inter v4.1 |
| `General Sans` | `NOT_CONTROLLED` |
| `_typography.scss` | unchanged by `APP3-F01` |

General Sans is not removed from the CSS stack merely because P01 does not
control it; a browser-resolved fallback for chrome type is not a claim about
what a customer may embroider.

### 6.9.6 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-F01` |
|---|---|---|
| `APP3-G01` | whole checkpoint, post-F01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint, post-F01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint, post-F01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-F01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-DB01` | whole checkpoint, post-F01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-F01` | whole checkpoint, post-F01 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P01` | whole checkpoint, post-F01 | `BLOCKED_BY_APP3-F01_REVIEW_ACCEPTANCE` |
| `APP3-P01` | first attempt, post-F01 | `FAILED — MANUAL_INTERVENTION_REQUIRED` |
| `APP3-P01` | failure cause, post-F01 | `NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE` |
| `APP3-P01` | resolution, post-F01 | `APP3-F01` |
| `APP3-P02` | whole checkpoint, post-F01 | `READY — NOT STARTED` |
| `PO-10 font registry` | asset authority | `DELIVERED_BY_APP3-F01` |
| `PO-10 font registry` | runtime implementation | `RESERVED_FOR_APP3-P01` |

On human acceptance of `APP3-F01`, `APP3-P01` becomes
`READY_FOR_MANUAL_INTERVENTION_RESUME`.

The historical first-attempt failure is recorded forward and is not rewritten.
`APP3-F01` delivers no package implementation, no API, no worker, no Figma and
no UI.

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
APP3 = IN PROGRESS — FONT AUTHORITY DELIVERED_FOR_REVIEW
APP3-PRE-IMPLEMENTATION-AUDIT = COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION
APP2-X01-C1 = COMPLETE — REVIEW_ACCEPTED
APP2-X01-C2 = COMPLETE — REVIEW_ACCEPTED
FU-APP3-CLOSURE-FIGMA-BASELINE-01 = COMPLETE — CLOSED_BY_APP2-X01-C1
FU-APP2-CLOSURE-NEXTPHASE-GUARD-01 = COMPLETE — CLOSED_BY_APP2-X01-C2
APP3-G01 = COMPLETE — REVIEW_ACCEPTED
APP3-G02 = COMPLETE — REVIEW_ACCEPTED
APP3-G03 = COMPLETE — REVIEW_ACCEPTED
APP3-G04 = COMPLETE — REVIEW_ACCEPTED
APP3-DB01 = COMPLETE — REVIEW_ACCEPTED
APP3-F01 = COMPLETE — REVIEW_DELIVERED
G01_DB_DISPOSITION = REQUIRES_APP3_DB01_PLACEMENT_RETIREMENT_AND_STABLE_CODE
G02_DB_CONTRIBUTION = NONE
G03_DB_CONTRIBUTION = NONE
G04_DB_CONTRIBUTION = REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA
G01 DB contribution = IMPLEMENTED_BY_APP3_DB01
G04 DB contribution = IMPLEMENTED_BY_APP3_DB01
APP3-P01 = BLOCKED_BY_APP3-F01_REVIEW_ACCEPTANCE
APP3-P01 FIRST_ATTEMPT = FAILED — MANUAL_INTERVENTION_REQUIRED
APP3-P01 FIRST_ATTEMPT CAUSE = NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE
APP3-P01 FIRST_ATTEMPT RESOLUTION = APP3-F01
APP3-P02 = READY — NOT STARTED
APP3-B01 = READY — NOT STARTED
APP3-W01 = READY_BY_DB_DISPOSITION — NOT STARTED
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — AUTHORITY_LOCKED_BY_APP3-G04
FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 = COMPLETE — CLOSED_BY_APP3-G04
FU-APP3-G03-QUALITY-AGGREGATE-01 = DEFERRED — REGRESSION_ACTIVITY_ONLY
FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01 = COMPLETE — CLOSED_BY_APP3-DB01
O-008 = CLOSED_BY_IMP-D043
DP-RET-01 design_sessions = CLOSED_BY_IMP-D043
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

`APP3-G03` locked the ten Product Owner anonymous-session rulings as
**IMP-D043** (§6.6): ownership needs **both** the public id and a 32-byte
server-generated secret carried **only** in `__Host-nettheu_ds_<session-id>`,
verified against an HMAC-SHA-256 digest under a runtime pepper; resume rotates
that secret atomically **without extending TTL**; `SESSION_TTL` is **30 days
absolute from `created_at`** with no sliding, expiry via `TR-LC07-04` and hard
delete via `TR-LC07-05` after a 24-hour grace. It closed `O-008` and the
`design_sessions` half of `DP-RET-01`, superseded the earlier sliding
`last_activity_at + TTL` direction, and contributed **no** schema change
(`G03_DB_CONTRIBUTION = NONE`) — every required field and constraint was
measured to already exist. The gate `node tools/check-app3-g03.mjs` asserts the absence of
any Session operation as hard as it asserts the authority.

`APP3-G04` locked the twelve Product Owner media rulings as **IMP-D044**
(§6.7) after a first attempt stopped at `FAILED — MANUAL INTERVENTION REQUIRED`:
the ruling as issued asserted that `asset_derivatives` already carried intrinsic
dimensions, and the measured schema carries none (§6.7.5). The Product Owner
selected canonical derivative metadata columns and explicitly rejected treating
`asset_inspections.detail` as runtime authority, so this gate contributes
`REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA` and `APP3-DB01` becomes
`READY_FOR_EXECUTION` with two contribution groups. It implemented **no** upload
API, delivery API, worker processor, schema change, migration, generated contract
or UI — `node tools/check-app3-g04.mjs` asserts that absence, and asserts the
required schema contribution as *pending* before `APP3-DB01` and as *implemented*
after it, so the same gate is correct on both sides of the migration.

`APP3-DB01` implemented both contribution groups in one forward-only
migration (`0034`, §6.8): stable per-parent `code` with a deterministic
`legacy-<uuid>` backfill proved before `NOT NULL`, `retired_at` /
`superseded_by_id` with same-parent and direct-cycle guards, database-enforced
protection of identity and geometry once a Template header, a non-terminal
Session or an approval snapshot references the row, and the canonical derivative
metadata quartet with all-or-none, positive and READY-editor-safe CHECKs. It
added **no** table, no derivative kind, no forbidden column, no API, no worker
and no UI, and performed no backfill of derivative metadata — the migration never
contacts object storage. `node tools/check-app3-db01.mjs` asserts that, and
`node tools/check-app3-g04.mjs` now reports
`PASS — DERIVATIVE_METADATA_IMPLEMENTED`.

Audit: [`audits/APP3_PRE_IMPLEMENTATION_AUDIT.md`](../audits/APP3_PRE_IMPLEMENTATION_AUDIT.md).
Report: [`reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md`](../reports/APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md).
