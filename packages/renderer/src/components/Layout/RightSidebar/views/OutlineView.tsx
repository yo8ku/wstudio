/**
 * OutlineView.tsx
 * 章节大纲视图组件
 * 功能：解析 Markdown 标题结构，显示层级大纲，点击跳转
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNoteStore } from '../../../../stores/noteStore';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

/**
 * 大纲项接口
 */
interface OutlineItem {
  id: string;
  title: string;
  level: number;
  line: number;
  children: OutlineItem[];
}

/**
 * 扁平大纲项
 */
interface FlatOutlineItem {
  id: string;
  title: string;
  level: number;
  line: number;
}

/**
 * 从内容解析大纲
 */
const parseOutline = (content: string): FlatOutlineItem[] => {
  const items: FlatOutlineItem[] = [];
  const lines = content.split('\n');
  let idCounter = 0;

  const headingRegex = /^(#{1,6})\s+(.+)$/;

  lines.forEach((line, index) => {
    const match = line.match(headingRegex);
    if (match) {
      items.push({
        id: `heading-${idCounter++}`,
        title: match[2].trim(),
        level: match[1].length,
        line: index
      });
    }
  });

  return items;
};

/**
 * 构建大纲树
 */
const buildOutlineTree = (flatItems: FlatOutlineItem[]): OutlineItem[] => {
  if (flatItems.length === 0) return [];

  const root: OutlineItem[] = [];
  const stack: OutlineItem[] = [];

  for (const item of flatItems) {
    const outlineItem: OutlineItem = {
      ...item,
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(outlineItem);
    } else {
      stack[stack.length - 1].children.push(outlineItem);
    }

    stack.push(outlineItem);
  }

  return root;
};

export const OutlineView: React.FC = () => {
  const { currentNote } = useNoteStore();
  
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // 解析大纲
  useEffect(() => {
    if (currentNote?.content) {
      const flatItems = parseOutline(currentNote.content);
      const tree = buildOutlineTree(flatItems);
      setOutline(tree);
      
      // 默认展开所有项
      const allIds = new Set(flatItems.map(item => item.id));
      setExpandedItems(allIds);
    } else {
      setOutline([]);
    }
  }, [currentNote]);

  // 切换展开状态
  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 跳转到对应位置
  const handleJumpToLine = useCallback((line: number) => {
    // 发送跳转事件，由编辑器处理
    window.dispatchEvent(new CustomEvent('editor:jump-to-line', { 
      detail: { line } 
    }));
  }, []);

  // 渲染大纲项
  const renderOutlineItem = (item: OutlineItem, depth: number = 0): React.ReactNode => {
    const hasChildren = item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);

    return (
      <div key={item.id} className="outline-item-wrapper">
        <div
          className={`outline-item level-${item.level}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => handleJumpToLine(item.line)}
        >
          {hasChildren && (
            <div
              className={`outline-expand ${isExpanded ? 'expanded' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(item.id);
              }}
            >
              <Icon name="chevron-right" size={12} />
            </div>
          )}
          {!hasChildren && <div className="outline-expand-placeholder" />}
          <span className="outline-title">{item.title}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="outline-children">
            {item.children.map(child => renderOutlineItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 空状态 - 无当前笔记
  if (!currentNote) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="outline" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          请先打开一个笔记
        </div>
      </div>
    );
  }

  // 空状态 - 无大纲
  if (outline.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="outline" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无大纲
        </div>
        <div className="right-sidebar-empty-hint">
          使用 # 标题 创建章节结构
        </div>
      </div>
    );
  }

  return (
    <div className="outline-view-container">
      <div className="outline-header">
        <span className="outline-count">{outline.length} 个章节</span>
      </div>
      <div className="outline-tree">
        {outline.map(item => renderOutlineItem(item))}
      </div>
    </div>
  );
};
