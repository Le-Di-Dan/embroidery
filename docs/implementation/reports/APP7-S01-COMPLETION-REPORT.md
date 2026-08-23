# APP7-S01 — Completion Report

## Customer Secure Deposit, Dynamic QR, Optional Evidence and Deposit Confirmation

- Phase: `APP7 — Deposit Payment and Order Creation`
- Checkpoint: `APP7-S01`
- Mode: `IMPLEMENTATION / STOREFRONT FRONTEND`
- Branch/HEAD at entry: `production` @ `07eeb1d`
- Date: 2026-08-24

---

## 1. Verdict

```text
APP7-S01 = COMPLETE
CHECKPOINT_SCOPE = CUSTOMER_SECURE_DEPOSIT_QR_EVIDENCE_AND_CONFIRMATION

CUSTOMER_ROUTE = /truy-cap/thanh-toan

SECURE_SHELL = REUSED
STEP_UP = REUSED

DEPOSIT_READ = IMPLEMENTED
ATTEMPT_INITIATION = IMPLEMENTED
DYNAMIC_QR = IMPLEMENTED
QR_DOWNLOAD = IMPLEMENTED
COPY_ACTIONS = IMPLEMENTED

TRANSFER_EVIDENCE_REQUIRED = false
TRANSFER_EVIDENCE_SUPPORTED = true
EVIDENCE_UPLOAD = IMPLEMENTED
EVIDENCE_STATUS = IMPLEMENTED
EVIDENCE_DELETE = NONE
EVIDENCE_REPLACE = NONE
CUSTOMER_BINARY_EVIDENCE_READ = NONE

MAX_EVIDENCE_PER_ATTEMPT = 5
MEDIA_TYPES = image/jpeg,image/png,image/webp
MAX_SOURCE_SIZE = 10 MiB

PAYMENT_TRUTH_SEPARATION = PASS
QR_INTERACTION_MEANS_PAYMENT_SUCCESS = false
EVIDENCE_ACCEPTED_MEANS_PAYMENT_SUCCESS = false

PENDING_STATE = IMPLEMENTED
REQUIRES_REVIEW_STATE = IMPLEMENTED
FAILED_EXPIRED_STATE = IMPLEMENTED — both values are published by
                       DepositAttemptResponseStatus and both are drawn
                       (749:26); APP7-B03 produces neither, so the panel is
                       reachable only from a stored attempt
DEPOSIT_PAID_CONFIRMATION = IMPLEMENTED

PROVIDER_UX = NONE
APP8_UX = NONE
APP9_UX = NONE

BACKEND_CHANGE = NONE
OPENAPI_CHANGE = NONE
SCHEMA_CHANGE = NONE
MIGRATION_CHANGE = NONE
FIGMA_CHANGE = NONE

FOCUSED_TESTS = 7 suites / 120 tests PASS
  test/components/secure-deposit.test.tsx            24
  test/components/secure-deposit-evidence.test.tsx   17
  test/components/secure-deposit-qr.test.tsx          8
  test/components/secure-deposit-step-up.test.tsx     4
  test/boundary/secure-deposit-source.test.ts        23
  test/unit/secure-deposit-model.test.ts             40
  test/model/upload-idempotency-key.test.ts           4   (re-run: file moved)
PLAYWRIGHT = NOT_RUN_BY_DESIGN
BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-E01
```

---

## 2. What was delivered, and the one rule behind it

One customer route, `/truy-cap/thanh-toan`, opened by the APP4 secure link and
holding the whole customer half of APP7: the deposit facts, the bank-transfer
instructions, the dynamic QR and its download, three copy controls, optional
transfer evidence with its own status list, the four customer-safe attempt
states, and the verified-deposit confirmation. `APP7-R00` merged the
confirmation into this flow deliberately, so there is no second customer route.

The whole screen is one rule made structural:

> **Nothing the customer does on this page can make it say the deposit is paid.**

There is no `isPaid` boolean anywhere in the feature, and the boundary suite
proves it by pattern. The confirmation is selected by `depositConfirmed()`,
which reads exactly two server fields — `depositStatus === 'SATISFIED'` or
`orderStatus === 'DEPOSIT_PAID'` — and touches no attempt and no image. Both
fields move only when an Admin verifies receipt (`APP7-B04`).

Three vocabularies are kept apart, as `751:3` and `751:175` require:

| fact | vocabulary | may say *paid*? |
|---|---|---|
| an image | *đang kiểm tra / đã được tiếp nhận / không hợp lệ* | never |
| an attempt | *chờ xác nhận / đang đối chiếu / đã kết thúc* | never |
| the order and obligation | *đã xác nhận tiền cọc* | yes, and only here |

