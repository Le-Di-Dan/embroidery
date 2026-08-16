# APP5-G01 — Submission, Moderation and Intake-Abuse Authority

**Date:** 2026-08-16 · **Branch:** `production` · **HEAD at entry:** `ffb43c9`
**Checkpoint type:** authority / policy. No runtime code, schema, migration,
contract, generated artifact or Figma node changed.

---

## 1. Scope and precedence

This document is the single authority that `APP5-D01`, `B01`, `B02`, `B03`,
`B04` and `B05` cite instead of re-deriving cross-context behaviour. It covers
exactly eight areas: the APP5 LC-11 transition subset, the submission subject
invariant, the `request.submit` idempotency contract, request-code policy, the
asset-role matrix, customer attachment-intake abuse policy, notification
mapping, and audit/correlation rules.

**Precedence.** Locked lifecycle, guard, idempotency and schema authority wins
over planning prose. In order: `DB3_LIFECYCLE_SPECIFICATIONS.md` §LC-11 ·
`DB3_TRANSITION_GUARD_CATALOG.md` · `DB3_IDEMPOTENCY_SPECIFICATION.md` +
`ADR-DB1-017` · `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` ·
`ADR-DB3-002` (cancellation stage matrix) · `DB4_COLUMN_DICTIONARY.md` /
`DB4_TABLE_CATALOG.md` TBL-037…042 · `09-SECURITY-AND-ABUSE-PREVENTION.md` §4
(+ `IMP-D044`, `IMP-D048`) · the delivered `apps/api/src/modules/order`
persistence layer.

**Notation.** Every rule is either *inherited* (cited) or an
**`APP5-G01 DECISION`** (numbered `G01-D01`…`G01-D14`, collected in §12). The
two are never blurred.

**Not in scope.** Order, quotation, design-review, payment, production,
inventory, CRM and refund governance. See §10.

---

## 2. APP5 transition subset matrix

Inherited. LC-11 has eleven transitions; APP5 owns six. `TR-LC11-05…09` are
driven by quotation and design-version events owned by APP6+ and are
**unavailable to APP5** — neither offerable in UI nor acceptable at the API.

Two generic guards apply to every row and are not repeated: **GRD-019**
(transition legality) and **GRD-025** (actor authorization). GRD-019 is already
enforced in persistence by `isLegalRequestTransition` under
`SELECT … FOR UPDATE` (`drizzle-custom-request.repository.ts`), against the
**full** LC-11 table — which is correct for a lifecycle guard but is *not* an
APP5 phase gate. The APP5 subset below is an **additional** application-layer
restriction that `B05` must impose on top of it (`G01-D07`).

| TR | From → To | Actor kind | Guards (beyond GRD-019/025) | Reason | Note row | Transition row | Correlation | Notification | UI may offer | API accepts |
|---|---|---|---|---|---|---|---|---|---|---|
| **TR-LC11-01** | *(submit)* → `NEW` | `CUSTOMER` | **GRD-001** verified customer; **GRD-027** session active *(catalog branch only)*; **GRD-012/030** idempotency claim + fingerprint | no | no | **none** (`G01-D05`) | required | SE-003 (§8) | n/a — it is the submission | `B01` |
| **TR-LC11-02** | `NEW` → `UNDER_REVIEW` | `ADMIN` | — | optional | optional | yes | required | none | yes | `B05` |
| **TR-LC11-03** | `UNDER_REVIEW` → `NEEDS_CLARIFICATION` | `ADMIN` | — | **required (R)** | **required**, kind `CLARIFY` | yes | required | SE-004 (§8) | yes | `B05` |
| **TR-LC11-04** | `NEEDS_CLARIFICATION` → `UNDER_REVIEW` | `ADMIN` | — | optional | optional | yes | required | none | yes | `B05` |
| **TR-LC11-10** | `UNDER_REVIEW` \| `NEEDS_CLARIFICATION` → `REJECTED` | `ADMIN` | ADR-DB3-002 S1/S2 disposition | **required (R)** | **required**, kind `REJECT` or `SPAM` | yes | required | SE-012 (§8) | yes | `B05` |
| **TR-LC11-11** | `NEW` \| `UNDER_REVIEW` \| `NEEDS_CLARIFICATION` → `CANCELLED` | `ADMIN` (`G01-D06`) | **GRD-020** stage policy, **stage S1 only** | **required (R)** | optional | yes | required | SE-012 (§8) | yes | `B05` |

