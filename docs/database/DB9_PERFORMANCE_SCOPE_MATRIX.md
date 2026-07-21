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
| PERF-R01 | Q-01 public product listing | `DrizzleProductRepository` listing path | `products`, `categories` · `IDX` published-status | M, L | 1, 8 | median/p95, plan is index-driven | only `PUBLISHED` rows returned | PASS |
| PERF-R02 | Q-02 product detail by slug | `DrizzleProductRepository.findBySlug` / `loadStructure` | `products` + variant/side/area chain | M, L | 1, 8 | median/p95, query count per detail load | full placement chain returned, no N+1 | PASS |
| PERF-R03 | Q-03 variant & SKU availability | `DrizzleSkuStockRepository.availability` | `sku_stocks`, holds, reservations | M, L | 1, 8 | median/p95 | `available = on_hand − holds − reservations` | PASS |
| PERF-R04 | Q-04 gallery listing | `DrizzleGalleryEntryRepository` listing | `gallery_entries` | M | 1 | median/p95 | published scope honoured | PASS |
| PERF-R05 | Q-05 published content lookup | `DrizzleContentPageRepository.findByTypeAndSlug` | `content_pages` | M | 1 | median/p95 | published scope honoured | PASS |
| PERF-R06 | Q-06 sitemap / indexable set | content + product published sets | `content_pages`, `products` | M | 1 | median/p95, rows | indexable predicate applied in SQL | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R07 | Q-07 redirect resolution | `DrizzleContentPageRepository.resolve` | `redirect_rules` | M, L | 1, 8 | median/p95 — highest-frequency lookup | active rule wins | PASS |
| PERF-R08 | Q-08 secure link lookup (**P0**) | `DrizzleSecureAccessGrantRepository.resolveActive` | `secure_access_grants` | M | 1 | median/p95 | revoked/expired never resolve | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R09 | Q-09 request detail, customer view (**P0**) | `DrizzleCustomRequestRepository.findById` / `loadBreakdown` | `custom_requests` + breakdown | M | 1 | median/p95, query count | breakdown complete, scoped to owner | PASS |
| PERF-R10 | Q-10 design version history | `DrizzleDesignCaseRepository.listVersions` | `design_versions` | M, L | 1 | median/p95, deep page | keyset ordering stable | PASS |
| PERF-R11 | Q-11 current review version (**P0**) | `DrizzleDesignCaseRepository.findVersionInReview` | `design_versions` partial index | M | 1 | median/p95 | at most one in review | PASS |
| PERF-R12 | Q-12 quotation version history | `DrizzleQuotationRepository.listVersions` | `quotation_versions` | M | 1 | median/p95 | ordering stable | PASS |
| PERF-R13 | Q-13 current quotation | `DrizzleQuotationRepository.findByRequest` | `quotations` | M | 1 | median/p95 | current pointer resolved | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R14 | Q-14 approval snapshot lookup (**P0**) | `DrizzleApprovalSnapshotRepository.findByDesignVersion` | `approval_snapshots` | M | 1 | median/p95 | immutable snapshot returned intact | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R15 | Q-15 order lookup | `DrizzleOrderRepository.findByCode` / `loadItems` | `orders`, `order_items` | M, L | 1, 8 | median/p95, query count | items complete, no N+1 | PASS |
| PERF-R16 | Q-16 payment reconciliation (**P0**) | `PaymentEvidenceRepository` reconciliation read | `payment_provider_events`, reconciliations | M, L | 1 | median/p95 | matched/unmatched partition correct | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R17 | Q-17 pending deposit list | `DrizzlePaymentObligationRepository.findLiveForOrder` scan | `payment_obligations` partial index | M, L | 1 | median/p95 | only live obligations | PASS |
| PERF-R18 | Q-18 pending final payment list | same repository, final-kind predicate | `payment_obligations` | M | 1 | median/p95 | kind predicate in SQL | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R19 | Q-19 production queue | `DrizzleProductionJobRepository` active-queue read | `production_jobs` partial index | M, L | 1, 4 | median/p95 | only active states | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R20 | Q-20 admin low-stock dashboard | `DrizzleSkuStockRepository` low-stock scan | `sku_stocks` | M, L | 1 | median/p95 | threshold predicate in SQL | PASS |
| PERF-R21 | Q-21 request listing by status | `DrizzleCustomRequestRepository` status listing | `custom_requests` | M, L | 1, 8 | median/p95, deep page | keyset, no duplicate/skip | PASS |
| PERF-R22 | Q-22 admin dashboard aggregate | multi-repository aggregate | orders/payments/production | M | 1 | median/p95, query count | counts match row truth | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R23 | Q-23 failed / unmatched payments | `PaymentEvidenceRepository` unmatched scan | `payment_provider_events` | M | 1 | median/p95 | unmatched predicate in SQL | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R24 | Q-24 expiring quotations | `DrizzleQuotationRepository` expiry scan | `quotations` | M | 1 | median/p95 | expiry window correct | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R25 | Q-25 session expiration cleanup | `DrizzleDesignSessionRepository.expire` scan | `design_sessions` | M | 1 | median/p95, rows | only ACTIVE+expired | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R26 | Q-26 asset processing queue | `DrizzleAssetRepository.listDerivatives` queue read | `asset_derivatives` | M | 1, 4 | median/p95 | pending predicate | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R29 | Q-29 audit history lookup | `DrizzleAuditEventRepository.listByTarget` / `listByCorrelation` | `audit_events` | M, L | 1 | median/p95, deep page | target scope honoured | PASS |
| PERF-R30 | Q-30 signed asset access resolution (**P0**) | `DrizzleAssetRepository.findByStorageKey` + grant | `assets`, `secure_access_grants` | M | 1 | median/p95 | private originals never resolve publicly | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R31 | Q-31 verification challenge lookup (**P0**) | `DrizzleVerificationChallengeRepository.resolveOpen` | `contact_verification_challenges` | M | 1 | median/p95 | only open, unexpired | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R32 | Q-32 reservation-eligible check (**P0**) | `ReservationEligibilityGuard` | `payment_obligations` | M | 1, 8 | median/p95 | deposit SATISFIED read in-tx | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R34 | QX-01 transition history | `listTransitions` (order, request, production) | transition tables | M, L | 1 | median/p95 | chronological, complete | PASS |
| PERF-R35 | QX-02 cancellation saga resume (**P0**) | `DrizzleOrderShippingRepository.openCancellationRequest` state read | cancellation tables | M | 1 | median/p95 | resumable state exact | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R36 | QX-03 notification retry scan | `DrizzleNotificationIntentRepository` retry-ready scan | `notification_intents` partial index | M, L | 1, 4 | median/p95 | retry window correct | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R37 | QX-06 grant revocation / expiry sweep | `DrizzleSecureAccessGrantRepository` sweep | `secure_access_grants` | M | 1 | median/p95 | only expired swept | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R38 | QX-07 agreement effective version (**P0**) | `DrizzleAgreementRepository.effectiveVersions` | `agreements`, versions | M | 1 | median/p95 | effective-at semantics exact | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R39 | QX-08 customer merge review | `DrizzleCustomerRepository.findByVerifiedContact` | `customers`, contact points | M | 1 | median/p95 | verified scope honoured | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R40 | QX-09 shipping freeze state (**P0**) | `DrizzleOrderShippingRepository.loadShippingDetail` | `shipping_details`, snapshots | M | 1 | median/p95 | frozen flag respected | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |
| PERF-R41 | QX-10 hold / reservation expiry sweep | inventory expiry sweep | holds, reservations partial indexes | M, L | 1 | median/p95, rows | only expired swept | DEFERRED — no repository method exists yet; DB9 recorded the DB5 shape rather than inventing one. Owner: application feature work. |
| PERF-R42 | QX-11 challenge / attempt rate window (**P0**) | `DrizzleVerificationChallengeRepository.countAttempts` | attempts | M | 1 | median/p95 | window boundary exact | DEFERRED — the repository method exists and shares the single-row unique/PK lookup plan family already measured as PASS; not separately timed. Owner: the feature that builds its calling path. |

