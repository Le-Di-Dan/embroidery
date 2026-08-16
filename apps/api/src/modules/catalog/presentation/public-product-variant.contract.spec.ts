/**
 * The public variant selection HTTP contract (`APP5-B07`).
 *
 * Most of what matters about this endpoint is an **absence**, and an absence has
 * no runtime signal: a future edit adding `@UseGuards(...)` would make the route
 * non-public, and one adding a `price` property would publish commerce data,
 * while every functional test kept passing. So the guard, the operation count,
 * the mutation methods and the forbidden fields are all asserted from source.
 *
 * `tsc` preserves JSDoc into the emitted output, so these scans deliberately
 * match *usage* — a decorator call, an import statement, a declared property —
 * and not a bare word. The file comments here mention `price` and `SKU` to
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

  describe('the published payload is selection data and nothing more', () => {
    it('publishes exactly the two documented shapes', () => {
      expect(declaredProperties(RESPONSE_SOURCE).sort()).toEqual([
        'colorName',
        'productId',
        'productVariantId',
        'sizeLabel',
        'variants',
      ]);
    });

    it('declares no commerce, lifecycle or authoring field', () => {
      const properties = declaredProperties(RESPONSE_SOURCE);
      for (const forbidden of [
        'sku',
        'skuCode',
        'code',
        'price',
        'priceOverrideAmount',
        'basePriceAmount',
        'currency',
        'currencyCode',
        'stock',
        'inventory',
        'isDisplayOutOfStock',
        'available',
        'isActive',
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

    it('names the id fields exactly as the APP5 submission body expects them', () => {
      // The whole point of the endpoint: these two values are copied verbatim
      // into `SubmitCustomRequestBody.catalog`, so a rename here is a break for
      // every S01 caller. Asserted through the projection rather than the
      // documented class, because the projection is what actually serialises.
      const view = toPublicVariantListView({
        productId: 'p' as never,
        variants: [{ id: 'v' as never, colorName: undefined, sizeLabel: undefined }],
      });
      expect(Object.keys(view).sort()).toEqual(['productId', 'variants']);
      expect(Object.keys(view.variants[0]!).sort()).toEqual([
        'colorName',
        'productVariantId',
        'sizeLabel',
      ]);
      // A missing attribute is published as an explicit null, never dropped: a
      // selector rendering "colour — size" must be able to tell "no colour" from
      // "field forgotten".
      expect(view.variants[0]).toEqual({
        productVariantId: 'v',
        colorName: null,
        sizeLabel: null,
      });
    });

    it('joins no table that could carry a price', () => {
      const repository = readFileSync(
        join(
          __dirname,
          '..',
          'infrastructure',
          'persistence',
          'drizzle-public-product-variant.repository.ts',
        ),
        'utf8',
      );
      // Structural, not a redaction: the statement never loads a SKU row, so no
      // later projection edit can publish one by widening a field list.
      expect(repository).not.toMatch(/\bskus\b/);
      expect(repository).not.toMatch(/innerJoin\(\s*skus/);
      expect(repository).not.toMatch(/basePriceAmount|priceOverrideAmount|currencyCode/);
    });
  });

  describe('it invents no variant', () => {
    it('has no notion of a default, primary or fallback variant', () => {
      for (const source of [CONTROLLER_SOURCE, RESPONSE_SOURCE]) {
        expect(source).not.toMatch(/isDefault|defaultVariant|primaryVariant|fallbackVariant/);
      }
    });
  });
});
