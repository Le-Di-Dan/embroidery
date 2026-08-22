# APP7-G01 — Deposit Payment and Order Creation Authority

- Checkpoint: `APP7-G01`
- Mode: `AUTHORITY / DOCUMENTATION_ONLY`
- Branch/HEAD at entry: `production` @ `58c4aeb`
- Date: 2026-08-22
- Product Owner ruling: `PO-APP7-001` — **LOCKED**

This package turns the `APP7-R00` audit and the Product Owner's payment ruling
into values that later APP7 checkpoints may not invent. It changes documentation
only. No runtime source, schema, migration, generated artifact or Figma node was
touched.

Supersedes nothing in `APP7_PHASE_ENTRY_AUDIT.md`; it **extends** it, and
revises exactly one of its dispositions (§9, schema).

---

## 1. The ruling, locked

```text
PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE

PAYMENT_MODEL              = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR
PAYMENT_PROVIDER           = NONE_IN_APP7
PROVIDER_WEBHOOK           = NONE_IN_APP7
ADMIN_VERIFICATION         = REQUIRED
TRANSFER_EVIDENCE_REQUIRED = false
TRANSFER_EVIDENCE_SUPPORTED= true
```

`APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP` is confirmed.
`IMP-O007` stays **OPEN** as a deferred, additive future integration. No
provider ADR is created for this flow — there is no provider.

---

## 2. What the repository already provides (audited, not assumed)

The evidence requirement looked like new infrastructure. It is not. Three
delivered capabilities cover it, and the audit below is why no new storage
provider, upload machinery or token architecture is introduced.

| Need | Already delivered | Evidence |
|---|---|---|
| Private streaming upload, single-pass count + hash + signature check, abort plumbing, no buffering | `AssetIntakeService` + `openMultipartUpload` | `apps/api/src/modules/asset/application/asset-intake.service.ts` |
| A **per-surface upload lane** — asset kind, classification, byte ceiling, idempotency namespace | `AssetIntakeLane`, explicitly designed for additional surfaces | `apps/api/src/modules/asset/domain/intake-lane.ts` |
| Three shipped lanes to copy | `ADMIN_CATALOG_INTAKE_LANE`, `DESIGN_SESSION_INTAKE_LANE`, `REQUEST_INTAKE_LANE` | `asset-intake.policy.ts`, `session-asset-intake.policy.ts`, `request-intake.policy.ts` |
| A customer-private image lane at exactly the right semantics | `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE`, 10 MiB, image-only | `request-intake.policy.ts:21,24,33` |
| Image-only media types verified by **content signature** | `ACCEPTED_MEDIA_TYPES = ['image/png','image/jpeg','image/webp']`, `assertAcceptedMediaType` | `asset-intake.policy.ts:23`, `media-signature.ts` |
| Async inspection before an asset is servable | each surface appends `ASSET_INSPECTION_EVENT_TYPE` in its own Tx B | four call sites, all non-spec |
| Authorized server-mediated private delivery, association-first, zero-write, streamed | `DeliverRequestAssetUseCase` | `apps/api/src/modules/order/application/admin/deliver-request-asset.use-case.ts` |
| Grant + step-up secure access | `REQUEST_ACCESS`, `contact_verification_challenges` | APP4-B05/B06, APP6-S01 |
| Module-scoped fail-fast runtime configuration | `design-session-auth.config.ts`, `app4-secret-pepper.config.ts`, `staff-auth.config.ts` | delivered pattern |

**The one thing that is genuinely missing is a place to record the association**
— see §9.

`ASSET_KINDS` and `ASSET_CLASSIFICATIONS` are closed CHECK sets, and
`CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` describe a customer's bank-transfer
screenshot **truthfully**. No new enum value is added, so no enum migration is
required. A transfer screenshot is not a Catalog Asset, not a Design Asset and
not a Production Artifact, and it is not forced into any of those aggregates.

---

## 3. Merchant bank configuration

```text
MERCHANT_BANK_CONFIG_CLASS = SERVER_CONTROLLED_SENSITIVE_OPERATIONAL_CONFIGURATION
```

Exactly **one** merchant account receives APP7 deposits.

Locked shape — a module-scoped, fail-fast config provider under
`apps/api/src/modules/payment/config/`, following the delivered
`design-session-auth.config.ts` pattern: read once at startup, throw on a
missing or malformed value, no default, no development shortcut, held only in
that object.

Locked variable names:

