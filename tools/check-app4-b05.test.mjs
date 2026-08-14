/**
 * Regressions for the `APP4-B05` secure-grant gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. The mutations are the plausible mistakes rather
 * than vandalism: accepting a caller-chosen scope because the column exists,
 * defaulting the TTL so issuance works before the policy is published, letting a
 * duplicate issue rotate, copying the source's digest on reissue, putting the
 * grant's hash in the audit summary, moving the token into a query. Every one of
 * them compiles, and most would pass a happy-path suite.
 *
 * `reads code rather than prose` matters most here: every file in this
 * checkpoint documents what it deliberately does not do — "never
 * `sealDeliveryEnvelope`", "no `?t=` fallback", "not a second generator" — and a
 * gate that failed on its own explanation would be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, checkApp4B05 } from './check-app4-b05.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b05-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'apps/worker/src',
    'packages/contracts/openapi',
    'packages/database/migrations',
    'packages/database/seed',
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
  return checkApp4B05(rootWith({ [relative]: source.replace(from, to) }));
}

describe('APP4-B05 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B05(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B05(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    // Every forbidden term, in a comment. The checkpoint's own files are full of
    // sentences like these, so a gate that scanned raw text would fail on its
    // own documentation.
    const source = `${real(CANONICAL_FILES.outcome)}
/**
 * sealDeliveryEnvelope, openDeliveryEnvelope, createHmac, timingSafeEqual,
 * 604800, 900, scopeKind: command.scope, accept-quotation, approve-design,
 * initiate-payment, SUBMISSION, reactivate, ?t=, token=, @Controller(),
 * nodemailer, twilio, insert into custom_requests, ALTER TABLE.
 */