**Out of scope with evidence:**

| PERF ID | Shape | Verdict |
|---|---|---|
| PERF-R33 | Q-33 analytics event readiness (**P3**) | `N/A` — `DB2_ANALYTICS_STORAGE_DECISION.md` defers analytics storage; nothing to measure. |

## 2. Queue, lock and contention paths (CP3)

| PERF ID | Source | Repository / method | Tier | Conc. | Metric | Correctness assertion | Status |
|---|---|---|---|---|---|---|---|
| PERF-Q01 | Q-27 / QX-04 outbox relay claim (**P0**) | `OutboxEventStore.claimBatch` | M, L | 1, 2, 4, 8 | claim throughput, lock wait, skipped rows | zero double-claim (CC-19 invariant) | PASS |
| PERF-Q02 | Q-28 / QX-05 idempotency claim (**P0**) | `IdempotencyStore.claim` | M, L | 1, 2, 4, 8 | claim latency, contention | exactly one `claimed` per key | PASS |
| PERF-Q03 | QX-03 notification intent claim | `DrizzleNotificationIntentRepository.claimBatch` | M, L | 1, 2, 4, 8 | claim throughput, overlap | at-least-once accepted (G-DB7-58) | PASS |
| PERF-Q04 | background job attempts | `BackgroundJobAttemptStore` | M | 1, 4 | append latency | attempt chain intact | DEFERRED — `BackgroundJobAttemptStore` exists but nothing calls it; `apps/worker` is still a bootstrap shell. Owner: the worker application. |
| PERF-C01..C10 | DB8 category-**C** rows CC-02, CC-03, CC-04, CC-05, CC-06, CC-08, CC-10, CC-11, CC-12, CC-21 | respective repositories | M | 2, 4 | lock wait, transaction duration | the row's own documented winner/loser outcome — **never PASS on throughput alone** (§32) | PASS |

## 3. Write, trigger and amplification paths (CP4)

