/**
 * Regressions for the `APP4-B08` Admin notification and replay gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. The mutations are the plausible mistakes rather
 * than vandalism — every one compiles, and most would pass a happy-path suite:
 *
 * - reopening the `FAILED` intent, because a second row looks like a duplicate;
 * - resetting the `DEAD_LETTER` event, because it is already there;
 * - linking the replay event back to the origin, because that is where it came
 *   from;
 * - opening the envelope to see which challenge it was for;
 * - re-sealing the copy because it "might be stale";
 * - finding the source event by querying `payload`;
 * - putting the Admin id in the replay key so two operators do not collide;
 * - publishing `params` so the screen can show which challenge it was;
 * - naming the route `/retry`.
 *
 * `reads code rather than prose` matters most: every file in this checkpoint
 * documents at length what it deliberately does not do — "never
 * `openDeliveryEnvelope`", "no new idempotency table", "the old row is never
 * reset" — and a gate that failed on its own explanation would be deleted within
 * a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  LIST_PATH,
  REPLAY_PATH,
  REPO_ROOT,
  checkApp4B08,
} from './check-app4-b08-contract.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b08-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'packages/persistence/src',
    'packages/contracts/openapi',
    'packages/api-client/src/generated',
    'packages/database/migrations',
  ]) {
    const source = join(REPO_ROOT, relative);
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
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

function failuresAfterEdit(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4B08(rootWith({ [relative]: source.replace(from, to) }));
}

/** Failures after appending a line to an owned file. */
function failuresAfterAppend(relative, line) {
  return checkApp4B08(rootWith({ [relative]: `${real(relative)}\n${line}\n` }));
}

/** Failures after one edit to the generated OpenAPI document. */
function failuresAfterContractEdit(mutate) {
  const document = JSON.parse(real(CANONICAL_FILES.openapi));
  mutate(document);
  return checkApp4B08(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }));
}

