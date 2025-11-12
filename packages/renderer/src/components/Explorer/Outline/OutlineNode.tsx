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
 * 显示代码符号（类、方法、属性等 */
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
        return 'codicon-symbol-class'; //       case OutlineSymbolKind.Interface:
        return 'codicon-symbol-interface'; // 接口
      case OutlineSymbolKind.Method:
        return 'codicon-symbol-method'; // 方法
      case OutlineSymbolKind.Function:
        return 'codicon-symbol-function'; // 函数
      case OutlineSymbolKind.Property:
        return 'codicon-symbol-property'; // 属      case OutlineSymbolKind.Field:
        return 'codicon-symbol-field'; // 字段
      case OutlineSymbolKind.Variable:
        return 'codicon-symbol-variable'; // 变量
      case OutlineSymbolKind.Constant:
        return 'codicon-symbol-constant'; // 常量
      case OutlineSymbolKind.Enum:
        return 'codicon-symbol-enum'; // 枚举
      case OutlineSymbolKind.Constructor:
        return 'codicon-symbol-constructor'; // 构造函数      case OutlineSymbolKind.String:
        return 'codicon-symbol-string'; // Markdown 标题使用字符串图标      case OutlineSymbolKind.Key:
        return 'codicon-symbol-key'; // JSON       case OutlineSymbolKind.TypeParameter:
        return 'codicon-symbol-type-parameter'; // Type 类型
      default:
        return 'codicon-symbol-misc';
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
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <i 
            className={`outline-chevron codicon ${node.expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}
            onClick={handleToggle}
          />
        )}
        {!hasChildren && <span className="outline-chevron" />}
        <i className={`outline-icon codicon ${getIcon(node.kind)}`} />
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


