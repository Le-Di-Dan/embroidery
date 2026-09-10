'use client';

import Link from 'next/link';

import type { AdminVariantSkuResponse } from '@embroidery/api-client';

import { adminSkuStockRoute } from '../../sku-stock';
import { SELLABILITY_COPY } from '../model/sellability-copy';
import { formatDong, resolveSkuPrice } from '../model/sku-effective-price';

interface VariantSkuRowProps {
  readonly sku: AdminVariantSkuResponse;
  readonly basePriceAmount: string;
  readonly disabled: boolean;
  readonly onEdit: () => void;
  readonly onToggleActive: () => void;
}

/**
 * One SKU, with its effective price and its stock handoff (`976:187`, §14).
 *
 * ### The price is resolved on the row
 *
 * The operator must be able to read what a SKU sells for without opening a
 * dialog, and the two sources are different sentences rather than one field
 * that is sometimes filled: `Dùng giá sản phẩm: …` or `Giá riêng cho SKU: …`.
 * An override of `"0"` says so as an override and is marked unusable — it is
 * never quietly redrawn as inheritance, which would show the operator a price
 * they did not choose.
 *
 * ### The stock handoff, and why it needs nothing but the SKU id
 *
 * `Quản lý tồn kho` is a link to `/kho/skus/{skuId}` through the canonical
 * route helper on the inventory feature's own boundary — there is no second
 * stock route, no inline quantity, no low-stock-threshold field and no stock
 * read on this screen. That is what makes it work for a SKU created seconds
 * ago: `APP8-B01` creates the stock anchor lazily on the first read, so a SKU
 * with no movements and no orders opens and reports zero rather than 404ing.
 *
 * This link closes `FU-APP12-N02-STOCK-REACHABILITY`, the circularity `G01`
 * found: the stock screen was previously reachable only from an order row, for
 * a product that could not be ordered.
 *
 * ### State is never colour alone
 *
 * The active/inactive badge is a word, `data-active` carries the same fact for
 * tests, and an unusable price is stated in prose beside the amount.
 *
 * There is no delete control. Deactivation is how a SKU stops selling, and an
 * inactive SKU stays here as history.
 */
export function VariantSkuRow({
  sku,
  basePriceAmount,
  disabled,
  onEdit,
  onToggleActive,
}: VariantSkuRowProps) {
  const copy = SELLABILITY_COPY.sku;
  const price = resolveSkuPrice(sku, basePriceAmount);
  const priceLabel =
    price.source === 'override'
      ? copy.overridePrice(formatDong(price.amount))
      : copy.inheritedPrice(formatDong(price.amount));

  return (
    <li
      className="product-sellability__sku"
      data-testid={`sku-${sku.skuId}`}
      data-active={sku.isActive ? 'true' : 'false'}
    >
      <div className="product-sellability__sku-identity">
        <span className="product-sellability__sku-code">{sku.code}</span>
        <span
          className={`product-sellability__badge product-sellability__badge--${
            sku.isActive ? 'active' : 'inactive'
          }`}
        >
          {sku.isActive ? copy.activeBadge : copy.inactiveBadge}
        </span>
      </div>

      <p className="product-sellability__sku-price">
        {priceLabel}
        {price.resolvable ? null : (
          <span className="product-sellability__sku-price-warning">{copy.unresolvablePrice}</span>
        )}
      </p>

      <div className="product-sellability__sku-actions">
        {/*
          Every control names its SKU in its accessible name. An expanded
          variant card carries one `Sửa` of its own and one per SKU beneath it —
          distinguishable by position on screen and, without this, identical in
          the accessibility tree.
        */}
        <button
          type="button"
          className="product-sellability__action"
          disabled={disabled}
          aria-label={copy.editLabel(sku.code)}
          data-testid={`sku-edit-${sku.skuId}`}
          onClick={onEdit}
        >
          {copy.edit}
        </button>
        <button
          type="button"
          className="product-sellability__action"
          disabled={disabled}
          aria-label={
            sku.isActive ? copy.deactivateLabel(sku.code) : copy.reactivateLabel(sku.code)
          }
          data-testid={`sku-toggle-${sku.skuId}`}
          onClick={onToggleActive}
        >
          {sku.isActive ? copy.deactivate : copy.reactivate}
        </button>
        <Link
          className="product-sellability__stock-link"
          href={adminSkuStockRoute(sku.skuId)}
          aria-label={copy.manageStockLabel(sku.code)}
          data-testid={`sku-stock-${sku.skuId}`}
        >
          {copy.manageStock}
        </Link>
      </div>
    </li>
  );
}