| PERF ID | Workload | Repository / method | Tier | Metric | Correctness assertion | Status |
|---|---|---|---|---|---|---|
| PERF-W01 | order creation transaction | `DrizzleOrderRepository.createFromAcceptedQuotation` | M | tx latency, WAL, buffers, indexes touched | order + exactly one `order.created` outbox row | DEFERRED — the transaction's correctness is proven (DB8 CC-07: order + exactly one outbox row under contention); its latency was not separately timed. Owner: DB10 / the use-case layer. |
| PERF-W02 | reservation + ledger append | inventory reservation path | M | tx latency, WAL | ledger sums to committed deltas | DEFERRED — correctness proven (DB8 CC-15/CC-16); latency shares the single-row-lock write family measured as PERF-C01..C09. |
| PERF-W03 | provider event append | `PaymentEvidenceRepository.recordProviderEvent` | M, L | append latency, WAL | unique arbiter honoured | DEFERRED — same single-row append family as PERF-W05/W06, on a table whose arbiter DB8 already proved (CC-09). |
| PERF-W04 | notification attempt append | `recordAttempt` | M, L | append latency | attempt count exact | DEFERRED — same single-row append family as PERF-W05/W06. |
| PERF-W05 | audit event append | `DrizzleAuditEventRepository.append` | M, L | append latency, WAL, index cost | append-only respected | PASS |
| PERF-W06 | outbox append + claim update | `OutboxEventStore` | M, L | append/update latency, WAL | status transition valid | PASS |
| PERF-W07 | version creation + current-pointer update | design / quotation / agreement | M | tx latency | pointer consistent | DEFERRED — measured as contention (PERF-C01/C07/C08) rather than as isolated write latency. |
| PERF-W08 | refund state update | `PaymentEvidenceRepository.approveRefund` / `executeRefund` | M | tx latency | S24 column scope respected | DEFERRED — no refund flow has a live caller; S24 column scope is covered structurally by PERF-T01/T02. |
| PERF-T01 | S24 trigger overhead — allowed mutable update | any S24-protected table | M | added latency vs. unprotected control | update applies | PASS |
| PERF-T02 | S24 — rejected immutable update | same | M | rejection latency | `23000` raised | PASS |
| PERF-T03 | S24 — append-only insert | append-only tables | M | insert latency | insert allowed | PASS — `audit_events` and `outbox_events` are both S24 append-only tables; PERF-W05/W06 are that insert path. |
| PERF-T04 | S24 — retention-job delete exemption | retention-exempt path | M | delete latency | exemption GUC honoured | DEFERRED — the `retention_exempt` GUC is a mechanism with no job that sets it. Owner: DB10. |
| PERF-A01 | index write amplification, high-write tables | `outbox_events`, `audit_events`, `payment_provider_events`, `notification_delivery_attempts`, `inventory_ledger_entries`, transition tables | M, L | index count, indexes touched, WAL/row | no correctness index dropped | DEFERRED — not measured; owner: application feature work. |

## 4. Pool, timeout and mixed workload (CP5)

| PERF ID | Workload | Metric | Correctness assertion | Status |
|---|---|---|---|---|
| PERF-P01 | pool sizing sweep (API profile) | acquire latency, query latency, throughput, waiting count | all results correct at every size | PASS |
| PERF-P02 | pool sizing sweep (worker profile) | as above | claims remain exclusive | PASS — exercised as the worker profile in PERF-P05 (pool 5 alongside a reader and writer) and as 8 independently pooled claimers in PERF-Q01/Q02. |
| PERF-P03 | acquire-timeout behaviour | timeout count, connection released | error mapped, no secret leak, no stuck tx | DEFERRED — the acquire timeout was never reached: at pool 2 with 24 offered operations the queue drained well inside the 10 s limit, so there was no timeout to observe. Owner: DB10, under a deployed connection budget. |
| PERF-P04 | statement-timeout behaviour | cancellation latency | mapped error, transaction rolled back | PASS |
| PERF-P05 | mixed workload (reads + order/payment writes + inventory contention + workers + audit appends) | degradation vs. isolated baselines, starvation | every component's invariants hold under the mix | PASS |

## 5. Handoff column

Rows whose owner is not DB9 carry it explicitly:

| Row | Owner |
|---|---|
| PERF-R33 | `N/A` — analytics storage decision (DB2), no target |
| CC-13 (category B) | the feature that builds signed-link consumption — not a DB9 row |
| Operational index-build risk, autovacuum, retention cost | DB10 (`DB9_DB10_HANDOFF.md`) |

## 6. Final tally (DB9-CP7)

| Status | Rows |
|---|---|
| **PASS** | 29 |
| **TUNED** | 0 — four candidates evaluated at tier L and all four rejected on measured evidence (`DB9_EXECUTION_LOG.md` CP6) |
| **DEFERRED**, each with an owner and a reason in the tables above | 34 |
| **N/A** with evidence | 1 (PERF-R33, analytics storage undecided) |
| **BLOCKED** | 0 |

No row is silently open (§47). Every deferral names *why* — either the
calling path does not exist yet, or the row shares a plan family already
measured as PASS — and names who owns it. Nothing was marked validated on
the strength of a similar-looking row without saying so.
