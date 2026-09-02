/**
 * `ready-made-order-fingerprint.ts` — what makes a retry a replay, and what
 * makes it a conflict (`BR-023`, GRD-030).
 *
 * Two properties, and both matter in opposite directions:
 *
 * - a fingerprint that changed too easily would turn an honest retry into an
 *   `IDEMPOTENCY_CONFLICT`, which is the inverse of the guarantee;
 * - one that changed too rarely would let a *different* order replay as an
 *   earlier one — a customer's second address silently ignored.
 */
import {
  canonicalReadyMadeOrderPreimage,
  readyMadeOrderFingerprint,
  READY_MADE_ORDER_FINGERPRINT_PATTERN,
  type ReadyMadeOrderFingerprintInput,
} from './ready-made-order-fingerprint';

const BASE: ReadyMadeOrderFingerprintInput = {
  skuId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
  quantity: 3,
  delivery: {
    recipientName: 'Nguyen Van A',
    recipientPhone: '0900000000',
    addressLine: '12 Le Loi',
    ward: 'Ben Nghe',
    district: 'Quan 1',
    province: 'Ho Chi Minh',
  },
};

function withDelivery(
  patch: Partial<ReadyMadeOrderFingerprintInput['delivery']>,
): ReadyMadeOrderFingerprintInput {
  return { ...BASE, delivery: { ...BASE.delivery, ...patch } };
}

describe('APP12-B02 Ready-Made order fingerprint', () => {
  it('is a sha256 digest in the repository-wide form', () => {
    expect(readyMadeOrderFingerprint(BASE)).toMatch(READY_MADE_ORDER_FINGERPRINT_PATTERN);
  });

  it('is stable across runs over the same facts', () => {
    expect(readyMadeOrderFingerprint(BASE)).toBe(readyMadeOrderFingerprint({ ...BASE }));
  });

  describe('what changes it — the customer actually asked for something else', () => {
    it.each([
      ['the SKU', { ...BASE, skuId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073' }],
      ['the quantity', { ...BASE, quantity: 4 }],
      ['the recipient', withDelivery({ recipientName: 'Tran Thi B' })],
      ['the phone', withDelivery({ recipientPhone: '0911111111' })],
      ['the address', withDelivery({ addressLine: '99 Somewhere Else' })],
      ['the ward', withDelivery({ ward: 'Da Kao' })],
      ['the district', withDelivery({ district: 'Quan 3' })],
      ['the province', withDelivery({ province: 'Ha Noi' })],
    ])('%s', (_label, changed) => {
      expect(readyMadeOrderFingerprint(changed)).not.toBe(readyMadeOrderFingerprint(BASE));
    });

    it('distinguishes an omitted optional field from an empty one', () => {
      const omitted = withDelivery({ ward: undefined });
      const empty = withDelivery({ ward: '' });
      expect(readyMadeOrderFingerprint(omitted)).not.toBe(readyMadeOrderFingerprint(empty));
    });
  });

  describe('the encoding cannot be gamed by concatenation', () => {
    it('does not collide when a boundary moves between two fields', () => {
      // `"ab" + "c"` and `"a" + "bc"` are different orders, and length
      // prefixing is what keeps them different digests.
      const left = withDelivery({ ward: 'ab', district: 'c' });
      const right = withDelivery({ ward: 'a', district: 'bc' });
      expect(readyMadeOrderFingerprint(left)).not.toBe(readyMadeOrderFingerprint(right));
    });

    it('length-prefixes every field and marks an absent one', () => {
      const preimage = canonicalReadyMadeOrderPreimage(withDelivery({ ward: undefined }));
      expect(preimage).toContain('-:');
      expect(preimage.split('|')).toHaveLength(8);
    });
  });

  describe('what deliberately does not change it', () => {
    it('carries no price, currency or total in its pre-image', () => {
      // `BR-021` — a price is the server's answer to the customer's intent, not
      // part of it. Including one would make a retry arriving moments after a
      // Catalog edit a conflict rather than the replay the contract promises.
      const preimage = canonicalReadyMadeOrderPreimage(BASE);
      expect(preimage).not.toContain('VND');
      expect(preimage).not.toContain('150000');
      expect(preimage).not.toContain('.00');
    });

    it('carries no customer id, challenge id or order code', () => {
      const preimage = canonicalReadyMadeOrderPreimage(BASE);
      // The scope key already binds the challenge; repeating it in the
      // fingerprint would make every key trivially self-consistent.
      expect(preimage).not.toContain('ORD-');
      expect(preimage.split('|')).toHaveLength(8);
    });
  });
});
