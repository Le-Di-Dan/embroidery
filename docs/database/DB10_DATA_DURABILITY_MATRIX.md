# DB10 — Data Durability & Retention Classification Matrix

**Created:** DB10-CP0. Covers **78 / 78** tables. Zero unowned rows.

Sources: `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md` (retention class and
delete category), `DB2_DATA_CLASSIFICATION_MAP.md` (sensitivity),
`DB6_S24_TRIGGER_REPORT.md` plus a live `pg_trigger` dump taken at CP0 (the
authoritative DELETE policy per table), and `DB9_DB10_HANDOFF.md` §1/§4
(volume and index footprint).

## Legend

**Durability class**
`critical` — losing it loses commercial/legal truth; `important` — losing it
degrades operations but the truth survives elsewhere; `reconstructible` —
regenerable from other state or safely re-derived; `transient` — expected to
be discarded.

**Backup requirement** — every table is inside the full logical backup
(there is no partial-backup policy). The column says how much its loss
matters, not whether it is included.

**Restore priority** — `P1` must exist before the system means anything;
`P2` needed for correct operation; `P3` can lag.

**S24 DELETE policy** — taken from the live catalog, not from prose:
`reject` = the trigger refuses DELETE unconditionally, no exemption exists;
`retention_exempt` = DELETE is refused unless the session sets
`app.bypass_retention_trigger = 'on'`; `—` = no trigger, ordinary DELETE
rules and FK constraints apply.

> **Critical distinction, established at CP0.** A `retention_exempt` DELETE
> policy is a *mechanism* that says "a retention job may reach this table",
> **not** a policy statement that the rows should ever be deleted.
> `audit_events`, `inventory_ledger_entries`, `payment_provider_events` and
> `payment_reconciliations` all carry `retention_exempt` while
> `DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md` classifies them **retain**. The
> trigger layer is therefore deliberately broader than the retention policy,
> and the retention job must restrict itself by an explicit code-level
> allowlist rather than trusting the trigger to stop it. DB10-CP4 implements
> and tests exactly that.

## 1. Identity & administration

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `admin_accounts` | critical | P1 | comm — retain | retain; DISABLED rows kept for audit lineage | — | sec (high) | row count + at least one enabled account | identity |
| `admin_credentials` | critical | P1 | comm — retain | retain | — | sec (high) — hashes only, never logged | row count; hash column never printed by any tool | identity |
| `admin_sessions` | transient | P3 | oper — hard-TTL | delete past `expires_at`/`revoked_at` | — | sec | may be empty after restore without harm | identity |
| `customers` | critical | P1 | comm + **anonymize** | field scrub after retention window; hard delete only if standalone and unreferenced | — | cpriv (high) | row count + referential parity with orders | customer |
| `customer_contact_points` | critical | P1 | comm + **anonymize** | scrubbed with the customer | — | cpriv (high) | count parity with `customers` | customer |
| `business_profiles` | important | P2 | comm + anonymize | scrubbed with the customer | — | cpriv (med) — tax/business ids | row count | customer |
| `customer_owned_products` | important | P2 | comm — retain | retain | — | cpriv | row count | customer |
| `contact_verification_challenges` | transient | P3 | trans — hard-TTL (family) | delete at terminal state / `expires_at`; attempts go with the challenge | — | sec (high) — hashed secrets | may be empty after restore | customer |
| `contact_verification_attempts` | transient | P3 | trans — hard-TTL | deleted with the parent challenge | `retention_exempt` | sec | — | customer |
| `customer_merge_cases` | critical | P2 | comm — retain | retain (merge evidence) | — | cpriv | row count | customer |
| `customer_merge_events` | critical | P2 | comm — retain | retain (merge evidence) | `retention_exempt` | cpriv | append chain intact | customer |
| `secure_access_grants` | important | P2 | oper — retain evidence | terminal + grace `[cfg]`; token hash retained as evidence | — | sec (high) — token hash never logged | row count | identity |

