import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { Settings } from '../models/settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { PREVIEW_REVIEW_COUNT, ReviewService } from './review.service';
import { AIService } from './ai.service';
import { OpenAIClient } from '../clients/openai.client';
import { Logger } from 'winston';

const SAVE_PATTERNS = /^(looks good|looks great|perfect|save|done|yes|ok|okay|good)$/i;
const SKIP_PATTERNS = /^skip$/i;

export class SetupWizardService {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly aiService: AIService,
    private readonly settingsRepository: SettingsRepository,
    private readonly logger: Logger
  ) {}

  async run(settings: Settings): Promise<Settings> {
    const businessLabel = settings.businessName || 'your business';

    console.log(chalk.cyan(`\n  Tune Reply Style — ${businessLabel}\n`));
    console.log(
      "  We'll show AI reply previews on your latest reviews.\n" +
        '  Tell us what to change in your own words — nothing gets posted.\n'
    );

    let reviews;
    try {
      reviews = await this.reviewService.fetchReviews(
        settings.reviewsPageUrl,
        settings.profileUrl,
        { businessName: settings.businessName }
      );
    } catch (error) {
      this.logger.warn('Setup wizard could not fetch reviews', {
        error: error instanceof Error ? error.message : String(error),
      });
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`\n  Could not load reviews: ${message}\n`));
      return settings;
    }

    const sampleReviews = this.reviewService.getLatestReviews(reviews, PREVIEW_REVIEW_COUNT);
    if (sampleReviews.length === 0) {
      console.log(chalk.yellow('  No reviews with text found to preview.\n'));
      return settings;
    }

    console.log(
      chalk.dim(`  Previewing on ${sampleReviews.length} recent review(s).\n`)
    );

    let current = { ...settings };

    while (true) {
      const previews = await this.aiService.generatePreviewReplies(current, sampleReviews);
      this.aiService.printPreviewSummary(sampleReviews, previews);
      this.printCurrentStyle(current);

      const { feedback } = await inquirer.prompt<{ feedback: string }>([
        {
          type: 'input',
          name: 'feedback',
          message:
            'What would you like to change? (leave blank to save, or type "skip" to exit without saving)',
        },
      ]);

      const trimmed = feedback.trim();

      if (!trimmed || SAVE_PATTERNS.test(trimmed)) {
        this.settingsRepository.save(current);
        console.log(chalk.green('\n✓ Reply style saved.\n'));
        return current;
      }

      if (SKIP_PATTERNS.test(trimmed)) {
        console.log(chalk.dim('\n  Exited without saving changes.\n'));
        return settings;
      }

      current = await this.applyFeedback(current, trimmed);
    }
  }

  private printCurrentStyle(settings: Settings): void {
    console.log(chalk.dim('  Current style'));
    console.log(chalk.dim(`    Tone:  ${settings.replyTone}`));
    if (settings.customInstructions) {
      console.log(chalk.dim(`    Rules: ${settings.customInstructions}`));
    }
    console.log();
  }

  private async applyFeedback(settings: Settings, feedback: string): Promise<Settings> {
    const spinner = ora('Applying your feedback...').start();

    try {
      const client = new OpenAIClient(settings.openAiApiKey);
      const refined = await client.refineReplyStyleFromFeedback(settings, feedback);

      spinner.succeed('Style updated.');
      console.log(chalk.cyan(`\n  ${refined.summary}`));
      console.log(chalk.dim(`  Tone:  ${refined.replyTone}`));
      if (refined.customInstructions) {
        console.log(chalk.dim(`  Rules: ${refined.customInstructions}`));
      }
      console.log(chalk.dim('\n  Regenerating previews...\n'));

      return {
        ...settings,
        replyTone: refined.replyTone,
        customInstructions: refined.customInstructions,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail('Could not apply feedback.');
      console.log(chalk.yellow(`  ${message}\n`));
      this.logger.warn('Failed to refine reply style from feedback', { error: message });
      return settings;
    }
  }
}