```text
PAYMENT_MERCHANT_BANK_BIN          the bank identifier the QR standard encodes
PAYMENT_MERCHANT_ACCOUNT_NUMBER    the receiving account number
PAYMENT_MERCHANT_ACCOUNT_NAME      the account holder name
PAYMENT_MERCHANT_BANK_DISPLAY_NAME the human bank name shown in instructions
```

**Naming is a rule, not a preference.** `CLAUDE.md` §8a protects any variable
whose name contains `PASSWORD`, `PASSWD`, `SECRET`, `TOKEN`, `KEY`,
`CREDENTIAL` or `PRIVATE`. None of the four names above contains one, which is
correct and deliberate: these values are printed on the customer's own screen
and encoded in a QR the customer scans, so they are operational configuration,
not secrets. A later checkpoint must **not** rename any of them into the
protected pattern — doing so would falsely mark customer-visible facts as
credentials. They are therefore **not** added to `.env-ignore`.

Rules that still bind:

- declared in `.env.example` with placeholder values by the owning checkpoint —
  **never** a real production account, and **never** a write to `.env`;
- never hard-coded in Storefront or Admin source, never duplicated across
  frontend files, never emitted into generated-client constants;
- reach the customer only through the deposit representation the API returns;
- never written into logs, audit detail, error payloads or outbox payloads
  beyond what the customer already sees.

No bank API credential exists in this MVP. No API key, merchant secret, webhook
secret, provider token or signing key is created, declared or referenced.

---

## 4. Payment reference — format locked

No canonical bank-transfer reference format existed, so `APP7-G01` locks one.

```text
PAYMENT_REFERENCE = <order code without its hyphen> + <obligation kind code>

  order code      ORD-XXXXXXXXXX   (uq_orders__code; alphabet 23456789ABCDEFGHJKMNPQRSTVWXYZ)
  kind code       DC = DEPOSIT     RM = REMAINING (APP9, reserved, not built here)

  deposit reference  ORDXXXXXXXXXXDC
  pattern            ^ORD[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}(DC|RM)$
  length             15 characters, fixed
```

Why this shape:

- **Uppercase alphanumeric only.** No hyphen, no space, no diacritic. Bank
  transfer memos are normalized inconsistently across Vietnamese banking apps;
  a reference that survives having its punctuation stripped is a reference that
  still reconciles. The hyphen is dropped from the order code for exactly that
  reason, and the value is parsed by **position** (3-char prefix, 10-char body,
  2-char kind), not by a delimiter.
- **15 characters.** The EMVCo/VietQR "purpose of transaction" field is bounded
  at 25 characters; 15 fits with room and needs no truncation rule.
- **Unambiguous.** `uq_orders__code` makes the body unique, and the kind code
  separates the two obligations INV-04 requires on every order — an
  order-code-only reference could not tell a deposit transfer from a remaining
  one, which is a defect APP9 would inherit.
- **Deterministic and stable.** Derived from `(order code, obligation kind)`,
  both immutable. It is identical on every read, every retry and every new
  attempt, so replay and idempotency need no stored reference and reconciliation
  never chases a changed memo.
- **Carries nothing it must not.** No customer secret, no secure-access token,
  no Design Session secret, no name, phone, email or address. The order code is
  already a non-authorizing public-facing identifier — `APP5-G01` and `APP6-B01`
  both state that a code is never an authorization input, and that holds here.
- **Server-owned.** The customer never composes it and free-form customer text
  is never reconciliation authority. The Admin reads the expected reference from
  the order and compares it to the received transfer.

The reference is **derived, not persisted**. Nothing stores it, so nothing can
disagree with it.

---

## 5. Amount authority

```text
QR amount = the DEPOSIT payment obligation's own amount, exactly
```

```text
accepted quotation version . deposit_amount
   -> payment_obligations(kind = 'DEPOSIT') . amount   [frozen at order creation]
   -> QR, instructions and Admin expected-amount, all reading that one row
```

The frontend never recomputes 40 %, never rounds, and never exposes an editable
amount field. `deposit_percent`, `deposit_amount` and `remaining_amount` are
already stored on `quotation_versions` under
`ck_quotation_versions__deposit_remaining_arithmetic`, and the DB4 rounding rule
(round-half-up, remainder by subtraction) is not reopened. Currency is `VND`,
enforced physically by `ck_payment_obligations__currency_vnd`. No "current" or
"latest" quotation heuristic, and no mutable Catalog value, is ever read.

---

## 6. Dynamic QR

