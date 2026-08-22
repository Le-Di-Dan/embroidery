# APP7-G01 — Completion Report

- Checkpoint: `APP7-G01` — Deposit Payment and Order Creation Authority
- Mode: `AUTHORITY / DOCUMENTATION_ONLY`
- Branch / HEAD at entry: `production` @ `58c4aeb`
- Date: 2026-08-22
- Verdict: **`APP7-G01 = COMPLETE`**

---

## 1. What this checkpoint did

It turned the Product Owner's `PO-APP7-001` ruling into locked values that later
APP7 checkpoints may not invent, audited whether the delivered platform can
carry the new transfer-evidence requirement, and revised the roadmap where the
answer changed the shape of the work. **Documentation only.**

Deliverables:

- [`../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md`](../audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md) — new
- [`APP7-G01-COMPLETION-REPORT.md`](./APP7-G01-COMPLETION-REPORT.md) — this file, new
- [`../phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md`](../phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md) — updated
- [`../10-MASTER-APPLICATION-ROADMAP.md`](../10-MASTER-APPLICATION-ROADMAP.md) — updated
- [`../14-IMPLEMENTATION-DECISION-REGISTER.md`](../14-IMPLEMENTATION-DECISION-REGISTER.md) — `IMP-D052` added, `IMP-O007` annotated

No runtime source, schema, migration, generated artifact, OpenAPI document,
generated client or Figma node was touched. Nothing was pushed. No QR, evidence
upload, provider integration or SQL was implemented.

---

## 2. The two findings that mattered

### 2.1 Evidence needs almost no new infrastructure

The requirement reads like a new subsystem. It is not. The asset module already
ships an `AssetIntakeLane` abstraction whose own documentation says it exists so
that additional upload surfaces reuse one implementation, and **three** lanes
already use it. `REQUEST_INTAKE_LANE` is a customer-private image lane at 10 MiB
with content-signature media checking — structurally the same thing a transfer
screenshot is. `DeliverRequestAssetUseCase` is an authorized, association-first,
zero-write private stream — structurally the same thing Admin evidence preview
is.

So: a fourth lane, a fourth `ASSET_INSPECTION` dispatch, and a delivery use case
modelled on the delivered one. No new storage provider, no new upload machinery,
no MinIO/S3 exposure, no new asset kind or classification —
`CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` describe a bank-transfer screenshot
truthfully, and both are already in the closed CHECK sets.

### 2.2 But there is nowhere to record the association — so the schema disposition changes

`ADR-DB4-003` prohibits a generic `asset_links` table and requires each
consuming context to own a typed association with `NOT NULL`, `restrict` foreign
keys on both ends. Seven such tables exist — CAT, DSN ×3, ORD, PRD, GAL — and
**none belongs to Payment**.

Nothing delivered can hold it honestly:

- `custom_request_assets` is closest, but its `role` set is a closed CHECK (so
  reuse needs a migration anyway) and it binds to the **request**, not the
  attempt — which would put a payment fact under Ordering and lose the ability
  to tell a retry's evidence from the previous attempt's;
- `payment_attempts` cannot take a single `asset_id` column: up to five images
  are allowed, and `ADR-DB4-003` reserves direct FK columns for single-valued
  references;
- `production_artifacts` and `gallery_entry_assets` carry the wrong semantics
  entirely.

```text
APP7_SCHEMA_DISPOSITION : NO_MIGRATION_REQUIRED -> MIGRATION_REQUIRED
                          (evidence association only)
```

`APP7-R00`'s verdict stands for everything else in APP7. This revises it for the
evidence association and nothing else, which is exactly the condition §16 of the
ruling permits. The minimum scope — one table, both FKs `restrict`, no `role`
column, no convenience columns — is stated in the authority package §9. **No SQL
was written.**

---

## 3. Locked values

```text
PO-APP7-001 = MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE
```

