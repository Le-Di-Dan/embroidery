# APP10 — Closure Matrix

- Phase: `APP10 — Customer Operations and Communication`
- Produced by: `APP10-X01`
- Date: 2026-08-29
- Companion: [`APP10-X01-COMPLETION-REPORT.md`](./APP10-X01-COMPLETION-REPORT.md)

```text
APP10 = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE = CLOSED
NEXT_PHASE = APP11 — Gallery, Content, SEO and Store Presentation
```

Every row is read from the committed repository — the accepted reports, the commit
ledger, the generated OpenAPI artifact, the migration journal, the Figma registry
and the delivered source. Nothing was regenerated, re-executed or inferred.

---

## 1. Canonical checkpoint count

```text
canonical checkpoints        = 10
  G01 B01 B02 B03 D01 A01 A02 I01 E01 X01

correction checkpoints       =  0
unused correction slots      =  9
  G01-C1 B01-C1 B02-C1 B03-C1 D01-C1 A01-C1 A02-C1 I01-C1 E01-C1
  (there is no C1 and no C2 anywhere in APP10)

non-checkpoint interventions =  0
pre-closure APP10 commits    =  7
closure commit               =  1
```

Ten checkpoints produce seven pre-closure commits because `G01` (documentation
only) and `B01` were delivered inside the `df1d0bc` commit that carries `B02`.

The roadmap that produced these ten is `APP10-G01`'s 15-candidate disposition: 3
`ALREADY_DELIVERED` (agreements by APP6, notification operations by APP4-B08 and
APP4-A01, `A03`), 4 `REMOVE` (`C01`–`C04`), 1 `DEFER` (self-service `S01`), 2
`SPLIT`, 2 `RENAME`, 4 `KEEP` and 1 `NEW` (`D01`). None of the retired candidates
is restored by closure.

---

## 2. Checkpoint matrix

| # | Checkpoint | Final status | Correction | Principal authority delivered | Commit | Report | Blockers |
|---|---|---|---|---|---|---|---|
| 1 | `APP10-G01` | `COMPLETE` | — | Phase-entry baseline; 15 candidates dispositioned into the 10-checkpoint canonical roadmap; `APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED`; 7 HTTP operations predicted | `df1d0bc` | `APP10-G01-COMPLETION-REPORT.md` | 0 |
| 2 | `APP10-B01` | `COMPLETE` | — | Customer profile and contact maintenance — 3 Admin mutations, writable surface bounded to `display_name` + `notes` | `df1d0bc` | `APP10-B01-COMPLETION-REPORT.md` | 0 |
| 3 | `APP10-B02` | `COMPLETE` | — | Merge case lifecycle and the read-only 9-category consequence preview — open, detail+preview, reject | `df1d0bc` | `APP10-B02-COMPLETION-REPORT.md` | 0 |
| 4 | `APP10-B03` | `COMPLETE` | — | Atomic merge execution, grant revocation, tombstone, immutable merge-event sequence, duplicate-safe replay | `1f93d63` | `APP10-B03-COMPLETION-REPORT.md` | 0 |
| 5 | `APP10-D01` | `COMPLETE` / `PO APPROVED` | — | The APP10 design package — 41 registry rows on page `APP_10` under `FIG-APPROVAL-APP10-D01-PO-001` | `08dfd09` | `APP10-D01-COMPLETION-REPORT.md` | 0 |
| 6 | `APP10-A01` | `COMPLETE` | — | Admin customer profile maintenance UI extending `/support/customer-access`; promoted all 41 D01 rows to `APPROVED_FOR_IMPLEMENTATION` | `f2fa01a` | `APP10-A01-COMPLETION-REPORT.md` | 0 |
| 7 | `APP10-A02` | `COMPLETE` | — | Admin customer merge workflow — 2 new routes, comparison, consequences, confirmation, conflict and audit states | `a2e1845` | `APP10-A02-COMPLETION-REPORT.md` | 0 |
| 8 | `APP10-I01` | `COMPLETE` | — | Zalo/Messenger simple external handoff — configured links only, no provider SDK, no backend | `39ee62a` | `APP10-I01-COMPLETION-REPORT.md` | 0 |
| 9 | `APP10-E01` | `COMPLETE` / **PO PASS** | — | Cross-boundary acceptance — 4 journeys, 11 cases, 11 pass, plus PO-directed live Playwright verification | `96d73d5` | `APP10-E01-COMPLETION-REPORT.md` | 0 |
| 10 | `APP10-X01` | `COMPLETE` | — | Phase closure and final authority lock | this closure commit | `APP10-X01-COMPLETION-REPORT.md` | 0 |

---

## 3. Contract matrix — 7 APP10-owned HTTP operations

