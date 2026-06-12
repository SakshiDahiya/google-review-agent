import { Page } from 'playwright';
import { Logger } from 'winston';
import { SELECTORS } from './selectors';
import {
  applyNotRepliedFilter,
  DEFAULT_ROWS_PER_PAGE,
  goToNextPage,
  MAX_REVIEW_PAGES,
  setRowsPerPage,
  waitForReviewCards,
} from './review-pagination';

export interface PostReplyResult {
  success: boolean;
  error?: string;
}

export class ReplyPoster {
  private preparedPage: Page | null = null;

  constructor(private readonly logger: Logger) {}

  async postReply(
    page: Page,
    reviewId: string,
    replyText: string,
    author?: string,
    reviewDate?: string
  ): Promise<PostReplyResult> {
    try {
      if (!author?.trim()) {
        return { success: false, error: `Review ${reviewId} has no author name for lookup` };
      }

      await this.ensurePagePrepared(page);

      let pagesChecked = 0;
      while (pagesChecked < MAX_REVIEW_PAGES) {
        pagesChecked += 1;

        const result = await this.tryPostOnCurrentPage(page, reviewId, replyText, author, reviewDate);
        if (result) return result;

        const hasMore = await goToNextPage(page);
        if (!hasMore) break;

        this.logger.info('Review not on current page, checking next page', {
          author,
          reviewDate,
          page: pagesChecked + 1,
        });
      }

      return {
        success: false,
        error: `Review from ${author} not found after checking ${pagesChecked} page(s)`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to post reply', { reviewId, author, error: message });
      return { success: false, error: message };
    }
  }

  private async ensurePagePrepared(page: Page): Promise<void> {
    if (this.preparedPage === page) return;

    await waitForReviewCards(page, this.logger);
    await applyNotRepliedFilter(page, this.logger);
    await setRowsPerPage(page, DEFAULT_ROWS_PER_PAGE, this.logger);
    this.preparedPage = page;
  }

  private async tryPostOnCurrentPage(
    page: Page,
    reviewId: string,
    replyText: string,
    author: string,
    reviewDate?: string
  ): Promise<PostReplyResult | null> {
    const cardSelector = SELECTORS.reviewCard.join(', ');
    const cards = page.locator(cardSelector);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const cardText = await card.innerText().catch(() => '');
      if (!this.cardMatchesReview(cardText, author, reviewDate)) continue;

      await card.scrollIntoViewIfNeeded();

      const button = card.getByRole('button', { name: /reply/i });
      if ((await button.count()) === 0) {
        return { success: false, error: `Reply button not found for ${author}` };
      }

      await button.click();
      await page.waitForTimeout(800);

      const textarea = await this.findTextarea(page);
      if (!textarea) {
        return { success: false, error: 'Reply textarea not found' };
      }

      await textarea.fill(replyText);
      await page.waitForTimeout(400);

      const submitted = await this.clickSubmitButton(page);
      if (!submitted) {
        return { success: false, error: 'Submit button not found' };
      }

      for (const selector of SELECTORS.successIndicator) {
        const indicator = page.locator(selector).first();
        if ((await indicator.count()) > 0) {
          await indicator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
          break;
        }
      }

      await page.waitForTimeout(2000);
      this.logger.info('Reply posted', { reviewId, author, reviewDate });
      return { success: true };
    }

    return null;
  }

  private cardMatchesReview(cardText: string, author: string, reviewDate?: string): boolean {
    const lines = cardText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const reviewerLine = lines[0] || '';
    if (reviewerLine.toLowerCase() !== author.trim().toLowerCase()) {
      return false;
    }

    if (!reviewDate?.trim()) {
      return true;
    }

    const normalizedDate = reviewDate.trim();
    if (cardText.includes(normalizedDate)) {
      return true;
    }

    const metaLine = lines[1] || '';
    const metaWithoutStars = metaLine.replace(/[\uE000-\uF8FF\u2605\u2B50\uE838]/g, '').trim();
    return metaWithoutStars.includes(normalizedDate);
  }

  private async findTextarea(page: Page) {
    for (const selector of SELECTORS.replyTextarea) {
      const el = page.locator(selector).last();
      if (await el.isVisible().catch(() => false)) {
        return el;
      }
    }
    return null;
  }

  private async clickSubmitButton(page: Page): Promise<boolean> {
    const submit = page.getByRole('button', { name: /post reply/i });
    if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
      await submit.click();
      return true;
    }

    for (const selector of SELECTORS.submitButton) {
      const btn = page.locator(selector).last();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        return true;
      }
    }

    return false;
  }
}
