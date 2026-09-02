# APP12-S02-C1 — Pre-Hydration Checkout Safety · Completion Report

```text
CORRECTION   = APP12-S02-C1 — Pre-Hydration Checkout Safety
PARENT       = APP12-S02 — Ready-Made Checkout
POLICY       = CORRECTION_USED = 1 / 1 · NO C2
DATE         = 2026-09-02
```

---

## A. Verdict

```text
APP12-S02-C1     = COMPLETE
APP12-S02        = COMPLETE_AFTER_C1
```

The server-rendered checkout is no longer submittable before it is interactive.
The correction is **one new component and one stylesheet reset** — no shared
`APP4` file was touched, no contract widened, no route added. It is proved
deterministically in real Chromium by holding every Storefront script until the
test releases it, and the proof was validated against a negative control that
captured the original defect in the URL bar.

---

## B. Accepted S02 core

Preserved and re-proved in the same run, not reimplemented:

```text
route = /mua-hang/[slug] · Wave1 = true · Storefront routes = 19
publicProductVariant_list   = the current SKU / price / availability projection
APP4 contact verification   = reused, untouched
publicReadyMadeOrder_create = reused
B02 challenge-scoped idempotency = reused, unchanged
shipping fee = PENDING · final total = not fabricated
ORDER_ACCESS raw token = not exposed
success does not auto-navigate to /truy-cap/don-hang
PO-APP12-S01-A = ACCEPTED_FAIL_CLOSED_INVALID_STATE — no heuristic SKU winner
```

The three design ↔ contract reconciliations stay open against `APP12-V02` and
were **not** touched here (`FU-APP12-S02-01/02/03`).

---

## C. Root cause

Measured, not inferred.

`ContactEntryCard` (`APP4`) and the S02 delivery card are real `<form>` elements
whose `onSubmit` calls `preventDefault`. Neither declares an `action` or a
`method`:

```text
grep -n "action=\|method=" contact-verification/ui/*.tsx ready-made-checkout/ui/*.tsx
→ (no matches)
```

A `<form>` with no `action` submits **GET to the current URL**, replacing the
entire query string with its own successful controls. Before hydration the
`onSubmit` handler does not exist, so that default is what a click or an `Enter`
actually performs.

**Which controls are named, and therefore what the query becomes.** Exactly one:
the contact-kind radio group, `name={`${useId()}-kind`}`. The contact value, the
verification code and all four delivery fields carry **no `name`**, so no
customer data could ever reach a URL, a referrer or an access log. What the
defect destroyed was the customer's selection, not their privacy — an important
distinction, and it is now asserted in the component suite.

On `/xac-minh-lien-he` this costs nothing. On `/mua-hang/[slug]` the query string
*is* the purchase, which is why this is S02 correctness and not H01 debt.

---

## D. Pre-correction SSR form behaviour

Captured live, with the guard temporarily neutralised and the disabled-state
assertions relaxed, under a genuinely held hydration:

```text
NEGCTRL urlAfterClick=
  http://embroidery.local:8090/mua-hang/app12-s02-e2e-ao-thun?_R_1aqlubsnnb_-kind=EMAIL

NEGCTRL navigations=[
  ".../mua-hang/app12-s02-e2e-ao-thun?sku=278bd8b3-e1ca-4311-9526-5b2d5b523dc0&quantity=2",
  ".../mua-hang/app12-s02-e2e-ao-thun?_R_1aqlubsnnb_-kind=EMAIL"
]
```

One pre-hydration click, one real navigation, and `?sku=&quantity=` replaced by
the radio group's generated name. The server then re-resolves an address that
names no SKU and the customer lands on *"Chưa xác định được sản phẩm cần mua"*
with their selection gone.

A second negative control, with the guard neutralised but the assertions intact,
failed exactly where it should:

```text
Error: expect(locator).toBeDisabled() failed
Received: enabled
> 716 |     await expect(submitContact).toBeDisabled();
```

