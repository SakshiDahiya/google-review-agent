import { Page } from 'playwright';
import { Logger } from 'winston';
import { BusinessOption, BusinessProfile } from '../models/business-profile';
import { SELECTORS, URLS } from './selectors';
import { extractProfileDetails } from './browser-scripts.js';
import {
  isGoogleBusinessHost,
  isGoogleManagedReviewsUrl,
  normalizeReviewsPageUrl,
} from '../utils/google-business-urls';

const SKIP_LINK_LABELS =
  /^(sign out|help|settings|learn more|google business|business profile|add business|create|get started|sign in|privacy|terms|manage now|view profile|overview|retail|services|bookings|performance|advertise|photos|posts|manufacturer center|google ads api|marketing profile settings|get expert support|ask for reviews?|edit profile|read reviews?|edit products?|edit services?|get google|claim your credit|unlock insights|share your google qr|complete info)$/i;

const MARKETING_COPY =
  /^(connect with customers|turn local online|get expert support|contact us for support)/i;

function hasBusinessLocationId(pathname: string): boolean {
  return (
    /\/l\/\d+/.test(pathname) ||
    /\/n\/[^/]+\/l\/[^/]+/.test(pathname) ||
    /\/n\/\d+\/searchprofile\/?$/.test(pathname) ||
    /\/n\/\d+\/profile\/?$/.test(pathname) ||
    /\/n\/\d+\/reviews\/?$/.test(pathname) ||
    /\/dashboard\/l\/\d+/.test(pathname) ||
    /\/location\/\d+/.test(pathname) ||
    /\/u\/\d+\/l\/\d+/.test(pathname)
  );
}

export class BusinessScraper {
  constructor(private readonly logger: Logger) {}

  async getPageSource(page: Page): Promise<{ url: string; title: string; html: string }> {
    if (this.isLocationsPage(page.url())) {
      await this.waitForLocationsPageRendered(page);
    }

    const html = await page.content();
    this.logger.info('Captured page HTML', {
      url: page.url(),
      htmlLength: html.length,
    });

    return {
      url: page.url(),
      title: await page.title().catch(() => ''),
      html,
    };
  }

  filterDiscoveredOptions(options: BusinessOption[]): BusinessOption[] {
    return this.deduplicateOptions(options);
  }

  async navigateToLocations(page: Page): Promise<void> {
    const target = URLS.googleBusinessLocations;
    const current = page.url();

    if (this.isLocationsPage(current)) {
      this.logger.info('Already on business locations page', { url: current });
      await this.waitForLocationsPageRendered(page);
      return;
    }

    this.logger.info('Navigating to business locations list', { from: current, to: target });

    await page.goto(target, { waitUntil: 'load', timeout: 60000 });
    await this.waitForLocationsPageRendered(page);

    this.logger.info('Locations page loaded', { url: page.url() });
  }

  private async waitForLocationsPageRendered(page: Page): Promise<void> {
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const readySelectors = [
      SELECTORS.locationsTable,
      SELECTORS.locationsTableRow,
      SELECTORS.locationsBusinessLink,
      'a[href*="/searchprofile"]',
      'a[href*="business.google.com/n/"]',
      'a[href*="business.google.com/l/"]',
      '[data-ulid]',
    ];

    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      for (const selector of readySelectors) {
        const count = await page.locator(selector).count().catch(() => 0);
        if (count > 0) {
          this.logger.info('Locations page rendered content detected', { selector, count });
          await page.waitForTimeout(1500);
          return;
        }
      }

      const businessLinkCount = await page
        .evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links.filter((anchor) => {
            const href = anchor.getAttribute('href') || '';
            return (
              href.includes('business.google.com') &&
              (/\/searchprofile/.test(href) ||
                /\/l\/\d+/.test(href) ||
                /\/n\/[^/]+\/l\//.test(href))
            );
          }).length;
        })
        .catch(() => 0);

      if (businessLinkCount > 0) {
        this.logger.info('Locations page business profile links found in DOM', {
          businessLinkCount,
        });
        await page.waitForTimeout(1500);
        return;
      }

      if (await this.isUnsupportedBrowserPage(page)) {
        this.logger.warn('Locations page reports unsupported browser');
        return;
      }

