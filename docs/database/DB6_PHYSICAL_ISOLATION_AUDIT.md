# DB6 Physical Isolation Audit (S24-P0)

Scope: every table with zero physical foreign keys (incoming or outgoing), produced live
against a disposable database carrying all 30 migrations (`embroidery_s24_fresh`). This is
the S24-P0 preflight required before the DB6-S24 trigger migration.

## 1. Method

```sql
select c.relname, count(*) filter (where pf.confrelid = c.oid) as incoming,
       count(*) filter (where pf.conrelid = c.oid) as outgoing
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_constraint pf on pf.contype = 'f'
  and (pf.conrelid = c.oid or pf.confrelid = c.oid)
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname;
```

Degree-zero result set (both incoming = 0 and outgoing = 0): `redirect_rules`,
`content_pages`, `idempotency_records`, `background_job_attempts`, `outbox_events`,
`policy_configurations`. `notification_intents` has zero physical FKs on its own row but is
not degree-zero in the graph sense (it is the parent of `notification_delivery_attempts`).

## 2. Classification

| Table | Class | Rationale | Application owner | DB7 owner | Retention owner |
|---|---|---|---|---|---|
| `redirect_rules` | C — path/configuration table | `target_path` is a URL-layer pointer that can address content pages, products, galleries, or external routes; a single FK would over-constrain the model. Integrity is `uq_redirect_rules__source_path` + `ck_redirect_rules__kind_allowed`; loop/cycle detection is an application/config validation, not a DB constraint. | routing service | DB7 redirect resolution tests | not retention-managed (config-lifetime) |
| `content_pages` | A — aggregate root, no required parent | Looked up by `page_type`/`slug`/`status`; not a child of any other table by design. | content module | DB7 content-page tests | retain (content lifetime) |
| `idempotency_records` | B — platform primitive | `scope_key` is a generic string scoped by `operation_namespace`, not a reference to one aggregate; `fingerprint`/`status`/timestamps are the arbiter (CST-048). No polymorphic FK is meaningful across every possible operation. | platform/idempotency middleware | DB7 idempotency tests | TTL-expired, worker-owned cleanup |
| `background_job_attempts` | D — generic append-only evidence | `job_key` spans multiple job kinds; there is no single target table. Append-only (CST-098), enforced by `trg_background_job_attempts__reject_mutation`. | job runner / worker app | DB7 background-job tests | retention-exempt DELETE via `app.bypass_retention_trigger` |
| `outbox_events` | E — polymorphic logical reference (REL-104) | `aggregate_kind`/`aggregate_id` intentionally has no physical FK — one outbox table serves every aggregate. Column-scoped mutation enforced by `trg_outbox_events__reject_mutation`. | outbox dispatcher worker | DB7 outbox dispatch tests | retention-exempt DELETE (TTL cleanup, S25) |
| `policy_configurations` | A — aggregate root header | Owns identity (`config_key`) and a pointer (`current_version_id`) to its own version table; a policy change is an append to `policy_configuration_versions`, never an overwrite of the header's value. | admin/config module | DB7 policy tests | retain |
| `notification_intents` | E (partial) — linked internally, two intentional no-FK edges | Is the parent of `notification_delivery_attempts` (physical FK, RESTRICT). Its own `recipient_contact_point_id` and `source_outbox_event_id` are deliberately no-FK, formalized by DEV-DB6-016: the outbox row is transient evidence, the notification intent is the durable fact, and the contact point may be edited/removed independently of historical intents. | notification module | DB7 notification tests | retain (durable fact); source outbox row may be cleaned independently |

No table in this set is class **F** (physical design defect). No FK is added by S24 or any
future slice solely to make a diagram fully connected — every absence above has a named
canonical rationale, an owner, and (where applicable) a retention path.

## 3. DEV-DB6-017 final reconciliation (independent re-derivation)

Re-derived from structured sources, not group-delta arithmetic:

