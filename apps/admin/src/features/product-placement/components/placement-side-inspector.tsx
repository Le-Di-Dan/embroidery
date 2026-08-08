'use client';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { PLACEMENT_COPY } from '../model/placement-copy';
import type { SideDraft } from '../model/placement-draft';
import type { FieldErrors } from '../model/placement-validation';

interface PlacementSideInspectorProps {
  readonly side: SideDraft;
  readonly errors: FieldErrors;
  readonly onPatch: (patch: Partial<SideDraft>) => void;
  readonly onChooseBackground: () => void;
}

/**
 * The Side numeric inspector (`596:7`, right column).
 *
 * Only `APP3-B01`-authorized fields appear. There is no thumbnail alt text, no
 * SEO field, no material and no weight: inventing Side metadata the contract
 * cannot carry would produce a form whose values silently vanish on save.
 *
 * A retired side renders read-only. Its geometry and identity are frozen
 * server-side once a Template references it, so offering editable fields would
 * promise a save that `PLACEMENT_REFERENCED_IMMUTABLE` refuses.
 *
 * The background is chosen through the Admin asset picker, never by typing an
 * Asset UUID. The operator does not know asset ids and should not have to; the
 * field below shows that a background *is* selected without exposing a storage
 * key or a URL.
 */
export function PlacementSideInspector({
  side,
  errors,
  onPatch,
  onChooseBackground,
}: PlacementSideInspectorProps) {
  const readOnly = side.retiredAt !== null;

  return (
    <div className="placement-inspector__section" data-testid="placement-side-inspector">
      <h3 className="placement-inspector__section-title">{PLACEMENT_COPY.inspector.sideSection}</h3>

      {readOnly ? (
        <p className="placement-inspector__read-only" role="status">
          {PLACEMENT_COPY.inspector.readOnlyRetired}
        </p>
      ) : null}

      <AdminTextField
        label={PLACEMENT_COPY.fields.code}
        value={side.code}
        disabled={readOnly}
        help={PLACEMENT_COPY.fields.codeHelp}
        {...(errors['code'] === undefined ? {} : { error: errors['code'] })}
        onChange={(code) => {
          onPatch({ code });
        }}
      />

      <AdminTextField
        label={PLACEMENT_COPY.fields.name}
        value={side.name}
        disabled={readOnly}
        help={PLACEMENT_COPY.fields.nameHelp}
        {...(errors['name'] === undefined ? {} : { error: errors['name'] })}
        onChange={(name) => {
          onPatch({ name });
        }}
      />

      <AdminTextField
        label={PLACEMENT_COPY.fields.displayOrder}
        value={side.displayOrder}
        disabled={readOnly}
        inputMode="numeric"
        help={PLACEMENT_COPY.fields.displayOrderHelp}
        {...(errors['displayOrder'] === undefined ? {} : { error: errors['displayOrder'] })}
        onChange={(displayOrder) => {
          onPatch({ displayOrder });
        }}
      />

      <div className="placement-inspector__background">
        <p className="placement-inspector__label">{PLACEMENT_COPY.fields.backgroundAsset}</p>
        <p className="placement-inspector__background-state">
          {side.backgroundAssetId === ''
            ? PLACEMENT_COPY.fields.backgroundAssetHelp
            : PLACEMENT_COPY.picker.selected}
        </p>
        <button
          type="button"
          className="placement-inspector__secondary"
          disabled={readOnly}
          data-testid="placement-choose-background"
          onClick={onChooseBackground}
        >
          {side.backgroundAssetId === ''
            ? PLACEMENT_COPY.fields.chooseBackground
            : PLACEMENT_COPY.fields.changeBackground}
        </button>
        {errors['backgroundAssetId'] === undefined ? null : (
          <p className="placement-inspector__error" role="alert">
            {errors['backgroundAssetId']}
          </p>
        )}
      </div>

      <div className="placement-inspector__pair">
        <AdminTextField
          label={PLACEMENT_COPY.fields.imageWidthPx}
          value={side.imageWidthPx}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['imageWidthPx'] === undefined ? {} : { error: errors['imageWidthPx'] })}
          onChange={(imageWidthPx) => {
            onPatch({ imageWidthPx });
          }}
        />
        <AdminTextField
          label={PLACEMENT_COPY.fields.imageHeightPx}
          value={side.imageHeightPx}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['imageHeightPx'] === undefined ? {} : { error: errors['imageHeightPx'] })}
          onChange={(imageHeightPx) => {
            onPatch({ imageHeightPx });
          }}
        />
      </div>

      <div className="placement-inspector__pair">
        <AdminTextField
          label={PLACEMENT_COPY.fields.physicalWidthMm}
          value={side.physicalWidthMm}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['physicalWidthMm'] === undefined ? {} : { error: errors['physicalWidthMm'] })}
          onChange={(physicalWidthMm) => {
            onPatch({ physicalWidthMm });
          }}
        />
        <AdminTextField
          label={PLACEMENT_COPY.fields.physicalHeightMm}
          value={side.physicalHeightMm}
          disabled={readOnly}
          inputMode="decimal"
          {...(errors['physicalHeightMm'] === undefined
            ? {}
            : { error: errors['physicalHeightMm'] })}
          onChange={(physicalHeightMm) => {
            onPatch({ physicalHeightMm });
          }}
        />
      </div>

      <AdminTextField
        label={PLACEMENT_COPY.fields.pxPerMm}
        value={side.pxPerMm}
        disabled={readOnly}
        inputMode="decimal"
        help={PLACEMENT_COPY.fields.pxPerMmHelp}
        {...(errors['pxPerMm'] === undefined ? {} : { error: errors['pxPerMm'] })}
        testId="placement-px-per-mm"
        onChange={(pxPerMm) => {
          onPatch({ pxPerMm });
        }}
      />
    </div>
  );
}
