/**
 * Shared fixture for the `APP7-B05` transfer-evidence suites.
 *
 * It boots the whole application against a disposable PostgreSQL **and a live
 * disposable MinIO**, so the bytes really are streamed through the production S3
 * adapter into a real private bucket. `createApiIntegrationContext` applies
 * offline object-storage placeholders only when the caller has not already set
 * real ones, which is exactly the seam this uses.
 *
 * **Nothing under test is overridden.** The real controller, the real global
 * pipe and exception filter, the real Busboy parser, the real
 * `consumeValidatedFile` signature check, the real `AuthorizeSecureLink` and
 * `ReauthorizeSecureGrant` with their peppered digest, the real
 * `IdempotencyAllocationStore`, the real `PaymentTransferEvidenceRepository` and
 * the canonical AGG-08/AGG-16 repositories all run.
 *
 * The attempt is opened through `PaymentObligationRepository.openAttempt` — the
 * one `APP7-B03` uses — rather than by inserting a row, so what B05 binds to is
 * an attempt the production writer actually wrote, complete with its recorded
 * grant and step-up evidence.
 *
 * The peppers and the MinIO credentials are synthetic values set on
 * `process.env` for the duration of the suite and restored afterwards. No `.env`
 * file is read, written or consulted (`CLAUDE.md` §8a), and no credential is
 * rotated.
 *
 * Test-only.
 */
import type { INestApplication } from '@nestjs/common';
import { newId } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import {
  PAYMENT_OBLIGATION_REPOSITORY,
  TransactionManager,
  type AttemptId,
  type ObligationId,
  type PaymentObligationRepository,
} from '@embroidery/persistence';
import type { ObjectStoragePort } from '@embroidery/object-storage';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../src/bootstrap/api-application';
import { OBJECT_STORAGE } from '../../src/modules/asset/infrastructure/storage/object-storage.provider';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from './api-integration-context';
import { minioEnv, startDisposableMinio, type DisposableMinio } from './disposable-minio';
import { applyDepositSecretEnv, seedDeposit, type SeededDeposit } from './customer-deposit-fixture';

/** The two published routes, under the global API prefix. */
export const EVIDENCE_ROUTES = {
  upload: `/${GLOBAL_ROUTE_PREFIX}/public/orders/deposit/evidence`,
  status: `/${GLOBAL_ROUTE_PREFIX}/public/orders/deposit/evidence/status`,
} as const;

/** The first eight bytes of a PNG. `consumeValidatedFile` checks these. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A JPEG SOI plus a JFIF marker — a different file, for content-conflict cases. */
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

/** Not an image at all. Used to prove the declared type is never trusted. */
export const SVG_BODY = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

export function pngBytes(filler = 0x01, length = 64): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.alloc(length, filler)]);
}

export function jpegBytes(filler = 0x02, length = 64): Buffer {
  return Buffer.concat([JPEG_SIGNATURE, Buffer.alloc(length, filler)]);
}

export interface TransferEvidenceTestContext extends ApiIntegrationTestContext {
  readonly minio: DisposableMinio;
}

/**
 * The whole application, a disposable database and a live private bucket.
 *
 * The MinIO environment is set **before** the context is created, because the
 * object-storage configuration is read when its provider is constructed.
 */
export async function createTransferEvidenceContext(
  label: string,
): Promise<TransferEvidenceTestContext> {
  const restoreSecrets = applyDepositSecretEnv();
  const minio = await startDisposableMinio();

  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(minioEnv(minio))) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  try {
    const base = await createApiIntegrationContext(label);
    // Idempotent and private-only. Without it the first upload would fail on a
    // missing bucket rather than on the behaviour under test.
    await base.app.get<ObjectStoragePort>(OBJECT_STORAGE).ensurePrivateBuckets();

    return {
      ...base,
      minio,
      close: async (): Promise<void> => {
        await base.close();
        await minio.stop();
        restoreEnv(previous);
        restoreSecrets();
      },
    };
  } catch (error: unknown) {
    await minio.stop();
    restoreEnv(previous);
    restoreSecrets();
    throw error;
  }
}