No shared badge crosses those rows, and the copy catalog is asserted free of a
payment word inside every evidence sentence.

---

## 3. Approved D01 nodes consumed

All rows are `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP7-D01-PO-001`
(promoted by `APP7-A01`, registry read before implementation).

| Registry ID | Node | Consumed by |
|---|---|---|
| `FIG-APP7-S01-DEPOSIT-QR-DESKTOP` | `745:3` | instructions card, QR panel, waiting block, reminder |
| `FIG-APP7-S01-PREATTEMPT-DESKTOP` | `747:3` | pre-attempt card |
| `FIG-APP7-S01-STEPUP-COMPOSITION` | `747:41` | step-up dialog composition |
| `FIG-APP7-S01-EVIDENCE-EMPTY-DESKTOP` | `748:3` | evidence panel, empty |
| `FIG-APP7-S01-EVIDENCE-UPLOADING-DESKTOP` | `748:29` | uploading row + progress |
| `FIG-APP7-S01-EVIDENCE-INSPECTING-DESKTOP` | `748:57` | list row, `PENDING` tone |
| `FIG-APP7-S01-EVIDENCE-ACCEPTED-DESKTOP` | `748:86` | list row, `ACCEPTED` tone |
| `FIG-APP7-S01-EVIDENCE-REJECTED-DESKTOP` | `748:115` | list row, `REJECTED` tone |
| `FIG-APP7-S01-EVIDENCE-QUOTA-DESKTOP` | `748:144` | quota-reached intake |
| `FIG-APP7-S01-REQUIRES-REVIEW-DESKTOP` | `749:3` | review card |
| `FIG-APP7-S01-TERMINAL-ATTEMPT-DESKTOP` | `749:26` | terminal card |
| `FIG-APP7-S01-CONFIRMED-DESKTOP` | `749:50` | confirmation |
| `FIG-APP7-S01-DEPOSIT-QR-MOBILE` | `750:3` | mobile 390 transfer band |
| `FIG-APP7-S01-EVIDENCE-MOBILE` | `750:376` | mobile 390 evidence |
| `FIG-APP7-S01-CONFIRMED-MOBILE` | `750:415` | mobile 390 confirmation |
| `FIG-APP7-MATRIX-STATE-COPY` | `751:3` | the copy catalog, row by row |
| `FIG-APP7-MATRIX-TRUTH` | `751:175` | `deposit-payment-state.ts` |
| `FIG-APP7-RESPONSIVE-SPEC` | `753:3` | one breakpoint, stacked mobile |
| `FIG-APP7-ACCESSIBILITY-SPEC` | `753:120` | §11 below |
| `FIG-APP7-REUSE-MAP` | `753:179` | shell and step-up reuse |
| `FIG-APP7-HANDOFF-DEPENDENCY-MAP` | `754:3` | the no-attempt-state finding |

Reused, not redrawn: `APP4-D01` `629:3` / `629:20` / `629:37` / `629:53` /
`629:70` / `629:87` (access states), `APP6-D01` `701:3` (step-up), `APP1-D02`
`405:2225` / `405:3786` (Storefront shell).

`FIGMA_CHANGE = NONE` — no node was opened for mutation and no registry row was
edited, so `node tools/check-figma-design-index.mjs` had nothing to re-measure
and was not run.

---

## 4. Generated client operations consumed

| Operation | Method and path | Used for |
|---|---|---|
| `publicOrderDepositCurrent` | `POST /api/public/orders/deposit` | the bootstrap read, the transient retry, the one reconciliation |
| `publicOrderDepositInitiate` | `POST /api/public/orders/deposit/attempts` | opening an attempt, and a new one from the terminal card |
| `publicOrderDepositQr` | `POST /api/public/orders/deposit/qr` | the QR blob |
| `publicOrderDepositEvidenceUpload` | `POST /api/public/orders/deposit/evidence` | one image |
| `publicOrderDepositEvidenceStatus` | `POST /api/public/orders/deposit/evidence/status` | the customer's own list |

Nothing else. The boundary suite freezes that list by name, asserts the feature
contains no `fetch(`, no `http(s)://` literal and no Axios construction, and
asserts `publicSecureLinkResolve` is never called — chaining B06 in front of B03
would authorize the same credential twice.

