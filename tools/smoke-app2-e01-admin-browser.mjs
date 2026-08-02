#!/usr/bin/env node
/**
 * `APP2-E01` journeys 1–5, 8 and 9 — the Admin half of the publication journey,
 * driven through the real production Admin behind an HTTPS gateway.
 *
 * Every mutation here happens the way an operator would do it: a real login
 * form, a real file input, real buttons, real confirmation dialogs. Nothing
 * calls an API directly and nothing writes to the database, because the point of
 * a cross-layer journey is that the layers really are connected — a harness that
 * inserts a `product_media` row proves only that the harness can insert rows.
 *
 * Selectors come from the application's own copy modules. No `data-testid` is
 * invented for this run.
 */
import { evidence, existingAssetIds, sql, waitFor } from './smoke-app2-e01-fixtures.mjs';

/** Copy the Admin really renders (apps/admin/src/features/**\/model). */
export const ADMIN_COPY = {
  // The login fields carry application-owned ids (staff-login-form.tsx
  // FIELD_IDS); addressing them directly is stabler than a label match that a
  // visibility toggle can widen, and invents nothing.
  login: { submit: 'Đăng nhập', email: '#staff-login-email', password: '#staff-login-password' },
  assets: {
    upload: 'Tải ảnh lên',
    inputLabel: 'Chọn ảnh sản phẩm để tải lên',
    // Selecting a file only stages it; the upload is a deliberate second act.
    startUpload: 'Bắt đầu tải lên',
    processing: 'Đang xử lý',
    accepted: 'Sẵn sàng',
  },
  products: { create: 'Tạo sản phẩm', submitDraft: 'Tạo bản nháp', save: 'Lưu thay đổi' },
  media: { pick: 'Chọn ảnh', confirm: 'Dùng ảnh đã chọn' },
  form: {
    name: 'Tên sản phẩm',
    description: 'Mô tả',
    category: 'Danh mục sản phẩm',
    price: 'Giá cơ bản',
  },
  publication: {
    fromDraft: 'Xuất bản',
    fromPublished: 'Quản lý xuất bản',
    publish: 'Xuất bản',
    unpublish: 'Gỡ xuất bản',
    ready: 'Sẵn sàng xuất bản',
    published: 'Sản phẩm đang được xuất bản',
    confirmTitle: 'Gỡ xuất bản sản phẩm?',
    keep: 'Giữ nguyên',
  },
};

/**
 * Journey 1 — authenticate through the real HTTPS gateway.
 *
 * No cookie is injected. The browser posts the login form, the production API
 * issues a `Secure`, `HttpOnly`, host-only `__Host-` cookie, and the browser
 * sends it back on the next navigation — which only works because the origin is
 * genuinely HTTPS. That round trip *is* the proof.
 */
export async function login(page, { baseUrl, email, password, record }) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  record('Admin login form served over HTTPS', page.url().startsWith('https://'), {
    url: page.url().replace(/\?.*$/, ''),
  });

  await page.locator(ADMIN_COPY.login.email).fill(email);
  await page.locator(ADMIN_COPY.login.password).fill(password);
  await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name.startsWith('__Host-'));
  record(
    'production staff session cookie is Secure, HttpOnly and host-only',
    {
      ok:
        session !== undefined &&
        session.secure === true &&
        session.httpOnly === true &&
        session.path === '/' &&
        session.sameSite === 'Strict',
    }.ok,
    {
      // The name and flags only. The value is never read, logged or stored.
      name: session?.name,
      secure: session?.secure,
      httpOnly: session?.httpOnly,
      sameSite: session?.sameSite,
    },
  );

  record('no credential appears in the resulting URL', !/password|email=/i.test(page.url()), {
    path: new URL(page.url()).pathname,
  });
  return page.url();
}

