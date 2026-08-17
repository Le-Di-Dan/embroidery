# APP5-A02 — Admin Request Detail & Moderation — Completion Report

**Verdict: PASS.**

One Admin frontend capability delivered: `/requests/{requestId}`. It reads
`APP5-B04` as the single canonical detail, opens `APP5-B06` private evidence
through ephemeral object URLs, and performs the `APP5-B05` moderation moves that
APP5 actually owns — nothing else. No backend, database, OpenAPI, generated
client, worker, Storefront or Figma change.

| | |
| --- | --- |
| Branch | `production` |
| Entry HEAD | `6b09c04` — `feat(app5): stream a request-bound attachment to an authenticated operator` |
| Commit | `<filled below>` |
| Date | 2026-08-17 |

---

## A. Design authority

All **14** `FIG-APP5-A02-*` rows in the current repository registry
(`docs/design/FIGMA_DESIGN_INDEX.md`, lines 813–826) are
`APPROVED_FOR_IMPLEMENTATION` under approval `FIG-APPROVAL-APP5-D01-PO-001`
(2026-08-16). The registry was **read, never modified**.

| Row | Node | Where it is built |
| --- | --- | --- |
| `-DETAIL-DESKTOP-CATALOG` | `665:3` | `custom-request-detail-screen.tsx`, `request-subject-panel.tsx` |
| `-DETAIL-DESKTOP-COP` | `665:115` | `request-subject-panel.tsx`, `request-evidence-gallery.tsx` |
| `-DETAIL-DESKTOP-LOADING` | `667:3` | `custom-request-detail-skeleton.tsx` |
| `-DETAIL-DESKTOP-NOTFOUND` | `667:30` | `custom-request-detail-unavailable.tsx` |
| `-ACTION-MATRIX` | `667:56` | `moderation-actions.ts`, `moderation-action-bar.tsx` |
| `-DIALOG-CLARIFY` | `669:3` | `moderation-transition-dialog.tsx` |
| `-DIALOG-REJECT` | `669:60` | `moderation-transition-dialog.tsx` |
| `-DIALOG-CANCEL` | `669:119` | `moderation-transition-dialog.tsx` |
| `-DIALOG-VALIDATION` | `669:173` | `moderation-transition-dialog.tsx` |
| `-DIALOG-SUBMITTING` | `670:3` | `moderation-transition-dialog.tsx` |
| `-MODERATION-SUCCESS` | `670:46` | `custom-request-detail-screen.tsx` |
| `-MODERATION-CONFLICT` | `670:104` | `custom-request-detail-screen.tsx` |
| `-NOTE-APPEND` | `670:148` | `moderation-note-form.tsx` |
| `-DETAIL-NARROW-1280` | `672:3` | `custom-request-detail.scss` |

**Live Figma was NOT opened.** The Figma MCP server reports
`requires authentication` and its `authenticate` tool returns an authorization
URL requiring the operator's own browser — the same limitation `APP5-A01`
recorded. Per checkpoint brief §2 this is recorded once and **not** re-raised:
the current repository registry plus the current approval evidence approve all
fourteen rows unambiguously, so implementation proceeded from that frozen
authority. Nothing beyond approved design and delivered API truth was invented.

A boundary test enforces both halves of this: every `FIG-APP5-A02-*` row must
read `APPROVED_FOR_IMPLEMENTATION`, and every `NNN:NN` node id cited anywhere in
the feature source must exist in the registry.

---

## B. Route, files and architecture

Route segment `apps/admin/src/app/(protected)/requests/[requestId]/page.tsx` — a
thin boundary that awaits `params` and hands `requestId` to the capability. It
does not prefetch: `APP5-B04` is `no-store` and describes a request another
operator may be moderating right now, which is a poor fit for a dehydrated cache
travelling in the HTML.

Feature `apps/admin/src/features/custom-request-detail/`, following the existing
`apps/admin` feature organization (`components` / `hooks` / `model` / `services`
/ `styles`), one React component per file, every runtime source well inside the
400-line limit (largest: `custom-request-detail.scss` at 668 lines — a
stylesheet, not a logic file; largest TS/TSX is
`moderation-transition-dialog.tsx` at 206 lines).

