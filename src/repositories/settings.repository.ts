import { Settings, SettingsSchema } from '../models/settings';
import { FileUtils } from '../utils/file';
import { Paths } from '../utils/paths';

export class SettingsRepository {
  constructor(private readonly paths: Paths) {}

  exists(): boolean {
    return FileUtils.exists(this.paths.getSettingsPath());
  }

  load(): Settings | null {
    return FileUtils.readJson(this.paths.getSettingsPath(), SettingsSchema);
  }

  save(settings: Settings): void {
    this.paths.ensureDirectories();
    FileUtils.writeJson(this.paths.getSettingsPath(), settings);
  }
}
