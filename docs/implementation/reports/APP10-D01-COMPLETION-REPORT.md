# APP10-D01 — Complete APP10 Design Package — Completion Report

## A. Verdict

```text
APP10-D01 = COMPLETE
PO_DECISION_REQUIRED = NONE
NEXT_CHECKPOINT = APP10-A01

DESIGN_PACKAGE            = READY_FOR_PO_REVIEW
APP10_FIGMA_APPROVAL      = PENDING_PO_REVIEW (rows are REVIEW_REQUIRED)
APP_10_PAGE               = REUSED (pre-existing, empty)
APP10_DESIGN_INDEX_ROWS   = 41
NEW_ADMIN_NAV_ENTRIES     = 0
NEW_ADMIN_ROUTES          = 2  (sub-routes of the existing support nav entry)
NEW_STOREFRONT_ROUTES     = 0
DESIGN_SYSTEM_COST        = 0 components / 0 instances / 0 new variables or styles
CODE_CHANGES              = 0
MIGRATIONS_ADDED          = 0
OPENAPI_CHANGES           = 0
DESIGN_BLOCKER            = none
NOT_PUSHED                = true
```

---

## B. Figma authority inspected

### B.1 Repository authority read before any Figma write

| Document | What it settled |
|---|---|
| `docs/design/FIGMA_DESIGN_INDEX.md` | Canonical registry; §2 usage rules (reuse the page, never self-approve, new rows enter pre-approval); §3 file catalog and per-phase write targets; §4.10 APP4-D01 and §4.15 APP9-D01 precedents |
| `docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` | §3 design policy (one complete package, never split), §5 out-of-scope list, §7 canonical roadmap |
| `docs/implementation/reports/APP10-G01-COMPLETION-REPORT.md` | §F design audit: `/support/customer-access` covered by 18 approved APP4 frames; **zero** rows matching `merge`, `zalo`, `messenger`; §E.3 the I01 boundary |
| `docs/implementation/reports/APP10-B01/B02/B03-COMPLETION-REPORT.md` | The delivered contract this package must not exceed |
| `apps/api/src/modules/customer/presentation/**` | The **published** shapes — read directly, not from prose (see §G) |
| `apps/admin/src/features/admin-shell/model/admin-shell-nav.ts` | The eight live nav labels and the `startsWith` section-active rule |
| `apps/storefront/src/features/storefront-shell/**` | The delivered footer composition and its copy catalog |

### B.2 Canonical Figma file and page

```text
file        embroidery — FIG-FILE-PRODUCT
file key    BQwqV8GdfUIELvsQDB1UQE
page        APP_10 — 825:3   (the node the checkpoint brief links to)
section     828:3  APP10-D01 · Customer Operations & Communication
root size   6500 × 9248
```

**`APP_10` created or reused — REUSED.** The registry was searched before any
write for every APP10-owned term (`APP10`, `APP_10`, `merge`, `gộp`, `zalo`,
`messenger`, `customer-merges`): **no registry row existed**, §4 ended at
`4.15 APP9-D01`, and §3 listed `APP_01`…`APP_09` write targets only. The live
file was then read: `APP_10` **already existed at `825:3` with zero children**.
Per §2 rule 1 it was reused, not re-created. Audit outcome:
**`NO_EXISTING_APP10_DESIGN`** — nothing was reused, supplemented, repaired or
superseded, and **no APP1–APP9 or BRD0 node was created, modified, moved,
renamed, restyled or deleted**.

### B.3 Existing frames read and reused (referenced, never redrawn, never modified)

