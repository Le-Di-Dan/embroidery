'use client';

import { ASSET_COPY, withToken } from '../model/asset-copy';
import type { AssetUploadController } from '../hooks/use-asset-upload';
import { AssetUploadProgress } from './asset-upload-progress';

interface AssetUploadBannerProps {
  readonly controller: AssetUploadController;
}

/**
 * The transient banner above the collection: what the current upload intent is
 * doing, and the one action that makes sense for it.
 *
 * Two rules shape the copy. Uploading is determinate and cancellable; inspection
 * is not, and never borrows the upload percentage to fake one. And from the
 * server's 202 onward the heading uses the server-backed title, because the
 * local filename has stopped being the truth about the stored asset.
 *
 * The banner never removes an asset: there is no delete operation in the
 * contract, so a rejected asset stays visible in the collection as unusable.
 */
export function AssetUploadBanner({ controller }: AssetUploadBannerProps) {
  const { state, cancel, retry, dismiss } = controller;

  if (state.kind === 'idle' || state.kind === 'selected') {
    return null;
  }

  if (state.kind === 'uploading') {
    return (
      <section
        className="asset-banner asset-banner--uploading"
        aria-label={ASSET_COPY.progress.label}
      >
        <p className="asset-banner__title">
          {withToken(ASSET_COPY.progress.uploadingTitle, 'name', state.file.name)}
        </p>
        <AssetUploadProgress percent={state.percent} />
        <button type="button" className="asset-banner__action" onClick={cancel}>
          {ASSET_COPY.progress.cancel}
        </button>
      </section>
    );
  }

  if (state.kind === 'processing') {
    return (
      <section className="asset-banner asset-banner--processing" role="status" aria-live="polite">
        <p className="asset-banner__title">
          {withToken(ASSET_COPY.processing.title, 'name', state.title)}
        </p>
        <p className="asset-banner__body">{ASSET_COPY.processing.description}</p>
        <span className="asset-banner__spinner" aria-hidden="true" />
      </section>
    );
  }

  if (state.kind === 'accepted') {
    return (
      <section className="asset-banner asset-banner--accepted" role="status" aria-live="polite">
        <p className="asset-banner__title">
          {withToken(ASSET_COPY.accepted.title, 'name', state.title)}
        </p>
        <p className="asset-banner__body">{ASSET_COPY.accepted.description}</p>
      </section>
    );
  }

  if (state.kind === 'rejected') {
    return (
      <section className="asset-banner asset-banner--rejected" role="alert">
        <p className="asset-banner__title">
          {withToken(ASSET_COPY.rejected.title, 'name', state.title)}
        </p>
        <p className="asset-banner__body">{ASSET_COPY.rejected.description}</p>
        <button type="button" className="asset-banner__action" onClick={dismiss}>
          {ASSET_COPY.rejected.action}
        </button>
      </section>
    );
  }

  if (state.kind === 'indeterminate') {
    return (
      <section className="asset-banner asset-banner--unknown" role="status" aria-live="polite">
        <p className="asset-banner__title">
          {withToken(ASSET_COPY.unknownState.title, 'name', state.title)}
        </p>
        <p className="asset-banner__body">{ASSET_COPY.unknownState.description}</p>
      </section>
    );
  }

  if (state.kind === 'cancelled') {
    return (
      <section className="asset-banner asset-banner--cancelled" role="alert">
        <p className="asset-banner__title">{ASSET_COPY.cancelled.title}</p>
        <p className="asset-banner__body">{ASSET_COPY.cancelled.description}</p>
        <div className="asset-banner__actions">
          <button type="button" className="asset-banner__action" onClick={retry}>
            {ASSET_COPY.cancelled.retry}
          </button>
          <button type="button" className="asset-banner__action-ghost" onClick={dismiss}>
            {ASSET_COPY.cancelled.dismiss}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="asset-banner asset-banner--failed" role="alert">
      <p className="asset-banner__title">{ASSET_COPY.uploadError.title}</p>
      <p className="asset-banner__body">{state.message}</p>
      <div className="asset-banner__actions">
        {state.retryable ? (
          <button type="button" className="asset-banner__action" onClick={retry}>
            {ASSET_COPY.uploadError.retry}
          </button>
        ) : null}
        <button type="button" className="asset-banner__action-ghost" onClick={dismiss}>
          {ASSET_COPY.uploadError.dismiss}
        </button>
      </div>
    </section>
  );
}
