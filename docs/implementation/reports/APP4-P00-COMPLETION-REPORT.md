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

**`PASS_WITH_ROUTED_DECISIONS`**

APP4 was reconciled against the delivered APP0–APP3 and DB7 baseline. The
twelve candidate slices in the phase brief were re-sliced into **17 execution
checkpoints**. Four candidates did not survive contact with the baseline and
were deleted, folded or split for reasons recorded in the audit §E. One decision
is routed to the Product Owner and blocks no APP4 checkpoint.

Migration verdict: **`NO_APP4_MIGRATION`** — every APP4 invariant is expressible
against the delivered schema (audit §C.1).

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

One entry.

### `APP4-PO-001` — Notification channel and provider (`IMP-O006`)

- **Exact missing decision:** which concrete email/SMS provider and which
  delivery channels APP4 uses.
- **Why existing authority cannot resolve it:** `IMP-O006` is explicitly open
  with owner APP4; ADR-DB2-003 r4 and the phase brief both leave the provider
  unchosen; no repository pattern or ADR selects a vendor. It is material rather
  than cosmetic because the provider observes the OTP in transit.
- **Recommended option (the default this manifest adopts):** select **no**
  external provider in APP4. Ship `NotificationChannelPort` plus a recording
  development adapter that performs no external call. `IMP-O006` stays open with
  its existing due condition — "before production notification delivery" —
  which APP4 does not perform.
- **Alternatives:** (a) lock a provider now via a dedicated decision checkpoint
  and ADR — rejected as premature, since no APP4 exit-gate item requires real
  delivery and the choice is better made against APP12's production
  constraints; (b) a direct SMTP adapter — rejected as a provider choice wearing
  a protocol's name, routing the OTP through an unreviewed path.
- **Exact blocked future checkpoint:** **none in APP4.** The first blocked work
  is production notification delivery in **APP12**.

No other candidate met the four-level test. Policy durations, attempt limits,
resend cooldowns and route slugs are all resolvable at level 4 — conservative,
reversible and scope-minimizing — and are locked in `APP4-G01`, where a wrong
value is corrected by appending a policy-configuration version rather than by
changing code.

---

## H. Validation ledger

P00 changed Markdown planning documents only. Validation was scoped to exactly
that, per `VALIDATION_GOVERNANCE.md` §3.

| # | Command | Why necessary | Result |
|---|---|---|---|
| 1 | `pnpm exec prettier --check docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md docs/implementation/reports/APP4-P00-COMPLETION-REPORT.md docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | The repository enforces Prettier repository-wide; these three files are the entire change set | **PASS** — `Checking formatting... All matched files use Prettier code style!` |
| 2 | `node tools/check-report-secrets.mjs` | This checkpoint adds a committed completion report; the gate exists precisely because a report once recorded a live credential | **PASS** — `Secret-disclosure check passed (445 document(s), 2686 tracked file(s)).` |

**Not run, and why:** no unit, integration, E2E, API, worker or frontend suite;
no repository typecheck; no OpenAPI generation or `check:api-client`; no DB
manifest or migration check; no global chain. P00 modified no source file, no
schema, no contract and no generated artifact, so none of those validations has
any change to react to. **No full regression was executed.** No successful
command was rerun.

### H.1 Note

Command 1 was re-run once against this report alone after its results were
written back into §H — a new change to a changed file, not a repeat of a
successful command. Command 2 scans the whole documentation set by design and
was run once.

---

## I. Files changed

| File | Change |
|---|---|
| `docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md` | **new** — authoritative APP4 reconciliation and 17-checkpoint execution manifest |
| `docs/implementation/reports/APP4-P00-COMPLETION-REPORT.md` | **new** — this report |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP4 status row split out of the `APP4–APP12` block and set to `AUDITED — PASS_WITH_ROUTED_DECISIONS` with evidence links |

No runtime source, schema, migration, OpenAPI document, generated client,
worker or UI file was touched.

---

## J. Git status and commits

Planning checkpoints are committed in this repository (APP2/APP3 precedent:
`docs(app3): …`). This checkpoint produces one documentation commit on
`production`. **Nothing is pushed.**

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

---

## L. Recommended next checkpoint

**`APP4-G01` — Secure-access, verification and notification authority.**

It is safe to start now because the reconciliation above proves nothing it
depends on is missing: every table and repository it configures is delivered,
the policy-configuration store exists and holds no APP4 keys, and the two
rulings it records — the grant↔request dependency and the outbox-versus-intent
queue — are derived from delivered code rather than proposed by it. It writes no
runtime code, so it cannot destabilize the closed APP3 baseline, and it supplies
every value that `APP4-P01` through `APP4-W01` would otherwise be forced to
invent inside an implementation checkpoint.

`APP4-D01` may begin in parallel as soon as `APP4-G01` has locked the route
slugs.

**APP4-C01 and all runtime implementation remain not started, pending Product
Owner review of this report.**
