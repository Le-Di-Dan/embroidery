'use client';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { PLACEMENT_COPY } from '../model/placement-copy';
import type { AreaDraft } from '../model/placement-draft';
import type { FieldErrors } from '../model/placement-validation';

interface PlacementAreaInspectorProps {
  readonly area: AreaDraft;
  readonly errors: FieldErrors;
  readonly onPatch: (patch: Partial<AreaDraft>) => void;
}

/**
 * The Embroidery Area numeric inspector (`596:7`, right column, area state).
 *
 * Bounds are authored in the side's own canvas pixels, which is what the
 * contract persists. They are shown as four independent numbers rather than as
 * a single "size" control because the server validates origin and extent
 * separately, and an operator correcting an out-of-bounds area needs to see
 * which of the four is at fault.
 *
 * The physical maxima are optional. An empty field means "the side is the only
 * limit" — the contract omits the member entirely — and is deliberately not the
 * same as `0`, which would be a real maximum of zero millimetres.
 *
 * A retired area renders read-only: its geometry is frozen once a Template
 * references it, and `PLACEMENT_REFERENCED_IMMUTABLE` would refuse the save.
 */
export function PlacementAreaInspector({ area, errors, onPatch }: PlacementAreaInspectorProps) {
  const readOnly = area.retiredAt !== null;

  return (
    <div className="placement-inspector__section" data-testid="placement-area-inspector">
      <h3 className="placement-inspector__section-title">{PLACEMENT_COPY.inspector.areaSection}</h3>

      {readOnly ? (
        <p className="placement-inspector__read-only" role="status">
          {PLACEMENT_COPY.inspector.readOnlyRetired}
        </p>
      ) : null}

      <AdminTextField
        label={PLACEMENT_COPY.fields.code}
        value={area.code}
        disabled={readOnly}
        help={PLACEMENT_COPY.fields.codeHelp}
        {...(errors['code'] === undefined ? {} : { error: errors['code'] })}
        onChange={(code) => {
          onPatch({ code });
        }}
      />

      <AdminTextField
        label={PLACEMENT_COPY.fields.name}
        value={area.name}
        disabled={readOnly}
        help={PLACEMENT_COPY.fields.nameHelp}
        {...(errors['name'] === undefined ? {} : { error: errors['name'] })}
        onChange={(name) => {
          onPatch({ name });
        }}
      />

      <AdminTextField
        label={PLACEMENT_COPY.fields.displayOrder}
        value={area.displayOrder}
        disabled={readOnly}
        inputMode="numeric"
        help={PLACEMENT_COPY.fields.displayOrderHelp}
        {...(errors['displayOrder'] === undefined ? {} : { error: errors['displayOrder'] })}
        onChange={(displayOrder) => {
          onPatch({ displayOrder });
        }}
      />

      <div className="placement-inspector__pair">
        <AdminTextField
          label={PLACEMENT_COPY.fields.boundXPx}
          value={area.boundXPx}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['boundXPx'] === undefined ? {} : { error: errors['boundXPx'] })}
          onChange={(boundXPx) => {
            onPatch({ boundXPx });
          }}
        />
        <AdminTextField
          label={PLACEMENT_COPY.fields.boundYPx}
          value={area.boundYPx}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['boundYPx'] === undefined ? {} : { error: errors['boundYPx'] })}
          onChange={(boundYPx) => {
            onPatch({ boundYPx });
          }}
        />
      </div>

      <div className="placement-inspector__pair">
        <AdminTextField
          label={PLACEMENT_COPY.fields.boundWidthPx}
          value={area.boundWidthPx}
          disabled={readOnly}
          inputMode="decimal"
          testId="placement-bound-width"
          {...(errors['boundWidthPx'] === undefined ? {} : { error: errors['boundWidthPx'] })}
          onChange={(boundWidthPx) => {
            onPatch({ boundWidthPx });
          }}
        />
        <AdminTextField
          label={PLACEMENT_COPY.fields.boundHeightPx}
          value={area.boundHeightPx}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['boundHeightPx'] === undefined ? {} : { error: errors['boundHeightPx'] })}
          onChange={(boundHeightPx) => {
            onPatch({ boundHeightPx });
          }}
        />
      </div>

      <div className="placement-inspector__pair">
        <AdminTextField
          label={PLACEMENT_COPY.fields.maxWidthMm}
          value={area.maxWidthMm}
          disabled={readOnly}
          inputMode="decimal"
          help={PLACEMENT_COPY.fields.maxHelp}
          {...(errors['maxWidthMm'] === undefined ? {} : { error: errors['maxWidthMm'] })}
          onChange={(maxWidthMm) => {
            onPatch({ maxWidthMm });
          }}
        />
        <AdminTextField
          label={PLACEMENT_COPY.fields.maxHeightMm}
          value={area.maxHeightMm}
          disabled={readOnly}
          inputMode="decimal"
          help={PLACEMENT_COPY.fields.maxHelp}
          {...(errors['maxHeightMm'] === undefined ? {} : { error: errors['maxHeightMm'] })}
          onChange={(maxHeightMm) => {
            onPatch({ maxHeightMm });
          }}
        />
      </div>
    </div>
  );
}
