/**
 * @jest-environment node
 *
 * The four `APP11-S05` route segments and their public metadata.
 *
 * Metadata is asserted at the route rather than only at the helper, because the
 * defect this guards against — a page that forgets to request a canonical, or a
 * not-found branch that publishes one anyway — lives in the segment.
 */
import { notFound } from 'next/navigation';

import { generateMetadata as faqMetadata } from '../../src/app/cau-hoi-thuong-gap/page';
import { generateMetadata as localMetadata } from '../../src/app/cua-hang/page';
import { generateMetadata as serviceMetadata } from '../../src/app/dich-vu/page';
import {
  generateMetadata as policyMetadata,
  generateStaticParams,
} from '../../src/app/chinh-sach/[slug]/page';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const ORIGIN = 'https://shop.example.test';

beforeEach(() => {
  process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGIN;
  (notFound as unknown as jest.Mock).mockClear();
});

describe('the three singular content routes', () => {
  it.each([
    ['/dich-vu', serviceMetadata],
    ['/cau-hoi-thuong-gap', faqMetadata],
    ['/cua-hang', localMetadata],
  ])('%s publishes an absolute canonical and a public Open Graph block', (path, build) => {
    const metadata = build();

    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}${path}`);
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: `${ORIGIN}${path}`,
      locale: 'vi_VN',
    });
    expect(metadata.title).toEqual(expect.stringContaining('Nét Thêu'));
    expect(metadata.description).toEqual(expect.any(String));
  });

  it.each([
    ['/dich-vu', serviceMetadata],
    ['/cau-hoi-thuong-gap', faqMetadata],
    ['/cua-hang', localMetadata],
  ])('%s stays indexable — no robots directive is emitted', (_path, build) => {
    // The root layout declares none either, so absent is the indexable state.
    expect(build().robots).toBeUndefined();
  });

  it('invents no social image for a page that has no canonical one', () => {
    for (const build of [serviceMetadata, faqMetadata, localMetadata]) {
      expect(build().openGraph).not.toHaveProperty('images');
    }
  });
});

describe('the policy family', () => {
  it('pre-renders exactly the four concrete slugs, and no placeholder', () => {
    expect(generateStaticParams()).toEqual([
      { slug: 'giao-hang' },
      { slug: 'thanh-toan' },
      { slug: 'doi-tra' },
      { slug: 'bao-mat' },
    ]);
  });

  it.each(['giao-hang', 'thanh-toan', 'doi-tra', 'bao-mat'])(
    '/chinh-sach/%s publishes its own canonical and Open Graph block',
    async (slug) => {
      const metadata = await policyMetadata({ params: Promise.resolve({ slug }) });

      expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/chinh-sach/${slug}`);
      expect(metadata.openGraph).toMatchObject({ url: `${ORIGIN}/chinh-sach/${slug}` });
      expect(metadata.robots).toBeUndefined();
    },
  );

  it.each(['khong-ton-tai', '', 'constructor', '../bao-mat'])(
    'an unknown slug (%s) is a safe not-found with no canonical and no Open Graph',
    async (slug) => {
      await expect(policyMetadata({ params: Promise.resolve({ slug }) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(notFound).toHaveBeenCalled();
    },
  );

  it('never reflects the unknown slug back into a response', async () => {
    const slug = 'khong-ton-tai-<script>';

    await expect(policyMetadata({ params: Promise.resolve({ slug }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