```text
QR_GENERATION = SERVER_OWNED_DYNAMIC_TRANSFER_QR
QR_DOWNLOAD   = REQUIRED
QR_PERSISTENCE = NONE — deterministic regeneration
```

The QR encodes **bank-transfer instructions**, not a provider checkout session.
Its inputs are the four merchant configuration facts (§3), the exact deposit
amount (§5) and the payment reference (§4) — every one of them server-owned.

- Generated **locally on the server**. A remote or online QR-generation service
  is prohibited: it would put the merchant account number and the amount into a
  third party's request log for no benefit.
- The encoder library is an implementation choice for the owning checkpoint,
  subject to the repository's dependency and license governance. It must be a
  local, offline, permissively licensed encoder. `APP7-G01` deliberately does
  not name one, and no checkpoint stops for Product Owner approval to choose it.
- **Not persisted.** Every input is deterministic and immutable for the life of
  the obligation, so regeneration is exact and a stored binary would only be a
  second thing to keep in sync. If the merchant account is ever reconfigured,
  later regenerations correctly name the new account while the reference and
  amount stay stable — the desired behaviour, and the reason persistence would
  have been wrong.
- If a standards-compliant local encoding cannot be implemented under current
  authority, the owning checkpoint **reports the exact constraint** and stops.
  It does not fall back to a remote service and does not ship a QR that banking
  applications cannot read.

Generating, rendering or downloading a QR changes **no** payment state.

---

## 7. Transfer evidence

```text
TRANSFER_EVIDENCE_REQUIRED  = false
TRANSFER_EVIDENCE_SUPPORTED = true
TRANSFER_EVIDENCE_AUTHORITY = SUPPORTING_RECONCILIATION_ONLY
```

### 7.1 Intake — a fourth lane, nothing new

```text
PAYMENT_EVIDENCE_INTAKE_LANE
  assetKind             CUSTOMER_UPLOAD        (existing ASSET_KINDS value)
  classification        CUSTOMER_PRIVATE       (existing ASSET_CLASSIFICATIONS value; never client-selectable, INV-09)
  maxUploadBytes        10_485_760             (10 MiB — the delivered APP5 customer-photo ceiling)
  operationNamespace    public.order.deposit-evidence.upload
  declaresMetadataFields false                 (one file part; nothing else)
  accepted media        image/png, image/jpeg, image/webp
```

Media type is decided by **content signature** (`assertAcceptedMediaType`), never
by the browser's declared MIME type, never by the file extension and never by
the original filename. The original filename is **not** persisted and **not**
returned: no product authority requires it, and `normalizeFilename` exists
precisely so a caller-supplied name never becomes identity. The client never
supplies an object key.

### 7.2 Cardinality and mutation — bounded and append-only

```text
MAX_EVIDENCE_PER_ATTEMPT = 5
EVIDENCE_MUTATION        = APPEND_ONLY — no customer delete, no replace
```

Five is a conservative bound: enough for a multi-screen banking flow (transfer
confirmation, transaction detail, statement line), far short of a gallery. It is
recorded here rather than referred to the Product Owner, as §11 of the ruling
directs.

Append-only follows delivered precedent rather than inventing a policy.
`request-asset-binder.ts` states it for the closest analogue — *"the rows are
retained evidence, and neither customer nor Admin adds, replaces or detaches one
later"* — and the payment context is stricter still: `payment_provider_events`,
`payment_reconciliations` and refund amounts already carry S24 freeze triggers.
Evidence submitted before a verification decision must remain visible after it,
or the record of what the Admin actually looked at is destroyed.

Consequences, locked:

- a customer may **not** delete or replace evidence, before or after
  verification;
- once the attempt reaches a terminal state (`SUCCEEDED`, `FAILED`, `EXPIRED`),
  that attempt accepts no further evidence;
- a retry is a **new attempt** (LC-16), and a new attempt has its own evidence
  set — evidence never migrates between attempts;
- retention is retain-class, identical to request attachments: `restrict` on
  both foreign keys, disposal only through the delivered G4 asset tombstone
  flow, which sees the association. No APP7-specific retention rule is invented,
  and Order completion or cancellation does not delete evidence.

### 7.3 Binding — server-side, never customer-supplied

Evidence binds to the **payment attempt**, which transitively and unambiguously
yields the obligation, the order, the request and the customer:

```text
payment_attempts.id
  -> payment_obligations (obligation, kind = DEPOSIT)
    -> orders (order)
      -> custom_requests -> customers
```

