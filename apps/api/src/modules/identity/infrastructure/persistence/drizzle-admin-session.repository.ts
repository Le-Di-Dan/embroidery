/**
 * Drizzle implementation of the AGG-01 Admin Session contract (TBL-003).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { notFoundError, schema } from '@embroidery/database';
import type { AdminSessionState } from '@embroidery/database';
import { and, eq, gt, inArray } from 'drizzle-orm';

import type { AdminAccountId } from '../../domain/repositories/admin-account.repository';
import type {
  AdminSession,
  AdminSessionId,
  AdminSessionRepository,
  IssueAdminSessionInput,
} from '../../domain/repositories/admin-session.repository';

const { adminSessions } = schema;

type AdminSessionRow = typeof adminSessions.$inferSelect;

function toDomain(row: AdminSessionRow): AdminSession {
  return {
    id: row.id as AdminSessionId,
    adminAccountId: row.adminAccountId as AdminAccountId,
    status: row.status as AdminSessionState,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class DrizzleAdminSessionRepository
  extends DrizzleRepository
  implements AdminSessionRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async issue(input: IssueAdminSessionInput): Promise<AdminSession> {
    return this.run('issue', async () => {
      const [row] = await this.db
        .insert(adminSessions)
        .values({
          id: input.id,
          adminAccountId: input.adminAccountId,
          tokenHash: input.tokenHash,
          status: 'ACTIVE',
          expiresAt: input.expiresAt,
          clientMetadata: input.clientMetadata ?? null,
        })
        .returning();

      return toDomain(expectRow(row, 'issue'));
    });
  }

  async revoke(id: AdminSessionId): Promise<AdminSession> {
    return this.run('revoke', async () => {
      const now = new Date();
      const [row] = await this.db
        .update(adminSessions)
        .set({ status: 'REVOKED', revokedAt: now, updatedAt: now })
        .where(eq(adminSessions.id, id))
        .returning();

      return toDomain(expectRow(row, 'revoke'));
    });
  }

  async extendExpiry(id: AdminSessionId, expiresAt: Date): Promise<AdminSession | undefined> {
    return this.run('extendExpiry', async () => {
      const [row] = await this.db
        .update(adminSessions)
        .set({ expiresAt, updatedAt: new Date() })
        .where(
          and(
            eq(adminSessions.id, id),
            // Extend a live session only: a revoked/expired row must not be
            // revived by a renewal that raced its termination.
            eq(adminSessions.status, 'ACTIVE'),
          ),
        )
        .returning();

      return row === undefined ? undefined : toDomain(row);
    });
  }

  async revokeAllForAdmin(adminAccountId: AdminAccountId): Promise<number> {
    return this.run('revokeAllForAdmin', async () => {
      const now = new Date();
      const rows = await this.db
        .update(adminSessions)
        .set({ status: 'REVOKED', revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(adminSessions.adminAccountId, adminAccountId),
            // Only live sessions: re-revoking an expired one would overwrite
            // the status that records *why* it ended.
            inArray(adminSessions.status, ['ACTIVE']),
          ),
        )
        .returning({ id: adminSessions.id });

      return rows.length;
    });
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<AdminSession | undefined> {
    return this.run('findActiveByTokenHash', async () => {
      const [row] = await this.db
        .select()
        .from(adminSessions)
        .where(
          and(
            eq(adminSessions.tokenHash, tokenHash),
            eq(adminSessions.status, 'ACTIVE'),
            // Expiry is enforced here, not by a sweep: a session must not stay
            // usable merely because no cleanup job has run.
            gt(adminSessions.expiresAt, now),
          ),
        )
        .limit(1);

      return row === undefined ? undefined : toDomain(row);
    });
  }
}

function expectRow(row: AdminSessionRow | undefined, operation: string): AdminSessionRow {
  if (row === undefined) {
    throw notFoundError(`AdminSessionRepository.${operation}`, 'That session does not exist.');
  }
  return row;
}
