/**
 * CodeMirror 编辑器组件
 * 功能：基于 CodeMirror 6 的 Markdown 编辑器
 * 描述：提供源码级别的 Markdown 编辑体验，支持语法高亮、图片拖拽、图片内联渲染、图片大小调整和背景色块
 * 支持源码模式和预览模式切换
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState, StateField, RangeSet, StateEffect, Prec, RangeSetBuilder, Range } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  Decoration,
  DecorationSet,
  WidgetType,
  gutter,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, indentUnit, foldService, codeFolding, foldedRanges, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { foldEffect, unfoldEffect } from '@codemirror/language';
import { Icon } from '../Icons';
import { CodeMirrorContextMenu, ContextMenuItem } from './components/CodeMirrorContextMenu';
import { VideoLinkInput } from './components/VideoLinkInput';
import { inlineAIChatField, openInlineAIChat, closeInlineAIChat, isInlineAIChatOpen } from './InlineAIChat';
import './CodeMirrorEditor.scss';
import './InlineAIChat/InlineAIChat.scss';
import { text } from 'stream/consumers';
import hljs from 'highlight.js';
import mermaid from 'mermaid';

/**
 * 编辑器模式类型
 */
export type EditorMode = 'source' | 'preview';

/**
 * 大纲项类型
 */
interface OutlineItem {
  id: string;
  level: number;
  text: string;
  lineNumber: number;
  position: number;
}

/**
 * 色块大纲项类型
 */
interface ColorBlockItem {
  id: string;
  color: string;
  lineNumber: number;
  text: string;
  position: number;
}

export interface CodeMirrorEditorProps {
  content: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  /** 初始模式，默认为 source */
  initialMode?: EditorMode;
  /** 是否显示大纲面板，默认为 true */
  showOutline?: boolean;
  /** 是否是当前激活的编辑器 */
  isActive?: boolean;
}

/**
 * 解析文档中的标题，生成大纲
 */
function parseOutline(doc: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = doc.split('\n');
  let position = 0;

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      items.push({
        id: `heading-${index}`,
        level: match[1].length,
        text: match[2].trim(),
        lineNumber: index + 1,
        position,
      });
    }
    position += line.length + 1; // +1 for newline
  });

  return items;
}

/**
 * 解析文档中的色块
 */
function parseColorBlocks(backgrounds: Map<number, string>, doc: string): ColorBlockItem[] {
  const items: ColorBlockItem[] = [];
  const lines = doc.split('\n');
  let position = 0;

  // 按行号分组连续的色块
  const colorGroups: { startLine: number; endLine: number; color: string }[] = [];
  let currentGroup: { startLine: number; endLine: number; color: string } | null = null;

  const sortedLines = Array.from(backgrounds.entries()).sort((a, b) => a[0] - b[0]);

  sortedLines.forEach(([lineNum, color]) => {
    if (currentGroup && currentGroup.color === color && lineNum === currentGroup.endLine + 1) {
      currentGroup.endLine = lineNum;
    } else {
      if (currentGroup) {
        colorGroups.push(currentGroup);
      }
      currentGroup = { startLine: lineNum, endLine: lineNum, color };
    }
  });

  if (currentGroup) {
    colorGroups.push(currentGroup);
  }

  // 为每个色块组生成大纲项
  colorGroups.forEach((group, index) => {
    const lineIndex = group.startLine - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      // 计算位置
      let pos = 0;
      for (let i = 0; i < lineIndex; i++) {
        pos += lines[i].length + 1;
      }

      // 获取第一行文本作为预览
      const previewText = lines[lineIndex].substring(0, 30) + (lines[lineIndex].length > 30 ? '...' : '');

      items.push({
        id: `colorblock-${index}`,
        color: group.color,
        lineNumber: group.startLine,
        text: previewText || `第 ${group.startLine} 行`,
        position: pos,
      });
    }
  });

  return items;
}

// 存储 EditorView 引用，供 Widget 使用
let globalEditorView: EditorView | null = null;

// 当前选中的图片 src（用于在 Widget 重建后恢复选中状态）
let selectedImageSrc: string | null = null;

/**
 * 获取行的缩进级别（空格数）
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * 检测行是否为标题
 */
function getHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

/**
 * 检测行是否为列表项（有序或无序）
 */
function isListItem(line: string): boolean {
  const trimmed = line.trimStart();
  // 无序列表: - item, * item, + item
  // 有序列表: 1. item, 2. item, etc.
  return /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
}

/**
 * 计算标题折叠范围
 * 标题折叠逻辑：
 * - 只有标题行可以折叠
 * - 折叠范围从标题行末尾到下一个同级或更高级标题之前
 * - 只有当标题是文档最后一行（后面没有任何行）时才不能折叠
 * - 只要后面有任何行（包括空行），就可以折叠
 */
function computeHeadingFoldRange(state: EditorState, lineStart: number): { from: number; to: number } | null {
  const doc = state.doc;

  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }

  const line = doc.lineAt(lineStart);
  const lineText = line.text;
  const headingLevel = getHeadingLevel(lineText);

  if (headingLevel === 0) {
    return null;
  }

  // 如果是最后一行，不能折叠（后面没有任何行）
  if (line.number >= doc.lines) {
    return null;
  }

  // 标题折叠：折叠到下一个同级或更高级标题之前
  let foldEnd = line.to;
  let hasAnyLine = false;

  for (let i = line.number + 1; i <= doc.lines; i++) {
    const nextLine = doc.line(i);
    const nextHeadingLevel = getHeadingLevel(nextLine.text);

    // 遇到同级或更高级标题，停止折叠
    if (nextHeadingLevel > 0 && nextHeadingLevel <= headingLevel) {
      // 折叠到上一行末尾（如果有内容的话）
      if (hasAnyLine && i > line.number + 1) {
        foldEnd = doc.line(i - 1).to;
      }
      break;
    }

    // 标记有任何行（包括空行）
    hasAnyLine = true;
    foldEnd = nextLine.to;
  }

  // 只要有任何行且折叠范围有效就返回
  if (hasAnyLine && foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }

  return null;
}

/**
 * 计算列表项折叠范围（Obsidian 风格）
 * 逻辑：
 * 1. 当前行不能是空行
 * 2. 后面必须有缩进大于当前行的行（跳过空行检查）
 * 3. 折叠范围包含所有缩进大于当前行的连续行（包括中间的空行）
 */
function computeListFoldRange(state: EditorState, lineStart: number): { from: number; to: number } | null {
  const doc = state.doc;
  
  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }
  
  const line = doc.lineAt(lineStart);
  const lineText = line.text;
  
  // 标题行使用标题折叠
  if (getHeadingLevel(lineText) > 0) {
    return null;
  }
  
  // 空行不能折叠
  if (lineText.trim().length === 0) {
    return null;
  }
  
  const currentIndent = getIndentLevel(lineText);
  
  // 检查下一行是否存在
  if (line.number >= doc.lines) {
    return null;
  }
  
  // 查找第一个非空行，检查其缩进是否大于当前行
  let hasChildIndent = false;
  let foldEnd = line.to;
  
  for (let i = line.number + 1; i <= doc.lines; i++) {
    const checkLine = doc.line(i);
    const checkText = checkLine.text.trim();
    
    // 空行继续包含在折叠范围内（如果已经找到子缩进）
    if (checkText.length === 0) {
      if (hasChildIndent) {
        foldEnd = checkLine.to;
      }
      continue;
    }
    
    const checkIndent = getIndentLevel(checkLine.text);
    
    // 如果缩进小于等于当前行，停止折叠
    if (checkIndent <= currentIndent) {
      break;
    }
    
    // 找到了缩进大于当前行的行
    hasChildIndent = true;
    foldEnd = checkLine.to;
  }
  
  // 只有找到子缩进行才返回折叠范围
  if (hasChildIndent && foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }
  
  return null;
}

/**
 * 计算折叠范围 - 支持标题折叠和列表折叠（Obsidian 风格）
 */
function computeFoldRange(state: EditorState, lineStart: number, _lineEnd: number): { from: number; to: number } | null {
  const doc = state.doc;
  
  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }
  
  const line = doc.lineAt(lineStart);
  const headingLevel = getHeadingLevel(line.text);
  
  // 标题行使用标题折叠
  if (headingLevel > 0) {
    return computeHeadingFoldRange(state, lineStart);
  }
  
  // 非标题行使用列表折叠
  return computeListFoldRange(state, lineStart);
}

/**
 * 自定义折叠服务 - 支持标题折叠和列表折叠
 */
const customFoldService = foldService.of((state, lineStart, lineEnd) => {
  return computeFoldRange(state, lineStart, lineEnd);
});

/**
 * 折叠图标 GutterMarker - 展开状态（仅用于标题）
 */
class FoldOpenMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-fold-marker cm-fold-marker-open';
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
    return span;
  }
}

/**
 * 折叠图标 GutterMarker - 折叠状态（仅用于标题）
 */
class FoldClosedMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-fold-marker cm-fold-marker-folded';
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    return span;
  }
}

const foldOpenMarker = new FoldOpenMarker();
const foldClosedMarker = new FoldClosedMarker();

/**
 * 构建标题折叠 Gutter 标记（仅标题）
 */
function buildHeadingFoldMarkers(state: EditorState): RangeSet<GutterMarker> {
  const builder: { from: number; marker: GutterMarker }[] = [];
  const doc = state.doc;
  const folded = foldedRanges(state);

  const foldedMap = new Map<number, boolean>();
  folded.between(0, doc.length, (from) => {
    foldedMap.set(from, true);
  });

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const headingLevel = getHeadingLevel(line.text);

    if (headingLevel > 0) {
      const foldRange = computeHeadingFoldRange(state, line.from);
      if (foldRange) {
        const isFolded = foldedMap.has(line.to);
        builder.push({
          from: line.from,
          marker: isFolded ? foldClosedMarker : foldOpenMarker,
        });
      }
    }
  }

  return RangeSet.of(builder.map(b => b.marker.range(b.from)));
}

/**
 * 标题折叠 Gutter 标记 StateField
 */
const headingFoldMarkers = StateField.define<RangeSet<GutterMarker>>({
  create(state) {
    return buildHeadingFoldMarkers(state);
  },
  update(markers, tr) {
    const hasFoldEffect = tr.effects.some(e => e.is(foldEffect) || e.is(unfoldEffect));
    if (tr.docChanged || hasFoldEffect) {
      return buildHeadingFoldMarkers(tr.state);
    }
    return markers;
  },
});

/**
 * 标题折叠 Gutter
 */
const headingFoldGutter = gutter({
  class: 'cm-foldGutter',
  markers: view => view.state.field(headingFoldMarkers),
  domEventHandlers: {
    click: (view, line) => {
      try {
        const lineObj = view.state.doc.lineAt(line.from);
        const headingLevel = getHeadingLevel(lineObj.text);

        if (headingLevel === 0) return false;

        const foldRange = computeHeadingFoldRange(view.state, lineObj.from);
        if (!foldRange) return false;

        // 验证折叠范围有效性
        if (foldRange.from >= foldRange.to || foldRange.to > view.state.doc.length) {
          return false;
        }

        const folded = foldedRanges(view.state);
        let existingFold: { from: number; to: number } | null = null;
        folded.between(lineObj.to, lineObj.to + 1, (from, to) => {
          existingFold = { from, to };
        });

        // 使用 requestAnimationFrame 延迟执行，避免 markdown 解析器的内部错误
        requestAnimationFrame(() => {
          try {
            // 重新验证状态，确保编辑器仍然有效
            if (!view.dom || !view.dom.isConnected) return;
            
            // 重新计算折叠范围，因为状态可能已经改变
            const currentFoldRange = computeHeadingFoldRange(view.state, lineObj.from);
            if (!currentFoldRange) return;
            
            // 再次验证范围有效性
            if (currentFoldRange.from >= currentFoldRange.to || currentFoldRange.to > view.state.doc.length) {
              return;
            }

            if (existingFold) {
              // 展开时，验证 existingFold 范围仍然有效
              if (existingFold.from <= view.state.doc.length && existingFold.to <= view.state.doc.length) {
                view.dispatch({ effects: unfoldEffect.of(existingFold) });
              }
            } else {
              view.dispatch({ effects: foldEffect.of({ from: currentFoldRange.from, to: currentFoldRange.to }) });
            }
          } catch (e) {
            console.error('Fold dispatch error:', e);
          }
        });

        return true;
      } catch (e) {
        console.error('Fold error:', e);
        return false;
      }
    },
  },
});

/**
 * 子折叠图标 Widget（绝对定位，跟随缩进动态更新）
 * 所有子折叠图标都使用绝对定位，不占用文本空间
 * 通过 left 值来跟随缩进位置
 */
class ListFoldWidget extends WidgetType {
  constructor(
    readonly isFolded: boolean,
    readonly lineFrom: number,
    readonly lineTo: number,
    readonly indent: number
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span');
    span.className = `cm-list-fold-marker ${this.isFolded ? 'cm-list-fold-marker-folded' : 'cm-list-fold-marker-open'}`;

    // 获取实际的字符宽度
    const charWidth = view.defaultCharacterWidth;

    // 所有子折叠图标都使用绝对定位
    // 根据缩进计算 left 位置
    // indent=0 时放在 gutter 位置（left: -24px）
    // indent>0 时放在缩进空格的左边
    if (this.indent === 0) {
      span.style.left = '-24px';
    } else {
      // 折叠图标放在缩进空格之前，图标宽度 20px
      // 缩进位置 = indent * charWidth，图标左边 = 缩进位置 - 图标宽度
      const indentPos = this.indent * charWidth;
      span.style.left = `${indentPos - 20}px`;
    }

    if (this.isFolded) {
      span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    } else {
      span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
    }

    span.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFold(view);
    });

    return span;
  }

  private toggleFold(view: EditorView): void {
    try {
      const foldRange = computeListFoldRange(view.state, this.lineFrom);
      if (!foldRange) return;

      // 验证折叠范围有效性
      if (foldRange.from >= foldRange.to || foldRange.to > view.state.doc.length) {
        return;
      }

      const folded = foldedRanges(view.state);
      let existingFold: { from: number; to: number } | null = null;
      folded.between(this.lineTo, this.lineTo + 1, (from, to) => {
        existingFold = { from, to };
      });

      const lineFrom = this.lineFrom;

      // 使用 requestAnimationFrame 延迟执行，避免 markdown 解析器的内部错误
      requestAnimationFrame(() => {
        try {
          // 重新验证状态，确保编辑器仍然有效
          if (!view.dom || !view.dom.isConnected) return;
          
          // 重新计算折叠范围，因为状态可能已经改变
          const currentFoldRange = computeListFoldRange(view.state, lineFrom);
          if (!currentFoldRange) return;
          
          // 再次验证范围有效性
          if (currentFoldRange.from >= currentFoldRange.to || currentFoldRange.to > view.state.doc.length) {
            return;
          }

          if (existingFold) {
            // 展开时，验证 existingFold 范围仍然有效
            if (existingFold.from <= view.state.doc.length && existingFold.to <= view.state.doc.length) {
              view.dispatch({ effects: unfoldEffect.of(existingFold) });
            }
          } else {
            view.dispatch({ effects: foldEffect.of({ from: currentFoldRange.from, to: currentFoldRange.to }) });
          }
        } catch (e) {
          console.error('List fold dispatch error:', e);
        }
      });
    } catch (e) {
      console.error('List fold error:', e);
    }
  }

  eq(other: ListFoldWidget): boolean {
    return other.isFolded === this.isFolded &&
      other.lineFrom === this.lineFrom &&
      other.lineTo === this.lineTo &&
      other.indent === this.indent;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 构建子折叠内联装饰器
 * 所有图标都使用绝对定位，不占用文本空间
 */
function buildListFoldDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; decoration: Decoration }[] = [];
  
  try {
    const doc = state.doc;
    const folded = foldedRanges(state);

    const foldedMap = new Map<number, boolean>();
    folded.between(0, doc.length, (from) => {
      foldedMap.set(from, true);
    });

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;

    // 跳过标题行
    if (getHeadingLevel(lineText) > 0) continue;

    // 跳过空行
    if (lineText.trim().length === 0) continue;

    const foldRange = computeListFoldRange(state, line.from);
    
    // 只有当 foldRange 存在时才添加折叠图标
    if (foldRange) {
      const isFolded = foldedMap.has(line.to);
      const indent = getIndentLevel(lineText);

      // 在缩进之后插入折叠图标（或行首，如果无缩进）
      const insertPos = line.from + indent;

      decorations.push({
        from: insertPos,
        decoration: Decoration.widget({
          widget: new ListFoldWidget(isFolded, line.from, line.to, indent),
          side: -1,
        }),
      });
    }
  }

  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from)),
    true
  );
  } catch (e) {
    console.error('Build list fold decorations error:', e);
    return RangeSet.of([], true);
  }
}

/**
 * 子折叠内联装饰器 StateField
 */
const listFoldDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildListFoldDecorations(state);
  },
  update(decorations, tr) {
    const hasFoldEffect = tr.effects.some(e => e.is(foldEffect) || e.is(unfoldEffect));

    if (tr.docChanged || hasFoldEffect) {
      return buildListFoldDecorations(tr.state);
    }

    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 序号高亮装饰器 - 匹配各种格式的序号
 * 为这些序号添加主题颜色
 */
const numberingMark = Decoration.mark({ class: 'cm-numbering' });

/**
 * 构建序号高亮装饰器
 * 匹配行首（可能有缩进）的序号格式：
 * - 单个数字加点（如 1.、2.、10.）
 * - 数字.数字 或更多层级（如 4.2、4.2.1、4.2.1.1）
 * - 单个大写字母加点（如 A.、B.、C.）
 * - 单个小写字母加点（如 a.、b.、c.）
 * - 字母+数字加点（如 A1.、A100.、B2.）
 * - 中文数字序号（如 一、二、三、）
 * - 圆点无序列表（如 •）
 */
function buildNumberingDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number }[] = [];
  const doc = state.doc;

  // 匹配序号格式：
  // 1. 单个数字加点（如 1.、2.、10.、100.）
  // 2. 数字.数字 或更多层级（如 4.2、4.2.1、4.2.1.1）
  // 3. 单个字母加点（如 A.、B.、a.、b.）
  // 4. 字母+数字加点（如 A1.、A100.、B2.）
  // 5. 中文数字序号（如 一、二、三、十、百）
  // 6. 圆点无序列表（如 •）
  // 序号必须在行首（可能有缩进空格），后面跟空格或其他内容
  const numberingRegex = /^(\s*)(\d+\.|[A-Za-z]\.|[A-Za-z]\d{1,3}\.|[一二三四五六七八九十百千万零]+、|\d+(?:\.\d+)+|•)\s/;
  
  // 待办清单正则：跳过 • [ ] 或 • [x] 格式
  const todoRegex = /^[\t ]*[-*+•]\s\[[ xX]\](\s|$)/;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    
    // 跳过待办清单行
    if (todoRegex.test(line.text)) {
      continue;
    }
    
    const match = line.text.match(numberingRegex);
    if (match) {
      const indent = match[1].length;
      const numbering = match[2];
      const from = line.from + indent;
      const to = from + numbering.length;
      decorations.push({ from, to });
    }
  }

  return RangeSet.of(
    decorations.map(d => numberingMark.range(d.from, d.to)),
    true
  );
}

/**
 * 序号高亮 StateField
 */
const numberingDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildNumberingDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildNumberingDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

// ============================================================================
// 文本颜色系统 - 纯 StateField + Decoration 方案（不使用正则）
// ============================================================================

/**
 * 颜色标记数据结构
 */
interface ColorMark {
  from: number;
  to: number;
  bgColor?: string;
  textColor?: string;
}

/**
 * 添加/更新颜色的 StateEffect
 */
const addColorEffect = StateEffect.define<ColorMark>();

/**
 * 清除颜色的 StateEffect
 */
const clearColorEffect = StateEffect.define<{ from: number; to: number }>();

/**
 * 颜色标记 StateField
 * 存储所有文本颜色信息，不依赖文档中的 HTML 标签
 */
const colorMarksField = StateField.define<ColorMark[]>({
  create() {
    return [];
  },
  update(marks, tr) {
    let newMarks = marks;

    // 处理文档变化 - 更新所有标记的位置
    if (tr.docChanged) {
      newMarks = marks
        .map(mark => {
          // 使用 mapPos 更新位置
          const newFrom = tr.changes.mapPos(mark.from, 1);
          const newTo = tr.changes.mapPos(mark.to, -1);
          // 如果范围无效（被删除），返回 null
          if (newFrom >= newTo) {
            return null;
          }
          return { ...mark, from: newFrom, to: newTo };
        })
        .filter((mark): mark is ColorMark => mark !== null);
    }

    // 处理颜色效果
    for (const effect of tr.effects) {
      if (effect.is(addColorEffect)) {
        const newMark = effect.value;
        // 查找所有重叠的标记
        const overlappingMarks = newMarks.filter(
          m => !(m.to <= newMark.from || m.from >= newMark.to)
        );

        if (overlappingMarks.length > 0) {
          // 移除所有重叠的标记
          newMarks = newMarks.filter(
            m => m.to <= newMark.from || m.from >= newMark.to
          );

          // 处理每个重叠标记，可能需要分割
          for (const existing of overlappingMarks) {
            // 如果旧标记在新标记之前有部分
            if (existing.from < newMark.from) {
              newMarks.push({
                from: existing.from,
                to: newMark.from,
                bgColor: existing.bgColor,
                textColor: existing.textColor,
              });
            }
            // 如果旧标记在新标记之后有部分
            if (existing.to > newMark.to) {
              newMarks.push({
                from: newMark.to,
                to: existing.to,
                bgColor: existing.bgColor,
                textColor: existing.textColor,
              });
            }
          }

          // 合并颜色：新标记使用新颜色，保留旧标记中未被覆盖的颜色
          const firstOverlap = overlappingMarks[0];
          const merged: ColorMark = {
            from: newMark.from,
            to: newMark.to,
            bgColor: newMark.bgColor !== undefined ? newMark.bgColor : firstOverlap.bgColor,
            textColor: newMark.textColor !== undefined ? newMark.textColor : firstOverlap.textColor,
          };
          newMarks.push(merged);
        } else {
          // 添加新标记
          newMarks = [...newMarks, newMark];
        }
      } else if (effect.is(clearColorEffect)) {
        const { from, to } = effect.value;
        // 移除范围内的标记
        newMarks = newMarks.filter(m => m.to <= from || m.from >= to);
      }
    }

    return newMarks;
  },
});

/**
 * 预览范围数据 - 用于在预览时暂时隐藏已有背景色
 */
interface PreviewRange {
  from: number;
  to: number;
  type: 'color' | 'background-color';
}

/**
 * 设置预览范围的 StateEffect
 */
const setPreviewRangeEffect = StateEffect.define<PreviewRange | null>();

/**
 * 预览范围 StateField
 */
const previewRangeField = StateField.define<PreviewRange | null>({
  create() {
    return null;
  },
  update(range, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPreviewRangeEffect)) {
        return effect.value;
      }
    }
    return range;
  },
});

/**
 * 从 ColorMark 数组生成 DecorationSet
 * @param marks 颜色标记数组
 * @param previewRange 预览范围（如果有，则在该范围内隐藏对应类型的颜色）
 */
