'use client';

/**
 * `APP3-A04` — the Admin Design Template lifecycle screen.
 *
 * The backend owns lifecycle truth. This screen shows it, sends exactly the four
 * guarded commands, and does four things it must never stop doing: it never
 * invents readiness truth, never blindly replays a conflict, never collapses
 * archive into delete, and never collapses restore into publish.
 *
 * Everything it renders derives from one authoritative detail read — the same
 * cache entry the editor uses — so the version it sends back is the version the
 * server last stated.
 */
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import { adminDesignTemplateEditorRoute } from '../../design-templates';
import { useLifecycleCommand } from '../hooks/use-lifecycle-command';
import { useLifecycleDetailQuery } from '../hooks/use-lifecycle-detail';
import { useScopeAuthority } from '../hooks/use-scope-authority';
import { actionsFor, type LifecycleAction } from '../model/lifecycle-actions';
import { LIFECYCLE_COPY, withValue } from '../model/lifecycle-copy';
import { evaluateReadiness } from '../model/lifecycle-readiness';
import { ArchivedPanel } from './archived-panel';
import { LifecycleActionPanel } from './lifecycle-action-panel';
import { LifecycleConfirmDialog } from './lifecycle-confirm-dialog';
import { LifecycleReasonDialog } from './lifecycle-reason-dialog';
import { ReadinessPanel } from './readiness-panel';

const OUTCOME_COPY: Readonly<Record<LifecycleAction, string>> = {
  publish: LIFECYCLE_COPY.outcome.published,
  unpublish: LIFECYCLE_COPY.outcome.unpublished,
  archive: LIFECYCLE_COPY.outcome.archived,
  restore: LIFECYCLE_COPY.outcome.restored,
};

const FAILURE_COPY: Readonly<Record<string, string>> = {
  'stale-state': LIFECYCLE_COPY.failure.staleReloaded,
  'not-ready': LIFECYCLE_COPY.failure.notReady,
  rejected: LIFECYCLE_COPY.failure.rejected,
  unauthenticated: LIFECYCLE_COPY.failure.unauthenticated,
  missing: LIFECYCLE_COPY.failure.missing,
  generic: LIFECYCLE_COPY.failure.generic,
};

interface DesignTemplatePublicationScreenProps {
  readonly templateId: string;
}

