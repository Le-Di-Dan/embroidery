# APP4-P00 — Completion report

- Checkpoint: `APP4-P00` — Phase entry authority, re-slicing and execution manifest
- Phase: APP4 — Customer Identity, Verification, Secure Access and Notification Core
- Date: 2026-08-13
- Branch: `production`
- Entry HEAD: `aa577f3e6e7da31a7acb42de12219b84f86b7708` (working tree clean at entry)
- Deliverable: [`audits/APP4_PHASE_ENTRY_AUDIT.md`](../audits/APP4_PHASE_ENTRY_AUDIT.md)
- Mode: planning and reconciliation only — **no runtime implementation**

---

## A. Verdict

**`PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`**

History — there is no `APP4-P00-C2` and none was created:

```text
initial P00
→ APP4-P00-C1 (the single allowed correction)
→ mandatory closure directive (prescriptive, not a correction)
```

The first draft carried `PASS_WITH_ROUTED_DECISIONS`; the single routed item is
Product-Owner accepted (§G), so the decision ledger is empty.

APP4 was reconciled against the delivered APP0–APP3 and DB7 baseline. The
twelve candidate slices in the phase brief were re-sliced into **17 execution
checkpoints**. Four candidates did not survive contact with the baseline and
were deleted, folded or split for reasons recorded in the audit §E.

Product Owner review of the first draft found a genuine internal contradiction
in the secret-delivery and secure-link transport architecture. It is corrected
in **§M — `P00-C1`**, the only correction applied to this checkpoint. A residual
defect surviving that correction — `APP4-B08`'s incomplete manual-replay
contract against locked APP2 dead-letter authority — is closed by the
prescriptive directive recorded in **§N**.

Migration verdict: **`NO_APP4_MIGRATION`** — every APP4 invariant is expressible
against the delivered schema (audit §C.1); neither the correction nor the
closure adds one.

---

## B. Repository baseline inspected

### B.1 Git

| Item | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `aa577f3e6e7da31a7acb42de12219b84f86b7708` — `docs(app3): record phase closure evidence` |
| Working tree at entry | clean |
| Phase status read | APP0 `COMPLETE`; APP1/APP3 `COMPLETE — PASS_WITH_FOLLOW_UPS`; APP2 `COMPLETE`; APP4–APP12 `NOT_STARTED` |

### B.2 Authoritative documents

- Phase brief `phases/APP4-CUSTOMER-IDENTITY-SECURE-ACCESS-NOTIFICATION.md` — located and read in full (stop condition 1 not met).
- ADRs: `ADR-DB2-001` (customer identity model), `ADR-DB2-003` (notification persistence), `ADR-DB3-004` (secure grant, revocation, re-verification), `ADR-APP2-002`/`IMP-D029` (job runtime), `ADR-APP1-001`/`IMP-D027` (staff auth).
- Standards: `04-BACKEND-API-DELIVERY-STANDARD.md` (five-API maximum), `03-DESIGN-DELIVERY-POLICY.md`, `05-FRONTEND-AND-SCSS-STANDARD.md`, `06-OPENAPI-AND-CLIENT-CONTRACT.md`, `VALIDATION_GOVERNANCE.md`, `SCOPED_COMMAND_INDEX.md`.
- Registers: `10-MASTER-APPLICATION-ROADMAP.md`, `14-IMPLEMENTATION-DECISION-REGISTER.md` (`IMP-O006` open, owner APP4).
- `docs/design/FIGMA_DESIGN_INDEX.md` — audited for APP4 rows.

### B.3 APP0–APP3 modules and packages

Reusable and **not** to be duplicated: `apps/api/src/platform/{request-context,audit-context,logging,http-response,validation}`; `modules/identity` (Admin auth); `modules/audit`; `modules/asset` (idempotency and intake precedent); `packages/persistence/src/platform/{worker-job-queue.repository.ts,background-job-attempt-store.ts,policy-configuration.repository.ts}`; `apps/worker/src/runtime/{registry,retry,poll,execution,policy}`; `modules/design/infrastructure/crypto/design-session-secret.{issuer,verifier}.ts` (opaque-secret pattern); `tools/check-report-secrets.mjs`.

### B.4 DB7 application handoff discovered

| Concern | Table(s) | Repository port | Module | Application support today |
|---|---|---|---|---|
| Customer identity | `customers`, `customer_contact_points`, `business_profiles` | `CUSTOMER_REPOSITORY` | `CustomerModule` | none |
| Verification | `contact_verification_challenges`, `contact_verification_attempts` | `VERIFICATION_CHALLENGE_REPOSITORY` | `CustomerModule` | none |
| Secure access | `secure_access_grants` | `SECURE_ACCESS_GRANT_REPOSITORY` | `CustomerModule` | none |
| Notification | `notification_intents`, `notification_delivery_attempts` | `NOTIFICATION_INTENT_REPOSITORY` | `NotificationModule` | none |
| Custom Request (APP5) | `custom_requests` + children | `CUSTOM_REQUEST_REPOSITORY` | `OrderModule` | none — APP5 owns it |

**Neither `CustomerModule` nor `NotificationModule` is imported by
`apps/api/src/bootstrap/app.module.ts`.** Both are reachable today only from
integration tests and DB9 benchmarks. Composition is an explicit deliverable of
`APP4-B01` and `APP4-B02`, not an assumed side effect.

---

## C. Authority findings

### C.1 Reusable existing capabilities

The persistence layer for all four APP4 bounded contexts is **complete**,
including the guards APP4 depends on: `resolveActive` is already written to
return nothing rather than disclose which check failed; `createIdempotent`
already collapses a duplicate intent key to a `replay` outcome; the notification
schema already excludes secrets structurally. The worker runtime, outbox
producer, Admin authorization, audit writer, request context, idempotency store
and policy-configuration store all exist and are reused unchanged.

APP4 therefore adds **application, HTTP, worker-handler and UI layers only**.

### C.2 Confirmed gaps

