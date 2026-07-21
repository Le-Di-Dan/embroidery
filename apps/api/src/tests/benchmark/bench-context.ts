/**
 * Shared benchmark setup (DB9-CP1).
 *
 * Provisions a disposable database, compiles the modules under measurement,
 * generates a dataset tier and exposes the deterministic id lookup every
 * benchmark needs. Factored out because repeating it per benchmark file is
 * how two suites end up quietly measuring different datasets.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import type { ModuleMetadata } from '@nestjs/common';

import { createConcurrencyTestContext } from '../integration/db8-concurrency-context';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../integration/db8-concurrency-context';
import { generateDataset } from './bench-dataset';
import type { BenchDataset } from './bench-dataset';
import type { DatasetTierName } from './bench-dataset-tiers';

export const BENCH_SEED = 'db9';

export interface BenchContext {
  readonly context: ConcurrencyTestContext;
  readonly dataset: BenchDataset;
  /** Resolves a generated id by its deterministic series index. */
  idOf(series: string, index: number): Promise<string>;
  spawnActor(label: string): Promise<ConcurrencyActor>;
  close(): Promise<void>;
}

export async function createBenchContext(
  label: string,
  imports: NonNullable<ModuleMetadata['imports']>,
  tierName: DatasetTierName,
): Promise<BenchContext> {
  const context = await createConcurrencyTestContext(label, imports);
  const dataset = await generateDataset(context, tierName);

  console.log(
    `[${label}] tier ${tierName} generated in ${Math.round(dataset.generationMs)}ms\n` +
      JSON.stringify(dataset.counts, null, 2),
  );

  return {
    context,
    dataset,
    idOf: async (series, index) => {
      const rows = await context.disposable.client.db.execute<{ id: string }>(
        sql`select bench_uuid(${`${BENCH_SEED}:${series}`}, ${index}) as id`,
      );
      const id = rows.rows[0]?.id;
      if (id === undefined) {
        throw new Error(`No generated id for ${series}[${index}].`);
      }
      return id;
    },
    spawnActor: (actorLabel) => context.spawnActor(actorLabel),
    close: () => context.close(),
  };
}
