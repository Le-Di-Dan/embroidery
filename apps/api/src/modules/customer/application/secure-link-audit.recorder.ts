/**
 * The evidence a secure-link resolution leaves (`APP4-B06` §13, `INV-14`,
 * `ADR-DB3-004` r11 — grant "use" is audited).
 *
 * Two records, and the interesting one is the failure.
 *
 * ### Success — the actor is real
 *
 * After a grant resolves, the caller's identity is exactly what the grant says
 * it is: this customer, holding this grant, for this request. `AuditActor`
 * already models that pair (`{ kind: 'CUSTOMER', customerId, grantId }`), so
 * nothing has to be invented and the FK to `customers` resolves.
 *
 * ### Unavailable — the actor is `SYSTEM`, and that is the honest answer
 *
 * Before a grant resolves there is **no identity at all**. The token may name
 * nothing; it may be a random string. So the row cannot claim a customer, and
 * `ANONYMOUS` is not persistable (`audit_events` CST-072 requires a reference
 * per actor kind).
 *
 * This is the same problem `StaffAuditWriter.loginFailed` solved, and it is
 * solved the same way: a `SYSTEM` actor naming the subsystem that recorded the
 * security signal, a **sentinel target id** rather than a fabricated grant id,
 * and a bounded `failureCode`. `APP4-B05` chose `CUSTOMER` for issuance because
 * a customer genuinely existed; here one does not, and picking the same actor
 * kind would file an attacker's probe against whichever customer the code
 * guessed at.
 *
 * `targetKind` stays `SECURE_ACCESS_GRANT` — the row is about a grant even when
 * no grant was found — and `targetId` is the constant {@link RESOLVE_TARGET},
 * which is not a uuid and cannot collide with one. G-DB7-46 makes the
 * polymorphic target FK-free precisely so a row can describe something that does
 * not exist.
 *
 * ### The failure code is generic on purpose
 *
 * `SECURE_LINK_UNAVAILABLE` — the same class for all six causes. The resolver
 * runs one fixed-shape query and never asks a second question to find out *why*
 * a row was absent, so it genuinely does not know; recording a cause would mean
 * adding the diagnostic read that §9 forbids. An operator investigating abuse
 * gets the rate and the correlation ids, which is what a probe looks like.
 *
 * Nothing here writes a token, a digest, a rendered URL, a contact or an address.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { CustomerId } from '../domain/repositories/customer.repository';
import type { GrantId } from '../domain/repositories/secure-access-grant.repository';

/** The polymorphic target kind. Already in the closed set. */
const GRANT_KIND = 'SECURE_ACCESS_GRANT' as const;

/**
 * Sentinel target for a resolution that found nothing.
 *
 * Not a uuid, so it can never be mistaken for — or collide with — a real grant
 * id, and a query for "events about grant X" can never accidentally include it.
 */
export const RESOLVE_TARGET = 'secure_link_resolve';

/** The automated actor when no identity exists to attribute the attempt to. */
const SECURE_LINK_JOB_KEY = 'customer.secure_link';

/** A live grant was presented and resolved (`ADR-DB3-004` r11 — grant use). */
export const SECURE_LINK_RESOLVED_ACTION = 'secure_link.resolved';

/** A well-formed credential did not resolve. One class for all six causes. */
export const SECURE_LINK_UNAVAILABLE_ACTION = 'secure_link.unavailable';

/** The one bounded failure class written to `failure_code`. */
export const SECURE_LINK_UNAVAILABLE_FAILURE = 'SECURE_LINK_UNAVAILABLE';

export interface RecordResolvedInput {
  readonly grantId: GrantId;
  readonly customerId: CustomerId;
  readonly customRequestId: string;
  readonly scopeKind: string;
}

@Injectable()
export class SecureLinkAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** A resolution that succeeded. The actor is the grant's own customer. */
  async recordResolved(input: RecordResolvedInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'CUSTOMER', customerId: input.customerId, grantId: input.grantId },
      action: SECURE_LINK_RESOLVED_ACTION,
      targetKind: GRANT_KIND,
      targetId: input.grantId,
      summary: { customRequestId: input.customRequestId, scopeKind: input.scopeKind },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * A resolution that found nothing.
   *
   * Takes **no argument**. There is nothing safe to pass: the only datum the
   * request carried was the token, and the only thing derived from it was a
   * digest — both of which are exactly what must not be recorded. The
   * correlation id ties the row to the request log, which is where the rate and
   * the route already live.
   */
  async recordUnavailable(): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'SYSTEM', systemJobKey: SECURE_LINK_JOB_KEY },
      action: SECURE_LINK_UNAVAILABLE_ACTION,
      targetKind: GRANT_KIND,
      targetId: RESOLVE_TARGET,
      failureCode: SECURE_LINK_UNAVAILABLE_FAILURE,
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}
