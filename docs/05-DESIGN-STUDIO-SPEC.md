# 05 — Design Studio Specification

**Status:** Approved product baseline  
**Version:** 0.1.0

## 1. Product intent

Design Studio is an advanced product customizer for embroidery ordering.

It is not:

- A general-purpose design suite.
- A Canva clone.
- An Illustrator replacement.
- An embroidery digitizing application.

## 2. Supported document types

A design document may contain:

- Text element.
- Raster image element.
- SVG element.
- Basic shape element.
- Freehand drawing element.
- Group element.

## 3. Core element properties

Each element should conceptually support:

- Stable identifier.
- Type.
- Position.
- Width and height.
- Rotation.
- Scale.
- Opacity.
- Visibility.
- Lock state.
- Z-order.
- Group parent.
- Product side.
- Embroidery area association.
- User-facing metadata.
- Creation/update metadata.

Exact technical schema is deferred.

## 4. Required tools

### 4.1. Text

- Add/edit text.
- Font whitelist.
- Font size.
- Alignment.
- Letter spacing where supported.
- Line height where supported.
- Curved text.
- Thread color selection.

### 4.2. Image

- Upload JPG/PNG.
- Crop.
- Resize.
- Rotate.
- Flip.
- Opacity.
- Background removal workflow.
- Quality validation.
- Resolution warning.

### 4.3. SVG

- Upload validated SVG.
- Resize.
- Rotate.
- Flip.
- Color control where safely supported.
- Sanitization is mandatory.

### 4.4. Shapes and drawing

- Basic geometric shapes.
- Freehand drawing.
- Limited style controls.
- No professional vector node editing.

### 4.5. Layer operations

- Select.
- Multi-select.
- Reorder.
- Duplicate.
- Delete.
- Lock.
- Hide.
- Group.
- Ungroup.
- Align.
- Distribute.

### 4.6. Canvas interaction

- Zoom.
- Pan.
- Snap.
- Guides.
- Safe area.
- Undo.
- Redo.
- Desktop pointer support.
- Touch support.
- Keyboard support where appropriate.

## 5. Product preview

Preview uses 2D product images.

Each configurable product side should define:

- Background product image.
- Visible side name.
- Embroidery safe area.
- Physical dimensions.
- Coordinate mapping.
- Optional clipping/mask region.
- Preview-specific configuration.

The design must be composited on the selected product image.

## 6. Physical measurement

The editor must distinguish:

- Canvas pixel coordinates.
- Product image coordinates.
- Physical embroidery dimensions.

Users should see understandable measurement units such as millimeters or centimeters.

The system must warn when:

- Design exceeds allowed area.
- Text is too small for practical embroidery.
- Raster asset resolution is too low.
- Color count exceeds configured guidance.
- Details are too thin according to configurable rules.

These warnings are advisory unless explicitly configured as blocking.

## 7. Mobile behavior

Mobile supports core tasks:

- Select product.
- Add text.
- Upload image.
- Move.
- Resize.
- Rotate.
- Manage basic layers.
- Preview.
- Submit.

Precision-heavy operations may use specialized mobile UI rather than replicating desktop controls exactly.

## 8. Autosave

Autosave must:

- Be transparent.
- Avoid blocking editing.
- Survive refresh where possible.
- Handle concurrent or stale updates safely.
- Indicate save state.
- Avoid creating unlimited redundant versions.

Temporary save is not customer-visible as a design library.

## 9. Versioning

Versioning begins when a design is submitted or when Admin creates a formal revision.

A version must conceptually capture:

- Design document snapshot.
- Product.
- Variant.
- Product side.
- Embroidery area.
- Physical dimensions.
- Preview image.
- Watermark state.
- Author.
- Timestamp.
- Parent version.
- Revision note.
- Integrity hash.

Approved versions are immutable.

## 10. Watermark

Watermark should:

- Repeat across preview.
- Be difficult to crop out.
- Remain readable on light and dark backgrounds.
- Include session or request identifier.
- Optionally include masked customer identifier.
- Avoid making approval impossible.
- Be rendered as part of customer-facing preview.

Watermark alone is not considered complete protection.

## 11. Export policy

Customer-facing UI must not expose:

- Download button.
- Copy original asset endpoint.
- High-resolution preview URL.
- Scene JSON.
- SVG export.
- PDF export.

Internal Admin tools may generate approved and production artifacts according to authorization rules.

## 12. Future readiness

The document model should not prevent future support for:

- Stitch simulation.
- Embroidery-specific material preview.
- Advanced manufacturability analysis.
- Additional product surfaces.

Future readiness does not justify implementing these features now.
