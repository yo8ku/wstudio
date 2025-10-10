import React, { useState } from 'react';
import { FileTreeNode as FileTreeNodeType, FileTreeCallbacks } from './types';
import { InlineInput } from '../Common/InlineInput';
import { DragDropHandler } from './DragDropHandler';
import { FileIcon } from './FileIcons';
import { Icon } from '../../Icons';
import './FileTreeNode.scss';

export interface FileTreeNodeProps {
  node: FileTreeNodeType;
  level?: number;
  selected?: boolean;
  focused?: boolean;
  selectedFilePath?: string;
  callbacks: FileTreeCallbacks;
  dragDropHandler?: DragDropHandler;
}

/**
 * 文件树节点组件
 * 递归渲染文件和文件夹
 */
export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level = 0,
  selected = false,
  focused = false,
  selectedFilePath,
  callbacks,
  dragDropHandler,
}) => {
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const isDirectory = node.type === 'directory';
  const hasChildren = isDirectory && node.children && node.children.length > 0;
  
  // 判断是否选中：使用传入的 selectedFilePath 或 selected prop
  const isSelected = selectedFilePath ? node.path === selectedFilePath : selected;

  // 点击箭头 - 仅切换展开/折叠
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      callbacks.onFolderToggle(node);
    }
  };

  // 点击节点内容 - 单击文件夹展开，单击文件选中，双击文件打开
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 如果是正在创建的节点，点击其他地方时取消创建
    if (node.isCreating) {
      return;
    }

    // 文件夹：单击直接展开/折叠并选中
    if (isDirectory) {
      callbacks.onFileClick(node); // 选中
      callbacks.onFolderToggle(node); // 展开/折叠
      return;
    }

    // 文件：处理单击和双击
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      // 双击文件打开
      callbacks.onFileDoubleClick(node);
    } else {
      // 单击延迟处理 - 仅选中
      const timeout = setTimeout(() => {
        callbacks.onFileClick(node);
        setClickTimeout(null);
      }, 250);
      setClickTimeout(timeout);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onContextMenu(node, e);
  };

  const handleRename = (newName: string) => {
    if (callbacks.onRename) {
      callbacks.onRename(node, newName);
    }
  };
  
  const handleCreateConfirm = (name: string) => {
    if (callbacks.onCreateConfirm) {
      callbacks.onCreateConfirm(node, name);
    }
  };
  
  const handleCreateCancel = () => {
    if (callbacks.onCreateCancel) {
      callbacks.onCreateCancel(node);
    }
  };


  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-node-content ${isSelected ? 'selected' : ''} ${
          focused ? 'focused' : ''
        } ${node.isEditing ? 'editing' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px`, minHeight: '22px' }}
        data-file-path={node.path}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={!node.isEditing}
        onDragStart={(e) => dragDropHandler?.handleDragStart(node, e)}
        onDragOver={(e) => dragDropHandler?.handleDragOver(node, e)}
        onDragEnter={(e) => dragDropHandler?.handleDragEnter(node, e)}
        onDragLeave={(e) => dragDropHandler?.handleDragLeave(e)}
        onDrop={(e) => dragDropHandler?.handleDrop(node, e, callbacks.onDrop)}
        onDragEnd={(e) => dragDropHandler?.handleDragEnd(e)}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isDirectory ? node.isExpanded : undefined}
        tabIndex={focused ? 0 : -1}
      >
        {/* 箭头或占位符 - 保持对齐 */}
        <span 
          className="file-tree-chevron"
          onClick={isDirectory ? handleChevronClick : undefined}
          style={{ visibility: isDirectory ? 'visible' : 'hidden' }}
        >
          {isDirectory && (
            <Icon 
              name={node.isExpanded ? 'expand-more' : 'chevron-right'} 
              size={16}
            />
          )}
        </span>
        <span className="file-tree-icon">
          <FileIcon
            fileName={isDirectory ? undefined : node.name}
            folderName={isDirectory ? node.name : undefined}
            isFolder={isDirectory}
            isExpanded={node.isExpanded}
            size={16}
          />
        </span>
        {node.isCreating ? (
          <InlineInput
            initialValue=""
            onConfirm={handleCreateConfirm}
            onCancel={handleCreateCancel}
            autoFocus
          />
        ) : node.isEditing ? (
          <InlineInput
            initialValue={node.name}
            onConfirm={handleRename}
            onCancel={() => {
              // 取消编辑
            }}
          />
        ) : (
          <span className="file-tree-name">{node.name}</span>
        )}
      </div>

      {isDirectory && node.isExpanded && hasChildren && (
        <div className="file-tree-children">
          {node.children!.map((child) => (
            <FileTreeNode
              key={child.id || child.path}
              node={child}
              level={level + 1}
              selectedFilePath={selectedFilePath}
              callbacks={callbacks}
              dragDropHandler={dragDropHandler}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FileTreeNode;

