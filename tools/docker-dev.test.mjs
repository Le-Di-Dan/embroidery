/**
 * Verification for tools/docker-dev.mjs argument construction.
 * Run from the repository root:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComposeArgs, parseWrapperArgs } from './docker-dev.mjs';

const BASE_FILE = 'infrastructure/compose/docker-compose.dev.yml';
const DEBUG_FILE = 'infrastructure/compose/docker-compose.debug.yml';
const ENV_FILE = '.env';

test('places global flags before the subcommand in the required order', () => {
  const args = buildComposeArgs({
    composeFiles: [BASE_FILE],
    envFile: ENV_FILE,
    profile: 'quality',
    commandArgs: ['up', '-d'],
  });
  assert.deepEqual(args, [
    'compose',
    '--env-file',
    ENV_FILE,
    '-f',
    BASE_FILE,
    '--profile',
    'quality',
    'up',
    '-d',
  ]);
});

test('applies the debug overlay after the base file so it merges on top', () => {
  const args = buildComposeArgs({
    composeFiles: [BASE_FILE, DEBUG_FILE],
    envFile: undefined,
    profile: undefined,
    commandArgs: ['up', '-d'],
  });
  assert.deepEqual(args, ['compose', '-f', BASE_FILE, '-f', DEBUG_FILE, 'up', '-d']);
});

test('omits --env-file when no .env exists', () => {
  const args = buildComposeArgs({
    composeFiles: [BASE_FILE],
    envFile: undefined,
    profile: undefined,
    commandArgs: ['config'],
  });
  assert.deepEqual(args, ['compose', '-f', BASE_FILE, 'config']);
});

test('omits --profile for the default stack', () => {
  const args = buildComposeArgs({
    composeFiles: [BASE_FILE],
    envFile: ENV_FILE,
    profile: undefined,
    commandArgs: ['down'],
  });
  assert.equal(args.includes('--profile'), false);
  assert.equal(args.at(-1), 'down');
});

test('passes extra compose arguments through unchanged', () => {
  const args = buildComposeArgs({
    composeFiles: [BASE_FILE],
    envFile: undefined,
    profile: undefined,
    commandArgs: ['logs', '--tail', '100', 'api'],
  });
  assert.deepEqual(args.slice(-4), ['logs', '--tail', '100', 'api']);
});

test('parseWrapperArgs extracts wrapper flags from any position', () => {
  assert.deepEqual(parseWrapperArgs(['--quality', 'up', '-d']), {
    quality: true,
    debug: false,
    commandArgs: ['up', '-d'],
  });
  assert.deepEqual(parseWrapperArgs(['--debug', 'up', '-d']), {
    quality: false,
    debug: true,
    commandArgs: ['up', '-d'],
  });
  assert.deepEqual(parseWrapperArgs(['down', '--debug', '--quality']), {
    quality: true,
    debug: true,
    commandArgs: ['down'],
  });
  assert.deepEqual(parseWrapperArgs(['ps']), { quality: false, debug: false, commandArgs: ['ps'] });
});