function restoreEnv(previous: ReadonlyMap<string, string | undefined>): void {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

export interface SeededAttempt extends SeededDeposit {
  readonly attemptId: string;
}

/**
 * One payable deposit with a live link, a fresh step-up and one open
 * `BANK_TRANSFER` attempt.
 *
 * The attempt is opened by the canonical writer inside a real transaction, and
 * it records the grant and the step-up challenge the fixture seeded — which is
 * what makes "B05 re-verifies the attempt's own step-up" a checkable claim
 * rather than an assertion about a column nobody filled in.
 */
export async function seedOpenAttempt(
  app: INestApplication,
  database: DisposableDatabase,
  suffix: string,
): Promise<SeededAttempt> {
  const deposit = await seedDeposit(app, database, {
    stepUpVerifiedSecondsAgo: 60,
    suffix,
  });
  const attemptId = await openAttempt(app, deposit);
  return { ...deposit, attemptId };
}

/** Opens one more `BANK_TRANSFER` attempt on the same deposit. */
export async function openAttempt(app: INestApplication, deposit: SeededDeposit): Promise<string> {
  const obligations = app.get<PaymentObligationRepository>(PAYMENT_OBLIGATION_REPOSITORY);
  const id = newId() as AttemptId;
  await app.get(TransactionManager).runInTransaction(() =>
    obligations.openAttempt({
      id,
      paymentObligationId: deposit.depositObligationId as ObligationId,
      amount: '765000.00',
      method: 'BANK_TRANSFER',
      grantId: deposit.grantId,
      stepUpChallengeId: deposit.challengeId,
    }),
  );
  return id;
}

export interface UploadOptions {
  readonly token: string;
  readonly attemptId: string;
  readonly bytes?: Buffer;
  readonly filename?: string;
  readonly contentType?: string;
  readonly idempotencyKey?: string;
  /** Omits the two credential fields entirely, for the shape cases. */
  readonly omitFields?: boolean;
}

let keyCounter = 0;
export function nextEvidenceKey(): string {
  keyCounter += 1;
  return `app7-b05-key-${String(keyCounter).padStart(4, '0')}`;
}

/**
 * Posts one real `multipart/form-data` upload.
 *
 * Superagent emits parts in call order, so the two credential fields precede the
 * file exactly as the contract requires — which is also what makes an
 * out-of-order body expressible as its own case.
 */
export function uploadEvidence(context: ApiIntegrationTestContext, options: UploadOptions) {
  const request = context.http
    .post(EVIDENCE_ROUTES.upload)
    .set('Idempotency-Key', options.idempotencyKey ?? nextEvidenceKey());

  if (options.omitFields !== true) {
    request.field('accessToken', options.token).field('attemptId', options.attemptId);
  }
  return request.attach('file', options.bytes ?? pngBytes(), {
    filename: options.filename ?? 'transfer.png',
    contentType: options.contentType ?? 'image/png',
  });
}

export interface EvidenceRow extends Record<string, unknown> {
  readonly id: string;
  readonly payment_attempt_id: string;
  readonly asset_id: string;
}

/** The association rows of one attempt, oldest first. */
export async function evidenceRowsOf(
  database: DisposableDatabase,
  attemptId: string,
): Promise<EvidenceRow[]> {
  const { rows } = await database.client.db.execute<EvidenceRow>(sql`
    select id, payment_attempt_id, asset_id
      from payment_transfer_evidence
     where payment_attempt_id = ${attemptId}
     order by created_at asc, id asc
  `);
  return rows;
}

export interface AssetRow extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly classification: string;
  readonly status: string;
  readonly mime_type: string;
  readonly size_bytes: string;
  readonly storage_key: string;
  readonly uploaded_by_customer_id: string | null;
  readonly uploaded_via_challenge_id: string | null;
  readonly intake_expires_at: string | null;
}

