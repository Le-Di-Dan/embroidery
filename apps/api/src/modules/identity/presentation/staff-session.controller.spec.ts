import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Boundary guard (APP1-B01-C1): the staff-session controller must not perform
 * field validation itself — that is owned by the global Zod pipe. A regression
 * that reintroduced a manual parser here would defeat the canonical pipeline.
 */
describe('StaffSessionController source boundary', () => {
  const source = readFileSync(join(__dirname, 'staff-session.controller.ts'), 'utf8');

  it('does not manually invoke a parser or schema', () => {
    expect(source).not.toMatch(/parseStaffLogin/);
    expect(source).not.toMatch(/\.safeParse\(/);
    expect(source).not.toMatch(/\.parse\(/);
  });

  it('receives the validated DTO type on the login body', () => {
    expect(source).toMatch(/@Body\(\)\s*body:\s*StaffLoginRequestDto/);
  });
});
