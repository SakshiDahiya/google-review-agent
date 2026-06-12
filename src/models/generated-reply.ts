import { z } from 'zod';

export const GeneratedReplySchema = z.object({
  reviewId: z.string(),
  reviewName: z.string(),
  reviewerName: z.string().optional(),
  starRating: z.string(),
  originalComment: z.string().optional(),
  generatedReply: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'posted', 'failed']),
  postedAt: z.string().optional(),
  error: z.string().optional(),
});

export type GeneratedReply = z.infer<typeof GeneratedReplySchema>;

export const GeneratedRepliesDataSchema = z.object({
  generatedAt: z.string(),
  replies: z.array(GeneratedReplySchema),
});

export type GeneratedRepliesData = z.infer<typeof GeneratedRepliesDataSchema>;