/** Journey 2 — upload the real image and let the production worker process it. */
export async function uploadAsset(page, { baseUrl, fixture, record }) {
  await page.goto(`${baseUrl}/assets`, { waitUntil: 'networkidle' });

  const before = existingAssetIds();
  await page.getByLabel(ADMIN_COPY.assets.inputLabel).setInputFiles(fixture.path);
  await page.getByRole('button', { name: ADMIN_COPY.assets.startUpload }).click();
  record(
    'the Admin reports the upload in progress from real transferred bytes',
    await page
      .getByText(/Đang tải lên|Đang xử lý/)
      .first()
      .isVisible()
      .catch(() => false),
    {},
  );

  const assetId = await waitFor(
    'the Asset row the upload creates',
    () => {
      // By difference, never "the newest row": picking the latest would pass
      // on a pre-existing Asset if the upload silently failed.
      const rows = sql('select id from assets');
      const all = rows === '' ? [] : rows.split('\n').map((line) => line.trim());
      const fresh = all.filter((id) => !before.has(id));
      return fresh.length === 1 ? fresh[0] : undefined;
    },
    { timeoutMs: 120_000 },
  );
  record(
    'exactly one Asset was created by the real multipart upload',
    {
      ok: Number(sql('select count(*) from assets')) === before.size + 1,
    }.ok,
    { assetId, existingBefore: before.size },
  );

  const stored = evidence.asset(assetId);
  record('the original object is stored privately', stored.hasStorageKey === true, {
    kind: stored.kind,
    classification: stored.classification,
  });

  // The worker must do this. Nothing here inserts a derivative row or object.
  const accepted = await waitFor(
    'the Asset to reach ACCEPTED through worker inspection',
    () => (evidence.asset(assetId).status === 'ACCEPTED' ? evidence.asset(assetId) : undefined),
    { timeoutMs: 240_000 },
  );
  record('Asset lifecycle reached ACCEPTED', accepted.status === 'ACCEPTED', accepted);

  const derivatives = evidence.derivatives(assetId);
  const thumbnail = derivatives.find((row) => row.kind === 'THUMBNAIL');
  const preview = derivatives.find((row) => row.kind === 'CATALOG_PREVIEW');
  record(
    'exactly one READY unwatermarked THUMBNAIL exists',
    {
      ok:
        derivatives.filter((row) => row.kind === 'THUMBNAIL').length === 1 &&
        thumbnail?.status === 'READY' &&
        thumbnail.watermarked === false &&
        thumbnail.hasObject === true,
    }.ok,
    thumbnail ?? { missing: true },
  );
  record(
    'exactly one READY unwatermarked CATALOG_PREVIEW exists',
    {
      ok:
        derivatives.filter((row) => row.kind === 'CATALOG_PREVIEW').length === 1 &&
        preview?.status === 'READY' &&
        preview.watermarked === false &&
        preview.hasObject === true,
    }.ok,
    preview ?? { missing: true },
  );
  record(
    'no watermarked preview was produced for a catalog asset',
    {
      ok: derivatives.every((row) => row.watermarked === false),
    }.ok,
    { kinds: derivatives.map((row) => row.kind) },
  );

  const attempts = evidence.jobAttempts();
  record(
    'the production worker recorded a successful attempt',
    {
      ok: attempts.length >= 1 && attempts.some((row) => row.outcome === 'SUCCEEDED'),
    }.ok,
    { attempts },
  );

  const inspection = evidence.outboxByType('asset.inspection.requested');
  record(
    'the inspection event was claimed and dispatched by the worker',
    {
      ok: (inspection.DISPATCHED ?? 0) >= 1,
    }.ok,
    inspection,
  );

  return assetId;
}

/** Journey 3 — create the Product draft through the real form. */
export async function createDraft(page, { baseUrl, name, description, record }) {
  await page.goto(`${baseUrl}/products`, { waitUntil: 'networkidle' });
  // The list renders the same create link twice — once in the header, once in
  // the empty state — so the locator must choose rather than assume one.
  await page.getByRole('link', { name: ADMIN_COPY.products.create }).first().click();
  await page.waitForURL('**/products/new');

  await page.getByLabel(ADMIN_COPY.form.name).fill(name);
  await page.getByLabel(ADMIN_COPY.form.description).fill(description);
  await page.getByLabel(ADMIN_COPY.form.category).selectOption('thu-bong');
  await page.getByRole('button', { name: ADMIN_COPY.products.submitDraft }).click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  const slug = sql(`select slug from products where name = '${name.replaceAll("'", "''")}'`);
  const product = evidence.product(slug);
  record(
    'one DRAFT Product was created with a server-owned slug',
    {
      ok: product?.status === 'DRAFT' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug),
    }.ok,
    { slug, status: product?.status },
  );
  record('the redirect reached the real Product detail route', /\/products\//.test(page.url()), {
    path: new URL(page.url()).pathname,
  });
  record(
    'no publication happened yet',
    evidence.outboxByType('product.published').PENDING === undefined,
    {
      published: evidence.outboxByType('product.published'),
    },
  );

  return { slug, productId: product?.id, updatedAt: product?.updatedAt };
}

