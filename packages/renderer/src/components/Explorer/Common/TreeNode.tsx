/**
 * Shared explorer tree node primitives.
 * Provides reusable row and child-container building blocks for tree-based views.
 */

import React from 'react';
import './TreeNode.scss';

export interface TreeNodeRowProps {
  depth: number;
  parentDepth?: number;
  selected?: boolean;
  contextMenuActive?: boolean;
  creating?: boolean;
  editing?: boolean;
  nodeClassName?: string;
  contentClassName?: string;
  title?: string;
  dataFilePath?: string;
  role?: React.AriaRole;
  tabIndex?: number;
  ariaSelected?: boolean;
  ariaExpanded?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  leading?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export interface TreeChildrenProps {
  parentDepth?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const joinClasses = (...values: Array<string | false | null | undefined>): string =>
  values.filter(Boolean).join(' ');

export const TreeNodeRow: React.FC<TreeNodeRowProps> = ({
  depth,
  parentDepth,
  selected = false,
  contextMenuActive = false,
  creating = false,
  editing = false,
  nodeClassName,
  contentClassName,
  title,
  dataFilePath,
  role,
  tabIndex,
  ariaSelected,
  ariaExpanded,
  onClick,
  onDoubleClick,
  onContextMenu,
  onKeyDown,
  onMouseDown,
  onMouseUp,
  leading,
  icon,
  children,
}) => {
  return (
    <div
      className={joinClasses('file-tree-node', nodeClassName)}
      data-parent-depth={parentDepth}
    >
      <div
        role={role}
        tabIndex={tabIndex}
        title={title}
        data-depth={depth}
        data-file-path={dataFilePath}
        aria-selected={ariaSelected}
        aria-expanded={ariaExpanded}
        className={joinClasses(
          'file-tree-node-content',
          selected && 'selected',
          contextMenuActive && 'context-menu-active',
          creating && 'creating',
          editing && 'editing',
          contentClassName,
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        {leading}
        {icon}
        {children}
      </div>
    </div>
  );
};

export const TreeChildren: React.FC<TreeChildrenProps> = ({
  parentDepth,
  className,
  style,
  children,
}) => {
  return (
    <div
      className={joinClasses('file-tree-children', className)}
      style={style}
      data-parent-depth={parentDepth}
    >
      {children}
    </div>
  );
};

export default TreeNodeRow;
