import { RequestContextService } from './request-context.service';
import { RequestIdMiddleware, resolveRequestId } from './request-id.middleware';
import { REQUEST_ID_HEADER_LOOKUP, isValidRequestId } from './request-id.contract';

describe('resolveRequestId', () => {
  it.each([
    ['a plain value', 'abc'],
    ['an nginx native id', '0f8ab1c2d3e4f5061728394a5b6c7d8e'],
    ['a value using every allowed separator', 'a.b_c-d'],
  ])('preserves %s byte for byte', (_label, supplied) => {
    expect(resolveRequestId(supplied)).toBe(supplied);
  });

  it.each([
    ['a missing header', undefined],
    ['an empty value', ''],
    ['a whitespace-only value', '   '],
    ['an oversized value', 'a'.repeat(65)],
    ['a value with an inner space', 'abc def'],
    ['a padded but otherwise valid value', ' abc '],
  ])('replaces %s with a generated ID', (_label, supplied) => {
    const resolved = resolveRequestId(supplied);

    expect(resolved).not.toBe(supplied);
    expect(isValidRequestId(resolved)).toBe(true);
  });

  describe('multi-value headers', () => {
    // Node surfaces a repeated header as an array. There is no defensible rule
    // for choosing between the values, so the ambiguous input is discarded
    // rather than resolved arbitrarily.
    it.each([
      ['two values', ['first-id', 'second-id']],
      ['a single-element array', ['only-id']],
      ['an empty array', []],
    ])('discards %s and generates a fresh ID', (_label, supplied) => {
      const resolved = resolveRequestId(supplied);

      expect(supplied).not.toContain(resolved);
      expect(isValidRequestId(resolved)).toBe(true);
    });
  });

  it('never returns a value that fails the contract it was validated against', () => {
    const inputs: (string | string[] | undefined)[] = [
      undefined,
      '',
      'valid-id',
      ['a', 'b'],
      'a'.repeat(200),
      'bad value!',
    ];

    for (const input of inputs) {
      expect(isValidRequestId(resolveRequestId(input))).toBe(true);
    }
  });
});

describe('RequestIdMiddleware', () => {
  let service: RequestContextService;
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    service = new RequestContextService();
    middleware = new RequestIdMiddleware(service);
  });

  it('makes the resolved ID visible to the downstream handler', () => {
    let observed: string | undefined;
    middleware.use({ headers: { [REQUEST_ID_HEADER_LOOKUP]: 'from-gateway' } }, undefined, () => {
      observed = service.requireRequestId();
    });

    expect(observed).toBe('from-gateway');
  });

  it('clears the context once the request completes', () => {
    middleware.use({ headers: {} }, undefined, () => undefined);

    expect(service.getRequestId()).toBeUndefined();
  });

  it('propagates a downstream error instead of swallowing it', () => {
    expect(() => {
      middleware.use({ headers: {} }, undefined, () => {
        throw new Error('downstream failed');
      });
    }).toThrow('downstream failed');
  });

  it('does not mutate the incoming headers', () => {
    const headers = { [REQUEST_ID_HEADER_LOOKUP]: 'unsafe value' };
    const snapshot = { ...headers };

    middleware.use({ headers }, undefined, () => undefined);

    expect(headers).toEqual(snapshot);
  });
});
