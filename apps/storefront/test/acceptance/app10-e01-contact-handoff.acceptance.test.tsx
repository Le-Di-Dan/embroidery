/**
 * `APP10-E01` cases **E01-10** and **E01-11** — journey `J4-C2`/`J4-C3`, the
 * Storefront half.
 *
 * ### What this owns that `storefront-contact-handoff.test.tsx` does not
 *
 * The I01 suite is the checkpoint's own: it walks every malformed URL variant,
 * every partial configuration and the CTA's accessible name. E01 does not rerun
 * that. What it asserts instead are the two *phase-outcome* claims, which are
 * about the Storefront as a whole rather than about one component:
 *
 * 1. **Handoff only.** The capability is two anchors that leave the site. No
 *    provider SDK is loaded, no provider API is called, no widget is mounted, no
 *    conversation state exists — and, critically, **the Storefront gained no
 *    route**. A chat platform would need one; a handoff does not. The route count
 *    is measured from the App Router tree on disk, so a page added anywhere in
 *    the app fails this case, not just one added under a contact path.
 * 2. **Nothing customer-identifying is appended.** The configured URL reaches the
 *    DOM byte-for-byte, with no token, id, address or page state composed onto it.
 *
 * These render the real shell, so both are claims about the page a customer gets.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';

const ZALO_URL = 'https://zalo.me/xuong-theu-e01';
const MESSENGER_URL = 'https://m.me/xuong.theu.e01';
const GROUP_NAME = 'Kết nối';

/**
 * The App Router page count at `APP10-I01`, before and after the handoff.
 *
 * Twelve: `/`, `/kham-pha`, `/san-pham/[slug]`, `/san-pham/[slug]/thiet-ke`,
 * `/xac-minh-lien-he`, `/yeu-cau/moi`, `/yeu-cau/da-gui`, `/truy-cap`,
 * `/truy-cap/bao-gia`, `/truy-cap/duyet-thiet-ke`, `/truy-cap/thanh-toan` and
 * `/truy-cap/thanh-toan-con-lai`. The handoff added none of them and adds none.
 */
const STOREFRONT_ROUTE_COUNT = 12;

function setConfig(zalo: string | undefined, messenger: string | undefined) {
  if (zalo === undefined) {
    delete process.env.NEXT_PUBLIC_ZALO_CONTACT_URL;
  } else {
    process.env.NEXT_PUBLIC_ZALO_CONTACT_URL = zalo;
  }
  if (messenger === undefined) {
    delete process.env.NEXT_PUBLIC_MESSENGER_CONTACT_URL;
  } else {
    process.env.NEXT_PUBLIC_MESSENGER_CONTACT_URL = messenger;
  }
}

afterEach(() => setConfig(undefined, undefined));

function renderShell() {
  return renderWithProviders(
    <StorefrontShell>
      <h1>Trang mẫu</h1>
    </StorefrontShell>,
  );
}

/** Every `page.tsx` under the App Router tree. */
function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      routeFiles(path, found);
    } else if (entry === 'page.tsx') {
      found.push(path);
    }
  }
  return found;
}

describe('APP10-E01 · E01-10 · configured Zalo/Messenger stays an external handoff', () => {
  beforeEach(() => setConfig(ZALO_URL, MESSENGER_URL));

  it('renders both CTAs on the configured URLs and appends nothing to either', () => {
    renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(dock).getAllByRole('link');
    expect(links).toHaveLength(2);

    const hrefs = links.map((link) => link.getAttribute('href'));
    // Byte-for-byte the operator's configuration. Not a prefix of it, not a
    // normalized form of it, and nothing composed onto the end.
    expect(hrefs).toEqual([ZALO_URL, MESSENGER_URL]);

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      // External-handoff semantics: a new browsing context, and the opener is
      // severed so the provider tab cannot reach back into this one.
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      // No customer context of any kind rides along.
      expect(href).not.toContain('?');
      expect(href).not.toContain('#');
      for (const identifying of ['@', 'token', 'customer', 'order', 'grant', '+84']) {
        expect(href.toLowerCase()).not.toContain(identifying);
      }
    }
  });

  it('loads no provider script, mounts no widget, and adds no Storefront route', () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(() => {
      throw new Error('the contact handoff must never call a provider');
    });
    globalThis.fetch = fetchMock;
    try {
      const { container } = renderShell();

      // Nothing is fetched, injected or embedded. A launcher SDK would need all
      // three; two anchors need none.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(container.querySelector('script, iframe, embed, object')).toBeNull();

      // No conversation surface: no composer, no send control, no panel.
      const dock = screen.getByRole('region', { name: GROUP_NAME });
      expect(within(dock).queryAllByRole('button')).toHaveLength(0);
      expect(within(dock).queryAllByRole('textbox')).toHaveLength(0);
      expect(within(dock).queryAllByRole('dialog')).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // And the app itself gained no route. Measured from the tree on disk, so a
    // page added anywhere — not only under a contact path — fails this.
    const routes = routeFiles(join(__dirname, '..', '..', 'src', 'app'));
    expect(routes).toHaveLength(STOREFRONT_ROUTE_COUNT);

    // No route file mentions a provider: the handoff reaches no server of ours
    // and no server of theirs.
    for (const route of routes) {
      const text = readFileSync(route, 'utf8').toLowerCase();
      for (const provider of ['zalo', 'messenger', 'm.me', 'facebook']) {
        expect({ route, provider, hit: text.includes(provider) }).toEqual({
          route,
          provider,
          hit: false,
        });
      }
    }
  });
});

describe('APP10-E01 · E01-11 · missing or malformed configuration is safe', () => {
  it('omits the unusable channel, the whole group when none is usable, and never breaks the page', () => {
    // One usable, one unusable: only the unusable one disappears, and no
    // placeholder, disabled stand-in or dead link takes its place.
    setConfig('javascript:void(0)', MESSENGER_URL);
    const partial = renderShell();
    const dock = screen.getByRole('region', { name: GROUP_NAME });
    const partialLinks = within(dock).getAllByRole('link');
    expect(partialLinks).toHaveLength(1);
    expect(partialLinks[0]).toHaveAttribute('href', MESSENGER_URL);
    expect(dock.querySelector('[aria-disabled], button, [disabled]')).toBeNull();
    partial.unmount();

    // Neither usable: the whole group is absent and the page is its pre-I01
    // self. The customer is shown no configuration, no error and no empty box.
    setConfig(undefined, 'khong-phai-mot-url');
    const { container } = renderShell();
    expect(screen.queryByRole('region', { name: GROUP_NAME })).toBeNull();
    expect(screen.queryByText(GROUP_NAME)).toBeNull();
    expect(screen.queryByText(/NEXT_PUBLIC_/)).toBeNull();

    // The Storefront still works: the shell landmarks and the approved footer
    // are all present, and every remaining href is real.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('© Xưởng Thêu · Studio thêu theo yêu cầu.')).toBeInTheDocument();
    for (const anchor of container.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') ?? '';
      expect(href).not.toBe('');
      expect(href).not.toBe('#');
      expect(href.startsWith('javascript:')).toBe(false);
    }
  });
});
