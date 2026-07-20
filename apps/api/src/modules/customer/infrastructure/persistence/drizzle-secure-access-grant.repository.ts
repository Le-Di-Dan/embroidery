/**
 * Drizzle implementation of the AGG-04 Secure Access Grant contract (TBL-008).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { notFoundError, schema } from '@embroidery/database';
import type { GrantScopeKind } from '@embroidery/database';
import { and, eq, gt } from 'drizzle-orm';

import type { CustomerId } from '../../domain/repositories/customer.repository';
import type {
  GrantId,
  GrantUseContext,
  IssueGrantInput,
  SecureAccessGrant,
  SecureAccessGrantRepository,
} from '../../domain/repositories/secure-access-grant.repository';

const { secureAccessGrants } = schema;

type GrantRow = typeof secureAccessGrants.$inferSelect;

function toDomain(row: GrantRow): SecureAccessGrant {
  return {
    id: row.id as GrantId,
    customerId: row.customerId as CustomerId,
    customRequestId: row.customRequestId,
    scopeKind: row.scopeKind as GrantScopeKind,
    expiresAt: row.expiresAt,
  };
}

@Injectable()
export class DrizzleSecureAccessGrantRepository
  extends DrizzleRepository
  implements SecureAccessGrantRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async issue(input: IssueGrantInput): Promise<SecureAccessGrant> {
    return this.run('issue', async () => {
      const [row] = await this.db
        .insert(secureAccessGrants)
        .values({
          id: input.id,
          customerId: input.customerId,
          customRequestId: input.customRequestId,
          tokenHash: input.tokenHash,
          scopeKind: input.scopeKind,
          status: 'ACTIVE',
          expiresAt: input.expiresAt,
        })
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'SecureAccessGrantRepository.issue',
          'Could not issue the access grant.',
        );
      }
      return toDomain(row);
    });
  }

  async revoke(id: GrantId, reason: string): Promise<void> {
    return this.run('revoke', async () => {
      const now = new Date();
      const rows = await this.db
        .update(secureAccessGrants)
        .set({ status: 'REVOKED', revokedAt: now, revokeReason: reason, updatedAt: now })
        .where(and(eq(secureAccessGrants.id, id), eq(secureAccessGrants.status, 'ACTIVE')))
        .returning({ id: secureAccessGrants.id });

      if (rows.length === 0) {
        throw notFoundError(
          'SecureAccessGrantRepository.revoke',
          'That access grant is not active.',
        );
      }
    });
  }

  /**
   * Points a revoked grant at the grant that replaced it.
   *
   * Separate from `revoke`, and necessarily called after it: the replacement
   * must already exist (the self-referencing FK rejects a dangling pointer),
   * and the old grant must already be revoked to free the
   * active-per-(customer, request) arbiter for it. The caller runs all three
   * steps in one transaction, so the trail is never half-built.
   */
  async supersede(id: GrantId, replacementId: GrantId, reason: string): Promise<void> {
    return this.run('supersede', async () => {
      const tx = this.requireTransaction('supersede');

      const rows = await tx
        .update(secureAccessGrants)
        .set({
          supersededByGrantId: replacementId,
          revokeReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(secureAccessGrants.id, id), eq(secureAccessGrants.status, 'REVOKED')))
        .returning({ id: secureAccessGrants.id });

      if (rows.length === 0) {
        throw notFoundError(
          'SecureAccessGrantRepository.supersede',
          'That access grant must be revoked before it can be superseded.',
        );
      }
    });
  }

  async resolveActive(
    tokenHash: string,
    context: GrantUseContext,
    now: Date,
  ): Promise<SecureAccessGrant | undefined> {
    return this.run('resolveActive', async () => {
      // G-DB7-38/39/40 are all expressed as predicates of one query rather than
      // as a load-then-compare. A caller that presented a token for the wrong
      // customer, the wrong request or an out-of-scope operation gets the same
      // empty result as one presenting an unknown token, so the failure mode
      // discloses nothing about which check rejected it.
      const [row] = await this.db
        .select()
        .from(secureAccessGrants)
        .where(
          and(
            eq(secureAccessGrants.tokenHash, tokenHash),
            eq(secureAccessGrants.customerId, context.customerId),
            eq(secureAccessGrants.customRequestId, context.customRequestId),
            eq(secureAccessGrants.scopeKind, context.scopeKind),
            eq(secureAccessGrants.status, 'ACTIVE'),
            // Expiry enforced on read: a grant must not stay usable merely
            // because no sweep has run yet.
            gt(secureAccessGrants.expiresAt, now),
          ),
        )
        .limit(1);

      return row === undefined ? undefined : toDomain(row);
    });
  }

  async findById(id: GrantId): Promise<SecureAccessGrant | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(secureAccessGrants)
        .where(eq(secureAccessGrants.id, id))
        .limit(1);
      return row === undefined ? undefined : toDomain(row);
    });
  }

  async listActiveForRequest(customRequestId: string): Promise<SecureAccessGrant[]> {
    return this.run('listActiveForRequest', async () => {
      const rows = await this.db
        .select()
        .from(secureAccessGrants)
        .where(
          and(
            eq(secureAccessGrants.customRequestId, customRequestId),
            eq(secureAccessGrants.status, 'ACTIVE'),
          ),
        );
      return rows.map(toDomain);
    });
  }
}
