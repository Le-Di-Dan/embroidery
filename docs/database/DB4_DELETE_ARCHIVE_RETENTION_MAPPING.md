# DB4 — Delete, Archive & Retention Mapping

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Framework:** ADR-DB1-011 categories + retention classes. **Durations stay
deferred** (O-008/O-012 → policy configuration, business sign-off);
default-safe = nothing deleted except transient classes with configured
TTL. Cleanup owner: scheduled worker jobs, every run audited (counts +
criteria). Legal/business hold: `policy_configurations` key
`retention.hold` direction — hold flags are an App-level block on cleanup
for named records (no schema column added speculatively; DB6 revisits if
the business activates holds).

| Table(s) | Delete category | Trigger event (retention start) | Class | Parent/child effect | Snapshot protection / notes |
|---|---|---|---|---|---|
| admin_accounts / admin_credentials | retain | — | comm | — | DISABLED rows kept (audit lineage) |
| admin_sessions | hard-ttl | expires_at / revoked_at | oper | — | |
| customers / customer_contact_points / business_profiles | **anonymize** (field scrub, rows retained while commercial history exists); standalone unreferenced customer may hard-delete | retention window after last commercial activity [cfg] | comm+anonymize | contacts scrub with customer | frozen contact snapshots in approvals/shipping are NOT scrubbed (break-glass only) |
| contact_verification_challenges + attempts | hard-ttl (family) | terminal state / expires_at | trans | attempts deleted with challenge | secrets are hashes anyway |
| secure_access_grants | retain (evidence) | terminal + grace [cfg] | oper | — | token hash retained as evidence; DB10 may add pruning policy |
| customer_merge_cases / events | retain | — | comm | — | merge evidence |
| categories / products / variants / skus / sides / areas / product_media | **archive** (`archived_at` + status); hard delete only never-published & unreferenced (TR-LC04-03) | admin action | comm(archive) | children archived with product | history safe via snapshots (INV-12) |
| sku_stocks / inventory_ledger_entries | retain (ledger = commercial record) | — | comm | — | corrections = new entries |
| inventory_soft_holds | retain terminal rows; opér cleanup may prune old terminal holds | terminal + window [cfg] | oper | ledger rows retained | |
| inventory_reservations | retain | — | comm | — | |
| assets / asset_derivatives | **tombstone two-phase**: deletion decision → worker deletes binary → `deleted_at`; metadata row never deleted before binary | retention per kind [cfg] or admin decision [R]; blocked while referenced by commercial history | per kind | derivatives tombstone with parent | ADR-DB1-011; consumer FKs restrict |
| asset_inspections | hard-ttl | window [cfg] | oper | — | |
| design_sessions + design_session_assets | **hard-ttl** (anonymize-then-delete direction) | last_activity_at + TTL (O-008) | trans | association rows cascade-temp | never a library (D-006); uploads referenced by requests survive via asset refs |
| design_cases / versions / reviews / version assets | retain (immutable history) | — | comm | — | versions never deleted (REQ-DVER-005) |
| approval_snapshots + children | retain | — | comm | — | never deleted while commercial record exists; break-glass privacy redaction only |
| design_templates / versions / assets | archive | admin | comm(archive) | versions retained (clone provenance) | |
| custom_requests + COP + breakdowns + assets + moderation + transitions | retain; terminal states are states, not deletions; PII via customer anonymization | terminal timestamp | comm | — | |
| orders / order_items / order_transitions / cancellation_requests | retain | — | comm | — | items immutable |
| shipping_details / shipping_snapshots | retain + **anonymize address/recipient fields** after window [cfg] | delivered/cancelled + window | comm+anonymize | snapshot scrub only via privacy procedure | fee/carrier fields retained |
| shipping_fee_acknowledgements | retain | — | comm | — | |
| quotations / versions / line items / acceptances | retain | — | comm | — | sent versions immutable |
| payment_obligations / attempts / provider_events / reconciliations / refunds | retain (financial record) | — | comm (`payment-evidence` ≥ dispute window for events [cfg]) | — | never administratively deletable (ADR-DB1-011 global rule) |
| production_jobs / specs / artifacts / notes / transitions | retain | — | comm | artifact binaries via asset tombstone | |
| gallery_entries / assets assoc / content_pages / redirect_rules | archive | admin | comm(archive) | — | |
| agreements / agreement_versions | retain | — | comm | versions retained while referenced (restrict FK) | |
| notification_intents / delivery_attempts | hard-ttl | terminal + window [cfg] | oper | attempts deleted with intent | no bodies/secrets stored anyway |
| audit_events | retain under **audit** class; deletion only via retention-expiry job (O-012), never ad hoc | occurred_at + audit window [cfg] | audit | — | append-only |
| outbox_events | hard-ttl (processed/dead-lettered after review) | dispatched_at / resolution | trans | — | payload immutable until cleaned |
| idempotency_records | hard-ttl | expires_at (TTL class per namespace) | trans | — | |
| background_job_attempts | hard-ttl | window [cfg] | oper | dead-letter rows kept until reviewed | |
| policy_configurations / versions | retain (config history) | — | comm | — | |

**Backup implication:** backup retention must be ≥ the protected class
(ADR-DB1-014, checked at DB10). **Deferred durations:** every `[cfg]`
above = policy configuration value (CON-144) with business owner;
acceptance = configured (or explicitly waived) before the owning feature
ships — unchanged from the DB1/DB3 deferred-parameter register.

---

## Forward note — `APP3-G02` (IMP-D042, 2026-08-03)

**Design Template retention (LC-24).** `ARCHIVED` is retention, not
removal: **APP3 has no Template hard-delete operation**, and restore
(`TR-LC24-06`) returns an archived Template to `DRAFT` rather than to
`PUBLISHED`. Template Versions are never deleted — they remain addressable as
clone lineage for Design Sessions that copied them.

**Product archive (`TR-LC04-06`).** Archive from `DRAFT` is durable catalog
retirement and hard-deletes nothing: Product, `product_media`, Assets,
derivatives, placement rows, Templates, Design Sessions and historical records
all persist. `TR-LC04-03` remains the only Product delete path, and only for a
never-published, unreferenced draft.
