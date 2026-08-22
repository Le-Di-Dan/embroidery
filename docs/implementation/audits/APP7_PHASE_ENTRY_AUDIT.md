# APP7 — Phase Entry Audit and Roadmap Reconciliation

- Checkpoint: `APP7-R00`
- Mode: `AUDIT_ONLY / RECONCILIATION_ONLY / NO_IMPLEMENTATION`
- Entry branch/HEAD: `production` @ `58c4aeb`
- Date: 2026-08-22

This audit establishes the APP7 execution authority from current repository
truth. It changes documentation only. No runtime source, schema, migration,
generated artifact or Figma node was touched.

---

## 1. Baseline

```text
branch              production
entry HEAD          58c4aeb  docs(app6): record the APP6-X01 commit hash in its closure artifacts
working tree        clean (git status --porcelain -> empty)
APP6 closure commit ccd946a  reachable from HEAD (git merge-base --is-ancestor -> true)
APP6 E01-C1 commit  fdb0e9a  reachable from HEAD (git merge-base --is-ancestor -> true)
APP6 status         COMPLETE / PASS_WITH_FOLLOW_UPS / CLOSED / 0 blocking
APP7 status         NOT_STARTED
```

### 1.1 Handoff expectation vs recomputed truth

Every frozen APP6-X01 value was recomputed from the committed artifacts. **No
delta.**

| Artifact | APP6-X01 expectation | Recomputed truth | Verdict |
|---|---|---|---|
| OpenAPI paths / operations / schemas | 72 / 79 / 167 | **72 / 79 / 167** | identical |
| OpenAPI SHA-256 | — | `a9474daa76297d00d783af244c0045af12b0ca0794c5915654639d3502e46489` | recorded for APP7 |
| APP6-owned operations | 16 | **16** (`adminQuotation` 5 + `publicQuotation` 3 + `publicDesignReview` 3 + `adminCustomRequestDesignVersion` 4 + `adminCustomRequestSubmittedDesign` 1) | identical |
| Migrations | 36 | **36**, highest `0036_add_app6_cop_design_context.sql` | identical |
| Figma `APP_06` rows | 56 `APPROVED_FOR_IMPLEMENTATION` | 56, all approved under `FIG-APPROVAL-APP6-D01-PO-001` | identical |
| Existing APP7 HTTP operations | 0 | **0** — no `order`, `payment`, `checkout` or `webhook` tag exists in the committed OpenAPI | identical |
| Figma `APP7` / `APP_07` rows | — | **0** | design gate open |

APP6 is not reopened.

---

## 2. The single most consequential finding

**The accepted lifecycle does not create the Order after the deposit. It creates
the Order *on approval*, at `AWAITING_DEPOSIT`, together with *both* payment
obligations, and the deposit then moves it forward.**

`DB3_LIFECYCLE_SPECIFICATIONS.md` LC-14:

```text
TR-LC14-01 | (create)->AWAITING_DEPOSIT | system (approval event)
           | GRD-009 (approval + accepted current quotation + no existing order)
           | in-tx: order + items (frozen) + both obligations (INV-04)
           | after-commit: SE-006 payment instructions
           | idem: order.create per (request, approval) | conc: CC-11
TR-LC14-02 | AWAITING_DEPOSIT->DEPOSIT_PAID | system (deposit verified event)
           | deposit obligation SATISFIED (LC-15)
```

This is corroborated **physically**, not only in prose:

| Evidence | File | Consequence |
|---|---|---|
| `payment_obligations.order_id` is `NOT NULL`, FK to `orders` | `packages/database/src/schema/payment/payment-obligations.ts:67,87` | **No deposit obligation can exist before the Order row exists.** |
| `uq_payment_obligations` on `(order_id, kind)` | same, `:83` | Exactly one DEPOSIT and one REMAINING per order. |
| `payment_attempts.payment_obligation_id` `NOT NULL` | `payment-attempts.ts:57` | No attempt without an obligation, therefore none without an Order. |

The candidate list in the APP7 phase document orders the work
`B01 deposit obligation and checkout` … → `B04 order conversion`. **That
ordering is physically impossible**: `B01` cannot write a `payment_obligations`
row until `B04` has written the `orders` row. Order conversion is the *first*
runtime slice of APP7, not the last. §18 of this audit reorders accordingly.

### 2.1 The trigger already exists and already fires

`APP6-B11` already emits the hand-off, and says so in its own source:

```text
apps/api/src/modules/design/application/deciding/design-decision.recorder.ts:44
  - `SE-005 design.approved` on the `APPROVAL_SNAPSHOT`, which is the aggregate
    §SE-005 names ("per (approval snapshot)"). **This is the APP7 hand-off.**
```

`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` SE-005:

```text
SE-005 | TR-LC08-04 approved | after-commit | DSN->ORD/NTF
       | design.approved (-> order creation trigger + confirmation)
       | per (approval snapshot)
       | order-creation failure -> admin alert (approval stands; order retried idempotently)
```

The payload carries `approvalSnapshotId`, `designVersionId`, `designCaseId`,
`customRequestId`, `customerId`, `version`, `documentHash`, `quantityTotal`,
`approvedAt` (`design-decision.recorder.ts:184`).

**`design.approved` has no handler today.** `apps/worker/src/runtime/registry/job-handler.registry.ts`
registers only `asset-normalization` and `notification-delivery`; an unclaimed
event type is abandoned with a warning (`job-execution.service.ts:76`). Every
approval since APP6-B11 has therefore left a `PENDING` outbox row that nothing
consumes. That consumer is APP7's first runtime deliverable, and it is a
**worker job handler** — SE-005 is `after-commit` with an idempotent retry,
exactly the worker contract.

---

## 3. What is already delivered vs what APP7 must build

