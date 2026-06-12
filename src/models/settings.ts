import { z } from 'zod';

export const SettingsSchema = z.object({
  businessName: z.string().default(''),
  businessDescription: z.string().default(''),
  replyTone: z.string().default('Professional'),
  customInstructions: z.string().default(''),
  manualApproval: z.boolean().default(true),
  autoPost: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  openAiApiKey: z.string().default(''),
  reviewsPageUrl: z.string().default(''),
  profileUrl: z.string().default(''),
  googleAccountEmail: z.string().default(''),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
