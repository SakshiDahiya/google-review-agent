import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { BrowserManager } from '../automation/browser-manager';
import { ReviewScraper } from '../automation/review-scraper';
import {
  hasOwnerReply,
  hasReviewText,
  isStarOnlyReview,
  ReviewRecord,
  splitCustomerAndOwnerText,
} from '../models/review';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { ScrapeStats } from '../automation/review-scraper';
import { URLS } from '../automation/selectors';
import { isGbpReviewsManagerUrl } from '../utils/google-business-urls';

export const PREVIEW_REVIEW_COUNT = 3;

export interface FetchReviewsOptions {
  /** Re-scrape all pages from Google (first run or after business change). */
  force?: boolean;
  businessName?: string;
}

let lastScrapeStats: ScrapeStats | null = null;

export class ReviewService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly browserManager: BrowserManager,
    private readonly reviewScraper: ReviewScraper
  ) {}

  async fetchReviews(
    _reviewsPageUrl?: string,
    _profileUrl = '',
    options?: FetchReviewsOptions
  ): Promise<ReviewRecord[]> {
    const businessName = options?.businessName ?? '';
    const cached = this.reviewsRepository.getCachedReviews(businessName);

    if (!options?.force && cached) {
      const data = this.reviewsRepository.load();
      const fetchedAt = data?.fetchedAt
        ? new Date(data.fetchedAt).toLocaleString()
        : 'unknown';

      console.log(
        chalk.dim(
          `  Using cached reviews (${cached.length} total, last fetched ${fetchedAt})\n`
        )
      );

      return cached.map((r) => this.normalizeForProcessing(r));
    }

    return this.scrapeAll(businessName);
  }

  private async scrapeAll(businessName: string): Promise<ReviewRecord[]> {
    const targetUrl = URLS.googleBusinessReviews;
    console.log(chalk.dim(`  Fetching from:      ${targetUrl}\n`));

    const spinner = ora('Scraping reviews from Google Business (headless)...').start();

    try {
      const scraped = await this.runBrowserScrape(spinner);
      lastScrapeStats = scraped.stats;

      const merged = this.reviewsRepository
        .mergeWithExisting(scraped.reviews.map((r) => this.normalizeForProcessing(r)));
      this.reviewsRepository.save(merged, businessName, { fullFetchCompleted: true });

      if (merged.length === 0) {
        spinner.warn('No reviews found.');
      } else {
        const { starOnly, pagesScraped, withText } = scraped.stats;
        const detail =
          starOnly > 0
            ? ` (${withText} with text, ${starOnly} star-only, ${pagesScraped} pages)`
            : ` (${pagesScraped} pages)`;
        spinner.succeed(`Fetched ${merged.length} review(s)${detail}.`);
      }

      return merged;
    } catch (error) {
      spinner.fail('Failed to scrape reviews.');
      throw error;
    }
  }

  private async runBrowserScrape(spinner: Ora): Promise<{
    reviews: ReviewRecord[];
    stats: ScrapeStats;
  }> {
    return this.browserManager.withHeadlessPage(async (page) => {
      spinner.text = 'Loading GBP reviews manager...';
      await page.goto(URLS.googleBusinessReviews, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      const actualUrl = page.url();
      if (actualUrl.includes('accounts.google.com')) {
        throw new Error(
          'Google session expired. Run Switch Google Account to sign in again.'
        );
      }

      if (!isGbpReviewsManagerUrl(actualUrl)) {
        throw new Error(
          `Did not reach the GBP reviews manager.\n` +
            `  Got:   ${actualUrl}\n` +
            '  Sign in with the Google account that manages your business.'
        );
      }

      console.log(chalk.dim(`  Loaded page:        ${actualUrl}\n`));

      spinner.text = 'Extracting reviews...';
      return this.reviewScraper.scrapeReviews(page);
    });
  }

  getLatestReviews(reviews: ReviewRecord[], limit = 3): ReviewRecord[] {
    return reviews.slice(0, limit);
  }

  getUnrepliedReviews(reviews: ReviewRecord[]): ReviewRecord[] {
    return reviews.filter((review) => {
      if (hasOwnerReply(review)) return false;
      if (review.posted) return false;
      return true;
    });
  }

  normalizeForProcessing(review: ReviewRecord): ReviewRecord {
    const split = splitCustomerAndOwnerText(review.reviewText);

    return {
      ...review,
      reviewText: split.customerText,
      ownerReply: split.ownerReply || review.ownerReply,
    };
  }

  getReviewsNeedingGeneration(reviews: ReviewRecord[]): ReviewRecord[] {
    return this.getUnrepliedReviews(reviews).filter(
      (r) => !r.generatedReply?.trim()
    );
  }

  getReviewsForAutomation(reviews: ReviewRecord[]): {
    targets: ReviewRecord[];
    previewOnly: boolean;
  } {
    const unreplied = this.getUnrepliedReviews(reviews);
    if (unreplied.length > 0) {
      return { targets: unreplied, previewOnly: false };
    }

    if (reviews.length > 0) {
      return {
        targets: this.getLatestReviews(reviews, PREVIEW_REVIEW_COUNT),
        previewOnly: true,
      };
    }

    return { targets: [], previewOnly: false };
  }

  printReviewSummary(reviews: ReviewRecord[], unreplied: ReviewRecord[]): void {
    const withText = reviews.filter(hasReviewText);
    const starOnly = reviews.filter(isStarOnlyReview);
    const replied = reviews.length - unreplied.length;

    console.log(chalk.cyan('\n  Review Summary\n'));
    console.log(`  Total reviews:     ${reviews.length}`);
    if (withText.length > 0) {
      console.log(`  With written text: ${withText.length}`);
    }
    if (starOnly.length > 0) {
      console.log(`  Star-only:         ${starOnly.length}`);
    }
    if (lastScrapeStats && lastScrapeStats.pagesScraped > 0) {
      console.log(
        chalk.dim(`  (${lastScrapeStats.pagesScraped} page(s) scraped from Google)`)
      );
    }
    console.log(`  Already replied:   ${chalk.green(String(replied))}`);
    console.log(`  Need replies:      ${chalk.yellow(String(unreplied.length))}`);
    console.log();
  }

  markProcessed(reviews: ReviewRecord[], reviewId: string, updates: Partial<ReviewRecord>): ReviewRecord[] {
    return reviews.map((r) =>
      r.reviewId === reviewId
        ? { ...r, ...updates, processedAt: new Date().toISOString() }
        : r
    );
  }
}
