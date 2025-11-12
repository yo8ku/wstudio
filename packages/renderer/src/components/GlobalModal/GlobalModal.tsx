/**
 * 全局模态窗口组件
 * 在应用顶层渲染，通过 Zustand store 控制
 */

import React from 'react';
import { useModalStore } from '../../stores/modalStore';
import { ModelToast } from '../ModelToast';

export const GlobalModal: React.FC = () => {
  const { isOpen, config, confirm, cancel, closeModal } = useModalStore();

  // 如果没有配置，不渲染
  if (!config) return null;

  return (
    <ModelToast
      open={isOpen}
      onOpenChange={(open) => {
        console.log('[GlobalModal] onOpenChange:', open);
        // 当对话框被关闭时（无论什么原因）
        if (!open) {
          closeModal();
        }
      }}
      title={config.title}
      description={config.description}
      confirmText={config.confirmText || '确定'}
      cancelText={config.cancelText || '取消'}
      onConfirm={() => {
        console.log('[GlobalModal] 点击确认按钮');
        confirm();
      }}
      onCancel={() => {
        console.log('[GlobalModal] 点击取消按钮');
        cancel();
      }}
    />
  );
};