```
model/     custom-request-detail-copy.ts       every operator-facing string
           custom-request-detail-keys.ts       detail + per-asset cache keys
           custom-request-detail-failure.ts    3 classifiers, status-driven
           request-detail-presentation.ts      labels, subject discrimination
           moderation-actions.ts               status → offered actions
           moderation-command.ts               validation + exact payloads
services/  custom-request-detail.service.ts    B04 read + B06 blob
           custom-request-moderation.service.ts B05 transition + note
hooks/     use-custom-request-detail-query.ts  canonical read
           use-request-evidence.ts             one Blob → one object URL
           use-detail-refresh.ts               the two justified invalidations
           use-moderation-mutation.ts          in-flight, settle, outcome
components/ 13 files — screen, skeleton, unavailable, summary, subject,
            customer, quantity, evidence gallery + figure, transition history,
            note history, action bar, dialog shell, transition dialog,
            note form, text area, definition row
```

The feature's public surface (`index.ts`) is **one export**, the screen. The
moderation services are deliberately not on that boundary: a transition and a
note append are the two writes in APP5's Admin surface, and anything that could
reach them from outside this feature would be a state change with no approved
control behind it.

---

## C. Generated operations consumed

Exactly four, all through the generated client — no raw Axios, no `fetch`, no
hand-assembled `/api/admin/...` path (enforced by boundary test).

| Semantic endpoint | Generated name |
| --- | --- |
| `GET /api/admin/custom-requests/{requestId}` | `adminCustomRequestDetail` |
| `GET …/{requestId}/assets/{assetId}/content` | `adminCustomRequestAssetGet` |
| `POST …/{requestId}/moderation-notes` | `adminCustomRequestAppendNote` |
| `POST …/{requestId}/transitions` | `adminCustomRequestTransition` |

`adminCustomRequestList` is **not** called from this feature (boundary-tested):
A02 invalidates the queue's published cache key, it does not re-fetch the queue.

---

## D. B04 detail projection rendered

Everything below comes from the B04 response and nothing is computed from a
mutation receipt.

- **root** — `code` in the page title, `status` as a text badge, `submittedAt` /
  `updatedAt`, `customerNote`, and `internalReason` / `customerVisibleReason` as
  two separately labelled fields;
- **customer** — `displayName` (or the "chưa đặt tên" copy when absent),
  `verifiedAt`, and `contacts[]` rendered as `maskedValue` + kind + verified +
  primary;
- **Catalog subject** — `productName`, `productSlug`, `variantColorName`,
  `variantSizeLabel`, each degrading to "Không còn thông tin" when the server
  omits it, plus `designSessionId` as provenance;
- **COP subject** — `name`, `description`, `physicalWidthMm`,
  `physicalHeightMm` (rendered as the decimal strings the contract sends, with a
  `mm` unit label);
- **quantities** — every line as stored plus the server's own `totalQuantity`;
- **assets** — role, `linkedAt`, `sizeBytes` (parsed defensively from the
  decimal string), and the image itself;
- **transitions** — `sequence`, `fromStatus → toStatus`, actor *kind*,
  `occurredAt`, and both reasons;
- **moderationNotes** — `sequence`, `kind`, `note`, `createdAt`.

`totalQuantity` is printed as received, never recomputed; a screen that summed
the lines itself would eventually disagree with the queue.

**After every successful mutation the detail is re-read and the persisted result
is rendered.** Proven in the browser: one transition call → two detail reads →
status `UNDER_REVIEW` → `NEEDS_CLARIFICATION`, history grew from 1 entry to 2,
and both reason fields on the page carry the server's copy.

---

## E. Catalog branch and the design-preview follow-up

`FU-APP5-B04-DESIGN-PREVIEW-01` **remains open** and was not solved here.

There is no authorized way for this Admin surface to render a Catalog design
session. The screen therefore states plainly *"Chưa xem được bản thiết kế trên
màn hình này."* and shows `designSessionId` as traceable provenance under
*"Mã phiên chỉ dùng để tra cứu nguồn gốc, không mở được bản thiết kế."*

What was **not** done: `designSessionId` is not used as authorization, no session
secret is fabricated, no APP3 private preview is called through a fake
customer/session context, no preview endpoint was invented, and no APP6 design
review exists. The fallback renders no link and no control that would fail
(asserted in the render suite).

---

## F. COP branch and B06 evidence

