import { DetailLoading } from '../../../features/product-detail';

/**
 * Route-level loading UI for `/san-pham/[slug]`. The shell (header, `<main>`,
 * footer) stays mounted because it lives in the root layout, so only this
 * segment swaps — the page frame does not flash.
 */
export default function Loading() {
  return <DetailLoading />;
}
