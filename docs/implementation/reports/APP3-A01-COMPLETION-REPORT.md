# APP3-A01 — Admin Product Placement Authoring — Completion Report

```text
APP3-A01 = COMPLETE — REVIEW_DELIVERED
Commit A = 672f7f2fd1c15caedbcca438b6ac3652fc73df34
Commit B = this report
```

The first delivered APP3 frontend checkpoint.

---

## A. Entry state and the D01 human approval

The operator reviewed `APP3-D01` and its single correction and accepted both.
`APP3-A01` §1 applied that approval to the canonical registry; nothing here
self-approved.

| Predecessor | Status at entry |
|---|---|
| `APP3-D01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-D01-C1` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B01` | `COMPLETE — REVIEW_ACCEPTED` |
| `APP3-B01-C1` | `COMPLETE — REVIEW_ACCEPTED` |

**21 registry rows** moved `REVIEW_REQUIRED → APPROVED_FOR_IMPLEMENTATION`:
A01 4 · A02 5 · A03 5 · shared state-matrix and responsive reference 2 ·
D01-C1 responsive references 3 (`618:3`, `618:74`, `618:140`) · `FIG-DS-INPUT`
and `FIG-DS-SCRIM-TOKEN` 2. Each now carries `APP3-A01 §0 operator review` in
its Approval Evidence column — an approved row with an empty evidence cell is
the sort of unsupported claim the registry exists to prevent.

**The transition is deliberately scoped.** `A04` and every Studio row stay
`REVIEW_REQUIRED`. Their designs were accepted, but an
`APPROVED_FOR_IMPLEMENTATION` row is a standing licence for
`FIGMA_DESIGN_INDEX` §2 to let frontend work proceed, and granting it to
checkpoints nobody has cleared would make the registry stop being the gate it
exists to be. The A01 checker asserts this in **both** directions: the rows A01
needs must be approved, and a Studio row and an A04 row must still not be —
so a blanket approval fails the gate rather than passing it.

Recorded in the registry as §4.9 and in the phase plan's status block.

---

## B. Route

```text
/products/[productId]/placement
apps/admin/src/app/(protected)/products/[productId]/placement/page.tsx
```

The existing protected Admin route group, nested under the product detail
segment exactly as `APP2-A04`'s publication route is, and for the same reason:
placement is one more thing done to a product you are already looking at, and
nesting keeps the product UUID the single identity in the path. The segment is
the B02 UUID, never the public slug.

`adminProductPlacementRoute` lives in the **products** feature's route model
beside `adminProductPublicationRoute`, so the product route family has one owner
and the detail screen can link to placement without the two features importing
each other.

The route file is a thin boundary: it resolves the param and hands off. It does
not prefetch — the placement response carries the concurrency token, and a token
dehydrated on the server would already be one navigation old.

**Discoverability:** `ProductPlacementEntry` on the product detail screen,
labelled `Vị trí thêu`, routed through the shared navigation guard so unsaved
form edits are still protected. It is offered for **every** lifecycle state,
unlike the publication entry — sides and areas exist independently of public
visibility, and a `PUBLISHED` product whose placement needs a correction is
exactly the case that must not be locked out. Product detail was not redesigned.

---

## C. Figma nodes consumed

| Node | Registry ID | Used for |
|---|---|---|
| `596:7` (section) | `FIG-ADMIN-PLACEMENT-DESKTOP-*` | three-column composition, hierarchy, preview, inspector, states |
| `618:74` | `FIG-ADMIN-PLACEMENT-NARROW-1280` | narrow-desktop collapse rule |
| `76:29` | `FIG-DS-INPUT` | the five field states |
| `78:2` | `FIG-DS-SCRIM-TOKEN` | dialog scrim |

---

## D. Responsive implementation

| Viewport | Behaviour |
|---|---|
| 1440 | `minmax(240,296)` hierarchy · `minmax(0,520)` preview · `minmax(240,280)` inspector |
| 1280 | panels give up slack first, preview scales proportionally; all three regions visible, nothing in a drawer, **no horizontal overflow** |
| 390 | approved read-only notice **replaces** the editor |

The 1280 rule was wrong on the first browser run: a fixed 520px preview column
overflowed the page by 55px. The fix is the C1 ruling itself — the preview is
the elastic column and scales proportionally rather than holding a pixel width.
Measured after: `scrollWidth === clientWidth === 1265`, canvas ratio exactly
`1.333` against an authored `2000×1500`.

Mobile replaces rather than hides. A `display: none` editor still holds
focusable numeric fields and still announces itself, so `useViewportMode`
decides what to *render*. It defaults to `desktop` whenever the answer is
unknowable — during server rendering and wherever `matchMedia` is absent —
because a false mobile verdict would hide the whole screen from a desktop
operator, which is far worse than briefly rendering a desktop layout on a phone.
Measured at 390: zero inputs, no save control, no horizontal overflow.

**Disclosed deviation.** The C1 ruling also narrows the application sidebar
240 → 200px at 1280. That is the APP1 admin shell, shared by every Admin screen;
changing it from A01 would alter surfaces this checkpoint does not own, and §22
says not to redesign the shell. A01 achieves the ruling's actual requirement —
three regions visible, preview proportional, no overflow — inside its own
columns, and the preview is correspondingly narrower (≈315px at 1280).
Recorded as `FU-ADMIN-SHELL-NARROW-DESKTOP-01`.

---

## E. Generated API operations consumed

```text
GET /api/admin/products/{productId}/placement   adminProductPlacement_get
PUT /api/admin/products/{productId}/placement   adminProductPlacement_replace
```

Both reached through `@embroidery/api-client` and imported in exactly **one**
module (`services/product-placement.service.ts`) — asserted mechanically. No raw
Axios, no `fetch`, no hard-coded endpoint path anywhere in the feature.

`adminAsset_list` is the background picker's read, the same accepted APP2
boundary the product media picker uses.

`publicProductPlacementGet` and `publicProductSideBackgroundGet` are **withheld
from the client boundary entirely**. The public read answers a narrower model —
no `backgroundAssetId`, no retired rows, no concurrency token — and an authoring
screen bound to it would look correct while silently dropping the history and
the token the operator depends on. Checked as a real absence, not inferred.

The two operations were added to the api-client's curated export surface
(`packages/api-client/src/index.ts`), which is handwritten. `src/generated/` was
not touched.

---

## F. Local draft and server state

| Concern | Owner |
|---|---|
| durable server snapshot | TanStack Query, `['admin','product-placement','detail',id]` |
| unsaved placement edits | feature-local `useReducer` draft |
| dirty | comparison of the draft against the draft the *server answer* produces |

No Zustand store: none exists for Admin placement, and §8 says not to add one
for A01 alone. The query root is separate from `admin/products` so an
invalidation aimed at the product list cannot discard placement state the
operator is still editing.

Dirty is **computed**, not flagged. A boolean some handler must remember to set
drifts the first time a change is made anywhere else; comparing against the
pristine draft cannot.

Every numeric field is held as the string the operator typed. Parsing happens
once, when the body is built. A parse-on-keystroke draft collapses `12.`, `0.30`
and an empty field into something that is not what is on screen — which is the
silent clamping §17 forbids.

On success the cache is **replaced** with the server's answer (the whole model,
including rows it just retired, and the fresh token), the draft re-seeds from the
new token, and dirty clears. **No second GET** — the replace answer is already
canonical and a follow-up read would race the token the next save depends on.
Asserted: the read count does not change across a successful save.

---

## G. `expectedUpdatedAt` and conflict behaviour

`expectedUpdatedAt` is taken from the draft's own seed — never from the current
cache entry, and never from a token a previous conflict already rejected.

On `409 PLACEMENT_VERSION_CONFLICT`:

- **exactly one** request is sent; no retry (`retry: false` on the mutation);
- nothing is overwritten and nothing is auto-merged;
- the local draft survives untouched and stays on screen;
- an `alertdialog` states that the server was **not** overwritten and offers two
  choices — reload latest, or keep the draft for comparison with the caveat that
  it is browser-only.

Reload refetches, replaces the baseline, resets the token and clears the
conflict. Keeping the draft closes the dialog but **not** the conflict: the
token is still stale, so the banner stays and save stays disabled. That split is
why `conflicted` and `conflictDialogOpen` are separate — dismissing an
interruption must not look like resolving the problem.

Only the exact domain code opens that path. `409` alone also means
`PLACEMENT_REFERENCED_IMMUTABLE` and `PLACEMENT_BACKGROUND_NOT_ELIGIBLE`, and
offering a destructive reload for a failure reloading cannot fix would tell the
operator to throw work away for nothing. Both directions are tested.

No automatic merge anywhere: merging two placement trees would have to decide
which side of a code collision wins and which geometry is authoritative, and
getting that wrong writes a wrong physical size onto a garment.

---

## H. Side / Area mapping semantics

| Draft state | Body | Server effect |
|---|---|---|
| existing row, edited | carries `id` | retained and updated |
| new row | **no `id` property at all** | created |
| removed row | omitted | retired |
| already-retired row | omitted | left alone (no-op) |

`key` is a local React identity (`draft-side-3`) that never leaves the browser
and is deliberately un-UUID-like, so it can never be mistaken for a server id.
Asserted: the serialized body contains neither `draft-` nor `"key"`.

Optional members are **omitted**, not set to `undefined` — the server body is
`.strict()` and the workspace compiles with `exactOptionalPropertyTypes`. An
absent physical maximum is an empty field, never `0`, which would be a real
maximum of zero millimetres.

Retiring a side retires everything it contains, because the server does; a draft
showing a live area under a retired side would describe a state the backend
never produces. A row the server has never seen is dropped outright rather than
marked removed — there is nothing to retire, and it would linger forever.

Ordering is the backend's own comparator — `displayOrder`, then `code`, then
`id` — so the list the operator sees is the list that comes back after a save.
Reordering rewrites `displayOrder`; no drag index is ever persisted.

Retired rows stay visible and badged and are not selectable for editing: their
geometry is frozen server-side, so offering fields that cannot be saved would be
a lie. `PLACEMENT_REFERENCED_IMMUTABLE` is mapped to copy that tells the
operator to retire and add a replacement — never to delete and recreate.

---

## I. Background Asset selection and preview

Selection reuses the accepted Admin asset boundary (`adminAsset_list`), gated on
the dialog actually being open so the library is never pulled for an operator
who does not open it. No Asset UUID is ever typed.

Eligibility mirrors the server exactly and adds **one rule the product media
picker does not have**: the source must be raster. SVG is rejected for
backgrounds (`IMP-D044` PO-03) because nothing sanitizes one, and offering it
would produce a refusal *after* the operator had chosen it.

**No background image is rendered, and the screen says so.** `APP2` publishes no
authenticated Admin media-delivery route — its own picker renders placeholders
for the same reason — and the public side-background route is explicitly not an
authoring dependency: it requires the product to be published, and placement is
authored while the product is still a draft. The canvas is drawn to the authored
dimensions with the placeholder stated rather than implied.

Asserted absent from rendered output: `http://`, `https://`, bucket, s3, minio
and the checksum.

