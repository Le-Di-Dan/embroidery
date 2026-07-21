# DB9 — Performance Scope Matrix

**Compiled:** DB9-CP0. **Updated:** DB9-CP7 (final statuses).

Every canonical query/workload DB9 is accountable for. Built from
`DB5_QUERY_SHAPE_CATALOG.md` (Q-01..Q-33, QX-01..QX-11 — all 44 shapes
represented, none dropped) plus the ten category-**C** contention rows
handed over by `DB8_DB9_HANDOFF.md`.

Closure rule (§47): every row ends `PASS`, `TUNED`, `DEFERRED` with an
owner and reason, `N/A` with evidence, or `BLOCKED`. No silent open
critical query.

## Legend

- **Tier** — dataset tier the row is measured at: `S` smoke, `M`
  representative local, `L` stress local (`DB9_EXECUTION_LOG.md` CP1).
- **Conc.** — concurrency levels exercised.
- **Metric** — the success metric; DB9 states measured local evidence, never
  a production SLA.
- **Correctness** — the assertion that runs *alongside* the timing, without
  which the measurement is void (§18).
- **Status** — filled at the checkpoint that owns the row.

---

## 1. Read and query paths (CP2)

| PERF ID | DB5 shape | Repository / method | Tables & indexes | Tier | Conc. | Metric | Correctness assertion | Status |
|---|---|---|---|---|---|---|---|---|
| PERF-R01 | Q-01 public product listing | `DrizzleProductRepository` listing path | `products`, `categories` · `IDX` published-status | M, L | 1, 8 | median/p95, plan is index-driven | only `PUBLISHED` rows returned | see CP2 |
| PERF-R02 | Q-02 product detail by slug | `DrizzleProductRepository.findBySlug` / `loadStructure` | `products` + variant/side/area chain | M, L | 1, 8 | median/p95, query count per detail load | full placement chain returned, no N+1 | see CP2 |
| PERF-R03 | Q-03 variant & SKU availability | `DrizzleSkuStockRepository.availability` | `sku_stocks`, holds, reservations | M, L | 1, 8 | median/p95 | `available = on_hand − holds − reservations` | see CP2 |
| PERF-R04 | Q-04 gallery listing | `DrizzleGalleryEntryRepository` listing | `gallery_entries` | M | 1 | median/p95 | published scope honoured | see CP2 |
| PERF-R05 | Q-05 published content lookup | `DrizzleContentPageRepository.findByTypeAndSlug` | `content_pages` | M | 1 | median/p95 | published scope honoured | see CP2 |
| PERF-R06 | Q-06 sitemap / indexable set | content + product published sets | `content_pages`, `products` | M | 1 | median/p95, rows | indexable predicate applied in SQL | see CP2 |
| PERF-R07 | Q-07 redirect resolution | `DrizzleContentPageRepository.resolve` | `redirect_rules` | M, L | 1, 8 | median/p95 — highest-frequency lookup | active rule wins | see CP2 |
| PERF-R08 | Q-08 secure link lookup (**P0**) | `DrizzleSecureAccessGrantRepository.resolveActive` | `secure_access_grants` | M | 1 | median/p95 | revoked/expired never resolve | see CP2 |
| PERF-R09 | Q-09 request detail, customer view (**P0**) | `DrizzleCustomRequestRepository.findById` / `loadBreakdown` | `custom_requests` + breakdown | M | 1 | median/p95, query count | breakdown complete, scoped to owner | see CP2 |
| PERF-R10 | Q-10 design version history | `DrizzleDesignCaseRepository.listVersions` | `design_versions` | M, L | 1 | median/p95, deep page | keyset ordering stable | see CP2 |
| PERF-R11 | Q-11 current review version (**P0**) | `DrizzleDesignCaseRepository.findVersionInReview` | `design_versions` partial index | M | 1 | median/p95 | at most one in review | see CP2 |
| PERF-R12 | Q-12 quotation version history | `DrizzleQuotationRepository.listVersions` | `quotation_versions` | M | 1 | median/p95 | ordering stable | see CP2 |
| PERF-R13 | Q-13 current quotation | `DrizzleQuotationRepository.findByRequest` | `quotations` | M | 1 | median/p95 | current pointer resolved | see CP2 |
| PERF-R14 | Q-14 approval snapshot lookup (**P0**) | `DrizzleApprovalSnapshotRepository.findByDesignVersion` | `approval_snapshots` | M | 1 | median/p95 | immutable snapshot returned intact | see CP2 |
| PERF-R15 | Q-15 order lookup | `DrizzleOrderRepository.findByCode` / `loadItems` | `orders`, `order_items` | M, L | 1, 8 | median/p95, query count | items complete, no N+1 | see CP2 |
| PERF-R16 | Q-16 payment reconciliation (**P0**) | `PaymentEvidenceRepository` reconciliation read | `payment_provider_events`, reconciliations | M, L | 1 | median/p95 | matched/unmatched partition correct | see CP2 |
| PERF-R17 | Q-17 pending deposit list | `DrizzlePaymentObligationRepository.findLiveForOrder` scan | `payment_obligations` partial index | M, L | 1 | median/p95 | only live obligations | see CP2 |
| PERF-R18 | Q-18 pending final payment list | same repository, final-kind predicate | `payment_obligations` | M | 1 | median/p95 | kind predicate in SQL | see CP2 |
| PERF-R19 | Q-19 production queue | `DrizzleProductionJobRepository` active-queue read | `production_jobs` partial index | M, L | 1, 4 | median/p95 | only active states | see CP2 |
| PERF-R20 | Q-20 admin low-stock dashboard | `DrizzleSkuStockRepository` low-stock scan | `sku_stocks` | M, L | 1 | median/p95 | threshold predicate in SQL | see CP2 |
| PERF-R21 | Q-21 request listing by status | `DrizzleCustomRequestRepository` status listing | `custom_requests` | M, L | 1, 8 | median/p95, deep page | keyset, no duplicate/skip | see CP2 |
| PERF-R22 | Q-22 admin dashboard aggregate | multi-repository aggregate | orders/payments/production | M | 1 | median/p95, query count | counts match row truth | see CP2 |
| PERF-R23 | Q-23 failed / unmatched payments | `PaymentEvidenceRepository` unmatched scan | `payment_provider_events` | M | 1 | median/p95 | unmatched predicate in SQL | see CP2 |
| PERF-R24 | Q-24 expiring quotations | `DrizzleQuotationRepository` expiry scan | `quotations` | M | 1 | median/p95 | expiry window correct | see CP2 |
| PERF-R25 | Q-25 session expiration cleanup | `DrizzleDesignSessionRepository.expire` scan | `design_sessions` | M | 1 | median/p95, rows | only ACTIVE+expired | see CP2 |
| PERF-R26 | Q-26 asset processing queue | `DrizzleAssetRepository.listDerivatives` queue read | `asset_derivatives` | M | 1, 4 | median/p95 | pending predicate | see CP2 |
| PERF-R29 | Q-29 audit history lookup | `DrizzleAuditEventRepository.listByTarget` / `listByCorrelation` | `audit_events` | M, L | 1 | median/p95, deep page | target scope honoured | see CP2 |
| PERF-R30 | Q-30 signed asset access resolution (**P0**) | `DrizzleAssetRepository.findByStorageKey` + grant | `assets`, `secure_access_grants` | M | 1 | median/p95 | private originals never resolve publicly | see CP2 |
| PERF-R31 | Q-31 verification challenge lookup (**P0**) | `DrizzleVerificationChallengeRepository.resolveOpen` | `contact_verification_challenges` | M | 1 | median/p95 | only open, unexpired | see CP2 |
| PERF-R32 | Q-32 reservation-eligible check (**P0**) | `ReservationEligibilityGuard` | `payment_obligations` | M | 1, 8 | median/p95 | deposit SATISFIED read in-tx | see CP2 |
| PERF-R34 | QX-01 transition history | `listTransitions` (order, request, production) | transition tables | M, L | 1 | median/p95 | chronological, complete | see CP2 |
| PERF-R35 | QX-02 cancellation saga resume (**P0**) | `DrizzleOrderShippingRepository.openCancellationRequest` state read | cancellation tables | M | 1 | median/p95 | resumable state exact | see CP2 |
| PERF-R36 | QX-03 notification retry scan | `DrizzleNotificationIntentRepository` retry-ready scan | `notification_intents` partial index | M, L | 1, 4 | median/p95 | retry window correct | see CP2 |
| PERF-R37 | QX-06 grant revocation / expiry sweep | `DrizzleSecureAccessGrantRepository` sweep | `secure_access_grants` | M | 1 | median/p95 | only expired swept | see CP2 |
| PERF-R38 | QX-07 agreement effective version (**P0**) | `DrizzleAgreementRepository.effectiveVersions` | `agreements`, versions | M | 1 | median/p95 | effective-at semantics exact | see CP2 |
| PERF-R39 | QX-08 customer merge review | `DrizzleCustomerRepository.findByVerifiedContact` | `customers`, contact points | M | 1 | median/p95 | verified scope honoured | see CP2 |
| PERF-R40 | QX-09 shipping freeze state (**P0**) | `DrizzleOrderShippingRepository.loadShippingDetail` | `shipping_details`, snapshots | M | 1 | median/p95 | frozen flag respected | see CP2 |
| PERF-R41 | QX-10 hold / reservation expiry sweep | inventory expiry sweep | holds, reservations partial indexes | M, L | 1 | median/p95, rows | only expired swept | see CP2 |
| PERF-R42 | QX-11 challenge / attempt rate window (**P0**) | `DrizzleVerificationChallengeRepository.countAttempts` | attempts | M | 1 | median/p95 | window boundary exact | see CP2 |

