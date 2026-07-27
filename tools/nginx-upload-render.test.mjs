/**
 * Real rendered-gateway proof for the APP2-B01 upload route (§27).
 *
 * The static seam tests assert what the templates say; this asserts what the
 * **official Nginx image actually renders and accepts**. It runs the real
 * entrypoint substitution with the approved environment, then `nginx -t`
 * against the result — so a template that substitutes wrongly, or a directive
 * Nginx rejects in a `location` context, fails here rather than in production.
 *
 * Docker-only. Skipped with a clear message when no daemon is reachable, never
 * silently passed. Run with `pnpm test:asset-intake:gateway`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NGINX_DIR = join(REPO_ROOT, 'infrastructure', 'nginx');

/** The image the development gateway pins. */
const NGINX_IMAGE = 'nginx:1.27.3-alpine';

const ENVIRONMENT = {
  GATEWAY_HTTP_PORT: '80',
  STOREFRONT_HOST: 'embroidery.local',
  ADMIN_HOST: 'admin.embroidery.local',
  GATEWAY_CLIENT_MAX_BODY_SIZE: '20m',
  GATEWAY_PROXY_CONNECT_TIMEOUT: '10s',
  GATEWAY_PROXY_READ_TIMEOUT: '60s',
  GATEWAY_PROXY_SEND_TIMEOUT: '60s',
  GATEWAY_UPLOAD_MAX_BODY_SIZE: '27m',
  GATEWAY_UPLOAD_PROXY_TIMEOUT: '360s',
};

function docker(args, options = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', ...options });
}

function dockerAvailable() {
  return docker(['version', '--format', '{{.Server.Version}}']).status === 0;
}

const available = dockerAvailable();
const skip = available ? false : 'requires a reachable Docker daemon';

/**
 * Renders the templates with the real entrypoint and returns the rendered
 * config plus the `nginx -t` result.
 *
 * The upstream host names do not resolve inside this throwaway container, so
 * `proxy_pass` targets are rewritten to a literal address before validation:
 * the assertion is about directives and substitution, not DNS.
 */
function renderAndValidate() {
  const script = [
    'set -e',
    '/docker-entrypoint.d/20-envsubst-on-templates.sh',
    // Replace the compose-service upstreams with a resolvable literal so
    // `nginx -t` exercises the directives rather than the container DNS.
    "sed -i 's/server storefront:3000;/server 127.0.0.1:3000;/' /etc/nginx/conf.d/development.conf",
    "sed -i 's/server admin:3001;/server 127.0.0.1:3001;/' /etc/nginx/conf.d/development.conf",
    "sed -i 's/server api:4000;/server 127.0.0.1:4000;/' /etc/nginx/conf.d/development.conf",
    'echo "----RENDERED----"',
    'cat /etc/nginx/conf.d/development.conf',
    'echo "----INCLUDE----"',
    'cat /etc/nginx/conf.d/includes/upload-proxy.conf',
    'echo "----NGINXT----"',
    'nginx -t 2>&1',
  ].join('\n');

  const args = ['run', '--rm', '--entrypoint', '/bin/sh'];
  for (const [name, value] of Object.entries(ENVIRONMENT)) {
    args.push('--env', `${name}=${value}`);
  }
  args.push(
    '--volume',
    `${join(NGINX_DIR, 'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
    '--volume',
    `${join(NGINX_DIR, 'templates')}:/etc/nginx/templates:ro`,
    NGINX_IMAGE,
    '-c',
    script,
  );

  const result = docker(args);
  assert.equal(result.status, 0, `gateway render failed:\n${result.stdout}\n${result.stderr}`);
  const output = result.stdout;
  const rendered = output.split('----RENDERED----')[1]?.split('----INCLUDE----')[0] ?? '';
  const include = output.split('----INCLUDE----')[1]?.split('----NGINXT----')[0] ?? '';
  const validation = output.split('----NGINXT----')[1] ?? '';
  return { rendered, include, validation };
}

let rendered = '';
let include = '';
let validation = '';

test('the real Nginx image renders and accepts the gateway config', { skip }, () => {
  ({ rendered, include, validation } = renderAndValidate());
  assert.match(validation, /syntax is ok/);
  assert.match(validation, /test is successful/);
});

test('the rendered upload include carries the approved values', { skip }, () => {
  assert.match(include, /client_max_body_size 27m;/);
  assert.match(include, /proxy_read_timeout 360s;/);
  assert.match(include, /proxy_send_timeout 360s;/);
  assert.match(include, /proxy_request_buffering off;/);
  // No unsubstituted placeholder survived.
  assert.ok(!include.includes('${'), 'every gateway variable must be substituted');
});

test('the upload location exists exactly once and is exact-match', { skip }, () => {
  const matches = rendered.match(/location = \/api\/admin\/assets\/upload \{/g) ?? [];
  assert.equal(matches.length, 1);
});

test('the global limits keep their own values in the rendered config', { skip }, () => {
  assert.match(rendered, /client_max_body_size 20m;/);
  assert.match(rendered, /proxy_read_timeout 60s;/);
  assert.match(rendered, /proxy_send_timeout 60s;/);
});

test('no other rendered location disables buffering or raises the ceiling', { skip }, () => {
  const blocks = rendered.split('location ').slice(1);
  for (const block of blocks) {
    if (block.startsWith('= /api/admin/assets/upload')) {
      continue;
    }
    assert.ok(!block.includes('proxy_request_buffering'), 'buffering must stay on elsewhere');
    assert.ok(!block.includes('27m'), 'the upload ceiling must not leak to another route');
  }
});

test('the rendered gateway exposes no object store', { skip }, () => {
  assert.ok(!/minio/i.test(rendered), 'MinIO must never be proxied');
  assert.ok(!/:9000/.test(rendered), 'no S3 port may be proxied');
});

test('request-id handling is preserved on the upload host', { skip }, () => {
  assert.match(rendered, /add_header X-Request-ID \$effective_request_id always;/);
  assert.match(rendered, /map \$http_x_request_id \$effective_request_id/);
});
