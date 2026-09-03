# APP12-S03 — Secure Ready-Made Order Status and FULL Payment Surface

> ## Correction notice — `APP12-S03-C1`
>
> The first final live tier discovered that real `ORDER_ACCESS` notifications
> landed on `/truy-cap`. The harness temporarily substituted the path only to
> isolate and prove the S03 surface.
>
> Product Owner rejected the substituted bootstrap as final customer acceptance.
>
> `APP12-S03-C1` made notification routing scope-aware and reran the live
> project from the exact delivered URLs with no substitution.
>
> **This report is preserved as the discovery record.** Everything below stands
> as written and was true when written — including §Y.1, which is the diagnosis
> that produced the correction. Two statements in it are superseded by C1 and
> are corrected there, not here:
>
> - the delivered `ORDER_ACCESS` link now lands on `/truy-cap/don-hang`;
> - `openSecureOrder` no longer substitutes a path, and
>   `FU-APP12-S03-09` is **CLOSED_BY_APP12_S03_C1**.
>
> Parent status: **`COMPLETE_AFTER_C1`**.
> Correction report: `docs/implementation/reports/APP12-S03-C1-COMPLETION-REPORT.md`.

## A. Verdict

```text
APP12-S03 = COMPLETE_AFTER_C1

CORRECTION_USED = 1 / 1
NEXT_CHECKPOINT = APP12-A01
```

> Recorded at delivery as `APP12-S03 = COMPLETE` / `CORRECTION_USED = 0 / 1`.
> The Product Owner then required `APP12-S03-C1`; the verdict above is the
> post-correction one.

The implementation tier was provisionally accepted by the Product Owner on the
first revision of this report. This revision supersedes that revision's
`INCOMPLETE` verdict with the mandatory live-commercial tier, now delivered:

```text
app12-s03 disposable mode      DELIVERED
full lifecycle @ 1440/1024/390 PASS  (3 real orders, end to end)
expiry journey                 PASS  (real sweep)
fee-correction journey         PASS  (real Admin write)
evidence journey               PASS  (real upload, real MinIO)
cross-order security           PASS
secure-link death mid-session  PASS
8 / 8 live tests               PASS in 6.3 minutes
disposable database            dropped by the run's own teardown
```

The live tier found **one real defect**, and it is not in S03's own source: the
delivered `ORDER_ACCESS` notification composes a link to `/truy-cap`, the
custom-request landing, so a Ready-Made customer's real link cannot open their
order. Closing it requires a **backend** change this frontend checkpoint may not
make (§20), so it is recorded as `FU-APP12-S03-09` with hard evidence in §Y.1
rather than worked around silently. S03's own surface is proven against the real
delivered token on its own route.

The three specific blocked causes were each measured rather than assumed, and
none applies:

```text
BLOCKED_CONTRACT_GAP        = NO   every one of the eight states is representable,
                                   and all eight were rendered live
BLOCKED_SECURITY_ORDERING   = NO   the Storefront root runs no script that could
                                   observe the fragment before the strip
BLOCKED_AUTHORITY_GAP       = NO   publicReadyMadeOrder_current authorizes the
                                   token itself; no resolver chain is needed
```

Everything else the live tier surfaced was a defect in the **harness**, not the
product. Each is recorded in §Y.2, because the run only became trustworthy once
it was fixed.

---

## B. S02-C1 reconciliation

Bookkeeping only, as §2 directs. No S02 source was reopened and no runtime
behaviour was touched.

`APP12-S02-COMPLETION-REPORT.md` §Y headings are corrected to match their own
lists:

```text
"New (2)"       listed 3 paths   → the heading is wrong, the list is right
"Modified (6)"  listed 7 paths   → the heading is wrong, the list is right
```

Carried forward unchanged:

```text
FU-APP12-S02-01 → APP12-V02
FU-APP12-S02-02 → APP12-V02
FU-APP12-S02-03 → APP12-V02
FU-APP12-S02-04 = CLOSED_BY_APP12_S02_C1
PARENT_APP12-S02 = COMPLETE_AFTER_C1
```

---

## C. D01 and source preflight

### C.1 Design authority

`docs/design/FIGMA_DESIGN_INDEX.md` rows resolved, all
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP12-D01-PO-001`, all read at
their exact nodes in file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_12`:

| registry id | node | read |
|---|---|---|
| `FIG-APP12-S03-ORDER-ACCESS-DESKTOP` | `910:258` | full node tree + rendered image |
| `FIG-APP12-S03-ORDER-ACCESS-STATES` | `911:305` | full node tree (all eight variants) |
| `FIG-APP12-S03-ORDER-ACCESS-MOBILE` | `911:366` | full node tree |
| `FIG-APP12-D01-REUSE-MATRIX` | `917:348` | reuse classes, copy density, `918:347` reconciliations |
| section | `910:257` / `911:304` | frame inventory and geometry |

Every Vietnamese string in `order-access-copy.ts` carries its node id. **No copy
was written from a DTO field name, an enum member or a backend message.**

`FIGMA_DELTA = 0` — no node was created, modified or moved.

> The Figma MCP server was unreachable at the start of this session and the
> checkpoint was held rather than guessed at; the operator re-authorized it and
> the nodes were then read live. No frame was implemented from prose.

### C.2 Delivered source

