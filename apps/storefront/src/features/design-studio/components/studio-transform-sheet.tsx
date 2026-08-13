'use client';

/**
 * The mobile transform sheet (`APP3-S11`, `610:294`).
 *
 * Three read-outs and six buttons, and every one of the six goes down the path a
 * pointer drag already goes down: candidate → `APP3-P01` structure → quantize →
 * `APP3-P02` containment → `APP3-P02` physical size → commit, or refuse and
 * change nothing. There is no second geometry here, no clamping, no snapping and
 * no warn-but-persist — `IMP-D045` PO-09 forbids all four, and a numeric control
 * is exactly where they would look reasonable.
 *
 * ## One press is one thing the customer did
 *
 * Each accepted adjustment commits once with its own `APP3-S08` action, so it is
 * one undo. A refused one commits nothing and appends nothing: there is no entry
 * for a change that did not happen.
 *
 * ## The numbers are measured, not echoed
 *
 * The millimetre figures come from `APP3-P02` bounds through the Side's
 * `pxPerMm`, re-measured after every accepted press. Pressing `+` on a rotated
 * element moves its measured width by *about* a millimetre, and the read-out says
 * what it became. See `studio-mobile-transform.ts` for why a millimetre button
 * cannot write a millimetre.
 */
import type { DesignDocument } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';
import type { ElementGraph } from '@embroidery/design-engine';

import type { StudioHistoryAction } from '../model/studio-history';
import { layerLabel } from '../model/studio-layers';
import { STUDIO_MOBILE_COPY } from '../model/studio-mobile-copy';
import {
  formatDegrees,
  formatMm,
  measuredSizeMm,
  resizeByStep,
  rotateByStep,
  type SizeAxis,
} from '../model/studio-mobile-transform';
import {
  type StudioAreaLimits,
  ruleOnCandidate,
  withTransform,
} from '../model/studio-transform-authority';
import { STUDIO_TRANSFORM_COPY } from '../model/studio-transform-copy';

export interface StudioTransformSheetProps {
  readonly document: DesignDocument | null;
  readonly graph: ElementGraph | null;
  readonly elementId: string | null;
  readonly scope: DesignSessionScopeResponse | null;
  readonly limits: StudioAreaLimits | null;
  readonly commit: (document: DesignDocument, action: StudioHistoryAction) => void;
  /** Set when the last press was refused, cleared when one is accepted. */
  readonly onRefusal: (refusal: string | null) => void;
  readonly refusal: string | null;
}

export function StudioTransformSheet({
  document,
  graph,
  elementId,
  scope,
  limits,
  commit,
  onRefusal,
  refusal,
}: StudioTransformSheetProps) {
  const element =
    document === null || elementId === null
      ? undefined
      : document.elements.find((candidate) => candidate.id === elementId);
  // Hidden and locked elements keep their geometry and may not be transformed —
  // the same bar the desktop overlay applies, not a softer mobile one.
  const editable = element !== undefined && element.visible && !element.locked;

  if (!editable || document === null || graph === null || scope === null) {
    return (
      <p className="studio-transform-sheet__unavailable" role="status">
        {STUDIO_MOBILE_COPY.transform.noSelection}
      </p>
    );
  }

  const measured = measuredSizeMm(document, element.id, graph, scope.pxPerMm);

  function attempt(next: ReturnType<typeof rotateByStep> | undefined, kind: 'resize' | 'rotate') {
    if (next === undefined || document === null || element === undefined || scope === null) {
      onRefusal(STUDIO_TRANSFORM_COPY.unreadable);
      return;
    }
    const outcome = ruleOnCandidate(
      withTransform(document, element.id, next),
      element.id,
      scope,
      limits,
    );
    if (!outcome.ok) {
      onRefusal(refusalCopy(outcome.refusal));
      return;
    }
    onRefusal(null);
    commit(outcome.document, { kind, label: layerLabel(element) });
  }

  function step(axis: SizeAxis, direction: 1 | -1) {
    if (measured === null || element === undefined) {
      onRefusal(STUDIO_MOBILE_COPY.transform.unavailable);
      return;
    }
    attempt(resizeByStep(element.transform, axis, direction, measured), 'resize');
  }

  return (
    <div className="studio-transform-sheet">
      <Row
        label={STUDIO_MOBILE_COPY.transform.width}
        onDecrease={() => {
          step('width', -1);
        }}
        onIncrease={() => {
          step('width', 1);
        }}
        testId="studio-mobile-width"
        value={measured === null ? null : formatMm(measured.widthMm)}
      />
      <Row
        label={STUDIO_MOBILE_COPY.transform.height}
        onDecrease={() => {
          step('height', -1);
        }}
        onIncrease={() => {
          step('height', 1);
        }}
        testId="studio-mobile-height"
        value={measured === null ? null : formatMm(measured.heightMm)}
      />
      <Row
        label={STUDIO_MOBILE_COPY.transform.rotation}
        onDecrease={() => {
          attempt(rotateByStep(element.transform, -1), 'rotate');
        }}
        onIncrease={() => {
          attempt(rotateByStep(element.transform, 1), 'rotate');
        }}
        testId="studio-mobile-rotation"
        value={formatDegrees(element.transform.rotationDeg)}
      />

      {refusal === null ? null : (
        <p
          className="studio-transform-sheet__refusal"
          data-testid="studio-mobile-transform-refusal"
          role="alert"
        >
          {refusal}
        </p>
      )}
      <p className="studio-transform-sheet__note">{STUDIO_MOBILE_COPY.transform.targetNote}</p>
    </div>
  );
}

interface RowProps {
  readonly label: string;
  readonly value: string | null;
  readonly onDecrease: () => void;
  readonly onIncrease: () => void;
  readonly testId: string;
}

function Row({ label, value, onDecrease, onIncrease, testId }: RowProps) {
  return (
    <div className="studio-transform-sheet__row">
      <span className="studio-transform-sheet__label" id={`${testId}-label`}>
        {label}
      </span>
      <div className="studio-transform-sheet__control">
        <button
          aria-label={STUDIO_MOBILE_COPY.transform.decrease(label)}
          className="studio-transform-sheet__step"
          data-testid={`${testId}-decrease`}
          disabled={value === null}
          onClick={onDecrease}
          type="button"
        >
          <span aria-hidden="true">−</span>
        </button>
        {/*
          A read-out, not a field. `610:294` draws a value between two steppers,
          and a text input here would be a fourth way to propose geometry —
          with its own parsing, its own empty state and its own idea of what a
          half-typed number means.
        */}
        <output
          aria-labelledby={`${testId}-label`}
          className="studio-transform-sheet__value"
          data-testid={`${testId}-value`}
        >
          {value ?? STUDIO_MOBILE_COPY.transform.unavailable}
        </output>
        <button
          aria-label={STUDIO_MOBILE_COPY.transform.increase(label)}
          className="studio-transform-sheet__step"
          data-testid={`${testId}-increase`}
          disabled={value === null}
          onClick={onIncrease}
          type="button"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}

function refusalCopy(
  refusal: 'unreadable-candidate' | 'outside-embroidery-area' | 'too-large-for-area',
) {
  switch (refusal) {
    case 'outside-embroidery-area':
      return STUDIO_TRANSFORM_COPY.outsideArea;
    case 'too-large-for-area':
      return STUDIO_TRANSFORM_COPY.tooLarge;
    default:
      return STUDIO_TRANSFORM_COPY.unreadable;
  }
}
