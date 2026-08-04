/**
 * Contextual validation against caller-supplied authority.
 *
 * Two cases carry most of the weight. The **cross-asset** one — a document
 * naming asset A but derivative D, where D belongs to asset B — is how a
 * reference to someone else's media would be smuggled past a check that looked
 * only at the derivative. And the **source-metadata** one pins IMP-D044 PO-07:
 * `assets.mime_type`/`size_bytes` describe a different binary and satisfy
 * nothing here, which is the boundary that produced `APP3-DB01` in the first
 * place.
 */
import { DESIGN_DOCUMENT_LIMITS as LIMITS } from '../schema/constants';
import { context, derivative, documentWith, imageElement, textElement } from '../testing/fixtures';
import { validateDesignDocumentContext } from './context';

const codes = (...args: Parameters<typeof validateDesignDocumentContext>): string[] =>
  validateDesignDocumentContext(...args).map((item) => item.code);

describe('derivative eligibility', () => {
  it('accepts a READY NORMALIZED derivative with complete metadata', () => {
    expect(codes(documentWith([imageElement()]), context([derivative()]))).toEqual([]);
  });

  it('rejects a derivative the authority does not know', () => {
    expect(codes(documentWith([imageElement()]), context([]))).toEqual(['UNKNOWN_ASSET_REFERENCE']);
  });

  it('rejects a derivative that belongs to a different asset', () => {
    const record = derivative({ assetId: 'someone-elses-asset' });
    expect(codes(documentWith([imageElement()]), context([record]))).toEqual([
      'UNKNOWN_ASSET_REFERENCE',
    ]);
  });

  it('rejects every non-editor-safe kind', () => {
    for (const kind of ['THUMBNAIL', 'CATALOG_PREVIEW', 'PREVIEW_WATERMARKED', 'MOCKUP']) {
      expect(codes(documentWith([imageElement()]), context([derivative({ kind })]))).toEqual([
        'INELIGIBLE_DERIVATIVE',
      ]);
    }
  });

  it('rejects a NORMALIZED derivative that has not reached READY', () => {
    for (const status of ['PENDING', 'PROCESSING', 'FAILED']) {
      expect(codes(documentWith([imageElement()]), context([derivative({ status })]))).toEqual([
        'INELIGIBLE_DERIVATIVE',
      ]);
    }
  });
});

describe('derivative metadata', () => {
  it('rejects an unmeasured derivative instead of guessing its size', () => {
    const record = derivative({ widthPx: null, heightPx: null, mediaType: null, byteSize: null });
    expect(codes(documentWith([imageElement()]), context([record]))).toEqual([
      'DERIVATIVE_METADATA_MISMATCH',
    ]);
  });

  it('rejects partial metadata', () => {
    for (const partial of [
      { widthPx: null },
      { heightPx: null },
      { mediaType: null },
      { byteSize: null },
    ]) {
      expect(codes(documentWith([imageElement()]), context([derivative(partial)]))).toEqual([
        'DERIVATIVE_METADATA_MISMATCH',
      ]);
    }
  });

  it('rejects unusable metadata values', () => {
    for (const bad of [{ widthPx: 0 }, { heightPx: -1 }, { byteSize: 0 }, { mediaType: '   ' }]) {
      expect(codes(documentWith([imageElement()]), context([derivative(bad)]))).toEqual([
        'DERIVATIVE_METADATA_MISMATCH',
      ]);
    }
  });

  it('rejects intrinsic dimensions that disagree with the canonical derivative', () => {
    // The document's own idea of the image size decides how it is scaled onto
    // the product, so a disagreement is a placement the customer never saw.
    const element = imageElement({ intrinsicWidthPx: 801 });
    expect(codes(documentWith([element]), context([derivative()]))).toEqual([
      'DERIVATIVE_METADATA_MISMATCH',
    ]);
  });

  it('rejects a media type this delivery context does not serve', () => {
    const ctx = { ...context([derivative()]), allowedMediaTypes: ['image/png'] };
    expect(codes(documentWith([imageElement()]), ctx)).toEqual(['INELIGIBLE_DERIVATIVE']);
  });

  it('does not accept source-asset metadata in place of derivative metadata', () => {
    // A record carrying only the source binary's facts is still unmeasured.
    const record = derivative({ widthPx: null, heightPx: null, byteSize: null });
    expect(codes(documentWith([imageElement()]), context([record]))).toEqual([
      'DERIVATIVE_METADATA_MISMATCH',
    ]);
  });
});

