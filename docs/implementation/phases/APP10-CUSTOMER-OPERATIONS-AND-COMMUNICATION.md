# APP10 — Customer Operations and Communication

## 1. Outcome

Provide maintainable customer operations: profiles/contact points, merge governance, agreements, notification delivery visibility, and simple Zalo/Messenger handoff within approved scope.

## 2. Dependencies

APP4 core customer/contact/notification behavior and R4 commerce MVP complete.
APP9 closed at `APP9-X01` (`PASS_WITH_FOLLOW_UPS`, 0 blocking).

## 3. Design policy

Audit Admin customer operations and any customer profile/preferences screens. If needed, complete one APP10 package. Zalo/Messenger design remains a simple contact/handoff experience, not a chatbot platform.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

**Audited at `APP10-G01`:** design **is** required. `/support/customer-access`
is fully covered by 18 approved `APP4-D01` frames (including the whole
notification-delivery set), but the registry carries **zero** rows matching
`merge`, `zalo` or `messenger`. One package — `APP10-D01` on a new `APP_10`
page — covers the merge workflow, the profile-maintenance states and the
contact CTA.

## 4. In scope

- Customer profile/contact maintenance.
- Verification status/support operations.
- Customer merge case/events with guardrails.
- Agreement version/acceptance where required.
- Notification intent/attempt operational search/retry.
- Simple Zalo/Messenger contact/handoff links or adapters.
- Privacy/authorization controls.

## 5. Out of scope

- AI chatbot.
- Automated sales conversation orchestration.
- Marketing campaign suite.
- Cross-customer data exposure.
- Silent destructive merge.

Added by `APP10-G01`, from audited evidence:

- **No customer list or search.** `GET /api/admin/customers` does not exist and
  is not added; APP4-B07 refused it deliberately and this phase keeps that
  refusal. Both merge participants are found with the existing exact-contact
  resolver.
- **No new agreement subsystem.** APP6 already ships versioned agreements and
  immutable acceptance evidence.
- **No notification platform rewrite**, and no new business-notification
  emission (see `FU-APP10-G01-02`).
- **No RBAC model.** APP1-B01 is a binary authenticated-admin gate; adding
  roles would need an ADR and is not APP10 work.
- **No contact creation by an Admin write.** Minting a verified contact
  requires a verification challenge.

## 6. Candidate checkpoint disposition (audit trace)

The original planning candidates were audited at `APP10-G01` against the
delivered repository. This table is the trace; §7 is the authoritative roadmap.

| Candidate | Decision | Outcome |
|---|---|---|
| `APP10-C01` Customer profile operations contract | `REMOVE` | folded into `APP10-B01` — APP4-B07 already fixed the contract shape |
| `APP10-B01` Customer profile operations backend | `SPLIT`/`RENAME` | search + read already ship; only the bounded update half survives, as `APP10-B01` |
| `APP10-A01` Admin customer list/detail | `RENAME` | becomes `APP10-A01` Admin customer profile **maintenance** UI; no list is built |
| `APP10-C02` Customer merge contract | `REMOVE` | absorbed into `APP10-G01`, which settles the transfer seam and the DB3/TBL-009 contradiction |
| `APP10-B02` Customer merge backend | `SPLIT` | → `APP10-B02` (lifecycle + preview) and `APP10-B03` (execution) |
| `APP10-A02` Admin customer merge workflow | `KEEP` | unchanged |
| `APP10-C03` Agreement contract | `REMOVE` | delivered by APP6 (`agreements`, `agreement_versions`, migrations `0018`/`0019`) |
| `APP10-B03` Agreement backend | `ALREADY_DELIVERED` | APP6-B11 `AcceptedTermsAuthority` + `approval_snapshot_agreement_acceptances`; the id is reused for merge execution |
| `APP10-C04` Notification operations contract | `REMOVE` | delivered by APP4-B08 |
| `APP10-B04` Notification operations backend | `ALREADY_DELIVERED` | APP4-B08 list + replay, idempotency, eligibility, redaction |
| `APP10-A03` Admin notification operations | `ALREADY_DELIVERED` | APP4-A01 notification panel + replay dialog, 6 approved frames |
| `APP10-S01` Customer profile/contact preferences | `DEFER` | there is no customer account model (PRD §4); no approved flow requires it |
| `APP10-I01` Zalo/Messenger simple handoff | `KEEP` | real and undelivered; storefront-only configured links |
| `APP10-E01` Customer operations E2E | `KEEP` | unchanged |
| `APP10-X01` Phase closure | `KEEP` | unchanged |
| *(new)* `APP10-D01` | `NEW` | one design package; the registry has no merge or contact-CTA rows |

