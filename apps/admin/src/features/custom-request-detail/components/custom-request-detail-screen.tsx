'use client';

import { useState } from 'react';
import Link from 'next/link';

import { ADMIN_REQUESTS_ROUTE } from '../../custom-request-queue';
import { useCustomRequestDetailQuery } from '../hooks/use-custom-request-detail-query';
import { useModerationMutation } from '../hooks/use-moderation-mutation';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import { classifyDetailFailure } from '../model/custom-request-detail-failure';
import type { ModerationAction } from '../model/moderation-actions';
import {
  buildTransitionBody,
  EMPTY_MODERATION_FORM,
  type ModerationFormValues,
} from '../model/moderation-command';
import { presentInstant, resolveSubjectBranch } from '../model/request-detail-presentation';
import { transitionCustomRequest } from '../services/custom-request-moderation.service';
import { CustomRequestDetailSkeleton } from './custom-request-detail-skeleton';
import { CustomRequestDetailUnavailable } from './custom-request-detail-unavailable';
import { ModerationActionBar } from './moderation-action-bar';
import { ModerationNoteForm } from './moderation-note-form';
import { ModerationTransitionDialog } from './moderation-transition-dialog';
import { RequestCustomerPanel } from './request-customer-panel';
import { RequestDetailSummary } from './request-detail-summary';
import { RequestEvidenceGallery } from './request-evidence-gallery';
import { RequestNoteHistory } from './request-note-history';
import { RequestQuantityPanel } from './request-quantity-panel';
import { RequestSubjectPanel } from './request-subject-panel';
import { RequestTransitionHistory } from './request-transition-history';

interface CustomRequestDetailScreenProps {
  readonly requestId: string;
}

/**
 * `/requests/{requestId}` — the Admin request detail and moderation screen
 * (`665:3`, `665:115`).
 *
 * Composition and one piece of state: which moderation dialog is open. Every
 * fact on the page comes from the `APP5-B04` detail query, and every mutation
 * goes back through `APP5-B05` and is followed by a re-read — so the screen
 * holds no shadow copy of a status, a history row or a note.
 *
 * ### The outcome drives the dialog, not the other way round
 *
 * A success or a conflict closes the dialog, because both mean the request is
 * now in a state the operator has not decided about yet. The conflict banner is
 * rendered on the page beneath the refreshed status rather than inside a dialog
 * still holding the payload that was refused: there is no "apply anyway", and
 * the stale body is dropped with the dialog rather than kept somewhere it could
 * be sent again.
 *
 * A recoverable failure keeps the dialog open with the text intact.
 */
export function CustomRequestDetailScreen({ requestId }: CustomRequestDetailScreenProps) {
  const query = useCustomRequestDetailQuery(requestId);
  const [openAction, setOpenAction] = useState<ModerationAction | null>(null);

  const command = useModerationMutation({ requestId, send: transitionCustomRequest });
  const outcome = command.outcome;

  // Both settle the decision, so neither leaves a form on screen: the operator's
  // next step is to read the request as it now stands.
  if ((outcome.kind === 'success' || outcome.kind === 'conflict') && openAction !== null) {
    setOpenAction(null);
  }

  if (query.isPending) {
    return <CustomRequestDetailSkeleton />;
  }

  if (query.isError || query.data === undefined) {
    return (
      <CustomRequestDetailUnavailable
        failure={classifyDetailFailure(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  const detail = query.data;
  const branch = resolveSubjectBranch(detail);

  return (
    <section className="request-detail" data-testid="request-detail">
      <header className="request-detail__header">
        <Link className="request-detail__link" href={ADMIN_REQUESTS_ROUTE}>
          {COPY.page.backToQueue}
        </Link>
        <h1 className="request-detail__title">{COPY.page.title(detail.code)}</h1>
        <p className="request-detail__meta">
          {`${COPY.request.submittedAt}: ${presentInstant(detail.submittedAt)} · ${COPY.request.updatedAt}: ${presentInstant(detail.updatedAt)}`}
        </p>
      </header>

      {outcome.kind === 'success' ? (
        <div className="request-detail__outcome" role="status" data-testid="moderation-success">
          <p className="request-detail__outcome-title">{COPY.outcome.successHeading}</p>
          <p className="request-detail__outcome-body">{COPY.outcome.successBody}</p>
        </div>
      ) : null}

      {outcome.kind === 'conflict' ? (
        <div
          className="request-detail__outcome request-detail__outcome--conflict"
          role="alert"
          data-testid="moderation-conflict"
        >
          <p className="request-detail__outcome-title">{COPY.outcome.conflictHeading}</p>
          <p className="request-detail__outcome-body">{COPY.outcome.conflictBody}</p>
        </div>
      ) : null}

      <RequestDetailSummary detail={detail} />

      <div className="request-detail__columns">
        <div className="request-detail__column">
          <RequestSubjectPanel branch={branch} />
          <RequestQuantityPanel lines={detail.quantities} totalQuantity={detail.totalQuantity} />
          <RequestEvidenceGallery requestId={requestId} assets={detail.assets} />
        </div>

        <div className="request-detail__column">
          <RequestCustomerPanel customer={detail.customer} />
          <ModerationActionBar
            status={detail.status}
            running={command.running}
            onSelect={(action) => {
              command.reset();
              if (action.surface === 'direct') {
                // No dialog: `APP5-D01` approved none for this move, and the
                // command carries only its target — no internal reason and, by
                // construction, no customer-visible text.
                command.run(
                  buildTransitionBody(action.target, action.surface, EMPTY_MODERATION_FORM),
                );
                return;
              }
              setOpenAction(action);
            }}
          />
          <RequestTransitionHistory transitions={detail.transitions} />
          <RequestNoteHistory notes={detail.moderationNotes} />
          <ModerationNoteForm requestId={requestId} />
        </div>
      </div>

      {openAction === null ? null : (
        <ModerationTransitionDialog
          action={openAction}
          running={command.running}
          failed={outcome.kind === 'failure' && command.keepEnteredFields}
          onSubmit={(values: ModerationFormValues) => {
            command.run(buildTransitionBody(openAction.target, openAction.surface, values));
          }}
          onDismiss={() => {
            command.reset();
            setOpenAction(null);
          }}
        />
      )}
    </section>
  );
}
