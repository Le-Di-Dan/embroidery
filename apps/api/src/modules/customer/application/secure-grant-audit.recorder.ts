/**
 * The durable evidence a grant lifecycle transition leaves (`APP4-B05` §16,
 * `INV-14`, `ADR-DB3-004` r11 — "issue, use-for-sensitive-action, revoke,
 * reissue, step-up success/failure are audited").
 *
 * Three actions, one target kind, and one hard rule about the summary.
 *
 * ### What may never appear here
 *
 * The raw token, its digest, the rendered fragment URL, the envelope ciphertext,
 * the recipient in any form — full, normalized or masked — and the pepper.
 *
 * The digest deserves the explicit mention, because it is the one that looks
 * safe. `token_hash` is not the token, so writing it into a summary reads like
 * redaction. It is not: it is the exact value `resolveActive` looks a grant up
 * by (CST-008 / IDX-007), so an audit row carrying it hands a reader of the
 * audit trail the lookup key for the credential. `audit_events` outlives the
 * grant it describes by design (G-DB7-46), which means such a row would outlive
 * the revocation too.
 *
 * What is left is exactly what an operator needs and an attacker cannot use:
 * server-generated ids, the fixed scope, the expiry instant, the lineage of a
 * reissue, and the revoke reason an operator typed themselves.
 *
 * ### The actor is the customer
 *
 * A grant is issued *for* a customer, at the moment their own request enters the
 * flow, so `CUSTOMER` is the truthful actor and `customer_id` resolves through
 * `fk_audit_events__customer_id`. This follows `CustomerIdentityAuditRecorder`,
 * and the two alternatives are the same two it rejected: `SYSTEM` would claim an
 * automated job did this, and fabricating an Admin would attribute a customer's
 * flow to staff. `APP4-B07` will pass its own authenticated Admin actor for
 * operator-initiated revocation; nothing here invents one.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { CustomerId } from '../domain/repositories/customer.repository';
import type { GrantId } from '../domain/repositories/secure-access-grant.repository';

/** The polymorphic target kind for a grant. Already in the closed set. */
const GRANT_KIND = 'SECURE_ACCESS_GRANT' as const;

/** A grant was minted and is now the customer's credential for one request. */
export const GRANT_ISSUED_ACTION = 'secure_grant.issued';

/** A live grant was rotated: new token, new row, old one superseded. */
export const GRANT_REISSUED_ACTION = 'secure_grant.reissued';

/** A grant was withdrawn with a reason (`TR-LC03-02`). */
export const GRANT_REVOKED_ACTION = 'secure_grant.revoked';

/**
 * The subject is scope-dependent since `APP12-B04`: a `REQUEST_ACCESS` issuance
 * names a request and an `ORDER_ACCESS` one names an order, matching the typed
 * XOR `ck_secure_access_grants__scope_subject` stores. Two optional fields
 * rather than one polymorphic "subjectId", so an operator reading the trail does
 * not have to decode `scopeKind` before the id means anything.
 */
export interface RecordGrantIssuedInput {
  readonly grantId: GrantId;
  readonly customerId: CustomerId;
  readonly customRequestId?: string | undefined;
  readonly orderId?: string | undefined;
  readonly scopeKind: string;
  readonly expiresAt: Date;
  /** Whether a delivery was requested with the issue. Never the destination. */
  readonly notified: boolean;
  /** Present on a reissue: the grant this one replaced. */
  readonly reissuedFromGrantId?: GrantId | undefined;
}

export interface RecordGrantRevokedInput {
  readonly grantId: GrantId;
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  readonly reason: string;
  /** The revoking actor. `APP4-B07` supplies an Admin; issuance supplies none. */
  readonly actor?: AuditActor | undefined;
}

@Injectable()
export class SecureGrantAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** @requiresTransaction — must commit with the grant insert, or not at all. */
  async recordIssued(input: RecordGrantIssuedInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'CUSTOMER', customerId: input.customerId, grantId: input.grantId },
      action: input.reissuedFromGrantId === undefined ? GRANT_ISSUED_ACTION : GRANT_REISSUED_ACTION,
      targetKind: GRANT_KIND,
      targetId: input.grantId,
      summary: {
        // Spread rather than written as `undefined`: the summary is `jsonb`, and
        // a stored `"orderId": null` on every custom issuance would read as "the
        // order is unknown" rather than "this grant has no order".
        ...(input.customRequestId === undefined ? {} : { customRequestId: input.customRequestId }),
        ...(input.orderId === undefined ? {} : { orderId: input.orderId }),
        scopeKind: input.scopeKind,
        expiresAt: input.expiresAt.toISOString(),
        notified: input.notified,
        ...(input.reissuedFromGrantId === undefined
          ? {}
          : { reissuedFromGrantId: input.reissuedFromGrantId }),
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * @requiresTransaction — must commit with the `ACTIVE → REVOKED` transition.
   *
   * The reason is carried as the audit row's own `reason` column rather than
   * buried in the summary: it is the same operator-supplied string the
   * `ck_secure_access_grants__revoke_reason_required` CHECK insisted on, and an
   * operator reading the trail should not have to open a JSON blob to find it.
   */
  async recordRevoked(input: RecordGrantRevokedInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: input.actor ?? {
        kind: 'CUSTOMER',
        customerId: input.customerId,
        grantId: input.grantId,
      },
      action: GRANT_REVOKED_ACTION,
      targetKind: GRANT_KIND,
      targetId: input.grantId,
      reason: input.reason,
      summary: { customRequestId: input.customRequestId },
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}
