/**
 * The delivery envelope (`APP4-B01`, `ADR-APP4-001` §6).
 *
 * Every key and secret below is synthetic. The tamper cases matter most: an AEAD
 * whose authentication is not actually verified is indistinguishable from one
 * that works, right up to the moment someone edits a row.
 */
import { randomBytes } from 'node:crypto';

import {
  DELIVERY_ENVELOPE_ALGORITHM,
  DELIVERY_ENVELOPE_VERSION,
  DELIVERY_SECRET_KINDS,
  ENVELOPE_IV_BYTES,
  ENVELOPE_KEY_BYTES,
  NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV,
  SECURE_LINK_LANDINGS,
  isDeliveryEnvelope,
  isDeliverySecretKind,
  isSecureLinkLanding,
  loadEnvelopeKey,
  openDeliveryEnvelope,
  parseEnvelopeKey,
  sealDeliveryEnvelope,
  type DeliveryPayload,
  type SecureLinkLanding,
} from '../../src/index';

const ENV_NAME = NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV;

/** Deterministic synthetic keys: byte patterns, never an operator value. */
const KEY_A = Buffer.alloc(ENVELOPE_KEY_BYTES, 0x11).toString('base64');
const KEY_B = Buffer.alloc(ENVELOPE_KEY_BYTES, 0x22).toString('base64');

const keyA = parseEnvelopeKey(KEY_A, ENV_NAME);
const keyB = parseEnvelopeKey(KEY_B, ENV_NAME);

/**
 * A payload for either secret kind, already carrying whatever that kind
 * requires.
 *
 * A secure link must name a landing and a verification code must not, so the
 * default is derived from `secretKind` rather than fixed — a fixture that
 * hard-coded one would make half the round-trip cases untestable without
 * per-case overrides.
 */
function payload(overrides: Partial<DeliveryPayload> = {}): DeliveryPayload {
  const secretKind = overrides.secretKind ?? 'VERIFICATION_CODE';
  const landing: Partial<DeliveryPayload> =
    secretKind === 'SECURE_LINK_TOKEN' ? { secureLinkLanding: 'REQUEST_ACCESS' } : {};
  return {
    secretKind: 'VERIFICATION_CODE',
    ...landing,
    originNotificationIntentId: 'intent-0001',
    channel: 'EMAIL',
    normalizedRecipient: 'someone@vidu.com',
    secret: 'synthetic-secret-value',
    issuedAt: '2026-08-14T09:12:04.000Z',
    expiresAt: '2026-08-14T09:22:04.000Z',
    ...overrides,
  };
}

