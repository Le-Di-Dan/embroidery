/**
 * The one place file bytes are read (`APP2-B01` §10/§14).
 *
 * Four things happen in a single pass over the stream, because reading it twice
 * is not an option: the signature is checked on a bounded prefix, the byte
 * count is enforced incrementally, the SHA-256 is computed, and the bytes are
 * forwarded to a sink — or to nothing at all.
 *
 * That "or nothing at all" is the completed-replay path. It runs every
 * validation and produces a real content fingerprint while writing **zero**
 * objects, which is what makes a replay content-complete rather than a
 * metadata-only rubber stamp.
 *
 * Nothing here buffers the whole file. The only retained buffer is the
 * 12-byte signature prefix, and it is released into the sink as soon as the
 * signature is confirmed.
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Readable, Writable } from 'node:stream';

import { assetIntakeError, AssetIntakeError } from '../../domain/asset-intake.errors';
import { MAX_UPLOAD_BYTES, type AcceptedMediaType } from '../../domain/asset-intake.policy';
import { SHA256_PREFIX } from '../../domain/canonical-json';
import { assertSignatureMatches, SIGNATURE_PREFIX_BYTES } from '../../domain/media-signature';

export interface ConsumedFile {
  /** The validated type. Equal to the declared type or the read has failed. */
  readonly mediaType: AcceptedMediaType;
  readonly byteSize: number;
  /** Server-computed, `sha256:<64 lowercase hex>`. The only authority. */
  readonly checksum: string;
}

export interface ConsumeFileInput {
  readonly source: Readable;
  readonly declaredMediaType: AcceptedMediaType;
  /** Absent for the hash-only replay path — then nothing is written anywhere. */
  readonly sink?: Writable | undefined;
  readonly signal: AbortSignal;
}

/** Honours backpressure so a slow object-store upload cannot balloon memory. */
async function writeChunk(sink: Writable, chunk: Buffer): Promise<void> {
  if (!sink.write(chunk)) {
    await once(sink, 'drain');
  }
}

function abortError(signal: AbortSignal): AssetIntakeError {
  return signal.reason instanceof AssetIntakeError
    ? signal.reason
    : assetIntakeError('ASSET_UPLOAD_TIMEOUT');
}

export async function consumeValidatedFile(input: ConsumeFileInput): Promise<ConsumedFile> {
  const { source, declaredMediaType, sink, signal } = input;
  const hash = createHash('sha256');

  let byteSize = 0;
  let prefix: Buffer = Buffer.alloc(0);
  let signatureChecked = false;
  let mediaType: AcceptedMediaType | undefined;

  const flushPrefix = async (): Promise<void> => {
    mediaType = assertSignatureMatches(declaredMediaType, prefix);
    signatureChecked = true;
    if (sink !== undefined && prefix.length > 0) {
      await writeChunk(sink, prefix);
    }
    prefix = Buffer.alloc(0);
  };

  // The per-chunk check below only fires when a chunk arrives. A client that
  // stops sending mid-body produces no chunks at all, so without this listener
  // the loop would wait forever and the deadline would never take effect.
  const onAbort = (): void => {
    source.destroy(abortError(signal));
  };
  if (signal.aborted) {
    throw abortError(signal);
  }
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    for await (const raw of source) {
      if (signal.aborted) {
        throw abortError(signal);
      }
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
      byteSize += chunk.length;
      // Checked before anything else touches the chunk: the moment the counter
      // passes the limit the request is over, and no further byte may be
      // hashed, buffered or forwarded to storage.
      if (byteSize > MAX_UPLOAD_BYTES) {
        throw assetIntakeError('ASSET_UPLOAD_TOO_LARGE');
      }
      hash.update(chunk);

      if (!signatureChecked) {
        prefix = Buffer.concat([prefix, chunk]);
        if (prefix.length < SIGNATURE_PREFIX_BYTES) {
          // Still short of a decidable prefix; nothing has been forwarded yet,
          // so a mismatch discovered on the next chunk still writes no object.
          continue;
        }
        await flushPrefix();
        continue;
      }

      if (sink !== undefined) {
        await writeChunk(sink, chunk);
      }
    }

    if (!signatureChecked) {
      // The whole file was shorter than a full signature prefix. It is still
      // decidable — PNG needs 8 bytes, JPEG 3 — and undecidable means rejected.
      await flushPrefix();
    }
    if (byteSize === 0) {
      // `ck_assets__size_bytes_positive` would refuse the row anyway; failing
      // here keeps an empty upload from ever reaching object storage.
      throw assetIntakeError('ASSET_UPLOAD_SIGNATURE_MISMATCH');
    }

    sink?.end();
  } catch (error: unknown) {
    // Destroying the source stops Busboy pulling from the socket, and
    // destroying the sink **with an error** makes `lib-storage` abort its
    // multipart upload instead of completing a truncated object. Destroying it
    // without one would look like a clean end-of-stream, which is exactly the
    // silent-corruption case this path exists to prevent.
    source.destroy();
    if (sink !== undefined) {
      // A stream destroyed with an error emits `error`; an unhandled one would
      // take the process down. The failure is reported by the throw below, so
      // this listener only has to stop the emit from being fatal.
      sink.on('error', () => undefined);
      sink.destroy(error instanceof Error ? error : new Error('upload aborted'));
    }
    // A destroyed source surfaces as its own stream error; report the abort
    // reason instead, so the caller sees the deadline rather than a generic
    // "premature close".
    throw signal.aborted ? abortError(signal) : error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }

  if (mediaType === undefined) {
    throw assetIntakeError('ASSET_UPLOAD_SIGNATURE_MISMATCH');
  }

  return {
    mediaType,
    byteSize,
    checksum: `${SHA256_PREFIX}${hash.digest('hex')}`,
  };
}
