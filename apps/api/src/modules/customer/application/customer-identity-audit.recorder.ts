/**
 * The durable evidence an identity link leaves (`APP4-B02` §13, `INV-14`,
 * `ADR-DB2-001` r5 — "every link/attach is audited").
 *
 * One row per **mutation**, and only per mutation. Resolving an existing
 * verified contact to its existing customer changes nothing, so it writes
 * nothing: r5 audits the *link*, and a row on every returning verification
 * would be a write on the hottest identity path recording that nothing had
 * happened.
 *
 * ### The actor is the customer
 *
 * At verification time the request has no bound actor — the caller is anonymous
 * until this very operation establishes who they are — and `ANONYMOUS` is not
 * persistable by design (`audit_events` CST-072 requires a reference for each
 * actor kind). The two available alternatives are both worse than the truth:
 *
 * - `SYSTEM` would claim an automated job did this, which is false; a person
 *   proved possession of a channel.
 * - inventing an admin actor would attribute a customer's action to staff.
 *
 * So the actor is `CUSTOMER` with the customer whose identity was just proven.
 * That is exactly what `ADR-DB2-001` r3 says identity *is* — verified contact
 * possession — and it makes the row self-consistent: `customer_id` is both the
 * actor and the target, and the FK to `customers` resolves because the row is
 * written inside the transaction that created it.
 *
 * ### The summary carries no contact
 *
 * Only server-derived, bounded values: the contact **kind** (`EMAIL`/`PHONE`),
 * the server-generated contact point id, and whether it became the primary. Not
 * the normalized value, not the display value, not `verified_source` (which is
 * caller-supplied and already on the contact row), and not a masked form — a
 * mask is still derived from the address and an audit summary is not the place
 * to keep one.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContactKind } from '@embroidery/database';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { ContactPointId, CustomerId } from '../domain/repositories/customer.repository';

/** The audit `target_kind` for a customer. Already in the closed set. */
const CUSTOMER_KIND = 'CUSTOMER' as const;

/**
 * A customer came into existence with its first verified contact.
 *
 * Lowercase dot-namespaced, as every delivered action is. No canonical name for
 * this existed in any authority — `DB3_AUDIT_SPECIFICATION.md` names no customer
 * identity actions — so the two below are introduced here and stay distinct: an
 * operator reading the trail must be able to tell an identity being *born* from
 * a further channel being added to one that already existed.
 */
export const CUSTOMER_IDENTITY_CREATED_ACTION = 'customer.identity_created';

/** A further verified contact was attached to an existing customer. */
export const CUSTOMER_CONTACT_ATTACHED_ACTION = 'customer.contact_attached';

export interface RecordIdentityLinkInput {
  readonly customerId: CustomerId;
  readonly contactPointId: ContactPointId;
  readonly contactKind: ContactKind;
  readonly isPrimary: boolean;
}

@Injectable()
export class CustomerIdentityAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** @requiresTransaction — must commit with the customer, or not at all. */
  async recordIdentityCreated(input: RecordIdentityLinkInput): Promise<void> {
    await this.append(CUSTOMER_IDENTITY_CREATED_ACTION, input);
  }

  /** @requiresTransaction — must commit with the attachment, or not at all. */
  async recordContactAttached(input: RecordIdentityLinkInput): Promise<void> {
    await this.append(CUSTOMER_CONTACT_ATTACHED_ACTION, input);
  }

  private async append(action: string, input: RecordIdentityLinkInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'CUSTOMER', customerId: input.customerId },
      action,
      targetKind: CUSTOMER_KIND,
      targetId: input.customerId,
      summary: {
        contactPointId: input.contactPointId,
        contactKind: input.contactKind,
        isPrimary: input.isPrimary,
      },
      // No `reason`: nothing in this flow carries one, and a fabricated reason is
      // worse evidence than none.
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}
