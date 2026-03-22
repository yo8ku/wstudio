import type { JsonObject, JsonValue } from '../types/json';
import type { PersistedBlockDocumentState } from './persistence';
import {
  createNativeBlockDocumentState,
  parsePersistedBlockDocumentState,
} from './persistence';
import type { BlockEditorDocumentSnapshot } from './types';

export const BLOCK_DOCUMENT_NATIVE_FILE_KIND = 'note-studio/block-document';
export const BLOCK_DOCUMENT_NATIVE_FILE_VERSION = 1;

export interface BlockDocumentNativeFile extends JsonObject {
  readonly kind: typeof BLOCK_DOCUMENT_NATIVE_FILE_KIND;
  readonly version: typeof BLOCK_DOCUMENT_NATIVE_FILE_VERSION;
  readonly state: PersistedBlockDocumentState;
}

export interface ParsedBlockDocumentNativeFile {
  readonly file: BlockDocumentNativeFile;
  readonly didNormalize: boolean;
}

const isJsonObjectValue = (value: JsonValue | null): value is JsonObject => (
  value !== null && !Array.isArray(value) && typeof value === 'object'
);

const toNativeBlockDocumentState = (
  state: PersistedBlockDocumentState,
): PersistedBlockDocumentState => createNativeBlockDocumentState(
  state.document,
  state.document.plainText,
  state.savedAt,
);

const isSameSourceRevision = (
  left: PersistedBlockDocumentState,
  right: PersistedBlockDocumentState,
): boolean => (
  left.sourceRevision.plainTextHash === right.sourceRevision.plainTextHash
  && left.sourceRevision.plainTextLength === right.sourceRevision.plainTextLength
);

export const createBlockDocumentNativeFileFromState = (
  state: PersistedBlockDocumentState,
): BlockDocumentNativeFile => ({
  kind: BLOCK_DOCUMENT_NATIVE_FILE_KIND,
  version: BLOCK_DOCUMENT_NATIVE_FILE_VERSION,
  state: toNativeBlockDocumentState(state),
});

export const createBlockDocumentNativeFile = (
  document: BlockEditorDocumentSnapshot,
  savedAt?: number,
): BlockDocumentNativeFile => ({
  kind: BLOCK_DOCUMENT_NATIVE_FILE_KIND,
  version: BLOCK_DOCUMENT_NATIVE_FILE_VERSION,
  state: createNativeBlockDocumentState(document, document.plainText, savedAt),
});

export const parseBlockDocumentNativeFile = (
  value: JsonValue | null,
): ParsedBlockDocumentNativeFile | null => {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  if (
    value.kind !== BLOCK_DOCUMENT_NATIVE_FILE_KIND
    || value.version !== BLOCK_DOCUMENT_NATIVE_FILE_VERSION
  ) {
    return null;
  }

  const parsedState = parsePersistedBlockDocumentState(value.state ?? null);
  if (!parsedState || parsedState.state.sourceFormat !== 'block') {
    return null;
  }

  const normalizedState = toNativeBlockDocumentState(parsedState.state);
  const didNormalize = parsedState.didUpgrade
    || parsedState.state.migrationState !== normalizedState.migrationState
    || parsedState.state.savedAt !== normalizedState.savedAt
    || !isSameSourceRevision(parsedState.state, normalizedState);

  return {
    file: {
      kind: BLOCK_DOCUMENT_NATIVE_FILE_KIND,
      version: BLOCK_DOCUMENT_NATIVE_FILE_VERSION,
      state: normalizedState,
    },
    didNormalize,
  };
};

export const parseBlockDocumentNativeFileText = (
  text: string,
): ParsedBlockDocumentNativeFile | null => {
  try {
    const parsed = JSON.parse(text) as JsonValue;
    return parseBlockDocumentNativeFile(parsed);
  } catch {
    return null;
  }
};

export const stringifyBlockDocumentNativeFile = (
  file: BlockDocumentNativeFile,
): string => JSON.stringify(file, null, 2);
