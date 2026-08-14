/**
 * Operator-initiated grant revocation (`APP4-B07`).
 *
 * This class performs **no** part of the transition. It does three things the
 * lifecycle owner cannot do for itself, and then delegates:
 *
 * 1. establishes that the grant exists at all, so an unknown id and a
 *    already-dead one can be told apart (§12: 404 versus conflict);
 * 2. resolves the **authenticated** Admin actor from the bound request context;
 * 3. calls `SecureGrantIssuer.revoke`, which owns `TR-LC03-02`, the mandatory
 *    reason, the compare-and-set and the audit row.
 *
 * ### It does not call the repository's `revoke`
 *
 * That method exists and would work, and using it is the defect this file is
 * shaped to prevent. `SecureAccessGrantRepository.revoke` is a guarded UPDATE
 * and nothing else: it writes no audit event, so an Admin revocation performed
 * through it would move a customer's only credential for a request and leave no
 * evidence that anybody did. B05 is the one place the transition and its
 * evidence are a single transaction, which is exactly why B07 must go through
 * it (§13).
 *
 * ### Why the pre-read is not the guard
 *
 * `findById` here decides a *status code*, not whether the revoke may proceed. A
 * grant can be revoked by a concurrent operator between this read and the
 * transaction, and when that happens the compare-and-set inside B05 — whose
 * `status = 'ACTIVE'` predicate is the real arbiter — matches nothing and the
 * loser is told the grant is not revocable. The read cannot be raced into a
 * wrong outcome because it never authorizes anything.
 */
import { Inject, Injectable } from '@nestjs/common';

import type { AuditActor } from '../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import { SecureGrantError } from '../domain/grant/secure-grant-outcome';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type GrantId,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
import { AdminSupportError } from '../domain/support/admin-support.errors';
import { SecureGrantIssuer } from './secure-grant.issuer';

export interface RevokeSecureGrantCommand {
  readonly grantId: GrantId;
  /** The operator's own words. Validated non-blank at the wire and by B05. */
  readonly reason: string;
}

@Injectable()
export class RevokeSecureGrantUseCase {
  constructor(
    private readonly issuer: SecureGrantIssuer,
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async revoke(command: RevokeSecureGrantCommand): Promise<void> {
    const existing = await this.grants.findById(command.grantId);
    if (existing === undefined) {
      throw new AdminSupportError('GRANT_NOT_FOUND');
    }

    try {
      await this.issuer.revoke(command.grantId, command.reason, this.currentAdminActor());
    } catch (error: unknown) {
      if (error instanceof SecureGrantError && error.failure === 'GRANT_NOT_ACTIVE') {
        // The row is there — the pre-read saw it — so this is a state conflict,
        // not a missing id. Every other lifecycle failure propagates untouched:
        // B05's remaining reasons belong to issuance and reissue, and mapping
        // one here would publish a refusal this operation cannot produce.
        throw new AdminSupportError('GRANT_NOT_REVOCABLE');
      }
      throw error;
    }
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * Never from the request body, a header or a query parameter — an accepted
   * `actorId` would let an operator file their action against a colleague. It
   * follows `DesignTemplateAuditRecorder.currentActor`, including the hard stop:
   * there is no fallback actor, because an unattributable revocation must fail
   * rather than be recorded as `SYSTEM` or as the customer whose access it just
   * removed.
   */
  private currentAdminActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      // `AuthenticatedAdminGuard` binds this actor and admits nobody else, so
      // this is unreachable through HTTP. It stays a hard stop rather than a
      // silent coercion: the coercion is what would put `CUSTOMER` on a
      // staff-initiated revocation.
      throw new Error('Revoking a secure grant requires an authenticated Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}