`;
    assert.deepEqual(checkApp4B05(rootWith({ [CANONICAL_FILES.outcome]: source })), []);
  });

  it('fails when an owned file is missing', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.issuer));
    assert.ok(mentions(checkApp4B05(dir), 'does not exist'));
  });
});

describe('no HTTP surface', () => {
  it('rejects a controller decorator on an owned file', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '@Injectable()\nexport class SecureGrantIssuer',
      "@Controller('grants')\nexport class SecureGrantIssuer",
    );
    assert.ok(mentions(failures, 'zero endpoints'));
  });

  it('rejects a published grant path', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/public/secure-links/grants'] = { post: { operationId: 'grant_issue' } };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'publishes none'));
  });

  it('rejects any change to the published operation count', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    const [first] = Object.keys(document.paths);
    delete document.paths[first];
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'adds none'));
  });

  // --- `APP4-B07` reconciliation guards -------------------------------------
  //
  // Two authenticated Admin paths are now authorized by exact name. B05's own
  // surface is still zero, and these prove the allowlist admits nothing that
  // would make B05 grow one.

  it('still rejects an Admin grant issue route', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/admin/secure-grants/issue'] = { post: { operationId: 'x_issue' } };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'publishes none'));
  });

  it('still rejects a global Admin grant listing', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/admin/secure-grants'] = { get: { operationId: 'x_list' } };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'publishes none'));
  });

  it('rejects a second verb on the authorized Admin revoke path', () => {
    // A `post` that also accepted `delete`, or a `get` that leaked grant state
    // onto the mutation route, would be a new operation on an authorized path
    // rather than a new path — which the allowlist alone would not catch.
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/admin/secure-grants/{grantId}/revoke'].get = { operationId: 'x_get' };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'APP4-B07 owns'));
  });

  it('rejects a second verb on the authorized Admin grant list path', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/admin/customers/{customerId}/grants'].post = { operationId: 'x_issue' };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'APP4-B07 owns'));
  });
});

describe('the internal capability', () => {
  it('rejects a missing lifecycle method', () => {
    const failures = failuresAfterEdit(CANONICAL_FILES.issuer, 'async revoke(', 'async withdraw(');
    assert.ok(mentions(failures, 'no revoke method'));
  });

  it('rejects dropping the APP5-facing export', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.module,
      '    SecureGrantIssuer,\n    StepUpWindow,\n  ],\n})',
      '  ],\n})',
    );
    assert.ok(mentions(failures, 'does not export SecureGrantIssuer'));
  });

  it('rejects sealing the envelope in B05', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notifier,
      'await this.notifications.request({',
      'sealDeliveryEnvelope(null, null);\n    await this.notifications.request({',
    );
    assert.ok(mentions(failures, 'APP4-B01 is the only seam'));
  });

  it('rejects bypassing B01 for delivery', () => {
    // The realistic bypass keeps the field name and the shape, and just talks to
    // something else — so the annotation `RequestNotificationUseCase` is still
    // there to be found. Only the import and the call reveal it.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notifier,
      "import { RequestNotificationUseCase } from '../../notification/application/request-notification.use-case';",
      "import { RequestNotificationUseCase } from '../../notification/application/direct-send';",
    );
    assert.ok(mentions(failures, 'APP4-B01 notification intake'));
  });
});

describe('token authority', () => {
  it('rejects a second generator beside P01', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.minter,
      'return issueSecureLinkToken();',
      "return randomBytes(32).toString('base64url');",
    );
    assert.ok(mentions(failures, 'P01 owns token generation'));
  });

  it('rejects a locally computed digest', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'const tokenHash = digestSecret(this.peppers.require().secureLinkTokenPepper, rawToken);',
      "const tokenHash = createHmac('sha256', 'x').update(rawToken).digest('base64');",
    );
    assert.ok(mentions(failures, 'P01 owns the one HMAC'));
  });

  it('rejects the wrong pepper', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'this.peppers.require().secureLinkTokenPepper',
      'this.peppers.require().verificationCodePepper',
    );
    assert.ok(mentions(failures, 'verification-code pepper'));
  });

  it('rejects persisting the raw token as the hash', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '        tokenHash,\n',
      '        tokenHash: rawToken,\n',
    );
    assert.ok(mentions(failures, 'persists the raw token as the hash'));
  });
});

describe('scope', () => {
  it('rejects a caller-chosen scope', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'scopeKind: REQUEST_ACCESS,',
      'scopeKind: input.scopeKind,',
    );
    assert.ok(mentions(failures, 'one legal value'));
  });

  it('rejects an action-scope enumeration', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outcome,
      "export const GRANT_SUPERSEDED_REASON = 'superseded';",
      "export const GRANT_ACTION_SCOPES = ['accept-quotation', 'approve-design'] as const;",
    );
    assert.ok(mentions(failures, 'action scope'));
  });
});

describe('policy', () => {
  it('rejects a TTL fallback literal', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policy,
      'export function grantExpiryOf(policy: SecureGrantPolicy, issuedAt: Date): Date {',
      'export function grantExpiryOf(policy: SecureGrantPolicy, issuedAt: Date): Date {\n' +
        '  const ttl = policy.standardTtlSeconds ?? 604800;\n  void ttl;',
    );
    assert.ok(mentions(failures, '604800'));
  });

  it('rejects a step-up window default', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.stepUp,
      'stepUpNotBefore(policy, query.now)',
      'stepUpNotBefore({ ...policy, stepUpWindowSeconds: policy.stepUpWindowSeconds ?? 900 }, query.now)',
    );
    assert.ok(mentions(failures, '900'));
  });

  it('rejects a consumer that publishes its own policy', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policyReader,
      'const version = await this.policies.currentValue(SECURE_GRANT_POLICY_KEY);',
      "await this.policies.ensureKey(SECURE_GRANT_POLICY_KEY, 'x');\n" +
        '    const version = await this.policies.currentValue(SECURE_GRANT_POLICY_KEY);',
    );
    assert.ok(mentions(failures, 'publication closed'));
  });

  it('rejects reading a different key', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policy,
      "export const SECURE_GRANT_POLICY_KEY = 'secure_grant';",
      "export const SECURE_GRANT_POLICY_KEY = 'grant.standard';",
    );
    assert.ok(mentions(failures, 'secure_grant key'));
  });
});

describe('the ACTIVE arbiter', () => {
  it('rejects an issue that silently rotates', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '      const live = await this.findActive(command);\n' +
        '      if (live !== undefined) {\n' +
        '        throw new SecureGrantError(GRANT_ALREADY_ACTIVE);\n' +
        '      }',
      '      const live = await this.findActive(command);\n' +
        '      if (live !== undefined) {\n' +
        "        await this.grants.revoke(live.id, 'rotated');\n" +
        '      }',
    );
    assert.ok(mentions(failures, 'rotation belongs to reissue'));
  });

  it('rejects an in-process mutex standing in for the database', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'export class SecureGrantIssuer {',
      'const Mutex = globalThis.__grantLock;\nexport class SecureGrantIssuer {',
    );
    assert.ok(mentions(failures, 'the database is the arbiter'));
  });
});

describe('reissue', () => {
  it('rejects reusing the source digest', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '        expiresAt: grantExpiryOf(policy, issuedAt),\n        notify: command.notify === true,\n        reissuedFrom: source.id,',
      '        expiresAt: grantExpiryOf(policy, issuedAt),\n        tokenHash: source.tokenHash,\n        notify: command.notify === true,\n        reissuedFrom: source.id,',
    );
    assert.ok(mentions(failures, "source's expiry or digest"));
  });

  it('rejects losing the lineage', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'await this.grants.supersede(source.id, replacement.grantId, GRANT_SUPERSEDED_REASON);',
      'void replacement;',
    );
    assert.ok(mentions(failures, 'lineage'));
  });

  it('rejects a non-canonical superseded reason', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      "      await this.revokeActive(source.id, GRANT_SUPERSEDED_REASON, 'GRANT_CONCURRENT_REISSUE_LOSS');",
      "      await this.revokeActive(source.id, 'rotated', 'GRANT_CONCURRENT_REISSUE_LOSS');",
    );
    assert.ok(mentions(failures, 'canonical superseded reason'));
  });

  it('rejects reissue touching envelope material', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '      const source = await this.findActive(command);',
      '      const ciphertext = 1;\n      void ciphertext;\n      const source = await this.findActive(command);',
    );
    assert.ok(mentions(failures, 'B01 seals a fresh one'));
  });
});

describe('revoke', () => {
  it('rejects an optional reason', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      "    if (reason.trim() === '') {\n      throw new SecureGrantError('GRANT_REVOKE_REASON_REQUIRED');\n    }",
      '',
    );
    assert.ok(mentions(failures, 'blank reason'));
  });

  it('rejects a revoke that rotates the token', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      "      await this.revokeActive(grantId, reason, 'GRANT_NOT_ACTIVE');",
      "      this.minter.mint();\n      await this.revokeActive(grantId, reason, 'GRANT_NOT_ACTIVE');",
    );
    assert.ok(mentions(failures, 'mints or rotates'));
  });

  it('rejects a reactivation path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outcome,
      "export const GRANT_SUPERSEDED_REASON = 'superseded';",
      "export const GRANT_SUPERSEDED_REASON = 'superseded';\nexport function reactivateGrant(): void {}",
    );
    assert.ok(mentions(failures, 'reactivation'));
  });
});

describe('the step-up window', () => {
  it('rejects dropping hasRecentCompleted', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.stepUp,
      'return await this.challenges.hasRecentCompleted(',
      'return await this.challenges.countIssuedSince(',
    );
    assert.ok(mentions(failures, 'hasRecentCompleted'));
  });

  it('rejects making SUBMISSION expressible', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.stepUp,
      "const STEP_UP = 'STEP_UP' as const;",
      "const STEP_UP = 'STEP_UP' as const;\nconst ALSO = 'SUBMISSION' as const;\nvoid ALSO;",
    );
    assert.ok(mentions(failures, 'identity is not presence'));
  });

  it('rejects a caller-chosen purpose', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.stepUp,
      '      STEP_UP,\n',
      '      query.purpose,\n',
    );
    assert.ok(mentions(failures, 'purpose'));
  });

  it('rejects a window that issues a grant', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.stepUp,
      '    const policy = await this.policies.require();',
      '    const policy = await this.policies.require();\n    await this.grants.issue({});',
    );
    assert.ok(mentions(failures, 'answers one question'));
  });
});

describe('audit', () => {
  it('rejects a missing lifecycle action', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      "export const GRANT_REVOKED_ACTION = 'secure_grant.revoked';",
      "export const GRANT_REVOKED_ACTION = 'secure_grant.withdrawn';",
    );
    assert.ok(mentions(failures, 'secure_grant.revoked'));
  });

  it('rejects a digest in the audit summary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      '      summary: { customRequestId: input.customRequestId },',
      '      summary: { customRequestId: input.customRequestId, tokenHash: input.tokenHash },',
    );
    assert.ok(mentions(failures, 'tokenHash'));
  });

  it('rejects a recipient in the audit summary', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      '      summary: { customRequestId: input.customRequestId },',
      '      summary: { customRequestId: input.customRequestId, recipient: input.recipient },',
    );
    assert.ok(mentions(failures, 'recipient'));
  });

  it('rejects dropping the issue audit', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '    await this.audit.recordIssued({',
      '    await Promise.resolve({',
    );
    assert.ok(mentions(failures, 'audit every lifecycle transition'));
  });
});

describe('the APP5 boundary', () => {
  it('rejects creating a Custom Request', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      '      await this.assertTargetCustomer(command.customerId);',
      '      await this.createCustomRequest(command.customerId);',
    );
    assert.ok(mentions(failures, 'that is APP5'));
  });

  it('rejects importing the Order module', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      "import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';",
      "import { CustomRequestRepository } from '../../order/domain/repositories/custom-request.repository';",
    );
    assert.ok(mentions(failures, 'does not compose the Order module'));
  });

  it('rejects an APP6/APP7 business action', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'export class SecureGrantIssuer {',
      'export class SecureGrantIssuer {\n  async acceptQuotation(): Promise<void> {}\n',
    );
    assert.ok(mentions(failures, 'business action'));
  });
});

describe('transport', () => {
  it('rejects a token-bearing query carrier', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.renderer,
      'return `${origin}${SECURE_LINK_LANDING_PATH}${SECURE_LINK_FRAGMENT_PREFIX}${rawToken}`;',
      'return `${origin}${SECURE_LINK_LANDING_PATH}?t=${rawToken}`;',
    );
    assert.ok(mentions(failures, 'query or path'));
  });

  it('rejects a hard-coded domain in the origin authority', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.originConfig,
      '  const raw = env[STOREFRONT_PUBLIC_ORIGIN_ENV];',
      "  const raw = env[STOREFRONT_PUBLIC_ORIGIN_ENV] ?? 'https://netheu.example.com';",
    );
    assert.ok(mentions(failures, 'hard-codes a domain'));
  });

  it('rejects building intent params outside B01', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notifier,
      "      reference: { kind: 'SECURE_ACCESS_GRANT', grantId: input.grantId },",
      "      params : { token: input.rawToken },\n      reference: { kind: 'SECURE_ACCESS_GRANT', grantId: input.grantId },",
    );
    assert.ok(mentions(failures, 'B01 owns that shape'));
  });

  it('rejects logging the token at the rendering seam', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.deliveryUseCase,
      '      secureLinkUrl = this.renderSecureLink(opened);',
      '      secureLinkUrl = this.renderSecureLink(opened);\n      this.logger.log(`sending ${secureLinkUrl}`);',
    );
    assert.ok(mentions(failures, 'logs token or link material'));
  });
});

describe('no schema and no provider', () => {
  it('rejects a new migration', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/0035_grant.sql'), 'select 1;', 'utf8');
    assert.ok(mentions(checkApp4B05(dir), 'adds none'));
  });

  it('rejects a schema declaration in an owned file', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outcome,
      "export const GRANT_SUPERSEDED_REASON = 'superseded';",
      "export const grantScopes = pgTable('grant_scopes', {});",
    );
    assert.ok(mentions(failures, 'declares schema'));
  });

  it('rejects a provider SDK import', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.notifier,
      "import { Inject, Injectable } from '@nestjs/common';",
      "import { Inject, Injectable } from '@nestjs/common';\nimport nodemailer from 'nodemailer';",
    );
    assert.ok(mentions(failures, 'provider SDK'));
  });
});

/**
 * `APP4-B06` reconciliation guards.
 *
 * B05's "zero published operations" rule was restated to admit the one route
 * `APP4-B06` owns. These prove B05's own surface is still asserted to be zero:
 * a grant issue, reissue or revoke route, or a controller for one, still fails.
 */
describe('APP4-B05 — the APP4-B06 reconciliation stays narrow', () => {
  it('still rejects a grant route beside the authorized resolver', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/public/grants/{grantId}/revoke'] = { post: {} };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'B05 publishes none'));
  });

  it('still rejects a GET form of the authorized resolver', () => {
    const document = JSON.parse(real(CANONICAL_FILES.openapi));
    document.paths['/api/public/secure-links/resolve'].get = { operationId: 'x_get' };
    const failures = checkApp4B05(
      rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }),
    );
    assert.ok(mentions(failures, 'APP4-B06 owns one POST'));
  });

  it('still rejects a grant controller registered beside the B06 one', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.module,
      'controllers: [PublicVerificationController, PublicSecureLinkController],',
      'controllers: [PublicVerificationController, PublicSecureLinkController, AdminGrantController],',
    );
    assert.ok(mentions(failures, 'registers a grant controller'));
  });
});
