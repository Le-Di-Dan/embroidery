import { ApiProperty } from '@nestjs/swagger';

/**
 * Documentation-only response shapes for the platform health endpoints
 * (APP0-B01). Swagger reflects runtime classes, not TypeScript interfaces, so
 * these minimal decorated classes give the health operations named component
 * schemas. They mirror the controller's `HealthStatus`/`ReadinessStatus`
 * contract exactly and add no fields; the endpoints keep returning their
 * existing objects unchanged.
 */
export class DatabasePoolResponse {
  @ApiProperty({ description: 'Total connections held by the pool.' })
  total!: number;

  @ApiProperty({ description: 'Idle connections available in the pool.' })
  idle!: number;

  @ApiProperty({ description: 'Requests waiting for a connection.' })
  waiting!: number;

  @ApiProperty({ description: 'Configured maximum pool size.' })
  max!: number;
}

export class DatabaseHealthResponse {
  @ApiProperty({ enum: ['up', 'degraded', 'down'] })
  status!: 'up' | 'degraded' | 'down';

  @ApiProperty({
    enum: ['ok', 'pool_saturated', 'connection_failed', 'query_failed', 'configuration_failed'],
  })
  reason!: string;

  @ApiProperty({ type: DatabasePoolResponse })
  pool!: DatabasePoolResponse;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Probe latency in milliseconds, or null when the probe failed.',
  })
  latencyMs!: number | null;
}

export class HealthStatusResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['api'] })
  service!: 'api';

  @ApiProperty({ description: 'Process uptime in whole seconds.' })
  uptimeSeconds!: number;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

export class ReadinessStatusResponse {
  @ApiProperty({ enum: ['ready', 'not_ready'] })
  status!: 'ready' | 'not_ready';

  @ApiProperty({ enum: ['api'] })
  service!: 'api';

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ type: DatabaseHealthResponse })
  database!: DatabaseHealthResponse;
}