The customer-owned branch renders item name, description, both dimensions,
quantity, customer/request context and the submitted photographs. It states
*"Đồ khách tự có không đi kèm phiên thiết kế."* — not "preview unavailable", but
that none exists; a COP request is triaged from the photographs alone
(`G01-D10`).

### `requestId + assetId → Blob → object URL → revoke`

`useRequestEvidence` owns exactly one image. TanStack Query owns the bytes; an
effect owns the browser resource.

- **`gcTime: 0`** — `APP5-B06` marks these responses uncacheable because the
  authorisation around the bytes is not immutable even though the bytes are.
  Dropping the entry the moment it is unobserved keeps a customer's private
  photographs from outliving the screen in a cache, and re-opening the request
  re-authorizes against the server rather than trusting a snapshot.
- **Revoked on replacement, on unavailability and on unmount** — one effect
  cleanup covers all three, because they are the same event for this resource.
- **Never persisted** — boundary-tested: no `localStorage`, no `sessionStorage`,
  no `document.cookie`, no `console.*` in the whole feature; no object URL in a
  route or query parameter. Exactly **one** file calls `createObjectURL`, and it
  calls `revokeObjectURL`.

Browser evidence: both images rendered from real `blob:` URLs
(`blob:http://admin.embroidery.local/dff2d198-…`, `…/b84d60a6-…`) fetched from
`…/assets/{assetId}/content` with the request id in the path. Component
evidence: `installObjectUrl` recorded creation and revocation, and asserted the
previous handle is revoked when the rendered asset changes and on unmount.

**Only `COP_IMAGE` and `REFERENCE` are requested.** `ATTACHMENT` is not in the
Admin contract's role enum at all; the client filters explicitly anyway, and an
asset with an unrecognised role — or a tombstoned file with no `mimeType`, whose
association is still listed — is **listed but never fetched** (asserted: two such
assets rendered, zero B06 calls).

No bucket, object key, storage URL, presign, challenge, grant or asset token
appears anywhere; asserted by scanning the rendered DOM for each term.

### Per-asset failure

A failing image never fails the page — each figure has its own query, failure and
retry.

| Condition | Behaviour |
| --- | --- |
| `404` / `403` / `400` | One bounded state: *"Không mở được ảnh này."* No retry — a refusal will be refused again. Does **not** disclose whether the asset belongs elsewhere, failed inspection, was deleted or has unsupported media |
| `401` | Same bounded state; the Admin shell owns session expiry and shows its approved modal. A02 renders no competing "please log in" panel |
| transient (`5xx`, network) | *"Chưa tải được ảnh."* plus **one manual** retry. No automatic retry — call count verified unchanged after an idle wait |

Browser-verified with `REFERENCE` forced to `404`: one image still rendered, the
other showed the bounded copy, **no retry offered**, page fully usable.

A note on the classifier that a jsdom-only reading would get wrong: B06 is a
`responseType: 'blob'` call, so a failed body arrives as a `Blob` and
`normalizeApiClientError` cannot parse the envelope — it falls back to
`MALFORMED_RESPONSE` but still carries `httpStatus`. The HTTP status is therefore
the only trustworthy discriminator on this path, and a classifier matching a
business `code` here would classify every real failure as generic.

---

## G. Action matrix

Presentation only. `APP5-B05` re-reads and locks the source state and remains the
lifecycle authority; this table exists so an operator is not offered a button
certain to be refused.

| Status | Offered |
| --- | --- |
| `NEW` | `UNDER_REVIEW` (Bắt đầu xem xét), `CANCELLED` |
| `UNDER_REVIEW` | `NEEDS_CLARIFICATION`, `REJECTED`, `CANCELLED` |
| `NEEDS_CLARIFICATION` | `UNDER_REVIEW` (Tiếp tục xem xét), `REJECTED`, `CANCELLED` |
| `QUOTED`, `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW`, `APPROVED` | none |
| `REJECTED`, `CANCELLED` | none |
| unrecognised value | none — fails closed |

A status with no moves renders a **sentence**, not a row of disabled buttons: a
greyed-out control invites a hunt for an explanation, and a greyed-out APP6
action would advertise an unreleased surface. **No APP6 action exists anywhere** —
asserted by scanning every button label on a rendered page for quotation,
digitizing, design-review and payment wording, and by a boundary test requiring
each APP6 status to appear in the matrix only as `STATUS: NO_ACTIONS`.

