/**
 * The image capability's pure rules (`APP3-S06`).
 *
 * Everything here is decidable without a DOM, a network or a clock, which is why
 * it is proved by calling it: the file affordance, the initial placement, the
 * replacement semantics and the four authorities a candidate must satisfy.
 */
import { validateDesignDocumentStructure } from '@embroidery/design-document';
import { mmToPx } from '@embroidery/design-engine';

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

/**
 * The scope's own numbers, restated so a reader can check the arithmetic:
 * a 300×200 px Area at (100,120), on a Side of 4 px/mm whose 250×200 mm are the
 * fallback maxima. So the Area rectangle is 75×50 mm and every `null` limit is
 * far looser than the rectangle — which is why the pre-`C1` code passed its
 * tests while ignoring the maxima entirely.
 */
const PX_PER_MM = 4;

/** A transform that must exist. Narrows, and fails loudly if the rule refused. */
function required(transform: ReturnType<typeof initialImageTransform>) {
  if (transform === null) throw new Error('expected a valid initial placement');
  return transform;
}

function requiredDocument(candidate: ReturnType<typeof withNewImage>) {
  if (candidate === null) throw new Error('expected a valid candidate document');
  return candidate;
}

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
    const transform = required(initialImageTransform(media(), SCOPE, LIMITS));

    expect(transform.width / transform.height).toBeCloseTo(400 / 240, 10);
    expect(transform).toMatchObject({ width: 300, height: 180, rotationDeg: 0 });
    expect(transform.x).toBeCloseTo(100, 10);
    expect(transform.y).toBeCloseTo(130, 10);
  });

  it('never enlarges a small image', () => {
    const transform = required(
      initialImageTransform(media({ widthPx: 40, heightPx: 40 }), SCOPE, LIMITS),
    );

    expect({ width: transform.width, height: transform.height }).toEqual({ width: 40, height: 40 });
  });

  it('leaves the scale factors neutral so the box is the only size', () => {
    const transform = required(initialImageTransform(media(), SCOPE, LIMITS));

    // `APP3-P02` folds the box and the scale into one matrix; expressing the
    // size twice would place the element at twice its intended size.
    expect({ scaleX: transform.scaleX, scaleY: transform.scaleY }).toEqual({
      scaleX: 1,
      scaleY: 1,
    });
  });
});

/**
 * The `APP3-S06-C1` correction: the physical maxima take part in **constructing**
 * the first box, rather than only judging it afterwards.
 *
 * The distinction is the whole point. Nothing here clamps a transform a customer
 * performed — `IMP-D045` PO-09 still refuses those outright, and the regression
 * below proves it. What changed is that the system's own first candidate is
 * derived from every limit that applies, so an Area whose millimetre maximum is
 * tighter than its rectangle produces a smaller placed image instead of an
 * upload that succeeded and inserted nothing.
 */
