/**
 * Every customer-visible string of the image capability (`APP3-S06`).
 *
 * The Studio copy rule holds: a label is a promise, so nothing here names a
 * capability this checkpoint does not have. There is no "cắt ảnh", no "xoá nền",
 * no "bộ lọc", no "độ mờ", no "hoàn tác" and no "đã lưu" — cropping, background
 * removal, filters and opacity are not delivered at all, history is `APP3-S08`'s
 * and saving is `APP3-S10`'s.
 *
 * The refusal rule holds too. The server answers a bounded state and never a
 * reason, and `APP3-P01`/`APP3-P02` answer with typed findings carrying JSON
 * paths and English developer messages. None of that is customer copy: each
 * sentence below states the fact and stops, and none of them names the asset, the
 * derivative, the session, a storage address or anything about how processing is
 * implemented.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { MAX_IMAGE_BYTES, UPLOADABLE_IMAGE_LABELS } from './studio-image-file';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `image`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const imageMessage = messageView(VI_MESSAGES.studio, 'image');

export const STUDIO_IMAGE_COPY = {
  panelLabel: imageMessage.text('panelLabel'),

  // The 1024 drawer, named exactly as the text drawer is: the trigger names the
  // panel it opens, and the panel carries the same name, so the two are one
  // thing to a screen reader.
  drawerOpen: imageMessage.text('drawerOpen'),
  drawerClose: imageMessage.text('drawerClose'),

  /*
   * There is no "this screen is too small" sentence any more.
   *
   * One stood here until `APP3-S11` shipped the approved mobile surface for this
   * capability. Keeping it would leave a false statement in the product for the
   * first person who renders it by mistake, so it was removed rather than left
   * unreferenced.
   */

  chooseLabel: imageMessage.text('chooseLabel'),
  replaceLabel: imageMessage.text('replaceLabel'),
  chooseHint: imageMessage.text('chooseHint', {
    formats: UPLOADABLE_IMAGE_LABELS.join(', '),
    maxMegabytes: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)),
  }),

  /**
   * Uploading, without a number.
   *
   * The transport reports upload progress only when the browser gives a real
   * `progress` event with a total; when it does not, this is what is shown. A
   * fabricated percentage is a claim about how far the file has got, and an
   * invented one is wrong in exactly the moments a customer is watching it.
   */
  uploading: imageMessage.text('uploading'),
  uploadingPercent: (percent: number) => imageMessage.text('uploadingPercent', { percent }),

  /**
   * Server-side processing. One sentence for inspection and normalization alike,
   * because the server reports one state for both and inventing a distinction in
   * the UI would be describing a pipeline the customer cannot act on.
   */
  processing: imageMessage.text('processing'),
  processingHint: imageMessage.text('processingHint'),

  placed: imageMessage.text('placed'),

  // Refusals. Each is a different fact, so each is a different sentence.
  rejectedType: imageMessage.text('rejectedType', { formats: UPLOADABLE_IMAGE_LABELS.join(', ') }),
  rejectedSize: imageMessage.text('rejectedSize', {
    maxMegabytes: Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)),
  }),
  /**
   * Inspection refused the file. Deliberately generic: the server publishes no
   * safe reason code for a Session upload, so naming one would be inventing it.
   */
  rejectedInspection: imageMessage.text('rejectedInspection'),
  uploadFailed: imageMessage.text('uploadFailed'),
  statusFailed: imageMessage.text('statusFailed'),
  previewFailed: imageMessage.text('previewFailed'),
  sessionUnavailable: imageMessage.text('sessionUnavailable'),

  /** `APP3-P02` refused the placement. The design is left exactly as it was. */
  placementRefused: imageMessage.text('placementRefused'),
  replacementRefused: imageMessage.text('replacementRefused'),

  retry: imageMessage.text('retry'),
} as const;