| question | measured answer |
|---|---|
| order read | `publicReadyMadeOrderCurrent` → `POST /api/public/ready-made-orders/current` |
| **does it authorize the token itself?** | **yes** — `PublicReadyMadeOrderAccessController.current` runs policy → limiter → grant resolution → projection, and answers one identical 404 for every unusable token |
| FULL obligation | `publicOrderFullPaymentCurrent` / `_qr` / `_initiate` |
| attempt identity | published **only** by `_initiate`; the read carries none |
| expiry authority | `terminationReason?: 'RESERVATION_EXPIRED'`, spread — an ordinary cancellation publishes no key |
| before-fee shape | `payment` and `delivery.feeAmount` **absent**, not zero |
| payable total | `fullPaymentAmount`; the contract states it is *not* re-derived from the subtotal and fee |
| initiation refusals | `REVERIFICATION_REQUIRED` (403), `SECURE_LINK_UNAVAILABLE` (404), `FULL_PAYMENT_NOT_PAYABLE` / `DUPLICATE_OPERATION` / `IDEMPOTENCY_CONFLICT` (409), `FULL_PAYMENT_INSTRUCTIONS_UNAVAILABLE` (503) |
| idempotency carrier | the `Idempotency-Key` header, as APP7/APP9 — **unlike** S02, where the verified challenge is the arbiter |
| evidence | `publicOrderDepositEvidenceUpload` / `_status`, generalized by B04; **no** Ready-Made evidence endpoint exists |
| credential lifetime | APP4's `useSecureLinkBootstrap` with `retainCredentialAfterSuccess` |
| STEP_UP composition | `useContactVerification({ purpose: STEP_UP })` + the three APP4 cards |
| money helper | string-only `formatExactAmount`, per-feature by boundary-guard precedent |
| release gate | `isWithheldWave2Route` already listed `/truy-cap/don-hang` as a future Wave-1 route |

### C.3 Design ↔ contract reconciliations

Three, each recorded and none resolved by inventing UX or widening an API.

1. **The heading does not vary.** `911:306` enumerates what changes — *pill
   trạng thái, khối hành động kế tiếp, khối thanh toán/giao hàng* — and the `h1`
   is deliberately not among them, so the package draws exactly one
   (`910:285` / `911:370`). It is implemented as drawn. The observation that
   *Thanh toán đơn hàng* reads payment-specific on the three terminal states is
   raised as **`FU-APP12-S03-01`** rather than resolved by writing eight
   headings, which would be redesign. The substance of each state is carried
   truthfully by the two blocks the design does vary.

2. **The evidence tile's count.** `910:334` prints *(tối đa 3)*; `917:419`/
   `917:420` classifies payment evidence `REUSE_AS_IS` with *cùng ô tải ảnh,
   **cùng giới hạn***. The directive wins — APP7-B05 counts five per attempt
   under a lock, so a tile promising three would under-report a limit the
   customer actually has, and no server behaviour changes to match it.
   **`FU-APP12-S03-02`**.

3. **The QR hint's direction.** `910:329` says the details sit *bên cạnh*,
   `911:419` says *bên dưới*. One QR panel is mounted and **placed** by CSS
   rather than mounted twice and hidden, so no component can pick between the
   two sentences without putting both in the DOM. The direction is dropped and
   the destination named instead. **`FU-APP12-S03-04`**.

---

## D. Route architecture

```text
app/truy-cap/don-hang/page.tsx        thin Server Component, static private metadata
  └─ SecureLinkQueryProvider          APP4, retry:false / gcTime:0
       └─ SecureOrderScreen           APP4 SecureLinkShell + the authorized branch
            └─ OrderAccessContent     one page, eight variants, three changing blocks
```

`NEW_STOREFRONT_ROUTES = 1`. There is no S03 second route: no payment route, no
status route, no confirmation route, no tracking route, no evidence route and no
completed route.

---

## E. Secure-link fragment / bootstrap

The carrier is APP4's, reused without a second implementation:

```text
<STOREFRONT_PUBLIC_ORIGIN>/truy-cap/don-hang#t=<opaque-token>
```

`readSecureLinkToken` and `stripSecureLinkFragment` are **not** exported by
`secure-link-access`, so this feature cannot capture a credential on its own
terms or move the strip relative to the request even if it tried. The boundary
suite asserts the feature contains no `location.hash`, no `replaceState` and no
deep import into APP4's model or hooks directories.

No query fallback, no path token, no token input.

---

## F. Strip-before-request proof

Asserted at the moment the request is observed, not afterwards:

```ts
orderMock.mockImplementation(() => {
  hashWhenObserved = window.location.hash;   // sampled inside the call
  return Promise.resolve(envelopeOf(makeOrder()));
});
expect(hashWhenObserved).toBe('');
```

`STRIP_BEFORE_REQUEST = PASS`. A malformed fragment is stripped too and makes
**no request at all**, so fragment syntax never becomes a probe.

---

## G. Credential lifetime and secrecy

One ephemeral ref, owned by APP4's hook. Cleared on a definitive refusal, on a
missing or malformed fragment, on unmount, and on the session ending. Retained
across a successful read and across a transient transport failure only.

Every mutation in this feature is declared with **no variables** — the
credential is read from the ref inside `mutationFn` — so nothing TanStack
retains after settlement can contain it. Asserted absent from: `localStorage`,
`sessionStorage`, IndexedDB, cookies, `history.state`, the DOM, query keys,
mutation variables, the URL and the console.

---

## H. Resolver-chain decision

```text
publicSecureLinkResolve calls from S03 = 0
resolver_chained = false
```

`APP12-B04`'s read performs the whole authorization chain internally. Chaining
the resolver would authorize the same bearer twice, spend the same abuse budget
twice, hold the raw secret across an extra flight and return no business fact
the read does not already carry. The boundary suite asserts the string
`publicSecureLinkResolve` appears nowhere in the feature, and the component
suite asserts the mock is never called.

---

## I. Secure order projection

`publicReadyMadeOrder_current` is the sole authority for every order fact. No
order state is derived from a payment attempt, a QR, an evidence row, a deadline
or frontend state. Consumed with the exact generated types: `orderCode`,
`status`, `item`, `merchandiseSubtotal`, `delivery`, `payment`,
`paymentDeadline`, `accessExpiresAt`, `terminationReason`, `currencyCode`. No
internal id is read or rendered.

---

## J. Eight-state mapping

`orderVariantOf(order, session)` — a pure function, asserted directly in
`test/model/order-access-state.test.ts` (41 cases).

