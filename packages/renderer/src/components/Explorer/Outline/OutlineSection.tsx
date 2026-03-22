import React from 'react';
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
}) => (
  <div className="outline-section">
    <div className="outline-content">
      {nodes.length === 0 ? (
        <div className="outline-empty">活动编辑器无法提供大纲信息</div>
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
    </div>
  </div>
);

export default OutlineSection;
