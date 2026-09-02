/**
 * The public variant selection HTTP contract (`APP5-B07`), carrying the
 * Ready-Made purchase projection (`APP12-B01`).
 *
 * Most of what matters about this endpoint is an **absence**, and an absence has
 * no runtime signal: a future edit adding `@UseGuards(...)` would make the route
 * non-public, and one adding `quantityOnHand` would publish a warehouse fact,
 * while every functional test kept passing. So the guard, the operation count,
 * the mutation methods and the forbidden fields are all asserted from source.
 *
 * `APP12-B01` moved the line, and this file moves with it rather than around it.
 * SKU id, resolved price and available quantity are now published, because
 * `BR-021` makes the SKU the buyable subject and `BR-022` states purchasability
 * in terms of both. What did **not** move is everything behind them: the SKU
 * code, `is_active`, the stock anchor, on-hand, the held and reserved breakdown,
 * reservations, orders and the ledger. Those are still asserted absent, and the
 * repository is still asserted to join no inventory table, so the boundary is
 * structural rather than a redaction anyone has to remember.
 *
 * `tsc` preserves JSDoc into the emitted output, so these scans deliberately
 * match *usage* — a decorator call, an import statement, a declared property —
 * and not a bare word. The file comments here mention warehouse columns to
 * explain why they are absent, and saying so must not fail the build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createOperationId } from '../../../openapi/operation-id';
import { toPublicVariantListView } from '../application/public-product-variant.query';
import { PublicProductVariantController } from './public-product-variant.controller';
import { publicProductSlugParamSchema } from './schemas/public-product.request';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'public-product-variant.controller.ts'),
  'utf8',
);
const RESPONSE_SOURCE = readFileSync(
  join(__dirname, 'schemas', 'public-product-variant.response.ts'),
  'utf8',
);
const VARIANT_REPOSITORY_SOURCE = readFileSync(
  join(
    __dirname,
    '..',
    'infrastructure',
    'persistence',
    'drizzle-public-product-variant.repository.ts',
  ),
  'utf8',
);
const AVAILABILITY_ADAPTER_SOURCE = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'inventory',
    'infrastructure',
    'persistence',
    'drizzle-sku-availability-snapshot.adapter.ts',
  ),
  'utf8',
);

/** Declared properties only — `name!: type;` at class-body indentation. */
function declaredProperties(source: string): string[] {
  return [...source.matchAll(/^ {2}(\w+)!:/gm)].map((match) => match[1]!);
}