---

## J. Validation and error mapping

Local feedback mirrors `@embroidery/design-engine` **exactly**, including the
parts that are easy to get subtly wrong:

- containment is boundary-inclusive (`PO-09`) — flush with the edge passes, one
  unit past does not;
- scale agreement is compared **on the quantization grid**
  (`quantize(px/mm) === quantize(pxPerMm)`, scale `10_000`), not with an epsilon
  that would quietly widen the boundary.

The engine is **not** imported. It is a `dist`-built workspace package the Admin
app does not depend on, and §14 pre-authorizes that link only when it is
actually needed; two lines of arithmetic pinned by boundary tests do not need
it. If this feature ever requires real transform maths the link is the right
answer, and `placement-validation.ts` is the seam to replace.

An invalid value is **never clamped**. What is shown is what would be sent, and
it is refused instead — asserted directly.

Save is blocked while the draft is knowingly invalid, with a stated reason: a
disabled button and no explanation is indistinguishable from a broken one.

Server failures are classified by domain code and rendered from a fixed copy
catalog: version-conflict, referenced-immutable, geometry, background, invalid,
generic. Nothing reads the server's message, code or request id for display —
asserted against a message naming a table and a constraint.

Covered states: loading · GET failure · not-found · empty · field validation ·
server validation · `PLACEMENT_VERSION_CONFLICT` · `PLACEMENT_REFERENCED_IMMUTABLE`
· ineligible background · network failure (edits preserved) · save success.

