/**
 * Prometheus text exposition, version 0.0.4 (`APP12-H03` §4, §10).
 *
 * Written rather than pulled in, because the whole format is the forty lines
 * below and `packages/observability/README.md` records a standing boundary:
 * no vendor SDK enters this package without an ADR. `ADR-APP12-001` locks
 * Prometheus as the metrics *protocol*; rendering that protocol is not a
 * vendor coupling, and hand-rendering it is what lets the cardinality contract
 * in `metric-label.ts` be the only way a label can reach a scrape.
 *
 * Values are rendered with `Number.prototype.toString()`, which produces the
 * shortest round-trippable decimal — Prometheus parses floats, so there is no
 * fixed precision to honour and rounding here would lose a millisecond in a
 * histogram sum.
 */
import type { AnyInstrument, HistogramValue } from './metric-instruments';
import type { MetricRegistry } from './metric-registry';
import type { MetricLabels } from './metric-series';

const CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export const METRICS_CONTENT_TYPE = CONTENT_TYPE;

/**
 * Escapes a label value for the exposition format: backslash, double quote and
 * newline. The contract in `metric-label.ts` already refuses every one of
 * these characters, so this is defence in depth rather than a live path — it
 * exists so a future widening of the value pattern cannot produce a scrape
 * body Prometheus rejects.
 */
function escapeValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n');
}

function renderLabels(service: string, labels: MetricLabels, extra?: readonly [string, string]): string {
  const pairs: string[] = [`service="${escapeValue(service)}"`];
  for (const [name, value] of Object.entries(labels)) {
    if (value !== undefined) {
      pairs.push(`${name}="${escapeValue(value)}"`);
    }
  }
  if (extra !== undefined) {
    pairs.push(`${extra[0]}="${escapeValue(extra[1])}"`);
  }
  return `{${pairs.join(',')}}`;
}

function renderHistogram(
  lines: string[],
  service: string,
  name: string,
  buckets: readonly number[],
  labels: MetricLabels,
  value: HistogramValue,
): void {
  for (let index = 0; index < buckets.length; index += 1) {
    const bound = buckets[index];
    const count = value.counts[index];
    if (bound === undefined || count === undefined) {
      continue;
    }
    lines.push(`${name}_bucket${renderLabels(service, labels, ['le', bound.toString()])} ${count.toString()}`);
  }
  lines.push(`${name}_bucket${renderLabels(service, labels, ['le', '+Inf'])} ${value.count.toString()}`);
  lines.push(`${name}_sum${renderLabels(service, labels)} ${value.sum.toString()}`);
  lines.push(`${name}_count${renderLabels(service, labels)} ${value.count.toString()}`);
}

function renderInstrument(lines: string[], service: string, instrument: AnyInstrument): void {
  lines.push(`# HELP ${instrument.name} ${instrument.help}`);
  lines.push(`# TYPE ${instrument.name} ${instrument.type}`);
  if (instrument.type === 'histogram') {
    const histogram = instrument as Extract<AnyInstrument, { buckets: readonly number[] }>;
    for (const series of histogram.entries()) {
      renderHistogram(lines, service, instrument.name, histogram.buckets, series.labels, series.value);
    }
    return;
  }
  for (const series of (instrument as Extract<AnyInstrument, { entries(): readonly { labels: MetricLabels; value: number }[] }>).entries()) {
    lines.push(`${instrument.name}${renderLabels(service, series.labels)} ${series.value.toString()}`);
  }
}

/** Renders the whole registry. Runs collectors first, then serialises. */
export async function renderMetrics(registry: MetricRegistry): Promise<string> {
  await registry.runCollectors();
  const lines: string[] = [];
  for (const instrument of registry.list()) {
    renderInstrument(lines, registry.service, instrument);
  }
  return `${lines.join('\n')}\n`;
}
