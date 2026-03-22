import type { JsonObject, JsonValue } from '../types/json';
import type {
  BlockEditorBlockAttributes,
  BlockEditorBlockSnapshot,
  BlockEditorDocumentSnapshot,
  BlockEditorListType,
  BlockEditorParagraphType,
} from './types';

export type BlockDocumentSourceFormat = 'block' | 'markdown';

export type BlockDocumentMigrationState = 'native' | 'imported' | 'needs-upgrade';

export type BlockDocumentPrimarySourceMode = 'markdown' | 'native-block';

export const BLOCK_DOCUMENT_STATE_VERSION = 3;

interface PersistedBlockDocumentStateV1 extends JsonObject {
  readonly version: 1;
  readonly sourceFormat: BlockDocumentSourceFormat;
  readonly migrationState: BlockDocumentMigrationState;
  readonly savedAt: number;
  readonly document: BlockEditorDocumentSnapshot;
}

interface PersistedBlockDocumentStateV2 extends JsonObject {
  readonly version: 2;
  readonly sourceFormat: BlockDocumentSourceFormat;
  readonly migrationState: BlockDocumentMigrationState;
  readonly savedAt: number;
  readonly document: BlockEditorDocumentSnapshot;
  readonly sourceRevision: BlockDocumentSourceRevision;
}

export interface BlockDocumentSourceRevision extends JsonObject {
  readonly plainTextHash: string;
  readonly plainTextLength: number;
}

export interface PersistedBlockDocumentState extends JsonObject {
  readonly version: typeof BLOCK_DOCUMENT_STATE_VERSION;
  readonly sourceFormat: BlockDocumentSourceFormat;
  readonly migrationState: BlockDocumentMigrationState;
  readonly primarySourceMode: BlockDocumentPrimarySourceMode;
  readonly savedAt: number;
  readonly document: BlockEditorDocumentSnapshot;
  readonly sourceRevision: BlockDocumentSourceRevision;
}

export interface ParsedPersistedBlockDocumentState {
  readonly state: PersistedBlockDocumentState;
  readonly didUpgrade: boolean;
}

interface CreatePersistedBlockDocumentStatePayload {
  readonly sourceFormat: BlockDocumentSourceFormat;
  readonly migrationState: BlockDocumentMigrationState;
  readonly primarySourceMode?: BlockDocumentPrimarySourceMode;
  readonly document: BlockEditorDocumentSnapshot;
  readonly savedAt?: number;
  readonly sourcePlainText?: string;
}

const isJsonObjectValue = (value: JsonValue | null): value is JsonObject => (
  value !== null && !Array.isArray(value) && typeof value === 'object'
);

const isFiniteNumber = (value: JsonValue | null): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const BLOCK_EDITOR_PARAGRAPH_TYPES = new Set<BlockEditorParagraphType>([
  'text',
  'quote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

const BLOCK_EDITOR_LIST_TYPES = new Set<BlockEditorListType>([
  'bulleted',
  'numbered',
  'todo',
  'toggle',
]);

const isSourceFormat = (value: JsonValue | null): value is BlockDocumentSourceFormat => (
  value === 'block' || value === 'markdown'
);

const isMigrationState = (value: JsonValue | null): value is BlockDocumentMigrationState => (
  value === 'native' || value === 'imported' || value === 'needs-upgrade'
);

const isPrimarySourceMode = (value: JsonValue | null): value is BlockDocumentPrimarySourceMode => (
  value === 'markdown' || value === 'native-block'
);

const isBlockAttributeType = (
  value: JsonValue | null,
): value is BlockEditorParagraphType | BlockEditorListType => (
  typeof value === 'string'
  && (
    BLOCK_EDITOR_PARAGRAPH_TYPES.has(value as BlockEditorParagraphType)
    || BLOCK_EDITOR_LIST_TYPES.has(value as BlockEditorListType)
  )
);

const isBlockAttributes = (value: JsonValue | null): value is BlockEditorBlockAttributes => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  return (
    (value.type === null || isBlockAttributeType(value.type ?? null))
    && (value.checked === null || typeof value.checked === 'boolean')
    && (
      value.order === null
      || isFiniteNumber(value.order)
    )
    && (
      value.language === null
      || typeof value.language === 'string'
    )
    && (
      value.url === null
      || typeof value.url === 'string'
    )
    && (
      value.caption === null
      || typeof value.caption === 'string'
    )
  );
};

const isBlockSnapshot = (value: JsonValue | null): value is BlockEditorBlockSnapshot => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  return typeof value.id === 'string'
    && typeof value.flavour === 'string'
    && isFiniteNumber(value.depth ?? null)
    && isFiniteNumber(value.childCount ?? null)
    && typeof value.text === 'string'
    && (value.attributes === null || isBlockAttributes(value.attributes ?? null));
};

