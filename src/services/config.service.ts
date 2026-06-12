import inquirer from 'inquirer';
import chalk from 'chalk';
import { Settings, SettingsSchema, DEFAULT_SETTINGS } from '../models/settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { Paths } from '../utils/paths';

export class ConfigService {
  constructor(
    private readonly paths: Paths,
    private readonly settingsRepository: SettingsRepository
  ) {}

  isConfigured(): boolean {
    return this.resolveOpenAiApiKey(this.loadOrCreateSettings()) !== '';
  }

  loadSettings(): Settings {
    const settings = this.loadOrCreateSettings();
    const apiKey = this.resolveOpenAiApiKey(settings);

    if (!apiKey) {
      throw new Error('OpenAI API key not found. Update settings to add your API key.');
    }

    return { ...settings, openAiApiKey: apiKey };
  }

  loadOrCreateSettings(): Settings {
    this.paths.ensureDirectories();
    const existing = this.settingsRepository.load();
    if (existing) return existing;

    const settings = { ...DEFAULT_SETTINGS };
    this.settingsRepository.save(settings);
    return settings;
  }

  resolveOpenAiApiKey(settings: Settings): string {
    return settings.openAiApiKey.trim();
  }

  async ensureOpenAiApiKey(): Promise<Settings> {
    let settings = this.loadOrCreateSettings();
    let apiKey = this.resolveOpenAiApiKey(settings);

    if (!apiKey) {
      console.log(chalk.cyan('\n  OpenAI API Key Required\n'));
      const { openAiApiKey } = await inquirer.prompt<{ openAiApiKey: string }>([
        {
          type: 'password',
          name: 'openAiApiKey',
          message: 'OpenAI API key:',
          mask: '*',
          validate: (input: string) =>
            input.trim().length > 0 ? true : 'API key is required',
        },
      ]);
      apiKey = openAiApiKey.trim();
      settings = { ...settings, openAiApiKey: apiKey };
      this.settingsRepository.save(settings);
      console.log(chalk.green('\n✓ API key saved.\n'));
    }

    return { ...settings, openAiApiKey: apiKey };
  }

  async changeSettings(): Promise<Settings> {
    const current = this.loadOrCreateSettings();
    const resolvedKey = this.resolveOpenAiApiKey(current);

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'openAiApiKey',
        message: 'OpenAI API key (leave blank to keep current):',
        mask: '*',
      },
      {
        type: 'list',
        name: 'replyTone',
        message: 'Reply tone:',
        choices: [
          'Professional',
          'Professional and friendly',
          'Warm and conversational',
          'Formal and courteous',
          'Casual and upbeat',
          'Empathetic and supportive',
        ],
        default: current.replyTone,
      },
      {
        type: 'input',
        name: 'customInstructions',
        message: 'Custom instructions:',
        default: current.customInstructions,
      },
      {
        type: 'confirm',
        name: 'manualApproval',
        message: 'Require manual approval before posting replies?',
        default: current.manualApproval,
      },
      {
        type: 'confirm',
        name: 'autoPost',
        message: 'Auto-post replies without approval?',
        default: current.autoPost,
      },
      {
        type: 'confirm',
        name: 'dryRun',
        message: 'Enable dry run mode?',
        default: current.dryRun,
      },
    ]);

    const settings = SettingsSchema.parse({
      ...current,
      openAiApiKey: answers.openAiApiKey.trim() || resolvedKey,
      replyTone: answers.replyTone,
      customInstructions: answers.customInstructions.trim(),
      manualApproval: answers.manualApproval,
      autoPost: answers.autoPost,
      dryRun: answers.dryRun,
    });

    this.settingsRepository.save(settings);
    console.log(chalk.green('\n✓ Settings updated.\n'));

    return { ...settings, openAiApiKey: this.resolveOpenAiApiKey(settings) };
  }
}