| Area | Locked |
|---|---|
| Merchant bank | one account; `SERVER_CONTROLLED_SENSITIVE_OPERATIONAL_CONFIGURATION`; four named variables loaded by a module-scoped fail-fast provider; placeholders in `.env.example`; never in frontend source or generated-client constants |
| Variable naming | deliberately outside the `CLAUDE.md` §8a protected pattern, because these values are printed on the customer's own screen; a later checkpoint must not rename them into it, and they are **not** added to `.env-ignore` |
| Payment reference | `ORD` + 10-char order-code body + `DC`/`RM`, `^[A-Z0-9]{15}$` — uppercase alphanumeric only, parsed by position, 15 of the 25 EMVCo characters, **derived never persisted** |
| Amount | the DEPOSIT obligation's own frozen amount, VND; no frontend recompute, no re-round, not editable |
| QR | server-generated locally, downloadable, **not persisted** (deterministic regeneration); remote QR services prohibited; encoder library is the owning checkpoint's choice under dependency governance |
| Evidence | optional, supporting-only, image-only by content signature, 10 MiB, **max 5 per attempt**, **append-only** (no customer delete or replace), bound server-side to the payment attempt, retained through the delivered G4 tombstone flow |
| Evidence timing | association written in intake Tx B while the asset is `UPLOADED`; Admin preview refuses anything not `ACCEPTED` — a deliberate, recorded divergence from `custom_request_assets` |
| Secure access | `REQUEST_ACCESS` grant + the attempt's **own** step-up challenge, re-verified not re-issued; no new grant scope, token format or payment link |
| Verification | `ADMIN_MANUAL_SERVER_SIDE`; delivered APP1 staff auth; no new role or permission |
| Idempotency | `order.create`, `payment.initiate`, and the delivered upload namespace — manual verification claims **none**, deliberately (see §4) |
| UX | the evidence reminder is a **product requirement** with deliberate visual emphasis; transferred / evidence submitted / verified are three facts and are never collapsed into "Paid" |

Payment truth is unchanged by every customer action:

```text
QR generated / rendered / downloaded  -> no state change
customer asserts "I have paid"        -> no state change
evidence uploaded / previewed         -> no state change
```

A correct payment with **no** evidence verifies normally. Evidence presence is
never a precondition and its absence never cancels or penalises an order.

---

## 4. One deliberate non-invention

DB3 scopes the `payment.callback` idempotency claim **per provider event id**.
In a manual flow there is no provider and no event id, so such a claim would
have to be keyed on something fabricated.

It is not created. The arbiter already exists and is stronger: `satisfy()`
re-reads the obligation and the attempt inside the verifying transaction, so a
second Admin finds the obligation already `SATISFIED` and is refused — CC-10,
single application wins, no invented namespace. `payment_provider_events` stays
empty with its uniqueness constraint intact for whenever a provider is locked.

---

## 5. Roadmap change

```text
ROADMAP_CHANGED_BY_G01 = YES   12 -> 15 checkpoints
```

Absorbing evidence into `B03` and `B04` would have put each at 4 operations —
under the hard maximum of 5, but each hiding a second review boundary inside a
first: a streaming upload with storage ownership bolted onto a JSON read, and
private binary delivery bolted onto the verification transaction. APP5 already
answered this shape by shipping Admin request-asset delivery as its own
checkpoint (`APP5-B06`). APP7 follows the delivered precedent.

| Added | Ops | Why separate |
|---|---:|---|
| `APP7-DB01` | 0 | Database change control requires a dedicated checkpoint, before dependent runtime |
| `APP7-B05` | 2 | A streaming upload owning a lane, an idempotency namespace, a media policy and a quota is not a variation on a read |
| `APP7-B06` | 1 | Private binary delivery has distinct security properties — association-first, no existence oracle, zero-write |

`APP7-B03` stays at 3 (deposit read, attempt initiation, QR delivery — one
projection, one authorization, no storage). `APP7-B04` stays at 3. Predicted
surface: **13 operations**, backend slices 2 / 3 / 2 / 3 / 1 — all within 1–3
normal, none near the maximum.

Full ordering:

