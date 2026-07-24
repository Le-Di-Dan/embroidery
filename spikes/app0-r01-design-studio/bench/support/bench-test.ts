import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { expect, test, type Page } from '@playwright/test';

import type { EngineId } from '../../src/adapters/types';

export const ENGINES: readonly EngineId[] = ['konva', 'fabric', 'svg'];
// The orchestrator always runs Playwright from the package root (host) or from
// /work (container), so results land next to the config in both modes. Deriving
// this from `import.meta.url` would force ESM detection on a CommonJS package.
export const RAW_DIR = join(process.cwd(), 'results', 'raw');

/** Opens a candidate's bench page and waits until the runner is installed. */
export async function openBench(page: Page, engine: EngineId): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/bench/${engine}`);
  await expect(page.getByTestId('spike-ready')).toHaveAttribute('data-ready', 'true');
  await page.waitForFunction(() => window.__spike?.ready === true);
  expect(errors, `page errors on /bench/${engine}`).toEqual([]);
}

/** Windows and Linux run the same project names, so results are platform-tagged. */
export const PLATFORM_TAG = process.env.SPIKE_PLATFORM ?? 'windows';

export function writeRaw(name: string, payload: unknown): void {
  mkdirSync(RAW_DIR, { recursive: true });
  writeFileSync(
    join(RAW_DIR, `${name}.${PLATFORM_TAG}.json`),
    `${JSON.stringify({ platform: PLATFORM_TAG, ...(payload as object) }, null, 2)}\n`,
    'utf8',
  );
}

export { expect, test };