/** Journey 4 — set a price and attach the Asset the journey itself produced. */
export async function completeDraft(page, { slug, price, record }) {
  const before = evidence.product(slug);

  await page.getByLabel(ADMIN_COPY.form.price).fill(String(price));
  await page.getByRole('button', { name: ADMIN_COPY.media.pick }).click();
  const dialog = page.getByRole('dialog');
  // One checkbox per eligible Asset, then a deliberate confirm: the picker
  // stages a selection rather than committing on click.
  await dialog.locator('input[type="checkbox"]').first().check();
  await dialog.getByRole('button', { name: ADMIN_COPY.media.confirm }).click();
  await page.getByRole('button', { name: ADMIN_COPY.products.save }).click();

  const media = await waitFor(
    'the saved Product media association',
    () => {
      const rows = evidence.productMedia(slug);
      return rows.length > 0 ? rows : undefined;
    },
    { timeoutMs: 60_000 },
  );
  const after = evidence.product(slug);

  record(
    'the selected Asset became the first ordered Product media',
    {
      ok: media.length >= 1 && media[0]?.role === 'THUMBNAIL' && media[0]?.order >= 0,
    }.ok,
    { media },
  );
  // numeric(14,2) comes back as '480000.00'; compare as a number.
  record('the price was saved through the Admin UI', Number(after?.price) === price, {
    price: after?.price,
  });
  record('the optimistic concurrency token advanced', after?.updatedAt !== before?.updatedAt, {});

  return after;
}

/** Journey 5 — readiness, then publish through the real confirmation. */
export async function publish(page, { baseUrl, productId, slug, record, label = 'publish' }) {
  await page.goto(`${baseUrl}/products/${productId}/publication`, { waitUntil: 'networkidle' });

  const readyVisible = await page
    .getByText(ADMIN_COPY.publication.ready)
    .isVisible()
    .catch(() => false);
  record(`${label}: readiness reports every canonical requirement satisfied`, readyVisible, {});

  const auditBefore = evidence.auditCount('product.published');
  await page.getByRole('button', { name: ADMIN_COPY.publication.publish }).first().click();

  const published = await waitFor(
    'the Product to reach PUBLISHED',
    () => (evidence.product(slug)?.status === 'PUBLISHED' ? evidence.product(slug) : undefined),
    { timeoutMs: 60_000 },
  );
  record(`${label}: DRAFT → PUBLISHED`, published.status === 'PUBLISHED', {
    status: published.status,
  });
  record(
    `${label}: one published Audit Event was appended`,
    {
      ok: evidence.auditCount('product.published') === auditBefore + 1,
    }.ok,
    {
      before: auditBefore,
      after: evidence.auditCount('product.published'),
      observedActions: evidence.auditActions(),
    },
  );
  record(
    `${label}: a product.published Outbox Event was appended`,
    {
      ok: Object.values(evidence.outboxByType('product.published')).reduce((a, b) => a + b, 0) >= 1,
    }.ok,
    evidence.outboxByType('product.published'),
  );
}

/** Journey 8 / 9 — unpublish through the real dialog. */
export async function unpublish(page, { baseUrl, productId, slug, record, label = 'unpublish' }) {
  await page.goto(`${baseUrl}/products/${productId}/publication`, { waitUntil: 'networkidle' });

  const auditBefore = evidence.auditCount('product.unpublished');
  await page.getByRole('button', { name: ADMIN_COPY.publication.unpublish }).first().click();
  // Destructive confirmation, so the approved handoff uses role=alertdialog.
  const dialog = page.getByRole('alertdialog');
  record(
    `${label}: the confirmation dialog states it is not a delete`,
    {
      ok: (await dialog.textContent())?.includes('không phải thao tác xoá') === true,
    }.ok,
    {},
  );
  await dialog.getByRole('button', { name: ADMIN_COPY.publication.unpublish }).click();

  const draft = await waitFor(
    'the Product to return to DRAFT',
    () => (evidence.product(slug)?.status === 'DRAFT' ? evidence.product(slug) : undefined),
    { timeoutMs: 60_000 },
  );
  record(`${label}: PUBLISHED → DRAFT`, draft.status === 'DRAFT', { status: draft.status });
  record(
    `${label}: one unpublished Audit Event was appended`,
    {
      ok: evidence.auditCount('product.unpublished') === auditBefore + 1,
    }.ok,
    { before: auditBefore, after: evidence.auditCount('product.unpublished') },
  );
  record(
    `${label}: authoring facts survived the transition`,
    {
      ok: evidence.productMedia(slug).length > 0 && draft.price !== '0',
    }.ok,
    { media: evidence.productMedia(slug).length, price: draft.price },
  );
}

/** §18 — an anonymous context must not reach a protected Admin route. */
export async function assertAnonymousProtection(browser, { baseUrl, record }) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/products`, { waitUntil: 'networkidle' });
  record('anonymous Admin access is still refused', /\/login/.test(page.url()), {
    path: new URL(page.url()).pathname,
  });
  await context.close();
}
