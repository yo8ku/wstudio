/**
 * TipTap 笔记编辑器组件
 * 基于 TipTap 的富文本编辑器，支持 Markdown、双向链接、标签和图片
 */

import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { ResizableImage } from './extensions/ResizableImage';
import { WikilinkNode } from './extensions/WikilinkNode';
import { TagNode } from './extensions/TagNode';
import { TipTapToolbar } from './TipTapToolbar';
import './TipTapNoteEditor.scss';

export interface TipTapNoteEditorProps {
  content: string;
  onChange?: (content: string) => void;
  onWikilinkClick?: (title: string) => void;
  onTagClick?: (tagName: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
}

/**
 * 检测 URL 是否为图片链接
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

export const TipTapNoteEditor: React.FC<TipTapNoteEditorProps> = ({
  content,
  onChange,
  onWikilinkClick,
  onTagClick,
  placeholder = '开始写作...',
  editable = true,
  autoFocus = false,
}) => {
  // 链接预览状态
  const [linkPreview, setLinkPreview] = useState<{
    visible: boolean;
    url: string;
    x: number;
    y: number;
  }>({ visible: false, url: '', x: 0, y: 0 });
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  // 跟踪是否是内部更新，避免循环更新
  const isInternalUpdateRef = useRef(false);
  // 跟踪编辑器是否已初始化完成
  const isInitializedRef = useRef(false);
  // 跟踪上一次的 content prop，用于检测外部内容变化
  const lastContentRef = useRef<string>(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
        horizontalRule: {
          HTMLAttributes: {
            class: 'tiptap-hr',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Typography,
      Link.configure({
        openOnClick: true,
        autolink: false,
        HTMLAttributes: {
          class: 'tiptap-link',
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
      WikilinkNode.configure({
        onWikilinkClick,
      }),
      TagNode.configure({
        onTagClick,
      }),
    ],
    content: (() => {
      console.log('[TipTap] Initial content received:', content?.substring(0, 300));
      console.log('[TipTap] Content has multiple <p> tags:', (content?.match(/<p[^>]*>/gi) || []).length);
      return content || '';
    })(),
    editable,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        
        // 处理拖放的文件
        if (event.dataTransfer?.files?.length) {
          const files = Array.from(event.dataTransfer.files);
          const imageFiles = files.filter(file => file.type.startsWith('image/'));
          
          if (imageFiles.length > 0) {
            event.preventDefault();
            
            imageFiles.forEach(file => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64 = e.target?.result as string;
                if (base64 && editor) {
                  editor.chain().focus().setImage({ src: base64 }).run();
                }
              };
              reader.readAsDataURL(file);
            });
            
            return true;
          }
        }
        
        // 处理拖放的图片 URL
        const url = event.dataTransfer?.getData('text/uri-list') || 
                    event.dataTransfer?.getData('text/plain') || '';
        
        if (url && isImageUrl(url)) {
          event.preventDefault();
          editor?.chain().focus().setImage({ src: url }).run();
          return true;
        }
        
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const base64 = e.target?.result as string;
                  if (base64 && editor) {
                    editor.chain().focus().setImage({ src: base64 }).run();
                  }
                };
                reader.readAsDataURL(file);
              }
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      // 跳过内部更新（包括初始化和 setContent）
      if (isInternalUpdateRef.current) {
        return;
      }
      // 跳过初始化时的第一次 onUpdate
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        return;
      }
      if (onChange) {
        const html = editor.getHTML();
        // 更新 lastContentRef，避免 useEffect 中的重复更新
        lastContentRef.current = html;
        onChange(html);
      }
    },
  });

  // 处理链接悬停预览
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a.tiptap-link');
      
      if (link) {
        const href = link.getAttribute('href');
        if (href && isImageUrl(href)) {
          // 清除之前的定时器
          if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
          }
          
          // 延迟显示预览
          previewTimeoutRef.current = setTimeout(() => {
            const rect = link.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            setLinkPreview({
              visible: true,
              url: href,
              x: rect.left - containerRect.left,
              y: rect.bottom - containerRect.top + 8,
            });
          }, 300);
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const relatedTarget = e.relatedTarget as HTMLElement;
      
      // 如果鼠标移动到预览框上，不隐藏
      if (relatedTarget?.closest('.link-preview-popup')) {
        return;
      }
      
      if (target.closest('a.tiptap-link')) {
        if (previewTimeoutRef.current) {
          clearTimeout(previewTimeoutRef.current);
        }
        setLinkPreview(prev => ({ ...prev, visible: false }));
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  // 当外部 content 变化时更新编辑器内容（仅当非内部更新时）
  useEffect(() => {
    // 如果是内部更新触发的，跳过
    if (isInternalUpdateRef.current) {
      return;
    }
    // 只有当 content prop 真正变化时才更新（排除自己触发的更新）
    // 比较 content 和上次的 content，而不是和 editor.getHTML()
    if (editor && content !== lastContentRef.current) {
      console.log('[TipTap] External content changed, updating editor');
      // 标记为内部更新，避免 setContent 触发的 onUpdate 回调
      isInternalUpdateRef.current = true;
      editor.commands.setContent(content || '');
      lastContentRef.current = content;
      // 延迟重置标记
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 0);
    }
  }, [content, editor]);

  // 当 editable 变化时更新编辑器状态
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="tiptap-note-editor" ref={editorContainerRef}>
      <TipTapToolbar editor={editor} />
      <EditorContent editor={editor} className="tiptap-editor-content" />
      
      {/* 链接图片预览 */}
      {linkPreview.visible && linkPreview.url && (
        <div 
          className="link-preview-popup"
          style={{
            left: linkPreview.x,
            top: linkPreview.y,
          }}
          onMouseLeave={() => setLinkPreview(prev => ({ ...prev, visible: false }))}
        >
          <img 
            src={linkPreview.url} 
            alt="预览" 
            onError={() => setLinkPreview(prev => ({ ...prev, visible: false }))}
          />
        </div>
      )}
    </div>
  );
};

export default TipTapNoteEditor;
