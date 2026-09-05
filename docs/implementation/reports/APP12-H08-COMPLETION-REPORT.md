# APP12-H08 — Accessibility and Compatibility (Wave 1) — Completion Report

## A. Verdict

```text
APP12-H08 = COMPLETE
APP12-V01 = NEXT
CORRECTION_USED = 0 / 1
```

Everything §1 scopes was audited on a running production-mode stack, against a
**real** commercial universe: a real purchasable catalog, a real keyboard-driven
checkout, a real `ORDER_ACCESS` surface and a real operator working the same
order from the fee to completion. Nothing was proved on a fixture-rendered page.

The headline is that the delivered Wave-1 surfaces are in unusually good
accessibility condition — the automated WCAG 2.2 AA scan is **clean on every
audited screen and every audited state**, the target-size and reflow gates pass
at every width including 200 % zoom, and every one of the three engines can
complete the work. The four defects H08 found are all of one kind: **things a
screen reader is never told**. Each was found by doing something no existing
test did, and each is fixed with a test that fails at HEAD.

Five things this checkpoint found that its own brief did not predict:

1. **The shared modal frame leaked the keyboard out of every secure dialog.**
   `ModalFrame` puts initial focus on the dialog *heading*, which carries
   `tabIndex={-1}` and is therefore excluded from the list its trap cycles. At
   the one moment every customer starts from, the active element was neither
   `first` nor `last`, both edge branches were skipped, and `Shift+Tab` was left
   to the browser — which walked backwards out of the dialog and into the page
   behind the scrim. Five secure screens carry this frame, including the Wave-1
   `STEP_UP` dialog that stands between a customer and a payment. The existing
   suite could not have caught it: it only ever pressed `Tab` from a *control*.
2. **A fourth contrast token, beyond the three `PO-APP12-004` already owns.**
   `$color-status-warning` on `$color-background-secondary` measures **2.87:1**
   on the secure-link *unavailable* card — the screen a customer with a dead
   payment link actually meets. H08's contrast rule is mechanical rather than a
   list, so it found this rather than pattern-matching the three known values.
3. **The E2E browser tier never builds.** `run-e2e.mjs` starts the apps with
   `next start`, which serves whatever `.next` is already on disk. A source fix
   is invisible to every browser project until someone builds by hand, and the
   run passes on stale code while reporting success. This cost two full runs
   before it was diagnosed, and it is the same class of trap `APP12-A02-C1`
   recorded as "a stale build".
4. **The whole browser matrix runs on the host.** Every project in
   `playwright.config.ts` routes Firefox and WebKit to a Linux container on the
   reasoning that they have no `--host-resolver-rules`. That reasoning is stale:
   `LOCAL_DEVELOPMENT.md` §4 makes the two gateway hostnames a **required**
   one-time hosts-file entry, and a hosts file resolves for every process
   whatever engine it is. Verified in both engines before a line of the matrix
   was written — which is what let these projects share the run's world at all,
   since the container copies `specs/` and nothing else.
5. **The Admin verification dialog calls a Ready-Made payment a deposit.** Its
   title is `Xác nhận đã nhận tiền cọc` on an order that `BR-029` gives exactly
   one `FULL` obligation and no deposit at all. Operator-facing copy, so
   `V01`/`V02`'s — recorded, not rewritten.

No business capability, route, API operation or migration was added. Nothing was
deployed, no `G03` data was created, and nothing was pushed.

---

## B. H07 PO reconciliation

```text
APP12-H07 = COMPLETE — PO PASS      unchanged, not reopened
APP12-H06 = COMPLETE — PO PASS      unchanged, not reopened
```

The Product Owner's routing in §12 is adopted verbatim and **nothing on it was
implemented here**:

| Follow-up | PO routing | H08 action |
| --- | --- | --- |
| `FU-APP12-H07-01` | `CLOSED_SUPERSEDED_BY_H07_CANONICAL_RUNBOOKS` | none — closed |
| `FU-APP12-H07-02` | → `APP12-E01` (disposable harness cleanup) | none |
| `FU-APP12-H07-03` | → `APP12-E01` (**HIGH**, half-started worker) | **none** — see below |
| `FU-APP12-H07-04` | → `FU-APP12-H02-05` / `R01` prerequisite | none |
| `FU-APP12-H07-05` | → `APP12-E01` (**WAVE-1 RELEASE BLOCKER**) | none |

**One contradiction, reported rather than silently resolved.** `APP12-H07`'s own
§ follow-up table assigns `FU-APP12-H07-03` to **`APP12-H08`**. The Product
Owner's instruction for this checkpoint reassigns it to **`APP12-E01`** and
forbids H08 from touching worker lifecycle work at all. The PO routing wins, and
the H07 report is deliberately **left as written** — it is that checkpoint's own
evidence record, and editing its table to match a later decision would be
reopening H07 to make a document tidy. A reader who follows the H07 table alone
would look in the wrong place, which is exactly why it is stated here.

No worker source, no notification adapter, no provider integration and no
`bootstrap()` path was read for the purpose of changing it.

---

## C. Accessibility preflight

The preflight was a source audit before any browser was opened, over the
surfaces §3 names. What it found is that this repository has been building
accessibly on purpose for a long time, and the audit's job was therefore to find
the seams rather than the gaps.

**Already correct, verified and not touched:**

| Surface | What is already right |
| --- | --- |
| Storefront shell | skip link, one `main`, one `contentinfo`, named nav landmarks that differ between bar and drawer, `aria-current="page"`, unrouted items as `aria-disabled` text rather than dead anchors |
| Storefront drawer | `role="dialog"` + `aria-modal`, fully-managed Tab cycle, `Escape`, scroll lock, unmounted when closed, focus returned by the trigger *synchronously* rather than by the trap's unmount |
| Search affordance | presentational and non-focusable, with a screen-reader-only note — never a fake control |
| `BrandSymbol` | decorative by default; a `label` only when the symbol is the sole carrier |
| Purchase panel | real `<fieldset>`/`<legend>`/`<input type=radio>`, a real `type=number` with `min`/`max`/`step`, named step buttons, a genuine `disabled` state |
| Checkout field | real `<label for>`, `aria-describedby` for hint **and** error, `aria-invalid`, error in a `role="alert"`, `useId` so nothing collides |
| Delivery card | one `<fieldset>` with the drawn heading as its `<legend>`, standard `autocomplete` tokens on all four fields |
| Pre-hydration guard | a **disabled `<fieldset>`** in the server HTML — markup, not a handler |
| Secure order | one `h1` owned by the authorized branch, polite live regions for every settled state and every async step, status pills that are symbol + label + colour and never colour alone, QR alt that describes purpose, copy buttons named for what they copy |
| Admin shell | skip link, one `main`, named nav landmarks, identity/logout in the drawer on compact, brand words visually hidden but **in the tree** |
| Admin queue | a real `<table>` with `<caption>`, `scope="col"`, `scope="row"` on the order code, two `<fieldset>` filters of native checkboxes, explicit row links rather than a clickable row |
| `PaymentField` | `<label for>` with the required marker *inside the label*, `aria-describedby`, `aria-invalid`, deliberately no `type=number` |
| `PaymentDialog` | focus to the first control, both Tab edges handled, `Escape`, focus restored |
| Motion | every `@keyframes` consumer wrapped in the `motion-safe` mixin |