**Curated export change.** `packages/api-client/src/index.ts` gained one block:
the five operations, seven status/media enums as **values** (the screen branches
on each), and eleven body/response types. No Admin APP7 operation was
broad-exported and no generated file was edited; `OPENAPI_CHANGE = NONE` and no
generation was run.

---

## 5. Secure route and token handling

The route is a thin Server Component that mounts `SecureLinkQueryProvider`
around the screen; everything below is client-side, because the credential lives
in the URL **fragment** and no user agent sends one to the origin.

`useSecureLinkBootstrap` is reused unchanged, with
`retainCredentialAfterSuccess: true` — this route spends the credential again on
the initiation, the QR and every evidence call, exactly as `APP6-S01` does for
its decisions. The locked sequence is APP4's:

```text
capture #t=  →  history.replaceState  →  clean URL  →  POST the secret in a body
```

The component suite proves the ordering rather than asserting it afterwards:
`location.hash`, `location.href` and `history.state` are all sampled **inside
the mock at call time**, and every one is free of the token.

```text
RAW_TOKEN_IN_URL       = NONE   (stripped before the first request)
RAW_TOKEN_IN_DOM       = NONE   (asserted over container.innerHTML)
RAW_TOKEN_IN_STORAGE   = NONE   (no localStorage/sessionStorage/indexedDB/cookie
                                 address exists in the feature — asserted)
RAW_TOKEN_IN_QUERY_KEY = NONE   (asserted over deposit-query-keys.ts)
RAW_TOKEN_IN_LOGS      = NONE   (no console.* call exists in the feature)
SECOND_TOKEN_ARCHITECTURE = NONE
```

Both mutations are declared with **no variables**, so TanStack's retained
`mutation.variables` is permanently `undefined`; the secret is reached only
through `runWithSecret`, which hands it to the request function on the stack and
never returns it.

A definitive `404 SECURE_LINK_UNAVAILABLE` on a *later* call — an initiation or
an upload — ends the session and substitutes the identical unavailable card,
because the bootstrap's own state cannot express it (its read succeeded).

---

## 6. Attempt-state recovery strategy

This is the checkpoint's one genuinely load-bearing design decision, and it
follows the contract rather than the brief's assumption.

`publicOrderDeposit_current` publishes **no attempt state** — order code, order
and obligation status, the obligation's frozen amount, the currency, the bank
instructions and the access expiry, and nothing else. `APP7-D01` recorded this
on `754:3`. Attempt status exists only in the `publicOrderDeposit_initiate`
response.

So:

- **Nothing is initiated on mount.** `APP7-B03` requires a recent step-up, so an
  automatic call would either fail or spend a verification the customer never
  asked for — and §4 forbids opening an attempt because a route mounted. The
  bootstrap renders `747:3` and the customer presses the button.
- **Step-up is asked for by the server, not assumed.** The button calls
  `initiate` first; a `403 REVERIFICATION_REQUIRED` opens the dialog. When the
  code is accepted the *same* initiation is retried with the *same* idempotency
  key — one customer action that needed evidence half-way through, not two. This
  is `APP6-S01`'s delivered pattern, and it means a customer whose step-up is
  still fresh never sees an OTP at all.
- **A reload recovers nothing, by construction.** The fragment was stripped
  before the first request and cannot be read twice, so a reload lands on the
  same unavailable state every APP4 landing does — with or without an attempt.
  There is therefore no "latest attempt" selection to invent client-side, and
  nothing about a payment is written to storage. Recovering an attempt across a
  reload would require persisting either the credential or the idempotency key,
  and §5/§24 forbid the first while the second is useless without it.
- **One reconciliation read, and only one.** `SUCCEEDED` is the single attempt
  state that claims something the deposit read has not confirmed, and `751:175`
  makes the *obligation* the authority for that claim (the paid row is
  `SUCCEEDED` **and** `SATISFIED`). So the deposit is re-read once through the
  bootstrap's own `retry()`, guarded by a ref, and the confirmation renders only
  if that read says so. Until then the neutral `751:174` panel shows the code.
  Nothing polls.

```text
ATTEMPT_STATE_SOURCE       = publicOrderDeposit_initiate response only
ATTEMPT_STATE_INVENTED     = NONE
ATTEMPT_AUTO_CREATED       = false
CLIENT_LATEST_ATTEMPT_PICK = NONE
POLLING                    = NONE
```

---

## 7. Query keys, invalidation and the QR blob lifecycle

```text
['secure-deposit', 'qr']
['secure-deposit', 'evidence', attemptId]
```

