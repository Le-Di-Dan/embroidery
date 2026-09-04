/**
 * The label-set bookkeeping every metric family shares (`APP12-H03` §5).
 *
 * A metric family is a name plus a fixed list of label names; a *series* is one
 * concrete assignment of values to those names. This file owns the two rules
 * that keep the number of series finite: every value is validated against the
 * contract before a series can exist, and a family refuses to create more than
 * `MAX_SERIES_PER_METRIC` of them.
 *
 * The cap is the backstop, not the design. A correctly-declared metric can
 * never approach it, because every label it carries is drawn from a closed
 * vocabulary. It exists because the cost of being wrong is a monitoring plane
 * that falls over during the incident it was built to explain, and a refused
 * series is a strictly better outcome than an unbounded one.
 */
import { assertLabelValue, type MetricLabelName } from './metric-label';

/** Hard ceiling on distinct label combinations per metric family. */
export const MAX_SERIES_PER_METRIC = 200;

export type MetricLabels = Readonly<Partial<Record<MetricLabelName, string>>>;

export interface MetricSeries<TValue> {
  readonly labels: MetricLabels;
  value: TValue;
}

/** Stable key for a label set: names in declaration order, values escaped. */
export function seriesKey(labelNames: readonly MetricLabelName[], labels: MetricLabels): string {
  return labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join(',');
}

/**
 * Reads the declared labels out of a caller's map and validates each one.
 *
 * A label the family did not declare is ignored rather than stored: silently
 * dropping an undeclared dimension keeps the family's cardinality exactly as
 * declared, and the alternative — accepting it — is how an unbounded label
 * reaches a scrape.
 */
export function resolveLabels(
  metric: string,
  labelNames: readonly MetricLabelName[],
  labels: MetricLabels,
): MetricLabels {
  const resolved: Partial<Record<MetricLabelName, string>> = {};
  for (const name of labelNames) {
    const value = labels[name];
    if (value === undefined) {
      throw new Error(`Metric "${metric}" requires label "${name}".`);
    }
    assertLabelValue(metric, name, value);
    resolved[name] = value;
  }
  return resolved;
}

/**
 * A family's series store. Returns `undefined` once the cap is reached so the
 * caller can account for the drop instead of growing without limit.
 */
export class SeriesStore<TValue> {
  private readonly series = new Map<string, MetricSeries<TValue>>();

  constructor(
    private readonly metric: string,
    private readonly labelNames: readonly MetricLabelName[],
    private readonly initial: () => TValue,
  ) {}

  get size(): number {
    return this.series.size;
  }

  entries(): readonly MetricSeries<TValue>[] {
    return [...this.series.values()];
  }

  /** The series for these labels, creating it unless the cap is reached. */
  resolve(labels: MetricLabels): MetricSeries<TValue> | undefined {
    const resolved = resolveLabels(this.metric, this.labelNames, labels);
    const key = seriesKey(this.labelNames, resolved);
    const existing = this.series.get(key);
    if (existing !== undefined) {
      return existing;
    }
    if (this.series.size >= MAX_SERIES_PER_METRIC) {
      return undefined;
    }
    const created: MetricSeries<TValue> = { labels: resolved, value: this.initial() };
    this.series.set(key, created);
    return created;
  }

  reset(): void {
    this.series.clear();
  }
}
