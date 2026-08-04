/**
 * Structural validation.
 *
 * The cases worth reading twice are the coercion ones. A validator that turns
 * `"12"` into `12`, a missing version into v1 or an unknown type into a shape
 * does not reject a bad document — it silently rewrites it into a different
 * one, and then hashes that. Each of those is asserted to fail here.
 */
import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '../schema/constants';
import {
  documentWith,
  emptyDocument,
  freehandElement,
  groupElement,
  imageElement,
  nestedGroups,
  placement,
  shapeElement,
  textElement,
  transform,
} from '../testing/fixtures';
import { validateDesignDocumentStructure } from './structure';

const codes = (payload: unknown): string[] => {
  const result = validateDesignDocumentStructure(payload);
  return result.ok ? [] : result.findings.map((item) => item.code);
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('schema version', () => {
  it('accepts the minimal valid empty document', () => {
    const result = validateDesignDocumentStructure(emptyDocument());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION);
      expect(result.value.elements).toEqual([]);
    }
  });

  it('rejects a missing schema version rather than assuming v1', () => {
    const { schemaVersion: _drop, ...rest } = emptyDocument();
    expect(codes(rest)).toEqual(['UNSUPPORTED_SCHEMA_VERSION']);
  });

  it('rejects a future schema version loudly', () => {
    expect(codes({ ...emptyDocument(), schemaVersion: 2 })).toEqual(['UNSUPPORTED_SCHEMA_VERSION']);
  });

  it('rejects a non-integer or string schema version', () => {
    expect(codes({ ...emptyDocument(), schemaVersion: '1' })).toEqual([
      'UNSUPPORTED_SCHEMA_VERSION',
    ]);
    expect(codes({ ...emptyDocument(), schemaVersion: 1.5 })).toEqual([
      'UNSUPPORTED_SCHEMA_VERSION',
    ]);
  });

  it('rejects a payload that is not an object at all', () => {
    for (const payload of [null, [], 'document', 42]) {
      expect(codes(payload).length).toBeGreaterThan(0);
    }
  });
});

