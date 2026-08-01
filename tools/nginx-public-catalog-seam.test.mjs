/**
 * Gateway guarantees for the public catalog queries (`APP2-B04` §22).
 *
 * B04 adds **no** gateway configuration. Both JSON operations ride the existing
 * generic `/api/` proxy, and these tests enforce that absence. The failure they
 * exist to prevent is specific: a later `location /api/public/products` added
 * "just to cache the catalogue" would acquire its own headers and could serve a
 * product that has since been unpublished — defeating the one correctness
 * property the whole checkpoint rests on, without touching a line of API code.
 *
 * Deterministic and Docker-free: pure file inspection. Run:
 *   node --test tools/nginx-public-catalog-seam.test.mjs
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

test('no gateway location is dedicated to the public catalog', () => {
  for (const { name, source } of templates) {
    const locations = [...source.matchAll(/^\s*location\s+([^{]+)\{/gm)].map((m) => m[1].trim());
    for (const location of locations) {
      assert.ok(
        !/public\/products/.test(location),
        `${name}: ${location} — the catalog must ride the generic /api/ proxy`,
      );
    }
  }
});

test('the public catalog is reachable through the generic /api/ proxy', () => {
  const development = templates.find((file) => file.name === 'development.conf.template');
  assert.ok(development, 'expected the development gateway template');
  // Both public hosts proxy /api/ to the API upstream; that is the whole route.
  const apiLocations = [...development.source.matchAll(/location\s+\/api\/\s*\{/g)];
  assert.ok(apiLocations.length >= 2, 'expected /api/ on both the storefront and admin hosts');
  assert.match(development.source, /upstream api_upstream \{\s*server api:4000;/);
});

test('the gateway caches no proxied response', () => {
  for (const { name, source } of templates) {
    // A cache zone must not exist at all...
    assert.ok(!/proxy_cache_path/.test(source), `${name}: defines a proxy cache zone`);
    // ...and any proxy_cache directive present must disable caching. Asserting
    // the directive is absent would fail on `proxy_cache off;`, which is the
    // line that *guarantees* the property.
    for (const [, value] of source.matchAll(/^\s*proxy_cache\s+([^;]+);/gm)) {
      assert.equal(value.trim(), 'off', `${name}: proxy_cache must be off`);
    }
  }
});

test('no gateway rule rewrites or aliases a Storefront product route', () => {
  // `/san-pham/<slug>` is an unresolved proposal. B04 must not make it real,
  // and the gateway is the other place it could be quietly locked in.
  for (const { name, source } of templates) {
    assert.ok(!/san-pham/.test(source), `${name}: must not bind a Storefront product route`);
  }
});

test('object storage is never proxied', () => {
  for (const { name, source } of templates) {
    assert.ok(!/minio/i.test(source), `${name}: must not reference the object store`);
    assert.ok(!/:9000/.test(source), `${name}: must not proxy the object-store port`);
  }
});

test('the upload seam stays attached to exactly one route', () => {
  const development = templates.find((file) => file.name === 'development.conf.template');
  const includes = [...development.source.matchAll(/include[^;]*upload-proxy\.conf;/g)];
  assert.equal(includes.length, 1, 'the streaming upload seam must not widen to the catalog');
  assert.match(development.source, /location = \/api\/admin\/assets\/upload/);
});
