/**
 * Regression tests for the secret-disclosure gate.
 *
 * The fixtures are synthetic. A test that pastes the real disclosed credential
 * to prove the checker finds it would republish the credential into the
 * repository — the exact failure the checker exists to prevent — so the shape is
 * reproduced and the value is not.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  findSecretDisclosures,
  findTrackedSecretFiles,
  looksLikeSecretValue,
} from './check-report-secrets.mjs';

/** Stands in for a real credential: same shape, never a real value. */
const SYNTHETIC = 'ExampleSyntheticSecret123!';

const DISCLOSURES = [
  `The development Admin password is ${SYNTHETIC}`,
  `password: ${SYNTHETIC}`,
  `credential = ${SYNTHETIC}`,
  `token is ${SYNTHETIC}`,
  `secret was changed to ${SYNTHETIC}`,
  `The dev admin password is now \`${SYNTHETIC}\`; re-run the login to verify.`,
  `mật khẩu là ${SYNTHETIC}`,
  `The api-key is ${SYNTHETIC}`,
];

const SAFE_PROSE = [
  'The password was rotated through the sanctioned bootstrap path.',
  'Credential value is intentionally redacted.',
  'The token is not persisted and never reaches the browser.',
  'The password is [REDACTED].',
  'The password is <redacted>.',
  'Its value is intentionally not recorded.',
  'Cookies and session tokens are never logged.',
  'The domain code is PRODUCT_VERSION_CONFLICT and the token is expectedUpdatedAt.',
  'The required variable is STAFF_BOOTSTRAP_PASSWORD; only names are ever listed.',
  'The relevant ADR is ADR-APP1-001 and the record timestamp is 2026-07-28T09:16:00.000Z.',
  'The asset id is 019fa4a1-e43b-735d-a668-6a93eb5ff7b4 and the checksum is not shown.',
];

test('rejects every plaintext disclosure shape', () => {
  for (const line of DISCLOSURES) {
    assert.equal(findSecretDisclosures(line).length, 1, `should reject: ${line}`);
  }
});

test('accepts ordinary security prose and explicit redaction', () => {
  for (const line of SAFE_PROSE) {
    assert.equal(findSecretDisclosures(line).length, 0, `should accept: ${line}`);
  }
});

test('a redacted equivalent of a rejected sentence passes', () => {
  const disclosed = `The development Admin password is ${SYNTHETIC}`;
  const redacted = 'The development Admin password is [REDACTED]';
  assert.equal(findSecretDisclosures(disclosed).length, 1);
  assert.equal(findSecretDisclosures(redacted).length, 0);
});

test('reports the line but never the matched value', () => {
  const content = ['# Report', '', `password: ${SYNTHETIC}`].join('\n');
  const findings = findSecretDisclosures(content);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
  assert.deepEqual(Object.keys(findings[0]).sort(), ['keyword', 'line']);
  assert.ok(!JSON.stringify(findings).includes(SYNTHETIC));
});

test('catches a disclosure in any completion report, not just the A03 one', () => {
  const other = [
    '# APP9-Z99 completion report',
    '',
    '## Evidence',
    `The operator credential was changed to ${SYNTHETIC} for the run.`,
  ].join('\n');
  assert.equal(findSecretDisclosures(other).length, 1);
});

test('the sanitized A03 completion report passes', () => {
  const report = readFileSync('docs/implementation/reports/APP2-A03-COMPLETION-REPORT.md', 'utf8');
  assert.deepEqual(findSecretDisclosures(report), []);
});

test('every tracked document in the repository passes', () => {
  // A gate nobody can satisfy gets disabled. This proves the rule is livable
  // against the real corpus, not just against its own fixtures.
  const files = execFileSync('git', ['ls-files', '-z', 'docs'], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file.endsWith('.md'));
  assert.ok(files.length > 100, 'expected a substantial document corpus');
  for (const file of files) {
    assert.deepEqual(findSecretDisclosures(readFileSync(file, 'utf8')), [], `clean: ${file}`);
  }
});

test('distinguishes secret-shaped values from identifiers', () => {
  for (const value of [SYNTHETIC, 'Aa1!abcdefgh', 'Synthetic0Example']) {
    assert.equal(looksLikeSecretValue(value), true, `secret-shaped: ${value}`);
  }
  for (const value of [
    'PRODUCT_VERSION_CONFLICT',
    'expectedUpdatedAt',
    'ADR-APP1-001',
    'STAFF_BOOTSTRAP_PASSWORD',
    '019fa4a1-e43b-735d-a668-6a93eb5ff7b4',
    'short1A',
  ]) {
    assert.equal(looksLikeSecretValue(value), false, `identifier: ${value}`);
  }
});

test('a quoted schema is code, not a credential', () => {
  // `APP12-H01` / `FU-APP12-S03-08`. Reports quote the delivered Zod shape of a
  // token field, and the value that follows the word `token` is then a call
  // expression. Both inherited findings were exactly this.
  for (const value of [
    'z.string().regex(/^[A-Za-z0-9_-]{43}$/)',
    'z.object({token:z.string()}).strict()',
  ]) {
    assert.equal(looksLikeSecretValue(value), false, `schema/code: ${value}`);
  }

  // The exemption must stay narrow: a credential that merely *ends* in a
  // parenthesis, or contains one without a preceding identifier, is still a
  // credential.
  for (const value of ['Aa1!abcdefgh(', '(Synthetic0Example', 'Aa1!secret(x)']) {
    assert.equal(looksLikeSecretValue(value), true, `still secret-shaped: ${value}`);
  }
});

test('rejects tracked secret-bearing files but allows the example env', () => {
  assert.deepEqual(
    findTrackedSecretFiles([
      '.env',
      '.env.local',
      'apps/api/.env.production',
      'infra/tls/server.pem',
      'infra/tls/server.key',
      '.env.example',
      'docs/README.md',
      'apps/api/src/env.ts',
    ]),
    [
      '.env',
      '.env.local',
      'apps/api/.env.production',
      'infra/tls/server.pem',
      'infra/tls/server.key',
    ],
  );
});
