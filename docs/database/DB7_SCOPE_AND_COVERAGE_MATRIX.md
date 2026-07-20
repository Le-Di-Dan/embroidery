# DB7 Scope and Coverage Matrix

Locks what DB7 owns: which persistence component owns each of the 78 physical tables,
which repositories exist, which canonical query shapes have an application owner, and the
transaction-context architecture.

Companion documents: [`DB7_REPOSITORY_CONTRACTS.md`](./DB7_REPOSITORY_CONTRACTS.md) (method
signatures), [`DB7_TX_APP_GUARD_MATRIX.md`](./DB7_TX_APP_GUARD_MATRIX.md) (guards),
[`DB7_EXECUTION_LOG.md`](./DB7_EXECUTION_LOG.md) (checkpoint history and decisions).

---

## 1. Scope boundary

### In scope (DB7)

NestJS database runtime; connection lifecycle and health; transaction abstraction;
repository contracts and Drizzle implementations; aggregate/table ownership for all 78
tables; TX/App guards classified as application-owned; safe database-error mapping; a real
PostgreSQL integration-test harness; idempotency persistence flow; Outbox atomicity;
rollback evidence; S24 trigger error handling; intentional no-FK validation.

### Explicitly out of scope

| Excluded | Owner |
|---|---|
| Concurrency/race correctness, multi-worker claim proofs, deadlock matrix, retry storms | DB8 |
| Measured performance, `EXPLAIN (ANALYZE)` at volume, pool sizing, index retirement | DB9 |
| Backup, restore, PITR, retention/anonymization jobs | DB10 |
| HTTP controllers, DTO validation, authn/authz guards, provider adapters, UI | outside the DB phases |
| Any schema change, new migration, or edit to `0000`–`0031` | frozen at DB6 (`d18589a`) |

DB7 makes **no** production-performance claim, **no** concurrency-correctness claim, and
**no** exactly-once-delivery claim.

---

## 2. Ownership classifications

Each table receives exactly one classification:

| Class | Meaning | Public repository API? |
|---|---|---|
| `aggregate root repository` | The aggregate's identity/lifecycle row; owns the repository. | yes |
| `aggregate child` | Row that has no life outside its root; written only through the root's repository in the root's transaction. | no (via root) |
| `immutable snapshot/version` | Frozen evidence row; insert-only through the root; never updated (S24 trigger enforced). | insert via root |
| `append-only evidence` | Transition/attempt/note/ledger rows; append through the root or the evidence port. | append via root |
| `platform primitive` | Cross-cutting infrastructure record (CTX-PLT); narrow infrastructure port, never a business CRUD API. | yes (narrow port) |
| `query-only projection source` | Read in query repositories/joins; no write path in DB7. | read only |
| `no direct repository API` | Written only as part of another aggregate's transaction; no method names it. | no |

---

## 3. Table-to-owner coverage (78 / 78)

Module paths are under `apps/api/src/modules/` unless the owner is `@embroidery/persistence`
(package `packages/persistence`). "Tx boundary" names the use-case transaction the write
participates in.

### CTX-IDN — Identity (module `identity`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-001 | `admin_accounts` | AGG-01 | aggregate root repository | `AdminAccountRepository` | identity | `AdminQueryRepository` | admin lifecycle | yes | single admin operator identity (REQ-IDN-001) |
| TBL-002 | `admin_credentials` | AGG-01 | aggregate child | `AdminAccountRepository` | identity | — | admin lifecycle | no | credential reference has no life outside the account |
| TBL-003 | `admin_sessions` | AGG-01 | aggregate root repository | `AdminSessionRepository` | identity | `AdminSessionRepository` | session issue/revoke | yes | own lifecycle LC-01 session, own TTL/lookup-by-token-hash path |

