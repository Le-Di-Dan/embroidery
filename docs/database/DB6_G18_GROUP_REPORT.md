# DB6-G18 Group Report — Notification (CTX-NTF)

## A. Preflight

- Branch `production`, HEAD before this group: `9fd72e5`, tree clean.
- Commit chain confirmed present via `git log`, none amended: `bf17e41`
  (chore reconcile) → `04f352f` (docs hash fill-in) → `bc1c096` (feat G17) →
  `9fd72e5` (docs G17 hash fill-in).
- Migrations `0000`–`0027` byte-identical (only `0028_create_notification_
  tables.sql` and `meta/_journal.json`/`meta/0028_snapshot.json` are new;
  `git status` before generation showed a clean tree).
- `drizzle-kit check` clean before starting; Jest 99/99 passing before
  starting.
- Live pre-G18 baseline confirmed on a disposable database built from a
  trimmed `0000`–`0027` set: **75 tables, 797 physical columns, 156 FKs, 75
  PK, 49 UQ, 186 CHECK, 176 physical indexes, 34 physical partial indexes
  (13 unique + 21 performance)** — matches `DB6_INDEX_IMPLEMENTATION_
  MANIFEST.md` §7's "After G1..G17" row exactly.
- Relationship baseline confirmed: 164 logical edges, 162 physical FK
  targets, 156 implemented FKs (unchanged going in).
- Confirmed exact G18 scope = 2 tables (TBL-070/071); neither existed
  before this group; no G18 schema file, no G18 migration, `IDX-091`/
  `IDX-092` absent, `notification_intents.params` absent — all confirmed by
  grep against `src/schema/index.ts` and `migrations/` before writing code.
- Pre-G18 physical JSONB count derived live: **7** implemented (boundaries
  #1–#7, one column each, per `DB4_JSONB_PAYLOAD_MAP.md`'s 9-row closed
  set). Closed-set definitions remain exactly **9** — boundary #8
  (`notification_intents.params`) is this group's own delta, boundary #9
  is G19's scope, not yet landed.
- **Preflight minor reconciliation (§2.1):** resolved both G17 prose issues
  from the review — see `DB6_G17_GROUP_REPORT.md`'s two inline
  "(DB6-G18 preflight reconciliation, 2026-07-19)" notes: (1) the
  "797→751" phrasing is now stated unambiguously as pre-G17: 751 / delta:
  +46 / post-G17: 797; (2) the unbalanced "2-index" phrase is replaced with
  the exact 5 PK + 3 UQ + 2 explicit = 10 physical-index delta
  (166 → 176). No migration or live schema touched; documentation-only.
