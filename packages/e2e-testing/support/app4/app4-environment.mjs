/**
 * The `APP4-E01` topology owner (APP4-E01-H01).
 *
 * A deliberately lean sibling of `startEnvironment`, not a replacement: it
 * reuses the same Compose project, the same canonical disposable-database
 * harness, the same API lifecycle service and the same `CleanupStack`, and it
 * changes none of the existing modes.
 *
 * What it leaves out is the point. `H01` proves a runtime foundation and is
 * forbidden from opening a browser, so the two Next apps and the Nginx gateway
 * are not started — they would add most of the startup cost and none of the
 * evidence. `APP4-E01-H02` adds the browser tier, and it should do so by
 * extending the canonical `startEnvironment` rather than growing this file.
 *
 * The one thing this owner adds over its sibling is the APP4 secret universe:
 * the API HTTP process is started with the run's ephemeral peppers and envelope
 * key, so the in-process contexts the smoke builds open exactly what this
 * process seals.
 */
import { CleanupStack } from '../orchestration/cleanup-stack.mjs';
import { app4SecretEnv, composeEnv } from '../orchestration/config.mjs';
import { provisionDisposableDatabase, proveSchemaBaseline } from '../orchestration/database.mjs';
import {
  assertDockerAvailable,
  composeDown,
  composeUp,
  waitForHealthy,
} from '../orchestration/docker.mjs';
import { createApiService } from '../orchestration/api-service.mjs';
import { redactUrl } from '../orchestration/redact.mjs';
import { assertPortsFree, waitForPort } from '../orchestration/net.mjs';

/**
 * Starts PostgreSQL, MinIO and the real API HTTP process for one APP4 run.
 *
 * On any failure it unwinds everything started so far and rethrows, so a failed
 * setup never leaves a container, a process or a database behind.
 *
 * @param {{ runId: string, config: object, app4: object, log: (m: string) => void }} params
 */
export async function startApp4Environment({ runId, config, app4, log }) {
  const cleanup = new CleanupStack();
  const projectName = `emb-e2e-${runId}`;
  const cEnv = composeEnv(config);

  try {
    await assertDockerAvailable();
    await assertPortsFree([
      { port: config.ports.postgres, label: 'postgres' },
      { port: config.ports.api, label: 'api' },
      { port: config.ports.minio, label: 'minio' },
    ]);

    // 1. Ephemeral PostgreSQL and MinIO (both tmpfs). MinIO is required even
    //    though H01 stores nothing: the API verifies its private buckets before
    //    it listens (APP2-I03), so without it the run would fail at API start
    //    with a message about buckets rather than about the thing under test.
    log('starting ephemeral postgres and minio');
    await composeUp({
      projectName,
      file: config.composeFile,
      services: ['postgres', 'minio'],
      env: cEnv,
    });
    cleanup.push('compose down', () =>
      composeDown({ projectName, file: config.composeFile, env: cEnv }),
    );
    await waitForPort(config.ports.postgres, { label: 'postgres', timeoutMs: 60_000 });
    await waitForHealthy({ projectName, file: config.composeFile, service: 'postgres', env: cEnv });
    await waitForPort(config.ports.minio, { label: 'minio', timeoutMs: 60_000 });
    await waitForHealthy({ projectName, file: config.composeFile, service: 'minio', env: cEnv });

    // 2. Disposable database via the canonical DB7/T01 harness.
    log('provisioning disposable database');
    process.env['DATABASE_URL'] = config.db.baseDatabaseUrl;
    process.env['DATABASE_SSL_MODE'] = 'disable';
    const database = await provisionDisposableDatabase(`e2e_app4_${runId}`);
    cleanup.push('drop disposable database', () => database.drop());
    log(`disposable database ${database.name} @ ${redactUrl(database.url)}`);

    const schema = await proveSchemaBaseline(database.url);
    if (!schema.passed) {
      throw new Error('Disposable database failed the schema-baseline verification.');
    }

    // 3. The real API HTTP process, carrying this run's APP4 secret universe.
    log('starting api with the run APP4 configuration');
    const apiService = createApiService({
      config,
      databaseUrl: database.url,
      adminOrigins: `http://${config.hosts.admin}:${config.ports.gateway}`,
      extraEnv: app4SecretEnv(app4),
    });
    await apiService.start();
    cleanup.push('stop api', () => apiService.stop());

    return {
      projectName,
      database,
      apiBaseUrl: `http://localhost:${config.ports.api}`,
      cleanup,
    };
  } catch (error) {
    await cleanup.run({ logger: log });
    throw error;
  }
}
