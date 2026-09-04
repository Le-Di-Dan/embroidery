/**
 * The three instrument types this platform exposes (`APP12-H03` §6–§9).
 *
 * Deliberately three and no more. A counter answers "how many", a gauge answers
 * "how many right now", and a histogram answers "how long". Summaries,
 * exemplars, native histograms and info metrics are all things Prometheus
 * supports and this system has no question for, so they are not here — §1 asks
 * for the smallest stack that satisfies the outcome, not for a client library.
 *
 * Every instrument refuses to observe a value it cannot represent honestly: a
 * counter never decreases, a histogram never records a negative or non-finite
 * duration, and a series that would exceed the family cap is dropped and
 * counted rather than created.
 */
import { assertLabelNames, assertMetricName, type MetricLabelName } from './metric-label';
import { SeriesStore, type MetricLabels, type MetricSeries } from './metric-series';

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly MetricLabelName[];
}

export interface HistogramDefinition extends MetricDefinition {
  /** Upper bounds in seconds, strictly ascending. `+Inf` is implicit. */
  readonly buckets: readonly number[];
}

/**
 * Request and job durations, in seconds. Chosen for a system whose fast paths
 * are single-digit milliseconds and whose slow paths are a database round trip
 * plus an object-storage write — not for a high-throughput service, where the
 * sub-millisecond buckets would matter and the 10s bucket would not.
 */
export const DEFAULT_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

export interface HistogramValue {
  readonly counts: number[];
  sum: number;
  count: number;
}

interface Instrument {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  readonly labelNames: readonly MetricLabelName[];
  /** Series dropped because the family cap was reached. */
  readonly dropped: () => number;
}

abstract class BaseInstrument<TValue> implements Instrument {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly MetricLabelName[];
  protected readonly store: SeriesStore<TValue>;
  private droppedCount = 0;

  protected constructor(definition: MetricDefinition, initial: () => TValue) {
    assertMetricName(definition.name);
    assertLabelNames(definition.name, definition.labelNames);
    this.name = definition.name;
    this.help = definition.help;
    this.labelNames = definition.labelNames;
    this.store = new SeriesStore<TValue>(definition.name, definition.labelNames, initial);
  }

  abstract get type(): MetricType;

  dropped(): number {
    return this.droppedCount;
  }

  entries(): readonly MetricSeries<TValue>[] {
    return this.store.entries();
  }

  reset(): void {
    this.store.reset();
    this.droppedCount = 0;
  }

  protected series(labels: MetricLabels): MetricSeries<TValue> | undefined {
    const resolved = this.store.resolve(labels);
    if (resolved === undefined) {
      this.droppedCount += 1;
    }
    return resolved;
  }
}

/** A monotonically increasing count. */
export class Counter extends BaseInstrument<number> {
  constructor(definition: MetricDefinition) {
    super(definition, () => 0);
  }

  get type(): MetricType {
    return 'counter';
  }

  inc(labels: MetricLabels = {}, amount = 1): void {
    if (!Number.isFinite(amount) || amount < 0) {
      // A negative increment is a caller bug, not a data point. Silently
      // ignoring it keeps the counter monotonic, which every `rate()` in every
      // alert rule depends on.
      return;
    }
    const series = this.series(labels);
    if (series !== undefined) {
      series.value += amount;
    }
  }
}

/** A value that can move in both directions. */
export class Gauge extends BaseInstrument<number> {
  constructor(definition: MetricDefinition) {
    super(definition, () => 0);
  }

  get type(): MetricType {
    return 'gauge';
  }

  set(labels: MetricLabels, value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const series = this.series(labels);
    if (series !== undefined) {
      series.value = value;
    }
  }

  add(labels: MetricLabels, delta: number): void {
    if (!Number.isFinite(delta)) {
      return;
    }
    const series = this.series(labels);
    if (series !== undefined) {
      series.value += delta;
    }
  }
}

/** Cumulative bucket counts plus a sum, the Prometheus histogram shape. */
export class Histogram extends BaseInstrument<HistogramValue> {
  readonly buckets: readonly number[];

  constructor(definition: HistogramDefinition) {
    const buckets = [...definition.buckets];
    super(definition, () => ({ counts: buckets.map(() => 0), sum: 0, count: 0 }));
    this.buckets = buckets;
  }

  get type(): MetricType {
    return 'histogram';
  }

  /** Records one observation in seconds. Non-finite or negative is ignored. */
  observe(labels: MetricLabels, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return;
    }
    const series = this.series(labels);
    if (series === undefined) {
      return;
    }
    for (let index = 0; index < this.buckets.length; index += 1) {
      const bound = this.buckets[index];
      if (bound !== undefined && seconds <= bound) {
        const current = series.value.counts[index];
        series.value.counts[index] = (current ?? 0) + 1;
      }
    }
    series.value.sum += seconds;
    series.value.count += 1;
  }
}

export type AnyInstrument = Counter | Gauge | Histogram;