The DB era (DB3–DB10) delivered the **persistence** for the whole payment and
order aggregate. It delivered **no application capability, no HTTP surface and
no UI**. Table existence is not delivered capability.

| Capability | Persistence | Application | HTTP | UI | APP7 must build |
|---|---|---|---|---|---|
| Order root + items + transitions | `drizzle-order.repository.ts`, `order-chain.guard.ts`, `order-row.mapper.ts` | **none** | **none** | **none** | use case + consumer |
| `order.created` outbox (SE-006) | emitted inside `createFromAcceptedQuotation` (`drizzle-order.repository.ts:177`) | — | — | — | consumer only |
| Payment obligations / attempts / provider events / reconciliations / refunds | `drizzle-payment-obligation.repository.ts`, `payment-evidence.repository.ts` | **none** | **none** | **none** | use cases + surface |
| Deposit-satisfaction fact for Inventory | `DepositEligibilityPort` (`deposit-eligibility.port.ts`) | — | — | — | nothing (APP8 consumes) |
| Idempotency claims | `idempotency_records` unique `(operation_namespace, scope_key)` | used by APP2/4/5/6 | — | — | reuse |
| Secure grant + step-up | `secure_access_grants` (`GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']`), `contact_verification_challenges` | APP4-B05/B06, APP6-S01 | delivered | delivered | **reuse — no new grant architecture** |
| Notification intake for SE-006/SE-007 | `notification_intents` with `source_outbox_event_id` | APP4-B01 | delivered | — | reuse |
| SKU authoring | `skus` table + `ProductRepository.addSku` | **unreachable** | **none** | **none** | see §5 — blocker |

`OrderRepository.createFromAcceptedQuotation` already carries GRD-009, G-DB7-05
and the SE-006 outbox append in one transaction. APP7 does **not** re-implement
that; it supplies the caller, the item projection and the obligation pair.

---

## 4. Inherited follow-ups — re-evaluated

### 4.1 `FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01` — resolved by diagnosis

```text
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
```

One representative run (`npx jest src/modules/order/tests/integration/order.integration.spec.ts`,
28 tests, all failing at the same line) gives the whole cause:

```text
error: null value in column "code" of relation "product_sides"
       violates not-null constraint
  at seedOrderChain (src/modules/order/tests/integration/order-fixture.ts:127:3)
```

`order-fixture.ts` is a DB7-era raw-SQL fixture, last touched by `da37710`.
Migration `0034_add_app3_placement_and_derivative_authority.sql` (APP3-DB01)
subsequently added `code` to **both** `product_sides` (`:29`, `SET NOT NULL` at
`:81`) and `embroidery_areas` (`:30`, `SET NOT NULL` at `:82`), with
`ck_product_sides__code_format` requiring `^[a-z0-9][a-z0-9_-]{0,63}$`. The
fixture supplies neither.

**No runtime code is involved.** The failure is in a test fixture's INSERT
column list, and it is two columns. From this follow-up,
`APP7 ENTRY BLOCKER = none`.

Blast radius — the same fixture is imported by every suite below, so all of them
are red for this one reason and all go green together:

```text
apps/api/src/modules/order/tests/integration/order.integration.spec.ts
apps/api/src/modules/order/tests/integration/order-outbox.integration.spec.ts
apps/api/src/modules/order/tests/integration/order-races.integration.spec.ts
apps/api/src/modules/payment/tests/integration/payment-persistence.integration.spec.ts
apps/api/src/modules/payment/tests/integration/payment-races.integration.spec.ts
apps/api/src/modules/production/tests/integration/production-persistence.integration.spec.ts
apps/api/src/tests/durability/db10-cp4-anonymization.integration.spec.ts
apps/api/src/tests/durability/db10-cp5-recovery.integration.spec.ts
apps/api/src/tests/durability/db10-cp8-retention-role-security.integration.spec.ts
apps/api/src/tests/benchmark/bench-dataset.ts
```

Not repaired here. Routed to **`APP7-W01`**, whose acceptance depends on the
order and payment persistence suites being green — repairing the fixture inside
the checkpoint that must read those suites keeps the repair reviewable against a
real consumer rather than as a standalone chore.

### 4.2 `FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01` — does not block APP7

APP7 never reads "the latest quotation". It binds to the exact accepted version,
and that binding is physical on three columns:

```text
orders.accepted_quotation_version_id            NOT NULL
payment_obligations.source_quotation_version_id NOT NULL
order_items.approval_snapshot_id                NOT NULL  (COL-TBL044-09, D7-07)
```

`custom_requests.current_quotation_id` is a **pointer to the quotation, not the
version**, and APP7 must not use it as a conversion input. The conversion reads
the version id that `OrderChainGuard.assertOrderChain` verified.

LC-11 has no edge back into `QUOTED` from `QUOTE_ACCEPTED`, so no re-quote can
occur between acceptance and conversion. `ADR-DB3-003` rule 7 (obligation
supersede on recalculation) is reachable only through `TR-LC14-09/10`
(`ON_HOLD` / resume after a post-order revision), which requires the same absent
LC-11 edge. **Deferred, not built** — see §9.

Verdict: APP7 safely consumes only the exact immutable accepted quotation. No
requote lifecycle is invented and no LC-11 edge is added.

### 4.3 `FU-APP6-B10-AGREEMENT-ACTOR-01` — not needed by APP7

`agreement_versions` records no publishing Admin. APP7's payment and order
authority derives from the **Approval Snapshot's** own evidence
(`grant_id`, `step_up_challenge_id`, `customer_id`, `approved_at`), which is
`NOT NULL` and frozen. Publisher attribution on the agreement text is never an
input to GRD-009, GRD-011 or GRD-012. **No change routed.** It stays a future
database-change item, unchanged.

### 4.4 `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` — APP7 supplies the third consumer

`quotation-code.ts:15-23` states the condition explicitly:

