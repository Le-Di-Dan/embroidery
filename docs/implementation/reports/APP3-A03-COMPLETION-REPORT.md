# APP3-A03 — Admin Design Template Editor · Completion Report

`APP3-A03 = COMPLETE — REVIEW_DELIVERED`
Commit A `d81aec7` — `feat(admin): add Design Template editor`

---

## A. Entry state

| Predecessor | Recorded status |
|---|---|
| `APP3-D01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-D01-C1` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-A01`, `APP3-A01-C1` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B02A` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-A02` | `COMPLETE — REVIEW_ACCEPTED` (recorded by this checkpoint, §0 of the directive) |
| `APP3-B03`, `APP3-B03A` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-P01`, `APP3-P02` | `COMPLETE — REVIEW_ACCEPTED` |

Measured at entry, not assumed: 32 paths / 37 operations / 81 schemas, 34
migrations, 30 root scripts. All three are unchanged at exit and the gate
asserts each.

## B. Figma authority

Six approved rows, all `APPROVED_FOR_IMPLEMENTATION`, section `596:9` +
`596:23`:

| Registry ID | Node |
|---|---|
| `FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-DEFAULT` | `601:3` |
| `FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-TEXTSELECTED` | `601:48` |
| `FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-SAVING` | `601:100` |
| `FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-CONFLICT` | `601:147` |
| `FIG-ADMIN-TEMPLATEEDITOR-MOBILE-READONLY` | `601:204` |
| `FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280` | `618:3` |

No Figma node was created, modified or moved. The gate asserts the six rows are
approved **and** that A04's lifecycle rows and every Studio row are still
`REVIEW_REQUIRED`, so a blanket approval cannot pass it.

**Limitation — how the design was read.** The Figma MCP server is not
authenticated in this session, so the frames were not opened directly. The
design authority used was the registry rows above (exact node ids, status and
approval evidence) plus the `APP3-D01`/`D01-C1` completion reports, which
describe these six frames in prose — including the 1280 annotation this
implementation is built to (layers 240px minimum, inspector 260px minimum,
elastic stage, no horizontal overflow, inspector scrolls vertically). Anything
in the frames not covered by those two sources was not consulted.

## C. Route, and the A02 activation

One protected route: `/design-templates/[templateId]`, at
`apps/admin/src/app/(protected)/design-templates/[templateId]/page.tsx`. No
alias. Addressed by the Template **UUID**, never the slug: the slug is the
published address and a draft may never have been published, so a slug-addressed
editor would be unreachable for exactly the Templates it exists to edit.

`APP3-A02`'s row affordance was a disabled button carrying its own reason. It is
now a real `<Link>` — dependency activation, not a correction. Both the list
route and the editor route are built from one authority
(`design-templates/model/design-template-route.ts`), which is also what keeps the
two features from importing each other: the list links *into* the editor and the
editor links *back*, so a route constant in each would form a cycle.

Nothing else about A02 changed. Its no-N+1 and no-lifecycle invariants are
asserted against the new world in §U.

## D. Operations

Consumed: `adminDesignTemplate_detail`, `adminDesignTemplate_saveDocument`,
`adminProductPlacement_get`, `adminProductSideBackground_get`.

Withheld and asserted absent: `adminDesignTemplate_publish`, `_unpublish`,
`_archive`. `adminDesignTemplate_restore` **does not exist in the contract at
all** — `APP3-B04A` owns it — so the gate asserts the three that do exist are
off the boundary, and separately asserts the generated client still publishes
them, or the withholding above would prove nothing.

## E. Curated client evolution

`adminDesignTemplate_detail` and `adminDesignTemplate_saveDocument` cross
`@embroidery/api-client` **together**: the read is the only source of the
`expectedCurrentVersion` the save must echo, so one without the other would
publish a write nobody could safely perform. The gate asserts they appear in the
same export statement.

