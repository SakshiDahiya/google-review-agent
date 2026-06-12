#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Container } from './container';

const APP_NAME = 'Google Review AI Assistant';
const APP_VERSION = '2.0.0';

async function showMainMenu(): Promise<string> {
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Run Review Automation', value: 'run' },
        { name: 'Change Settings', value: 'settings' },
        { name: 'Exit', value: 'exit' },
      ],
    },
  ]);

  return action;
}

async function showSettingsMenu(container: Container): Promise<string> {
  const settings = container.configService.loadOrCreateSettings();
  const businessLabel = settings.businessName || 'Not yet selected';

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'Change Settings',
      choices: [
        { name: `Change Business (current: ${businessLabel})`, value: 'business' },
        { name: 'Switch Google Account', value: 'login' },
        { name: 'Tune Reply Style', value: 'prompt' },
        { name: 'Back', value: 'back' },
      ],
    },
  ]);

  return action;
}

async function handleSettingsAction(container: Container, action: string): Promise<void> {
  const { configService, sessionService, setupWizardService } = container;

  switch (action) {
    case 'business':
      await configService.ensureOpenAiApiKey();
      await sessionService.ensureSession(configService.loadOrCreateSettings(), {
        forceBusinessPick: true,
      });
      await sessionService.closeBrowser();
      break;

    case 'login': {
      const settings = configService.loadOrCreateSettings();
      await sessionService.switchGoogleAccount(settings);
      console.log(chalk.dim('Browser left open. Run automation or choose Exit when done.\n'));
      break;
    }

    case 'prompt': {
      const settings = await configService.ensureOpenAiApiKey();
      await setupWizardService.run(settings);
      break;
    }
  }
}

function registerShutdownHandlers(container: Container): void {
  const shutdown = async (code: number) => {
    await container.sessionService.closeBrowser().catch(() => {});
    process.exit(code);
  };

  process.once('SIGINT', () => void shutdown(130));
  process.once('SIGTERM', () => void shutdown(143));
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('review-bot')
    .description(APP_NAME)
    .version(APP_VERSION)
    .action(async () => {
      const container = new Container();
      registerShutdownHandlers(container);

      console.log(chalk.cyan.bold(`\n  ${APP_NAME}\n`));

      try {
        let continueLoop = true;

        while (continueLoop) {
          const action = await showMainMenu();

          if (action === 'exit') {
            await container.sessionService.closeBrowser();
            console.log(chalk.dim('\nGoodbye!\n'));
            break;
          }

          if (action === 'run') {
            await container.workflowService.runAutomation();
            continue;
          }

          if (action === 'settings') {
            let settingsAction: string;
            do {
              settingsAction = await showSettingsMenu(container);
              if (settingsAction !== 'back') {
                await handleSettingsAction(container, settingsAction);
              }
            } while (settingsAction !== 'back');
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        container.logger.error('Application error', { error: message });
        console.error(chalk.red(`\nError: ${message}\n`));
        await container.sessionService.closeBrowser().catch(() => {});
        process.exitCode = 1;
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