function buildColorDecorations(
  marks: ColorMark[],
  previewRange: PreviewRange | null
): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const mark of marks) {
    // 检查是否与预览范围重叠
    const overlapsPreview =
      previewRange &&
      !(mark.to <= previewRange.from || mark.from >= previewRange.to);

    if (overlapsPreview && previewRange) {
      // 需要分割标记：预览范围内隐藏对应颜色，范围外保持原样
      
      // 1. 预览范围之前的部分（保持原样）
      if (mark.from < previewRange.from) {
        const styleAttrs: string[] = [];
        if (mark.bgColor) {
          styleAttrs.push(`background-color: ${mark.bgColor}`);
          styleAttrs.push('border-radius: 3px');
          styleAttrs.push('padding: 0 2px');
        }
        if (mark.textColor) {
          styleAttrs.push(`color: ${mark.textColor} !important`);
        }
        if (styleAttrs.length > 0) {
          decorations.push(
            Decoration.mark({
              tagName: 'span',
              class: 'cm-text-colored',
              attributes: { style: styleAttrs.join('; ') },
            }).range(mark.from, previewRange.from)
          );
        }
      }

      // 2. 预览范围内的部分（隐藏对应类型的颜色）
      const overlapFrom = Math.max(mark.from, previewRange.from);
      const overlapTo = Math.min(mark.to, previewRange.to);
      if (overlapFrom < overlapTo) {
        const styleAttrs: string[] = [];
        // 只保留不被预览的颜色类型
        if (mark.bgColor && previewRange.type !== 'background-color') {
          styleAttrs.push(`background-color: ${mark.bgColor}`);
          styleAttrs.push('border-radius: 3px');
          styleAttrs.push('padding: 0 2px');
        }
        if (mark.textColor && previewRange.type !== 'color') {
          styleAttrs.push(`color: ${mark.textColor} !important`);
        }
        if (styleAttrs.length > 0) {
          decorations.push(
            Decoration.mark({
              tagName: 'span',
              class: 'cm-text-colored',
              attributes: { style: styleAttrs.join('; ') },
            }).range(overlapFrom, overlapTo)
          );
        }
      }

      // 3. 预览范围之后的部分（保持原样）
      if (mark.to > previewRange.to) {
        const styleAttrs: string[] = [];
        if (mark.bgColor) {
          styleAttrs.push(`background-color: ${mark.bgColor}`);
          styleAttrs.push('border-radius: 3px');
          styleAttrs.push('padding: 0 2px');
        }
        if (mark.textColor) {
          styleAttrs.push(`color: ${mark.textColor} !important`);
        }
        if (styleAttrs.length > 0) {
          decorations.push(
            Decoration.mark({
              tagName: 'span',
              class: 'cm-text-colored',
              attributes: { style: styleAttrs.join('; ') },
            }).range(previewRange.to, mark.to)
          );
        }
      }
    } else {
      // 不与预览范围重叠，正常显示
      const styleAttrs: string[] = [];
      if (mark.bgColor) {
        styleAttrs.push(`background-color: ${mark.bgColor}`);
        styleAttrs.push('border-radius: 3px');
        styleAttrs.push('padding: 0 2px');
      }
      if (mark.textColor) {
        styleAttrs.push(`color: ${mark.textColor} !important`);
      }

      if (styleAttrs.length > 0) {
        decorations.push(
          Decoration.mark({
            tagName: 'span',
            class: 'cm-text-colored',
            attributes: { style: styleAttrs.join('; ') },
          }).range(mark.from, mark.to)
        );
      }
    }
  }

  // 按位置排序
  decorations.sort((a, b) => a.from - b.from);

  return Decoration.set(decorations);
}

/**
 * 颜色装饰器 StateField
 * 从 colorMarksField 生成装饰器
 */
const colorDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildColorDecorations(state.field(colorMarksField), null);
  },
  update(decorations, tr) {
    // 如果有颜色相关的效果、文档变化或预览范围变化，重新构建装饰器
    const hasColorEffect = tr.effects.some(
      e => e.is(addColorEffect) || e.is(clearColorEffect) || e.is(setPreviewRangeEffect)
    );
    if (tr.docChanged || hasColorEffect) {
      const previewRange = tr.state.field(previewRangeField);
      return buildColorDecorations(tr.state.field(colorMarksField), previewRange);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 利用语法树判断位置是否在 Markdown 标记内（标题、列表标记等）
 * 这些位置不应该应用颜色
 */
function isInMarkdownSyntax(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);

  // 遍历节点及其父节点
  while (node) {
    const name = node.type.name;
    // 检查是否是 Markdown 语法标记
    if (
      name === 'HeaderMark' ||      // # ## ### 等
      name === 'ListMark' ||        // - * + 1. 等
      name === 'QuoteMark' ||       // >
      name === 'CodeMark' ||        // ` ```
      name === 'EmphasisMark' ||    // * _ ** __
      name === 'LinkMark' ||        // [ ] ( )
      name === 'URL'                // 链接 URL
    ) {
      return true;
    }
    if (!node.parent || node.parent === node) break;
    node = node.parent;
  }

  return false;
}

/**
 * 获取行首的 Markdown 标记结束位置
 * 返回内容开始的位置（跳过标题符号、列表标记等）
 * 支持多种序号格式：
 * - 标准 Markdown：# ## - * + 1. 等
 * - 多级数字：1.1、1.2.1、4.1 等
 * - 字母序号：A. B. a. b. A1. B2. 等
 * - 字母+数字混合：A1、B2、A1.1 等
 * - 中文序号：一、二、三、等
 * - 支持任意缩进（空格或 TAB）
 */
function getContentStartPos(state: EditorState, lineFrom: number): number {
  const line = state.doc.lineAt(lineFrom);
  const tree = syntaxTree(state);
  const lineText = line.text;

  // 从行首开始查找
  let contentStart = line.from;

  // 先用语法树检测标准 Markdown 标记
  // 增加检测范围以支持深度缩进
  tree.iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      // 如果是标记节点
      if (
        node.type.name === 'HeaderMark' ||
        node.type.name === 'ListMark' ||
        node.type.name === 'QuoteMark'
      ) {
        // 内容从标记后面开始
        contentStart = Math.max(contentStart, node.to);
        // 跳过标记后的空格
        const text = state.doc.sliceString(node.to, Math.min(node.to + 2, line.to));
        if (text.startsWith(' ')) {
          contentStart = node.to + 1;
        }
      }
    },
  });

  // 额外检测各种序号格式（语法树可能不识别）
  // 使用 [\t ]* 明确匹配 TAB 和空格
  const listPatterns = [
    // 多级数字序号：1.1、1.2.1、4.1.2 等（支持任意缩进）
    /^([\t ]*)((\d+\.)+\d*\s+)/,
    // 单个数字序号：1. 2. 10. 等（支持任意缩进）
    /^([\t ]*)(\d+\.\s+)/,
    // 字母+数字+多级：A1.1、B2.3 等
    /^([\t ]*)([A-Za-z]\d+(?:\.\d+)*\.?\s+)/,
    // 字母+数字序号：A1、B2、A1.、B2. 等
    /^([\t ]*)([A-Za-z]\d+\.?\s+)/,
    // 单字母序号：A. B. a. b. 等
    /^([\t ]*)([A-Za-z]\.\s+)/,
    // 中文序号：一、二、三、等
    /^([\t ]*)([一二三四五六七八九十百千万零]+[、.]\s*)/,
    // 无序列表符号：- * + •
    /^([\t ]*)([-*+•]\s+)/,
    // 标题符号：# ## ### 等
    /^([\t ]*)(#{1,6}\s+)/,
  ];

  for (const regex of listPatterns) {
    const match = lineText.match(regex);
    if (match) {
      const matchEnd = line.from + match[0].length;
      contentStart = Math.max(contentStart, matchEnd);
      break; // 匹配到一个就停止
    }
  }

  return contentStart;
}

/**
 * 跳过文本首尾的空白字符，返回实际内容的范围
 */
function trimTextRange(
  state: EditorState,
  from: number,
  to: number
): { from: number; to: number } {
  const text = state.sliceDoc(from, to);
  
  // 计算前导空白
  let leadingSpaces = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' || text[i] === '\t') {
      leadingSpaces++;
    } else {
      break;
    }
  }
  
  // 计算尾部空白
  let trailingSpaces = 0;
  for (let i = text.length - 1; i >= leadingSpaces; i--) {
    if (text[i] === ' ' || text[i] === '\t') {
      trailingSpaces++;
    } else {
      break;
    }
  }
  
  return {
    from: from + leadingSpaces,
    to: to - trailingSpaces,
  };
}

/**
 * 应用颜色样式到选中文本（纯 StateField 方案）
 * @param view EditorView 实例
 * @param styleType 样式类型：'color' 或 'background-color'
 * @param newColor 新的颜色值
 */
function applyColorStyle(
  view: EditorView,
  styleType: 'color' | 'background-color',
  newColor: string
): void {
  const { from, to } = view.state.selection.main;
  let targetFrom: number;
  let targetTo: number;

  if (from === to) {
    // 没有选中文本，选中整行内容（跳过 Markdown 标记）
    const line = view.state.doc.lineAt(from);
    targetFrom = getContentStartPos(view.state, line.from);
    targetTo = line.to;
  } else {
    targetFrom = from;
    targetTo = to;

    // 检查选区起始位置是否在 Markdown 标记内
    const startLine = view.state.doc.lineAt(from);
    const contentStart = getContentStartPos(view.state, startLine.from);
    if (targetFrom < contentStart) {
      targetFrom = contentStart;
    }
  }

  // 跳过首尾空白
  const trimmed = trimTextRange(view.state, targetFrom, targetTo);
  targetFrom = trimmed.from;
  targetTo = trimmed.to;

  // 如果范围无效，直接返回
  if (targetFrom >= targetTo) {
    return;
  }

  // 检查是否包含多行
  const targetText = view.state.sliceDoc(targetFrom, targetTo);
  const hasMultipleLines = targetText.includes('\n');

  if (hasMultipleLines) {
    // 多行处理：对每一行分别应用颜色
    const doc = view.state.doc;
    const startLine = doc.lineAt(targetFrom);
    const endLine = doc.lineAt(targetTo);
    const effects: StateEffect<ColorMark>[] = [];

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = doc.line(lineNum);
      let lineFrom = line.from;
      let lineTo = line.to;

      // 如果是第一行，从选中位置开始
      if (lineNum === startLine.number) {
        lineFrom = Math.max(targetFrom, line.from);
      }
      // 如果是最后一行，到选中位置结束
      if (lineNum === endLine.number) {
        lineTo = Math.min(targetTo, line.to);
      }

      // 跳过 Markdown 标记
      const contentStart = getContentStartPos(view.state, line.from);
      if (lineFrom < contentStart) {
        lineFrom = contentStart;
      }

      // 跳过首尾空白
      const lineTrimmed = trimTextRange(view.state, lineFrom, lineTo);
      lineFrom = lineTrimmed.from;
      lineTo = lineTrimmed.to;

      // 如果这一行没有内容，跳过
      if (lineFrom >= lineTo) {
        continue;
      }

      // 查找已有的颜色标记（查找与新范围重叠的所有标记，合并它们的颜色）
      const existingMarks = view.state.field(colorMarksField);
      const overlappingMarks = existingMarks.filter(
        m => !(m.to <= lineFrom || m.from >= lineTo)
      );

      // 从所有重叠标记中收集颜色
      let existingBgColor: string | undefined;
      let existingTextColor: string | undefined;
      for (const m of overlappingMarks) {
        if (m.bgColor && !existingBgColor) {
          existingBgColor = m.bgColor;
        }
        if (m.textColor && !existingTextColor) {
          existingTextColor = m.textColor;
        }
      }

      // 创建新的颜色标记
      const newMark: ColorMark = {
        from: lineFrom,
        to: lineTo,
        bgColor: styleType === 'background-color' ? newColor : existingBgColor,
        textColor: styleType === 'color' ? newColor : existingTextColor,
      };

      effects.push(addColorEffect.of(newMark));
    }

    if (effects.length > 0) {
      view.dispatch({ effects });
    }
    return;
  }

  // 单行处理
  // 查找已有的颜色标记（查找与新范围重叠的所有标记，合并它们的颜色）
  const existingMarks = view.state.field(colorMarksField);
  const overlappingMarks = existingMarks.filter(
    m => !(m.to <= targetFrom || m.from >= targetTo)
  );

  // 从所有重叠标记中收集颜色
  let existingBgColor: string | undefined;
  let existingTextColor: string | undefined;
  for (const m of overlappingMarks) {
    if (m.bgColor && !existingBgColor) {
      existingBgColor = m.bgColor;
    }
    if (m.textColor && !existingTextColor) {
      existingTextColor = m.textColor;
    }
  }

  // 创建新的颜色标记
  const newMark: ColorMark = {
    from: targetFrom,
    to: targetTo,
    bgColor: styleType === 'background-color' ? newColor : existingBgColor,
    textColor: styleType === 'color' ? newColor : existingTextColor,
  };

  view.dispatch({
    effects: addColorEffect.of(newMark),
  });
}

/**
 * 获取当前选中文本的现有颜色
 * @param view EditorView 实例
 * @param styleType 样式类型：'color' 或 'background-color'
 * @returns 现有颜色值，如果没有则返回 undefined
 */
function getExistingColor(
  view: EditorView,
  styleType: 'color' | 'background-color'
): string | undefined {
  const { from, to } = view.state.selection.main;
  const marks = view.state.field(colorMarksField);

  // 查找包含选区的颜色标记
  const mark = marks.find(m => m.from <= from && m.to >= to);

  if (mark) {
    return styleType === 'background-color' ? mark.bgColor : mark.textColor;
  }

  return undefined;
}

/**
 * 颜色预览 StateEffect - 用于更新预览装饰器
 */
interface ColorPreviewData {
  type: 'color' | 'background-color';
  color: string;
  from: number;
  to: number;
}

const setColorPreviewEffect = StateEffect.define<ColorPreviewData | null>();

/**
 * 颜色预览装饰器 StateField
 * 用于在拖动颜色选择器时显示临时预览效果
 */
const colorPreviewDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setColorPreviewEffect)) {
        const data = effect.value;
        if (data === null) {
          return Decoration.none;
        }
        const { type, color, from, to } = data;
        const styleAttr =
          type === 'background-color'
            ? `background-color: ${color}; border-radius: 3px; padding: 0 2px;`
            : `color: ${color}`;
        const previewDecoration = Decoration.mark({
          class: 'cm-color-preview',
          attributes: { style: styleAttr },
        });
        return Decoration.set([previewDecoration.range(from, to)]);
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 缩进线 Widget - 显示缩进层级的垂直线
 * 只显示一条缩进线，与父级折叠图标对齐
 */
class IndentGuideWidget extends WidgetType {
  constructor(readonly indentLevel: number, readonly hasFoldIcon: boolean = false) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-indent-guides';
    
    // 获取主题缩进线颜色
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--ws-mirrorIndentGuide-background')
      .trim();
    
    // 检测是否是暗色主题
    const isDarkTheme = document.body.classList.contains('ws-theme-dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    
    // 确定最终颜色
    let finalColor: string;
    if (themeColor) {
      // 检测颜色是否已包含透明度
      const hasAlpha = themeColor.includes('rgba') || 
        themeColor.includes('hsla') ||
        (themeColor.startsWith('#') && themeColor.length === 9);
      
      if (hasAlpha) {
        // 已有透明度，直接使用主题颜色
        finalColor = themeColor;
      } else {
        // 没有透明度，尝试解析 RGB 值并添加 0.6 透明度
        const rgbMatch = themeColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        const hexMatch = themeColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
        const shortHexMatch = themeColor.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
        
        if (rgbMatch) {
          finalColor = `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.6)`;
        } else if (hexMatch) {
          const r = parseInt(hexMatch[1], 16);
          const g = parseInt(hexMatch[2], 16);
          const b = parseInt(hexMatch[3], 16);
          finalColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
        } else if (shortHexMatch) {
          const r = parseInt(shortHexMatch[1] + shortHexMatch[1], 16);
          const g = parseInt(shortHexMatch[2] + shortHexMatch[2], 16);
          const b = parseInt(shortHexMatch[3] + shortHexMatch[3], 16);
          finalColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
        } else {
          // 无法解析，使用默认颜色
          finalColor = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
        }
      }
    } else {
      // 没有主题颜色，使用默认颜色
      finalColor = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
    }
    
    // 只创建一条缩进线，位置与父级折叠图标对齐
    // 折叠图标位置计算（来自 ListFoldWidget）：
    // - indent=0 时：left = -24px
    // - indent>0 时：left = (indent - 1) * 8 - 8
    // 折叠图标宽度 20px，中心在 left + 10
    // 
    // 当前行的 indentLevel 表示缩进级别（每级 2 空格）
    // 父级的缩进级别 = indentLevel - 1
    // 父级的空格数 = (indentLevel - 1) * 2
    if (this.indentLevel >= 1) {
      const guide = document.createElement('span');
      guide.className = 'cm-indent-guide cm-indent-guide-single';
      
      // 父级的空格数
      const parentSpaces = (this.indentLevel - 1) * 2;
      // 父级折叠图标的 left 位置
      const foldIconLeft = parentSpaces > 0 ? (parentSpaces - 1) * 8 - 8 : -24;
      // 缩进线位置 = 折叠图标左边 + 5px（折叠图标中心偏左一点）
      const leftPos = foldIconLeft + 5;
      
      guide.style.left = `${leftPos}px`;
      guide.style.backgroundColor = finalColor;
      guide.style.top = '0';
      
      container.appendChild(guide);
    }
    
    return container;
  }

  eq(_other: IndentGuideWidget): boolean {
    // 强制重新渲染以应用新的位置计算
    return false;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 构建缩进线装饰器
 * 规则：最少缩进4个空格（或1个tab）才显示缩进线
 */
function buildIndentGuideDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; decoration: Decoration }[] = [];
  
  try {
    const doc = state.doc;
    const TAB_SIZE = 2; // 1个tab = 2个空格（与编辑器 indentUnit 一致）

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const lineText = line.text;
      
      // 跳过标题行
      if (getHeadingLevel(lineText) > 0) continue;
      
      // 计算缩进级别（每2个空格或1个tab为一级）
      let indent = getIndentLevel(lineText);
      
      // 如果是空行，根据上下文确定缩进级别
      if (lineText.trim().length === 0) {
        // 向上查找最近的非空行来确定上下文缩进
        for (let j = i - 1; j >= 1; j--) {
          const prevLine = doc.line(j);
          if (prevLine.text.trim().length > 0) {
            indent = getIndentLevel(prevLine.text);
            break;
          }
        }
      }
      
      const indentLevel = Math.floor(indent / TAB_SIZE);
      
      // 检测该行是否有子折叠图标（非标题行且有子缩进内容）
      const hasFoldIcon = computeListFoldRange(state, line.from) !== null;
      
      // 只要有缩进就创建缩进线（indentLevel >= 1）
      if (indentLevel >= 1) {
        decorations.push({
          from: line.from,
          decoration: Decoration.widget({
            widget: new IndentGuideWidget(indentLevel, hasFoldIcon),
            side: -1,
          }),
        });
      }
    }

    decorations.sort((a, b) => a.from - b.from);

    return RangeSet.of(
      decorations.map(d => d.decoration.range(d.from)),
      true
    );
  } catch (e) {
    console.error('Build indent guide decorations error:', e);
    return RangeSet.of([], true);
  }
}

/**
 * 缩进线装饰器 StateField
 */
const indentGuideDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildIndentGuideDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildIndentGuideDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 查找包含当前行的折叠组（父行 + 所有子行 + 空行）
 * 父行是缩进比当前行少的最近非空行
 * 返回 { parentLine: 父行号, childLines: 子行号数组（包含空行） } 或 null
 */
function findFoldGroup(state: EditorState, lineNumber: number): { parentLine: number; childLines: number[] } | null {
  const currentLine = state.doc.line(lineNumber);
  let currentIndent = getIndentLevel(currentLine.text);
  const totalLines = state.doc.lines;
  
  // 标题行不参与折叠组
  if (getHeadingLevel(currentLine.text) > 0) return null;
  
  // 如果是空行，尝试根据上下文确定缩进级别
  if (currentLine.text.trim().length === 0) {
    // 向上查找最近的非空行来确定上下文
    let contextIndent = -1;
    let contextIsHeading = false;
    for (let i = lineNumber - 1; i >= 1; i--) {
      const line = state.doc.line(i);
      if (line.text.trim().length > 0) {
        // 如果上下文是标题行，不显示缩进线
        if (getHeadingLevel(line.text) > 0) {
          contextIsHeading = true;
        }
        contextIndent = getIndentLevel(line.text);
        break;
      }
    }
    
    if (contextIndent < 0 || contextIsHeading) return null;
    
    // 使用上下文缩进作为当前缩进
    currentIndent = contextIndent;
  }
  
  // 情况1：当前行是父行（有子行）
  // 向下查找是否有缩进比当前行多的行
  const childLines: number[] = [];
  let hasRealChild = false;
  
  for (let i = lineNumber + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    // 空行也收集（如果在子行区域内）
    if (line.text.trim().length === 0) {
      childLines.push(i);
      continue;
    }
    
    // 如果缩进小于等于当前行，说明已经离开了子行区域
    if (lineIndent <= currentIndent) {
      break;
    }
    
    // 收集所有缩进比当前行多的行作为子行
    childLines.push(i);
    hasRealChild = true;
  }
  
  if (hasRealChild) {
    return { parentLine: lineNumber, childLines };
  }
  
  // 情况2：当前行是子行，需要找到父行
  // 父行是缩进比当前行少的最近非空行（且不是标题行）
  if (currentIndent <= 0) return null;
  
  let parentLine: number | null = null;
  let parentIndent = -1;
  
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    if (line.text.trim().length === 0) continue;
    
    // 跳过标题行，标题行不能作为折叠组的父行
    if (getHeadingLevel(line.text) > 0) continue;
    
    // 找到缩进比当前行少的行作为父行
    if (lineIndent < currentIndent) {
      parentLine = i;
      parentIndent = lineIndent;
      break;
    }
  }
  
  if (parentLine === null) return null;
  
  // 验证父行是否真的有子行（即有折叠功能）
  // 检查父行下面是否有缩进更多的非空行
  let parentHasRealChildren = false;
  for (let i = parentLine + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    if (line.text.trim().length === 0) continue;
    
    if (lineIndent <= parentIndent) break;
    
    // 找到了缩进更多的非空行，说明父行有子行
    parentHasRealChildren = true;
    break;
  }
  
  if (!parentHasRealChildren) return null;
  
  // 找到父行后，收集所有子行和空行
  const allChildLines: number[] = [];
  for (let i = parentLine + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    // 空行也收集
    if (line.text.trim().length === 0) {
      allChildLines.push(i);
      continue;
    }
    
    // 如果缩进小于等于父行，说明已经离开了子行区域
    if (lineIndent <= parentIndent) {
      break;
    }
    
    // 收集所有缩进比父行多的行
    allChildLines.push(i);
  }
  
  return { parentLine, childLines: allChildLines };
}

// 折叠组高亮的行装饰器
const foldParentHighlight = Decoration.line({ class: 'cm-fold-parent-highlighted' });

/**
 * 折叠组缩进线 Widget
 * 使用 parentIndent 在 toDOM 中动态计算位置
 */
class FoldIndentLineWidget extends WidgetType {
  constructor(readonly parentIndent: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const line = document.createElement('span');
    line.className = 'cm-fold-indent-line';

    // 获取实际的字符宽度
    const charWidth = view.defaultCharacterWidth;

    // 计算缩进线位置（与父级折叠图标对齐）
    // 折叠图标位置：parentIndent > 0 ? parentIndent * charWidth - 20 : -24
    // 缩进线应该在折叠图标中心位置（图标宽度 20px，中心在 +10）
    let linePos: number;
    if (this.parentIndent > 0) {
      const foldIconLeft = this.parentIndent * charWidth - 20;
      linePos = foldIconLeft + 10; // 折叠图标中心
    } else {
      linePos = -24 + 10; // -14px
    }

    line.style.left = `${linePos}px`;
    return line;
  }

