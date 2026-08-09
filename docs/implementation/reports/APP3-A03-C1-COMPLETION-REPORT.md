# APP3-A03-C1 — Initial Design Template Scope Assignment · Completion Report

`APP3-A03-C1 = COMPLETE — REVIEW_DELIVERED`
Commit A `277ac7b` — `fix(admin): assign initial Design Template scope`

---

## A. What this closes

```text
A03_REVIEW_BLOCKER = UI_CREATED_UNSCOPED_TEMPLATE_CANNOT_BECOME_AUTHORABLE
```

`APP3-A02` creates an unscoped `DRAFT` through the ordinary Admin UI.
`APP3-P01` requires a `DesignPlacementSnapshot` in **every** Design Document. So
the editor had nothing to author on, and no accepted operation could give it
one — the A03 browser review had to seed a scoped Template through the API to
prove the journey at all.

`APP3-B03B` published the assignment and deliberately kept it off the client
boundary. This correction is its only consumer, and the blocker is now recorded
as `CLOSED_BY_APP3-A03-C1`.

## B. Entry state

| Predecessor | Status |
|---|---|
| `APP3-B03B` | `COMPLETE — REVIEW_ACCEPTED` (recorded by this correction) |
| `APP3-A02`, `APP3-B03`, `APP3-B03A`, `APP3-P01`, `APP3-P02` | `COMPLETE — REVIEW_ACCEPTED` |

Measured at entry and unchanged at exit: **33 paths / 38 operations / 82
schemas**, 34 migrations, 30 root scripts.

## C. Curated client evolution

`adminDesignTemplateAssignScope` and `AssignDesignTemplateScopeBody` cross the
handwritten `@embroidery/api-client` boundary. Nothing generated was edited and
nothing was regenerated — `openapi:check` and `check:generated` both report the
artifacts current at the same tree hash B03B produced (`96c3a6a5…`).

The export carries the reason with it: this is a **one-time initial** assignment,
the server admits it only for an unscoped versionless `DRAFT`, and there is no
rescope or clear-scope operation to pair it with.

## D. Where the selector appears

Only when all three hold — scope absent, status `DRAFT`, `currentVersion`
absent — which is exactly `APP3-B03B`'s source-state rule restated. Anything else
unscoped is a Template that *lost* its eligibility, so it gets the bounded reason
instead: showing a selector there would offer a choice whose only outcome is a
`409`.

`isInitiallyAssignable` checks `currentVersion === undefined`, never a comparison
against `0` — the detail view publishes an optional object precisely so "no
version" is not a version zero.

The A03 `unscoped` copy was corrected. It used to say no assignment operation
existed, which was true then and would be a lie now.

## E. The three dependent choices

Product → Side → Area, each populated from the answer above it. The dependency is
the design, and the invalidation is where the bugs live:

| Change | Effect |
|---|---|
| Product | Side **and** Area cleared |
| Side | Area cleared |

Both are structural, in `scope-selection.ts`: the transition function cannot
produce a selection whose parts disagree. Left to three independent setters this
would be a rule every call site must remember, and the failure mode is a request
carrying a Side from one Product and an Area from another — the partial scope
`IMP-D042` PO-06 calls *wrong* rather than incomplete.

Areas are read from the chosen Side's own `areas`, not from a flattened
Product-wide list, so a sibling Side's Area is **never reachable** rather than
merely filtered out.

**Retired rows are absent, not disabled.** `IMP-D041` retires without deleting so
existing references survive; a retired row is a valid *historical* placement and
never a legal new one, and `APP3-B03B` refuses it server-side.

**Product publication is not required.** An unpublished Product is an ordinary
authoring target — readiness is `GRD-T01` and belongs to `APP3-B04`. The browser
proof used a `DRAFT` Product.

## F. No partial scope

The confirm is disabled until the triple is complete, says why through
`aria-describedby`, and `completeSelection` returns `null` for anything less. A
test drives a Product-only selection and asserts the operation was never called.

## G. Product discovery

`adminProduct_list` — the accepted Admin operation `APP3-A02`'s toolbar filter
already uses. One bounded page. No invented search (the contract publishes none
for this purpose, and a dead control is what A02 was careful not to ship), no
public catalogue list (it answers a narrower, published-only model), and no
per-id fan-out. Asserted as absences in the boundary suite.

The Product list is fetched only while an assignment is actually possible, so a
scoped Template, a versioned one and a phone each issue nothing.

## H. The request