describe('APP5-B07 public product variant contract', () => {
  describe('the route is public and stays public', () => {
    it('applies no guard of any kind', () => {
      expect(CONTROLLER_SOURCE).not.toMatch(/@UseGuards\s*\(/);
      expect(CONTROLLER_SOURCE).not.toMatch(/@ApiCookieAuth\s*\(/);
      expect(CONTROLLER_SOURCE).not.toMatch(/@ApiBearerAuth\s*\(/);
      // Nothing from the identity module is imported, so no guard is even in
      // scope to be applied.
      expect(CONTROLLER_SOURCE).not.toMatch(/from\s*['"].*identity.*['"]/);
    });

    it('sends no-store, because publication is re-read on every request', () => {
      expect(CONTROLLER_SOURCE).toMatch(/@Header\('Cache-Control', PUBLIC_CATALOG_CACHE_CONTROL\)/);
    });
  });

  describe('exactly one operation, and it is a read', () => {
    it('declares one handler and it is a GET', () => {
      const methods = CONTROLLER_SOURCE.match(/^\s{2}@(Get|Post|Patch|Put|Delete)\(/gm) ?? [];
      expect(methods).toHaveLength(1);
      expect(methods[0]).toContain('@Get(');
    });

    it('declares no mutation verb anywhere under this path', () => {
      expect(CONTROLLER_SOURCE).not.toMatch(/@(Post|Patch|Put|Delete)\s*\(/);
    });

    it('publishes the operation id the generated client is expected to expose', () => {
      const declared = [...CONTROLLER_SOURCE.matchAll(/operationId: '([^']+)'/g)].map(
        (match) => match[1],
      );
      expect(declared).toEqual(['publicProductVariant_list']);
      // The explicit id must equal what the naming policy would derive anyway,
      // so the two cannot disagree and no CONTROLLER_DOMAIN_KEYS entry is owed.
      expect(createOperationId(PublicProductVariantController.name, 'list')).toBe(
        'publicProductVariant_list',
      );
    });

    it('is mounted under the public product address, one segment deeper', () => {
      expect(CONTROLLER_SOURCE).toMatch(/@Controller\('public\/products\/:slug\/variants'\)/);
    });
  });

  describe('it accepts a slug and nothing else', () => {
    it('takes no body and no query parameter', () => {
      expect(CONTROLLER_SOURCE).not.toMatch(/@Body\s*\(/);
      expect(CONTROLLER_SOURCE).not.toMatch(/@Query\s*\(/);
      // No lifecycle selector can be smuggled in as a documented parameter.
      expect(CONTROLLER_SOURCE).not.toMatch(/@ApiQuery\s*\(/);
    });

    it('validates the slug strictly, rejecting anything the catalogue would', () => {
      expect(publicProductSlugParamSchema.safeParse({ slug: 'khan-theu-hoa-sen' }).success).toBe(
        true,
      );
      for (const slug of ['', 'Khan-Theu', 'khan_theu', 'khan theu', '../etc', 'a'.repeat(161)]) {
        expect(publicProductSlugParamSchema.safeParse({ slug }).success).toBe(false);
      }
      // Strict: an extra path field is a rejected request, not a silent drop.
      expect(
        publicProductSlugParamSchema.safeParse({ slug: 'khan-theu', status: 'DRAFT' }).success,
      ).toBe(false);
    });
  });

  describe('the published payload is selection and purchase data, and nothing more', () => {
    it('publishes exactly the three documented shapes', () => {
      expect(declaredProperties(RESPONSE_SOURCE).sort()).toEqual([
        'availableQuantity',
        'colorName',
        'productId',
        'productVariantId',
        'sizeLabel',
        'skuId',
        'skus',
        'unitPrice',
        'variants',
      ]);
    });

    it('declares no warehouse, lifecycle or authoring field', () => {
      const properties = declaredProperties(RESPONSE_SOURCE);
      for (const forbidden of [
        // The SKU's own authoring columns. The id is published because an order
        // line needs it; the business code identifies the same SKU to an
        // operator and buys a customer nothing.
        'skuCode',
        'code',
        'isActive',
        'priceOverrideAmount',
        'basePriceAmount',
        // CTX-INV internals. `availableQuantity` is the only inventory fact that
        // crosses the boundary (`BR-022`); the arithmetic behind it does not.
        'skuStockId',
        'stockId',
        'quantityOnHand',
        'heldQuantity',
        'reservedQuantity',
        'lowStockThreshold',
        'reservationId',
        'orderId',
        'customerId',
        'customRequestId',
        // Presentation authority, never stock truth (`BR-022`). Publishing it
        // beside a real availability figure would offer two answers to one
        // question.
        'isDisplayOutOfStock',
        // Product and category authoring.
        'status',
        'displayOrder',
        'archivedAt',
        'createdAt',
        'updatedAt',
        'category',
        'categoryId',
        'name',
      ]) {
        expect(properties).not.toContain(forbidden);
      }
    });

    it('states money as the one public price shape, never as a JSON number', () => {
      // `PublicPriceResponse` is the `APP2-B04` class the product list and detail
      // already publish through: `{ amount: string, currency }`, whole đồng. A
      // second money shape here would be a second money contract.
      expect(RESPONSE_SOURCE).toMatch(/from '\.\/public-product\.response'/);
      expect(RESPONSE_SOURCE).toMatch(/unitPrice!: PublicPriceResponse;/);
      expect(RESPONSE_SOURCE).not.toMatch(/unitPrice!: number/);
    });

    it('names the id fields exactly as the APP5 submission body expects them', () => {
      // The whole point of the original endpoint: these two values are copied
      // verbatim into `SubmitCustomRequestBody.catalog`, so a rename here is a
      // break for every S01 caller. Asserted through the projection rather than
      // the documented class, because the projection is what actually
      // serialises.
      const view = toPublicVariantListView({
        productId: 'p' as never,
        basePriceAmount: '250000.00',
        currencyCode: 'VND',
        variants: [{ id: 'v' as never, colorName: undefined, sizeLabel: undefined, skus: [] }],
      });
      expect(Object.keys(view).sort()).toEqual(['productId', 'variants']);
      expect(Object.keys(view.variants[0]!).sort()).toEqual([
        'colorName',
        'productVariantId',
        'sizeLabel',
        'skus',
      ]);
      // A missing attribute is published as an explicit null, never dropped: a
      // selector rendering "colour — size" must be able to tell "no colour" from
      // "field forgotten". A variant with nothing sellable keeps an empty list
      // and is still returned, which is what makes the APP12-B01 addition
      // additive rather than a redefinition of "variant".
      expect(view.variants[0]).toEqual({
        productVariantId: 'v',
        colorName: null,
        sizeLabel: null,
        skus: [],
      });
    });

    it('projects each SKU as id, resolved price and availability — and nothing else', () => {
      const view = toPublicVariantListView(
        {
          productId: 'p' as never,
          basePriceAmount: '250000.00',
          currencyCode: 'VND',
          variants: [
            {
              id: 'v' as never,
              colorName: undefined,
              sizeLabel: undefined,
              skus: [
                { id: 's1' as never, priceOverrideAmount: undefined, currencyCode: 'VND' },
                { id: 's2' as never, priceOverrideAmount: '199000.00', currencyCode: 'VND' },
              ],
            },
          ],
        },
        new Map([['s1', 4]]),
      );

      expect(view.variants[0]!.skus).toEqual([
        // Base-price fallback, whole đồng, and the availability inventory
        // reported.
        { skuId: 's1', unitPrice: { amount: '250000', currency: 'VND' }, availableQuantity: 4 },
        // Override precedence, and a SKU inventory did not report — no anchor —
        // is unavailable rather than assumed in stock.
        { skuId: 's2', unitPrice: { amount: '199000', currency: 'VND' }, availableQuantity: 0 },
      ]);
    });

    it('joins no inventory table, and loads only the price columns from skus', () => {
      // Structural, not a redaction. The statement never loads a stock, hold or
      // reservation row, so no later projection edit can publish a warehouse
      // fact by widening a field list — availability arrives through the
      // Inventory port instead, which returns one number.
      expect(VARIANT_REPOSITORY_SOURCE).not.toMatch(/\bskuStocks\b/);
      expect(VARIANT_REPOSITORY_SOURCE).not.toMatch(/\binventorySoftHolds\b/);
      expect(VARIANT_REPOSITORY_SOURCE).not.toMatch(/\binventoryReservations\b/);
      expect(VARIANT_REPOSITORY_SOURCE).not.toMatch(/isDisplayOutOfStock/);
      // It does load `skus` now — and only the three columns the price
      // resolution needs. The business code and the timestamps are not selected.
      expect(VARIANT_REPOSITORY_SOURCE).toMatch(/priceOverrideAmount: skus\.priceOverrideAmount/);
      expect(VARIANT_REPOSITORY_SOURCE).not.toMatch(/code: skus\.code/);
      expect(VARIANT_REPOSITORY_SOURCE).not.toMatch(/createdAt: skus\./);
    });

    it('writes nothing, and takes no lock, on any read path', () => {
      // `BR-024` puts the reservation at order creation. A public GET that
      // provisioned a missing stock anchor would write to the inventory tables
      // on an anonymous page view, which is the specific defect APP12-B01 §9
      // forbids. The anchor lock is absent for a second reason: this read is
      // display-only, and `FU-APP8-B02-02` reserves the lock for decisions.
      for (const source of [VARIANT_REPOSITORY_SOURCE, AVAILABILITY_ADAPTER_SOURCE]) {
        expect(source).not.toMatch(/\.insert\(/);
        expect(source).not.toMatch(/\.update\(/);
        expect(source).not.toMatch(/\.delete\(/);
        expect(source).not.toMatch(/ensureStockRow\(/);
        expect(source).not.toMatch(/\.for\('update'\)/);
      }
    });

    it('reuses the one canonical definition of active stock', () => {
      // Two copies of the word `'HELD'` would be two definitions of what stock
      // is available, and the day one gained a state the other did not, a
      // customer would be shown inventory the writer refuses.
      expect(AVAILABILITY_ADAPTER_SOURCE).toMatch(
        /ACTIVE_RESERVATION_STATE,\s*\n\s*ACTIVE_SOFT_HOLD_STATE,/,
      );
      expect(AVAILABILITY_ADAPTER_SOURCE).not.toMatch(/status, 'HELD'/);
      expect(AVAILABILITY_ADAPTER_SOURCE).not.toMatch(/status, 'RESERVED'/);
    });
  });

  describe('it invents no variant and picks no SKU', () => {
    it('has no notion of a default, primary or fallback variant', () => {
      for (const source of [CONTROLLER_SOURCE, RESPONSE_SOURCE]) {
        expect(source).not.toMatch(/isDefault|defaultVariant|primaryVariant|fallbackVariant/);
      }
    });

    it('names no "the" SKU — the eligible set is published as it stands', () => {
      // `product-sku.policy.ts` is explicit that resolution never selects a
      // member of the order-eligible set by recency, id order or any other
      // tie-break. A field naming one here would be that resolution, made
      // publicly and by the wrong layer.
      for (const source of [CONTROLLER_SOURCE, RESPONSE_SOURCE]) {
        expect(source).not.toMatch(/defaultSku|primarySku|selectedSku|preferredSku/);
      }
    });
  });
});