| Gap | Consequence for APP4 |
|---|---|
| No application layer over any of the four contexts | The bulk of the phase |
| `CustomerModule` / `NotificationModule` not composed | Named in `APP4-B01` / `APP4-B02` |
| No policy-configuration keys for challenge TTL, attempt limits, resend cooldown, `grant.standard`, `grant.step-up-window`, notification retry bound | Locked in `APP4-G01`; ADR-DB3-004 defers these as config with acceptance "configured before the secure-flow feature ships" |
| No contact normalization, masking or opaque-code/token issuer in code | `APP4-P01` |
| No notification channel port, no adapter, no worker handler | `APP4-B01` / `APP4-W01` |
| No customer verification, secure-link or Admin support UI — in code **or** in Figma | `APP4-D01` then `APP4-S01`/`APP4-S02`/`APP4-A01` |
| No storefront route slug for verification or secure link | Locked in `APP4-G01` |

### C.3 Structural findings that changed the slicing

1. **A public customer create/update contract contradicts a locked ADR.**
   `customers.verified_at` is `NOT NULL`; the DB7 port has no
   "create an unverified customer" method by construction; ADR-DB2-001 Option A
   states the customer exists only at successful verification. Candidate
   `APP4-C01` is **deleted**; customer creation is a side effect of `APP4-B04`.

2. **A secure grant cannot exist without an APP5 Custom Request.**
   `secure_access_grants.custom_request_id` is `NOT NULL` with FK `RESTRICT` →
   `custom_requests` (REL-010), and ADR-DB3-004 r1 binds a grant to exactly one
   `(Customer, Request)`. Nothing in the application layer can author that row.
   Resolved **without a schema change**: grant issuance ships as an internal port
   consumed by APP5 (`APP4-B05`), APP4's public grant surface is resolution
   (`APP4-B06`) and Admin revocation (`APP4-B07`), and tests seed the request
   through the existing DB7 `order-fixture`. Making the column nullable was
   considered and rejected as reopening a locked ADR.

3. **`scope_kind` is the single closed value `REQUEST_ACCESS`.** The
   action-scope set in ADR-DB3-004 r1 is not carried by the column, and the
   schema records that multi-scope arrives additively as a child table. APP4's
   "scope binding" therefore means target binding + purpose binding + the
   step-up window; action-scope enumeration is an APP6/APP7 handoff, recorded
   rather than built.

4. **Two claim paths exist for notification work.** DB7 built
   `NotificationIntentRepository.claimBatch`; `IMP-D029` later made
   `outbox_events` the queue, and `worker-job-queue.repository.ts` already
   records the same supersession for the DB7 `OutboxEventStore`. Resolved at
   authority level 3 (established repository pattern): the APP4 worker claims
   outbox events; `claimBatch` gets no production caller, asserted by the
   `APP4-G01` gate.

5. **No standalone contract checkpoints.** APP2 and APP3 publish the OpenAPI
   contract *with* the implementing backend checkpoint plus a
   `check-*-contract.mjs` gate. Candidates `C02`, `C03` and `C04` are folded
   accordingly, which removes three checkpoints without weakening review.

### C.4 Contradictions

**None unresolved.** The one apparent contradiction — candidate `APP4-C01`
versus ADR-DB2-001 — was resolved by the documented precedence order (a locked
database ADR outranks a candidate slice in a phase brief that itself declares
those slices non-binding), and the resolution is recorded rather than applied
silently. Stop condition 3 was not met.

---

## D. Design audit verdict

**`NEW`.**

Evidence: `docs/design/FIGMA_DESIGN_INDEX.md` was read and searched for every
APP4 surface. It contains **zero** rows for contact verification, code entry,
resend/lockout/expired states, secure-link landing (valid or rejected), Admin
customer/verification support, or Admin notification operations. The newest rows
are `APP_03` Studio and Admin Template frames. No APP1/APP2/APP3 row is
reusable: APP4 introduces the first customer-facing transactional flow in the
Storefront (which today holds only `/kham-pha`, `/san-pham/[slug]`,
`/san-pham/[slug]/thiet-ke`) and a support surface with no precedent in the
Admin shell (`assets`, `products`, `design-templates`).

**Design-package checkpoint: `APP4-D01`** — one complete phase package covering
all APP4 screens, states and viewports, updating `FIGMA_DESIGN_INDEX.md` in the
same checkpoint, gated by `node tools/check-figma-design-index.mjs`, and
preceding `APP4-S01`, `APP4-S02` and `APP4-A01`. It depends on `APP4-G01`
because the route slugs it documents must be locked first. **No design was
drawn in P00.**

---

## E. Final APP4 checkpoint manifest

Full per-checkpoint detail (purpose, exact scope, out-of-scope, code areas,
prerequisites, verification strategy, acceptance criteria, stop conditions) is
in [`audits/APP4_PHASE_ENTRY_AUDIT.md`](../audits/APP4_PHASE_ENTRY_AUDIT.md) §F.
Summary:

| # | ID | Title | Owner | Endpoints | Prereqs | Design |
|---|---|---|---|---|---|---|
| 1 | `APP4-G01` | Secure-access, verification and notification authority | cross-cutting | 0 | — | `NONE` |
| 2 | `APP4-D01` | APP4 phase design package | design | 0 | G01 | `NEW` |
| 3 | `APP4-P01` | Normalization, masking, opaque-secret primitives | CTX-CUS domain | 0 | G01 | `NONE` |
| 4 | `APP4-B01` | Notification intent intake | CTX-NTF | 0 | P01 | `NONE` |
| 5 | `APP4-W01` | Notification delivery worker | worker | 0 | B01 | `NONE` |
| 6 | `APP4-B02` | Customer/contact application core | CTX-CUS | 0 | P01 | `NONE` |
| 7 | `APP4-B03` | Verification challenge issue + resend | CTX-CUS public | **2** | B01, P01, G01 | `NONE` |
| 8 | `APP4-B04` | Verification submit + status | CTX-CUS public | **2** | B03, B02 | `NONE` |
| 9 | `APP4-B05` | Grant issuance, reissue, revocation, step-up window | CTX-CUS internal | 0 | B04, P01 | `NONE` |
| 10 | `APP4-B06` | Public secure-link resolution | CTX-CUS public | **1** | B05, G01 | `NONE` |
| 11 | `APP4-B07` | Admin customer/verification/grant support | CTX-CUS admin | **3** | B05, B02 | `NONE` |
| 12 | `APP4-B08` | Admin notification delivery operations | CTX-NTF admin | **2** | W01 | `NONE` |
| 13 | `APP4-S01` | Storefront verification screen | storefront | 0 | D01, B04 | D01 |
| 14 | `APP4-S02` | Storefront secure-link landing | storefront | 0 | D01, B06 | D01 |
| 15 | `APP4-A01` | Admin verification & delivery support screen | admin | 0 | D01, B07, B08 | D01 |
| 16 | `APP4-E01` | Secure contact cross-layer acceptance | cross-layer | 0 | all above | `NONE` |
| 17 | `APP4-X01` | Phase closure | governance | 0 | E01 | `NONE` |

