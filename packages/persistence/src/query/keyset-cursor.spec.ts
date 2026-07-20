/**
 * Cursor encoding, validation and page building (DB7-CP3).
 *
 * These are pure functions, so this is a unit suite; the repository integration
 * suites prove the cursors actually paginate the DB5 orderings correctly.
 */
import {
  buildPage,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  InvalidCursorError,
  MAX_PAGE_SIZE,
  resolveLimit,
} from './keyset-cursor';

describe('keyset cursors', () => {
  describe('round trip', () => {
    it('restores the ordering values it was given', () => {
      const cursor = { sortValue: '2026-07-20T10:00:00.000Z', tieBreaker: 'abc-123' };
      expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    });

    it('produces a URL-safe token', () => {
      const encoded = encodeCursor({ sortValue: 'a/b+c=', tieBreaker: 'x?y&z' });
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('survives values containing quotes and separators', () => {
      const cursor = { sortValue: `it's "quoted", isn't it`, tieBreaker: 'a,b|c' };
      expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    });
  });

  describe('validation', () => {
    it.each([
      ['an empty string', ''],
      ['non-base64 text', '!!!not base64!!!'],
      ['base64 of invalid JSON', Buffer.from('{oops', 'utf8').toString('base64url')],
      ['a JSON object rather than a pair', Buffer.from('{"a":1}', 'utf8').toString('base64url')],
      ['a pair of the wrong length', Buffer.from('["a"]', 'utf8').toString('base64url')],
      ['a pair with a non-string member', Buffer.from('["a",7]', 'utf8').toString('base64url')],
      ['an over-long cursor', 'A'.repeat(600)],
    ])('rejects %s', (_label, encoded) => {
      expect(() => decodeCursor(encoded)).toThrow(InvalidCursorError);
    });

    it('gives every failure the same message, so the format cannot be probed', () => {
      const messages = ['', '!!!', 'A'.repeat(600)].map((value) => {
        try {
          decodeCursor(value);
          return 'no error';
        } catch (error: unknown) {
          return (error as Error).message;
        }
      });

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('limits', () => {
    it('defaults when no limit is given', () => {
      expect(resolveLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('clamps an oversized request rather than failing it', () => {
      expect(resolveLimit(10_000)).toBe(MAX_PAGE_SIZE);
    });

    it('passes through a valid limit', () => {
      expect(resolveLimit(5)).toBe(5);
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects %p, which is a caller bug', (limit) => {
      expect(() => resolveLimit(limit)).toThrow(RangeError);
    });
  });

  describe('page building', () => {
    const toCursor = (row: { at: string; id: string }) => ({
      sortValue: row.at,
      tieBreaker: row.id,
    });
    const rows = [
      { at: '3', id: 'c' },
      { at: '2', id: 'b' },
      { at: '1', id: 'a' },
    ];

    it('reports no next cursor when the page is not full', () => {
      const page = buildPage(rows.slice(0, 2), 5, toCursor);
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeUndefined();
    });

    it('reports no next cursor when the rows exactly fill the page', () => {
      const page = buildPage(rows, 3, toCursor);
      expect(page.items).toHaveLength(3);
      expect(page.nextCursor).toBeUndefined();
    });

    it('discards the over-fetched row and returns a cursor for the last kept one', () => {
      const page = buildPage(rows, 2, toCursor);

      expect(page.items).toEqual(rows.slice(0, 2));
      expect(page.nextCursor).toBeDefined();
      expect(decodeCursor(page.nextCursor as string)).toEqual({ sortValue: '2', tieBreaker: 'b' });
    });

    it('handles an empty result', () => {
      const page = buildPage([], 10, toCursor);
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeUndefined();
    });
  });
});
