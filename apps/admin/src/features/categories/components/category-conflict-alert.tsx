'use client';

import { CATEGORY_COPY } from '../model/category-copy';

interface CategoryConflictAlertProps {
  readonly onReload: () => void;
  readonly onDismiss: () => void;
}

/**
 * The optimistic-concurrency refusal — `CATEGORY_VERSION_CONFLICT`.
 *
 * ## The rules it exists to keep
 *
 * - **No blind retry.** The save is not re-sent. The token that was refused is
 *   known-stale, so a retry could only fail again — or succeed against a
 *   version of the record the operator never saw.
 * - **No overwrite.** There is no "lưu đè" and no force flag. The server
 *   refused because someone else changed the row; pushing through would
 *   silently discard their change.
 * - **No silent loss.** Dismissing changes nothing: the operator's edits stay
 *   in the form, exactly as typed, and they may copy anything they need before
 *   choosing to reload. Reloading is stated to discard them.
 * - **A real next step.** Reload refetches the inventory, so the form is
 *   re-seeded from the authoritative record *and* from a fresh `updatedAt` —
 *   which is what makes the operator's next save able to succeed.
 *
 * ## Why this is a panel alert and not a modal
 *
 * The Admin's existing conflict pattern (`ProductConflictDialog`, `521:284`) is
 * a modal because the product form owns the whole screen: there is nothing
 * behind it worth seeing. Here the form is a panel beside the table, and the
 * decision the operator has to make is *about the values in that panel* — which
 * of their edits are worth re-applying after a reload. A modal would cover the
 * one thing they need to read. The structure is otherwise the pattern verbatim:
 * the same title/body/two-action shape, reload as the primary, keep as the
 * secondary, and no third option.
 *
 * `role="alert"` announces it on appearance without stealing focus, and both
 * actions are ordinary buttons in the panel's own tab order.
 */
export function CategoryConflictAlert({ onReload, onDismiss }: CategoryConflictAlertProps) {
  return (
    <div className="category-conflict" role="alert" data-testid="category-conflict">
      <p className="category-conflict__title">{CATEGORY_COPY.conflict.title}</p>
      <p className="category-conflict__body">{CATEGORY_COPY.conflict.body}</p>
      <div className="category-conflict__actions">
        <button type="button" className="category-button" onClick={onDismiss}>
          {CATEGORY_COPY.conflict.close}
        </button>
        <button
          type="button"
          className="category-button category-button--primary"
          onClick={onReload}
        >
          {CATEGORY_COPY.conflict.reload}
        </button>
      </div>
    </div>
  );
}
