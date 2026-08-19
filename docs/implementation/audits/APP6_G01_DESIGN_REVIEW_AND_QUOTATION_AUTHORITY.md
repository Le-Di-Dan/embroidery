# APP6-G01 — Design Review, Approval and Quotation Authority

**Checkpoint:** `APP6-G01` · **Decision:** `IMP-D051` · **Date:** 2026-08-19
**ADR:** [`../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md`](../../adr/backend/ADR-APP6-001-CUSTOMER-OWNED-PRODUCT-DESIGN-CONTEXT.md)
**Entry:** `APP6-R00 = COMPLETE` (`c7d0b9b`), accepted by the Product Owner.

This document is the authority every later APP6 checkpoint reads instead of
re-deciding. It creates no runtime code, no schema, no migration, no OpenAPI
artifact and no Figma node. Where an accepted source already rules, this
document **cites** it rather than restating it as a new decision.

---

## 1. Scope of authority

Locked here: COP design-context semantics (ADR-APP6-001); Catalog-versus-COP
geometry; Approval Snapshot evidence; the five APP6 LC-11 transitions; design
review rendering; secure-grant reuse; quotation validity and effective expiry;
the deposit policy handoff; the approval agreement type set and content floor;
idempotency bindings; concurrency and error mappings; event and side-effect
ownership; and the exact `APP6-DB01` schema handoff.

Not locked here, and not reopened: `APP6-R00`; APP5 closure; every DB-era ADR
and specification; APP7 order and payment behaviour.

---

## 2. Source-of-truth used

| Source | What it settled |
|---|---|
| `docs/implementation/audits/APP6_PHASE_ENTRY_AUDIT.md`, `../reports/APP6-R00-COMPLETION-REPORT.md` | Entry facts, capability inventory, roadmap |
| `docs/adr/database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md` | Option A commercial ordering; rules 1–8 |
| `docs/adr/database/ADR-DB3-003-POST-APPROVAL-PRODUCTION-REVISION.md` | Post-approval revision is a new version |
| `docs/adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md` | Single `REQUEST_ACCESS` scope; locked sensitive-action set (r4) |
| `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` | LC-08, LC-11, LC-12 transition rows |
| `docs/database/DB3_TRANSITION_GUARD_CATALOG.md` | GRD-002…GRD-008 |
| `docs/database/DB3_CONCURRENCY_SPECIFICATION.md` | CC-02…CC-06, CC-16 |
| `docs/database/DB3_IDEMPOTENCY_SPECIFICATION.md` | `quotation.accept`, `design.approve` bindings |
| `docs/database/DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` | SE-004, SE-005, SE-015 |
| `docs/database/DB3_AGREEMENT_ACCEPTANCE_SPEC.md` | GRD-008 semantics and the baseline required type set |
| `docs/04-BUSINESS-RULES.md` BR-005, `docs/12-DECISION-LOG.md` D-013/D-014 | 40 / 60 split |
| `docs/01-PRODUCT-REQUIREMENTS.md` §2.1 | The four policy pages |
| Schema source: `design-versions.ts`, `approval-snapshots.ts`, `quotation-versions.ts`, `customer-owned-products.ts`, `design-sessions.ts`, `order-items.ts`, `production-specifications.ts`, `agreements.ts`, `policy-configurations.ts`, `secure-access-grants.ts` | Physical truth |
| Package source: `packages/design-document`, `packages/design-engine` | Document shape and geometry |
| API source: `apps/api/src/platform/policy/publish-app4-policy.use-case.ts`, `packages/database/src/seed/app4-policy-dataset.ts`, `packages/database/seed/app4-policy-configuration.seed.json` | The delivered policy-dataset convention |
| API source: `apps/api/src/modules/customer/domain/grant/secure-link.errors.ts` | The delivered public error vocabulary |

---

## 3. Product Owner rulings — reconciliation

