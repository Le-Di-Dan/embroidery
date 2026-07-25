import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CurrentStaffResponse } from './current-staff.response';

/**
 * Guards the public current-staff contract on two fronts: the Swagger DTO the
 * OpenAPI client is typed against must expose exactly the three safe fields, and
 * the runtime mapper must build them explicitly rather than spreading the
 * resolved session (which carries the internal `sessionId`).
 */
describe('CurrentStaffResponse Swagger contract', () => {
  it('documents exactly id, email and displayName', () => {
    const properties = Reflect.getMetadata(
      'swagger/apiModelPropertiesArray',
      CurrentStaffResponse.prototype,
    ) as string[];
    // Swagger prefixes each property with ':'.
    const fields = properties.map((property) => property.replace(/^:/, '')).sort();
    expect(fields).toEqual(['displayName', 'email', 'id']);
  });
});

describe('GetCurrentStaffQuery mapping source', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'application', 'get-current-staff.query.ts'),
    'utf8',
  );

  it('maps fields explicitly and never spreads the resolved session', () => {
    expect(source).not.toMatch(/\.\.\.session/);
    expect(source).not.toMatch(/\.\.\.\w/);
    expect(source).toMatch(/id:\s*session\.adminId/);
    expect(source).toMatch(/email:\s*session\.email/);
    expect(source).toMatch(/displayName:\s*session\.displayName/);
  });
});
