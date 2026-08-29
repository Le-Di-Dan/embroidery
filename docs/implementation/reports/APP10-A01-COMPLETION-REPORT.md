# APP10-A01 — Admin Customer Profile & Contact Maintenance UI — Completion Report

```text
VERDICT = COMPLETE
PO_DECISION_REQUIRED = NONE
CORRECTION_ATTEMPT = 1 of 1 (first attempt)
NEXT_CHECKPOINT = APP10-A02
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E = NOT_RUN
DESIGN_APPROVAL = FIG-APPROVAL-APP10-D01-PO-001
```

---

## 1. Verdict

`APP10-A01` is **COMPLETE**. No genuine design/contract contradiction was found,
so `PO_DECISION_REQUIRED = NONE`.

One contract limit was found and resolved inside the checkpoint rather than
escalated — §7.3 records it in full: `APP10-B01` publishes **no business code**
on any of its refusals, so a 409 alone cannot say whether a deactivation was
refused because the contact is primary or because it is the customer's last
verified one, and the approved package draws those as two distinct states
(`833:3`, `833:21`). It is resolved by re-reading the authoritative customer
after the refusal and reading the reason off what the server now says is true —
an explanation of a refusal that has already happened, never a prediction. This
is not a blocker: no frame is unreachable and no approved state was dropped.

---

## 2. D01 registry promotion

| Item | Result |
|---|---|
| Rows promoted | **41 / 41** `APP10-D01` rows |
| From → to | `REVIEW_REQUIRED` → `APPROVED_FOR_IMPLEMENTATION` |
| Approval evidence written | `FIG-APPROVAL-APP10-D01-PO-001` (exactly, on all 41) |
| Rows left `REVIEW_REQUIRED` in §4.16 | **0** |
| APP1–APP9 / BRD0 rows changed | **0** |
| Figma nodes created / modified / moved / renamed / deleted | **0** — this was a registry-status edit only |
| §4.16 narrative | updated so it no longer asserts the rows are unapproved; it now records the PO PASS and the promotion, and repeats that no node was touched |
| Gate | `node tools/check-figma-design-index.mjs` → **PASS** (491 registry IDs, 491 node rows, 22 registry tables) |

Verification commands and their answers:

```text
grep -c '^| FIG-APP10-' docs/design/FIGMA_DESIGN_INDEX.md                      -> 41
grep -c '^| FIG-APP10-.*APPROVED_FOR_IMPLEMENTATION.*FIG-APPROVAL-APP10-D01-PO-001'
                                                                              -> 41
grep -c '^| FIG-APP10-.*REVIEW_REQUIRED'                                      -> 0
```

### Registry IDs consumed by this checkpoint

The 17 `A01` rows, all now `APPROVED_FOR_IMPLEMENTATION`:

| Registry ID | Node | Implemented as |
|---|---|---|
| `FIG-APP10-A01-MAINT-DESKTOP-DEFAULT` | `829:3` | the extended customer card at 1440 |
| `FIG-APP10-A01-MAINT-NARROW-1280` | `834:3` | the same card at the Admin narrow width |
| `FIG-APP10-A01-PROFILE-EDITING` | `831:3` | `CustomerProfileForm` editing state |
| `FIG-APP10-A01-PROFILE-SAVED` | `831:28` | `profile-saved` feedback |
| `FIG-APP10-A01-PROFILE-VALIDATION` | `831:42` | `profile-problem` / `profile-failure` = validation |
| `FIG-APP10-A01-PROFILE-MERGED-REFUSED` | `831:62` | `profile-failure` = merged |
| `FIG-APP10-A01-PENDING-STATES` | `831:80` | the three submitting states (save, promote, deactivate) |
| `FIG-APP10-A01-PROMOTE-CONFIRM` | `832:3` | `ContactActionDialog` action `promote`, confirm |
| `FIG-APP10-A01-PROMOTE-SUCCESS` | `832:26` | the same dialog, success |
| `FIG-APP10-A01-PROMOTE-REFUSED` | `832:46` | the same dialog, `contact-action-error` |
| `FIG-APP10-A01-DEACTIVATE-CONFIRM` | `832:67` | `ContactActionDialog` action `deactivate`, confirm |
| `FIG-APP10-A01-DEACTIVATE-SUCCESS` | `832:90` | the same dialog, success — the contact leaves the list |
| `FIG-APP10-A01-DEACTIVATE-PRIMARY-REFUSED` | `833:3` | `contactFailure.primary` |
| `FIG-APP10-A01-DEACTIVATE-LASTVERIFIED-REFUSED` | `833:21` | `contactFailure.lastVerified` |
| `FIG-APP10-A01-STALE-AND-FAILURE` | `833:39` | `contactFailure.stale` / `.conflict` / `.generic`, and the profile stale/generic sentences |
| `FIG-APP10-A01-CONTACT-ELIGIBILITY` | `833:60` | `model/contact-eligibility.ts` + `contacts.eligibilityNote` |
| `FIG-APP10-ADMIN-REFUSAL-CATALOG` | `844:3` | the refusal copy table in `customer-maintenance-copy.ts` |