**Existing accessibility tooling: none.** No `axe`, no `jest-axe`, no
`@axe-core/playwright`, no lint plugin. §10 permits a focused test-only
integration when none exists, and that is what was added — as a devDependency of
`@embroidery/e2e-testing` alone. No application, shared package or runtime
bundle references it.

**Shared primitives recorded before anything was added:** `ModalFrame`
(`shared/dialog`, promoted by `APP12-H01`), `useFocusTrap` + `useScrollLock`
(one copy per shell), `CheckoutField`, `PurchaseOptionFieldset`, `PaymentField`,
`PaymentDialog`, `OrderStatusPill`, `AdminStatusBadge`, `OrderNote`. Every fix
below lands in one of these, which is why four one-line changes cover every
screen in scope.

---

## D. WCAG scope matrix

Target: **WCAG 2.2 AA**. Materially applicable criteria only, as §2 requires.

| SC | Level | Verdict | How it was decided |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | PASS | axe `image-alt`/`role-img-alt` clean; every `alt` on a Wave-1 surface read by hand (§O) |
| 1.3.1 Info and Relationships | A | PASS | landmark/heading skeleton asserted per screen; table header/cell relationships asserted structurally |
| 1.3.2 Meaningful Sequence | A | PASS | the keyboard journeys *are* the sequence — every control reached by `Tab` in reading order |
| 1.3.5 Identify Input Purpose | AA | PASS | all four delivery fields carry a standard `autocomplete` token, asserted live |
| 1.4.1 Use of Colour | A | PASS | every status pill asserted to carry a word after its decorative glyph is removed, in **7** order states |
| 1.4.3 Contrast (Minimum) | AA | **FAIL — routed to `APP12-V02`** | measured mechanically on every screen and width; every failure is two locked tokens meeting (§K) |
| 1.4.4 Resize Text | AA | PASS | covered by the 200 % reflow measurement |
| 1.4.10 Reflow | AA | PASS | 0 px horizontal overflow at 1440/1024/390 and at both 200 % viewports, on every audited route |
| 1.4.11 Non-text Contrast | AA | reviewed | axe has no rule; focus indicators measured as a real before/after difference (§F) |
| 1.4.12 Text Spacing | AA | reviewed | no fixed-height text container found in the audited surfaces |
| 2.1.1 Keyboard | A | PASS | both critical journeys completed with the keyboard alone, zero clicks on any control under test |
| 2.1.2 No Keyboard Trap | A | PASS **after fix** | `FIX-1`; page-level walks asserted to keep moving, modal walks asserted to stay inside |
| 2.4.1 Bypass Blocks | A | PASS | skip link is the first tab stop on both shells |
| 2.4.2 Page Titled | A | PASS | owned and proved by `APP12-H06`; not re-litigated |
| 2.4.3 Focus Order | A | PASS | the journeys assert the order they walk; dialog reading order and tab order asserted to agree |
| 2.4.6 Headings and Labels | AA | PASS | exactly one `h1` per screen, no skipped level, every field's label read from the accessibility tree |
| 2.4.7 Focus Visible | AA | PASS | measured as a computed-style difference at every journey-carrying stop |
| 2.4.11 Focus Not Obscured (Min) | AA | reviewed | the only floating element on a Wave-1 surface is the contact dock, whose non-overlap with the purchase panel `APP12-S01` already proves; no sticky header or footer exists to obscure a focused control |
| 2.5.3 Label in Name | A | PASS | no control found whose `aria-label` omits its visible text |
| 2.5.8 Target Size (Minimum) | AA | PASS | measured at 390 with **both** mechanical exceptions applied (§M) |
| 3.2.6 Consistent Help | A | reviewed | one help mechanism (the contact dock), in the same place on every route |
| 3.3.1 Error Identification | A | PASS | every invalid field asserted to point at its own error through `aria-describedby` |
| 3.3.2 Labels or Instructions | A | PASS | no placeholder stands in for a label anywhere in either journey |
| 3.3.7 Redundant Entry | A | PASS | the delivery facts are asked once; the operator restates them from the same record |
| 4.1.2 Name, Role, Value | A | PASS **after fix** | `FIX-2` — required state was not programmatically determinable |
| 4.1.3 Status Messages | AA | PASS **after fixes** | `FIX-3`, `FIX-4` |

Not applicable, with the reason: 1.2.x (no audio or video), 1.4.2 (no autoplay),
2.2.x (no client-side time limit — the reservation deadline is a server instant
that is *displayed*, never counted down), 2.3.x (no flashing), 3.1.2 (single
language), 2.5.7 (no dragging), 3.2.3/3.2.4 (single-page shell, one nav order).

---

## E. Brand-system accessibility

Every §4 item, asserted rather than looked at.

| §4 requirement | Result | Evidence |
| --- | --- | --- |
| Storefront brand link has one accessible name | PASS | header lockup exposes exactly `Nét Thêu — về trang chủ`; footer lockup exactly one; **`brand.symbols_named = 0`** |
| decorative symbol beside visible `Nét Thêu` is `aria-hidden` | PASS | 3 `BrandSymbol`s render on `/` (header production + header micro + footer micro); all 3 `aria-hidden`, none named |
| Admin compact symbol-only presentation still exposes `Nét Thêu` | PASS | `.admin-shell__brand-text` measured at 900 px: `inTree = true`, bounding box ≤ 2 px, text contains `Nét Thêu` — visually hidden, **not** removed |
| no duplicate `Nét Thêu` announcements | PASS | one brand name per lockup, and the header renders the wordmark exactly once |
| watermark outside the accessibility tree | PASS | zero elements matching `[class*="watermark"]` without `aria-hidden="true"` |
| provider icons keep provider meaning | PASS | the contact dock's `Z`/`M` marks are `aria-hidden`; the adjacent name span carries `Zalo — Mở ứng dụng bên ngoài` |
| functional icons remain functional icons | PASS | `☰`, `✕`, `⧉`, `⌕` and every pill/note glyph are `aria-hidden`; their controls carry real names |

The two-symbol header is worth a sentence because it looks like a defect and is
not: `StorefrontBrand` renders the production **and** micro variants and lets one
media query show one, because the production symbol keeps its seal ring and is
only proven readable at ≥ 48 px on a light ground. Both are decorative, so the
cost is ~300 bytes of inline SVG and **zero** extra announcements — which the
count above is what proves.

### The approved Admin compact app bar

`§4`'s five drawer requirements, all PASS, all keyboard-driven:

```text
trigger keyboard reachable        Tab reached "Mở menu điều hướng"; ring measured drawn
focus enters drawer               dialog.contains(activeElement) === true on open
focus trap works                  10 Tab presses, never left the dialog
focus returns on close            Escape → focus back on the trigger, by name
identity/logout reachable         "Đăng xuất" visible inside the drawer
hidden responsive controls        .admin-shell__bar-trail is display:none with 0 focusables left behind
no duplicate nav landmark/name    "Điều hướng chính" + "Điều hướng" — two navs, two distinct names
```

The layout was neither reverted nor redesigned. Nothing in `apps/admin`'s shell
source or stylesheet was edited by this checkpoint.

---

## F. Storefront keyboard journey

```text
Product Detail → variant → size → quantity → CTA → checkout
              → contact → code → delivery → order → secure ORDER_ACCESS surface
PASS, zero clicks on any control under test
```

Every control was reached with `Tab` and operated with `Enter` or `Space`. The
two places a value has to be typed use `keyboard.type` into whatever `Tab` has
just focused — never `fill` on a selector, because that proves a control exists
rather than that a keyboard can get to it.

