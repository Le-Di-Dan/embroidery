/**
 * Shared request builders and durable-state readers for the live intake suites.
 *
 * Extracted so the two suites — the accepted/rejected paths and the
 * lifecycle/reclaim paths — assert against exactly the same notion of "what the
 * database and the object store now contain". Two private copies would drift,
 * and a drifted reader is how a suite starts proving something subtly different
 * from the one next to it.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';

import { buildAssetPrefix, ObjectStorageError } from '@embroidery/object-storage';

import { isAssetIntakeError } from '../../src/modules/asset/domain/asset-intake.errors';
import type { AssetIntakeTestContext } from './asset-intake-context';

export const INTAKE_ACTOR = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07';
export const INTAKE_BOUNDARY = 'intake-boundary-0123456789';

export interface UploadRequestOptions {
  readonly key: string;
  readonly bytes: Buffer;
  readonly mediaType?: string;
  readonly filename?: string;
  readonly assetKind?: string;
  readonly classification?: string;
  /** Streams the file in chunks so backpressure and abort paths are real. */
  readonly chunkSize?: number;
}

export function multipartBody(options: UploadRequestOptions): Buffer {
  const field = (name: string, value: string): Buffer =>
    Buffer.from(
      `--${INTAKE_BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      'utf8',
    );
  const fileHeader = Buffer.from(
    `--${INTAKE_BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename ?? 'logo.png'}"\r\n` +
      `Content-Type: ${options.mediaType ?? 'image/png'}\r\n\r\n`,
    'utf8',
  );
  return Buffer.concat([
    field('assetKind', options.assetKind ?? 'CATALOG_MEDIA'),
    field('classification', options.classification ?? 'PRODUCTION_SENSITIVE'),
    fileHeader,
    options.bytes,
    Buffer.from(`\r\n--${INTAKE_BOUNDARY}--\r\n`, 'utf8'),
  ]);
}

/** A request-shaped readable that streams the body in chunks. */
export function uploadRequest(options: UploadRequestOptions): IncomingMessage {
  const body = multipartBody(options);
  const chunkSize = options.chunkSize ?? 64 * 1024;
  let offset = 0;
  const stream = new Readable({
    read() {
      if (offset >= body.length) {
        this.push(null);
        return;
      }
      this.push(body.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  }) as unknown as IncomingMessage;
  return withIntakeHeaders(stream, options.key);
}

export function withIntakeHeaders(stream: IncomingMessage, key: string): IncomingMessage {
  (stream as unknown as { headers: Record<string, string> }).headers = {
    'content-type': `multipart/form-data; boundary=${INTAKE_BOUNDARY}`,
    'idempotency-key': key,
  };
  return stream;
}

/** Returns the intake error code, or a labelled surprise. Never swallows. */
export async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error: unknown) {
    return isAssetIntakeError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return 'no-error';
}

export interface IdempotencyRow {
  status: string;
  fingerprint: string;
  result: Record<string, unknown> | null;
  expires_at: Date;
}

export interface OutboxRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

/** Every durable read the suites make, bound to one context. */
export function intakeReaders(context: () => AssetIntakeTestContext) {
  const upload = (options: UploadRequestOptions) =>
    context().intake.upload(uploadRequest(options), INTAKE_ACTOR);

  const idempotencyRows = (): Promise<IdempotencyRow[]> =>
    context().query<IdempotencyRow>(
      'select status, fingerprint, result, expires_at from idempotency_records ' +
        "where operation_namespace = 'admin.asset.upload' order by id",
    );

  const rowForAsset = async (assetId: string): Promise<IdempotencyRow> => {
    const rows = await context().query<IdempotencyRow>(
      "select status, fingerprint, result, expires_at from idempotency_records where result->>'assetId' = $1",
      [assetId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error(`no idempotency record for asset ${assetId}`);
    }
    return row;
  };

  /** The most recent claim row — one key is used per case, in order. */
  const latestClaim = async (key: string): Promise<IdempotencyRow> => {
    const rows = await idempotencyRows();
    const row = rows[rows.length - 1];
    if (row === undefined) {
      throw new Error(`no idempotency record after using key ${key}`);
    }
    return row;
  };

  const outboxFor = (assetId: string): Promise<OutboxRow[]> =>
    context().query<OutboxRow>(
      'select id::text, event_type, payload from outbox_events ' +
        "where aggregate_kind = 'ASSET' and aggregate_id = $1 order by id",
      [assetId],
    );

  const objectExists = async (
    bucket: 'ORIGINALS' | 'DERIVATIVES',
    key: string,
  ): Promise<boolean> => {
    try {
      await context().storage.headObject({ bucket, key });
      return true;
    } catch (error: unknown) {
      if (error instanceof ObjectStorageError && error.code === 'OBJECT_NOT_FOUND') {
        return false;
      }
      throw error;
    }
  };

  const originalsPrefix = (assetId: string): string =>
    buildAssetPrefix({ environment: 'test', scope: 'originals', assetId });

  const listOriginals = (assetId: string) =>
    context().storage.listObjectsByPrefix({
      bucket: 'ORIGINALS',
      prefix: originalsPrefix(assetId),
    });

  /** Expires the allocation without waiting 15 minutes; `expires_at` is mutable. */
  const expireAllocation = async (assetId: string): Promise<void> => {
    await context().query(
      "update idempotency_records set expires_at = now() - interval '1 minute' " +
        "where result->>'assetId' = $1",
      [assetId],
    );
  };

  return {
    upload,
    idempotencyRows,
    rowForAsset,
    latestClaim,
    outboxFor,
    objectExists,
    originalsPrefix,
    listOriginals,
    expireAllocation,
  };
}

/** Per-suite unique idempotency keys. */
export function keyFactory(prefix: string): (label: string) => string {
  let counter = 0;
  return (label: string) => {
    counter += 1;
    return `${prefix}-${label}-${String(counter).padStart(3, '0')}`;
  };
}
