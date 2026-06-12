import { z } from 'zod';

export function hasReviewText(review: { reviewText?: string }): boolean {
  return !!getCustomerReviewText(review).trim();
}

export function isStarOnlyReview(review: { reviewText?: string }): boolean {
  return !hasReviewText(review);
}

const EMBEDDED_OWNER_REPLY =
  /\s+(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|a\s+year\s+ago|yesterday|today)\s+(?:Hi\s|Thank\s)/i;

/** GBP manager embeds owner replies after the customer text (with or without an "(owner)" label). */
export function hasOwnerReply(review: {
  reviewText?: string;
  ownerReply?: string;
}): boolean {
  if (review.ownerReply?.trim()) return true;
  const text = review.reviewText ?? '';
  if (/\s*\(owner\)\s+/i.test(text)) return true;
  return EMBEDDED_OWNER_REPLY.test(text);
}

function stripEditDelete(text: string): string {
  return text.replace(/\s*Edit\s*Delete\s*$/i, '').trim();
}

export function splitCustomerAndOwnerText(reviewText: string): {
  customerText: string;
  ownerReply?: string;
} {
  const cleaned = reviewText
    .replace(/\s*…?\s*More$/i, '')
    .replace(/\s*Reply\s*$/i, '')
    .trim();

  const ownerMarker = cleaned.match(/^([\s\S]*?)\s*\(owner\)\s+([\s\S]+)$/i);
  if (ownerMarker) {
    return {
      customerText: ownerMarker[1].trim(),
      ownerReply: stripEditDelete(ownerMarker[2]) || undefined,
    };
  }

  const embedded = cleaned.match(
    /^([\s\S]*?)\s+(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|a\s+year\s+ago|yesterday|today)\s+((?:Hi|Thank)[\s\S]+)$/i
  );
  if (embedded) {
    const customerText = embedded[1].trim();
    const ownerReply = stripEditDelete(`${embedded[2]} ${embedded[3]}`);
    if (customerText.length > 0 && ownerReply.length > 15) {
      return { customerText, ownerReply };
    }
  }

  return { customerText: cleaned };
}

export function getCustomerReviewText(review: {
  reviewText?: string;
  ownerReply?: string;
}): string {
  if (review.ownerReply?.trim() && !/\s*\(owner\)\s+/i.test(review.reviewText ?? '')) {
    return review.reviewText?.trim() ?? '';
  }
  return splitCustomerAndOwnerText(review.reviewText ?? '').customerText;
}

export const ReviewRecordSchema = z.object({
  reviewId: z.string(),
  author: z.string(),
  rating: z.number().min(1).max(5),
  reviewText: z.string().default(''),
  reviewDate: z.string().optional(),
  ownerReply: z.string().optional(),
  generatedReply: z.string().default(''),
  approved: z.boolean().default(false),
  posted: z.boolean().default(false),
  processedAt: z.string().optional(),
});

export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

export const ReviewsDataSchema = z.object({
  fetchedAt: z.string(),
  businessName: z.string().optional(),
  fullFetchCompleted: z.boolean().optional(),
  reviews: z.array(ReviewRecordSchema),
});

export type ReviewsData = z.infer<typeof ReviewsDataSchema>;

/** @deprecated Use ReviewRecord — kept as alias for minimal AI service churn */
export type Review = ReviewRecord;