| stored | variant | pill | payment block |
|---|---|---|---|
| `AWAITING_SHIPPING_FEE` | `AWAITING_SHIPPING_FEE` | `◷ Chờ xưởng báo phí giao hàng` | no |
| `AWAITING_PAYMENT`, no session facts | `AWAITING_PAYMENT` | `◷ Chờ thanh toán` | yes |
| `AWAITING_PAYMENT` + attempt or evidence | `PAYMENT_UNDER_REVIEW` | `◐ Xưởng đang đối chiếu` | yes |
| `READY_FOR_DELIVERY` | `READY_FOR_DELIVERY` | `✓ Đã thanh toán · chuẩn bị giao` | no |
| `DELIVERED` | `DELIVERED` | `✓ Đã giao` | no |
| `COMPLETED` | `COMPLETED` | `✓ Hoàn tất` | no |
| `CANCELLED`, no reason | `CANCELLED` | `✕ Đã huỷ` | no |
| `CANCELLED` + `RESERVATION_EXPIRED` | `EXPIRED` | `✕ Hết hạn giữ hàng` | no |
| `ON_HOLD` / `CANCELLING` | `OTHER_STATE` | `○ Đang cập nhật` | no |

`OTHER_STATE` is not a ninth design: the contract publishes two states the
package draws no frame for, and `APP7-D01` `751:174` already settled the rule —
*show it neutrally rather than guess* — which `APP9-S01` reused under this exact
name.

Only a **count** of evidence crosses into the decision. No `assetStatus` and no
attempt status can select a variant, and every terminal reading is taken before
the session facts are consulted, so an attempt in hand can never keep a
cancelled order on a payment screen.

---

## K. AWAITING_SHIPPING_FEE

Shows the pill, the next-action sentence, the frozen merchandise subtotal, and
`Có sau khi xưởng xác nhận phí giao hàng` in the highlight's place.

Shows **no** FULL total, **no** QR, **no** bank instructions, **no** initiation
control and **no** evidence intake.

Network discipline (§14): exactly **one** request is made in this state — the
order read. No FULL read, no QR, no initiate, no evidence call. Asserted.

The fee row is omitted rather than rendered empty, and the suite asserts no
standalone `0 VND` appears anywhere: *not priced yet* and *priced at nothing*
are different answers on the screen exactly as they are on the wire.

---

## L. AWAITING_PAYMENT / exact FULL

The highlighted payable total is `CustomerFullPaymentResponse.fullPaymentAmount`
— the obligation's own figure. The two supporting rows (`Tiền hàng`,
`Phí giao hàng`) are rendered from the order projection and are **never summed**.

`exact-order-amount.ts` contains no `Number(`, `parseFloat`, `parseInt`,
`toFixed`, unary `+` or `Math.round`, and no arithmetic operator is applied to
money anywhere in the feature. The boundary suite sweeps for all of them and
pins the feature's only two `Math.round` calls to a byte-progress percentage and
a kilobyte caption.

One exact string feeds the highlight, the copy control, the QR's context and the
attempt state, so the screen cannot disagree with itself.

---

## M. STEP_UP / initiate

Reused, not rebuilt: the same `useContactVerification` controller, the same
three approved cards, the same code lifetime and cooldown, differing in one
field — `purpose: STEP_UP`.

```text
customer presses  →  initiate  →  403 REVERIFICATION_REQUIRED
                  →  step-up dialog over this page (never a navigation)
                  →  verified  →  same initiation, same idempotency key
```

The dialog is embedded because leaving would unmount the only copy of the
credential. `NO_SECOND_OTP_SYSTEM`. Possession of the `ORDER_ACCESS` link is
deliberately not treated as sufficient to initiate.

`startAttempt` refuses when the server's own `payable` is false, and
`inFlightRef` is flipped synchronously before `mutate()` so two activations in
one tick cannot open two attempts.

No client-supplied amount, reference, obligation kind or order id — the request
body is `{ token }` and there is no field through which one could be sent.

---

## N. QR / textual fallback

`publicOrderFullPaymentQr`, enabled from the obligation's `payable` and never
from the order status. Object URL created after revoking any predecessor, and
revoked on replacement and unmount. `createObjectURL` is feature-detected and its
absence degrades to the textual fallback rather than taking the screen down.

**One** QR panel is mounted and placed by CSS grid into either the desktop aside
or the mobile stack. Mounting two and hiding one would put two identical images
in the accessibility tree and two download buttons in the tab order; the
component suite asserts exactly one of each.

The fallback is a property of the layout: the account, the exact amount and the
`FL` reference are all printed as selectable, copyable text beside the code.

---

## O. Evidence reuse / truth separation

`publicOrderDepositEvidenceUpload` / `_status`, unchanged. **No evidence
endpoint was added.** No delete, no replace, no preview — none exists on the
customer contract.

The transport path is deposit-named; the customer reads *ảnh xác nhận chuyển
khoản*. The boundary suite asserts no string literal in the copy catalog
contains *đặt cọc*, *tiền cọc* or *phần còn lại*.

Three vocabularies stay apart. An image's `assetStatus` never selects a payment
panel, `ACCEPTED` renders as *Ảnh dùng được* with a note saying the workshop
still has to check the transfer, and the section carries the approved warning
inline rather than as fine print elsewhere.

---

## P. Attempt identity / recovery

FULL current publishes no attempt state, so the feature holds "the attempt this
session opened" and never pretends to have recovered one. Nothing infers an
attempt from a payment status, invents a hidden id, queries an Admin API, or
persists an id.

A reload cannot recover the credential, so no persistence is added to recover
attempt state either (§34).

---

## Q. Fee-correction behaviour

`attemptMatchesObligation` compares the exact decimal **amount** strings.

The transfer reference is deliberately *not* the discriminator: the contract
states it names the order rather than the obligation and is byte-identical
across a correction, so comparing it would call a stale attempt current. The
model suite asserts exactly that, and asserts `1310000.00` ≠ `1310000.000`.

A superseded attempt is withheld from every consumer at once — the QR, the
instructions and the evidence intake — so evidence cannot migrate across
obligations, and `COPY.attempt.superseded` tells the customer the amount moved.

**A real defect was found and fixed here.** The first implementation refreshed
only the order projection on returning attention, which would have left a stale
payable amount on screen after a correction — the exact §24 failure, and one the
order status cannot reveal because a correction does not move it. `refresh()`
now also invalidates the FULL and QR keys, and exactly those two.

