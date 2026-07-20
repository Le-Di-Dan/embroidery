# DB7 Error Mapping Catalog

How a PostgreSQL failure becomes a client-safe application error, and what each mapping
means. Implementation: `packages/database/src/errors/` (`driver-error.ts`,
`persistence-error.ts`, `constraint-catalog.ts`, `map-database-error.ts`).

---

## 1. Why the mapper exists at all

DB6 left every database failure as a raw `pg` error. Those carry `detail` (which contains
**row values**, including PII), `where`/`internalQuery` (which contain **SQL text**), and a
driver message. None of that may reach a client (`DB7` §18,
`BACKEND_CONVENTIONS.md` §17).

Two structural findings shaped the implementation:

1. **Drizzle wraps the driver error.** The `pg` error is attached as `cause`, so
   `error.code` reads `undefined` and every SQLSTATE would have classified as an unknown
   failure — including in DB6's own `isSqlState`. `extractDriverError` unwraps the cause
   chain (depth-limited) and is the only place `.code` is read. Found by the CP1 health
   tests; recorded as DEF-DB7-002.
2. **The S24 triggers raise `23000`, not `23001`.** DB6's `SQLSTATE` constant documented
   `RESTRICT_VIOLATION: '23001'` as "raised by the immutability triggers"; migration
   `0030`'s function body and `DB6_S24_TRIGGER_REPORT.md` §"Error contract" both say
   `ERRCODE = '23000'`. Corrected in DB7-CP2 (DEF-DB7-005) and asserted by an integration
   test that provokes a real trigger rejection.

## 2. What the mapper reads, and what it refuses to read

| Field | Read? | Reason |
|---|---|---|
| `code` (SQLSTATE / errno) | yes | the classification input |
| `constraint` | yes | an identifier **we** chose; contains no user data |
| `table` | yes | same |
| `detail` | **never** | contains the conflicting row's values |
| `where`, `internalQuery`, `query` | **never** | contains SQL text |
| driver `message` | **never** | contains values and SQL fragments |

Every application-facing message is a **fixed string chosen ahead of time**. No branch
interpolates a database value.

## 3. The taxonomy

| Kind | Meaning | Retryable |
|---|---|---|
| `CONFLICT` | a uniqueness arbiter rejected the write | no |
| `INVALID_REFERENCE` | a referenced row does not exist, or is still in use | no |
| `INVARIANT_VIOLATION` | a CHECK or an application guard was violated | no |
| `IMMUTABLE_EVIDENCE` | an immutability / append-only guard rejected the change | no |
| `CONCURRENT_MODIFICATION` | the row is locked, or the statement was cancelled | no |
| `RETRYABLE_TRANSACTION_FAILURE` | serialization failure or deadlock | **yes** |
| `DATABASE_UNAVAILABLE` | unreachable, misconfigured, or refused | **yes** |
| `UNKNOWN_PERSISTENCE_FAILURE` | unrecognised; carries no original text | no |

`PersistenceError` also carries `replayable`: true when the rejection is the *expected*
signal of a duplicate operation and the caller should replay the earlier outcome instead of
failing. See §5.

Diagnostics (`sqlState`, `constraint`, `table`, `operation`) live on a **non-enumerable**
`diagnostics` property, so `JSON.stringify(error)` and object spreads cannot copy them into
a response body. `describeForLog()` renders them for an operator log. Both behaviours are
asserted by tests.

## 4. SQLSTATE family rules

