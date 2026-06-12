import { Paths } from './utils/paths';
import { createLogger } from './utils/logger';
import { SettingsRepository } from './repositories/settings.repository';
import { ReviewsRepository } from './repositories/reviews.repository';
import { GeneratedRepliesRepository } from './repositories/generated-replies.repository';
import { ConfigService } from './services/config.service';
import { ReviewService } from './services/review.service';
import { AIService } from './services/ai.service';
import { ApprovalService } from './services/approval.service';
import { PostingService } from './services/posting.service';
import { WorkflowService } from './services/workflow.service';
import { SessionService } from './services/session.service';
import { BusinessService } from './services/business.service';
import { SetupWizardService } from './services/setup-wizard.service';
import { BrowserManager } from './automation/browser-manager';
import { ReviewScraper } from './automation/review-scraper';
import { ReplyPoster } from './automation/reply-poster';
import { BusinessScraper } from './automation/business-scraper';
import { Logger } from 'winston';

export class Container {
  readonly paths: Paths;
  readonly logger: Logger;
  readonly settingsRepository: SettingsRepository;
  readonly reviewsRepository: ReviewsRepository;
  readonly generatedRepliesRepository: GeneratedRepliesRepository;
  readonly browserManager: BrowserManager;
  readonly reviewScraper: ReviewScraper;
  readonly replyPoster: ReplyPoster;
  readonly businessScraper: BusinessScraper;
  readonly configService: ConfigService;
  readonly businessService: BusinessService;
  readonly setupWizardService: SetupWizardService;
  readonly sessionService: SessionService;
  readonly reviewService: ReviewService;
  readonly aiService: AIService;
  readonly approvalService: ApprovalService;
  readonly postingService: PostingService;
  readonly workflowService: WorkflowService;

  constructor(projectRoot?: string) {
    this.paths = new Paths(projectRoot);
    this.logger = createLogger(this.paths);

    this.settingsRepository = new SettingsRepository(this.paths);
    this.reviewsRepository = new ReviewsRepository(this.paths);
    this.generatedRepliesRepository = new GeneratedRepliesRepository(this.paths);

    this.browserManager = new BrowserManager(this.paths, this.logger);
    this.reviewScraper = new ReviewScraper(this.logger);
    this.replyPoster = new ReplyPoster(this.logger);
    this.businessScraper = new BusinessScraper(this.logger);

    this.configService = new ConfigService(this.paths, this.settingsRepository);
    this.businessService = new BusinessService(
      this.browserManager,
      this.businessScraper,
      this.settingsRepository,
      this.paths,
      this.logger
    );
    this.reviewService = new ReviewService(
      this.reviewsRepository,
      this.browserManager,
      this.reviewScraper
    );
    this.aiService = new AIService(
      this.generatedRepliesRepository,
      this.reviewsRepository
    );
    this.setupWizardService = new SetupWizardService(
      this.reviewService,
      this.aiService,
      this.settingsRepository,
      this.logger
    );
    this.sessionService = new SessionService(
      this.browserManager,
      this.businessService,
      this.setupWizardService,
      this.settingsRepository,
      this.logger
    );
    this.approvalService = new ApprovalService();
    this.postingService = new PostingService(
      this.generatedRepliesRepository,
      this.reviewsRepository,
      this.browserManager,
      this.replyPoster
    );
    this.workflowService = new WorkflowService(this);
  }
}