Full evidence: [`APP10-G01-COMPLETION-REPORT.md`](../reports/APP10-G01-COMPLETION-REPORT.md) §D.

## 7. Canonical checkpoint roadmap

**Frozen by `APP10-G01`.** Ten checkpoints, seven new HTTP operations, zero
migrations, zero worker changes. `C01`, `C02`, `C03`, `C04` and `S01` are not
added; the agreement backend, `B04` and `A03` are already delivered by APP6 and
APP4.

| # | Checkpoint | Purpose | Dependency | Main change area | HTTP ops | Migration? | Worker? | Design/UI? | Focused test scope |
|--:|---|---|---|---|--:|---|---|---|---|
| 1 | `APP10-G01` | Phase-entry baseline, candidate disposition, canonical roadmap | APP9 closed | docs | 0 | no | no | no | static evidence only |
| 2 | `APP10-B01` | Customer profile & contact maintenance — display name/notes, primary rotation, contact deactivation | G01 | `customer` module | 3 | no | no | no | each guard; the primary unique; last-verified-contact refusal; no raw contact published |
| 3 | `APP10-B02` | Merge case lifecycle & consequence preview — open, detail+preview, reject | B01 | `customer` module | 3 | no | no | no | mandatory reason; CST-010 duplicate-open refusal; self/already-merged refusal; preview writes nothing |
| 4 | `APP10-B03` | Merge execution & immutable event history — one transaction, ordered locks (CC-27) | B02 | `customer` module + `CustomerOwnershipTransferPort` | 1 | no | no | no | per-step-kind event counts; tombstone; grants revoked; live refs repointed; **snapshots untouched**; replay idempotent; D8-18 lock ordering |
| 5 | `APP10-D01` | One complete APP10 Figma package on a new `APP_10` page | B03 | `docs/design` + Figma | 0 | no | no | **yes** | `node tools/check-figma-design-index.mjs` |
| 6 | `APP10-A01` | Admin customer profile maintenance UI — extends `/support/customer-access` | D01 approved | `apps/admin` | 0 | no | no | **yes** | changed maintenance-panel components only |
| 7 | `APP10-A02` | Admin customer merge workflow — comparison, consequences, confirmation, forbidden/conflict, audit states | D01 approved, B03 | `apps/admin` | 0 | no | no | **yes** | merge workflow components/queries/router |
| 8 | `APP10-I01` | Zalo/Messenger simple handoff — configured links, request code in opening text | D01 approved | `apps/storefront` | 0 | no | no | **yes** | footer/CTA component test incl. the updated absence assertion; no provider SDK imported |
| 9 | `APP10-E01` | Customer operations cross-boundary acceptance | A01, A02, I01 | scoped api / admin commands | 0 | no | no | no | 3 journeys, 8–12 cases |
| 10 | `APP10-X01` | Phase closure, measured baselines, follow-up classification | E01 | docs | 0 | no | no | no | static evidence only |

Every backend slice carries one primary authority and 1–3 operations; none
reaches the hard maximum of five.

