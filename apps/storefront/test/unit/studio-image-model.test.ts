/**
 * The image capability's pure rules (`APP3-S06`).
 *
 * Everything here is decidable without a DOM, a network or a clock, which is why
 * it is proved by calling it: the file affordance, the initial placement, the
 * replacement semantics and the four authorities a candidate must satisfy.
 */
import { validateDesignDocumentStructure } from '@embroidery/design-document';

import {
  ruleOnImageCandidate,
  type StudioImageMedia,
} from '../../src/features/design-studio/model/studio-image-authority';
import {
  MAX_IMAGE_BYTES,
  UPLOADABLE_IMAGE_ACCEPT,
  ruleOnImageFile,
} from '../../src/features/design-studio/model/studio-image-file';
import {
  imageElementOf,
  initialImageTransform,
  withNewImage,
  withReplacedImage,
} from '../../src/features/design-studio/model/studio-image-placement';
import {
  imageElement,
  makeScope,
  makeStageDocument,
  textElement,
} from '../support/studio-stage-fixture';

const SCOPE = makeScope();
const LIMITS = { maxWidthMm: null, maxHeightMm: null };

/** What a `READY` status projection carries. */
function media(overrides: Partial<StudioImageMedia> = {}): StudioImageMedia {
  return {
    assetId: 'asset-new',
    derivativeId: 'derivative-new',
    widthPx: 400,
    heightPx: 240,
    mediaType: 'image/webp',
    byteSize: 51_200,
    ...overrides,
  };
}

function file(type: string, size: number): File {
  const handle = new File([new Uint8Array(1)], 'picture', { type });
  Object.defineProperty(handle, 'size', { value: size });
  return handle;
}

describe('ruleOnImageFile', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('offers %s', (type) => {
    expect(ruleOnImageFile(file(type, 1_024))).toBeNull();
  });

  // Neither is "not yet supported": `IMP-D044` PO-04 authorizes SVG for Template
  // artwork only and `APP3-B06B` refuses it at intake, and animation is refused
  // by the decode policy. Offering either would promise a permanent refusal.
  it.each(['image/svg+xml', 'image/gif', 'image/bmp', 'application/octet-stream', ''])(
    'refuses %s by type',
    (type) => {
      expect(ruleOnImageFile(file(type, 1_024))).toBe('type');
    },
  );

  it('refuses a file over the streaming ceiling', () => {
    expect(ruleOnImageFile(file('image/png', MAX_IMAGE_BYTES + 1))).toBe('size');
    expect(ruleOnImageFile(file('image/png', MAX_IMAGE_BYTES))).toBeNull();
  });

  it('builds the accept attribute from the same list it rules with', () => {
    expect(UPLOADABLE_IMAGE_ACCEPT).toBe('image/png,image/jpeg,image/webp');
    expect(UPLOADABLE_IMAGE_ACCEPT).not.toContain('svg');
    expect(UPLOADABLE_IMAGE_ACCEPT).not.toContain('gif');
  });
});

describe('initialImageTransform', () => {
  it('fits the derivative inside the embroidery area, centred, at its own ratio', () => {
    // The area is 300×200 at (100,120); the image is 400×240, so it scales to
    // 300×180 and the ratio is preserved exactly.
    const transform = initialImageTransform(media(), SCOPE);

    expect(transform.width / transform.height).toBeCloseTo(400 / 240, 10);
    expect(transform).toMatchObject({ width: 300, height: 180, rotationDeg: 0 });
    expect(transform.x).toBeCloseTo(100, 10);
    expect(transform.y).toBeCloseTo(130, 10);
  });

  it('never enlarges a small image', () => {
    const transform = initialImageTransform(media({ widthPx: 40, heightPx: 40 }), SCOPE);

    expect({ width: transform.width, height: transform.height }).toEqual({ width: 40, height: 40 });
  });

  it('leaves the scale factors neutral so the box is the only size', () => {
    const transform = initialImageTransform(media(), SCOPE);

    // `APP3-P02` folds the box and the scale into one matrix; expressing the
    // size twice would place the element at twice its intended size.
    expect({ scaleX: transform.scaleX, scaleY: transform.scaleY }).toEqual({
      scaleX: 1,
      scaleY: 1,
    });
  });
});

describe('withNewImage', () => {
  const document = makeStageDocument([textElement('t')]);

  it('appends at the canonical top of z-order and touches nothing else', () => {
    const candidate = withNewImage(document, 'img', media(), SCOPE);

    expect(candidate.elements.map((element) => element.id)).toEqual(['t', 'img']);
    expect(candidate.elements[0]).toBe(document.elements[0]);
  });

  it('takes intrinsic dimensions only from the server measurement', () => {
    const candidate = withNewImage(document, 'img', media({ widthPx: 123, heightPx: 45 }), SCOPE);

    expect(candidate.elements[1]).toMatchObject({
      type: 'image',
      assetId: 'asset-new',
      derivativeId: 'derivative-new',
      intrinsicWidthPx: 123,
      intrinsicHeightPx: 45,
    });
  });

  it('writes no URL, blob, key or status into the document', () => {
    const candidate = withNewImage(document, 'img', media(), SCOPE);
    const serialized = JSON.stringify(candidate);

    for (const forbidden of ['blob:', 'http', 'storageKey', 'bucket', 'READY', 'byteSize'])
      expect(serialized).not.toContain(forbidden);
  });

  it('produces a structurally valid document', () => {
    expect(validateDesignDocumentStructure(withNewImage(document, 'img', media(), SCOPE)).ok).toBe(
      true,
    );
  });
});

