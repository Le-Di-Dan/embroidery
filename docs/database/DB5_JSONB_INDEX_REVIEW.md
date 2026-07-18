# DB5 — JSONB Index Review

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Scope:** exactly the **9 JSONB columns** in the closed allowed set
([`DB4_JSONB_PAYLOAD_MAP.md`](./DB4_JSONB_PAYLOAD_MAP.md),
[ADR-DB4-004](../adr/database/ADR-DB4-004-JSONB-BOUNDARIES.md)). Any JSONB
column not listed there is a schema defect (D7 scan).

## 1. Default position

**No JSONB column is indexed.** The default is "no index" and each column
must *earn* one by naming a catalogued query that filters inside the
payload.

This is not conservatism for its own sake — it follows directly from the
DB4 design rule that produced these nine columns: **every invariant fact,
every guard input and every queryable attribute was extracted to a relational
column**, and the JSONB retains only the parts that are genuinely
heterogeneous or opaque. A JSONB index in this schema would almost always be
a sign that something queryable was left inside the payload by mistake.

Options considered per column: `no index` · `expression B-tree` on a single
extracted path · `GIN` (`jsonb_path_ops` or default) · **schema change
request** to promote a path to a column.

## 2. Review

### #1 `design_sessions.design_document` (COL-TBL025-03)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Read whole by session (PK / secret hash). |
| Relational duplicates | placement refs, schema version, autosave marker are all columns |
| Size / write rate | editor budget `[cfg]`; **written on every autosave** — the highest update rate in the schema |
| Security | customer content, PII-adjacent; session is hard-TTL |
| Decision | **No index** |
| Justification | A GIN index on a document rewritten on every keystroke-level save would be the single most expensive index in the system — GIN maintenance on a large rewritten value on the hottest update path. No query would use it. |

### #2 `design_versions.design_document` (COL-TBL028-05)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Opaque; the queryable fact is `document_hash` (COL-TBL028-07), a **column**. |
| Relational duplicates | hash, placement refs, physical dims — all columns |
| Size / write rate | frozen at send; effectively insert-only |
| Security | frozen customer content |
| Decision | **No index** |
| Justification | **Explicitly prohibited by the DB5 task and by design.** GRD-007 compares `document_hash` — a `text` column already covered by the row lookup. Indexing the document would add nothing that the hash column does not already answer, and INV-32 reproducibility depends on canonicalization, not on any index. |

### #3 `design_template_versions.design_document` (COL-TBL035-03)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Cloned whole at template instantiation. |
| Relational duplicates | `(template, version)` unique, `published_at` |
| Size / write rate | new version per change; tiny table |
| Decision | **No index** |

