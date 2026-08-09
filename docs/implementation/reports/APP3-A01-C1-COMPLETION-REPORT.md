# APP3-A01-C1 — Render the authorized Side background — Completion Report

```text
APP3-B02A  = COMPLETE — REVIEW_ACCEPTED
APP3-A01-C1 = COMPLETE — REVIEW_DELIVERED
APP3-A01    = COMPLETE — REVIEW_DELIVERED

Commit A = 2f86ad1dc0f4fe6aee6366923de8021f6ea939e5
Commit B = this report
```

One correction. There is no A01-C2.

---

## A. Entry state and B02A acceptance

The operator accepted `APP3-B02A` (Commit A `45a8a68`), which delivers
`GET /api/admin/products/{productId}/sides/{sideId}/background` as
`adminProductSideBackground_get` — Admin-authenticated, Product+Side authorized,
supporting an unpublished Product, streaming an editor-safe `NORMALIZED` raster
from private storage with `no-store` and no presign or storage identity.

That closed the backend half of the single A01 blocker:

```text
A01_REVIEW_BLOCKER = ADMIN_SIDE_BACKGROUND_PREVIEW_UNAVAILABLE
```

This correction closes the frontend half. Recorded as
`A01_CORRECTION_BLOCKER = CLOSED_BY_APP3-A01-C1`.

---

## B. Correction scope

Changed: the curated api-client export, one new feature service, one new hook,
the preview composition, the screen's wiring, the save-success invalidation, the
copy catalog, and the A01 gate.

Unchanged and verified unchanged: placement GET/PUT semantics, the
`expectedUpdatedAt` CAS, the draft model, retirement semantics, Side/Area
mapping, validation authority, responsive composition, mobile read-only
behaviour, the Admin shell, backend runtime, database and Figma. All 86 existing
A01 tests still pass untouched.

---

## C. Generated client consumption

`adminProductSideBackgroundGet` was added to the **handwritten** curated surface
of `@embroidery/api-client`. `src/generated/` was not edited and nothing was
regenerated.

`publicProductSideBackgroundGet` stays withheld, and the gate asserts that
absence — it requires a `PUBLISHED` Product, which is precisely the condition
placement authoring does not satisfy.

The operation is consumed in **exactly one** module,
`services/side-background.service.ts`, asserted mechanically. No component names
it, no route string is spelled in application code, and no raw Axios or `fetch`
appears anywhere in the feature.

---

## D. Blob and object-URL lifecycle

Server state and browser resource are kept apart on purpose: TanStack Query owns
the `Blob`; an effect owns the object URL.

Revocation happens through the effect **cleanup**, so one mechanism covers all
three cases the directive lists — Side change, replacement blob, unmount. The
gate asserts the cleanup shape rather than the mere presence of a `revokeObjectURL`
call, because a revoke sitting outside the cleanup would satisfy a naive rule and
still leak.

`gcTime: 0` carries B02A's `no-store` intent onto the browser: the entry is
dropped the moment nothing observes it, so protected media does not outlive the
screen, and returning to a Side re-authorizes against the server rather than
trusting a snapshot.

Tests prove creation *and* revocation by installing recording
`createObjectURL`/`revokeObjectURL` — jsdom implements neither, so the stubs are
both a necessity and the assertion mechanism.

---

## E. SVG composition

```tsx
<svg viewBox="0 0 {imageWidthPx} {imageHeightPx}">
  <image href={objectUrl} x={0} y={0} width={imageWidthPx} height={imageHeightPx}
         preserveAspectRatio="xMidYMid meet" aria-hidden="true" />
  …area rectangles…
</svg>
```

Declared before the areas because SVG has no `z-index` — document order *is* the
stacking. No DOM image, no inline style, no CSS custom property; the accepted
geometry authority is untouched and the gate asserts that it stayed untouched.

`meet` is the deliberate choice. `APP3-B02` states that the derivative's
intrinsic size and the Side's authored canvas are separate facts, so a mismatch
must letterbox rather than stretch — a distorted background is one an operator
would trust and author against, which is worse than a visible margin.

**Measured in the browser at 1440:** area left fraction `0.1500` against an
expected `300/2000 = 0.1500`; width `0.4500` against `900/2000 = 0.4500`. The
overlay lands on the artwork exactly.

Per §7 the placement model remains the authority for `imageWidthPx`/
`imageHeightPx`. Nothing reads decoded intrinsic dimensions, nothing rewrites the
model, and nothing auto-saves a correction. No bounded preview error is needed
because `meet` makes a dimension disagreement *safe* rather than unsafe — it can
only add margin, never misplace an area.

---

## F. Side switching

The query key is `productId + sideId` and there is **no** `placeholderData`, so a
switch has no previous data to fall back on. That is the mechanism, not a rule a
component remembers.

Verified in the browser with two visibly different images: switching Mặt trước →
Mặt sau replaced the red artwork with the blue one, with no stale frame. Verified
in jsdom by asserting the `href` changes and that the second request carries the
*new* Side id.

---

## G. Unsaved background replacement

