/**
 * The published submission body (`APP5-B01` §12).
 *
 * These are contract assertions, not validator unit tests: what matters is that
 * the *server-owned* facts are unsayable, that each branch object is complete or
 * absent rather than partially satisfiable, and that `ATTACHMENT` cannot enter
 * through the transport. Each of those is a rule an edit could quietly relax,
 * and none of them is visible from a happy-path integration test.
 */
import { submitCustomRequestSchema } from './public-custom-request.request';

const CHALLENGE = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const PRODUCT = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const VARIANT = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const SESSION = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6074';
const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6075';

const catalogBody = {
  challengeId: CHALLENGE,
  catalog: { productId: PRODUCT, productVariantId: VARIANT, designSessionId: SESSION },
  breakdown: [{ sizeLabel: 'M', quantity: 10 }],
};

const accepts = (body: unknown): boolean => submitCustomRequestSchema.safeParse(body).success;

describe('APP5-B01 submission body', () => {
  it('accepts a catalog submission', () => {
    expect(accepts(catalogBody)).toBe(true);
  });

  it('accepts a customer-owned submission with a bound COP image', () => {
    expect(
      accepts({
        challengeId: CHALLENGE,
        customerOwnedProduct: { name: 'Áo khoác' },
        assets: [{ assetId: ASSET, role: 'COP_IMAGE' }],
      }),
    ).toBe(true);
  });

  it('defaults the optional collections so a minimal COP body parses', () => {
    const parsed = submitCustomRequestSchema.parse({
      challengeId: CHALLENGE,
      customerOwnedProduct: { name: 'Áo khoác' },
    });
    expect(parsed.breakdown).toEqual([]);
    expect(parsed.assets).toEqual([]);
  });

  describe('server-owned facts are unsayable', () => {
    it.each([
      ['customerId', { customerId: PRODUCT }],
      ['requestId', { requestId: PRODUCT }],
      ['code', { code: 'REQ-ABCDEFGHJK' }],
      ['status', { status: 'NEW' }],
      ['submittedSessionId', { submittedSessionId: SESSION }],
      ['idempotencyKey', { idempotencyKey: 'anything' }],
      ['correlationId', { correlationId: 'anything' }],
    ])('rejects a client-supplied %s', (_name, extra) => {
      expect(accepts({ ...catalogBody, ...extra })).toBe(false);
    });
  });

  describe('branch objects are complete or absent', () => {
    it('rejects a catalog subject without a variant (G01-D08)', () => {
      expect(
        accepts({
          challengeId: CHALLENGE,
          catalog: { productId: PRODUCT, designSessionId: SESSION },
        }),
      ).toBe(false);
    });

    it('rejects a catalog subject without its design session', () => {
      expect(
        accepts({
          challengeId: CHALLENGE,
          catalog: { productId: PRODUCT, productVariantId: VARIANT },
        }),
      ).toBe(false);
    });

    it('rejects an unknown field inside a branch object', () => {
      expect(accepts({ ...catalogBody, catalog: { ...catalogBody.catalog, sneak: 1 } })).toBe(
        false,
      );
    });

    it('rejects a customer-owned product with no name', () => {
      expect(accepts({ challengeId: CHALLENGE, customerOwnedProduct: {} })).toBe(false);
    });

    it('parses both-present and neither-present, which the application then refuses', () => {
      // Deliberate: `SUBMISSION_SUBJECT_INVALID` is a named G01 refusal, so the
      // shape has to be sayable for the API to be able to give it.
      expect(accepts({ ...catalogBody, customerOwnedProduct: { name: 'Áo' } })).toBe(true);
      expect(accepts({ challengeId: CHALLENGE })).toBe(true);
    });
  });

  describe('asset bindings', () => {
    it('rejects the ATTACHMENT role at the contract boundary (G01-D14)', () => {
      expect(accepts({ ...catalogBody, assets: [{ assetId: ASSET, role: 'ATTACHMENT' }] })).toBe(
        false,
      );
    });

    it('rejects a binding that names a storage key instead of an asset id', () => {
      expect(
        accepts({
          ...catalogBody,
          assets: [{ assetId: 'customer/private/x.jpg', role: 'REFERENCE' }],
        }),
      ).toBe(false);
    });
  });

  describe('quantity lines', () => {
    it('rejects a non-positive quantity', () => {
      expect(accepts({ ...catalogBody, breakdown: [{ sizeLabel: 'M', quantity: 0 }] })).toBe(false);
    });

    it('rejects a fractional quantity', () => {
      expect(accepts({ ...catalogBody, breakdown: [{ sizeLabel: 'M', quantity: 1.5 }] })).toBe(
        false,
      );
    });

    it('rejects one size stated twice — the unique index would abort the transaction', () => {
      expect(
        accepts({
          ...catalogBody,
          breakdown: [
            { sizeLabel: 'M', quantity: 1 },
            { sizeLabel: 'M', quantity: 2 },
          ],
        }),
      ).toBe(false);
    });

    it('rejects a client-chosen variant on a line — the server sets it', () => {
      expect(
        accepts({
          ...catalogBody,
          breakdown: [{ sizeLabel: 'M', quantity: 1, productVariantId: VARIANT }],
        }),
      ).toBe(false);
    });
  });
});
