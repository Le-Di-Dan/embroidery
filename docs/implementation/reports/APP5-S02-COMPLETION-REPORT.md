# APP5-S02 — Confirmation & Grant-Scoped Request Status — Completion Report

## Verdict

```text
APP5-S02 = COMPLETE
```

Two Storefront surfaces ship: the submission confirmation at `/yeu-cau/da-gui`,
and the grant-scoped single-request status at `/truy-cap`. No backend, database,
worker, OpenAPI, generated-client or Figma artifact changed.

Two design divergences are recorded as follow-ups rather than invented data
(§9). Neither is a blocker under §25, and both are stated in the report rather
than only in code.

---

## 1. Baseline and authority

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `611440c` — `feat(app5): create and submit a custom request from the storefront` (`APP5-S01`) |
| S01 baseline | `/yeu-cau/da-gui` existed as a route boundary rendering `null`; `/truy-cap` was APP4's landing with an empty "APP5+" handoff slot |
| Backend contract consumed | `APP5-B03` — `POST /api/public/custom-requests/status`, `operationId publicCustomRequest_status`, generated as `publicCustomRequestStatus` |
| APP4 source reused | `apps/storefront/src/features/secure-link-access` — the fragment reader/stripper, the credential lifetime, and the bootstrap / unavailable / transient cards |

### Figma rows consumed

All rows were already `APPROVED_FOR_IMPLEMENTATION` under
`FIG-APPROVAL-APP5-D01-PO-001` in the repository copy of
`docs/design/FIGMA_DESIGN_INDEX.md`, so **the registry was not edited** and the
registry checker was not run (§1, §23).

