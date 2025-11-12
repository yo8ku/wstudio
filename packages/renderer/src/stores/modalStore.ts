/**
 * 全局模态窗口状态管理
 * 使用 Zustand 管理模态对话框状态
 */

import { create } from 'zustand';

interface ModalConfig {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  type?: 'info' | 'warning' | 'error' | 'confirm';
}

interface ModalStore {
  isOpen: boolean;
  config: ModalConfig | null;
  openModal: (config: ModalConfig) => void;
  closeModal: () => void;
  confirm: () => Promise<void>;
  cancel: () => void;
}

export const useModalStore = create<ModalStore>((set, get) => ({
  isOpen: false,
  config: null,

  openModal: (config: ModalConfig) => {
    console.log('[ModalStore] 打开模态窗口:', config.title);
    set({ isOpen: true, config });
  },

  closeModal: () => {
    console.log('[ModalStore] 关闭模态窗口');
    set({ isOpen: false, config: null });
  },

  confirm: async () => {
    const { config } = get();
    if (config?.onConfirm) {
      try {
        await config.onConfirm();
      } catch (error) {
        console.error('[ModalStore] 确认回调执行失败:', error);
      }
    }
    get().closeModal();
  },

  cancel: () => {
    const { config } = get();
    if (config?.onCancel) {
      try {
        config.onCancel();
      } catch (error) {
        console.error('[ModalStore] 取消回调执行失败:', error);
      }
    }
    get().closeModal();
  },
}));

// 便捷的全局方法
export const modal = {
  confirm: (config: Omit<ModalConfig, 'type'>) => {
    useModalStore.getState().openModal({ ...config, type: 'confirm' });
  },
  
  info: (config: Omit<ModalConfig, 'type'>) => {
    useModalStore.getState().openModal({ ...config, type: 'info' });
  },
  
  warning: (config: Omit<ModalConfig, 'type'>) => {
    useModalStore.getState().openModal({ ...config, type: 'warning' });
  },
  
  error: (config: Omit<ModalConfig, 'type'>) => {
    useModalStore.getState().openModal({ ...config, type: 'error' });
  },
};










