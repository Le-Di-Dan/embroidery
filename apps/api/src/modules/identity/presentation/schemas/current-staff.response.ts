import { ApiProperty } from '@nestjs/swagger';

/**
 * Documentation-only shape for the `data` payload of `GET /api/staff/me`
 * (APP1-B02). Swagger reflects runtime classes, not TypeScript interfaces, so
 * this decorated class gives the operation a named `CurrentStaffResponse`
 * component the generated client types against. It mirrors the application
 * `CurrentStaffView` exactly and adds no field — a drift test enforces that the
 * two never diverge.
 */
export class CurrentStaffResponse {
  @ApiProperty({
    format: 'uuid',
    description: 'The canonical admin account ID.',
  })
  id!: string;

  @ApiProperty({
    format: 'email',
    description: 'The stored normalized admin email.',
  })
  email!: string;

  @ApiProperty({
    description: 'The admin display name, shown in the Admin shell.',
  })
  displayName!: string;
}