---

## R. READY_FOR_DELIVERY / DELIVERED / COMPLETED

Concise approved status, no payment action, no QR fetched, no FULL read issued.

No carrier, tracking code, ETA, map, courier timeline or shipment event is
rendered. The component suite asserts a forbidden-logistics list absent from the
whole rendered document, and the boundary suite asserts the same terms absent
from the source — so a future widening of the projection fails here rather than
shipping.

---

## S. CANCELLED / EXPIRED

Machine-readable only:

```text
CANCELLED + terminationReason = RESERVATION_EXPIRED  →  EXPIRED
CANCELLED + terminationReason absent                 →  CANCELLED
```

The suite asserts `Object.hasOwn(order, 'terminationReason') === false` on the
generic cancellation, so the fixture reproduces the wire shape rather than an
explicit `undefined`.

No `cancelled_reason` parsing, no `deadline < now`, no "missing FULL means
expired". The boundary suite asserts no `Date.now()` or `new Date(` in any file
that decides a state.

Neither terminal variant offers a payable control, and neither fetches a QR or
an obligation.

---

## T. Deadline / access-expiry behaviour

Two different facts, two different sentences, never conflated:

```text
paymentDeadline   "Xưởng giữ hàng cho bạn tới …"      the reservation's own expiry
accessExpiresAt   "Liên kết này hết hạn lúc …"        when the link stops opening
```

`paymentDeadline` is read, never computed, and disappears once no live
reservation stands — the fulfilment fixture omits the key and the suite asserts
the line is gone. Nothing counts down; nothing on this route re-renders because
time passed.

---

## U. Query / refetch strategy

```text
transient failure      →  the shell's own manual retry
tab becomes visible    →  one re-read  (order + FULL + QR)
window regains focus   →  one re-read
mutation success       →  the one key it changed
```

Coalesced through a 10-second quiet window so a rapid alt-tab fires one re-read,
not two. **No timer, no interval, no `refetchInterval`** — asserted by the
boundary suite. Admin verification is manual and may be hours away; a polling
loop would spend the secure-link budget to learn nothing.

Route-local client: `retry: false`, `gcTime: 0`, secret-free keys, no
persistence, no service worker.

---

## V. Secure unavailable / transient behaviour

Missing, malformed, revoked, expired, wrong-scope and fictional tokens all
collapse to the one APP4 unavailable card. No existence oracle, no
cause-specific message. Manual retry only for transient transport failure.

Mid-session death (§31): a later call answering `SECURE_LINK_UNAVAILABLE` ends
the session, clears the credential and replaces the whole screen. The suite
asserts the order code, the amount and the transfer reference are all **gone**
from the document afterwards — not hidden behind an overlay.

---

## W. SEO / sitemap / route authority

```text
noindex, nofollow    live-verified: <meta name="robots" content="noindex, nofollow">
canonical            none
openGraph            none
sitemap              absent (composed from the public inventory only)
robots.txt           /truy-cap prefix disallowed, unchanged
metadata             a static object; no generateMetadata on this route
```

`seo-private-metadata.test.ts` now drives ten private routes and asserts the
serialized metadata contains no origin, no `og:`, and nothing matching
`#t=|token|requestId|orderId|@|\+84`.

`node tools/check-storefront-route-authority.mjs` — PASS.

---

## X. Accessibility / responsive

One `h1`, owned by the authorized branch through the shell's `headingRef`, with
focus moved to it when the link settles and a visible focus ring. Status is
symbol + label + tone, never colour alone. Polite live regions announce the
settled state, the QR, the initiation and the step-up. Copy buttons are named by
the field they copy. The QR has a purposeful `alt` and a full textual fallback.
The evidence input is labelled and its error bound by `aria-describedby`.
Terminal states remove the controls from the tree rather than disabling them.

Live at three viewports (dev stack, unavailable state):

| viewport | horizontal overflow | `h1` count |
|---|---|---|
| 1440 | none | 1 |
| 1024 | none | 1 |
| 390 | none (375 ≤ 375) | 1 |

Screenshots: `evidences/app_12/s03/app12-s03-unavailable-{1440,1024,390}.png`.

---

## Y. Full live lifecycle evidence

```text
mode      pnpm --filter @embroidery/e2e-testing e2e:app12:s03
result    8 passed (6.3m), playwright exit 0
topology  ephemeral PostgreSQL + MinIO · real API · real worker (in-process)
          · real Storefront (next start) · real Nginx gateway · real Chromium
```

One real order per viewport, each walked the whole customer tail. Nothing is
mocked and nothing is seeded but the catalog — the customer, the verification,
the order, its reservation, its grant, its notification, its obligation, its
attempt and every transition are produced by the delivered application.

| step | proof |
|---|---|
| verified customer + order | real APP4 lane, real `publicReadyMadeOrder_create` |
| `ORDER_ACCESS` notification | real intent, delivered by the real worker |
| browser opens the link | the **real delivered token**, on S03's route (§Y.1) |
| `AWAITING_SHIPPING_FEE` | pill, next-action line, **no** total / QR / initiate |
| before-fee network discipline | FULL, QR, initiate and evidence calls = **0** |
| Admin sets the fee | `adminOrderShipping_save`, real staff session |
| `AWAITING_PAYMENT` | the exact obligation amount, read back from the database and compared against the customer's own screen |
| QR | real server-encoded PNG, exactly one `<img>`, one download control |
| textual fallback | bank, holder, account and the `FL` reference printed beside it |
| STEP_UP | the delivered APP4 dialog, driven by the delivered APP4 driver |
| initiate | one attempt, `PENDING`, at the obligation's exact amount |
| Admin verifies | `adminPaymentAttempt_verify` against the figures **the screen showed** |
| `READY_FOR_DELIVERY` | no initiate, no QR, deadline gone, access-expiry note kept |
| Admin dispatch | `adminOrder_dispatch` → `DELIVERED`, no tracking word on the page |
| Admin complete | `adminOrder_completion` → `COMPLETED`, terminal, link still opens |
| every viewport | exactly one `h1`, no horizontal overflow |

