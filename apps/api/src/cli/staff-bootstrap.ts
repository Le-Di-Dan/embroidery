/**
 * Out-of-band staff bootstrap / credential-rotation command (ADR-APP1-001 §8).
 *
 *   pnpm --filter @embroidery/api staff:bootstrap [--rotate]
 *
 * Reads the credentials from the environment — never argv — starts a Nest
 * application context without an HTTP listener, reuses the real identity,
 * persistence and audit services, and closes every resource in `finally`. It
 * never prints the password or the encoded credential and exits non-zero on any
 * failure. Windows / Linux / container compatible: no shell-specific behaviour.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../bootstrap/app.module';
import {
  BootstrapError,
  BootstrapStaffUseCase,
} from '../modules/identity/application/bootstrap-staff.use-case';

const ROTATE_FLAG = '--rotate';

interface BootstrapEnv {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

/** Reads one required secret, collecting its name when absent. */
function required(env: NodeJS.ProcessEnv, name: string, missing: string[]): string {
  const value = env[name];
  if (value === undefined || value === '') {
    missing.push(name);
    return '';
  }
  return value;
}

/** Reads the required environment secrets, failing clearly if any is missing. */
function readEnv(env: NodeJS.ProcessEnv): BootstrapEnv {
  const missing: string[] = [];
  const email = required(env, 'STAFF_BOOTSTRAP_EMAIL', missing);
  const password = required(env, 'STAFF_BOOTSTRAP_PASSWORD', missing);
  const displayName = required(env, 'STAFF_BOOTSTRAP_DISPLAY_NAME', missing);
  if (missing.length > 0) {
    throw new BootstrapError(`Missing required environment variable(s): ${missing.join(', ')}.`);
  }
  return { email, password, displayName };
}

async function main(): Promise<void> {
  const logger = new Logger('StaffBootstrap');
  const rotate = process.argv.includes(ROTATE_FLAG);
  const secrets = readEnv(process.env);

  // No HTTP listener: an application context wires the full module graph without
  // binding a port.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const useCase = app.get(BootstrapStaffUseCase);
    const result = await useCase.bootstrap({
      email: secrets.email,
      password: secrets.password,
      displayName: secrets.displayName,
      rotate,
    });
    // Safe output only: the account id, never the password or credential.
    logger.log(`staff ${result.outcome}: admin ${result.adminId}`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    // A safe, secret-free message; the password is never part of any error here.
    const message = error instanceof Error ? error.message : String(error);
    new Logger('StaffBootstrap').error(message);
    process.exitCode = 1;
  });
