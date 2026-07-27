/**
 * A pass-through that measures a stream without holding it (APP2-W01 §8).
 *
 * Bytes are counted and hashed as they flow and are then forwarded unchanged.
 * Nothing accumulates: the only state is a 32-byte digest context and an
 * integer, so a 25 MiB original and a 40-megapixel preview cost the same
 * JavaScript memory as an empty one.
 *
 * `maxBytes` is a hard stop, not a warning. It exists so a source that is
 * longer than the size the database recorded is abandoned mid-stream rather
 * than read to the end just to discover it disagreed.
 */
import { createHash, type Hash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

export const SHA256_PREFIX = 'sha256:';

export class ByteLimitExceededError extends Error {
  constructor(limit: number) {
    super(`Stream exceeded its ${String(limit)}-byte limit.`);
    this.name = 'ByteLimitExceededError';
  }
}

export interface DigestCounterOptions {
  /** Abort once this many bytes have been seen. Omit for no limit. */
  readonly maxBytes?: number;
}

export class DigestCounterStream extends Transform {
  private readonly hash: Hash = createHash('sha256');
  private readonly maxBytes: number | undefined;
  private bytes = 0;

  constructor(options: DigestCounterOptions = {}) {
    super();
    this.maxBytes = options.maxBytes;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.maxBytes !== undefined && this.bytes > this.maxBytes) {
      done(new ByteLimitExceededError(this.maxBytes));
      return;
    }
    this.hash.update(chunk);
    done(null, chunk);
  }

  get byteSize(): number {
    return this.bytes;
  }

  /** `sha256:<64 lowercase hex>` — the repository's canonical checksum format. */
  digest(): string {
    return `${SHA256_PREFIX}${this.hash.copy().digest('hex')}`;
  }
}