So the new case has teeth: it fails without the fix, for the right reason.

---

## E. Correction seam decision

```text
correction_seam = S02_LOCAL_HYDRATION_GUARD
```

| question | answer |
|---|---|
| which form submits natively? | both — `ContactEntryCard` and the S02 delivery form |
| what does SSR emit? | `<form>` with no `action`/`method` → GET to the current URL |
| which paths trigger it? | the submit button, and `Enter` in any text field |
| does APP4 expose a busy/disabled prop? | yes, `submitting` — but it also relabels the button to *"Đang gửi mã…"*, which would state that a request is in flight when none is. Rejected: §8 forbids inventing copy, and false copy is worse than none |
| can S02 contain the fix? | **yes** |
| would a shared APP4 change alter other consumers? | it would, and it is unnecessary |

`git diff` confirms the seam:

```text
apps/storefront/src/features/contact-verification  → 0 files changed
apps/storefront/src/features/custom-request        → 0 files changed
```

Because no shared `APP4` source changed, §15's conditions do not apply. The
`/xac-minh-lien-he` and `APP5` consumer suites were run anyway and pass.

---

## F. SSR / pre-hydration safety implementation

`ui/pre-hydration-guard.tsx` renders the checkout band as a **disabled
`<fieldset>`** until React's mount effect enables it.

```tsx
<fieldset className={className} disabled={!interactive} data-interactive={…}>
```

A disabled `<fieldset>` disables every descendant form control, across the
`<form>` boundaries inside it, by the HTML standard and with no script involved:

- a disabled `<button type="submit">` cannot be activated → a click submits nothing;
- a disabled text input cannot be focused or typed into → there is no control for
  implicit submission to originate from, so `Enter` submits nothing;
- a disabled control is never *successful* → even a form that did submit would
  carry none of its values.

**Why not the alternatives.** `preventDefault` is the very thing that is missing
before hydration. `pointer-events`, an overlay and "hydration is fast" are
styling and hope — the HTML on the wire would still be submittable by keyboard,
on a slow connection, with a blocked chunk, or with JavaScript disabled. A
Playwright retry would hide the defect rather than fix it.

**Why it replaces the `<div>` rather than wrapping it.** A wrapper would add a
box to a grid measured from the approved frames. The fieldset *is* the band, with
every UA style reset in the stylesheet — `border`, `margin`, `padding`, and the
one that actually matters, `min-inline-size: min-content`, which would otherwise
stop the grid shrinking below its content and reintroduce the horizontal overflow
`minmax(0, 1fr)` exists to prevent. The rendered box tree is unchanged, and the
"no sideways scroll" cases still pass at all three viewports.

**Layout shift and copy.** None of either. No customer copy was added. One
presentation rule keeps the controls at their normal colours during the hydration
window, so a checkout does not flash grey on every load; it is explicitly *not*
the safety — the `disabled` attribute is — and the cursor is left alone because
nothing is being refused, the page simply is not ready yet.

**Why the state flip cannot mismatch.** The server renders `disabled`, the
client's first render renders `disabled`, and only the mount effect flips it.
React hydrates identical markup, and the enable is an ordinary post-mount update.

---

## G. Deterministic hydration-hold test

`specs/app12/s02-prehydration.acceptance.spec.ts`, against the real stack.

```ts
await page.route('**/*.js', async (route) => {
  heldRequests += 1;
  await held;                       // parked until the case releases it
  await route.continue().catch(() => undefined);
});
await page.goto(url, { waitUntil: 'commit' });
```

No production test hook, no query flag, no build variant — the page under test is
the ordinary SSR response every visitor gets.

The helper refuses to let a case pass vacuously:

```ts
await expect(page.getByRole('heading', { name: 'Xác nhận đơn hàng', level: 1 })).toBeVisible();
await expect(page.locator('fieldset.ready-made-checkout__columns'))
  .toHaveAttribute('data-interactive', 'false');
expect(heldRequests, 'no script was intercepted — hydration was never held')
  .toBeGreaterThan(0);
```

So a green result cannot mean "hydration had already happened": the page is
observed *unhydrated* before anything is attempted.

---

## H. Click-before-hydration proof

```text
✓ a click cannot navigate, and cannot take the selection with it
```

The controls are asserted genuinely disabled, then clicked with `force: true` —
because Playwright *refusing* to click is not the proof; the browser has to be
the thing that does nothing.

```text
navigations after load        = 0
navigation requests after load = 0
pathname                      = /mua-hang/app12-s02-e2e-ao-thun   (unchanged)
sku                           = <seeded SKU>                      (unchanged)
quantity                      = 2                                 (unchanged)
READY_MADE orders created     = 0
```

---

## I. Enter-before-hydration proof

```text
✓ Enter cannot navigate either, from any field on the page
```

`Enter` is sent from the contact field and from a delivery field, via the page's
own keyboard so the keystroke really reaches the document.

```text
navigations after load = 0
pathname / sku / quantity = unchanged (quantity = 3)
READY_MADE orders created = 0
```

---

## J. URL / query / privacy proof

```text
query keys after every attempt = ['quantity', 'sku']   — exactly, nothing else
page.url() matches /-kind=|contact=|email=|@/          = false
```

No hidden `sku`/`quantity` field was added to survive a native GET (§7): the
correct pre-hydration behaviour is **not to submit**, and the boundary suite
asserts the feature contains no `type="hidden"`, no `name="sku"`/`"quantity"`,
and no `localStorage`/`sessionStorage`/`document.cookie` anywhere.

The component suite additionally asserts on the SSR string that no form declares
an `action` or `method`, and that the only named control on the page is the
contact-kind radio group.

---

## K. Post-hydration APP4 regression

```text
✓ becomes fully usable once the scripts arrive, and completes a real order
```

Hydration is **observed, not waited out** — the guard flips its own attribute
from the mount effect, so the assertion is React reporting that it has taken the
markup over:

```text
data-interactive → 'true'
contact input    → enabled
Đặt hàng button  → enabled
```

Then, on the very page that was held: real challenge issue, a real code read
through the recording adapter, real verification, verified-contact capture, the
delivery form, and one real `READY_MADE` order.

Contact-change invalidation (§16) and every other APP4 behaviour are re-proved in
the journey spec, unchanged. The full Storefront suite — which includes the
`/xac-minh-lien-he` and `APP5` consumer suites — passes at 2 330 tests.

---

## L. Successful checkout regression

All 23 live cases pass, in two spec files sharing one world:

```text
✓ viewport 1440 / 1024 / 390 · completes one real checkout end to end
✓ …and never scrolls sideways or is overlapped by the contact dock
✓ four selection fail-closed cases + malformed quantities
✓ unverified submit refused · field-bound validation · contact-change invalidation
✓ one logical order under three presses and an Enter
✓ server replay on an identical body, IDEMPOTENCY_CONFLICT on a different one
✓ truthful refusal when real stock is taken mid-checkout
✓ keyboard-only completion · S01 hand-off followed · noindex + sitemap excluded
✓ pre-hydration: click · Enter · recovery · keyboard-after-hold   ← APP12-S02-C1
```

```json
{"pre_hydration_click_navigations":0,"pre_hydration_enter_navigations":0,
 "pre_hydration_contact_in_url":false,"post_hydration_recovers":true,
 "post_hydration_keyboard":true,"double_submit_orders":1,
 "idempotency_replay":true,"idempotency_conflict_refused":true,
 "contact_change_invalidates":true,"raw_order_access_token_read":false}
```

---

## M. Keyboard / accessibility regression