| Step | Proof |
| --- | --- |
| both variant axes | `journey.axes = 2`, `journey.radios_selected = 2` — one option per group, chosen with `Space` |
| focus visible on the pill | `focus.purchase-variant-radio.drawn = true` |
| quantity control | `{min: "1", max: "60", step: "1", hasLabel: 1}` — the SKU's published availability, on the control itself |
| CTA | reached by `Tab`, named `Mua ngay`, ring drawn, `Enter` navigated to `/mua-hang/…` |
| hydration guard | waited for `fieldset[data-interactive="true"]` — the first live proof that `APP12-S02-C1`'s correction does not strand a keyboard customer |
| verification | contact typed and submitted with `Enter`; code typed and submitted with `Enter`; both card states scanned clean |
| delivery fields | 4 fields, each with a programmatic label, `aria-required="true"`, an `autocomplete` token, and no placeholder standing in for a label |
| empty submit | `journey.submit_alerts = 4` live regions published, and **every** invalid field points at its own error through `aria-describedby` |
| order created | focus landed on the confirmation `h2` (`journey.focus_after_create = "h2"`) |

The one exception to "nothing is clicked" is stated rather than hidden: reading
the verification code out of the recording adapter is the harness standing in for
the customer's inbox, exactly as `APP12-S02` and `APP12-S03` do. Everything the
customer would then do with that code is typed.

**Focus visibility is measured, not read.** At least one delivered control — the
purchase pill — draws its ring on a **sibling** (`&__option-input:focus-visible +
&__option-pill`), so reading `outlineStyle` off the focused radio reports `none`
on a control that visibly has a ring. The measurement snapshots every plausible
indicator host, blurs, snapshots again and restores focus; an audit that trusted
the attribute would have filed a false finding, which is the most expensive kind.

---

## G. Admin keyboard journey

```text
login → Orders queue → filters → order-code link → Ready-Made detail
      → shipping fee → FULL verification dialog → dispatch → completion
PASS, keyboard only
```

| Step | Proof |
| --- | --- |
| login | email field reached by `Tab` and labelled; `#staff-login-password` is `type="password"` with its own label; submitted with `Enter` from the field |
| queue table | caption present, every column header `scope="col"`, `headerlessColumns = 0`, row headers present, cells per row = columns |
| filters | first checkbox reached by `Tab` and labelled; **both** `<fieldset>`s carry a visible `<legend>` |
| into the order | the row link was reached by `Tab`, its name contains the order code, ring drawn, `Enter` opened the detail |
| fee field | labelled with the required marker inside the label, points at its own help through `aria-describedby`, no placeholder-as-label |
| empty-fee refusal | live region published, `aria-invalid="true"`, **no request made** |
| verification dialog | `role="dialog"`, `aria-modal="true"`, named by its own heading, focus inside on open |
| dialog trap | 10 `Tab` **and** 10 `Shift+Tab` presses, never left the dialog |
| dialog dismissal | `Escape` closed it and focus returned to the verify control, by name |
| the decision | three fields typed in tab order, each labelled; submit reached by `Tab` and pressed with `Enter` |
| outcome | announced in a live region, not only drawn; order `READY_FOR_DELIVERY` in the database |
| settled dialog | stays open by design (`APP12-A02-C1`), holds one control, and its trap cycles on it — asserted, then closed from the keyboard |
| dispatch + completion | both confirmations opened, focus entered each, both confirmed with `Enter`; order `COMPLETED` in the database |

The measured shape of the screens, quoted rather than paraphrased:

```text
queue caption          "Danh sách đơn hàng"        8 scoped column headers, 0 headerless
filter groups          "Trạng thái…" | "Nguồn đơn…"
fee field label        "Phí giao hàng (VND)Bắt buộc"   ← required marker inside the label
verify dialog fields   "Số tiền thực nhận* bắt buộc"
                       "Nội dung/ghi chú chuyển khoản thực nhận* bắt buộc"
                       "Ghi chú của nhân viên* bắt buộc"
verify dialog role     dialog                       focus returns to "Đối chiếu và xác nhận"
settled dialog         one stop: button "Đóng"      trap holds; closed from the keyboard
password field         type="password"              own label, never rendered in the clear
```

One of those lines is also a finding. The verification outcome announces
**`Đã xác nhận tiền cọc`** — *deposit confirmed* — on an order `BR-029` gives no
deposit at all, and the dialog's own submit is `Xác nhận đã nhận tiền cọc`. The
announcement mechanism is correct and is what §J asserts; the words are `V01`/
`V02`'s (`FU-APP12-H08-03`).

Only the customer half is setup — placing the order and opening one real payment
attempt run through the delivered checkout in their own context, because the
customer's keyboard journey is proved in §F and re-proving it here would double
the most expensive part of the run to assert the same thing twice.

Disposable synthetic data only. No real bank transfer; the merchant account is
this run's synthetic configuration and the database is dropped with the run.

---

## H. Secure-order accessibility

§6's states, and how each was reached. **Seven of the eight**, none of them
simulated:

| State | Reached by | Pill (symbol + word) | Scan |
| --- | --- | --- | --- |
| awaiting shipping fee | the order this run created | `◷ Chờ xưởng báo phí giao hàng` | clean |
| awaiting payment | the operator setting the fee | `◷ Chờ thanh toán` | clean |
| ready for delivery | the operator verifying the payment | `✓ Đã thanh toán · chuẩn bị giao` | clean |
| delivered | the operator dispatching | `✓ Đã giao` | clean |
| completed | the operator completing | `✓ Hoàn tất` | clean |
| expired | the **real** reservation-expiry sweep | `✕ Hết hạn giữ hàng` | clean |
| secure unavailable / error | `/truy-cap/don-hang` with no credential | — (the one indistinguishable card) | clean |

`payment / evidence` (`PAYMENT_UNDER_REVIEW`) is the one §6 state not scanned
separately, and it is stated rather than glossed: the run **does** open a real
attempt and a real evidence section — that is what test D of the Admin journey
drives — but the customer surface is looked at either side of it rather than
during it. The section's own semantics were audited in source (§C) and its
controls are the same `OrderStatusPill`, `OrderNote` and file input that the
scanned states already cover. `FU-APP12-H08-06`.

### One tab, refreshed — which is both cheaper and more faithful

The four operator-driven states are read through **one** `ORDER_ACCESS`
resolution. The first revision opened a fresh context and a fresh bootstrap per
state; it read better and was wrong twice over. It is not what a customer does —
they keep the tab open and come back — and it spends a secure-link **resolution**
per look, which the delivered limiter counts by request rather than by outcome.
Four extra bootstraps inside two minutes exhausted the budget and the final
state's audit failed on a limiter the application was entirely right to apply.

So the credential is resolved once and every later state is read through the
delivered refresh path (`focus` + `visibilitychange`, no reload) — the same one
`APP12-S03`'s own journeys use. A reload would lose the credential by design
(`APP12-S03` §34), which is exactly why that path exists. The application was not
changed to accommodate the audit; the audit was changed to behave like a
customer.

§6's specific requirements:

| Requirement | Result |
| --- | --- |
| status meaning not colour-only | PASS — in **all seven** states, the pill's text with its decorative glyph removed is non-empty |
| primary action has correct name | PASS — `Hiện thông tin chuyển khoản` reached and operated by name |
| QR has meaningful non-visual context | PASS — the alt text states what the code is *for*, and every datum it encodes is printed as text beside it |
| amount/reference understandable without visual position | PASS — a `<dl>` of label/value pairs, with copy buttons named for the field they copy |
| error/unavailable state announced | PASS — `secure.live_regions = 2` on the authorized surface; the shell announces every settled outcome politely |
| **secure token absent from accessible text, DOM and storage** | **PASS** — `location.hash` empty, `location.search` empty, `0` elements carrying a token-shaped attribute, `secure.storage_entries = 0` |

```text
trace = off      video = off      HAR = off      screenshot = off
```

Set explicitly on all four H08 projects, as a security control rather than a
preference. Every assertion about the credential is a **boolean**: a failing
`toBe('')` would print its received value, and the received value there is a live
credential.

---

## I. Forms, errors

| Form | Labels | Required | Instructions | Errors | Invalid state |
| --- | --- | --- | --- | --- | --- |
| checkout contact (`APP4`) | PASS | n/a (one field) | PASS | PASS (`role="alert"`) | PASS |
| verification code | PASS | n/a | PASS | PASS | PASS |
| `STEP_UP` (same machine) | PASS | n/a | PASS | PASS | PASS |
| checkout delivery ×4 | PASS | **PASS after `FIX-2`** | PASS (`autocomplete` + hint) | PASS (`role="alert"`, `aria-describedby`) | PASS |
| purchase variant/size | PASS (`<legend>`) | n/a | PASS | **PASS after `FIX-3`** | PASS |
| Admin shipping fee | PASS | PASS (marker inside the label) | PASS | **PASS after `FIX-4`** | PASS |
| Admin payment review | PASS | PASS | PASS | PASS after `FIX-4` | PASS |
| evidence upload | PASS | n/a | PASS (`accept` + constraint line) | PASS (`aria-describedby` to its own note) | n/a |

No placeholder stands in for a label on any of them — asserted live on the four
delivery fields and the fee field rather than read off the source.

---

## J. Async announcements

| Transition | Mechanism | Verdict |
| --- | --- | --- |
| verification requested / verifying | visually-hidden `aria-live="polite"` on the contact card | PASS |
| verification result | `VerificationOutcomeCard` mounts; contact card publishes `role="status"` | PASS |
| checkout submit refused | field errors mount into `role="alert"` — 4 published on an empty submit | PASS |
| order created | focus moves to the confirmation heading | PASS |
| secure link settled | polite region announces authorized / unavailable / transient | PASS |
| payment refresh / QR ready | polite region on the QR panel | PASS |
| evidence upload progress | polite region carrying the percentage as text | PASS |
| **purchase axis incomplete** | was a group *description* only | **`FIX-3`** |
| **Admin save/verify refusal** | error replaced help text **in the same element** | **`FIX-4`** |
| Admin verification outcome | live region, asserted on the settled screen | PASS |
| dispatch / completion | confirmation dialog closes; the status badge updates | PASS |

No duplicate or noisy announcement was introduced: `FIX-3` is `role="status"`
(polite — the customer is mid-choice and has done nothing wrong), and `FIX-4`
adds no second element, it makes the one that already existed actually appear.

---

## K. Contrast

Measured mechanically on the **rendered** page — axe's own `color-contrast`
computation, after cascade, inheritance and opacity — on every audited screen at
1440 / 1024 / 390.

### The rule H08 applied, and why it is not a waiver

`PO-APP12-004` resolved the pre-implementation audit's contrast finding by
granting **bounded design-token correction authority to `APP12-V02`** for three
locked values, and the same reconciliation routes accessibility explicitly:
*"contrast judged post-`V02`"*. H08 runs before `V01`. Darkening a locked
foundation token here would execute another checkpoint's authorised correction
and destroy the before-state `V02` owes evidence against.

So H08 asserts the claim it can honestly make and be held to: **every failing
pair is two locked design tokens meeting each other.** The token set is read from
`packages/styles/src/settings/_color.scss` **at run time**, not transcribed — a
transcription would rot, and worse, would quietly absorb a newly invented
component colour into "one of the known ones". A component that hard-coded a hex
value fails the assertion by name, and that would be an H08 defect under §13's
"small contrast defects".

```text
non-token contrast failures, every screen, every width  =  0
```

### What was measured

| Failing pair | Ratio | Required | Where | Owner |
| --- | --- | --- | --- | --- |
| `$color-text-tertiary` on `$color-background-secondary` | 2.29 | 4.5 | search hint, footer rights line | `V02` (`PO-APP12-004`) |
| `$color-text-secondary` on `$color-background-secondary` | 4.36 | 4.5 | secondary body copy, store presentation, footer tagline, product stage message | `V02` (`PO-APP12-004`) |
| `$color-surface-primary` on `$color-action-primary` | 3.81 | 4.5 | the homepage primary CTA (white on brand) | `V02` (`PO-APP12-004`) |
| **`$color-status-warning` on `$color-background-secondary`** | **2.87** | 4.5 | **the secure-link *unavailable* card** | **`V02` — new, `FU-APP12-H08-02`** |

The fourth is the finding. `PO-APP12-004` enumerates three values; this is a
**fourth locked token**, on a Wave-1 critical surface — the screen a customer
whose payment link has died actually lands on — and it is below the 3:1 large-text
threshold as well as the 4.5:1 one, so no font size rescues it. It needs the same
bounded authority the other three already have. `$color-status-error` (`#dc2626`)
sits in the same alert component's error variant and should be measured with it.

The run reports `beyond_po_004` per screen, so this separation is data rather
than prose: it reads `none` on the homepage, Discover, Product Detail, checkout
and the authorized secure order, and names the warning pair on the unavailable
card at all three widths.

---

## L. Zoom and reflow

200 % zoom is reproduced the way WCAG defines it — the CSS viewport is halved —
because `deviceScaleFactor` does not change CSS pixel width and Playwright
exposes no browser-zoom control at all.

```text
horizontal overflow, every audited route × every viewport  =  0 px

Storefront   1440 · 1024 · 390 · 720 (1440@200%) · 512 (1024@200%)
Admin        1440 · 1024 ·       720 ·             512
```

Reflow is not only "no scrollbar": each measurement also asserts that content and
function survive. On the Storefront the brand link and the `contentinfo` landmark
are asserted present and visible at every width including the halved ones; on the
Admin the operator's own way out of the session is asserted reachable — on the
bar above the breakpoint, behind the trigger below it — so a layout that "fits"
by dropping the logout control fails.

No required control was clipped, covered or made unreachable at any width. The
compact Admin bar was checked specifically for controls that are hidden but still
focusable: `admin.compact_bar_strays = 0`.

---

## M. Touch targets

SC 2.5.8 Target Size (Minimum), AA — 24 × 24 CSS px — measured at 390 on every
audited Storefront route plus the open drawer and the secure order surface.

```text
targets measured   17 homepage · 19 discover · 19 product detail
                   13 secure landing · 12 secure order · 21 drawer (open)
undersized         0  on every one
```

Both of the criterion's mechanical exceptions are **computed, not assumed**:

- **Inline** — a control inside a sentence is sized by the sentence.
- **Spacing** — an undersized target conforms when a 24 px circle centred on its
  bounding box does not intersect any other target's circle, i.e. when their
  centres are ≥ 24 px apart.

The spacing exception is what makes this measurement honest rather than
pedantic. A first pass that read heights alone flagged the desktop header nav
(75 × 22) and the content-page link lists (≈ 150 × 20). Computing the criterion
as written clears both — the header items are ~80 px apart and the list items are
spaced beyond the circle — and, more usefully, would *not* clear a 20 px control
stacked 8 px below another. A number alone cannot tell those apart, which is why
the rule is implemented rather than eyeballed.

