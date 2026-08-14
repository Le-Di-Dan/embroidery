/**
 * Regressions for the `APP4-W01` gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked source.
 *
 * The mutations are chosen to be the *plausible* mistakes rather than obvious
 * vandalism: reading the lineage id instead of the linkage, restating `[60, 300]`
 * as a fallback, logging the decrypted payload while debugging, resetting a dead
 * letter. Each of those produces working code, which is exactly why a gate has to
 * catch them.
 *
 * Two cases keep the gate honest rather than merely strict. `reads code rather
 * than prose` matters most: every file in this capability documents what it
 * deliberately does not do — "never `originNotificationIntentId`", "no
 * `DEAD_LETTER` reset" — and a gate that failed on its own explanation would be
 * deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, CAPABILITY_DIR, REPO_ROOT, checkApp4W01 } from './check-app4-w01.mjs';

const FAILURE_FILE = `${CAPABILITY_DIR}/domain/delivery-failure.ts`;

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-w01-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'apps/worker/src',
    'apps/worker/package.json',
    'apps/admin/src',
    'apps/storefront/src',
    'packages/notification-delivery/src',
    'packages/persistence/src',
    'packages/database/migrations',
  ]) {
    const source = join(REPO_ROOT, relative);
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    // `node_modules` holds pnpm's symlinks, which Windows refuses to recreate
    // without elevation — and the gate never reads them anyway.
    cpSync(source, target, {
      recursive: true,
      filter: (from) => !from.includes('node_modules') && !from.includes(`${sep}dist`),
    });
  }
  for (const [relative, text] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

const real = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** Failures after one substitution in a named file. */
function failuresAfterEdit(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4W01(rootWith({ [relative]: source.replace(from, to) }));
}

describe('APP4-W01 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4W01(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4W01(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    // Every forbidden phrase this gate looks for, in a comment. A checker that
    // greps raw text fails here; one that strips prose first does not.
    const source = `${real(CANONICAL_FILES.useCase)}
/**
 * originNotificationIntentId, DEAD_LETTER, claimBatch(), outbox_events,
 * publishVersion, createdByAdminId, maxAttempts: 3, [60, 300], setInterval.
 */
`;
    assert.deepEqual(checkApp4W01(rootWith({ [CANONICAL_FILES.useCase]: source })), []);
  });
});

describe('APP4-W01 — the queue', () => {
  it('rejects a caller of the superseded claimBatch', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const intent = await this.intents.findIntent(request.intentId);',
      'const intent = (await this.intents.claimBatch(1))[0];',
    );
    assert.ok(mentions(failures, 'claimBatch'));
  });

  it('rejects a second poll loop inside the capability', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'export interface DeliveryRequest {',
      'setInterval(() => undefined, 1_000);\nexport interface DeliveryRequest {',
    );
    assert.ok(mentions(failures, 'setInterval'));
  });

  it('rejects a replacement outbox event', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repository,
      'INSERT INTO notification_delivery_attempts',
      'INSERT INTO outbox_events',
    );
    assert.ok(mentions(failures, 'outbox_events'));
  });

  it('rejects a DEAD_LETTER reset', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repository,
      "WHERE id = ${input.intentId} AND status IN ('PENDING', 'PROCESSING')",
      "WHERE id = ${input.intentId} AND status = 'DEAD_LETTER'",
    );
    assert.ok(mentions(failures, 'DEAD_LETTER'));
  });
});