Cancellation is absent from every post-quotation entry rather than disabled in
them (`G01-D06`, stage S1 only).

---

## H. Exact payloads

Bodies are built by **addition** — each target contributes only the fields B05
accepts for it — so a forbidden key has no path to the wire.

| Command | Body |
| --- | --- |
| `NEW → UNDER_REVIEW`, `NEEDS_CLARIFICATION → UNDER_REVIEW` | `{ toStatus: 'UNDER_REVIEW' }` |
| `→ NEEDS_CLARIFICATION` | `{ toStatus, internalReason, customerVisibleReason, moderationNote, moderationNoteKind: 'CLARIFY' }` |
| `→ REJECTED` | `{ toStatus, internalReason, customerVisibleReason, moderationNote, moderationNoteKind: 'REJECT' \| 'SPAM' }` |
| `→ CANCELLED` | `{ toStatus, internalReason, customerVisibleReason }` — note optional; if written, `moderationNote` **and** `moderationNoteKind: 'NOTE'` together |
| standalone note | `{ kind: 'NOTE', note }` |

**The `UNDER_REVIEW` moves send no customer-visible reason and open no dialog.**
`APP5-D01` approved dialog frames only for clarification, rejection and
cancellation, and B05's policy marks `customerVisibleReason` **`FORBIDDEN`** on
both review moves — `APP5-G01` §8 maps no notification to them, so text written
there would be a message with no delivery that `APP5-B03` would then show the
customer as the explanation of a state they were never told about. The review
move is one deliberate click carrying only its target, and no form is invented
for optional fields no approved frame offers. Asserted twice: the builder drops
both keys even when handed a populated form, and the browser wire body was
exactly `{ toStatus: 'UNDER_REVIEW' }`.

`SPAM` is never a default. `REJECT` is preselected; `SPAM` is an accusation about
the customer rather than a verdict about the request and stays an explicit
choice. `PAUSE` is not offered at all — APP5 has no transition that pauses
anything — while a *historical* `PAUSE` note still renders truthfully in the
history.

**Note and kind travel together or not at all**, because B05 refuses either half
alone as `MODERATION_NOTE_REQUIRED`.

### Server-owned fields

`TransitionCustomRequestBody` has five members and none is an actor, source
state, sequence, timestamp or correlation id. The screen builds that type and
nothing else, so these are not "not sent" — they have nowhere to go. Asserted
against every command shape, in the model suite and again against the real
browser wire body:

```
fromStatus  expectedFrom  adminId  customerId
actorKind   correlationId sequence timestamp
```

`expectedFrom` is server-side in B05; the state a request moves *from* is read
and locked by the server.

---

## I. Mutation safety and the stale conflict

- **Disabled in flight** — the submitting action and every sibling action.
- **Double-fire prevented by a ref, not by `disabled`** — a `disabled` attribute
  is one render behind a fast double-click, so the second click reaches the
  handler with the button still enabled. The `inFlight` ref is read and set
  synchronously in the same tick.
- **No automatic retry** — `retry: false` on both mutations and on both queries;
  verified in the browser (call count unchanged after a 1.2 s idle wait
  post-conflict) and in components (unchanged after an idle wait post-failure).
- **Entered fields preserved on a recoverable failure** — and deliberately *not*
  on a conflict, where the words describe a state the request has left.
- **Safe copy** — the classification picks the sentence; no server `message`,
  `code`, SQL fragment or stack reaches the operator (asserted by injecting
  `pg: connection refused` and `provider down` and asserting their absence).

### Stale 409

Both of B05's conflicts land on the stale path. `REQUEST_TRANSITION_STALE` is the
race — someone moderated first — and `INVALID_TRANSITION` is its slower twin: the
move was legal when the button rendered and is not legal now. **The operator's
next step is identical in both cases, and the one thing that must never happen in
either is a resubmit of the same payload.** The checkpoint brief names only the
first; treating both identically is the truthful reading and is recorded here as
a deliberate decision.

Flow, browser-verified against a real `409`:

```
stale mutation → 1 attempt, 0 automatic resubmit
              → detail refetched (1 additional read)
              → status on screen became the new persisted one
              → dialog closed, stale payload discarded with it
              → new decision required
```

