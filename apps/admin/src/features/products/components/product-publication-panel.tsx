'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { AdminProductDetailResponse } from '@embroidery/api-client';

import { PRODUCT_PUBLICATION_COPY } from '../model/product-publication-copy';
import {
  canPublish,
  canUnpublish,
  type CoherentPublicationSnapshot,
} from '../model/product-publication';
import {
  classifyPublicationFailure,
  unmetRequirementCodesFrom,
  type PublicationCommandFailure,
} from '../model/product-publication-failure';
import { adminProductDetailRoute } from '../model/product-route';
import {
  useProductPublishMutation,
  useProductUnpublishMutation,
} from '../hooks/use-publication-mutations';
import { ProductConflictDialog } from './product-confirm-dialogs';
import { ProductPublicationSummary } from './product-publication-summary';
import { ProductRequirementList } from './product-requirement-list';
import { ProductUnpublishDialog } from './product-unpublish-dialog';

/**
 * The result of a completed command.
 *
 * Owned by the screen, not by this panel. A command that has already been
 * answered is a fact about what happened, and it has to outlive whatever the
 * screen renders next — including the brief window after a successful publish
 * when the readiness report is still being refetched and this panel is not
 * mounted at all.
 */
export type PublicationOutcome =
  | { readonly kind: 'published' }
  | { readonly kind: 'unpublished' }
  | { readonly kind: 'failed'; readonly failure: PublicationCommandFailure };

interface ProductPublicationPanelProps {
  readonly product: AdminProductDetailResponse;
  readonly snapshot: CoherentPublicationSnapshot;
  /** Refetches detail and readiness together, restoring a coherent pair. */
  readonly onReload: () => void;
  readonly onOutcome: (outcome: PublicationOutcome | null) => void;
  /** Requirement codes the last refused command named, for emphasis only. */
  readonly flagged: readonly string[];
  readonly onFlagged: (codes: readonly string[]) => void;
}

/**
 * The publication interaction for a coherent snapshot (`441:106`, `442:110`,
 * `442:205`).
 *
 * Every lifecycle action is gated on the snapshot rather than on local state,
 * and the token sent with a command comes from that same snapshot as a unit —
 * so a command is never composed from a status the operator saw and a token
 * they did not.
 *
 * Nothing is optimistic. The heading, the status and the available actions all
 * re-derive from the cache after the server answers, which is why a refused
 * publish leaves the screen showing `DRAFT` rather than a state that was never
 * reached.
 *
 * A stale-token refusal opens the reload dialog. Every other refusal does not:
 * reloading discards nothing here, but it also fixes nothing when the real
 * problem is an unmet requirement or a forbidden transition, and offering it
 * would send the operator around a loop that cannot terminate.
 */