### CTX-CUS — Customer (module `customer`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-004 | `customers` | AGG-02 | aggregate root repository | `CustomerRepository` | customer | `CustomerQueryRepository` | verified-submission tx | yes | customer identity root |
| TBL-078 | `business_profiles` | AGG-02 | aggregate child | `CustomerRepository` | customer | — | customer update tx | no | dormant B2B profile of one customer |
| TBL-005 | `customer_contact_points` | AGG-02 | aggregate child | `CustomerRepository` | customer | `CustomerQueryRepository` | verified-submission tx | no (child accessors) | the verified *link* is the unique thing; written with the customer |
| TBL-006 | `contact_verification_challenges` | AGG-03 | aggregate root repository | `VerificationChallengeRepository` | customer | `VerificationChallengeRepository` | challenge issue/verify tx | yes | own lifecycle LC-02, own partial-unique arbiter |
| TBL-007 | `contact_verification_attempts` | AGG-03 | append-only evidence | `VerificationChallengeRepository` | customer | — | challenge verify tx | append via root | code-entry attempt evidence |
| TBL-008 | `secure_access_grants` | AGG-04 | aggregate root repository | `SecureAccessGrantRepository` | customer | `SecureAccessGrantRepository` | grant issue/consume/revoke tx | yes | own lifecycle LC-03, hashed-token lookup |
| TBL-009 | `customer_merge_cases` | AGG-02 (workflow) | aggregate root repository | `CustomerMergeRepository` | customer | `CustomerMergeRepository` | merge decision tx | yes | admin merge process with its own open-case arbiter |
| TBL-010 | `customer_merge_events` | AGG-02 (workflow) | append-only evidence | `CustomerMergeRepository` | customer | — | merge execution tx | append via root | executed merge-step evidence |

### CTX-CAT — Catalog (module `catalog`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-011 | `categories` | AGG-05 | aggregate root repository | `CategoryRepository` | catalog | `CatalogQueryRepository` | category publish tx | yes | own slug/publication lifecycle |
| TBL-012 | `products` | AGG-06 | aggregate root repository | `ProductRepository` | catalog | `CatalogQueryRepository` | product publish tx | yes | product root (LC-04) |
| TBL-013 | `product_variants` | AGG-06 | aggregate child | `ProductRepository` | catalog | `CatalogQueryRepository` | product structure tx | no | variant has no life outside the product |
| TBL-014 | `skus` | AGG-06 | aggregate child | `ProductRepository` | catalog | `CatalogQueryRepository` | product structure tx | no (resolver by code) | SKU *definition*; stock lives in CTX-INV |
| TBL-015 | `product_sides` | AGG-06 | aggregate child | `ProductRepository` | catalog | `PlacementQueryRepository` | product structure tx | no | printable side of a product |
| TBL-016 | `embroidery_areas` | AGG-06 | aggregate child | `ProductRepository` | catalog | `PlacementQueryRepository` | product structure tx | no | allowed region on a side |
| TBL-017 | `product_media` | AGG-06 | aggregate child (assoc) | `ProductRepository` | catalog | `CatalogQueryRepository` | product media tx | no | product↔asset association |

### CTX-INV — Inventory (module `inventory`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-018 | `sku_stocks` | AGG-07 | aggregate root repository | `SkuStockRepository` | inventory | `InventoryQueryRepository` | stock/hold/reservation tx (lock anchor) | yes | authoritative counter and `FOR UPDATE` lock anchor (GRD-014) |
| TBL-019 | `inventory_ledger_entries` | AGG-07 | append-only evidence | `SkuStockRepository` | inventory | `InventoryQueryRepository` | every stock-changing tx | append via root | rebuild source of truth (INV-14) |
| TBL-020 | `inventory_soft_holds` | AGG-07 | aggregate child | `SkuStockRepository` | inventory | `InventoryQueryRepository` | hold create/release/convert tx | no (root methods) | hold only exists against a stock row |
| TBL-021 | `inventory_reservations` | AGG-07 | aggregate child | `SkuStockRepository` | inventory | `InventoryQueryRepository` | reservation tx | no (root methods) | reservation only exists against a stock row |

