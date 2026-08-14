/**
 * Regressions for the `APP4-B04` contract gate.
 *
 * Each case breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. The mutations are the plausible mistakes rather
 * than vandalism: comparing the digest with `===`, defaulting `maxAttempts` to
 * five, appending an outcome TBL-007 does not allow, letting the status GET
 * sweep the row, returning the customer id, issuing the grant while the customer
 * is in hand. Every one of them compiles, and most would pass a happy-path
 * suite.
 *
 * `reads code rather than prose` matters most: every file in this checkpoint
 * documents what it deliberately does not do — "no second HMAC", "no counter
 * column", "never `sealDeliveryEnvelope`" — and a gate that failed on its own
 * explanation would be deleted within a checkpoint.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, checkApp4B04Contract } from './check-app4-b04-contract.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real trees the gate walks, plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-b04-'));
  temporaries.push(dir);
  for (const relative of [
    'apps/api/src',
    'packages/contracts/openapi',
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
  return checkApp4B04Contract(rootWith({ [relative]: source.replace(from, to) }));
}

/** As above, but replacing every occurrence — for a rule stated in two methods. */
function failuresAfterEditAll(relative, from, to) {
  const source = real(relative);
  assert.ok(source.includes(from), `${relative} is missing the anchor: ${from.slice(0, 60)}`);
  return checkApp4B04Contract(rootWith({ [relative]: source.split(from).join(to) }));
}

/** Failures after one edit to the generated OpenAPI document. */
function failuresAfterContractEdit(mutate) {
  const document = JSON.parse(real(CANONICAL_FILES.openapi));
  mutate(document);
  return checkApp4B04Contract(rootWith({ [CANONICAL_FILES.openapi]: JSON.stringify(document) }));
}

describe('APP4-B04 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4B04Contract(REPO_ROOT), []);
  });

  it('passes against a faithful copy, so the gate is path-independent', () => {
    assert.deepEqual(checkApp4B04Contract(rootWith()), []);
  });

  it('reads code rather than prose', () => {
    const source = `${real(CANONICAL_FILES.outcome)}
/**
 * createHmac, timingSafeEqual, scrypt, maxAttempts = 5, attemptCount,
 * lockedUntil, sealDeliveryEnvelope, SECURE_ACCESS_GRANT, issueVerificationCode,
 * custom_requests, quotation, pgTable(), outbox_events, codeHash === digest.
 */
`;
    assert.deepEqual(checkApp4B04Contract(rootWith({ [CANONICAL_FILES.outcome]: source })), []);
  });
});

describe('APP4-B04 — the published surface', () => {
  it('rejects removing the attempt route', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.paths['/api/public/verification/challenges/{challengeId}/attempts'];
    });
    assert.ok(mentions(failures, 'expected one POST'));
  });

  it('rejects a status route that also accepts a write', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/verification/challenges/{challengeId}'].delete = {
        operationId: 'publicVerification_cancel',
      };
    });
    assert.ok(mentions(failures, 'expected one GET'));
  });

  it('rejects dropping a B03 operation', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.paths['/api/public/verification/challenges/{challengeId}/resend'];
    });
    assert.ok(mentions(failures, 'APP4-B03 operation is missing'));
  });

  it('rejects a B05 grant endpoint', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/secure-access/grants'] = { post: {} };
    });
    assert.ok(mentions(failures, 'grant route'));
  });

  it('rejects an APP5 business operation', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/custom-requests'] = { post: {} };
    });
    assert.ok(mentions(failures, 'business operation'));
  });

  it('rejects a third operation anywhere, by count', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.paths['/api/public/health/extra'] = { get: {} };
    });
    assert.ok(mentions(failures, 'expected 46'));
  });
});

describe('APP4-B04 — the attempt body', () => {
  it('rejects a contact field that could redirect the verification', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.SubmitVerificationAttemptBody.properties.contact = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'expected exactly [code]'));
  });

  it('rejects a purpose field that could re-aim the challenge', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.SubmitVerificationAttemptBody.properties.purpose = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'expected exactly [code]'));
  });

  it('rejects a numeric code, which would eat a leading zero', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.SubmitVerificationAttemptBody.properties.code = {
        type: 'integer',
      };
    });
    assert.ok(mentions(failures, 'must be a string'));
  });

  it('rejects widening the code shape', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.SubmitVerificationAttemptBody.properties.code.pattern =
        '^[0-9]{4,8}$';
    });
    assert.ok(mentions(failures, 'expected ^[0-9]{6}$'));
  });

  it('rejects a body that tolerates unknown fields', () => {
    const failures = failuresAfterContractEdit((document) => {
      delete document.components.schemas.SubmitVerificationAttemptBody.additionalProperties;
    });
    assert.ok(mentions(failures, 'must be strict'));
  });
});