The attempt id is resolved **server-side** from the authorized order and the
live deposit obligation. The customer cannot name an attempt, an obligation, an
order that is not theirs, an asset id or an object key. A customer therefore
cannot attach evidence to another customer's order, replace another order's
evidence through an id parameter, browse arbitrary evidence, obtain an
object-storage key or obtain a private bucket URL. Every failure answers with
the delivered non-enumerating refusal shape, so no response distinguishes
"does not exist" from "is not yours".

### 7.4 Association timing — the one deliberate divergence

`custom_request_assets` binds only `ACCEPTED` assets, because APP5's binding
happens at a **later** event (submission) than the upload. Payment evidence has
no later event: the customer uploads once, already authorized.

Locked: the association row is written in the intake **Tx B**, alongside the
inspection outbox event, while the asset is still `UPLOADED`. Inspection then
runs as it does for every other lane. Admin preview (§8) refuses anything not
`ACCEPTED`, so an un-inspected or rejected image is recorded as submitted but is
never served. The customer-facing status distinguishes *submitted /
being checked / available / rejected*.

This divergence from `custom_request_assets` is stated here so a later reviewer
finds it recorded rather than discovers it as an inconsistency.

### 7.5 Secure access — reuse only

Evidence upload and read are reachable **only** through the authorized customer
deposit surface: an `ACTIVE` `REQUEST_ACCESS` grant matching the order's request
(GRD-002), plus the step-up challenge that authorized the attempt — already
recorded on `payment_attempts.step_up_challenge_id` and **re-verified, not
re-issued**. Attempt initiation itself requires step-up, because GRD-003's
sensitive set names "pay" explicitly.

No new grant scope, token format, payment link or customer account is created.
`GRANT_SCOPE_KINDS` stays `['REQUEST_ACCESS']`.

### 7.6 Evidence never changes payment truth

```text
QR generated / rendered / downloaded  -> no payment state change
customer asserts "I have paid"        -> no payment state change
evidence uploaded                     -> no payment state change
evidence previewed by Admin           -> no payment state change
```

Only accepted Admin verification (§8) can move
`attempt -> SUCCEEDED`, `DEPOSIT obligation -> SATISFIED`,
`Order -> DEPOSIT_PAID`.

A customer who transfers correctly and submits **no** evidence remains fully
eligible for verification through ordinary reconciliation. Evidence presence is
never a precondition for verification, and its absence never cancels, expires or
penalises an order.

---

## 8. Admin verification and evidence preview

```text
PAYMENT_VERIFICATION = ADMIN_MANUAL_SERVER_SIDE
```

Authority: the delivered APP1 staff authentication and Admin authorization
boundary (`AuthenticatedAdminGuard` against a live `admin_sessions` row). No new
role, permission or elevation is introduced.

The verification transaction:

1. locks and re-reads the attempt and its obligation;
2. checks the received transfer against the **expected** facts — obligation
   amount, `VND`, and the §4 reference (GRD-011, evaluated server-side; the
   signature half of GRD-011 does not apply, as there is no provider payload);
3. settles the attempt `SUCCEEDED`;
4. satisfies the obligation through `satisfy(obligationId, attemptId, at)`,
   which re-verifies inside the transaction that the attempt belongs to that
   obligation and matches its amount and currency (G-DB7-06 / G-DB7-33);
5. appends `payment_reconciliations` evidence naming the acting `adminId` and
   the reason;
6. transitions the order to `DEPOSIT_PAID` and appends the SE-007 outbox row.

Admin preview requirements:

- evidence-**presence** is visible on the payment view without opening anything;
- the Admin can open each evidence image, served by an authorized, zero-write,
  association-first, streamed delivery modelled directly on
  `DeliverRequestAssetUseCase` — association read first, always, so a probe of
  evidence ids never reaches object storage and cannot use timing or provider
  load as an existence oracle;
- evidence is visually tied to its payment attempt and order;
- **verification is possible with no evidence at all**;
- no raw object-storage URL, internal object key, bucket name, secret or secure
  token is ever rendered;
- the interface states plainly that evidence is customer-submitted supporting
  material which must be checked against funds actually received.

An image is never authoritative proof that money arrived.

---

## 9. Schema disposition — revised

```text
APP7_SCHEMA_DISPOSITION = MIGRATION_REQUIRED   (evidence association only)
```

This revises `APP7-R00`'s `NO_MIGRATION_REQUIRED`. That verdict was correct for
the payment and order flow R00 audited, and it still holds for **every** part of
APP7 except evidence. It is revised on evidence alone, and only after auditing
whether existing persistence could truthfully own the relation.

