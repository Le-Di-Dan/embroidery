import { describe, expect, it } from '@jest/globals';

import { assertDisposableName, persistentDatabaseName } from './database.mjs';

describe('disposable-database guards', () => {
  it('reads the persistent database name from the base URL', () => {
    expect(persistentDatabaseName('postgres://embroidery:pw@localhost:5544/embroidery')).toBe(
      'embroidery',
    );
  });

  it('refuses to target the persistent database', () => {
    expect(() => assertDisposableName('embroidery', 'embroidery')).toThrow(/persistent database/);
  });

  it('accepts a disposable database name', () => {
    expect(() => assertDisposableName('embroidery_db7_e2e_123', 'embroidery')).not.toThrow();
  });
});
