/**
 * 通知消息状态管理
 * 功能：管理右下角消息提示框的状态
 * 最多同时显示3个，超出的隐藏，关闭后显示隐藏的
 */

import { create } from 'zustand';

// 最大同时显示数量
const MAX_VISIBLE = 3;

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationState {
  /** 所有通知（包括隐藏的） */
  notifications: NotificationItem[];
  /** 获取可见的通知（最多3个） */
  getVisibleNotifications: () => NotificationItem[];
  /** 获取隐藏的通知数量 */
  getHiddenCount: () => number;
  addNotification: (type: NotificationType, message: string) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  getVisibleNotifications: () => {
    return get().notifications.slice(0, MAX_VISIBLE);
  },

  getHiddenCount: () => {
    const total = get().notifications.length;
    return total > MAX_VISIBLE ? total - MAX_VISIBLE : 0;
  },

  addNotification: (type, message) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    set((state) => ({
      notifications: [...state.notifications, { id, type, message }],
    }));
    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));

/**
 * 通知服务 - 提供便捷的调用方法
 */
export const notification = {
  success: (message: string) => useNotificationStore.getState().addNotification('success', message),
  error: (message: string) => useNotificationStore.getState().addNotification('error', message),
  warning: (message: string) => useNotificationStore.getState().addNotification('warning', message),
  info: (message: string) => useNotificationStore.getState().addNotification('info', message),
  remove: (id: string) => useNotificationStore.getState().removeNotification(id),
  clearAll: () => useNotificationStore.getState().clearAll(),
};
