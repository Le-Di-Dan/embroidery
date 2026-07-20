# DB7 Repository Contracts

The persistence API surface DB7 implements: what each repository owns, its command and
query methods, its transaction requirements, and the guards and errors it is responsible
for. Table ownership is in
[`DB7_SCOPE_AND_COVERAGE_MATRIX.md`](./DB7_SCOPE_AND_COVERAGE_MATRIX.md) §3; guards are in
[`DB7_TX_APP_GUARD_MATRIX.md`](./DB7_TX_APP_GUARD_MATRIX.md); test evidence is in
[`DB7_TEST_MATRIX.md`](./DB7_TEST_MATRIX.md). This document is not repeated in those.

---

## 1. Design rules

1. **Aggregate-shaped, not table-shaped.** A repository is named after its aggregate
   (`OrderRepository`), never after a table (`OrderItemsTableRepository`). Child, snapshot
   and evidence tables are written by their root's repository inside the root's
   transaction.
2. **No generic CRUD base.** There is no `BaseRepository<T>`, no `findAll/create/update/
   delete` quartet applied uniformly. Low-level mechanics that *are* shared — executor
   resolution, keyset-cursor encoding, `RETURNING` row mapping — live in narrow
   infrastructure helpers with no domain vocabulary and are never a public domain API.
3. **Command / query separation.** `XRepository` holds aggregate command persistence and
   identity loads; `XQueryRepository` holds projections, lists and dashboard reads. A list
   screen never loads a full aggregate.
4. **Typed boundaries.** Methods take and return branded domain ids, command inputs and
   application projections. A Drizzle row never crosses the infrastructure boundary
   unmapped; `pg`/Drizzle types never appear in an application or domain signature.
5. **Interfaces in the domain layer, implementations in infrastructure.**
   `modules/<m>/domain/repositories/<x>.repository.ts` declares the interface and its
   injection token; `modules/<m>/infrastructure/persistence/drizzle-<x>.repository.ts`
   implements it.
6. **Transactions are declared, not implied.** Every command method documents whether it
   *requires* an ambient transaction (`@requiresTransaction` in its doc comment and a
   runtime assertion) or may run on the pool. Multi-table commands always require one.
7. **Keyset pagination** with DB5's ordering and tie-breaker; opaque validated cursors;
   every list bounded by a clamped limit.
8. **Typed JSONB.** Each JSONB column has a named parser at the persistence boundary.
   Business code never receives `unknown`. No relational invariant is moved into JSONB.
9. **Errors are mapped, never leaked.** Every method funnels driver errors through the
   central mapper (`@embroidery/database` `mapDatabaseError`) so no SQLSTATE, constraint
   DETAIL, SQL text or row value can escape.
10. **No cross-module persistence access.** A module that needs another context's facts
    consumes a port, not the other module's repository or tables.

---

## 2. Shared persistence kernel (`@embroidery/persistence`)

| Component | Responsibility |
|---|---|
| `DatabaseModule` | Nest module providing the client, transaction manager and health service. Not global; imported explicitly by each consuming module. |
| `DATABASE` / `DatabaseClientProvider` | Owns the single `pg` Pool per application instance, created from validated configuration, closed on shutdown. |
| `TransactionManager` | `runInTransaction(work, options?)`; the only transaction entry point (DEC-DB7-006). |
| `TransactionContext` | `AsyncLocalStorage` carrying the active transaction; `current()` returns it or `undefined`. |
| `DatabaseExecutor` | Resolves `TransactionContext.current() ?? pool database` — the single accessor every repository uses. |
| `DatabaseHealthService` | Distinguishes configuration failure, connection failure, query failure and degraded pool; never emits a credential. |
| `OutboxEventStore`, `IdempotencyStore`, `BackgroundJobAttemptStore`, `PolicyConfigurationRepository` | CTX-PLT platform persistence, shared by `apps/api` and `apps/worker` (DEC-DB7-003). |

Application/domain code depends on repository interfaces, `TransactionManager` and
application error types only — never on `pg.Pool`, `pg.PoolClient`, the Drizzle database
type or raw SQLSTATE strings.

---

## 3. Repository inventory

`R` = required ambient transaction. Query methods are read-only and may run on the pool.

### `identity`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `AdminAccountRepository` | TBL-001, TBL-002 | `create` (R), `updateProfile` (R), `attachCredential` (R), `deactivate` (R) | `findById`, `findByEmail`, `exists` | G-DB7-50 (actor evidence source) | `Conflict` (email unique), `InvalidReference` |
| `AdminSessionRepository` | TBL-003 | `issue` (R), `revoke` (R), `revokeAllForAdmin` (R) | `findActiveByTokenHash` | session expiry read | `Conflict` (token hash) |

