# APP3-PRE-IMPLEMENTATION-AUDIT — Completion report

**Checkpoint:** `APP3-PRE-IMPLEMENTATION-AUDIT`
**Status:** `COMPLETE — DELIVERED_FOR_REVIEW` · **Date:** 2026-08-02
**Audit:** [`audits/APP3_PRE_IMPLEMENTATION_AUDIT.md`](../audits/APP3_PRE_IMPLEMENTATION_AUDIT.md)
**Phase plan:** [`phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md`](../phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md)

---

## A. Executive verdict

`PASS_WITH_REQUIRED_GATES`.

APP3 enters from a genuinely closed APP2 and from a **stronger persistence
position than APP2 had**: the Design Template and Design Session aggregates
already ship as repositories with their DB7 guards and a passing DB9
concurrency proof. The blockers are not schema blockers — they are four
authority gaps, two empty packages, and one structural hole nobody had named.

The hole: **nothing in the running system can create or read a `product_sides`
or an `embroidery_areas` row.** `design_sessions` requires `product_side_id` and
`embroidery_area_id` as `NOT NULL`; templates scope onto the same two ids; the
Studio stage renders a side background at `px_per_mm`; the safe area *is* an
`embroidery_areas` row. The tables exist and `DrizzleProductRepository` reads and
writes them — but no Admin operation authors them, no public operation returns
them, and `publicProductMedia_get` is keyed to `product_media` rows so it cannot
serve a side background at all. Every other APP3 capability sits downstream.

Recommended first gate: **`APP3-G01` — Product placement and side-media
authority**.

## B. APP2 entry, read from Git

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `8b5f3b0279b1920babd05b52014af3b853f526c0` |
| Entry HEAD subject | `docs(app2): record phase closure evidence` |
| Entry HEAD files | `docs/implementation/reports/APP2-X01-COMPLETION-REPORT.md` (1 file, +541) |
| APP2-X01 evidence Commit B | `8b5f3b0…` — equal to entry HEAD, as required |
| APP2 closure Commit A | `bcb810f829175c22e47467474b37e9d4d5c6f628` (8 files) |
| Tracked/staged tree at entry | clean |
| `evidences/` | ignored, one file, untouched |
| Pushed | nothing; `origin/production` was already at the entry HEAD and no push was made |
| APP3 artifacts at entry | none |

Accepted entry statuses held: `APP2-X01 = COMPLETE — REVIEW_ACCEPTED`,
`APP2 = COMPLETE — PASS_WITH_FOLLOW_UPS — REVIEW_ACCEPTED`,
`APP3 = READY — NOT STARTED`.

Frozen baseline re-measured rather than copied: OpenAPI **16 paths / 19
operations / 34 schemas**, generated-client tree hash
`7524fc91…8ecf5a2`, database **78 tables / 833 columns / 33 migrations**, Figma
**86 IDs / 86 node rows / 11 tables**, routes `/kham-pha` and `/san-pham/[slug]`.

## C. APP0 architecture handoff

IMP-D026 / `ADR-APP0-001` is preserved and **not reopened**: native SVG rendered
by React 19, no rendering-engine dependency, engine-neutral document as the
single source of truth, mandatory renderer-adapter boundary, runtime-only
selection/handles/viewport/watermark, no mutable runtime object in Zustand,
geometry outside components, undo/redo as a domain concern, DOM handles ≥44 px,
client-only lazy Studio behind a server-rendered shell, asset id + approved
derivative only, sanitized SVG, no export surface, no browser `crypto.subtle`.

