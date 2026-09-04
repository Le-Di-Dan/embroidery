/**
 * The per-process metric registry (`APP12-H03` §3, §10).
 *
 * One registry per process holds every instrument and renders the scrape. It
 * carries the process's own identity as a constant label (`service`), which is
 * the only label a caller never supplies and never can: a series that could
 * claim to come from a different service would make every alert ambiguous.
 *
 * Collectors exist for the gauges that cannot be maintained incrementally —
 * a queue backlog is a property of the database, not of anything this process
 * did. They run at scrape time, are individually error-isolated (a collector
 * that throws must not blank the whole scrape, which is exactly when an
 * operator needs it), and are subject to a bounded timeout so a slow query
 * cannot hold the scrape open (§23).
 */
import { assertLabelValue } from './metric-label';
import {
  Counter,
  DEFAULT_DURATION_BUCKETS,
  Gauge,
  Histogram,
  type AnyInstrument,
  type HistogramDefinition,
  type MetricDefinition,
} from './metric-instruments';

/** Identifies the emitting process. The one label callers may never set. */
export type ServiceName = 'api' | 'worker';

/**
 * A scrape-time gauge producer. Must be bounded and must hold no business
 * lock — `APP12-H03` §8/§23. The registry enforces the time bound; the
 * collector's own query is responsible for the rest.
 */
export interface MetricCollector {
  readonly name: string;
  collect(): Promise<void>;
}

/** How long the whole collector phase may take before the scrape proceeds. */
export const COLLECTOR_TIMEOUT_MS = 2_000;

export class MetricRegistry {
  private readonly instruments = new Map<string, AnyInstrument>();
  private readonly collectors: MetricCollector[] = [];
  private readonly collectorFailures: Counter;
  private readonly seriesDropped: Gauge;

  constructor(readonly service: ServiceName) {
    assertLabelValue('registry', 'service', service);
    this.collectorFailures = this.counter({
      name: 'embroidery_metrics_collector_failures_total',
      help: 'Scrape-time collectors that failed or timed out.',
      labelNames: ['operation'],
    });
    this.seriesDropped = this.gauge({
      name: 'embroidery_metrics_series_dropped',
      help: 'Series refused because a metric family reached its cardinality cap.',
      labelNames: [],
    });
  }

  counter(definition: MetricDefinition): Counter {
    return this.register(new Counter(definition));
  }

  gauge(definition: MetricDefinition): Gauge {
    return this.register(new Gauge(definition));
  }

  histogram(definition: Omit<HistogramDefinition, 'buckets'> & { buckets?: readonly number[] }): Histogram {
    return this.register(
      new Histogram({
        name: definition.name,
        help: definition.help,
        labelNames: definition.labelNames,
        buckets: definition.buckets ?? DEFAULT_DURATION_BUCKETS,
      }),
    );
  }

  registerCollector(collector: MetricCollector): void {
    this.collectors.push(collector);
  }

  /** Every instrument, in registration order. */
  list(): readonly AnyInstrument[] {
    return [...this.instruments.values()];
  }

  /** Total series refused across all families; `0` in a healthy process. */
  droppedSeries(): number {
    let total = 0;
    for (const instrument of this.instruments.values()) {
      total += instrument.dropped();
    }
    return total;
  }

  /** Runs every collector under one shared deadline. Never throws. */
  async runCollectors(): Promise<void> {
    if (this.collectors.length === 0) {
      this.seriesDropped.set({}, this.droppedSeries());
      return;
    }
    const deadline = new Promise<'timeout'>((resolve) => {
      const timer = setTimeout(() => {
        resolve('timeout');
      }, COLLECTOR_TIMEOUT_MS);
      // The scrape must not keep the process alive; an idle worker between
      // scrapes should still be able to exit on SIGTERM.
      timer.unref?.();
    });
    await Promise.all(
      this.collectors.map(async (collector) => {
        const outcome = await Promise.race([
          collector.collect().then(
            () => 'ok' as const,
            () => 'failed' as const,
          ),
          deadline,
        ]);
        if (outcome !== 'ok') {
          this.collectorFailures.inc({ operation: collector.name });
        }
      }),
    );
    this.seriesDropped.set({}, this.droppedSeries());
  }

  /** Test-only: clears every series without discarding the instruments. */
  resetForTests(): void {
    for (const instrument of this.instruments.values()) {
      instrument.reset();
    }
  }

  private register<TInstrument extends AnyInstrument>(instrument: TInstrument): TInstrument {
    const existing = this.instruments.get(instrument.name);
    if (existing !== undefined) {
      throw new Error(`Metric "${instrument.name}" is already registered.`);
    }
    this.instruments.set(instrument.name, instrument);
    return instrument;
  }
}