describe('withReplacedImage', () => {
  const placed = imageElement('img', {
    transform: { x: 150, y: 160, width: 100, height: 60, rotationDeg: 12, scaleX: 1, scaleY: 1 },
  });
  const document = makeStageDocument([textElement('t'), placed]);

  it('keeps the element id, its z-order and its whole transform', () => {
    const candidate = withReplacedImage(document, 'img', media());

    expect(candidate.elements.map((element) => element.id)).toEqual(['t', 'img']);
    expect(candidate.elements[1]).toMatchObject({
      id: 'img',
      transform: placed.transform,
    });
  });

  it('changes only the four media fields', () => {
    const candidate = withReplacedImage(document, 'img', media({ widthPx: 7, heightPx: 9 }));

    expect(candidate.elements[1]).toMatchObject({
      assetId: 'asset-new',
      derivativeId: 'derivative-new',
      intrinsicWidthPx: 7,
      intrinsicHeightPx: 9,
    });
  });

  it('leaves a non-image element alone', () => {
    const candidate = withReplacedImage(document, 't', media());

    expect(candidate.elements[0]).toBe(document.elements[0]);
  });
});

describe('imageElementOf', () => {
  const document = makeStageDocument([textElement('t'), imageElement('img')]);

  it('resolves an image selection', () => {
    expect(imageElementOf(document, 'img')?.id).toBe('img');
  });

  it.each([
    ['a text selection', 't'],
    ['an absent id', 'gone'],
    ['no selection', null],
  ])('resolves nothing for %s', (_label, id) => {
    expect(imageElementOf(document, id)).toBeUndefined();
  });
});

describe('ruleOnImageCandidate', () => {
  const document = makeStageDocument([]);

  it('accepts a valid first placement and returns the quantized document', () => {
    const candidate = withNewImage(document, 'img', media(), SCOPE);

    const outcome = ruleOnImageCandidate(candidate, 'img', media(), SCOPE, LIMITS);

    expect(outcome.ok).toBe(true);
  });

  it('refuses media the document disagrees with about intrinsic size', () => {
    // The element says 400×240 and the canonical derivative says 401×240. The
    // document's own idea of the image size decides how it is scaled onto the
    // product, so a disagreement is a placement the customer never saw.
    const candidate = withNewImage(document, 'img', media(), SCOPE);

    const outcome = ruleOnImageCandidate(candidate, 'img', media({ widthPx: 401 }), SCOPE, LIMITS);

    expect(outcome).toEqual({ ok: false, refusal: 'ineligible-media' });
  });

  it('refuses a derivative that belongs to another asset', () => {
    const candidate = withNewImage(document, 'img', media(), SCOPE);

    const outcome = ruleOnImageCandidate(
      candidate,
      'img',
      media({ assetId: 'asset-someone-else' }),
      SCOPE,
      LIMITS,
    );

    expect(outcome).toEqual({ ok: false, refusal: 'ineligible-media' });
  });

  it('refuses a placement outside the embroidery area', () => {
    const candidate = withNewImage(document, 'img', media(), SCOPE);
    const moved = {
      ...candidate,
      elements: candidate.elements.map((element) => ({
        ...element,
        transform: { ...element.transform, x: 900, y: 700 },
      })),
    };

    const outcome = ruleOnImageCandidate(moved, 'img', media(), SCOPE, LIMITS);

    expect(outcome).toEqual({ ok: false, refusal: 'outside-embroidery-area' });
  });

  it('lets an image already in the document stay valid while another is added', () => {
    // The trap `APP3-S05` documented and avoided by not calling context
    // validation at all: an empty derivative map refuses artwork the customer
    // never touched. The carried entries are what keep the existing picture
    // valid, and they can only ever describe images the document already had.
    const existing = makeStageDocument([
      imageElement('old', {
        transform: { x: 110, y: 130, width: 80, height: 48, rotationDeg: 0, scaleX: 1, scaleY: 1 },
      }),
    ]);
    const candidate = withNewImage(existing, 'img', media({ widthPx: 40, heightPx: 24 }), SCOPE);

    expect(
      ruleOnImageCandidate(candidate, 'img', media({ widthPx: 40, heightPx: 24 }), SCOPE, LIMITS)
        .ok,
    ).toBe(true);
  });
});
