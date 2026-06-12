import fs from 'fs';
import path from 'path';

function resolveProjectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

export class Paths {
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? resolveProjectRoot();
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  getConfigDir(): string {
    return path.join(this.projectRoot, 'config');
  }

  getDataDir(): string {
    return path.join(this.projectRoot, 'data');
  }

  getLogsDir(): string {
    return path.join(this.projectRoot, 'logs');
  }

  getBrowserProfileDir(): string {
    return path.join(this.projectRoot, '.browser-profile');
  }

  getSettingsPath(): string {
    return path.join(this.getConfigDir(), 'settings.json');
  }

  getBusinessDiscoveryDebugPath(): string {
    return path.join(this.getConfigDir(), 'business-discovery-last.json');
  }

  getBrowserStatePath(): string {
    return path.join(this.getConfigDir(), 'browser-state.json');
  }

  getReviewsPath(): string {
    return path.join(this.getDataDir(), 'reviews.json');
  }

  getGeneratedRepliesPath(): string {
    return path.join(this.getDataDir(), 'generated-replies.json');
  }

  getLogPath(): string {
    return path.join(this.getLogsDir(), 'app.log');
  }

  ensureDirectories(): void {
    for (const dir of [
      this.getConfigDir(),
      this.getDataDir(),
      this.getLogsDir(),
      this.getBrowserProfileDir(),
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  isConfigured(): boolean {
    return fs.existsSync(this.getSettingsPath());
  }

  hasBrowserSession(): boolean {
    const profileDir = this.getBrowserProfileDir();
    return fs.existsSync(profileDir) && fs.readdirSync(profileDir).length > 0;
  }
}
