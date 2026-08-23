/**
 * `APP5-E01` correction — the upload idempotency key must exist off a secure
 * origin.
 *
 * The defect this covers was invisible to every unit and component test in the
 * repository because jsdom defines `crypto.randomUUID` regardless of secure
 * context, while Chrome does not define it at all on a plain-HTTP host. So the
 * cases below drive the *absence* explicitly rather than trusting the ambient
 * environment to reproduce it.
 */
import { newUploadIdempotencyKey } from '../../src/shared/utils/upload-idempotency-key';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The server contract: `[A-Za-z0-9._:-]{8,128}` (`parseIdempotencyKey`). */
const SERVER_ACCEPTED = /^[A-Za-z0-9._:-]{8,128}$/;

describe('newUploadIdempotencyKey', () => {
  const realCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  });

  function useCrypto(value: unknown): void {
    Object.defineProperty(globalThis, 'crypto', { value, configurable: true });
  }

  it('uses randomUUID when the origin is secure enough to have it', () => {
    const randomUUID = jest.fn(() => '11111111-2222-4333-8444-555555555555');
    useCrypto({ randomUUID, getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });

    expect(newUploadIdempotencyKey()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('still produces a server-acceptable v4 UUID when randomUUID is absent', () => {
    // Exactly the Chrome-on-plain-HTTP shape: getRandomValues present,
    // randomUUID undefined.
    useCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });

    const key = newUploadIdempotencyKey();
    expect(key).toMatch(UUID_V4);
    expect(key).toMatch(SERVER_ACCEPTED);
  });

  it('does not repeat a key across calls', () => {
    useCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });

    const keys = new Set(Array.from({ length: 200 }, () => newUploadIdempotencyKey()));
    expect(keys.size).toBe(200);
  });

  it('refuses rather than weakening the arbiter when no randomness exists', () => {
    // A weak fallback here would silently stop one customer action from being
    // one stored asset, which is the whole point of the key.
    useCrypto({});

    expect(() => newUploadIdempotencyKey()).toThrow(/cryptographic randomness/i);
  });
});
