/**
 * Runs the **real** Ready-Made reservation-expiry pass in its own OS process,
 * one pass per instruction, against a database URL the parent supplies
 * (`APP12-B03-C1` §4, §5).
 *
 * ## Why a process at all
 *
 * The expiry business transaction lives in `apps/worker` and the Admin shipping
 * write lives in `apps/api`, and neither application may import the other
 * (`REPOSITORY_STRUCTURE.md`; the same boundary `APP8-E01` and `APP9-E01`
 * recorded when their journeys were split in two). `APP12-B03` raced them by
 * substituting a hand-written `UPDATE inventory_reservations` for the worker
 * half — which terminalized a reservation without cancelling its order, and so
 * *manufactured* the invalid final state the Product Owner rejected.
 *
 * Two processes on one database is what the deployed system actually is, so it
 * is what the race is run as: this child is the worker, the parent suite is the
 * API, they meet in PostgreSQL, and each holds its own pool and its own
 * transactions. Nothing about the arbitration is simulated.
 *
 * This is the same shape as `worker-smoke-child.mjs` — a `.mjs` launcher over
 * the built `dist`, spawned by a spec — and it is built by the same
 * `pnpm --filter @embroidery/worker build`.
 *
 * ## Warm, then instructed
 *
 * Booting Nest takes seconds; a race needs both actors live within
 * milliseconds. So the child boots once, reports `READY`, and then waits: each
 * `GO` line on stdin runs exactly one `ExpireReadyMadeReservationsUseCase.run()`
 * and answers with `PASS <json>` of its outcome. The parent fires its HTTP
 * write in the same tick it writes `GO`, so neither actor is given a head
 * start. `BYE` closes the context and exits.
 *
 * The graph is composed exactly as `reservation-expiry.integration.spec.ts`
 * composes it — the whole `WorkerModule`, with the startup gate overridden
 * closed and `init()` never called — so no poll loop and no sweep schedule ever
 * runs, and the only expiry that happens is the one this child is told to run.
 */
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const require = createRequire(import.meta.url);
require('reflect-metadata');

const [, , distRoot] = process.argv;
if (distRoot === undefined) {
  throw new Error('expiry-pass-child: the worker dist root is required.');
}

const { Test } = require('@nestjs/testing');
const { WorkerModule } = require(`${distRoot}/bootstrap/worker.module.js`);
const { WORKER_PROCESS } = require(`${distRoot}/runtime/lifecycle/worker-process.js`);
const { WORKER_STARTUP_GATE } = require(`${distRoot}/runtime/startup/startup-gate.js`);
const { ExpireReadyMadeReservationsUseCase } = require(
  `${distRoot}/jobs/ready-made-reservation-expiry/application/expire-reservations.usecase.js`,
);

const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
  .overrideProvider(WORKER_PROCESS)
  .useValue({ exit: () => undefined })
  // Closed on purpose, and `init()` is never called: this process must expire
  // exactly what it is asked to and never claim a job.
  .overrideProvider(WORKER_STARTUP_GATE)
  .useValue({ ensureReady: () => Promise.resolve({ ok: false, errorClass: 'TEST_HELD' }) })
  .compile();

const expiry = moduleRef.get(ExpireReadyMadeReservationsUseCase);

console.log('READY');

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const instruction = line.trim();
  if (instruction === 'BYE') {
    break;
  }
  if (instruction !== 'GO') {
    continue;
  }
  try {
    const outcome = await expiry.run();
    console.log(`PASS ${JSON.stringify(outcome)}`);
  } catch (error) {
    // The message only — an error from the driver can carry a connection string.
    console.log(`FAIL ${JSON.stringify(error instanceof Error ? error.message : 'unknown')}`);
  }
}

await moduleRef.close();
process.exit(0);