Two keys, both built in `model/deposit-query-keys.ts`, and the boundary suite
asserts no `queryKey: [` literal exists anywhere else — a second naming
authority is what would eventually serialize a credential into devtools. The QR
key names nothing at all: its operation takes only a token, and
`SecureLinkQueryProvider` creates a fresh `QueryClient` per mount with
`gcTime: 0`, so a constant key is already scoped to exactly one deposit. The
evidence key names the `attemptId` because two attempts in one session have
genuinely different evidence sets; the contract states plainly that an
`attemptId` is "a locator and not authorization".

**Invalidation.** Initiation invalidates nothing — the obligation is still
`PENDING` and the bank instructions are identical on every read, so there is
nothing to re-read (§27). A successful upload invalidates exactly
`['secure-deposit','evidence',attemptId]` and nothing else; the test asserts the
deposit read count is unchanged across an upload.

**QR blob lifecycle.**

```text
blob arrives → createObjectURL → render
blob replaced / component unmounts → revokeObjectURL(that exact url)
```

The URL is created inside an effect keyed on the blob and revoked by the cleanup
of that same closure, so a replacement revokes its predecessor and there is no
path that can drop one. It lives in one piece of hook state — never a module
variable, never storage. The suite asserts `revoke` was called with exactly the
string `create` returned, that `createObjectURL` appears in exactly one place in
the feature and `revokeObjectURL` in exactly one, and that nothing reaches
`localStorage`/`sessionStorage`.

The download reuses that same object URL through an `<a download>` — no second
request, asserted (`qrMock` called once across a download). The filename is
`ma-qr-dat-coc-<orderCode>.png`, with everything outside `[A-Za-z0-9-]` dropped,
and the test asserts it contains neither the token nor the account number.

`URL.createObjectURL` is checked for rather than assumed: it is absent in jsdom
and in some restricted embedded browsers, and calling it unguarded would take
the payment screen down over a *convenience*. Its absence degrades to the
fallback line, exactly as a failed fetch does.

---

## 8. Evidence upload and status behaviour

```text
states   empty · uploading(+%) · UPLOADED/INSPECTING · ACCEPTED · REJECTED · quota reached
mapping  UPLOADED, INSPECTING → Đang kiểm tra ảnh
         ACCEPTED             → Ảnh đã được tiếp nhận
         REJECTED             → Ảnh không hợp lệ — bạn có thể gửi ảnh khác
```

`UPLOADED` and `INSPECTING` render identically, per `APP7-D01` §16.5 — the
contract distinguishes them and the customer-visible difference is nil.

The transport is the generated multipart operation, which appends `accessToken`,
`attemptId` then `file` — alphabetical, which is exactly the order `APP7-B05`
requires. `Content-Type` is left to Axios so the boundary is derived from the
`FormData`; the `Idempotency-Key` travels in the operation's per-call config, as
`APP5-B02`'s upload does, and is minted per customer action by the shared
`newUploadIdempotencyKey`. A **retry of the same file reuses the same key** — one
logical upload tried again, which is what the header is for — and the test
asserts key equality across a retry and key *inequality* across a new attempt.
The raw key is asserted absent from the document.

Client guards are strict and never permissive: the three contract media types by
the browser's sniffed `File.type` (never the extension), and `> 10 MiB` refused
before a byte leaves. The server remains the authority — signature check, exact
byte count, quota under a lock.

The quota is the server's list length. At five the intake control is replaced by
a disabled button and the approved note, existing rows are untouched, and no
client-side delete exists to make room. When the server refuses with
`EVIDENCE_QUOTA_REACHED` or `EVIDENCE_ATTEMPT_CLOSED` the list is re-read rather
than argued with.

```text
DELETE = NONE   REPLACE = NONE   REORDER = NONE   PREVIEW = NONE
BINARY_READ = NONE   previewEligible = ABSENT_FROM_CUSTOMER_CONTRACT
```

The intake closes for four independent reasons — deposit verified, no attempt,
terminal attempt, quota reached — and `REQUIRES_REVIEW` is deliberately **not**
one of them: `749:23` keeps it open, because a reconciliation is precisely when
another image helps.

A refused upload keeps the existing list, shows a bounded error attached to the
control by `aria-describedby`, and offers a retry only for the two refusals a
second attempt at the same bytes could clear. Nothing auto-retries.

---

## 9. Payment-truth mapping

