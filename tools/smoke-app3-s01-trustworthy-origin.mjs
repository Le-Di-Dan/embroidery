#!/usr/bin/env node
/**
 * `APP3-S01` §26 — the trustworthy origin the Session half of the browser
 * journey needs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two independent properties of the **accepted** anonymous-Session design make
 * a real browser unable to open a Session against the repository's plain-HTTP
 * development gateway, and neither is an `APP3-S01` defect:
 *
 * 1. `DesignSessionOriginPolicy` (`IMP-D043` PO-05) requires `Sec-Fetch-Site:
 *    same-origin` and has no "missing means fine" branch. Browsers send
 *    `Sec-Fetch-*` only to **potentially trustworthy** origins, and
 *    `http://embroidery.local` is not one — plain HTTP on a non-loopback name.
 *    So the header never arrives and every Session mutation is refused 403.
 * 2. The session cookie carries the `__Host-` prefix, which a browser rejects
 *    unless the cookie is `Secure`; the development API runs with
 *    `DESIGN_SESSION_COOKIE_SECURE=false`, so even an allowed request could not
 *    keep the credential it was issued.
 *
 * This is the Studio's version of the finding `APP2-E01` recorded for the
 * production Admin login, and the remedy has the same shape: give the run a
 * trustworthy origin without weakening a single guard.
 *
 * `http://localhost` **is** potentially trustworthy by definition, so this adds
 * one temporary Nginx server block for `server_name localhost` on the listener
 * that already exists, and recreates the API with two non-secret configuration
 * values overridden for the run — the allowed origin and the cookie's `Secure`
 * attribute. Nothing tracked changes, no `.env` is written, no cookie is
 * injected, no guard is disabled and no secret is read: the browser performs a
 * normal bootstrap and the server issues a normal `Secure`, `HttpOnly`,
 * `__Host-` cookie because the origin really is trustworthy.
 *
 * `restore` puts the gateway and the API back exactly as the tracked
 * configuration defines them.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'embroidery-dev';
const BASE_COMPOSE = join(REPO_ROOT, 'infrastructure/compose/docker-compose.dev.yml');
const ENV_FILE = join(REPO_ROOT, '.env');

/**
 * The trustworthy origin this run serves the Storefront on.
 *
 * `http://localhost` by default, and overridable by `S01_TRUSTWORTHY_ORIGIN`
 * (`APP3-E01`). Still exactly **one exact origin**: the allow-list is pointed at
 * the origin the run's browser really uses, never widened to accept more than
 * one. `APP3-E01` needs that because its isolated client identities reach the
 * gateway through a hop container published on another loopback port — the
 * browser's origin is then `http://localhost:8091`, which is a different origin
 * and which the API refuses `403` until it is told the truth. Pointing the guard
 * at the truth is what `APP2-E01` did for the staff allow-list; weakening it to
 * a wildcard is what neither does.
 *
 * A port is only ever added on loopback, so the origin stays potentially
 * trustworthy by definition and nothing about the policy changes.
 */
export const TRUSTWORTHY_ORIGIN = process.env.S01_TRUSTWORTHY_ORIGIN ?? 'http://localhost';

function posix(path) {
  return path.replaceAll('\\', '/');
}

/**
 * One extra server block on the listener the gateway already has.
 *
 * It mirrors the tracked Storefront block exactly — same upstreams, same shared
 * proxy-header include — and adds no route. `server_name localhost` is the only
 * difference, and it is the whole point: the tracked hostnames stay untouched
 * and keep answering as they did.
 */
export function localhostServerBlock() {
  return `# APP3-S01 temporary trustworthy-origin listener. Generated per run, never committed.
server {
    listen 8080;
    server_name localhost;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Request-ID $effective_request_id always;

    location = /healthz {
        add_header Cache-Control "no-store" always;
        add_header X-Request-ID $effective_request_id always;
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        proxy_pass http://storefront_upstream;
    }

    location /api/ {
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        proxy_pass http://api_upstream;
    }

    location / {
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        proxy_pass http://storefront_upstream;
    }
}
`;
}

/**
 * The Compose fragment. Additive for the gateway (the tracked mounts are
 * repeated because an override replaces the list), and two environment values
 * for the API.
 */
export function overrideYaml(confPath) {
  return `services:
  gateway:
    volumes:
      - ${posix(join(REPO_ROOT, 'infrastructure/nginx/nginx.conf'))}:/etc/nginx/nginx.conf:ro
      - ${posix(join(REPO_ROOT, 'infrastructure/nginx/templates'))}:/etc/nginx/templates:ro
      - ${posix(confPath)}:/etc/nginx/conf.d/s01-localhost.conf:ro
  api:
    environment:
      DESIGN_SESSION_ALLOWED_ORIGINS: ${TRUSTWORTHY_ORIGIN}
      DESIGN_SESSION_COOKIE_SECURE: 'true'
`;
}

function compose(files, ...args) {
  return execFileSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT,
      ...files.flatMap((file) => ['-f', file]),
      '--env-file',
      ENV_FILE,
      ...args,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  );
}

function apply() {
  const dir = mkdtempSync(join(tmpdir(), 'app3-s01-origin-'));
  const confPath = join(dir, 's01-localhost.conf');
  writeFileSync(confPath, localhostServerBlock(), 'utf8');
  const overridePath = join(dir, 'docker-compose.s01.yml');
  writeFileSync(overridePath, overrideYaml(confPath), 'utf8');

  // `--no-deps` is load-bearing: the tracked gateway depends on every
  // application, so without it Compose walks the whole chain and restarts the
  // development one-shots. The upstreams are already up.
  compose([BASE_COMPOSE, overridePath], 'up', '-d', '--no-deps', '--force-recreate', 'api');
  compose([BASE_COMPOSE, overridePath], 'up', '-d', '--no-deps', '--force-recreate', 'gateway');
  console.log(`applied|${overridePath}|${TRUSTWORTHY_ORIGIN}`);
}

function restore() {
  compose([BASE_COMPOSE], 'up', '-d', '--no-deps', '--force-recreate', 'api');
  compose([BASE_COMPOSE], 'up', '-d', '--no-deps', '--force-recreate', 'gateway');
  console.log('restored|tracked configuration');
}

const command = process.argv[2];
if (command === 'apply') apply();
else if (command === 'restore') restore();
else {
  console.error('usage: smoke-app3-s01-trustworthy-origin.mjs <apply|restore>');
  process.exitCode = 1;
}