> Two consumers is not yet the third that justifies a shared home
> (`CLAUDE.md` §5), so the mechanism is restated at the narrowest scope and the
> promotion is left to whoever needs the third code.

`orders.code` is `NOT NULL` with `uq_orders__code`, and nothing generates it.
APP7 is that third consumer. Routed to **`APP7-W01`**: promote the shared
generator to workspace scope and have all three prefixes (`REQ-`, `QUO-`,
`ORD-`) draw from it. Recorded here so the promotion is a decision, not a
drive-by refactor.

### 4.5 Secure access — reuse only

```text
GRANT_SCOPE_KINDS = ['REQUEST_ACCESS']          (secure-access-grants.ts:51)
GRD-002  grant ACTIVE + scope covers action + request match (INV-08)
GRD-003  step-up re-verification, sensitive set explicitly includes "pay"
```

APP7 reuses `REQUEST_ACCESS` for the customer payment surface and `STEP_UP` for
payment initiation (`TR-LC16-01` guards `GRD-002/003`). **No new token, grant
scope or secure-link architecture.** Admin surfaces reuse APP1 staff auth.

---

## 5. The real APP7 entry blocker — Catalog order items have no SKU

`order_items` names exactly one subject:

```text
ck_order_items__exactly_one_subject
  (sku_id is not null and customer_owned_product_id is null)
  or (sku_id is null and customer_owned_product_id is not null)
COL-TBL044-03  sku_id  ->skus  (NULL for COP subject)
```

So a **Catalog** order item *requires* a `sku_id`. And:

- `skus.product_variant_id` has **no unique constraint** — a variant may carry
  zero or many SKUs (`packages/database/src/schema/catalog/skus.ts:49,73`).
- `ProductRepository.addSku` exists (`drizzle-product.repository.ts:78`) but
  **no use case, controller or HTTP operation calls it**. Its only callers are
  two integration specs. The 8 delivered `adminProduct` operations do not
  include SKU management.
- Approval Snapshots name `product_variant_id`, never a SKU.

**Consequence: in the running system, a published Catalog variant has no SKU, so
the Catalog conversion branch cannot produce a legal `order_items` row.** The
COP branch is unaffected — `customer_owned_products.name` → `product_name`,
`sku_id` null — and is deliverable today. The asymmetry is worth stating
plainly: APP6 delivered both branches to `APPROVED`, but only the
customer-owned-product branch can currently become an order.

Authority is unambiguous about *who* owns this: `07-ADMIN-OPERATIONS.md:41`
lists **"Manage SKU"** as an Admin catalog operation. It is an inherited **APP2**
gap, not an APP7 design question, and it changes no business behaviour whichever
phase delivers it. Resolved autonomously rather than referred: APP7 delivers the
minimum Admin SKU authoring it needs, as **`APP7-B01`**, explicitly labelled an
APP2 capability settled late. APP2 is not reopened and its closure stands.

---

## 6. The exact Order creation gate

```text
APP7_ORDER_CREATION_GATE =
    approval snapshot exists for the request
  + the request's current quotation version status = ACCEPTED
  + quotation version, approval snapshot and request all resolve to ONE request
  + no existing order for that request
  -> orders(status = AWAITING_DEPOSIT)
   + order_items (frozen)
   + payment_obligations DEPOSIT and REMAINING (both, same tx)
   + order.created outbox row (same tx)
```

Deposit verification is **not** part of this predicate. It is `TR-LC14-02`,
a later transition on an order that already exists.

| Facet | Value | Source |
|---|---|---|
| Guard id | `GRD-009` | `DB3_TRANSITION_GUARD_CATALOG.md:22` |
| Transition | `TR-LC14-01` | `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-14 |
| Transaction owner | the order-creation use case, one transaction | `OrderRepository.createFromAcceptedQuotation` `@requiresTransaction` |
| Chain arbiter | `OrderChainGuard.assertOrderChain` — one query walks version→quotation→request and snapshot→request | `order-chain.guard.ts` (G-DB7-05, INV-19) |
| Duplicate arbiter | **`uq_orders__request`** unique on `orders.custom_request_id` | `orders.ts:95` (CST-030) |
| Idempotency | `order.create` per `(request, approval)` | LC-14 row; `idempotency_records` unique `(operation_namespace, scope_key)` |
| Failure behaviour | approval **stands**; admin alert; order retried idempotently | SE-005 catalog row |
| Side effects | both obligations in-tx (INV-04); `order.created` in-tx (G-DB7-54); SE-006 payment instructions after commit | LC-14 / LC-15 TR-LC15-01 |

`OrderChainGuard` already refuses `QUOTE_NOT_ACCEPTED`,
`QUOTATION_BELONGS_TO_ANOTHER_REQUEST` and `APPROVAL_BELONGS_TO_ANOTHER_REQUEST`
— the cross-customer pairing that every individual foreign key would otherwise
satisfy.

---

## 7. Deposit and payment semantics

Commercial handoff: deposit **40 %** (`BR-005`), remaining **60 %** (`BR-006`),
currency **VND**. `quotation_versions` already stores `deposit_percent`,
`deposit_amount`, `remaining_amount` with
`ck_quotation_versions__deposit_remaining_arithmetic` (`deposit + remaining =
total`) and VND minor-unit scale checks. **APP7 copies these; it never
recomputes them.** The rounding rule is already settled in DB4 (round-half-up,
remainder by subtraction) and is not reopened.

Three facts are kept strictly separate and are never conflated:

```text
expected commercial amount   payment_obligations.amount   (from the accepted version)
attempted amount             payment_attempts.amount      (what the customer says they paid)
verified/captured fact       obligation SATISFIED by one of its OWN succeeded attempts
                             (G-DB7-06/G-DB7-33: same obligation, amount and currency,
                              checked inside the satisfying transaction)
