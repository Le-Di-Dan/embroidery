/**
 * What a `SECURE_LINK_TOKEN` delivery actually becomes over SMTP
 * (`APP12-E01` §3.7; `APP12-E01-C1` §8, §11).
 *
 * ### Why this suite exists
 *
 * `APP12-N01` locked customer verification to email and delivered the transport
 * that makes it real. Its scope was the **verification code**, and every case in
 * `smtp-notification-channel.adapter.spec.ts` sends a `VERIFICATION_CODE`.
 *
 * `APP12-E01` §3.7 asks a different question, and it was the first checkpoint to
 * ask it: does the *`ORDER_ACCESS` link* survive the production-capable
 * transport? It did not. The adapter had one render path and no `secretKind`
 * branch, so the message a customer received was "Mã xác thực email" carrying a
 * 43-character bearer grant token where a six-digit code belongs, a 72-hour
 * window printed as "4320 phút", and no link — `FU-APP12-E01-01`, the blocker
 * `APP12-E01-C1` exists to close.
 *
 * These cases send the delivery to the **SMTP** adapter and read the bytes that
 * went over the wire. Every assertion below is one line of `APP12-E01-C1` §11.
 *
 * ### The copy is quoted from the Product Owner, not from the renderer
 *
 * `SECURE_ORDER_LINK_COPY` is deliberately **not** imported. A spec that
 * imported the strings it checks passes whatever the renderer says, including a
 * regression in it — the same discipline the Storefront copy catalogs are held
 * to. The literals below are transcribed from `APP12-E01-C1` §2.
 *
 * ### The delivery shape
 *
 * `secretKind` is `SECURE_LINK_TOKEN`, `secret` is the opaque 43-character grant
 * token, and `secureLinkUrl` is the composed fragment-carrying URL — exactly
 * what `notification-delivery.usecase` puts on the port.
 */
import {
  decodedBody,
  decodedSubject,
  startSmtpCaptureServer,
  type SmtpCaptureServer,
} from '../../tests/smtp-capture-server';
import type { NotificationDelivery } from '../../domain/channel/notification-channel.port';
import { SmtpNotificationChannelAdapter } from './smtp-notification-channel.adapter';
import type { SmtpTransportConfig } from '../../config/notification-transport.config';

const USERNAME = 'e01-smtp-user';
const PASSWORD = 'e01-smtp-secret';

/** A well-formed opaque grant token. Synthetic, and never a real credential. */
const GRANT_TOKEN = 'Ab3dEf6hIj9lMn2pQr5tUv8xYz1cDe4gHi7kLm0nOp3';
const STOREFRONT_ORIGIN = 'http://cua-hang.localhost:8080';
const ORDER_ACCESS_PATH = '/truy-cap/don-hang';
const SECURE_LINK = `${STOREFRONT_ORIGIN}${ORDER_ACCESS_PATH}#t=${GRANT_TOKEN}`;
const RECIPIENT = 'khach.hang@vidu.test';

/** `APP12-E01-C1` §2, transcribed. Never imported from the renderer. */
const COPY = {
  subject: 'Liên kết theo dõi đơn hàng Nét Thêu',
  heading: 'Theo dõi đơn hàng của bạn',
  bodyCreated: 'Đơn hàng của bạn đã được tạo.',
  cta: 'Mở đơn hàng',
  expiry: 'Liên kết có hiệu lực trong 72 giờ.',
  safety: 'Nếu bạn không nhận ra đơn hàng này, hãy bỏ qua email.',
} as const;

const ONE_HOUR_MS = 60 * 60 * 1000;
const GRANT_WINDOW_HOURS = 72;

function configFor(port: number): SmtpTransportConfig {
  return {
    host: '127.0.0.1',
    port,
    secure: false,
    requireTls: false,
    username: USERNAME,
    password: PASSWORD,
    fromAddress: 'no-reply@netheu.test',
    fromName: 'Nét Thêu',
  } satisfies SmtpTransportConfig;
}

