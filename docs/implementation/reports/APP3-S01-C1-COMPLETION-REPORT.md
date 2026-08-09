# APP3-S01-C1 — completion report

**Restore exact IMP-D041 deterministic Side/Area selection authority**

| | |
|---|---|
| Checkpoint | `APP3-S01-C1` — first and only ordinary correction for `APP3-S01` |
| Type | frontend correction, Storefront only |
| Branch | `production` |
| Commit A | `86edc3015ec209111611c49ff828fa303675dff9` — `fix(storefront): restore canonical Studio placement selection` |
| Status | `APP3-S01-C1 = COMPLETE — REVIEW_DELIVERED` · `APP3-S01 = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW` |

---

## A. Human review finding

The delivered `APP3-S01` implementation was returned unaccepted with one cause:

```text
CAUSE = INITIAL_SIDE_SELECTION_SKIPS_CANONICAL_FIRST_ACTIVE_SIDE
```

Delivered S01 chose, as the Side a fresh visit starts on, *the first Side in
canonical order that carries at least one Embroidery Area*. Review rejected that
as a **product-authority refinement**, not an implementation detail: it rewrites
PO-04's "the first active row" into "the first Studio-usable row".

The finding is correct, and it was recorded in the delivered work as a
deliberate refinement rather than hidden — which is precisely what made it
reviewable, and what makes it correctable here without reopening anything else.

## B. The exact authority

`IMP-D041` / `APP3-G01` PO-04, on customer placement selection:

```text
one active Side               → auto-select it
multiple active Sides         → the customer selects a Side
one active Area on that Side  → auto-select it
multiple active Areas         → the customer selects an Area
initial deterministic choice  → the first active row by display_order
                                + stable tie-breaker
```

The authority names **the ordered active Side list**. It supplies a total order
(`display_order`, then `code`, then `id`) so that "the first row" is the same row
on every load. It does not qualify the list by anything else.

## C. The refinement that violated it

```ts
// delivered APP3-S01 — apps/storefront/.../model/studio-placement.ts
export function initialSideOf(placement) {
  const sides = orderedSides(placement);
  return sides.find((side) => side.areas.length > 0) ?? sides[0];
}
```

The `.find` is the violation. It is invisible in every manifest where each Side
carries an Area, and it changes the answer in exactly one shape:

```text
Side A = active, canonical first, zero active Areas
Side B = active, later, has valid Area(s)

authority        → initial Side = A
delivered S01    → initial Side = B
```

**Why the shape is real rather than hypothetical.** The API derives
`studioEligible` from *one* completely usable Side —
`product-placement.projection.ts`: "A Product is Studio-eligible when **one**
side is completely usable". So a Product can be genuinely, correctly eligible
while its canonical first Side has no Area at all. The frontend read that
Product-level `true` as licence to re-rank the Side list. It is not.

The stated justification — that landing on Side A "would strand the visitor on
an empty Area picker" — described a real UX gap and then closed it by changing
the authority. The correct close is to show the state truthfully and let the
customer move, which is what §E and §F now do.

## D. Corrected comparator and initial selection

The comparator is unchanged and remains the total order PO-04 requires:

```ts
function byCanonicalOrder(left, right) {
  if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
```

The initial Side is now the first row of that list, taken whole:

```ts
export function initialSideOf(placement) {
  return orderedSides(placement)[0];
}
```

No filter by area count, background availability, Template availability, Template
count or bootstrap success runs before that index. No `find(side => side.areas.length > 0)`,
no `filter(...)[0]`, no `firstStudioUsableSide` and no `firstSideWithArea` remains
anywhere in the feature (§J proves the absence, in the whole feature rather than
in this one file).

**Area rule.** Unchanged and still sourced from the selected Side only:

```text
zero Areas       → selectedArea = null
one Area         → auto-selected
multiple Areas   → the first in canonical order, and the customer may change it
```

`findArea` still resolves inside `side.areas`, never across a flattened
Product-wide list, so a sibling Side's Area remains unreachable rather than
merely unlikely.

## E. The selected Side with no Area

The pair *(Side selected, Area null)* is now a **representable** state of the
reducer, not an error and not a state something has to be steered away from:

