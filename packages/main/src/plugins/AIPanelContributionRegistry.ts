/**
 * AI panel "/" 面板插件 contribution 注册表。
 */

import {
  EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT,
  type AIPanelCommandContributionEntry,
  type AIPanelContributionEntry,
  type AIPanelContributionSnapshot,
  type AIPanelSkillContributionEntry,
  type ExecuteAIPanelContributionRequest,
} from '@note-studio/shared';

interface ExtensionAIPanelContributionRecord {
  readonly commands: readonly AIPanelCommandContributionEntry[];
  readonly skills: readonly AIPanelSkillContributionEntry[];
}

function sortByTitle<TEntry extends { readonly title: string; readonly itemId: string }>(
  entries: readonly TEntry[],
): readonly TEntry[] {
  return [...entries].sort((left, right) => {
    const titleCompare = left.title.localeCompare(right.title, 'zh-CN');
    if (titleCompare !== 0) {
      return titleCompare;
    }

    return left.itemId.localeCompare(right.itemId, 'en');
  });
}

export class AIPanelContributionRegistry {
  private readonly byExtension = new Map<string, ExtensionAIPanelContributionRecord>();

  public replaceExtensionContributions(
    extensionId: string,
    snapshot: AIPanelContributionSnapshot,
  ): void {
    const commands = sortByTitle(snapshot.commands);
    const skills = sortByTitle(snapshot.skills);

    if (commands.length === 0 && skills.length === 0) {
      this.byExtension.delete(extensionId);
      return;
    }

    this.byExtension.set(extensionId, {
      commands,
      skills,
    });
  }

  public clearExtension(extensionId: string): void {
    this.byExtension.delete(extensionId);
  }

  public clearAll(): void {
    this.byExtension.clear();
  }

  public getSnapshot(): AIPanelContributionSnapshot {
    const commands: AIPanelCommandContributionEntry[] = [];
    const skills: AIPanelSkillContributionEntry[] = [];

    for (const record of this.byExtension.values()) {
      commands.push(...record.commands);
      skills.push(...record.skills);
    }

    if (commands.length === 0 && skills.length === 0) {
      return EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT;
    }

    return {
      commands: sortByTitle(commands),
      skills: sortByTitle(skills),
    };
  }

  public findItem(
    request: ExecuteAIPanelContributionRequest,
  ): AIPanelContributionEntry | undefined {
    const snapshot = this.getSnapshot();
    const entries = request.kind === 'command' ? snapshot.commands : snapshot.skills;
    return entries.find((entry) => entry.itemId === request.itemId);
  }
}

export const aiPanelContributionRegistry = new AIPanelContributionRegistry();
