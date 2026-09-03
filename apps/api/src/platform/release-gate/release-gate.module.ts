import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import {
  CUSTOM_EMBROIDERY_RELEASE_CONFIG,
  CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV,
  loadCustomEmbroideryReleaseConfig,
  type CustomEmbroideryReleaseConfig,
} from '../../config/custom-embroidery-release.config';
import { LoggingModule } from '../logging/logging.module';
import { StructuredLogger } from '../logging/structured-logger.service';
import { CustomCapabilityReleaseGuard } from './custom-capability-release.guard';

/**
 * The release-isolation platform (`APP12-G02`).
 *
 * Composes the one release-control variable and registers the one guard that
 * consumes it. It is a platform module rather than a feature module because the
 * capability it governs spans nine delivered modules — Catalog placement,
 * Design, Order, Quotation and Payment among them — and none of them owns the
 * release decision.
 *
 * ## Registration
 *
 * `APP_GUARD` makes the guard global from wherever it is provided, and the
 * provider is here rather than in `LoggingModule`-style global scope so the
 * release configuration has exactly one composition site. The configuration is
 * read once, when the module is composed: the release state of a wave changes by
 * deploying a decision, not between two requests, and a per-request read would
 * invite exactly the kind of mid-flight flip that leaves one customer halfway
 * through a withheld flow.
 *
 * ## The startup line
 *
 * Logged deliberately, and permitted by §17: the record carries a non-secret
 * configuration state and no customer data. Without it, "is custom embroidery
 * released on this environment?" is answerable only by probing a withheld route,
 * and a `malformed` value would be indistinguishable from a deliberate `false` —
 * an operator who mistyped `True` would keep turning the capability on and keep
 * watching nothing happen. The variable's *name* appears in the log; its value
 * appears only as the boolean it resolved to.
 *
 * ## Why `LoggingModule` is imported even though it is `@Global()`
 *
 * A global module is global only once something in the graph has imported it.
 * The running application imports it from `AppModule`, so the omission was
 * invisible there — but every integration context that boots a feature module
 * without the whole application could not compose this factory at all, and
 * `CustomerModule` imports this module. Declaring the dependency here is a
 * no-op for the running application and makes the module self-sufficient
 * wherever it is composed.
 */
@Module({
  imports: [LoggingModule],
  providers: [
    {
      provide: CUSTOM_EMBROIDERY_RELEASE_CONFIG,
      inject: [StructuredLogger],
      useFactory: (logger: StructuredLogger): CustomEmbroideryReleaseConfig => {
        const config = loadCustomEmbroideryReleaseConfig(process.env);
        if (config.malformed) {
          logger.warn(
            'release.gate.malformed',
            `${CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV} is neither "true" nor "false"; the custom embroidery capability stays withheld.`,
            { attributes: { variable: CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV } },
          );
        }
        logger.info(
          'release.gate.configured',
          `Custom embroidery release enabled=${String(config.enabled)}.`,
          {
            attributes: {
              variable: CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV,
              enabled: config.enabled,
            },
          },
        );
        return config;
      },
    },
    { provide: APP_GUARD, useClass: CustomCapabilityReleaseGuard },
  ],
  exports: [CUSTOM_EMBROIDERY_RELEASE_CONFIG],
})
export class ReleaseGateModule {}
