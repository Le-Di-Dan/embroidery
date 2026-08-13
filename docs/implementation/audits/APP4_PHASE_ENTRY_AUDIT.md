# APP4 — Phase entry authority, re-slicing and execution manifest

- Checkpoint: `APP4-P00`
- Phase brief: [`phases/APP4-CUSTOMER-IDENTITY-SECURE-ACCESS-NOTIFICATION.md`](../phases/APP4-CUSTOMER-IDENTITY-SECURE-ACCESS-NOTIFICATION.md)
- Entry HEAD: `aa577f3e6e7da31a7acb42de12219b84f86b7708` (branch `production`, clean)
- Entry state: APP0 `COMPLETE`, APP1 `COMPLETE — PASS_WITH_FOLLOW_UPS`,
  APP2 `COMPLETE`, APP3 `COMPLETE — PASS_WITH_FOLLOW_UPS` (closed at `APP3-X01`)
- Verdict: **`PASS_WITH_ROUTED_DECISIONS`**
- Scope of this checkpoint: planning and reconciliation only. No runtime code,
  no schema, no OpenAPI, no generated client, no worker, no UI.

---

## A. Executive verdict

APP4 is **unblocked at the persistence layer and blocked at nothing**, but four
of its twelve candidate checkpoints do not survive contact with the delivered
baseline. The phase is re-sliced from 12 candidate slices into **17 execution
checkpoints**, and the re-slice is driven by five findings, not by preference:

1. **DB7 already delivered every table, repository and Nest module APP4 needs.**
   `CustomerModule` and `NotificationModule` exist with Drizzle repositories for
   customer/contact, verification challenge/attempt, secure access grant and
   notification intent/attempt. APP4 adds **application, HTTP and worker layers
   only**. No APP4 migration is required — verdict `NO_APP4_MIGRATION`.
2. **Neither module is composed into `AppModule`.** Both are reachable today
   only from integration tests and DB9 benchmarks. Composition is a named
   checkpoint deliverable, not a side effect.
3. **A public "create customer" contract contradicts a locked ADR.** A
   `customers` row exists only from a *verified* contact (ADR-DB2-001 Option A;
   `verified_at` is `NOT NULL`; the repository has no
   "create an unverified customer" method by construction). Candidate `APP4-C01`
   / `APP4-B01` as written would have to invent one. Customer creation is
   therefore a **side effect of verification success**, never its own endpoint.
4. **A secure grant cannot exist without an APP5 Custom Request.**
   `secure_access_grants.custom_request_id` is `NOT NULL` with FK
   `RESTRICT` → `custom_requests` (REL-010), and ADR-DB3-004 r1 binds a grant to
   exactly one `(Customer, Request)` pair. Nothing in the application layer can
   author a `custom_requests` row. APP4 therefore delivers grant issuance as an
   **internal capability consumed by APP5**, and every APP4 test seeds the
   request through the existing DB7 repository fixture. **No schema change.**
5. **Figma carries zero rows for any APP4 surface.** Design classification is
   **`NEW`**, delivered as one package (`APP4-D01`) before any APP4 frontend
   checkpoint.

One decision is routed to the Product Owner (notification channel/provider,
`IMP-O006`) with a recommended default that blocks **no** APP4 checkpoint.

---

## B. Repository baseline inspected

### B.1 Authoritative documents read