**The exact missing physical invariant:**

> No context-owned association table exists in CTX-PAY / AGG-16 binding an
> `assets` row to a `payment_attempts` row.

Why nothing delivered can hold it:

- `ADR-DB4-003` **prohibits** a generic `asset_links` table and requires each
  consuming context to own a typed association with `NOT NULL`, `restrict`
  foreign keys on **both** ends. There is no generic table to reuse and creating
  one is forbidden.
- The seven locked association tables belong to CAT, DSN ×3, ORD, PRD and GAL.
  None belongs to Payment, and none may be borrowed: `production_artifacts` is
  internal unwatermarked production output, `gallery_entry_assets` is public,
  and the rest are Catalog or Design.
- `custom_request_assets` is the nearest, but its `role` set is a closed CHECK
  (`COP_IMAGE`, `REFERENCE`, `ATTACHMENT`) — so reusing it needs a migration
  **anyway** — and it binds to the **request**, not the payment attempt. That
  would make a payment fact owned by the Ordering context and would lose the
  attempt binding §7.3 depends on, so a retry's evidence could not be told from
  the previous attempt's.
- `payment_attempts` cannot carry a single `asset_id` column: up to five images
  are allowed, and `ADR-DB4-003` reserves direct FK columns for single-valued
  references.

Locked minimum scope for `APP7-DB01` — the exact invariant, no convenience
columns, and **no SQL is written in G01**:

```text
one new CTX-PAY association table, name locked as payment_transfer_evidence

  id                     primary key
  payment_attempt_id     NOT NULL -> payment_attempts   ON DELETE RESTRICT
  asset_id               NOT NULL -> assets             ON DELETE RESTRICT
  grant_id               NOT NULL -> secure_access_grants        (submission evidence)
  step_up_challenge_id   NOT NULL -> contact_verification_challenges
  submitted_at           NOT NULL
  created_at / updated_at

  UNIQUE (payment_attempt_id, asset_id)   one association per attempt+asset
```

No `role` column: the table has exactly one meaning, and a discriminator with a
single legal value is an abstraction for hypothetical reuse (`CLAUDE.md` §5).
The five-per-attempt bound (§7.2) is an application guard evaluated under the
attempt row lock, matching how `MAX_ACCEPTED_UPLOADS_PER_CHALLENGE` is enforced
today; it is not a CHECK, because a CHECK cannot count sibling rows.

Nothing else migrates. No new asset kind, no new classification, no new grant
scope, no new order or payment state, no new enum value anywhere, and no change
to any delivered table.

---

## 10. Idempotency and concurrency

Accepted namespaces only. One deliberate **non**-invention is recorded.

| Operation | Namespace | Scope key | Arbiter |
|---|---|---|---|
| Order creation | `order.create` | (request, approval snapshot) | `uq_orders__request` (CST-030) |
| Obligation creation | — | in the order transaction | `uq_payment_obligations (order_id, kind)` |
| Attempt initiation | `payment.initiate` | (obligation, attempt key) | idempotency claim + obligation state predicate |
| Evidence upload | `public.order.deposit-evidence.upload` | delivered `Idempotency-Key` header + request/content fingerprint | `uq_idempotency_records__namespace_scope_key`, exactly as the three shipped lanes |
| Manual verification | **none — deliberately** | — | obligation state predicate under row lock (CC-10) |

**Why manual verification claims no `payment.callback` namespace.** DB3 scopes
that claim *per provider event id*. In this flow there is no provider and no
provider event id, so a claim would have to be keyed on something invented. The
real arbiter already exists and is stronger: `satisfy()` re-reads the obligation
and attempt inside the transaction, and a second verifier finds the obligation
already `SATISFIED` and is refused. A single application wins (CC-10) without a
fabricated namespace. `payment_provider_events` stays empty in the MVP, its
`(provider_key, provider_event_ref)` uniqueness intact for whenever a provider
is locked.

| Race | Outcome | Arbiter |
|---|---|---|
| CC-11 two order creators | exactly one order | `uq_orders__request` |
| Duplicate deposit initiation | one live attempt per obligation | obligation state predicate + `payment.initiate` claim |
| CC-10 two Admins verify the same attempt | one application wins; the loser sees `SATISFIED` | row lock + state predicate |
| Duplicate evidence upload (retry) | replay, one asset, one association | delivered claim + `UNIQUE (payment_attempt_id, asset_id)` |
| Evidence upload racing verification | attempt terminal state refuses further evidence | attempt state predicate under lock |
| Conversion vs request/quote/design mutation | frozen by S24 and the CST-090 trigger | DB triggers |