describe('decoded pixels', () => {
  const square = (side: number, index: number) => ({
    element: imageElement({
      id: `image-${String(index)}`,
      assetId: `asset-${String(index)}`,
      derivativeId: `derivative-${String(index)}`,
      intrinsicWidthPx: side,
      intrinsicHeightPx: side,
    }),
    record: derivative({
      derivativeId: `derivative-${String(index)}`,
      assetId: `asset-${String(index)}`,
      widthPx: side,
      heightPx: side,
    }),
  });

  it('accepts a total at exactly the ceiling', () => {
    // 2 × 4096² = 33,554,432 = the limit, which is also two assets at the
    // per-asset raster ceiling IMP-D044 sets.
    const parts = [0, 1].map((index) => square(4096, index));
    expect(parts.length * 4096 * 4096).toBe(LIMITS.maxDecodedPixels);
    const findings = codes(
      documentWith(parts.map((part) => part.element)),
      context(parts.map((part) => part.record)),
    );
    expect(findings).toEqual([]);
  });

  it('rejects one pixel beyond the ceiling', () => {
    const parts = [0, 1].map((index) => square(4096, index));
    const extra = square(1, 4);
    const findings = codes(
      documentWith([...parts.map((part) => part.element), extra.element]),
      context([...parts.map((part) => part.record), extra.record]),
    );
    expect(findings).toEqual(['DECODED_PIXEL_LIMIT_EXCEEDED']);
  });

  it('charges a repeated Asset once, because it decodes once', () => {
    const elements = Array.from({ length: 6 }, (_unused, index) =>
      imageElement({
        id: `image-${String(index)}`,
        intrinsicWidthPx: 4096,
        intrinsicHeightPx: 4096,
      }),
    );
    const record = derivative({ widthPx: 4096, heightPx: 4096 });
    // Six placements of one 16.7 MP image: 100 MP if charged per element,
    // 16.7 MP charged correctly.
    expect(codes(documentWith(elements), context([record]))).toEqual([]);
    expect(LIMITS.maxDecodedPixels).toBe(33_554_432);
  });

  it('counts one image using one Asset exactly once', () => {
    const part = square(4096, 0);
    expect(codes(documentWith([part.element]), context([part.record]))).toEqual([]);
  });

  it('sums two different Assets independently', () => {
    // 4096² + 4096² is the ceiling; if the two collapsed into one entry the
    // total would halve and the +1 case below could never fail.
    const a = square(4096, 0);
    const b = square(4096, 1);
    const extra = square(1, 2);
    expect(codes(documentWith([a.element, b.element]), context([a.record, b.record]))).toEqual([]);
    expect(
      codes(
        documentWith([a.element, b.element, extra.element]),
        context([a.record, b.record, extra.record]),
      ),
    ).toEqual(['DECODED_PIXEL_LIMIT_EXCEEDED']);
  });

  it('is deterministic across repeated validation', () => {
    const parts = [0, 1].map((index) => square(4096, index));
    const document = documentWith(parts.map((part) => part.element));
    const authority = context(parts.map((part) => part.record));
    expect(codes(document, authority)).toEqual(codes(document, authority));
  });

  it('does not mutate the document or the caller authority map', () => {
    const parts = [0, 1].map((index) => square(4096, index));
    const document = documentWith(parts.map((part) => part.element));
    const authority = context(parts.map((part) => part.record));
    const documentBefore = JSON.parse(JSON.stringify(document)) as unknown;
    const authorityBefore = [...authority.derivatives.entries()];

    validateDesignDocumentContext(document, authority);

    expect(document).toEqual(documentBefore);
    expect([...authority.derivatives.entries()]).toEqual(authorityBefore);
  });
});

/**
 * The correction `APP3-P01-C1` restored.
 *
 * `IMP-D044` PO-09 keys both the 20-Asset limit and the decoded-pixel total on
 * the **Asset**, not the derivative. Keying pixels on `derivativeId` only looks
 * equivalent while every Asset is placed through one derivative; the moment a
 * document names one Asset twice through different derivatives, the two rules
 * disagree — so the document is rejected rather than silently resolved.
 */
