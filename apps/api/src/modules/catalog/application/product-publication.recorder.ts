/**
 * The durable evidence a publication transition leaves (`APP2-B03` §12/§13).
 *
 * One place that knows the publication audit and outbox vocabulary, so no use
 * case hand-assembles either row — the same shape `StaffAuditWriter` already
 * uses for staff actions.
 *
 * Both writes join the caller's transaction. That is the whole point: a product
 * that went public without its audit row would be an unexplained change, and an
 * outbox event that committed without the transition would announce a
 * visibility change that never happened.
 *
 * The names are not invented here. `APP2-B03-G01` locked them against the
 * implemented writers' conventions — lowercase dot-namespaced actions and event
 * types, `SCREAMING_SNAKE` kinds — and recorded them in
 * `DB3_AUDIT_SPECIFICATION.md` as the authority this file must match.
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

/** The audit `target_kind` and outbox `aggregate_kind` for a product. */
const PRODUCT_KIND = 'PRODUCT' as const;

/** Locked by IMP-D035; publish and unpublish are never recorded as each other. */
export const PRODUCT_PUBLISHED_ACTION = 'product.published';
export const PRODUCT_UNPUBLISHED_ACTION = 'product.unpublished';

/** The outbox event types, deliberately identical to the audit actions. */
export const PRODUCT_PUBLISHED_EVENT = PRODUCT_PUBLISHED_ACTION;
export const PRODUCT_UNPUBLISHED_EVENT = PRODUCT_UNPUBLISHED_ACTION;

/** Payload version, carried in the row and in the payload itself. */
export const PRODUCT_PUBLICATION_PAYLOAD_VERSION = 1;

export type ProductPublicationTransition = 'PUBLISHED' | 'UNPUBLISHED';

export interface RecordPublicationInput {
  readonly transition: ProductPublicationTransition;
  readonly productId: string;
  /** Server-owned; the public address the consumer will revalidate. */
  readonly slug: string;
  readonly fromStatus: string;
  readonly toStatus: string;
}

@Injectable()
export class ProductPublicationRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /**
   * Appends the audit row and the outbox event for one transition.
   *
   * @requiresTransaction — both must commit with the transition or not at all.
   */
  async record(input: RecordPublicationInput): Promise<void> {
    const action =
      input.transition === 'PUBLISHED' ? PRODUCT_PUBLISHED_ACTION : PRODUCT_UNPUBLISHED_ACTION;

    await this.events.append({
      occurredAt: this.clock.now(),
      actor: this.currentActor(),
      action,
      targetKind: PRODUCT_KIND,
      targetId: input.productId,
      // Bounded and safe: the before/after status is the whole point of the
      // record, and the correlation id is a column. Never the description,
      // price, media, Asset ids, storage facts, the full product, credentials,
      // cookies, headers, a raw error or SQL.
      summary: { from: input.fromStatus, to: input.toStatus },
      // Deliberately no `reason`. The `R` on the Product/catalog audit row is
      // archive/unarchive only; the approved publication command carries a
      // concurrency token and nothing else, so a required reason here would
      // have to be fabricated by the server (`DB3_AUDIT_SPECIFICATION.md`).
      correlationId: this.requestContext.requireRequestId(),
    });

    await this.outbox.append({
      eventType:
        input.transition === 'PUBLISHED' ? PRODUCT_PUBLISHED_EVENT : PRODUCT_UNPUBLISHED_EVENT,
      aggregateKind: PRODUCT_KIND,
      aggregateId: input.productId,
      // Minimal and versioned, the same rule the asset-inspection event follows:
      // a consumer reads the product row for anything else, so nothing here can
      // go stale or leak. No snapshot, no price, no Admin identity.
      payload: {
        schemaVersion: PRODUCT_PUBLICATION_PAYLOAD_VERSION,
        productId: input.productId,
        slug: input.slug,
      },
      payloadSchemaVersion: PRODUCT_PUBLICATION_PAYLOAD_VERSION,
    });
  }

  /**
   * The acting Admin, taken from the bound request actor.
   *
   * Never derived from the request body or the product row: the actor is
   * whatever authentication established, and there is no fallback — an
   * unattributable publication must fail rather than be filed against a
   * fabricated identity.
   */
  private currentActor(): AuditActor {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      // The guard admits only an authenticated Admin, so this is unreachable
      // through HTTP; it stays as a hard stop rather than a silent coercion.
      throw new Error('A product publication transition requires an Admin actor.');
    }
    return { kind: 'ADMIN', adminId: actor.adminId };
  }
}
