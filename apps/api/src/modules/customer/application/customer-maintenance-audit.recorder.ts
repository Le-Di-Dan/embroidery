/**
 * The durable evidence an Admin maintenance action leaves (`APP10-B01` §10).
 *
 * One row per **actual state change**, and only per actual state change. A
 * patch that set every field to the value it already held, a promotion of the
 * contact that is already primary and a deactivation of a contact that is
 * already retired all write nothing here — an idempotent replay changed no
 * state, and a row claiming otherwise would be a false record in a table that
 * outlives its subject by design (G-DB7-46). The three use cases decide that;
 * this class is reached only once they have.
 *
 * ### The actor is the Admin, and it comes from the session
 *
 * Never from a body, a header or a query parameter. `RequestContextService`
 * carries the actor `AuthenticatedAdminGuard` bound, and the resolver below
 * refuses anything that is not an ADMIN rather than coercing it — the coercion
 * is precisely what would file a staff edit against the customer whose record
 * it changed. This follows `RevokeSecureGrantUseCase.currentAdminActor`.
 *
 * ### The summary carries no contact and no before/after
 *
 * Only server-derived, bounded values: which field *names* changed, the
 * server-generated contact point id, the contact **kind**, and the id of the
 * contact that lost the primary designation.
 *
 * Not the normalized value, not the display value, not a mask — a mask is still
 * derived from a real person's address and an audit summary is not the place to
 * keep one. And not a before/after snapshot of `display_name` or `notes`:
 * `notes` is free text an operator types, so it can hold anything at all,
 * including a customer's address written out in full. Recording *that a field
 * changed* answers the operational question ("who touched this record, and
 * which part of it") without copying its content into a second, append-only
 * table that has no anonymization path of its own.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContactKind } from '@embroidery/database';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { ContactPointId, CustomerId } from '../domain/repositories/customer.repository';

/** The audit `target_kind` for a customer. Already in the closed set. */
const CUSTOMER_KIND = 'CUSTOMER' as const;

/**
 * The three actions, lowercase dot-namespaced as every delivered action is.
 *
 * No canonical name for any of them existed in an authority —
 * `DB3_AUDIT_SPECIFICATION.md` names no customer-maintenance actions — so they
 * are introduced here and stay distinct from `APP4-B02`'s
 * `customer.identity_created` and `customer.contact_attached`. An operator
 * reading the trail must be able to tell a channel being *proven* from a
 * channel being *chosen* or *retired*: the first is the customer's own act, the
 * last two are staff decisions.
 */
export const CUSTOMER_PROFILE_UPDATED_ACTION = 'customer.profile_updated';
export const CUSTOMER_PRIMARY_CONTACT_CHANGED_ACTION = 'customer.primary_contact_changed';
export const CUSTOMER_CONTACT_DEACTIVATED_ACTION = 'customer.contact_deactivated';

/** The bounded profile fields B01 may write. Names only ever reach the trail. */
export type MaintainedProfileField = 'displayName' | 'notes';

export interface RecordProfileUpdatedInput {
  readonly customerId: CustomerId;
  /** Which fields actually changed. Never empty — a no-op writes nothing. */
  readonly changedFields: readonly MaintainedProfileField[];
}

export interface RecordPrimaryContactChangedInput {
  readonly customerId: CustomerId;
  readonly contactPointId: ContactPointId;
  readonly contactKind: ContactKind;
  /** The contact that held the designation, when one did. */
  readonly previousPrimaryContactPointId: ContactPointId | undefined;
}

export interface RecordContactDeactivatedInput {
  readonly customerId: CustomerId;
  readonly contactPointId: ContactPointId;
  readonly contactKind: ContactKind;
}

@Injectable()
export class CustomerMaintenanceAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** @requiresTransaction — must commit with the profile write, or not at all. */
  async recordProfileUpdated(input: RecordProfileUpdatedInput): Promise<void> {
    await this.append(CUSTOMER_PROFILE_UPDATED_ACTION, input.customerId, {
      changedFields: [...input.changedFields],
    });
  }

  /** @requiresTransaction — must commit with the primary rotation, or not at all. */
  async recordPrimaryContactChanged(input: RecordPrimaryContactChangedInput): Promise<void> {
    await this.append(CUSTOMER_PRIMARY_CONTACT_CHANGED_ACTION, input.customerId, {
      contactPointId: input.contactPointId,
      contactKind: input.contactKind,
      // Omitted rather than null when there was none: a customer created from a
      // verified contact always has a primary, but `anonymize` clears the flag,
      // so the absence is representable and must not be reported as an id.
      ...(input.previousPrimaryContactPointId === undefined
        ? {}
        : { previousPrimaryContactPointId: input.previousPrimaryContactPointId }),
    });
  }

  /** @requiresTransaction — must commit with the deactivation, or not at all. */
  async recordContactDeactivated(input: RecordContactDeactivatedInput): Promise<void> {
    await this.append(CUSTOMER_CONTACT_DEACTIVATED_ACTION, input.customerId, {
      contactPointId: input.contactPointId,
      contactKind: input.contactKind,
    });
  }

  private async append(
    action: string,
    customerId: CustomerId,
    summary: Record<string, unknown>,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentAdminActor(),
      action,
      targetKind: CUSTOMER_KIND,
      // The customer, on all three: a contact point has no `target_kind` of its
      // own, and an operator asking "what was done to this customer" must find
      // every one of these rows under one target.
      targetId: customerId,
      summary,
      // No `reason`: none of the three operations takes one, and a fabricated
      // reason is worse evidence than none.
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * A hard stop rather than a fallback, for the reason
   * `RevokeSecureGrantUseCase` records: an unattributable maintenance write must
   * fail rather than be recorded as `SYSTEM`, or as the customer whose record
   * staff just edited.
   */
  private currentAdminActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      throw new Error('Maintaining a customer requires an authenticated Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}