```

`PaymentObligationRepository.satisfy(id, attemptId, at)` enforces exactly that.
No partial-payment state exists in MVP (LC-15); over- and under-payment route to
`REQUIRES_REVIEW` with a mandatory `review_reason`
(`ck_payment_attempts__review_reason_required`).

### 7.1 State / actor / guard table (accepted names only)

| State | Actor | Command / Event | Guard | TX owner | Idempotency | Side effect |
|---|---|---|---|---|---|---|
| `orders` → `AWAITING_DEPOSIT` | system | `design.approved` (SE-005) | GRD-009 | order conversion tx | `order.create` per (request, approval) | items + both obligations + `order.created` |
| `payment_obligations` → `PENDING` ×2 | system | order creation | GRD-009 / TR-LC15-01 | same tx as order | with order tx | — |
| `payment_attempts` → `PENDING` | customer | `payment.initiate` (TR-LC16-01) | GRD-002 grant + GRD-003 step-up; obligation `PENDING` | attempt tx | `payment.initiate` per (obligation, attempt key) | transfer instructions returned |
| `payment_attempts` → `SUCCEEDED` | admin (manual verification) / system (callback) | TR-LC16-03 | GRD-011 amount + currency + reference verified server-side; GRD-012 claim | verification tx | `payment.callback` per provider event id | obligation `SATISFIED` + evidence + outbox |
| `payment_obligations` → `SATISFIED` | system | TR-LC15-02 | attempt belongs to obligation, SUCCEEDED, amount and currency match | same tx | inherited | order transition event |
| `orders` → `DEPOSIT_PAID` | system | deposit verified event (TR-LC14-02) | DEPOSIT obligation `SATISFIED` | order tx | event-driven, idempotent | SE-007 receipt; **APP8** reservation trigger |
| `payment_attempts` → `FAILED` / `EXPIRED` | admin / sweep | TR-LC16-04 | GRD-011 / expiry | attempt tx | idempotent | retry = a **new attempt**, never a mutated one |
| `payment_attempts` → `REQUIRES_REVIEW` | any | contradiction / late event | terminal states never regress (CC-08) | attempt tx | idempotent | `review_reason` mandatory |

`06-ORDER-AND-DESIGN-LIFECYCLE.md` §8: *"Payment success must be verified
server-side."* A browser redirect never satisfies any row above — nothing in
this table takes a client assertion as its verification input.

---

## 8. Payment-provider disposition

```text
APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
```

`IMP-O007` (payment provider, checkout, webhook signature and sandbox) is
**open** and owned by APP7. No ADR locks a provider. Repository authority
nevertheless supports a truthful manual bank-transfer flow **with no migration
and no invented state**:

| Requirement | Already satisfied by |
|---|---|
| A non-provider payment method | `PAYMENT_ATTEMPT_METHODS = ['PROVIDER_REDIRECT', 'BANK_TRANSFER', 'OTHER']` (`payment-attempts.ts:37`) |
| No provider identity required | `providerKey` and `providerRef` are **nullable** (`payment-attempts.ts:62-63`) |
| Server-side verification | admin action inside the satisfying transaction; `06 §8` requires server-side, not provider-side |
| Manual evidence, append-only | `payment_reconciliations` + `appendReconciliation(action, reason, adminId, amount)` |
| Ambiguous payment handling | `REQUIRES_REVIEW` + mandatory `review_reason` |

The provider-dependent surfaces — checkout session initiation, webhook signature
verification (the signature half of `GRD-011`) and provider event ingestion
(`recordProviderEvent`, already idempotent on
`uq_payment_provider_events__provider_key__provider_event_ref`) — stay **unbuilt
and unblocked**. `payment_provider_events` remains empty under the MVP; its
uniqueness arbiter is already in place for whenever a provider is locked.

`IMP-O007` is **not closed by this audit.** It is routed to `APP7-G01`, which
records the ruling formally. This is the one item where two defensible
alternatives materially change customer behaviour and no accepted authority
picks between them — see §13.

---

## 9. Phase boundaries

```text
APP7 = Deposit Payment and Order Creation
APP8 = Inventory Reservation and Production Operations
APP9 = Remaining Payment, Fulfillment and Completion
```

```text
APP7_INVENTORY_DISPOSITION = DEFERRED_TO_APP8
```

The default holds and nothing overrides it. `GRD-013` (official reservation
gate) and `LC-17` are owned by CTX-INV; APP7's only obligation toward them is
the already-delivered `DepositEligibilityPort`, which APP8 consumes. APP7 writes
no `inventory_reservations` row and starts no production job. The `inventory`
and `production` modules stay untouched.

Explicitly outside APP7:

| Item | Owner | Why |
|---|---|---|
| `TR-LC14-03` `DEPOSIT_PAID → IN_PRODUCTION`, GRD-015 | APP8 | requires an active reservation |
| `TR-LC14-04..08` production → delivery → completion | APP8 / APP9 | beyond the deposit |
| `TR-LC14-05/06`, remaining obligation payable, GRD-016 | APP9 | remaining payment |
| `TR-LC14-07` shipping freeze, GRD-017 | APP9 | fulfillment |
| `TR-LC14-09/10` `ON_HOLD` / resume, `ADR-DB3-003` r1/r5/r7 | later phase | needs the absent LC-11 requote edge (§4.2) |
| `TR-LC14-11/12` cancellation saga, GRD-020; refunds | APP9 | `IMP-O008` cancellation/refund policy |

The REMAINING obligation **is** created by APP7 (INV-04 requires both at order
creation) but APP7 never makes it payable — that is `TR-LC14-05`, APP9's.

---

## 10. Immutable evidence binding

APP7 consumes frozen evidence, never live Catalog or design state.

| Conversion input | Source | Never |
|---|---|---|
| branch identity | `approval_snapshots.customer_owned_product_id` null ⇒ Catalog, non-null ⇒ COP (`ck_approval_snapshots__exactly_one_placement_branch`) | inferred from live product rows |
| Catalog identity | snapshot `product_id` / `product_variant_id` / `product_side_id` / `embroidery_area_id` | re-read from `products` at conversion time |
| COP identity | snapshot `customer_owned_product_id` | a fabricated product, SKU, variant, side or area |
| display labels | snapshot `product_name`, `variant_label`, `side_name`, `area_name` | re-derived from Catalog copy |
| design version | snapshot `design_version_id` | `design_cases.current_version_id` |
| document hash | snapshot `document_hash` | recomputed |
| quantity | snapshot `quantity_total` | the request's live breakdown |
| approval evidence | snapshot `grant_id`, `step_up_challenge_id`, `approved_at` | re-derived |
| money | accepted `quotation_versions` row: `total_amount`, `deposit_amount`, `remaining_amount`, `currency_code`, `accepted_at` | recomputed from line items |

Relation walked at conversion (and only this one):

```text
approval_snapshots.custom_request_id ─┐
                                      ├─> ONE custom_requests row (OrderChainGuard)