```ts
function selectionForSide(placement, sideId) {
  const side = findSide(placement, sideId) ?? initialSideOf(placement);
  const area = initialAreaOf(side);
  return { sideId: side?.id ?? null, areaId: area?.id ?? null, templateSlug: null };
}
```

`initialAreaOf` returns `undefined` for a Side with no Area, so `areaId` becomes
`null` and the Side is kept. Nothing in the reducer can trade that Side for
another.

**Presentation.** The Area field states `Không có vùng thêu.` rather than
borrowing the single-Area sentence — "Mặt này chỉ có một vùng thêu" would be a
claim the manifest never made, on exactly the Side where it is least true. Below
the picker, the bounded notice:

```text
Mặt thêu này chưa có vùng thêu khả dụng.
Hãy chọn mặt khác để tiếp tục.
```

rendered in the same empty presentation the Template list already uses
(`.studio__notice` carries the declarations of `.studio-templates__status` and
`.studio-templates__hint`, under its own block name). No new visual state was
introduced, and the `role="status"` announcement is polite rather than an alert:
this is an ordinary recoverable gap, not a failure.

The Product is **not** declared unavailable. `StudioUnavailable` stays reserved
for `studioEligible === false` and for a failed manifest read.

## F. Downstream guards

The chain closes at the missing Area, structurally rather than by a guard:

```text
placement → side → area → triple → list → detail → preview
                       ↘ codes → session
```

`tripleOf` and `codesOf` both return `undefined` without an Area, and the screen
renders the whole downstream block only when `codes !== undefined`. With no Area
selected:

| | |
|---|---|
| Template list request | not made (`useTemplateList` receives `undefined`) |
| Template detail request | not made |
| Template preview request | not made; any prior object URL already revoked by the Side change |
| Blank action | **absent** |
| Clone action | **absent** |
| Session create | impossible — no affordance and no `codes` to address it with |

Absent rather than disabled, deliberately. A disabled control is still a control,
and the guard keeping it disabled is one edit away from being wrong; a section
that does not render cannot be pressed.

## G. Side-switch cascade

Unchanged, and still one reducer transition — every transition returns a whole
state, so no render exists in which a new Side sits beside the old Area or the
old Template. On any Side change:

```text
Area re-derived on the new Side (deterministic first, or null when it has none)
Template cleared
detail and preview fall away with the Template
object URL revoked in effect cleanup
cursor chain restarts, because the new triple addresses a different query
```

If the new Side has no Area, the Area stays `null` and the downstream work stays
closed. **Nothing auto-switches again.** The customer chose this Side; the screen
keeps it, on selection and on every later reconcile.

## H. Revocation vs. presence

The correction turns on a distinction the reducer now makes explicitly:

| Manifest fact | Behaviour |
|---|---|
| Selected Side **absent** from a fresh read (retired/removed) | selection re-derived — the Side is gone, so keeping it is impossible |
| Selected Side **present** but its Areas all retired | Side kept, Area cleared, downstream closed |

```ts
case 'reconcile': {
  const side = findSide(action.placement, state.sideId);
  if (side === undefined) return selectionForSide(action.placement, null);
  const area = findArea(side, state.areaId);
  if (area !== undefined) return state;
  const next = selectionForSide(action.placement, side.id);
  return isSameSelection(next, state) ? state : next;
}
```

`isSameSelection` is new: it keeps the state identity stable across the repeated
reconciles of a Side that is legitimately Area-less, so a manifest re-read does
not churn a render. Revocation awareness is preserved exactly as accepted — every
manifest read re-derives, so a retirement wins at the next authoritative read
without any polling.

## I. Focused tests

`apps/storefront/test/unit/studio-model.test.ts` and
`apps/storefront/test/components/studio-bootstrap.test.tsx`. Every prior S01 test
is preserved; the one test asserting the rejected refinement was inverted rather
than deleted, so the file now proves the opposite of what it used to.