function secureLinkDelivery(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  const issuedAt = new Date('2026-09-10T10:00:00.000Z');
  return {
    channel: 'EMAIL',
    normalizedRecipient: RECIPIENT,
    secretKind: 'SECURE_LINK_TOKEN',
    secret: GRANT_TOKEN,
    issuedAt,
    // The `ORDER_ACCESS` grant window, not an OTP window.
    expiresAt: new Date(issuedAt.getTime() + GRANT_WINDOW_HOURS * ONE_HOUR_MS),
    secureLinkUrl: SECURE_LINK,
    ...overrides,
  };
}

describe('APP12-E01 §3.7 — an ORDER_ACCESS delivery over SMTP', () => {
  let server: SmtpCaptureServer;
  let adapter: SmtpNotificationChannelAdapter | undefined;
  let body: string;
  let subject: string;

  beforeEach(async () => {
    server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
    adapter = new SmtpNotificationChannelAdapter(configFor(server.port));
    await adapter.send(secureLinkDelivery());
    const captured = server.messages[0];
    body = captured === undefined ? '' : decodedBody(captured);
    subject = captured === undefined ? '' : decodedSubject(captured);
  });

  afterEach(async () => {
    adapter?.close();
    adapter = undefined;
    await server?.close();
  });

  it('reaches the recipient at all', () => {
    expect(server.messages).toHaveLength(1);
    expect(server.messages[0]?.recipients).toContain(RECIPIENT);
  });

  it('carries the link the customer is supposed to open', () => {
    // §3.7: "email delivery accepts the secure link". A message that does not
    // contain it cannot be opened, whatever else it says.
    expect(body).toContain(ORDER_ACCESS_PATH);
    expect(body).toContain(SECURE_LINK);
  });

  it('does not present a bearer grant token as a verification code', () => {
    // The failure mode this guards is specific and worse than a missing link:
    // the verification renderer puts `delivery.secret` where a six-digit code
    // belongs. For this delivery that secret is the `ORDER_ACCESS` grant — so a
    // customer would be shown a 43-character bearer credential, told it was
    // their code, and asked to type it into a field that will never accept it.
    const renderedAsOtp =
      /Mã xác thực/.test(body) && body.includes(GRANT_TOKEN) && !body.includes(SECURE_LINK);
    expect({ renderedAsOtp, carriesLink: body.includes(SECURE_LINK) }).toEqual({
      renderedAsOtp: false,
      carriesLink: true,
    });
  });

  describe('the approved message (APP12-E01-C1 §2, §11)', () => {
    it('announces itself as the order-tracking link, not a verification code', () => {
      expect(subject).toBe(COPY.subject);
      // The subject is where the old defect was loudest: a customer scanning an
      // inbox saw "Mã xác thực" on a message that had nothing to verify.
      expect(subject).not.toContain('Mã xác thực');
    });

    it('opens with the approved heading and body', () => {
      expect(body).toContain(COPY.heading);
      expect(body).toContain(COPY.bodyCreated);
      expect(body).toContain(COPY.safety);
    });

    it('offers one primary action, pointing at the authoritative URL', () => {
      // Visible CTA text and `href` asserted **together**, from the same
      // anchor. Checking them separately would pass on a message with the right
      // words and a link to somewhere else — the shape of a phishing test
      // rather than a delivery test.
      const anchor = new RegExp(
        `<a[^>]*href="${escapeForPattern(SECURE_LINK)}"[^>]*>${escapeForPattern(COPY.cta)}</a>`,
      );
      expect(anchor.test(body)).toBe(true);
    });

    it('repeats the full URL in the plain-text alternative', () => {
      // A text-only client, a screen reader and the E2E harness all recover the
      // link from this part. The `text/plain` part is isolated so an HTML-only
      // `href` cannot satisfy the case.
      expect(textPartOf(body)).toContain(SECURE_LINK);
    });

    it('states the 72-hour window in hours a person would use', () => {
      expect(body).toContain(COPY.expiry);
      // The literal regression. 4320 minutes is arithmetically correct and
      // useless: nobody reads a three-day window in minutes.
      expect(body).not.toContain('4320 phút');
      expect(body).not.toMatch(/\d+ phút/);
    });

    it('carries no verification wording anywhere', () => {
      expect(body).not.toContain('Mã xác thực');
      expect(body).not.toContain('mã xác thực');
    });

    it('sends both a plain-text and an HTML part, and exactly one message', () => {
      const raw = server.messages[0]!.raw;
      expect(raw).toContain('text/plain');
      expect(raw).toContain('text/html');
      expect(server.messages).toHaveLength(1);
    });
  });

  describe('bearer-token presentation (APP12-E01-C1 §6)', () => {
    it('exposes the token only as part of the URL, never as a standalone value', () => {
      // Every occurrence of the token must be preceded by the fragment carrier.
      // A bare token on a line of its own is the old "here is your code"
      // rendering, and it is forbidden whatever label sits above it.
      const occurrences = countOf(body, GRANT_TOKEN);
      const inLink = countOf(body, `#t=${GRANT_TOKEN}`);
      expect(inLink).toBeGreaterThan(0);
      expect({ occurrences, inLink }).toEqual({ occurrences: inLink, inLink });
    });

    it('keeps the token out of the subject', () => {
      expect(subject).not.toContain(GRANT_TOKEN);
    });
  });
});

