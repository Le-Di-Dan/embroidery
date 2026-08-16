'use client';

/**
 * One uploader for one role (`654:3` empty, `654:397` cap reached).
 *
 * Two panels are rendered on the customer-owned branch and one on the catalog
 * branch, and each is bound to a single role. `ATTACHMENT` is not a value this
 * component's props can take, so the internal role is unreachable from the
 * customer surface rather than merely unused by it.
 *
 * The file input is a real `<input type="file">` with a `<label>`, so it is
 * keyboard-operable and announced without a custom widget, a drag surface or a
 * click-forwarding button — none of which the approved frames require and all of
 * which would have to re-implement the same behaviour.
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import {
  ACCEPTED_MEDIA_TYPES,
  ROLE_ASSET_CAP,
  slotsOfRole,
  type AssetSlot,
  type CustomerAssetRole,
} from '../model/request-asset-slot';
import { UploadSlotTile } from './upload-slot-tile';

export interface UploadRolePanelProps {
  readonly role: CustomerAssetRole;
  readonly heading: string;
  readonly hint: string;
  /** Distinct per role: two file inputs must not share one accessible name. */
  readonly chooseLabel: string;
  readonly slots: readonly AssetSlot[];
  readonly capReached: boolean;
  readonly quotaReached: boolean;
  /** Set when the branch requires an accepted image and has none yet. */
  readonly missing: boolean;
  readonly onAdd: (role: CustomerAssetRole, files: readonly File[]) => void;
  readonly onRetry: (key: string) => void;
  readonly onRemove: (key: string) => void;
}

export function UploadRolePanel(props: UploadRolePanelProps) {
  const { role, heading, hint, chooseLabel, slots, capReached, quotaReached, missing } = props;
  const mine = slotsOfRole(slots, role);
  const inputId = `upload-${role}`;
  const blocked = capReached || quotaReached;

  return (
    <section className="custom-request__section" aria-label={heading}>
      <h3 className="custom-request__section-heading">{heading}</h3>
      <p className="custom-request__hint">{hint}</p>
      <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.upload.formats}</p>

      <div className="custom-request__field">
        <label htmlFor={inputId}>{chooseLabel}</label>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPTED_MEDIA_TYPES.join(',')}
          disabled={blocked}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // The input is cleared so choosing the same file twice is two
            // distinct customer actions rather than a change event that never
            // fires the second time.
            event.target.value = '';
            if (files.length > 0) props.onAdd(role, files);
          }}
        />
      </div>

      <p className="custom-request__hint">
        {CUSTOM_REQUEST_COPY.upload.counter(mine.length, ROLE_ASSET_CAP)}
      </p>

      {quotaReached ? (
        <p className="custom-request__error">{CUSTOM_REQUEST_COPY.upload.quotaReached}</p>
      ) : capReached ? (
        <p className="custom-request__error">{CUSTOM_REQUEST_COPY.upload.capReached}</p>
      ) : null}

      {mine.length === 0 ? (
        <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.upload.empty}</p>
      ) : (
        <ul className="custom-request__tiles">
          {mine.map((slot) => (
            <UploadSlotTile
              key={slot.key}
              slot={slot}
              onRetry={props.onRetry}
              onRemove={props.onRemove}
            />
          ))}
        </ul>
      )}

      {missing ? (
        <p className="custom-request__error">{CUSTOM_REQUEST_COPY.upload.copRequired}</p>
      ) : null}
    </section>
  );
}