`R` = reason required, per `DB3_LIFECYCLE_SPECIFICATIONS.md` conventions
(*"audit event with actor/timestamp (+reason where marked R)"*).

### 2.1 Two authority reconciliations

**`G01-D04` — GRD-002 does not apply to TR-LC11-01.** The LC-11 row lists
guards *"GRD-001/002/027"*, but GRD-002 (*grant ACTIVE, scope covers action,
request match*) cannot be evaluated at submission: the grant is an **output** of
the same W1 transaction, and `SecureGrantIssuer` requires a `customRequestId`
that does not exist until this transaction creates it (`APP4-X01` §Q). GRD-002
therefore governs every *subsequent* customer action on the request —
`APP5-B03`'s grant-scoped status read above all — and not the submission
itself. Consistent with the guard catalogue's own scope for GRD-002 (*"all
customer secure actions"*), which submission is not: submission is authorized by
GRD-001, not by a grant.

**`G01-D03` — the `CC-18` label is stale, and no DB8 row covers duplicate
submit.** `DB3_LIFECYCLE_SPECIFICATIONS.md` names TR-LC11-01's concurrency case
`CC-18 duplicate submit`. `DB8_RACE_COVERAGE_MATRIX.md` states in its own header
that *"CC numbering is renumbered here for a clean, gap-free sequence"*, and its
`CC-18` is an unrelated inventory race (stock ledger append vs adjustment). The
matrix contains **no** duplicate-submit row at all, for the same reason it
records for CC-13 — no application-layer consumer existed when DB8 ran. This is
citation drift plus a genuine coverage gap, not a contradiction: the semantics
are fully specified by `ADR-DB1-017` and the idempotency specification. APP5
cites **`DB3 CC-18`** by that qualified name, and `APP5-B01` is the first
implementation of the race. Its arbiter is fixed in §4.

---

## 3. Submission subject invariant

A submission represents **exactly one** product context.

Inherited (`DB4_COLUMN_DICTIONARY.md` COL-TBL037-04): *"store-product subject
(NULL when COP subject; **subject-presence rule = TX/App, cross-table**)"*, and
`custom-requests.ts`: *"no same-row CHECK can see it and none is faked."*

| | Catalog branch | Customer-owned-product branch |
|---|---|---|
| `custom_requests.product_id` | **required** | **must be NULL** |
| `custom_requests.product_variant_id` | **required** (`G01-D08`) | must be NULL |
| `customer_owned_products` row | **must not exist** | **required**, exactly one (`uq_customer_owned_products__request`) |
| `custom_requests.submitted_session_id` | **required** | **must be NULL** (`G01-D09`) |
| Design session | required, `ACTIVE`, GRD-027 | **impossible** — `design_sessions.product_id` is `NOT NULL` |
| Design case header | created (TR-LC11-01) | created (TR-LC11-01) |
| Quantity breakdown | required, ≥1 line, each line's `product_variant_id` must equal the request's | optional; lines carry `size_label` + `quantity`, `product_variant_id` **must be NULL** |
| Attachments | `REFERENCE` / `ATTACHMENT` (optional) | **≥1 `COP_IMAGE` required** (`G01-D10`), plus optional `REFERENCE` |

**Both branches present ⇒ reject. Neither branch present ⇒ reject.** Both are
`SUBMISSION_SUBJECT_INVALID` (§9.3), evaluated in the submission transaction
before any write.

- **`G01-D08` — the catalog branch requires a variant, not just a product.**
  `design_sessions.product_variant_id` is nullable but
  `design_versions.product_variant_id` is `NOT NULL`, and
  `custom_request_quantity_breakdowns` keys lines by variant. A request that
  reaches APP6 without a variant cannot be quoted or digitized. Requiring it at
  intake is the only place the gap is cheap to close.
- **`G01-D09` — `submitted_session_id` is server-set from the submitted
  session, never client-supplied.** It is documented provenance with no FK
  (sessions are hard-TTL-deleted); allowing a client value would let a caller
  attribute their request to someone else's session.
