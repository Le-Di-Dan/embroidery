/**
 * Staff bootstrap command (ADR-APP1-001 §8; A01-FU03 automatic Compose bootstrap).
 *
 *   node dist/cli/staff-bootstrap.js            # idempotent create-or-reuse
 *   node dist/cli/staff-bootstrap.js --rotate   # out-of-band credential recovery
 *   pnpm --filter @embroidery/api staff:bootstrap [--rotate]
 *
 * Default mode is idempotent and safe to run on every stack startup: it creates
 * the first admin, or reuses an existing matching active admin, and never
 * rotates a credential. It reads credentials from the environment — never argv —
 * applies the locked development-fail / production-skip missing-env policy
 * BEFORE touching the database, and prints one parseable `result=<STATUS>` line
 * that never contains the password or the encoded credential. `--rotate` keeps
 * the operator recovery path (replaces the single admin's credential and revokes
 * its live sessions). Exits non-zero on any failure state.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../bootstrap/app.module';
import {
  BootstrapStaffUseCase,
  type EnsureBootstrapOutcome,
} from '../modules/identity/application/bootstrap-staff.use-case';
import { PublishApp4PolicyUseCase } from '../platform/policy/publish-app4-policy.use-case';
import { PublishApp6PolicyUseCase } from '../platform/policy/publish-app6-policy.use-case';
import { PublishWorkerRuntimePolicyUseCase } from '../platform/policy/publish-worker-runtime-policy.use-case';
import { PublishApp6AgreementsUseCase } from '../modules/content/application/publish-app6-agreements.use-case';
import {
  STATUS_EXIT_CODE,
  decideBootstrapPreflight,
  inspectBootstrapEnv,
  type BootstrapStatus,
} from './staff-bootstrap-policy';

const ROTATE_FLAG = '--rotate';
const LOGGER = 'StaffBootstrap';

/**
 * How this CLI builds its application context — and why both options matter.
 *
 * `logger: false` is required by the result-line contract: it calls
 * `Logger.overrideLogger(false)`, which globally silences every `Logger`, so the
 * one parseable `result=` line comes from {@link report} and nothing competes
 * with it.
 *
 * `abortOnError: false` is required so that a *failed* boot is still reportable.
 * With the NestJS default (`true`), `NestFactory` passes no teardown to its
 * `ExceptionsZone`, so a construction error is never rethrown — it reaches
 * `handleInitializationError`, which calls `process.abort()`. The returned
 * promise then never settles, so neither the `try/catch` below nor the
 * top-level `.catch` can run, and the only component that would have printed
 * the error is the `ExceptionHandler` that `logger: false` just silenced.
 *
 * The two together produced a CLI that exited non-zero with **completely empty**
 * stdout and stderr — no status line, no message, nothing to diagnose from —
 * whenever `AppModule` failed to construct (a missing pepper, an unreachable
 * database, an invalid storage configuration). `false` restores the rethrow, so
 * the failure travels to the existing reporter and exits through the contract.
 */
const BOOT_OPTIONS = { logger: false, abortOnError: false } as const;

const ENSURE_OUTCOME_STATUS: Record<EnsureBootstrapOutcome, BootstrapStatus> = {
  created: 'CREATED',
  reused: 'REUSED_EXISTING',
  mismatch: 'FAILED_EXISTING_ADMIN_MISMATCH',
  inactive: 'FAILED_EXISTING_ADMIN_NOT_ACTIVE',
};

/**
 * Emits the single machine-parseable result line and returns its exit code.
 *
 * Writes straight to stdout/stderr rather than the Nest `Logger`: bootstrapping
 * the app context with `{ logger: false }` calls `Logger.overrideLogger(false)`,
 * which globally SILENCES every `Logger` instance — so a `Logger`-emitted line
 * would be swallowed for every post-boot outcome (CREATED / REUSED_EXISTING /
 * mismatch / not-active), leaving no parseable result. A leading tag keeps the
 * line greppable in Compose logs. It never contains a secret.
 */
function report(status: BootstrapStatus, detail: string, adminId?: string): number {
  const suffix = adminId === undefined ? '' : ` admin=${adminId}`;
  const line = `[${LOGGER}] result=${status} ${detail}${suffix}`.trim();
  const stream = STATUS_EXIT_CODE[status] === 0 ? process.stdout : process.stderr;
  stream.write(`${line}\n`);
  return STATUS_EXIT_CODE[status];
}

