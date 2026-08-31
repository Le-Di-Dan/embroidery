'use client';

import { useMemo, useState } from 'react';

import { AdminAssetListScope } from '@embroidery/api-client';

import { flattenEligibleAssets } from '../model/gallery-asset-lanes';
import { buildAssetMetaLine, resolveAssetTitle } from '../model/gallery-asset-identity';
import { classifyPrepareFailure } from '../model/gallery-editor-failure';
import { GALLERY_MEDIA_COPY } from '../model/gallery-media-copy';
import {
  useGalleryAssetQuery,
  useGalleryPrepareAssetMutation,
} from '../hooks/use-gallery-asset-query';
import { GalleryDialog } from './gallery-dialog';

interface GallerySourcePickerDialogProps {
  readonly onClose: () => void;
  /** Receives the **new** asset's id — never the source's. */
  readonly onPrepared: (assetId: string) => void;
}

/**
 * Preparing a gallery image from a catalog source (`APP11-B03A`).
 *
 * ## What the operator chooses, and what they cannot
 *
 * They choose one product image. They do not choose — and this dialog sends no
 * value for — the new asset's kind, classification, lifecycle status, storage
 * key or rendition set. All of those are policy the server owns, and the
 * operation accepts none of them, so there is nothing here for an interface to
 * expose.
 *
 * The result is a **new** asset with its own id. The source keeps its id, its
 * lane, its status and every product association it had, so a published product
 * already serving that image keeps serving it.
 *
 * ## Tiles are placeholders here, and honestly so
 *
 * The gallery preview operation resolves `GALLERY_MEDIA` / `PUBLIC` assets
 * only, which is exactly right and exactly why a catalog source has no preview:
 * `APP2` publishes no authenticated delivery route for product media, so there
 * is no URL to point at, and rendering an `<img>` anyway would produce a
 * permanent broken-image icon. Each tile states the absence in text instead —
 * the same choice `APP2-A03`'s picker made, for the same reason.
 *
 * ## The stale-source refusal is never replayed
 *
 * Each row carries the `updatedAt` it was listed with, and that token is what
 * the request sends. If the source moved on, the server refuses and the
 * operator is told to reload the list and choose again — never automatically
 * retried with a refreshed token, because the operation is not idempotent and a
 * retry would prepare a second copy that no delivered operation can remove.
 */
export function GallerySourcePickerDialog({ onClose, onPrepared }: GallerySourcePickerDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const query = useGalleryAssetQuery(AdminAssetListScope.CATALOG, true);
  const mutation = useGalleryPrepareAssetMutation();

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const sources = useMemo(() => flattenEligibleAssets(pages, AdminAssetListScope.CATALOG), [pages]);

  const copy = GALLERY_MEDIA_COPY.source;
  const loadedPages = pages.length;
  const firstPageFailed = query.isError && loadedPages === 0;
  const pending = mutation.isPending;
  const failure = mutation.isError
    ? GALLERY_MEDIA_COPY.failure.prepare[classifyPrepareFailure(mutation.error)]
    : null;

  const chosen = sources.find((asset) => asset.assetId === selected);

  const submit = () => {
    if (chosen === undefined) {
      return;
    }
    mutation.mutate(
      {
        sourceAssetId: chosen.assetId,
        // The token this row was listed with, not one refetched at click time:
        // a token read after the operator chose would silently paper over the
        // very change the guard exists to report.
        expectedSourceUpdatedAt: chosen.updatedAt,
      },
      { onSuccess: (prepared) => onPrepared(prepared.assetId) },
    );
  };

  return (
    <GalleryDialog
      title={copy.title}
      describedBy="gallery-source-help"
      wide
      dismissible={!pending}
      onClose={onClose}
      testId="gallery-source-picker"
      footer={
        <div className="gallery-dialog__actions">
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={onClose}
            disabled={pending}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            className="gallery-dialog__primary"
            onClick={submit}
            disabled={pending || chosen === undefined}
            aria-busy={pending}
            data-testid="gallery-source-confirm"
          >
            {pending ? copy.preparing : copy.confirm}
          </button>
        </div>
      }
    >
      <p className="gallery-picker__help" id="gallery-source-help">
        {copy.help}
      </p>

      {failure === null ? null : (
        <div className="gallery-editor__failure" role="alert" data-testid="gallery-prepare-failure">
          <p className="gallery-editor__failure-title">{failure.title}</p>
          <p className="gallery-editor__failure-body">{failure.body}</p>
        </div>
      )}

      {query.isPending ? (
        <p className="gallery-picker__status" role="status">
          {copy.loading}
        </p>
      ) : null}

      {firstPageFailed ? (
        <div className="gallery-editor__failure" role="alert">
          <p className="gallery-editor__failure-title">{copy.unavailableTitle}</p>
          <p className="gallery-editor__failure-body">{copy.unavailableBody}</p>
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={() => {
              void query.refetch();
            }}
          >
            {copy.retry}
          </button>
        </div>
      ) : null}

      {!query.isPending && !firstPageFailed && sources.length === 0 ? (
        <div className="gallery-picker__empty" data-testid="gallery-source-empty">
          <p className="gallery-picker__empty-title">{copy.emptyTitle}</p>
          <p className="gallery-picker__empty-body">{copy.emptyBody}</p>
        </div>
      ) : null}

      {sources.length > 0 ? (
        <ul className="gallery-picker__grid">
          {sources.map((asset) => (
            <li key={asset.assetId} className="gallery-picker__option">
              <label className="gallery-picker__label">
                {/*
                  A labelled placeholder, not a broken image: there is no
                  authenticated delivery route for product media, so there is no
                  URL to point at. The label is on the tile itself rather than a
                  sentence under every card — repeating one line of prose on
                  each option says nothing the dialog's own help has not already
                  said, and it was what squeezed the captions to four lines.
                */}
                <span
                  className="gallery-asset-thumb gallery-asset-thumb--placeholder"
                  role="img"
                  aria-label={copy.optionAlt}
                >
                  <span className="gallery-asset-thumb__note">{copy.noPreview}</span>
                </span>
                <span className="gallery-picker__info">
                  <input
                    type="radio"
                    name="gallery-source-asset"
                    className="gallery-picker__checkbox"
                    checked={selected === asset.assetId}
                    disabled={pending}
                    onChange={() => setSelected(asset.assetId)}
                  />
                  <span className="gallery-picker__text">
                    <span className="gallery-picker__title">
                      {resolveAssetTitle(asset.mediaType)}
                    </span>
                    <span className="gallery-picker__meta">
                      {buildAssetMetaLine(asset.byteSize, asset.createdAt)}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <div className="gallery-picker__continuation">
          {query.isError && loadedPages > 0 ? (
            <p className="gallery-picker__continuation-error" role="alert">
              {copy.loadMoreFailed}
            </p>
          ) : null}
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={() => {
              void query.fetchNextPage();
            }}
            disabled={query.isFetchingNextPage || pending}
            aria-busy={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage
              ? copy.loadingMore
              : query.isError
                ? copy.retry
                : copy.loadMore}
          </button>
        </div>
      ) : null}
    </GalleryDialog>
  );
}