describe('APP4-B04 — the published responses', () => {
  it('rejects disclosing the customer', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeStatusResponse.properties.customerId = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'customerId'));
  });

  it('rejects disclosing the attempt budget', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeStatusResponse.properties.attemptsRemaining =
        { type: 'integer' };
    });
    assert.ok(mentions(failures, 'attemptsRemaining'));
  });

  it('rejects disclosing the purpose', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeStatusResponse.properties.purpose = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'purpose'));
  });

  it('rejects a code or digest in the response', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeStatusResponse.properties.codeHash = {
        type: 'string',
      };
    });
    assert.ok(mentions(failures, 'codeHash'));
  });

  it('rejects narrowing the published state set', () => {
    const failures = failuresAfterContractEdit((document) => {
      document.components.schemas.VerificationChallengeStatusResponse.properties.state.enum = [
        'ISSUED',
        'VERIFIED',
      ];
    });
    assert.ok(mentions(failures, 'published state set'));
  });
});

describe('APP4-B04 — the comparison', () => {
  it('rejects a plain equality against the stored digest', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const matched = verifySecretDigest(',
      'const matched = digest === code || verifySecretDigest(',
    );
    assert.ok(mentions(failures, 'compares a digest with =='));
  });

  it('rejects a second digest implementation', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const digest = await this.challenges.findCodeDigest(challenge.id);',
      'const digest = createHash("sha256").update(code).digest("hex");',
    );
    assert.ok(mentions(failures, 'second digest'));
  });

  it('rejects a password KDF on the OTP path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const MAX_PASSES = 2;',
      'const MAX_PASSES = 2;\nconst kdf = scryptSync;',
    );
    assert.ok(mentions(failures, 'password KDF'));
  });

  it('rejects dropping the P01 verifier', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const matched = verifySecretDigest(',
      'const matched = Boolean(',
    );
    assert.ok(mentions(failures, 'P01 constant-time verifier'));
  });
});

describe('APP4-B04 — the attempt budget', () => {
  it('rejects a hard-coded attempt limit', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const policy = await this.policies.require();',
      'const policy = { maxAttempts: 5 };',
    );
    assert.ok(mentions(failures, 'hard-codes the attempt budget'));
  });

  it('rejects a fallback when the policy is missing', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'if (spent >= policy.maxAttempts) {',
      'if (spent >= (policy.maxAttempts ?? 5)) {',
    );
    assert.ok(mentions(failures, 'falls back'));
  });

  it('rejects a counter field standing in for the ledger', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const spent = await this.challenges.countAttempts(challenge.id);',
      'const spent = challenge.attemptCount;',
    );
    assert.ok(mentions(failures, 'invents "attemptCount"'));
  });

  it('rejects a lockout timestamp', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outcome,
      'export const LOCKED = ',
      'export const lockedUntil = 0;\nexport const LOCKED = ',
    );
    assert.ok(mentions(failures, 'lockedUntil'));
  });
});

describe('APP4-B04 — the attempt state machine', () => {
  it('rejects an outcome TBL-007 does not allow', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      "await this.challenges.recordAttempt(challenge.id, 'MISMATCH', now);",
      "await this.challenges.recordAttempt(challenge.id, 'WRONG_CODE', now);",
    );
    assert.ok(mentions(failures, 'TBL-007 allows only the three'));
  });

  it('rejects dropping the expired-at-entry attempt', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      "await this.challenges.recordAttempt(challenge.id, 'EXPIRED_AT_ENTRY', now);",
      '',
    );
    assert.ok(mentions(failures, 'never appends EXPIRED_AT_ENTRY'));
  });

  it('rejects answering a terminal challenge', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      "if (challenge === undefined || challenge.status !== 'ISSUED') {",
      'if (challenge === undefined) {',
    );
    assert.ok(mentions(failures, 'non-ISSUED challenge'));
  });

  it('rejects dropping the ISSUED -> FAILED transition', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'await this.challenges.failChallenge(challenge.id);',
      '',
    );
    assert.ok(mentions(failures, 'locked-out challenge to FAILED'));
  });

  it('rejects an unserialized attempt path', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'await this.challenges.lockTarget(',
      'await Promise.resolve(',
    );
    assert.ok(mentions(failures, 'serialize attempts'));
  });

  it('rejects a process-local single-use guard', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const MAX_PASSES = 2;',
      'const MAX_PASSES = 2;\nconst consumed = new Mutex();',
    );
    assert.ok(mentions(failures, 'process-local state'));
  });
});

