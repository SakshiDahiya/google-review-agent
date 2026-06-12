import chalk from 'chalk';
import { GeneratedReply } from '../models/generated-reply';
import { ReviewRecord } from '../models/review';

const STAR_DISPLAY: Record<number, string> = {
  1: '★☆☆☆☆',
  2: '★★☆☆☆',
  3: '★★★☆☆',
  4: '★★★★☆',
  5: '★★★★★',
};

export function printReviewsWithReplies(
  title: string,
  replies: GeneratedReply[],
  reviewRecords: ReviewRecord[] = []
): void {
  const reviewById = new Map(reviewRecords.map((review) => [review.reviewId, review]));

  console.log(chalk.cyan(`\n  ${title}\n`));

  for (const reply of replies) {
    const sourceReview = reviewById.get(reply.reviewId);
    const rating = sourceReview?.rating ?? parseInt(reply.starRating, 10);
    const stars = STAR_DISPLAY[rating] ?? reply.starRating;
    const reviewer = reply.reviewerName || sourceReview?.author || 'Anonymous';
    const comment = reply.originalComment?.trim() || sourceReview?.reviewText?.trim();

    console.log(chalk.bold(`  ${reviewer} ${stars}`));
    if (sourceReview?.reviewDate) {
      console.log(chalk.dim(`  Date: ${sourceReview.reviewDate}`));
    }
    console.log(
      chalk.dim(`  Review: ${comment || '(Star rating only — no written comment)'}`)
    );

    if (sourceReview?.ownerReply?.trim()) {
      console.log(chalk.dim(`  Existing reply: ${sourceReview.ownerReply.trim()}`));
    }

    if (reply.status === 'failed') {
      console.log(chalk.red(`  Error: ${reply.error}`));
    } else if (reply.generatedReply) {
      console.log(`  Reply: ${reply.generatedReply}`);
    }
    console.log();
  }
}

export type ReviewOutcome = 'posted' | 'dry_run' | 'failed' | 'skipped';

export function printReviewOutcome(
  review: ReviewRecord,
  reply: GeneratedReply,
  outcome: ReviewOutcome,
  index: number,
  total: number
): void {
  const stars = STAR_DISPLAY[review.rating] ?? String(review.rating);
  const comment = review.reviewText?.trim();

  console.log(chalk.cyan(`\n  ── Review ${index}/${total}: ${review.author} ${stars} ──`));
  if (review.reviewDate) {
    console.log(chalk.dim(`  Date: ${review.reviewDate}`));
  }
  console.log(
    chalk.dim(`  Review: ${comment || '(Star rating only — no written comment)'}`)
  );

  if (reply.generatedReply) {
    console.log(`  Reply: ${reply.generatedReply}`);
  }

  switch (outcome) {
    case 'posted':
      console.log(chalk.green('  ✓ Posted to Google'));
      break;
    case 'dry_run':
      console.log(chalk.yellow('  ○ Dry run — not posted'));
      break;
    case 'failed':
      console.log(chalk.red(`  ✗ Failed: ${reply.error ?? 'Unknown error'}`));
      break;
    case 'skipped':
      console.log(chalk.yellow('  ○ Skipped'));
      break;
  }
}
