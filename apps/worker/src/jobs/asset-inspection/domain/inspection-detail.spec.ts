import sharp from 'sharp';

import { decodeInspectionDetail } from './inspection-detail.codec';
import {
  IMAGE_PROCESSOR_VERSION,
  MAX_INSPECTION_DETAIL_BYTES,
  buildAcceptedDetail,
  buildRejectedDetail,
  encodeInspectionDetail,
  type InspectedDerivative,
  type InspectedSource,
} from './inspection-detail';

const SOURCE: InspectedSource = {
  mediaType: 'image/png',
  format: 'png',
  byteSize: 43_120,
  checksum: `sha256:${'a'.repeat(64)}`,
  width: 1200,
  height: 800,
  orientedWidth: 1200,
  orientedHeight: 800,
  channels: 4,
  pages: 1,
};

const DERIVATIVES: InspectedDerivative[] = [
  {
    kind: 'THUMBNAIL',
    mediaType: 'image/webp',
    width: 480,
    height: 320,
    byteSize: 3_912,
    checksum: `sha256:${'b'.repeat(64)}`,
    isWatermarked: false,
  },
  {
    kind: 'CATALOG_PREVIEW',
    mediaType: 'image/webp',
    width: 1200,
    height: 800,
    byteSize: 41_002,
    checksum: `sha256:${'c'.repeat(64)}`,
    isWatermarked: false,
  },
];

function accepted(): string {
  return encodeInspectionDetail(buildAcceptedDetail({ source: SOURCE, derivatives: DERIVATIVES }));
}

describe('inspection detail V1 — accepted', () => {
  it('records the policy, the processor and both derivatives', () => {
    expect(JSON.parse(accepted())).toEqual({
      schemaVersion: 1,
      policyVersion: 1,
      processor: { name: 'sharp', version: IMAGE_PROCESSOR_VERSION },
      result: 'ACCEPTED',
      source: SOURCE,
      derivatives: DERIVATIVES,
    });
  });

  it('pins the processor version to the installed native module', () => {
    // The version is a domain constant so the domain layer never imports the
    // native module. This is the assertion that keeps the two in step: an
    // upgrade that changes encoder behaviour cannot land without also updating
    // the value recorded next to the bytes it produced.
    expect(IMAGE_PROCESSOR_VERSION).toBe(sharp.versions.sharp);
    expect(IMAGE_PROCESSOR_VERSION).toBe('0.35.3');
  });

  it('round-trips through the decoder', () => {
    const decoded = decodeInspectionDetail(accepted());

    expect(decoded?.result).toBe('ACCEPTED');
    expect(decoded).toEqual(JSON.parse(accepted()));
  });

  it('contains no filename, key, bucket, stack or raw metadata', () => {
    const encoded = accepted();

    for (const forbidden of [
      'originals',
      'derivatives/',
      '.png',
      'Error',
      'at Object',
      'exif',
      'icc',
      'Content-Type',
      'cookie',
    ]) {
      expect(encoded.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('stays far inside the 8 KiB bound', () => {
    expect(Buffer.byteLength(accepted(), 'utf8')).toBeLessThan(MAX_INSPECTION_DETAIL_BYTES / 4);
  });

  it('refuses to serialise a document over the bound', () => {
    const bloated = buildAcceptedDetail({
      source: SOURCE,
      // A future edit that let an unbounded array in must fail here, not in
      // production against an append-only column.
      derivatives: Array.from({ length: 400 }, () => DERIVATIVES[0] as InspectedDerivative),
    });

    expect(() => encodeInspectionDetail(bloated)).toThrow(/8192 bytes/);
  });
});

describe('inspection detail V1 — rejected', () => {
  it('records the closed code and the cleanup state', () => {
    const encoded = encodeInspectionDetail(
      buildRejectedDetail({ rejectionCode: 'DECODE_FAILED', cleanupPending: true }),
    );

    expect(JSON.parse(encoded)).toEqual({
      schemaVersion: 1,
      policyVersion: 1,
      processor: { name: 'sharp', version: IMAGE_PROCESSOR_VERSION },
      result: 'REJECTED',
      rejectionCode: 'DECODE_FAILED',
      cleanupPending: true,
    });
  });

  it('carries no source or derivative measurements', () => {
    const decoded = JSON.parse(
      encodeInspectionDetail(
        buildRejectedDetail({ rejectionCode: 'PIXEL_LIMIT_EXCEEDED', cleanupPending: false }),
      ),
    ) as Record<string, unknown>;

    expect(decoded['source']).toBeUndefined();
    expect(decoded['derivatives']).toBeUndefined();
  });
});

describe('decodeInspectionDetail', () => {
  it('returns undefined for an absent detail', () => {
    expect(decodeInspectionDetail(null)).toBeUndefined();
    expect(decodeInspectionDetail('')).toBeUndefined();
  });

  it('returns undefined for unparseable JSON', () => {
    expect(decodeInspectionDetail('{')).toBeUndefined();
    expect(decodeInspectionDetail('"a string"')).toBeUndefined();
    expect(decodeInspectionDetail('[]')).toBeUndefined();
  });

  it('rejects a foreign schema or policy version', () => {
    const document = JSON.parse(accepted()) as Record<string, unknown>;

    expect(
      decodeInspectionDetail(JSON.stringify({ ...document, schemaVersion: 2 })),
    ).toBeUndefined();
    expect(
      decodeInspectionDetail(JSON.stringify({ ...document, policyVersion: 9 })),
    ).toBeUndefined();
  });

  it('rejects an unknown rejection code', () => {
    const document = {
      schemaVersion: 1,
      policyVersion: 1,
      processor: { name: 'sharp', version: '0.35.3' },
      result: 'REJECTED',
      rejectionCode: 'MALWARE_DETECTED',
      cleanupPending: false,
    };

    expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
  });

  it('rejects a malformed checksum', () => {
    const document = JSON.parse(accepted()) as { source: Record<string, unknown> };
    document.source['checksum'] = 'md5:deadbeef';

    expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
  });

  it('rejects non-positive or fractional measurements', () => {
    for (const value of [0, -1, 1.5, '480', null]) {
      const document = JSON.parse(accepted()) as { source: Record<string, unknown> };
      document.source['width'] = value;

      expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
    }
  });

  it('rejects a document claiming an animated source', () => {
    const document = JSON.parse(accepted()) as { source: Record<string, unknown> };
    document.source['pages'] = 2;

    expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
  });

  it('rejects a watermarked catalog derivative', () => {
    const document = JSON.parse(accepted()) as { derivatives: Record<string, unknown>[] };
    (document.derivatives[0] as Record<string, unknown>)['isWatermarked'] = true;

    expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
  });

  it('rejects a duplicated kind that still has the right length', () => {
    const document = JSON.parse(accepted()) as { derivatives: Record<string, unknown>[] };
    (document.derivatives[1] as Record<string, unknown>)['kind'] = 'THUMBNAIL';

    expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
  });

  it('rejects a missing derivative', () => {
    const document = JSON.parse(accepted()) as { derivatives: unknown[] };
    document.derivatives = [document.derivatives[0]];

    expect(decodeInspectionDetail(JSON.stringify(document))).toBeUndefined();
  });

  it('rejects a document over the byte bound without parsing it', () => {
    const oversized = `{"padding":"${'x'.repeat(MAX_INSPECTION_DETAIL_BYTES)}"}`;

    expect(decodeInspectionDetail(oversized)).toBeUndefined();
  });
});
