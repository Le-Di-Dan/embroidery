import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRAND_DESCRIPTOR, BRAND_NAME } from './brand';
import { VI_MESSAGES } from './messages';

/**
 * The acceptance test for `APP12-V02-C1` §2, written the way §14 states it:
 * editing the JSON must change what the applications render.
 *
 * A test that asserted `BRAND_NAME === 'Nét Thêu'` would prove nothing — it
 * would be a second literal agreeing with a first, which is exactly the defect
 * the Product Owner rejected. So every assertion here reads the JSON file from
 * disk and compares the accessor against *it*.
 */
describe('brand text authority', () => {
  const raw = JSON.parse(readFileSync(join(__dirname, '../messages/vi/common.json'), 'utf8')) as {
    brand: { name: string; descriptor: string };
  };

  it('resolves the name from the canonical message repository', () => {
    expect(BRAND_NAME).toBe(raw.brand.name);
    expect(BRAND_NAME).toBe(VI_MESSAGES.common.brand.name);
  });

  it('resolves the descriptor from the same place', () => {
    expect(BRAND_DESCRIPTOR).toBe(raw.brand.descriptor);
    expect(BRAND_DESCRIPTOR).toBe(VI_MESSAGES.common.brand.descriptor);
  });

  it('owns no literal of its own', () => {
    // The source is read rather than reasoned about: the point of the
    // correction is that this file cannot become a second authority, and the
    // only way to state that is to look at what it contains.
    //
    // Comments are stripped first, and deliberately so. The module explains
    // *why* the name moved, and explaining it means naming it; what may not
    // come back is a literal the code reads.
    const source = readFileSync(join(__dirname, 'brand.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
    expect(code).not.toContain(raw.brand.name);
    expect(code).not.toContain(raw.brand.descriptor);
  });

  it('publishes a non-empty name, so a missing key cannot pass silently', () => {
    expect(BRAND_NAME.length).toBeGreaterThan(0);
    expect(BRAND_DESCRIPTOR.length).toBeGreaterThan(0);
  });
});