describe('parseEnvelopeKey', () => {
  it('accepts a base64 key of exactly 32 decoded bytes', () => {
    expect(parseEnvelopeKey(KEY_A, ENV_NAME).bytes).toHaveLength(ENVELOPE_KEY_BYTES);
  });

  it.each([[undefined], [''], ['   ']])('fails closed on a missing/blank key (%s)', (raw) => {
    expect(() => parseEnvelopeKey(raw, ENV_NAME)).toThrow(new RegExp(`${ENV_NAME} is required`));
  });

  it('rejects malformed base64 rather than keying AES with the debris', () => {
    // Node's decoder skips characters outside the alphabet, so this would
    // otherwise decode to *something*.
    expect(() => parseEnvelopeKey('not a real key!!!!', ENV_NAME)).toThrow(/not valid base64/);
  });

  it.each([
    [16, 'too short'],
    [31, 'one byte short'],
    [64, 'too long'],
  ])('rejects a key that decodes to %s bytes (%s)', (size) => {
    const wrong = Buffer.alloc(size, 0x33).toString('base64');
    expect(() => parseEnvelopeKey(wrong, ENV_NAME)).toThrow(
      new RegExp(`must decode to exactly ${String(ENVELOPE_KEY_BYTES)} bytes`),
    );
  });

  it('names the variable but never the value', () => {
    for (const raw of [undefined, '', 'not a real key!!!!', Buffer.alloc(8).toString('base64')]) {
      let message = '';
      try {
        parseEnvelopeKey(raw, ENV_NAME);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain(ENV_NAME);
      expect(message).not.toContain(KEY_A);
      if (typeof raw === 'string' && raw !== '' && raw.trim() !== '') {
        expect(message).not.toContain(raw);
      }
    }
  });

  it('reads the key from an environment map without touching process.env', () => {
    expect(loadEnvelopeKey({ [ENV_NAME]: KEY_A }).bytes).toEqual(keyA.bytes);
    expect(() => loadEnvelopeKey({})).toThrow(new RegExp(`${ENV_NAME} is required`));
  });
});

describe('sealDeliveryEnvelope', () => {
  it.each(DELIVERY_SECRET_KINDS)('round-trips a %s payload', (secretKind) => {
    const original = payload({ secretKind });
    const opened = openDeliveryEnvelope(keyA, sealDeliveryEnvelope(keyA, original));
    expect(opened).toEqual(original);
  });

  it('stamps the locked version and algorithm', () => {
    const envelope = sealDeliveryEnvelope(keyA, payload());
    expect(envelope.version).toBe(DELIVERY_ENVELOPE_VERSION);
    expect(DELIVERY_ENVELOPE_VERSION).toBe(1);
    expect(envelope.algorithm).toBe(DELIVERY_ENVELOPE_ALGORITHM);
    expect(DELIVERY_ENVELOPE_ALGORITHM).toBe('AES-256-GCM');
  });

  it('uses a 96-bit nonce', () => {
    const envelope = sealDeliveryEnvelope(keyA, payload());
    expect(Buffer.from(envelope.iv, 'base64url')).toHaveLength(ENVELOPE_IV_BYTES);
    expect(ENVELOPE_IV_BYTES * 8).toBe(96);
  });

  it('uses a fresh nonce for every seal', () => {
    const nonces = new Set(
      Array.from({ length: 5 }, () => sealDeliveryEnvelope(keyA, payload()).iv),
    );
    expect(nonces.size).toBe(5);
  });

  it('leaks nothing through the outer shape', () => {
    const original = payload();
    const serialized = JSON.stringify(sealDeliveryEnvelope(keyA, original));
    for (const leak of [
      original.secret,
      original.normalizedRecipient,
      original.originNotificationIntentId,
      original.secretKind,
      original.channel,
      original.issuedAt,
    ]) {
      expect(serialized).not.toContain(leak);
    }
    expect(Object.keys(JSON.parse(serialized) as object).sort()).toEqual([
      'algorithm',
      'authTag',
      'ciphertext',
      'iv',
      'version',
    ]);
  });

  it('refuses an unknown secret kind', () => {
    const rogue = payload({ secretKind: 'PASSWORD_RESET' as never });
    expect(() => sealDeliveryEnvelope(keyA, rogue)).toThrow(/Unknown delivery secret kind/);
  });

  describe('the secure-link landing (APP12-S03-C1)', () => {
    it.each(SECURE_LINK_LANDINGS)('round-trips a %s link', (secureLinkLanding) => {
      const original = payload({ secretKind: 'SECURE_LINK_TOKEN', secureLinkLanding });
      expect(openDeliveryEnvelope(keyA, sealDeliveryEnvelope(keyA, original))).toEqual(original);
    });

    it('refuses to seal a secure link that names no landing', () => {
      // The moment the fact becomes unrecoverable: after this call nothing
      // downstream has a grant table to ask where the token points.
      const { secureLinkLanding: _dropped, ...rest } = payload({ secretKind: 'SECURE_LINK_TOKEN' });

      expect(() => sealDeliveryEnvelope(keyA, rest as DeliveryPayload)).toThrow(
        /must name its landing/,
      );
    });

    it('refuses to seal a secure link whose landing is not a known one', () => {
      const rogue = payload({
        secretKind: 'SECURE_LINK_TOKEN',
        secureLinkLanding: 'ACCOUNT_ACCESS' as SecureLinkLanding,
      });

      expect(() => sealDeliveryEnvelope(keyA, rogue)).toThrow(/must name its landing/);
    });

    it('refuses to seal a verification code that carries a landing', () => {
      // A code becomes no URL, so a landing on one means the caller confused the
      // two secrets — which is worth failing on rather than ignoring.
      const rogue = payload({ secureLinkLanding: 'ORDER_ACCESS' });

      expect(() => sealDeliveryEnvelope(keyA, rogue)).toThrow(/Only a secure-link delivery/);
    });

    it('leaks the landing no further than the ciphertext', () => {
      const original = payload({
        secretKind: 'SECURE_LINK_TOKEN',
        secureLinkLanding: 'ORDER_ACCESS',
      });

      expect(JSON.stringify(sealDeliveryEnvelope(keyA, original))).not.toContain('ORDER_ACCESS');
    });

    it('still opens an envelope sealed before landings existed', () => {
      // An `APP4-B08` manual replay copies historical ciphertext byte-identically.
      // Rejecting it here would turn every one of those into an unreadable
      // envelope; the missing landing is refused at rendering time instead.
      const legacy = openDeliveryEnvelope(
        keyA,
        sealDeliveryEnvelope(keyA, payload({ secretKind: 'VERIFICATION_CODE' })),
      );

      expect(legacy.secureLinkLanding).toBeUndefined();
    });
  });

  it('refuses a random source that returns the wrong nonce length', () => {
    expect(() => sealDeliveryEnvelope(keyA, payload(), () => randomBytes(8))).toThrow(
      /12-byte nonce/,
    );
  });
});

describe('openDeliveryEnvelope', () => {
  it('rejects a tampered ciphertext', () => {
    const envelope = sealDeliveryEnvelope(keyA, payload());
    const bytes = Buffer.from(envelope.ciphertext, 'base64url');
    bytes.writeUInt8(bytes.readUInt8(0) ^ 0xff, 0);
    const tampered = { ...envelope, ciphertext: bytes.toString('base64url') };
    expect(() => openDeliveryEnvelope(keyA, tampered)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const envelope = sealDeliveryEnvelope(keyA, payload());
    const tag = Buffer.from(envelope.authTag, 'base64url');
    tag.writeUInt8(tag.readUInt8(0) ^ 0xff, 0);
    expect(() =>
      openDeliveryEnvelope(keyA, { ...envelope, authTag: tag.toString('base64url') }),
    ).toThrow();
  });

  it('rejects a tampered nonce', () => {
    const envelope = sealDeliveryEnvelope(keyA, payload());
    const iv = Buffer.from(envelope.iv, 'base64url');
    iv.writeUInt8(iv.readUInt8(0) ^ 0xff, 0);
    expect(() =>
      openDeliveryEnvelope(keyA, { ...envelope, iv: iv.toString('base64url') }),
    ).toThrow();
  });

  it('rejects the wrong key', () => {
    const envelope = sealDeliveryEnvelope(keyA, payload());
    expect(() => openDeliveryEnvelope(keyB, envelope)).toThrow();
  });

  it('rejects an unsupported version before touching key material', () => {
    const envelope = { ...sealDeliveryEnvelope(keyA, payload()), version: 2 };
    expect(() => openDeliveryEnvelope(keyA, envelope)).toThrow(
      /Unsupported delivery envelope version 2/,
    );
  });

  it('rejects an unsupported algorithm', () => {
    const envelope = { ...sealDeliveryEnvelope(keyA, payload()), algorithm: 'AES-256-CBC' };
    expect(() => openDeliveryEnvelope(keyA, envelope)).toThrow(
      /Unsupported delivery envelope algorithm/,
    );
  });

  it('rejects a nonce of the wrong length', () => {
    const envelope = {
      ...sealDeliveryEnvelope(keyA, payload()),
      iv: Buffer.alloc(8).toString('base64url'),
    };
    expect(() => openDeliveryEnvelope(keyA, envelope)).toThrow(/nonce has the wrong length/);
  });

  it.each([[null], [undefined], ['string'], [42], [{}], [{ version: 1 }]])(
    'rejects a malformed envelope (%s)',
    (value) => {
      expect(() => openDeliveryEnvelope(keyA, value)).toThrow(/malformed/);
    },
  );
});

describe('contract guards', () => {
  it('recognises exactly the two locked secret kinds', () => {
    expect([...DELIVERY_SECRET_KINDS]).toEqual(['VERIFICATION_CODE', 'SECURE_LINK_TOKEN']);
    expect(isDeliverySecretKind('VERIFICATION_CODE')).toBe(true);
    expect(isDeliverySecretKind('SECURE_LINK_TOKEN')).toBe(true);
    expect(isDeliverySecretKind('PASSWORD_RESET')).toBe(false);
    expect(isDeliverySecretKind(1)).toBe(false);
  });

  it('recognises exactly the two locked landings', () => {
    expect([...SECURE_LINK_LANDINGS]).toEqual(['REQUEST_ACCESS', 'ORDER_ACCESS']);
    expect(isSecureLinkLanding('REQUEST_ACCESS')).toBe(true);
    expect(isSecureLinkLanding('ORDER_ACCESS')).toBe(true);
    expect(isSecureLinkLanding('ACCOUNT_ACCESS')).toBe(false);
    expect(isSecureLinkLanding('/truy-cap')).toBe(false);
    expect(isSecureLinkLanding(undefined)).toBe(false);
  });

  it('recognises a well-formed envelope', () => {
    expect(isDeliveryEnvelope(sealDeliveryEnvelope(keyA, payload()))).toBe(true);
    expect(
      isDeliveryEnvelope({ version: '1', algorithm: 'x', iv: 'y', ciphertext: 'z', authTag: 'w' }),
    ).toBe(false);
    expect(isDeliveryEnvelope(null)).toBe(false);
  });
});
