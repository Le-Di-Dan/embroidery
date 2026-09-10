'use client';

import type { AdminProductVariantResponse, AdminVariantSkuResponse } from '@embroidery/api-client';

import { SELLABILITY_COPY } from '../model/sellability-copy';
import { orderEligibleSkuOf, variantTitle } from '../model/variant-presentation';
import { VariantSkuRow } from './variant-sku-row';

interface VariantCardProps {
  readonly variant: AdminProductVariantResponse;
  readonly basePriceAmount: string;
  readonly expanded: boolean;
  readonly disabled: boolean;
  readonly onToggleExpanded: () => void;
  readonly onEditVariant: () => void;
  readonly onToggleVariantActive: () => void;
  readonly onAddSku: () => void;
  readonly onEditSku: (sku: AdminVariantSkuResponse) => void;
  readonly onToggleSkuActive: (sku: AdminVariantSkuResponse) => void;
}

/**
 * One variant, collapsed to what matters and expandable to its SKUs
 * (`972:187`, `979:222`).
 *
 * ### What stays visible when collapsed
 *
 * The title, the active/inactive state, and the one sellability fact that
 * decides whether this variant can be bought — the code of its order-eligible
 * SKU, or a plain statement that it has none. Progressive disclosure hides
 * detail, not truth: an operator scanning a collapsed list still sees which
 * variants cannot be ordered, which is the whole reason the section exists.
 *
 * At three variants with two SKUs each, rendering every SKU form permanently
 * expanded would run past 2,400 px before the publish handoff was reached
 * (`D01` §D), so exactly one variant is expanded at a time — a decision the
 * parent owns, because "one at a time" is a fact about the list, not about a
 * card.
 *
 * ### The disclosure is programmatic
 *
 * `aria-expanded` and `aria-controls` on the toggle, with the SKU region
 * carrying the matching id. A caret that only changes shape tells a
 * screen-reader user nothing about whether the region is open.
 *
 * There is no delete action, no trash icon and no hidden delete path, at any
 * state of this card.
 */
export function VariantCard({
  variant,
  basePriceAmount,
  expanded,
  disabled,
  onToggleExpanded,
  onEditVariant,
  onToggleVariantActive,
  onAddSku,
  onEditSku,
  onToggleSkuActive,
}: VariantCardProps) {
  const copy = SELLABILITY_COPY.variant;
  const title = variantTitle(variant);
  const eligible = orderEligibleSkuOf(variant);
  const regionId = `variant-skus-${variant.variantId}`;

  return (
    <li
      className="product-sellability__variant"
      data-testid={`variant-${variant.variantId}`}
      data-active={variant.isActive ? 'true' : 'false'}
    >
      <div className="product-sellability__variant-header">
        <div className="product-sellability__variant-identity">
          <span className="product-sellability__variant-title">{title}</span>
          <span
            className={`product-sellability__badge product-sellability__badge--${
              variant.isActive ? 'active' : 'inactive'
            }`}
          >
            {variant.isActive ? copy.activeBadge : copy.inactiveBadge}
          </span>
        </div>

        {/*
          The collapsed row's sellability truth. Stated as a sentence rather
          than a colour or an icon, so it survives without either.
        */}
        <p
          className={
            eligible === null
              ? 'product-sellability__variant-summary product-sellability__variant-summary--blocked'
              : 'product-sellability__variant-summary'
          }
          data-testid={`variant-summary-${variant.variantId}`}
        >
          {eligible === null ? copy.noOrderEligibleSku : copy.orderEligibleSku(eligible.code)}
        </p>

        <div className="product-sellability__variant-actions">
          {/*
            Every control names its variant in its accessible name. The visible
            labels stay as the design draws them — short, and read in the
            context of the card they sit on — but an operator using a screen
            reader hears a flat list of buttons, and `Sửa` said three times in
            one card names nothing.
          */}
          <button
            type="button"
            className="product-sellability__action"
            aria-expanded={expanded}
            aria-controls={regionId}
            aria-label={expanded ? copy.collapseLabel(title) : copy.expandLabel(title)}
            data-testid={`variant-disclosure-${variant.variantId}`}
            onClick={onToggleExpanded}
          >
            {expanded ? copy.collapse : copy.expand}
            <span className="product-sellability__variant-sku-count">
              {copy.skuCount(variant.skus.length)}
            </span>
          </button>
          <button
            type="button"
            className="product-sellability__action"
            disabled={disabled}
            aria-label={copy.editLabel(title)}
            data-testid={`variant-edit-${variant.variantId}`}
            onClick={onEditVariant}
          >
            {copy.edit}
          </button>
          <button
            type="button"
            className="product-sellability__action"
            disabled={disabled}
            aria-label={
              variant.isActive ? copy.deactivateLabel(title) : copy.reactivateLabel(title)
            }
            data-testid={`variant-toggle-${variant.variantId}`}
            onClick={onToggleVariantActive}
          >
            {variant.isActive ? copy.deactivate : copy.reactivate}
          </button>
        </div>
      </div>

      <div className="product-sellability__variant-skus" id={regionId} hidden={!expanded}>
        <h4 className="product-sellability__skus-heading">{copy.skusHeading}</h4>
        {variant.skus.length === 0 ? (
          <p className="product-sellability__empty-note">{copy.noSkus}</p>
        ) : (
          <ul className="product-sellability__sku-list">
            {variant.skus.map((sku) => (
              <VariantSkuRow
                key={sku.skuId}
                sku={sku}
                basePriceAmount={basePriceAmount}
                disabled={disabled}
                onEdit={() => onEditSku(sku)}
                onToggleActive={() => onToggleSkuActive(sku)}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          className="product-sellability__secondary"
          disabled={disabled}
          aria-label={copy.addSkuLabel(title)}
          data-testid={`variant-add-sku-${variant.variantId}`}
          onClick={onAddSku}
        >
          {copy.addSku}
        </button>
      </div>
    </li>
  );
}