```text
APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

The merge tables (`customer_merge_cases`, `customer_merge_events`,
`customers.merged_into_customer_id`) shipped in migration `0014`, with their
state checks, the CST-069 self-merge checks, the CST-010 one-open-case-per-pair
partial unique, and the merge-sweep indexes IDX-107 / IDX-117 / IDX-118 /
IDX-119.

## 8. Critical end-to-end journey

An authorized staff member finds a masked customer profile, performs a fully previewed guarded merge with immutable event history, and inspects/retries a failed notification. Unauthorized staff cannot access or merge customer data.

Mapped to owners:

| Journey step | Owner |
|---|---|
| finds a masked customer profile | **already delivered** — `adminCustomerSupport_resolve` + `_detail` (APP4-B07), reused by `APP10-E01` |
| PII masking | already delivered — `mask-contact.ts` + total projection functions; preserved by B01, B02, A01, A02 |
| fully previewed merge | `APP10-B02` (preview) + `APP10-A02` (UI) |
| merge guardrails | `APP10-B02` (CST-010, self/already-merged refusals) + `APP10-B03` (ordered locks, CC-27) |
| immutable merge evidence | `APP10-B03` — append-only `customer_merge_events`, one row per step kind |
| inspects a failed notification | **already delivered** — `adminNotificationIntent_list` + APP4-A01 panel |
| duplicate-safe retry | **already delivered** — `manual-replay-key` idempotency, `outcome: CREATED \| EXISTING` |
| authorization (unauthorized staff refused) | `AuthenticatedAdminGuard` (binary 401) + `StaffOriginGuard` on every APP10 mutation; negative journey in `APP10-E01` |
| Zalo/Messenger simple-handoff constraint | `APP10-I01` — configured links only, no backend, no adapter, no webhook |

## 9. Exit gate

- Merge integrity and audit pass.
- Notification retry is duplicate-safe.
- PII masking/authorization pass.
- Zalo/Messenger remain simple handoff only.
- E2E passes.

## 10. Handoff

APP11 may use stable customer-safe public interactions; APP12 hardens privacy, retention, observability and provider operations.

Carried forward unscheduled (see `APP10-G01` §J): business-event notification
emission (`FU-APP10-G01-02`), the customer shipping-fee acknowledgement UI
(`FU-APP10-G01-03`), and the S24 append-only trigger gap
(`FU-APP10-G01-04`).

## 11. Roadmap status

Exactly one unfinished row carries **NEXT**. This table is updated after every
APP10 checkpoint, and it is the only APP10 status table.

| Checkpoint | Capability | Status |
|---|---|---|
| `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` |
| `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` |
| `APP10-B02` | Merge case lifecycle & consequence preview | `COMPLETE` |
| `APP10-B03` | Merge execution & immutable event history | `NEXT` |
| `APP10-D01` | APP10 design package | `INCOMPLETE` |
| `APP10-A01` | Admin customer profile maintenance UI | `INCOMPLETE` |
| `APP10-A02` | Admin customer merge workflow | `INCOMPLETE` |
| `APP10-I01` | Zalo/Messenger simple handoff | `INCOMPLETE` |
| `APP10-E01` | Customer operations cross-boundary acceptance | `INCOMPLETE` |
| `APP10-X01` | Phase closure | `INCOMPLETE` |

```text
G01   COMPLETE (2026-08-28 — audit and documentation only. 0 runtime, test,
                schema, migration, OpenAPI, generated-client and Figma changes.
                Entry baseline 100 paths / 108 operations / 222 schemas,
                37 migrations, 21 Admin + 12 Storefront routes, 495 Figma rows —
                all matching the APP9-X01 closure baseline. 15/15 candidates
                dispositioned into a 10-checkpoint canonical roadmap:
                3 ALREADY_DELIVERED (B03 agreements, B04, A03), 4 REMOVE
                (C01, C02, C03, C04), 1 DEFER (S01), 2 SPLIT (B01, B02),
                2 RENAME (B01, A01), 4 KEEP (A02, I01, E01, X01),
                1 NEW (D01). Agreements proven delivered
                by APP6; notification operations proven delivered by APP4-B08
                and APP4-A01; merge proven schema-complete but
                application-undelivered. APP10_SCHEMA_DISPOSITION =
                NO_MIGRATION_REQUIRED. 7 predicted HTTP operations (108 -> 115).
                One authority contradiction found and resolved in favour of
                DB4 §7 / DB5 IDX-118 (FU-APP10-G01-01). 6 follow-ups recorded,
                0 blocking. PO_DECISION_REQUIRED = NONE.
                Evidence: reports/APP10-G01-COMPLETION-REPORT.md)

