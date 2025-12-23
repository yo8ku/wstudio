/**
 * 编辑器大纲组件
 * 功能：显示 TipTap 编辑器中的标题大纲，支持点击跳转
 * 描述：从编辑器内容中提取标题，构建层级大纲树，支持折叠子标题，支持色块大纲视图
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Editor } from '@tiptap/react';
import { ChevronDownIcon } from '@/components/tiptap-icons/chevron-down-icon';
import { ChevronRightIcon } from '@/components/tiptap-icons/chevron-right-icon';
import { TableOfContentsIcon } from '@/components/tiptap-icons/table-of-contents-icon';
import { DiscAlbumIcon } from '@/components/tiptap-icons/disc-album-icon';
import { PanelLeftOpenIcon } from '@/components/tiptap-icons/panel-left-open-icon';
import { PanelLeftCloseIcon } from '@/components/tiptap-icons/panel-left-close-icon';

import './EditorOutline.scss';

type ViewMode = 'outline' | 'colorBlock';

interface EditorOutlineProps {
  editor: Editor | null;
}

interface HeadingItem {
  id: string;
  text: string;
  level: number;
  pos: number;
  textColor: string | null;
}

interface HeadingTreeItem extends HeadingItem {
  children: HeadingTreeItem[];
}

interface ColorBlockItem {
  id: string;
  text: string;
  pos: number;
  color: string;
}

/**
 * 从节点中提取文字颜色
 */
function extractTextColor(node: import('@tiptap/pm/model').Node): string | null {
  let color: string | null = null;
  
  // 遍历节点内容，查找 textStyle mark 中的颜色
  node.forEach((child: import('@tiptap/pm/model').Node) => {
    if (color) return; // 已找到颜色，跳过
    
    child.marks.forEach((mark: import('@tiptap/pm/model').Mark) => {
      if (mark.type.name === 'textStyle' && mark.attrs.color) {
        color = mark.attrs.color as string;
      }
    });
  });
  
  return color;
}

/**
 * 从编辑器中提取标题
 */
function extractHeadings(editor: Editor): HeadingItem[] {
  const headings: HeadingItem[] = [];
  let idCounter = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const textColor = extractTextColor(node);
      headings.push({
        id: `heading-${idCounter++}`,
        text: node.textContent || '无标题',
        level: node.attrs.level as number,
        pos,
        textColor,
      });
    }
  });

  return headings;
}

/**
 * 将扁平标题列表转换为树形结构
 */
function buildHeadingTree(headings: HeadingItem[]): HeadingTreeItem[] {
  const tree: HeadingTreeItem[] = [];
  const stack: HeadingTreeItem[] = [];

  for (const heading of headings) {
    const item: HeadingTreeItem = { ...heading, children: [] };

    // 找到合适的父节点
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      tree.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }

    stack.push(item);
  }

  return tree;
}

