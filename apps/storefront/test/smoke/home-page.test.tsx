/**
 * @jest-environment node
 */
import HomePage, { dynamic, metadata } from '../../src/app/page';
import { HOMEPAGE_COPY } from '../../src/features/homepage';

/**
 * The `/` segment itself (`APP11-S01`).
 *
 * This file previously asserted the CP0 scaffold heading ("Embroidery Commerce
 * Storefront"). That string is what S01 removed, so the assertion could not
 * survive the checkpoint that replaced the placeholder — it is rewritten here
 * against the shipped Homepage rather than deleted, and the CP0 copy is now
 * proven *absent* by `test/boundary/homepage-source.test.ts` and by the
 * rendering tests in `test/components/homepage.test.tsx`.
 *
 * The segment is checked structurally rather than rendered: the Homepage
 * contains an async server component behind a `Suspense` boundary, which the
 * synchronous static renderer cannot resolve. Its composition is covered by the
 * component suite, which drives the real `HomepageScreen`.
 */
describe('storefront home page segment', () => {
  it('renders the Homepage screen and nothing else', () => {
    const element = HomePage();
    // The shared shell (root layout) owns the <main> landmark; the segment
    // contributes only its content into that slot (APP1-S01A §14).
    expect(typeof element.type).toBe('function');
    expect((element.type as { name: string }).name).toBe('HomepageScreen');
  });

  it('carries Homepage-specific metadata and no CP0 copy', () => {
    expect(metadata.title).toContain(HOMEPAGE_COPY.hero.heading);
    expect(metadata.description).toBe(HOMEPAGE_COPY.hero.lead);
    expect(JSON.stringify(metadata)).not.toMatch(/Embroidery Commerce Storefront|checkpoint/i);
  });

  it('is rendered per request, so an unpublished product cannot survive in a cache', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});
