import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { RequestContextService } from './request-context.service';
import { RequestIdMiddleware } from './request-id.middleware';

/**
 * Wildcard route pattern for Express 5 / path-to-regexp v8, where the bare `*`
 * of Express 4 is no longer a valid parameter name.
 */
const ALL_ROUTES = '{*splat}';

/**
 * Request context wiring (APP0-B02).
 *
 * Global so that any module can inject `RequestContextService` without
 * re-importing this module — correlation is a platform concern rather than a
 * dependency of one bounded context.
 *
 * The middleware is applied to every route, including health and the Swagger
 * UI. A blanket rule keeps HTTP behaviour uniform and removes the risk of a
 * future route silently having no context; giving a static docs asset a request
 * ID costs one UUID and is harmless.
 */
@Global()
@Module({
  providers: [RequestContextService, RequestIdMiddleware],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(ALL_ROUTES);
  }
}
