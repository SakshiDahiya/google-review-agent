import {
  GeneratedReply,
  GeneratedRepliesData,
  GeneratedRepliesDataSchema,
} from '../models/generated-reply';
import { FileUtils } from '../utils/file';
import { Paths } from '../utils/paths';

export class GeneratedRepliesRepository {
  constructor(private readonly paths: Paths) {}

  load(): GeneratedRepliesData | null {
    return FileUtils.readJson(this.paths.getGeneratedRepliesPath(), GeneratedRepliesDataSchema);
  }

  save(replies: GeneratedReply[]): void {
    this.paths.ensureDirectories();
    const data: GeneratedRepliesData = {
      generatedAt: new Date().toISOString(),
      replies,
    };
    FileUtils.writeJson(this.paths.getGeneratedRepliesPath(), data);
  }

  upsertReply(reply: GeneratedReply): void {
    const existing = this.load();
    const replies = existing?.replies ?? [];
    const index = replies.findIndex((r) => r.reviewId === reply.reviewId);
    if (index === -1) {
      replies.push(reply);
    } else {
      replies[index] = reply;
    }
    this.save(replies);
  }
}
