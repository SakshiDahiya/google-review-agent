import fs from 'fs';
import path from 'path';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { Logger } from 'winston';
import { Paths } from '../utils/paths';
import { SELECTORS, URLS } from './selectors';

const DEBUG_PORT = 9333;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const VIEWPORT = { width: 1280, height: 900 };

const INTERACTIVE_LAUNCH_OPTIONS = {
  headless: false,
  viewport: VIEWPORT,
  chromiumSandbox: true,
  userAgent: USER_AGENT,
  args: ['--disable-blink-features=AutomationControlled', `--remote-debugging-port=${DEBUG_PORT}`],
  ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
};

const HEADLESS_LAUNCH_OPTIONS = {
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
};

const HEADLESS_CONTEXT_OPTIONS = {
  viewport: VIEWPORT,
  userAgent: USER_AGENT,
};

export class BrowserManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdpBrowser: Browser | null = null;
  private attachedViaCdp = false;

  constructor(
    private readonly paths: Paths,
    private readonly logger: Logger
  ) {}

  isOpen(): boolean {
    return this.page !== null && !this.page.isClosed();
  }

  async launch(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    this.resetState();

    this.paths.ensureDirectories();
    const profileDir = this.paths.getBrowserProfileDir();

    this.logger.info('Launching browser with persistent profile', { profileDir });

    try {
      this.context = await this.launchPersistentContext(profileDir);

      await this.setupInitScript();
      this.page = await this.pickPage();
      this.attachedViaCdp = false;

      return this.page;
    } catch (error) {
      if (this.isProfileInUseError(error)) {
        this.logger.warn('Profile in use, attempting CDP attach', { port: DEBUG_PORT });

        const attached = await this.attachToExistingSession();
        if (attached && this.page) {
          return this.page;
        }

        await this.clearStaleProfileLock(profileDir);

        try {
          this.context = await this.launchPersistentContext(profileDir);
          await this.setupInitScript();
          this.page = await this.pickPage();
          this.attachedViaCdp = false;
          return this.page;
        } catch (retryError) {
          if (this.isProfileInUseError(retryError)) {
            throw new Error(this.profileInUseMessage());
          }
          throw retryError;
        }
      }

      throw error;
    }
  }

  async getPage(): Promise<Page> {
    return this.launch();
  }

  hasAuthState(): boolean {
    return fs.existsSync(this.paths.getBrowserStatePath());
  }

  async saveAuthState(): Promise<void> {
    if (!this.context) {
      throw new Error('Cannot save auth state without an active browser session.');
    }

    this.paths.ensureDirectories();
    const statePath = this.paths.getBrowserStatePath();
    await this.context.storageState({ path: statePath });
    this.logger.info('Saved browser auth state', { statePath });
  }

  async withHeadlessPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const profileDir = this.paths.getBrowserProfileDir();
    const statePath = this.paths.getBrowserStatePath();

    if (!fs.existsSync(profileDir) && !fs.existsSync(statePath)) {
      throw new Error(
        'No saved browser session. Sign in with Google first (Change Business or Run Review Automation).'
      );
    }

    this.paths.ensureDirectories();

    // Prefer the same persistent profile as the headed browser — storageState alone
    // often redirects to google.com/search while the visible browser shows reviews fine.
    if (fs.existsSync(profileDir)) {
      try {
        const context = await this.launchHeadlessPersistentContext(profileDir);
        await this.applyInitScript(context);
        const page = context.pages().find((p) => !p.isClosed()) ?? (await context.newPage());

        try {
          return await fn(page);
        } finally {
          await context.close().catch(() => {});
        }
      } catch (error) {
        if (!this.isProfileInUseError(error)) {
          this.logger.warn('Headless persistent profile failed, falling back to storage state', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (!fs.existsSync(statePath)) {
      throw new Error(
        'No saved browser session. Sign in with Google first (Change Business or Run Review Automation).'
      );
    }

    const browser = await chromium.launch(HEADLESS_LAUNCH_OPTIONS);
    const context = await browser.newContext({
      ...HEADLESS_CONTEXT_OPTIONS,
      storageState: statePath,
    });

    await this.applyInitScript(context);
    const page = await context.newPage();

    try {
      return await fn(page);
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const page = await this.getPage();

    const url = page.url();
    if (url.includes('accounts.google.com/signin') || url.includes('ServiceLogin')) {
      return false;
    }

    const emailInput = page.locator(SELECTORS.loginEmailInput);
    if (await emailInput.isVisible().catch(() => false)) {
      return false;
    }

    return true;
  }

  async waitForManualLogin(timeoutMs = 300000): Promise<void> {
    const page = await this.getPage();

    if (page.url() === 'about:blank') {
      await page.goto(URLS.googleBusinessHome, { waitUntil: 'domcontentloaded' });
    }

    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.isLoggedIn()) {
        this.logger.info('Manual login detected');
        return;
      }
      await page.waitForTimeout(2000);
    }

    throw new Error('Login timed out. Please sign in to Google and try again.');
  }

  async navigateTo(url: string): Promise<void> {
    const page = await this.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
  }

  async signOutForAccountSwitch(
    continueUrl: string = URLS.googleBusinessHome
  ): Promise<void> {
    const page = await this.getPage();
    const chooserUrl = URLS.googleAccountChooser(continueUrl);
    const signOutUrl = URLS.googleSignOut(chooserUrl);

    this.logger.info('Signing out of Google for account switch');

    await page.goto(signOutUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    if (this.context) {
      await this.context.clearCookies();
    }

    this.clearAuthState();
    await this.clearGoogleStorage(page);

    await page.goto(chooserUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    const onChooser = await this.isAccountChooserVisible(page);
    if (!onChooser) {
      await page.goto(URLS.googleSignInFresh(continueUrl), {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(2000);
    }
  }

  async openAccountChooser(continueUrl: string = URLS.googleBusinessHome): Promise<void> {
    const page = await this.getPage();
    const chooserUrl = URLS.googleAccountChooser(continueUrl);
    await page.goto(chooserUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
  }

  async isOnSignInScreen(): Promise<boolean> {
    const page = await this.getPage();
    return this.isAccountChooserVisible(page);
  }

  async resetBrowserProfile(): Promise<void> {
    await this.close();
    const profileDir = this.paths.getBrowserProfileDir();
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
      this.logger.info('Browser profile reset', { profileDir });
    }
    this.clearAuthState();
    this.paths.ensureDirectories();
  }

  private async clearGoogleStorage(page: Page): Promise<void> {
    const origins = [
      'https://accounts.google.com',
      'https://business.google.com',
      'https://www.google.com',
      'https://myaccount.google.com',
    ];

    for (const origin of origins) {
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page
        .evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {
            // Ignore cross-origin storage errors.
          }
        })
        .catch(() => {});
    }
  }

  private async isAccountChooserVisible(page: Page): Promise<boolean> {
    const url = page.url();
    if (
      url.includes('accounts.google.com') &&
      (url.includes('AccountChooser') ||
        url.includes('signin') ||
        url.includes('ServiceLogin') ||
        url.includes('identifier'))
    ) {
      return true;
    }

    const emailInput = page.locator(SELECTORS.loginEmailInput);
    if (await emailInput.isVisible().catch(() => false)) {
      return true;
    }

    const useAnother = page.getByText(/use another account/i).first();
    if (await useAnother.isVisible().catch(() => false)) {
      return true;
    }

    return false;
  }

  async getActiveGoogleEmail(): Promise<string | null> {
    const page = await this.getPage();

    if (!page.url().includes('google.com')) {
      await page.goto(URLS.googleBusinessHome, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    const fromPage = await page.evaluate(() => {
      const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/;
      const candidates = document.querySelectorAll(
        '[data-email], [aria-label*="@"], img[alt*="@"]'
      );

      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        const dataEmail = el.getAttribute('data-email');
        if (dataEmail && emailPattern.test(dataEmail)) {
          return dataEmail;
        }

        const aria = el.getAttribute('aria-label') || el.getAttribute('alt') || '';
        const match = aria.match(emailPattern);
        if (match) {
          return match[0];
        }
      }

      return null;
    });

    if (fromPage) {
      return fromPage;
    }

    await page
      .goto('https://myaccount.google.com/personal-info', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      .catch(() => {});

    return page.evaluate(() => {
      const body = document.body?.innerText || '';
      const match = body.match(/[\w.+-]+@gmail\.com|[\w.+-]+@[\w.-]+\.\w+/);
      return match ? match[0] : null;
    });
  }

  async close(): Promise<void> {
    try {
      if (this.attachedViaCdp) {
        await this.cdpBrowser?.close();
      } else {
        await this.context?.close();
      }
    } catch (error) {
      this.logger.warn('Error closing browser', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.resetState();
      this.logger.info('Browser session released');
    }
  }

  private async launchHeadlessPersistentContext(profileDir: string): Promise<BrowserContext> {
    try {
      return await chromium.launchPersistentContext(profileDir, {
        headless: true,
        viewport: VIEWPORT,
        userAgent: USER_AGENT,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
      });
    } catch {
      return chromium.launchPersistentContext(profileDir, {
        headless: true,
        viewport: VIEWPORT,
        userAgent: USER_AGENT,
        args: ['--disable-blink-features=AutomationControlled'],
      });
    }
  }

  private async launchPersistentContext(profileDir: string): Promise<BrowserContext> {
    try {
      return await chromium.launchPersistentContext(profileDir, {
        ...INTERACTIVE_LAUNCH_OPTIONS,
        channel: 'chrome',
      });
    } catch (error) {
      this.logger.warn('Installed Chrome unavailable, falling back to bundled Chromium', {
        error: error instanceof Error ? error.message : String(error),
      });
      return chromium.launchPersistentContext(profileDir, INTERACTIVE_LAUNCH_OPTIONS);
    }
  }

  private async attachToExistingSession(): Promise<boolean> {
    try {
      this.cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
      const contexts = this.cdpBrowser.contexts();

      if (contexts.length === 0) {
        await this.cdpBrowser.close();
        this.cdpBrowser = null;
        return false;
      }

      this.context = contexts[0];
      this.attachedViaCdp = true;
      this.page = await this.pickPage();
      this.logger.info('Attached to existing browser via CDP');
      return true;
    } catch (error) {
      this.logger.warn('CDP attach failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async setupInitScript(): Promise<void> {
    if (!this.context) return;
    await this.applyInitScript(this.context);
  }

  private async applyInitScript(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      Object.defineProperty(globalThis, '__name', {
        value: (target: unknown) => target,
        writable: true,
        configurable: true,
      });
    });
  }

  private clearAuthState(): void {
    const statePath = this.paths.getBrowserStatePath();
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
      this.logger.info('Cleared saved browser auth state');
    }
  }

  private async pickPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context is not available.');
    }

    const pages = this.context.pages().filter((p) => !p.isClosed());
    if (pages.length > 0) {
      return pages[0];
    }

    return this.context.newPage();
  }

  private isProfileInUseError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('Opening in existing browser session') ||
      message.includes('profile is already in use') ||
      message.includes('SingletonLock')
    );
  }

  private profileInUseMessage(): string {
    return (
      'Browser profile is already in use.\n' +
      'Close any open "Google Chrome for Testing" window from a previous review-bot run,\n' +
      'then try again. Or quit all review-bot terminals and run: pkill -f "chrome-mac-arm64/Google Chrome for Testing"'
    );
  }

  private async clearStaleProfileLock(profileDir: string): Promise<void> {
    for (const file of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const lockPath = path.join(profileDir, file);
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
          this.logger.info('Removed stale profile lock', { file });
        } catch {
          // Lock is held by a running browser — attach or manual close required.
        }
      }
    }
  }

  private resetState(): void {
    this.context = null;
    this.page = null;
    this.cdpBrowser = null;
    this.attachedViaCdp = false;
  }
}
