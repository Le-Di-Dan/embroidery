/**
 * The `APP4-E01` cross-layer runtime foundation (APP4-E01-H01).
 *
 * E01 has to observe one journey across four participants at once: a browser, a
 * real API HTTP process, PostgreSQL, and the real `APP4-W01` delivery runtime.
 * The hard constraint is the recording notification adapter — it is deliberately
 * in-memory with no network, file or database sink, and E01 may not add a debug
 * endpoint to read it. So the process that *executes* W01 must also be the
 * process that *reads* the sink, and the plaintext secret never leaves it.
 *
 * This module builds exactly that: two real Nest contexts — the API's own
 * `AppModule` and the worker's own `WorkerModule` — composed in **this** process
 * against the **same** disposable database and the **same** ephemeral APP4
 * secret material as the API HTTP process the orchestrator starts.
 *
 * Three properties are load-bearing and are asserted by the H01 smoke:
 *
 * 1. **Compiled output, not sources.** Both contexts are loaded from each app's
 *    `dist`, resolved through that app's own `require`. The orchestration layer
 *    is plain ESM `.mjs` that runs outside ts-jest, and the Nest tsconfig
 *    already emits decorator metadata, so DI resolves with no transform in play.
 * 2. **The worker claims nothing.** `WORKER_STARTUP_GATE` is held closed, the
 *    same mechanism `APP4-W01`'s own context uses. A background poll loop would
 *    race every later assertion, and the normal E2E orchestrator starts no
 *    worker process at all, so this context is the only claimer in the topology.
 * 3. **One universe.** Every participant reads one generated pepper set and one
 *    envelope key. Two contexts each generating their own would produce an
 *    envelope that will not open — which reads like a W01 defect and is not one.
 *
 * H01 builds and proves the foundation only. It seeds no APP4 fixture, issues no
 * challenge or grant, executes no job and opens no browser.
 *
 * Test-only. Never imported by application code.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT, app4SecretEnv } from '../orchestration/config.mjs';
import { provisionDisposableDatabase } from '../orchestration/database.mjs';

const API_ROOT = join(REPO_ROOT, 'apps', 'api');
const WORKER_ROOT = join(REPO_ROOT, 'apps', 'worker');

/**
 * Non-connecting object-storage values, for the same reason
 * `apps/worker/src/runtime/tests/offline-object-storage-env.ts` carries them:
 * both graphs validate their storage configuration at construction, so a graph
 * that never reaches storage still needs a *valid* configuration to be built at
 * all. Constructing the S3 client opens no socket, and with the worker's startup
 * gate held closed nothing here makes a network call.
 *
 * `.invalid` is reserved by RFC 6761 and can never resolve, so a context that
 * accidentally tried to reach storage fails loudly instead of quietly contacting
 * something real. Only missing values are filled: a caller that points these at
 * the run's real MinIO (the orchestrator does, for the API HTTP process) is
 * never overridden.
 */
const OFFLINE_OBJECT_STORAGE = Object.freeze({
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://e01-offline.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'e01-offline',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'e01-offline',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'e01-offline-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'e01-offline-derivatives',
});

