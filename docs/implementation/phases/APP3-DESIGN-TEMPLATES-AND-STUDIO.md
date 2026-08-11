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
| 13 | `APP3-B03` | backend | template draft authoring — **header creation and Admin reads only**; the draft *document save* is `APP3-B03A` (§6.25) | 3 | G02, P01, `DB-DISPOSITION-RESOLVED` | no | no | no |
| 13a | **`APP3-B03A`** | backend | Design Template draft document/version authoring — one save that writes a new immutable version (§6.25) | 1 | B03, P01, G06 | no | no | no |
| 14 | `APP3-B04` | backend | template lifecycle (publish / unpublish / archive) — **restore is `APP3-B04A`** (§6.26) | 3 | **B03A** (publish needs an immutable version to publish; B03 comes transitively), **P02** (in-bounds invariant) | no | no | no |
| 14a | **`APP3-B04A`** | backend | Design Template restore — `ARCHIVED → DRAFT` (`TR-LC24-06`) | 1 | B04 | no | no | no |
| 15 | `APP3-B05` | backend | public published-template read for a product scope — JSON metadata only; **byte delivery of a published Template asset is `APP3-B05A`, never a third operation here (§6.24.2)** | 2 | B04, B01 | no | no | no |
| 16 | `APP3-A02` | frontend | Admin template list | 1 screen | B03, D01 | no | yes | no |
| 17 | `APP3-A03` | frontend | Admin template editor | 1 screen | **B03A** (the editor's save; B03 comes transitively), D01, P01, P02 | no | yes | `spike:editor:test` |
| 18 | `APP3-A04` | frontend | Admin template publication interaction | 1 screen | B04, D01 — **and `B04A` when the screen offers restore** (§6.26) | no | yes | no |
| 19 | `APP3-W01` | worker | editor-safe derivative + customer-upload inspection lane | 0 HTTP | G04, `DB-DISPOSITION-RESOLVED` | no | no | no |
| 20 | `APP3-B06` | backend | session-scoped customer asset intake + granted delivery — **replanned by `APP3-G08` into `APP3-B06A` + `APP3-B06B`, and completed by `APP3-B06C`, which carries the *granted delivery* half this row always contained; see §6.22 and §6.24.3** | 2 | G04, W01 | no | no | no |
| 21 | `APP3-B07` | backend | session bootstrap (blank + clone) and resume | 2 | G03, P01, **P02**, B01 | no | no | no |
| 22 | `APP3-B08` | backend | session autosave with `autosave_revision` CAS | 1 | B07, **P02** (out-of-bounds rejection) | no | no | no |
| 23 | `APP3-S01` | frontend | Studio bootstrap shell + product/template selection | 1 capability | B07, B05, **B05A** (the picker shows a Template preview derivative — §6.24.2), D01 | no | yes | no |
| 24 | `APP3-S02` | frontend | SVG stage, renderer adapter, selection | 1 capability | S01, P01, P02 | no | yes | **benchmark** |
| 25 | `APP3-S03` | frontend | transforms and DOM handles (≥44 px, outside the element box) | 1 capability | S02 | no | yes | **benchmark** |
| 26 | `APP3-S04` | frontend | layer list, z-order, lock, hide, group | 1 capability | S02 | no | yes | no |
| 27 | `APP3-S05` | frontend | text capability within whitelist constraints | 1 capability | S02, P01 | no | yes | no |
| 28 | `APP3-S06` | frontend | asset/image (and SVG once ruled) capability | 1 capability | S02, **B06B** (intake) **and B06C** (private delivery) — the two halves the `B06` row always named | no | yes | no |
| 29 | `APP3-S07` | frontend | zoom / pan / safe area / product background | 1 capability | S02, B02 | no | yes | **benchmark** |
| 30 | `APP3-S08` | frontend | undo / redo as document commands | 1 capability | S02 | no | yes | no |
| 31 | `APP3-S09` | frontend | runtime watermark | 1 capability | S02 | no | yes | no |
| 32 | `APP3-S10` | frontend | autosave / conflict / resume / expiry UI — **and the autosave cadence** (§6.3) | 1 capability | S01, B08 | no | yes | no |
| 33 | `APP3-S11` | frontend | mobile controls and touch gestures | 1 capability | S03, S07 | no | yes | **benchmark** |
| 34 | `APP3-S12` | frontend | shapes, freehand, curved text (`LATER_APP3`) | 1 capability | S02 | no | yes | no |
| 35 | `APP3-S13` | frontend | align / distribute / snap / guides / crop (`LATER_APP3`) | 1 capability | S02 | no | yes | no |
| 36 | `APP3-E01` | E2E | cross-layer journey (§7) | — | S10, S11, B05, **B05A**, **B06C** — every delivery class the journey traverses (§6.24.4) | no | no | **benchmark** |
| 37 | `APP3-X01` | closure | close R2 Customization Alpha; hand off to APP4/APP5 | — | E01 | no | no | no |

### How to read this map

Added by `APP3-ROADMAP-RECONCILIATION` after an execution-order audit found that
`APP3-S11` had been proposed as the next checkpoint on the strength of an
*ownership* line, while its own predecessors (`S03`, `S07`) had not started.

- The **`#` column and the `Predecessors` column** drive execution planning. Where
  they could ever disagree, the predecessor edges win: they are the primary
  authority.
- A **numeric suffix is a lane-local identifier**, not a global execution order.
  `B06A`/`B06B`/`B07`/`B08` shipped while `B03`/`B04`/`B05` had not started, and
  that was correct — each followed its own predecessors. A high number is not
  disqualifying and a low one is not a claim.
- An **`OWNER =` statement assigns a decision, never a position in the queue.**
  `AUTOSAVE_CADENCE_OWNER = APP3-S10` says who may choose the cadence; it says
  nothing about when `S10` runs, and a checkpoint that owns a decision is
  frequently one of the last to execute.
- A **readiness note about a *package* is not readiness of a *checkpoint*.**
  "Foundation ready by `P01` and `P02`" means those packages exist. Only the
  predecessor row decides whether a checkpoint may start.
- Checkpoints added after this map by an accepted replan, correction or manual
  intervention are reconciled in **§6.24**, which is where to look for "what owns
  this responsibility now".

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
| Autosave **cadence** | `ADR-APP0-001` deferred details | **OPEN — owner `APP3-S10`**, routed by `APP3-G04` §6.7; it must choose the UX cadence under the existing 30 writes/minute ceiling and may not invent a timer here. **Corrected from `APP3-S11` by `APP3-ROADMAP-RECONCILIATION`:** cadence is a property of the autosave loop, which is `S10`'s capability (§6.1 #32); `S11` is *mobile controls and touch gestures* (#33) and never owned an autosave concern |
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
>
> **The `APP3-S11 :: conflict/reload UX authority` row below is a dated record**
> asserted verbatim by `check-app3-g03.mjs` and is not rewritten. Conflict and
> reload UX is **`APP3-S10`**'s capability (§6.1 #32, §6.24.6); `APP3-S11` is
> mobile controls and touch gestures. Read the row as "G03 unblocked the Studio's
> conflict/reload UX" — which is what it settled — with the identifier corrected
> by `APP3-ROADMAP-RECONCILIATION`.

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
>
> **The `APP3-S11 :: autosave cadence ownership` row below is a dated record and
> is deliberately left as G04 wrote it**, because `check-app3-g04.mjs` asserts
> this table verbatim as evidence of what G04 *routed*. Current cadence ownership
> is **`APP3-S10`** — see §6.3 and §6.24.6. Read the row as "G04 routed cadence to
> the Studio autosave capability", which is what it meant; the identifier it used
> was corrected by `APP3-ROADMAP-RECONCILIATION`.

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

## 6.10 `APP3-P01` — production design-document foundation

Resumed after the manual intervention. `APP3-F01` supplied the prerequisite the
first attempt stopped for; nothing else about the contract changed.

### 6.10.1 Delivered scope

`packages/design-document` now owns the engine-neutral schema, structural
validation, complexity validation, contextual asset/font validation,
quantization, RFC 8785 canonicalization, server-side SHA-256, the document
migration registry and the controlled runtime font registry.

| Key | Value |
|---|---|
| `Document schema version` | `1` |
| `Root fields` | `schemaVersion`, `placement`, `elements` |
| `Unknown root or element field` | `VALIDATION_FAILURE` |
| `Element kinds` | `text`, `image`, `shape`, `freehand`, `group` |
| `Z-order` | array order, preserved by JCS |
| `Element identity` | stable opaque id, never an array index |
| `Shape kinds` | `rectangle`, `ellipse`, `line` |
| `Quantization scale` | `10000` (four decimal places) |
| `Quantization authority` | `ADR-APP0-001 §4` + `APP0-R01` evidence |
| `Negative zero` | normalized to `0` |
| `Canonical form` | RFC 8785 JCS |
| `Key ordering` | UTF-16 code unit, never locale collation |
| `Unicode normalization` | NFC rejected-if-absent at the input boundary |
| `Hash` | SHA-256, lowercase hex, **server export only** |
| `Browser-safe root export` | `@embroidery/design-document` |
| `Node-only export` | `@embroidery/design-document/server` |
| `Browser SHA-256 fallback` | `NONE` |
| `Geometry, bounds, px↔mm` | `RESERVED_FOR_APP3-P02` |

### 6.10.2 Validation layers

| Layer | Owns | Does not own |
|---|---|---|
| Structural | version, fields, union shape, finite numbers, ranges, unique ids, group graph, NFC | any geometric consequence |
| Complexity | the nine IMP-D044 limits | decoded pixels (needs authority) |
| Contextual | derivative eligibility and metadata equality, decoded pixels, font variants | anything requiring a database or object-storage read |

Nesting depth counts a leaf's **ancestor groups**: eight nested groups pass, nine
fail. Text length counts **code points**, so an astral character costs one.
Canonical size is measured on **UTF-8 bytes** after quantization, never on string
length. A repeated Asset counts **once** toward the Asset and decoded-pixel
budgets and **each time** toward image elements. Hidden and locked elements
count. A failing document is rejected whole — nothing is truncated.

### 6.10.3 Pipeline

```text
version → structure → complexity → quantization → revalidation → canonical bytes → size
```

Revalidation after quantization is load-bearing: a width of `0.00004` is a legal
positive number that quantizes to `0`, which the schema forbids. Without the
second pass that document would be canonicalized and hashed in a state it never
legally held.

### 6.10.4 Font registry (consumes `APP3-F01`)

Registry version `1`, one entry, exactly as locked in §6.9.4: `fontId = inter`,
family `Inter`, styles `normal`/`italic`, weights `100..900`, the two committed
WOFF2 paths, the committed `LICENSE.txt` path, and
`REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`. The registry also carries both binary
SHA-256 values, `OFL-1.1`, `VERIFIED_COMPLETE` Vietnamese coverage and both
evidence paths.

The metadata is **transcribed**, not read at runtime — the package must stay
browser-safe and the build emits only `src/`. A package test reads the committed
manifests **and re-hashes the committed binaries**, so the transcription cannot
quietly disagree with the evidence. General Sans is not registered and no font
byte, path or URL is ever serialized into a Design Document.

### 6.10.5 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-P01` |
|---|---|---|
| `APP3-G01` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-DB01` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-F01` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P01` | whole checkpoint, post-P01 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P02` | whole checkpoint, post-P01 | `READY — NOT STARTED` |
| `APP3-B01` | whole checkpoint, post-P01 | `READY — NOT STARTED` |
| `APP3-B03` | whole checkpoint, post-P01 | `READY_BY_P01 — NOT STARTED` |
| `APP3-B04` | whole checkpoint, post-P01 | `BLOCKED_BY_APP3-P02_AND_APP3-B06` |
| `APP3-B05` | whole checkpoint, post-P01 | `READY_BY_P01 — BLOCKED_BY_APP3-B04` |
| `APP3-B06` | whole checkpoint, post-P01 | `READY — NOT STARTED` |
| `APP3-B07` | whole checkpoint, post-P01 | `BLOCKED_BY_APP3-P02` |
| `APP3-B08` | whole checkpoint, post-P01 | `BLOCKED_BY_APP3-P02` |
| `PO-10 font registry` | runtime implementation | `DELIVERED_BY_APP3-P01` |
| `APP3-P01` | first attempt, post-P01 | `FAILED — MANUAL_INTERVENTION_REQUIRED` |
| `APP3-P01` | resolution, post-P01 | `APP3-F01` |

No backend checkpoint is complete. `APP3-P01` validates no geometry and no
bounds; it delivers no API, worker, migration, Figma or UI.

### 6.10.6 `APP3-P01-C1` — decoded-pixel accounting keyed by Asset

Human review returned `APP3-P01 = COMPLETE — CORRECTION_REQUIRED` on one
contradiction inside the delivered evidence:

| Source | Said |
|---|---|
| `IMP-D044` / `APP3-G04` | repeated references to one **Asset** count once toward the unique-asset limit **and** the decoded-pixel total |
| `APP3-P01` implementation | decoded pixels summed over unique **`derivativeId`** values |

The two are equivalent only while each Asset is reached through one derivative.
They diverge the moment one `assetId` appears with two different `derivativeId`
values — and derivative-keying then overcharges the pixel budget for a document
the Asset rule says costs one decode.

The correction restores the existing ruling. It creates **no** new Product Owner
decision id and changes no product policy.

| Key | Value |
|---|---|
| `Decoded pixel accounting key` | `assetId` |
| `Unique referenced media key` | `assetId` |
| `Derivative ids per asset per document` | `EXACTLY_ONE` |
| `Conflicting derivative ids for one asset` | `REJECT_DOCUMENT` |
| `Conflict finding code` | `DERIVATIVE_METADATA_MISMATCH` |
| `Conflict finding path` | the **later** conflicting image element |
| `Image element counting` | unchanged — each element counts |
| `Global derivatives per asset` | unchanged — an Asset may still have many |

The ambiguity is **rejected, never resolved**. Counting the first, last, smallest
or largest derivative makes the pixel budget depend on element order or on an
arbitrary choice; summing them charges one Asset more than once; normalizing
every reference to one derivative silently rewrites what the customer placed.
Each of those breaks one of the two G04 rules, and the ambiguity is equally
unanswerable for canonical media identity, intrinsic-dimension validation and
future deterministic rendering. This restricts one derivative selection **per
Asset within one document**; it does not restrict an Asset to one derivative
globally.

| Checkpoint | Portion | Status after `APP3-P01-C1` |
|---|---|---|
| `APP3-P01-C1` | whole correction | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P01` | whole checkpoint, post-C1 | `COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW` |
| `APP3-P02` | whole checkpoint, post-C1 | `READY — NOT STARTED` |
| `IMP-D044 PO-09` | unique-asset pixel rule | `RESTORED_BY_APP3-P01-C1` |

`APP3-G04-COMPLETION-REPORT.md` and `APP3-P01-COMPLETION-REPORT.md` are
historical evidence and are not rewritten; this section is the forward record.

## 6.11 `APP3-G05` — geometry coordinate, transform and bounds authority

`APP3-G05` exists because `APP3-P02` stopped. It is not a correction of P02; it
is the Product Owner authority P02 turned out to require.

### 6.11.1 Locked geometry facts (`IMP-D045`)

| Key | Value | Note |
|---|---|---|
| `Decision id` | `IMP-D045` | one decision, `LOCKED` |
| `Coordinate origin` | `TOP_LEFT` | PO-01 |
| `Positive x direction` | `RIGHT` | PO-01 |
| `Positive y direction` | `DOWN` | PO-01 |
| `Angle unit` | `DEGREES` | PO-01 |
| `Persisted x y meaning` | `UNTRANSFORMED_LOCAL_BOX_TOP_LEFT_IN_PARENT_FRAME` | PO-02 |
| `Persisted width height meaning` | `POSITIVE_UNSCALED_LOCAL_BOX` | PO-02 |
| `Local drawable origin` | `0,0` | PO-02 |
| `Root element parent frame` | `DOCUMENT_SPACE` | PO-02 |
| `Child element parent frame` | `DIRECT_GROUP_LOCAL_SPACE` | PO-02 |
| `Positive rotation direction` | `CLOCKWISE` | PO-03, under y-down |
| `Rotation pivot` | `UNTRANSFORMED_LOCAL_BOX_CENTRE` | PO-03 |
| `Rotation pivot local coordinates` | `width / 2, height / 2` | PO-03 |
| `Forbidden rotation pivots` | `PERSISTED_CORNER DOCUMENT_ORIGIN GROUP_ORIGIN TRANSFORMED_AABB_CENTRE RENDERER_DEFAULT` | PO-03 |
| `Scale pivot` | `UNTRANSFORMED_LOCAL_BOX_CENTRE` | PO-04, same point as rotation |
| `Scale before rotation` | `YES` | PO-04 |
| `Negative scale meaning` | `REFLECTION_AROUND_CENTRE_PIVOT` | PO-04, only where P01 accepts it |
| `Persisted transform mutation by P02` | `NEVER` | PO-04 |
| `Matrix convention` | `COLUMN_VECTOR` | PO-05 |
| `Matrix application` | `p' = M x p` | PO-05 |
| `Matrix field mapping` | `x' = a*x + c*y + e ; y' = b*x + d*y + f` | PO-05 |
| `Local matrix order` | `T(x + width/2, y + height/2) x R(rotationDeg) x S(scaleX, scaleY) x T(-width/2, -height/2)` | PO-05 |
| `Clockwise rotation matrix` | `a = cos ; b = sin ; c = -sin ; d = cos ; e = 0 ; f = 0` | PO-05 |
| `Row vector semantics` | `FORBIDDEN` | PO-05 |
| `Effective transform composition` | `PARENT_TIMES_CHILD` | PO-06, parent outermost |
| `Group local frame origin` | `GROUP_UNTRANSFORMED_LOCAL_BOX_TOP_LEFT` | PO-06 |
| `Group transform inheritance` | `FULL_UNIFORM` | PO-06 |
| `Forbidden group inheritance` | `CHILD_TIMES_PARENT DOCUMENT_SPACE_CHILDREN PARTIAL SCALE_ONLY RENDERER_OWNED` | PO-06 |
| `Group persisted box role` | `LOCAL_FRAME_AND_PIVOT_ONLY` | PO-07 |
| `Group persisted box as bounds` | `NEVER` | PO-07 |
| `Group pivot from descendant bounds` | `FORBIDDEN` | PO-07 |
| `Group child rebasing by P02` | `FORBIDDEN` | PO-07 |
| `Group visible geometry` | `NONE` | PO-07 |
| `Bounds strategy` | `CONSERVATIVE_TRANSFORMED_AABB` | PO-08 |
| `Box element bounds` | `TRANSFORM_FOUR_LOCAL_CORNERS_THEN_AXIS_ALIGN` | PO-08, applied to the local **envelope** |
| `Envelope transform order` | `EXPAND_LOCAL_THEN_TRANSFORM_THEN_AXIS_ALIGN` | PO-08 (C1) |
| `Document space stroke addition` | `FORBIDDEN` | PO-08 (C1), never a post-transform half-stroke |
| `Stroked kinds` | `rectangle ellipse line freehand` | PO-08 (C1), every kind storing `strokeWidthPx` |
| `Unstroked kinds` | `text image` | PO-08 (C1) |
| `Text image stroke expansion` | `NONE` | PO-08 (C1) |
| `Stroke alignment` | `CENTRED_ON_LOCAL_PATH` | PO-08 (C1) |
| `Stroke expansion` | `strokeWidthPx / 2` | PO-08 (C1), on all four sides |
| `Zero stroke expansion` | `NONE` | PO-08 (C1), a zero stroke uses the declared box |
| `Stroke in bounds containment and physical size` | `INCLUDED` | PO-08 (C1) |
| `Stroke as renderer decoration` | `FORBIDDEN` | PO-08 (C1) |
| `Stroke subtracted from width height` | `FORBIDDEN` | PO-08 (C1) |
| `Rectangle local path` | `BOUNDARY_OF_DECLARED_BOX` | PO-08 (C1), `(0,0)` to `(width,height)` |
| `Rectangle line join` | `MITER` | PO-08 (C1) |
| `Rectangle miter limit` | `4` | PO-08 (C1) |
| `Ellipse local path` | `INSCRIBED_IN_DECLARED_BOX` | PO-08 (C1) |
| `Ellipse bounds` | `DECLARED_BOX_PLUS_HALF_STROKE_TRANSFORMED_AABB` | PO-08 (C1) |
| `Tight rotated ellipse aabb` | `NOT_APP3_V1` | PO-08 |
| `Line local path` | `(0,0) to (width,height)` | PO-08 (C1), the only v1 line geometry |
| `Line segment shape` | `STRAIGHT` | PO-08 (C1) |
| `Forbidden line paths` | `HORIZONTAL_CENTRELINE VERTICAL_CENTRELINE RENDERER_PATH RENDERER_CHOSEN_DIAGONAL UNSTORED_ENDPOINTS` | PO-08 (C1) |
| `Line cap` | `ROUND` | PO-08 (C1) |
| `Line join` | `ROUND` | PO-08 (C1) |
| `Freehand point frame` | `ELEMENT_LOCAL` | PO-08 (C1) |
| `Freehand path` | `ORDERED_POLYLINE_STRAIGHT_SEGMENTS` | PO-08 (C1) |
| `Freehand cap` | `ROUND` | PO-08 (C1) |
| `Freehand join` | `ROUND` | PO-08 (C1) |
| `Freehand single point geometry` | `ROUND_DOT_RADIUS_HALF_STROKE` | PO-08 (C1) |
| `Freehand smoothing simplification` | `FORBIDDEN` | PO-08 (C1) |
| `Cap join as document field` | `FORBIDDEN_VERSION_LEVEL_CONSTANT` | PO-08 (C1), no v1 schema field |
| `Stroke semantics change class` | `SCHEMA_SEMANTIC_UNDER_PO_12` | PO-08 (C1) |
| `Path smoothing or bezier geometry` | `FORBIDDEN` | PO-08 |
| `Group painted geometry` | `NONE` | PO-08 (C1) |
| `Group bounds` | `UNION_OF_DESCENDANT_DRAWABLE_AABB` | PO-08, including every descendant stroke envelope |
| `Document bounds` | `UNION_OF_ALL_DRAWABLE_AABB` | PO-08 |
| `Hidden locked element geometry` | `COUNTS` | PO-08 |
| `Z order effect on bounds` | `NONE` | PO-08 |
| `Containment strategy` | `FULL_TRANSFORMED_AABB_INSIDE_AREA` | PO-09 |
| `Containment boundary equality` | `VALID` | PO-09, after P01 quantization |
| `Containment overhang` | `INVALID` | PO-09 |
| `Containment enforcement` | `BLOCKING` | PO-09, document-write APIs treat it as failure |
| `Containment mutation` | `NONE` | PO-09, no clamp, move, scale-down or snap |
| `Px per mm authority` | `product_sides.px_per_mm` | PO-10, sole source |
| `Area derived scale` | `FORBIDDEN` | PO-10 |
| `Dpi assumption` | `FORBIDDEN` | PO-10, no 96 DPI, no CSS or image DPI |
| `Area max mm role` | `PHYSICAL_LIMIT_NOT_CONVERSION` | PO-10 |
| `Product side scale consistency` | `BOTH_AXES_MUST_EQUAL_PX_PER_MM` | PO-10 |
| `Inconsistent axis resolution` | `TYPED_MISMATCH_NEVER_AVERAGED` | PO-10 |
| `Placement modes` | `NEW_EDITING HISTORICAL_RENDER` | PO-11 |
| `New editing retired placement` | `NOT_SELECTABLE` | PO-11 |
| `Historical render retired placement` | `VALID` | PO-11 |
| `Retirement as deletion` | `NEVER` | PO-11 |
| `Silent supersede of historical document` | `FORBIDDEN` | PO-11 |
| `Geometry semantics binding` | `SCHEMA_VERSION_1` | PO-12 |
| `Semantic change requirement` | `NEW_DECISION_SCHEMA_VERSION_AND_MIGRATION` | PO-12 |
| `Silent semantic change` | `FORBIDDEN` | PO-12 |
| `Geometry engine compatibility record` | `REQUIRED_IN_APPROVAL_AND_RENDERING_EVIDENCE` | PO-12 |
| `G05_DB_CONTRIBUTION` | `NONE` | PO-12, no column is added here |
| `Geometry quantization authority` | `REUSES_P01_SCALE_10000` | no second precision |

### 6.11.2 The twelve rulings

**PO-01 — coordinate system.** Document and group coordinate systems have their
origin at the **top-left**, positive **x** to the **right**, positive **y**
**down**, with angles in **degrees**. This is the only production coordinate
system for APP3 v1, and no renderer may reinterpret v1 in a y-up or
centre-origin space.

**PO-02 — persisted transform meaning.** `x` and `y` are the untransformed
top-left position of the element's local box **in its parent coordinate system**;
`width` and `height` are the positive unscaled dimensions of that box. Local
drawable coordinates run from `(0, 0)` to `(width, height)`. The persisted fields
are never centre coordinates, post-rotation bounds, post-scale bounds or
renderer-specific offsets. A root element's parent frame is document space; a
child's parent frame is its direct group's local space.

**PO-03 — rotation.** Positive `rotationDeg` is **clockwise** under the y-down
system. The pivot is the centre of the **untransformed local box**,
`(width / 2, height / 2)` in the element's local frame — which for a root element
is `(x + width/2, y + height/2)` in document space before rotation. Rotation
never uses the persisted corner, the document origin, the group origin, the
transformed AABB centre or a renderer default.

**PO-04 — scale.** `scaleX`/`scaleY` apply around the **same** untransformed
local-box centre as rotation, and scale is applied **before** rotation in the
local transform. Negative scale stays valid only where P01 structural authority
already accepts it, and means reflection about that same centre. Scale never
alters persisted `x`, `y`, `width` or `height`. An interaction layer may compute a
new persisted transform after an edit; `APP3-P02` never mutates a document.

**PO-05 — local matrix.** Column-vector affine semantics, `p' = M x p`, with
`x' = a*x + c*y + e` and `y' = b*x + d*y + f`. The local-to-parent matrix is
exactly:

```text
Mlocal = T(x + width/2, y + height/2)
       x R_clockwise(rotationDeg)
       x S(scaleX, scaleY)
       x T(-width/2, -height/2)
```

Because the system is y-down, the positive-clockwise rotation is
`a = cos, b = sin, c = -sin, d = cos, e = 0, f = 0`. Scale and rotation are never
reversed, row-vector semantics are forbidden, and a library's multiplication
convention must be converted to this contract rather than relied upon.

**PO-06 — group coordinate semantics.** A group defines a **real local
coordinate frame** whose origin is the top-left of its untransformed local box.
Every direct child's persisted `x`/`y` is expressed in that frame, and the group's
own transform maps the frame into its parent. Effective transforms compose
**parent outermost**:

```text
Meffective(child)      = Meffective(parent group) x Mlocal(child)
Meffective(root)       = Mlocal(root)
Meffective(descendant) = Mlocal(root group) x Mlocal(next group) x ... x Mlocal(descendant)
```

`child x parent`, document-space coordinates inside a group, partial or
scale-only inheritance and renderer-owned grouping are all forbidden. A group
applies translation, rotation, scale and any future v1 transform field uniformly
to every descendant.

**PO-07 — group frame and bounds.** A group is **not visible geometry**. Its
persisted `width`/`height` define its local frame and centre pivot and are never
replaced dynamically by descendant bounds — otherwise a child edit would
silently move the group's rotation and scale pivot. Group **bounds** are the
union of transformed descendant drawable bounds, not the group's own box. A
future grouping interaction must choose the local frame, rebase child transforms
into it and persist the result explicitly; that belongs to a later Studio
checkpoint, and `APP3-P02` must never rebase children automatically.

**PO-08 — bounds strategy** *(corrected by `APP3-G05-C1`; see §6.11.5)*. APP3 v1
uses `CONSERVATIVE_TRANSFORMED_AABB`, a deliberate production safety strategy
rather than path-accurate geometry.

**The stroke is drawable geometry.** Every kind that stores `strokeWidthPx` —
`rectangle`, `ellipse`, `line`, `freehand` — contributes its stroke to bounds,
containment, physical-size validation, group bounds and document bounds. The
stroke is **centred on the local path**, so the local envelope expands by
`strokeWidthPx / 2` on all four sides; a zero stroke expands nothing. Stroke is
never treated as renderer decoration, never ignored because the element also has
a fill, and never subtracted from the declared `width`/`height`. `text` and
`image` carry no stroke and use their declared local box unexpanded, as does a
filled `rectangle` or `ellipse` whose `strokeWidthPx` is `0`.

**Local geometry per kind.** A **rectangle**'s local path is the boundary of
`(0,0)`–`(width,height)`, with fixed v1 semantics `lineJoin = miter`,
`miterLimit = 4`; for its four 90° corners the half-stroke envelope is the
production bounds authority. An **ellipse** is inscribed in the declared box,
its stroke centred on the outline, and its envelope is the declared box expanded
by half the stroke — still the conservative transformed AABB of that expanded
box, never the tight rotated ellipse/stroke AABB. A **line** has no independent
endpoint fields in v1, so its exact local path is locked as a straight segment
from `(0,0)` to `(width,height)` with `lineCap = round` and `lineJoin = round`;
it is never a horizontal or vertical centreline, an arbitrary renderer path, a
renderer-chosen diagonal or a path with unstored endpoints. **Freehand** points
are in the element's local frame and form an ordered polyline of straight
segments, with `lineCap = round` and `lineJoin = round`; no smoothing,
interpolation, Bezier conversion or point simplification is authorized, a single
stored point is a round dot of radius `strokeWidthPx / 2`, and an empty sequence
stays invalid under P01.

**Transform order.** Derive the exact local drawable envelope for the kind,
transform **all four corners of that envelope** with the full effective matrix,
take the document-space axis-aligned min/max, then quantize comparable output
through P01 authority. Transforming only the unexpanded path and adding an
unscaled document-space half-stroke afterwards is forbidden — it ignores scale
and rotation. For line and freehand this may overestimate the painted stroke
under rotation or non-uniform scale; that overestimation is accepted for v1
containment safety.

**Fixed cap/join are version-level constants, not document fields.** A renderer
implementing `schemaVersion = 1` must reproduce miter join with `miterLimit 4`
for rectangle and round cap/join for line and freehand (ellipse has no cap/join
decision). These values are **not** added to the v1 Design Document and are not
per-element customer choices; changing one changes painted bounds and is
therefore a schema-semantic change under PO-12. A future version may expose
configurable cap/join only through a new Product Owner decision and a migration.

**Group** has no painted geometry of its own; its bounds are the union of
descendant drawable AABBs **including every descendant stroke envelope**, and
**document** bounds the union of all of them. Hidden and locked serialized
elements still have geometry, and z-order never affects bounds.

**PO-09 — containment.** Production containment is **blocking** and uses the
complete **stroke-aware** conservative transformed AABB (PO-08 as corrected). An
element is inside an Embroidery Area only when `minX >= area.minX`,
`minY >= area.minY`, `maxX <= area.maxX` and `maxY <= area.maxY` after P01
quantization. Touching the boundary exactly is valid; **any** overhang is
invalid — including a shape whose fill or path fits while part of its ruled
stroke envelope overhangs. Physical-size validation uses the same stroke-aware
bounds. Checking the untransformed box, the pivot or
centre alone, or a sample of path points is forbidden, as is clamping,
translating, rotating, scaling down, snapping, or warning while allowing
persistence. `APP3-P02` returns findings only; the caller decides the workflow,
but APP3 document-write APIs must treat an out-of-bounds finding as a validation
failure. This conservative strategy may reject a path whose visible pixels fit
while its declared box does not — accepted for v1 to prevent clipping and
renderer-specific disagreement.

**PO-10 — physical scale authority.** The sole px↔mm source is
`product_sides.px_per_mm`. Scale is never derived from Embroidery Area width or
height, CSS DPI, 96 DPI, image metadata DPI, or the APP0 spike's `mmPerPx`
helper. `embroidery_areas.max_width_mm`/`max_height_mm` are **physical limits,
not conversion authority**. Product Side consistency requires
`image_width_px / physical_width_mm = px_per_mm` **and**
`image_height_px / physical_height_mm = px_per_mm` after P01 quantization; when
the two axes imply different scale the authority is inconsistent and the axes are
never averaged.

**PO-11 — historical rows.** Retirement and geometry validity are separate
concerns. For new editing or new document creation a retired Product Side or
Embroidery Area is **not selectable**. For an existing historical document that
already references the same stable placement rows, retired placement remains
renderable and geometrically valid. `APP3-P02` must expose the distinction
explicitly as `NEW_EDITING` versus `HISTORICAL_RENDER`. Retirement is never
treated as deletion, and a historical document is never silently moved to
`superseded_by_id`.

**PO-12 — integrity consequence.** The v1 document hash does not encode these
semantics separately, so **`IMP-D045` is part of the semantic interpretation of
`schemaVersion = 1`**. Approval, rendering and production systems must all use a
geometry-engine version compatible with it. A change to pivot, rotation
direction, scale origin, group frame, composition order, bounds strategy,
containment strategy or `pxPerMm` source is a **schema-semantic change** and
cannot ship as an internal refactor; it requires a new Product Owner decision, a
document schema-version increase, an explicit migration and a new canonical
approval/rendering contract. The phase must later record the geometry-engine
compatibility version in approval and rendering implementation evidence.
`G05_DB_CONTRIBUTION = NONE`.

### 6.11.3 Why the spike is not authority

`APP3-P02`'s first attempt stopped at `FAILED — MANUAL INTERVENTION REQUIRED`
because no accepted document defined rotation origin, rotation direction, scale
origin, group coordinate semantics, composition order or a bounds strategy — and
the APP0-R01 spike, the only executable source, contradicts itself:

| Adapter | Rotation / scale pivot | Group transform applied to children |
|---|---|---|
| SVG (`adapters/svg/scene.tsx`) | box centre | all of it — children nest inside the group's `<g transform>` |
| Konva (`adapters/konva/scene.tsx`) | top-left — no `offsetX`/`offsetY` | scale and opacity only — `x`, `y`, `rotation` are zeroed |
| Fabric (`adapters/fabric/objects.ts`) | top-left — default `originX`/`originY` | none — the group is constructed empty |

The identical cross-engine canonical hash proved **serialization** agreement
only: the hash is over the document, which stores `x`, `y`, `rotationDeg`
whatever a renderer does with them. APP0-R01 itself recorded the gap — *"the
document box centre is not a reliable hit point. Hit testing must be asked of the
engine, never derived from document geometry."*

The three adapters are therefore **comparative research evidence, not production
authority**. `IMP-D045` is independent of all three: it happens to agree with the
SVG adapter on pivot and inheritance, but it is locked because the Product Owner
ruled it, not because a renderer defaulted to it. `IMP-D026` keeps native SVG as
the renderer architecture, and the renderer now **implements** `IMP-D045` rather
than defining it.

The stop was necessary rather than cautious: a v1 document stores `x`, `y`,
`rotationDeg` with **no pivot marker**, so a later change of convention would
silently relocate every stored design while the integrity hash — which is over
the bytes, not the interpretation — stayed valid. PO-12 exists to make that
class of change impossible to ship quietly.

### 6.11.4 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-G05` |
|---|---|---|
| `APP3-G01` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-DB01` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-F01` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P01` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G05` | whole checkpoint, post-G05 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P02` | whole checkpoint, post-G05 | `BLOCKED_BY_APP3-G05_REVIEW_ACCEPTANCE` |
| `APP3-P02` | first attempt, post-G05 | `FAILED — MANUAL_INTERVENTION_REQUIRED` |
| `APP3-P02` | failure cause, post-G05 | `GEOMETRY_SEMANTICS_NOT_AUTHORIZED_AND_SPIKE_DIVERGENT` |
| `APP3-P02` | resolution, post-G05 | `APP3-G05` |
| `IMP-D045` | authority state | `LOCKED` |
| `APP0-R01 adapters` | evidence class | `COMPARATIVE_RESEARCH_NOT_PRODUCTION_AUTHORITY` |

On human acceptance, `APP3-P02` becomes
`READY_FOR_MANUAL_INTERVENTION_RESUME`.

`APP3-G05` delivers no geometry implementation, no package source, no renderer,
no API, no worker, no schema, no migration, no Figma and no UI. The historical
`APP0-R01`, `APP3-P01` and `APP3-P02` records are not rewritten.

### 6.11.5 `APP3-G05-C1` — stroke and line geometry correction

Human review returned `APP3-G05 = COMPLETE — CORRECTION_REQUIRED`. The
coordinate, pivot, matrix, group, containment, physical-scale and integrity
rulings were accepted; one bounds-authority gap remained, and the delivered
report had disclosed both halves of it.

```text
APP3-G05 delivered authority omitted rectangle/ellipse stroke from bounds and
left the schema-v1 line path unstated.

APP3-G05-C1 restores conservative stroke-aware bounds and fixes the line/freehand
local path semantics before P02 implementation.
```

**The stroke omission.** `rectangle` and `ellipse` carry `strokeWidthPx` in P01,
but PO-08 as delivered expanded only `line` and `freehand`. That contradicted the
stated purpose of `CONSERVATIVE_TRANSFORMED_AABB`: a stroked rectangle could
paint outside the accepted bounds and still pass containment — the strategy
called conservative was, for two of the four stroked kinds, optimistic.

**The unstated line path.** P01's `line` is a `ShapeKind` defined solely by its
transform box; it stores no endpoints. Without a ruled path, P02 could not
compute deterministic bounds and no two renderers were obliged to draw the same
segment. v1 now locks it as the straight segment `(0,0)` → `(width,height)`.

Both are corrections to the drawable-geometry and stroke-envelope portion of
PO-08 and its dependent containment evidence. **No new decision id** was created
and **no other ruling changed**: `IMP-D045` was corrected in place before review
acceptance, and every accepted fact in §6.11.1 above it stands.

**No v1 schema change was required.** Every corrected rule reads existing fields:
`strokeWidthPx` on `ShapeElement` and `FreehandElement`, `width`/`height` for the
line path, `points` for the polyline. The fixed `lineCap`, `lineJoin` and
`miterLimit` are **version-level constants** and are deliberately *not* added to
the document — a customer never chooses them in v1, and adding them would have
been the schema change this correction is required to avoid.

| Checkpoint | Portion | Status after `APP3-G05-C1` |
|---|---|---|
| `APP3-G05-C1` | whole correction | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-G05` | whole checkpoint, post-C1 | `COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW` |
| `APP3-P02` | whole checkpoint, post-C1 | `BLOCKED_BY_APP3-G05_CORRECTION_REVIEW` |
| `IMP-D045` | authority state, post-C1 | `LOCKED` — PO-08 corrected in place |
| `IMP-D045` | rulings changed by C1 | `PO-08 drawable geometry and stroke envelope` |
| `IMP-D045` | rulings unchanged by C1 | `PO-01 PO-02 PO-03 PO-04 PO-05 PO-06 PO-07 PO-10 PO-11 PO-12` |
| `v1 schema` | change required by C1 | `NONE` |

`APP3-G05-COMPLETION-REPORT.md` and `APP3-P01-COMPLETION-REPORT.md` are
historical evidence and are not rewritten; this section is the forward record.

## 6.12 `APP3-P02` — production design-engine geometry foundation

Resumed after the manual intervention. `APP3-G05` and its `C1` correction
supplied the geometry contract the first attempt stopped for; nothing else about
the checkpoint changed.

### 6.12.1 Delivered scope

`packages/design-engine` now owns coordinate and matrix primitives, effective
element and group transforms, local drawable envelopes, stroke-aware transformed
AABBs, group and document bounds, placement-authority reconciliation, px↔mm
conversion, Embroidery Area containment, physical-size validation and typed
geometry findings. Its **only** production dependency is the public root of
`@embroidery/design-document`.

| Key | Value |
|---|---|
| `Rotation implementation` | `a = cos, b = sin, c = -sin, d = cos` (clockwise, y-down) |
| `Local matrix implementation` | `T(centre) x R x S x T(-half)`, scale first |
| `Composition implementation` | parent outermost, root-first chain |
| `Envelope implementation` | stroke-aware, expanded **before** transform |
| `Bounds implementation` | four envelope corners through the effective matrix |
| `Containment implementation` | full AABB inside the area, boundary-inclusive |
| `Conversion implementation` | Product Side `pxPerMm` only |
| `Placement modes implemented` | `NEW_EDITING`, `HISTORICAL_RENDER` |
| `Quantization` | reuses P01 `quantizeNumber`; no second precision |
| `Singularity threshold` | `1e-12`, matrix inversion **only** |
| `Document mutation` | `NONE` |
| `Node built-in imports` | `NONE` — the package is browser-safe |

### 6.12.2 What the engine refuses to do

It never mutates a document, never rebases a group's children, never flattens a
group and never moves an element to make it fit. Containment and physical-size
validation return findings; the caller decides the workflow, and a document-write
API must treat a finding as a validation failure (PO-09).

Called directly with input `APP3-P01` never validated — which a caller may do —
it fails safely: an unknown element, an unresolvable, ambiguous or cyclic parent
chain (§6.13), a negative stroke width or a non-finite coordinate produce a typed
finding rather than a throw or an unbounded walk.

### 6.12.3 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-P02` |
|---|---|---|
| `APP3-G01` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G02` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G03` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-DB01` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-F01` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P01` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G05` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G05-C1` | whole correction, post-P02 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P02` | whole checkpoint, post-P02 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P02` | first attempt, post-P02 | `FAILED — MANUAL_INTERVENTION_REQUIRED` |
| `APP3-P02` | resolution, post-P02 | `APP3-G05` |
| `APP3-B03` | whole checkpoint, post-P02 | `READY — NOT STARTED` |
| `APP3-B04` | whole checkpoint, post-P02 | `BLOCKED_BY_APP3-B06` |
| `APP3-B05` | whole checkpoint, post-P02 | `READY_BY_P01 — BLOCKED_BY_APP3-B04` |
| `APP3-B06` | whole checkpoint, post-P02 | `READY — NOT STARTED` |
| `APP3-B07` | whole checkpoint, post-P02 | `READY_BY_P01_AND_P02 — NOT STARTED` |
| `APP3-B08` | whole checkpoint, post-P02 | `READY_BY_P01_AND_P02 — NOT STARTED` |
| `APP3-S11` | whole checkpoint, post-P02 | `FOUNDATION_READY_BY_P01_AND_P02 — NOT STARTED` |
| `IMP-D045` | implementation state | `IMPLEMENTED_BY_APP3-P02` |

No backend or UI checkpoint is complete. `APP3-P02` delivers no renderer, no API,
no worker, no schema, no migration, no Figma and no UI, and changes no
`packages/design-document` source. The historical `APP3-G05`, `APP3-G05-C1` and
`APP3-P01` records are not rewritten.

## 6.13 `APP3-P02-C1` — ambiguous group parentage is rejected

Human review returned `COMPLETE — CORRECTION_REQUIRED`. The matrix, transform,
envelope, stroke, placement, px↔mm, containment and physical-size implementation
was accepted; one direct-call safety defect was not.

The delivered graph kept the **first** group that claimed a child. That
contradicts the structural contract — an element has at most one direct group
parent — and an invalid graph with two claims has no authoritative effective
transform to choose from. Selecting one silently accepted invalid input, made
geometry depend on group and document order, could produce an incorrect AABB,
could evaluate containment against the wrong transform, and hid an upstream
validation bypass.

### 6.13.1 Corrected rule

| Key | Value |
|---|---|
| `Parent claims per element` | zero or one; more is invalid |
| `Repeated child in one group` | invalid |
| `Group listing itself` | invalid |
| `Child not in the document` | invalid |
| `Winner selection` | `NONE` — no first, last, id or z-order rule exists |
| `Invalid-graph parent map` | empty, never partial |
| `Invalid-graph finding` | `INVALID_PARENT_CHAIN` (`UNKNOWN_ELEMENT` for an unknown child) |
| `Finding order` | element order, then unknown ids sorted — independent of group order |
| `Document normalization` | `NONE` — no claim dropped, no `childIds` rewritten |

Claims are staged while indexing and become a parent map only once every one of
them is known to be unambiguous, so no partial map is ever exposed.

### 6.13.2 Dependent public paths

Effective-transform resolution, `getElementBounds`, `getGroupBounds`,
`getDocumentBounds`, `validateElementWithinEmbroideryArea`,
`validateDocumentWithinEmbroideryArea` and both physical-size validators reject
an ambiguous graph. Each returns a finding that names the contested child and no
bounds; none returns `INVALID_PARENT_CHAIN` beside an authoritative-looking AABB.
`getDocumentBounds` now returns `Bounds2D | GeometryFinding | undefined`, because
`undefined` alone would let an unmeasurable document read as an empty one.

Valid-graph behaviour is unchanged: every rotation, scale, composition, stroke,
containment and conversion vector delivered by `APP3-P02` still holds, and
`IMP-D045` is untouched.

### 6.13.3 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-P02-C1` |
|---|---|---|
| `APP3-P02` | whole checkpoint, post-C1 | `COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW` |
| `APP3-P02-C1` | whole correction, post-C1 | `COMPLETE — REVIEW_DELIVERED` |
| `IMP-D045` | ruling text, post-C1 | `UNCHANGED` |
| `APP3-P01` | whole checkpoint, post-C1 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G05` | whole checkpoint, post-C1 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B07` | whole checkpoint, post-C1 | `READY_BY_P01_AND_P02 — NOT STARTED` |
| `APP3-B08` | whole checkpoint, post-C1 | `READY_BY_P01_AND_P02 — NOT STARTED` |

`APP3-P02-C1` changes no document schema, no API, no database, no renderer and no
`packages/design-document` source.

## 6.14 `APP3-B01` — Product placement authoring and public manifest

The first APP3 backend slice: three HTTP operations that let an Admin author a
Product's placement model and let the Storefront read the active part of it.
Implementation belongs to **Product/Catalog** (IMP-D041 PO-01); the Design module
is not imported and does not exist yet.

### 6.14.1 Delivered surface

| Method and path | Operation id | Auth |
|---|---|---|
| `GET /api/admin/products/:productId/placement` | `adminProductPlacement_get` | Admin session |
| `PUT /api/admin/products/:productId/placement` | `adminProductPlacement_replace` | Admin session + origin/JSON guards |
| `GET /api/public/products/:slug/placement` | `publicProductPlacement_get` | anonymous |

No individual side or area operation, no media stream, no asset upload, no
Template and no Session operation exists.

| Key | Value |
|---|---|
| `Placement module owner` | `CatalogPlacementModule` (Product/Catalog) |
| `Admin read scope` | active **and** retired rows |
| `Public read scope` | active rows only |
| `Ordering` | `display_order`, `code`, `id` — total on every read |
| `Concurrency token` | `products.updated_at`, guarded in one statement; published as `updatedAt` / `expectedUpdatedAt` (§6.15) |
| `Removal path` | retirement; no `delete` exists in the repository |
| `Geometry authority` | `@embroidery/design-engine` (IMP-D045), never re-implemented |
| `Background lane` | `CATALOG_MEDIA` / `PRODUCTION_SENSITIVE` / `ACCEPTED`, SVG rejected |
| `Editor-safe derivative` | `NORMALIZED` + `READY` + the full canonical quartet |
| `Object-storage reads` | `NONE` — dimensions come from `asset_derivatives` |
| `Audit action` | `product.placement_replaced`, bounded counts only |
| `Outbox event` | `NONE` — no event type is locked and no consumer exists |
| `Schema or migration change` | `NONE` |

### 6.14.2 Replace semantics

A side or area carrying an `id` is retained and updated; one without an `id` is
created; one that is **omitted is retired**, never deleted. A new row may name
the row it replaces through `supersedesId`, within the same parent only, and the
replaced row is retired with `superseded_by_id` pointing at it. An empty `sides`
list retires the whole placement, which is legitimate: publication never required
placement (PO-06).

Everything is validated before a single row is written, so one bad side leaves
the previous placement exactly as it was. The `APP3-DB01` guard triggers remain
the authority on a **referenced** row: identity and geometry are refused,
display copy and ordering are allowed, and a hard delete is rejected by the
database whatever asked for it. A guard refusal is translated into a stable
error and never retried by deleting and re-inserting the protected row.

### 6.14.3 `studioEligible`

Derived, never stored, and true only when **one** side is completely usable: at
least one active Embroidery Area *and* a background whose asset is in the
side-background lane, is not tombstoned, and has a `READY` `NORMALIZED`,
unwatermarked, stored derivative carrying `width_px`, `height_px`, `media_type`
and `byte_size`. Areas on one side and a usable background on another produce
`false`, because nothing could actually be designed.

Incomplete placement or unfinished processing yields `false` and never fabricated
geometry. The manifest carries **no** background asset id, retirement, storage
key, original or derivative URL or inspection detail; a background is addressed
by the reference components `APP3-B02` will be keyed by — Product slug and Side
code — and by no URL, because that route does not exist yet.

`APP3-B01` streams and presigns nothing, and does not close
`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`.

### 6.14.4 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-B01` |
|---|---|---|
| `APP3-B01` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-P02` | whole checkpoint, post-B01 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B02` | whole checkpoint, post-B01 | `BLOCKED_BY_APP3-B06` |
| `APP3-A01` | whole checkpoint, post-B01 | `BACKEND_READY_BY_APP3-B01 — BLOCKED_BY_APP3-D01` |
| `APP3-D01` | placement portion, post-B01 | `BACKEND_CONTRACT_AVAILABLE_BY_APP3-B01` |
| `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` | disposition, post-B01 | `OPEN — FINAL_OWNER_APP3-B02` |

## 6.15 `APP3-B01-C1` — the concurrency token becomes a published contract

Human review returned `COMPLETE — CORRECTION_REQUIRED`. The three operations,
DB01 protection, public projection, Studio eligibility, geometry delegation and
disposable-database coverage were accepted. One HTTP-contract gap was not.

The compare-and-set on `products.updated_at` was correct and enforced, but the
**published** contract did not show it: `ReplaceProductPlacementBody` rendered as
an empty object, so a client reading the document could not see that
`expectedUpdatedAt` exists, let alone that it is required, and the generated
client typed the body as an empty interface. A server-side CAS whose token the
client cannot obtain and submit is not a complete concurrency contract.

The cause is platform-wide, not placement-specific: `createZodDto` carries the
Zod schema for the validation pipe and **no** OpenAPI metadata, so every
schema-backed body in the repository publishes empty — `UpdateProductBody`,
`ArchiveProductBody` and the publication bodies included. Runtime validation was
never affected. The correction is scoped to the placement body; repairing
`createZodDto` would change five APP2 schemas belonging to accepted checkpoints.

### 6.15.1 The contract

| Key | Value |
|---|---|
| `Token authority` | `products.updated_at` — no placement revision column |
| `Response field` | `updatedAt` (Admin read **and** successful replace) |
| `Request field` | `expectedUpdatedAt`, required |
| `Wire format` | `z.string().datetime({ offset: true })` — the Catalog convention |
| `Stale-write code` | `PLACEMENT_VERSION_CONFLICT` (409) |
| `Public exposure` | `NONE` — the manifest carries neither field |
| `Missing token` | rejected; never defaulted, never read from the database |
| `CAS position` | the opening write of the replacement transaction |

```text
GET  placement                → T1
PUT  placement (expects T1)   → CAS succeeds, commits, returns T2
PUT  placement (expects T1)   → rejected, no side or area written
```

A second convention divergence was corrected with it: the placement token used a
bare `datetime()`, so it refused a token carrying an offset (`+07:00`) that the
same client could send to every other Admin Product write.

### 6.15.2 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-B01-C1` |
|---|---|---|
| `APP3-B01` | whole checkpoint, post-C1 | `COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW` |
| `APP3-B01-C1` | whole correction, post-C1 | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-B02` | whole checkpoint, post-C1 | `BLOCKED_BY_APP3-B06` |
| `APP3-A01` | whole checkpoint, post-C1 | `BACKEND_READY_BY_APP3-B01 — BLOCKED_BY_APP3-D01` |

Zero new paths and zero new operations; the correction is schema-only, plus two
bounded request component schemas so the documented body is usable rather than
merely truthful about its token. No database schema, migration, worker, renderer,
UI or dependency change.

## 6.16 `APP3-G06` — normalization dispatch and raster/SVG staging authority

`APP3-W01` stopped at `FAILED — MANUAL INTERVENTION REQUIRED` having written
nothing and committed nothing. `APP3-G06` supplies the authority it stopped for,
locked as **`IMP-D046`**. It is a Product Owner / application-architecture gate:
it implements no worker, no API, no schema and no dependency, and it does not
weaken `IMP-D044`.

### 6.16.1 Measured cause of the stop

Four facts, all recomputed from the repository rather than restated:

| Machine-checked normalization fact | Value |
|---|---|
| `Existing asset event` | `asset.inspection.requested` |
| `Existing asset event payload` | `schemaVersion + assetId` |
| `Existing event append point` | `UPLOAD_TRANSACTION_UPLOADED_TO_INSPECTING` |
| `Association state at inspection` | `NOT_YET_AVAILABLE` |
| `Existing SVG sanitizer` | `NONE` |
| `New normalization event` | `asset.normalization.requested` |
| `New normalization event count` | `1` |
| `Normalization payload schema version` | `1` |
| `Normalization policy version` | `1` |
| `Normalization job kind` | `ASSET_PROCESSING` |
| `Normalization queue architecture` | `EXISTING_OUTBOX_AND_WORKER` |
| `New queue or scheduler` | `NONE` |
| `Normalization migration` | `NONE` |
| `Profile persistence` | `NONE` |
| `New derivative kind` | `NONE` |
| `Association reference kinds` | `PRODUCT_SIDE_BACKGROUND DESIGN_TEMPLATE_ASSET DESIGN_SESSION_ASSET` |
| `Association reference fields` | `productSideId designTemplateAssetId designSessionAssetId` |
| `Profile derivation` | `WORKER_REREADS_ASSOCIATION_AT_CLAIM` |
| `Producer transaction` | `SAME_TRANSACTION_AS_ASSOCIATION_WRITE` |
| `Stale association outcome` | `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` |
| `W01 disposition` | `REPLANNED_INTO_W01A_AND_W01B` |
| `W01A source scope` | `RASTER_ONLY` |
| `Template SVG availability` | `AUTHORIZED_BUT_UNAVAILABLE_UNTIL_W01B` |
| `SVG sanitizer owner` | `APP3-G07` |
| `SIDE_BACKGROUND trigger owner` | `APP3-B01N` |
| `B01N HTTP operations` | `0` |
| `G06 application change` | `NONE` |

`asset.inspection.requested` is appended inside the upload transaction as an
Asset moves `UPLOADED → INSPECTING`; its payload is exactly
`{ schemaVersion, assetId }` and unknown fields are terminal. At that moment
`product_sides.background_asset_id` cannot yet name the Asset — placement
authoring refuses anything not already `ACCEPTED`, which is what that very job
produces — and neither `design_template_assets` nor `design_session_assets` has
any writer, because `DesignModule` is not composed into `AppModule`. The profile
was therefore underivable, and no sanitizer existed to make Template SVG safe.

### 6.16.2 The twelve rulings

**PO-01 — one new event, same architecture.** Exactly one new event type,
`asset.normalization.requested`, reusing the existing transactional Outbox,
dispatcher, claim/heartbeat/retry mechanism, attempt evidence and dead-letter
behaviour, and the existing `ASSET_PROCESSING` job kind. Not a second queue,
scheduler, sweep, claim table, retry framework or cron reconciler.
`outbox_events.event_type` is open text with no CHECK and the worker resolves
handlers from a registry keyed on event type, so this costs **no migration**.
`asset.inspection.requested` is unchanged and never repurposed.

**PO-02 — the payload identifies the association, not the profile.**
Schema version `1`; payload `schemaVersion`, `assetId`,
`normalizationPolicyVersion` (locked at `1`) and `associationRef`, a
discriminated union over `PRODUCT_SIDE_BACKGROUND` (`productSideId`),
`DESIGN_TEMPLATE_ASSET` (`designTemplateAssetId`) and `DESIGN_SESSION_ASSET`
(`designSessionAssetId`). All three are stable opaque primary keys that exist
today. The payload never carries a profile, ownership claim, storage key, URL,
session secret, customer id or raw SVG. It says which committed association
triggered work; it does not assert that association is still valid.

**PO-03 — the profile is derived by the worker.** At claim time the worker
re-reads the association and the Asset, mapping exactly
`PRODUCT_SIDE_BACKGROUND → SIDE_BACKGROUND`,
`DESIGN_TEMPLATE_ASSET → TEMPLATE_ASSET` and
`DESIGN_SESSION_ASSET → SESSION_UPLOAD`, and proves existence, the pointer to
`assetId`, owner/context, active lifecycle where required, and the Asset's
classification, kind and processable state. A discriminator is a lookup key, not
authorization: no caller-supplied profile, no profile from MIME alone, and no
scanning an Asset's associations to pick one.

**PO-04 — association-bound producer timing.** The event is appended by the
write that creates or changes the association, in the same transaction, ordered
association write → outbox append → commit. A rolled-back association produces
no visible event. Nothing is appended on a read, a no-op save, a removal without
a replacement Asset, or an original upload. An event *is* appended on a new
active association, on a change to another Asset, and on a future authorized
reprocess command. A derivative is Asset-owned and is not deleted because an
association moved away.

**PO-05 — producer ownership follows the association write.** `APP3-B01N`
appends after a new or changed `product_sides.background_asset_id`, touching only
the accepted B01 replacement transaction and adding **zero** HTTP paths,
operations and schemas; it is not a B01 correction. `APP3-B03` appends in the
`design_template_assets` transaction and rejects SVG Template intake with a
stable capability-unavailable error until W01B. `APP3-B06` appends in the
`design_session_assets` transaction, never in the raw-upload inspection
transaction. No endpoint exists merely to enqueue normalization.

> **Producer ownership superseded — `APP3-B03` → `APP3-B03A` (§6.25).** The
> ruling above is the `IMP-D046` text as issued and is not rewritten. Its
> principle, *producer ownership follows the association write*, is unchanged and
> is what moves the name: `APP3-B03` was split, and the checkpoint that now
> writes `design_template_assets` during draft authoring is **`APP3-B03A`**.
> `APP3-B03` performs no document save and therefore mutates no association.
> Everything else in PO-05 stands exactly — the same
> `design_template_assets` transaction, the same `asset.normalization.requested`
> at `schemaVersion 1` / `normalizationPolicyVersion 1` with
> `associationRef.kind = DESIGN_TEMPLATE_ASSET`, the same association-write →
> append → commit ordering, the same refusal to append on a read, a no-op save or
> a removal without a replacement, and still no endpoint whose purpose is to
> enqueue normalization. `APP3-B06`'s clause was already carried out by
> `APP3-B06B`.

**PO-06 — the worker is replanned.** `APP3-W01` is
`REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B` and is never marked complete.
`APP3-W01A` is raster-only (JPEG/PNG/WebP across all three profiles), consumes
schema version 1, and produces a `READY`, unwatermarked `NORMALIZED` derivative
with the canonical quartet in a private object; it may be tested by inserting the
ruled event directly into the disposable harness before any producer exists.
`APP3-W01B` covers only Template SVG and changes no raster behaviour.

**PO-07 — SVG is staged, not dropped.** `APP3-G07` selects and locks the
sanitizer implementation, element and attribute sets, namespace handling,
URL/reference policy, CSS and font/text policy, `viewBox` authority, node and
path-data counting, deterministic serialization, output MIME and encoding,
dependency version/licence policy and a security regression corpus. Until G07 and
W01B are accepted, Template SVG is **authorized by IMP-D044 and operationally
unavailable**, rejected safely. No silent rasterization through Sharp, no regex
sanitization, no browser DOM as an implicit sanitizer, no package chosen in
W01A, and no reinterpretation of SVG as raster by extension.

**PO-08 — event idempotency.** Logical identity is `assetId` +
`normalizationPolicyVersion` + kind `NORMALIZED`. The association proves
authorization, not a per-association derivative. Duplicate delivery, different
eligible associations and concurrent claims converge on one authoritative
`READY NORMALIZED` row under existing uniqueness and claim rules, and the worker
still validates the triggering association before accepting an existing result.
Neither profile nor association id is persisted on `asset_derivatives`.

**PO-09 — stale association behaviour.** A claimed event whose association is
gone, re-pointed, retired, foreign-owned or misclassified completes as a bounded
**non-retryable** rejection, `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE`, with no
derivative and no private owner data in the detail. An absent association is
never an infrastructure retry.

**PO-10 — deployment order.** `APP3-W01A` → `APP3-B01N` → `APP3-G07` →
`APP3-W01B`, never combined. The consumer first, so no producer emits events
nothing can handle; B01N then enables SIDE_BACKGROUND without reopening B01; G07
is security authority, not worker implementation; W01B extends only Template SVG.

**PO-11 — B02 dependency correction.** After W01A and B01N,
`APP3-B02 = BLOCKED_BY_APP3-B01N` plus any platform HTTP-schema
blocker its contract carries. `APP3-B06` is **not** the SIDE_BACKGROUND trigger
owner; it owns Session Asset association only.

**PO-12 — the platform OpenAPI follow-up stays separate.**
`FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01` remains open. G06, W01A, G07, W01B and
B01N add no HTTP request-body schema and are not blocked by it; B03 and B06 stay
blocked when they introduce one. `createZodDto` is not repaired here.

### 6.16.3 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-G06` |
|---|---|---|
| `APP3-G06` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-W01` | first attempt, post-G06 | `FAILED — MANUAL_INTERVENTION_REQUIRED` |
| `APP3-W01` | disposition, post-G06 | `REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B` |
| `APP3-W01A` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-G06_REVIEW_ACCEPTANCE` |
| `APP3-B01N` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-W01A` |
| `APP3-G07` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-G06_REVIEW_ACCEPTANCE` |
| `APP3-W01B` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-W01A_AND_APP3-G07` |
| `APP3-B02` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-W01A_AND_APP3-B01N` |
| `APP3-B03` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-W01A_AND_PLATFORM_ZOD_OPENAPI_FOLLOW_UP` |
| `APP3-B06` | whole checkpoint, post-G06 | `BLOCKED_BY_APP3-W01A_AND_PLATFORM_ZOD_OPENAPI_FOLLOW_UP` |
| `APP3-B01` | whole checkpoint, post-G06 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-G06 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-DB01` | whole checkpoint, post-G06 | `COMPLETE — REVIEW_ACCEPTED` |

`APP3-W01A` and `APP3-G07` become `READY — NOT STARTED` on human acceptance of
G06; the execution recommendation is `APP3-W01A` first.

`APP3-G06` implements nothing: no API, worker, package, schema, migration,
OpenAPI, generated client, dependency, infrastructure or Figma change.

## 6.17 `APP3-G07` — Template SVG sanitizer and deterministic normalization authority

`APP3-G06` PO-06/PO-09 authorized Template SVG under `IMP-D044` while making it
operationally unavailable, and named `APP3-G07` as the owner of the sanitizer
choice. `APP3-W01A` shipped the raster consumer and returns
`TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE` for `image/svg+xml`. `APP3-G07`
supplies the missing authority, locked as **`IMP-D047`**. It is a security and
application-architecture gate: it installs nothing, implements nothing and
changes no schema, OpenAPI artifact, generated client or infrastructure.

### 6.17.1 Verified upstream facts

Verified 2026-08-04 against the official npm registry metadata and the official
project repositories. Nothing below is remembered; each value was fetched.

| Machine-checked sanitizer fact | Value |
|---|---|
| `Sanitizer` | `DOMPURIFY_ON_JSDOM` |
| `Sanitizer package` | `dompurify` |
| `Sanitizer version` | `3.4.13` |
| `Sanitizer license` | `MPL-2.0 OR Apache-2.0` |
| `Sanitizer runtime dependencies` | `0` |
| `Sanitizer repository` | `https://github.com/cure53/DOMPurify` |
| `DOM package` | `jsdom` |
| `DOM version` | `29.1.1` |
| `DOM license` | `MIT` |
| `DOM repository` | `https://github.com/jsdom/jsdom` |
| `Locked worker runtime` | `22.14.0` |
| `Latest jsdom` | `30.0.1` |
| `Latest jsdom usable` | `NO_LOCKED_RUNTIME_TOO_OLD` |
| `Version range form` | `EXACT_PIN_ONLY` |
| `Install or postinstall script` | `NONE` |
| `Path data parser` | `PACKAGE_OWNED_DETERMINISTIC_PARSER` |
| `Path parser dependency` | `NONE` |
| `SVGO role` | `NOT_A_SANITIZER_AND_NOT_RUN_IN_V1` |
| `Sharp role` | `NOT_A_SANITIZER_AND_NEVER_RASTERIZES_TEMPLATE_SVG` |
| `Regex sanitization` | `FORBIDDEN` |
| `Headless browser` | `FORBIDDEN` |
| `Sanitization policy version` | `1` |
| `Sanitization policy persistence` | `WORKER_POLICY_NOT_DATABASE` |
| `New derivative kind` | `NONE` |
| `G07 dependency install` | `NONE` |
| `G07 application change` | `NONE` |

The one finding that changes the answer: **the newest jsdom cannot be used.**
`jsdom@30.0.1` declares `engines.node` as `^22.22.2 || ^24.15.0 || >=26.0.0`, and
every application image is `node:22.14.0-alpine`. `22.14.0` does not satisfy
`^22.22.2`. `jsdom@29.1.1` is the newest release whose range (`^20.19.0 ||
^22.13.0 || >=24.0.0`) the locked runtime satisfies, so that is the pin. Raising
the base image is an infrastructure decision this gate has no standing to make,
and pinning a jsdom the runtime cannot start would have surfaced only in the
container.

### 6.17.2 Locked rulings (`IMP-D047`)

**PO-01 — the sanitizer is DOMPurify on server-side Node with jsdom.**
`dompurify@3.4.13` is the active-content and XSS defence layer; `jsdom@29.1.1`
supplies the DOM it operates on. This is an explicitly approved server-side
sanitizer architecture, not an implicit browser DOM. `APP3-W01B` must pin both
exactly — no `*`, `latest`, caret or tilde — and must not select
`isomorphic-dompurify`, a `sanitize-svg` wrapper, regex-only sanitization, a
headless browser, SVGO or Sharp in the sanitizer role. Sharp never rasterizes a
Template SVG; a raster fallback would silently change what an Admin approved.

**PO-02 — DOMPurify's defaults are not the APP3 policy.**
DOMPurify by default permits HTML, SVG and MathML and is a *removal* engine. The
APP3 contract is narrower on both counts: explicit allowlists, value validation,
namespace and URL rejection, complexity limits, deterministic serialization and a
fixed-point second pass. DOMPurify runs with the SVG namespace, HTML and MathML
disabled, and with XML parsing (`PARSER_MEDIA_TYPE` set to an XML media type) so
XML safety is retained. `DOMPurify.removed` is **diagnostic only** and is never
the security decision — the decision is the repository's own validation.

**PO-03 — SVGO is an optimizer and is not run in v1.**
SVGO describes itself as "a Node.js library and command-line application for
optimizing SVG files". Optimization is not a security boundary, and DOMPurify's
own documentation warns that if you "first sanitize HTML and then modify it
afterwards, you might easily void the effects of sanitization". Both reasons
point the same way: no optimizer runs after the sanitizer, and none runs at all
in v1.

**PO-04 — input form.** UTF-8; source bytes at most 1 MiB; strict XML parsing and
never HTML error recovery; exactly one root `<svg>`; root namespace
`http://www.w3.org/2000/svg`; no foreign namespace; no DOCTYPE, entity
declaration or processing instruction; no external entity resolution of any kind.

**PO-05 — reject the whole file.** Any unsupported element, attribute or value
rejects the complete file with the stable non-retryable outcome
`UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG`. Content is never silently removed: a
Template that renders differently from what an Admin approved is a worse outcome
than a refused upload, because nobody is told.

**PO-06 — element allowlist.** Exactly `svg`, `g`, `path`, `rect`, `circle`,
`ellipse`, `line`, `polyline`, `polygon`. Everything else rejects, explicitly
including `script`, `foreignObject`, `image`, `a`, `style`, all text and font
elements, `use`, `symbol`, `defs`, gradients, `marker`, `pattern`, `mask`,
`clipPath`, filters, `metadata`, `title`, `desc` and every animation element.

**PO-07 — attribute allowlist.** Root attributes are exactly `xmlns` and
`viewBox`. Elsewhere, only where semantically valid: `transform`, `fill`,
`fill-opacity`, `fill-rule`, `stroke`, `stroke-width`, `stroke-opacity`,
`stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`,
`stroke-dashoffset`, `opacity`, `x`, `y`, `width`, `height`, `rx`, `ry`, `cx`,
`cy`, `r`, `x1`, `y1`, `x2`, `y2`, `points`, `d`. Always rejected: `id`, `class`,
`style`, `href`, `xlink:href`, `src`, every `on*`, every `data-*`, every `aria-*`,
`tabindex`, `role`, `xml:base`, `xml:space`, every `xmlns:*` beyond the root
`xmlns`, and `vector-effect`. No custom element and no custom attribute.
Rejecting `id` is also the DOM-clobbering defence.

**PO-08 — no URL, CSS, reference or font.** Every URI and reference form is
rejected wherever it appears: `url(...)`, `var(...)`, `javascript:`, `data:`,
`blob:`, `http:`, `https:`, `ftp:`, `file:`, `cid:`, relative and
protocol-relative URLs, and `#fragment` references. No CSS, no `style` element or
attribute, no class, no external resource, no remote or embedded font, no text
rendering, and no `currentColor`, `context-fill` or `context-stroke`. Paint is
explicit presentation attributes only.

**PO-09 — value grammar.** All numbers are finite base-10 with no unit, no
percentage, no `calc()`, no `NaN` and no `Infinity`, canonicalized so `-0`
becomes `0`, with no leading `+`, no unnecessary zeros and one representation per
value. **Clarified by `APP3-W01B-C1`:** "one representation per value" means the
shortest decimal token that parses back to the identical IEEE-754 binary64
value — never a fixed decimal precision budget. A budget rounds, and rounding a
valid finite coordinate is a silent visual modification of an approved Template,
which PO-05 forbids. Lowercase exponent notation with no `+` and no leading
exponent zeros is the canonical form wherever shortest-round-trip printing needs
it. Paints are `none`, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
`rgb(integer integer integer)` or `rgb(integer integer integer / alpha)`,
canonicalized to lowercase `#rrggbb`, `#rrggbbaa` or `none`; named colours,
`currentColor`, `hsl`, `lab`, `lch`, `color`, `device-cmyk`, `var` and `url` are
rejected. Enumerations are exactly `fill-rule: nonzero | evenodd`,
`stroke-linecap: butt | round | square` and
`stroke-linejoin: miter | round | bevel`. Opacities lie within `0..1`; stroke
widths and dash values are non-negative; `stroke-miterlimit` is positive.

**PO-10 — transform, viewBox, points and path.** Transforms are exactly
`matrix(a b c d e f)`, `translate(tx | tx ty)`, `scale(s | sx sy)`,
`rotate(angle | angle cx cy)`, `skewX(angle)` and `skewY(angle)` with finite
arguments, exact arity and degrees — no CSS transform syntax, no 3D, no
`transform-origin` — and function order is preserved and serialized canonically.
`viewBox` is exactly four finite numbers with a positive integer width and
height, `width` at most 4096, `height` at most 4096 and
`width × height` at most 16,777,216. The derivative metadata is
`width_px = viewBox width` and `height_px = viewBox height` with no rounding, no
DPI and no fallback to a root `width`/`height`. `points` requires a valid, even
coordinate count. `d` is parsed as real SVG path grammar for `M/L/H/V/C/S/Q/T/A/Z`
including exact arity and `0`/`1` arc flags; a permissive character regex is
forbidden. The parser is **package-owned and deterministic** — the repository
already owns its geometry semantics under `IMP-D045`, so no audited parser
dependency is required and `APP3-W01B` adds none.

**PO-11 — complexity limits.** Source bytes at most 1 MiB; sanitized and
canonical nodes at most 10,000; total canonical path-data characters at most
1,000,000; maximum element depth 64. The boundary passes and boundary plus one
rejects. Nothing is ever truncated into compliance.

**PO-12 — the deterministic pipeline.** `APP3-W01B` runs exactly, in order:
(1) byte limit; (2) forbidden XML form rejection; (3) strict XML parse;
(4) namespace, allowlist, value and complexity validation; (5) DOMPurify with the
exact APP3 policy; (6) reject on any structural removal or change; (7) build the
package-owned canonical representation; (8) deterministic serialization;
(9) reparse, revalidate and sanitize again; (10) reserialize; (11) require the
second bytes to equal the first; (12) derive metadata from the final bytes;
(13) complete through the `APP3-W01A` object, `READY` and quartet protocol. No
mutation and no optimizer after the final pass. Step 11 is the fixed point that
makes step 6 meaningful.

**PO-13 — canonical output.** `media_type = image/svg+xml`, UTF-8, no BOM, XML
declaration omitted, LF line endings, no trailing newline. Serialization
lowercases allowed names; emits the root `xmlns` first and `viewBox` second and
sorts remaining attributes lexicographically; uses double quotes with correct XML
escaping; emits no comment and no insignificant text node; uses one locked
empty-element form consistently; and gives `svg` and `g` explicit start and end
tags. Determinism means identical accepted source bytes plus the exact policy and
dependency versions produce byte-identical output. It does **not** mean that two
semantically equivalent but textually different sources converge.

**PO-14 — policy version and supply chain.**
`TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = 1`, worker policy and never a
database column or a derivative kind. Changing the sanitizer, jsdom or path
parser version, the allowlists, the value grammar, the limits, the serializer or
the `viewBox` rule requires security review, a corpus rerun, and a policy version
increase when behaviour changes. `APP3-W01B` must install with exact lockfile
integrity, make no runtime network call, download no native binary and run no
unapproved install script — neither `dompurify@3.4.13` nor `jsdom@29.1.1`
declares an `install` or `postinstall` script, and `dompurify` has zero runtime
dependencies. **`APP3-G07` installs nothing.**

**PO-15 — sanitization does not authorize delivery.** A sanitized Template SVG
remains private, unwatermarked, `NORMALIZED` and Template-owned. `APP3-G07`
authorizes no generic or public delivery, no inline HTML embedding, no data URL,
no public ACL and no download endpoint. Passing a sanitizer is not the same as
being safe to embed anywhere.

### 6.17.3 Required `APP3-W01B` security corpus

Rejection cases are locked for: `script` and `on*`; `foreignObject` and embedded
HTML; `image`, `href`, `xlink:href` and other external resources; `javascript:`,
`data:`, `blob:`, `http:` and protocol-relative values; `style`, CSS `url()` and
`var()`; text and fonts; `use`, `defs` and references; animation; filters, masks,
clips, gradients and patterns; DOCTYPE, entity and XXE payloads; namespace
confusion; malformed XML and multiple roots; missing, fractional and oversized
`viewBox`; `NaN`, `Infinity`, units and percentages; malformed paths and invalid
arc flags; node, path, depth and byte overflow; DOM-clobbering `id` and `name`;
encoding and case evasions; mutation-XSS and parser-differential fixtures; and
the applicable official DOMPurify SVG regression fixtures.

Acceptance cases are locked for every allowed primitive, nested groups, valid
presentation attributes, every allowed transform, every path command family and
the exact limit boundaries.

The corpus must prove byte and SHA-256 determinism across repeated runs, across
fresh processes on Linux and on Windows where supported, plus fixed-point
equality between the first and second serialization.

### 6.17.4 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-G07` |
|---|---|---|
| `APP3-G07` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-W01B` | whole checkpoint, post-G07 | `BLOCKED_BY_APP3-G07_REVIEW_ACCEPTANCE` |
| `APP3-B03` | whole checkpoint, post-G07 | `BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP_AND_TEMPLATE_SVG_REMAINS_UNAVAILABLE_UNTIL_APP3-W01B` |
| `APP3-W01A` | whole checkpoint, post-G07 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B01N` | whole checkpoint, post-G07 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G06` | whole checkpoint, post-G07 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G04` | whole checkpoint, post-G07 | `COMPLETE — REVIEW_ACCEPTED` |

`APP3-W01B` becomes `READY — NOT STARTED` on human acceptance of G07.

`APP3-G07` implements nothing and installs nothing: no dependency, API, worker,
package, schema, migration, OpenAPI, generated client, infrastructure or Figma
change.

## 6.18 `APP3-W01B` — sanitized Template SVG normalization

`APP3-G07` selected the sanitizer and locked `IMP-D047`; `APP3-W01B` implements
it. It is an **extension of the accepted `APP3-W01A` consumer**, not a second
one: the same event, the same claim, the same deterministic key, the same
`READY`-plus-quartet finalization, the same cleanup and the same attempt
evidence. What is new is one lane — `TEMPLATE_ASSET` plus `image/svg+xml` — and
the deterministic pipeline behind it.

No event type, producer, HTTP operation, OpenAPI schema, generated-client
change, database migration, derivative kind, public delivery route, queue,
scheduler or retry framework was added. SVG remains profile-invalid for
`SIDE_BACKGROUND` and `SESSION_UPLOAD`.

### 6.18.1 Delivered dependencies

| Machine-checked dependency fact | Value |
|---|---|
| `Sanitizer pin` | `dompurify@3.4.13` |
| `DOM pin` | `jsdom@29.1.1` |
| `Version range form` | `EXACT_PIN_ONLY` |
| `Type declarations` | `@types/jsdom@21.1.7` |
| `New external type version` | `NONE_ALREADY_RESOLVED` |
| `Container Node` | `22.14.0` |
| `Container sanitizer smoke` | `PASS` |
| `Install or postinstall script` | `NONE` |
| `Native binary download` | `NONE` |
| `Runtime network call` | `NONE` |
| `Lockfile deletions` | `0` |
| `Package outside worker with sanitizer` | `NONE` |

### 6.18.2 Delivered pipeline

The thirteen `IMP-D047` PO-12 steps run in order, twice. `sanitizeTemplateSvg`
runs one complete pass on the source, then a second pass **on its own canonical
output**, and requires the two serializations to be byte-identical. That fixed
point is what makes "reject on any structural removal" enforceable: the
canonical form is proven to be a value the whole pipeline maps to itself.

The structural comparison builds the canonical model twice — once from the
strictly parsed source and once from whatever DOMPurify returned — with the
**same builder**, so a laxer second reading cannot make the comparison pass.
`DOMPurify.removed` is never read.

Rejection is whole-file, with two outcomes and no third:
`UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG` for anything the policy does not admit, and
`TEMPLATE_SVG_POLICY_VERSION_UNSUPPORTED` for a job asking for sanitization rules
this build does not implement — a statement about the deployment, not the file,
asserted before a byte is read.

`TEMPLATE_SVG_SANITIZATION_POLICY_VERSION` is **defined as**
`NORMALIZATION_POLICY_VERSION` rather than declared beside it, so the producer's
policy version and the sanitizer's cannot drift.

### 6.18.3 Where the staged refusal went

`TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE` is gone. A Template SVG now reaches
a lane discriminator, so an unsafe file is a **content verdict reached after the
claim** — the row exists and is `FAILED`, exactly as an integrity mismatch or an
undecodable raster leaves it. `APP3-W01A` refused before claiming because it
refused a *capability*; judging content means reading it.

### 6.18.4 Disclosed deviation

`APP3-B01N` added `@embroidery/domain-types` as a worker runtime dependency but
no `COPY` line in the production image's `runner` stage, so the shipped worker
resolved a dangling symlink and died on its first import. The defect predates
this checkpoint: the import landed in `2ada703` while
`infrastructure/docker/worker.Dockerfile` was last touched by APP2-I03. The
`APP3-W01B` container proof was the first thing to load that module inside the
runner stage and so the first thing to find it. Two `COPY` lines were added,
mirroring the three workspace packages already shipped. Recorded as
`WORKER_IMAGE_DOMAIN_TYPES_COPY_RESTORED`; no Node image upgrade, no new stage
and no other infrastructure change.

## 6.19 `APP3-W01B-C1` — lossless SVG numeric canonicalization

Human review accepted `APP3-W01B` except for one semantic defect: numbers were
canonicalized to a **fixed six-decimal budget**. A budget rounds, and rounding a
valid finite coordinate silently changes approved geometry — `1e-7` printed as
`0`, so a tiny `translate` collapsed to the identity and a high-precision path
lost its low-order digits. Nothing failed: the corpus passed and the pipeline
reached its fixed point, because rounding a rounded value rounds to the same
place. **A fixed point reached after rounding proves the rounding is stable, not
that the geometry survived.**

### 6.19.1 Corrected semantics

The semantic domain is one finite IEEE-754 **binary64** value. A token is
validated lexically, parsed, checked finite, normalized for `-0`, serialized to
the shortest decimal token that parses back to the identical value, and the
round trip is then **verified** rather than assumed.

| Machine-checked numeric fact | Value |
|---|---|
| `Canonical form` | `SHORTEST_BINARY64_ROUND_TRIP` |
| `Fixed precision budget` | `NONE` |
| `Magnitude ceiling` | `NONE` |
| `Negative zero` | `NORMALIZED_TO_POSITIVE_ZERO` |
| `Exponent form` | `LOWERCASE_NO_PLUS_NO_LEADING_ZEROS` |
| `Plain/exponent threshold` | `NUMBER_PROTOTYPE_TOSTRING` |
| `Round-trip verification` | `ENFORCED_PER_TOKEN` |
| `Numeric authorities` | `ONE` |
| `Design-document quantization applied` | `NO` |

Lexical rules: `-0 → 0`, no leading `+`, lowercase `e`, no `+` or leading zeros
in the exponent, no unnecessary trailing fractional zeros, no trailing decimal
point, no surrounding whitespace. The plain-decimal/exponent threshold is
`Number.prototype.toString`'s own — plain for `1e-6 ≤ |v| < 1e21` — used
consistently and nowhere overridden.

The magnitude ceiling the first delivery carried existed **only** to keep
canonical output out of exponent notation. `IMP-D047` permits lowercase exponent
notation where canonical serialization needs it, so the ceiling bought nothing
and could reject legitimate geometry; it is removed, and the smallest positive
subnormal and the largest finite double now round-trip.

### 6.19.2 One numeric authority

`viewBox`, every geometry attribute, opacity, stroke and dash values, transform
arguments, `points`, path parameters and colour-alpha input all pass through the
same parser and the same formatter. No separate serializer remains in path or
transform code. Arc flags stay exact `0`/`1`, validated **before** any general
numeric canonicalization, and the integer-only `viewBox` width/height rule is
unchanged.

Paint output stays `none`, `#rrggbb`, `#rrggbbaa`. The alpha → 8-bit conversion
is `round(alpha × 255)` with a half-up boundary, now a named function and
explicitly tested at its half-steps.

Nothing else changed: no sanitizer architecture, allowlist, limit, path command,
output MIME, event, object protocol or database behaviour, and no dependency,
Docker, API, schema, migration or delivery change.

## 6.20 `APP3-B02` — public Product Side background delivery

One anonymous binary operation, and one additive extension of the `APP3-B01`
public manifest. Together they close the intrinsic-dimensions contract for Side
backgrounds and give a Studio session everything it needs to open a canvas:
where the background is, how large it really is, and what it is.

```text
GET /api/public/products/:slug/sides/:sideCode/background
    publicProductSideBackground_get
```

### 6.20.1 Why the address is keyed by placement

The route is addressed by **Product slug and Side code** — never an Asset id, a
derivative id, a storage key or a Product Side UUID. A background may be
*replaced* without the Side changing, so an artifact-keyed address would go
stale on every operator swap; a placement-keyed one keeps resolving to whatever
the Side's current approved background is. And it stops resolving entirely the
moment the Product is unpublished, the Product or Category is archived, the Side
is retired or the background stops being deliverable, because the route re-proves
all of it on every request. **Knowing an address grants nothing.**

### 6.20.2 The contextual query

One transactionless statement proves twenty facts against a single snapshot:
Product slug, publication and archive state; Category publication and archive
state; the Side's membership, code and activity; the background association; the
Asset's lane, classification, status and tombstone; and the derivative's kind,
READY state, unwatermarked flag, storage key and complete quartet. Splitting it
would open windows in which an unpublish could commit between checks.

Every miss — unknown, unpublished, archived, withdrawn, foreign, retired,
replaced, unready, watermarked, incompletely described — collapses to the same
safe not-found, so an anonymous caller cannot enumerate what is not yet public.
`studioEligible` is never trusted as an authorization; it is re-derived.

### 6.20.3 Provider and persisted metadata are reconciled

`APP2-T01` could only trust the provider's byte count, because
`asset_derivatives` had no size column. `APP3-DB01` added the quartet, so two
independent statements about the same object now exist. Before any byte is sent
they must agree: the provider's count must be finite, positive and **equal** to
the persisted `byte_size`. Where they disagree the stream is destroyed and the
request fails safely — sending the provider's length would contradict the
manifest a Studio already read, and sending the persisted one would truncate or
hang the response. The read path never repairs the database.

### 6.20.4 The manifest extension

`background` keeps its `productSlug`/`sideCode` identity components and gains
`delivery`, which is **all-or-nothing**:

```text
delivery = { path, widthPx, heightPx, mediaType, byteSize } | null
```

A path without dimensions would invite a request that cannot be served, and
dimensions without a path would be fabricated geometry. `null` is the single
answer for every non-deliverable reason and is exactly what makes
`studioEligible` false.

`widthPx`/`heightPx` are the **derivative's intrinsic** pixel dimensions. They
are deliberately not the Side's `imageWidthPx`/`imageHeightPx`, which are the
operator's authored placement canvas; substituting one for the other would put a
design on geometry nobody chose. This distinction is what closes
`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`.

### 6.20.5 Delivery boundary

`no-store`, `nosniff`, `inline` with no filename, `Content-Type` from the
persisted `media_type`, and a `Content-Length` only from the reconciled size. No
ETag, last-modified, bucket, object key, checksum, provider endpoint or original
filename reaches a response. Only the `APP3-W01A` raster output is deliverable;
Template SVG is not, and `IMP-D044` PO-03 keeps it profile-invalid here. No
upload, mutation, presign, download, generic Asset or generic derivative
operation was added.

### 6.20.6 Disclosed deviation

`APP3-B01`, `APP3-B01N`, `APP3-W01A`, `APP3-G04` and `APP3-DB01` each froze the
pre-B02 published surface — "no APP3 HTTP operation beyond B01", frozen OpenAPI
and generated-client hashes, frozen path lists. B02 is required to add exactly
one operation, so those gates could not pass unchanged while §13 requires them to
pass. Each was made **mode-aware** on this checkpoint's own delivered status
line, in the pattern used nine times before: two consistent worlds and no third.
Recorded as `PREDECESSOR_GATES_MADE_MODE_AWARE_ON_B02`.

The status token itself is deliberately *not* quoted anywhere in this prose. A
gate that keys on a status line must not be satisfiable by a paragraph
describing it — the same discipline `APP3-G07` needed when its rulings and its
corpus shared vocabulary.

## 6.21 `APP3-P03` — Zod-backed DTO OpenAPI metadata foundation

`createZodDto` gave `@nestjs/swagger` a class with no decorated property, and
Swagger — which documents a class by reading its `@ApiProperty` metadata —
correctly concluded there was nothing to document. Every schema-backed request
body therefore published as `{ "type": "object", "properties": {} }`. Runtime
validation was never affected, which is precisely why the defect survived four
checkpoints: nothing failed. Only the *published contract* was wrong, and the
generated client typed each of those bodies as an open bag.

### 6.21.1 The mapping authority

Zod 4.4.3 exposes `z.toJSONSchema`, its own official exporter, and also carries
`~standard.jsonSchema` for the Standard Schema protocol. Nothing was written by
hand and no dependency was added: the schema that validates a request and the
schema that documents it are two renderings of one object, so they cannot drift.

Three options carry the design. `io: 'input'` documents what a client **sends**,
so a transforming body never publishes its own parsed output.
`unrepresentable: 'throw'` stops generation on a construct JSON Schema cannot
express — replacing a silent `{}` with a quieter silent omission would be no
improvement. `cycles: 'throw'` refuses a self-referential body, which has no
finite published form.

A `.refine()` is dropped rather than thrown on. It is a predicate over an
already-typed value, not an unrepresentable *node*, so the published type stays
correct while the predicate stays unpublished. Where that would lose a real
constraint the schema carries it in `.meta({ description })` instead.

### 6.21.2 Registration, and why the name comes from the class

`createZodDto` returns an anonymous base class, so at the moment the schema is
attached nothing knows what the DTO will be called — and the component name in
the document is the *subclass's* name. Each feature therefore hands its finished
classes to `registerZodDtos`, which reads the name off the class itself. Nothing
is spelled twice, so a rename cannot leave a stale string pointing at a
component that no longer exists.

Registration is a publication concern only. The validation pipe reads the schema
straight off the metatype and never consults the registry, so an unregistered
DTO still validates exactly as before. It would only fail to *document* itself —
and the augmentation refuses to emit a document in which that has happened.

That refusal is the load-bearing part. A fix that repairs the six known bodies
but silently skips the seventh added next year would leave exactly the defect it
claims to have closed.

### 6.21.3 What the placement body kept

`APP3-B01-C1` had documented the replace body with hand-written decorator
classes, explicitly as a scoped workaround. Those are gone; the descriptions and
examples moved onto the Zod schema as `.meta()`, and `.meta({ id })` keeps
`ReplacePlacementSideBody` and `ReplacePlacementAreaBody` as named components —
so the generated client's types stay exactly where that correction put them,
now with the bounds, formats and patterns the runtime actually enforces.

### 6.21.4 The one body left alone

Both fields of the staff-login schema are constrained entirely by `.refine()`.
Converting it would publish two bare strings and *lose* the address format and
length bound a client can read today, so its hand-written published shape stays
and the contract spec binds the two together: it may document more than the
converter can, never something different.

### 6.21.5 Disclosed deviation

Six accepted gates — `APP3-B01N`, `APP3-B02`, `APP3-G06`, `APP3-G07`,
`APP3-W01A` and the `APP3-W01B` boundaries — each asserted that the platform
follow-up was still open, and two of them that `APP3-B03` still recorded it as a
blocker. Closing the follow-up is this checkpoint's whole purpose, so those gates
could not pass unchanged while §12 requires them to pass. Each was made
**mode-aware** on this checkpoint's own delivered status line, in the pattern
used ten times before: two consistent worlds, no third, and the half-flipped
mixture asserted to fail. Recorded as
`PREDECESSOR_GATES_MADE_MODE_AWARE_ON_P03`.

As in §6.20.6, the status token itself is deliberately not quoted in this prose:
a gate that keys on a status line must not be satisfiable by a paragraph
describing it.

## 6.22 `APP3-G08` — Session upload architecture and authorization staging authority

`APP3-B06` stopped at `BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT`
having written nothing and committed nothing. The prompt it was given described a
two-operation upload lane — an upload-intent that hands the browser an upload
target, then a completion that verifies the provider's object — and the
repository has no such architecture and, under the accepted boundary, cannot
acquire one. `APP3-G08` supplies the authority, locked as **`IMP-D048`**. It is a
Product Owner / application-architecture gate: it implements no API, worker,
package, schema or dependency.

### 6.22.1 Measured cause of the stop

| Machine-checked upload-architecture fact | Value |
|---|---|
| `Server upload-intent operation` | `NONE` |
| `Upload-completion proof operation` | `NONE` |
| `ObjectStoragePort presign method` | `NONE` |
| `ObjectStoragePort method count` | `6` |
| `Delivered APP2 upload architecture` | `API_OWNED_MULTIPART_STREAMING` |
| `Delivered upload durable steps` | `TX_A_UPLOADED_THEN_TX_B_INSPECTING` |
| `Admin upload-intent module` | `BROWSER_STATE_MACHINE_ONLY` |
| `Session cookie verifier in API` | `NONE` |
| `DesignModule in AppModule` | `ABSENT` |
| `Session association writer result` | `VOID` |
| `Session asset lane` | `CUSTOMER_UPLOAD + CUSTOMER_PRIVATE` |
| `Session asset lane migration` | `NONE` |
| `Session bootstrap owner` | `APP3-B07` |
| `Normalization required asset status` | `ACCEPTED` |
| `Normalization verdict while INSPECTING` | `TERMINAL_NON_RETRYABLE` |

The three upload facts are one fact seen three times. `ObjectStoragePort` has
exactly six methods and says why it has no seventh: a presign capability would
create a delivery path that bypasses the publication check
(`ADR-APP2-001` §4.7/§4.8). The package is read-only to this phase, so the
intent operation could not return an upload target, the completion operation had
no provider proof to verify, and the two JSON bodies the plan required could only
exist if the bytes travelled out of band — which is the presign lane again. The
refusal was correct: the alternative was to invent a public anonymous upload
surface and call it a reuse.

### 6.22.2 The architecture that is selected

`IMP-D048` PO-01 keeps the delivered lane. One API-owned multipart operation
receives the bytes, streams them to private storage, and commits. This is not a
compromise for want of a better option — it is the architecture whose security
properties the phase already depends on, and the one whose Tx A / Tx B boundary
`APP3-W01A` was built against.

### 6.22.3 Why bootstrap is not reassigned

The directive offered `APP3-B06A` as a bounded home for one anonymous Session
bootstrap operation, conditional on no accepted checkpoint already owning it.
One does: `APP3-B07` is `session bootstrap (blank + clone) and resume`, two
operations, and it owns setting the per-session cookie. Assigning bootstrap to
B06A would have created a second issuer of the same credential. B06A therefore
owns the reusable *verifier* and nothing that mints a secret, and `APP3-B06B`
carries an explicit runtime dependency on `APP3-B07`.

### 6.22.4 The ordering defect, and why it needs its own owner

`APP3-B06`'s audit asked whether inspection is guaranteed to finish before
normalization is claimable. Measured against the accepted worker, it is not — and
the fallback is worse than a race. `AssociationResolutionService` admits only an
`ACCEPTED` Asset and treats anything else as
`NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE`, which is a **terminal** verdict the
use case records before completing; the source comment is explicit that an Asset
still `INSPECTING` is "a stale context, not something to wait for".

B06B would commit both events in one transaction, so they become visible
together. Neither admissible mechanism holds: nothing orders the two claims, and
a not-yet-`ACCEPTED` Asset is killed rather than retried. Every session upload
that lost the race would silently end with no normalized derivative and no
retry.

This never surfaced in `APP3-B01N` because a Product Side background associates
an Asset whose inspection completed long before — association and inspection are
far apart there and simultaneous here. `IMP-D048` PO-08 therefore routes
**`APP3-W01C`** ahead of B06B: a not-yet-inspected Asset under a
`DESIGN_SESSION_ASSET` reference becomes retryable and converges under the
existing lease, backoff and dead-letter policy, while `REJECTED`, deleted and
missing Assets stay terminal. No polling, cron, second event or blind
normalization is admissible as a substitute.

### 6.22.5 Dependency reconciliation

| Checkpoint | Portion | Status after `APP3-G08` |
|---|---|---|
| `APP3-G08` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-B06` | first attempt, post-G08 | `BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT` |
| `APP3-B06` | disposition, post-G08 | `REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B` |
| `APP3-B06A` | whole checkpoint, post-G08 | `BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE` |
| `APP3-W01C` | whole checkpoint, post-G08 | `BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE` |
| `APP3-B06B` | whole checkpoint, post-G08 | `BLOCKED_BY_APP3-B06A_APP3-W01C_AND_APP3-B07` |
| `APP3-B07` | whole checkpoint, post-G08 | `READY — NOT STARTED` |
| `APP3-B03` | whole checkpoint, post-G08 | `READY — NOT STARTED` |
| `APP3-S06` | whole checkpoint, post-G08 | `BLOCKED_BY_APP3-B06B_AND_APP3-D01` |
| `APP3-P03` | whole checkpoint, post-G08 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-W01A` | whole checkpoint, post-G08 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-W01B` | whole checkpoint, post-G08 | `COMPLETE — REVIEW_ACCEPTED` |

`APP3-B06A` and `APP3-W01C` become `READY — NOT STARTED` on human acceptance of
G08; they are independent and the execution recommendation is `APP3-B06A` first,
since `APP3-W01C` is the smaller change and can land while B06A is in review.

`APP3-G08` implements nothing: no API, worker, package, schema, migration,
OpenAPI, generated client, dependency, infrastructure or Figma change.

## 6.23 `APP3-W01C` — a pending inspection is not a verdict

`IMP-D048` PO-08 routed one worker semantic ahead of `APP3-B06B`, and this
checkpoint carries it out. Exactly one classification changed.

### 6.23.1 The change

`AssociationResolutionService` admitted only an `ACCEPTED` Asset and answered
everything else with `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` — a
`NormalizationRejection`, which the use case *records and completes*. For a
Design Session upload that is wrong in a specific way: the association and the
inspection request are committed in one transaction, so a normalization attempt
can arrive before inspection has finished. That Asset is not ineligible; it has
not been judged yet.

It is now raised as a failed attempt instead:

| Session Asset state | Outcome |
|---|---|
| `ACCEPTED` | proceed |
| `INSPECTING` | **retryable attempt failure** |
| `REJECTED` | terminal |
| missing, deleted or tombstoned | terminal |
| wrong intake lane | terminal |
| association missing, inactive or re-pointed | terminal |

`UPLOADED` is deliberately absent. The producer appends the event in the same
transaction that leaves `UPLOADED`, so a committed request cannot observe it —
and admitting a state that cannot occur would convert a real defect into a
silent retry loop.

### 6.23.2 Why it needed no new mechanism

The signal is the runtime's own `JOB_TRANSIENT_FAILURE`. `dispositionOf` already
retries that class under the existing backoff and lease policy and turns it
terminal at the attempt cap, so an inspection that never completes dead-letters
for an operator instead of looping. No scheduler, sweep, poll, sleep inside an
attempt, second queue or second event was added, and the job kind is unchanged.

### 6.23.3 Why nothing is left behind

The refusal is raised while resolving the association — step 1 of the use case,
**before** the derivative claim at step 4. A waiting attempt therefore writes no
`PROCESSING` row, no `FAILED` row and no object, so the next attempt starts clean
rather than taking over one its predecessor abandoned. This is a property of
ordering, not of cleanup, and the gate asserts the order directly.

The narrowing keeps `APP3-W01A`'s rule that bytes are never an answer on their
own: an existing `READY` derivative does not short-circuit a Session Asset that
is still inspecting, because the association is validated before the replay is
considered.

## 6.24 Current checkpoint authority (`APP3-ROADMAP-RECONCILIATION`)

The §6.1 map is the phase's logical plan and is **not** rewritten here: its rows
and numbering stand. But fourteen checkpoints have entered APP3 since it was
written — through accepted replans, authority gates issued when a checkpoint
stopped, and platform foundations inserted by manual intervention — and until now
the only place to learn what any of them owns was a completion report.

This section answers one question: **which checkpoint owns this responsibility
now?** It adds no scope and reopens no accepted decision.

It exists because an execution-order audit found two failures of exactly this
kind. `APP3-S11` was proposed as the next checkpoint although eight predecessors
had not started, on the strength of an ownership line. And one of the three
delivery classes `IMP-D044` PO-06 mandates had **no owner at all** — the second
half of `APP3-B06`, lost when `APP3-G08` replanned it. The operator ruled on the
second (`ASSET_DELIVERY_RULING = OPTION_2_DEDICATED_DELIVERY_CHECKPOINTS`); both
are reconciled below.

### 6.24.1 Delivery-class ownership (`IMP-D044` PO-06)

PO-06 (§6.7.2) admits exactly three delivery classes and forbids a generic
`GET /assets/:id`. Each class is now one checkpoint, one operation, one
authorization context:

| # | Delivery class | Authorization context | Owner | Status |
|---|---|---|---|---|
| 1 | Product Side background | Product + Side | `APP3-B02` | `COMPLETE — REVIEW_ACCEPTED` (`publicProductSideBackground_get`) |
| 2 | Published Template asset | Published Template + Published Template Version | **`APP3-B05A`** | `DEFINED — READY — NOT STARTED` (`APP3-B05` accepted) |
| 3 | Design Session upload | Session id + matching per-session credential | **`APP3-B06C`** | `DEFINED — NOT STARTED` |

Three symmetrical checkpoints of one operation each. The shape is `APP3-B02`'s,
which was itself carved out of `APP3-B01` for the same reason: byte delivery and
JSON authoring are different checkpoints with different risks, and merging them
is how a delivery path acquires an authorization it was never reviewed for.

**Every one of the three is bound by PO-06 without exception**: no generic
Asset-by-id API, no object-storage key or private-original URL in any response,
no presign, no credential in browser storage, and no delivery of one Asset
authorising another derivative of the same Asset.

### 6.24.2 `APP3-B05A` — published Template asset delivery

| Field | Value |
|---|---|
| Lane | Backend/API — delivery |
| Responsibility | stream one Asset proven to belong to the addressed **Published Template + Published Template Version** |
| HTTP operations | **exactly 1** |
| Route | `TO_BE_LOCKED_AT_APP3-B05A_ENTRY_AUDIT` |
| Direct predecessors | `APP3-B05` (which transitively carries `B04`, `B01`, `DB01`), `APP3-W01B` |
| Semantic authorities | `B04` publication lifecycle · `B05` published-template read · `W01B` sanitized/normalized Template SVG · `DB01` + `G04` derivative metadata quartet |
| Unlocks | `APP3-S01` (the template picker's preview), `APP3-E01` |
| Origin | replan child created by `APP3-ROADMAP-RECONCILIATION` under `ASSET_DELIVERY_RULING = OPTION_2` |
| Status | `DEFINED — READY — NOT STARTED` — both predecessors accepted |

**`APP3-B05` is not enlarged.** It stays exactly two operations —
`GET /api/public/design-templates` and `GET /api/public/design-templates/{slug}`
— and stays a JSON metadata read. Byte delivery is a separate concern with a
separate authorization proof, so it is a separate checkpoint.

**The route is deliberately not designed here.** No prior authority ever
canonicalized one: the pre-implementation audit's endpoint matrix gave `APP3-B05`
two JSON reads and no delivery path, which is precisely why this class had no
owner. Inventing a path in a docs-only reconciliation would lock a contract
nobody has reviewed. What *is* locked now is the operation count, the
authorization context and the delivery semantics; the path is an entry-audit
decision.

Authorization must be proved from the **Published Template + Version** chain.
A raw `assetId` is never sufficient on its own, and an unpublished or archived
Template Version must not deliver.

### 6.24.3 `APP3-B06C` — Design Session private asset delivery

| Field | Value |
|---|---|
| Lane | Backend/API — delivery |
| Responsibility | privately deliver one Design Session upload, authorized by **Session id + matching per-session credential** |
| HTTP operations | **exactly 1** |
| Route | `GET /api/public/design-sessions/{sessionId}/assets/{assetId}/editor-preview` |
| Direct predecessor | `APP3-B06B` (which transitively carries `B06A`, `B07`, `W01C`, `W01A`, `G08`, `G04`, `DB01`) |
| Semantic authorities | `B06B` intake + `DESIGN_SESSION_ASSET` association · `B06A`/`B07` session credential verification · `W01A`/`W01C` normalization lifecycle and the `INSPECTING` race · `G04`/`DB01` editor-safe derivative kind and metadata quartet |
| Unlocks | `APP3-S06`, `APP3-E01` |
| Origin | **replan child** completing `APP3-B06`, per §6.1 #20 |
| Status | `DEFINED — READY — NOT STARTED` |

This is not a correction of `APP3-B06B` and is not a `B06B-C2`. `APP3-B06`'s
scope was always *"session-scoped customer asset intake **+ granted delivery**"*,
two operations. `APP3-G08` replanned it into `B06A` (the cookie verifier, zero
HTTP operations) and `B06B` (intake, one operation) and the delivery half was
never reassigned. The pre-implementation audit named both operations explicitly:

```text
POST /api/public/design-sessions/{id}/assets        → delivered by APP3-B06B
GET  …/assets/{assetId}/editor-preview              → APP3-B06C
```

The path keeps that semantic and takes `{sessionId}` from the delivered Session
routes' naming rather than the audit's provisional `{id}`.

**It must deliver only** an Asset proven to belong to the authorized Session
*through its `DESIGN_SESSION_ASSET` association*, and only when the canonical
editor-safe derivative state permits. Another Session's upload must never be
reachable, and where the delivery authority requires the normalized editor
preview, the private customer original must not be served in its place.
Delivery is `private, no-store` and re-verifies the G03 credential on **every**
request (PO-06).

It mutates nothing: no upload, no lifecycle transition, no derivative generation,
no worker behaviour, no migration.

**`APP3-B06C` is `READY`** — every predecessor is accepted. It is not, however,
the recommended next checkpoint; see §6.24.7.

### 6.24.4 Delivery classes and the exit gate

`APP3-E01`'s journey traverses two of the three classes: the customer picks a
published Template (class 2) and places an uploaded image (class 3), and the
security assertion *"private original denied, no export surface"* is only
meaningful against a delivery surface that exists to refuse. `APP3-E01` therefore
gains `B05A` and `B06C` as predecessors (§6.1 #36). Phase closure cannot pass
while a delivery class the journey needs is missing.

This is not "every backend checkpoint becomes an E01 predecessor" — only the
delivery surfaces the journey actually traverses.

### 6.24.5 Checkpoints added after §6.1, classified

**Replan / execution children** — real work items with their own scope and review:

| ID | Owns | Parent | Status |
|---|---|---|---|
| `APP3-B01N` | normalization producer for placement associations | `APP3-G06` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-W01A` | raster normalization consumer | `APP3-W01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-W01B` | sanitized Template SVG normalization | `APP3-W01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-W01C` | a pending inspection is retryable, not a verdict | `IMP-D048` PO-08 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B06A` | session credential verifier, 0 HTTP operations | `APP3-B06` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B06B` | session raster intake, 1 operation | `APP3-B06` | `COMPLETE — REVIEW_ACCEPTED` |
| **`APP3-B06C`** | session private asset delivery, 1 operation | `APP3-B06` | `DEFINED — READY — NOT STARTED` |
| **`APP3-B05A`** | published Template asset delivery, 1 operation | `APP3-B05` | `DEFINED — READY — NOT STARTED` |
| **`APP3-B03A`** | Template draft document save, 1 operation | `APP3-B03` | `COMPLETE — REVIEW_ACCEPTED` |
| **`APP3-B04A`** | Template restore, 1 operation | `APP3-B04` | `READY — NOT STARTED` |

**Governance gates** — authority only; each implements nothing:

| ID | Locks | Status |
|---|---|---|
| `APP3-G05` (+`-C1`) | geometry coordinate/transform/bounds semantics — `IMP-D045` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G06` | normalization dispatch and raster/SVG staging — `IMP-D046` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G07` | Template SVG sanitizer authority — `IMP-D047` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-G08` | Session upload architecture — `IMP-D048` | `COMPLETE — REVIEW_ACCEPTED` |

**Platform foundations inserted by accepted intervention:**

| ID | Owns | Status |
|---|---|---|
| `APP3-P03` | Zod-backed DTO OpenAPI metadata foundation | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P04` | shared Design Session response contract | `COMPLETE — REVIEW_ACCEPTED` |

**Correction evidence children** — lineage, **not roadmap work items.** They own
no new product scope and never appear in a dependency graph:
`APP3-PRE-AUDIT-C1`, `APP3-P01-C1`, `APP3-P02-C1`, `APP3-G05-C1`, `APP3-B01-C1`,
`APP3-W01B-C1`, `APP3-B06B-C1`, `APP3-B08-C1`. Each is recorded against the
checkpoint it corrects; read that checkpoint's status, never the correction's,
to decide whether a dependent may start.

### 6.24.6 Definitions for checkpoints delivered without a §6.x section

| ID | Responsibility | Ops | Hard predecessors | Unlocks | Origin | Status |
|---|---|---|---|---|---|---|
| `APP3-B06A` | reusable per-session credential **verifier**; mints nothing | 0 | `G08` | `B06B`, `B06C` | `APP3-G08` replan of `B06` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B06B` | anonymous session raster intake, API-owned multipart streaming to private storage | 1 | `B06A`, `W01C`, `B07` | `B06C`, `S06` | `APP3-G08` replan of `B06` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B07` | session bootstrap (blank + clone) and resume; **sole issuer** of the session cookie | 2 | `G03`, `P01`, `P02`, `B01` | `B06B`, `B08`, `S01` | §6.1 #21 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B08` | session autosave under `autosave_revision` CAS; stale revision is `409` with no mutation | 1 | `B07`, `P02` | `S10` | §6.1 #22 | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P04` | publishes the shared Session response contract for all three Session operations; **publication only, no runtime change** | 0 new | `B08`, `B08-C1`, `P03` | any client consuming a Session response | manual intervention after `B08-C1` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B05` | anonymous public published-Template reads — list for one exact `product → side → area` triple, and detail by slug; selects the **highest version whose `published_at` is set**, re-evaluates the placement chain’s public eligibility on **every** request, and writes nothing | 2 | `B04`, `B01`, `G02`, `P01`, `DB01` | `B05A`, `S01` | §6.1 #15 | `COMPLETE — REVIEW_DELIVERED` |

Autosave **cadence** is `APP3-S10`'s, not `APP3-B08`'s and not `APP3-S11`'s:
`B08` enforces the 30 writes/minute ceiling and must not invent a timer; `S10`
owns the autosave/conflict/resume/expiry capability and therefore its cadence;
`S11` owns mobile controls and touch gestures and owns no autosave concern. The
value itself stays **OPEN until `APP3-S10` runs**.

### 6.24.7 Current execution state

Eligible now, all hard predecessors accepted (`APP3-B05` delivered, so byte
delivery takes its place at the head of the chain):

```text
APP3-B05A   published Template asset delivery  1 operation
APP3-D01    phase design package               gates every A*/S* checkpoint
APP3-B04A   template restore                   1 operation
APP3-B06C   session private asset delivery     1 operation
```

Recommended next, for the single-checkpoint human-review workflow:

```text
NEXT_RECOMMENDED_IMPLEMENTATION_CHECKPOINT = APP3-B05A
```

because `APP3-B05` has given it something to authorize from — a published
Template and a published Version now resolve through a real read — and it is the
only remaining **backend** checkpoint on the longest chain,
`B05 → B05A → S01`. `APP3-S01` cannot start before it: the Template picker
shows a Template preview derivative (§6.24.2), so the frontend chain is blocked
on byte delivery and not merely on `APP3-D01`.

`APP3-D01` is the one genuine parallel candidate, and the only other thing that
gates `APP3-S01`. `APP3-B04A` and `APP3-B06C` stay genuinely ready and stay
deliberately unrecommended: they sit on shorter branches (`B06C → S06`) that
cannot be consumed until `S02` exists, so running one now would deliver a
surface with no consumer for several checkpoints while the critical path stood
still.

`APP3-D01` is eligible in parallel or immediately after `B03`. It gates every
Admin and Storefront checkpoint in the phase, and no frontend work may start
before it is accepted:

```text
NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS = APP3-A01 APP3-A02 APP3-A03
  — CONDITIONAL_ON_APP3-D01_DESIGN_APPROVAL
```

`APP3-D01` is delivered: the `APP_03` page (`592:3`) carries one section (`596:3`) of 19
nested sections and 66 frames, registered as 66 `REVIEW_REQUIRED` rows. The package covers
`A01`–`A04` and `S01`–`S11`, so those checkpoints are no longer blocked *by the absence of
design* — but `FIGMA_DESIGN_INDEX.md` §2 still blocks implementation against a row that is
not `APPROVED_FOR_IMPLEMENTATION`. Human design approval is the remaining gate, and it is
deliberately not something this checkpoint may grant itself.

Dependency-safe forward shape:

```text
B03 → B03A → B04 → B05 → B05A ─┐
B04 → B04A (restore)
                                ├→ S01 → S02 → {S03, S04, S05, S06, S07, S08, S09}
D01 ───────────────────────────┘                     │
                                                     └→ S03 + S07 → S11
S01 + B08 → S10
B06B → B06C → S06
S10 + S11 + B05 + B05A + B06C → E01 → X01
D01 → A01, A04 ;  D01 + B03 → A02 ;  D01 + B03A → A03
```

## 6.25 `APP3-B03` / `APP3-B03A` — the draft save gets its own checkpoint

`APP3-B03` stopped at `FAILED — MANUAL INTERVENTION REQUIRED`,
`CAUSE = B03_HTTP_CONTRACT_AUTHORITY_CONFLICT`, having written nothing. The
operator ruled the split as
**`B03_CONTRACT_RULING = OPTION_2_SPLIT_DRAFT_SAVE_INTO_APP3_B03A`**.

### 6.25.1 Measured cause of the stop

B03 was asked for four capabilities inside a canonical three-operation budget.

| Machine-checked contract fact | Value |
|---|---|
| `Canonical B03 endpoint matrix` | `POST /api/admin/design-templates` · `GET …` (list) · `GET …/{id}` |
| `Canonical B03 operation count` | `3` |
| `Draft document save in that matrix` | `NONE` |
| `Checkpoint owning Template document save` | `NONE` |
| `APP3-A02 backend` | `APP3-B03` — needs the list |
| `APP3-A03 backend` | `APP3-B03` — needs the editor's save |
| `IMP-D042 PO-04` | every save while `DRAFT` writes a new monotonic immutable version |
| `IMP-D042 PO-07` | publish requires **at least one immutable version** |
| `DesignTemplateRepository draft-version method` | `NONE` |
| `publishVersion publishedAt` | `Date` — required, so it cannot write a draft version |
| `design_template_versions.published_at` | **nullable** — the schema can express one |
| `CreateDesignTemplateInput document/version fields` | `NONE` — header only |
| `current_version CHECK` | `NONE` — `0` is storable |

The last three rows decide the shape of the fix. The **schema** was always able
to hold an unpublished version; only the port method and the HTTP operation were
missing. So no migration is required, and the create operation the audit named
was already header-only in the delivered persistence contract.

The alternative — widening `APP3-B03` to four operations — was rejected: the
save is not a fourth read-shaped operation but a different kind of work
(P01 canonical document persistence, immutable version creation, concurrency,
`design_template_assets` reconciliation, `G06` event production, transactional
rollback), and folding it in would have hidden all of that behind one review of a
checkpoint whose other three operations are a create and two reads.

### 6.25.2 `APP3-B03` — draft header and Admin reads

| Field | Value |
|---|---|
| Lane | Backend/API |
| Responsibility | create a Design Template header in `DRAFT`; Admin list; Admin detail |
| HTTP operations | **exactly 3** — `POST /api/admin/design-templates`, `GET /api/admin/design-templates`, `GET /api/admin/design-templates/{templateId}` |
| Predecessors | `G02`, `P01`, `DB-DISPOSITION-RESOLVED` |
| Unlocks | `APP3-B03A`, `APP3-A02` |
| Status | `READY — NOT STARTED` |

**Create is header-only.** `POST` creates the header in `DRAFT` and creates **no**
immutable version, so a newly created Template legitimately has **zero versions**
until the first `APP3-B03A` save. This is deliberate, and it is what the
delivered `CreateDesignTemplateInput` already expresses — it carries no
`designDocument` and no `documentSchemaVersion`. `APP3-B03` must represent the
no-version state truthfully rather than fabricate a version 1, and must not
accept a Design Document merely to avoid an empty version list. Nothing is lost:
`IMP-D042` PO-07 already requires *at least one immutable version* to publish, so
`APP3-B04` cannot publish a header-only Template.

`APP3-B03` does **not** own the draft document save, immutable version creation,
`design_template_assets` mutation, normalization event production, publication,
public reads or binary delivery.

The route parameter is written `{templateId}` to match the delivered API's
naming (`{productId}`, `{sessionId}`, `{assetId}`); the audit's `{id}` is the
same route.

### 6.25.3 `APP3-B03A` — draft document save

| Field | Value |
|---|---|
| Lane | Backend/API |
| Responsibility | save a full canonical Design Document snapshot for a `DRAFT` Template by creating a new immutable version |
| HTTP operations | **exactly 1** — `PUT /api/admin/design-templates/{templateId}/document` |
| `operationId` | `adminDesignTemplate_saveDocument`, subject to the locked `<domain>_<method>` convention being confirmed at entry audit |
| Predecessors | `B03`, `P01`, `G06` (accepted normalization contract) |
| Unlocks | `APP3-B04`, `APP3-A03` |
| Origin | execution/replan child created by manual intervention after the B03 endpoint-count conflict |
| Status | `BLOCKED_BY_APP3-B03 — NOT STARTED` |

It carries the `IMP-D042` PO-04 behaviour that had no owner: the Template must
exist and be `DRAFT`; the request carries a **full** document snapshot, never a
patch or a partial element mutation; `P01` validates, quantizes and canonicalizes
it and the canonical form is what persists; a successful save creates a new
immutable version with the next monotonic number and `published_at = null`; prior
versions never change; the current draft version is the highest version. A
non-`DRAFT` Template is refused with the canonical lifecycle conflict and **no
version is created**. It never publishes, unpublishes, archives, restores or
hard-deletes — those stay `APP3-B04`.

**Repository seam.** `APP3-B03A` is authorized to extend
`DesignTemplateRepository` with a narrow draft-version method (or a generalized
immutable-version method, if repository convention prefers that to a second
near-duplicate of `publishVersion`) whose semantics are `publishedAt = null`,
immutable insert, monotonic allocation, safe under concurrency. It must not
change the database schema, must not mutate a historical version, and must not
overload `publishVersion` with misleading nullable semantics to avoid adding the
right seam.

```text
CONCURRENCY_BEHAVIOR = TO_BE_RESOLVED_FROM_DB7/G02_AT_APP3-B03A_ENTRY_AUDIT
```

`APP3-B03A`, not `APP3-B03`, owns same-Template concurrent draft saves. Whichever
model the DB7/G02 authority turns out to require — both saves succeeding with
distinct monotonic versions, or optimistic single-winner with a canonical
conflict — the invariants are fixed: no duplicate version number, no overwritten
immutable version, no partial save. That choice is an entry-audit reading of
existing authority, not an invention.

**`APP3-B03A` owns the `DESIGN_TEMPLATE_ASSET` normalization producer**
(§6.16.2 supersession note), because it is the only draft-authoring checkpoint
that creates or changes an active Template Asset association. The `IMP-D046`
event contract is untouched.

`APP3-P02` is deliberately **not** a predecessor: publication geometry stays
`APP3-B04`, per the §6.1 package dependency rule.

### 6.25.4 What the pre-implementation audit still says

The audit's `APP3-B03` row — three routes, create plus two reads — **remains
valid and is not rewritten**. It was never wrong about what it listed; it was
incomplete, and it says so itself: *"Paths are provisional; CRUD completeness is
not a goal."* `APP3-B03A` supplies the capability it omitted. The same is true of
`APP3-B04`'s and `APP3-B05`'s rows, which are unchanged.

### 6.25.5 Dependency reconciliation

| Checkpoint | Portion | Status after this ruling |
|---|---|---|
| `APP3-B03` | whole checkpoint | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B03A` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-B04` | direct predecessors | `APP3-B03A` (delivered) + `APP3-P02` — `READY — NOT STARTED` |
| `APP3-B05` | whole checkpoint | `BLOCKED_BY_APP3-B04` |
| `APP3-B05A` | whole checkpoint | `BLOCKED_BY_APP3-B04_AND_APP3-B05` |
| `APP3-A02` | backend portion | `APP3-B03` — unchanged |
| `APP3-A03` | backend portion | `APP3-B03A` — the editor's save |
| `APP3-D01` | whole checkpoint | `COMPLETE — REVIEW_DELIVERED` — 66 rows `REVIEW_REQUIRED` |
| `APP3-B06C` | whole checkpoint | `READY — NOT STARTED` |

Forward critical path: `B03 → B03A → B04 → B05 → B05A`. Surface arithmetic:
`APP3-B03` takes 27 operations to **30**; `APP3-B03A` then takes 30 to **31**.

This ruling implements nothing: no API, application, repository, package, schema,
migration, OpenAPI, generated client, worker, dependency or Figma change.

## 6.26 `APP3-B04` / `APP3-B04A` — restore gets its own checkpoint

`B04_LIFECYCLE_ROUTING_RULING = RESTORE_SPLIT_TO_APP3_B04A`, decided by the
operator **before** `APP3-B04` began rather than after it stopped.

### 6.26.1 The arithmetic that would have repeated

LC-24 has six transitions. `APP3-B03` owns the first, and `APP3-B04`'s canonical
scope is three operations — which leaves five transitions for four operations:

| Transition | Owner |
|---|---|
| `(nonexistent) → DRAFT` (`TR-LC24-01`) | `APP3-B03` |
| `DRAFT → PUBLISHED` (`TR-LC24-02`) | `APP3-B04` |
| `PUBLISHED → DRAFT` (`TR-LC24-03`) | `APP3-B04` |
| `DRAFT → ARCHIVED` (`TR-LC24-04`) | `APP3-B04` |
| `PUBLISHED → ARCHIVED` (`TR-LC24-05`) | `APP3-B04` |
| `ARCHIVED → DRAFT` (`TR-LC24-06`) | **`APP3-B04A`** |

Archive absorbs two transitions into one operation because they are the same
durable retirement differing only in where they start. Restore does not fold in
anywhere: it is the one transition that *revives* a template, and `IMP-D042`
PO-03 gives it its own requirement — restore always lands in `DRAFT`, never back
in `PUBLISHED`, and requires an audit reason.

This is the same four-into-three shape `APP3-B03` stopped on. It was routed in
advance rather than discovered again.

### 6.26.2 `APP3-B04A` — Design Template restore

| Field | Value |
|---|---|
| Lane | Backend/API |
| Responsibility | `ARCHIVED → DRAFT` (`TR-LC24-06`) |
| HTTP operations | **exactly 1** — `POST /api/admin/design-templates/{templateId}/restore` |
| `operationId` | `adminDesignTemplate_restore` |
| Predecessor | `APP3-B04` |
| Unlocks | `APP3-A04`'s restore affordance |
| Origin | operator routing ruling issued with the `APP3-B04` directive |
| Status | `READY — NOT STARTED` |

It carries the PO-03 clauses restore owns: the target is always `DRAFT` and never
`PUBLISHED`, republication is separate and separately guarded, an audit reason is
required, and no version, association or timestamp is touched. Not implemented by
`APP3-B04`.

### 6.26.3 What `APP3-B04` delivered

Three operations under one concurrency token, `expectedCurrentVersion` — the same
counter `APP3-B03A` advances, because the current immutable version *is* the
publication subject, so a caller holding a stale view of it is exactly the caller
who must not transition.

Publish runs `GRD-T01` **whole** (PO-07: *"no backend checkpoint may implement a
reduced publish guard"*), delegating each clause to the authority that owns it —
`APP3-P01` for the document, `APP3-P02` in `NEW_EDITING` mode for placement
agreement and containment, the Catalog placement port for the active
`Product → Side → Area` chain, and the `APP3-B03A` media allowlist for assets.
The guard is read-only: a template that cannot publish is left exactly as it was.

`published_at` is stamped by a predicate (`WHERE published_at IS NULL`) rather
than a read-and-branch, so a republication of the same version keeps its original
timestamp even under a concurrent second publish. Unpublish touches the header
alone. Archive accepts `DRAFT` and `PUBLISHED`, requires a bounded reason, and
deletes and cascades nothing.

**A note on the races.** Publish versus publish is a true conflict and leaves
exactly one winner. The pairs involving archive are not: archive accepts both
`DRAFT` and `PUBLISHED`, so when the other transition commits first, archive
legitimately applies to the state it produced — `PUBLISHED → DRAFT → ARCHIVED` is
two valid transitions in sequence, not a lost race. What holds in every
interleaving is that nothing half-applies, the end state is one LC-24 recognises,
and the audit trail records exactly the transitions that succeeded.

## 7. Critical end-to-end journey

Admin publishes a template compatible with a published product. A customer starts a 2D session, adds text/image within limits, sees watermark, autosaves, reloads the session, and cannot submit tampered geometry or access private production assets.

## 8. Exit gate

- Canonical design document remains independent of React/canvas library.
- Server validates critical editor constraints.
- Template versions explain existing sessions.
- Mobile critical interactions pass.
- No 3D/download scope appears.
- **Every `IMP-D044` PO-06 delivery class the journey traverses exists and
  refuses correctly** — the published Template asset (`APP3-B05A`) and the
  Session upload (`APP3-B06C`) alongside the delivered side background
  (`APP3-B02`). "Private original denied" is only evidence when there is a
  delivery surface to deny it (§6.24.4).
- E2E passes.

## 9. Handoff

APP4/APP5 may associate verified customer/contact and request records with valid design sessions without changing editor ownership. `TR-LC07-03` (`ACTIVE → SUBMITTED`) belongs to APP5's submission transaction and is deliberately not implemented here.

## 10. Status

```text
APP3 = IN PROGRESS — TEMPLATE_LIFECYCLE_AND_SESSION_BACKEND_DELIVERED_NO_FRONTEND_STARTED
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
APP3-F01 = COMPLETE — REVIEW_ACCEPTED
G01_DB_DISPOSITION = REQUIRES_APP3_DB01_PLACEMENT_RETIREMENT_AND_STABLE_CODE
G02_DB_CONTRIBUTION = NONE
G03_DB_CONTRIBUTION = NONE
G04_DB_CONTRIBUTION = REQUIRES_APP3_DB01_ASSET_DERIVATIVE_METADATA
G01 DB contribution = IMPLEMENTED_BY_APP3_DB01
G04 DB contribution = IMPLEMENTED_BY_APP3_DB01
APP3-P01 = COMPLETE — REVIEW_ACCEPTED
APP3-P01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-G05 = COMPLETE — REVIEW_ACCEPTED
APP3-G05-C1 = COMPLETE — REVIEW_ACCEPTED
IMP-D045 = LOCKED
APP3-P01 FIRST_ATTEMPT = FAILED — MANUAL_INTERVENTION_REQUIRED
APP3-P01 FIRST_ATTEMPT CAUSE = NO_CONTROLLED_FONT_ASSET_OR_LICENSE_EVIDENCE
APP3-P01 FIRST_ATTEMPT RESOLUTION = APP3-F01
APP3-P02 = COMPLETE — REVIEW_ACCEPTED
APP3-P02-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B01 = COMPLETE — REVIEW_ACCEPTED
APP3-B01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-A01 = COMPLETE — REVIEW_ACCEPTED
A01_REVIEW_BLOCKER = ADMIN_SIDE_BACKGROUND_PREVIEW_UNAVAILABLE
A01_CORRECTION_BLOCKER = CLOSED_BY_APP3-A01-C1
APP3-A01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-A01-C1 CAUSE = ADMIN_SIDE_BACKGROUND_PREVIEW_UNAVAILABLE
APP3-A01-C1 CONSUMES = adminProductSideBackground_get — curated api-client export added, generated source untouched
APP3-A01-C1 RENDERING = SVG <image> bottom layer in the Side pixel viewBox; areas overlay it
APP3-A01-C1 BLOB_LIFECYCLE = object URL revoked on Side change, replacement and unmount
APP3-A01-C1 SURFACE = UNCHANGED_PATHS_32_OPERATIONS_37_SCHEMAS_81
APP3-A01-C1 API_CONTRACT_CHANGE = NONE — OpenAPI and generated client byte-identical
APP3-B02A = COMPLETE — REVIEW_ACCEPTED
APP3-B02A CAUSE = A01_DESIGN_REQUIRES_AUTHORING_ON_THE_REAL_SIDE_BACKGROUND
APP3-B02A ROUTE = GET /api/admin/products/{productId}/sides/{sideId}/background
APP3-B02A OPERATION_ID = adminProductSideBackground_get
APP3-B02A OPERATIONS = 1
APP3-B02A SURFACE = PATHS_32_OPERATIONS_37_SCHEMAS_81
APP3-B02A SURFACE_DELTA = PLUS_1_PATH_PLUS_1_OPERATION_NO_SCHEMA
APP3-B02A AUTHORIZATION = AUTHENTICATED_ADMIN_PLUS_PRODUCT_SIDE_MEMBERSHIP — NO_PUBLICATION_PREDICATE
APP3-B02A MEDIA_POLICY = REUSED_FROM_APP3-B02 — NO_SECOND_LITERAL
APP3-B02A LIVE_RESULT = 13_TESTS_PASS_ON_DISPOSABLE_POSTGRES_AND_MINIO
APP3-B02A MIGRATION = NONE
APP3-D01 placement portion = BACKEND_CONTRACT_AVAILABLE_BY_APP3-B01
APP3-P02 FIRST_ATTEMPT = FAILED — MANUAL_INTERVENTION_REQUIRED
APP3-P02 FIRST_ATTEMPT CAUSE = GEOMETRY_SEMANTICS_NOT_AUTHORIZED_AND_SPIKE_DIVERGENT
APP3-P02 FIRST_ATTEMPT RESOLUTION = APP3-G05
APP3-B08 = COMPLETE — REVIEW_ACCEPTED
APP3-S11 = READY — NOT STARTED
APP3-S11 FOUNDATION_NOTE = P01_AND_P02_PACKAGES_EXIST — NOT_CHECKPOINT_READINESS
APP3-B03 = COMPLETE — REVIEW_ACCEPTED
APP3-B03 OPERATIONS_DELIVERED = adminDesignTemplate_create adminDesignTemplate_list adminDesignTemplate_detail
APP3-B03 SURFACE = PATHS_25_OPERATIONS_30_SCHEMAS_72
APP3-B03 CREATE_RESULT = DRAFT_HEADER_ZERO_VERSIONS
APP3-B03 AUDIT = design_template.created ON DESIGN_TEMPLATE
APP3-B03 OUTBOX = NONE
APP3-B03 MIGRATION = NONE
APP3-B03 FIRST_ATTEMPT = FAILED — MANUAL INTERVENTION REQUIRED
APP3-B03 FIRST_ATTEMPT CAUSE = B03_HTTP_CONTRACT_AUTHORITY_CONFLICT
APP3-B03 FIRST_ATTEMPT RESOLUTION = B03_CONTRACT_RULING
B03_CONTRACT_RULING = OPTION_2_SPLIT_DRAFT_SAVE_INTO_APP3_B03A
APP3-B03 SCOPE = HEADER_CREATE_PLUS_ADMIN_LIST_AND_DETAIL
APP3-B03 CREATE = HEADER_ONLY_NO_VERSION
APP3-B03 OPERATIONS = 3
APP3-B03A = COMPLETE — REVIEW_ACCEPTED
APP3-B03A OPERATION = adminDesignTemplate_saveDocument
APP3-B03A ROUTE = PUT_/api/admin/design-templates/:templateId/document
APP3-B03A SURFACE = PATHS_26_OPERATIONS_31_SCHEMAS_73
APP3-B03A CAS = SAVE_DRAFT_VERSION_DRAFT_AND_EXPECTED_CURRENT_VERSION_PLUS_ONE
APP3-B03A STALE_WRITE = 409_NO_MUTATION
APP3-B03A DRAFT_VERSION = PUBLISHED_AT_NULL_IMMUTABLE
APP3-B03A DOCUMENT_AUTHORITY = APP3-P01_ONLY_NO_P02
APP3-B03A MEDIA_AUTHORITY = TEMPLATE_SOURCE_PRODUCTION_SENSITIVE_ALLOWLIST_FROM_PERSISTENCE
APP3-B03A ASSOCIATIONS = ADDITIVE_PROVENANCE_PRESERVING
APP3-B03A EVENTS = ONE_PER_NEW_DESIGN_TEMPLATE_ASSET_ASSOCIATION
APP3-B03A AUDIT = design_template.version_saved ON DESIGN_TEMPLATE
APP3-B03A RACE_PROOF = 10_ITERATIONS_ONE_WINNER_ONE_CONFLICT_ONE_VERSION
APP3-B03A MIGRATION = NONE
APP3-B03A OPERATIONS = 1
APP3-B03A ROUTE = PUT_/api/admin/design-templates/:templateId/document
APP3-B03A OWNS = DRAFT_DOCUMENT_SAVE_AND_IMMUTABLE_VERSION_CREATION
APP3-B03A CONCURRENCY_BEHAVIOR = TO_BE_RESOLVED_FROM_DB7/G02_AT_APP3-B03A_ENTRY_AUDIT
DESIGN_TEMPLATE_ASSET_NORMALIZATION_PRODUCER = APP3-B03A
DESIGN_TEMPLATE_ASSET_NORMALIZATION_PRODUCER STATE = IMPLEMENTED_BY_APP3-B03A
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED
FU-DESIGN-PUBLISH-DS-INPUT-01 = OPEN — OWNER_DESIGN_SYSTEM — new DS Input/scrim assets need a manual Figma library publish before other files can instance them
DESIGN_TEMPLATE_ASSET_NORMALIZATION_PRODUCER PREVIOUS = APP3-B03 — SUPERSEDED_BY_B03_CONTRACT_RULING
APP3-B04 = COMPLETE — REVIEW_ACCEPTED
APP3-B04 OPERATIONS = adminDesignTemplate_publish adminDesignTemplate_unpublish adminDesignTemplate_archive
APP3-B04 SURFACE = PATHS_29_OPERATIONS_34_SCHEMAS_76
APP3-B04 TRANSITIONS = TR-LC24-02 TR-LC24-03 TR-LC24-04 TR-LC24-05
APP3-B04 CONCURRENCY_TOKEN = expectedCurrentVersion
APP3-B04 PUBLISH_GUARD = GRD-T01_COMPLETE_NO_REDUCED_GUARD
APP3-B04 GEOMETRY_AUTHORITY = APP3-P02_NEW_EDITING
APP3-B04 PUBLISHED_AT = SET_ONCE_NEVER_REWRITTEN
APP3-B04 VERSIONS_CREATED = NONE
APP3-B04 EVENTS = NONE
APP3-B04 AUDIT = design_template.published design_template.unpublished design_template.archived
APP3-B04 ARCHIVE_REASON = REQUIRED_BOUNDED_500
APP3-B04 MIGRATION = NONE
B04_LIFECYCLE_ROUTING_RULING = RESTORE_SPLIT_TO_APP3_B04A
APP3-B04A = COMPLETE — REVIEW_ACCEPTED
APP3-B04A OPERATIONS = 1
APP3-B04A ROUTE = POST_/api/admin/design-templates/:templateId/restore
APP3-B04A OPERATION_ID = adminDesignTemplate_restore
APP3-B04A TRANSITION = TR-LC24-06
APP3-B04A SURFACE = PATHS_34_OPERATIONS_39_SCHEMAS_83 — +1 path, +1 operation, +1 request body schema
APP3-B04A SOURCE_STATE = ARCHIVED_ONLY — no ARCHIVED→PUBLISHED; republication stays TR-LC24-02 and re-runs the whole GRD-T01
APP3-B04A CONCURRENCY_TOKEN = expectedCurrentVersion — B04's token, in the same compare-and-set predicate as the source state
APP3-B04A RESTORE_REASON = REQUIRED_BOUNDED_500 — IMP-D042 PO-03 requires one for archive and restore and for neither publish nor unpublish
APP3-B04A ARCHIVED_AT = CLEARED — DB3 LC-24 TR-LC24-06 reads "header, clears archived_at"; it is the current archive-state marker, and the archive/restore history lives in Audit
APP3-B04A PRESERVES = current_version, every version row, every published_at, the scope triple and every Template Asset association
APP3-B04A VERSIONS_CREATED = NONE — restore returns retained data to editable DRAFT and writes no document
APP3-B04A PUBLISH_GUARD = NONE — GRD-T01 is publication's; a restore that had to be publishable could never rescue the Template that needs editing
APP3-B04A ZERO_VERSION = SUPPORTED — an ARCHIVED header with no version restores to a DRAFT with no version
APP3-B04A SCOPE_REPAIR = NONE — a retired Side or Area is preserved as it stands; B04 re-evaluates an active chain at publish time
APP3-B04A AUDIT = design_template.restored — one row, same transaction, summary from ARCHIVED to DRAFT with the current version, plus the reason
APP3-B04A EVENTS = NONE — no consumer exists for a restore, and an event nobody reads is an endpoint announcing work nobody does
APP3-B04A CASCADE = NONE — Design Sessions, cloned documents, lineage and approval snapshots are untouched
APP3-B04A ERRORS = 404 unknown · 409 DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED / DESIGN_TEMPLATE_VERSION_CONFLICT · 400 invalid or blank reason
APP3-B04A MIGRATION = NONE
APP3-B04A FRONTEND = NONE — the generated client publishes the operation, the curated Admin boundary deliberately does not; APP3-A04 activates all four lifecycle operations together
APP3-B04A TESTS = 44 — 25 focused + 19 PostgreSQL integration through the real HTTP stack, including the restore-vs-restore race
APP3-B04A CONTROLLER_SPLIT = AdminDesignTemplateAuthoringController (B03/B03A/B03B) + AdminDesignTemplateLifecycleController (B04/B04A) — one route family, one error-translation seam, no API behaviour drift
APP3-B04A PERSISTENCE_SPLIT = drizzle-design-template.repository.ts keeps the reads and composes design-template-authoring.writes.ts and design-template-lifecycle.writes.ts — one port, one implementation class, no second repository authority and no DI change
APP3-B04A OPERATION_ID_HAZARD = FOUND_AND_CLOSED — operation ids derive from the controller class name, so the split silently reissued all eight accepted Admin Template ids (adminDesignTemplate_list became adminDesignTemplateAuthoring_list). Closed by declaring the publication domain explicitly in CONTROLLER_DOMAIN_KEYS; the delivered artifact adds exactly one operationId and renames none
APP3-B04A DISCLOSED_DEVIATION_1 = CHECKER_458_LINES_VS_450_SOFT_CAP — already split three ways by responsibility (transition · published contract · controller split); further cutting would be arbitrary line-slicing
APP3-B04A DISCLOSED_DEVIATION_2 = PREDECESSOR_GATES_MADE_B04A_WORLD_AWARE — B04's restore ban, the B03/B03A/B03B/B04 controller and adapter paths, four surface-count literals and the b05/b03b regression pins
APP3-B04A PRE_EXISTING_FAILURE = 9_DESIGN_TEMPLATE_PERSISTENCE_INTEGRATION_TESTS — DesignModule init fails on unset DESIGN_SESSION_SECRET_PEPPER; proven pre-existing at HEAD by git stash, tracked as FU-APP3-DESIGN-SESSION-PEPPER-TEST-01, not repaired here
APP3-B04A PRE_EXISTING_TEST_FILE_SIZE = design-template-lifecycle.spec.ts 691 lines and design-template-lifecycle.integration.spec.ts 667, both over the 600-line test maximum at entry (692/667). Restore got its own two suites rather than growing either; neither is worse than at entry
APP3-B05 = COMPLETE — REVIEW_ACCEPTED
APP3-B05 OPERATIONS = publicDesignTemplate_list publicDesignTemplate_detail
APP3-B05 SURFACE = PATHS_31_OPERATIONS_36_SCHEMAS_81
APP3-B05 COMPATIBILITY = EXACT_TRIPLE_PRODUCT_SIDE_AREA
APP3-B05 SCOPE_REQUIREMENT = ALL_THREE_IDS_REQUIRED_NO_PARTIAL_NO_WILDCARD
APP3-B05 VERSION_SELECTION = HIGHEST_PUBLISHED_AT_NOT_NULL
APP3-B05 SCOPE_ELIGIBILITY = RE_EVALUATED_AT_READ_TIME
APP3-B05 NON_DISCLOSURE = ONE_ANSWER_FOR_EVERY_INVISIBLE_STATE
APP3-B05 PAGINATION = KEYSET_CREATED_AT_DESC_ID_DESC_SCOPE_BOUND_CURSOR
APP3-B05 DOCUMENT_SCHEMA = REUSES_APP3-P01_DESIGNDOCUMENT_COMPONENT
APP3-B05 AUTHENTICATION = ANONYMOUS
APP3-B05 CACHE = NO_STORE
APP3-B05 WRITES = NONE
APP3-B05 AUDIT = NONE
APP3-B05 EVENTS = NONE
APP3-B05 MIGRATION = NONE
APP3-B05A = COMPLETE — REVIEW_ACCEPTED
APP3-B05A OPERATIONS = publicDesignTemplateAsset_get
APP3-B05A ROUTE = GET /api/public/design-templates/{slug}/versions/{version}/assets/{assetId} — locked at the B05A entry audit; no current authority contradicted it
APP3-B05A SURFACE = PATHS_35_OPERATIONS_40_SCHEMAS_83 — +1 path, +1 operation, schemas measured and unchanged (binary response, no request body)
APP3-B05A AUTHORIZATION = CURRENT_PUBLIC_TEMPLATE + CURRENT_PUBLIC_IMMUTABLE_VERSION + EXACT_VERSION_DOCUMENT_REFERENCE + DURABLE_TEMPLATE_ASSOCIATION + CURRENT_SCOPE_ELIGIBILITY + ELIGIBLE_READY_NORMALIZED_DERIVATIVE — six conjunctive terms; a raw asset id grants nothing
APP3-B05A VERSION_SELECTION = HIGHEST_PUBLISHED_AT_NOT_NULL_ONLY — a historical published version is refused exactly as an unknown one is; published_at is never cleared, so historical publication is a fact about the past and not a grant
APP3-B05A GENERIC_ASSET_API = NONE — no /api/public/assets/{assetId} and no equivalent; the asset segment is unreachable without the template and the version
APP3-B05A DOCUMENT_MEMBERSHIP = P01_STRUCTURE_VALIDATION_THEN_IMAGE_ELEMENT — an unreadable stored document yields no references and fails closed; a stray assetId on a non-image element authorizes nothing
APP3-B05A ASSOCIATION = BOTH_HALVES_REQUIRED — design_template_assets is cumulative, so an association left by an older version does not authorize the current one; a document reference with no association is refused identically
APP3-B05A DERIVATIVE = NORMALIZED_READY_UNWATERMARKED_QUARTET_COMPLETE — raster image/webp (W01A) and already-sanitized image/svg+xml (W01B); ORIGINAL, THUMBNAIL, CATALOG_PREVIEW, PREVIEW_WATERMARKED and MOCKUP are unreachable
APP3-B05A SVG = DELIVERED_ONLY_AS_THE_SANITIZED_NORMALIZED_DERIVATIVE — no re-sanitization on read, no raw source path
APP3-B05A ORDERING = DESCRIPTOR_BEFORE_STORAGE — an unauthorized probe costs one query and never reaches the provider; no transaction spans the stream
APP3-B05A INTEGRITY = PROVIDER_SIZE_MUST_EQUAL_PERSISTED_BYTE_SIZE — a contradiction is a safe 503 with the stream destroyed, never a 404 and never a misleading length
APP3-B05A HEADERS = NO_STORE + NOSNIFF + INLINE_NO_FILENAME + RECONCILED_CONTENT_LENGTH — no ETag, no Last-Modified, no Range; version immutability does not make the authorization context immutable
APP3-B05A NON_DISCLOSURE = ONE_ANSWER_FOR_TWELVE_REASONS — proven over HTTP: unknown slug, DRAFT template, unknown version, unknown asset and another template's asset are byte-identical in status, code and message
APP3-B05A AUTHENTICATION = ANONYMOUS
APP3-B05A WRITES = NONE
APP3-B05A AUDIT = NONE
APP3-B05A EVENTS = NONE
APP3-B05A MIGRATION = NONE
APP3-B05A DEFECT_FOUND_BY_INTEGRATION = SELF_JOIN_WITHOUT_AN_ALIAS — the newer-published-version test compared design_template_versions with itself, and Drizzle emitted one relation name for both sides, so the correlated predicate degenerated to `version > version` and NOT EXISTS was always true. Publishing v2 left every v1 asset address serving. Closed with an explicit alias; the version-rollover scenario is the proof
APP3-B05A DISCLOSED_FINDING = B05_DETAIL_SLUG_GENERATES_AS_UNKNOWN — an @ApiParam with no schema emits `unknown` for that argument, the same family as APP3-P04's schema-less response. B05A declares a schema on every parameter; the accepted B05 detail read is reported, not repaired
APP3-S01 = COMPLETE — REVIEW_ACCEPTED
APP3-S01 ROUTE = /san-pham/[slug]/thiet-ke — a child of the accepted Product Detail route (IMP-D039); /studio, /editor, /thiet-ke/[id], /san-pham/[slug]/studio and /design-session/[sessionId] are rejected, and Side/Area are never path authority
APP3-S01 DESIGN_ROWS = 5 — FIG-STUDIO-SHELL-DESKTOP-{DEFAULT 604:5, PREVIEWPENDING 604:46, EMPTY 604:73, EXPIRED 604:85} + FIG-STUDIO-SHELL-MOBILE-DEFAULT 604:100, section 05 (596:11), approved under APP3-S01 §3 operator review; every S02–S11 row stays REVIEW_REQUIRED
APP3-S01 BOUNDARY = SERVER_ROUTE_SHELL + LAZY_CLIENT_ISLAND — the segment resolves the Product and takes the safe not-found; placement, selection, preview, bootstrap and resume are client-only
APP3-S01 OPERATIONS_CONSUMED = publicProductPlacementGet publicDesignTemplateList publicDesignTemplateDetail publicDesignTemplateAssetGet publicDesignSessionCreate publicDesignSessionResume
APP3-S01 PLACEMENT_AUTHORITY = PUBLIC_MANIFEST_ONLY — no Admin placement operation, no duplicated geometry, no DB or storage reach
APP3-S01 ELIGIBILITY = STUDIO_ELIGIBLE_FALSE_BLOCKS_TEMPLATES_AND_SESSION — no fabricated placement and no Blank offered on a placement the server will not vouch for
APP3-S01 SELECTION = IMP-D041_DETERMINISTIC — first row by displayOrder, then code, then id; the ordered active Side list is never narrowed before the first row is taken (corrected by APP3-S01-C1); Areas resolve inside their Side only; a Side change re-derives Area and clears Template, preview and cursor in one reducer transition
APP3-S01 COMPATIBILITY = EXACT_TRIPLE_IN_THE_QUERY_KEY — a placement change addresses a different query, so a late response for the previous placement cannot land in the new one; no wildcard, offset, page, total, search or sort is sent
APP3-S01 PAGINATION = KEYSET_OPAQUE_CURSOR — a failed continuation replays the exact cursor and never restarts from the first page
APP3-S01 DETAIL_READS = SELECTED_TEMPLATE_ONLY — no per-row detail fan-out; a Template that disappeared between list and detail withdraws the selection and is never converted into a Blank start
APP3-S01 PREVIEW = B05A_CONTEXTUAL_ONLY — the asset id comes from the selected published version's own document; no generic asset URL, storage key, presign or Admin route; no S02 renderer is built to show it
APP3-S01 PREVIEW_LIFECYCLE = QUERY_OWNS_THE_BLOB_EFFECT_OWNS_THE_URL — gcTime 0, no placeholderData; the object URL is revoked on Template change, Side/Area change, blob replacement and unmount, and is never persisted anywhere
APP3-S01 TEXT_ONLY_TEMPLATE = VALID — a document that places no image is stated as text-only and requests no asset
APP3-S01 BOOTSTRAP = TWO_EXPLICIT_ACTIONS — the generated BLANK and CLONE_TEMPLATE branches, bound to the authorized Product/Side/Area codes; no locally manufactured blank document, no clone→blank fallback, duplicate submission blocked
APP3-S01 SESSION_TRUTH = RETURNED_SNAPSHOT — expiry displayed, never computed; revision never advanced client-side; create never replayed
APP3-S01 RESUME_IDENTITY = IN_MEMORY_CREATE_RESPONSE — the secret is a host-only HttpOnly cookie the browser attaches to a same-origin request by itself, so resume takes no secret argument; the sessionId comes from the create response and is held in component state only
APP3-S01 RESUME_ACROSS_RELOAD = NOT_REPRESENTABLE_AND_NOT_IMPLEMENTED — no accepted persistence or URL contract carries a sessionId across a reload, and S01 invents none; that path is APP3-S10's
APP3-S01 BROWSER_PERSISTENCE = NONE — no localStorage, sessionStorage, cookie write, URL parameter, React prop or Zustand store carries a Session id or secret
APP3-S01 EXPIRY = 401_ONLY — B07 refuses an expired or revoked Session with 401; the state offers one explicit new start, revives nothing and holds no grace secret
APP3-S01 S02_HANDOFF = SMALLEST_TRUTHFUL_PLACEHOLDER — no stage, renderer, selection, transform, layer, history or editor state container, and no disabled editing control that promises one
APP3-S01 BACKEND_CHANGE = NONE — API runtime, database, migrations, worker, OpenAPI artifact and generated client are byte-unchanged; only the handwritten curated api-client export grew
APP3-S01 SURFACE = PATHS_35_OPERATIONS_40_SCHEMAS_83 — unchanged from the accepted B05A world
APP3-S01 MIGRATION = NONE
APP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S01-C1 CAUSE = INITIAL_SIDE_SELECTION_SKIPS_CANONICAL_FIRST_ACTIVE_SIDE — delivered S01 chose the first Side that carried an Area, which is a product-authority refinement of IMP-D041 PO-04, not an implementation detail; human review rejected it
APP3-S01-C1 INITIAL_SIDE = ORDERED_ACTIVE_SIDES[0] — displayOrder, then code, then id, with no filter by area count, background, Template availability or bootstrap readiness applied first
APP3-S01-C1 ZERO_AREA_SIDE = SELECTED_AND_REPRESENTABLE — the Side stays selected, areaId is null, the Side selector stays operable, and no Template list, detail, preview or Session create is requested; the Blank and Clone actions are absent rather than disabled
APP3-S01-C1 ZERO_AREA_COPY = SIDE_SCOPED — "Mặt thêu này chưa có vùng thêu khả dụng. Hãy chọn mặt khác để tiếp tục."; the Product is never declared unavailable while another Side remains usable, and the "only one Area" sentence is not borrowed for a Side with none
APP3-S01-C1 ELIGIBILITY_READING = PRODUCT_LEVEL_UNCHANGED — studioEligible true means one Side is completely usable, never that every active Side is individually bootstrap-ready
APP3-S01-C1 REVOCATION_DISTINCTION = ABSENT_MOVES_PRESENT_DOES_NOT — a Side that left the manifest re-derives the selection; a Side still present whose Areas were all retired keeps the selection and clears only the Area
APP3-S01-C1 NO_AUTO_JUMP = TRUE — a Side the customer deliberately chose is never exchanged for a usable one, on selection or on any later reconcile
APP3-S01-C1 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client, API runtime, worker and database all unchanged
APP3-S01-C1 MIGRATION = NONE
APP3-S02 = COMPLETE — REVIEW_ACCEPTED
APP3-S02 DESIGN_ROWS = 3 — FIG-STUDIO-STAGE-DESKTOP-{UNSELECTED 606:3, SELECTED 606:63, EMPTY 606:133}, section 06 (596:12), approved under APP3-S02 §5 operator review; FIG-STUDIO-EDITING-TABLET-1024 (618:140) stays an APP3-D01-C1 responsive reference and is not re-attributed, and every S03–S11 capability row stays REVIEW_REQUIRED
APP3-S02 RENDERER = ONE_NATIVE_SVG_RENDERED_BY_REACT — IMP-D026 and ADR-APP0-001 preserved; exactly one <svg> root in the whole Studio feature, no <canvas>, and no Konva, Fabric, Pixi, interact.js or other rendering/interaction dependency in the Storefront manifest or its source
APP3-S02 ADAPTER = RENDERER_ADAPTER_IS_MANDATORY_AND_PURE — features/design-studio/renderer/ turns a P01 document plus P02 answers into a plain RenderableScene; the React components draw it and resolve nothing. No React, DOM, fetch, object URL or clock is reachable from the adapter, which is what makes the geometry rules provable by calling it
APP3-S02 DOCUMENT_AUTHORITY = APP3-P01_VALIDATES_AND_NOTHING_REPAIRS — validateDesignDocumentStructure at the stage boundary; an unreadable schema version or a malformed payload yields a bounded document-unavailable stage rather than guessed geometry, and no document, JSON path, element id or finding message is put on screen while it is refused
APP3-S02 GEOMETRY_AUTHORITY = APP3-P02_ONLY — buildElementGraph, resolveEffectiveTransform, getElementBounds, structuralFinding and rectToBounds; no local matrix composition, trigonometry, stroke expansion, parent walking or px↔mm conversion, and no geometry taken from getBoundingClientRect, DOMRect, DOMMatrix or getBBox. The renderer serializes P02 matrices to matrix(a b c d e f) and nothing more
APP3-S02 GRAPH_FAILURE = WHOLE_SCENE_REFUSED — an ambiguous parent graph or an unresolvable element fails the stage rather than being drawn at the identity or skipped; a design missing a part is indistinguishable from a design that never had one
APP3-S02 COORDINATE_SYSTEM = VIEWBOX_IS_THE_PLACEMENT_CANVAS — 0 0 canvasWidthPx canvasHeightPx from the document, with CSS controlling visual fit only; no authored coordinate is multiplied by a viewport scale at any breakpoint
APP3-S02 PAINT_ORDER = DOCUMENT_ARRAY_ORDER_BOTTOM_FIRST — SVG has no z-index, so DOM order is the stacking; the element list is never sorted, reversed or re-ranked, and reordering stays APP3-S04's
APP3-S02 ELEMENT_KINDS = TEXT_SHAPE_FREEHAND_IMAGE_PLACEHOLDER — groups paint nothing of their own and are filtered out with their transform already composed into every descendant; hidden elements keep geometry but are neither painted nor selectable; stroke cap, join and miter come from the engine constants the bounds were measured with
APP3-S02 FONTS = CONTROLLED_REGISTRY_OR_REFUSE — IMP-D044 PO-10 and REJECT_IF_CONTROLLED_FONT_UNAVAILABLE; a fontId outside the registry refuses the scene rather than substituting a face with different metrics, and no stylesheet rule overrides a document's own family
APP3-S02 SELECTION = SINGLE_ELEMENT_RUNTIME_ONLY — one serializable selectedElementId in one Zustand store holding nothing else; click to select, click another to replace, click empty stage to clear, Enter/Space from the keyboard, stale selection dropped against every scene, released on unmount. Never serialized, never sent, never persisted; no multi-select, marquee, drag, resize, rotate, flip or nudge
APP3-S02 SELECTION_VISUAL = P02_BOUNDS_OUTLINE_NO_HANDLES — the outline is APP3-P02's transformed stroke-aware AABB and never a layout box; there are no handle markers, because a handle that cannot be grabbed is a promise APP3-S03 has not shipped
APP3-S02 BACKGROUND = APP3-B02_CONTEXTUAL_PRODUCT_SLUG_PLUS_SIDE_CODE — publicProductSideBackgroundGet crossed the curated boundary with S02 as its first real consumer; no assetId, derivativeId, storage key, presign or generic media route, and the bytes compose as an <image> across the same viewBox with xMidYMid meet so the derivative's intrinsic size never rewrites document geometry
APP3-S02 BACKGROUND_LIFECYCLE = QUERY_OWNS_THE_BLOB_EFFECT_OWNS_THE_URL — gcTime 0, no placeholderData; the object URL is revoked on Session or Side change, on blob replacement and on unmount, and is never persisted anywhere
APP3-S02 SESSION_HANDOFF = S01_SNAPSHOT_IS_THE_INPUT — the stage extends the accepted client island after a valid snapshot exists; no second Studio route, no second bootstrap flow, no create or resume call merely to obtain the document, and the Session's own scope is stage authority so a later pre-bootstrap picker change cannot retarget an open Session
APP3-S02 IMAGE_MEDIA_MODE = DEFERRED_TO_S06_B06C — audited against S01, P01, B07, B08, B05A, B06B and the generated client: the only public Session asset path is POST (APP3-B06B upload), no delivery route exists, and APP3-B05A is published-Template authority a cloned Session does not inherit. Image elements render a truthful placeholder at their real P02 geometry, remain selectable, and expose no asset or derivative id
APP3-S02 AREA = STATIC_PERSISTED_RECTANGLE — drawn from the Session scope bounds through the engine's rectToBounds with no inset or derived second geometry; non-interactive, with show/hide and zoom-dependent behaviour left to APP3-S07
APP3-S02 NON_SCOPE = S03_S04_S05_S06_S07_S08_S09_S10_S11 — no transform mutation of any kind, no layer panel or reorder, no text editing controls, no upload, no zoom or pan, no undo or redo, no runtime watermark, no autosave or conflict handling, and no mobile touch editing; publicDesignSessionAutosave and publicDesignSessionAssetCreate stay off the curated boundary
APP3-S02 RUNTIME_STATE = NO_MUTABLE_OBJECT_IN_THE_STORE — no SVGElement, DOM node, DOMRect, DOMMatrix, matrix object, AbortController, Blob, object URL, renderer instance, mutable P02 graph, React ref or Error; and no server state duplicated from the Session snapshot
APP3-S02 DEPENDENCIES = TWO_INTERNAL_WORKSPACE_LINKS — @embroidery/design-document and @embroidery/design-engine added to the Storefront through one pnpm install; no external dependency, no new shared package, no spike or Admin-feature import
APP3-S02 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client source, API runtime, worker and database all unchanged. The curated api-client newly exports publicProductSideBackgroundGet and changes no generated file
APP3-S02 MIGRATION = NONE
APP3-S02 S01_GATE_EVOLUTION = WORLD_AWARE_NOT_DELETED — S01's no-renderer, no-<svg>, no-Zustand and no-background rules are kept and scoped to the files S01 owns, with the whole feature now required to carry exactly one renderer; a new file inherits the strict S01 rules by default
APP3-S07 = COMPLETE — REVIEW_ACCEPTED
APP3-S07 DESIGN_ROWS = 3 — FIG-STUDIO-ZOOM-DESKTOP-{FIT 609:3, ZOOMED 609:51, SAFEAREAHIDDEN 609:99}, section 11 (596:17), approved under APP3-S07 §4 operator review; FIG-STUDIO-EDITING-TABLET-1024 (618:140) stays an APP3-D01-C1 responsive reference, and every S03, S04, S05, S06, S08, S09, S10 and S11 capability row stays REVIEW_REQUIRED
APP3-S07 RENDERER = APP3-S02_SCENE_UNCHANGED — studio-stage.tsx, studio-stage-element.tsx, studio-stage-selection.tsx and the whole renderer/ adapter are byte-identical; still exactly one <svg>, one viewBox that is the document placement canvas, and no second, hidden or offscreen scene for rendering or for benchmarking
APP3-S07 WEBKIT_MITIGATION = DISCRETE_STEPS_ON_ONE_CSS_WRAPPER — ADR-APP0-001 measured WebKit re-rasterising the whole SVG on continuous viewport scale at 41 ms p95 against a 20 ms desktop budget versus 16.7 ms Chromium. Both halves of the ADR's own mitigation are applied: zoom is an index into a frozen six-value list so an arbitrary scale is unrepresentable, and the transform is one CSS transform on a single wrapper outside the SVG rather than a continuously rewritten SVG scale
APP3-S07 ZOOM = FINITE_ORDERED_SET — 100, 125, 150, 200, 300, 400 percent addressed by step index; bounded, monotonic, deterministic, keyboard-operable, with the same action always producing the same value and no floating multiplication accumulating drift
APP3-S07 ZOOM_LIMITS_DISCLOSED = ENGINEERING_RULING — the approved frames draw a stepped control, a Fit action and a safe-area toggle, but the exact step sequence and end values are not resolvable from repository authority; the smallest bounded ruling consistent with the drawn control was taken and is disclosed rather than presented as design authority
APP3-S07 FIT = CANONICAL_INITIAL_VIEWPORT — the fitted view is zoom 1 with zero pan, because the SVG viewBox already fits the placement canvas into the frame; Fit and viewport reset are therefore the same state and exactly one control exists, which is what the approved design draws. Fit never resets the Design Document, an element transform or the Session, and never clears the selection
APP3-S07 PAN = VIEWPORT_ONLY_BACKGROUND_DRAG — mouse and pen only, started only on the stage surface (the frame or the <svg> root itself), past a 3 px threshold; an element is never a pan handle, no element geometry moves, and a real drag swallows its trailing click so panning cannot silently clear the APP3-S02 selection
APP3-S07 PAN_BOUNDS = STRUCTURALLY_UNLOSABLE — pan is stored as a fraction of the viewport and clamped to [-(zoom - 1), 0] on both axes, which is exactly the interval that keeps the content covering the frame; at the fitted step the interval collapses to the single value 0, so at fit there is no pan to be lost in and at every other step the stage cannot be dragged out of its own frame
APP3-S07 VIEWPORT_STATE = RUNTIME_ONLY_SERIALIZABLE_NUMBERS — zoomStep, panXRatio, panYRatio and safeAreaVisible in a store separate from the APP3-S02 selection store, so S02's rule that the selection store may not contain "zoom" or "pan" stayed absolute rather than being relaxed. No DOMRect, DOMMatrix, SVGElement, pointer event, animation-frame handle, object URL, React ref, snapshot or Design Document; never written to the document, autosave, localStorage, sessionStorage, the URL or a cookie, and no persistence middleware
APP3-S07 DOCUMENT_MUTATION = NONE — zoom, pan, fit and the safe-area toggle issue zero API calls and change no element transform, placement canvas, embroidery-area geometry, Session scope, px_per_mm or revision. APP3-P02 is never consulted again for a viewport change and the renderer scene is never rebuilt by one
APP3-S07 SAFE_AREA = PRESENTATION_ONLY_TOGGLE — the same rectToBounds rectangle APP3-S02 draws, withheld from the paint when hidden; no second or inset boundary is derived locally, and the boundary shares the scene coordinate system so it follows zoom and pan exactly with the background and the elements rather than being a CSS overlay that could drift
APP3-S07 BACKGROUND = APP3-B02_CONSUMER_UNCHANGED — publicProductSideBackgroundGet stays the sole contextual background read with its APP3-S02 Blob and object-URL lifecycle intact; the query key contains no viewport state, so zooming and panning cannot trigger a refetch
APP3-S07 SELECTION_UNDER_TRANSFORM = BROWSER_INVERTS_THE_TRANSFORM — the scene is transformed as one layer, so the outline cannot drift from the artwork at any zoom, and hit testing routes a click through the transform natively; selection identity is never derived from CSS pixels and zoom or pan never changes selectedElementId
APP3-S07 MEASUREMENT = ONE_TRANSIENT_ELEMENT_SIZE — clientWidth and clientHeight of the viewport element, read during a pan gesture to divide two pixel deltas into ratios and never stored; getBoundingClientRect, DOMRect, DOMMatrix, getBBox, getScreenCTM and getComputedStyle remain refused across the whole feature in every world
APP3-S07 TOUCH = REFUSED_BY_POINTER_TYPE — a touch pointer never starts a pan, so no pinch, two-finger pan or inertial gesture exists and the page keeps its own scroll at 390; APP3-S11 still owns mobile and touch behaviour and is not made ready by this checkpoint
APP3-S07 NON_SCOPE = S03_S04_S05_S06_S08_S09_S10_S11 — no transform handle, element drag, resize, rotate or nudge; no layer panel, text editing, upload, undo or redo, runtime watermark or autosave; no wheel zoom, which stays refused in both worlds as the arbitrary-scale path the ADR measured
APP3-S07 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client source, curated HTTP operation set, API runtime, worker and database all unchanged
APP3-S07 MIGRATION = NONE
APP3-S07 PREDECESSOR_GATE_EVOLUTION = WORLD_AWARE_NOT_DELETED — S01's whole-feature "viewport" ban and S02's pointer-gesture and layout-measurement bans are kept and narrowed to exclude only the five files S07 introduces; both still refuse the capability arriving early, and anything added later inherits the strict rule by default
APP3-S03 = COMPLETE — REVIEW_ACCEPTED
APP3-S03 DESIGN_ROWS = 3 — FIG-STUDIO-TRANSFORM-DESKTOP-{MOVE 606:186, RESIZE 606:256, ROTATE 606:326}, section 07 (596:13), approved under APP3-S03 §2 operator review; FIG-STUDIO-EDITING-TABLET-1024 (618:140) stays an APP3-D01-C1 responsive reference, and every S04, S05, S06, S08, S09, S10 and S11 capability row stays REVIEW_REQUIRED
APP3-S03 RESIZE_PERSISTENCE = SCALE_ABOUT_THE_LOCAL_BOX_CENTRE — resolved mechanically from IMP-D045, not chosen. PO-04 makes the centre the scale pivot and states that scale never alters x, y, width or height; PO-02 makes width/height the unscaled dimensions. Writing width/height instead would not resize two of the five v1 kinds at all, because a freehand element's envelope comes from its stored points and a text element's from fontSizePx — neither of which a width change touches. Scale is therefore the only representation that resizes every kind
APP3-S03 RESIZE_ANCHOR = CENTRE_NOT_OPPOSITE_CORNER — a consequence of the above and disclosed as such: anchoring the opposite corner would require writing x/y alongside the scale, and no accepted rule authorises that pairing
APP3-S03 FLIP = NOT_AUTHORIZED_BY_CURRENT_S03_DESIGN — D01 records exactly three S03 frames (move, resize, rotate) and no flip frame; flip is not implemented here and is not reassigned elsewhere
APP3-S03 WORKING_DOCUMENT = ONE_RUNTIME_ONLY_COPY — initialized once per Session identity and revision from the authoritative snapshot, replaced immutably by every committed candidate, and consumed by the renderer from then on. The server snapshot stays an immutable baseline for APP3-S10 and never competes as a second editable scene. No autosave, timer, localStorage, sessionStorage, IndexedDB, URL or cookie; APP3-S08 owns history
APP3-S03 GESTURE_MODEL = FROZEN_START_PLUS_TOTAL_DELTA — a gesture captures the document and transform it began with and recomputes the candidate from that plus the total pointer delta, so nothing accumulates onto the previous frame and a drag out and back returns exactly the values it started with
APP3-S03 MOVE = PARENT_FRAME_THROUGH_P02_INVERSE — x/y are parent-frame coordinates (PO-02), so a document-space delta goes through the inverse parent matrix as a vector; a grouped child under a rotated group moves correctly rather than plausibly
APP3-S03 ROTATE = CLOCKWISE_ABOUT_THE_UNTRANSFORMED_CENTRE — PO-03; never the transformed-AABB centre, the persisted corner or a renderer default. Measured from the vector the gesture began with, so an ungrabbed pointer produces exactly the starting angle and no jump
APP3-S03 VALIDATION = QUANTIZE_THEN_MEASURE_THEN_BLOCK — P01 structure, then P01 quantization, then P02 stroke-aware containment and physical size measured on the quantized candidate (PO-09 checks containment after quantization). An invalid candidate is not committed at all: no clamp, no auto-translate, no scale-down, no snap-to-fit and no warn-but-persist. The last valid candidate stands and the refusal is stated in text
APP3-S03 CHROME = DOM_OVERLAY_NEVER_DOCUMENT_CONTENT — IMP-D026 requires DOM handles outside the element box at ≥44 px and focusable, so the eight resize handles, the rotate affordance and the move surface are HTML in an overlay and never SVG. The APP3-S02 scene is byte-identical, and no handle enters the canonical document or its hash
APP3-S03 HANDLE_ALIGNMENT = ORIENTED_BOX_IN_PERCENT_OF_THE_STAGE — each handle sits at the document point P02 maps its local-box anchor to, expressed as a percentage of the stage box, inside the APP3-S07 transform layer. It therefore inherits the viewport transform exactly as the artwork does and traces the oriented box rather than the axis-aligned bounds
APP3-S03 HIT_TARGET = 44PX_EFFECTIVE_16PX_VISIBLE — the knob follows the 1024 reference at 16 px and the button around it is the 44 px target; both are counter-scaled by 1/zoom so the effective on-screen size is unchanged at 400 %
APP3-S03 PHYSICAL_READOUT = P02_BOUNDS_OVER_PRODUCT_SIDE_PXPERMM — IMP-D045 PO-10; never CSS pixels, device pixel ratio, 96 DPI, EXIF DPI or the viewport scale, so zooming changes how large the element looks and changes no millimetre
APP3-S03 AREA_LIMITS_SOURCE = PUBLIC_PLACEMENT_MANIFEST_CAPTURED_AT_BOOTSTRAP — the Session scope carries pxPerMm and the safe-area rectangle but not maxWidthMm/maxHeightMm, so they come from the manifest APP3-S01 already fetched, frozen when the Session opens. No new API and no second request; a null maximum means the Side itself is the limit, which is the manifest's own definition
APP3-S03 TOUCH = REFUSED_BY_POINTER_TYPE — a touch pointer starts no move, resize or rotate, so APP3-S11 still owns mobile and touch and is not made ready by this checkpoint
APP3-S03 NON_SCOPE = S04_S05_S06_S08_S09_S10_S11 — no layer panel, reorder, lock or hide toggle, group or ungroup; no text or font property editing; no upload or B06C; no undo, redo or history; no runtime watermark; no autosave, saving chip, conflict dialog or persistent resume
APP3-S03 PERFORMANCE = MEASURED_18_OF_18_WITHIN_BUDGET_AFTER_APP3-S03-C1 — Chromium and WebKit, three production scene sizes (10, 50, 100), three gestures, one pointer move per animation frame against the frozen ADR-APP0-001 §6 transform budget of 20 ms p95 desktop. Chromium 9/9 at p50 16.7 and p95 16.7 with zero dropped frames. WebKit 9/9 at p50 15–16 and p95 16–19 with zero dropped frames; the worst single frame in any 60-frame gesture is 32 ms and no gesture has more than 3 frames above 20 ms, so every p95 is inside the budget with margin. The two breaches human review recorded — resize 30 ms at M and 21 ms at L — are closed at 19 ms and 17 ms
APP3-S03 PERFORMANCE_PASS = TWO_BOUNDED_PASSES — the first (APP3-S03) shared one element graph per document where the candidate authority, the transform chrome and the physical read-out had each built their own, taking WebKit p50 from 19–26 to 15–16 and dropped frames from 3–7 to 0. The second (APP3-S03-C1) is the remedy that pass named: a transform frame replaced the whole working document, so every element in the scene re-rendered to redraw the one being dragged. The adapter now restores the previous instance of every element whose value and whose ancestors' values are unchanged, and the element component is memoized on that identity. Measured first: APP3-P01 validation and quantization plus APP3-P02 transforms and stroke-aware bounds for a hundred elements total ~0.2 ms, so the frame was never geometry
APP3-S03-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-S03-C1 CAUSE = WEBKIT_RESIZE_P95_EXCEEDED_FROZEN_20MS_BUDGET — human review accepted every S03 semantic, geometry, chrome, viewport, test, browser and contract property and returned exactly one issue: WebKit resize p95 30 ms at M and 21 ms at L against the frozen 20 ms desktop budget, with the report itself naming a bounded remedy that does not reopen the renderer architecture
APP3-S03-C1 OPTIMIZATION = STRUCTURAL_IDENTITY_REUSE_PLUS_MEMOIZED_ELEMENT — renderer/studio-scene-identity.ts restores the previous instance of an element whose value is unchanged, the adapter reuses a placed element only when that element and every ancestor kept their instance, and StudioStageElement is memoized on the resulting stable input identity. No custom comparator, because a field left off one is a stale element nothing reports
APP3-S03-C1 SEMANTICS = UNCHANGED — resize persistence, move frame, rotation pivot, blocking containment, P01 quantization order, P02 authority, the one working document, the one native SVG scene and the S07 runtime-only viewport are all exactly as accepted; the correction removes work, never a rule
APP3-S03-C1 ANCESTOR_CORRECTNESS = REUSE_REQUIRES_THE_WHOLE_PARENT_CHAIN — APP3-P02 composes ancestors outermost-first, so a grouped child whose own record is untouched still moves when its group does. Reuse keyed on element id would repaint it at the group's old position and would look perfect in every ungrouped scene; the gate asserts the chain walk and a mutation proves it
APP3-S03-C1 NO_BENCHMARK_BRANCH = ASSERTED — no user-agent test, scene-size threshold, environment flag, skipped validation or approximate renderer anywhere in the feature; one cross-browser implementation, gated structurally
APP3-S03-C1 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client source, curated HTTP operation set, API runtime, worker and database all unchanged, and no dependency added
APP3-S03-C1 APP0_REGRESSION = NON_REGRESSED — the frozen APP0-R01 spike suite passes 29/29 and the spike benchmark 15 passed / 3 skipped, with node and DOM-node counts identical to HEAD at every engine, project and scene size; results restored to HEAD after comparison
APP3-S03 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client source, curated HTTP operation set, API runtime, worker and database all unchanged
APP3-S03 MIGRATION = NONE
APP3-S03 PREDECESSOR_GATE_EVOLUTION = WORLD_AWARE_NOT_DELETED — S01's Zustand rule and S02's pointer, layout-measurement and engine-composition bans are kept and narrowed to exclude only the files S03 introduces; Math.cos, Math.sin and Math.tan stay banned across the whole feature in every world, because those build a second matrix
APP3-S05 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
APP3-S05 REVIEW_FINDINGS = 2 — human review accepted the P01 text audit, the EDIT_ONLY_NO_CREATION and FILL rulings, the one working document, the composition boundary, the P01 limits, the registry-driven picker, the supported field set, the P02 geometry boundary, the S03 transforms, the S03-C1 render reuse, the zero API delta, the 1440 behaviour, the accessibility fundamentals and the contract immutability, and returned exactly two: (A) the 1024 composition contradicted APP3-D01-C1, which draws a topbar-toggled right drawer and not an inspector reflowed beneath the stage; (B) controlled-font readiness probed only the family, so a loaded upright reported READY for a missing italic. Both are corrected by APP3-S05-C1
APP3-S05 DESIGN_ROWS = 3 — FIG-STUDIO-TEXT-DESKTOP-{EDITING 608:176, FONTPICKER 608:231, VALIDATION 608:286}, section 09 (596:15), approved under APP3-S05 §4 operator review; FIG-STUDIO-EDITING-TABLET-1024 (618:140) stays an APP3-D01-C1 responsive reference and only its S05 portion is activated, and every S04, S06, S08, S09, S10 and S11 capability row stays REVIEW_REQUIRED
APP3-S05 FIGMA_LIVE_READ = UNAVAILABLE_NONBLOCKING — the Figma MCP server required an interactive OAuth authorization this run could not complete, so the three rows were resolved from the canonical registry and the accepted APP3-D01 record (§4 nonblocking condition). No Figma node was created, moved or mutated
APP3-S05 SCOPE = EDIT_ONLY_NO_CREATION — the three approved frames are Editing, Font Picker and Validation & Font Loading, and D01 records S05 as "text editing, font picker restricted to the APP3-F01 registry, validation plus font-loading fallback". No frame draws an add-text affordance and no accepted authority establishes a new element's id, initial string, typography, placement, opacity, flags or insertion z-order, so text creation is not implemented and is not reassigned elsewhere
APP3-S05 EDITABLE_FIELDS = TEXT_FONTID_FONTSIZEPX_FONTWEIGHT_FONTSTYLE_TEXTALIGN — exactly the v1 TextElement fields the accepted design draws. No fontFamily, font URL or binary, HTML or rich text, letter spacing, line height, curved text, text-on-path, thread palette id or stitch density; none exists in P01 v1 and inventing one would produce a document APP3-P01 refuses to read. No P01 or P02 schema change
APP3-S05 FILL = NOT_EDITED_DELIBERATELY — fill is a P01 field and stays a persisted value this checkpoint carries through untouched. None of the three approved frames is a colour state, and P01 validates fill only as a non-empty NFC string — it publishes no colour format, palette, thread code or manufacturing semantic for a control to be correct against. A colour control would have had to invent both its design and its contract
APP3-S05 FONT_AUTHORITY = CONTROLLED_REGISTRY_ONLY — the picker is built from DESIGN_FONT_REGISTRY, so it holds exactly Inter today and grows only when the registry does. No remote font, no Google Fonts request, no system or arbitrary document font, no font upload, and General Sans stays a CSS chrome fallback that can never be offered as a document font
APP3-S05 FONT_DELIVERY = FEATURE_STYLESHEET_FONTFACE_OVER_THE_F01_BINARY — two @font-face rules in the feature stylesheet point at packages/design-document/assets/fonts/inter/4.1/InterVariable{,-Italic}.woff2, the exact binaries APP3-F01 acquired and hashed. No copy under public/, no CDN and no second source that could drift from the recorded SHA-256. font-display is block, not swap, so a substituted face is never painted first; nothing writes a font path, URL or bytes into a Design Document
APP3-S05 FONT_STATES = LOADING_READY_UNAVAILABLE — useControlledFont asks the CSS Font Loading API and reports all three honestly. A failed controlled font is stated in text and never becomes a different authoritative font silently, which is the closest a renderer gets to the registry's locked REJECT_IF_CONTROLLED_FONT_UNAVAILABLE policy. **Superseded in scope by APP3-S05-C1:** as delivered the probe named the family alone, so a loaded upright reported READY for a missing italic; readiness is now asked per exact variant
APP3-S05 WORKING_DOCUMENT = THE_ONE_APP3-S03_DOCUMENT — a text candidate is built from it, ruled on, and committed back to it. No second document store, no localStorage or sessionStorage draft, no autosave cache and no parallel text model. The only local state is the transient field value during editing or IME composition, plus the last refusal
APP3-S05 VALIDATION = P01_STRUCTURE_THEN_P01_COMPLEXITY_THEN_REGISTRY_THEN_P02 — structure first so a non-NFC string, a fractional weight or an out-of-range size fails before anything measures it; then the 500-per-element and 5000-total code-point ceilings, which a transform could never breach and a text edit is the first thing that can; then the controlled font and variant; then APP3-S03's accepted quantize-then-measure containment and physical-size rules, delegated rather than restated
APP3-S05 IME = COMPOSITION_AWARE_COMMIT — a composition in progress is held in the field and never ruled on, so "Vieejt" on the way to "Việt" cannot reach the document; a completed composition is ruled on immediately. Outside a composition every keystroke is a completed value and commits live, so the stage stays in step with the field
APP3-S05 NFC = REFUSED_NEVER_REWRITTEN — P01 rejects non-NFC input rather than silently normalizing it (ADR-DB1-012 §7), and S05 does not normalize on its behalf. A refused candidate leaves the last valid working document standing, states the refusal in text, and keeps the field contents so the customer can correct what they actually typed
APP3-S05 LIMITS = CODE_POINTS_NOT_UTF16_UNITS — 500 per text element and 5000 per document, counted exactly as P01 counts them, so an astral character costs one of the customer's 500 rather than two. No truncation and no silent character deletion anywhere
APP3-S05 GEOMETRY = P02_DECLARED_BOX_UNCHANGED — APP3-P02 PO-08 measures a text element from its declared box and performs no font measurement, so neither the string nor fontSizePx moves the envelope. No Canvas measureText, SVG getBBox, DOM Range or local text-layout engine is used as geometry truth, and a text edit changes no id, position, size, scale, rotation, z-order, visibility or lock state
APP3-S05 TRANSFORMS = PRESERVED — move, resize, rotate, blocking containment and the P02/pxPerMm millimetre read-out are exactly as APP3-S03 delivered them, and a text edit resets no transform, selection, zoom or pan
APP3-S05 RENDER_ARCHITECTURE = APP3-S03-C1_PRESERVED — one native SVG scene, structural identity reuse and the memoized element component all intact. A regression proves a one-element text edit re-renders the edited element and zero of its unchanged siblings; removing memo fails it. Inspector form controls are HTML, the artwork is still the one SVG
APP3-S05 NON_SCOPE = S04_S06_S08_S09_S10_S11 — no layer panel, reorder, lock or hide toggle, group or ungroup; no image upload or B06C; no undo, redo or history; no runtime watermark; no autosave, saving chip, conflict dialog or persistent resume; no mobile or touch text editing and no S11 bottom sheet
APP3-S05 API_DELTA = 0 — a text edit calls nothing. Static application font loading is not an API mutation
APP3-S05 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client source, curated HTTP operation set, API runtime, worker and database all unchanged, and no dependency added
APP3-S05 MIGRATION = NONE
APP3-S05 PREDECESSOR_GATE_EVOLUTION = WORLD_AWARE_NOT_DELETED — S01's whole-feature ban on reaching the APP3-P01 authority is kept and narrowed to exclude only the seven files S05 introduces, and the S01, S02, S03 and S07 "this row belongs to a checkpoint that has not opened" assertions are made world-aware on the section-09 text row alone. Every other capability row stays exactly as ruled, and anything added later inherits the strict rule by default
APP3-S05-C1 = COMPLETE — REVIEW_DELIVERED
APP3-S05-C1 SCOPE = RESPONSIVE_TABLET_DRAWER_PLUS_CONTROLLED_FONT_VARIANT_READINESS — the first and only ordinary correction for APP3-S05, owning exactly the two findings human review returned plus the S05 mobile boundary needed to keep APP3-S11's text surfaces out. It reopens no TextElement schema, no creation ruling, no IME/NFC semantic, no text limit, no fill ruling, no P02 geometry, no S03 transform semantic, no S03-C1 scene identity reuse, no S07 viewport, no autosave or history, and no API, DB, worker, OpenAPI, generated client, Figma record or later Studio capability
APP3-S05-C1 TABLET_1024 = RIGHT_DRAWER_OVER_THE_STAGE — FIG-STUDIO-EDITING-TABLET-1024 (618:140, APP3-D01-C1) draws the inspector as a right drawer toggled from a persistent control, and the stage stays dominant. The drawer is absolutely positioned inside the stage frame, so opening or closing it changes no in-flow box: the SVG width, the viewBox and every geometry the transform overlay derives from them are identical open and closed. It scrolls on the y-axis only, closes on Escape or its own close control, and returns focus to its trigger
APP3-S05-C1 TRIGGER_PLACEMENT = STUDIO_PERSISTENT_CONTROL_STRIP — D01-C1 says the drawer is toggled "from the topbar"; the accepted implementation has no topbar, because APP3-S07 placed the Studio's one persistent control strip below the stage and that placement is accepted. The trigger therefore joins that strip rather than inventing a second bar above the stage, which would have restructured S07's accepted markup for a composition no frame draws. The authority's substance holds exactly: the toggle is a persistent, always-reachable control outside the panel, carrying aria-expanded and aria-controls, with DOM order, visual order and tab order all in agreement
APP3-S05-C1 MOBILE_390 = NO_S05_TEXT_SURFACE_APP3-S11_OWNS_IT — at the phone tier the panel renders no editable field, no font, style or weight control, no drawer and no bottom sheet; when a text element is selected it renders one bounded non-interactive sentence and nothing else. The decision is made in React rather than in CSS, because a hidden field is still focusable and still submittable and would be S11's capability merely out of sight. No touch text editing and no S11 surface is created, named or promised in copy
APP3-S05-C1 TIER_AUTHORITY = RENDERED_NOT_HIDDEN — studio-responsive.ts publishes the two widths and studio-text-panel.tsx routes desktop, tablet and mobile to three distinct compositions. The server snapshot is deliberately "unknown" and renders nothing, so no editing surface is ever present in HTML delivered to a phone before hydration corrects it. The desktop breakpoint is mirrored in design-studio.scss and the gate compares the two files
APP3-S05-C1 FONT_READINESS = EXACT_FONTID_FONTSTYLE_FONTWEIGHT — readiness is requested for the exact variant a document element names, through a CSS font shorthand carrying the style and the weight and naming the controlled family alone. No fallback family appears in the probe, because a fallback makes every request succeed by matching the fallback. A successful upright never marks italic ready, and a successful 400 never marks a newly chosen 700 ready. A variable binary legitimately answers several weights; the request still carries the weight the document holds, so the answer stays true if the registry ever ships separate weight files
APP3-S05-C1 VARIANT_COMMIT = PROVE_THEN_COMMIT — a requested fontId, fontStyle or fontWeight becomes document truth only after the browser has proved it can paint that face. While the request is in flight the working document keeps the variant it already had; on success the candidate is ruled on by P01 and P02 exactly as before and committed; on failure the previous authoritative value stands and a distinct bounded sentence says the chosen style could not be loaded. No synthesised or substituted face is ever accepted as authoritative
APP3-S05-C1 VARIANT_RACE = NEWEST_REQUEST_WINS — every variant request carries a counter value and writes nothing unless it is still the newest, so a slow italic answering after the customer chose upright, or after they selected a different element, changes neither readiness nor the document. The counter is a hook-local ref; no AbortController and no request state is held in Zustand
APP3-S05-C1 FONT_INTEGRITY = UNCHANGED — the canonical binaries stay packages/design-document/assets/fonts/inter/4.1/InterVariable{,-Italic}.woff2 with the SHA-256 values APP3-F01 recorded; no second copy under public/, no new font, no modified byte, no remote source
APP3-S05-C1 API_DELTA = 0 — the correction calls nothing; static application font loading is not an API mutation
APP3-S05-C1 BACKEND_CHANGE = NONE — Storefront only; OpenAPI 35/40/83, 34 migrations, 30 root scripts, generated api-client source, curated HTTP operation set, API runtime, worker and database all unchanged, and no dependency added
APP3-S05-C1 MIGRATION = NONE
APP3-S05-C1 FIGMA = READ_ONLY — the three section-09 rows stay the only APPROVED_FOR_IMPLEMENTATION S05 rows, FIG-STUDIO-EDITING-TABLET-1024 stays an APP3-D01-C1 reference at its existing status, every S04, S06, S08, S09, S10 and S11 capability row stays REVIEW_REQUIRED, and no Figma node was created, moved or mutated
APP3-B06C = READY — BLOCKED_BY_APP3-S05_CORRECTION_REVIEW
APP3-S06 = BLOCKED_BY_APP3-B06C_REVIEW_ACCEPTANCE
APP3-D01 = COMPLETE — REVIEW_ACCEPTED
APP3-D01-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-D01-C1 CAUSE = TWO_IMPLEMENTATION_READINESS_GAPS_FOUND_AT_HUMAN_REVIEW
APP3-D01-C1 GAP_1 = RESPONSIVE_REFERENCE_FRAMES_1280_AND_1024_NOT_DRAWN
APP3-D01-C1 GAP_2 = FIG-DS-INPUT_AND_FIG-DS-SCRIM-TOKEN_NOT_CANONICALIZED
APP3-D01-C1 DS_REPAIR_AUTHORIZATION = D01_C1_DS_REPAIR_AUTHORIZATION — FIG_DS_INPUT + FIG_DS_SCRIM_TOKEN ONLY
APP3-D01-C1 NEW_FRAMES = 3 — A03 1280 (618:3), A01 1280 (618:74), Studio tablet 1024 (618:140)
APP3-D01-C1 DS_ASSETS = Input component set 76:29 · overlay-scrim token + swatch 78:2
APP3-D01-C1 SCRIM_LITERALS_REMAINING = 0 — all 9 APP_03 scrims bind Color/Overlay/Scrim
APP3-D01-C1 PRODUCT_UI_COLOR_LITERALS_REMAINING = 0 — 694 fills rebound; only Figma SECTION chrome remains
APP3-D01 REGISTRY_ROWS = 69 — 66 from D01 + 3 from C1; 21 moved to APPROVED_FOR_IMPLEMENTATION by APP3-A01
APP3-D01 FIGMA_PAGE = APP_03 (592:3) in FIG-FILE-PRODUCT
APP3-D01 FIGMA_SECTION = 596:3 — 19 nested sections, 66 frames
APP3-D01 REGISTRY_ROWS = 66 — none self-approved; operator approval applied by APP3-A01 §1
APP3-D01 COVERAGE = A01 A02 A03 A04 S01 S02 S03 S04 S05 S06 S07 S08 S09 S10 S11
APP3-D01 OUT_OF_SCOPE = APP3-S12 APP3-S13 — LATER_APP3, not designed as implementation-ready
APP3-D01 AUTOSAVE_CADENCE = OPEN — UNTIL_APP3-S10 (not decided in D01)
APP3-D01 DS_GAPS_REPORTED = FIG-DS-INPUT FIG-DS-SCRIM-TOKEN — reported, not written into the read-only DS file
APP3-G06 = COMPLETE — REVIEW_ACCEPTED
IMP-D046 = LOCKED
APP3-W01 FIRST_ATTEMPT = FAILED — MANUAL_INTERVENTION_REQUIRED
APP3-W01 FIRST_ATTEMPT PRIMARY_CAUSE = JOB_CONTRACT_INSUFFICIENT
APP3-W01 FIRST_ATTEMPT SECONDARY_CAUSE = SVG_SANITIZER_NOT_SELECTED
APP3-W01 = REPLANNED — REPLACED_BY_APP3-W01A_AND_APP3-W01B
APP3-W01A = COMPLETE — REVIEW_ACCEPTED
APP3-B01N = COMPLETE — REVIEW_ACCEPTED
APP3-G07 = COMPLETE — REVIEW_ACCEPTED
IMP-D047 = LOCKED
TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = 1
APP3-W01B = COMPLETE — REVIEW_ACCEPTED
APP3-W01B SANITIZER = DOMPURIFY_3.4.13_ON_JSDOM_29.1.1
APP3-W01B DISCLOSED_DEVIATION = WORKER_IMAGE_DOMAIN_TYPES_COPY_RESTORED
APP3-W01B-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-W01B-C1 NUMERIC_CANONICAL_FORM = SHORTEST_BINARY64_ROUND_TRIP
APP3-W01B-C1 FIXED_PRECISION_BUDGET = NONE
APP3-B02 = COMPLETE — REVIEW_ACCEPTED
APP3-B02 OPERATION = publicProductSideBackground_get
APP3-B02 DISCLOSED_DEVIATION = PREDECESSOR_GATES_MADE_MODE_AWARE_ON_B02
APPROVED_BOUNDED_TOOLING_SIZE_DEVIATION = B02_PREDECESSOR_GATE_AND_TEST_FILES
APP3-P03 = COMPLETE — REVIEW_ACCEPTED
APP3-P03 MAPPING_STRATEGY = ZOD_OFFICIAL_TO_JSON_SCHEMA_EXPORTER
APP3-P03 UNSUPPORTED_NODE_BEHAVIOR = GENERATION_FAILS_LOUDLY
APP3-P03 NEW_DEPENDENCY = NONE
APP3-P03 DISCLOSED_DEVIATION = PREDECESSOR_GATES_MADE_MODE_AWARE_ON_P03
TOOLING_SOFT_CAP_CHECKER_LINES = 450
TOOLING_SOFT_CAP_TEST_LINES = 700
APPLICATION_FILE_LIMITS = UNCHANGED_400_SOURCE_600_TEST
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = COMPLETE — CLOSED_BY_APP3-B02
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 STATE = SIDE_BACKGROUND_QUARTET_AND_DELIVERY_PATH_PUBLISHED
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03
FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = OPEN — NONBLOCKING_EXISTING_SURFACE_CLEANUP
APP3-B06 FIRST_ATTEMPT = BLOCKED — ENTRY_ARCHITECTURE_PRESUPPOSITION_ABSENT
APP3-B06 FIRST_ATTEMPT CAUSE = SESSION_UPLOAD_INTENT_ARCHITECTURE_DOES_NOT_EXIST
APP3-B06 FIRST_ATTEMPT RESOLUTION = APP3-G08
APP3-G08 = COMPLETE — REVIEW_ACCEPTED
IMP-D048 = LOCKED
APP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B
SESSION_UPLOAD_ARCHITECTURE = API_OWNED_MULTIPART_STREAMING
SESSION_UPLOAD_PRESIGN = NONE
SESSION_BOOTSTRAP_OWNER = APP3-B07
APP3-W01C = COMPLETE — REVIEW_ACCEPTED
APP3-W01C RETRY_SIGNAL = JOB_TRANSIENT_FAILURE
APP3-W01C TRANSIENT_ASSET_STATUSES = INSPECTING
APP3-W01C SCOPE = DESIGN_SESSION_ASSET_ONLY
APP3-B06A = COMPLETE — REVIEW_ACCEPTED
APP3-B06A SESSION_COOKIE_ISSUER = APP3-B07
APP3-B06A HTTP_OPERATIONS = 0
APP3-B07 = COMPLETE — REVIEW_ACCEPTED
APP3-B07 OPERATIONS = publicDesignSession_create publicDesignSession_resume
APP3-B07 SURFACE = PATHS_21_OPERATIONS_25_SCHEMAS_48
APP3-B07 SESSION_TTL_DAYS = 30
APP3-B06B = COMPLETE — REVIEW_ACCEPTED
APP3-B06B EXPECTED_SURFACE = PATHS_20_OPERATIONS_24
APP3-B06B OPERATION = publicDesignSessionAsset_create
APP3-B06B SURFACE = PATHS_22_OPERATIONS_26_SCHEMAS_49
APP3-B06B ASSET_LANE = CUSTOMER_UPLOAD_CUSTOMER_PRIVATE
APP3-B06B MAX_UPLOAD_BYTES = 10485760
APP3-B06B STREAMING = APP2_PIPELINE_LANE_PARAMETERIZED
APP3-B06B EXPIRED_ALLOCATION = REFUSED_NOT_RECLAIMED
APP3-B06B DISCLOSED_DEVIATION = PREDECESSOR_GATES_MADE_B06B_SURFACE_AWARE
APP3-B06B PLAN_CORRECTION = OPERATION_ID_AND_EXPECTED_SURFACE_WERE_PRE_B07_PLANNING_VALUES
APP3-B06B EXPECTED_SURFACE PROVENANCE = APP3-G08_ESTIMATE_MADE_BEFORE_APP3-B07_PUBLISHED_TWO_OPERATIONS
APP3-B06B DELIVERED_SURFACE_DELTA = PLUS_1_PATH_PLUS_1_OPERATION_PLUS_1_SCHEMA_ON_APP3-B07
APP3-B08 OPERATION = publicDesignSession_autosave
APP3-B08 ROUTE = PUT_/api/public/design-sessions/:sessionId/document
APP3-B08 SURFACE = PATHS_23_OPERATIONS_27_SCHEMAS_63
APP3-B08-C1 = COMPLETE — REVIEW_ACCEPTED_AFTER_MANUAL_INTERVENTION
APP3-B08-C1 CAUSE_2 = GENERATED_CLIENT_RESPONSE_REMAINS_VOID
APP3-B08-C1 REQUEST_SIDE = ACCEPTED_AND_PRESERVED
APP3-B08-C1 CAUSE = DOCUMENT_SNAPSHOT_PUBLISHED_AS_OPEN_OBJECT
APP3-B08-C1 DOCUMENT_SCHEMA = GENERATED_FROM_APP3-P01_TYPESCRIPT_TYPES
APP3-B08-C1 GENERATOR = ts-json-schema-generator_DEV_ONLY_DESIGN_DOCUMENT
APP3-B08-C1 SCHEMA_DELTA = PLUS_13_COMPONENTS_50_TO_63
APP3-B08-C1 ACCEPTANCE_AUTHORITY = APP3-P01_VALIDATORS_UNCHANGED
APP3-B08-C1 RUNTIME_BEHAVIOUR = UNCHANGED_PUBLICATION_ONLY
APP3-B08 CAS = SAVE_DOCUMENT_ACTIVE_UNEXPIRED_EXPECTED_REVISION_PLUS_ONE
APP3-B08 STALE_WRITE = 409_NO_MUTATION
APP3-B08 DOCUMENT_AUTHORITY = APP3-P01_PREPARE_PLUS_APP3-P02_PLACEMENT_AND_CONTAINMENT
APP3-B08 MEDIA_AUTHORITY = SESSION_SCOPED_ALLOWLIST_READY_NORMALIZED_FROM_PERSISTENCE
APP3-B08 IDEMPOTENCY = NONE_REFETCH_NEVER_BLIND_REPLAY
APP3-B08 EXPIRY = NEVER_EXTENDED_BY_AUTOSAVE
APP3-B08 EVENTS = NONE
APP3-B08 RACE_PROOF = 10_ITERATIONS_ONE_WINNER_ONE_CONFLICT_ONE_INCREMENT
AUTOSAVE_UI_OWNER = APP3-S10
AUTOSAVE_CADENCE_OWNER = APP3-S10
AUTOSAVE_CADENCE_VALUE = OPEN — UNTIL_APP3-S10
MOBILE_TOUCH_OWNER = APP3-S11
AUTOSAVE_CADENCE_OWNER PREVIOUS = APP3-S11 — CORRECTED_BY_APP3-ROADMAP-RECONCILIATION
APP3-P04 = COMPLETE — REVIEW_ACCEPTED
APP3-P04 TITLE = SHARED_DESIGN_SESSION_RESPONSE_OPENAPI_CONTRACT
APP3-P04 CAUSE = GENERATED_CLIENT_RESPONSE_REMAINS_VOID
APP3-P04 OPERATIONS_COVERED = publicDesignSession_create publicDesignSession_resume publicDesignSession_autosave
APP3-P04 SHARED_COMPONENT = DesignSessionSnapshotResponse
APP3-P04 DOCUMENT_SCHEMA = REUSES_APP3-B08-C1_GENERATED_DesignDocument
APP3-P04 SURFACE = PATHS_23_OPERATIONS_27_SCHEMAS_66
APP3-P04 SURFACE_DELTA = PLUS_3_SCHEMAS_NO_PATH_NO_OPERATION
APP3-P04 RUNTIME_BEHAVIOUR = UNCHANGED_PUBLICATION_ONLY
APP3-P04 SECOND_SCHEMA_AUTHORITY = NONE
APP3-B06B-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B06B-C1 CAUSE = LIVE_INTEGRATION_EVIDENCE_MISSING
APP3-B06B-C1 LIVE_SUITE = CMD-TEST-APP3-B06B-INTEGRATION
APP3-B06B-C1 LIVE_RESULT = 22_TESTS_PASS_ON_DISPOSABLE_POSTGRES_AND_MINIO
APP3-B06B-C1 LIVE_SLOTS_USED = 2_OF_5
APP3-B06B-C1 RUNTIME_FIX = STALE_SESSION_REVISION_NOW_409_WAS_500
APP3-B06B-C1 SURFACE = UNCHANGED_PATHS_22_OPERATIONS_26_SCHEMAS_49
INSPECTION_NORMALIZATION_ORDERING = NOT_PROVABLE_ROUTED_TO_APP3-W01C
APP3-G08 DISCLOSED_DEVIATION = STALE_DUPLICATE_B07_B08_STATUS_LINES_REMOVED
FU-APP3-G02-DEPENDENCY-TABLE-BOUND-01 = COMPLETE — CLOSED_BY_APP3-G04
FU-APP3-G03-QUALITY-AGGREGATE-01 = DEFERRED — REGRESSION_ACTIVITY_ONLY
FU-APP3-G03-DEPENDENCY-TABLE-BOUND-01 = COMPLETE — CLOSED_BY_APP3-DB01
O-008 = CLOSED_BY_IMP-D043
DP-RET-01 design_sessions = CLOSED_BY_IMP-D043
FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 = COMPLETE — CLOSED_BY_APP3-G02
APP3-ROADMAP-RECONCILIATION = COMPLETE — DOCS_ONLY
APP3_B03_CONTRACT_RECONCILIATION = COMPLETE — DOCS_ONLY
ASSET_DELIVERY_RULING = OPTION_2_DEDICATED_DELIVERY_CHECKPOINTS
DELIVERY_CLASS_1_SIDE_BACKGROUND_OWNER = APP3-B02
DELIVERY_CLASS_2_PUBLISHED_TEMPLATE_ASSET_OWNER = APP3-B05A
DELIVERY_CLASS_3_SESSION_UPLOAD_OWNER = APP3-B06C
APP3-B05A OPERATIONS = 1
APP3-B05A ROUTE = TO_BE_LOCKED_AT_APP3-B05A_ENTRY_AUDIT
APP3-B05A AUTHORIZATION = PUBLISHED_TEMPLATE_PLUS_VERSION
APP3-B05 OPERATIONS = 2 — UNCHANGED_JSON_READ_ONLY
APP3-B06C OPERATIONS = 1
APP3-B06C ROUTE = GET_/api/public/design-sessions/:sessionId/assets/:assetId/editor-preview
APP3-B06C AUTHORIZATION = SESSION_ID_PLUS_PER_SESSION_CREDENTIAL
APP3-B06C ORIGIN = REPLAN_CHILD_OF_APP3-B06 — NOT_A_B06B_CORRECTION
APP3-A01 ROUTE = /products/[productId]/placement — protected Admin route group
APP3-A01 OPERATIONS_CONSUMED = adminProductPlacement_get adminProductPlacement_replace
APP3-A01 API_CONTRACT_CHANGE = NONE — OpenAPI and generated client byte-identical
APP3-A01 SURFACE = UNCHANGED_PATHS_31_OPERATIONS_36
APP3-A01 CONCURRENCY = expectedUpdatedAt echoed from the last accepted server answer; PLACEMENT_VERSION_CONFLICT never blind-retried
APP3-A01 RETIREMENT = retired sides and areas stay visible and badged; no client-side delete
APP3-A01 RESPONSIVE = 1440 default · 1280 narrow desktop · mobile read-only notice replaces the editor
APP3-A01 DS_INPUT = NEW_SHARED_CODE_PRIMITIVE — apps/admin/src/shared/forms/admin-text-field.tsx, aligned to FIG-DS-INPUT
APP3-A01 DS_SCRIM = $color-overlay-scrim added to @embroidery/styles; zero rgba literals in the placement stylesheet
APP3-A01 BACKGROUND_BOUNDARY = adminAsset_list only; no storage key, URL or public side-background route
APP3-A01 TESTS = 86 — 5 component suites + 1 model suite + 1 boundary suite
APP3-A01 REGISTRY_ROWS_APPROVED = 21 — A01 4 · A02 5 · A03 5 · shared 2 · D01-C1 responsive 3 · DS 2
FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01 = OPEN — OWNER_NOT_YET_ASSIGNED
FU-ADMIN-SHARED-DIALOG-01 = OPEN — OWNER_NOT_YET_ASSIGNED
FU-ADMIN-SHELL-NARROW-DESKTOP-01 = OPEN — OWNER_APP1_ADMIN_SHELL
APP3-A01 PREVIEW_RENDERING = SVG — 05-FRONTEND-AND-SCSS-STANDARD §8 + IMP-D026; viewBox is the side pixel space
APP3-A01 SIDEBAR_NARROWING_DEVIATION = NOT_IMPLEMENTED — shell-owned, routed to FU-ADMIN-SHELL-NARROW-DESKTOP-01
APP3-A02 = COMPLETE — REVIEW_ACCEPTED
APP3-A02 ROUTE = /design-templates — protected Admin route group
APP3-A02 OPERATIONS_CONSUMED = adminDesignTemplate_list adminDesignTemplate_create
APP3-A02 OPERATIONS_WITHHELD = adminDesignTemplate_detail — not on the curated api-client boundary; a per-row detail read is the N+1 a keyset list exists to avoid
APP3-A02 API_CONTRACT_CHANGE = NONE — OpenAPI and generated client byte-identical
APP3-A02 SURFACE = UNCHANGED_PATHS_32_OPERATIONS_37_SCHEMAS_81
APP3-A02 PAGINATION = KEYSET_FORWARD_ONLY — cursor forwarded opaque, never parsed; filters live in the query key so a filter change resets the collection structurally
APP3-A02 LIFECYCLE_MUTATION = NONE — publish/unpublish/archive belong to APP3-A04 and are absent from the client boundary, asserted as an absence
APP3-A02 NAVIGATION = ONE_PRIMARY_ENTRY — 4th item, label bound to DESIGN_TEMPLATE_COPY.page.title, href bound to ADMIN_DESIGN_TEMPLATES_ROUTE
APP3-A02 TESTS = 60 — 2 component suites + 1 navigation suite + 1 boundary suite
APP3-A02 REGISTRY_ROWS_USED = 5 — FIG-ADMIN-TEMPLATELIST-DESKTOP-{DEFAULT,LOADING,EMPTY,ERROR} · FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT
APP3-A02 DESIGN_DEVIATION_1 = SEARCH_FIELD_NOT_IMPLEMENTED — APP3-B03 publishes no text-search parameter; the toolbar states the constraint instead of rendering a dead control
APP3-A02 DESIGN_DEVIATION_2 = SORT_CONTROL_NOT_IMPLEMENTED — the contract is created-at descending only
APP3-A02 DESIGN_DEVIATION_3 = PAGE_NUMBERS_AND_TOTAL_NOT_IMPLEMENTED — a keyset page carries no total, so a page count cannot be computed without inventing one
APP3-A02 DESIGN_DEVIATION_4 = VERSION_CELL_REPHRASED — the list projection calls toSummaryView(template, undefined), so no page carries currentVersion; the cell says where the number lives rather than reporting an absence that would mislabel every published template
APP3-A02 DESIGN_DEVIATION_5 = ROW_EDIT_AFFORDANCE_INERT — APP3-A03 owns the editor; the control names what is missing rather than linking into a 404
APP3-A02 DESIGN_DEVIATION_6 = ROW_LIFECYCLE_ACTIONS_ABSENT — APP3-A04 owns them; its registry rows are still REVIEW_REQUIRED
APP3-A02 EDIT_AFFORDANCE = ACTIVATED_BY_APP3-A03 — the inert control became a real link once the editor route existed; dependency activation, not an A02 correction
APP3-A03 = COMPLETE — REVIEW_ACCEPTED
A03_REVIEW_BLOCKER = CLOSED_BY_APP3-A03-C1 — an unscoped zero-version DRAFT now assigns its exact Product · Side · Embroidery Area in the editor and continues into authoring without navigation
APP3-A03-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-A03-C1 SCOPE = ONE_TIME_INITIAL_ASSIGNMENT_UI — consumes adminDesignTemplate_assignScope; no rescope, no clear-scope, no new backend operation
APP3-A03-C1 API_CONTRACT_CHANGE = NONE — 33 paths / 38 operations / 82 schemas unchanged; only the handwritten curated export moved
APP3-A03-C1 CURATED_CLIENT = adminDesignTemplateAssignScope + AssignDesignTemplateScopeBody exposed; this feature is the operation's only consumer
APP3-A03-C1 PRODUCT_SOURCE = adminProduct_list — the accepted Admin operation APP3-A02 already uses; no invented search, no public list, no per-id fan-out
APP3-A03-C1 VISIBILITY = scope absent + status DRAFT + currentVersion absent; a scoped, versioned, PUBLISHED or ARCHIVED Template shows no selector, and neither does 390
APP3-A03-C1 CASCADE = Product change clears Side and Area; Side change clears Area — structural in the selection reducer, so a triple whose parts come from two parents is unrepresentable
APP3-A03-C1 ELIGIBILITY = retired Sides and Areas are not offered; Areas are read from the chosen Side's own list, never a flattened one; Product publication is not required
APP3-A03-C1 TRANSITION = the assignment response is written into the detail cache, so the editor derives itself in place — no navigation, no redundant detail GET, expectedCurrentVersion stays 0 and the first save creates v1
APP3-A03-C1 RACE = one 409 is answered by one re-read; if a scope now exists the winner's is accepted and authoring continues, otherwise the bounded not-assignable state is shown. No retry, no forced triple
APP3-A03-C1 TESTS = 48 — 31 selector cases + 13 scope-model cases + 4 client-boundary cases, on top of the preserved A03 suites
APP3-A03 ROUTE = /design-templates/[templateId] — protected Admin route group, addressed by Template UUID (the slug is the published address a draft need not have)
APP3-A03 OPERATIONS_CONSUMED = adminDesignTemplate_detail adminDesignTemplate_saveDocument adminProductPlacement_get adminProductSideBackground_get
APP3-A03 OPERATIONS_WITHHELD = adminDesignTemplate_{publish,unpublish,archive} — off the curated api-client boundary; APP3-A04 owns lifecycle. adminDesignTemplate_restore does not exist in the contract at all (APP3-B04A)
APP3-A03 API_CONTRACT_CHANGE = NONE — OpenAPI and generated client byte-identical
APP3-A03 SURFACE = UNCHANGED_PATHS_32_OPERATIONS_37_SCHEMAS_81
APP3-A03 CURATED_CLIENT_EVOLUTION = detail + saveDocument crossed together; the read is the only source of the version token the save must echo
APP3-A03 DOCUMENT_AUTHORITY = APP3-P01 — no second schema, validator or schema-version constant; the empty document is composed from P01 constants and validated by P01 itself
APP3-A03 GEOMETRY_AUTHORITY = APP3-P02 — resolveEffectiveTransform / getElementBounds / containsBounds; no local matrix, rotation or px↔mm conversion
APP3-A03 ENGINEERING_JUDGMENT = A03_EMPTY_DOCUMENT_CONSTRUCTOR — P01 exports no empty-document factory (its builders are test-only and unexported), so the minimal valid document is composed from exported constants and handed to validateDesignDocumentStructure
APP3-A03 ZERO_VERSION = expectedCurrentVersion 0; the server derives the first version and no v1 is fabricated
APP3-A03 SAVE_BODY = {expectedCurrentVersion, document} exactly — no lifecycle, scope, slug, schema-version or storage member
APP3-A03 SAVE_SUCCESS = response is authoritative detail truth; baseline, version and local document all replaced from it; no redundant detail GET
APP3-A03 CONFLICT = only DESIGN_TEMPLATE_VERSION_CONFLICT opens the flow; two choices, server-not-overwritten stated, no merge, no force-save, no automatic retry; keep-local closes the dialog without clearing the conflict
APP3-A03 CONFLICT_DISCRIMINATOR_NOTE = B03A publishes one 409 for "stale version" OR "not a DRAFT" and does not publish the discriminating code in OpenAPI; the code is transcribed in the feature — see FU-APP3-CONFLICT-CODE-CONTRACT-01
APP3-A03 NON_DRAFT = PUBLISHED and ARCHIVED render read-only; no save, no editable control, no lifecycle control
APP3-A03 SCOPE = CONTEXT_ONLY — no scope mutation exists in the contract after creation; Side and Area resolved by id, never substituted
APP3-A03 UNSCOPED_TEMPLATE = NOT_AUTHORABLE — APP3-P01 requires a placement snapshot in every Design Document, so a Template with no scope has no representable document; stated as a bounded reason rather than fabricated ids
APP3-A03 BACKGROUND_CONSUMERS = 2 — APP3-A01 (placement authoring) and APP3-A03 (editor stage); no public route, no storage address, object URL revoked on replacement, scope change and unmount
APP3-A03 TEMPLATE_IMAGE_INTAKE = NOT_IMPLEMENTED — visible, disabled, reason names the missing TEMPLATE_SOURCE flow; existing image references preserved and drawn as an honest placeholder because no Admin draft-asset delivery route exists
APP3-A03 RESPONSIVE = 1440 three regions · 1280 layers 240 / inspector 260 / elastic stage, no horizontal overflow · 390 read-only notice replaces the editor with zero background requests
APP3-A03 TESTS = 113 — 3 component suites + 1 model suite + 1 boundary suite
APP3-A03 REGISTRY_ROWS_USED = 6 — FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-{DEFAULT,TEXTSELECTED,SAVING,CONFLICT} · FIG-ADMIN-TEMPLATEEDITOR-MOBILE-READONLY · FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280
APP3-A03 GATE_EVOLUTION = check-app3-a02.mjs route count, detail-withheld and editor-inert rules made A03-world-aware; the A02 no-N+1 property moved from "the operation is unreachable" to "the list never calls it"
FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED
FU-APP3-TEMPLATE-SCOPE-EDIT-01 = CLOSED_FOR_CURRENT_APP3_SCOPE — initial assignment is delivered and consumed by A03; general rescope after assignment or versioning is intentionally unsupported and is not a current APP3 requirement
APP3-B03B = COMPLETE — REVIEW_ACCEPTED
APP3-B03B SCOPE_RULING = ONE_TIME_INITIAL_SCOPE_ASSIGNMENT_BEFORE_FIRST_VERSION
APP3-B03B OPERATION = PUT /api/admin/design-templates/{templateId}/scope — adminDesignTemplate_assignScope
APP3-B03B SURFACE = PATHS_33_OPERATIONS_38_SCHEMAS_82 — +1 path, +1 operation, +1 body schema
APP3-B03B SOURCE_STATE = DRAFT + current_version 0 + all three scope columns NULL + zero version rows — every condition inside one compare-and-set predicate, never a read-then-write
APP3-B03B RESCOPE = NOT_PROVIDED — no clear, rescope or PATCH alias exists on the route, the port or the adapter; a saved version carries an immutable placement snapshot that a rescope would invalidate
APP3-B03B REQUEST_TOKEN = NONE — the legal source state is a single point, so a caller-supplied expectedCurrentVersion could only ever hold 0; the CAS pins all four conditions regardless
APP3-B03B SCOPE_AUTHORITY = APP3-B03 DesignTemplateScopeAuthority reused unchanged; no Product-publication predicate (GRD-T01 is APP3-B04)
APP3-B03B CREATES = NOTHING — zero versions, documents, Asset associations, normalization events; lifecycle state unchanged
APP3-B03B AUDIT = design_template.scope_assigned — one row, in the same transaction, summary carries from UNSCOPED and the exact triple
APP3-B03B ERRORS = 404 unknown · 409 DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE · 400 DESIGN_TEMPLATE_SCOPE_INVALID/INCOMPLETE
APP3-B03B MIGRATION = NONE — existing nullable scope columns
APP3-B03B TESTS = 50 — 34 focused + 16 PostgreSQL integration through the real HTTP stack, including the race
APP3-B03B CURATED_CLIENT = UNCHANGED — the operation is generated but deliberately not exported; APP3-A03-C1 brings it across after B03B acceptance
FU-APP3-DESIGN-FIXTURE-CODE-01 = RESOLVED_BY_APP3-B03B — the shared design integration fixture had inserted product_sides/embroidery_areas without the code column that migration 0034 made NOT NULL on 2026-08-04, so every suite seeding through it failed in beforeEach; repaired here because B03B's integration requirement cannot be met without it
FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01 = COMPLETE — CLOSED_BY_APP3-B04A — admin-design-template.controller.ts and drizzle-design-template.repository.ts stood at 523 and 563 lines, over the CLAUDE.md §6 hard maximum of 400, and B04A would have grown the same lifecycle surface again. Split by responsibility, not by line ranges: the controller into an authoring surface (B03/B03A/B03B) and a lifecycle surface (B04/B04A) sharing one route family and one error-translation seam; the adapter into authoring writes, lifecycle writes and the reads the port composes. One port, one implementation class, no second repository authority and no API behaviour change outside B04A
FU-APP3-DESIGN-SESSION-PEPPER-TEST-01 = OPEN — OWNER_NOT_YET_ASSIGNED — the three integration suites importing DesignModule fail at module init because DESIGN_SESSION_SECRET_PEPPER is unset in the persistence test harness; a different module and a real decision about how Session auth config reaches a shared harness, so recorded rather than silently patched
FU-APP3-CONFLICT-CODE-CONTRACT-01 = OPEN — OWNER_NOT_YET_ASSIGNED — the 409 discriminator is not published in OpenAPI, so the client transcribes DESIGN_TEMPLATE_VERSION_CONFLICT
FU-APP3-A02-D01-CONTRACT-DRIFT-01 = OPEN — NONBLOCKING_DESIGN_EVIDENCE_RECONCILIATION
FU-ADMIN-SHARED-DIALOG-01 = OPEN — OWNER_NOT_YET_ASSIGNED — third hand-rolled Admin dialog
FU-DESIGN-PUBLISH-DS-INPUT-01 = OPEN — OWNER_DESIGN_SYSTEM
APP3-A04 = COMPLETE — REVIEW_ACCEPTED
APP3-A04 ROUTE = /design-templates/[templateId]/publication — protected Admin route group, addressed by Template UUID; a sibling of the A03 editor, never a mode of it
APP3-A04 OPERATIONS_CONSUMED = adminDesignTemplate_detail adminDesignTemplate_publish adminDesignTemplate_unpublish adminDesignTemplate_archive adminDesignTemplate_restore adminProductPlacement_get
APP3-A04 API_CONTRACT_CHANGE = NONE — OpenAPI and generated client byte-identical; 34 paths / 39 operations / 83 schemas unchanged, only the handwritten curated export moved
APP3-A04 CURATED_CLIENT = the four LC-24 operations crossed together — a surface that could publish but not unpublish, or archive but not restore, would strand an operator in a state with no way back
APP3-A04 DESIGN_ROWS_APPROVED = 5 — FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-{READY,GUARDFAIL,PUBLISHCONFIRM,ARCHIVE,RESTOREBLOCKED} under APP3-A04 §0 operator review; no Studio row approved
APP3-A04 ACTION_MATRIX = DRAFT publish+archive · PUBLISHED unpublish+archive · ARCHIVED restore — no ARCHIVED→PUBLISHED, no restore-and-publish chain, no hard delete, absent by construction rather than refused by a guard
APP3-A04 CONCURRENCY_TOKEN = expectedCurrentVersion from the authoritative detail snapshot only; never the list, the URL, a local increment or an assumed v1; retry=false on every command
APP3-A04 READINESS = ADVISORY_PANEL_OVER_AUTHORITATIVE_SERVER — all seven GRD-T01 rows always rendered; six provable from the Template detail and the Product placement using APP3-P01/P02 themselves; media provable only when the document references zero Assets, otherwise CHECKED_ON_PUBLISH
APP3-A04 READINESS_ENDPOINT = NONE_INVENTED — exactly two queryFns exist in the feature, the detail and the placement
APP3-A04 PUBLISH_BLOCKING = LOCALLY_AUTHORITATIVE_ONLY — zero versions or absent scope; an unprovable row never blocks and never renders as a pass, because a client that blocked on a guess would be a second GRD-T01
APP3-A04 WIRE_FINDING_422 = NO_DISCRIMINATOR_PUBLISHED — the controller throws UnprocessableEntityException(string), and api-error-mapper promotes a feature code only from a record payload, so the envelope carries code UNPROCESSABLE_ENTITY and the internal PublicationRefusal vocabulary is discarded at the HTTP boundary. The refusal therefore names no condition and fabricates no failed guard
APP3-A04 WIRE_FINDING_409 = NO_DISCRIMINATOR_PUBLISHED — same mechanism; every lifecycle conflict arrives as code CONFLICT, classified from the HTTP status alone
APP3-A04 CONFLICT = no retry · exactly one authoritative detail re-read · actions recomputed from the returned status · a stale archive or restore voids its typed reason and requires a fresh confirmation
APP3-A04 REFUSAL_CACHE = NOT_INVALIDATED — APP3-B04 guarantees the publish guard writes nothing, so a 422 leaves the detail entry alone rather than implying something moved
APP3-A04 TESTS = 44 — 16 command/matrix cases + 15 readiness/422/409 cases + 13 boundary cases, on top of the preserved A01/A02/A03 suites
APP3-A04 JSDOM_FIX = TextEncoder/TextDecoder polyfilled in jest.setup.ts — jsdom omits both, so prepareDesignDocument returned CANONICALIZATION_FAILED under test while succeeding in every supported browser
A04_DESIGN_BLOCKERS = RESOLVED_BY_OPERATOR_JUDGMENT — three questions raised at delivery, all resolved by operator ruling; none required a Figma change, a backend operation or a D01 correction
A04_MOBILE_LAYOUT = ENGINEERING_JUDGMENT_FROM_DESKTOP_AUTHORITY
FIGMA_MOBILE_FRAME = NOT_AVAILABLE
PRODUCT_SEMANTICS_CHANGED = NO
A04_PRODUCT_NAME = OMIT_WHEN_NOT_AVAILABLE_FROM_ACCEPTED_READ_MODEL
A04_HISTORICAL_LIFECYCLE_REASON = NOT_DISPLAYED_WITHOUT_ACCEPTED_AUDIT_READ_CONTRACT
HISTORICAL_REASON_STORAGE = AUDIT_OWNED
HISTORICAL_REASON_ADMIN_READ = NOT_AVAILABLE_IN_CURRENT_ACCEPTED_CONTRACT
FIGMA_ANNOTATION = DESIGN_TIME_DEPENDENCY_PROVENANCE
RUNTIME_DEPENDENCY = SATISFIED_BY_APP3-B04A
RESTORE_RUNTIME_STATE = ACTIVE_WHEN_LC24_ALLOWS
APP3-A04 DESIGN_DEVIATION_1 = NO_A04_MOBILE_FRAME — all five approved rows are Desktop 1440, so the 390 layout is engineering judgment from the desktop authority: one column, all seven readiness rows kept, every LC-24-legal action operable at 48px touch height, dialogs and reason inputs fully usable, no horizontal overflow, nothing hidden because the viewport is narrow. A04 is lifecycle management, not canvas authoring, so A03's mobile read-only rule is deliberately not inherited
APP3-A04 DESIGN_DEVIATION_2 = PRODUCT_NAME_NOT_SHOWN — the frames label the scope "Product · Side · Area"; no accepted read this screen performs carries the Product's display name, so the label is Side · Area. No extra API, no public Product read, no per-id lookup and no UUID rendered as a name; the screen stays correct when opened directly at its URL
APP3-A04 DESIGN_DEVIATION_3 = ARCHIVE_REASON_NOT_SHOWN — the archived frame renders the stored reason; it lives only in audit_events and no accepted Admin Audit read exists, so the panel states where it lives instead of inventing a source. No reason is inferred, reconstructed, or held in browser state and presented later as durable history
APP3-A04 BROWSER_PROOF = ORDINARY_JOURNEY_THROUGH_THE_REAL_UI — DRAFT v2 → publish → PUBLISHED → unpublish → DRAFT → archive with reason → ARCHIVED → restore with reason → DRAFT, on the live gateway
APP3-A04 BROWSER_PROOF_422 = REAL_GRD-T01_REFUSAL — an out-of-bounds document produced through A03; the client proved WITHIN_AREA failing, publish stayed enabled, and the server refused. Wire: 422, code UNPROCESSABLE_ENTITY, no errors array, no discriminator; status stayed DRAFT and no detail re-read followed
APP3-A04 BROWSER_PROOF_409 = REAL_STALE_STATE — a second operator unpublished out of band, then the stale screen sent unpublish. Wire: 409 CONFLICT. Network shows exactly one command attempt and exactly one authoritative detail re-read; actions recomputed from the returned DRAFT
APP3-A04 BROWSER_PROOF_VIEWPORTS = 1440 two columns · 1280 two columns with no horizontal overflow · 390 one column, all seven rows, both legal actions at 48px, alertdialog 327px wide with the canonical scrim rgba(23,23,23,0.45)
APP3-A04 BROWSER_PROOF_CONSOLE = 0_ERRORS_0_WARNINGS on a clean load and across two successful commands
APP3-A04 BROWSER_DEFECT_FOUND = CONFIRMATION_DIALOG_STAYED_OPEN_AFTER_SUCCESS — the success callback reported `ok` and the screen read the same boolean as `keepOpen`, so a published Template kept its dialog and the next action was unclickable behind the backdrop. Every component assertion about the badge still passed. Fixed by naming the parameter for what the caller does with it, plus two regressions
APP3-A04 DEV_ENVIRONMENT_NOTE = both dev containers needed a restart to serve new routes — Admin for the new App Router segment, API for the B04A restore controller. A code-free staleness issue, not a defect
APP3-A04 DESIGN_DEVIATION_4 = RESTORE_AND_UNPUBLISH_DIALOGS_EXTENDED — the restore frame was drawn while BLOCKED_BY_APP3-B04A and no unpublish dialog was drawn; both follow the approved archive/publish dialog shapes with their own copy
APP3-A04 RESTORE_ACTIVATION = DESIGN_DEPENDENCY_SATISFIED — the disabled BLOCKED_BY_APP3-B04A annotation is provenance; B04A is accepted, so the runtime control is live
ADMIN_TEMPLATE_FRONTEND_BRANCH = A01 + A02 + A03 + A04 DELIVERED
NEXT_ELIGIBLE_IMPLEMENTATION_CHECKPOINTS = APP3-B06C
NEXT_RECOMMENDED_IMPLEMENTATION_CHECKPOINT = APP3-S02_AFTER_APP3-S01_ACCEPTANCE
NEXT_ELIGIBLE_FRONTEND_CHECKPOINTS = NONE_UNTIL_APP3-S01_REVIEW_ACCEPTANCE
NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-S02_AFTER_APP3-S01
STUDIO_FRONTEND_BRANCH = S01 DELIVERED
FRONTEND_GATE = OPEN — APP3-D01 APPROVED, APP3_FRONTEND_IMPLEMENTATION STARTED_BY_APP3_A01
APP3-D01 APPROVAL_RULE = SATISFIED — the 21 rows A01/A02/A03 need are APPROVED_FOR_IMPLEMENTATION, the 5 A04 needs were released by APP3-A04 §0, and the 5 S01 needs by APP3-S01 §3; every S02–S11 row stays REVIEW_REQUIRED until its own checkpoint opens
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