/** Idempotent create-or-reuse path (the automatic Compose bootstrap). */
async function runEnsure(): Promise<number> {
  const inspection = inspectBootstrapEnv(process.env);
  const preflight = decideBootstrapPreflight(inspection);
  if (preflight !== undefined) {
    // Missing-env / unknown-env decisions never open a database connection.
    return report(preflight.status, preflight.message);
  }

  const app = await NestFactory.createApplicationContext(AppModule, BOOT_OPTIONS);
  try {
    const useCase = app.get(BootstrapStaffUseCase);
    // `credentials` is defined whenever preflight allowed us to proceed.
    const result = await useCase.ensure(inspection.credentials!);
    // APP4-B01-C1. Gated on a real resolved Admin id, not on the outcome name:
    // `policy_configuration_versions.created_by_admin_id` is NOT NULL, and the
    // mismatch/not-active outcomes carry no id to attribute a version to. This
    // is the repository's one admin-bearing bootstrap path, which is why
    // publication lives here rather than in the worker. Idempotent — a rerun
    // with an unchanged dataset publishes nothing.
    if (result.adminId !== undefined) {
      await app.get(PublishApp4PolicyUseCase).publish(result.adminId);
      // APP6-B01, same seam and the same resolved Admin. Sequential rather than
      // concurrent: each publisher opens its own transaction per drifted key,
      // and racing them would interleave two bootstrap writes for no gain on a
      // one-shot CLI.
      await app.get(PublishApp6PolicyUseCase).publish(result.adminId);
      // APP6-B10, same seam and the same resolved Admin. Last of the three
      // because the agreement *content* is what the customer review read
      // returns while `design_approval.agreements` above decides which types
      // are required: publishing the policy first means a boot that fails
      // partway leaves the required set known and its content missing, which
      // the read fails closed on, rather than content nothing requires.
      // Idempotent — a rerun with unchanged content publishes nothing.
      await app.get(PublishApp6AgreementsUseCase).publish(result.adminId);
      // `APP12-H03-C1`, same seam and the same resolved Admin. `worker.runtime`
      // is the one policy the *worker* reads, and until now nothing published
      // it: a cold deployed worker found no policy and claimed nothing for the
      // life of the pod. Last of the four deliberately — the three above
      // configure request-path behaviour the API itself serves, and this one
      // switches on a second process. A boot that fails partway therefore
      // leaves the API's own policy complete and the worker still safely idle,
      // rather than a worker claiming jobs against half-configured policy.
      await app.get(PublishWorkerRuntimePolicyUseCase).publish(result.adminId);
    }
    return report(ENSURE_OUTCOME_STATUS[result.outcome], `staff ${result.outcome}`, result.adminId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return report('FAILED_BOOTSTRAP', message);
  } finally {
    await app.close();
  }
}

/** Operator credential-recovery path (rotates the single admin, revokes sessions). */
async function runRotate(): Promise<number> {
  const inspection = inspectBootstrapEnv(process.env);
  if (inspection.credentials === undefined) {
    return report(
      'FAILED_BOOTSTRAP',
      `Rotate requires all bootstrap variables: missing ${inspection.missing.join(', ')}.`,
    );
  }
  const app = await NestFactory.createApplicationContext(AppModule, BOOT_OPTIONS);
  try {
    const useCase = app.get(BootstrapStaffUseCase);
    const result = await useCase.bootstrap({ ...inspection.credentials, rotate: true });
    // Recovery path: not part of the automatic-bootstrap status contract.
    new Logger(LOGGER).log(`staff ${result.outcome} admin=${result.adminId}`);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return report('FAILED_BOOTSTRAP', message);
  } finally {
    await app.close();
  }
}

async function main(): Promise<number> {
  return process.argv.includes(ROTATE_FLAG) ? runRotate() : runEnsure();
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // A safe, secret-free message; the password is never part of any error here.
    // Written to stderr directly for the same reason as `report()` — a booted
    // app context may have silenced the Nest `Logger`.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[${LOGGER}] result=FAILED_BOOTSTRAP ${message}\n`);
    process.exitCode = 1;
  });
