/**
 * 全局命令中心访问器。
 * 负责统一读写挂载在 window 上的共享命令中心实例，避免不同组件各自创建或销毁。
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';

interface CommandCenterWindow extends Window {
  __commandCenter?: VSCodeCommandCenter | null;
}

const resolveCommandCenterWindow = (): CommandCenterWindow | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as CommandCenterWindow;
};

export const getGlobalCommandCenter = (): VSCodeCommandCenter | null => {
  return resolveCommandCenterWindow()?.__commandCenter ?? null;
};

export const setGlobalCommandCenter = (commandCenter: VSCodeCommandCenter | null): void => {
  const commandCenterWindow = resolveCommandCenterWindow();
  if (!commandCenterWindow) {
    return;
  }

  commandCenterWindow.__commandCenter = commandCenter;
};
