# DB7 TX/App Guard Matrix

Every guard that the physical DB6 schema cannot enforce, and what DB7 does about it.

Sources: `DB3_TRANSITION_GUARD_CATALOG.md` (GRD-001..030),
`DB3_INVARIANT_ENFORCEMENT_PLAN.md`, `DB4_GUARD_SCHEMA_TRACEABILITY.md` (CON tiers),
`DB6_RELATIONSHIP_COVERAGE_AUDIT.md` (REL-103/104), `DB6_DEVIATION_REGISTER.md`
(DEV-DB6-015/016/017), `DB6_S24_TRIGGER_REPORT.md` (CST-090..100).

Status vocabulary:

| Status | Meaning |
|---|---|
| `implemented` | DB7 implements the guard as a named function/service inside an explicit transaction, with positive + negative integration tests. |
| `tested` | implemented **and** the negative case proves the guard rejects, with rollback evidence where the command is multi-table. |
| `deferred to DB8` | the *single-run* behavior is implemented and tested; the concurrent/race behavior is not proven and is listed in `DB7_DB8_HANDOFF.md`. |
| `not applicable (DB7)` | the guard is not a persistence guard — it belongs to authn/authz, transport validation, or a provider adapter. Evidence given per row. |

Column `Physical` records what the database already guarantees, so no guard is duplicated
without reason and none is falsely claimed.

---

## 1. Same-root current-version pointer guards (CON-058..060 family)

The FK on a `current_*_id` column proves the referenced row exists. It does **not** prove
the row belongs to the same root. Every guard below re-reads the pointer inside the same
transaction before writing.

| ID | Guard | Tables / columns | Business meaning | Physical | Missing application guarantee | Tx boundary | Lock / read | Owner | Tests | DB8 handoff |
|---|---|---|---|---|---|---|---|---|---|---|
| G-DB7-01 | Agreement current version belongs to the Agreement | `agreements.current_version_id` → `agreement_versions` | a policy type publishes only its own versions | FK exists (RESTRICT) | version's `agreement_id` must equal the agreement's id | agreement publish tx | `SELECT … FOR UPDATE` on `agreements` | `AgreementRepository.setCurrentVersion` | positive + wrong-root negative + rollback | version-publish race |
| G-DB7-02 | Design Case current version belongs to the case | `design_cases.current_version_id` → `design_versions` | a case points only at its own versions | FK exists | version's `design_case_id` must equal the case id | version create/send tx | `FOR UPDATE` on `design_cases` | `DesignCaseRepository.setCurrentVersion` | positive + wrong-root negative + rollback | CC-02/03 |
| G-DB7-03 | Quotation current version belongs to the quotation | `quotations.current_version_id` → `quotation_versions` | INV-02 | FK exists | version's `quotation_id` must equal the quotation id | version create/send tx | `FOR UPDATE` on `quotations` | `QuotationRepository.setCurrentVersion` | positive + wrong-root negative + rollback | CC-05/06 |
| G-DB7-04 | Request current Quotation belongs to the request | `custom_requests` ↔ `quotations.custom_request_id` | one request ↔ one quotation case | FK + UNIQUE on `quotations.custom_request_id` | pointer must resolve to the same request root | quotation create tx | read in tx | `QuotationRepository.createForRequest` | positive + cross-request negative | CC-05 |
| G-DB7-05 | Order current Approval Snapshot belongs to the chain | `orders` → `approval_snapshots` → `design_versions` → `design_cases` → `custom_requests` | INV-19: the order freezes the *same* case's approval | FKs exist per hop | the whole chain must resolve to one request root | order creation tx | read chain in tx | `OrderChainGuard` (order module) | positive + broken-chain negative at each hop + rollback | CC-11 |
| G-DB7-06 | Payment satisfaction attempt belongs to the obligation | `payment_obligations.satisfied_by_attempt_id` → `payment_attempts` | INV-07/15 | FK exists (added by migration `0025`) | attempt's `payment_obligation_id` must equal the obligation id | obligation satisfaction tx | `FOR UPDATE` on `payment_obligations` | `PaymentObligationRepository.satisfy` | positive + foreign-attempt negative + rollback | CC-07/08 |
| G-DB7-07 | Production Specification belongs to the job / approval chain | `production_specifications.production_job_id`, job → `approval_snapshots` | INV-03/06 | FK + UNIQUE (one spec per job) | spec must be frozen from the job's own approval snapshot | job creation tx | read chain in tx | `ProductionJobRepository.createJob` | positive + mismatched-approval negative + rollback | CC-12 |
| G-DB7-08 | Policy configuration current version belongs to the configuration | `policy_configurations.current_version_id` → `policy_configuration_versions` | CON-144 | FK exists (migration `0004`) | version's `policy_configuration_id` must equal the config id | config publish tx | `FOR UPDATE` on `policy_configurations` | `PolicyConfigurationRepository.publishVersion` | positive + wrong-root negative | config-publish race |
| G-DB7-09 | Design Case pointer on the request resolves to the same request | `custom_requests.design_case_id` ↔ `design_cases.custom_request_id` | 1–1 case per request | FK both directions (migrations `0013`/`0012`) | both directions must agree | design case creation tx | read in tx | `DesignCaseRepository.createForRequest` | positive + crossed-pointer negative | — |

