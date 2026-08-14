/**
 * The delivery failure taxonomy (`APP4-W01` §13).
 *
 * Two properties are asserted rather than the individual mappings, because the
 * mappings are data and the properties are the design:
 *
 * - every class maps to something, so a class added later cannot be silently
 *   unclassified for the runtime;
 * - every deterministic class maps onto a worker class the runtime treats as
 *   terminal regardless of remaining budget, so an unreadable envelope can never
 *   be retried against a key that will not help.
 */
import {
  NOTIFICATION_DELIVERY_FAILURES,
  NotificationDeliveryError,
  isRetryableDeliveryFailure,
  workerClassOf,
} from './delivery-failure';
import { WORKER_ERROR_CLASSES, dispositionOf } from '../../../runtime/errors/worker-job-error';

describe('the notification delivery taxonomy', () => {
  it('maps every class onto the worker taxonomy', () => {
    for (const failure of NOTIFICATION_DELIVERY_FAILURES) {
      expect(WORKER_ERROR_CLASSES).toContain(workerClassOf(failure));
    }
  });

  it('makes every deterministic failure terminal on the first attempt', () => {
    const deterministic = NOTIFICATION_DELIVERY_FAILURES.filter(
      (failure) => !isRetryableDeliveryFailure(failure),
    );

    expect(deterministic.length).toBeGreaterThan(0);
    for (const failure of deterministic) {
      // Attempt 1 of 3: a class that survived here would be retried.
      expect(dispositionOf(workerClassOf(failure), 1, 3)).toBe('TERMINAL');
    }
  });

  it('lets a transport failure and an unpublished policy wait for a later attempt', () => {
    for (const failure of [
      'NOTIFICATION_TRANSPORT_UNAVAILABLE',
      'NOTIFICATION_POLICY_UNAVAILABLE',
    ] as const) {
      expect(isRetryableDeliveryFailure(failure)).toBe(true);
      expect(dispositionOf(workerClassOf(failure), 1, 3)).toBe('RETRYABLE');
      // …and terminal once the budget is spent, without a second decision.
      expect(dispositionOf(workerClassOf(failure), 3, 3)).toBe('TERMINAL');
    }
  });

  it('carries the class as its whole message, exposing no cause', () => {
    const error = new NotificationDeliveryError('NOTIFICATION_ENVELOPE_UNREADABLE');

    expect(error.message).toBe('NOTIFICATION_ENVELOPE_UNREADABLE');
    expect(error.errorClass).toBe('JOB_PAYLOAD_INVALID');
    expect(error.cause).toBeUndefined();
  });
});