Every node below was opened live and read through the Figma MCP before code was
written (file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_05`).

| Registry id | Node | Surface |
|---|---|---|
| `FIG-APP5-S02-CONFIRM-DESKTOP` | `660:3` | Confirmation, desktop 1440 |
| `FIG-APP5-S02-CONFIRM-MOBILE` | `660:53` | Confirmation, mobile 390 |
| `FIG-APP5-S02-STATUS-DESKTOP-NEW` | `661:3` | Status — `NEW` |
| `FIG-APP5-S02-STATUS-DESKTOP-UNDERREVIEW` | `661:67` | Status — `UNDER_REVIEW` |
| `FIG-APP5-S02-STATUS-DESKTOP-NEEDSCLARIFICATION` | `661:131` | Status — `NEEDS_CLARIFICATION` |
| `FIG-APP5-S02-STATUS-DESKTOP-REJECTED` | `661:199` | Status — `REJECTED` |
| `FIG-APP5-S02-STATUS-DESKTOP-CANCELLED` | `661:267` | Status — `CANCELLED` |
| `FIG-APP5-S02-STATUS-DESKTOP-LOADING` | `661:335` | Status — loading |
| `FIG-APP5-S02-STATUS-MOBILE-NEEDSCLARIFICATION` | `661:352` | Status — mobile 390 |

### APP4 security rows reused, not redrawn

`FIG-SECURELINK-DESKTOP-BOOTSTRAP` `629:3` · `FIG-SECURELINK-DESKTOP-AUTHORIZED`
`629:20` · `FIG-SECURELINK-DESKTOP-UNAVAILABLE` `629:37` ·
`FIG-SECURELINK-DESKTOP-NETWORKERROR` `629:53` ·
`FIG-SECURELINK-MOBILE-AUTHORIZED` `629:70` ·
`FIG-SECURELINK-MOBILE-UNAVAILABLE` `629:87`.

The APP5 loading frame states the boundary itself (`661:335` spec strip): *the
grant-resolution step is `APP4-S02`'s, APP5 content is built only after a valid
grant, and the single "unavailable" state stays APP4's and is not redrawn.* The
implementation follows that literally — APP5 fills the authorized slot and draws
none of the four access states.

---

## 2. Confirmation — `/yeu-cau/da-gui`

| Requirement | How it is met |
|---|---|
| Route | `apps/storefront/src/app/yeu-cau/da-gui/page.tsx` — an async **Server Component** that reads `searchParams.ma`, validates it, and mounts the screen. No `'use client'`, no hook, no query client. |
| Code validation | `readRequestCode` matches the locked generator shape exactly: `REQ-` + 10 characters over `23456789ABCDEFGHJKMNPQRSTVWXYZ` (`G01-D12`). Nothing is repaired — no trim, no upper-casing, no prefix insertion — and a repeated `?ma=` (which Next surfaces as an array) is not a code either. |
| Display-only | The code is rendered as a `<p>`: no link, no button, no copy affordance. `660:14` is rendered verbatim beside it — *"Nó không mở được yêu cầu — chỉ liên kết trong email mới mở được."* |
| No lookup by code | Proved twice. The component suite replaces the **whole** `@embroidery/api-client` module with a proxy whose every export throws, so any network reach fails the test rather than passing against a mock returning `undefined`. The browser proof observes **0** `/api/` requests on the route. No lookup-by-code endpoint was added. |
| Missing / malformed code | Renders the confirmation with `missingCode` copy — the customer *did* submit, so the page still confirms, but it names no request. No API call on this path either. Proved for 10 inputs including empty, unprefixed, wrong length, an excluded character (`0`), lower case, padded, arbitrary Vietnamese text, markup, and a repeated parameter. |
| Secure-link continuation | `660:17`–`660:20` rendered: the tracking link went to the verified contact, it is how status is seen later, it lasts 7 days, it is personal, and what to do if the message did not arrive. |
| No APP6 promise | `660:26` ("chưa được duyệt, chưa được báo giá và chưa thành đơn hàng") plus the whole of `660:44` — quotation, design approval, deposit/payment and order named **as absences**. |
| No account or list | No sign-in, no "my requests", no history. None exists to link to: this system has no customer session at all. |

---

## 3. `/truy-cap` architecture

```text
capture location.hash  →  stripSecureLinkFragment (history.replaceState)
                       →  clean URL
                       →  publicCustomRequestStatus  (the only call)
                       →  clear credential on definitive settlement
                       →  render one request
```

**`APP4-B06` is not called before `APP5-B03`.** `publicSecureLinkResolve` is not
reached anywhere on the credential path. B03 already performs the entire APP4
authorization chain internally — policy, secure-link rate limiter, secure-link
resolution, the exact `customRequestId` the grant names, then the customer-safe
projection — so a chained `resolve → status` would authorize the same token
twice, spend the same per-IP abuse budget twice, hold the raw credential across
two flights, and add a round trip whose only result is a request id B03 resolves
for itself and never discloses.

B06 was **not** deleted: the endpoint stays published, and
`publicSecureLinkResolve` stays exported from the curated api-client boundary
because APP4 owns that contract. This landing simply does not call it.

Three independent pieces of evidence:

- **Component test** — `custom-request-status.test.tsx` mocks
  `publicSecureLinkResolve` alongside B03 purely to assert
  `expect(resolveMock).not.toHaveBeenCalled()` on the bootstrap and on the retry.
- **Browser proof** — the only `/api/` request observed on a successful landing
  is `POST /api/public/custom-requests/status`; nothing matching `secure-links`
  is ever issued.
- **Static gate** — `tools/check-app4-s02.mjs` now fails if
  `publicSecureLinkResolve` appears anywhere in either feature, with its own
  mutation case in `check-app4-s02.test.mjs`. The failure is invisible on screen
  — a chained page renders identically — so it needs a check that reads source.

### Shared machinery, generalised rather than copied

`secure-link-access` keeps one fragment parser, one strip and one credential
lifetime for the whole Storefront:

- `model/secure-link-fragment.ts` — **unchanged**. Same `#t=` key, same
  `^[A-Za-z0-9_-]{43}$` shape (which `ReadCustomRequestStatusBody.token`
  publishes identically to `ResolveSecureLinkBody.token`, so one parser serves
  both), same `history.replaceState` to a pathname-and-search URL.
- `model/secure-link-state.ts` — the four states, now generic over the
  authorized payload, as a discriminated union so an unavailable or transient
  screen *cannot* read a payload it never had.
- `hooks/use-secure-link-bootstrap.ts` — the controller, renamed from
  `use-secure-link-resolution.ts` and parameterised by the one call the
  credential is spent on. The capture → strip → request order is still three
  straight-line statements in one synchronous block.
- `ui/secure-link-shell.tsx` — replaces `secure-link-screen.tsx`; draws the three
  access states and hands the authorized branch its payload and the page
  heading ref.
- **Deleted:** `api/secure-link.client.ts` (the browser-side B06 caller) and
  `ui/secure-link-authorized-card.tsx` (the empty "APP5+" slot, per §15).

`ResponsiveText` was promoted from the APP4 feature to
`apps/storefront/src/components/` — three features now render approved copy
pairs that diverge in *words* rather than type size, which makes app-shared the
narrowest scope that still holds all of them.

---

## 4. Token secrecy

The raw token exists in exactly three places: `location.hash` on arrival, one
`useRef` inside the bootstrap hook, and one B03 request body in flight. It is
cleared on success, on a definitive refusal, on a missing-or-malformed fragment
and on unmount; it is kept **only** across a transient failure, because that
carries no verdict and the fragment is already gone.

The mutation is declared with **no variables** — `mutate()` takes no argument
and the credential is read from the ref inside `mutationFn` — so TanStack's
retained `variables` is permanently `undefined`, and `reset()` on settlement
drops the entry entirely. The route-local client is `retry: false, gcTime: 0`.

Proved absent from: the URL after bootstrap, `history.state`, `localStorage`,
`sessionStorage`, `document.cookie`, the rendered DOM, the console, request
headers, TanStack mutation `variables`, and the serialised mutation cache — in
both the component secrecy suite and the browser proof. **No token literal
appears in this report**; the synthetic values live only in
`apps/storefront/test/support/secure-link-fixture.ts` and in the browser-proof
script.

One recorded nuance: the browser proof asserts `localStorage` is empty and that
no non-`__next` key exists in `sessionStorage`, rather than asserting
`sessionStorage` is empty outright — the Next **dev** server parks its own
`__next_debug_channel` there. What the assertion actually guards is unchanged:
no storage key or value anywhere carries the credential.

---

## 5. Status projection

`APP5-B03`'s response is narrowed once, at the hook boundary, into exactly what
`661:*` draws. Two reasons, both about what components must be unable to see:

**Identifiers do not survive the projection.** `requestId`, `assetId`,
`productId`, `productVariantId` and `productSlug` are dropped before render, so a
component *cannot* print one rather than merely not doing so today. The only
identifier on screen is the human code, which opens nothing.

**The generated types are unusable as they stand.** Every nullable string in the
contract — `productName`, `variantColorName`, `customerVisibleReason`,
`sizeLabel`, the two millimetre columns — reaches Orval as
`{ [key: string]: unknown } | null` rather than `string | null`, because the
publishing decorator named no `type` (the same defect `APP5-B07` hit and
documented). The generated artifact may not be hand-edited and this checkpoint
may not regenerate it, so a `typeof value === 'string'` guard narrows them once,
at the boundary — which is also the honest runtime check for a field the server
is entitled to omit. **Recorded as `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01`.**

| State | Badge (`661:*`) | Reason card | Progress |
|---|---|---|---|
| `NEW` | Mới (info) | none | 1 done |
| `UNDER_REVIEW` | Đang xem xét (warning) | none | 1–2 done |
| `NEEDS_CLARIFICATION` | Cần bổ sung thông tin (warning) | *Xưởng cần bạn làm rõ* | 1–2 done, 3 pending |
| `REJECTED` | Đã từ chối (error) | *Lý do từ chối* | 1–3, 3 closed |
| `CANCELLED` | Đã huỷ (error) | *Lý do huỷ* | 1–3, 3 closed |
| `QUOTED` · `QUOTE_ACCEPTED` · `DIGITIZING` · `DESIGN_REVIEW` · `APPROVED` | Đang xử lý (neutral) | none | 1–3 done |

The sixth row is not a frame. B03 publishes the **full** LC-11 enum truthfully,
so a request APP6 has already quoted will arrive here. Mapping one of those onto
an APP5 state would tell the customer something false and crashing would make
the page fail the moment the next phase ships, so they collapse into one
neutral, accurate, action-free reading. The mapping is an exhaustive `switch`
over the published enum, so a new member points TypeScript at that file. Its
badge deliberately keeps the base border and text colour: a state this phase
never drew must not borrow the colour of one it did.

**Subject.** Catalog renders `Loại / Sản phẩm / Màu / Kích cỡ` from
`productName`, `variantColorName`, `variantSizeLabel`; a field B03 reports as
absent renders *"Không hiển thị được"* rather than a guess, so an unresolvable
catalog pair never names the wrong product and a later unpublication cannot make
the request unreadable. `productSlug` is deliberately unused — no link back into
the catalog. Customer-owned renders `Vật phẩm`, an optional `Mô tả`, and
`Kích thước` as `120 × 80 mm` (trailing zeros of the exact `numeric` string
dropped for reading only). A `null` subject stays readable: state, quantity and
attachments all still render.

**Quantity.** Rendered line by line exactly as submitted (`L × 1`, and `× 1` for
a line with no size label). No line is merged, split, or inferred into a second
request variant.

**Assets.** A role label per attachment and nothing else — which is precisely
what `661:39`–`661:47` draw: grey tiles reading *Ảnh vật phẩm* / *Tham khảo*, not
images. That is not a placeholder awaiting artwork: APP5 publishes no
customer-facing delivery for a private request asset (`APP5-B06` is Admin-only
and is not this checkpoint), so a tile is the whole truthful rendering. No object
key, bucket, scanner state or invented signed URL exists in the data that
reaches the screen, and the proof asserts zero `<img>` elements.

---

## 6. Reason privacy

Only `customerVisibleReason` is ever rendered as a reason, and the card that
renders it takes a **string** — not a request, not a transition, not a note. The
internal moderation reason, the moderation note, the moderator's identity, the
transition history and every audit field are not merely unrendered: they are not
in the response, have no property on `CustomRequestStatusResponse`, and cannot
be planted even by a test fixture. `APP5-B05` keeps them on rows this endpoint
never reads; `APP5-B03` owns the separation.

`661:181` is rendered under every reason, telling the customer the same thing in
their own words: *"Ghi chú nội bộ của xưởng không hiển thị ở đây."*

`APP5-B05` permits a transition with no customer-facing message. The card still
renders — the state is what the customer came to read — and says plainly that no
message was written, rather than showing an empty panel that reads as a failure
to load.

---

## 7. No customer mutation

`661:59` is a card whose entire content is what this page does not do, and it
renders in every state. There is no cancel, approve, accept-quote, pay, edit,
upload or resubmit control anywhere; `NEEDS_CLARIFICATION` is informational, and
its guidance says so — *answer where the workshop contacted you, this page has no
reply box.* The suites assert **0** buttons, forms and inputs inside the request
content in all five APP5 states and all five APP6+ states, and the browser proof
confirms it on a live render.

---

## 8. Api-client boundary

Added, by the consumer that needed them, from the already generated client:

```text
publicCustomRequestStatus                            (operation)
CustomRequestStatusResponseStatus                    (value — the full LC-11 enum)
RequestAssetResponseRole                             (value)
CatalogRequestSubjectResponseKind                    (value — the union discriminant)
CustomerOwnedRequestSubjectResponseKind              (value — the union discriminant)
ReadCustomRequestStatusBody                          (type)
CustomRequestStatusResponse                          (type)
CatalogRequestSubjectResponse                        (type)
CustomerOwnedRequestSubjectResponse                  (type)
RequestQuantityLineResponse                          (type)
RequestAssetResponse                                 (type)
```

No Admin APP5 operation crossed. `publicSecureLinkResolve` and its types remain
exported, unchanged, as APP4's. **No generated file was edited, no OpenAPI
document was regenerated, and no client codegen was run** — every symbol above
already existed in `embroidery-api.ts` / `embroidery-api.schemas.ts` and was
only re-exported from the curated index.

---

## 9. Design divergences, recorded rather than invented

Both are cases where an approved frame draws a value this checkpoint has no
authorized way to obtain. Neither is a §25 blocker; both are stated here and
carried as follow-ups.

**`FU-APP5-S02-CONFIRMATION-SUMMARY-01`** — `660:3` and `660:53` carry a
*"Bạn đã gửi gì"* panel: item name, dimensions, quantity, attachment counts and
the submitted-at instant. Every field in it is request data, and
`/yeu-cau/da-gui` holds nothing but a display code. Rendering it would require a
lookup keyed on that code — the exact surface `G01 §5` forbids and §7 explicitly
rules out. The customer reaches that panel through the secure link the
confirmation points at, where it is grant-scoped and B03 returns it. The panel is
omitted; the rest of both frames ships.

**`FU-APP5-S02-MASKED-CONTACT-01`** — `660:18` / `660:66` and the `661:*` secure
access bar print a masked contact (`b***@vidu.com`). Neither B03 nor any
authorized public read publishes a contact. The confirmation names the verified
contact without reproducing it (*"tới liên hệ bạn đã xác minh"* — the same
contact the customer verified minutes earlier, so it identifies itself), and the
status bar keeps the half of `661:8` that B03 *does* publish: the absolute
`accessExpiresAt`.

---

## 10. Validation ledger

Every command was selected from the change-impact table in §23; a green command
on an unchanged covered tree was not repeated.

| Command / test | Impact reason | Result | Reruns |
|---|---|---|---:|
| `pnpm --filter @embroidery/api-client typecheck` | the curated index gained B03 exports | PASS | 0 |
| `pnpm --filter storefront typecheck` | every source and test file this checkpoint touched | PASS | 2 (both fixing `exactOptionalPropertyTypes` friction the run itself surfaced) |
| `npx jest test/components/custom-request-confirmation.test.tsx` | new confirmation surface | PASS | 1 (fixed a `jest.mock` hoist-TDZ in the test itself) |
| `npx jest test/components/custom-request-status.test.tsx` | new bootstrap consumer | PASS | 0 |
| `npx jest test/components/custom-request-status-content.test.tsx` | new status projection and states | PASS | 1 (fixed fragment re-seeding between renders in the test itself) |
| `npx jest test/components/custom-request-status-secrecy.test.tsx` | adapted APP4-S02 secrecy proof | PASS | 0 |
| `npx jest test/components/custom-request-route.test.tsx` | `/yeu-cau/da-gui` is no longer a `null` segment | PASS | 0 |
| `node tools/check-app4-s02.mjs` | §22 — the checker's parsed inputs changed | PASS | 1 (after reconciliation) |
| `node --test tools/check-app4-s02.test.mjs` | the checker source changed | PASS (35/35) | 1 (after anchor updates) |
| S02 browser proof — 36 assertions across 6 legs | §21 | PASS (36/36, exit 0) | 3 (two locator/navigation corrections in the script, one storage-assertion correction) |
| `npx eslint` on the changed Storefront scope | scoped lint | PASS | 0 |
| `npx prettier --check` on the changed scope | scoped format | applied `--write`, then clean | 1 |
| `git diff --check` | whitespace | PASS | 0 |

Total focused component assertions: **77 tests across 5 suites**.

**No backend, database, worker or full regression was run.** Not run, by §23:
APP5 backend tests, `APP5-DB01`, the full Storefront Jest run, Playwright/E2E,
Admin frontend, worker tests, DB regression, OpenAPI generation or check,
generated-client generation, the Figma registry checker (the registry is
unchanged), SonarQube, any repo-wide build or typecheck, and any aggregate
quality command. `tools/check-app3-p03.mjs`, `tools/check-app4-b05.mjs` and
`tools/check-app4-b06-contract.mjs` were not run. No Storefront production build
was needed: both route boundaries are proved by typecheck plus a live render in
the dev server.

### `check-app4-s02` reconciliation (§22)

The checker's parsed inputs genuinely changed, so it was inspected before being
run and only the directly stale assertions were reconciled. **Every fragment and
token secrecy rule was preserved**, and the sweep was widened rather than
narrowed:

| Change | Why it was stale |
|---|---|
| `REQUIRED_OPERATION` → `publicCustomRequestStatus` | the landing's one call changed |
| new `FORBIDDEN_CHAINED_OPERATION` rule + mutation case | new rule for the locked architecture; strengthens the gate |
| `client` → the APP5 B03 client; `controller` → `use-secure-link-bootstrap.ts`; `screen` → `secure-link-shell.tsx`; `authorized` → `request-status-content.tsx` | the files moved or were replaced |
| `featureSources` walks `custom-request-status` too | the consumer that now holds a live credential would otherwise be unchecked by every storage/console/navigation/secrecy sweep |
| authorized-shell field list → `requestId`, `assetId`, `productId`, `productVariantId`, `productSlug` | the old grant fields no longer exist here; these are what B03 returns |
| commercial-concept regex narrowed to English terms | the approved APP5 copy *names* quotation and payment to say the page has none; the copy module is the boundary that keeps that out of components |
| `checkNoBackendChange` also asserts the B03 path is published | B03 is now a consumed contract |

The h1 count assertion (exactly four: three access cards plus the authorized
content) and every other rule are unchanged in substance.

---

## 11. Browser / secrecy proof

One focused Playwright script against `next dev`, not the E2E suite. B03 is
stubbed at the network boundary because every property under test is a property
of the *client* — when the request left relative to the strip, how many requests
there were, and what the browser retains — and stubbing is what makes the
transient leg reproducible.

**36 / 36 assertions passed, exit 0.**

| Leg | Proved |
|---|---|
| **A — status success** | the address bar was already clean at the instant B03 was observed; the token was in the request body only, under the single key `token`, and in no header, URL or history state; **exactly one** `/api/` request, and it was B03; nothing matching `secure-links` was ever issued; the `NEEDS_CLARIFICATION` frame rendered with its reason, subject, quantity and role tiles; no identifier on screen; after settlement the token was absent from the URL, history state, storage, cookies and the DOM; exactly one `h1`; zero buttons, forms and inputs in the request content |
| **B — canonical 404** | one request only, no diagnostic second; the backend's cause string (`grant revoked`) nowhere on screen; no request content leaked into the unavailable state |
| **C — transient → manual retry** | no automatic retry across a 2 s hold; the fragment already gone while the transient card was up; the retry sent exactly one new request reusing the same ephemeral token; the fragment was never restored and the token never returned to the URL or the DOM |
| **D — reload after strip** | a reload issues **zero** requests — the credential is unrecoverable, which is the intended behaviour, not a gap |
| **E — 390 viewport** | no horizontal overflow, still exactly one `h1` |
| **F — confirmation** | **zero** `/api/` requests on the route; the code shown with its "opens nothing" sentence; the secure-link continuation explained; no quote, payment or order promised; no horizontal overflow at 390 |
| **G — console** | nothing written to the console at all, and therefore no token in it |

Only one canonical 404 was exercised; the six backend causes were not replayed.
No full E2E run.

---

## 12. Follow-ups

Closed by this checkpoint:

```text
FU-APP4-S01-SUCCESS-HANDOFF-01 = CLOSED_BY_APP5_S02
```

The real post-submit confirmation and the secure-link continuation now exist:
`/yeu-cau/moi` navigates to `/yeu-cau/da-gui?ma=<code>`, which confirms the
submission and explains that the secure link in the customer's message is how
status is read later — and `/truy-cap` reads it.

Opened:

```text
FU-APP5-S02-CONFIRMATION-SUMMARY-01   — the approved "Bạn đã gửi gì" panel needs
                                        request data no unauthenticated route may
                                        obtain; revisit when a design or product
                                        decision resolves it (see §9)
FU-APP5-S02-MASKED-CONTACT-01         — the approved masked contact on 660:18 /
                                        661:8 is published by no authorized read
FU-APP5-S02-NULLABLE-STRING-CONTRACT-01 — every nullable string in the APP5
                                        public contracts publishes as
                                        `type: object`; fix the decorators and
                                        regenerate in a checkpoint that owns the
                                        backend and the generated client
```

Carried, unchanged and not implemented:

```text
APP5-B06                    — Admin private request-asset delivery; still before APP5-A02
FU-APP5-S01-STUDIO-ENTRY-01 — the missing S01 navigation entry point; did not block S02
```

---

## 13. Files

**Added**

```text
apps/storefront/src/components/responsive-text.tsx          (moved from secure-link-access/ui)
apps/storefront/src/components/responsive-text.scss
apps/storefront/src/features/custom-request-status/api/custom-request-status.client.ts
apps/storefront/src/features/custom-request-status/hooks/use-custom-request-status.ts
apps/storefront/src/features/custom-request-status/model/custom-request-status-copy.ts
apps/storefront/src/features/custom-request-status/model/request-status-projection.ts
apps/storefront/src/features/custom-request-status/model/status-presentation.ts
apps/storefront/src/features/custom-request-status/styles/custom-request-status.scss
apps/storefront/src/features/custom-request-status/ui/current-status-card.tsx
apps/storefront/src/features/custom-request-status/ui/custom-request-status-screen.tsx
apps/storefront/src/features/custom-request-status/ui/next-steps-card.tsx
apps/storefront/src/features/custom-request-status/ui/read-only-card.tsx
apps/storefront/src/features/custom-request-status/ui/request-progress-card.tsx
apps/storefront/src/features/custom-request-status/ui/request-reason-card.tsx
apps/storefront/src/features/custom-request-status/ui/request-status-content.tsx
apps/storefront/src/features/custom-request-status/ui/request-subject-card.tsx
apps/storefront/src/features/custom-request-status/ui/secure-access-bar.tsx
apps/storefront/src/features/custom-request-status/index.ts
apps/storefront/src/features/custom-request-confirmation/model/custom-request-confirmation-copy.ts
apps/storefront/src/features/custom-request-confirmation/model/request-code.ts
apps/storefront/src/features/custom-request-confirmation/styles/custom-request-confirmation.scss
apps/storefront/src/features/custom-request-confirmation/ui/confirmation-card.tsx
apps/storefront/src/features/custom-request-confirmation/ui/confirmation-next-steps-card.tsx
apps/storefront/src/features/custom-request-confirmation/ui/confirmation-not-included-card.tsx
apps/storefront/src/features/custom-request-confirmation/ui/custom-request-confirmation-screen.tsx
apps/storefront/src/features/custom-request-confirmation/index.ts
apps/storefront/src/features/secure-link-access/hooks/use-secure-link-bootstrap.ts
apps/storefront/src/features/secure-link-access/ui/secure-link-shell.tsx
apps/storefront/test/components/custom-request-confirmation.test.tsx
apps/storefront/test/components/custom-request-status.test.tsx
apps/storefront/test/components/custom-request-status-content.test.tsx
apps/storefront/test/components/custom-request-status-secrecy.test.tsx
apps/storefront/test/support/custom-request-status-fixture.ts
docs/implementation/reports/APP5-S02-COMPLETION-REPORT.md
```

**Modified**

```text
apps/storefront/src/app/truy-cap/page.tsx
apps/storefront/src/app/yeu-cau/da-gui/page.tsx
apps/storefront/src/features/secure-link-access/index.ts
apps/storefront/src/features/secure-link-access/model/secure-link-copy.ts
apps/storefront/src/features/secure-link-access/model/secure-link-state.ts
apps/storefront/src/features/secure-link-access/styles/secure-link-access.scss
apps/storefront/src/features/secure-link-access/ui/secure-link-query-provider.tsx
apps/storefront/src/styles/main.scss
apps/storefront/test/components/custom-request-route.test.tsx
apps/storefront/test/support/secure-link-fixture.ts
packages/api-client/src/index.ts
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md
tools/check-app4-s02.mjs
tools/check-app4-s02.test.mjs
```

**Deleted**

```text
apps/storefront/src/features/secure-link-access/api/secure-link.client.ts
apps/storefront/src/features/secure-link-access/hooks/use-secure-link-resolution.ts
apps/storefront/src/features/secure-link-access/ui/secure-link-authorized-card.tsx
apps/storefront/src/features/secure-link-access/ui/secure-link-screen.tsx
apps/storefront/test/components/secure-link-access.test.tsx
apps/storefront/test/components/secure-link-access-secrecy.test.tsx
```

The two deleted suites were **adapted, not dropped** (§20): every assertion they
made about the fragment, the strip ordering, the credential lifetime and the
non-enumeration contract is now made against the same machinery through its new
consumer, in `custom-request-status.test.tsx` and
`custom-request-status-secrecy.test.tsx`. No historical APP4 evidence document
was rewritten.

Unchanged, and deliberately so: `apps/api`, `apps/worker`, every migration,
`packages/contracts/openapi/openapi.generated.json`,
`packages/api-client/src/generated/**`, and every Figma node and registry row.

---

## 14. Roadmap

```text
APP5-R00  = COMPLETE
APP5-G01  = COMPLETE
APP5-D01  = COMPLETE
APP5-B01  = COMPLETE
APP5-DB01 = COMPLETE
APP5-B02  = COMPLETE
APP5-B03  = COMPLETE
APP5-B04  = COMPLETE
APP5-B05  = COMPLETE
APP5-B07  = COMPLETE
APP5-S01  = COMPLETE
APP5-S02  = COMPLETE
APP5-A01  = INCOMPLETE  NEXT
APP5-B06  = INCOMPLETE  before A02
APP5-A02  = INCOMPLETE
APP5-E01  = INCOMPLETE
APP5-X01  = INCOMPLETE
```

---

## 15. Residual risks and limitations

1. **The confirmation summary panel is absent** (`FU-APP5-S02-CONFIRMATION-SUMMARY-01`).
   A reviewer comparing the shipped page against `660:3` will see a missing card.
   That is deliberate and is the only honest option without a lookup-by-code
   endpoint; the same information is one secure link away.
2. **The masked contact is absent** on both surfaces
   (`FU-APP5-S02-MASKED-CONTACT-01`). The confirmation names the verified contact
   in words instead. Reintroducing the mask requires a backend decision about
   publishing a masked contact on B03, which is not this checkpoint's to make.
3. **Nullable strings arrive as `object` in the generated client**
   (`FU-APP5-S02-NULLABLE-STRING-CONTRACT-01`). The projection's `typeof` guard is
   correct at runtime and keeps the cast out of every component, but the contract
   is publishing the wrong type and should be fixed at its source.
4. **The browser proof stubs B03.** It proves the client's behaviour end to end in
   a real browser; it does not exercise the live backend chain. `APP5-B03`'s own
   suite covers that, and `APP5-E01` is where the two meet.
5. **Timezone and locale are fixed** to `vi-VN` / `Asia/Ho_Chi_Minh` for the two
   timestamps the frames draw. That is the workshop's clock, which is the shared
   reference when a customer quotes a code over the phone — but it is a decision
   recorded here rather than one the design stated explicitly.
6. **The `check-app4-s02` gate now spans two features.** That is stronger than
   before, but it also means an unrelated edit inside `custom-request-status` can
   fail an APP4-named gate. The name is historical; the contract it enforces is
   the landing's.

---

NEXT CHECKPOINT: APP5-A01 — Admin request queue
