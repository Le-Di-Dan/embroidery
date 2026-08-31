import { GalleryDetailLoading } from '../../../features/gallery-detail';

/**
 * Route-level loading UI for `/bo-suu-tap/[slug]`. The shell (header, `<main>`,
 * footer) stays mounted because it lives in the root layout, so only this
 * segment swaps — the page frame does not flash.
 */
export default function Loading() {
  return <GalleryDetailLoading />;
}