export function DesignTemplatePublicationScreen({
  templateId,
}: DesignTemplatePublicationScreenProps) {
  const { detail, isLoading, failure: loadFailure, retry } = useLifecycleDetailQuery(templateId);
  const { scope } = useScopeAuthority(detail);
  const [pending, setPending] = useState<LifecycleAction | null>(null);

  // A settled command closes its dialog unless the body itself was rejected, in
  // which case the operator fixes the reason in place.
  const onSettled = useCallback((_action: LifecycleAction, keepOpen: boolean) => {
    if (!keepOpen) setPending(null);
  }, []);

  const command = useLifecycleCommand(templateId, onSettled);

  const readiness = useMemo(
    () => (detail === undefined ? null : evaluateReadiness({ detail, scope })),
    [detail, scope],
  );

  if (isLoading) {
    return <p className="template-lifecycle__notice">{LIFECYCLE_COPY.page.loading}</p>;
  }

  if (detail === undefined || readiness === null) {
    return (
      <div className="template-lifecycle__notice" role="alert">
        <p>
          {loadFailure === 'missing'
            ? LIFECYCLE_COPY.page.notFound
            : LIFECYCLE_COPY.page.loadFailed}
        </p>
        {loadFailure === 'missing' ? null : (
          <button type="button" data-testid="lifecycle-retry" onClick={retry}>
            {LIFECYCLE_COPY.page.retry}
          </button>
        )}
      </div>
    );
  }

  const actions = actionsFor(detail.status);
  const versionLabel =
    detail.currentVersion === undefined ? null : `v${String(detail.currentVersion.version)}`;
  const scopeLabel = scope == null ? null : `${scope.sideName} · ${scope.areaName}`;
  const busy = command.running;

  const request = (action: LifecycleAction) => {
    command.dismissFailure();
    setPending(action);
  };

  const send = (action: LifecycleAction, reason?: string) => {
    command.run({
      action,
      // The authoritative token: the version this screen last read from the
      // server, or `0` for a Template that has none. Never incremented locally.
      expectedCurrentVersion: detail.currentVersion?.version ?? 0,
      ...(reason === undefined ? {} : { reason }),
    });
  };

  return (
    <div className="template-lifecycle" data-testid="template-lifecycle-screen">
      <header className="template-lifecycle__topbar">
        <Link
          className="template-lifecycle__back"
          href={adminDesignTemplateEditorRoute(templateId)}
          data-testid="lifecycle-back"
        >
          {LIFECYCLE_COPY.page.back}
        </Link>
        <span className="template-lifecycle__name">{detail.name}</span>
        <span
          className="template-lifecycle__badge"
          data-status={detail.status}
          data-testid="lifecycle-status-badge"
        >
          {detail.status}
        </span>
        <span className="template-lifecycle__version" data-testid="lifecycle-version">
          {versionLabel === null
            ? LIFECYCLE_COPY.page.noVersion
            : `${versionLabel} · ${LIFECYCLE_COPY.page.versionSuffix}`}
        </span>
      </header>

      {/* Successful outcomes are polite; actionable failures interrupt. */}
      <p className="template-lifecycle__live" role="status" aria-live="polite">
        {command.outcome === null ? '' : OUTCOME_COPY[command.outcome]}
      </p>
      {command.failure === null ? null : (
        <div className="template-lifecycle__failure" role="alert" data-testid="lifecycle-failure">
          <p>{FAILURE_COPY[command.failure] ?? LIFECYCLE_COPY.failure.generic}</p>
          {command.reasonInvalidated ? <p>{LIFECYCLE_COPY.failure.staleReasonCleared}</p> : null}
        </div>
      )}

      <div className="template-lifecycle__body" data-archived={detail.status === 'ARCHIVED'}>
        {detail.status === 'ARCHIVED' ? (
          <ArchivedPanel
            name={detail.name}
            archivedAt={detail.archivedAt}
            busy={busy !== null}
            onRestore={() => {
              request('restore');
            }}
          />
        ) : (
          <>
            <ReadinessPanel report={readiness} />
            <LifecycleActionPanel
              status={detail.status}
              actions={actions}
              readiness={readiness}
              versionLabel={versionLabel}
              busy={busy}
              onRequest={request}
            />
          </>
        )}
      </div>

      {pending === 'publish' ? (
        <LifecycleConfirmDialog
          title={withValue(LIFECYCLE_COPY.publishDialog.title, detail.name)}
          body={
            scopeLabel === null
              ? LIFECYCLE_COPY.publishDialog.bodyNoScope
              : withValue(LIFECYCLE_COPY.publishDialog.body, scopeLabel)
          }
          {...(versionLabel === null
            ? {}
            : { note: withValue(LIFECYCLE_COPY.publishDialog.version, versionLabel) })}
          confirmLabel={LIFECYCLE_COPY.publishDialog.confirm}
          testId="publish-dialog"
          busy={busy === 'publish'}
          onConfirm={() => {
            send('publish');
          }}
          onCancel={() => {
            setPending(null);
          }}
        />
      ) : null}

      {pending === 'unpublish' ? (
        <LifecycleConfirmDialog
          title={withValue(LIFECYCLE_COPY.unpublishDialog.title, detail.name)}
          body={LIFECYCLE_COPY.unpublishDialog.body}
          confirmLabel={LIFECYCLE_COPY.unpublishDialog.confirm}
          testId="unpublish-dialog"
          busy={busy === 'unpublish'}
          onConfirm={() => {
            send('unpublish');
          }}
          onCancel={() => {
            setPending(null);
          }}
        />
      ) : null}

      {pending === 'archive' ? (
        <LifecycleReasonDialog
          badge={LIFECYCLE_COPY.archiveDialog.badge}
          title={withValue(LIFECYCLE_COPY.archiveDialog.title, detail.name)}
          body={LIFECYCLE_COPY.archiveDialog.body}
          reasonLabel={LIFECYCLE_COPY.archiveDialog.reasonLabel}
          reasonHint={LIFECYCLE_COPY.archiveDialog.reasonHint}
          confirmLabel={LIFECYCLE_COPY.archiveDialog.confirm}
          testId="archive-dialog"
          destructive
          busy={busy === 'archive'}
          onConfirm={(reason) => {
            send('archive', reason);
          }}
          onCancel={() => {
            setPending(null);
          }}
        />
      ) : null}

      {pending === 'restore' ? (
        <LifecycleReasonDialog
          badge={LIFECYCLE_COPY.restoreDialog.badge}
          title={withValue(LIFECYCLE_COPY.restoreDialog.title, detail.name)}
          body={LIFECYCLE_COPY.restoreDialog.body}
          reasonLabel={LIFECYCLE_COPY.restoreDialog.reasonLabel}
          reasonHint={LIFECYCLE_COPY.restoreDialog.reasonHint}
          confirmLabel={LIFECYCLE_COPY.restoreDialog.confirm}
          testId="restore-dialog"
          destructive={false}
          busy={busy === 'restore'}
          onConfirm={(reason) => {
            send('restore', reason);
          }}
          onCancel={() => {
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}
