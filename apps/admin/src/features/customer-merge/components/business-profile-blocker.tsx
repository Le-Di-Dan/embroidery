'use client';

/**
 * The business-profile blocker (`FIG-APP10-A02-CASE-PROFILECONFLICT-DESKTOP`
 * `836:123`).
 *
 * Rendered whenever the authoritative preview says both Customers hold a
 * business profile. `uq_business_profiles__customer` caps the table at one row
 * per Customer, so a loser profile cannot be repointed onto a survivor that
 * already has one, and `APP10-B03` refuses the whole execution **before any
 * destructive write**.
 *
 * ### It offers nothing, deliberately
 *
 * No overwrite, no merge-fields, no delete-one and no continue-anyway. Every
 * resolution available to code destroys something: overwriting discards data the
 * operator never saw, deleting discards a record the case does not mention, and
 * merging column by column invents a profile neither Customer supplied. Only a
 * person can decide which profile is right, and they decide it outside this
 * flow.
 *
 * ### The execute button is disabled, not hidden
 *
 * A missing button is indistinguishable from a screen that failed to render one.
 * The disabled control stays visible, and this blocker sits above it saying why
 * — so the reason is on screen next to the thing it explains rather than only in
 * a `title` attribute a keyboard user would never surface.
 */
import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';

const COPY = CUSTOMER_MERGE_COPY.blocker;

export function BusinessProfileBlocker() {
  return (
    <section
      className="customer-merge-blocker"
      role="alert"
      data-testid="merge-business-profile-blocker"
      aria-labelledby="merge-blocker-heading"
    >
      <h2 className="customer-merge-blocker__title" id="merge-blocker-heading">
        {COPY.title}
      </h2>
      <p className="customer-merge-blocker__body">{COPY.body}</p>
      <p className="customer-merge-blocker__body">{COPY.resolution}</p>
      <p className="customer-merge-blocker__body">{COPY.executeDisabled}</p>
    </section>
  );
}