describe('APP12-E01-C1 §5 — a secure-link delivery that cannot be composed', () => {
  let server: SmtpCaptureServer;
  let adapter: SmtpNotificationChannelAdapter | undefined;

  beforeEach(async () => {
    server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
    adapter = new SmtpNotificationChannelAdapter(configFor(server.port));
  });

  afterEach(async () => {
    adapter?.close();
    adapter = undefined;
    await server?.close();
  });

  it('fails closed when no secure-link URL arrived, and sends nothing', async () => {
    // The forbidden alternative is a "graceful" fallback that prints the raw
    // token so the customer has *something*. That something is a bearer
    // credential with no way to use it — worse than silence, because it teaches
    // a customer to treat a grant token as a code they should transcribe.
    const result = await adapter!.send(secureLinkDelivery({ secureLinkUrl: undefined }));

    expect(result).toEqual({ outcome: 'FAILED', retryable: false });
    expect(server.messages).toHaveLength(0);
  });

  it('fails closed on a secret kind it has no message for', async () => {
    // Exhaustive dispatch, stated as a test. Before the correction this branch
    // *was* the verification renderer, which is precisely how an `ORDER_ACCESS`
    // grant came to be delivered as an OTP.
    const result = await adapter!.send(
      secureLinkDelivery({ secretKind: 'SOMETHING_NOBODY_HAS_WRITTEN_YET' }),
    );

    expect(result).toEqual({ outcome: 'FAILED', retryable: false });
    expect(server.messages).toHaveLength(0);
  });

  it('writes neither the token nor the SMTP password to a log', async () => {
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    };
    const outWrite = process.stdout.write.bind(process.stdout);
    const errWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = capture;
    process.stderr.write = capture;
    try {
      await adapter!.send(secureLinkDelivery());
      await adapter!.send(secureLinkDelivery({ secureLinkUrl: undefined }));
    } finally {
      process.stdout.write = outWrite;
      process.stderr.write = errWrite;
    }

    const log = written.join('');
    expect(log).not.toContain(GRANT_TOKEN);
    expect(log).not.toContain(SECURE_LINK);
    expect(log).not.toContain(PASSWORD);
    expect(log).not.toContain(RECIPIENT);
  });
});

/**
 * The `text/plain` alternative alone.
 *
 * Nodemailer emits the parts in the order it was given them, plain text first.
 * Slicing at the HTML part's own header is what makes "the plain-text fallback
 * contains the URL" a real assertion rather than one an `href` could satisfy.
 */
function textPartOf(decoded: string): string {
  const start = decoded.indexOf('text/plain');
  const end = decoded.indexOf('text/html');
  if (start === -1) return '';
  return decoded.slice(start, end === -1 ? undefined : end);
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
