/**
 * The public Ready-Made order-creation HTTP contract (`APP12-B02`).
 *
 * Most of what matters about this endpoint is an **absence**, and an absence
 * has no runtime signal: a future edit adding a `price` field to the body would
 * hand a client the authority `BR-021` reserves for the server, and one adding
 * `orderId` to the response would publish the raw identifier `BR-032` keeps off
 * the customer surface — while every functional test kept passing. So the
 * request fields, the response fields, the operation count and the forbidden
 * shapes are asserted from source and from the schema itself.
 *
 * `tsc` preserves JSDoc into the emitted output, so these scans deliberately
 * match *usage* — a decorator call, a declared property, a schema key — and not
 * a bare word. The comments in the files under test name the fields that are
 * absent in order to explain why, and saying so must not fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createOperationId } from '../../../openapi/operation-id';
import { createReadyMadeOrderSchema } from './schemas/public-ready-made-order.request';
import {
  ReadyMadeOrderCreatedResponse,
  ReadyMadeOrderSubtotalResponse,
} from './schemas/public-ready-made-order.response';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'public-ready-made-order.controller.ts'),
  'utf8',
);
const RESPONSE_SOURCE = readFileSync(
  join(__dirname, 'schemas', 'public-ready-made-order.response.ts'),
  'utf8',
);
const USE_CASE_SOURCE = readFileSync(
  join(__dirname, '..', 'application', 'ready-made', 'create-ready-made-order.use-case.ts'),
  'utf8',
);

/** Declared properties only — `name!: type;` at class-body indentation. */
function declaredProperties(source: string): string[] {
  return [...source.matchAll(/^ {2}(\w+)!:/gm)].map((match) => match[1] as string);
}

