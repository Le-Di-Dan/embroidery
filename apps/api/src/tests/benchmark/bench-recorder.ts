/**
 * Result collection for the DB9 benchmark harness (DB9-CP1).
 *
 * Every measured row lands here and is printed as a markdown table at the
 * end of the suite, so the execution log and the query-plan catalog are
 * transcribed from actual output rather than retyped from memory.
 *
 * Test-only.
 */
import type { PlanSummary } from './bench-plan';
import { estimateError } from './bench-plan';
import type { TimingStats } from './bench-timing';

export interface BenchRecord {
  readonly perfId: string;
  readonly source: string;
  readonly stats: TimingStats;
  readonly plan: PlanSummary | undefined;
  readonly note: string;
}

export class BenchRecorder {
  private readonly records: BenchRecord[] = [];

  constructor(private readonly title: string) {}

  add(record: BenchRecord): void {
    this.records.push(record);
  }

  get all(): readonly BenchRecord[] {
    return this.records;
  }

  /** Rows flagged for CP6 review — never auto-tuned, only surfaced (§28). */
  get flagged(): readonly BenchRecord[] {
    return this.records.filter(
      (record) =>
        record.plan !== undefined &&
        (record.plan.hasSeqScan || record.plan.spilled || record.plan.rowsRemovedByFilter > 1000),
    );
  }

  timingTable(): string {
    const header =
      '| PERF | source | n | median ms | p95 ms | min | max | cold | rows | err |\n' +
      '|---|---|---|---|---|---|---|---|---|---|';
    const rows = this.records.map((record) => {
      const s = record.stats;
      return `| ${record.perfId} | ${record.source} | ${s.samples} | ${s.medianMs} | ${s.p95Ms} | ${s.minMs} | ${s.maxMs} | ${s.coldMs} | ${s.rows} | ${s.errors} |`;
    });
    return [`### ${this.title} — timings`, header, ...rows].join('\n');
  }

  planTable(): string {
    const header =
      '| PERF | plan nodes | index | act/est rows | est ratio | hit/read | filtered | sort | plan ms | exec ms |\n' +
      '|---|---|---|---|---|---|---|---|---|---|';
    const rows = this.records
      .filter((record): record is BenchRecord & { plan: PlanSummary } => record.plan !== undefined)
      .map((record) => {
        const p = record.plan;
        return `| ${record.perfId} | ${p.nodes} | ${p.indexes.join(', ') || '—'} | ${p.actualRows}/${p.estimatedRows} | ${estimateError(p)} | ${p.sharedHit}/${p.sharedRead} | ${p.rowsRemovedByFilter} | ${p.sortMethod ?? '—'} | ${p.planningMs} | ${p.executionMs} |`;
      });
    return [`### ${this.title} — plans`, header, ...rows].join('\n');
  }

  print(): void {
    console.log(`\n${this.timingTable()}\n\n${this.planTable()}\n`);
    if (this.flagged.length > 0) {
      console.log(
        `Flagged for CP6 review: ${this.flagged.map((record) => record.perfId).join(', ')}`,
      );
    }
  }
}