- Canonical `REL-*` rows (DB4 relationship inventory): 92 rows.
- Expanded to individual edges (multi-target rows counted per target): 164 logical edges —
  unchanged, `tools/db-metric-check.mjs`'s `EXPECTED_FK_EDGES` still asserts 164 and passes.
- Of the 164 logical edges, exactly **2** are canonical no-FK-by-design polymorphic
  exceptions: REL-103 (`audit_events.target_kind/target_id`) and REL-104
  (`outbox_events.aggregate_kind/aggregate_id`).
- Of the remaining 162 candidate-physical edges, deferred-edge ledger review
  (`tools/db-deferred-owner-check.mjs`, 7 rows, all resolved) plus DEV-DB6-010/012/013/014's
  corrective edges plus REL-105's 10/10 actor-edge subset (TBL-042:3, TBL-045:3, TBL-063:1,
  TBL-072:3) account for every edge that is physical today.
- Live count on `embroidery_s24_fresh` after all 30 migrations: **160** physical FK
  constraints (`pg_constraint` where `contype='f'`, `public` schema).
- Gap: 162 candidate edges − 160 live edges = 2. Both of the missing 2 are **not** missing —
  they are REL-099 (`notification_intents.recipient_contact_point_id`) and REL-101
  (`notification_intents.source_outbox_event_id`), which DEV-DB6-016 already excludes from
  the physical-target denominator (they are logical, no-FK-by-design, same category as
  REL-103/104, just not originally counted as such at DB6-C4 time).

**Conclusion: 160/160 physical FK edges are accounted for. DEV-DB6-017's corrected ceiling
of 160 is confirmed by this independent re-derivation — no missing edge, no extra edge, no
change to the checker-enforced 164 logical count.** `DB6_RELATIONSHIP_COVERAGE_AUDIT.md` and
`DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` already read 160; no further edit needed.

## 4. Refunds mutability preflight

`refunds` (TBL-058) carries `updated_at` alongside a documented "state mutable + amounts
immutable" class. `tools/db-manifest-check.mjs`'s convention-column rule previously flagged
this as a violation because its regex matched the substring "immutable" inside the mixed
class label and blanket-forbade `updated_at`.

**Finding: documentation/checker defect, not a schema defect.** `refunds.updated_at` is
correct: CST-100 freezes only `amount`/`payment_attempt_id`/`order_id`/
`cancellation_request_id`/`currency_code`; `status`, `method`, `transfer_reference`,
`reason`, `customer_visible_reason`, `approved_by_admin_id`, `executed_by_admin_id`,
`approved_at`, `executed_at`, and `updated_at` remain mutable for the life of the row. The
checker's blanket "immutable ⇒ no updated_at" rule was written for fully-immutable/
append-only/column-scoped classes and never accounted for a *mixed* class where a mutable
subset coexists with a frozen subset.

**Resolution (fixed in this preflight, no schema change):** `tools/db-manifest-check.mjs`'s
`NO_UPDATED_AT` check now treats any mutability label containing both "mutable" and
"immutable" (a mixed class) as expecting `updated_at`, leaving the ban scoped to genuinely
whole-row immutable/append-only/column-scoped/`snap`/`ver` classes. Re-run: `[manifest] all
checks passed`, 0 problems. `refunds`' `updated_at` column is unchanged and correct; it is
the mutable side of the CST-100 column-scoped trigger implemented in this slice.

## 5. G19 commit traceability

- Commit: `d81d8a81088ecbce25ed3b6af4e85edea64b00c4`
- Subject: `feat(database): implement DB6 schema group G19`
- Author date: 2026-07-19 22:34:42 +0700
- Parent: `74eae23` (`docs(database): record DB6-G18 commit hash in group report`)
- Working tree at S24 preflight start: clean at HEAD `d81d8a8`, not pushed.
- Migration baseline: `0000`–`0029` present and byte-identical to their committed form
  (no edits made during S24); latest journal entry prior to S24 was idx 29.