## 2. Placement hierarchy (Product / Variant / Side / Area)

| ID | Guard | Applies to | Physical | Missing application guarantee | Tx boundary | Owner | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| G-DB7-10 | Variant belongs to Product | any row carrying both `product_id` and `product_variant_id` | separate FKs only | the variant's `product_id` must equal the row's `product_id` | the writing use case's tx | `PlacementHierarchyGuard` (catalog module, exported as a port) | valid chain + each wrong-hop negative | implemented, tested |
| G-DB7-11 | Side belongs to Product | rows carrying `product_id` + `product_side_id` | separate FKs only | side's `product_id` must equal the row's `product_id` | same | same | same | implemented, tested |
| G-DB7-12 | Area belongs to Side | rows carrying `product_side_id` + `embroidery_area_id` | separate FKs only | area's `product_side_id` must equal the row's `product_side_id` | same | same | same | implemented, tested |
| G-DB7-13 | All placement refs form one valid chain | `design_sessions`, `design_versions`, `approval_snapshots`, `production_specifications` | none across tables | one `resolvePlacement` call validates the whole chain before insert | the writing use case's tx | consumers of `PlacementHierarchyGuard` | one positive + one negative per consumer | implemented, tested |

`PlacementHierarchyGuard` is a single named service, not repeated ad-hoc checks; consumers
call it through a port so no module reaches into the catalog module's persistence.

## 3. Design / Approval chain

| ID | Guard | GRD | Physical | Application guarantee | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-14 | Approval binds the exact version **and** its document hash | GRD-007 | UNIQUE (`design_version_id`) on `approval_snapshots`; no hash comparison | submitted `(version id, document hash)` must equal the stored pair, read in the approval tx | `ApprovalSnapshotRepository.createFromVersion` | implemented, tested |
| G-DB7-15 | Single active review per case | GRD-004 | **DB partial unique index** enforces it | application maps the `23505` to `REVIEW_ALREADY_ACTIVE` rather than leaking it | `DesignCaseRepository.sendForReview` | implemented, tested; race → DB8 CC-03 |
| G-DB7-16 | Effective agreement accepted with matching content hash | GRD-008 | UNIQUE (`snapshot`, `agreement_version`); no effectiveness/hash check | required agreement types must each have a PUBLISHED effective version whose hash matches the captured acceptance | `ApprovalSnapshotRepository.createFromVersion` + `AgreementQueryRepository.effectiveVersions` | implemented, tested |
| G-DB7-17 | Design version immutable once sent | GRD-024 / CST-090..100 | **S24 trigger** raises SQLSTATE `23000` | catch and map to `IMMUTABLE_RECORD`; never surface the raw message | error mapper + `DesignCaseRepository` | implemented, tested |
| G-DB7-18 | Template published before clone | GRD-028 | none | source template state must be PUBLISHED at read time | `DesignTemplateRepository.loadPublished` | implemented, tested |
| G-DB7-19 | Session active / autosave revision current | GRD-027 | none | session must be ACTIVE and unexpired; stale revision marker → `STALE_WRITE` | `DesignSessionRepository.saveDocument` | implemented, tested; race → DB8 CC-01 |