const isDocumentSnapshot = (value: JsonValue | null): value is BlockEditorDocumentSnapshot => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  if (
    typeof value.documentId !== 'string'
    || !isFiniteNumber(value.blockCount ?? null)
    || !isFiniteNumber(value.textBlockCount ?? null)
    || typeof value.plainText !== 'string'
    || !Array.isArray(value.blocks)
  ) {
    return false;
  }

  return value.blocks.every((entry: JsonValue): boolean => isBlockSnapshot(entry));
};

const isSourceRevision = (value: JsonValue | null): value is BlockDocumentSourceRevision => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  return typeof value.plainTextHash === 'string'
    && isFiniteNumber(value.plainTextLength ?? null);
};

const isPersistedBlockDocumentStateV1 = (
  value: JsonValue | null,
): value is PersistedBlockDocumentStateV1 => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  return value.version === 1
    && isSourceFormat(value.sourceFormat ?? null)
    && isMigrationState(value.migrationState ?? null)
    && isFiniteNumber(value.savedAt ?? null)
    && isDocumentSnapshot(value.document ?? null);
};

const isPersistedBlockDocumentStateV2 = (
  value: JsonValue | null,
): value is PersistedBlockDocumentStateV2 => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  return value.version === 2
    && isSourceFormat(value.sourceFormat ?? null)
    && isMigrationState(value.migrationState ?? null)
    && isFiniteNumber(value.savedAt ?? null)
    && isDocumentSnapshot(value.document ?? null)
    && isSourceRevision(value.sourceRevision ?? null);
};

const isPersistedBlockDocumentStateV3 = (
  value: JsonValue | null,
): value is PersistedBlockDocumentState => {
  if (!isJsonObjectValue(value)) {
    return false;
  }

  return value.version === BLOCK_DOCUMENT_STATE_VERSION
    && isSourceFormat(value.sourceFormat ?? null)
    && isMigrationState(value.migrationState ?? null)
    && isPrimarySourceMode(value.primarySourceMode ?? null)
    && isFiniteNumber(value.savedAt ?? null)
    && isDocumentSnapshot(value.document ?? null)
    && isSourceRevision(value.sourceRevision ?? null);
};

const hashPlainText = (plainText: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < plainText.length; index += 1) {
    hash ^= plainText.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
};

export const buildBlockDocumentSourceRevision = (
  plainText: string,
): BlockDocumentSourceRevision => ({
  plainTextHash: hashPlainText(plainText),
  plainTextLength: plainText.length,
});

export const resolvePersistedBlockDocumentPrimarySourceMode = (
  sourceFormat: BlockDocumentSourceFormat,
  migrationState: BlockDocumentMigrationState,
  primarySourceMode?: BlockDocumentPrimarySourceMode,
): BlockDocumentPrimarySourceMode => {
  if (primarySourceMode) {
    return primarySourceMode;
  }

  return sourceFormat === 'block' && migrationState === 'native'
    ? 'native-block'
    : 'markdown';
};

export const createPersistedBlockDocumentState = ({
  sourceFormat,
  migrationState,
  primarySourceMode,
  document,
  savedAt,
  sourcePlainText,
}: CreatePersistedBlockDocumentStatePayload): PersistedBlockDocumentState => ({
  version: BLOCK_DOCUMENT_STATE_VERSION,
  sourceFormat,
  migrationState,
  primarySourceMode: resolvePersistedBlockDocumentPrimarySourceMode(
    sourceFormat,
    migrationState,
    primarySourceMode,
  ),
  savedAt: savedAt ?? Date.now(),
  document,
  sourceRevision: buildBlockDocumentSourceRevision(sourcePlainText ?? document.plainText),
});

export const createImportedBlockDocumentState = (
  document: BlockEditorDocumentSnapshot,
  sourceFormat: BlockDocumentSourceFormat = 'markdown',
  sourcePlainText?: string,
  primarySourceMode: BlockDocumentPrimarySourceMode = 'markdown',
): PersistedBlockDocumentState => (
  createPersistedBlockDocumentState({
    sourceFormat,
    migrationState: 'imported',
    primarySourceMode,
    document,
    sourcePlainText,
  })
);

export const createNativeBlockDocumentState = (
  document: BlockEditorDocumentSnapshot,
  sourcePlainText?: string,
  savedAt?: number,
  primarySourceMode: BlockDocumentPrimarySourceMode = 'native-block',
): PersistedBlockDocumentState => (
  createPersistedBlockDocumentState({
    sourceFormat: 'block',
    migrationState: 'native',
    primarySourceMode,
    document,
    savedAt,
    sourcePlainText,
  })
);