| Source node | Registry row | Use in APP10 |
|---|---|---|
| `APP1-D01` `385:10` | `FIG-ADMIN-SHELL-DESKTOP-DEFAULT` | Admin shell, sidebar, topbar — used as-is; **0** nav entries added |
| `APP1-D01` `387:40` | `FIG-ADMIN-SHELL-DESKTOP-SESSIONEXPIRED` | The 401 state; APP10 does not redraw session handling |
| `APP4-D01` `631:45` | `FIG-ADMIN-CUSTOMERACCESS-DESKTOP-OVERVIEW` | The screen A01 extends: geometry, customer/contact card, masked value + verification badge grammar |
| `APP4-D01` `640:3` | (within `631:45`) | Exact-contact lookup card — reused verbatim, and reused again for both A02 participant slots |
| `APP4-D01` `631:124`…`632:169` | grant + notification-delivery rows | Secure-grant and notification panels — kept unchanged and drawn as "APP4 · không đổi" reference cards |
| `APP9-D01` `809:95` | `FIG-APP9-A01-OPENFINAL-CONFIRM` | Confirmation-dialog grammar: context strip, white dialog, bordered effect block, spacer action row |
| `APP9-D01` `809:115` | `FIG-APP9-A01-OPENFINAL-REFUSED` | In-place refusal grammar (red-bordered error block, no navigation) |
| `APP9-D01` `814:36` | `FIG-APP9-A01-DISPATCH-PAYMENTGUARD` | Amber "why" block for a guard that needs explaining |
| `APP1-D02` `405:2253` | `FIG-STOREFRONT-SHELL-DESKTOP-DEFAULT` (footer) | Storefront footer desktop composition — I01 extends its `Kết nối` column |
| `APP1-D02` `409:2359` | `FIG-STOREFRONT-SHELL-MOBILE-DEFAULT` (footer) | Storefront footer mobile composition |

### B.4 Design-system references

Every frame composes the existing `Primitive` / `Semantic` / `Foundation`
collections and the Inter family (Regular / Medium / Semi Bold / Bold), sampled
directly off the approved APP4/APP9 nodes rather than re-invented:

```text
surface / page        #FAF8F5   card / dialog        #FFFFFF
inset surface         #FCFBF8   muted surface        #F5F3EF
border                #E7E5E4   secondary button br. #D6D3D1
ink                   #171717   secondary text       #6B7280   tertiary  #9CA3AF
brand / primary       #E8475F   success #16A34A  warning #D97706  danger #DC2626  info #2563EB
radius                card 16 · dialog block 12 · button & field 10 · badge 999
type                  16 Semi Bold (card) · 19 Bold (dialog) · 14/13/12 body · 10 Bold caption
```

**Design-system cost: 0** component masters, **0** instances, **0** new
variables, text styles, paint styles or effect styles. `FIG-FILE-DS` was **not**
touched.

---

## C. APP10 package structure

Section `828:3`, page `APP_10` (`825:3`). 41 frames — **36 Admin · 4 Storefront
· 2 Shared**. All rows `REVIEW_REQUIRED`, approval evidence `—`.