/** Applies `values`, returning a restore function that puts the env back. */
function applyEnv(values, { fillOnly = false } = {}) {
  const previous = new Map();
  for (const [name, value] of Object.entries(values)) {
    if (fillOnly && process.env[name] !== undefined && process.env[name] !== '') {
      continue;
    }
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}

/**
 * Boots the API's real `AppModule` in this process.
 *
 * `AppModule` rather than a hand-picked subset: `SecureGrantIssuer` must be the
 * one the production graph builds, with the production `NotificationModule`
 * behind it, or the later E01 proof that `B05 → B01` writes a real
 * `recipient_contact_point_id` would be proving a graph assembled by the test.
 * The context never listens — it is a provider graph, not a second API.
 */
async function bootApiContext() {
  const requireFromApi = createRequire(join(API_ROOT, 'package.json'));
  requireFromApi('reflect-metadata');
  const { Test } = requireFromApi('@nestjs/testing');
  const { AppModule } = requireFromApi('./dist/bootstrap/app.module.js');
  const { SecureGrantIssuer } = requireFromApi(
    './dist/modules/customer/application/secure-grant.issuer.js',
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  await moduleRef.init();
  return {
    moduleRef,
    secureGrantIssuer: moduleRef.get(SecureGrantIssuer),
    currentDatabase: currentDatabaseProbe(requireFromApi, moduleRef),
  };
}

/**
 * Asks a context, over its own live pool, which database it is connected to.
 *
 * Comparing `DATABASE_URL` strings would only prove both contexts were handed
 * the same configuration; this proves both actually resolved it to the same
 * server-side database, which is the fact every later E01 evidence query rests
 * on. Uses the context's own `TransactionManager`, so it travels the same path a
 * use case would.
 */
function currentDatabaseProbe(requireFromApp, moduleRef) {
  return async () => {
    const { DATABASE_CONNECTION } = requireFromApp('@embroidery/persistence');
    const { executeRaw, sql } = requireFromApp('@embroidery/database');
    const database = moduleRef.get(DATABASE_CONNECTION).database;
    const result = await executeRaw(database, sql`SELECT current_database() AS name`);
    const rows = Array.isArray(result) ? result : (result?.rows ?? []);
    return rows[0]?.name;
  };
}

/**
 * Boots the worker's real `WorkerModule` in this process with polling held.
 *
 * The two overrides are the ones `APP4-W01`'s own harness uses, for its reasons:
 * `WORKER_PROCESS` so a fatal path cannot call `process.exit` and take the test
 * runner with it, and `WORKER_STARTUP_GATE` closed so the poll loop claims
 * nothing. Later checkpoints drive attempts one at a time through the same
 * `JobExecutionService` the loop would use — that is not a shortcut around the
 * runtime, it is the only way to observe a `[60, 300]`-second schedule without
 * waiting six minutes.
 */
async function bootWorkerContext() {
  const requireFromWorker = createRequire(join(WORKER_ROOT, 'package.json'));
  requireFromWorker('reflect-metadata');
  const { Test } = requireFromWorker('@nestjs/testing');
  const { WorkerModule } = requireFromWorker('./dist/bootstrap/worker.module.js');
  const { JobExecutionService } = requireFromWorker(
    './dist/runtime/execution/job-execution.service.js',
  );
  const { WORKER_STARTUP_GATE } = requireFromWorker('./dist/runtime/startup/startup-gate.js');
  const { WORKER_PROCESS } = requireFromWorker('./dist/runtime/lifecycle/worker-process.js');
  const { RecordingNotificationChannelAdapter } = requireFromWorker(
    './dist/jobs/notification-delivery/infrastructure/channel/recording-notification-channel.adapter.js',
  );

  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(WORKER_PROCESS)
    .useValue({ exit: () => undefined })
    .overrideProvider(WORKER_STARTUP_GATE)
    .useValue({ ensureReady: () => Promise.resolve({ ok: false, errorClass: 'E01_HELD' }) })
    .compile();
  await moduleRef.init();

  return {
    moduleRef,
    jobExecutionService: moduleRef.get(JobExecutionService),
    recordingAdapter: moduleRef.get(RecordingNotificationChannelAdapter),
    currentDatabase: currentDatabaseProbe(requireFromWorker, moduleRef),
  };
}

/**
 * Creates the E01 runtime universe and returns one owner for its teardown.
 *
 * `databaseUrl` is supplied by the orchestrator when the full topology is up, so
 * the in-process contexts join the database the API HTTP process is already
 * using. Omitted, the runtime provisions its own disposable database through the
 * canonical harness — which is how the smoke proves the foundation without the
 * whole stack.
 *
 * Nothing secret is returned. `safeMetadata` carries only facts that may appear
 * in a log or a report.
 *
 * @param {{ runId: string, app4: object, databaseUrl?: string, apiBaseUrl?: string, label?: string, log?: (m: string) => void }} params
 */
export async function createApp4E01Runtime({
  runId,
  app4,
  databaseUrl,
  apiBaseUrl,
  label = `app4-e01-${runId}`,
  log = () => {},
}) {
  const ownsDatabase = databaseUrl === undefined;
  const disposable = ownsDatabase ? await provisionDisposableDatabase(label) : undefined;
  const url = databaseUrl ?? disposable.url;
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  log(`app4 runtime universe: db=${databaseName} owned=${ownsDatabase}`);

  // Set before either context compiles: DatabaseModule and the APP4 config
  // providers read the environment at provider-construction time.
  const restoreEnv = [
    applyEnv({ DATABASE_URL: url, NODE_ENV: 'test', ...app4SecretEnv(app4) }),
    applyEnv(OFFLINE_OBJECT_STORAGE, { fillOnly: true }),
    // Not an APP4 value: `AppModule` composes APP3's Design module, whose
    // anonymous-session secrets are verified with a peppered HMAC that has no
    // unpeppered fallback, so the real graph cannot be constructed without one.
    // `fillOnly`, so the orchestrator's per-run value — the one the API HTTP
    // process was started with — always wins; this only covers a standalone run.
    applyEnv(
      { DESIGN_SESSION_SECRET_PEPPER: `e01-design-${randomBytes(24).toString('hex')}` },
      { fillOnly: true },
    ),
  ];

  let api;
  let worker;
  const unwind = async () => {
    await worker?.moduleRef.close().catch(() => {});
    await api?.moduleRef.close().catch(() => {});
    for (const restore of restoreEnv.reverse()) {
      restore();
    }
    if (ownsDatabase) {
      await disposable.drop().catch(() => {});
    }
  };

  try {
    api = await bootApiContext();
    log('api application context ready');
    worker = await bootWorkerContext();
    log('worker context ready (polling held closed)');
  } catch (error) {
    // Never leave a context or a database behind when composition fails: the
    // next run would inherit it and the failure would look like another problem.
    await unwind();
    throw error;
  }

  let closed = false;
  return {
    safeMetadata: {
      runId,
      databaseName,
      apiBaseUrl: apiBaseUrl ?? null,
      storefrontOrigin: app4.storefrontOrigin,
      ownsDatabase,
    },
    apiContext: api.moduleRef,
    secureGrantIssuer: api.secureGrantIssuer,
    workerContext: worker.moduleRef,
    jobExecutionService: worker.jobExecutionService,
    recordingAdapter: worker.recordingAdapter,
    /** The database both contexts are bound to, for evidence queries. */
    databaseUrl: url,
    /** Asks one context, over its own pool, which database it is connected to. */
    currentDatabaseOf: (which) =>
      which === 'api' ? api.currentDatabase() : worker.currentDatabase(),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await unwind();
    },
  };
}
