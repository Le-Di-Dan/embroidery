/**
 * DB6-C2 column-metric reconciliation gate.
 *
 * Verifies the canonical register against the *live* drizzle schema, so a
 * hand-accumulated running total can never drift again:
 * - every exported table appears in the register exactly once, and vice versa;
 * - each register row's `physical` equals the real column count;
 * - each row's formula balances (ids + expansions + convention = physical);
 * - and the verifier actually rejects a tampered row (negative fixture).
 */
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

import * as schema from './index';
import { COLUMN_METRICS, sumMetrics, verifyMetric } from './column-metrics';

function liveTables(): Map<string, number> {
  const tables = new Map<string, number>();
  for (const exported of Object.values(schema)) {
    if (is(exported, PgTable)) {
      tables.set(getTableName(exported), Object.keys(getTableColumns(exported)).length);
    }
  }
  return tables;
}

describe('column-metric register', () => {
  const live = liveTables();

  it('covers every exported table exactly once, with no orphan rows', () => {
    const registered = COLUMN_METRICS.map((m) => m.table);
    expect(new Set(registered).size).toBe(registered.length);
    expect([...live.keys()].sort()).toEqual([...registered].sort());
  });

  it.each(COLUMN_METRICS.map((m) => [m.table, m] as const))(
    '%s physical count matches the live schema',
    (table, metric) => {
      expect(live.get(table)).toBe(metric.physical);
    },
  );

  it('every row balances: ids + expansions + convention = physical', () => {
    const problems = COLUMN_METRICS.flatMap((m) => verifyMetric(m));
    expect(problems).toEqual([]);
  });

  it('global totals balance and match the live schema', () => {
    const totals = sumMetrics(COLUMN_METRICS);
    expect(totals.business).toBe(totals.logicalIds + totals.expansions);
    expect(totals.physical).toBe(totals.business + totals.convention);
    const livePhysical = [...live.values()].reduce((a, b) => a + b, 0);
    expect(totals.physical).toBe(livePhysical);
  });

  it('rejects a deliberately tampered row (negative fixture)', () => {
    const tampered = { ...COLUMN_METRICS[0]!, physical: COLUMN_METRICS[0]!.physical + 1 };
    expect(verifyMetric(tampered)).not.toEqual([]);
  });
});
