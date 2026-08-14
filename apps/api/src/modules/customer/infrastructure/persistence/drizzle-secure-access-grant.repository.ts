/**
 * Drizzle implementation of the AGG-04 Secure Access Grant contract (TBL-008).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { notFoundError, schema } from '@embroidery/database';
import type { GrantScopeKind, SecureAccessGrantState } from '@embroidery/database';
import { and, desc, eq, gt } from 'drizzle-orm';

import type { CustomerId } from '../../domain/repositories/customer.repository';
import type {
  GrantId,
  GrantUseContext,
  IssueGrantInput,
  SecureAccessGrant,
  SecureAccessGrantRepository,
  SecureAccessGrantSummary,
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

  /**
   * The `APP4-B06` public read: one grant, from its digest alone.
   *
   * The predicate set is deliberately the same as {@link resolveActive}'s minus
   * the two target columns — status, expiry and scope are all still enforced,
   * and the customer and request come back *from* the row. Written as one
   * fixed-shape query for the same reason: a load-then-compare would branch, and
   * a branch is a timing and behaviour difference between "no such token" and
   * "expired".
   *
   * `limit(1)` is belt-and-braces over CST-008, which already makes `token_hash`
   * unique — it costs nothing and means a future index change cannot silently
   * turn this into a multi-row read.
   */
  async resolveActiveByTokenDigest(
    tokenHash: string,
    scopeKind: GrantScopeKind,
    now: Date,
  ): Promise<SecureAccessGrant | undefined> {
    return this.run('resolveActiveByTokenDigest', async () => {
      const [row] = await this.db
        .select()
        .from(secureAccessGrants)
        .where(
          and(
            eq(secureAccessGrants.tokenHash, tokenHash),
            eq(secureAccessGrants.scopeKind, scopeKind),
            eq(secureAccessGrants.status, 'ACTIVE'),
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

  /**
   * The `APP4-B07` Admin support read.
   *
   * The column list is explicit, and that is the security property rather than a
   * style choice: `token_hash` is never selected, so the digest does not exist in
   * any object this method returns and cannot be spread, logged or serialized by
   * anything downstream. Every other read here uses `select()` and maps, which is
   * safe only for as long as the mapper stays correct; this one is safe because
   * the row has no digest to drop.
   *
   * `revoked_at`, `revoke_reason` and `superseded_by_grant_id` are omitted for
   * the same structural reason — B07 publishes state and expiry, and a column
   * that never arrives cannot leak into a projection.
   *
   * No status predicate: the point of this read is that a revoked or
   * time-expired grant is still visible. Expiry is *not* applied here either —
   * unlike `resolveActive`, which must refuse a stale grant, this read must
   * report one, because "physically ACTIVE but past its expiry" is exactly the
   * state LC-03 leaves behind and exactly what an operator is trying to see.
   */
  async listForCustomer(customerId: CustomerId): Promise<SecureAccessGrantSummary[]> {
    return this.run('listForCustomer', async () => {
      const rows = await this.db
        .select({
          id: secureAccessGrants.id,
          customRequestId: secureAccessGrants.customRequestId,
          scopeKind: secureAccessGrants.scopeKind,
          status: secureAccessGrants.status,
          expiresAt: secureAccessGrants.expiresAt,
          createdAt: secureAccessGrants.createdAt,
        })
        .from(secureAccessGrants)
        .where(eq(secureAccessGrants.customerId, customerId))
        // `id` is the tie-breaker: two grants minted in one transaction share a
        // `created_at`, and an ambiguous order renders one operator's table two
        // different ways for the same data.
        .orderBy(desc(secureAccessGrants.createdAt), desc(secureAccessGrants.id));

      return rows.map((row) => ({
        id: row.id as GrantId,
        customRequestId: row.customRequestId,
        scopeKind: row.scopeKind as GrantScopeKind,
        status: row.status as SecureAccessGrantState,
        expiresAt: row.expiresAt,
      }));
    });
  }
}
