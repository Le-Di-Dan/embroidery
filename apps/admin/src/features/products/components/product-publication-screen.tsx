'use client';

import { useState } from 'react';
import Link from 'next/link';

import { isNotFound } from '../model/product-conflict';
import { PRODUCT_PUBLICATION_COPY } from '../model/product-publication-copy';
import { toCoherentSnapshot } from '../model/product-publication';
import { parseProductStatus, productStatusLabel } from '../model/product-status';
import { ADMIN_PRODUCTS_ROUTE, adminProductDetailRoute } from '../model/product-route';
import { useProductDetailQuery } from '../hooks/use-product-detail-query';
import { usePublicationReadinessQuery } from '../hooks/use-publication-readiness-query';
import { ProductPublicationPanel, type PublicationOutcome } from './product-publication-panel';
import { ProductPublicationSummary } from './product-publication-summary';

interface ProductPublicationScreenProps {
  readonly productId: string;
}

/**
 * `/products/[productId]/publication` — the load boundary.
 *
 * Two independent reads have to agree before any lifecycle action is offered,
 * so this screen has one more state than the form does: the *incoherent* pair,
 * where both requests succeeded and disagree. That is not a failure — it means
 * the product changed between the two responses — and it resolves by refetching
 * them together rather than by telling the operator something went wrong.
 *
 * Readiness failing alone is treated differently from the product failing. The
 * summary is still authoritative and worth showing, so it stays on screen with
 * a retry for the report; discarding the whole page because a secondary read
 * failed would hide information that is perfectly good.
 *
 * There is no editable form on this route, so no unsaved-change guard is
 * registered here. Departures *into* this route from a dirty A03 form are
 * intercepted by that form's existing seam through the shared navigation guard.
 */