      await page.waitForTimeout(500);
    }

    this.logger.warn('Timed out waiting for rendered locations page; capturing current HTML', {
      url: page.url(),
    });
  }

  private async isUnsupportedBrowserPage(page: Page): Promise<boolean> {
    const text = await page.locator('body').innerText().catch(() => '');
    return /update your browser to manage your business profile/i.test(text);
  }

  async loadBusinessProfile(page: Page, option: BusinessOption): Promise<BusinessProfile> {
    const reviewsPageUrl = await this.openGoogleReviewsPage(page, option);
    const details = await this.extractProfileDetails(page, option);

    const profileUrl =
      option.profileUrl && this.isBusinessProfileUrl(option.profileUrl)
        ? option.profileUrl.includes('fid=')
          ? option.profileUrl
          : this.normalizeProfileUrl(option.profileUrl)
        : this.deriveProfileUrl(reviewsPageUrl);

    const savedReviewsUrl = this.buildReviewsUrl(profileUrl);

    return {
      name: details.name || option.name,
      description: details.description,
      address: details.address ?? option.address,
      category: details.category,
      profileUrl,
      reviewsPageUrl: savedReviewsUrl,
    };
  }

  private async openGoogleReviewsPage(page: Page, option: BusinessOption): Promise<string> {
    const candidates = [
      option.reviewsPageUrl ? normalizeReviewsPageUrl(option.reviewsPageUrl) : '',
      this.isBusinessReviewsUrl(option.profileUrl) ? option.profileUrl : '',
      this.buildReviewsUrl(option.profileUrl),
    ].filter((url): url is string => !!url && isGoogleManagedReviewsUrl(url));

    const seen = new Set<string>();
    const uniqueCandidates: string[] = [];
    for (const url of candidates) {
      const key = url.split('#')[0];
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCandidates.push(url);
      }
    }

    uniqueCandidates.sort((a, b) => {
      const score = (url: string) => {
        let points = 0;
        if (url.includes('fid=')) points += 2;
        try {
          if (isGoogleBusinessHost(new URL(url).hostname)) points += 1;
        } catch {
          // ignore
        }
        return points;
      };
      return score(b) - score(a);
    });

    if (uniqueCandidates.length === 0) {
      throw new Error(
        `Could not derive a Google Business reviews URL from profile: ${option.profileUrl}`
      );
    }

    for (const candidate of uniqueCandidates) {
      this.logger.info('Opening Google Business reviews page', { url: candidate });
      await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);

      const current = page.url();
      if (isGoogleManagedReviewsUrl(current)) {
        if (isGoogleBusinessHost(new URL(candidate).hostname)) {
          return candidate;
        }
        return normalizeReviewsPageUrl(current);
      }

      this.logger.warn('Reviews navigation landed on unexpected URL', {
        candidate,
        current,
      });
    }

    throw new Error(
      'Found your business but could not open the Google reviews page. Try Change Business again.'
    );
  }

  async extractProfileDetails(
    page: Page,
    option: BusinessOption
  ): Promise<Pick<BusinessProfile, 'name' | 'description' | 'address' | 'category'>> {
    const heading = await this.extractBusinessNameFromPage(page);
    const scraped = await page.evaluate(extractProfileDetails, SELECTORS);

    const description =
      scraped.description ||
      [scraped.category, scraped.address ?? option.address].filter(Boolean).join(' — ') ||
      `${option.name} on Google Business`;

    const scrapedName = this.cleanBusinessName(scraped.name || heading || '');
    const name =
      scrapedName && !/^search results$/i.test(scrapedName)
        ? scrapedName
        : option.name;

    return {
      name,
      description,
      address: scraped.address || option.address,
      category: scraped.category || undefined,
    };
  }

  private isLocationsPage(url: string): boolean {
    try {
      const { pathname } = new URL(url);
      return pathname === '/locations' || pathname.startsWith('/locations/');
    } catch {
      return false;
    }
  }

  private async extractBusinessNameFromPage(page: Page): Promise<string | null> {
    const selectors = [
      'h1',
      '[data-business-name]',
      '[data-attrid="title"]',
      'div[role="heading"]',
      'span[class*="title"]',
    ];

    for (const selector of selectors) {
      const text = await page.locator(selector).first().textContent().catch(() => null);
      const cleaned = text ? this.cleanBusinessName(text) : '';
      if (
        cleaned &&
        cleaned.length > 1 &&
        !SKIP_LINK_LABELS.test(cleaned) &&
        !MARKETING_COPY.test(cleaned)
      ) {
        return cleaned;
      }
    }

    const title = this.cleanBusinessName(await page.title());
    if (
      title &&
      title.length > 1 &&
      !SKIP_LINK_LABELS.test(title) &&
      !MARKETING_COPY.test(title)
    ) {
      return title;
    }

    return null;
  }

  private deriveProfileUrl(reviewsOrProfileUrl: string): string {
    if (this.isBusinessProfileUrl(reviewsOrProfileUrl)) {
      return this.normalizeProfileUrl(reviewsOrProfileUrl);
    }

    if (this.isBusinessReviewsUrl(reviewsOrProfileUrl)) {
      return this.normalizeProfileUrl(reviewsOrProfileUrl.replace(/\/reviews\/?$/, '/profile'));
    }

    return reviewsOrProfileUrl.split('?')[0].split('#')[0];
  }

  private isBusinessReviewsUrl(href: string): boolean {
    try {
      const url = new URL(href, 'https://business.google.com');
      const host = url.hostname;
      if (!host.includes('business.google.com') && !host.includes('businessprofile.google.com')) {
        return false;
      }
      if (/\/n\/\d+\/reviews\/?$/.test(url.pathname)) {
        return true;
      }
      return /review/i.test(url.pathname) && hasBusinessLocationId(url.pathname);
    } catch {
      return false;
    }
  }

  private isBusinessProfileUrl(href: string): boolean {
    try {
      const url = new URL(href, 'https://business.google.com');
      const host = url.hostname;
      if (!host.includes('business.google.com') && !host.includes('businessprofile.google.com')) {
        return false;
      }
      const { pathname } = url;
      if (pathname === '/locations' || pathname.startsWith('/locations/')) {
        return false;
      }
      return hasBusinessLocationId(pathname);
    } catch {
      return false;
    }
  }

  private normalizeProfileUrl(href: string): string {
    try {
      const url = new URL(href);
      const fid = url.searchParams.get('fid');
      url.search = '';
      url.hash = '';
      if (fid) {
        url.searchParams.set('fid', fid);
      }
      let path = url.pathname.replace(/\/$/, '');

      if (/\/searchprofile\/?$/.test(path)) {
        url.pathname = path;
        return url.toString();
      }

      if (this.isBusinessProfileUrl(href) && !/\/(profile|reviews|info|services)$/.test(path)) {
        if (!path.endsWith('/profile')) {
          path = `${path}/profile`;
        }
      }

      url.pathname = path;
      return url.toString();
    } catch {
      return href;
    }
  }

  private buildReviewsUrl(profileUrl: string): string {
    try {
      const url = new URL(profileUrl, 'https://business.google.com');
      const path = url.pathname.replace(/\/$/, '');

      if (/\/searchprofile\/?$/.test(path)) {
        url.pathname = path.replace(/\/searchprofile\/?$/, '/reviews');
        return url.toString();
      }

      if (/\/n\/\d+\/profile\/?$/.test(path)) {
        url.pathname = path.replace(/\/profile\/?$/, '/reviews');
        return url.toString();
      }

      const normalized = this.normalizeProfileUrl(profileUrl).replace(/\/profile$/, '');
      return `${normalized}/reviews`;
    } catch {
      const base = profileUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
      return `${base.replace(/\/profile\/?$/, '/reviews')}`;
    }
  }

  private cleanBusinessName(raw: string): string {
    return raw
      .replace(/^Reviews of\s+/i, '')
      .replace(/^Search Results$/i, '')
      .replace(/\s*[-|–]\s*Google.*$/i, '')
      .replace(/^(Open|View|Manage|Go to)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isUsableBusinessOption(option: BusinessOption): boolean {
    if (SKIP_LINK_LABELS.test(option.name) || MARKETING_COPY.test(option.name)) {
      return false;
    }

    if (option.reviewsPageUrl) {
      return true;
    }

    return (
      this.isBusinessProfileUrl(option.profileUrl) ||
      this.isBusinessReviewsUrl(option.profileUrl)
    );
  }

  private deduplicateOptions(options: BusinessOption[]): BusinessOption[] {
    const seen = new Set<string>();
    const result: BusinessOption[] = [];

    for (const option of options) {
      if (!this.isUsableBusinessOption(option)) continue;

      const key =
        option.reviewsPageUrl ||
        (this.isBusinessProfileUrl(option.profileUrl)
          ? this.normalizeProfileUrl(option.profileUrl)
          : option.profileUrl.split('?')[0].split('#')[0]);

      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        ...option,
        profileUrl: this.isBusinessProfileUrl(option.profileUrl)
          ? option.profileUrl.includes('fid=')
            ? option.profileUrl
            : this.normalizeProfileUrl(option.profileUrl)
          : option.profileUrl,
      });
    }

    return result;
  }
}