| # | Node | Registry ID | Purpose | Surface | Viewport |
|--:|---|---|---|---|---|
| 1 | `828:4` | FIG-APP10-OVERVIEW-JOURNEY | Package + operator journey + reuse/no-draw boundary | Shared | Desktop |
| 2 | `829:3` | FIG-APP10-A01-MAINT-DESKTOP-DEFAULT | `/support/customer-access` with the maintenance panel | Admin | Desktop 1440 |
| 3 | `834:3` | FIG-APP10-A01-MAINT-NARROW-1280 | Same screen, narrow Admin reference | Admin | Admin Narrow 1280 |
| 4 | `831:3` | FIG-APP10-A01-PROFILE-EDITING | Display-name + notes form, focused | Admin | Desktop |
| 5 | `831:28` | FIG-APP10-A01-PROFILE-SAVED | Saved / success feedback | Admin | Desktop |
| 6 | `831:42` | FIG-APP10-A01-PROFILE-VALIDATION | 400 — over-length, empty patch | Admin | Desktop |
| 7 | `831:62` | FIG-APP10-A01-PROFILE-MERGED-REFUSED | 409 — customer merged away | Admin | Desktop |
| 8 | `831:80` | FIG-APP10-A01-PENDING-STATES | The three submitting states, one convention | Admin | Desktop |
| 9 | `832:3` | FIG-APP10-A01-PROMOTE-CONFIRM | Promote-primary confirmation | Admin | Desktop |
| 10 | `832:26` | FIG-APP10-A01-PROMOTE-SUCCESS | Promote-primary success | Admin | Desktop |
| 11 | `832:46` | FIG-APP10-A01-PROMOTE-REFUSED | 409 unverified / 409 deactivated / 404 | Admin | Desktop |
| 12 | `832:67` | FIG-APP10-A01-DEACTIVATE-CONFIRM | Deactivate confirmation (not a delete, no undo) | Admin | Desktop |
| 13 | `832:90` | FIG-APP10-A01-DEACTIVATE-SUCCESS | Success — contact leaves the list | Admin | Desktop |
| 14 | `833:3` | FIG-APP10-A01-DEACTIVATE-PRIMARY-REFUSED | 409 — primary contact | Admin | Desktop |
| 15 | `833:21` | FIG-APP10-A01-DEACTIVATE-LASTVERIFIED-REFUSED | 409 — last verified contact | Admin | Desktop |
| 16 | `833:39` | FIG-APP10-A01-STALE-AND-FAILURE | Stale 404 / sanitized generic / 401 | Admin | Desktop |
| 17 | `833:60` | FIG-APP10-A01-CONTACT-ELIGIBILITY | Contact-state × action eligibility matrix | Admin | Desktop |
| 18 | `835:3` | FIG-APP10-A02-SELECT-EMPTY-DESKTOP | Survivor/loser slots, both empty | Admin | Desktop 1440 |
| 19 | `835:82` | FIG-APP10-A02-SELECT-FILLED-DESKTOP | Both resolved + reason, ready to open | Admin | Desktop 1440 |
| 20 | `840:3` | FIG-APP10-A02-SELECT-SAMECUSTOMER | 400 — same customer in both slots | Admin | Desktop |
| 21 | `840:19` | FIG-APP10-A02-OPEN-CONFLICTS | 409 duplicate-open / 409 already-merged / 404 | Admin | Desktop |
| 22 | `836:3` | FIG-APP10-A02-CASE-REQUESTED-DESKTOP | Comparison + consequence preview | Admin | Desktop 1440 |
| 23 | `838:3` | FIG-APP10-A02-CASE-NARROW-1280 | Same, stacked participants + wrapped tiles | Admin | Admin Narrow 1280 |
| 24 | `836:123` | FIG-APP10-A02-CASE-PROFILECONFLICT-DESKTOP | Business-profile conflict blocker | Admin | Desktop 1440 |
| 25 | `837:3` | FIG-APP10-A02-CASE-EXECUTED-DESKTOP | Bounded completion state | Admin | Desktop 1440 |
| 26 | `837:95` | FIG-APP10-A02-CASE-REJECTED-DESKTOP | Rejected state | Admin | Desktop 1440 |
| 27 | `840:40` | FIG-APP10-A02-EXECUTE-CONFIRM | Execute confirmation | Admin | Desktop |
| 28 | `840:74` | FIG-APP10-A02-EXECUTE-PENDING | Executing | Admin | Desktop |
| 29 | `840:93` | FIG-APP10-A02-EXECUTE-ALREADYEXECUTED | `ALREADY_EXECUTED` as safe completion | Admin | Desktop |
| 30 | `840:110` | FIG-APP10-A02-EXECUTE-PROFILECONFLICT | 409 — business-profile conflict | Admin | Desktop |
| 31 | `841:3` | FIG-APP10-A02-EXECUTE-PARTICIPANT-REFUSED | 409 — already merged / contact collision / rejected case | Admin | Desktop |
| 32 | `841:24` | FIG-APP10-A02-EXECUTE-FAILURE | Sanitized generic failure + safe continuation | Admin | Desktop |
| 33 | `841:45` | FIG-APP10-A02-REJECT-CONFIRM | Reject with mandatory reason | Admin | Desktop |
| 34 | `841:66` | FIG-APP10-A02-REJECT-CONFLICT | 409 — invalid transition | Admin | Desktop |
| 35 | `841:84` | FIG-APP10-A02-PREVIEW-SEMANTICS | Contract field → label → exact meaning | Admin | Desktop |
| 36 | `842:3` | FIG-APP10-I01-FOOTER-DESKTOP | Footer with Zalo + Messenger CTAs | Storefront | Desktop 1440 |
| 37 | `842:48` | FIG-APP10-I01-FOOTER-MOBILE | Same, mobile | Storefront | Mobile 390 |
| 38 | `843:3` | FIG-APP10-I01-CTA-STATES | Interaction states + missing-config behaviour | Storefront | Desktop |
| 39 | `843:44` | FIG-APP10-I01-HANDOFF-SPEC | Opening text, security boundary, not-built list | Storefront | Desktop |
| 40 | `844:3` | FIG-APP10-ADMIN-REFUSAL-CATALOG | All 21 refusal rows → UI treatment | Admin | Desktop |
| 41 | `845:3` | FIG-APP10-CONTRACT-FIDELITY | 8 operations → screens, and the 12 things not designed | Shared | Desktop |