| Owner | Method | Path | Operation id | Notes |
|---|---|---|---|---|
| `B01` | `PATCH` | `/api/admin/customers/{customerId}` | `adminCustomer_update` | `display_name` + `notes` only; 204 |
| `B01` | `POST` | `/api/admin/customers/{customerId}/contacts/{contactId}/primary` | `adminCustomerContact_promote` | one transaction over the `CST-006` partial unique; 204 |
| `B01` | `POST` | `/api/admin/customers/{customerId}/contacts/{contactId}/deactivate` | `adminCustomerContact_deactivate` | soft; refuses the last verified or the primary contact; 204 |
| `B02` | `POST` | `/api/admin/customer-merges` | `adminCustomerMerge_open` | explicit survivor and loser; mandatory reason |
| `B02` | `GET` | `/api/admin/customer-merges/{caseId}` | `adminCustomerMerge_detail` | case + 9-category ownership preview; REQUESTED-only preview |
| `B02` | `POST` | `/api/admin/customer-merges/{caseId}/reject` | `adminCustomerMerge_reject` | reason durable in `audit_events.reason` only (`FU-APP10-B02-03`) |
| `B03` | `POST` | `/api/admin/customer-merges/{caseId}/execute` | `adminCustomerMerge_execute` | case id, no body; `EXECUTED` and `ALREADY_EXECUTED` both safe |

```text
APP10_OWNED_HTTP_OPERATIONS = 7
OPENAPI_OPERATIONS  108 (APP9 closure)  ->  115 (APP10 closure)
OPENAPI_PATHS       100                 ->  106
OPENAPI_SCHEMAS     222                 ->  232
OPERATIONS REMOVED  0
```

Reused and **not** counted as APP10-owned: `adminCustomerSupport_resolve`,
`adminCustomerSupport_detail`, `adminCustomerSupport_grants` (all `APP4-B07`) and
the `APP4-B08` / `APP4-A01` notification operations. APP10 screens and the E01
journeys consume them; APP4 owns them.

Refusal shape, recorded as the phase's principal contract debt: none of the seven
publishes a business `code` on its 409s, so five B01 causes and three-plus-three
B02/B03 causes each collapse onto one status. Both Admin screens resolve this by
re-reading the authority and classifying against the fresh record
(`FU-APP10-A01-01`, `FU-APP10-A02-01`).

---

## 4. Database matrix

```text
APP10_OWNED_MIGRATIONS = 0
REPOSITORY_TOTAL       = 37   (unchanged across the whole phase)
LAST MIGRATION         = 0037_add_app7_transfer_evidence_association   (APP7)
APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

Every table APP10 writes was provisioned by the DB phases: `customers`,
`customer_contact_points`, `customer_merge_cases`, `customer_merge_events`,
`business_profiles`, `secure_access_grants`, `audit_events`. `APP10-G01` predicted
this and closure confirms it.

The only persistence-layer change in the phase is non-DDL:

| File | Change | Checkpoint |
|---|---|---|
| `packages/database/src/schema/customer/customer-merge-cases.ts` | file comment corrected to state the per-column live/frozen split (closes `FU-APP10-G01-01`) | `B03` |
| `packages/database/src/index.ts` | two barrel exports | `B03` |

Merge write behaviour, per column:

| Class | Columns | Action on execute |
|---|---|---|
| live ownership | `orders.customer_id`, `custom_requests.customer_id`, `customer_contact_points.customer_id`, `business_profiles.customer_id`, `assets.uploaded_by_customer_id` | repointed to the survivor (DB4 §7, DB3 §4 step 2; `IDX-118` provisioned for the sweep) |
| frozen evidence | `order_transitions`, `custom_request_transitions`, `approval_snapshots`, `quotation_acceptances`, `design_reviews`, `audit_events` | never rewritten |
| grants | `secure_access_grants` | ACTIVE loser grants revoked, never repointed (DB3 §4 step 4) |
| tombstone | `customers.merged_into_customer_id` | set on the loser; new activity resolves forward |

Outstanding schema-mechanism debt: the CST-098 / CST-096 append-only and
immutability **triggers** for `customer_merge_events` and `agreement_versions` are
documented but not built (`FU-APP10-G01-04`). B03 relies on application shape — the
repository exposes exactly one append method — which is the same posture
`inventory_ledger_entries` ships with. Inherited from the DB phases, nonblocking.

---

## 5. Worker matrix

```text
WORKER_DELTA = 0
```

`apps/worker` was not touched by any APP10 checkpoint. APP10 emits no job, adds no
handler and changes no queue payload. `git diff --stat` from the APP9 closure
commit to APP10 `HEAD` over `apps/worker` is empty.

The related gap is recorded, not delivered: **no business-event notification is
emitted anywhere in the product.** The only two producers remain
`verification.code` and the secure-grant link, both APP4. `FU-APP9-B01-01` (SE-010
`payment.final-requested`) was routed to APP10 by `APP9-G01` §8 and was
deliberately **not scheduled** — APP10's in-scope line is notification *operations*
(inspection and replay, already delivered by APP4-B08), not new producers.
Carried as `FU-APP10-G01-02` for a commerce owner.

---

## 6. Figma matrix

```text
APP10_FIGMA_ROWS = 41
  APPROVED_FOR_IMPLEMENTATION = 37
  REVIEW_REQUIRED             =  4
