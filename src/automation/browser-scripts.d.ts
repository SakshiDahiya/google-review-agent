import { SELECTORS } from './selectors';

export interface ScrapedBusinessOption {
  name: string;
  address?: string;
  profileUrl: string;
}

export interface ScrapedProfileDetails {
  name: string;
  description: string;
  address: string;
  category: string;
}

export interface ScrapedReviewItem {
  reviewId: string;
  author: string;
  rating: number;
  reviewText: string;
  reviewDate?: string;
  ownerReply?: string;
}

type SelectorsArg = typeof SELECTORS;

export interface ScrapeReviewsArgs {
  reviewCardSelector: string;
  unrepliedOnly?: boolean;
}

export interface LocateReviewByAuthorArgs {
  author: string;
  reviewCardSelector: string;
}

export function discoverBusinesses(selectors: SelectorsArg): ScrapedBusinessOption[];
export function discoverLocationsTable(selectors: SelectorsArg): ScrapedBusinessOption[];
export function extractProfileDetails(selectors: SelectorsArg): ScrapedProfileDetails;
export function clickReviewsNav(selectors: SelectorsArg): boolean;
export function scrapeReviews(args: ScrapeReviewsArgs): ScrapedReviewItem[];
export function locateReviewByAuthor(args: LocateReviewByAuthorArgs): boolean;
export function clickReplyButton(selectors: SelectorsArg): boolean;
export function clickSubmitButton(selectors: SelectorsArg): boolean;