- Block conditions checked, none triggered: live G17 baseline matched
  physically; neither G18 table was partially created; canonical G18 scope
  (TBL-070/071, exactly 2 tables) did not conflict across
  `DB4_TABLE_CATALOG.md`, `DB4_COLUMN_DICTIONARY.md`, `DB6_SCHEMA_
  IMPLEMENTATION_MANIFEST.md` §3, and `DB6_RELATIONSHIP_COVERAGE_AUDIT.md`
  §3 (which had already pre-registered this group's exact Class-A/B/C/D
  counts: 3/0/0/0); every required relationship had a documented owner
  (REL-099/100/101, all pre-existing REL rows); no existing data anywhere
  could block a forward migration (both tables are new); the JSONB closed
  set did not exceed 9 (params is boundary #8 of 9); no provider-specific
  dependency was introduced (channel/provider stay explicitly open, per
  §B below). **No BLOCKED condition found — proceeding with G18.**

## B. G18 scope

**Group:** G18 — Notification (CTX-NTF), aggregate owner AGG-22.

**Tables:**

- TBL-070 `notification_intents` — root, mutable (`status`).
- TBL-071 `notification_delivery_attempts` — append child.

**Column metrics** (register: `column-metrics.ts`, verified by
`column-metrics.spec.ts`):

| Table | Logical IDs | Expansions | Business | Convention | Physical |
|---|---|---|---|---|---|
| `notification_intents` | 9 | 1 | 10 | 3 | 13 |
| `notification_delivery_attempts` | 6 | 0 | 6 | 2 | 8 |
| **G18 total** | **15** | **1** | **16** | **5** | **21** |

The one expansion is COL-TBL070-02 (`template_key`/`template_version`), one
logical concept realized as two physical columns — same pattern as every
other `×N` expansion in this register.

**Relationships:**

| REL | Edge | Required? | FK? | Delete behaviour | Notes |
|---|---|---|---|---|---|
| REL-099 | `notification_intents.recipient_contact_point_id` → `customer_contact_points` | no (nullable) | **no** (DEV-DB6-016) | n/a | live lookup ref; `recipient_masked` is the frozen evidence copy |
| REL-100 | `notification_delivery_attempts.intent_id` → `notification_intents` | yes | **yes**, restrict | restrict | the only physical FK this group adds; backed by IDX-092 |
| REL-101 | `notification_intents.source_outbox_event_id` → `outbox_events` | no (nullable) | **no** (DEV-DB6-016) | n/a | origin trace only; outbox rows are transient/cleaned |

164 logical edges / 162 physical FK targets are **unchanged** — neither
REL-099 nor REL-101 was ever counted toward the physical-FK-target side
(both were already documented "FK exists? no" in `DB4_RELATIONSHIP_AND_FK_
MODEL.md` before this group ran). 156 → **157** implemented physical FKs
(REL-100 only).

**Constraints:**

| CST/CON | Object | Table | Mechanism |
|---|---|---|---|
| CST-001 | `pk_notification_intents` | notification_intents | PK |
| CST-047 | `uq_notification_intents__intent_key` | notification_intents | UQ (backs IDX-057) |
| — | `ck_notification_intents__status_allowed` | notification_intents | CHECK, closed status tuple |
| CST-001 | `pk_notification_delivery_attempts` | notification_delivery_attempts | PK |
| — | `ck_notification_delivery_attempts__outcome_allowed` | notification_delivery_attempts | CHECK, closed outcome tuple |
| CST-098-class | (S24 target) | notification_delivery_attempts | append-only, not yet a DB mechanism |

**Indexes:**

| IDX | Table | Keys | Predicate | Tier | Status |
|---|---|---|---|---|---|
| IDX-057 | notification_intents | `(intent_key)` | — | required (UQ-backing) | implemented |
| IDX-091 | notification_intents | `(created_at, id)` | `status IN ('PENDING','PROCESSING')` | required | implemented |
| IDX-092 | notification_delivery_attempts | `(intent_id, attempted_at)` | — | required | implemented |

No deferred/rejected index in this group — both required-tier entries ship
with G18. Expected/actual physical-index delta: +5 (2 PK + 1 UQ + 2
explicit performance), +1 physical partial index (IDX-091 only).

**Notification fields — classification:**

- Business/idempotency identity: `intent_key` (CST-047/GRD-012
  `notification.intent`).
- Template key/version: `template_key` + `template_version` (JSONB
  discriminator, not embedded in `params`).
- Params JSONB: boundary #8, redacted typed references only.
- Channel: `channel` (both tables), open set — no CHECK (DEV-DB6-016).
- Recipient destination: `recipient_contact_point_id` (optional live ref,
  no FK) + `recipient_masked` (frozen snapshot, always present).
- Subject/aggregate context: **none** — no polymorphic column pair exists
  on either table (confirmed against `DB4_RELATIONSHIP_AND_FK_MODEL.md`;
  REL-103/104's polymorphic exception list does not include TBL-070/071).
- Status: `status` (5-value closed tuple, non-terminal PENDING/PROCESSING,
  terminal SATISFIED/FAILED/CANCELLED).
- Timestamps: `created_at`/`updated_at` (intent, convention);
  `attempted_at`/`created_at` (attempt — `attempted_at` is the business
  fact, `created_at` the row-insert convention column).
- Provider abstraction: `provider_message_ref` (opaque, nullable) — no
  `provider_key` column; provider adapters are entirely App/worker-side.
- Attempts/outcomes: `outcome` (3-value closed tuple, one fact per
  append-only row, "not a machine" per DB4).
- Retry/failure evidence: `error_class` (bounded, nullable).
- Correlation: `correlation_id` on the intent.
- Retention/redaction: hard-TTL operational class (`ADR-DB2-003` rule 6);
  attempts deleted with their parent intent; no bodies/secrets stored, so
  no redaction pass is needed on these tables specifically.
- Sensitive-data classification: `cpriv(min)` — masked recipient copy only,
  no OTP/token/secret/full-body anywhere in either table.

**Dependencies:**

- Outbox: `source_outbox_event_id` is a nullable origin trace only —
  Notification never depends on the outbox row still existing.
- Customer/contact: `recipient_contact_point_id` (optional, no FK) +
  `recipient_masked` (frozen).
- Order/Request/Payment/Production: **no direct reference** — DB4 confirms
  neither notification table carries a subject/aggregate column; the
  originating business context is captured only in `params` as a typed
  reference (App-owned), never as a DB relationship.
- Idempotency: self-contained via `intent_key` (CST-047) — does **not**
  reuse `idempotency_records`.
- Background jobs: none directly; worker claim uses IDX-091's predicate,
  same shape as `background_job_attempts`'s claim path but not FK-linked.
- Future Audit (G19): none yet — no `audit_events` reference exists on
  either table; TR-NTF-05 (terminal failure → audit) is worker/App-owned.

No blocking condition applied: Notification Intent and Outbox ownership
are cleanly separated (§D below); recipient authority is exactly the dual
model DB4 specifies; no full message body is persisted anywhere; the
JSONB params boundary is exact (#8 of 9); no provider-specific field is
required (channel/provider both stay open per DEV-DB6-016); no Class-D
relationship ambiguity exists; no G18 target belongs to G19; idempotency
ownership is singular (`intent_key`, not duplicated onto
`idempotency_records`).

## C. Implementation

- **`src/schema/notification/notification-intents.ts`** — `notificationIntents`
  table. `NOTIFICATION_INTENT_STATES` tuple (`PENDING`, `PROCESSING`,
  `SATISFIED`, `FAILED`, `CANCELLED`) drives both the CHECK and IDX-091's
  predicate from one canonical source (DB5-A09). `intentKey` is UQ
  (CST-047/IDX-057). `recipientContactPointId`/`sourceOutboxEventId` are
  bare nullable columns with no `foreignKey()` (DEV-DB6-016). `params` is
  `jsonb().notNull()`, boundary #8, discriminated by the separate
  `templateVersion` column, never embedded inside the JSONB itself.
- **`src/schema/notification/notification-delivery-attempts.ts`** —
  `notificationDeliveryAttempts` table, append-only (`sequenceColumn()`
  PK, no `updated_at`). `NOTIFICATION_DELIVERY_OUTCOMES` tuple
  (`DELIVERED`, `FAILED_RETRYABLE`, `FAILED_TERMINAL`) drives the outcome
  CHECK. `intentId` is the group's one real physical FK, restrict, backed
  by IDX-092 `(intent_id, attempted_at)`.
- **Recipient/template/params:** recipient is dual (optional live FK-less
  reference + always-present masked snapshot); template identity is
  `template_key` + `template_version`, never a free-form rendered body;
  `params` is redacted typed references only, structurally excluding
  OTP/tokens/secure-link URLs/provider payloads (verified in §G's security
  scan below).
- **Idempotency/retry evidence:** `intent_key` (CST-047) is the sole
  arbiter; no retry-count/backoff/dead-letter column exists on either
  table because DB4 does not define one — those facts, if any, are
  App/worker-owned runtime state, not invented here.
- **Constraints:** PK ×2, UQ ×1 (intent_key), CHECK ×2 (status/outcome
  closed tuples) — all listed in §B above.
- **Indexes:** IDX-057 (UQ-backing), IDX-091 (partial performance),
  IDX-092 (non-partial performance) — all listed in §B above.
- **Migration:** single generated file, `0028_create_notification_tables.
  sql` — 2 `CREATE TABLE`, 1 `ALTER TABLE ADD CONSTRAINT` (the REL-100 FK),
  2 `CREATE INDEX`. No custom SQL: zero header↔child import cycles
  (`notification-delivery-attempts.ts` imports only `notification-intents.
  ts`, which imports nothing from this group).
- **Deviations:** `DEV-DB6-016` (new) — formalizes the two intentional
  no-FK references (REL-099, REL-101) and the intentionally-uncontracted
  `channel` column (open per ADR-DB2-003 rule 4 / DEC-25 / O-005). No
  denominator change on any axis.

## D. Integrity handoff

- **Outbox boundary:** `outbox_events` and `notification_intents` remain
  fully separate concepts — the outbox is a transient transport trigger
  (deleted after processing), Notification Intent is the durable
  domain record. `source_outbox_event_id` is a one-way, nullable origin
  trace with no FK; nothing here duplicates the outbox payload, adds a
  notification status field to `outbox_events`, or lets a trigger flip
  `outbox_events.status` from Notification state (none exists).
- **Recipient snapshot/FK boundary:** `recipient_contact_point_id` is an
  optional live lookup; `recipient_masked` is the frozen, always-present
  evidence copy that survives contact-point anonymization/merge. Neither
  column is a `customer_id` FK; no Customer is ever auto-created from a
  Notification write (no code path exists for it — schema-level fact).
- **Template-version authority:** `template_version` is the exact
  historical rendering-version stamp (Class F value copy, no FK to a
  mutable template-configuration table); no new template table was
  invented in G18; rendering from `template_key`/`template_version`/
  `params` is entirely worker/App behaviour.
- **Provider abstraction:** no provider is chosen (O-005 untouched);
  `provider_message_ref` is opaque evidence only, never authoritative
  state, never a full response body; `channel` carries no closed-set CHECK
  because DB4/ADR-DB2-003 leave the channel/provider enumeration open
  (DEV-DB6-016).
- **Worker idempotency:** `intent_key` (CST-047) collapses duplicate
  outbox deliveries onto one intent, self-contained — no dependency on
  `idempotency_records`.
- **Append-only target:** `notification_delivery_attempts` has no
  `updated_at` and no reject-UPDATE/DELETE trigger yet — same
  honestly-documented gap as every other append-only table pending S24;
  this group implements only the CHECK/FK/index layer.
- **DB7/DB8 handoffs:** DB7 owns invalid-state/outcome CHECK tests, the
  no-secret-shaped-field assertion on `params`/`error_class`, and the
  DEV-DB6-016 "stays unconstrained" regression check; DB8 owns the
  multi-worker `SKIP LOCKED` race proof (this group only structurally
  smoke-tested the claim path — see §G).

## E. Metrics (live catalog, `embroidery_g18_fresh`)

```text
groups complete:                 18 / 19
tables implemented:              77 / 78

logical COL IDs:                528
logical expansions:               89
business columns:                617
convention columns:              201
physical columns:                818

logical relationship edges:      164
physical FK targets:             162
physical FKs implemented:        157 / 162

PK constraints:                   77
FK constraints:                  157
UNIQUE constraints:               50
CHECK constraints:               188

physical indexes:                181 / 211
physical partial indexes:         35 / 45
partial unique:                   13 / 13
partial performance:              22 / 32

JSONB boundary definitions:        9 / 9
physical JSONB columns:            8 / 9

Applied migrations:               28
Latest migration:               0028
```

Every number above is read directly from `pg_class`/`pg_index`/
`pg_constraint`/`information_schema` on the disposable
`embroidery_g18_fresh` database (built empty → `0028`), not hand-added.
G18's own delta from the pre-G18 baseline (§A): +2 tables, +21 physical
columns, +1 FK, +2 PK, +1 UQ, +2 CHECK, +5 physical indexes, +1 physical
partial index, +1 physical JSONB column.

## F. A-status

- **A03** (partial indexes): 35/45 implemented, 13/13 partial-unique,
  22/32 partial-performance, 0 volatile predicates. G18 delta: IDX-091 = +1
  partial performance; IDX-092 = non-partial (as expected, per §B).
- **A08** (money scale): unaffected — no money field in this group;
  A08 remains closed.
- **A09** (state/type parity): `NOTIFICATION_INTENT_STATES` (5 values) and
  `NOTIFICATION_DELIVERY_OUTCOMES` (3 values) are each declared once as a
  `const` tuple, consumed by the CHECK, the TypeScript union, and (for
  intents) IDX-091's predicate — byte-identical parity confirmed by
  reading the live CHECK definitions in §G.
- **A10** (mutability): `notification_intents` is mutable (`status` and
  its timestamps only, per DB4); `notification_delivery_attempts` is
  append-only, no `updated_at`. S24 target recorded for the attempts
  table; DB7 owns the reject-UPDATE/DELETE regression test once S24 lands.
- **A11** (index coverage): +5 physical index delta this group; post-G18
  181/211.
- **A12**: no measured performance claim made; DB9 owns `EXPLAIN`
  validation.
- **A15**: no GIN index, no PII index, no speculative provider/dashboard
  index added; both indexes in this group are exactly the two catalog
  entries (IDX-091, IDX-092), nothing invented.
- **JSONB**: closed-set definitions remain 9/9; physical JSONB columns
  implemented moves 7 → **8**/9 (boundary #8, `notification_intents.
  params`, this group's delta). Boundary #9 remains G19's scope.

## G. Validation

- **Static:** `tsc --noEmit` clean; `eslint .` clean; `prettier --check`
  clean on both new files; Jest 99/99 (column-metrics register + spec
  balance for both new rows; database-config spec unaffected); file sizes
  107 and 69 lines, both well under the 400-line hard limit.
- **Fresh disposable install** (`embroidery_g18_fresh`, empty → `0028`):
  77 tables, 818 columns, 157 FKs, 77 PK, 50 UQ, 188 CHECK, 181 physical
  indexes, 35 partial indexes, 8 physical JSONB columns — all exactly as
  reported in §E. `notification_intents.params` present as `jsonb`; no
  tenth JSONB column exists anywhere in the schema. `IDX-091`'s predicate
  read back verbatim as `status = ANY (ARRAY['PENDING'::text,
  'PROCESSING'::text])`; `IDX-092`'s keys read back as
  `(intent_id, attempted_at)`, no predicate. No G19 table (`audit_events`)
  present. `drizzle-kit check` → "Everything's fine 🐶🔥". Journal/meta
  correct (28 entries, permanent idx-17 gap preserved). Dropped after
  verification.
- **Disposable G17-prefix upgrade** (`embroidery_g18_upgrade`): applied a
  trimmed `0000`–`0027` set first, confirmed the exact pre-G18 baseline
  (75 tables / 797 columns / 156 FKs / 75 PK / 49 UQ / 186 CHECK / 176
  indexes / 34 partial indexes) live before seeding. Seeded one `customers`
  row, one `customer_contact_points` row (verified, primary), and one
  `outbox_events` row via the real config's schema, then applied the real
  `0028` migration. All three pre-existing rows survived unchanged
  (byte-identical `id`s re-queried post-migration). Inserted one valid
  `notification_intents` row referencing the seeded contact point (no FK,
  by design) and the seeded outbox row's `id` as `source_outbox_event_id`
  (no FK, by design), plus one valid `notification_delivery_attempts` row
  against it. No destructive rebuild; old migration files untouched
  (checksums match `git diff` showing zero change to `0000`–`0027`).
  `drizzle-kit check` → clean. Dropped after verification. **Persistent
  dev database (`embroidery`, 75 tables) was never touched by this test.**
- **Reapply/drift:** a second `drizzle-kit check` on both disposable
  databases reported "Everything's fine 🐶🔥"; `drizzle-kit generate`
  against the final schema reported "No schema changes, nothing to
  migrate" — confirming the committed migration is complete and no
  duplicate object exists.
- **Physical parity:** exact 2-table, 21-column, 1-FK, 2-CHECK, 1-UQ,
  5-index (2 PK-backing + 1 UQ-backing + 2 explicit performance) match
  between the schema, the generated migration, and both live disposable
  databases — no hand arithmetic, all read from `pg_class`/`pg_index`/
  `pg_constraint`.
- **Behavioral smoke** (15 cases against `embroidery_g18_fresh`, generated
  case table, not hand-counted):

  | Case | Setup/operation | Expected | Actual | PASS/FAIL |
  |---|---|---|---|---|
  | 1 | valid intent insert | success | `INSERT 0 1` | PASS |
  | 2 | duplicate `intent_key` | `23505` | unique violation on `uq_notification_intents__intent_key` | PASS |
  | 3 | invalid `status` literal | `23514` | CHECK violation on `ck_notification_intents__status_allowed` | PASS |
  | 4 | missing `recipient_masked` | `23502` | NOT NULL violation | PASS |
  | 5 | uncatalogued channel literal (`ZALO`) accepted | success (open set, no CHECK) | `INSERT 0 1` | PASS |
  | 6 | valid delivery attempt | success | `INSERT 0 1` | PASS |
  | 7 | dangling `intent_id` FK | `23503` | FK violation on `fk_notification_delivery_attempts__intent_id` | PASS |
  | 8 | invalid `outcome` literal | `23514` | CHECK violation on `ck_notification_delivery_attempts__outcome_allowed` | PASS |
  | 9 | `FAILED_RETRYABLE` attempt with `error_class` | success | `INSERT 0 1` | PASS |
  | 10 | non-JSON `params` literal | `22P02` | invalid JSON input | PASS |
  | 11 | UPDATE an existing attempt row | success (no S24 trigger yet — documented gap, not a false claim of enforcement) | `UPDATE 1` | PASS (honest gap) |
  | 12 | DELETE an intent with existing attempts | `23503` | FK violation on `fk_notification_delivery_attempts__intent_id` (restrict) | PASS |
  | 13 | no-FK columns accept unresolvable values (`recipient_contact_point_id`, `source_outbox_event_id`) | success | `INSERT 0 1` | PASS |
  | 14 | `IDX-091` used by the planner for the QX-03 predicate | Bitmap Index Scan on `ix_notification_intents__created_id__claimable` | confirmed via `EXPLAIN` | PASS |
  | 15 | worker-claim structural lock (`FOR UPDATE SKIP LOCKED` on the IDX-091 ordering) | one row returned, no error, rolled back cleanly | confirmed | PASS |

  15/15 PASS. No exactly-once delivery claim made anywhere in this suite;
  case 15 is a structural smoke test only — DB8 owns the actual multi-
  worker race proof.
- **Worker lock smoke:** case 15 above; `IDX-091`'s `(created_at, id)`
  ordering was used directly by the `FOR UPDATE SKIP LOCKED` query, no
  volatile predicate (`now()`) anywhere in the index definition.
- **Security/privacy scan:** grepped both schema files and the generated
  migration for `otp`, `token`, `password`, `secret`, `api_key`,
  `signing_secret`, `payload` (raw-provider-payload sense),
  `authorization`, `cookie` — zero matches beyond the intentionally-named
  `provider_message_ref` (opaque reference, not a payload) and the
  structural JSONB comment text itself. `params` is `jsonb NOT NULL` with
  no default content and no GIN index; no PII search index exists on
  `recipient_masked` or `recipient_contact_point_id`.
- **Persistent dev DB untouched:** confirmed both before and after this
  group's work — `embroidery` remained at 75 tables throughout; all
  fresh-install and upgrade testing ran exclusively against
  `embroidery_g18_fresh`/`embroidery_g18_upgrade`, both dropped after use.

## H. Commits

```text
<pending — filled in after commit>
```

Maximum 2 commits, no amend, no squash, no push, no G19 work.

## I. Verdict

```text
DB6-G18      PASS
OVERALL DB6  IN PROGRESS
```
