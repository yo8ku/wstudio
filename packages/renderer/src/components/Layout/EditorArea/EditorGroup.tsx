/**
 * 编辑器组组件
 * 支持多个编辑器分组显示
 */

import React from 'react';
import { MonacoEditor } from './MonacoEditor';
import { EditorTab } from './EditorArea';
import './EditorGroup.scss';

interface EditorGroupProps {
  file: EditorTab;
  onContentChange: (content: string) => void;
}

export const EditorGroup: React.FC<EditorGroupProps> = ({ 
  file,
  onContentChange 
}) => {
  // 处理 settings.json 的保存
  const handleContentChange = async (content: string) => {
    onContentChange(content);
    
    // 如果是 settings.json 文件，自动保存到设置
    if (file.path === 'settings:/settings.json') {
      try {
        const newSettings = JSON.parse(content);
        await window.electronAPI?.settings?.updateMany(newSettings);
      } catch (error) {
        // 保存设置失败，静默处理
      }
    }
  };

  return (
    <div className="editor-group">
      <MonacoEditor
        key={file.id} // ⭐ 添加 key 确保每个标签页有独立的编辑器实例
        value={file.content || ''}
        language={file.language}
        onChange={handleContentChange}
        tabId={file.id}
        tabTitle={file.title}
      />
    </div>
  );
};
