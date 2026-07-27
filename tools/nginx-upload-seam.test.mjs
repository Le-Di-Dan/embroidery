/**
 * Static guarantees for the Nginx upload route (APP2-I01 §12, APP2-B01 §21).
 *
 * The seam was inert until B01 built the upload route, and these tests were the
 * enforcement of that. B01 has now activated it, so they enforce the opposite
 * property with the same rigour: the streaming behaviour and the larger limits
 * apply to **exactly one** location and leak nowhere else.
 *
 * Deterministic and Docker-free — pure file inspection, so the timing values
 * are asserted without a five-minute wall-clock test. Run:
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

/** The one path allowed to carry the streaming/upload configuration. */
const UPLOAD_LOCATION = 'location = /api/admin/assets/upload';

/** Approved values (APP2-B01-G01 §C). Asserted literally, not by pattern. */
const APPROVED = {
  maxBodySize: '27m',
  proxyTimeout: '360s',
  globalMaxBodySize: '20m',
  globalTimeout: '60s',
};

const seam = readFileSync(SEAM_PATH, 'utf8');
const devTemplate = readFileSync(join(TEMPLATES_DIR, 'development.conf.template'), 'utf8');
const envExample = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8');

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

/** The body of one `location` block, for scoped assertions. */
function locationBlock(source, header) {
  const start = source.indexOf(header);
  assert.notEqual(start, -1, `expected a ${header} block`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }
  throw new Error(`unterminated ${header} block`);
}

test('the seam carries the four route-scoped upload directives', () => {
  assert.deepEqual(activeDirectives(seam), [
    'proxy_request_buffering off;',
    'client_max_body_size ${GATEWAY_UPLOAD_MAX_BODY_SIZE};',
    'proxy_read_timeout ${GATEWAY_UPLOAD_PROXY_TIMEOUT};',
    'proxy_send_timeout ${GATEWAY_UPLOAD_PROXY_TIMEOUT};',
  ]);
});

test('the seam sources every value from the environment, inventing no literal', () => {
  // A hard-coded number here would become a second source of truth for a
  // Product-Owner-approved value.
  for (const line of activeDirectives(seam)) {
    if (line.startsWith('proxy_request_buffering')) {
      continue;
    }
    assert.match(line, /\$\{GATEWAY_UPLOAD_[A-Z_]+\}/, `${line} must use a GATEWAY_UPLOAD_* value`);
  }
});

test('the approved values are exactly 27m and 360s', () => {
  assert.match(
    envExample,
    new RegExp(`^GATEWAY_UPLOAD_MAX_BODY_SIZE=${APPROVED.maxBodySize}$`, 'm'),
  );
  assert.match(
    envExample,
    new RegExp(`^GATEWAY_UPLOAD_PROXY_TIMEOUT=${APPROVED.proxyTimeout}$`, 'm'),
  );

  for (const file of ['docker-compose.dev.yml', 'docker-compose.e2e.yml']) {
    const compose = readFileSync(join(REPO_ROOT, 'infrastructure', 'compose', file), 'utf8');
    assert.ok(
      compose.includes(`GATEWAY_UPLOAD_MAX_BODY_SIZE:-${APPROVED.maxBodySize}`),
      `${file} must default the upload ceiling to ${APPROVED.maxBodySize}`,
    );
    assert.ok(
      compose.includes(`GATEWAY_UPLOAD_PROXY_TIMEOUT:-${APPROVED.proxyTimeout}`),
      `${file} must default the upload timeout to ${APPROVED.proxyTimeout}`,
    );
  }
});

test('the upload timeout is strictly greater than the API hard duration', () => {
  // The API stops at 300s. If the gateway gave up first the client would get a
  // bare 504 and the API would never record its own timeout.
  const seconds = Number(APPROVED.proxyTimeout.replace('s', ''));
  assert.ok(seconds > 300, `${APPROVED.proxyTimeout} must exceed the 300s API hard duration`);
});

