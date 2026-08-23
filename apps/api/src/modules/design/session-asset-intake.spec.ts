/**
 * The Session raster intake contracts (`APP3-B06B`).
 *
 * The cases worth reading twice are the lane ones. The Admin and Session
 * surfaces now share one parser and one reader, so the thing that can silently
 * break is not the streaming — it is a lane value drifting until an anonymous
 * upload lands in the catalog lane, or a 25 MiB body passes the 10 MiB gate.
 * Those are asserted against the shared code paths directly, not inferred from a
 * valid upload working.
 */
import 'reflect-metadata';

import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION,
  ASSET_NORMALIZATION_POLICY_VERSION,
  ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE,
  buildAssetNormalizationRequestedPayload,
} from '@embroidery/domain-types';

import { ADMIN_CATALOG_INTAKE_LANE, type AssetIntakeLane } from '../asset/domain/intake-lane';
import {
  ACCEPTED_MEDIA_TYPES,
  INTAKE_ASSET_KIND,
  INTAKE_CLASSIFICATION,
  MAX_UPLOAD_BYTES,
} from '../asset/domain/asset-intake.policy';
import { openMultipartUpload } from '../asset/infrastructure/http/multipart-upload.parser';
import { consumeValidatedFile } from '../asset/infrastructure/http/validated-file.reader';
import { isAssetIntakeError } from '../asset/domain/asset-intake.errors';
import {
  DESIGN_SESSION_INTAKE_LANE,
  MAX_SESSION_UPLOAD_BYTES,
  SESSION_INTAKE_ASSET_KIND,
  SESSION_INTAKE_CLASSIFICATION,
  SESSION_REVISION_HEADER,
  SESSION_UPLOAD_OPERATION_NAMESPACE,
} from './domain/session-asset-intake.policy';
import {
  decodeSessionCompleted,
  SESSION_UPLOAD_RESULT_SCHEMA_VERSION,
} from './domain/session-upload-result.codec';
import { toSessionAssetView } from './application/session-asset-projection';
import { PublicDesignSessionAssetController } from './presentation/public-design-session-asset.controller';
import { DesignSessionGuard } from './presentation/guards/design-session.guard';
import { sessionUploadMultipartSchema } from './presentation/schemas/session-asset.request';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const GIF = Buffer.from('474946383961' + '00'.repeat(10), 'hex');
const BOUNDARY = 'b06bboundary';

