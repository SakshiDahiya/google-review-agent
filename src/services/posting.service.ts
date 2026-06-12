import ora from 'ora';
import chalk from 'chalk';
import { Page } from 'playwright';
import { BrowserManager } from '../automation/browser-manager';
import { ReplyPoster } from '../automation/reply-poster';
import { GeneratedReply } from '../models/generated-reply';
import { ReviewRecord } from '../models/review';
import { GeneratedRepliesRepository } from '../repositories/generated-replies.repository';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { Settings } from '../models/settings';
import { printReviewsWithReplies } from '../utils/review-display';
import { URLS } from '../automation/selectors';

export class PostingService {
  constructor(
    private readonly generatedRepliesRepository: GeneratedRepliesRepository,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly browserManager: BrowserManager,
    private readonly replyPoster: ReplyPoster
  ) {}

  async postSingleReply(
    reply: GeneratedReply,
    review: ReviewRecord,
    page: Page
  ): Promise<GeneratedReply> {
    const result = await this.replyPoster.postReply(
      page,
      reply.reviewId,
      reply.generatedReply,
      review.author,
      review.reviewDate
    );

    if (result.success) {
      return {
        ...reply,
        status: 'posted',
        postedAt: new Date().toISOString(),
      };
    }

    return { ...reply, status: 'failed', error: result.error };
  }

  async postReplies(
    settings: Settings,
    replies: GeneratedReply[],
    reviewRecords: ReviewRecord[]
  ): Promise<{ replies: GeneratedReply[]; reviews: ReviewRecord[] }> {
    const toPost = replies.filter((r) => r.status === 'approved');

    if (toPost.length === 0) {
      console.log(chalk.yellow('\nNo replies to post.\n'));
      return { replies, reviews: reviewRecords };
    }

    if (settings.dryRun) {
      return this.handleDryRun(toPost, replies, reviewRecords);
    }

    const spinner = ora(`Posting ${toPost.length} reply(ies) (headless)...`).start();
    const results: GeneratedReply[] = [...replies];
    let reviewState = [...reviewRecords];
    let posted = 0;

    await this.browserManager.withHeadlessPage(async (page) => {
      await page.goto(URLS.googleBusinessReviews, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      for (let i = 0; i < toPost.length; i++) {
        const reply = toPost[i];
        spinner.text = `Posting reply ${i + 1}/${toPost.length}...`;

        const review = reviewRecords.find((r) => r.reviewId === reply.reviewId);
        const result = await this.replyPoster.postReply(
          page,
          reply.reviewId,
          reply.generatedReply,
          review?.author,
          review?.reviewDate
        );

        const index = results.findIndex((r) => r.reviewId === reply.reviewId);

        if (result.success) {
          if (index !== -1) {
            results[index] = {
              ...reply,
              status: 'posted',
              postedAt: new Date().toISOString(),
            };
          }
          reviewState = reviewState.map((r) =>
            r.reviewId === reply.reviewId
              ? {
                  ...r,
                  posted: true,
                  approved: true,
                  generatedReply: reply.generatedReply,
                  processedAt: new Date().toISOString(),
                }
              : r
          );
          posted++;
        } else if (index !== -1) {
          results[index] = { ...reply, status: 'failed', error: result.error };
        }
      }
    });

    spinner.succeed(`Posted ${posted}/${toPost.length} reply(ies).`);
    this.generatedRepliesRepository.save(results);
    this.reviewsRepository.save(reviewState);

    return { replies: results, reviews: reviewState };
  }

  private handleDryRun(
    toPost: GeneratedReply[],
    replies: GeneratedReply[],
    reviewRecords: ReviewRecord[]
  ): { replies: GeneratedReply[]; reviews: ReviewRecord[] } {
    console.log(chalk.yellow.bold('\n  [DRY RUN] — Replies will NOT be posted'));
    printReviewsWithReplies('Reviews & Replies', toPost, reviewRecords);
    console.log(chalk.yellow('  [DRY RUN] Replies above would have been posted.\n'));

    const results = [...replies];
    let reviewState = [...reviewRecords];

    for (const reply of toPost) {

      const index = results.findIndex((r) => r.reviewId === reply.reviewId);
      if (index !== -1) {
        results[index] = { ...reply, status: 'approved' };
      }

      reviewState = reviewState.map((r) =>
        r.reviewId === reply.reviewId
          ? {
              ...r,
              generatedReply: reply.generatedReply,
              approved: true,
              processedAt: new Date().toISOString(),
            }
          : r
      );
    }

    this.generatedRepliesRepository.save(results);
    this.reviewsRepository.save(reviewState);

    return { replies: results, reviews: reviewState };
  }

  printPostingSummary(replies: GeneratedReply[], dryRun: boolean): void {
    const posted = replies.filter((r) => r.status === 'posted').length;
    const dryRunCount = replies.filter((r) => r.status === 'approved').length;
    const failed = replies.filter((r) => r.status === 'failed').length;
    const skipped = replies.filter((r) => r.status === 'rejected').length;

    console.log(chalk.cyan('\n  Results\n'));
    if (dryRun) {
      console.log(`  Dry run:  ${chalk.yellow(String(dryRunCount))} (would have posted)`);
    } else {
      console.log(`  Posted:   ${chalk.green(String(posted))}`);
    }
    console.log(`  Skipped:  ${chalk.yellow(String(skipped))}`);
    console.log(`  Failed:   ${chalk.red(String(failed))}`);
    console.log();
  }
}