- **`G01-D10` — a COP request must carry at least one `COP_IMAGE`.** A
  customer-owned garment has no catalog media, no design session and no design
  document (§7); without a photograph, nothing in the record describes the
  physical object an Admin is asked to triage. `customer_owned_products` cannot
  express this (the assets live in a sibling table), so it is an application
  invariant.

Dimensions on the COP row, when supplied, are already constrained positive by
`ck_customer_owned_products__dims_positive`; APP5 adds no second rule.

---

## 4. `request.submit` idempotency contract

Inherited model: `ADR-DB1-017` (DB-arbitrated record, unique
`(operation_namespace, scope_key)`, fingerprint, `IN_PROGRESS → COMPLETED`) and
the `request.submit` row of `DB3_IDEMPOTENCY_SPECIFICATION.md`. Infrastructure
already exists — `idempotency_records` (LC-23) plus `IdempotencyStore` and
`IdempotencyAllocationStore` in `packages/persistence`, proven in asset intake.
**No parallel deduplication mechanism may be introduced.**

| Element | Value |
|---|---|
| `operation_namespace` | `request.submit` — a constant, not a free string (`ADR-DB1-017` r1) |
| `scope_key` | **the verified `SUBMISSION`-purpose challenge id** (`G01-D01`) |
| Client-supplied idempotency key | **none, and none accepted** (`G01-D01`) |
| Fingerprint inputs | §4.2 (`G01-D02`) |
| Arbiter | `uq_idempotency_records__namespace_scope_key` — the database, per GRD-012 |
| Claim | `IdempotencyAllocationStore` claim inside the submission transaction |
| `IN_PROGRESS` replay | deterministic retryable in-progress outcome; **never a second execution** (`ADR-DB1-017` r3) |
| `COMPLETED` replay | replay the stored result — **request id + code** (spec's *Result replay* column) |
| Same key, different fingerprint | `IDEMPOTENCY_CONFLICT`, audited (GRD-030); never a silent overwrite, never a second request |
| Failed attempt | the transaction rolls back; the record does not survive as `COMPLETED`; a genuine retry re-claims. Stuck `IN_PROGRESS` follows the namespace timeout rule (`DB3_IDEMPOTENCY_SPECIFICATION.md` rule 2) — **never auto-repaired to `COMPLETED`** |
| Stored result | minimal: `{ requestId, code, status }` — refs only, redacted (`ADR-DB1-017` r4). **No grant token, no secure link, no contact value** |
| TTL class | `submission` (medium) |
| Transaction boundary | §4.3 |
| Race | `DB3 CC-18` (§2.1) |

### 4.1 `G01-D01` — the scope key is the verified challenge id

`DB3_IDEMPOTENCY_SPECIFICATION.md` specifies *"server-issued submission key
(session-bound)"*. The COP branch has no session, so "session-bound" cannot be
the universal anchor. The verified challenge is:

- **server-issued** — minted by `POST /api/public/verification/challenges`
  (`APP4-B03`); the client never chooses it;
- **universal** — GRD-001 makes a verified `SUBMISSION`-purpose challenge a
  precondition of *every* submission, both branches;
- **session-bound where a session exists** —
  `contact_verification_challenges.session_id` is a real FK to `design_sessions`
  (REL-007), so the specification's intent holds exactly on the catalog branch;
- **naturally one-to-one with a submission** — GRD-001 requires a *just-verified*
  contact, `VERIFICATION_PURPOSES` includes `SUBMISSION` precisely for this, and
  challenges are terminal after `VERIFIED` and hard-TTL-deleted. A second request
  therefore requires a fresh verification, which is the intended business rule,
  not a limitation;
- **bounded** — issuance is rate-limited by GRD-026 and every challenge carries
  `expires_at`.

**The client presents the challenge id and never a customer id.** The server
re-reads the `VERIFIED` challenge in-transaction and resolves the customer
through APP4's own path (`submit-verification-attempt.use-case.ts` already
establishes identity on `SUBMISSION` purpose, and the public verification
responses deliberately omit `customerId`). A client-supplied `customerId` would
be a direct impersonation vector; `custom_requests.customer_id` is therefore
**never** client-derived.

### 4.2 `G01-D02` — fingerprint inputs

Canonical hash over, in this order:

