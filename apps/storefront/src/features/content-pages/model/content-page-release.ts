import { isCustomEmbroideryReleased } from '../../../config/custom-embroidery-release';

import type { ContentLink, ContentPage, ContentSection } from './content-page';

/**
 * Which release a piece of content page belongs to (`APP12-V02` §7.1).
 *
 * `V01-UX-001` is the checkpoint's first CRITICAL and the reason this exists.
 * `APP12-G02` withheld the Wave-2 *routes* and `G02-C1` suppressed the Wave-2
 * *calls to action* — but nothing withdrew the Wave-2 **promise**. The Service
 * page still documented a six-step commission ending in a 40% deposit, the FAQ
 * still answered "when do I pay?" with 40/60, and the payment policy described
 * only that model. A customer who had just bought a ready-made item and asked
 * the site when they pay was given the wrong answer by the page built to answer
 * it, and the only transaction the released product performs was described in no
 * policy at all.
 *
 * ## Why the Wave-2 copy is marked rather than deleted
 *
 * The commission journey is *true*; it is simply not true **yet**. Deleting it
 * would mean writing it again — from the business rules, in the same voice —
 * when `APP12-W01` releases the capability, and a rewrite is where a 40/60
 * split silently becomes something else. Marking it keeps the reviewed
 * sentences in the repository and makes their release condition explicit, so
 * turning the capability on restores the page rather than starting a copy task.
 *
 * ## Why this is presentation and not a gate
 *
 * Exactly as `isCustomerRouteWithheld` is careful to say: nothing here withholds
 * anything. The route gate in `src/proxy.ts` is what refuses a Wave-2 address.
 * This decides only what a *content page says*, so that a released Wave-1 shop
 * does not describe a transaction it cannot perform. Both read the same flag.
 */
export type ContentRelease = 'wave1' | 'wave2';

/** Whether one marked item is publishable right now. */
function isPublishable(release: ContentRelease | undefined, customReleased: boolean): boolean {
  // Unmarked content is true in both waves and always publishes. That default
  // matters: the marker is for the minority of content whose truth depends on
  // the release, and requiring it everywhere would make every future section an
  // opportunity to mark the wrong one.
  if (release === undefined) return true;
  return release === 'wave2' ? customReleased : !customReleased;
}

function resolveLinks(links: readonly ContentLink[], customReleased: boolean): ContentLink[] {
  return links.filter((link) => isPublishable(link.release, customReleased));
}

function resolveSection(section: ContentSection, customReleased: boolean): ContentSection {
  if (section.kind !== 'links') return section;
  return { ...section, links: resolveLinks(section.links, customReleased) };
}

/**
 * A content page as it should be published in the current release.
 *
 * Server-only, like every other reader of the release flag: it consults
 * `process.env`, and §4 of the release authority forbids the browser holding
 * the release decision.
 */
export function resolveContentPageForRelease(page: ContentPage): ContentPage {
  const customReleased = isCustomEmbroideryReleased();
  const sections = page.sections
    .filter((section) => isPublishable(section.release, customReleased))
    .map((section) => resolveSection(section, customReleased))
    // A links block whose every link belonged to the other wave would render as
    // a heading with nothing under it. Dropping it is the same judgement the
    // Homepage made when it omitted the whole commission section rather than
    // keeping its explanation and removing its button.
    .filter((section) => section.kind !== 'links' || section.links.length > 0);

  return { ...page, sections };
}