quotation_versions -> quotations.custom_request_id ─┘
        |
        +-> orders.accepted_quotation_version_id            (frozen)
        +-> payment_obligations.source_quotation_version_id (frozen, per obligation)
orders.current_approval_snapshot_id  <- approval_snapshots.id (frozen)
order_items.approval_snapshot_id     <- approval_snapshots.id (frozen, per line)
```

`custom_requests.current_quotation_id` is a **pointer to the quotation**, not to
a version, and is **not a conversion input**. `quotation_acceptances` supplies
the acceptance evidence read alongside the version.

Frozen conversion inputs:

```text
accepted quotation id / version id   quotations.id / quotation_versions.id (status ACCEPTED)
acceptance evidence                  quotation_acceptances row + quotation_versions.accepted_at
total / deposit / remaining          quotation_versions.total_amount / deposit_amount / remaining_amount
currency                             quotation_versions.currency_code = 'VND'
accepted timestamp                   quotation_versions.accepted_at
```

```text
APP7_ORDER_ITEM_BRANCH_MODEL =
  CATALOG : sku_id NOT NULL (resolved to exactly one ACTIVE sku for the
            snapshot's product_variant_id) AND customer_owned_product_id NULL;
            product_name / variant_label / size_label copied from the snapshot.
  COP     : sku_id NULL AND customer_owned_product_id NOT NULL (the snapshot's);
            product_name = customer_owned_products.name;
            variant_label and size_label stay NULL — never fabricated.
  BOTH    : approval_snapshot_id NOT NULL; quantity from the snapshot;
            unit_price / line_total frozen from the accepted quotation version;
            currency VND.
  Zero or several ACTIVE SKUs for the snapshot's variant is a refusal, never a
  guess and never a synthesised SKU (see §5).
```

---

## 11. Idempotency and concurrency

Accepted namespaces only — none invented:

| Operation | Namespace | Scope key | Physical arbiter |
|---|---|---|---|
| Order creation | `order.create` | (request, approval snapshot) | **`uq_orders__request`** (CST-030) |
| Obligation creation | — | with the order tx | `uq_payment_obligations (order_id, kind)` |
| Attempt initiation | `payment.initiate` | (obligation, attempt key) | idempotency claim |
| Callback / verification | `payment.callback` | provider event id | `uq_payment_provider_events__provider_key__provider_event_ref` |
| Idempotency claim itself | GRD-012 | — | `uq_idempotency_records__namespace_scope_key` |

| Race (DB8) | Outcome | Arbiter |
|---|---|---|
| CC-11 two order creators | exactly one order; loser replays | `uq_orders__request` unique |
| CC-07 duplicate callback | `replay`, not an error | provider-event unique; `recordProviderEvent` returns `{outcome:'replay'}` |
| CC-08 out-of-order / late event | terminal states never regress; contradiction → `REQUIRES_REVIEW` | state predicate in the satisfying tx |
| CC-10 two verifiers race one obligation | a single application wins | `satisfy()` re-reads the attempt and obligation inside the tx |
| Duplicate deposit initiation | one live attempt per obligation | obligation state predicate + `payment.initiate` claim |
| Conversion vs request/quote/design mutation | quotation versions and approval snapshots are S24-frozen; `design_versions` carries the CST-090 exception-list trigger | DB triggers |
| Verified payment vs reversal | refunds are separate rows with a ceiling (G-DB7-35); an obligation never leaves `SATISFIED` | LC-15 terminal |

Every arbiter APP7 needs already exists. **Nothing is routed to `APP7-G01` for a
missing arbiter**; `G01` records the rulings and the namespace bindings, it does
not invent mechanisms.

---

## 12. Events and worker boundary

| Event | Producer | Consumer | TX boundary | Outbox | Worker |
|---|---|---|---|---|---|
| `design.approved` (SE-005) | **APP6-B11, already emitted** | **APP7 order conversion** | append in the approval tx | yes | **yes — new handler** |
| `order.created` (SE-006) | **already emitted** inside `createFromAcceptedQuotation` | notification (payment instructions) | same tx as the order | yes | reuses APP4 `notification-delivery` |
| `payment.verified` / `payment.failed` (SE-007) | APP7 verification tx | order transition + notification | same tx as satisfaction | yes | reuses APP4 `notification-delivery` |
| `inventory.reserved/released/expired` (SE-008) | **APP8** | — | — | — | out of APP7 |

No event is invented for symmetry. `order.created` and `design.approved` already
exist in the runtime; only `payment.verified` / `payment.failed` are new, and
both are named in the accepted SE catalog.

---

## 13. Product Owner decisions

```text
TRUE_PO_DECISIONS = 1
```

**PO-APP7-001 — Deposit collection method for MVP.**
`IMP-O007` is open and no accepted authority selects between:

- **(a) Manual bank transfer (this audit's disposition).** The customer receives
  transfer instructions carrying the order code as the reference; an Admin
  verifies the received transfer and the system marks the deposit satisfied.
  Deliverable now, no migration, no new state, no vendor.
- **(b) Lock a payment provider first.** Requires an ADR under `IMP-O007`, a
  sandbox, signature/webhook design and provider-specific checkout UX before any
  provider-dependent code or design.

The alternatives materially change what the customer does and what the Admin
does, which is why this is not resolved autonomously. The proposed roadmap
assumes **(a)** and is explicitly built so that **(b)** is additive: the provider
event table, its uniqueness arbiter and `PROVIDER_REDIRECT` already exist, so a
later provider phase adds a webhook checkpoint and a checkout screen without
reworking order conversion, obligations or verification.

Everything else in this audit was resolved from accepted authority. In
particular the SKU gap (§5), the fixture failure (§4.1), the conversion ordering
(§2) and the code-generator promotion (§4.4) are **not** PO decisions.

---

## 14. Schema disposition

```text
APP7_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED
```

Every physical invariant APP7 needs is installed at migration `0036`:

```text
orders                    code UQ, custom_request_id UQ (CST-030), accepted_quotation_version_id,
                          current_approval_snapshot_id, status, total, VND scale
order_items               sku_id XOR customer_owned_product_id (CST-067),
                          approval_snapshot_id NOT NULL, position UQ
payment_obligations       order_id NOT NULL, (order_id, kind) UQ, source_quotation_version_id NOT NULL
payment_attempts          obligation FK, BANK_TRANSFER method, nullable providerKey/providerRef,
                          grant_id + step_up_challenge_id evidence, review_reason CK
payment_provider_events   (provider_key, provider_event_ref) UQ
payment_reconciliations   append-only manual evidence
idempotency_records       (operation_namespace, scope_key) UQ
outbox_events             transactional dispatch
```

No convenience column, no new enum value and no SQL is authored in APP7 unless a
later checkpoint proves a missing physical invariant — in which case it stops and
routes a dedicated `APP7-DB01`, which is **not** currently scheduled.

---

## 15. Design gate

```text
APP7_DESIGN_GATE = DESIGN_REQUIRED_BEFORE_UI_ONLY
```

`docs/design/FIGMA_DESIGN_INDEX.md` contains **0** rows for `APP7` or `APP_07`.
The master roadmap states the expectation as *"Payment/status package only after
provider UX is known."* With `MANUAL_VERIFICATION_MVP` the UX **is** known — bank
transfer instructions, a pending state and a confirmed state, plus an Admin
verification and order view — so one complete `APP7-D01` package is schedulable,
and it is placed after `APP7-G01` records the payment-method ruling. No
provider-specific checkout is designed.

No Figma node was created, read for mutation or modified in R00.

---

## 16. HTTP surface

Committed OpenAPI carries **0** APP7 operations. No `order`, `payment`,
`checkout` or `webhook` tag exists.

| Surface | Operation | Checkpoint |
|---|---|---|
| Admin | `POST /api/admin/products/{productId}/variants/{variantId}/skus` | `APP7-B01` |
| Admin | `PATCH /api/admin/skus/{skuId}` | `APP7-B01` |
| — | order conversion (worker, outbox-driven) | `APP7-W01` — **0 ops** |
| Admin | `GET /api/admin/orders` | `APP7-B02` |
| Admin | `GET /api/admin/orders/{orderId}` | `APP7-B02` |
| Customer secure | `GET /api/public/orders/{orderId}/deposit` | `APP7-B03` |
| Customer secure | `POST /api/public/orders/{orderId}/deposit/attempts` | `APP7-B03` |
| Admin | `GET /api/admin/orders/{orderId}/payments` | `APP7-B04` |
| Admin | `POST /api/admin/payment-attempts/{attemptId}/verify` | `APP7-B04` |
| Admin | `POST /api/admin/payment-attempts/{attemptId}/review` | `APP7-B04` |
| Provider / webhook | **none** | deferred with `IMP-O007` |

Predicted total: **9 new operations** (72 → ~79 paths). Every backend slice is
within 1–3 normal; none reaches the hard maximum of 5. Route naming follows the
delivered `admin` / `public` split and needs no PO input. Exact paths are the
owning checkpoint's to confirm against `04-BACKEND-API-DELIVERY-STANDARD.md`.

No contract-only `C` checkpoint is scheduled: the owning NestJS checkpoint
publishes its own OpenAPI, so the four candidate `C0x` slices are removed in §17.

---

## 17. ORIGINAL candidate checkpoint reconciliation

The candidate list in `phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md` §6 is
preserved there as planning history. **All 15 candidates are audited below; none
is omitted.**

| Original checkpoint | Action | Repository finding | Required predecessor | Revised scope |
|---|---|---|---|---|
| `APP7-C01` — Deposit checkout contract | `REMOVE` | Contract-only slice. The owning NestJS checkpoint publishes OpenAPI itself; a separate contract checkpoint is a second review boundary for one capability | — | folded into `APP7-B03` |
| `APP7-B01` — Deposit obligation and checkout | `SPLIT` + `REORDER` | **Physically impossible as first slice**: `payment_obligations.order_id` is `NOT NULL`, so no obligation exists before an order (§2). Obligation *creation* belongs to the order transaction (TR-LC15-01); only *attempt initiation* is a customer-facing slice | `APP7-W01` | creation → `APP7-W01`; customer initiation + status → `APP7-B03` |
| `APP7-S01` — Deposit checkout/status UI | `REDEFINE` | No provider redirect under `MANUAL_VERIFICATION_MVP`; states are instructions / pending / verified / failed / expired, with retry as a **new attempt** | `APP7-D01`, `APP7-B03` | `APP7-S01`, bank-transfer instructions and status |
| `APP7-C02` — Payment callback contract | `DEFER` | No provider is locked (`IMP-O007` open, §8) | provider ADR | deferred with `IMP-O007` |
| `APP7-B02` — Webhook application | `DEFER` | Same. `recordProviderEvent` and its uniqueness arbiter already exist, so this is additive later | provider ADR | deferred with `IMP-O007` |
| `APP7-W01` — Payment reconciliation | `REDEFINE` | Nothing to reconcile without a provider. The worker work APP7 actually needs is the **`design.approved` order-conversion consumer**, which has no handler (§2.1) | `APP7-B01`, `APP7-G01` | becomes `APP7-W01 — order conversion consumer` |
| `APP7-C03` — Admin payment operations contract | `REMOVE` | Contract-only slice; same reason as `C01` | — | folded into `APP7-B04` |
| `APP7-B03` — Admin payment queries/actions | `REDEFINE` | Under the manual MVP this is the **verification** authority, not read-only visibility | `APP7-B03` | becomes `APP7-B04 — Admin payment verification and evidence` |
| `APP7-A01` — Admin payment/reconciliation view | `KEEP` | Still correct and reviewable | `APP7-D01`, `APP7-B04` | merged with the order view as `APP7-A01` |
| `APP7-B04` — Order conversion | `REORDER` (`REDEFINE`) | Must be the **first** runtime slice, not the last (§2). Not an HTTP use case — it is the outbox consumer of SE-005 | `APP7-B01`, `APP7-G01` | becomes `APP7-W01` |
| `APP7-C04` — Order read contract | `REMOVE` | Contract-only slice; same reason as `C01` | — | folded into `APP7-B02` |
| `APP7-A02` — Admin order confirmation/detail | `MERGE` | An Admin order screen without its payment state is not reviewable on its own; both read the same aggregate and the same Figma frames | `APP7-D01`, `APP7-B02`, `APP7-B04` | merged into `APP7-A01` |
| `APP7-S02` — Customer order confirmation | `MERGE` | The same secure screen as the deposit status, after verification; splitting would duplicate the grant-scoped bootstrap | `APP7-D01`, `APP7-B03` | merged into `APP7-S01` |
| `APP7-E01` — Deposit-to-order E2E | `KEEP` | Still correct | all runtime and UI slices | scope restated in §19 |
| `APP7-X01` — Phase closure | `KEEP` | Still correct | `APP7-E01` | unchanged |

Scrutiny required by the R00 brief:

```text
inventory                                  -> APP8 by default        confirmed, §9
production                                 -> APP8                   confirmed, §9
remaining payment                          -> APP9                   confirmed, §9
refund / cancellation policy               -> APP9 (IMP-O008)        confirmed, §9
provider-specific UI before provider ADR   -> invalid                C02/B02 deferred; D01 carries no provider UX
```

### 17.1 Added checkpoints

| Added | Purpose | Dependency | Bounded scope | Why separate | Layer | Ops | Acceptance focus |
|---|---|---|---|---|---|---|---|
| `APP7-G01` | Record the payment-method ruling (PO-APP7-001), the conversion trigger, idempotency namespace bindings, concurrency arbiters, the SKU resolution rule and the secure-access reuse | `APP7-R00` | docs only | Provider/method authority must precede any payment code; every APP phase has separated authority from implementation | docs | 0 | authority is unambiguous and cites accepted sources |
| `APP7-B01` | Admin SKU authoring — the inherited APP2 gap that blocks the Catalog branch (§5) | `APP7-G01` | 2 ops, catalog module only | A different bounded context (CTX-CAT) from every other APP7 slice | backend | 2 | a published variant can reach exactly one ACTIVE SKU |
| `APP7-D01` | One complete design package: Admin order + payment screen, customer deposit instructions/status | `APP7-G01` | Figma + registry rows | Design is one whole package, never split into coding checkpoints | design | 0 | all rows `APPROVED_FOR_IMPLEMENTATION` under one approval id |

`APP7-DB01` is **not** added — §14 proves no migration is required.

---

## 18. Authoritative APP7 roadmap

| Order | Checkpoint | Purpose | Depends on | Main area | Predicted HTTP ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP7-R00` | Phase-entry audit and roadmap reconciliation | APP6-X01 | docs | 0 | this document |
| 2 | `APP7-G01` | Payment-method, conversion, idempotency, concurrency and SKU authority | `R00` | docs | 0 | every APP7 rule cites accepted authority; PO-APP7-001 recorded |
| 3 | `APP7-B01` | Admin SKU authoring (inherited APP2 gap, §5) | `G01` | backend / catalog | 2 | a published variant resolves to exactly one ACTIVE SKU; duplicate codes refused |
| 4 | `APP7-W01` | Order conversion: `design.approved` consumer → order + items + both obligations + `order.created`; repairs the AGG-15 fixture (§4.1); promotes the code generator (§4.4) | `B01`, `G01` | worker + order/payment | 0 | exactly one order per request under CC-11; Catalog **and** COP branches; order/payment persistence suites green |
| 5 | `APP7-B02` | Admin order read (queue + detail) | `W01` | backend | 2 | frozen snapshot facts only; no live Catalog re-read |
| 6 | `APP7-B03` | Customer secure deposit read + attempt initiation | `W01` | backend | 2 | GRD-002 grant + GRD-003 step-up; `payment.initiate` idempotent; exact amount and VND |
| 7 | `APP7-B04` | Admin deposit verification, review and reconciliation evidence | `B03` | backend | 3 | GRD-011 amount/currency/reference server-side; CC-10 single application wins; obligation `SATISFIED` → order `DEPOSIT_PAID` |
| 8 | `APP7-D01` | Complete design package (Admin order/payment, customer deposit) | `G01` | design | 0 | registry rows `APPROVED_FOR_IMPLEMENTATION`; no provider-specific checkout |
| 9 | `APP7-A01` | Admin order + payment screen (verification, evidence, audit) | `D01`, `B02`, `B04` | frontend | 0 | exact registry node ids; no provider secret or raw payload rendered |
| 10 | `APP7-S01` | Customer secure deposit instructions, status and order confirmation | `D01`, `B03` | frontend | 0 | truthful states; retry opens a new attempt; never claims production started |
| 11 | `APP7-E01` | Focused cross-layer acceptance (§19) | 3–10 | tests | 0 | the §19 target list |
| 12 | `APP7-X01` | Phase closure; hand order and deposit truth to APP8 | `E01` | docs | 0 | follow-ups dispositioned; `DepositEligibilityPort` proven for APP8 |

Governance held: one checkpoint = one human review boundary; only one executes at
a time; authority (`G01`) precedes payment code; design (`D01`) precedes UI; no
migration is scheduled because none is required; backend slices are 2 / 2 / 2 / 3
— all within 1–3 normal and none at the hard maximum of 5; APP8 and APP9 stay
outside.

---

## 19. Future `APP7-E01` target (defined, not run)

```text
E01-01  Catalog: APPROVED request + exact accepted quotation + verified deposit
        -> exactly one Order, one order_item with sku_id set, cop_id NULL
E01-02  COP: the same -> exactly one Order, one order_item with cop_id set,
        sku_id NULL, and no fabricated product/SKU/variant/side/area identity
E01-03  duplicate design.approved delivery -> still exactly one Order
        (uq_orders__request; the second delivery replays)
E01-04  duplicate deposit verification -> obligation satisfied once, order
        transitions once, no second order and no second satisfying attempt
E01-05  unverified / failed / wrong-amount payment -> no Order transition,
        no DEPOSIT_PAID, REQUIRES_REVIEW carries a reason
E01-06  wrong quotation version / foreign approval snapshot / mismatched design
        -> refused by OrderChainGuard, no Order row written
E01-07  deposit amount and VND preserved exactly from the accepted version
        (40% per BR-005; deposit + remaining = total)
E01-08  conversion reads only the exact accepted quotation version and the
        immutable Approval Snapshot — never current_quotation_id, never the
        latest version, never live Catalog rows
E01-09  no APP8 work occurs: no inventory_reservations row, no production job
E01-10  no provider or internal secret in any response, log or rendered screen
E01-11  the APP8 handoff is clean: DepositEligibilityPort reports true exactly
        when the DEPOSIT obligation is SATISFIED
```

`APP7-E01` reuses accepted lower-level evidence where the input has not changed
and does not rerun predecessor suites for confidence.

---

## 20. Diagnostics run

| Command / check | Question / input | Result | Reruns | Why sufficient |
|---|---|---|---:|---|
| `git rev-parse` / `status --porcelain` / `merge-base --is-ancestor` | branch, HEAD, tree, `ccd946a`, `fdb0e9a` | `production` @ `58c4aeb`, clean, both reachable | 0 | direct answer |
| `node -e` over `openapi.generated.json` | paths / operations / schemas / tags | 72 / 79 / 167; 0 APP7 ops | 0 | committed artifact read, not regenerated |
| `sha256sum openapi.generated.json` | contract identity for the APP7 baseline | `a9474daa…e46489` | 0 | direct |
| `ls packages/database/migrations/*.sql \| wc -l` | migration count and highest | 36, `0036_add_app6_cop_design_context.sql` | 0 | direct |
| `grep` `FIGMA_DESIGN_INDEX.md` | APP6 rows / approval id / APP7 rows | 56 approved under `FIG-APPROVAL-APP6-D01-PO-001`; **0** APP7 rows | 0 | direct |
| `npx jest src/modules/order/tests/integration/order.integration.spec.ts` | is the AGG-15 red a runtime defect or a stale fixture? | 28/28 fail at one line: `product_sides.code` NOT NULL, in `order-fixture.ts:127` | 0 | one suite named the cause; the other two share the fixture, so rerunning them would add no information |
| `grep` `0034_…sql` | when did `product_sides.code` / `embroidery_areas.code` become NOT NULL? | added and `SET NOT NULL` in `0034` (APP3-DB01) | 0 | confirms the stale-fixture classification |
| `grep -rn addSku` | is any application path creating SKUs? | only two integration specs | 0 | proves the §5 blocker |
| `grep -rn "eventType: '"` | which outbox events does the runtime emit? | `order.created` only | 0 | direct |
| source reads (no execution) | order/payment ports, schemas, guards, lifecycle and guard catalogs, business rules, admin operations, decision register | as cited throughout | 0 | read-only |

No `pnpm quality`, no `quality:e2e`, no full Jest/Playwright/API/DB suite, no
repo-wide build or typecheck, no SonarQube, no historical phase sweep, no push.
No successful command was rerun on unchanged input and no known-red command was
looped.

---

## 21. Verdict

```text
APP7-R00                          = COMPLETE
APP7                              = AUDITED — NOT YET IMPLEMENTED
APP7_SCHEMA_DISPOSITION           = NO_MIGRATION_REQUIRED
APP7_DESIGN_GATE                  = DESIGN_REQUIRED_BEFORE_UI_ONLY
APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS
APP7_PAYMENT_PROVIDER_DISPOSITION = MANUAL_VERIFICATION_MVP
APP7_INVENTORY_DISPOSITION        = DEFERRED_TO_APP8
APP7 ENTRY BLOCKER                = no Catalog order item can be written until
                                    Admin SKU authoring exists (§5) — routed to
                                    APP7-B01; not a runtime defect
TRUE_PO_DECISIONS                 = PO-APP7-001 (deposit collection method, §13)
NEXT CHECKPOINT                   = APP7-G01
```
