import { API_SUCCESS_CODE, API_SUCCESS_MESSAGE } from './api-error-code';
import {
  createErrorEnvelope,
  createSuccessEnvelope,
  isEnvelopeFromFactory,
} from './api-envelope.factory';

const context = { requestId: 'req-1', timestamp: '2026-07-13T00:00:00.000Z' };

describe('createSuccessEnvelope', () => {
  it('wraps an object', () => {
    expect(createSuccessEnvelope({ ...context, data: { id: 'abc' } })).toEqual({
      success: true,
      code: API_SUCCESS_CODE,
      message: API_SUCCESS_MESSAGE,
      data: { id: 'abc' },
      meta: { requestId: 'req-1', timestamp: '2026-07-13T00:00:00.000Z' },
    });
  });

  it.each([
    ['an array', [1, 2, 3]],
    ['a string', 'hello'],
    ['a number', 42],
    ['a boolean', false],
    ['null', null],
  ])('wraps %s as data', (_label, data) => {
    const envelope = createSuccessEnvelope({ ...context, data });
    expect(envelope.data).toEqual(data);
    expect(envelope.success).toBe(true);
  });

  it('uses an endpoint-supplied code and message', () => {
    const envelope = createSuccessEnvelope({
      ...context,
      data: null,
      code: 'QUOTATION_CREATED',
      message: 'Quotation created successfully',
    });

    expect(envelope.code).toBe('QUOTATION_CREATED');
    expect(envelope.message).toBe('Quotation created successfully');
  });

  it('includes the request ID it was given and never invents one', () => {
    expect(createSuccessEnvelope({ ...context, data: null }).meta.requestId).toBe('req-1');
  });

  it('does not mutate the input data', () => {
    const data = { id: 'abc', nested: { value: 1 } };
    const snapshot = structuredClone(data);

    createSuccessEnvelope({ ...context, data });

    expect(data).toEqual(snapshot);
  });

  it('generates no timestamp of its own', () => {
    // The factory is pure: time is supplied by the caller, so the envelope is
    // fully determined by its inputs.
    const first = createSuccessEnvelope({ ...context, data: null });
    const second = createSuccessEnvelope({ ...context, data: null });

    expect(first).toEqual(second);
  });
});

describe('createErrorEnvelope', () => {
  it('builds an error without details', () => {
    expect(createErrorEnvelope({ ...context, code: 'NOT_FOUND', message: 'Missing' })).toEqual({
      success: false,
      code: 'NOT_FOUND',
      message: 'Missing',
      meta: { requestId: 'req-1', timestamp: '2026-07-13T00:00:00.000Z' },
    });
  });

  it('includes structured field errors when present', () => {
    const envelope = createErrorEnvelope({
      ...context,
      code: 'BAD_REQUEST',
      message: 'Invalid',
      errors: [{ field: 'email', code: 'INVALID_EMAIL', message: 'Email is invalid' }],
    });

    expect(envelope.errors).toEqual([
      { field: 'email', code: 'INVALID_EMAIL', message: 'Email is invalid' },
    ]);
  });

  it('omits the errors key entirely rather than serialising undefined', () => {
    const envelope = createErrorEnvelope({ ...context, code: 'NOT_FOUND', message: 'Missing' });

    expect('errors' in envelope).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain('errors');
  });

  it('omits an empty errors array', () => {
    const envelope = createErrorEnvelope({
      ...context,
      code: 'NOT_FOUND',
      message: 'Missing',
      errors: [],
    });

    expect('errors' in envelope).toBe(false);
  });

  it('copies the errors array so later caller mutation cannot alter the response', () => {
    const errors = [{ field: 'a', code: 'B', message: 'c' }];
    const envelope = createErrorEnvelope({ ...context, code: 'X', message: 'y', errors });

    errors.push({ field: 'd', code: 'E', message: 'f' });

    expect(envelope.errors).toHaveLength(1);
  });
});

describe('isEnvelopeFromFactory', () => {
  it('recognises envelopes this factory produced', () => {
    expect(isEnvelopeFromFactory(createSuccessEnvelope({ ...context, data: null }))).toBe(true);
    expect(
      isEnvelopeFromFactory(createErrorEnvelope({ ...context, code: 'X', message: 'y' })),
    ).toBe(true);
  });

  it.each([
    ['a plain object', { id: 1 }],
    ['an object with a success field', { success: true, data: {} }],
    ['an array', [1]],
    ['null', null],
    ['a string', 'ok'],
    ['undefined', undefined],
  ])('does not recognise %s', (_label, value) => {
    expect(isEnvelopeFromFactory(value)).toBe(false);
  });

  it('adds no property to the serialised JSON', () => {
    const envelope = createSuccessEnvelope({ ...context, data: { id: 'abc' } });

    expect(Object.keys(JSON.parse(JSON.stringify(envelope)) as object)).toEqual([
      'success',
      'code',
      'message',
      'data',
      'meta',
    ]);
  });
});
