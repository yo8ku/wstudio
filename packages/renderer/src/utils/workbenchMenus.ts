/**
 * workbench 菜单 contribution 的分组与执行辅助。
 */

import type { JsonValue, WorkbenchMenuContributionEntry } from '@note-studio/shared';
import { notification } from '../components/Notification';
import { workbenchContributionService } from '../services/WorkbenchContributionService';

export interface GroupedWorkbenchMenuContribution {
  readonly key: string;
  readonly items: readonly WorkbenchMenuContributionEntry[];
}

function normalizeGroupKey(menu: WorkbenchMenuContributionEntry): string {
  const groupName = menu.group?.trim();
  if (groupName) {
    return `group:${groupName}`;
  }

  return `extension:${menu.extensionId}`;
}

export function groupWorkbenchMenuContributions(
  menus: readonly WorkbenchMenuContributionEntry[],
): readonly GroupedWorkbenchMenuContribution[] {
  const groups: GroupedWorkbenchMenuContribution[] = [];
  const groupIndex = new Map<string, number>();

  for (const menu of menus) {
    const key = normalizeGroupKey(menu);
    const existingIndex = groupIndex.get(key);

    if (existingIndex === undefined) {
      groupIndex.set(key, groups.length);
      groups.push({
        key,
        items: [menu],
      });
      continue;
    }

    const existingGroup = groups[existingIndex];
    groups[existingIndex] = {
      key: existingGroup.key,
      items: [...existingGroup.items, menu],
    };
  }

  return groups;
}

export async function executeWorkbenchMenuContribution(
  menu: WorkbenchMenuContributionEntry,
  args: readonly JsonValue[] = [],
): Promise<void> {
  try {
    await workbenchContributionService.executeCommand({
      commandId: menu.commandId,
      args,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notification.error(`插件命令执行失败: ${message}`);
  }
}
