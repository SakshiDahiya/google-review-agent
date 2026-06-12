import { Page } from 'playwright';
import { Logger } from 'winston';
import { SELECTORS } from './selectors';

export const DEFAULT_ROWS_PER_PAGE = 50;
export const MAX_REVIEW_PAGES = 100;

export async function waitForReviewCards(
  page: Page,
  logger?: Logger,
  timeoutMs = 30_000
): Promise<void> {
  const cardSelector = SELECTORS.reviewCard.join(', ');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const count = await page.locator(cardSelector).count().catch(() => 0);
    if (count > 0) {
      logger?.info('GBP reviews manager loaded', { url: page.url(), cards: count });
      await page.waitForTimeout(1500);
      return;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(
    'Reviews page did not load. Expected business.google.com/reviews with review cards.\n' +
      '  Sign in with the correct Google account and try again.'
  );
}

export async function setRowsPerPage(page: Page, count: number, logger?: Logger): Promise<void> {
  const selected = page.locator(`${SELECTORS.rowsPerPage(count)}[aria-selected="true"]`);
  if ((await selected.count()) > 0) return;

  const open = page.locator(SELECTORS.rowsPerPageOpen).first();
  if ((await open.count()) === 0) return;

  await open.click();
  await page.waitForTimeout(500);

  const option = page.locator(SELECTORS.rowsPerPage(count)).first();
  if ((await option.count()) === 0) return;

  await option.click();
  await page.waitForTimeout(2000);
  logger?.info('Set reviews per page', { count });
}

export async function applyNotRepliedFilter(page: Page, logger?: Logger): Promise<boolean> {
  for (const selector of SELECTORS.notRepliedFilter) {
    const tab = page.locator(selector).first();
    if ((await tab.count()) > 0 && (await tab.isVisible().catch(() => false))) {
      await tab.click();
      await page.waitForTimeout(1500);
      logger?.info('Filtered to "Not replied" reviews');
      return true;
    }
  }
  return false;
}

export async function goToNextPage(page: Page): Promise<boolean> {
  const next = page.getByRole('button', { name: /next/i });
  if ((await next.count()) === 0 || !(await next.isEnabled())) return false;
  await next.click();
  await page.waitForTimeout(2000);
  return true;
}