```text
R00 -> G01 -> B01 -> W01 -> B02 -> B03 -> DB01 -> B05 -> B04 -> B06
    -> D01 -> A01 -> S01 -> E01 -> X01
```

`APP7-B01` remains next: SKU authoring is the `APP7-R00` entry blocker for the
Catalog order-item branch and depends on nothing G01 changed. `APP7-DB01` is
placed immediately before its only consumer rather than early, keeping the
migration adjacent to what justifies it.

---

## 6. Obsolete provider wording reconciled, history preserved

Earlier documents assumed a provider. They are annotated, not rewritten — the
original text stays visible above each ruling, per the instruction to preserve
planning history rather than pretend it already said the new thing.

| Location | Was | Now |
|---|---|---|
| Phase §2 Dependencies | "Payment provider and signature/webhook strategy approved" | annotated: does not apply; no provider dependency in APP7 |
| Phase §3 Design policy | design "after provider behavior is known" | annotated: `APP7-D01` covers the manual journey; no provider checkout UX |
| Phase §4 In scope | checkout session initiation, provider callback/webhook verification, out-of-order callbacks | preserved, plus a §4.1 that replaces them with the manual flow and marks the three as deferred with `IMP-O007` |
| Phase §9 Journey | "a verified provider callback is processed safely" | annotated with the manual journey |
| Phase §10 Exit gate | "signature… tests pass", "sensitive provider data is redacted" | annotated: no provider signature exists in APP7; redaction restated as object keys, bucket names, storage URLs and tokens |
| Phase §6 candidates | provider-centric planning list | already marked non-executable planning history at `APP7-R00`; unchanged |
| `IMP-O007` | "Before payment implementation" | annotated: open by design, **no longer a phase blocker**, additive re-open owner named |

---

## 7. Validations run

Authority and capability reads only, scoped to what a documentation checkpoint
justifies (`VALIDATION_GOVERNANCE.md` §3).

| Check | Question | Result |
|---|---|---|
| read `intake-lane.ts` + three lane definitions | is there a reusable per-surface upload lane? | yes, documented as designed for further surfaces |
| read `asset-intake.policy.ts`, `request-intake.policy.ts` | media types, ceilings, kinds, quotas | image ×3; 25 MiB admin / 10 MiB customer; `CUSTOMER_UPLOAD` + `CUSTOMER_PRIVATE`; 20-per-challenge precedent |
| read `assets.ts` | do the closed kind/classification sets fit evidence? | yes — no enum migration |
| `grep assets.id` across schema | is there a CTX-PAY association table? | **no** — seven exist, none in Payment |
| read `ADR-DB4-003` | may a generic link table be used? | prohibited; context-owned table with NOT NULL restrict FKs required |
| read `custom-request-assets.ts`, `request-asset-binder.ts` | nearest precedent and its mutation policy | closed `role` CHECK; bindings never replaced or detached |
| `grep ASSET_INSPECTION_EVENT_TYPE` | does each lane dispatch inspection? | yes — four non-spec call sites, one per surface Tx B |
| read `deliver-request-asset.use-case.ts` | authorized private delivery precedent | association-first, zero-write, streamed |
| read `orders.ts`, `request-code.ts`, `quotation-code.ts` | order code identity and alphabet | `uq_orders__code`, no format CHECK; `23456789ABCDEFGHJKMNPQRSTVWXYZ` |
| read `design-session-auth.config.ts`, `app-config.ts` | runtime configuration mechanism | module-scoped fail-fast provider |
| read `.env-ignore.example` | would the bank variables be protected by name? | no — correctly, they are customer-visible config |
| `grep` for a QR dependency | does one exist? | none; the owning checkpoint selects a local encoder |
| read decision register | `IMP-O007` status; next id | open, owner APP7; highest locked was `IMP-D051` |
| `npx prettier --check` on the five changed docs | formatting | pass |
| `git diff --check` | whitespace | clean |