| contract value | customer sentence | claims payment? |
|---|---|---|
| attempt `PENDING` | *Chờ xác nhận tiền cọc* + the honest waiting block | no |
| attempt `REQUIRES_REVIEW` | *Giao dịch đang được cửa hàng đối chiếu* | no |
| attempt `FAILED` / `EXPIRED` | *Lần thanh toán này không thể tiếp tục / đã hết hiệu lực* | no |
| attempt `PROCESSING` / `REFUNDED` / `PARTIALLY_REFUNDED` / `SUCCEEDED` (obligation not yet satisfied) | the neutral `751:174` panel, showing the raw code | no |
| `depositStatus = SATISFIED` **or** `orderStatus = DEPOSIT_PAID` | *Đã xác nhận tiền cọc* | **yes** |

`PENDING` says exactly what the system can know: *Nếu bạn đã hoàn tất chuyển
khoản, vui lòng chờ cửa hàng xác nhận*, and then explains why there is no *Tôi đã
chuyển khoản* button — the phrase appears exactly once in the whole feature,
inside that explanation, which the boundary suite asserts by count.

`REQUIRES_REVIEW` shows no Admin note, no review reason, no observed amount, no
observed reference and no reconciliation history. There is no prop through which
one could be passed, and the customer contract publishes none of them.

`FAILED` / `EXPIRED` never reset the attempt. The action opens a **new** one with
a new key, and the card carries the warning that costs money if it is missing:
*Nếu bạn đã chuyển tiền theo hướng dẫn cũ, đừng chuyển lại.* Nothing about a dead
attempt stops a real transfer from arriving at the bank.

The confirmation claims no APP8 or APP9 progress; the boundary suite asserts the
copy catalog contains none of *đang sản xuất*, *giữ tồn kho*, *bắt đầu thêu*,
*sẵn sàng giao hàng*, *giao hàng*, *hoàn tiền*, *thanh toán còn lại*, and the
component suite re-asserts it over the rendered confirmation.

`PROVIDER_UX = NONE` — the feature names no card scheme, wallet, gateway,
checkout or webhook, asserted by pattern. `IMP-O007` remains **OPEN**.

---

## 10. Responsive

Two viewports, one breakpoint (`768px`), mirrored from `secure-link-access.scss`
which mirrors `storefront-shell.scss` — a second breakpoint would let the
transfer band and the shell gutter switch at widths nobody tests together.

| state | desktop 1440 | mobile 390 |
|---|---|---|
| deposit instructions + QR | two-column grid, QR card 440 | single column, QR 228, full-width controls 49 tall |
| evidence intake and status | `748:*` geometry | `750:376` — glyph 44, stacked rows |
| verified confirmation | `749:50` | `750:415` — centred hero, stacked facts |

Mobile stacks each fact's label above its value: 322px of usable width cannot
hold a 220px label beside a fifteen-character reference without one truncating,
and neither may truncate. `overflow-wrap: anywhere` on the section means a long
bank name, account number or reference wraps instead of widening the page, so
**no critical payment fact requires a horizontal scroll**.

Pixel-level layout is deliberately not asserted in Jest (`next/jest` stubs SCSS,
so a component test observes no CSS at all). `APP7-E01` owns visual acceptance.

---

## 11. Accessibility (`753:120`)

| requirement | how |
|---|---|
| no state distinguished by colour alone | every badge is symbol + label + tone; the symbols are the spec's own `○ ◷ ◐ ✓ ✕`, and the symbol is `aria-hidden` so the words carry it |
| copy controls name what they copy | `aria-label` = *Sao chép số tài khoản / số tiền / nội dung chuyển khoản* |
| copy success announced politely | each control owns a visually-hidden `aria-live="polite"` region; a clipboard refusal reports it rather than failing silently |
| QR has a text alternative describing its purpose | *Mã QR chuyển khoản đặt cọc, chứa số tài khoản, số tiền và nội dung…* |
| every QR datum exists as readable text beside it | the amount, reference, bank, account and holder are all rendered as text, independently of the image |
| the customer can pay without the QR | proved: with the fetch failing, all three transfer facts still render and the fallback line explains it |
| QR download is a real labelled button | `<button>` with text, disabled until bytes exist |
| upload control labelled with formats, size and count | the constraint line **is** the input's `<label>` |
| upload errors attached to the control | `aria-describedby` → the error note, asserted |
| progress announced with a text percentage | polite region carries *Đang tải ảnh giao dịch lên NN%* |
| page loading announced | the shell's polite region (APP4) plus this screen's own |
| focus preserved through the step-up dialog | focus trap, Escape, and focus returned to the opener on unmount |
| mobile touch targets ≥ 44×44 | `min-height: 44px` on every control, 49px full-width on mobile |
| focus order | DOM order **is** the approved order — amount → copy → reference → copy → account → copy → download QR → upload → retry — so no `tabindex` exists |