## 2. Catalog & inventory

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `categories` | critical | P1 | comm — **archive** | `archived_at` + status; hard delete only if never published and unreferenced | — | public | row count | catalog |
| `products` | critical | P1 | comm — archive | as above; children archive with the parent | — | public | row count + slug uniqueness | catalog |
| `product_variants` | critical | P1 | comm — archive | archived with product | — | public | count parity | catalog |
| `skus` | critical | P1 | comm — archive | archived with product | — | internal | count parity | catalog |
| `product_sides` | critical | P1 | comm — archive | archived with product | — | public | count parity | catalog |
| `embroidery_areas` | critical | P1 | comm — archive | archived with product | — | public | count parity | catalog |
| `product_media` | important | P2 | comm — archive | archived with product | — | public | count parity | catalog |
| `sku_stocks` | critical | P1 | comm — retain | never deleted; corrections are new ledger entries | — | internal | count parity with `skus`; non-negative invariant | inventory |
| `inventory_ledger_entries` | **critical** | P1 | comm — **retain** (commercial record) | **never deleted by policy**, despite the exemption below | `retention_exempt` | internal | append chain sums to stock deltas | inventory |
| `inventory_soft_holds` | important | P3 | oper — prune terminal | terminal + window `[cfg]`; ledger rows always retained | — | internal | may be empty after restore | inventory |
| `inventory_reservations` | critical | P1 | comm — retain | retain | — | internal | count parity with orders | inventory |

## 3. Assets

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `assets` | critical | P1 | per kind — **tombstone two-phase** | decision → worker deletes the binary → `deleted_at`; the metadata row is never deleted before its binary | — | mixed; customer uploads and store originals are high | row count; **storage keys must resolve against object storage — a database restore alone does not restore binaries** | asset |
| `asset_derivatives` | reconstructible | P3 | per kind — tombstone | tombstoned with the parent | — | public (derivatives only) | regenerable from the original | asset |
| `asset_inspections` | important | P3 | oper — hard-TTL | delete past window `[cfg]` | `retention_exempt` | internal | may be empty after restore | asset |

> **Cross-system recovery gap, recorded rather than glossed:** `assets` rows
> reference object-storage keys. A PostgreSQL restore recovers the
> *references*, never the bytes. Any real recovery plan must restore the
> object store to a consistent point as well, or the database will
> confidently point at objects that no longer exist. Owner: infrastructure —
> and the object-storage product is still an open decision (`CLAUDE.md` §8).

## 4. Design

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `design_sessions` | transient | P3 | trans — **hard-TTL** | anonymize-then-delete after `last_activity_at` + TTL (O-008) | — | cpriv (med) — customer IP in the document | may be empty after restore | design |
| `design_session_assets` | transient | P3 | trans — hard-TTL | deleted with the session; referenced uploads survive via `assets` | — | cpriv | — | design |
| `design_cases` | critical | P1 | comm — retain | retain | — | cpriv (high) | row count | design |
| `design_versions` | **critical** | P1 | comm — retain (immutable history) | **never deleted** (REQ-DVER-005) | `reject` | cpriv (high) | count + frozen-column integrity | design |
| `design_version_assets` | critical | P1 | comm — retain | retain | — | cpriv | count parity | design |
| `design_reviews` | critical | P2 | comm — retain | retain | `retention_exempt` | cpriv | append chain intact | design |
| `approval_snapshots` | **critical** | P1 | comm — retain | never deleted while the commercial record exists; break-glass redaction only | `reject` | cpriv + fin (high) — contains a contact snapshot | count + immutability probe | design |
| `approval_snapshot_thread_colors` | critical | P1 | comm — retain | as parent | `reject` | cpriv | count parity | design |
| `approval_snapshot_agreement_acceptances` | critical | P1 | comm — retain | as parent | `reject` | cpriv | count parity | design |
| `design_templates` | important | P2 | archive | admin archive | — | internal/public listing | row count | design |
| `design_template_versions` | important | P2 | archive | versions retained for clone provenance | `reject` once published | internal | count; published rows frozen | design |
| `design_template_assets` | important | P3 | archive | with the version | — | internal | count parity | design |

