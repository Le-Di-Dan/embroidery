# APP3-A04 — Admin Design Template Lifecycle / Publication · Completion Report

One bounded Admin frontend screen. The final screen of the Admin Template
branch.

**Status:** `COMPLETE — REVIEW_DELIVERED`. Commit A `78986de`. Nothing pushed.

```text
A04_DESIGN_BLOCKERS = RESOLVED_BY_OPERATOR_JUDGMENT
```

---

## A · Entry state and B04A acceptance

`APP3-B04A` was recorded `COMPLETE — REVIEW_ACCEPTED` at entry (Commit A
`1575dcc`), together with B04, D01, D01-C1, A01, A02, A03 and A03-C1. Measured,
not transcribed: **34 paths / 39 operations / 83 schemas**, 34 migrations, 30
root scripts, OpenAPI sha256 `f736306045…`, generated-client tree
`f47c774ad5…`. All identical at exit.

## B · Figma rows and approval activation

Section `596:10` — *04 — Admin Template Lifecycle* — holds **exactly five**
frames, confirmed from the live file and from `APP3-D01`'s own report:

| Row | Node |
|---|---|
| `FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY` | `602:3` |
| `FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-GUARDFAIL` | `602:54` |
| `FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-PUBLISHCONFIRM` | `602:105` |
| `FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-ARCHIVE` | `602:152` |
| `FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED` | `602:204` |

All five moved `REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION` under
`APP3-A04 §0 operator review`. **No Studio row was approved**, and no Figma node
was modified. The gate asserts the set approved *under this checkpoint's
evidence* rather than "no Studio row is approved anywhere" — `FIG-STUDIO-EDITING-TABLET-1024`
was already approved by `APP3-A01 §0` as a responsive reference, and a blanket
rule would have failed on a row A04 never touched.

The design proved unusually informative: the frames already carry **three**
readiness marks (`✓ ✕ –`), so the "cannot evaluate" state this screen needs was
part of the approved vocabulary rather than an invention.

## C · Route and the A03 entry

```text
/design-templates/[templateId]/publication
apps/admin/src/app/(protected)/design-templates/[templateId]/publication/page.tsx
```

Addressed by the Template UUID. A **sibling** of the editor, not a mode of it:
the four guarded transitions are never reachable from behind an unsaved draft.
The URL is built by `adminDesignTemplatePublicationRoute` in the one route
authority that already owns `/design-templates`, so no second spelling exists.

A03 gains exactly one affordance — *Quản lý xuất bản* — and it is a navigation
routed through `guard.requestNavigation`, so leaving a dirty editor still
prompts. No lifecycle command exists on A03 or A02.

## D · Operations consumed

```text
adminDesignTemplate_detail      read
adminProductPlacement_get       read (scope resolution)
adminDesignTemplate_publish     command
adminDesignTemplate_unpublish   command
adminDesignTemplate_archive     command
adminDesignTemplate_restore     command
```

Exactly two `queryFn`s exist in the feature; the gate counts them, so a third
read would fail.

## E · Curated client evolution

All four lifecycle operations crossed together, with their request-body types.
They are one state machine — a boundary offering publish but not unpublish, or
archive but not restore, would strand an operator in a state with no exit, and
restore is the *only* way out of `ARCHIVED`.

The rule that stayed is stronger than the absence it replaced: A02's and A03's
gates now assert that **neither of them invokes one**, against a boundary where
the operations genuinely exist.

## F · Lifecycle action matrix

```text
DRAFT      publish · archive
PUBLISHED  unpublish · archive
ARCHIVED   restore
```

A frozen table, not conditionals. `ARCHIVED → PUBLISHED`, a restore from
`DRAFT`/`PUBLISHED`, an unpublish from `ARCHIVED`, a restore-and-publish chain
and a hard delete are **unrepresentable** — there is no branch that could
produce one.

## G · Concurrency token

`expectedCurrentVersion` comes only from the authoritative detail snapshot
(`detail.currentVersion?.version ?? 0`). Never the list, the URL, a local
increment or an assumed `1`. `retry: false` on every command; no automatic
replay after any failure.

## H · Advisory readiness over an authoritative server

No Template-readiness operation exists and none was invented. Two truth layers:

