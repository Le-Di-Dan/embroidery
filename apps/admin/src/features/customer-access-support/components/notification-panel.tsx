'use client';

import type {
  AdminNotificationIntentListResponse,
  AdminNotificationIntentResponse,
} from '@embroidery/api-client';

import { CUSTOMER_ACCESS_COPY } from '../model/customer-access-copy';
import { requiresBusinessReissue, type ReplayFailure } from '../model/customer-access-failure';
import type { ReplayOutcome } from '../hooks/use-notification-replay';

interface NotificationPanelProps {
  readonly notifications: AdminNotificationIntentListResponse | undefined;
  readonly loading: boolean;
  readonly replayOutcome: ReplayOutcome | null;
  readonly replayFailure: ReplayFailure | null;
  readonly onReplay: (intent: AdminNotificationIntentResponse) => void;
}

const COPY = CUSTOMER_ACCESS_COPY.notification;
const REPLAY = CUSTOMER_ACCESS_COPY.replay;

const REPLAY_FAILURE_COPY: Readonly<Record<ReplayFailure, string>> = {
  'reissue-required': REPLAY.reissueBody,
  'not-applicable': REPLAY.notApplicable,
  'source-unavailable': REPLAY.sourceUnavailable,
  missing: REPLAY.missing,
  unauthenticated: CUSTOMER_ACCESS_COPY.failure.unauthenticated,
  generic: CUSTOMER_ACCESS_COPY.failure.generic,
};

/**
 * The Customer's most recent terminal delivery failure, and the replay action.
 *
 * ### One notification, and it is the server's choice of one
 *
 * The list arrives already filtered to `status=FAILED` and to this Customer, and
 * already ordered newest first, so the card shows `intents[0]`. Nothing here
 * sorts, searches, or compares a masked recipient to a contact to decide whose a
 * notification is — the binding was resolved server-side through the persisted
 * contact-point reference, which is the only authoritative relationship there
 * is.
 *
 * ### The timeline is evidence, and bounded
 *
 * Each attempt renders its instant, its outcome and its `errorClass` — a bounded
 * class the worker chose, never a provider response body, an exception message
 * or a stack trace, none of which the response type can carry. There is no
 * message body, no params, no envelope and no scheduler internal, because
 * `APP4-B08`'s projection dropped every one of them before serialisation.
 *
 * ### REISSUE_REQUIRED is a hand-off, not a retry
 *
 * When the credential behind a notification is no longer deliverable the panel
 * says so and stops. It offers no "issue a new one" button, because minting a
 * credential is a business action belonging to the customer flow — this screen
 * has no authority to run it and calls nothing that would.
 */
export function NotificationPanel({
  notifications,
  loading,
  replayOutcome,
  replayFailure,
  onReplay,
}: NotificationPanelProps) {
  const intent = notifications?.intents[0] ?? null;

  return (
    <section className="customer-access-card" aria-labelledby="notification-panel-heading">
      <h2 className="customer-access-card__heading" id="notification-panel-heading">
        {COPY.heading}
      </h2>

      {replayOutcome === 'created' ? (
        <p
          className="customer-access-alert"
          data-tone="success"
          role="status"
          data-testid="replay-created"
        >
          {REPLAY.created}
        </p>
      ) : null}
      {replayOutcome === 'existing' ? (
        <div
          className="customer-access-alert"
          data-tone="info"
          role="status"
          data-testid="replay-existing"
        >
          <strong>{REPLAY.existing}</strong>
          <span>{REPLAY.existingBody}</span>
        </div>
      ) : null}
      {replayFailure !== null ? (
        <div
          className="customer-access-alert"
          data-tone={requiresBusinessReissue(replayFailure) ? 'warning' : 'error'}
          role="status"
          data-testid={
            requiresBusinessReissue(replayFailure) ? 'replay-reissue-required' : 'replay-failure'
          }
        >
          {requiresBusinessReissue(replayFailure) ? <strong>{REPLAY.reissueTitle}</strong> : null}
          <span>{REPLAY_FAILURE_COPY[replayFailure]}</span>
        </div>
      ) : null}

      {loading || notifications === undefined ? (
        <p className="customer-access-card__loading" data-testid="notification-panel-loading">
          {COPY.loading}
        </p>
      ) : intent === null ? (
        <p className="customer-access-card__empty" data-testid="notification-panel-empty">
          {COPY.none}
        </p>
      ) : (
        <>
          <p
            className="customer-access-badge"
            data-status="failed"
            data-testid="notification-status"
          >
            {COPY.statusFailed}
          </p>
          <dl className="customer-access-card__rows">
            <div className="customer-access-card__row">
              <dt>{COPY.channel}</dt>
              <dd>{intent.channel}</dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.recipient}</dt>
              <dd data-testid="notification-recipient">{intent.recipientMasked}</dd>
            </div>
            <div className="customer-access-card__row">
              <dt>{COPY.template}</dt>
              <dd data-testid="notification-template">
                {COPY.templateValue(intent.templateKey, intent.templateVersion)}
              </dd>
            </div>
          </dl>

          <h3 className="customer-access-card__subheading">{COPY.timelineHeading}</h3>
          <table className="customer-access-timeline" data-testid="notification-timeline">
            <thead>
              <tr>
                <th scope="col">{COPY.columnIndex}</th>
                <th scope="col">{COPY.columnAt}</th>
                <th scope="col">{COPY.columnOutcome}</th>
                <th scope="col">{COPY.columnErrorClass}</th>
              </tr>
            </thead>
            <tbody>
              {intent.attempts.map((attempt, index) => (
                <tr key={`${attempt.attemptedAt}-${String(index)}`}>
                  <td>{index + 1}</td>
                  <td>
                    <time dateTime={attempt.attemptedAt}>
                      {new Date(attempt.attemptedAt).toLocaleTimeString('vi-VN')}
                    </time>
                  </td>
                  <td data-outcome={attempt.outcome}>{attempt.outcome}</td>
                  <td>{attempt.errorClass ?? COPY.noErrorClass}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="customer-access-card__note">{COPY.redactionNote}</p>
          <p className="customer-access-card__note">{COPY.boundNote}</p>

          <button
            type="button"
            className="customer-access-card__primary"
            data-testid="notification-replay"
            onClick={() => {
              onReplay(intent);
            }}
          >
            {COPY.replay}
          </button>
        </>
      )}
    </section>
  );
}
