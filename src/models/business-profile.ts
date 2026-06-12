import { z } from 'zod';

export const BusinessProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  address: z.string().optional(),
  category: z.string().optional(),
  profileUrl: z.string().optional(),
  reviewsPageUrl: z.string().min(1),
});

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export interface BusinessOption {
  name: string;
  address?: string;
  profileUrl: string;
  reviewsPageUrl?: string;
}