export const isNativeBlockDocumentState = (
  state: PersistedBlockDocumentState,
): boolean => (
  state.sourceFormat === 'block'
  && state.migrationState === 'native'
);

export const markPersistedBlockDocumentStateNeedsUpgrade = (
  state: PersistedBlockDocumentState,
): PersistedBlockDocumentState => ({
  version: BLOCK_DOCUMENT_STATE_VERSION,
  sourceFormat: state.sourceFormat,
  migrationState: 'needs-upgrade',
  primarySourceMode: state.primarySourceMode,
  savedAt: Date.now(),
  document: state.document,
  sourceRevision: state.sourceRevision,
});

export const reconcilePersistedBlockDocumentStateWithSource = (
  state: PersistedBlockDocumentState,
  sourcePlainText?: string,
): PersistedBlockDocumentState => ({
  version: BLOCK_DOCUMENT_STATE_VERSION,
  sourceFormat: state.sourceFormat,
  migrationState: state.sourceFormat === 'block' ? 'native' : 'imported',
  primarySourceMode: state.primarySourceMode,
  savedAt: Date.now(),
  document: state.document,
  sourceRevision: buildBlockDocumentSourceRevision(sourcePlainText ?? state.document.plainText),
});

export const isPersistedBlockDocumentStateSourceInSync = (
  state: PersistedBlockDocumentState,
  sourcePlainText: string,
): boolean => {
  const nextRevision = buildBlockDocumentSourceRevision(sourcePlainText);

  return nextRevision.plainTextHash === state.sourceRevision.plainTextHash
    && nextRevision.plainTextLength === state.sourceRevision.plainTextLength;
};

export const shouldPreferNativeBlockDocumentState = (
  state: PersistedBlockDocumentState,
  sourcePlainText: string,
): boolean => (
  state.primarySourceMode === 'native-block'
  && isNativeBlockDocumentState(state)
  && isPersistedBlockDocumentStateSourceInSync(state, sourcePlainText)
);

const upgradePersistedBlockDocumentStateV1 = (
  state: PersistedBlockDocumentStateV1,
): PersistedBlockDocumentState => (
  createPersistedBlockDocumentState({
    sourceFormat: state.sourceFormat,
    migrationState: state.migrationState,
    document: state.document,
    savedAt: state.savedAt,
    sourcePlainText: state.document.plainText,
  })
);

const upgradePersistedBlockDocumentStateV2 = (
  state: PersistedBlockDocumentStateV2,
): PersistedBlockDocumentState => (
  createPersistedBlockDocumentState({
    sourceFormat: state.sourceFormat,
    migrationState: state.migrationState,
    document: state.document,
    savedAt: state.savedAt,
    sourcePlainText: state.document.plainText,
  })
);

export const resolveBlockDocumentWritePrimarySourceMode = (
  primarySourceMode?: BlockDocumentPrimarySourceMode,
): BlockDocumentPrimarySourceMode => primarySourceMode ?? 'markdown';

export const shouldWriteNativePrimaryBlockDocumentState = (
  primarySourceMode?: BlockDocumentPrimarySourceMode,
): boolean => resolveBlockDocumentWritePrimarySourceMode(primarySourceMode) === 'native-block';

export const shouldWriteMarkdownPrimaryBlockDocumentState = (
  primarySourceMode?: BlockDocumentPrimarySourceMode,
): boolean => resolveBlockDocumentWritePrimarySourceMode(primarySourceMode) === 'markdown';

export const createPrimarySourcePersistedBlockDocumentState = (
  document: BlockEditorDocumentSnapshot,
  sourcePlainText: string | undefined,
  primarySourceMode?: BlockDocumentPrimarySourceMode,
): PersistedBlockDocumentState => (
  shouldWriteNativePrimaryBlockDocumentState(primarySourceMode)
    ? createNativeBlockDocumentState(
        document,
        sourcePlainText,
        undefined,
        resolveBlockDocumentWritePrimarySourceMode(primarySourceMode),
      )
    : createImportedBlockDocumentState(
        document,
        'markdown',
        sourcePlainText,
        resolveBlockDocumentWritePrimarySourceMode(primarySourceMode),
      )
);

export const parsePersistedBlockDocumentState = (
  value: JsonValue | null,
): ParsedPersistedBlockDocumentState | null => {
  if (isPersistedBlockDocumentStateV3(value)) {
    return {
      state: value,
      didUpgrade: false,
    };
  }

  if (isPersistedBlockDocumentStateV2(value)) {
    return {
      state: upgradePersistedBlockDocumentStateV2(value),
      didUpgrade: true,
    };
  }

  if (isPersistedBlockDocumentStateV1(value)) {
    return {
      state: upgradePersistedBlockDocumentStateV1(value),
      didUpgrade: true,
    };
  }

  return null;
};
