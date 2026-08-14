/**
 * Regressions for the `APP4-G01` authority gate (IMP-D049).
 *
 * A gate that only ever says yes is indistinguishable from no gate, so every
 * case below breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked authority.
 *
 * Three cases deserve their names read carefully. `catches a seed that drifts
 * from the ADR` is the whole reason the policy values are asserted twice — one
 * source could drift silently. `catches an envelope key that aliases a pepper`
 * pins the separation ruling in the only form a `.env` file can violate it. And
 * `does not mistake a path or an identifier for key material` is the honesty
 * check on the literal scanner: a scanner that flags
 * `maxIssuesPerTargetPerWindow` gets disabled within a week and then protects
 * nothing.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  DECISION_ID,
  EXPECTED_FACTS,
  POLICY,
  REPO_ROOT,
  checkApp4G01,
  factTable,
  findLiteralSecrets,
} from './check-app4-g01.mjs';

const adrText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.adr), 'utf8');
const seedText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.seed), 'utf8');
const envText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.envExample), 'utf8');
const registerText = readFileSync(join(REPO_ROOT, CANONICAL_FILES.register), 'utf8');

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real canonical files plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app4-g01-'));
  temporaries.push(dir);
  for (const relative of Object.values(CANONICAL_FILES)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
  // The negation half counts real migrations and walks the real API sources.
  cpSync(
    join(REPO_ROOT, 'packages/database/migrations'),
    join(dir, 'packages/database/migrations'),
    {
      recursive: true,
    },
  );
  cpSync(join(REPO_ROOT, 'apps/api/src'), join(dir, 'apps/api/src'), { recursive: true });
  for (const [relative, text] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), text, 'utf8');
  }
  return dir;
}

/** Failures after one substitution in a named canonical file. */
function failuresAfterEdit(key, from, to) {
  const source = { adr: adrText, seed: seedText, envExample: envText, register: registerText }[key];
  assert.ok(source.includes(from), `${key} is missing the anchor: ${from.slice(0, 70)}`);
  return checkApp4G01(rootWith({ [CANONICAL_FILES[key]]: source.replace(from, to) }));
}

const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

describe('APP4-G01 — the repository as it stands', () => {
  it('passes', () => {
    assert.deepEqual(checkApp4G01(REPO_ROOT), []);
  });

  it('passes against a faithful throwaway copy, so later cases mean something', () => {
    assert.deepEqual(checkApp4G01(rootWith()), []);
  });

  it('records every non-policy fact and every policy value in one table', () => {
    const facts = factTable(adrText);
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, `fact ${key}`);
    }
    assert.equal(facts.get('verification.challenge.ttlSeconds'), '600');
    assert.equal(facts.get('notification.delivery.retryDelaysSeconds'), '[60, 300]');
    assert.equal(facts.get('secure_grant.standardTtlSeconds'), '604800');
  });

  it('locks the four policy keys and no others', () => {
    assert.deepEqual(Object.keys(POLICY), [
      'verification.challenge',
      'secure_grant',
      'notification.delivery',
      'secure_link.resolve',
    ]);
  });
});

