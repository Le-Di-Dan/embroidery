import type { ResponsiveCopy } from '../model/secure-link-copy';

/**
 * Renders the viewport-appropriate half of an approved copy pair.
 *
 * `APP4-D01` drew the authorized card twice and gave the two frames different
 * words, not merely different type sizes (`629:20` versus `629:70`). Both
 * strings are approved, so both are rendered and CSS picks one — the choice
 * belongs to the same media query that already changes the card's geometry, so
 * there is one breakpoint governing the state rather than two mechanisms that
 * could disagree.
 *
 * ### Why not a media-query hook
 *
 * `matchMedia` would make the first server-rendered paint pick a viewport it
 * cannot know, then correct itself after hydration — a visible flash of the
 * wrong sentence on exactly the screen that is meant to reassure. CSS decides
 * before the first paint and never re-decides.
 *
 * ### Why two spans and not two headings
 *
 * The hidden half is `display: none`, so it is absent from the accessibility
 * tree and announced by nothing. Wrapping the pair in spans inside one heading
 * keeps the document at exactly one `h1` (§19) — rendering two headings and
 * hiding one would leave two in the DOM, which is what the runtime assertion
 * counts.
 */
export function ResponsiveText({ copy }: { copy: ResponsiveCopy }) {
  return (
    <>
      <span className="secure-link-access__wide-only">{copy.wide}</span>
      <span className="secure-link-access__narrow-only">{copy.narrow}</span>
    </>
  );
}
