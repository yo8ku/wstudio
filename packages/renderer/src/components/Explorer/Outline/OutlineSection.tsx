import React from 'react';
import { AccordionSection } from '../Accordion/AccordionSection';
import { TreeView } from '../Common/TreeView';
import { OutlineNode } from './OutlineNode';
import { OutlineNode as OutlineNodeType } from './types';
import './OutlineSection.scss';

export interface OutlineSectionProps {
  nodes: OutlineNodeType[];
  selectedNode?: OutlineNodeType | null;
  onNodeSelect: (node: OutlineNodeType) => void;
  onNodeToggle?: (node: OutlineNodeType) => void;
  onSort?: () => void;
  onFilter?: () => void;
  onCollapse?: () => void;
  showResizeHandle?: boolean; // 是否显示拖动手柄（默认为 true）
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * 大纲面板
 * 显示当前文件的符号结构
 */
export const OutlineSection: React.FC<OutlineSectionProps> = ({
  nodes,
  selectedNode,
  onNodeSelect,
  onNodeToggle,
  onSort,
  onFilter,
  onCollapse,
  showResizeHandle = true,
  onExpandedChange,
}) => {
  const actions = [];

  if (onCollapse) {
    actions.push({
      id: 'collapse',
      icon: '⊟',
      tooltip: '折叠所有',
      onClick: onCollapse,
    });
  }

  if (onFilter) {
    actions.push({
      id: 'filter',
      icon: '⋯',
      tooltip: '筛选',
      onClick: onFilter,
    });
  }

  return (
    <AccordionSection
      title="大纲"
      defaultExpanded={false}
      actions={actions}
      flexGrow={true}
      resizable={true}
      defaultHeight={250}
      minHeight={100}
      maxHeight={600}
      showResizeHandle={showResizeHandle}
      onExpandChange={onExpandedChange}
    >
      <div className="outline-section">
        {nodes.length === 0 ? (
          <div className="outline-empty">当前文件无符号信息</div>
        ) : (
          <TreeView>
            {nodes.map((node) => (
              <OutlineNode
                key={node.id}
                node={node}
                selected={selectedNode?.id === node.id}
                onSelect={onNodeSelect}
                onToggle={onNodeToggle}
              />
            ))}
          </TreeView>
        )}
      </div>
    </AccordionSection>
  );
};

export default OutlineSection;

