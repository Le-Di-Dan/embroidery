'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ADMIN_DESIGN_TEMPLATES_ROUTE } from '../../design-templates';
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import { buildTextElement, canAddTextElement } from '../model/editor-document';
import { resolveConflictCause } from '../model/editor-failure';
import {
  isInitiallyAssignable,
  resolveEditorSource,
  rebuildDocument,
} from '../model/editor-source';
import { canSave, saveChip, selectedElement } from '../model/editor-state';
import { useEditorNavigationGuard } from '../hooks/use-editor-navigation-guard';
import { useScopeAssignment } from '../hooks/use-scope-assignment';
import { useEditorSession } from '../hooks/use-editor-session';
import { useEditorSideBackground } from '../hooks/use-editor-side-background';
import { useEditorViewport } from '../hooks/use-editor-viewport';
import { useSaveTemplateDocument } from '../hooks/use-save-template-document';
import { useTemplateDetailQuery } from '../hooks/use-template-detail-query';
import { useTemplatePlacementQuery } from '../hooks/use-template-placement-query';
import { EditorBlockedState } from './editor-blocked-state';
import { EditorConfirmDialog } from './editor-confirm-dialog';
import { EditorConflictDialog } from './editor-conflict-dialog';
import { EditorInspector } from './editor-inspector';
import { EditorLayerList } from './editor-layer-list';
import { EditorNotice } from './editor-notice';
import { EditorScopeAssignment } from './editor-scope-assignment';
import { EditorScopePanel } from './editor-scope-panel';
import { EditorStage, type StageBackground } from './editor-stage';
import { EditorTopbar } from './editor-topbar';
import { STATUS_LABELS, saveFailureCopy } from './editor-screen-copy';

/**
 * `/design-templates/[templateId]` — the Admin Design Template editor
 * (`APP3-A03`).
 *
 * Three regions at 1440 and at 1280 — layers, stage, inspector — and a
 * deliberate read-only notice at 390. The mobile branch returns **before** the
 * editor exists, so at 390 there is no stage mounted, no background request and
 * no save mutation: the notice replaces the editor rather than hiding it.
 *
 * Every non-editing outcome is a named, bounded state rather than an empty
 * screen: a Template that does not exist, one whose read failed, one with no
 * placement scope, one whose Side no longer resolves, and one whose document
 * this build cannot read.
 *
 * The save is the only write. There is no lifecycle control anywhere — publish,
 * unpublish and archive are `APP3-A04`'s and are not even on the API-client
 * boundary this feature can reach.
 */
