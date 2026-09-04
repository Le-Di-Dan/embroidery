/**
 * The API's injectable view of the shared metrics platform (`APP12-H03` §6, §7).
 *
 * `@embroidery/observability` owns the instruments and the contract; these
 * classes are the Nest seam onto them. They exist for two reasons and no
 * others: a use case must be able to receive a recorder through the constructor
 * like every other collaborator, and there must be exactly one registry per
 * process — a second one would silently double-register every family and throw
 * at boot.
 *
 * They add no logic. A recorder that made a decision would be a place where the
 * telemetry and the domain could disagree about what happened.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  MetricRegistry,
  createCommerceMetrics,
  createDependencyMetrics,
  createHttpMetrics,
  type CommerceMetrics,
  type DependencyMetrics,
  type FulfilmentObservation,
  type HttpMetrics,
  type HttpObservation,
  type MetricDependency,
  type OrderCreateObservation,
  type PaymentVerificationObservation,
  type ReservationObservation,
} from '@embroidery/observability';

/** DI token for the process-wide registry. */
export const METRIC_REGISTRY = Symbol('METRIC_REGISTRY');

/** The one registry this process exposes. Registered once, at module load. */
export function createApiMetricRegistry(): MetricRegistry {
  return new MetricRegistry('api');
}

@Injectable()
export class ApiHttpMetrics {
  private readonly http: HttpMetrics;

  constructor(@Inject(METRIC_REGISTRY) registry: MetricRegistry) {
    this.http = createHttpMetrics(registry);
  }

  requestStarted(): void {
    this.http.requestStarted();
  }

  requestCompleted(observation: HttpObservation): void {
    this.http.requestCompleted(observation);
  }

  /**
   * Balances the in-flight gauge for a request that is deliberately not
   * counted — a health probe, or a connection that closed before `finish`.
   * Without it the gauge would only ever climb, and with a counter increment
   * the business request panel would be mostly probe traffic.
   */
  requestCompletedExcluded(): void {
    this.http.requestExcluded();
  }
}

@Injectable()
export class ApiCommerceMetrics {
  private readonly commerce: CommerceMetrics;

  constructor(@Inject(METRIC_REGISTRY) registry: MetricRegistry) {
    this.commerce = createCommerceMetrics(registry);
  }

  recordOrderCreate(observation: OrderCreateObservation): void {
    this.commerce.recordOrderCreate(observation);
  }

  recordPaymentVerification(observation: PaymentVerificationObservation): void {
    this.commerce.recordPaymentVerification(observation);
  }

  recordReservation(observation: ReservationObservation): void {
    this.commerce.recordReservation(observation);
  }

  recordFulfilment(observation: FulfilmentObservation): void {
    this.commerce.recordFulfilment(observation);
  }
}

@Injectable()
export class ApiDependencyMetrics {
  private readonly dependencies: DependencyMetrics;

  constructor(@Inject(METRIC_REGISTRY) registry: MetricRegistry) {
    this.dependencies = createDependencyMetrics(registry);
  }

  recordDependencyError(dependency: MetricDependency, operation: string): void {
    this.dependencies.recordDependencyError(dependency, operation);
  }
}
