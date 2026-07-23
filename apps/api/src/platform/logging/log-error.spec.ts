import { summarizeError } from './log-error';

describe('summarizeError', () => {
  it('redacts the message and omits the stack when disabled', () => {
    const summary = summarizeError(new Error('connect postgres://u:p@h/db'), false);
    expect(summary.name).toBe('Error');
    expect(summary.message).toContain('[REDACTED]');
    expect(summary.stack).toBeUndefined();
  });

  it('includes a bounded, redacted stack when enabled', () => {
    const error = new Error('boom');
    error.stack = `Error: boom\n${Array.from({ length: 50 }, () => '    at postgres://u:p@h/db').join('\n')}`;
    const summary = summarizeError(error, true);
    expect(summary.stack).toBeDefined();
    expect(summary.stack).not.toContain('postgres://u:p@h');
    expect((summary.stack ?? '').split('\n').length).toBeLessThanOrEqual(30);
  });

  it('carries a safe error code when present', () => {
    const error = Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
    expect(summarizeError(error, false).code).toBe('ECONNREFUSED');
  });

  it('reports a thrown non-Error by type only', () => {
    expect(summarizeError('a raw string', true)).toEqual({
      name: 'NonError',
      message: 'A non-Error value was thrown (string).',
    });
  });
});