describe('element kinds', () => {
  it('accepts one valid element of every supported type', () => {
    const elements = [
      textElement(),
      imageElement(),
      shapeElement(),
      freehandElement(),
      groupElement({ childIds: ['text-1'] }),
    ];
    const result = validateDesignDocumentStructure(documentWith(elements));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.elements).toHaveLength(5);
  });

  it('rejects an unknown element type', () => {
    expect(codes(documentWith([textElement({ type: 'svg' })]))).toContain('INVALID_DOCUMENT');
  });

  it('rejects an unknown field on an element', () => {
    expect(codes(documentWith([textElement({ objectURL: 'blob:x' })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });

  it('rejects an unknown field on the document root', () => {
    expect(codes({ ...emptyDocument(), watermark: 'policy' })).toContain('INVALID_DOCUMENT');
  });

  it('rejects a renderer node or function anywhere in the payload', () => {
    expect(codes(documentWith([textElement({ fill: () => '#fff' })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });
});

describe('numbers and ranges', () => {
  it('rejects NaN and Infinity', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(codes(documentWith([textElement({ transform: transform({ x: bad }) })]))).toContain(
        'INVALID_DOCUMENT',
      );
    }
  });

  it('rejects a numeric string instead of a number', () => {
    const coerced = { ...transform(), x: '10' } as unknown as ReturnType<typeof transform>;
    expect(codes(documentWith([textElement({ transform: coerced })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });

  it('rejects a negative or zero dimension', () => {
    for (const width of [0, -1]) {
      expect(codes(documentWith([textElement({ transform: transform({ width }) })]))).toContain(
        'INVALID_DOCUMENT',
      );
    }
  });

  it('rejects a zero scale factor, which would erase the element', () => {
    expect(codes(documentWith([textElement({ transform: transform({ scaleX: 0 }) })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });

  it('rejects opacity outside 0..1', () => {
    for (const opacity of [-0.1, 1.1]) {
      expect(codes(documentWith([textElement({ opacity })]))).toContain('INVALID_DOCUMENT');
    }
  });

  it('rejects a malformed or missing transform', () => {
    expect(codes(documentWith([textElement({ transform: null })]))).toContain('INVALID_DOCUMENT');
    expect(codes(documentWith([textElement({ transform: { x: 1 } })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });

  it('rejects a fractional intrinsic image dimension', () => {
    expect(codes(documentWith([imageElement({ intrinsicWidthPx: 800.5 })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });

  it('rejects a non-positive placement value', () => {
    expect(codes({ ...emptyDocument(), placement: placement({ pxPerMm: 0 }) })).toContain(
      'INVALID_DOCUMENT',
    );
  });
});

describe('identity', () => {
  it('rejects duplicate element ids', () => {
    const elements = [textElement({ id: 'same' }), shapeElement({ id: 'same' })];
    expect(codes(documentWith(elements))).toContain('DUPLICATE_ELEMENT_ID');
  });

  it('rejects an empty or missing element id', () => {
    expect(codes(documentWith([textElement({ id: '' })]))).toContain('INVALID_DOCUMENT');
  });

  it('preserves array order as z-order rather than sorting by id', () => {
    const elements = [textElement({ id: 'z' }), shapeElement({ id: 'a' })];
    const result = validateDesignDocumentStructure(documentWith(elements));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.elements.map((item) => item.id)).toEqual(['z', 'a']);
  });
});

describe('group graph', () => {
  it('rejects a reference to an element that does not exist', () => {
    expect(codes(documentWith([groupElement({ childIds: ['missing'] })]))).toContain(
      'INVALID_GROUP_REFERENCE',
    );
  });

  it('rejects a group that references itself', () => {
    expect(codes(documentWith([groupElement({ childIds: ['group-1'] })]))).toContain('GROUP_CYCLE');
  });

  it('rejects an element claimed by two groups', () => {
    const elements = [
      textElement(),
      groupElement({ id: 'g1', childIds: ['text-1'] }),
      groupElement({ id: 'g2', childIds: ['text-1'] }),
    ];
    expect(codes(documentWith(elements))).toContain('MULTIPLE_GROUP_PARENTS');
  });

  it('rejects a two-group cycle', () => {
    const elements = [
      groupElement({ id: 'g1', childIds: ['g2'] }),
      groupElement({ id: 'g2', childIds: ['g1'] }),
    ];
    expect(codes(documentWith(elements))).toContain('GROUP_CYCLE');
  });

  it('rejects the same child listed twice in one group', () => {
    const elements = [textElement(), groupElement({ childIds: ['text-1', 'text-1'] })];
    expect(codes(documentWith(elements))).toContain('INVALID_GROUP_REFERENCE');
  });

  it('accepts nesting at the ruled depth and rejects one deeper', () => {
    expect(validateDesignDocumentStructure(documentWith(nestedGroups(8))).ok).toBe(true);
    expect(codes(documentWith(nestedGroups(9)))).toContain('COMPLEXITY_LIMIT_EXCEEDED');
  });
});

describe('freehand', () => {
  it('rejects fewer points than a stroke can have', () => {
    expect(codes(documentWith([freehandElement({ points: [{ x: 0, y: 0 }] })]))).toContain(
      'INVALID_DOCUMENT',
    );
  });

  it('rejects a non-finite coordinate', () => {
    const points = [
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
    ];
    expect(codes(documentWith([freehandElement({ points })]))).toContain('INVALID_DOCUMENT');
  });
});

describe('Unicode', () => {
  it('accepts NFC Vietnamese text', () => {
    expect(
      validateDesignDocumentStructure(documentWith([textElement({ text: 'Thêu tay' })])).ok,
    ).toBe(true);
  });

  it('rejects decomposed text, which would hash differently from the same word', () => {
    const decomposed = 'Thêu'.normalize('NFD');
    expect(codes(documentWith([textElement({ text: decomposed })]))).toContain('INVALID_DOCUMENT');
  });
});

describe('purity', () => {
  it('does not mutate the payload it validates', () => {
    const payload = documentWith([textElement(), groupElement({ childIds: ['text-1'] })]);
    const before = clone(payload);
    validateDesignDocumentStructure(payload);
    expect(payload).toEqual(before);
  });

  it('returns a fresh document rather than the caller object', () => {
    const payload = documentWith([textElement()]);
    const result = validateDesignDocumentStructure(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBe(payload);
      expect(result.value.elements[0]).not.toBe(payload.elements[0]);
    }
  });
});