  eq(other: FoldIndentLineWidget): boolean {
    return this.parentIndent === other.parentIndent;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// 创建带有父级缩进信息的子行高亮装饰器
function createFoldChildDecorations(parentIndent: number): Decoration[] {
  return [
    Decoration.line({ class: 'cm-fold-child-highlighted' }),
    Decoration.widget({
      widget: new FoldIndentLineWidget(parentIndent),
      side: -1,
    }),
  ];
}

/**
 * 构建折叠组高亮装饰器
 */
function buildFoldGroupDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  
  // 获取当前光标所在行
  const selection = state.selection;
  const cursorLine = state.doc.lineAt(selection.main.head).number;
  
  // 查找折叠组
  const foldGroup = findFoldGroup(state, cursorLine);
  
  if (foldGroup) {
    // 获取父行的缩进（空格数）
    const parentLineObj = state.doc.line(foldGroup.parentLine);
    const parentIndent = getIndentLevel(parentLineObj.text);
    
    // 收集所有需要高亮的行，按位置排序
    const allLines: { from: number; decoration: Decoration }[] = [];
    
    // 父行高亮
    allLines.push({ from: parentLineObj.from, decoration: foldParentHighlight });
    
    // 子行高亮（带有缩进线 Widget）
    for (const childLineNum of foldGroup.childLines) {
      const childLineObj = state.doc.line(childLineNum);
      const childDecorations = createFoldChildDecorations(parentIndent);
      for (const dec of childDecorations) {
        allLines.push({ from: childLineObj.from, decoration: dec });
      }
    }
    
    // 按位置排序
    allLines.sort((a, b) => a.from - b.from);
    
    // 添加到 builder
    for (const item of allLines) {
      builder.add(item.from, item.from, item.decoration);
    }
  }
  
  return builder.finish();
}

/**
 * 折叠组高亮 StateField
 */
const foldGroupHighlightField = StateField.define<DecorationSet>({
  create(state) {
    return buildFoldGroupDecorations(state);
  },
  update(decorations, tr) {
    // 选择变化或文档变化时重新计算
    if (tr.selection || tr.docChanged) {
      return buildFoldGroupDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 自定义 Markdown 语法高亮样式
 * 覆盖默认高亮，让有序列表数字等使用主题配色
 */
const customHighlightStyle = HighlightStyle.define([
  // 有序列表数字标记（如 1. 2. 3.）
  { tag: tags.processingInstruction, color: 'var(--ws-textLink-foreground)' },
  // 标题
  { tag: tags.heading, color: 'var(--ws-textLink-foreground)', fontWeight: '700' },
  // 强调
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  // 链接
  { tag: tags.link, color: 'var(--ws-textLink-foreground)' },
  { tag: tags.url, color: 'var(--ws-textLink-foreground)' },
  // 引用
  { tag: tags.quote, color: 'var(--ws-descriptionForeground)', fontStyle: 'italic' },
  // 代码 - 使用普通文本颜色，避免缩进超过4空格时颜色变化
  { tag: tags.monospace, color: 'inherit' },
  // 注释
  { tag: tags.comment, color: 'var(--ws-descriptionForeground)' },
  // 元信息（如 > 引用标记）
  { tag: tags.meta, color: 'var(--ws-textLink-foreground)' },
]);

/**
 * 自定义回车键处理 - 智能引用块换行
 * 1. 在引用行末尾按回车时，自动添加 > 到新行（保持缩进）
 * 2. 如果当前行只有 > （没有其他内容），按回车时删除 > 并退出引用模式
 */
function handleBlockquoteEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 检查是否是引用行 - 支持行首有空格的情况（TAB 缩进）
  const blockquoteMatch = lineText.match(/^(\s*)(>+)(\s*)/);
  if (!blockquoteMatch) {
    return false; // 不是引用行，使用默认行为
  }
  
  const indent = blockquoteMatch[1]; // 缩进空格
  const markers = blockquoteMatch[2]; // > 符号
  const spaces = blockquoteMatch[3]; // > 后面的空格
  const prefixLength = indent.length + markers.length + spaces.length;
  const content = lineText.slice(prefixLength);
  
  // 如果引用行只有 > 没有内容（或只有空格），删除 > 标记并退出引用模式
  if (content.trim() === '') {
    // 删除当前行的 > 标记，并在前面插入空行来断开引用块
    if (line.from > 0) {
      // 不是第一行：删除当前行（包括前面的换行符），然后插入两个换行符
      view.dispatch({
        changes: { from: line.from - 1, to: line.to, insert: '\n\n' },
        selection: { anchor: line.from + 1 },
      });
    } else {
      // 第一行：直接删除 > 标记
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      });
    }
    return true;
  }
  
  // 在引用行末尾按回车，自动添加缩进 + > 到新行
  const level = markers.length;
  const newPrefix = indent + '>'.repeat(level) + ' ';
  
  view.dispatch({
    changes: { from: head, insert: '\n' + newPrefix },
    selection: { anchor: head + 1 + newPrefix.length },
  });
  
  return true;
}

/**
 * 自定义回车键处理 - 智能待办清单换行
 * 1. 在待办清单行末尾按回车时，自动添加待办清单标记到新行
 * 2. 如果当前行只有待办清单标记没有内容，按回车时删除标记并退出待办清单模式
 * 支持 - [ ] 格式
 */
function handleTodoListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 检查是否是待办清单行（支持 - [ ] 或 - [x] 或 • [ ] 或 • [x] 格式）
  const todoMatch = lineText.match(/^(\s*)([-*+•])\s\[[ xX]\]\s?/);
  if (!todoMatch) {
    return false; // 不是待办清单行，使用默认行为
  }

  const indent = todoMatch[1];
  // 始终使用 - 作为待办清单标记
  const prefix = indent + '- [ ] ';
  const matchedPrefix = todoMatch[0];
  const content = lineText.slice(matchedPrefix.length).trim();

  // 如果待办清单行只有标记没有内容，删除标记并退出待办清单模式
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 在待办清单行末尾按回车，自动添加待办清单标记到新行
  view.dispatch({
    changes: { from: head, insert: '\n' + prefix },
    selection: { anchor: head + 1 + prefix.length },
  });

  return true;
}

/**
 * 自定义回车键处理 - 智能无序列表换行
 * 1. 在列表行末尾按回车时，自动添加列表标记到新行
 * 2. 如果当前行只有列表标记没有内容，按回车时删除标记并退出列表模式
 * 支持 -、*、+、• 作为列表标记
 */
function handleListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 检查是否是无序列表行（支持 -、*、+、• 作为标记）
  const listMatch = lineText.match(/^(\s*)([-*+•])\s/);
  if (!listMatch) {
    return false; // 不是列表行，使用默认行为
  }

  const indent = listMatch[1];
  const marker = listMatch[2];
  const prefix = indent + marker + ' ';
  const content = lineText.slice(prefix.length).trim();

  // 如果列表行只有标记没有内容，删除标记并退出列表模式
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 在列表行末尾按回车，自动添加列表标记到新行
  view.dispatch({
    changes: { from: head, insert: '\n' + prefix },
    selection: { anchor: head + 1 + prefix.length },
  });

  return true;
}

/**
 * 获取下一个字母序号
 * A -> B, Z -> AA, AA -> AB, AZ -> BA
 */
function getNextLetter(letter: string): string {
  const isUpper = letter === letter.toUpperCase();
  const base = isUpper ? 'A'.charCodeAt(0) : 'a'.charCodeAt(0);
  const chars = letter.toUpperCase().split('');

  // 从最后一个字符开始进位
  let carry = true;
  for (let i = chars.length - 1; i >= 0 && carry; i--) {
    const code = chars[i].charCodeAt(0) - 'A'.charCodeAt(0);
    if (code < 25) {
      chars[i] = String.fromCharCode('A'.charCodeAt(0) + code + 1);
      carry = false;
    } else {
      chars[i] = 'A';
    }
  }

  if (carry) {
    chars.unshift('A');
  }

  const result = chars.join('');
  return isUpper ? result : result.toLowerCase();
}

/**
 * 自定义回车键处理 - 智能字母序号换行
 * 1. 在字母序号行末尾按回车时，自动添加下一个字母序号到新行
 * 2. 如果当前行只有字母序号没有内容，按回车时删除序号并退出序号模式
 */
function handleLetterListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 检查是否是字母序号行（如 A. B. a. b.）
  const letterMatch = lineText.match(/^(\s*)([A-Za-z])\.(\s)/);
  if (!letterMatch) {
    return false; // 不是字母序号行，使用默认行为
  }

  const indent = letterMatch[1];
  const letter = letterMatch[2];
  const space = letterMatch[3];
  const prefix = indent + letter + '.' + space;
  const content = lineText.slice(prefix.length).trim();

  // 如果序号行只有标记没有内容，删除标记并退出序号模式
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 在序号行末尾按回车，自动添加下一个字母序号到新行
  const nextLetter = getNextLetter(letter);
  const newPrefix = indent + nextLetter + '. ';

  view.dispatch({
    changes: { from: head, insert: '\n' + newPrefix },
    selection: { anchor: head + 1 + newPrefix.length },
  });

  return true;
}

/**
 * 自定义回车键处理 - 保持缩进
 * 在有缩进的行按回车时，新行保持相同的缩进
 */
function handleIndentedEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 获取当前行的缩进
  const indentMatch = lineText.match(/^(\s+)/);
  if (!indentMatch) {
    return false; // 没有缩进，使用默认行为
  }
  
  const indent = indentMatch[1];
  
  // 在当前位置插入换行和缩进
  view.dispatch({
    changes: { from: head, insert: '\n' + indent },
    selection: { anchor: head + 1 + indent.length },
  });
  
  return true;
}

/**
 * 自定义 TAB 键处理 - 检测 TAB 缩进后是否会导致内容超出编辑器宽度
 * 如果 TAB 缩进后行宽度超出编辑器宽度，则禁止 TAB
 */
function handleTabBoundary(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  
  // 获取编辑器可用宽度
  const contentElement = view.dom.querySelector('.cm-content');
  const editorWidth = contentElement?.clientWidth || 800;
  const charWidth = 8; // 估算每个字符宽度（等宽字体）
  const tabWidth = 2 * charWidth; // TAB = 2 空格
  const maxChars = Math.floor((editorWidth - 40) / charWidth); // 留出一些边距
  
  // 检查选区涉及的所有行
  const startLine = state.doc.lineAt(selection.main.from);
  const endLine = state.doc.lineAt(selection.main.to);
  
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    // 计算 TAB 后的行长度（TAB = 2 空格）
    const newLength = line.text.length + 2;
    if (newLength > maxChars) {
      // 会导致换行，禁止 TAB
      return true;
    }
  }
  
  // 允许 TAB，使用默认行为
  return false;
}

/**
 * 自定义 Ctrl+X 处理 - 剪切整行后保持光标在缩进位置
 * 当剪切整行（无选区）时：
 * - 如果下面还有行，光标留在下一行的缩进位置
 * - 如果是最后一行，光标移到上一行的缩进位置
 */
function handleCutLine(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;

  // 只处理无选区的情况（剪切整行）
  if (!selection.main.empty) {
    return false; // 有选区，使用默认行为
  }

  const line = state.doc.lineAt(selection.main.head);
  const lineText = line.text;

  // 复制当前行内容到剪贴板（包含换行符）
  const textToCopy = lineText + '\n';
  navigator.clipboard.writeText(textToCopy);

  // 计算删除范围和光标位置
  let deleteFrom = line.from;
  let deleteTo = line.to;
  let newCursorPos = line.from;

  if (line.number < state.doc.lines) {
    // 不是最后一行：删除当前行（包含换行符），光标留在下一行的缩进位置
    deleteTo = line.to + 1;
    const nextLine = state.doc.line(line.number + 1);
    const nextIndent = getIndentLevel(nextLine.text);
    // 删除后，下一行会变成当前位置，光标放在缩进位置
    newCursorPos = line.from + Math.min(nextIndent, nextLine.text.length);
  } else if (line.number > 1) {
    // 是最后一行且不是第一行：删除前面的换行符，光标移到上一行末尾
    deleteFrom = line.from - 1;
    const prevLine = state.doc.line(line.number - 1);
    newCursorPos = prevLine.to;
  }

  // 执行删除
  view.dispatch({
    changes: { from: deleteFrom, to: deleteTo },
    selection: { anchor: newCursorPos },
  });

  return true;
}

/**
 * 自定义 Ctrl+- 处理 - 减少光标行或选中行的缩进
 * 每次减少 2 个空格（1 个 TAB 单位）
 * 边界检查：
 * - 单行时：如果当前行缩进 < TAB_SIZE，不允许减少
 * - 多行时：如果任何非空行缩进 < TAB_SIZE，不允许减少
 */
function handleDecreaseIndent(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const TAB_SIZE = 2;

  // 获取选区涉及的所有行（无选区时是光标所在行）
  const startLine = state.doc.lineAt(selection.main.from);
  const endLine = state.doc.lineAt(selection.main.to);
  const isSingleLine = startLine.number === endLine.number;

  if (isSingleLine) {
    // 单行模式：只处理当前行
    const line = startLine;
    const lineText = line.text;
    const indent = getIndentLevel(lineText);

    // 如果没有缩进，不做任何改变
    if (indent < TAB_SIZE) {
      return true;
    }

    // 减少缩进
    const reduceAmount = Math.min(indent, TAB_SIZE);
    view.dispatch({
      changes: { from: line.from, to: line.from + reduceAmount, insert: '' },
    });

    return true;
  }

  // 多行模式：检查所有行的最小缩进
  let minIndent = Infinity;
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;
    // 跳过空行
    if (lineText.trim().length === 0) continue;
    const indent = getIndentLevel(lineText);
    minIndent = Math.min(minIndent, indent);
  }

  // 如果最小缩进小于 TAB_SIZE，不允许减少
  if (minIndent < TAB_SIZE) {
    return true;
  }

  const changes: { from: number; to: number; insert: string }[] = [];

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;
    const indent = getIndentLevel(lineText);

    // 如果没有缩进或是空行，跳过
    if (indent === 0 || lineText.trim().length === 0) continue;

    // 减少的空格数
    const reduceAmount = Math.min(indent, TAB_SIZE);
    changes.push({
      from: line.from,
      to: line.from + reduceAmount,
      insert: '',
    });
  }

  if (changes.length > 0) {
    view.dispatch({ changes });
  }

  return true;
}

/**
 * 自定义键盘映射 - 使用最高优先级确保在所有其他处理之前执行
 */
const customKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Backspace',
      run: (view) => {
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;
        
        // 如果有选区，使用默认行为
        if (!selection.main.empty) {
          return false;
        }

        // 检查光标前面是否是视频语法
        const doc = state.doc.toString();
        const videoRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
        let match;
        while ((match = videoRegex.exec(doc)) !== null) {
          const videoEnd = match.index + match[0].length;
          // 如果光标紧邻视频语法后面
          if (head === videoEnd) {
            // 检查是否是视频链接
            const url = match[2];
            const videoInfo = parseVideoUrl(url);
            if (videoInfo) {
              // 删除整个视频语法
              view.dispatch({
                changes: { from: match.index, to: videoEnd },
                selection: { anchor: match.index },
              });
              return true;
            }
          }
        }
        
        // 获取当前行
        const line = state.doc.lineAt(head);
        const text = line.text;
        const cursorOffset = head - line.from;
        
        // 检查是否是待办清单行
        const todoMatch = text.match(/^([\t ]*)([-*+•])\s\[([ xX])\](\s|$)/);
        if (!todoMatch) {
          return false; // 不是待办清单，使用默认行为
        }
        
        const bracketIndex = text.indexOf('[');
        if (bracketIndex === -1) {
          return false;
        }
        
        // 计算复选框区域结束位置（包括 ] 后面的空格）
        const checkboxEndOffset = bracketIndex + 4; // [ ] 加空格共4个字符
        
        // 如果光标在复选框区域后面（内容区域），正常删除一个字符
        if (cursorOffset > checkboxEndOffset) {
          // 使用默认行为删除一个字符
          return false;
        }
        
        // 如果光标在复选框区域内或紧邻复选框后面，正常删除一个字符
        if (cursorOffset > 0) {
          view.dispatch({
            changes: { from: head - 1, to: head },
            selection: { anchor: head - 1 },
          });
          return true;
        }
        
        return false;
      },
    },
    {
      key: 'Enter',
      run: (view) => {
        // 先尝试处理引用块
        if (handleBlockquoteEnter(view)) {
          return true;
        }
        // 尝试处理待办清单（优先于普通无序列表）
        if (handleTodoListEnter(view)) {
          return true;
        }
        // 再尝试处理无序列表
        if (handleListEnter(view)) {
          return true;
        }
        // 尝试处理字母序号列表
        if (handleLetterListEnter(view)) {
          return true;
        }
        // 最后处理普通缩进行，保持缩进
        if (handleIndentedEnter(view)) {
          return true;
        }
        // 使用默认行为
        return false;
      },
    },
    {
      key: 'Tab',
      run: (view) => {
        // 检查 TAB 是否会导致内容超出编辑器宽度
        if (handleTabBoundary(view)) {
          return true; // 禁止 TAB
        }
        // 使用默认行为
        return false;
      },
    },
    {
      key: 'Mod-x',
      run: (view) => {
        // 自定义剪切整行行为，保持光标在缩进位置
        return handleCutLine(view);
      },
    },
    {
      key: 'Mod--',
      run: (view) => {
        // 减少选中行的缩进
        return handleDecreaseIndent(view);
      },
    },
    {
      key: ' ',
      run: (view) => {
        // 检查是否需要将 "- " 转换为 "• "
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;

        // 获取当前行
        const line = state.doc.lineAt(head);
        const textBeforeCursor = line.text.slice(0, head - line.from);
        const textAfterCursor = line.text.slice(head - line.from);

        // 检查是否是待办清单格式 "- [ ]" 或 "• [ ]" 后面输入空格
        // 由于 ] 后面本身就有空格，所以不需要插入空格，只需要移动光标到空格后面
        if (/^[\t ]*[-•]\s\[[ xX]\]$/.test(textBeforeCursor)) {
          // 检查光标后面是否已经有空格
          if (textAfterCursor.startsWith(' ')) {
            // 已经有空格，只移动光标
            view.dispatch({
              selection: { anchor: head + 1 },
            });
          } else {
            // 没有空格，插入空格
            view.dispatch({
              changes: { from: head, insert: ' ' },
              selection: { anchor: head + 1 },
            });
          }
          return true;
        }

        // 检查是否匹配 "缩进 + -" 的模式
        if (/^\s*-$/.test(textBeforeCursor)) {
          // 检查光标后面是否是待办清单格式 [ ] 或 [x]
          // 如果是，不替换 - 为 •，让待办清单解析器处理
          if (/^\s*\[[ xX]\]/.test(textAfterCursor)) {
            return false; // 使用默认行为，不替换
          }
          
          const dashPos = head - 1;
          // 替换 "-" 为 "•" 并插入空格
          view.dispatch({
            changes: { from: dashPos, to: head, insert: '• ' },
            selection: { anchor: dashPos + 2 },
          });
          return true;
        }

        // 使用默认行为
        return false;
      },
    },
    {
      key: ']',
      run: (view) => {
        // 检查是否需要将 "• [ " 转换为 "- [ ]"（待办清单格式）
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;

        // 获取当前行
        const line = state.doc.lineAt(head);
        const textBeforeCursor = line.text.slice(0, head - line.from);

        // 检查是否匹配 "- [ " 或 "- [x" 或 "• [ " 或 "• [x" 的模式
        const todoMatch = textBeforeCursor.match(/^(\s*)([-•])\s\[[ xX]$/);
        if (todoMatch) {
          const indent = todoMatch[1];
          const marker = todoMatch[2];
          
          // 如果是 •，替换为 -
          if (marker === '•') {
            const bulletPos = line.from + indent.length;
            view.dispatch({
              changes: [
                { from: bulletPos, to: bulletPos + 1, insert: '-' },
                { from: head, insert: ']' }
              ],
              selection: { anchor: head + 1 },
            });
            return true;
          }
          
          // 如果已经是 -，只插入 ]
          view.dispatch({
            changes: { from: head, insert: ']' },
            selection: { anchor: head + 1 },
          });
          return true;
        }

        // 使用默认行为
        return false;
      },
    },
    {
      // Ctrl+I 或 Cmd+I 打开内联 AI 聊天
      key: 'Mod-i',
      run: (view) => {
        if (isInlineAIChatOpen(view)) {
          closeInlineAIChat(view);
        } else {
          openInlineAIChat(view);
        }
        return true;
      },
    },
  ])
);

/**
 * 检测 URL 是否为图片链接
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * 在指定位置插入文本
 */
function insertTextAtPosition(view: EditorView, pos: number, text: string): void {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
}

/**
 * 处理图片文件，转换为 base64 并插入 Markdown 图片语法（带尺寸）
 */
function handleImageFile(file: File, view: EditorView, pos: number): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target?.result as string;
    if (base64) {
      // 加载图片获取原始尺寸，设置为 25%
      const img = new Image();
      img.onload = () => {
        const width = Math.round(img.naturalWidth * 0.25);
        const height = Math.round(img.naturalHeight * 0.25);
        const markdownImage = `\n![${file.name}|${width}x${height}](${base64})\n`;
        insertTextAtPosition(view, pos, markdownImage);
      };
      img.src = base64;
    }
  };
  reader.readAsDataURL(file);
}

/**
 * 处理图片 URL，插入 Markdown 图片语法
 */
function handleImageUrl(url: string, view: EditorView, pos: number): void {
  const fileName = url.split('/').pop() || 'image';
  const markdownImage = `\n![${fileName}](${url})\n`;
  insertTextAtPosition(view, pos, markdownImage);
}

/**
 * 解析图片 alt 文本中的尺寸信息
 * 格式: alt|widthxheight 或 alt|width
 */
function parseImageSize(alt: string): { alt: string; width?: number; height?: number } {
  const sizeMatch = alt.match(/^(.+?)\|(\d+)(?:x(\d+))?$/);
  if (sizeMatch) {
    return {
      alt: sizeMatch[1],
      width: parseInt(sizeMatch[2], 10),
      height: sizeMatch[3] ? parseInt(sizeMatch[3], 10) : undefined,
    };
  }
  return { alt };
}

/**
 * 图片 Widget 类 - 用于在编辑器中渲染可调整大小的图片
 */