### CTX-AST — Asset (module `asset`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-022 | `assets` | AGG-08 | aggregate root repository | `AssetRepository` | asset | `AssetQueryRepository` | upload-register / tombstone tx | yes | metadata + storage reference root (LC-06) |
| TBL-023 | `asset_inspections` | AGG-08 | append-only evidence | `AssetRepository` | asset | `AssetQueryRepository` | inspection-record tx | append via root | validation-pipeline outcome |
| TBL-024 | `asset_derivatives` | AGG-08 | aggregate child | `AssetRepository` | asset | `AssetQueryRepository` | derivative-register tx | no (root methods) | derivative belongs to its parent asset (INV-22) |

### CTX-DSN — Design (module `design`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-025 | `design_sessions` | AGG-09 | aggregate root repository | `DesignSessionRepository` | design | `DesignSessionRepository` | session autosave tx | yes | temporary editor session with its own TTL lifecycle (LC-07) |
| TBL-026 | `design_session_assets` | AGG-09 | aggregate child (assoc) | `DesignSessionRepository` | design | — | session asset attach tx | no | session↔asset association |
| TBL-027 | `design_cases` | AGG-10 | aggregate root repository | `DesignCaseRepository` | design | `DesignQueryRepository` | version create / set-current tx | yes | design thread header (1–1 with request) |
| TBL-028 | `design_versions` | AGG-10 | immutable snapshot/version | `DesignCaseRepository` | design | `DesignQueryRepository` | version create / send tx | insert via root | immutable once sent (INV-01/16/17/32) |
| TBL-029 | `design_version_assets` | AGG-10 | immutable snapshot/version (assoc) | `DesignCaseRepository` | design | — | version create tx | no | uploads frozen into the version |
| TBL-030 | `design_reviews` | AGG-10 | append-only evidence | `DesignCaseRepository` | design | `DesignQueryRepository` | review-decision tx | append via root | first-decision-wins review evidence (LC-09) |
| TBL-031 | `approval_snapshots` | AGG-11 | immutable snapshot/version | `ApprovalSnapshotRepository` | design | `ApprovalQueryRepository` | approval tx | yes (create/read only) | immutable approval evidence (INV-01/03) |
| TBL-032 | `approval_snapshot_thread_colors` | AGG-11 | immutable snapshot/version (child) | `ApprovalSnapshotRepository` | design | — | approval tx | no | thread colour captured inside the snapshot |
| TBL-033 | `approval_snapshot_agreement_acceptances` | AGG-11 | immutable snapshot/version (child) | `ApprovalSnapshotRepository` | design | — | approval tx | no | agreement acceptance evidence inside the snapshot (GRD-008) |
| TBL-034 | `design_templates` | AGG-12 | aggregate root repository | `DesignTemplateRepository` | design | `DesignTemplateRepository` | template publish tx | yes | store-authored template header |
| TBL-035 | `design_template_versions` | AGG-12 | immutable snapshot/version | `DesignTemplateRepository` | design | `DesignTemplateRepository` | template version publish tx | insert via root | immutable once published |
| TBL-036 | `design_template_assets` | AGG-12 | aggregate child (assoc) | `DesignTemplateRepository` | design | — | template asset attach tx | no | template↔private-artwork association |

