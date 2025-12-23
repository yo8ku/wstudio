/**
 * 简单笔记编辑器组件
 * 功能：基于 TipTap 官方模板的富文本编辑器
 * 描述：封装官方 SimpleEditor 模板，支持 content 和 onChange props
 */

import { useEffect, useRef, useState } from 'react';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';

// --- Tiptap Core Extensions ---
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';

// --- Custom Extensions ---
import { ResizableImage } from '@/components/NoteEditor/extensions/ResizableImage';
import { LineDecorator } from '@/components/NoteEditor/extensions/LineDecorator';
import { TabIndent } from '@/components/NoteEditor/extensions/TabIndent';
import { BlockBackground } from '@/components/NoteEditor/extensions/BlockBackground';
import { ColorBlock } from '@/components/NoteEditor/extensions/ColorBlock';

// --- Custom Components ---
import { EditorOutline } from '@/components/NoteEditor/components/EditorOutline';

// --- UI Primitives ---
import { Button } from '@/components/tiptap-ui-primitive/button';
import { Spacer } from '@/components/tiptap-ui-primitive/spacer';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/tiptap-ui-primitive/toolbar';

// --- Tiptap Node ---
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension';
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';
import '@/components/tiptap-node/heading-node/heading-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';

// --- Tiptap UI ---
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ImageUploadButton } from '@/components/tiptap-ui/image-upload-button';
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from '@/components/tiptap-ui/color-highlight-popover';
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from '@/components/tiptap-ui/link-popover';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';

// --- Icons ---
import { ArrowLeftIcon } from '@/components/tiptap-icons/arrow-left-icon';
import { HighlighterIcon } from '@/components/tiptap-icons/highlighter-icon';
import { LinkIcon } from '@/components/tiptap-icons/link-icon';

// --- Hooks ---
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils';

// --- Styles ---
import '@/components/tiptap-templates/simple/simple-editor.scss';
import '@/components/NoteEditor/TipTapNoteEditor.scss';

export interface SimpleNoteEditorProps {
  content: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void;
  onLinkClick: () => void;
  isMobile: boolean;
}) => {
  return (
    <>
      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} portal={isMobile} />
        <ListDropdownMenu
          types={['bulletList', 'orderedList', 'taskList']}
          portal={isMobile}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />
    </>
  );
};

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: 'highlighter' | 'link';
  onBack: () => void;
}) => (
  <>
    <ToolbarGroup>
      <Button data-style="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === 'highlighter' ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === 'highlighter' ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
);

/**
 * 检测 URL 是否为图片链接
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

export const SimpleNoteEditor: React.FC<SimpleNoteEditorProps> = ({
  content,
  onChange,
  editable = true,
}) => {
  const isMobile = useIsBreakpoint();
  const [mobileView, setMobileView] = useState<'main' | 'highlighter' | 'link'>(
    'main'
  );
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  // 跟踪是否是内部更新
  const isInternalUpdateRef = useRef(false);
  // 跟踪上一次的 content prop
  const lastContentRef = useRef<string>(content);

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Main content area, start typing to enter text.',
        class: 'simple-editor',
      },
      // 处理图片拖拽
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) return false;
        
        // 处理拖放的文件
        if (dataTransfer.files?.length) {
          const files = Array.from(dataTransfer.files);
          const imageFiles = files.filter(file => file.type.startsWith('image/'));
          
          if (imageFiles.length > 0) {
            event.preventDefault();
            
            // 获取拖放位置
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            
            imageFiles.forEach(file => {
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64 = e.target?.result as string;
                if (base64) {
                  // 加载图片获取原始尺寸，然后设置为25%
                  const img = new Image();
                  img.onload = () => {
                    const width = Math.round(img.naturalWidth * 0.25);
                    const height = Math.round(img.naturalHeight * 0.25);
                    const { state, dispatch } = view;
                    const node = state.schema.nodes.image.create({ 
                      src: base64,
                      width,
                      height
                    });
                    const pos = coordinates?.pos ?? state.selection.from;
                    const tr = state.tr.insert(pos, node);
                    dispatch(tr);
                  };
                  img.src = base64;
                }
              };
              reader.readAsDataURL(file);
            });
            
            return true;
          }
        }
        
        // 处理拖放的图片 URL
        const url = dataTransfer.getData('text/uri-list') || 
                    dataTransfer.getData('text/plain') || '';
        
        if (url && isImageUrl(url)) {
          event.preventDefault();
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          
          // 加载图片获取原始尺寸，然后设置为25%
          const img = new Image();
          img.onload = () => {
            const width = Math.round(img.naturalWidth * 0.25);
            const height = Math.round(img.naturalHeight * 0.25);
            const { state, dispatch } = view;
            const node = state.schema.nodes.image.create({ 
              src: url,
              width,
              height
            });
            const pos = coordinates?.pos ?? state.selection.from;
            const tr = state.tr.insert(pos, node);
            dispatch(tr);
          };
          img.src = url;
          
          return true;
        }
        
        return false;
      },
      // 处理图片粘贴
      handlePaste: (view, event) => {
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
                  if (base64) {
                    // 加载图片获取原始尺寸，然后设置为25%
                    const img = new Image();
                    img.onload = () => {
                      const width = Math.round(img.naturalWidth * 0.25);
                      const height = Math.round(img.naturalHeight * 0.25);
                      const { state, dispatch } = view;
                      const node = state.schema.nodes.image.create({ 
                        src: base64,
                        width,
                        height
                      });
                      const tr = state.tr.replaceSelectionWith(node);
                      dispatch(tr);
                    };
                    img.src = base64;
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
      // 处理 Tab 键缩进
      handleKeyDown: (_view, event) => {
        if (event.key === 'Tab') {
          return false; // 让 TipTap 扩展处理 Tab 键
        }
        return false;
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
      }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
      Typography,
      Superscript,
      Subscript,
      TextStyle,
      Color,
      BlockBackground.configure({
        types: ['heading', 'paragraph', 'blockquote', 'codeBlock'],
      }),
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error: Error) => console.error('Upload failed:', error),
      }),
      LineDecorator,
      TabIndent,
      ColorBlock,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor: ed }) => {
      // 跳过内部更新
      if (isInternalUpdateRef.current) {
        return;
      }
      if (onChange) {
        const html = ed.getHTML();
        lastContentRef.current = html;
        onChange(html);
      }
    },
  });

  // 当外部 content 变化时更新编辑器内容
  useEffect(() => {
    if (isInternalUpdateRef.current) {
      return;
    }
    if (editor && content !== lastContentRef.current) {
      isInternalUpdateRef.current = true;
      editor.commands.setContent(content || '');
      lastContentRef.current = content;
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

  useEffect(() => {
    if (!isMobile && mobileView !== 'main') {
      setMobileView('main');
    }
  }, [isMobile, mobileView]);

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar ref={toolbarRef}>
          {mobileView === 'main' ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView('highlighter')}
              onLinkClick={() => setMobileView('link')}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === 'highlighter' ? 'highlighter' : 'link'}
              onBack={() => setMobileView('main')}
            />
          )}
        </Toolbar>

        <div className="simple-editor-main">
          <div className="simple-editor-body">
            <EditorContent
              editor={editor}
              role="presentation"
              className="simple-editor-content"
            />
          </div>

          {/* 右侧大纲 */}
          <EditorOutline editor={editor} />
        </div>
      </EditorContext.Provider>
    </div>
  );
};

export default SimpleNoteEditor;