describe('initialImageTransform against physical maxima', () => {
  /** The box the pre-correction rule produced: the Area rectangle alone. */
  const AREA_FITTED_WIDTH_PX = 300;

  it('lets the area rectangle decide when it is the tighter bound', () => {
    // 250×200 mm of Side is 1000×800 px — far looser than the 300×200 rectangle.
    const transform = required(initialImageTransform(media(), SCOPE, LIMITS));

    expect(transform.width).toBe(AREA_FITTED_WIDTH_PX);
  });

  it('places a smaller image when the physical width maximum is tighter', () => {
    // 50 mm at 4 px/mm is 200 px, inside the 300 px rectangle.
    const transform = required(
      initialImageTransform(media(), SCOPE, { maxWidthMm: 50, maxHeightMm: null }),
    );

    expect(transform.width).toBeLessThan(AREA_FITTED_WIDTH_PX);
    expect(transform).toMatchObject({ width: 200, height: 120 });
  });

  it('places a smaller image when the physical height maximum is tighter', () => {
    // 25 mm is 100 px; the image is 400×240, so height decides at 100/240.
    const transform = required(
      initialImageTransform(media(), SCOPE, { maxWidthMm: null, maxHeightMm: 25 }),
    );

    expect(transform.height).toBe(100);
    expect(transform.width).toBeCloseTo(400 * (100 / 240), 3);
  });

  it('takes the tighter of two physical maxima', () => {
    const transform = required(
      initialImageTransform(media(), SCOPE, { maxWidthMm: 50, maxHeightMm: 25 }),
    );

    // Width alone would allow 200 px; height allows only 166.66 px of width.
    expect(transform.height).toBe(100);
    expect(transform.width).toBeLessThan(200);
  });

  it('still never enlarges an image that is already inside every bound', () => {
    const transform = required(
      initialImageTransform(media({ widthPx: 40, heightPx: 24 }), SCOPE, {
        maxWidthMm: 50,
        maxHeightMm: 25,
      }),
    );

    expect({ width: transform.width, height: transform.height }).toEqual({ width: 40, height: 24 });
  });

  it('preserves the derivative ratio at every bound', () => {
    for (const limits of [
      LIMITS,
      { maxWidthMm: 50, maxHeightMm: null },
      { maxWidthMm: null, maxHeightMm: 25 },
      { maxWidthMm: 50, maxHeightMm: 25 },
    ]) {
      const transform = required(initialImageTransform(media(), SCOPE, limits));

      // Four decimal places is the document's whole precision, so this is exact
      // to the only precision the value has.
      expect(transform.width / transform.height).toBeCloseTo(400 / 240, 4);
    }
  });

  it('centres the constructed box in the area on both axes', () => {
    const transform = required(
      initialImageTransform(media(), SCOPE, { maxWidthMm: 50, maxHeightMm: 25 }),
    );

    expect(transform.x).toBeCloseTo(100 + (300 - transform.width) / 2, 3);
    expect(transform.y).toBeCloseTo(120 + (200 - transform.height) / 2, 3);
  });

  it('accepts a size that lands exactly on the physical maximum', () => {
    // 200 px wide at 4 px/mm is exactly 50 mm, and PO-09 says boundary equality
    // passes — so the image places at its intrinsic size, unshrunk.
    const transform = required(
      initialImageTransform(media({ widthPx: 200, heightPx: 100 }), SCOPE, {
        maxWidthMm: 50,
        maxHeightMm: null,
      }),
    );

    expect(transform.width).toBe(200);
  });

  it('never produces a box one quantized unit outside a maximum', () => {
    // A maximum that is not a whole pixel is where a nearest-rounding
    // construction rounds *up* off the limit it was built to respect.
    const limits = { maxWidthMm: 33.3333, maxHeightMm: null };
    const transform = required(initialImageTransform(media(), SCOPE, limits));

    expect(transform.width).toBeLessThanOrEqual(mmToPx(33.3333, PX_PER_MM));
  });

  it.each([
    ['an unusable scale', { pxPerMm: 0 }],
    ['a degenerate area rectangle', { boundWidthPx: 0 }],
  ])('refuses when %s leaves no positive box', (_label, overrides) => {
    expect(initialImageTransform(media(), makeScope(overrides), LIMITS)).toBeNull();
  });

  it('refuses a maximum smaller than the document can represent', () => {
    expect(
      initialImageTransform(media(), SCOPE, { maxWidthMm: 0.000_001, maxHeightMm: null }),
    ).toBeNull();
  });
});

