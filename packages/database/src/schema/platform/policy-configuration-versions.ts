/**
 * TBL-077 `policy_configuration_versions` — one immutable versioned value of a
 * configuration key (CTX-PLT, AGG-23).
 *
 * Columns: COL-TBL077-01..07 · Constraints: CST-001, CST-050
 * Relationships: REL-102 (→ policy_configurations, → admin_accounts)
 * Indexes: IDX-061 (`uq_policy_configuration_versions__config_version`)
 * JSONB: payload #9 `value`, version key `value_schema_version`
 * Owner: Platform module.
 *
 * Immutable (DB4 "Immutable"): no `updated_at`. The reject-mutation trigger is
 * authored in slice S24 with the other immutability triggers.
 *
 * `value` is opaque to the database: config value shapes are heterogeneous per
 * `config_key`, and the queryable facts — key, version, effective_from — are
 * relational columns. **No secrets are stored in config values** (audit spec).
 */
import { foreignKey, integer, jsonb, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { adminAccounts } from '../identity/admin-accounts';
import { policyConfigurations } from './policy-configurations';

export const policyConfigurationVersions = pgTable(
  'policy_configuration_versions',
  {
    id: idColumn().notNull(),
    policyConfigurationId: idReference('policy_configuration_id').notNull(),
    version: integer('version').notNull(),
    value: jsonb('value').notNull(),
    valueSchemaVersion: integer('value_schema_version').notNull(),
    effectiveFrom: instant('effective_from').notNull(),
    createdByAdminId: idReference('created_by_admin_id').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_policy_configuration_versions', columns: [t.id] }),
    // CST-050 / IDX-061 — version numbers are per-configuration and never reused.
    unique('uq_policy_configuration_versions__config_version').on(
      t.policyConfigurationId,
      t.version,
    ),
    foreignKey({
      name: 'fk_policy_configuration_versions__policy_configuration_id',
      columns: [t.policyConfigurationId],
      foreignColumns: [policyConfigurations.id],
    }).onDelete('restrict'),
    // REL-102 — the admin who authored the change; retained as audit evidence.
    foreignKey({
      name: 'fk_policy_configuration_versions__created_by_admin_id',
      columns: [t.createdByAdminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
  ],
);
