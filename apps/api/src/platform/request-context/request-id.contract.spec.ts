import {
  REQUEST_ID_MAX_LENGTH,
  REQUEST_ID_PATTERN_SOURCE,
  generateRequestId,
  isValidRequestId,
} from './request-id.contract';

describe('request-ID contract', () => {
  describe('accepted values', () => {
    it.each([
      ['single character', 'a'],
      ['digit', '7'],
      ['nginx native id shape', '0f8ab1c2d3e4f5061728394a5b6c7d8e'],
      ['uuid', '3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
      ['dot separator', 'trace.1'],
      ['underscore separator', 'trace_1'],
      ['hyphen separator', 'trace-1'],
      ['mixed case', 'AbCdEf'],
      ['exactly the maximum length', 'a'.repeat(REQUEST_ID_MAX_LENGTH)],
    ])('accepts %s', (_label, value) => {
      expect(isValidRequestId(value)).toBe(true);
    });
  });

  describe('rejected values', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
      ['a single space', ' '],
      ['one character over the maximum', 'a'.repeat(REQUEST_ID_MAX_LENGTH + 1)],
      ['an inner space', 'abc def'],
      ['surrounding whitespace', ' abc '],
      ['a tab', 'abc\tdef'],
      ['a newline', 'abc\ndef'],
      ['a NUL control character', `abc${String.fromCharCode(0)}def`],
      ['a DEL control character', `abc${String.fromCharCode(127)}def`],
      ['a quote', 'abc"def'],
      ['a single quote', "abc'def"],
      ['braces', '{abc}'],
      ['a comma-joined proxy value', 'abc,def'],
      ['a semicolon', 'abc;def'],
      ['a slash', 'abc/def'],
      ['a colon', 'abc:def'],
      ['non-ASCII text', 'trace-café'],
      ['an emoji', 'trace-🙂'],
      ['a multi-value header array', ['abc', 'def']],
      ['a single-element array', ['abc']],
      ['a number', 42],
      ['an object', { requestId: 'abc' }],
    ])('rejects %s', (_label, value) => {
      expect(isValidRequestId(value)).toBe(false);
    });
  });

  it('never trims an invalid value into a valid one', () => {
    // Allowlist semantics: the value is accepted as received or not at all.
    // Trimming would admit values the gateway rejected.
    expect(isValidRequestId(' abc ')).toBe(false);
    expect(isValidRequestId('abc')).toBe(true);
  });

  it('exposes a pattern with no global flag so validation is order-independent', () => {
    const first = isValidRequestId('abc');
    const second = isValidRequestId('abc');
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('anchors the pattern at both ends', () => {
    expect(REQUEST_ID_PATTERN_SOURCE.startsWith('^')).toBe(true);
    expect(REQUEST_ID_PATTERN_SOURCE.endsWith('$')).toBe(true);
  });

  describe('generated fallback', () => {
    it('always satisfies the contract it is validated against', () => {
      for (let index = 0; index < 500; index += 1) {
        const generated = generateRequestId();
        expect(isValidRequestId(generated)).toBe(true);
        expect(generated.length).toBeLessThanOrEqual(REQUEST_ID_MAX_LENGTH);
      }
    });

    it('produces a distinct value on every call', () => {
      const generated = new Set(Array.from({ length: 500 }, () => generateRequestId()));
      expect(generated.size).toBe(500);
    });

    it('contains no timestamp, hostname or process identifier', () => {
      const generated = generateRequestId();
      expect(generated).not.toContain(String(process.pid));
      expect(generated).not.toContain(String(new Date().getFullYear()));
    });
  });
});