Controls are measured on their `<label>` where one wraps them, because that is
the area a finger actually hits — the pattern both the purchase pills and the
queue filters use.

---

## N. Reduced motion

`prefers-reduced-motion: reduce` was negotiated in a dedicated browser context
(it is fixed at context creation) and every audited route was opened in it.

```text
document.getAnimations() with playState "running"  =  0   on every audited route
```

Measured from the browser's **running animation set** rather than from the
stylesheet, which is the only way to tell a guarded `@keyframes` from an
unguarded one. The repository's `motion-safe` mixin (`@media
(prefers-reduced-motion: no-preference)`) is doing its job: the secure-link
bootstrap pulse and the Admin status progress bar are the two material
animations in scope and neither runs.

`NOT_APPLICABLE` for parallax, autoplay and motion-triggered content: none
exists on a Wave-1 surface.

---

## O. Images and alt

| Image | Treatment | Verdict |
| --- | --- | --- |
| Product Detail main media / lightbox | `"{name} — ảnh {i} trên {n}"` | informative, truthful, position-aware |
| Product Detail thumbnail strip | `alt=""` | decorative — the control that wraps it carries `Xem ảnh {i} trên {n}` |
| Checkout summary thumbnail | `alt=""` | decorative — the Product name is on the next line; an alt would say it twice |
| Checkout summary, no media | `<span aria-hidden="true">` | the drawn slot, empty, rather than a stand-in image |
| Payment QR | describes the code's **purpose**, not its pixels | informative; every datum it encodes is printed as text beside it |
| Brand symbols (×3) | `aria-hidden` | decorative; the wordmark is the name |
| Every status/note/copy glyph | `aria-hidden` | decorative; the control or the note text carries the meaning |

axe's `image-alt` and `role-img-alt` rules are clean on every scan, and the
brand-system assertion in §E is what proves the decorative symbols stay
decorative.

---

## P. Semantic structure

Asserted per screen from the accessibility tree, not from class names:

```text
main landmarks        exactly 1     on every audited screen, both apps
contentinfo           exactly 1     Storefront;  0 on the Admin (correct — see below)
h1                    exactly 1     on every audited screen and every order state
skipped heading level 0             on every audited screen
navigation landmarks  distinctly named, always
```

`contentinfo` is asserted as **at most one** in the shared helper and as
*exactly* one in the Storefront spec, and that distinction is deliberate. The
Storefront publishes a footer on every route; the Admin publishes none anywhere,
including the login page, which has no shell at all. Neither is a defect — WCAG
requires no particular landmark, and an operator tool with nothing to put in a
footer should not grow an empty one to satisfy a rule. What *would* be a defect
is two, because a second makes the first unfindable, which is the mistake
`APP4-S01` actually shipped with `<main>` and caught in a browser rather than in
jsdom.

The Admin queue's table relationships were asserted structurally rather than
visually: a `<caption>`, `scope="col"` on **every** column header (`0` headerless),
`scope="row"` on the order code, and one cell per column in the first row.

Nav landmark names never collide. With the Admin drawer open the document
carries `Điều hướng chính` (sidebar) and `Điều hướng` (drawer) — two navigation
landmarks, two distinct names, exactly as `APP1-S01A`/`APP1-A02` intended.

---

## Q. Automated scan

`axe-core@4.13.0`, injected through the CDP evaluation channel — `addScriptTag`
would be refused by the per-request CSP nonce `APP12-H02` ships.

```text
gate:  serious + critical WCAG 2.2 AA violations  =  0
```

**On every scan, on every screen, in every state.** **27 distinct scans** across the run:
homepage, Discover, Product Detail (twice), the open mobile drawer, the secure
landing, the checkout, its code-entry state, its **error** state, its created
state, the authorized secure order, all six further order states, the Admin
login, the queue, the order detail, the invalid-fee state, the payment panel, the
verification dialog, the settled payment, both fulfilment dialogs, the completed
order, and the open Admin drawer.

Best-practice rules were evaluated in a **second, separate pass** so a reviewer
can read them, and never counted toward the gate. They are clean too:
`bestpractice.* = none` on every screen scanned for them.

**One rule is excluded from the gate and from nothing else.** `color-contrast` is
disabled for the *count* and measured more strictly in §K, where its own
per-node data is the evidence. That is the opposite of suppressing a rule to
reach a number: no rule is disabled to make a page green, the excluded rule's
output is the basis of a whole section, and the ownership it is excluded under is
a Product Owner decision that predates this checkpoint.

Automated scanning did not replace manual proof: every keyboard journey, every
focus measurement, every contrast attribution and every state walk above is
manual work the scanner cannot do.

---

## R. Chromium

Two projects, production-mode builds behind the real Nginx gateway.

```text
app12-h08-storefront-chromium    10 cases   PASS
app12-h08-admin-chromium          7 cases   PASS
```

Carries the **full** audit — axe, the keyboard journeys, contrast, reflow,
target size, reduced motion, the brand regression and the seven order states.
Desktop 1440 is the project viewport; 1024, 390 and both 200 % viewports are
driven inside the cases, because the responsive rule under test is one shell
adapting rather than several pages.

---

## S. Firefox

```text
app12-h08-firefox    5 cases   PASS    customer + Admin critical smoke
```

Storefront shell at desktop and compact, the mobile drawer (open, `Escape`,
focus return), the purchase panel resolving a real SKU and composing a real
checkout address, the pre-hydration guard releasing, the secure-link unavailable
card, and the Admin: login, queue, both filters, into an order, the compact bar
and its drawer.

**No browser-specific operation failure.** One observation worth recording
because it looked like one and is not: `locator.check()` reported *"clicking the
checkbox did not change its state"* on the queue's origin filter. The control is
a **controlled** checkbox whose `checked` comes back from the URL through
`router.replace` and `useSearchParams`, so a click is a full round trip through
the App Router before the box reflects it; `check()` asserts the flip
immediately. Clicking and waiting for the **outcome** — the box checked *and*
`origin=READY_MADE` in the address — passes. The gate asks whether the operator
can filter the queue, and they can.

---

## T. WebKit

```text
app12-h08-webkit    4 cases   PASS    customer critical smoke
```

The same four customer cases, from the same file, with the `@admin` case grepped
out — one text, two engines, so a divergence cannot hide in two copies of it.

### Both engines ran on the host, and that is a correction

Every other project in `playwright.config.ts` routes Firefox and WebKit to the
pinned Linux container, on the stated reasoning that they have no
`--host-resolver-rules` (a Chromium flag). That reasoning is stale.
`docs/development/LOCAL_DEVELOPMENT.md` §4 makes `embroidery.local` and
`admin.embroidery.local` a **required one-time hosts-file entry** for every
developer of this repository, and a hosts file resolves for every process on the
machine whatever engine it is. Both engines were opened against
`http://embroidery.local` and returned `200` before the matrix was written.

This is not a tidiness point. The container path copies `playwright.config.ts`
and `specs/` and nothing else, so a container-bound project cannot import the
run's world module — which means the non-Chromium matrix could not have shared
this run's catalog, order and operator at all. Running on the host is what makes
the compatibility gate test the same universe the Chromium gate tests.

The container path is untouched and still available for `--full`. The older
projects' comments are left as their own record; only H08's own projects state
the corrected reasoning. Recorded as `FU-APP12-H08-05`.