export async function assetRowOf(
  database: DisposableDatabase,
  assetId: string,
): Promise<AssetRow | undefined> {
  const { rows } = await database.client.db.execute<AssetRow>(sql`
    select id, kind, classification, status, mime_type, size_bytes, storage_key,
           uploaded_by_customer_id, uploaded_via_challenge_id, intake_expires_at
      from assets where id = ${assetId}
  `);
  return rows[0];
}

/** How many `asset.inspection.requested` events name this asset. */
export async function inspectionEventCount(
  database: DisposableDatabase,
  assetId: string,
): Promise<number> {
  const { rows } = await database.client.db.execute<{ total: string }>(sql`
    select count(*)::text as total
      from outbox_events
     where event_type = 'asset.inspection.requested' and aggregate_id = ${assetId}
  `);
  return Number(rows[0]?.total ?? '0');
}

/** Every asset ever written by the customer-upload lane in this database. */
export async function customerUploadAssetCount(database: DisposableDatabase): Promise<number> {
  const { rows } = await database.client.db.execute<{ total: string }>(sql`
    select count(*)::text as total from assets where kind = 'CUSTOMER_UPLOAD'
  `);
  return Number(rows[0]?.total ?? '0');
}

/** The upload operation's response payload, inside the envelope's `data`. */
export interface UploadBody {
  readonly evidenceId: string;
  readonly assetStatus: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly replayed: boolean;
}

/** The status operation's response payload, inside the envelope's `data`. */
export interface ListBody {
  readonly evidence: readonly {
    readonly evidenceId: string;
    readonly assetStatus: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly createdAt: string;
  }[];
}

/** The platform error envelope is flat: the code sits beside `success`. */
export interface ErrorBody {
  readonly success: false;
  readonly code: string;
  readonly message: string;
  readonly meta: { readonly requestId: string; readonly timestamp: string };
}

/** Drops the per-request envelope metadata, which is never the thing compared. */
export function withoutMeta(body: ErrorBody): Omit<ErrorBody, 'meta'> {
  const { meta: _meta, ...rest } = body;
  return rest;
}

/** Posts the zero-write status read for one attempt. */
export function readEvidenceStatus(
  context: ApiIntegrationTestContext,
  token: string,
  attemptId: string,
) {
  return context.http.post(EVIDENCE_ROUTES.status).send({ accessToken: token, attemptId });
}

/**
 * The whole payment-and-order state a zero-change claim is checked against.
 *
 * Every mutable column an evidence upload could conceivably touch, plus the
 * three tables that would have to grow a row for money to have moved. Compared
 * as one value, so a change anywhere in it fails rather than only the fields a
 * test remembered to name.
 */
export async function paymentStateOf(
  database: DisposableDatabase,
  seeded: SeededAttempt,
): Promise<unknown> {
  const { rows } = await database.client.db.execute(sql`
    select
      (select row_to_json(o) from (
         select status, updated_at from orders where id = ${seeded.orderId}
       ) o) as ordering,
      (select json_agg(row_to_json(p) order by p.kind) from (
         select kind, status, amount, satisfied_by_attempt_id, satisfied_at, updated_at
           from payment_obligations where order_id = ${seeded.orderId}
       ) p) as obligations,
      (select json_agg(row_to_json(a) order by a.id) from (
         select id, status, amount, succeeded_at, failed_at, review_reason, updated_at
           from payment_attempts
          where payment_obligation_id in (
            ${seeded.depositObligationId}, ${seeded.remainingObligationId})
       ) a) as attempts,
      (select count(*) from payment_reconciliations) as reconciliations,
      (select count(*) from payment_provider_events) as provider_events,
      (select count(*) from refunds) as refunds
  `);
  return rows[0];
}