| Document | Bearing on APP4 |
|---|---|
| `docs/adr/database/ADR-DB2-001-CUSTOMER-IDENTITY-MODEL.md` | Customer exists only at verification; no account/portal; normalization; no silent merge; grant ≠ identity |
| `docs/adr/database/ADR-DB2-003-NOTIFICATION-PERSISTENCE.md` | Intent + append-only attempt; no rendered body; structural secret exclusion; intent-key idempotency; provider behind a port |
| `docs/adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md` | One grant type; reusable within validity; expiry; step-up window; revocation triggers; reissue rotates the token; hashed-only storage; revoke-vs-use winner |
| `docs/adr/backend/ADR-APP2-002-ASYNCHRONOUS-JOB-RUNTIME.md` / `IMP-D029` | `outbox_events` **is** the queue; `background_job_attempts` is the ledger; no broker |
| `docs/adr/backend/ADR-APP1-001-STAFF-AUTHENTICATION-AND-SESSIONS.md` / `IMP-D027` | Admin authorization pattern reused verbatim for every APP4 Admin endpoint |
| `docs/implementation/04-BACKEND-API-DELIVERY-STANDARD.md` §"Maximum: five APIs" | Endpoint cap per backend checkpoint |
| `docs/implementation/03-DESIGN-DELIVERY-POLICY.md` | One whole-phase design package for `SUPPLEMENT`/`NEW` |
| `docs/implementation/VALIDATION_GOVERNANCE.md`, `SCOPED_COMMAND_INDEX.md` | Change-impact validation; no repository-wide aggregate |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-O006` — contact/notification providers, **owner APP4**, due "before production notification delivery" |
| `docs/design/FIGMA_DESIGN_INDEX.md` | Canonical registry; audited for APP4 rows |

### B.2 Delivered APP0–APP3 capability inventory

| APP4 need | Already delivered | Location | Application support today |
|---|---|---|---|
| Actor context / request ID | Yes | `apps/api/src/platform/request-context`, `audit-context`, `logging` (APP0-B02/B04/B05) | Complete — reuse |
| Admin authorization | Yes | `apps/api/src/modules/identity` (APP1-B01/B02) | Complete — reuse for every APP4 Admin endpoint |
| Customer + contact tables/repository | Yes | `packages/database/src/schema/customer/{customers,customer-contact-points,business-profiles}.ts`; `modules/customer/domain/repositories/customer.repository.ts` | **Persistence only** — no use case, no HTTP, module not composed |
| Verification challenge/attempt | Yes | `.../contact-verification-{challenges,attempts}.ts`; `verification-challenge.repository.ts` | **Persistence only** — no code issuance, no rate policy, no HTTP |
| Secure access grant | Yes | `.../secure-access-grants.ts`; `secure-access-grant.repository.ts` (`resolveActive` already non-disclosing) | **Persistence only** — no token issuance, no resolution surface |
| Notification intent/attempt | Yes | `.../notification-{intents,delivery-attempts}.ts`; `notification-intent.repository.ts` | **Persistence only** — no producer, no worker handler, no channel port |
| Worker claim / retry / lease / dead-letter | Yes | `packages/persistence/src/platform/worker-job-queue.repository.ts`; `apps/worker/src/runtime/{registry,retry,poll,execution}` (APP2-I02, APP2-W01, APP3-W01A) | Complete — APP4 registers a job kind, adds no runtime |
| Outbox producer | Yes | `packages/database/src/schema/platform/outbox-events.ts`; `OutboxEventStore`; APP3-G06 dispatch precedent | Complete — reuse |
| Opaque secret issue/verify pattern | Yes | `modules/design/infrastructure/crypto/design-session-secret.{issuer,verifier}.ts`; `modules/identity/infrastructure/crypto/session-token.service.ts` | Pattern only — APP4 needs its own peppered issuer/verifier pair |
| Audit event write | Yes | `modules/audit` | Complete — reuse |
| Policy configuration store | Yes | `packages/database/src/schema/platform/policy-configuration{,-version}s.ts`; `packages/persistence/src/platform/policy-configuration.repository.ts` | Store exists; **no APP4 keys or values seeded** |
| Idempotency records | Yes | `packages/database/src/schema/platform/idempotency-records.ts`; APP2-B01 two-stage precedent | Complete — reuse |
| Secret-disclosure gate | Yes | `tools/check-report-secrets.mjs` | Complete — reuse |
| Customer verification / secure-link / Admin support UI | **No** | — | **Absent in code and in Figma** |

### B.3 Custom Request seam (APP5 boundary)

`apps/api/src/modules/order/` holds the DB7 `CustomRequestRepository` port and
its Drizzle implementation, plus `tests/integration/order-fixture.ts`.
`OrderModule` is **not** composed into `AppModule` and no use case calls
`submit()`. That is correct: request submission is APP5. APP4 consumes the
repository **only from test fixtures**, so APP4 ships no APP5 business action.

---

## C. Authority findings

### C.1 `NO_APP4_MIGRATION` — no schema change is justified

Every APP4 invariant is expressible against the delivered schema:

| APP4 invariant | Existing database mechanism |
|---|---|
| One open challenge per (kind, value, purpose) | `uq_verification_challenges__kind_value_purpose__issued` (CST-007, partial on `ISSUED`) |
| One active grant per (customer, request) | `uq_secure_access_grants__customer_request__active` (CST-009, partial on `ACTIVE`) |
| Token uniqueness / no plaintext | `uq_secure_access_grants__token_hash` (CST-008); `code_hash` on challenges |
| Revoked grant must carry a reason | `ck_secure_access_grants__revoke_reason_required` |
| Attempt evidence is append-only | `contact_verification_attempts` (no `updated_at`), `notification_delivery_attempts` (no `updated_at`) |
| One intent per logical decision | `uq_notification_intents__intent_key` (CST-047) |
| Verified-contact uniqueness | `customer_contact_points` CST-005, partial on `verified_at IS NOT NULL AND deactivated_at IS NULL` |
| No unverified customer | `customers.verified_at NOT NULL` |
| Claimable queue | `ix_notification_intents__created_id__claimable`; `outbox_events` IDX-088 |

**No gap found. No migration proposed.**

### C.2 Grant ↔ Custom Request: a real dependency, resolved without schema change

`custom_request_id` is `NOT NULL` and FK-`RESTRICT` to an APP5 table.
Three options were weighed:

| Option | Verdict |
|---|---|
| Make `custom_request_id` nullable | **Rejected.** Reopens ADR-DB3-004 r1 (a grant is scoped to exactly one `(Customer, Request)`), destroys CST-009's meaning, and violates the architecture-preservation rule. |
| Pull APP5 request submission into APP4 | **Rejected.** Explicitly out of scope. |
| Ship grant issuance as an internal port; seed the request in fixtures | **Adopted.** Reversible, scope-minimizing, preserves both ADRs. |

**Ruling.** APP4 exposes **no** "issue grant" HTTP endpoint. `APP4-B05` delivers
a `SecureGrantIssuer` application service behind a port that APP5 calls at
submission. APP4's public surface over grants is **resolution** (`APP4-B06`) and
**Admin revocation/visibility** (`APP4-B07`). Tests and `APP4-E01` create the
prerequisite `custom_requests` row through the existing DB7 repository fixture,
which is test scaffolding, not a business action.

### C.3 `scope_kind` is a single closed value — "scope binding" means three things

`GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']`. ADR-DB3-004 r1 lists an action-scope
set (`view`, `accept-quotation`, `approve-design`, `initiate-payment`, …) that
the column deliberately does not carry; the schema comment records that a
multi-scope model arrives **additively as a child table**, not by widening this
column. Consequently, in APP4:

- **target binding** = `customer_id` + `custom_request_id` match, enforced by
  `resolveActive` (G-DB7-38/39);
- **purpose binding** = `scope_kind = 'REQUEST_ACCESS'` plus the challenge
  `purpose` (`SUBMISSION` | `STEP_UP`) on the verification side;
