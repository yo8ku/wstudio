/**
 * 行装饰器浮动菜单组件
 * 功能：在当前光标所在行的左侧显示拖拽手柄图标
 * 描述：使用 fixed 定位，跟随当前行位置，点击显示上下文菜单
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';

// --- Icons ---
import { HeadingOneIcon } from '@/components/tiptap-icons/heading-one-icon';
import { HeadingTwoIcon } from '@/components/tiptap-icons/heading-two-icon';
import { HeadingThreeIcon } from '@/components/tiptap-icons/heading-three-icon';
import { HeadingFourIcon } from '@/components/tiptap-icons/heading-four-icon';
import { HeadingFiveIcon } from '@/components/tiptap-icons/heading-five-icon';
import { HeadingSixIcon } from '@/components/tiptap-icons/heading-six-icon';
import { HeadingIcon } from '@/components/tiptap-icons/heading-icon';
import { ListIcon } from '@/components/tiptap-icons/list-icon';
import { ListOrderedIcon } from '@/components/tiptap-icons/list-ordered-icon';
import { ListTodoIcon } from '@/components/tiptap-icons/list-todo-icon';
import { BlockquoteIcon } from '@/components/tiptap-icons/blockquote-icon';
import { CodeBlockIcon } from '@/components/tiptap-icons/code-block-icon';
import { HighlightBlockIcon } from '@/components/tiptap-icons/highlight-block-icon';
import { ColumnsIcon } from '@/components/tiptap-icons/columns-icon';
import { FoldVerticalIcon } from '@/components/tiptap-icons/fold-vertical-icon';

import './LineDecoratorMenu.scss';

interface LineDecoratorMenuProps {
  editor: Editor | null;
}

interface MenuPosition {
  top: number;
  left: number;
  minLeft: number;
  visible: boolean;
  isHeading: boolean;
}

/**
 * 获取当前光标所在行的位置信息
 */
function getCurrentLinePosition(editor: Editor): MenuPosition | null {
  const { state, view } = editor;
  const { selection } = state;
  const { $head } = selection;

  // 找到光标所在的顶层块节点
  let blockPos: number | null = null;
  let blockNode = null;
  for (let depth = $head.depth; depth >= 0; depth--) {
    if (depth === 1) {
      blockPos = $head.before(depth);
      blockNode = $head.node(depth);
      break;
    }
  }

  if (blockPos === null) return null;

  try {
    // 获取块节点的 DOM 坐标
    const coords = view.coordsAtPos(blockPos + 1);
    
    // 找到编辑器内容区域的容器（.simple-editor-body）
    const editorBody = view.dom.closest('.simple-editor-body');
    if (!editorBody) {
      return null;
    }
    const bodyRect = editorBody.getBoundingClientRect();

    // 装饰器图标放在文本左侧 44px 处
    const decoratorLeft = coords.left - 44;
    // 最小 left 值为编辑器区域左边界 + 4px 边距
    const minLeft = bodyRect.left + 4;

    // 检查是否是标题节点
    const isHeading = blockNode?.type.name === 'heading';

    return {
      top: coords.top,
      left: Math.max(decoratorLeft, minLeft),
      minLeft: minLeft,
      visible: true,
      isHeading,
    };
  } catch {
    return null;
  }
}