Screenshots: `evidences/app_12/s03/live/` — 18 for the three lifecycle runs, 4
for the other journeys, every one taken **after** the fragment strip.

### Y.1 The one defect the live tier found — `FU-APP12-S03-09`

The first run failed at the very first navigation, and the reason is a real,
customer-facing gap:

```text
delivered link  <origin>/truy-cap#t=<token>
S03's route     <origin>/truy-cap/don-hang
```

Hard evidence, all from delivered source:

1. `apps/worker/…/secure-link.renderer.ts` composes one path for **every**
   secure link: `SECURE_LINK_LANDING_PATH = '/truy-cap'`.
2. `renderSecureLinkUrl(origin, rawToken)` takes no scope and has no branch.
3. `OpenedDelivery` — what the worker decrypts — carries `channel`,
   `normalizedRecipient`, `secretKind`, `secret`, `issuedAt`, `expiresAt`. No
   scope, no reference.
4. `buildIntentParams` persists `{ kind: 'SECURE_ACCESS_GRANT', grantId }` and
   nothing else, and `SecureGrantNotifier` uses one `SECURE_LINK_TEMPLATE_KEY`
   for `REQUEST_ACCESS` and `ORDER_ACCESS` alike.
5. `app/truy-cap/page.tsx` mounts `CustomRequestStatusScreen`.

So the worker **cannot** know which landing an `ORDER_ACCESS` link belongs to,
and a Ready-Made customer's real link lands on the custom-request surface, where
their token is refused as wrong-scope and they see the unavailable card.

This is not an S03 implementation defect and it is not a frontend fix: it needs
the delivery contract to carry the grant's scope — a second template key, or a
scope on the intent params — which is a backend change §20 forbids this
checkpoint from inventing. It is therefore **recorded, not patched**.

The run isolates it rather than hiding it. `openSecureOrder` asserts the
delivered link still lands on `/truy-cap`, so the day the worker learns the
scope that assertion fails and the substitution is removed with it; it then
re-composes **the same real token** onto S03's route. The token, the grant, its
scope, its expiry and every authorization the surface performs are the
application's. Only the path is substituted, and that substitution *is* the gap.

### Y.2 Harness defects found and fixed

None of these were product defects. Each is recorded because the run only became
trustworthy once it was fixed.

| symptom | cause |
|---|---|
| the route 404'd | `next start` serves a **pre-built** `.next`, and the build predated the route. The run now requires a build — which itself needs `STOREFRONT_PUBLIC_ORIGIN` (`FU-APP12-S03-06`) |
| a failing assertion **printed a live token** | `expect.poll(…).toBe('')` prints its received value, and the received value was `location.hash`. Now polled as a **boolean**, so the message names no value |
| the fee row looked present before a fee | `getByText` is a case-insensitive **substring** match, and three approved sentences contain "phí giao hàng". Now matched on the amount card's own `<dt>` |
| `CANCELLED` looked present on `EXPIRED` | same cause: "Đã huỷ" is a substring of the approved EXPIRED sentence. Now scoped to the pill |
| the amount never matched | the highlight renders the amount and its currency as two elements; the reader took both |
| the expiry sweep never ran | it is a sequential **runtime loop**, not a queued job, so draining the queue can never reach it. Now resolves the real `ExpireReadyMadeReservationsUseCase` from the worker context |
| refreshes were silently dropped | the surface **coalesces** attention-triggered re-reads through a 10-second quiet window (§26). The run now waits it out and retries — one more visit per attempt, never a shortened window |
| an attempt looked opened when it was not | the transfer card is mounted from `payable` and is on screen *before* any attempt exists. The **evidence** section is the attempt's own observable |
| the step-up was assumed mandatory | it is **conditional** — GRD-003 asks only when no recent re-verification stands. The run now follows whichever branch the server chose, which is §18's actual rule |
| cross-order probes answered 429 | the secure-link limiter counts requests, never outcomes. Probes are now sequential, and a 429 is accepted as a refusal that discloses nothing |

---

## Z. Expiry live evidence

A separate disposable order, expired by the **real sweep**.

```text
create order → real ORDER_ACCESS link → AWAITING_SHIPPING_FEE on screen
make the reservation due (one timestamp, bounded seam)
run ExpireReadyMadeReservationsUseCase from the real worker context
→ orders.status             = CANCELLED
→ reservation.status        = EXPIRED
→ surface                   = "Hết hạn giữ hàng"
                              "Đơn đã huỷ vì quá hạn giữ hàng 24 giờ."
→ CANCELLED pill            absent
→ QR / initiate / evidence  absent
```

The only thing the harness writes is `expires_at`, on one row of a disposable
database. Everything after it — the claim, the release, the cancellation and the
`RESERVATION_EXPIRED` classification the surface reads — is the delivered code
inside the delivered transaction. Writing `status = 'EXPIRED'` directly would
have proved the fixture, which is the mistake `APP12-B03-C1` was rejected for.

Screenshot: `evidences/app_12/s03/live/journey-b-expired.png`.

---

## AA. Fee-correction / evidence live evidence

### AA.1 Fee correction and stale-attempt isolation

```text
Admin sets fee A → AWAITING_PAYMENT, FULL A → STEP_UP → attempt A opened
Admin sets fee B → FULL A SUPERSEDED, FULL B PENDING
                   (the order status does not move)
surface refetch  → amount = B, QR = B, "số tiền đã thay đổi" shown
                 → attempt A is not presented as B's
                 → payment_attempts for this order = 1, still bound to the
                   SUPERSEDED obligation
```

The fixture's two fees are chosen so that a screen which **summed** the order's
own subtotal and fee rows would print A while the server owed B. The order status
does not move across a correction — which is exactly why the first
implementation, refreshing only the order, would have left a stale amount, and
why the fix in §Q invalidates the obligation and the QR as well.

Screenshot: `evidences/app_12/s03/live/journey-c-fee-correction.png`.

### AA.2 Transfer evidence

A real PNG, through the delivered attempt-scoped operation, into this run's real
MinIO.

