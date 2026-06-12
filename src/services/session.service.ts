import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { BrowserManager } from '../automation/browser-manager';
import { Settings } from '../models/settings';
import { BusinessService } from './business.service';
import { SetupWizardService } from './setup-wizard.service';
import { SettingsRepository } from '../repositories/settings.repository';
import { Logger } from 'winston';
import { URLS } from '../automation/selectors';

export class SessionService {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly businessService: BusinessService,
    private readonly setupWizardService: SetupWizardService,
    private readonly settingsRepository: SettingsRepository,
    private readonly logger: Logger
  ) {}

  async ensureSession(
    settings: Settings,
    options?: { forceBusinessPick?: boolean; headlessOnly?: boolean }
  ): Promise<Settings> {
    const forceBusinessPick = options?.forceBusinessPick ?? false;
    const needsDiscovery = this.businessService.needsDiscovery(settings);

    if (
      options?.headlessOnly &&
      this.browserManager.hasAuthState() &&
      !needsDiscovery &&
      !forceBusinessPick &&
      settings.reviewsPageUrl
    ) {
      return settings;
    }

    await this.browserManager.launch();

    const loggedIn = await this.browserManager.isLoggedIn();
    if (!loggedIn) {
      await this.promptManualLogin();
    } else {
      settings = await this.confirmCorrectAccount(settings);
    }

    const runSetupWizard = forceBusinessPick || needsDiscovery;

    let updated = await this.businessService.discoverAndSelect(settings, forceBusinessPick);

    const email = await this.browserManager.getActiveGoogleEmail();
    if (email) {
      updated = { ...updated, googleAccountEmail: email };
      this.settingsRepository.save(updated);
    }

    await this.browserManager.saveAuthState();
    await this.browserManager.close();

    if (runSetupWizard && updated.reviewsPageUrl) {
      updated = await this.setupWizardService.run(updated);
    }

    return updated;
  }

  async switchGoogleAccount(settings: Settings): Promise<Settings> {
    console.log(chalk.yellow('\n  Switch Google Account\n'));
    console.log('The browser will stay open until you finish signing in.\n');

    const previousEmail =
      settings.googleAccountEmail || (await this.browserManager.getActiveGoogleEmail()) || '';

    await this.browserManager.launch();

    const cleared: Settings = {
      ...settings,
      businessName: '',
      businessDescription: '',
      reviewsPageUrl: '',
      profileUrl: '',
      googleAccountEmail: '',
    };
    this.settingsRepository.save(cleared);

    const spinner = ora('Signing out of current Google account...').start();
    try {
      await this.browserManager.signOutForAccountSwitch(URLS.googleBusinessHome);
      spinner.succeed('Signed out. Choose your business account in the browser.');
    } catch (error) {
      spinner.warn('Sign-out page failed — use "Use another account" in the browser.');
      await this.browserManager.openAccountChooser(URLS.googleBusinessHome);
    }

    console.log(chalk.cyan('\n  In the browser window:\n'));
    console.log('  1. Click **Use another account** (important if your personal account appears)');
    console.log('  2. Sign in with the Google account that manages your business');
    console.log('  3. Return here and press Enter when done\n');

    if (previousEmail) {
      console.log(chalk.dim(`  Previous account: ${previousEmail}\n`));
    }

    const email = await this.waitForUserAccountSelection(previousEmail);

    const withEmail = { ...cleared, googleAccountEmail: email };
    this.settingsRepository.save(withEmail);
    console.log(chalk.green(`\n✓ Business account set: ${email}\n`));

    return withEmail;
  }

  async promptManualLogin(): Promise<void> {
    console.log(chalk.yellow('\n  Google Sign-In\n'));
    console.log('A browser window will open. Sign in to the Google account');
    console.log('that manages your Business Profile.\n');

    await this.browserManager.openAccountChooser(URLS.googleBusinessHome);
    await this.waitForUserAccountSelection();
  }

  async reconnect(): Promise<void> {
    const settings = this.settingsRepository.load() ?? this.emptySettings();
    await this.switchGoogleAccount(settings);
  }

  async closeBrowser(): Promise<void> {
    await this.browserManager.close();
  }

  private async waitForUserAccountSelection(previousEmail?: string): Promise<string> {
    const maxAttempts = 8;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await inquirer.prompt<{ ack: string }>([
        {
          type: 'input',
          name: 'ack',
          message:
            attempt === 1
              ? 'Press Enter after signing in with your BUSINESS account...'
              : 'Press Enter to check again (or Ctrl+C to cancel)...',
        },
      ]);

      const email = await this.browserManager.getActiveGoogleEmail();

      if (!email) {
        console.log(
          chalk.yellow(
            '\nCould not detect the signed-in account yet. Make sure you finished signing in.\n'
          )
        );
        continue;
      }

      console.log(chalk.dim(`\n  Detected account: ${chalk.white(email)}\n`));

      if (previousEmail && email.toLowerCase() === previousEmail.toLowerCase()) {
        console.log(
          chalk.yellow(
            '  You are still on the same account.\n' +
              '  In the browser, click your profile icon → **Sign out** or **Use another account**.\n'
          )
        );

        const { reset } = await inquirer.prompt<{ reset: boolean }>([
          {
            type: 'confirm',
            name: 'reset',
            message: 'Reset browser profile completely and try again? (fixes stuck auto-login)',
            default: attempt >= 3,
          },
        ]);

        if (reset) {
          await this.browserManager.resetBrowserProfile();
          await this.browserManager.launch();
          await this.browserManager.signOutForAccountSwitch(URLS.googleBusinessHome);
          console.log(chalk.cyan('\n  Browser profile reset. Sign in with your business account.\n'));
        }

        continue;
      }

      const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `Use ${email} as your business account?`,
          default: true,
        },
      ]);

      if (confirmed) {
        await this.browserManager.saveAuthState();
        return email;
      }
    }

    throw new Error(
      'Account switch was not completed. Use "Switch Google Account" and choose "Use another account" in the browser.'
    );
  }

  private async confirmCorrectAccount(settings: Settings): Promise<Settings> {
    const email = await this.browserManager.getActiveGoogleEmail();

    if (email) {
      console.log(chalk.dim(`\n  Signed in as: ${chalk.white(email)}\n`));
    }

    if (settings.googleAccountEmail && email && email !== settings.googleAccountEmail) {
      console.log(
        chalk.yellow(
          `  Expected business account: ${settings.googleAccountEmail}\n` +
            `  Currently signed in as:    ${email}\n`
        )
      );

      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: 'Wrong Google account detected. What would you like to do?',
          choices: [
            { name: 'Switch Google account now', value: 'switch' },
            { name: 'Continue with current account', value: 'continue' },
          ],
        },
      ]);

      if (action === 'switch') {
        return this.switchGoogleAccount(settings);
      }

      return settings;
    }

    if (!settings.googleAccountEmail && email) {
      const { correct } = await inquirer.prompt<{ correct: boolean }>([
        {
          type: 'confirm',
          name: 'correct',
          message: 'Is this the Google account that manages your business?',
          default: true,
        },
      ]);

      if (!correct) {
        return this.switchGoogleAccount(settings);
      }

      const updated = { ...settings, googleAccountEmail: email };
      this.settingsRepository.save(updated);
      return updated;
    }

    return settings;
  }

  private emptySettings(): Settings {
    return {
      businessName: '',
      businessDescription: '',
      replyTone: 'Professional',
      customInstructions: '',
      manualApproval: true,
      autoPost: false,
      dryRun: false,
      openAiApiKey: '',
      reviewsPageUrl: '',
      profileUrl: '',
      googleAccountEmail: '',
    };
  }
}