describe('APP4-W01 — identity and lifecycle', () => {
  it('rejects the encrypted lineage id as the execution target', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.handler,
      'intentId: context.aggregateId,',
      'intentId: payload.originNotificationIntentId,',
    );
    assert.ok(mentions(failures, 'originNotificationIntentId'));
  });

  it('rejects a handler that stops reading the aggregate linkage', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.handler,
      'if (context.aggregateKind !== NOTIFICATION_INTENT_AGGREGATE_KIND) {',
      'if (false) {',
    );
    assert.ok(mentions(failures, 'aggregate kind'));
  });

  it('rejects reopening a settled intent', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repository,
      'SET status = ${input.settleTo}, updated_at = now()',
      "SET status = 'PENDING', updated_at = now()",
    );
    assert.ok(mentions(failures, 'PENDING'));
  });

  it('rejects an unguarded settle', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repository,
      "WHERE id = ${input.intentId} AND status IN ('PENDING', 'PROCESSING')",
      'WHERE id = ${input.intentId}',
    );
    assert.ok(mentions(failures, 'from-state'));
  });
});

describe('APP4-W01 — secrets', () => {
  it('rejects a second AEAD implementation in the worker', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const payload = openDeliveryEnvelope(this.envelopeKey.require(), envelope);',
      "const payload = createDecipheriv('aes-256-gcm', key, iv);",
    );
    assert.ok(mentions(failures, 'AES-GCM appears outside'));
  });

  it('rejects a worker that stops opening through the shared package', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'openDeliveryEnvelope(this.envelopeKey.require(), envelope)',
      'JSON.parse(String(envelope.ciphertext))',
    );
    assert.ok(mentions(failures, 'openDeliveryEnvelope'));
  });

  it('rejects a persisted plaintext column', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repository,
      '${input.failure ?? null}, ${input.attemptedAt}',
      '${input.secret}, ${input.attemptedAt}',
    );
    assert.ok(mentions(failures, 'persists'));
  });

  it('rejects a log line carrying the decrypted payload', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'return await this.channel.send({',
      'this.logger.log(`sending ${opened.secret}`);\n      return await this.channel.send({',
    );
    assert.ok(mentions(failures, 'plaintext-derived'));
  });

  it('rejects a redeclared envelope version', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.payload,
      'export const NOTIFICATION_DELIVERY_PAYLOAD_VERSION = DELIVERY_ENVELOPE_VERSION;',
      'const DELIVERY_ENVELOPE_VERSION = 1;\nexport const NOTIFICATION_DELIVERY_PAYLOAD_VERSION = 1;',
    );
    assert.ok(mentions(failures, 'redeclares the envelope version'));
  });
});

describe('APP4-W01 — policy', () => {
  it('rejects a hard-coded retry schedule', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policy,
      'const MAX_ATTEMPTS_BOUND = 10;',
      'const FALLBACK = { maxAttempts: 3, retryDelaysSeconds: [60, 300] };\nconst MAX_ATTEMPTS_BOUND = 10;',
    );
    assert.ok(mentions(failures, 'restates the published retry schedule'));
    assert.ok(mentions(failures, 'hard-codes an attempt budget'));
  });

  it('rejects a worker that publishes policy', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policyService,
      'const version = await this.policies.currentValue(NOTIFICATION_DELIVERY_POLICY_KEY);',
      "await this.policies.ensureKey(NOTIFICATION_DELIVERY_POLICY_KEY, 'x');\n    const version = undefined;",
    );
    assert.ok(mentions(failures, 'never publishes'));
  });

  it('rejects a policy service that stops reading the published value', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policyService,
      'await this.policies.currentValue(NOTIFICATION_DELIVERY_POLICY_KEY)',
      'undefined',
    );
    assert.ok(mentions(failures, 'does not read the published policy'));
  });

  it('rejects an undeclared failure class', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      "new NotificationDeliveryError('NOTIFICATION_INTENT_UNRESOLVABLE')",
      "new NotificationDeliveryError('NOTIFICATION_PROVIDER_SAID_NO')",
    );
    assert.ok(mentions(failures, 'undeclared failure class'));
  });

  it('tolerates a new failure class that is properly declared', () => {
    const declared = real(FAILURE_FILE).replace(
      "  'NOTIFICATION_INTENT_UNRESOLVABLE',",
      "  'NOTIFICATION_INTENT_UNRESOLVABLE',\n  'NOTIFICATION_TRANSPORT_THROTTLED',",
    );
    const failures = checkApp4W01(rootWith({ [FAILURE_FILE]: declared }));

    assert.deepEqual(failures, []);
  });
});