describe('APP4-B08 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B08(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B08(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.errors)}
/**
 * openDeliveryEnvelope, sealDeliveryEnvelope, createDecipheriv, createCipheriv,
 * issueVerificationCode, issueSecureLinkToken, ciphertext, authTag, params,
 * markDeadLetter, markFailed, claimBatch, attemptCount, next_attempt_at,
 * payload->'originNotificationIntentId', IdempotencyStore, role, permission,
 * nodemailer, twilio, quotation, ALTER TABLE, /retry.
 */
`;
    assert.deepEqual(checkApp4B08(rootWith({ [CANONICAL_FILES.errors]: source })), []);
  });

  it('fails when an owned file is missing', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.replayKey));
    assert.ok(mentions(checkApp4B08(dir), 'does not exist'));
  });
});

describe('the published surface', () => {
  it('rejects a /retry route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/notification-intents/{intentId}/retry'] = {
        post: { operationId: 'adminNotificationIntent_retry' },
      };
    });
    assert.ok(mentions(failures, 'publishes a retry route'));
  });

  it('rejects a third Admin notification route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/admin/notification-intents/{intentId}/body'] = {
        get: { operationId: 'adminNotificationIntent_body' },
      };
    });
    assert.ok(mentions(failures, 'B08 owns two'));
  });

  it('rejects a customer-facing notification route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/notifications'] = { get: { operationId: 'x_history' } };
    });
    assert.ok(mentions(failures, 'customer-facing notification surface'));
  });

  it('rejects a second verb on the list route', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[LIST_PATH].post = { operationId: 'adminNotificationIntent_create' };
    });
    assert.ok(mentions(failures, 'exactly one get'));
  });

  it('rejects an extra operation anywhere, by count', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/health/extra'] = { get: { operationId: 'x_extra' } };
    });
    assert.ok(mentions(failures, 'plus exactly B08'));
  });

  it('rejects an unprotected operation', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[REPLAY_PATH].post.security = [];
    });
    assert.ok(mentions(failures, 'expected adminSession'));
  });
});

describe('Admin authorization', () => {
  it('rejects dropping the guard', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      '@UseGuards(AuthenticatedAdminGuard)',
      '',
    );
    assert.ok(mentions(failures, 'does not apply @UseGuards'));
  });

  it('rejects dropping the Origin guard from the mutation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      '  @UseGuards(StaffOriginGuard)\n',
      '',
    );
    assert.ok(mentions(failures, 'no Origin guard'));
  });

  it('rejects a second guard declared by this checkpoint', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      'export class ReplayGuard implements CanActivate { canActivate() { return true; } }',
    );
    assert.ok(mentions(failures, 'declares a guard'));
  });

  it('rejects a notification permission check', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      "export const NEEDED = 'notification.replay' as const; export const permission = NEEDED;",
    );
    assert.ok(mentions(failures, 'names a role or permission'));
  });
});

describe('the list projection', () => {
  it('rejects a recipient search parameter', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths[LIST_PATH].get.parameters = [
        ...(document.paths[LIST_PATH].get.parameters ?? []),
        { name: 'recipient', in: 'query', schema: { type: 'string' } },
      ];
    });
    assert.ok(mentions(failures, 'expected [status]'));
  });

  it('rejects a status filter outside the closed state set', () => {
    const failures = failuresAfterContractEdit((document) => {
      const parameter = document.paths[LIST_PATH].get.parameters.find(
        (candidate) => candidate.name === 'status',
      );
      parameter.schema.enum = ['PENDING', 'FAILED'];
    });
    assert.ok(mentions(failures, 'expected the closed state set'));
  });

  it('rejects publishing the raw recipient', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminNotificationIntentResponse.properties.normalizedRecipient = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "normalizedRecipient" field'));
  });

  it('rejects publishing params', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminNotificationIntentResponse.properties.params = {
        type: 'object',
      };
    });
    assert.ok(mentions(failures, 'a "params" field'));
  });

  it('rejects publishing a provider reference', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminNotificationAttemptResponse.properties.providerMessageRef = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "providerMessageRef" field'));
  });

  it('rejects publishing a scheduler internal', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.AdminNotificationIntentResponse.properties.nextAttemptAt = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'a "nextAttemptAt" field'));
  });

  it('rejects dropping the attempt timeline', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.AdminNotificationIntentResponse.properties.attempts;
    });
    assert.ok(mentions(failures, 'AdminNotificationIntentResponse publishes'));
  });

  it('rejects dropping the error class from an attempt', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.AdminNotificationAttemptResponse.properties.errorClass;
    });
    assert.ok(mentions(failures, 'AdminNotificationAttemptResponse publishes'));
  });

  it('rejects a cacheable list', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      "  @Header('Cache-Control', ADMIN_NOTIFICATION_CACHE_CONTROL)\n",
      '',
    );
    assert.ok(mentions(failures, 'does not set Cache-Control'));
  });

  it('rejects the query reaching into params', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.query,
      'templateKey: row.templateKey,',
      'templateKey: row.templateKey,\n        params: row.params,',
    );
    assert.ok(mentions(failures, 'reads params'));
  });
});

describe('the replay transaction', () => {
  it('rejects reopening the origin intent', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'const source = await this.resolveSourceEvent(origin);',
      'await this.intents.markFailed(origin.id);\n      const source = await this.resolveSourceEvent(origin);',
    );
    assert.ok(mentions(failures, 'both terminal records are frozen'));
  });

  it('rejects resetting the dead-lettered event', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'await this.outbox.append({',
      'await this.outbox.markDeadLetter(source.id, "reset");\n      await this.outbox.append({',
    );
    assert.ok(mentions(failures, 'both terminal records are frozen'));
  });

  it('rejects touching an attempt counter', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      'export const RESET = { attemptCount: 0 };',
    );
    assert.ok(mentions(failures, 'attempt counter or schedule'));
  });

  it('rejects dropping the FAILED precondition', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'if (origin.status !== TERMINAL_FAILED) {',
      'if (false) {',
    );
    assert.ok(mentions(failures, 'does not require the origin intent to be FAILED'));
  });

  it('rejects dropping the origin lock', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'await this.intents.lockById(command.intentId)',
      'await this.intents.findById(command.intentId)',
    );
    assert.ok(mentions(failures, 'does not lock the origin intent'));
  });

  it('rejects linking the replay event back to the origin', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'aggregateId: created.intent.id,',
      'aggregateId: origin.id,',
    );
    assert.ok(mentions(failures, 'links the replay event back to the origin intent'));
  });
});

describe('the source lookup and the envelope copy', () => {
  it('rejects a payload query in the source lookup', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outboxStore,
      "eq(outboxEvents.status, 'DEAD_LETTER'),",
      "eq(outboxEvents.status, 'DEAD_LETTER'),\n            sql`payload -> 'x' is not null`,",
    );
    assert.ok(mentions(failures, 'queries the payload'));
  });

  it('rejects a source lookup that admits a non-terminal event', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outboxStore,
      "eq(outboxEvents.status, 'DEAD_LETTER'),",
      '',
    );
    assert.ok(mentions(failures, 'does not require DEAD_LETTER'));
  });

  it('rejects re-sealing instead of copying the payload', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'payload: source.payload,',
      'payload: sealDeliveryEnvelope(key, opened),',
    );
    assert.ok(mentions(failures, 'does not copy the source payload verbatim'));
  });

  it('rejects changing the payload schema version', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'payloadSchemaVersion: source.payloadSchemaVersion,',
      'payloadSchemaVersion: 2,',
    );
    assert.ok(mentions(failures, 'does not copy the source payload schema version'));
  });

  it('rejects reading a field out of the envelope', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      'export const lineage = (payload) => payload.originNotificationIntentId;',
    );
    assert.ok(mentions(failures, 'reads or queries envelope content'));
  });
});

describe('no secret handling', () => {
  for (const symbol of [
    'openDeliveryEnvelope',
    'sealDeliveryEnvelope',
    'createDecipheriv',
    'issueVerificationCode',
    'issueSecureLinkToken',
  ]) {
    it(`rejects ${symbol}`, () => {
      const failures = failuresAfterAppend(
        CANONICAL_FILES.errors,
        `export const leak = () => ${symbol}();`,
      );
      assert.ok(mentions(failures, 'never opens, seals or mints'));
    });
  }

  it('rejects importing the envelope package', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.errors,
      "import { HttpException, HttpStatus } from '@nestjs/common';",
      "import { HttpException, HttpStatus } from '@nestjs/common';\nimport { DELIVERY_ENVELOPE_VERSION } from '@embroidery/notification-delivery';",
    );
    assert.ok(mentions(failures, 'holds no envelope symbol'));
  });

  it('rejects composing the envelope key into the Admin module', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.module,
      '    NotificationClock,',
      '    NotificationClock,\n    DeliveryEnvelopeKeyProvider,',
    );
    assert.ok(mentions(failures, 'composes the envelope key'));
  });
});

describe('the replay key', () => {
  it('rejects an Admin id in the key', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayKey,
      'export interface ManualReplayKeyInput {',
      'export interface ManualReplayKeyInput {\n  readonly adminId: string;',
    );
    assert.ok(mentions(failures, 'the key must not vary per call'));
  });

  it('rejects a timestamp in the key', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayKey,
      '  return `${KEY_PREFIX}:${input.originNotificationIntentId}:${input.deadLetterOutboxEventId.toString()}`;',
      '  return `${KEY_PREFIX}:${input.originNotificationIntentId}:${Date.now()}`;',
    );
    assert.ok(mentions(failures, 'the key must not vary per call'));
  });

  it('rejects changing the locked prefix', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayKey,
      "const KEY_PREFIX = 'app4-manual-replay:v1';",
      "const KEY_PREFIX = 'app4-replay:v2';",
    );
    assert.ok(mentions(failures, 'locked "app4-manual-replay:v1" prefix'));
  });

  it('rejects a second idempotency framework', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      'export const store = "IdempotencyStore";',
    );
    assert.ok(mentions(failures, 'second idempotency framework'));
  });
});

describe('eligibility and refusal routing', () => {
  it('rejects dropping the challenge expiry check', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.eligibility,
      '        challenge.expiresAt.getTime() > now.getTime()',
      '        true',
    );
    assert.ok(mentions(failures, 'enforces expiry on 1 of 2'));
  });

  it('rejects accepting a non-live grant', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.eligibility,
      "const LIVE_GRANT_STATE = 'ACTIVE';",
      "const LIVE_GRANT_STATE = 'REVOKED';",
    );
    assert.ok(mentions(failures, 'a live challenge and a live grant'));
  });

  it('rejects reading a stored secret digest for eligibility', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.eligibility,
      'const now = this.clock.now();',
      'const now = this.clock.now();\n    const digest = await this.challenges.findCodeDigest(reference as never);',
    );
    assert.ok(mentions(failures, 'eligibility is state, not secret'));
  });

  it('rejects inferring the reference from the template', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.reference,
      "  const reference = params['reference'];",
      "  const reference = params['templateKey'];",
    );
    assert.ok(mentions(failures, 'infers the reference from the template'));
  });

  it('rejects skipping the params schema version', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.reference,
      "  if (params['schemaVersion'] !== NOTIFICATION_PARAMS_VERSION) {\n    return undefined;\n  }",
      '',
    );
    assert.ok(mentions(failures, 'does not check the params schema version'));
  });

  it('rejects an ineligible secret that does not route to REISSUE_REQUIRED', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      "throw new ManualReplayError('REISSUE_REQUIRED');",
      "throw new ManualReplayError('REPLAY_SOURCE_UNAVAILABLE');",
    );
    assert.ok(mentions(failures, 'does not map to REISSUE_REQUIRED'));
  });
});

describe('the replay audit', () => {
  it('rejects a fabricated system actor', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      "return { kind: 'ADMIN', adminId: actor.adminId };",
      "return { kind: 'SYSTEM', systemJobKey: 'replay' };",
    );
    assert.ok(mentions(failures, 'admits a non-Admin actor kind'));
  });

  it('rejects taking the actor from anywhere but the request context', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      'const actor = this.requestContext.requireActor();',
      "const actor = { kind: 'ADMIN', adminId: 'unknown' };",
    );
    assert.ok(mentions(failures, 'does not resolve the actor from the request context'));
  });

  it('rejects a recipient in the audit summary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      '        operation: MANUAL_TRANSPORT_REPLAY,',
      '        operation: MANUAL_TRANSPORT_REPLAY,\n        recipientMasked: input.replayIntentId,',
    );
    assert.ok(mentions(failures, 'the audit summary names "recipient"'));
  });

  it('rejects dropping the audit entirely', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.replayUseCase,
      'await this.audit.recordReplayed({',
      'await Promise.resolve({',
    );
    assert.ok(mentions(failures, 'does not audit the replay'));
  });
});

describe('scope boundaries and the generated client', () => {
  it('rejects a provider SDK import', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.errors,
      "import { HttpException, HttpStatus } from '@nestjs/common';",
      "import { HttpException, HttpStatus } from '@nestjs/common';\nimport nodemailer from 'nodemailer';",
    );
    assert.ok(mentions(failures, 'provider SDK'));
  });

  it('rejects APP5–APP7 business content', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      'export const total = "quotationTotal";',
    );
    assert.ok(mentions(failures, 'APP5–APP7 content is not B08'));
  });

  it('rejects a schema declaration', () => {
    const failures = failuresAfterAppend(
      CANONICAL_FILES.errors,
      "export const t = pgTable('x', {});",
    );
    assert.ok(mentions(failures, 'declares schema'));
  });

  it('rejects a migration appearing', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/9999_b08.sql'), 'select 1;', 'utf8');
    assert.ok(mentions(checkApp4B08(dir), 'APP4-B08 adds none'));
  });

  it('rejects intake growing a business-repository dependency', () => {
    // `APP4-B01`'s boundary: intake needs no customer or grant repository, and
    // B08's eligibility seam is why it still does not.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.intake,
      'export class RequestNotificationUseCase {',
      'export class RequestNotificationUseCase {\n  private readonly probe = SECURE_ACCESS_GRANT_REPOSITORY;',
    );
    assert.ok(mentions(failures, "that is B08's seam"));
  });

  it('rejects a generated client carrying a credential field', () => {
    const failures = checkApp4B08(
      rootWith({
        [CANONICAL_FILES.clientSchemas]: `${real(CANONICAL_FILES.clientSchemas)}\nexport interface Leak { ciphertext: string }\n`,
      }),
    );
    assert.ok(mentions(failures, 'the generated client names "ciphertext"'));
  });
});
