/**
 * `APP12-M01.DB1` — the domain half of the layered media invariant.
 *
 * The database guarantees no duplicate Asset, no duplicate position, positions
 * bounded to `0..MAX_PRODUCT_MEDIA_ITEMS - 1` and the primary role pinned to
 * position 0. It cannot state the two set-level rules, because no row CHECK can
 * read a set: that a non-empty selection contains position 0, and that its
 * positions are contiguous `0..N-1`. Those are this service's, along with the
 * count bound — refused here so a 21-image request never reaches the table at
 * all, rather than being caught by the twenty-first insert.
 *
 * The Asset port is a stub. What is under test is the ordering, the role
 * assignment and the refusals — not how assets are read, which
 * `catalog-draft.integration.spec.ts` covers against a real database.
 */
import { MAX_PRODUCT_MEDIA_ITEMS } from '../domain/product-draft.policy';
import { isProductDraftError } from '../domain/product-draft.errors';
import { ProductMediaSelection } from './product-media-selection.service';

const PRIMARY_ROLE = 'THUMBNAIL';
const SECONDARY_ROLE = 'GALLERY';

/** A deterministic synthetic asset id; only its distinctness matters here. */
const assetId = (index: number): string =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const selectionOf = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => assetId(index));

describe('ProductMediaSelection', () => {
  /** Every requested asset resolves as an eligible, ACCEPTED catalog asset. */
  function serviceOverEligibleAssets(): ProductMediaSelection {
    const assets = {
      lockScopedByIds: jest.fn((ids: readonly string[]) =>
        Promise.resolve(ids.map((id) => ({ id, status: 'ACCEPTED' }))),
      ),
    };
    return new ProductMediaSelection(assets as never);
  }

  /** Resolves and returns the refusal code, or throws if the call succeeded. */
  async function refusalCode(count: number): Promise<string> {
    try {
      await serviceOverEligibleAssets().resolve(selectionOf(count));
    } catch (error: unknown) {
      if (isProductDraftError(error)) {
        return error.code;
      }
      throw error;
    }
    throw new Error('Expected the selection to be refused, but it resolved.');
  }

  describe('the count bound', () => {
    it('accepts an empty selection and writes nothing', async () => {
      await expect(serviceOverEligibleAssets().resolve([])).resolves.toEqual([]);
    });

    it('accepts a single image and makes it the primary at position 0', async () => {
      const links = await serviceOverEligibleAssets().resolve(selectionOf(1));
      expect(links).toEqual([{ assetId: assetId(0), role: PRIMARY_ROLE, displayOrder: 0 }]);
    });

    it(`accepts exactly ${MAX_PRODUCT_MEDIA_ITEMS} images`, async () => {
      const links = await serviceOverEligibleAssets().resolve(selectionOf(MAX_PRODUCT_MEDIA_ITEMS));
      expect(links).toHaveLength(MAX_PRODUCT_MEDIA_ITEMS);
    });

    it(`refuses ${MAX_PRODUCT_MEDIA_ITEMS + 1} images without reading a single Asset`, async () => {
      const assets = { lockScopedByIds: jest.fn() };
      const service = new ProductMediaSelection(assets as never);

      await expect(service.resolve(selectionOf(MAX_PRODUCT_MEDIA_ITEMS + 1))).rejects.toMatchObject(
        { code: 'PRODUCT_MEDIA_TOO_MANY' },
      );
      // The refusal precedes the locking read, so nothing is validated, locked
      // or written on the way to it.
      expect(assets.lockScopedByIds).not.toHaveBeenCalled();
    });

    it('refuses a selection far beyond the cap with the same stable code', async () => {
      expect(await refusalCode(MAX_PRODUCT_MEDIA_ITEMS * 5)).toBe('PRODUCT_MEDIA_TOO_MANY');
    });

    it('states the cap in its message from the canonical constant', async () => {
      await expect(
        serviceOverEligibleAssets().resolve(selectionOf(MAX_PRODUCT_MEDIA_ITEMS + 1)),
      ).rejects.toThrow(String(MAX_PRODUCT_MEDIA_ITEMS));
    });
  });

  describe('the set-level rules the database cannot state', () => {
    it('assigns contiguous positions 0..N-1 with no gap', async () => {
      const links = await serviceOverEligibleAssets().resolve(selectionOf(MAX_PRODUCT_MEDIA_ITEMS));
      expect(links.map((link) => link.displayOrder)).toEqual(
        Array.from({ length: MAX_PRODUCT_MEDIA_ITEMS }, (_, index) => index),
      );
    });

    it('puts the primary at position 0 and exactly one primary in the whole selection', async () => {
      const links = await serviceOverEligibleAssets().resolve(selectionOf(MAX_PRODUCT_MEDIA_ITEMS));
      expect(links.filter((link) => link.role === PRIMARY_ROLE)).toEqual([
        { assetId: assetId(0), role: PRIMARY_ROLE, displayOrder: 0 },
      ]);
      expect(links.slice(1).every((link) => link.role === SECONDARY_ROLE)).toBe(true);
    });

    it('keeps the operator ordering as the only input to position', async () => {
      const reversed = selectionOf(3).reverse();
      const links = await serviceOverEligibleAssets().resolve(reversed);
      expect(links.map((link) => link.assetId)).toEqual(reversed);
      expect(links[0]?.role).toBe(PRIMARY_ROLE);
    });
  });

  describe('duplicates', () => {
    it('refuses the same Asset twice, at any position', async () => {
      const service = serviceOverEligibleAssets();
      await expect(service.resolve([assetId(0), assetId(1), assetId(0)])).rejects.toMatchObject({
        code: 'PRODUCT_MEDIA_DUPLICATE',
      });
    });

    it('reports the count bound first when a selection is both too long and repetitive', async () => {
      // Deliberate: the count is decided without touching a row, so an
      // over-long request gets the cheaper, coarser answer rather than a
      // duplicate report that depends on where the repeat happens to fall.
      const service = serviceOverEligibleAssets();
      const tooManyWithRepeat = [...selectionOf(MAX_PRODUCT_MEDIA_ITEMS), assetId(0)];
      await expect(service.resolve(tooManyWithRepeat)).rejects.toMatchObject({
        code: 'PRODUCT_MEDIA_TOO_MANY',
      });
    });
  });
});
