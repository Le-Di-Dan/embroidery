/**
 * Regressions for the `APP4-B01` gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked source.
 *
 * Two cases exist to keep the gate honest rather than merely strict. `reads code
 * rather than prose` is the one that matters: the first version of this checker
 * flagged seventeen violations that were all its own doc comments — "`apps/api`
 * seals through it", "deliberately not `openDeliveryEnvelope`" — and a gate that
 * fails on its own explanation is a gate someone deletes. `tolerates the
 * declaration of claimBatch` pins the other half of that: the method may exist,
 * it may not be called.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  PACKAGE_DIR,
  PACKAGE_NAME,
  REPO_ROOT,
  checkApp4B01,
  importSpecifiers,
  stripComments,
} from './check-app4-b01.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b01-'));
  temporaries.push(dir);
  for (const relative of [
    PACKAGE_DIR,
    'apps/api/src',
    'apps/worker/src',
    'apps/api/package.json',
    'apps/worker/package.json',
    'packages/persistence/src',
    'packages/database/migrations',
    // APP4-B01-C1 — the publication half reads all three of these.
    'packages/database/seed',
    'packages/database/src/seed',
    'package.json',
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

const real = (key) => readFileSync(join(REPO_ROOT, CANONICAL_FILES[key]), 'utf8');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** Failures after one substitution in a named canonical file. */
function failuresAfterEdit(key, from, to) {
  const source = real(key);
  assert.ok(source.includes(from), `${key} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4B01(rootWith({ [CANONICAL_FILES[key]]: source.replace(from, to) }));
}

describe('APP4-B01 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B01(REPO_ROOT), []);
  });

  it('passes against a faithful throwaway copy, so later cases mean something', () => {
    assert.deepEqual(checkApp4B01(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const prose = `/** apps/api uses openDeliveryEnvelope and @nestjs/common. */\nconst a = 1;\n`;
    assert.equal(stripComments(prose).includes('openDeliveryEnvelope'), false);
    assert.deepEqual(importSpecifiers(prose), []);
    // A real import is still seen.
    assert.deepEqual(importSpecifiers(`import x from '@nestjs/common';`), ['@nestjs/common']);
    // A line comment after a URL colon must not eat the rest of the line.
    assert.ok(stripComments(`const u = 'https://x';`).includes('https://x'));
  });
});

describe('APP4-B01 — the shared package', () => {
  it('catches a missing package', () => {
    const root = rootWith();
    rmSync(join(root, PACKAGE_DIR), { recursive: true, force: true });
    assert.ok(mentions(checkApp4B01(root), 'does not exist'));
  });

  it('catches a renamed package', () => {
    const manifest = JSON.parse(real('packageManifest'));
    manifest.name = '@embroidery/notifications';
    const failures = checkApp4B01(
      rootWith({ [CANONICAL_FILES.packageManifest]: JSON.stringify(manifest, null, 2) }),
    );
    assert.ok(mentions(failures, 'name is'));
  });

  it('catches a persistence or database dependency', () => {
    for (const forbidden of ['@embroidery/database', '@embroidery/persistence']) {
      const manifest = JSON.parse(real('packageManifest'));
      manifest.dependencies = { [forbidden]: 'workspace:*' };
      const failures = checkApp4B01(
        rootWith({ [CANONICAL_FILES.packageManifest]: JSON.stringify(manifest, null, 2) }),
      );
      assert.ok(mentions(failures, `depends on ${forbidden}`), forbidden);
    }
  });

  it('catches a real import of an app or a framework', () => {
    const failures = checkApp4B01(
      rootWith({
        [`${PACKAGE_DIR}/src/rogue.ts`]: `import { Injectable } from '@nestjs/common';\nexport const x = Injectable;\n`,
      }),
    );
    assert.ok(mentions(failures, 'framework-neutral'));
  });
});

describe('APP4-B01 — envelope authority', () => {
  it('catches a changed envelope version', () => {
    const failures = failuresAfterEdit(
      'contract',
      'export const DELIVERY_ENVELOPE_VERSION = 1;',
      'export const DELIVERY_ENVELOPE_VERSION = 2;',
    );
    assert.ok(mentions(failures, 'envelope version is not 1'));
  });

  it('catches a weakened algorithm', () => {
    const failures = failuresAfterEdit(
      'contract',
      "export const DELIVERY_ENVELOPE_ALGORITHM = 'AES-256-GCM';",
      "export const DELIVERY_ENVELOPE_ALGORITHM = 'AES-256-CBC';",
    );
    assert.ok(mentions(failures, 'not AES-256-GCM'));
  });

  it('catches a widened secret-kind set', () => {
    const failures = failuresAfterEdit(
      'contract',
      "['VERIFICATION_CODE', 'SECURE_LINK_TOKEN'] as const",
      "['VERIFICATION_CODE', 'SECURE_LINK_TOKEN', 'PASSWORD_RESET'] as const",
    );
    assert.ok(mentions(failures, 'not the locked pair'));
  });

  it('catches a shortened nonce', () => {
    const failures = failuresAfterEdit(
      'codec',
      'export const ENVELOPE_IV_BYTES = 12;',
      'export const ENVELOPE_IV_BYTES = 8;',
    );
    assert.ok(mentions(failures, 'not 96 bits'));
  });

  it('catches a key decoder that stops requiring 32 bytes', () => {
    const failures = failuresAfterEdit(
      'envelopeKey',
      'if (bytes.length !== ENVELOPE_KEY_BYTES) {',
      'if (bytes.length < 1) {',
    );
    assert.ok(mentions(failures, 'exactly 32 bytes'));
  });

  it('catches a second AES-GCM implementation outside the package', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/worker/src/rogue-cipher.ts':
          "import { createDecipheriv } from 'node:crypto';\nexport const open = createDecipheriv;\n",
      }),
    );
    assert.ok(mentions(failures, 'AES-GCM appears outside the shared package'));
  });
});

describe('APP4-B01 — composition and the outbox guard', () => {
  it('catches an uncomposed NotificationModule', () => {
    const failures = failuresAfterEdit('appModule', 'NotificationModule,', '');
    assert.ok(mentions(failures, 'not composed'));
  });

  it('catches a guard that lost NOTIFICATION_INTENT', () => {
    const failures = failuresAfterEdit('outboxStore', "  'NOTIFICATION_INTENT',\n", '');
    assert.ok(mentions(failures, 'lacks NOTIFICATION_INTENT'));
  });

  it('catches a provider dependency entering a manifest', () => {
    const manifest = JSON.parse(real('apiManifest'));
    manifest.dependencies['nodemailer'] = '^7.0.0';
    const failures = checkApp4B01(
      rootWith({ [CANONICAL_FILES.apiManifest]: JSON.stringify(manifest, null, 2) }),
    );
    assert.ok(mentions(failures, 'nodemailer'));
  });

  it('catches an added migration', () => {
    const root = rootWith();
    writeFileSync(join(root, 'packages/database/migrations/9999_rogue.sql'), 'select 1;\n', 'utf8');
    assert.ok(mentions(checkApp4B01(root), 'adds none'));
  });
});

describe('APP4-B01 — intake behaviour', () => {
  it('catches a delivery event that stops naming the current intent', () => {
    const failures = failuresAfterEdit(
      'useCase',
      'aggregateId: created.intent.id,',
      'aggregateId: input.sourceEventId,',
    );
    assert.ok(mentions(failures, 'not the current intent id'));
  });

  it('catches a lost aggregate kind', () => {
    const failures = failuresAfterEdit(
      'useCase',
      "aggregateKind: 'NOTIFICATION_INTENT',",
      "aggregateKind: 'CUSTOMER',",
    );
    assert.ok(mentions(failures, 'does not set NOTIFICATION_INTENT'));
  });

  it('catches the API decrypting', () => {
    const failures = failuresAfterEdit(
      'useCase',
      'const envelope = sealDeliveryEnvelope(',
      'const peek = openDeliveryEnvelope(this.envelopeKey.require(), {});\n      const envelope = sealDeliveryEnvelope(',
    );
    assert.ok(mentions(failures, 'the API decrypts'));
  });

  it('catches a dropped transaction boundary', () => {
    const failures = failuresAfterEdit(
      'useCase',
      'return this.transactions.runInTransaction(async () => {',
      'return (async () => {',
    );
    assert.ok(mentions(failures, 'not in one transaction'));
  });

  it('catches masking that stops going through P01', () => {
    const failures = failuresAfterEdit('useCase', 'maskContact(', 'localMask(');
    assert.ok(mentions(failures, 'P01 masking authority'));
  });

  it('catches a secret smuggled into the reference union', () => {
    const failures = failuresAfterEdit(
      'request',
      "{ readonly kind: 'SECURE_ACCESS_GRANT'; readonly grantId: string }",
      "{ readonly kind: 'SECURE_ACCESS_GRANT'; readonly grantId: string; readonly token: string }",
    );
    assert.ok(mentions(failures, 'carries "token"'));
  });

  it('catches a production caller of the superseded claim path', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/api/src/modules/notification/application/rogue-poller.ts':
          'export const run = (intents) => intents.claimBatch(10);\n',
      }),
    );
    assert.ok(mentions(failures, 'the APP2 outbox runtime is the only queue'));
  });

  it('tolerates the declaration of claimBatch, which must keep existing', () => {
    assert.ok(real('useCase').length > 0);
    assert.deepEqual(checkApp4B01(REPO_ROOT), []);
  });

  it('catches a channel port added early', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/api/src/modules/notification/domain/channel.port.ts':
          'export interface NotificationChannelPort { send(): Promise<void> }\n',
      }),
    );
    assert.ok(mentions(failures, "that is APP4-W01's"));
  });

  it('catches an app-to-app import', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/worker/src/rogue-import.ts':
          "import { AppModule } from '../../api/src/bootstrap/app.module';\nexport const x = AppModule;\n",
      }),
    );
    assert.ok(mentions(failures, 'apps never import each other'));
  });

  it('catches a ciphertext query', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/api/src/modules/notification/infrastructure/rogue-query.ts':
          "export const q = sql`select id from outbox_events where payload ->> 'x' = '1'`;\n",
      }),
    );
    assert.ok(mentions(failures, 'queries the outbox payload'));
  });

  it('catches a base64-shaped literal in production source', () => {
    const failures = checkApp4B01(
      rootWith({
        [`${PACKAGE_DIR}/src/rogue-key.ts`]:
          'export const K = "aB3xY7zQ9wE1rT5yU8iO0pL2kJ4hG6fD";\n',
      }),
    );
    assert.ok(mentions(failures, 'base64-shaped literal'));
  });
});

describe('APP4-B01-C1 — the policy publication seam', () => {
  const DATASET = 'packages/database/seed/app4-policy-configuration.seed.json';
  const PUBLISHER = 'apps/api/src/platform/policy/publish-app4-policy.use-case.ts';
  const BOOTSTRAP = 'apps/api/src/cli/staff-bootstrap.ts';
  const READER = 'packages/database/src/seed/app4-policy-dataset.ts';

  const fileAt = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');

  it('catches a missing dataset', () => {
    const root = rootWith();
    rmSync(join(root, DATASET), { force: true });
    assert.ok(mentions(checkApp4B01(root), 'single APP4 policy value source'));
  });

  it('catches a dataset that lost a canonical key', () => {
    const dataset = JSON.parse(fileAt(DATASET));
    dataset.configurations = dataset.configurations.filter(
      (entry) => entry.configKey !== 'secure_grant',
    );
    const failures = checkApp4B01(rootWith({ [DATASET]: JSON.stringify(dataset, null, 2) }));
    assert.ok(mentions(failures, 'missing the "secure_grant" configuration'));
  });

  it('catches a dataset key leaving value schema version 1', () => {
    const dataset = JSON.parse(fileAt(DATASET));
    dataset.configurations[0].valueSchemaVersion = 2;
    const failures = checkApp4B01(rootWith({ [DATASET]: JSON.stringify(dataset, null, 2) }));
    assert.ok(mentions(failures, 'not at value schema version 1'));
  });

  it('catches a second APP4 dataset file', () => {
    const failures = checkApp4B01(
      rootWith({ 'packages/database/seed/app4-policy-copy.json': '{}' }),
    );
    assert.ok(mentions(failures, 'APP4 policy datasets'));
  });

  it('catches a missing publisher', () => {
    const root = rootWith();
    rmSync(join(root, PUBLISHER), { force: true });
    assert.ok(mentions(checkApp4B01(root), 'owns publication on the API side'));
  });

  it('catches a publisher that stops comparing before publishing', () => {
    const source = fileAt(PUBLISHER).replace('.currentValue(', '.noSuchRead(');
    assert.ok(mentions(checkApp4B01(rootWith({ [PUBLISHER]: source })), 'cannot be idempotent'));
  });

  it('catches a publisher that bypasses the repository with raw SQL', () => {
    const source = `${fileAt(PUBLISHER)}\nexport const rogue = () => sql\`insert into policy_configurations values (1)\`;\n`;
    assert.ok(mentions(checkApp4B01(rootWith({ [PUBLISHER]: source })), 'issues raw SQL'));
  });

  it('catches a publisher that stops reading the dataset', () => {
    const source = fileAt(PUBLISHER).replace('loadApp4PolicyDataset(', 'inlineDataset(');
    assert.ok(
      mentions(checkApp4B01(rootWith({ [PUBLISHER]: source })), 'does not read the G01 dataset'),
    );
  });

  it('catches a publisher that resolves its own Admin', () => {
    const source = fileAt(PUBLISHER).replace(
      'const dataset = loadApp4PolicyDataset',
      'const first = await this.admins.limit(1);\n    const dataset = loadApp4PolicyDataset',
    );
    assert.ok(
      mentions(checkApp4B01(rootWith({ [PUBLISHER]: source })), 'resolves an Admin of its own'),
    );
  });

  it('catches a bootstrap that stops publishing', () => {
    const source = fileAt(BOOTSTRAP).replace('.publish(result.adminId)', '.noop()');
    const failures = checkApp4B01(rootWith({ [BOOTSTRAP]: source }));
    assert.ok(mentions(failures, 'does not publish APP4 policy with the resolved Admin id'));
  });

  it('catches a duplicated policy value in production source', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/worker/src/rogue-policy.ts': 'export const p = { retryDelaysSeconds: [60, 300] };\n',
      }),
    );
    assert.ok(mentions(failures, 'restates the policy value'));
  });

  it('catches worker-side publication', () => {
    const failures = checkApp4B01(
      rootWith({
        'apps/worker/src/rogue-publisher.ts':
          'export const run = (policies, id) => policies.publishVersion({ configKey: "x" });\n',
      }),
    );
    assert.ok(mentions(failures, 'publication is the API bootstrap'));
  });

  it('tolerates worker test fixtures that seed their own runtime policy', () => {
    // Pre-existing worker suites publish `worker.runtime`; flagging them would
    // be the false-positive class the B01 half already learned to avoid.
    assert.deepEqual(checkApp4B01(REPO_ROOT), []);
  });

  it('catches a generic seed framework', () => {
    const manifest = JSON.parse(fileAt('package.json'));
    manifest.scripts['db:seed'] = 'node tools/seed.mjs';
    const failures = checkApp4B01(rootWith({ 'package.json': JSON.stringify(manifest, null, 2) }));
    assert.ok(mentions(failures, 'no seed framework'));
  });

  it('catches a reader that restates a policy value', () => {
    const source = `${fileAt(READER)}\nexport const FALLBACK_TTL = 600;\n`;
    assert.ok(mentions(checkApp4B01(rootWith({ [READER]: source })), 'carries a policy value'));
  });
});

assert.equal(PACKAGE_NAME, '@embroidery/notification-delivery');