1. `subjectBranch` — `CATALOG` | `COP`
2. catalog branch: `productId`, `productVariantId`, `designSessionId`
   COP branch: COP `name`, `description`, `physicalWidthMm`, `physicalHeightMm`
3. the quantity-breakdown lines, ordered canonically by
   `(productVariantId, sizeLabel)`

**Deliberately excluded**, so an incidental difference cannot turn a retry into
a conflict: `customerNote`; attachment asset ids; and — a **documented deviation
from `DB3_IDEMPOTENCY_SPECIFICATION.md`, which lists "design document hash"** —
the design document hash itself.

The deviation is required by the rest of the locked model. The document hash is
server-derived from a session that autosaves concurrently (TR-LC07-02,
`CC-01`) and that **this very transaction** mutates `ACTIVE → SUBMITTED`. A
fingerprint including it would make the same submission, retried moments later
against a newer autosave revision, an `IDEMPOTENCY_CONFLICT` rather than a
replay — inverting the guarantee the contract exists to provide. `designSessionId`
is a strictly stronger and stable binding: the transaction freezes exactly that
session's document, so DB3's intent (bind the submission to its design content)
is preserved without the instability. `B01` must record this deviation in its
completion report.

### 4.3 `G01-D11` — what "exactly one request" protects

One successful `request.submit` claim yields **exactly one** of each of the
following, and a duplicate submit yields **none** of them a second time:

| Consequence | Protected by |
|---|---|
| `custom_requests` row | the idempotency claim (GRD-012) |
| `custom_requests.code` | the claim, plus `uq_custom_requests__code` |
| `customer_owned_products` row | the claim, plus `uq_customer_owned_products__request` |
| quantity-breakdown lines | the claim, plus `uq_request_quantity_breakdowns__request_variant_size` |
| `custom_request_assets` bindings | the claim, plus `uq_custom_request_assets__request_asset_role` |
| `design_cases` header | the claim |
| session `ACTIVE → SUBMITTED` | the claim, plus the guarded update's `status = 'ACTIVE'` predicate |
| `REQUEST_ACCESS` grant + its notification | the claim (`SecureGrantIssuer.issue` is called once inside it) |
| SE-003 outbox event | the claim (appended in the same transaction) |

**Transaction boundary.** The idempotency claim, every row above and the outbox
append are **one** transaction — the W1 transaction of TR-LC11-01. Nothing
external is called inside it (INV-23). Notification *delivery* is after-commit,
via the outbox and the APP4 worker.

---

## 5. Request code policy

Inherited: `COL-TBL037-01` — *"UQ; human request code (CON-073; **format
[cfg]**); **never an authz input**"*; `uq_custom_requests__code` is the
uniqueness arbiter. The format is configuration-deferred, so APP5 must choose
one.

| Rule | Value |
|---|---|
| Generator | server, inside the submission transaction |
| Client may supply | **no** — rejected, not ignored |
| Uniqueness arbiter | `uq_custom_requests__code` (a `23505` is retried, bounded) |
| Mutability | immutable after creation; no APP5 operation rewrites it |
| Authorization | **never** an authorization input — grant-scoped access is the mechanism (`APP5-B03`) |
| Format (`G01-D12`) | `REQ-` + 10 uppercase characters from the alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ`, drawn from a CSPRNG |

**`G01-D12` rationale.** The `REQ-` prefix matches the de-facto convention in
the delivered fixtures (`code: \`REQ-${id}\`` in
`custom-request.integration.spec.ts`, alongside `ORD-` for orders). The
alphabet excludes `0/O/1/I/L/U` because the code is read aloud and retyped from
chat. ~49 bits of entropy from a CSPRNG means codes are not a sequence, so the
code does not leak submission volume — while remaining, per `ADR-DB1-007`,
explicitly *not* a security boundary: authorization is.

---

## 6. Asset-role matrix

Inherited: `REQUEST_ASSET_ROLES = ['COP_IMAGE', 'REFERENCE', 'ATTACHMENT']`
(`custom-request-assets.ts` — the canonical closed set, verified against the
schema rather than assumed); `uq_custom_request_assets__request_asset_role`;
both FKs `restrict` because *"submitted evidence is retain-class"*; the table is
association-only — *"Asset owns all metadata."*