**Not run, deliberately:** full Jest, API suites, Order/payment integration
suites, storage integration suites, Playwright, `pnpm quality`, `quality:e2e`,
OpenAPI or client generation, Figma checks, SonarQube. No PASS command was rerun
on unchanged input, and no known-red command was run at all — the AGG-15 suites
were classified at `APP7-R00` and were not touched here.

---

## 8. Changed files

```text
A  docs/implementation/audits/APP7_G01_DEPOSIT_PAYMENT_AUTHORITY.md
A  docs/implementation/reports/APP7-G01-COMPLETION-REPORT.md
M  docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md
M  docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
M  docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md
```

---

## 9. Risks and limitations

- **The QR encoder is unproven.** No dependency exists yet, and `APP7-G01`
  deliberately did not choose one. `APP7-B03` must confirm that a local,
  permissively licensed encoder produces a payload real Vietnamese banking
  applications read. If it cannot, the ruling requires it to report the exact
  constraint rather than fall back to a remote service — that is a genuine
  possible stop, and it is the earliest point the risk can be retired.
- **The 15-character reference is unvalidated against real bank memo handling.**
  The format is defensive (uppercase alphanumeric, positionally parsed, well
  inside the 25-character field), but no transfer has been made through it.
  `APP7-B03` and `APP7-E01` should treat memo round-tripping as a real
  acceptance question, not a formatting detail.
- **Manual verification is a human control.** The system proves the *expected*
  amount and reference; it cannot prove funds arrived. The Admin surface must
  keep that distinction visible, which is why §12.2 forbids collapsing the three
  facts and §8 requires the interface to say evidence is customer-submitted.
- **`MAX_EVIDENCE_PER_ATTEMPT = 5` is a judgement**, recorded rather than
  referred, as the ruling directs. It is an application guard under the attempt
  row lock, not a CHECK, so it is adjustable without a migration if operations
  finds it wrong.
- **Append-only evidence means a customer who uploads the wrong image cannot
  remove it.** This follows the delivered retained-evidence precedent and is the
  safer default for a payment record, but it is a real UX consequence:
  `APP7-D01` and `APP7-S01` should make the upload deliberate rather than
  incidental.
- **`APP7-R00`'s predicted HTTP paths remain predictions.** Each owning
  checkpoint confirms its own routes and publishes its own OpenAPI.
- The AGG-15 order suites are still red and stay red until `APP7-W01`.

---

## 10. Verdict

```text
APP7-G01 = COMPLETE

PO-APP7-001 =
  MANUAL_BANK_TRANSFER_WITH_DYNAMIC_QR_AND_OPTIONAL_EVIDENCE

APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
IMP-O007 = OPEN — DEFERRED_PROVIDER_INTEGRATION

QR_GENERATION = SERVER_OWNED_DYNAMIC_TRANSFER_QR
QR_DOWNLOAD = REQUIRED

TRANSFER_EVIDENCE_REQUIRED = false
TRANSFER_EVIDENCE_SUPPORTED = true
TRANSFER_EVIDENCE_AUTHORITY = SUPPORTING_RECONCILIATION_ONLY
TRANSFER_EVIDENCE_STORAGE = DELIVERED_ASSET_INTAKE — fourth lane
  (CUSTOMER_UPLOAD / CUSTOMER_PRIVATE, 10 MiB, image-only by content
  signature, private, authorized server-mediated read)
  + one new CTX-PAY association table `payment_transfer_evidence`
TRANSFER_EVIDENCE_CHECKPOINT_DISPOSITION = NEW_CHECKPOINTS
  (APP7-DB01 migration, APP7-B05 customer upload/read, APP7-B06 Admin delivery)

PAYMENT_VERIFICATION = ADMIN_MANUAL_SERVER_SIDE

APP7_SCHEMA_DISPOSITION = MIGRATION_REQUIRED
  (evidence association only; revises APP7-R00 for evidence and nothing else)
ROADMAP_CHANGED_BY_G01 = YES  (12 -> 15 checkpoints)
NEXT CHECKPOINT = APP7-B01
```

Delivered for Product Owner review. The next checkpoint has not been started.