export function DesignTemplateEditorScreen({ templateId }: { readonly templateId: string }) {
  const router = useRouter();
  const viewport = useEditorViewport();
  const [reloadPrompt, setReloadPrompt] = useState(false);

  const detailQuery = useTemplateDetailQuery(templateId);
  const detailValue = detailQuery.detail;
  const scopeRef = detailValue?.scope;

  const assignable =
    viewport !== 'mobile' && detailValue !== undefined && isInitiallyAssignable(detailValue);

  const scopeAssignment = useScopeAssignment({
    templateId,
    enabled: assignable,
    reloadDetail: detailQuery.reload,
  });

  // One placement query for both jobs. While assigning it follows the candidate
  // Product; once the scope exists it follows the scope — and because the
  // assignment binds the Product the operator just browsed, the key is the same
  // one and the editor opens against a warm cache rather than a second request.
  //
  // A Template that is neither scoped nor assignable issues nothing at all, and
  // neither does a phone: the absence is enforced by the query being disabled,
  // not by a component remembering.
  const placementProductId =
    viewport === 'mobile'
      ? null
      : (scopeRef?.productId ?? (assignable ? scopeAssignment.candidateProductId : null));
  const placement = useTemplatePlacementQuery(placementProductId);

  const source = resolveEditorSource({
    detail: detailQuery.detail,
    detailLoading: detailQuery.isLoading,
    detailFailure: detailQuery.failure,
    placement,
  });

  const ready = source.kind === 'ready' ? source : null;
  const resolvedScope = ready?.scope ?? null;

  const initial = useMemo(
    () => (ready === null ? null : { version: ready.version, document: ready.document }),
    // Depends on the values rather than on `ready`, which is a fresh object on
    // every render: the session is seeded once, and a new identity each time
    // would make this memo useless without changing what it produces.
    [ready?.version, ready?.document],
  );

  const session = useEditorSession({ templateId, initial });
  const state = session.state;
  const editable = ready?.editable === true;

  const background = useEditorSideBackground({
    productId: viewport === 'mobile' ? null : (resolvedScope?.productId ?? null),
    sideId: viewport === 'mobile' ? null : (resolvedScope?.side.id ?? null),
  });

  const guard = useEditorNavigationGuard(state?.dirty === true);

  const mutation = useSaveTemplateDocument({
    templateId,
    onSaved: (detail) => {
      // The response is authoritative detail truth: the canonical document
      // differs from what was sent (quantization), so the local copy is
      // replaced by it rather than assumed equal. No detail GET follows.
      const rebuilt = rebuildDocument(detail, resolvedScope);
      if (rebuilt.kind === 'ok') session.reset(rebuilt.version, rebuilt.document);
    },
    onFailed: (failure) => {
      if (failure !== 'conflict-unresolved') {
        session.dispatch({ type: 'SAVE_FAILURE', failure });
        return;
      }
      // A 409 carries no discriminator (see `editor-failure.ts`), so the server
      // is asked which guard refused. The read classifies only — it never
      // replaces the draft, which stays exactly as the operator left it until
      // they explicitly choose to reload.
      void (async () => {
        const fresh = await detailQuery.reload();
        const cause = resolveConflictCause(fresh?.status);
        session.dispatch(
          cause === 'stale-version'
            ? { type: 'STALE_CONFLICT' }
            : { type: 'SAVE_FAILURE', failure: cause },
        );
      })();
    },
  });

  if (viewport === 'mobile') {
    return (
      <EditorNotice
        title={DESIGN_TEMPLATE_EDITOR_COPY.mobile.title}
        body={DESIGN_TEMPLATE_EDITOR_COPY.mobile.body}
        testId="editor-mobile-notice"
        tone="status"
      />
    );
  }

  const copy = DESIGN_TEMPLATE_EDITOR_COPY;

  if (source.kind === 'scope-assignable') {
    return (
      <EditorScopeAssignment
        products={scopeAssignment.products.products}
        productsLoading={scopeAssignment.products.isLoading}
        productsFailed={scopeAssignment.products.failed}
        onRetryProducts={scopeAssignment.products.retry}
        placement={placement.placement}
        placementLoading={placement.isLoading}
        placementFailed={placement.failed}
        onRetryPlacement={placement.retry}
        assigning={scopeAssignment.assigning}
        failure={scopeAssignment.failure}
        onProductChange={scopeAssignment.onProductChange}
        onAssign={scopeAssignment.assign}
      />
    );
  }

  if (source.kind !== 'ready' || state === null || ready === null) {
    return (
      <EditorBlockedState
        source={source.kind === 'ready' ? { kind: 'loading' } : source}
        onRetryDetail={detailQuery.refetch}
        onRetryPlacement={placement.retry}
      />
    );
  }

  const detail = detailQuery.detail;
  const chip = saveChip(state);
  const selected = selectedElement(state);
  const savedVersion = detail?.currentVersion?.version ?? null;

  const stageBackground: StageBackground =
    resolvedScope === null
      ? { kind: 'absent' }
      : background.objectUrl !== null
        ? { kind: 'ready', objectUrl: background.objectUrl }
        : background.failure !== null
          ? {
              kind: 'failed',
              retryable: background.failure === 'retryable',
              onRetry: background.retry,
            }
          : background.isLoading
            ? { kind: 'loading' }
            : { kind: 'absent' };

  const goBack = () => {
    guard.requestNavigation(() => {
      router.push(ADMIN_DESIGN_TEMPLATES_ROUTE);
    });
  };

  const reloadFromServer = async () => {
    setReloadPrompt(false);
    const fresh = await detailQuery.reload();
    if (fresh === undefined) return;
    const rebuilt = rebuildDocument(fresh, resolvedScope);
    if (rebuilt.kind === 'ok') session.reset(rebuilt.version, rebuilt.document);
  };

  return (
    <div className="template-editor" data-testid="template-editor">
      <EditorTopbar
        name={detail?.name ?? ''}
        status={STATUS_LABELS[detail?.status ?? ''] ?? copy.status.unknown}
        chip={chip}
        currentVersion={savedVersion}
        canSave={canSave(state, editable)}
        editable={editable}
        onSave={() => {
          session.dispatch({ type: 'MARK_SAVING' });
          mutation.save({
            templateId,
            expectedCurrentVersion: state.baselineVersion,
            document: state.document,
          });
        }}
        onBack={goBack}
      />

      {editable ? null : (
        <EditorNotice
          title={
            detail?.status === 'ARCHIVED'
              ? copy.readOnly.archivedTitle
              : copy.readOnly.publishedTitle
          }
          body={copy.readOnly.body}
          testId="editor-read-only"
          tone="status"
        />
      )}

      {state.conflicted && !state.conflictDialogOpen ? (
        <div
          className="template-editor__conflict-banner"
          role="status"
          data-testid="editor-conflict-banner"
        >
          <p className="template-editor__conflict-banner-text">{copy.conflict.banner}</p>
          {/*
            The banner tells the operator to reload, so it has to be able to.
            After choosing "keep my draft" the dialog is gone and the save is
            disabled, which left the only stated way forward unreachable — the
            same defect as a message prescribing an action the screen does not
            offer. Found in the browser, not in a test.
          */}
          <button
            type="button"
            className="template-editor__conflict-banner-action"
            data-testid="editor-conflict-banner-reload"
            onClick={() => {
              setReloadPrompt(true);
            }}
          >
            {copy.conflict.reload}
          </button>
        </div>
      ) : null}

      {state.saveError !== null && state.saveError !== 'stale-version' ? (
        <EditorNotice
          title={saveFailureCopy(state.saveError).title}
          body={saveFailureCopy(state.saveError).body}
          testId="editor-save-error"
          tone="alert"
        />
      ) : null}

      <div className="template-editor__workspace">
        <EditorLayerList
          document={state.document}
          selectedElementId={state.selectedElementId}
          editable={editable}
          onSelect={(elementId) => {
            session.dispatch({ type: 'SELECT_ELEMENT', elementId });
          }}
          onAddText={() => {
            if (!canAddTextElement(state.document) || resolvedScope === null) return;
            session.dispatch({
              type: 'ADD_ELEMENT',
              element: buildTextElement(
                state.document,
                resolvedScope.area,
                copy.layers.unnamedText,
              ),
            });
          }}
          onRemove={(elementId) => {
            session.dispatch({ type: 'REMOVE_ELEMENT', elementId });
          }}
        />

        <EditorStage
          document={state.document}
          scope={resolvedScope}
          background={stageBackground}
          selectedElementId={state.selectedElementId}
          onSelect={(elementId) => {
            session.dispatch({ type: 'SELECT_ELEMENT', elementId });
          }}
          onClearSelection={() => {
            session.dispatch({ type: 'CLEAR_SELECTION' });
          }}
        />

        <div className="template-editor__side">
          <EditorScopePanel
            scope={resolvedScope}
            canvasWidthPx={state.document.placement.canvasWidthPx}
            canvasHeightPx={state.document.placement.canvasHeightPx}
          />
          <EditorInspector
            element={selected}
            editable={editable}
            onUpdateText={(patch) => {
              if (state.selectedElementId === null) return;
              session.dispatch({ type: 'UPDATE_TEXT', elementId: state.selectedElementId, patch });
            }}
            onUpdateTransform={(patch) => {
              if (state.selectedElementId === null) return;
              session.dispatch({
                type: 'UPDATE_TRANSFORM',
                elementId: state.selectedElementId,
                patch,
              });
            }}
          />
        </div>
      </div>

      {state.conflictDialogOpen ? (
        <EditorConflictDialog
          onReload={() => {
            // Discarding a draft is always confirmed, even from inside the
            // conflict: the operator chose "reload", not "throw my work away".
            setReloadPrompt(true);
          }}
          onKeepLocal={() => {
            session.dispatch({ type: 'KEEP_LOCAL_DRAFT' });
          }}
        />
      ) : null}

      {reloadPrompt ? (
        <EditorConfirmDialog
          title={copy.conflict.reloadDiscardTitle}
          body={copy.conflict.reloadDiscardBody}
          confirmLabel={copy.conflict.reloadDiscardConfirm}
          cancelLabel={copy.conflict.reloadDiscardCancel}
          testId="editor-reload-confirm"
          onConfirm={() => {
            void reloadFromServer();
          }}
          onCancel={() => {
            setReloadPrompt(false);
          }}
        />
      ) : null}

      {guard.prompting ? (
        <EditorConfirmDialog
          title={copy.unsaved.title}
          body={copy.unsaved.body}
          confirmLabel={copy.unsaved.leave}
          cancelLabel={copy.unsaved.stay}
          testId="editor-unsaved-confirm"
          onConfirm={guard.confirmLeave}
          onCancel={guard.cancelLeave}
        />
      ) : null}
    </div>
  );
}
