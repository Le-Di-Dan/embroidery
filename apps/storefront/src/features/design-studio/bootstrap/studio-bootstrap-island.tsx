'use client';

import { StudioQueryProvider } from './studio-query-provider';
import { StudioScreen } from '../components/studio-screen';

export interface StudioBootstrapIslandProps {
  readonly productSlug: string;
  readonly productName: string;
}

/**
 * The client boundary of the Studio route (`APP3-S01`).
 *
 * The server segment renders the page shell, the heading and the Product it is
 * about; everything below this line is interaction — Side and Area choice,
 * Template continuation, the B05A preview blob, the two bootstrap actions and
 * resume — and none of it can be answered once on the server without being
 * stale by the time the visitor touches it.
 *
 * Next code-splits at this boundary, so the Studio's query client, hooks and
 * picker are not in the bundle of any other Storefront route.
 */
export function StudioBootstrapIsland({ productSlug, productName }: StudioBootstrapIslandProps) {
  return (
    <StudioQueryProvider>
      <StudioScreen productName={productName} productSlug={productSlug} />
    </StudioQueryProvider>
  );
}