### `customer`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `CustomerRepository` | TBL-004, TBL-005, TBL-078 | `createWithVerifiedContact` (R), `addContactPoint` (R), `markContactVerified` (R), `upsertBusinessProfile` (R), `anonymize` (R) | `findById`, `findByVerifiedContact`, `listContactPoints` | verified-before-submit (GRD-001) | `Conflict` (active-verified partial unique) |
| `VerificationChallengeRepository` | TBL-006, TBL-007 | `openChallenge` (R), `recordAttempt` (R), `completeChallenge` (R), `expireChallenge` (R) | `resolveOpen`, `countRecentAttempts`, `hasRecentCompleted` | G-DB7-41, G-DB7-43, G-DB7-45 | `Conflict` (one open per contact+purpose) |
| `SecureAccessGrantRepository` | TBL-008 | `issue` (R), `revoke` (R), `recordUse` (R) | `resolveActive` (purpose/scope/customer/request checked) | G-DB7-38/39/40 | `Conflict`, `InvariantViolation` (scope mismatch) |
| `CustomerMergeRepository` | TBL-009, TBL-010 | `openCase` (R), `appendMergeEvent` (R), `closeCase` (R) | `findOpenCaseForPair`, `listEvents` | one-open-case arbiter | `Conflict` |

### `catalog`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `CategoryRepository` | TBL-011 | `create` (R), `rename` (R), `publish` (R), `archive` (R) | `findBySlug`, `listPublished` (keyset) | — | `Conflict` (slug) |
| `ProductRepository` | TBL-012..TBL-017 | `create` (R), `updateDetails` (R), `replaceStructure` (R), `attachMedia` (R), `publish` (R), `archive` (R) | `findBySlug`, `loadStructure` (single round trip per child table) | G-DB7-10/11/12 source data | `Conflict` (slug, sku code), `InvalidReference` |
| `PlacementHierarchyGuard` (port) | reads TBL-012..016 | — | `resolvePlacement(productId, variantId?, sideId?, areaId?)` | G-DB7-10..13 | `InvalidReference` |
| `CatalogQueryRepository` | reads TBL-011..017 | — | `listProducts` (keyset), `findSkuByCode`, `listVariantsForProducts` | — | — |

### `asset`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `AssetRepository` | TBL-022..TBL-024 | `register` (R), `recordInspection` (R), `registerDerivative` (R), `tombstone` (R) | `findById`, `findByStorageKey`, `listDerivatives`, `listInspections` | tombstone state respected; no binary in DB | `Conflict` (storage key, `(asset, kind)` active), `ImmutableEvidence` |
| `AssetQueryRepository` | reads TBL-022..024 | — | `listByOwnerScope` (keyset), `listPendingInspection` | — | — |

### `content` (Content / Gallery / Agreement)

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `ContentPageRepository` | TBL-066 | `create` (R), `update` (R), `publish` (R), `archive` (R) | `findByTypeAndSlug`, `listPublished` (keyset) | — | `Conflict` |
| `RedirectRuleRepository` | TBL-067 | `upsert` (R), `remove` (R) | `resolve(sourcePath)` | — | `Conflict` |
| `AgreementRepository` | TBL-068, TBL-069 | `ensureAgreement` (R), `addVersion` (R), `publishVersion` (R), `setCurrentVersion` (R) | `findByType`, `currentVersion`, `effectiveVersions(types)` | **G-DB7-01**, G-DB7-16 | `Conflict`, `InvariantViolation` (wrong root), `ImmutableEvidence` |
| `GalleryEntryRepository` | TBL-064, TBL-065 | `create` (R), `update` (R), `attachAssets` (R), `publish` (R), `archive` (R) | `findBySlug`, `listPublished` (keyset) | public-derivative-only rule | `Conflict` |

