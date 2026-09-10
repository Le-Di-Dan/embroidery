/**
 * The SMTP delivery boundary, proven against a real SMTP server
 * (`APP12-N01.B01` §13, §21).
 *
 * Every case here connects over TCP to a disposable loopback SMTP listener and
 * completes an actual session. Nothing is stubbed: a regression that broke
 * authentication, addressing, encoding or failure classification fails here.
 *
 * What this suite proves, and the limit of that proof:
 *
 * ```text
 * SMTP_DELIVERY_BOUNDARY = PASS      the message leaves correctly formed
 * REAL_INBOX_MANUAL      = NOT_EXECUTED
 * ```
 *
 * A captured message is not a delivered one. Whether a real provider accepts,
 * routes and files this mail in a human's inbox is a manual check the Product
 * Owner performs with real credentials; no test in this repository may claim it.
 */
import { SmtpNotificationChannelAdapter } from './smtp-notification-channel.adapter';
import type { SmtpTransportConfig } from '../../config/notification-transport.config';
import type { NotificationDelivery } from '../../domain/channel/notification-channel.port';
import {
  decodedBody,
  decodedSubject,
  startSmtpCaptureServer,
  type SmtpCaptureServer,
} from '../../tests/smtp-capture-server';

const USERNAME = 'uat-smtp-user';
const PASSWORD = 'uat-smtp-secret';
const CODE = '481902';

function configFor(port: number, overrides: Partial<SmtpTransportConfig> = {}) {
  return {
    host: '127.0.0.1',
    port,
    secure: false,
    requireTls: false,
    username: USERNAME,
    password: PASSWORD,
    fromAddress: 'no-reply@netheu.test',
    fromName: 'Nét Thêu',
    ...overrides,
  } satisfies SmtpTransportConfig;
}

function deliveryFor(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  const issuedAt = new Date('2026-09-09T10:00:00.000Z');
  return {
    channel: 'EMAIL',
    normalizedRecipient: 'khach.hang@vidu.test',
    secretKind: 'VERIFICATION_CODE',
    secret: CODE,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 600_000),
    ...overrides,
  };
}