The 18 approved `APP4-D01` `/support/customer-access` frames remain the authority
for the lookup, grant and notification regions and were **not** redesigned or
re-implemented.

> **Figma read note.** The `figma-desktop` MCP server did not connect in this
> session (`ConnectionRefused`), so the node contents were resolved from the
> in-repo design authority rather than by opening the live file: the registry
> rows themselves (route/screen/state/viewport per node) and
> `docs/implementation/reports/APP10-D01-COMPLETION-REPORT.md` §D and §G, which
> record each frame's coverage and the design's constraint compliance
> frame-by-frame. Nothing was implemented that those two documents do not
> specify. This is a tooling limitation of the session, not a registry gap.

---

## 3. Implemented route and components

Route: **`/support/customer-access`** — extended, not replaced. No new route, no
new sidenav entry, no new layout.

New files, all inside the existing `apps/admin/src/features/customer-access-support`
feature (narrowest valid scope, responsibility-based subfolders):

| File | Lines | Responsibility |
|---|---|---|
| `components/customer-profile-form.tsx` | 184 | display-name + notes, read or edited in place |
| `components/contact-action-dialog.tsx` | 129 | one confirm/pending/success/refusal grammar for both contact transitions |
| `hooks/use-profile-maintenance.ts` | 131 | the edit lifecycle and the patch |
| `hooks/use-contact-maintenance.ts` | 107 | the two transitions and their re-read |
| `model/profile-draft.ts` | 88 | the draft, its validation, and the changed-fields-only patch |
| `model/contact-eligibility.ts` | 73 | which action a contact may be offered |
| `model/customer-maintenance-failure.ts` | 135 | refusal classification |
| `model/customer-maintenance-copy.ts` | 112 | every user-facing string A01 adds |
| `services/customer-maintenance.service.ts` | 90 | the three mutations at the transport seam |

Modified: `components/customer-access-screen.tsx` (wiring + one dialog),
`components/customer-contact-panel.tsx` (profile block + row actions),
`hooks/use-customer-support-queries.ts` (+`refetchCustomer`),
`styles/customer-access-support.scss` (row actions, profile block, dialog context
strip).

Architecture: generated API client → feature service → TanStack hooks →
components. Existing query keys (`customerAccessKeys.customer(id)`) are reused;
no second key namespace and no second state architecture were introduced. Form
and dialog state is local; every server fact stays query-owned, and nothing the
operator typed is written into the cache.

---

## 4. Backend operations consumed

Exactly five, all already delivered, all through the generated client:

```text
POST  /api/admin/customers/resolve                                  APP4-B07
GET   /api/admin/customers/{customerId}                             APP4-B07
PATCH /api/admin/customers/{customerId}                             APP10-B01
POST  /api/admin/customers/{customerId}/contacts/{contactId}/primary     APP10-B01
POST  /api/admin/customers/{customerId}/contacts/{contactId}/deactivate  APP10-B01
```

| Change class | Count |
|---|---|
| Backend endpoints added or altered | **0** |
| OpenAPI document changes | **0** |
| Generated client regenerated or edited | **0** |
| Migrations / schema changes | **0** |
| Workers touched | **0** |
| Figma nodes touched | **0** |

One non-generated change was needed: `packages/api-client/src/identity.ts` — the
**handwritten** barrel — now re-exports `adminCustomerUpdate`,
`adminCustomerContactPromote`, `adminCustomerContactDeactivate` and the
`UpdateCustomerProfileBody` type from the generated tree. `APP10-B01` generated
them but published none of them through the barrel, and `FRONTEND_CONVENTIONS` §8
forbids a feature deep-importing `generated/`. Nothing in `src/generated/` was
edited.

---

## 5. Profile edit behaviour

