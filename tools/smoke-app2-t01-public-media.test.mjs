/**
 * Docker-free orchestration tests for the `APP2-T01` gateway smoke (§20).
 *
 * The smoke itself needs a running stack, so it cannot run in `pnpm quality`.
 * Its decision logic can, and must: the part that decides *what to restore* is
 * the part whose failure would leave a development product stuck in the wrong
 * lifecycle state long after the run ended.
 *
 * Run: node --test tools/smoke-app2-t01-public-media.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GATEWAY_ADMIN_HOST,
  GATEWAY_STOREFRONT_HOST,
  isWebp,
  mediaPath,
  restorePlan,
} from './smoke-app2-t01-public-media.mjs';

test('the media path matches the locked public route', () => {
  assert.equal(
    mediaPath('thu-bong-gau-nau', '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071', 'thumbnail'),
    '/api/public/products/thu-bong-gau-nau/media/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071/thumbnail',
  );
});

test('the smoke targets both configured gateway hosts', () => {
  assert.equal(GATEWAY_STOREFRONT_HOST, 'embroidery.local');
  assert.equal(GATEWAY_ADMIN_HOST, 'admin.embroidery.local');
});

test('a real WebP container is recognised', () => {
  const webp = Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 ', 'latin1'),
    Buffer.alloc(16),
  ]);
  assert.equal(isWebp(webp), true);
});

test('a JSON body or a PNG is not mistaken for a WebP', () => {
  assert.equal(isWebp(Buffer.from('{"success":false}', 'utf8')), false);
  assert.equal(
    isWebp(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0])),
    false,
  );
  // A RIFF container that is not WebP (a WAV, say) must not pass either.
  const riffWave = Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from('WAVEfmt ', 'latin1'),
  ]);
  assert.equal(isWebp(riffWave), false);
});

test('an empty or truncated body is not a WebP', () => {
  assert.equal(isWebp(Buffer.alloc(0)), false);
  assert.equal(isWebp(Buffer.from('RIFF', 'latin1')), false);
});

test('the restore plan puts the product back to its exact entry status', () => {
  assert.deepEqual(restorePlan({ productId: 'p-1', originalStatus: 'DRAFT' }), [
    { step: 'restore-product-status', productId: 'p-1', status: 'DRAFT' },
  ]);
  // An ARCHIVED product must be restored to ARCHIVED, never normalised to DRAFT.
  assert.deepEqual(restorePlan({ productId: 'p-2', originalStatus: 'ARCHIVED' }), [
    { step: 'restore-product-status', productId: 'p-2', status: 'ARCHIVED' },
  ]);
});

test('nothing is restored when the smoke failed before it published', () => {
  // The `finally` block runs on every path, including a failure during the
  // read-only probes — it must not invent an update for a product it never
  // touched.
  assert.deepEqual(restorePlan({}), []);
  assert.deepEqual(restorePlan({ productId: 'p-1' }), []);
  assert.deepEqual(restorePlan({ originalStatus: 'DRAFT' }), []);
});