---

## U. Viewport compatibility

```text
1440   Storefront + Admin   PASS
1024   Storefront + Admin   PASS
390    Storefront           PASS   (APP12-D01 §L draws no mobile Admin)
```

At every one: zero horizontal overflow, no clipped or unreachable required
control, one `main`, one `h1`, and — at 390 — every interactive target clearing
SC 2.5.8 with its exceptions computed.

The Admin is audited at two widths and not three because `APP12-D01` §L draws it
at two. Inventing a 390 Admin audit would be auditing a design that does not
exist. The compact **bar** is still exercised, at 900 px, which is below the
`$shell-breakpoint: 1024px` where the PO restructure applies.

---

## V. Admin app-bar and drawer

Covered in full in §E. Summary: **usable, unreverted, unredesigned.** The brand
words stay in the accessibility tree while visually hidden; the hidden desktop
trail leaves no focusable behind; the trigger is keyboard-reachable with a drawn
focus ring; focus enters the drawer, is trapped, and returns to the trigger on
`Escape`; identity and logout are reachable inside it; and the two navigation
landmarks carry distinct names.

`landmarks.admin-drawer-open` with the drawer open: `main = 1`, `contentinfo = 0`,
`h1 = 1`, `nav = "Điều hướng chính|Điều hướng"`.

---

## W. Findings and fixes

### Fixed here — four, all within §13's bounded list

#### `FIX-1` — the shared modal frame leaked the keyboard (HIGH)

`apps/storefront/src/shared/dialog/modal-frame.tsx`

`ModalFrame` deliberately puts initial focus on the dialog **heading**, so the
customer reads what is being asked before their fingers are on the field that
answers it. The heading carries `tabIndex={-1}` and is therefore excluded from
the `FOCUSABLE` list the trap cycles. The key handler compared the active element
against `first` and `last` only — so at the one moment every customer starts
from, neither branch matched and the keypress was left to the browser. Forward
that was harmless (the next tabbable really is inside the dialog); **backward it
walked out of the dialog and into the page behind the scrim.**

Five secure Storefront screens carry this frame — the quotation, the design
review, the deposit, the remaining balance and the Ready-Made `STEP_UP` dialog,
the last of which stands between a Wave-1 customer and a payment.

The fix treats anything focused inside the dialog but **outside the cycle** as
both edges. It is written as "not in the list" rather than "is the heading",
because the property that matters is being outside the cycle and a future
non-tabbable element would otherwise reopen the same hole.

Two tests were added to `shared-modal-frame.test.tsx` and **both fail at HEAD**:

```text
✕ moves Tab from the heading to the first control inside the dialog
✕ keeps Shift+Tab from the heading inside the dialog
        Received element with focus: <h2 … tabindex="-1">Xác minh liên hệ</h2>
```

Both pass after the fix; the existing eight still pass. The suite could not have
caught this before because it only ever pressed `Tab` from a *control*.

#### `FIX-2` — the checkout delivery fields published no required state

`checkout-field.tsx`, `checkout-delivery-card.tsx`

All four are contract-required and `validateDelivery` refuses an empty one, but
nothing in the markup said so: a screen-reader customer met four fields that
announced as ordinary text inputs and learned they were mandatory by submitting
and being refused. SC 4.1.2 — a control's state must be programmatically
determinable.

`aria-required` rather than the native `required` attribute, deliberately:
`required` would hand validation to the browser, whose bubble would fire on
submit in the UA's own language and pre-empt the approved field-bound message
(`909:258` — *bound to the field, never a toast*). The ARIA attribute announces
the same state and changes no behaviour.

The **visible** required indication is not added: every field on the drawn card
is required, so a marker on all four is a decision about the approved frame
rather than an accessibility defect. `FU-APP12-H08-01`.

#### `FIX-3` — the purchase panel's missing-axis message was never announced

`purchase-option-fieldset.tsx`

`906:186` requires the message be bound to the group rather than announced as a
toast, and it was — as `aria-describedby` on the `<fieldset>`. A group
description is announced when the group is **entered**, and this message appears
while the customer is already inside one: choosing a colour is what publishes
"chọn kích thước" on the *sibling* fieldset. The CTA cannot fill the gap either,
because it is `disabled` and therefore not in the tab order at all. With no live
region a screen-reader customer had **no way** to learn why the purchase could
not continue.

`role="status"` on the same paragraph — polite, because the customer is mid-choice
and has done nothing wrong. The `906:186` binding is untouched; the live region
is in addition to it, never instead.

#### `FIX-4` — the Admin field's refusal was drawn but not spoken

`payment-field.tsx`

The help line and the error share one element, deliberately: `753:158` wants the
error *in place of* the help text because showing both buries the error. But a
shared element is one that never unmounts, and a screen reader announces an alert
region when it **appears**, not when text inside a region it has already seen
changes. The operator presses `Xác nhận` with an empty fee, focus stays on the
button, and the refusal was silent.

The fix keys the paragraph on its own validity, so React unmounts and remounts it
when the state flips and the alert genuinely appears. One DOM node on a state
change that happens at most once per submit, and it is the difference between an
error an operator hears and one they only see. Applies to the shipping fee, the
payment review and the verification dialog's three fields.

A test was added to `order-ready-made-branch.test.tsx` asserting the observable
consequence — the message is inside a live region once it is a refusal, is still
what the field points at, and no request was made.

### Found and deliberately not fixed here

| Finding | Why not H08 | Owner |
| --- | --- | --- |
| Four locked design tokens fail contrast (§K) | `PO-APP12-004` grants that authority to `V02`, and the same ruling says contrast is judged post-`V02`. Repairing it here would execute another checkpoint's correction and destroy the before-state it owes evidence against | `APP12-V02` |
| No **visible** required indicator on the four delivery fields | §13 permits no visual redesign; every field on the drawn card is required, so a marker on all four is a design/copy decision | `V01`/`V02` (`FU-APP12-H08-01`) |
| The Admin FULL verification dialog is titled `Xác nhận đã nhận **tiền cọc**` on a Ready-Made order | `BR-029` gives a Ready-Made order exactly one `FULL` obligation and no deposit. §13 lists no copy change; `APP12-S03` §21 already established the customer-side rule and this is its operator-side twin | `V01`/`V02` (`FU-APP12-H08-03`) |
| The E2E browser tier serves a stale build | Harness, not a Wave-1 surface | `E01` / tooling (`FU-APP12-H08-04`) |
| Firefox/WebKit no longer need the container | Corrected for H08's own projects; the older projects are their own record | tooling (`FU-APP12-H08-05`) |

### Zero of these

```text
new business capability   new route   new API operation   new migration
material redesign         copy rewrite                    token change
worker or provider work   deployment   G03 data           push
```

---

## X. Validation