export function ProductPublicationScreen({ productId }: ProductPublicationScreenProps) {
  const detail = useProductDetailQuery(productId);
  const readiness = usePublicationReadinessQuery(productId);
  const [outcome, setOutcome] = useState<PublicationOutcome | null>(null);
  const [flagged, setFlagged] = useState<readonly string[]>([]);

  function reloadBoth() {
    void detail.refetch();
    void readiness.refetch();
  }

  /**
   * The result of the last completed command.
   *
   * Rendered here rather than inside the panel so it survives every subsequent
   * state. After a successful publish the readiness report is briefly absent
   * while it refetches, and the panel is not mounted — a banner living there
   * would vanish at exactly the moment it is most needed.
   */
  const outcomeBanner =
    outcome === null ? null : outcome.kind === 'failed' ? (
      <div className="product-publication__banner product-publication__banner--error" role="alert">
        <p className="product-publication__banner-title">
          {PRODUCT_PUBLICATION_COPY.commandFailure[outcome.failure].title}
        </p>
        <p className="product-publication__banner-body">
          {PRODUCT_PUBLICATION_COPY.commandFailure[outcome.failure].body}
        </p>
      </div>
    ) : (
      <div
        className="product-publication__banner product-publication__banner--success"
        role="status"
      >
        <p className="product-publication__banner-title">
          {outcome.kind === 'published'
            ? PRODUCT_PUBLICATION_COPY.success.publishedTitle
            : PRODUCT_PUBLICATION_COPY.success.unpublishedTitle}
        </p>
        <p className="product-publication__banner-body">
          {outcome.kind === 'published'
            ? PRODUCT_PUBLICATION_COPY.success.publishedBody
            : PRODUCT_PUBLICATION_COPY.success.unpublishedBody}
        </p>
      </div>
    );

  if (detail.isPending) {
    return (
      <section className="product-publication">
        <p className="product-publication__status" role="status">
          {PRODUCT_PUBLICATION_COPY.screen.loading}
        </p>
      </section>
    );
  }

  if (detail.isError) {
    const notFound = isNotFound(detail.error);
    return (
      <section className="product-publication">
        <div className="product-publication__failure" role="alert">
          <p className="product-publication__failure-title">
            {notFound
              ? PRODUCT_PUBLICATION_COPY.failure.notFoundTitle
              : PRODUCT_PUBLICATION_COPY.failure.unavailableTitle}
          </p>
          <p className="product-publication__failure-body">
            {notFound
              ? PRODUCT_PUBLICATION_COPY.failure.notFoundBody
              : PRODUCT_PUBLICATION_COPY.failure.unavailableBody}
          </p>
          {notFound ? (
            <Link className="product-publication__secondary" href={ADMIN_PRODUCTS_ROUTE}>
              {PRODUCT_PUBLICATION_COPY.screen.backToList}
            </Link>
          ) : (
            <button
              type="button"
              className="product-publication__secondary"
              onClick={() => {
                void detail.refetch();
              }}
            >
              {PRODUCT_PUBLICATION_COPY.failure.retry}
            </button>
          )}
        </div>
      </section>
    );
  }

  const product = detail.data;
  const heading = (
    <header className="product-publication__header">
      <Link className="product-publication__back" href={ADMIN_PRODUCTS_ROUTE}>
        {`← ${PRODUCT_PUBLICATION_COPY.screen.backToList}`}
      </Link>
      <h1 className="product-publication__title">{product.name}</h1>
      <p className="product-publication__status-badge" data-testid="publication-status">
        <span className="product-publication__status-dot" aria-hidden="true" />
        {`${PRODUCT_PUBLICATION_COPY.screen.statusLabel}: ${productStatusLabel(
          parseProductStatus(product.status),
        )}`}
      </p>
    </header>
  );

  if (readiness.isPending) {
    return (
      <section className="product-publication">
        {heading}
        {outcomeBanner}
        <p className="product-publication__status">{PRODUCT_PUBLICATION_COPY.screen.loading}</p>
      </section>
    );
  }

  if (readiness.isError) {
    return (
      <section className="product-publication">
        {heading}
        {outcomeBanner}
        <div
          className="product-publication__banner product-publication__banner--error"
          role="alert"
        >
          <p className="product-publication__banner-title">
            {PRODUCT_PUBLICATION_COPY.failure.readinessTitle}
          </p>
          <p className="product-publication__banner-body">
            {PRODUCT_PUBLICATION_COPY.failure.readinessBody}
          </p>
          <button
            type="button"
            className="product-publication__secondary"
            onClick={() => {
              void readiness.refetch();
            }}
          >
            {PRODUCT_PUBLICATION_COPY.failure.retry}
          </button>
        </div>
        {/* The product itself loaded, so its summary is still authoritative. */}
        <div className="product-publication__columns">
          <ProductPublicationSummary product={product} />
        </div>
      </section>
    );
  }

  const snapshot = toCoherentSnapshot(product, readiness.data);

  if (snapshot === null) {
    return (
      <section className="product-publication">
        {heading}
        {outcomeBanner}
        <div
          className="product-publication__banner product-publication__banner--blocked"
          role="alert"
        >
          <p className="product-publication__banner-title">
            {PRODUCT_PUBLICATION_COPY.failure.mismatchTitle}
          </p>
          <p className="product-publication__banner-body">
            {PRODUCT_PUBLICATION_COPY.failure.mismatchBody}
          </p>
          <button
            type="button"
            className="product-publication__secondary"
            onClick={reloadBoth}
            data-testid="publication-reload"
          >
            {PRODUCT_PUBLICATION_COPY.failure.mismatchRetry}
          </button>
        </div>
        {/* No lifecycle action is offered from a mixed pair. */}
        <div className="product-publication__columns">
          <ProductPublicationSummary product={product} />
        </div>
        <Link className="product-publication__secondary" href={adminProductDetailRoute(productId)}>
          {PRODUCT_PUBLICATION_COPY.screen.backToProduct}
        </Link>
      </section>
    );
  }

  return (
    <section className="product-publication">
      {heading}
      {outcomeBanner}
      <ProductPublicationPanel
        product={product}
        snapshot={snapshot}
        onReload={reloadBoth}
        onOutcome={setOutcome}
        flagged={flagged}
        onFlagged={setFlagged}
      />
    </section>
  );
}
