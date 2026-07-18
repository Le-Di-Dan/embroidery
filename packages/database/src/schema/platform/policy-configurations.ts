/**
 * TBL-076 `policy_configurations` — named business policy configuration key
 * (CTX-PLT, AGG-23).
 *
 * Columns: COL-TBL076-01..03 · Constraints: CST-001, CST-050
 * Relationships: REL-102 (current-version pointer)
 * Indexes: IDX-060 (`uq_policy_configurations__config_key`)
 * Owner: Platform module.
 *
 * This is a **header**: it owns identity and a pointer, never a value. Values
 * live in immutable versions (TBL-077), so a policy change is an append, not an
 * overwrite, and any snapshot referencing a version keeps meaning forever.
 *
 * `current_version_id` is deliberately nullable and its FK is added **after**
 * the version table exists — the two tables reference each other, and a
 * NOT NULL pointer would make the first row unwritable.
 */
import { pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';

export const policyConfigurations = pgTable(
  'policy_configurations',
  {
    id: idColumn().notNull(),
    configKey: text('config_key').notNull(),
    description: text('description').notNull(),
    currentVersionId: idReference('current_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_policy_configurations', columns: [t.id] }),
    // CST-050 / IDX-060 — stable config key identity.
    unique('uq_policy_configurations__config_key').on(t.configKey),
  ],
);