```text
upload             → payment_transfer_evidence rows for this order = 1
surface            → one evidence row, stating the **image's** own status
no payment claim   → no "đã thanh toán thành công" / "thanh toán hoàn tất" /
                     "đã nhận tiền" anywhere on the page
order              → still AWAITING_PAYMENT
obligation         → still PENDING
attempt            → still PENDING
new endpoint added → none
```

Screenshot: `evidences/app_12/s03/live/journey-d-evidence.png`.

### AA.3 Cross-order security

Two disposable orders. Five probes, **sequential**, each carrying a syntactically
valid 43-character token no grant was ever minted for — including one naming a
**real** attempt id belonging to the other order:

```text
publicReadyMadeOrder_current      refused
publicOrderFullPayment_current    refused
publicOrderFullPayment_qr         refused
evidence status (real attempt id) refused
evidence status (fictional id)    refused

no probe answered 200
no probe returned the other order's code
404 → SECURE_LINK_UNAVAILABLE, byte-identical
429 → the limiter answering before evaluation, which discloses nothing
```

Naming a real attempt id changes nothing: the refusal is indistinguishable from
the one for an attempt that does not exist.

### AA.4 Secure-link death mid-session

The grant is revoked out from under an open, authorized session — the second
bounded seam, and the only one available, because no delivered command revokes an
`ORDER_ACCESS` grant and adding one to make a test pass is forbidden. It writes
the three columns the issuer's own revoke path writes (`status`, `revoked_at`
and `revoke_reason`, the last required by a check constraint) and lets the
application decide what that means.

```text
before  order code, amount and reference on screen
after   the same indistinguishable unavailable card
        order code     gone
        amount         gone
        reference      gone
        cause          not disclosed
        location.hash  still empty
        storage        still empty
```

Screenshot: `evidences/app_12/s03/live/security-link-death.png`.

---
## AB. Secret-artifact hygiene

No secure token, token hash, encrypted envelope, real contact, bank secret,
session cookie or step-up code appears in this report. The fixture's bank values
are synthetic and marked `(DEMO)` with the unassigned BIN `970000`. The test
token is APP4's shared synthetic constant, defined once and asserted **absent**
from caches, storage, the URL, history state and the DOM.

### The live tier handles a **real** credential, and never lets it out

```text
trace   = off      video = off      HAR = off      screenshot = off (per-shot only)
secret-bearing artifacts produced = 0
```

The first navigation of every journey carries a live `ORDER_ACCESS` token in the
URL fragment, so the `app12-s03` project disables trace, video and HAR as a
**security control** rather than a performance one: any of them would record the
token into an artifact that outlives the disposable database the rest of the run
is careful to drop. Verified after the run — no `.zip`, `.webm` or `.har` exists
under `test-results/`.

The token itself is never returned to a spec, printed, attached or put in a
filename. `openSecureOrder` reads it from the recording adapter, hands it to
`page.goto`, and gives the caller back a settled page; the only observable a spec
ever gets is that navigation worked.

All 22 screenshots are taken **after** the strip, which each journey asserts
before it takes one.

One harness defect in this area was found and fixed, and it is worth recording
because it is the exact trap this section exists for: an early
`expect.poll(…).toBe('')` on `location.hash` **printed the live token** into the
console and the report when it failed, because Playwright prints the received
value. It is now polled as a boolean, so the assertion can only ever say yes or
no.

`node tools/check-report-secrets.mjs` — see §AH.

---

## AC. Shared-dev / disposable hygiene

```text
shared_dev_S03_orders        = 0   (READY_MADE orders in the shared dev DB)
shared_dev_S03_attempts      = 0
shared_dev_S03_evidence      = 0
shared_dev_S03_grants        = 0
shared_dev_S03_fixture_rows  = 0
G03_data_created             = false

disposable_db_used           = true
disposable_db_removed        = true
disposable_minio_used        = true  (the evidence journey uploads a real image)
disposable_minio_removed     = true  (dropped with its compose project)
```

Every commercial row this checkpoint created — 7 orders across the eight
journeys, their reservations, obligations, attempts, evidence and
`ORDER_ACCESS` grants — was written to the run's own ephemeral database and
dropped with it. The run's own teardown reported
`cleanup verified: all E2E ports closed, disposable database dropped`, and the
`finally`/signal handlers make that true on failure and on interrupt as well.

Verified afterwards, directly:

```text
shared dev: select count(*) from orders where origin='READY_MADE'  →  0
databases matching '%e2e%'                                          →  0
```

`s03-order-fixture.mjs` refuses any database whose name does not begin
`embroidery_db7_`, so pointing the run at the shared stack is a hard failure
rather than a mistake to be noticed afterwards. That guard matters more here than
in S02: an order's line is undeletable by design, a satisfied obligation is
immutable history, and a dispatch snapshot is frozen by a trigger — dropping the
whole database is the only cleanup that cannot leave something behind.

Thirteen `embroidery_db7_*` databases remain on the **shared dev** PostgreSQL,
all pre-existing (`db10_cp2_source`, `app12_b03_race`). None is this run's, and
none was created or touched by S03.

**One dev-environment change was made, and it touched no data and no `.env`.**
The `storefront` container was recreated with `STOREFRONT_PUBLIC_ORIGIN` supplied
from the shell, because the variable is absent from `.env` and compose was
substituting empty — which made the **root layout's** `generateMetadata` throw
for *every* Storefront route in a browser. That is a pre-existing, stack-wide
gap (`APP12-G02-C1` recorded the same symptom), not an S03 defect. `.env` was not
written to, in line with `CLAUDE.md` §8a; the value was passed
`STOREFRONT_PUBLIC_ORIGIN=… docker compose --env-file .env up -d storefront`, so
it lives only in that container until it is next recreated. **The operator should
decide whether to persist it.**

---

## AD. APP7 / APP9 / S01 / S02 regressions

No APP7 or APP9 source was modified. The step-up dialog frame was **copied**
into this feature rather than promoted out of `secure-final-payment`, precisely
because §50 forbids editing that source here; promoting it is
**`FU-APP12-S03-03`**.

