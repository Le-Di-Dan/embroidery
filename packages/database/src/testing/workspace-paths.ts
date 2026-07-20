/**
 * Locates repository-relative paths for the integration-test harness.
 *
 * Walks up from the working directory looking for `pnpm-workspace.yaml` rather
 * than using `__dirname`/`import.meta.url`, so the same helper works whether the
 * caller was loaded as CommonJS (ts-jest) or ESM (`tsx`). Test-only: nothing in
 * the application runtime resolves paths this way.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

export function findWorkspaceRoot(from: string = process.cwd()): string {
  let current = from;
  const { root } = parse(current);
  while (true) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }
    if (current === root) {
      throw new Error(
        `Could not locate ${WORKSPACE_MARKER} above ${from}. ` +
          'The integration harness must run from inside the repository.',
      );
    }
    current = dirname(current);
  }
}

export function migrationsFolder(): string {
  return join(findWorkspaceRoot(), 'packages', 'database', 'migrations');
}

export function databaseToolsFolder(): string {
  return join(findWorkspaceRoot(), 'packages', 'database', 'tools');
}

/**
 * Reads `DATABASE_URL` from the process environment, falling back to the
 * repository `.env`.
 *
 * The fallback exists because Jest does not load `.env` and the alternative —
 * a default connection string in code — is exactly the hard-coded-credential
 * pattern the conventions forbid. Only this one key is read, and it is never
 * logged: callers pass it through `redactUrl`.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['DATABASE_URL'];
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }

  const envFile = join(findWorkspaceRoot(), '.env');
  if (!existsSync(envFile)) {
    throw new Error(
      'DATABASE_URL is not set and no .env file was found. ' +
        'Copy .env.example to .env (see docs/development/LOCAL_DEVELOPMENT.md) ' +
        'or export DATABASE_URL before running the integration tests.',
    );
  }

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  throw new Error('DATABASE_URL is not set and the repository .env does not define it.');
}
