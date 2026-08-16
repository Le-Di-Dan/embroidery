/**
 * Renders the viewport-appropriate half of an approved copy pair.
 *
 * ### Why this exists at all
 *
 * Several approved frames do not merely rescale between desktop and mobile —
 * they carry **different words**. `APP4-D01` drew the authorized card twice
 * with two wordings (`629:20` against `629:70`); `APP5-D01` did the same for
 * the status heading (`661:9` "Yêu cầu REQ-…" against `661:358` "REQ-…") and
 * the confirmation's code note (`660:14` against `660:62`). Both strings are
 * approved, so both are rendered and CSS picks one — the choice belongs to the
 * same media query that already changes the surrounding geometry, so there is
 * one breakpoint governing the screen rather than two mechanisms that could
 * disagree at some width nobody tests.
 *
 * ### Why not a media-query hook
 *
 * `matchMedia` would make the first server-rendered paint pick a viewport it
 * cannot know, then correct itself after hydration — a visible flash of the
 * wrong sentence. CSS decides before the first paint and never re-decides,
 * which also lets this stay a Server Component that a server-rendered page can
 * use without pulling a client boundary in behind it.
 *
 * ### Why two spans and not two elements
 *
 * The hidden half is `display: none`, so it is absent from the accessibility
 * tree and announced by nothing. Wrapping the pair in spans inside one heading
 * keeps a document at exactly one `h1` — rendering two headings and hiding one
 * would leave two in the DOM, which is what the runtime assertions count.
 *
 * App-shared rather than feature-owned because three features now use it, which
 * is the narrowest scope that still holds all of them.
 */

/** A string the approved frames express differently per viewport. */
export interface ResponsiveCopy {
  /** Desktop 1440. */
  readonly wide: string;
  /** Mobile 390. */
  readonly narrow: string;
}

export function ResponsiveText({ copy }: { copy: ResponsiveCopy }) {
  return (
    <>
      <span className="responsive-text__wide">{copy.wide}</span>
      <span className="responsive-text__narrow">{copy.narrow}</span>
    </>
  );
}