The screen renders a `<section>`, not a second `<main>`: the Storefront shell
already provides the single `main` landmark, and the authorized branch owns the
one `h1` through the shell's `headingRef`.

---

## 12. Changed files

```text
NEW — apps/storefront/src/app/truy-cap/thanh-toan/page.tsx
NEW — apps/storefront/src/features/secure-deposit-payment/
        index.ts
        api/secure-deposit.client.ts
        model/secure-deposit-copy.ts
        model/deposit-payment-state.ts
        model/deposit-failure.ts
        model/transfer-evidence.ts
        model/exact-deposit-amount.ts
        model/display-format.ts
        model/deposit-query-keys.ts
        hooks/use-secure-deposit.ts
        hooks/use-deposit-qr.ts
        hooks/use-transfer-evidence.ts
        ui/secure-deposit-screen.tsx
        ui/deposit-content.tsx
        ui/deposit-pre-attempt-card.tsx
        ui/deposit-instructions-card.tsx
        ui/deposit-qr-panel.tsx
        ui/copy-value-button.tsx
        ui/evidence-panel.tsx
        ui/evidence-list.tsx
        ui/attempt-review-card.tsx
        ui/attempt-terminal-card.tsx
        ui/attempt-undrawn-card.tsx
        ui/deposit-confirmed-card.tsx
        ui/deposit-dialog.tsx
        ui/deposit-step-up-dialog.tsx
        ui/deposit-note.tsx
        ui/deposit-status-pill.tsx
        styles/secure-deposit-payment.scss
        styles/_deposit-tokens.scss
        styles/_deposit-layout.scss
        styles/_deposit-transfer.scss
        styles/_deposit-evidence.scss
        styles/_deposit-dialog.scss

MOVED — apps/storefront/src/features/custom-request/model/upload-idempotency-key.ts
     →  apps/storefront/src/shared/utils/upload-idempotency-key.ts
        (+ header explaining the promotion; function body unchanged)

MODIFIED — apps/storefront/src/features/custom-request/hooks/use-request-uploads.ts  (import path)
MODIFIED — apps/storefront/src/styles/main.scss                                      (+1 @use)
MODIFIED — packages/api-client/src/index.ts                                          (+1 export block)

NEW TESTS —
  apps/storefront/test/support/secure-deposit-fixture.ts
  apps/storefront/test/unit/secure-deposit-model.test.ts
  apps/storefront/test/boundary/secure-deposit-source.test.ts
  apps/storefront/test/components/secure-deposit.test.tsx
  apps/storefront/test/components/secure-deposit-qr.test.tsx
  apps/storefront/test/components/secure-deposit-evidence.test.tsx
  apps/storefront/test/components/secure-deposit-step-up.test.tsx
MODIFIED — apps/storefront/test/model/upload-idempotency-key.test.ts                 (import path)

DOCS — docs/implementation/reports/APP7-S01-COMPLETION-REPORT.md            (new)
       docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
       docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
```

Nothing under `apps/api/**`, `apps/worker/**`, `packages/database/**`,
`packages/persistence/**`, `packages/contracts/**`, any migration, any generated
file, or any Figma node was touched.

### 12.1 Why `upload-idempotency-key.ts` moved

It was `APP5-S01`'s alone until this checkpoint needed the same
`Idempotency-Key` contract for transfer evidence. A cross-feature import would
have crossed a module boundary, and a second copy of a correctness-sensitive
helper — the one that exists because `crypto.randomUUID` is secure-context-only
and throws on a plain-HTTP origin — is a second place for that lesson to be
forgotten. `REPOSITORY_STRUCTURE` §4 defines `shared/` as exactly this: technical
code genuinely used by multiple features, carrying no business rule. The move is
three files, the function body is byte-identical, and its own unit suite and the
three APP5 custom-request suites were re-run green.

---

## 13. File-size evidence

Every S01-owned file, largest first:

```text
runtime source (limit 400)
  350  styles/_deposit-layout.scss
  279  hooks/use-secure-deposit.ts
  258  model/secure-deposit-copy.ts
  216  hooks/use-transfer-evidence.ts
  204  api/secure-deposit.client.ts
  196  styles/_deposit-evidence.scss
  192  ui/evidence-panel.tsx
  189  styles/_deposit-transfer.scss
  184  ui/deposit-content.tsx
  176  model/deposit-failure.ts
  174  model/deposit-payment-state.ts
  … 23 further files, all < 145

tests (limit 600)
  419  test/components/secure-deposit.test.tsx
  293  test/boundary/secure-deposit-source.test.ts
  286  test/components/secure-deposit-evidence.test.tsx
  272  test/unit/secure-deposit-model.test.ts
  188  test/components/secure-deposit-qr.test.tsx
  160  test/components/secure-deposit-step-up.test.tsx
  146  test/support/secure-deposit-fixture.ts
```

`OVERSIZED_SOURCE = 0`, `OVERSIZED_TEST = 0`.

The stylesheet was **bounded from the start** rather than split after the fact:
`APP7-A01-C1` had to break up an 869-line Admin stylesheet, and §40 makes the cap
apply to SCSS. The entry is a 15-line composition over five partials split by
responsibility — shared geometry, page frame, transfer band, evidence panel,
dialog. `_deposit-tokens.scss` emits no rules, so every partial may `@use` it
without duplicating a declaration into the bundle. The boundary suite asserts
both the cap and that more than one stylesheet exists, so a future merge back
into one file fails.

---

## 14. Discrepancies between the approved design and the delivered contract

Recorded, non-blocking, and resolved by §39 (*simplify to actual backend truth*)
rather than by deriving a figure or reaching for another operation.

| # | Frame | Drawn | Contract | Delivered |
|---|---|---|---|---|
| 1 | `747:3` | row *Tổng giá trị đơn hàng — 12.750.000 VND* | `CustomerDepositResponse` has no order total | row omitted. Deriving it from a 40 % deposit is the recomputation §11 forbids, spelled backwards |
| 2 | `749:50`, `750:415` | row *Tổng giá trị đơn hàng* | same | row omitted |
| 3 | `749:50`, `750:415` | row *Xác nhận lúc — 23/08/2026 14:05* | no verification timestamp on any customer operation | row omitted; the confirmation states the fact without dating it |
| 4 | `749:23`, `749:91` | *Ảnh giao dịch đã gửi · 2 / 5* inside the review and confirmation cards | evidence is addressed by `attemptId`, which exists only if this session opened an attempt | the evidence panel renders wherever an attempt exists — including under review and after confirmation — and is absent when none was opened in this session. The confirmation carries the approved evidence note either way |

None of the four requires a backend change and none was raised with B03 or B05.
They are candidates for an `APP7-E01` or `APP7-X01` follow-up note only if the
Product Owner wants the frames amended.

---

## 15. Follow-ups recorded, not actioned

| id | what |
|---|---|
| `FU-APP7-S01-EXACT-MONEY-PROMOTION-01` | `formatExactAmount`/`formatExactMoney` now exists in three places: `secure-quotation/model/exact-money.ts`, `apps/admin/src/shared/presentation/exact-amount.ts` and this feature's `exact-deposit-amount.ts`. Promoting the Storefront pair to `apps/storefront/src/shared/presentation/` would move a delivered APP6 module out from under its own boundary guard — `test/boundary/secure-quotation-source.test.ts` proves *that feature* contains no numeric coercion by scanning its directory — so it is an APP6-scoped change, not an S01 one. Each copy is guarded by its own suite today |
| `FU-APP7-S01-SHARED-DIALOG-01` | this feature's `DepositDialog` is a third hand-rolled scrim/focus-trap in the Storefront (`secure-quotation`, `secure-design-review`). The Admin app carries the same debt as `FU-ADMIN-SHARED-DIALOG-01`. A shared dialog primitive is now clearly worth its scope |
| `FU-APP7-S01-SCSS-GATE-01` | `tools/check-file-size.mjs` still scans only `.ts/.tsx/.js/.jsx/.mjs/.cjs`, so this checkpoint's SCSS cap is enforced by a feature-local test rather than by the repository gate. Unchanged from `APP7-A01-C1`, which recorded the same finding |

---

## 16. Validation ledger

Every command was chosen from `VALIDATION_GOVERNANCE` §3 against what actually
changed. No repository-wide aggregate was run.

