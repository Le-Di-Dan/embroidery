/**
 * Static guarantees for the APP2-I01 Nginx upload seam (§12).
 *
 * The seam ships one directive (`proxy_request_buffering off`) that must NOT
 * take effect until APP2-B01 builds the upload route. These tests are the
 * enforcement: they fail if the seam is wired in early, made global, attached
 * to an existing route, or given an invented byte limit.
 *
 * Deterministic and Docker-free — pure file inspection. Run:
 *   node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NGINX_DIR = join(REPO_ROOT, 'infrastructure', 'nginx');
const TEMPLATES_DIR = join(NGINX_DIR, 'templates');
const INCLUDES_DIR = join(TEMPLATES_DIR, 'includes');
const SEAM_NAME = 'upload-proxy.conf.template';
const SEAM_PATH = join(INCLUDES_DIR, SEAM_NAME);

const seam = readFileSync(SEAM_PATH, 'utf8');

/** Directive lines only — the seam is mostly explanatory comments. */
function activeDirectives(source) {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Every template in the gateway config tree, including the e2e variant. */
function allTemplates() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.template') || entry.name.endsWith('.conf')) {
        found.push({ name: entry.name, path, source: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(NGINX_DIR);
  return found;
}

test('the seam carries proxy_request_buffering off', () => {
  assert.ok(
    activeDirectives(seam).includes('proxy_request_buffering off;'),
    'the seam must contain the streaming directive it exists to carry',
  );
});

test('the seam is inert: no other config includes or references it', () => {
  const referencing = allTemplates()
    .filter(({ name }) => name !== SEAM_NAME)
    .filter(({ source }) => source.includes('upload-proxy'));

  assert.deepEqual(
    referencing.map(({ path }) => path),
    [],
    'the upload seam must stay unreferenced until APP2-B01 builds the upload route',
  );
});

test('the seam lives under includes/, which nginx.conf never auto-loads', () => {
  // nginx.conf includes conf.d/*.conf — a single level. A file rendered into
  // conf.d/includes/ is therefore loaded only by an explicit `include`.
  const mainConf = readFileSync(join(NGINX_DIR, 'nginx.conf'), 'utf8');

  assert.ok(mainConf.includes('include /etc/nginx/conf.d/*.conf;'));
  assert.ok(
    !/include\s+\/etc\/nginx\/conf\.d\/\*\*/.test(mainConf),
    'a recursive include glob would auto-activate every seam under includes/',
  );
  assert.ok(readdirSync(INCLUDES_DIR).includes(SEAM_NAME));
});

test('the seam declares no server, location or upstream block', () => {
  // An include is spliced into a location; a block here would make it global
  // or invent a route.
  for (const directive of ['server ', 'location ', 'upstream ', 'http ']) {
    assert.ok(
      !activeDirectives(seam).some((line) => line.startsWith(directive)),
      `the seam must not open a ${directive.trim()} block`,
    );
  }
});

test('the seam invents no upload byte limit or timeout', () => {
  // Maximum image bytes is an open Product Owner parameter (§4). A value here
  // would silently become the product limit.
  for (const directive of ['client_max_body_size', 'proxy_read_timeout', 'proxy_send_timeout']) {
    assert.ok(
      !activeDirectives(seam).some((line) => line.startsWith(directive)),
      `${directive} must stay an unset ownership hook until APP2-B01`,
    );
  }
});

test('the seam carries exactly one active directive', () => {
  assert.deepEqual(activeDirectives(seam), ['proxy_request_buffering off;']);
});

test('request buffering stays enabled on every currently routed location', () => {
  const active = allTemplates().filter(({ name }) => name !== SEAM_NAME);

  for (const { path, source } of active) {
    assert.ok(
      !source.includes('proxy_request_buffering'),
      `${path} must not disable request buffering: streaming is opt-in per route`,
    );
  }
});
