/**
 * The production-capable email transport (`APP12-N01.B01` §4).
 *
 * The second implementation of `NotificationChannelPort`, and the first that
 * reaches a human being. `APP12-U01` proved why it had to exist: with only the
 * recording adapter wired, every verification code was "delivered" to an array
 * in process memory, so no real customer could verify and therefore no real
 * customer could order.
 *
 * ### Nodemailer stays inside this file
 *
 * The library is a transport detail. Its types appear in no domain or
 * application signature — this class takes the port's six plain fields and
 * returns the port's two-state result, exactly as the recording adapter does. A
 * future move to a provider API is a third adapter behind the same symbol, not a
 * rewrite of the delivery lifecycle.
 *
 * ### It renders, it does not mint
 *
 * The code arrives already minted by `APP4-B03` and already sealed and opened by
 * the envelope. This adapter never generates a secret, never decides a TTL and
 * never touches the challenge; it turns one delivery into one message. A second
 * OTP generator anywhere in the system would be a second answer to "what is the
 * code", which is why there is not one here.
 *
 * ### Email only, by construction
 *
 * `NotificationChannel` still admits `SMS` because historical rows do. This
 * adapter refuses it as a **permanent** failure rather than throwing: the
 * Product Owner locked customer verification to email (`APP12-N01` §1), no SMS
 * provider exists or will, and a retryable classification would spend the whole
 * retry budget re-deciding something that cannot change. See `LOG SAFETY` below
 * for why the refusal carries no recipient.
 *
 * ### LOG SAFETY
 *
 * This class logs the delivery's classification and never its content. The code,
 * the rendered body, the SMTP password and the unmasked recipient are all absent
 * from every log line and from every error this class raises — including the
 * ones it builds from a caught provider exception, whose message may quote the
 * envelope recipient or the credential it just tried. Provider errors are
 * therefore *classified*, never forwarded.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import {
  type DeliveryResult,
  type NotificationChannelPort,
  type NotificationDelivery,
} from '../../domain/channel/notification-channel.port';
import type { SmtpTransportConfig } from '../../config/notification-transport.config';
import { renderVerificationEmail } from '../../domain/verification-email.renderer';
import { maskRecipient } from '../../domain/recipient-mask';

/**
 * SMTP reply codes that mean "not now" rather than "not ever".
 *
 * 4xx is the protocol's own transient class. 421 and 450/451/452 are the ones a
 * shared or rate-limited relay actually returns under load, and every one of
 * them is worth the existing `[60, 300]`-second retry schedule.
 */
function isRetryableSmtpFailure(error: unknown): boolean {
  const code = (error as { responseCode?: unknown } | undefined)?.responseCode;
  if (typeof code === 'number') {
    // 4xx transient; 5xx permanent (bad recipient, refused relay, auth denied).
    return code >= 400 && code < 500;
  }
  // No reply code at all means the dialogue never completed: DNS, TCP, TLS or a
  // socket timeout. Those are conditions of the moment, so they retry.
  const name = (error as { code?: unknown } | undefined)?.code;
  if (typeof name === 'string') {
    // `EAUTH` is the exception: credentials do not become correct by waiting,
    // and retrying a rejected login is how a relay decides to block the sender.
    return name !== 'EAUTH';
  }
  return true;
}

/** The bounded failure classes this adapter reports. Never a provider message. */
function failureClassOf(error: unknown): string {
  const name = (error as { code?: unknown } | undefined)?.code;
  if (name === 'EAUTH') return 'SMTP_AUTH_REJECTED';
  if (name === 'ECONNECTION' || name === 'ECONNREFUSED') return 'SMTP_CONNECTION_FAILED';
  if (name === 'ETIMEDOUT' || name === 'ESOCKET') return 'SMTP_TIMEOUT';
  const code = (error as { responseCode?: unknown } | undefined)?.responseCode;
  if (typeof code === 'number') {
    return code >= 500 ? 'SMTP_PERMANENT_REFUSAL' : 'SMTP_TEMPORARY_REFUSAL';
  }
  return 'SMTP_UNKNOWN_FAILURE';
}

@Injectable()
export class SmtpNotificationChannelAdapter implements NotificationChannelPort {
  private readonly logger = new Logger(SmtpNotificationChannelAdapter.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpTransportConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
      // Certificate verification is left at the library default (enabled). No
      // code path in this repository disables it, in production or anywhere
      // else. `requireTls` only decides whether an *unencrypted* session is
      // permissible at all, and the loader refuses to turn it off in a
      // delivering environment.
      requireTLS: config.requireTls && !config.secure,
    });
  }

  async send(delivery: NotificationDelivery): Promise<DeliveryResult> {
    if (delivery.channel !== 'EMAIL') {
      this.logger.warn(
        `Refusing a ${delivery.channel} delivery: customer notification is email only.`,
      );
      return { outcome: 'FAILED', retryable: false };
    }

    const content = renderVerificationEmail({
      code: delivery.secret,
      issuedAt: delivery.issuedAt,
      expiresAt: delivery.expiresAt,
    });
    const masked = maskRecipient(delivery.normalizedRecipient);

    try {
      const info = await this.transporter.sendMail({
        from: { name: this.config.fromName, address: this.config.fromAddress },
        to: delivery.normalizedRecipient,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      const ref = typeof info.messageId === 'string' ? info.messageId : undefined;
      this.logger.log(`Delivered EMAIL to ${masked}.`);
      return { outcome: 'SENT', ...(ref === undefined ? {} : { providerMessageRef: ref }) };
    } catch (error: unknown) {
      const retryable = isRetryableSmtpFailure(error);
      // The class and the masked recipient, and deliberately nothing the
      // provider said: an SMTP error string routinely quotes the full envelope
      // recipient, and an auth failure can quote the username.
      this.logger.warn(
        `EMAIL delivery to ${masked} failed: ${failureClassOf(error)} (retryable=${String(
          retryable,
        )}).`,
      );
      return { outcome: 'FAILED', retryable };
    }
  }

  /** Releases the pooled connection, if the transport opened one. */
  close(): void {
    this.transporter.close();
  }
}