```text
before hydration : Enter cannot native-submit or navigate (§I)
after hydration  : ✓ keyboard-only checkout still works after a held hydration
                   ✓ is completable from the keyboard alone (journey spec)
```

The second case types the whole delivery form and submits with `Enter` alone — no
click anywhere — and creates one real order. Focus still lands on
`#checkout-success-heading`.

A disabled control remains readable and is announced as unavailable, which is
accurate: the page is not ready yet. Nothing is hidden from the accessibility
tree, which is why `inert` was not used.

---

## N. Idempotency authority freeze

```text
S02_IDEMPOTENCY_AUTHORITY = VERIFIED_CHALLENGE_ID
API_contract_changed      = false
```

No `Idempotency-Key` header exists on `publicReadyMadeOrder_create` and none was
invented — the boundary suite asserts the feature source contains no
`Idempotency-Key` and mints no key of its own. Both proven behaviours are
unchanged in this run: the same body on the same challenge replays the same
`orderCode`, and a different body on it is refused `409 IDEMPOTENCY_CONFLICT`.

```text
logical_orders_per_retry = 1
```

---

## O. Contract / DB / Figma freeze

```text
OpenAPI            = 125 paths / 138 operations / 277 schemas   (measured, unchanged)
public operations  = 49                                          (measured, unchanged)
release matrix     = 28 STATIC_DENY / 18 STATIC_ALLOW / 3 SCOPE_GATED
migrations         = 38                                          (counted, unchanged)
DB schema          = unchanged — no migration 0039
Figma              = unchanged (FIGMA_DELTA = 0)
Storefront routes  = 19                                          (counted)
/truy-cap/don-hang = does not exist
```

No API change, no new HTTP operation, no payment UI, no Admin UI, no G03 data.

---

## P. Disposable DB hygiene

```text
commercial_validation = DISPOSABLE
disposable database   = embroidery_db7_e2e_*  (migrations 1..38)
teardown              = "cleanup verified: all E2E ports closed, disposable database dropped"
```

Shared development database, measured after the final run:

```text
shared_dev_S02C1_orders       = 0
shared_dev_S02C1_reservations = 0
shared_dev_S02C1_grants       = 0
shared_dev_S02C1_idempotency  = 0
shared_dev_S02C1_fixture_rows = 0
G03_data_created              = false
```

`seedS02Catalog` and `createS02Evidence` still refuse any database not named
`embroidery_db7_*`, including during the negative-control runs.

---

## Q. Follow-up closure

```text
FU-APP12-S02-04 = CLOSED_BY_APP12_S02_C1
```

Removed from `APP12-H01`. The three design follow-ups remain open against
`APP12-V02`:

```text
FU-APP12-S02-01  province contracted, not drawn        → APP12-V02
FU-APP12-S02-02  workshop note drawn, not contracted   → APP12-V02
FU-APP12-S02-03  success / contact-change / invalid-selection states undrawn → APP12-V02
```

---

## R. Files changed

**New (2)**

```text
apps/storefront/src/features/ready-made-checkout/ui/pre-hydration-guard.tsx
packages/e2e-testing/specs/app12/s02-prehydration.acceptance.spec.ts
packages/e2e-testing/specs/app12/support/s02-world.ts
```

**Modified (6)**

```text
apps/storefront/src/features/ready-made-checkout/ui/checkout-screen.tsx
  the band becomes <PreHydrationGuard> instead of a <div>
apps/storefront/src/features/ready-made-checkout/styles/ready-made-checkout.scss
  fieldset UA reset + the hydration-window presentation rule
apps/storefront/test/components/ready-made-checkout.test.tsx
  + the server-rendered safety block (renderToString)
apps/storefront/test/boundary/ready-made-checkout-source.test.ts
  + the guard's structural rules
packages/e2e-testing/specs/app12/s02-checkout.acceptance.spec.ts
  journeys only; world extracted; stale FU-04 comment corrected
packages/e2e-testing/playwright.config.ts
  project matches both S02 spec files
docs/implementation/reports/APP12-S02-COMPLETION-REPORT.md
  + the correction notice (original evidence untouched)
```

