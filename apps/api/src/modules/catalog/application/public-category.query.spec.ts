/**
 * The public category inventory query service (`APP12-C01`).
 *
 * A fake repository stands in for persistence so these tests can pin what the
 * *service* decides: that it asks for one row above the cap, that it fails
 * rather than truncating when the taxonomy outgrows one response, that it
 * re-orders nothing, and that it carries `isIndexable` through instead of
 * filtering on it. The visibility predicate itself is SQL and is proved against
 * a real database in the integration suite — a fake cannot lie about a WHERE
 * clause it does not have.
 */
import { PublicCategoryQuery } from './public-category.query';
import { isPublicCategoryError } from '../domain/public-category.errors';
import { PUBLIC_CATEGORY_MAX_ENTRIES } from '../domain/public-category.policy';
import type {
  PublicCategoryRepository,
  PublicCategoryRow,
} from '../domain/repositories/public-category.repository';

function row(
  slug: string,
  displayOrder: number,
  isIndexable = true,
  name = `Danh mục ${slug}`,
): PublicCategoryRow {
  return { slug, name, isIndexable, displayOrder };
}

class FakeRepository implements PublicCategoryRepository {
  readonly limits: number[] = [];

  constructor(private readonly rows: readonly PublicCategoryRow[] = []) {}

  listPublic(limit: number): Promise<readonly PublicCategoryRow[]> {
    this.limits.push(limit);
    return Promise.resolve(this.rows.slice(0, limit));
  }
}

describe('public category inventory', () => {
  it('projects slug, name, isIndexable and displayOrder, and nothing else', async () => {
    const repository = new FakeRepository([row('ao-thun', 40)]);

    const view = await new PublicCategoryQuery(repository).list();

    expect(view).toEqual({
      items: [{ slug: 'ao-thun', name: 'Danh mục ao-thun', isIndexable: true, displayOrder: 40 }],
    });
    // The physical identity never appears, under any key.
    expect(JSON.stringify(view)).not.toContain('id');
  });

  it('carries a non-indexable category rather than dropping it', async () => {
    // Public visibility is not sitemap visibility: a `noindex` category is a
    // filter a customer may still use, and `APP12-C03` needs the flag to decide
    // what it means for a sitemap. Filtering here would hide both facts.
    const repository = new FakeRepository([row('khan', 20, false), row('khac', 90, true)]);

    const view = await new PublicCategoryQuery(repository).list();

    expect(view.items.map((item) => [item.slug, item.isIndexable])).toEqual([
      ['khan', false],
      ['khac', true],
    ]);
  });

  it('preserves the repository order exactly, without re-sorting', async () => {
    // The ORDER BY is the single ordering authority. A sort here would be a
    // second one — and the one that would quietly win.
    const repository = new FakeRepository([
      row('thu-bong', 10),
      row('khan', 20),
      row('ao-thun', 20),
      row('khac', 90),
    ]);

    const view = await new PublicCategoryQuery(repository).list();

    expect(view.items.map((item) => item.slug)).toEqual(['thu-bong', 'khan', 'ao-thun', 'khac']);
  });

  it('asks for exactly one row above the cap', async () => {
    const repository = new FakeRepository([]);

    await new PublicCategoryQuery(repository).list();

    expect(repository.limits).toEqual([PUBLIC_CATEGORY_MAX_ENTRIES + 1]);
  });

  it('returns an empty inventory rather than failing when nothing is public', async () => {
    const view = await new PublicCategoryQuery(new FakeRepository([])).list();

    expect(view).toEqual({ items: [] });
  });

  it('fails rather than truncating when the taxonomy outgrows one response', async () => {
    const rows = Array.from({ length: PUBLIC_CATEGORY_MAX_ENTRIES + 1 }, (_, index) =>
      row(`danh-muc-${index}`, index),
    );

    // Captured rather than `.rejects.toSatisfy`, which this Jest build does not
    // expose; the code is asserted directly instead of matched by message.
    const error = await new PublicCategoryQuery(new FakeRepository(rows))
      .list()
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);

    expect(isPublicCategoryError(error)).toBe(true);
    expect((error as { code: string }).code).toBe('PUBLIC_CATEGORY_INVENTORY_TOO_LARGE');
  });

  it('serves a full inventory of exactly the cap', async () => {
    const rows = Array.from({ length: PUBLIC_CATEGORY_MAX_ENTRIES }, (_, index) =>
      row(`danh-muc-${index}`, index),
    );

    const view = await new PublicCategoryQuery(new FakeRepository(rows)).list();

    expect(view.items).toHaveLength(PUBLIC_CATEGORY_MAX_ENTRIES);
  });
});