---

## K. Accessibility

- Every control has a real `<label for>`; help/error text is wired through
  `aria-describedby`; an invalid field carries `aria-invalid` and shows the
  error *in place of* its help text.
- Hierarchy rows are real `<button>`s carrying `aria-current`; the three levels
  are three nested lists, so the nesting is what assistive technology announces.
- The dialog traps focus, cycles it, returns it to the opener, and uses
  `alertdialog` only for the conflict.
- Each SVG area is a `<g role="button">`: focusable, labelled, activated by
  Enter and Space, with a visible focus ring. An SVG shape carries none of that
  on its own, and the inspector is not a substitute for picking an area on the
  canvas.
- The inspector renders one panel at a time; rendering both and hiding one would
  leave a second set of numeric fields in the tab order, editable by keyboard,
  writing to a row the operator is not looking at.

---

## L. Targeted component tests

**86 tests across 7 suites**, all mocking the generated client boundary — never
a raw Axios URL, and no fake backend.

| Suite | Cases | Covers |
|---|---|---|
| `placement-render.test.tsx` | 13 | load states, hierarchy nesting and order, retired visibility, selection, 1440/1280/390, scope, labels |
| `placement-save.test.tsx` | 13 | body shape, token echo, cache replacement, no second read, dirty reset, the whole conflict path, other failures |
| `placement-mapping.test.ts` | 21 | normalization, id retention/omission, retirement by omission, ordering, dirty tracking, reducer rules |
| `placement-validation.test.tsx` | 11 | containment boundary, scale grid, field/preview/form flagging, no clamping, save guard |
| `placement-background.test.tsx` | 11 | eligibility incl. SVG rejection, picker boundary, storage-leak absence |
| `placement-source.test.ts` | 14 | static boundaries, route location, token/colour rules, file sizes |
| `placement-navigation.test.tsx` | 3 | entry affordance, published product, navigation guard |