```json
{ "productId": "…", "productSideId": "…", "embroideryAreaId": "…" }
```

Exactly three ids. Tests assert `document`, `version`, `currentVersion`,
`expectedCurrentVersion`, `status`, `slug`, `name` and `description` are all
absent, and the live PUT body confirmed it byte for byte. Scope assignment never
travels with a document save — the scope must exist before a document can be
constructed at all.

## I. The transition

The assignment response is a full detail view, so the mutation writes it into the
detail query cache. **That is the whole transition**: the next render derives a
scoped, versionless `DRAFT` and the editor appears.

- Same URL, no navigation, no route reopen.
- **No redundant detail GET** — asserted in a test and confirmed in the browser.
- The empty document comes from A03's existing constructor; no second one exists.
- `expectedCurrentVersion` stays `0`, and the first save creates `v1` through the
  unchanged B03A flow.

One placement query serves both the selector and the editor: while assigning it
follows the candidate Product, afterwards the scope — and since the assignment
binds the Product the operator just browsed, it is the same cache key.

The Side background is fetched **only after** the scope exists. Browsing Product
choices streams no protected media; proved in the browser and by test.

## J. Losing the race

Two tabs may assign at once. The loser gets a `409`, and `APP3-B03B` deliberately
does not say whether the Template was assigned elsewhere or stopped being
assignable — so the server is asked **once**:

| Re-read shows | Behaviour |
|---|---|
| A scope now exists | The winner's triple is the truth; authoring continues from it |
| Still unscoped | The bounded not-assignable state |

Never retried, never forced. A test proves the winner's *different* Side is what
the scope panel then shows, and that the assignment was attempted exactly once.

## K. Scope is immutable after assignment

The selector disappears; the scope becomes read-only context in the existing
panel. No Change, Clear or Replace control exists — before or after — and the
gate asserts no `rescope`/`clearScope`/`unassignScope`/`replaceScope` identifier
appears anywhere in the feature. The copy never says "change" or "edit" either:
a word implying a rescope would promise a capability the contract does not have.

## L. Browser proof — the mandatory journey

Live stack through the Nginx gateway, real PostgreSQL, real API. **Started from
the A02 create dialog, not from a seeded Template.**

| Step | Observed |
|---|---|
| A02 → Tạo mẫu thêu → submit | row created, scope cell reads "Chưa gán phạm vi" |
| Row link → editor | selector shown, only the Product control, confirm disabled |
| Choose Product | Side control appears; placement requested for that Product |
| Choose Side | Area control appears with that Side's Area only |
| Choose Area | confirm enabled; **zero background requests so far** |
| Gán phạm vi | `PUT …/scope` → 200 |
| Immediately after | editor at the **same URL**, `viewBox 0 0 400 400`, area drawn, "Chưa có phiên bản", chip "Đã lưu", scope panel with **0** controls |
| Add text → save | **v1**, chip "Đã lưu", text on stage |

Network, in order: `GET` detail (once) · `GET` products · `GET` placement ·
`PUT` scope · `GET` background. **No detail read after the PUT.**

Request body verified on the wire:

```json
{"productId":"019fb93e-…","productSideId":"019fe415-…","embroideryAreaId":"019fe491-…"}
```

| Viewport | Result |
|---|---|
| 1440 | selector usable, no overflow |
| 1280 | panel 560px, fits, `scrollWidth === clientWidth === 1280` |
| 390 | read-only notice; no selector, no stage, **zero** Product/placement/background requests |

**0 console errors, 0 warnings.** No screenshot or trace committed.

## M. Accessibility

Every control is a native `<select>` with a real `<label for>` — keyboard-operable
and announced without re-implementing either. The disabled confirm is tied to its
stated reason through `aria-describedby`. Failures are `role="alert"` with a
retry where retrying can work. An empty list is replaced by a sentence saying
why, because an empty dropdown reads as a loading bug. Rendered inline rather
than as a third hand-rolled dialog (`FU-ADMIN-SHARED-DIALOG-01`): this is the
screen's own first step, not an interruption to dismiss.

## N. Gate evolution

| Gate | Was | Now |
|---|---|---|
| `check-app3-a03` | "an unscoped Template issues no Product request" | the placement query follows a resolved scope, an explicit choice, or nothing — plus 15 new C1 rules, active only once C1 is recorded delivered |
| `check-app3-b03b` | A03 must be `CORRECTION_REQUIRED`; curated export must be **absent** | both world-aware: after C1 the blocker must be recorded closed, the export must be **present**, and exactly one Admin module may consume it |
| `check-app3-b03b` | follow-up must read `PARTIALLY_RESOLVED_BY_APP3-B03B` | after C1, `CLOSED_FOR_CURRENT_APP3_SCOPE` |