Change-impact based, selected from `VALIDATION_GOVERNANCE.md` §3. No
repository-wide aggregate was run.

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| `pnpm --filter @embroidery/storefront typecheck` | pass |
| `pnpm --filter @embroidery/storefront lint` | pass |
| `pnpm --filter @embroidery/storefront test` | **133 suites / 2514 tests pass** |
| `pnpm --filter @embroidery/admin typecheck` | pass |
| `pnpm --filter @embroidery/admin lint` | pass |
| `pnpm --filter @embroidery/admin test` | **134 suites / 1925 tests pass** |
| `pnpm --filter @embroidery/e2e-testing typecheck` | pass |
| `pnpm --filter @embroidery/e2e-testing lint` | pass |
| `node scripts/run-e2e.mjs --app12-h08` | **26 / 26 pass**, 4 projects, 3 engines, exit `0`, `cleanup verified` |
| `pnpm --filter @embroidery/e2e-testing check:e2e` | boundary clean, config + specs collect (209 tests), Playwright pinned |
| `pnpm --filter @embroidery/api openapi:check` | artifact up to date — no drift |
| `pnpm --filter @embroidery/api-client check:generated` | up to date, tree hash `60443066…` |
| `apps/api` `admin-category.contract.spec.ts` | **17 / 17 pass** — release matrix still 28 / 18 / 3 |
| `node tools/check-storefront-route-authority.mjs` | pass — route authority unchanged |
| `node tools/check-category-source-of-truth.mjs` | pass — 2590 files, no compiled category values |
| `node tools/check-frontend-test-boundaries.mjs` | clean |
| `node tools/check-e2e-boundaries.mjs` | clean — 4667 built files, no E2E code in app output |
| `node tools/check-figma-design-index.mjs` | pass — 553 registry IDs, unchanged |
| `node tools/check-file-size.mjs` | no H08 file at a hard limit (two `REVIEW`, below) |
| `node tools/check-release-config.mjs production` | FAIL (21) — **expected**, every externally-owned value empty, identical to H07 |
| `node tools/check-release-config.mjs staging` | FAIL (6) — **expected**, committed placeholder image refs, identical to H07 |
| `node tools/check-report-secrets.mjs` | see §Y |
| `npx prettier --check` on every touched file | all matched files use Prettier style |

### Not run, and why

No SCSS was touched, so `check-styling-boundaries.mjs` and `check-app-scss.mjs`
are not justified by this change. (The former is red at HEAD with 31 pre-existing
violations; the diff contains zero `.scss` files, so the gate's inputs are
untouched and the result is unchanged by H08.) No API operation, DTO or module
changed, so no API unit suite beyond the one release-matrix contract spec. No
Figma entry changed, so no design work. No migration, so no database gate. No
`V01`/`V02`/`U01`/`E01`/`R01` command was run.

### Two `REVIEW` thresholds, stated rather than hidden

```text
h08-admin-journey.acceptance.spec.ts      585 lines   (test review threshold 500)
h08-storefront-journey.acceptance.spec.ts 506 lines   (test review threshold 500)
h08-world.ts                              340 lines   (source review threshold 300)
h08-measure.mjs                           352 lines   (source review threshold 300)
```

All four are under their hard limits and each is one responsibility. The file-size
gate did its job twice on the way here: the Admin spec first breached the 600-line
test limit and was split by subject into the journey and the shell regression;
`h08-world.ts` breached the 400-line source limit and was split by *question* —
what the document **says** (landmarks, headings, the rule scan) versus what the
browser **painted** (contrast, reflow, target size, focus). Neither split was by
line range.

### The four harness faults this run found in itself

Worth recording, because **every one of them produced a plausible finding about
the application that was false**. A gate that cannot tell its own faults from the
system's is not evidence, so each is named with what it looked like.

1. **The topology never builds.** `run-e2e.mjs` starts the apps with `next
   start`, which serves whatever `.next` is on disk — a build from the previous
   day, in this case. `FIX-2` was in the source, absent from the page, and the
   run reported a Wave-1 accessibility defect that had already been fixed.
   *Looked like:* "the delivery fields publish no required state".
   `FU-APP12-H08-04`.
2. **The gateway's first connection can stall.** The E2E Nginx reaches the host's
   Next processes through `host.docker.internal` with `proxy_connect_timeout
   10s`, and on Windows that hop, after the pool has gone idle between projects,
   has twice exceeded it — returning a `504` error page with no `main`, no footer
   and no form. *Looked like:* once "the shell does not work in Firefox", once
   "the checkout has no contact field". Both false; the identical request
   succeeded immediately afterwards. Addressed at the cause rather than papered
   over: `warmGateway` opens the connection deliberately, before the work, on a
   route with no assertions attached; it is bounded, it **records** every stall,
   and it raises if the proxy fails three times, so a gateway that is genuinely
   down still fails the run.
3. **`operator = page` in the first case.** Playwright creates and closes the
   `page` fixture per test, so a serial journey that captured it in case A handed
   every later case a closed target. *Looked like:* an Admin routing failure —
   "Target page, context or browser has been closed" on the next `goto`.
4. **A tab walk that starts with `Tab`.** `PaymentDialog` puts focus on the
   dialog's first control on open, so searching for "the next field" stepped
   *past* it and shifted every typed value one field along — the amount into the
   reference, the note text into the amount. *Looked like:* a malformed amount
   refused by the server, and was a misaligned walk.

A fifth was found by the **application** rather than by a gate, and is the one
worth reading twice. The state audit originally opened a fresh `ORDER_ACCESS`
bootstrap per state, and the secure-link limiter refused the fourth. Nothing was
wrong with the limiter — it counts requests by design, and an audit that made a
customer's credential cheaper to resolve would have been auditing a weaker system
than the one that ships. The audit was rewritten to keep one tab and refresh it,
which is both cheaper and what a customer actually does (§H).

Two more were caught by the repository's own gates rather than by a failure: the
Admin spec breached the 600-line test limit and `h08-world.ts` breached the
400-line source limit, and both were split by responsibility rather than by
range (see above).

---

## Y. Hygiene

```text
shared-dev commercial residue   = 0
G03 data                        = false
production deployed             = false
pushed                          = false
disposable teardown             verified on every run
```

Every commercial row this checkpoint created — two orders, their reservations,
grants, obligations, attempts and evidence — lives in the run's **disposable**
database (`embroidery_db7_e2e_*`), which the orchestrator drops in its `finally`
block. Each run ended with `cleanup verified: all E2E ports closed, disposable
database dropped`. The shared development stack was used **read-only**, during
harness development, against catalog data that already existed; nothing was
written to it.

**Secrets.** No `.env` was written or read for a value. The operator password and
the APP4 pepper material travel the child process environment only and are never
returned, asserted on, logged or recorded. The `ORDER_ACCESS` credential is
handled entirely inside `openSecureOrder` and is never returned to a spec — every
assertion about it is a **boolean**, because a failing `toBe('')` prints its
received value. `trace`, `video`, `screenshot` and HAR are `off` on all four H08
projects as a security control.

The scanner drops element HTML at the page boundary: axe returns each failing
node's outer markup, and on `/truy-cap/don-hang` that markup sits on a screen
reached with a live credential. This report and every failure message carry rule
ids, impacts, counts and CSS selectors — a selector names a position in a
document and cannot carry an amount, a reference, a contact or a token.

`node tools/check-report-secrets.mjs` — see the §X table. The colour values,
ratios and token names in §K are design-system constants, not credentials.

---

## Z. Baseline freeze

Every frozen value re-counted from the artifact rather than restated:

```text
OpenAPI              125 paths / 138 operations / 278 schemas    unchanged
public operations    49                                          unchanged
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED          unchanged (contract spec 17/17)
migrations           38                                          unchanged
DB tables            79                                          unchanged
Admin routes         26                                          unchanged
Storefront routes    20                                          unchanged
Figma                553 registry IDs, index gate PASS           unchanged (0 lines in diff)
```

```text
NEW_BUSINESS_OPERATIONS = 0
NEW_ROUTES              = 0
NEW_MIGRATIONS          = 0
MATERIAL_REDESIGN       = 0
```