Full Admin suite: **605 passed / 53 suites**, no regression.

---

## M. Browser visual review

Production Admin build (`next start`), driven through Playwright against a
deterministic local stub serving fixed fixtures. The Admin proxy routes on
cookie *presence* only, so a synthetic value was sufficient — no credential was
used, read or created.

Reviewed and inspected: **1440** default · area editing · validation ·
conflict; **1280** area editing; **390** mobile notice. The loading state is
covered in jsdom rather than the browser — it is a single status paragraph and
the stub cannot be made to hang for a screenshot without distorting the run.

Four defects were found here that no jsdom test could have caught:

1. retire controls too wide for the 296px column, wrapping row names to four
   lines — labels shortened, `white-space: nowrap`, `min-width: 0` on the name;
2. a retired row still rendered a permanently disabled retire button — removed;
3. **the second field of every inspector pair silently disappeared.** A panel
   that scrolls on one axis clips on the other, and the inputs would not shrink
   into their grid cells. Fixed with `min-width: 0` / `width: 100%` on the
   shared field;
4. horizontal overflow at 1280 (§D).

All browser artifacts, screenshots and the stub were removed before Commit A;
`.next` was rebuilt clean without the stub URL inlined.

---

## N. Checker and frontend boundaries

```text
node tools/check-app3-a01.mjs         132 assertions   PASS
node --test tools/check-app3-a01.test.mjs   36/36      PASS
```

The gate recomputes every fact from the repository and **does not read this
report**. It asserts entry authority, registry approval in both directions, one
protected route, the two generated operations in one module, token echo, no
retry, the narrowed conflict test, retirement by omission, retired rows
rendered, the three hierarchy levels, the responsive floor and its fail-safe
default, the mobile branch, the tokens, contract immutability, root script count
and file sizes.