### CTX-ORD — Ordering (module `order`; hosts AGG-13 and AGG-15, DEC-DB7-008)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-037 | `custom_requests` | AGG-13 | aggregate root repository | `CustomRequestRepository` | order | `RequestQueryRepository` | request submit/transition tx | yes | customer case root (LC-11) |
| TBL-038 | `customer_owned_products` | AGG-13 | aggregate child | `CustomRequestRepository` | order | `RequestQueryRepository` | request submit tx | no | the request's COP subject (INV-13) |
| TBL-039 | `custom_request_quantity_breakdowns` | AGG-13 | aggregate child | `CustomRequestRepository` | order | `RequestQueryRepository` | request submit/edit tx | no | storage child of the request (CON-074; CON-075 stays rejected) |
| TBL-040 | `custom_request_assets` | AGG-13 | aggregate child (assoc) | `CustomRequestRepository` | order | — | request asset attach tx | no | request↔asset association |
| TBL-041 | `request_moderation_notes` | AGG-13 | append-only evidence | `CustomRequestRepository` | order | `RequestQueryRepository` | moderation tx | append via root | moderation action note |
| TBL-042 | `custom_request_transitions` | AGG-13 | append-only evidence | `CustomRequestRepository` | order | `RequestQueryRepository` | every request transition tx | append via root | LC-11 history (ADR-DB4-002 Tier A) |
| TBL-043 | `orders` | AGG-15 | aggregate root repository | `OrderRepository` | order | `OrderQueryRepository` | order creation/transition tx | yes | confirmed-order root (LC-14) |
| TBL-044 | `order_items` | AGG-15 | immutable snapshot/version | `OrderRepository` | order | `OrderQueryRepository` | order creation tx | insert via root | frozen commercial line (INV-12) |
| TBL-045 | `order_transitions` | AGG-15 | append-only evidence | `OrderRepository` | order | `OrderQueryRepository` | every order transition tx | append via root | LC-14/19/21 history (CON-081) |
| TBL-046 | `order_cancellation_requests` | AGG-15 (workflow) | aggregate child | `OrderRepository` | order | `OrderQueryRepository` | cancellation-review tx | no (root methods) | manual-review process attached to one order |
| TBL-047 | `shipping_details` | AGG-15 | aggregate child | `OrderRepository` | order | `OrderQueryRepository` | shipping edit / freeze tx | no (root methods) | admin-editable preparation record of one order (LC-19) |
| TBL-048 | `shipping_snapshots` | AGG-15 | immutable snapshot/version | `OrderRepository` | order | `OrderQueryRepository` | dispatch tx | insert via root | dispatch-time freeze (GRD-017) |
| TBL-049 | `shipping_fee_acknowledgements` | AGG-15 | append-only evidence | `OrderRepository` | order | `OrderQueryRepository` | fee-acknowledgement tx | append via root | customer acknowledgement evidence |

### CTX-QUO — Quotation (module `quotation`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-050 | `quotations` | AGG-14 | aggregate root repository | `QuotationRepository` | quotation | `QuotationQueryRepository` | version create / send / accept tx | yes | quotation header + current-version pointer (LC-12) |
| TBL-051 | `quotation_versions` | AGG-14 | immutable snapshot/version | `QuotationRepository` | quotation | `QuotationQueryRepository` | version create / send tx | insert via root | immutable once sent (INV-02/12) |
| TBL-052 | `quotation_line_items` | AGG-14 | immutable snapshot/version (child) | `QuotationRepository` | quotation | `QuotationQueryRepository` | version create tx | no | frozen pricing line inside a version |
| TBL-053 | `quotation_acceptances` | AGG-14 | append-only evidence | `QuotationRepository` | quotation | `QuotationQueryRepository` | acceptance tx | append via root | secure-flow acceptance evidence (GRD-006) |

### CTX-PAY — Payment (module `payment`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-054 | `payment_obligations` | AGG-16 | aggregate root repository | `PaymentObligationRepository` | payment | `PaymentQueryRepository` | obligation create / satisfy tx | yes | independent obligation root (LC-15, INV-04) |
| TBL-055 | `payment_attempts` | AGG-16 | aggregate child | `PaymentObligationRepository` | payment | `PaymentQueryRepository` | attempt create / settle tx | no (root methods) | attempt only exists against an obligation (LC-16) |
| TBL-056 | `payment_provider_events` | PAY (record) | append-only evidence | `PaymentEventRepository` | payment | `PaymentQueryRepository` | callback-ingest tx | yes (append/read only) | verified provider callback evidence with its own dedup arbiter (INV-07) |
| TBL-057 | `payment_reconciliations` | PAY (record) | append-only evidence | `PaymentEventRepository` | payment | `PaymentQueryRepository` | reconciliation tx | append via record repo | manual reconciliation action record |
| TBL-058 | `refunds` | PAY (record) | aggregate root repository | `RefundRepository` | payment | `PaymentQueryRepository` | refund review / execute tx | yes | own lifecycle LC-20; amounts immutable, state mutable |