| # | Condition | Client can prove? |
|---|---|---|
| 1 | immutable version exists | yes — detail |
| 2 | scope complete | yes — detail |
| 3 | document valid | yes — `APP3-P01` |
| 4 | scope resolves / active | yes — placement read |
| 5 | placement matches | yes — `APP3-P02`, `NEW_EDITING` |
| 6 | in bounds | yes — `APP3-P02` |
| 7 | media eligible | **only** when the document references zero Assets |

An unprovable row renders `CHECKED_ON_PUBLISH` — never a pass — and never
blocks. Publish is disabled only for a locally authoritative impossibility (no
version, no scope), announced through `aria-describedby`. Anything broader would
be a second, weaker GRD-T01, which `IMP-D042` PO-07 forbids.

Row 7 deserves a note: answering `READY` for a document that references nothing
restates an observation about the document, not a copy of the eligibility
policy — it is the server's own rule that *"a document that places nothing
places nothing ineligible"*.

## I · The seven rows

All seven are rendered **always**, in the design's order and wording. The panel
never filters: an operator who sees five rows cannot know the server checks
seven, and the two that were hidden are the likeliest to refuse them.

## J · The real 422, and the UX it forced

**Wire-proven** during the browser proof:

```json
{ "success": false, "code": "UNPROCESSABLE_ENTITY", "message": "…", "meta": {…} }
```

No `errors` array, no per-guard discriminator. Read from the code first and
confirmed on the wire: `api-error-mapper.ts` promotes a feature's own code only
when the exception payload is a **record**, and the Design Template controllers
throw `UnprocessableEntityException(message)` with a *string*. The internal
`PublicationRefusal` vocabulary (`SCOPE_UNRESOLVED`, `MEDIA_INELIGIBLE`, …) is
captured server-side and discarded at the HTTP boundary.

So this is §12's third branch: a bounded generic refusal that **names no
condition**, keeps all seven rows visible, fabricates no failed guard, and states
that the Template was not published and the server changed nothing. No cache
invalidation follows — `APP3-B04` guarantees the guard writes nothing, so a
refetch would imply something moved when nothing did.

`FU-APP3-CONFLICT-CODE-CONTRACT-01` remains **OPEN**.

## K · The real 409, and the re-read

Wire: `409` / `code: CONFLICT` — same mechanism, same absence of a
discriminator, so classification is by HTTP status alone. Network trace from the
proof:

```text
POST …/unpublish → 409        exactly one attempt, never replayed
GET  …/{templateId} → 200     exactly one authoritative re-read
```

The cache was replaced with server truth, the actions recomputed from the
returned `DRAFT` (publish + archive replaced unpublish + archive), and the
operator was told the request was not replayed. A stale **archive or restore**
additionally voids the typed reason and requires a fresh confirmation: the
operator agreed to retire *that* Template in *that* state, and the reason is
written verbatim into the audit trail.

## L–O · The four commands

| | Body | Confirmation | Copy carries |
|---|---|---|---|
| publish | `{expectedCurrentVersion}` | dialog | publishes the current version, creates none |
| unpublish | `{expectedCurrentVersion}` | dialog | returns to DRAFT, versions retained, nothing deleted |
| archive | `+ reason` | **alertdialog** | retained not deleted, restorable later, no cascade |
| restore | `+ reason` | dialog | back to DRAFT, **not republished**, scope not repaired |

Reasons are trimmed, non-empty and capped at 500 to mirror the server bound;
validation runs before the request, bound to the field through `aria-invalid`
and `aria-describedby`. No `targetStatus`, `force`, `publishAfterRestore` or
`versionToPublish` exists anywhere.

## P · Query and cache

The **same** detail identity A03 uses (`designTemplateEditorKeys.detail`) — a
publish here is what the editor sees. On success the response is written into
that entry and the list root (`designTemplateQueryKeys.lists()`) is invalidated;
nothing is flipped optimistically, no version is incremented locally, and no
redundant detail GET follows. No Zustand.

## Q · A02 / A03 boundaries

A02 keeps list/create/open with no row-level lifecycle control. A03 keeps
document authoring plus the one navigation. Both gates were evolved from "the
operation is unreachable" to "this feature never calls it", which is the
property they were always about. A02's no-N+1 rule is untouched.

## R · Accessibility and security

Status is text inside the badge, never colour alone; the readiness glyph is
`aria-hidden` and every row states its outcome in words. Successful outcomes are
`role="status"` / `aria-live="polite"`; actionable failures are `role="alert"`.
Archive is an `alertdialog`; focus enters the dialog, is trapped, and returns to
the trigger. Every command button is ≥48px tall.