There is **no "apply anyway"** control (asserted), and the refused payload is not
retained anywhere it could be replayed.

---

## J. Reason separation

`internalReason` and `customerVisibleReason` are never collapsed, in any of the
three places they appear: the current-status summary, each transition history
entry, and the dialog inputs. Each carries a label naming its reader —
*"Lý do nội bộ (chỉ nhân viên đọc)"* versus *"Nội dung gửi khách (khách sẽ
đọc)"*.

Neither is ever backfilled from the other: a status carrying only an internal
reason shows "Không có" for the customer-facing half (asserted). There is no
"same as above" affordance — a convenience that copied an internal assessment
across would publish it to the customer's status page through `APP5-B03`.

Internal notes are rendered as internal notes and never presented as customer
communication; the panel says so, because the same screen collects
customer-visible text a few inches away.

---

## K. History and notes

**Transitions** render in B04's returned order (oldest first by append sequence)
and are never re-sorted client-side — `sequence` is the server's append
authority, and sorting by `occurredAt` would reorder two moves recorded in the
same millisecond.

**No synthetic creation row.** Submission writes no transition (`G01-D05`), so an
unmoderated request shows an empty-history sentence (asserted: the empty state
renders and the list does not).

Actors are rendered as a **kind** (Nhân viên / Khách hàng / Hệ thống), never as a
name invented from `actorAdminId`.

**Notes are append-only**: no edit control, no delete control, no client-side
note id — B05 publishes no route for any of them. The panel states this.

After every mutation both lists come from the refetched detail; nothing is
constructed locally.

---

## L. Customer privacy

Only B04's already-authorized projection is used. No raw or normalized contact is
fetched or reconstructed; `maskedValue` is `APP4-P01`'s deterministic one-way
mask and is the only form published, stated on screen. No grant, challenge or
session appears. No customer editing or CRM control exists (asserted).

---

## M. Subject and quantity truth

The branch is read from the contract's `kind` discriminator, never sniffed from
nullable fields. The load-bearing case is asserted directly: a Catalog request
whose `productName`, `productSlug`, `variantColorName` and `variantSizeLabel` are
**all** absent still resolves as `CATALOG` — a field-sniffing reader would call it
customer-owned and render a COP panel for a store product.

Catalog-only fields stay Catalog-only and COP-only fields stay COP-only; the two
branches share no rows. A missing label renders "Không còn thông tin" rather than
a guess or a blank that reads as a value.

Quantity is read-only and exactly as stored: lines are never merged or split
(asserted with two lines sharing one size label staying two rows), no variant is
inferred, and `totalQuantity` is the server's.

---

## N. Responsive, styling, accessibility

Reuses the existing Admin shell and the A01 route family. SCSS only, tokens from
`@embroidery/styles`, feature-scoped `request-*` / `moderation-*` class names —
the Admin stylesheet is global, so a generic `.panel` would collide invisibly to
jsdom. No Tailwind, no CSS-in-JS, no new UI framework, no arbitrary palette. The
status badge reuses the queue's `.custom-request-status` contract rather than
restating ten status tints. Status meaning never depends on colour alone: the
badge always renders text, and the conflict banner is distinguished by its
heading sentence.

**Measured in the real browser** (dev stack, Nginx gateway, authenticated
operator session):

| Viewport | `documentElement` scroll / client | Columns | Overflowing elements |
| --- | --- | --- | --- |
| 1440×900 | 1425 / 1425 | `496.5px 496.5px` | none |
| 1280×900 | 1265 / 1265 | `416.5px 416.5px` | none |

No page-level horizontal scroll at either viewport; the moderation dialog fits
(621 px in a 900 px viewport) and scrolls internally rather than pushing the
page; evidence tiles do not force overflow.

Focused accessibility evidence (not a WCAG certification):

- exactly one page-level `h1` (asserted), semantic `<section>`s each labelled by
  their own heading;
- status rendered as text with `data-status` for tests/styling;
- `<dt>`/`<dd>` pairs so a label and its value are associated structurally;
- loading and submitting announced through visually-hidden `role="status"`
  regions; the skeleton itself is `aria-hidden` (it is a shape, not information);
- evidence alt text is role + position within role — **never an asset id**
  (asserted);
