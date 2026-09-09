/**
 * The verification-code email, as text (`APP12-N01.B01` §8).
 *
 * A renderer, not a template system: it takes the delivery the port already
 * describes and returns a subject, a plain-text body and an HTML body. It has no
 * provider type, no transport, no locale negotiation and no I/O — the same
 * discipline `secure-link.renderer.ts` keeps, for the same reason. `ADR-DB2-003`
 * places a shared template layer outside this phase, and this file must not
 * become one.
 *
 * ### What the message may contain, and what it may never
 *
 * It carries the brand, the purpose, the code and when the code stops working.
 * It carries nothing else: no password, no session token, no `ORDER_ACCESS`
 * token, no merchant detail, no customer id, no challenge id, no request id and
 * no debug context. The code is the one secret in the message and it is there
 * because the message exists to deliver it.
 *
 * ### Expiry is stated, never recomputed
 *
 * The minutes come from the delivery's own `issuedAt`/`expiresAt`, which are the
 * authoritative instants the challenge was opened with. This renderer holds no
 * TTL of its own — a second copy of the policy would be a second answer to "when
 * does this stop working", and the customer would be told the wrong one the day
 * the policy changed.
 *
 * ### Plain text is not a fallback
 *
 * Both parts are always produced. A mail client that renders text-only, a screen
 * reader, and a spam filter that scores HTML-only mail harshly all read the text
 * part; sending HTML alone is how a transactional message lands in a junk
 * folder.
 */

/** The brand every customer-facing message signs with. */
export const BRAND_NAME = 'Nét Thêu';

export interface VerificationEmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface VerificationEmailInput {
  readonly code: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/**
 * Whole minutes of validity, rounded up, floored at one.
 *
 * Rounding up rather than truncating: a 599-second window is "10 phút" to a
 * customer and "9" only to a computer, and telling someone their code lasts less
 * time than it does invites an unnecessary resend. Floored at one so a delivery
 * that took most of the window still reads as a duration rather than "0 phút".
 */
export function validityMinutes(issuedAt: Date, expiresAt: Date): number {
  // Named rather than written as `60_000`: the capability's own source gate
  // refuses that literal anywhere outside the policy, because it is the shape a
  // hard-coded retry delay takes. This is a unit conversion, and saying so keeps
  // the gate blunt — which is what makes it useful.
  const msPerMinute = 60 * 1000;
  const ms = expiresAt.getTime() - issuedAt.getTime();
  return Math.max(1, Math.ceil(ms / msPerMinute));
}

/** Escapes the five characters that change meaning inside HTML text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderVerificationEmail(input: VerificationEmailInput): VerificationEmailContent {
  const minutes = validityMinutes(input.issuedAt, input.expiresAt);
  const subject = `Mã xác thực ${BRAND_NAME}`;

  const text = [
    `${BRAND_NAME} — mã xác thực email`,
    '',
    'Mã xác thực của bạn là:',
    '',
    input.code,
    '',
    `Mã này dùng để xác nhận địa chỉ email của bạn và sẽ hết hạn sau ${String(minutes)} phút.`,
    'Vui lòng không chia sẻ mã với bất kỳ ai.',
    '',
    'Nếu bạn không yêu cầu mã này, bạn có thể bỏ qua email này.',
    '',
    BRAND_NAME,
  ].join('\n');

  // Inline styles and a table-free layout on purpose: a transactional code is
  // read in a preview pane, and every mail client strips <style> blocks
  // differently. The code is also repeated as text above, so a client that
  // renders nothing still delivers the message.
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
    '<h1 style="margin:0 0 24px;font-size:20px;font-weight:600;">Mã xác thực email</h1>',
    '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Mã xác thực của bạn là:</p>',
    '<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:0.2em;',
    `text-align:center;padding:16px;background:#faf8f5;border-radius:8px;">${escapeHtml(
      input.code,
    )}</p>`,
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">',
    `Mã này dùng để xác nhận địa chỉ email của bạn và sẽ hết hạn sau <strong>${String(
      minutes,
    )} phút</strong>. Vui lòng không chia sẻ mã với bất kỳ ai.`,
    '</p>',
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#8a7f76;">',
    'Nếu bạn không yêu cầu mã này, bạn có thể bỏ qua email này.',
    '</p>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  return { subject, text, html };
}