Its own tests caught two real defects in it: it **crashed** with a stack trace
instead of failing cleanly when the route file was absent, and its
retired-rows rule was a regex tied to one filter *spelling* that an arrow
parameter's parentheses defeated. Both fixed — a rule that only recognises the
spelling it was written against is not a rule.

Registered as `CMD-CHECK-APP3-A01`, `CMD-TEST-APP3-A01`, `CMD-TEST-APP3-A01-ADMIN`.
No root `package.json` script; root scripts remain **30**.

Boundary gates: styling `PASS` · frontend test-boundary `PASS` ·
frontend build-boundary `PASS` (2522 built files, no test code).

---

## O. OpenAPI and generated client unchanged

```text
pnpm --filter @embroidery/api openapi:check
  OpenAPI artifact is up to date

pnpm --filter @embroidery/api-client check:generated
  generated client is up to date (tree hash 87951f1b…c096c1b5)
```

Neither artifact was generated and neither changed. Expected contract changes: 0.
Actual: 0. The gate additionally asserts that neither file mentions `APP3-A01`,
which is the only way a "we did not generate" claim can be verified.

---

## P. File sizes

Largest production module **272 lines**, every one within the 400 hard maximum.
Largest test file **283 lines**, within 600. Checker **426**, its tests **539** —
both within the checkpoint's soft caps.

The feature stylesheet is **732 lines**. SCSS is not a logic/source file and the
repository's own convention agrees — `product-form.scss` is 753 — but it is
worth stating rather than leaving to inference.

---

## Q. Design-system Input and scrim

**A new canonical shared code primitive**, `apps/admin/src/shared/forms/
admin-text-field.tsx`, aligned to `FIG-DS-INPUT`. No suitable shared Input
existed: `StaffLoginField` is login-specific and `ProductFormFields` is a form
section, not a primitive — and A01 has ~15 numeric fields across two inspectors.
Placed in Admin shared scope, the narrowest scope that serves every Admin
feature; `@embroidery/ui` is for components genuinely shared with the storefront
and is empty.

All five approved states are expressed, but only Error and Disabled are props.
Focus and Filled are conditions of the control — a `state` prop would let a
caller render a focus-styled field that does not have focus.

The scrim is `$color-overlay-scrim` in `@embroidery/styles` (`ink/900` at 45%),
defined once and consumed by the placement dialogs. The placement stylesheet
contains **no colour literal and no `rgba(`** — asserted.

**This does not mean the Figma library was published.**
`FU-DESIGN-PUBLISH-DS-INPUT-01` remains open; publishing is a manual Figma
action. The code consumes the token and the component *semantics*, not a Figma
instance, so it is not blocked by it.

APP2's existing `product-dialog` scrim literal was left alone: rewriting
accepted APP2 components is unrelated refactoring inside a frontend checkpoint.

---

## R. Open follow-ups

| ID | Status |
|---|---|
| `FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01` | **OPEN** — B01's nullable response members reach OpenAPI as empty schemas, so the generated client types them `{ [key: string]: unknown } \| null` where the server answers `number`/`string`. A01 may not change the contract (§23), so the weakness is absorbed in `placement-model.ts` alone. Same family as the `createZodDto` finding in `APP3-B01-C1`. |
| `FU-ADMIN-SHARED-DIALOG-01` | **OPEN** — `PlacementDialog` duplicates `ProductDialog`; consolidating means editing four accepted APP2 components and their tests. |
| `FU-ADMIN-SHELL-NARROW-DESKTOP-01` | **OPEN** — the C1 sidebar 240 → 200px rule at 1280 belongs to the APP1 shell owner. |
| `FU-DESIGN-PUBLISH-DS-INPUT-01` | **OPEN — OWNER_DESIGN_SYSTEM**, nonblocking for code. |

---

## S. Changed files

54 files, +7122 / −30.

**New** — `apps/admin/src/features/product-placement/` (components 9, hooks 5,
model 9, services 2, styles 1), the protected route, `ProductPlacementEntry` and
its label, `apps/admin/src/shared/forms/` (component + stylesheet), 7 test files
and a fixture, `tools/check-app3-a01.mjs` and its tests.