**Out of scope with evidence:**

| PERF ID | Shape | Verdict |
|---|---|---|
| PERF-R33 | Q-33 analytics event readiness (**P3**) | `N/A` — `DB2_ANALYTICS_STORAGE_DECISION.md` defers analytics storage; nothing to measure. |

## 2. Queue, lock and contention paths (CP3)

| PERF ID | Source | Repository / method | Tier | Conc. | Metric | Correctness assertion | Status |
|---|---|---|---|---|---|---|---|
| PERF-Q01 | Q-27 / QX-04 outbox relay claim (**P0**) | `OutboxEventStore.claimBatch` | M, L | 1, 2, 4, 8 | claim throughput, lock wait, skipped rows | zero double-claim (CC-19 invariant) | see CP3 |
| PERF-Q02 | Q-28 / QX-05 idempotency claim (**P0**) | `IdempotencyStore.claim` | M, L | 1, 2, 4, 8 | claim latency, contention | exactly one `claimed` per key | see CP3 |
| PERF-Q03 | QX-03 notification intent claim | `DrizzleNotificationIntentRepository.claimBatch` | M, L | 1, 2, 4, 8 | claim throughput, overlap | at-least-once accepted (G-DB7-58) | see CP3 |
| PERF-Q04 | background job attempts | `BackgroundJobAttemptStore` | M | 1, 4 | append latency | attempt chain intact | see CP3 |
| PERF-C01..C10 | DB8 category-**C** rows CC-02, CC-03, CC-04, CC-05, CC-06, CC-08, CC-10, CC-11, CC-12, CC-21 | respective repositories | M | 2, 4 | lock wait, transaction duration | the row's own documented winner/loser outcome — **never PASS on throughput alone** (§32) | see CP3 |

