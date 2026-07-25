/**
 * Focused unit tests for the pure helpers of the APP1-A01-C2 bootstrap smoke
 * harness: command construction, secret redaction, result parsing, env-file
 * rendering, cleanup args. The live Docker orchestration is exercised by the
 * harness itself (real Compose runs), not here. Run: node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupArgs,
  composeArgs,
  envFileContent,
  parseBootstrapResult,
  redactSecrets,
  uniqueProjectName,
} from './smoke-app1-bootstrap-compose.mjs';

test('uniqueProjectName is deterministic and namespaced for a given seed', () => {
  assert.equal(uniqueProjectName('devfail', 'abc123'), 'embroidery-a01c2-devfail-abc123');
  assert.match(uniqueProjectName('x', 'y'), /^embroidery-a01c2-/);
});

test('composeArgs threads the env file and every compose file', () => {
  const args = composeArgs(['/a/dev.yml', '/a/smoke.yml'], '/tmp/e.env');
  assert.deepEqual(args, [
    'compose',
    '--env-file',
    '/tmp/e.env',
    '-f',
    '/a/dev.yml',
    '-f',
    '/a/smoke.yml',
  ]);
});

test('cleanupArgs removes containers, networks and the isolated volume', () => {
  const args = cleanupArgs(['/a/dev.yml'], '/tmp/e.env');
  assert.deepEqual(args.slice(-3), ['down', '--volumes', '--remove-orphans']);
  assert.ok(args.includes('--env-file'));
});

test('parseBootstrapResult extracts the closed status set, else null', () => {
  assert.equal(parseBootstrapResult('foo result=CREATED admin=x'), 'CREATED');
  assert.equal(
    parseBootstrapResult('result=FAILED_MISSING_ENV_DEVELOPMENT missing …'),
    'FAILED_MISSING_ENV_DEVELOPMENT',
  );
  assert.equal(parseBootstrapResult('no marker here'), null);
});

test('redactSecrets masks every provided secret and ignores empty ones', () => {
  const out = redactSecrets('login pw=Smoke-abc123 and again Smoke-abc123', ['Smoke-abc123', '']);
  assert.equal(out, 'login pw=<redacted> and again <redacted>');
  assert.ok(!out.includes('Smoke-abc123'));
});

test('envFileContent renders deterministic key=value lines with blanks for absent', () => {
  const content = envFileContent({ A: '1', B: '', C: undefined });
  assert.equal(content, 'A=1\nB=\nC=');
});
