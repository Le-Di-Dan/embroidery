/**
 * Every string the runtime watermark shows (`APP3-S09`).
 *
 * Two rules, and the second is the whole reason this file is reviewed.
 *
 * **The mark names nothing.** It is the storefront's own wordmark, the word
 * "preview", and an opaque runtime token. No customer name, no email, no phone,
 * no Session id, no asset id — `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6
 * allows an "optional masked customer identifier" and this checkpoint takes the
 * option of not having one, because the Studio is anonymous and there is no
 * identity to mask.
 *
 * **The policy note says only what is true.** `APP3-D01` §I.4 records that the
 * approved policy frame "explicitly does *not* claim screenshots can be
 * prevented", and `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 ends with "do
 * not claim absolute screenshot prevention". So the sentence below says the
 * preview is watermarked and that there is no download — both of which are
 * facts about this build — and says nothing about screenshots, recording or
 * copying, because none of those can be prevented and a claim that they are
 * would be a lie told to a customer.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/studio.json`, under `watermark`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const watermarkMessage = messageView(VI_MESSAGES.studio, 'watermark');

export const STUDIO_WATERMARK_COPY = {
  /**
   * The wordmark, imported from the one brand authority rather than written as a
   * second brand string. It read `Xưởng Thêu` — the placeholder `BRD0-F02`
   * locked `Nét Thêu` to replace — so the watermark was stamping a stale brand
   * onto every preview.
   */
  wordmark: BRAND_NAME,
  /** What the marked surface is. */
  preview: watermarkMessage.text('preview'),

  /**
   * The policy note.
   *
   * Two facts and no promise: the preview carries a watermark, and the
   * watermark is not part of what gets stitched. Deliberately absent: any
   * sentence about screenshots, screen recording, copying or printing.
   */
  policy: watermarkMessage.text('policy'),
  policyNoDownload: watermarkMessage.text('policyNoDownload'),
} as const;