Two transport type aliases were added (`TransportDesignDocument`,
`TransportDesignPlacementSnapshot`) so the wire shape can be named at the service
seam. They are Orval's projection of the same `APP3-P01` types; the alias names
say so, and nothing validates a document against them.

No generated source was edited and nothing was regenerated.

## F. Zero-version and the detail model

`resolveEditorSource` is a pure function over the two reads. Seven outcomes:
`loading`, `not-found`, `load-failed`, `unscoped`, `scope-failed`,
`scope-unresolved`, `document-invalid`, `ready`.

A Template with a current version is opened on that version's canonical
document — **validated by `APP3-P01`, not trusted**; a document this build
cannot read is reported rather than half-rendered.

A Template with no version is opened on an empty document at
`expectedCurrentVersion = 0`. No `v1` is fabricated anywhere; the server derives
the first version.

### `ENGINEERING_JUDGMENT = A03_EMPTY_DOCUMENT_CONSTRUCTOR`

`@embroidery/design-document` publishes the type, the schema version, the limits
and the validator, but **no empty-document factory** — its only builders live in
a test-only `testing/` module the package deliberately does not export. So
`buildEmptyDocument` composes the minimal valid document from P01's own exported
constants and hands it straight to P01's own `validateDesignDocumentStructure`.
There is no second schema, no second validator and no second schema-version
authority; if P01 would refuse the document, this refuses it too, with the same
findings.

### Why a scope is required to build one

`DesignPlacementSnapshot` is a **required** member of every `DesignDocument`, and
every field must be a non-empty id or a positive number. A Template with no
placement scope therefore has **no representable document** — not because this
screen forbids one, but because the model has nowhere to put the absence. The
only way around it would be to invent a `productSideId` and an
`embroideryAreaId`, which §17 forbids and which would write a document pointing
at geometry that does not exist.

So an unscoped Template shows a bounded, stated reason and issues **no Product
request at all**. This is the distinction the directive asked for: the screen
does not block authoring *because the scope is absent*; the document model makes
it unrepresentable, and the copy says which.

A Side whose canvas is not a usable positive integer is reported, never rounded —
a rounded canvas is a document that misstates the Side it claims to be authored
against.

## G. Local editor state

One deterministic reducer (`editor-state.ts`) plus a session hook that owns the
only rule about when the server may replace the draft: **exactly twice** — when
the editor first opens a Template, and when the operator explicitly asks for the
latest version after a conflict. Never on a refetch, never on window focus,
never because a cache entry updated. The editable document is deliberately not in
the query cache; a background refresh that overwrote unsaved work would be
indistinguishable from data loss.

`dirty`, `saving`, `conflicted` and `saveError` are four independent facts, not
four values of one enum, because they co-occur. `conflicted` is separate from
`conflictDialogOpen` for the same reason: dismissing a dialog is a statement
about a dialog, not about the version the draft is based on.

Commands: `RESET_FROM_SERVER`, `SELECT_ELEMENT`, `CLEAR_SELECTION`,
`ADD_ELEMENT`, `REMOVE_ELEMENT`, `UPDATE_TEXT`, `UPDATE_TRANSFORM`,
`MARK_SAVING`, `SAVE_SUCCESS`, `SAVE_FAILURE`, `STALE_CONFLICT`,
`KEEP_LOCAL_DRAFT`. No undo/redo — `APP3-S10` owns it.

## H. Save and version semantics

Body: exactly `{ expectedCurrentVersion, document }`. No lifecycle, scope, slug,
schema version, binary or storage member — the gate asserts this against the
request literal, not against the member names appearing somewhere in the file.

On success the response is authoritative: baseline version, baseline document and
working document are all replaced from it, dirty and conflict are cleared, and
**no detail GET follows**. Proved in the browser: one `GET` and two `PUT`s across
two saves (§T).

The version label comes only from the server's answer. Nothing pre-increments.

## I. Stale conflict — and a contract finding

