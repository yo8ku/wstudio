import React from 'react';
import { OutlineNode as OutlineNodeType, OutlineSymbolKind } from './types';

export interface OutlineNodeProps {
  node: OutlineNodeType;
  level?: number;
  selected?: boolean;
  onSelect: (node: OutlineNodeType) => void;
  onToggle?: (node: OutlineNodeType) => void;
}

/**
 * 大纲节点组件
 * 显示代码符号（类、方法、属性等）
 */
export const OutlineNode: React.FC<OutlineNodeProps> = ({
  node,
  level = 0,
  selected = false,
  onSelect,
  onToggle,
}) => {
  const hasChildren = node.children && node.children.length > 0;

  const getIcon = (kind: OutlineSymbolKind): string => {
    switch (kind) {
      case OutlineSymbolKind.Class:
        return '🟣'; // 类
      case OutlineSymbolKind.Interface:
        return '🔵'; // 接口
      case OutlineSymbolKind.Method:
      case OutlineSymbolKind.Function:
        return '🟡'; // 方法/函数
      case OutlineSymbolKind.Property:
      case OutlineSymbolKind.Field:
        return '🟢'; // 属性/字段
      case OutlineSymbolKind.Variable:
      case OutlineSymbolKind.Constant:
        return '🟠'; // 变量/常量
      case OutlineSymbolKind.Enum:
        return '🟤'; // 枚举
      case OutlineSymbolKind.Constructor:
        return '🔨'; // 构造函数
      default:
        return '◦';
    }
  };

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
        className={`outline-node-content ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <span className="outline-chevron" onClick={handleToggle}>
            {node.expanded ? '▼' : '▶'}
          </span>
        )}
        <span className="outline-icon">{getIcon(node.kind)}</span>
        <span className="outline-name">{node.name}</span>
      </div>

      {hasChildren && node.expanded && (
        <div className="outline-children">
          {node.children!.map((child) => (
            <OutlineNode
              key={child.id}
              node={child}
              level={level + 1}
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