The package was not inflated to reach a number: pending states, stale/generic
failures and repeated refusals are consolidated into shared convention frames
and catalogs rather than duplicated as pixel-identical screens.

---

## D. A01 design coverage

| Required state (brief §5) | Frame |
|---|---|
| Loaded customer — masked identity, display name, notes, verified context, contact list | `829:3` |
| Normal (not editing) | `829:3` |
| Editing | `831:3` |
| Saving | `831:80` (row 1 of 3) |
| Saved / success feedback | `831:28` |
| Validation error | `831:42` |
| Conflict / stale / merged-customer refusal | `831:62` (merged), `833:39` (stale 404 + generic + 401) |
| Load / server error | **Reused unchanged** from `APP4-D01` `631:3` (loading), plus the approved load-error / not-found rows — APP10 does not redraw them |
| Contact list — kind, masked value, verified state, primary state | `829:3`, and the eligibility rules in `833:60` |
| Promote-primary — eligible contact | `829:3` (action shown only on the eligible row) |
| Promote-primary — confirmation | `832:3` |
| Promote-primary — submitting | `831:80` (row 2 of 3) |
| Promote-primary — success | `832:26` |
| Promote-primary — conflict / error | `832:46` |
| Deactivate — eligible action | `829:3` |
| Deactivate — confirmation | `832:67` |
| Deactivate — submitting | `831:80` (row 3 of 3) |
| Deactivate — success | `832:90` |
| Deactivate — refused because primary | `833:3` |
| Deactivate — refused because last required verified contact | `833:21` |
| Deactivate — stale / conflict / general failure | `833:39` |
| Narrow Admin width | `834:3` |

Constraint compliance:

- **No customer list, directory, fuzzy/prefix search or bulk selection** is
  drawn anywhere. Discovery is the approved exact-contact lookup card only.
- **No "Add contact", no email/phone value edit, no verify/unverify control, no
  clear-verification, no import.**
- Only `displayName` and `notes` are editable; `merged_into_customer_id`,
  `anonymized_at`, verification source and normalized contact values appear
  **nowhere**.
- **`contactId` is never rendered.** No UUID appears as user-facing copy in any
  frame.
- A contact that is already primary shows **no** promote action; unverified and
  inactive contacts are never shown as eligible (`833:60` fixes the rule).
- **No "undo" control** after deactivation — `832:90` states in-place why: no
  reactivate API exists.
- The design does **not** draw an active/deactivated badge, because the
  delivered `AdminCustomerContactResponse` publishes no such field and
  deactivated contacts are simply absent from the list. `833:60` records this.

---

## E. A02 design coverage

| Required element (brief §6) | Frame(s) |
|---|---|
| Participant selection — two explicit `SURVIVOR` / `LOSER` slots | `835:3`, `835:82` |
| Slot meaning stated in words (not "Customer 1 / 2") | `835:3` — "KHÁCH GIỮ LẠI" / "KHÁCH ĐƯỢC GỘP" each with a definition line |
| Replace a participant before the case is opened | `835:82` — "Đổi khách hàng" on each filled slot |
| Same customer twice refused | `840:3` (400, blocked in-UI and by the server) |
| Open-case reason — bounded multiline, required-state feedback, submit | `835:3` (empty, required), `835:82` (filled, ready) |
| Open — loading | `831:80` convention; the open button carries the same pending treatment |
| Open — duplicate-open conflict / already-merged / missing participant | `840:19` |
| Comparison — both masked cards side-by-side | `836:3` |
| Consequence preview from real backend fields | `836:3`, semantics in `841:84` |
| Business-profile conflict blocker | `836:123` (screen-level, high-visibility, execute disabled + safe exit) and `840:110` (dialog-level 409) |
| Confirmation restating survivor, loser, direction, live ownership movement, grant revocation, frozen evidence preserved | `840:40` |
| Execute — ready | `836:3` |
| Execute — executing / loading | `840:74` |
| Execute — success | `837:3` |
| Execute — already-executed replay as safe completion | `840:93` |
| Execute — participant became invalid after preview | `841:3` |
| Execute — contact collision | `841:3` |
| Execute — generic sanitized failure | `841:24` |
| Completed merge — bounded | `837:3` |
| Reject — secondary action, mandatory reason, submitting, success | `836:3` (action), `841:45` (reason + confirm), `831:80` convention |
| Reject — invalid-transition conflict | `841:66` |
| Rejected state | `837:95` |
| Narrow Admin width | `838:3` |

