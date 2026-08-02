#!/usr/bin/env node
/**
 * `APP2-E01` §5 — the isolated TLS gateway the production Admin journey needs.
 *
 * WHY THIS EXISTS
 * ---------------
 * The API refuses to start in production unless the staff session cookie is
 * `Secure` (`staff-auth.config.ts`: a `__Host-` cookie is impossible without
 * it). A `Secure` cookie is never sent over plain HTTP, so a production Admin
 * behind the repository's HTTP-only gateway cannot be logged into by a real
 * browser at all — which is exactly why `APP2-A04-C1` had to keep the
 * development API.
 *
 * `APP2-E01` needs the whole stack in production, so it terminates TLS at the
 * gateway for the duration of the run. **Nothing tracked changes**: the
 * certificate, the extra Nginx template and the Compose override all live in a
 * temporary directory and are destroyed with the run. The guard itself is never
 * weakened — no cookie is injected, no `Secure` flag is disabled, and the
 * browser performs a normal login and sends the cookie back because the origin
 * really is HTTPS.
 *
 * The certificate is generated per run, is valid only for the local test hosts,
 * and is trusted only inside this run's browser context.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The canonical gateway hosts. Unchanged from the tracked configuration. */
export const GATEWAY_ADMIN_HOST = 'admin.embroidery.local';
export const GATEWAY_STOREFRONT_HOST = 'embroidery.local';

/** Host port for the temporary TLS listener. Deliberately not 443. */
export const TLS_HOST_PORT = 8443;
/** Container port the temporary TLS server listens on. */
export const TLS_CONTAINER_PORT = 8443;

export const ADMIN_HTTPS_BASE = `https://${GATEWAY_ADMIN_HOST}:${TLS_HOST_PORT}`;

/**
 * Generate an ephemeral self-signed certificate covering both gateway hosts.
 *
 * Returns the paths only — the key never leaves the temporary directory, is
 * never printed and is never committed. `-nodes` (no passphrase) is correct
 * here precisely because the key is worthless: it is created for one run of one
 * local test and destroyed minutes later.
 */
export function generateCertificate(dir) {
  const keyPath = join(dir, 'gateway-test.key');
  const certPath = join(dir, 'gateway-test.crt');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      `/CN=${GATEWAY_ADMIN_HOST}`,
      '-addext',
      `subjectAltName=DNS:${GATEWAY_ADMIN_HOST},DNS:${GATEWAY_STOREFRONT_HOST},IP:127.0.0.1`,
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { stdio: 'pipe' },
  );
  return { keyPath, certPath };
}

/**
 * An extra Nginx template mirroring the tracked Admin server block on a TLS
 * listener.
 *
 * It reuses the upstreams and the shared proxy-header include that the tracked
 * configuration already renders into the same `http` context, so this adds a
 * listener and changes no routing. `X-Forwarded-Proto` becomes `https` through
 * `$scheme`; `X-Forwarded-Port` is overridden after the include because the
 * shared one carries the plain-HTTP port.
 *
 * The `.template` suffix matters: the official Nginx image renders every
 * template in this directory with envsubst at startup, which is how a temporary
 * file becomes live configuration without touching the tracked ones.
 */
export function tlsTemplate() {
  return `# APP2-E01 temporary TLS listener. Generated per run, never committed.
server {
    listen ${TLS_CONTAINER_PORT} ssl;
    http2 on;
    server_name ${GATEWAY_ADMIN_HOST} ${GATEWAY_STOREFRONT_HOST};

    ssl_certificate     /etc/nginx/e01-tls/gateway-test.crt;
    ssl_certificate_key /etc/nginx/e01-tls/gateway-test.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Request-ID $effective_request_id always;

    location = /healthz {
        add_header Cache-Control "no-store" always;
        add_header X-Request-ID $effective_request_id always;
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        proxy_set_header X-Forwarded-Port ${TLS_HOST_PORT};
        proxy_pass http://admin_upstream;
    }

    location = /api/admin/assets/upload {
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        include /etc/nginx/conf.d/includes/upload-proxy.conf;
        proxy_set_header X-Forwarded-Port ${TLS_HOST_PORT};
        proxy_pass http://api_upstream;
    }

    location /api/ {
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        proxy_set_header X-Forwarded-Port ${TLS_HOST_PORT};
        proxy_pass http://api_upstream;
    }

    location / {
        include /etc/nginx/conf.d/includes/proxy-headers.conf;
        proxy_set_header X-Forwarded-Port ${TLS_HOST_PORT};
        proxy_pass http://admin_upstream;
    }
}
`;
}

/**
 * Writes the fully rendered server block and returns its path.
 *
 * Rendered here rather than handed to the image's envsubst step: the tracked
 * templates directory is mounted read-only, so a file cannot be added inside it
 * — Docker refuses the bind with `read-only file system`. The rendered result is
 * mounted into `conf.d` instead, which the entrypoint has already populated with
 * the shared includes by the time Nginx reads it.
 */
export function writeTlsTemplate(dir) {
  const path = join(dir, 'e01-tls.conf');
  writeFileSync(path, tlsTemplate(), 'utf8');
  return path;
}

/**
 * The Compose fragment that gives the existing gateway its TLS listener.
 *
 * Additive only: the tracked mounts, environment and health check are untouched
 * and the plain-HTTP listener keeps working, so the Storefront half of the
 * journey still runs exactly as `APP2-S01`/`S02` proved it.
 */
export function gatewayTlsOverrideYaml({ certDir, templatePath }) {
  return `  gateway:
    ports:
      - '\${GATEWAY_HTTP_PORT:-80}:8080'
      - '${TLS_HOST_PORT}:${TLS_CONTAINER_PORT}'
    volumes:
      - ../nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ../nginx/templates:/etc/nginx/templates:ro
      - ${templatePath.replaceAll('\\', '/')}:/etc/nginx/conf.d/e01-tls.conf:ro
      - ${certDir.replaceAll('\\', '/')}:/etc/nginx/e01-tls:ro
`;
}

/**
 * Recreates the gateway so the new listener and mounts take effect.
 *
 * `--no-deps` is load-bearing, not tidiness: the tracked gateway declares
 * `depends_on` for every application, so without it Compose walks the whole
 * chain and starts the development `db-migrate` and `staff-bootstrap` one-shots
 * against the **developer's** database. The upstreams this run needs are already
 * up by the time the gateway is recreated.
 */
export function gatewayUpArgs(files, envFile) {
  return [
    'compose',
    '-p',
    'embroidery-dev',
    ...files.flatMap((file) => ['-f', file]),
    '--env-file',
    envFile,
    'up',
    '-d',
    '--no-deps',
    '--force-recreate',
    'gateway',
  ];
}