class ResizableImageWidget extends WidgetType {
  private rotation: number = 0;
  private align: 'left' | 'center' | 'right' = 'left';
  private displayStyle: 'default' | 'link' | 'card' = 'default';
  private documentClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width: number | undefined,
    readonly height: number | undefined,
    readonly from: number,
    readonly to: number,
    readonly originalMatch: string
  ) {
    super();
    // 解析 alt 中的旋转、对齐和显示样式信息
    this.parseAltAttributes();
  }

  private parseAltAttributes(): void {
    // 格式: alt|widthxheight|r90|center|style:link
    const parts = this.alt.split('|');
    for (const part of parts) {
      if (part.startsWith('r') && !isNaN(parseInt(part.slice(1)))) {
        this.rotation = parseInt(part.slice(1)) % 360;
      } else if (['left', 'center', 'right'].includes(part)) {
        this.align = part as 'left' | 'center' | 'right';
      } else if (part.startsWith('style:')) {
        const style = part.slice(6);
        if (['default', 'link', 'card'].includes(style)) {
          this.displayStyle = style as 'default' | 'link' | 'card';
        }
      }
    }
  }

  private getCleanAlt(): string {
    // 移除尺寸、旋转、对齐、样式信息，只保留原始 alt
    const parts = this.alt.split('|');
    const cleanParts = parts.filter(part => {
      if (/^\d+x\d+$/.test(part)) return false;
      if (/^\d+$/.test(part)) return false;
      if (part.startsWith('r') && !isNaN(parseInt(part.slice(1)))) return false;
      if (['left', 'center', 'right'].includes(part)) return false;
      if (part.startsWith('style:')) return false;
      return true;
    });
    return cleanParts.join('|') || 'image';
  }

  private getFileName(): string {
    try {
      const url = new URL(this.src);
      const pathname = url.pathname;
      return pathname.split('/').pop() || this.src;
    } catch {
      return this.src.split('/').pop() || this.src;
    }
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-image-widget';
    
    // 设置对齐方式
    wrapper.setAttribute('data-align', this.align);

    const container = document.createElement('div');
    container.className = 'cm-image-container';

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.getCleanAlt();
    img.className = 'cm-inline-image';
    if (this.width) img.style.width = `${this.width}px`;
    // 不设置固定高度，让图片保持原始宽高比
    if (this.rotation) img.style.transform = `rotate(${this.rotation}deg)`;

    // 创建工具栏（在图片上方）
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-image-toolbar';

    // 旋转按钮
    const rotateBtn = document.createElement('div');
    rotateBtn.className = 'cm-image-toolbar-btn';
    rotateBtn.title = '旋转';
    rotateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>`;
    rotateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.rotateImage(img);
    });

    // 尺寸下拉菜单
    const sizeDropdown = document.createElement('div');
    sizeDropdown.className = 'cm-image-toolbar-dropdown';
    
    const sizeBtn = document.createElement('div');
    sizeBtn.className = 'cm-image-toolbar-btn';
    sizeBtn.title = '尺寸';
    sizeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>`;
    
    const sizeMenu = document.createElement('div');
    sizeMenu.className = 'cm-image-toolbar-menu';
    sizeMenu.style.display = 'none';
    
    const sizeOptions = [
      { label: '25%', value: 0.25 },
      { label: '50%', value: 0.5 },
      { label: '75%', value: 0.75 },
      { label: '100%', value: 1 },
    ];
    
    sizeOptions.forEach(option => {
      const item = document.createElement('div');
      item.className = 'cm-image-toolbar-menu-item';
      item.textContent = option.label;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.resizeImagePercent(img, option.value);
        sizeMenu.style.display = 'none';
      });
      sizeMenu.appendChild(item);
    });
    
    sizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 关闭其他菜单
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== sizeMenu) (menu as HTMLElement).style.display = 'none';
      });
      sizeMenu.style.display = sizeMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    sizeDropdown.appendChild(sizeBtn);
    sizeDropdown.appendChild(sizeMenu);

    // 对齐下拉菜单
    const alignDropdown = document.createElement('div');
    alignDropdown.className = 'cm-image-toolbar-dropdown';
    
    const alignBtn = document.createElement('div');
    alignBtn.className = 'cm-image-toolbar-btn';
    alignBtn.title = '对齐方式';
    alignBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`;
    
    const alignMenu = document.createElement('div');
    alignMenu.className = 'cm-image-toolbar-menu';
    alignMenu.style.display = 'none';
    
    const alignOptions = [
      { label: '左对齐', value: 'left', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>` },
      { label: '居中', value: 'center', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>` },
      { label: '右对齐', value: 'right', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>` },
    ];
    
    alignOptions.forEach(option => {
      const item = document.createElement('div');
      item.className = `cm-image-toolbar-menu-item ${this.align === option.value ? 'active' : ''}`;
      item.innerHTML = `<span class="cm-menu-icon">${option.icon}</span><span>${option.label}</span>`;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setAlignment(wrapper, option.value as 'left' | 'center' | 'right');
        alignMenu.style.display = 'none';
        // 更新菜单项的 active 状态
        alignMenu.querySelectorAll('.cm-image-toolbar-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      alignMenu.appendChild(item);
    });
    
    alignBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 关闭其他菜单
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== alignMenu) (menu as HTMLElement).style.display = 'none';
      });
      alignMenu.style.display = alignMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    alignDropdown.appendChild(alignBtn);
    alignDropdown.appendChild(alignMenu);

    // 描述按钮
    const captionBtn = document.createElement('div');
    captionBtn.className = `cm-image-toolbar-btn ${this.getCleanAlt() !== 'image' ? 'active' : ''}`;
    captionBtn.title = '添加描述';
    captionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>`;
    
    // 描述输入容器
    const captionContainer = document.createElement('div');
    captionContainer.className = 'cm-image-caption-container';
    captionContainer.style.display = 'none';
    
    const captionInput = document.createElement('input');
    captionInput.type = 'text';
    captionInput.className = 'cm-image-caption-input';
    captionInput.placeholder = '添加图片描述...';
    captionInput.value = this.getCleanAlt() !== 'image' ? this.getCleanAlt() : '';
    
    captionInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.updateCaption(captionInput.value);
        captionContainer.style.display = 'none';
        captionBtn.classList.toggle('active', captionInput.value.length > 0);
      } else if (e.key === 'Escape') {
        captionContainer.style.display = 'none';
      }
    });
    
    captionInput.addEventListener('blur', () => {
      this.updateCaption(captionInput.value);
      captionBtn.classList.toggle('active', captionInput.value.length > 0);
    });
    
    captionContainer.appendChild(captionInput);
    
    captionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 关闭其他菜单
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        (menu as HTMLElement).style.display = 'none';
      });
      const isVisible = captionContainer.style.display !== 'none';
      captionContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        setTimeout(() => captionInput.focus(), 0);
      }
    });

    // 显示样式下拉菜单
    const styleDropdown = document.createElement('div');
    styleDropdown.className = 'cm-image-toolbar-dropdown';
    
    const styleBtn = document.createElement('div');
    styleBtn.className = 'cm-image-toolbar-btn';
    styleBtn.title = '显示样式';
    styleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    
    const styleMenu = document.createElement('div');
    styleMenu.className = 'cm-image-toolbar-menu';
    styleMenu.style.display = 'none';
    
    const styleOptions = [
      { label: '默认', value: 'default', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>` },
      { label: '链接', value: 'link', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` },
      { label: '卡片', value: 'card', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>` },
    ];
    
    styleOptions.forEach(option => {
      const item = document.createElement('div');
      item.className = `cm-image-toolbar-menu-item ${this.displayStyle === option.value ? 'active' : ''}`;
      item.innerHTML = `<span class="cm-menu-icon">${option.icon}</span><span>${option.label}</span>`;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setDisplayStyle(wrapper, container, img, option.value as 'default' | 'link' | 'card');
        styleMenu.style.display = 'none';
        // 更新菜单项的 active 状态
        styleMenu.querySelectorAll('.cm-image-toolbar-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      styleMenu.appendChild(item);
    });
    
    styleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 关闭其他菜单
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== styleMenu) (menu as HTMLElement).style.display = 'none';
      });
      styleMenu.style.display = styleMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    styleDropdown.appendChild(styleBtn);
    styleDropdown.appendChild(styleMenu);

    // 裁剪按钮
    const cropBtn = document.createElement('div');
    cropBtn.className = 'cm-image-toolbar-btn';
    cropBtn.title = '裁剪';
    cropBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>`;
    cropBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showCropDialog(img);
    });

    // 分隔线
    const divider = document.createElement('div');
    divider.className = 'cm-image-toolbar-divider';

    // 全屏按钮
    const fullscreenBtn = document.createElement('div');
    fullscreenBtn.className = 'cm-image-toolbar-btn';
    fullscreenBtn.title = '全屏查看';
    fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    fullscreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showFullscreen(img.src);
    });

    // 删除按钮
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'cm-image-toolbar-btn cm-image-toolbar-btn-danger';
    deleteBtn.title = '删除图片';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.deleteImage();
    });

    toolbar.appendChild(rotateBtn);
    toolbar.appendChild(cropBtn);
    toolbar.appendChild(sizeDropdown);
    toolbar.appendChild(alignDropdown);
    toolbar.appendChild(styleDropdown);
    toolbar.appendChild(captionBtn);
    toolbar.appendChild(divider);
    toolbar.appendChild(fullscreenBtn);
    toolbar.appendChild(deleteBtn);

    // 创建调整大小的手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cm-image-resize-handle';

    // 点击图片选中（使用 mousedown 确保第一时间响应）
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // 移除其他图片的选中状态
      document.querySelectorAll('.cm-image-container.selected').forEach(el => {
        if (el !== container) el.classList.remove('selected');
      });
      container.classList.add('selected');
      // 记录选中的图片 src
      selectedImageSrc = this.src;
    });

    // 工具栏点击时阻止冒泡，保持选中状态
    toolbar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // 点击其他地方取消选中和关闭菜单
    this.documentClickHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      // 如果点击在 container 或 toolbar 内，不取消选中
      if (!container.contains(target) && !toolbar.contains(target)) {
        container.classList.remove('selected');
        // 清除选中的图片 src
        if (selectedImageSrc === this.src) {
          selectedImageSrc = null;
        }
      }
      // 关闭所有菜单（除非点击在菜单内）
      if (!toolbar.contains(target)) {
        toolbar.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
          (menu as HTMLElement).style.display = 'none';
        });
      }
    };
    
    document.addEventListener('mousedown', this.documentClickHandler);

    container.appendChild(img);
    container.appendChild(toolbar);
    container.appendChild(captionContainer);
    container.appendChild(resizeHandle);
    wrapper.appendChild(container);

    // 如果这个图片之前被选中，恢复选中状态
    if (selectedImageSrc === this.src) {
      container.classList.add('selected');
    }

    // 添加调整大小的事件处理
    this.setupResizeHandler(resizeHandle, img, container);

    // 如果初始显示样式不是默认，直接应用对应样式
    if (this.displayStyle !== 'default') {
      wrapper.setAttribute('data-style', this.displayStyle);
      img.style.display = 'none';
      resizeHandle.style.display = 'none';
      
      if (this.displayStyle === 'link') {
        const linkDisplay = document.createElement('div');
        linkDisplay.className = 'cm-image-link-display';
        linkDisplay.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span class="cm-image-link-text">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
        `;
        container.insertBefore(linkDisplay, toolbar);
      } else if (this.displayStyle === 'card') {
        const cardDisplay = document.createElement('div');
        cardDisplay.className = 'cm-image-card-display';
        cardDisplay.innerHTML = `
          <div class="cm-image-card-preview">
            <img src="${this.src}" alt="${this.getCleanAlt()}" />
          </div>
          <div class="cm-image-card-info">
            <span class="cm-image-card-name">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
            <span class="cm-image-card-type">图片</span>
          </div>
        `;
        container.insertBefore(cardDisplay, toolbar);
      }
    }

    return wrapper;
  }

  private rotateImage(img: HTMLImageElement): void {
    this.rotation = (this.rotation + 90) % 360;
    img.style.transform = this.rotation ? `rotate(${this.rotation}deg)` : '';
    this.updateImageAttributes();
  }

  private resizeImagePercent(img: HTMLImageElement, percent: number): void {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const newWidth = Math.round(naturalWidth * percent);
    const newHeight = Math.round(naturalHeight * percent);
    img.style.width = `${newWidth}px`;
    img.style.height = `${newHeight}px`;
    this.updateImageSize(newWidth, newHeight);
  }

  private setAlignment(wrapper: HTMLElement, align: 'left' | 'center' | 'right'): void {
    this.align = align;
    wrapper.setAttribute('data-align', align);
    this.updateImageAttributes();
  }

  private updateCaption(caption: string): void {
    const view = globalEditorView;
    if (!view) return;

    // 构建新的 alt 属性
    let newAlt = caption || 'image';
    
    // 添加尺寸
    if (this.width && this.height) {
      newAlt += `|${this.width}x${this.height}`;
    }
    
    // 添加旋转
    if (this.rotation) {
      newAlt += `|r${this.rotation}`;
    }
    
    // 添加对齐
    if (this.align !== 'left') {
      newAlt += `|${this.align}`;
    }

    const newMarkdown = `![${newAlt}](${this.src})`;

    // 查找并替换原始图片语法
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        break;
      }
    }

    if (targetFrom >= 0 && targetTo >= 0) {
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: newMarkdown },
      });
    }
  }

  private updateImageAttributes(): void {
    const view = globalEditorView;
    if (!view) return;

    // 构建新的 alt 属性
    const cleanAlt = this.getCleanAlt();
    let newAlt = cleanAlt;
    
    // 添加尺寸
    if (this.width && this.height) {
      newAlt += `|${this.width}x${this.height}`;
    }
    
    // 添加旋转
    if (this.rotation) {
      newAlt += `|r${this.rotation}`;
    }
    
    // 添加对齐
    if (this.align !== 'left') {
      newAlt += `|${this.align}`;
    }

    // 添加显示样式
    if (this.displayStyle !== 'default') {
      newAlt += `|style:${this.displayStyle}`;
    }

    const newMarkdown = `![${newAlt}](${this.src})`;

    // 查找并替换原始图片语法
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        break;
      }
    }

    if (targetFrom >= 0 && targetTo >= 0) {
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: newMarkdown },
      });
    }
  }

  private setDisplayStyle(
    wrapper: HTMLElement,
    container: HTMLElement,
    img: HTMLImageElement,
    style: 'default' | 'link' | 'card'
  ): void {
    this.displayStyle = style;
    wrapper.setAttribute('data-style', style);
    
    // 移除旧的显示内容
    const oldLinkDisplay = container.querySelector('.cm-image-link-display');
    const oldCardDisplay = container.querySelector('.cm-image-card-display');
    if (oldLinkDisplay) oldLinkDisplay.remove();
    if (oldCardDisplay) oldCardDisplay.remove();
    
    // 获取工具栏和调整手柄的引用
    const toolbar = container.querySelector('.cm-image-toolbar');
    const resizeHandle = container.querySelector('.cm-image-resize-handle');
    
    // 根据样式显示/隐藏图片
    if (style === 'default') {
      img.style.display = 'block';
      // 显示调整手柄
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = '';
    } else if (style === 'link') {
      img.style.display = 'none';
      // 隐藏调整手柄
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = 'none';
      
      const linkDisplay = document.createElement('div');
      linkDisplay.className = 'cm-image-link-display';
      linkDisplay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span class="cm-image-link-text">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
      `;
      // 插入到图片之后
      img.insertAdjacentElement('afterend', linkDisplay);
    } else if (style === 'card') {
      img.style.display = 'none';
      // 隐藏调整手柄
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = 'none';
      
      const cardDisplay = document.createElement('div');
      cardDisplay.className = 'cm-image-card-display';
      cardDisplay.innerHTML = `
        <div class="cm-image-card-preview">
          <img src="${this.src}" alt="${this.getCleanAlt()}" />
        </div>
        <div class="cm-image-card-info">
          <span class="cm-image-card-name">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
          <span class="cm-image-card-type">图片</span>
        </div>
      `;
      // 插入到图片之后
      img.insertAdjacentElement('afterend', cardDisplay);
    }
    
    this.updateImageAttributes();
  }

  private showCropDialog(img: HTMLImageElement): void {
    // 创建裁剪对话框
    const overlay = document.createElement('div');
    overlay.className = 'cm-image-crop-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'cm-image-crop-dialog';
    
    const title = document.createElement('div');
    title.className = 'cm-image-crop-title';
    title.textContent = '裁剪图片';
    
    const cropContainer = document.createElement('div');
    cropContainer.className = 'cm-image-crop-container';
    
    const cropImg = document.createElement('img');
    cropImg.src = this.src;
    cropImg.className = 'cm-image-crop-img';
    
    const cropBox = document.createElement('div');
    cropBox.className = 'cm-image-crop-box';
    
    // 裁剪框的四个角
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
      const handle = document.createElement('div');
      handle.className = `cm-image-crop-handle ${pos}`;
      cropBox.appendChild(handle);
    });
    
    cropContainer.appendChild(cropImg);
    cropContainer.appendChild(cropBox);
    
    // 按钮区域
    const buttons = document.createElement('div');
    buttons.className = 'cm-image-crop-buttons';
    
    const cancelBtn = document.createElement('div');
    cancelBtn.className = 'cm-image-crop-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });
    
    const confirmBtn = document.createElement('div');
    confirmBtn.className = 'cm-image-crop-btn cm-image-crop-btn-primary';
    confirmBtn.textContent = '确定';
    confirmBtn.addEventListener('click', () => {
      // 获取裁剪区域并应用
      this.applyCrop(cropImg, cropBox, img);
      overlay.remove();
    });
    
    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    
    dialog.appendChild(title);
    dialog.appendChild(cropContainer);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    
    // ESC 关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    document.body.appendChild(overlay);
    
    // 初始化裁剪框拖拽
    this.setupCropBoxDrag(cropBox, cropImg);
  }

  private setupCropBoxDrag(cropBox: HTMLElement, cropImg: HTMLImageElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    
    cropBox.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('cm-image-crop-handle')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = cropBox.offsetLeft;
      startTop = cropBox.offsetTop;
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const newLeft = Math.max(0, Math.min(cropImg.offsetWidth - cropBox.offsetWidth, startLeft + deltaX));
      const newTop = Math.max(0, Math.min(cropImg.offsetHeight - cropBox.offsetHeight, startTop + deltaY));
      cropBox.style.left = `${newLeft}px`;
      cropBox.style.top = `${newTop}px`;
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  private applyCrop(cropImg: HTMLImageElement, cropBox: HTMLElement, targetImg: HTMLImageElement): void {
    // 计算裁剪比例
    const scaleX = cropImg.naturalWidth / cropImg.offsetWidth;
    const scaleY = cropImg.naturalHeight / cropImg.offsetHeight;
    
    const cropX = cropBox.offsetLeft * scaleX;
    const cropY = cropBox.offsetTop * scaleY;
    const cropWidth = cropBox.offsetWidth * scaleX;
    const cropHeight = cropBox.offsetHeight * scaleY;
    
    // 使用 Canvas 裁剪图片
    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(cropImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    // 转换为 base64
    const croppedSrc = canvas.toDataURL('image/png');
    
    // 更新图片
    targetImg.src = croppedSrc;
    
    // 更新 Markdown
    this.updateImageSrc(croppedSrc);
  }

  private updateImageSrc(newSrc: string): void {
    const view = globalEditorView;
    if (!view) return;

    // 构建新的 Markdown
    let newAlt = this.getCleanAlt();
    if (this.width && this.height) {
      newAlt += `|${this.width}x${this.height}`;
    }
    if (this.rotation) {
      newAlt += `|r${this.rotation}`;
    }
    if (this.align !== 'left') {
      newAlt += `|${this.align}`;
    }
    if (this.displayStyle !== 'default') {
      newAlt += `|style:${this.displayStyle}`;
    }

    const newMarkdown = `![${newAlt}](${newSrc})`;

    // 查找并替换原始图片语法
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        break;
      }
    }

    if (targetFrom >= 0 && targetTo >= 0) {
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: newMarkdown },
      });
    }
  }

  private showFullscreen(src: string): void {
    // 创建全屏遮罩
    const overlay = document.createElement('div');
    overlay.className = 'cm-image-fullscreen-overlay';

    const fullImg = document.createElement('img');
    fullImg.src = src;
    fullImg.className = 'cm-image-fullscreen-img';

    // 关闭按钮
    const closeBtn = document.createElement('div');
    closeBtn.className = 'cm-image-fullscreen-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // ESC 键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    overlay.appendChild(fullImg);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  private deleteImage(): void {
    const view = globalEditorView;
    if (!view) return;

    // 查找并删除图片语法
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        // 检查前后是否有换行符，一并删除
        if (targetFrom > 0 && doc[targetFrom - 1] === '\n') {
          targetFrom--;
        }
        if (targetTo < doc.length && doc[targetTo] === '\n') {
          targetTo++;
        }
        break;
      }
    }

    if (targetFrom >= 0 && targetTo >= 0) {
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: '' },
      });
    }
  }

  private setupResizeHandler(handle: HTMLElement, img: HTMLImageElement, container: HTMLElement): void {
    let startX = 0;
    let startWidth = 0;
    let startHeight = 0;
    let aspectRatio = 1;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      startX = e.clientX;
      startWidth = img.offsetWidth;
      startHeight = img.offsetHeight;
      aspectRatio = startWidth / startHeight;

      container.classList.add('resizing');

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + deltaX);
      const newHeight = Math.round(newWidth / aspectRatio);

      img.style.width = `${newWidth}px`;
      img.style.height = `${newHeight}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      container.classList.remove('resizing');

      // 获取最终尺寸
      const finalWidth = img.offsetWidth;
      const finalHeight = img.offsetHeight;

      // 更新 Markdown 中的图片尺寸
      this.updateImageSize(finalWidth, finalHeight);
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  private updateImageSize(width: number, height: number): void {
    const view = globalEditorView;
    if (!view) return;

    // 构建新的 Markdown 图片语法
    const newAlt = `${this.alt}|${width}x${height}`;
    const newMarkdown = `![${newAlt}](${this.src})`;

    // 查找并替换原始图片语法
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        break;
      }
    }

    if (targetFrom >= 0 && targetTo >= 0) {
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: newMarkdown },
      });
    }
  }

  eq(other: ResizableImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.width === this.width &&
      other.height === this.height &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  ignoreEvent(): boolean {
    return false;
  }

  destroy(): void {
    // 清理事件监听器
    if (this.documentClickHandler) {
      document.removeEventListener('mousedown', this.documentClickHandler);
      this.documentClickHandler = null;
    }
  }
}

/**
 * 解析文档中的图片语法并创建装饰器
 */
function parseImages(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 匹配 Markdown 图片语法: ![alt](src) 或 ![alt|widthxheight](src)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = imageRegex.exec(doc)) !== null) {
    const rawAlt = match[1];
    const src = match[2];
    const from = match.index;
    const to = from + match[0].length;

    // 跳过视频链接，让视频装饰器处理
    if (isVideoUrl(src)) {
      continue;
    }

    // 解析尺寸信息
    const { alt, width, height } = parseImageSize(rawAlt);

    // 隐藏原始图片语法文本
    decorations.push({
      from,
      to,
      decoration: Decoration.replace({
        widget: new ResizableImageWidget(src, alt, width, height, from, to, match[0]),
      }),
    });
  }

  // 按位置排序
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 检查 URL 是否为视频链接
 */
