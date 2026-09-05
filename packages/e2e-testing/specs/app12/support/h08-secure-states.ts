/**
 * The customer's secure order surface, watched across the states an operator
 * moves it through.
 *
 * `APP12-H08` §6 asks for representative order states rather than eight
 * journeys, and this is what makes that cheap: the customer's screen only moves
 * when an operator writes, so each state is reached by **coming back to the same
 * tab** after a write the Admin journey already performs.
 *
 * ## One tab, refreshed — not four fresh contexts
 *
 * An earlier revision opened a new context and a new `ORDER_ACCESS` bootstrap for
 * every state. It read better and it was wrong twice over. It is not what a
 * customer does — they keep the tab open and come back — and it spends a
 * **secure-link resolution** per look, which the delivered limiter counts by
 * request rather than by outcome. Four extra bootstraps in a couple of minutes
 * exhausted the budget, and the final state's audit failed on a limiter the
 * application was right to apply.
 *
 * So the credential is resolved **once** and every later state is read through
 * the delivered refresh path — the same one `APP12-S03`'s own journeys use, and
 * the same one a returning customer triggers. A reload would lose the credential
 * by design (`APP12-S03` §34), which is precisely why the refresh path exists.
 *
 * ## Nothing secret crosses this boundary
 *
 * `openSecureOrder` handles the credential entirely and strips the fragment
 * before it returns. Nothing here returns, logs or asserts on it; the only value
 * that leaves is the status pill's own approved text.
 *
 * Test-only.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { storefrontOrigin } from './a02-world';
import { openSecureOrder, refreshUntilVisible, statusPill } from './s03-world';
import { expectNoSeriousViolations, expectShellLandmarks, record } from './h08-world';

export interface SecureOrderWatch {
  /**
   * Waits for the surface to reach `expectedPill`, then audits it.
   *
   * The pill is waited for rather than assumed, because the operator's write and
   * the customer's next read are two different requests and the second can win
   * the race. Returns the pill text so the caller records the state it actually
   * saw rather than the one it expected.
   */
  readonly audit: (label: string, expectedPill: string) => Promise<string>;
  readonly close: () => Promise<void>;
}

/**
 * Resolves the credential once and hands back a handle that can be audited
 * repeatedly as the order moves.
 */
export async function watchSecureOrder(browser: Browser): Promise<SecureOrderWatch> {
  const context: BrowserContext = await browser.newContext({
    baseURL: storefrontOrigin(),
    viewport: { width: 1440, height: 900 },
  });
  const page: Page = await context.newPage();
  await openSecureOrder(page);

  return {
    audit: async (label, expectedPill) => {
      await refreshUntilVisible(page, statusPill(page, expectedPill));

      const pill = await page.evaluate(() => {
        const element = document.querySelector('.secure-order__pill');
        const symbol = element?.querySelector('[aria-hidden="true"]');
        return {
          text: (element?.textContent ?? '').trim(),
          symbol: (symbol?.textContent ?? '').trim(),
        };
      });
      record(`secure.${label}.pill`, pill.text);
      // §6 — status meaning is never colour alone, in every state rather than
      // only in the one the surface happens to open in.
      expect(
        pill.text.replace(pill.symbol, '').trim(),
        `${label}: the state is named in words, not only in a colour and a glyph`,
      ).not.toBe('');

      await expectShellLandmarks(page, `secure-${label}`);
      await expectNoSeriousViolations(page, `secure-${label}`);
      return pill.text;
    },
    close: async () => {
      await context.close();
    },
  };
}
