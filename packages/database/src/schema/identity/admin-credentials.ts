/**
 * TBL-002 `admin_credentials` — provider-abstract admin credential (CTX-IDN).
 *
 * Columns: COL-TBL002-01..05 · Constraints: CST-001, CST-060
 * Relationships: REL — `admin_account_id` → `admin_accounts`
 * Owner: Identity module.
 *
 * `credential_reference` is a hashed or opaque provider reference. A plaintext
 * secret must never reach this column (COL-TBL002-03 `[SEC]`, D7-12). The
 * concrete credential kinds stay open until the auth-provider ADR (DEC-29), so
 * the kind set below is deliberately provisional and carries no CHECK yet —
 * constraining it now would encode a decision DB6 is not allowed to make.
 */
import { pgTable, primaryKey, text, foreignKey } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { adminAccounts } from './admin-accounts';

export const adminCredentials = pgTable(
  'admin_credentials',
  {
    id: idColumn().notNull(),
    adminAccountId: idReference('admin_account_id').notNull(),
    credentialKind: text('credential_kind').notNull(),
    credentialReference: text('credential_reference').notNull(),
    rotatedAt: instant('rotated_at'),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_admin_credentials', columns: [t.id] }),
    foreignKey({
      name: 'fk_admin_credentials__admin_account_id',
      columns: [t.adminAccountId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
  ],
);
