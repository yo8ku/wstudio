/**
 * TipTap 工具栏组件
 * 提供格式化按钮和插入功能
 */

import React, { useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Icon } from '../Icons';
import './TipTapToolbar.scss';

interface TipTapToolbarProps {
  editor: Editor;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}) => (
  <div
    className={`toolbar-button ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
    onClick={disabled ? undefined : onClick}
    title={title}
    role="button"
    tabIndex={disabled ? -1 : 0}
    onKeyDown={(e) => {
      if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
        onClick();
      }
    }}
  >
    {children}
  </div>
);

const ToolbarDivider: React.FC = () => <div className="toolbar-divider" />;

export const TipTapToolbar: React.FC<TipTapToolbarProps> = ({ editor }) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');


  // 设置链接
  const setLink = useCallback(() => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setShowLinkInput(false);
    }
  }, [editor, linkUrl]);

  // 移除链接
  const removeLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
  }, [editor]);

  // 插入双向链接
  const insertWikilink = useCallback(() => {
    const title = prompt('输入笔记标题:');
    if (title) {
      editor.chain().focus().setWikilink({ title }).run();
    }
  }, [editor]);

  // 插入标签
  const insertTag = useCallback(() => {
    const name = prompt('输入标签名称:');
    if (name) {
      editor.chain().focus().setTag({ name }).run();
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="tiptap-toolbar">
      {/* 标题 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="标题 1 (Ctrl+Alt+1)"
      >
        <span className="toolbar-text">H1</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="标题 2 (Ctrl+Alt+2)"
      >
        <span className="toolbar-text">H2</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="标题 3 (Ctrl+Alt+3)"
      >
        <span className="toolbar-text">H3</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 文本格式 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="加粗 (Ctrl+B)"
      >
        <span className="toolbar-text bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="斜体 (Ctrl+I)"
      >
        <span className="toolbar-text italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="删除线 (Ctrl+Shift+X)"
      >
        <span className="toolbar-text strike">S</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="行内代码 (Ctrl+E)"
      >
        <span className="toolbar-text mono">{'{}'}</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title="高亮"
      >
        <span className="toolbar-text highlight">H</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 列表 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="无序列表"
      >
        <Icon name="menu" size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="有序列表"
      >
        <span className="toolbar-text">1.</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title="任务列表"
      >
        <Icon name="check" size={14} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 引用和代码块 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="引用"
      >
        <span className="toolbar-text">"</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="代码块"
      >
        <span className="toolbar-text mono">{'</>'}</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 链接 */}
      {showLinkInput ? (
        <div className="link-input-container">
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="输入链接地址..."
            className="link-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
              }
            }}
            autoFocus
          />
          <ToolbarButton onClick={setLink} title="确认">
            <Icon name="check" size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} title="取消">
            <Icon name="close" size={14} />
          </ToolbarButton>
        </div>
      ) : (
        <>
          <ToolbarButton
            onClick={() => setShowLinkInput(true)}
            isActive={editor.isActive('link')}
            title="插入链接"
          >
            <Icon name="links" size={14} />
          </ToolbarButton>
          {editor.isActive('link') && (
            <ToolbarButton onClick={removeLink} title="移除链接">
              <Icon name="close" size={14} />
            </ToolbarButton>
          )}
        </>
      )}

      <ToolbarDivider />

      {/* 笔记专用功能 */}
      <ToolbarButton onClick={insertWikilink} title="插入双向链接 [[]]">
        <Icon name="backlinks" size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={insertTag} title="插入标签 #">
        <Icon name="tags" size={14} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* 撤销/重做 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="撤销 (Ctrl+Z)"
      >
        <Icon name="refresh" size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="重做 (Ctrl+Y)"
      >
        <Icon name="refresh" size={14} />
      </ToolbarButton>
    </div>
  );
};

export default TipTapToolbar;
