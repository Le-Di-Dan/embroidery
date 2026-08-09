import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';

/** How many placeholder rows the skeleton draws. Enough to fill the fold. */
const SKELETON_ROWS = 6;

/**
 * The loading state (`FIG-ADMIN-TEMPLATELIST-DESKTOP-LOADING`).
 *
 * Placeholder rows in the list's own geometry rather than a spinner, so the page
 * does not jump when the real rows land.
 *
 * The bars are `aria-hidden` and a single `role="status"` line carries the
 * announcement. Six rows of decorative rectangles announced individually would
 * be noise; one sentence is the whole message.
 */
export function DesignTemplateSkeleton() {
  return (
    <div className="design-template-skeleton" data-testid="template-skeleton">
      <p className="design-template-skeleton__status" role="status">
        {DESIGN_TEMPLATE_COPY.states.loading}
      </p>
      <ul className="design-template-skeleton__rows" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="design-template-skeleton__row">
            <span className="design-template-skeleton__bar design-template-skeleton__bar--name" />
            <span className="design-template-skeleton__bar design-template-skeleton__bar--status" />
            <span className="design-template-skeleton__bar design-template-skeleton__bar--scope" />
            <span className="design-template-skeleton__bar design-template-skeleton__bar--meta" />
          </li>
        ))}
      </ul>
    </div>
  );
}