The ADR's §6 budgets stand as inherited authority until APP12. Its three named
risks each get an owner in the map: DOM-node growth (`APP3-S02` regression
scene), the measured **WebKit continuous-scale cost — 41 ms p95 versus 16.7 ms
Chromium** (`APP3-S07` must step zoom discretely or transform a wrapper, then
re-measure), and adapter-boundary erosion (`APP3-S02`'s reviewed contract). Its
deferred details — SVG sanitizer, font whitelist mechanics, snapping/guides,
marquee multi-select, crop UX, freehand smoothing, autosave cadence and conflict
policy, geometry ownership — are each routed to a named gate or checkpoint.

## D. Scope and exclusions

Outcome unchanged: Admin publishes compatible Design Templates; an anonymous
customer creates a watermark-protected 2D customization from published
Product/Template authority.

Added to scope by evidence: **product side and embroidery-area authority**, the
placement substrate everything else needs.

Prohibited and unchanged: customer export/download of any kind, 3D, stitch
simulation, digitizing, professional vector-node editing, Canva-clone breadth.
Not pulled forward: APP4 identity, APP5 custom requests, APP6 review and
quotation, payments, orders, production.

## E. Repository inventory (summary)

`IMPLEMENTED (persistence only)` — Template repository, Template version
immutability, Session repository, placement-chain validation, autosave
optimistic concurrency (**proven**: CC-01 `PASS`, DB9-CP0, `STALE_WRITE` plus a
10-iteration single-increment race).
`PARTIAL` — template publication surface; anonymous session identity; worker
job families.
`SCAFFOLD` — `packages/design-document`, `packages/design-engine` (both
`export {}`).
`RESEARCH_ONLY` — the APP0-R01 spike adapters, fenced by
`check:spike-boundaries` and never counted as production.
`MISSING` — placement API surface, `DesignModule` composition, document
validation, editor-safe derivative, customer/template asset intake lanes, Admin
Template UI, Storefront Studio UI, every APP3 OpenAPI operation, every APP3
Figma row.

## F. Database readiness and migration classification

Verdict: **`NO_APP3_MIGRATION_UNLESS_G02_OR_G04_PROVES_ONE`** — deliberately
conditional rather than the flat `NO_APP3_MIGRATION` the prompt allows by
default, because two concrete candidate gaps exist and both are downstream of a
ruling this audit is not permitted to make:

1. a template↔product **many-to-many** compatibility relation, if `APP3-G02`
   rules that "compatibility" means more than the optional single scope DB2
   GAP-08 decided and the schema implements;
2. a new `asset_derivatives.kind` for the editor-safe derivative, if `APP3-G04`
   rules that `NORMALIZED` cannot carry that meaning.

If either fires it is one dedicated forward-only `APP3-DB01` before dependent
code — the data-only kind-set + CHECK shape `APP2-DB01` already proved. This
audit created and modified no migration. Engine-native JSON is never persisted.

Everything else classifies as *schema sufficient* with an application-layer gap:
template publication (application guard missing), safe-area dimensions (query
and API missing), session lifecycle (repository present), canonical document
(package missing), autosave concurrency (**proof present**), asset associations
(intake lanes missing), anonymous ownership (duration and transport missing).
Snapshot/version boundaries are `OUT_OF_SCOPE` — `design_versions` and
`approval_snapshots` belong to APP5/APP6.

## G. Anonymous ownership

Settled by existing authority: identity is `session_secret_hash`
(`NOT NULL UNIQUE`, hash only, raw secret never an authorization input on its
own); a session is **not** a customer and carries no customer FK; the family is
hard-deleted after TTL; **email and phone are prohibited on a design session**
(ADR-DB2-001 — no identity residue); ownership transfer is APP5's submission
transaction (`TR-LC07-03`) and must not be implemented here.

Missing and routed to `APP3-G03`: the transport contract (cookie versus opaque
handle), issuance and rotation, enumeration controls, and the `09 §7` quotas.
APP1's staff cookie — host-only, `Strict`, CSRF-layered, authenticated — is not
transferable to an anonymous storefront session and was not assumed to be.

The session TTL is **open business authority**: `O-008` in the decision log,
`DP-RET-01` in the durability register records "*none set* — DEFERRED —
business". No value was invented.

## H. Lifecycles

**Design Session (LC-07)** — canonical states `ACTIVE | SUBMITTED | EXPIRED |
DELETED` with `TR-LC07-01..05` already specified. APP3 owns `-01` (bootstrap),
`-02` (autosave) and `-04` (expiry sweep) only.

**Reported contradiction, not silently resolved.** `06 §2` lists `ABANDONED`
and the pre-audit phase file said "create/load/update/**abandon**/expiry". DB3
explicitly eliminated `ABANDONED` (merged into `EXPIRED`) and
`ck_design_sessions__status_allowed` rejects it. `06 §2` self-describes its list
as *suggested conceptual states*; DB3 and the schema are the later binding
authority, so the phase file now carries the canonical four with the reason
recorded in place.

**Design Template** — DB3 records `DRAFT → PUBLISHED → ARCHIVED` with
"unarchive allowed audited", but assigns **no `TR-` identifiers and no guard
rows**, unlike LC-04 which `check:lifecycle` now enforces. The delivered
repository fuses publication into version creation (`publishVersion` sets
`status='PUBLISHED'` unconditionally, so no draft version can exist even though
`published_at` is nullable), has **no unpublish** — precisely the gap
`TR-LC04-05`/IMP-D035 had to close for Products after `APP2-B03` blocked — has
no unarchive, and archives from any source state without a guard. A Template
backend checkpoint must not start before `APP3-G02` rules this.

## I. Package readiness

`packages/design-document` and `packages/design-engine` are both `export {}`.
Both `design_template_versions.design_document` and
`design_sessions.design_document` are bare `jsonb` with an integer
`document_schema_version` and **no validator on any path**. ADR-DB1-012 already
assigns canonical form, RFC 8785 JCS, SHA-256 and document migrations to
`design-document`; ADR-APP0-001 adds fail-loud unknown `schemaVersion` and
pre-hash quantization. Neither table carries a hash column **by design** —
hashing begins at the formal design version — and APP3 must not invent one.

Server-side document validation is therefore a backend dependency as much as a
Studio one: `APP3-P01` and `APP3-P02` precede the first Template or Session
write API.

## J. Editor-safe media

ADR-APP0-001 §5 requires an **approved derivative**, never an original. Measured
against `ASSET_DERIVATIVE_KINDS`: `PREVIEW_WATERMARKED` bakes the watermark into
the bytes by CHECK, contradicting the ADR's runtime-regenerated watermark model;
`CATALOG_PREVIEW` is CHECK-forbidden from being watermarked and is defined as
store marketing media — **it is not an editor preview and must not be treated as
one**; `NORMALIZED` is the artwork-pipeline kind and the one genuine candidate,
but reuse needs a ruling.

Also measured: intake is Admin-authenticated and hard-locked to
`CATALOG_MEDIA`/`PRODUCTION_SENSITIVE`, raster-only, with **SVG rejected**
(IMP-D028) — and `ADR-APP2-001` itself states that accepting sanitized SVG is
"a future, separately-decided scope", so this is an open decision APP3 owns, not
a contradiction with a locked one. The `CUSTOMER_UPLOAD`/`CUSTOMER_PRIVATE` and
`TEMPLATE_SOURCE` lanes have no route; the worker has one catalog-lane family;
a session-scoped asset needs its own granted delivery contract because
`publicProductMedia_get` is publication-gated on a *product*. Background removal
is **not** added — no locked authority requires it.

## K. Decomposition

**Backend** — eight checkpoints, each **1–3 operations**, well inside the
five-endpoint limit: placement authoring/read (3), side-background delivery (1),
template draft (3), template lifecycle (3), public template read (2), session
asset intake (2), session bootstrap/resume (2), autosave (1). No row implements
`TR-LC07-03`, review, quotation or submission.

**Admin** — four bounded screens (placement authoring, template list, template
editor, template publication). Deliberately not one "Template Management"
checkpoint: APP2 proved a list, a form and a publication interaction are three
different review surfaces with three different failure modes.

**Studio** — thirteen bounded capabilities (bootstrap shell, stage/adapter/
selection, transforms, layer list, text, assets, zoom/pan/safe area, undo/redo,
watermark, autosave UI, mobile, plus two `LATER_APP3` rows). No full-Studio
mega-checkpoint. Accessibility is an acceptance criterion inside the stage,
transform and layer rows rather than a separate checkpoint, because
ADR-APP0-001 makes it structural.

## L. Figma classification

Measured live: 86 registry IDs / 86 node rows / 11 tables, gate clean. Searching
the registry for Studio, Template or editor authority returns **nothing**.

- Admin Template list/editor/publication, Studio bootstrap/stage/layer list/
  property panels, loading/error/empty/conflict/autosave states, mobile touch
  controls, watermark and safe-area treatment — all **`MISSING`**.
- Admin and Storefront shells, and the DS component sets — **`REUSE`**.
- `FIG-DS-INPUT` and `FIG-DS-SCRIM-TOKEN` — **`MISSING`** library gaps
  (`GAP-D01`/`GAP-D02`) that the Studio's property panels and dialogs will hit.
- UI04 (Commission) and UI05 (Collections) exist as pages in the product file
  but carry **no registry row** — **`NONE` as authority**. They may become
  reusable only after being registered and reconciled with Product Owner
  approval, never promoted directly.

Consequence: one coherent phase-level design package (`APP3-D01`) into a new
`APP_03` page precedes every APP3 frontend checkpoint. **No Figma node was
created, modified or read-promoted by this audit.**

## M. Security, performance, testing

Security position is preserved intact: no export surface, no private original in
the browser, asset id + approved derivative only, mandatory SVG sanitization
when SVG is accepted, watermark regenerated on load with an opaque token
carrying no raw PII and never serialized, safe redacted errors. Values that do
**not** exist — document complexity and layer/image limits, font whitelist
mechanics, anonymous rate limits, session and concurrent-session quotas,
autosave replay policy — were **not invented**; each is routed to `APP3-G03` or
`APP3-G04` as a decision.

Performance authority is `ADR-APP0-001` §6 with the APP0-R01 S/M/L scenes.
`spike:editor:check` stays inside `pnpm quality`; `spike:editor:test` runs at any
checkpoint touching `design-document`, `design-engine` or an adapter;
**`spike:editor:benchmark` stays outside fast quality** and is rerun at exactly
`S02`, `S03`, `S07`, `S11` and `E01`.

Testing reuses what exists — the disposable-PG integration harness,
`createConcurrencyTestContext`, the `next/jest` component harness, and
`@embroidery/e2e-testing` with APP2's canonical **migrated** disposable
production topology. No second database architecture and no second E2E
architecture.

## N. Follow-up routing

`ACTIVATE_IN_APP3` (3): `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` → `APP3-G04` (the
Studio cannot place an element without intrinsic dimensions);
`FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01` → `APP3-G02` (the identical
storable-but-unauthorized hole exists on templates, and ruling both in one
lifecycle gate is safer than ruling them apart); `APP1-FU02` → `APP3-E01`
(WebKit is non-optional here given the ADR's zoom risk).

`KEEP_ROUTED_LATER` (8): publication Outbox `PENDING`, storefront content band,
shell brand touch target, streamed not-found status, Admin media placeholder,
thumbnail, product archive UI, category management, variants/SKU. None blocks
APP3 — note `design_sessions.product_variant_id` is nullable.

`OBSOLETE` / `ALREADY_CLOSED`: none. No follow-up was implemented.

## O. Corrected checkpoint map

37 rows: 1 audit, 4 authority gates, 2 package foundations, 1 **conditional**
database checkpoint, 1 design package, 8 backend, 4 Admin, 13 Studio, 1 E2E,
1 closure. Validated: acyclic (every predecessor precedes its dependent), every
backend row ≤3 operations, every frontend row one screen or bounded capability,
`APP3-D01` before every frontend row, `APP3-DB01` before `B01`/`B03`/`W01`, and
no APP4 identity or APP5/APP6 submission, review or quotation anywhere.

## P. First checkpoint recommendation

**`APP3-G01` — Product placement and side-media authority.** `READY — NOT
STARTED`.

First because it is the only gap that makes every other APP3 capability
physically impossible, and because it was invisible in the pre-audit plan.
Second because the Studio's storefront route is undecided, and APP2 lost a whole
checkpoint to exactly that omission (`APP2-S01` blocked, cured by
`APP2-S01-G01`) — ruling it here costs nothing.

It resolves: who authors sides and areas (and therefore whether `APP3-A01`
exists); the public placement read contract; how a side background is delivered
given that `publicProductMedia_get` cannot serve one; whether the customer picks
a side/area; the canonical Studio route (extending
`check:storefront-route-authority`, not competing with it); and whether a
published product must carry at least one side and area.

It leaves blocked: `APP3-G02`, `APP3-G03`, `APP3-G04` and everything downstream.
It unblocks `APP3-P02`, `APP3-B01` and the placement half of `APP3-D01` — and
should not claim more.

Allowed files: `docs/implementation/**`, an ADR if the ruling warrants one,
`tools/check-*.mjs` plus its `node --test` companion, and `package.json` only to
register that gate. No application source, schema, migration, OpenAPI,
generated client, Figma node or dependency.

Required evidence: the ruling in the decision register under a new `IMP-D0xx`;
the phase file updated in the same checkpoint; a gate that **recomputes** the
ruled facts rather than trusting prose, with its own tests; a completion report
naming exact commits.

Six Product Owner questions are stated verbatim in the audit §P.

**The execution prompt for `APP3-G01` was not written.**

## Q. Validation

`APP3_PRE_AUDIT_PREFLIGHT = PASS`. Preflight and pre-commit runs:

| Gate | Result |
|---|---|
| `pnpm check:app2-closure` | `exit 0` — 45 checkpoint rows, 11 routed follow-ups, 0 blocking; OpenAPI 16/19/34; 33 migrations; Figma 86/86/11; `SAFE_STREAMED_NOT_FOUND` current; APP3 NOT STARTED |
| `node --test tools/check-app2-closure.test.mjs` | 32/32 pass (was 30/30 — two cases added, see §R) |
| `pnpm check:secrets` | pass — 367 documents, 1817 tracked files |
| `pnpm check:lifecycle` | pass — LC-04 5 transitions, one `PUBLISHED → DRAFT`, archive distinct |
| `pnpm check:openapi` | pass — artifact up to date |
| `pnpm check:api-client` | pass — tree hash `7524fc91…8ecf5a2` |
| `pnpm check:figma-design-index` | pass — 86 / 86 / 11 |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 pass |
| `pnpm db:check:manifest` | pass — 78 tables, 833 columns, 211 physical indexes |
| `pnpm check:spike-boundaries` | pass — no app or package depends on a spike or rendering candidate |
| `pnpm spike:editor:test` | 29/29 pass, 2 suites |
| `pnpm spike:editor:check` | pass — production isolation holds, 7 artifacts, 36 raw runs |
| `node tools/check-file-size.mjs` | pass — 38 files above review threshold, **0 hard-limit violations** |
| `pnpm quality` | `EXIT=0` |
| `git diff --check` | clean |

Document validation: internal links resolve, checkpoint IDs are unique,
dependencies are acyclic, operation counts are within limits, frontend scopes
are bounded, every open decision and activated follow-up has exactly one
checkpoint owner, Figma status is grounded in the registry, and no
implementation change was made.

## R. Commit A — exact evidence

```text
6806c79b99eb4c4f6696f7f945ff216f84f66cce
docs(app3): audit design templates and 2D studio entry
```

Files (4):

```text
docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md   (new, 800 lines)
docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md (+148/−7)
tools/check-app2-closure.mjs                                   (+11/−4)
tools/check-app2-closure.test.mjs                              (+22)
```

**The two `tools/` files are a disclosed departure from "documentation only",
and the reason is stated rather than buried.** `check-app2-closure.mjs` failed
any file in `docs/implementation/reports/` whose name starts with `APP3-`, with
the message *"APP3 must not be started before closure"*. That assertion exists
to stop APP3 work **predating** closure. APP2 is now closed and accepted, and
this checkpoint's mandated report is
`APP3-PRE-IMPLEMENTATION-AUDIT-COMPLETION-REPORT.md` — so the gate and the
sanctioned next step collided, and no permitted report name resolves it.

The fix follows the established pattern: the gate moves with the ruling, in
place, and stays mechanical. **One exact filename** is allowlisted — not a
prefix, not a label escape, not a disabled check. Every other `APP3-` report
still fails, and a near-miss such as `APP3-PRE-IMPLEMENTATION-AUDIT-C1-REPORT.md`
fails too; both halves are pinned by `node --test`. The closure verdict string
the gate prints is byte-for-byte unchanged. No `package.json` change was needed.

No schema, migration, OpenAPI, generated-client, Figma, application-source,
package-manifest or lockfile change exists in Commit A.

## S. Acceptance

| Requirement | Status |
|---|---|
| Exact APP2 closure entry read from Git | met (§B) |
| APP0 SVG/React architecture preserved; IMP-D026 not reopened | met (§C) |
| Scope and exclusions exact | met (§D) |
| Repository and DB gaps proven from files | met (§E, §F) |
| Template and Session lifecycles mapped, canonical names unchanged | met (§H) |
| Anonymous ownership audited; no identity invented | met (§G) |
| Editor-safe media classified | met (§J) |
| API and frontend decomposition compliant | met (§K) |
| Figma status grounded | met (§L) |
| Security, watermark, no-export preserved | met (§M) |
| Performance and test ownership defined | met (§M) |
| Follow-ups reconciled | met (§N) |
| Acyclic map, one first gate | met (§O, §P) |
| No implementation prompt written | met |
| Quality and artifact gates pass | met (§Q) |
| Two docs-only commits | met — one disclosed `tools/` departure (§R) |
| Clean tree, `evidences/` untouched, nothing pushed | met |

## T. Final state and stop confirmation

```text
APP2 = COMPLETE — PASS_WITH_FOLLOW_UPS — REVIEW_ACCEPTED
APP3-PRE-IMPLEMENTATION-AUDIT = COMPLETE — DELIVERED_FOR_REVIEW
APP3 = AUDITED — NOT STARTED
APP3-G01 = READY — NOT STARTED
```

Every other APP3 checkpoint is `NOT STARTED`. No APP3 implementation was
started, no Figma node was touched, no execution prompt was written, and nothing
was pushed. **Stopping here for human review.**
