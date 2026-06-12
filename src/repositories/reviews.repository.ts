import { ReviewRecord, ReviewsData, ReviewsDataSchema } from '../models/review';
import { FileUtils } from '../utils/file';
import { Paths } from '../utils/paths';

function preserveReviewState(fresh: ReviewRecord, prev: ReviewRecord): ReviewRecord {
  return {
    ...fresh,
    generatedReply: prev.generatedReply,
    approved: prev.approved,
    posted: prev.posted,
    processedAt: prev.processedAt,
    ownerReply: fresh.ownerReply ?? prev.ownerReply,
  };
}

export class ReviewsRepository {
  constructor(private readonly paths: Paths) {}

  load(): ReviewsData | null {
    return FileUtils.readJson(this.paths.getReviewsPath(), ReviewsDataSchema);
  }

  getCachedReviews(businessName?: string): ReviewRecord[] | null {
    const data = this.load();
    if (!data?.reviews.length || !data.fullFetchCompleted) return null;
    if (businessName && data.businessName && data.businessName !== businessName) {
      return null;
    }
    return data.reviews;
  }

  save(
    reviews: ReviewRecord[],
    businessName = '',
    options?: { fullFetchCompleted?: boolean }
  ): void {
    const existing = this.load();
    this.paths.ensureDirectories();
    const data: ReviewsData = {
      fetchedAt: new Date().toISOString(),
      businessName: businessName || existing?.businessName,
      fullFetchCompleted:
        options?.fullFetchCompleted ?? existing?.fullFetchCompleted ?? false,
      reviews,
    };
    FileUtils.writeJson(this.paths.getReviewsPath(), data);
  }

  applyReviewUpdates(updates: ReviewRecord[], businessName = ''): void {
    const data = this.load();
    const existing = data?.reviews ?? [];
    const updateMap = new Map(updates.map((r) => [r.reviewId, r]));

    const merged = existing.map((r) => {
      const updated = updateMap.get(r.reviewId);
      return updated ? { ...r, ...updated } : r;
    });

    this.save(merged, businessName || data?.businessName || '', {
      fullFetchCompleted: data?.fullFetchCompleted,
    });
  }

  /** Full scrape: replace list while preserving per-review processing state. */
  mergeWithExisting(scraped: ReviewRecord[]): ReviewRecord[] {
    const existing = this.load();
    const existingMap = new Map(
      (existing?.reviews ?? []).map((r) => [r.reviewId, r])
    );

    return scraped.map((review) => {
      const prev = existingMap.get(review.reviewId);
      if (!prev) return review;
      return preserveReviewState(review, prev);
    });
  }

  /** Incremental sync: update known reviews, prepend newly discovered ones. */
  mergeIncremental(scraped: ReviewRecord[], existing: ReviewRecord[]): ReviewRecord[] {
    const scrapedMap = new Map(scraped.map((r) => [r.reviewId, r]));
    const existingIds = new Set(existing.map((r) => r.reviewId));

    const updated = existing.map((prev) => {
      const fresh = scrapedMap.get(prev.reviewId);
      if (!fresh) return prev;
      return preserveReviewState(fresh, prev);
    });

    const newReviews = scraped.filter((r) => !existingIds.has(r.reviewId));
    return [...newReviews, ...updated];
  }

  updateReview(reviewId: string, updates: Partial<ReviewRecord>): void {
    const data = this.load();
    const reviews = data?.reviews ?? [];
    const index = reviews.findIndex((r) => r.reviewId === reviewId);

    if (index === -1) return;

    reviews[index] = { ...reviews[index], ...updates };
    this.save(reviews, data?.businessName ?? '');
  }

  saveAll(
    reviews: ReviewRecord[],
    businessName = '',
    options?: { fullFetchCompleted?: boolean }
  ): void {
    this.save(reviews, businessName, options);
  }

  clear(): void {
    const path = this.paths.getReviewsPath();
    if (FileUtils.exists(path)) {
      FileUtils.writeJson(path, { fetchedAt: new Date().toISOString(), reviews: [] });
    }
  }
}
