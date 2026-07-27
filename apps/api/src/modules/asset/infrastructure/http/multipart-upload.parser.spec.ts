/**
 * The multipart shape contract.
 *
 * Every case builds a real multipart body and feeds it through a real
 * `IncomingMessage`-shaped stream, because the ordering rule this parser
 * enforces is a property of the byte stream, not of a mocked event sequence.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';

import { pngBytes } from '../../../../../test/support/synthetic-images';
import { isAssetIntakeError } from '../../domain/asset-intake.errors';
import { openMultipartUpload } from './multipart-upload.parser';

const BOUNDARY = 'test-boundary-0123456789';

interface BodyPart {
  readonly name: string;
  readonly value?: string;
  readonly filename?: string;
  readonly contentType?: string;
  readonly bytes?: Buffer;
}

function buildBody(parts: readonly BodyPart[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      part.filename === undefined
        ? `form-data; name="${part.name}"`
        : `form-data; name="${part.name}"; filename="${part.filename}"`;
    const headers =
      part.contentType === undefined
        ? `Content-Disposition: ${disposition}\r\n\r\n`
        : `Content-Disposition: ${disposition}\r\nContent-Type: ${part.contentType}\r\n\r\n`;
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n${headers}`, 'utf8'));
    chunks.push(part.bytes ?? Buffer.from(part.value ?? '', 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

/** A minimal request: a readable body plus the headers Busboy inspects. */
function requestOf(body: Buffer, contentType = `multipart/form-data; boundary=${BOUNDARY}`) {
  const stream = Readable.from([body]) as unknown as IncomingMessage;
  (stream as unknown as { headers: Record<string, string> }).headers = {
    'content-type': contentType,
  };
  return stream;
}

const METADATA: readonly BodyPart[] = [
  { name: 'assetKind', value: 'CATALOG_MEDIA' },
  { name: 'classification', value: 'PRODUCTION_SENSITIVE' },
];

const FILE_PART: BodyPart = {
  name: 'file',
  filename: 'logo.png',
  contentType: 'image/png',
  bytes: pngBytes(256),
};

async function openWith(parts: readonly BodyPart[], contentType?: string) {
  const request = requestOf(buildBody(parts), contentType);
  return openMultipartUpload(request, new AbortController().signal);
}

async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error: unknown) {
    return isAssetIntakeError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return 'no-error';
}

/** Drains a file stream and returns the bytes, as the reader would. */
async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

describe('openMultipartUpload', () => {
  it('resolves at the file part with the declared metadata', async () => {
    const opened = await openWith([...METADATA, FILE_PART]);
    expect(opened.declaredMediaType).toBe('image/png');
    expect(opened.rawFilename).toBe('logo.png');

    const bytes = await drain(opened.stream);
    await opened.finish();
    expect(bytes.equals(FILE_PART.bytes as Buffer)).toBe(true);
  });

  it('resolves before the file stream is read, so the claim can commit first', async () => {
    const opened = await openWith([...METADATA, FILE_PART]);
    // The parser hands back an unread stream; this is the window in which the
    // durable allocation is written.
    expect(opened.stream.readableEnded).toBe(false);
    await drain(opened.stream);
    await opened.finish();
  });

  it('rejects a file part that arrives before the metadata', async () => {
    expect(await codeOf(() => openWith([FILE_PART, ...METADATA]))).toBe(
      'ASSET_UPLOAD_METADATA_INVALID',
    );
  });

  it('rejects a file part that arrives after only one metadata field', async () => {
    expect(await codeOf(() => openWith([METADATA[0] as BodyPart, FILE_PART]))).toBe(
      'ASSET_UPLOAD_METADATA_INVALID',
    );
  });

  it.each([
    ['a duplicate field', [...METADATA, METADATA[0] as BodyPart, FILE_PART]],
    ['an unexpected field', [...METADATA, { name: 'ownerEmail', value: 'x@y.test' }, FILE_PART]],
    [
      'a wrong fixed assetKind',
      [{ name: 'assetKind', value: 'GALLERY_MEDIA' }, METADATA[1] as BodyPart, FILE_PART],
    ],
    [
      'a client-selected classification',
      [METADATA[0] as BodyPart, { name: 'classification', value: 'PUBLIC' }, FILE_PART],
    ],
    ['an oversized field value', [...METADATA, { name: 'assetKind', value: 'x'.repeat(200) }]],
  ])('rejects %s', async (_label, parts) => {
    expect(await codeOf(() => openWith(parts as readonly BodyPart[]))).toBe(
      'ASSET_UPLOAD_METADATA_INVALID',
    );
  });

  it('rejects a body with no file part', async () => {
    expect(await codeOf(() => openWith([...METADATA]))).toBe('ASSET_UPLOAD_INVALID_MULTIPART');
  });

  it('rejects a file part under an unexpected name', async () => {
    expect(await codeOf(() => openWith([...METADATA, { ...FILE_PART, name: 'attachment' }]))).toBe(
      'ASSET_UPLOAD_INVALID_MULTIPART',
    );
  });

  it('rejects a second file part through finish()', async () => {
    const opened = await openWith([...METADATA, FILE_PART, { ...FILE_PART, filename: 'two.png' }]);
    await drain(opened.stream);
    // The first file already resolved, so the violation surfaces where the
    // caller waits for the body to be fully parsed — before Tx A runs.
    expect(await codeOf(() => opened.finish())).toBe('ASSET_UPLOAD_INVALID_MULTIPART');
  });

  it('rejects a field that arrives after the file part', async () => {
    const opened = await openWith([...METADATA, FILE_PART, { name: 'assetKind', value: 'X' }]);
    await drain(opened.stream);
    expect(await codeOf(() => opened.finish())).toBe('ASSET_UPLOAD_INVALID_MULTIPART');
  });

  it.each([
    ['a JSON content type', 'application/json'],
    ['a missing boundary', 'multipart/form-data'],
    ['no content type at all', ''],
  ])('rejects %s', async (_label, contentType) => {
    expect(await codeOf(() => openWith([...METADATA, FILE_PART], contentType))).toBe(
      'ASSET_UPLOAD_INVALID_MULTIPART',
    );
  });

  it('propagates an external abort as the timeout error', async () => {
    const controller = new AbortController();
    const request = requestOf(buildBody([...METADATA, FILE_PART]));
    const opening = openMultipartUpload(request, controller.signal);
    controller.abort();
    expect(await codeOf(() => opening)).toBe('ASSET_UPLOAD_TIMEOUT');
  });
});
