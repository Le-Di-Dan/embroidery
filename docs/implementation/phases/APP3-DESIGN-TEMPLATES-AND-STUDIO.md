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

Migration verdict (corrected by `APP3-PRE-AUDIT-C1`):
**`NO_APP3_MIGRATION_UNLESS_G01_OR_G02_OR_G04_PROVES_ONE`**. Four candidate gaps
exist and every one is downstream of a ruling:

- **`G01`** — a side background delivered under a new `product_media.role`
  (closed CHECK set), a dedicated background derivative kind (closed CHECK set),
  a *granted* background (`secure_access_grants.scope_kind` is the single closed
  value `REQUEST_ACCESS` with `NOT NULL` customer and request FKs, so an
  anonymous session can hold no grant), or side/area immutability-after-use
  (no `locked_at` or version column exists);
- **`G02`** — a template↔product many-to-many compatibility relation;
- **`G04`** — a new `asset_derivatives.kind` for the editor-safe *customer*
  derivative.

If any fires it is one dedicated forward-only `APP3-DB01` before dependent code.

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
APP3 = AUDITED — NOT STARTED
APP3-PRE-IMPLEMENTATION-AUDIT = COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION
APP3-G01 = READY — NOT STARTED
every other APP3 checkpoint = NOT STARTED
```

Human review (2026-08-03) returned `ACCEPTED_WITH_REQUIRED_CORRECTIONS`. The
five required corrections were applied by `APP3-PRE-AUDIT-C1` and are visible in
§6.1 (migration verdict now includes `G01`; `APP3-DB01` terminal semantics and
the `DB-DISPOSITION-RESOLVED` predecessor; the `design-document` /
`design-engine` dependency split) and in audit §H/§O/§P/§Q/§R/§S. Every
substantive finding was upheld; the evidence/governance classification was
corrected because **Commit A was not docs-only** — see audit §R for the approved
`APPROVED_NARROW_GOVERNANCE_DEVIATION` disposition.

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
