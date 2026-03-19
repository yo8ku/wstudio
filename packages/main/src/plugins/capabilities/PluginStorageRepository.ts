/**
 * Plugin private storage backed by a single JSON file under the plugin storage directory.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { JsonObject, JsonValue } from '@note-studio/shared';

const STORAGE_FILE_NAME = 'state.json';

function isJsonObjectValue(value: JsonValue | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class PluginStorageRepository {
  private readonly storageFilePath: string;

  public constructor(storageDirectory: string) {
    this.storageFilePath = path.join(storageDirectory, STORAGE_FILE_NAME);
  }

  public async get(key: string): Promise<JsonValue | null> {
    const state = await this.readState();
    return key in state ? state[key] : null;
  }

  public async set(key: string, value: JsonValue): Promise<void> {
    const state = await this.readState();
    state[key] = value;
    await this.writeState(state);
  }

  public async delete(key: string): Promise<void> {
    const state = await this.readState();
    if (!(key in state)) {
      return;
    }

    delete state[key];
    await this.writeState(state);
  }

  private async readState(): Promise<JsonObject> {
    try {
      const content = await fs.readFile(this.storageFilePath, 'utf8');
      const parsed = JSON.parse(content) as JsonValue;
      return isJsonObjectValue(parsed) ? parsed : {};
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  }

  private async writeState(state: JsonObject): Promise<void> {
    await fs.mkdir(path.dirname(this.storageFilePath), { recursive: true });
    await fs.writeFile(this.storageFilePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
