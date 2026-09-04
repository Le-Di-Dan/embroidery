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
import { BRAND_NAME } from '@embroidery/ui';

export const STUDIO_WATERMARK_COPY = {
  /**
   * The wordmark, imported from the one brand authority rather than written as a
   * second brand string. It read `Xưởng Thêu` — the placeholder `BRD0-F02`
   * locked `Nét Thêu` to replace — so the watermark was stamping a stale brand
   * onto every preview.
   */
  wordmark: BRAND_NAME,
  /** What the marked surface is. */
  preview: 'BẢN XEM TRƯỚC',

  /**
   * The policy note.
   *
   * Two facts and no promise: the preview carries a watermark, and the
   * watermark is not part of what gets stitched. Deliberately absent: any
   * sentence about screenshots, screen recording, copying or printing.
   */
  policy: 'Bản xem trước có đóng dấu. Dấu này không nằm trong mẫu thêu của bạn.',
  policyNoDownload: 'Studio không cung cấp tải xuống bản thiết kế.',
} as const;
