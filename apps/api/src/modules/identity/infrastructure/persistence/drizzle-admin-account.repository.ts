/**
 * Drizzle implementation of the AGG-01 Admin Account contract (TBL-001, TBL-002).
 *
 * Owns `admin_accounts` and its `admin_credentials` child: a credential has no
 * life outside its account, so it is written here rather than through a
 * repository of its own (DB7 §10.1).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { schema } from '@embroidery/database';
import type { AdminAccountState } from '@embroidery/database';
import { newId, notFoundError } from '@embroidery/database';
import { eq } from 'drizzle-orm';

import type {
  AdminAccount,
  AdminAccountId,
  AdminAccountRepository,
  AttachCredentialInput,
  CreateAdminAccountInput,
} from '../../domain/repositories/admin-account.repository';

const { adminAccounts, adminCredentials } = schema;

type AdminAccountRow = typeof adminAccounts.$inferSelect;

/** The one place a row becomes a domain object. No row crosses this boundary raw. */
function toDomain(row: AdminAccountRow): AdminAccount {
  return {
    id: row.id as AdminAccountId,
    email: row.email,
    displayName: row.displayName,
    status: row.status as AdminAccountState,
    lockedAt: row.lockedAt ?? undefined,
    disabledAt: row.disabledAt ?? undefined,
    replacedByAdminAccountId: (row.replacedByAdminAccountId ?? undefined) as
      AdminAccountId | undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Status changes that must also stamp an instant.
 *
 * Keeping this beside the update means a lock can never be recorded without its
 * `locked_at`, which is what makes the column trustworthy as evidence.
 */
function statusTimestamps(status: AdminAccountState, at: Date): Partial<AdminAccountRow> {
  switch (status) {
    case 'LOCKED':
      return { lockedAt: at };
    case 'DISABLED':
      return { disabledAt: at };
    case 'ACTIVE':
      // Re-activating clears both marks: a re-activated account is not locked.
      return { lockedAt: null, disabledAt: null };
  }
}

@Injectable()
export class DrizzleAdminAccountRepository
  extends DrizzleRepository
  implements AdminAccountRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async create(input: CreateAdminAccountInput): Promise<AdminAccount> {
    return this.run('create', async () => {
      const [row] = await this.db
        .insert(adminAccounts)
        .values({
          id: input.id,
          email: input.email,
          displayName: input.displayName,
          status: 'ACTIVE',
        })
        .returning();

      return toDomain(expectRow(row, 'create'));
    });
  }

  async updateProfile(id: AdminAccountId, displayName: string): Promise<AdminAccount> {
    return this.run('updateProfile', async () => {
      const [row] = await this.db
        .update(adminAccounts)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(adminAccounts.id, id))
        .returning();

      return toDomain(expectRow(row, 'updateProfile'));
    });
  }

  async attachCredential(input: AttachCredentialInput): Promise<void> {
    return this.run('attachCredential', async () => {
      // Two tables in one command: the account must exist and the credential
      // must land together, so the caller owns a transaction.
      const tx = this.requireTransaction('attachCredential');
      await tx.insert(adminCredentials).values({
        id: newId(),
        adminAccountId: input.adminAccountId,
        credentialKind: input.credentialKind,
        credentialReference: input.credentialReference,
      });
    });
  }

  async changeStatus(id: AdminAccountId, status: AdminAccountState): Promise<AdminAccount> {
    return this.run('changeStatus', async () => {
      const now = new Date();
      const [row] = await this.db
        .update(adminAccounts)
        .set({ status, updatedAt: now, ...statusTimestamps(status, now) })
        .where(eq(adminAccounts.id, id))
        .returning();

      return toDomain(expectRow(row, 'changeStatus'));
    });
  }

  async findById(id: AdminAccountId): Promise<AdminAccount | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(adminAccounts)
        .where(eq(adminAccounts.id, id))
        .limit(1);
      return row === undefined ? undefined : toDomain(row);
    });
  }

  async findByEmail(email: string): Promise<AdminAccount | undefined> {
    return this.run('findByEmail', async () => {
      const [row] = await this.db
        .select()
        .from(adminAccounts)
        .where(eq(adminAccounts.email, email))
        .limit(1);
      return row === undefined ? undefined : toDomain(row);
    });
  }

  async exists(id: AdminAccountId): Promise<boolean> {
    return this.run('exists', async () => {
      // Selects the key only: this is an existence probe for the no-FK actor
      // guard (G-DB7-50), not a load.
      const [row] = await this.db
        .select({ id: adminAccounts.id })
        .from(adminAccounts)
        .where(eq(adminAccounts.id, id))
        .limit(1);
      return row !== undefined;
    });
  }
}

/**
 * An UPDATE matching no row returns nothing rather than failing.
 *
 * Left unchecked that reads as success, so the caller would believe it changed
 * a record that does not exist.
 */
function expectRow(row: AdminAccountRow | undefined, operation: string): AdminAccountRow {
  if (row === undefined) {
    throw notFoundError(
      `AdminAccountRepository.${operation}`,
      'That administrator account does not exist.',
    );
  }
  return row;
}
