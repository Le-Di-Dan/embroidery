import { REDACTED_MARKER } from './log-redaction';
import { sanitizeAttributes, sanitizeValue } from './log-sanitizer';

describe('sanitizeValue primitives', () => {
  it('passes finite numbers, booleans and null through', () => {
    expect(sanitizeValue(42)).toBe(42);
    expect(sanitizeValue(true)).toBe(true);
    expect(sanitizeValue(null)).toBeNull();
  });

  it('stringifies non-finite numbers and bigints', () => {
    expect(sanitizeValue(Number.NaN)).toBe('NaN');
    expect(sanitizeValue(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(sanitizeValue(10n)).toBe('10n');
  });

  it('drops functions, symbols and undefined', () => {
    expect(sanitizeValue(undefined)).toBeUndefined();
    expect(sanitizeValue(() => 1)).toBeUndefined();
    expect(sanitizeValue(Symbol('x'))).toBeUndefined();
  });

  it('redacts strings and truncates very long ones', () => {
    expect(sanitizeValue('Bearer sk_live_abcdefgh12345')).toContain(REDACTED_MARKER);
    const huge = 'a'.repeat(10_000);
    const result = sanitizeValue(huge) as string;
    expect(result.length).toBeLessThan(huge.length);
    expect(result).toContain('[Truncated]');
  });

  it('renders Date, Buffer and Error safely', () => {
    expect(sanitizeValue(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z');
    expect(sanitizeValue(Buffer.from('secret-bytes'))).toBe('[Buffer 12]');
    const error = sanitizeValue(new Error('connect to postgres://u:p@h/db')) as {
      name: string;
      message: string;
    };
    expect(error.name).toBe('Error');
    expect(error.message).toContain(REDACTED_MARKER);
  });
});

describe('sanitizeValue structural safety', () => {
  it('redacts sensitive keys anywhere in a nested object', () => {
    const input = { user: { id: '1', password: 'hunter2', tokens: { access_token: 'abc' } } };
    const result = sanitizeValue(input) as Record<string, Record<string, unknown>>;
    expect(result['user']?.['password']).toBe(REDACTED_MARKER);
    expect((result['user']?.['tokens'] as Record<string, unknown>)['access_token']).toBe(
      REDACTED_MARKER,
    );
    expect(result['user']?.['id']).toBe('1');
  });

  it('marks a circular reference instead of recursing forever', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;
    expect(sanitizeValue(node)).toEqual({ name: 'root', self: '[Circular]' });
  });

  it('does not treat a shared sibling object as circular', () => {
    const shared = { v: 1 };
    const result = sanitizeValue({ a: shared, b: shared });
    expect(result).toEqual({ a: { v: 1 }, b: { v: 1 } });
  });

  it('bounds deep nesting', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 20; i += 1) {
      deep = { child: deep };
    }
    expect(JSON.stringify(sanitizeValue(deep))).toContain('[Truncated]');
  });

  it('bounds a huge array', () => {
    const result = sanitizeValue(Array.from({ length: 1_000 }, (_, i) => i)) as unknown[];
    expect(result.length).toBeLessThanOrEqual(101);
    expect(result.at(-1)).toContain('[Truncated]');
  });

  it('survives a throwing getter', () => {
    const input = {
      ok: 'value',
      get bad(): string {
        throw new Error('boom');
      },
    };
    expect(sanitizeValue(input)).toEqual({ ok: 'value', bad: '[Unreadable]' });
  });

  it('handles Map and Set', () => {
    expect(sanitizeValue(new Map([['k', 'v']]))).toEqual({ k: 'v' });
    expect(sanitizeValue(new Set([1, 2]))).toEqual([1, 2]);
  });

  it('summarises an Error cause chain', () => {
    const error = new Error('outer', { cause: new Error('inner') });
    expect(sanitizeValue(error)).toEqual({
      name: 'Error',
      message: 'outer',
      cause: { name: 'Error', message: 'inner' },
    });
  });

  it('never mutates its input', () => {
    const input = { password: 'hunter2', nested: { token: 'abc' }, list: [1, 2] };
    const snapshot = JSON.stringify(input);
    sanitizeValue(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('sanitizeAttributes', () => {
  it('drops reserved keys so caller data cannot forge a platform field', () => {
    const result = sanitizeAttributes(
      { timestamp: 'fake', level: 'error', keep: 'ok' },
      new Set(['timestamp', 'level']),
    );
    expect(result).toEqual({ keep: 'ok' });
  });

  it('returns undefined when nothing survives', () => {
    expect(sanitizeAttributes(undefined, new Set())).toBeUndefined();
    expect(sanitizeAttributes({}, new Set())).toBeUndefined();
  });
});