**Modified** — product detail screen and products barrel/route model (entry
affordance), `main.scss`, `packages/api-client/src/index.ts` (curated export
surface), `packages/styles/src/settings/_color.scss` (scrim token),
`FIGMA_DESIGN_INDEX.md`, `SCOPED_COMMAND_INDEX.md`, the APP3 phase plan.

No API, worker, database, migration, OpenAPI, generated-client or Figma change.

---

## T. Commit A

```text
672f7f2fd1c15caedbcca438b6ac3652fc73df34
feat(admin): add Product placement authoring
```

**Protocol note.** Commit A was written once, then the preview was rewritten
from DOM positioning to SVG (see below) and Commit A was
recreated by `reset --soft` before Commit B existed. Nothing was pushed at any
point and the delivered history is the required two commits, A immediately
preceding B. Disclosed rather than left for the reviewer to notice in a reflog.

The rewrite itself: the first implementation positioned area rectangles with CSS
custom properties applied through `element.style`. The styling gate passed it —
its regex only matches JSX `style=` — but
`05-FRONTEND-AND-SCSS-STANDARD.md` §8 prohibits "React inline styles **or CSS
custom properties assigned through `style`**" and names the correct mechanism
for exactly this case: *Canvas/SVG rendering APIs for Design Studio geometry
rather than DOM CSS positioning*, which `IMP-D026` already locks. The gate was a
proxy; the standard is the rule, and §9 forbids bypassing it silently. The SVG
version is also simply better: the `viewBox` **is** the side's pixel space, so
there is no scaling arithmetic, no percentages and nothing to round.

---

## U. Forward roadmap

```text
APP3-D01     = COMPLETE — REVIEW_ACCEPTED
APP3-D01-C1  = COMPLETE — REVIEW_ACCEPTED
APP3-A01     = COMPLETE — REVIEW_DELIVERED
APP3-A02     = READY — NOT STARTED
APP3-A03     = READY — NOT STARTED

APP3_FRONTEND_IMPLEMENTATION = STARTED_BY_APP3_A01
NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-A02
```

`A02` is another bounded one-screen Admin checkpoint, its backend (`B03`) is
accepted, its design rows are now approved, and it provides the Template
list/navigation entry used before the `A03` editor.

JIT backend states unchanged: `APP3-B04A`, `APP3-B05A`, `APP3-B06C` all
`READY — NOT STARTED`; `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` open.
Storefront `S01` is **not** ready merely because A01 shipped.

---

## V. Validation evidence

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/admin exec jest --testPathPatterns=placement` | **86 passed / 7 suites** |
| `pnpm --filter @embroidery/admin exec jest` | **605 passed / 53 suites** |
| `node tools/check-app3-a01.mjs` | **PASS — 132 assertions** |
| `node --test tools/check-app3-a01.test.mjs` | **36 passed / 0 failed** |
| `apps/admin` `tsc --noEmit` · `eslint .` · `next build` | PASS |
| `node tools/check-styling-boundaries.mjs` | PASS (856 files, 10 rules) |
| `node tools/check-frontend-test-boundaries.mjs` | PASS |
| `node tools/check-frontend-build-boundary.mjs` | PASS (2522 files) |
| `pnpm --filter @embroidery/api openapi:check` | PASS — unchanged |
| `pnpm --filter @embroidery/api-client check:generated` | PASS — unchanged |
| `pnpm --filter @embroidery/api-client exec jest` | 44 passed |
| `node tools/check-figma-design-index.mjs` | PASS — 165 IDs / 165 nodes / 15 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 31 passed |
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS — 24 tasks |
| `git diff --check` | clean |

Not run, and deliberately: `pnpm quality` (deleted by GOV-Q01), the full API,
worker and database suites, and the full E2E stack — no backend, schema or
contract changed, and `APP3-E01` owns cross-layer E2E.

**Final state:** branch `production`, working tree clean, Commit A immediately
precedes Commit B, **nothing pushed**.