describe('APP4-G01 — policy values', () => {
  it('catches a challenge TTL that changed in the ADR alone', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `verification.challenge.ttlSeconds` | `600` |',
      '| `verification.challenge.ttlSeconds` | `1800` |',
    );
    assert.ok(mentions(failures, 'verification.challenge.ttlSeconds'));
  });

  it('catches a seed that drifts from the ADR', () => {
    const failures = failuresAfterEdit('seed', '"ttlSeconds": 600', '"ttlSeconds": 1800');
    assert.ok(mentions(failures, 'verification.challenge.ttlSeconds'));
  });

  it('catches a grant TTL that is no longer seven days', () => {
    const failures = failuresAfterEdit(
      'seed',
      '"standardTtlSeconds": 604800',
      '"standardTtlSeconds": 86400',
    );
    assert.ok(mentions(failures, 'secure_grant.standardTtlSeconds'));
  });

  it('catches a step-up window that is no longer fifteen minutes', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `secure_grant.stepUpWindowSeconds` | `900` |',
      '| `secure_grant.stepUpWindowSeconds` | `3600` |',
    );
    assert.ok(mentions(failures, 'secure_grant.stepUpWindowSeconds'));
  });

  it('catches a fourth automatic attempt', () => {
    const failures = failuresAfterEdit('seed', '"maxAttempts": 3', '"maxAttempts": 4');
    assert.ok(mentions(failures, 'notification.delivery.maxAttempts'));
    // And the derived invariant fires too: three delays are needed for four attempts.
    assert.ok(mentions(failures, 'retryDelaysSeconds must hold maxAttempts - 1'));
  });

  it('catches a backoff schedule that no longer matches the budget', () => {
    const failures = failuresAfterEdit(
      'seed',
      '"retryDelaysSeconds": [60, 300]',
      '"retryDelaysSeconds": [60, 300, 900]',
    );
    assert.ok(mentions(failures, 'retryDelaysSeconds must hold maxAttempts - 1'));
  });

  it('catches a policy field that lost its unit', () => {
    const failures = failuresAfterEdit(
      'seed',
      '"maxRequestsPerIpPerMinute": "requests"',
      '"unrelated": "requests"',
    );
    assert.ok(mentions(failures, 'declares no unit'));
  });

  it('catches a seed that stops declaring itself secret-free', () => {
    const failures = failuresAfterEdit(
      'seed',
      '"containsSecrets": false',
      '"containsSecrets": true',
    );
    assert.ok(mentions(failures, 'containsSecrets'));
  });
});

describe('APP4-G01 — contracts that must not blur', () => {
  it('catches a code length that is no longer six digits', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `verification.challenge.codeLength` | `6` |',
      '| `verification.challenge.codeLength` | `4` |',
    );
    assert.ok(mentions(failures, 'verification.challenge.codeLength'));
  });

  it('catches a public failure that stops being a 404', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `secure_link.unavailable.status` | `404` |',
      '| `secure_link.unavailable.status` | `410` |',
    );
    assert.ok(mentions(failures, 'secure_link.unavailable.status'));
  });

  it('catches a public failure that starts naming its cause', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `secure_link.unavailable.code` | `SECURE_LINK_UNAVAILABLE` |',
      '| `secure_link.unavailable.code` | `SECURE_LINK_EXPIRED` |',
    );
    assert.ok(mentions(failures, 'secure_link.unavailable.code'));
  });

  it('catches a replay refusal that stops being 409 / REISSUE_REQUIRED', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `delivery.manualReplay.refusalCode` | `REISSUE_REQUIRED` |',
      '| `delivery.manualReplay.refusalCode` | `CONFLICT` |',
    );
    assert.ok(mentions(failures, 'delivery.manualReplay.refusalCode'));
  });

  it('catches a dead-letter row that stops being terminal', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `delivery.manualReplay.originOutboxEvent` | `REMAINS_DEAD_LETTER_TERMINAL` |',
      '| `delivery.manualReplay.originOutboxEvent` | `RESET_TO_PENDING` |',
    );
    assert.ok(mentions(failures, 'delivery.manualReplay.originOutboxEvent'));
  });

  it('catches an API that would decrypt during replay', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `delivery.manualReplay.apiDecrypts` | `NEVER` |',
      '| `delivery.manualReplay.apiDecrypts` | `ONCE` |',
    );
    assert.ok(mentions(failures, 'delivery.manualReplay.apiDecrypts'));
  });

  it('catches the encrypted intent reference being promoted to the current one', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `envelope.originNotificationIntentId.role` | `LINEAGE_ONLY` |',
      '| `envelope.originNotificationIntentId.role` | `CURRENT_INTENT` |',
    );
    assert.ok(mentions(failures, 'envelope.originNotificationIntentId.role'));
  });

  it('catches a replay key that stops being deterministic over the locked input', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `delivery.manualReplay.intentKeyDigest` | `SHA-256_HEX` |',
      '| `delivery.manualReplay.intentKeyDigest` | `RANDOM_UUID` |',
    );
    assert.ok(mentions(failures, 'delivery.manualReplay.intentKeyDigest'));
  });

  it('catches a token carried in a query parameter', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `secure_link.queryOrPathCarrier` | `FORBIDDEN` |',
      '| `secure_link.queryOrPathCarrier` | `ALLOWED` |',
    );
    assert.ok(mentions(failures, 'secure_link.queryOrPathCarrier'));
  });

  it('catches a fragment stripped after analytics', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `secure_link.fragmentStripOrdering` | `BEFORE_ANY_ANALYTICS_OR_THIRD_PARTY` |',
      '| `secure_link.fragmentStripOrdering` | `BEST_EFFORT` |',
    );
    assert.ok(mentions(failures, 'secure_link.fragmentStripOrdering'));
  });
});