No server message, SQL, storage fact, audit payload or stack ever reaches the
screen — copy comes from one bounded catalogue, and classification uses only the
HTTP status. `FU-ADMIN-SHARED-DIALOG-01` remains **OPEN**; this is the fourth
hand-rolled dialog and the follow-up is still the right place to resolve all four
at once.

## S · Responsive and browser proof

Live gateway, real Admin + API, real operator session.

**Ordinary journey, entirely through the UI:** A03 editor (fix geometry, save
v2) → *Quản lý xuất bản* → **DRAFT v2, all seven rows READY** → publish →
**PUBLISHED** → unpublish → **DRAFT** → archive with reason → **ARCHIVED** →
restore with reason → **DRAFT**, v2 preserved throughout.

**Real GRD-T01 refusal:** produced through the UI with no fixture — a document
authored out of bounds in A03. The client proved `WITHIN_AREA` failing, publish
stayed enabled (the server is the authority), and the server refused with the
422 above. Status stayed `DRAFT`; no re-read followed.

**Real 409:** a second operator unpublished out of band (a genuine HTTP call, not
a stubbed response) while the screen held a `PUBLISHED` view; the stale unpublish
produced the trace in §K.

| Viewport | Result |
|---|---|
| 1440 | two columns, readiness + actions |
| 1280 | two columns (`420px 436px`), **no horizontal overflow** |
| 390 | **one column**, all seven rows, both legal actions at 48px, alertdialog 327px wide, reason field 261×74, canonical scrim `rgba(23,23,23,0.45)`, no overflow |

**Console: 0 errors, 0 warnings** on a clean load and across two successful
commands.

**A defect the proof found.** After a successful command the confirmation dialog
stayed open — the success callback reported `ok` and the screen read the same
boolean as `keepOpen`, so a published Template kept its dialog and the next
action was unclickable behind the backdrop. Every component assertion about the
status badge still passed. Fixed by naming the parameter for what the caller does
with it, plus two regressions that assert the dialog is gone *and* the next
action is enabled.

**Disclosed environment note:** both dev containers needed a restart to serve new
routes — Admin for the new App Router segment, API for B04A's restore controller.
A staleness issue with no code involved; B04A's own live suite had already proved
the endpoint against a disposable database.

## T · Tests, checker, Admin regression

- `design-template-lifecycle.test.tsx` — 18 cases: the matrix, the exact bodies,
  success adoption, no optimistic flip, no local increment, dialogs close.
- `design-template-lifecycle-readiness.test.tsx` — 15 cases: the seven rows, the
  third state, blocking limited to authoritative facts, the 422, the 409.
- `lifecycle-readiness.test.ts` — 13 model cases.
- `design-template-lifecycle-source.test.ts` — 13 boundary cases.
- `tools/check-app3-a04.mjs` (+ `-authority.mjs`) with **31/31** regressions.
- **Whole Admin suite: 916/916, 69 suites.** Typecheck, lint, production build.

Predecessor gates evolved world-aware (`isA04Delivered`): A01/A02/A03 design
rows, A02/A03 curated-client rules, the A02/A03 route-set rules, and B04A's
curated restore export — every one now ruled in **both** directions, with the ban
tested by rewinding the phase to the world it describes. Gate regressions:
a01 37 · a02 22 · a03 53 · a04 31 · b03 34 · b03a 40 · b03b 29 · b04 45 ·
b04a 35 · b05 61 — 0 failures.

Two environment findings are recorded in the ledger: jsdom has no `TextEncoder`
(so `prepareDesignDocument` failed canonicalization under test while succeeding
in every browser — polyfilled rather than weakened), and the SCSS token API
exposes `$radius-*`/`$font-size-*` variables with a closed base-4 `spacing()`
scale, which component tests cannot check because `next/jest` stubs SCSS.

## U · Contract immutability

```text
paths 34 · operations 39 · schemas 83 · migrations 34 · root scripts 30
OpenAPI  sha256 f736306045faa1c7a638bf7749b27051e351b967d29d574c20c6dce1fb581908
client   tree   f47c774ad5a6b3e1f40ad1d1413e6693e3a7ba5a1088f7cadd716a17519f62d9
```

Unchanged. Nothing was regenerated; only the handwritten curated barrel moved.
The gate recomputes both digests, so a frontend checkpoint cannot move either.

## V · Follow-ups

Closed by B04A and honoured here: `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01`.