---

## 11. Lifecycle, locked end to end

```text
design.approved (SE-005, already emitted by APP6-B11)
  -> Order created at AWAITING_DEPOSIT
   + order_items frozen
   + DEPOSIT and REMAINING obligations, same transaction (INV-04)
   + order.created outbox row, same transaction (SE-006)
  -> customer opens the deposit surface (REQUEST_ACCESS grant)
  -> step-up (GRD-003 "pay") -> BANK_TRANSFER attempt PENDING, reference derived
  -> dynamic QR rendered and downloadable; prominent screenshot reminder shown
  -> customer transfers at their bank, outside the application
  -> customer OPTIONALLY uploads transfer evidence (no state change)
  -> Admin sees expected amount, reference, attempt status and evidence if present
  -> Admin verifies server-side against funds actually received
  -> attempt SUCCEEDED -> DEPOSIT obligation SATISFIED -> Order DEPOSIT_PAID
  -> SE-007; APP8 may then reserve inventory (DepositEligibilityPort)
```

Order creation remains gated on the **approval**, never on the deposit
(`TR-LC14-01`), exactly as `APP7-R00` §2 established. The `APP7-R00` SKU
resolution rule stands unchanged: a Catalog order item resolves exactly one
`ACTIVE` SKU for the snapshot's variant, and zero or several is a refusal, never
a guess and never a synthesised SKU.

---

## 12. UX requirements that are product authority, not copy

### 12.1 The evidence reminder is prominent by requirement

The customer payment surface must carry a **visually prominent, hard to
overlook** reminder to capture proof of the successful transfer and send it in.
It receives deliberate visual emphasis — not a low-priority caption, footnote or
muted helper line. `APP7-D01` owns the exact treatment and the exact Vietnamese
wording; the meaning is fixed:

```text
1. complete the bank transfer;
2. capture the successful-transfer screen or receipt;
3. send that image back to the order;
4. doing so lets the store verify the deposit faster;
5. it is recommended, not mandatory.
```

### 12.2 Three facts, never collapsed

```text
transfer completed by the customer   — the customer's own claim
evidence submitted                   — a file arrived
payment verified                     — an Admin confirmed funds received
```

These are three different facts with three different authorities. No screen may
merge them into a single "Paid" state.

### 12.3 Copy the UI must not produce

The interface must never state or imply that:

- payment is automatically confirmed after upload;
- evidence is mandatory for the payment to be valid;
- missing evidence cancels, expires or jeopardises the order;
- the image itself proves the money was received.

Wording is "evidence helps us verify faster", not "upload evidence to confirm
payment" — unless the latter is unmistakably phrased as a submission action
rather than as confirmation.

---

## 13. Still deferred under `IMP-O007`

```text
IMP-O007 = OPEN — DEFERRED_PROVIDER_INTEGRATION
```

Out of APP7: provider redirect checkout, provider SDK or API, provider webhook,
webhook signature verification, provider callback ingestion, provider
credentials, automatic bank-transaction polling, automatic payment confirmation,
bank statement API integration.

The deferral is additive by construction: `payment_provider_events` and its
uniqueness arbiter, `recordProviderEvent`, `PROVIDER_REDIRECT` and the nullable
`providerKey` / `providerRef` all exist already, so a future provider phase adds
a webhook checkpoint and a checkout screen without reworking order conversion,
obligations, verification or evidence.

Also unchanged from `APP7-R00`: inventory and production stay APP8; remaining
payment, fulfillment, cancellation and refund stay APP9; `TR-LC14-09/10`
(`ON_HOLD` / resume) stays deferred behind the absent LC-11 requote edge.

---

## 14. Roadmap consequence

The evidence capability adds a customer **write** with object-storage ownership,
an Admin **binary read**, and a migration. Forcing those into `B03` and `B04`
would push `B03` to 4 operations mixing streaming upload with a plain read, and
`B04` to 4 mixing verification with private binary delivery — under the hard
maximum of 5, but each a second review boundary hidden inside a first.

APP5 already answered this shape: it shipped Admin request-asset delivery as its
**own** checkpoint (`APP5-B06`), separate from the Admin queue (`B04`) and
moderation (`B05`), because private binary delivery has distinct security
properties. APP7 follows the delivered precedent.