**Endpoint total: 10.** Maximum per checkpoint: **3** (`APP4-B07`), against a
cap of 5. Identity (`B02`), verification (`B03`/`B04`), secure access
(`B05`/`B06`) and notification (`B01`/`W01`) remain in separate checkpoints and
separate modules.

Dependency graph: audit §F.1.

`APP4-E01` scope — the eight things it must prove, and the explicit exclusion of
every APP5/APP6/APP7 business action (the `custom_requests` row is fixture
scaffolding, not a submission) — is defined in audit §G.

---

## F. Security invariant ownership matrix

All fourteen required invariants have a named owning checkpoint and a named
proof. Full matrix: audit §H. Summary of owners:

| Invariant | Owner |
|---|---|
| Opaque verification codes | `P01`, `B03` |
| Opaque secure-link tokens | `P01`, `B05` |
| No plaintext token/code logging | `G01`, `B03`, `B06`, `W01` |
| Expiry | `G01`, `B04`, `B06` |
| Attempt / rate limiting | `B03`, `B04` |
| Replay / consumption | `B04`, `B06` |
| Revocation | `B05`, `B07` |
| Target binding | `B05`, `B06` |
| Purpose binding | `B03`, `B04`, `B06` |
| Scope binding | `B05`, `B06` |
| Non-enumerating public errors | `G01`, `B06`, `S02` |
| Idempotent notification processing | `B01`, `W01` |
| Bounded retry | `W01` |
| Terminal failure observability | `W01`, `B08` |

---

## G. TRUE_PO_DECISION ledger

**Empty.**

### `APP4-PO-001` — Notification channel and provider (`IMP-O006`) — **`PO_ACCEPTED / NON_BLOCKING`**

The Product Owner accepted the recommended option at `APP4-P00-C1`. This is no
longer an unresolved APP4 decision and no APP4 checkpoint awaits it.

- **Accepted decision:** APP4 selects **no external provider**; it ships the
  provider-neutral `NotificationChannelPort` plus a recording development
  adapter that performs no external call.
- **What remains recorded:** `IMP-O006` keeps its existing production due
  condition — "before production notification delivery" — which APP4 does not
  perform. The first work that cannot proceed without a concrete provider is
  production notification delivery in **APP12**. That is a future-phase
  follow-up against a future due condition, not an open APP4 item.
- **Interaction with `P00-C1`:** the encrypted delivery envelope is
  provider-neutral by construction — it terminates at `NotificationChannelPort`.
  Choosing a provider later changes the adapter behind the port and nothing
  about the carrier, the key authority or the secret-lifetime rules.

No other candidate met the four-level test. Policy durations, attempt limits,
resend cooldowns, route slugs and the envelope-key configuration shape are all
resolvable at level 4 — conservative, reversible and scope-minimizing — and are
locked in `APP4-G01`, where a wrong value is corrected by appending a
policy-configuration version rather than by changing code. No production key
value is invented or committed.

---

## H. Validation ledger

P00 changed Markdown planning documents only. Validation was scoped to exactly
that, per `VALIDATION_GOVERNANCE.md` §3.