describe('SmtpNotificationChannelAdapter', () => {
  let server: SmtpCaptureServer;
  let adapter: SmtpNotificationChannelAdapter | undefined;

  afterEach(async () => {
    adapter?.close();
    adapter = undefined;
    await server?.close();
  });

  describe('a successful delivery', () => {
    beforeEach(async () => {
      server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));
    });

    it('completes a real SMTP session and reports SENT', async () => {
      const result = await adapter!.send(deliveryFor());

      expect(result.outcome).toBe('SENT');
      expect(server.messages).toHaveLength(1);
    });

    it('addresses the envelope to the requested recipient', async () => {
      await adapter!.send(deliveryFor());

      expect(server.messages[0]!.recipients).toEqual(['khach.hang@vidu.test']);
      expect(server.messages[0]!.sender).toBe('no-reply@netheu.test');
    });

    it('carries the Nét Thêu verification subject', async () => {
      await adapter!.send(deliveryFor());

      expect(decodedSubject(server.messages[0]!)).toBe('Mã xác thực Nét Thêu');
    });

    it('carries the issued code', async () => {
      await adapter!.send(deliveryFor());

      expect(decodedBody(server.messages[0]!)).toContain(CODE);
    });

    it('states the expiry that the challenge was issued with', async () => {
      await adapter!.send(deliveryFor());

      // 600 000 ms of validity is ten minutes, and the message must say so
      // rather than restate a TTL of its own.
      expect(decodedBody(server.messages[0]!)).toContain('10 phút');
    });

    it('sends both a plain-text and an HTML part', async () => {
      await adapter!.send(deliveryFor());

      const raw = server.messages[0]!.raw;
      expect(raw).toContain('text/plain');
      expect(raw).toContain('text/html');
    });

    it('sends exactly one message for one delivery', async () => {
      await adapter!.send(deliveryFor());

      expect(server.messages).toHaveLength(1);
    });

    it('puts no secret in the message beyond the code itself', async () => {
      await adapter!.send(deliveryFor());

      const raw = server.messages[0]!.raw;
      expect(raw).not.toContain(PASSWORD);
      expect(raw).not.toContain(USERNAME);
    });
  });

  /**
   * The regression that stops `FU-APP12-E01-01` from being fixed by breaking
   * `APP12-N01` (`APP12-E01-C1` §3, §10).
   *
   * The correction gave this adapter a second renderer and a `secretKind`
   * branch. The cheapest wrong way to do that is one merged "generic" template
   * serving both intents, which would quietly reshape the verification message
   * the Product Owner has already closed. So the verification path is asserted
   * *positively* — it still says what it said — and *negatively*: none of the
   * secure-link message has leaked into it.
   */
  describe('verification-email preservation', () => {
    beforeEach(async () => {
      server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));
    });

    it('still renders an OTP as an OTP, under the verification subject', async () => {
      await adapter!.send(deliveryFor());

      const message = server.messages[0]!;
      expect(decodedSubject(message)).toBe('Mã xác thực Nét Thêu');
      const body = decodedBody(message);
      expect(body).toContain('Mã xác thực email');
      expect(body).toContain(CODE);
      // Minutes, still: an OTP window is read in minutes and the secure-link
      // message's hour formatting must not have reached this path.
      expect(body).toContain('10 phút');
      expect(body).not.toContain('giờ');
    });

    it('carries none of the secure-order message', async () => {
      await adapter!.send(deliveryFor());

      const body = decodedBody(server.messages[0]!);
      expect(body).not.toContain('Mở đơn hàng');
      expect(body).not.toContain('Theo dõi đơn hàng của bạn');
      expect(body).not.toContain('/truy-cap/don-hang');
      // No anchor at all. The verification message has no action to click, and
      // a link appearing in an OTP mail is the shape phishing filters score on.
      expect(body).not.toMatch(/<a\s/);
    });

    it('dispatches on the secret kind alone, not on which fields arrived', async () => {
      // A `VERIFICATION_CODE` that somehow carried a link is still a code. The
      // discriminator is the kind the envelope codec validated; branching on
      // field presence would make the message depend on an upstream accident.
      await adapter!.send(
        deliveryFor({ secureLinkUrl: 'http://cua-hang.localhost:8080/truy-cap/don-hang#t=x' }),
      );

      const body = decodedBody(server.messages[0]!);
      expect(decodedSubject(server.messages[0]!)).toBe('Mã xác thực Nét Thêu');
      expect(body).toContain(CODE);
      expect(body).not.toContain('/truy-cap/don-hang');
    });
  });

  describe('failure classification', () => {
    it('classifies a 4xx refusal as retryable', async () => {
      server = await startSmtpCaptureServer({
        username: USERNAME,
        password: PASSWORD,
        rejectWith: 451,
      });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));

      await expect(adapter.send(deliveryFor())).resolves.toEqual({
        outcome: 'FAILED',
        retryable: true,
      });
    });

    it('classifies a 5xx refusal as permanent', async () => {
      server = await startSmtpCaptureServer({
        username: USERNAME,
        password: PASSWORD,
        rejectWith: 550,
      });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));

      await expect(adapter.send(deliveryFor())).resolves.toEqual({
        outcome: 'FAILED',
        retryable: false,
      });
    });

    it('does not retry rejected credentials', async () => {
      server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
      adapter = new SmtpNotificationChannelAdapter(
        configFor(server.port, { password: 'wrong-secret' }),
      );

      // Waiting does not make a password correct, and a relay that sees repeated
      // failed logins blocks the sender.
      await expect(adapter.send(deliveryFor())).resolves.toEqual({
        outcome: 'FAILED',
        retryable: false,
      });
    });

    it('treats an unreachable server as retryable', async () => {
      server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
      const port = server.port;
      await server.close();
      adapter = new SmtpNotificationChannelAdapter(configFor(port));

      await expect(adapter.send(deliveryFor())).resolves.toEqual({
        outcome: 'FAILED',
        retryable: true,
      });
    });

    it('never marks a refused send as delivered', async () => {
      server = await startSmtpCaptureServer({
        username: USERNAME,
        password: PASSWORD,
        rejectWith: 550,
      });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));

      const result = await adapter.send(deliveryFor());

      expect(result.outcome).not.toBe('SENT');
      expect(server.messages).toHaveLength(0);
    });
  });

  describe('email-only channel', () => {
    beforeEach(async () => {
      server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));
    });

    it('refuses an SMS delivery permanently and sends nothing', async () => {
      const result = await adapter!.send(deliveryFor({ channel: 'SMS' }));

      expect(result).toEqual({ outcome: 'FAILED', retryable: false });
      expect(server.messages).toHaveLength(0);
    });
  });

  describe('log safety', () => {
    it('never writes the code, the password or the address to a log', async () => {
      server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
      adapter = new SmtpNotificationChannelAdapter(configFor(server.port));

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
        await adapter.send(deliveryFor());
      } finally {
        process.stdout.write = outWrite;
        process.stderr.write = errWrite;
      }

      const log = written.join('');
      expect(log).not.toContain(CODE);
      expect(log).not.toContain(PASSWORD);
      expect(log).not.toContain('khach.hang@vidu.test');
    });
  });
});