- dialogs are `role="dialog"` / `alertdialog` (the two terminal decisions),
  `aria-modal`, labelled by their title, described by their help text, with focus
  moved in on mount, trapped while open and restored to the trigger on close;
- every field has a real `<label for>` and its error is wired through
  `aria-describedby` with `aria-invalid`, so the reason a field is invalid is
  announced *with* the field rather than only in the summary;
- the conflict state is announced via `role="alert"` with no hidden resubmit;
- submit disabled in flight; visible focus rings on every interactive control.

---

## O. Validation ledger

Every command below was run from `apps/admin/` unless noted. Rerun counts reflect
genuine reruns after a fix, not repetition.

| # | Command | Runs | Result |
| --- | --- | --- | --- |
| 1 | `npx tsc --noEmit -p tsconfig.json` (packages/api-client) | 1 | **PASS** |
| 2 | `npx tsc --noEmit -p tsconfig.json` (apps/admin) | 4 | **PASS** — `--listFiles` confirmed all 30 new files covered; two intermediate failures fixed (see below) |
| 3 | `npx jest test/model/custom-request-detail-model.test.ts` | 3 | **PASS** — 48 tests |
| 4 | `npx jest test/components/custom-request-detail-render.test.tsx` | 2 | **PASS** — 28 tests |
| 5 | `npx jest test/components/custom-request-detail-evidence.test.tsx` | 3 | **PASS** — 11 tests |
| 6 | `npx jest test/components/custom-request-detail-moderation.test.tsx` | 1 | **PASS** — 16 tests |
| 7 | `npx jest test/boundary/custom-request-detail-source.test.ts` | 2 | **PASS** — 15 tests |
| 8 | all five suites together (post-Prettier) | 1 | **PASS** — **118 tests, 5 suites** |
| 9 | `npx eslint <changed admin + test files>` | 2 | **PASS** — 6 errors fixed |
| 10 | `npx prettier --write <changed files>` | 1 | applied |
| 11 | `git diff --check` | 1 | **PASS** — no whitespace errors |
| 12 | Browser review, 1440 + 1280 (§N, §P) | 1 | **PASS** — one real defect found and fixed |

Intermediate failures, all fixed:

- `makeApiClientError` takes an **options object**; two call sites passed
  positional arguments. One test passed for the wrong reason (a `undefined`
  status degraded to the network branch, which also renders the error panel) —
  worth noting because it is exactly the shape of a test that would have kept
  passing while the classifier broke.
- Three assertions read the evidence state before the rejection settled; wrapped
  in `waitFor`.
- `exactOptionalPropertyTypes` rejects `{ subject: undefined }` — B04 *omits* the
  key, so the fixture now omits it too.
- Four ESLint findings: a `no-fallthrough` comment placement, three unnecessary
  type assertions, and a promise rejected with a non-Error.
- The boundary rule "names no APP6 target anywhere" was **too broad** and caught
  legitimate code — the status label table and the action matrix must name the
  APP6 states in order to label them truthfully and map them to *no* actions. It
  was narrowed to the payload-building surface plus a positive
  `STATUS: NO_ACTIONS` assertion. The rule biting on real code is evidence the
  suite is not vacuous.

### Not run — deliberately

`APP5-B04`, `B05` (moderation/race), `B06` delivery, `B01`/`B02`/`B03`/`B07`,
`DB01`, `S01`/`S02`, the full `A01` suite, APP3/APP4 regressions, full API
integration, full Jest, full Playwright/E2E, full DB regression, the worker
suite, the Figma checker (registry unchanged), OpenAPI generation/check,
api-client generation/check, SonarQube, and any all-workspace build or typecheck.
**No backend, Storefront or historical regression suite was rerun.** The Admin
production build was not run: the changed route/server-client boundary was
validated by the Admin typecheck plus the live browser evidence in §P.

---

## P. Browser review

`admin.embroidery.local` through the Nginx gateway, authenticated as the operator
in a real session. **The credential was requested from the operator for this
run; it is not recorded here, in any fixture, in any file or on any command
line.** Viewports 1440×900 and 1280×900.

### P.1 Live, against the real `APP5-B04`