| §13 | Test | Level |
|---|---|---|
| 1 | first active Side has zero Areas, second has Areas → **first** Side selected | model + component |
| 2 | that Side → `selectedArea = null` | model |
| 3 | zero-Area Side → no Template-list request | component |
| 4 | zero-Area Side → no detail and no preview request | component |
| 5 | zero-Area Side → no BLANK and no CLONE affordance, so no create | component |
| 6 | customer selects the second Side with one Area → it auto-selects | model + component |
| 7 | after moving → exact-triple Template request begins normally | component |
| 8 | customer selects the zero-Area Side again → UI keeps it, does not bounce | model + component |
| 9 | one active Side with one Area → unchanged auto-selection | model (pre-existing) |
| 10 | several usable Sides → canonical first remains initial | model |
| 11 | Side retired during reconcile → existing revocation behaviour holds | model (pre-existing) |
| 12 | Side stays active but Areas empty → Side kept, Area clears | model |

Two further component assertions guard the copy: the Product-level refusal must
not appear, and the "only one Area" sentence must not be borrowed.

```text
Test Suites: 29 passed, 29 total
Tests:       309 passed, 309 total     (was 297 — twelve added, none removed)
```

## J. Checker and its mutation proof

`tools/check-app3-s01-runtime.mjs` gained one banned shape set and five rules.

The gate rules on the **shape** of the selection, not on a selection outcome —
because every fixture in which each Side has an Area passes with the refinement
in place, so an outcome test would have proved nothing:

```js
const SIDE_SKIPPING_SELECTION = Object.freeze([
  /\.(find|filter)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.areas\.length\s*[>!=]/,
  /\.(find|filter)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.areas\[0\]/,
  /firstStudioUsableSide/,
  /firstSideWithArea/,
  /usableSides/,
]);
```

Run against `featureCode` — the whole feature with prose stripped, not a named
file list — so a new file cannot reintroduce the skip where the rule is not
looking. Positively, it requires `return orderedSides(placement)[0];` exactly:
asserting the expression rather than a property of its result is the point, since
every skipping variant is written by narrowing the list first.

Four further rules: `areaId: area?.id ?? null` must exist (a Side with no Area
must stay representable); reconcile must keep a still-present Side; the screen
must close the downstream chain on `codes === undefined`; and the Side-level gap
must not be routed into the Product-level refusal.

`tools/check-app3-s01.test.mjs` — **45 cases, 0 failures** (was 37; eight added).
The load-bearing one restores the refinement the delivered code actually shipped:

```js
placementModel: file('placementModel').replace(
  'return orderedSides(placement)[0];',
  'const sides = orderedSides(placement);\n  return sides.find((side) => side.areas.length > 0) ?? sides[0];',
),
// → fails on 'canonical first row' AND on 'narrows the Side list'
```

with the same skip re-expressed as a named helper and as a `filter` in a **new
file the harness never names**, plus mutations for the reducer's null Area, the
kept Side, the open downstream chain, the Product-level mislabelling and the
missing explanation. Each fails the gate.

One honest note: the case for the missing explanation initially passed a broken
gate, because `.replace` left `STUDIO_COPY.sideWithoutAreaHint` behind and the
prefix still matched. Fixed with `replaceAll` in the test, and recorded here
rather than quietly corrected — a mutation that does not actually mutate is a
regression test that proves nothing.

## K. Browser journey and network proof

Real stack: `embroidery-dev-{gateway,storefront,api,postgres,minio}`, the real
Nginx gateway, the real `APP3-B01`/`B05`/`B05A`/`B07` routes.

**Fixture** (`CMD-SMOKE-APP3-S01-C1-FIXTURES`, layered on the S01 fixtures) adds
one active Side at `display_order = -1` with no Embroidery Area. The manifest the
proof ran against, read straight from the public route:

```text
studioEligible true
-1  mat-truoc-c1  Mặt trước  areas=0     ← canonical first, unusable
 0  kkkk          kkk        areas=2
 1  mat-sau       Mặt sau    areas=1
```

That is §2's premise standing in front of a real API: eligible through a later
Side, with the first row unusable.

