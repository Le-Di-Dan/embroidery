#!/usr/bin/env node
/**
 * `APP2-E01` §5/§6 — the production services the cross-layer journey adds to
 * the accepted `APP2-T01-C1` topology.
 *
 * `APP2-S01` added a production Storefront to that base; `APP2-S02` reused it
 * unchanged. `APP2-E01` needs the two runtimes no previous checkpoint could
 * exercise together — a production **Admin** and a production **worker** — plus
 * a **disposable MinIO**, because this is the first journey that writes objects
 * and the shared development bucket must stay untouched.
 *
 * Everything is expressed as Compose override fragments written to a temporary
 * directory. No tracked Nginx or Compose file changes.
 */
import { join } from 'node:path';

import {
  DEV_FILE,
  DEV_PROJECT,
  REPO_ROOT,
  WAIT_TIMEOUT_SECONDS,
  composeArgs,
} from './smoke-app2-t01-production-topology.mjs';

export { DEV_FILE };

export const ADMIN_SERVICE = 'admin';
export const WORKER_SERVICE = 'worker';
export const ADMIN_CONTAINER = `${DEV_PROJECT}-${ADMIN_SERVICE}-1`;
export const WORKER_CONTAINER = `${DEV_PROJECT}-${WORKER_SERVICE}-1`;

/** The disposable object store. A separate service so the dev volume is never touched. */
export const STORAGE_SERVICE = 'minio-e01';
export const STORAGE_CONTAINER = `${DEV_PROJECT}-${STORAGE_SERVICE}-1`;
export const STORAGE_ENDPOINT = `http://${STORAGE_SERVICE}:9000`;
export const ORIGINALS_BUCKET = 'embroidery-e01-originals';
export const DERIVATIVES_BUCKET = 'embroidery-e01-derivatives';

export const ADMIN_DOCKERFILE = join(REPO_ROOT, 'infrastructure', 'docker', 'admin.Dockerfile');
export const WORKER_DOCKERFILE = join(REPO_ROOT, 'infrastructure', 'docker', 'worker.Dockerfile');

export const ADMIN_IMAGE_PREFIX = 'embroidery-e01-admin-prod';
export const WORKER_IMAGE_PREFIX = 'embroidery-e01-worker-prod';

export function adminImageTag(seed) {
  return `${ADMIN_IMAGE_PREFIX}:${seed}`;
}

export function workerImageTag(seed) {
  return `${WORKER_IMAGE_PREFIX}:${seed}`;
}

/** Both build the canonical `runner` stage — no bespoke Dockerfile exists. */
export function buildAdminArgs(imageTag) {
  return ['build', '-f', ADMIN_DOCKERFILE, '--target', 'runner', '-t', imageTag, REPO_ROOT];
}

export function buildWorkerArgs(imageTag) {
  return ['build', '-f', WORKER_DOCKERFILE, '--target', 'runner', '-t', imageTag, REPO_ROOT];
}

/**
 * Storage credentials for the run's throwaway MinIO.
 *
 * Generated per run and destroyed with the container. Not a rotation: no
 * existing credential is read, replaced or re-seeded, and nothing is taken from
 * the repository `.env`.
 */
export function storageEnvLines(accessKey, secretKey, indent = '      ') {
  return [
    `${indent}OBJECT_STORAGE_PROVIDER: s3`,
    `${indent}OBJECT_STORAGE_ENDPOINT: ${STORAGE_ENDPOINT}`,
    `${indent}OBJECT_STORAGE_REGION: us-east-1`,
    `${indent}OBJECT_STORAGE_FORCE_PATH_STYLE: 'true'`,
    `${indent}OBJECT_STORAGE_ACCESS_KEY_ID: ${accessKey}`,
    `${indent}OBJECT_STORAGE_SECRET_ACCESS_KEY: ${secretKey}`,
    `${indent}OBJECT_STORAGE_ORIGINALS_BUCKET: ${ORIGINALS_BUCKET}`,
    `${indent}OBJECT_STORAGE_DERIVATIVES_BUCKET: ${DERIVATIVES_BUCKET}`,
  ];
}