| Ruling | Disposition | Evidence |
|---|---|---|
| **PO-G01-01** COP is a real branch, never a fake Catalog branch | `APPLIED` | ADR-APP6-001 §3.1–§3.2; INV-13; TBL-038 |
| **PO-G01-02** COP geometry is the frozen formal-version envelope | `APPLIED` | ADR-APP6-001 §3.3; `customer_owned_products.physical_*_mm` are nullable and describe the item |
| **PO-G01-03** COP snapshot uses truthful human evidence | `APPLIED`, with one narrow persisted field pair | ADR-APP6-001 §3.6–§3.7; `approval_snapshots.product_name`/`side_name`/`area_name` are already frozen text, not FKs |
| **PO-G01-04** Effective quote expiry is independent of the sweep | `APPLIED`; the equality convention is **confirmed against delivered code**, not assumed | §6.3. `now >= expiresAt` is the delivered convention in `submit-verification-attempt.use-case.ts`, `read-verification-challenge-status.query.ts` and `challenge-intake.authorizer.ts` |
| **PO-G01-05** Minimal approval agreement set | `SUPERSEDED_BY_STRONGER_EXISTING_AUTHORITY` **for the type set**; `APPLIED` **as the content floor** | `DB3_AGREEMENT_ACCEPTANCE_SPEC.md` §2.1 already locks the required set as policy config with a payment + return baseline. §5 |
| **PO-G01-06** Quotation validity | `APPLIED` — no accepted concrete duration exists (`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md` records the window as `[cfg]`), so the 7-calendar-day fallback is used | §6.1 |
| **PO-G01-07** Deposit 40 % is policy handoff only | `APPLIED`, with one clarification: `quotation_versions.deposit_percent`/`deposit_amount`/`remaining_amount` are `NOT NULL` **pricing** columns under CST-064, so APP6 writes the split. It creates no Order, obligation, attempt or collection | §6.4 |
| **PO-G01-08** Review rendering is client-side | `APPLIED` | §8 |
| **PO-G01-09** Secure access reuses `REQUEST_ACCESS` | `APPLIED` | §7; `GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']` is a closed single-value set |
| **PO-G01-10** System projection rule | `APPLIED` | §4 |

No irreconcilable conflict was found.

```text
TRUE_PO_DECISION = none
```

---

## 4. Lifecycle projection table — the five APP6 LC-11 transitions

| Transition | Actor | Owning aggregate / use case | Precondition / guard | Transaction boundary | Audit evidence | Outbox / event | Directly commandable? | Error mapping |
|---|---|---|---|---|---|---|---|---|
| `TR-LC11-05` `UNDER_REVIEW → QUOTED` | **system** | Quotation send (`TR-LC12-02`), `APP6-B03` | Totals valid; validity window set; version frozen (INV-02) | The **same** transaction that freezes the version, sets the current pointer and supersedes the prior sent version | Request transition row + quotation audit | `SE-004` `quotation.sent`, after commit | **No** | Not reachable by command; an attempt is `INVALID_TRANSITION` |
| `TR-LC11-06` `QUOTED → QUOTE_ACCEPTED` | **system** | Quotation acceptance (`TR-LC12-03`), `APP6-B05` | GRD-002, GRD-003, **GRD-006** | The **same** transaction that records the acceptance evidence | Request transition row + critical acceptance audit | none required by DB3 (§9) | **No** | `SECURE_LINK_UNAVAILABLE`, `REVERIFICATION_REQUIRED`, `QUOTE_VERSION_STALE` |
| `TR-LC11-07` `QUOTE_ACCEPTED → DIGITIZING` | **admin** | Request transition, `APP6-B06` | **GRD-005** — request is `QUOTE_ACCEPTED`, no override (ADR-DB3-001 r1) | Its own transaction on the request row | Request transition row, actor server-derived | none | **Yes — the only one** | `QUOTE_NOT_ACCEPTED`; wrong source state `INVALID_TRANSITION` |
| `TR-LC11-08` `DIGITIZING → DESIGN_REVIEW` | **system** | Send version for review (`TR-LC08-02`), `APP6-B09` | **GRD-004** single active review; document canonicalised and hashed | The **same** transaction that freezes the document, marks the version and supersedes the prior one | Request transition row + design audit | `SE-004` `design.review-ready`, after commit | **No** | `REVIEW_ALREADY_ACTIVE` |
| `TR-LC11-09` `DESIGN_REVIEW → APPROVED` | **system** | Design approval (`TR-LC08-04`), `APP6-B11` | GRD-002, GRD-003, **GRD-007**, **GRD-008** | The **same** transaction that creates the Approval Snapshot | Request transition row + critical approval audit | `SE-005` `design.approved`, after commit | **No** | `SECURE_LINK_UNAVAILABLE`, `REVERIFICATION_REQUIRED`, `APPROVAL_VERSION_MISMATCH`, `TERMS_NOT_ACCEPTED`, `INVALID_TRANSITION` |

### 4.1 The projection rule (locked)

`QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and `APPROVED` are reached **only**
as a projection of the owning aggregate's committed event, inside that event's
own transaction.

- No follow-up "sync state" API exists or may be added.
- No generic "set request state" use case exists or may be added.
- No APP6 screen, contract or Admin action may offer one of the four as a
  selectable transition target.
- `APP6-B06` widens the delivered `APP5-B05` transition endpoint's
  **application-layer** allow-list by exactly one target, `DIGITIZING`, and
  publishes **no new HTTP operation**. Widening it by any of the four system
  targets is the specific failure this checkpoint exists to prevent.

---

## 5. Agreement authority

### 5.1 Required type set

`DB3_AGREEMENT_ACCEPTANCE_SPEC.md` §2.1 already locks the shape: the required
set is **policy configuration** (CON-144) so business may change it without a
schema change, with a **payment-policy + return-policy baseline**. That is
stronger, already-accepted authority than PO-G01-05's `DESIGN_APPROVAL_TERMS`
fallback, so the baseline is preserved. Under the repository's closed-set
naming convention (`REQUEST_ACCESS`, `NOTIFICATION_INTENT`) and the four policy
pages of `01 §2.1`, the literals are:

```text
design_approval.agreements.requiredAgreementTypes = [PAYMENT_POLICY, RETURN_POLICY]
```

`agreements.agreement_type` carries no `CHECK` (COL-TBL068-01, deliberately
config-extensible), so this is data, not schema.

### 5.2 What PO-G01-05 still governs — the content floor

PO-G01-05's five semantic points are preserved as the **minimum** each required
agreement's content must support, and four of them are already enforced
elsewhere rather than by prose:

| PO-G01-05 point | Where it lives |
|---|---|
| 1 — consent is to the exact design version shown | **GRD-007**: version id + document hash must match in transaction |
| 2 — later production may rely on the approved design after APP7 gates | Payment-policy content (`PAYMENT_POLICY`) |
| 3 — a later design change requires a new version and new approval | **ADR-APP6-001 §3.5** + ADR-DB3-003; `uq_approval_snapshots__version` |
| 4 — approval collects no payment and creates no order | **ADR-DB3-001 r2/r7**: the order and both obligations are APP7's, guarded by GRD-009 |
| 5 — the exact agreement version is stored in immutable approval evidence | **`approval_snapshot_agreement_acceptances`** + CST-091 |

**No APP6 checkpoint invents legal text.** Agreement content is
Product-Owner-supplied. If no PO content exists when `APP6-B10` needs an
effective version, it publishes content limited to the workflow consent above
and nothing else — no warranty, liability, privacy or unrelated legal term.

### 5.3 Binding rules

| Rule | Ruling |
|---|---|
| Effective version retrieval | `EFFECTIVE` is derived — `PUBLISHED`, inside its effective window, not superseded or withdrawn. Exactly one effective version per type at any instant |
| What the customer sees | `APP6-B10` returns the effective version — id, type, and content hash — **alongside the exact design version**, in the same read. The customer never approves against a set they were not shown |
| What approval submits | `APP6-B11` submits the exact `agreementVersionId` set plus each content hash |
| Verification | GRD-008 in transaction: the submitted set must equal the current required set, each version must still be effective, and each content hash must match. Any mismatch is `TERMS_NOT_ACCEPTED` and the client re-reads |
| Snapshot | The exact accepted `agreement_version_id` + frozen `agreement_type` + content hash + acceptance timestamp per type |
| Later publication | Never mutates historical evidence. A withdrawn or superseded version is retained while referenced (ADR-DB1-011). A published change forces re-consent only through a **new approval event** (ADR-DB3-003) |
| Quotation acceptance | Requires **no** separate terms acceptance — one ceremony at approval (`DB3_AGREEMENT_ACCEPTANCE_SPEC` §2.4) |

### 5.4 Publication owner

No agreement publication path is delivered. Following the APP4 precedent
exactly — `APP4-G01` shipped the dataset, `APP4-B01-C1` shipped the reader and
the publishing use case attached to the one Admin-bearing path — agreement
content authoring and publication is owned by **`APP6-B10`**, the first
checkpoint that needs an effective version to return. It adds no HTTP
operation.

---

## 6. Quotation policy authority

### 6.1 Validity

No accepted concrete duration exists: `DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md`
and `DB5_ARCHIVE_RETENTION_INDEXING.md` both record the validity window as
`[cfg]`. PO-G01-06's fallback therefore applies.

```text
quotation.validity.validityDays = 7   (calendar days)
```

`valid_from` is the **committed send instant** of `TR-LC12-02`, using the
repository's `instant` (`timestamptz`) convention; `valid_until` is
`valid_from + 7 calendar days`. CST-064 already requires
`valid_from < valid_until`, and COL-TBL051-18 already requires both at send.
The expiry **sweep** (`TR-LC12-05`, `SE-015`) stays out of APP6.

### 6.2 Exact money

Locked, end to end, with no new mechanism: `numeric(14,2)` in PostgreSQL →
string across the repository port → string in the application layer → string in
the HTTP envelope → string in the generated client → string in the UI.

- No `number`, no `parseFloat`, no arithmetic in JavaScript on an amount that
  is persisted or displayed.
- `deposit_percent` is `numeric(5,2)`; the split is computed **in the database
  layer or from decimal-exact values**, never in JavaScript floating point.
- CST-064 is the arbiter: `deposit_amount + remaining_amount = total_amount`
  and `total = subtotal + adjustment + shipping fee`.
- `currency_code` is `'VND'` by `CHECK`; no currency is selectable.
- Every new APP6 nullable-string OpenAPI property is declared
  `@ApiProperty({ type: String, nullable: true })`, so APP6 adds none of the
  debt `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` records.

### 6.3 Effective expiry

```text
effective_expired  =  now >= valid_until
```

evaluated whenever the version is otherwise sent and acceptance-eligible.
Equality means expired; this is not a new convention — it is the delivered one
(`now >= challenge.expiresAt` in three APP4 call sites).

| Surface | Behaviour |
|---|---|
| `APP6-B05` acceptance | Rejects after `valid_until` **in transaction**, under the version row lock, regardless of the persisted status |
| `APP6-B04` secure read | Exposes effective expiry even when the persisted status is still `SENT` |
| `APP6-S01` Storefront | Renders expiry from the backend contract/state; it computes no expiry of its own from a clock |
| Sweep | May normalise persistence later. It is **never** the correctness arbiter |

### 6.4 Deposit

```text
quotation.deposit.depositPercent   = 40
quotation.deposit.remainingPercent = 60
```

BR-005 and D-013/D-014, preserved unchanged as policy authority. APP6 writes
the `deposit_percent` / `deposit_amount` / `remaining_amount` split onto the
quotation version because CST-064 makes those columns `NOT NULL` pricing facts.
APP6 creates **no** Order, **no** payment obligation, **no** payment attempt and
**no** collection — ADR-DB3-001 r7 places all of that in APP7 behind GRD-009.

### 6.5 Policy dataset

Values live in `packages/database/seed/app6-policy-configuration.seed.json`,
versioned through `policy_configurations` / `policy_configuration_versions`
(TBL-076 / TBL-077) — the delivered versioned-policy infrastructure. No new
policy system is introduced. `APP6-G01` ships **data only**; the reader and the
publishing caller are `APP6-B01`, exactly as `APP4-G01` shipped its dataset and
`APP4-B01-C1` shipped the reader and publisher.

---

## 7. Secure access authority

Reuse, without extension:

- **Scope kind:** `REQUEST_ACCESS`. `GRANT_SCOPE_KINDS` is a closed
  single-value set (ADR-DB3-004 r1). APP6 introduces **no** quote-specific or
  design-specific grant kind, **no** new token format, and **no** customer
  account or password.
- **Architecture:** the delivered APP4 secure grant, secure link, resolution
  and step-up services.

| APP6 action | Grant | Step-up (GRD-003) | Owner |
|---|---|---|---|
| View quotation | required | no | `APP6-B04` |
| Accept quotation | required | **yes** — ADR-DB3-004 r4 locked sensitive set | `APP6-B05` |
| Reject quotation | required | no — TR-LC12-06 lists GRD-002 only | `APP6-B05` |
| View exact design under review | required | no | `APP6-B10` |
| Approve design | required | **yes** — locked sensitive set | `APP6-B11` |
| Request revision | required | no — TR-LC08-03 lists GRD-002 only | `APP6-B11` |

Every sensitive write re-checks, **inside its own transaction**: grant status
and expiry (CC-16, a committed revoke wins), scope and request-target ownership
(INV-08), step-up freshness within the window where required, and exact-version
eligibility (GRD-006 or GRD-007).

- **Customer identity is derived from the grant.** No client-supplied
  `customerId` is ever authority, in any APP6 operation.
- **Admin identity is server-derived.** No client-supplied `adminId`.
- The token travels in the **request body of a POST**, never in a query
  string, path, browser history or server log — the delivered APP5-B03 pattern.
- The fragment is stripped before any request on `APP6-S01` and `APP6-S02`.
- **Public error vocabulary:** every grant-validity failure — read *or* write,
  and covering unknown, expired, revoked, wrong target and wrong scope —
  answers with the single delivered non-enumerating
  `SECURE_LINK_UNAVAILABLE`. `GRANT_INVALID` remains the DB3-internal guard
  name. `REVERIFICATION_REQUIRED` is returned **only** when the grant is valid
  and step-up alone is missing, because the customer must be able to act on it.

---

## 8. Rendering authority

```text
safe formal design document
  → the delivered APP3 native-SVG renderer (IMP-D026, ADR-APP0-001)
  → the delivered APP3-S09 runtime watermark
  → the customer review UI
