/**
 * Appending the normalization requests a placement replace produced
 * (`APP3-B01N`; IMP-D046 PO-04/PO-05).
 *
 * The whole checkpoint is one property: the event and the row it describes
 * commit together or neither does. So this joins the caller's transaction and
 * runs **after** the Sides are written — an event appended before the row exists
 * would name an id the consumer cannot resolve, and one appended after the
 * commit would survive a rollback and ask for work on a Side nobody kept.
 *
 * The vocabulary is `@embroidery/domain-types`', not this file's: the payload is
 * built by the shared builder, so the producer cannot announce a schema or a
 * policy version this deployment does not implement, and cannot add a field —
 * there is no parameter that would carry one. Nothing here names a profile. The
 * profile is the consumer's to derive from the association (`IMP-D046` PO-03),
 * and a producer that stated one would be asserting something it has no standing
 * to assert.
 */
import { Injectable } from '@nestjs/common';
import {
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  buildAssetNormalizationRequestedPayload,
} from '@embroidery/domain-types';
import { OutboxEventStore } from '@embroidery/persistence';

import type { SideNormalizationIntent } from './product-placement.normalization';

/**
 * The outbox `aggregate_kind` for this event.
 *
 * The Asset, not the Product Side: the durable effect is one derivative per
 * Asset (`IMP-D046` PO-08), and the aggregate an event is filed against should
 * be the thing whose state it changes. The Side is carried in the payload as the
 * association that authorized the request.
 */
const ASSET_KIND = 'ASSET' as const;

@Injectable()
export class ProductPlacementNormalizationRecorder {
  constructor(private readonly outbox: OutboxEventStore) {}

  /**
   * Appends one event per scheduled association, in the given order.
   *
   * @requiresTransaction — an event without its Side, or a Side without its
   * event, is the failure the outbox pattern exists to prevent.
   */
  async record(intents: readonly SideNormalizationIntent[]): Promise<void> {
    for (const intent of intents) {
      await this.outbox.append({
        eventType: ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
        aggregateKind: ASSET_KIND,
        aggregateId: intent.assetId,
        payload: {
          ...buildAssetNormalizationRequestedPayload({
            assetId: intent.assetId,
            associationRef: {
              kind: 'PRODUCT_SIDE_BACKGROUND',
              productSideId: intent.productSideId,
            },
          }),
        },
        payloadSchemaVersion: ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
      });
    }
  }
}