describe('APP4-W01 — boundaries', () => {
  it('rejects an app-to-app import', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.handler,
      "import { Injectable } from '@nestjs/common';",
      "import { Injectable } from '@nestjs/common';\nimport x from '../../../../api/src/modules/notification/notification.module';",
    );
    assert.ok(mentions(failures, 'apps never import each other'));
  });

  it('rejects a provider SDK dependency', () => {
    const manifest = JSON.parse(real(CANONICAL_FILES.workerManifest));
    manifest.dependencies['nodemailer'] = '^7.0.0';
    const failures = checkApp4W01(
      rootWith({ [CANONICAL_FILES.workerManifest]: JSON.stringify(manifest, null, 2) }),
    );

    assert.ok(mentions(failures, 'selects no provider'));
  });

  it('rejects a dropped envelope-package dependency', () => {
    const manifest = JSON.parse(real(CANONICAL_FILES.workerManifest));
    delete manifest.dependencies['@embroidery/notification-delivery'];
    const failures = checkApp4W01(
      rootWith({ [CANONICAL_FILES.workerManifest]: JSON.stringify(manifest, null, 2) }),
    );

    assert.ok(mentions(failures, 'does not depend on'));
  });

  it('rejects a recording adapter that reaches the network', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.adapter,
      'return Promise.resolve(result);',
      'void fetch("https://provider.example");\n    return Promise.resolve(result);',
    );
    assert.ok(mentions(failures, 'memory-only'));
  });

  it('rejects a recording adapter that writes to a log', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.adapter,
      'return Promise.resolve(result);',
      'console.log(delivery);\n    return Promise.resolve(result);',
    );
    assert.ok(mentions(failures, 'memory-only'));
  });

  it('rejects a P01 issuer call from the worker', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const result = await this.send(opened);',
      'const result = await this.send({ ...opened, secret: issueVerificationCode() });',
    );
    assert.ok(mentions(failures, 'issueVerificationCode'));
  });

  it('rejects a B01 intake call from the worker', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const result = await this.send(opened);',
      'sealDeliveryEnvelope();\n    const result = await this.send(opened);',
    );
    assert.ok(mentions(failures, 'sealDeliveryEnvelope'));
  });

  it('rejects an Admin identity in the delivery path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.repository,
      'const rows = await executeRaw<{ id: string }>(',
      'const createdByAdminId = 1;\n      const rows = await executeRaw<{ id: string }>(',
    );
    assert.ok(mentions(failures, 'no Admin identity'));
  });
});

describe('APP4-W01 — registration and scope', () => {
  it('rejects a second registration of the handler', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.module,
      'this.registry.register(this.handler);',
      'this.registry.register(this.handler);\n    this.registry.register(this.handler);',
    );
    assert.ok(mentions(failures, 'exactly one is allowed'));
  });

  it('rejects a capability that is never composed', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.workerModule,
      '    NotificationDeliveryModule,\n',
      '',
    );
    assert.ok(mentions(failures, 'composed 0 times'));
  });

  it('rejects a renamed event type', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.payload,
      "'notification.delivery.requested'",
      "'notification.delivery.v2.requested'",
    );
    assert.ok(mentions(failures, 'the event type is not'));
  });

  it('rejects a removed channel port', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.channelPort,
      'export interface NotificationChannelPort {',
      'export interface MailSender {',
    );
    assert.ok(mentions(failures, 'NotificationChannelPort'));
  });

  it('rejects an HTTP surface in the capability', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.handler,
      '@Injectable()',
      "@Controller('notifications')\n@Injectable()",
    );
    assert.ok(mentions(failures, 'no HTTP surface'));
  });

  it('rejects a migration added by this checkpoint', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/0035_w01.sql'), '-- no', 'utf8');

    assert.ok(mentions(checkApp4W01(dir), 'adds none'));
  });
});
