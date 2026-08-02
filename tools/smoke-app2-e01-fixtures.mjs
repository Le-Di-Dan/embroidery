#!/usr/bin/env node
/**
 * `APP2-E01` §6/§7 — the disposable environment's prerequisites, and nothing
 * more.
 *
 * The journey must create its own Asset, Product, media, derivatives and
 * publication evidence through the real UI. This module therefore seeds only
 * what infrastructure needs to exist *before* a person could do any of that: a
 * staff identity, the worker runtime policy, the private buckets, and the fixed
 * categories that arrive with the migrations.
 *
 * Everything here targets the run's **disposable** database. The shared
 * development database and MinIO are never written.
 */
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PROD_DB_CONTAINER,
  PROD_DB_NAME,
  PROD_DB_USER,
} from './smoke-app2-t01-production-topology.mjs';

/** Every statement in this harness targets the run's disposable copy only. */
export function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      PROD_DB_CONTAINER,
      'psql',
      '-U',
      PROD_DB_USER,
      '-d',
      PROD_DB_NAME,
      '-tAF|',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

/**
 * Remove every mutable catalog fact the development dump carried in.
 *
 * The disposable copy is restored from a `pg_dump` of the development database,
 * which is how the accepted topology gets all 33 migrations, the fixed
 * categories and the `worker.runtime` policy without inventing a second
 * migration path. That dump also carries the developer's own draft products and
 * their assets — and `APP2-E01` must prove the *journey* creates these, not that
 * they were lying around. So they go.
 *
 * Categories and policy configuration stay: they are migration-owned
 * infrastructure, explicitly allowed as prerequisites.
 */
export function captureBaseline() {
  return {
    products: Number(sql('select count(*) from products')),
    publishedProducts: Number(sql("select count(*) from products where status = 'PUBLISHED'")),
    assets: Number(sql('select count(*) from assets')),
    derivatives: Number(sql('select count(*) from asset_derivatives')),
    productMedia: Number(sql('select count(*) from product_media')),
    jobAttempts: Number(sql('select count(*) from background_job_attempts')),
    publishedAudit: Number(
      sql("select count(*) from audit_events where action = 'product.published'"),
    ),
    unpublishedAudit: Number(
      sql("select count(*) from audit_events where action = 'product.unpublished'"),
    ),
    publishedOutbox: Number(
      sql("select count(*) from outbox_events where event_type = 'product.published'"),
    ),
    unpublishedOutbox: Number(
      sql("select count(*) from outbox_events where event_type = 'product.unpublished'"),
    ),
    inspectionOutbox: Number(
      sql("select count(*) from outbox_events where event_type = 'asset.inspection.requested'"),
    ),
    categories: Number(sql("select count(*) from categories where status = 'PUBLISHED'")),
    workerPolicy: Number(
      sql("select count(*) from policy_configurations where config_key = 'worker.runtime'"),
    ),
  };
}

/**
 * The ids that already exist, so the journey's own rows can be identified by
 * difference rather than by "the newest row" — which would silently pass by
 * picking up a pre-existing Asset if the upload never happened.
 */
export function existingAssetIds() {
  const rows = sql('select id from assets');
  return new Set(rows === '' ? [] : rows.split('\n').map((line) => line.trim()));
}

/**
 * A deterministic, project-owned PNG generated for this run.
 *
 * Written by hand rather than committed or downloaded: nothing is fetched from
 * the network, no personal or third-party image is involved, and the bytes are
 * a real PNG — signature, IHDR, IDAT, IEND — so the worker's decoder does
 * genuine work. The gradient plus colour blocks give the derivative pipeline
 * something to actually resample, which a flat fill would not.
 */
export function writeFixtureImage(dir, size = 256) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const block = (x >> 5) % 2 === (y >> 5) % 2;
      raw[offset] = block ? (x * 255) / size : 32;
      raw[offset + 1] = block ? (y * 255) / size : 96;
      raw[offset + 2] = block ? 200 - ((x + y) * 100) / (size * 2) : 160;
      offset += 3;
    }
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const path = join(dir, 'e01-catalog-fixture.png');
  writeFileSync(path, png);
  return { path, bytes: png.length, width: size, height: size, mimeType: 'image/png' };
}

let crcTable;
function crc32(buffer) {
  if (crcTable === undefined) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return crc ^ -1;
}

/**
 * The synthetic staff identity, created through the API's own bootstrap CLI.
 *
 * The credential is generated for this run, reaches the container only through
 * `docker exec --env`, is never placed on a command line, never printed and
 * never written to a tracked file. Nothing is read from the repository `.env`.
 */
