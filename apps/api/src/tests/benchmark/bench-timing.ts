/**
 * Timing collection for the DB9 benchmark harness (DB9-CP1).
 *
 * Deliberately reports a distribution, not an average: §15 of the DB9
 * contract forbids closing on a mean, and a single warm run is not evidence.
 * Warmup samples are executed and discarded so the first-call cost of plan
 * caching and pool growth does not land in the reported percentiles — the
 * cold/warm split is reported separately (§17) rather than averaged away.
 *
 * Test-only.
 */

export interface TimingStats {
  readonly label: string;
  readonly samples: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  /** First measured (post-provision, pre-warmup) sample — the cold-ish run. */
  readonly coldMs: number;
  readonly rows: number;
  readonly errors: number;
}

export interface MeasureOptions {
  readonly warmup?: number;
  readonly samples?: number;
  /** Rows the workload is expected to touch, recorded alongside the timing. */
  readonly rows?: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  // Nearest-rank: with the sample counts DB9 uses (25–200) interpolation
  // would imply a precision the data does not have.
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] ?? Number.NaN;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Runs `work` warmup+samples times and returns its latency distribution.
 *
 * `work` returns the row count it observed so the measurement and the
 * correctness assertion stay attached to each other (§18) — a benchmark that
 * cannot say how many rows it touched is not evidence of anything.
 */
export async function measure(
  label: string,
  work: () => Promise<number>,
  options: MeasureOptions = {},
): Promise<TimingStats> {
  const warmup = options.warmup ?? 3;
  const samples = options.samples ?? 25;

  let errors = 0;
  let rows = options.rows ?? 0;
  let coldMs = Number.NaN;

  const durations: number[] = [];

  for (let index = 0; index < warmup + samples; index += 1) {
    const startedAt = process.hrtime.bigint();
    try {
      rows = await work();
    } catch {
      errors += 1;
      continue;
    }
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    if (index === 0) {
      coldMs = elapsedMs;
    }
    if (index >= warmup) {
      durations.push(elapsedMs);
    }
  }

  const sorted = [...durations].sort((left, right) => left - right);

  return {
    label,
    samples: sorted.length,
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    minMs: round(sorted[0] ?? Number.NaN),
    maxMs: round(sorted[sorted.length - 1] ?? Number.NaN),
    coldMs: round(coldMs),
    rows,
    errors,
  };
}

/** Formats a stats row for the execution log / plan catalog tables. */
export function formatStats(stats: TimingStats): string {
  return [
    stats.label,
    String(stats.samples),
    `${stats.medianMs}`,
    `${stats.p95Ms}`,
    `${stats.minMs}`,
    `${stats.maxMs}`,
    `${stats.coldMs}`,
    String(stats.rows),
    String(stats.errors),
  ].join(' | ');
}
