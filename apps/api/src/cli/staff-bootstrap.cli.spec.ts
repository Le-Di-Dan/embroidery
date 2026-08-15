/**
 * Executable proof that `staff-bootstrap` can never fail silently.
 *
 * This spawns the **built** CLI rather than importing it, because the defect it
 * guards was invisible at the source level: `NestFactory` terminated the process
 * from inside its own initialization path, so nothing in the module's control
 * flow ever ran. Only a real process can observe "exited non-zero having printed
 * nothing", which is precisely what this asserts can no longer happen.
 *
 * The forced failure is `AppModule` construction — the same class of failure that
 * was silent — triggered by omitting one required configuration value. It stops
 * well before any Admin is created and opens no usable database connection, so
 * the test is safe, offline and deterministic.
 *
 * Assertions are deliberately about the *contract*, not the wording: a non-zero
 * exit, the canonical status token on stderr, and the absence of any supplied
 * secret from either stream. The underlying Nest message may change; the
 * contract may not.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = join(__dirname, '..', '..');
const CLI_PATH = join(API_ROOT, 'dist', 'cli', 'staff-bootstrap.js');

/** Synthetic values only; none is a real credential. */
const SUPPLIED = {
  password: 'Synthetic-Bootstrap-Pw-0123456789',
  codePepper: 'synthetic-code-pepper-0123456789012345',
  linkPepper: 'synthetic-link-pepper-0123456789012345',
} as const;

interface CliRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(env: NodeJS.ProcessEnv): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH], {
      cwd: API_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('staff-bootstrap CLI terminal reporting', () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `The built CLI is missing at ${CLI_PATH}. Run \`pnpm --filter @embroidery/api build\` first: ` +
          'this suite exists to observe the real executable, so importing the source instead would ' +
          'not reproduce the failure it guards.',
      );
    }
  });

  it('reports a construction failure instead of exiting silently', async () => {
    // Every bootstrap variable is supplied, so this is not the missing-env
    // preflight path — the failure happens while `AppModule` is being built,
    // which is the path that used to abort the process with no output at all.
    const run = await runCli({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:1/none',
      DATABASE_SSL_MODE: 'disable',
      STAFF_BOOTSTRAP_EMAIL: 'bootstrap-cli@e2e.example.test',
      STAFF_BOOTSTRAP_PASSWORD: SUPPLIED.password,
      STAFF_BOOTSTRAP_DISPLAY_NAME: 'CLI Contract Fixture',
      // Deliberately omitted, to force the construction failure:
      DESIGN_SESSION_SECRET_PEPPER: '',
      VERIFICATION_CODE_SECRET_PEPPER: SUPPLIED.codePepper,
      SECURE_LINK_TOKEN_SECRET_PEPPER: SUPPLIED.linkPepper,
    });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('result=FAILED_BOOTSTRAP');
    // The whole point: a failure must say something.
    expect(`${run.stdout}${run.stderr}`.trim().length).toBeGreaterThan(0);
  }, 120_000);

  it('never prints a supplied secret on the failure path', async () => {
    const run = await runCli({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:1/none',
      DATABASE_SSL_MODE: 'disable',
      STAFF_BOOTSTRAP_EMAIL: 'bootstrap-cli@e2e.example.test',
      STAFF_BOOTSTRAP_PASSWORD: SUPPLIED.password,
      STAFF_BOOTSTRAP_DISPLAY_NAME: 'CLI Contract Fixture',
      DESIGN_SESSION_SECRET_PEPPER: '',
      VERIFICATION_CODE_SECRET_PEPPER: SUPPLIED.codePepper,
      SECURE_LINK_TOKEN_SECRET_PEPPER: SUPPLIED.linkPepper,
    });

    const output = `${run.stdout}${run.stderr}`;
    // Booleans, so a failure names the leaking value's role and never prints it.
    expect(output.includes(SUPPLIED.password)).toBe(false);
    expect(output.includes(SUPPLIED.codePepper)).toBe(false);
    expect(output.includes(SUPPLIED.linkPepper)).toBe(false);
  }, 120_000);
});
