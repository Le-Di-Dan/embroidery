/**
 * What a stage element is called when a person cannot see it.
 *
 * `APP3-S02` §17 asks for stable labels "when document data supports them", and
 * that qualification is the whole design here. A text element supports one — its
 * own text is the best name it could have. Nothing else does: `APP3-P01` gives
 * an image, a shape or a freehand stroke no title, no alt text and no caption,
 * so the honest label is the kind of thing it is.
 *
 * The element `id` is never a label. It is an opaque internal reference that
 * means nothing to a customer and would read as noise in a screen reader.
 */
import type { DesignElement } from '@embroidery/design-document';

import { STUDIO_STAGE_COPY } from './studio-stage-copy';

export function elementLabel(element: DesignElement): string {
  switch (element.type) {
    case 'text':
      return element.text.trim() === '' ? STUDIO_STAGE_COPY.unnamedText : element.text;
    case 'image':
      return STUDIO_STAGE_COPY.typeImage;
    case 'shape':
      return STUDIO_STAGE_COPY.typeShape;
    case 'freehand':
      return STUDIO_STAGE_COPY.typeFreehand;
    default:
      // A group paints nothing and is never on the stage, so it is never
      // labelled. The branch exists so the union stays exhaustive.
      return STUDIO_STAGE_COPY.typeShape;
  }
}