B01   COMPLETE (2026-08-28 — 3 Admin mutations delivered exactly as G01 §E.1
                fixed them: PATCH /api/admin/customers/{customerId}
                (adminCustomer_update), POST .../contacts/{contactId}/primary
                (adminCustomerContact_promote) and .../deactivate
                (adminCustomerContact_deactivate). No customer list, no search,
                no contact-create operation and no fourth route. Writable
                surface bounded to customers.display_name and customers.notes;
                verified_at, merged_into_customer_id and anonymized_at have no
                member on any input type. Promotion is one transaction over the
                CST-006 partial unique and accepts only an owned, active,
                already-verified contact; deactivation is soft, refuses the
                primary and the last verified contact, and promotes nothing as
                a side effect. Both replays and a value-identical patch are
                idempotent no-ops that write no row and append no audit event.
                A merged customer is refused 409 on all three. A foreign
                contactId answers exactly as a missing one. Publication change:
                contactId on the masked contact projection and notes on the
                customer detail — masked-only unchanged, no raw contact value
                anywhere. 3 audit actions added (customer.profile_updated,
                customer.primary_contact_changed, customer.contact_deactivated),
                summaries carrying field names and ids only. 0 migrations.
                OpenAPI 100->102 paths, 108->111 operations, 222->223 schemas.
                144 focused tests pass (46 new B01 integration, 48 delivered
                APP4-B07 support/resolve/grants/revoke, 50 Admin
                customer-access components); FULL_MONOREPO_TEST = NOT_RUN,
                FULL_E2E = NOT_RUN. PO_DECISION_REQUIRED = NONE.
                Evidence: reports/APP10-B01-COMPLETION-REPORT.md)

B02   COMPLETE (2026-08-28 — the non-destructive half of merge, exactly as
                G01 §E.2 fixed it: POST /api/admin/customer-merges
                (adminCustomerMerge_open), GET .../{caseId}
                (adminCustomerMerge_detail) and POST .../{caseId}/reject
                (adminCustomerMerge_reject). No execute route, no approve,
                cancel, reopen, bulk merge, customer list or duplicate-candidate
                search, and no fourth operation. Nothing is transferred: no
                contact moved, no grant revoked, no request, order or asset
                repointed, no merged_into_customer_id written and zero
                customer_merge_events rows appended on any path — B02 uses none
                of TBL-010's four execution step kinds, because all four name a
                step of execution. Survivor and loser are explicit and never
                swapped, defaulted or inferred; a self-merge is a 400 from the
                strict body, an unknown or already-merged participant a 404/409,
                and merge chains are never followed. One open case per ordered
                pair: the use case pre-reads, CST-010's partial unique arbitrates,
                and two concurrent opens answer 201 + 409 with exactly one row.
                Reject is a 409 on a rejected or executed case, not an idempotent
                204 — the reason a second caller supplied would otherwise be
                discarded (adminSecureGrant_revoke's precedent). Detail publishes
                both participants through the delivered APP5-B04 masked
                projection — no raw, normalized or display value, no notes, no
                contactId, no merge pointer — plus a bounded six-member
                consequence preview: contactPoints, activeSecureAccessGrants,
                customRequests, orders, uploadedAssets, businessProfile. Live
                categories only; approval_snapshots, quotation_acceptances,
                design_reviews, audit_events and both *_transitions histories
                carry the same customer_id and are excluded. Counts are computed
                on every read, stored nowhere, and the cross-module halves come
                through two new count-only ports implemented by Ordering and
                Asset. 2 audit actions added (customer.merge_case_opened,
                customer.merge_case_rejected) under a new CUSTOMER_MERGE_CASE
                target kind; the open reason stays on the case row and the
                declining reason goes to audit_events.reason. 0 migrations.
                OpenAPI 102->105 paths, 111->114 operations, 223->230 schemas.
                26 new focused integration tests pass, plus 94 delivered
                APP4-B07/APP10-B01 tests re-run because the shared harness
                changed; FULL_MONOREPO_TEST = NOT_RUN, FULL_E2E = NOT_RUN.
                PO_DECISION_REQUIRED = NONE.
                Evidence: reports/APP10-B02-COMPLETION-REPORT.md)
```
