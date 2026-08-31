'use client';

import { useState } from 'react';

import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import { useLinkedProductQuery } from '../hooks/use-gallery-linked-product';
import { GalleryProductPickerDialog } from './gallery-product-picker-dialog';

interface GalleryLinkedProductFieldProps {
  /** The pending value: the id the next save would persist, or `''` for none. */
  readonly productId: string;
  readonly disabled: boolean;
  readonly onChange: (productId: string) => void;
}

/**
 * The optional linked product (`868:909`).
 *
 * ## The label is a name, never an identifier
 *
 * A linked product is shown by the name the catalog publishes for it, resolved
 * with one read for the one product on this screen. If that read fails, the
 * field says a product is linked and that its name could not be loaded — it
 * does **not** fall back to printing the UUID. An internal identifier shown to
 * an operator is not information, and it is not a safer answer than admitting
 * what is unknown.
 *
 * The id is still present in the DOM as the picker's comparison value; it is
 * never the field's visible copy.
 *
 * ## Clearing is a real, expressible action
 *
 * "Bỏ liên kết" sets the pending value to none, which the authoring diff turns
 * into an explicit clear on the next save. That is a different request from
 * leaving the field alone, and the two must not be confused: an omitted field
 * keeps whatever is stored.
 *
 * Nothing here saves. The field reports its pending value upward, and the
 * authoring form's explicit save is what persists it.
 */
export function GalleryLinkedProductField({
  productId,
  disabled,
  onChange,
}: GalleryLinkedProductFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const linked = productId !== '';
  const query = useLinkedProductQuery(linked ? productId : undefined);
  const copy = GALLERY_EDITOR_COPY.linkedProduct;

  const label = !linked
    ? copy.none
    : query.isPending
      ? copy.resolving
      : (query.data?.name ?? copy.unresolved);

  return (
    <section
      className="gallery-editor__panel gallery-linked-product"
      aria-labelledby="gallery-linked-product-title"
    >
      <h2 className="gallery-editor__panel-title" id="gallery-linked-product-title">
        {copy.groupTitle}
      </h2>
      <p className="gallery-editor__panel-help">{copy.help}</p>

      <p className="gallery-linked-product__value" data-testid="gallery-linked-product-value">
        {label}
      </p>

      <div className="gallery-linked-product__actions">
        <button
          type="button"
          className="gallery-editor__secondary"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          data-testid="gallery-linked-product-choose"
        >
          {linked ? copy.change : copy.choose}
        </button>
        {linked ? (
          <button
            type="button"
            className="gallery-editor__secondary"
            onClick={() => onChange('')}
            disabled={disabled}
            data-testid="gallery-linked-product-clear"
          >
            {copy.clear}
          </button>
        ) : null}
      </div>

      {pickerOpen ? (
        <GalleryProductPickerDialog
          selectedProductId={productId}
          onClose={() => setPickerOpen(false)}
          onSelect={(next) => {
            setPickerOpen(false);
            onChange(next);
          }}
        />
      ) : null}
    </section>
  );
}
