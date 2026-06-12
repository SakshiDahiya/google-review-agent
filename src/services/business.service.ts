import fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { Page } from 'playwright';
import { OpenAIClient } from '../clients/openai.client';
import { BrowserManager } from '../automation/browser-manager';
import { BusinessScraper } from '../automation/business-scraper';
import { BusinessOption } from '../models/business-profile';
import { Settings } from '../models/settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { Paths } from '../utils/paths';
import { FileUtils } from '../utils/file';
import { Logger } from 'winston';

interface BusinessDiscoveryDebugLog {
  timestamp: string;
  pageUrl: string;
  pageTitle: string;
  htmlLength: number;
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
  extractedBusinesses: unknown[];
  parsedOptions: BusinessOption[];
  filteredCount: number;
}

export class BusinessService {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly businessScraper: BusinessScraper,
    private readonly settingsRepository: SettingsRepository,
    private readonly paths: Paths,
    private readonly logger: Logger
  ) {}

  needsDiscovery(settings: Settings): boolean {
    return !settings.businessName || !settings.reviewsPageUrl;
  }

  async discoverAndSelect(settings: Settings, force = false): Promise<Settings> {
    if (!force && !this.needsDiscovery(settings)) {
      return settings;
    }

    const spinner = ora('Opening business.google.com/locations...').start();
    const page = await this.browserManager.getPage();

    try {
      await this.businessScraper.navigateToLocations(page);

      spinner.text = 'Using OpenAI to discover businesses from page source...';
      const options = await this.discoverBusinessesWithAi(page, settings);

      if (options.length === 0) {
        spinner.fail('No businesses found.');
        this.printBusinessDiscoveryDebugToConsole();
        throw new Error(
          'No businesses found on business.google.com/locations. Sign in with the correct Google account and try again.'
        );
      }

      spinner.stop();
      const selected = await this.promptSelection(options);

      spinner.start(`Opening reviews page for ${selected.name}...`);
      const profile = await this.businessScraper.loadBusinessProfile(page, selected);
      spinner.succeed(`Selected: ${profile.name}`);

      const updated: Settings = {
        ...settings,
        businessName: profile.name,
        businessDescription: profile.description,
        reviewsPageUrl: profile.reviewsPageUrl,
        profileUrl: profile.profileUrl ?? '',
      };

      this.settingsRepository.save(updated);
      this.logger.info('Business profile saved', {
        name: profile.name,
        reviewsPageUrl: profile.reviewsPageUrl,
      });

      console.log(chalk.green(`\n✓ Business: ${profile.name}`));
      if (profile.address) {
        console.log(chalk.dim(`  ${profile.address}`));
      }
      console.log(chalk.dim(`  ${profile.description}\n`));

      return updated;
    } catch (error) {
      if (spinner.isSpinning) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('reviews page') || message.includes('reviews URL')) {
          spinner.fail('Failed to open Google reviews page.');
        } else {
          spinner.fail('Failed to discover businesses.');
        }
      }
      throw error;
    }
  }

  private async discoverBusinessesWithAi(
    page: Page,
    settings: Settings
  ): Promise<BusinessOption[]> {
    const apiKey = settings.openAiApiKey.trim();
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Update settings to add your API key.');
    }

    const { url, title, html } = await this.businessScraper.getPageSource(page);
    this.logger.info('Sending page source to OpenAI for business extraction', {
      url,
      htmlLength: html.length,
    });

    const client = new OpenAIClient(apiKey);
    const { businesses, systemPrompt, userPrompt, rawResponse } =
      await client.extractBusinessesFromPageSource(url, title, html);

    const options: BusinessOption[] = businesses.map((business) => {
      const href = business.profileUrl.trim();
      const absolute = href.startsWith('http')
        ? href
        : `https://business.google.com${href.startsWith('/') ? '' : '/'}${href}`;

      return {
        name: business.name.trim(),
        address: business.address?.trim(),
        profileUrl: absolute,
      };
    });

    const filtered = this.businessScraper.filterDiscoveredOptions(options);
    this.saveBusinessDiscoveryDebug({
      timestamp: new Date().toISOString(),
      pageUrl: url,
      pageTitle: title,
      htmlLength: html.length,
      systemPrompt,
      userPrompt,
      rawResponse,
      extractedBusinesses: businesses,
      parsedOptions: options,
      filteredCount: filtered.length,
    });

    return filtered;
  }

  private saveBusinessDiscoveryDebug(debug: BusinessDiscoveryDebugLog): void {
    const debugPath = this.paths.getBusinessDiscoveryDebugPath();
    this.paths.ensureDirectories();
    FileUtils.writeJson(debugPath, debug);

    this.logger.info('OpenAI business discovery debug saved', {
      debugPath,
      pageUrl: debug.pageUrl,
      htmlLength: debug.htmlLength,
      extractedCount: debug.extractedBusinesses.length,
      filteredCount: debug.filteredCount,
      systemPrompt: debug.systemPrompt,
      userPrompt: debug.userPrompt,
      rawResponse: debug.rawResponse,
    });
  }

  private printBusinessDiscoveryDebugToConsole(): void {
    const debugPath = this.paths.getBusinessDiscoveryDebugPath();
    if (!FileUtils.exists(debugPath)) {
      return;
    }

    const raw = fs.readFileSync(debugPath, 'utf-8');
    const debug = JSON.parse(raw) as BusinessDiscoveryDebugLog;

    console.log(chalk.yellow('\n--- OpenAI business discovery (0 results) ---\n'));
    console.log(chalk.cyan('System prompt:\n'));
    console.log(debug.systemPrompt);
    console.log(chalk.cyan('\nUser prompt:\n'));
    console.log(debug.userPrompt);
    console.log(chalk.cyan('\nResponse:\n'));
    console.log(debug.rawResponse || '(empty)');
    console.log(
      chalk.dim(`\nFull debug log: ${debugPath}\n`)
    );
  }

  private async promptSelection(options: BusinessOption[]): Promise<BusinessOption> {
    if (options.length === 1) {
      console.log(chalk.dim(`\nFound 1 business: ${options[0].name}\n`));
      return options[0];
    }

    console.log(chalk.cyan('\nMultiple businesses found:\n'));

    const choices = options.map((opt, index) => {
      const label = opt.address
        ? `[${index + 1}] ${opt.name} — ${opt.address}`
        : `[${index + 1}] ${opt.name}`;
      return { name: label, value: opt };
    });

    const { selected } = await inquirer.prompt<{ selected: BusinessOption }>([
      {
        type: 'list',
        name: 'selected',
        message: 'Select a business:',
        choices,
      },
    ]);

    return selected;
  }
}