/** One multipart body, assembled by hand so part order is under test control. */
function multipart(
  parts: readonly { name: string; filename?: string; type?: string; body: Buffer }[],
) {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      part.filename === undefined
        ? `form-data; name="${part.name}"`
        : `form-data; name="${part.name}"; filename="${part.filename}"`;
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n` +
          (part.type === undefined ? '' : `Content-Type: ${part.type}\r\n`) +
          '\r\n',
      ),
      part.body,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

function request(body: Buffer): IncomingMessage {
  const stream = Readable.from([body]) as unknown as IncomingMessage;
  (stream as { headers: Record<string, string> }).headers = {
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
  };
  return stream;
}

async function open(body: Buffer, lane: AssetIntakeLane) {
  return openMultipartUpload(request(body), new AbortController().signal, lane);
}

/**
 * Captures a rejection as a value.
 *
 * `expect(...).rejects` leaves the rejected promise attached for a tick, and a
 * parser teardown can emit a second failure into it — which surfaces as an
 * unhandled rejection that kills the worker instead of failing the test.
 */
async function refusal(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

describe('the Session intake lane', () => {
  it('is a guest upload, private, and never catalog media', () => {
    expect(SESSION_INTAKE_ASSET_KIND).toBe('CUSTOMER_UPLOAD');
    expect(SESSION_INTAKE_CLASSIFICATION).toBe('CUSTOMER_PRIVATE');
    expect(DESIGN_SESSION_INTAKE_LANE.assetKind).not.toBe(INTAKE_ASSET_KIND);
    expect(DESIGN_SESSION_INTAKE_LANE.classification).not.toBe(INTAKE_CLASSIFICATION);
  });

  it('caps an anonymous upload at 10 MiB, below the Admin ceiling', () => {
    expect(MAX_SESSION_UPLOAD_BYTES).toBe(10_485_760);
    expect(MAX_SESSION_UPLOAD_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(DESIGN_SESSION_INTAKE_LANE.maxUploadBytes).toBe(MAX_SESSION_UPLOAD_BYTES);
  });

  it('claims its own idempotency namespace, so a key cannot cross lanes', () => {
    expect(SESSION_UPLOAD_OPERATION_NAMESPACE).not.toBe(
      ADMIN_CATALOG_INTAKE_LANE.operationNamespace,
    );
  });

  it('leaves the Admin lane exactly as APP2-B01 shipped it', () => {
    expect(ADMIN_CATALOG_INTAKE_LANE).toEqual({
      assetKind: INTAKE_ASSET_KIND,
      classification: INTAKE_CLASSIFICATION,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      operationNamespace: 'admin.asset.upload',
      declaresMetadataFields: true,
      // `APP7-B05` widened the lane contract with `credentialFields`, for the
      // one surface whose credential has to travel in the multipart body. The
      // Admin lane declares none, so its behaviour is unchanged — and stating
      // the empty array keeps this an exhaustive shape assertion, which is what
      // would catch a credential field appearing on the Admin upload.
      credentialFields: [],
    });
  });

  it('accepts only the three raster types', () => {
    expect([...ACCEPTED_MEDIA_TYPES]).toEqual(['image/png', 'image/jpeg', 'image/webp']);
    expect(ACCEPTED_MEDIA_TYPES).not.toContain('image/svg+xml');
    expect(ACCEPTED_MEDIA_TYPES).not.toContain('image/gif');
    expect(ACCEPTED_MEDIA_TYPES).not.toContain('application/octet-stream');
  });
});

describe('the Session multipart shape', () => {
  it('accepts a body that is one file part and nothing else', async () => {
    const opened = await open(
      multipart([{ name: 'file', filename: 'a.png', type: 'image/png', body: PNG }]),
      DESIGN_SESSION_INTAKE_LANE,
    );
    expect(opened.declaredMediaType).toBe('image/png');
  });

  it('refuses the Admin metadata fields, which this lane does not have', async () => {
    const error = await refusal(() =>
      open(
        multipart([
          { name: 'assetKind', body: Buffer.from('CUSTOMER_UPLOAD') },
          { name: 'file', filename: 'a.png', type: 'image/png', body: PNG },
        ]),
        DESIGN_SESSION_INTAKE_LANE,
      ),
    );
    expect(isAssetIntakeError(error)).toBe(true);
  });

  it('refuses a second file part', async () => {
    const opened = await open(
      multipart([
        { name: 'file', filename: 'a.png', type: 'image/png', body: PNG },
        { name: 'file', filename: 'b.png', type: 'image/png', body: PNG },
      ]),
      DESIGN_SESSION_INTAKE_LANE,
    );
    opened.stream.resume();
    expect(isAssetIntakeError(await refusal(() => opened.finish()))).toBe(true);
  });

  it('still requires the Admin lane to send its fields before the file', async () => {
    const error = await refusal(() =>
      open(
        multipart([{ name: 'file', filename: 'a.png', type: 'image/png', body: PNG }]),
        ADMIN_CATALOG_INTAKE_LANE,
      ),
    );
    expect(isAssetIntakeError(error)).toBe(true);
  });
});

describe('the streaming byte ceiling', () => {
  const consume = (bytes: Buffer, maxBytes: number) =>
    consumeValidatedFile({
      source: Readable.from([bytes]),
      declaredMediaType: 'image/png',
      signal: new AbortController().signal,
      maxBytes,
    });

  it('accepts a file exactly at the limit', async () => {
    const at = Buffer.concat([PNG, Buffer.alloc(64 - PNG.length)]);
    await expect(consume(at, 64)).resolves.toMatchObject({ byteSize: 64 });
  });

  it('aborts as soon as the counter passes the limit', async () => {
    const over = Buffer.concat([PNG, Buffer.alloc(65 - PNG.length)]);
    expect(isAssetIntakeError(await refusal(() => consume(over, 64)))).toBe(true);
  });

  it('refuses a GIF declared as PNG — the signature decides, not the header', async () => {
    expect(isAssetIntakeError(await refusal(() => consume(GIF, MAX_SESSION_UPLOAD_BYTES)))).toBe(
      true,
    );
  });

  it('defaults to the Admin ceiling when no lane limit is given', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(4096)]);
    await expect(
      consumeValidatedFile({
        source: Readable.from([big]),
        declaredMediaType: 'image/png',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ mediaType: 'image/png' });
  });
});

describe('the normalization event', () => {
  it('is the exact shared contract, addressed by the association', () => {
    const payload = buildAssetNormalizationRequestedPayload({
      assetId: 'asset-1',
      associationRef: { kind: 'DESIGN_SESSION_ASSET', designSessionAssetId: 'dsa-1' },
    });
    expect(ASSET_NORMALIZATION_REQUESTED_EVENT_TYPE).toBe('asset.normalization.requested');
    expect(payload.schemaVersion).toBe(ASSET_NORMALIZATION_EVENT_SCHEMA_VERSION);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.normalizationPolicyVersion).toBe(ASSET_NORMALIZATION_POLICY_VERSION);
    expect(payload.normalizationPolicyVersion).toBe(1);
    expect(payload.associationRef).toEqual({
      kind: 'DESIGN_SESSION_ASSET',
      designSessionAssetId: 'dsa-1',
    });
  });

  it('carries no object key, profile, session or secret', () => {
    const payload = buildAssetNormalizationRequestedPayload({
      assetId: 'asset-1',
      associationRef: { kind: 'DESIGN_SESSION_ASSET', designSessionAssetId: 'dsa-1' },
    });
    expect(Object.keys(payload).sort()).toEqual([
      'assetId',
      'associationRef',
      'normalizationPolicyVersion',
      'schemaVersion',
    ]);
  });
});

describe('the stored result and the response', () => {
  const completed = {
    schemaVersion: SESSION_UPLOAD_RESULT_SCHEMA_VERSION,
    kind: 'DESIGN_SESSION_UPLOAD_COMPLETED',
    assetId: 'asset-1',
    sessionId: 'session-1',
    bucketAlias: 'ORIGINALS',
    objectKey: 'originals/dev/asset-1.png',
    designSessionAssetId: 'dsa-1',
    sessionRevision: 4,
    mediaType: 'image/png',
    byteSize: 128,
    checksum: `sha256:${'0'.repeat(64)}`,
    contentFingerprint: 'fp-1',
    inspectionEventId: '11',
    normalizationEventId: '12',
  };

  it('round-trips and refuses an unknown field', () => {
    expect(decodeSessionCompleted(completed).designSessionAssetId).toBe('dsa-1');
    expect(() => decodeSessionCompleted({ ...completed, extra: 1 })).toThrow();
  });

  it('answers with the association and revision, and nothing private', () => {
    const view = toSessionAssetView(decodeSessionCompleted(completed));
    expect(view).toEqual({
      assetId: 'asset-1',
      designSessionAssetId: 'dsa-1',
      sessionRevision: 4,
      assetStatus: 'INSPECTING',
      mediaType: 'image/png',
      byteSize: 128,
    });
    const serialized = JSON.stringify(view);
    for (const leak of ['originals/', 'objectKey', 'checksum', 'contentFingerprint', 'secret']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('never claims inspection or normalization succeeded', () => {
    expect(toSessionAssetView(decodeSessionCompleted(completed)).assetStatus).toBe('INSPECTING');
  });
});

describe('the published operation', () => {
  it('is exactly one route, guarded by the B06A guard', () => {
    const handler = Object.getOwnPropertyDescriptor(
      PublicDesignSessionAssetController.prototype,
      'create',
    )?.value as object;
    const guards = Reflect.getMetadata('__guards__', handler) as unknown[];
    expect(guards).toContain(DesignSessionGuard);

    const path: unknown = Reflect.getMetadata('path', handler);
    expect(path).toBe(':sessionId/assets');
    const names = Object.getOwnPropertyNames(PublicDesignSessionAssetController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(names).toEqual(['create']);
  });

  it('takes the raw request, so nothing buffers the upload', () => {
    // A bound @Body() would make Nest read the whole 10 MiB before the handler
    // ran — the one thing the streaming design exists to prevent.
    const paramtypes = Reflect.getMetadata(
      'design:paramtypes',
      PublicDesignSessionAssetController.prototype,
      'create',
    ) as unknown[];
    expect(paramtypes.length).toBe(2);
  });

  it('publishes one concrete binary part and no metadata fields', () => {
    const schema = sessionUploadMultipartSchema();
    expect(schema.required).toEqual(['file']);
    expect(Object.keys(schema.properties ?? {})).toEqual(['file']);
    expect(schema.properties?.['file']).toMatchObject({ type: 'string', format: 'binary' });
  });

  it('names the revision header in lower case, as Node delivers it', () => {
    expect(SESSION_REVISION_HEADER).toBe(SESSION_REVISION_HEADER.toLowerCase());
  });
});