Constraint compliance:

- The operator explicitly chooses survivor and loser; **no frame implies the
  system selects, swaps, defaults or reverses them.** `840:40` says the
  direction comes from the case and cannot be flipped at confirmation.
- `836:123` offers **no** overwrite, merge-fields, delete-one or "continue
  anyway"; the execute button is **disabled, not hidden**, so the operator can
  see why.
- `840:40` avoids claiming every historical record is rewritten — it states the
  opposite explicitly, and never claims the merge can be undone.
- `837:3` shows only `EXECUTED`, the case reference, both masked identity cards,
  the decision instant and navigation. It carries an in-frame paragraph stating
  why no counts and no event timeline are shown.
- `837:95` shows `REJECTED`, no execute action, and an in-frame paragraph
  stating why the historical rejection reason is not displayed.

---

## F. I01 design coverage

| Required element (brief §7) | Frame |
|---|---|
| Zalo CTA | `842:3`, `842:48` |
| Messenger CTA | `842:3`, `842:48` |
| Desktop | `842:3` (1440) |
| Mobile | `842:48` (390) |
| External-handoff affordance | `↗` glyph + visible "Mở ứng dụng bên ngoài" caption on every CTA, plus the accessible-name rule in `843:3` |
| Interaction states (default / hover / focus / pressed) | `843:3` |
| Context handoff in provider opening text | `843:44` |
| Config-missing behaviour | `843:3` — a channel without a configured URL is omitted; with neither configured the whole group disappears and the footer returns to the approved APP1-D02 layout. No error UX. |

Constraint compliance:

- Placed in the footer's existing `Kết nối` column, **secondary** to the
  store's authoritative flows, and deliberately **not** a floating corner
  button — `842:3` records that a floating launcher reads as a chatbot.
- **No** embedded chat, inbox, bot, AI assistant, provider conversation
  history, read receipts, agent assignment, webhook status or message
  synchronization is drawn.
- **No provider brand asset** was added: the design system carries no licensed
  Zalo/Messenger artwork, so the CTAs are type plus a neutral `↗`.
- `843:44` forbids secure-link tokens, URL fragments, verification codes,
  internal customer ids, emails and phone numbers in opening text — only a
  human-readable public request/order code — and forbids showing URL or query
  construction in UI copy.

---

## G. Backend-contract fidelity

The published shapes were read from source, not from prose. `FIG-APP10-CONTRACT-FIDELITY`
(`845:3`) carries this proof inside Figma as well.

| Operation | Checkpoint | Screens it feeds |
|---|---|---|
| `GET /api/admin/customers/resolve` · `…/{customerId}` | APP4-B07 (approved) | Lookup card; both A02 participant slots |
| `PATCH /api/admin/customers/{customerId}` | APP10-B01 | `831:3`, `831:28`, `831:42`, `831:62` |
| `POST …/contacts/{contactId}/primary` | APP10-B01 | `832:3`, `832:26`, `832:46` |
| `POST …/contacts/{contactId}/deactivate` | APP10-B01 | `832:67`, `832:90`, `833:3`, `833:21` |
| `POST /api/admin/customer-merges` | APP10-B02 | `835:3`, `835:82`, `840:3`, `840:19` |
| `GET /api/admin/customer-merges/{caseId}` | APP10-B02 | `836:3`, `836:123`, `837:3`, `837:95`, `838:3` |
| `POST …/{caseId}/reject` | APP10-B02 | `841:45`, `841:66` |
| `POST …/{caseId}/execute` | APP10-B03 | `840:40`, `840:74`, `840:93`, `840:110`, `841:3`, `841:24` |

