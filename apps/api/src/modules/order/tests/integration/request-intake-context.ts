/**
 * Shared harness for the `APP5-B02` customer-intake suites.
 *
 * Boots the real `CustomRequestIntakeModule` — real controller wiring, real
 * authorizer, real two-transaction commit, real repositories, real
 * `TransactionManager` — against a disposable database with every migration
 * applied, including `0035`.
 *
 * One provider is overridden and only one: `OBJECT_STORAGE`. The store is the
 * single dependency that is neither the code under test nor the database, and a
 * suite that needed a live MinIO would prove S3 works rather than proving the
 * lane does. The recorder below is not a stub that returns success — it records
 * which keys were written and deleted, which is what makes the quota-refusal
 * cleanup and the two-phase sweep observable at all.
 *
 * The multipart body is built here rather than mocked. `openMultipartUpload`
 * parses a real stream, `consumeValidatedFile` verifies real signature bytes,
 * and both are `APP2-B01`'s code — feeding them a synthetic parser result would
 * skip exactly the validation this checkpoint is required to reuse.
 *
 * Test-only.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';

import type { TestingModuleBuilder } from '@nestjs/testing';
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';
import type {
  ObjectReference,
  ObjectStoragePort,
  PutObjectStreamInput,
  StoredObjectResult,
} from '@embroidery/object-storage';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { OBJECT_STORAGE } from '../../../asset/infrastructure/storage/object-storage.provider';
import { CustomRequestIntakeModule } from '../../custom-request-intake.module';
import { RequestAssetIntakeService } from '../../application/intake/request-asset-intake.service';
import { RequestAssetStatusService } from '../../application/intake/request-asset-status.service';

/** Non-connecting values, so the module's fail-fast config load succeeds. */
const OFFLINE_STORAGE_ENV: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://app5-offline.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'app5-offline',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'app5-offline',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'app5-offline-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'app5-offline-derivatives',
};

/**
 * An object store that remembers what happened to it.
 *
 * `put` drains the body before resolving, exactly as the real client does: the
 * upload pipeline writes into a `PassThrough` and waits for both sides, so a
 * sink that never read would deadlock the test rather than fail it.
 */
export class RecordingObjectStorage implements ObjectStoragePort {
  readonly written: string[] = [];
  readonly deleted: string[] = [];
  /** Set to make the next deletion fail, so the deferred path is reachable. */
  failNextDelete = false;

  async putObjectStream(input: PutObjectStreamInput): Promise<StoredObjectResult> {
    for await (const _chunk of input.body) {
      // Drained, never retained: the suite asserts on keys, not bytes.
    }
    this.written.push(input.key);
    return { bucket: input.bucket, key: input.key, providerEntityTag: 'recorded' };
  }

  deleteObject(reference: ObjectReference): Promise<void> {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      return Promise.reject(new Error('object store refused the deletion'));
    }
    this.deleted.push(reference.key);
    return Promise.resolve();
  }

  copyObject(): never {
    throw new Error('APP5-B02 intake never copies an object.');
  }
  getObjectStream(): never {
    throw new Error('APP5-B02 intake never reads an object back.');
  }
  headObject(): never {
    throw new Error('APP5-B02 intake never heads an object.');
  }
  listObjectsByPrefix(): never {
    throw new Error('APP5-B02 intake never lists objects.');
  }
  async ensurePrivateBuckets(): Promise<void> {
    // The suite provisions nothing; the module never calls this.
  }

  reset(): void {
    this.written.length = 0;
    this.deleted.length = 0;
    this.failNextDelete = false;
  }
}

/** The first eight bytes of a PNG. `consumeValidatedFile` checks these. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A JPEG SOI plus a JFIF marker — a different file, for content-conflict cases. */
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
/** Not an image at all. Used to prove the declared type is not trusted. */
export const SVG_BODY = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');

export function pngBytes(filler = 0x01, length = 64): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.alloc(length, filler)]);
}

export function jpegBytes(filler = 0x02, length = 64): Buffer {
  return Buffer.concat([JPEG_SIGNATURE, Buffer.alloc(length, filler)]);
}