B02A serves whatever background the **persisted** Side association names. So the
fetch is gated on `backgroundMatchesServer(side, model)` — the draft's
`backgroundAssetId` must still equal the server's for that Side.

Two distinct not-fetched states, deliberately not merged: a Side that has never
been saved has no address at all (`Lưu mặt sản phẩm để xem ảnh nền.`), while a
saved Side mid-replacement has an address that would answer with the *old* bytes
(`Ảnh nền mới sẽ hiển thị sau khi lưu.`). Collapsing them would tell an operator
mid-replacement that their Side is unsaved.

Verified in the browser: after choosing a different Asset and confirming, the old
image is **gone**, the pending notice appears, the geometry stays, and the save
bar activates. No asset-by-id preview bypass exists; the gate asserts no
asset-keyed address is constructed anywhere in the feature.

---

## H. Save-success refresh

Existing behaviour is unchanged: the PUT response becomes canonical truth, the
token refreshes, the draft re-seeds, dirty clears, and there is **no second
placement GET** — asserted.

Added: after a successful replace, only the Sides whose `backgroundAssetId`
actually moved are invalidated, computed by comparing the previous cached
snapshot to the returned model. Not a prefix invalidation — refetching every
Side's background would pull megabytes for images the operator never touched.
With no previous snapshot nothing is invalidated, because without a baseline
there is no evidence anything moved.

---

## I. Conflict preservation

Untouched. On `PLACEMENT_VERSION_CONFLICT` the local draft is retained, save
stays disabled, and reload-latest stays explicit.

The background is **not** refetched on conflict — asserted by call count. The
cached placement model does not change on a failed replace, so the background key
does not change either; the stale local draft is never made to look like it
belongs to the server's newest geometry. On reload-latest the snapshot is
replaced first and the background follows the current server Side.

---

## J. Error and security behaviour

| Outcome | Presentation |
|---|---|
| `404` / `ADMIN_SIDE_BACKGROUND_NOT_FOUND` / `_INVALID` | bounded unavailable state, **no retry** |
| `503` / `_UNAVAILABLE` | retryable preview failure |
| transport failure | retryable preview failure |
| `401` | left to the existing Admin auth/session handling |

`unavailable` and `retryable` are distinct on purpose: a `404` means the server
will not resolve a background at that address at all, so offering a retry would
invite the operator to keep clicking at nothing.

A background failure never erases the placement draft and never disables
hierarchy navigation — both asserted. No storage key, bucket, asset id,
derivative name or provider message reaches the DOM; verified in jsdom against a
message naming a bucket and a key, and again in the browser.

---

## K. Responsive behaviour

| Viewport | Verified |
|---|---|
| 1440 | real background loaded, area selected, geometry exact, unavailable state |
| 1280 | `scrollWidth === clientWidth === 1265`, ratio `1.333`, area fraction `0.1500`, three regions |
| 390 | read-only notice, **zero** background requests |

The 390 case is proven from the browser's Resource Timing entries rather than
inferred: the editor is not mounted, so no request exists to cancel.

---

## L. Accessibility

The background is `aria-hidden` and not focusable — contextual artwork, not a
control. The area `<g role="button">` elements remain the interactive, focusable
layer. Loading and error states use the existing A01 status pattern:
`role="status"` for information, `role="alert"` only for the two real failures,
because a background still loading is not worth interrupting anyone for. No
filename is ever exposed; the label is derived from the Side's display name.

---

## M. Focused tests

**23 new** in `placement-background-render.test.tsx`, **109 total** across the
placement suites, **628** across the Admin app — all passing.

New coverage: curated export present · one consuming service · request carries
both ids · Blob → object URL · SVG image in the Side pixel space · painting order
· geometry stays in SVG attributes · artwork not focusable · Side switch never
shows the previous image · revoke on switch, on replacement, on unmount · 404
unavailable without retry · 503 and transport retryable · draft preserved on
failure · no storage detail rendered · pending replacement draws nothing · no
asset-keyed bypass · only the affected Side invalidated · no second placement
read · conflict does not refetch · mobile fetches nothing · retired Side still
non-editable.

One existing test changed meaning legitimately: it asserted that *no* background
was rendered. It now asserts what remains true — the **picker** tiles are still
placeholders, because B02A delivers by Product+Side and there is no asset-by-id
route to draw a thumbnail from.

---

## N. Browser visual proof

Production Admin build against a deterministic local stub that generates two real
2000×1500 PNGs, so the review looked at decoded pixels rather than a mock.

Reviewed: 1440 loaded · 1440 area selected over the real image · Side A → Side B
switch with no stale flash · 1440 background unavailable · 1440 pending
replacement · 1280 alignment and no overflow · 390 no request.

**The review earned one fix nothing else could have found.** A brand-coloured
area outline is nearly invisible against artwork of a similar hue — and the
operator authoring on that artwork is exactly who needs to see it. Outlines now
carry a light under-stroke and labels use `paint-order: stroke fill`, so both stay
legible over arbitrary photographs.

Not verified in the browser: the post-save background refresh, because the stub
answers `409` on PUT to preserve the accepted conflict review. It is asserted in
jsdom by call inspection, which is the stronger check for "only the affected
Side".

