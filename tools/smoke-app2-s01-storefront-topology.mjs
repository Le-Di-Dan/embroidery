#!/usr/bin/env node
/**
 * `APP2-S01` §19 — the Storefront half of the isolated production topology.
 *
 * The API half (production `api` image, disposable TLS PostgreSQL, gateway
 * reload, restore) is the accepted `APP2-T01-C1` topology and is imported, not
 * reimplemented. This module adds only what the Storefront needs: its own
 * canonical production image from `storefront.Dockerfile`'s `runner` stage, an
 * override that clears the dev `build` and bind mounts, and the swap/restore
 * argument sets.
 *
 * Why a production Storefront at all: a development Next server runs the
 * bind-mounted working tree with a dev bundler. It proves nothing about the
 * standalone output, about `NODE_ENV=production` behaviour, about the hashed
 * asset URLs the browser must fetch through the gateway, or about hydration in
 * a real build. `APP2-T01-C1` found a production image that could not even
 * start; that class of defect is invisible to every other gate in this
 * repository.
 *
 * Pure helpers only — no side effects on import, so they can be unit-tested
 * without Docker.
 */
import { join } from 'node:path';

import {
  DEV_FILE,
  DEV_PROJECT,
  REPO_ROOT,
  WAIT_TIMEOUT_SECONDS,
  composeArgs,
} from './smoke-app2-t01-production-topology.mjs';

export const STOREFRONT_SERVICE = 'storefront';
export const STOREFRONT_CONTAINER = `${DEV_PROJECT}-${STOREFRONT_SERVICE}-1`;
export const STOREFRONT_DOCKERFILE = join(
  REPO_ROOT,
  'infrastructure',
  'docker',
  'storefront.Dockerfile',
);

/** The canonical gateway host for the public Storefront. */
export const GATEWAY_STOREFRONT_HOST = 'embroidery.local';

/** The route under test. Product Owner authority (IMP-D038); never guessed here. */
export const DISCOVER_PATH = '/kham-pha';

export const STOREFRONT_IMAGE_PREFIX = 'embroidery-s01-storefront-prod';

/** A collision-resistant tag for one run's throwaway Storefront image. */
export function storefrontImageTag(seed) {
  return `${STOREFRONT_IMAGE_PREFIX}:${seed}`;
}

/** Builds the canonical production `runner` stage — no bespoke Dockerfile. */
export function buildStorefrontArgs(imageTag) {
  return ['build', '-f', STOREFRONT_DOCKERFILE, '--target', 'runner', '-t', imageTag, REPO_ROOT];
}

/**
 * The Storefront override.
 *
 * `!reset` clears the base `build` and `volumes` keys so the container runs the
 * immutable image and **not** the bind-mounted `apps/storefront/src` — that is
 * what makes the runtime genuinely production rather than dev sources wearing a
 * production label. The two API base values are restated because the dev file
 * sets them on the dev service definition; every other setting is inherited by
 * Compose's own map merge.
 */
export function storefrontOverrideYaml(imageTag) {
  return [
    `  ${STOREFRONT_SERVICE}:`,
    `    image: ${imageTag}`,
    '    build: !reset null',
    '    volumes: !reset []',
    '    environment:',
    '      NODE_ENV: production',
    '      NEXT_PUBLIC_API_BASE_PATH: /api',
    '      INTERNAL_API_BASE_URL: http://api:4000/api',
    '',
  ].join('\n');
}

/** Args that start the production Storefront in place of the development one. */
export function swapStorefrontArgs(files, envFile) {
  return [
    ...composeArgs(files, envFile),
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    '--no-deps',
    STOREFRONT_SERVICE,
  ];
}

/**
 * Args that restore the developer's Storefront from the tracked dev file alone.
 * `--wait` is part of the restore, not a nicety: the gateway reload that follows
 * must re-resolve the name onto a container that is already answering.
 */
export function restoreStorefrontArgs(envFile) {
  return [
    ...composeArgs([DEV_FILE], envFile),
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    '--force-recreate',
    '--no-deps',
    STOREFRONT_SERVICE,
  ];
}

/**
 * Classifies a running Storefront container the same way the API topology
 * classifies the API: by what it is actually executing and what is mounted into
 * it, never by what the harness intended to start.
 *
 * A production Storefront runs the standalone server from the image with zero
 * bind mounts. Any mount at all means the working tree is in play, and the run
 * is not evidence of anything.
 */
export function classifyStorefrontRuntime({ command, nodeEnv, mountCount }) {
  const runsStandalone = /server\.js/.test(command ?? '');
  if (runsStandalone && nodeEnv === 'production' && mountCount === 0) return 'production';
  if (/\bdev\b/.test(command ?? '') || (mountCount ?? 0) > 0) return 'development';
  return 'unknown';
}