APPROVAL   = FIG-APPROVAL-APP10-D01-PO-001
PAGE       = APP_10   (new page for the phase; no new Figma file)
REGISTRY   = 450 (APP9 closure)  ->  491 ids / 491 node rows / 22 tables
GATE       = node tools/check-figma-design-index.mjs   PASS
NODES TOUCHED BY X01 = 0
```

The four `REVIEW_REQUIRED` rows are the I01 placement frames, and their status is
**intentional**:

| Registry id | Node | Why it is stale |
|---|---|---|
| `FIG-APP10-I01-FOOTER-DESKTOP` | `842:3` | draws the footer rectangle superseded by the floating dock |
| `FIG-APP10-I01-FOOTER-MOBILE` | `842:48` | same |
| `FIG-APP10-I01-CTA-STATES` | `843:3` | CTA states drawn in the footer context |
| `FIG-APP10-I01-HANDOFF-SPEC` | `843:44` | specification frame written against the footer placement |

Runtime authority for what replaced them is
`PO-DIRECTIVE-APP10-E01-I01-FLOATING-HANDOFF-001`, not a Figma node. The rows keep
their node ids and deep links as the historical record, with approval evidence
cleared, and are blocked from authorizing further work until redrawn
(`FU-APP10-E01-01`). **No approval was invented for a node that was not redrawn**,
and no Figma artifact was modified during E01 or X01 — the `figma-desktop` MCP
server was `ConnectionRefused` for the whole E01 session.

The remaining 37 rows — the Admin maintenance, merge and specification frames —
keep `APPROVED_FOR_IMPLEMENTATION` under the D01 approval token and were the
authority every Admin screen was built against.

---

## 7. Follow-up matrix — every item classified exactly once

```text
BLOCKING     =  0
NONBLOCKING  = 30
CLOSED       =  4
TOTAL        = 34
```

Four ids are recorded twice across reports and are counted once here:
`FU-APP10-B01-02` = `FU-APP10-B02-01` (APP6 use-case lint), `FU-APP10-A01-02` =
`FU-APP10-A02-02` (APP6 test lint), `FU-APP10-B02-03` = `FU-APP10-D01-02`
(rejection reason), `FU-APP10-G01-05` = `FU-APP10-A02-03` (business-profile
surface).

| Id | Classification | Owner after closure |
|---|---|---|
| `FU-APP10-G01-01` | `CLOSED` (B03) | — |
| `FU-APP10-B02-02` | `CLOSED` (B03) | — |
| `FU-APP10-I01-01` | `CLOSED` (E01 §E.1) | — |
| `FU-APP10-D01-04` | `CLOSED` (A02) | — |
| `FU-APP10-E01-01` | `NONBLOCKING` | design — redraw the four I01 frames as the floating dock |
| `FU-APP10-E01-02` | `NONBLOCKING` | tooling — a scoped per-app SCSS compile gate |
| `FU-APP10-E01-03` | `NONBLOCKING` | design + contract — merge-participant disambiguation |
| `FU-APP10-A01-01` | `NONBLOCKING` | contract — stable business codes on B01 refusals |
| `FU-APP10-A02-01` | `NONBLOCKING` | contract — stable business codes on B02/B03 refusals |
| `FU-APP10-A01-03` | `NONBLOCKING` | frontend — split `customer-access-support.scss` (652 lines) |
| `FU-APP10-A02-04` | `NONBLOCKING` | contract — find an existing REQUESTED case for a pair |
| `FU-APP10-B01-01` | `NONBLOCKING` | APP4 / tooling — `CMD-CHECK-APP4-B07-CONTRACT` (`HISTORICAL_SCOPED`) |
| `FU-APP10-B01-02` · `FU-APP10-B02-01` | `NONBLOCKING` | APP6 / hardening — 3 pre-existing ESLint errors |
| `FU-APP10-B01-03` | `NONBLOCKING` | APP5 — `AdminCustomerSummaryPort` publishes no `contactId` |
| `FU-APP10-B01-04` | `NONBLOCKING` | privacy — `notes` is operator free text; `anonymize()` already clears it |
| `FU-APP10-B02-03` · `FU-APP10-D01-02` | `NONBLOCKING` | contract + DB — rejection reason needs a `decision_reason` column |
| `FU-APP10-B03-01` | `NONBLOCKING` | APP4 / tooling — `CMD-CHECK-APP4-B02`, 74 failures |
| `FU-APP10-B03-02` | `NONBLOCKING` | contract — survivor read does not list the loser's historical grants |
| `FU-APP10-D01-01` | `NONBLOCKING` | contract — no merge-event read API |
| `FU-APP10-D01-03` | `NONBLOCKING` | contract — no active/deactivated contact flag, no contact history |
| `FU-APP10-D01-05` | `NONBLOCKING` | content — no canonical company contact block in the footer (from `APP1-S01A`) |
| `FU-APP10-D01-06` | `NONBLOCKING` | design — no licensed Zalo/Messenger brand artwork |
| `FU-APP10-G01-02` | `NONBLOCKING` | **commerce phase** — no business-event notification producer exists |
| `FU-APP10-G01-03` | `NONBLOCKING` | **commerce phase** — customer shipping-fee acknowledgement UI |
| `FU-APP10-G01-04` | `NONBLOCKING` | DB — CST-098 / CST-096 append-only triggers |
| `FU-APP10-G01-05` · `FU-APP10-A02-03` | `NONBLOCKING` | product — no Admin business-profile surface, so the merge blocker has no in-product resolution |
| `FU-APP10-G01-06` | `NONBLOCKING` | product — duplicate-candidate detection, forbidden by APP10 §5.4 |
| `FU-APP10-I01-02` | `NONBLOCKING` | operations — production Zalo/Messenger URLs unconfigured |
| `FU-APP10-I01-03` | `NONBLOCKING` | product — page-level handoff with a public request/order code |
| — | `NONBLOCKING` | Storefront `/favicon.ico` 404 (cosmetic, observed live) |
| — | `NONBLOCKING` | synthetic customers and one executed merge case remain in the **development** database; the evidence tables are append-only |

---

## 8. Route matrix

```text
NEW_ADMIN_ROUTES = 2
  /support/customer-access/merge              added a2e1845, APP10-A02
  /support/customer-access/merge/{caseId}     added a2e1845, APP10-A02
  /support/customer-access                    extended by APP10-A01 (APP4-A01 route, unchanged path)