describe('APP4-B04 — purpose effects', () => {
  it('rejects an identity effect that ignores the purpose', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      "challenge.purpose === 'SUBMISSION'",
      'true',
    );
    assert.ok(mentions(failures, 'branch the identity effect'));
  });

  it('rejects creating the customer outside APP4-B02', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const resolution = await this.identities.resolve(evidence);',
      'const resolution = { customerId: newId() };',
    );
    assert.ok(mentions(failures, 'APP4-B02'));
  });

  it('rejects an unbounded concurrency retry', () => {
    // The plausible version: the constant stays, and the comparison that made it
    // mean something quietly stops being made.
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'if (!isConcurrentVerificationLoss(error) || pass >= MAX_PASSES) {',
      'if (!isConcurrentVerificationLoss(error)) {',
    );
    assert.ok(mentions(failures, 'not bounded'));
  });

  it('rejects rebuilding the contact instead of re-deriving it through P01', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.evidence,
      '      ? normalizeEmail(challenge.normalizedValue)\n      : normalizePhone(challenge.normalizedValue);',
      '      ? { ok: true, contact: { kind: "EMAIL", normalized: challenge.normalizedValue, display: "" } }\n      : undefined;',
    );
    assert.ok(mentions(failures, 'P01 normalizers'));
  });

  it('rejects dropping the fixed-point check on the stored contact', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.evidence,
      'if (!result.ok || result.contact.normalized !== challenge.normalizedValue) {',
      'if (!result.ok) {',
    );
    assert.ok(mentions(failures, 'fixed point'));
  });

  it('rejects issuing a grant from a completed step-up', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const MAX_PASSES = 2;',
      "import { issueSecureLinkToken } from '../domain/secret/secure-link-token.issuer';\nconst MAX_PASSES = 2;",
    );
    assert.ok(mentions(failures, 'grant'));
  });

  it('rejects creating an APP5 request', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const MAX_PASSES = 2;',
      'const MAX_PASSES = 2;\nconst requests = createCustomRequest;',
    );
    assert.ok(mentions(failures, 'APP5 request'));
  });
});

describe('APP4-B04 — issuance and delivery stay out', () => {
  it('rejects requesting a notification', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'await this.audit.recordVerified(',
      'await this.notifications.request({});\n    await this.audit.recordVerified(',
    );
    assert.ok(mentions(failures, 'requests a notification'));
  });

  it('rejects minting a replacement code', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const MAX_PASSES = 2;',
      'const MAX_PASSES = 2;\nconst next = issueVerificationCode();',
    );
    assert.ok(mentions(failures, 'mints a code'));
  });

  it('rejects sealing an envelope', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const MAX_PASSES = 2;',
      'const MAX_PASSES = 2;\nconst seal = sealDeliveryEnvelope;',
    );
    assert.ok(mentions(failures, 'delivery envelope'));
  });
});

describe('APP4-B04 — audit evidence', () => {
  it('rejects an audit summary carrying the contact', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.recorder,
      "contactKind: challenge.contactKind,\n        outcome: 'MATCH',",
      "contactKind: challenge.contactKind,\n        normalizedValue: challenge.normalizedValue,\n        outcome: 'MATCH',",
    );
    assert.ok(mentions(failures, 'normalizedValue'));
  });

  it('rejects dropping the request correlation', () => {
    const failures = failuresAfterEditAll(
      CANONICAL_FILES.recorder,
      'this.requestContext.requireRequestId()',
      "'unknown'",
    );
    assert.ok(mentions(failures, 'platform request id'));
  });

  it('rejects logging the submitted code', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.useCase,
      'const digest = await this.challenges.findCodeDigest(challenge.id);',
      'console.log(`answered ${code}`);\n    const digest = await this.challenges.findCodeDigest(challenge.id);',
    );
    assert.ok(mentions(failures, 'log call mentions the code'));
  });
});

describe('APP4-B04 — the status read', () => {
  it('rejects a status read that sweeps the row it found expired', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.statusQuery,
      'return {\n      challengeId: challenge.id,',
      'await this.challenges.expireStale();\n    return {\n      challengeId: challenge.id,',
    );
    assert.ok(mentions(failures, 'performs a transition'));
  });

  it('rejects a status read that opens a transaction', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.statusQuery,
      'export interface VerificationChallengeStatus {',
      'import { TransactionManager } from "@embroidery/persistence";\nexport interface VerificationChallengeStatus {',
    );
    assert.ok(mentions(failures, 'opens a transaction'));
  });

  it('rejects a status projection that discloses the purpose', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.statusQuery,
      'state: effectiveState(challenge, this.clock.now()),',
      'state: effectiveState(challenge, this.clock.now()),\n      purpose: challenge.purpose,',
    );
    assert.ok(mentions(failures, 'must not disclose'));
  });

  it('rejects reporting a time-expired ISSUED row as live', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.statusQuery,
      "return challenge.status === 'ISSUED' && now >= challenge.expiresAt ? 'EXPIRED' : challenge.status;",
      'return challenge.status;',
    );
    assert.ok(mentions(failures, 'time-expired'));
  });
});

describe('APP4-B04 — schema and migrations', () => {
  it('rejects a migration added by this checkpoint', () => {
    const dir = rootWith();
    writeFileSync(join(dir, 'packages/database/migrations/0035_b04.sql'), '-- no', 'utf8');

    assert.ok(mentions(checkApp4B04Contract(dir), 'adds none'));
  });

  it('rejects a schema declaration in the owned surface', () => {
    const failures = failuresAfterEdit(
      CANONICAL_FILES.outcome,
      'export const VERIFIED = ',
      "export const lockouts = pgTable('verification_lockouts', {});\nexport const VERIFIED = ",
    );
    assert.ok(mentions(failures, 'declares schema'));
  });

  it('rejects a missing owned file', () => {
    const dir = rootWith();
    rmSync(join(dir, CANONICAL_FILES.evidence));

    assert.ok(mentions(checkApp4B04Contract(dir), 'does not exist'));
  });
});
