import { Module } from '@nestjs/common';

import { HealthModule } from '../modules/health/health.module';
import { RequestContextModule } from '../platform/request-context/request-context.module';

@Module({
  imports: [RequestContextModule, HealthModule],
})
export class AppModule {}
