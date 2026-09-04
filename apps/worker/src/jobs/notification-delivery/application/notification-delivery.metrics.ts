/**
 * Telemetry for notification delivery (`APP12-H03` §7, §15).
 *
 * §7 asks for `ORDER_ACCESS` and verification delivery success and failure by
 * name, and §15 requires an alert when `ORDER_ACCESS` delivery fails — because
 * an undelivered `ORDER_ACCESS` link is a customer who has paid and cannot open
 * their own order, and nothing else in the system will notice.
 *
 * ## The purpose is inside the ciphertext
 *
 * A delivery's purpose is not a column: `APP12-S03-C1` put the landing inside
 * the sealed envelope precisely so the worker could not read the routing target
 * from a grant table. So the operation label is derived from the two fields the
 * *opened* envelope carries — its secret kind and, for a link, its landing —
 * and a delivery whose envelope could not be opened contributes `other`.
 *
 * Nothing here touches the secret. The recorder receives two closed-vocabulary
 * discriminators, never the plaintext, never the recipient, and never the
 * rendered URL — which is why it takes them as parameters rather than the
 * opened delivery itself.
 */
import { Injectable } from '@nestjs/common';
import type { MetricNotificationOperation } from '@embroidery/observability';
import { reasonClass } from '@embroidery/observability';

import { WorkerRuntimeMetrics } from '../../../runtime/metrics/worker-metrics.providers';

const SECURE_LINK_TOKEN = 'SECURE_LINK_TOKEN';
const VERIFICATION_CODE = 'VERIFICATION_CODE';
const ORDER_ACCESS_LANDING = 'ORDER_ACCESS';
const REQUEST_ACCESS_LANDING = 'REQUEST_ACCESS';

/**
 * Projects the two envelope discriminators onto the operation label.
 *
 * Total by construction: anything not recognised is `other`, so a secret kind
 * or landing added by a later checkpoint produces a bounded label rather than
 * an unbounded one, and shows up as a rising `other` series that says "this
 * needs a name" instead of breaking the scrape.
 */
export function notificationOperation(
  secretKind: string,
  landing: string | undefined,
): MetricNotificationOperation {
  if (secretKind === VERIFICATION_CODE) {
    return 'verification';
  }
  if (secretKind === SECURE_LINK_TOKEN) {
    if (landing === ORDER_ACCESS_LANDING) {
      return 'order_access';
    }
    if (landing === REQUEST_ACCESS_LANDING) {
      return 'request_access';
    }
  }
  return 'other';
}

@Injectable()
export class NotificationDeliveryMetrics {
  constructor(private readonly metrics: WorkerRuntimeMetrics) {}

  /** A delivery that reached the transport and was accepted. */
  delivered(secretKind: string, landing: string | undefined): void {
    this.metrics.recordNotification({
      operation: notificationOperation(secretKind, landing),
      outcome: 'success',
      reasonClass: 'other',
    });
  }

  /**
   * A delivery that did not reach its recipient.
   *
   * `system_error`, not `refused`, for every failure class this domain
   * publishes. That is deliberate and is the one place in this checkpoint where
   * the three-way split is applied differently from the commerce seams: an
   * unreadable envelope, an unavailable transport and a rejected recipient are
   * all *operational* faults an operator must act on. There is no such thing as
   * an expected, healthy failure to deliver a customer's only access link.
   */
  failed(
    secretKind: string | undefined,
    landing: string | undefined,
    failure: string | undefined,
  ): void {
    this.metrics.recordNotification({
      operation: notificationOperation(secretKind ?? '', landing),
      outcome: 'system_error',
      reasonClass: reasonClass(failure),
    });
  }
}