NEW_STOREFRONT_ROUTES = 0
  the floating contact dock is shell furniture, not a route

ADMIN_ROUTES      21 -> 23
STOREFRONT_ROUTES 12 -> 12
SIDENAV ENTRIES ADDED = 0
```

Both merge routes nest under the existing customer-access entry, so
`resolveNavItemState` already answers `section` for them — which is exactly why the
route was nested there (`FU-APP10-D01-04`, closed by A02). The Admin shell is
unchanged.

The Storefront route count is asserted, not assumed: `APP10-E01` case `E01-10`
measures it from the App Router tree on disk, so a page added anywhere fails the
case.

---

## 9. Terminal state and handoff

```text
APP10 delivers customer operations as an Admin-only capability:

  bounded profile maintenance    display name + notes, nothing else writable
  contact transitions            promote an existing verified ACTIVE contact; soft deactivate
  merge governance               open -> preview -> reject | execute, fail-closed, atomic, replay-safe
  merge history                  immutable, append-only, one event row per step
  notification operations        inspection and replay, reused from APP4-B08 / APP4-A01
  customer handoff               a floating Zalo/Messenger dock, external links only

APP10 executes none of:
  customer list, directory or search          contact creation
  duplicate-candidate detection or scoring    unmerge
  merge-event read API                        rejection-reason read API
  business-profile Admin surface              customer self-service profile editing
  any business-event notification producer    any chatbot, embedded chat or provider SDK

HANDOFF_ENTRY_STATE = customer identity operable by Admin; merge governed and auditable
NEXT_PHASE          = APP11 — Gallery, Content, SEO and Store Presentation
APP11_EXECUTION     = NONE
```

Read from `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §2–§3 and
`docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md`, not from memory.
APP11 owns public content, discovery and operational content management, and
reuses existing public designs. Nothing APP10 leaves open gates it.

Two follow-ups routed *into* APP10 by APP9 leave it unresolved and should be
re-dispositioned at APP11's phase-entry audit rather than carried silently:
`FU-APP10-G01-02` (business-event notification, from `FU-APP9-B01-01`) and
`FU-APP10-G01-03` (shipping-fee acknowledgement UI). Both are order-surface debts
with a commerce owner, not customer-operations work.

---

## 10. Closure verdict

```text
APP10-X01           = COMPLETE
APP10               = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE               = CLOSED
NEXT_PHASE          = APP11 — Gallery, Content, SEO and Store Presentation
NOT_PUSHED          = true
```
