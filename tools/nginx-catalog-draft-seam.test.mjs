/**
 * Gateway guarantees for the Admin product routes (APP2-B02 §20).
 *
 * B02 adds **no** special gateway configuration: the five product operations
 * are ordinary JSON requests and must ride the existing `/api/` proxy. These
 * tests enforce that absence, which is exactly the kind of thing that decays
 * silently — a well-meaning `location = /api/admin/products` added later would
 * quietly acquire its own timeouts and body limits.
 *
 * Deterministic and Docker-free: pure file inspection. Run:
 *   node --test tools/nginx-catalog-draft-seam.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NGINX_DIR = join(REPO_ROOT, 'infrastructure', 'nginx');
const TEMPLATES_DIR = join(NGINX_DIR, 'templates');

/** Every gateway template, including the e2e variant. */
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

test('no gateway location is added for the Admin product routes', () => {
  for (const { name, source } of templates) {
    assert.equal(
      /location\s*=?\s*[^\n]*\/api\/admin\/products/.test(source),
      false,
      `${name} declares a product-specific location; B02 must use the generic /api/ proxy`,
    );
  }
});

test('the streaming upload seam still applies to exactly one location', () => {
  const dev = templates.find((entry) => entry.name === 'development.conf.template');
  assert.ok(dev, 'development template is missing');
  const uploadIncludes = dev.source.match(/include [^\n]*upload-proxy\.conf;/g) ?? [];
  assert.equal(
    uploadIncludes.length,
    1,
    'the upload streaming include must stay on exactly one location',
  );
  assert.match(dev.source, /location = \/api\/admin\/assets\/upload/);
});

test('the Admin host proxies /api/ to the API and preserves the request id', () => {
  const dev = templates.find((entry) => entry.name === 'development.conf.template');
  const adminBlock = dev.source.slice(dev.source.indexOf('server_name ${ADMIN_HOST}'));
  assert.match(adminBlock, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/api_upstream;/);
  assert.match(adminBlock, /add_header X-Request-ID \$effective_request_id always;/);
});

/**
 * Recorded fact, not an aspiration: the Storefront host also proxies `/api/`,
 * so an Admin product URL is *reachable* there. The control that matters is the
 * session cookie, which is host-only — a Storefront page never carries it, and
 * the API answers 401. Asserting "the Storefront cannot reach the path" would
 * be asserting something the gateway does not actually do.
 */
test('Storefront access to Admin routes is denied by the session, not by the gateway', () => {
  const dev = templates.find((entry) => entry.name === 'development.conf.template');
  const storefrontStart = dev.source.indexOf('server_name ${STOREFRONT_HOST}');
  const storefrontBlock = dev.source.slice(
    storefrontStart,
    dev.source.indexOf('server_name ${ADMIN_HOST}'),
  );
  assert.match(storefrontBlock, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/api_upstream;/);

  // The cookie contract that makes that safe is host-only (ADR-APP1-001 §5).
  const cookieSource = readFileSync(
    join(REPO_ROOT, 'apps', 'admin', 'src', 'config', 'session-cookie.ts'),
    'utf8',
  );
  assert.match(cookieSource, /__Host-adm_session/);
});

test('the gateway exposes no object storage', () => {
  for (const { name, source } of templates) {
    for (const forbidden of ['minio', '9000', 'originals', 'derivatives']) {
      assert.equal(
        source.toLowerCase().includes(forbidden),
        false,
        `${name} references ${forbidden}; the gateway must never expose object storage`,
      );
    }
  }
});

test('the gateway adds no public catalog route', () => {
  for (const { name, source } of templates) {
    assert.equal(
      /location[^\n]*\/api\/public\//.test(source),
      false,
      `${name} declares a public catalog location; B04 owns that, not B02`,
    );
  }
});
