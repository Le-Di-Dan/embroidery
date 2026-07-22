import { Module } from '@nestjs/common';

import { HealthModule } from '../modules/health/health.module';
import { AuditContextModule } from '../platform/audit-context/audit-context.module';
import { HttpResponseModule } from '../platform/http-response/http-response.module';
import { RequestContextModule } from '../platform/request-context/request-context.module';

@Module({
  imports: [RequestContextModule, AuditContextModule, HttpResponseModule, HealthModule],
})
export class AppModule {}
