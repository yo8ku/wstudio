/**
 * CodeMirror 缂栬緫鍣ㄧ粍浠?
 * 鍔熻兘锛氬熀浜?CodeMirror 6 鐨?Markdown 缂栬緫鍣?
 * 鎻忚堪锛氭彁渚涙簮鐮佺骇鍒殑 Markdown 缂栬緫浣撻獙锛屾敮鎸佽娉曢珮浜€佸浘鐗囨嫋鎷姐€佸浘鐗囧唴鑱旀覆鏌撱€佸浘鐗囧ぇ灏忚皟鏁村拰鑳屾櫙鑹插潡
 * 鏀寔婧愮爜妯″紡鍜岄瑙堟ā寮忓垏鎹?
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState, StateField, RangeSet, StateEffect, Prec, RangeSetBuilder, Range } from '@codemirror/state';
import { autocompletion, Completion, CompletionContext, startCompletion } from '@codemirror/autocomplete';
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
import { AtReferenceMenu } from './AtReferenceMenu';
import { tableReferenceService, type FormInfo } from '../../services/tableReference/TableReferenceService';
import { createTableReferenceExtension } from './TableReferenceWidget';
import { renderMonacoToElement, unmountMonacoFromElement, updateMonacoTheme, updateMonacoLanguage, getMonacoScrollPosition } from './CodeBlockMonaco';
import { useThemeStore } from '../../stores/themeStore';
import { useCodeBlockStore, applyPendingUpdatesToContent } from '../../stores/codeBlockStore';
import { themeService } from '../../services/ThemeService';
import { codeRunnerService } from '../../services/CodeRunnerService';
import type { SupportedLanguage } from '../../services/CodeRunnerService';
import type { LinkAnchorSuggestionItem, LinkTargetSuggestionItem } from '../../types/electron';
import { openBidirectionalLinksPanel } from '../../utils/noteLinking';
import { buildBidirectionalLinkText } from '../../utils/bidirectionalLink';
import './CodeMirrorEditor.scss';
import './TableReferenceWidget/InlineTablePreview.scss';
import './InlineAIChat/InlineAIChat.scss';
import './CodeBlockMonaco/CodeBlockMonaco.scss';
import hljs from 'highlight.js';
import mermaid from 'mermaid';

/**
 * 缂栬緫鍣ㄦā寮忕被鍨?
 */
export type EditorMode = 'source' | 'preview';

/**
 * 澶х翰椤圭被鍨?
 */
interface OutlineItem {
  id: string;
  level: number;
  text: string;
  lineNumber: number;
  position: number;
}

/**
 * 鑹插潡澶х翰椤圭被鍨?
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
  /** 鍒濆妯″紡锛岄粯璁や负 source */
  initialMode?: EditorMode;
  /** 鏄惁鏄剧ず澶х翰闈㈡澘锛岄粯璁や负 true */
  showOutline?: boolean;
  /** 鏄惁鏄綋鍓嶆縺娲荤殑缂栬緫鍣?*/
  isActive?: boolean;
}

/**
 * 瑙ｆ瀽鏂囨。涓殑鏍囬锛岀敓鎴愬ぇ绾?
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
 * 瑙ｆ瀽鏂囨。涓殑鑹插潡
 */
function parseColorBlocks(backgrounds: Map<number, string>, doc: string): ColorBlockItem[] {
  const items: ColorBlockItem[] = [];
  const lines = doc.split('\n');
  let position = 0;

  // 鎸夎鍙峰垎缁勮繛缁殑鑹插潡
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

  // 涓烘瘡涓壊鍧楃粍鐢熸垚澶х翰椤?
  colorGroups.forEach((group, index) => {
    const lineIndex = group.startLine - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      // 璁＄畻浣嶇疆
      let pos = 0;
      for (let i = 0; i < lineIndex; i++) {
        pos += lines[i].length + 1;
      }

      // 鑾峰彇绗竴琛屾枃鏈綔涓洪瑙?
      const previewText = lines[lineIndex].substring(0, 30) + (lines[lineIndex].length > 30 ? '...' : '');

      items.push({
        id: `colorblock-${index}`,
        color: group.color,
        lineNumber: group.startLine,
        text: previewText || `第${group.startLine} 行`,
        position: pos,
      });
    }
  });

  return items;
}

/**
 * Wikilink 鑷姩琛ュ叏鏃惰ˉ榻愰棴鍚堟嫭鍙凤紝閬垮厤閲嶅鎻掑叆 ]]
 */
function applyWikilinkCompletionText(
  view: EditorView,
  from: number,
  to: number,
  insertText: string
): void {
  const trailingText = view.state.doc.sliceString(to, to + 2);
  const finalText = trailingText === ']]' ? insertText : insertText + ']]';

  view.dispatch({
    changes: { from, to, insert: finalText },
    selection: { anchor: from + finalText.length }
  });
}

// 瀛樺偍 EditorView 寮曠敤锛屼緵 Widget 浣跨敤
let globalEditorView: EditorView | null = null;

// 褰撳墠閫変腑鐨勫浘鐗?src锛堢敤浜庡湪 Widget 閲嶅缓鍚庢仮澶嶉€変腑鐘舵€侊級
let selectedImageSrc: string | null = null;

/**
 * 鑾峰彇琛岀殑缂╄繘绾у埆锛堢┖鏍兼暟锛?
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * 妫€娴嬭鏄惁涓烘爣棰?
 */
function getHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

/**
 * 妫€娴嬭鏄惁涓哄垪琛ㄩ」锛堟湁搴忔垨鏃犲簭锛?
 */
function isListItem(line: string): boolean {
  const trimmed = line.trimStart();
  // 鏃犲簭鍒楄〃: - item, * item, + item
  // 鏈夊簭鍒楄〃: 1. item, 2. item, etc.
  return /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
}

/**
 * 璁＄畻鏍囬鎶樺彔鑼冨洿
 * 鏍囬鎶樺彔閫昏緫锛?
 * - 鍙湁鏍囬琛屽彲浠ユ姌鍙?
 * - 鎶樺彔鑼冨洿浠庢爣棰樿鏈熬鍒颁笅涓€涓悓绾ф垨鏇撮珮绾ф爣棰樹箣鍓?
 * - 鍙湁褰撴爣棰樻槸鏂囨。鏈€鍚庝竴琛岋紙鍚庨潰娌℃湁浠讳綍琛岋級鏃舵墠涓嶈兘鎶樺彔
 * - 鍙鍚庨潰鏈変换浣曡锛堝寘鎷┖琛岋級锛屽氨鍙互鎶樺彔
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

  // 濡傛灉鏄渶鍚庝竴琛岋紝涓嶈兘鎶樺彔锛堝悗闈㈡病鏈変换浣曡锛?
  if (line.number >= doc.lines) {
    return null;
  }

  // 鏍囬鎶樺彔锛氭姌鍙犲埌涓嬩竴涓悓绾ф垨鏇撮珮绾ф爣棰樹箣鍓?
  let foldEnd = line.to;
  let hasAnyLine = false;

  for (let i = line.number + 1; i <= doc.lines; i++) {
    const nextLine = doc.line(i);
    const nextHeadingLevel = getHeadingLevel(nextLine.text);

    // 閬囧埌鍚岀骇鎴栨洿楂樼骇鏍囬锛屽仠姝㈡姌鍙?
    if (nextHeadingLevel > 0 && nextHeadingLevel <= headingLevel) {
      // 鎶樺彔鍒颁笂涓€琛屾湯灏撅紙濡傛灉鏈夊唴瀹圭殑璇濓級
      if (hasAnyLine && i > line.number + 1) {
        foldEnd = doc.line(i - 1).to;
      }
      break;
    }

    // 鏍囪鏈変换浣曡锛堝寘鎷┖琛岋級
    hasAnyLine = true;
    foldEnd = nextLine.to;
  }

  // 鍙鏈変换浣曡涓旀姌鍙犺寖鍥存湁鏁堝氨杩斿洖
  if (hasAnyLine && foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }

  return null;
}

/**
 * 璁＄畻鍒楄〃椤规姌鍙犺寖鍥达紙Obsidian 椋庢牸锛?
 * 閫昏緫锛?
 * 1. 褰撳墠琛屼笉鑳芥槸绌鸿
 * 2. 鍚庨潰蹇呴』鏈夌缉杩涘ぇ浜庡綋鍓嶈鐨勮锛堣烦杩囩┖琛屾鏌ワ級
 * 3. 鎶樺彔鑼冨洿鍖呭惈鎵€鏈夌缉杩涘ぇ浜庡綋鍓嶈鐨勮繛缁锛堝寘鎷腑闂寸殑绌鸿锛?
 */
function computeListFoldRange(state: EditorState, lineStart: number): { from: number; to: number } | null {
  const doc = state.doc;
  
  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }
  
  const line = doc.lineAt(lineStart);
  const lineText = line.text;
  
  // 鏍囬琛屼娇鐢ㄦ爣棰樻姌鍙?
  if (getHeadingLevel(lineText) > 0) {
    return null;
  }
  
  // 绌鸿涓嶈兘鎶樺彔
  if (lineText.trim().length === 0) {
    return null;
  }
  
  const currentIndent = getIndentLevel(lineText);
  
  // 妫€鏌ヤ笅涓€琛屾槸鍚﹀瓨鍦?
  if (line.number >= doc.lines) {
    return null;
  }
  
  // 鏌ユ壘绗竴涓潪绌鸿锛屾鏌ュ叾缂╄繘鏄惁澶т簬褰撳墠琛?
  let hasChildIndent = false;
  let foldEnd = line.to;
  
  for (let i = line.number + 1; i <= doc.lines; i++) {
    const checkLine = doc.line(i);
    const checkText = checkLine.text.trim();
    
    // 绌鸿缁х画鍖呭惈鍦ㄦ姌鍙犺寖鍥村唴锛堝鏋滃凡缁忔壘鍒板瓙缂╄繘锛?
    if (checkText.length === 0) {
      if (hasChildIndent) {
        foldEnd = checkLine.to;
      }
      continue;
    }
    
    const checkIndent = getIndentLevel(checkLine.text);
    
    // 濡傛灉缂╄繘灏忎簬绛変簬褰撳墠琛岋紝鍋滄鎶樺彔
    if (checkIndent <= currentIndent) {
      break;
    }
    
    // 鎵惧埌浜嗙缉杩涘ぇ浜庡綋鍓嶈鐨勮
    hasChildIndent = true;
    foldEnd = checkLine.to;
  }
  
  // 鍙湁鎵惧埌瀛愮缉杩涜鎵嶈繑鍥炴姌鍙犺寖鍥?
  if (hasChildIndent && foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }
  
  return null;
}

/**
 * 璁＄畻鎶樺彔鑼冨洿 - 鏀寔鏍囬鎶樺彔鍜屽垪琛ㄦ姌鍙狅紙Obsidian 椋庢牸锛?
 */
function computeFoldRange(state: EditorState, lineStart: number, _lineEnd: number): { from: number; to: number } | null {
  const doc = state.doc;
  
  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }
  
  const line = doc.lineAt(lineStart);
  const headingLevel = getHeadingLevel(line.text);
  
  // 鏍囬琛屼娇鐢ㄦ爣棰樻姌鍙?
  if (headingLevel > 0) {
    return computeHeadingFoldRange(state, lineStart);
  }
  
  // 闈炴爣棰樿浣跨敤鍒楄〃鎶樺彔
  return computeListFoldRange(state, lineStart);
}

/**
 * 鑷畾涔夋姌鍙犳湇鍔?- 鏀寔鏍囬鎶樺彔鍜屽垪琛ㄦ姌鍙?
 */
const customFoldService = foldService.of((state, lineStart, lineEnd) => {
  return computeFoldRange(state, lineStart, lineEnd);
});

/**
 * 鎶樺彔鍥炬爣 GutterMarker - 灞曞紑鐘舵€侊紙浠呯敤浜庢爣棰橈級
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
 * 鎶樺彔鍥炬爣 GutterMarker - 鎶樺彔鐘舵€侊紙浠呯敤浜庢爣棰橈級
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
 * 鏋勫缓鏍囬鎶樺彔 Gutter 鏍囪锛堜粎鏍囬锛?
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
 * 鏍囬鎶樺彔 Gutter 鏍囪 StateField
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
 * 鏍囬鎶樺彔 Gutter
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

        // 楠岃瘉鎶樺彔鑼冨洿鏈夋晥鎬?
        if (foldRange.from >= foldRange.to || foldRange.to > view.state.doc.length) {
          return false;
        }

        const folded = foldedRanges(view.state);
        let existingFold: { from: number; to: number } | null = null;
        folded.between(lineObj.to, lineObj.to + 1, (from, to) => {
          existingFold = { from, to };
        });

        // 浣跨敤 requestAnimationFrame 寤惰繜鎵ц锛岄伩鍏?markdown 瑙ｆ瀽鍣ㄧ殑鍐呴儴閿欒
        requestAnimationFrame(() => {
          try {
            // 閲嶆柊楠岃瘉鐘舵€侊紝纭繚缂栬緫鍣ㄤ粛鐒舵湁鏁?
            if (!view.dom || !view.dom.isConnected) return;
            
            // 閲嶆柊璁＄畻鎶樺彔鑼冨洿锛屽洜涓虹姸鎬佸彲鑳藉凡缁忔敼鍙?
            const currentFoldRange = computeHeadingFoldRange(view.state, lineObj.from);
            if (!currentFoldRange) return;
            
            // 鍐嶆楠岃瘉鑼冨洿鏈夋晥鎬?
            if (currentFoldRange.from >= currentFoldRange.to || currentFoldRange.to > view.state.doc.length) {
              return;
            }

            if (existingFold) {
              // 灞曞紑鏃讹紝楠岃瘉 existingFold 鑼冨洿浠嶇劧鏈夋晥
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
 * 瀛愭姌鍙犲浘鏍?Widget锛堢粷瀵瑰畾浣嶏紝璺熼殢缂╄繘鍔ㄦ€佹洿鏂帮級
 * 鎵€鏈夊瓙鎶樺彔鍥炬爣閮戒娇鐢ㄧ粷瀵瑰畾浣嶏紝涓嶅崰鐢ㄦ枃鏈┖闂?
 * 閫氳繃 left 鍊兼潵璺熼殢缂╄繘浣嶇疆
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

    // 鑾峰彇瀹為檯鐨勫瓧绗﹀搴?
    const charWidth = view.defaultCharacterWidth;

    // 鎵€鏈夊瓙鎶樺彔鍥炬爣閮戒娇鐢ㄧ粷瀵瑰畾浣?
    // 鏍规嵁缂╄繘璁＄畻 left 浣嶇疆
    // indent=0 鏃舵斁鍦?gutter 浣嶇疆锛坙eft: -24px锛?
    // indent>0 鏃舵斁鍦ㄧ缉杩涚┖鏍肩殑宸﹁竟
    if (this.indent === 0) {
      span.style.left = '-24px';
    } else {
      // 鎶樺彔鍥炬爣鏀惧湪缂╄繘绌烘牸涔嬪墠锛屽浘鏍囧搴?20px
      // 缂╄繘浣嶇疆 = indent * charWidth锛屽浘鏍囧乏杈?= 缂╄繘浣嶇疆 - 鍥炬爣瀹藉害
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

      // 楠岃瘉鎶樺彔鑼冨洿鏈夋晥鎬?
      if (foldRange.from >= foldRange.to || foldRange.to > view.state.doc.length) {
        return;
      }

      const folded = foldedRanges(view.state);
      let existingFold: { from: number; to: number } | null = null;
      folded.between(this.lineTo, this.lineTo + 1, (from, to) => {
        existingFold = { from, to };
      });

      const lineFrom = this.lineFrom;

      // 浣跨敤 requestAnimationFrame 寤惰繜鎵ц锛岄伩鍏?markdown 瑙ｆ瀽鍣ㄧ殑鍐呴儴閿欒
      requestAnimationFrame(() => {
        try {
          // 閲嶆柊楠岃瘉鐘舵€侊紝纭繚缂栬緫鍣ㄤ粛鐒舵湁鏁?
          if (!view.dom || !view.dom.isConnected) return;
          
          // 閲嶆柊璁＄畻鎶樺彔鑼冨洿锛屽洜涓虹姸鎬佸彲鑳藉凡缁忔敼鍙?
          const currentFoldRange = computeListFoldRange(view.state, lineFrom);
          if (!currentFoldRange) return;
          
          // 鍐嶆楠岃瘉鑼冨洿鏈夋晥鎬?
          if (currentFoldRange.from >= currentFoldRange.to || currentFoldRange.to > view.state.doc.length) {
            return;
          }

          if (existingFold) {
            // 灞曞紑鏃讹紝楠岃瘉 existingFold 鑼冨洿浠嶇劧鏈夋晥
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
 * 鏋勫缓瀛愭姌鍙犲唴鑱旇楗板櫒
 * 鎵€鏈夊浘鏍囬兘浣跨敤缁濆瀹氫綅锛屼笉鍗犵敤鏂囨湰绌洪棿
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

    // 璺宠繃鏍囬琛?
    if (getHeadingLevel(lineText) > 0) continue;

    // 璺宠繃绌鸿
    if (lineText.trim().length === 0) continue;

    const foldRange = computeListFoldRange(state, line.from);
    
    // 鍙湁褰?foldRange 瀛樺湪鏃舵墠娣诲姞鎶樺彔鍥炬爣
    if (foldRange) {
      const isFolded = foldedMap.has(line.to);
      const indent = getIndentLevel(lineText);

      // 鍦ㄧ缉杩涗箣鍚庢彃鍏ユ姌鍙犲浘鏍囷紙鎴栬棣栵紝濡傛灉鏃犵缉杩涳級
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
 * 瀛愭姌鍙犲唴鑱旇楗板櫒 StateField
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
 * 搴忓彿楂樹寒瑁呴グ鍣?- 鍖归厤鍚勭鏍煎紡鐨勫簭鍙?
 * 涓鸿繖浜涘簭鍙锋坊鍔犱富棰橀鑹?
 */
const numberingMark = Decoration.mark({ class: 'cm-numbering' });

/**
 * 鏋勫缓搴忓彿楂樹寒瑁呴グ鍣?
 * 鍖归厤琛岄锛堝彲鑳芥湁缂╄繘锛夌殑搴忓彿鏍煎紡锛?
 * - 鍗曚釜鏁板瓧鍔犵偣锛堝 1.銆?.銆?0.锛?
 * - 鏁板瓧.鏁板瓧 鎴栨洿澶氬眰绾э紙濡?4.2銆?.2.1銆?.2.1.1锛?
 * - 鍗曚釜澶у啓瀛楁瘝鍔犵偣锛堝 A.銆丅.銆丆.锛?
 * - 鍗曚釜灏忓啓瀛楁瘝鍔犵偣锛堝 a.銆乥.銆乧.锛?
 * - 瀛楁瘝+鏁板瓧鍔犵偣锛堝 A1.銆丄100.銆丅2.锛?
 * - 涓枃鏁板瓧搴忓彿锛堝 涓€銆佷簩銆佷笁銆侊級
 * - 鍦嗙偣鏃犲簭鍒楄〃锛堝 鈥級
 */
function buildNumberingDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number }[] = [];
  const doc = state.doc;

  // 鍖归厤搴忓彿鏍煎紡锛?
  // 1. 鍗曚釜鏁板瓧鍔犵偣锛堝 1.銆?.銆?0.銆?00.锛?
  // 2. 鏁板瓧.鏁板瓧 鎴栨洿澶氬眰绾э紙濡?4.2銆?.2.1銆?.2.1.1锛?
  // 3. 鍗曚釜瀛楁瘝鍔犵偣锛堝 A.銆丅.銆乤.銆乥.锛?
  // 4. 瀛楁瘝+鏁板瓧鍔犵偣锛堝 A1.銆丄100.銆丅2.锛?
  // 5. 涓枃鏁板瓧搴忓彿锛堝 涓€銆佷簩銆佷笁銆佸崄銆佺櫨锛?
  // 6. 鍦嗙偣鏃犲簭鍒楄〃锛堝 鈥級
  // 搴忓彿蹇呴』鍦ㄨ棣栵紙鍙兘鏈夌缉杩涚┖鏍硷級锛屽悗闈㈣窡绌烘牸鎴栧叾浠栧唴瀹?
  const numberingRegex = /^(\s*)(\d+\.|[A-Za-z]\.|[A-Za-z]\d{1,3}\.|[一二三四五六七八九十百千万零]+、|\d+(?:\.\d+)+)\s/;
  
  // 寰呭姙娓呭崟姝ｅ垯锛氳烦杩?鈥?[ ] 鎴?鈥?[x] 鏍煎紡
  const todoRegex = /^[\t ]*[-*+•]\s\[[ xX]\](\s|$)/;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    
    // 璺宠繃寰呭姙娓呭崟琛?
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
 * 搴忓彿楂樹寒 StateField
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
// 鏂囨湰棰滆壊绯荤粺 - 绾?StateField + Decoration 鏂规锛堜笉浣跨敤姝ｅ垯锛?
// ============================================================================

/**
 * 棰滆壊鏍囪鏁版嵁缁撴瀯
 */
interface ColorMark {
  from: number;
  to: number;
  bgColor?: string;
  textColor?: string;
}

/**
 * 娣诲姞/鏇存柊棰滆壊鐨?StateEffect
 */
const addColorEffect = StateEffect.define<ColorMark>();

/**
 * 娓呴櫎棰滆壊鐨?StateEffect
 */
const clearColorEffect = StateEffect.define<{ from: number; to: number }>();

/**
 * 棰滆壊鏍囪 StateField
 * 瀛樺偍鎵€鏈夋枃鏈鑹蹭俊鎭紝涓嶄緷璧栨枃妗ｄ腑鐨?HTML 鏍囩
 */
const colorMarksField = StateField.define<ColorMark[]>({
  create() {
    return [];
  },
  update(marks, tr) {
    let newMarks = marks;

    // 澶勭悊鏂囨。鍙樺寲 - 鏇存柊鎵€鏈夋爣璁扮殑浣嶇疆
    if (tr.docChanged) {
      newMarks = marks
        .map(mark => {
          // 浣跨敤 mapPos 鏇存柊浣嶇疆
          const newFrom = tr.changes.mapPos(mark.from, 1);
          const newTo = tr.changes.mapPos(mark.to, -1);
          // 濡傛灉鑼冨洿鏃犳晥锛堣鍒犻櫎锛夛紝杩斿洖 null
          if (newFrom >= newTo) {
            return null;
          }
          return { ...mark, from: newFrom, to: newTo };
        })
        .filter((mark): mark is ColorMark => mark !== null);
    }

    // 澶勭悊棰滆壊鏁堟灉
    for (const effect of tr.effects) {
      if (effect.is(addColorEffect)) {
        const newMark = effect.value;
        // 鏌ユ壘鎵€鏈夐噸鍙犵殑鏍囪
        const overlappingMarks = newMarks.filter(
          m => !(m.to <= newMark.from || m.from >= newMark.to)
        );

        if (overlappingMarks.length > 0) {
          // 绉婚櫎鎵€鏈夐噸鍙犵殑鏍囪
          newMarks = newMarks.filter(
            m => m.to <= newMark.from || m.from >= newMark.to
          );

          // 澶勭悊姣忎釜閲嶅彔鏍囪锛屽彲鑳介渶瑕佸垎鍓?
          for (const existing of overlappingMarks) {
            // 濡傛灉鏃ф爣璁板湪鏂版爣璁颁箣鍓嶆湁閮ㄥ垎
            if (existing.from < newMark.from) {
              newMarks.push({
                from: existing.from,
                to: newMark.from,
                bgColor: existing.bgColor,
                textColor: existing.textColor,
              });
            }
            // 濡傛灉鏃ф爣璁板湪鏂版爣璁颁箣鍚庢湁閮ㄥ垎
            if (existing.to > newMark.to) {
              newMarks.push({
                from: newMark.to,
                to: existing.to,
                bgColor: existing.bgColor,
                textColor: existing.textColor,
              });
            }
          }

          // 鍚堝苟棰滆壊锛氭柊鏍囪浣跨敤鏂伴鑹诧紝淇濈暀鏃ф爣璁颁腑鏈瑕嗙洊鐨勯鑹?
          const firstOverlap = overlappingMarks[0];
          const merged: ColorMark = {
            from: newMark.from,
            to: newMark.to,
            bgColor: newMark.bgColor !== undefined ? newMark.bgColor : firstOverlap.bgColor,
            textColor: newMark.textColor !== undefined ? newMark.textColor : firstOverlap.textColor,
          };
          newMarks.push(merged);
        } else {
          // 娣诲姞鏂版爣璁?
          newMarks = [...newMarks, newMark];
        }
      } else if (effect.is(clearColorEffect)) {
        const { from, to } = effect.value;
        // 绉婚櫎鑼冨洿鍐呯殑鏍囪
        newMarks = newMarks.filter(m => m.to <= from || m.from >= to);
      }
    }

    return newMarks;
  },
});

/**
 * 棰勮鑼冨洿鏁版嵁 - 鐢ㄤ簬鍦ㄩ瑙堟椂鏆傛椂闅愯棌宸叉湁鑳屾櫙鑹?
 */
interface PreviewRange {
  from: number;
  to: number;
  type: 'color' | 'background-color';
}

/**
 * 璁剧疆棰勮鑼冨洿鐨?StateEffect
 */
const setPreviewRangeEffect = StateEffect.define<PreviewRange | null>();

/**
 * 棰勮鑼冨洿 StateField
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
 * 浠?ColorMark 鏁扮粍鐢熸垚 DecorationSet
 * @param marks 棰滆壊鏍囪鏁扮粍
 * @param previewRange 棰勮鑼冨洿锛堝鏋滄湁锛屽垯鍦ㄨ鑼冨洿鍐呴殣钘忓搴旂被鍨嬬殑棰滆壊锛?
 */