### CTX-PRD — Production (module `production`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-059 | `production_jobs` | AGG-17 | aggregate root repository | `ProductionJobRepository` | production | `ProductionQueryRepository` | job creation / transition tx | yes | job root against exactly one approval snapshot (INV-03/06) |
| TBL-060 | `production_specifications` | AGG-17 | immutable snapshot/version | `ProductionJobRepository` | production | `ProductionQueryRepository` | job creation tx | insert via root | specification frozen at job creation (INV-03) |
| TBL-061 | `production_artifacts` | AGG-17 | aggregate child (assoc) | `ProductionJobRepository` | production | `ProductionQueryRepository` | artifact attach tx | no | job↔asset association (INV-21/22) |
| TBL-062 | `production_notes` | AGG-17 | append-only evidence | `ProductionJobRepository` | production | `ProductionQueryRepository` | note-append tx | append via root | production note |
| TBL-063 | `production_job_transitions` | AGG-17 | append-only evidence | `ProductionJobRepository` | production | `ProductionQueryRepository` | every job transition tx | append via root | LC-18 history |

### CTX-GAL — Gallery (module `gallery`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-064 | `gallery_entries` | AGG-18 | aggregate root repository | `GalleryEntryRepository` | gallery | `GalleryQueryRepository` | entry publish tx | yes | published showcase entry root |
| TBL-065 | `gallery_entry_assets` | AGG-18 | aggregate child (assoc) | `GalleryEntryRepository` | gallery | `GalleryQueryRepository` | entry asset attach tx | no | gallery↔public-derivative association |

### CTX-CNT — Content (module `content`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-066 | `content_pages` | AGG-19 | aggregate root repository | `ContentPageRepository` | content | `ContentQueryRepository` | page publish tx | yes | SEO/content page root |
| TBL-067 | `redirect_rules` | AGG-20 | aggregate root repository | `RedirectRuleRepository` | content | `ContentQueryRepository` | redirect upsert tx | yes | own aggregate, source-path unique |
| TBL-068 | `agreements` | AGG-21 | aggregate root repository | `AgreementRepository` | content | `AgreementQueryRepository` | version publish / set-current tx | yes | agreement container per policy type |
| TBL-069 | `agreement_versions` | AGG-21 | immutable snapshot/version | `AgreementRepository` | content | `AgreementQueryRepository` | version publish tx | insert via root | immutable once published (GAP-09, GRD-008) |

### CTX-NTF — Notification (module `notification`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-070 | `notification_intents` | AGG-22 | aggregate root repository | `NotificationIntentRepository` | notification | `NotificationQueryRepository` | intent create / claim / settle tx | yes | logical message decision keyed by `intent_key` |
| TBL-071 | `notification_delivery_attempts` | AGG-22 | append-only evidence | `NotificationIntentRepository` | notification | `NotificationQueryRepository` | delivery-attempt tx | append via root | channel delivery try result |

### CTX-AUD — Audit (module `audit`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-072 | `audit_events` | AUD (record) | append-only evidence | `AuditEventRepository` | audit | `AuditQueryRepository` | joins the emitting use case's tx | yes (append/read only) | append-only business-action evidence; polymorphic target, no FK (REL-103) |

### CTX-PLT — Platform (package `@embroidery/persistence`)

