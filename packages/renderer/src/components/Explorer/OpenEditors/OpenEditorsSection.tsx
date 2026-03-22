/**
 * Open editors section.
 */

import React from 'react';
import { Icon } from '../../Icons/Icon';
import ExplorerSection from '../ExplorerSection/ExplorerSection';
import { EditorGroup } from './EditorGroup';
import { EditorItemProps } from './EditorItem';
import './OpenEditorsSection.scss';

export interface OpenEditorsSectionProps {
  editors: Omit<EditorItemProps, 'onClick' | 'onClose'>[];
  expanded?: boolean;
  onEditorClick: (path: string) => void;
  onEditorClose: (path: string) => void;
  onCloseAll?: () => void;
  onSaveAll?: () => void;
  onExpandChange?: (expanded: boolean) => void;
  onHide?: () => void;
}

export const OpenEditorsSection: React.FC<OpenEditorsSectionProps> = ({
  editors,
  onEditorClick,
  onEditorClose,
  onCloseAll,
  onSaveAll,
  onHide,
}) => {
  const actions = [];

  if (onSaveAll) {
    actions.push({
      id: 'save-all',
      icon: <Icon name="save-all" size={16} />,
      tooltip: '全部保存',
      onClick: onSaveAll,
    });
  }

  if (onCloseAll) {
    actions.push({
      id: 'close-all',
      icon: <Icon name="close-all" size={16} />,
      tooltip: '全部关闭',
      onClick: onCloseAll,
    });
  }

  if (onHide) {
    actions.push({
      id: 'hide-open-editors',
      icon: <Icon name="close" size={16} />,
      tooltip: '隐藏已打开',
      onClick: onHide,
    });
  }

  return (
    <div className="open-editors-section">
      <ExplorerSection
        title={'\u5DF2\u6253\u5F00'}
        expanded={true}
        preserveTitleCase={true}
        actions={actions}
      >
        <div className="open-editors-content">
          {editors.length === 0 ? (
            <div className="open-editors-empty">{'\u6682\u65E0\u6253\u5F00\u7684\u7F16\u8F91\u5668'}</div>
          ) : (
            <EditorGroup
              hideGroupName={true}
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