| Step | Evidence |
| --- | --- |
| Unauthenticated `/requests/{id}` | `307 → /login` — the existing Admin guard; A02 adds no auth path |
| Unknown request id | Real API `404` → the approved not-found state, *"Yêu cầu không tồn tại hoặc không thuộc quyền xem của bạn."*, **no retry offered**, back-to-queue link present |
| Real queue | The dev database holds **zero** custom requests, so no live populated detail exists |

### P.2 With B04/B05/B06 stubbed at the browser network boundary

Permitted by brief §27 when the dev DB has no useful requests. No database was
seeded. Route fulfilment via Playwright; evidence bytes served as SVG so the real
`Blob → createObjectURL → <img> → revoke` path runs end to end.

| Check | Result |
| --- | --- |
| COP detail renders | ✅ subject, dimensions, customer, quantity, history, notes |
| Evidence | ✅ 2 images from real `blob:` URLs, fetched with request id **and** asset id in the path |
| Validation state (`669:173`) | ✅ shown; **0** transition calls on invalid submit; 3 field-level errors |
| Dialog fit at 1280 | ✅ 621 px in a 900 px viewport, fully within bounds |
| Clarification wire body | ✅ exactly `{toStatus: NEEDS_CLARIFICATION, internalReason, customerVisibleReason, moderationNote, moderationNoteKind: CLARIFY}` |
| Success → refetch | ✅ 1 transition call, 2 detail reads, status → `NEEDS_CLARIFICATION` (*"Cần làm rõ"*), history 1 → 2 entries, both reasons distinct on page, dialog closed |
| Action set after the move | ✅ `Tiếp tục xem xét`, `Từ chối yêu cầu`, `Huỷ yêu cầu` |
| Standalone note | ✅ body `{kind: 'NOTE', note}`, notes 1 → 2 from the refetched detail |
| Stale `409` | ✅ **1** attempt, **0** resubmit (still 1 after a 1.2 s wait), detail re-read, new status on screen, dialog closed, conflict banner shown |
| Per-image `404` | ✅ 1 image still rendered, other showed bounded copy, **no retry**, page usable |
| Horizontal overflow | ✅ none at 1440 or 1280 |
| Console | ✅ 0 unexpected errors — only the 4 deliberately injected HTTP failures (2×404, 409, 404) |

### P.3 The defect the browser found

**The stylesheet did not compile, and no jsdom test could have known.** Nine
declarations used `spacing()` steps outside the approved scale — `spacing(2)`,
`spacing(120)`, `spacing(160)`, `spacing(480)` — and the Sass foundation rejects
them:

```
Error: "Unknown spacing step `2`. Approved steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128."
```

Every Admin page returned `500`, because `main.scss` is one global entry.
Component tests do not compile SCSS, so all 118 of them passed against a
stylesheet the application could not build. Fixed by moving to approved steps and
by naming the two genuine component dimensions the scale does not express —
`$evidence-tile-min: 160px` and `$dialog-max-width: 480px` — as local variables
rather than smuggling them through `spacing()`. Border widths became plain `px`,
since a border is not a spacing rhythm. Verified: zero SCSS errors in the
container over the review window, `/requests/{id}` serving `200`.

---

## Q. API-client boundary

Four operations and their types added to `packages/api-client/src/index.ts` —
the curated surface only. **Nothing generated was regenerated or hand-edited**:
`packages/api-client/src/generated/**` and
`packages/contracts/openapi/openapi.generated.json` are untouched.

`APP5-B06` deliberately left its curated export to this checkpoint; it is
published here, together with the detail read and — **for the first time** — the
two B05 mutations, which were held back until a screen had an approved control
for them. The A01 boundary comment stating they "deliberately do not" cross was
updated to say where they now do, and the queue feature still imports only
`adminCustomRequestList`.

The kind/target enums cross as **values** so the dialogs derive their offered
note kinds from the contract rather than a hand-kept list.
`AdminRequestModerationNoteResponseKind` publishes the full TBL-041 set,
`PAUSE` included, because a historical note may carry it and the history renders
what is stored — while the dialogs offer the narrower APP5 set.

`FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` **remains open**; A02 is not the
backend owner of that defect. No cast was needed for it in this checkpoint — the
A02 response types are ordinary optionals — so no adapter-boundary guard was
introduced.

Ran: `npx tsc --noEmit` in `packages/api-client` (narrow typecheck for the
curated exports). No api-client generation or contract check was run.