function isVideoUrl(url: string): boolean {
  // B站
  if (/bilibili\.com\/video\/(BV[\w]+|av\d+)/i.test(url)) return true;
  if (/b23\.tv\//i.test(url)) return true;
  // YouTube
  if (/(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url)) return true;
  // 优酷
  if (/youku\.com\/v_show\/id_/i.test(url)) return true;
  return false;
}

/**
 * 图片装饰器 StateField
 */
const imageDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseImages(state.doc.toString());
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return parseImages(tr.newDoc.toString());
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

// ============================================================================
// 视频嵌入渲染系统
// ============================================================================

/**
 * 视频平台类型
 */
type VideoPlatform = 'bilibili' | 'youtube' | 'youku' | 'qq' | 'iqiyi' | 'xigua' | 'douyin' | 'local' | 'other';

/**
 * 视频信息结构
 */
interface VideoInfo {
  platform: VideoPlatform;
  embedUrl: string;
  originalUrl: string;
}

/**
 * 解析视频链接，转换为嵌入链接
 */
function parseVideoUrl(url: string): VideoInfo | null {
  console.log('[parseVideoUrl] 解析视频链接:', url);
  
  // B站链接解析
  // 支持格式: 
  // - https://www.bilibili.com/video/BVxxxxxxx
  // - https://b23.tv/xxxxxxx
  // - https://www.bilibili.com/video/avxxxxxxx
  const bilibiliMatch = url.match(/bilibili\.com\/video\/(BV[\w]+|av\d+)/i);
  if (bilibiliMatch) {
    const videoId = bilibiliMatch[1];
    const isBV = videoId.startsWith('BV') || videoId.startsWith('bv');
    const embedUrl = isBV 
      ? `https://player.bilibili.com/player.html?bvid=${videoId}&autoplay=0`
      : `https://player.bilibili.com/player.html?aid=${videoId.slice(2)}&autoplay=0`;
    return { platform: 'bilibili', embedUrl, originalUrl: url };
  }

  // B站短链接
  const b23Match = url.match(/b23\.tv\/([\w]+)/i);
  if (b23Match) {
    // 短链接需要重定向，暂时使用原链接
    return { platform: 'bilibili', embedUrl: url, originalUrl: url };
  }

  // YouTube 链接解析
  // 支持格式:
  // - https://www.youtube.com/watch?v=xxxxxxx
  // - https://youtu.be/xxxxxxx
  // 使用 youtube-nocookie.com 隐私增强模式，避免嵌入限制
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (youtubeMatch) {
    const videoId = youtubeMatch[1];
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
    return { platform: 'youtube', embedUrl, originalUrl: url };
  }

  // 优酷链接解析
  // 支持格式: https://v.youku.com/v_show/id_xxxxxxx.html
  const youkuMatch = url.match(/youku\.com\/v_show\/id_([\w=]+)/i);
  if (youkuMatch) {
    const videoId = youkuMatch[1];
    const embedUrl = `https://player.youku.com/embed/${videoId}`;
    return { platform: 'youku', embedUrl, originalUrl: url };
  }

  // 腾讯视频链接解析
  // 支持格式: https://v.qq.com/x/cover/xxx/xxx.html
  const qqMatch = url.match(/v\.qq\.com/i);
  if (qqMatch) {
    return { platform: 'qq', embedUrl: url, originalUrl: url };
  }

  // 爱奇艺链接解析
  // 支持格式: https://www.iqiyi.com/v_xxx.html
  const iqiyiMatch = url.match(/iqiyi\.com/i);
  if (iqiyiMatch) {
    return { platform: 'iqiyi', embedUrl: url, originalUrl: url };
  }

  // 西瓜视频链接解析
  // 支持格式: https://www.ixigua.com/xxx
  const xiguaMatch = url.match(/ixigua\.com/i);
  if (xiguaMatch) {
    return { platform: 'xigua', embedUrl: url, originalUrl: url };
  }

  // 抖音链接解析
  // 支持格式: https://www.douyin.com/video/xxx
  const douyinMatch = url.match(/douyin\.com/i);
  if (douyinMatch) {
    return { platform: 'douyin', embedUrl: url, originalUrl: url };
  }

  // 本地视频文件
  // 支持格式: file:///path/to/video.mp4 或 C:\path\to\video.mp4 或 /path/to/video.mp4
  const localVideoExtensions = /\.(mp4|webm|ogg|mov|avi|mkv)$/i;
  // 先解码 URL 编码的路径
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // 解码失败则使用原始 URL
  }
  console.log('[parseVideoUrl] 检查本地视频, url:', url, 'decodedUrl:', decodedUrl);
  console.log('[parseVideoUrl] file:// 匹配:', url.match(/^file:\/\//i));
  console.log('[parseVideoUrl] Windows路径匹配:', url.match(/^[A-Za-z]:[\\\/]/));
  console.log('[parseVideoUrl] 扩展名匹配:', localVideoExtensions.test(decodedUrl));
  // 检查是否为本地视频路径
  const isLocalPath = 
    url.match(/^file:\/\//i) || 
    decodedUrl.match(/^file:\/\//i) || 
    url.match(/^[A-Za-z]:[\\\/]/) ||  // Windows 路径: C:\ 或 C:/
    decodedUrl.match(/^[A-Za-z]:[\\\/]/) ||
    (url.startsWith('/') && localVideoExtensions.test(decodedUrl));
  
  if (isLocalPath) {
    console.log('[parseVideoUrl] 识别为本地视频');
    return { platform: 'local', embedUrl: url, originalUrl: url };
  }
  // 也支持不带协议的本地路径（有视频扩展名且不是 http/https）
  if (localVideoExtensions.test(decodedUrl) && !url.match(/^https?:\/\//i)) {
    console.log('[parseVideoUrl] 识别为本地视频(无协议)');
    return { platform: 'local', embedUrl: url, originalUrl: url };
  }

  // 通用视频链接 - 支持任意 http/https 链接
  // 使用增强型浏览器可以直接加载任意网页
  if (url.match(/^https?:\/\//i)) {
    return { platform: 'other', embedUrl: url, originalUrl: url };
  }

  return null;
}

// ============================================================================
// Mermaid 图表渲染系统
// ============================================================================

// 初始化 Mermaid
let mermaidInitialized = false;
const initMermaid = () => {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
    },
    sequence: {
      useMaxWidth: true,
    },
  });
  mermaidInitialized = true;
};

// Mermaid Widget DOM 缓存
const mermaidWidgetDomCache = new WeakMap<MermaidWidget, HTMLElement>();

/**
 * Mermaid 图表 Widget 类
 */
class MermaidWidget extends WidgetType {
  private code: string;
  private from: number;
  private to: number;
  private domElement: HTMLElement | null = null;

  constructor(code: string, from: number, to: number) {
    super();
    this.code = code;
    this.from = from;
    this.to = to;
  }

  eq(other: MermaidWidget): boolean {
    return other.code === this.code;
  }

  toDOM(): HTMLElement {
    // 检查缓存
    if (this.domElement) {
      return this.domElement;
    }

    const cached = mermaidWidgetDomCache.get(this);
    if (cached) {
      this.domElement = cached;
      return cached;
    }

    initMermaid();

    const wrapper = document.createElement('div');
    wrapper.className = 'cm-mermaid-widget';

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-mermaid-toolbar';

    // 左侧：标题
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-mermaid-toolbar-left';

    // 标题显示
    const title = document.createElement('span');
    title.className = 'cm-mermaid-title';
    title.textContent = '流程图';

    // 标题编辑输入框
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'cm-mermaid-title-input';
    titleInput.value = '流程图';
    titleInput.style.display = 'none';

    // 编辑状态
    let isEditing = false;

    // 进入编辑模式
    const enterEditMode = () => {
      isEditing = true;
      title.style.display = 'none';
      titleInput.style.display = 'block';
      titleInput.value = title.textContent || '流程图';
      titleInput.focus();
      titleInput.select();
    };

    // 退出编辑模式
    const exitEditMode = (save: boolean) => {
      if (!isEditing) return;
      isEditing = false;
      title.style.display = 'block';
      titleInput.style.display = 'none';
      if (save && titleInput.value.trim()) {
        title.textContent = titleInput.value.trim();
      }
    };

    // 输入框事件
    titleInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        exitEditMode(true);
      } else if (e.key === 'Escape') {
        exitEditMode(false);
      }
    });

    titleInput.addEventListener('blur', () => {
      exitEditMode(true);
    });

    titleInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    toolbarLeft.appendChild(title);
    toolbarLeft.appendChild(titleInput);

    // 右侧：工具栏按钮
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-mermaid-toolbar-right';

    // 编辑按钮
    const editBtn = document.createElement('span');
    editBtn.className = 'cm-mermaid-toolbar-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = `<svg viewBox="0 0 32 32" fill="currentColor" width="16" height="16"><path d="M2 26h28v2H2z"></path><path d="M25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10l3.6 3.6l-10 10H6z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterEditMode();
    });

    // 卡片按钮
    const cardBtn = document.createElement('span');
    cardBtn.className = 'cm-mermaid-toolbar-btn';
    cardBtn.title = '卡片';
    cardBtn.innerHTML = `<svg viewBox="0 0 1024 1024" fill="currentColor" width="16" height="16"><path d="M341.333333 106.666667a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L192 234.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L234.666667 384h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L384 341.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L341.333333 192z m0 362.666667a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L192 682.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L234.666667 832h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L384 789.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L341.333333 640z m576-298.666667a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666a128 128 0 0 1 128 128v106.666666z m-85.333333 0v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L789.333333 192h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L640 234.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L682.666667 384h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L832 341.333333z m-42.666667 213.333334a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L640 682.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L682.666667 832h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L832 789.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L789.333333 640z" /></svg>`;
    cardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现卡片视图功能
      console.log('切换卡片视图');
    });

    // 设计按钮
    const designBtn = document.createElement('span');
    designBtn.className = 'cm-mermaid-toolbar-btn';
    designBtn.title = '设计';
    designBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`;
    designBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现设计功能
      console.log('打开设计视图');
    });

    // 主题按钮
    const themeBtn = document.createElement('span');
    themeBtn.className = 'cm-mermaid-toolbar-btn';
    themeBtn.title = '主题';
    themeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>`;
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现主题切换功能
      console.log('切换主题');
    });

    // 代码按钮
    const codeBtn = document.createElement('span');
    codeBtn.className = 'cm-mermaid-toolbar-btn';
    codeBtn.title = '代码';
    codeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`;
    codeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现查看代码功能
      console.log('查看代码');
    });

    // 扩大按钮
    const expandBtn = document.createElement('span');
    expandBtn.className = 'cm-mermaid-toolbar-btn';
    expandBtn.title = '扩大';
    expandBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>`;
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 打开流程图设计器标签页
      window.dispatchEvent(new CustomEvent('open-mermaid-designer', {
        detail: {
          code: this.code,
          title: title.textContent || '流程图'
        }
      }));
    });

    // 删除按钮
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-mermaid-toolbar-btn cm-mermaid-toolbar-btn-danger';
    deleteBtn.title = '删除';
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 7v4a.5.5 0 0 0 1 0V7a.5.5 0 0 0-1 0zM9 6.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zM10 4h3a.5.5 0 0 1 0 1h-.553l-.752 6.776A2.5 2.5 0 0 1 9.21 14H6.79a2.5 2.5 0 0 1-2.485-2.224L3.552 5H3a.5.5 0 0 1 0-1h3a2 2 0 1 1 4 0zM8 3a1 1 0 0 0-1 1h2a1 1 0 0 0-1-1zM4.559 5l.74 6.666A1.5 1.5 0 0 0 6.79 13h2.42a1.5 1.5 0 0 0 1.49-1.334L11.442 5H4.56z" fill="currentColor"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 删除 Mermaid 代码块
      if (globalEditorView) {
        globalEditorView.dispatch({
          changes: { from: this.from, to: this.to, insert: '' }
        });
      }
    });

    toolbarRight.appendChild(editBtn);
    toolbarRight.appendChild(cardBtn);
    toolbarRight.appendChild(designBtn);
    toolbarRight.appendChild(themeBtn);
    toolbarRight.appendChild(codeBtn);
    toolbarRight.appendChild(expandBtn);
    toolbarRight.appendChild(deleteBtn);

    toolbar.appendChild(toolbarLeft);
    toolbar.appendChild(toolbarRight);
    wrapper.appendChild(toolbar);

    // 内容区域（包含左侧工具栏和图表）
    const content = document.createElement('div');
    content.className = 'cm-mermaid-content';

    // 左侧垂直工具栏
    const sideToolbar = document.createElement('div');
    sideToolbar.className = 'cm-mermaid-side-toolbar';

    // 拖拽状态
    let isDragMode = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let translateX = 0;
    let translateY = 0;

    // 缩放状态
    let scale = 1;
    const minScale = 0.2;
    const maxScale = 2;
    const scaleStep = 0.25;

    // 更新变换
    const updateTransform = () => {
      svgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    };

    // 拖拽按钮
    const dragBtn = document.createElement('span');
    dragBtn.className = 'cm-mermaid-side-btn';
    dragBtn.title = '拖拽';
    dragBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
    dragBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isDragMode = !isDragMode;
      dragBtn.classList.toggle('active', isDragMode);
      container.classList.toggle('cm-mermaid-drag-mode', isDragMode);
    });

    // 百分比显示
    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'cm-mermaid-zoom-label';
    zoomLabel.textContent = '100%';

    // 缩放菜单
    const zoomPresets = [20, 50, 75, 100, 150, 200];
    let zoomMenu: HTMLElement | null = null;

    const showZoomMenu = (e: MouseEvent) => {
      e.stopPropagation();
      
      // 如果菜单已存在，先移除
      if (zoomMenu) {
        zoomMenu.remove();
        zoomMenu = null;
        return;
      }

      zoomMenu = document.createElement('div');
      zoomMenu.className = 'cm-mermaid-zoom-menu';

      zoomPresets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'cm-mermaid-zoom-menu-item';
        if (Math.round(scale * 100) === preset) {
          item.classList.add('active');
        }
        item.textContent = `${preset}%`;
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          scale = preset / 100;
          updateTransform();
          if (zoomMenu) {
            zoomMenu.remove();
            zoomMenu = null;
          }
        });
        zoomMenu!.appendChild(item);
      });

      // 定位菜单
      const rect = zoomLabel.getBoundingClientRect();
      zoomMenu.style.position = 'fixed';
      zoomMenu.style.left = `${rect.right + 4}px`;
      zoomMenu.style.top = `${rect.top}px`;

      document.body.appendChild(zoomMenu);

      // 点击其他地方关闭菜单
      const closeMenu = (ev: MouseEvent) => {
        if (zoomMenu && !zoomMenu.contains(ev.target as Node)) {
          zoomMenu.remove();
          zoomMenu = null;
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
    };

    zoomLabel.addEventListener('click', showZoomMenu);

    // 图表内容包装器（用于变换）- 提前声明
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'cm-mermaid-svg-wrapper';

    // 放大按钮
    const zoomInBtn = document.createElement('span');
    zoomInBtn.className = 'cm-mermaid-side-btn';
    zoomInBtn.title = '放大';
    zoomInBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (scale < maxScale) {
        scale = Math.min(scale + scaleStep, maxScale);
        updateTransform();
      }
    });

    // 缩小按钮
    const zoomOutBtn = document.createElement('span');
    zoomOutBtn.className = 'cm-mermaid-side-btn';
    zoomOutBtn.title = '缩小';
    zoomOutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (scale > minScale) {
        scale = Math.max(scale - scaleStep, minScale);
        updateTransform();
      }
    });

    // 素材库按钮
    const materialBtn = document.createElement('span');
    materialBtn.className = 'cm-mermaid-side-btn';
    materialBtn.title = '素材库';
    materialBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/></svg>`;
    materialBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 打开素材库面板
      console.log('打开素材库');
    });

    // 分隔线
    const divider = document.createElement('div');
    divider.className = 'cm-mermaid-side-divider';

    sideToolbar.appendChild(materialBtn);
    sideToolbar.appendChild(divider);
    sideToolbar.appendChild(dragBtn);
    sideToolbar.appendChild(zoomOutBtn);
    sideToolbar.appendChild(zoomLabel);
    sideToolbar.appendChild(zoomInBtn);

    // 图表容器
    const container = document.createElement('div');
    container.className = 'cm-mermaid-container';

    // 拖拽事件处理
    const handleMouseDown = (e: MouseEvent) => {
      if (!isDragMode) return;
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      container.classList.add('cm-mermaid-dragging');
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
    };

    const handleMouseUp = () => {
      isDragging = false;
      container.classList.remove('cm-mermaid-dragging');
    };

    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // 渲染 Mermaid 图表
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    mermaid.render(id, this.code).then(({ svg }) => {
      svgWrapper.innerHTML = svg;
    }).catch((error: Error) => {
      svgWrapper.innerHTML = `<div class="cm-mermaid-error">Mermaid 渲染错误: ${error.message}</div>`;
    });

    container.appendChild(svgWrapper);
    content.appendChild(sideToolbar);
    content.appendChild(container);
    wrapper.appendChild(content);

    // 底部拖动手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cm-mermaid-resize-handle';
    
    const resizeBar = document.createElement('div');
    resizeBar.className = 'cm-mermaid-resize-bar';
    resizeHandle.appendChild(resizeBar);

    // 高度调整状态
    let isResizing = false;
    let startResizeY = 0;
    let startHeight = 0;
    const minHeight = 100;
    const maxHeight = 800;

    const handleResizeStart = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startResizeY = e.clientY;
      startHeight = content.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      resizeHandle.classList.add('active');
    };

    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return;
      e.preventDefault();
      const deltaY = e.clientY - startResizeY;
      const newHeight = Math.min(Math.max(startHeight + deltaY, minHeight), maxHeight);
      content.style.height = `${newHeight}px`;
    };

    const handleResizeEnd = () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      resizeHandle.classList.remove('active');
    };

    resizeHandle.addEventListener('mousedown', handleResizeStart);
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    wrapper.appendChild(resizeHandle);

    // 阻止事件冒泡
    wrapper.addEventListener('mousedown', (e) => e.stopPropagation());

    this.domElement = wrapper;
    mermaidWidgetDomCache.set(this, wrapper);

    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }

  destroy(): void {
    this.domElement = null;
  }
}

/**
 * 解析文档中的 Mermaid 代码块
 */
function parseMermaidBlocks(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 匹配 ```mermaid ... ``` 代码块
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  let match;

  while ((match = mermaidRegex.exec(doc)) !== null) {
    const code = match[1].trim();
    const from = match.index;
    const to = from + match[0].length;

    if (code) {
      decorations.push({
        from,
        to,
        decoration: Decoration.replace({
          widget: new MermaidWidget(code, from, to),
        }),
      });
    }
  }

  decorations.sort((a, b) => a.from - b.from);
  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 获取 Mermaid 代码块签名
 */
function getMermaidSignature(doc: string): string {
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  const matches: string[] = [];
  let match;
  while ((match = mermaidRegex.exec(doc)) !== null) {
    matches.push(match[1].trim());
  }
  return matches.join('|||');
}

/**
 * Mermaid 装饰器 StateField
 */
const mermaidDecorations = StateField.define<{ decorations: DecorationSet; signature: string }>({
  create(state) {
    const doc = state.doc.toString();
    return {
      decorations: parseMermaidBlocks(doc),
      signature: getMermaidSignature(doc),
    };
  },
  update(value, tr) {
    if (!tr.docChanged) {
      return value;
    }

    const newDoc = tr.newDoc.toString();
    const newSignature = getMermaidSignature(newDoc);

    if (newSignature !== value.signature) {
      return {
        decorations: parseMermaidBlocks(newDoc),
        signature: newSignature,
      };
    }

    const mappedDecorations = value.decorations.map(tr.changes);
    if (mappedDecorations.size === 0 && newSignature !== '') {
      return {
        decorations: parseMermaidBlocks(newDoc),
        signature: newSignature,
      };
    }

    return {
      decorations: mappedDecorations,
      signature: value.signature,
    };
  },
  provide: f => EditorView.decorations.from(f, value => value.decorations),
});

// ============================================================================
// 视频渲染系统
// ============================================================================

// 视频 Widget DOM 缓存，使用 WeakMap 将 widget 实例与 DOM 元素关联
const videoWidgetDomCache = new WeakMap<VideoWidget, HTMLElement>();

/**
 * 视频 Widget 类 - 用于在编辑器中渲染视频播放器
 * 使用 Electron webview 标签绕过 CSP 限制
 */
class VideoWidget extends WidgetType {
  private displayMode: 'embed' | 'card' | 'link' = 'embed';
  private domElement: HTMLElement | null = null;

  constructor(
    readonly videoInfo: VideoInfo,
    readonly alt: string,
    readonly from: number,
    readonly to: number,
    readonly originalMatch: string
  ) {
    super();
    // 解析 alt 中的显示模式
    this.parseDisplayMode();
  }

  private parseDisplayMode(): void {
    // 格式: 标题|mode:card
    const parts = this.alt.split('|');
    for (const part of parts) {
      if (part.startsWith('mode:')) {
        const mode = part.slice(5);
        if (['embed', 'card', 'link'].includes(mode)) {
          this.displayMode = mode as 'embed' | 'card' | 'link';
        }
      }
    }
  }

  private getCleanTitle(): string {
    // 移除模式信息，只保留标题
    const parts = this.alt.split('|');
    const cleanParts = parts.filter(part => !part.startsWith('mode:'));
    return cleanParts.join('|') || '视频';
  }

  toDOM(): HTMLElement {
    // 如果已有 DOM 元素，直接返回（避免重复创建）
    if (this.domElement) {
      // 更新标题（可能已更改）
      const titleEl = this.domElement.querySelector('.cm-video-title');
      if (titleEl) {
        titleEl.textContent = this.getCleanTitle();
      }
      return this.domElement;
    }

    // 检查 WeakMap 缓存
    const cached = videoWidgetDomCache.get(this);
    if (cached) {
      this.domElement = cached;
      return cached;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `cm-video-widget cm-video-mode-${this.displayMode}`;

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-video-toolbar';

    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-video-toolbar-left';

    const platformBadge = document.createElement('span');
    platformBadge.className = 'cm-video-platform-badge';
    platformBadge.textContent = this.getPlatformName();

    // 标题显示元素
    const title = document.createElement('span');
    title.className = 'cm-video-title';
    title.textContent = this.getCleanTitle();

    // 标题编辑输入框（默认隐藏）
    const titleInput = document.createElement('input');
    titleInput.className = 'cm-video-title-input';
    titleInput.type = 'text';
    titleInput.value = this.getCleanTitle();
    titleInput.style.display = 'none';

    // 阻止输入框事件冒泡
    titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
    titleInput.addEventListener('mouseup', (e) => e.stopPropagation());
    titleInput.addEventListener('click', (e) => e.stopPropagation());
    titleInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        // 保存标题
        const newTitle = titleInput.value.trim() || '视频';
        title.textContent = newTitle;
        titleInput.style.display = 'none';
        title.style.display = '';
        // 触发标题更新事件
        const event = new CustomEvent('video-title-change', {
          detail: {
            from: this.from,
            to: this.to,
            title: newTitle,
            url: this.videoInfo.originalUrl,
            mode: this.displayMode,
          },
        });
        window.dispatchEvent(event);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // 取消编辑
        titleInput.value = this.getCleanTitle();
        titleInput.style.display = 'none';
        title.style.display = '';
      }
    });
    titleInput.addEventListener('keyup', (e) => e.stopPropagation());
    titleInput.addEventListener('keypress', (e) => e.stopPropagation());
    titleInput.addEventListener('blur', () => {
      // 失焦时保存
      const newTitle = titleInput.value.trim() || '视频';
      title.textContent = newTitle;
      titleInput.style.display = 'none';
      title.style.display = '';
      // 触发标题更新事件
      const event = new CustomEvent('video-title-change', {
        detail: {
          from: this.from,
          to: this.to,
          title: newTitle,
          url: this.videoInfo.originalUrl,
          mode: this.displayMode,
        },
      });
      window.dispatchEvent(event);
    });

    toolbarLeft.appendChild(platformBadge);
    toolbarLeft.appendChild(title);
    toolbarLeft.appendChild(titleInput);

    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-video-toolbar-right';

    // 编辑按钮
    const editBtn = document.createElement('span');
    editBtn.className = 'cm-video-toolbar-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = `<svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor"><path d="M2 26h28v2H2z"></path><path d="M25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 切换到编辑模式
      title.style.display = 'none';
      titleInput.style.display = '';
      titleInput.value = title.textContent || '视频';
      titleInput.focus();
      titleInput.select();
    });

    // 卡片模式按钮
    const cardBtn = document.createElement('span');
    cardBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'card' ? 'active' : ''}`;
    cardBtn.title = '卡片';
    cardBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h18"/><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 22h18"/></svg>`;
    cardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('card');
    });

    // 链接模式按钮
    const linkBtn = document.createElement('span');
    linkBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'link' ? 'active' : ''}`;
    linkBtn.title = '链接';
    linkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`;
    linkBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('link');
    });

    // 视频嵌入模式按钮
    const embedBtn = document.createElement('span');
    embedBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'embed' ? 'active' : ''}`;
    embedBtn.title = '视频';
    embedBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.25 13a.75.75 0 0 1 .743.648l.007.102v5a3.25 3.25 0 0 1-3.066 3.245L18.75 22h-4.668c.536-.385.973-.9 1.265-1.499l3.403-.001a1.75 1.75 0 0 0 1.744-1.607l.006-.143v-5a.75.75 0 0 1 .75-.75zm-9.5-4A3.25 3.25 0 0 1 15 12.25v6.5A3.25 3.25 0 0 1 11.75 22h-6.5A3.25 3.25 0 0 1 2 18.75v-6.5A3.25 3.25 0 0 1 5.25 9h6.5zm0 1.5h-6.5a1.75 1.75 0 0 0-1.75 1.75v6.5c0 .966.783 1.75 1.75 1.75h6.5a1.75 1.75 0 0 0 1.75-1.75v-6.5a1.75 1.75 0 0 0-1.75-1.75zM6.06 13.103a.5.5 0 0 1 .596-.236l.082.036l3.956 2.158a.5.5 0 0 1 .075.828l-.075.05l-3.956 2.158a.5.5 0 0 1-.731-.35L6 17.658v-4.315a.5.5 0 0 1 .061-.24zM18.75 2a3.25 3.25 0 0 1 3.245 3.066L22 5.25v5a.75.75 0 0 1-1.493.102l-.007-.102v-5a1.75 1.75 0 0 0-1.607-1.744L18.75 3.5h-5a.75.75 0 0 1-.102-1.493L13.75 2h5zm-8.5 0a.75.75 0 0 1 .102 1.493l-.102.007h-5a1.75 1.75 0 0 0-1.744 1.606L3.5 5.25v3.402c-.6.292-1.115.73-1.5 1.266V5.25a3.25 3.25 0 0 1 3.065-3.245L5.25 2h5z"/></svg>`;
    embedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('embed');
    });

    // 在浏览器中打开按钮
    const openBtn = document.createElement('span');
    openBtn.className = 'cm-video-toolbar-btn';
    openBtn.title = '在浏览器中打开';
    openBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(this.videoInfo.originalUrl, '_blank');
    });

    // 更多菜单按钮
    const moreBtn = document.createElement('span');
    moreBtn.className = 'cm-video-toolbar-btn';
    moreBtn.title = '更多';
    moreBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 显示更多菜单
      this.showMoreMenu(moreBtn, wrapper);
    });

    toolbarRight.appendChild(editBtn);
    toolbarRight.appendChild(cardBtn);
    toolbarRight.appendChild(linkBtn);
    toolbarRight.appendChild(embedBtn);
    toolbarRight.appendChild(openBtn);
    toolbarRight.appendChild(moreBtn);
    toolbar.appendChild(toolbarLeft);
    toolbar.appendChild(toolbarRight);

    wrapper.appendChild(toolbar);

    // 根据显示模式渲染内容
    if (this.displayMode === 'embed') {
      // 本地视频使用 HTML5 video 标签
      if (this.videoInfo.platform === 'local') {
        const localContainer = document.createElement('div');
        localContainer.className = 'cm-video-local-player';

        const video = document.createElement('video');
        video.className = 'cm-video-local-video';
        
        // 将本地文件路径转换为 local-file:// 协议
        let videoSrc = this.videoInfo.originalUrl;
        console.log('[VideoWidget] 本地视频原始路径:', videoSrc);
        if (videoSrc.startsWith('file:///')) {
          // file:/// 转换为 local-file:///
          videoSrc = videoSrc.replace('file:///', 'local-file:///');
        } else if (videoSrc.startsWith('file://')) {
          // file:// 转换为 local-file://
          videoSrc = videoSrc.replace('file://', 'local-file://');
        } else if (!videoSrc.startsWith('local-file://')) {
          // Windows 路径转换: C:\path\to\video.mp4 -> local-file:///C:/path/to/video.mp4
          // 需要对路径进行 URL 编码（但保留斜杠和冒号）
          const normalizedPath = videoSrc.replace(/\\/g, '/');
          const parts = normalizedPath.split('/');
          const encodedParts = parts.map((part, index) => {
            // 第一部分是盘符（如 C:），不编码
            if (index === 0 && /^[A-Za-z]:$/.test(part)) {
              return part;
            }
            return encodeURIComponent(part);
          });
          videoSrc = 'local-file:///' + encodedParts.join('/');
        }
        console.log('[VideoWidget] 本地视频转换后路径:', videoSrc);
        video.src = videoSrc;
        video.controls = true;
        video.preload = 'metadata';

        // 添加错误处理
        video.addEventListener('error', (e) => {
          console.error('[VideoWidget] 视频加载错误:', e, video.error);
        });

        // 阻止事件冒泡
        video.addEventListener('mousedown', (e) => e.stopPropagation());
        video.addEventListener('click', (e) => e.stopPropagation());

        localContainer.appendChild(video);
        wrapper.appendChild(localContainer);
      } else {
        // 增强型内嵌浏览器
        const browserContainer = document.createElement('div');
        browserContainer.className = 'cm-video-browser';

      // 浏览器导航栏
      const browserNav = document.createElement('div');
      browserNav.className = 'cm-video-browser-nav';

      // 后退按钮
      const backBtn = document.createElement('span');
      backBtn.className = 'cm-video-browser-btn';
      backBtn.title = '后退';
      backBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.928 7.976l4.357 4.357-.618.62L5 8.284v-.618L9.667 3l.618.619-4.357 4.357z"/></svg>`;

      // 前进按钮
      const forwardBtn = document.createElement('span');
      forwardBtn.className = 'cm-video-browser-btn';
      forwardBtn.title = '前进';
      forwardBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/></svg>`;

      // 刷新按钮
      const refreshBtn = document.createElement('span');
      refreshBtn.className = 'cm-video-browser-btn';
      refreshBtn.title = '刷新';
      refreshBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.56253 2.51577C6.22874 2.18616 6.96524 2 7.74856 2C9.08973 2 10.347 2.54555 11.2554 3.45393C11.6244 3.82283 11.9297 4.25217 12.1575 4.72382L12.1575 3L13.1575 3V6.74856L9.40897 6.74856V5.74856H11.3161C11.1284 5.27466 10.8435 4.84603 10.4839 4.48638C9.78661 3.78908 8.81981 3.35862 7.74856 3.35862C7.14565 3.35862 6.58195 3.50551 6.08841 3.76641L5.56253 2.51577ZM4.34253 10.2516C4.13064 9.77756 4.01561 9.25774 4.01561 8.71143C4.01561 7.64018 4.44607 6.67338 5.14337 5.97609L6.20399 7.03671C5.71713 7.52357 5.42142 8.18538 5.42142 8.91703C5.42142 9.35023 5.51636 9.76027 5.68652 10.1272L4.34253 10.2516ZM8.03663 12.7916C8.6395 12.632 9.19129 12.3302 9.65221 11.9204L10.7128 12.981C10.0466 13.5904 9.23861 14.0316 8.35253 14.2405L8.03663 12.7916ZM4.15743 6L6.84257 6L6.84257 7L4.93542 7C5.123 7.47391 5.40791 7.90253 5.76756 8.26218C6.46485 8.95948 7.43165 9.38994 8.5029 9.38994C9.10581 9.38994 9.66951 9.24305 10.1631 8.98215L10.6889 10.2328C10.0227 10.5624 9.28622 10.7486 8.5029 10.7486C7.16173 10.7486 5.90447 10.203 4.99609 9.29467C4.62719 8.92577 4.32189 8.49643 4.09412 8.02478L4.09411 9.74856L3.09411 9.74856L3.09412 6L4.15743 6Z"/></svg>`;

      // 地址栏
      const addressBar = document.createElement('input');
      addressBar.className = 'cm-video-browser-address';
      addressBar.type = 'text';
      addressBar.value = this.videoInfo.originalUrl;
      addressBar.spellcheck = false;

      // 阻止地址栏鼠标事件冒泡，防止触发编辑器选择
      addressBar.addEventListener('mousedown', (e) => e.stopPropagation());
      addressBar.addEventListener('mouseup', (e) => e.stopPropagation());
      addressBar.addEventListener('click', (e) => e.stopPropagation());
      addressBar.addEventListener('dblclick', (e) => e.stopPropagation());

      // 阻止键盘事件冒泡，防止 CodeMirror 拦截快捷键
      addressBar.addEventListener('keydown', (e) => {
        e.stopPropagation();
        // 回车跳转
        if (e.key === 'Enter') {
          e.preventDefault();
          let url = addressBar.value.trim();
          if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          if (url) {
            const wv = webview as HTMLElement & { loadURL: (url: string) => void };
            if (wv.loadURL) {
              wv.loadURL(url);
            }
          }
        }
      });
      addressBar.addEventListener('keyup', (e) => e.stopPropagation());
      addressBar.addEventListener('keypress', (e) => e.stopPropagation());

      // 在外部浏览器打开
      const externalBtn = document.createElement('span');
      externalBtn.className = 'cm-video-browser-btn';
      externalBtn.title = '在浏览器中打开';
      externalBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

      browserNav.appendChild(backBtn);
      browserNav.appendChild(forwardBtn);
      browserNav.appendChild(refreshBtn);
      browserNav.appendChild(addressBar);
      browserNav.appendChild(externalBtn);

      // 加载进度条
      const progressBar = document.createElement('div');
      progressBar.className = 'cm-video-browser-progress';
      const progressInner = document.createElement('div');
      progressInner.className = 'cm-video-browser-progress-inner';
      progressBar.appendChild(progressInner);

      // Webview 容器
      const webviewContainer = document.createElement('div');
      webviewContainer.className = 'cm-video-browser-content';

      const webview = document.createElement('webview');
      webview.className = 'cm-video-webview';
      webview.setAttribute('src', this.videoInfo.originalUrl);
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('partition', 'persist:video');

      // 绑定导航事件
      webview.addEventListener('did-start-loading', () => {
        progressBar.classList.add('loading');
      });

      webview.addEventListener('did-stop-loading', () => {
        progressBar.classList.remove('loading');
      });

      webview.addEventListener('did-navigate', (e: Event) => {
        const navEvent = e as CustomEvent & { url: string };
        if (navEvent.url) {
          addressBar.value = navEvent.url;
        }
      });

      webview.addEventListener('did-navigate-in-page', (e: Event) => {
        const navEvent = e as CustomEvent & { url: string };
        if (navEvent.url) {
          addressBar.value = navEvent.url;
        }
      });

      // 绑定按钮事件
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wv = webview as HTMLElement & {
          canGoBack: () => boolean;
          goBack: () => void;
        };
        if (wv.canGoBack && wv.canGoBack()) {
          wv.goBack();
        }
      });

      forwardBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wv = webview as HTMLElement & {
          canGoForward: () => boolean;
          goForward: () => void;
        };
        if (wv.canGoForward && wv.canGoForward()) {
          wv.goForward();
        }
      });

      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wv = webview as HTMLElement & { reload: () => void };
        if (wv.reload) {
          wv.reload();
        }
      });

      externalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(addressBar.value || this.videoInfo.originalUrl, '_blank');
      });

      webviewContainer.appendChild(webview);
      browserContainer.appendChild(browserNav);
      browserContainer.appendChild(progressBar);
      browserContainer.appendChild(webviewContainer);
      wrapper.appendChild(browserContainer);
      }
    } else if (this.displayMode === 'card') {
      // 卡片模式 - 显示缩略图和信息
      const cardContainer = document.createElement('div');
      cardContainer.className = 'cm-video-card';
      cardContainer.addEventListener('click', () => {
        window.open(this.videoInfo.originalUrl, '_blank');
      });

      const cardThumb = document.createElement('div');
      cardThumb.className = 'cm-video-card-thumb';
      cardThumb.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

      const cardInfo = document.createElement('div');
      cardInfo.className = 'cm-video-card-info';

      const cardTitle = document.createElement('div');
      cardTitle.className = 'cm-video-card-title';
      cardTitle.textContent = this.getCleanTitle();

      const cardLink = document.createElement('div');
      cardLink.className = 'cm-video-card-link';
      cardLink.textContent = this.videoInfo.originalUrl;

      cardInfo.appendChild(cardTitle);
      cardInfo.appendChild(cardLink);
      cardContainer.appendChild(cardThumb);
      cardContainer.appendChild(cardInfo);
      wrapper.appendChild(cardContainer);
    }
    // link 模式不显示额外内容，只显示工具栏

    // 存入缓存
    this.domElement = wrapper;
    videoWidgetDomCache.set(this, wrapper);

    return wrapper;
  }

  private showMoreMenu(anchorEl: HTMLElement, wrapperEl: HTMLElement): void {
    // 移除已存在的菜单
    const existingMenu = document.querySelector('.cm-video-more-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'cm-video-more-menu';

    const menuItems = [
      { label: '本地视频', action: 'local-video' },
      { label: '在浏览器中打开', action: 'open-external' },
      { label: '拷贝原始链接', action: 'copy-url' },
      { label: '拷贝区块链接', action: 'copy-block' },
      { label: '移动到...', action: 'move-to' },
      { label: '删除', action: 'delete', danger: true },
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = `cm-video-more-menu-item${item.danger ? ' danger' : ''}`;
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.remove();
        this.handleMenuAction(item.action);
      });
      menu.appendChild(menuItem);
    });

    // 先添加到 DOM 以获取菜单高度
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);

    // 定位菜单
    const rect = anchorEl.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const viewportHeight = window.innerHeight;

    // 检查是否会超出底部
    let top = rect.bottom + 4;
    if (top + menuHeight > viewportHeight - 10) {
      // 向上显示
      top = rect.top - menuHeight - 4;
    }

    // 检查左侧位置
    let left = rect.right - 140;
    if (left < 10) {
      left = 10;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';

    // 点击外部关闭菜单
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', closeMenu);
    }, 0);
  }

  private handleMenuAction(action: string): void {
    switch (action) {
      case 'local-video':
        // 触发本地视频选择事件
        window.dispatchEvent(new CustomEvent('video-select-local', {
          detail: { from: this.from, to: this.to, title: this.getCleanTitle() },
        }));
        break;
      case 'open-external':
        window.open(this.videoInfo.originalUrl, '_blank');
        break;
      case 'copy-url':
        navigator.clipboard.writeText(this.videoInfo.originalUrl);
        break;
      case 'copy-block':
        navigator.clipboard.writeText(this.originalMatch);
        break;
      case 'move-to':
        // 触发移动事件
        window.dispatchEvent(new CustomEvent('video-move-to', {
          detail: { from: this.from, to: this.to, content: this.originalMatch },
        }));
        break;
      case 'delete':
        // 触发删除事件
        window.dispatchEvent(new CustomEvent('video-delete', {
          detail: { from: this.from, to: this.to },
        }));
        break;
    }
  }

  private changeDisplayMode(mode: 'embed' | 'card' | 'link'): void {
    // 通过自定义事件通知编辑器更新文档
    const event = new CustomEvent('video-display-mode-change', {
      detail: {
        from: this.from,
        to: this.to,
        mode: mode,
        title: this.getCleanTitle(),
        url: this.videoInfo.originalUrl,
      },
    });
    window.dispatchEvent(event);
  }

  private getPlatformName(): string {
    switch (this.videoInfo.platform) {
      case 'bilibili': return 'B站';
      case 'youtube': return 'YouTube';
      case 'youku': return '优酷';
      case 'qq': return '腾讯';
      case 'iqiyi': return '爱奇艺';
      case 'xigua': return '西瓜';
      case 'douyin': return '抖音';
      case 'local': return '本地';
      case 'other': return '网页';
      default: return '视频';
    }
  }

  eq(other: VideoWidget): boolean {
    // 只比较视频内容，不比较位置，避免文档变化时重建 widget
    return (
      other.videoInfo.originalUrl === this.videoInfo.originalUrl &&
      other.displayMode === this.displayMode
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 解析文档中的视频语法并创建装饰器
 * 视频语法: ![视频](视频链接)
 * 只有当链接是支持的视频平台时才渲染为视频播放器
 */
function parseVideos(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 匹配 Markdown 图片语法，支持 http/https 链接和本地文件路径
  // 本地路径格式: C:\path\to\file.mp4 或 file:///path/to/file.mp4
  const videoRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = videoRegex.exec(doc)) !== null) {
    const alt = match[1];
    const url = match[2];
    const from = match.index;
    const to = from + match[0].length;

    // 尝试解析为视频链接
    const videoInfo = parseVideoUrl(url);
    if (videoInfo) {
      decorations.push({
        from,
        to,
        decoration: Decoration.replace({
          widget: new VideoWidget(videoInfo, alt, from, to, match[0]),
        }),
      });
    }
  }

  // 按位置排序
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 提取文档中所有视频链接的签名（用于比较是否需要重新解析）
 */
function getVideoSignature(doc: string): string {
  const videoRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const matches: string[] = [];
  let match;
  while ((match = videoRegex.exec(doc)) !== null) {
    const url = match[2];
    const videoInfo = parseVideoUrl(url);
    if (videoInfo) {
      matches.push(`${match[1]}|${url}`);
    }
  }
  return matches.join('|||');
}

/**
 * 视频装饰器 StateField
 * 优化：只在视频内容变化时才重新解析，避免频繁重建 webview
 */
const videoDecorations = StateField.define<{ decorations: DecorationSet; signature: string }>({
  create(state) {
    const doc = state.doc.toString();
    return {
      decorations: parseVideos(doc),
      signature: getVideoSignature(doc),
    };
  },
  update(value, tr) {
    // 如果文档没有变化，直接返回原值
    if (!tr.docChanged) {
      return value;
    }

    const newDoc = tr.newDoc.toString();
    const newSignature = getVideoSignature(newDoc);

    // 只有视频内容变化时才重新解析
    if (newSignature !== value.signature) {
      return {
        decorations: parseVideos(newDoc),
        signature: newSignature,
      };
    }

    // 视频内容未变化，尝试映射位置
    // 如果映射失败（装饰器数量为0但签名不为空），重新解析
    const mappedDecorations = value.decorations.map(tr.changes);
    if (mappedDecorations.size === 0 && newSignature !== '') {
      return {
        decorations: parseVideos(newDoc),
        signature: newSignature,
      };
    }

    return {
      decorations: mappedDecorations,
      signature: value.signature,
    };
  },
  provide: f => EditorView.decorations.from(f, value => value.decorations),
});

// ============================================================================
// Markdown 表格渲染系统
// ============================================================================

/**
 * 表格数据结构
 */
interface TableData {
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  from: number;
  to: number;
}

/**
 * 解析 Markdown 表格
 */
function parseMarkdownTable(doc: string): TableData[] {
  const tables: TableData[] = [];
  const lines = doc.split('\n');
  let position = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = position;

    // 检测表格头部行（包含 | 的行）
    if (line.includes('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      
      // 检测分隔行（包含 --- 和 |）
      if (/^\|?\s*:?-+:?\s*\|/.test(nextLine) || /\|\s*:?-+:?\s*\|?$/.test(nextLine)) {
        // 解析表头
        const headers = parseTableRow(line);
        
        if (headers.length > 0) {
          // 解析对齐方式
          const alignments = parseAlignments(nextLine, headers.length);
          
          // 解析数据行
          const rows: string[][] = [];
          let j = i + 2;
          // 计算表格结束位置（包含表头行和分隔行及其换行符）
          let lastLineEnd = lineStart + line.length + 1 + nextLine.length;
          
          while (j < lines.length) {
            const dataLine = lines[j];
            
            // 检测是否是新表格的开始（下一行是分隔行）
            if (j + 1 < lines.length) {
              const potentialSeparator = lines[j + 1];
              if (/^\|?\s*:?-+:?\s*\|/.test(potentialSeparator) || /\|\s*:?-+:?\s*\|?$/.test(potentialSeparator)) {
                // 这是新表格的表头，结束当前表格
                break;
              }
            }
            
            // 检测是否还是表格行（必须包含 | 且不是空行）
            if (!dataLine.includes('|') || dataLine.trim() === '') {
              break;
            }
            const rowData = parseTableRow(dataLine);
            // 如果解析出的数据为空，跳过（但允许所有单元格为空字符串的行）
            if (rowData.length === 0) {
              break;
            }
            // 确保行数据与表头列数一致
            while (rowData.length < headers.length) {
              rowData.push('');
            }
            rows.push(rowData.slice(0, headers.length));
            // 更新最后一行的结束位置（加上前一行的换行符和当前行的长度）
            lastLineEnd += 1 + dataLine.length;
            j++;
          }
          
          // 添加表格（允许没有数据行的表格）
          tables.push({
            headers,
            alignments,
            rows,
            from: lineStart,
            to: lastLineEnd,
          });
          
          // 跳过已处理的行
          position = lastLineEnd + (j < lines.length ? 1 : 0);
          i = j;
          continue;
        }
      }
    }

    position += line.length + 1;
    i++;
  }

  return tables;
}

/**
 * 解析表格行
 */
function parseTableRow(line: string): string[] {
  // 移除首尾的 |
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }
  
  // 按 | 分割并清理空格
  return trimmed.split('|').map(cell => cell.trim());
}

