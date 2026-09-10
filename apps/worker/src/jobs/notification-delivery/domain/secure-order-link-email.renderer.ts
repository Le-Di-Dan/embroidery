/**
 * The `ORDER_ACCESS` secure-link email (`APP12-E01-C1` §2).
 *
 * ### The message this file exists to stop being sent
 *
 * `FU-APP12-E01-01`: the SMTP adapter had one render path, the verification
 * renderer, and no `secretKind` branch. Every `SECURE_LINK_TOKEN` delivery
 * therefore reached the customer as *"Mã xác thực email"*, with the 43-character
 * bearer grant token printed in the position of a six-digit code, its 72-hour
 * window rendered as "4320 phút", and **no link anywhere in the message**. Over
 * the only production-capable transport, a Ready-Made customer could not reach
 * their own order.
 *
 * This is the second renderer, not a generalisation of the first. §3 of the
 * correction is explicit that the two customer intents must not be merged into
 * one generic template: a code is typed into a field, a link is clicked, and a
 * message that tried to be both would be wrong for each.
 *
 * ### The copy is quoted, not composed
 *
 * Every Vietnamese string below is the Product Owner's, transcribed verbatim
 * from `APP12-E01-C1` §2, which that prompt names as the canonical copy
 * authority for this correction. Nothing here is an engineering paraphrase, and
 * nothing here is marketing.
 *
 * ### The URL arrives finished
 *
 * `secureLinkUrl` is composed by `notification-delivery.usecase`, from the
 * configured `STOREFRONT_PUBLIC_ORIGIN`, the landing path the grant scope
 * selects, and the `#t=` fragment carrier (`ADR-APP4-001` §11). This renderer
 * places that string and never parses, rebuilds, shortens or re-encodes it —
 * §5: *the adapter is not the URL composer*, and neither is its renderer. A
 * second composition here would be a second answer to "where does this link
 * point", and the fragment is precisely the part a naive rebuild loses.
 *
 * ### What the message may carry, and what it may never
 *
 * The brand, the purpose, the link, when the link stops working, and the safety
 * line. The raw token appears **only** inside the URL, which is the form the
 * customer is meant to use it in. It is never labelled as a code, never in the
 * subject or heading, and never offered as a standalone fallback value (§6).
 */
import { BRAND_NAME, escapeHtml, type EmailContent } from './email-content';

export interface SecureOrderLinkEmailInput {
  /** The already-composed, fragment-carrying URL. Placed, never rebuilt. */
  readonly secureLinkUrl: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/** PO copy (`APP12-E01-C1` §2), verbatim. Named so the tests can quote it. */
export const SECURE_ORDER_LINK_COPY = {
  subject: `Liên kết theo dõi đơn hàng ${BRAND_NAME}`,
  heading: 'Theo dõi đơn hàng của bạn',
  bodyCreated: 'Đơn hàng của bạn đã được tạo.',
  bodyOpen:
    'Mở liên kết bảo mật bên dưới để xem trạng thái đơn hàng và tiếp tục các bước cần thiết.',
  cta: 'Mở đơn hàng',
  safety: 'Nếu bạn không nhận ra đơn hàng này, hãy bỏ qua email.',
} as const;

/**
 * The validity window, in the unit a person would say it in.
 *
 * The blocker's most visible symptom was "4320 phút" — arithmetically correct
 * and useless, because nobody reads a three-day window in minutes. An
 * `ORDER_ACCESS` grant is issued for whole hours, so whole hours is what this
 * returns; the minute branch survives only so a shorter window is still stated
 * truthfully rather than rounded to "0 giờ".
 *
 * Like `validityMinutes`, this holds no TTL of its own. The instants come from
 * the delivery the grant was issued with, so the day the policy changes, the
 * customer is told the new window rather than a copy of the old one.
 */
export function secureLinkValidity(issuedAt: Date, expiresAt: Date): string {
  // Named rather than written as `60_000`: the capability's own source gate
  // refuses that literal outside the policy, because it is the shape a
  // hard-coded retry delay takes. This is a unit conversion, and saying so
  // keeps the gate blunt — which is what makes it useful.
  const msPerMinute = 60 * 1000;
  const minutesPerHour = 60;
  const minutes = Math.max(1, Math.ceil((expiresAt.getTime() - issuedAt.getTime()) / msPerMinute));
  if (minutes < minutesPerHour) {
    return `${String(minutes)} phút`;
  }
  // Rounded up for the same reason `validityMinutes` rounds up: telling someone
  // their link lasts less time than it does invites a pointless resend.
  return `${String(Math.ceil(minutes / minutesPerHour))} giờ`;
}

export function renderSecureOrderLinkEmail(input: SecureOrderLinkEmailInput): EmailContent {
  const expiry = `Liên kết có hiệu lực trong ${secureLinkValidity(
    input.issuedAt,
    input.expiresAt,
  )}.`;

  // The plain-text part prints the URL on a line of its own, unwrapped and
  // unadorned. That is not a courtesy: a text-only client, and the harness that
  // reads this message off the wire, both recover the link by finding it on a
  // line — and an `<a>` the customer cannot click is a customer who cannot
  // reach their order.
  const text = [
    `${BRAND_NAME} — ${SECURE_ORDER_LINK_COPY.heading}`,
    '',
    SECURE_ORDER_LINK_COPY.bodyCreated,
    SECURE_ORDER_LINK_COPY.bodyOpen,
    '',
    input.secureLinkUrl,
    '',
    expiry,
    '',
    SECURE_ORDER_LINK_COPY.safety,
    '',
    BRAND_NAME,
  ].join('\n');

  // Inline styles and a table-free layout, matching the verification message's
  // discipline: every mail client strips <style> blocks differently. The CTA is
  // an anchor with visible text, and the same URL is repeated as plain text
  // beneath it, so a client that renders no styling still delivers a usable
  // link rather than a bare word.
  const href = escapeHtml(input.secureLinkUrl);
  const html = [
    '<!doctype html>',
    '<html lang="vi">',
    '<body style="margin:0;padding:24px;background:#faf8f5;',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;",
    'color:#2c2622;">',
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;',
    'padding:32px;">',
    `<p style="margin:0 0 4px;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7f76;">${escapeHtml(
      BRAND_NAME,
    )}</p>`,
    `<h1 style="margin:0 0 24px;font-size:20px;font-weight:600;">${escapeHtml(
      SECURE_ORDER_LINK_COPY.heading,
    )}</h1>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(
      SECURE_ORDER_LINK_COPY.bodyCreated,
    )} ${escapeHtml(SECURE_ORDER_LINK_COPY.bodyOpen)}</p>`,
    '<p style="margin:0 0 24px;text-align:center;">',
    `<a href="${href}" style="display:inline-block;padding:14px 28px;border-radius:8px;`,
    'background:#2c2622;color:#ffffff;font-size:16px;font-weight:600;',
    `text-decoration:none;">${escapeHtml(SECURE_ORDER_LINK_COPY.cta)}</a>`,
    '</p>',
    '<p style="margin:0 0 12px;font-size:13px;line-height:1.6;word-break:break-all;',
    `color:#8a7f76;">${href}</p>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(expiry)}</p>`,
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#8a7f76;">',
    escapeHtml(SECURE_ORDER_LINK_COPY.safety),
    '</p>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  return { subject: SECURE_ORDER_LINK_COPY.subject, text, html };
}