export const LineDecoratorMenu: React.FC<LineDecoratorMenuProps> = ({ editor }) => {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastPosition, setLastPosition] = useState<MenuPosition | null>(null);
  const [showConvertSubmenu, setShowConvertSubmenu] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'bottom' | 'top'>('bottom');
  const menuRef = useRef<HTMLDivElement>(null);
  const decoratorRef = useRef<HTMLDivElement>(null);

  // 菜单预估高度（4个菜单项 + 分隔线）
  const MENU_HEIGHT = 140;

  // 更新位置
  const updatePosition = useCallback(() => {
    if (!editor) return;

    const pos = getCurrentLinePosition(editor);
    if (pos) {
      setPosition(pos);
      setLastPosition(pos);
    }
  }, [editor]);

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    // 初始更新
    updatePosition();

    // 监听选区变化
    const handleSelectionUpdate = () => {
      // 如果菜单打开，不更新位置
      if (!isMenuOpen) {
        updatePosition();
      }
    };

    // 监听内容变化
    const handleUpdate = () => {
      if (!isMenuOpen) {
        updatePosition();
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('update', handleUpdate);
    editor.on('focus', handleSelectionUpdate);

    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('update', handleUpdate);
      editor.off('focus', handleSelectionUpdate);
    };
  }, [editor, updatePosition, isMenuOpen]);

  // 监听滚动事件，更新装饰器位置
  useEffect(() => {
    if (!editor) return;

    const editorBody = editor.view.dom.closest('.simple-editor-body');
    if (!editorBody) return;

    const handleScroll = () => {
      // 滚动时更新位置
      updatePosition();
    };

    editorBody.addEventListener('scroll', handleScroll);

    return () => {
      editorBody.removeEventListener('scroll', handleScroll);
    };
  }, [editor, updatePosition]);

  // 处理点击外部关闭菜单
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        decoratorRef.current &&
        !decoratorRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  // 处理菜单操作
  const handleMenuAction = useCallback(
    (action: string) => {
      if (!editor) return;

      const { state, dispatch } = editor.view;
      const { selection } = state;
      const { $head } = selection;

      // 找到当前块节点
      let blockPos: number | null = null;
      let blockNode = null;
      for (let depth = $head.depth; depth >= 0; depth--) {
        if (depth === 1) {
          blockPos = $head.before(depth);
          blockNode = $head.node(depth);
          break;
        }
      }

      if (blockPos === null || !blockNode) return;

      const nodeEnd = blockPos + blockNode.nodeSize;

      switch (action) {
        case 'delete': {
          const tr = state.tr.delete(blockPos, nodeEnd);
          dispatch(tr);
          break;
        }
        case 'copy': {
          const text = blockNode.textContent;
          navigator.clipboard.writeText(text);
          break;
        }
        case 'cut': {
          const text = blockNode.textContent;
          navigator.clipboard.writeText(text);
          const tr = state.tr.delete(blockPos, nodeEnd);
          dispatch(tr);
          break;
        }
        case 'heading1':
        case 'heading2':
        case 'heading3':
        case 'heading4':
        case 'heading5':
        case 'heading6': {
          const level = parseInt(action.replace('heading', ''), 10);
          editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
          break;
        }
        case 'paragraph': {
          editor.chain().focus().setParagraph().run();
          break;
        }
        case 'bulletList': {
          editor.chain().focus().toggleBulletList().run();
          break;
        }
        case 'orderedList': {
          editor.chain().focus().toggleOrderedList().run();
          break;
        }
        case 'taskList': {
          editor.chain().focus().toggleTaskList().run();
          break;
        }
        case 'blockquote': {
          editor.chain().focus().toggleBlockquote().run();
          break;
        }
        case 'codeBlock': {
          editor.chain().focus().toggleCodeBlock().run();
          break;
        }
      }

      setIsMenuOpen(false);
      setShowConvertSubmenu(false);
    },
    [editor]
  );

  // 使用的位置：菜单打开时使用 lastPosition，否则使用 position
  const displayPosition = isMenuOpen ? lastPosition : position;
  const shouldShow = displayPosition?.visible && (editor?.isFocused || isMenuOpen);

  if (!shouldShow || !displayPosition) {
    return null;
  }

  // 处理点击装饰器图标
  const handleGripClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 计算菜单应该显示在上方还是下方
    if (displayPosition) {
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - displayPosition.top - 24;
      
      if (spaceBelow < MENU_HEIGHT) {
        setMenuPlacement('top');
      } else {
        setMenuPlacement('bottom');
      }
    }
    
    setIsMenuOpen(!isMenuOpen);
    setShowConvertSubmenu(false);
  };

  // 计算菜单的 top 位置
  const getMenuTop = () => {
    if (!displayPosition) return 0;
    
    if (menuPlacement === 'top') {
      // 向上显示：装饰器图标位置 - 菜单高度
      return displayPosition.top - MENU_HEIGHT;
    }
    // 向下显示：装饰器图标位置 + 偏移
    return displayPosition.top + 24;
  };

  return (
    <>
      {/* 装饰器图标 */}
      <div
        ref={decoratorRef}
        className="line-decorator-floating"
        style={{
          position: 'fixed',
          top: displayPosition.top,
          left: displayPosition.left,
          zIndex: 100,
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div
          className="grip-icon"
          role="button"
          tabIndex={0}
          aria-label="拖拽或点击打开菜单"
          onClick={handleGripClick}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.5" />
            <circle cx="11" cy="4" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="11" cy="12" r="1.5" />
          </svg>
        </div>
      </div>

      {/* 上下文菜单 */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className={`line-decorator-menu ${menuPlacement === 'top' ? 'placement-top' : ''}`}
          style={{
            position: 'fixed',
            top: getMenuTop(),
            left: displayPosition.left,
            zIndex: 10000,
          }}
        >
          {/* 转换为 - 带子菜单 */}
          <div
            className="line-decorator-menu-item has-submenu"
            onMouseEnter={() => setShowConvertSubmenu(true)}
            onMouseLeave={() => setShowConvertSubmenu(false)}
          >
            <span>转换为</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            
            {/* 子菜单 - 横向图标布局 */}
            {showConvertSubmenu && (
              <div className="line-decorator-submenu">
                {/* 第一行：H1-H6 */}
                <div className="submenu-group">
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('heading1')}
                    title="标题 1"
                  >
                    <HeadingOneIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('heading2')}
                    title="标题 2"
                  >
                    <HeadingTwoIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('heading3')}
                    title="标题 3"
                  >
                    <HeadingThreeIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('heading4')}
                    title="标题 4"
                  >
                    <HeadingFourIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('heading5')}
                    title="标题 5"
                  >
                    <HeadingFiveIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('heading6')}
                    title="标题 6"
                  >
                    <HeadingSixIcon className="menu-icon" />
                  </div>
                </div>
                {/* 第二行：文本、无序列表、有序列表、任务列表、代码块 */}
                <div className="submenu-group">
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('paragraph')}
                    title="文本"
                  >
                    <HeadingIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('bulletList')}
                    title="无序列表"
                  >
                    <ListIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('orderedList')}
                    title="有序列表"
                  >
                    <ListOrderedIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('taskList')}
                    title="任务列表"
                  >
                    <ListTodoIcon className="menu-icon" />
                  </div>
                  <div
                    className="submenu-icon-item"
                    onClick={() => handleMenuAction('codeBlock')}
                    title="代码块"
                  >
                    <CodeBlockIcon className="menu-icon" />
                  </div>
                </div>
                {/* 第三行：高亮块、引用（带文字） */}
                <div className="submenu-group submenu-group-labeled">
                  <div
                    className="submenu-labeled-item"
                    onClick={() => handleMenuAction('highlightBlock')}
                    title="高亮块"
                  >
                    <HighlightBlockIcon className="menu-icon" />
                    <span>高亮块</span>
                  </div>
                  <div
                    className="submenu-labeled-item"
                    onClick={() => handleMenuAction('blockquote')}
                    title="引用"
                  >
                    <BlockquoteIcon className="menu-icon" />
                    <span>引用</span>
                  </div>
                </div>
                {/* 第四行：分栏、折叠块（带文字） */}
                <div className="submenu-group submenu-group-labeled">
                  <div
                    className="submenu-labeled-item"
                    onClick={() => handleMenuAction('columns')}
                    title="分栏"
                  >
                    <ColumnsIcon className="menu-icon" />
                    <span>分栏</span>
                  </div>
                  <div
                    className="submenu-labeled-item"
                    onClick={() => handleMenuAction('details')}
                    title="折叠块"
                  >
                    <FoldVerticalIcon className="menu-icon" />
                    <span>折叠块</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="line-decorator-menu-divider" />
          <div
            className="line-decorator-menu-item"
            onClick={() => handleMenuAction('delete')}
          >
            删除
          </div>
          <div
            className="line-decorator-menu-item"
            onClick={() => handleMenuAction('copy')}
          >
            复制
          </div>
          <div
            className="line-decorator-menu-item"
            onClick={() => handleMenuAction('cut')}
          >
            剪切
          </div>
        </div>
      )}
    </>
  );
};

export default LineDecoratorMenu;
