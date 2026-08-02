#!/usr/bin/env node
/**
 * `APP2-S01` §19 — the phases of the isolated production run.
 *
 * Separated from `smoke-app2-s01-discover-production.mjs` so the orchestrator
 * reads as the sequence it is (verify → build → prepare → swap → assert →
 * restore) and each phase can be reviewed for what it actually proves. Every
 * phase is handed its Docker channel, so nothing here shells out on its own and
 * redaction stays structural.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  STOREFRONT_CONTAINER,
  STOREFRONT_IMAGE_PREFIX,
  classifyStorefrontRuntime,
  restoreStorefrontArgs,
  swapStorefrontArgs,
} from './smoke-app2-s01-storefront-topology.mjs';
import {
  API_CONTAINER,
  GATEWAY_CONTAINER,
  IMAGE_PREFIX,
  MINIO_CONTAINER,
  PG_IMAGE_PREFIX,
  POSTGRES_CONTAINER,
  PROD_DB_CONTAINER,
  REPO_ROOT,
  cleanupPlan,
  databaseUpArgs,
  dockerignoreIsolatesBuildOutput,
  dumpArgs,
  gatewayReloadArgs,
  isOutsideRepository,
  restoreDumpArgs,
  swapArgs,
} from './smoke-app2-t01-production-topology.mjs';

/** Builds the phase set bound to one run's Docker channel and recorder. */
export function createPhases({
  run,
  apiRuntimeFacts,
  containerHealth,
  imageIds,
  containerIds,
  record,
}) {
  /** Non-secret runtime facts about whichever container currently owns `storefront`. */
  function storefrontRuntimeFacts() {
    const inspect = (format) => run(['inspect', '-f', format, STOREFRONT_CONTAINER]).stdout.trim();
    const command = inspect('{{join .Config.Cmd " "}}');
    const image = inspect('{{.Config.Image}}');
    const imageId = inspect('{{.Image}}').slice(0, 19);
    const mounts = inspect('{{range .Mounts}}{{.Destination}} {{end}}')
      .split(/\s+/)
      .filter(Boolean);
    const nodeEnv = run(['exec', STOREFRONT_CONTAINER, 'printenv', 'NODE_ENV']).stdout.trim();
    return {
      command,
      image,
      imageId,
      nodeEnv,
      mounts,
      mountCount: mounts.length,
      kind: classifyStorefrontRuntime({ command, nodeEnv, mountCount: mounts.length }),
    };
  }

  /** The stack this run depends on, and the isolation preconditions. */
  function verifyEntryState(overrideFile) {
    const devApi = apiRuntimeFacts();
    const devStorefront = storefrontRuntimeFacts();
    const health = {
      gateway: containerHealth(GATEWAY_CONTAINER),
      postgres: containerHealth(POSTGRES_CONTAINER),
      minio: containerHealth(MINIO_CONTAINER),
      storefront: containerHealth(STOREFRONT_CONTAINER),
    };
    record(
      'development stack healthy at entry',
      Object.values(health).every((state) => state === 'healthy') &&
        devApi.kind === 'development' &&
        devStorefront.kind === 'development',
      { ...health, api: devApi.kind, storefront: devStorefront.kind },
    );
    // The zero-mount count later is only meaningful because the dev container
    // demonstrably has mounts now.
    record('the development Storefront really is the working tree', devStorefront.mountCount > 0, {
      mounts: devStorefront.mounts,
    });
    record(
      'build context excludes mutable host build output',
      dockerignoreIsolatesBuildOutput(readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8')),
      { excluded: ['**/node_modules', '**/dist'] },
    );
    record(
      'temporary override is outside the repository',
      isOutsideRepository(overrideFile, REPO_ROOT),
      { insideRepo: false },
    );
    return { devApi, devStorefront };
  }

  /** The disposable, TLS-enabled database the production runtime requires. */
  function prepareDatabase({ files, envFile }) {
    const up = run(databaseUpArgs(files, envFile));
    record('disposable TLS database is healthy', up.status === 0, { exit: up.status });
    if (up.status !== 0) {
      console.error(up.stderr.slice(-4000));
      throw new Error(`disposable database failed to start (${up.status})`);
    }

    const tls = run([
      'exec',
      PROD_DB_CONTAINER,
      'psql',
      '-U',
      'embroidery',
      '-d',
      'embroidery',
      '-tAc',
      'show ssl',
    ]);
    record('the disposable database really serves TLS', tls.stdout.trim() === 'on', {
      ssl: tls.stdout.trim(),
    });

    const dump = spawnSync('docker', dumpArgs(POSTGRES_CONTAINER), {
      cwd: REPO_ROOT,
      maxBuffer: 512 * 1024 * 1024,
    });
    record(
      'development database read (never written)',
      dump.status === 0 && dump.stdout.length > 0,
      { exit: dump.status, bytes: dump.stdout?.length ?? 0 },
    );
    if (dump.status !== 0) throw new Error('pg_dump of the development database failed');

    const restore = spawnSync('docker', restoreDumpArgs(), {
      cwd: REPO_ROOT,
      input: dump.stdout,
      encoding: 'buffer',
      maxBuffer: 512 * 1024 * 1024,
    });
    record('disposable copy loaded', restore.status === 0, { exit: restore.status });
    if (restore.status !== 0) throw new Error('loading the disposable copy failed');
  }

  /** Swap both upstreams, then re-resolve them in the running gateway. */
  function swapUpstreams({ envFile, entry, files }) {
    const apiUp = run(swapArgs(files, envFile));
    if (apiUp.status !== 0) {
      console.error(apiUp.stderr.slice(-4000));
      console.error(run(['logs', '--tail', '200', API_CONTAINER]).stdout.slice(-8000));
    }
    const storefrontUp = run(swapStorefrontArgs(files, envFile));
    if (storefrontUp.status !== 0) {
      console.error(storefrontUp.stderr.slice(-4000));
      console.error(run(['logs', '--tail', '200', STOREFRONT_CONTAINER]).stdout.slice(-8000));
    }

    // Nginx resolves each upstream name once at configuration load and caches
    // the address; replacing a container without this reload answers 502 for the
    // whole run. The committed configuration is reloaded unchanged.
    const reload = run(gatewayReloadArgs());
    record('gateway reloaded onto the new upstream addresses', reload.status === 0, {
      exit: reload.status,
    });

    const api = apiRuntimeFacts();
    const storefront = storefrontRuntimeFacts();
    record(
      'gateway upstream is the production API runtime',
      apiUp.status === 0 && api.kind === 'production',
      { runtime: api.kind, command: api.command, nodeEnv: api.nodeEnv, imageId: api.imageId },
    );
    record(
      'gateway upstream is the production Storefront runtime',
      storefrontUp.status === 0 && storefront.kind === 'production',
      {
        runtime: storefront.kind,
        command: storefront.command,
        nodeEnv: storefront.nodeEnv,
        image: storefront.image,
        imageId: storefront.imageId,
      },
    );
    record(
      'no development source bind mounts remain',
      api.mountCount === 0 && storefront.mountCount === 0,
      { apiMounts: api.mountCount, storefrontMounts: storefront.mountCount },
    );
    record(
      'the development runtimes are no longer running',
      api.imageId !== entry.devApi.imageId && storefront.imageId !== entry.devStorefront.imageId,
      {
        devStorefrontImageId: entry.devStorefront.imageId,
        productionStorefrontImageId: storefront.imageId,
      },
    );
    return { api, storefront };
  }

  /** Restore the developer's stack and remove every temporary artefact. */
  function restoreAndCleanup({ swapped, imageTag, storefrontTag, databaseImageTag, envFile, dir }) {
    if (swapped.storefront) {
      const res = run(restoreStorefrontArgs(envFile));
      record('dev Storefront restored', res.status === 0, { exit: res.status });
    }
    for (const { step, args } of cleanupPlan({
      swapped: swapped.api,
      imageTag,
      databaseImageTag,
      envFile,
    })) {
      const res = run(args);
      if (step === 'restore-dev-api') {
        record('dev API restored', res.status === 0, { exit: res.status });
      }
    }
    run(['image', 'rm', '-f', storefrontTag]);
    // Both restored containers have new addresses; without this the developer is
    // handed back a stack that answers 502.
    run(gatewayReloadArgs());

    if (swapped.storefront || swapped.api) {
      const api = apiRuntimeFacts();
      const storefront = storefrontRuntimeFacts();
      record(
        'restored runtimes are the development ones',
        api.kind === 'development' && storefront.kind === 'development',
        { api: api.kind, storefront: storefront.kind, storefrontMounts: storefront.mountCount },
      );
      record(
        'gateway, API and Storefront healthy after restore',
        [GATEWAY_CONTAINER, API_CONTAINER, STOREFRONT_CONTAINER].every(
          (name) => containerHealth(name) === 'healthy',
        ),
        {
          gateway: containerHealth(GATEWAY_CONTAINER),
          api: containerHealth(API_CONTAINER),
          storefront: containerHealth(STOREFRONT_CONTAINER),
        },
      );
    }
    rmSync(dir, { recursive: true, force: true });
    const images = [IMAGE_PREFIX, PG_IMAGE_PREFIX, STOREFRONT_IMAGE_PREFIX].flatMap((prefix) =>
      imageIds(prefix),
    );
    const containers = containerIds(PROD_DB_CONTAINER);
    record('no temporary residue', images.length === 0 && containers.length === 0, {
      residualImages: images.length,
      residualContainers: containers.length,
      temporaryDirectoryRemoved: !existsSync(dir),
    });
  }

  return {
    storefrontRuntimeFacts,
    verifyEntryState,
    prepareDatabase,
    swapUpstreams,
    restoreAndCleanup,
  };
}