| § | Step | Result |
|---|---|---|
| 1 | open `/san-pham/a03-live-check-redirect/thiet-ke` | 200, server-rendered shell |
| 2 | Side A initially selected | `Mặt trước` selected in the Side control |
| 3 | Area has no value; bounded message appears | Area field reads `Không có vùng thêu.`; notice: `Mặt thêu này chưa có vùng thêu khả dụng. Hãy chọn mặt khác để tiếp tục.` |
| 4 | zero Template request for Side A | **1 API request total** — the placement manifest |
| 5 | no Blank/Clone usable for Side A | `.studio-start button` count = **0**; Template section absent from the DOM |
| 6 | choose Side B manually | `kkk` selected |
| 7 | its deterministic Area selects | first Area of that Side auto-selected |
| 8 | exact-triple Template list appears | `GET /api/public/design-templates?productId=…&productSideId=019fe415…&embroideryAreaId=019fe491…&limit=12` → 200, 12 rows |
| 9 | normal bootstrap still works | `POST /api/public/design-sessions` → **201**, session panel with server expiry |
| 10 | select Side A again | notice returns, Area control absent |
| 11 | UI remains on Side A, no auto-jump | `selectedSideLabel = "Mặt trước"` after the reselect and after reconcile |

**Network assertions.** The complete `/api/` log for the run:

```text
GET  /api/public/products/a03-live-check-redirect/placement   200
GET  /api/public/design-templates?…&limit=12                  200
POST /api/public/design-sessions                              201
```

No Template request while `selectedArea = null`; no Session create while
`selectedArea = null`; no new backend route; no Admin API; no `APP3-B06C`; no
autosave; no Session asset operation; no storage URL, bucket, key or presign.

**Persistence assertion**, evaluated in the page: `localStorage` 0 keys;
`sessionStorage` 4 keys, all `__next_debug_channel:*` from Next dev tools and
none the Studio's; `document.cookie` empty (the Session secret is `HttpOnly`);
`location.search` empty.

**Viewports.** 1440 and 390 fully; 1024 as a no-overflow regression, unchanged
CSS. `documentElement.scrollWidth > innerWidth` false at all three. Side control
height 44px at 390 — the shared touch-target minimum on a real `<select>`.

**Console.** Two errors, neither S01-attributable and both artefacts of the
proof environment: a missing `/favicon.ico`, and the Turbopack HMR WebSocket
failing to upgrade through the temporary `localhost` server block. Zero
S01-attributable errors.

The Session half again required `CMD-SMOKE-APP3-S01-ORIGIN` (§12 of the
instruction): the accepted `Sec-Fetch-*` and `__Host-` cookie requirements are
only satisfiable on a potentially-trustworthy origin. Applied and **restored**;
no guard disabled, no cookie injected, no secret read, no tracked `.env` written.
Both fixtures reverted — the development database is back to zero published
Products and the extra Side is retired.

## L. Unchanged S01 behaviour

Preserved and re-proved by the full suite and the nine named gates: the canonical
route and the server-shell/client-island split; the shared Storefront shell; the
public Product detail authority; the public placement manifest as the sole
Side/Area authority; exact `product + side + area` compatibility carried in the
query key; B05 keyset continuation; one detail read for the one selected
Template; the B05A contextual preview and its Blob/object-URL lifecycle;
text-only Template validity; explicit `BLANK` and `CLONE_TEMPLATE` with no
clone→blank fallback; the P04 Session snapshot; zero browser persistence of a
Session identity; the in-memory `sessionId` resume handoff; the safe expired
state; responsive behaviour; accessibility semantics; no S02 renderer; no B06C;
no autosave.

`studioEligible` keeps its Product-level meaning exactly: `false` still blocks
the whole bootstrap, and `true` still never implies that every active Side is
individually bootstrap-ready.

The resume finding is not reopened. `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01`
stays **OPEN**.

## M. Contract immutability

```text
OpenAPI              35 paths / 40 operations / 83 schemas   unchanged
migrations           34                                      unchanged
root scripts         30                                      unchanged
generated client     tree hash d9aac2b3bfb3…4735b9           unchanged
curated api-client   unchanged
API runtime          untouched
worker               untouched
database schema      untouched
dependencies         untouched (no pnpm install)
```

## N. Changed files

