'use client';

/**
 * The catalog branch of step 1 (`650:3`, `650:187`).
 *
 * Its whole job is to keep five outcomes apart, because `APP5-S01` §17 says they
 * must not collapse into one error:
 *
 * | outcome | what it means | what it is **not** |
 * |---|---|---|
 * | `LOADING` | the list is on its way | — |
 * | `READY` | choose one variant | — |
 * | `EMPTY` | published product, nothing selectable | not a 404, not an expiry |
 * | `PRODUCT_UNAVAILABLE` | not publicly available | never says draft or archived |
 * | `FAILED` | the read failed | not a statement about the product |
 *
 * and, orthogonally, a stale Design Session — which is a fact about `APP3`, not
 * about the catalog, and is the only case that draws `650:187`.
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import type { CatalogVariants } from '../hooks/use-catalog-variants';
import { VariantSelector } from './variant-selector';

export interface CatalogSubjectSectionProps {
  readonly variants: CatalogVariants;
  /** The Studio handed over no usable Design Session (`650:187`). */
  readonly sessionUnusable: boolean;
  readonly selectedVariantId: string | undefined;
  readonly variantWithdrawn: boolean;
  readonly showValidation: boolean;
  readonly onSelect: (productVariantId: string) => void;
}

export function CatalogSubjectSection({
  variants,
  sessionUnusable,
  selectedVariantId,
  variantWithdrawn,
  showValidation,
  onSelect,
}: CatalogSubjectSectionProps) {
  return (
    <section className="custom-request__section" aria-label={CUSTOM_REQUEST_COPY.catalog.heading}>
      <h2 className="custom-request__section-heading">{CUSTOM_REQUEST_COPY.catalog.heading}</h2>
      <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.catalog.contextNote}</p>

      {sessionUnusable ? renderSessionExpired() : renderVariants()}
    </section>
  );

  /**
   * `650:187`. Reached only from an `APP3` fact — never from an empty variant
   * list, which §17.A and §3.4 both single out as a different state.
   */
  function renderSessionExpired() {
    return (
      <div className="custom-request__notice custom-request__notice--blocking" role="status">
        <p className="custom-request__error">{CUSTOM_REQUEST_COPY.catalog.sessionExpired}</p>
        <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.catalog.sessionExpiredHint}</p>
      </div>
    );
  }

  function renderVariants() {
    switch (variants.status) {
      case 'LOADING':
        return (
          <p className="custom-request__hint" role="status">
            {CUSTOM_REQUEST_COPY.catalog.variantLoading}
          </p>
        );

      case 'EMPTY':
        // Truthful and specific: the product exists, it simply cannot form a
        // request right now. No auto-switch to the other branch (§3.4).
        return (
          <div className="custom-request__notice custom-request__notice--blocking" role="status">
            <p className="custom-request__error">{CUSTOM_REQUEST_COPY.catalog.variantEmpty}</p>
            <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.catalog.variantEmptyHint}</p>
          </div>
        );

      case 'PRODUCT_UNAVAILABLE':
        // Says only that it is unavailable. Draft, archived and uncategorised
        // answer identically at the API and must read identically here.
        return (
          <div className="custom-request__notice custom-request__notice--blocking" role="status">
            <p className="custom-request__error">
              {CUSTOM_REQUEST_COPY.catalog.productUnavailable}
            </p>
            <p className="custom-request__hint">
              {CUSTOM_REQUEST_COPY.catalog.productUnavailableHint}
            </p>
          </div>
        );

      case 'FAILED':
        return (
          <div className="custom-request__notice" role="alert">
            <p className="custom-request__error">{CUSTOM_REQUEST_COPY.catalog.loadFailed}</p>
            <button type="button" className="custom-request__button" onClick={variants.refetch}>
              {CUSTOM_REQUEST_COPY.catalog.retry}
            </button>
          </div>
        );

      default:
        return (
          <VariantSelector
            variants={variants.variants}
            selectedVariantId={selectedVariantId}
            withdrawn={variantWithdrawn}
            invalid={showValidation && selectedVariantId === undefined}
            onSelect={onSelect}
          />
        );
    }
  }
}