function buildColorDecorations(
  marks: ColorMark[],
  previewRange: PreviewRange | null
): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const mark of marks) {
    // 妫€鏌ユ槸鍚︿笌棰勮鑼冨洿閲嶅彔
    const overlapsPreview =
      previewRange &&
      !(mark.to <= previewRange.from || mark.from >= previewRange.to);

    if (overlapsPreview && previewRange) {
      // 闇€瑕佸垎鍓叉爣璁帮細棰勮鑼冨洿鍐呴殣钘忓搴旈鑹诧紝鑼冨洿澶栦繚鎸佸師鏍?
      
      // 1. 棰勮鑼冨洿涔嬪墠鐨勯儴鍒嗭紙淇濇寔鍘熸牱锛?
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

      // 2. 棰勮鑼冨洿鍐呯殑閮ㄥ垎锛堥殣钘忓搴旂被鍨嬬殑棰滆壊锛?
      const overlapFrom = Math.max(mark.from, previewRange.from);
      const overlapTo = Math.min(mark.to, previewRange.to);
      if (overlapFrom < overlapTo) {
        const styleAttrs: string[] = [];
        // 鍙繚鐣欎笉琚瑙堢殑棰滆壊绫诲瀷
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

      // 3. 棰勮鑼冨洿涔嬪悗鐨勯儴鍒嗭紙淇濇寔鍘熸牱锛?
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
      // 涓嶄笌棰勮鑼冨洿閲嶅彔锛屾甯告樉绀?
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

  // 鎸変綅缃帓搴?
  decorations.sort((a, b) => a.from - b.from);

  return Decoration.set(decorations);
}

/**
 * 棰滆壊瑁呴グ鍣?StateField
 * 浠?colorMarksField 鐢熸垚瑁呴グ鍣?
 */
const colorDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildColorDecorations(state.field(colorMarksField), null);
  },
  update(decorations, tr) {
    // 濡傛灉鏈夐鑹茬浉鍏崇殑鏁堟灉銆佹枃妗ｅ彉鍖栨垨棰勮鑼冨洿鍙樺寲锛岄噸鏂版瀯寤鸿楗板櫒
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
 * 鍒╃敤璇硶鏍戝垽鏂綅缃槸鍚﹀湪 Markdown 鏍囪鍐咃紙鏍囬銆佸垪琛ㄦ爣璁扮瓑锛?
 * 杩欎簺浣嶇疆涓嶅簲璇ュ簲鐢ㄩ鑹?
 */
function isInMarkdownSyntax(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);

  // 閬嶅巻鑺傜偣鍙婂叾鐖惰妭鐐?
  while (node) {
    const name = node.type.name;
    // 妫€鏌ユ槸鍚︽槸 Markdown 璇硶鏍囪
    if (
      name === 'HeaderMark' ||      // # ## ### 绛?
      name === 'ListMark' ||        // - * + 1. 绛?
      name === 'QuoteMark' ||       // >
      name === 'CodeMark' ||        // ` ```
      name === 'EmphasisMark' ||    // * _ ** __
      name === 'LinkMark' ||        // [ ] ( )
      name === 'URL'                // 閾炬帴 URL
    ) {
      return true;
    }
    if (!node.parent || node.parent === node) break;
    node = node.parent;
  }

  return false;
}

/**
 * 鑾峰彇琛岄鐨?Markdown 鏍囪缁撴潫浣嶇疆
 * 杩斿洖鍐呭寮€濮嬬殑浣嶇疆锛堣烦杩囨爣棰樼鍙枫€佸垪琛ㄦ爣璁扮瓑锛?
 * 鏀寔澶氱搴忓彿鏍煎紡锛?
 * - 鏍囧噯 Markdown锛? ## - * + 1. 绛?
 * - 澶氱骇鏁板瓧锛?.1銆?.2.1銆?.1 绛?
 * - 瀛楁瘝搴忓彿锛欰. B. a. b. A1. B2. 绛?
 * - 瀛楁瘝+鏁板瓧娣峰悎锛欰1銆丅2銆丄1.1 绛?
 * - 涓枃搴忓彿锛氫竴銆佷簩銆佷笁銆佺瓑
 * - 鏀寔浠绘剰缂╄繘锛堢┖鏍兼垨 TAB锛?
 */
function getContentStartPos(state: EditorState, lineFrom: number): number {
  const line = state.doc.lineAt(lineFrom);
  const tree = syntaxTree(state);
  const lineText = line.text;

  // 浠庤棣栧紑濮嬫煡鎵?
  let contentStart = line.from;

  // 鍏堢敤璇硶鏍戞娴嬫爣鍑?Markdown 鏍囪
  // 澧炲姞妫€娴嬭寖鍥翠互鏀寔娣卞害缂╄繘
  tree.iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      // 濡傛灉鏄爣璁拌妭鐐?
      if (
        node.type.name === 'HeaderMark' ||
        node.type.name === 'ListMark' ||
        node.type.name === 'QuoteMark'
      ) {
        // 鍐呭浠庢爣璁板悗闈㈠紑濮?
        contentStart = Math.max(contentStart, node.to);
        // 璺宠繃鏍囪鍚庣殑绌烘牸
        const text = state.doc.sliceString(node.to, Math.min(node.to + 2, line.to));
        if (text.startsWith(' ')) {
          contentStart = node.to + 1;
        }
      }
    },
  });

  // 棰濆妫€娴嬪悇绉嶅簭鍙锋牸寮忥紙璇硶鏍戝彲鑳戒笉璇嗗埆锛?
  // 浣跨敤 [\t ]* 鏄庣‘鍖归厤 TAB 鍜岀┖鏍?
  const listPatterns = [
    // 澶氱骇鏁板瓧搴忓彿锛?.1銆?.2.1銆?.1.2 绛夛紙鏀寔浠绘剰缂╄繘锛?
    /^([\t ]*)((\d+\.)+\d*\s+)/,
    // 鍗曚釜鏁板瓧搴忓彿锛?. 2. 10. 绛夛紙鏀寔浠绘剰缂╄繘锛?
    /^([\t ]*)(\d+\.\s+)/,
    // 瀛楁瘝+鏁板瓧+澶氱骇锛欰1.1銆丅2.3 绛?
    /^([\t ]*)([A-Za-z]\d+(?:\.\d+)*\.?\s+)/,
    // 瀛楁瘝+鏁板瓧搴忓彿锛欰1銆丅2銆丄1.銆丅2. 绛?
    /^([\t ]*)([A-Za-z]\d+\.?\s+)/,
    // 鍗曞瓧姣嶅簭鍙凤細A. B. a. b. 绛?
    /^([\t ]*)([A-Za-z]\.\s+)/,
    // 涓枃搴忓彿锛氫竴銆佷簩銆佷笁銆佺瓑
    /^([\t ]*)([一二三四五六七八九十百千万零]+、\s*)/,
    // 鏃犲簭鍒楄〃绗﹀彿锛? * + 鈥?
    /^([\t ]*)([-*+•]\s+)/,
    // 鏍囬绗﹀彿锛? ## ### 绛?
    /^([\t ]*)(#{1,6}\s+)/,
  ];

  for (const regex of listPatterns) {
    const match = lineText.match(regex);
    if (match) {
      const matchEnd = line.from + match[0].length;
      contentStart = Math.max(contentStart, matchEnd);
      break; // 鍖归厤鍒颁竴涓氨鍋滄
    }
  }

  return contentStart;
}

/**
 * 璺宠繃鏂囨湰棣栧熬鐨勭┖鐧藉瓧绗︼紝杩斿洖瀹為檯鍐呭鐨勮寖鍥?
 */
function trimTextRange(
  state: EditorState,
  from: number,
  to: number
): { from: number; to: number } {
  const text = state.sliceDoc(from, to);
  
  // 璁＄畻鍓嶅绌虹櫧
  let leadingSpaces = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' || text[i] === '\t') {
      leadingSpaces++;
    } else {
      break;
    }
  }
  
  // 璁＄畻灏鹃儴绌虹櫧
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
 * 搴旂敤棰滆壊鏍峰紡鍒伴€変腑鏂囨湰锛堢函 StateField 鏂规锛?
 * @param view EditorView 瀹炰緥
 * @param styleType 鏍峰紡绫诲瀷锛?color' 鎴?'background-color'
 * @param newColor 鏂扮殑棰滆壊鍊?
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
    // 娌℃湁閫変腑鏂囨湰锛岄€変腑鏁磋鍐呭锛堣烦杩?Markdown 鏍囪锛?
    const line = view.state.doc.lineAt(from);
    targetFrom = getContentStartPos(view.state, line.from);
    targetTo = line.to;
  } else {
    targetFrom = from;
    targetTo = to;

    // 妫€鏌ラ€夊尯璧峰浣嶇疆鏄惁鍦?Markdown 鏍囪鍐?
    const startLine = view.state.doc.lineAt(from);
    const contentStart = getContentStartPos(view.state, startLine.from);
    if (targetFrom < contentStart) {
      targetFrom = contentStart;
    }
  }

  // 璺宠繃棣栧熬绌虹櫧
  const trimmed = trimTextRange(view.state, targetFrom, targetTo);
  targetFrom = trimmed.from;
  targetTo = trimmed.to;

  // 濡傛灉鑼冨洿鏃犳晥锛岀洿鎺ヨ繑鍥?
  if (targetFrom >= targetTo) {
    return;
  }

  // 妫€鏌ユ槸鍚﹀寘鍚琛?
  const targetText = view.state.sliceDoc(targetFrom, targetTo);
  const hasMultipleLines = targetText.includes('\n');

  if (hasMultipleLines) {
    // 澶氳澶勭悊锛氬姣忎竴琛屽垎鍒簲鐢ㄩ鑹?
    const doc = view.state.doc;
    const startLine = doc.lineAt(targetFrom);
    const endLine = doc.lineAt(targetTo);
    const effects: StateEffect<ColorMark>[] = [];

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = doc.line(lineNum);
      let lineFrom = line.from;
      let lineTo = line.to;

      // 濡傛灉鏄涓€琛岋紝浠庨€変腑浣嶇疆寮€濮?
      if (lineNum === startLine.number) {
        lineFrom = Math.max(targetFrom, line.from);
      }
      // 濡傛灉鏄渶鍚庝竴琛岋紝鍒伴€変腑浣嶇疆缁撴潫
      if (lineNum === endLine.number) {
        lineTo = Math.min(targetTo, line.to);
      }

      // 璺宠繃 Markdown 鏍囪
      const contentStart = getContentStartPos(view.state, line.from);
      if (lineFrom < contentStart) {
        lineFrom = contentStart;
      }

      // 璺宠繃棣栧熬绌虹櫧
      const lineTrimmed = trimTextRange(view.state, lineFrom, lineTo);
      lineFrom = lineTrimmed.from;
      lineTo = lineTrimmed.to;

      // 濡傛灉杩欎竴琛屾病鏈夊唴瀹癸紝璺宠繃
      if (lineFrom >= lineTo) {
        continue;
      }

      // 鏌ユ壘宸叉湁鐨勯鑹叉爣璁帮紙鏌ユ壘涓庢柊鑼冨洿閲嶅彔鐨勬墍鏈夋爣璁帮紝鍚堝苟瀹冧滑鐨勯鑹诧級
      const existingMarks = view.state.field(colorMarksField);
      const overlappingMarks = existingMarks.filter(
        m => !(m.to <= lineFrom || m.from >= lineTo)
      );

      // 浠庢墍鏈夐噸鍙犳爣璁颁腑鏀堕泦棰滆壊
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

      // 鍒涘缓鏂扮殑棰滆壊鏍囪
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

  // 鍗曡澶勭悊
  // 鏌ユ壘宸叉湁鐨勯鑹叉爣璁帮紙鏌ユ壘涓庢柊鑼冨洿閲嶅彔鐨勬墍鏈夋爣璁帮紝鍚堝苟瀹冧滑鐨勯鑹诧級
  const existingMarks = view.state.field(colorMarksField);
  const overlappingMarks = existingMarks.filter(
    m => !(m.to <= targetFrom || m.from >= targetTo)
  );

  // 浠庢墍鏈夐噸鍙犳爣璁颁腑鏀堕泦棰滆壊
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

  // 鍒涘缓鏂扮殑棰滆壊鏍囪
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
 * 鑾峰彇褰撳墠閫変腑鏂囨湰鐨勭幇鏈夐鑹?
 * @param view EditorView 瀹炰緥
 * @param styleType 鏍峰紡绫诲瀷锛?color' 鎴?'background-color'
 * @returns 鐜版湁棰滆壊鍊硷紝濡傛灉娌℃湁鍒欒繑鍥?undefined
 */
function getExistingColor(
  view: EditorView,
  styleType: 'color' | 'background-color'
): string | undefined {
  const { from, to } = view.state.selection.main;
  const marks = view.state.field(colorMarksField);

  // 鏌ユ壘鍖呭惈閫夊尯鐨勯鑹叉爣璁?
  const mark = marks.find(m => m.from <= from && m.to >= to);

  if (mark) {
    return styleType === 'background-color' ? mark.bgColor : mark.textColor;
  }

  return undefined;
}

/**
 * 棰滆壊棰勮 StateEffect - 鐢ㄤ簬鏇存柊棰勮瑁呴グ鍣?
 */
interface ColorPreviewData {
  type: 'color' | 'background-color';
  color: string;
  from: number;
  to: number;
}

const setColorPreviewEffect = StateEffect.define<ColorPreviewData | null>();

/**
 * 棰滆壊棰勮瑁呴グ鍣?StateField
 * 鐢ㄤ簬鍦ㄦ嫋鍔ㄩ鑹查€夋嫨鍣ㄦ椂鏄剧ず涓存椂棰勮鏁堟灉
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
 * 缂╄繘绾?Widget - 鏄剧ず缂╄繘灞傜骇鐨勫瀭鐩寸嚎
 * 鍙樉绀轰竴鏉＄缉杩涚嚎锛屼笌鐖剁骇鎶樺彔鍥炬爣瀵归綈
 */
class IndentGuideWidget extends WidgetType {
  constructor(readonly indentLevel: number, readonly hasFoldIcon: boolean = false) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-indent-guides';
    
    // 鑾峰彇涓婚缂╄繘绾块鑹?
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--ws-mirrorIndentGuide-background')
      .trim();
    
    // 妫€娴嬫槸鍚︽槸鏆楄壊涓婚
    const isDarkTheme = document.body.classList.contains('ws-theme-dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    
    // 纭畾鏈€缁堥鑹?
    let finalColor: string;
    if (themeColor) {
      // 妫€娴嬮鑹叉槸鍚﹀凡鍖呭惈閫忔槑搴?
      const hasAlpha = themeColor.includes('rgba') || 
        themeColor.includes('hsla') ||
        (themeColor.startsWith('#') && themeColor.length === 9);
      
      if (hasAlpha) {
        // 宸叉湁閫忔槑搴︼紝鐩存帴浣跨敤涓婚棰滆壊
        finalColor = themeColor;
      } else {
        // 娌℃湁閫忔槑搴︼紝灏濊瘯瑙ｆ瀽 RGB 鍊煎苟娣诲姞 0.6 閫忔槑搴?
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
          // 鏃犳硶瑙ｆ瀽锛屼娇鐢ㄩ粯璁ら鑹?
          finalColor = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
        }
      }
    } else {
      // 娌℃湁涓婚棰滆壊锛屼娇鐢ㄩ粯璁ら鑹?
      finalColor = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
    }
    
    // 鍙垱寤轰竴鏉＄缉杩涚嚎锛屼綅缃笌鐖剁骇鎶樺彔鍥炬爣瀵归綈
    // 鎶樺彔鍥炬爣浣嶇疆璁＄畻锛堟潵鑷?ListFoldWidget锛夛細
    // - indent=0 鏃讹細left = -24px
    // - indent>0 鏃讹細left = (indent - 1) * 8 - 8
    // 鎶樺彔鍥炬爣瀹藉害 20px锛屼腑蹇冨湪 left + 10
    // 
    // 褰撳墠琛岀殑 indentLevel 琛ㄧず缂╄繘绾у埆锛堟瘡绾?2 绌烘牸锛?
    // 鐖剁骇鐨勭缉杩涚骇鍒?= indentLevel - 1
    // 鐖剁骇鐨勭┖鏍兼暟 = (indentLevel - 1) * 2
    if (this.indentLevel >= 1) {
      const guide = document.createElement('span');
      guide.className = 'cm-indent-guide cm-indent-guide-single';
      
      // 鐖剁骇鐨勭┖鏍兼暟
      const parentSpaces = (this.indentLevel - 1) * 2;
      // 鐖剁骇鎶樺彔鍥炬爣鐨?left 浣嶇疆
      const foldIconLeft = parentSpaces > 0 ? (parentSpaces - 1) * 8 - 8 : -24;
      // 缂╄繘绾夸綅缃?= 鎶樺彔鍥炬爣宸﹁竟 + 5px锛堟姌鍙犲浘鏍囦腑蹇冨亸宸︿竴鐐癸級
      const leftPos = foldIconLeft + 5;
      
      guide.style.left = `${leftPos}px`;
      guide.style.backgroundColor = finalColor;
      guide.style.top = '0';
      
      container.appendChild(guide);
    }
    
    return container;
  }

  eq(_other: IndentGuideWidget): boolean {
    // 寮哄埗閲嶆柊娓叉煋浠ュ簲鐢ㄦ柊鐨勪綅缃绠?
    return false;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 鏋勫缓缂╄繘绾胯楗板櫒
 * 瑙勫垯锛氭渶灏戠缉杩?涓┖鏍硷紙鎴?涓猼ab锛夋墠鏄剧ず缂╄繘绾?
 */
function buildIndentGuideDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; decoration: Decoration }[] = [];
  
  try {
    const doc = state.doc;
    const TAB_SIZE = 2; // 1涓猼ab = 2涓┖鏍硷紙涓庣紪杈戝櫒 indentUnit 涓€鑷达級

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const lineText = line.text;
      
      // 璺宠繃鏍囬琛?
      if (getHeadingLevel(lineText) > 0) continue;
      
      // 璁＄畻缂╄繘绾у埆锛堟瘡2涓┖鏍兼垨1涓猼ab涓轰竴绾э級
      let indent = getIndentLevel(lineText);
      
      // 濡傛灉鏄┖琛岋紝鏍规嵁涓婁笅鏂囩‘瀹氱缉杩涚骇鍒?
      if (lineText.trim().length === 0) {
        // 鍚戜笂鏌ユ壘鏈€杩戠殑闈炵┖琛屾潵纭畾涓婁笅鏂囩缉杩?
        for (let j = i - 1; j >= 1; j--) {
          const prevLine = doc.line(j);
          if (prevLine.text.trim().length > 0) {
            indent = getIndentLevel(prevLine.text);
            break;
          }
        }
      }
      
      const indentLevel = Math.floor(indent / TAB_SIZE);
      
      // 妫€娴嬭琛屾槸鍚︽湁瀛愭姌鍙犲浘鏍囷紙闈炴爣棰樿涓旀湁瀛愮缉杩涘唴瀹癸級
      const hasFoldIcon = computeListFoldRange(state, line.from) !== null;
      
      // 鍙鏈夌缉杩涘氨鍒涘缓缂╄繘绾匡紙indentLevel >= 1锛?
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
 * 缂╄繘绾胯楗板櫒 StateField
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
 * 鏌ユ壘鍖呭惈褰撳墠琛岀殑鎶樺彔缁勶紙鐖惰 + 鎵€鏈夊瓙琛?+ 绌鸿锛?
 * 鐖惰鏄缉杩涙瘮褰撳墠琛屽皯鐨勬渶杩戦潪绌鸿
 * 杩斿洖 { parentLine: 鐖惰鍙? childLines: 瀛愯鍙锋暟缁勶紙鍖呭惈绌鸿锛?} 鎴?null
 */
function findFoldGroup(state: EditorState, lineNumber: number): { parentLine: number; childLines: number[] } | null {
  const currentLine = state.doc.line(lineNumber);
  let currentIndent = getIndentLevel(currentLine.text);
  const totalLines = state.doc.lines;
  
  // 鏍囬琛屼笉鍙備笌鎶樺彔缁?
  if (getHeadingLevel(currentLine.text) > 0) return null;
  
  // 濡傛灉鏄┖琛岋紝灏濊瘯鏍规嵁涓婁笅鏂囩‘瀹氱缉杩涚骇鍒?
  if (currentLine.text.trim().length === 0) {
    // 鍚戜笂鏌ユ壘鏈€杩戠殑闈炵┖琛屾潵纭畾涓婁笅鏂?
    let contextIndent = -1;
    let contextIsHeading = false;
    for (let i = lineNumber - 1; i >= 1; i--) {
      const line = state.doc.line(i);
      if (line.text.trim().length > 0) {
        // 濡傛灉涓婁笅鏂囨槸鏍囬琛岋紝涓嶆樉绀虹缉杩涚嚎
        if (getHeadingLevel(line.text) > 0) {
          contextIsHeading = true;
        }
        contextIndent = getIndentLevel(line.text);
        break;
      }
    }
    
    if (contextIndent < 0 || contextIsHeading) return null;
    
    // 浣跨敤涓婁笅鏂囩缉杩涗綔涓哄綋鍓嶇缉杩?
    currentIndent = contextIndent;
  }
  
  // 鎯呭喌1锛氬綋鍓嶈鏄埗琛岋紙鏈夊瓙琛岋級
  // 鍚戜笅鏌ユ壘鏄惁鏈夌缉杩涙瘮褰撳墠琛屽鐨勮
  const childLines: number[] = [];
  let hasRealChild = false;
  
  for (let i = lineNumber + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    // 绌鸿涔熸敹闆嗭紙濡傛灉鍦ㄥ瓙琛屽尯鍩熷唴锛?
    if (line.text.trim().length === 0) {
      childLines.push(i);
      continue;
    }
    
    // 濡傛灉缂╄繘灏忎簬绛変簬褰撳墠琛岋紝璇存槑宸茬粡绂诲紑浜嗗瓙琛屽尯鍩?
    if (lineIndent <= currentIndent) {
      break;
    }
    
    // 鏀堕泦鎵€鏈夌缉杩涙瘮褰撳墠琛屽鐨勮浣滀负瀛愯
    childLines.push(i);
    hasRealChild = true;
  }
  
  if (hasRealChild) {
    return { parentLine: lineNumber, childLines };
  }
  
  // 鎯呭喌2锛氬綋鍓嶈鏄瓙琛岋紝闇€瑕佹壘鍒扮埗琛?
  // 鐖惰鏄缉杩涙瘮褰撳墠琛屽皯鐨勬渶杩戦潪绌鸿锛堜笖涓嶆槸鏍囬琛岋級
  if (currentIndent <= 0) return null;
  
  let parentLine: number | null = null;
  let parentIndent = -1;
  
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    if (line.text.trim().length === 0) continue;
    
    // 璺宠繃鏍囬琛岋紝鏍囬琛屼笉鑳戒綔涓烘姌鍙犵粍鐨勭埗琛?
    if (getHeadingLevel(line.text) > 0) continue;
    
    // 鎵惧埌缂╄繘姣斿綋鍓嶈灏戠殑琛屼綔涓虹埗琛?
    if (lineIndent < currentIndent) {
      parentLine = i;
      parentIndent = lineIndent;
      break;
    }
  }
  
  if (parentLine === null) return null;
  
  // 楠岃瘉鐖惰鏄惁鐪熺殑鏈夊瓙琛岋紙鍗虫湁鎶樺彔鍔熻兘锛?
  // 妫€鏌ョ埗琛屼笅闈㈡槸鍚︽湁缂╄繘鏇村鐨勯潪绌鸿
  let parentHasRealChildren = false;
  for (let i = parentLine + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    if (line.text.trim().length === 0) continue;
    
    if (lineIndent <= parentIndent) break;
    
    // 鎵惧埌浜嗙缉杩涙洿澶氱殑闈炵┖琛岋紝璇存槑鐖惰鏈夊瓙琛?
    parentHasRealChildren = true;
    break;
  }
  
  if (!parentHasRealChildren) return null;
  
  // 鎵惧埌鐖惰鍚庯紝鏀堕泦鎵€鏈夊瓙琛屽拰绌鸿
  const allChildLines: number[] = [];
  for (let i = parentLine + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    // 绌鸿涔熸敹闆?
    if (line.text.trim().length === 0) {
      allChildLines.push(i);
      continue;
    }
    
    // 濡傛灉缂╄繘灏忎簬绛変簬鐖惰锛岃鏄庡凡缁忕寮€浜嗗瓙琛屽尯鍩?
    if (lineIndent <= parentIndent) {
      break;
    }
    
    // 鏀堕泦鎵€鏈夌缉杩涙瘮鐖惰澶氱殑琛?
    allChildLines.push(i);
  }
  
  return { parentLine, childLines: allChildLines };
}

// 鎶樺彔缁勯珮浜殑琛岃楗板櫒
const foldParentHighlight = Decoration.line({ class: 'cm-fold-parent-highlighted' });

/**
 * 鎶樺彔缁勭缉杩涚嚎 Widget
 * 浣跨敤 parentIndent 鍦?toDOM 涓姩鎬佽绠椾綅缃?
 */
class FoldIndentLineWidget extends WidgetType {
  constructor(readonly parentIndent: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const line = document.createElement('span');
    line.className = 'cm-fold-indent-line';

    // 鑾峰彇瀹為檯鐨勫瓧绗﹀搴?
    const charWidth = view.defaultCharacterWidth;

    // 璁＄畻缂╄繘绾夸綅缃紙涓庣埗绾ф姌鍙犲浘鏍囧榻愶級
    // 鎶樺彔鍥炬爣浣嶇疆锛歱arentIndent > 0 ? parentIndent * charWidth - 20 : -24
    // 缂╄繘绾垮簲璇ュ湪鎶樺彔鍥炬爣涓績浣嶇疆锛堝浘鏍囧搴?20px锛屼腑蹇冨湪 +10锛?
    let linePos: number;
    if (this.parentIndent > 0) {
      const foldIconLeft = this.parentIndent * charWidth - 20;
      linePos = foldIconLeft + 10; // 鎶樺彔鍥炬爣涓績
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

// 鍒涘缓甯︽湁鐖剁骇缂╄繘淇℃伅鐨勫瓙琛岄珮浜楗板櫒
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
 * 鏋勫缓鎶樺彔缁勯珮浜楗板櫒
 */
function buildFoldGroupDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  
  // 鑾峰彇褰撳墠鍏夋爣鎵€鍦ㄨ
  const selection = state.selection;
  const cursorLine = state.doc.lineAt(selection.main.head).number;
  
  // 鏌ユ壘鎶樺彔缁?
  const foldGroup = findFoldGroup(state, cursorLine);
  
  if (foldGroup) {
    // 鑾峰彇鐖惰鐨勭缉杩涳紙绌烘牸鏁帮級
    const parentLineObj = state.doc.line(foldGroup.parentLine);
    const parentIndent = getIndentLevel(parentLineObj.text);
    
    // 鏀堕泦鎵€鏈夐渶瑕侀珮浜殑琛岋紝鎸変綅缃帓搴?
    const allLines: { from: number; decoration: Decoration }[] = [];
    
    // 鐖惰楂樹寒
    allLines.push({ from: parentLineObj.from, decoration: foldParentHighlight });
    
    // 瀛愯楂樹寒锛堝甫鏈夌缉杩涚嚎 Widget锛?
    for (const childLineNum of foldGroup.childLines) {
      const childLineObj = state.doc.line(childLineNum);
      const childDecorations = createFoldChildDecorations(parentIndent);
      for (const dec of childDecorations) {
        allLines.push({ from: childLineObj.from, decoration: dec });
      }
    }
    
    // 鎸変綅缃帓搴?
    allLines.sort((a, b) => a.from - b.from);
    
    // 娣诲姞鍒?builder
    for (const item of allLines) {
      builder.add(item.from, item.from, item.decoration);
    }
  }
  
  return builder.finish();
}

/**
 * 鎶樺彔缁勯珮浜?StateField
 */
const foldGroupHighlightField = StateField.define<DecorationSet>({
  create(state) {
    return buildFoldGroupDecorations(state);
  },
  update(decorations, tr) {
    // 閫夋嫨鍙樺寲鎴栨枃妗ｅ彉鍖栨椂閲嶆柊璁＄畻
    if (tr.selection || tr.docChanged) {
      return buildFoldGroupDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 鑷畾涔?Markdown 璇硶楂樹寒鏍峰紡
 * 瑕嗙洊榛樿楂樹寒锛岃鏈夊簭鍒楄〃鏁板瓧绛変娇鐢ㄤ富棰橀厤鑹?
 */
const customHighlightStyle = HighlightStyle.define([
  // 鏈夊簭鍒楄〃鏁板瓧鏍囪锛堝 1. 2. 3.锛?
  { tag: tags.processingInstruction, color: 'var(--ws-textLink-foreground)' },
  // 鏍囬
  { tag: tags.heading, color: 'var(--ws-textLink-foreground)', fontWeight: '700' },
  // 寮鸿皟
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  // 閾炬帴
  { tag: tags.link, color: 'var(--ws-textLink-foreground)' },
  { tag: tags.url, color: 'var(--ws-textLink-foreground)' },
  // 寮曠敤
  { tag: tags.quote, color: 'var(--ws-descriptionForeground)', fontStyle: 'italic' },
  // 浠ｇ爜 - 浣跨敤鏅€氭枃鏈鑹诧紝閬垮厤缂╄繘瓒呰繃4绌烘牸鏃堕鑹插彉鍖?
  { tag: tags.monospace, color: 'inherit' },
  // 娉ㄩ噴
  { tag: tags.comment, color: 'var(--ws-descriptionForeground)' },
  // 鍏冧俊鎭紙濡?> 寮曠敤鏍囪锛?
  { tag: tags.meta, color: 'var(--ws-textLink-foreground)' },
]);

/**
 * 鑷畾涔夊洖杞﹂敭澶勭悊 - 鏅鸿兘寮曠敤鍧楁崲琛?
 * 1. 鍦ㄥ紩鐢ㄨ鏈熬鎸夊洖杞︽椂锛岃嚜鍔ㄦ坊鍔?> 鍒版柊琛岋紙淇濇寔缂╄繘锛?
 * 2. 濡傛灉褰撳墠琛屽彧鏈?> 锛堟病鏈夊叾浠栧唴瀹癸級锛屾寜鍥炶溅鏃跺垹闄?> 骞堕€€鍑哄紩鐢ㄦā寮?
 */
function handleBlockquoteEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 妫€鏌ユ槸鍚︽槸寮曠敤琛?- 鏀寔琛岄鏈夌┖鏍肩殑鎯呭喌锛圱AB 缂╄繘锛?
  const blockquoteMatch = lineText.match(/^(\s*)(>+)(\s*)/);
  if (!blockquoteMatch) {
    return false; // 涓嶆槸寮曠敤琛岋紝浣跨敤榛樿琛屼负
  }
  
  const indent = blockquoteMatch[1]; // 缂╄繘绌烘牸
  const markers = blockquoteMatch[2]; // > 绗﹀彿
  const spaces = blockquoteMatch[3]; // > 鍚庨潰鐨勭┖鏍?
  const prefixLength = indent.length + markers.length + spaces.length;
  const content = lineText.slice(prefixLength);
  
  // 濡傛灉寮曠敤琛屽彧鏈?> 娌℃湁鍐呭锛堟垨鍙湁绌烘牸锛夛紝鍒犻櫎 > 鏍囪骞堕€€鍑哄紩鐢ㄦā寮?
  if (content.trim() === '') {
    // 鍒犻櫎褰撳墠琛岀殑 > 鏍囪锛屽苟鍦ㄥ墠闈㈡彃鍏ョ┖琛屾潵鏂紑寮曠敤鍧?
    if (line.from > 0) {
      // 涓嶆槸绗竴琛岋細鍒犻櫎褰撳墠琛岋紙鍖呮嫭鍓嶉潰鐨勬崲琛岀锛夛紝鐒跺悗鎻掑叆涓や釜鎹㈣绗?
      view.dispatch({
        changes: { from: line.from - 1, to: line.to, insert: '\n\n' },
        selection: { anchor: line.from + 1 },
      });
    } else {
      // 绗竴琛岋細鐩存帴鍒犻櫎 > 鏍囪
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      });
    }
    return true;
  }
  
  // 鍦ㄥ紩鐢ㄨ鏈熬鎸夊洖杞︼紝鑷姩娣诲姞缂╄繘 + > 鍒版柊琛?
  const level = markers.length;
  const newPrefix = indent + '>'.repeat(level) + ' ';
  
  view.dispatch({
    changes: { from: head, insert: '\n' + newPrefix },
    selection: { anchor: head + 1 + newPrefix.length },
  });
  
  return true;
}

/**
 * 鑷畾涔夊洖杞﹂敭澶勭悊 - 鏅鸿兘寰呭姙娓呭崟鎹㈣
 * 1. 鍦ㄥ緟鍔炴竻鍗曡鏈熬鎸夊洖杞︽椂锛岃嚜鍔ㄦ坊鍔犲緟鍔炴竻鍗曟爣璁板埌鏂拌
 * 2. 濡傛灉褰撳墠琛屽彧鏈夊緟鍔炴竻鍗曟爣璁版病鏈夊唴瀹癸紝鎸夊洖杞︽椂鍒犻櫎鏍囪骞堕€€鍑哄緟鍔炴竻鍗曟ā寮?
 * 鏀寔 - [ ] 鏍煎紡
 */
function handleTodoListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 妫€鏌ユ槸鍚︽槸寰呭姙娓呭崟琛岋紙鏀寔 - [ ] 鎴?- [x] 鎴?鈥?[ ] 鎴?鈥?[x] 鏍煎紡锛?
  const todoMatch = lineText.match(/^(\s*)([-*+•])\s\[[ xX]\]\s?/);
  if (!todoMatch) {
    return false; // 涓嶆槸寰呭姙娓呭崟琛岋紝浣跨敤榛樿琛屼负
  }

  const indent = todoMatch[1];
  // 濮嬬粓浣跨敤 - 浣滀负寰呭姙娓呭崟鏍囪
  const prefix = indent + '- [ ] ';
  const matchedPrefix = todoMatch[0];
  const content = lineText.slice(matchedPrefix.length).trim();

  // 濡傛灉寰呭姙娓呭崟琛屽彧鏈夋爣璁版病鏈夊唴瀹癸紝鍒犻櫎鏍囪骞堕€€鍑哄緟鍔炴竻鍗曟ā寮?
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 鍦ㄥ緟鍔炴竻鍗曡鏈熬鎸夊洖杞︼紝鑷姩娣诲姞寰呭姙娓呭崟鏍囪鍒版柊琛?
  view.dispatch({
    changes: { from: head, insert: '\n' + prefix },
    selection: { anchor: head + 1 + prefix.length },
  });

  return true;
}

/**
 * 鑷畾涔夊洖杞﹂敭澶勭悊 - 鏅鸿兘鏃犲簭鍒楄〃鎹㈣
 * 1. 鍦ㄥ垪琛ㄨ鏈熬鎸夊洖杞︽椂锛岃嚜鍔ㄦ坊鍔犲垪琛ㄦ爣璁板埌鏂拌
 * 2. 濡傛灉褰撳墠琛屽彧鏈夊垪琛ㄦ爣璁版病鏈夊唴瀹癸紝鎸夊洖杞︽椂鍒犻櫎鏍囪骞堕€€鍑哄垪琛ㄦā寮?
 * 鏀寔 -銆?銆?銆佲€?浣滀负鍒楄〃鏍囪
 */
function handleListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 妫€鏌ユ槸鍚︽槸鏃犲簭鍒楄〃琛岋紙鏀寔 -銆?銆?銆佲€?浣滀负鏍囪锛?
  const listMatch = lineText.match(/^(\s*)([-*+•])\s/);
  if (!listMatch) {
    return false; // 涓嶆槸鍒楄〃琛岋紝浣跨敤榛樿琛屼负
  }

  const indent = listMatch[1];
  const marker = listMatch[2];
  const prefix = indent + marker + ' ';
  const content = lineText.slice(prefix.length).trim();

  // 濡傛灉鍒楄〃琛屽彧鏈夋爣璁版病鏈夊唴瀹癸紝鍒犻櫎鏍囪骞堕€€鍑哄垪琛ㄦā寮?
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 鍦ㄥ垪琛ㄨ鏈熬鎸夊洖杞︼紝鑷姩娣诲姞鍒楄〃鏍囪鍒版柊琛?
  view.dispatch({
    changes: { from: head, insert: '\n' + prefix },
    selection: { anchor: head + 1 + prefix.length },
  });

  return true;
}

/**
 * 鑾峰彇涓嬩竴涓瓧姣嶅簭鍙?
 * A -> B, Z -> AA, AA -> AB, AZ -> BA
 */
function getNextLetter(letter: string): string {
  const isUpper = letter === letter.toUpperCase();
  const base = isUpper ? 'A'.charCodeAt(0) : 'a'.charCodeAt(0);
  const chars = letter.toUpperCase().split('');

  // 浠庢渶鍚庝竴涓瓧绗﹀紑濮嬭繘浣?
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
 * 鑷畾涔夊洖杞﹂敭澶勭悊 - 鏅鸿兘瀛楁瘝搴忓彿鎹㈣
 * 1. 鍦ㄥ瓧姣嶅簭鍙疯鏈熬鎸夊洖杞︽椂锛岃嚜鍔ㄦ坊鍔犱笅涓€涓瓧姣嶅簭鍙峰埌鏂拌
 * 2. 濡傛灉褰撳墠琛屽彧鏈夊瓧姣嶅簭鍙锋病鏈夊唴瀹癸紝鎸夊洖杞︽椂鍒犻櫎搴忓彿骞堕€€鍑哄簭鍙锋ā寮?
 */
function handleLetterListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 妫€鏌ユ槸鍚︽槸瀛楁瘝搴忓彿琛岋紙濡?A. B. a. b.锛?
  const letterMatch = lineText.match(/^(\s*)([A-Za-z])\.(\s)/);
  if (!letterMatch) {
    return false; // 涓嶆槸瀛楁瘝搴忓彿琛岋紝浣跨敤榛樿琛屼负
  }

  const indent = letterMatch[1];
  const letter = letterMatch[2];
  const space = letterMatch[3];
  const prefix = indent + letter + '.' + space;
  const content = lineText.slice(prefix.length).trim();

  // 濡傛灉搴忓彿琛屽彧鏈夋爣璁版病鏈夊唴瀹癸紝鍒犻櫎鏍囪骞堕€€鍑哄簭鍙锋ā寮?
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 鍦ㄥ簭鍙疯鏈熬鎸夊洖杞︼紝鑷姩娣诲姞涓嬩竴涓瓧姣嶅簭鍙峰埌鏂拌
  const nextLetter = getNextLetter(letter);
  const newPrefix = indent + nextLetter + '. ';

  view.dispatch({
    changes: { from: head, insert: '\n' + newPrefix },
    selection: { anchor: head + 1 + newPrefix.length },
  });

  return true;
}

/**
 * 鑷畾涔夊洖杞﹂敭澶勭悊 - 淇濇寔缂╄繘
 * 鍦ㄦ湁缂╄繘鐨勮鎸夊洖杞︽椂锛屾柊琛屼繚鎸佺浉鍚岀殑缂╄繘
 */
function handleIndentedEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 鑾峰彇褰撳墠琛岀殑缂╄繘
  const indentMatch = lineText.match(/^(\s+)/);
  if (!indentMatch) {
    return false; // 娌℃湁缂╄繘锛屼娇鐢ㄩ粯璁よ涓?
  }
  
  const indent = indentMatch[1];
  
  // 鍦ㄥ綋鍓嶄綅缃彃鍏ユ崲琛屽拰缂╄繘
  view.dispatch({
    changes: { from: head, insert: '\n' + indent },
    selection: { anchor: head + 1 + indent.length },
  });
  
  return true;
}

/**
 * 鑷畾涔?TAB 閿鐞?- 妫€娴?TAB 缂╄繘鍚庢槸鍚︿細瀵艰嚧鍐呭瓒呭嚭缂栬緫鍣ㄥ搴?
 * 濡傛灉 TAB 缂╄繘鍚庤瀹藉害瓒呭嚭缂栬緫鍣ㄥ搴︼紝鍒欑姝?TAB
 */
function handleTabBoundary(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  
  // 鑾峰彇缂栬緫鍣ㄥ彲鐢ㄥ搴?
  const contentElement = view.dom.querySelector('.cm-content');
  const editorWidth = contentElement?.clientWidth || 800;
  const charWidth = 8; // 浼扮畻姣忎釜瀛楃瀹藉害锛堢瓑瀹藉瓧浣擄級
  const tabWidth = 2 * charWidth; // TAB = 2 绌烘牸
  const maxChars = Math.floor((editorWidth - 40) / charWidth); // 鐣欏嚭涓€浜涜竟璺?
  
  // 妫€鏌ラ€夊尯娑夊強鐨勬墍鏈夎
  const startLine = state.doc.lineAt(selection.main.from);
  const endLine = state.doc.lineAt(selection.main.to);
  
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    // 璁＄畻 TAB 鍚庣殑琛岄暱搴︼紙TAB = 2 绌烘牸锛?
    const newLength = line.text.length + 2;
    if (newLength > maxChars) {
      // 浼氬鑷存崲琛岋紝绂佹 TAB
      return true;
    }
  }
  
  // 鍏佽 TAB锛屼娇鐢ㄩ粯璁よ涓?
  return false;
}

