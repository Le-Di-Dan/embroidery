/**
 * Regressions for the `APP4-B03` contract gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked source.
 *
 * The mutations are the plausible mistakes rather than vandalism: returning the
 * code, rotating the live challenge, sealing directly, accepting a `customerId`,
 * naming a customer in a refusal, hard-coding the TTL, marking a live source
 * `EXPIRED`. Every one of them compiles, and most would pass a happy-path suite.
 *
 * Three cases keep the gate honest rather than merely strict. `reads code rather
 * than prose` matters most: every file in this checkpoint documents what it
 * deliberately does not do — "never `sealDeliveryEnvelope`", "no
 * `CUSTOMER_NOT_FOUND`", "`23505` is also the primary key" — and a gate that
 * failed on its own explanation would be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  B04_FILES,
  CANONICAL_FILES,
  MODULE_DIR,
  REPO_ROOT,
  checkApp4B03Contract,
} from './check-app4-b03-contract.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b03-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'packages/contracts/openapi',
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

function failuresAfterEdit(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4B03Contract(rootWith({ [relative]: source.replace(from, to) }));
}

/** Failures after one edit to the generated OpenAPI document. */
function failuresAfterContractEdit(mutate) {
  const document = JSON.parse(real(CANONICAL_FILES.openapi));
  mutate(document);
  return checkApp4B03Contract(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }));
}

