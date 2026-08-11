/**
 * Which Studio composition a viewport gets (`APP3-S05-C1`).
 *
 * `APP3-D01-C1` draws three Studio compositions, not one that reflows:
 *
 * - **Desktop 1440** — the inspector sits beside the stage, in flow.
 * - **Tablet 1024** (`FIG-STUDIO-EDITING-TABLET-1024`, `618:140`) — the tool rail
 *   stays, stage width is prioritized, and the inspector becomes a right drawer
 *   toggled from the topbar.
 * - **Mobile 390** — the editing surfaces, including the text bottom sheet,
 *   belong to `APP3-S11`. `APP3-S05` therefore has *no* mobile text surface, and
 *   must not acquire one by letting the desktop panel stack under the stage.
 *
 * That third point is why this is a TypeScript decision and not only a media
 * query. A CSS-hidden text field is still in the document, still focusable and
 * still submittable — it would be an S11 editing surface that merely looks
 * absent. The tier decides what is *rendered*.
 *
 * Pure: no React, no DOM, no store, no clock.
 */

/**
 * The widths the compositions change at.
 *
 * These mirror the breakpoints in `design-studio.scss` exactly — the tier
 * decides what exists and the stylesheet decides how it looks, so the two
 * disagreeing would put a drawer's markup on a page styled as a column. The
 * `APP3-S05` gate compares both numbers against this file rather than trusting
 * them to be kept in step by hand.
 */
export const STUDIO_TIER_BREAKPOINTS = Object.freeze({
  /** At and above this width a tablet is assumed rather than a phone. */
  tabletMinPx: 768,
  /** The tier the existing shell already splits its two columns at. */
  desktopMinPx: 1025,
});

export type StudioViewportTier = 'mobile' | 'tablet' | 'desktop';

/** The composition a viewport width gets. Total over every finite width. */
export function studioTierFor(widthPx: number): StudioViewportTier {
  if (widthPx >= STUDIO_TIER_BREAKPOINTS.desktopMinPx) return 'desktop';
  if (widthPx >= STUDIO_TIER_BREAKPOINTS.tabletMinPx) return 'tablet';
  return 'mobile';
}