| File | Δ |
|---|---|
| `apps/storefront/src/features/design-studio/model/studio-placement.ts` | 20 |
| `apps/storefront/src/features/design-studio/model/studio-selection.ts` | 23 |
| `apps/storefront/src/features/design-studio/model/studio-copy.ts` | 5 |
| `apps/storefront/src/features/design-studio/components/studio-screen.tsx` | 97 |
| `apps/storefront/src/features/design-studio/components/studio-placement-picker.tsx` | 15 |
| `apps/storefront/src/features/design-studio/styles/design-studio.scss` | 23 |
| `apps/storefront/test/unit/studio-model.test.ts` | 103 |
| `apps/storefront/test/components/studio-bootstrap.test.tsx` | 95 |
| `tools/check-app3-s01-runtime.mjs` | 56 |
| `tools/check-app3-s01.test.mjs` | 101 |
| `tools/check-app3-s01.mjs` | 2 |
| `tools/app3-accepted-paths.mjs` | 4 |
| `tools/smoke-app3-s01-c1-fixtures.mjs` | 114 (new) |
| `tools/smoke-app3-s01-fixtures.mjs` | 7 |
| `docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md` | 16 |
| `docs/implementation/SCOPED_COMMAND_INDEX.md` | 7 |

16 files, +619 / −69. Every runtime file stays under 400 lines and every test
file under 600 (largest: `studio-bootstrap.test.tsx` at 535).

`app3-accepted-paths.mjs` gained one entry because S01's legitimate status line
changed to `COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW`; the world-aware gates
still read the checkpoint as delivered, which is correct — the route, the
operations and the bans all still hold.

## O. Validation

Every command run, with its result:

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/storefront exec jest` | 29 suites / **309** tests, 0 fail |
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `pnpm --filter @embroidery/storefront lint` | PASS |
| `pnpm --filter @embroidery/storefront build` | PASS — `/san-pham/[slug]/thiet-ke` dynamic |
| `node tools/check-app3-s01.mjs` | PASS |
| `node --test tools/check-app3-s01.test.mjs` | **45/45** |
| `node tools/check-app3-b05a.mjs` · `--test` | PASS · 52/52 |
| `node tools/check-app3-b05.mjs` · `--test` | PASS · 63/63 |
| `node tools/check-figma-design-index.mjs` · `--test` | PASS · 31/31 |
| `node tools/check-storefront-route-authority.mjs` · `--test` | PASS · 21/21 |
| `node tools/check-storefront-product-detail-authority.mjs` · `--test` | PASS · 34/34 |
| `node tools/check-app3-g01.mjs` | PASS |
| `node tools/check-app3-b01.mjs` | PASS |
| `node tools/check-app3-b07.mjs` | PASS (slow — minutes, not hung) |
| `pnpm --filter @embroidery/api-client typecheck` · `exec jest` · `check:generated` | PASS · 44/44 · tree hash unchanged |
| `pnpm lint` (global control) | 24/24 |
| `pnpm format:check` · `git diff --check` | clean |
| browser correction proof (§K) | 11/11 steps |

Not run, per the instruction: `pnpm quality`, the API suite, DB integration, the
worker suite, repository E2E, OpenAPI generation, api-client generation, Figma
mutation, `pnpm install`, `APP3-B06C`, `APP3-S02`.

## P. Commit A

```text
86edc3015ec209111611c49ff828fa303675dff9
fix(storefront): restore canonical Studio placement selection
```

Contains only the reducer/model correction, the bounded presentation and copy
adjustment, the focused tests, the checker and its regressions, the correction
fixture tool, and current status/docs. No API, database, worker, OpenAPI,
generated client, Figma, S02, B06C or dependency change.

## Q. Tree and push state

Branch `production`. Working tree clean after Commit B. Commit A immediately
precedes Commit B. Nothing pushed; no amend, squash or rebase. No test re-run
after Commit B.

## R. What review owns next

```text
APP3-S01-C1 = COMPLETE — REVIEW_DELIVERED
APP3-S01    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
APP3-S02    = BLOCKED_BY_APP3-S01_CORRECTION_REVIEW
APP3-B06C   = READY — NOT STARTED
```

Neither status is self-accepted. `APP3-S02` does not open until human review
records `APP3-S01 = COMPLETE — REVIEW_ACCEPTED` and
`APP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED`. `APP3-B06C` remains JIT for
`APP3-S06` and is not the next checkpoint.
