/**
 * What a `SECURE_LINK_TOKEN` delivery actually becomes over SMTP
 * (`APP12-E01` §3.1, §3.7).
 *
 * ### Why this suite exists
 *
 * `APP12-N01` locked customer verification to email and delivered the transport
 * that makes it real. Its scope was the **verification code**, and every case in
 * `smtp-notification-channel.adapter.spec.ts` sends a `VERIFICATION_CODE`.
 *
 * `APP12-E01` §3.7 asks a different question, and it is the first checkpoint to
 * ask it: does the *`ORDER_ACCESS` link* survive the production-capable
 * transport? The application layer composes one — `notification-delivery.usecase`
 * calls `renderSecureLinkUrl` and puts the result on the port as
 * `secureLinkUrl`, and the recording adapter records it, which is why every
 * browser run so far could read a link back and pass.
 *
 * These cases send the same delivery to the **SMTP** adapter and read the bytes
 * that went over the wire. They assert what §3.7 requires — that the message a
 * customer receives carries the link they are supposed to open, and does not
 * present a bearer grant token as though it were a six-digit code.
 *
 * The delivery below is the shape the use case builds: `secretKind` is
 * `SECURE_LINK_TOKEN`, `secret` is the opaque 43-character grant token, and
 * `secureLinkUrl` is the composed fragment-carrying URL.
 */
import {
  decodedBody,
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

function secureLinkDelivery(): NotificationDelivery {
  const issuedAt = new Date('2026-09-10T10:00:00.000Z');
  return {
    channel: 'EMAIL',
    normalizedRecipient: 'khach.hang@vidu.test',
    secretKind: 'SECURE_LINK_TOKEN',
    secret: GRANT_TOKEN,
    issuedAt,
    // The `ORDER_ACCESS` grant window, not an OTP window.
    expiresAt: new Date(issuedAt.getTime() + 72 * 60 * 60 * 1000),
    secureLinkUrl: SECURE_LINK,
  };
}

describe('APP12-E01 §3.7 — an ORDER_ACCESS delivery over SMTP', () => {
  let server: SmtpCaptureServer;
  let adapter: SmtpNotificationChannelAdapter | undefined;
  let body: string;

  beforeEach(async () => {
    server = await startSmtpCaptureServer({ username: USERNAME, password: PASSWORD });
    adapter = new SmtpNotificationChannelAdapter(configFor(server.port));
    await adapter.send(secureLinkDelivery());
    const captured = server.messages[0];
    body = captured === undefined ? '' : decodedBody(captured);
  });

  afterEach(async () => {
    adapter?.close();
    adapter = undefined;
    await server?.close();
  });

  it('reaches the recipient at all', () => {
    expect(server.messages).toHaveLength(1);
    expect(server.messages[0]?.recipients).toContain('khach.hang@vidu.test');
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
});