| Role | Branch | Required | Max per request (`G01-D13`) | Media | Bound at |
|---|---|---|---|---|---|
| `COP_IMAGE` | COP only | **≥1** (`G01-D10`) | 10 | JPEG / PNG / WebP | submission |
| `REFERENCE` | both | optional | 10 | JPEG / PNG / WebP | submission |
| `ATTACHMENT` | **neither — not exposed by APP5** (`G01-D14`) | — | — | — | — |

Binding rules, all branches:

- an asset is bound **only inside the submission transaction**; there is no
  post-submission attach operation in APP5;
- an asset may be bound only when its state is `ACCEPTED` — i.e. inspection has
  completed favourably (`ASSET_STATES`, `asset_inspections`). `UPLOADED`,
  `INSPECTING` or `REJECTED` ⇒ the submission is refused, not queued;
- an asset may be bound to **at most one** request, and only by the customer
  whose verified challenge authorized its upload (§7). Re-use of another
  request's asset is refused;
- `kind = CUSTOMER_UPLOAD`, `classification = CUSTOMER_PRIVATE` — inherited from
  `ASSET_KINDS` / `ASSET_CLASSIFICATIONS`;
- **no post-submission mutation in APP5.** Neither customer nor Admin adds,
  replaces or detaches a request asset after submission. The rows are retained
  evidence.

**`G01-D13`** — the per-role cap of 10 is an APP5 intake bound; no existing
authority sets a count limit (`IMP-D044` bounds bytes and pixels, not
cardinality). Ten is enough to photograph a garment from every side and small
enough that the Admin detail screen and the submission transaction stay bounded.

**`G01-D14` — APP5 does not expose `ATTACHMENT`.** The role exists in the schema
and stays there, but APP5's journey has exactly two customer-supplied asset
meanings: *this is the garment* and *this is what I want it to look like*. A
third, undifferentiated bucket would be a role whose triage meaning no screen
can explain. APP6+ may adopt it; APP5 rejects it at the contract boundary.

**APP3 design-session assets are not APP5 request assets.** They stay
session-scoped (`design_session_assets`) and reach the request only as the
frozen design document via `submitted_session_id`. APP5 never re-labels them.

---

## 7. Customer attachment intake abuse policy

This governs `APP5-B02`, which exists because the COP branch has no design
session and therefore no upload path (`APP5-R00` §5.5). **G01 defines the
policy; B02 builds the endpoint. No endpoint is created here.**

The controlling precedent is `IMP-D048` / `APP3-G08`
(`09-SECURITY-AND-ABUSE-PREVENTION.md` §4): *"A customer's Design Session upload
reaches storage only by streaming through the API… The browser is never given a
storage endpoint, a presigned URL, a storage credential or an upload token… one
multipart operation carries the whole lane."* APP5 adopts that lane wholesale
and changes exactly one thing — what authorizes it.

| Control | APP5 policy | Source |
|---|---|---|
| Who may initiate | a caller presenting a **`VERIFIED`, unexpired, `SUBMISSION`-purpose challenge id** whose challenge has not yet been consumed by a submission (`G01-D01`) | GRD-001; `VERIFICATION_PURPOSES` |
| Fully anonymous upload | **forbidden** | `IMP-D048` |
| Presigned URL / upload token / storage credential | **forbidden** — `ObjectStoragePort` exposes no presign operation | `IMP-D048` |
| Transport | one multipart operation, streamed through the API, which writes the private object itself | `IMP-D048` |
| Accepted media | `image/jpeg`, `image/png`, `image/webp` only — **SVG rejected**; client-declared MIME never trusted | `IMP-D044` PO-02…PO-05; §4 |
| Max source bytes | **10 MiB**, enforced on the stream | `IMP-D044` |
| Max intrinsic pixels | **4096 × 4096**; **16,777,216** decoded pixels; decompression-bomb protected | `IMP-D044` |
| Validation | size, MIME, file signature, extension consistency, image decode, pixel limit, processing timeout, storage isolation | §4 |
| Inspection | mandatory; the asset is not bindable until `ACCEPTED` (§6) | `ASSET_STATES`; SE-013 |
| Rate / quota | **max 20 accepted uploads per challenge**, and issuance itself is already cooldown- and attempt-limited | `G01-D13` bound + GRD-026 |
| Max bound per request | 10 per role (§6) | `G01-D13` |
| Object visibility | private; `CUSTOMER_PRIVATE`; never delivered by a generic route | §4, §5 |
| Duplicate upload | each upload yields its own asset; the request-side arbiter is `uq_custom_request_assets__request_asset_role` at binding, not at upload | `ADR-DB4-003` |
| Orphan cleanup | assets never bound to a request expire with their challenge's TTL class and are removed by the existing scheduled sweep (SE-015) with two-phase binary deletion (SE-014). **APP5 adds no new sweep** | SE-014/SE-015 |
| Abuse logging | rejected uploads are audited as abuse signals, consistent with GRD-001/GRD-026 `AuditF = yes` | guard catalogue |
| Disclosure on rejection | a single bounded reason class (too large / unsupported type / failed inspection). **Never** the detected MIME, signature bytes, scanner output, storage key or internal path | §4; `BACKEND_CONVENTIONS` §6 |