export interface MultipartOptions {
  readonly filename?: string;
  readonly contentType?: string;
  readonly idempotencyKey?: string;
}

/**
 * Builds a real `multipart/form-data` request the parser will accept.
 *
 * Typed as `IncomingMessage` through `unknown` because only `headers`, `pipe`,
 * `on` and `unpipe` are ever touched — a full socket-backed message would add
 * nothing a parser test can observe.
 */
export function multipartRequest(body: Buffer, options: MultipartOptions = {}): IncomingMessage {
  const boundary = '----app5b02boundary';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${options.filename ?? 'photo.png'}"\r\n` +
      `Content-Type: ${options.contentType ?? 'image/png'}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const stream = Readable.from([head, body, tail]) as unknown as IncomingMessage;

  Object.defineProperty(stream, 'headers', {
    value: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'idempotency-key': options.idempotencyKey ?? `key-${newId()}`,
    },
    configurable: true,
  });
  // `request.unpipe` is called on every parser teardown; `Readable` has it, but
  // the cast above hides that from the type system rather than from the object.
  return stream;
}

export interface IntakeChallenge {
  readonly challengeId: string;
  readonly customerId: string;
  readonly expiresAt: Date;
}

export interface RequestIntakeTestContext extends PersistenceTestContext {
  readonly intake: RequestAssetIntakeService;
  readonly status: RequestAssetStatusService;
  readonly storage: RecordingObjectStorage;
  /** Seeds one verified customer with a live `SUBMISSION` challenge. */
  seedVerifiedChallenge(options?: {
    readonly status?: string;
    readonly purpose?: string;
    readonly expiresInMinutes?: number;
    readonly withCustomer?: boolean;
  }): Promise<IntakeChallenge>;
}

export async function createRequestIntakeContext(
  label: string,
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<RequestIntakeTestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(OFFLINE_STORAGE_ENV)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  const storage = new RecordingObjectStorage();
  const base = await createPersistenceTestContext(
    label,
    [RequestContextModule, AuditContextModule, CustomRequestIntakeModule],
    (builder) => {
      const configured = builder.overrideProvider(OBJECT_STORAGE).useValue(storage);
      return configure === undefined ? configured : configure(configured);
    },
  );

  const seedVerifiedChallenge: RequestIntakeTestContext['seedVerifiedChallenge'] = async (
    options = {},
  ) => {
    const db = base.disposable.client.db;
    const challengeId = newId();
    const customerId = newId();
    const contactPointId = newId();
    const normalized = `app5-${challengeId}@example.test`;
    const expiresAt = new Date(Date.now() + (options.expiresInMinutes ?? 30) * 60_000);
    const status = options.status ?? 'VERIFIED';

    if (options.withCustomer !== false) {
      // The customer the challenge resolves to already exists, exactly as it
      // would after `APP4-B04` answered the code. The intake path re-resolves
      // it through APP4's own service rather than reading this row directly.
      await db.execute(sql`
        insert into customers (id, display_name, verified_at)
        values (${customerId}, 'APP5 Intake Customer', now())
      `);
      await db.execute(sql`
        insert into customer_contact_points
          (id, customer_id, contact_kind, normalized_value, display_value,
           is_primary, verified_at, verified_source)
        values (${contactPointId}, ${customerId}, 'EMAIL', ${normalized}, ${normalized},
                true, now(), 'OTP')
      `);
    }

    await db.execute(sql`
      insert into contact_verification_challenges
             (id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${challengeId}, 'EMAIL', ${normalized}, ${options.purpose ?? 'SUBMISSION'},
              ${`hash-${challengeId}`}, ${status}, ${expiresAt},
              ${status === 'VERIFIED' ? sql`now()` : sql`null`})
    `);

    return { challengeId, customerId, expiresAt };
  };

  return {
    ...base,
    intake: base.get<RequestAssetIntakeService>(RequestAssetIntakeService),
    status: base.get<RequestAssetStatusService>(RequestAssetStatusService),
    storage,
    seedVerifiedChallenge,
    close: async (): Promise<void> => {
      await base.close();
      for (const [name, value] of previous) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    },
  };
}
