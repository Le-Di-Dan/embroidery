import { Suspense } from 'react';

import { HomepageCollections } from './homepage-collections';
import { HomepageCommissionCta } from './homepage-commission-cta';
import { HomepageHero } from './homepage-hero';
import { HomepageStudioStory } from './homepage-studio-story';
import { HomepageWorksLane } from './homepage-works-lane';
import { HomepageWorksSkeleton } from './homepage-works-skeleton';

/**
 * The Homepage body, composed into the shared `APP1-D02` shell's content slot.
 *
 * The six sections are in the order locked by the approved Homepage authority
 * (`FIG-APP11-HOME-DESKTOP` 857:11 / `-TABLET` 857:318 / `-MOBILE` 857:506, all
 * `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP11-D01-PO-001`):
 *
 *   Hero · Featured Works · Discover Feed · Collections · Studio Story ·
 *   Commission CTA
 *
 * The same six at every breakpoint — the responsive tiers change composition,
 * never sequence. There is **no Journal section**: `APP11-D01` deleted it from
 * all three approved frames (`JOURNAL_IN_APP11_HOMEPAGE = false`), and APP11
 * builds no blog runtime.
 *
 * Header, footer, mobile navigation and the floating Zalo/Messenger dock are
 * **not** rendered here. They belong to the shared shell in the root layout, and
 * this checkpoint neither rebuilds nor supplements them: the footer store-
 * presentation block is `APP11-S05`'s, and the dock's floating bottom-right
 * placement is settled APP10 authority.
 *
 * The single `Suspense` boundary is placed so that a slow catalog delays two
 * sections and nothing else; the sections it wraps are adjacent, so the locked
 * order holds whether they stream or arrive with the document.
 */
export function HomepageScreen() {
  return (
    <div className="homepage">
      <HomepageHero />
      <Suspense fallback={<HomepageWorksSkeleton />}>
        <HomepageWorksLane />
      </Suspense>
      <HomepageCollections />
      <HomepageStudioStory />
      <HomepageCommissionCta />
    </div>
  );
}