## 4. Quotation / Order conversion

| ID | Guard | GRD | Physical | Application guarantee | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-20 | Acceptance binds the exact current, SENT, unexpired version | GRD-006 | UNIQUE on `quotation_acceptances.quotation_version_id` | re-read `current_version_id` **inside** the acceptance tx; state must be SENT and not expired | `QuotationRepository.accept` | implemented, tested; race → DB8 CC-05/06 |
| G-DB7-21 | Order creation gate | GRD-009 | UNIQUE (`orders.custom_request_id`) | approval snapshot exists **and** current quotation version is ACCEPTED **and** no order exists for the request | `OrderRepository.createFromAcceptedQuotation` | implemented, tested; duplicate-submit race → DB8 CC-11 |
| G-DB7-22 | Quotation accepted before digitizing | GRD-005 | none | request state must be `QUOTE_ACCEPTED` | `CustomRequestRepository.transition` | implemented, tested |
| G-DB7-23 | Order frozen commercial fields never mutate | INV-12 / CST-090..100 | **S24 trigger** on `order_items` | map trigger rejection to `IMMUTABLE_RECORD` | error mapper + `OrderRepository` | implemented, tested |
| G-DB7-24 | Shipping frozen at dispatch | GRD-017 | S24 trigger on `shipping_snapshots`; `shipping_details` freeze flag | detail must be complete, then frozen and snapshotted **in the dispatch tx** | `OrderRepository.dispatch` | implemented, tested; race → DB8 CC-15 |
| G-DB7-25 | Transition legality (no backward transitions) | GRD-019 | CHECK on status values only | the from→to pair must exist in the lifecycle spec, checked under the root row lock | each root repository's `transition` method | implemented, tested |

## 5. Inventory

| ID | Guard | GRD | Physical | Application guarantee | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-26 | Sufficient stock under the row lock | GRD-014 | CHECK `quantity_on_hand >= 0`; `sku_stocks` is the lock anchor | `SELECT … FOR UPDATE` the stock row, compute `available = on_hand − Σ active holds/reservations`, reject if short | `SkuStockRepository.loadForUpdate` + `reserve`/`hold` | implemented, single-run tested; **oversubscription under concurrency → DB8 CC-20** |
| G-DB7-27 | Official reservation eligibility | GRD-013 | partial unique on active reservation | approval must exist and the deposit obligation must be SATISFIED | `ReservationEligibilityGuard` (inventory module) | implemented, tested; race → DB8 CC-22 |
| G-DB7-28 | Soft hold → reservation conversion | GRD-013 | partial unique active-hold index | the hold must be ACTIVE and belong to the same request/SKU; conversion and ledger append share one tx | `SkuStockRepository.convertHold` | implemented, tested; race → DB8 CC-21 |
| G-DB7-29 | Every stock change appends a ledger entry | INV-14 | none | the balance write and the ledger append are in one transaction; rollback proves neither survives alone | `SkuStockRepository` (all mutating methods) | implemented, tested (rollback evidence) |
| G-DB7-30 | Negative-stock override needs an explicit reason | GRD-023 | CHECK on reason presence where modelled | override flag requires a non-empty reason and an admin actor | `SkuStockRepository.adjust` | implemented, tested |

## 6. Payment / Refund

| ID | Guard | GRD | Physical | Application guarantee | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-31 | Deposit payable only post-approval | GRD-010 | none | the obligation must exist via an order whose approval snapshot exists | `PaymentObligationRepository.createForOrder` | implemented, tested |
| G-DB7-32 | Provider event recorded idempotently | GRD-011/012 | UNIQUE (`provider`, `provider_event_ref`) | insert with `ON CONFLICT DO NOTHING` semantics; a duplicate callback replays, it does not double-satisfy | `PaymentEventRepository.record` | implemented, tested; concurrent-callback race → DB8 CC-07/08 |
| G-DB7-33 | Obligation satisfaction evidence | GRD-011 + G-DB7-06 | FK on `satisfied_by_attempt_id` | the satisfying attempt must belong to this obligation, be SUCCEEDED, and match amount+currency | `PaymentObligationRepository.satisfy` | implemented, tested |
| G-DB7-34 | Money evidence immutability | INV-07 / CST-100 | **S24 triggers** on `payment_provider_events`, `payment_reconciliations`, and the amount columns of `refunds` | map the rejection to `IMMUTABLE_EVIDENCE` | error mapper + payment repositories | implemented, tested |
| G-DB7-35 | Refund approval ceiling and mandatory reason | GRD-021 | CHECK on non-negative amounts | amount ≤ refundable (settled attempts − prior refunds), reason present, reconciled inside the tx | `RefundRepository.approve` | implemented, tested |
| G-DB7-36 | Refund execution evidence | GRD-021 | S24 column-scoped trigger | execution may only change the execution columns of an APPROVED refund | `RefundRepository.execute` | implemented, tested |
| G-DB7-37 | Final payment before dispatch | GRD-016 | none | the REMAINING obligation must be SATISFIED, read in the dispatch tx | `OrderRepository.dispatch` | implemented, tested; race → DB8 CC-14 |

