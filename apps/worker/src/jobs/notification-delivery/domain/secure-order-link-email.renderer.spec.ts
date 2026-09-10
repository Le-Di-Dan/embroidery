/**
 * The secure-order-link message's content rules (`APP12-E01-C1` §2, §5, §6).
 *
 * The wire proof lives in `smtp-secure-link.spec.ts`, where a real SMTP session
 * carries the bytes. This suite is the renderer's own: the negative cases are as
 * load-bearing as the positive ones, because this is the file where a message
 * could quietly reacquire the thing that made `FU-APP12-E01-01` a blocker — a
 * bearer grant token presented as something to read and retype.
 */
import {
  renderSecureOrderLinkEmail,
  secureLinkValidity,
  SECURE_ORDER_LINK_COPY,
} from './secure-order-link-email.renderer';

const ISSUED_AT = new Date('2026-09-10T10:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const TOKEN = 'Ab3dEf6hIj9lMn2pQr5tUv8xYz1cDe4gHi7kLm0nOp3';
const LINK = `http://cua-hang.localhost:8080/truy-cap/don-hang#t=${TOKEN}`;

function render(windowMs = 72 * ONE_HOUR_MS, url = LINK) {
  return renderSecureOrderLinkEmail({
    secureLinkUrl: url,
    issuedAt: ISSUED_AT,
    expiresAt: new Date(ISSUED_AT.getTime() + windowMs),
  });
}

describe('renderSecureOrderLinkEmail', () => {
  it('uses the approved subject, heading and CTA', () => {
    const content = render();

    expect(content.subject).toBe('Liên kết theo dõi đơn hàng Nét Thêu');
    expect(content.html).toContain('Theo dõi đơn hàng của bạn');
    expect(content.html).toContain('Mở đơn hàng');
    expect(content.text).toContain('Theo dõi đơn hàng của bạn');
  });

  it('places the URL it was given, unchanged, in both parts', () => {
    const content = render();

    // Byte-identical. A renderer that normalised, re-encoded or re-hosted the
    // URL would be a second URL composer, and the fragment is exactly the part
    // a naive `new URL(...).toString()` round-trip is most likely to disturb.
    expect(content.text).toContain(LINK);
    expect(content.html).toContain(`href="${LINK}"`);
  });

  it('never labels the token as a code and never prints it alone', () => {
    const content = render();
    const whole = `${content.subject}\n${content.text}\n${content.html}`;

    expect(whole).not.toContain('Mã xác thực');
    // Every appearance of the token is inside the fragment carrier.
    expect(whole.split(TOKEN).length).toBe(whole.split(`#t=${TOKEN}`).length);
  });

  it('carries the safety line and no marketing', () => {
    const content = render();

    expect(content.text).toContain('Nếu bạn không nhận ra đơn hàng này, hãy bỏ qua email.');
    expect(content.text).toContain(SECURE_ORDER_LINK_COPY.bodyCreated);
  });

  it('escapes a URL that would otherwise close the href attribute', () => {
    // The URL is composed upstream from a configured origin and an opaque
    // base64url token, so this cannot happen today. It is asserted anyway: the
    // day a landing path grows a query parameter, an unescaped `"` in an
    // attribute is an injected element, and the person making that change will
    // not be reading this file.
    const content = render(72 * ONE_HOUR_MS, 'http://host/p#t="><script>x</script>');

    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('secureLinkValidity', () => {
  it('states the 72-hour ORDER_ACCESS window in hours', () => {
    // The blocker's most visible symptom, pinned: "4320 phút" is what the
    // verification renderer produced for this exact window.
    expect(secureLinkValidity(ISSUED_AT, new Date(ISSUED_AT.getTime() + 72 * ONE_HOUR_MS))).toBe(
      '72 giờ',
    );
    expect(render().text).toContain('Liên kết có hiệu lực trong 72 giờ.');
  });

  it('rounds a part-hour window up rather than understating it', () => {
    const window = 90 * 60 * 1000;
    expect(secureLinkValidity(ISSUED_AT, new Date(ISSUED_AT.getTime() + window))).toBe('2 giờ');
  });

  it('keeps minutes for a window shorter than an hour', () => {
    const window = 15 * 60 * 1000;
    expect(secureLinkValidity(ISSUED_AT, new Date(ISSUED_AT.getTime() + window))).toBe('15 phút');
  });

  it('never reports a window as zero', () => {
    expect(secureLinkValidity(ISSUED_AT, ISSUED_AT)).toBe('1 phút');
  });

  it('holds no TTL of its own', () => {
    // A second copy of the policy would be a second answer to "when does this
    // stop working", and the customer would be told the stale one the day the
    // grant window changed.
    expect(render(24 * ONE_HOUR_MS).text).toContain('Liên kết có hiệu lực trong 24 giờ.');
  });
});