describe('APP12-B02 public Ready-Made order contract', () => {
  describe('the route is public and stays public', () => {
    it('declares no guard', () => {
      // A guard here could only re-read the challenge earlier and outside the
      // transaction that acts on it, and would make an anonymous checkout
      // unreachable. Its absence is the contract.
      expect(CONTROLLER_SOURCE).not.toContain('@UseGuards(');
    });

    it('is mounted under the public prefix', () => {
      expect(CONTROLLER_SOURCE).toContain("@Controller('public/ready-made-orders')");
    });

    it('publishes exactly one operation', () => {
      const methods = [...CONTROLLER_SOURCE.matchAll(/^ {2}@(Get|Post|Put|Patch|Delete)\(/gm)];
      expect(methods).toHaveLength(1);
      expect(methods[0]?.[1]).toBe('Post');
    });

    it('mints the canonical operation id the release gate classifies', () => {
      expect(createOperationId('publicReadyMadeOrder', 'create')).toBe(
        'publicReadyMadeOrder_create',
      );
    });

    it('declares no sub-route beside the collection POST', () => {
      // `APP12-B02` §4 — creation and reservation are one atomic business
      // command, so there is no reserve-stock, validate-stock or quote-order
      // route. Asserted as *usage*: the single route decorator takes no path
      // argument at all, which is what makes a sub-route unsayable here. The
      // file's prose names those routes to explain their absence, and a bare
      // word scan would fail on the explanation.
      const routeDecorators = [
        ...CONTROLLER_SOURCE.matchAll(/^ {2}@(?:Get|Post|Put|Patch|Delete)\(([^)]*)\)/gm),
      ];
      expect(routeDecorators).toHaveLength(1);
      expect(routeDecorators[0]?.[1]).toBe('');
    });
  });

  describe('the request accepts only the customer choices', () => {
    const shape = createReadyMadeOrderSchema.shape;

    it('accepts exactly four top-level fields', () => {
      expect(Object.keys(shape).sort()).toEqual(['challengeId', 'delivery', 'quantity', 'skuId']);
    });

    it.each([
      'productId',
      'productName',
      'variantLabel',
      'sizeLabel',
      'unitPrice',
      'lineTotal',
      'currency',
      'shippingFee',
      'finalTotal',
      'availableQuantity',
      'status',
      'origin',
      'reservationExpiresAt',
      'customerId',
      'idempotencyKey',
    ])('has no field a client could use to state %s', (field) => {
      expect(Object.keys(shape)).not.toContain(field);
    });

    it('rejects any unknown field rather than dropping it', () => {
      const accepted = createReadyMadeOrderSchema.safeParse({
        challengeId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
        skuId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
        quantity: 1,
        delivery: {
          recipientName: 'A',
          recipientPhone: '0900000000',
          addressLine: 'B',
          province: 'C',
        },
        unitPrice: '1.00',
      });
      expect(accepted.success).toBe(false);
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
      ['a string', '3'],
    ])('refuses %s as a quantity', (_label, quantity) => {
      const parsed = createReadyMadeOrderSchema.safeParse({
        challengeId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
        skuId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
        quantity,
        delivery: {
          recipientName: 'A',
          recipientPhone: '0900000000',
          addressLine: 'B',
          province: 'C',
        },
      });
      expect(parsed.success).toBe(false);
    });

    it('accepts a delivery block with only the mandatory fields', () => {
      const parsed = createReadyMadeOrderSchema.safeParse({
        challengeId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
        skuId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
        quantity: 2,
        delivery: {
          recipientName: 'A',
          recipientPhone: '0900000000',
          addressLine: 'B',
          province: 'C',
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts no shipping fee, carrier, tracking, country or currency', () => {
      const deliveryShape = createReadyMadeOrderSchema.shape.delivery.shape;
      expect(Object.keys(deliveryShape).sort()).toEqual([
        'addressLine',
        'district',
        'province',
        'recipientName',
        'recipientPhone',
        'ward',
      ]);
    });
  });

  describe('the response publishes only customer-safe facts', () => {
    it('declares exactly four fields', () => {
      expect(declaredProperties(RESPONSE_SOURCE).sort()).toEqual([
        'amount',
        'currency',
        'merchandiseSubtotal',
        'orderCode',
        'reservationExpiresAt',
        'status',
      ]);
      expect(new ReadyMadeOrderCreatedResponse()).toBeDefined();
      expect(new ReadyMadeOrderSubtotalResponse()).toBeDefined();
    });

    it.each([
      'orderId',
      'reservationId',
      'skuStockId',
      'customerId',
      'skuId',
      'challengeId',
      'grantId',
      'accessToken',
      'secureLink',
    ])('declares no %s', (field) => {
      expect(declaredProperties(RESPONSE_SOURCE)).not.toContain(field);
    });

    it.each(['shippingFee', 'finalTotal', 'payableAmount', 'totalAmount'])(
      'declares no %s, because none exists yet',
      (field) => {
        expect(declaredProperties(RESPONSE_SOURCE)).not.toContain(field);
      },
    );

    it('carries the money as a string, never a JSON number', () => {
      expect(RESPONSE_SOURCE).toContain('amount!: string;');
      expect(RESPONSE_SOURCE).not.toContain('amount!: number;');
    });
  });

  describe('the command creates nothing outside its own scope', () => {
    it.each([
      ['a payment obligation', 'PAYMENT_OBLIGATION_REPOSITORY'],
      ['a payment attempt', 'PaymentAttemptRepository'],
      ['a secure access grant', 'SecureGrantIssuer'],
      ['a production job', 'PRODUCTION_JOB'],
      ['a custom request', 'CUSTOM_REQUEST_REPOSITORY'],
      ['a quotation', 'QUOTATION_REPOSITORY'],
      ['a design case', 'DESIGN_CASE_REPOSITORY'],
    ])('never composes %s', (_label, symbol) => {
      expect(USE_CASE_SOURCE).not.toContain(`${symbol})`);
      expect(USE_CASE_SOURCE).not.toContain(`${symbol},`);
    });

    it('reuses the one BR-021 price rule rather than reimplementing COALESCE', () => {
      const moneySource = readFileSync(
        join(__dirname, '..', 'domain', 'ready-made', 'ready-made-line-money.ts'),
        'utf8',
      );
      expect(moneySource).toContain('resolvePublicSkuUnitPrice(');
      expect(moneySource).not.toContain('COALESCE(');
      expect(moneySource).not.toContain('priceOverrideAmount ??');
    });

    it('reserves through the one delivered inventory writer', () => {
      expect(USE_CASE_SOURCE).toContain('SKU_STOCK_REPOSITORY');
      expect(USE_CASE_SOURCE).toContain('createReservation({');
      // No second reservation path, and no direct table access.
      expect(USE_CASE_SOURCE).not.toContain('inventoryReservations');
      expect(USE_CASE_SOURCE).not.toContain('skuStocks');
    });
  });
});