| Rule | Implementation |
|---|---|
| Editable fields | `displayName` and `notes`, and nothing else. Verification evidence, merge state, anonymization and every contact have **no field** — the form cannot express a write the contract refuses. |
| Only what changed travels | `validateProfileDraft` diffs the draft against the authoritative detail and names only the differing fields. An untouched `notes` is **absent** from the body, not echoed — which is what keeps `APP10-B01`'s `changedFields` audit summary honest. |
| Blank clears | A blank or whitespace field is sent as `null`, matching the server's blank→NULL rule, so no record holds a name that renders as nothing. |
| Empty patch | Caught client-side (`unchanged`) and never sent — the server refuses a patch naming no field, and the only place to report it is beside the form. |
| Over-length | Bounded in the inputs (`maxLength` 200 / 2000) and validated before send. |
| Success | The form closes, `profile-saved` appears, and the customer is **re-read**. The submitted text is never adopted as the new truth. |
| Validation (400) | Mapped to the approved sentence. The server's own message never reaches the DOM (asserted). |
| Merged customer (409) | Its own refusal, stating that the customer was merged away and cannot be maintained. Not silently redirected to the survivor. |
| Stale (404) | Its own refusal, telling the operator to look the customer up again. |
| 401 / 403 / other | Session-expired, refused, and one sanitized generic sentence. |
| Duplicate submit | Save and cancel both disable while the patch is in flight; the pending label replaces the save label. |

---

## 6. Contact promotion behaviour

Eligibility (`FIG-APP10-A01-CONTACT-ELIGIBILITY`, `833:60`):

```text
verified && !primary   -> promote offered
primary                -> no promote (promoting the current primary changes nothing)
!verified              -> no promote (only the customer's own verification challenge
                          can mint that evidence; this screen never can)
```

Flow: click → `alertdialog` naming the contact **by its mask** → confirm →
pending (both buttons disabled) → 204 → success state in place → authoritative
re-read. The dialog stays open through the outcome; the operator never leaves the
route.

Refusals: `404` → stale; `409` → classified against the fresh re-read — an
unverified contact gets the unverified sentence, anything the fresh record cannot
name gets the generic conflict sentence, which states both possibilities
(state moved, or customer merged) rather than picking one. No backend code or
message is exposed.

---

## 7. Contact deactivation behaviour

### 7.1 It is a retirement, and says so

The confirmation states, in the dialog itself, that the record and its
verification instant are kept, that the contact leaves the current list, and that
this screen has **no undo and no reactivate**. There is no delete control, no
undo control and no reactivate control anywhere — `APP10-B01` publishes neither
operation, so either would be a button with nothing behind it. Asserted by test.

### 7.2 Eligibility and success

Deactivation is offered on every contact **except the primary one**: retiring the
primary is a stated hard precondition of the API, and the operator must promote a
replacement first, explicitly. The last-verified contact is *not* withheld — a
customer whose only verified contact is not the primary one is a real shape, and
the refusal explains it accurately where a hidden button would explain nothing.

Success: 204 → success state → authoritative re-read → the contact is gone from
the list, because the detail read publishes current contacts only and
`AdminCustomerContactResponse` carries no active/deactivated field. There is no
invented "inactive" badge and no contact-history view.

### 7.3 The two 409 refusals, and the contract limit behind them

`apps/api/src/modules/customer/domain/maintenance/customer-maintenance.errors.ts`
raises every refusal as `HttpException({ message }, status)` with **no `code`
field**. So `CUSTOMER_MERGED`, `CONTACT_IS_PRIMARY`, `CONTACT_IS_LAST_VERIFIED`,
`CONTACT_NOT_VERIFIED` and `CONTACT_NOT_ACTIVE` all arrive at the browser as one
indistinguishable 409 whose only differentiator is server-authored prose.

Three options were considered:

1. **Parse the message.** Rejected: the wording is free to change and the screen
   would break silently the first time it did.
2. **Predict from the snapshot the operator clicked on.** Rejected: that snapshot
   is exactly what was already wrong — a contact promoted in another tab a second
   ago is why the refusal happened at all.
3. **Re-read, then classify.** Chosen. On a 409 the hook awaits a fresh
   authoritative detail and reads the reason off it: contact absent → stale;
   `primary === true` → the primary refusal (`833:3`); the only verified contact
   → the last-verified refusal (`833:21`); otherwise the generic conflict. It
   explains a refusal that has already happened rather than predicting one, and
   it leaves the operator looking at the current record — the same rule
   `useGrantRevocation` already follows for a conflicted revoke.