**Nothing in the package requires:**

| Capability | Proof it is not required |
|---|---|
| Customer list / search | `GET /api/admin/customers` does not exist. Both merge participants and the A01 customer come from the exact-contact resolver. No table, directory, fuzzy/prefix search or bulk selection is drawn. |
| Contact creation | No "Add contact" affordance and no contact-value field exists in any frame. |
| Verification mutation | No verify/unverify/clear control exists. `833:60` states that only a customer-performed challenge can mint a verified contact. |
| Unmerge | No undo/unmerge control on `837:3` or anywhere else; `840:40` and `837:3` say so explicitly. |
| Merge-event read API | No event timeline is drawn. `837:3` and `845:3` record that `customer_merge_events` is written by B03 but published by **no** HTTP operation. |
| Historical rejection-reason API | `837:95` shows no rejection-reason field; `841:45` warns the operator up front that the reason lives in the audit trail and is not republished. |
| New backend operation, migration or worker | The table above maps every frame to an already-delivered operation. 0 endpoints, 0 migrations, 0 workers. |
| New nav entry or RBAC | A02 sits at `/support/customer-access/merge` and `…/merge/{caseId}`, sub-routes of the existing `Hỗ trợ truy cập khách hàng` entry. No role matrix or "insufficient permission" state is drawn — APP1-B01 is a binary gate. |

Two contract facts the design obeys that prose alone would have missed:

1. **`AdminCustomerContactResponse` publishes no active/deactivated field**, and
   the detail read lists *current* contacts only. So there is no
   "deactivated" badge to draw, and the success state for deactivation is the
   contact **leaving the list** (`832:90`).
2. **All three A01 mutations answer `204`** and republish nothing, and both
   contact transitions are idempotent. Every success frame therefore says the
   UI re-reads the customer rather than predicting the new value, and the
   promote action is not offered on a contact that is already primary.

---

## H. Design approval state

All **41** new rows are registered in `docs/design/FIGMA_DESIGN_INDEX.md`
§4.16 with:

```text
Status             = REVIEW_REQUIRED
Approval Evidence  = —
Owning Phase       = APP10-D01
Last Verified      = 2026-08-29
```

`REVIEW_REQUIRED` is this registry's canonical pre-approval status (§2 rule 4;
the same status every `APP3-D01`…`APP9-D01` package entered with). **Claude did
not self-approve any row**, and no row outside `APP10-D01` was touched — in
particular the 18 approved `APP4-D01` `/support/customer-access` rows keep
`APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001`, and
the 36 `APP9-D01` rows keep theirs.

```text
A01_UI_IMPLEMENTATION_GATE = CLOSED until a human reviewer promotes the rows
A02_UI_IMPLEMENTATION_GATE = CLOSED
I01_UI_IMPLEMENTATION_GATE = CLOSED
```

Registry deltas:

```text
before   450 registry IDs / 450 node rows / 21 registry tables
after    491 registry IDs / 491 node rows / 22 registry tables
delta    +41 rows, +1 table (§4.16), +1 write-target line in §3
```

---

## I. Validation

Exactly one command, the scoped design gate this checkpoint justifies
(`VALIDATION_GOVERNANCE.md` §3; `SCOPED_COMMAND_INDEX.md`
`CMD-CHECK-FIGMA-DESIGN-INDEX`):

```text
$ node tools/check-figma-design-index.mjs
Figma Design Index check passed (491 registry IDs, 491 node rows, 22 registry
table(s); canonical files + statuses + deep links + composites verified).

exit 0
```

That gate verified, for the 41 new rows among the 491: canonical file key,
registry-ID format and uniqueness, allowed status, required columns, node colon
form, node deep link whose file key and node id match the row, cross-phase
canonical composite uniqueness, no approval evidence claimed on a non-approved
row, no tracker `t=` parameter, no secret and no personal email.

