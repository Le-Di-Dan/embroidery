import { createHash, randomBytes } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { ByteLimitExceededError, DigestCounterStream } from './digest-counter.stream';

function discard(): Writable {
  return new Writable({
    write(_chunk, _encoding, done): void {
      done();
    },
  });
}

describe('DigestCounterStream', () => {
  it('counts and hashes without changing the bytes', async () => {
    const payload = randomBytes(50_000);
    const counter = new DigestCounterStream();
    const seen: Buffer[] = [];

    await pipeline(
      Readable.from([payload]),
      counter,
      new Writable({
        write(chunk: Buffer, _encoding, done): void {
          seen.push(chunk);
          done();
        },
      }),
    );

    expect(counter.byteSize).toBe(payload.length);
    expect(counter.digest()).toBe(`sha256:${createHash('sha256').update(payload).digest('hex')}`);
    expect(Buffer.concat(seen).equals(payload)).toBe(true);
  });

  it('produces the same digest across many chunks as in one', async () => {
    const payload = randomBytes(32_768);
    const chunks = [
      payload.subarray(0, 100),
      payload.subarray(100, 9_000),
      payload.subarray(9_000),
    ];
    const counter = new DigestCounterStream();

    await pipeline(Readable.from(chunks), counter, discard());

    expect(counter.digest()).toBe(`sha256:${createHash('sha256').update(payload).digest('hex')}`);
  });

  it('reports the canonical checksum format', async () => {
    const counter = new DigestCounterStream();

    await pipeline(Readable.from([Buffer.from('x')]), counter, discard());

    expect(counter.digest()).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('can be read more than once without changing', async () => {
    const counter = new DigestCounterStream();

    await pipeline(Readable.from([Buffer.from('stable')]), counter, discard());

    expect(counter.digest()).toBe(counter.digest());
  });

  it('aborts the moment a stream passes its byte limit', async () => {
    const counter = new DigestCounterStream({ maxBytes: 1_000 });

    await expect(
      pipeline(Readable.from([randomBytes(4_000)]), counter, discard()),
    ).rejects.toBeInstanceOf(ByteLimitExceededError);
  });

  it('accepts a stream exactly at its limit', async () => {
    const counter = new DigestCounterStream({ maxBytes: 2_048 });

    await pipeline(Readable.from([randomBytes(2_048)]), counter, discard());

    expect(counter.byteSize).toBe(2_048);
  });

  it('holds no bytes of its own', async () => {
    // Ten megabytes through a counter whose only state is a digest context and
    // an integer. If it ever started buffering, this is where it would show.
    const counter = new DigestCounterStream();
    const chunk = randomBytes(1_048_576);

    await pipeline(Readable.from(Array.from({ length: 10 }, () => chunk)), counter, discard());

    expect(counter.byteSize).toBe(10 * 1_048_576);
  });
});