export function ProductPublicationPanel({
  product,
  snapshot,
  onReload,
  onOutcome,
  flagged,
  onFlagged,
}: ProductPublicationPanelProps) {
  const publish = useProductPublishMutation();
  const unpublish = useProductUnpublishMutation();
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const pending = publish.isPending || unpublish.isPending;

  function handleFailure(error: unknown) {
    const failure = classifyPublicationFailure(error);
    if (failure === 'version-conflict') {
      // The only refusal reload repairs, and the only one allowed to open the
      // approved dialog.
      setConflict(true);
      return;
    }
    if (failure === 'not-ready') {
      // The server named the requirements it objected to; highlight them, but
      // let the refetched report — not the error — decide what the rows say.
      onFlagged(unmetRequirementCodesFrom(error));
    }
    onOutcome({ kind: 'failed', failure });
    onReload();
  }

  function runPublish() {
    onOutcome(null);
    onFlagged([]);
    publish.mutate(
      { productId: snapshot.productId, body: { expectedUpdatedAt: snapshot.expectedUpdatedAt } },
      {
        onSuccess: () => {
          onOutcome({ kind: 'published' });
        },
        onError: handleFailure,
      },
    );
  }

  function runUnpublish() {
    onOutcome(null);
    onFlagged([]);
    unpublish.mutate(
      { productId: snapshot.productId, body: { expectedUpdatedAt: snapshot.expectedUpdatedAt } },
      {
        onSuccess: () => {
          setConfirming(false);
          onOutcome({ kind: 'unpublished' });
        },
        onError: (error) => {
          setConfirming(false);
          handleFailure(error);
        },
      },
    );
  }

  const detailRoute = adminProductDetailRoute(snapshot.productId);
  const publishable = canPublish(snapshot);
  const unpublishable = canUnpublish(snapshot);

  return (
    <>
      {snapshot.status === 'DRAFT' && !snapshot.eligible ? (
        <div
          className="product-publication__banner product-publication__banner--blocked"
          role="status"
        >
          <p className="product-publication__banner-title">
            {PRODUCT_PUBLICATION_COPY.blocked.title}
          </p>
          <p className="product-publication__banner-body">
            {PRODUCT_PUBLICATION_COPY.blocked.body}
          </p>
        </div>
      ) : null}

      <div className="product-publication__columns">
        <ProductPublicationSummary product={product} />

        <section
          className="product-publication__card product-publication__card--actions"
          aria-labelledby="publication-requirements-heading"
        >
          <h2 className="product-publication__card-title" id="publication-requirements-heading">
            {publicationCardTitle(snapshot)}
          </h2>

          <ProductRequirementList requirements={snapshot.requirements} highlighted={flagged} />

          {snapshot.status === 'DRAFT' ? (
            <>
              <button
                type="button"
                className="product-publication__primary"
                onClick={runPublish}
                disabled={!publishable || pending}
                aria-disabled={!publishable || pending}
                data-testid="publish-action"
              >
                {publish.isPending
                  ? PRODUCT_PUBLICATION_COPY.ready.publishing
                  : PRODUCT_PUBLICATION_COPY.ready.publish}
              </button>
              <Link className="product-publication__secondary" href={detailRoute}>
                {publishable
                  ? PRODUCT_PUBLICATION_COPY.ready.edit
                  : PRODUCT_PUBLICATION_COPY.blocked.edit}
              </Link>
              <p className="product-publication__note">
                {publishable
                  ? PRODUCT_PUBLICATION_COPY.ready.consequence
                  : PRODUCT_PUBLICATION_COPY.blocked.body}
              </p>
            </>
          ) : null}

          {snapshot.status === 'PUBLISHED' ? (
            <>
              <button
                type="button"
                className="product-publication__primary product-publication__primary--danger"
                onClick={() => {
                  setConfirming(true);
                }}
                disabled={!unpublishable || pending}
                aria-disabled={!unpublishable || pending}
                data-testid="unpublish-action"
              >
                {unpublish.isPending
                  ? PRODUCT_PUBLICATION_COPY.published.unpublishing
                  : PRODUCT_PUBLICATION_COPY.published.unpublish}
              </button>
              {/*
                "Xem chi tiết", not "Chỉnh sửa": `APP2-A03` edits DRAFT only, so
                labelling this as editing would promise something the next
                screen refuses.
              */}
              <Link className="product-publication__secondary" href={detailRoute}>
                {PRODUCT_PUBLICATION_COPY.published.view}
              </Link>
              <p className="product-publication__note">{PRODUCT_PUBLICATION_COPY.published.body}</p>
            </>
          ) : null}

          {snapshot.status !== 'DRAFT' && snapshot.status !== 'PUBLISHED' ? (
            <p className="product-publication__note" data-testid="publication-readonly">
              {PRODUCT_PUBLICATION_COPY.archived.body}
            </p>
          ) : null}
        </section>
      </div>

      {confirming ? (
        <ProductUnpublishDialog
          pending={unpublish.isPending}
          onConfirm={runUnpublish}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      ) : null}

      {conflict ? (
        <ProductConflictDialog
          onReload={() => {
            setConflict(false);
            onReload();
          }}
          onClose={() => {
            setConflict(false);
          }}
        />
      ) : null}
    </>
  );
}

/** The card heading tracks the lifecycle state, not the readiness verdict. */
function publicationCardTitle(snapshot: CoherentPublicationSnapshot): string {
  if (snapshot.status === 'PUBLISHED') {
    return PRODUCT_PUBLICATION_COPY.published.title;
  }
  if (snapshot.status !== 'DRAFT') {
    return PRODUCT_PUBLICATION_COPY.archived.title;
  }
  return snapshot.eligible
    ? PRODUCT_PUBLICATION_COPY.ready.title
    : PRODUCT_PUBLICATION_COPY.blocked.title;
}