- **scope binding for consequential actions** = the **step-up window**
  (ADR-DB3-004 r4), whose mechanism APP4 builds (`hasRecentCompleted`) and whose
  *consumers* (quotation acceptance, design approval, payment initiation) are
  APP6/APP7 and are **not** wired here.

Action-scope enumeration is therefore **out of APP4 scope** and is recorded as a
handoff, not a gap.

### C.4 Two claim paths exist — the APP2 runtime wins

`NotificationIntentRepository.claimBatch()` is a DB7-era claim primitive over
`ix_notification_intents__created_id__claimable`. `IMP-D029` later established
that `outbox_events` **is** the queue and `background_job_attempts` the ledger;
`worker-job-queue.repository.ts` already records the same supersession for the
DB7 `OutboxEventStore` ("that store is the DB7-era producer/dispatcher primitive
… widening it would put two contradictory lifecycles in one class").

**Ruling (level 3 — established repository pattern).** The APP4 notification
worker claims **outbox events**, not intents. `claimBatch` is not used as a
queue; the intent's `PENDING → PROCESSING → SATISFIED/FAILED` transitions are
written by the handler under the outbox lease. Introducing a second, unregistered
queue outside the APP2 runtime is prohibited. `APP4-G01` records this and its
gate asserts `claimBatch` has no production caller.

### C.5 Policy values do not exist yet

ADR-DB3-004 defers expiry-class durations, the step-up window and attempt
limits/cooldowns to policy configuration (CON-144), with acceptance
"configured before the secure-flow feature ships". `policy_configurations` and
its version table exist and are empty of APP4 keys. Inventing these values
inside an implementation checkpoint is exactly what §5 of the charter forbids,
so they are locked in the authority gate `APP4-G01` with conservative,
config-reversible defaults (§F).

### C.6 Contradictions

**None found.** One apparent contradiction was checked and resolved by
precedence: the phase brief's candidate `APP4-C01` ("customer/contact
create/read/update operations") versus ADR-DB2-001 Option A. The ADR is higher
in the source-of-truth order and is a locked product/database decision; the
phase brief's candidate list is explicitly "planning slices, not an execution
batch" and explicitly requires re-slicing. Resolved by deleting the candidate,
not by reopening the ADR (§E).

---

## D. Design audit

### D.1 Verdict: **`NEW`**

`docs/design/FIGMA_DESIGN_INDEX.md` was read in full and searched for every APP4
surface. Result:

| APP4 surface | Registry rows |
|---|---|
| Contact entry / code verification / resend / expired / locked / success | **0** |
| Secure-link landing: valid, invalid, expired, revoked, replayed, wrong-purpose | **0** |
| Admin customer & verification support | **0** |
| Admin notification delivery ops | **0** |

The registry's newest rows are `APP_03` Studio and Admin Template frames
(`FIG-STUDIO-*`, file key `BQwqV8GdfUIELvsQDB1UQE`). No APP4 page, section,
frame or component exists, and no APP1/APP2/APP3 row is reusable: APP4
introduces a customer-facing transactional flow with no precedent in the
Storefront (which today carries only `/kham-pha`, `/san-pham/[slug]` and
`/san-pham/[slug]/thiet-ke`) and an Admin support surface with no precedent in
the Admin shell (which carries `assets`, `products`, `design-templates`).

### D.2 Consequence

One phase-level design package, **`APP4-D01`**, delivered whole and reviewed
once, before `APP4-S01`, `APP4-S02` and `APP4-A01`. It depends on `APP4-G01`
because the route slugs it documents must already be locked. No APP4 frontend
checkpoint may start while its registry entry is missing or not
`APPROVED_FOR_IMPLEMENTATION`. P00 draws nothing.

---

## E. Candidate-slice reconciliation

| Candidate | Disposition | Reason |
|---|---|---|
| `APP4-C01` Customer/contact contract | **Deleted** | A public customer create/update contract contradicts ADR-DB2-001 Option A. Customer creation is a side effect of verification (`APP4-B04`); Admin reads move to `APP4-B07`. |
| `APP4-B01` Customer/contact backend | **Renamed → `APP4-B02`**, narrowed | Keeps normalization/uniqueness/ownership and adds module composition. Search/read semantics move to `APP4-B07` (Admin-only; ADR-DB2-003 r7 forbids a customer-facing history surface). |
| `APP4-C02` Verification contract | **Folded** into `APP4-B03`/`APP4-B04` | The repository does not use standalone contract checkpoints; APP2/APP3 publish the contract with the implementing backend checkpoint plus a `check-*-contract.mjs` gate. |
| `APP4-B02` Verification backend | **Split → `APP4-B03` + `APP4-B04`** | Issue/resend and submit/status are four endpoints with different threat models (issuance rate-limit vs attempt lockout) and different downstream effects (notification emission vs customer creation). |
| `APP4-S01` Verification UI | **Kept as `APP4-S01`** | Depends on `APP4-D01`. |
| `APP4-C03` Secure grant contract | **Folded** into `APP4-B06`/`APP4-B07` | Same reason as `C02`. |
| `APP4-B03` Secure grant backend | **Split → `APP4-B05` (issuance/revocation/step-up core, internal) + `APP4-B06` (public non-enumerating resolution)** | The issuing side has no public surface (§C.2); the resolving side is the phase's single highest-risk public endpoint and deserves its own review boundary. |
| `APP4-C04` Notification core contract | **Folded** into `APP4-B08` | Same reason as `C02`. |
| `APP4-W01` Notification worker | **Split → `APP4-B01` (intent intake) + `APP4-W01` (delivery worker)** | Intake is an API-side outbox consumer contract; delivery is a worker responsibility. Worker checkpoints must isolate one cohesive responsibility. |
| `APP4-A01` Admin delivery/support view | **Kept**, plus a second Storefront screen `APP4-S02` | The secure-link landing is a customer screen the candidate list omitted; `APP4-E01`'s critical path cannot be proven without it. |
| `APP4-E01` Secure contact E2E | **Kept** | Scope restated in §G. |
| `APP4-X01` Phase closure | **Kept** | |
| — | **Added `APP4-G01`** | Policy values, route slugs, token/code standard, anti-enumeration contract and the two-queue ruling do not exist in any authority and cannot be invented inside an implementation checkpoint. |
| — | **Added `APP4-D01`** | Design verdict `NEW` (§D). |
| — | **Added `APP4-P01`** | Normalization, masking and opaque-secret primitives are needed by five later checkpoints; duplicating them violates CLAUDE.md §5. |

---

## F. Final APP4 checkpoint manifest

Execution order is top to bottom. "Endpoints" counts feature HTTP APIs only
(health/Swagger excluded, per the backend standard).

---

### `APP4-G01` — Secure-access, verification and notification authority

- **Context / owner:** Cross-cutting authority (Customer + Notification).
- **Purpose:** Lock every value and rule that later APP4 checkpoints would
  otherwise invent.
- **Scope:**
  1. Policy configuration keys and conservative default values, seeded through
     `policy_configuration_versions` as an append: challenge TTL, code length
     and alphabet, max attempts per challenge, resend cooldown, max challenges
     per target per window, `grant.standard` expiry, `grant.step-up-window`,
     notification max attempts and backoff schedule.
  2. Contact normalization rules (CON-163/164): email lower/trim; phone to
     E.164 with the default region; the masking rule for `recipient_masked`.
  3. Opaque secret standard: CSPRNG source, entropy, encoding, peppered-HMAC
     digest, constant-time comparison, and the rule that a raw code or token
     exists only in memory and in exactly one outbound message.
  4. The single non-enumerating public error contract (one status, one body,
     for absent / expired / revoked / superseded / wrong-target / wrong-purpose).
  5. Storefront route slugs for verification and secure-link landing, and the
     Admin support route, recorded in the decision register.
  6. The §C.4 two-queue ruling and the §C.2 grant↔request ruling.
- **Out of scope:** any runtime code, any endpoint, any provider choice.
- **Code areas:** `docs/implementation/*`, `docs/adr/backend/ADR-APP4-001-*`,
  `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md`,
  `tools/check-app4-g01.mjs` (+ its `.test.mjs`), policy seed data.
- **Endpoints:** 0. **Prerequisites:** none. **Design:** `NONE`.
- **Verification:** `node tools/check-app4-g01.mjs` — asserts every named key
  exists with a value, that the anti-enumeration contract names exactly one
  status code, that `claimBatch` has no non-test caller, and that no APP4 doc
  contains a literal code/token value; plus `pnpm format:check` on changed files.
- **Acceptance:** every value later checkpoints need is readable from
  configuration or a decision-register row; the gate fails if one is missing.
- **Stop if:** a required value is a genuine business decision with no
  conservative reversible default — record it as a routed decision and continue
  with the rest.

---

### `APP4-D01` — APP4 phase design package

- **Context / owner:** Design.
- **Purpose:** The single, complete APP4 design package (policy §3).
- **Scope:** Storefront verification (contact entry, code entry, resend
  cooldown, attempt-limit lockout, expired, success), Storefront secure-link
  landing (valid, and the one indistinguishable rejection state), Admin customer
  & verification support, Admin notification delivery ops; desktop + mobile;
  loading/empty/error states; component and token mapping; accessibility notes;
  `FIGMA_DESIGN_INDEX.md` updated in the same checkpoint with exact node IDs and
  deep links; integrity audit proving no APP1–APP3 frame was damaged.
- **Out of scope:** any code; any screen for an APP5/APP6/APP7 action.
- **Endpoints:** 0. **Prerequisites:** `APP4-G01` (routes). **Design:** `NEW`.
- **Verification:** `node tools/check-figma-design-index.mjs`.
- **Acceptance:** every APP4 frontend checkpoint below can name an
  `APPROVED_FOR_IMPLEMENTATION` registry row for each screen and state it needs.
- **Stop if:** a required state cannot be designed without an APP5 business
  screen — design the APP4 half and record the seam.

---

### `APP4-P01` — Contact normalization, masking and opaque-secret primitives

- **Context / owner:** Customer module domain layer (narrowest valid scope).
- **Purpose:** One implementation of the primitives five later checkpoints share.
- **Scope:** `normalizeEmail`, `normalizePhone` (E.164), `maskContact`, and a
  paired opaque-secret issuer/verifier mirroring
  `design-session-secret.{issuer,verifier}.ts` — one digest implementation so
  issuance and verification cannot drift.
- **Out of scope:** persistence, HTTP, notification, grants.
- **Code areas:** `apps/api/src/modules/customer/domain/`.
- **Endpoints:** 0. **Prerequisites:** `APP4-G01`. **Design:** `NONE`.
- **Verification:** module-scoped Jest unit tests (normalization table, digest
  determinism, constant-time comparison, mask never emits the full value).
- **Acceptance:** no later checkpoint reimplements normalization, masking or
  hashing.
- **Stop if:** the phone default region is undecided — `APP4-G01` owns it.

---

### `APP4-B01` — Notification intent intake

- **Context / owner:** Notification module (CTX-NTF).
- **Purpose:** Turn an outbox event into exactly one notification intent.
- **Scope:** Compose `NotificationModule` into `AppModule`; a
  `NotificationRequest` application service; deterministic `intent_key`
  derivation (source event + recipient + template) collapsing duplicates onto
  one intent via `createIdempotent`; redacted typed parameter construction
  (`ChallengeId`/`GrantId` references only); `recipient_masked` from `APP4-P01`;
  correlation-ID propagation.
- **Out of scope:** channel adapters, delivery, retry, rendering, Admin surface.
- **Code areas:** `apps/api/src/modules/notification/application/`,
  `notification.module.ts`, `bootstrap/app.module.ts`.
- **Endpoints:** 0. **Prerequisites:** `APP4-P01`. **Design:** `NONE`.
- **Verification:** module-scoped integration tests — duplicate outbox event
  yields one intent (`replay` outcome); `params` structurally cannot carry a
  code or token; masked recipient never equals the raw value; contract gate
  `node tools/check-app4-b01.mjs`.
- **Acceptance:** an intent exists for a business event with no secret in any
  persisted column.
- **Stop if:** a template reference would require a rendered body — it must not.

---

### `APP4-W01` — Notification delivery worker

- **Context / owner:** Worker (`apps/worker`).
- **Purpose:** One cohesive worker responsibility — deliver a pending intent.
- **Scope:** Register a `notification.delivery` job kind in the existing
  `JobHandlerRegistry`; claim through `WorkerJobQueueRepository` (§C.4);
  a provider-neutral `NotificationChannelPort`; a **recording dev adapter** that
  performs no external call; append a `notification_delivery_attempts` row per
  try with `outcome` and a bounded `error_class`; bounded retry using the
  existing `retry-schedule`; `FAILED_TERMINAL` → intent `FAILED` and dead-letter
  visibility; duplicate-safe (a replayed job never double-sends a delivered
  intent).
- **Out of scope:** any real provider or SDK; templates as content; HTTP.
- **Code areas:** `apps/worker/src/jobs/notification-delivery/`.
- **Endpoints:** 0. **Prerequisites:** `APP4-B01`. **Design:** `NONE`.
- **Verification:** worker-scoped integration tests — retryable failure
  re-leases and increments attempts, terminal failure stops and is observable,
  a replayed claim after `SATISFIED` sends nothing; `node tools/check-app4-w01.mjs`
  asserting no provider SDK import and no plaintext code/token in job logs.
- **Acceptance:** delivery outcome is readable from data, not from logs.
- **Stop if:** a provider decision is demanded — it is not; the port plus the
  recording adapter satisfy the phase exit gate (§I).

---

### `APP4-B02` — Customer/contact application core

- **Context / owner:** Customer module (CTX-CUS).
- **Purpose:** The verified-identity resolution rule, exactly once.
- **Scope:** Compose `CustomerModule` into `AppModule`; a
  `ResolveOrCreateVerifiedCustomer` service implementing ADR-DB2-001 r5 (a
  *just-verified* normalized contact linking to an existing customer, otherwise
  creating one); add/verify contact point; exactly one primary contact;
  23505 handling on CST-005 as a concurrent-verification loss; audit every
  link/attach (INV-14).
- **Out of scope:** HTTP (there is none — §C.1/§E), customer merge, business
  profile authoring, anonymization execution, search.
- **Code areas:** `apps/api/src/modules/customer/application/`.
- **Endpoints:** 0. **Prerequisites:** `APP4-P01`. **Design:** `NONE`.
- **Verification:** module-scoped integration tests — unverified raw-string
  match never links; two customers cannot hold the same contact verified and
  active; every link writes an audit event.
- **Acceptance:** no path exists that creates a customer without a verified
  contact.
- **Stop if:** a caller needs a merge — merge is out of phase scope.

---

### `APP4-B03` — Verification challenge issue and resend

- **Context / owner:** Customer module — public surface.
- **Purpose:** Issue an opaque code to a contact target, safely and rate-limited.
- **Scope:** `POST /public/verification/challenges` and
  `POST /public/verification/challenges/{challengeId}/resend`; opaque code
  issuance (`APP4-P01`); `code_hash` only; CST-007 single-open-challenge
  handling (mark stale `EXPIRED`, insert, treat 23505 as the concurrent-issuer
  loss, CC-17); issuance rate limit and resend cooldown from `APP4-G01`;
  optional `session_id` binding to an APP3 design session; emit the outbox event
  `APP4-B01` consumes; responses carry a challenge id and expiry, never a code.
- **Out of scope:** code submission, customer creation, grants.
- **Endpoints:** **2**. **Prerequisites:** `APP4-B01`, `APP4-P01`, `APP4-G01`.
  **Design:** `NONE` (contract only; the screen is `APP4-S01`).
- **Verification:** module integration tests + `node tools/check-app4-b03-contract.mjs`;
  assertions that no response, log line or audit record contains the code.
- **Acceptance:** a code reaches the recording adapter and nowhere else.
- **Stop if:** the response would have to distinguish "target unknown" —
  it must not.

---

### `APP4-B04` — Verification submit and status

- **Context / owner:** Customer module — public surface.
- **Purpose:** Consume a challenge exactly once and produce a verified identity.
- **Scope:** `POST /public/verification/challenges/{challengeId}/attempts` and
  `GET /public/verification/challenges/{challengeId}`; constant-time comparison;
  append `MATCH`/`MISMATCH`/`EXPIRED_AT_ENTRY`; attempt-limit lockout derived
  from `contact_verification_attempts` (no counter column is invented);
  `completeChallenge` and, for `purpose = SUBMISSION`, invoke `APP4-B02` inside
  the same transaction; replay of a consumed challenge is rejected; `STEP_UP`
  completion becomes readable through `hasRecentCompleted`; status endpoint
  discloses state and expiry only.
- **Out of scope:** grant issuance, any sensitive business action.
- **Endpoints:** **2**. **Prerequisites:** `APP4-B03`, `APP4-B02`.
  **Design:** `NONE`.
- **Verification:** module integration tests — attempt limit locks out; expired
  challenge cannot be answered even before any sweep; a verified challenge
  cannot be replayed; a successful `SUBMISSION` creates or links exactly one
  customer; `node tools/check-app4-b04-contract.mjs`.
- **Acceptance:** the challenge is single-use and the customer is its only
  identity output.
- **Stop if:** step-up would need to authorize a real action — that is APP6/APP7.

---

### `APP4-B05` — Secure grant issuance, reissue, revocation and step-up window

- **Context / owner:** Customer module — internal application core.
- **Purpose:** The grant lifecycle, with no public surface (§C.2).
- **Scope:** A `SecureGrantIssuer` port + service: mint an opaque token
  (`APP4-P01`), persist the hash only, set `expires_at` from
  `grant.standard`; reissue rotates the token and supersedes the prior grant
  (`REVOKED`, reason `superseded`) inside one transaction so CST-009 holds;
  revoke with a mandatory reason; a `StepUpWindow` service over
  `hasRecentCompleted`; audit issue / reissue / revoke.
- **Out of scope:** any HTTP endpoint; action-scope enumeration (§C.3);
  Custom Request creation.
- **Endpoints:** 0. **Prerequisites:** `APP4-B04`, `APP4-P01`.
  **Design:** `NONE`.
- **Verification:** module integration tests using the DB7 `order-fixture` to
  seed a `custom_requests` row — concurrent reissue leaves exactly one `ACTIVE`
  grant; a revoked grant carries a reason; the raw token is returned once and
  never persisted; `node tools/check-app4-b05.mjs` asserting no token column
  write outside the hashing path.
- **Acceptance:** APP5 can issue a grant by calling one port method.
- **Stop if:** a caller wants a per-action scope column — it is additive and
  out of phase.

---

### `APP4-B06` — Public secure-link resolution

- **Context / owner:** Customer module — the phase's highest-risk public surface.
- **Purpose:** Resolve a valid link, and be silent about every other case.
- **Scope:** One endpoint,
  `POST /public/secure-links/resolve` (token in the body, never in a URL, never
  logged); `resolveActive` under the caller's request; a single identical
  failure response for absent / expired / revoked / superseded / wrong-target /
  wrong-purpose; no timing or body difference between them; constant response
  shape; rate limiting; audit of use.
- **Out of scope:** consuming the grant for a business action; issuing;
  revoking; any APP5/APP6/APP7 action.
- **Endpoints:** **1**. **Prerequisites:** `APP4-B05`, `APP4-G01`.
  **Design:** `NONE` (the screen is `APP4-S02`).
- **Verification:** module integration tests covering all six rejection causes
  producing byte-identical responses; `node tools/check-app4-b06-contract.mjs`
  asserting exactly one documented failure status; a log-scan assertion that the
  token never appears.
- **Acceptance:** an attacker probing a leaked link learns nothing.
- **Stop if:** a product requirement demands a distinguishable "expired"
  message — route it, do not weaken the contract unilaterally.

---

### `APP4-B07` — Admin customer, verification and grant support

- **Context / owner:** Customer module — Admin surface (APP1 auth reused).
- **Purpose:** The minimum Admin visibility the phase outcome names.
- **Scope:** `GET /admin/customers/{customerId}` (identity, contacts, verified
  and primary flags, masked values), `GET /admin/customers/{customerId}/grants`
  (grants with status/expiry — never a token or hash), and
  `POST /admin/secure-grants/{grantId}/revoke` (reason mandatory).
- **Out of scope:** customer editing, merge, anonymization, search across all
  customers, notification data (`APP4-B08`).
- **Endpoints:** **3**. **Prerequisites:** `APP4-B05`, `APP4-B02`.
  **Design:** `NONE` (the screen is `APP4-A01`).
- **Verification:** module integration tests — unauthenticated and non-admin
  callers are rejected by the existing guard; no response field carries a hash
  or raw value; revocation without a reason is refused.
- **Acceptance:** an operator can answer "is this contact verified, and is this
  link still live?" and kill a link.
- **Stop if:** support needs a customer-facing history view — ADR-DB2-003 r7
  forbids it.

---

### `APP4-B08` — Admin notification delivery operations

- **Context / owner:** Notification module — Admin surface.
- **Purpose:** Answer "was it sent, and why did it fail?" and retry.
- **Scope:** `GET /admin/notification-intents` (filter by status; masked
  recipient; template reference) and
  `POST /admin/notification-intents/{intentId}/retry` (re-enqueue a `FAILED`
  intent through the same outbox path; idempotent; never re-renders a secret).
- **Out of scope:** message bodies, provider consoles, campaign concepts,
  customer-visible surfaces.
- **Endpoints:** **2**. **Prerequisites:** `APP4-W01`.
  **Design:** `NONE` (the screen is `APP4-A01`).
- **Verification:** module integration tests — retry on a `SATISFIED` intent is
  refused; retry is idempotent; attempts list shows `error_class` and never a
  provider body; `node tools/check-app4-b08-contract.mjs`.
- **Acceptance:** terminal failure is visible and recoverable from the Admin app.
- **Stop if:** retry would need to reconstruct a code — it must re-derive
  nothing; a verification code is re-issued through `APP4-B03`, never resent.

---

### `APP4-S01` — Storefront contact verification screen

- **Context / owner:** Storefront.
- **Purpose:** The customer half of `APP4-B03`/`APP4-B04`.
- **Scope:** The verification route locked at `APP4-G01`; contact entry, code
  entry, resend with cooldown, attempt-limit lockout, expired, and success
  states; handwritten TanStack Query hooks over the generated Axios client;
  SCSS per the frontend standard; no code or token in any client-side store,
  URL or log.
- **Out of scope:** the Studio submit handoff (APP5 wires it); any account UI.
- **Prerequisites:** `APP4-D01` (approved rows), `APP4-B04`.
  **Design:** depends on `APP4-D01`.
- **Verification:** component tests per state + a scoped runtime check against
  the running storefront container; registry IDs recorded in the report.
- **Acceptance:** every designed state is reachable and matches its approved
  node.
- **Stop if:** a required registry row is missing or not
  `APPROVED_FOR_IMPLEMENTATION` — block, do not guess.

---

### `APP4-S02` — Storefront secure-link landing

- **Context / owner:** Storefront.
- **Purpose:** The customer half of `APP4-B06`.
- **Scope:** The secure-link route locked at `APP4-G01`; token read from the
  link and exchanged server-side; the valid state renders only what the grant
  authorizes at `REQUEST_ACCESS` granularity; the single indistinguishable
  rejection state; the token never enters client state, history or analytics.
- **Out of scope:** request/quotation/payment content (APP5–APP7); step-up
  action wiring.
- **Prerequisites:** `APP4-D01`, `APP4-B06`. **Design:** depends on `APP4-D01`.
- **Verification:** component tests for both states + a scoped runtime check;
  an assertion that the rejection view is identical for every cause.
- **Acceptance:** the rejection view cannot be used to distinguish causes.
- **Stop if:** the valid state has nothing to render because APP5 owns the
  content — render the authorized shell and record the seam.

---

### `APP4-A01` — Admin verification and delivery support screen

- **Context / owner:** Admin.
- **Purpose:** One cohesive support capability over `APP4-B07`/`APP4-B08`.
- **Scope:** Customer detail with contact verification status; live grants with
  revoke (reason required, confirmed); failed notification intents with retry;
  loading/empty/error/conflict states.
- **Out of scope:** customer editing, merge, any commercial data.
- **Prerequisites:** `APP4-D01`, `APP4-B07`, `APP4-B08`.
  **Design:** depends on `APP4-D01`.
- **Verification:** component tests per state + a scoped runtime check against
  the running admin container; cache invalidation after a lifecycle write
  follows the APP2-A04 precedent.
- **Acceptance:** an operator completes revoke and retry without leaving the
  screen.
- **Stop if:** a required registry row is missing.

---

### `APP4-E01` — Secure contact cross-layer acceptance

- **Context / owner:** Cross-layer.
- **Purpose:** Prove the phase's critical path end to end (§G).
- **Prerequisites:** every checkpoint above. **Design:** `NONE`.
- **Endpoints:** 0.

---

### `APP4-X01` — Phase closure

- **Purpose:** Freeze APP4 artifacts, record follow-ups, hand off to APP5.
- **Scope:** Recompute and freeze the OpenAPI hash, API-client hash, DB table and
  migration counts (expected unchanged — `NO_APP4_MIGRATION`) and the Figma rows
  APP4 owns; a closure gate that **recomputes** rather than trusting prose;
  update the roadmap status row and the decision register.
- **Prerequisites:** `APP4-E01`. **Design:** `NONE`. **Endpoints:** 0.
- **Stop if:** an exit-gate item (§I) is unproven.

---

### F.1 Dependency graph

```text
APP4-G01 ─┬─> APP4-D01 ─────────────────┬─> APP4-S01
          │                             ├─> APP4-S02
          │                             └─> APP4-A01
          └─> APP4-P01 ─┬─> APP4-B01 ─> APP4-W01 ─> APP4-B08 ─┐
                        │                                     │
                        ├─> APP4-B02 ─┐                       │
                        │             │                       │
                        └─> APP4-B03 ─┴─> APP4-B04 ─> APP4-B05 ┼─> APP4-B07
                                                        │      │
                                                        └─> APP4-B06 ─> APP4-S02
                                                                       │
  APP4-S01, APP4-S02, APP4-A01, APP4-B06, APP4-B08 ────────────────────┴─> APP4-E01 ─> APP4-X01
```

### F.2 Endpoint budget

| Checkpoint | Endpoints | Cap |
|---|---|---|
| `APP4-B03` | 2 | 5 |
| `APP4-B04` | 2 | 5 |
| `APP4-B06` | 1 | 5 |
| `APP4-B07` | 3 | 5 |
| `APP4-B08` | 2 | 5 |
| all others | 0 | — |
| **APP4 total** | **10** | — |

Every backend checkpoint is within 1–3 endpoints; none approaches the cap.

---

## G. `APP4-E01` scope

**Must prove, in one run, across API + worker + both frontends:**

1. A challenge is issued to a contact target; the code exists only in the
   recording channel adapter.
2. A notification intent is created exactly once for that challenge, with no
   code in `params`, and is delivered by the worker with an attempt row.
3. Submitting the correct code verifies the challenge and creates exactly one
   customer with one verified, primary contact.
4. A secure grant is issued for that customer against a **fixture-seeded**
   `custom_requests` row, and its notification intent is delivered.
5. The valid secure link resolves in the browser and renders the authorized
   shell.
6. Each of **invalid, expired, replayed-after-revocation, revoked, superseded
   and wrong-purpose** usage returns the identical rejection, and the Storefront
   renders the identical view.
7. An operator sees the verification status, revokes the grant, and observes
   the previously valid link stop resolving.
8. A forced terminal delivery failure is visible in Admin and retryable.

**Must not include:** request submission as a business action, design review,
quotation acceptance, payment initiation, or any APP5/APP6/APP7 state
transition. The `custom_requests` row is seeded through the existing DB7
repository fixture and is explicitly labelled scaffolding in the E01 report.

---

## H. Security invariant ownership matrix

| # | Invariant | Owning checkpoint(s) | Proof |
|---|---|---|---|
| 1 | Opaque verification codes | `APP4-P01`, `APP4-B03` | CSPRNG entropy assertion; `code_hash` only; no code in any response |
| 2 | Opaque secure-link tokens | `APP4-P01`, `APP4-B05` | `token_hash` only (CST-008); raw token returned once, never persisted |
| 3 | No plaintext token/code logging | `APP4-G01`, `APP4-B03`, `APP4-B06`, `APP4-W01` | Gate scan of logs, audit rows, notification `params` and reports |
| 4 | Expiry | `APP4-G01` (values), `APP4-B04`, `APP4-B06` | Expired challenge unanswerable pre-sweep; expired grant unresolvable |
| 5 | Attempt / rate limiting | `APP4-B03` (issuance, resend), `APP4-B04` (attempts) | Lockout derived from `contact_verification_attempts`; no invented counter |
| 6 | Replay / consumption | `APP4-B04` (challenge single-use), `APP4-B06` (post-revocation replay) | Verified challenge cannot be re-answered; revoked token stops resolving |
| 7 | Revocation | `APP4-B05`, `APP4-B07` | Reason mandatory (CHECK); revoke-then-resolve ordering test |
| 8 | Target binding | `APP4-B05`, `APP4-B06` | `resolveActive` customer + request match (G-DB7-38/39) |
| 9 | Purpose binding | `APP4-B03`, `APP4-B04`, `APP4-B06` | `SUBMISSION` vs `STEP_UP` cannot substitute for one another |
| 10 | Scope binding | `APP4-B05` (step-up window), `APP4-B06` (`REQUEST_ACCESS`) | Window expiry forces a new challenge; §C.3 records the APP6/APP7 seam |
| 11 | Non-enumerating public errors | `APP4-G01` (contract), `APP4-B06`, `APP4-S02` | Six causes → byte-identical response and identical view |
| 12 | Idempotent notification processing | `APP4-B01`, `APP4-W01` | Duplicate outbox → one intent (CST-047); replayed claim after `SATISFIED` sends nothing |
| 13 | Bounded retry | `APP4-W01` | Attempt count reaches the configured bound and stops |
| 14 | Terminal failure observability | `APP4-W01`, `APP4-B08` | `FAILED_TERMINAL` attempt + `FAILED` intent visible and retryable in Admin |

Cross-cutting: **audit** (INV-14) is written by `APP4-B02` (link/attach),
`APP4-B04` (verification outcome) and `APP4-B05` (issue/reissue/revoke).

---

## I. Exit-gate mapping

| Phase brief exit gate | Owner |
|---|---|
| Tokens/codes opaque, never logged in plaintext | `APP4-G01`, `APP4-P01`, `APP4-B03`, `APP4-B05`, `APP4-B06` |
| Rate and expiry behavior pass | `APP4-B03`, `APP4-B04`, `APP4-B06` |
| Notification retries observable and idempotent | `APP4-B01`, `APP4-W01`, `APP4-B08` |
| Secure grants enforce target/purpose/scope | `APP4-B05`, `APP4-B06` |
| E2E passes | `APP4-E01` |

---

## J. Routed decisions

### `APP4-PO-001` — Notification channel and provider (`IMP-O006`)

- **Missing decision:** which concrete email/SMS provider and which channels
  APP4 delivers through.
- **Why existing authority cannot resolve it:** `IMP-O006` is open with owner
  **APP4**; ADR-DB2-003 r4 and the phase brief both explicitly leave the provider
  unchosen; no ADR, repository pattern or default selects a vendor. Choosing
  wrongly matters because an SMS/email provider observes the OTP in transit — a
  material security semantic, not a naming preference.
- **Recommended default (adopted unless the PO directs otherwise):** APP4
  selects **no external provider**. It ships `NotificationChannelPort` plus a
  recording development adapter that performs no external call.
  `IMP-O006` stays open, its due date unchanged — "before production
  notification delivery", which APP4 does not perform.
- **Alternatives (materially distinct):** (a) lock a provider now via a
  dedicated `APP4-DEC-NOTIFY` decision checkpoint and ADR — rejected as
  premature, since nothing in APP4's exit gate requires real delivery and the
  choice is cheaper to make against APP12's production constraints;
  (b) ship a direct SMTP adapter — rejected: it is a provider choice wearing a
  protocol's name, and it moves the OTP through an unreviewed path.
- **Blocked future checkpoint:** **none in APP4.** The first checkpoint that
  cannot proceed without it is production notification delivery in **APP12**.

No other item met the TRUE_PO_DECISION test. Policy durations, attempt limits
and route slugs are all resolvable at level 4 (conservative, reversible,
scope-minimizing) and are locked in `APP4-G01`, where a wrong value is corrected
by appending a policy-configuration version rather than by changing code.

---

## K. Recommended next checkpoint

**`APP4-G01`.**

It is now safe to start because the baseline reconciliation above establishes
that nothing it depends on is missing: every table and repository it configures
exists, the policy-configuration store exists and is empty of APP4 keys, and the
two rulings it records (§C.2 grant↔request, §C.4 two queues) are derived from
delivered code rather than proposed by it. It writes no runtime code, so it
cannot destabilize the closed APP3 baseline, and it removes every value that
`APP4-P01` through `APP4-W01` would otherwise have to invent — which is exactly
the failure mode the charter's §5 and §9 exist to prevent.

`APP4-D01` may begin in parallel once `APP4-G01` has locked the route slugs.
