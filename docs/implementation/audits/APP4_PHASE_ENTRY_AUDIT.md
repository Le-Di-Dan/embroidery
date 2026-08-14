# APP4 — Phase entry authority, re-slicing and execution manifest

- Checkpoint: `APP4-P00`
- Phase brief: [`phases/APP4-CUSTOMER-IDENTITY-SECURE-ACCESS-NOTIFICATION.md`](../phases/APP4-CUSTOMER-IDENTITY-SECURE-ACCESS-NOTIFICATION.md)
- Entry HEAD: `aa577f3e6e7da31a7acb42de12219b84f86b7708` (branch `production`, clean)
- Entry state: APP0 `COMPLETE`, APP1 `COMPLETE — PASS_WITH_FOLLOW_UPS`,
  APP2 `COMPLETE`, APP3 `COMPLETE — PASS_WITH_FOLLOW_UPS` (closed at `APP3-X01`)
- Verdict: **`PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`**
- History: initial P00 → **`APP4-P00-C1`** (the single correction) →
  **mandatory closure directive** (prescriptive, not a correction; no
  `APP4-P00-C2` exists)
- Corrections applied: `APP4-P00-C1` — secret-delivery and secure-link transport
  architecture (§C.7). Sections carrying corrected text are marked **[C1]**.
- Closure applied: dead-letter manual replay and shared envelope authority
  (§C.8). Sections carrying closure text are marked **[MD]**.
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

**[C1]** A sixth finding was raised in Product Owner review of the first draft
and is resolved in §C.7: the manifest required a raw secret to be delivered
asynchronously by a worker while forbidding every carrier that could reach it,
and it forbade the very URL form a clickable secure link needs. Both are
corrected by the Product Owner's **encrypted transient delivery envelope** and
**URL-fragment link carrier** rulings, neither of which adds a schema change, a
queue, an escrow table or a third-party dependency.

**[MD]** A seventh finding closed the phase entry: `APP4-B08`'s "retry a failed
intent" was incomplete against locked APP2 worker authority, because automatic
terminal failure leaves the outbox row in `DEAD_LETTER`, which is never
claimable, and APP2 deferred manual replay to a later approved checkpoint —
`APP4-B08` **is** that checkpoint. The Product Owner prescribed the manual
replay state machine and a shared envelope codec package; both are applied in
§C.8. One prescribed step collides with a locked DB3 lifecycle rule and is
realigned to it in §C.8.4 rather than applied silently.

The one previously routed decision — notification channel/provider, `IMP-O006` —
is now **`PO_ACCEPTED / NON_BLOCKING`** (§J). The decision ledger is empty.

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

One apparent contradiction was checked and resolved by precedence: the phase
brief's candidate `APP4-C01` ("customer/contact create/read/update operations")
versus ADR-DB2-001 Option A. The ADR is higher in the source-of-truth order and
is a locked product/database decision; the phase brief's candidate list is
explicitly "planning slices, not an execution batch" and explicitly requires
re-slicing. Resolved by deleting the candidate, not by reopening the ADR (§E).

A second, internal contradiction was found in Product Owner review of the first
P00 draft and is resolved in §C.7 by `APP4-P00-C1`.

### C.7 Secret carrier and secure-link transport — `APP4-P00-C1`

#### C.7.1 The contradiction

The first draft of this manifest required all of the following at once: a raw
code minted in `APP4-B03`; only `code_hash` persisted; notification intent
`params` structurally secret-free; delivery performed **later, in another
process**, by the outbox-driven worker; and `APP4-E01` proving the real code
reaches the recording adapter. Those cannot all hold. A CSPRNG secret that is
persisted only as a hash and excluded from the only record the worker reads is
**unreconstructable by that worker**, so asynchronous delivery had no carrier.
The identical defect applied to the secure-link token in `APP4-B05`.

Coupled to it: `APP4-B06` said the token is "never in a URL" while `APP4-S02`
read it "from the link". A link the customer clicks must carry the token
somehow; the absolute rule made the journey undeliverable.

#### C.7.2 Ruling A — encrypted transient delivery envelope (Product Owner)

The raw secret travels to the worker inside a **versioned, authenticated,
encrypted delivery envelope carried by the existing outbox event payload**.

1. The issuing application service mints the plaintext exactly once.
2. Only the existing hash lands in the authoritative table
   (`contact_verification_challenges.code_hash`,
   `secure_access_grants.token_hash`).
3. The notification intent is created **without any plaintext secret material**;
   `notification_intents.params` remains redacted typed references only.
4. The plaintext is serialized **only** into the encrypted envelope, written to
   `outbox_events.payload` in the **same transaction** as the business write.
5. The persisted payload carries ciphertext, nonce/IV, authentication tag and
   non-secret metadata. It never carries the plaintext.
6. Envelope contents are the minimum needed to deliver: secret kind and envelope
   version, notification-intent reference, the channel/recipient reference the
   handler needs, the one raw code or token, and issued-at/expiry metadata only
   where it is required to reject stale delivery work.
7. The worker decrypts **only after** it has successfully claimed the outbox
   job, and holds the plaintext in memory only long enough to render and hand to
   `NotificationChannelPort`.
8. The decrypted secret is never written to `notification_intents`,
   `notification_delivery_attempts`, `background_job_attempts`, audit rows,
   application logs, error messages or completion reports.
9. **Transport retry reuses the same envelope.** A retry never mints a different
   secret, because the hash already persisted is the one the customer must be
   able to answer.
10. **A business resend is a different operation.** Resending a verification
    challenge (`APP4-B03`) issues a *new* challenge and code under the `APP4-G01`
    cooldown and is not a transport retry. `APP4-G01` owns the distinction.
11. Terminal delivery failure records classification and metadata only, leaving
    no plaintext residue.
12. The development recording adapter may expose the decrypted value **inside
    dev/test process memory only**, as the controlled sink focused integration
    and E2E tests read. It writes no production table and no normal log.

#### C.7.3 Ruling A — authority clearance

Each stop condition the correction named was checked against the repository and
**none is met**:

| Checked | Finding |
|---|---|
| Does the outbox payload contract forbid opaque encrypted material? | **No.** ADR-DB4-004 rule 4 scopes redaction-by-construction to columns **6** (`payment_provider_events.redacted_payload`) and **8** (`notification_intents.params`) — *not* to column 4, `outbox_events.payload`. Rule 5 requires JSONB payloads be read whole and never queried by field, which ciphertext satisfies natively; rule 6's "small by construction" is satisfied by a 32-byte secret plus nonce and tag. |
| Can the worker runtime carry a versioned envelope without a schema change? | **Yes.** `outbox_events` already pairs `payload` with `payload_schema_version` (ADR-DB4-004 rule 1), and the repository already versions payloads per event type (`ASSET_INSPECTION_PAYLOAD_VERSION`, `ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION`, `PRODUCT_PUBLICATION_PAYLOAD_VERSION`). Rule 8 already assigns payload-format migration to versioned consumers in the owning module. **No schema change, no new column, no escrow table.** |
| Does a locked ADR forbid a client-side URL fragment for secure-link bootstrap? | **No.** `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §9 does contain "never placed in a URL, query, fragment, …", but that sentence is scoped explicitly to the **anonymous Design Session credential** (`APP3-G03` / IMP-D043), a cookie-borne credential with its own transport ruling. It governs no other secret. Recorded here because the sentence reads as absolute out of context and a future reader could misapply it. §2 of the same document states only that secure links must be unguessable and revocable/expiring — both preserved. |
| Does an existing crypto/key-management authority conflict? | **No.** The established convention is a runtime **HMAC pepper** for hashing (`DESIGN_SESSION_SECRET_PEPPER`: env var, empty in `.env.example`, minimum length enforced, fail-closed at config load). It is a hashing pepper, not an AEAD key, so reusing it would violate the ruling's separation requirement. The convention's *shape* is reused; the key is separate. |

No authenticated-encryption primitive exists anywhere in the repository
(no `createCipheriv`, no `aes-256-gcm`, no AEAD wrapper). Ruling A item 6
therefore applies: `APP4-W01`'s prerequisite is a **narrow APP4 infrastructure
abstraction over the Node standard library** (`node:crypto`, AES-256-GCM). **No
third-party crypto package is added.**

The transaction pattern that makes step 4 recoverable already exists and is not
invented here: `apps/api/src/modules/asset/application/upload-transactions.service.ts`
performs the business write and `outbox.append` inside one
`transactions.runInTransaction(...)`. There is **no dual-write**: either the
challenge/grant row and its delivery envelope both commit, or neither does.
Because the outbox row is transient and cleaned after dispatch, the ciphertext
does not accumulate as an archive.

#### C.7.4 Ruling B — secure-link token travels in the URL fragment (Product Owner)

Canonical conceptual form — the route slug remains an `APP4-G01` item:

```text
https://<storefront>/<secure-link-route>#t=<opaque-token>
```

The absolute rule "the token is never in a URL" is **replaced** by the precise
rule:

- **never** in a server-visible URL path or query;
- **never** in server, gateway or proxy access logs;
- **allowed** only in the client-side fragment of the outbound secure link,
  which is the transport;
- **removed** immediately during Storefront bootstrap.

Browser semantics, owned by `APP4-S02`:

1. A fragment is not transmitted to the origin, so the token never reaches the
   Storefront server, the Nginx gateway or any access log.
2. The bootstrap reads the fragment locally.
3. It strips the fragment via `history.replaceState` **before** any analytics,
   beacon, third-party script or unrelated client activity runs on that route.
4. The raw token lives in one ephemeral local variable, for the time it takes to
   call `POST /public/secure-links/resolve`.
5. The token reaches the API only in the request **body**.
6. It is never written to Zustand, TanStack Query cache data, `localStorage`,
   `sessionStorage`, cookies, persisted React/Next state, analytics or logs.
7. The variable is discarded once resolution succeeds or fails.
8. The API never echoes the raw token, and the non-enumerating failure contract
   is unchanged.

No token-bearing query parameter or path segment is introduced.

### C.8 Dead-letter manual replay and shared envelope authority — mandatory closure **[MD]**

#### C.8.1 The residual defect

`APP4-P00-C1` made **automatic** transport retry work: the same outbox row is
re-leased and the same sealed envelope is re-delivered. It did not close the
**manual** path. `APP4-B08` still said an operator could "retry a `FAILED`
intent" by "re-enqueueing through the outbox path", which is incomplete against
locked APP2 worker authority:

- automatic terminal failure leaves the source outbox row `DEAD_LETTER`;
- `DEAD_LETTER` is outside IDX-088's claimable predicate and is **never**
  automatically claimed;
- APP2 deferred manual replay to a later approved checkpoint, and `APP4-B08`
  **is** that checkpoint.

So APP4 must define the manual replay contract, and the Product Owner
prescribed it.

#### C.8.2 Three distinct contracts — locked vocabulary

`APP4-G01` locks these as three separate terms that no later checkpoint may
conflate:

| Term | Outbox row | Envelope | Secret | Owner |
|---|---|---|---|---|
| **Automatic transport retry** | the **same** `PENDING` row, re-leased | the same sealed envelope | unchanged | `APP4-W01` |
| **Admin manual transport replay** | the old `DEAD_LETTER` row stays untouched; a **new** `PENDING` row is appended | the **byte-identical** ciphertext copied without decryption | unchanged, and only while still eligible | `APP4-B08` |
| **Business resend / reissue** | a new `PENDING` row | a **new** envelope | a **new** code or rotated token | `APP4-B03` (resend), `APP4-B05` (reissue) |

#### C.8.3 The manual replay transaction

The old `DEAD_LETTER` row is **never** reset, reactivated or mutated. It is
immutable terminal evidence, its attempt count already equals the automatic
retry limit, and — decisively — `job_key` **is the outbox event id**
(`worker-job-queue.repository.ts`: `jobKey: guard.outboxEventId.toString()`), so
reusing that identity would collide with CST-049
`uq_background_job_attempts__kind_key_attempt` and destroy the monotonicity of
`(job_kind, job_key, attempt_no)`. A new outbox row yields a new `job_key` and a
clean attempt sequence starting at 1.

For an authorized Admin retry, inside **one** transaction:

1. lock/read the notification intent;
2. require the intent to be in the terminal failed state;
3. resolve the terminal source outbox event through the **non-secret linkage**
   (§C.8.5) — never by querying ciphertext;
4. require the source event's status to be `DEAD_LETTER`;
5. verify the underlying business secret is **still eligible** (§C.8.6);
6. copy the opaque envelope **bytes/JSON structure and `payload_schema_version`
   exactly** from the terminal source event — **the API never decrypts**;
7. append a **new** `PENDING` outbox event: new event id, fresh attempt counter,
   same delivery event type, same ciphertext, same aggregate linkage;
8. carry the notification lifecycle forward per §C.8.4;
9. commit steps 7 and 8 together;
10. leave the old `DEAD_LETTER` row unchanged.

No plaintext code or token is reconstructed, re-rendered, persisted or logged at
any point. `packages/notification-delivery` is imported by the API for
**sealing** only; the API has no reason to open an envelope and `APP4-B08` must
not.

#### C.8.4 Lifecycle realignment — the one prescribed step that met locked authority

The directive's step 8 prescribed transitioning the existing intent
`FAILED → PENDING/QUEUED`. That collides with locked DB3 authority:

`docs/database/DB3_NOTIFICATION_LIFECYCLE_SPEC.md` §1 declares `FAILED`
**terminal** and enumerates six transitions — TR-NTF-01 `(create)→PENDING`,
TR-NTF-02 `PENDING→PROCESSING`, TR-NTF-03 `PROCESSING→SATISFIED`, TR-NTF-04
`PROCESSING→PENDING`, TR-NTF-05 `PROCESSING→FAILED`, TR-NTF-06
`PENDING→CANCELLED`. **There is no `FAILED→PENDING`.** §3 rule 2 is explicit and
locked: *"exhausted → FAILED + dead-letter; manual resend = **new intent**
(audited), không reopen intent cũ"* — manual resend is a new intent; do not
reopen the old one.

Stop condition 3 required **both** that no legal transition exists **and** that
no existing state can represent manual replay without a migration. The first
half holds; the second does not — a **new intent row in `PENDING`** represents
it exactly, needs no migration, and is the form DB3 itself prescribes. So this
is not a stop. Step 8 is realigned rather than applied verbatim, and the
realignment is reported here rather than made silently (CLAUDE.md §2).

**Step 8 as executed:** the manual replay appends a **new notification intent**
in `PENDING`, carrying the same template reference, channel, masked recipient
and redacted params, under a derived replay `intent_key` (CST-047 makes the
original key unavailable). The original `FAILED` intent is **not** reopened; it
is linked as the replay's origin through the same non-secret reference
mechanism and stays terminal evidence, exactly as the old `DEAD_LETTER` row
does one level down.

This is also the only version that **functions**. The retry budget is derived
from `NotificationIntentRepository.countAttempts(intentId)` over
`notification_delivery_attempts`, which is keyed to the intent. A reopened
intent would re-enter delivery with its attempt count already at or beyond the
bound, so the worker would terminal-fail on the first attempt and the replay
would never deliver. A new intent gets a clean budget. The directive's own
reasoning for §2.1 — terminal evidence, unambiguous attempt monotonicity —
applies identically one level up, so following DB3 makes the architecture more
internally consistent, not less.

Every acceptance item survives: the old `DEAD_LETTER` row stays terminal and
unchanged; exactly one new `PENDING` outbox row is appended; the ciphertext is
byte-identical and never decrypted; the lifecycle move and the outbox append
commit in one transaction; duplicate calls produce one replay (§C.8.7).

#### C.8.5 Non-secret linkage — existing fields, no new column

The envelope is encrypted and ADR-DB4-004 rule 5 forbids querying JSONB
internals, so the delivery event needs a server-queryable, non-secret path back
to its intent. The outbox already has one — the REL-104 polymorphic reference:

```text
aggregate_kind = NOTIFICATION_INTENT
aggregate_id   = notification_intent.id
```

`aggregate_kind` has **no CHECK constraint**; the closed set is the application
guard `OUTBOX_AGGREGATE_KINDS` in
`packages/persistence/src/platform/outbox-event-store.ts`, validated at write
time (G-DB7-47). Adding `NOTIFICATION_INTENT` to that constant follows the exact
precedent APP2-B03 set when it added `PRODUCT`, whose in-source comment records
the rule: *"`aggregate_kind` is open text with no CHECK by design (REL-104 is
polymorphic), so this list is the G-DB7-47 write-time guard, not a schema
constraint — no migration."* The store's contract also fits precisely: the id's
existence "is guaranteed by the enclosing transaction, which also wrote the
aggregate row", and the intent is written in that same transaction.

**No column is added. No ciphertext is ever queried.** `APP4-G01` locks the
mapping, `APP4-B01` writes it on every delivery event, `APP4-B08` reads it to
resolve the terminal source event.

`BACKGROUND_JOB_KINDS` already contains `NOTIFICATION_DELIVERY`, so the worker
side needs no constant change at all.

#### C.8.6 Replay eligibility — transport replay never outlives its secret

Manual replay copies an existing sealed secret, so it is permitted only while
that secret is still usable.

- **Verification challenge** — refuse if the challenge is expired, completed,
  invalidated, superseded or otherwise no longer answerable. Delivering a code
  that can no longer be entered is worse than refusing.
- **Secure grant** — refuse if the grant is expired, revoked, superseded or
  otherwise inactive. Re-delivering a dead link teaches an attacker nothing and
  helps the customer not at all.

A refusal returns an Admin-safe conflict result with the semantics
`REISSUE_REQUIRED` (exact code per repository error conventions, locked at
`APP4-G01`). It routes the operator to the **business** path — `APP4-B03` for a
new verification code, `APP4-B05` reissue for a new token — and **never** to
secret reconstruction, which is impossible by construction anyway: only the
hash is persisted.

#### C.8.7 Duplicate and concurrent Admin retry

Manual replay is idempotent. Exactly one caller wins the guarded lifecycle move
on the origin intent; the winner appends exactly one new outbox row. A losing or
duplicate caller appends nothing and receives the canonical current state rather
than silently creating a second delivery. No new global idempotency framework is
introduced — the guarded-transition and idempotency mechanisms already in the
repository are reused. The old row's attempt counter is never reset.

#### C.8.8 Shared envelope codec — `packages/notification-delivery`

`APP4-P00-C1` placed the sealing abstraction under
`apps/api/src/modules/notification/infrastructure/crypto/`, but `APP4-W01` must
open the same format from `apps/worker`. That would force an app-to-app import
or a duplicated AES-GCM implementation and duplicated version constants — API
and worker would drift, and a drifted envelope version is an undeliverable
notification.

**Ownership moves to one shared workspace package,
`@embroidery/notification-delivery` at `packages/notification-delivery`.**

It owns **only**: the delivery-envelope schema and type; the envelope version
constant; the secret-kind discriminator; the AEAD seal/open implementation over
`node:crypto` AES-256-GCM; the key parsing/validation helper both processes
need; and focused unit tests.

It owns **nothing** else — no notification-intent persistence, no worker
runtime, no HTTP, no provider SDK, no templates or business rendering, no
customer/grant repositories, no policy lookup, no database access.

`apps/api` imports it to **seal**. `apps/worker` imports it to **open**. **No
app-to-app import.** **No third-party crypto dependency.**

This is permitted and in fact required by workspace governance:
`REPOSITORY_STRUCTURE.md` states packages are created "only when real
cross-application reuse exists" — two applications sharing one wire format is
exactly that — and that "a new workspace package requires a clear owner,
purpose, and consumer list", all three of which are stated above. Stop
condition 4 is **not** met.

The package is introduced by `APP4-B01`, which owns the producer-side envelope
contract; `APP4-W01` consumes it unchanged. `APP4-G01` locks the boundary and
the envelope/key authority before `APP4-B01` starts.

#### C.8.9 Closure stop conditions — all four checked, none met

| Checked | Finding |
|---|---|
| 1. Does `outbox_events` lack a non-secret linkage capable of identifying the intent? | **No.** `aggregate_kind` + `aggregate_id` (REL-104) are exactly that, with no CHECK to widen and an application-level closed set whose extension has a same-shape precedent (`PRODUCT`, APP2-B03). |
| 2. Does the schema prevent a second delivery event for the same intent? | **No.** `outbox_events` carries a sequence primary key and, apart from the status CHECK, no uniqueness at all — no constraint on `(aggregate_kind, aggregate_id, event_type)`. A replay row is representable. |
| 3. Is there no legal terminal→queued transition **and** no existing state able to represent replay without a migration? | **Half met, so not met.** `FAILED` is terminal with no `FAILED→PENDING` transition, and DB3 §3 rule 2 forbids reopening the old intent — but a **new intent in `PENDING`** represents manual replay with no migration, and is the form DB3 itself prescribes. Resolved in §C.8.4. |
| 4. Does workspace governance forbid `packages/notification-delivery`? | **No.** `REPOSITORY_STRUCTURE.md` conditions a new package on real cross-application reuse plus a stated owner, purpose and consumer list. All are satisfied (§C.8.8). |

**Still true after closure:** `NO_APP4_MIGRATION`; the outbox remains the only
worker queue; no escrow table; no provider; no schema, column or index change.

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
  7. **[C1] Encrypted delivery-envelope format and version** (§C.7.2): the
     envelope's field set, its version discriminator carried in
     `outbox_events.payload_schema_version`, the AEAD construction
     (`node:crypto` AES-256-GCM — no third-party crypto package), and the rule
     that the envelope is written to `outbox_events.payload` only and **never**
     to `notification_intents.params`.
  8. **[C1] Envelope encryption-key configuration authority.** A dedicated
     configuration key — recommended name `NOTIFICATION_DELIVERY_ENVELOPE_KEY` —
     following the established pepper convention in shape only: declared empty
     in `.env.example`, required length and encoding stated, **fail-closed** at
     config load in any runtime that issues or delivers encrypted envelopes, and
     **structurally separate from every hashing/HMAC pepper**
     (`DESIGN_SESSION_SECRET_PEPPER` is a hashing pepper and must not be reused).
     **No production key value is invented or committed** (CLAUDE.md §8a).
  9. **[C1] Secret-lifetime and redaction rules:** where plaintext may exist
     (issuer memory, envelope ciphertext, worker memory after claim, one
     outbound message), and the exhaustive list of sinks it may never reach
     (§C.7.2 item 8).
  10. **[C1] Secure-link fragment transport and bootstrap rules** (§C.7.4),
      including the replacement of the inaccurate "never in a URL" rule with the
      precise four-part rule, and the ordering requirement that fragment
      stripping precede any analytics or third-party activity.
  11. **[C1]/[MD] Three delivery contracts, locked as separate terms** (§C.8.2):
      **automatic transport retry** (same outbox row, same envelope, mints
      nothing), **Admin manual transport replay** (new outbox row, byte-identical
      ciphertext, only while the source secret is still eligible) and **business
      resend/reissue** (new secret, new envelope). Defined here so `APP4-B03`,
      `APP4-B05`, `APP4-W01` and `APP4-B08` cannot drift.
  12. **[MD] The `DEAD_LETTER` manual replay contract** (§C.8.3), including the
      absolute rule that a `DEAD_LETTER` row is **never** reset, reactivated or
      mutated — by an automatic path, an Admin path or an operator script.
  13. **[MD] The non-secret outbox↔intent linkage** (§C.8.5): the exact existing
      field mapping (`aggregate_kind = NOTIFICATION_INTENT`,
      `aggregate_id = notification_intent.id`), locked after source inspection,
      plus the extension of the `OUTBOX_AGGREGATE_KINDS` application guard —
      **no column, no CHECK, no migration**, following the APP2-B03 `PRODUCT`
      precedent. No ciphertext is ever queried to discover an intent id.
  14. **[MD] Manual replay eligibility** against current challenge/grant state
      (§C.8.6), and the `REISSUE_REQUIRED` result semantics — exact code per
      repository error conventions — that route a refusal to the business path
      rather than to secret reconstruction.
  15. **[MD] The lifecycle form of manual replay** (§C.8.4): a **new notification
      intent** in `PENDING` with a derived replay `intent_key`, never a reopen of
      the terminal one, per the locked DB3 §3 rule 2.
  16. **[MD] Shared package ownership:** `packages/notification-delivery`
      (`@embroidery/notification-delivery`) is the single authority for the
      envelope schema, version constant, secret-kind discriminator and AEAD
      implementation, sealed by `apps/api` and opened by `apps/worker`, with no
      app-to-app import and no third-party crypto dependency (§C.8.8).
- **Out of scope:** any runtime code, any endpoint, any provider choice, any key
  value.
- **Code areas:** `docs/implementation/*`, `docs/adr/backend/ADR-APP4-001-*`,
  `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md`,
  `tools/check-app4-g01.mjs` (+ its `.test.mjs`), policy seed data,
  `.env.example` (empty key declaration only).
- **Endpoints:** 0. **Prerequisites:** none. **Design:** `NONE`.
- **Verification:** `node tools/check-app4-g01.mjs` — asserts every named key
  exists with a value, that the anti-enumeration contract names exactly one
  status code, that `claimBatch` has no non-test caller, that the envelope key
  is declared empty in `.env.example` and is not the session pepper, and that no
  APP4 doc contains a literal code, token or key value; plus `pnpm format:check`
  on changed files.
- **Acceptance:** every value later checkpoints need is readable from
  configuration or a decision-register row; the gate fails if one is missing.
- **Stop if:** a required value is a genuine business decision with no
  conservative reversible default — record it as a routed decision and continue
  with the rest.
- **Delivered 2026-08-14 — `COMPLETE` (review pending).** Verdict `PASS`, no
  routed decision and no stop condition met. All sixteen scope items are locked
  by `IMP-D049` /
  [`ADR-APP4-001`](../../adr/backend/ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md),
  whose §14.1 fact table is the machine-checked authority; policy dataset
  `packages/database/seed/app4-policy-configuration.seed.json`; gate
  `node tools/check-app4-g01.mjs`. Report:
  [`../reports/APP4-G01-COMPLETION-REPORT.md`](../reports/APP4-G01-COMPLETION-REPORT.md).

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
  correlation-ID propagation. **[C1]** Owns the producer-side handoff shape: the
  encrypted delivery envelope (`APP4-G01` §7) written into
  `outbox_events.payload`. **`notification_intents.params` remains structurally
  secret-free** — the envelope never enters that column.

  **[MD] Creates `packages/notification-delivery`** (`@embroidery/notification-delivery`)
  and seals through it — the envelope schema, version constant, secret-kind
  discriminator and `node:crypto` AES-256-GCM implementation live there, **not**
  in `apps/api`, because `APP4-W01` opens the same format from `apps/worker`
  (§C.8.8). **[MD]** Writes the **non-secret linkage** on every delivery outbox
  event — `aggregate_kind = NOTIFICATION_INTENT`,
  `aggregate_id = notification_intent.id` — and extends the
  `OUTBOX_AGGREGATE_KINDS` application guard accordingly (§C.8.5).
- **Out of scope:** channel adapters, delivery, retry, decryption, rendering,
  Admin surface; any notification persistence, HTTP, provider SDK, template,
  repository, policy lookup or database access **inside** the shared package.
- **Code areas:** `packages/notification-delivery/` (new),
  `packages/persistence/src/platform/outbox-event-store.ts` (one constant entry),
  `apps/api/src/modules/notification/application/`, `notification.module.ts`,
  `bootstrap/app.module.ts`.
- **Endpoints:** 0. **Prerequisites:** `APP4-P01`, `APP4-G01`. **Design:** `NONE`.
- **Verification:** module-scoped integration tests — duplicate outbox event
  yields one intent (`replay` outcome); `params` structurally cannot carry a
  code or token; masked recipient never equals the raw value; **[C1]** a sealed
  envelope round-trips, a tampered ciphertext or tag fails authentication rather
  than decrypting, and the persisted payload contains no plaintext substring of
  the secret; **[MD]** every delivery event carries the intent linkage and is
  resolvable by it without reading `payload`; contract gate
  `node tools/check-app4-b01.mjs`, extended to assert that
  `packages/notification-delivery` declares no dependency on `apps/*`,
  `@embroidery/persistence` or `@embroidery/database`, and that no AES-GCM
  implementation exists outside it.
- **Acceptance:** an intent exists for a business event with no secret in any
  persisted column, and the only place delivery material exists is the sealed
  envelope on the transient outbox row.
- **Stop if:** a template reference would require a rendered body — it must not;
  or the envelope would have to be written to `params` — it must not.

---

### `APP4-W01` — Notification delivery worker

- **Context / owner:** Worker (`apps/worker`).
- **Purpose:** One cohesive worker responsibility — deliver a pending intent.
- **Scope:** Register a `notification.delivery` job kind in the existing
  `JobHandlerRegistry`; claim through `WorkerJobQueueRepository` (§C.4);
  **[C1] decrypt the delivery envelope only after the claim succeeds**, holding
  plaintext in worker memory only until the send returns — **[MD] opening it
  through `@embroidery/notification-delivery`, the same package `APP4-B01` seals
  with, so exactly one AEAD implementation and one version constant exist across
  both processes; `apps/worker` imports no `apps/api` code**; a provider-neutral
  `NotificationChannelPort`; a **recording dev adapter** that performs no
  external call and exposes the decrypted value only in dev/test process memory;
  append a `notification_delivery_attempts` row per try with `outcome` and a
  bounded `error_class`; bounded retry using the existing `retry-schedule`;
  **[C1] a transport retry re-reads and re-decrypts the same envelope and mints
  no new secret** (§C.7.2 items 9–10) — the **same outbox row** is re-leased,
  never a new one; `FAILED_TERMINAL` or an exhausted budget → attempt
  `FAILED_TERMINAL`, intent terminal-failed (TR-NTF-05) and **[MD] the source
  outbox row left in `DEAD_LETTER`, where it stays as immutable terminal
  evidence** — the worker never resets it and neither does anything else
  (§C.8.3); duplicate-safe (a replayed job never double-sends a delivered
  intent).
- **Out of scope:** any real provider or SDK; templates as content; HTTP;
  minting or re-minting any secret; issuing a replacement challenge or grant.
- **Code areas:** `apps/worker/src/jobs/notification-delivery/`.
- **Endpoints:** 0. **Prerequisites:** `APP4-B01`, `APP4-G01`. **Design:** `NONE`.
- **Verification:** worker-scoped integration tests — retryable failure
  re-leases and increments attempts, terminal failure stops and is observable,
  a replayed claim after `SATISFIED` sends nothing; **[C1]** two consecutive
  transport attempts deliver the *identical* secret and leave the challenge/grant
  row untouched; a decrypt failure is a bounded `error_class`, never an error
  message carrying ciphertext or key material; `node tools/check-app4-w01.mjs`
  asserting no provider SDK import, no third-party crypto dependency, and that
  the decrypted value appears in no log line, attempt row, `background_job_attempts`
  row or audit record.
- **Acceptance:** delivery outcome is readable from data, not from logs, and the
  plaintext secret exists nowhere outside worker memory and the outbound message.
- **Stop if:** a provider decision is demanded — it is not; the port plus the
  recording adapter satisfy the phase exit gate (§I). Stop also if delivery would
  require regenerating the secret — that is a business resend owned by `APP4-B03`.

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
  `POST /public/verification/challenges/{challengeId}/resend`; CST-007
  single-open-challenge handling (mark stale `EXPIRED`, insert, treat 23505 as
  the concurrent-issuer loss, CC-17); issuance rate limit and resend cooldown
  from `APP4-G01`; optional `session_id` binding to an APP3 design session;
  responses carry a challenge id and expiry, never a code.

  **[C1] The atomic issue path.** All four steps run inside one
  `transactions.runInTransaction(...)`, following the existing outbox pattern in
  `apps/api/src/modules/asset/application/upload-transactions.service.ts`
  (business write + `outbox.append` in a single transaction). **There is no
  dual-write and none is invented:**
  1. mint the raw code (`APP4-P01`);
  2. persist **only** `code_hash` on the challenge;
  3. create the secret-free notification intent (`APP4-B01`);
  4. append the outbox event whose payload carries the **encrypted delivery
     envelope** holding that one raw code.

  Either all four commit or none does, so a challenge can never exist with no
  way to deliver its code, and a delivery envelope can never exist for a
  challenge that was rolled back. The raw code leaves the request only through
  the sealed envelope.

  **[C1] Resend is a business operation, not a transport retry.** The resend
  endpoint issues a *new* challenge and a *new* code under the `APP4-G01`
  cooldown. It never re-sends an existing envelope; `APP4-W01` owns that.
- **Out of scope:** code submission, customer creation, grants, transport retry.
- **Endpoints:** **2**. **Prerequisites:** `APP4-B01`, `APP4-P01`, `APP4-G01`.
  **Design:** `NONE` (contract only; the screen is `APP4-S01`).
- **Verification:** module integration tests + `node tools/check-app4-b03-contract.mjs`;
  assertions that no response, log line or audit record contains the code;
  **[C1]** a forced failure after step 2 leaves no challenge row, and the
  persisted outbox payload contains no plaintext substring of the code.
- **Acceptance:** a code reaches the recording adapter and nowhere else.
- **Stop if:** the response would have to distinguish "target unknown" —
  it must not; or the four steps cannot share one transaction with existing
  infrastructure — they can, per the cited pattern.

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
  (`APP4-P01`), **persist the hash only**, set `expires_at` from
  `grant.standard`; reissue rotates the token and supersedes the prior grant
  (`REVOKED`, reason `superseded`) inside one transaction so CST-009 holds;
  revoke with a mandatory reason; a `StepUpWindow` service over
  `hasRecentCompleted`; audit issue / reissue / revoke.

  **[C1] Token handling.** The raw token is returned **once** to the authorized
  in-process caller (APP5 at submission). When the caller also requests
  notification, the raw token is placed **only** inside the encrypted delivery
  envelope, appended to the outbox in the same transaction as the grant write —
  the same pattern `APP4-B03` uses. The raw token is **never** written to
  `notification_intents.params` and never to any other persisted column.
  `APP4-G01` §7 owns the envelope's `secret kind` discriminator that tells the
  worker it is rendering a secure link rather than a code.

  **[C1] Message form.** The secure-link message renders the **fragment** form
  `https://<storefront>/<secure-link-route>#t=<token>` (§C.7.4). The rendered
  URL exists only in the outbound message; no server-visible path or query ever
  carries the token.
- **Out of scope:** any HTTP endpoint; action-scope enumeration (§C.3);
  Custom Request creation; delivery itself.
- **Endpoints:** 0. **Prerequisites:** `APP4-B04`, `APP4-P01`, `APP4-B01`,
  `APP4-G01`. **Design:** `NONE`.
- **Verification:** module integration tests using the DB7 `order-fixture` to
  seed a `custom_requests` row — concurrent reissue leaves exactly one `ACTIVE`
  grant; a revoked grant carries a reason; the raw token is returned once and
  never persisted; **[C1]** the intent row and its `params` contain no plaintext
  substring of the token, while the sealed outbox envelope round-trips to it;
  `node tools/check-app4-b05.mjs` asserting no token column write outside the
  hashing path and no token write into `params`.
- **Acceptance:** APP5 can issue a grant by calling one port method, and a
  deliverable secure link exists without any plaintext token at rest.
- **Stop if:** a caller wants a per-action scope column — it is additive and
  out of phase; or a caller wants the raw token persisted for later resend —
  reissue rotates the token instead (ADR-DB3-004 r6).

---

### `APP4-B06` — Public secure-link resolution

- **Context / owner:** Customer module — the phase's highest-risk public surface.
- **Purpose:** Resolve a valid link, and be silent about every other case.
- **Scope:** One endpoint, `POST /public/secure-links/resolve`. **[C1] The token
  is accepted in the request body only.** The absolute rule "never in a URL" is
  replaced by the precise `APP4-G01` rule (§C.7.4): never in a server-visible
  path or query, never in a server/gateway/proxy access log, allowed only in the
  client-side fragment of the outbound link, stripped at bootstrap. The API
  never echoes the raw token. `resolveActive` under the caller's request; a
  single identical failure response for absent / expired / revoked / superseded /
  wrong-target / wrong-purpose; no timing or body difference between them;
  constant response shape; rate limiting; audit of use.
- **Out of scope:** consuming the grant for a business action; issuing;
  revoking; any APP5/APP6/APP7 action; any `GET` form that would put the token
  in a path or query.
- **Endpoints:** **1**. **Prerequisites:** `APP4-B05`, `APP4-G01`.
  **Design:** `NONE` (the screen is `APP4-S02`).
- **Verification:** module integration tests covering all six rejection causes
  producing byte-identical responses; `node tools/check-app4-b06-contract.mjs`
  asserting exactly one documented failure status **and** that no APP4 route
  declares a token path parameter or query parameter; a log-scan assertion that
  the token appears in no application or gateway access log.
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
- **Purpose:** Answer "was it sent, and why did it fail?" and perform manual
  transport replay. **[MD] This checkpoint owns the manual-replay policy APP2
  deferred to a later approved checkpoint** (§C.8.1).
- **Scope:** `GET /admin/notification-intents` (filter by status; masked
  recipient; template reference; attempt timeline) and
  `POST /admin/notification-intents/{intentId}/replay`.

  **[MD] The replay operation, exactly** (§C.8.3–§C.8.7), in **one**
  transaction:
  1. lock/read the intent; require it terminal-failed;
  2. resolve the terminal source outbox event through the **non-secret linkage**
     (`aggregate_kind = NOTIFICATION_INTENT`, `aggregate_id = intent.id`) —
     **never** by querying `payload`;
  3. require the source event's status to be `DEAD_LETTER`;
  4. verify the underlying secret is still eligible — challenge not expired,
     completed, invalidated or superseded; grant active, unexpired, unrevoked,
     unsuperseded (§C.8.6);
  5. copy the envelope ciphertext and `payload_schema_version` **byte-identically**
     from the terminal source event — **the API never decrypts**;
  6. append **one** new `PENDING` outbox event: new id, fresh attempt counter,
     same delivery event type, same ciphertext, same aggregate linkage;
  7. create the **new `PENDING` notification intent** under a derived replay
     `intent_key`, linked to the origin intent (§C.8.4) — the terminal intent is
     **not** reopened, per locked DB3 §3 rule 2;
  8. leave the old `DEAD_LETTER` row and the origin intent **unchanged**;
  9. audit the replay (actor, origin intent, new intent, reason).

  Ineligible source secret → an Admin-safe conflict with `REISSUE_REQUIRED`
  semantics, routing the operator to `APP4-B03` resend or `APP4-B05` reissue.
  Duplicate or concurrent calls → exactly one replay through the guarded
  transition; the loser receives the canonical current state and appends nothing.
- **Out of scope:** message bodies, provider consoles, campaign concepts,
  customer-visible surfaces; **[MD]** decrypting any envelope; minting any
  secret; mutating, resetting or re-claiming a `DEAD_LETTER` row; resetting any
  attempt counter; introducing a new idempotency framework.
- **Endpoints:** **2**. **Prerequisites:** `APP4-W01`, `APP4-G01`.
  **Design:** `NONE` (the screen is `APP4-A01`).
- **Verification:** module integration tests — replay on a `SATISFIED` intent is
  refused; attempts list shows `error_class` and never a provider body;
  **[MD]** replay appends exactly one new outbox row whose `payload` is
  byte-identical to the terminal source row's; the old `DEAD_LETTER` row is
  unchanged in every column; two concurrent replays produce exactly one new row;
  an expired challenge and a revoked grant each yield `REISSUE_REQUIRED` with no
  new row; `node tools/check-app4-b08-contract.mjs` asserting the module imports
  no `open`/decrypt symbol from `@embroidery/notification-delivery` and issues no
  `UPDATE` against `outbox_events`.
- **Acceptance:** terminal failure is visible and recoverable from the Admin app
  without any plaintext secret existing in the API process at any moment.
- **Stop if:** replay would need to reconstruct a code — it must re-derive
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
- **Scope:** The secure-link route locked at `APP4-G01`, and **[C1] the fragment
  bootstrap** (§C.7.4), which is the checkpoint's defining behaviour and runs in
  this exact order:
  1. read the token from the `#t=` fragment locally — it was never sent to the
     origin, so no Storefront server log or Nginx access log can hold it;
  2. **immediately** strip the fragment with `history.replaceState`, before any
     analytics, beacon, third-party script or unrelated client work runs on this
     route;
  3. hold the raw token in **one ephemeral local variable** — never Zustand,
     never TanStack Query cache data, never `localStorage`/`sessionStorage`,
     never a cookie, never persisted React/Next state, never an analytics event;
  4. `POST /public/secure-links/resolve` with the token in the **body**;
  5. discard the variable once resolution succeeds or fails.

  The valid state then renders only what the grant authorizes at
  `REQUEST_ACCESS` granularity; the single indistinguishable rejection state is
  unchanged.
- **Out of scope:** request/quotation/payment content (APP5–APP7); step-up
  action wiring; any token-bearing query parameter or path segment.
- **Prerequisites:** `APP4-D01`, `APP4-B06`, `APP4-G01`.
  **Design:** depends on `APP4-D01`.
- **Verification:** component tests for both states + a scoped runtime check;
  an assertion that the rejection view is identical for every cause; **[C1]** a
  browser-level assertion that after bootstrap `location.hash` is empty and the
  history entry carries no token, that no storage key or query-cache entry
  contains it, and that no network request other than the resolve `POST` fires
  before stripping.
- **Acceptance:** the rejection view cannot be used to distinguish causes, and a
  customer who clicks the link ends on a clean URL with the token gone from the
  address bar and from history.
- **Stop if:** the valid state has nothing to render because APP5 owns the
  content — render the authorized shell and record the seam; or a design or
  analytics requirement would run a script before stripping — it must not.

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
APP4-G01 ─┬─> APP4-D01 ──────────────┬─> APP4-S01
          │                          ├─> APP4-S02
          │                          └─> APP4-A01
          └─> APP4-P01 ─┬─> APP4-B01 ─┬─> APP4-W01 ─> APP4-B08
                        │             │
                        │             ├─> APP4-B03 ─> APP4-B04 ─> APP4-B05 ─┬─> APP4-B06 ─> APP4-S02
                        │             │                     ▲               │
                        │             └─────────────────────┼───────────────┘
                        └─> APP4-B02 ──────────────────────┘        └─> APP4-B07

  APP4-S01, APP4-S02, APP4-A01, APP4-B07, APP4-B08 ──> APP4-E01 ──> APP4-X01
```

**[C1] Two dependency edges were added** — the only boundary change the
correction required. `APP4-B03` and `APP4-B05` now both depend on `APP4-B01`,
because each enqueues an encrypted delivery envelope and `APP4-B01` owns the
envelope format and the AEAD abstraction that seals it. `APP4-G01` was already
an ancestor of everything. **No checkpoint was added, removed, merged or
re-scoped, and no endpoint count changed.**

**[MD] The mandatory closure changed no edge and no count.** It moved code
ownership (the envelope codec from `apps/api` into
`packages/notification-delivery`, still introduced by `APP4-B01` and still
consumed by `APP4-W01`) and it specified `APP4-B08`'s existing second endpoint,
which was already counted. **17 checkpoints, 10 endpoints, unchanged.** The only
edits were to code areas, scope text and verification strategy.

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

1. A challenge is issued to a contact target. **[C1]** The code plaintext is
   absent from `contact_verification_challenges`, from every log line and from
   the E01 report, yet the worker decrypts the delivery envelope after claiming
   the outbox job and the real code arrives at the recording adapter.
2. A notification intent is created exactly once for that challenge, with no
   code in `params`, and is delivered by the worker with an attempt row.
3. Submitting the correct code verifies the challenge and creates exactly one
   customer with one verified, primary contact.
4. A secure grant is issued for that customer against a **fixture-seeded**
   `custom_requests` row. **[C1]** The token plaintext is absent from
   `secure_access_grants`, from `notification_intents.params`, from every log
   line and from the E01 report, yet the worker decrypts it and the recording
   adapter receives a message carrying the **fragment** form
   `…/<secure-link-route>#t=<token>`.
5. **[C1]** A browser starts from that fragment-bearing link, strips the
   fragment before any other client activity, `POST`s the token in the body, and
   ends on a clean URL with no token in the address bar, in history, or in any
   browser storage. The valid state renders the authorized shell.
6. Each of **invalid, expired, replayed-after-revocation, revoked, superseded
   and wrong-purpose** usage returns the identical rejection, and the Storefront
   renders the identical view.
7. An operator sees the verification status, revokes the grant, and observes
   the previously valid link stop resolving.
8. A forced terminal delivery failure is visible in Admin and retryable.
9. **[C1] A transport retry re-sends the same secret.** A forced retryable
   failure followed by a successful attempt delivers the *identical* code or
   token, and the `contact_verification_challenges` / `secure_access_grants` row
   is byte-identical before and after — no new challenge, no new grant, no
   rotated token.
10. **[C1] A business resend is visibly different.** Calling the `APP4-B03`
    resend endpoint produces a *new* challenge with a *new* code and a new
    envelope, under the `APP4-G01` cooldown — proving retry and resend are not
    the same operation.
11. **[MD] Automatic retry uses the same outbox row.** Across a retryable
    failure and the following attempt, the outbox event **id** is unchanged and
    the `payload` is byte-identical.
12. **[MD] Terminal failure produces `DEAD_LETTER`.** A forced terminal failure
    leaves the source outbox row in `DEAD_LETTER` and the intent terminal-failed.
13. **[MD] Admin replay creates a new outbox event id** carrying a
    **byte-identical** encrypted payload and the same
    `payload_schema_version` — proving the ciphertext was copied, not re-sealed,
    and therefore never decrypted.
14. **[MD] The old `DEAD_LETTER` row is unchanged** after replay — every column,
    including `attempt_count`, `status`, `last_error` and `dispatched_at`,
    compared before and after.
15. **[MD] The source challenge/grant is unchanged** after replay — no new code,
    no rotated token, no lifecycle move on the origin record.
16. **[MD] Concurrent Admin replays append exactly one event.** Two simultaneous
    replay calls yield one new outbox row and one new intent; the loser returns
    the canonical current state.
17. **[MD] A stale source secret refuses replay.** An expired challenge and a
    revoked grant each return `REISSUE_REQUIRED`, append no outbox row, and
    create no intent.
18. **[MD] Business resend/reissue is observably different from replay** — it
    produces a new secret and a **new** envelope whose ciphertext differs from
    the terminal row's, closing the three-contract distinction end to end.

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
| 3a | **[C1]** Transient delivery secret encrypted at rest | `APP4-G01` (format, key, fail-closed), `APP4-B01` (seal), `APP4-B03`/`APP4-B05` (enqueue in the business transaction) | Persisted `outbox_events.payload` contains ciphertext + nonce + tag and no plaintext substring; a tampered tag fails authentication; `notification_intents.params` never carries the envelope |
| 3b | **[C1]** Decrypt lifetime is worker-only and post-claim | `APP4-W01` | Decryption happens only after a successful claim; plaintext reaches no attempt row, `background_job_attempts` row, audit record, log line or error message |
| 3c | **[C1]** Secure-link token carried only in the client-side fragment | `APP4-G01` (rule), `APP4-B05` (renders the fragment form), `APP4-B06` (body-only intake) | No APP4 route declares a token path or query parameter; the token appears in no application or gateway access log |
| 3d | **[C1]** Fragment removed before analytics or any other client activity | `APP4-S02` | Browser assertion: `location.hash` empty and history clean after bootstrap; no network request other than the resolve `POST` fires first; token in no storage or query cache |
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
| 13a | **[C1]** Transport retry and business resend are semantically separate | `APP4-G01` (definitions), `APP4-W01` (retry mints nothing), `APP4-B03` (resend mints a new challenge) | Two transport attempts deliver the identical secret with the source row unchanged; a resend produces a new challenge, code and envelope under the cooldown |
| 14a | **[MD]** Terminal evidence is immutable across manual replay | `APP4-G01` (rule), `APP4-W01` (leaves `DEAD_LETTER`), `APP4-B08` (never mutates it) | Every column of the old `DEAD_LETTER` row compared before and after replay; the B08 gate asserts no `UPDATE` against `outbox_events`; the origin intent stays terminal |
| 14b | **[MD]** Manual replay never decrypts | `APP4-B08` | Byte-identical ciphertext and `payload_schema_version` on the new row proves a copy, not a re-seal; the gate asserts the module imports no `open`/decrypt symbol |
| 14c | **[MD]** Stable non-secret intent↔outbox linkage | `APP4-G01` (mapping), `APP4-B01` (writes it), `APP4-B08` (reads it) | Every delivery event resolves to its intent through `aggregate_kind`/`aggregate_id` without reading `payload`; no query touches ciphertext; no column added |
| 14d | **[MD]** Duplicate/concurrent Admin replay is safe | `APP4-B08` | Two simultaneous replays produce exactly one new outbox row and one new intent; the loser appends nothing and no attempt counter is reset |
| 14e | **[MD]** Replay eligibility tracks the secret's current lifecycle | `APP4-G01` (rule), `APP4-B08` (enforcement) | An expired/completed/superseded challenge and an expired/revoked/superseded grant each yield `REISSUE_REQUIRED` with no row appended, routing to `APP4-B03`/`APP4-B05` |
| 14f | **[MD]** One envelope codec across API and worker | `APP4-G01` (boundary), `APP4-B01` (seals), `APP4-W01` (opens) | `@embroidery/notification-delivery` is the only AES-GCM implementation and the only envelope-version constant; gates assert no app-to-app import, no third-party crypto dependency, and no AEAD code outside the package |
| 14 | Terminal failure observability | `APP4-W01`, `APP4-B08` | `FAILED_TERMINAL` attempt + `FAILED` intent visible and retryable in Admin |

Cross-cutting: **audit** (INV-14) is written by `APP4-B02` (link/attach),
`APP4-B04` (verification outcome) and `APP4-B05` (issue/reissue/revoke).

**[C1]** The original fourteen invariants are unchanged. `APP4-P00-C1` adds five
— 3a, 3b, 3c, 3d and 13a — covering the encrypted transient secret, the
worker-only decrypt lifetime, the fragment-only link carrier, fragment removal
before analytics, and the retry-versus-resend separation.

**[MD]** The mandatory closure adds six more — 14a–14f — covering immutable
terminal evidence, replay without decryption, the non-secret intent↔outbox
linkage, duplicate-replay safety, replay eligibility against the secret's
current lifecycle, and single-authority envelope codec ownership. Nothing was
deleted. **25 invariants, all owned.**

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

## J. Decisions

### `APP4-PO-001` — Notification channel and provider (`IMP-O006`) — **`PO_ACCEPTED / NON_BLOCKING`**

- **Status:** **Resolved for APP4** by the Product Owner at `APP4-P00-C1`. This
  is no longer an open APP4 decision and no APP4 checkpoint awaits it.
- **Decision as accepted:** APP4 selects **no external provider**. It ships
  `NotificationChannelPort` plus a recording development adapter that performs
  no external call.
- **What remains:** `IMP-O006` stays recorded against its existing production
  due condition — "before production notification delivery", which APP4 does not
  perform. The first work that cannot proceed without a concrete provider is
  production notification delivery in **APP12**. That is a future-phase
  follow-up, not an unresolved APP4 decision.
- **Why this was the recommendation:** locking a provider now was premature —
  nothing in APP4's exit gate requires real delivery, and the choice is better
  made against APP12's production constraints. A direct SMTP adapter was
  rejected as a provider choice wearing a protocol's name, moving the OTP
  through an unreviewed path.
- **Bearing on `APP4-P00-C1`:** the encrypted delivery envelope (§C.7.2) is
  provider-neutral by construction — it terminates at `NotificationChannelPort`,
  so selecting a provider later changes the adapter behind the port and nothing
  about the carrier, the key authority or the secret-lifetime rules.

No item met the TRUE_PO_DECISION test after this acceptance; the ledger is
empty. Policy durations, attempt limits, route slugs and the envelope-key
configuration shape are all resolvable at level 4 (conservative, reversible,
scope-minimizing) and are locked in `APP4-G01`, where a wrong value is corrected
by appending a policy-configuration version rather than by changing code. No
production key value is invented or committed anywhere in this manifest.

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

**Update 2026-08-14 — `APP4-G01` is delivered** (`PASS`, review pending; §F).
The route slugs it owed `APP4-D01` are locked: Storefront `/xac-minh-lien-he`
and `/truy-cap`, Admin `/support/customer-access`. **The next checkpoint is
`APP4-D01`.**