## 3. Write, trigger and amplification paths (CP4)

| PERF ID | Workload | Repository / method | Tier | Metric | Correctness assertion | Status |
|---|---|---|---|---|---|---|
| PERF-W01 | order creation transaction | `DrizzleOrderRepository.createFromAcceptedQuotation` | M | tx latency, WAL, buffers, indexes touched | order + exactly one `order.created` outbox row | see CP4 |
| PERF-W02 | reservation + ledger append | inventory reservation path | M | tx latency, WAL | ledger sums to committed deltas | see CP4 |
| PERF-W03 | provider event append | `PaymentEvidenceRepository.recordProviderEvent` | M, L | append latency, WAL | unique arbiter honoured | see CP4 |
| PERF-W04 | notification attempt append | `recordAttempt` | M, L | append latency | attempt count exact | see CP4 |
| PERF-W05 | audit event append | `DrizzleAuditEventRepository.append` | M, L | append latency, WAL, index cost | append-only respected | see CP4 |
| PERF-W06 | outbox append + claim update | `OutboxEventStore` | M, L | append/update latency, WAL | status transition valid | see CP4 |
| PERF-W07 | version creation + current-pointer update | design / quotation / agreement | M | tx latency | pointer consistent | see CP4 |
| PERF-W08 | refund state update | `PaymentEvidenceRepository.approveRefund` / `executeRefund` | M | tx latency | S24 column scope respected | see CP4 |
| PERF-T01 | S24 trigger overhead — allowed mutable update | any S24-protected table | M | added latency vs. unprotected control | update applies | see CP4 |
| PERF-T02 | S24 — rejected immutable update | same | M | rejection latency | `23000` raised | see CP4 |
| PERF-T03 | S24 — append-only insert | append-only tables | M | insert latency | insert allowed | see CP4 |
| PERF-T04 | S24 — retention-job delete exemption | retention-exempt path | M | delete latency | exemption GUC honoured | see CP4 |
| PERF-A01 | index write amplification, high-write tables | `outbox_events`, `audit_events`, `payment_provider_events`, `notification_delivery_attempts`, `inventory_ledger_entries`, transition tables | M, L | index count, indexes touched, WAL/row | no correctness index dropped | see CP4 |

## 4. Pool, timeout and mixed workload (CP5)

| PERF ID | Workload | Metric | Correctness assertion | Status |
|---|---|---|---|---|
| PERF-P01 | pool sizing sweep (API profile) | acquire latency, query latency, throughput, waiting count | all results correct at every size | see CP5 |
| PERF-P02 | pool sizing sweep (worker profile) | as above | claims remain exclusive | see CP5 |
| PERF-P03 | acquire-timeout behaviour | timeout count, connection released | error mapped, no secret leak, no stuck tx | see CP5 |
| PERF-P04 | statement-timeout behaviour | cancellation latency | mapped error, transaction rolled back | see CP5 |
| PERF-P05 | mixed workload (reads + order/payment writes + inventory contention + workers + audit appends) | degradation vs. isolated baselines, starvation | every component's invariants hold under the mix | see CP5 |

## 5. Handoff column

Rows whose owner is not DB9 carry it explicitly:

| Row | Owner |
|---|---|
| PERF-R33 | `N/A` — analytics storage decision (DB2), no target |
| CC-13 (category B) | the feature that builds signed-link consumption — not a DB9 row |
| Operational index-build risk, autovacuum, retention cost | DB10 (`DB9_DB10_HANDOFF.md`) |