**The published `409` carries no discriminator.** `APP3-B03A` documents one `409`
for two causes ("Stale `expectedCurrentVersion`, or a template that is not a
DRAFT"). Both are raised as a NestJS `ConflictException`, and the envelope filter
reduces every one of those to `code: "CONFLICT"`. Verified against the running
API:

```json
{ "success": false, "code": "CONFLICT",
  "message": "This design template changed since it was loaded. Reload and try again." }
```

The internal vocabulary (`DESIGN_TEMPLATE_VERSION_CONFLICT`,
`DESIGN_TEMPLATE_NOT_EDITABLE`) never leaves the server, and the only differing
field is `message`, which must never be branched on.

This invalidated the implementation's first premise, which transcribed the
internal code. The unit tests passed because they fabricated the code that was
assumed — the browser review is what found it.

**Resolution.** A `409` is classified as `conflict-unresolved`, which is
deliberately not presentable to an operator, and the cause is then resolved from
**authoritative state**: a fresh detail read, and the template's own status says
which guard refused. Still `DRAFT` → the version guard → the conflict decision.
Anything else → the editability guard → "this template is no longer a draft".
A failed re-read defaults to `stale-version`, the recoverable branch, because the
alternative asserts a status change on no evidence and its copy invites a reload
that discards work.

This needs nothing outside the published contract and cannot drift against a
server vocabulary no one is obliged to keep stable. Recorded as
`FU-APP3-CONFLICT-CODE-CONTRACT-01`.

The dialog itself: states the server was **not** overwritten, offers exactly two
choices, says there is no automatic merge, and has no dismissal — escaping it
would leave a draft that cannot be saved and no statement of why. No force-save.
No automatic retry. Keeping the local draft closes the dialog and only the
dialog: the banner and the disabled save survive it. Reloading confirms the
discard first.

## J. Non-DRAFT templates

`PUBLISHED` and `ARCHIVED` render read-only: no save control, no add-text, no
add-image, no remove, no editable persistence control, and no lifecycle control
anywhere. The notice names which state it is in and says only a draft is
editable. Verified live against an `ARCHIVED` template (§T).

## K. Scope and placement

Context, never a control — `APP3-A03` owns no scope mutation and none exists in
the contract after creation. The Side and Area are resolved from the Product's
authoritative placement **by id**, never by name, code or index: a Side matched by
name would follow a rename, one matched by index a reorder. A retired Side still
resolves, because retirement withdraws a row from *new* selection and a Template
already scoped to one is not thereby unscoped.

An unresolved scope never falls back. If the Template already has a document the
draft survives — the document carries its own placement snapshot, so the stage
keeps a coordinate space and only the context is reported missing. For a Template
with no version there is no fallback and the screen says so.

## L. Side background

Second authorized Admin consumer, after `APP3-A01`. `Blob` from
`adminProductSideBackground_get`, turned into a browser object URL in an effect
that revokes it on replacement, on scope change and on unmount — one mechanism,
three cases. `gcTime: 0`, no `placeholderData`, no public route, no storage
address. The gate asserts **exactly two** consumers exist across the Admin app
and that the object URL is created only in the hook that revokes it.

The hook is this feature's own rather than an import from A01: the two differ in
what decides whether the request may happen at all, and cache under different
roots. A cross-feature import would have coupled two capabilities to share one
generated call.

## M. SVG and the design engine

Native SVG rendered by React (`IMP-D026`). No Canvas, Konva, Fabric, Pixi, second
renderer, inline positional style or CSS custom property.

The `viewBox` **is** the document's placement canvas, so elements are drawn at
authored coordinates with no scaling arithmetic in the file. Painting order is
document order, bottom first — SVG has no `z-index` and `APP3-P01` defines the
array as z-order with the same convention.

Every matrix, bound and containment answer comes from
`@embroidery/design-engine`: `buildElementGraph`, `resolveEffectiveTransform`,
`getElementBounds`, `containsBounds`, `rectToBounds`. Elements are drawn in their
**local** box and placed by the engine's effective matrix — drawing at `x`/`y`
*and* transforming would place them twice. An element the engine cannot resolve
is not drawn at all; at the identity it would look positioned rather than failed.

Out-of-bounds is **feedback, never a guard**: a draft may sit outside the area,
`APP3-B04` owns the publication geometry, and refusing here would be a second,
weaker definition of publishable. Proved by test and in the browser — the save
stayed enabled with the element outside the area.

## N. Layers, selection, text

Layer panel in document order **reversed** (the array is bottom-first, a layer
list reads top-first) and it says so. Every row is a real `<button>`, so the whole
panel is keyboard-operable — which is what makes the SVG stage an *additional*
selection path rather than the only one. No drag-to-reorder: `APP3-P01` gives
z-order no separate field and a reorder command is not among this checkpoint's
operations, so inventing the gesture from the visual alone would be building a
capability the document model was never asked about.

Text edits only real P01 fields. The font is chosen from `DESIGN_FONT_REGISTRY`
by `fontId` — there is no free-text family field anywhere, so a document cannot
ask a browser for a face the server never approved.

Numeric fields commit only on a finite parse; an empty field does not silently
become `0` and move an element to the origin.

## O. Template image — limitation, unchanged

`FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN — OWNER_NOT_YET_ASSIGNED`.

| Capability | State |
|---|---|
| Text-only Template authoring | **Production-reachable** — verified end to end against the live API |
| Existing image references | **Preserved** — kept in the document, selectable, transformable, drawn at real geometry |
| New production Template image intake | **Still blocked** by the follow-up |

The add-image control is visible, disabled and labelled with the
`TEMPLATE_SOURCE` flow it waits for (`APP3-D01` §I.1). No upload, no
registration, no `CATALOG_MEDIA` substitution, no presign, no raw object URL, no
hidden asset-kind conversion.

**Audit result — no safe Admin draft-asset route exists.** The contract publishes
`adminAsset_list`/`adminAsset_detail` (JSON metadata, no bytes),
`adminProductSideBackground_get` (Side backgrounds only), and the public
`publicProductMedia_get` / `publicProductSideBackground_get`. `APP3-B05A` serves
*published* Template assets and `APP3-B06C` serves Session uploads; neither is
permission to render an Admin draft. So an image element is drawn as an honest
dashed frame with a label saying it cannot be previewed. The raw Asset UUID is
deliberately not the label — an internal identifier is not a name; a test asserts
the id never appears in the DOM.

## P. Unsaved-change protection

Dirty is tracked from the authoritative baseline. In-app exits go through the
existing Admin `useRegisterNavigationInterceptor` seam so the approved dialog is
what the operator sees; reload and tab close are covered by `beforeunload`. No
global router framework was introduced. Conflict does not clear dirty; a
successful save does. Observed live — the browser blocked a navigation away from
a dirty editor (§T).

## Q. Responsive

| Viewport | Result |
|---|---|
| 1440 | Layers, stage and inspector all present; `scrollWidth === clientWidth === 1440` |
| 1280 | All three present — layers **240px**, inspector **260px**, stage elastic; `scrollWidth === clientWidth === 1280`; inspector scrolls vertically with no x-axis clipping; stage never scrolls horizontally |
| 390 | Read-only notice **replaces** the editor: no stage mounted, zero `<svg>` in the DOM, no save control, and **zero** background and placement requests |

**Deviation — stage width at 1280.** The 1280 annotation allots the stage ~780px.
Measured: **340px**. The difference is the Admin shell's own 264px sidebar, which
does not narrow at 1280. That is `FU-ADMIN-SHELL-NARROW-DESKTOP-01`, opened by
`APP3-A01` and still shell-owned; A03 does not work around it. All three regions
remain simultaneously visible and nothing overflows, which are the properties the
annotation makes binding.

**Correction found during review.** The stylesheet originally declared
`overflow-x: visible` beside `overflow-y: auto` on the inspector, with a comment
claiming it prevented `APP3-A01`'s clipped-inspector defect. It does not: CSS
computes a `visible` axis to `auto` whenever the other axis is not `visible`, and
the browser confirmed the computed value was `auto`. The declaration and its
comment were describing something that never happened. What actually prevents the
defect — `min-width: 0` on the column and `max-width: 100%` on its controls, so
there is no x-axis overflow to clip — is now what the stylesheet says and what
the gate asserts.

## R. Accessibility, security, errors

Keyboard-operable layer list; labelled transform inputs carrying their **unit**;
the stage is `role="group"` and not focusable, so it traps nothing; save state
announced `aria-live="polite"`; save errors as `role="alert"`; focus-managed
conflict and unsaved-confirmation dialogs; read-only announced in text; the
disabled image action explains itself via `aria-describedby`; every status
carried in text as well as colour.

Handled safely: not found, non-editable, stale write, invalid document, unusable
scope, unavailable background (retry offered only where retrying can work),
transport and server error. No storage key, bucket, provider endpoint,
association internal, Outbox/Audit datum, SQL fragment or credential can reach
the screen — the copy catalogue is the only source of operator-facing text and
classification never reads the server `message`. A test asserts a 500 carrying a
constraint name and a bucket name renders neither.

## S. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/admin typecheck` | pass |
| `pnpm --filter @embroidery/admin exec jest` | **804 passed**, 63 suites |
| `pnpm --filter @embroidery/admin exec jest --testPathPatterns=design-template` | **176 passed**, 9 suites |
| `node tools/check-app3-a03.mjs` | pass — **538 assertions** |
| `node --test tools/check-app3-a03.test.mjs` | **53 passed** |
| `node tools/check-app3-a02.mjs` | pass — 152 assertions |
| `node tools/check-app3-a01.mjs` | pass — 185 assertions |
| `node tools/check-app3-g01.mjs` | pass |
| `node tools/check-figma-design-index.mjs` | pass — 165 registry IDs |
| `pnpm --filter @embroidery/api openapi:check` | artifact up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date (tree hash `9b3f4a39…`) |
| `pnpm --filter @embroidery/api-client typecheck` | pass |
| `pnpm --filter @embroidery/api-client test` | 44 passed, 7 suites |
| `pnpm --filter @embroidery/admin build` | pass — `/design-templates` and `/design-templates/[templateId]` both dynamic |
| `pnpm lint` | 24/24 workspaces |
| `pnpm format:check` | clean |
| `git diff --check` | clean |

**Disclosed budget deviation.** `pnpm install` was run once, against a budget of
zero. The Admin did not depend on `@embroidery/design-document` or
`@embroidery/design-engine`, and §9/§21 make both mandatory — the alternatives
(a local schema, a copied formula) are forbidden outright, so linking the two
workspace packages was the only compliant path. They are workspace packages, not
new external dependencies.

**Disclosed soft-cap deviation.** `tools/check-app3-a03.mjs` is 884 lines against
a 450 soft cap, and `check-app3-a03.test.mjs` 772 against 700. Both are single
coherent gates with one verdict each; splitting them to reach a number would be
the arbitrary line-range split CLAUDE.md §6 warns against. Flagged rather than
forced.

## T. Browser proof

Live stack through the Nginx gateway at `admin.embroidery.local`, real
PostgreSQL, real API.

**Seeding.** A03's journey needs a *scoped* Template, and `APP3-A02`'s create
dialog deliberately creates unscoped drafts. One was created through the
published `adminDesignTemplate_create` operation using the operator's own
session — data seeding through a published contract, not new backend capability.
See `FU-APP3-TEMPLATE-SCOPE-EDIT-01`.

| Step | Observed |
|---|---|
| Zero-version DRAFT at 1440 | "Chưa có phiên bản", chip **Đã lưu**, save disabled, three regions, scope resolved by id, canvas 400×400, empty-document state |
| Side background | `<image>` inside the `viewBox`, `blob:` handle, area rectangle and safe boundary drawn from placement truth |
| Add text → edit | chip **Chưa lưu**, save enabled, element on stage and in layers, selection overlay present |
| Save | **v1**, chip **Đã lưu**, save disabled |
| Second save | **v2**, canonical text from the response on the stage |
| Network | **1 GET, 2 PUTs** — no redundant detail read after either save |
| Out-of-bounds | warning shown, save stayed enabled |
| Stale conflict (real v3 written out of band) | dialog opens, "Máy chủ chưa ghi đè bất cứ thay đổi nào…", exactly two buttons, chip **Xung đột phiên bản**, draft intact, focus inside dialog |
| Keep local draft | dialog closes, banner persists, chip stays **Xung đột phiên bản**, save stays disabled, draft text intact |
| Dirty navigation | browser `beforeunload` blocked the navigation |
| ARCHIVED template | read-only notice, no save, no add-text, no add-image, no remove, no lifecycle control |
| Unscoped template | "Chưa gán phạm vi" with the document-model reason, no stage |
| A02 list | 4 rows, all `<a>`, `href=/design-templates/{uuid}`, no stale "APP3-A03" copy anywhere |
| 1280 | 240 / 340 / 260, no horizontal overflow, inspector scrolls vertically, no x clipping |
| 390 | read-only notice, zero `<svg>`, zero background and placement requests |
| Console | **0 errors, 0 warnings** |

No screenshot, trace or stub was committed.

### Defects found in the browser and fixed

1. **The `409` classification was wrong** — §I. The wire carries no
   discriminator; the transcribed code never matched, so the conflict flow never
   opened against the real API. Reimplemented to resolve from server state.
2. **The conflict banner named an action it did not offer.** After choosing "keep
   my draft" the dialog is gone and the save is disabled, so the banner's
   instruction to reload had no control that performed it. A reload action was
   added to the banner. Same class as `APP3-A02`'s create-409 copy.
3. **The Admin image could not resolve the new workspace packages.** The dev
   container bind-mounts only `apps/admin/src`; `node_modules` and the packages
   are baked in, so the host install proved nothing in the image. Fixed with the
   `pnpm --filter "@embroidery/admin^..." build` step the API image already
   carries. Same class as `APP3-W01B`'s worker image.
4. **The inspector's overflow comment described a mechanism CSS does not
   have** — §Q.

## U. Gate evolution

Three `APP3-A02` rules were stale proxies the moment A03 delivered. Each was made
world-aware rather than deleted, and the invariant behind it is now asserted
*more* directly:

| Was | Now |
|---|---|
| "exactly one design-template route" | the list route, plus the editor route once it exists — the **pair**, so a third would still fail |
| "`adminDesignTemplateDetail` is absent from the boundary" | the operation exists; **the list never calls it**, asserted over the list's own sources |
| "no `template-editor` feature exists" | the editor feature is A03's; the *list* feature may not grow an editor |
| curated export matched as an exact adjacent-name substring | matched as membership of one export statement — Prettier rewrapped it when a third name arrived |

The A02 gate's own summary sentence was corrected: it claimed the detail read
stays off the client boundary, which stopped being true. A gate printing a false
claim is worse than one that fails.

`APP3-A01`'s gate needed no change — its background rules are scoped to A01's own
feature and remain true. The *global* rule that only A01 and A03 may consume
`adminProductSideBackground_get` is asserted in the A03 gate, which is the newest
place that can see both.

Four weaknesses in the A03 gate itself were found by its own regressions and
fixed before delivery: a rule satisfied by its own explanatory comment
(`minmax(0, 1fr)` in a stylesheet read without stripping comments); a rule that
counted a route module's declaration as a call site; two rules satisfied by an
import statement rather than a call; a rule that fired on this feature's own
`DESIGN_TEMPLATE_EDITOR_COPY` constant instead of on a transcribed error code;
and a migration count that included git-ignored `dist` build output.

## V. OpenAPI and generated immutability

| Fact | Value |
|---|---|
| Contract change | **0** |
| Paths / operations / schemas | 32 / 37 / 81 — unchanged |
| OpenAPI artifact | byte-identical, `openapi:check` passes |
| Generated client source | byte-identical, `check:generated` passes |
| Migrations | 34 — unchanged |
| Root scripts | 30 — unchanged |
| Figma nodes | none created, modified or moved |

## W. Follow-ups

| Id | Status |
|---|---|
| `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` | `OPEN — OWNER_NOT_YET_ASSIGNED` (carried, **not** closed) |
| `FU-APP3-A02-D01-CONTRACT-DRIFT-01` | `OPEN — NONBLOCKING_DESIGN_EVIDENCE_RECONCILIATION` (carried) |
| `FU-APP3-TEMPLATE-SCOPE-EDIT-01` | **new** — `OPEN — OWNER_NOT_YET_ASSIGNED` |
| `FU-APP3-CONFLICT-CODE-CONTRACT-01` | **new** — `OPEN — OWNER_NOT_YET_ASSIGNED` |
| `FU-ADMIN-SHARED-DIALOG-01` | `OPEN` — third hand-rolled Admin dialog |
| `FU-ADMIN-SHELL-NARROW-DESKTOP-01` | `OPEN` — the 1280 stage width in §Q |

`FU-APP3-TEMPLATE-SCOPE-EDIT-01` is proved, not assumed. `CreateDesignTemplateBody`
accepts the product/side/area triple, so scope is settable **only at creation**;
there is no update operation for it anywhere in the contract; and `APP3-A02`
deliberately narrowed its create dialog to unscoped drafts. A Template created
through the Admin UI today therefore has no scope and can never acquire one,
which means its document can never be authored. This is a forward product gap
with no owner, and it is the reason §T's review Template had to be seeded through
the API.

## X. Files

**New — 24.** Route segment (1); feature (18: 7 model, 6 hooks, 2 services,
10 components, 1 stylesheet, 1 index — 27 files in total under the feature);
gate + regressions (2); test support (2); test suites (5).

**Modified — 16.** `apps/admin/package.json`, `pnpm-lock.yaml`,
`packages/api-client/src/index.ts`, `apps/admin/src/styles/main.scss`,
A02's table / card list / copy / route / index, four A02 test files,
`tools/check-app3-a02.mjs`, `infrastructure/docker/admin.Dockerfile`, the phase
plan and the scoped command index.

Every production file is within 400 lines and every test file within 600; both
asserted by the gate. The editor screen crossed 400 after Prettier and was split
by responsibility — the seven bounded non-editing states moved to
`editor-blocked-state.tsx`, which is a real boundary, not a line-count cut.

## Y. Commit

`d81aec7` — `feat(admin): add Design Template editor` — 57 files, +7952/−96.

## Z. Forward

```text
APP3-A02 = COMPLETE — REVIEW_ACCEPTED
APP3-A03 = COMPLETE — REVIEW_DELIVERED
APP3-B04A = READY — NOT STARTED
APP3-B05A = DEFINED — BLOCKED_BY_APP3-B05 — NOT STARTED
APP3-B06C = DEFINED — READY — NOT STARTED
NEXT_RECOMMENDED_IMPLEMENTATION_CHECKPOINT = APP3-B04A
NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-B04A_THEN_APP3-A04
```

**Recommendation: `APP3-B04A` immediately before `APP3-A04`.** Read at
completion, not by suffix. `APP3-A04`'s approved design draws restore as
disabled and annotated `BLOCKED_BY_APP3-B04A`
(`FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED`), so A04 *could* ship
publish/unpublish/archive with restore disabled-with-reason under accepted D01
authority. But `adminDesignTemplate_restore` does not exist in the contract at
all — unlike the Template-image case, where the surrounding capability exists and
only the intake is missing. Shipping A04 first would leave a lifecycle screen
whose only recovery from archive is unimplementable, and archive is the one
destructive action on it. The narrow JIT backend first is the smaller risk.

Working tree clean. Nothing pushed.
