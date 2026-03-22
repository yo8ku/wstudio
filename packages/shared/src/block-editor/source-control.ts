import type { JsonObject } from '../types/json';
import type { BlockDocumentNativeFile } from './native';
import {
  isNativeBlockDocumentState,
  isPersistedBlockDocumentStateSourceInSync,
  type BlockDocumentPrimarySourceMode,
  type PersistedBlockDocumentState,
} from './persistence';

export type BlockDocumentPrimarySourceOrigin = 'none' | 'persisted-state' | 'native-file';

export interface ResolveBlockDocumentPrimarySourcePayload {
  readonly sourcePlainText: string;
  readonly persistedState?: PersistedBlockDocumentState | null;
  readonly nativeFile?: BlockDocumentNativeFile | null;
}

export interface ResolvedBlockDocumentPrimarySource extends JsonObject {
  readonly mode: BlockDocumentPrimarySourceMode;
  readonly origin: BlockDocumentPrimarySourceOrigin;
  readonly preferredState: PersistedBlockDocumentState | null;
}

export type BlockDocumentPrimarySourceSwitchBlockedReason =
  | 'already-active'
  | 'missing-synced-state'
  | 'state-needs-upgrade'
  | 'unsaved-changes';

export interface EvaluateBlockDocumentPrimarySourceSwitchPayload
  extends ResolveBlockDocumentPrimarySourcePayload {
  readonly currentMode: BlockDocumentPrimarySourceMode;
  readonly targetMode: BlockDocumentPrimarySourceMode;
  readonly hasUnsavedChanges?: boolean;
}

export interface BlockDocumentPrimarySourceSwitchEvaluation extends JsonObject {
  readonly currentMode: BlockDocumentPrimarySourceMode;
  readonly targetMode: BlockDocumentPrimarySourceMode;
  readonly allowed: boolean;
  readonly blockedReason: BlockDocumentPrimarySourceSwitchBlockedReason | null;
}

const isUsablePrimarySourceState = (
  state: PersistedBlockDocumentState | null | undefined,
  sourcePlainText: string,
): state is PersistedBlockDocumentState => {
  if (!state) {
    return false;
  }

  return isPersistedBlockDocumentStateSourceInSync(state, sourcePlainText);
};

export const resolveBlockDocumentPrimarySource = ({
  sourcePlainText,
  persistedState,
  nativeFile,
}: ResolveBlockDocumentPrimarySourcePayload): ResolvedBlockDocumentPrimarySource => {
  const nativeState = nativeFile?.state ?? null;

  if (isUsablePrimarySourceState(persistedState, sourcePlainText)) {
    if (
      persistedState.primarySourceMode === 'native-block'
      && isUsablePrimarySourceState(nativeState, sourcePlainText)
      && isNativeBlockDocumentState(nativeState)
    ) {
      return {
        mode: 'native-block',
        origin: 'native-file',
        preferredState: nativeState,
      };
    }

    return {
      mode: persistedState.primarySourceMode,
      origin: 'persisted-state',
      preferredState: persistedState,
    };
  }

  if (
    isUsablePrimarySourceState(nativeState, sourcePlainText)
    && isNativeBlockDocumentState(nativeState)
  ) {
    return {
      mode: 'native-block',
      origin: 'native-file',
      preferredState: nativeState,
    };
  }

  return {
    mode: 'markdown',
    origin: 'none',
    preferredState: null,
  };
};

export const evaluateBlockDocumentPrimarySourceSwitch = ({
  currentMode,
  targetMode,
  sourcePlainText,
  persistedState,
  nativeFile,
  hasUnsavedChanges,
}: EvaluateBlockDocumentPrimarySourceSwitchPayload): BlockDocumentPrimarySourceSwitchEvaluation => {
  if (currentMode === targetMode) {
    return {
      currentMode,
      targetMode,
      allowed: false,
      blockedReason: 'already-active',
    };
  }

  if (hasUnsavedChanges) {
    return {
      currentMode,
      targetMode,
      allowed: false,
      blockedReason: 'unsaved-changes',
    };
  }

  const resolvedSource = resolveBlockDocumentPrimarySource({
    sourcePlainText,
    persistedState,
    nativeFile,
  });
  const preferredState = resolvedSource.preferredState;
  if (!preferredState) {
    return {
      currentMode,
      targetMode,
      allowed: false,
      blockedReason: 'missing-synced-state',
    };
  }

  if (preferredState.migrationState === 'needs-upgrade') {
    return {
      currentMode,
      targetMode,
      allowed: false,
      blockedReason: 'state-needs-upgrade',
    };
  }

  return {
    currentMode,
    targetMode,
    allowed: true,
    blockedReason: null,
  };
};