### #4 `outbox_events.payload` (COL-TBL073-03)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Claims filter on `status` / `next_attempt_at` — relational columns. |
| Relational duplicates | `event_type`, `aggregate_kind`, `aggregate_id`, dispatch state — all columns |
| Size / write rate | **highest-write table in the system** |
| Security | redacted by construction — no OTP/tokens/provider bodies |
| Decision | **No index** |
| Justification | **Explicitly prohibited.** Operationally filtering the outbox by payload contents is forbidden when relational metadata already exists (ADR-DB4-004 #4). A GIN index here would tax the polled hot path to serve a query that must not exist. |

### #5 `idempotency_records.result` (COL-TBL074-05)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Replayed whole after a unique probe on `(operation_namespace, scope_key)`. |
| Relational duplicates | uniqueness key, `fingerprint`, `status`, `expires_at` — the invariant fields are all columns |
| Size / write rate | minimal-result rule (ADR-DB1-017 r4); high-write, transient |
| Decision | **No index** |

### #6 `payment_provider_events.redacted_payload` (COL-TBL056-06)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Reconciliation (Q-16) filters on `provider_key`, `provider_event_ref`, `amount`, `currency_code`, `signature_valid`, `application_outcome`, `received_at` — **all columns**. |
| Relational duplicates | every verification fact is already a column (ADR-DB4-004 #6) |
| Size / write rate | bounded evidence; append-heavy |
| Security | **redacted** — no secrets, no PAN, no signatures beyond the verification outcome |
| Decision | **No index** |
| Justification | This is the column most likely to tempt a "search the raw callback" index during an incident. It must not exist: the payload is redacted evidence, and indexing it would create a query path over provider data that the redaction rule exists to prevent. Reconciliation forms (a)–(d) are fully served by IDX-043/079/080/081. |

### #7 `audit_events.summary` (COL-TBL072-07)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Q-29 filters on actor / action / target / time — all columns. |
| Relational duplicates | `actor_kind`, actor refs, `action`, `target_kind`, `target_id`, `occurred_at`, `correlation_id` |
| Size / write rate | summary-only rule; append-only, unbounded |
| Security | redacted, masked contacts |
| Decision | **No index** |
| Justification | A GIN index on an unbounded append-only table for "search inside audit summaries" is a reporting feature nobody has requested. If before/after search is ever required, the correct move is a **schema change request** to extract the searched field to a column — not a GIN index over redacted summaries. |

### #8 `notification_intents.params` (COL-TBL070-06)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Ops filter on `status`, `template_key`, `template_version`, `channel` — columns. |
| Relational duplicates | recipient ref, masked copy, status, template — all columns |
| Size / write rate | small by construction; high churn |
| Security | **structural exclusion of OTP / tokens / link URLs** (D7-12) |
| Decision | **No index** |
| Justification | Indexing params would create a search path over notification content whose safety depends entirely on an exclusion rule holding perfectly. The relational columns answer every operational question. |

### #9 `policy_configuration_versions.value` (COL-TBL077-03)

| Aspect | Finding |
|---|---|
| Query requirement | **None.** Read whole per `config_key` → `current_version_id` pointer. |
| Relational duplicates | `config_key`, `version`, `effective_from` — columns |
| Size / write rate | small; insert-only |
| Security | no secrets in config values |
| Decision | **No index** |

## 3. Result

| Column | Decision |
|---|---|
| #1 design_sessions.design_document | no index |
| #2 design_versions.design_document | no index (**prohibited**) |
| #3 design_template_versions.design_document | no index |
| #4 outbox_events.payload | no index (**prohibited**) |
| #5 idempotency_records.result | no index |
| #6 payment_provider_events.redacted_payload | no index |
| #7 audit_events.summary | no index |
| #8 notification_intents.params | no index |
| #9 policy_configuration_versions.value | no index |

**9 of 9 → no index.** Zero GIN indexes, zero JSONB expression indexes,
zero schema change requests arising from JSONB.

Recorded as **IDX-R10** in
[`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md) §5.

## 4. Why the result is unanimous

This is a stronger outcome than "we decided to be careful", and the reason
is structural: ADR-DB4-004 admitted a column to the JSONB set **only if**
its invariant-bearing facts had been extracted to relational columns first.
Nine columns passed that filter, so by construction none of them holds a
fact worth filtering on. A JSONB index requirement appearing later would
therefore be evidence of a **DB4 extraction gap**, not of a missing index —
and the correct response would be a schema change request
([`DB5_SCHEMA_CHANGE_REQUESTS.md`](./DB5_SCHEMA_CHANGE_REQUESTS.md)),
promoting the path to a typed column with its own constraints.

## 5. If a JSONB query requirement ever appears

Locked escalation order:

1. **Confirm the fact is not already a column.** In this schema it usually is.
2. **Raise a schema change request** to promote the path to a typed column —
   preferred, because it gets a type, a CHECK, and a plain B-tree.
3. **Expression B-tree** on a single extracted path — acceptable when the
   path is stable, single-valued, and the table is not write-hot.
4. **GIN** (`jsonb_path_ops` for containment-only workloads) — last resort,
   never on `outbox_events`, `design_sessions`, `idempotency_records` or
   `audit_events`.

Any of steps 2–4 requires an ADR with the query evidence.

## 6. Validation handoff

- **DB7:** scan asserting exactly these 9 JSONB columns exist and no other
  (ADR-DB4-004 closed set); D7-12 asserts no OTP/token/URL in
  `notification_intents.params`; D7-15 asserts hash reproducibility depends
  on canonicalization (ADR-DB1-012 vectors), not on any index.
- **DB10:** if any GIN index ever appears in `pg_indexes`, it is a
  governance violation to be raised, not a tuning outcome.