describe('withNewImage', () => {
  const document = makeStageDocument([textElement('t')]);

  it('appends at the canonical top of z-order and touches nothing else', () => {
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));

    expect(candidate.elements.map((element) => element.id)).toEqual(['t', 'img']);
    expect(candidate.elements[0]).toBe(document.elements[0]);
  });

  it('takes intrinsic dimensions only from the server measurement', () => {
    const candidate = requiredDocument(
      withNewImage(document, 'img', media({ widthPx: 123, heightPx: 45 }), SCOPE, LIMITS),
    );

    expect(candidate.elements[1]).toMatchObject({
      type: 'image',
      assetId: 'asset-new',
      derivativeId: 'derivative-new',
      intrinsicWidthPx: 123,
      intrinsicHeightPx: 45,
    });
  });

  it('writes no URL, blob, key or status into the document', () => {
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));
    const serialized = JSON.stringify(candidate);

    for (const forbidden of ['blob:', 'http', 'storageKey', 'bucket', 'READY', 'byteSize'])
      expect(serialized).not.toContain(forbidden);
  });

  it('produces a structurally valid document', () => {
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));

    expect(validateDesignDocumentStructure(candidate).ok).toBe(true);
  });

  it('inserts exactly one image element', () => {
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));

    expect(candidate.elements.filter((element) => element.type === 'image')).toHaveLength(1);
  });

  it('leaves the document untouched when no valid placement exists', () => {
    const candidate = withNewImage(document, 'img', media(), makeScope({ pxPerMm: 0 }), LIMITS);

    expect(candidate).toBeNull();
    expect(document.elements.map((element) => element.id)).toEqual(['t']);
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
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));

    const outcome = ruleOnImageCandidate(candidate, 'img', media(), SCOPE, LIMITS);

    expect(outcome.ok).toBe(true);
  });

  it('refuses media the document disagrees with about intrinsic size', () => {
    // The element says 400×240 and the canonical derivative says 401×240. The
    // document's own idea of the image size decides how it is scaled onto the
    // product, so a disagreement is a placement the customer never saw.
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));

    const outcome = ruleOnImageCandidate(candidate, 'img', media({ widthPx: 401 }), SCOPE, LIMITS);

    expect(outcome).toEqual({ ok: false, refusal: 'ineligible-media' });
  });

  it('refuses a derivative that belongs to another asset', () => {
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));

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
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, LIMITS));
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
    const candidate = requiredDocument(
      withNewImage(existing, 'img', media({ widthPx: 40, heightPx: 24 }), SCOPE, LIMITS),
    );

    expect(
      ruleOnImageCandidate(candidate, 'img', media({ widthPx: 40, heightPx: 24 }), SCOPE, LIMITS)
        .ok,
    ).toBe(true);
  });

  /**
   * The defect, stated as the test that would have caught it.
   *
   * Before `APP3-S06-C1` the constructed candidate fitted the 300×200 px
   * rectangle and `APP3-P02` refused it for exceeding 50 mm — so a successful
   * upload inserted nothing, and the customer was told to resize an element that
   * did not exist. The construction now respects the maximum, and the very same
   * final validation accepts it.
   */
  it('constructs a first placement APP3-P02 accepts when the maximum is tighter', () => {
    const tighter = { maxWidthMm: 50, maxHeightMm: 25 };
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, tighter));

    const outcome = ruleOnImageCandidate(candidate, 'img', media(), SCOPE, tighter);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const placed = outcome.document.elements.find((element) => element.id === 'img');
    // Committed at the constructed size, in millimetres inside both maxima.
    expect((placed?.transform.width ?? 0) / PX_PER_MM).toBeLessThanOrEqual(50);
    expect((placed?.transform.height ?? 0) / PX_PER_MM).toBeLessThanOrEqual(25);
  });

  /**
   * `IMP-D045` PO-09 is untouched by the correction.
   *
   * A transform the *customer* performed is still refused outright when it
   * exceeds the maximum. Nothing shrinks it to fit, and the refusal names the
   * physical rule — which is what makes the initial-placement change a
   * construction rather than a clamp that leaked into the transform path.
   */
  it('still refuses a user-sized transform above the maximum instead of shrinking it', () => {
    const tighter = { maxWidthMm: 50, maxHeightMm: 25 };
    const candidate = requiredDocument(withNewImage(document, 'img', media(), SCOPE, tighter));
    const enlarged = {
      ...candidate,
      elements: candidate.elements.map((element) =>
        element.id === 'img'
          ? // 250×150 px is 62.5×37.5 mm: still inside the 300×200 px rectangle,
            // so the only rule it breaks is the physical maximum.
            {
              ...element,
              transform: { ...element.transform, x: 125, y: 145, width: 250, height: 150 },
            }
          : element,
      ),
    };

    const outcome = ruleOnImageCandidate(enlarged, 'img', media(), SCOPE, tighter);

    expect(outcome).toEqual({ ok: false, refusal: 'too-large-for-area' });
  });
});