export const EditorOutline: React.FC<EditorOutlineProps> = ({ editor }) => {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [colorBlocks, setColorBlocks] = useState<ColorBlockItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('outline');

  // 构建树形结构
  const headingTree = useMemo(() => buildHeadingTree(headings), [headings]);

  // 更新大纲
  const updateHeadings = useCallback(() => {
    if (!editor) {
      setHeadings([]);
      return;
    }
    const items = extractHeadings(editor);
    setHeadings(items);
  }, [editor]);

  // 更新色块列表
  const updateColorBlocks = useCallback(() => {
    if (!editor) {
      setColorBlocks([]);
      return;
    }

    const blocks: ColorBlockItem[] = [];
    let idCounter = 0;

    // 从文档中查找所有 colorBlock 节点
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'colorBlock') {
        const backgroundColor = node.attrs.backgroundColor as string;
        blocks.push({
          id: `color-block-${idCounter++}`,
          text: node.textContent || '无内容',
          pos,
          color: backgroundColor,
        });
      }
    });

    // 按位置排序
    blocks.sort((a, b) => a.pos - b.pos);
    setColorBlocks(blocks);
  }, [editor]);

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    // 初始更新
    updateHeadings();
    updateColorBlocks();

    // 监听内容变化
    const handleUpdate = () => {
      updateHeadings();
      updateColorBlocks();
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, updateHeadings, updateColorBlocks]);

  // 监听选区变化，高亮当前标题
  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      const { from } = editor.state.selection;
      
      // 找到当前位置之前最近的标题
      let currentHeading: HeadingItem | null = null;
      for (const heading of headings) {
        if (heading.pos <= from) {
          currentHeading = heading;
        } else {
          break;
        }
      }
      
      setActiveId(currentHeading?.id || null);
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    handleSelectionUpdate();

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, headings]);

  // 点击跳转到标题
  const handleClick = useCallback((heading: HeadingItem) => {
    if (!editor) return;

    editor.commands.setTextSelection(heading.pos + 1);
    editor.commands.scrollIntoView();
    
    // 聚焦编辑器
    editor.commands.focus();
  }, [editor]);

  // 点击跳转到色块
  const handleColorBlockClick = useCallback((block: ColorBlockItem) => {
    if (!editor) return;

    editor.commands.setTextSelection(block.pos + 1);
    editor.commands.scrollIntoView();
    editor.commands.focus();
  }, [editor]);

  // 切换标题折叠状态
  const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 切换面板展开/折叠
  const togglePanel = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  // 渲染标题项
  const renderHeadingItem = useCallback((item: HeadingTreeItem, depth: number = 0) => {
    const hasChildren = item.children.length > 0;
    const isCollapsed = collapsedIds.has(item.id);
    const isActive = activeId === item.id;

    return (
      <div key={item.id} className="editor-outline-tree-item">
        <div
          className={`editor-outline-item level-${item.level} ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => handleClick(item)}
        >
          {hasChildren ? (
            <span 
              className="editor-outline-toggle"
              onClick={(e) => toggleCollapse(item.id, e)}
            >
              {isCollapsed ? (
                <ChevronRightIcon className="editor-outline-toggle-icon" />
              ) : (
                <ChevronDownIcon className="editor-outline-toggle-icon" />
              )}
            </span>
          ) : (
            <span className="editor-outline-toggle-placeholder" />
          )}
          {item.textColor && (
            <span 
              className="editor-outline-color-indicator"
              style={{ backgroundColor: item.textColor }}
            />
          )}
          <span className="editor-outline-text">{item.text}</span>
        </div>
        {hasChildren && !isCollapsed && (
          <div className="editor-outline-children">
            {item.children.map(child => renderHeadingItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [activeId, collapsedIds, handleClick, toggleCollapse]);

  if (!editor) {
    return null;
  }

  // 折叠状态 - 只显示展开按钮
  if (collapsed) {
    return (
      <div className="editor-outline collapsed">
        <div 
          className="editor-outline-expand-btn"
          onClick={togglePanel}
          title="展开大纲"
        >
          <PanelLeftCloseIcon className="editor-outline-panel-icon" />
        </div>
      </div>
    );
  }

  return (
    <div className="editor-outline">
      <div className="editor-outline-header">
        <div className="editor-outline-header-icons">
          <span 
            title="大纲"
            className={`editor-outline-icon-btn ${viewMode === 'outline' ? 'active' : ''}`}
            onClick={() => setViewMode('outline')}
          >
            <TableOfContentsIcon className="editor-outline-title-icon" />
          </span>
          <span 
            title="色块大纲"
            className={`editor-outline-icon-btn ${viewMode === 'colorBlock' ? 'active' : ''}`}
            onClick={() => setViewMode('colorBlock')}
          >
            <DiscAlbumIcon className="editor-outline-title-icon" />
          </span>
        </div>
        <span 
          className="editor-outline-collapse-btn"
          onClick={togglePanel}
          title="折叠大纲"
        >
          <PanelLeftOpenIcon className="editor-outline-panel-icon" />
        </span>
      </div>
      {viewMode === 'outline' ? (
        // 标题大纲视图
        headings.length === 0 ? (
          <div className="editor-outline-empty">
            暂无大纲
          </div>
        ) : (
          <div className="editor-outline-list">
            {headingTree.map(item => renderHeadingItem(item))}
          </div>
        )
      ) : (
        // 色块大纲视图
        colorBlocks.length === 0 ? (
          <div className="editor-outline-empty">
            暂无色块
          </div>
        ) : (
          <div className="editor-outline-list">
            {colorBlocks.map(block => (
              <div 
                key={block.id} 
                className="editor-outline-color-block-item"
                style={{ backgroundColor: block.color }}
                onClick={() => handleColorBlockClick(block)}
              >
                <span className="editor-outline-text">{block.text}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default EditorOutline;