| TBL | Table | Aggregate | Classification | Repository owner | Write owner | Query owner | Tx boundary | Direct API | Reason |
|---|---|---|---|---|---|---|---|---|---|
| TBL-073 | `outbox_events` | PLT (record) | platform primitive | `OutboxEventStore` | platform | `OutboxEventStore` | joins the emitting domain tx; claim/dispatch tx in worker | yes (narrow port) | transactional outbox; immutable payload + column-scoped dispatch metadata (INV-23) |
| TBL-074 | `idempotency_records` | PLT (record) | platform primitive | `IdempotencyStore` | platform | `IdempotencyStore` | claim tx wraps the domain tx | yes (narrow port) | one claim/result per (namespace, scope key) (INV-24, LC-23) |
| TBL-075 | `background_job_attempts` | PLT (record) | platform primitive (append-only) | `BackgroundJobAttemptStore` | platform | `BackgroundJobAttemptStore` | worker attempt tx | yes (narrow port) | worker attempt outcome / dead-letter row |
| TBL-076 | `policy_configurations` | AGG-23 | aggregate root repository | `PolicyConfigurationRepository` | platform | `PolicyConfigurationRepository` | configuration publish tx | yes | named business policy configuration key (CON-144) |
| TBL-077 | `policy_configuration_versions` | AGG-23 | immutable snapshot/version | `PolicyConfigurationRepository` | platform | `PolicyConfigurationRepository` | configuration publish tx | insert via root | immutable versioned value |

### Coverage totals

| Metric | Value |
|---|---|
| Tables classified | **78 / 78** |
| Unowned tables | **0** |
| Tables with more than one write owner | **0** |
| Distinct write owners (bounded contexts) | 15 |
| Aggregate root repositories | 30 |
| Query repositories | 17 |
| Platform primitive stores | 3 |
| Tables with a direct public repository API | 33 |
| Tables written only through their root | 45 |
| Repository classes required | **50**, not 78 |

Every table has exactly one write owner. Cross-context reads go through the owning
context's query repository or application service — never through another module's
persistence internals (`BACKEND_CONVENTIONS.md` §10).

---

## 4. Canonical query coverage

Source: `DB5_QUERY_SHAPE_CATALOG.md`, `DB5_ACCESS_PATH_MATRIX.md`,
`DB5_PAGINATION_ORDERING_MATRIX.md`, `DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md`,
`DB5_LOCKING_ACCESS_PATHS.md`. Each launch-critical shape is bound to a repository method,
a pagination model, the supporting index, and a test owner. The per-method binding table
lives in [`DB7_REPOSITORY_CONTRACTS.md`](./DB7_REPOSITORY_CONTRACTS.md) §4 so the query
shape and its signature stay in one place; this section states the rules and the residue.

Rules applied:

1. **Keyset pagination** wherever DB5 selected it (ADR-DB5-001), using DB5's exact ordering
   and tie-breaker. Cursors are opaque, deterministically encoded, and validated on decode;
   a malformed cursor is a validation error, never a silent full scan.
2. **Bounded results**: every list method takes a limit clamped to a named maximum.
3. **No N+1 by construction**: aggregate loads fetch children in one round trip per child
   table (`inArray` over the root ids), never per-row.
4. **Locking shapes** from `DB5_LOCKING_ACCESS_PATHS.md` are expressed as explicit
   repository methods (`…ForUpdate`, `claim…`) so a lock is never taken implicitly.

Residue (explicitly classified, nothing silently omitted):

| Class | Handling |
|---|---|
| Launch-critical read shapes | bound to a query-repository method + integration test |
| Locking shapes | bound to a `…ForUpdate` / claim method + integration test |
| Admin dashboard aggregate counters | bound to query-repository methods; **no** measured-latency claim (DB9) |
| Retention/cleanup access paths | indexes exist; the executing jobs are DB10 — recorded in `DB7_DB8_HANDOFF.md`, not implemented |
| Index-only paths with no DB7 caller | listed in `DB7_DB8_HANDOFF.md` with the reason (retention job, DB9 measurement, or admin feature outside DB7) — never left unclassified |

---

## 5. TX/App guard inventory

Full inventory in [`DB7_TX_APP_GUARD_MATRIX.md`](./DB7_TX_APP_GUARD_MATRIX.md). Summary of
the families DB7 must own because the physical schema cannot enforce them:

