/**
 * The single-pass file reader: signature, size ceiling, checksum, sink.
 *
 * The two properties worth the most here are negative ones — that a rejected
 * upload forwards **nothing** to the sink, and that the hash-only path never
 * creates one at all.
 */
import { createHash } from 'node:crypto';
import { PassThrough, Readable, Writable } from 'node:stream';

import {
  jpegBytes,
  pngBytes,
  randomNonImageBytes,
  svgBytes,
  webpBytes,
} from '../../../../../test/support/synthetic-images';
import { isAssetIntakeError } from '../../domain/asset-intake.errors';
import { MAX_UPLOAD_BYTES } from '../../domain/asset-intake.policy';
import { consumeValidatedFile } from './validated-file.reader';

/** A sink that records what actually reached it. */
function recordingSink(): Writable & { written: () => Buffer } {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  }) as Writable & { written: () => Buffer };
  sink.written = () => Buffer.concat(chunks);
  return sink;
}

/** Streams a buffer in fixed-size chunks so multi-chunk paths are exercised. */
function chunked(bytes: Buffer, chunkSize = 7): Readable {
  let offset = 0;
  return new Readable({
    read() {
      if (offset >= bytes.length) {
        this.push(null);
        return;
      }
      this.push(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function sha256Of(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error: unknown) {
    return isAssetIntakeError(error) ? error.code : `unexpected:${String(error)}`;
  }
  return 'no-error';
}

describe('consumeValidatedFile', () => {
  it.each([
    ['PNG', 'image/png' as const, pngBytes(4096)],
    ['JPEG', 'image/jpeg' as const, jpegBytes(4096)],
    ['WebP', 'image/webp' as const, webpBytes(4096)],
  ])('measures and forwards a %s unchanged', async (_label, declared, bytes) => {
    const sink = recordingSink();
    const result = await consumeValidatedFile({
      source: chunked(bytes),
      declaredMediaType: declared,
      sink,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      mediaType: declared,
      byteSize: bytes.length,
      checksum: sha256Of(bytes),
    });
    expect(sink.written().equals(bytes)).toBe(true);
  });

  it('computes the same checksum with no sink at all', async () => {
    const bytes = pngBytes(2048);
    const result = await consumeValidatedFile({
      source: chunked(bytes),
      declaredMediaType: 'image/png',
      signal: new AbortController().signal,
    });
    expect(result.checksum).toBe(sha256Of(bytes));
    expect(result.byteSize).toBe(bytes.length);
  });

  it('accepts a file of exactly the maximum size', async () => {
    const bytes = pngBytes(MAX_UPLOAD_BYTES);
    expect(bytes.length).toBe(MAX_UPLOAD_BYTES);
    const result = await consumeValidatedFile({
      source: chunked(bytes, 64 * 1024),
      declaredMediaType: 'image/png',
      signal: new AbortController().signal,
    });
    expect(result.byteSize).toBe(MAX_UPLOAD_BYTES);
  });

  it('rejects the first byte above the maximum', async () => {
    const bytes = pngBytes(MAX_UPLOAD_BYTES + 1);
    expect(
      await codeOf(() =>
        consumeValidatedFile({
          source: chunked(bytes, 64 * 1024),
          declaredMediaType: 'image/png',
          signal: new AbortController().signal,
        }),
      ),
    ).toBe('ASSET_UPLOAD_TOO_LARGE');
  });

  it('forwards nothing when the signature does not match', async () => {
    const sink = recordingSink();
    const code = await codeOf(() =>
      consumeValidatedFile({
        source: chunked(jpegBytes(4096)),
        declaredMediaType: 'image/png',
        sink,
        signal: new AbortController().signal,
      }),
    );
    expect(code).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
    // The whole point: a mismatch is decided on the bounded prefix, so no byte
    // ever reaches object storage.
    expect(sink.written().length).toBe(0);
  });

  it('rejects SVG bytes declared as PNG without forwarding them', async () => {
    const sink = recordingSink();
    expect(
      await codeOf(() =>
        consumeValidatedFile({
          source: chunked(svgBytes()),
          declaredMediaType: 'image/png',
          sink,
          signal: new AbortController().signal,
        }),
      ),
    ).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
    expect(sink.written().length).toBe(0);
  });

  it('rejects unrecognised bytes', async () => {
    expect(
      await codeOf(() =>
        consumeValidatedFile({
          source: chunked(randomNonImageBytes(512)),
          declaredMediaType: 'image/jpeg',
          signal: new AbortController().signal,
        }),
      ),
    ).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
  });

  it('rejects a file shorter than a decidable prefix', async () => {
    expect(
      await codeOf(() =>
        consumeValidatedFile({
          source: chunked(Buffer.from([0x89, 0x50])),
          declaredMediaType: 'image/png',
          signal: new AbortController().signal,
        }),
      ),
    ).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
  });

  it('rejects an empty file', async () => {
    expect(
      await codeOf(() =>
        consumeValidatedFile({
          source: Readable.from([]),
          declaredMediaType: 'image/png',
          signal: new AbortController().signal,
        }),
      ),
    ).toBe('ASSET_UPLOAD_SIGNATURE_MISMATCH');
  });

  it('aborts on the deadline signal and destroys both streams', async () => {
    const controller = new AbortController();
    const sink = new PassThrough();
    const source = chunked(pngBytes(1024 * 1024), 1024);
    // Abort after the first chunk has been observed.
    source.once('data', () => controller.abort());

    const code = await codeOf(() =>
      consumeValidatedFile({
        source,
        declaredMediaType: 'image/png',
        sink,
        signal: controller.signal,
      }),
    );
    expect(code).toBe('ASSET_UPLOAD_TIMEOUT');
    expect(source.destroyed).toBe(true);
    expect(sink.destroyed).toBe(true);
  });

  it('destroys the sink when the source errors mid-stream', async () => {
    const sink = new PassThrough();
    const source = new Readable({
      read() {
        this.push(pngBytes(64));
        this.destroy(new Error('client disconnected'));
      },
    });

    await expect(
      consumeValidatedFile({
        source,
        declaredMediaType: 'image/png',
        sink,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('client disconnected');
    // A destroyed sink is what makes `lib-storage` abort its multipart upload
    // rather than completing a truncated object.
    expect(sink.destroyed).toBe(true);
  });
});
