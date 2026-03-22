/**
 * 设置模态框组件
 * 以模态框形式显示设置编辑器
 */

import React, { useEffect } from 'react';
import { SettingsView } from './SettingsView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  // 监听 ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="settings-modal fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'var(--ws-editor-background, var(--ws-editor-background, #1e1e1e))',
        opacity: 0.85,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="settings-modal-content w-full h-full max-w-screen-xl max-h-screen-90 rounded-lg shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--ws-editor-background)',
          border: '1px solid var(--ws-contrast-border)',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
      >
        <SettingsView />
      </div>
    </div>
  );
};
