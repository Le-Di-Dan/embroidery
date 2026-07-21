/**
 * Environment capture for the DB9 benchmark harness (DB9-CP1).
 *
 * §14 requires every benchmark result to carry the machine it was produced
 * on. Recorded so results are reproducible and so nobody mistakes them for
 * production numbers — DB9 calls its output *local, reproducible benchmark
 * evidence*, never a production SLA.
 *
 * Test-only.
 */
import os from 'node:os';
import { sql } from 'drizzle-orm';

import type { PlanRunner } from './bench-plan';

export interface BenchEnvironment {
  readonly cpu: string;
  readonly cores: number;
  readonly ramGb: number;
  readonly platform: string;
  readonly nodeVersion: string;
  readonly postgresVersion: string;
  readonly sharedBuffers: string;
  readonly workMem: string;
  readonly effectiveCacheSize: string;
  readonly maxConnections: string;
  readonly capturedAt: string;
}

export async function captureEnvironment(runner: PlanRunner): Promise<BenchEnvironment> {
  const settings = await runner.execute(
    sql`select name, setting, unit from pg_settings
        where name in ('shared_buffers', 'work_mem', 'effective_cache_size', 'max_connections')`,
  );
  const version = await runner.execute(sql`select version() as version`);

  // `pg_settings` columns are typed `unknown` coming back through the driver;
  // narrowing to string here keeps the formatting honest rather than relying
  // on default stringification.
  const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

  const lookup = (name: string): string => {
    const row = settings.rows.find((candidate) => candidate['name'] === name);
    if (row === undefined) {
      return 'unknown';
    }
    // Space-separated: `shared_buffers` reports `16384` with unit `8kB`,
    // which concatenated reads as a nonsense "163848kB".
    const unit = asText(row['unit']);
    return unit === '' ? asText(row['setting']) : `${asText(row['setting'])} × ${unit}`;
  };

  const cpus = os.cpus();

  return {
    cpu: cpus[0]?.model.trim() ?? 'unknown',
    cores: cpus.length,
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    postgresVersion: asText(version.rows[0]?.['version']).split(' on ')[0] ?? 'unknown',
    sharedBuffers: lookup('shared_buffers'),
    workMem: lookup('work_mem'),
    effectiveCacheSize: lookup('effective_cache_size'),
    maxConnections: lookup('max_connections'),
    capturedAt: new Date().toISOString(),
  };
}

export function formatEnvironment(environment: BenchEnvironment): string {
  return [
    `CPU:            ${environment.cpu} (${environment.cores} logical cores)`,
    `RAM:            ${environment.ramGb} GB`,
    `Platform:       ${environment.platform}`,
    `Node:           ${environment.nodeVersion}`,
    `PostgreSQL:     ${environment.postgresVersion}`,
    `shared_buffers: ${environment.sharedBuffers}`,
    `work_mem:       ${environment.workMem}`,
    `eff_cache_size: ${environment.effectiveCacheSize}`,
    `max_connections:${environment.maxConnections}`,
    `Captured:       ${environment.capturedAt}`,
    'Storage:        container-backed local volume (Docker Desktop, exact device not exposed)',
    'Claim:          local, reproducible benchmark evidence — NOT a production SLA',
  ].join('\n');
}
