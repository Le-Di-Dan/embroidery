/**
 * Exact VND arithmetic and the derived quotation facts (`APP6-B01`).
 *
 * The suite exists to prove one property in several ways: **no amount ever
 * becomes a JS number**, and every derived figure satisfies the CHECK
 * constraints (CST-064) before the insert is attempted. Several cases below are
 * chosen precisely because a `parseFloat` implementation would pass the happy
 * path and fail them.
 *
 * The deposit share is supplied by each test, never imported from the dataset:
 * these are arithmetic tests, and pinning them to the published `40` would make
 * them fail the day the business changes a policy value they do not govern.
 */
import { computeDraftPricing, type DraftPricingInput } from './quotation-pricing';
import type { QuotationDepositPolicy } from './quotation-deposit-policy';
import {
  formatVndAmount,
  parsePercentHundredths,
  parseVndAmount,
  percentageOfVnd,
  type VndAmount,
} from './vnd-amount';

/** 40 % expressed the way `deposit_percent numeric(5,2)` holds it. */
const FORTY_PERCENT: QuotationDepositPolicy = { depositPercentHundredths: 4_000n };

function amount(text: string): VndAmount {
  const parsed = parseVndAmount(text);
  if (parsed === undefined) {
    throw new Error(`fixture amount ${text} is not parseable`);
  }
  return parsed;
}

function draft(overrides: Partial<DraftPricingInput> = {}): DraftPricingInput {
  return {
    lineItems: [
      {
        lineKind: 'PRODUCT',
        description: 'Polo shirt',
        skuId: undefined,
        quantity: 10,
        unitPriceAmount: '150000',
      },
    ],
    shippingFeeAmount: '50000',
    manualAdjustmentAmount: undefined,
    adjustmentReason: undefined,
    ...overrides,
  };
}

function priced(input: DraftPricingInput = draft(), policy = FORTY_PERCENT) {
  const result = computeDraftPricing(input, policy);
  if (!result.ok) {
    throw new Error(`expected pricing to succeed, got: ${result.reason}`);
  }
  return result.pricing;
}

function refusal(input: DraftPricingInput, policy = FORTY_PERCENT): string {
  const result = computeDraftPricing(input, policy);
  if (result.ok) {
    throw new Error('expected pricing to be refused, but it succeeded');
  }
  return result.reason;
}

describe('VND amounts', () => {
  it('round-trips a large amount without loss', () => {
    // 999_999_999_999.99 is representable in `numeric(14,2)` and is beyond the
    // range where a double keeps cent precision.
    expect(formatVndAmount(amount('999999999999.99'))).toBe('999999999999.99');
  });

  it('accepts both spellings of the same amount', () => {
    expect(amount('1500000')).toBe(amount('1500000.00'));
  });

  it('refuses anything that is not a plain decimal', () => {
    for (const text of ['1e6', '1,500,000', ' 1500000', '+1500', '1.234', '1500000000000000']) {
      expect(parseVndAmount(text)).toBeUndefined();
    }
  });

  it('parses a percentage without floating point drift', () => {
    // 40.7 * 100 is 4070.0000000000005 in IEEE-754. Via the decimal string it
    // is exactly 4070.
    expect(parsePercentHundredths(40.7)).toBe(4_070n);
    expect(parsePercentHundredths(40)).toBe(4_000n);
    expect(parsePercentHundredths(101)).toBeUndefined();
    expect(parsePercentHundredths('40')).toBeUndefined();
  });

  it('rounds a share half up to a whole đồng', () => {
    // 40 % of 1001 is 400.4 → 400; of 1004 is 401.6 → 402; of 1005 is 402
    // exactly. The .5 case: 50 % of 1001 is 500.5 → 501.
    expect(formatVndAmount(percentageOfVnd(amount('1001'), 4_000n))).toBe('400.00');
    expect(formatVndAmount(percentageOfVnd(amount('1004'), 4_000n))).toBe('402.00');
    expect(formatVndAmount(percentageOfVnd(amount('1001'), 5_000n))).toBe('501.00');
  });
});