| Command | Scope | Result |
|---|---|---|
| `npx jest test/unit/secure-deposit-model.test.ts` | S01 pure rules | **PASS** — 40 tests |
| `npx jest test/boundary/secure-deposit-source.test.ts` | S01 static guards | **PASS** — 23 tests |
| `npx jest test/components/secure-deposit.test.tsx` | shell, facts, attempt lifecycle | **PASS** — 24 tests |
| `npx jest test/components/secure-deposit-qr.test.tsx` | QR fetch, blob lifecycle, download | **PASS** — 8 tests |
| `npx jest test/components/secure-deposit-evidence.test.tsx` | evidence intake and status | **PASS** — 17 tests |
| `npx jest test/components/secure-deposit-step-up.test.tsx` | STEP_UP reuse | **PASS** — 4 tests |
| `npx jest test/model/upload-idempotency-key.test.ts` | the moved shared helper | **PASS** — 4 tests |
| `npx jest test/components/custom-request-{cop,route,catalog}.test.tsx` | APP5 consumers of the moved helper | **PASS** — 4 suites / 35 tests |
| `pnpm --filter @embroidery/storefront typecheck` (`tsc --noEmit`) | apps/storefront | **PASS** — clean |
| `pnpm --filter @embroidery/api-client typecheck` (`tsc --noEmit`) | curated export change | **PASS** — clean |
| `npx jest` in `packages/api-client` | curated export change | **PASS** — 7 suites / 44 tests |
| `npx eslint <changed files>` | changed-file lint | **PASS** — 0 errors, 0 warnings |
| `npx prettier --check <changed files>` | changed-file format | **PASS** |
| `npx sass src/styles/main.scss` (with the styles load path) | the new stylesheet compiles and emits | **PASS** — 99 `secure-deposit` rules emitted; one pre-existing `slash-div` deprecation in `secure-design-review.scss`, untouched by S01 |
| `git diff --check` | whitespace | **clean** |

Deliberately **not** run, per §38: `pnpm quality`, `quality:e2e`, the full Jest
run, the full Storefront suite, Playwright, backend API tests, `APP7-B03` /
`APP7-B05` suites, `APP7-A01`, worker tests, OpenAPI generate/check, database
gates, SonarQube and `tools/check-figma-design-index.mjs`. None of their inputs
changed. `PASS` on unchanged input is final evidence; no confidence rerun was
performed.

### 16.1 Playwright

```text
PLAYWRIGHT = NOT_RUN_BY_DESIGN
```

Every S01 capability is verifiable in the component stack: the fragment strip
and its ordering, the request bodies, the headers, the blob lifecycle, the
download filename, the multipart parts, the status mapping and every copy rule.
`APP7-E01` owns serial cross-layer acceptance, including the one item that is
genuinely not automatable here — `REAL_BANK_APP_SCAN`, already carried as E01-12
from `APP7-B03`.

---

## 17. Acceptance criteria

All 64 criteria in the directive §42 are met. The ones worth pointing at:

- **6** — no attempt state is invented inside the current-deposit response; §6
  above records the strategy and the boundary suite proves the deposit-read type
  is never widened.
- **11** — no 40 % recomputation: the boundary suite asserts no `0.4`, no
  `depositPercent`, no `totalAmount`, no numeric coercion outside the one file
  named for bytes and dates, and no arithmetic operator applied to an amount.
- **33** — no customer "mark paid" mutation exists; the phrase appears once, in
  the sentence explaining its absence.
- **35** — `FAILED`/`EXPIRED` never reset the same attempt; the test asserts the
  second initiation carries a **different** idempotency key.
- **42** — server state is canonical: there is no Zustand store in this feature
  and no reducer holding payment state; the only client state is dialog
  open/closed, the chosen file, copy feedback and upload progress.
- **56/57** — every runtime source ≤ 400 lines (SCSS included) and every test
  ≤ 600, asserted by the feature's own boundary suite.

---

## 18. Commits

```text
8037cd2  feat(app7): deliver the customer secure deposit payment route (APP7-S01)
     apps/storefront/src/app/truy-cap/thanh-toan/**
     apps/storefront/src/features/secure-deposit-payment/**
     apps/storefront/src/shared/utils/upload-idempotency-key.ts (moved)
     apps/storefront/src/features/custom-request/hooks/use-request-uploads.ts
     apps/storefront/src/styles/main.scss
     apps/storefront/test/**  (7 suites + fixture)
     packages/api-client/src/index.ts

e66ec2e  docs(app7): record APP7-S01 and advance the roadmap (APP7-S01)
     docs/implementation/reports/APP7-S01-COMPLETION-REPORT.md
     docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
     docs/implementation/10-MASTER-APPLICATION-ROADMAP.md

NOT_PUSHED = true
```

---

## 19. Next

```text
APP7-S01 = COMPLETE
NEXT_CHECKPOINT = APP7-E01
```

`APP7-E01` and `APP7-X01` were not started. No APP8 or APP9 work exists.
