'use client';

import { PRODUCT_MEDIA_COPY } from '../model/product-media-copy';
import { canMoveEarlier, canMoveLater, canRemoveAt } from '../model/product-media-selection';
import { ProductMediaGridTile } from './product-media-grid-tile';

export interface ProductMediaGridProps {
  readonly selection: readonly string[];
  readonly selectedIndex: number | null;
  readonly disabled: boolean;
  /** True on a PUBLISHED product: the last image may not be removed. */
  readonly requiresAtLeastOne: boolean;
  readonly onSelect: (index: number) => void;
  readonly onSetPrimary: (index: number) => void;
  readonly onMoveEarlier: (index: number) => void;
  readonly onMoveLater: (index: number) => void;
  readonly onRemove: (index: number) => void;
}

/**
 * The ordered media grid (`935:255`, `935:398`, `941:187`, `948:311`).
 *
 * It replaces the one-row-per-image list `APP2-A03` shipped, which stacked
 * ≈ 3 120 px of cards at 1440 for twenty images and ≈ 3 748 px at 390, where
 * each row's three text buttons wrapped onto a second line. The grid is four
 * columns at 1440, five at 1024 and two at 390 — the geometry is the
 * stylesheet's, not this component's, so one DOM order serves every viewport.
 *
 * Order on screen **is** order sent: position drives role exactly as the server
 * derives it, so the first tile is the primary and the rest are gallery. Nothing
 * here issues a request — every action reports a new array upward and the save
 * path decides what to do with it.
 *
 * Which controls are allowed is asked of the selection model rather than
 * decided here, so the anchor rule (`APP12-M01.D1` §H.1 — Option B) and the
 * published minimum have exactly one definition.
 */
export function ProductMediaGrid({
  selection,
  selectedIndex,
  disabled,
  requiresAtLeastOne,
  onSelect,
  onSetPrimary,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: ProductMediaGridProps) {
  return (
    <ul className="product-media-grid" aria-label={PRODUCT_MEDIA_COPY.header.gridLabel}>
      {selection.map((assetId, index) => (
        <ProductMediaGridTile
          key={assetId}
          assetId={assetId}
          position={index + 1}
          total={selection.length}
          selected={selectedIndex === index}
          disabled={disabled}
          canMoveEarlier={canMoveEarlier(selection, index)}
          canMoveLater={canMoveLater(selection, index)}
          canRemove={canRemoveAt(selection, index, { requiresAtLeastOne })}
          onSelect={() => onSelect(index)}
          onSetPrimary={() => onSetPrimary(index)}
          onMoveEarlier={() => onMoveEarlier(index)}
          onMoveLater={() => onMoveLater(index)}
          onRemove={() => onRemove(index)}
        />
      ))}
    </ul>
  );
}