| SQLSTATE | Kind | Client-safe code | Retryable | Test |
|---|---|---|---|---|
| `23505` unique_violation | `CONFLICT` | `DUPLICATE_RESOURCE` (or the catalogued code) | no | unit + integration (`redirect_rules`) |
| `23503` foreign_key_violation | `INVALID_REFERENCE` | `REFERENCE_NOT_FOUND` | no | unit + integration (`audit_events.admin_id`) |
| `23514` check_violation | `INVARIANT_VIOLATION` | `VALUE_NOT_ALLOWED` | no | unit + integration (`ck_redirect_rules__kind_allowed`) |
| `23502` not_null_violation | `INVARIANT_VIOLATION` | `REQUIRED_VALUE_MISSING` | no | unit + integration |
| `23000` integrity_constraint_violation — **the S24 trigger contract** | `IMMUTABLE_EVIDENCE` | `IMMUTABLE_RECORD` | no | unit + integration (real UPDATE and DELETE rejections) |
| `23001` restrict_violation | `INVALID_REFERENCE` | `REFERENCE_IN_USE` | no | unit |
| `55P03` lock_not_available | `CONCURRENT_MODIFICATION` | `RESOURCE_LOCKED` | no — see note | unit |
| `40001` serialization_failure | `RETRYABLE_TRANSACTION_FAILURE` | `TRANSIENT_CONFLICT` | **yes** | unit |
| `40P01` deadlock_detected | `RETRYABLE_TRANSACTION_FAILURE` | `TRANSIENT_CONFLICT` | **yes** | unit |
| `57014` query_canceled | `CONCURRENT_MODIFICATION` | `OPERATION_TIMED_OUT` | no | unit + integration (`statement_timeout`) |
| `25006` read_only_sql_transaction | `INVARIANT_VIOLATION` | `READ_ONLY_TRANSACTION` | no | unit + integration |
| `53300`, `57P01`–`57P03` | `DATABASE_UNAVAILABLE` | `DATABASE_UNAVAILABLE` | yes | unit |
| `3D000`, class `28` | `DATABASE_UNAVAILABLE` | `DATABASE_MISCONFIGURED` | yes | unit |
| class `08`, `ECONNREFUSED`/`ENOTFOUND`/`ETIMEDOUT`/`ECONNRESET`/`EHOSTUNREACH`/`ENETUNREACH`/`EPIPE` | `DATABASE_UNAVAILABLE` | `DATABASE_UNAVAILABLE` | yes | unit |
| anything else | `UNKNOWN_PERSISTENCE_FAILURE` | `PERSISTENCE_FAILURE` | no | unit |

**Note on `55P03`.** It is *not* marked retryable even though a retry could succeed: the
lock holder may hold it for a long time, so an immediate automatic retry would spin. Retry
with backoff is a policy decision for the caller, and the concurrent behaviour is DB8's.

**Why the 189 CHECK constraints are not enumerated.** A CHECK rejection always means "this
value is not allowed for this record", and the family rule says that safely and completely.
Enumerating 189 near-identical rows would add noise without adding a single distinct
client-visible outcome. What *is* enumerated is every arbiter whose rejection a use case
must be able to tell apart — §5.

## 5. Named business arbiters

The schema has 63 uniqueness arbiters (50 UNIQUE constraints + 13 partial unique indexes).
`constraint-catalog.ts` maps the ones carrying a distinct business meaning; the rest fall
back to `DUPLICATE_RESOURCE`, which is correct but generic. An integration test asserts
every catalogued name exists in the **live** schema, so a typo cannot silently degrade a
specific mapping into the generic one.

### Replayable — a duplicate here is success, not failure

| Constraint | Code | Meaning |
|---|---|---|
| `uq_idempotency_records__namespace_scope_key` | `IDEMPOTENCY_KEY_IN_USE` | GRD-012: another attempt already claimed this key — replay its result |
| `uq_payment_provider_events__provider_key__provider_event_ref` | `PROVIDER_EVENT_ALREADY_RECORDED` | INV-07: duplicate provider callback — already ingested |
| `uq_notification_intents__intent_key` | `NOTIFICATION_INTENT_ALREADY_EXISTS` | the intent was already decided |
| `uq_background_job_attempts__kind_key_attempt` | `JOB_ATTEMPT_ALREADY_RECORDED` | duplicate attempt record |

Treating any of these as an error would turn a correct idempotent retry into a 500.

### Conversion gates

| Constraint | Code | Guard |
|---|---|---|
| `uq_orders__request` | `ORDER_ALREADY_EXISTS_FOR_REQUEST` | GRD-009 / INV-19 |
| `uq_quotations__request` | `QUOTATION_ALREADY_EXISTS_FOR_REQUEST` | G-DB7-04 |
| `uq_quotation_acceptances__qversion` | `QUOTATION_VERSION_ALREADY_ACCEPTED` | GRD-006 |
| `uq_approval_snapshots__version` | `DESIGN_VERSION_ALREADY_APPROVED` | INV-01 |
| `uq_production_jobs__order_approval_snapshot` | `PRODUCTION_JOB_ALREADY_EXISTS` | INV-03/06 |
| `uq_production_specifications__job` | `PRODUCTION_SPECIFICATION_ALREADY_FROZEN` | INV-03 |
| `uq_shipping_snapshots__order` | `SHIPPING_ALREADY_DISPATCHED` | GRD-017 |