describe('draft pricing', () => {
  it('derives the line total, the subtotal and the total', () => {
    const pricing = priced();

    expect(pricing.lineItems[0]?.lineTotalAmount).toBe('1500000.00');
    expect(pricing.subtotalAmount).toBe('1500000.00');
    expect(pricing.totalAmount).toBe('1550000.00');
  });

  it('positions lines from one, in submitted order', () => {
    const pricing = priced(
      draft({
        lineItems: [
          {
            lineKind: 'PRODUCT',
            description: 'Shirt',
            skuId: undefined,
            quantity: 2,
            unitPriceAmount: '100000',
          },
          {
            lineKind: 'DIGITIZING_FEE',
            description: 'Digitizing',
            skuId: undefined,
            quantity: 1,
            unitPriceAmount: '300000',
          },
        ],
      }),
    );

    expect(pricing.lineItems.map((line) => line.position)).toEqual([1, 2]);
    expect(pricing.subtotalAmount).toBe('500000.00');
  });

  it('satisfies CST-064: deposit + remaining is exactly the total', () => {
    // A total that does not divide evenly by the share is the case a naive
    // "remaining = 60 % of total" would break.
    const pricing = priced(
      draft({
        lineItems: [
          {
            lineKind: 'PRODUCT',
            description: 'Odd total',
            skuId: undefined,
            quantity: 1,
            unitPriceAmount: '1001',
          },
        ],
        shippingFeeAmount: '0',
      }),
    );

    expect(pricing.totalAmount).toBe('1001.00');
    expect(pricing.depositAmount).toBe('400.00');
    expect(pricing.remainingAmount).toBe('601.00');
    expect(amount(pricing.depositAmount) + amount(pricing.remainingAmount)).toBe(
      amount(pricing.totalAmount),
    );
  });

  it('satisfies CST-064 for every total in a range, at a share that never divides evenly', () => {
    // 33.33 % — chosen so almost every total rounds. If the complement were
    // computed from a percentage rather than by subtraction, this fails.
    const policy: QuotationDepositPolicy = { depositPercentHundredths: 3_333n };

    for (let unit = 997; unit <= 1_013; unit += 1) {
      const pricing = priced(
        draft({
          lineItems: [
            {
              lineKind: 'PRODUCT',
              description: 'Sweep',
              skuId: undefined,
              quantity: 1,
              unitPriceAmount: String(unit),
            },
          ],
          shippingFeeAmount: '0',
        }),
        policy,
      );

      expect(amount(pricing.depositAmount) + amount(pricing.remainingAmount)).toBe(
        amount(pricing.totalAmount),
      );
      // Both shares must be whole đồng — the VND scale CHECK.
      expect(pricing.depositAmount.endsWith('.00')).toBe(true);
      expect(pricing.remainingAmount.endsWith('.00')).toBe(true);
    }
  });

  it('publishes the deposit percentage it priced at, from policy', () => {
    expect(priced().depositPercent).toBe('40.00');
    expect(priced(draft(), { depositPercentHundredths: 3_333n }).depositPercent).toBe('33.33');
  });

  it('applies a negative manual adjustment with its reason', () => {
    const pricing = priced(
      draft({ manualAdjustmentAmount: '-100000', adjustmentReason: 'Returning customer' }),
    );

    expect(pricing.totalAmount).toBe('1450000.00');
    expect(pricing.manualAdjustmentAmount).toBe('-100000.00');
    expect(pricing.adjustmentReason).toBe('Returning customer');
  });

  it('defaults the adjustment to zero and carries no reason', () => {
    const pricing = priced();

    expect(pricing.manualAdjustmentAmount).toBe('0.00');
    expect(pricing.adjustmentReason).toBeUndefined();
  });

  it('refuses an adjustment with no reason, and a reason with no adjustment', () => {
    expect(refusal(draft({ manualAdjustmentAmount: '-1000' }))).toMatch(/needs a reason/);
    expect(refusal(draft({ adjustmentReason: 'why' }))).toMatch(/no manual adjustment/);
  });

  it('refuses a fractional đồng before the database has to', () => {
    expect(
      refusal(
        draft({
          lineItems: [
            {
              lineKind: 'PRODUCT',
              description: 'Fractional',
              skuId: undefined,
              quantity: 1,
              unitPriceAmount: '1500.50',
            },
          ],
        }),
      ),
    ).toMatch(/whole đồng/);
  });

  it('refuses a negative unit price and an adjustment that sinks the total', () => {
    expect(
      refusal(
        draft({
          lineItems: [
            {
              lineKind: 'PRODUCT',
              description: 'Negative',
              skuId: undefined,
              quantity: 1,
              unitPriceAmount: '-1000',
            },
          ],
        }),
      ),
    ).toMatch(/cannot be negative/);

    expect(
      refusal(
        draft({ manualAdjustmentAmount: '-99999999', adjustmentReason: 'Too generous' }),
      ),
    ).toMatch(/below zero/);
  });

  it('refuses a version with no priced line', () => {
    expect(refusal(draft({ lineItems: [] }))).toMatch(/at least one priced line/);
  });

  it('refuses a line total larger than the column can hold', () => {
    expect(
      refusal(
        draft({
          lineItems: [
            {
              lineKind: 'PRODUCT',
              description: 'Overflow',
              skuId: undefined,
              quantity: 1_000_000,
              unitPriceAmount: '999999999999',
            },
          ],
        }),
      ),
    ).toMatch(/larger than this system can price/);
  });
});
