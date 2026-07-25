/**
 * @jest-environment node
 */
import { toApiOriginBase } from '../../src/config/api-base';

describe('toApiOriginBase', () => {
  it('reduces the same-origin browser base to the origin', () => {
    // Generated operations add the `/api` prefix, so the base must be origin.
    expect(toApiOriginBase('/api')).toBe('/');
  });

  it('strips the redundant /api from the internal server base', () => {
    expect(toApiOriginBase('http://api:4000/api')).toBe('http://api:4000');
  });

  it('tolerates a trailing slash', () => {
    expect(toApiOriginBase('http://api:4000/api/')).toBe('http://api:4000');
    expect(toApiOriginBase('/api/')).toBe('/');
  });

  it('leaves a base without an /api suffix unchanged', () => {
    expect(toApiOriginBase('http://api:4000')).toBe('http://api:4000');
  });
});
