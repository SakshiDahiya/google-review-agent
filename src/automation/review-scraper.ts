import { createHash } from 'crypto';
import { Page } from 'playwright';
import { Logger } from 'winston';
import { ReviewRecord } from '../models/review';
import { SELECTORS } from './selectors';
import { scrapeReviews } from './browser-scripts.js';
import {
  DEFAULT_ROWS_PER_PAGE,
  goToNextPage,
  MAX_REVIEW_PAGES,
  setRowsPerPage,
  waitForReviewCards,
} from './review-pagination';

export interface ScrapeStats {
  pagesScraped: number;
  totalCards: number;
  withText: number;
  starOnly: number;
}

interface ScrapedReview {
  reviewId: string;
  author: string;
  rating: number;
  reviewText: string;
  reviewDate?: string;
  ownerReply?: string;
}

export class ReviewScraper {
  constructor(private readonly logger: Logger) {}

  async scrapeReviews(
    page: Page,
    options?: { unrepliedOnly?: boolean; maxPages?: number }
  ): Promise<{ reviews: ReviewRecord[]; stats: ScrapeStats }> {
    const unrepliedOnly = options?.unrepliedOnly ?? false;
    const maxPages = options?.maxPages ?? MAX_REVIEW_PAGES;

    await waitForReviewCards(page, this.logger);
    await setRowsPerPage(page, DEFAULT_ROWS_PER_PAGE, this.logger);

    const allScraped: ScrapedReview[] = [];
    const seenIds = new Set<string>();
    let pageNum = 0;

    while (pageNum < maxPages) {
      pageNum += 1;
      const scraped = await page.evaluate(scrapeReviews, {
        reviewCardSelector: SELECTORS.reviewCard[0],
        unrepliedOnly,
      });

      for (const review of scraped) {
        if (seenIds.has(review.reviewId)) continue;
        seenIds.add(review.reviewId);
        allScraped.push(review);
      }

      this.logger.info('Reviews scraped from page', {
        page: pageNum,
        count: scraped.length,
        total: allScraped.length,
      });

      const hasMore = await goToNextPage(page);
      if (!hasMore) break;
      await page.waitForTimeout(2000);
    }

    const unique = this.deduplicateScraped(allScraped);
    const withText = unique.filter((r) => r.reviewText.trim().length > 0);
    const starOnly = unique.length - withText.length;

    this.logger.info('Reviews scraped', {
      pages: pageNum,
      count: unique.length,
      withText: withText.length,
      starOnly,
      totalCards: unique.length,
    });

    const reviews = unique.map((r) => ({
      reviewId: r.reviewId,
      author: r.author,
      rating: r.rating,
      reviewText: r.reviewText,
      reviewDate: r.reviewDate,
      ownerReply: r.ownerReply,
      generatedReply: '',
      approved: false,
      posted: false,
    }));

    return {
      reviews,
      stats: {
        pagesScraped: pageNum,
        totalCards: unique.length,
        withText: withText.length,
        starOnly,
      },
    };
  }

  private deduplicateScraped(reviews: ScrapedReview[]): ScrapedReview[] {
    const seen = new Set<string>();
    const result: ScrapedReview[] = [];

    for (const review of reviews) {
      const hash = createHash('sha256')
        .update(`${review.author}|${review.reviewDate ?? ''}|${review.reviewText}|${review.rating}`)
        .digest('hex')
        .slice(0, 16);

      const id = review.reviewId || hash;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ ...review, reviewId: id });
    }

    return result;
  }
}
