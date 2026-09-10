// Public surface of the Ready-Made sellability authoring feature
// (`APP12-N02.A01`). The product editor imports from here only; components,
// hooks, services and model stay encapsulated.
//
// Two components cross, because the capability has two placements the product
// screen owns: the section itself, and the banner that has to appear **above**
// the form when a published product cannot currently be ordered.
//
// The mutation hooks and the two services are deliberately not exported.
// Everything that writes a variant or a SKU does so through the section's own
// dialogs, each of which carries the confirmation, the refusal mapping and the
// authoritative refetch that make the write safe. An exported mutation would be
// a way to change what a product sells with none of that attached.
export { ProductSellabilitySection } from './components/product-sellability-section';
export { StructuralUnsellabilityWarning } from './components/structural-unsellability-warning';