**Why the challenge is the right credential and no new capability is needed.**
Every COP submission already requires a verified contact (GRD-001), so the
customer must complete verification regardless; authorizing the upload with the
same evidence introduces no second credential architecture, no account, no
session table and no new secret. It is strictly narrower than the design-session
lane it mirrors: bounded by the challenge's `expires_at`, rate-limited at
issuance by GRD-026, and it dies the moment the challenge is consumed by a
submission. The challenge id is already treated as a client-held reference whose
disclosure is deliberately minimal — `GET /api/public/verification/challenges/{id}`
returns status and pointedly **no `customerId`** — so using it here grants no
capability it did not already confer.

**No product decision is required and none is deferred.** The two candidate
security models (a fresh bespoke upload credential vs. the existing verification
evidence) are not incompatible; the second is a subset of work already shipped,
so it is chosen.

---

## 8. Notification mapping

Inherited: `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`. The locked in-tx rule is
absolute — *"only audit rows (SE-019) and the outbox enqueue are
in-transaction; every other effect is after-commit via outbox (INV-23)"* — and
notification intents are created by the NTF consumer from outbox events.

**A constraint that shapes everything below:** APP4's `NotificationRequest`
requires a `secret` (*"the one raw code or token"*), a `secretKind`, and a
`reference` from a **closed two-member union** — `VERIFICATION_CHALLENGE` or
`SECURE_ACCESS_GRANT`. The pipeline is **secret-bearing by construction**. It
cannot express a secretless message, and it addresses a customer contact point,
not staff. APP4 also ships only the recording adapter — no provider is selected
(`IMP-O006` → APP12).

| APP5 action | SE | Outbox intent | Timing | Recipient | Notification intent in APP5 | Retry | May failure roll back state |
|---|---|---|---|---|---|---|---|
| TR-LC11-01 submit — **customer confirmation** | SE-003 / SE-002 | `grant.issued` | after-commit | the customer's verified contact point | **yes — already implemented.** `SecureGrantIssuer` + `SecureGrantNotifier` emit it (`SECURE_LINK_TEMPLATE_KEY`, `secretKind: SECURE_LINK_TOKEN`, `reference: SECURE_ACCESS_GRANT`) | APP4 outbox + worker | **no** |
| TR-LC11-01 submit — **admin alert** | SE-003 | `request.submitted` | outbox row appended in-tx; dispatched after commit | staff | **no** (`G01-D05b`) | n/a in APP5 | **no** |
| TR-LC11-03 needs clarification | SE-004 | `request.clarification-requested` | in-tx append | customer | **no** (`G01-D05b`) | n/a in APP5 | **no** |
| TR-LC11-10 rejected | SE-012 | `request.rejected` (+ customer-visible reason) | in-tx append | customer | **no** (`G01-D05b`) | n/a in APP5 | **no** |
| TR-LC11-11 cancelled | SE-012 | `request.cancelled` (+ customer-visible reason) | in-tx append | customer | **no** (`G01-D05b`) | n/a in APP5 | **no** |

### `G01-D05b` — APP5 emits outbox events; it creates no new notification intent

The customer's submission confirmation **is** the secure link, and it already
works: issuing the `REQUEST_ACCESS` grant inside the W1 transaction produces
exactly the notification SE-003's customer half calls for. APP5 adds nothing
there.

