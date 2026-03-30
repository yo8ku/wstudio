import React from 'react';
import { useTranslation } from 'react-i18next';
import { CustomScrollbar } from '../../common/CustomScrollbar';
import { TreeView } from '../Common/TreeView';
import { OutlineNode } from './OutlineNode';
import { OutlineNode as OutlineNodeType } from './types';
import './OutlineSection.scss';

export interface OutlineSectionProps {
  nodes: OutlineNodeType[];
  selectedNode?: OutlineNodeType | null;
  defaultExpanded?: boolean;
  onNodeSelect: (node: OutlineNodeType) => void;
  onNodeToggle?: (node: OutlineNodeType) => void;
  onSort?: () => void;
  onFilter?: () => void;
  onCollapse?: () => void;
  showResizeHandle?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export const OutlineSection: React.FC<OutlineSectionProps> = ({
  nodes,
  selectedNode,
  onNodeSelect,
  onNodeToggle,
}) => {
  const { t } = useTranslation();

  return (
    <div className="outline-section">
      <CustomScrollbar className="outline-content" scrollbarWidth={10}>
        {nodes.length === 0 ? (
          <div className="outline-empty">
            {String(t('outlineSection.empty.unavailable', { defaultValue: 'Unable to provide outline information' }))}
          </div>
        ) : (
          <TreeView>
            {nodes.map((node) => (
              <OutlineNode
                key={node.id}
                node={node}
                selectedNodeId={selectedNode?.id}
                onSelect={onNodeSelect}
                onToggle={onNodeToggle}
              />
            ))}
          </TreeView>
        )}
      </CustomScrollbar>
    </div>
  );
};

export default OutlineSection;
