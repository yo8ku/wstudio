import * as path from 'node:path';
import type {
  BlockDocumentNativeFile,
  JsonObject,
  JsonValue,
} from '@note-studio/shared';
import { parseBlockDocumentNativeFile } from '@note-studio/shared';
import { NoteDatabase, noteDatabase } from './NoteDatabase';

type NoteMetadataRecord = JsonObject;

export interface UpsertBlockDocumentNativeFileByPathPayload {
  readonly path: string;
  readonly title?: string;
  readonly content?: string;
  readonly file: BlockDocumentNativeFile;
}

const isJsonObjectValue = (value: JsonValue | null): value is JsonObject => (
  value !== null && !Array.isArray(value) && typeof value === 'object'
);

const parseMetadata = (metadata?: string | null): NoteMetadataRecord => {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as JsonValue;
    if (!isJsonObjectValue(parsed)) {
      return {};
    }

    return { ...parsed };
  } catch (error) {
    console.warn('[BlockDocumentNativeFileService] 解析 note metadata 失败:', error);
    return {};
  }
};

export class BlockDocumentNativeFileService {
  public constructor(private readonly database: NoteDatabase) {}

  public async getByPath(filePath: string): Promise<BlockDocumentNativeFile | null> {
    const normalizedPath = filePath.trim();
    if (normalizedPath.length === 0) {
      return null;
    }

    await this.database.initialize();
    const note = await this.database.getNoteByPath(normalizedPath);
    if (!note?.metadata) {
      return null;
    }

    const metadata = parseMetadata(note.metadata);
    const blockDocumentNativeFile = metadata.blockDocumentNativeFile ?? null;
    const parsedFile = parseBlockDocumentNativeFile(blockDocumentNativeFile);
    if (!parsedFile) {
      return null;
    }

    if (parsedFile.didNormalize) {
      const nextMetadata: NoteMetadataRecord = {
        ...metadata,
        blockDocumentNativeFile: parsedFile.file,
      };

      await this.database.updateNote(note.id, {
        metadata: JSON.stringify(nextMetadata),
      });
    }

    return parsedFile.file;
  }

  public async upsertByPath(
    payload: UpsertBlockDocumentNativeFileByPathPayload,
  ): Promise<BlockDocumentNativeFile> {
    const normalizedPath = payload.path.trim();
    if (normalizedPath.length === 0) {
      throw new Error('Block document native file path cannot be empty.');
    }

    const parsedFile = parseBlockDocumentNativeFile(payload.file);
    if (!parsedFile) {
      throw new Error('Block document native file payload is invalid.');
    }

    const nextFile = parsedFile.file;

    await this.database.initialize();
    const note = await this.database.getNoteByPath(normalizedPath);
    if (!note) {
      const fallbackTitle = payload.title?.trim() || path.basename(normalizedPath);
      await this.database.createNote({
        title: fallbackTitle,
        content: payload.content ?? '',
        path: normalizedPath,
        type: 'normal',
        metadata: JSON.stringify({
          blockDocumentNativeFile: nextFile,
        } satisfies NoteMetadataRecord),
      });

      return await this.getByPath(normalizedPath) ?? nextFile;
    }

    const metadata = parseMetadata(note.metadata);
    const nextMetadata: NoteMetadataRecord = {
      ...metadata,
      blockDocumentNativeFile: nextFile,
    };

    await this.database.updateNote(note.id, {
      metadata: JSON.stringify(nextMetadata),
    });

    return nextFile;
  }

  public async deleteByPath(filePath: string): Promise<boolean> {
    const normalizedPath = filePath.trim();
    if (normalizedPath.length === 0) {
      return false;
    }

    await this.database.initialize();
    const note = await this.database.getNoteByPath(normalizedPath);
    if (!note?.metadata) {
      return false;
    }

    const metadata = parseMetadata(note.metadata);
    if (!('blockDocumentNativeFile' in metadata)) {
      return false;
    }

    delete metadata.blockDocumentNativeFile;

    await this.database.updateNote(note.id, {
      metadata: JSON.stringify(metadata),
    });

    return true;
  }
}

export const blockDocumentNativeFileService = new BlockDocumentNativeFileService(noteDatabase);