/**
 * 鑷畾涔?Ctrl+X 澶勭悊 - 鍓垏鏁磋鍚庝繚鎸佸厜鏍囧湪缂╄繘浣嶇疆
 * 褰撳壀鍒囨暣琛岋紙鏃犻€夊尯锛夋椂锛?
 * - 濡傛灉涓嬮潰杩樻湁琛岋紝鍏夋爣鐣欏湪涓嬩竴琛岀殑缂╄繘浣嶇疆
 * - 濡傛灉鏄渶鍚庝竴琛岋紝鍏夋爣绉诲埌涓婁竴琛岀殑缂╄繘浣嶇疆
 */
function handleCutLine(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;

  // 鍙鐞嗘棤閫夊尯鐨勬儏鍐碉紙鍓垏鏁磋锛?
  if (!selection.main.empty) {
    return false; // 鏈夐€夊尯锛屼娇鐢ㄩ粯璁よ涓?
  }

  const line = state.doc.lineAt(selection.main.head);
  const lineText = line.text;

  // 澶嶅埗褰撳墠琛屽唴瀹瑰埌鍓创鏉匡紙鍖呭惈鎹㈣绗︼級
  const textToCopy = lineText + '\n';
  navigator.clipboard.writeText(textToCopy);

  // 璁＄畻鍒犻櫎鑼冨洿鍜屽厜鏍囦綅缃?
  let deleteFrom = line.from;
  let deleteTo = line.to;
  let newCursorPos = line.from;

  if (line.number < state.doc.lines) {
    // 涓嶆槸鏈€鍚庝竴琛岋細鍒犻櫎褰撳墠琛岋紙鍖呭惈鎹㈣绗︼級锛屽厜鏍囩暀鍦ㄤ笅涓€琛岀殑缂╄繘浣嶇疆
    deleteTo = line.to + 1;
    const nextLine = state.doc.line(line.number + 1);
    const nextIndent = getIndentLevel(nextLine.text);
    // 鍒犻櫎鍚庯紝涓嬩竴琛屼細鍙樻垚褰撳墠浣嶇疆锛屽厜鏍囨斁鍦ㄧ缉杩涗綅缃?
    newCursorPos = line.from + Math.min(nextIndent, nextLine.text.length);
  } else if (line.number > 1) {
    // 鏄渶鍚庝竴琛屼笖涓嶆槸绗竴琛岋細鍒犻櫎鍓嶉潰鐨勬崲琛岀锛屽厜鏍囩Щ鍒颁笂涓€琛屾湯灏?
    deleteFrom = line.from - 1;
    const prevLine = state.doc.line(line.number - 1);
    newCursorPos = prevLine.to;
  }

  // 鎵ц鍒犻櫎
  view.dispatch({
    changes: { from: deleteFrom, to: deleteTo },
    selection: { anchor: newCursorPos },
  });

  return true;
}

/**
 * 鑷畾涔?Ctrl+- 澶勭悊 - 鍑忓皯鍏夋爣琛屾垨閫変腑琛岀殑缂╄繘
 * 姣忔鍑忓皯 2 涓┖鏍硷紙1 涓?TAB 鍗曚綅锛?
 * 杈圭晫妫€鏌ワ細
 * - 鍗曡鏃讹細濡傛灉褰撳墠琛岀缉杩?< TAB_SIZE锛屼笉鍏佽鍑忓皯
 * - 澶氳鏃讹細濡傛灉浠讳綍闈炵┖琛岀缉杩?< TAB_SIZE锛屼笉鍏佽鍑忓皯
 */
function handleDecreaseIndent(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const TAB_SIZE = 2;

  // 鑾峰彇閫夊尯娑夊強鐨勬墍鏈夎锛堟棤閫夊尯鏃舵槸鍏夋爣鎵€鍦ㄨ锛?
  const startLine = state.doc.lineAt(selection.main.from);
  const endLine = state.doc.lineAt(selection.main.to);
  const isSingleLine = startLine.number === endLine.number;

  if (isSingleLine) {
    // 鍗曡妯″紡锛氬彧澶勭悊褰撳墠琛?
    const line = startLine;
    const lineText = line.text;
    const indent = getIndentLevel(lineText);

    // 濡傛灉娌℃湁缂╄繘锛屼笉鍋氫换浣曟敼鍙?
    if (indent < TAB_SIZE) {
      return true;
    }

    // 鍑忓皯缂╄繘
    const reduceAmount = Math.min(indent, TAB_SIZE);
    view.dispatch({
      changes: { from: line.from, to: line.from + reduceAmount, insert: '' },
    });

    return true;
  }

  // 澶氳妯″紡锛氭鏌ユ墍鏈夎鐨勬渶灏忕缉杩?
  let minIndent = Infinity;
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;
    // 璺宠繃绌鸿
    if (lineText.trim().length === 0) continue;
    const indent = getIndentLevel(lineText);
    minIndent = Math.min(minIndent, indent);
  }

  // 濡傛灉鏈€灏忕缉杩涘皬浜?TAB_SIZE锛屼笉鍏佽鍑忓皯
  if (minIndent < TAB_SIZE) {
    return true;
  }

  const changes: { from: number; to: number; insert: string }[] = [];

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;
    const indent = getIndentLevel(lineText);

    // 濡傛灉娌℃湁缂╄繘鎴栨槸绌鸿锛岃烦杩?
    if (indent === 0 || lineText.trim().length === 0) continue;

    // 鍑忓皯鐨勭┖鏍兼暟
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
 * 鑷畾涔夐敭鐩樻槧灏?- 浣跨敤鏈€楂樹紭鍏堢骇纭繚鍦ㄦ墍鏈夊叾浠栧鐞嗕箣鍓嶆墽琛?
 */
const customKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Backspace',
      run: (view) => {
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;
        
        // 濡傛灉鏈夐€夊尯锛屼娇鐢ㄩ粯璁よ涓?
        if (!selection.main.empty) {
          return false;
        }

        // 妫€鏌ュ厜鏍囧墠闈㈡槸鍚︽槸瑙嗛璇硶
        const doc = state.doc.toString();
        const videoRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
        let match;
        while ((match = videoRegex.exec(doc)) !== null) {
          const videoEnd = match.index + match[0].length;
          // 濡傛灉鍏夋爣绱ч偦瑙嗛璇硶鍚庨潰
          if (head === videoEnd) {
            // 妫€鏌ユ槸鍚︽槸瑙嗛閾炬帴
            const url = match[2];
            const videoInfo = parseVideoUrl(url);
            if (videoInfo) {
              // 鍒犻櫎鏁翠釜瑙嗛璇硶
              view.dispatch({
                changes: { from: match.index, to: videoEnd },
                selection: { anchor: match.index },
              });
              return true;
            }
          }
        }
        
        // 鑾峰彇褰撳墠琛?
        const line = state.doc.lineAt(head);
        const text = line.text;
        const cursorOffset = head - line.from;
        
        // 妫€鏌ユ槸鍚︽槸寰呭姙娓呭崟琛?
        const todoMatch = text.match(/^([\t ]*)([-*+鈥)\s\[([ xX])\](\s|$)/);
        if (!todoMatch) {
          return false; // 涓嶆槸寰呭姙娓呭崟锛屼娇鐢ㄩ粯璁よ涓?
        }
        
        const bracketIndex = text.indexOf('[');
        if (bracketIndex === -1) {
          return false;
        }
        
        // 璁＄畻澶嶉€夋鍖哄煙缁撴潫浣嶇疆锛堝寘鎷?] 鍚庨潰鐨勭┖鏍硷級
        const checkboxEndOffset = bracketIndex + 4; // [ ] 鍔犵┖鏍煎叡4涓瓧绗?
        
        // 濡傛灉鍏夋爣鍦ㄥ閫夋鍖哄煙鍚庨潰锛堝唴瀹瑰尯鍩燂級锛屾甯稿垹闄や竴涓瓧绗?
        if (cursorOffset > checkboxEndOffset) {
          // 浣跨敤榛樿琛屼负鍒犻櫎涓€涓瓧绗?
          return false;
        }
        
        // 濡傛灉鍏夋爣鍦ㄥ閫夋鍖哄煙鍐呮垨绱ч偦澶嶉€夋鍚庨潰锛屾甯稿垹闄や竴涓瓧绗?
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
        // 鍏堝皾璇曞鐞嗗紩鐢ㄥ潡
        if (handleBlockquoteEnter(view)) {
          return true;
        }
        // 灏濊瘯澶勭悊寰呭姙娓呭崟锛堜紭鍏堜簬鏅€氭棤搴忓垪琛級
        if (handleTodoListEnter(view)) {
          return true;
        }
        // 鍐嶅皾璇曞鐞嗘棤搴忓垪琛?
        if (handleListEnter(view)) {
          return true;
        }
        // 灏濊瘯澶勭悊瀛楁瘝搴忓彿鍒楄〃
        if (handleLetterListEnter(view)) {
          return true;
        }
        // 鏈€鍚庡鐞嗘櫘閫氱缉杩涜锛屼繚鎸佺缉杩?
        if (handleIndentedEnter(view)) {
          return true;
        }
        // 浣跨敤榛樿琛屼负
        return false;
      },
    },
    {
      key: 'Tab',
      run: (view) => {
        // 妫€鏌?TAB 鏄惁浼氬鑷村唴瀹硅秴鍑虹紪杈戝櫒瀹藉害
        if (handleTabBoundary(view)) {
          return true; // 绂佹 TAB
        }
        // 浣跨敤榛樿琛屼负
        return false;
      },
    },
    {
      key: 'Mod-x',
      run: (view) => {
        // 鑷畾涔夊壀鍒囨暣琛岃涓猴紝淇濇寔鍏夋爣鍦ㄧ缉杩涗綅缃?
        return handleCutLine(view);
      },
    },
    {
      key: 'Mod--',
      run: (view) => {
        // 鍑忓皯閫変腑琛岀殑缂╄繘
        return handleDecreaseIndent(view);
      },
    },
    {
      key: ' ',
      run: (view) => {
        // 妫€鏌ユ槸鍚﹂渶瑕佸皢 "- " 杞崲涓?"鈥?"
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;

        // 鑾峰彇褰撳墠琛?
        const line = state.doc.lineAt(head);
        const textBeforeCursor = line.text.slice(0, head - line.from);
        const textAfterCursor = line.text.slice(head - line.from);

        // 妫€鏌ユ槸鍚︽槸寰呭姙娓呭崟鏍煎紡 "- [ ]" 鎴?"鈥?[ ]" 鍚庨潰杈撳叆绌烘牸
        // 鐢变簬 ] 鍚庨潰鏈韩灏辨湁绌烘牸锛屾墍浠ヤ笉闇€瑕佹彃鍏ョ┖鏍硷紝鍙渶瑕佺Щ鍔ㄥ厜鏍囧埌绌烘牸鍚庨潰
        if (/^[\t ]*[-鈥\s\[[ xX]\]$/.test(textBeforeCursor)) {
          // 妫€鏌ュ厜鏍囧悗闈㈡槸鍚﹀凡缁忔湁绌烘牸
          if (textAfterCursor.startsWith(' ')) {
            // 宸茬粡鏈夌┖鏍硷紝鍙Щ鍔ㄥ厜鏍?
            view.dispatch({
              selection: { anchor: head + 1 },
            });
          } else {
            // 娌℃湁绌烘牸锛屾彃鍏ョ┖鏍?
            view.dispatch({
              changes: { from: head, insert: ' ' },
              selection: { anchor: head + 1 },
            });
          }
          return true;
        }

        // 妫€鏌ユ槸鍚﹀尮閰?"缂╄繘 + -" 鐨勬ā寮?
        if (/^\s*-$/.test(textBeforeCursor)) {
          // 妫€鏌ュ厜鏍囧悗闈㈡槸鍚︽槸寰呭姙娓呭崟鏍煎紡 [ ] 鎴?[x]
          // 濡傛灉鏄紝涓嶆浛鎹?- 涓?鈥紝璁╁緟鍔炴竻鍗曡В鏋愬櫒澶勭悊
          if (/^\s*\[[ xX]\]/.test(textAfterCursor)) {
            return false; // 浣跨敤榛樿琛屼负锛屼笉鏇挎崲
          }
          
          const dashPos = head - 1;
          // 鏇挎崲 "-" 涓?"鈥? 骞舵彃鍏ョ┖鏍?
          view.dispatch({
            changes: { from: dashPos, to: head, insert: '鈥?' },
            selection: { anchor: dashPos + 2 },
          });
          return true;
        }

        // 浣跨敤榛樿琛屼负
        return false;
      },
    },
    {
      key: ']',
      run: (view) => {
        // 妫€鏌ユ槸鍚﹂渶瑕佸皢 "鈥?[ " 杞崲涓?"- [ ]"锛堝緟鍔炴竻鍗曟牸寮忥級
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;

        // 鑾峰彇褰撳墠琛?
        const line = state.doc.lineAt(head);
        const textBeforeCursor = line.text.slice(0, head - line.from);

        // 妫€鏌ユ槸鍚﹀尮閰?"- [ " 鎴?"- [x" 鎴?"鈥?[ " 鎴?"鈥?[x" 鐨勬ā寮?
        const todoMatch = textBeforeCursor.match(/^(\s*)([-*+•])\s\[[ xX]$/);
        if (todoMatch) {
          const indent = todoMatch[1];
          const marker = todoMatch[2];
          
          // 濡傛灉鏄?鈥紝鏇挎崲涓?-
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
          
          // 濡傛灉宸茬粡鏄?-锛屽彧鎻掑叆 ]
          view.dispatch({
            changes: { from: head, insert: ']' },
            selection: { anchor: head + 1 },
          });
          return true;
        }

        // 浣跨敤榛樿琛屼负
        return false;
      },
    },
    {
      // Ctrl+I 鎴?Cmd+I 鎵撳紑鍐呰仈 AI 鑱婂ぉ
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
 * 妫€娴?URL 鏄惁涓哄浘鐗囬摼鎺?
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * 鍦ㄦ寚瀹氫綅缃彃鍏ユ枃鏈?
 */
function insertTextAtPosition(view: EditorView, pos: number, text: string): void {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
}

/**
 * 澶勭悊鍥剧墖鏂囦欢锛岃浆鎹负 base64 骞舵彃鍏?Markdown 鍥剧墖璇硶锛堝甫灏哄锛?
 */
function handleImageFile(file: File, view: EditorView, pos: number): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target?.result as string;
    if (base64) {
      // 鍔犺浇鍥剧墖鑾峰彇鍘熷灏哄锛岃缃负 25%
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
 * 澶勭悊鍥剧墖 URL锛屾彃鍏?Markdown 鍥剧墖璇硶
 */
function handleImageUrl(url: string, view: EditorView, pos: number): void {
  const fileName = url.split('/').pop() || 'image';
  const markdownImage = `\n![${fileName}](${url})\n`;
  insertTextAtPosition(view, pos, markdownImage);
}

/**
 * 瑙ｆ瀽鍥剧墖 alt 鏂囨湰涓殑灏哄淇℃伅
 * 鏍煎紡: alt|widthxheight 鎴?alt|width
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
 * 鍥剧墖 Widget 绫?- 鐢ㄤ簬鍦ㄧ紪杈戝櫒涓覆鏌撳彲璋冩暣澶у皬鐨勫浘鐗?
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
    // 瑙ｆ瀽 alt 涓殑鏃嬭浆銆佸榻愬拰鏄剧ず鏍峰紡淇℃伅
    this.parseAltAttributes();
  }

  private parseAltAttributes(): void {
    // 鏍煎紡: alt|widthxheight|r90|center|style:link
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
    // 绉婚櫎灏哄銆佹棆杞€佸榻愩€佹牱寮忎俊鎭紝鍙繚鐣欏師濮?alt
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
    
    // 璁剧疆瀵归綈鏂瑰紡
    wrapper.setAttribute('data-align', this.align);

    const container = document.createElement('div');
    container.className = 'cm-image-container';

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.getCleanAlt();
    img.className = 'cm-inline-image';
    if (this.width) img.style.width = `${this.width}px`;
    // 涓嶈缃浐瀹氶珮搴︼紝璁╁浘鐗囦繚鎸佸師濮嬪楂樻瘮
    if (this.rotation) img.style.transform = `rotate(${this.rotation}deg)`;

    // 鍒涘缓宸ュ叿鏍忥紙鍦ㄥ浘鐗囦笂鏂癸級
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-image-toolbar';

    // 鏃嬭浆鎸夐挳
    const rotateBtn = document.createElement('div');
    rotateBtn.className = 'cm-image-toolbar-btn';
    rotateBtn.title = '鏃嬭浆';
    rotateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>`;
    rotateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.rotateImage(img);
    });

    // 灏哄涓嬫媺鑿滃崟
    const sizeDropdown = document.createElement('div');
    sizeDropdown.className = 'cm-image-toolbar-dropdown';
    
    const sizeBtn = document.createElement('div');
    sizeBtn.className = 'cm-image-toolbar-btn';
    sizeBtn.title = '灏哄';
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
      // 鍏抽棴鍏朵粬鑿滃崟
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== sizeMenu) (menu as HTMLElement).style.display = 'none';
      });
      sizeMenu.style.display = sizeMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    sizeDropdown.appendChild(sizeBtn);
    sizeDropdown.appendChild(sizeMenu);

    // 瀵归綈涓嬫媺鑿滃崟
    const alignDropdown = document.createElement('div');
    alignDropdown.className = 'cm-image-toolbar-dropdown';
    
    const alignBtn = document.createElement('div');
    alignBtn.className = 'cm-image-toolbar-btn';
    alignBtn.title = '瀵归綈鏂瑰紡';
    alignBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`;
    
    const alignMenu = document.createElement('div');
    alignMenu.className = 'cm-image-toolbar-menu';
    alignMenu.style.display = 'none';
    
    const alignOptions = [
      { label: '左对齐', value: 'left', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>` },
      { label: '居中对齐', value: 'center', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>` },
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
        // 鏇存柊鑿滃崟椤圭殑 active 鐘舵€?
        alignMenu.querySelectorAll('.cm-image-toolbar-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      alignMenu.appendChild(item);
    });
    
    alignBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 鍏抽棴鍏朵粬鑿滃崟
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== alignMenu) (menu as HTMLElement).style.display = 'none';
      });
      alignMenu.style.display = alignMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    alignDropdown.appendChild(alignBtn);
    alignDropdown.appendChild(alignMenu);

    // 鎻忚堪鎸夐挳
    const captionBtn = document.createElement('div');
    captionBtn.className = `cm-image-toolbar-btn ${this.getCleanAlt() !== 'image' ? 'active' : ''}`;
    captionBtn.title = '娣诲姞鎻忚堪';
    captionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>`;
    
    // 鎻忚堪杈撳叆瀹瑰櫒
    const captionContainer = document.createElement('div');
    captionContainer.className = 'cm-image-caption-container';
    captionContainer.style.display = 'none';
    
    const captionInput = document.createElement('input');
    captionInput.type = 'text';
    captionInput.className = 'cm-image-caption-input';
    captionInput.placeholder = '娣诲姞鍥剧墖鎻忚堪...';
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
      // 鍏抽棴鍏朵粬鑿滃崟
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        (menu as HTMLElement).style.display = 'none';
      });
      const isVisible = captionContainer.style.display !== 'none';
      captionContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        setTimeout(() => captionInput.focus(), 0);
      }
    });

    // 鏄剧ず鏍峰紡涓嬫媺鑿滃崟
    const styleDropdown = document.createElement('div');
    styleDropdown.className = 'cm-image-toolbar-dropdown';
    
    const styleBtn = document.createElement('div');
    styleBtn.className = 'cm-image-toolbar-btn';
    styleBtn.title = '鏄剧ず鏍峰紡';
    styleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    
    const styleMenu = document.createElement('div');
    styleMenu.className = 'cm-image-toolbar-menu';
    styleMenu.style.display = 'none';
    
    const styleOptions = [
      { label: '榛樿', value: 'default', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>` },
      { label: '閾炬帴', value: 'link', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>` },
      { label: '鍗＄墖', value: 'card', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>` },
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
        // 鏇存柊鑿滃崟椤圭殑 active 鐘舵€?
        styleMenu.querySelectorAll('.cm-image-toolbar-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      styleMenu.appendChild(item);
    });
    
    styleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 鍏抽棴鍏朵粬鑿滃崟
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== styleMenu) (menu as HTMLElement).style.display = 'none';
      });
      styleMenu.style.display = styleMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    styleDropdown.appendChild(styleBtn);
    styleDropdown.appendChild(styleMenu);

    // 瑁佸壀鎸夐挳
    const cropBtn = document.createElement('div');
    cropBtn.className = 'cm-image-toolbar-btn';
    cropBtn.title = '瑁佸壀';
    cropBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>`;
    cropBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showCropDialog(img);
    });

    // 鍒嗛殧绾?
    const divider = document.createElement('div');
    divider.className = 'cm-image-toolbar-divider';

    // 鍏ㄥ睆鎸夐挳
    const fullscreenBtn = document.createElement('div');
    fullscreenBtn.className = 'cm-image-toolbar-btn';
    fullscreenBtn.title = '鍏ㄥ睆鏌ョ湅';
    fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    fullscreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showFullscreen(img.src);
    });

    // 鍒犻櫎鎸夐挳
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'cm-image-toolbar-btn cm-image-toolbar-btn-danger';
    deleteBtn.title = '鍒犻櫎鍥剧墖';
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

    // 鍒涘缓璋冩暣澶у皬鐨勬墜鏌?
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cm-image-resize-handle';

    // 鐐瑰嚮鍥剧墖閫変腑锛堜娇鐢?mousedown 纭繚绗竴鏃堕棿鍝嶅簲锛?
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // 绉婚櫎鍏朵粬鍥剧墖鐨勯€変腑鐘舵€?
      document.querySelectorAll('.cm-image-container.selected').forEach(el => {
        if (el !== container) el.classList.remove('selected');
      });
      container.classList.add('selected');
      // 璁板綍閫変腑鐨勫浘鐗?src
      selectedImageSrc = this.src;
    });

    // 宸ュ叿鏍忕偣鍑绘椂闃绘鍐掓场锛屼繚鎸侀€変腑鐘舵€?
    toolbar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // 鐐瑰嚮鍏朵粬鍦版柟鍙栨秷閫変腑鍜屽叧闂彍鍗?
    this.documentClickHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      // 濡傛灉鐐瑰嚮鍦?container 鎴?toolbar 鍐咃紝涓嶅彇娑堥€変腑
      if (!container.contains(target) && !toolbar.contains(target)) {
        container.classList.remove('selected');
        // 娓呴櫎閫変腑鐨勫浘鐗?src
        if (selectedImageSrc === this.src) {
          selectedImageSrc = null;
        }
      }
      // 鍏抽棴鎵€鏈夎彍鍗曪紙闄ら潪鐐瑰嚮鍦ㄨ彍鍗曞唴锛?
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

    // 濡傛灉杩欎釜鍥剧墖涔嬪墠琚€変腑锛屾仮澶嶉€変腑鐘舵€?
    if (selectedImageSrc === this.src) {
      container.classList.add('selected');
    }

    // 娣诲姞璋冩暣澶у皬鐨勪簨浠跺鐞?
    this.setupResizeHandler(resizeHandle, img, container);

    // 濡傛灉鍒濆鏄剧ず鏍峰紡涓嶆槸榛樿锛岀洿鎺ュ簲鐢ㄥ搴旀牱寮?
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
            <span class="cm-image-card-type">鍥剧墖</span>
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

    // 鏋勫缓鏂扮殑 alt 灞炴€?
    let newAlt = caption || 'image';
    
    // 娣诲姞灏哄
    if (this.width && this.height) {
      newAlt += `|${this.width}x${this.height}`;
    }
    
    // 娣诲姞鏃嬭浆
    if (this.rotation) {
      newAlt += `|r${this.rotation}`;
    }
    
    // 娣诲姞瀵归綈
    if (this.align !== 'left') {
      newAlt += `|${this.align}`;
    }

    const newMarkdown = `![${newAlt}](${this.src})`;

    // 鏌ユ壘骞舵浛鎹㈠師濮嬪浘鐗囪娉?
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

    // 鏋勫缓鏂扮殑 alt 灞炴€?
    const cleanAlt = this.getCleanAlt();
    let newAlt = cleanAlt;
    
    // 娣诲姞灏哄
    if (this.width && this.height) {
      newAlt += `|${this.width}x${this.height}`;
    }
    
    // 娣诲姞鏃嬭浆
    if (this.rotation) {
      newAlt += `|r${this.rotation}`;
    }
    
    // 娣诲姞瀵归綈
    if (this.align !== 'left') {
      newAlt += `|${this.align}`;
    }

    // 娣诲姞鏄剧ず鏍峰紡
    if (this.displayStyle !== 'default') {
      newAlt += `|style:${this.displayStyle}`;
    }

    const newMarkdown = `![${newAlt}](${this.src})`;

    // 鏌ユ壘骞舵浛鎹㈠師濮嬪浘鐗囪娉?
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
    
    // 绉婚櫎鏃х殑鏄剧ず鍐呭
    const oldLinkDisplay = container.querySelector('.cm-image-link-display');
    const oldCardDisplay = container.querySelector('.cm-image-card-display');
    if (oldLinkDisplay) oldLinkDisplay.remove();
    if (oldCardDisplay) oldCardDisplay.remove();
    
    // 鑾峰彇宸ュ叿鏍忓拰璋冩暣鎵嬫焺鐨勫紩鐢?
    const toolbar = container.querySelector('.cm-image-toolbar');
    const resizeHandle = container.querySelector('.cm-image-resize-handle');
    
    // 鏍规嵁鏍峰紡鏄剧ず/闅愯棌鍥剧墖
    if (style === 'default') {
      img.style.display = 'block';
      // 鏄剧ず璋冩暣鎵嬫焺
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = '';
    } else if (style === 'link') {
      img.style.display = 'none';
      // 闅愯棌璋冩暣鎵嬫焺
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
      // 鎻掑叆鍒板浘鐗囦箣鍚?
      img.insertAdjacentElement('afterend', linkDisplay);
    } else if (style === 'card') {
      img.style.display = 'none';
      // 闅愯棌璋冩暣鎵嬫焺
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = 'none';
      
      const cardDisplay = document.createElement('div');
      cardDisplay.className = 'cm-image-card-display';
      cardDisplay.innerHTML = `
        <div class="cm-image-card-preview">
          <img src="${this.src}" alt="${this.getCleanAlt()}" />
        </div>
        <div class="cm-image-card-info">
          <span class="cm-image-card-name">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
          <span class="cm-image-card-type">鍥剧墖</span>
        </div>
      `;
      // 鎻掑叆鍒板浘鐗囦箣鍚?
      img.insertAdjacentElement('afterend', cardDisplay);
    }
    
    this.updateImageAttributes();
  }

  private showCropDialog(img: HTMLImageElement): void {
    // 鍒涘缓瑁佸壀瀵硅瘽妗?
    const overlay = document.createElement('div');
    overlay.className = 'cm-image-crop-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'cm-image-crop-dialog';
    
    const title = document.createElement('div');
    title.className = 'cm-image-crop-title';
    title.textContent = '瑁佸壀鍥剧墖';
    
    const cropContainer = document.createElement('div');
    cropContainer.className = 'cm-image-crop-container';
    
    const cropImg = document.createElement('img');
    cropImg.src = this.src;
    cropImg.className = 'cm-image-crop-img';
    
    const cropBox = document.createElement('div');
    cropBox.className = 'cm-image-crop-box';
    
    // 瑁佸壀妗嗙殑鍥涗釜瑙?
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
      const handle = document.createElement('div');
      handle.className = `cm-image-crop-handle ${pos}`;
      cropBox.appendChild(handle);
    });
    
    cropContainer.appendChild(cropImg);
    cropContainer.appendChild(cropBox);
    
    // 鎸夐挳鍖哄煙
    const buttons = document.createElement('div');
    buttons.className = 'cm-image-crop-buttons';
    
    const cancelBtn = document.createElement('div');
    cancelBtn.className = 'cm-image-crop-btn';
    cancelBtn.textContent = '鍙栨秷';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });
    
    const confirmBtn = document.createElement('div');
    confirmBtn.className = 'cm-image-crop-btn cm-image-crop-btn-primary';
    confirmBtn.textContent = '纭畾';
    confirmBtn.addEventListener('click', () => {
      // 鑾峰彇瑁佸壀鍖哄煙骞跺簲鐢?
      this.applyCrop(cropImg, cropBox, img);
      overlay.remove();
    });
    
    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    
    dialog.appendChild(title);
    dialog.appendChild(cropContainer);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    
    // ESC 鍏抽棴
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 鐐瑰嚮閬僵鍏抽棴
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    document.body.appendChild(overlay);
    
    // 鍒濆鍖栬鍓鎷栨嫿
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
    // 璁＄畻瑁佸壀姣斾緥
    const scaleX = cropImg.naturalWidth / cropImg.offsetWidth;
    const scaleY = cropImg.naturalHeight / cropImg.offsetHeight;
    
    const cropX = cropBox.offsetLeft * scaleX;
    const cropY = cropBox.offsetTop * scaleY;
    const cropWidth = cropBox.offsetWidth * scaleX;
    const cropHeight = cropBox.offsetHeight * scaleY;
    
    // 浣跨敤 Canvas 瑁佸壀鍥剧墖
    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(cropImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    // 杞崲涓?base64
    const croppedSrc = canvas.toDataURL('image/png');
    
    // 鏇存柊鍥剧墖
    targetImg.src = croppedSrc;
    
    // 鏇存柊 Markdown
    this.updateImageSrc(croppedSrc);
  }

  private updateImageSrc(newSrc: string): void {
    const view = globalEditorView;
    if (!view) return;

    // 鏋勫缓鏂扮殑 Markdown
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

    // 鏌ユ壘骞舵浛鎹㈠師濮嬪浘鐗囪娉?
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
    // 鍒涘缓鍏ㄥ睆閬僵
    const overlay = document.createElement('div');
    overlay.className = 'cm-image-fullscreen-overlay';

    const fullImg = document.createElement('img');
    fullImg.src = src;
    fullImg.className = 'cm-image-fullscreen-img';

    // 鍏抽棴鎸夐挳
    const closeBtn = document.createElement('div');
    closeBtn.className = 'cm-image-fullscreen-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // 鐐瑰嚮閬僵鍏抽棴
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // ESC 閿叧闂?
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

    // 鏌ユ壘骞跺垹闄ゅ浘鐗囪娉?
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        // 妫€鏌ュ墠鍚庢槸鍚︽湁鎹㈣绗︼紝涓€骞跺垹闄?
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

      // 鑾峰彇鏈€缁堝昂瀵?
      const finalWidth = img.offsetWidth;
      const finalHeight = img.offsetHeight;

      // 鏇存柊 Markdown 涓殑鍥剧墖灏哄
      this.updateImageSize(finalWidth, finalHeight);
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  private updateImageSize(width: number, height: number): void {
    const view = globalEditorView;
    if (!view) return;

    // 鏋勫缓鏂扮殑 Markdown 鍥剧墖璇硶
    const newAlt = `${this.alt}|${width}x${height}`;
    const newMarkdown = `![${newAlt}](${this.src})`;

    // 鏌ユ壘骞舵浛鎹㈠師濮嬪浘鐗囪娉?
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
    // 娓呯悊浜嬩欢鐩戝惉鍣?
    if (this.documentClickHandler) {
      document.removeEventListener('mousedown', this.documentClickHandler);
      this.documentClickHandler = null;
    }
  }
}

/**
 * 瑙ｆ瀽鏂囨。涓殑鍥剧墖璇硶骞跺垱寤鸿楗板櫒
 */
function parseImages(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 鍖归厤 Markdown 鍥剧墖璇硶: ![alt](src) 鎴?![alt|widthxheight](src)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = imageRegex.exec(doc)) !== null) {
    const rawAlt = match[1];
    const src = match[2];
    const from = match.index;
    const to = from + match[0].length;

    // 璺宠繃瑙嗛閾炬帴锛岃瑙嗛瑁呴グ鍣ㄥ鐞?
    if (isVideoUrl(src)) {
      continue;
    }

    // 瑙ｆ瀽灏哄淇℃伅
    const { alt, width, height } = parseImageSize(rawAlt);

    // 闅愯棌鍘熷鍥剧墖璇硶鏂囨湰
    decorations.push({
      from,
      to,
      decoration: Decoration.replace({
        widget: new ResizableImageWidget(src, alt, width, height, from, to, match[0]),
      }),
    });
  }

  // 鎸変綅缃帓搴?
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 妫€鏌?URL 鏄惁涓鸿棰戦摼鎺?
 */
function isVideoUrl(url: string): boolean {
  // B绔?
  if (/bilibili\.com\/video\/(BV[\w]+|av\d+)/i.test(url)) return true;
  if (/b23\.tv\//i.test(url)) return true;
  // YouTube
  if (/(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url)) return true;
  // 浼橀叿
  if (/youku\.com\/v_show\/id_/i.test(url)) return true;
  return false;
}

/**
 * 鍥剧墖瑁呴グ鍣?StateField
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
// 瑙嗛宓屽叆娓叉煋绯荤粺
// ============================================================================

/**
 * 瑙嗛骞冲彴绫诲瀷
 */
type VideoPlatform = 'bilibili' | 'youtube' | 'youku' | 'qq' | 'iqiyi' | 'xigua' | 'douyin' | 'local' | 'other';

/**
 * 瑙嗛淇℃伅缁撴瀯
 */
interface VideoInfo {
  platform: VideoPlatform;
  embedUrl: string;
  originalUrl: string;
}

/**
 * 瑙ｆ瀽瑙嗛閾炬帴锛岃浆鎹负宓屽叆閾炬帴
 */
function parseVideoUrl(url: string): VideoInfo | null {
  console.log('[parseVideoUrl] 瑙ｆ瀽瑙嗛閾炬帴:', url);
  
  // B绔欓摼鎺ヨВ鏋?
  // 鏀寔鏍煎紡: 
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

  // B绔欑煭閾炬帴
  const b23Match = url.match(/b23\.tv\/([\w]+)/i);
  if (b23Match) {
    // 鐭摼鎺ラ渶瑕侀噸瀹氬悜锛屾殏鏃朵娇鐢ㄥ師閾炬帴
    return { platform: 'bilibili', embedUrl: url, originalUrl: url };
  }

  // YouTube 閾炬帴瑙ｆ瀽
  // 鏀寔鏍煎紡:
  // - https://www.youtube.com/watch?v=xxxxxxx
  // - https://youtu.be/xxxxxxx
  // 浣跨敤 youtube-nocookie.com 闅愮澧炲己妯″紡锛岄伩鍏嶅祵鍏ラ檺鍒?
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (youtubeMatch) {
    const videoId = youtubeMatch[1];
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
    return { platform: 'youtube', embedUrl, originalUrl: url };
  }

  // 浼橀叿閾炬帴瑙ｆ瀽
  // 鏀寔鏍煎紡: https://v.youku.com/v_show/id_xxxxxxx.html
  const youkuMatch = url.match(/youku\.com\/v_show\/id_([\w=]+)/i);
  if (youkuMatch) {
    const videoId = youkuMatch[1];
    const embedUrl = `https://player.youku.com/embed/${videoId}`;
    return { platform: 'youku', embedUrl, originalUrl: url };
  }

  // 鑵捐瑙嗛閾炬帴瑙ｆ瀽
  // 鏀寔鏍煎紡: https://v.qq.com/x/cover/xxx/xxx.html
  const qqMatch = url.match(/v\.qq\.com/i);
  if (qqMatch) {
    return { platform: 'qq', embedUrl: url, originalUrl: url };
  }

  // 鐖卞鑹洪摼鎺ヨВ鏋?
  // 鏀寔鏍煎紡: https://www.iqiyi.com/v_xxx.html
  const iqiyiMatch = url.match(/iqiyi\.com/i);
  if (iqiyiMatch) {
    return { platform: 'iqiyi', embedUrl: url, originalUrl: url };
  }

  // 瑗跨摐瑙嗛閾炬帴瑙ｆ瀽
  // 鏀寔鏍煎紡: https://www.ixigua.com/xxx
  const xiguaMatch = url.match(/ixigua\.com/i);
  if (xiguaMatch) {
    return { platform: 'xigua', embedUrl: url, originalUrl: url };
  }

  // 鎶栭煶閾炬帴瑙ｆ瀽
  // 鏀寔鏍煎紡: https://www.douyin.com/video/xxx
  const douyinMatch = url.match(/douyin\.com/i);
  if (douyinMatch) {
    return { platform: 'douyin', embedUrl: url, originalUrl: url };
  }

  // 鏈湴瑙嗛鏂囦欢
  // 鏀寔鏍煎紡: file:///path/to/video.mp4 鎴?C:\path\to\video.mp4 鎴?/path/to/video.mp4
  const localVideoExtensions = /\.(mp4|webm|ogg|mov|avi|mkv)$/i;
  // 鍏堣В鐮?URL 缂栫爜鐨勮矾寰?
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // 瑙ｇ爜澶辫触鍒欎娇鐢ㄥ師濮?URL
  }
  console.log('[parseVideoUrl] 妫€鏌ユ湰鍦拌棰? url:', url, 'decodedUrl:', decodedUrl);
  console.log('[parseVideoUrl] file:// 鍖归厤:', url.match(/^file:\/\//i));
  console.log('[parseVideoUrl] Windows璺緞鍖归厤:', url.match(/^[A-Za-z]:[\\\/]/));
  console.log('[parseVideoUrl] 鎵╁睍鍚嶅尮閰?', localVideoExtensions.test(decodedUrl));
  // 妫€鏌ユ槸鍚︿负鏈湴瑙嗛璺緞
  const isLocalPath = 
    url.match(/^file:\/\//i) || 
    decodedUrl.match(/^file:\/\//i) || 
    url.match(/^[A-Za-z]:[\\\/]/) ||  // Windows 璺緞: C:\ 鎴?C:/
    decodedUrl.match(/^[A-Za-z]:[\\\/]/) ||
    (url.startsWith('/') && localVideoExtensions.test(decodedUrl));
  
  if (isLocalPath) {
    console.log('[parseVideoUrl] 检测到本地视频路径:', url);
    return { platform: 'local', embedUrl: url, originalUrl: url };
  }
  // 涔熸敮鎸佷笉甯﹀崗璁殑鏈湴璺緞锛堟湁瑙嗛鎵╁睍鍚嶄笖涓嶆槸 http/https锛?
  if (localVideoExtensions.test(decodedUrl) && !url.match(/^https?:\/\//i)) {
    console.log('[parseVideoUrl] 璇嗗埆涓烘湰鍦拌棰?鏃犲崗璁?');
    return { platform: 'local', embedUrl: url, originalUrl: url };
  }

  // 閫氱敤瑙嗛閾炬帴 - 鏀寔浠绘剰 http/https 閾炬帴
  // 浣跨敤澧炲己鍨嬫祻瑙堝櫒鍙互鐩存帴鍔犺浇浠绘剰缃戦〉
  if (url.match(/^https?:\/\//i)) {
    return { platform: 'other', embedUrl: url, originalUrl: url };
  }

  return null;
}

// ============================================================================
// Mermaid 鍥捐〃娓叉煋绯荤粺
// ============================================================================

// 鍒濆鍖?Mermaid
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

// Mermaid Widget DOM 缂撳瓨
const mermaidWidgetDomCache = new WeakMap<MermaidWidget, HTMLElement>();

/**
 * Mermaid 鍥捐〃 Widget 绫?
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
    // 妫€鏌ョ紦瀛?
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

    // 宸ュ叿鏍?
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-mermaid-toolbar';

    // 宸︿晶锛氭爣棰?
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-mermaid-toolbar-left';

    // 鏍囬鏄剧ず
    const title = document.createElement('span');
    title.className = 'cm-mermaid-title';
    title.textContent = '流程图';

    // 鏍囬缂栬緫杈撳叆妗?
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'cm-mermaid-title-input';
    titleInput.value = '流程图';
    titleInput.style.display = 'none';

    // 缂栬緫鐘舵€?
    let isEditing = false;

    // 杩涘叆缂栬緫妯″紡
    const enterEditMode = () => {
      isEditing = true;
      title.style.display = 'none';
      titleInput.style.display = 'block';
      titleInput.value = title.textContent || '流程图';
      titleInput.focus();
      titleInput.select();
    };

    // 閫€鍑虹紪杈戞ā寮?
    const exitEditMode = (save: boolean) => {
      if (!isEditing) return;
      isEditing = false;
      title.style.display = 'block';
      titleInput.style.display = 'none';
      if (save && titleInput.value.trim()) {
        title.textContent = titleInput.value.trim();
      }
    };

    // 杈撳叆妗嗕簨浠?
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

    // 鍙充晶锛氬伐鍏锋爮鎸夐挳
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-mermaid-toolbar-right';

    // 缂栬緫鎸夐挳
    const editBtn = document.createElement('span');
    editBtn.className = 'cm-mermaid-toolbar-btn';
    editBtn.title = '缂栬緫';
    editBtn.innerHTML = `<svg viewBox="0 0 32 32" fill="currentColor" width="16" height="16"><path d="M2 26h28v2H2z"></path><path d="M25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10l3.6 3.6l-10 10H6z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterEditMode();
    });

    // 鍗＄墖鎸夐挳
    const cardBtn = document.createElement('span');
    cardBtn.className = 'cm-mermaid-toolbar-btn';
    cardBtn.title = '鍗＄墖';
    cardBtn.innerHTML = `<svg viewBox="0 0 1024 1024" fill="currentColor" width="16" height="16"><path d="M341.333333 106.666667a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L192 234.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L234.666667 384h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L384 341.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L341.333333 192z m0 362.666667a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L192 682.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L234.666667 832h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L384 789.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L341.333333 640z m576-298.666667a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666a128 128 0 0 1 128 128v106.666666z m-85.333333 0v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L789.333333 192h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L640 234.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L682.666667 384h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L832 341.333333z m-42.666667 213.333334a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L640 682.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L682.666667 832h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L832 789.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L789.333333 640z" /></svg>`;
    cardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇鍗＄墖瑙嗗浘鍔熻兘
      console.log('鍒囨崲鍗＄墖瑙嗗浘');
    });

    // 璁捐鎸夐挳
    const designBtn = document.createElement('span');
    designBtn.className = 'cm-mermaid-toolbar-btn';
    designBtn.title = '璁捐';
    designBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`;
    designBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇璁捐鍔熻兘
      console.log('鎵撳紑璁捐瑙嗗浘');
    });

    // 涓婚鎸夐挳
    const themeBtn = document.createElement('span');
    themeBtn.className = 'cm-mermaid-toolbar-btn';
    themeBtn.title = '涓婚';
    themeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>`;
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇涓婚鍒囨崲鍔熻兘
      console.log('鍒囨崲涓婚');
    });

    // 浠ｇ爜鎸夐挳
    const codeBtn = document.createElement('span');
    codeBtn.className = 'cm-mermaid-toolbar-btn';
    codeBtn.title = '浠ｇ爜';
    codeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`;
    codeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇鏌ョ湅浠ｇ爜鍔熻兘
      console.log('鏌ョ湅浠ｇ爜');
    });

    // 鎵╁ぇ鎸夐挳
    const expandBtn = document.createElement('span');
    expandBtn.className = 'cm-mermaid-toolbar-btn';
    expandBtn.title = '鎵╁ぇ';
    expandBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>`;
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 鎵撳紑娴佺▼鍥捐璁″櫒鏍囩椤?
      window.dispatchEvent(new CustomEvent('open-mermaid-designer', {
        detail: {
          code: this.code,
          title: title.textContent || '流程图'
        }
      }));
    });

    // 鍒犻櫎鎸夐挳
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-mermaid-toolbar-btn cm-mermaid-toolbar-btn-danger';
    deleteBtn.title = '鍒犻櫎';
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 7v4a.5.5 0 0 0 1 0V7a.5.5 0 0 0-1 0zM9 6.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zM10 4h3a.5.5 0 0 1 0 1h-.553l-.752 6.776A2.5 2.5 0 0 1 9.21 14H6.79a2.5 2.5 0 0 1-2.485-2.224L3.552 5H3a.5.5 0 0 1 0-1h3a2 2 0 1 1 4 0zM8 3a1 1 0 0 0-1 1h2a1 1 0 0 0-1-1zM4.559 5l.74 6.666A1.5 1.5 0 0 0 6.79 13h2.42a1.5 1.5 0 0 0 1.49-1.334L11.442 5H4.56z" fill="currentColor"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 鍒犻櫎 Mermaid 浠ｇ爜鍧?
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

    // 鍐呭鍖哄煙锛堝寘鍚乏渚у伐鍏锋爮鍜屽浘琛級
    const content = document.createElement('div');
    content.className = 'cm-mermaid-content';

    // 宸︿晶鍨傜洿宸ュ叿鏍?
    const sideToolbar = document.createElement('div');
    sideToolbar.className = 'cm-mermaid-side-toolbar';

    // 鎷栨嫿鐘舵€?
    let isDragMode = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let translateX = 0;
    let translateY = 0;

    // 缂╂斁鐘舵€?
    let scale = 1;
    const minScale = 0.2;
    const maxScale = 2;
    const scaleStep = 0.25;

    // 鏇存柊鍙樻崲
    const updateTransform = () => {
      svgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    };

    // 鎷栨嫿鎸夐挳
    const dragBtn = document.createElement('span');
    dragBtn.className = 'cm-mermaid-side-btn';
    dragBtn.title = '鎷栨嫿';
    dragBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
    dragBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isDragMode = !isDragMode;
      dragBtn.classList.toggle('active', isDragMode);
      container.classList.toggle('cm-mermaid-drag-mode', isDragMode);
    });

    // 鐧惧垎姣旀樉绀?
    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'cm-mermaid-zoom-label';
    zoomLabel.textContent = '100%';

    // 缂╂斁鑿滃崟
    const zoomPresets = [20, 50, 75, 100, 150, 200];
    let zoomMenu: HTMLElement | null = null;

    const showZoomMenu = (e: MouseEvent) => {
      e.stopPropagation();
      
      // 濡傛灉鑿滃崟宸插瓨鍦紝鍏堢Щ闄?
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

      // 瀹氫綅鑿滃崟
      const rect = zoomLabel.getBoundingClientRect();
      zoomMenu.style.position = 'fixed';
      zoomMenu.style.left = `${rect.right + 4}px`;
      zoomMenu.style.top = `${rect.top}px`;

      document.body.appendChild(zoomMenu);

      // 鐐瑰嚮鍏朵粬鍦版柟鍏抽棴鑿滃崟
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

    // 鍥捐〃鍐呭鍖呰鍣紙鐢ㄤ簬鍙樻崲锛? 鎻愬墠澹版槑
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'cm-mermaid-svg-wrapper';

    // 鏀惧ぇ鎸夐挳
    const zoomInBtn = document.createElement('span');
    zoomInBtn.className = 'cm-mermaid-side-btn';
    zoomInBtn.title = '鏀惧ぇ';
    zoomInBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (scale < maxScale) {
        scale = Math.min(scale + scaleStep, maxScale);
        updateTransform();
      }
    });

    // 缂╁皬鎸夐挳
    const zoomOutBtn = document.createElement('span');
    zoomOutBtn.className = 'cm-mermaid-side-btn';
    zoomOutBtn.title = '缂╁皬';
    zoomOutBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (scale > minScale) {
        scale = Math.max(scale - scaleStep, minScale);
        updateTransform();
      }
    });

    // 绱犳潗搴撴寜閽?
    const materialBtn = document.createElement('span');
    materialBtn.className = 'cm-mermaid-side-btn';
    materialBtn.title = '素材库';
    materialBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/></svg>`;
    materialBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鎵撳紑绱犳潗搴撻潰鏉?
      console.log('素材库功能待实现');
    });

    // 鍒嗛殧绾?
    const divider = document.createElement('div');
    divider.className = 'cm-mermaid-side-divider';

    sideToolbar.appendChild(materialBtn);
    sideToolbar.appendChild(divider);
    sideToolbar.appendChild(dragBtn);
    sideToolbar.appendChild(zoomOutBtn);
    sideToolbar.appendChild(zoomLabel);
    sideToolbar.appendChild(zoomInBtn);

    // 鍥捐〃瀹瑰櫒
    const container = document.createElement('div');
    container.className = 'cm-mermaid-container';

    // 鎷栨嫿浜嬩欢澶勭悊
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

    // 娓叉煋 Mermaid 鍥捐〃
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    mermaid.render(id, this.code).then(({ svg }) => {
      svgWrapper.innerHTML = svg;
    }).catch((error: Error) => {
      svgWrapper.innerHTML = `<div class="cm-mermaid-error">Mermaid 娓叉煋閿欒: ${error.message}</div>`;
    });

    container.appendChild(svgWrapper);
    content.appendChild(sideToolbar);
    content.appendChild(container);
    wrapper.appendChild(content);

    // 搴曢儴鎷栧姩鎵嬫焺
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cm-mermaid-resize-handle';
    
    const resizeBar = document.createElement('div');
    resizeBar.className = 'cm-mermaid-resize-bar';
    resizeHandle.appendChild(resizeBar);

    // 楂樺害璋冩暣鐘舵€?
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

    // 闃绘浜嬩欢鍐掓场
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
 * 瑙ｆ瀽鏂囨。涓殑 Mermaid 浠ｇ爜鍧?
 */
function parseMermaidBlocks(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 鍖归厤 ```mermaid ... ``` 浠ｇ爜鍧?
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
 * 鑾峰彇 Mermaid 浠ｇ爜鍧楃鍚?
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
 * Mermaid 瑁呴グ鍣?StateField
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
// 瑙嗛娓叉煋绯荤粺
// ============================================================================

// 瑙嗛 Widget DOM 缂撳瓨锛屼娇鐢?WeakMap 灏?widget 瀹炰緥涓?DOM 鍏冪礌鍏宠仈
const videoWidgetDomCache = new WeakMap<VideoWidget, HTMLElement>();

/**
 * 瑙嗛 Widget 绫?- 鐢ㄤ簬鍦ㄧ紪杈戝櫒涓覆鏌撹棰戞挱鏀惧櫒
 * 浣跨敤 Electron webview 鏍囩缁曡繃 CSP 闄愬埗
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
    // 瑙ｆ瀽 alt 涓殑鏄剧ず妯″紡
    this.parseDisplayMode();
  }

  private parseDisplayMode(): void {
    // 鏍煎紡: 鏍囬|mode:card
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
    // 绉婚櫎妯″紡淇℃伅锛屽彧淇濈暀鏍囬
    const parts = this.alt.split('|');
    const cleanParts = parts.filter(part => !part.startsWith('mode:'));
    return cleanParts.join('|') || '瑙嗛';
  }

  toDOM(): HTMLElement {
    // 濡傛灉宸叉湁 DOM 鍏冪礌锛岀洿鎺ヨ繑鍥烇紙閬垮厤閲嶅鍒涘缓锛?
    if (this.domElement) {
      // 鏇存柊鏍囬锛堝彲鑳藉凡鏇存敼锛?
      const titleEl = this.domElement.querySelector('.cm-video-title');
      if (titleEl) {
        titleEl.textContent = this.getCleanTitle();
      }
      return this.domElement;
    }

    // 妫€鏌?WeakMap 缂撳瓨
    const cached = videoWidgetDomCache.get(this);
    if (cached) {
      this.domElement = cached;
      return cached;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `cm-video-widget cm-video-mode-${this.displayMode}`;

    // 宸ュ叿鏍?
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-video-toolbar';

    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-video-toolbar-left';

    const platformBadge = document.createElement('span');
    platformBadge.className = 'cm-video-platform-badge';
    platformBadge.textContent = this.getPlatformName();

    // 鏍囬鏄剧ず鍏冪礌
    const title = document.createElement('span');
    title.className = 'cm-video-title';
    title.textContent = this.getCleanTitle();

    // 鏍囬缂栬緫杈撳叆妗嗭紙榛樿闅愯棌锛?
    const titleInput = document.createElement('input');
    titleInput.className = 'cm-video-title-input';
    titleInput.type = 'text';
    titleInput.value = this.getCleanTitle();
    titleInput.style.display = 'none';

    // 闃绘杈撳叆妗嗕簨浠跺啋娉?
    titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
    titleInput.addEventListener('mouseup', (e) => e.stopPropagation());
    titleInput.addEventListener('click', (e) => e.stopPropagation());
    titleInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        // 淇濆瓨鏍囬
        const newTitle = titleInput.value.trim() || '瑙嗛';
        title.textContent = newTitle;
        titleInput.style.display = 'none';
        title.style.display = '';
        // 瑙﹀彂鏍囬鏇存柊浜嬩欢
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
        // 鍙栨秷缂栬緫
        titleInput.value = this.getCleanTitle();
        titleInput.style.display = 'none';
        title.style.display = '';
      }
    });
    titleInput.addEventListener('keyup', (e) => e.stopPropagation());
    titleInput.addEventListener('keypress', (e) => e.stopPropagation());
    titleInput.addEventListener('blur', () => {
      // 澶辩劍鏃朵繚瀛?
      const newTitle = titleInput.value.trim() || '瑙嗛';
      title.textContent = newTitle;
      titleInput.style.display = 'none';
      title.style.display = '';
      // 瑙﹀彂鏍囬鏇存柊浜嬩欢
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

    // 缂栬緫鎸夐挳
    const editBtn = document.createElement('span');
    editBtn.className = 'cm-video-toolbar-btn';
    editBtn.title = '缂栬緫';
    editBtn.innerHTML = `<svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor"><path d="M2 26h28v2H2z"></path><path d="M25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 鍒囨崲鍒扮紪杈戞ā寮?
      title.style.display = 'none';
      titleInput.style.display = '';
      titleInput.value = title.textContent || '瑙嗛';
      titleInput.focus();
      titleInput.select();
    });

    // 鍗＄墖妯″紡鎸夐挳
    const cardBtn = document.createElement('span');
    cardBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'card' ? 'active' : ''}`;
    cardBtn.title = '鍗＄墖';
    cardBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h18"/><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 22h18"/></svg>`;
    cardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('card');
    });

    // 閾炬帴妯″紡鎸夐挳
    const linkBtn = document.createElement('span');
    linkBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'link' ? 'active' : ''}`;
    linkBtn.title = '閾炬帴';
    linkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`;
    linkBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('link');
    });

    // 瑙嗛宓屽叆妯″紡鎸夐挳
    const embedBtn = document.createElement('span');
    embedBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'embed' ? 'active' : ''}`;
    embedBtn.title = '瑙嗛';
    embedBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.25 13a.75.75 0 0 1 .743.648l.007.102v5a3.25 3.25 0 0 1-3.066 3.245L18.75 22h-4.668c.536-.385.973-.9 1.265-1.499l3.403-.001a1.75 1.75 0 0 0 1.744-1.607l.006-.143v-5a.75.75 0 0 1 .75-.75zm-9.5-4A3.25 3.25 0 0 1 15 12.25v6.5A3.25 3.25 0 0 1 11.75 22h-6.5A3.25 3.25 0 0 1 2 18.75v-6.5A3.25 3.25 0 0 1 5.25 9h6.5zm0 1.5h-6.5a1.75 1.75 0 0 0-1.75 1.75v6.5c0 .966.783 1.75 1.75 1.75h6.5a1.75 1.75 0 0 0 1.75-1.75v-6.5a1.75 1.75 0 0 0-1.75-1.75zM6.06 13.103a.5.5 0 0 1 .596-.236l.082.036l3.956 2.158a.5.5 0 0 1 .075.828l-.075.05l-3.956 2.158a.5.5 0 0 1-.731-.35L6 17.658v-4.315a.5.5 0 0 1 .061-.24zM18.75 2a3.25 3.25 0 0 1 3.245 3.066L22 5.25v5a.75.75 0 0 1-1.493.102l-.007-.102v-5a1.75 1.75 0 0 0-1.607-1.744L18.75 3.5h-5a.75.75 0 0 1-.102-1.493L13.75 2h5zm-8.5 0a.75.75 0 0 1 .102 1.493l-.102.007h-5a1.75 1.75 0 0 0-1.744 1.606L3.5 5.25v3.402c-.6.292-1.115.73-1.5 1.266V5.25a3.25 3.25 0 0 1 3.065-3.245L5.25 2h5z"/></svg>`;
    embedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('embed');
    });

    // 鍦ㄦ祻瑙堝櫒涓墦寮€鎸夐挳
    const openBtn = document.createElement('span');
    openBtn.className = 'cm-video-toolbar-btn';
    openBtn.title = '鍦ㄦ祻瑙堝櫒涓墦寮€';
    openBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(this.videoInfo.originalUrl, '_blank');
    });

    // 鏇村鑿滃崟鎸夐挳
    const moreBtn = document.createElement('span');
    moreBtn.className = 'cm-video-toolbar-btn';
    moreBtn.title = '鏇村';
    moreBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 鏄剧ず鏇村鑿滃崟
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

    // 鏍规嵁鏄剧ず妯″紡娓叉煋鍐呭
    if (this.displayMode === 'embed') {
      // 鏈湴瑙嗛浣跨敤 HTML5 video 鏍囩
      if (this.videoInfo.platform === 'local') {
        const localContainer = document.createElement('div');
        localContainer.className = 'cm-video-local-player';

        const video = document.createElement('video');
        video.className = 'cm-video-local-video';
        
        // 灏嗘湰鍦版枃浠惰矾寰勮浆鎹负 local-file:// 鍗忚
        let videoSrc = this.videoInfo.originalUrl;
        console.log('[VideoWidget] 鏈湴瑙嗛鍘熷璺緞:', videoSrc);
        if (videoSrc.startsWith('file:///')) {
          // file:/// 杞崲涓?local-file:///
          videoSrc = videoSrc.replace('file:///', 'local-file:///');
        } else if (videoSrc.startsWith('file://')) {
          // file:// 杞崲涓?local-file://
          videoSrc = videoSrc.replace('file://', 'local-file://');
        } else if (!videoSrc.startsWith('local-file://')) {
          // Windows 璺緞杞崲: C:\path\to\video.mp4 -> local-file:///C:/path/to/video.mp4
          // 闇€瑕佸璺緞杩涜 URL 缂栫爜锛堜絾淇濈暀鏂滄潬鍜屽啋鍙凤級
          const normalizedPath = videoSrc.replace(/\\/g, '/');
          const parts = normalizedPath.split('/');
          const encodedParts = parts.map((part, index) => {
            // 绗竴閮ㄥ垎鏄洏绗︼紙濡?C:锛夛紝涓嶇紪鐮?
            if (index === 0 && /^[A-Za-z]:$/.test(part)) {
              return part;
            }
            return encodeURIComponent(part);
          });
          videoSrc = 'local-file:///' + encodedParts.join('/');
        }
        console.log('[VideoWidget] 鏈湴瑙嗛杞崲鍚庤矾寰?', videoSrc);
        video.src = videoSrc;
        video.controls = true;
        video.preload = 'metadata';

        // 娣诲姞閿欒澶勭悊
        video.addEventListener('error', (e) => {
          console.error('[VideoWidget] 瑙嗛鍔犺浇閿欒:', e, video.error);
        });

        // 闃绘浜嬩欢鍐掓场
        video.addEventListener('mousedown', (e) => e.stopPropagation());
        video.addEventListener('click', (e) => e.stopPropagation());

        localContainer.appendChild(video);
        wrapper.appendChild(localContainer);
      } else {
        // 澧炲己鍨嬪唴宓屾祻瑙堝櫒
        const browserContainer = document.createElement('div');
        browserContainer.className = 'cm-video-browser';

      // 娴忚鍣ㄥ鑸爮
      const browserNav = document.createElement('div');
      browserNav.className = 'cm-video-browser-nav';

      // 鍚庨€€鎸夐挳
      const backBtn = document.createElement('span');
      backBtn.className = 'cm-video-browser-btn';
      backBtn.title = '鍚庨€€';
      backBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.928 7.976l4.357 4.357-.618.62L5 8.284v-.618L9.667 3l.618.619-4.357 4.357z"/></svg>`;

      // 鍓嶈繘鎸夐挳
      const forwardBtn = document.createElement('span');
      forwardBtn.className = 'cm-video-browser-btn';
      forwardBtn.title = '鍓嶈繘';
      forwardBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/></svg>`;

      // 鍒锋柊鎸夐挳
      const refreshBtn = document.createElement('span');
      refreshBtn.className = 'cm-video-browser-btn';
      refreshBtn.title = '鍒锋柊';
      refreshBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.56253 2.51577C6.22874 2.18616 6.96524 2 7.74856 2C9.08973 2 10.347 2.54555 11.2554 3.45393C11.6244 3.82283 11.9297 4.25217 12.1575 4.72382L12.1575 3L13.1575 3V6.74856L9.40897 6.74856V5.74856H11.3161C11.1284 5.27466 10.8435 4.84603 10.4839 4.48638C9.78661 3.78908 8.81981 3.35862 7.74856 3.35862C7.14565 3.35862 6.58195 3.50551 6.08841 3.76641L5.56253 2.51577ZM4.34253 10.2516C4.13064 9.77756 4.01561 9.25774 4.01561 8.71143C4.01561 7.64018 4.44607 6.67338 5.14337 5.97609L6.20399 7.03671C5.71713 7.52357 5.42142 8.18538 5.42142 8.91703C5.42142 9.35023 5.51636 9.76027 5.68652 10.1272L4.34253 10.2516ZM8.03663 12.7916C8.6395 12.632 9.19129 12.3302 9.65221 11.9204L10.7128 12.981C10.0466 13.5904 9.23861 14.0316 8.35253 14.2405L8.03663 12.7916ZM4.15743 6L6.84257 6L6.84257 7L4.93542 7C5.123 7.47391 5.40791 7.90253 5.76756 8.26218C6.46485 8.95948 7.43165 9.38994 8.5029 9.38994C9.10581 9.38994 9.66951 9.24305 10.1631 8.98215L10.6889 10.2328C10.0227 10.5624 9.28622 10.7486 8.5029 10.7486C7.16173 10.7486 5.90447 10.203 4.99609 9.29467C4.62719 8.92577 4.32189 8.49643 4.09412 8.02478L4.09411 9.74856L3.09411 9.74856L3.09412 6L4.15743 6Z"/></svg>`;

      // 鍦板潃鏍?
      const addressBar = document.createElement('input');
      addressBar.className = 'cm-video-browser-address';
      addressBar.type = 'text';
      addressBar.value = this.videoInfo.originalUrl;
      addressBar.spellcheck = false;

      // 闃绘鍦板潃鏍忛紶鏍囦簨浠跺啋娉★紝闃叉瑙﹀彂缂栬緫鍣ㄩ€夋嫨
      addressBar.addEventListener('mousedown', (e) => e.stopPropagation());
      addressBar.addEventListener('mouseup', (e) => e.stopPropagation());
      addressBar.addEventListener('click', (e) => e.stopPropagation());
      addressBar.addEventListener('dblclick', (e) => e.stopPropagation());

      // 闃绘閿洏浜嬩欢鍐掓场锛岄槻姝?CodeMirror 鎷︽埅蹇嵎閿?
      addressBar.addEventListener('keydown', (e) => {
        e.stopPropagation();
        // 鍥炶溅璺宠浆
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

      // 鍦ㄥ閮ㄦ祻瑙堝櫒鎵撳紑
      const externalBtn = document.createElement('span');
      externalBtn.className = 'cm-video-browser-btn';
      externalBtn.title = '鍦ㄦ祻瑙堝櫒涓墦寮€';
      externalBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

      browserNav.appendChild(backBtn);
      browserNav.appendChild(forwardBtn);
      browserNav.appendChild(refreshBtn);
      browserNav.appendChild(addressBar);
      browserNav.appendChild(externalBtn);

      // 鍔犺浇杩涘害鏉?
      const progressBar = document.createElement('div');
      progressBar.className = 'cm-video-browser-progress';
      const progressInner = document.createElement('div');
      progressInner.className = 'cm-video-browser-progress-inner';
      progressBar.appendChild(progressInner);

      // Webview 瀹瑰櫒
      const webviewContainer = document.createElement('div');
      webviewContainer.className = 'cm-video-browser-content';

      const webview = document.createElement('webview');
      webview.className = 'cm-video-webview';
      webview.setAttribute('src', this.videoInfo.originalUrl);
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('partition', 'persist:video');

      // 缁戝畾瀵艰埅浜嬩欢
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

      // 缁戝畾鎸夐挳浜嬩欢
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
      // 鍗＄墖妯″紡 - 鏄剧ず缂╃暐鍥惧拰淇℃伅
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
    // link 妯″紡涓嶆樉绀洪澶栧唴瀹癸紝鍙樉绀哄伐鍏锋爮

    // 瀛樺叆缂撳瓨
    this.domElement = wrapper;
    videoWidgetDomCache.set(this, wrapper);

    return wrapper;
  }

  private showMoreMenu(anchorEl: HTMLElement, wrapperEl: HTMLElement): void {
    // 绉婚櫎宸插瓨鍦ㄧ殑鑿滃崟
    const existingMenu = document.querySelector('.cm-video-more-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 鍒涘缓鑿滃崟
    const menu = document.createElement('div');
    menu.className = 'cm-video-more-menu';

    const menuItems = [
      { label: '鏈湴瑙嗛', action: 'local-video' },
      { label: '鍦ㄦ祻瑙堝櫒涓墦寮€', action: 'open-external' },
      { label: '鎷疯礉鍘熷閾炬帴', action: 'copy-url' },
      { label: '鎷疯礉鍖哄潡閾炬帴', action: 'copy-block' },
      { label: '绉诲姩鍒?..', action: 'move-to' },
      { label: '鍒犻櫎', action: 'delete', danger: true },
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

    // 鍏堟坊鍔犲埌 DOM 浠ヨ幏鍙栬彍鍗曢珮搴?
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);

    // 瀹氫綅鑿滃崟
    const rect = anchorEl.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const viewportHeight = window.innerHeight;

    // 妫€鏌ユ槸鍚︿細瓒呭嚭搴曢儴
    let top = rect.bottom + 4;
    if (top + menuHeight > viewportHeight - 10) {
      // 鍚戜笂鏄剧ず
      top = rect.top - menuHeight - 4;
    }

    // 妫€鏌ュ乏渚т綅缃?
    let left = rect.right - 140;
    if (left < 10) {
      left = 10;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';

    // 鐐瑰嚮澶栭儴鍏抽棴鑿滃崟
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
        // 瑙﹀彂鏈湴瑙嗛閫夋嫨浜嬩欢
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
        // 瑙﹀彂绉诲姩浜嬩欢
        window.dispatchEvent(new CustomEvent('video-move-to', {
          detail: { from: this.from, to: this.to, content: this.originalMatch },
        }));
        break;
      case 'delete':
        // 瑙﹀彂鍒犻櫎浜嬩欢
        window.dispatchEvent(new CustomEvent('video-delete', {
          detail: { from: this.from, to: this.to },
        }));
        break;
    }
  }

  private changeDisplayMode(mode: 'embed' | 'card' | 'link'): void {
    // 閫氳繃鑷畾涔変簨浠堕€氱煡缂栬緫鍣ㄦ洿鏂版枃妗?
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
      case 'qq': return '腾讯视频';
      case 'iqiyi': return '爱奇艺';
      case 'xigua': return '西瓜视频';
      case 'douyin': return '鎶栭煶';
      case 'local': return '鏈湴';
      case 'other': return '缃戦〉';
      default: return '瑙嗛';
    }
  }

  eq(other: VideoWidget): boolean {
    // 鍙瘮杈冭棰戝唴瀹癸紝涓嶆瘮杈冧綅缃紝閬垮厤鏂囨。鍙樺寲鏃堕噸寤?widget
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
 * 瑙ｆ瀽鏂囨。涓殑瑙嗛璇硶骞跺垱寤鸿楗板櫒
 * 瑙嗛璇硶: ![瑙嗛](瑙嗛閾炬帴)
 * 鍙湁褰撻摼鎺ユ槸鏀寔鐨勮棰戝钩鍙版椂鎵嶆覆鏌撲负瑙嗛鎾斁鍣?
 */
function parseVideos(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 鍖归厤 Markdown 鍥剧墖璇硶锛屾敮鎸?http/https 閾炬帴鍜屾湰鍦版枃浠惰矾寰?
  // 鏈湴璺緞鏍煎紡: C:\path\to\file.mp4 鎴?file:///path/to/file.mp4
  const videoRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = videoRegex.exec(doc)) !== null) {
    const alt = match[1];
    const url = match[2];
    const from = match.index;
    const to = from + match[0].length;

    // 灏濊瘯瑙ｆ瀽涓鸿棰戦摼鎺?
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

  // 鎸変綅缃帓搴?
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 鎻愬彇鏂囨。涓墍鏈夎棰戦摼鎺ョ殑绛惧悕锛堢敤浜庢瘮杈冩槸鍚﹂渶瑕侀噸鏂拌В鏋愶級
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
 * 瑙嗛瑁呴グ鍣?StateField
 * 浼樺寲锛氬彧鍦ㄨ棰戝唴瀹瑰彉鍖栨椂鎵嶉噸鏂拌В鏋愶紝閬垮厤棰戠箒閲嶅缓 webview
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
    // 濡傛灉鏂囨。娌℃湁鍙樺寲锛岀洿鎺ヨ繑鍥炲師鍊?
    if (!tr.docChanged) {
      return value;
    }

    const newDoc = tr.newDoc.toString();
    const newSignature = getVideoSignature(newDoc);

    // 鍙湁瑙嗛鍐呭鍙樺寲鏃舵墠閲嶆柊瑙ｆ瀽
    if (newSignature !== value.signature) {
      return {
        decorations: parseVideos(newDoc),
        signature: newSignature,
      };
    }

    // 瑙嗛鍐呭鏈彉鍖栵紝灏濊瘯鏄犲皠浣嶇疆
    // 濡傛灉鏄犲皠澶辫触锛堣楗板櫒鏁伴噺涓?浣嗙鍚嶄笉涓虹┖锛夛紝閲嶆柊瑙ｆ瀽
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
// Markdown 琛ㄦ牸娓叉煋绯荤粺
// ============================================================================

/**
 * 琛ㄦ牸鏁版嵁缁撴瀯
 */
interface TableData {
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  from: number;
  to: number;
}

/**
 * 瑙ｆ瀽 Markdown 琛ㄦ牸
 */
function parseMarkdownTable(doc: string): TableData[] {
  const tables: TableData[] = [];
  const lines = doc.split('\n');
  let position = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = position;

    // 妫€娴嬭〃鏍煎ご閮ㄨ锛堝寘鍚?| 鐨勮锛?
    if (line.includes('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      
      // 妫€娴嬪垎闅旇锛堝寘鍚?--- 鍜?|锛?
      if (/^\|?\s*:?-+:?\s*\|/.test(nextLine) || /\|\s*:?-+:?\s*\|?$/.test(nextLine)) {
        // 瑙ｆ瀽琛ㄥご
        const headers = parseTableRow(line);
        
        if (headers.length > 0) {
          // 瑙ｆ瀽瀵归綈鏂瑰紡
          const alignments = parseAlignments(nextLine, headers.length);
          
          // 瑙ｆ瀽鏁版嵁琛?
          const rows: string[][] = [];
          let j = i + 2;
          // 璁＄畻琛ㄦ牸缁撴潫浣嶇疆锛堝寘鍚〃澶磋鍜屽垎闅旇鍙婂叾鎹㈣绗︼級
          let lastLineEnd = lineStart + line.length + 1 + nextLine.length;
          
          while (j < lines.length) {
            const dataLine = lines[j];
            
            // 妫€娴嬫槸鍚︽槸鏂拌〃鏍肩殑寮€濮嬶紙涓嬩竴琛屾槸鍒嗛殧琛岋級
            if (j + 1 < lines.length) {
              const potentialSeparator = lines[j + 1];
              if (/^\|?\s*:?-+:?\s*\|/.test(potentialSeparator) || /\|\s*:?-+:?\s*\|?$/.test(potentialSeparator)) {
                // 杩欐槸鏂拌〃鏍肩殑琛ㄥご锛岀粨鏉熷綋鍓嶈〃鏍?
                break;
              }
            }
            
            // 妫€娴嬫槸鍚﹁繕鏄〃鏍艰锛堝繀椤诲寘鍚?| 涓斾笉鏄┖琛岋級
            if (!dataLine.includes('|') || dataLine.trim() === '') {
              break;
            }
            const rowData = parseTableRow(dataLine);
            // 濡傛灉瑙ｆ瀽鍑虹殑鏁版嵁涓虹┖锛岃烦杩囷紙浣嗗厑璁告墍鏈夊崟鍏冩牸涓虹┖瀛楃涓茬殑琛岋級
            if (rowData.length === 0) {
              break;
            }
            // 纭繚琛屾暟鎹笌琛ㄥご鍒楁暟涓€鑷?
            while (rowData.length < headers.length) {
              rowData.push('');
            }
            rows.push(rowData.slice(0, headers.length));
            // 鏇存柊鏈€鍚庝竴琛岀殑缁撴潫浣嶇疆锛堝姞涓婂墠涓€琛岀殑鎹㈣绗﹀拰褰撳墠琛岀殑闀垮害锛?
            lastLineEnd += 1 + dataLine.length;
            j++;
          }
          
          // 娣诲姞琛ㄦ牸锛堝厑璁告病鏈夋暟鎹鐨勮〃鏍硷級
          tables.push({
            headers,
            alignments,
            rows,
            from: lineStart,
            to: lastLineEnd,
          });
          
          // 璺宠繃宸插鐞嗙殑琛?
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
 * 瑙ｆ瀽琛ㄦ牸琛?
 */
function parseTableRow(line: string): string[] {
  // 绉婚櫎棣栧熬鐨?|
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }
  
  // 鎸?| 鍒嗗壊骞舵竻鐞嗙┖鏍?
  return trimmed.split('|').map(cell => cell.trim());
}

/**
 * 瑙ｆ瀽瀵归綈鏂瑰紡
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
 * 琛ㄦ牸 Widget 绫?- 鐢ㄤ簬鍦ㄧ紪杈戝櫒涓覆鏌撳彲瑙嗗寲琛ㄦ牸
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
    
    // 鍒涘缓宸ュ叿鏍?
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-table-toolbar';
    
    // 宸︿晶锛氭暟鎹簱鍚嶇О鍜屾坊鍔犳寜閽?
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-table-toolbar-left';
    
    const tableName = document.createElement('span');
    tableName.className = 'cm-table-name';
    tableName.textContent = '数据库';
    toolbarLeft.appendChild(tableName);
    
    const addBtn = document.createElement('span');
    addBtn.className = 'cm-table-toolbar-btn';
    addBtn.title = '新增列';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 鍦ㄥ綋鍓嶈〃鏍煎悗鎻掑叆鏂拌〃鏍兼ā鏉?
      const newTableTemplate = '\n\n| 鍒?1 | 鍒?2 |\n| --- | --- |\n|  |  |\n';
      view.dispatch({
        changes: { from: this.tableData.to, insert: newTableTemplate },
      });
    });
    toolbarLeft.appendChild(addBtn);
    
    toolbar.appendChild(toolbarLeft);
    
    // 鍙充晶锛氱瓫閫夈€佹帓搴忋€佺獥鍙ｆ樉绀恒€佸垹闄?
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-table-toolbar-right';
    
    const filterBtn = document.createElement('span');
    filterBtn.className = 'cm-table-toolbar-btn';
    filterBtn.title = '筛选';
    filterBtn.textContent = '筛选';
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇绛涢€夊姛鑳?
    });
    toolbarRight.appendChild(filterBtn);
    
    const sortBtn = document.createElement('span');
    sortBtn.className = 'cm-table-toolbar-btn';
    sortBtn.title = '鎺掑簭';
    sortBtn.textContent = '鎺掑簭';
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇鎺掑簭鍔熻兘
    });
    toolbarRight.appendChild(sortBtn);
    
    const expandBtn = document.createElement('span');
    expandBtn.className = 'cm-table-toolbar-btn';
    expandBtn.title = '绐楀彛鏄剧ず';
    expandBtn.textContent = '绐楀彛';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 瀹炵幇绐楀彛鏄剧ず鍔熻兘
    });
    toolbarRight.appendChild(expandBtn);
    
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-table-toolbar-btn cm-table-toolbar-btn-danger';
    deleteBtn.title = '鍒犻櫎琛ㄦ牸';
    deleteBtn.textContent = '鍒犻櫎';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 鍒犻櫎琛ㄦ牸锛堝寘鎷墠鍚庡彲鑳界殑绌鸿锛?
      let deleteFrom = this.tableData.from;
      let deleteTo = this.tableData.to;
      
      // 妫€鏌ヨ〃鏍煎悗鏄惁鏈夋崲琛岀锛屼竴骞跺垹闄?
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
    
    // 鍒涘缓婊氬姩瀹瑰櫒
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'cm-table-scroll-container';
    
    const table = document.createElement('table');
    table.className = 'cm-markdown-table';
    
    // 鍒涘缓琛ㄥご
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
    
    // 鍒涘缓琛ㄤ綋
    const tbody = document.createElement('tbody');
    
    console.log('[TableWidget] 娓叉煋鏁版嵁琛?', this.tableData.rows);
    
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
    
    // 鐐瑰嚮琛ㄦ牸鏃惰烦杞埌婧愮爜浣嶇疆
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
 * 瑙ｆ瀽鏂囨。涓殑琛ㄦ牸骞跺垱寤鸿楗板櫒
 */
function parseTableDecorations(doc: string): DecorationSet {
  const tables = parseMarkdownTable(doc);
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];

  console.log('[parseTableDecorations] 瑙ｆ瀽鍒扮殑琛ㄦ牸:', tables.map(t => ({
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

  // 鎸変綅缃帓搴?
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 琛ㄦ牸瑁呴グ鍣?StateField
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
 * 瑙ｆ瀽鏂囨。涓殑鏍囬骞跺垱寤鸿瑁呴グ鍣?
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
 * 鏍囬瑁呴グ鍣?StateField - 涓烘爣棰樿娣诲姞涓嶅悓鐨勫瓧浣撳ぇ灏?
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
 * 鏃犲簭鍒楄〃鍦嗙偣 Widget - 灏?- * + 鏇挎崲涓哄渾鐐瑰浘鏍?
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
 * 瑙ｆ瀽鏃犲簭鍒楄〃骞跺垱寤鸿楗板櫒
 * 灏?- * + 鏇挎崲涓哄渾鐐瑰浘鏍?
 */
function parseUnorderedList(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 鑾峰彇褰撳墠鍏夋爣鎵€鍦ㄨ
  const cursorLine = state.selection.main.head;
  const currentLineNumber = doc.lineAt(cursorLine).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // 鍖归厤鏃犲簭鍒楄〃鏍囪锛? * + 锛堝墠闈㈠彲浠ユ湁缂╄繘绌烘牸锛?
    const match = line.text.match(/^(\s*)([-*+])\s/);
    if (match) {
      // 璺宠繃寰呭姙娓呭崟锛? [ ] 鎴?- [x]锛? 鍦ㄦ鏌ュ厜鏍囦綅缃箣鍓嶅厛妫€鏌?
      // 鍖归厤鏍煎紡锛氬彲閫夌缉杩?+ 鍒楄〃鏍囪 + 绌烘牸 + [ ] 鎴?[x]锛堝悗闈㈠彲浠ユ湁绌烘牸鎴栧埌琛屽熬锛?
      const isTodo = /^[\t ]*[-*+]\s\[[ xX]\](\s|$)/.test(line.text);
      if (isTodo) {
        continue;
      }
      
      // 濡傛灉鍏夋爣鍦ㄥ綋鍓嶈锛屼笉鏇挎崲鏍囪
      if (i === currentLineNumber) {
        continue;
      }
      
      const indent = match[1].length;
      const markerStart = line.from + indent;
      const markerEnd = markerStart + 1; // 鍙浛鎹?- * + 绗﹀彿
      
      // 闅愯棌鍘熷鏍囪
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
 * 瑙ｆ瀽绮椾綋鏂囨湰骞跺垱寤鸿楗板櫒
 * 鍖归厤 **text** 鎴?__text__ 鏍煎紡
 */
function parseBoldText(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 鑾峰彇褰撳墠鍏夋爣鎵€鍦ㄨ
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 鍖归厤 **text** 鎴?__text__
    const boldRegex = /(\*\*|__)([^*_]+)\1/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const markerLength = match[1].length; // ** 鎴?__
      const contentFrom = from + markerLength;
      const contentTo = to - markerLength;

      // 濡傛灉鍏夋爣鍦ㄥ綋鍓嶈锛屾樉绀哄師濮嬭娉?
      if (i === cursorLine) {
        // 鍙负鍐呭娣诲姞绮椾綋鏍峰紡锛屼笉闅愯棌鏍囪
        decorations.push(
          Decoration.mark({ class: 'cm-strong' }).range(contentFrom, contentTo)
        );
      } else {
        // 闅愯棌鍓嶅悗鐨?** 鎴?__
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
 * 绮椾綋瑁呴グ鍣?StateField
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
 * 瑙ｆ瀽鏂滀綋鏂囨湰骞跺垱寤鸿楗板櫒
 * 鍖归厤 *text* 鎴?_text_ 鏍煎紡锛堜絾涓嶅尮閰?** 鎴?__锛?
 */
function parseItalicText(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 鑾峰彇褰撳墠鍏夋爣鎵€鍦ㄨ
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 鍖归厤 *text* 鎴?_text_锛堜絾涓嶅尮閰?** 鎴?__锛?
    // 浣跨敤璐熷悜鍓嶇灮鍜岃礋鍚戝悗鐬荤‘淇濅笉鍖归厤绮椾綋
    const italicRegex = /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)|(?<!_)_(?!_)([^_]+)_(?!_)/g;
    let match;

    while ((match = italicRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const content = match[1] || match[2];
      const contentFrom = from + 1;
      const contentTo = to - 1;

      // 濡傛灉鍏夋爣鍦ㄥ綋鍓嶈锛屾樉绀哄師濮嬭娉?
      if (i === cursorLine) {
        decorations.push(
          Decoration.mark({ class: 'cm-em' }).range(contentFrom, contentTo)
        );
      } else {
        // 闅愯棌鍓嶅悗鐨?* 鎴?_
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
 * 鏂滀綋瑁呴グ鍣?StateField
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
 * 鏃犲簭鍒楄〃瑁呴グ鍣?StateField - 灏?- * + 鏇挎崲涓哄渾鐐?
 */
const unorderedListDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseUnorderedList(state);
  },
  update(decorations, tr) {
    // 鏂囨。鍙樺寲鎴栧厜鏍囦綅缃彉鍖栨椂閮介渶瑕佹洿鏂?
    if (tr.docChanged || tr.selection) {
      return parseUnorderedList(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 寰呭姙娓呭崟澶嶉€夋 Widget - 灏?[ ] 鎴?[x] 鏇挎崲涓哄彲鐐瑰嚮鐨勫閫夋
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
    
    // 鐐瑰嚮鍒囨崲鐘舵€?
    checkbox.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 鏇挎崲鏃朵繚鐣欏悗闈㈢殑绌烘牸
      const newText = this.checked ? '[ ] ' : '[x] ';
      // 淇濆瓨褰撳墠閫夋嫨浣嶇疆
      const currentSelection = this.view.state.selection;
      this.view.dispatch({
        changes: { from: this.pos, to: this.pos + this.length, insert: newText },
        // 鎭㈠鍘熸潵鐨勯€夋嫨浣嶇疆
        selection: currentSelection
      });
    });
    
    return checkbox;
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos && this.length === other.length;
  }

  ignoreEvent(event: Event): boolean {
    // 鍙鐞?mousedown 浜嬩欢锛屽拷鐣ュ叾浠栦簨浠?
    return event.type !== 'mousedown';
  }
}

/**
 * 瑙ｆ瀽寰呭姙娓呭崟骞跺垱寤哄閫夋瑁呴グ鍣?
 * 鍖归厤鏍煎紡锛? [ ] 鎴?- [x] 鎴?鈥?[ ] 鎴?鈥?[x] 鎴?1. [ ] 鎴?1. [x]锛堝悗闈㈠彲浠ユ湁绌烘牸鎴栧埌琛屽熬锛?
 */
function parseTodoList(state: EditorState, view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;
  
  // 鑾峰彇褰撳墠鍏夋爣浣嶇疆
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos);
  const cursorLineNumber = cursorLine.number;
  const cursorOffset = cursorPos - cursorLine.from; // 鍏夋爣鍦ㄨ鍐呯殑鍋忕Щ

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    
    // 鍖归厤寰呭姙娓呭崟锛?
    // 1. 鏃犲簭鍒楄〃鏍煎紡锛? [ ] 鎴?- [x] 鎴?鈥?[ ] 鎴?鈥?[x]
    // 2. 鏈夊簭鍒楄〃鏍煎紡锛?. [ ] 鎴?1. [x]
    const unorderedMatch = text.match(/^([\t ]*)([-*+鈥)\s\[([ xX])\](\s|$)/);
    const orderedMatch = text.match(/^([\t ]*)(\d+\.)\s\[([ xX])\](\s|$)/);
    
    const todoMatch = unorderedMatch || orderedMatch;
    if (!todoMatch) continue;
    
    const isOrderedList = !!orderedMatch;
    const indent = todoMatch[1].length;
    const marker = todoMatch[2];
    const isChecked = todoMatch[3].toLowerCase() === 'x';
    
    // 鎵惧埌 [ 鐨勪綅缃?
    const bracketIndex = text.indexOf('[');
    if (bracketIndex === -1) continue;
    
    // 璁＄畻 ] 鍚庨潰绌烘牸鐨勪綅缃紙鍦ㄨ鍐呯殑鍋忕Щ锛?
    const checkboxEndOffset = bracketIndex + 4; // [ ] 鍔犵┖鏍煎叡4涓瓧绗?
    
    // 濡傛灉鍏夋爣鍦ㄥ綋鍓嶈锛屼笖鍏夋爣浣嶇疆鍦ㄥ閫夋鍖哄煙鍐呮垨绱ч偦澶嶉€夋鍚庨潰锛屼笉鏄剧ず澶嶉€夋
    if (i === cursorLineNumber && cursorOffset <= checkboxEndOffset) {
      // 濡傛灉鏄棤搴忓垪琛ㄤ笖鏍囪鏄?鈥紝鏇挎崲涓?- 鏄剧ず
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
      
      // 濡傛灉宸插畬鎴愶紝浠嶇劧娣诲姞鍒犻櫎绾挎牱寮?
      if (isChecked) {
        const contentStart = line.from + bracketIndex + 4; // [ ] 鍚庨潰鐨勫唴瀹瑰紑濮嬩綅缃?
        if (contentStart < line.to) {
          decorations.push(
            Decoration.mark({ class: 'cm-todo-completed' }).range(contentStart, line.to)
          );
        }
      }
      continue;
    }
    
    const checkboxStart = line.from + bracketIndex;
    // 鏇挎崲 [ ] 鎴?[x] 浠ュ強鍚庨潰鐨勭┖鏍硷紙鍏?涓瓧绗︼級
    const checkboxEnd = checkboxStart + 4;
    
    // 濡傛灉鏄棤搴忓垪琛紝鏇挎崲鍒楄〃鏍囪涓哄渾鐐?
    if (!isOrderedList) {
      const markerStart = line.from + indent;
      const markerEnd = markerStart + 1;
      decorations.push(
        Decoration.replace({
          widget: new BulletWidget(indent),
        }).range(markerStart, markerEnd)
      );
    }
    
    // 鏇挎崲 [ ] 鎴?[x] 鍙婂悗闈㈢殑绌烘牸涓哄閫夋
    decorations.push(
      Decoration.replace({
        widget: new CheckboxWidget(isChecked, checkboxStart, 4, view),
      }).range(checkboxStart, checkboxEnd)
    );
    
    // 濡傛灉宸插畬鎴愶紝涓哄唴瀹规坊鍔犲垹闄ょ嚎鏍峰紡
    if (isChecked) {
      const contentStart = checkboxEnd;
      if (contentStart < line.to) {
        decorations.push(
          Decoration.mark({ class: 'cm-todo-completed' }).range(contentStart, line.to)
        );
      }
    }
  }

  // 鎸変綅缃帓搴忚楗板櫒
  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations, true);
}

/**
 * 寰呭姙娓呭崟瑁呴グ鍣?ViewPlugin
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
 * 寮曠敤鍧楃珫绾?Widget - 鍦ㄨ棣栨樉绀虹珫绾?
 */
class BlockquoteBarWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-blockquote-bar-container';
    // 鏍规嵁寮曠敤灞傜骇鏄剧ず澶氭潯绔栫嚎
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
 * 寮曠敤鍧?> 绗﹀彿 Widget - 鏍规嵁閫変腑鐘舵€佹樉绀?闅愯棌
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
    // 濮嬬粓鏄剧ず > 绗﹀彿鍔犱竴涓┖鏍硷紝纭繚瀵归綈
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
 * 瑙ｆ瀽寮曠敤鍧楀苟鍒涘缓瑁呴グ鍣?
 * 鍦ㄨ棣栨坊鍔犵珫绾匡紝鏍规嵁鍏夋爣浣嶇疆鏄剧ず/闅愯棌 > 绗﹀彿
 * 娣诲姞琛岀骇瑁呴グ鍣ㄧ‘淇濆紩鐢ㄥ潡鍐呭濮嬬粓鏄剧ず鏂滀綋
 */
function parseBlockquote(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 鑾峰彇閫夊尯鑼冨洿
  const selection = state.selection.main;
  const selectionStartLine = doc.lineAt(selection.from).number;
  const selectionEndLine = doc.lineAt(selection.to).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // 鍖归厤寮曠敤鍧楁爣璁帮細鏀寔琛岄鏈夌┖鏍肩殑鎯呭喌锛圱AB 缂╄繘锛夛紝鍖呮嫭 > 鍚庨潰鐨勭┖鏍?
    const match = line.text.match(/^(\s*)(>+)(\s?)/);
    if (match) {
      const indent = match[1].length; // 缂╄繘绌烘牸鏁?
      const level = match[2].length; // 寮曠敤灞傜骇
      const markers = match[2]; // > 鎴?>> 绛?
      const space = match[3] || ''; // > 鍚庨潰鐨勭┖鏍硷紙鍙兘娌℃湁锛?
      
      // 鍒ゆ柇鏄惁鏄剧ず > 绗﹀彿锛氬厜鏍囧湪褰撳墠琛屾垨閫夊尯鍖呭惈褰撳墠琛?
      const isInSelection = i >= selectionStartLine && i <= selectionEndLine;
      
      // 娣诲姞琛岀骇瑁呴グ鍣紝纭繚寮曠敤鍧楄濮嬬粓鏄剧ず鏂滀綋
      decorations.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          class: 'cm-blockquote-line',
        }),
      });
      
      // 鍦?> 绗﹀彿浣嶇疆娣诲姞绔栫嚎 Widget锛堣€冭檻缂╄繘锛?
      decorations.push({
        from: line.from + indent,
        to: line.from + indent,
        decoration: Decoration.widget({
          widget: new BlockquoteBarWidget(level),
          side: -1, // 鍦ㄤ綅缃乏渚ф樉绀?
        }),
      });
      
      // 浣跨敤 replace 瑁呴グ鍣ㄦ浛鎹?> 绗﹀彿鍜岀┖鏍间负 Widget
      // Widget 濮嬬粓鏄剧ず "> "锛堝甫绌烘牸锛夛紝纭繚瀵归綈
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
 * 寮曠敤鍧楄楗板櫒 StateField - 灏?> 鏇挎崲涓虹珫绾?
 */
const blockquoteDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseBlockquote(state);
  },
  update(decorations, tr) {
    // 鏂囨。鍙樺寲鎴栧厜鏍囦綅缃彉鍖栨椂閮介渶瑕佹洿鏂?
    if (tr.docChanged || tr.selection) {
      return parseBlockquote(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 鏀寔鐨勭紪绋嬭瑷€鍒楄〃
 */
const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'scala', 'html', 'css', 'scss', 'less', 'json',
  'xml', 'yaml', 'markdown', 'sql', 'bash', 'shell', 'powershell', 'dockerfile',
  'plaintext', 'text'
];

/**
 * 浠ｇ爜琛岄珮浜?Widget - 浣跨敤 highlight.js 娓叉煋鍗曡浠ｇ爜
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
    // 蹇界暐浜嬩欢锛岄槻姝㈢偣鍑讳唬鐮佸唴瀹规椂杩涘叆鍘熷鏂囨湰鐘舵€?
    return true;
  }
}

/**
 * 琛屽唴浠ｇ爜楂樹寒 Widget - 浣跨敤 highlight.js 鑷姩妫€娴嬭瑷€骞堕珮浜?
 */
class InlineCodeWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-code-highlighted cm-inline-code';
    
    // 浣跨敤 highlight.js 鑷姩妫€娴嬭瑷€
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
 * 浠ｇ爜鍧椾俊鎭帴鍙?
 */
interface CodeBlockInfo {
  startLine: number;
  endLine: number;
  language: string;
  customName: string;
  code: string;
  from: number;
  to: number;
}

/**
 * 瑙ｆ瀽鏂囨。涓殑浠ｇ爜鍧?
 */
function parseCodeBlocks(state: EditorState): CodeBlockInfo[] {
  const blocks: CodeBlockInfo[] = [];
  const doc = state.doc;
  let inCodeBlock = false;
  let startLine = 0;
  let language = '';
  let customName = '';
  let codeLines: string[] = [];
  let blockFrom = 0;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 鍖归厤 ```language // name 鏍煎紡锛堝紑濮嬫爣璁帮級
    const startMatch = text.match(/^```(\w*)(\s*\/\/\s*(.*))?$/);
    // 鍖归厤缁撴潫鏍囪 ```锛堝彲鑳芥湁绌烘牸锛?
    const isEndMark = /^```\s*$/.test(text);

    if (!inCodeBlock && startMatch) {
      // 浠ｇ爜鍧楀紑濮?
      inCodeBlock = true;
      startLine = i;
      language = startMatch[1] || '';
      customName = startMatch[3] || '';
      codeLines = [];
      blockFrom = line.from;
    } else if (inCodeBlock && isEndMark) {
      // 浠ｇ爜鍧楃粨鏉?
      blocks.push({
        startLine,
        endLine: i,
        language,
        customName,
        code: codeLines.join('\n'),
        from: blockFrom,
        to: line.to
      });
      inCodeBlock = false;
    } else if (inCodeBlock) {
      // 浠ｇ爜鍧楀唴瀹?
      codeLines.push(text);
    }
  }

  return blocks;
}

/** 浠ｇ爜鍧楄緭鍑虹姸鎬佸瓨鍌紙鎸変唬鐮佸潡浣嶇疆绱㈠紩锛?*/
interface CodeBlockOutputState {
  content: string;
  isError: boolean;
  isClosed: boolean;
}
const codeBlockOutputStates = new Map<number, CodeBlockOutputState>();

/**
 * 瀹屾暣浠ｇ爜鍧?Widget - 灏嗘暣涓唬鐮佸潡娓叉煋涓轰竴涓崱鐗囩粍浠?
 */
class CodeBlockWidget extends WidgetType {
  private monacoContainer: HTMLElement | null = null;
  private headerElement: HTMLElement | null = null;
  private containerElement: HTMLElement | null = null;
  private codeAreaElement: HTMLElement | null = null;
  private collapseBtnElement: HTMLElement | null = null;
  private outputPanelElement: HTMLElement | null = null;
  private pendingLanguage: string | null = null;
  private viewRef: EditorView | null = null;
  private isCollapsed: boolean = false;

  constructor(readonly block: CodeBlockInfo) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    this.viewRef = view;
    
    // 浠?Store 鎭㈠鐘舵€?
    const savedState = useCodeBlockStore.getState().getBlockState(this.block.language, this.block.code);
    this.isCollapsed = savedState.isCollapsed;
    
    const container = document.createElement('div');
    container.className = 'cm-code-block-widget';
    this.containerElement = container;

    // 浠ｇ爜鍖哄煙锛堝甫琛屽彿锛? 鍏堝垱寤轰互鑾峰彇 monacoContainer 寮曠敤
    const codeArea = this.createCodeArea(view);
    this.codeAreaElement = codeArea;

    // 澶撮儴 - 鍚庡垱寤轰互渚胯闂?monacoContainer
    const header = this.createHeader(view);
    this.headerElement = header;
    container.appendChild(header);

    // 浠ｇ爜鍖哄煙锛堝甫琛屽彿锛?
    container.appendChild(codeArea);
    
    // 鎭㈠鎶樺彔鐘舵€?
    if (this.isCollapsed) {
      container.classList.add('collapsed');
      if (this.collapseBtnElement) {
        this.collapseBtnElement.style.transform = 'rotate(0deg)';
        this.collapseBtnElement.title = '灞曞紑';
      }
      if (this.codeAreaElement) {
        this.codeAreaElement.style.display = 'none';
      }
    }

    return container;
  }

  createHeader(view: EditorView): HTMLElement {
    const header = document.createElement('div');
    header.className = 'cm-code-block-header';

    // 宸︿晶鍖哄煙锛氭姌鍙犵澶?+ 鍚嶇О杈撳叆妗?
    const leftSection = document.createElement('div');
    leftSection.className = 'cm-code-block-header-left';

    // 鎶樺彔绠ご
    const collapseBtn = document.createElement('span');
    collapseBtn.className = 'cm-code-block-collapse-btn';
    collapseBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg>';
    collapseBtn.style.transform = 'rotate(90deg)';
    collapseBtn.title = '鎶樺彔';
    this.collapseBtnElement = collapseBtn;

    // 鎶樺彔鐐瑰嚮浜嬩欢
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    // 鍚嶇О杈撳叆妗?
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cm-code-block-name-input';
    nameInput.placeholder = '璇疯緭鍏ヤ唬鐮佸潡鍚嶇О';
    
    // 浠?Store 鎭㈠鍚嶇О锛屽鏋滄病鏈夊垯浣跨敤鏂囨。涓殑鍚嶇О
    const savedState = useCodeBlockStore.getState().getBlockState(this.block.language, this.block.code);
    const displayName = savedState.name || this.block.customName;
    nameInput.value = displayName;
    const originalName = displayName;
    
    nameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      
      // 澶勭悊琚?Electron 鑿滃崟鎷︽埅鐨勫揩鎹烽敭
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (isCtrlOrMeta) {
        const key = e.key.toLowerCase();
        if (key === 'x' || key === 'c' || key === 'v' || key === 'a' || key === 'z') {
          // 闃绘浜嬩欢鍐掓场鍜岄粯璁よ涓?
          e.stopImmediatePropagation();
          e.preventDefault();
          
          const input = nameInput;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          const selectedText = input.value.substring(start, end);
          
          if (key === 'x' && selectedText) {
            // 鍓垏锛氬鍒堕€変腑鏂囨湰鍒板壀璐存澘锛岀劧鍚庡垹闄?
            navigator.clipboard.writeText(selectedText).then(() => {
              input.value = input.value.substring(0, start) + input.value.substring(end);
              input.setSelectionRange(start, start);
            });
          } else if (key === 'c' && selectedText) {
            // 澶嶅埗锛氬鍒堕€変腑鏂囨湰鍒板壀璐存澘
            navigator.clipboard.writeText(selectedText);
          } else if (key === 'v') {
            // 绮樿创锛氫粠鍓创鏉胯鍙栧苟鎻掑叆
            navigator.clipboard.readText().then((text) => {
              input.value = input.value.substring(0, start) + text + input.value.substring(end);
              const newPos = start + text.length;
              input.setSelectionRange(newPos, newPos);
            });
          } else if (key === 'a') {
            // 鍏ㄩ€?
            input.select();
          } else if (key === 'z') {
            // 鎾ら攢 - 浣跨敤 execCommand 鍥犱负娌℃湁鍏朵粬鏂瑰紡
            document.execCommand('undo');
          }
          return;
        }
      }
      
      if (e.key === 'Enter') {
        nameInput.blur();
      }
    }, true);
    nameInput.addEventListener('blur', () => {
      // 鍙湁褰撳悕绉扮湡姝ｆ敼鍙樻椂鎵嶄繚瀛樺埌 Store
      // 涓嶈Е鍙戞枃妗ｆ洿鏂帮紝閬垮厤 CodeMirror 鍐呴儴閿欒
      // 鍚嶇О浼氬湪鏂囨。淇濆瓨鏃跺悓姝ュ埌鏂囦欢鍐呭
      const newName = nameInput.value;
      if (newName !== originalName) {
        useCodeBlockStore.getState().setBlockName(this.block.language, this.block.code, this.block.from, newName);
      }
    });

    leftSection.appendChild(collapseBtn);
    leftSection.appendChild(nameInput);

    // 鍙充晶鍖哄煙
    const rightSection = document.createElement('div');
    rightSection.className = 'cm-code-block-header-right';

    // 浠?Store 鎭㈠璇█锛堝鏋滄湁淇濆瓨鐨勮瘽锛?
    const savedLangState = useCodeBlockStore.getState().getBlockState(this.block.language, this.block.code);
    const displayLanguage = savedLangState.language !== 'plaintext' ? savedLangState.language : (this.block.language || 'plaintext');

    // 璇█閫夋嫨
    const langDropdown = this.createDropdown(view, displayLanguage, SUPPORTED_LANGUAGES, (lang) => this.updateLanguage(view, lang), '鎼滅储璇█...');

    // 鍒嗛殧绗?
    const divider1 = document.createElement('span');
    divider1.className = 'cm-code-block-divider';

    // 涓婚閫夋嫨 - 鍙洿鏂板綋鍓嶄唬鐮佸潡涓婚
    const { themeList, currentTheme } = useThemeStore.getState();
    const themeNames = themeList.map((t) => t.name || t.id);
    const currentThemeName = currentTheme?.name || currentTheme?.id || 'vs-dark';
    const themeDropdown = this.createDropdown(
      view,
      currentThemeName,
      themeNames,
      async (themeName) => {
        const theme = themeList.find((t) => t.name === themeName || t.id === themeName);
        if (theme && this.monacoContainer) {
          // 鏇存柊 Monaco 缂栬緫鍣ㄤ富棰?
          updateMonacoTheme(this.monacoContainer, theme.id);

          // 鑾峰彇涓婚棰滆壊骞舵洿鏂版牱寮?
          const themeData = await themeService.getTheme(theme.id);
          if (themeData) {
            const bgColor = themeData.colors['editor.background'] || themeData.colors['editorWidget.background'];
            const borderColor = themeData.colors['panel.border'] || themeData.colors['editorWidget.border'];
            const fgColor = themeData.colors['editor.foreground'] || themeData.colors['foreground'];

            // 鏇存柊澶撮儴鏍峰紡
            if (this.headerElement) {
              if (bgColor) {
                this.headerElement.style.backgroundColor = bgColor;
              }
              if (borderColor) {
                this.headerElement.style.borderBottomColor = borderColor;
              }
              if (fgColor) {
                this.headerElement.style.color = fgColor;
              }

              // 鏇存柊澶撮儴鍐呮墍鏈変笅鎷夋瑙﹀彂鍣ㄧ殑鏍峰紡
              const dropdownTriggers = this.headerElement.querySelectorAll('.cm-code-block-dropdown-trigger');
              dropdownTriggers.forEach((trigger) => {
                if (bgColor) {
                  (trigger as HTMLElement).style.backgroundColor = bgColor;
                }
                if (borderColor) {
                  (trigger as HTMLElement).style.borderColor = borderColor;
                }
                if (fgColor) {
                  (trigger as HTMLElement).style.color = fgColor;
                }
              });

              // 鏇存柊澶撮儴鍐呮墍鏈夋寜閽殑鏍峰紡
              const actionBtns = this.headerElement.querySelectorAll('.cm-code-block-action-btn');
              actionBtns.forEach((btn) => {
                if (fgColor) {
                  (btn as HTMLElement).style.color = fgColor;
                }
              });

              // 鏇存柊鍒嗛殧绗︽牱寮?
              const dividers = this.headerElement.querySelectorAll('.cm-code-block-divider');
              dividers.forEach((divider) => {
                if (borderColor) {
                  (divider as HTMLElement).style.backgroundColor = borderColor;
                }
              });
            }

            // 鏇存柊鏁翠釜瀹瑰櫒鐨勮竟妗?
            if (this.containerElement && borderColor) {
              this.containerElement.style.borderColor = borderColor;
            }

            // 鏇存柊杈撳嚭闈㈡澘鏍峰紡
            if (this.outputPanelElement) {
              if (bgColor) {
                this.outputPanelElement.style.backgroundColor = bgColor;
              }
              if (borderColor) {
                this.outputPanelElement.style.borderTopColor = borderColor;
              }
              const outputHeader = this.outputPanelElement.querySelector('.cm-code-block-output-header') as HTMLElement;
              if (outputHeader) {
                if (bgColor) {
                  outputHeader.style.backgroundColor = bgColor;
                }
                if (borderColor) {
                  outputHeader.style.borderBottomColor = borderColor;
                }
              }
              const outputTitle = this.outputPanelElement.querySelector('.cm-code-block-output-title') as HTMLElement;
              if (outputTitle && fgColor) {
                outputTitle.style.color = fgColor;
              }
              const outputContent = this.outputPanelElement.querySelector('.cm-code-block-output-content') as HTMLElement;
              if (outputContent && fgColor) {
                outputContent.style.color = fgColor;
              }
            }
          }
          
          // 淇濆瓨涓婚鍒?Store
          useCodeBlockStore.getState().setBlockTheme(this.block.language, this.block.code, theme.id);
        }
      },
      '鎼滅储涓婚...'
    );

    // 鍒嗛殧绗?
    const divider2 = document.createElement('span');
    divider2.className = 'cm-code-block-divider';

    // 澶嶅埗鎸夐挳
    const copyBtn = document.createElement('span');
    copyBtn.className = 'cm-code-block-action-btn';
    copyBtn.title = '澶嶅埗浠ｇ爜';
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></svg>';
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(this.block.code));

    // 杩愯鎸夐挳
    const runBtn = document.createElement('span');
    runBtn.className = 'cm-code-block-action-btn';
    runBtn.title = '杩愯浠ｇ爜';
    runBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/><circle cx="12" cy="12" r="10"/></svg>';
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.runCode();
    });

    // 鏇村鑿滃崟
    const moreBtn = document.createElement('span');
    moreBtn.className = 'cm-code-block-action-btn';
    moreBtn.title = '鏇村鎿嶄綔';
    moreBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';

    // 鍒犻櫎鎸夐挳
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-code-block-action-btn cm-code-block-delete-btn';
    deleteBtn.title = '删除代码块';
    deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteCodeBlock(view);
    });

    rightSection.appendChild(langDropdown);
    rightSection.appendChild(divider1);
    rightSection.appendChild(themeDropdown);
    rightSection.appendChild(divider2);
    rightSection.appendChild(copyBtn);
    rightSection.appendChild(runBtn);
    rightSection.appendChild(deleteBtn);
    rightSection.appendChild(moreBtn);

    header.appendChild(leftSection);
    header.appendChild(rightSection);
    return header;
  }

  createCodeArea(view: EditorView): HTMLElement {
    const codeArea = document.createElement('div');
    codeArea.className = 'cm-code-block-content';

    // 绂佺敤浠ｇ爜鍧楀尯鍩熺殑鍙抽敭鑿滃崟
    codeArea.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // 闃绘閿洏浜嬩欢鍐掓场鍒?CodeMirror
    codeArea.addEventListener('keydown', (e) => {
      e.stopPropagation();
    }, false);

    const blockInfo = this.block;
    const lang = this.block.language || 'plaintext';
    const initialCode = this.block.code || '';

    // Monaco Editor 瀹瑰櫒
    const monacoContainer = document.createElement('div');
    monacoContainer.className = 'cm-code-block-monaco-container';
    this.monacoContainer = monacoContainer;

    // 鏇存柊婧愮爜鏍囪
    let isUpdating = false;

    const updateSource = (newCode: string) => {
      if (isUpdating) return;

      // 楠岃瘉缂栬緫鍣ㄦ槸鍚︿粛鐒舵湁鏁?
      if (!view.dom || !view.dom.isConnected) {
        return;
      }

      isUpdating = true;

      try {
        const docLength = view.state.doc.length;

        // 楠岃瘉璧峰浣嶇疆鏄惁鏈夋晥
        if (blockInfo.from >= docLength) {
          isUpdating = false;
          return;
        }

        const startLine = view.state.doc.lineAt(blockInfo.from);

        // 楠岃瘉璧峰琛屾槸鍚︿粛鐒舵槸浠ｇ爜鍧楀紑濮嬫爣璁?
        if (!startLine.text.startsWith('```')) {
          isUpdating = false;
          return;
        }

        // 浠庤捣濮嬭寮€濮嬶紝鏌ユ壘浠ｇ爜鍧楃殑瀹為檯缁撴潫浣嶇疆
        let endLineNum = startLine.number + 1;
        let endPos = startLine.to;
        const totalLines = view.state.doc.lines;

        while (endLineNum <= totalLines) {
          const line = view.state.doc.line(endLineNum);
          if (/^```\s*$/.test(line.text)) {
            endPos = line.to;
            break;
          }
          endLineNum++;
        }

        // 鏋勫缓鏂扮殑浠ｇ爜鍧楁枃鏈?
        const langLine = startLine.text;
        const newCodeBlock = langLine + '\n' + newCode + '\n```';

        view.dispatch({
          changes: { from: startLine.from, to: endPos, insert: newCodeBlock }
        });

        isUpdating = false;
      } catch (e) {
        console.error('鏇存柊浠ｇ爜鍧楀け璐?', e);
        isUpdating = false;
      }
    };

    // 寤惰繜娓叉煋 Monaco锛岄伩鍏嶉樆濉?
    let pendingCode: string | null = null;
    const blockLanguage = this.block.language;
    const blockCode = this.block.code;

    requestAnimationFrame(() => {
      if (!monacoContainer.isConnected) return;

      // 浠?Store 鑾峰彇淇濆瓨鐨勭姸鎬侊紙鍖呮嫭婊氬姩浣嶇疆锛?
      const savedState = useCodeBlockStore.getState().getBlockState(blockLanguage, blockCode);
      console.log('[CodeMirrorEditor] 浠?Store 鑾峰彇婊氬姩浣嶇疆:', savedState.scrollTop);

      renderMonacoToElement(monacoContainer, {
        code: initialCode,
        language: lang,
        onChange: (value: string) => {
          // 鍙褰曟渶鏂扮殑浠ｇ爜锛屼笉绔嬪嵆鏇存柊婧愮爜
          pendingCode = value;
        },
        onFocus: () => {
          // 闃绘 CodeMirror 鑾峰彇鐒︾偣
        },
        onBlur: () => {
          // 澶卞幓鐒︾偣鏃舵墠鏇存柊婧愮爜
          if (pendingCode !== null && pendingCode !== initialCode) {
            const codeToUpdate = pendingCode;
            pendingCode = null;
            // 浣跨敤 setTimeout 纭繚鍦?CodeMirror 瀹屾垚褰撳墠鏇存柊鍚庡啀鎵ц
            setTimeout(() => {
              // 鍐嶆楠岃瘉缂栬緫鍣ㄦ槸鍚︽湁鏁?
              if (view.dom && view.dom.isConnected) {
                try {
                  updateSource(codeToUpdate);
                } catch (e) {
                  console.warn('鏇存柊浠ｇ爜鍧楀け璐ワ紝鍙兘鏄紪杈戝櫒鐘舵€佸凡鏀瑰彉:', e);
                }
              }
            }, 50);
          } else {
            pendingCode = null;
          }
        },
        onEditorMount: (editorInstance) => {
          // 鐩戝惉婊氬姩浜嬩欢锛屽疄鏃朵繚瀛樻粴鍔ㄤ綅缃埌 Store
          editorInstance.onDidScrollChange(() => {
            const scrollTop = editorInstance.getScrollTop();
            useCodeBlockStore.getState().setBlockScrollPosition(blockLanguage, blockCode, scrollTop, null);
          });
        },
        minHeight: 60,
        maxHeight: 800,
        initialScrollTop: savedState.scrollTop
      });
      
      // 浠?Store 鎭㈠涓婚
      if (savedState.themeId && monacoContainer) {
        updateMonacoTheme(monacoContainer, savedState.themeId);
        // 鍚屾椂鏇存柊澶撮儴鏍峰紡
        this.applyThemeToHeader(savedState.themeId);
      }
    });

    codeArea.appendChild(monacoContainer);

    return codeArea;
  }

  createDropdown(view: EditorView, currentValue: string, options: string[], onChange: (value: string) => void, searchPlaceholder: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-code-block-dropdown';

    // 璺熻釜褰撳墠閫変腑鐨勫€?
    let selectedValue = currentValue;

    const trigger = document.createElement('div');
    trigger.className = 'cm-code-block-dropdown-trigger';

    const text = document.createElement('span');
    text.className = 'cm-code-block-dropdown-text';
    text.textContent = currentValue;

    const arrow = document.createElement('span');
    arrow.className = 'cm-code-block-dropdown-arrow';
    arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16"><path d="M4.5 5.5L8 9l3.5-3.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';

    trigger.appendChild(text);
    trigger.appendChild(arrow);

    // 灏嗚彍鍗曟覆鏌撳埌 body 灞傜骇锛岄伩鍏嶈鐖跺厓绱犺鍓?
    const menu = document.createElement('div');
    menu.className = 'cm-code-block-dropdown-menu cm-code-block-dropdown-portal';
    menu.style.display = 'none';
    menu.style.position = 'fixed';

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'cm-code-block-dropdown-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = searchPlaceholder;
    searchInput.addEventListener('mousedown', (e) => e.stopPropagation());
    searchInput.addEventListener('keydown', (e) => e.stopPropagation());
    searchWrapper.appendChild(searchInput);
    menu.appendChild(searchWrapper);

    const list = document.createElement('div');
    list.className = 'cm-code-block-dropdown-list';

    const renderList = (filter: string = '') => {
      list.innerHTML = '';
      const filteredOptions = options.filter((opt) => opt.toLowerCase().includes(filter.toLowerCase()));
      for (const opt of filteredOptions) {
        const item = document.createElement('div');
        item.className = 'cm-code-block-dropdown-item';
        if (opt === selectedValue) item.classList.add('selected');
        item.textContent = opt;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedValue = opt;
          onChange(opt);
          text.textContent = opt;
          hideMenu();
        });
        list.appendChild(item);
      }
    };

    renderList();
    menu.appendChild(list);
    searchInput.addEventListener('input', () => renderList(searchInput.value));

    // 鏇存柊鑿滃崟浣嶇疆
    const updateMenuPosition = () => {
      const rect = trigger.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.right - menu.offsetWidth}px`;
    };

    // 闅愯棌鑿滃崟
    const hideMenu = () => {
      menu.style.display = 'none';
      container.classList.remove('open');
      if (menu.parentNode === document.body) {
        document.body.removeChild(menu);
      }
    };

    // 鏄剧ず鑿滃崟
    const showMenu = () => {
      document.body.appendChild(menu);
      menu.style.display = 'block';
      container.classList.add('open');
      updateMenuPosition();
      searchInput.value = '';
      renderList();
      searchInput.focus();
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const isOpen = menu.style.display !== 'none';
      if (isOpen) {
        hideMenu();
      } else {
        showMenu();
      }
    });

    const handleClickOutside = (e: MouseEvent) => {
      if (!container.contains(e.target as Node) && !menu.contains(e.target as Node)) {
        hideMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    // 婊氬姩鏃舵洿鏂拌彍鍗曚綅缃垨鍏抽棴
    const handleScroll = (e: Event) => {
      if (menu.style.display !== 'none') {
        // 妫€鏌ヨЕ鍙戝櫒鏄惁浠嶅湪瑙嗗彛鍐?
        const rect = trigger.getBoundingClientRect();
        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;

        if (isInViewport) {
          // 鏇存柊鑿滃崟浣嶇疆
          updateMenuPosition();
        } else {
          // 瑙﹀彂鍣ㄤ笉鍦ㄨ鍙ｅ唴锛屽叧闂彍鍗?
          hideMenu();
        }
      }
    };

    // 鐩戝惉鎵€鏈夋粴鍔ㄤ簨浠讹紙鍖呮嫭缂栬緫鍣ㄥ唴閮ㄦ粴鍔級
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    container.appendChild(trigger);
    return container;
  }

  updateLanguage(_view: EditorView, newLang: string): void {
    // 鏇存柊 Store 涓殑璇█鐘舵€?
    useCodeBlockStore.getState().setBlockLanguage(this.block.language, this.block.code, newLang);
    
    // 鏇存柊 Monaco 缂栬緫鍣ㄧ殑璇█鏄剧ず
    if (this.monacoContainer) {
      updateMonacoLanguage(this.monacoContainer, newLang);
    }
  }

  // 鍒囨崲鎶樺彔鐘舵€?
  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    
    // 淇濆瓨鎶樺彔鐘舵€佸埌 Store
    useCodeBlockStore.getState().setBlockCollapsed(this.block.language, this.block.code, this.isCollapsed);
    
    const blockKey = this.block.from;
    const savedState = codeBlockOutputStates.get(blockKey);

    if (this.codeAreaElement && this.collapseBtnElement) {
      if (this.isCollapsed) {
        // 鎶樺彔锛氶殣钘忎唬鐮佸尯鍩熷拰杈撳嚭闈㈡澘
        this.codeAreaElement.style.display = 'none';
        if (this.outputPanelElement) {
          this.outputPanelElement.style.display = 'none';
        }
        this.collapseBtnElement.style.transform = 'rotate(0deg)';
        this.collapseBtnElement.title = '灞曞紑';
        this.containerElement?.classList.add('collapsed');
      } else {
        // 灞曞紑锛氭樉绀轰唬鐮佸尯鍩燂紝濡傛灉鏈夎緭鍑轰笖鏈鍏抽棴鍒欐樉绀鸿緭鍑洪潰鏉?
        this.codeAreaElement.style.display = 'block';
        if (this.outputPanelElement && savedState && !savedState.isClosed) {
          this.outputPanelElement.style.display = 'block';
        }
        this.collapseBtnElement.style.transform = 'rotate(90deg)';
        this.collapseBtnElement.title = '鎶樺彔';
        this.containerElement?.classList.remove('collapsed');
      }
    }
  }

  // 搴旂敤涓婚鍒板ご閮ㄦ牱寮?
  async applyThemeToHeader(themeId: string): Promise<void> {
    const themeData = await themeService.getTheme(themeId);
    if (!themeData) return;
    
    const bgColor = themeData.colors['editor.background'] || themeData.colors['editorWidget.background'];
    const borderColor = themeData.colors['panel.border'] || themeData.colors['editorWidget.border'];
    const fgColor = themeData.colors['editor.foreground'] || themeData.colors['foreground'];

    // 鏇存柊澶撮儴鏍峰紡
    if (this.headerElement) {
      if (bgColor) {
        this.headerElement.style.backgroundColor = bgColor;
      }
      if (borderColor) {
        this.headerElement.style.borderBottomColor = borderColor;
      }
      if (fgColor) {
        this.headerElement.style.color = fgColor;
      }

      // 鏇存柊澶撮儴鍐呮墍鏈変笅鎷夋瑙﹀彂鍣ㄧ殑鏍峰紡
      const dropdownTriggers = this.headerElement.querySelectorAll('.cm-code-block-dropdown-trigger');
      dropdownTriggers.forEach((trigger) => {
        if (bgColor) {
          (trigger as HTMLElement).style.backgroundColor = bgColor;
        }
        if (borderColor) {
          (trigger as HTMLElement).style.borderColor = borderColor;
        }
        if (fgColor) {
          (trigger as HTMLElement).style.color = fgColor;
        }
      });

      // 鏇存柊澶撮儴鍐呮墍鏈夋寜閽殑鏍峰紡
      const actionBtns = this.headerElement.querySelectorAll('.cm-code-block-action-btn');
      actionBtns.forEach((btn) => {
        if (fgColor) {
          (btn as HTMLElement).style.color = fgColor;
        }
      });

      // 鏇存柊鍒嗛殧绗︽牱寮?
      const dividers = this.headerElement.querySelectorAll('.cm-code-block-divider');
      dividers.forEach((divider) => {
        if (borderColor) {
          (divider as HTMLElement).style.backgroundColor = borderColor;
        }
      });
    }

    // 鏇存柊鏁翠釜瀹瑰櫒鐨勮竟妗?
    if (this.containerElement && borderColor) {
      this.containerElement.style.borderColor = borderColor;
    }

    // 鏇存柊杈撳嚭闈㈡澘鏍峰紡
    if (this.outputPanelElement) {
      if (bgColor) {
        this.outputPanelElement.style.backgroundColor = bgColor;
      }
      if (borderColor) {
        this.outputPanelElement.style.borderTopColor = borderColor;
      }
      const outputHeader = this.outputPanelElement.querySelector('.cm-code-block-output-header') as HTMLElement;
      if (outputHeader) {
        if (bgColor) {
          outputHeader.style.backgroundColor = bgColor;
        }
        if (borderColor) {
          outputHeader.style.borderBottomColor = borderColor;
        }
      }
      const outputTitle = this.outputPanelElement.querySelector('.cm-code-block-output-title') as HTMLElement;
      if (outputTitle && fgColor) {
        outputTitle.style.color = fgColor;
      }
      const outputContent = this.outputPanelElement.querySelector('.cm-code-block-output-content') as HTMLElement;
      if (outputContent && fgColor) {
        outputContent.style.color = fgColor;
      }
    }
  }

  // 鍒犻櫎浠ｇ爜鍧?
  deleteCodeBlock(view: EditorView): void {
    try {
      if (!view.dom || !view.dom.isConnected) return;
      if (this.block.from > view.state.doc.length) return;

      // 鍒犻櫎鏁翠釜浠ｇ爜鍧楋紙浠庡紑濮嬫爣璁板埌缁撴潫鏍囪锛?
      view.dispatch({
        changes: { from: this.block.from, to: this.block.to }
      });
    } catch (e) {
      console.error('鍒犻櫎浠ｇ爜鍧楀け璐?', e);
    }
  }

  // 杩愯浠ｇ爜
  async runCode(): Promise<void> {
    const language = this.block.language || 'plaintext';
    
    // 妫€鏌ヨ瑷€鏄惁鏀寔杩愯
    if (!codeRunnerService.isSupportedLanguage(language)) {
      this.showOutput(`涓嶆敮鎸佽繍琛?${language} 浠ｇ爜`, true);
      return;
    }

    // 鑾峰彇褰撳墠浠ｇ爜
    const code = this.block.code;
    if (!code.trim()) {
      this.showOutput('浠ｇ爜涓虹┖', true);
      return;
    }

    // 鏄剧ず杩愯涓姸鎬?
    this.showOutput('杩愯涓?..', false, true);

    try {
      const result = await codeRunnerService.runCode({
        code,
        language: language as SupportedLanguage,
        timeout: 30000
      });

      if (result.success) {
        const output = result.stdout || '(鏃犺緭鍑?';
        this.showOutput(output, false);
      } else {
        const errorMsg = result.error || result.stderr || '鎵ц澶辫触';
        this.showOutput(errorMsg, true);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.showOutput(errorMsg, true);
    }
  }

  // 鏄剧ず杈撳嚭闈㈡澘
  private showOutput(content: string, isError: boolean, isLoading = false): void {
    if (!this.containerElement) return;

    const blockKey = this.block.from;
    const savedState = codeBlockOutputStates.get(blockKey);

    // 濡傛灉鐢ㄦ埛宸插叧闂緭鍑洪潰鏉夸笖涓嶆槸鏂扮殑杩愯璇锋眰锛坙oading锛夛紝鍒欎笉鏄剧ず
    if (savedState?.isClosed && !isLoading) return;

    // 鏂扮殑杩愯璇锋眰鏃堕噸缃叧闂姸鎬?
    if (isLoading) {
      codeBlockOutputStates.set(blockKey, {
        content: '',
        isError: false,
        isClosed: false
      });
    }

    // 淇濆瓨杈撳嚭鍐呭锛堥潪 loading 鐘舵€佹椂锛?
    if (!isLoading) {
      codeBlockOutputStates.set(blockKey, {
        content,
        isError,
        isClosed: false
      });
    }

    // 鏌ユ壘鎴栧垱寤鸿緭鍑洪潰鏉?
    let outputPanel = this.containerElement.querySelector('.cm-code-block-output') as HTMLElement;
    
    if (!outputPanel) {
      outputPanel = document.createElement('div');
      outputPanel.className = 'cm-code-block-output';
      this.containerElement.appendChild(outputPanel);
    }
    this.outputPanelElement = outputPanel;

    // 娓呯┖骞惰缃唴瀹?
    outputPanel.innerHTML = '';
    
    // 杈撳嚭澶撮儴
    const header = document.createElement('div');
    header.className = 'cm-code-block-output-header';
    
    const title = document.createElement('span');
    title.className = 'cm-code-block-output-title';
    title.textContent = isLoading ? '运行中' : (isError ? '错误' : '输出');
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'cm-code-block-output-close';
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', () => {
      const currentState = codeBlockOutputStates.get(blockKey);
      if (currentState) {
        codeBlockOutputStates.set(blockKey, { ...currentState, isClosed: true });
      }
      this.outputPanelElement = null;
      outputPanel.remove();
    });
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    outputPanel.appendChild(header);
    
    // 杈撳嚭鍐呭
    const contentEl = document.createElement('pre');
    contentEl.className = 'cm-code-block-output-content';
    if (isError) {
      contentEl.classList.add('cm-code-block-output-error');
    }
    if (isLoading) {
      contentEl.classList.add('cm-code-block-output-loading');
    }
    contentEl.textContent = content;
    outputPanel.appendChild(contentEl);
  }

  // Widget 閿€姣佹椂淇濆瓨婊氬姩浣嶇疆
  destroy(): void {
    // 淇濆瓨 Monaco 缂栬緫鍣ㄧ殑婊氬姩浣嶇疆鍒?Store
    if (this.monacoContainer) {
      const scrollPosition = getMonacoScrollPosition(this.monacoContainer);
      if (scrollPosition) {
        useCodeBlockStore.getState().setBlockScrollPosition(
          this.block.language,
          this.block.code,
          scrollPosition.scrollTop,
          null
        );
      }
      // 鍗歌浇 Monaco 缂栬緫鍣?
      unmountMonacoFromElement(this.monacoContainer);
    }
  }

  eq(other: CodeBlockWidget): boolean {
    // 涓嶆瘮杈?from 浣嶇疆锛屽洜涓哄湪浠ｇ爜鍧椾笂鏂规彃鍏ュ唴瀹规椂浣嶇疆浼氬彉鍖?
    // 鍙瘮杈冭瑷€鍜屼唬鐮佸唴瀹癸紝杩欐牱鍙互閬垮厤浣嶇疆鍙樺寲瀵艰嚧鐨?Widget 閲嶅缓
    return (
      this.block.language === other.block.language &&
      this.block.code === other.block.code
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 瑙ｆ瀽浠ｇ爜鍧楀苟鍒涘缓瑁呴グ鍣?
 */
function parseCodeBlockDecorations(state: EditorState): DecorationSet {
  const blocks = parseCodeBlocks(state);
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];

  for (const block of blocks) {
    decorations.push({
      from: block.from,
      to: block.to,
      decoration: Decoration.replace({
        widget: new CodeBlockWidget(block),
        block: true
      })
    });
  }

  decorations.sort((a, b) => a.from - b.from);
  return RangeSet.of(decorations.map((d) => d.decoration.range(d.from, d.to)));
}

/**
 * 浠ｇ爜鍧楄楗板櫒 StateField
 */
const codeBlockDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseCodeBlockDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return parseCodeBlockDecorations(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f)
});

/**
 * 鍒嗗壊绾?Widget - 灏?--- 鎴?*** 鎴?___ 娓叉煋涓烘按骞冲垎鍓茬嚎
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
 * 瑙ｆ瀽鍒嗗壊绾垮苟鍒涘缓瑁呴グ鍣?
 * 鍖归厤鐙珛琛岀殑 ---銆?**銆乢__ 锛堣嚦灏?涓瓧绗︼級
 */
function parseHorizontalRules(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 鑾峰彇褰撳墠鍏夋爣鎵€鍦ㄨ
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text.trim();

    // 鍖归厤 ---銆?**銆乢__ 锛堣嚦灏?涓浉鍚屽瓧绗︼紝鍙互鏈夌┖鏍硷級
    if (/^[-]{3,}$|^[*]{3,}$|^[_]{3,}$/.test(text)) {
      // 濡傛灉鍏夋爣鍦ㄥ綋鍓嶈锛屾樉绀哄師濮嬫枃鏈?
      if (i === cursorLine) {
        continue;
      }

      // 鐢?Widget 鏇挎崲鏁磋鍐呭
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
 * 鍒嗗壊绾胯楗板櫒 StateField
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
 * 瑙ｆ瀽鏍囬璇硶骞跺垱寤洪殣钘忚楗板櫒锛堟簮鐮佹ā寮忎笅鐨勬墍瑙佸嵆鎵€寰楋級
 * 褰撳厜鏍囦笉鍦ㄦ爣棰樿鏃讹紝闅愯棌 # 绗﹀彿
 * 濡傛灉鏍囬琛屾病鏈夊唴瀹癸紙鍙湁 # 绗﹀彿锛夛紝涓嶉殣钘?
 */
function parseHeadingSyntaxHide(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 鑾峰彇褰撳墠鍏夋爣鎵€鍦ㄨ
  const cursorLine = state.selection.main.head;
  const currentLineNumber = doc.lineAt(cursorLine).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const match = line.text.match(/^(#{1,6})\s/);
    if (match) {
      // 濡傛灉鍏夋爣鍦ㄥ綋鍓嶆爣棰樿锛屼笉闅愯棌 # 绗﹀彿
      if (i === currentLineNumber) {
        continue;
      }
      
      // 濡傛灉鏍囬琛屾病鏈夊唴瀹癸紙鍙湁 # 绗﹀彿鍜岀┖鏍硷級锛屼笉闅愯棌
      const content = line.text.slice(match[0].length);
      if (content.trim().length === 0) {
        continue;
      }
      
      // 闅愯棌 # 绗﹀彿鍜屽悗闈㈢殑绌烘牸
      const from = line.from;
      const to = from + match[1].length + 1; // 鍖呮嫭绌烘牸
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
 * 鏍囬璇硶闅愯棌瑁呴グ鍣?StateField锛堟簮鐮佹ā寮忎笅鐨勬墍瑙佸嵆鎵€寰楋級
 */
const headingSyntaxHideDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseHeadingSyntaxHide(state);
  },
  update(decorations, tr) {
    // 鏂囨。鍙樺寲鎴栧厜鏍囦綅缃彉鍖栨椂閮介渶瑕佹洿鏂?
    if (tr.docChanged || tr.selection) {
      return parseHeadingSyntaxHide(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 瑙ｆ瀽琛屽唴浠ｇ爜骞跺垱寤洪珮浜楗板櫒锛堟簮鐮佹ā寮忥級
 */
function parseInlineCodeHighlight(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc.toString();
  const docLength = doc.length;
  const cursorPos = state.selection.main.head;
  
  // 鍖归厤琛屽唴浠ｇ爜 `code`
  const codeRegex = /`([^`\n]+)`/g;
  let match;
  
  while ((match = codeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const endTo = startFrom + match[0].length;
    
    // 杈圭晫妫€鏌?
    if (endTo > docLength) continue;
    
    // 璺宠繃浠ｇ爜鍧楃殑 ``` 鏍囪
    if (startFrom > 0 && doc[startFrom - 1] === '`') continue;
    if (endTo < docLength && doc[endTo] === '`') continue;
    
    const startTo = startFrom + 1;
    const contentFrom = startTo;
    const contentTo = endTo - 1;
    const endFrom = contentTo;
    const codeContent = match[1];
    
    // 濡傛灉鍏夋爣鍦ㄨ繖涓鍐呬唬鐮佽寖鍥村唴锛屾樉绀哄師濮嬭娉?
    if (cursorPos >= startFrom && cursorPos <= endTo) {
      continue;
    }
    
    // 纭繚鑼冨洿鏈夋晥
    if (contentFrom >= contentTo) continue;
    
    // 闅愯棌鍓嶉潰鐨?`
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 鐢?Widget 鏇挎崲浠ｇ爜鍐呭浠ュ疄鐜拌娉曢珮浜?
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.replace({
        widget: new InlineCodeWidget(codeContent)
      }),
    });
    // 闅愯棌鍚庨潰鐨?`
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 鎸変綅缃帓搴?
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * 琛屽唴浠ｇ爜楂樹寒瑁呴グ鍣?StateField锛堟簮鐮佹ā寮忥級
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
 * 瑙ｆ瀽 Markdown 璇硶骞跺垱寤洪殣钘忚楗板櫒锛堥瑙堟ā寮忥級
 */
function parseMarkdownSyntax(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  
  // 闅愯棌鏍囬鐨?# 绗﹀彿
  const headingRegex = /^(#{1,6})\s/gm;
  let match;
  
  while ((match = headingRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[1].length + 1; // 鍖呮嫭绌烘牸
    decorations.push({
      from,
      to,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 闅愯棌绮椾綋鐨?** 鎴?__
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
  
  // 闅愯棌鏂滀綋鐨?* 鎴?_锛堝崟涓級
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
  
  // 闅愯棌鍒犻櫎绾跨殑 ~~ 骞舵坊鍔犲垹闄ょ嚎鏍峰紡
  const strikeRegex = /~~([^~]+)~~/g;
  while ((match = strikeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 2;
    const contentFrom = startTo;
    const contentTo = startFrom + match[0].length - 2;
    const endFrom = contentTo;
    const endTo = startFrom + match[0].length;
    
    // 闅愯棌鍓嶉潰鐨?~~
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 缁欎腑闂村唴瀹规坊鍔犲垹闄ょ嚎鏍峰紡
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.mark({ class: 'cm-strikethrough' }),
    });
    // 闅愯棌鍚庨潰鐨?~~
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 闅愯棌琛屽唴浠ｇ爜鐨?` 骞舵坊鍔犺娉曢珮浜?
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 1;
    const contentFrom = startTo;
    const contentTo = startFrom + match[0].length - 1;
    const endFrom = contentTo;
    const endTo = startFrom + match[0].length;
    const codeContent = match[1];
    
    // 闅愯棌鍓嶉潰鐨?`
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 鐢?Widget 鏇挎崲浠ｇ爜鍐呭浠ュ疄鐜拌娉曢珮浜?
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.replace({
        widget: new InlineCodeWidget(codeContent)
      }),
    });
    // 闅愯棌鍚庨潰鐨?`
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 闅愯棌閾炬帴璇硶 [text](url) 涓殑 []() 閮ㄥ垎锛屽彧鏄剧ず鏂囨湰
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(doc)) !== null) {
    const fullMatch = match[0];
    const text = match[1];
    const startBracket = match.index;
    const endBracket = startBracket + 1;
    const startParen = startBracket + 1 + text.length;
    const endParen = startBracket + fullMatch.length;
    
    // 闅愯棌 [
    decorations.push({
      from: startBracket,
      to: endBracket,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 闅愯棌 ](url)
    decorations.push({
      from: startParen,
      to: endParen,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 鎸変綅缃帓搴忓苟鍘婚噸
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * Markdown 璇硶闅愯棌瑁呴グ鍣?StateField锛堥瑙堟ā寮忥級
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

const isCodeMirrorLineElement = (element: Element): element is HTMLElement => {
  return element instanceof HTMLElement && element.classList.contains('cm-line');
};

const removeCodeMirrorLineFontFamily = (lineElement: HTMLElement) => {
  if (!lineElement.style.getPropertyValue('font-family')) {
    return;
  }

  lineElement.style.removeProperty('font-family');
  if (!lineElement.getAttribute('style')) {
    lineElement.removeAttribute('style');
  }
};

const sanitizeCodeMirrorLineFontFamily = (root: ParentNode) => {
  const lineElements = root.querySelectorAll('.cm-line');
  lineElements.forEach((lineElement) => {
    if (lineElement instanceof HTMLElement) {
      removeCodeMirrorLineFontFamily(lineElement);
    }
  });
};

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

  // 涓婁笅鏂囪彍鍗曠姸鎬?
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 瑙嗛閾炬帴杈撳叆鐘舵€?
  const [videoLinkInput, setVideoLinkInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // @ 寮曠敤鑿滃崟鐘舵€?
  const [atReferenceMenu, setAtReferenceMenu] = useState<{
    visible: boolean;
    position: { top: number; left: number };
    searchQuery: string;
    triggerPos: number; // @ 绗﹀彿鍦ㄦ枃妗ｄ腑鐨勪綅缃?
  }>({ visible: false, position: { top: 0, left: 0 }, searchQuery: '', triggerPos: 0 });

  // 棰滆壊棰勮鐘舵€?
  const [colorPreview, setColorPreview] = useState<{
    type: 'color' | 'background-color' | null;
    color: string;
    from: number;
    to: number;
  } | null>(null);

  // 淇濆瓨鎵撳紑棰滆壊閫夋嫨鍣ㄦ椂鐨勯€夊尯鑼冨洿
  const colorPickerSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // 鍏抽棴涓婁笅鏂囪彍鍗?
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
    setColorPreview(null); // 鍏抽棴鑿滃崟鏃舵竻闄ら瑙?
    colorPickerSelectionRef.current = null; // 娓呴櫎淇濆瓨鐨勯€夊尯
  }, []);

  // 鍏抽棴 @ 寮曠敤鑿滃崟
  const closeAtReferenceMenu = useCallback(() => {
    setAtReferenceMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // Wikilink 鑷姩琛ュ叏
  const wikilinkCompletionSource = useCallback(async (context: CompletionContext) => {
    const textBeforeCursor = context.state.doc.sliceString(Math.max(0, context.pos - 200), context.pos);

    const anchorMatch = textBeforeCursor.match(/\[\[([^\]|#\]]+)#([^\]|]*)$/);
    if (anchorMatch) {
      const targetReference = anchorMatch[1].trim();
      const anchorQuery = anchorMatch[2].trim();
      const anchors = await window.electron?.ipcRenderer.invoke(
        'link:getAnchors',
        targetReference,
        anchorQuery
      ) as LinkAnchorSuggestionItem[] | undefined;

      return {
        from: context.pos - anchorMatch[2].length,
        options: (anchors || []).map((anchor): Completion => ({
          label: anchor.reference,
          detail: `${anchor.kind === 'heading' ? '标题' : '块'} · 第${anchor.line} 行`,
          type: anchor.kind === 'heading' ? 'property' : 'keyword',
          info: anchor.preview,
          apply: (view, completion, from, to) => {
            applyWikilinkCompletionText(view, from, to, completion.label);
          }
        }))
      };
    }

    const linkMatch = textBeforeCursor.match(/\[\[([^\]|#\]]*)$/);
    if (!linkMatch) {
      return null;
    }

    const query = linkMatch[1].trim();
    const targets = await window.electron?.ipcRenderer.invoke(
      'link:searchTargets',
      query
    ) as LinkTargetSuggestionItem[] | undefined;

    return {
      from: context.pos - linkMatch[1].length,
      options: (targets || []).map((target): Completion => ({
        label: target.title,
        detail: target.path || '绗旇',
        type: 'file',
        info: target.aliases.length > 0 ? `鍒悕锛?{target.aliases.join('銆?)}` : undefined,
        apply: (view, completion, from, to) => {
          const preferredReference = query.includes('/') || query.includes('\\')
            ? (target.path || target.title)
            : target.title;

          applyWikilinkCompletionText(view, from, to, preferredReference);
        }
      }))
    };
  }, []);

  // 澶勭悊琛ㄥ崟閫夋嫨
  const handleFormSelect = useCallback((form: FormInfo) => {
    const view = viewRef.current;
    if (!view) return;

    // 鐢熸垚寮曠敤鏂囨湰
    const referenceText = tableReferenceService.formatReference('form', form.id, form.name);
    
    // 鏇挎崲 @ 鍙婂叾鍚庨潰鐨勬悳绱㈡枃鏈?
    const { triggerPos, searchQuery } = atReferenceMenu;
    const replaceFrom = triggerPos;
    const replaceTo = triggerPos + 1 + searchQuery.length; // @ + 鎼滅储鏂囨湰

    view.dispatch({
      changes: { from: replaceFrom, to: replaceTo, insert: referenceText },
      selection: { anchor: replaceFrom + referenceText.length },
    });

    // 鍏抽棴鑿滃崟
    closeAtReferenceMenu();
    
    // 鑱氱劍缂栬緫鍣?
    view.focus();
  }, [atReferenceMenu, closeAtReferenceMenu]);

  // 棰滆壊棰勮鏁堟灉
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (colorPreview && colorPreview.type) {
      // 鍚屾椂璁剧疆棰勮瑁呴グ鍣ㄥ拰棰勮鑼冨洿锛堢敤浜庨殣钘忓凡鏈夐鑹诧級
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
      // 娓呴櫎棰勮鍜岄瑙堣寖鍥?
      view.dispatch({
        effects: [
          setColorPreviewEffect.of(null),
          setPreviewRangeEffect.of(null),
        ],
      });
    }
  }, [colorPreview]);

  // 涓婁笅鏂囪彍鍗曢」
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    const view = viewRef.current;
    const selection = view?.state.selection.main;
    const selectedText = selection ? view.state.sliceDoc(selection.from, selection.to) : '';
    const bidirectionalLinkText = buildBidirectionalLinkText(selectedText);

    return [
      {
        id: 'open-bidirectional-links',
        label: '打开双向链接',
        action: () => {
          openBidirectionalLinksPanel();
        },
      },
      { id: 'open-bidirectional-links-sep', label: '', separator: true },
      {
        id: 'set-bidirectional-link',
        label: '设置双链',
        disabled: !bidirectionalLinkText,
        action: () => {
          if (view && selection && bidirectionalLinkText) {
            const { from, to } = selection;
            view.dispatch({
              changes: { from, to, insert: bidirectionalLinkText },
            });
          }
        },
      },
      {
        id: 'external-link',
        label: '外部链接',
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
                // 娓呴櫎甯歌鏍煎紡鏍囪锛?*绮椾綋**銆?鏂滀綋*銆亊~鍒犻櫎绾縹~銆?=楂樹寒==銆乣浠ｇ爜`銆?鍏紡$
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
            label: '石板灰',
            color: 'rgba(100, 116, 139, 0.3)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(100, 116, 139, 0.3)');
              }
            },
          },
          {
            id: 'bg-sky',
            label: '天蓝',
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
            label: '蓝绿',
            color: 'rgba(45, 212, 191, 0.25)',
            action: () => {
              if (view) {
                applyColorStyle(view, 'background-color', 'rgba(45, 212, 191, 0.25)');
              }
            },
          },
          {
            id: 'bg-indigo',
            label: '靛蓝',
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
                // 绗竴娆¤皟鐢ㄦ椂淇濆瓨閫夊尯
                if (!colorPickerSelectionRef.current) {
                  const { from, to } = view.state.selection.main;
                  if (from === to) {
                    const line = view.state.doc.lineAt(from);
                    colorPickerSelectionRef.current = { from: line.from, to: line.to };
                  } else {
                    colorPickerSelectionRef.current = { from, to };
                  }
                }
                // 浣跨敤淇濆瓨鐨勯€夊尯
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
                // 鎭㈠閫夊尯
                view.dispatch({
                  selection: { anchor: from, head: to },
                });
                applyColorStyle(view, 'background-color', color);
              }
              colorPickerSelectionRef.current = null;
            },
            onCustomColorCancel: () => {
              // 鍙栨秷鏃舵竻闄ら瑙?
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
            label: '自定义文本颜色',
            isCustomColor: true,
            onCustomColorPreview: (color: string) => {
              if (view) {
                // 绗竴娆¤皟鐢ㄦ椂淇濆瓨閫夊尯
                if (!colorPickerSelectionRef.current) {
                  const { from, to } = view.state.selection.main;
                  if (from === to) {
                    const line = view.state.doc.lineAt(from);
                    colorPickerSelectionRef.current = { from: line.from, to: line.to };
                  } else {
                    colorPickerSelectionRef.current = { from, to };
                  }
                }
                // 浣跨敤淇濆瓨鐨勯€夊尯
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
                // 鎭㈠閫夊尯
                view.dispatch({
                  selection: { anchor: from, head: to },
                });
                applyColorStyle(view, 'color', color);
              }
              colorPickerSelectionRef.current = null;
            },
            onCustomColorCancel: () => {
              // 鍙栨秷鏃舵竻闄ら瑙?
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
            label: '标题 1',
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
            label: '标题 2',
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
            label: '标题 3',
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
                
                // 妫€鏌ユ槸鍚︽槸鏈夊簭鍒楄〃琛岋紙濡?1. 2. 绛夛級
                const orderedMatch = text.match(/^(\s*)(\d+\.)\s*/);
                if (orderedMatch) {
                  // 鍦ㄦ湁搴忓垪琛ㄥ悗闈㈡坊鍔犲緟鍔炴竻鍗曟牸寮?
                  const prefix = orderedMatch[0]; // 鍖呮嫭缂╄繘銆佹暟瀛楀拰鐐瑰悗鐨勭┖鏍?
                  const insertPos = line.from + prefix.length;
                  view.dispatch({
                    changes: { from: insertPos, insert: '[ ] ' },
                    selection: { anchor: insertPos + 4 },
                  });
                } else {
                  // 鏅€氳锛屽湪琛岄鎻掑叆寰呭姙娓呭崟
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
                const table = '| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |';
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
              // 鑾峰彇鍏夋爣浣嶇疆鐨勫睆骞曞潗鏍?
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
            label: '数据库视图',
            action: () => {
              // 鎵撳紑鏁版嵁搴撹璁″櫒鏍囩椤?
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
              // TODO: 瀹炵幇鏈湴闊抽鎻掑叆
              console.log('本地音频功能待实现');
            },
          },
          {
            id: 'local-file',
            label: '本地文件',
            action: () => {
              // TODO: 瀹炵幇鏈湴鏂囦欢鎻掑叆
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
            label: '画布',
            action: () => {
              // TODO: 瀹炵幇鐢绘澘鍔熻兘
              console.log('画布功能待实现');
            },
          },
          {
            id: 'mindmap',
            label: '思维导图',
            action: () => {
              // TODO: 瀹炵幇鎬濈淮瀵煎浘鍔熻兘
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
    A[开始] --> B{条件判断}
    B -->|是| C[处理方案 A]
    B -->|否| D[处理方案 B]
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
    participant A as 参与者 A
    participant B as 参与者 B
    A->>B: 发送请求
    B-->>A: 返回响应
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
        label: 'AI 行内对话',
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

  // 鏇存柊澶х翰
  const updateOutline = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    setOutline(parseOutline(doc));

    // 鑹插潡淇℃伅宸茬Щ鑷充笂涓嬫枃鑿滃崟
    setColorBlocks([]);
  }, []);

  // 璺宠浆鍒版寚瀹氫綅缃?
  const scrollToPosition = useCallback((position: number) => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      selection: { anchor: position },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  useEffect(() => {
    const handleRevealLine = (event: Event) => {
      if (!isActive || !viewRef.current) {
        return;
      }

      const customEvent = event as CustomEvent<{ lineNumber: number }>;
      const lineNumber = customEvent.detail?.lineNumber;
      if (!lineNumber) {
        return;
      }

      const view = viewRef.current;
      const safeLineNumber = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
      const targetPosition = view.state.doc.line(safeLineNumber).from;
      scrollToPosition(targetPosition);
    };

    window.addEventListener('note:reveal-line', handleRevealLine as EventListener);
    return () => {
      window.removeEventListener('note:reveal-line', handleRevealLine as EventListener);
    };
  }, [isActive, scrollToPosition]);

  // 澶х翰闈㈡澘鎷栧姩璋冩暣瀹藉害
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

  // 澶勭悊鎷栨嫿浜嬩欢
  const handleDrop = useCallback((event: DragEvent) => {
    const view = viewRef.current;
    if (!view || !editable) return;

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    // 澶勭悊鎷栨斁鐨勬枃浠?
    if (dataTransfer.files?.length) {
      const files = Array.from(dataTransfer.files);
      const imageFiles = files.filter(file => file.type.startsWith('image/'));

      if (imageFiles.length > 0) {
        event.preventDefault();
        event.stopPropagation();

        // 鑾峰彇鎷栨斁浣嶇疆
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const insertPos = pos ?? view.state.selection.main.head;

        imageFiles.forEach(file => {
          handleImageFile(file, view, insertPos);
        });
        return;
      }
    }

    // 澶勭悊鎷栨斁鐨勫浘鐗?URL
    const url = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '';

    if (url && isImageUrl(url)) {
      event.preventDefault();
      event.stopPropagation();

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const insertPos = pos ?? view.state.selection.main.head;

      handleImageUrl(url, view, insertPos);
    }
  }, [editable]);

  // 澶勭悊绮樿创浜嬩欢
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

  // 鍒涘缓缂栬緫鍣?
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange && !isInternalChange.current) {
        // 鑾峰彇鏂囨。鍐呭骞跺簲鐢ㄥ緟鍚屾鐨勪唬鐮佸潡鍚嶇О鏇存柊
        let newContent = update.state.doc.toString();
        newContent = applyPendingUpdatesToContent(newContent);
        onChange(newContent);
      }

      // 妫€娴?@ 寮曠敤杈撳叆
      if (update.docChanged) {
        const { state } = update;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        const textBefore = line.text.slice(0, pos - line.from);
        
        // 妫€鏌ユ槸鍚﹁緭鍏ヤ簡 @ 鎴栬€呮鍦ㄨ緭鍏?@ 鍚庣殑鍐呭
        const atMatch = textBefore.match(/@([^\s@]*)$/);
        
        if (atMatch) {
          // 鑾峰彇鍏夋爣浣嶇疆鐨勫睆骞曞潗鏍?
          const coords = update.view.coordsAtPos(pos);
          if (coords) {
            const triggerPos = pos - atMatch[1].length - 1; // @ 绗﹀彿鐨勪綅缃?
            setAtReferenceMenu({
              visible: true,
              position: {
                top: coords.bottom + 4,
                left: coords.left,
              },
              searchQuery: atMatch[1],
              triggerPos,
            });
          }
        } else if (atReferenceMenu.visible) {
          // 濡傛灉娌℃湁鍖归厤鍒?@ 妯″紡锛屽叧闂彍鍗?          setAtReferenceMenu(prev => ({ ...prev, visible: false }));
        }

        if (/\[\[[^\]|]*$/.test(textBefore) || /\[\[[^\]|#]+\#[^\]|]*$/.test(textBefore)) {
          startCompletion(update.view);
        }
      }
    });

    // 鏍规嵁妯″紡鍐冲畾鏄惁浣跨敤棰勮瑁呴グ鍣?
    const extensions = [
      highlightActiveLine(),
      history(),
      markdown(),
      autocompletion({
        activateOnTyping: true,
        closeOnBlur: true,
        override: [wikilinkCompletionSource]
      }),
      syntaxHighlighting(customHighlightStyle),
      indentUnit.of('  '), // 2 绌烘牸缂╄繘
      customKeymap, // 鑷畾涔夐敭鐩樻槧灏勬斁鍦ㄩ粯璁ら敭鐩樻槧灏勪箣鍓嶏紝纭繚浼樺厛澶勭悊
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      mermaidDecorations, // Mermaid 鍥捐〃瑁呴グ鍣?
      videoDecorations, // 瑙嗛瑁呴グ鍣ㄦ斁鍦ㄥ浘鐗囦箣鍓嶏紝浼樺厛鍖归厤瑙嗛閾炬帴
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
      // 缂╄繘绾?
      indentGuideDecorations,
      // 搴忓彿楂樹寒锛堝 4.2銆?.2.1銆?.2.1.1锛?
      numberingDecorations,
      // 鏂囨湰棰滆壊绯荤粺 - 绾?StateField + Decoration 鏂规
      colorMarksField,
      previewRangeField,
      Prec.highest(colorDecorationsField),
      // 棰滆壊棰勮瑁呴グ鍣?
      colorPreviewDecorations,
      // 鎶樺彔缁勯珮浜紙鍏夋爣閫変腑鏃舵樉绀虹埗绾х殑鎶樺彔鍥炬爣鍜屽瓙琛岀殑缂╄繘绾匡級
      foldGroupHighlightField,
      // 鎶樺彔鍔熻兘锛堜笉浣跨敤 customFoldService锛岄伩鍏嶄笌 markdown 瑙ｆ瀽鍣ㄥ啿绐侊級
      headingFoldMarkers,
      headingFoldGutter,
      listFoldDecorations,
      // 鍐呰仈 AI 鑱婂ぉ
      inlineAIChatField,
      // 琛ㄦ牸寮曠敤鍐呰仈棰勮
      ...createTableReferenceExtension(),
      codeFolding({
        placeholderDOM: (_view, onclick) => {
          const span = document.createElement('span');
          span.className = 'cm-foldPlaceholder';
          span.textContent = '...';

          span.title = '鐐瑰嚮灞曞紑';
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

    // 棰勮妯″紡娣诲姞闅愯棌 Markdown 璇硶鐨勮楗板櫒
    if (mode === 'preview') {
      extensions.push(markdownHideDecorations);
    } else {
      // 婧愮爜妯″紡娣诲姞鏍囬璇硶闅愯棌瑁呴グ鍣紙鎵€瑙佸嵆鎵€寰楋級
      extensions.push(headingSyntaxHideDecorations);
      // 婧愮爜妯″紡娣诲姞琛屽唴浠ｇ爜楂樹寒瑁呴グ鍣?
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

    sanitizeCodeMirrorLineFontFamily(view.dom);
    const cmLineFontObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          if (isCodeMirrorLineElement(mutation.target)) {
            removeCodeMirrorLineFontFamily(mutation.target);
          }
          continue;
        }

        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) {
              return;
            }

            if (isCodeMirrorLineElement(node)) {
              removeCodeMirrorLineFontFamily(node);
            }

            sanitizeCodeMirrorLineFontFamily(node);
          });
        }
      }
    });

    cmLineFontObserver.observe(view.dom, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // 鍒濆鍖栧ぇ绾?
    updateOutline();

    if (autoFocus) {
      view.focus();
    }

    return () => {
      cmLineFontObserver.disconnect();
      view.destroy();
      viewRef.current = null;
      globalEditorView = null;
    };
  }, [editable, mode, updateOutline, wikilinkCompletionSource]);

  // 娉ㄦ剰锛氫唬鐮佸潡鍚嶇О鐨勫悓姝ュ凡绉昏嚦鏂囨。淇濆瓨鏃跺鐞?
  // 杩欐牱鍙互閬垮厤鍦?Widget 鏇存柊杩囩▼涓Е鍙?CodeMirror 鍐呴儴閿欒

  // 鐩戝惉瑙嗛鏍囬鍜屾樉绀烘ā寮忓彉鍖栦簨浠?
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // 浠ｇ爜鍧楀悕绉板彉鍖栧鐞?
    const handleCodeBlockNameChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        language: string;
        oldName: string;
        newName: string;
      }>;
      const { language, oldName, newName } = customEvent.detail;
      
      // 浣跨敤 setTimeout 寤惰繜鎵ц锛岀‘淇濆湪 CodeMirror 瀹屾垚褰撳墠鏇存柊鍛ㄦ湡鍚庡啀鎵ц
      setTimeout(() => {
        const currentView = viewRef.current;
        if (!currentView || !currentView.dom || !currentView.dom.isConnected) return;
        
        // 鍦ㄦ枃妗ｄ腑鏌ユ壘鍖归厤鐨勪唬鐮佸潡寮€濮嬭骞舵洿鏂?
        const doc = currentView.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const lineText = line.text;
          
          // 鍖归厤 ```language // oldName 鏍煎紡
          const oldPattern = oldName 
            ? new RegExp(`^\`\`\`${language}\\s*\\/\\/\\s*${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
            : new RegExp(`^\`\`\`${language}$`);
          
          if (oldPattern.test(lineText)) {
            const newLineText = newName ? '```' + language + ' // ' + newName : '```' + language;
            if (lineText !== newLineText) {
              currentView.dispatch({
                changes: {
                  from: line.from,
                  to: line.to,
                  insert: newLineText
                }
              });
            }
            break;
          }
        }
      }, 50);
    };

    // 瑙嗛鏍囬鍙樺寲澶勭悊
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

    // 瑙嗛鏄剧ず妯″紡鍙樺寲澶勭悊
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

    // 瑙嗛鍒犻櫎澶勭悊
    const handleVideoDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{ from: number; to: number }>;
      const { from, to } = customEvent.detail;
      view.dispatch({
        changes: { from, to, insert: '' },
      });
    };

    // 鏈湴瑙嗛閫夋嫨澶勭悊
    const handleVideoSelectLocal = async (event: Event) => {
      const customEvent = event as CustomEvent<{ from: number; to: number; title: string }>;
      const { from, to, title } = customEvent.detail;
      
      // 璋冪敤 Electron 鎵撳紑鏂囦欢瀵硅瘽妗?
      const result = await window.electron?.video?.open();
      console.log('[handleVideoSelectLocal] 閫夋嫨缁撴灉:', result);
      if (result && result.success && result.data?.path) {
        const filePath = result.data.path;
        console.log('[handleVideoSelectLocal] 鏂囦欢璺緞:', filePath);
        const newMarkdown = `![${title}](${filePath})`;
        console.log('[handleVideoSelectLocal] 鎻掑叆 markdown:', newMarkdown);
        view.dispatch({
          changes: { from, to, insert: newMarkdown },
        });
      }
    };

    window.addEventListener('codeblock-name-change', handleCodeBlockNameChange);
    window.addEventListener('video-title-change', handleVideoTitleChange);
    window.addEventListener('video-display-mode-change', handleVideoModeChange);
    window.addEventListener('video-delete', handleVideoDelete);
    window.addEventListener('video-select-local', handleVideoSelectLocal);

    return () => {
      window.removeEventListener('codeblock-name-change', handleCodeBlockNameChange);
      window.removeEventListener('video-title-change', handleVideoTitleChange);
      window.removeEventListener('video-display-mode-change', handleVideoModeChange);
      window.removeEventListener('video-delete', handleVideoDelete);
      window.removeEventListener('video-select-local', handleVideoSelectLocal);
    };
  }, []);

  // 鍐呭鍙樺寲鏃舵洿鏂板ぇ绾?
  useEffect(() => {
    updateOutline();
  }, [content, updateOutline]);

  // 缁戝畾鎷栨嫿鍜岀矘璐翠簨浠?
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 闃绘榛樿鎷栨嫿琛屼负
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    // 鍙抽敭鑿滃崟澶勭悊
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

  // 鍚屾澶栭儴 content 鍙樺寲
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

  // 鐩戝惉妯″紡鍒囨崲浜嬩欢锛堟潵鑷?TabBar 鏇村鎿嶄綔鑿滃崟锛?
  useEffect(() => {
    const handleModeChange = (event: CustomEvent<EditorMode>) => {
      setMode(event.detail);
    };

    window.addEventListener('set-codemirror-mode', handleModeChange as EventListener);
    return () => {
      window.removeEventListener('set-codemirror-mode', handleModeChange as EventListener);
    };
  }, []);

  // 鐩戝惉鎻掑叆鏁版嵁搴撹〃鏍间簨浠?
  useEffect(() => {
    const handleInsertDatabaseTable = (event: Event) => {
      const customEvent = event as CustomEvent<{ markdown: string; focusEditor?: boolean; handled?: boolean }>;
      
      // 濡傛灉浜嬩欢宸茶澶勭悊锛岃烦杩?
      if (customEvent.detail?.handled) return;
      
      const { markdown } = customEvent.detail;
      
      if (viewRef.current && markdown) {
        // 鏍囪浜嬩欢宸插鐞嗭紝闃叉鍏朵粬缂栬緫鍣ㄩ噸澶嶅鐞?
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
                    澶х翰
                  </div>
                  <div
                    className={`cm-outline-tab ${outlineTab === 'colors' ? 'active' : ''}`}
                    onClick={() => setOutlineTab('colors')}
                  >
                    鑹插潡
                  </div>
                  <div className="cm-outline-tab-spacer" />
                </>
              )}
              <div
                className="cm-outline-collapse-btn"
                onClick={() => setIsOutlineCollapsed(!isOutlineCollapsed)}
                title={isOutlineCollapsed ? '展开大纲' : '折叠大纲'}
              >
                <Icon name={isOutlineCollapsed ? 'chevron-left' : 'chevron-right'} size={14} />
              </div>
            </div>
            {!isOutlineCollapsed && (
              <div className="cm-outline-content">
                {outlineTab === 'headings' && (
                  <div className="cm-outline-list">
                    {outline.length === 0 ? (
                      <div className="cm-outline-empty">鏆傛棤鏍囬</div>
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
                      <div className="cm-outline-empty">鏆傛棤鑹插潡</div>
                    ) : (
                      colorBlocks.map(item => (
                        <div
                          key={item.id}
                          className="cm-outline-item cm-color-block-item"
                          onClick={() => scrollToPosition(item.position)}
                          title={`第${item.lineNumber} 行`}
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
      <AtReferenceMenu
        visible={atReferenceMenu.visible}
        position={atReferenceMenu.position}
        searchQuery={atReferenceMenu.searchQuery}
        onSelect={handleFormSelect}
        onClose={closeAtReferenceMenu}
      />
    </div>
  );
};

export default CodeMirrorEditor;



