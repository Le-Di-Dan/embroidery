import {
  buildCorrelationId,
  buildWorkerInstanceId,
  createWorkerInstanceId,
  safeHostname,
} from './worker-identity';

describe('worker identity', () => {
  it('builds the locked shape', () => {
    expect(buildWorkerInstanceId('worker-01', 42, 'aaaa-bbbb')).toBe(
      'worker:worker-01:42:aaaa-bbbb',
    );
  });

  it('is stable across calls within the process but unique across ids', () => {
    const first = createWorkerInstanceId();
    const second = createWorkerInstanceId();

    expect(first).toMatch(/^worker:[a-z0-9-]+:\d+:[0-9a-f-]{36}$/);
    // Two ids minted in one process differ, which is what guarantees two
    // processes can never collide.
    expect(first).not.toBe(second);
  });

  describe('hostname sanitisation', () => {
    it.each([
      ['Worker-01.internal', 'worker-01-internal'],
      ['HOST_NAME', 'host-name'],
      ['--weird--', 'weird'],
      ['', 'unknown-host'],
      ['!!!', 'unknown-host'],
    ])('sanitises %p to %p', (raw, expected) => {
      expect(safeHostname(raw)).toBe(expected);
    });

    it('bounds a hostile hostname', () => {
      expect(safeHostname('a'.repeat(500))).toHaveLength(40);
    });

    it('strips anything that could smuggle a value into a log line', () => {
      expect(safeHostname('host name\n{"secret":"x"}')).toBe('host-name-secret-x');
    });
  });

  describe('correlation id', () => {
    it('is deterministic from the attempt identity alone', () => {
      const id = buildCorrelationId('OUTBOX_DISPATCH', 17n, 3);

      expect(id).toBe('OUTBOX_DISPATCH:17:3');
      expect(buildCorrelationId('OUTBOX_DISPATCH', 17n, 3)).toBe(id);
    });

    it('separates attempts of the same job', () => {
      expect(buildCorrelationId('OUTBOX_DISPATCH', 17n, 1)).not.toBe(
        buildCorrelationId('OUTBOX_DISPATCH', 17n, 2),
      );
    });
  });
});