## 5. Requests & orders

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `custom_requests` | critical | P1 | comm — retain | terminal states are states, not deletions; PII leaves via customer anonymization | — | cpriv | row count | order |
| `custom_request_quantity_breakdowns` | critical | P1 | comm — retain | retain | — | cpriv | count parity | order |
| `custom_request_assets` | critical | P2 | comm — retain | retain | — | cpriv | count parity | order |
| `custom_request_transitions` | critical | P2 | comm — retain | retain | `retention_exempt` | internal | append chain intact | order |
| `request_moderation_notes` | important | P2 | comm — retain | retain | `retention_exempt` | cpriv (med) — notes may contain PII | append chain intact | order |
| `orders` | **critical** | P1 | comm — retain | retain | — | fin (high) | row count; every order reachable from its quotation | order |
| `order_items` | **critical** | P1 | comm — retain | **immutable, never deleted** | `reject` | fin (high) | count parity; immutability probe | order |
| `order_transitions` | critical | P2 | comm — retain | retain | `retention_exempt` | internal | append chain intact | order |
| `order_cancellation_requests` | critical | P2 | comm — retain | retain | — | fin | row count | order |

## 6. Quotation & payment

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `quotations` | critical | P1 | comm — retain | retain | — | fin (high) | row count | quotation |
| `quotation_versions` | **critical** | P1 | comm — retain | sent versions immutable, never deleted | `reject` once past DRAFT | fin (high) | count; frozen-column probe | quotation |
| `quotation_line_items` | critical | P1 | comm — retain | freeze inherited structurally from the parent version | — | fin | count parity; deposit + remaining = total | quotation |
| `quotation_acceptances` | **critical** | P1 | comm — retain | legal acceptance evidence | `retention_exempt` | fin (high) | append chain intact |quotation |
| `payment_obligations` | **critical** | P1 | comm — retain (financial) | **never administratively deletable** (ADR-DB1-011) | — | fin (high) | row count; live-obligation uniqueness holds | payment |
| `payment_attempts` | **critical** | P1 | comm — retain | never deleted | — | fin (high) | count parity with obligations | payment |
| `payment_provider_events` | **critical** | P1 | comm — retain ≥ dispute window `[cfg]` | **retain by policy**, despite the exemption | `retention_exempt` | fin + sec (high) — payloads stored redacted | count; unique arbiter holds | payment |
| `payment_reconciliations` | **critical** | P1 | comm — retain | retain | `retention_exempt` | fin (high) | append chain intact | payment |
| `refunds` | **critical** | P1 | comm — retain | **DELETE always rejected, no exemption** — financial evidence | `reject` | fin (high) | count; only allowlisted columns mutable | payment |

## 7. Production & shipping

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `production_jobs` | critical | P1 | comm — retain | retain | — | prod (high) | row count | production |
| `production_specifications` | critical | P1 | comm — retain | **immutable** | `reject` | prod (high) | immutability probe | production |
| `production_artifacts` | critical | P2 | comm — retain | binaries via asset tombstone | — | prod (high) — never customer-visible | count; storage keys same caveat as `assets` | production |
| `production_notes` | important | P2 | comm — retain | retain | `retention_exempt` | prod | append chain intact | production |
| `production_job_transitions` | critical | P2 | comm — retain | retain | `retention_exempt` | internal | append chain intact | production |
| `shipping_details` | critical | P1 | comm + **anonymize** address/recipient after window `[cfg]` | frozen at `FROZEN`; fee/carrier fields retained | `reject` once FROZEN | cpriv + fin (high) — address PII | row count; frozen rows immutable | shipping |
| `shipping_snapshots` | **critical** | P1 | comm — retain | **never scrubbed by the ordinary anonymization path** — break-glass privacy procedure only | `reject` | cpriv + fin (high) | immutability probe | shipping |
| `shipping_fee_acknowledgements` | critical | P2 | comm — retain | retain | `retention_exempt` | fin | append chain intact | shipping |