Where the fresh read genuinely cannot separate two causes — a merged customer
refuses a contact transition with the same 409 as a state change, and the detail
read publishes no merge tombstone — the outcome stays the **generic** conflict,
whose copy names both possibilities. Nothing guesses.

Recorded as a non-blocking follow-up: `FU-APP10-A01-01` (§14).

---

## 8. Proof the existing APP4 behaviour is intact

Direct regression only, on the three APP4-A01 suites plus the security suite:

| Suite | Tests | Result |
|---|---|---|
| `customer-access-lookup.test.tsx` | 15 | PASS |
| `customer-access-grant.test.tsx` | 13 | PASS |
| `customer-access-notification.test.tsx` | 15 | PASS |
| `customer-access-security.test.tsx` | 7 | PASS |

Plus a positive assertion in the new profile suite: with a customer resolved, the
lookup submit, the grant revoke action and the notification replay action are all
still present on the same screen.

**One APP4 assertion was narrowed, and it was superseded rather than weakened.**
`customer-access-lookup.test.tsx` asserted "offers no customer edit, merge or
verification control" and searched button names for `/sửa/i` among others. That
rule was written when the screen was read-only. `APP10-B01` published a bounded
profile patch and two contact transitions, and `APP10-A01` — implementing the
frames the Product Owner approved as `FIG-APPROVAL-APP10-D01-PO-001` — surfaces
exactly those. Asserting the absence of the edit affordance would now assert
against the approved design. The test is renamed **"offers no merge, delete or
verification control"** and still forbids `/gộp/i`, `/xoá/i`, `/xác minh lại/i`
and `/huỷ xác minh/i` — everything APP10 did *not* open. The reason is written
into the test as a doc comment. No test was disabled, skipped or deleted.

---

## 9. Privacy, accessibility and responsive evidence

### Privacy

