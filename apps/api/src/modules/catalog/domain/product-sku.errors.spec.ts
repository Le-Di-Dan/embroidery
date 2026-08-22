/**
 * `APP7-B01` — the SKU error contract.
 *
 * What matters here is what a browser is allowed to learn: a stable code, one
 * curated sentence, and no trace of the database that produced the refusal.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  isProductSkuError,
  PRODUCT_SKU_ERROR_CODES,
  productSkuError,
  toHttpException,
  type ProductSkuErrorCode,
} from './product-sku.errors';

describe('SKU error contract', () => {
  it('recognises its own error and nothing else', () => {
    expect(isProductSkuError(productSkuError('SKU_NOT_FOUND'))).toBe(true);
    expect(isProductSkuError(new Error('SKU_NOT_FOUND'))).toBe(false);
  });

  it.each([
    ['SKU_PRODUCT_NOT_FOUND', NotFoundException],
    ['SKU_VARIANT_NOT_FOUND', NotFoundException],
    // The addressed resource is "this variant under this product", and that
    // genuinely does not exist — so it is a miss, not a malformed request.
    ['SKU_VARIANT_PRODUCT_MISMATCH', NotFoundException],
    ['SKU_NOT_FOUND', NotFoundException],
    ['SKU_PRODUCT_NOT_AUTHORABLE', ConflictException],
    ['SKU_CODE_CONFLICT', ConflictException],
    ['SKU_ORDER_ELIGIBLE_AMBIGUOUS', ConflictException],
  ] as const)('maps %s to the right status', (code, exception) => {
    expect(toHttpException(productSkuError(code))).toBeInstanceOf(exception);
  });

  it('publishes the code and a message, and never a database fact', () => {
    for (const code of PRODUCT_SKU_ERROR_CODES) {
      const payload = toHttpException(productSkuError(code)).getResponse() as {
        code: ProductSkuErrorCode;
        message: string;
      };
      expect(payload.code).toBe(code);
      expect(payload.message.length).toBeGreaterThan(0);
      // No SQLSTATE, no constraint name, no table name, no column name.
      expect(payload.message).not.toMatch(/23\d{3}|uq_|ck_|fk_|skus|product_variants|select /i);
    }
  });

  it('states the hierarchy mismatch as its own sentence', () => {
    // Reporting it as "no such variant" would send an operator who addressed
    // the right variant under the wrong product looking for a row that is there.
    expect(productSkuError('SKU_VARIANT_PRODUCT_MISMATCH').message).not.toBe(
      productSkuError('SKU_VARIANT_NOT_FOUND').message,
    );
  });
});
