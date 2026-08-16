'use client';

/**
 * One upload tile (`654:66`, `654:138`, `654:214`, `654:309`).
 *
 * The status is announced as **text**, not only as a colour or an icon: the
 * difference between "đang kiểm tra" and "ảnh không dùng được" decides whether
 * the customer can submit, and colour alone would not carry it.
 *
 * The failure line renders a bounded class from `APP5-S01` §12 — never a message
 * the server wrote. `AssetSlot.failure` cannot hold anything else, so this
 * component has no way to leak scanner output, a detected MIME type or a
 * storage key even if one reached the browser.
 */
import { CustomRequestAssetStatusResponseState } from '@embroidery/api-client';

import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import type { AssetSlot } from '../model/request-asset-slot';

export interface UploadSlotTileProps {
  readonly slot: AssetSlot;
  readonly onRetry: (key: string) => void;
  readonly onRemove: (key: string) => void;
}

export function UploadSlotTile({ slot, onRetry, onRemove }: UploadSlotTileProps) {
  const statusId = `${slot.key}-status`;

  return (
    <li className="custom-request__tile">
      <p className="custom-request__tile-name">{slot.fileName}</p>

      <p id={statusId} className="custom-request__tile-status" role="status">
        {statusText()}
      </p>

      <div className="custom-request__tile-actions">
        {slot.phase === 'FAILED' && slot.assetId === undefined ? (
          <button
            type="button"
            className="custom-request__button custom-request__button--quiet"
            aria-describedby={statusId}
            onClick={() => {
              onRetry(slot.key);
            }}
          >
            {CUSTOM_REQUEST_COPY.upload.retry}
          </button>
        ) : null}

        <button
          type="button"
          className="custom-request__button custom-request__button--quiet"
          aria-describedby={statusId}
          onClick={() => {
            onRemove(slot.key);
          }}
        >
          {CUSTOM_REQUEST_COPY.upload.remove}
        </button>
      </div>
    </li>
  );

  function statusText(): string {
    if (slot.phase === 'FAILED') {
      return CUSTOM_REQUEST_COPY.uploadFailure[slot.failure ?? 'GENERIC'];
    }
    if (slot.phase === 'UPLOADING') return CUSTOM_REQUEST_COPY.upload.uploading;

    switch (slot.state) {
      case CustomRequestAssetStatusResponseState.ACCEPTED:
        // `bindable` is what the submission actually uses; the word the customer
        // reads follows the published state, which is what the frames draw.
        return CUSTOM_REQUEST_COPY.upload.accepted;
      case CustomRequestAssetStatusResponseState.REJECTED:
        return CUSTOM_REQUEST_COPY.upload.rejected;
      default:
        return CUSTOM_REQUEST_COPY.upload.inspecting;
    }
  }
}