---

## R. Files changed

**Added (30 runtime + 6 test/doc):**

```
apps/admin/src/app/(protected)/requests/[requestId]/page.tsx
apps/admin/src/features/custom-request-detail/index.ts
apps/admin/src/features/custom-request-detail/model/          (6 files)
apps/admin/src/features/custom-request-detail/services/       (2 files)
apps/admin/src/features/custom-request-detail/hooks/          (4 files)
apps/admin/src/features/custom-request-detail/components/     (16 files)
apps/admin/src/features/custom-request-detail/styles/custom-request-detail.scss
apps/admin/test/support/custom-request-detail-fixture.ts
apps/admin/test/model/custom-request-detail-model.test.ts
apps/admin/test/components/custom-request-detail-render.test.tsx
apps/admin/test/components/custom-request-detail-evidence.test.tsx
apps/admin/test/components/custom-request-detail-moderation.test.tsx
apps/admin/test/boundary/custom-request-detail-source.test.ts
docs/implementation/reports/APP5-A02-COMPLETION-REPORT.md
```

**Modified (3):**

```
apps/admin/src/styles/main.scss                     one @use line
packages/api-client/src/index.ts                    curated exports + A01 note
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md  roadmap + delivery note
```

**Unchanged, as required:** `apps/api/**`, `apps/worker/**`, `apps/storefront/**`,
`database/**`, migrations, `packages/contracts/openapi/**`,
`packages/api-client/src/generated/**`, Figma, and
`docs/design/FIGMA_DESIGN_INDEX.md`. No A01 link fix was needed — the existing
`adminCustomRequestDetailRoute` addressed the delivered route correctly.

---

## S. Follow-ups

**Carried open, unchanged:**

```
FU-APP5-B04-DESIGN-PREVIEW-01        no authorized Catalog design preview (§E)
FU-APP5-S01-STUDIO-ENTRY-01
FU-APP5-S02-CONFIRMATION-SUMMARY-01
FU-APP5-S02-MASKED-CONTACT-01
FU-APP5-S02-NULLABLE-STRING-CONTRACT-01
FU-APP5-A01-FILTER-SET-CONFIRM-01
FU-APP5-A01-QUEUE-COUNT-01
```

**Closed, not reopened:** `FU-APP5-B04-COP-ASSET-DELIVERY-01 = CLOSED_BY_APP5_B06`.

**Noted, not opened as new work:** `FU-ADMIN-SHARED-DIALOG-01` remains open and
unowned; `ModerationDialog` is the **sixth** hand-rolled Admin dialog. It was
written locally rather than imported from `customer-access-support` or
`design-template-lifecycle`, because quietly coupling unrelated capabilities to
share markup would make resolving all six at once harder, not easier.

---

## T. Residual risks

1. **Live Figma was never opened.** Implementation followed the frozen repository
   registry and the phase plan's prose description of the frames. Pixel-level
   fidelity to the approved nodes is therefore unverified; structure, states and
   copy intent were followed. A02 changed no design artifact.
2. **No live populated detail exists.** The dev database holds zero custom
   requests, so every populated-state proof is against a stubbed network
   boundary shaped to the generated contract. The contract shapes were read from
   the generated types rather than assumed, and the not-found path *was* exercised
   against the real API.
3. **Both B05 `409`s are treated identically** (§I). If a future checkpoint needs
   `INVALID_TRANSITION` to read differently from `REQUEST_TRANSITION_STALE`, the
   classifier is the single place to split them.
4. **React StrictMode double-fetch in dev.** With `gcTime: 0`, the dev-only
   double-effect produces a second B06 request per asset. This is a development
   artifact of the strict-mode remount, not a production path, and no retry loop
   exists — but it is recorded rather than left for someone to rediscover.
5. **The Admin production build was not run.** The route is a standard
   server-component segment awaiting `params`, validated by typecheck and by the
   live dev server rendering it.

---

## U. Roadmap

```
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
APP5-A01  = COMPLETE
APP5-B06  = COMPLETE
APP5-A02  = COMPLETE
APP5-E01  = INCOMPLETE  NEXT
APP5-X01  = INCOMPLETE
```

Not pushed.

NEXT CHECKPOINT: APP5-E01 — Cross-layer acceptance
