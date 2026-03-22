import * as path from 'node:path';
import type {
  JsonObject,
  JsonValue,
  PersistedBlockDocumentState,
} from '@note-studio/shared';
import { parsePersistedBlockDocumentState } from '@note-studio/shared';
import { NoteDatabase, noteDatabase } from './NoteDatabase';

type NoteMetadataRecord = JsonObject;

export interface UpsertBlockDocumentStateByPathPayload {
  readonly path: string;
  readonly title?: string;
  readonly content?: string;
  readonly state: PersistedBlockDocumentState;
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
    console.warn('[BlockDocumentStateService] 解析 note metadata 失败:', error);
    return {};
  }
};

export class BlockDocumentStateService {
  public constructor(private readonly database: NoteDatabase) {}

  public async getByPath(filePath: string): Promise<PersistedBlockDocumentState | null> {
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
    const blockDocument = metadata.blockDocument ?? null;
    const parsedState = parsePersistedBlockDocumentState(blockDocument);
    if (!parsedState) {
      return null;
    }

    if (parsedState.didUpgrade) {
      const nextMetadata: NoteMetadataRecord = {
        ...metadata,
        blockDocument: parsedState.state,
      };

      await this.database.updateNote(note.id, {
        metadata: JSON.stringify(nextMetadata),
      });
    }

    return parsedState.state;
  }

  public async upsertByPath(
    payload: UpsertBlockDocumentStateByPathPayload,
  ): Promise<PersistedBlockDocumentState> {
    const normalizedPath = payload.path.trim();
    if (normalizedPath.length === 0) {
      throw new Error('Block document state path cannot be empty.');
    }

    const parsedState = parsePersistedBlockDocumentState(payload.state);
    if (!parsedState) {
      throw new Error('Block document state payload is invalid.');
    }

    const nextState = parsedState.state;

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
          blockDocument: nextState,
        } satisfies NoteMetadataRecord),
      });

      return await this.getByPath(normalizedPath) ?? nextState;
    }

    const metadata = parseMetadata(note.metadata);
    const nextMetadata: NoteMetadataRecord = {
      ...metadata,
      blockDocument: nextState,
    };

    await this.database.updateNote(note.id, {
      metadata: JSON.stringify(nextMetadata),
    });

    return nextState;
  }
}

export const blockDocumentStateService = new BlockDocumentStateService(noteDatabase);
