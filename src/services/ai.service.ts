import ora from 'ora';
import chalk from 'chalk';
import { OpenAIClient } from '../clients/openai.client';
import { Settings } from '../models/settings';
import { ReviewRecord } from '../models/review';
import { GeneratedReply } from '../models/generated-reply';
import { GeneratedRepliesRepository } from '../repositories/generated-replies.repository';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { printReviewsWithReplies } from '../utils/review-display';

export class AIService {
  constructor(
    private readonly generatedRepliesRepository: GeneratedRepliesRepository,
    private readonly reviewsRepository: ReviewsRepository
  ) {}

  async generatePreviewReplies(
    settings: Settings,
    reviews: ReviewRecord[]
  ): Promise<GeneratedReply[]> {
    if (reviews.length === 0) {
      return [];
    }

    const spinner = ora(`Generating preview replies for ${reviews.length} review(s)...`).start();
    const replies = await this.generateRepliesForReviews(settings, reviews, (current, total) => {
      spinner.text = `Generating preview ${current}/${total}...`;
    });
    const successCount = replies.filter((r) => r.status === 'pending').length;
    spinner.succeed(`Generated ${successCount}/${reviews.length} preview reply(ies).`);

    return replies;
  }

  async generateSingleReply(
    settings: Settings,
    review: ReviewRecord
  ): Promise<GeneratedReply> {
    const [reply] = await this.generateRepliesForReviews(settings, [review]);
    return reply;
  }

  async generateReplies(
    settings: Settings,
    reviewsToGenerate: ReviewRecord[],
    allReviews: ReviewRecord[]
  ): Promise<{ replies: GeneratedReply[]; reviews: ReviewRecord[] }> {
    if (reviewsToGenerate.length === 0) {
      return { replies: [], reviews: allReviews };
    }

    const spinner = ora(
      `Generating AI replies for ${reviewsToGenerate.length} review(s)...`
    ).start();
    const replies = await this.generateRepliesForReviews(
      settings,
      reviewsToGenerate,
      (current, total) => {
        spinner.text = `Generating reply ${current}/${total}...`;
      }
    );

    const updates = new Map(reviewsToGenerate.map((r) => [r.reviewId, { ...r }]));

    for (const reply of replies) {
      if (reply.status !== 'pending') continue;
      const existing = updates.get(reply.reviewId);
      if (existing) {
        updates.set(reply.reviewId, {
          ...existing,
          generatedReply: reply.generatedReply,
          processedAt: new Date().toISOString(),
        });
      }
    }

    const merged = allReviews.map((r) => updates.get(r.reviewId) ?? r);

    const successCount = replies.filter((r) => r.status === 'pending').length;
    spinner.succeed(`Generated ${successCount}/${reviewsToGenerate.length} reply(ies).`);

    this.generatedRepliesRepository.save(replies);
    this.reviewsRepository.applyReviewUpdates(
      [...updates.values()],
      settings.businessName
    );

    return { replies, reviews: merged };
  }

  private async generateRepliesForReviews(
    settings: Settings,
    reviews: ReviewRecord[],
    onProgress?: (current: number, total: number) => void
  ): Promise<GeneratedReply[]> {
    const client = new OpenAIClient(settings.openAiApiKey);
    const replies: GeneratedReply[] = [];

    for (let i = 0; i < reviews.length; i++) {
      const review = reviews[i];
      onProgress?.(i + 1, reviews.length);

      try {
        const generatedReply = await client.generateReviewReply(settings, review);
        replies.push({
          reviewId: review.reviewId,
          reviewName: review.reviewId,
          reviewerName: review.author,
          starRating: String(review.rating),
          originalComment: review.reviewText,
          generatedReply,
          status: 'pending',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        replies.push({
          reviewId: review.reviewId,
          reviewName: review.reviewId,
          reviewerName: review.author,
          starRating: String(review.rating),
          originalComment: review.reviewText,
          generatedReply: '',
          status: 'failed',
          error: message,
        });
      }
    }

    return replies;
  }

  printPreviewSummary(reviews: ReviewRecord[], replies: GeneratedReply[]): void {
    printReviewsWithReplies('Preview Replies', replies, reviews);
  }

  printGeneratedSummary(replies: GeneratedReply[], reviewRecords: ReviewRecord[] = []): void {
    printReviewsWithReplies('Generated Replies', replies, reviewRecords);
  }
}
