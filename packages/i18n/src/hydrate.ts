import { formatMessage, type MessageValues } from './message-view';

/**
 * Substitute identity values into a whole message subtree, once, at module load.
 *
 * There is exactly one thing this exists for today: the store's name.
 *
 * A catalog sentence that mentions the store reads `{brand}` rather than the
 * name, so the name appears once in the repository — at `common.brand.name` —
 * and every sentence that needs it interpolates. Writing "Nét Thêu" into forty
 * sentences would make renaming the business a forty-file edit, and would
 * recreate the two-sources defect `FU-APP12-H06-01` recorded when a placeholder
 * wordmark survived in the shell after the brand moved.
 *
 * Since `APP12-V02-C1` §2 both halves are locale JSON: the placeholder and the
 * name it resolves to. `BRAND_NAME` (`./brand`) is the typed accessor for the
 * latter, and it owns no literal of its own.
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
