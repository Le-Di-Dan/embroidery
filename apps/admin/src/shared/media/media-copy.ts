/**
 * Captions for an image tile, shared by every Admin surface that shows one.
 *
 * Lives at app-shared scope rather than in a feature because the asset library,
 * the product list and the publication summary all draw the same tile and must
 * describe the same states in the same words. A caption owned by one of them
 * and imported by the others would make that feature the authority on the other
 * two.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

const mediaMessage = messageView(VI_MESSAGES.admin, 'media');

export const MEDIA_COPY = {
  /** The alt text of a tile that is showing an image. */
  thumbnailAlt: mediaMessage.text('thumbnailAlt'),
  /** No image is associated. A deliberate absence, not a failure. */
  absent: mediaMessage.text('absent'),
  /** Uploaded, not yet encoded. Temporary, and says so. */
  processing: mediaMessage.text('processing'),
  /** Inspection refused the file. There will never be a preview. */
  rejected: mediaMessage.text('rejected'),
  /** The request was expected to succeed and did not. */
  unavailable: mediaMessage.text('unavailable'),
} as const;