/**
 * 解析对齐方式
 */
function parseAlignments(line: string, columnCount: number): ('left' | 'center' | 'right')[] {
  const alignments: ('left' | 'center' | 'right')[] = [];
  const cells = parseTableRow(line);
  
  for (let i = 0; i < columnCount; i++) {
    const cell = cells[i] || '---';
    const trimmed = cell.trim();
    
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
      alignments.push('center');
    } else if (trimmed.endsWith(':')) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }
  
  return alignments;
}

/**
 * 表格 Widget 类 - 用于在编辑器中渲染可视化表格
 */
class TableWidget extends WidgetType {
  constructor(
    readonly tableData: TableData
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-widget';
    
    // 创建工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-table-toolbar';
    
    // 左侧：数据库名称和添加按钮
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-table-toolbar-left';
    
    const tableName = document.createElement('span');
    tableName.className = 'cm-table-name';
    tableName.textContent = '数据表';
    toolbarLeft.appendChild(tableName);
    
    const addBtn = document.createElement('span');
    addBtn.className = 'cm-table-toolbar-btn';
    addBtn.title = '添加新表格';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 在当前表格后插入新表格模板
      const newTableTemplate = '\n\n| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n';
      view.dispatch({
        changes: { from: this.tableData.to, insert: newTableTemplate },
      });
    });
    toolbarLeft.appendChild(addBtn);
    
    toolbar.appendChild(toolbarLeft);
    
    // 右侧：筛选、排序、窗口显示、删除
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-table-toolbar-right';
    
    const filterBtn = document.createElement('span');
    filterBtn.className = 'cm-table-toolbar-btn';
    filterBtn.title = '筛选';
    filterBtn.textContent = '筛选';
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现筛选功能
    });
    toolbarRight.appendChild(filterBtn);
    
    const sortBtn = document.createElement('span');
    sortBtn.className = 'cm-table-toolbar-btn';
    sortBtn.title = '排序';
    sortBtn.textContent = '排序';
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现排序功能
    });
    toolbarRight.appendChild(sortBtn);
    
    const expandBtn = document.createElement('span');
    expandBtn.className = 'cm-table-toolbar-btn';
    expandBtn.title = '窗口显示';
    expandBtn.textContent = '窗口';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 实现窗口显示功能
    });
    toolbarRight.appendChild(expandBtn);
    
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-table-toolbar-btn cm-table-toolbar-btn-danger';
    deleteBtn.title = '删除表格';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 删除表格（包括前后可能的空行）
      let deleteFrom = this.tableData.from;
      let deleteTo = this.tableData.to;
      
      // 检查表格后是否有换行符，一并删除
      const docLength = view.state.doc.length;
      if (deleteTo < docLength) {
        const afterChar = view.state.doc.sliceString(deleteTo, deleteTo + 1);
        if (afterChar === '\n') {
          deleteTo += 1;
        }
      }
      
      view.dispatch({
        changes: { from: deleteFrom, to: deleteTo, insert: '' },
      });
    });
    toolbarRight.appendChild(deleteBtn);
    
    toolbar.appendChild(toolbarRight);
    wrapper.appendChild(toolbar);
    
    // 创建滚动容器
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'cm-table-scroll-container';
    
    const table = document.createElement('table');
    table.className = 'cm-markdown-table';
    
    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    this.tableData.headers.forEach((header, index) => {
      const th = document.createElement('th');
      th.textContent = header;
      th.style.textAlign = this.tableData.alignments[index] || 'left';
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // 创建表体
    const tbody = document.createElement('tbody');
    
    console.log('[TableWidget] 渲染数据行:', this.tableData.rows);
    
    this.tableData.rows.forEach((row) => {
      const tr = document.createElement('tr');
      
      row.forEach((cell, index) => {
        const td = document.createElement('td');
        td.textContent = cell;
        td.style.textAlign = this.tableData.alignments[index] || 'left';
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    scrollContainer.appendChild(table);
    wrapper.appendChild(scrollContainer);
    
    // 点击表格时跳转到源码位置
    wrapper.addEventListener('click', () => {
      view.dispatch({
        selection: { anchor: this.tableData.from },
        scrollIntoView: true,
      });
    });
    
    return wrapper;
  }

  eq(other: TableWidget): boolean {
    return (
      other.tableData.from === this.tableData.from &&
      other.tableData.to === this.tableData.to &&
      JSON.stringify(other.tableData.headers) === JSON.stringify(this.tableData.headers) &&
      JSON.stringify(other.tableData.rows) === JSON.stringify(this.tableData.rows)
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 解析文档中的表格并创建装饰器
 */
function parseTableDecorations(doc: string): DecorationSet {
  const tables = parseMarkdownTable(doc);
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];

  console.log('[parseTableDecorations] 解析到的表格:', tables.map(t => ({
    headers: t.headers,
    rows: t.rows,
    from: t.from,
    to: t.to
  })));

  for (const table of tables) {
    decorations.push({
      from: table.from,
      to: table.to,
      decoration: Decoration.replace({
        widget: new TableWidget(table),
        block: true,
      }),
    });
  }

  // 按位置排序
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 表格装饰器 StateField
 */
const tableDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseTableDecorations(state.doc.toString());
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return parseTableDecorations(tr.newDoc.toString());
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 解析文档中的标题并创建行装饰器
 */
function parseHeadings(state: EditorState): DecorationSet {
  const decorations: { from: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const match = line.text.match(/^(#{1,6})\s/);
    if (match) {
      const level = match[1].length;
      decorations.push({
        from: line.from,
        decoration: Decoration.line({
          class: `cm-heading-line cm-heading-${level}`,
        }),
      });
    }
  }
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from)),
    true
  );
}

/**
 * 标题装饰器 StateField - 为标题行添加不同的字体大小
 */
const headingDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseHeadings(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return parseHeadings(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 无序列表圆点 Widget - 将 - * + 替换为圆点图标
 */
class BulletWidget extends WidgetType {
  constructor(readonly indent: number) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-bullet-marker';
    span.textContent = '•';
    return span;
  }

  eq(other: BulletWidget): boolean {
    return other.indent === this.indent;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 解析无序列表并创建装饰器
 * 将 - * + 替换为圆点图标
 */
function parseUnorderedList(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 获取当前光标所在行
  const cursorLine = state.selection.main.head;
  const currentLineNumber = doc.lineAt(cursorLine).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // 匹配无序列表标记：- * + （前面可以有缩进空格）
    const match = line.text.match(/^(\s*)([-*+])\s/);
    if (match) {
      // 跳过待办清单（- [ ] 或 - [x]）- 在检查光标位置之前先检查
      // 匹配格式：可选缩进 + 列表标记 + 空格 + [ ] 或 [x]（后面可以有空格或到行尾）
      const isTodo = /^[\t ]*[-*+]\s\[[ xX]\](\s|$)/.test(line.text);
      if (isTodo) {
        continue;
      }
      
      // 如果光标在当前行，不替换标记
      if (i === currentLineNumber) {
        continue;
      }
      
      const indent = match[1].length;
      const markerStart = line.from + indent;
      const markerEnd = markerStart + 1; // 只替换 - * + 符号
      
      // 隐藏原始标记
      decorations.push({
        from: markerStart,
        to: markerEnd,
        decoration: Decoration.replace({
          widget: new BulletWidget(indent),
        }),
      });
    }
  }
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * 解析粗体文本并创建装饰器
 * 匹配 **text** 或 __text__ 格式
 */
function parseBoldText(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 获取当前光标所在行
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 匹配 **text** 或 __text__
    const boldRegex = /(\*\*|__)([^*_]+)\1/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const markerLength = match[1].length; // ** 或 __
      const contentFrom = from + markerLength;
      const contentTo = to - markerLength;

      // 如果光标在当前行，显示原始语法
      if (i === cursorLine) {
        // 只为内容添加粗体样式，不隐藏标记
        decorations.push(
          Decoration.mark({ class: 'cm-strong' }).range(contentFrom, contentTo)
        );
      } else {
        // 隐藏前后的 ** 或 __
        decorations.push(
          Decoration.mark({ class: 'cm-hidden-syntax' }).range(from, contentFrom)
        );
        decorations.push(
          Decoration.mark({ class: 'cm-strong' }).range(contentFrom, contentTo)
        );
        decorations.push(
          Decoration.mark({ class: 'cm-hidden-syntax' }).range(contentTo, to)
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * 粗体装饰器 StateField
 */
const boldDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseBoldText(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return parseBoldText(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 解析斜体文本并创建装饰器
 * 匹配 *text* 或 _text_ 格式（但不匹配 ** 或 __）
 */
function parseItalicText(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 获取当前光标所在行
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 匹配 *text* 或 _text_（但不匹配 ** 或 __）
    // 使用负向前瞻和负向后瞻确保不匹配粗体
    const italicRegex = /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)|(?<!_)_(?!_)([^_]+)_(?!_)/g;
    let match;

    while ((match = italicRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const content = match[1] || match[2];
      const contentFrom = from + 1;
      const contentTo = to - 1;

      // 如果光标在当前行，显示原始语法
      if (i === cursorLine) {
        decorations.push(
          Decoration.mark({ class: 'cm-em' }).range(contentFrom, contentTo)
        );
      } else {
        // 隐藏前后的 * 或 _
        decorations.push(
          Decoration.mark({ class: 'cm-hidden-syntax' }).range(from, contentFrom)
        );
        decorations.push(
          Decoration.mark({ class: 'cm-em' }).range(contentFrom, contentTo)
        );
        decorations.push(
          Decoration.mark({ class: 'cm-hidden-syntax' }).range(contentTo, to)
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * 斜体装饰器 StateField
 */
const italicDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseItalicText(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return parseItalicText(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 无序列表装饰器 StateField - 将 - * + 替换为圆点
 */
const unorderedListDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseUnorderedList(state);
  },
  update(decorations, tr) {
    // 文档变化或光标位置变化时都需要更新
    if (tr.docChanged || tr.selection) {
      return parseUnorderedList(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 待办清单复选框 Widget - 将 [ ] 或 [x] 替换为可点击的复选框
 */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly length: number,
    readonly view: EditorView
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const checkbox = document.createElement('span');
    checkbox.className = `cm-checkbox ${this.checked ? 'cm-checkbox-checked' : ''}`;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('aria-checked', this.checked ? 'true' : 'false');
    
    // 点击切换状态
    checkbox.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 替换时保留后面的空格
      const newText = this.checked ? '[ ] ' : '[x] ';
      // 保存当前选择位置
      const currentSelection = this.view.state.selection;
      this.view.dispatch({
        changes: { from: this.pos, to: this.pos + this.length, insert: newText },
        // 恢复原来的选择位置
        selection: currentSelection
      });
    });
    
    return checkbox;
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos && this.length === other.length;
  }

  ignoreEvent(event: Event): boolean {
    // 只处理 mousedown 事件，忽略其他事件
    return event.type !== 'mousedown';
  }
}

/**
 * 解析待办清单并创建复选框装饰器
 * 匹配格式：- [ ] 或 - [x] 或 • [ ] 或 • [x] 或 1. [ ] 或 1. [x]（后面可以有空格或到行尾）
 */
function parseTodoList(state: EditorState, view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;
  
  // 获取当前光标位置
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos);
  const cursorLineNumber = cursorLine.number;
  const cursorOffset = cursorPos - cursorLine.from; // 光标在行内的偏移

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    
    // 匹配待办清单：
    // 1. 无序列表格式：- [ ] 或 - [x] 或 • [ ] 或 • [x]
    // 2. 有序列表格式：1. [ ] 或 1. [x]
    const unorderedMatch = text.match(/^([\t ]*)([-*+•])\s\[([ xX])\](\s|$)/);
    const orderedMatch = text.match(/^([\t ]*)(\d+\.)\s\[([ xX])\](\s|$)/);
    
    const todoMatch = unorderedMatch || orderedMatch;
    if (!todoMatch) continue;
    
    const isOrderedList = !!orderedMatch;
    const indent = todoMatch[1].length;
    const marker = todoMatch[2];
    const isChecked = todoMatch[3].toLowerCase() === 'x';
    
    // 找到 [ 的位置
    const bracketIndex = text.indexOf('[');
    if (bracketIndex === -1) continue;
    
    // 计算 ] 后面空格的位置（在行内的偏移）
    const checkboxEndOffset = bracketIndex + 4; // [ ] 加空格共4个字符
    
    // 如果光标在当前行，且光标位置在复选框区域内或紧邻复选框后面，不显示复选框
    if (i === cursorLineNumber && cursorOffset <= checkboxEndOffset) {
      // 如果是无序列表且标记是 •，替换为 - 显示
      if (!isOrderedList && marker === '•') {
        const markerStart = line.from + indent;
        const markerEnd = markerStart + 1;
        decorations.push(
          Decoration.replace({
            widget: new class extends WidgetType {
              toDOM(): HTMLElement {
                const span = document.createElement('span');
                span.textContent = '-';
                return span;
              }
            }(),
          }).range(markerStart, markerEnd)
        );
      }
      
      // 如果已完成，仍然添加删除线样式
      if (isChecked) {
        const contentStart = line.from + bracketIndex + 4; // [ ] 后面的内容开始位置
        if (contentStart < line.to) {
          decorations.push(
            Decoration.mark({ class: 'cm-todo-completed' }).range(contentStart, line.to)
          );
        }
      }
      continue;
    }
    
    const checkboxStart = line.from + bracketIndex;
    // 替换 [ ] 或 [x] 以及后面的空格（共4个字符）
    const checkboxEnd = checkboxStart + 4;
    
    // 如果是无序列表，替换列表标记为圆点
    if (!isOrderedList) {
      const markerStart = line.from + indent;
      const markerEnd = markerStart + 1;
      decorations.push(
        Decoration.replace({
          widget: new BulletWidget(indent),
        }).range(markerStart, markerEnd)
      );
    }
    
    // 替换 [ ] 或 [x] 及后面的空格为复选框
    decorations.push(
      Decoration.replace({
        widget: new CheckboxWidget(isChecked, checkboxStart, 4, view),
      }).range(checkboxStart, checkboxEnd)
    );
    
    // 如果已完成，为内容添加删除线样式
    if (isChecked) {
      const contentStart = checkboxEnd;
      if (contentStart < line.to) {
        decorations.push(
          Decoration.mark({ class: 'cm-todo-completed' }).range(contentStart, line.to)
        );
      }
    }
  }

  // 按位置排序装饰器
  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations, true);
}

/**
 * 待办清单装饰器 ViewPlugin
 */
const todoListPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = parseTodoList(view.state, view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = parseTodoList(update.state, update.view);
      }
    }
  },
  {
    decorations: v => v.decorations
  }
);

/**
 * 引用块竖线 Widget - 在行首显示竖线
 */
class BlockquoteBarWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-blockquote-bar-container';
    // 根据引用层级显示多条竖线
    for (let i = 0; i < this.level; i++) {
      const bar = document.createElement('span');
      bar.className = 'cm-blockquote-bar';
      span.appendChild(bar);
    }
    return span;
  }

  eq(other: BlockquoteBarWidget): boolean {
    return other.level === this.level;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 引用块 > 符号 Widget - 根据选中状态显示/隐藏
 */
class BlockquoteMarkerWidget extends WidgetType {
  constructor(
    readonly markers: string,
    readonly visible: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-blockquote-marker-widget';
    // 始终显示 > 符号加一个空格，确保对齐
    span.textContent = this.markers + ' ';
    if (!this.visible) {
      span.style.color = 'transparent';
    }
    return span;
  }

  eq(other: BlockquoteMarkerWidget): boolean {
    return other.markers === this.markers && other.visible === this.visible;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 解析引用块并创建装饰器
 * 在行首添加竖线，根据光标位置显示/隐藏 > 符号
 * 添加行级装饰器确保引用块内容始终显示斜体
 */
function parseBlockquote(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 获取选区范围
  const selection = state.selection.main;
  const selectionStartLine = doc.lineAt(selection.from).number;
  const selectionEndLine = doc.lineAt(selection.to).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // 匹配引用块标记：支持行首有空格的情况（TAB 缩进），包括 > 后面的空格
    const match = line.text.match(/^(\s*)(>+)(\s?)/);
    if (match) {
      const indent = match[1].length; // 缩进空格数
      const level = match[2].length; // 引用层级
      const markers = match[2]; // > 或 >> 等
      const space = match[3] || ''; // > 后面的空格（可能没有）
      
      // 判断是否显示 > 符号：光标在当前行或选区包含当前行
      const isInSelection = i >= selectionStartLine && i <= selectionEndLine;
      
      // 添加行级装饰器，确保引用块行始终显示斜体
      decorations.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          class: 'cm-blockquote-line',
        }),
      });
      
      // 在 > 符号位置添加竖线 Widget（考虑缩进）
      decorations.push({
        from: line.from + indent,
        to: line.from + indent,
        decoration: Decoration.widget({
          widget: new BlockquoteBarWidget(level),
          side: -1, // 在位置左侧显示
        }),
      });
      
      // 使用 replace 装饰器替换 > 符号和空格为 Widget
      // Widget 始终显示 "> "（带空格），确保对齐
      decorations.push({
        from: line.from + indent,
        to: line.from + indent + markers.length + space.length,
        decoration: Decoration.replace({
          widget: new BlockquoteMarkerWidget(markers, isInSelection),
        }),
      });
    }
  }
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * 引用块装饰器 StateField - 将 > 替换为竖线
 */
const blockquoteDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseBlockquote(state);
  },
  update(decorations, tr) {
    // 文档变化或光标位置变化时都需要更新
    if (tr.docChanged || tr.selection) {
      return parseBlockquote(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 支持的编程语言列表
 */
const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'scala', 'html', 'css', 'scss', 'less', 'json',
  'xml', 'yaml', 'markdown', 'sql', 'bash', 'shell', 'powershell', 'dockerfile',
  'plaintext', 'text'
];

/**
 * 代码行高亮 Widget - 使用 highlight.js 渲染单行代码
 */
class CodeLineWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly language: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-code-highlighted';
    
    const lang = this.language || 'plaintext';
    if (lang && lang !== 'plaintext' && lang !== 'text' && hljs.getLanguage(lang)) {
      span.innerHTML = hljs.highlight(this.code, { language: lang }).value;
    } else {
      span.textContent = this.code;
    }
    
    return span;
  }

  eq(other: CodeLineWidget): boolean {
    return this.code === other.code && this.language === other.language;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 行内代码高亮 Widget - 使用 highlight.js 自动检测语言并高亮
 */
class InlineCodeWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-code-highlighted cm-inline-code';
    
    // 使用 highlight.js 自动检测语言
    const result = hljs.highlightAuto(this.code);
    span.innerHTML = result.value;
    
    return span;
  }

  eq(other: InlineCodeWidget): boolean {
    return this.code === other.code;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 代码块信息接口
 */
interface CodeBlockInfo {
  startLine: number;
  endLine: number;
  language: string;
  code: string;
  from: number;
  to: number;
}

/**
 * 解析文档中的代码块
 */
function parseCodeBlocks(state: EditorState): CodeBlockInfo[] {
  const blocks: CodeBlockInfo[] = [];
  const doc = state.doc;
  let inCodeBlock = false;
  let startLine = 0;
  let language = '';
  let codeLines: string[] = [];
  let blockFrom = 0;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    if (!inCodeBlock && text.match(/^```(\w*)/)) {
      // 代码块开始
      inCodeBlock = true;
      startLine = i;
      language = text.match(/^```(\w*)/)?.[1] || '';
      codeLines = [];
      blockFrom = line.from;
    } else if (inCodeBlock && text.trim() === '```') {
      // 代码块结束
      blocks.push({
        startLine,
        endLine: i,
        language,
        code: codeLines.join('\n'),
        from: blockFrom,
        to: line.to
      });
      inCodeBlock = false;
    } else if (inCodeBlock) {
      // 代码块内容
      codeLines.push(text);
    }
  }

  return blocks;
}

/**
 * 创建代码块装饰器
 */
function createCodeBlockDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const blocks = parseCodeBlocks(state);
  
  // 获取当前光标所在行
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;

  for (const block of blocks) {
    // 给所有代码块行添加背景装饰
    for (let i = block.startLine; i <= block.endLine; i++) {
      const line = state.doc.line(i);
      decorations.push(
        Decoration.line({ class: 'cm-code-block-line' }).range(line.from)
      );
    }

    // 如果光标不在代码块内，隐藏 ``` 标记并高亮代码
    if (cursorLine < block.startLine || cursorLine > block.endLine) {
      // 隐藏开始的 ```language
      const startLine = state.doc.line(block.startLine);
      decorations.push(
        Decoration.replace({ widget: new class extends WidgetType {
          toDOM() {
            const span = document.createElement('span');
            span.className = 'cm-code-block-lang-label';
            span.textContent = block.language || 'code';
            return span;
          }
          eq() { return true; }
        }() }).range(startLine.from, startLine.to)
      );
      
      // 隐藏结束的 ```
      const endLine = state.doc.line(block.endLine);
      decorations.push(
        Decoration.mark({ class: 'cm-hidden-syntax' }).range(endLine.from, endLine.to)
      );

      // 用 Widget 替换代码内容以实现语法高亮
      const lang = block.language || 'plaintext';
      for (let i = block.startLine + 1; i < block.endLine; i++) {
        const line = state.doc.line(i);
        if (line.text.length > 0) {
          decorations.push(
            Decoration.replace({
              widget: new CodeLineWidget(line.text, lang)
            }).range(line.from, line.to)
          );
        }
      }
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * 代码块装饰器 StateField
 */
const codeBlockDecorations = StateField.define<DecorationSet>({
  create(state) {
    return createCodeBlockDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return createCodeBlockDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 分割线 Widget - 将 --- 或 *** 或 ___ 渲染为水平分割线
 */
class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-horizontal-rule';
    const hr = document.createElement('hr');
    container.appendChild(hr);
    return container;
  }

  eq(): boolean {
    return true;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 解析分割线并创建装饰器
 * 匹配独立行的 ---、***、___ （至少3个字符）
 */
function parseHorizontalRules(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 获取当前光标所在行
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text.trim();

    // 匹配 ---、***、___ （至少3个相同字符，可以有空格）
    if (/^[-]{3,}$|^[*]{3,}$|^[_]{3,}$/.test(text)) {
      // 如果光标在当前行，显示原始文本
      if (i === cursorLine) {
        continue;
      }

      // 用 Widget 替换整行内容
      decorations.push(
        Decoration.replace({
          widget: new HorizontalRuleWidget(),
        }).range(line.from, line.to)
      );
    }
  }

  return Decoration.set(decorations);
}

/**
 * 分割线装饰器 StateField
 */
const horizontalRuleDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseHorizontalRules(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return parseHorizontalRules(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 解析标题语法并创建隐藏装饰器（源码模式下的所见即所得）
 * 当光标不在标题行时，隐藏 # 符号
 * 如果标题行没有内容（只有 # 符号），不隐藏
 */
function parseHeadingSyntaxHide(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 获取当前光标所在行
  const cursorLine = state.selection.main.head;
  const currentLineNumber = doc.lineAt(cursorLine).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const match = line.text.match(/^(#{1,6})\s/);
    if (match) {
      // 如果光标在当前标题行，不隐藏 # 符号
      if (i === currentLineNumber) {
        continue;
      }
      
      // 如果标题行没有内容（只有 # 符号和空格），不隐藏
      const content = line.text.slice(match[0].length);
      if (content.trim().length === 0) {
        continue;
      }
      
      // 隐藏 # 符号和后面的空格
      const from = line.from;
      const to = from + match[1].length + 1; // 包括空格
      decorations.push({
        from,
        to,
        decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
      });
    }
  }
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * 标题语法隐藏装饰器 StateField（源码模式下的所见即所得）
 */
const headingSyntaxHideDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseHeadingSyntaxHide(state);
  },
  update(decorations, tr) {
    // 文档变化或光标位置变化时都需要更新
    if (tr.docChanged || tr.selection) {
      return parseHeadingSyntaxHide(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 解析行内代码并创建高亮装饰器（源码模式）
 */
function parseInlineCodeHighlight(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc.toString();
  const docLength = doc.length;
  const cursorPos = state.selection.main.head;
  
  // 匹配行内代码 `code`
  const codeRegex = /`([^`\n]+)`/g;
  let match;
  
  while ((match = codeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const endTo = startFrom + match[0].length;
    
    // 边界检查
    if (endTo > docLength) continue;
    
    // 跳过代码块的 ``` 标记
    if (startFrom > 0 && doc[startFrom - 1] === '`') continue;
    if (endTo < docLength && doc[endTo] === '`') continue;
    
    const startTo = startFrom + 1;
    const contentFrom = startTo;
    const contentTo = endTo - 1;
    const endFrom = contentTo;
    const codeContent = match[1];
    
    // 如果光标在这个行内代码范围内，显示原始语法
    if (cursorPos >= startFrom && cursorPos <= endTo) {
      continue;
    }
    
    // 确保范围有效
    if (contentFrom >= contentTo) continue;
    
    // 隐藏前面的 `
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 用 Widget 替换代码内容以实现语法高亮
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.replace({
        widget: new InlineCodeWidget(codeContent)
      }),
    });
    // 隐藏后面的 `
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 按位置排序
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * 行内代码高亮装饰器 StateField（源码模式）
 */
const inlineCodeHighlightDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseInlineCodeHighlight(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return parseInlineCodeHighlight(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 解析 Markdown 语法并创建隐藏装饰器（预览模式）
 */
function parseMarkdownSyntax(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  
  // 隐藏标题的 # 符号
  const headingRegex = /^(#{1,6})\s/gm;
  let match;
  
  while ((match = headingRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[1].length + 1; // 包括空格
    decorations.push({
      from,
      to,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 隐藏粗体的 ** 或 __
  const boldRegex = /(\*\*|__)([^*_]+)(\*\*|__)/g;
  while ((match = boldRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 2;
    const endFrom = startFrom + match[0].length - 2;
    const endTo = startFrom + match[0].length;
    
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 隐藏斜体的 * 或 _（单个）
  const italicRegex = /(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)|(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g;
  while ((match = italicRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 1;
    const endFrom = startFrom + match[0].length - 1;
    const endTo = startFrom + match[0].length;
    
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 隐藏删除线的 ~~ 并添加删除线样式
  const strikeRegex = /~~([^~]+)~~/g;
  while ((match = strikeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 2;
    const contentFrom = startTo;
    const contentTo = startFrom + match[0].length - 2;
    const endFrom = contentTo;
    const endTo = startFrom + match[0].length;
    
    // 隐藏前面的 ~~
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 给中间内容添加删除线样式
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.mark({ class: 'cm-strikethrough' }),
    });
    // 隐藏后面的 ~~
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 隐藏行内代码的 ` 并添加语法高亮
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 1;
    const contentFrom = startTo;
    const contentTo = startFrom + match[0].length - 1;
    const endFrom = contentTo;
    const endTo = startFrom + match[0].length;
    const codeContent = match[1];
    
    // 隐藏前面的 `
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 用 Widget 替换代码内容以实现语法高亮
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.replace({
        widget: new InlineCodeWidget(codeContent)
      }),
    });
    // 隐藏后面的 `
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 隐藏链接语法 [text](url) 中的 []() 部分，只显示文本
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(doc)) !== null) {
    const fullMatch = match[0];
    const text = match[1];
    const startBracket = match.index;
    const endBracket = startBracket + 1;
    const startParen = startBracket + 1 + text.length;
    const endParen = startBracket + fullMatch.length;
    
    // 隐藏 [
    decorations.push({
      from: startBracket,
      to: endBracket,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 隐藏 ](url)
    decorations.push({
      from: startParen,
      to: endParen,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 按位置排序并去重
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * Markdown 语法隐藏装饰器 StateField（预览模式）
 */
const markdownHideDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseMarkdownSyntax(state.doc.toString());
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return parseMarkdownSyntax(tr.newDoc.toString());
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  content,
  onChange,
  editable = true,
  autoFocus = false,
  initialMode = 'source',
  showOutline = true,
  isActive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalChange = useRef(false);
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [colorBlocks, setColorBlocks] = useState<ColorBlockItem[]>([]);
  const [outlineTab, setOutlineTab] = useState<'headings' | 'colors'>('headings');
  const [outlineWidth, setOutlineWidth] = useState(300);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const isResizingOutline = useRef(false);

  // 上下文菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 视频链接输入状态
  const [videoLinkInput, setVideoLinkInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 颜色预览状态
  const [colorPreview, setColorPreview] = useState<{
    type: 'color' | 'background-color' | null;
    color: string;
    from: number;
    to: number;
  } | null>(null);

  // 保存打开颜色选择器时的选区范围
  const colorPickerSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // 关闭上下文菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
    setColorPreview(null); // 关闭菜单时清除预览
    colorPickerSelectionRef.current = null; // 清除保存的选区
  }, []);

  // 颜色预览效果
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (colorPreview && colorPreview.type) {
      // 同时设置预览装饰器和预览范围（用于隐藏已有颜色）
      view.dispatch({
        effects: [
          setColorPreviewEffect.of({
            type: colorPreview.type,
            color: colorPreview.color,
            from: colorPreview.from,
            to: colorPreview.to,
          }),
          setPreviewRangeEffect.of({
            from: colorPreview.from,
            to: colorPreview.to,
            type: colorPreview.type,
          }),
        ],
      });
    } else {
      // 清除预览和预览范围
      view.dispatch({
        effects: [
          setColorPreviewEffect.of(null),
          setPreviewRangeEffect.of(null),
        ],
      });
    }
  }, [colorPreview]);

  // 上下文菜单项
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    const view = viewRef.current;

    return [
      {
        id: 'new-link',
        label: '新建链接',
        action: () => {
          if (view) {
            const { from, to } = view.state.selection.main;
            const selectedText = view.state.sliceDoc(from, to);
            const linkText = selectedText || '链接文本';
            view.dispatch({
              changes: { from, to, insert: `[[${linkText}]]` },
            });
          }
        },
      },
      {
        id: 'external-link',
        label: '新增外部链接',
        action: () => {
          if (view) {
            const { from, to } = view.state.selection.main;
            const selectedText = view.state.sliceDoc(from, to);
            const linkText = selectedText || '链接文本';
            view.dispatch({
              changes: { from, to, insert: `[${linkText}](url)` },
            });
          }
        },
      },
      { id: 'sep1', label: '', separator: true },
      {
        id: 'text-format',
        label: '文本格式',
        submenu: [
          {
            id: 'bold',
            label: '加粗',
            shortcut: 'Ctrl+B',
            action: () => {
              if (view) {
                const { from, to } = view.state.selection.main;
                const selectedText = view.state.sliceDoc(from, to);
                view.dispatch({
                  changes: { from, to, insert: `**${selectedText || '粗体文本'}**` },
                });
              }
            },
          },
          {
            id: 'italic',
            label: '斜体',
            shortcut: 'Ctrl+I',
            action: () => {
              if (view) {
                const { from, to } = view.state.selection.main;
                const selectedText = view.state.sliceDoc(from, to);
                view.dispatch({
                  changes: { from, to, insert: `*${selectedText || '斜体文本'}*` },
                });
              }
            },
          },
          {
            id: 'strikethrough',
            label: '删除线',
            action: () => {
              if (view) {
                const { from, to } = view.state.selection.main;
                const selectedText = view.state.sliceDoc(from, to);
                view.dispatch({
                  changes: { from, to, insert: `~~${selectedText || '删除线文本'}~~` },
                });
              }
            },
          },
          {
            id: 'inline-code',
            label: '行内代码',
            action: () => {
              if (view) {
                const { from, to } = view.state.selection.main;
                const selectedText = view.state.sliceDoc(from, to);
                view.dispatch({
                  changes: { from, to, insert: `\`${selectedText || '代码'}\`` },
                });
              }
            },
          },
          {
            id: 'comment',
            label: '注释',
            action: () => {
              if (view) {
                const { from, to } = view.state.selection.main;
                const selectedText = view.state.sliceDoc(from, to);
                view.dispatch({
                  changes: { from, to, insert: `<!-- ${selectedText || '注释'} -->` },
                });
              }
            },
          },
          {
            id: 'clear-format',
            label: '清除格式',
            action: () => {
              if (view) {
                const { from, to } = view.state.selection.main;
                if (from === to) return;
                const selectedText = view.state.sliceDoc(from, to);
                // 清除常见格式标记：**粗体**、*斜体*、~~删除线~~、==高亮==、`代码`、$公式$
                const cleanText = selectedText
                  .replace(/\*\*(.+?)\*\*/g, '$1')
                  .replace(/\*(.+?)\*/g, '$1')
                  .replace(/~~(.+?)~~/g, '$1')
                  .replace(/==(.+?)==/g, '$1')
                  .replace(/`(.+?)`/g, '$1')
                  .replace(/\$(.+?)\$/g, '$1')
                  .replace(/<!--\s*(.+?)\s*-->/g, '$1');
                view.dispatch({
                  changes: { from, to, insert: cleanText },
                });
              }
            },
          },
        ],
      },
      {
        id: 'color',
        label: '颜色',
        submenu: [
          {
            id: 'bg-slate',
            label: '石板蓝',
            color: 'rgba(100, 116, 139, 0.3)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(100, 116, 139, 0.3)');
              }
            },
          },
          {
            id: 'bg-sky',
            label: '天空蓝',
            color: 'rgba(56, 189, 248, 0.25)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(56, 189, 248, 0.25)');
              }
            },
          },
          {
            id: 'bg-cyan',
            label: '青色',
            color: 'rgba(34, 211, 238, 0.25)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(34, 211, 238, 0.25)');
              }
            },
          },
          {
            id: 'bg-teal',
            label: '蓝绿色',
            color: 'rgba(45, 212, 191, 0.25)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(45, 212, 191, 0.25)');
              }
            },
          },
          {
            id: 'bg-indigo',
            label: '靛蓝色',
            color: 'rgba(129, 140, 248, 0.3)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(129, 140, 248, 0.3)');
              }
            },
          },
          {
            id: 'bg-violet',
            label: '紫罗兰',
            color: 'rgba(167, 139, 250, 0.3)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(167, 139, 250, 0.3)');
              }
            },
          },
          {
            id: 'bg-custom',
            label: '自定义背景',
            isCustomColor: true,
            onCustomColorPreview: (color: string) => {
              if (view) {
                // 第一次调用时保存选区
                if (!colorPickerSelectionRef.current) {
                  const { from, to } = view.state.selection.main;
                  if (from === to) {
                    const line = view.state.doc.lineAt(from);
                    colorPickerSelectionRef.current = { from: line.from, to: line.to };
                  } else {
                    colorPickerSelectionRef.current = { from, to };
                  }
                }
                // 使用保存的选区
                const { from, to } = colorPickerSelectionRef.current;
                setColorPreview({
                  type: 'background-color',
                  color,
                  from,
                  to,
                });
              }
            },
            onCustomColor: (color: string) => {
              setColorPreview(null);
              if (view && colorPickerSelectionRef.current) {
                const { from, to } = colorPickerSelectionRef.current;
                // 恢复选区
                view.dispatch({
                  selection: { anchor: from, head: to },
                });
                applyColorStyle(view, 'background-color', color);
              }
              colorPickerSelectionRef.current = null;
            },
            onCustomColorCancel: () => {
              // 取消时清除预览
              setColorPreview(null);
              colorPickerSelectionRef.current = null;
            },
          },
          { id: 'color-sep', label: '', separator: true },
          {
            id: 'text-red',
            label: '红色文字',
            color: '#ff0000',
            action: () => {
              if (view) {
                applyColorStyle(view, 'color', '#ff0000');
              }
            },
          },
          {
            id: 'text-orange',
            label: '橙色文字',
            color: '#ff8000',
            action: () => {
              if (view) {
                applyColorStyle(view, 'color', '#ff8000');
              }
            },
          },
          {
            id: 'text-green',
            label: '绿色文字',
            color: '#00cc00',
            action: () => {
              if (view) {
                applyColorStyle(view, 'color', '#00cc00');
              }
            },
          },
          {
            id: 'text-blue',
            label: '蓝色文字',
            color: '#0066ff',
            action: () => {
              if (view) {
                applyColorStyle(view, 'color', '#0066ff');
              }
            },
          },
          {
            id: 'text-purple',
            label: '紫色文字',
            color: '#9900ff',
            action: () => {
              if (view) {
                applyColorStyle(view, 'color', '#9900ff');
              }
            },
          },
          {
            id: 'text-custom',
            label: '自定义文字',
            isCustomColor: true,
            onCustomColorPreview: (color: string) => {
              if (view) {
                // 第一次调用时保存选区
                if (!colorPickerSelectionRef.current) {
                  const { from, to } = view.state.selection.main;
                  if (from === to) {
                    const line = view.state.doc.lineAt(from);
                    colorPickerSelectionRef.current = { from: line.from, to: line.to };
                  } else {
                    colorPickerSelectionRef.current = { from, to };
                  }
                }
                // 使用保存的选区
                const { from, to } = colorPickerSelectionRef.current;
                setColorPreview({
                  type: 'color',
                  color,
                  from,
                  to,
                });
              }
            },
            onCustomColor: (color: string) => {
              setColorPreview(null);
              if (view && colorPickerSelectionRef.current) {
                const { from, to } = colorPickerSelectionRef.current;
                // 恢复选区
                view.dispatch({
                  selection: { anchor: from, head: to },
                });
                applyColorStyle(view, 'color', color);
              }
              colorPickerSelectionRef.current = null;
            },
            onCustomColorCancel: () => {
              // 取消时清除预览
              setColorPreview(null);
              colorPickerSelectionRef.current = null;
            },
          },
        ],
      },
      {
        id: 'paragraph',
        label: '段落设置',
        submenu: [
          {
            id: 'h1',
            label: '标题 1',
            action: () => {
              if (view) {
                const line = view.state.doc.lineAt(view.state.selection.main.head);
                view.dispatch({
                  changes: { from: line.from, to: line.from, insert: '# ' },
                  selection: { anchor: line.from + 2 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'h2',
            label: '标题 2',
            action: () => {
              if (view) {
                const line = view.state.doc.lineAt(view.state.selection.main.head);
                view.dispatch({
                  changes: { from: line.from, to: line.from, insert: '## ' },
                  selection: { anchor: line.from + 3 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'h3',
            label: '标题 3',
            action: () => {
              if (view) {
                const line = view.state.doc.lineAt(view.state.selection.main.head);
                view.dispatch({
                  changes: { from: line.from, to: line.from, insert: '### ' },
                  selection: { anchor: line.from + 4 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'quote',
            label: '引用',
            action: () => {
              if (view) {
                const line = view.state.doc.lineAt(view.state.selection.main.head);
                view.dispatch({
                  changes: { from: line.from, to: line.from, insert: '> ' },
                  selection: { anchor: line.from + 2 },
                });
                view.focus();
              }
            },
          },
        ],
      },
      {
        id: 'insert',
        label: '插入',
        submenu: [
          {
            id: 'heading1',
            label: '标题1',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                view.dispatch({
                  changes: { from: line.from, insert: '# ' },
                  selection: { anchor: line.from + 2 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'heading2',
            label: '标题2',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                view.dispatch({
                  changes: { from: line.from, insert: '## ' },
                  selection: { anchor: line.from + 3 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'heading3',
            label: '标题3',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                view.dispatch({
                  changes: { from: line.from, insert: '### ' },
                  selection: { anchor: line.from + 4 },
                });
                view.focus();
              }
            },
          },
          { id: 'insert-sep1', label: '', separator: true },
          {
            id: 'ordered-list',
            label: '有序列表',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                view.dispatch({
                  changes: { from: line.from, insert: '1. ' },
                  selection: { anchor: line.from + 3 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'unordered-list',
            label: '无序列表',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                view.dispatch({
                  changes: { from: line.from, insert: '- ' },
                  selection: { anchor: line.from + 2 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'todo-list',
            label: '待办清单',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                const text = line.text;
                
                // 检查是否是有序列表行（如 1. 2. 等）
                const orderedMatch = text.match(/^(\s*)(\d+\.)\s*/);
                if (orderedMatch) {
                  // 在有序列表后面添加待办清单格式
                  const prefix = orderedMatch[0]; // 包括缩进、数字和点后的空格
                  const insertPos = line.from + prefix.length;
                  view.dispatch({
                    changes: { from: insertPos, insert: '[ ] ' },
                    selection: { anchor: insertPos + 4 },
                  });
                } else {
                  // 普通行，在行首插入待办清单
                  view.dispatch({
                    changes: { from: line.from, insert: '- [ ] ' },
                    selection: { anchor: line.from + 6 },
                  });
                }
                view.focus();
              }
            },
          },
          { id: 'insert-sep2', label: '', separator: true },
          {
            id: 'blockquote',
            label: '引用',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const line = view.state.doc.lineAt(from);
                view.dispatch({
                  changes: { from: line.from, insert: '> ' },
                  selection: { anchor: line.from + 2 },
                });
                view.focus();
              }
            },
          },
          {
            id: 'callout',
            label: '标注',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                view.dispatch({
                  changes: { from, insert: '> [!NOTE]\n> 标注内容' },
                });
                view.focus();
              }
            },
          },
          { id: 'insert-sep3', label: '', separator: true },
          {
            id: 'code-block',
            label: '代码块',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                view.dispatch({
                  changes: { from, insert: '```javascript\n\n```' },
                  selection: { anchor: from + 14 },
                });
              }
            },
          },
          {
            id: 'table',
            label: '表格',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const table = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |';
                view.dispatch({
                  changes: { from, insert: table },
                });
              }
            },
          },
          { id: 'insert-sep4', label: '', separator: true },
          {
            id: 'video-link',
            label: '视频链接',
            action: () => {
              // 获取光标位置的屏幕坐标
              if (view) {
                const { from } = view.state.selection.main;
                const coords = view.coordsAtPos(from);
                if (coords) {
                  setVideoLinkInput({
                    visible: true,
                    x: coords.left,
                    y: coords.bottom + 4,
                  });
                }
              }
            },
          },
          {
            id: 'database',
            label: '数据库',
            action: () => {
              // 打开数据库设计器标签页
              window.dispatchEvent(new CustomEvent('open-database-view'));
            },
          },
        ],
      },
      {
        id: 'local-embed',
        label: '本地嵌入',
        submenu: [
          {
            id: 'local-video',
            label: '本地视频',
            action: async () => {
              if (view) {
                const result = await window.electron?.video?.open();
                if (result && result.success && result.data?.path) {
                  const { from } = view.state.selection.main;
                  const filePath = result.data.path;
                  view.dispatch({
                    changes: { from, insert: `![视频](${filePath})` },
                  });
                  view.focus();
                }
              }
            },
          },
          {
            id: 'local-audio',
            label: '本地音频',
            action: () => {
              // TODO: 实现本地音频插入
              console.log('本地音频功能待实现');
            },
          },
          {
            id: 'local-file',
            label: '本地文件',
            action: () => {
              // TODO: 实现本地文件插入
              console.log('本地文件功能待实现');
            },
          },
        ],
      },
      {
        id: 'graphics',
        label: '图形',
        submenu: [
          {
            id: 'canvas',
            label: '画板',
            action: () => {
              // TODO: 实现画板功能
              console.log('画板功能待实现');
            },
          },
          {
            id: 'mindmap',
            label: '思维导图',
            action: () => {
              // TODO: 实现思维导图功能
              console.log('思维导图功能待实现');
            },
          },
          { id: 'graphics-sep', label: '', separator: true },
          {
            id: 'flowchart',
            label: '流程图',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const flowchartTemplate = `\`\`\`mermaid
flowchart TD
    A[开始] --> B{判断}
    B -->|是| C[处理1]
    B -->|否| D[处理2]
    C --> E[结束]
    D --> E
\`\`\``;
                view.dispatch({
                  changes: { from, insert: flowchartTemplate },
                });
                view.focus();
              }
            },
          },
          {
            id: 'sequence',
            label: '时序图',
            action: () => {
              if (view) {
                const { from } = view.state.selection.main;
                const sequenceTemplate = `\`\`\`mermaid
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 请求
    B-->>A: 响应
\`\`\``;
                view.dispatch({
                  changes: { from, insert: sequenceTemplate },
                });
                view.focus();
              }
            },
          },
        ],
      },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'ai-inline-chat',
        label: 'AI 助手',
        shortcut: 'Ctrl+I',
        action: () => {
          if (view) {
            openInlineAIChat(view);
          }
        },
      },
      { id: 'sep3', label: '', separator: true },
      {
        id: 'cut',
        label: '剪切',
        shortcut: 'Ctrl+X',
        action: () => {
          document.execCommand('cut');
        },
      },
      {
        id: 'copy',
        label: '复制',
        shortcut: 'Ctrl+C',
        action: () => {
          document.execCommand('copy');
        },
      },
      {
        id: 'paste',
        label: '粘贴',
        shortcut: 'Ctrl+V',
        action: () => {
          document.execCommand('paste');
        },
      },
      {
        id: 'select-all',
        label: '全选',
        shortcut: 'Ctrl+A',
        action: () => {
          if (view) {
            view.dispatch({
              selection: { anchor: 0, head: view.state.doc.length },
            });
          }
        },
      },
    ];
  }, []);

  // 更新大纲
  const updateOutline = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    setOutline(parseOutline(doc));

    // 色块信息已移至上下文菜单
    setColorBlocks([]);
  }, []);

  // 跳转到指定位置
  const scrollToPosition = useCallback((position: number) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      selection: { anchor: position },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  // 大纲面板拖动调整宽度
  const handleOutlineResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingOutline.current = true;
    const startX = e.clientX;
    const startWidth = outlineWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingOutline.current) return;
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(150, Math.min(400, startWidth + deltaX));
      setOutlineWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingOutline.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [outlineWidth]);

  // 处理拖拽事件
  const handleDrop = useCallback((event: DragEvent) => {
    const view = viewRef.current;
    if (!view || !editable) return;

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    // 处理拖放的文件
    if (dataTransfer.files?.length) {
      const files = Array.from(dataTransfer.files);
      const imageFiles = files.filter(file => file.type.startsWith('image/'));

      if (imageFiles.length > 0) {
        event.preventDefault();
        event.stopPropagation();

        // 获取拖放位置
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const insertPos = pos ?? view.state.selection.main.head;

        imageFiles.forEach(file => {
          handleImageFile(file, view, insertPos);
        });
        return;
      }
    }

    // 处理拖放的图片 URL
    const url = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '';

    if (url && isImageUrl(url)) {
      event.preventDefault();
      event.stopPropagation();

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const insertPos = pos ?? view.state.selection.main.head;

      handleImageUrl(url, view, insertPos);
    }
  }, [editable]);

  // 处理粘贴事件
  const handlePaste = useCallback((event: ClipboardEvent) => {
    const view = viewRef.current;
    if (!view || !editable) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        event.stopPropagation();

        const file = item.getAsFile();
        if (file) {
          const pos = view.state.selection.main.head;
          handleImageFile(file, view, pos);
        }
        return;
      }
    }
  }, [editable]);

  // 创建编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange && !isInternalChange.current) {
        const newContent = update.state.doc.toString();
        onChange(newContent);
      }
    });

    // 根据模式决定是否使用预览装饰器
    const extensions = [
      highlightActiveLine(),
      history(),
      markdown(),
      syntaxHighlighting(customHighlightStyle),
      indentUnit.of('  '), // 2 空格缩进
      customKeymap, // 自定义键盘映射放在默认键盘映射之前，确保优先处理
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      mermaidDecorations, // Mermaid 图表装饰器
      videoDecorations, // 视频装饰器放在图片之前，优先匹配视频链接
      imageDecorations,
      tableDecorations,
      headingDecorations,
      boldDecorations,
      italicDecorations,
      unorderedListDecorations,
      todoListPlugin,
      blockquoteDecorations,
      horizontalRuleDecorations,
      codeBlockDecorations,
      // 缩进线
      indentGuideDecorations,
      // 序号高亮（如 4.2、4.2.1、4.2.1.1）
      numberingDecorations,
      // 文本颜色系统 - 纯 StateField + Decoration 方案
      colorMarksField,
      previewRangeField,
      Prec.highest(colorDecorationsField),
      // 颜色预览装饰器
      colorPreviewDecorations,
      // 折叠组高亮（光标选中时显示父级的折叠图标和子行的缩进线）
      foldGroupHighlightField,
      // 折叠功能（不使用 customFoldService，避免与 markdown 解析器冲突）
      headingFoldMarkers,
      headingFoldGutter,
      listFoldDecorations,
      // 内联 AI 聊天
      inlineAIChatField,
      codeFolding({
        placeholderDOM: (_view, onclick) => {
          const span = document.createElement('span');
          span.className = 'cm-foldPlaceholder';
          span.textContent = '...';

          span.title = '点击展开';
          span.onclick = onclick;
          return span;
        },
      }),
      EditorState.readOnly.of(!editable),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%'
        },
        '.cm-scroller': {
          overflow: 'auto'
        },
        '.cm-content': {
          caretColor: 'var(--ws-editor-foreground)'
        },
        '.cm-line': {
        
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: 'var(--ws-editor-foreground)',
        },
      }),
    ];

    // 预览模式添加隐藏 Markdown 语法的装饰器
    if (mode === 'preview') {
      extensions.push(markdownHideDecorations);
    } else {
      // 源码模式添加标题语法隐藏装饰器（所见即所得）
      extensions.push(headingSyntaxHideDecorations);
      // 源码模式添加行内代码高亮装饰器
      extensions.push(inlineCodeHighlightDecorations);
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    globalEditorView = view;

    // 初始化大纲
    updateOutline();

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      globalEditorView = null;
    };
  }, [editable, mode, updateOutline]);

  // 监听视频标题和显示模式变化事件
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // 视频标题变化处理
    const handleVideoTitleChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        from: number;
        to: number;
        title: string;
        url: string;
        mode: string;
      }>;
      const { from, to, title, url, mode } = customEvent.detail;
      const modeStr = mode !== 'embed' ? `|mode:${mode}` : '';
      const newMarkdown = `![${title}${modeStr}](${url})`;
      view.dispatch({
        changes: { from, to, insert: newMarkdown },
      });
    };

    // 视频显示模式变化处理
    const handleVideoModeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        from: number;
        to: number;
        mode: string;
        title: string;
        url: string;
      }>;
      const { from, to, mode, title, url } = customEvent.detail;
      const modeStr = mode !== 'embed' ? `|mode:${mode}` : '';
      const newMarkdown = `![${title}${modeStr}](${url})`;
      view.dispatch({
        changes: { from, to, insert: newMarkdown },
      });
    };

    // 视频删除处理
    const handleVideoDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{ from: number; to: number }>;
      const { from, to } = customEvent.detail;
      view.dispatch({
        changes: { from, to, insert: '' },
      });
    };

    // 本地视频选择处理
    const handleVideoSelectLocal = async (event: Event) => {
      const customEvent = event as CustomEvent<{ from: number; to: number; title: string }>;
      const { from, to, title } = customEvent.detail;
      
      // 调用 Electron 打开文件对话框
      const result = await window.electron?.video?.open();
      console.log('[handleVideoSelectLocal] 选择结果:', result);
      if (result && result.success && result.data?.path) {
        const filePath = result.data.path;
        console.log('[handleVideoSelectLocal] 文件路径:', filePath);
        const newMarkdown = `![${title}](${filePath})`;
        console.log('[handleVideoSelectLocal] 插入 markdown:', newMarkdown);
        view.dispatch({
          changes: { from, to, insert: newMarkdown },
        });
      }
    };

    window.addEventListener('video-title-change', handleVideoTitleChange);
    window.addEventListener('video-display-mode-change', handleVideoModeChange);
    window.addEventListener('video-delete', handleVideoDelete);
    window.addEventListener('video-select-local', handleVideoSelectLocal);

    return () => {
      window.removeEventListener('video-title-change', handleVideoTitleChange);
      window.removeEventListener('video-display-mode-change', handleVideoModeChange);
      window.removeEventListener('video-delete', handleVideoDelete);
      window.removeEventListener('video-select-local', handleVideoSelectLocal);
    };
  }, []);

  // 内容变化时更新大纲
  useEffect(() => {
    updateOutline();
  }, [content, updateOutline]);

  // 绑定拖拽和粘贴事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 阻止默认拖拽行为
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    // 右键菜单处理
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
      });
    };

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('paste', handlePaste);
    container.addEventListener('contextmenu', handleContextMenu);

    return () => {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('paste', handlePaste);
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleDrop, handlePaste]);

  // 同步外部 content 变化
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      isInternalChange.current = true;
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
      });
      isInternalChange.current = false;
    }
  }, [content]);

  // 监听模式切换事件（来自 TabBar 更多操作菜单）
  useEffect(() => {
    const handleModeChange = (event: CustomEvent<EditorMode>) => {
      setMode(event.detail);
    };

    window.addEventListener('set-codemirror-mode', handleModeChange as EventListener);
    return () => {
      window.removeEventListener('set-codemirror-mode', handleModeChange as EventListener);
    };
  }, []);

  // 监听插入数据库表格事件
  useEffect(() => {
    const handleInsertDatabaseTable = (event: Event) => {
      const customEvent = event as CustomEvent<{ markdown: string; focusEditor?: boolean; handled?: boolean }>;
      
      // 如果事件已被处理，跳过
      if (customEvent.detail?.handled) return;
      
      const { markdown } = customEvent.detail;
      
      if (viewRef.current && markdown) {
        // 标记事件已处理，防止其他编辑器重复处理
        customEvent.detail.handled = true;
        
        const { from } = viewRef.current.state.selection.main;
        viewRef.current.dispatch({
          changes: { from, insert: markdown + '\n' },
          selection: { anchor: from + markdown.length + 1 },
        });
        viewRef.current.focus();
      }
    };

    window.addEventListener('insert-database-table', handleInsertDatabaseTable as EventListener);
    return () => {
      window.removeEventListener('insert-database-table', handleInsertDatabaseTable as EventListener);
    };
  }, []);

  return (
    <div className={`codemirror-editor ${mode === 'preview' ? 'preview-mode' : 'source-mode'}`}>
      <div className="cm-main-content">
        <div className="cm-editor-container" ref={containerRef} />
        {showOutline && (
          <div 
            className={`cm-outline-panel ${isOutlineCollapsed ? 'collapsed' : ''}`} 
            style={{ width: isOutlineCollapsed ? 32 : outlineWidth }}
          >
            {!isOutlineCollapsed && (
              <div
                className="cm-outline-resize-handle"
                onMouseDown={handleOutlineResizeStart}
              />
            )}
            <div className="cm-outline-tabs">
              {!isOutlineCollapsed && (
                <>
                  <div
                    className={`cm-outline-tab ${outlineTab === 'headings' ? 'active' : ''}`}
                    onClick={() => setOutlineTab('headings')}
                  >
                    大纲
                  </div>
                  <div
                    className={`cm-outline-tab ${outlineTab === 'colors' ? 'active' : ''}`}
                    onClick={() => setOutlineTab('colors')}
                  >
                    色块
                  </div>
                  <div className="cm-outline-tab-spacer" />
                </>
              )}
              <div
                className="cm-outline-collapse-btn"
                onClick={() => setIsOutlineCollapsed(!isOutlineCollapsed)}
                title={isOutlineCollapsed ? '展开大纲' : '收起大纲'}
              >
                <Icon name={isOutlineCollapsed ? 'chevron-left' : 'chevron-right'} size={14} />
              </div>
            </div>
            {!isOutlineCollapsed && (
              <div className="cm-outline-content">
                {outlineTab === 'headings' && (
                  <div className="cm-outline-list">
                    {outline.length === 0 ? (
                      <div className="cm-outline-empty">暂无标题</div>
                    ) : (
                      outline.map(item => (
                        <div
                          key={item.id}
                          className={`cm-outline-item cm-outline-level-${item.level}`}
                          onClick={() => scrollToPosition(item.position)}
                          title={item.text}
                        >
                          <span className="cm-outline-text">{item.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {outlineTab === 'colors' && (
                  <div className="cm-outline-list">
                    {colorBlocks.length === 0 ? (
                      <div className="cm-outline-empty">暂无色块</div>
                    ) : (
                      colorBlocks.map(item => (
                        <div
                          key={item.id}
                          className="cm-outline-item cm-color-block-item"
                          onClick={() => scrollToPosition(item.position)}
                          title={`第 ${item.lineNumber} 行`}
                        >
                          <span
                            className="cm-color-indicator"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="cm-outline-text">{item.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <CodeMirrorContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={getContextMenuItems()}
        onClose={closeContextMenu}
      />
      <VideoLinkInput
        visible={videoLinkInput.visible}
        x={videoLinkInput.x}
        y={videoLinkInput.y}
        onConfirm={(url) => {
          const view = viewRef.current;
          if (view) {
            const { from } = view.state.selection.main;
            const videoMarkdown = `![视频](${url})`;
            view.dispatch({
              changes: { from, insert: videoMarkdown },
            });
            view.focus();
          }
        }}
        onClose={() => setVideoLinkInput({ visible: false, x: 0, y: 0 })}
      />
    </div>
  );
};

export default CodeMirrorEditor;
