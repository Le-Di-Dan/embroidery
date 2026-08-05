/**
 * Template SVG derivative production (`APP3-W01B`).
 *
 * Docker-free but not sanitizer-free: the real jsdom and the real DOMPurify run,
 * because the behaviour under test *is* the parser's. What is substituted is
 * only the object store, so the assertions can be about the bytes that actually
 * reached it.
 *
 * The quartet is the recurring subject. `width_px` and `height_px` must come
 * from the canonical `viewBox`, the checksum and byte size from the written
 * stream, and the media type from the frozen policy — four independent
 * observations of the object that now exists, never a restatement of the source
 * row (IMP-D044 PO-07, PO-12).
 */
import { createHash } from 'node:crypto';

import { InMemoryObjectStorage } from '../../asset-inspection/tests/in-memory-object-storage';
import { checksumOf } from '../../asset-inspection/tests/image-fixtures';
import type { NormalizationSourceFacts } from '../domain/repositories/asset-normalization.repository';
import { TEMPLATE_SVG_SANITIZATION_POLICY_VERSION } from '../domain/svg/template-svg-policy';
import { NORMALIZATION_POLICY_VERSION } from '../domain/normalization-policy';
import { TemplateSvgNormalizationService } from './template-svg-normalization.service';

const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const NS = 'http://www.w3.org/2000/svg';

const VALID = Buffer.from(
  `<svg xmlns="${NS}" viewBox="0 0 320 240"><g transform="translate(1,2)">` +
    '<path d="M0 0L10 10Z" fill="#F00"/></g></svg>',
  'utf8',
);

function facts(
  bytes: Buffer,
  overrides: Partial<NormalizationSourceFacts> = {},
): NormalizationSourceFacts {
  return {
    assetId: ASSET,
    storageKey: `test/originals/${ASSET}/original.svg`,
    mediaType: 'image/svg+xml',
    byteSize: BigInt(bytes.length),
    checksum: checksumOf(bytes),
    status: 'ACCEPTED',
    kind: 'TEMPLATE_SOURCE',
    classification: 'PRODUCTION_SENSITIVE',
    deleted: false,
    ...overrides,
  };
}

function build(bytes?: Buffer, source?: NormalizationSourceFacts) {
  const storage = new InMemoryObjectStorage();
  const service = new TemplateSvgNormalizationService(storage, 'test');
  if (bytes !== undefined && source !== undefined) {
    storage.put('ORIGINALS', source.storageKey, bytes, source.mediaType);
  }
  return { storage, service };
}

const codeOf = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

const signal = (): AbortSignal => new AbortController().signal;

describe('policy binding', () => {
  const { service } = build();

  it('is the event policy version, so producer and consumer cannot drift', () => {
    expect(TEMPLATE_SVG_SANITIZATION_POLICY_VERSION).toBe(NORMALIZATION_POLICY_VERSION);
    expect(TEMPLATE_SVG_SANITIZATION_POLICY_VERSION).toBe(1);
  });

  it('accepts the implemented version', () => {
    expect(() => {
      service.assertPolicyVersion(TEMPLATE_SVG_SANITIZATION_POLICY_VERSION);
    }).not.toThrow();
  });

  it.each([0, 2, 99, -1])('refuses version %s before any byte is read', (version) => {
    // No object was seeded, so if this reached the store the read would fail
    // with a different code. Reaching the assertion first is the assertion.
    let code = 'NO_ERROR';
    try {
      service.assertPolicyVersion(version);
    } catch (error: unknown) {
      code = (error as { code?: string }).code ?? 'NO_CODE';
    }
    expect(code).toBe('TEMPLATE_SVG_POLICY_VERSION_UNSUPPORTED');
  });
});

describe('the derivative key', () => {
  it('is deterministic, under the asset prefix, and carries the svg extension', () => {
    const { service } = build();
    expect(service.derivativeKey(ASSET)).toBe(`test/derivatives/${ASSET}/NORMALIZED.svg`);
    expect(service.derivativeKey(ASSET)).toBe(service.derivativeKey(ASSET));
  });
});