All artifacts, screenshots and the stub were removed before Commit A, and `.next`
was rebuilt without the stub URL inlined.

---

## O. Checker evolution

```text
node tools/check-app3-a01.mjs                      185 assertions   PASS  (was 132)
node --test tools/check-app3-a01.test.mjs          36 / 0
node --test tools/check-app3-a01-background.test.mjs 16 / 0
```

One gate, mode-aware across both worlds and asserted in **both directions**:
before C1 the blocker is open and none of the background code exists; after it
the blocker is closed and every rule binds. A tree that silently reverted the fix
fails, and so does one carrying the fix without the record.

New rules: B02A accepted · curated export present · public route still withheld ·
exactly one consuming service · no address built · object URL created *and*
revoked *in the effect cleanup* · `gcTime: 0` · no `placeholderData` · SVG image
in the Side pixel space · no DOM image or CSS positional geometry · artwork not a
control · fetch gated on the persisted association · mobile cannot reach the
fetch · no asset-keyed address anywhere.

The gate crossed the 400-line source limit and its tests the 600-line test limit,
so the C1 rules and their regressions moved into `check-app3-a01-background.mjs`
and `check-app3-a01-background.test.mjs`. Still **one** command and one verdict —
the same entry-point-plus-rule-module shape `check-app3-b02.mjs` already uses.

One regression initially failed for the right reason: the mutation replaced the
first `<image` in the file, which lives in a **doc comment**, leaving the JSX
untouched — the gate was correct to pass. Anchored to the element.

---

## P. OpenAPI and generated-source immutability

```text
git status --porcelain packages/contracts/openapi packages/api-client/src/generated
  → 0 files
```

Expected contract changes: 0. Actual: 0. Neither artifact was generated.
`openapi:check` and `check:generated` both report up to date (client tree hash
`9b3f4a39…dca88920`). Only the handwritten `packages/api-client/src/index.ts`
changed.

---

## Q. Unchanged follow-ups

Carried, none touched:

```text
FU-APP3-PLACEMENT-NULLABLE-CONTRACT-01
FU-ADMIN-SHARED-DIALOG-01
FU-ADMIN-SHELL-NARROW-DESKTOP-01
FU-DESIGN-PUBLISH-DS-INPUT-01
```

Only the A01 background-preview blocker was closed.

---

## R. Changed files

**New (5):** `services/side-background.service.ts` ·
`hooks/use-side-background.ts` · `test/components/placement-background-render.test.tsx` ·
`tools/check-app3-a01-background.mjs` · `tools/check-app3-a01-background.test.mjs`

**Modified (15):** the preview, screen, mutation hook, copy, draft model, failure
model, query keys, stylesheet and picker dialog in the placement feature; one
existing background test; `packages/api-client/src/index.ts`; the A01 gate and
its tests; `SCOPED_COMMAND_INDEX.md`; the APP3 phase plan.

No backend runtime, database, worker, OpenAPI, generated-client or Figma change.

### File sizes

Largest production file 311 lines; largest test 528; gate 457; gate module 167.
Compared by **filename** against HEAD, **no file newly violates** the size policy
and the total returns to the HEAD count of 25. `tools/check-app3-a01.mjs` was
already over the limit at HEAD (426) and is now 457 — disclosed rather than left
to be discovered.

---

## S. Commit A

```text
2f86ad1dc0f4fe6aee6366923de8021f6ea939e5
fix(admin): render authorized Side background in placement preview
```

---

## T. Forward roadmap

```text
APP3-B02A   = COMPLETE — REVIEW_ACCEPTED
APP3-A01-C1 = COMPLETE — REVIEW_DELIVERED
APP3-A01    = COMPLETE — REVIEW_DELIVERED
```

Not self-marked accepted. Expected after human acceptance:

```text
APP3-A01 = COMPLETE — REVIEW_ACCEPTED
APP3-A02 = READY — NOT STARTED
NEXT_RECOMMENDED_FRONTEND_CHECKPOINT = APP3-A02
```

A02 was not implemented here.

---

## U. Validation evidence

| Command | Result |
|---|---|
| A01 + C1 placement suites | **109 passed / 8 suites** |
| full Admin suite | **628 passed / 54 suites** |
| `node tools/check-app3-a01.mjs` | PASS — 185 assertions |
| `node --test tools/check-app3-a01.test.mjs` | 36 / 0 |
| `node --test tools/check-app3-a01-background.test.mjs` | 16 / 0 |
| `node tools/check-app3-b02a.mjs` | PASS (still holds) |
| admin `tsc --noEmit` · `eslint` · `next build` | PASS |
| styling / frontend-test / frontend-build boundaries | PASS |
| `openapi:check` · `check:generated` | PASS — both unchanged |
| api-client `tsc` · `jest` | PASS (44) |
| `pnpm lint` · `pnpm format:check` · `git diff --check` | PASS |

Not run, deliberately: `pnpm quality`, backend suites, database integration, the
worker, full E2E, Figma.

**Final state:** branch `production`, working tree clean, Commit A immediately
precedes Commit B, nothing pushed.
