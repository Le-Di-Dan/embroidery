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
 * ### Two intents, two renderers, one discriminator (`APP12-E01-C1`)
 *
 * This class had a single render path until `APP12-E01` measured what that
 * meant on the wire. `renderVerificationEmail` was called for *every* delivery,
 * so an `ORDER_ACCESS` grant went out as "Mã xác thực email" with a 43-character
 * bearer token in the position of a six-digit code, a 72-hour window printed as
 * "4320 phút", and no link at all — `FU-APP12-E01-01`. A customer who had just
 * paid could not reach their own order over the only transport that reaches
 * humans.
 *
 * The fix is at this boundary and only here: {@link renderMessage} dispatches on
 * `secretKind`, the field the envelope codec already validates against a closed
 * set. Grant issuance, TTL, scope and fragment semantics are untouched — the
 * message was wrong, not the credential.
 *
 * ### The URL is placed, never composed
 *
 * `secureLinkUrl` arrives finished from `notification-delivery.usecase`, which
 * owns the configured origin, the landing path the scope selects and the `#t=`
 * carrier (`ADR-APP4-001` §11). This adapter is not the URL composer; it does
 * not parse, rebuild or re-encode that string, and a `SECURE_LINK_TOKEN` that
 * arrives without one is refused rather than degraded into a message carrying
 * the naked token.
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
import type { DeliverySecretKind } from '@embroidery/notification-delivery';

import {
  type DeliveryResult,
  type NotificationChannelPort,
  type NotificationDelivery,
} from '../../domain/channel/notification-channel.port';
import type { SmtpTransportConfig } from '../../config/notification-transport.config';
import type { EmailContent } from '../../domain/email-content';
import { renderVerificationEmail } from '../../domain/verification-email.renderer';
import { renderSecureOrderLinkEmail } from '../../domain/secure-order-link-email.renderer';
import { maskRecipient } from '../../domain/recipient-mask';

/**
 * The two customer intents this transport can render (`APP4-G01` §7).
 *
 * `satisfies` rather than bare strings, exactly as `notification-delivery.usecase`
 * writes them: the set lives in `@embroidery/notification-delivery`, and a typo
 * here would fail *closed* rather than loudly — every secure link silently
 * refused while every test about codes kept passing.
 */
const VERIFICATION_CODE = 'VERIFICATION_CODE' satisfies DeliverySecretKind;
const SECURE_LINK_TOKEN = 'SECURE_LINK_TOKEN' satisfies DeliverySecretKind;

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

/**
 * The message one delivery becomes, or `undefined` to refuse it (§4, §5).
 *
 * The discriminator is `secretKind` and nothing else. Branching on the token's
 * length, its TTL or its shape would be a guess dressed as a check: a
 * six-character grant and a 43-character code are both representable, and the
 * first envelope that carried one would be rendered as the other. The kind is
 * the field the envelope codec already validated against a closed set, so it is
 * the only honest question to ask.
 *
 * The dispatch is exhaustive by construction — an unrecognised kind, and a
 * secure link with no URL, both return `undefined`, and the caller turns that
 * into a refusal. There is deliberately no default branch: the failure this
 * whole correction exists to undo (`FU-APP12-E01-01`) *was* a default branch,
 * the verification renderer standing in for every kind that had not been
 * thought about.
 */
function renderMessage(delivery: NotificationDelivery): EmailContent | undefined {
  if (delivery.secretKind === VERIFICATION_CODE) {
    return renderVerificationEmail({
      code: delivery.secret,
      issuedAt: delivery.issuedAt,
      expiresAt: delivery.expiresAt,
    });
  }

  if (delivery.secretKind === SECURE_LINK_TOKEN) {
    // §5: the URL arrives already composed by the use case, from the configured
    // origin, the landing the grant scope selects and the fragment carrier. If
    // it is absent, this adapter has nothing to say — and what it must *not* do
    // is fall back to the raw token, which is the bearer credential itself and
    // would then be printed in a message with no way to use it. So: no message.
    if (delivery.secureLinkUrl === undefined || delivery.secureLinkUrl === '') {
      return undefined;
    }
    return renderSecureOrderLinkEmail({
      secureLinkUrl: delivery.secureLinkUrl,
      issuedAt: delivery.issuedAt,
      expiresAt: delivery.expiresAt,
    });
  }

  return undefined;
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

    const content = renderMessage(delivery);
    if (content === undefined) {
      // Permanent, and no message at all. Waiting cannot supply a renderer for
      // a kind that has none, and cannot conjure a URL the use case did not
      // compose — both are defects upstream of this transport. The kind is a
      // discriminator from a closed set, so naming it here is diagnosis, not
      // disclosure; the secret, the recipient and the link stay out of the line.
      this.logger.warn(
        `Refusing a ${delivery.secretKind} delivery: no renderable message for that secret kind.`,
      );
      return { outcome: 'FAILED', retryable: false };
    }
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
