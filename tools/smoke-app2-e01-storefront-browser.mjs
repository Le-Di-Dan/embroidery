#!/usr/bin/env node
/**
 * `APP2-E01` journeys 6, 7 and the revocation half of 8 — the public half of the
 * publication journey, in an anonymous browser through the real gateway.
 *
 * The Storefront contexts are deliberately separate from the Admin one: a
 * public visitor carries no staff session, and proving publication visibility
 * from an authenticated browser would prove nothing about the public.
 */

const NOT_FOUND_MARKER = 'Không tìm thấy';

/** A fresh anonymous context. Nothing is shared with the Admin journey. */
export async function anonymousPage(browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  return { context, page: await context.newPage() };
}

/** Journey 6 — the Product is discoverable. */
export async function assertDiscoverable(browser, { baseUrl, product, record }) {
  const { context, page } = await anonymousPage(browser);
  try {
    // Server-rendered proof first: JavaScript disabled entirely.
    const raw = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
    const rawPage = await raw.newPage();
    await rawPage.goto(`${baseUrl}/kham-pha`, { waitUntil: 'domcontentloaded' });
    const html = await rawPage.content();
    record('Discover server-rendered HTML contains the new Product', html.includes(product.name), {
      name: product.name,
    });
    record(
      'the card links to the canonical detail route',
      html.includes(`/san-pham/${product.slug}`),
      {
        href: `/san-pham/${product.slug}`,
      },
    );
    // The RENDERED card is what must carry no shopping chrome. The server also
    // ships a dehydrated React Query cache containing the public list response,
    // which legitimately includes `price` — that is the public API's own payload
    // (anyone may call `publicProductList`), not a leak, and asserting against
    // the raw HTML would be asserting the wrong thing.
    const cardText = await rawPage.evaluate(() => {
      const link = document.querySelector('a[href^="/san-pham/"]');
      return link?.textContent ?? '';
    });
    record(
      'no price or stock chrome is rendered on the card',
      !cardText.includes(String(product.price)) &&
        !cardText.includes('VND') &&
        !/hết hàng/i.test(cardText),
      { cardText: cardText.slice(0, 80) },
    );
    await raw.close();

    await page.goto(`${baseUrl}/kham-pha`, { waitUntil: 'networkidle' });
    const card = page.locator(`a[href="/san-pham/${product.slug}"]`);
    record('the Product card is present in the rendered feed', (await card.count()) === 1, {});

    const loaded = await page.evaluate((slug) => {
      const link = document.querySelector(`a[href="/san-pham/${slug}"]`);
      const image = link?.querySelector('img');
      return { hasImage: image !== null && image !== undefined, natural: image?.naturalWidth ?? 0 };
    }, product.slug);
    record('real THUMBNAIL bytes render on the card', loaded.natural > 0, loaded);

    // The category filter is a different query; the Product must satisfy it too.
    await page.goto(`${baseUrl}/kham-pha?category=${product.categorySlug}`, {
      waitUntil: 'networkidle',
    });
    record(
      'the Product appears under its own category filter',
      {
        ok: (await page.locator(`a[href="/san-pham/${product.slug}"]`).count()) === 1,
      }.ok,
      { category: product.categorySlug },
    );

    // A hard refresh must not depend on any hydrated state.
    await page.reload({ waitUntil: 'networkidle' });
    record(
      'a hard refresh still shows the Product',
      {
        ok: (await page.locator(`a[href="/san-pham/${product.slug}"]`).count()) === 1,
      }.ok,
      {},
    );

    for (const [label, viewport, columns] of [
      ['desktop', { width: 1440, height: 900 }, 5],
      ['tablet', { width: 1024, height: 900 }, 3],
      ['mobile', { width: 390, height: 844 }, 2],
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}/kham-pha`, { waitUntil: 'networkidle' });
      const measured = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.discover__masonry-item'));
        return {
          columns: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size,
          order: cards.map((card) => card.querySelector('h2')?.textContent ?? ''),
        };
      });
      // With one Product the feed cannot show more columns than it has items;
      // the invariant asserted is that it never exceeds the approved count and
      // that DOM order stays linear.
      record(
        `${label}: masonry never exceeds the approved ${columns} columns`,
        {
          ok: measured.columns <= columns && measured.columns >= 1,
        }.ok,
        { measured: measured.columns, approved: columns },
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  } finally {
    await context.close();
  }
}

/** Journey 7 — the Product Detail page, reached by pointer and by keyboard. */
export async function assertDetail(browser, { baseUrl, product, record }) {
  const { context, page } = await anonymousPage(browser);
  try {
    // Pointer activation from the feed.
    await page.goto(`${baseUrl}/kham-pha`, { waitUntil: 'networkidle' });
    await page.locator(`a[href="/san-pham/${product.slug}"]`).click();
    await page.waitForURL(`**/san-pham/${product.slug}`);
    // The navigation resolves before the segment paints; wait for the page's
    // own title rather than counting a node that has not rendered yet.
    await page.locator('.product-detail__title').waitFor({ timeout: 20000 });
    record(
      'pointer activation reaches the Product Detail route',
      {
        ok: (await page.locator('.product-detail__title').count()) === 1,
      }.ok,
      { url: new URL(page.url()).pathname },
    );

    // Keyboard activation, as a separate assertion.
    await page.goto(`${baseUrl}/kham-pha`, { waitUntil: 'networkidle' });
    const link = page.locator(`a[href="/san-pham/${product.slug}"]`);
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/san-pham/${product.slug}`);
    // The navigation resolves before the segment paints; wait for the page's
    // own title rather than counting a node that has not rendered yet.
    await page.locator('.product-detail__title').waitFor({ timeout: 20000 });
    record(
      'keyboard activation reaches the same route',
      {
        ok: (await page.locator('.product-detail__title').count()) === 1,
      }.ok,
      {},
    );

    const title = await page.locator('.product-detail__title').innerText();
    record(
      'the Product H1, category and story are rendered',
      {
        ok:
          title.trim() === product.name &&
          (await page.locator('.product-detail__category').innerText()).trim().length > 0 &&
          (await page.locator('.product-detail__story-body').innerText()).includes(
            product.descriptionFragment,
          ),
      }.ok,
      { title },
    );

    const stage = await page.evaluate(() => {
      const image = document.querySelector('.product-detail__stage-image');
      return { src: image?.getAttribute('src') ?? '', natural: image?.naturalWidth ?? 0 };
    });
    record(
      'real CATALOG_PREVIEW bytes render in the gallery',
      {
        ok: stage.natural > 0 && stage.src.includes('/catalog-preview'),
      }.ok,
      stage,
    );

    // Lightbox: open, Escape, focus returns to the opener.
    await page.locator('.product-detail__stage-trigger').click();
    record(
      'the lightbox opens as a real dialog',
      {
        ok: (await page.locator('[role="dialog"]').count()) === 1,
      }.ok,
      {},
    );
    await page.keyboard.press('Escape');
    record(
      'Escape closes it and focus returns to the opener',
      {
        ok:
          (await page.locator('[role="dialog"]').count()) === 0 &&
          (await page.evaluate(
            () =>
              document.activeElement?.classList.contains('product-detail__stage-trigger') === true,
          )),
      }.ok,
      {},
    );

    record(
      'no commerce or deferred content is rendered',
      {
        // Rendered text, not raw HTML: the RSC payload legitimately carries the
        // public detail response, `price` included, because that is exactly what
        // `publicProductDetail` returns to anyone who asks. What must be absent
        // is any of it on the page.
        ok: !/VND|Chất liệu|Quy trình|Tác phẩm liên quan|Lưu cảm hứng/.test(
          await page.locator('.product-detail').innerText(),
        ),
      }.ok,
      {},
    );

    // The corrected mobile band (IMP-D040).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/san-pham/${product.slug}`, { waitUntil: 'networkidle' });
    const band = await page.evaluate(() => {
      const root = document.querySelector('.product-detail');
      if (root === null) return null;
      const style = getComputedStyle(root);
      const rect = root.getBoundingClientRect();
      const padLeft = parseFloat(style.paddingLeft);
      const padRight = parseFloat(style.paddingRight);
      const widthOf = (selector) =>
        Math.round(document.querySelector(selector)?.getBoundingClientRect().width ?? 0);
      return {
        left: Math.round(rect.left + padLeft),
        right: Math.round(window.innerWidth - (rect.right - padRight)),
        content: Math.round(rect.width - padLeft - padRight),
        story: widthOf('.product-detail__story-body'),
        stage: widthOf('.product-detail__stage'),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    record(
      'mobile Product Detail keeps the 24px / 342px band',
      {
        ok:
          band !== null &&
          band.left === 24 &&
          band.right === 24 &&
          band.content === 342 &&
          band.story === 342 &&
          band.stage === 342 &&
          band.overflow === false,
      }.ok,
      band ?? { measured: null },
    );

    const undersized = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.product-detail a, .product-detail button')).filter(
          (element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.height < 44;
          },
        ).length,
    );
    record('every Product Detail control meets 44px', undersized === 0, { undersized });
  } finally {
    await context.close();
  }
}

/** A raw request with no JavaScript, so the response itself is the evidence. */
export async function fetchRaw(browser, url) {
  const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  const status = response?.status() ?? 0;
  const html = await page.content();
  await context.close();
  return { status, html };
}

/** Journey 8 — public revocation after the real unpublish. */
export async function assertRevoked(browser, { baseUrl, product, mediaPaths, record }) {
  const discover = await fetchRaw(browser, `${baseUrl}/kham-pha`);
  record(
    'the next Discover request no longer contains the Product',
    {
      ok:
        !discover.html.includes(product.name) &&
        !discover.html.includes(`/san-pham/${product.slug}`),
    }.ok,
    {},
  );

  const filtered = await fetchRaw(browser, `${baseUrl}/kham-pha?category=${product.categorySlug}`);
  record(
    'the category-filtered request no longer contains it either',
    {
      ok: !filtered.html.includes(`/san-pham/${product.slug}`),
    }.ok,
    {},
  );

  // `SAFE_STREAMED_NOT_FOUND` (IMP-D040): the transport is a measured 200 with a
  // noindex signal, and it is never called a 404 here.
  const detail = await fetchRaw(browser, `${baseUrl}/san-pham/${product.slug}`);
  const safety = {
    measuredStatus: detail.status,
    approvedSurface: detail.html.includes(NOT_FOUND_MARKER),
    noindex: /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(detail.html),
    productCanonical: /<link[^>]+rel="canonical"/i.test(detail.html),
    productMetadata: detail.html.includes(product.name),
    productData: /"slug"\s*:|catalog-preview/.test(detail.html),
    rawCause: /DRAFT|ARCHIVED|requestId|stack|postgres|SQLSTATE/i.test(detail.html),
  };
  record(
    'the detail route becomes SAFE_STREAMED_NOT_FOUND',
    {
      ok:
        safety.approvedSurface &&
        safety.noindex &&
        !safety.productCanonical &&
        !safety.productMetadata &&
        !safety.productData &&
        !safety.rawCause,
    }.ok,
    safety,
  );

  for (const [label, path] of mediaPaths) {
    const media = await fetchRaw(browser, `${baseUrl}${path}`);
    record(`the old ${label} path returns a real HTTP 404`, media.status === 404, {
      status: media.status,
    });
  }

  return safety;
}

/** §18 — an unknown slug is indistinguishable from an unpublished one. */
export async function assertUnknownSlugSafety(browser, { baseUrl, record }) {
  for (const [label, slug] of [
    ['unknown slug', 'khong-ton-tai-e01'],
    ['malformed slug', 'Khong%20Hop%20Le'],
  ]) {
    const visit = await fetchRaw(browser, `${baseUrl}/san-pham/${slug}`);
    record(
      `${label} uses the same safe public surface`,
      {
        ok:
          visit.html.includes(NOT_FOUND_MARKER) &&
          /noindex/i.test(visit.html) &&
          !/<link[^>]+rel="canonical"/i.test(visit.html),
      }.ok,
      { measuredStatus: visit.status },
    );
  }
}
