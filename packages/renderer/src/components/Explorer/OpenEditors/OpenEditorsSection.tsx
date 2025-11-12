/**
 * 打开的编辑器区域组件
 * 显示当前打开的所有编辑器，并提供全部保存、全部关闭等操作
 */

import React from 'react';
import ExplorerSection from '../ExplorerSection/ExplorerSection';
import { EditorGroup } from './EditorGroup';
import { EditorItemProps } from './EditorItem';
import './OpenEditorsSection.scss';

export interface OpenEditorsSectionProps {
  editors: Omit<EditorItemProps, 'onClick' | 'onClose'>[];
  expanded?: boolean; // 受控的展开状态
  onEditorClick: (path: string) => void;
  onEditorClose: (path: string) => void;
  onCloseAll?: () => void;
  onSaveAll?: () => void;
  onExpandChange?: (expanded: boolean) => void;
}

/**
 * 打开的编辑器面板
 * 显示当前打开的所有编辑器
 */
export const OpenEditorsSection: React.FC<OpenEditorsSectionProps> = ({
  editors,
  expanded,
  onEditorClick,
  onEditorClose,
  onCloseAll,
  onSaveAll,
  onExpandChange,
}) => {
  const actions = [];

  if (onSaveAll) {
    actions.push({
      id: 'save-all',
      icon: <i className="codicon codicon-save-all" />,
      tooltip: '全部保存',
      onClick: onSaveAll,
    });
  }

  if (onCloseAll) {
    actions.push({
      id: 'close-all',
      icon: <i className="codicon codicon-close-all" />,
      tooltip: '全部关闭',
      onClick: onCloseAll,
    });
  }

  return (
    <div className="open-editors-section">
      <ExplorerSection
        title="打开的编辑器"
        defaultExpanded={editors.length > 0}
        expanded={expanded}
        actions={actions}
        onExpandChange={onExpandChange}
      >
        <div className="open-editors-content">
          {editors.length === 0 ? (
            <div className="open-editors-empty">暂无打开的编辑器</div>
          ) : (
            <EditorGroup
              editors={editors}
              onEditorClick={onEditorClick}
              onEditorClose={onEditorClose}
            />
          )}
        </div>
      </ExplorerSection>
    </div>
  );
};

export default OpenEditorsSection;
