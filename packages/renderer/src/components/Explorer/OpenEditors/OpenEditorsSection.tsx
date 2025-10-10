import React from 'react';
import { AccordionSection } from '../Accordion/AccordionSection';
import { EditorGroup } from './EditorGroup';
import { EditorItemProps } from './EditorItem';
import './OpenEditorsSection.scss';

export interface OpenEditorsSectionProps {
  editors: Omit<EditorItemProps, 'onClick' | 'onClose'>[];
  onEditorClick: (path: string) => void;
  onEditorClose: (path: string) => void;
  onCloseAll?: () => void;
  onSaveAll?: () => void;
}

/**
 * 打开的编辑器面板
 * 显示当前打开的所有编辑器
 */
export const OpenEditorsSection: React.FC<OpenEditorsSectionProps> = ({
  editors,
  onEditorClick,
  onEditorClose,
  onCloseAll,
  onSaveAll,
}) => {
  const actions = [];

  if (onSaveAll) {
    actions.push({
      id: 'save-all',
      icon: '💾',
      tooltip: '全部保存',
      onClick: onSaveAll,
    });
  }

  if (onCloseAll) {
    actions.push({
      id: 'close-all',
      icon: '×',
      tooltip: '全部关闭',
      onClick: onCloseAll,
    });
  }

  return (
    <AccordionSection
      title="打开的编辑器"
      defaultExpanded={editors.length > 0}
      actions={actions}
    >
      <div className="open-editors-section">
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
    </AccordionSection>
  );
};

export default OpenEditorsSection;





















