import React, { useState } from 'react';
import ExplorerSection from '../ExplorerSection';
import { TreeView } from '../Common/TreeView';
import { OutlineNode } from './OutlineNode';
import { OutlineNode as OutlineNodeType } from './types';
import { ResizeHandle } from '../../Layout/ResizeHandle';
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
  const [height, setHeight] = useState(300);
  // 大纲默认折叠状态，用户需要手动展开
  const [isExpanded, setIsExpanded] = useState(false);
  const actions = [];

  if (onCollapse) {
    actions.push({
      id: 'collapse',
      icon: <i className="codicon codicon-collapse-all" />,
      tooltip: '折叠所有',
      onClick: onCollapse,
    });
  }

  if (onFilter) {
    actions.push({
      id: 'filter',
      icon: <i className="codicon codicon-filter" />,
      tooltip: '筛选',
      onClick: onFilter,
    });
  }

  const handleExpandChange = (expanded: boolean) => {
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  return (
    <div 
      className={`outline-section ${isExpanded ? 'outline-section--expanded' : 'outline-section--collapsed'}`}
      style={{ 
        '--outline-height': `${height}px`
      } as React.CSSProperties}
    >
      {showResizeHandle && isExpanded && (
        <ResizeHandle
          direction="vertical"
          initialSize={height}
          minSize={100}
          maxSize={2000}
          onResize={setHeight}
        />
      )}
      <ExplorerSection
        title="大纲"
        defaultExpanded={isExpanded}
        actions={actions}
        onExpandChange={handleExpandChange}
      >
        <div className="outline-content">
        {nodes.length === 0 ? (
          <div className="outline-empty">活动编辑器无法提供大纲信息</div>
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
      </ExplorerSection>
    </div>
  );
};

export default OutlineSection;