For the other four consequences APP5 writes the **outbox event only**. Creating
a notification intent for any of them would require inventing a third
`NotificationReference` kind and a secretless delivery path — a change to APP4's
notification architecture, which `APP5-G01` is explicitly scoped out of and
which no APP5 checkpoint owns. Deferring the *delivery* costs APP5 nothing it
needs: the durable business fact is the outbox row plus the transition row, the
Admin's actual alert surface in APP5 is the request queue (`B04`/`A01`), and no
provider exists to deliver to anyway until `IMP-O006` closes at APP12. The
outbox rows are written now precisely so the consumer can be added later without
reopening the transaction that produced them.

**Notification failure never rolls back request state**, in every row above —
the transaction has already committed and the outbox is at-least-once. Reason
text carried to a customer is `cancelled_customer_reason` /
`customer_visible_reason`, never the internal `reason` (`COL-TBL037-08/09`,
SE-012 *"reason text reviewed"*).

---

## 9. Audit and correlation rules

### 9.1 Transition evidence

Inherited from TBL-042 and the delivered `transition()`: the state change and
its transition row are **one write** — *"a state change with no transition row
would be a state nobody can explain."*

Every APP5 transition persists: `custom_request_id`, `from_status`,
`to_status`, `actor_kind`, exactly one populated actor reference, `reason` where
marked `R`, `customer_visible_reason` where the customer is told, and
`correlation_id` (**`NOT NULL`** — a request-context value, never a fabricated
constant).

`RequestActor` is already a closed union in the domain port —
`{ADMIN, adminId}` | `{CUSTOMER, customerId, grantId}` | `{SYSTEM, systemJobKey}`.
APP5 uses `ADMIN` for every moderation transition (§2) and does not use
`SYSTEM`: no APP5 transition is event-driven.

**`G01-D05` — creation writes no transition row.** `from_status` is `NOT NULL`
and CHECKed against the LC-11 set, so a creation event has no legal `from`
value, and the delivered `submit()` correspondingly inserts no transition row.
TBL-042 records *moves*; the request's existence at `NEW` with its `created_at`
is the creation fact. `B01` must not invent a `NEW → NEW` self-loop.

### 9.2 `audit_events`

**APP5 does not duplicate transition history into `audit_events`.** TBL-042 is
the ADR-DB4-002 Tier A history for LC-11 and is authoritative. `audit_events`
receives only what other authority already mandates independently — the
guard-failure abuse signals GRD-001/GRD-026 mark `AuditF = yes`, and the
GRD-030 fingerprint conflict.

### 9.3 Error codes

Guard failure codes are inherited concepts from the guard catalogue and keep
their meaning: `CUSTOMER_NOT_VERIFIED` (GRD-001), `SESSION_EXPIRED` /
`STALE_WRITE` (GRD-027), `INVALID_TRANSITION` (GRD-019), `FORBIDDEN` (GRD-025),
`CANCELLATION_NOT_ALLOWED` (GRD-020), `DUPLICATE_OPERATION` (GRD-012),
`IDEMPOTENCY_CONFLICT` (GRD-030), `GRANT_INVALID` (GRD-002, for `B03`).

APP5 adds `SUBMISSION_SUBJECT_INVALID` (§3) and `REQUEST_ASSET_NOT_BINDABLE`
(§6), named consistently with the existing catalogue. All travel in the standard
envelope (`BACKEND_CONVENTIONS` §6).

---

## 10. Explicit APP6+ exclusions

Not APP5's, and not to be implemented, offered or contracted by any APP5
checkpoint:

- `TR-LC11-05…09` — `QUOTED`, `QUOTE_ACCEPTED`, `DIGITIZING`, `DESIGN_REVIEW`,
  `APPROVED`, and guards GRD-005/006/007/008;
- **cancellation stages S2–S9** and the entire compensation saga (LC-21):
  production halt, inventory release/consume, obligation cancellation, refund
  records, quotation voiding, grant auto-revoke after a grace window. `G01-D06`
  bounds APP5 to stage **S1** — *"Before quotation sent"* — which is the only
  stage reachable from `NEW`/`UNDER_REVIEW`/`NEEDS_CLARIFICATION`. At S1 the
  matrix executes only steps 5 and 6 (terminal write + notify), requires no
  manual review and produces **no refund record**, so APP5 promises no
  compensation it cannot perform. `GRD-003` step-up is not required: it attaches
  to `cancel ≥ S5`;