## 8. Content, gallery & agreements

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `gallery_entries` | important | P2 | archive | admin archive | — | public | row count | content |
| `gallery_entry_assets` | important | P3 | archive | with the entry | — | public | count parity | content |
| `content_pages` | important | P2 | archive | admin archive | — | public | row count; published set intact | content |
| `redirect_rules` | important | P2 | archive | admin archive | — | public | row count | content |
| `agreements` | critical | P1 | comm — retain | retain | — | public, versions evidentiary | row count | content |
| `agreement_versions` | **critical** | P1 | comm — retain | retained while referenced (restrict FK) | `reject` once past DRAFT | med — legal evidence | count; frozen-column probe | content |

## 9. Notification, audit & platform

| Table | Durability | Restore | Retention class | Delete/anonymize behaviour | S24 DELETE | PII/sensitivity | Recovery validation | Owner |
|---|---|---|---|---|---|---|---|---|
| `notification_intents` | important | P3 | oper — hard-TTL | terminal + window `[cfg]`; attempts deleted with the intent | — | cpriv (minimal) — no bodies, no OTP | may be reduced after retention | notification |
| `notification_delivery_attempts` | important | P3 | oper — hard-TTL | deleted with the parent intent | `retention_exempt` | cpriv (minimal) | count ≥ intents | notification |
| `audit_events` | **critical** | P1 | **audit class** — deletion only via the retention-expiry job (O-012), never ad hoc | delete past the audit window `[cfg]` once a duration exists | `retention_exempt` | internal (high) — before/after metadata redacted | count; **largest table and 62 % index by size — dominates restore time** | platform |
| `outbox_events` | important | P2 | trans — hard-TTL after dispatch/resolution | delete dispatched or dead-lettered-and-reviewed rows | `retention_exempt` | internal — payload minimised, no secrets | undispatched rows must survive restore intact | platform |
| `idempotency_records` | important | P2 | trans — hard-TTL | delete past `expires_at` | — | internal | expired rows may be absent | platform |
| `background_job_attempts` | important | P3 | oper — hard-TTL | delete past window `[cfg]`; dead-letter rows kept until reviewed | `retention_exempt` | internal | may be reduced after retention | platform |
| `policy_configurations` | **critical** | P1 | comm — retain (config history) | retain | — | internal | row count; every referenced key resolvable | platform |
| `policy_configuration_versions` | **critical** | P1 | comm — retain | retain | — | internal | count parity | platform |

## 10. Totals and reconciliation

```
Tables classified                78 / 78
Unowned tables                    0
Contradictory retention classes   0

By durability class
  critical                       50
  important                      21
  reconstructible                 1   (asset_derivatives)
  transient                       6

By S24 DELETE policy (live pg_trigger dump, CP0)
  reject                         12
  retention_exempt               18
  no trigger                     48
  total triggers                 30   (matches the locked baseline)

Retention-job reachable by policy AND mechanism   9
Retention-exempt by mechanism but retain by policy 4
  inventory_ledger_entries, audit_events*, payment_provider_events,
  payment_reconciliations
```

\* `audit_events` carries an `audit`-class deletion path that activates only
once a business duration exists (DP-RET-03). Until then it is retain in
practice.

**Bookkeeping correction found at CP0.** `DB6_S24_TRIGGER_REPORT.md` §C
labels the APPEND_ONLY group "(CST-098, 16 tables)" and then lists **17**.
The live catalog confirms 17 APPEND_ONLY tables plus `outbox_events` as a
COLUMN_SCOPED table that also carries `retention_exempt`, giving 18
`retention_exempt` triggers in total; 6 IMMUTABLE + 17 APPEND_ONLY + 2
COLUMN_SCOPED + 3 + 1 + 1 conditional = **30**, which is the number that has
always been correct. The prose label was off by one; no trigger, migration or
count in the locked baseline changes. Recorded rather than silently fixed.