| # | Command | Why necessary | Result |
|---|---|---|---|
| 1 | `pnpm exec prettier --check docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md docs/implementation/reports/APP4-P00-COMPLETION-REPORT.md docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | The repository enforces Prettier repository-wide; these three files are the entire change set | **PASS** — `Checking formatting... All matched files use Prettier code style!` |
| 2 | `node tools/check-report-secrets.mjs` | This checkpoint adds a committed completion report; the gate exists precisely because a report once recorded a live credential | **PASS** — `Secret-disclosure check passed (445 document(s), 2686 tracked file(s)).` |
| 3 | `pnpm exec prettier --check` over the three files changed by `APP4-P00-C1` | Same reason as row 1; the correction edited all three files after row 1 ran, so row 1 no longer covered them | see §H.2 |
| 4 | `node tools/check-report-secrets.mjs` (second run) | **Required by the correction.** The audit and report now discuss secret transport, envelope contents and a key configuration name at length — exactly the shape this gate exists to police — and both files changed after run 2 | see §H.2 |
| 5 | `pnpm exec prettier --check` over the files changed by the mandatory closure | Repository-wide Prettier enforcement; the closure edited the audit and this report after run 3 | see §H.4 |
| 6 | `node tools/check-report-secrets.mjs` (third run) | **Required by the directive.** The closure adds a full section on encrypted envelope copying and replay; both covered files changed after run 4 | see §H.4 |
| 7 | `git diff --check` | Required by the directive; catches whitespace errors and conflict markers in the staged Markdown | see §H.4 |

**Not run, and why:** no unit, integration, E2E, API, worker or frontend suite;
no repository typecheck; no OpenAPI generation or `check:api-client`; no DB
manifest or migration check; no global chain. P00 modified no source file, no
schema, no contract and no generated artifact, so none of those validations has
any change to react to. **No full regression was executed.** No successful
command was rerun.

### H.1 Note (P00)

Command 1 was re-run once against this report alone after its results were
written back into §H — a new change to a changed file, not a repeat of a
successful command. Command 2 scans the whole documentation set by design and
was run once.

### H.2 Note (P00-C1)

`APP4-P00-C1` changed documentation only: the audit, this report and the APP4
roadmap row. Rows 3 and 4 each ran **once**, after the correction's final edit,
so each covers the committed content. Neither is a repeat of a successful run —
every file both commands cover changed after runs 1 and 2. Results are recorded
in §H.3.

**Not run for the correction, and why:** no unit, integration, E2E, API, worker
or frontend suite; no typecheck; no OpenAPI generation or generated-client
check; no DB manifest or migration check; no global chain. The correction
changed no source, schema, contract or generated artifact, so none of those has
anything to react to. **No validation chain was restarted.**

### H.3 Recorded results (P00-C1)

| # | Result |
|---|---|
| 3 | **PASS** — `Checking formatting... All matched files use Prettier code style!` |
| 4 | **PASS** — `Secret-disclosure check passed (447 document(s), 2688 tracked file(s)).` The count rose from 445/2686 because P00 committed two new documents. |

### H.4 Note and results (mandatory closure)

The closure changed documentation only: the audit and this report. Rows 5–7 each
ran **once**, after the closure's final edit. None repeats a successful run —
every file rows 5 and 6 cover changed after rows 3 and 4.

| # | Result |
|---|---|
| 5 | **PASS** — `Checking formatting... All matched files use Prettier code style!` |
| 6 | **PASS** — `Secret-disclosure check passed (447 document(s), 2688 tracked file(s)).` |
| 7 | **PASS** — no output; no whitespace error or conflict marker. |

**Not run for the closure, and why:** no unit, API, worker, database-integration
or E2E test; no typecheck; no build; no OpenAPI or API-client generation or
check; no DB manifest; no Figma check; no `pnpm quality`; no repository-wide
chain. The closure changed no source, schema, contract, generated artifact or
design registry entry, so none has anything to react to. **No chain was
restarted.** The roadmap row was updated for verdict consistency and is covered
by rows 5 and 7; the repository has no roadmap-specific consistency checker that
a status-row edit would trigger (`tools/check-app2-closure.mjs` and
`tools/check-app3-closure.mjs` are phase-closure gates for APP2/APP3, not APP4
planning documents).

---

## I. Files changed

| File | Change |
|---|---|
**P00:**

| File | Change |
|---|---|
| `docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md` | **new** — authoritative APP4 reconciliation and 17-checkpoint execution manifest |
| `docs/implementation/reports/APP4-P00-COMPLETION-REPORT.md` | **new** — this report |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP4 status row split out of the `APP4–APP12` block, with evidence links |

**P00-C1:**

| File | Change |
|---|---|
| `docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md` | Verdict `PASS`; new §C.7 (contradiction, both rulings, authority clearance); `APP4-G01`/`B01`/`W01`/`B03`/`B05`/`B06`/`S02` scope and verification corrected; §F.1 two dependency edges; §G items 1/4/5 restated and 9/10 added; §H invariants 3a–3d and 13a added; §J `PO_ACCEPTED / NON_BLOCKING` |
| `docs/implementation/reports/APP4-P00-COMPLETION-REPORT.md` | Verdict `PASS`; §G ledger emptied; new §M; §H rows 3–4 and §H.2–H.3 |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP4 status row → `AUDITED — PASS`, correction summarized |

**Mandatory closure:**

| File | Change |
|---|---|
| `docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md` | Verdict `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`; new §C.8 (residual defect, three contracts, replay transaction, DB3 lifecycle realignment, non-secret linkage, eligibility, duplicate safety, shared package, four stop-condition clearances); `APP4-G01` items 11–16; `APP4-B01`, `APP4-W01`, `APP4-B08` scope/code-areas/verification; §F.1 note; §G items 11–18; §H invariants 14a–14f |
| `docs/implementation/reports/APP4-P00-COMPLETION-REPORT.md` | Verdict and history; new §N; §H rows 5–7 and §H.4; §I; §J commit table and final state; §K.2 |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP4 status row → `AUDITED — PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`, closure summarized |

No runtime source, schema, migration, OpenAPI document, generated client,
worker, package manifest or UI file was touched by P00, P00-C1 or the closure.
`packages/notification-delivery` is **planned**, not created.

---

## J. Git status and commits

Planning checkpoints are committed in this repository (APP2/APP3 precedent:
`docs(app3): …`). All commits are on `production`, all Markdown-only.

| Stage | Commit | Subject |
|---|---|---|
| P00 (initial) | `2044a31ec9f408ab80ffd1eb363acb07afce4d63` | `docs(app4): reconcile APP4 phase entry and lock the execution manifest` |
| P00 (evidence) | `108e488e3090bcacab27bfd2a2d73798393a93ce` | `docs(app4): record APP4-P00 commit evidence` |
| **P00-C1** | `096806c86c12cf7dae83e1f50c6c9d35bf7e9acd` | `docs(app4): correct APP4 secret-delivery and secure-link transport` |
| **Mandatory closure** | `445a936b10dd49f2a77c5ef46b84b1fad66d19dd` | `docs(app4): close APP4-P00 with dead-letter replay and shared envelope authority` |
| Closure evidence | final HEAD, §J.1 | `docs(app4): record APP4-P00 closure commit evidence` |

Parent of the first commit: `aa577f3e6e7da31a7acb42de12219b84f86b7708`
(`docs(app3): record phase closure evidence`).

A commit cannot contain its own hash, so the closure commit's hash is written by
the one-line evidence commit that follows it — the same two-step the initial P00
used. The regress terminates at the evidence commit, whose hash is the final
HEAD recorded below.

### J.1 Final state

| Item | Value |
|---|---|
| Final HEAD | the closure-evidence commit — the tip of `production` after this report was written back; its parent is `445a936b10dd49f2a77c5ef46b84b1fad66d19dd` |
| Branch | `production` |
| Working tree | clean |
| Pushed | **no** — nothing was pushed at any stage |

---

## K. Acceptance against the P00 criteria

| Criterion | Status |
|---|---|
| Candidate slices reconciled against the real APP0–APP3/DB7 baseline | Met — audit §B, §E |
| Identity, verification, secure access and notification separately bounded | Met — `B02` / `B03`+`B04` / `B05`+`B06` / `B01`+`W01`, in two modules |
| Every backend HTTP checkpoint ≤5 endpoints, preferably 1–3 | Met — max 3, total 10 |
| Required UI design represented as one phase design package | Met — `APP4-D01`, verdict `NEW` |
| Provider choice isolated, no provider invented | Met — port + recording adapter; `IMP-O006` left open, routed as `APP4-PO-001` |
| Security invariant ownership explicit | Met — audit §H, 14/14 owned |
| `APP4-E01` scope defined without APP5/APP6/APP7 actions | Met — audit §G |
| Genuine authority gaps routed to a specific checkpoint | Met — policy values → `APP4-G01`; provider → `APP4-PO-001` / APP12 |
| No runtime implementation performed | Met |
| Validation strictly change-impact-based | Met — §H |
| No full regression executed | Met |
| No successful command repeated | Met |

Stop conditions 1–5 were each evaluated; **none was met**.

### K.1 `APP4-P00-C1` acceptance

| Criterion | Status |
|---|---|
| Asynchronous OTP delivery possible without persisting plaintext code | Met — §M.2; envelope on the transient outbox row, hash only in the challenge |
| Asynchronous secure-link delivery possible without persisting plaintext token | Met — §M.2; `APP4-B05` enqueues the raw token only inside the envelope |
| Outbox remains the only worker queue | Met — no queue added; `claimBatch` still has no production caller |
| Notification intent/attempt persistence remains secret-free | Met — §M.5.1; the envelope never enters `params` |
| Retries deliver the same secret without regenerating business state | Met — invariant 13a; E01 item 9 |
| Verification resend semantically distinct from transport retry | Met — `APP4-G01` item 11; `APP4-B03`; E01 item 10 |
| Secure-link browser transport concrete and executable | Met — audit §F `APP4-S02`, five ordered steps |
| Token never in server-visible path or query | Met — invariant 3c; `APP4-B06` gate asserts no token path/query parameter |
| Fragment stripped before analytics or unrelated client activity | Met — invariant 3d |
| API receives the token only in the POST body | Met — `APP4-B06` |
| No new schema, migration, queue or provider | Met — §M.5.3 |
| `APP4-PO-001` accepted and non-blocking | Met — §G |
| Report verdict `PASS` | Met — §A |
| Validation change-impact-only | Met — §H rows 3–4, §H.2 |

Correction stop conditions 1–4 were each checked against the repository;
**none was met** (§M.2, audit §C.7.3).

### K.2 Mandatory-closure acceptance

| Criterion | Status |
|---|---|
| 1. `DEAD_LETTER` never reset to `PENDING`, automatically or manually | Met — §N.4; invariant 14a; B08 gate asserts no `UPDATE` on `outbox_events` |
| 2. Admin retry creates a new outbox event | Met — §N.3 step 6 |
| 3. New event copies the same envelope without decrypting | Met — §N.3 step 5; invariant 14b; byte-identical ciphertext proves a copy |
| 4. Old terminal row unchanged as evidence | Met — §N.3 step 8; E01 item 14 compares every column |
| 5. New row has fresh identity and attempt lifecycle | Met — §N.4; new `job_key` → attempts restart at 1 without a CST-049 collision |
| 6. Lifecycle move + new event append are atomic | Met — §N.3, one transaction |
| 7. Duplicate/concurrent retries produce one replay event | Met — §N.7; invariant 14d; E01 item 16 |
| 8. Server-queryable non-secret outbox↔intent linkage using existing fields | Met — §N.5; `aggregate_kind`/`aggregate_id`; invariant 14c |
| 9. No ciphertext JSON query needed | Met — §N.5; ADR-DB4-004 rule 5 honoured |
| 10. Replay refused when the source challenge/grant is invalid | Met — §N.6; invariant 14e; E01 item 17 |
| 11. Refusal routes to business resend/reissue, not reconstruction | Met — §N.6; `REISSUE_REQUIRED` → `APP4-B03`/`APP4-B05` |
| 12. Automatic retry, Admin replay and business resend/reissue are three distinct contracts | Met — §N.6 table; locked at `APP4-G01` item 11 |
| 13. One shared envelope codec across API and worker | Met — §N.8; invariant 14f |
| 14. No API↔worker cross-import | Met — §N.8; B01 gate asserts the package declares no `apps/*` dependency |
| 15. No third-party crypto dependency | Met — §N.8; `node:crypto` only |
| 16. No schema, migration, new queue, escrow or provider | Met — §N.10 |
| 17. P00-C1 exact commit hash present | Met — §J, `096806c86c12cf7dae83e1f50c6c9d35bf7e9acd` |
| 18. Mandatory-closure exact commit hash present | Met — §J, with final HEAD at §J.1 |
| 19. Final verdict `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE` | Met — §A |
| 20. Validation documentation-scope only | Met — §H rows 5–7, §H.4 |

Closure stop conditions 1–4 were each checked against the repository;
**none was met** (§N.9, audit §C.8.9). One prescribed step met locked DB3
authority and was realigned rather than applied silently or used as a stop
(§N.4).

---

## L. Recommended next checkpoint

**`APP4-G01` — Secure-access, verification and notification authority.**

It is safe to start now because the reconciliation above proves nothing it
depends on is missing: every table and repository it configures is delivered,
the policy-configuration store exists and holds no APP4 keys, and the two
rulings it records — the grant↔request dependency and the outbox-versus-intent
queue — are derived from delivered code rather than proposed by it. `APP4-P00-C1`
strengthens rather than changes this: the correction adds five authority items to
`APP4-G01` (§M.6) that must be settled before any envelope is written or any
fragment bootstrap is coded. It writes no runtime code, so it cannot destabilize
the closed APP3 baseline, and it supplies every value that `APP4-P01` through
`APP4-W01` would otherwise be forced to invent inside an implementation
checkpoint.

`APP4-D01` may begin in parallel as soon as `APP4-G01` has locked the route
slugs.

---

## M. `P00-C1` — Secret delivery transport reconciliation

The single allowed correction for `APP4-P00`. It corrects the **authority
model**, not the runtime: no crypto, worker, API, UI, schema, migration or
provider code was written.

### M.1 The contradiction found

Product Owner review identified two coupled contradictions in the first draft.

**Contradiction 1 — asynchronous notification had no secret carrier.** The
manifest simultaneously required: `APP4-B03` mints a raw code; only `code_hash`
is persisted; `notification_intents.params` is structurally secret-free;
delivery happens **later, in another process**, by the outbox-driven worker; and
`APP4-E01` proves the real code reaches the recording adapter. Those cannot all
hold — a CSPRNG secret persisted only as a hash and excluded from the only
record the worker reads is unreconstructable by that worker. The identical
defect applied to the secure-link token in `APP4-B05`.

**Contradiction 2 — a clickable secure link had no browser transport.**
`APP4-B06` said the token is "never in a URL" while `APP4-S02` read it "from the
link". A link the customer clicks must carry the token somehow; the absolute
rule made the phase's critical journey undeliverable.

### M.2 Adopted architecture — encrypted transient delivery envelope

Audit §C.7.2. The raw secret travels to the worker inside a versioned,
authenticated, encrypted envelope carried by the **existing** outbox event
payload. The issuer mints the plaintext once, persists only the hash, creates a
secret-free intent, and seals the plaintext into the envelope written to
`outbox_events.payload` **in the same transaction as the business write**. The
worker decrypts only after claiming the job and holds plaintext in memory only
until `NotificationChannelPort` returns. A transport retry re-sends the same
envelope; a business resend is a separate verification operation that mints a
new challenge.

Authority clearance — all four stop conditions checked, **none met** (audit
§C.7.3):

| Checked | Finding |
|---|---|
| Outbox payload contract forbids encrypted opaque material? | **No.** ADR-DB4-004 rule 4 scopes redaction-by-construction to columns 6 and 8 only — `payment_provider_events.redacted_payload` and `notification_intents.params` — **not** column 4, `outbox_events.payload`. Rule 5 (payloads read whole, never queried by field) suits ciphertext natively; rule 6's "small by construction" is satisfied. |
| Worker runtime needs a schema change? | **No.** `outbox_events` already pairs `payload` with `payload_schema_version`, and the repository already versions payloads per event type (`ASSET_INSPECTION_PAYLOAD_VERSION`, `ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION`, `PRODUCT_PUBLICATION_PAYLOAD_VERSION`). Rule 8 already assigns payload-format migration to versioned consumers. |
| A locked ADR forbids client-side URL fragments? | **No.** `09-SECURITY` §9 does say "never placed in a URL, query, fragment, …", but that sentence is scoped explicitly to the **anonymous Design Session credential** (`APP3-G03` / IMP-D043), a cookie-borne credential with its own transport ruling. It governs no other secret. Recorded because it reads as absolute out of context. §2 requires only that secure links be unguessable and revocable/expiring — both preserved. |
| An existing crypto/key authority conflicts? | **No.** The established convention is a runtime **HMAC pepper** for hashing (`DESIGN_SESSION_SECRET_PEPPER`: env var, empty in `.env.example`, minimum length, fail-closed at config load). It is a hashing pepper, not an AEAD key; reusing it would violate the ruling's separation requirement. Its *shape* is reused; the key is separate. |

No AEAD primitive exists anywhere in the repository (no `createCipheriv`, no
`aes-256-gcm`, no wrapper), so ruling item 6 applies: a **narrow APP4
abstraction over `node:crypto` (AES-256-GCM)**. **No third-party crypto package.**

The transaction pattern that makes the enqueue recoverable already exists and is
cited rather than invented: `apps/api/src/modules/asset/application/upload-transactions.service.ts`
performs the business write and `outbox.append` inside one
`transactions.runInTransaction(...)`. **There is no dual-write.**

### M.3 Adopted architecture — URL-fragment secure link

Audit §C.7.4. The link takes the form
`https://<storefront>/<secure-link-route>#t=<opaque-token>` (slug still an
`APP4-G01` item). A fragment is never transmitted to the origin, so no
Storefront server log and no Nginx access log can hold the token. `APP4-S02`
reads it locally, strips it with `history.replaceState` **before** any analytics
or third-party activity, holds it in one ephemeral variable, `POST`s it in the
request **body**, and discards it. It is never written to Zustand, TanStack
Query cache data, `localStorage`, `sessionStorage`, cookies, persisted state,
analytics or logs.

The inaccurate absolute rule is replaced by the precise four-part rule: never in
a server-visible path or query; never in server/proxy access logs; allowed only
in the client-side fragment of the outbound link; removed immediately at
bootstrap. **No token-bearing query parameter or path segment is introduced.**

### M.4 Affected manifest sections

| Section | Change |
|---|---|
| Audit §A, header | Verdict `PASS`; `[C1]` marker convention |
| Audit §C.6 | Notes the review-found contradiction, routed to §C.7 |
| Audit §C.7 (new) | The contradiction, both rulings, and the four-part authority clearance |
| Audit §F `APP4-G01` | Adds five authority items (7–11): envelope format/version, key configuration, secret-lifetime rules, fragment transport, retry-vs-resend; gate assertions extended |
| Audit §F `APP4-B01` | Owns the envelope shape and the AEAD abstraction; `params` restated as secret-free; prerequisite `APP4-G01` added |
| Audit §F `APP4-W01` | Decrypt-after-claim, same-envelope retry, no-plaintext-sink list, gate assertions extended |
| Audit §F `APP4-B03` | Four-step atomic issue path in one transaction, citing the existing pattern; resend restated as a business operation |
| Audit §F `APP4-B05` | Token returned once; raw token only inside the envelope; fragment message form; never in `params` |
| Audit §F `APP4-B06` | "Never in a URL" replaced by the precise rule; body-only intake; gate asserts no token path/query parameter |
| Audit §F `APP4-S02` | Explicit five-step fragment bootstrap and its browser-level assertions |
| Audit §F.1 | **Two dependency edges added** — `APP4-B03` and `APP4-B05` now depend on `APP4-B01` for the envelope format. No checkpoint added, removed, merged or re-scoped; no endpoint count changed. |
| Audit §G | E01 items 1, 4 and 5 restated; items 9 and 10 added (retry reuses the secret; resend is visibly different) |
| Audit §H | Invariants **3a, 3b, 3c, 3d, 13a** added; the original fourteen unchanged — 19 total, all owned |
| Audit §J | `APP4-PO-001` marked `PO_ACCEPTED / NON_BLOCKING`; ledger empty |
| Report §A, §G, §M | Verdict, ledger, this section |
| Roadmap APP4 row | Status `AUDITED — PASS`; correction summarized |

### M.5 Required confirmations

1. **The notification intent remains secret-free.** `notification_intents.params`
   carries redacted typed references only (`ChallengeId`, `GrantId`). The
   encrypted envelope is written to `outbox_events.payload` and **never** to
   `params`. ADR-DB2-003 rule 2 and ADR-DB4-004 rule 4 are honoured, not
   loosened — the correction relies on the fact that neither rule governs
   column 4.
2. **Plaintext is never persisted or logged.** It exists only in issuer memory,
   sealed inside envelope ciphertext, in worker memory after a successful claim,
   and in the one outbound message. It is barred from `notification_intents`,
   `notification_delivery_attempts`, `background_job_attempts`, audit rows,
   application logs, error messages and completion reports — with named owners
   and proofs at invariants 3a, 3b, 3c and 3d.
3. **No schema or migration was added.** `NO_APP4_MIGRATION` stands. No new
   column, no escrow table, no queue. The outbox remains the only worker queue,
   and `NotificationIntentRepository.claimBatch` still gets no production caller.
4. **`APP4-PO-001` is Product-Owner accepted and non-blocking** (§G). The
   TRUE_PO_DECISION ledger is empty and the report verdict is `PASS`.
5. **No runtime code was written.** No crypto, worker, API route, UI, schema,
   migration, OpenAPI document, generated client or provider adapter changed.
   `git show --stat` for both correction commits lists Markdown only.

### M.6 Next checkpoint after correction

**`APP4-G01`** — unchanged by the correction, and now carrying five additional
authority items (envelope format and version, envelope-key configuration,
secret-lifetime rules, fragment transport, retry-versus-resend). It remains the
right first checkpoint precisely because `P00-C1` added obligations that must be
settled *before* `APP4-B01` writes an envelope format or `APP4-S02` writes a
bootstrap.

### M.7 Validation run for the correction

See §H rows 3 and 4. Both are documentation-scope commands; no test, typecheck,
contract, generated-client or database validation was run, because the
correction changed no file any of them covers.

---

## N. P00 Mandatory Closure — Dead-letter manual replay and shared envelope authority

Prescriptive Product Owner directive, **not** a second correction. No
`APP4-P00-C2` identifier was created. Documentation and authority only.

### N.1 Residual defect found after C1

`P00-C1` closed **automatic** transport retry: the worker re-leases the same
outbox row and re-delivers the same sealed envelope. It left the **manual** path
incomplete. `APP4-B08` still said an operator could "retry a `FAILED` intent" by
"re-enqueueing through the outbox path" — which cannot happen as written.

### N.2 Why APP2 `DEAD_LETTER` authority made B08 incomplete

Under the locked APP2 job runtime (`IMP-D029`, `ADR-APP2-002`), automatic
terminal failure leaves the source outbox row in `DEAD_LETTER`. That status sits
outside IDX-088's claimable predicate, so **nothing ever claims it again**.
APP2 deliberately deferred manual replay to a later approved checkpoint, and
`APP4-B08` is that checkpoint — so APP4 had to define the contract and had not.

### N.3 Selected manual replay state machine

Audit §C.8.3. One transaction, for an authorized Admin replay:

1. lock/read the intent; require it terminal-failed;
2. resolve the terminal source outbox event via the **non-secret linkage**
   (§N.5) — never by querying ciphertext;
3. require that event's status to be `DEAD_LETTER`;
4. verify the underlying secret is still eligible (§N.6);
5. copy the envelope ciphertext and `payload_schema_version` **byte-identically**
   — **the API never decrypts**;
6. append **one** new `PENDING` outbox event with a new id and a fresh attempt
   counter;
7. create the **new `PENDING` notification intent** under a derived replay
   `intent_key`, linked to the origin (§N.4);
8. leave the old `DEAD_LETTER` row and the origin intent untouched;
9. audit the replay.

### N.4 Old-row / new-row identity semantics

**The `DEAD_LETTER` row is never reset, reactivated or mutated** — not by the
worker, not by Admin, not by an operator script. It is terminal evidence, its
attempt count already equals the automatic retry limit, and, decisively,
`job_key` **is the outbox event id**
(`worker-job-queue.repository.ts`: `jobKey: guard.outboxEventId.toString()`).
Reusing that identity would collide with CST-049
`uq_background_job_attempts__kind_key_attempt` and destroy the monotonicity of
`(job_kind, job_key, attempt_no)`. A new outbox row yields a new `job_key` and a
clean attempt sequence from 1.

**One prescribed step met locked authority and was realigned, not applied
silently.** The directive's step 8 called for transitioning the existing intent
`FAILED → PENDING/QUEUED`. `docs/database/DB3_NOTIFICATION_LIFECYCLE_SPEC.md` §1
declares `FAILED` terminal and enumerates six transitions with **no
`FAILED→PENDING`**, and §3 rule 2 is explicit and locked: *"manual resend =
**new intent** (audited), không reopen intent cũ."*

Stop condition 3 required **both** that no legal transition exists **and** that
no existing state can represent replay without a migration. The first half
holds; the second does not — a **new intent row in `PENDING`** represents it
exactly, needs no migration, and is the form DB3 itself prescribes. So this was
not a stop, and the realignment is reported here rather than made quietly
(CLAUDE.md §2).

It is also the only version that **functions**. The retry budget derives from
`countAttempts(intentId)` over `notification_delivery_attempts`, which is keyed
to the intent. A reopened intent would re-enter delivery already at or beyond
the bound and terminal-fail on its first attempt, so the replay would never
deliver. A new intent gets a clean budget. The directive's own §2.1 reasoning —
terminal evidence, unambiguous attempt monotonicity — applies identically one
level up.

Every acceptance item survives: old `DEAD_LETTER` row terminal and unchanged;
exactly one new `PENDING` outbox row; byte-identical ciphertext never decrypted;
lifecycle move and outbox append in one transaction; duplicates collapse to one
replay.

### N.5 Non-secret notification-intent linkage

The envelope is encrypted and ADR-DB4-004 rule 5 forbids querying JSONB
internals, so the delivery event needs a queryable, non-secret path back to its
intent. The outbox already has one — the REL-104 polymorphic reference:

```text
aggregate_kind = NOTIFICATION_INTENT
aggregate_id   = notification_intent.id
```

`aggregate_kind` carries **no CHECK**; the closed set is the application guard
`OUTBOX_AGGREGATE_KINDS` in `packages/persistence/src/platform/outbox-event-store.ts`,
enforced at write time (G-DB7-47). Extending it follows the exact precedent
APP2-B03 set when it added `PRODUCT`, whose in-source comment records the rule:
*"this list is the G-DB7-47 write-time guard, not a schema constraint — no
migration."* The store's own contract fits: the aggregate id's existence "is
guaranteed by the enclosing transaction, which also wrote the aggregate row",
and the intent is written in that transaction. `BACKGROUND_JOB_KINDS` already
contains `NOTIFICATION_DELIVERY`, so the worker side needs no constant change.

**No column added. No ciphertext ever queried.**

### N.6 Lifecycle eligibility rules

Transport replay copies an existing sealed secret, so it is allowed only while
that secret is usable. Refuse when the challenge is expired, completed,
invalidated, superseded or otherwise unanswerable; refuse when the grant is
expired, revoked, superseded or otherwise inactive. A refusal returns an
Admin-safe conflict with `REISSUE_REQUIRED` semantics and routes the operator to
the **business** path — `APP4-B03` resend for a new code, `APP4-B05` reissue for
a new token — never to secret reconstruction, which is impossible anyway since
only the hash is persisted.

Three contracts, locked as distinct terms at `APP4-G01`:

```text
automatic transport retry  = same outbox row  + same envelope
Admin manual replay        = new outbox row   + same envelope, while eligible
business resend / reissue  = new outbox row   + new secret + new envelope
```

### N.7 Duplicate Admin retry rule

Exactly one caller wins the guarded lifecycle move; the winner appends exactly
one new outbox row and one new intent. A losing or duplicate caller appends
nothing and receives the canonical current state rather than silently creating a
second delivery. No attempt counter is reset. Existing guarded-transition and
idempotency mechanisms are reused — **no new global idempotency framework**.

### N.8 Shared `packages/notification-delivery` ownership

`P00-C1` had placed the sealing abstraction under
`apps/api/src/modules/notification/infrastructure/crypto/`, but `APP4-W01` must
open the same format from `apps/worker` — which would force an app-to-app import
or a duplicated AES-GCM implementation and duplicated version constants. A
drifted envelope version is an undeliverable notification.

Ownership moves to **`@embroidery/notification-delivery`** at
`packages/notification-delivery`, owning **only** the envelope schema and type,
the version constant, the secret-kind discriminator, the `node:crypto`
AES-256-GCM seal/open implementation, the shared key parsing/validation helper,
and focused unit tests. It owns no notification persistence, worker runtime,
HTTP, provider SDK, template, repository, policy lookup or database access.
`apps/api` seals through it; `apps/worker` opens through it; **no app-to-app
import; no third-party crypto dependency.**

`REPOSITORY_STRUCTURE.md` permits and in fact requires this: packages are
created "only when real cross-application reuse exists" — two applications
sharing one wire format is exactly that — and "a new workspace package requires
a clear owner, purpose, and consumer list", all three stated above. Introduced
by `APP4-B01`, consumed unchanged by `APP4-W01`, boundary locked by `APP4-G01`.

### N.9 Closure stop conditions — all four checked, none met

| Checked | Finding |
|---|---|
| 1. `outbox_events` lacks a non-secret linkage to the intent? | **No.** `aggregate_kind` + `aggregate_id` (REL-104), no CHECK, application-guard set with a same-shape extension precedent. |
| 2. Schema prevents a second delivery event for the same intent? | **No.** Sequence primary key; apart from the status CHECK, `outbox_events` carries no uniqueness at all. |
| 3. No legal terminal→queued transition **and** no state can represent replay without a migration? | **Half met, so not met.** No `FAILED→PENDING` exists and DB3 §3 rule 2 forbids reopening — but a new intent in `PENDING` represents replay with no migration, and is what DB3 prescribes. Resolved in §N.4. |
| 4. Workspace governance forbids `packages/notification-delivery`? | **No.** It conditions a new package on real cross-application reuse plus owner/purpose/consumers; all satisfied. |

### N.10 Confirmations

- **No runtime, schema, migration or provider was implemented.** No
  `packages/notification-delivery` code, no AES-GCM runtime, no API or worker
  code, no B08 controller or service, no policy seed values, no `.env.example`
  edit, no OpenAPI, no generated client, no UI, no Figma, no schema, no
  migration, no new queue, no provider adapter.
- **`NO_APP4_MIGRATION` stands.** No column, index or CHECK changes. The one
  source-level change the closure anticipates —
  `OUTBOX_AGGREGATE_KINDS += 'NOTIFICATION_INTENT'` — is an application constant
  with an explicit no-migration precedent, and it is **planned in `APP4-B01`,
  not performed here**.
- **The outbox remains the only worker queue**; no escrow table;
  `NotificationIntentRepository.claimBatch` still has no production caller.
- **APP2 authority was not amended.** No historical APP2 document was edited and
  no `DEAD_LETTER` row was touched in any spike; no spike was run.
- **Checkpoint graph unchanged** — 17 checkpoints, 10 endpoints, no edge added
  or removed by the closure (audit §F.1).

### N.11 Sections changed by the closure

Audit: header and §A (verdict, history); new §C.8; `APP4-G01` items 11–16;
`APP4-B01` (shared package, linkage, code areas, gate); `APP4-W01` (shared
package, same-row retry, `DEAD_LETTER`); `APP4-B08` (full replay contract,
eligibility, `REISSUE_REQUIRED`, gate); §F.1 note; §G items 11–18; §H invariants
14a–14f (25 total). Report: §A, this §N, §H rows 5–6, §I, §J, §K.2.

---

`APP4-P00` is **closed**: `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`.

**`APP4-G01` runtime and configuration implementation has not begun**, and all
APP4 runtime implementation remains not started, pending Product Owner review of
this closed report.