**Unchanged, deliberately**

```text
apps/storefront/src/features/contact-verification/**   (shared APP4)
apps/storefront/src/features/custom-request/**         (APP5 consumer)
packages/api-client/**                                 (no contract change)
```

---

## S. File-size evidence

```text
node tools/check-file-size.mjs --paths \
  apps/storefront/src/features/ready-made-checkout apps/storefront/src/app/mua-hang \
  apps/storefront/test/components/ready-made-checkout.test.tsx \
  apps/storefront/test/boundary/ready-made-checkout-source.test.ts \
  packages/e2e-testing/specs/app12

→ Scoped file-size check passed (30 file(s), 1 above the review threshold).
  REVIEW  specs/app12/support/s02-world.ts: 316 lines (review threshold 300, hard 400)

node tools/check-scss-file-size.mjs apps/storefront/src/features/ready-made-checkout/styles
→ SCSS file-size check passed (4 stylesheet(s), 0 above the review threshold).
```

The C1 cases took the S02 spec to **923 lines**, past the 600-line test hard
limit. It was split **by responsibility**, not by line count: the journeys spec
asks what a customer can do once the page is interactive (479), the pre-hydration
spec asks what the page does before it is (255), and the world they share — the
catalog env, the approved copy, the real APP4 lane, the evidence reader — sits in
one module (316) so the two files cannot drift into two different ideas of what a
verified contact is.

---

## T. Validation

| command | result |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | PASS |
| `pnpm --filter @embroidery/storefront lint` | PASS |
| `pnpm --filter @embroidery/storefront test` | PASS — 126 suites, **2 330** tests |
| `pnpm --filter @embroidery/storefront build` | PASS — 19 routes, `/mua-hang/[slug]` dynamic |
| `pnpm --filter @embroidery/e2e-testing typecheck · lint` | PASS |
| `node tools/check-app-scss.mjs storefront` | PASS |
| `node tools/check-scss-file-size.mjs …` | PASS |
| `node tools/check-file-size.mjs --paths …` | PASS |
| `node tools/check-styling-boundaries.mjs` | 25 violations — baseline-neutral, none in `ready-made-checkout` |
| `node tools/check-storefront-route-authority.mjs` | PASS |
| `npx prettier --check <9 changed files>` | PASS |
| `pnpm --filter @embroidery/e2e-testing e2e:app12:s02` | **PASS — 23/23**, database dropped |
| negative control (guard neutralised) | pre-hydration case **FAILS**, and the original defect is captured in the URL |

The S02 component suite grew from 17 to 21 cases and the boundary suite from 23
to 27. Not run, deliberately: no full monorepo aggregate, no Admin suite, no
worker suite, no global UAT, no performance, no Figma write.

---

## U. Parent report correction notice

Added at the head of `APP12-S02-COMPLETION-REPORT.md`, with the original evidence
left intact:

```text
FU-APP12-S02-04 was rejected as deferred H01 debt.

The native pre-hydration GET can destroy SKU/quantity state on the new Wave-1
checkout route, so it belongs to S02 correctness.

APP12-S02-C1 makes the server-rendered pre-hydration form non-destructive and
proves it deterministically in real Chromium.
```

---

## V. Roadmap

```text
ROADMAP_STATUS  = LOCKED
ROADMAP_LOCK    = LOCKED
CHECKPOINTS     = 38
CORRECTION_USED = 1 / 1   (NO C2)

APP12-S02 = COMPLETE_AFTER_C1
APP12-S03 = NEXT
```

`APP12-S03` is **not** started. `/truy-cap/don-hang` does not exist, no
`ORDER_ACCESS` token is exposed anywhere, and no payment, QR, evidence or Admin
surface was implemented.