```text
secure-final-payment.test.tsx        PASS
secure-deposit-payment.test.tsx      PASS
secure-deposit-source.test.ts        PASS
ready-made-checkout.test.tsx         PASS   (S02 success copy, no auto-navigation)
ready-made-purchase.test.tsx         PASS   (S01 handoff)
release-isolation-gate.test.ts       PASS   (64 cases, Wave-2 isolation)
```

Full Storefront suite: **129 suites / 2473 tests, all passing.**

---

## AE. Figma / source mapping

```text
FIGMA_DELTA = 0
```

| frame / node | implemented in |
|---|---|
| `910:258` · `911:366` | `order-access-content.tsx` + the six stylesheets |
| `910:284`…`910:289` | heading, pill, order line |
| `910:293`…`910:305` | `order-amount-card.tsx` |
| `910:306`…`910:324` | `transfer-instructions-card.tsx` |
| `910:325`…`910:329` · `911:415`…`911:419` | `order-qr-panel.tsx` |
| `910:330`…`910:334` | `evidence-section.tsx` + `evidence-list.tsx` |
| `910:335` · `911:420` | the access-expiry `OrderNote` |
| `911:308`…`911:365` | `order-access-copy.ts` `states` + `next-action-card.tsx` |
| `917:407` (`REUSE_AS_IS`) | APP4 `SecureLinkShell`, unchanged |
| `917:421` (`REUSE_AS_IS`) | `order-status-pill.tsx` |

---

## AF. Files changed

**New — feature (23)**

```text
apps/storefront/src/app/truy-cap/don-hang/page.tsx
apps/storefront/src/features/secure-ready-made-order/index.ts
  api/secure-ready-made-order.client.ts
  hooks/use-secure-order-session.ts · use-full-payment.ts
        use-full-payment-qr.ts · use-transfer-evidence.ts
  model/order-access-copy.ts · order-access-state.ts · order-access-failure.ts
        order-access-query-keys.ts · exact-order-amount.ts
        order-display-format.ts · transfer-evidence.ts
  styles/secure-ready-made-order.scss · _secure-order-tokens.scss
         _secure-order-layout.scss · _secure-order-facts.scss
         _secure-order-qr.scss · _secure-order-evidence.scss
         _secure-order-dialog.scss
  ui/secure-order-screen.tsx · order-access-content.tsx · next-action-card.tsx
     order-amount-card.tsx · transfer-instructions-card.tsx · order-qr-panel.tsx
     evidence-section.tsx · evidence-list.tsx · order-status-pill.tsx
     order-note.tsx · order-dialog.tsx · order-step-up-dialog.tsx
     copy-value-button.tsx
```

**New — tests (4)**

```text
apps/storefront/test/components/secure-ready-made-order.test.tsx
apps/storefront/test/boundary/secure-ready-made-order-source.test.ts
apps/storefront/test/model/order-access-state.test.ts
apps/storefront/test/support/secure-ready-made-order-fixture.ts
```

**New — live acceptance harness (4)**

```text
packages/e2e-testing/support/app12/s03-order-fixture.mjs
  evidence reader + the two bounded disposable seams (§Z, §AA.4)
packages/e2e-testing/specs/app12/support/s03-world.ts
  the run's world: real order, real link, strip proof, retried refresh
packages/e2e-testing/specs/app12/support/s03-admin-driver.ts
  real staff login + the four delivered Admin operations
packages/e2e-testing/specs/app12/s03-lifecycle.acceptance.spec.ts
packages/e2e-testing/specs/app12/s03-journeys.acceptance.spec.ts
```

**Modified (14)**

```text
packages/api-client/src/orders-and-payments.ts          consumer-driven release
apps/storefront/src/styles/main.scss                    one @use
apps/storefront/test/acceptance/app10-e01-contact-handoff.acceptance.test.tsx
apps/storefront/test/acceptance/app11-e01.acceptance.test.ts
apps/storefront/test/boundary/gallery-detail-source.test.ts
apps/storefront/test/boundary/gallery-feed-source.test.ts
apps/storefront/test/boundary/homepage-source.test.ts
apps/storefront/test/boundary/ready-made-purchase-source.test.ts
apps/storefront/test/smoke/seo-private-metadata.test.ts
apps/storefront/test/unit/release-isolation-gate.test.ts

packages/e2e-testing/playwright.config.ts               app12-s03 project, trace/video/HAR off
packages/e2e-testing/scripts/run-e2e.mjs                --app12-s03 mode
packages/e2e-testing/package.json                       e2e:app12:s03
packages/e2e-testing/specs/app12/support/s02-world.ts   two accessors, one return value
```

The S02 world gains `s02Worker()` and `s02Runtime()` — the recording adapter the
delivered link comes from, and the worker context the real expiry sweep is
resolved out of — and `verifyContact` now returns the address it verified, so a
step-up can re-verify the **same** customer. No S02 behaviour changed and the S02
suite is unaffected; the accessors mirror the `s02Evidence()` that was already
there.

The api-client edit is the **consumer-driven release** that barrel was explicitly
waiting for: it carried a comment reserving `publicReadyMadeOrder_current` for
"`APP12-S03` … when it lands". Four operations, three response types and the
`terminationReason` value enum now cross. No generated file was edited.

---

## AG. File-size evidence

```text
node tools/check-file-size.mjs <the feature, the route, the four test files,
                                the api-client barrel>
→ File-size check passed (0 file(s) above the review threshold)

node tools/check-scss-file-size.mjs <the feature's styles>
→ SCSS file-size check passed (7 stylesheet(s), 0 above the review threshold)
```

`_secure-order-layout.scss` reached 427 lines during implementation and was split
by responsibility into a page-frame partial and a facts/controls partial — not by
line range.

The feature is 13 model/hook/api modules and 13 components. There is no
eight-state component.

---

## AH. Validation

Commands actually run, selected per `VALIDATION_GOVERNANCE.md` §3:

