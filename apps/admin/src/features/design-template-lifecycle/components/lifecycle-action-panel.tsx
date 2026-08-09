'use client';

import { LIFECYCLE_COPY, withValue } from '../model/lifecycle-copy';
import type { LifecycleAction } from '../model/lifecycle-actions';
import type { ReadinessReport } from '../model/lifecycle-readiness';

interface LifecycleActionPanelProps {
  readonly status: string;
  readonly actions: readonly LifecycleAction[];
  readonly readiness: ReadinessReport;
  readonly versionLabel: string | null;
  readonly busy: LifecycleAction | null;
  readonly onRequest: (action: LifecycleAction) => void;
}

/**
 * The commands available from this state, and nothing else.
 *
 * The buttons are rendered from the action matrix rather than from conditionals,
 * so a control for a transition LC-24 does not recognise cannot appear here by
 * accident — there is no branch that could produce one.
 *
 * Publish is disabled only when a **locally authoritative** fact makes success
 * impossible: no immutable version, or no scope. Never because a row this client
 * could not evaluate is unknown — that would be a second, weaker GRD-T01, and
 * the reason is announced through `aria-describedby` rather than left to the
 * operator to infer from a greyed-out button.
 */
export function LifecycleActionPanel({
  status,
  actions,
  readiness,
  versionLabel,
  busy,
  onRequest,
}: LifecycleActionPanelProps) {
  const copy = LIFECYCLE_COPY.actions;
  const canPublish = actions.includes('publish');
  const blocked = readiness.blocked;
  const failures = readiness.provenFailures;

  return (
    <section className="template-lifecycle-actions" aria-labelledby="lifecycle-actions-title">
      <h2 className="template-lifecycle-actions__title" id="lifecycle-actions-title">
        {copy.title}
      </h2>

      {canPublish ? (
        <>
          {blocked ? (
            <p className="template-lifecycle-actions__badge" data-blocked="true">
              {copy.blockedBadge}
            </p>
          ) : null}
          <p className="template-lifecycle-actions__heading">
            {blocked
              ? withValue(copy.blockedCount, String(failures))
              : failures > 0
                ? withValue(copy.blockedCount, String(failures))
                : copy.advisoryHeading}
          </p>
          <p className="template-lifecycle-actions__body">
            {blocked || failures > 0 ? copy.blockedBody : copy.advisoryBody}
          </p>
          <button
            type="button"
            className="template-lifecycle-actions__primary"
            data-testid="lifecycle-publish"
            disabled={blocked || busy !== null}
            aria-describedby={blocked ? 'lifecycle-publish-blocked' : undefined}
            onClick={() => {
              onRequest('publish');
            }}
          >
            {busy === 'publish' ? LIFECYCLE_COPY.outcome.working : copy.publish}
          </button>
          {blocked ? (
            <p className="template-lifecycle-actions__note" id="lifecycle-publish-blocked">
              {copy.blockedBody}
            </p>
          ) : versionLabel === null ? null : (
            <p className="template-lifecycle-actions__note">
              {withValue(copy.publishNote, versionLabel)}
            </p>
          )}
        </>
      ) : null}

      {actions.includes('unpublish') ? (
        <>
          <p className="template-lifecycle-actions__heading">{copy.publishedHeading}</p>
          <p className="template-lifecycle-actions__body">{copy.publishedBody}</p>
          <button
            type="button"
            className="template-lifecycle-actions__primary"
            data-testid="lifecycle-unpublish"
            disabled={busy !== null}
            onClick={() => {
              onRequest('unpublish');
            }}
          >
            {busy === 'unpublish' ? LIFECYCLE_COPY.outcome.working : copy.unpublish}
          </button>
          <p className="template-lifecycle-actions__note">{copy.unpublishNote}</p>
        </>
      ) : null}

      {actions.includes('archive') ? (
        <div className="template-lifecycle-actions__danger" data-testid="lifecycle-danger-zone">
          <p className="template-lifecycle-actions__danger-title">{copy.dangerZone}</p>
          <button
            type="button"
            className="template-lifecycle-actions__danger-button"
            data-testid="lifecycle-archive"
            disabled={busy !== null}
            onClick={() => {
              onRequest('archive');
            }}
          >
            {busy === 'archive' ? LIFECYCLE_COPY.outcome.working : copy.archive}
          </button>
          <p className="template-lifecycle-actions__note">{copy.archiveNote}</p>
        </div>
      ) : null}

      <p className="template-lifecycle-actions__state" data-testid="lifecycle-status-caption">
        {status}
      </p>
    </section>
  );
}
