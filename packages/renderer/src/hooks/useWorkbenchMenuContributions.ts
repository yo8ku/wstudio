/**
 * 按位置订阅 workbench 菜单贡献。
 */

import { useEffect, useState } from 'react';
import type {
  WorkbenchContributionSnapshot,
  WorkbenchMenuContributionEntry,
  WorkbenchMenuLocation,
} from '@note-studio/shared';
import { workbenchContributionService } from '../services/WorkbenchContributionService';

function filterMenusByLocation(
  snapshot: WorkbenchContributionSnapshot,
  location: WorkbenchMenuLocation,
): readonly WorkbenchMenuContributionEntry[] {
  return snapshot.menus.filter(menu => menu.location === location);
}

export function useWorkbenchMenuContributions(
  location: WorkbenchMenuLocation,
): readonly WorkbenchMenuContributionEntry[] {
  const [menus, setMenus] = useState<readonly WorkbenchMenuContributionEntry[]>([]);

  useEffect(() => {
    let disposed = false;

    const syncMenus = (snapshot: WorkbenchContributionSnapshot): void => {
      if (disposed) {
        return;
      }

      setMenus(filterMenusByLocation(snapshot, location));
    };

    const loadMenus = async (): Promise<void> => {
      try {
        const snapshot = await workbenchContributionService.getContributions();
        syncMenus(snapshot);
      } catch (error) {
        console.error('[useWorkbenchMenuContributions] 加载插件菜单贡献失败:', error);
        if (!disposed) {
          setMenus([]);
        }
      }
    };

    void loadMenus();

    const unsubscribe = workbenchContributionService.subscribe((snapshot) => {
      syncMenus(snapshot);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [location]);

  return menus;
}