### Changed files

**Application source — four files, all accessibility attributes or focus
handling, no behaviour beyond it:**

```text
apps/storefront/src/shared/dialog/modal-frame.tsx                        FIX-1
apps/storefront/src/features/ready-made-checkout/ui/checkout-field.tsx   FIX-2
apps/storefront/src/features/ready-made-checkout/ui/checkout-delivery-card.tsx  FIX-2
apps/storefront/src/features/ready-made-purchase/components/purchase-option-fieldset.tsx  FIX-3
apps/admin/src/features/order-detail/components/payment-field.tsx        FIX-4
```

**Tests — four files, each proving one fix:**

```text
apps/storefront/test/components/shared-modal-frame.test.tsx        +2 cases (both red at HEAD)
apps/storefront/test/components/ready-made-checkout.test.tsx       +1 case
apps/storefront/test/components/ready-made-purchase-panel.test.tsx +1 case
apps/admin/test/components/order-ready-made-branch.test.tsx        +1 case
```

**Harness — the H08 gate:**

```text
packages/e2e-testing/support/app12/h08-axe.mjs                     new  (axe injection, secret-free results)
packages/e2e-testing/support/app12/h08-measure.mjs                 new  (contrast, reflow, targets, focus)
packages/e2e-testing/specs/app12/support/h08-world.ts              new  (viewports, scan gate, landmarks)
packages/e2e-testing/specs/app12/support/h08-metrics.ts            new  (the measured assertions)
packages/e2e-testing/specs/app12/support/h08-secure-states.ts      new  (one order state, audited)
packages/e2e-testing/specs/app12/h08-storefront-audit.acceptance.spec.ts    new
packages/e2e-testing/specs/app12/h08-storefront-journey.acceptance.spec.ts  new
packages/e2e-testing/specs/app12/h08-admin-journey.acceptance.spec.ts       new
packages/e2e-testing/specs/app12/h08-admin-shell.acceptance.spec.ts         new
packages/e2e-testing/specs/app12/h08-compat.acceptance.spec.ts              new
packages/e2e-testing/playwright.config.ts          +4 projects
packages/e2e-testing/scripts/run-e2e.mjs           +1 mode (--app12-h08)
packages/e2e-testing/package.json                  +1 script, +axe-core devDependency
packages/e2e-testing/eslint.config.mjs             +1 browser-globals block
pnpm-lock.yaml                                     axe-core@4.13.0
```

**Documentation:**

```text
docs/implementation/reports/APP12-H08-COMPLETION-REPORT.md   this file
docs/implementation/phases/APP12-…-READINESS.md   H08 → COMPLETE, V01 → NEXT (2 lines)
docs/implementation/SCOPED_COMMAND_INDEX.md       +1 row: CMD-E2E-APP12-H08
```

**Not changed:** no API source, no worker source, no shared package, no SCSS, no
design token, no OpenAPI artifact, no generated client, no migration, no
manifest, no Figma entry, no runbook, no roadmap status other than this report's
own row.

---

## AA. Follow-up ownership

| ID | Finding | Severity | Owner |
| --- | --- | --- | --- |
| `FU-APP12-H08-01` | The four checkout delivery fields carry no **visible** required indication. `aria-required` now states it programmatically, but a sighted customer still learns it by being refused. Every field on the drawn card is required, so the right answer is probably one sentence rather than four markers — a copy/design decision H08 may not take | Medium | `APP12-V01` / `V02` |
| `FU-APP12-H08-02` | **A fourth locked contrast token.** `$color-status-warning` (`#d97706`) on `$color-background-secondary` measures **2.87:1** on the secure-link *unavailable* card — below the 3:1 large-text threshold as well as 4.5:1. `PO-APP12-004` enumerates three tokens and grants bounded authority for them; this needs the same authority. `$color-status-error` (`#dc2626`) sits in the same component's error variant and should be measured with it | **High** | `APP12-V02`, under `PO-APP12-004` |
| `FU-APP12-H08-03` | The Admin FULL-payment verification dialog is titled `Xác nhận đã nhận tiền cọc`, its submit says the same, and its **success announcement** — captured live as `THÀNH CÔNG · Đã xác nhận tiền cọc` — tells the operator a *deposit* was confirmed on a Ready-Made order that `BR-029` gives exactly one `FULL` obligation and **no deposit**. The operator-side twin of the rule `APP12-S03` §21 set for the customer. The evidence copy repeats *tiền cọc* on the same panel | Medium | `APP12-V01` / `V02` |
| `FU-APP12-H08-04` | **The E2E browser tier never builds.** `run-e2e.mjs` starts both apps with `next start` against whatever `.next` is on disk, so a source change is invisible to every browser project until someone builds by hand — and the run passes on stale code while reporting success. Cost two full runs of this checkpoint before it was diagnosed | **High** | `APP12-E01` / tooling |
| `FU-APP12-H08-05` | `playwright.config.ts` routes Firefox and WebKit to the Linux container on reasoning that the required hosts-file entries make obsolete. Corrected for H08's own projects; the other projects still pay for a container they do not need, and a container-bound project cannot share a run's world module | Low | tooling |
| `FU-APP12-H08-06` | `PAYMENT_UNDER_REVIEW` is the one §6 order state whose customer surface was not scanned in its own right (§H). Its components are covered by the six states that were, but a dedicated scan would close the matrix | Low | `APP12-E01` |

### Carried forward unchanged

```text
FU-APP12-H07-03  → APP12-E01   (PO §12; H07's own table says H08 — see §B)
FU-APP12-H07-05  → APP12-E01   WAVE-1 RELEASE BLOCKER, untouched
FU-APP12-H07-02  → APP12-E01
FU-APP12-H07-04  → pre-R01 with FU-APP12-H02-05
PO-APP12-004     → APP12-V02   now with a fourth token (FU-APP12-H08-02)
```

---

## AB. Roadmap

```text
CHECKPOINTS            = 38          LOCKED, unchanged
APP12-H08              = COMPLETE
APP12-V01              = NEXT
CORRECTION_USED        = 0 / 1
ROADMAP_LOCK           = LOCKED
WAVE_1_GO              = NOT_DECLARED
WAVE_2_GO              = NOT_DECLARED
```

No checkpoint id was invented, none was reordered, merged, split or renamed. The
work discovered here is handled the only two ways the lock permits: fixed inside
this checkpoint where §13 allows it, or assigned to a checkpoint that already
exists in the locked roadmap.

Wave-1 accessibility and compatibility are **gate-clean** with two qualifications
a reader should carry forward:

1. **Contrast does not pass**, and cannot until `V02` exercises the authority
   `PO-APP12-004` granted it. H08 proved the narrower thing that is actually
   H08's: no screen in the Wave-1 critical path introduces a contrast failure of
   its own, and every failure is two locked tokens meeting. `V02` now has a
   fourth token to include.
2. **`FU-APP12-H07-05` remains a Wave-1 release blocker.** A notification
   reaching `DISPATCHED` is still delivered to nobody, and the entire secure
   order surface this checkpoint just audited is reached by a link that arrives
   through that path. Its accessibility is proved; its delivery is not, and that
   is `E01`'s.

STOP. Nothing after H08 was executed, H07 was not reopened, no worker or provider
runtime work was absorbed, no `V01`/`V02` surface was redesigned, no migration
`0039` exists, production was not deployed, no `G03` data was created, and
nothing was pushed.
