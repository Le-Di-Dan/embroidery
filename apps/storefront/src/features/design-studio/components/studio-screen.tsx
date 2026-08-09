'use client';

import { useEffect, useReducer } from 'react';

import { useStudioPlacement } from '../hooks/use-studio-placement';
import { useStudioSession } from '../hooks/use-studio-session';
import { useTemplateDetail } from '../hooks/use-template-detail';
import { useTemplateList } from '../hooks/use-template-list';
import { useTemplatePreview } from '../hooks/use-template-preview';
import { STUDIO_COPY } from '../model/studio-copy';
import { codesOf, findArea, findSide, tripleOf } from '../model/studio-placement';
import { EMPTY_STUDIO_SELECTION, studioSelectionReducer } from '../model/studio-selection';
import { previewReferenceOf } from '../model/studio-template';
import { StudioPlacementPicker } from './studio-placement-picker';
import { StudioSessionExpired } from './studio-session-expired';
import { StudioSessionPanel } from './studio-session-panel';
import { StudioStartActions } from './studio-start-actions';
import { StudioTemplatePicker } from './studio-template-picker';
import { StudioTemplatePreview } from './studio-template-preview';
import { StudioUnavailable } from './studio-unavailable';

export interface StudioScreenProps {
  readonly productSlug: string;
  readonly productName: string;
}

/**
 * The Studio bootstrap island (`APP3-S01`).
 *
 * Everything on this screen is one chain, and the chain is what enforces the
 * rules rather than a sequence of guards:
 *
 *     placement → side → area → triple → template list → detail → preview
 *                                     ↘ codes → session
 *
 * Each stage is `undefined` until the one before it resolves, so there is no
 * state in which a Template is requested without a complete triple, a preview
 * is requested without a published version, or a Session is opened without the
 * exact placement the visitor is looking at.
 *
 * The route ends here. Once a Session snapshot exists, S01 has done its job and
 * hands over to the `APP3-S02` stage — it does not create the editor's state
 * container, and it shows no editing control it cannot honour.
 */
export function StudioScreen({ productSlug, productName }: StudioScreenProps) {
  const { placement, isLoading, hasError, retry } = useStudioPlacement(productSlug);
  const [selection, dispatch] = useReducer(studioSelectionReducer, EMPTY_STUDIO_SELECTION);

  // Re-derive against every manifest that arrives, not only the first. A Side or
  // Area retired since the last read is replaced here, which is what makes the
  // screen revocation-aware without polling for revocations.
  useEffect(() => {
    if (placement === undefined) return;
    dispatch({ type: 'reconcile', placement });
  }, [placement]);

  const side = placement === undefined ? undefined : findSide(placement, selection.sideId);
  const area = findArea(side, selection.areaId);
  const triple = placement === undefined ? undefined : tripleOf(placement, side, area);
  const codes = codesOf(side, area);

  const eligible = placement?.studioEligible === true;
  const list = useTemplateList(eligible ? triple : undefined);
  const detail = useTemplateDetail(eligible ? triple : undefined, selection.templateSlug);

  /**
   * A Template that has stopped being available authorises nothing further.
   *
   * `APP3-B05`'s detail read is the moment a listed Template can be found to
   * have been unpublished, archived or withdrawn. The selection is dropped for
   * every downstream purpose — preview, clone, the pressed state in the picker
   * — while the reason stays on screen. It is never silently converted into a
   * blank start: the visitor chose a Template, and Blank is a separate action
   * they have to take themselves.
   */
  const liveTemplateSlug = detail.failure === 'gone' ? null : selection.templateSlug;
  const previewReference =
    detail.detail === undefined || liveTemplateSlug === null
      ? undefined
      : previewReferenceOf(detail.detail);
  const preview = useTemplatePreview(previewReference);
  const session = useStudioSession(productSlug);

  if (isLoading) {
    return (
      <p className="studio__status" role="status">
        {STUDIO_COPY.loadingPlacement}
      </p>
    );
  }

  if (hasError || placement === undefined) {
    return <StudioUnavailable reason="error" onRetry={retry} />;
  }

  if (session.isExpired) {
    return <StudioSessionExpired onRestart={session.restart} />;
  }

  if (session.snapshot !== null) {
    return (
      <StudioSessionPanel
        isResuming={session.isResuming}
        onResume={session.resume}
        snapshot={session.snapshot}
      />
    );
  }

  if (!eligible) return <StudioUnavailable reason="ineligible" />;

  return (
    <div className="studio">
      <p className="studio__intro">
        {STUDIO_COPY.introPrefix} <strong>{productName}</strong>
      </p>

      <StudioPlacementPicker
        onSelectArea={(areaId) => {
          dispatch({ type: 'select-area', placement, areaId });
        }}
        onSelectSide={(sideId) => {
          dispatch({ type: 'select-side', placement, sideId });
        }}
        placement={placement}
        selection={selection}
      />

      <section className="studio__templates" aria-labelledby="studio-templates-heading">
        <h2 className="studio__section-heading" id="studio-templates-heading">
          {STUDIO_COPY.templateHeading}
        </h2>
        <StudioTemplatePicker
          list={list}
          onSelect={(templateSlug) => {
            dispatch({ type: 'select-template', templateSlug });
          }}
          selectedSlug={liveTemplateSlug}
        />
      </section>

      {selection.templateSlug === null ? null : (
        <section className="studio__preview" aria-labelledby="studio-preview-heading">
          <h2 className="studio__section-heading" id="studio-preview-heading">
            {STUDIO_COPY.previewHeading}
          </h2>
          <StudioTemplatePreview
            detail={detail}
            isTextOnly={detail.detail !== undefined && previewReference === undefined}
            preview={preview}
          />
        </section>
      )}

      <StudioStartActions
        canStart={codes !== undefined}
        onStartBlank={() => {
          if (codes !== undefined) session.startBlank(codes);
        }}
        onStartClone={() => {
          if (codes !== undefined && liveTemplateSlug !== null) {
            session.startClone(codes, liveTemplateSlug);
          }
        }}
        selectedTemplateSlug={liveTemplateSlug}
        session={session}
      />
    </div>
  );
}
