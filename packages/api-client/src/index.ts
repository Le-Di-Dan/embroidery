/**
 * The public boundary of `@embroidery/api-client`.
 *
 * Everything an application may import from this package is re-exported here,
 * and consumers import from the package **root only** — never from one of the
 * barrels below by subpath. That is what lets the internal organization change
 * without a single feature service moving an import.
 *
 * ## Why the surface is split, and how
 *
 * This file used to hold every curated export in one list. It grew past the
 * 400-line source limit (CLAUDE.md §6) simply by being appended to once per
 * delivered capability — the shape of a file with no responsibility of its own.
 *
 * The split is **by domain**, along the section boundaries the original list
 * already had, never by line count. Each barrel answers one question: what may
 * a caller reach for when working on that domain. Each carries its domain’s
 * operations, value enums and transport types together, because the three are
 * consumed together — a screen derives its filter options from the enum, names
 * the wire shape with the body type, and calls the operation.
 *
 * ## The rules governing what is on this boundary
 *
 * Unchanged by the split, and stated on each block where the decision was made:
 *
 * - **Consumer-driven release.** An operation crosses when the checkpoint that
 *   consumes it lands, not when the backend delivers it. An export with no
 *   approved surface behind it is a capability nobody reviewed.
 * - **Deliberate withholding is documented.** Several operations are absent for
 *   a reason — `adminProductArchive`, `adminProductionJobCreate`,
 *   `publicOrderShippingFee_acknowledge` — and each says so where it would
 *   otherwise sit, because an operation withheld on purpose and one forgotten
 *   look identical from here.
 * - **Generated code is never hand-edited.** Every barrel re-exports
 *   `./generated/*`, regenerated with
 *   `pnpm --filter @embroidery/api-client generate`.
 */

export * from './platform';
export * from './identity';
export * from './catalog';
export * from './design-studio';
export * from './custom-requests';
export * from './quotation-and-design-review';
export * from './orders-and-payments';
export * from './inventory-and-production';