describe('APP4-B03 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B03Contract(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B03Contract(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.issuer)}
/**
 * sealDeliveryEnvelope, openDeliveryEnvelope, createCipheriv, '23505',
 * CUSTOMER_NOT_FOUND, CustomerRepository, recordAttempt(), completeChallenge(),
 * SECURE_ACCESS_GRANT, DEAD_LETTER, publishVersion, ensureKey, ttlSeconds = 600,
 * resendCooldownSeconds = 60, policy.maxAttempts, pgTable().
 */
`;
    assert.deepEqual(checkApp4B03Contract(rootWith({ [CANONICAL_FILES.issuer]: source })), []);
  });

  it('tolerates APP4-B04, which legitimately compares codes and reaches identity', () => {
    // The neighbouring checkpoint shares two of B03's trees: its refusal table
    // and its outcome vocabulary live in `domain/verification`, its request and
    // response schemas in `presentation`. A gate scoped to those directories
    // rather than to B03's own files would fail on the checkpoint whose entire
    // job is to compare a submitted code and establish an identity.
    const outcomes = `${MODULE_DIR}/domain/verification/verification-attempt-outcome.ts`;
    assert.ok(real(outcomes).includes('MISMATCH'));
    assert.deepEqual(checkApp4B03Contract(rootWith()), []);
  });

  it('refuses an exemption that names a file which does not exist', () => {
    const dir = rootWith();
    rmSync(join(dir, B04_FILES[0]));

    assert.ok(mentions(checkApp4B03Contract(dir), 'does not exist'));
  });

  it('still holds B03 rules against a B04 file that strays into B03 territory', () => {
    // The exemption is a file list, not a licence: B03's own sources are still
    // read, so a B03 file that starts comparing codes fails exactly as before.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'const code = this.minter.mint();',
      'const code = this.minter.mint();\n    verifySecretDigest(code);',
    );
    assert.ok(mentions(failures, 'that is B04'));
  });

  it('tolerates the B02 identity service, which legitimately reaches the customer', () => {
    // The neighbouring checkpoint lives in the same `application/` directory and
    // exists to touch `CustomerRepository`. A gate scoped to the directory rather
    // than to B03's own files would fail on it.
    const b02 = `${MODULE_DIR}/application/resolve-or-create-verified-customer.service.ts`;
    assert.ok(real(b02).includes('CUSTOMER_REPOSITORY'));
    assert.deepEqual(checkApp4B03Contract(rootWith()), []);
  });
});

describe('APP4-B03 — the published contract', () => {
  it('rejects a fifth verification operation', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/verification/challenges/{challengeId}/confirm'] = {
        post: { operationId: 'publicVerification_confirm' },
      };
    });
    assert.ok(mentions(failures, 'expected exactly'));
  });

  it('rejects an uncanonical attempt route even though B04 now exists', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/verification/attempts'] = {
        post: { operationId: 'publicVerification_submit' },
      };
    });
    assert.ok(mentions(failures, 'expected exactly'));
  });

  it('rejects dropping a B03 operation from the shared surface', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.paths['/api/public/verification/challenges/{challengeId}/resend'];
    });
    assert.ok(mentions(failures, 'expected exactly'));
  });

  it('rejects a second method on the status path', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/verification/challenges/{challengeId}'].delete = {
        operationId: 'publicVerification_cancel',
      };
    });
    assert.ok(mentions(failures, 'expected [get]'));
  });

  it('rejects a B05 grant endpoint', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/secure-access/grants'] = {
        post: { operationId: 'publicSecureAccess_issue' },
      };
    });
    assert.ok(mentions(failures, 'APP4-B05 route'));
  });

  it('rejects a renamed issue path', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/verification/otp'] =
        document.paths['/api/public/verification/challenges'];
      delete document.paths['/api/public/verification/challenges'];
    });
    assert.ok(mentions(failures, 'expected exactly'));
  });

  it('rejects a code in the response', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeResponse.properties.code = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'exposes "code"'));
  });

  it('rejects a hash in the response', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeResponse.properties.codeHash = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'codeHash'));
  });

  it('rejects dropping the resend timing', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.VerificationChallengeResponse.properties.resendAvailableAt;
    });
    assert.ok(mentions(failures, 'resendAvailableAt'));
  });

  it('rejects a customer id in the request', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.IssueVerificationChallengeBody.properties.customerId = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'customerId'));
  });

  it('rejects widening the purpose set', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.IssueVerificationChallengeBody.properties.purpose.enum = [
        'SUBMISSION',
        'STEP_UP',
        'PASSWORD_RESET',
      ];
    });
    assert.ok(mentions(failures, 'purpose set'));
  });

  it('rejects an unpublished response component', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.VerificationChallengeResponse;
    });
    assert.ok(mentions(failures, 'not published as a component'));
  });
});

describe('APP4-B03 — the controller B04 now shares', () => {
  it('rejects renaming the class every operationId is derived from', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      'export class PublicVerificationController {',
      'export class VerificationController {',
    );
    assert.ok(mentions(failures, 'renamed or split'));
  });

  it('rejects removing the resend handler', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      "@Post(':challengeId/resend')",
      "@Post(':challengeId/reissue')",
    );
    assert.ok(mentions(failures, 'resend handler is gone'));
  });

  it("rejects dropping B03's own failure mapping even while B04's remains", () => {
    // The plausible mistake: B04 adds its guard, someone folds the two together
    // and B03's issue path quietly stops translating. A rule that matched the
    // mapping call anywhere in the file would be satisfied by B04's copy.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      'private async guard(',
      'private async guardIssuance(',
    );
    assert.ok(mentions(failures, 'bounded failures'));
  });

  it('rejects sealing or minting from the controller', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.controller,
      '@Controller(',
      'const seal = sealDeliveryEnvelope;\n@Controller(',
    );
    assert.ok(mentions(failures, 'sealDeliveryEnvelope'));
  });
});

describe('APP4-B03 — non-enumeration', () => {
  it('rejects a refusal that names a customer', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.errors,
      'function contactNotAcceptable(): HttpException {',
      'export const CUSTOMER_NOT_FOUND = 404;\nfunction contactNotAcceptable(): HttpException {',
    );
    assert.ok(mentions(failures, 'disclose customer existence'));
  });

  it('rejects reaching the customer repository from the issue path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'const normalized = normalizeContact(command.contactKind, command.contact);',
      'await this.customers.findByVerifiedContact();\n    const normalized = normalizeContact(command.contactKind, command.contact);',
    );
    assert.ok(mentions(failures, 'reaches customer identity'));
  });
});

describe('APP4-B03 — primitives and secrecy', () => {
  it('rejects sealing an envelope directly', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'await this.notifications.request({',
      'sealDeliveryEnvelope(key, {});\n    await this.notifications.request({',
    );
    assert.ok(mentions(failures, 'envelope handling belongs to B01'));
  });

  it('rejects bypassing the B01 hand-off', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'await this.notifications.request({',
      'await Promise.resolve({',
    );
    assert.ok(mentions(failures, 'B01 NotificationRequest'));
  });

  it('rejects persisting the raw code instead of a digest', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'const codeHash = digestSecret(this.peppers.require().verificationCodePepper, code);',
      'const codeHash = code;',
    );
    assert.ok(mentions(failures, 'P01 HMAC authority'));
  });

  it('rejects a second code generator', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'const code = this.minter.mint();',
      'const code = String(Math.floor(Math.random() * 1_000_000));',
    );
    assert.ok(mentions(failures, 'P01 issuer seam'));
  });

  it('rejects logging the code', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'try {\n      await this.challenges.openChallenge({',
      'console.log(`issued ${code}`);\n    try {\n      await this.challenges.openChallenge({',
    );
    assert.ok(mentions(failures, 'log call mentions the code'));
  });
});

describe('APP4-B03 — scope boundaries', () => {
  it('rejects writing a verification attempt row', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'return await this.issuer.issue(target, policy, now);',
      'await this.challenges.recordAttempt();\n      return await this.issuer.issue(target, policy, now);',
    );
    assert.ok(mentions(failures, 'attempt row'));
  });

  it('rejects completing a challenge', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.resendUseCase,
      'return await this.issuer.issue(target, policy, now);',
      'await this.challenges.completeChallenge();\n      return await this.issuer.issue(target, policy, now);',
    );
    assert.ok(mentions(failures, 'that is B04'));
  });

  it('rejects issuing a grant', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'export const VERIFICATION_TEMPLATE_KEY',
      "import { issueSecureLinkToken } from '../domain/secret/secure-link-token.issuer';\nexport const VERIFICATION_TEMPLATE_KEY",
    );
    assert.ok(mentions(failures, 'grant'));
  });

  it('rejects reimplementing the delivery retry', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      'export const VERIFICATION_TEMPLATE_VERSION = 1;',
      'export const VERIFICATION_TEMPLATE_VERSION = 1;\nconst retryDelay = 1;',
    );
    assert.ok(mentions(failures, 'W01 retry'));
  });

  it('rejects consuming the B04 attempt budget', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'if (issued >= policy.maxIssuesPerTargetPerWindow) {',
      'if (issued >= policy.maxAttempts) {',
    );
    assert.ok(mentions(failures, 'B04 attempt budget'));
  });

  it('rejects a schema declaration in the module', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policy,
      'export const VERIFICATION_CHALLENGE_POLICY_KEY',
      "export const extra = pgTable('verification_extras', {});\nexport const VERIFICATION_CHALLENGE_POLICY_KEY",
    );
    assert.ok(mentions(failures, 'declares schema'));
  });

  it('rejects a migration added by this checkpoint', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/0035_b03.sql'), '-- no', 'utf8');

    assert.ok(mentions(checkApp4B03Contract(dir), 'adds none'));
  });
});

describe('APP4-B03 — policy and behaviour', () => {
  it('rejects a hard-coded TTL', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'const policy = await this.policies.require();',
      'const policy = { ttlSeconds: 600, resendCooldownSeconds: 60 };',
    );
    assert.ok(mentions(failures, 'restates the policy value'));
  });

  it('rejects publishing policy from the request path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.policyReader,
      'const version = await this.policies.currentValue(VERIFICATION_CHALLENGE_POLICY_KEY);',
      "await this.policies.ensureKey(VERIFICATION_CHALLENGE_POLICY_KEY, 'x');\n    const version = undefined;",
    );
    assert.ok(mentions(failures, 'never publishes'));
  });

  it('rejects a raw SQLSTATE match on the CST-007 arbiter', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issuer,
      "const CHALLENGE_ALREADY_OPEN = 'CHALLENGE_ALREADY_OPEN';",
      "const CHALLENGE_ALREADY_OPEN = '23505';",
    );
    assert.ok(mentions(failures, 'raw SQLSTATE'));
  });

  it('rejects rotating a live challenge on the issue endpoint', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'const live = await this.challenges.resolveOpen(',
      'const live = undefined as undefined | never;\n      void ((',
    );
    assert.ok(mentions(failures, 'already-open challenge'));
  });

  it('rejects inserting without expiring stale rows first', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'await this.challenges.expireStale(command.contactKind, normalized, command.purpose, now);',
      '',
    );
    assert.ok(mentions(failures, 'expire stale rows'));
  });

  it('rejects dropping the issuance rate window', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'const issued = await this.challenges.countIssuedSince(',
      'const issued = 0;\n    void ((',
    );
    assert.ok(mentions(failures, 'rate window'));
  });

  it('rejects an unserialized issue path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.issueUseCase,
      'await this.challenges.lockTarget(command.contactKind, normalized, command.purpose);',
      '',
    );
    assert.ok(mentions(failures, 'serialize issuance'));
  });

  it('rejects a resend that does not cancel its source', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.resendUseCase,
      'if (!(await this.challenges.cancelChallenge(source.id))) {',
      'if (false) {',
    );
    assert.ok(mentions(failures, 'cancel the source'));
  });

  it('rejects marking a live source EXPIRED instead of CANCELLED', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.resendUseCase,
      'await this.challenges.expireStale(',
      "await this.challenges.markExpired('EXPIRED');\n      await this.challenges.expireStale(",
    );
    assert.ok(mentions(failures, 'DB3 locks CANCELLED'));
  });

  it('rejects a resend body that could redirect the code', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.request,
      'export const verificationChallengeIdParamSchema',
      'export const resendVerificationChallengeSchema = 1;\nexport const verificationChallengeIdParamSchema',
    );
    assert.ok(mentions(failures, 'target comes from the source'));
  });
});
