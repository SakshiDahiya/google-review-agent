import fs from 'fs';
import path from 'path';
import { ZodType, ZodTypeDef } from 'zod';

export class FileUtils {
  static readJson<Output, Def extends ZodTypeDef = ZodTypeDef, Input = Output>(
    filePath: string,
    schema: ZodType<Output, Def, Input>
  ): Output | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Input;
    return schema.parse(parsed);
  }

  static writeJson(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }

  static exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }
}
