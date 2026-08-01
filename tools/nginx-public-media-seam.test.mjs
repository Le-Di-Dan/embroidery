/**
 * Gateway guarantees for the public catalog-media route (`APP2-T01` §19).
 *
 * T01 adds **no** gateway configuration. The binary route rides the existing
 * generic `/api/` proxy, and these tests enforce that absence — the kind of
 * thing that decays silently, because a later `location /api/public/products`
 * added "just to tune image caching" would quietly acquire its own buffering,
 * timeouts and headers, and could re-introduce a cache that outlives an
 * unpublish.
 *
 * Deterministic and Docker-free: pure file inspection. Run:
 *   node --test tools/nginx-public-media-seam.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NGINX_DIR = join(REPO_ROOT, 'infrastructure', 'nginx');
const TEMPLATES_DIR = join(NGINX_DIR, 'templates');

function allTemplates() {
  const files = [];
  for (const entry of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.template')) {
      files.push({
        name: entry.name,
        source: readFileSync(join(TEMPLATES_DIR, entry.name), 'utf8'),
      });
    }
  }
  const e2eDir = join(NGINX_DIR, 'e2e');
  for (const entry of readdirSync(e2eDir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && (entry.name.endsWith('.template') || entry.name.endsWith('.conf'))) {
      const full = join(entry.parentPath ?? e2eDir, entry.name);
      files.push({ name: `e2e/${entry.name}`, source: readFileSync(full, 'utf8') });
    }
  }
  assert.ok(files.length > 0, 'expected at least one gateway template');
  return files;
}

const templates = allTemplates();

test('no gateway location is added for the public media route', () => {
  for (const { name, source } of templates) {
    assert.equal(
      /location\s*=?\s*[^\n]*\/api\/public/.test(source),
      false,
      `${name} declares a public-media location; T01 must use the generic /api/ proxy`,
    );
  }
});

test('every template still proxies /api/ generically', () => {
  for (const { name, source } of templates) {
    assert.ok(
      /location\s+\/api\/\s*\{/.test(source),
      `${name} has no generic /api/ location for the media route to ride`,
    );
  }
});

test('the gateway never exposes the object store', () => {
  for (const { name, source } of templates) {
    assert.equal(
      /minio|:9000/i.test(source),
      false,
      `${name} references the object store; buckets are private and application-proxied only`,
    );
  }
});

test('no gateway-level cache is declared that could outlive an unpublish', () => {
  for (const { name, source } of templates) {
    // A gateway cache would answer without re-checking publication — precisely
    // the invariant the route's `no-store` protects. `proxy_cache off;` is the
    // directive that *guarantees* it, so the assertion is that no cache zone is
    // defined and no `proxy_cache` names one.
    assert.equal(
      /proxy_cache_path/.test(source),
      false,
      `${name} defines a proxy cache zone; publication must be re-checked per request`,
    );
    for (const directive of source.match(/proxy_cache\s+[^\n;]+;/g) ?? []) {
      assert.match(
        directive,
        /proxy_cache\s+off\s*;/,
        `${name} enables a proxy cache (${directive.trim()}); it must stay off`,
      );
    }
    assert.equal(
      /expires\s+\d/.test(source),
      false,
      `${name} declares an expiry that could override the route's no-store`,
    );
  }
});

test('the streaming upload seam is still the only route-scoped include', () => {
  const dev = templates.find((entry) => entry.name === 'development.conf.template');
  assert.ok(dev, 'development template is missing');
  const uploadIncludes = dev.source.match(/include [^\n]*upload-proxy\.conf;/g) ?? [];
  assert.equal(
    uploadIncludes.length,
    1,
    'the upload seam must stay scoped to exactly one location; T01 adds none',
  );
});
