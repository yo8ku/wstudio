import React from 'react';
import { Icon } from '../../Icons/Icon';
import { OutlineNode as OutlineNodeType } from './types';

export interface OutlineNodeProps {
  node: OutlineNodeType;
  level?: number;
  selectedNodeId?: string;
  onSelect: (node: OutlineNodeType) => void;
  onToggle?: (node: OutlineNodeType) => void;
}

export const OutlineNode: React.FC<OutlineNodeProps> = ({
  node,
  level = 0,
  selectedNodeId,
  onSelect,
  onToggle,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedNodeId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggle && hasChildren) {
      onToggle(node);
    }
  };

  return (
    <div className="outline-node">
      <div
        className={`outline-node-content ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <Icon
            name={node.expanded ? 'chevron-down' : 'chevron-right'}
            size={12}
            className="outline-chevron"
            onClick={handleToggle}
          />
        ) : (
          <span className="outline-chevron" />
        )}
        <span className="outline-name">{node.name}</span>
      </div>

      {hasChildren && node.expanded && (
        <div className="outline-children" data-parent-level={level}>
          {node.children!.map((child) => (
            <OutlineNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default OutlineNode;