- customer-initiated cancellation. `G01-D06` restricts TR-LC11-11 to `ADMIN` in
  APP5. ADR-DB3-002 S1 permits *"Customer (secure flow) or Admin"*, but the
  customer path needs a grant-authorized mutation (GRD-002) on a surface APP5
  builds only as a **read** (`B03`). Deferred to APP6 with the rest of the
  secure-flow write surface; the Admin path fully satisfies the APP5 journey;
- design versions, review, approval snapshots, quotations, orders, payments,
  production, inventory, refunds, CRM;
- a customer request **list** or customer account session (`APP5-R00` §5.3);
- new notification event vocabulary, a second delivery architecture, or provider
  selection (`IMP-O006` → APP12);
- the COP/design-version schema limitation — an **APP6-entry** issue.

---

## 11. Checkpoint handoff

**`APP5-D01`** — design against: two intake branches (§3) and their different
required fields; ≥1 `COP_IMAGE` on the COP branch and the 10-per-role cap (§6);
upload rejection copy limited to three bounded reason classes (§7); quantity
breakdown as an intake field on both branches; confirmation whose success state
is *"we sent you a secure link"* (§8); an Admin queue that is the alert surface;
an Admin detail offering **only** the five moderation transitions of §2, with a
mandatory reason on `NEEDS_CLARIFICATION`, `REJECTED` and `CANCELLED`, and a
mandatory note on the first two.

**`APP5-B01`** — §2 TR-LC11-01, §3 in full, §4 in full (including the recorded
fingerprint deviation), §5, §6 binding rules, §8 rows 1–2, §9.1 and `G01-D05`.
One endpoint. Also confirm `DESIGN_SESSION_SECRET_PEPPER` reaches the test
harness before claiming a green suite — without rotating or writing any
credential (`APP5-R00` risk 4).

**`APP5-B02`** — §7 in full, §6 media and inspection rules. `IMP-D048`'s lane,
authorized by §7's credential. ≤2 endpoints.

**`APP5-B03`** — GRD-002 per `G01-D04`; the code is never an authorization input
(§5); grant-scoped, single request.

**`APP5-B04`** — reads only; no transition may be performed.

**`APP5-B05`** — §2's subset as an application-layer restriction on top of the
persistence GRD-019 guard (`G01-D07`); §2's reason/note requirements; §8 rows
3–5; §9.1; §10's exclusions, especially S1-only cancellation.

---

## 12. Decision register

| ID | Decision | §|
|---|---|---|
| `G01-D01` | `request.submit` scope key is the verified `SUBMISSION`-purpose challenge id; no client-supplied key; no client-supplied `customerId` | 4.1 |
| `G01-D02` | Fingerprint inputs, excluding `customerNote`, attachments and — as a recorded deviation — the design document hash | 4.2 |
| `G01-D03` | `CC-18` citation drift resolved; duplicate submit has no DB8 row; APP5-B01 is its first implementation | 2.1 |
| `G01-D04` | GRD-002 does not apply to TR-LC11-01; it governs later customer actions | 2.1 |
| `G01-D05` | Request creation writes no transition row | 9.1 |
| `G01-D05b` | APP5 emits outbox events but creates no new notification intent | 8 |
| `G01-D06` | Cancellation is stage **S1 only** and `ADMIN`-only in APP5 | 2, 10 |
| `G01-D07` | The APP5 transition subset is an application-layer restriction above the persistence GRD-019 guard | 2 |
| `G01-D08` | The catalog branch requires a product **variant**, not just a product | 3 |
| `G01-D09` | `submitted_session_id` is server-set, never client-supplied | 3 |
| `G01-D10` | A COP request requires ≥1 `COP_IMAGE` | 3, 6 |
| `G01-D11` | The nine consequences "exactly one request" protects | 4.3 |
| `G01-D12` | Request code format `REQ-` + 10 CSPRNG chars from an unambiguous alphabet | 5 |
| `G01-D13` | Intake bounds: 10 bound assets per role; 20 accepted uploads per challenge | 6, 7 |
| `G01-D14` | APP5 does not expose the `ATTACHMENT` role | 6 |
