/**
 * The Wave-1 commerce metric families (`APP12-H03` §7).
 *
 * One factory, called once per process, returning a typed recorder. The typing
 * is the point: a caller cannot pass a label the family did not declare, cannot
 * pass an outcome outside the three-way split, and cannot reach the registry to
 * mint a family of its own. Everything a dashboard or an alert rule in this
 * checkpoint reads is declared here.
 *
 * These are *evidence*, never business state (§7). Nothing in this file writes
 * to a business table, participates in a transaction, or changes what the
 * caller returns — a recorder that threw would be a telemetry bug turning into
 * a commerce outage, so the instruments themselves never throw on a bad
 * observation, they drop it.
 */
import type { MetricDefinition } from '../metrics/metric-instruments';
import type { MetricRegistry } from '../metrics/metric-registry';
import type {
  MetricFulfilmentTransition,
  MetricOutcome,
  MetricReservationTransition,
} from './metric-vocabulary';

export interface OrderCreateObservation {
  readonly origin: string;
  readonly outcome: MetricOutcome;
  readonly reasonClass: string;
  readonly durationSeconds: number;
}

export interface PaymentVerificationObservation {
  readonly paymentKind: string;
  readonly outcome: MetricOutcome;
  readonly reasonClass: string;
  readonly durationSeconds: number;
}

export interface ReservationObservation {
  readonly transition: MetricReservationTransition;
  readonly outcome: MetricOutcome;
  readonly reasonClass: string;
  /**
   * How many reservations this observation stands for. Defaults to one.
   *
   * The expiry sweep releases a batch in a single pass, and recording one
   * increment per pass would under-count every reservation but the first —
   * making "are reservations being released" answerable only as yes/no.
   */
  readonly count?: number;
}

export interface FulfilmentObservation {
  readonly transition: MetricFulfilmentTransition;
  readonly origin: string;
  readonly outcome: MetricOutcome;
  readonly reasonClass: string;
}

export interface CommerceMetrics {
  recordOrderCreate(observation: OrderCreateObservation): void;
  recordPaymentVerification(observation: PaymentVerificationObservation): void;
  recordReservation(observation: ReservationObservation): void;
  recordFulfilment(observation: FulfilmentObservation): void;
}

/**
 * The reservation family, declared once and registered by **both** processes.
 *
 * The API owns `create`, `consume` and `release`; the worker's expiry sweep
 * owns `expire`. Both emit the same family with the same labels, and the
 * registry's own `service` label is what tells them apart — which is exactly
 * how Prometheus is meant to work, and is why the definition is shared rather
 * than written twice and allowed to drift.
 */
export const RESERVATION_TOTAL = {
  name: 'embroidery_inventory_reservation_total',
  help: 'Inventory reservation transitions by kind and outcome.',
  labelNames: ['transition', 'outcome', 'reason_class'],
} as const satisfies MetricDefinition;

export function createCommerceMetrics(registry: MetricRegistry): CommerceMetrics {
  // `reason_class` is on the total but not on the duration histogram: a
  // histogram multiplies its series by its bucket count, and "how long did a
  // refusal for this particular reason take" is not a question any alert or
  // panel in this checkpoint asks.
  const orderCreateTotal = registry.counter({
    name: 'embroidery_order_create_total',
    help: 'Order-creation attempts by origin and outcome.',
    labelNames: ['origin', 'outcome', 'reason_class'],
  });
  const orderCreateDuration = registry.histogram({
    name: 'embroidery_order_create_duration_seconds',
    help: 'Order-creation transaction duration.',
    labelNames: ['origin', 'outcome'],
  });

  const verificationTotal = registry.counter({
    name: 'embroidery_payment_verification_total',
    help: 'Admin payment verification decisions by obligation kind and outcome.',
    labelNames: ['payment_kind', 'outcome', 'reason_class'],
  });
  const verificationDuration = registry.histogram({
    name: 'embroidery_payment_verification_duration_seconds',
    help: 'Admin payment verification transaction duration.',
    labelNames: ['payment_kind', 'outcome'],
  });

  const reservationTotal = registry.counter(RESERVATION_TOTAL);

  const fulfilmentTotal = registry.counter({
    name: 'embroidery_fulfilment_transition_total',
    help: 'Fulfilment transitions by kind, order origin and outcome.',
    labelNames: ['transition', 'origin', 'outcome', 'reason_class'],
  });

  return {
    recordOrderCreate(observation) {
      orderCreateTotal.inc({
        origin: observation.origin,
        outcome: observation.outcome,
        reason_class: observation.reasonClass,
      });
      orderCreateDuration.observe(
        { origin: observation.origin, outcome: observation.outcome },
        observation.durationSeconds,
      );
    },
    recordPaymentVerification(observation) {
      verificationTotal.inc({
        payment_kind: observation.paymentKind,
        outcome: observation.outcome,
        reason_class: observation.reasonClass,
      });
      verificationDuration.observe(
        { payment_kind: observation.paymentKind, outcome: observation.outcome },
        observation.durationSeconds,
      );
    },
    recordReservation(observation) {
      reservationTotal.inc(
        {
          transition: observation.transition,
          outcome: observation.outcome,
          reason_class: observation.reasonClass,
        },
        observation.count ?? 1,
      );
    },
    recordFulfilment(observation) {
      fulfilmentTotal.inc({
        transition: observation.transition,
        origin: observation.origin,
        outcome: observation.outcome,
        reason_class: observation.reasonClass,
      });
    },
  };
}