export function bootstrapStaff({ container, email, password, displayName }) {
  // The disposable copy starts with no staff identity at all (schema-only
  // restore), so the CLI takes its normal CREATED path. Nothing is rotated and
  // no existing credential is read. The developer's own admin account lives in
  // the development database, which this run never writes.
  // Historical note: a full dump carried the developer's own admin account, and the CLI
  // correctly refuses to bootstrap a second one — `FAILED_EXISTING_ADMIN_MISMATCH`
  // is the one-active-admin-per-database guard doing its job. The developer's
  // credential is not ours to use, so the **disposable copy** starts from no
  // staff identity and the journey seeds exactly one. Nothing is rotated: the
  // developer's real account in the real database is untouched.
  const output = execFileSync(
    'docker',
    [
      'exec',
      '--env',
      'STAFF_BOOTSTRAP_EMAIL',
      '--env',
      'STAFF_BOOTSTRAP_PASSWORD',
      '--env',
      'STAFF_BOOTSTRAP_DISPLAY_NAME',
      container,
      'node',
      'dist/cli/staff-bootstrap.js',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        STAFF_BOOTSTRAP_EMAIL: email,
        STAFF_BOOTSTRAP_PASSWORD: password,
        STAFF_BOOTSTRAP_DISPLAY_NAME: displayName,
      },
    },
  );
  return {
    // The CLI reports a status word only; no credential is echoed.
    status: /result=([A-Z_]+)/.exec(output)?.[1] ?? 'UNKNOWN',
    accounts: Number(sql('select count(*) from admin_accounts')),
  };
}

/** Cross-layer evidence, read straight from the disposable database. */
export const evidence = {
  asset(id) {
    const row = sql(`select status, kind, classification, storage_key is not null
                     from assets where id = '${id}'`);
    const [status, kind, classification, hasKey] = row.split('|');
    return { status, kind, classification, hasStorageKey: hasKey === 't' };
  },
  derivatives(assetId) {
    const rows = sql(`select kind, status, is_watermarked, storage_key is not null
                      from asset_derivatives where asset_id = '${assetId}' order by kind`);
    if (rows === '') return [];
    return rows.split('\n').map((line) => {
      const [kind, status, watermarked, hasKey] = line.trim().split('|');
      return { kind, status, watermarked: watermarked === 't', hasObject: hasKey === 't' };
    });
  },
  outboxByType(type) {
    const rows = sql(`select status, count(*) from outbox_events
                      where event_type = '${type}' group by status order by status`);
    if (rows === '') return {};
    return Object.fromEntries(
      rows.split('\n').map((line) => {
        const [status, count] = line.trim().split('|');
        return [status, Number(count)];
      }),
    );
  },
  auditCount(action) {
    return Number(sql(`select count(*) from audit_events where action = '${action}'`));
  },
  /** Every audit action observed, so a name mismatch is visible not silent. */
  auditActions() {
    const rows = sql('select action, count(*) from audit_events group by action order by action');
    if (rows === '') return {};
    return Object.fromEntries(
      rows.split('\n').map((line) => {
        const [action, count] = line.trim().split('|');
        return [action, Number(count)];
      }),
    );
  },
  jobAttempts() {
    const rows = sql(`select job_kind, outcome, attempt_no from background_job_attempts
                      order by created_at`);
    if (rows === '') return [];
    return rows.split('\n').map((line) => {
      const [kind, outcome, attempt] = line.trim().split('|');
      return { kind, outcome, attempt: Number(attempt) };
    });
  },
  product(slug) {
    const row = sql(`select id, status, base_price_amount, updated_at from products
                     where slug = '${slug}'`);
    if (row === '') return undefined;
    const [id, status, price, updatedAt] = row.split('|');
    return { id, status, price, updatedAt };
  },
  productMedia(slug) {
    const rows = sql(`select pm.role, pm.display_order from product_media pm
                      join products p on p.id = pm.product_id and p.slug = '${slug}'
                      order by pm.display_order`);
    if (rows === '') return [];
    return rows.split('\n').map((line) => {
      const [role, order] = line.trim().split('|');
      return { role, order: Number(order) };
    });
  },
};

/** A bounded wait on durable state, so a hung stack fails instead of parking. */
export async function waitFor(label, predicate, { timeoutMs = 120_000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = predicate();
    if (last !== undefined && last !== false) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}