## 7. Secure-flow guards

| ID | Guard | GRD | Physical | Application guarantee | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-38 | Grant belongs to the customer | GRD-002 | FK to `customers` | the grant's `customer_id` must equal the acting customer | `SecureAccessGrantRepository.resolveActive` | implemented, tested |
| G-DB7-39 | Grant belongs to the request where the operation requires it | GRD-002 / INV-08 | FK to `custom_requests` (nullable) | when the operation is request-scoped, the grant's `custom_request_id` must equal it | same | implemented, tested |
| G-DB7-40 | Grant purpose/scope covers the operation | GRD-002, DEV-DB6-015/016 | none — purpose/scope are values | the requested operation must be in the grant's scope set, and the grant ACTIVE and unexpired, read in the operation's tx | same | implemented, tested; revoke-vs-use race → DB8 CC-16 |
| G-DB7-41 | Verification challenge belongs to the expected contact + purpose | GRD-026 / INV-19 | partial unique (one open per contact+purpose) | the challenge must belong to the contact point and purpose being verified, and be OPEN | `VerificationChallengeRepository.resolveOpen` | implemented, tested; race → DB8 CC-17 |
| G-DB7-42 | Acknowledgement evidence matches the secure flow | GRD-006/008/017 | UNIQUE on the evidence rows | quotation acceptance / agreement acceptance / shipping-fee acknowledgement must carry the grant that authorised it | the owning repositories | implemented, tested |
| G-DB7-43 | Step-up re-verification window | GRD-003 | none | a completed challenge within the configured window must exist for the sensitive operation | `VerificationChallengeRepository.hasRecentCompleted` | implemented, tested (window value read from policy configuration, not hard-coded) |
| G-DB7-44 | Actor authorization class | GRD-025 | none | **not applicable (DB7)** as an authorization decision — DB7 persists and validates the *actor evidence* (class + id + no-FK admin reference); the authorization decision itself belongs to the authn/authz layer, which does not exist yet | — | not applicable (DB7); recorded for the auth phase |
| G-DB7-45 | Challenge rate/attempt limits | GRD-026 | none | attempt counting persistence is implemented (`attempts` append + count read); the *rate policy decision* is an application-service concern layered on it | `VerificationChallengeRepository` | persistence implemented, tested; policy enforcement + race → DB8 CC-17 |

## 8. Intentional no-FK reference validation

These references have **no** physical FK by design. DB7 must not claim database referential
integrity for them, and must validate them in the application where the canonical documents
require it.

