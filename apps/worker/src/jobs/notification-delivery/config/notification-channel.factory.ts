/**
 * Which adapter stands behind `NOTIFICATION_CHANNEL_PORT` (`APP12-N01.B01` §6).
 *
 * The one place the transport decision is made, so there is exactly one answer
 * to "what does this deployment do with an outbound message". Before this
 * checkpoint the module bound the recording adapter unconditionally, which is
 * the `APP12-U01` blocker in a single line of wiring.
 *
 * It is a Nest factory rather than a lazily memoized provider — the opposite of
 * `StorefrontPublicOriginProvider`'s choice, on purpose. That value is needed
 * only when a secure link is rendered, so an eager read would break processes
 * that never render one. This one is needed by *every* delivery the worker
 * performs, and its whole reason for existing is that a misconfigured deployment
 * must not start and quietly deliver nothing. Failing at composition is the
 * behaviour, not a side effect.
 */
import { Logger, type FactoryProvider } from '@nestjs/common';

import { NOTIFICATION_CHANNEL_PORT } from '../domain/channel/notification-channel.port';
import type { NotificationChannelPort } from '../domain/channel/notification-channel.port';
import { RecordingNotificationChannelAdapter } from '../infrastructure/channel/recording-notification-channel.adapter';
import { SmtpNotificationChannelAdapter } from '../infrastructure/channel/smtp-notification-channel.adapter';
import { loadNotificationTransportConfig } from './notification-transport.config';

/**
 * Binds the port to the configured transport.
 *
 * The recording adapter is still injected so it remains one instance in the
 * graph for the isolated tests that read it; it is simply no longer what the
 * port resolves to unless the deployment asked for it by name.
 */
export const notificationChannelProvider: FactoryProvider<NotificationChannelPort> = {
  provide: NOTIFICATION_CHANNEL_PORT,
  inject: [RecordingNotificationChannelAdapter],
  useFactory: (recording: RecordingNotificationChannelAdapter): NotificationChannelPort => {
    const logger = new Logger('NotificationChannel');
    const config = loadNotificationTransportConfig(process.env);

    if (config.transport === 'RECORDING') {
      // Loud on purpose. A process that delivers to nobody should say so once,
      // at startup, in the log an operator reads when a customer reports a
      // missing code.
      logger.warn(
        'NOTIFICATION_TRANSPORT=RECORDING — messages are captured in memory and ' +
          'delivered to nobody. This is not a delivering configuration.',
      );
      return recording;
    }

    // Host and port only: the username is an identity and the password is a
    // credential, and neither belongs in a startup line.
    logger.log(`NOTIFICATION_TRANSPORT=SMTP via ${config.smtp.host}:${String(config.smtp.port)}.`);
    return new SmtpNotificationChannelAdapter(config.smtp);
  },
};
