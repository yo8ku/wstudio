/**
 * 扩展数据存储
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export class ExtensionStorage {
  constructor(private storagePath: string) {}

  async get<T>(extensionId: string, key: string): Promise<T | undefined> {
    const filePath = this.getFilePath(extensionId, key);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async set(extensionId: string, key: string, value: any): Promise<void> {
    const filePath = this.getFilePath(extensionId, key);
    const dir = path.dirname(filePath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value), 'utf-8');
  }

  async delete(extensionId: string, key: string): Promise<void> {
    const filePath = this.getFilePath(extensionId, key);
    await fs.unlink(filePath).catch(() => {});
  }

  private getFilePath(extensionId: string, key: string): string {
    return path.join(this.storagePath, extensionId, `${key}.json`);
  }
}