describe('one Asset, one derivative per document', () => {
  const twoDerivativesOfOneAsset = (sideA: number, sideB: number) => ({
    elements: [
      imageElement({
        id: 'image-a',
        assetId: 'asset-shared',
        derivativeId: 'derivative-a',
        intrinsicWidthPx: sideA,
        intrinsicHeightPx: sideA,
      }),
      imageElement({
        id: 'image-b',
        assetId: 'asset-shared',
        derivativeId: 'derivative-b',
        intrinsicWidthPx: sideB,
        intrinsicHeightPx: sideB,
      }),
    ],
    records: [
      derivative({
        derivativeId: 'derivative-a',
        assetId: 'asset-shared',
        widthPx: sideA,
        heightPx: sideA,
      }),
      derivative({
        derivativeId: 'derivative-b',
        assetId: 'asset-shared',
        widthPx: sideB,
        heightPx: sideB,
      }),
    ],
  });

  it('rejects one assetId placed through two different derivative ids', () => {
    // The delivered ambiguity, reproduced: both derivatives are eligible,
    // READY, NORMALIZED and correctly measured. Nothing else is wrong.
    const { elements, records } = twoDerivativesOfOneAsset(800, 400);
    expect(codes(documentWith(elements), context(records))).toEqual([
      'DERIVATIVE_METADATA_MISMATCH',
    ]);
  });

  it('names the later conflicting element and carries no storage data', () => {
    const { elements, records } = twoDerivativesOfOneAsset(800, 400);
    const findings = validateDesignDocumentContext(documentWith(elements), context(records));
    expect(findings[0]?.path).toBe('$.elements[1].derivativeId');
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain('storage');
    expect(serialized).not.toContain('http');
    expect(serialized.length).toBeLessThan(400);
  });

  it('rejects the conflict whichever derivative is larger', () => {
    for (const [a, b] of [
      [800, 400],
      [400, 800],
    ]) {
      const { elements, records } = twoDerivativesOfOneAsset(a as number, b as number);
      expect(codes(documentWith(elements), context(records))).toEqual([
        'DERIVATIVE_METADATA_MISMATCH',
      ]);
    }
  });

  it('accepts the same Asset placed many times through one derivative', () => {
    const elements = Array.from({ length: 20 }, (_unused, index) =>
      imageElement({ id: `image-${String(index)}` }),
    );
    expect(codes(documentWith(elements), context([derivative()]))).toEqual([]);
  });

  it('rejects a derivative whose authority names a different Asset', () => {
    // Two documents' Assets cannot claim one authority record.
    const element = imageElement({ assetId: 'asset-other' });
    expect(codes(documentWith([element]), context([derivative()]))).toEqual([
      'UNKNOWN_ASSET_REFERENCE',
    ]);
  });
});

describe('fonts', () => {
  it('accepts the controlled family in both styles', () => {
    for (const fontStyle of ['normal', 'italic']) {
      expect(codes(documentWith([textElement({ fontStyle })]), context([]))).toEqual([]);
    }
  });

  it('accepts every weight from 100 to 900', () => {
    for (const fontWeight of [100, 400, 700, 900]) {
      expect(codes(documentWith([textElement({ fontWeight })]), context([]))).toEqual([]);
    }
  });

  it('rejects an unknown fontId rather than substituting a face', () => {
    expect(codes(documentWith([textElement({ fontId: 'general-sans' })]), context([]))).toEqual([
      'UNKNOWN_FONT_ID',
    ]);
  });

  it('rejects a weight outside the controlled range', () => {
    for (const fontWeight of [50, 950]) {
      expect(codes(documentWith([textElement({ fontWeight })]), context([]))).toEqual([
        'UNSUPPORTED_FONT_VARIANT',
      ]);
    }
  });

  it('never reports a font path, URL or binary in a finding', () => {
    const findings = validateDesignDocumentContext(
      documentWith([textElement({ fontId: 'unknown' })]),
      context([]),
    );
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain('.woff2');
    expect(serialized).not.toContain('assets/fonts');
    expect(serialized).not.toContain('http');
  });
});