| Family | Guards | Why the DB cannot enforce it |
|---|---|---|
| Same-root current-version pointers | CON-058..060, GRD-006 | the FK proves the version *exists*, not that it belongs to the same root |
| Product/Variant/Side/Area placement hierarchy | CON-058..060 | no cross-table hierarchy CHECK exists |
| Design Case → Version → Approval Snapshot chain | GRD-007, INV-01/03 | multi-table chain, not expressible as a row CHECK |
| Agreement current-version ownership | GRD-008 | same-root pointer problem |
| Quotation current-version / request ownership | GRD-006, INV-02 | same-root pointer problem |
| Order current-approval / current-quotation chain | GRD-009, INV-19 | multi-table chain |
| Secure Grant purpose/scope/customer/request | GRD-002/003, DEV-DB6-015/016 | purpose/scope are values, not references |
| Verification challenge ownership | GRD-026, INV-19 | challenge↔contact↔flow relationship |
| Official Reservation eligibility | GRD-013 | depends on payment + approval facts in other tables |
| Payment satisfaction evidence | GRD-011, INV-07/15 | satisfying attempt must belong to the obligation |
| Refund approval / execution evidence | GRD-021 | policy-config-derived amount ceiling |
| Production eligibility / specification chain | GRD-015, INV-03/06 | multi-table chain |
| Notification recipient / outbox no-FK references | DEV-DB6-016 | intentional no-FK, polymorphic/optional |
| Audit polymorphic target | REL-103 | intentional no-FK, polymorphic |
| Outbox aggregate no-FK reference | REL-104 | intentional no-FK, polymorphic |
| Actor evidence (bare admin id, no FK) | DB4 actor model | intentional no-FK |

---

## 6. Transaction-context architecture (DEC-DB7-006)

### Options evaluated

| Criterion | A. Explicit client propagation | B. Pure `AsyncLocalStorage` | C. **Hybrid (chosen)** |
|---|---|---|---|
| NestJS DI compatibility | good — repositories stay stateless | good | good; the manager is a normal singleton provider |
| Leaks driver types into application signatures | **yes** — every method needs a `tx: Transaction` parameter, violating rule §5.14 | no | no |
| Transaction boundary visible in the code | yes | **no** — the biggest objection to B | **yes** — `runInTransaction` is the only way to open one |
| Nested transaction semantics | caller passes the same handle | ambiguous | join by default; explicit `savepoint: true` opt-in |
| Repository reuse across tx / non-tx callers | needs two call styles | uniform | uniform — repository resolves its executor from the context, falling back to the pool |
| Testability | easy | easy | easy; the harness runs each test inside a rolled-back transaction |
| Connection release | manual discipline per call site | manager-owned | manager-owned; `finally` releases in every path |
| Async boundary safety | trivially safe | risk of leakage across concurrent tasks | store is entered per `runInTransaction` call, so concurrent tasks each get their own store — **proved by an explicit concurrency test** |
| Worker compatibility | yes | yes | yes — same package, same manager |
| Failure behavior | rollback per call site | rollback in manager | rollback in manager; the error is mapped before it escapes |

### Chosen semantics

- `TransactionManager.runInTransaction(work, options?)` is the **only** place a transaction
  opens. Options: `isolationLevel`, `readOnly`, `savepoint`.
- Repositories obtain their executor from `TransactionContext.current() ?? pool database`.
  They never accept a transaction parameter and never start a transaction.
- A nested `runInTransaction` **joins** the active transaction (no second independent
  transaction can be opened by accident). Passing `savepoint: true` opens a savepoint so an
  inner failure can be caught without discarding the outer transaction.
- `readOnly: true` maps to `SET TRANSACTION READ ONLY`; a write inside it fails with
  SQLSTATE `25006`, mapped to an invariant-violation application error.
- The raw Drizzle/`pg` handle never crosses the infrastructure boundary: only repository
  interfaces, the transaction abstraction, and application error types are visible to
  application/domain code.
