/**
 * Runs the DB6 live-catalog checkers and the fingerprint gate against a
 * disposable database (DB7-CP2 §9.5).
 *
 * Reuses the committed DB6 checker scripts instead of reimplementing their
 * assertions: a second implementation could drift from the canonical one and
 * would then prove nothing. Each checker exits non-zero on failure and prints
 * its own stage name.
 *
 * Test-only.
 */
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { redactUrl } from '../config/database-config';
import { databaseToolsFolder } from './workspace-paths';

const run = promisify(execFile);

/** Wall-clock ceiling per checker, so a hung connection fails the suite instead of parking it. */
const CHECKER_TIMEOUT_MS = 120_000;

const CHECKERS = [
  'db-live-tables-check.mjs',
  'db-live-constraints-check.mjs',
  'db-live-indexes-check.mjs',
  'db-live-jsonb-check.mjs',
  'db-live-money-check.mjs',
  'db-live-triggers-check.mjs',
  'db-fingerprint-gate.mjs',
] as const;

export interface SchemaBaselineResult {
  readonly passed: boolean;
  readonly stages: readonly { checker: string; passed: boolean; summary: string }[];
}

/**
 * Verifies that a disposable database reproduces the frozen DB6 baseline.
 *
 * The connection string is passed as an `execFile` argument, never through a
 * shell, so it cannot be word-split or logged by an intermediate shell; the
 * summary lines returned here are the checkers' own output, which DB6 already
 * proved credential-free.
 */
export async function verifySchemaBaseline(url: string): Promise<SchemaBaselineResult> {
  const tools = databaseToolsFolder();
  const stages: { checker: string; passed: boolean; summary: string }[] = [];

  for (const checker of CHECKERS) {
    try {
      const { stdout } = await run(process.execPath, [join(tools, checker), url], {
        timeout: CHECKER_TIMEOUT_MS,
      });
      stages.push({ checker, passed: true, summary: lastLine(stdout) });
    } catch (error: unknown) {
      stages.push({
        checker,
        passed: false,
        summary: summariseFailure(error, url),
      });
    }
  }

  return { passed: stages.every((stage) => stage.passed), stages };
}

/** `execFile` attaches the child's stdout to the rejection; anything else is ignored. */
function readStdout(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) {
    return '';
  }
  const stdout = (error as { stdout?: unknown }).stdout;
  return typeof stdout === 'string' ? stdout : '';
}

function lastLine(output: string): string {
  const lines = output.trim().split(/\r?\n/);
  return lines[lines.length - 1] ?? '';
}

/**
 * A failing checker's stdout is the diagnostic; its stderr may contain a
 * connection error. Both are DB6-audited as credential-free, but the URL is
 * redacted here anyway rather than trusting that audit forever.
 */
function summariseFailure(error: unknown, url: string): string {
  const stdout = readStdout(error);
  const detail = stdout.trim() === '' ? 'checker produced no output' : lastLine(stdout);
  return `${detail} (target ${redactUrl(url)})`;
}