```text
ROADMAP_CHANGED_BY_G01 = YES        12 -> 15 checkpoints
TRANSFER_EVIDENCE_CHECKPOINT_DISPOSITION = NEW_CHECKPOINTS (APP7-DB01, APP7-B05, APP7-B06)
```

Three checkpoints added, each justified by a boundary rather than by symmetry:

| Added | Purpose | Bounded scope | Why separate | Ops |
|---|---|---|---|---:|
| `APP7-DB01` | The `payment_transfer_evidence` association (§9) | one table, forward-only | Database change control requires a dedicated checkpoint, before dependent runtime | 0 |
| `APP7-B05` | Customer transfer-evidence upload + own-evidence read | CTX-PAY; owns the fourth intake lane and the association write | A streaming upload with storage ownership, its own idempotency namespace, media-signature policy and quota is not a variation on a JSON read | 2 |
| `APP7-B06` | Admin evidence delivery (authorized private stream) | CTX-PAY; zero-write | Exactly the `APP5-B06` precedent: association-first, no existence oracle, streamed, no writes | 1 |

`APP7-B03` therefore stays at **3** operations (deposit read, attempt
initiation, QR delivery) — all deriving from one deposit projection under one
authorization, with no storage involved. `APP7-B04` stays at **3**. The customer
deposit read carries no evidence facts; evidence metadata belongs to `B05`,
which owns it.

---

## 15. Authoritative APP7 roadmap (revised)

| Order | Checkpoint | Purpose | Depends on | Area | Ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP7-R00` | Phase-entry audit | APP6-X01 | docs | 0 | delivered |
| 2 | `APP7-G01` | Payment authority; `PO-APP7-001` locked | `R00` | docs | 0 | this document |
| 3 | `APP7-B01` | Admin SKU authoring (inherited APP2 gap) | `G01` | backend/catalog | 2 | a published variant resolves to exactly one ACTIVE SKU |
| 4 | `APP7-W01` | `design.approved` → order + items + both obligations + `order.created` | `B01`, `G01` | worker | 0 | one order per request (CC-11); Catalog **and** COP; AGG-15 suites green |
| 5 | `APP7-B02` | Admin order read | `W01` | backend | 2 | frozen snapshot facts only |
| 6 | `APP7-B03` | Customer deposit read, BANK_TRANSFER attempt, QR delivery | `W01` | backend | 3 | GRD-002 + GRD-003; exact amount and reference; QR readable by a banking app; no state change |
| 7 | `APP7-DB01` | `payment_transfer_evidence` association | `G01` | database | 0 | forward-only; both FKs restrict; no other table touched |
| 8 | `APP7-B05` | Customer evidence upload + own-evidence read | `DB01`, `B03` | backend | 2 | server-side binding; content-signature media check; 5-per-attempt bound; append-only; no state change |
| 9 | `APP7-B04` | Admin payment verification, review, reconciliation evidence | `B03` | backend | 3 | GRD-011 server-side; CC-10 single application wins; `DEPOSIT_PAID` |
| 10 | `APP7-B06` | Admin evidence delivery | `B05`, `B04` | backend | 1 | association-first; zero-write; no key or URL disclosed; non-ACCEPTED refused |
| 11 | `APP7-D01` | Complete design package | `G01` | design | 0 | prominent evidence reminder; three states never collapsed; no provider UX |
| 12 | `APP7-A01` | Admin order + payment screen with evidence preview | `D01`, `B02`, `B04`, `B06` | frontend | 0 | verification possible without evidence; no secret or key rendered |
| 13 | `APP7-S01` | Customer deposit, QR, evidence upload, confirmation | `D01`, `B03`, `B05` | frontend | 0 | truthful states; retry opens a new attempt; honest copy (§12) |
| 14 | `APP7-E01` | Focused cross-layer acceptance | 3–13 | tests | 0 | §16 target list |
| 15 | `APP7-X01` | Phase closure; APP8 handoff | `E01` | docs | 0 | follow-ups dispositioned |

Predicted HTTP surface: **13 operations** (72 → ~85 paths). Backend slices are
2 / 3 / 2 / 3 / 1 — all within 1–3 normal, none near the hard maximum of 5.
Governance held: authority before payment code, migration before dependent
runtime, design before UI, one checkpoint one review boundary, APP8 and APP9
outside.

---

## 16. `APP7-E01` target additions

`APP7-R00` §19's eleven targets stand. The ruling adds:

```text
E01-12  the QR encodes exactly the merchant config, the exact obligation amount
        and the §4 reference — and decodes to those values
