/**
 * 将 manifest 中的 AI panel contribution 投影为宿主可消费的快照结构。
 */

import type { ResolvedExtensionManifest } from '@note-studio/extension-api';
import {
  EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT,
  type AIPanelContributionSnapshot,
  type AIPanelSkillContributionEntry,
} from '@note-studio/shared';

export function projectAIPanelContributions(
  manifest: ResolvedExtensionManifest,
): AIPanelContributionSnapshot {
  const aiPanel = manifest.contributes.aiPanel;
  if (!aiPanel?.commands?.length && !aiPanel?.skills?.length) {
    return EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT;
  }

  const commands = (aiPanel.commands ?? []).map((entry) => ({
    kind: 'command' as const,
    itemId: entry.id,
    extensionId: manifest.id,
    title: entry.title,
    description: entry.description,
    icon: entry.icon,
    keywords: entry.keywords ? [...entry.keywords] : [],
    when: entry.when,
    commandId: entry.command,
    insertText: entry.insertText,
  }));

  const skills = (aiPanel.skills ?? []).map<AIPanelSkillContributionEntry>((entry) => {
    const base = {
      kind: 'skill' as const,
      itemId: entry.id,
      extensionId: manifest.id,
      title: entry.title,
      description: entry.description,
      icon: entry.icon,
      keywords: entry.keywords ? [...entry.keywords] : [],
      when: entry.when,
      requiresConfirmation: entry.requiresConfirmation ?? false,
    };

    if (typeof entry.command === 'string') {
      return {
        ...base,
        commandId: entry.command,
      };
    }

    return {
      ...base,
      toolId: entry.tool,
    };
  });

  return {
    commands,
    skills,
  };
}