/** The disposable MinIO, the production Admin and the production worker. */
export function e01OverrideYaml({
  adminTag,
  workerTag,
  databaseUrl,
  storageAccessKey,
  storageSecretKey,
}) {
  return [
    `  ${STORAGE_SERVICE}:`,
    '    image: minio/minio:RELEASE.2025-04-08T15-41-24Z',
    "    command: ['server', '/data']",
    '    environment:',
    `      MINIO_ROOT_USER: ${storageAccessKey}`,
    `      MINIO_ROOT_PASSWORD: ${storageSecretKey}`,
    '    healthcheck:',
    "      test: ['CMD', 'curl', '-fsS', 'http://127.0.0.1:9000/minio/health/live']",
    '      interval: 5s',
    '      timeout: 5s',
    '      start_period: 5s',
    '      retries: 20',
    '    networks:',
    '      - embroidery',
    `  ${ADMIN_SERVICE}:`,
    `    image: ${adminTag}`,
    '    build: !reset null',
    '    volumes: !reset []',
    '    environment:',
    '      NODE_ENV: production',
    '      NEXT_PUBLIC_API_BASE_PATH: /api',
    '      INTERNAL_API_BASE_URL: http://api:4000/api',
    `  ${WORKER_SERVICE}:`,
    `    image: ${workerTag}`,
    '    build: !reset null',
    '    volumes: !reset []',
    '    environment:',
    '      NODE_ENV: production',
    `      DATABASE_URL: ${databaseUrl}`,
    '      DATABASE_SSL_MODE: require',
    ...storageEnvLines(storageAccessKey, storageSecretKey),
    '    depends_on: !reset []',
    '',
  ].join('\n');
}

/**
 * The API's storage environment.
 *
 * Appended to the accepted production API fragment rather than emitted as a
 * second `api:` block: the override is one YAML document, and a duplicate
 * mapping key is a parse error, not a merge.
 */
export function apiStorageEnvYaml(storageAccessKey, storageSecretKey) {
  return `${storageEnvLines(storageAccessKey, storageSecretKey).join('\n')}\n`;
}

/**
 * The exact browser origin for this run's CSRF allowlist.
 *
 * `STAFF_ALLOWED_ORIGINS` defaults to `http://admin.embroidery.local`, and the
 * API correctly refuses a login posted from anywhere else — which is what the
 * allowlist is *for*. The run terminates TLS on a non-default port, so the
 * browser's real origin is `https://admin.embroidery.local:8443` and that is
 * what the allowlist must contain. Still exactly one exact origin: the guard is
 * pointed at the truth, not widened, and nothing tracked changes.
 */
export function apiOriginEnvYaml(origin) {
  return `      STAFF_ALLOWED_ORIGINS: ${origin}\n`;
}

function upArgs(files, envFile, service) {
  return [
    ...composeArgs(files, envFile),
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    '--no-deps',
    service,
  ];
}

export function storageUpArgs(files, envFile) {
  return upArgs(files, envFile, STORAGE_SERVICE);
}

export function swapAdminArgs(files, envFile) {
  return upArgs(files, envFile, ADMIN_SERVICE);
}

export function swapWorkerArgs(files, envFile) {
  return upArgs(files, envFile, WORKER_SERVICE);
}

/** Restore the development runtimes from the tracked Compose file alone. */
export function restoreArgs(envFile, service) {
  return [
    'compose',
    '-p',
    DEV_PROJECT,
    '-f',
    DEV_FILE,
    '--env-file',
    envFile,
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    '--no-deps',
    '--force-recreate',
    service,
  ];
}

/** Destroy the disposable object store and its volume. */
export function removeStorageArgs(files, envFile) {
  return [...composeArgs(files, envFile), 'rm', '-fsv', STORAGE_SERVICE];
}