| ID | Reference | REL / DEV | Why no FK | DB7 obligation | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-46 | `audit_events.target_kind` + `target_id` | REL-103 | polymorphic target across 20+ tables | validate `target_kind` against the closed kind set; **do not** resolve `target_id` to a row — the target may legitimately be deleted/anonymized later, and audit rows outlive their targets. Documented as an intentionally unresolved reference. | `AuditEventRepository.append` | implemented, tested |
| G-DB7-47 | `outbox_events.aggregate_kind` + `aggregate_id` | REL-104 | polymorphic aggregate reference | validate `aggregate_kind` against the closed kind set; the id is written inside the same transaction as the aggregate row, so its existence is guaranteed by the transaction, not by a FK | `OutboxEventStore.append` | implemented, tested |
| G-DB7-48 | `notification_intents.recipient_contact_point_id` | DEV-DB6-016 | optional recipient; intents may target an address not yet a contact point | when present, the application resolves it against `customer_contact_points` **through the customer module's port** and rejects an unresolvable id | `NotificationIntentRepository.create` | implemented, tested |
| G-DB7-49 | `notification_intents.source_outbox_event_id` | DEV-DB6-016 | outbox rows are TTL-cleaned; a FK would block cleanup | when present, resolve at creation time only; a later-missing row is explicitly **permitted** and documented, never treated as corruption | `NotificationIntentRepository.create` | implemented, tested (both the resolvable and the intentionally-unresolved case) |
| G-DB7-50 | Bare admin actor id on evidence rows | DB4 actor model | evidence must survive admin-account deletion | validate the admin exists **at write time** via the identity port; do not add a FK; a later-missing admin is permitted | `AdminActorGuard` (identity port) consumed by evidence writers | implemented, tested |
| G-DB7-51 | Generic job key on `background_job_attempts` | DB4 platform model | free-form job identity | validate against the registered job-key set at write time | `BackgroundJobAttemptStore.record` | implemented, tested |

**Permitted unresolved references** (recorded so no future reader mistakes them for a bug):
G-DB7-46 target rows after anonymization/retention; G-DB7-49 outbox rows after TTL cleanup;
G-DB7-50 admin accounts after deletion. All three are evidence-preservation decisions from
DB4, not DB7 defects.

## 9. Platform primitives

| ID | Guard | GRD | Physical | Application guarantee | Owner | Status |
|---|---|---|---|---|---|---|
| G-DB7-52 | Idempotency claim per (namespace, scope key) | GRD-012 | **UNIQUE** arbiter | claim-or-read inside the caller's transaction; `23505` maps to a replay, not an error | `IdempotencyStore.claim` | implemented, tested; race → DB8 |
| G-DB7-53 | Idempotency fingerprint match | GRD-030 | none | same key + different fingerprint → `IDEMPOTENCY_CONFLICT` | `IdempotencyStore.claim` | implemented, tested |
| G-DB7-54 | Outbox insert is atomic with the domain write | INV-23 | none | both in one transaction; failure at any point rolls both back — proved by rollback tests at three failure points | `OutboxEventStore.append` + calling use cases | implemented, tested |
| G-DB7-55 | Outbox exclusive claim | GRD-029 | claim indexes exist | `SELECT … FOR UPDATE SKIP LOCKED` claim path implemented and single-run tested | `OutboxEventStore.claimBatch` | implemented, single-run tested; **multi-worker exclusivity → DB8 CC-25** |
| G-DB7-56 | Outbox payload immutable, dispatch columns mutable | INV-23 / CST-098 | **S24 column-scoped trigger** | only the dispatch metadata columns may be updated; a payload mutation maps to `IMMUTABLE_EVIDENCE` | `OutboxEventStore` + error mapper | implemented, tested |
| G-DB7-57 | Append-only attempt evidence is never updated in place | REQ-OUTBOX-002 | S24 trigger | the store exposes only `record`, no update path | `BackgroundJobAttemptStore` | implemented, tested |
| G-DB7-58 | Notification intent claim + attempt append | ADR-DB2-003 | claimable partial index | claim, append attempt, update operational status columns only — one transaction per attempt; **no exactly-once claim is made** | `NotificationIntentRepository.claimBatch` / `recordAttempt` | implemented, single-run tested; multi-worker → DB8 |
| G-DB7-59 | Generic immutable-record rejection mapping | GRD-024 | 30 S24 triggers | every trigger rejection maps to a client-safe error; one generic test asserts the mapping for a representative trigger from each of the 30 | error mapper | implemented, tested |

---

## 10. Closure

Counts and per-guard final status are reconciled at CP7 against
[`DB7_TEST_MATRIX.md`](./DB7_TEST_MATRIX.md); no guard in this document may end DB7 without
one of the four statuses. Guards marked `deferred to DB8` appear in
[`DB7_DB8_HANDOFF.md`](./DB7_DB8_HANDOFF.md) with their exact race scenario.

**Zero silent gaps** is the exit condition: a guard family listed in §5 of
`DB7_SCOPE_AND_COVERAGE_MATRIX.md` with no row here is a CP5 failure.