| Claim | Evidence |
|---|---|
| No raw contact value is rendered | The response type has no field carrying one (`APP4-B07`'s projection dropped them). The suites search the whole rendered document for the fixture's raw email, raw phone, code, token and digest. |
| `contactId` is never rendered | It travels in the request path and appears in no copy. Asserted over the whole document, with a dialog open, for both contact ids. |
| No raw server object in error UI | Every refusal renders a fixed local sentence. Asserted that the server's own message, the contact id echoed in an `errors[]` entry, `requestId` and the literal `CONFLICT` all appear nowhere. |
| No masking or transform in the client | There is still no masking function in this feature; `maskedValue` is rendered exactly as it arrives. |
| Notes are staff-facing | The copy says so in the field hint; the field exists only on the Admin surface. |

### Accessibility

- Every control is a real `button` / `input` / `textarea`, keyboard reachable, in
  DOM order, using the existing Admin focus-visible styling.
- Both dialogs reuse `SupportDialog`: focus moved in on mount, trapped while
  open, restored to the trigger on close, `Escape` dismisses, `aria-modal`,
  `aria-labelledby`, `aria-describedby`, and `role="alertdialog"` because both
  transitions are consequential.
- Fields carry real `<label for>`; validation is bound through `aria-describedby`
  + `aria-invalid` and announced via `role="alert"`.
- Every status and refusal carries **words**, never colour alone; `data-tone` only
  reinforces the sentence.
- Duplicate submits are disabled while pending, on both the profile form and both
  dialogs, with a pending label.

### Responsive

1440 desktop and Admin-narrow 1280, matching `829:3` and `834:3`. The contact-row
actions sit at `margin-left: auto` in a wrapping flex row, so at 1280 they wrap
intact onto the next line instead of squeezing the mask. The existing two-column
floor and its collapse are unchanged. No separate mobile-Admin product was
invented.

---

## 10. Exact validation commands

Selected from `docs/implementation/VALIDATION_GOVERNANCE.md` §3 for what this
change actually justifies. No repository-wide aggregate was run.

| Command | Result |
|---|---|
| `node tools/check-figma-design-index.mjs` | **PASS** — 491 registry IDs, 491 node rows, 22 registry tables |
| `pnpm --filter admin exec jest test/components/customer-access` | **PASS** — 6 suites, **78 tests**, 0 failed |
| `pnpm --filter admin exec jest test/components/customer-access-profile.test.tsx` | **PASS** — 12 / 12 (new) |
| `pnpm --filter admin exec jest test/components/customer-access-contacts.test.tsx` | **PASS** — 16 / 16 (new) |
| `pnpm --filter admin exec jest test/components/customer-access-lookup.test.tsx` | **PASS** — 15 / 15 |
| `pnpm --filter admin exec jest test/components/customer-access-grant.test.tsx` | **PASS** — 13 / 13 |
| `pnpm --filter admin exec jest test/components/customer-access-notification.test.tsx` | **PASS** — 15 / 15 |
| `pnpm --filter admin exec jest test/components/customer-access-security.test.tsx` | **PASS** — 7 / 7 |
| `pnpm --filter admin typecheck` | **PASS** (`tsc --noEmit`, clean) |
| `pnpm --filter @embroidery/api-client typecheck` | **PASS** |
| `pnpm --filter @embroidery/api-client lint` | **PASS** |
| `pnpm --filter admin lint` | **1 error, pre-existing at HEAD** — `test/components/request-quotation-bootstrap.test.tsx:35` unused `UNKNOWN_REQUEST_STATUS_LABEL`. Verified present on a stashed pristine tree. **0 errors in any APP10-A01 file.** |
| `node tools/check-styling-boundaries.mjs` | 25 violations — **identical to HEAD**, all in APP2/APP9 storefront files. **0 in `customer-access-support.scss`.** |
| `node tools/check-file-size.mjs` | 80 violations — **identical to HEAD**. **0 in any APP10-A01 file.** |

Explicitly **NOT_RUN**, as instructed: full monorepo tests, all Admin tests, all
API tests, full E2E, `APP10-E01`, `APP10-B02`/`B03` backend tests, DB checks,
Storefront tests.

New test count: **28** (12 profile + 16 contacts). Directly-affected regression:
**50**, all passing.

---

## 11. Prettier / ESLint / SonarQube

The three global quality mechanisms, treated as global — no aggregate functional
command was run.

- **Prettier** — `pnpm exec prettier --write` over exactly the touched paths.
  All files formatted; nothing else in the repository reformatted.
- **ESLint** — `pnpm --filter admin lint` and
  `pnpm --filter @embroidery/api-client lint`. Zero findings in APP10-A01 code.
  The one admin error is pre-existing at HEAD and belongs to APP6 test hygiene;
  §11 of the delivery governance forbids unrelated cleanup here. Recorded as
  `FU-APP10-A01-02`.
- **SonarQube** — repository-global control, run by CI on the branch. Not
  invocable as a checkpoint command and not run here; nothing in this checkpoint
  suppresses, excludes or configures around it.

---

## 12. Files changed

**New (11)**

```text
apps/admin/src/features/customer-access-support/components/contact-action-dialog.tsx      129
apps/admin/src/features/customer-access-support/components/customer-profile-form.tsx      184
apps/admin/src/features/customer-access-support/hooks/use-contact-maintenance.ts          107
apps/admin/src/features/customer-access-support/hooks/use-profile-maintenance.ts          131
apps/admin/src/features/customer-access-support/model/contact-eligibility.ts               73
apps/admin/src/features/customer-access-support/model/customer-maintenance-copy.ts        112
apps/admin/src/features/customer-access-support/model/customer-maintenance-failure.ts     135
apps/admin/src/features/customer-access-support/model/profile-draft.ts                     88
apps/admin/src/features/customer-access-support/services/customer-maintenance.service.ts   90
apps/admin/test/components/customer-access-contacts.test.tsx                              472
apps/admin/test/components/customer-access-profile.test.tsx                               288
```

**Modified (9)**

```text
apps/admin/src/features/customer-access-support/components/customer-access-screen.tsx     274
apps/admin/src/features/customer-access-support/components/customer-contact-panel.tsx     163
apps/admin/src/features/customer-access-support/hooks/use-customer-support-queries.ts      99
apps/admin/src/features/customer-access-support/styles/customer-access-support.scss       652
apps/admin/test/components/customer-access-lookup.test.tsx                                351
apps/admin/test/support/customer-access-fixture.ts                                        152
packages/api-client/src/identity.ts                                                       169
docs/design/FIGMA_DESIGN_INDEX.md                                                        1528
docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md                 360
```

Every source file is ≤ 400 lines and every test file ≤ 600 lines. The SCSS file
is 652 lines and is a stylesheet, not logic source: it was already 589 at HEAD,
`check-file-size.mjs` does not cover it, and the split it would need is a
feature-wide styling decision rather than this checkpoint's.

---

## 13. Baseline delta

| Dimension | HEAD | After A01 | Δ |
|---|---|---|---|
| HTTP operations | unchanged | unchanged | **0** |
| OpenAPI paths / schemas | unchanged | unchanged | **0** |
| Generated client files | unchanged | unchanged | **0** |
| Migrations | unchanged | unchanged | **0** |
| Workers | unchanged | unchanged | **0** |
| Admin routes | unchanged | unchanged | **0** |
| Admin sidenav entries | unchanged | unchanged | **0** |
| Figma nodes | unchanged | unchanged | **0** |
| Figma registry rows | 491 | 491 | **0** (41 statuses promoted) |
| Root `package.json` scripts | 30 | 30 | **0** |
| `SCOPED_COMMAND_INDEX.md` entries | unchanged | unchanged | **0** |
| api-client barrel exports | — | +3 operations, +1 type | re-exports of already-generated symbols |
| Admin `customer-access-support` source files | 15 | 24 | **+9** |
| Admin customer-access tests | 50 | 78 | **+28** |
| `check-styles` violations | 25 | 25 | **0** |
| `check-file-size` violations | 80 | 80 | **0** |
| `admin lint` errors | 1 | 1 | **0** |

---

## 14. Non-blocking follow-ups

| ID | Item | Why it is not this checkpoint's |
|---|---|---|
| `FU-APP10-A01-01` | `APP10-B01`'s refusals carry no business `code`, so five distinct causes share one 409 on the wire. A01 resolves it by re-reading and classifying against the fresh record; a stable code per failure would let a client answer without a second round trip, and would separate `CUSTOMER_MERGED` from a contact-state conflict, which the fresh read genuinely cannot. | Adding a code changes a delivered backend contract and its accepted gate. It belongs to an APP10 hardening or `APP10-E01` decision, not to a UI checkpoint that is forbidden to alter endpoints. |
| `FU-APP10-A01-02` | 1 pre-existing ESLint error in `apps/admin/test/components/request-quotation-bootstrap.test.tsx` (unused `UNKNOWN_REQUEST_STATUS_LABEL`, APP6). | Verified present on a pristine tree. Unrelated cleanup is forbidden here. |
| `FU-APP10-A01-03` | `customer-access-support.scss` is 652 lines and growing with each checkpoint that extends this route. | A feature-wide styling split, not an A01 change; no gate covers it and splitting it here would touch every APP4 rule for no behavioural reason. |
| `FU-ADMIN-SHARED-DIALOG-01` | Still open and still unowned — `ContactActionDialog` is the sixth hand-rolled Admin dialog, and reuses this feature's own `SupportDialog` rather than reaching across a feature boundary. | Pre-existing follow-up, unchanged in scope by A01. |

None blocks `APP10-A02`.

---

## 15. Roadmap

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
| `APP10-A02` | Admin customer merge workflow | `NEXT` |
| `APP10-I01` | Zalo/Messenger simple handoff | `INCOMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `INCOMPLETE` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
APP10-A02 = NEXT
```

---

## 16. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | all 41 D01 rows `APPROVED_FOR_IMPLEMENTATION` | ✅ 41/41, 0 left |
| 2 | approval evidence exactly `FIG-APPROVAL-APP10-D01-PO-001` | ✅ on all 41 |
| 3 | Figma index checker passes | ✅ 491/491/22 |
| 4 | `/support/customer-access` extended, not replaced | ✅ §8 |
| 5 | no customer list/search added | ✅ asserted |
| 6 | profile editing limited to display name + notes | ✅ §5 |
| 7 | successful mutations re-fetch authoritative state | ✅ all three, asserted |
| 8 | promote appears only for eligible contacts | ✅ asserted |
| 9 | primary/unverified not promotable | ✅ asserted |
| 10 | deactivate not presented as delete | ✅ §7.1, asserted |
| 11 | primary and last-verified refusals handled | ✅ §7.3, asserted separately |
| 12 | no undo/reactivate invented | ✅ asserted |
| 13 | contactId / raw values not rendered | ✅ §9 |
| 14 | APP4 lookup/grant/notification still functional | ✅ 50 tests |
| 15 | no backend/schema/migration/Figma-node changes | ✅ §4, §13 |
| 16 | approved desktop/narrow behaviour implemented | ✅ §9 |
| 17 | focused change-impact tests pass | ✅ 78/78 |
| 18 | no full Admin/monorepo/E2E regression run | ✅ §10 |
| 19 | roadmap updated | ✅ §15 |
| 20 | completion report exists | ✅ this file |
| 21 | `PO_DECISION_REQUIRED = NONE` | ✅ |
| 22 | `APP10-A02 = NEXT` | ✅ |
