'use client';

import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { moderationActionsFor, type ModerationAction } from '../model/moderation-actions';

interface ModerationActionBarProps {
  readonly status: string;
  readonly running: boolean;
  readonly onSelect: (action: ModerationAction) => void;
}

/**
 * The moderation actions available in the current status
 * (`FIG-APP5-A02-ACTION-MATRIX`, `667:56`).
 *
 * The bar renders exactly what the matrix returns and decides nothing itself. In
 * a status APP5 owns no move from — the five APP6 states and the two terminal
 * ones — it renders a sentence saying so rather than a row of disabled buttons:
 * a greyed-out "Từ chối" on an already-rejected request invites the operator to
 * hover it looking for an explanation, and a greyed-out APP6 action would
 * advertise a surface this phase has not released.
 *
 * Every button is disabled while any command is in flight. The one that was
 * clicked is disabled because it is running; the others because the request is
 * mid-move and a second decision would be taken against a state that is already
 * changing.
 */
export function ModerationActionBar({ status, running, onSelect }: ModerationActionBarProps) {
  const actions = moderationActionsFor(status);

  return (
    <section className="request-detail__panel" aria-labelledby="request-actions-heading">
      <h2 className="request-detail__panel-title" id="request-actions-heading">
        {COPY.sections.actions}
      </h2>

      {actions.length === 0 ? (
        <p className="request-detail__hint" data-testid="moderation-actions-none">
          {COPY.actions.none}
        </p>
      ) : (
        <div className="moderation-actions" data-testid="moderation-actions">
          {actions.map((action) => (
            <button
              key={action.testId}
              type="button"
              className={`moderation-actions__button moderation-actions__button--${action.surface}`}
              disabled={running}
              data-testid={action.testId}
              onClick={() => onSelect(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