The first is the interesting one. "No Product request at all" was the right rule
while the unscoped state was a dead end and became wrong the moment it had a
purpose — a selector that cannot list Products is useless. What survives is the
restraint the rule was protecting: nothing is fetched speculatively.

Three regression anchors also broke when the curated export gained a fourth
name — a formatting change, not a boundary change — and were re-anchored.

## O. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/admin exec jest` | **857 passed**, 65 suites |
| `… --testPathPatterns=design-template` | **229 passed**, 11 suites |
| `node tools/check-app3-a03.mjs` | pass |
| `node --test tools/check-app3-a03.test.mjs` | **53 passed** |
| `node tools/check-app3-a02.mjs` + regressions | pass · **22 passed** |
| `node tools/check-app3-b03b.mjs` + regressions | pass · **29 passed** |
| `node tools/check-figma-design-index.mjs` | pass — 165 registry IDs |
| `pnpm --filter @embroidery/admin typecheck` · `build` | pass · both routes dynamic |
| `pnpm --filter @embroidery/api openapi:check` | artifact up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date (`96c3a6a5…`) |
| `pnpm --filter @embroidery/api-client typecheck` · `test` | pass · 44 passed |
| `pnpm lint` | 24/24 workspaces |
| `pnpm format:check` · `git diff --check` | clean · clean |

Not run, per §26: `pnpm quality`, API suite, DB integration, worker, full E2E,
OpenAPI/client generation, Figma mutation, `pnpm install`.

Prettier reformatted gate files mid-run; every gate and regression suite was
re-run afterwards, because a reformat silently invalidates string anchors.

## P. Files

**New — 8.** `editor-scope-assignment.tsx`, `scope-selection.ts`,
`template-scope.service.ts`, three hooks (`use-scope-assignment`,
`use-assign-template-scope`, `use-scope-product-options`), and two test suites.

**Modified — 16**, including the editor screen, copy, keys, failure classifier,
source resolver, stylesheet, the curated client, three gates and three regression
suites.

Every runtime file is within 400 lines and every test file within 600. Two splits
were needed and both are by **responsibility**: the scope-assignment
orchestration moved out of the screen into `use-scope-assignment.ts`, and the C1
model cases into their own suite — the editor already orchestrates a document, a
save and a conflict, and folding a second multi-step flow into it is how a
missing branch hides.

## Q. Follow-ups

| Id | Status |
|---|---|
| `FU-APP3-TEMPLATE-SCOPE-EDIT-01` | **`CLOSED_FOR_CURRENT_APP3_SCOPE`** — initial assignment delivered and consumed by A03; general rescope after assignment or versioning is intentionally unsupported and is not a current APP3 requirement |
| `FU-APP3-CONFLICT-CODE-CONTRACT-01` | `OPEN` — carried |
| `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` | `OPEN` — carried |
| `FU-APP3-A02-D01-CONTRACT-DRIFT-01` | `OPEN` — carried |
| `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` | `OPEN` — carried |
| `FU-APP3-DESIGN-TEMPLATE-FILE-SIZE-01` | `OPEN` — carried; B03B's backend files were not refactored |
| `FU-ADMIN-SHARED-DIALOG-01`, `FU-ADMIN-SHELL-NARROW-DESKTOP-01` | `OPEN` — carried |

**No claim of general scope editing is made**, and the B03B gate asserts the
wording so the record cannot start making one.

## R. Status

```text
APP3-B03B   = COMPLETE — REVIEW_ACCEPTED
APP3-A03-C1 = COMPLETE — REVIEW_DELIVERED
APP3-A03    = COMPLETE — REVIEW_DELIVERED
A03_REVIEW_BLOCKER = CLOSED_BY_APP3-A03-C1
APP3-B04A   = READY — NOT STARTED
```

`APP3-A03` is **not** self-marked accepted. Neither `APP3-B04A` nor `APP3-A04`
was implemented; the likely next sequence remains `APP3-B04A → APP3-A04`, for the
reason A03 recorded: `adminDesignTemplate_restore` does not exist in the contract
at all, so A04 alone would ship an archive screen with no recovery.

Working tree clean. Nothing pushed.