describe('APP4-G01 — keys, peppers and the envelope', () => {
  it('catches a weakened AEAD construction', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `envelope.algorithm` | `AES-256-GCM` |',
      '| `envelope.algorithm` | `AES-256-CBC` |',
    );
    assert.ok(mentions(failures, 'envelope.algorithm'));
  });

  it('catches an envelope key that gains a fallback', () => {
    const failures = failuresAfterEdit(
      'adr',
      '| `envelope.key.whenAbsent` | `FAIL_CLOSED` |',
      '| `envelope.key.whenAbsent` | `GENERATE_EPHEMERAL` |',
    );
    assert.ok(mentions(failures, 'envelope.key.whenAbsent'));
  });

  it('catches a pepper declared with a value', () => {
    const failures = failuresAfterEdit(
      'envExample',
      'VERIFICATION_CODE_SECRET_PEPPER=\n',
      'VERIFICATION_CODE_SECRET_PEPPER=devpepper\n',
    );
    assert.ok(mentions(failures, 'must be declared with no value'));
  });

  it('catches a missing envelope key declaration', () => {
    const failures = failuresAfterEdit('envExample', 'NOTIFICATION_DELIVERY_ENVELOPE_KEY=\n', '');
    assert.ok(mentions(failures, 'NOTIFICATION_DELIVERY_ENVELOPE_KEY is declared 0 time(s)'));
  });

  it('catches an envelope key that aliases a pepper', () => {
    const failures = failuresAfterEdit(
      'envExample',
      'NOTIFICATION_DELIVERY_ENVELOPE_KEY=\n',
      'NOTIFICATION_DELIVERY_ENVELOPE_KEY=${VERIFICATION_CODE_SECRET_PEPPER}\n',
    );
    assert.ok(mentions(failures, 'must not alias'));
  });

  it('catches the shared package being created before APP4-B01', () => {
    const root = rootWith();
    mkdirSync(join(root, 'packages/notification-delivery/src'), { recursive: true });
    writeFileSync(join(root, 'packages/notification-delivery/package.json'), '{}', 'utf8');
    assert.ok(mentions(checkApp4G01(root), 'APP4-B01 creates it'));
  });

  it('catches a notification provider or crypto library entering a manifest', () => {
    const manifest = readFileSync(join(REPO_ROOT, CANONICAL_FILES.apiManifest), 'utf8');
    const failures = checkApp4G01(
      rootWith({
        [CANONICAL_FILES.apiManifest]: manifest.replace(
          '"dependencies": {',
          '"dependencies": {\n    "nodemailer": "^7.0.0",',
        ),
      }),
    );
    assert.ok(mentions(failures, 'nodemailer'));
  });
});

describe('APP4-G01 — the negations', () => {
  it('catches the outbox guard being extended early', () => {
    const store = readFileSync(join(REPO_ROOT, CANONICAL_FILES.outboxStore), 'utf8');
    const failures = checkApp4G01(
      rootWith({
        [CANONICAL_FILES.outboxStore]: store.replace(
          "  'PRODUCT',",
          "  'PRODUCT',\n  'NOTIFICATION_INTENT',",
        ),
      }),
    );
    assert.ok(mentions(failures, "that extension is APP4-B01's"));
  });

  it('catches the aggregate-kind guard disappearing altogether', () => {
    const failures = checkApp4G01(rootWith({ [CANONICAL_FILES.outboxStore]: '// emptied\n' }));
    assert.ok(mentions(failures, 'write guard is gone'));
  });

  it('catches a production caller of the superseded claim path', () => {
    const root = rootWith();
    const smuggled = join(
      root,
      'apps/api/src/modules/notification/application/delivery.service.ts',
    );
    mkdirSync(dirname(smuggled), { recursive: true });
    writeFileSync(smuggled, 'export const run = () => intents.claimBatch(10);\n', 'utf8');
    const failures = checkApp4G01(root);
    assert.ok(mentions(failures, 'the APP2 outbox runtime is the only queue'));
    assert.ok(mentions(failures, 'implements no runtime feature'));
  });

  it('keeps the checker honest about absence — a spec caller is not a production caller', () => {
    const root = rootWith();
    const spec = join(root, 'apps/api/src/modules/notification/probe.spec.ts');
    writeFileSync(spec, 'it("claims", () => intents.claimBatch(1));\n', 'utf8');
    assert.deepEqual(checkApp4G01(root), []);
  });
});

