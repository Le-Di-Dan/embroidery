/**
 * APP10-I01 — Storefront Zalo/Messenger simple external handoff.
 *
 * Design authority: FIG-APP10-I01-FOOTER-DESKTOP (842:3), -FOOTER-MOBILE
 * (842:48), -CTA-STATES (843:3), -HANDOFF-SPEC (843:44), approved under
 * FIG-APPROVAL-APP10-D01-PO-001.
 *
 * The component reads `process.env` at render time on purpose, so each case
 * sets the two values and renders the real shell — every assertion is about the
 * footer a customer actually gets, not about a resolver in isolation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { StorefrontShell } from '../../src/features/storefront-shell';

const ZALO_URL = 'https://zalo.me/xuong-theu-demo';
const MESSENGER_URL = 'https://m.me/xuong.theu.demo';
const GROUP_NAME = 'Kết nối';
const CAPTION = 'Mở ứng dụng bên ngoài';

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

function footerAnchors(): HTMLAnchorElement[] {
  return [...screen.getByRole('contentinfo').querySelectorAll('a')];
}

describe('APP10-I01 — both channels configured', () => {
  beforeEach(() => setConfig(ZALO_URL, MESSENGER_URL));

  it('renders the Zalo and Messenger CTAs on their configured URLs, in the approved order', () => {
    renderShell();
    const group = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(group).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(`Zalo ${CAPTION}`);
    expect(links[0]).toHaveAttribute('href', ZALO_URL);
    expect(links[1]).toHaveAccessibleName(`Messenger ${CAPTION}`);
    expect(links[1]).toHaveAttribute('href', MESSENGER_URL);
  });

  it('opens each channel as a secure external handoff, with the channel named in visible text', () => {
    renderShell();
    const group = screen.getByRole('region', { name: GROUP_NAME });
    for (const link of within(group).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      // Repository-standard attributes for a new browsing context.
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      // Visible channel text plus the visible external caption — never icon-only.
      expect(link.textContent).toMatch(/^(Zalo|Messenger)/);
      expect(link.textContent).toContain(CAPTION);
    }
    // The `↗` affordance is decorative and adds no noisy accessible text.
    const glyph = group.querySelector('.storefront-shell__footer-handoff-glyph');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
  });

  it('is a pair of links inside the footer flow, not an embedded chat surface', () => {
    renderShell();
    const footer = screen.getByRole('contentinfo');
    // No launcher, panel, composer or inbox affordance of any kind.
    expect(within(footer).queryAllByRole('button')).toHaveLength(0);
    expect(within(footer).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(footer).queryAllByRole('dialog')).toHaveLength(0);
    expect(footer.querySelector('iframe, script, embed, object')).toBeNull();
    // The group reflows in the footer; it is never a floating overlay.
    expect(footer.contains(screen.getByRole('region', { name: GROUP_NAME }))).toBe(true);
  });
});

describe('APP10-I01 — partial and absent configuration', () => {
  it('omits only the unconfigured channel, with no placeholder in its place', () => {
    setConfig(ZALO_URL, undefined);
    renderShell();
    const group = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(group).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(`Zalo ${CAPTION}`);
    expect(within(group).queryByText('Messenger')).toBeNull();
    // No dead or disabled stand-in for the missing channel.
    expect(group.querySelector('[aria-disabled], button, [disabled]')).toBeNull();
  });

  it('omits the whole group when neither channel is configured, leaving the pre-I01 footer', () => {
    setConfig(undefined, undefined);
    renderShell();
    expect(screen.queryByRole('region', { name: GROUP_NAME })).toBeNull();
    expect(screen.queryByText(GROUP_NAME)).toBeNull();
    const footer = screen.getByRole('contentinfo');
    // The approved APP1-S01A footer still renders in full.
    expect(within(footer).getByText('Studio thêu thủ công theo yêu cầu.')).toBeInTheDocument();
    expect(
      within(footer).getByText('© Xưởng Thêu · Studio thêu theo yêu cầu.'),
    ).toBeInTheDocument();
    expect(within(footer).getAllByRole('link')).toHaveLength(1);
  });

  it.each([
    ['blank', '   '],
    ['relative path', '/lien-he'],
    ['bare host', 'zalo.me/xuong-theu'],
    ['free text', 'hoi qua Zalo'],
    ['javascript scheme', 'javascript:void(0)'],
    ['data scheme', 'data:text/html,hi'],
    ['mailto scheme', 'mailto:hello@example.com'],
    ['embedded credentials', 'https://user:pass@zalo.me/xuong-theu'],
  ])('never renders a malformed Zalo value (%s)', (_label, malformed) => {
    setConfig(malformed, MESSENGER_URL);
    renderShell();
    const group = screen.getByRole('region', { name: GROUP_NAME });
    const links = within(group).getAllByRole('link');
    // The malformed channel is simply absent; the valid one is unaffected.
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', MESSENGER_URL);
    for (const anchor of footerAnchors()) {
      expect(anchor.getAttribute('href')).not.toBe(malformed.trim());
    }
  });

  it('shows a customer no configuration error and no dead href when both values are unusable', () => {
    setConfig('javascript:void(0)', 'not a url');
    renderShell();
    expect(screen.queryByRole('region', { name: GROUP_NAME })).toBeNull();
    for (const anchor of footerAnchors()) {
      const href = anchor.getAttribute('href') ?? '';
      expect(href).not.toBe('');
      expect(href).not.toBe('#');
      expect(href.startsWith('javascript:')).toBe(false);
    }
    expect(screen.queryByText(/NEXT_PUBLIC_/)).toBeNull();
  });
});

describe('APP10-I01 — security boundary of the handoff URL', () => {
  it('renders the configured URL unmutated: no token, id, or page state is appended', () => {
    setConfig(ZALO_URL, MESSENGER_URL);
    renderShell();
    const group = screen.getByRole('region', { name: GROUP_NAME });
    for (const link of within(group).getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      expect([ZALO_URL, MESSENGER_URL]).toContain(href);
      // Nothing is composed onto the operator's URL at all.
      expect(href).not.toContain('#');
      expect(href).not.toContain('?');
      expect(href).not.toContain(window.location.href);
    }
  });

  it('makes no network request and injects no provider script while rendering', () => {
    const original = globalThis.fetch;
    const fetchMock = jest.fn(() => {
      throw new Error('the footer handoff must never call out');
    });
    globalThis.fetch = fetchMock;
    try {
      setConfig(ZALO_URL, MESSENGER_URL);
      const { container } = renderShell();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(container.querySelector('script, iframe, embed, object')).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('APP10-I01 — source boundaries', () => {
  const featureDir = join(__dirname, '..', '..', 'src', 'features', 'storefront-shell');
  const sources = [
    join(featureDir, 'components', 'storefront-contact-handoff.tsx'),
    join(featureDir, 'model', 'contact-handoff.ts'),
    join(featureDir, 'components', 'storefront-footer.tsx'),
  ].map((path) => ({ path, text: readFileSync(path, 'utf8') }));

  it('imports no provider SDK, API client, or third-party package at all', () => {
    for (const { path, text } of sources) {
      const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        (match) => match[1] ?? '',
      );
      for (const specifier of specifiers) {
        expect({ path, specifier, relative: specifier.startsWith('.') }).toEqual({
          path,
          specifier,
          relative: true,
        });
      }
    }
  });

  it('hard-codes no provider URL and reaches no backend', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /https?:\/\//.test(text) }).toEqual({ path, hit: false });
      expect({ path, hit: /\bfetch\s*\(|axios|\/api\//.test(text) }).toEqual({ path, hit: false });
    }
  });
});
