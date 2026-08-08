/**
 * The label on the product detail screen's placement affordance (`APP3-A01`).
 *
 * Lives in the products feature because that is the screen that renders it. The
 * placement feature owns its own copy catalog; duplicating this one string
 * there would create two spellings of the same tab, and importing the placement
 * catalog here would make the products feature depend on it purely for a label.
 */
export const PLACEMENT_ENTRY_LABEL = 'Vị trí thêu';