Carried unchanged: `FU-APP3-CONFLICT-CODE-CONTRACT-01`,
`FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01`, `FU-APP3-A02-D01-CONTRACT-DRIFT-01`,
`FU-APP3-DESIGN-SESSION-PEPPER-TEST-01`, `FU-ADMIN-SHARED-DIALOG-01`,
`FU-ADMIN-SHELL-NARROW-DESKTOP-01`, `FU-DESIGN-PUBLISH-DS-INPUT-01`.

## W · The three operator rulings

1. **Mobile.** No A04 Figma mobile frame exists; all five approved rows are
   Desktop 1440. The 390 layout is
   `ENGINEERING_JUDGMENT_FROM_DESKTOP_AUTHORITY`: one column, all seven readiness
   rows, every LC-24-legal action operable, dialogs and reason inputs fully
   usable, canonical touch targets and scrim, no horizontal overflow, and nothing
   hidden because the viewport is narrow. `PRODUCT_SEMANTICS_CHANGED = NO`.
2. **Product display name.** `OMIT_WHEN_NOT_AVAILABLE_FROM_ACCEPTED_READ_MODEL`.
   The scope reads *Side · Area*. No extra API, no public Product read, no
   per-id lookup, no navigation state, no A02/A03 local state as authority, and
   no UUID rendered as a name. The screen is correct when opened directly at its
   URL, and this omission blocks no command and no readiness row.
3. **Historical lifecycle reason.**
   `NOT_DISPLAYED_WITHOUT_ACCEPTED_AUDIT_READ_CONTRACT`. Reasons are
   `AUDIT_OWNED`; `HISTORICAL_REASON_ADMIN_READ = NOT_AVAILABLE_IN_CURRENT_ACCEPTED_CONTRACT`.
   No Audit API was created, no database was read, no reason is inferred, and no
   browser-held reason is presented as durable history. The archived panel says
   *«Lý do lưu trữ được ghi trong nhật ký kiểm toán, không hiển thị ở đây.»* A
   reason is collected only for the command being performed now.

**Restore.** The Figma `BLOCKED_BY_APP3-B04A` annotation is
`DESIGN_TIME_DEPENDENCY_PROVENANCE`; `RUNTIME_DEPENDENCY = SATISFIED_BY_APP3-B04A`,
so `RESTORE_RUNTIME_STATE = ACTIVE_WHEN_LC24_ALLOWS`. The annotation was left in
Figma untouched. Proved live: an `ARCHIVED` Template restored to `DRAFT`.

None of the three is an unresolved blocker.

## X · Files

53 files, +5167 / −145. New: the lifecycle feature (5 components, 3 hooks, 4
model modules, 2 services, 1 stylesheet, index), the route segment, four test
suites, the checker and its authority module and regressions. Modified: the
route authority and two feature barrels, the A03 topbar/screen/copy, the Admin
stylesheet, `jest.setup.ts`, the curated client, four predecessor gates and five
harnesses, the design registry, the scoped command index and the phase status.

Every runtime file is under 400 lines and every test file under 600; the gate
measures both.

## Y · Commit A and roadmap

`78986de` — `feat(admin): add Design Template lifecycle management`.

```text
APP3-B04A = COMPLETE — REVIEW_ACCEPTED
APP3-A04  = COMPLETE — REVIEW_DELIVERED
ADMIN_TEMPLATE_FRONTEND_BRANCH = A01 + A02 + A03 + A04 DELIVERED
```

Expected after acceptance: `APP3-A04 = COMPLETE — REVIEW_ACCEPTED`, then
**`APP3-B05A` → `APP3-S01`** — B05, B07 and D01 are accepted, and S01 still needs
published-Template preview/media delivery. `APP3-B06C` stays `READY — NOT STARTED`
for the later S06. **Studio was not started.**

## Z · Validation and clean tree

Run: A04 gate + 31 regressions · 916/916 Admin tests · A01/A02/A03/B03/B03A/
B03B/B04/B04A/B05 gates and their regressions · Figma registry gate (165 IDs) ·
Admin typecheck, lint, production build · `openapi:check` and `check:generated`
both current with **unchanged digests** · api-client typecheck + 44 tests ·
`pnpm lint` 24/24 · `format:check` clean · `git diff --check` clean · browser
proof above.

Not run, deliberately: `pnpm quality` (does not exist — GOV-Q01), the full API
suite, DB integration, worker, full repository integration, E2E, Figma mutation,
`pnpm install`.

Working tree clean after Commit B. Nothing pushed.