E01-13  QR render and download change no payment state
E01-14  evidence upload changes no payment state; the order stays AWAITING_DEPOSIT
E01-15  a correct payment with NO evidence still verifies normally
E01-16  evidence cannot be bound to another customer's order or attempt, and no
        response distinguishes "not found" from "not yours"
E01-17  a sixth evidence image on one attempt is refused
E01-18  a duplicate evidence upload replays: one asset, one association
E01-19  no object key, bucket name, storage URL or secure token appears in any
        customer or Admin response, log or rendered screen
E01-20  the three facts (transferred / evidence submitted / verified) are
        distinguishable in the customer surface
```

---

## 17. Diagnostics run

Authority and capability reads only. No suite, no generation, no mutation.

| Check | Question | Result |
|---|---|---|
| read `intake-lane.ts`, three lane definitions | is there a reusable per-surface upload lane? | yes — documented as designed for additional surfaces |
| read `asset-intake.policy.ts`, `request-intake.policy.ts` | media types, ceilings, kinds, classifications | image-only ×3; 25 MiB admin / 10 MiB customer; `CUSTOMER_UPLOAD` + `CUSTOMER_PRIVATE` |
| read `assets.ts` | do the closed kind/classification sets already fit evidence? | yes — no enum migration |
| `grep` `assets.id` across schema | is there a CTX-PAY association table? | **no** — seven exist, none in Payment |
| read `ADR-DB4-003` | may a generic link table be used? | prohibited; context-owned table with NOT NULL restrict FKs required |
| read `custom-request-assets.ts`, `request-asset-binder.ts` | closest precedent, mutation policy | roles are a closed CHECK; binding is never replaced or detached |
| `grep` `ASSET_INSPECTION_EVENT_TYPE` | does every lane dispatch inspection? | yes — four non-spec call sites, one per surface Tx B |
| read `deliver-request-asset.use-case.ts` | authorized private delivery precedent | association-first, zero-write, streamed |
| read `orders.ts`, `request-code.ts`, `quotation-code.ts` | order code format and alphabet | `uq_orders__code`, no format CHECK; alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ` |
| read `design-session-auth.config.ts`, `app-config.ts` | runtime configuration mechanism | module-scoped fail-fast provider |
| read `.env-ignore.example` | are the bank variables protected by name? | no — none matches the protected pattern, which is correct |
| `grep` for a QR dependency | does one exist? | none — the owning checkpoint selects a local encoder |
| read `14-IMPLEMENTATION-DECISION-REGISTER.md` | `IMP-O007` status, next decision id | open, owner APP7; highest locked is `IMP-D051` |

Not run: Jest, API suites, Order/payment integration suites, storage integration
suites, Playwright, `pnpm quality`, `quality:e2e`, OpenAPI or client generation,
SonarQube, Figma checks. No PASS command was rerun on unchanged input.

---

## 18. Verdict

```text
APP7-G01 = COMPLETE

PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE

APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
IMP-O007                          = OPEN — DEFERRED_PROVIDER_INTEGRATION

QR_GENERATION  = SERVER_OWNED_DYNAMIC_TRANSFER_QR
QR_DOWNLOAD    = REQUIRED
QR_PERSISTENCE = NONE — deterministic regeneration

PAYMENT_REFERENCE = ORD<10-char order-code body><DC|RM>, ^[A-Z0-9]{15}$

TRANSFER_EVIDENCE_REQUIRED  = false
TRANSFER_EVIDENCE_SUPPORTED = true
TRANSFER_EVIDENCE_AUTHORITY = SUPPORTING_RECONCILIATION_ONLY
TRANSFER_EVIDENCE_STORAGE   = DELIVERED_ASSET_INTAKE, fourth lane
                              (CUSTOMER_UPLOAD / CUSTOMER_PRIVATE, 10 MiB,
                              image-only, private, server-mediated read)
                              + one new CTX-PAY association table
TRANSFER_EVIDENCE_CHECKPOINT_DISPOSITION = NEW_CHECKPOINTS
                              (APP7-DB01, APP7-B05, APP7-B06)

PAYMENT_VERIFICATION = ADMIN_MANUAL_SERVER_SIDE

APP7_SCHEMA_DISPOSITION = MIGRATION_REQUIRED (evidence association only;
                          revises APP7-R00 for evidence and nothing else)
ROADMAP_CHANGED_BY_G01  = YES (12 -> 15 checkpoints)

NEXT CHECKPOINT = APP7-B01
```