describe('source integrity', () => {
  it('refuses a source with no recorded checksum', async () => {
    const source = facts(VALID, { checksum: null });
    const { service } = build(VALID, source);
    expect(await codeOf(() => service.produce(source, signal()))).toBe(
      'NORMALIZATION_SOURCE_INTEGRITY_MISMATCH',
    );
  });

  it('refuses when the stored bytes do not match the recorded digest', async () => {
    const source = facts(VALID, { checksum: checksumOf(Buffer.from('different', 'utf8')) });
    const { service } = build(VALID, source);
    expect(await codeOf(() => service.produce(source, signal()))).toBe(
      'NORMALIZATION_SOURCE_INTEGRITY_MISMATCH',
    );
  });

  it('refuses when the object is longer than the row claims', async () => {
    const source = facts(VALID, { byteSize: BigInt(VALID.length - 5) });
    const { service } = build(VALID, source);
    expect(await codeOf(() => service.produce(source, signal()))).toBe(
      'NORMALIZATION_SOURCE_INTEGRITY_MISMATCH',
    );
  });

  it('refuses a recorded size past the policy ceiling before opening the object', async () => {
    const source = facts(VALID, { byteSize: BigInt(1024 * 1024 + 1) });
    const { service } = build();
    expect(await codeOf(() => service.produce(source, signal()))).toBe(
      'NORMALIZATION_SOURCE_TOO_LARGE',
    );
  });

  it('writes nothing when the source is refused', async () => {
    const source = facts(VALID, { checksum: null });
    const { service, storage } = build(VALID, source);
    await codeOf(() => service.produce(source, signal()));
    expect(storage.read('DERIVATIVES', service.derivativeKey(ASSET))).toBeUndefined();
  });
});

describe('production', () => {
  it('writes the sanitized bytes and reports the measured quartet', async () => {
    const source = facts(VALID);
    const { service, storage } = build(VALID, source);

    const output = await service.produce(source, signal());
    const written = storage.read('DERIVATIVES', output.storageKey);

    expect(written).toBeDefined();
    expect(output.mediaType).toBe('image/svg+xml');
    expect(output.widthPx).toBe(320);
    expect(output.heightPx).toBe(240);
    expect(output.byteSize).toBe(BigInt((written as Buffer).length));
    expect(output.checksum).toBe(
      `sha256:${createHash('sha256')
        .update(written as Buffer)
        .digest('hex')}`,
    );
  });

  it('writes the canonical form, not the source bytes', async () => {
    const source = facts(VALID);
    const { service, storage } = build(VALID, source);
    const output = await service.produce(source, signal());
    const written = storage.read('DERIVATIVES', output.storageKey) as Buffer;

    expect(written.equals(VALID)).toBe(false);
    expect(written.toString('utf8')).toBe(
      `<svg xmlns="${NS}" viewBox="0 0 320 240"><g transform="translate(1 2)">` +
        '<path d="M0 0L10 10Z" fill="#ff0000"/></g></svg>',
    );
  });

  it('takes the dimensions from the viewBox, never from a root width or height', async () => {
    const withHint = Buffer.from(
      `<svg xmlns="${NS}" viewBox="0 0 320 240" width="99" height="99"><path d="M0 0Z"/></svg>`,
      'utf8',
    );
    const source = facts(withHint);
    const { service } = build(withHint, source);
    // A root `width`/`height` is not in the allowed root set at all, so the file
    // is refused rather than measured from the hint.
    expect(await codeOf(() => service.produce(source, signal()))).toBe(
      'UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG',
    );
  });

  it('refuses an unsafe file with one stable code and writes nothing', async () => {
    const unsafe = Buffer.from(
      `<svg xmlns="${NS}" viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
      'utf8',
    );
    const source = facts(unsafe);
    const { service, storage } = build(unsafe, source);

    expect(await codeOf(() => service.produce(source, signal()))).toBe(
      'UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG',
    );
    expect(storage.read('DERIVATIVES', service.derivativeKey(ASSET))).toBeUndefined();
  });

  it('produces byte-identical objects across repeated runs', async () => {
    const source = facts(VALID);
    const digests = new Set<string>();
    for (let run = 0; run < 5; run += 1) {
      const { service, storage } = build(VALID, source);
      const output = await service.produce(source, signal());
      digests.add(output.checksum);
      expect(storage.read('DERIVATIVES', output.storageKey)).toBeDefined();
    }
    expect(digests.size).toBe(1);
  });
});
