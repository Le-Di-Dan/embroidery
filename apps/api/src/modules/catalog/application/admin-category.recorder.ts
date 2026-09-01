/**
 * The durable evidence an Admin category mutation leaves (`APP12-C02`).
 *
 * One place that knows the category audit and outbox vocabulary, modelled
 * exactly on `product-publication.recorder.ts`: lowercase dot-namespaced
 * actions and event types, a `SCREAMING_SNAKE` kind, a bounded `summary`, the
 * request id as the correlation id, and the acting Admin taken from the bound
 * request actor with no fallback.
 *
 * No event bus is invented here (§22 of the checkpoint brief). `audit_events`
 * and `outbox_events` are the conventions this repository already uses for
 * Admin mutations, and both writes join the caller's transaction — a category
 * that went public without its audit row would be an unexplained change, and an
 * outbox event that committed without the transition would announce a
 * visibility change that never happened.
 *
 * ## Why only the lifecycle transitions reach the outbox
 *
 * The outbox exists for facts a *consumer outside this transaction* must act on.
 * Publishing and archiving change what anonymous callers can see, which is the
 * delist/relist event LC-04 specifies. Creating a draft changes nothing public,
 * and a field edit is already visible on the next read of a `no-store`
 * inventory. Every mutation is audited; only the two that change public
 * visibility are announced.
 */
import { Inject, Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditActor,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import { AuditClock } from '../../../platform/audit-context/audit-clock';

/** The audit `target_kind` and outbox `aggregate_kind` for a category. */
const CATEGORY_KIND = 'CATEGORY' as const;

/** One action per operator intent; none is ever recorded as another. */
export const CATEGORY_CREATED_ACTION = 'category.created';
export const CATEGORY_UPDATED_ACTION = 'category.updated';
export const CATEGORY_PUBLISHED_ACTION = 'category.published';
export const CATEGORY_ARCHIVED_ACTION = 'category.archived';

/** The outbox event types, deliberately identical to the audit actions. */
export const CATEGORY_PUBLISHED_EVENT = CATEGORY_PUBLISHED_ACTION;
export const CATEGORY_ARCHIVED_EVENT = CATEGORY_ARCHIVED_ACTION;

/** Payload version, carried in the row and in the payload itself. */
export const CATEGORY_PAYLOAD_VERSION = 1;

export type AdminCategoryMutation = 'CREATED' | 'UPDATED' | 'PUBLISHED' | 'ARCHIVED';

const ACTION_BY_MUTATION: Record<AdminCategoryMutation, string> = {
  CREATED: CATEGORY_CREATED_ACTION,
  UPDATED: CATEGORY_UPDATED_ACTION,
  PUBLISHED: CATEGORY_PUBLISHED_ACTION,
  ARCHIVED: CATEGORY_ARCHIVED_ACTION,
};

/** The two mutations that change what an anonymous caller can see. */
const OUTBOX_EVENT_BY_MUTATION: Partial<Record<AdminCategoryMutation, string>> = {
  PUBLISHED: CATEGORY_PUBLISHED_EVENT,
  ARCHIVED: CATEGORY_ARCHIVED_EVENT,
};

export interface RecordCategoryMutationInput {
  readonly mutation: AdminCategoryMutation;
  readonly categoryId: string;
  /** Server-owned; the public key a consumer would revalidate. */
  readonly slug: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  /**
   * Which fields a patch actually changed — field **names** only, never their
   * values. An operator needs to know that the address changed; the audit row
   * is not the place to republish the taxonomy.
   */
  readonly changedFields?: readonly string[] | undefined;
}

@Injectable()
export class AdminCategoryRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /**
   * Appends the audit row, and the outbox event when the mutation changes
   * public visibility.
   *
   * @requiresTransaction — every write must commit with the mutation or not at
   * all.
   */
  async record(input: RecordCategoryMutationInput): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action: ACTION_BY_MUTATION[input.mutation],
      targetKind: CATEGORY_KIND,
      targetId: input.categoryId,
      // Bounded and safe: the before/after status is the point of the record and
      // the changed-field names are our own literals. Never a name, a slug
      // value, a product, an actor identity, a raw error or SQL.
      summary: {
        from: input.fromStatus,
        to: input.toStatus,
        ...(input.changedFields === undefined ? {} : { fields: [...input.changedFields] }),
      },
      correlationId: this.requestContext.requireRequestId(),
    });

    const eventType = OUTBOX_EVENT_BY_MUTATION[input.mutation];
    if (eventType === undefined) {
      return;
    }

    await this.outbox.append({
      eventType,
      aggregateKind: CATEGORY_KIND,
      aggregateId: input.categoryId,
      // Minimal and versioned: a consumer reads the row for anything else, so
      // nothing here can go stale or leak.
      payload: {
        schemaVersion: CATEGORY_PAYLOAD_VERSION,
        categoryId: input.categoryId,
        slug: input.slug,
      },
      payloadSchemaVersion: CATEGORY_PAYLOAD_VERSION,
    });
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * Never derived from the request body or the row: the actor is whatever
   * authentication established, and there is no fallback — an unattributable
   * taxonomy change must fail rather than be filed against a fabricated
   * identity.
   */
  private currentActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      // The guard admits only an authenticated Admin, so this is unreachable
      // through HTTP; it stays as a hard stop rather than a silent coercion.
      throw new Error('An Admin category mutation requires an Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}