```text
RUNTIME_TESTS      = NOT_RUN
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E           = NOT_RUN
OPENAPI_GENERATION = NOT_RUN
DB_CHECKS          = NOT_RUN
B03_EVIDENCE       = NOT_RERUN
```

D01 changes no runtime source, so Prettier/ESLint/SonarQube have no new subject
and no repository-wide aggregate was launched.

---

## J. Files changed

Repository — three files, all documentation/registry:

```text
M  docs/design/FIGMA_DESIGN_INDEX.md
     §3  +1 line: APP_10 write target (page 825:3)
     §4.16 NEW: pre-draw audit prose + 41-row registry table
M  docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md
     §11 roadmap: APP10-D01 NEXT -> COMPLETE, APP10-A01 INCOMPLETE -> NEXT
     §11 status block: +D01 entry
A  docs/implementation/reports/APP10-D01-COMPLETION-REPORT.md   (this file)
```

Not modified: API runtime, Admin runtime, Storefront runtime, database schema,
migrations, OpenAPI, generated API client, workers.

Figma — one page, one section, 41 new frames:

```text
file     BQwqV8GdfUIELvsQDB1UQE (embroidery)
page     APP_10 — 825:3            reused (was empty)
section  828:3                     created
frames   41 created                828:4, 829:3, 831:3/28/42/62/80,
                                   832:3/26/46/67/90, 833:3/21/39/60, 834:3,
                                   835:3/82, 836:3/123, 837:3/95, 838:3,
                                   840:3/19/40/74/93/110,
                                   841:3/24/45/66/84, 842:3/48,
                                   843:3/44, 844:3, 845:3
modified elsewhere                 none — 0 nodes outside 828:3 were touched
DS library                         not opened for write
```

---

## K. Follow-ups (nonblocking)

| Id | Kind | Note |
|---|---|---|
| `FU-APP10-D01-01` | API limitation | `customer_merge_events` is immutable and complete but published by no HTTP operation. If a read is ever added, `837:3` can gain a real event timeline with real per-step counts. Until then a timeline would be invention. Needs a new backend operation — out of scope for a design checkpoint. |
| `FU-APP10-D01-02` | API limitation | The merge-case detail contract carries one `reason` column and it holds the *opening* reason; the rejection reason lives in `audit_events.reason` and is unpublished. If it is ever published, `837:95` can display it. |
| `FU-APP10-D01-03` | Contract gap | `AdminCustomerContactResponse` publishes no active/deactivated flag and the detail read omits deactivated contacts entirely, so an operator cannot see contact history. If a history view is ever wanted it needs a contract change, not a design change. |
| `FU-APP10-D01-04` | Frontend note | `admin-shell-nav.ts` marks an entry section-active with `pathname.startsWith(href + '/')`. `/support/customer-access/merge` satisfies that against the existing `/support/customer-access` entry, which is exactly why the route was nested there. `APP10-A02` should confirm the highlight at implementation time; **no nav change is required**. |
| `FU-APP10-D01-05` | Content | The Storefront footer still carries no canonical company contact block (carried from `APP1-S01A`). I01 adds two configured external links only and does not close that gap. |
| `FU-APP10-D01-06` | Design idea | Zalo/Messenger brand marks are not used because the design system holds no licensed provider artwork. If licensed assets are ever added to `FIG-FILE-DS`, `842:3`/`842:48` can adopt them without a layout change. |

No follow-up blocks `APP10-A01`.

---

## L. Roadmap

```text
APP10-G01 = COMPLETE
APP10-B01 = COMPLETE
APP10-B02 = COMPLETE
APP10-B03 = COMPLETE
APP10-D01 = COMPLETE   (this checkpoint — awaiting PO review of the Figma package)
APP10-A01 = NEXT
APP10-A02 = INCOMPLETE
APP10-I01 = INCOMPLETE
APP10-E01 = INCOMPLETE
APP10-X01 = INCOMPLETE
```

`APP10-A01`, `APP10-A02` and `APP10-I01` are gated on a human promoting the
rows they consume from `REVIEW_REQUIRED` to `APPROVED_FOR_IMPLEMENTATION` with
an approval-evidence id, per `FIGMA_DESIGN_INDEX.md` §2.