```

Locked:

- **No APP6 server-side design→raster pipeline** is created.
  `design_versions.preview_derivative_id` and `preview_hash` remain `NULL` on
  the APP6 path; both columns are already nullable, so nothing is worked
  around.
- **No export and no download path** on the customer review surface.
- **No generic private-asset endpoint**, and no storage key, bucket name or
  provider URL is ever exposed in a response.
- The document delivered to the review UI is the **safe** formal document —
  what `APP6-B10` publishes, never a raw private original.
- Reversible: a preview derivative can be added later without remodelling, as
  both columns already exist.

| Proof owner | What it must prove |
|---|---|
| `APP6-B10` | The safe secure review read: exact version only, no storage key, no private original |
| `APP6-S02` | Renders the exact version, applies the watermark, offers no export path |
| `APP6-E01` | Focused acceptance across the journey, catalogue and COP |

---

## 9. Event and side-effect authority

Only the events accepted authority already requires. None is created for
symmetry.

| Event | Required? | Owning transaction | Outbox timing | Notification consequence | Consumer | Boundary |
|---|---|---|---|---|---|---|
| `quotation.sent` (`SE-004`) | **yes** | `TR-LC12-02` send | after commit | Customer secure-link notification carrying the quotation | APP4 notification worker | Amounts may appear; no document content |
| `design.review-ready` (`SE-004`) | **yes** | `TR-LC08-02` send for review | after commit | Customer secure-link notification | APP4 notification worker | No document content |
| `design.revision-requested` (`SE-004`) | **yes** | `TR-LC08-03` | after commit | Admin alert | Admin surface | — |
| `design.approved` (`SE-005`) | **yes** | `TR-LC08-04` approval | after commit | Approval confirmation | **APP7** order creation trigger + notification | **APP6 emits it and stops.** APP6 creates no Order, no obligation and no payment |
| `quotation.accepted` | **no** | — | — | — | — | `SE-004` does not list it; `TR-LC12-03` records evidence and audit, and APP7 reads the accepted version. Not created |
| `quotation.rejected` | **no** as an outbox event | `TR-LC12-06` | — | Admin alert through the delivered admin surface | — | `SE-004` does not list it. Not created |
| `SE-015` quote-expiry sweep | **out of APP6 scope** | — | — | Optional expiry notice | later phase | Correctness never depends on it (§6.3) |

External notification provider selection remains deferred (IMP-O006, routed to
APP12). The provider-neutral recording adapter is sufficient workflow evidence.

---

## 10. Idempotency authority

The bindings are already accepted in `DB3_IDEMPOTENCY_SPECIFICATION.md`. They
are confirmed, not replaced, and no new infrastructure is introduced —
`idempotency_records` and the delivered claim mechanism are reused.

| Action | Namespace | Scope | Fingerprint | Replay returns |
|---|---|---|---|---|
| Quotation acceptance | `quotation.accept` | the exact quotation **version** | version id + accepted total | the existing acceptance evidence |
| Design approval | `design.approve` | the exact design **version** | version id + document hash + terms version | the existing Approval Snapshot |

Dispositions for the remaining APP6 actions:

| Action | Disposition |
|---|---|
| Revision request (`TR-LC08-03`) | **Natural, not a namespace.** One decision per version; a second decision on a decided version loses to CC-04 and returns `INVALID_TRANSITION` with the recorded first decision |
| Quotation reject (`TR-LC12-06`) | **Natural.** The version's terminal state is the record; a repeat on a `REJECTED` version is `INVALID_TRANSITION` |
| Send for review, duplicate or concurrent (`TR-LC08-02`) | **Natural, arbitrated by `uq_design_versions__case__sent_for_review`.** A resend of the same version replays; a second version's send loses and maps to `REVIEW_ALREADY_ACTIVE` |
| Quotation send, duplicate or concurrent (`TR-LC12-02`) | **Natural.** `TR-LC12-02` records "resend replays"; a version already `SENT` is not re-frozen and not re-priced, and the current pointer is not re-advanced |

---

## 11. Concurrency and error authority

| Scenario | Database arbiter | Transaction lock / check | Public application error | Idempotent replay | Proof owner |
|---|---|---|---|---|---|
| **CC-03** simultaneous send-for-review | `uq_design_versions__case__sent_for_review` partial unique index | Constraint failure inside the send transaction; GRD-004 | `REVIEW_ALREADY_ACTIVE` | n/a — natural | `APP6-B09` |
| **CC-02** approval vs a superseding version | design version row | `FOR UPDATE` on the version + in-transaction state check; GRD-007 | `APPROVAL_VERSION_MISMATCH` | replay returns the snapshot if the approval itself already committed | `APP6-B11` |
| **CC-04** approval vs revision request | design version row | `FOR UPDATE`; first decision wins | `INVALID_TRANSITION`, naming the recorded first decision | n/a | `APP6-B11` |
| **CC-05** stale quotation acceptance | quotation version row | `FOR UPDATE` + in-transaction state/current-pointer check; GRD-006 | `QUOTE_VERSION_STALE` | n/a — the stale version never accepted | `APP6-B05` |
| **CC-06** expiry vs acceptance | quotation version row | `FOR UPDATE`; committed-first wins; `now >= valid_until` evaluated in transaction | `QUOTE_VERSION_STALE` | n/a | `APP6-B05` |
| **CC-16** grant revoke vs sensitive action | `secure_access_grants` row | Grant status re-read **inside** the action transaction (ADR-DB3-004 r9); a committed revoke wins | `SECURE_LINK_UNAVAILABLE` | n/a | `APP6-B05`, `APP6-B11` |
| Duplicate quotation acceptance | `idempotency_records` claim | Claim taken before the write | `200`-class replay, not an error | **yes** — the acceptance evidence | `APP6-B05` |
| Duplicate design approval | `idempotency_records` claim | Claim taken before the write | `200`-class replay, not an error | **yes** — the Approval Snapshot | `APP6-B11` |
| Digitizing command on a non-accepted request | `custom_requests` row | `FOR UPDATE` + GRD-005 | `QUOTE_NOT_ACCEPTED` | n/a | `APP6-B06` |
| Request-state race caused by a design or quotation event | `custom_requests` row | The row is contended **inside** the owning transaction; the projection lives there, never in a second call | `INVALID_TRANSITION` | n/a | `APP6-B03`, `B05`, `B09`, `B11` |

`REVIEW_ALREADY_ACTIVE` is the only one of these already present in the
delivered error-mapping catalogue (`DB7_ERROR_MAPPING_CATALOG.md`); the rest
carry their DB3 guard names, and each owning checkpoint publishes the code
exactly as named here rather than inventing a synonym.

---

## 12. `APP6-DB01` handoff

```text
DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS
```

The eight authorised schema operations, the branch `CHECK` shapes, FK delete
behaviour, branch completeness, index and uniqueness impact, backfill
behaviour, and migration safety and reversibility are published in full in
**ADR-APP6-001 §4**. `APP6-DB01` implements exactly that list and nothing else.

Two items are explicitly **not** part of the DB01 contract:

1. The `packages/design-document` placement widening (ADR-APP6-001 §3.4) —
   owner `APP6-B08`. It is a package change, not a schema change.
2. Any COP-lookup index — a later access-path decision, not a correctness one.

---

## 13. What this checkpoint did not do

- No API controller, use case, module, service or DTO.
- No `apps/admin` or `apps/storefront` change.
- No worker behaviour.
- No schema file, no SQL, no migration. Migration count stays **35**.
- No OpenAPI artifact and no generated-client regeneration.
- No Figma node and no `FIGMA_DESIGN_INDEX.md` row. `APP_06` stays at zero.
- No APP7 order or payment logic.
- No root `package.json` script.
