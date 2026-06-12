import chalk from 'chalk';
import { Page } from 'playwright';
import { Container } from '../container';
import { GeneratedReply } from '../models/generated-reply';
import { ReviewRecord } from '../models/review';
import { printReviewOutcome, ReviewOutcome } from '../utils/review-display';
import { URLS } from '../automation/selectors';

export class WorkflowService {
  constructor(private readonly container: Container) {}

  async runAutomation(options?: { forceBusinessPick?: boolean }): Promise<void> {
    const {
      configService,
      sessionService,
      reviewService,
      aiService,
      approvalService,
      postingService,
      browserManager,
      generatedRepliesRepository,
      reviewsRepository,
      logger,
    } = this.container;

    let settings = await configService.ensureOpenAiApiKey();

    if (settings.dryRun) {
      console.log(chalk.yellow('  Dry run mode is ON — replies will not be posted.\n'));
    } else {
      console.log(chalk.green('  Live mode — replies will be posted to Google.\n'));
    }

    try {
      settings = await sessionService.ensureSession(settings, {
        ...options,
        headlessOnly: true,
      });

      console.log(
        chalk.cyan(`\n  Processing reviews for: ${chalk.bold(settings.businessName)}\n`)
      );

      let reviews = await reviewService.fetchReviews(
        settings.reviewsPageUrl,
        settings.profileUrl,
        { businessName: settings.businessName }
      );
      const unreplied = reviewService.getUnrepliedReviews(reviews);
      const { targets, previewOnly } = reviewService.getReviewsForAutomation(reviews);

      reviewService.printReviewSummary(reviews, unreplied);

      if (targets.length === 0) {
        console.log(chalk.yellow('\n  No reviews found to process.\n'));
        console.log(
          chalk.dim(
            '  Try signing in with the correct Google account, or run Change Business.\n'
          )
        );
        return;
      }

      if (previewOnly) {
        console.log(
          chalk.yellow(
            `All reviews already have owner replies — previewing latest ${targets.length} review(s).\n`
          )
        );

        const previews = await aiService.generatePreviewReplies(settings, targets);
        aiService.printPreviewSummary(targets, previews);

        logger.info('Automation preview completed', {
          business: settings.businessName,
          totalReviews: reviews.length,
          previewCount: targets.length,
          dryRun: settings.dryRun,
        });
        return;
      }

      const toProcess = unreplied.filter((r) => !r.posted);
      const shouldApprove = settings.manualApproval && !settings.autoPost;

      console.log(
        chalk.cyan(`\n  Processing ${toProcess.length} review(s) one by one...\n`)
      );

      const stats = { posted: 0, dryRun: 0, failed: 0, skipped: 0 };
      const allReplies: GeneratedReply[] = [];

      const processReviews = async (page?: Page) => {
        for (let i = 0; i < toProcess.length; i++) {
          const review = toProcess[i];
          const index = i + 1;

          let reply: GeneratedReply;
          if (review.generatedReply?.trim()) {
            reply = {
              reviewId: review.reviewId,
              reviewName: review.reviewId,
              reviewerName: review.author,
              starRating: String(review.rating),
              originalComment: review.reviewText,
              generatedReply: review.generatedReply,
              status: 'pending',
            };
          } else {
            console.log(chalk.dim(`  Generating reply for ${review.author}...`));
            reply = await aiService.generateSingleReply(settings, review);
          }

          if (reply.status === 'failed') {
            stats.failed++;
            printReviewOutcome(review, reply, 'failed', index, toProcess.length);
            generatedRepliesRepository.upsertReply(reply);
            allReplies.push(reply);
            continue;
          }

          const [decided] = shouldApprove
            ? await approvalService.approveReplies([reply])
            : approvalService.autoApprove([reply]);

          if (decided.status !== 'approved') {
            stats.skipped++;
            printReviewOutcome(review, decided, 'skipped', index, toProcess.length);
            generatedRepliesRepository.upsertReply(decided);
            allReplies.push(decided);
            continue;
          }

          let outcome: ReviewOutcome;
          let finalReply = decided;
          let updatedReview: ReviewRecord = {
            ...review,
            generatedReply: decided.generatedReply,
            approved: true,
            processedAt: new Date().toISOString(),
          };

          if (settings.dryRun) {
            outcome = 'dry_run';
            stats.dryRun++;
          } else if (!page) {
            finalReply = { ...decided, status: 'failed', error: 'Browser not available' };
            outcome = 'failed';
            stats.failed++;
          } else {
            finalReply = await postingService.postSingleReply(decided, review, page);
            if (finalReply.status === 'posted') {
              outcome = 'posted';
              stats.posted++;
              updatedReview = { ...updatedReview, posted: true };
            } else {
              outcome = 'failed';
              stats.failed++;
            }
          }

          printReviewOutcome(review, finalReply, outcome, index, toProcess.length);

          generatedRepliesRepository.upsertReply(finalReply);
          reviewsRepository.applyReviewUpdates([updatedReview], settings.businessName);
          reviews = reviews.map((r) =>
            r.reviewId === review.reviewId ? updatedReview : r
          );
          allReplies.push(finalReply);
        }
      };

      if (!settings.dryRun && toProcess.length > 0) {
        await browserManager.withHeadlessPage(async (page) => {
          await page.goto(URLS.googleBusinessReviews, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
          await page.waitForTimeout(3000);
          await processReviews(page);
        });
      } else {
        await processReviews();
      }

      postingService.printPostingSummary(allReplies, settings.dryRun);

      logger.info('Automation run completed', {
        business: settings.businessName,
        totalReviews: reviews.length,
        unreplied: unreplied.length,
        dryRun: settings.dryRun,
        posted: stats.posted,
        failed: stats.failed,
        skipped: stats.skipped,
      });
    } finally {
      await sessionService.closeBrowser();
    }
  }
}
