/**
 * AI panel "/" 面板的共享 contribution 与执行协议类型。
 */

export interface AIPanelContributionError {
  readonly code: string;
  readonly message: string;
}

export interface AIPanelContributionEntryBase {
  readonly itemId: string;
  readonly extensionId: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly keywords: readonly string[];
  readonly when?: string;
}

export interface AIPanelCommandContributionEntry extends AIPanelContributionEntryBase {
  readonly kind: 'command';
  readonly commandId: string;
  readonly insertText?: string;
}

export interface AIPanelSkillCommandContributionEntry extends AIPanelContributionEntryBase {
  readonly kind: 'skill';
  readonly commandId: string;
  readonly toolId?: never;
  readonly requiresConfirmation: boolean;
}

export interface AIPanelSkillToolContributionEntry extends AIPanelContributionEntryBase {
  readonly kind: 'skill';
  readonly toolId: string;
  readonly commandId?: never;
  readonly requiresConfirmation: boolean;
}

export type AIPanelSkillContributionEntry =
  | AIPanelSkillCommandContributionEntry
  | AIPanelSkillToolContributionEntry;

export type AIPanelContributionEntry =
  | AIPanelCommandContributionEntry
  | AIPanelSkillContributionEntry;

export interface AIPanelContributionSnapshot {
  readonly commands: readonly AIPanelCommandContributionEntry[];
  readonly skills: readonly AIPanelSkillContributionEntry[];
}

export const EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT: AIPanelContributionSnapshot = {
  commands: [],
  skills: [],
};

export interface AIPanelContributionListResponse {
  readonly success: boolean;
  readonly data?: AIPanelContributionSnapshot;
  readonly error?: AIPanelContributionError;
}

export interface ExecuteAIPanelContributionRequest {
  readonly kind: 'command' | 'skill';
  readonly itemId: string;
}

export interface AIPanelContributionHandledOutcome {
  readonly type: 'handled';
  readonly message?: string;
}

export interface AIPanelContributionInsertTextOutcome {
  readonly type: 'insert-text';
  readonly insertText: string;
  readonly message?: string;
}

export type AIPanelContributionExecutionOutcome =
  | AIPanelContributionHandledOutcome
  | AIPanelContributionInsertTextOutcome;

export interface AIPanelContributionExecutionResponse {
  readonly success: boolean;
  readonly data?: AIPanelContributionExecutionOutcome;
  readonly error?: AIPanelContributionError;
}