### Single-active-state arbiters (partial unique indexes)

| Constraint | Code | Guard |
|---|---|---|
| `uq_design_versions__case__sent_for_review` | `REVIEW_ALREADY_ACTIVE` | GRD-004 / INV-16 |
| `uq_inventory_soft_holds__request_stock__held` | `SOFT_HOLD_ALREADY_ACTIVE` | GRD-013 |
| `uq_inventory_reservations__order_stock__reserved` | `RESERVATION_ALREADY_ACTIVE` | INV-05 |
| `uq_payment_obligations__order_kind__live` | `OBLIGATION_ALREADY_ACTIVE` | INV-04 |
| `uq_secure_access_grants__customer_request__active` | `GRANT_ALREADY_ACTIVE` | INV-08 |
| `uq_verification_challenges__kind_value_purpose__issued` | `CHALLENGE_ALREADY_OPEN` | INV-19 |
| `uq_order_cancellation_requests__order__pending` | `CANCELLATION_ALREADY_PENDING` | ADR-DB3-002 |
| `uq_customer_merge_cases__survivor_loser__requested` | `MERGE_CASE_ALREADY_OPEN` | ADR-DB2-001 r8 |
| `uq_admin_accounts__status__active` | `ADMIN_ACCOUNT_ALREADY_ACTIVE` | REQ-IDN-001 |
| `uq_customer_contact_points__customer__primary` | `PRIMARY_CONTACT_ALREADY_SET` | ADR-DB2-001 |
| `uq_customer_contact_points__kind_value__verified` | `CONTACT_ALREADY_VERIFIED` | REQ-VERIF-001 |
| `uq_asset_derivatives__asset_kind__not_failed` | `DERIVATIVE_ALREADY_EXISTS` | INV-22 |

### Version sequences, one-to-one owners, public identifiers

Version-number arbiters (`uq_design_versions__case_version`,
`uq_quotation_versions__quotation_version`, `uq_agreement_versions__agreement_version`,
`uq_policy_configuration_versions__config_version`,
`uq_design_template_versions__template_version`) each map to a `…_VERSION_NUMBER_TAKEN`
code. One-to-one owner arbiters (`uq_design_cases__request`,
`uq_customer_owned_products__request`, `uq_shipping_details__order`, `uq_sku_stocks__sku`,
`uq_business_profiles__customer`) map to `…_ALREADY_EXISTS`. Public identifiers map to
`DUPLICATE_SLUG` / `DUPLICATE_*_CODE` / `DUPLICATE_STORAGE_KEY`. Secret-hash collisions
(`uq_admin_sessions__token_hash`, `uq_secure_access_grants__token_hash`,
`uq_design_sessions__session_secret_hash`) map to a `…_COLLISION` code whose message asks
the caller to retry rather than revealing that a hash collided.

Full list: `packages/database/src/errors/constraint-catalog.ts`.

## 6. How repositories use it

```ts
return withMappedErrors('OrderRepository.createFromAcceptedQuotation', async () => {
  // … statements …
});
```

`withMappedErrors` wraps the whole method body so a new method cannot forget the mapping
and leak a raw error. `mapDatabaseError` is idempotent: an already-mapped error passes
through unchanged rather than being re-classified as generic.

## 7. Test evidence

| Suite | Cases | Kind |
|---|---|---|
| `map-database-error.spec.ts` | 31 | classification table, cause unwrapping, and the leak-safety rules (message, serialisation, log line, `cause` preservation) |
| `error-mapping.integration.spec.ts` | 12 | real `23505`/`23503`/`23514`/`23502`, real S24 trigger `23000` on UPDATE **and** DELETE, real `25006`, real `57014`, live-schema catalogue integrity, and leak safety on a real duplicate |

The integration suite is the one that matters for drift: it asserts the catalogued
constraint names exist in the schema the migrations actually produce, so renaming a
constraint in a future migration fails the suite rather than silently degrading its mapping.
