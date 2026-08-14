/**
 * `APP4-W01` — the boundary half of the gate, plus the file helpers both halves
 * use.
 *
 * Split from `check-app4-w01.mjs` because it is its own responsibility, the same
 * way `check-app4-b01-policy.mjs` is: everything here answers "what may this
 * worker reach?" — which package, which app, which queue, which policy path —
 * while the other half answers "what does the delivery do?". The helpers live on
 * this side so the dependency runs one way and neither file imports the other
 * back.
 *
 * Read-only. No network, no database.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { importSpecifiers, stripComments } from './check-app4-b01.mjs';

export const CAPABILITY_DIR = 'apps/worker/src/jobs/notification-delivery';

/** Anything whose presence would mean a provider or a second crypto stack. */
const FORBIDDEN_PACKAGES = Object.freeze([
  'nodemailer',
  '@sendgrid/mail',
  'twilio',
  'postmark',
  'mailgun.js',
  'resend',
  '@aws-sdk/client-ses',
  '@aws-sdk/client-sns',
  'node-forge',
  'tweetnacl',
  'libsodium-wrappers',
  'jose',
  'crypto-js',
]);

/** The P01 issuers and the B01 intake seam. W01 calls neither. */
const FORBIDDEN_CALLS = Object.freeze([
  'issueVerificationCode',
  'issueSecureLinkToken',
  'digestSecret',
  'sealDeliveryEnvelope',
  'RequestNotificationUseCase',
  'createIdempotent',
]);

/** Sinks a memory-only adapter must not reach. */
const ADAPTER_SINKS = Object.freeze([
  'fetch(',
  'node:http',
  'node:https',
  'node:net',
  'node:fs',
  'executeRaw',
  'Logger',
  'console.',
]);

/** Shapes that would mean a second queue, a second policy writer, or an Admin. */
const CAPABILITY_FORBIDDEN = Object.freeze([
  ['claimRegisteredBatch', 'the capability must not claim its own work'],
  ['FOR UPDATE', 'the capability must not lease its own rows'],
  ['setInterval', 'the capability must not run its own loop'],
  ['outbox_events', 'the capability must not write the source queue'],
  ['OutboxEventStore', 'the capability must not append events'],
  ['DEAD_LETTER', 'dead-lettering belongs to the generic runtime'],
  ['publishVersion', 'W01 consumes policy and never publishes it'],
  ['ensureKey', 'W01 consumes policy and never publishes it'],
  ['admin_accounts', 'delivery depends on no Admin identity'],
  ['createdByAdminId', 'delivery depends on no Admin identity'],
]);

export const isTest = (path) => /\.(spec|test|bench)\.ts$/.test(path) || path.includes('/tests/');

export const shown = (rootDir, file) =>
  file
    .slice(rootDir.length + 1)
    .split('\\')
    .join('/');

export function sourceFiles(rootDir, relative, extension = '.ts') {
  const found = [];
  const walk = (directory) => {
    let entries = [];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(extension)) found.push(full);
    }
  };
  walk(join(rootDir, relative));
  return found;
}

/** Every production file of the capability, as `{ path, raw, code }`. */
export function capabilitySources(rootDir) {
  return sourceFiles(rootDir, CAPABILITY_DIR)
    .map((file) => ({ path: shown(rootDir, file), raw: readFileSync(file, 'utf8') }))
    .filter((file) => !isTest(file.path))
    .map((file) => ({ ...file, code: stripComments(file.raw) }));
}

/** 5, 6, 12, 13, 14, 15 — what the worker may depend on and reach. */
export function checkBoundaries(rootDir, files, fail) {
  const manifestRaw = files.workerManifest ?? '';
  for (const name of FORBIDDEN_PACKAGES) {
    if (manifestRaw.includes(`"${name}"`)) {
      fail(`apps/worker/package.json gained "${name}"; APP4 selects no provider`);
    }
  }

  for (const file of sourceFiles(rootDir, 'apps/worker/src')) {
    const path = shown(rootDir, file);
    const raw = readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(raw)) {
      // Relative specifiers are resolved first: `../../api/src/...` reaches the
      // other app without ever spelling `apps/api`.
      const target = specifier.startsWith('.')
        ? resolve(dirname(file), specifier).split('\\').join('/')
        : specifier;
      if (target.includes('apps/api') || target.includes('/api/src/')) {
        fail(`${path} imports ${specifier}; apps never import each other`);
      }
      if (FORBIDDEN_PACKAGES.includes(specifier)) {
        fail(`${path} imports the provider SDK ${specifier}`);
      }
    }
    if (isTest(path)) continue;
    const code = stripComments(raw);
    for (const call of FORBIDDEN_CALLS) {
      if (new RegExp(`\\b${call}\\b`).test(code)) {
        fail(`${path} references ${call}; W01 mints and requests nothing`);
      }
    }
  }

  const adapterRaw = files.adapter;
  if (adapterRaw === undefined) {
    fail('the recording channel adapter does not exist');
    return;
  }
  for (const specifier of importSpecifiers(adapterRaw)) {
    if (specifier !== '@nestjs/common' && !specifier.startsWith('.')) {
      fail(`the recording adapter imports ${specifier}; it depends on nothing else`);
    }
  }
  const adapter = stripComments(adapterRaw);
  for (const sink of ADAPTER_SINKS) {
    if (adapter.includes(sink)) {
      fail(`the recording adapter reaches "${sink}"; it is memory-only`);
    }
  }
}

/** 7, 8, 16, 17, 21, 22 — the queue, the outbox and the policy stay untouched. */
export function checkQueueAndOutbox(rootDir, files, fail) {
  for (const root of ['apps/api/src', 'apps/worker/src']) {
    for (const file of sourceFiles(rootDir, root)) {
      const path = shown(rootDir, file);
      // The interface and its DB7 adapter still *declare* the superseded claim
      // path; what must not exist is a caller.
      if (isTest(path) || path.endsWith('drizzle-notification-intent.repository.ts')) continue;
      if (/\.claimBatch\s*\(/.test(stripComments(readFileSync(file, 'utf8')))) {
        fail(`${path} calls claimBatch; the APP2 outbox runtime is the only queue`);
      }
    }
  }

  const poll = stripComments(files.pollRuntime ?? '');
  if (!/WorkerJobQueueRepository/.test(poll) || !/claimRegisteredBatch\(/.test(poll)) {
    fail('the poll runtime no longer claims through WorkerJobQueueRepository');
  }

  for (const file of capabilitySources(rootDir)) {
    for (const [needle, why] of CAPABILITY_FORBIDDEN) {
      if (file.code.includes(needle)) {
        fail(`${file.path}: ${why} ("${needle}")`);
      }
    }
  }
}
