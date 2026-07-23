import { createTestQueryClient } from './query-client';

describe('createTestQueryClient', () => {
  it('returns a fresh instance each call (no shared singleton)', () => {
    expect(createTestQueryClient()).not.toBe(createTestQueryClient());
  });

  it('does not leak cached data between instances', () => {
    const first = createTestQueryClient();
    first.setQueryData(['k'], 'cached');
    const second = createTestQueryClient();
    expect(first.getQueryData(['k'])).toBe('cached');
    expect(second.getQueryData(['k'])).toBeUndefined();
  });

  it('disables retries so failures surface immediately', () => {
    expect(createTestQueryClient().getDefaultOptions().queries?.retry).toBe(false);
  });
});