### `design`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `DesignSessionRepository` | TBL-025, TBL-026 | `open` (R), `saveDocument` (R), `attachAsset` (R), `expire` (R) | `findActiveBySecretHash` | G-DB7-19, G-DB7-13 | `Conflict`, `ConcurrentModification` (stale revision) |
| `DesignCaseRepository` | TBL-027..TBL-030 | `createForRequest` (R), `createVersion` (R), `sendForReview` (R), `setCurrentVersion` (R), `recordReview` (R), `supersede` (R) | `findByRequest`, `loadVersion`, `listVersions` | **G-DB7-02**, G-DB7-09, G-DB7-15, G-DB7-17 | `Conflict`, `InvariantViolation`, `ImmutableEvidence` |
| `ApprovalSnapshotRepository` | TBL-031..TBL-033 | `createFromVersion` (R) | `findByDesignVersion`, `loadWithChildren` | **G-DB7-14**, G-DB7-16, G-DB7-13 | `Conflict`, `InvariantViolation`, `ImmutableEvidence` |
| `DesignTemplateRepository` | TBL-034..TBL-036 | `create` (R), `addVersion` (R), `publishVersion` (R), `attachAsset` (R), `archive` (R) | `findBySlug`, `loadPublished`, `listPublished` (keyset) | G-DB7-18 | `Conflict`, `ImmutableEvidence` |
| `DesignQueryRepository` | reads TBL-027..033 | — | `listCasesForAdmin` (keyset), `listVersionsForCase` | — | — |

### `order` (CTX-ORD: Custom Request + Order)

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `CustomRequestRepository` | TBL-037..TBL-042 | `submit` (R), `updateBreakdown` (R), `attachAsset` (R), `appendModerationNote` (R), `transition` (R), `setDesignCase` (R), `setCurrentQuotation` (R) | `findById`, `findByCode`, `loadWithChildren`, `listTransitions` | G-DB7-04, G-DB7-09, G-DB7-22, G-DB7-25 | `Conflict` (code), `InvariantViolation` (illegal transition) |
| `OrderRepository` | TBL-043..TBL-049 | `createFromAcceptedQuotation` (R), `transition` (R), `saveShippingDetails` (R), `dispatch` (R), `acknowledgeShippingFee` (R), `openCancellationRequest` (R), `resolveCancellationRequest` (R) | `findById`, `findByCode`, `findByRequest`, `loadItems`, `listTransitions` | **G-DB7-05**, G-DB7-21, G-DB7-23, G-DB7-24, G-DB7-25, G-DB7-37 | `Conflict`, `InvariantViolation`, `ImmutableEvidence` |
| `OrderChainGuard` | reads TBL-037/043/031/028/027/050/051 | — | `assertOrderChain(requestId, approvalSnapshotId, quotationVersionId)` | G-DB7-05 | `InvariantViolation` |
| `OrderQueryRepository` | reads TBL-043..049 | — | `listOrdersForAdmin` (keyset), `listOrdersForCustomer` (keyset), `dashboardCounters` | — | — |
| `RequestQueryRepository` | reads TBL-037..042 | — | `listRequestsForAdmin` (keyset), `listForCustomer` (keyset) | — | — |

### `quotation`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `QuotationRepository` | TBL-050..TBL-053 | `createForRequest` (R), `addVersion` (R), `send` (R), `setCurrentVersion` (R), `accept` (R), `expire` (R) | `findByRequest`, `loadCurrentVersion`, `loadVersionWithLines`, `listVersions` | **G-DB7-03**, G-DB7-04, G-DB7-20 | `Conflict`, `InvariantViolation`, `ImmutableEvidence` |
| `QuotationQueryRepository` | reads TBL-050..053 | — | `listForAdmin` (keyset), `acceptedVersionForRequest` | — | — |

### `inventory`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `SkuStockRepository` | TBL-018..TBL-021 | `ensureStockRow` (R), `adjust` (R), `createSoftHold` (R), `releaseSoftHold` (R), `convertHold` (R), `createReservation` (R), `releaseReservation` (R), `consumeReservation` (R) | `loadForUpdate` (R, `FOR UPDATE`), `availability(skuId)`, `listLedger` (keyset) | **G-DB7-26**, G-DB7-28, G-DB7-29, G-DB7-30 | `Conflict` (active hold/reservation), `InvariantViolation` (insufficient stock) |
| `ReservationEligibilityGuard` | reads TBL-043/054/031 via ports | — | `assertReservationEligible(orderId)` | G-DB7-27 | `InvariantViolation` |
| `InventoryQueryRepository` | reads TBL-018..021 | — | `listLowStock` (keyset), `listActiveHolds`, `listActiveReservations` | — | — |

