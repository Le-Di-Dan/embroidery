# Database Change Control During Application Implementation

## 1. Baseline

The completed database schema, migrations, guards, concurrency guarantees, performance work, and durability work are inherited foundations. Application work must not silently reinterpret or weaken them.

Existing shared migrations remain immutable.

## 2. Prohibited behavior

An ordinary API/frontend/worker checkpoint must not:

- Edit a completed migration.
- Add a migration casually.
- Change a table because the API implementation is inconvenient.
- Bypass a database guard.
- Catch and ignore an integrity error.
- Introduce a second ORM.
- Expose Drizzle/SQL structure as the application contract.

## 3. Change request trigger

When implementation identifies a genuine persistence gap:

1. Stop the dependent checkpoint.
2. Create a database change request.
3. Trace the requirement and affected lifecycle/invariant.
4. Audit existing canonical table, column, relationship, guard, query, and index documents.
5. State whether the issue is a defect, new approved requirement, or implementation misunderstanding.
6. Obtain approval before migration work.

## 4. Dedicated database change checkpoint

An approved application-era database change uses its own checkpoint and includes:

- Impact report.
- Updated logical/physical documentation.
- Forward-only migration.
- Migration checksum/update policy.
- Fresh install test.
- Upgrade path test.
- No-op/status/drift test.
- Constraint/guard tests.
- Concurrency impact where applicable.
- Query/index impact.
- Rollout and compatibility plan.
- Handoff back to blocked application checkpoints.

Do not combine it with the feature API implementation.

> **Application-era migration log.**
>
> | Migration | Checkpoint | Contribution |
> |---|---|---|
> | `0032_add_catalog_preview_derivative_kind` | `APP2-DB01` | `CATALOG_PREVIEW` derivative kind + watermark CHECK |
> | `0033_provision_catalog_draft_categories` | `APP2-B02-G01` | data-only category provisioning |
> | `0034_add_app3_placement_and_derivative_authority` | `APP3-DB01` | placement stable identity/retirement/protection (IMP-D041) **and** canonical derivative output metadata (IMP-D044), in one forward-only migration |
> | `0035_add_app5_intake_provenance` | `APP5-DB01` | customer intake provenance on TBL-022 `assets`: `uploaded_via_challenge_id` (REL-106, `ON DELETE SET NULL`) + `intake_expires_at`, CST-127/CST-128 and the two intake indexes — the persisted fact `APP5-B02` stopped for |
> | `0036_add_app6_cop_design_context` | `APP6-DB01` | the customer-owned-product design branch on TBL-028 `design_versions` and TBL-031 `approval_snapshots` (ADR-APP6-001, IMP-D051): four Catalog placement columns made nullable on each table, `customer_owned_product_id` + REL-107/REL-108 (`ON DELETE RESTRICT`), the `design_versions` placement label pair, and CST-129/CST-130/CST-131 — a COP request reaching a formal version and an approval snapshot with no fabricated Catalog identity (INV-13) |

## 5. Compatibility policy

Prefer expand-and-contract when deployed clients/workers may overlap:

1. Add backward-compatible schema capability.
2. Deploy application support.
3. Migrate/backfill if approved.
4. Remove obsolete behavior only in a later reviewed change.

## 6. Error mapping

Application repositories/services must map database integrity failures into stable domain/application errors while preserving:

- Client safety.
- Correct conflict semantics.
- Operational correlation.
- No raw SQL detail or PII leakage.

## 7. Disposable environments

Mutating migration and integrity tests run on disposable databases. Do not mutate a developer's persistent database or production data for checkpoint proof.
