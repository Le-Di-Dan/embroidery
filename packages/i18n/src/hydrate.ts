import { formatMessage, type MessageValues } from './message-view';

/**
 * Substitute identity values into a whole message subtree, once, at module load.
 *
 * There is exactly one thing this exists for today: the store's name.
 *
 * `Nét Thêu` is brand identity owned by `@embroidery/ui` — the same constant the
 * approved symbol and lockup are built from — and `APP12-H06` had already had to
 * fix a placeholder wordmark that survived in the shell after the brand moved
 * (`FU-APP12-H06-01`). Writing the name into the message repository as literal
 * text would recreate exactly that: two sources for the store's name, identical
 * until one is corrected.
 *
 * So the repository holds `{brand}` and the catalogs hydrate it from
 * `BRAND_NAME`. The name still cannot be edited by a Product Owner opening the
 * JSON, which is correct — renaming the business is not a copy change.
 *
 * The walk allocates a new tree rather than mutating the imported JSON: the
 * module-level `VI_MESSAGES` object is shared by every catalog and by next-intl,
 * and a substitution written into it would leak into readers that never asked
 * for one.
 */
export function hydrateMessages<T>(tree: T, values: MessageValues): T {
  if (typeof tree === 'string') {
    return formatMessage(tree, values) as unknown as T;
  }
  if (Array.isArray(tree)) {
    const items = tree as unknown[];
    return items.map((item) => hydrateMessages(item, values)) as unknown as T;
  }
  if (tree !== null && typeof tree === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tree)) {
      out[key] = hydrateMessages(value, values);
    }
    return out as T;
  }
  return tree;
}