### `payment`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `PaymentObligationRepository` | TBL-054, TBL-055 | `createForOrder` (R), `openAttempt` (R), `settleAttempt` (R), `satisfy` (R), `cancel` (R) | `findById`, `findActiveForOrder`, `loadAttempt`, `listAttempts`, `loadForUpdate` (R) | **G-DB7-06**, G-DB7-31, G-DB7-33 | `Conflict` (active per (order, kind)), `InvariantViolation` |
| `PaymentEventRepository` | TBL-056, TBL-057 | `record` (R, idempotent on `(provider, ref)`), `appendReconciliation` (R) | `findByProviderRef`, `listForObligation` | G-DB7-32, G-DB7-34 | `Conflict` → replay, `ImmutableEvidence` |
| `RefundRepository` | TBL-058 | `open` (R), `approve` (R), `execute` (R), `reject` (R) | `findById`, `listForOrder`, `refundableAmount` | G-DB7-35, G-DB7-36 | `InvariantViolation`, `ImmutableEvidence` |
| `PaymentQueryRepository` | reads TBL-054..058 | — | `listForAdmin` (keyset), `reconciliationTimeline` | — | — |

### `production`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `ProductionJobRepository` | TBL-059..TBL-063 | `createJob` (R, freezes the specification), `transition` (R), `attachArtifact` (R), `appendNote` (R) | `findById`, `findByOrderAndApproval`, `loadSpecification`, `listTransitions` | **G-DB7-07**, G-DB7-13, G-DB7-25 | `Conflict` (one job per (order, approval)), `InvariantViolation`, `ImmutableEvidence` |
| `ProductionQueryRepository` | reads TBL-059..063 | — | `listJobsForAdmin` (keyset), `listArtifacts` | — | — |

### `notification`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `NotificationIntentRepository` | TBL-070, TBL-071 | `createIdempotent` (R, keyed by `intent_key`), `claimBatch` (R, `FOR UPDATE SKIP LOCKED`), `recordAttempt` (R), `markDelivered` (R), `markFailed` (R) | `findByIntentKey`, `listClaimable` | G-DB7-48, G-DB7-49, G-DB7-58 | `Conflict` → replay, `InvalidReference` |
| `NotificationQueryRepository` | reads TBL-070, TBL-071 | — | `listForAdmin` (keyset), `listAttempts` | — | — |

### `audit`

| Repository | Owned tables | Command methods | Query methods | Guards | Errors |
|---|---|---|---|---|---|
| `AuditEventRepository` | TBL-072 | `append` (joins the emitting use case's transaction) | — | G-DB7-46, G-DB7-50 | `InvalidReference` (unknown target kind), `ImmutableEvidence` |
| `AuditQueryRepository` | reads TBL-072 | — | `listByTarget` (keyset), `listByActor` (keyset), `listByCorrelation` | — | — |

### `@embroidery/persistence` — CTX-PLT

| Store | Owned tables | Methods | Guards | Errors |
|---|---|---|---|---|
| `IdempotencyStore` | TBL-074 | `claim(namespace, scopeKey, fingerprint)` (R) → `claimed \| replay \| conflict`, `complete` (R), `fail` (R) | G-DB7-52, G-DB7-53 | `Conflict` → replay, `IdempotencyConflict` |
| `OutboxEventStore` | TBL-073 | `append` (R, joins the domain transaction), `claimBatch` (R), `markDispatched` (R), `scheduleRetry` (R), `markFailed` (R) | G-DB7-47, G-DB7-54, G-DB7-55, G-DB7-56 | `ImmutableEvidence`, `InvalidReference` |
| `BackgroundJobAttemptStore` | TBL-075 | `record` (R) — append only, no update path | G-DB7-51, G-DB7-57 | `InvalidReference` |
| `PolicyConfigurationRepository` | TBL-076, TBL-077 | `ensureKey` (R), `publishVersion` (R), `setCurrentVersion` (R); `currentValue(key)` | G-DB7-08 | `Conflict`, `InvariantViolation` |

---

## 4. Query-shape binding

Each canonical DB5 access path is bound to exactly one method above. The binding table
— query shape ID, repository method, pagination model, supporting index ID, projection
type and test ID — is generated into [`DB7_TEST_MATRIX.md`](./DB7_TEST_MATRIX.md) at CP7 so
the shape, the method and its proof stay in one place rather than drifting across three
documents. Access paths with no DB7 caller are classified in
[`DB7_DB8_HANDOFF.md`](./DB7_DB8_HANDOFF.md) with a reason; none is left unclassified.

---

## 5. Completion rule

A repository is complete only with: interface, implementation, owned-table list, command
and query methods, declared transaction requirements, guard bindings, error mappings, and
**real PostgreSQL integration-test evidence**. No repository is marked complete on unit
tests with mocks.