```text
git diff --check                                                    clean
pnpm --filter @embroidery/storefront typecheck                      PASS
pnpm --filter @embroidery/storefront lint                            PASS
pnpm --filter @embroidery/storefront exec jest                       129 suites / 2473 tests PASS
pnpm --filter @embroidery/api-client typecheck                       PASS
pnpm --filter @embroidery/api-client test                            7 tests PASS (client in sync)
pnpm --filter @embroidery/e2e-testing typecheck                      PASS
pnpm --filter @embroidery/e2e-testing lint                           PASS
node tools/check-file-size.mjs <scoped>                              PASS
node tools/check-scss-file-size.mjs <scoped>                         PASS
node tools/check-app-scss.mjs storefront                             PASS (compiles, 1 pre-existing deprecation)
node tools/check-storefront-route-authority.mjs                      PASS
node tools/check-category-source-of-truth.mjs                        PASS (2512 files)
node tools/check-figma-design-index.mjs                              PASS (553 registry IDs)
npx prettier --check <changed files>                                 PASS (after --write)
node tools/check-report-secrets.mjs <this report>                    PASS for this report
live dev stack: route, metadata, release gate, 3 viewports           PASS
```

The secret checker sweeps the whole reports directory rather than only the file
it is given. It reports **two pre-existing** findings and neither is this
report's:

```text
APP6-B04-COMPLETION-REPORT.md:93
APP9-G01-COMPLETION-REPORT.md:381
```

Both are inherited debt this checkpoint did not cause and is not authorized to
edit. `APP12-S03-COMPLETION-REPORT.md` produces no finding.
Recorded as `FU-APP12-S03-08`.

### The live tier

```text
pnpm --filter @embroidery/e2e-testing typecheck            PASS
pnpm --filter @embroidery/e2e-testing lint                 PASS
node scripts/check-e2e.mjs                                 PASS (124 tests collect)
pnpm --filter @embroidery/e2e-testing e2e:app12:s03        8 passed (6.3m), exit 0
  full lifecycle @ 1440 · 1024 · 390                       PASS
  expiry                                                   PASS
  fee correction                                           PASS
  evidence                                                 PASS
  cross-order security                                     PASS
  secure-link death                                        PASS
disposable DB + MinIO teardown                             verified by the run
shared-dev residue                                         0 (re-queried directly)
```

`apps/storefront: pnpm build` is a **prerequisite** of the live tier and is now
known to be one: the harness starts the Storefront with `next start`, which
serves a pre-built `.next`, so a stale build silently serves the 404 page for a
new route. The build itself needs `STOREFRONT_PUBLIC_ORIGIN`
(`FU-APP12-S03-06`); it was supplied from the shell, never written to `.env`.

Not run, and deliberately: full monorepo, Admin suite, worker suite, global UAT,
performance, any Figma write, any repository-wide aggregate.

---

## AI. Baseline freeze

```text
OpenAPI            125 paths / 138 operations / 277 schemas   unchanged
public operations  49                                          unchanged
release matrix     28 STATIC_DENY / 18 STATIC_ALLOW / 3 SCOPE_GATED  unchanged
migrations         38                                          unchanged
DB schema          unchanged
Figma              unchanged (FIGMA_DELTA = 0)
Storefront routes  19 → 20
HTTP/API delta     0
```

The generated-client sync test passes, which is the executable statement that no
OpenAPI artifact moved.

---

## AJ. Follow-ups

| id | statement | owner |
|---|---|---|
| `FU-APP12-S03-01` | The `h1` does not vary across the eight states, as `911:306` specifies. It reads payment-specific on the three terminal states. PO to rule on whether the design should gain per-state headings. | **`APP12-V02`** |
| `FU-APP12-S03-02` | `910:334` prints *(tối đa 3)*; the delivered quota and `917:420`'s *cùng giới hạn* directive are 5. The frame's literal should be corrected. | **`APP12-V02`** |
| `FU-APP12-S03-03` | Four features now carry a copy of the same modal frame behaviour. Promoting it to `shared/` is a checkpoint of its own; §50 forbade doing it here. | **`APP12-H01`** |
| `FU-APP12-S03-04` | The QR hint's directional word was dropped so one panel could serve both breakpoints. | **`APP12-V02`** |
| `FU-APP12-S03-05` | The exact-money formatter is now stated in a fifth feature boundary. Promotion needs the delivered boundary guards to move with it. | **`APP12-H01`** |
| `FU-APP12-S03-06` | `STOREFRONT_PUBLIC_ORIGIN` is absent from `.env`, so every Storefront route errors in a browser in the dev stack **and the production build refuses to prerender**. `.env` was not written to. | **`APP12-H02`** |
| `FU-APP12-S03-07` | ~~The `app12-s03` disposable mode and the live journeys.~~ **CLOSED by this checkpoint** — reclassified as current-checkpoint acceptance work and delivered (§Y, §Z, §AA). | `APP12-S03` — closed |
| `FU-APP12-S03-08` | `check-report-secrets.mjs` reports two pre-existing findings in the `APP6-B04` and `APP9-G01` reports. Inherited debt; this checkpoint is not authorized to edit either. | **`APP12-H01`** |
| **`FU-APP12-S03-09`** | ~~**The delivered `ORDER_ACCESS` notification links to `/truy-cap`, the custom-request landing, so a Ready-Made customer's real link cannot open their order.**~~ **CLOSED_BY_APP12_S03_C1** — the landing is now selected from the grant's persisted `scope_kind` and carried to the renderer in the sealed delivery payload. Discovery evidence stays in §Y.1; the fix and its proof are in the C1 report. | closed — `APP12-S03-C1` |

---

## AK. Roadmap

```text
ROADMAP_STATUS = LOCKED
ROADMAP_LOCK   = LOCKED
CHECKPOINTS    = 38

APP12-S03 = COMPLETE_AFTER_C1
APP12-A01 = NEXT
```

Exactly one NEXT. `APP12-A01` was **not** started: no Admin UI, no category
management, no Ready-Made queue, no shipping-fee editor, no verification or
fulfilment screen. The Admin operations this checkpoint exercised were driven
from the **test harness** against already-delivered HTTP operations, and the
production Storefront imports no Admin client operation — asserted by the
boundary suite.

Nothing was committed and nothing was pushed.
