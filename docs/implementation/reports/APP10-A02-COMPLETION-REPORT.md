# APP10-A02 — Admin Guarded Customer Merge Workflow — Completion Report

## A. Verdict

```text
APP10-A02 = COMPLETE
PO_DECISION_REQUIRED = NONE
DESIGN_APPROVAL = FIG-APPROVAL-APP10-D01-PO-001
NEXT_CHECKPOINT = APP10-I01
CORRECTION_ATTEMPT = initial (0 of 1 used)
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E = NOT_RUN
```

No irreducible design/contract contradiction was found. One contract limit was
resolved inside the checkpoint rather than escalated — §G.4 records it in full,
and the approved design already anticipates it.

### Figma read note

The `figma-desktop` MCP server did not connect in this session
(`ConnectionRefused`), as in `APP10-A01`. The approved node contents were
resolved from the in-repo design authority instead: the 41 registry rows in
`docs/design/FIGMA_DESIGN_INDEX.md` §4.16 (all
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP10-D01-PO-001`) and
`docs/implementation/reports/APP10-D01-COMPLETION-REPORT.md` §E and §G, which
record each A02 frame's coverage and the package's constraint compliance
frame-by-frame. Nothing was implemented that those two documents do not specify.
A tooling limitation of the session, not a registry gap. No Figma node was
created, modified, moved, renamed or deleted, and no registry row was edited.

---

## B. Routes and navigation

| Route | Segment | Screen |
|---|---|---|
| `/support/customer-access/merge` | `app/(protected)/support/customer-access/merge/page.tsx` | `MergeSelectionScreen` |
| `/support/customer-access/merge/{caseId}` | `app/(protected)/support/customer-access/merge/[caseId]/page.tsx` | `MergeCaseScreen` |

**Nav-active.** Both are sub-routes of the existing customer-access support
entry. `resolveNavItemState` already returns `'section'` for any path under
`${href}/`, so the support entry stays lit and remains a reachable destination on
both screens. **The Admin shell was not modified**: `ADMIN_PRIMARY_NAV` still has
its eight entries, none of them containing `merge`. Asserted by
`customer-merge-navigation.test.tsx`.

**Direct refresh.** `MergeCaseScreen` takes only `mergeCaseId` and reads
everything else from `GET /api/admin/customer-merges/{caseId}`. No state from the
selection screen participates, so a direct visit, a bookmark and a reload behave
identically to arriving from an open. Asserted: the suite renders the screen with
nothing but a case id.

**Not added:** `/customers`, a customer directory, a merge queue or list, a
duplicate-candidate browser, bulk merge, or a separate CRM nav section. None has
a backing operation and none is drawn.

---

## C. Backend operations consumed

| Workflow action | Generated-client operation | HTTP |
|---|---|---|
| Resolve a participant (both slots) | `adminCustomerSupportResolve` | `POST /api/admin/customers/resolve` |
| Render a resolved participant card | `adminCustomerSupportDetail` | `GET /api/admin/customers/{customerId}` |
| Open a case | `adminCustomerMergeOpen` | `POST /api/admin/customer-merges` |
| Read the case (and every re-read) | `adminCustomerMergeDetail` | `GET /api/admin/customer-merges/{caseId}` |
| Reject a case | `adminCustomerMergeReject` | `POST …/{caseId}/reject` |
| Execute a case | `adminCustomerMergeExecute` | `POST …/{caseId}/execute` |

| Change class | Count |
|---|---|
| Backend endpoints added or altered | **0** |
| OpenAPI document changes | **0** |
| Generated client regenerated or edited | **0** |
| Migrations / schema changes | **0** |
| Workers touched | **0** |
| Figma nodes touched | **0** |

Two non-generated barrel changes were required, both handwritten and both
explicitly permitted by §4 of the brief:

1. `packages/api-client/src/identity.ts` re-exports the four merge operations,
   two enums (`AdminCustomerMergeCaseResponseStatus`,
   `AdminCustomerMergeExecutedResponseOutcome`) and the merge request/response
   types. `APP10-B02`/`B03` generated them but published none through the barrel,
   and `FRONTEND_CONVENTIONS` §8 forbids a feature deep-importing `generated/`.
2. `apps/admin/src/features/customer-access-support/index.ts` publishes the
   exact-contact resolution seam — `resolveCustomerByContact`,
   `fetchCustomerDetail`, `customerAccessKeys`, `classifyLookupFailure` and the
   feature's error type. The merge workflow resolves its participants **through
   that boundary** rather than reaching into `services/` or re-implementing the
   call, so one authority keeps the rule that the contact travels in a body, is
   never returned, stored, logged or keyed, and only an opaque id leaves. The
   support feature's own mutations stay off the boundary: nothing outside it can
   revoke a grant, replay a notification, patch a profile or retire a contact.

Nothing in `packages/api-client/src/generated/` was edited.

---

## D. Participant selection

| Rule | Implementation |
|---|---|
| Exact-contact only | Both slots call `resolveCustomerByContact`. The contact goes into the request **body**, the field is cleared on success before the resolved card renders, and it is never written to the URL, storage, a query key or the merge request. |
| No enumeration | No customer list, directory, autocomplete, prefix or fuzzy search, and no paging. A verified contact belongs to exactly one Customer, so a match is one id or a 404 — one answer whose cause the screen deliberately cannot name. |
| Roles are named | "Khách giữ lại" / "Khách được gộp", each with a sentence: the survivor stays the active identity and receives everything live; the loser is marked merged away and stops being an identity. Rendered whether the slot is empty or filled. Asserted that "Khách hàng 1 / 2" appears nowhere. |
| A miss empties the slot | A failed lookup clears that slot rather than leaving the previous Customer in it — an irreversible operation must never be aimed at whoever happened to be there. |
| Replace before open | `Đổi khách hàng` on each filled slot returns it to its lookup form. |
| No swap after open | The workflow leaves this screen entirely on success; survivor and loser are thereafter a property of the case, and `POST …/execute` takes no body that could name a different pair. The case screen states this in place and offers no swap or re-selection control. |
| Same-customer guard | When both slots hold one id the approved explanation is shown and the open button is **disabled**. Asserted that no request is sent — the guard never harvests the server's refusal. `APP10-B02` remains the authority. |

The participant card renders `maskedValue` exactly as it arrives. There is no
masking function in this feature; neither response type has a field for a raw,
normalized or display value.

---

## E. Open-case flow

- **Reason required**, bounded at 1000, trimmed before it travels. Validated
  beside the field, so a blank reason never spends a round trip. Asserted:
  `'  Cùng một người.  '` reaches the wire as `'Cùng một người.'`.
- **Body**: `{ survivorCustomerId, loserCustomerId, reason }` and nothing else.
  Asserted that neither the fixture's raw email nor its raw phone appears
  anywhere in the serialised body.
- **"Opening moves nothing"** is stated beside the submit button, because the
  safety property of this workflow is that the decision and the execution are two
  separate acts.
- **Success** → `router.push('/support/customer-access/merge/{caseId}')`.
  Asserted against the exact path.
- **Pending** disables the submit and swaps its label, so a second click cannot
  open a second case for the pair.

Refusal mapping (§G.4 explains why these are the honest granularity):

| Wire | UI state |
|---|---|
| 400 | validation — check the reason |
| 404 (`SURVIVOR_NOT_FOUND` \| `LOSER_NOT_FOUND`) | one stale-participant refusal; the screen does not say which side |
| 409 (`MERGE_CASE_ALREADY_OPEN` \| `SURVIVOR_ALREADY_MERGED` \| `LOSER_ALREADY_MERGED`) | one bounded conflict whose copy **names both** possibilities |
| 401 / 403 / other | session expired / refused / one sanitized generic sentence |

Asserted that the server's own sentence ("A merge case is already open for this
pair of customers.") never reaches the DOM.

---

## F. Detail and consequence preview

Rendered for a REQUESTED case, from `MergeConsequencePreviewResponse`:

| Category | Copy | Test id |
|---|---|---|
| `contactPoints` | Liên hệ | `merge-preview-contact-points` |
| `activeSecureAccessGrants` | Quyền truy cập an toàn đang hoạt động (+ "sẽ bị thu hồi") | `merge-preview-active-grants` |
| `customRequests` | Yêu cầu đặt riêng | `merge-preview-custom-requests` |
| `orders` | Đơn hàng | `merge-preview-orders` |
| `uploadedAssets` | Tệp khách tải lên | `merge-preview-uploaded-assets` |
| `businessProfile.loserHasProfile` / `.survivorHasProfile` | Hồ sơ doanh nghiệp, both sides | `merge-preview-loser-profile`, `-survivor-profile` |

- **Domain labels only.** Asserted that `secure_access_grants`, `contact_points`,
  `customer_merge_cases`, `business_profiles`, `consequencePreview` and
  `activeSecureAccessGrants` appear nowhere in the document.
- **Counts, not rows.** No per-record list is rendered and none is invented — the
  API returns counts. Asserted no table and no `merge-affected-records`.
- **Advisory, and it says so.** The intro states the counts are read from current
  rows and that execution re-evaluates state inside its own transaction.
- **Frozen evidence is preserved, not rewritten.** Its own note, asserted.
- Also rendered: status, case reference, `requestedAt`, `decidedAt` when present,
  the **opening** reason (which the contract does publish), both masked
  participant cards with their role definitions, and the direction note.
- A participant card may legitimately be absent — `survivor` and `loser` are
  optional because `findDetailSummary` answers `undefined` for a Customer row
  that is gone — so that branch renders a plain sentence rather than pretending
  to describe somebody.

### Business-profile blocker

When `consequencePreview.businessProfile.conflict === true`:

- the high-visibility blocker is rendered (`role="alert"`), explaining that both
  identities already own a profile, that at most one may exist per Customer, and
  that the resolution happens outside this flow;
- the execute button is **disabled, not hidden** — a missing button is
  indistinguishable from a screen that failed to render one, and the blocker sits
  above the control it explains;
- reject stays enabled, as the safe exit;
- **no** overwrite, merge-fields, delete-one or continue-anyway affordance
  exists. Asserted by absence of all four.

---

## G. Execute flow

### G.1 Confirmation

Restates, in words: the survivor, the loser, that the loser is marked merged into
the survivor, that contacts move, that live ownership (custom requests, orders,
uploaded assets, business profile) is repointed, that **active loser grants are
revoked**, that **frozen evidence and append-only history are preserved rather
than rewritten**, and that **there is no unmerge**. All six asserted.

No claim is made that every historical record is rewritten, and none that the
merge is reversible.

### G.2 The call

`POST /api/admin/customer-merges/{caseId}/execute`, case id only. Asserted: the
mock receives exactly two arguments — the id and the request options — so there
is no body through which a caller could name a different pair, swap them or skip
a step.

### G.3 Completion

| `outcome` | Treatment |
|---|---|
| `EXECUTED` | success state, then authoritative re-read |
| `ALREADY_EXECUTED` | its own wording — the request resolved to the merge that already happened, nothing moved twice — styled as a finish, asserted **not** to render an error |

Both re-read the case; the screen then renders `status` from the server. Nothing
writes `EXECUTED` into the cache ahead of the response.

### G.4 Refusal mapping, and the contract limit behind it

`customer-merge.errors.ts` raises every refusal as
`HttpException({ message }, status)` with **no `code` field**, exactly as
`APP10-B01` does. So `MERGE_CASE_NOT_EXECUTABLE`,
`MERGE_BUSINESS_PROFILE_CONFLICT` and `MERGE_CONTACT_COLLISION` all arrive as one
indistinguishable 409.

Three options were considered:

1. **Parse the message.** Rejected — server-authored prose that is free to
   change; the screen would break silently the first time somebody edited it.
2. **Guess from the pre-click snapshot.** Rejected — that snapshot is exactly
   what was already wrong.
3. **Re-read, then classify.** Chosen, following the rule `APP10-A01` set. The
   hook awaits a fresh case before classifying and reads the reason off what the
   server now says is true.

| Fresh record says | UI state | Frame |
|---|---|---|
| read failed / 404 on the mutation | stale case | `833:39` grammar |
| `status === REJECTED` | declined, cannot be executed | `840:110` grammar |
| `businessProfile.conflict === true` | business-profile refusal | `840:110` |
| anything else | **one bounded refusal naming both** remaining causes | `841:3` |

The last row is not a compromise: **`FIG-APP10-A02-EXECUTE-PARTICIPANT-REFUSED`
(`841:3`) is the approved frame for *both* "participant became invalid after
preview" and "contact collision"** — the D01 completion report §E maps both rows
to that one node. The detail read publishes no merge tombstone and no
contact-uniqueness signal, so a client choosing between them would be inventing a
distinction the API declines to publish. The copy names both and states that
nothing was merged.

No retry, no forced execute and no "auto deduplicate" is offered. Asserted by
absence of `merge-force-execute` and `merge-auto-deduplicate`. Asserted that a
500's message ("duplicate key value violates unique constraint"), `requestId` and
the literal code never reach the DOM.

Recorded as non-blocking follow-up `FU-APP10-A02-01`.

---

## H. Reject flow

- Secondary action beside the primary execute, distinguished by verb and by
  style — never by colour alone.
- **Reason required**, bounded at 1000, trimmed. The hint states up front that it
  is recorded in the audit trail with the Admin session **and is not shown again
  on this screen** — because `customer_merge_cases` has one reason column and it
  holds the opening reason.
- Body: `{ reason }`; addressed by case id. Asserted.
- Success → success state → authoritative re-read → `REJECTED` rendered, with
  **no execute action** and no reject action. Asserted.
- `409` → "already decided" (deliberately not idempotent: a second operator's
  reason must not be silently discarded), and the case is re-read so the screen
  stops offering decisions on a closed case. `404` → stale. `400` → validation.
  Others → sanitized generic.
- The `REJECTED` state renders `COPY.rejected.noReasonNote`, saying the declining
  reason lives in the audit trail and is not republished. **No** rejection-reason
  field is fabricated, **no** audit API is called, and the *opening* reason —
  which the contract does publish — remains visible as the different field it is.
  All asserted.

---

## I. Contract-fidelity proof

| Capability | Proof it is absent |
|---|---|
| Merge list / queue | No list operation exists; no route, no screen, no nav entry. Asserted `merge-queue`, `merge-list`, `duplicate-candidates` are not rendered. |
| Customer enumeration | Both participants come from the exact-contact resolver. Asserted no `customer-list`, `customer-search`, `customer-directory` and no `listbox` role. |
| Unmerge | No such operation. Asserted `merge-unmerge` is absent on the executed case; the confirmation says in words there is no undo. |
| Merge-event timeline | `customer_merge_events` is written by `APP10-B03` and published by no HTTP operation. Asserted `merge-event-timeline` is absent; the executed state says in place why no figures appear. |
| Historical rejection-reason display | No column and no read. Asserted `merge-rejection-reason` is absent and the note explaining its absence is present. |
| Post-execution "moved" counts | The preview is a REQUESTED-only surface. Asserted: with an EXECUTED case carrying non-zero preview counts, `merge-preview-tiles` is **not** rendered and `merge-preview-withheld` is. |
| New backend operation / migration / OpenAPI / Figma node | §C and §N: all zero. |
| Persisted workflow state beyond the contract | Only `REQUESTED` / `EXECUTED` / `REJECTED` are rendered. A dialog being open is local UI state and is never rendered as a state of the case. |
| Duplicate detection, bulk merge, RBAC, provider messaging, Zalo/Messenger | None implemented; none has a backing operation. |

---

## J. Privacy, accessibility, responsive

### Privacy

- Only `maskedValue` is rendered, exactly as it arrives, on both screens and
  inside the execute confirmation. Asserted over the whole document, with a
  dialog open, against the raw email, raw phone, code, token, digest, ciphertext
  and the strings `normalizedValue` / `displayValue`.
- No contact value appears in either URL or in any query string: the selection
  route takes no parameter, and the case route carries only an opaque case id.
- Every refusal renders a fixed local sentence; no server message, `requestId`,
  business code or stack reaches the DOM. Asserted on three different failures.
- Customer and case UUIDs are used for addressing. The case reference is
  displayed because the approved frames show one; neither Customer id is
  presented as an identity label — the masked cards are.

### Accessibility

- Survivor/loser are `h3` headings with definition sentences; each slot is a
  labelled `section`.
- Every lookup field, kind selector and reason field has a real `<label for>`.
- Both dialogs use `role="alertdialog"`, `aria-modal`, `aria-labelledby`,
  `aria-describedby`, move focus in on mount, trap it, restore it to the trigger
  on close and dismiss on `Escape`.
- Validation is bound through `aria-describedby` + `aria-invalid` and announced
  via `role="alert"`; the blocker is itself an `alert`.
- Pending actions disable, on all three mutations, with a pending label.
- Execute and reject are distinguished by verb and by button role, not by colour;
  status is a word inside the pill, never a tint alone.
- The disabled execute keeps its accessible name and the blocker above it states
  the reason on screen — not in a `title` a keyboard user would never surface.
- No icon-only destructive action exists.

### Responsive

1440 desktop and Admin-narrow 1280 (`836:3` and `838:3`). The participant grid is
`repeat(auto-fit, minmax(420px, 1fr))`, so the two cards stack at 1280 without a
media query; preview tiles are `flex: 1 1 200px` and wrap, and each tile carries
its label and count as one item so a wrap can never separate a number from what
it counts. Every card sets `min-width: 0` and long values use
`overflow-wrap: anywhere`, so the core workflow has no horizontal overflow. No
separate mobile-Admin product was invented.

---

## K. Tests executed

Change-impact only.

| Command | Relevance | Result |
|---|---|---|
| `pnpm --filter admin exec jest test/components/customer-merge-selection.test.tsx` | new — selection + open | **PASS 14/14** |
| `pnpm --filter admin exec jest test/components/customer-merge-case.test.tsx` | new — case read, preview, blocker, decided states, privacy | **PASS 14/14** |
| `pnpm --filter admin exec jest test/components/customer-merge-decisions.test.tsx` | new — execute + reject | **PASS 13/13** |
| `pnpm --filter admin exec jest test/components/customer-merge-navigation.test.tsx` | new — nav-active on both sub-routes, no new entry | **PASS 5/5** |
| `pnpm --filter admin exec jest test/components/customer-merge` | the four together | **PASS 46/46** |
| `pnpm --filter admin exec jest test/components/customer-access` | directly affected regression: A02 edited the `customer-access-support` **public barrel**, which all six suites import | **PASS 78/78** |
| `pnpm --filter admin typecheck` | changed Admin sources | **PASS** |
| `pnpm --filter @embroidery/api-client typecheck` | changed barrel | **PASS** |
| `node tools/check-file-size.mjs` | new source and test files | 80 violations — **identical to HEAD**, 0 in APP10-A02 files |
| `node tools/check-styling-boundaries.mjs` | new SCSS leaf | 25 violations — **identical to HEAD**, 0 in `customer-merge.scss` |

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E = NOT_RUN
```

Also **NOT_RUN**, as instructed: all Admin tests, all API tests, `APP10-E01`,
`APP10-B01`/`B02`/`B03` backend suites, DB-wide checks, Storefront tests, and
notification/payment/inventory regression.

`test/components/customer-access` was run because A02 modified a shared A01
source file — the feature's public barrel — which every one of those suites
imports; that is the §22.2 condition, not proximity within the product section.
No A01 behaviour was changed and none regressed.

New tests: **46**. Directly-affected regression: **78**, all passing. Total run:
**124**.

---

## L. Quality validation

- **Prettier** — `pnpm exec prettier --write` over exactly the touched paths; all
  changed files formatted, nothing else in the repository reformatted.
- **ESLint** — `pnpm --filter admin lint` and
  `pnpm --filter @embroidery/api-client lint`. **Zero findings in APP10-A02
  code.** One inherited error remains:
  `apps/admin/test/components/request-quotation-bootstrap.test.tsx:35` — unused
  `UNKNOWN_REQUEST_STATUS_LABEL` (APP6). Verified present at HEAD in `APP10-A01`;
  A02 does not modify that file, so it stays out of scope (`FU-APP10-A02-02`).
- **SonarQube** — repository-global control, run by CI on the branch. Not
  invocable as a checkpoint command and not run here; nothing in this checkpoint
  suppresses, excludes or configures around it.

No aggregate command was used, and no unrelated functional test was launched.

---

## M. Files changed

**New (18)**

```text
apps/admin/src/app/(protected)/support/customer-access/merge/page.tsx                        22
apps/admin/src/app/(protected)/support/customer-access/merge/[caseId]/page.tsx               28
apps/admin/src/features/customer-merge/index.ts                                              23
apps/admin/src/features/customer-merge/components/business-profile-blocker.tsx               49
apps/admin/src/features/customer-merge/components/merge-case-screen.tsx                     232
apps/admin/src/features/customer-merge/components/merge-case-summary.tsx                    135
apps/admin/src/features/customer-merge/components/merge-consequence-preview.tsx             117
apps/admin/src/features/customer-merge/components/merge-dialog.tsx                          102
apps/admin/src/features/customer-merge/components/merge-execute-dialog.tsx                  147
apps/admin/src/features/customer-merge/components/merge-participant-card.tsx                102
apps/admin/src/features/customer-merge/components/merge-reject-dialog.tsx                   152
apps/admin/src/features/customer-merge/components/merge-selection-screen.tsx                162
apps/admin/src/features/customer-merge/components/participant-slot.tsx                      210
apps/admin/src/features/customer-merge/hooks/use-merge-case.ts                               77
apps/admin/src/features/customer-merge/hooks/use-merge-decision.ts                          157
apps/admin/src/features/customer-merge/hooks/use-open-merge-case.ts                          93
apps/admin/src/features/customer-merge/hooks/use-participant-selection.ts                   123
apps/admin/src/features/customer-merge/model/customer-merge-copy.ts                         221
apps/admin/src/features/customer-merge/model/customer-merge-failure.ts                      156
apps/admin/src/features/customer-merge/model/customer-merge-keys.ts                          22
apps/admin/src/features/customer-merge/model/customer-merge-route.ts                         28
apps/admin/src/features/customer-merge/model/merge-reason.ts                                 32
apps/admin/src/features/customer-merge/services/customer-merge.service.ts                   115
apps/admin/src/features/customer-merge/styles/customer-merge.scss                           501
apps/admin/test/support/customer-merge-fixture.ts                                            92
apps/admin/test/components/customer-merge-selection.test.tsx                                362
apps/admin/test/components/customer-merge-case.test.tsx                                     312
apps/admin/test/components/customer-merge-decisions.test.tsx                                356
apps/admin/test/components/customer-merge-navigation.test.tsx                                56
```

**Modified (4)**

```text
apps/admin/src/features/customer-access-support/index.ts       — publishes the resolution seam
apps/admin/src/styles/main.scss                                — composes the new leaf stylesheet
packages/api-client/src/identity.ts                            — re-exports the four merge operations
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md — §11 roadmap + log
```

Every runtime/application source file is ≤ 400 lines and every test file ≤ 600.
`customer-merge-case.test.tsx` was split by responsibility into the case-read
suite and `customer-merge-decisions.test.tsx` — a real boundary (reading a case
versus deciding one), not a fragment cut to satisfy a threshold. The SCSS leaf is
501 lines and is a stylesheet, not logic source: `check-file-size.mjs` does not
cover it, and the existing `customer-access-support.scss` sets that precedent.

---

## N. Baseline delta

| Dimension | HEAD | After A02 | Δ |
|---|---|---|---|
| HTTP operations | unchanged | unchanged | **0** |
| OpenAPI paths / schemas | unchanged | unchanged | **0** |
| Generated client files | unchanged | unchanged | **0** |
| Migrations | unchanged | unchanged | **0** |
| Workers | unchanged | unchanged | **0** |
| Figma nodes / registry rows | unchanged | unchanged | **0** |
| Admin routes | — | **+2** (`…/merge`, `…/merge/{caseId}`) | +2 |
| Admin sidenav entries | 8 | 8 | **0** |
| Admin features | — | **+1** (`customer-merge`) | +1 |
| api-client barrel exports | — | +4 operations, +3 enums, +9 types | re-exports of already-generated symbols |
| Admin merge tests | 0 | 46 | **+46** |
| Root `package.json` scripts | 30 | 30 | **0** |
| `SCOPED_COMMAND_INDEX.md` entries | unchanged | unchanged | **0** |
| `check-styles` violations | 25 | 25 | **0** |
| `check-file-size` violations | 80 | 80 | **0** |
| `admin lint` errors | 1 | 1 | **0** |

**Push / commit status:** nothing was committed or pushed. The working tree
carries the `APP10-A01` and `APP10-A02` changes for human review on the
`production` branch.

---

## O. Follow-ups (non-blocking)

| ID | Item | Why it is not this checkpoint's |
|---|---|---|
| `FU-APP10-A02-01` | `APP10-B02`/`B03` publish no business `code`, so three distinct execute causes and three distinct open causes each share one 409. A02 resolves the separable ones by re-reading and classifying; a stable code per failure would separate `MERGE_CONTACT_COLLISION` from `LOSER_ALREADY_MERGED`, and `MERGE_CASE_ALREADY_OPEN` from an already-merged participant, without a second round trip. | Adding a code changes a delivered backend contract and its accepted gate. Belongs to an APP10 hardening or `APP10-E01` decision, not to a UI checkpoint forbidden to alter endpoints. Extends `FU-APP10-A01-01` to the merge surface. |
| `FU-APP10-A02-02` | 1 pre-existing ESLint error in `apps/admin/test/components/request-quotation-bootstrap.test.tsx` (unused `UNKNOWN_REQUEST_STATUS_LABEL`, APP6). | Verified at HEAD; A02 does not touch the file, and unrelated cleanup is forbidden here. Same item as `FU-APP10-A01-02`. |
| `FU-ADMIN-SHARED-DIALOG-01` | `MergeDialog` is the sixth hand-rolled Admin dialog. It duplicates `SupportDialog`'s focus-trap rather than coupling two capabilities' markup, following the precedent that follow-up already records. | Pre-existing and unowned; resolving all six at once is the right shape, and reaching across a feature boundary now would make that harder. |
| `FU-APP10-A02-03` | An operator who reaches a business-profile blocker has no in-product path to resolve it: no Admin business-profile surface exists in any delivered phase. The blocker therefore points outside the flow. | No backend operation and no approved design exists for a business-profile screen. Recording it, not scheduling it. |
| `FU-APP10-A02-04` | There is no way to find an existing REQUESTED case for a pair other than the URL of the open that created it — the duplicate-open conflict tells an operator a case exists but cannot link to it. | A merge list or a lookup-by-pair read is a new backend operation, which §21 forbids. The conflict copy states the situation truthfully rather than offering a link that cannot be built. |

None blocks `APP10-I01`.

---

## P. Roadmap

`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` §11
now reads:

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge case lifecycle & consequence preview | `COMPLETE` |
| `APP10-B03` | Merge execution & immutable event history | `COMPLETE` |
| `APP10-D01` | APP10 design package | `COMPLETE` / `PO APPROVED` |
| `APP10-A01` | Admin customer profile maintenance UI | `COMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `COMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `NEXT` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `INCOMPLETE` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
APP10-I01 = NEXT
```

---

## Q. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Approved A02 frames implemented | ✅ §B, §D–§H |
| 2 | `/support/customer-access/merge` exists | ✅ |
| 3 | `/support/customer-access/merge/{caseId}` exists | ✅ |
| 4 | Support nav entry active on both | ✅ asserted |
| 5 | No new sidenav item | ✅ asserted |
| 6 | Both participants via exact-contact authority | ✅ asserted |
| 7 | No customer list/search added | ✅ asserted |
| 8 | Survivor/loser roles explicit | ✅ asserted |
| 9 | Same customer cannot be both sides | ✅ asserted, nothing sent |
| 10 | Participants replaceable before creation | ✅ asserted |
| 11 | Not changeable after creation | ✅ no swap control; execute takes no body |
| 12 | Open reason required | ✅ asserted |
| 13 | Successful open navigates to case detail | ✅ asserted |
| 14 | Direct refresh works | ✅ screen takes only `caseId` |
| 15 | REQUESTED preview shows supported categories | ✅ §F |
| 16 | Business-profile conflict blocks execute visibly | ✅ asserted disabled + blocker |
| 17 | Confirmation states transfer + revoke + preservation | ✅ asserted |
| 18 | Execute uses case id, no override body | ✅ asserted 2 args |
| 19 | `EXECUTED` handled | ✅ |
| 20 | `ALREADY_EXECUTED` handled as safe completion | ✅ asserted, no error UI |
| 21 | Success re-fetches authoritative detail | ✅ asserted |
| 22 | Business-profile refusal maps safely | ✅ asserted |
| 23 | Contact collision maps safely | ✅ §G.4, approved shared frame `841:3` |
| 24 | Invalid/stale participant/state maps safely | ✅ asserted |
| 25 | Reject reason required | ✅ asserted |
| 26 | Successful reject re-fetches and renders REJECTED | ✅ asserted |
| 27 | REJECTED has no execute action | ✅ asserted |
| 28 | Historical rejection reason not fabricated | ✅ asserted + explained in place |
| 29 | Merge-event timeline not fabricated | ✅ asserted |
| 30 | Post-execute counts not shown as moved | ✅ asserted (preview withheld) |
| 31 | No unmerge action | ✅ asserted |
| 32 | No raw contacts, secrets or server internals rendered | ✅ §J |
| 33 | No backend/OpenAPI/migration/Figma-node change | ✅ §C, §N |
| 34 | Desktop and 1280 narrow implemented | ✅ §J |
| 35 | Focused change-impact tests pass | ✅ 124/124 |
| 36 | No full Admin/monorepo/E2E regression | ✅ §K |
| 37 | File-size limits satisfied | ✅ §M |
| 38 | Roadmap updated | ✅ §P |
| 39 | Completion report exists | ✅ this file |
| 40 | `PO_DECISION_REQUIRED = NONE` | ✅ |
| 41 | `APP10-I01 = NEXT` | ✅ |