describe('APP4-G01 — the decision row', () => {
  it('catches a decision that is no longer LOCKED', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = checkApp4G01(
      rootWith({
        [CANONICAL_FILES.register]: registerText.replace(
          row,
          row.replace(/\| LOCKED \|$/, '| PROPOSED |'),
        ),
      }),
    );
    assert.ok(mentions(failures, 'is not LOCKED'));
  });

  // The anchor is deliberately the whole ruling title: `**(PO-08)` alone also
  // appears in the IMP-D048 row, and a first-match replace would edit that one
  // instead — a mutation test that mutates the wrong row proves nothing.
  it('catches a dropped ruling', () => {
    const failures = failuresAfterEdit(
      'register',
      '**(PO-08) `originNotificationIntentId` is lineage-only**',
      '**(dropped)**',
    );
    assert.ok(mentions(failures, 'does not record ruling PO-08'));
  });

  it('catches a duplicated decision row', () => {
    const row = registerText.split('\n').find((line) => line.startsWith(`| ${DECISION_ID} |`));
    const failures = checkApp4G01(
      rootWith({ [CANONICAL_FILES.register]: registerText.replace(row, `${row}\n${row}`) }),
    );
    assert.ok(mentions(failures, 'appears 2 time(s)'));
  });
});

describe('APP4-G01 — the literal-secret scan', () => {
  it('does not mistake a path or an identifier for key material', () => {
    for (const safe of [
      'docs/adr/backend/ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md',
      '| `verification.challenge.maxIssuesPerTargetPerWindow` | `5` |',
      'app4-manual-replay:v1:<originNotificationIntentId>:<deadLetterOutboxEventId>',
      '`packages/database/seed/app4-policy-configuration.seed.json`',
      'commit `445a936b10dd49f2a77c5ef46b84b1fad66d19dd`',
    ]) {
      assert.deepEqual(findLiteralSecrets(safe), [], safe.slice(0, 60));
    }
  });

  it('catches an illustrative base64 key', () => {
    const findings = findLiteralSecrets(
      'example key: 3Xk9pQr2Lm7VtZa4Bd8CfHj1NoPqRsTuVwXyZ0aB1cD=',
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'base64-shaped literal');
  });

  it('catches a specimen verification code', () => {
    const findings = findLiteralSecrets('the code is 483920 for this example');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'six-digit code literal');
  });

  it('fails the gate when the ADR grows one', () => {
    const failures = failuresAfterEdit(
      'adr',
      '## Consequences',
      '## Consequences\n\nExample code: 483920.\n',
    );
    assert.ok(mentions(failures, 'six-digit code literal'));
  });
});

describe('APP4-G01 — the governance record', () => {
  it('catches a roadmap that no longer records the decision', () => {
    const roadmap = readFileSync(join(REPO_ROOT, CANONICAL_FILES.roadmap), 'utf8');
    const failures = checkApp4G01(
      rootWith({ [CANONICAL_FILES.roadmap]: roadmap.split(DECISION_ID).join('IMP-DXXX') }),
    );
    assert.ok(mentions(failures, 'does not record the checkpoint and its decision'));
  });

  it('catches a command index missing the gate test', () => {
    const index = readFileSync(join(REPO_ROOT, CANONICAL_FILES.commandIndex), 'utf8');
    const failures = checkApp4G01(
      rootWith({
        [CANONICAL_FILES.commandIndex]: index.split('CMD-TEST-APP4-G01').join('CMD-TEST-REMOVED'),
      }),
    );
    assert.ok(mentions(failures, 'CMD-TEST-APP4-G01'));
  });

  it('catches an ADR that stops stating a locked route', () => {
    const failures = checkApp4G01(
      rootWith({ [CANONICAL_FILES.adr]: adrText.split('/truy-cap').join('/secure') }),
    );
    assert.ok(mentions(failures, 'does not state the route /truy-cap'));
  });
});