test('exactly one location includes the seam, and it is the upload route', () => {
  const including = allTemplates()
    .filter(({ name }) => name !== SEAM_NAME)
    .flatMap(({ path, source }) =>
      source
        .split('\n')
        .filter((line) => line.includes('upload-proxy.conf'))
        .map((line) => ({ path, line: line.trim() })),
    );

  assert.equal(including.length, 1, 'the seam must be included exactly once');
  const block = locationBlock(devTemplate, UPLOAD_LOCATION);
  assert.ok(
    block.includes('include /etc/nginx/conf.d/includes/upload-proxy.conf;'),
    'the single include must live in the upload location',
  );
});

test('the upload location is an exact match, so it cannot widen', () => {
  // A prefix `location /api/admin/assets/upload` would also capture
  // `/api/admin/assets/uploads-of-everything`.
  assert.ok(devTemplate.includes(`${UPLOAD_LOCATION} {`));
});

test('the upload location still carries the canonical proxy headers', () => {
  const block = locationBlock(devTemplate, UPLOAD_LOCATION);
  assert.ok(block.includes('include /etc/nginx/conf.d/includes/proxy-headers.conf;'));
  assert.ok(block.includes('proxy_pass http://api_upstream;'));
});

test('global gateway defaults are unchanged', () => {
  assert.ok(devTemplate.includes('client_max_body_size ${GATEWAY_CLIENT_MAX_BODY_SIZE};'));
  assert.match(
    envExample,
    new RegExp(`^GATEWAY_CLIENT_MAX_BODY_SIZE=${APPROVED.globalMaxBodySize}$`, 'm'),
  );
  assert.match(
    envExample,
    new RegExp(`^GATEWAY_PROXY_READ_TIMEOUT=${APPROVED.globalTimeout}$`, 'm'),
  );
  assert.match(
    envExample,
    new RegExp(`^GATEWAY_PROXY_SEND_TIMEOUT=${APPROVED.globalTimeout}$`, 'm'),
  );
});

test('request buffering is disabled nowhere except inside the seam', () => {
  for (const { path, name, source } of allTemplates()) {
    if (name === SEAM_NAME) {
      continue;
    }
    assert.ok(
      !source.includes('proxy_request_buffering'),
      `${path} must not disable request buffering: streaming is opt-in per route`,
    );
  }
});

test('no other location inherits the upload limits', () => {
  const blocks = devTemplate.split('location ').slice(1);
  for (const block of blocks) {
    if (block.startsWith('= /api/admin/assets/upload')) {
      continue;
    }
    for (const directive of ['client_max_body_size', 'proxy_read_timeout', 'proxy_send_timeout']) {
      assert.ok(!block.includes(directive), `a non-upload location must not set ${directive}`);
    }
  }
});

test('the seam declares no server, location or upstream block', () => {
  for (const directive of ['server ', 'location ', 'upstream ', 'http ']) {
    assert.ok(
      !activeDirectives(seam).some((line) => line.startsWith(directive)),
      `the seam must not open a ${directive.trim()} block`,
    );
  }
});

test('the seam lives under includes/, which nginx.conf never auto-loads', () => {
  const mainConf = readFileSync(join(NGINX_DIR, 'nginx.conf'), 'utf8');
  assert.ok(mainConf.includes('include /etc/nginx/conf.d/*.conf;'));
  assert.ok(
    !/include\s+\/etc\/nginx\/conf\.d\/\*\*/.test(mainConf),
    'a recursive include glob would auto-activate every seam under includes/',
  );
  assert.ok(readdirSync(INCLUDES_DIR).includes(SEAM_NAME));
});

test('MinIO is never exposed through the gateway', () => {
  for (const { path, source } of allTemplates()) {
    assert.ok(!/minio/i.test(source), `${path} must not reference the object store`);
    assert.ok(!/:9000/.test(source), `${path} must not proxy an S3 port`);
  }
});
