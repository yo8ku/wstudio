import React from 'react';
import { OutlineNode as OutlineNodeType, OutlineSymbolKind } from './types';

export interface OutlineNodeProps {
  node: OutlineNodeType;
  level?: number;
  selected?: boolean;
  onSelect: (node: OutlineNodeType) => void;
  onToggle?: (node: OutlineNodeType) => void;
}

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
        return 'codicon-symbol-class';
      case OutlineSymbolKind.Interface:
        return 'codicon-symbol-interface';
      case OutlineSymbolKind.Method:
        return 'codicon-symbol-method';
      case OutlineSymbolKind.Function:
        return 'codicon-symbol-function';
      case OutlineSymbolKind.Property:
        return 'codicon-symbol-property';
      case OutlineSymbolKind.Field:
        return 'codicon-symbol-field';
      case OutlineSymbolKind.Variable:
        return 'codicon-symbol-variable';
      case OutlineSymbolKind.Constant:
        return 'codicon-symbol-constant';
      case OutlineSymbolKind.Enum:
        return 'codicon-symbol-enum';
      case OutlineSymbolKind.Constructor:
        return 'codicon-symbol-constructor';
      case OutlineSymbolKind.String:
        return 'codicon-symbol-string';
      case OutlineSymbolKind.Key:
        return 'codicon-symbol-key';
      case OutlineSymbolKind.TypeParameter:
        return 'codicon-symbol-type-parameter';
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