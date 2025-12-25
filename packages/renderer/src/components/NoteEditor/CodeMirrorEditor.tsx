/**
 * CodeMirror 编辑器组件
 * 功能：基于 CodeMirror 6 的 Markdown 编辑器
 * 描述：提供源码级别的 Markdown 编辑体验，支持语法高亮、图片拖拽、图片内联渲染、图片大小调整和背景色块
 * 支持源码模式和预览模式切换
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState, StateField, RangeSet, StateEffect, Prec, RangeSetBuilder } from '@codemirror/state';
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
import { syntaxHighlighting, HighlightStyle, indentUnit, foldService, codeFolding, foldedRanges } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { foldEffect, unfoldEffect } from '@codemirror/language';
import { Icon } from '../Icons';
import './CodeMirrorEditor.scss';

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

// 当前显示的颜色选择器
let currentColorPicker: HTMLElement | null = null;

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
  // 序号必须在行首（可能有缩进空格），后面跟空格或其他内容
  const numberingRegex = /^(\s*)(\d+\.|[A-Za-z]\.|[A-Za-z]\d{1,3}\.|[一二三四五六七八九十百千万零]+、|\d+(?:\.\d+)+)\s/;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
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
 * 自定义回车键处理 - 智能无序列表换行
 * 1. 在列表行末尾按回车时，自动添加列表标记到新行
 * 2. 如果当前行只有列表标记没有内容，按回车时删除标记并退出列表模式
 */
function handleListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 检查是否是无序列表行
  const listMatch = lineText.match(/^(\s*)([-*+])\s/);
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
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
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
      key: 'Enter',
      run: (view) => {
        // 先尝试处理引用块
        if (handleBlockquoteEnter(view)) {
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
  ])
);

/**
 * 预设背景颜色
 */
const BACKGROUND_COLORS = [
  { name: '默认', color: '' },
  { name: '浅黄', color: 'rgba(253, 224, 71, 0.4)' },
  { name: '浅绿', color: 'rgba(134, 239, 172, 0.4)' },
  { name: '浅蓝', color: 'rgba(147, 197, 253, 0.4)' },
  { name: '浅粉', color: 'rgba(249, 168, 212, 0.4)' },
  { name: '浅紫', color: 'rgba(196, 181, 253, 0.4)' },
  { name: '浅橙', color: 'rgba(253, 186, 116, 0.4)' },
];

/**
 * 设置行背景色的 Effect
 */
const setLineBackgroundEffect = StateEffect.define<{ from: number; to: number; color: string }>();

/**
 * 清除行背景色的 Effect
 */
const clearLineBackgroundEffect = StateEffect.define<{ from: number; to: number }>();

/**
 * 行背景色 StateField - 存储每行的背景色信息
 */
const lineBackgroundField = StateField.define<Map<number, string>>({
  create() {
    return new Map();
  },
  update(backgrounds, tr) {
    let newBackgrounds = backgrounds;
    
    // 处理文档变化时的行号映射
    if (tr.docChanged) {
      const updatedBackgrounds = new Map<number, string>();
      
      backgrounds.forEach((color, lineNum) => {
        // 尝试映射旧行号到新行号
        try {
          const oldDoc = tr.startState.doc;
          if (lineNum <= oldDoc.lines) {
            const oldLine = oldDoc.line(lineNum);
            const newPos = tr.changes.mapPos(oldLine.from, 1);
            const newLineNum = tr.newDoc.lineAt(newPos).number;
            updatedBackgrounds.set(newLineNum, color);
          }
        } catch {
          // 行已被删除，不保留
        }
      });
      
      newBackgrounds = updatedBackgrounds;
    }
    
    // 处理设置背景色的 Effect
    for (const effect of tr.effects) {
      if (effect.is(setLineBackgroundEffect)) {
        const { from, to, color } = effect.value;
        newBackgrounds = new Map(newBackgrounds);
        
        const startLine = tr.state.doc.lineAt(from).number;
        const endLine = tr.state.doc.lineAt(to).number;
        
        for (let i = startLine; i <= endLine; i++) {
          newBackgrounds.set(i, color);
        }
      }
      
      if (effect.is(clearLineBackgroundEffect)) {
        const { from, to } = effect.value;
        newBackgrounds = new Map(newBackgrounds);
        
        const startLine = tr.state.doc.lineAt(from).number;
        const endLine = tr.state.doc.lineAt(to).number;
        
        for (let i = startLine; i <= endLine; i++) {
          newBackgrounds.delete(i);
        }
      }
    }
    
    return newBackgrounds;
  },
});

/**
 * 根据 lineBackgroundField 生成装饰器
 */
const lineBackgroundDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildLineDecorations(state);
  },
  update(decorations, tr) {
    // 如果有背景色相关的 Effect 或文档变化，重新构建装饰器
    const hasBackgroundEffect = tr.effects.some(
      e => e.is(setLineBackgroundEffect) || e.is(clearLineBackgroundEffect)
    );
    
    if (tr.docChanged || hasBackgroundEffect) {
      return buildLineDecorations(tr.state);
    }
    
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 构建行背景装饰器
 */
function buildLineDecorations(state: EditorState): DecorationSet {
  const backgrounds = state.field(lineBackgroundField);
  const decorations: { from: number; decoration: Decoration }[] = [];
  
  backgrounds.forEach((color, lineNum) => {
    if (lineNum <= state.doc.lines) {
      const line = state.doc.line(lineNum);
      decorations.push({
        from: line.from,
        decoration: Decoration.line({
          class: 'cm-line-background',
          attributes: { style: `background-color: ${color}` },
        }),
      });
    }
  });
  
  // 按位置排序
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from)),
    true
  );
}

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
 * 关闭颜色选择器
 */
function closeColorPicker(): void {
  if (currentColorPicker) {
    currentColorPicker.remove();
    currentColorPicker = null;
  }
}

/**
 * 显示背景色选择器
 */
function showBackgroundColorPicker(view: EditorView, x: number, y: number): void {
  closeColorPicker();

  const picker = document.createElement('div');
  picker.className = 'cm-color-picker';
  picker.style.left = `${x}px`;
  picker.style.top = `${y}px`;

  // 标题
  const title = document.createElement('div');
  title.className = 'cm-color-picker-title';
  title.textContent = '背景颜色';
  picker.appendChild(title);

  // 颜色网格
  const grid = document.createElement('div');
  grid.className = 'cm-color-picker-grid';

  BACKGROUND_COLORS.forEach(({ name, color }) => {
    const colorBtn = document.createElement('div');
    colorBtn.className = 'cm-color-picker-item';
    colorBtn.title = name;
    if (color) {
      colorBtn.style.backgroundColor = color;
    } else {
      colorBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="20" y2="20"/></svg>`;
      colorBtn.classList.add('cm-color-picker-item-none');
    }

    colorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyBackgroundColor(view, color);
      closeColorPicker();
    });

    grid.appendChild(colorBtn);
  });

  picker.appendChild(grid);
  document.body.appendChild(picker);
  currentColorPicker = picker;

  // 点击其他地方关闭
  const handleClickOutside = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      closeColorPicker();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

/**
 * 应用背景颜色到当前选中的行
 * 使用 StateEffect 方式，不修改文档内容
 */
function applyBackgroundColor(view: EditorView, color: string): void {
  const { state } = view;
  const { selection } = state;
  const { from, to } = selection.main;

  if (color) {
    // 设置背景色
    view.dispatch({
      effects: setLineBackgroundEffect.of({ from, to, color }),
    });
  } else {
    // 清除背景色
    view.dispatch({
      effects: clearLineBackgroundEffect.of({ from, to }),
    });
  }
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
 * 解析标题语法并创建隐藏装饰器（源码模式下的所见即所得）
 * 当光标不在标题行时，隐藏 # 符号
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
  
  // 隐藏删除线的 ~~
  const strikeRegex = /~~([^~]+)~~/g;
  while ((match = strikeRegex.exec(doc)) !== null) {
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
  
  // 隐藏行内代码的 `
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(doc)) !== null) {
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

  // 更新大纲
  const updateOutline = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    setOutline(parseOutline(doc));

    // 获取色块信息
    try {
      const backgrounds = view.state.field(lineBackgroundField);
      setColorBlocks(parseColorBlocks(backgrounds, doc));
    } catch {
      setColorBlocks([]);
    }
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
      imageDecorations,
      headingDecorations,
      unorderedListDecorations,
      blockquoteDecorations,
      lineBackgroundField,
      lineBackgroundDecorations,
      // 缩进线
      indentGuideDecorations,
      // 序号高亮（如 4.2、4.2.1、4.2.1.1）
      numberingDecorations,
      // 折叠组高亮（光标选中时显示父级的折叠图标和子行的缩进线）
      foldGroupHighlightField,
      // 折叠功能（不使用 customFoldService，避免与 markdown 解析器冲突）
      headingFoldMarkers,
      headingFoldGutter,
      listFoldDecorations,
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
          height: '100%',
          fontFamily: "'Consolas', 'Monaco', monospace",
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: "'Consolas', 'Monaco', monospace",
        },
        '.cm-content': {
          caretColor: 'var(--ws-editor-foreground)',
          fontFamily: "'Consolas', 'Monaco', monospace",
        },
        '.cm-line': {
          fontFamily: "'Consolas', 'Monaco', monospace",
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: 'var(--ws-editor-foreground)',
        },
      }),
      EditorView.domEventHandlers({
        contextmenu: (event, view) => {
          if (!editable) return false;
          event.preventDefault();
          showBackgroundColorPicker(view, event.clientX, event.clientY);
          return true;
        },
      }),
    ];

    // 预览模式添加隐藏 Markdown 语法的装饰器
    if (mode === 'preview') {
      extensions.push(markdownHideDecorations);
    } else {
      // 源码模式添加标题语法隐藏装饰器（所见即所得）
      extensions.push(headingSyntaxHideDecorations);
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

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('paste', handlePaste);

    return () => {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('paste', handlePaste);
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
    </div>
  );
};

export default CodeMirrorEditor;
