/**
 * CodeMirror 缂傛牞绶崳銊х矋娴?
 * 閸旂喕鍏橀敍姘唨娴?CodeMirror 6 閻?Markdown 缂傛牞绶崳?
 * 閹诲繗鍫敍姘絹娓氭稒绨惍浣洪獓閸掝偆娈?Markdown 缂傛牞绶担鎾荤崣閿涘本鏁幐浣筋嚔濞夋洟鐝禍顔衡偓浣告禈閻楀洦瀚嬮幏濮愨偓浣告禈閻楀洤鍞撮懕鏃€瑕嗛弻鎾扁偓浣告禈閻楀洤銇囩亸蹇氱殶閺佹潙鎷伴懗灞炬珯閼规彃娼?
 * 閺€顖涘瘮濠ф劗鐖滃Ο鈥崇础閸滃矂顣╃憴鍫熌佸蹇撳瀼閹?
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
import {
  clearActiveCodeMirrorEditor,
  getActiveCodeMirrorEditorMeta,
  setActiveCodeMirrorEditor,
} from '../../lib/editor/activeCodeMirrorEditor';
import { openBidirectionalLinksPanel } from '../../utils/noteLinking';
import { buildBidirectionalLinkText } from '../../utils/bidirectionalLink';
import { toastService } from '../../services/ToastService';
import './CodeMirrorEditor.scss';
import './TableReferenceWidget/InlineTablePreview.scss';
import './InlineAIChat/InlineAIChat.scss';
import './CodeBlockMonaco/CodeBlockMonaco.scss';
import hljs from 'highlight.js';
import mermaid from 'mermaid';

/**
 * 缂傛牞绶崳銊δ佸蹇曡閸?
 */
export type EditorMode = 'source' | 'preview';

const LARGE_FILE_CHARACTER_THRESHOLD = 250 * 1024;
const LARGE_FILE_CHANGE_SYNC_DELAY_MS = 180;

const formatLargeFileApproximateSize = (characterCount: number): string => {
  if (characterCount >= 1024 * 1024) {
    return `${(characterCount / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (characterCount >= 1024) {
    return `${Math.round(characterCount / 1024)} KB`;
  }

  return `${characterCount} B`;
};

/**
 * 婢堆呯堪妞ゅ湱琚崹?
 */
interface OutlineItem {
  id: string;
  level: number;
  text: string;
  lineNumber: number;
  position: number;
}

/**
 * 閼规彃娼℃径褏缈版い鍦閸?
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
  tabId?: string;
  title?: string;
  filePath?: string;
  language?: string;
  /** 閸掓繂顫愬Ο鈥崇础閿涘矂绮拋銈勮礋 source */
  initialMode?: EditorMode;
  /** 閺勵垰鎯侀弰鍓с仛婢堆呯堪闂堛垺婢橀敍宀勭帛鐠併倓璐?true */
  showOutline?: boolean;
  /** 閺勵垰鎯侀弰顖氱秼閸撳秵绺哄ú鑽ゆ畱缂傛牞绶崳?*/
  isActive?: boolean;
}

/**
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱閺嶅洭顣介敍宀€鏁撻幋鎰亣缁?
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
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱閼规彃娼?
 */
function parseColorBlocks(backgrounds: Map<number, string>, doc: string): ColorBlockItem[] {
  const items: ColorBlockItem[] = [];
  const lines = doc.split('\n');
  let position = 0;

  // 閹稿顢戦崣宄板瀻缂佸嫯绻涚紒顓犳畱閼规彃娼?
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

  // 娑撶儤鐦℃稉顏囧閸ф绮嶉悽鐔稿灇婢堆呯堪妞?
  colorGroups.forEach((group, index) => {
    const lineIndex = group.startLine - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      // 鐠侊紕鐣绘担宥囩枂
      let pos = 0;
      for (let i = 0; i < lineIndex; i++) {
        pos += lines[i].length + 1;
      }

      // 閼惧嘲褰囩粭顑跨鐞涘本鏋冮張顑跨稊娑撴椽顣╃憴?
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

/**
 * Wikilink 閼奉亜濮╃悰銉ュ弿閺冩儼藟姒绘劙妫撮崥鍫熷閸欏嚖绱濋柆鍨帳闁插秴顦查幓鎺戝弳 ]]
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

// 鐎涙ê鍋?EditorView 瀵洜鏁ら敍灞肩返 Widget 娴ｈ法鏁?
let globalEditorView: EditorView | null = null;

// 瑜版挸澧犻柅澶夎厬閻ㄥ嫬娴橀悧?src閿涘牏鏁ゆ禍搴℃躬 Widget 闁插秴缂撻崥搴划婢跺秹鈧鑵戦悩鑸碘偓渚婄礆
let selectedImageSrc: string | null = null;

/**
 * 閼惧嘲褰囩悰宀€娈戠紓鈺勭箻缁狙冨焼閿涘牏鈹栭弽鍏兼殶閿?
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * 濡偓濞村顢戦弰顖氭儊娑撶儤鐖ｆ０?
 */
function getHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

/**
 * 濡偓濞村顢戦弰顖氭儊娑撳搫鍨悰銊┿€嶉敍鍫熸箒鎼村繑鍨ㄩ弮鐘茬碍閿?
 */
function isListItem(line: string): boolean {
  const trimmed = line.trimStart();
  // 閺冪姴绨崚妤勩€? - item, * item, + item
  // 閺堝绨崚妤勩€? 1. item, 2. item, etc.
  return /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed);
}

/**
 * 鐠侊紕鐣婚弽鍥暯閹舵ê褰旈懠鍐ㄦ纯
 * 閺嶅洭顣介幎妯哄綌闁槒绶敍?
 * - 閸欘亝婀侀弽鍥暯鐞涘苯褰叉禒銉﹀閸?
 * - 閹舵ê褰旈懠鍐ㄦ纯娴犲孩鐖ｆ０妯款攽閺堫偄鐔崚棰佺瑓娑撯偓娑擃亜鎮撶痪褎鍨ㄩ弴鎾彯缁狙勭垼妫版ü绠ｉ崜?
 * - 閸欘亝婀佽ぐ鎾寸垼妫版ɑ妲搁弬鍥ㄣ€傞張鈧崥搴濈鐞涘矉绱欓崥搴ㄦ桨濞屸剝婀佹禒璁崇秿鐞涘矉绱氶弮鑸靛娑撳秷鍏橀幎妯哄綌
 * - 閸欘亣顩﹂崥搴ㄦ桨閺堝鎹㈡担鏇☆攽閿涘牆瀵橀幏顒傗敄鐞涘矉绱氶敍灞芥皑閸欘垯浜掗幎妯哄綌
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

  // 婵″倹鐏夐弰顖涙付閸氬簼绔寸悰宀嬬礉娑撳秷鍏橀幎妯哄綌閿涘牆鎮楅棃銏＄梾閺堝鎹㈡担鏇☆攽閿?
  if (line.number >= doc.lines) {
    return null;
  }

  // 閺嶅洭顣介幎妯哄綌閿涙碍濮岄崣鐘插煂娑撳绔存稉顏勬倱缁狙勫灗閺囨挳鐝痪褎鐖ｆ０妯圭閸?
  let foldEnd = line.to;
  let hasAnyLine = false;

  for (let i = line.number + 1; i <= doc.lines; i++) {
    const nextLine = doc.line(i);
    const nextHeadingLevel = getHeadingLevel(nextLine.text);

    // 闁洤鍩岄崥宀€楠囬幋鏍ㄦ纯妤傛楠囬弽鍥暯閿涘苯浠犲銏″閸?
    if (nextHeadingLevel > 0 && nextHeadingLevel <= headingLevel) {
      // 閹舵ê褰旈崚棰佺瑐娑撯偓鐞涘本婀亸鎾呯礄婵″倹鐏夐張澶婂敶鐎瑰湱娈戠拠婵撶礆
      if (hasAnyLine && i > line.number + 1) {
        foldEnd = doc.line(i - 1).to;
      }
      break;
    }

    // 閺嶅洩顔囬張澶夋崲娴ｆ洝顢戦敍鍫濆瘶閹奉剛鈹栫悰宀嬬礆
    hasAnyLine = true;
    foldEnd = nextLine.to;
  }

  // 閸欘亣顩﹂張澶夋崲娴ｆ洝顢戞稉鏃€濮岄崣鐘哄瘱閸ュ瓨婀侀弫鍫濇皑鏉╂柨娲?
  if (hasAnyLine && foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }

  return null;
}

/**
 * 鐠侊紕鐣婚崚妤勩€冩い瑙勫閸欑姾瀵栭崶杈剧礄Obsidian 妞嬪孩鐗搁敍?
 * 闁槒绶敍?
 * 1. 瑜版挸澧犵悰灞肩瑝閼宠姤妲哥粚楦款攽
 * 2. 閸氬酣娼拌箛鍛淬€忛張澶岀級鏉╂稑銇囨禍搴＄秼閸撳秷顢戦惃鍕攽閿涘牐鐑︽潻鍥┾敄鐞涘本顥呴弻銉礆
 * 3. 閹舵ê褰旈懠鍐ㄦ纯閸栧懎鎯堥幍鈧張澶岀級鏉╂稑銇囨禍搴＄秼閸撳秷顢戦惃鍕箾缂侇叀顢戦敍鍫濆瘶閹奉兛鑵戦梻瀵告畱缁岄缚顢戦敍?
 */
function computeListFoldRange(state: EditorState, lineStart: number): { from: number; to: number } | null {
  const doc = state.doc;
  
  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }
  
  const line = doc.lineAt(lineStart);
  const lineText = line.text;
  
  // 閺嶅洭顣界悰灞煎▏閻劍鐖ｆ０妯诲閸?
  if (getHeadingLevel(lineText) > 0) {
    return null;
  }
  
  // 缁岄缚顢戞稉宥堝厴閹舵ê褰?
  if (lineText.trim().length === 0) {
    return null;
  }
  
  const currentIndent = getIndentLevel(lineText);
  
  // 濡偓閺屻儰绗呮稉鈧悰灞炬Ц閸氾箑鐡ㄩ崷?
  if (line.number >= doc.lines) {
    return null;
  }
  
  // 閺屻儲澹樼粭顑跨娑擃亪娼粚楦款攽閿涘本顥呴弻銉ュ従缂傗晞绻橀弰顖氭儊婢堆傜艾瑜版挸澧犵悰?
  let hasChildIndent = false;
  let foldEnd = line.to;
  
  for (let i = line.number + 1; i <= doc.lines; i++) {
    const checkLine = doc.line(i);
    const checkText = checkLine.text.trim();
    
    // 缁岄缚顢戠紒褏鐢婚崠鍛儓閸︺劍濮岄崣鐘哄瘱閸ユ潙鍞撮敍鍫濐洤閺嬫粌鍑＄紒蹇斿閸掓澘鐡欑紓鈺勭箻閿?
    if (checkText.length === 0) {
      if (hasChildIndent) {
        foldEnd = checkLine.to;
      }
      continue;
    }
    
    const checkIndent = getIndentLevel(checkLine.text);
    
    // 婵″倹鐏夌紓鈺勭箻鐏忓繋绨粵澶夌艾瑜版挸澧犵悰宀嬬礉閸嬫粍顒涢幎妯哄綌
    if (checkIndent <= currentIndent) {
      break;
    }
    
    // 閹垫儳鍩屾禍鍡欑級鏉╂稑銇囨禍搴＄秼閸撳秷顢戦惃鍕攽
    hasChildIndent = true;
    foldEnd = checkLine.to;
  }
  
  // 閸欘亝婀侀幍鎯у煂鐎涙劗缂夋潻娑滎攽閹靛秷绻戦崶鐐村閸欑姾瀵栭崶?
  if (hasChildIndent && foldEnd > line.to) {
    return { from: line.to, to: foldEnd };
  }
  
  return null;
}

/**
 * 鐠侊紕鐣婚幎妯哄綌閼煎啫娲?- 閺€顖涘瘮閺嶅洭顣介幎妯哄綌閸滃苯鍨悰銊﹀閸欑媴绱橭bsidian 妞嬪孩鐗搁敍?
 */
function computeFoldRange(state: EditorState, lineStart: number, _lineEnd: number): { from: number; to: number } | null {
  const doc = state.doc;
  
  if (lineStart < 0 || lineStart > doc.length) {
    return null;
  }
  
  const line = doc.lineAt(lineStart);
  const headingLevel = getHeadingLevel(line.text);
  
  // 閺嶅洭顣界悰灞煎▏閻劍鐖ｆ０妯诲閸?
  if (headingLevel > 0) {
    return computeHeadingFoldRange(state, lineStart);
  }
  
  // 闂堢偞鐖ｆ０妯款攽娴ｈ法鏁ら崚妤勩€冮幎妯哄綌
  return computeListFoldRange(state, lineStart);
}

/**
 * 閼奉亜鐣炬稊澶嬪閸欑姵婀囬崝?- 閺€顖涘瘮閺嶅洭顣介幎妯哄綌閸滃苯鍨悰銊﹀閸?
 */
const customFoldService = foldService.of((state, lineStart, lineEnd) => {
  return computeFoldRange(state, lineStart, lineEnd);
});

/**
 * 閹舵ê褰旈崶鐐垼 GutterMarker - 鐏炴洖绱戦悩鑸碘偓渚婄礄娴犲懐鏁ゆ禍搴㈢垼妫版﹫绱?
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
 * 閹舵ê褰旈崶鐐垼 GutterMarker - 閹舵ê褰旈悩鑸碘偓渚婄礄娴犲懐鏁ゆ禍搴㈢垼妫版﹫绱?
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
 * 閺嬪嫬缂撻弽鍥暯閹舵ê褰?Gutter 閺嶅洩顔囬敍鍫滅矌閺嶅洭顣介敍?
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
 * 閺嶅洭顣介幎妯哄綌 Gutter 閺嶅洩顔?StateField
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
 * 閺嶅洭顣介幎妯哄綌 Gutter
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

        // 妤犲矁鐦夐幎妯哄綌閼煎啫娲块張澶嬫櫏閹?
        if (foldRange.from >= foldRange.to || foldRange.to > view.state.doc.length) {
          return false;
        }

        const folded = foldedRanges(view.state);
        let existingFold: { from: number; to: number } | null = null;
        folded.between(lineObj.to, lineObj.to + 1, (from, to) => {
          existingFold = { from, to };
        });

        // 娴ｈ法鏁?requestAnimationFrame 瀵ゆ儼绻滈幍褑顢戦敍宀勪缉閸?markdown 鐟欙絾鐎介崳銊ф畱閸愬懘鍎撮柨娆掝嚖
        requestAnimationFrame(() => {
          try {
            // 闁插秵鏌婃宀冪槈閻樿埖鈧緤绱濈涵顔荤箽缂傛牞绶崳銊ょ矝閻掕埖婀侀弫?
            if (!view.dom || !view.dom.isConnected) return;
            
            // 闁插秵鏌婄拋锛勭暬閹舵ê褰旈懠鍐ㄦ纯閿涘苯娲滄稉铏瑰Ц閹礁褰查懗钘夊嚒缂佸繑鏁奸崣?
            const currentFoldRange = computeHeadingFoldRange(view.state, lineObj.from);
            if (!currentFoldRange) return;
            
            // 閸愬秵顐兼宀冪槈閼煎啫娲块張澶嬫櫏閹?
            if (currentFoldRange.from >= currentFoldRange.to || currentFoldRange.to > view.state.doc.length) {
              return;
            }

            if (existingFold) {
              // 鐏炴洖绱戦弮璁圭礉妤犲矁鐦?existingFold 閼煎啫娲挎禒宥囧姧閺堝鏅?
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
 * 鐎涙劖濮岄崣鐘叉禈閺?Widget閿涘牏绮风€电懓鐣炬担宥忕礉鐠虹喖娈㈢紓鈺勭箻閸斻劍鈧焦娲块弬甯礆
 * 閹碘偓閺堝鐡欓幎妯哄綌閸ョ偓鐖ｉ柈鎴掑▏閻劎绮风€电懓鐣炬担宥忕礉娑撳秴宕伴悽銊︽瀮閺堫剛鈹栭梻?
 * 闁俺绻?left 閸婂吋娼电捄鐔兼缂傗晞绻樻担宥囩枂
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

    // 閼惧嘲褰囩€圭偤妾惃鍕摟缁楋箑顔旀惔?
    const charWidth = view.defaultCharacterWidth;

    // 閹碘偓閺堝鐡欓幎妯哄綌閸ョ偓鐖ｉ柈鎴掑▏閻劎绮风€电懓鐣炬担?
    // 閺嶈宓佺紓鈺勭箻鐠侊紕鐣?left 娴ｅ秶鐤?
    // indent=0 閺冭埖鏂侀崷?gutter 娴ｅ秶鐤嗛敍鍧檈ft: -24px閿?
    // indent>0 閺冭埖鏂侀崷銊х級鏉╂稓鈹栭弽鑲╂畱瀹革箒绔?
    if (this.indent === 0) {
      span.style.left = '-24px';
    } else {
      // 閹舵ê褰旈崶鐐垼閺€鎯ф躬缂傗晞绻樼粚鐑樼壐娑斿澧犻敍灞芥禈閺嶅洤顔旀惔?20px
      // 缂傗晞绻樻担宥囩枂 = indent * charWidth閿涘苯娴橀弽鍥т箯鏉?= 缂傗晞绻樻担宥囩枂 - 閸ョ偓鐖ｇ€硅棄瀹?
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

      // 妤犲矁鐦夐幎妯哄綌閼煎啫娲块張澶嬫櫏閹?
      if (foldRange.from >= foldRange.to || foldRange.to > view.state.doc.length) {
        return;
      }

      const folded = foldedRanges(view.state);
      let existingFold: { from: number; to: number } | null = null;
      folded.between(this.lineTo, this.lineTo + 1, (from, to) => {
        existingFold = { from, to };
      });

      const lineFrom = this.lineFrom;

      // 娴ｈ法鏁?requestAnimationFrame 瀵ゆ儼绻滈幍褑顢戦敍宀勪缉閸?markdown 鐟欙絾鐎介崳銊ф畱閸愬懘鍎撮柨娆掝嚖
      requestAnimationFrame(() => {
        try {
          // 闁插秵鏌婃宀冪槈閻樿埖鈧緤绱濈涵顔荤箽缂傛牞绶崳銊ょ矝閻掕埖婀侀弫?
          if (!view.dom || !view.dom.isConnected) return;
          
          // 闁插秵鏌婄拋锛勭暬閹舵ê褰旈懠鍐ㄦ纯閿涘苯娲滄稉铏瑰Ц閹礁褰查懗钘夊嚒缂佸繑鏁奸崣?
          const currentFoldRange = computeListFoldRange(view.state, lineFrom);
          if (!currentFoldRange) return;
          
          // 閸愬秵顐兼宀冪槈閼煎啫娲块張澶嬫櫏閹?
          if (currentFoldRange.from >= currentFoldRange.to || currentFoldRange.to > view.state.doc.length) {
            return;
          }

          if (existingFold) {
            // 鐏炴洖绱戦弮璁圭礉妤犲矁鐦?existingFold 閼煎啫娲挎禒宥囧姧閺堝鏅?
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
 * 閺嬪嫬缂撶€涙劖濮岄崣鐘插敶閼辨棁顥婃鏉挎珤
 * 閹碘偓閺堝娴橀弽鍥厴娴ｈ法鏁ょ紒婵嗩嚠鐎规矮缍呴敍灞肩瑝閸楃姷鏁ら弬鍥ㄦ拱缁屾椽妫?
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

    // 鐠哄疇绻冮弽鍥暯鐞?
    if (getHeadingLevel(lineText) > 0) continue;

    // 鐠哄疇绻冪粚楦款攽
    if (lineText.trim().length === 0) continue;

    const foldRange = computeListFoldRange(state, line.from);
    
    // 閸欘亝婀佽ぐ?foldRange 鐎涙ê婀弮鑸靛濞ｈ濮為幎妯哄綌閸ョ偓鐖?
    if (foldRange) {
      const isFolded = foldedMap.has(line.to);
      const indent = getIndentLevel(lineText);

      // 閸︺劎缂夋潻娑楃閸氬孩褰冮崗銉﹀閸欑姴娴橀弽鍥风礄閹存牞顢戞＃鏍电礉婵″倹鐏夐弮鐘电級鏉╂冻绱?
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
 * 鐎涙劖濮岄崣鐘插敶閼辨棁顥婃鏉挎珤 StateField
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
 * 鎼村繐褰挎妯瑰瘨鐟佸懘銈伴崳?- 閸栧綊鍘ら崥鍕潚閺嶇厧绱￠惃鍕碍閸?
 * 娑撻缚绻栨禍娑樼碍閸欓攱鍧婇崝鐘卞瘜妫版﹢顤侀懝?
 */
const numberingMark = Decoration.mark({ class: 'cm-numbering' });

/**
 * 閺嬪嫬缂撴惔蹇撳娇妤傛ü瀵掔憗鍛淬偘閸?
 * 閸栧綊鍘ょ悰宀勵浕閿涘牆褰查懗鑺ユ箒缂傗晞绻橀敍澶屾畱鎼村繐褰块弽鐓庣础閿?
 * - 閸楁洑閲滈弫鏉跨摟閸旂姷鍋ｉ敍鍫濐洤 1.閵?.閵?0.閿?
 * - 閺佹澘鐡?閺佹澘鐡?閹存牗娲挎径姘湴缁狙嶇礄婵?4.2閵?.2.1閵?.2.1.1閿?
 * - 閸楁洑閲滄径褍鍟撶€涙鐦濋崝鐘靛仯閿涘牆顩?A.閵嗕竻.閵嗕竼.閿?
 * - 閸楁洑閲滅亸蹇撳晸鐎涙鐦濋崝鐘靛仯閿涘牆顩?a.閵嗕攻.閵嗕恭.閿?
 * - 鐎涙鐦?閺佹澘鐡ч崝鐘靛仯閿涘牆顩?A1.閵嗕竸100.閵嗕竻2.閿?
 * - 娑擃厽鏋冮弫鏉跨摟鎼村繐褰块敍鍫濐洤 娑撯偓閵嗕椒绨╅妴浣风瑏閵嗕緤绱?
 * - 閸﹀棛鍋ｉ弮鐘茬碍閸掓銆冮敍鍫濐洤 閳ヮ澁绱?
 */
function buildNumberingDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number }[] = [];
  const doc = state.doc;

  // 閸栧綊鍘ゆ惔蹇撳娇閺嶇厧绱￠敍?
  // 1. 閸楁洑閲滈弫鏉跨摟閸旂姷鍋ｉ敍鍫濐洤 1.閵?.閵?0.閵?00.閿?
  // 2. 閺佹澘鐡?閺佹澘鐡?閹存牗娲挎径姘湴缁狙嶇礄婵?4.2閵?.2.1閵?.2.1.1閿?
  // 3. 閸楁洑閲滅€涙鐦濋崝鐘靛仯閿涘牆顩?A.閵嗕竻.閵嗕工.閵嗕攻.閿?
  // 4. 鐎涙鐦?閺佹澘鐡ч崝鐘靛仯閿涘牆顩?A1.閵嗕竸100.閵嗕竻2.閿?
  // 5. 娑擃厽鏋冮弫鏉跨摟鎼村繐褰块敍鍫濐洤 娑撯偓閵嗕椒绨╅妴浣风瑏閵嗕礁宕勯妴浣烘閿?
  // 6. 閸﹀棛鍋ｉ弮鐘茬碍閸掓銆冮敍鍫濐洤 閳ヮ澁绱?
  // 鎼村繐褰胯箛鍛淬€忛崷銊攽妫ｆ牭绱欓崣顖濆厴閺堝缂夋潻娑氣敄閺嶇》绱氶敍灞芥倵闂堛垼绐＄粚鐑樼壐閹存牕鍙炬禒鏍у敶鐎?
  const numberingRegex = /^(\s*)(\d+\.|[A-Za-z]\.|[A-Za-z]\d{1,3}\.|(?:[一二三四五六七八九十百千万零两]+、?|\d+(?:\.\d+)+))\s/;
  
  // 瀵板懎濮欏〒鍛礋濮濓絽鍨敍姘崇儲鏉?閳?[ ] 閹?閳?[x] 閺嶇厧绱?
  const todoRegex = /^[\t ]*[-*+•]\s\[[ xX]\](\s|$)/;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    
    // 鐠哄疇绻冨鍛濞撳懎宕熺悰?
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
 * 鎼村繐褰挎妯瑰瘨 StateField
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
// 閺傚洦婀版０婊嗗缁崵绮?- 缁?StateField + Decoration 閺傝顢嶉敍鍫滅瑝娴ｈ法鏁ゅ锝呭灟閿?
// ============================================================================

/**
 * 妫版粏澹婇弽鍥唶閺佺増宓佺紒鎾寸€?
 */
interface ColorMark {
  from: number;
  to: number;
  bgColor?: string;
  textColor?: string;
}

/**
 * 濞ｈ濮?閺囧瓨鏌婃０婊嗗閻?StateEffect
 */
const addColorEffect = StateEffect.define<ColorMark>();

/**
 * 濞撳懘娅庢０婊嗗閻?StateEffect
 */
const clearColorEffect = StateEffect.define<{ from: number; to: number }>();

/**
 * 妫版粏澹婇弽鍥唶 StateField
 * 鐎涙ê鍋嶉幍鈧張澶嬫瀮閺堫剟顤侀懝韫繆閹垽绱濇稉宥勭贩鐠ф牗鏋冨锝勮厬閻?HTML 閺嶅洨顒?
 */
const colorMarksField = StateField.define<ColorMark[]>({
  create() {
    return [];
  },
  update(marks, tr) {
    let newMarks = marks;

    // 婢跺嫮鎮婇弬鍥ㄣ€傞崣妯哄 - 閺囧瓨鏌婇幍鈧張澶嬬垼鐠佹壆娈戞担宥囩枂
    if (tr.docChanged) {
      newMarks = marks
        .map(mark => {
          // 娴ｈ法鏁?mapPos 閺囧瓨鏌婃担宥囩枂
          const newFrom = tr.changes.mapPos(mark.from, 1);
          const newTo = tr.changes.mapPos(mark.to, -1);
          // 婵″倹鐏夐懠鍐ㄦ纯閺冪姵鏅ラ敍鍫ｎ潶閸掔娀娅庨敍澶涚礉鏉╂柨娲?null
          if (newFrom >= newTo) {
            return null;
          }
          return { ...mark, from: newFrom, to: newTo };
        })
        .filter((mark): mark is ColorMark => mark !== null);
    }

    // 婢跺嫮鎮婃０婊嗗閺佸牊鐏?
    for (const effect of tr.effects) {
      if (effect.is(addColorEffect)) {
        const newMark = effect.value;
        // 閺屻儲澹橀幍鈧張澶愬櫢閸欑姷娈戦弽鍥唶
        const overlappingMarks = newMarks.filter(
          m => !(m.to <= newMark.from || m.from >= newMark.to)
        );

        if (overlappingMarks.length > 0) {
          // 缁夊娅庨幍鈧張澶愬櫢閸欑姷娈戦弽鍥唶
          newMarks = newMarks.filter(
            m => m.to <= newMark.from || m.from >= newMark.to
          );

          // 婢跺嫮鎮婂В蹇庨嚋闁插秴褰旈弽鍥唶閿涘苯褰查懗浠嬫付鐟曚礁鍨庨崜?
          for (const existing of overlappingMarks) {
            // 婵″倹鐏夐弮褎鐖ｇ拋鏉挎躬閺傜増鐖ｇ拋棰佺閸撳秵婀侀柈銊ュ瀻
            if (existing.from < newMark.from) {
              newMarks.push({
                from: existing.from,
                to: newMark.from,
                bgColor: existing.bgColor,
                textColor: existing.textColor,
              });
            }
            // 婵″倹鐏夐弮褎鐖ｇ拋鏉挎躬閺傜増鐖ｇ拋棰佺閸氬孩婀侀柈銊ュ瀻
            if (existing.to > newMark.to) {
              newMarks.push({
                from: newMark.to,
                to: existing.to,
                bgColor: existing.bgColor,
                textColor: existing.textColor,
              });
            }
          }

          // 閸氬牆鑻熸０婊嗗閿涙碍鏌婇弽鍥唶娴ｈ法鏁ら弬浼搭杹閼硅绱濇穱婵堟殌閺冄勭垼鐠侀鑵戦張顏囶潶鐟曞棛娲婇惃鍕杹閼?
          const firstOverlap = overlappingMarks[0];
          const merged: ColorMark = {
            from: newMark.from,
            to: newMark.to,
            bgColor: newMark.bgColor !== undefined ? newMark.bgColor : firstOverlap.bgColor,
            textColor: newMark.textColor !== undefined ? newMark.textColor : firstOverlap.textColor,
          };
          newMarks.push(merged);
        } else {
          // 濞ｈ濮為弬鐗堢垼鐠?
          newMarks = [...newMarks, newMark];
        }
      } else if (effect.is(clearColorEffect)) {
        const { from, to } = effect.value;
        // 缁夊娅庨懠鍐ㄦ纯閸愬懐娈戦弽鍥唶
        newMarks = newMarks.filter(m => m.to <= from || m.from >= to);
      }
    }

    return newMarks;
  },
});

/**
 * 妫板嫯顫嶉懠鍐ㄦ纯閺佺増宓?- 閻劋绨崷銊╊暕鐟欏牊妞傞弳鍌涙闂呮劘妫屽鍙夋箒閼冲本娅欓懝?
 */
interface PreviewRange {
  from: number;
  to: number;
  type: 'color' | 'background-color';
}

/**
 * 鐠佸墽鐤嗘０鍕潔閼煎啫娲块惃?StateEffect
 */
const setPreviewRangeEffect = StateEffect.define<PreviewRange | null>();

/**
 * 妫板嫯顫嶉懠鍐ㄦ纯 StateField
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
 * 娴?ColorMark 閺佹壆绮嶉悽鐔稿灇 DecorationSet
 * @param marks 妫版粏澹婇弽鍥唶閺佹壆绮?
 * @param previewRange 妫板嫯顫嶉懠鍐ㄦ纯閿涘牆顩ч弸婊勬箒閿涘苯鍨崷銊嚉閼煎啫娲块崘鍛存閽樺繐顕惔鏃傝閸ㄥ娈戞０婊嗗閿?
 */
function buildColorDecorations(
  marks: ColorMark[],
  previewRange: PreviewRange | null
): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const mark of marks) {
    // 濡偓閺屻儲妲搁崥锔跨瑢妫板嫯顫嶉懠鍐ㄦ纯闁插秴褰?
    const overlapsPreview =
      previewRange &&
      !(mark.to <= previewRange.from || mark.from >= previewRange.to);

    if (overlapsPreview && previewRange) {
      // 闂団偓鐟曚礁鍨庨崜鍙夌垼鐠佸府绱版０鍕潔閼煎啫娲块崘鍛存閽樺繐顕惔鏃堫杹閼硅绱濋懠鍐ㄦ纯婢舵牔绻氶幐浣稿斧閺?
      
      // 1. 妫板嫯顫嶉懠鍐ㄦ纯娑斿澧犻惃鍕劥閸掑棴绱欐穱婵囧瘮閸樼喐鐗遍敍?
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

      // 2. 妫板嫯顫嶉懠鍐ㄦ纯閸愬懐娈戦柈銊ュ瀻閿涘牓娈ｉ挊蹇擃嚠鎼存梻琚崹瀣畱妫版粏澹婇敍?
      const overlapFrom = Math.max(mark.from, previewRange.from);
      const overlapTo = Math.min(mark.to, previewRange.to);
      if (overlapFrom < overlapTo) {
        const styleAttrs: string[] = [];
        // 閸欘亙绻氶悾娆庣瑝鐞氼偊顣╃憴鍫㈡畱妫版粏澹婄猾璇茬€?
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

      // 3. 妫板嫯顫嶉懠鍐ㄦ纯娑斿鎮楅惃鍕劥閸掑棴绱欐穱婵囧瘮閸樼喐鐗遍敍?
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
      // 娑撳秳绗屾０鍕潔閼煎啫娲块柌宥呭綌閿涘本顒滅敮鍛婃▔缁€?
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

  // 閹稿缍呯純顔藉笓鎼?
  decorations.sort((a, b) => a.from - b.from);

  return Decoration.set(decorations);
}

/**
 * 妫版粏澹婄憗鍛淬偘閸?StateField
 * 娴?colorMarksField 閻㈢喐鍨氱憗鍛淬偘閸?
 */
const colorDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildColorDecorations(state.field(colorMarksField), null);
  },
  update(decorations, tr) {
    // 婵″倹鐏夐張澶愵杹閼硅尙娴夐崗宕囨畱閺佸牊鐏夐妴浣规瀮濡楋絽褰夐崠鏍ㄥ灗妫板嫯顫嶉懠鍐ㄦ纯閸欐ê瀵查敍宀勫櫢閺傜増鐎楦款棅妤楁澘娅?
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
 * 閸掆晝鏁ょ拠顓熺《閺嶆垵鍨介弬顓濈秴缂冾喗妲搁崥锕€婀?Markdown 閺嶅洩顔囬崘鍜冪礄閺嶅洭顣介妴浣稿灙鐞涖劍鐖ｇ拋鎵搼閿?
 * 鏉╂瑤绨烘担宥囩枂娑撳秴绨茬拠銉ョ安閻劑顤侀懝?
 */
function isInMarkdownSyntax(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);

  // 闁秴宸婚懞鍌滃仯閸欏﹤鍙鹃悥鎯板Ν閻?
  while (node) {
    const name = node.type.name;
    // 濡偓閺屻儲妲搁崥锔芥Ц Markdown 鐠囶厽纭堕弽鍥唶
    if (
      name === 'HeaderMark' ||      // # ## ### 缁?
      name === 'ListMark' ||        // - * + 1. 缁?
      name === 'QuoteMark' ||       // >
      name === 'CodeMark' ||        // ` ```
      name === 'EmphasisMark' ||    // * _ ** __
      name === 'LinkMark' ||        // [ ] ( )
      name === 'URL'                // 闁剧偓甯?URL
    ) {
      return true;
    }
    if (!node.parent || node.parent === node) break;
    node = node.parent;
  }

  return false;
}

/**
 * 閼惧嘲褰囩悰宀勵浕閻?Markdown 閺嶅洩顔囩紒鎾存将娴ｅ秶鐤?
 * 鏉╂柨娲栭崘鍛啇瀵偓婵娈戞担宥囩枂閿涘牐鐑︽潻鍥ㄧ垼妫版顑侀崣鏋偓浣稿灙鐞涖劍鐖ｇ拋鎵搼閿?
 * 閺€顖涘瘮婢舵氨顫掓惔蹇撳娇閺嶇厧绱￠敍?
 * - 閺嶅洤鍣?Markdown閿? ## - * + 1. 缁?
 * - 婢舵氨楠囬弫鏉跨摟閿?.1閵?.2.1閵?.1 缁?
 * - 鐎涙鐦濇惔蹇撳娇閿涙. B. a. b. A1. B2. 缁?
 * - 鐎涙鐦?閺佹澘鐡уǎ宄版値閿涙1閵嗕竻2閵嗕竸1.1 缁?
 * - 娑擃厽鏋冩惔蹇撳娇閿涙矮绔撮妴浣风癌閵嗕椒绗侀妴浣虹搼
 * - 閺€顖涘瘮娴犵粯鍓扮紓鈺勭箻閿涘牏鈹栭弽鍏煎灗 TAB閿?
 */
function getContentStartPos(state: EditorState, lineFrom: number): number {
  const line = state.doc.lineAt(lineFrom);
  const tree = syntaxTree(state);
  const lineText = line.text;

  // 娴犲氦顢戞＃鏍х磻婵鐓￠幍?
  let contentStart = line.from;

  // 閸忓牏鏁ょ拠顓熺《閺嶆垶顥呭ù瀣垼閸?Markdown 閺嶅洩顔?
  // 婢х偛濮炲Λ鈧ù瀣瘱閸ョ繝浜掗弨顖涘瘮濞ｅ崬瀹崇紓鈺勭箻
  tree.iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      // 婵″倹鐏夐弰顖涚垼鐠佹媽濡悙?
      if (
        node.type.name === 'HeaderMark' ||
        node.type.name === 'ListMark' ||
        node.type.name === 'QuoteMark'
      ) {
        // 閸愬懎顔愭禒搴㈢垼鐠佹澘鎮楅棃銏犵磻婵?
        contentStart = Math.max(contentStart, node.to);
        // 鐠哄疇绻冮弽鍥唶閸氬海娈戠粚鐑樼壐
        const text = state.doc.sliceString(node.to, Math.min(node.to + 2, line.to));
        if (text.startsWith(' ')) {
          contentStart = node.to + 1;
        }
      }
    },
  });

  // 妫版繂顦诲Λ鈧ù瀣倗缁夊秴绨崣閿嬬壐瀵骏绱欑拠顓熺《閺嶆垵褰查懗鎴掔瑝鐠囧棗鍩嗛敍?
  // 娴ｈ法鏁?[\t ]* 閺勫海鈥橀崠褰掑帳 TAB 閸滃瞼鈹栭弽?
  const listPatterns = [
    // 婢舵氨楠囬弫鏉跨摟鎼村繐褰块敍?.1閵?.2.1閵?.1.2 缁涘绱欓弨顖涘瘮娴犵粯鍓扮紓鈺勭箻閿?
    /^([\t ]*)((\d+\.)+\d*\s+)/,
    // 閸楁洑閲滈弫鏉跨摟鎼村繐褰块敍?. 2. 10. 缁涘绱欓弨顖涘瘮娴犵粯鍓扮紓鈺勭箻閿?
    /^([\t ]*)(\d+\.\s+)/,
    // 鐎涙鐦?閺佹澘鐡?婢舵氨楠囬敍娆?.1閵嗕竻2.3 缁?
    /^([\t ]*)([A-Za-z]\d+(?:\.\d+)*\.?\s+)/,
    // 鐎涙鐦?閺佹澘鐡ф惔蹇撳娇閿涙1閵嗕竻2閵嗕竸1.閵嗕竻2. 缁?
    /^([\t ]*)([A-Za-z]\d+\.?\s+)/,
    // 閸楁洖鐡уВ宥呯碍閸欏嚖绱癆. B. a. b. 缁?
    /^([\t ]*)([A-Za-z]\.\s+)/,
    // 娑擃厽鏋冩惔蹇撳娇閿涙矮绔撮妴浣风癌閵嗕椒绗侀妴浣虹搼
    /^([\t ]*)([一二三四五六七八九十百千万零两]+、?\s*)/,
    // 閺冪姴绨崚妤勩€冪粭锕€褰块敍? * + 閳?
    /^([\t ]*)([-*+•]\s+)/,
    // 閺嶅洭顣界粭锕€褰块敍? ## ### 缁?
    /^([\t ]*)(#{1,6}\s+)/,
  ];

  for (const regex of listPatterns) {
    const match = lineText.match(regex);
    if (match) {
      const matchEnd = line.from + match[0].length;
      contentStart = Math.max(contentStart, matchEnd);
      break; // 閸栧綊鍘ら崚棰佺娑擃亜姘ㄩ崑婊勵剾
    }
  }

  return contentStart;
}

/**
 * 鐠哄疇绻冮弬鍥ㄦ拱妫ｆ牕鐔惃鍕敄閻ц棄鐡х粭锔肩礉鏉╂柨娲栫€圭偤妾崘鍛啇閻ㄥ嫯瀵栭崶?
 */
function trimTextRange(
  state: EditorState,
  from: number,
  to: number
): { from: number; to: number } {
  const text = state.sliceDoc(from, to);
  
  // 鐠侊紕鐣婚崜宥咁嚤缁岃櫣娅?
  let leadingSpaces = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' || text[i] === '\t') {
      leadingSpaces++;
    } else {
      break;
    }
  }
  
  // 鐠侊紕鐣荤亸楣冨劥缁岃櫣娅?
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
 * 鎼存梻鏁ゆ０婊嗗閺嶅嘲绱￠崚浼粹偓澶夎厬閺傚洦婀伴敍鍫㈠嚱 StateField 閺傝顢嶉敍?
 * @param view EditorView 鐎圭偘绶?
 * @param styleType 閺嶅嘲绱＄猾璇茬€烽敍?color' 閹?'background-color'
 * @param newColor 閺傛壆娈戞０婊嗗閸?
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
    // 濞屸剝婀侀柅澶夎厬閺傚洦婀伴敍宀勨偓澶夎厬閺佺顢戦崘鍛啇閿涘牐鐑︽潻?Markdown 閺嶅洩顔囬敍?
    const line = view.state.doc.lineAt(from);
    targetFrom = getContentStartPos(view.state, line.from);
    targetTo = line.to;
  } else {
    targetFrom = from;
    targetTo = to;

    // 濡偓閺屻儵鈧灏挧宄邦潗娴ｅ秶鐤嗛弰顖氭儊閸?Markdown 閺嶅洩顔囬崘?
    const startLine = view.state.doc.lineAt(from);
    const contentStart = getContentStartPos(view.state, startLine.from);
    if (targetFrom < contentStart) {
      targetFrom = contentStart;
    }
  }

  // 鐠哄疇绻冩＃鏍х啲缁岃櫣娅?
  const trimmed = trimTextRange(view.state, targetFrom, targetTo);
  targetFrom = trimmed.from;
  targetTo = trimmed.to;

  // 婵″倹鐏夐懠鍐ㄦ纯閺冪姵鏅ラ敍宀€娲块幒銉ㄧ箲閸?
  if (targetFrom >= targetTo) {
    return;
  }

  // 濡偓閺屻儲妲搁崥锕€瀵橀崥顐㈩樋鐞?
  const targetText = view.state.sliceDoc(targetFrom, targetTo);
  const hasMultipleLines = targetText.includes('\n');

  if (hasMultipleLines) {
    // 婢舵俺顢戞径鍕倞閿涙艾顕В蹇庣鐞涘苯鍨庨崚顐㈢安閻劑顤侀懝?
    const doc = view.state.doc;
    const startLine = doc.lineAt(targetFrom);
    const endLine = doc.lineAt(targetTo);
    const effects: StateEffect<ColorMark>[] = [];

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = doc.line(lineNum);
      let lineFrom = line.from;
      let lineTo = line.to;

      // 婵″倹鐏夐弰顖滎儑娑撯偓鐞涘矉绱濇禒搴ㄢ偓澶夎厬娴ｅ秶鐤嗗鈧慨?
      if (lineNum === startLine.number) {
        lineFrom = Math.max(targetFrom, line.from);
      }
      // 婵″倹鐏夐弰顖涙付閸氬簼绔寸悰宀嬬礉閸掍即鈧鑵戞担宥囩枂缂佹挻娼?
      if (lineNum === endLine.number) {
        lineTo = Math.min(targetTo, line.to);
      }

      // 鐠哄疇绻?Markdown 閺嶅洩顔?
      const contentStart = getContentStartPos(view.state, line.from);
      if (lineFrom < contentStart) {
        lineFrom = contentStart;
      }

      // 鐠哄疇绻冩＃鏍х啲缁岃櫣娅?
      const lineTrimmed = trimTextRange(view.state, lineFrom, lineTo);
      lineFrom = lineTrimmed.from;
      lineTo = lineTrimmed.to;

      // 婵″倹鐏夋潻娆庣鐞涘本鐥呴張澶婂敶鐎圭櫢绱濈捄瀹犵箖
      if (lineFrom >= lineTo) {
        continue;
      }

      // 閺屻儲澹樺鍙夋箒閻ㄥ嫰顤侀懝鍙夌垼鐠佸府绱欓弻銉﹀娑撳孩鏌婇懠鍐ㄦ纯闁插秴褰旈惃鍕閺堝鐖ｇ拋甯礉閸氬牆鑻熺€瑰啩婊戦惃鍕杹閼硅绱?
      const existingMarks = view.state.field(colorMarksField);
      const overlappingMarks = existingMarks.filter(
        m => !(m.to <= lineFrom || m.from >= lineTo)
      );

      // 娴犲孩澧嶉張澶愬櫢閸欑姵鐖ｇ拋棰佽厬閺€鍫曟肠妫版粏澹?
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

      // 閸掓稑缂撻弬鎵畱妫版粏澹婇弽鍥唶
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

  // 閸楁洝顢戞径鍕倞
  // 閺屻儲澹樺鍙夋箒閻ㄥ嫰顤侀懝鍙夌垼鐠佸府绱欓弻銉﹀娑撳孩鏌婇懠鍐ㄦ纯闁插秴褰旈惃鍕閺堝鐖ｇ拋甯礉閸氬牆鑻熺€瑰啩婊戦惃鍕杹閼硅绱?
  const existingMarks = view.state.field(colorMarksField);
  const overlappingMarks = existingMarks.filter(
    m => !(m.to <= targetFrom || m.from >= targetTo)
  );

  // 娴犲孩澧嶉張澶愬櫢閸欑姵鐖ｇ拋棰佽厬閺€鍫曟肠妫版粏澹?
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

  // 閸掓稑缂撻弬鎵畱妫版粏澹婇弽鍥唶
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
 * 閼惧嘲褰囪ぐ鎾冲闁鑵戦弬鍥ㄦ拱閻ㄥ嫮骞囬張澶愵杹閼?
 * @param view EditorView 鐎圭偘绶?
 * @param styleType 閺嶅嘲绱＄猾璇茬€烽敍?color' 閹?'background-color'
 * @returns 閻滅増婀佹０婊嗗閸婄》绱濇俊鍌涚亯濞屸剝婀侀崚娆掔箲閸?undefined
 */
function getExistingColor(
  view: EditorView,
  styleType: 'color' | 'background-color'
): string | undefined {
  const { from, to } = view.state.selection.main;
  const marks = view.state.field(colorMarksField);

  // 閺屻儲澹橀崠鍛儓闁灏惃鍕杹閼瑰弶鐖ｇ拋?
  const mark = marks.find(m => m.from <= from && m.to >= to);

  if (mark) {
    return styleType === 'background-color' ? mark.bgColor : mark.textColor;
  }

  return undefined;
}

/**
 * 妫版粏澹婃０鍕潔 StateEffect - 閻劋绨弴瀛樻煀妫板嫯顫嶇憗鍛淬偘閸?
 */
interface ColorPreviewData {
  type: 'color' | 'background-color';
  color: string;
  from: number;
  to: number;
}

const setColorPreviewEffect = StateEffect.define<ColorPreviewData | null>();

/**
 * 妫版粏澹婃０鍕潔鐟佸懘銈伴崳?StateField
 * 閻劋绨崷銊﹀珛閸斻劑顤侀懝鏌モ偓澶嬪閸ｃ劍妞傞弰鍓с仛娑撳瓨妞傛０鍕潔閺佸牊鐏?
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
 * 缂傗晞绻樼痪?Widget - 閺勫墽銇氱紓鈺勭箻鐏炲倻楠囬惃鍕€惄瀵稿殠
 * 閸欘亝妯夌粈杞扮閺夛紕缂夋潻娑氬殠閿涘奔绗岄悥鍓侀獓閹舵ê褰旈崶鐐垼鐎靛綊缍?
 */
class IndentGuideWidget extends WidgetType {
  constructor(readonly indentLevel: number, readonly hasFoldIcon: boolean = false) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-indent-guides';
    
    // 閼惧嘲褰囨稉濠氼暯缂傗晞绻樼痪鍧楊杹閼?
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--ws-mirrorIndentGuide-background')
      .trim();
    
    // 濡偓濞村妲搁崥锔芥Ц閺嗘澹婃稉濠氼暯
    const isDarkTheme = document.body.classList.contains('ws-theme-dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    
    // 绾喖鐣鹃張鈧紒鍫ヮ杹閼?
    let finalColor: string;
    if (themeColor) {
      // 濡偓濞村顤侀懝鍙夋Ц閸氾箑鍑￠崠鍛儓闁繑妲戞惔?
      const hasAlpha = themeColor.includes('rgba') || 
        themeColor.includes('hsla') ||
        (themeColor.startsWith('#') && themeColor.length === 9);
      
      if (hasAlpha) {
        // 瀹稿弶婀侀柅蹇旀鎼达讣绱濋惄瀛樺复娴ｈ法鏁ゆ稉濠氼暯妫版粏澹?
        finalColor = themeColor;
      } else {
        // 濞屸剝婀侀柅蹇旀鎼达讣绱濈亸婵婄槸鐟欙絾鐎?RGB 閸婄厧鑻熷ǎ璇插 0.6 闁繑妲戞惔?
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
          // 閺冪姵纭剁憴锝嗙€介敍灞煎▏閻劑绮拋銈夘杹閼?
          finalColor = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
        }
      }
    } else {
      // 濞屸剝婀佹稉濠氼暯妫版粏澹婇敍灞煎▏閻劑绮拋銈夘杹閼?
      finalColor = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
    }
    
    // 閸欘亜鍨卞杞扮閺夛紕缂夋潻娑氬殠閿涘奔缍呯純顔荤瑢閻栧墎楠囬幎妯哄綌閸ョ偓鐖ｇ€靛綊缍?
    // 閹舵ê褰旈崶鐐垼娴ｅ秶鐤嗙拋锛勭暬閿涘牊娼甸懛?ListFoldWidget閿涘绱?
    // - indent=0 閺冭绱發eft = -24px
    // - indent>0 閺冭绱發eft = (indent - 1) * 8 - 8
    // 閹舵ê褰旈崶鐐垼鐎硅棄瀹?20px閿涘奔鑵戣箛鍐ㄦ躬 left + 10
    // 
    // 瑜版挸澧犵悰宀€娈?indentLevel 鐞涖劎銇氱紓鈺勭箻缁狙冨焼閿涘牊鐦＄痪?2 缁岀儤鐗搁敍?
    // 閻栧墎楠囬惃鍕級鏉╂稓楠囬崚?= indentLevel - 1
    // 閻栧墎楠囬惃鍕敄閺嶅吋鏆?= (indentLevel - 1) * 2
    if (this.indentLevel >= 1) {
      const guide = document.createElement('span');
      guide.className = 'cm-indent-guide cm-indent-guide-single';
      
      // 閻栧墎楠囬惃鍕敄閺嶅吋鏆?
      const parentSpaces = (this.indentLevel - 1) * 2;
      // 閻栧墎楠囬幎妯哄綌閸ョ偓鐖ｉ惃?left 娴ｅ秶鐤?
      const foldIconLeft = parentSpaces > 0 ? (parentSpaces - 1) * 8 - 8 : -24;
      // 缂傗晞绻樼痪澶哥秴缂?= 閹舵ê褰旈崶鐐垼瀹革箒绔?+ 5px閿涘牊濮岄崣鐘叉禈閺嶅洣鑵戣箛鍐ㄤ焊瀹革缚绔撮悙鐧哥礆
      const leftPos = foldIconLeft + 5;
      
      guide.style.left = `${leftPos}px`;
      guide.style.backgroundColor = finalColor;
      guide.style.top = '0';
      
      container.appendChild(guide);
    }
    
    return container;
  }

  eq(_other: IndentGuideWidget): boolean {
    // 瀵搫鍩楅柌宥嗘煀濞撳弶鐓嬫禒銉ョ安閻劍鏌婇惃鍕秴缂冾喛顓哥粻?
    return false;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 閺嬪嫬缂撶紓鈺勭箻缁捐儻顥婃鏉挎珤
 * 鐟欏嫬鍨敍姘付鐏忔垹缂夋潻?娑擃亞鈹栭弽纭风礄閹?娑撶尲ab閿涘澧犻弰鍓с仛缂傗晞绻樼痪?
 */
function buildIndentGuideDecorations(state: EditorState): DecorationSet {
  const decorations: { from: number; decoration: Decoration }[] = [];
  
  try {
    const doc = state.doc;
    const TAB_SIZE = 2; // 1娑撶尲ab = 2娑擃亞鈹栭弽纭风礄娑撳海绱潏鎴濇珤 indentUnit 娑撯偓閼疯揪绱?

    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const lineText = line.text;
      
      // 鐠哄疇绻冮弽鍥暯鐞?
      if (getHeadingLevel(lineText) > 0) continue;
      
      // 鐠侊紕鐣荤紓鈺勭箻缁狙冨焼閿涘牊鐦?娑擃亞鈹栭弽鍏煎灗1娑撶尲ab娑撹桨绔寸痪褝绱?
      let indent = getIndentLevel(lineText);
      
      // 婵″倹鐏夐弰顖溾敄鐞涘矉绱濋弽瑙勫祦娑撳﹣绗呴弬鍥┾€樼€规氨缂夋潻娑氶獓閸?
      if (lineText.trim().length === 0) {
        // 閸氭垳绗傞弻銉﹀閺堚偓鏉╂垹娈戦棃鐐碘敄鐞涘本娼电涵顔肩暰娑撳﹣绗呴弬鍥╃級鏉?
        for (let j = i - 1; j >= 1; j--) {
          const prevLine = doc.line(j);
          if (prevLine.text.trim().length > 0) {
            indent = getIndentLevel(prevLine.text);
            break;
          }
        }
      }
      
      const indentLevel = Math.floor(indent / TAB_SIZE);
      
      // 濡偓濞村顕氱悰灞炬Ц閸氾附婀佺€涙劖濮岄崣鐘叉禈閺嶅浄绱欓棃鐐寸垼妫版顢戞稉鏃€婀佺€涙劗缂夋潻娑樺敶鐎圭櫢绱?
      const hasFoldIcon = computeListFoldRange(state, line.from) !== null;
      
      // 閸欘亣顩﹂張澶岀級鏉╂稑姘ㄩ崚娑樼紦缂傗晞绻樼痪鍖＄礄indentLevel >= 1閿?
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
 * 缂傗晞绻樼痪鑳棅妤楁澘娅?StateField
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
 * 閺屻儲澹橀崠鍛儓瑜版挸澧犵悰宀€娈戦幎妯哄綌缂佸嫸绱欓悥鎯邦攽 + 閹碘偓閺堝鐡欑悰?+ 缁岄缚顢戦敍?
 * 閻栨儼顢戦弰顖滅級鏉╂稒鐦ぐ鎾冲鐞涘苯鐨惃鍕付鏉╂垿娼粚楦款攽
 * 鏉╂柨娲?{ parentLine: 閻栨儼顢戦崣? childLines: 鐎涙劘顢戦崣閿嬫殶缂佸嫸绱欓崠鍛儓缁岄缚顢戦敍?} 閹?null
 */
function findFoldGroup(state: EditorState, lineNumber: number): { parentLine: number; childLines: number[] } | null {
  const currentLine = state.doc.line(lineNumber);
  let currentIndent = getIndentLevel(currentLine.text);
  const totalLines = state.doc.lines;
  
  // 閺嶅洭顣界悰灞肩瑝閸欏倷绗岄幎妯哄綌缂?
  if (getHeadingLevel(currentLine.text) > 0) return null;
  
  // 婵″倹鐏夐弰顖溾敄鐞涘矉绱濈亸婵婄槸閺嶈宓佹稉濠佺瑓閺傚洨鈥樼€规氨缂夋潻娑氶獓閸?
  if (currentLine.text.trim().length === 0) {
    // 閸氭垳绗傞弻銉﹀閺堚偓鏉╂垹娈戦棃鐐碘敄鐞涘本娼电涵顔肩暰娑撳﹣绗呴弬?
    let contextIndent = -1;
    let contextIsHeading = false;
    for (let i = lineNumber - 1; i >= 1; i--) {
      const line = state.doc.line(i);
      if (line.text.trim().length > 0) {
        // 婵″倹鐏夋稉濠佺瑓閺傚洦妲搁弽鍥暯鐞涘矉绱濇稉宥嗘▔缁€铏圭級鏉╂稓鍤?
        if (getHeadingLevel(line.text) > 0) {
          contextIsHeading = true;
        }
        contextIndent = getIndentLevel(line.text);
        break;
      }
    }
    
    if (contextIndent < 0 || contextIsHeading) return null;
    
    // 娴ｈ法鏁ゆ稉濠佺瑓閺傚洨缂夋潻娑楃稊娑撳搫缍嬮崜宥囩級鏉?
    currentIndent = contextIndent;
  }
  
  // 閹懎鍠?閿涙艾缍嬮崜宥堫攽閺勵垳鍩楃悰宀嬬礄閺堝鐡欑悰宀嬬礆
  // 閸氭垳绗呴弻銉﹀閺勵垰鎯侀張澶岀級鏉╂稒鐦ぐ鎾冲鐞涘苯顦块惃鍕攽
  const childLines: number[] = [];
  let hasRealChild = false;
  
  for (let i = lineNumber + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    // 缁岄缚顢戞稊鐔告暪闂嗗棴绱欐俊鍌涚亯閸︺劌鐡欑悰灞藉隘閸╃喎鍞撮敍?
    if (line.text.trim().length === 0) {
      childLines.push(i);
      continue;
    }
    
    // 婵″倹鐏夌紓鈺勭箻鐏忓繋绨粵澶夌艾瑜版挸澧犵悰宀嬬礉鐠囧瓨妲戝鑼病缁傝绱戞禍鍡楃摍鐞涘苯灏崺?
    if (lineIndent <= currentIndent) {
      break;
    }
    
    // 閺€鍫曟肠閹碘偓閺堝缂夋潻娑欑槷瑜版挸澧犵悰灞筋樋閻ㄥ嫯顢戞担婊€璐熺€涙劘顢?
    childLines.push(i);
    hasRealChild = true;
  }
  
  if (hasRealChild) {
    return { parentLine: lineNumber, childLines };
  }
  
  // 閹懎鍠?閿涙艾缍嬮崜宥堫攽閺勵垰鐡欑悰宀嬬礉闂団偓鐟曚焦澹橀崚鎵煑鐞?
  // 閻栨儼顢戦弰顖滅級鏉╂稒鐦ぐ鎾冲鐞涘苯鐨惃鍕付鏉╂垿娼粚楦款攽閿涘牅绗栨稉宥嗘Ц閺嶅洭顣界悰宀嬬礆
  if (currentIndent <= 0) return null;
  
  let parentLine: number | null = null;
  let parentIndent = -1;
  
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    if (line.text.trim().length === 0) continue;
    
    // 鐠哄疇绻冮弽鍥暯鐞涘矉绱濋弽鍥暯鐞涘奔绗夐懗鎴掔稊娑撶儤濮岄崣鐘电矋閻ㄥ嫮鍩楃悰?
    if (getHeadingLevel(line.text) > 0) continue;
    
    // 閹垫儳鍩岀紓鈺勭箻濮ｆ柨缍嬮崜宥堫攽鐏忔垹娈戠悰灞肩稊娑撹櫣鍩楃悰?
    if (lineIndent < currentIndent) {
      parentLine = i;
      parentIndent = lineIndent;
      break;
    }
  }
  
  if (parentLine === null) return null;
  
  // 妤犲矁鐦夐悥鎯邦攽閺勵垰鎯侀惇鐔烘畱閺堝鐡欑悰宀嬬礄閸楄櫕婀侀幎妯哄綌閸旂喕鍏橀敍?
  // 濡偓閺屻儳鍩楃悰灞肩瑓闂堛垺妲搁崥锔芥箒缂傗晞绻橀弴鏉戭樋閻ㄥ嫰娼粚楦款攽
  let parentHasRealChildren = false;
  for (let i = parentLine + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    if (line.text.trim().length === 0) continue;
    
    if (lineIndent <= parentIndent) break;
    
    // 閹垫儳鍩屾禍鍡欑級鏉╂稒娲挎径姘辨畱闂堢偟鈹栫悰宀嬬礉鐠囧瓨妲戦悥鎯邦攽閺堝鐡欑悰?
    parentHasRealChildren = true;
    break;
  }
  
  if (!parentHasRealChildren) return null;
  
  // 閹垫儳鍩岄悥鎯邦攽閸氬函绱濋弨鍫曟肠閹碘偓閺堝鐡欑悰灞芥嫲缁岄缚顢?
  const allChildLines: number[] = [];
  for (let i = parentLine + 1; i <= totalLines; i++) {
    const line = state.doc.line(i);
    const lineIndent = getIndentLevel(line.text);
    
    // 缁岄缚顢戞稊鐔告暪闂?
    if (line.text.trim().length === 0) {
      allChildLines.push(i);
      continue;
    }
    
    // 婵″倹鐏夌紓鈺勭箻鐏忓繋绨粵澶夌艾閻栨儼顢戦敍宀冾嚛閺勫骸鍑＄紒蹇曨瀲瀵偓娴滃棗鐡欑悰灞藉隘閸?
    if (lineIndent <= parentIndent) {
      break;
    }
    
    // 閺€鍫曟肠閹碘偓閺堝缂夋潻娑欑槷閻栨儼顢戞径姘辨畱鐞?
    allChildLines.push(i);
  }
  
  return { parentLine, childLines: allChildLines };
}

// 閹舵ê褰旂紒鍕彯娴滎喚娈戠悰宀冾棅妤楁澘娅?
const foldParentHighlight = Decoration.line({ class: 'cm-fold-parent-highlighted' });

/**
 * 閹舵ê褰旂紒鍕級鏉╂稓鍤?Widget
 * 娴ｈ法鏁?parentIndent 閸?toDOM 娑擃厼濮╅幀浣筋吀缁犳ぞ缍呯純?
 */
class FoldIndentLineWidget extends WidgetType {
  constructor(readonly parentIndent: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const line = document.createElement('span');
    line.className = 'cm-fold-indent-line';

    // 閼惧嘲褰囩€圭偤妾惃鍕摟缁楋箑顔旀惔?
    const charWidth = view.defaultCharacterWidth;

    // 鐠侊紕鐣荤紓鈺勭箻缁惧じ缍呯純顕嗙礄娑撳海鍩楃痪褎濮岄崣鐘叉禈閺嶅洤顕鎰剁礆
    // 閹舵ê褰旈崶鐐垼娴ｅ秶鐤嗛敍姝盿rentIndent > 0 ? parentIndent * charWidth - 20 : -24
    // 缂傗晞绻樼痪鍨安鐠囥儱婀幎妯哄綌閸ョ偓鐖ｆ稉顓炵妇娴ｅ秶鐤嗛敍鍫濇禈閺嶅洤顔旀惔?20px閿涘奔鑵戣箛鍐ㄦ躬 +10閿?
    let linePos: number;
    if (this.parentIndent > 0) {
      const foldIconLeft = this.parentIndent * charWidth - 20;
      linePos = foldIconLeft + 10; // 閹舵ê褰旈崶鐐垼娑擃厼绺?
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

// 閸掓稑缂撶敮锔芥箒閻栧墎楠囩紓鈺勭箻娣団剝浼呴惃鍕摍鐞涘矂鐝禍顔款棅妤楁澘娅?
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
 * 閺嬪嫬缂撻幎妯哄綌缂佸嫰鐝禍顔款棅妤楁澘娅?
 */
function buildFoldGroupDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  
  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｉ幍鈧崷銊攽
  const selection = state.selection;
  const cursorLine = state.doc.lineAt(selection.main.head).number;
  
  // 閺屻儲澹橀幎妯哄綌缂?
  const foldGroup = findFoldGroup(state, cursorLine);
  
  if (foldGroup) {
    // 閼惧嘲褰囬悥鎯邦攽閻ㄥ嫮缂夋潻娑崇礄缁岀儤鐗搁弫甯礆
    const parentLineObj = state.doc.line(foldGroup.parentLine);
    const parentIndent = getIndentLevel(parentLineObj.text);
    
    // 閺€鍫曟肠閹碘偓閺堝娓剁憰渚€鐝禍顔炬畱鐞涘矉绱濋幐澶夌秴缂冾喗甯撴惔?
    const allLines: { from: number; decoration: Decoration }[] = [];
    
    // 閻栨儼顢戞妯瑰瘨
    allLines.push({ from: parentLineObj.from, decoration: foldParentHighlight });
    
    // 鐎涙劘顢戞妯瑰瘨閿涘牆鐢張澶岀級鏉╂稓鍤?Widget閿?
    for (const childLineNum of foldGroup.childLines) {
      const childLineObj = state.doc.line(childLineNum);
      const childDecorations = createFoldChildDecorations(parentIndent);
      for (const dec of childDecorations) {
        allLines.push({ from: childLineObj.from, decoration: dec });
      }
    }
    
    // 閹稿缍呯純顔藉笓鎼?
    allLines.sort((a, b) => a.from - b.from);
    
    // 濞ｈ濮為崚?builder
    for (const item of allLines) {
      builder.add(item.from, item.from, item.decoration);
    }
  }
  
  return builder.finish();
}

/**
 * 閹舵ê褰旂紒鍕彯娴?StateField
 */
const foldGroupHighlightField = StateField.define<DecorationSet>({
  create(state) {
    return buildFoldGroupDecorations(state);
  },
  update(decorations, tr) {
    // 闁瀚ㄩ崣妯哄閹存牗鏋冨锝呭綁閸栨牗妞傞柌宥嗘煀鐠侊紕鐣?
    if (tr.selection || tr.docChanged) {
      return buildFoldGroupDecorations(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 閼奉亜鐣炬稊?Markdown 鐠囶厽纭舵妯瑰瘨閺嶅嘲绱?
 * 鐟曞棛娲婃妯款吇妤傛ü瀵掗敍宀冾唨閺堝绨崚妤勩€冮弫鏉跨摟缁涘濞囬悽銊ゅ瘜妫版﹢鍘ら懝?
 */
const customHighlightStyle = HighlightStyle.define([
  // 閺堝绨崚妤勩€冮弫鏉跨摟閺嶅洩顔囬敍鍫濐洤 1. 2. 3.閿?
  { tag: tags.processingInstruction, color: 'var(--ws-textLink-foreground)' },
  // 閺嶅洭顣?
  { tag: tags.heading, color: 'var(--ws-textLink-foreground)', fontWeight: '700' },
  // 瀵缚鐨?
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  // 闁剧偓甯?
  { tag: tags.link, color: 'var(--ws-textLink-foreground)' },
  { tag: tags.url, color: 'var(--ws-textLink-foreground)' },
  // 瀵洜鏁?
  { tag: tags.quote, color: 'var(--ws-descriptionForeground)', fontStyle: 'italic' },
  // 娴狅絿鐖?- 娴ｈ法鏁ら弲顕€鈧碍鏋冮張顒勵杹閼硅绱濋柆鍨帳缂傗晞绻樼搾鍛扮箖4缁岀儤鐗搁弮鍫曨杹閼规彃褰夐崠?
  { tag: tags.monospace, color: 'inherit' },
  // 濞夈劑鍣?
  { tag: tags.comment, color: 'var(--ws-descriptionForeground)' },
  // 閸忓啩淇婇幁顖ょ礄婵?> 瀵洜鏁ら弽鍥唶閿?
  { tag: tags.meta, color: 'var(--ws-textLink-foreground)' },
]);

/**
 * 閼奉亜鐣炬稊澶婃礀鏉烇箓鏁径鍕倞 - 閺呴缚鍏樺鏇犳暏閸ф宕茬悰?
 * 1. 閸︺劌绱╅悽銊攽閺堫偄鐔幐澶婃礀鏉烇附妞傞敍宀冨殰閸斻劍鍧婇崝?> 閸掔増鏌婄悰宀嬬礄娣囨繃瀵旂紓鈺勭箻閿?
 * 2. 婵″倹鐏夎ぐ鎾冲鐞涘苯褰ч張?> 閿涘牊鐥呴張澶婂従娴犳牕鍞寸€圭櫢绱氶敍灞惧瘻閸ョ偠婧呴弮璺哄灩闂?> 楠炲爼鈧偓閸戝搫绱╅悽銊δ佸?
 */
function handleBlockquoteEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 濡偓閺屻儲妲搁崥锔芥Ц瀵洜鏁ょ悰?- 閺€顖涘瘮鐞涘矂顩婚張澶屸敄閺嶈偐娈戦幆鍛枌閿涘湵AB 缂傗晞绻橀敍?
  const blockquoteMatch = lineText.match(/^(\s*)(>+)(\s*)/);
  if (!blockquoteMatch) {
    return false; // 娑撳秵妲稿鏇犳暏鐞涘矉绱濇担璺ㄦ暏姒涙顓荤悰灞艰礋
  }
  
  const indent = blockquoteMatch[1]; // 缂傗晞绻樼粚鐑樼壐
  const markers = blockquoteMatch[2]; // > 缁楋箑褰?
  const spaces = blockquoteMatch[3]; // > 閸氬酣娼伴惃鍕敄閺?
  const prefixLength = indent.length + markers.length + spaces.length;
  const content = lineText.slice(prefixLength);
  
  // 婵″倹鐏夊鏇犳暏鐞涘苯褰ч張?> 濞屸剝婀侀崘鍛啇閿涘牊鍨ㄩ崣顏呮箒缁岀儤鐗搁敍澶涚礉閸掔娀娅?> 閺嶅洩顔囬獮鍫曗偓鈧崙鍝勭穿閻劍膩瀵?
  if (content.trim() === '') {
    // 閸掔娀娅庤ぐ鎾冲鐞涘瞼娈?> 閺嶅洩顔囬敍灞借嫙閸︺劌澧犻棃銏″絻閸忋儳鈹栫悰灞炬降閺傤厼绱戝鏇犳暏閸?
    if (line.from > 0) {
      // 娑撳秵妲哥粭顑跨鐞涘矉绱伴崚鐘绘珟瑜版挸澧犵悰宀嬬礄閸栧懏瀚崜宥夋桨閻ㄥ嫭宕茬悰宀€顑侀敍澶涚礉閻掕泛鎮楅幓鎺戝弳娑撱倓閲滈幑銏ｎ攽缁?
      view.dispatch({
        changes: { from: line.from - 1, to: line.to, insert: '\n\n' },
        selection: { anchor: line.from + 1 },
      });
    } else {
      // 缁楊兛绔寸悰宀嬬窗閻╁瓨甯撮崚鐘绘珟 > 閺嶅洩顔?
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      });
    }
    return true;
  }
  
  // 閸︺劌绱╅悽銊攽閺堫偄鐔幐澶婃礀鏉烇讣绱濋懛顏勫З濞ｈ濮炵紓鈺勭箻 + > 閸掔増鏌婄悰?
  const level = markers.length;
  const newPrefix = indent + '>'.repeat(level) + ' ';
  
  view.dispatch({
    changes: { from: head, insert: '\n' + newPrefix },
    selection: { anchor: head + 1 + newPrefix.length },
  });
  
  return true;
}

/**
 * 閼奉亜鐣炬稊澶婃礀鏉烇箓鏁径鍕倞 - 閺呴缚鍏樺鍛濞撳懎宕熼幑銏ｎ攽
 * 1. 閸︺劌绶熼崝鐐寸閸楁洝顢戦張顐㈢啲閹稿娲栨潪锔芥閿涘矁鍤滈崝銊﹀潑閸旂姴绶熼崝鐐寸閸楁洘鐖ｇ拋鏉垮煂閺傛媽顢?
 * 2. 婵″倹鐏夎ぐ鎾冲鐞涘苯褰ч張澶婄窡閸旂偞绔婚崡鏇熺垼鐠佺増鐥呴張澶婂敶鐎圭櫢绱濋幐澶婃礀鏉烇附妞傞崚鐘绘珟閺嶅洩顔囬獮鍫曗偓鈧崙鍝勭窡閸旂偞绔婚崡鏇熌佸?
 * 閺€顖涘瘮 - [ ] 閺嶇厧绱?
 */
function handleTodoListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 濡偓閺屻儲妲搁崥锔芥Ц瀵板懎濮欏〒鍛礋鐞涘矉绱欓弨顖涘瘮 - [ ] 閹?- [x] 閹?閳?[ ] 閹?閳?[x] 閺嶇厧绱￠敍?
  const todoMatch = lineText.match(/^(\s*)([-*+•])\s\[[ xX]\]\s?/);
  if (!todoMatch) {
    return false; // 娑撳秵妲稿鍛濞撳懎宕熺悰宀嬬礉娴ｈ法鏁ゆ妯款吇鐞涘奔璐?
  }

  const indent = todoMatch[1];
  // 婵绮撴担璺ㄦ暏 - 娴ｆ粈璐熷鍛濞撳懎宕熼弽鍥唶
  const prefix = indent + '- [ ] ';
  const matchedPrefix = todoMatch[0];
  const content = lineText.slice(matchedPrefix.length).trim();

  // 婵″倹鐏夊鍛濞撳懎宕熺悰灞藉涧閺堝鐖ｇ拋鐗堢梾閺堝鍞寸€圭櫢绱濋崚鐘绘珟閺嶅洩顔囬獮鍫曗偓鈧崙鍝勭窡閸旂偞绔婚崡鏇熌佸?
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 閸︺劌绶熼崝鐐寸閸楁洝顢戦張顐㈢啲閹稿娲栨潪锔肩礉閼奉亜濮╁ǎ璇插瀵板懎濮欏〒鍛礋閺嶅洩顔囬崚鐗堟煀鐞?
  view.dispatch({
    changes: { from: head, insert: '\n' + prefix },
    selection: { anchor: head + 1 + prefix.length },
  });

  return true;
}

/**
 * 閼奉亜鐣炬稊澶婃礀鏉烇箓鏁径鍕倞 - 閺呴缚鍏橀弮鐘茬碍閸掓銆冮幑銏ｎ攽
 * 1. 閸︺劌鍨悰銊攽閺堫偄鐔幐澶婃礀鏉烇附妞傞敍宀冨殰閸斻劍鍧婇崝鐘插灙鐞涖劍鐖ｇ拋鏉垮煂閺傛媽顢?
 * 2. 婵″倹鐏夎ぐ鎾冲鐞涘苯褰ч張澶婂灙鐞涖劍鐖ｇ拋鐗堢梾閺堝鍞寸€圭櫢绱濋幐澶婃礀鏉烇附妞傞崚鐘绘珟閺嶅洩顔囬獮鍫曗偓鈧崙鍝勫灙鐞涖劍膩瀵?
 * 閺€顖涘瘮 -閵?閵?閵嗕讲鈧?娴ｆ粈璐熼崚妤勩€冮弽鍥唶
 */
function handleListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 濡偓閺屻儲妲搁崥锔芥Ц閺冪姴绨崚妤勩€冪悰宀嬬礄閺€顖涘瘮 -閵?閵?閵嗕讲鈧?娴ｆ粈璐熼弽鍥唶閿?
  const listMatch = lineText.match(/^(\s*)([-*+•])\s/);
  if (!listMatch) {
    return false; // 娑撳秵妲搁崚妤勩€冪悰宀嬬礉娴ｈ法鏁ゆ妯款吇鐞涘奔璐?
  }

  const indent = listMatch[1];
  const marker = listMatch[2];
  const prefix = indent + marker + ' ';
  const content = lineText.slice(prefix.length).trim();

  // 婵″倹鐏夐崚妤勩€冪悰灞藉涧閺堝鐖ｇ拋鐗堢梾閺堝鍞寸€圭櫢绱濋崚鐘绘珟閺嶅洩顔囬獮鍫曗偓鈧崙鍝勫灙鐞涖劍膩瀵?
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 閸︺劌鍨悰銊攽閺堫偄鐔幐澶婃礀鏉烇讣绱濋懛顏勫З濞ｈ濮為崚妤勩€冮弽鍥唶閸掔増鏌婄悰?
  view.dispatch({
    changes: { from: head, insert: '\n' + prefix },
    selection: { anchor: head + 1 + prefix.length },
  });

  return true;
}

/**
 * 閼惧嘲褰囨稉瀣╃娑擃亜鐡уВ宥呯碍閸?
 * A -> B, Z -> AA, AA -> AB, AZ -> BA
 */
function getNextLetter(letter: string): string {
  const isUpper = letter === letter.toUpperCase();
  const base = isUpper ? 'A'.charCodeAt(0) : 'a'.charCodeAt(0);
  const chars = letter.toUpperCase().split('');

  // 娴犲孩娓堕崥搴濈娑擃亜鐡х粭锕€绱戞慨瀣箻娴?
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
 * 閼奉亜鐣炬稊澶婃礀鏉烇箓鏁径鍕倞 - 閺呴缚鍏樼€涙鐦濇惔蹇撳娇閹广垼顢?
 * 1. 閸︺劌鐡уВ宥呯碍閸欑柉顢戦張顐㈢啲閹稿娲栨潪锔芥閿涘矁鍤滈崝銊﹀潑閸旂姳绗呮稉鈧稉顏勭摟濮ｅ秴绨崣宄板煂閺傛媽顢?
 * 2. 婵″倹鐏夎ぐ鎾冲鐞涘苯褰ч張澶婄摟濮ｅ秴绨崣閿嬬梾閺堝鍞寸€圭櫢绱濋幐澶婃礀鏉烇附妞傞崚鐘绘珟鎼村繐褰块獮鍫曗偓鈧崙鍝勭碍閸欓攱膩瀵?
 */
function handleLetterListEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;

  const line = state.doc.lineAt(head);
  const lineText = line.text;

  // 濡偓閺屻儲妲搁崥锔芥Ц鐎涙鐦濇惔蹇撳娇鐞涘矉绱欐俊?A. B. a. b.閿?
  const letterMatch = lineText.match(/^(\s*)([A-Za-z])\.(\s)/);
  if (!letterMatch) {
    return false; // 娑撳秵妲哥€涙鐦濇惔蹇撳娇鐞涘矉绱濇担璺ㄦ暏姒涙顓荤悰灞艰礋
  }

  const indent = letterMatch[1];
  const letter = letterMatch[2];
  const space = letterMatch[3];
  const prefix = indent + letter + '.' + space;
  const content = lineText.slice(prefix.length).trim();

  // 婵″倹鐏夋惔蹇撳娇鐞涘苯褰ч張澶嬬垼鐠佺増鐥呴張澶婂敶鐎圭櫢绱濋崚鐘绘珟閺嶅洩顔囬獮鍫曗偓鈧崙鍝勭碍閸欓攱膩瀵?
  if (content === '') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: indent },
      selection: { anchor: line.from + indent.length },
    });
    return true;
  }

  // 閸︺劌绨崣鐤攽閺堫偄鐔幐澶婃礀鏉烇讣绱濋懛顏勫З濞ｈ濮炴稉瀣╃娑擃亜鐡уВ宥呯碍閸欏嘲鍩岄弬鎷岊攽
  const nextLetter = getNextLetter(letter);
  const newPrefix = indent + nextLetter + '. ';

  view.dispatch({
    changes: { from: head, insert: '\n' + newPrefix },
    selection: { anchor: head + 1 + newPrefix.length },
  });

  return true;
}

/**
 * 閼奉亜鐣炬稊澶婃礀鏉烇箓鏁径鍕倞 - 娣囨繃瀵旂紓鈺勭箻
 * 閸︺劍婀佺紓鈺勭箻閻ㄥ嫯顢戦幐澶婃礀鏉烇附妞傞敍灞炬煀鐞涘奔绻氶幐浣烘祲閸氬瞼娈戠紓鈺勭箻
 */
function handleIndentedEnter(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const { head } = selection.main;
  
  const line = state.doc.lineAt(head);
  const lineText = line.text;
  
  // 閼惧嘲褰囪ぐ鎾冲鐞涘瞼娈戠紓鈺勭箻
  const indentMatch = lineText.match(/^(\s+)/);
  if (!indentMatch) {
    return false; // 濞屸剝婀佺紓鈺勭箻閿涘奔濞囬悽銊╃帛鐠併倛顢戞稉?
  }
  
  const indent = indentMatch[1];
  
  // 閸︺劌缍嬮崜宥勭秴缂冾喗褰冮崗銉﹀床鐞涘苯鎷扮紓鈺勭箻
  view.dispatch({
    changes: { from: head, insert: '\n' + indent },
    selection: { anchor: head + 1 + indent.length },
  });
  
  return true;
}

/**
 * 閼奉亜鐣炬稊?TAB 闁款喖顦╅悶?- 濡偓濞?TAB 缂傗晞绻橀崥搴㈡Ц閸氾缚绱扮€佃壈鍤ч崘鍛啇鐡掑懎鍤紓鏍帆閸ｃ劌顔旀惔?
 * 婵″倹鐏?TAB 缂傗晞绻橀崥搴ゎ攽鐎硅棄瀹崇搾鍛毉缂傛牞绶崳銊ヮ啍鎼达讣绱濋崚娆戭洣濮?TAB
 */
function handleTabBoundary(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  
  // 閼惧嘲褰囩紓鏍帆閸ｃ劌褰查悽銊ヮ啍鎼?
  const contentElement = view.dom.querySelector('.cm-content');
  const editorWidth = contentElement?.clientWidth || 800;
  const charWidth = 8; // 娴兼壆鐣诲В蹇庨嚋鐎涙顑佺€硅棄瀹抽敍鍫㈢搼鐎硅棄鐡ф担鎿勭礆
  const tabWidth = 2 * charWidth; // TAB = 2 缁岀儤鐗?
  const maxChars = Math.floor((editorWidth - 40) / charWidth); // 閻ｆ瑥鍤稉鈧禍娑滅珶鐠?
  
  // 濡偓閺屻儵鈧灏☉澶婂挤閻ㄥ嫭澧嶉張澶庮攽
  const startLine = state.doc.lineAt(selection.main.from);
  const endLine = state.doc.lineAt(selection.main.to);
  
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    // 鐠侊紕鐣?TAB 閸氬海娈戠悰宀勬毐鎼达讣绱橳AB = 2 缁岀儤鐗搁敍?
    const newLength = line.text.length + 2;
    if (newLength > maxChars) {
      // 娴兼艾顕遍懛瀛樺床鐞涘矉绱濈粋浣诡剾 TAB
      return true;
    }
  }
  
  // 閸忎浇顔?TAB閿涘奔濞囬悽銊╃帛鐠併倛顢戞稉?
  return false;
}

/**
 * 閼奉亜鐣炬稊?Ctrl+X 婢跺嫮鎮?- 閸擃亜鍨忛弫纾嬵攽閸氬簼绻氶幐浣稿帨閺嶅洤婀紓鈺勭箻娴ｅ秶鐤?
 * 瑜版挸澹€閸掑洦鏆ｇ悰宀嬬礄閺冪娀鈧灏敍澶嬫閿?
 * - 婵″倹鐏夋稉瀣桨鏉╂ɑ婀佺悰宀嬬礉閸忓鐖ｉ悾娆忔躬娑撳绔寸悰宀€娈戠紓鈺勭箻娴ｅ秶鐤?
 * - 婵″倹鐏夐弰顖涙付閸氬簼绔寸悰宀嬬礉閸忓鐖ｇ粔璇插煂娑撳﹣绔寸悰宀€娈戠紓鈺勭箻娴ｅ秶鐤?
 */
function handleCutLine(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;

  // 閸欘亜顦╅悶鍡樻￥闁灏惃鍕剰閸愮绱欓崜顏勫瀼閺佺顢戦敍?
  if (!selection.main.empty) {
    return false; // 閺堝鈧灏敍灞煎▏閻劑绮拋銈堫攽娑?
  }

  const line = state.doc.lineAt(selection.main.head);
  const lineText = line.text;

  // 婢跺秴鍩楄ぐ鎾冲鐞涘苯鍞寸€圭懓鍩岄崜顏囧垱閺夊尅绱欓崠鍛儓閹广垼顢戠粭锔肩礆
  const textToCopy = lineText + '\n';
  navigator.clipboard.writeText(textToCopy);

  // 鐠侊紕鐣婚崚鐘绘珟閼煎啫娲块崪灞藉帨閺嶅洣缍呯純?
  let deleteFrom = line.from;
  let deleteTo = line.to;
  let newCursorPos = line.from;

  if (line.number < state.doc.lines) {
    // 娑撳秵妲搁張鈧崥搴濈鐞涘矉绱伴崚鐘绘珟瑜版挸澧犵悰宀嬬礄閸栧懎鎯堥幑銏ｎ攽缁楋讣绱氶敍灞藉帨閺嶅洨鏆€閸︺劋绗呮稉鈧悰宀€娈戠紓鈺勭箻娴ｅ秶鐤?
    deleteTo = line.to + 1;
    const nextLine = state.doc.line(line.number + 1);
    const nextIndent = getIndentLevel(nextLine.text);
    // 閸掔娀娅庨崥搴礉娑撳绔寸悰灞肩窗閸欐ɑ鍨氳ぐ鎾冲娴ｅ秶鐤嗛敍灞藉帨閺嶅洦鏂侀崷銊х級鏉╂稐缍呯純?
    newCursorPos = line.from + Math.min(nextIndent, nextLine.text.length);
  } else if (line.number > 1) {
    // 閺勵垱娓堕崥搴濈鐞涘奔绗栨稉宥嗘Ц缁楊兛绔寸悰宀嬬窗閸掔娀娅庨崜宥夋桨閻ㄥ嫭宕茬悰宀€顑侀敍灞藉帨閺嶅洨些閸掗绗傛稉鈧悰灞炬汞鐏?
    deleteFrom = line.from - 1;
    const prevLine = state.doc.line(line.number - 1);
    newCursorPos = prevLine.to;
  }

  // 閹笛嗩攽閸掔娀娅?
  view.dispatch({
    changes: { from: deleteFrom, to: deleteTo },
    selection: { anchor: newCursorPos },
  });

  return true;
}

/**
 * 閼奉亜鐣炬稊?Ctrl+- 婢跺嫮鎮?- 閸戝繐鐨崗澶嬬垼鐞涘本鍨ㄩ柅澶夎厬鐞涘瞼娈戠紓鈺勭箻
 * 濮ｅ繑顐奸崙蹇撶毌 2 娑擃亞鈹栭弽纭风礄1 娑?TAB 閸楁洑缍呴敍?
 * 鏉堝湱鏅Λ鈧弻銉窗
 * - 閸楁洝顢戦弮璁圭窗婵″倹鐏夎ぐ鎾冲鐞涘瞼缂夋潻?< TAB_SIZE閿涘奔绗夐崗浣筋啅閸戝繐鐨?
 * - 婢舵俺顢戦弮璁圭窗婵″倹鐏夋禒璁崇秿闂堢偟鈹栫悰宀€缂夋潻?< TAB_SIZE閿涘奔绗夐崗浣筋啅閸戝繐鐨?
 */
function handleDecreaseIndent(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const TAB_SIZE = 2;

  // 閼惧嘲褰囬柅澶婂隘濞戝寮烽惃鍕閺堝顢戦敍鍫熸￥闁灏弮鑸垫Ц閸忓鐖ｉ幍鈧崷銊攽閿?
  const startLine = state.doc.lineAt(selection.main.from);
  const endLine = state.doc.lineAt(selection.main.to);
  const isSingleLine = startLine.number === endLine.number;

  if (isSingleLine) {
    // 閸楁洝顢戝Ο鈥崇础閿涙艾褰ф径鍕倞瑜版挸澧犵悰?
    const line = startLine;
    const lineText = line.text;
    const indent = getIndentLevel(lineText);

    // 婵″倹鐏夊▽鈩冩箒缂傗晞绻橀敍灞肩瑝閸嬫矮鎹㈡担鏇熸暭閸?
    if (indent < TAB_SIZE) {
      return true;
    }

    // 閸戝繐鐨紓鈺勭箻
    const reduceAmount = Math.min(indent, TAB_SIZE);
    view.dispatch({
      changes: { from: line.from, to: line.from + reduceAmount, insert: '' },
    });

    return true;
  }

  // 婢舵俺顢戝Ο鈥崇础閿涙碍顥呴弻銉﹀閺堝顢戦惃鍕付鐏忓繒缂夋潻?
  let minIndent = Infinity;
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;
    // 鐠哄疇绻冪粚楦款攽
    if (lineText.trim().length === 0) continue;
    const indent = getIndentLevel(lineText);
    minIndent = Math.min(minIndent, indent);
  }

  // 婵″倹鐏夐張鈧亸蹇曠級鏉╂稑鐨禍?TAB_SIZE閿涘奔绗夐崗浣筋啅閸戝繐鐨?
  if (minIndent < TAB_SIZE) {
    return true;
  }

  const changes: { from: number; to: number; insert: string }[] = [];

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const lineText = line.text;
    const indent = getIndentLevel(lineText);

    // 婵″倹鐏夊▽鈩冩箒缂傗晞绻橀幋鏍ㄦЦ缁岄缚顢戦敍宀冪儲鏉?
    if (indent === 0 || lineText.trim().length === 0) continue;

    // 閸戝繐鐨惃鍕敄閺嶅吋鏆?
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

function triggerEditorSave(): boolean {
  const saveHandler = (globalThis as { readonly __editorSaveFile?: (() => void) | undefined }).__editorSaveFile;

  if (saveHandler) {
    saveHandler();
    return true;
  }

  window.dispatchEvent(new Event('save-file'));
  return true;
}

/**
 * 閼奉亜鐣炬稊澶愭暛閻╂ɑ妲х亸?- 娴ｈ法鏁ら張鈧妯圭喘閸忓牏楠囩涵顔荤箽閸︺劍澧嶉張澶婂従娴犳牕顦╅悶鍡曠閸撳秵澧界悰?
 */
const customKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Mod-s',
      preventDefault: true,
      run: () => triggerEditorSave(),
    },
    {
      key: 'Backspace',
      run: (view) => {
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;
        
        // 婵″倹鐏夐張澶愨偓澶婂隘閿涘奔濞囬悽銊╃帛鐠併倛顢戞稉?
        if (!selection.main.empty) {
          return false;
        }

        // 濡偓閺屻儱鍘滈弽鍥у闂堛垺妲搁崥锔芥Ц鐟欏棝顣剁拠顓熺《
        const doc = state.doc.toString();
        const videoRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
        let match;
        while ((match = videoRegex.exec(doc)) !== null) {
          const videoEnd = match.index + match[0].length;
          // 婵″倹鐏夐崗澶嬬垼缁毖囧仸鐟欏棝顣剁拠顓熺《閸氬酣娼?
          if (head === videoEnd) {
            // 濡偓閺屻儲妲搁崥锔芥Ц鐟欏棝顣堕柧鐐复
            const url = match[2];
            const videoInfo = parseVideoUrl(url);
            if (videoInfo) {
              // 閸掔娀娅庨弫缈犻嚋鐟欏棝顣剁拠顓熺《
              view.dispatch({
                changes: { from: match.index, to: videoEnd },
                selection: { anchor: match.index },
              });
              return true;
            }
          }
        }
        
        // 閼惧嘲褰囪ぐ鎾冲鐞?
        const line = state.doc.lineAt(head);
        const text = line.text;
        const cursorOffset = head - line.from;
        
        // 濡偓閺屻儲妲搁崥锔芥Ц瀵板懎濮欏〒鍛礋鐞?
        const todoMatch = text.match(/^([\t ]*)([-*+閳ヮ晝)\s\[([ xX])\](\s|$)/);
        if (!todoMatch) {
          return false; // 娑撳秵妲稿鍛濞撳懎宕熼敍灞煎▏閻劑绮拋銈堫攽娑?
        }
        
        const bracketIndex = text.indexOf('[');
        if (bracketIndex === -1) {
          return false;
        }
        
        // 鐠侊紕鐣绘径宥夆偓澶嬵攱閸栧搫鐓欑紒鎾存将娴ｅ秶鐤嗛敍鍫濆瘶閹?] 閸氬酣娼伴惃鍕敄閺嶇》绱?
        const checkboxEndOffset = bracketIndex + 4; // [ ] 閸旂姷鈹栭弽鐓庡彙4娑擃亜鐡х粭?
        
        // 婵″倹鐏夐崗澶嬬垼閸︺劌顦查柅澶嬵攱閸栧搫鐓欓崥搴ㄦ桨閿涘牆鍞寸€圭懓灏崺鐕傜礆閿涘本顒滅敮绋垮灩闂勩倓绔存稉顏勭摟缁?
        if (cursorOffset > checkboxEndOffset) {
          // 娴ｈ法鏁ゆ妯款吇鐞涘奔璐熼崚鐘绘珟娑撯偓娑擃亜鐡х粭?
          return false;
        }
        
        // 婵″倹鐏夐崗澶嬬垼閸︺劌顦查柅澶嬵攱閸栧搫鐓欓崘鍛灗缁毖囧仸婢跺秹鈧顢嬮崥搴ㄦ桨閿涘本顒滅敮绋垮灩闂勩倓绔存稉顏勭摟缁?
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
        // 閸忓牆鐨剧拠鏇烆槱閻炲棗绱╅悽銊ユ健
        if (handleBlockquoteEnter(view)) {
          return true;
        }
        // 鐏忔繆鐦径鍕倞瀵板懎濮欏〒鍛礋閿涘牅绱崗鍫滅艾閺咁噣鈧碍妫ゆ惔蹇撳灙鐞涱煉绱?
        if (handleTodoListEnter(view)) {
          return true;
        }
        // 閸愬秴鐨剧拠鏇烆槱閻炲棙妫ゆ惔蹇撳灙鐞?
        if (handleListEnter(view)) {
          return true;
        }
        // 鐏忔繆鐦径鍕倞鐎涙鐦濇惔蹇撳娇閸掓銆?
        if (handleLetterListEnter(view)) {
          return true;
        }
        // 閺堚偓閸氬骸顦╅悶鍡樻珮闁氨缂夋潻娑滎攽閿涘奔绻氶幐浣虹級鏉?
        if (handleIndentedEnter(view)) {
          return true;
        }
        // 娴ｈ法鏁ゆ妯款吇鐞涘奔璐?
        return false;
      },
    },
    {
      key: 'Tab',
      run: (view) => {
        // 濡偓閺?TAB 閺勵垰鎯佹导姘嚤閼锋潙鍞寸€圭绉撮崙铏圭椽鏉堟垵娅掔€硅棄瀹?
        if (handleTabBoundary(view)) {
          return true; // 缁備焦顒?TAB
        }
        // 娴ｈ法鏁ゆ妯款吇鐞涘奔璐?
        return false;
      },
    },
    {
      key: 'Mod-x',
      run: (view) => {
        // 閼奉亜鐣炬稊澶婂閸掑洦鏆ｇ悰宀冾攽娑撶尨绱濇穱婵囧瘮閸忓鐖ｉ崷銊х級鏉╂稐缍呯純?
        return handleCutLine(view);
      },
    },
    {
      key: 'Mod--',
      run: (view) => {
        // 閸戝繐鐨柅澶夎厬鐞涘瞼娈戠紓鈺勭箻
        return handleDecreaseIndent(view);
      },
    },
    {
      key: ' ',
      run: (view) => {
        // 濡偓閺屻儲妲搁崥锕傛付鐟曚礁鐨?"- " 鏉烆剚宕叉稉?"閳?"
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;

        // 閼惧嘲褰囪ぐ鎾冲鐞?
        const line = state.doc.lineAt(head);
        const textBeforeCursor = line.text.slice(0, head - line.from);
        const textAfterCursor = line.text.slice(head - line.from);

        // 濡偓閺屻儲妲搁崥锔芥Ц瀵板懎濮欏〒鍛礋閺嶇厧绱?"- [ ]" 閹?"閳?[ ]" 閸氬酣娼版潏鎾冲弳缁岀儤鐗?
        // 閻㈠彉绨?] 閸氬酣娼伴張顒冮煩鐏忚鲸婀佺粚鐑樼壐閿涘本澧嶆禒銉ょ瑝闂団偓鐟曚焦褰冮崗銉р敄閺嶇》绱濋崣顏堟付鐟曚胶些閸斻劌鍘滈弽鍥у煂缁岀儤鐗搁崥搴ㄦ桨
        if (/^[\t ]*[-閳ヮ晝\s\[[ xX]\]$/.test(textBeforeCursor)) {
          // 濡偓閺屻儱鍘滈弽鍥ф倵闂堛垺妲搁崥锕€鍑＄紒蹇旀箒缁岀儤鐗?
          if (textAfterCursor.startsWith(' ')) {
            // 瀹歌尙绮￠張澶屸敄閺嶇》绱濋崣顏喰╅崝銊ュ帨閺?
            view.dispatch({
              selection: { anchor: head + 1 },
            });
          } else {
            // 濞屸剝婀佺粚鐑樼壐閿涘本褰冮崗銉р敄閺?
            view.dispatch({
              changes: { from: head, insert: ' ' },
              selection: { anchor: head + 1 },
            });
          }
          return true;
        }

        // 濡偓閺屻儲妲搁崥锕€灏柊?"缂傗晞绻?+ -" 閻ㄥ嫭膩瀵?
        if (/^\s*-$/.test(textBeforeCursor)) {
          // 濡偓閺屻儱鍘滈弽鍥ф倵闂堛垺妲搁崥锔芥Ц瀵板懎濮欏〒鍛礋閺嶇厧绱?[ ] 閹?[x]
          // 婵″倹鐏夐弰顖ょ礉娑撳秵娴涢幑?- 娑?閳ヮ澁绱濈拋鈺佺窡閸旂偞绔婚崡鏇⌒掗弸鎰珤婢跺嫮鎮?
          if (/^\s*\[[ xX]\]/.test(textAfterCursor)) {
            return false; // 娴ｈ法鏁ゆ妯款吇鐞涘奔璐熼敍灞肩瑝閺囨寧宕?
          }
          
          const dashPos = head - 1;
          // 閺囨寧宕?"-" 娑?"閳? 楠炶埖褰冮崗銉р敄閺?
          view.dispatch({
            changes: { from: dashPos, to: head, insert: '閳?' },
            selection: { anchor: dashPos + 2 },
          });
          return true;
        }

        // 娴ｈ法鏁ゆ妯款吇鐞涘奔璐?
        return false;
      },
    },
    {
      key: ']',
      run: (view) => {
        // 濡偓閺屻儲妲搁崥锕傛付鐟曚礁鐨?"閳?[ " 鏉烆剚宕叉稉?"- [ ]"閿涘牆绶熼崝鐐寸閸楁洘鐗稿蹇ョ礆
        const { state } = view;
        const { selection } = state;
        const { head } = selection.main;

        // 閼惧嘲褰囪ぐ鎾冲鐞?
        const line = state.doc.lineAt(head);
        const textBeforeCursor = line.text.slice(0, head - line.from);

        // 濡偓閺屻儲妲搁崥锕€灏柊?"- [ " 閹?"- [x" 閹?"閳?[ " 閹?"閳?[x" 閻ㄥ嫭膩瀵?
        const todoMatch = textBeforeCursor.match(/^(\s*)([-*+•])\s\[[ xX]$/);
        if (todoMatch) {
          const indent = todoMatch[1];
          const marker = todoMatch[2];
          
          // 婵″倹鐏夐弰?閳ヮ澁绱濋弴鎸庡床娑?-
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
          
          // 婵″倹鐏夊鑼病閺?-閿涘苯褰ч幓鎺戝弳 ]
          view.dispatch({
            changes: { from: head, insert: ']' },
            selection: { anchor: head + 1 },
          });
          return true;
        }

        // 娴ｈ法鏁ゆ妯款吇鐞涘奔璐?
        return false;
      },
    },
    {
      // Ctrl+I 閹?Cmd+I 閹垫挸绱戦崘鍛颁粓 AI 閼卞﹤銇?
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
 * 濡偓濞?URL 閺勵垰鎯佹稉鍝勬禈閻楀洭鎽奸幒?
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const lowerUrl = url.toLowerCase().split(/[?#]/)[0];
  return imageExtensions.some(ext => lowerUrl.endsWith(ext));
}

/**
 * 閸︺劍瀵氱€规矮缍呯純顔藉絻閸忋儲鏋冮張?
 */
function insertTextAtPosition(view: EditorView, pos: number, text: string): void {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
}

/**
 * Persist image attachments to disk instead of writing data URLs.
 */
async function handleImageFile(
  file: File,
  view: EditorView,
  pos: number,
  noteFilePath: string | undefined,
): Promise<void> {
  await insertPersistedImageFile(file, view, pos, noteFilePath);
}

const IMAGE_MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

const isWindowsAbsolutePath = (value: string): boolean => /^[A-Za-z]:[\\/]/.test(value);

const isUnixAbsolutePath = (value: string): boolean =>
  value.startsWith('/') && !value.startsWith('//');

const isUncPath = (value: string): boolean => value.startsWith('\\\\');

const isRealFileSystemPath = (value: string | undefined): value is string => {
  if (!value) {
    return false;
  }

  return isWindowsAbsolutePath(value) || isUnixAbsolutePath(value) || isUncPath(value);
};

const normalizePathSeparators = (value: string): string => value.replace(/\\/g, '/');

const getDirectoryPath = (value: string): string | null => {
  const normalized = normalizePathSeparators(value);
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return null;
  }

  if (lastSlashIndex === 0) {
    return '/';
  }

  return normalized.slice(0, lastSlashIndex);
};

const getPathBaseName = (value: string): string => {
  const normalized = normalizePathSeparators(value);
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || value;
};

const getPathStem = (value: string): string => {
  const fileName = getPathBaseName(value);
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
};

const joinFilePath = (directoryPath: string, fileName: string): string => {
  const normalizedDirectoryPath = normalizePathSeparators(directoryPath).replace(/\/+$/, '');
  return `${normalizedDirectoryPath}/${fileName}`;
};

const sanitizeAttachmentName = (value: string): string => {
  const normalized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  return normalized || 'image';
};

const getImageExtension = (file: File): string => {
  const originalName = file.name.trim();
  const lastDotIndex = originalName.lastIndexOf('.');
  if (lastDotIndex > 0 && lastDotIndex < originalName.length - 1) {
    return originalName.slice(lastDotIndex).toLowerCase();
  }

  return IMAGE_MIME_EXTENSION_MAP[file.type.toLowerCase()] || '.png';
};

const buildTimestampToken = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '');

const toLocalFileUrl = (filePath: string): string => {
  if (filePath.startsWith('local-file://')) {
    return filePath;
  }

  if (filePath.startsWith('file:///')) {
    return filePath.replace('file:///', 'local-file:///');
  }

  if (filePath.startsWith('file://')) {
    return filePath.replace('file://', 'local-file://');
  }

  const normalizedPath = normalizePathSeparators(filePath);
  if (isWindowsAbsolutePath(normalizedPath)) {
    const pathParts = normalizedPath.split('/');
    const encodedParts = pathParts.map((part, index) => {
      if (index === 0 && /^[A-Za-z]:$/.test(part)) {
        return part;
      }

      return encodeURIComponent(part);
    });

    return `local-file:///${encodedParts.join('/')}`;
  }

  if (isUnixAbsolutePath(normalizedPath)) {
    const pathParts = normalizedPath.split('/');
    const encodedParts = pathParts.map((part) => encodeURIComponent(part));
    return `local-file:///${encodedParts.join('/')}`;
  }

  return filePath;
};

const getRenderableImageSource = (rawSource: string): string => {
  if (rawSource.startsWith('data:') || rawSource.startsWith('blob:')) {
    return rawSource;
  }

  if (/^https?:\/\//i.test(rawSource)) {
    return rawSource;
  }

  if (rawSource.startsWith('local-file://') || rawSource.startsWith('file://')) {
    return toLocalFileUrl(rawSource);
  }

  if (isRealFileSystemPath(rawSource)) {
    return toLocalFileUrl(rawSource);
  }

  return rawSource;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const loadImageSizeFromObjectUrl = (objectUrl: string): Promise<{ width: number; height: number }> => (
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error('无法读取图片尺寸。'));
    image.src = objectUrl;
  })
);

const loadImageSizeFromFile = async (file: File): Promise<{ width: number; height: number }> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const size = {
        width: bitmap.width,
        height: bitmap.height,
      };
      bitmap.close();

      if (size.width > 0 && size.height > 0) {
        return size;
      }
    } catch {
      // Fall back to DOM image loading for formats createImageBitmap cannot decode.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageSizeFromObjectUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> => (
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('无法生成裁剪后的图片数据。'));
    }, mimeType);
  })
);

const createAttachmentFilePath = async (
  noteFilePath: string,
  preferredName: string,
  extension: string,
): Promise<string> => {
  const noteDirectoryPath = getDirectoryPath(noteFilePath);
  if (!noteDirectoryPath) {
    throw new Error('当前文件路径无效，无法保存图片。');
  }

  const attachmentDirectoryPath = joinFilePath(noteDirectoryPath, 'assets');
  const noteStem = sanitizeAttachmentName(getPathStem(noteFilePath));
  const safePreferredName = sanitizeAttachmentName(preferredName);
  const baseName = safePreferredName || noteStem || 'image';
  const timestampToken = buildTimestampToken();

  let attempt = 0;
  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const fileName = `${noteStem}-${baseName}-${timestampToken}${suffix}${extension}`;
    const targetFilePath = joinFilePath(attachmentDirectoryPath, fileName);
    const exists = await window.electronAPI?.fs?.exists?.(targetFilePath);
    if (!exists) {
      return targetFilePath;
    }

    attempt += 1;
  }

  throw new Error('生成图片文件名失败，请重试。');
};

const persistImageBlobToNoteAssets = async (
  noteFilePath: string,
  blob: Blob,
  preferredName: string,
  extension: string,
): Promise<string> => {
  const targetFilePath = await createAttachmentFilePath(noteFilePath, preferredName, extension);
  const arrayBuffer = await blob.arrayBuffer();
  const base64Content = arrayBufferToBase64(arrayBuffer);
  const writeResult = await window.electronAPI?.fs?.writeFile?.(targetFilePath, base64Content, 'base64');
  if (!writeResult?.success) {
    throw new Error('图片写入失败。');
  }

  return targetFilePath;
};

async function insertPersistedImageFile(
  file: File,
  view: EditorView,
  pos: number,
  noteFilePath: string | undefined,
): Promise<void> {
  if (!isRealFileSystemPath(noteFilePath)) {
    throw new Error('请先将当前笔记保存到磁盘后再插入图片。');
  }

  const { width: naturalWidth, height: naturalHeight } = await loadImageSizeFromFile(file);
  const imageExtension = getImageExtension(file);
  const originalName = file.name.trim();
  const attachmentBaseName = sanitizeAttachmentName(
    originalName ? getPathStem(originalName) : 'image'
  );
  const savedImagePath = await persistImageBlobToNoteAssets(
    noteFilePath,
    file,
    attachmentBaseName,
    imageExtension,
  );
  const width = Math.max(1, Math.round(naturalWidth * 0.25));
  const height = Math.max(1, Math.round(naturalHeight * 0.25));
  const altText = originalName || `${attachmentBaseName}${imageExtension}`;
  const markdownImage = `\n![${altText}|${width}x${height}](${savedImagePath})\n`;
  insertTextAtPosition(view, pos, markdownImage);
}

/**
 * 婢跺嫮鎮婇崶鍓у URL閿涘本褰冮崗?Markdown 閸ュ墽澧栫拠顓熺《
 */
function handleImageUrl(url: string, view: EditorView, pos: number): void {
  const fileName = url.split('/').pop() || 'image';
  const markdownImage = `\n![${fileName}](${url})\n`;
  insertTextAtPosition(view, pos, markdownImage);
}

/**
 * 鐟欙絾鐎介崶鍓у alt 閺傚洦婀版稉顓犳畱鐏忓搫顕穱鈩冧紖
 * 閺嶇厧绱? alt|widthxheight|r90|center|style:card
 */
function parseImageSize(alt: string): { width?: number; height?: number } {
  const parts = alt.split('|');
  for (const part of parts) {
    const sizeMatch = part.match(/^(\d+)(?:x(\d+))?$/);
    if (!sizeMatch) {
      continue;
    }

    return {
      width: parseInt(sizeMatch[1], 10),
      height: sizeMatch[2] ? parseInt(sizeMatch[2], 10) : undefined,
    };
  }

  return {};
}

/**
 * 閸ュ墽澧?Widget 缁?- 閻劋绨崷銊х椽鏉堟垵娅掓稉顓熻閺屾挸褰茬拫鍐╂殻婢堆冪毈閻ㄥ嫬娴橀悧?
 */
class ResizableImageWidget extends WidgetType {
  private rotation: number = 0;
  private align: 'left' | 'center' | 'right' = 'left';
  private displayStyle: 'default' | 'link' | 'card' = 'default';
  private documentClickHandler: ((e: MouseEvent) => void) | null = null;
  private cleanupCallbacks: Array<() => void> = [];
  private currentWidth: number | undefined;
  private currentHeight: number | undefined;

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
    this.currentWidth = width;
    this.currentHeight = height;
    // 鐟欙絾鐎?alt 娑擃厾娈戦弮瀣祮閵嗕礁顕鎰嫲閺勫墽銇氶弽宄扮础娣団剝浼?
    this.parseAltAttributes();
  }

  private parseAltAttributes(): void {
    // 閺嶇厧绱? alt|widthxheight|r90|center|style:link
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
    // 缁夊娅庣亸鍝勵嚟閵嗕焦妫嗘潪顑锯偓浣割嚠姒绘劑鈧焦鐗卞蹇庝繆閹垽绱濋崣顏冪箽閻ｆ瑥甯慨?alt
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
      const url = new URL(getRenderableImageSource(this.src));
      const pathname = decodeURIComponent(url.pathname);
      return pathname.split('/').pop() || this.src;
    } catch {
      const normalizedPath = normalizePathSeparators(this.src);
      return normalizedPath.split('/').pop() || this.src;
    }
  }

  private buildAltText(caption?: string): string {
    let newAlt = caption || this.getCleanAlt() || 'image';

    if (this.currentWidth) {
      if (this.currentHeight) {
        newAlt += `|${this.currentWidth}x${this.currentHeight}`;
      } else {
        newAlt += `|${this.currentWidth}`;
      }
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

    return newAlt;
  }

  private getBaseImageSize(img: HTMLImageElement): { width: number; height: number } | null {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (this.currentWidth && this.currentHeight) {
      return {
        width: this.currentWidth,
        height: this.currentHeight,
      };
    }

    if (!naturalWidth || !naturalHeight) {
      if (this.currentWidth && this.currentHeight) {
        return {
          width: this.currentWidth,
          height: this.currentHeight,
        };
      }
      return null;
    }

    if (this.currentWidth) {
      return {
        width: this.currentWidth,
        height: Math.max(1, Math.round((this.currentWidth * naturalHeight) / naturalWidth)),
      };
    }

    if (this.currentHeight) {
      return {
        width: Math.max(1, Math.round((this.currentHeight * naturalWidth) / naturalHeight)),
        height: this.currentHeight,
      };
    }

    return {
      width: naturalWidth,
      height: naturalHeight,
    };
  }

  private getRenderedImageMetrics(
    wrapper: HTMLElement,
    img: HTMLImageElement
  ): { imageWidth: number; imageHeight: number; frameWidth: number; frameHeight: number } | null {
    const baseSize = this.getBaseImageSize(img);
    if (!baseSize) {
      return null;
    }

    const normalizedRotation = ((this.rotation % 360) + 360) % 360;
    const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
    const baseFrameWidth = isQuarterTurn ? baseSize.height : baseSize.width;
    const availableWidth = wrapper.clientWidth > 0 ? wrapper.clientWidth : baseFrameWidth;
    const scale = Math.min(1, availableWidth / Math.max(1, baseFrameWidth));
    const imageWidth = Math.max(1, Math.round(baseSize.width * scale));
    const imageHeight = Math.max(1, Math.round(baseSize.height * scale));

    return {
      imageWidth,
      imageHeight,
      frameWidth: isQuarterTurn ? imageHeight : imageWidth,
      frameHeight: isQuarterTurn ? imageWidth : imageHeight,
    };
  }

  private syncImageLayout(
    wrapper: HTMLElement,
    layoutBox: HTMLElement,
    selectionFrame: HTMLElement,
    img: HTMLImageElement
  ): void {
    if (this.displayStyle !== 'default') {
      layoutBox.style.display = 'none';
      layoutBox.style.width = '';
      layoutBox.style.height = '';
      selectionFrame.style.display = 'none';
      selectionFrame.style.width = '';
      selectionFrame.style.height = '';
      return;
    }

    const metrics = this.getRenderedImageMetrics(wrapper, img);
    if (!metrics) {
      return;
    }

    img.style.width = `${metrics.imageWidth}px`;
    img.style.height = `${metrics.imageHeight}px`;
    layoutBox.style.display = 'flex';
    layoutBox.style.width = `${metrics.frameWidth}px`;
    layoutBox.style.height = `${metrics.frameHeight}px`;
    selectionFrame.style.display = '';
    selectionFrame.style.width = `${metrics.frameWidth}px`;
    selectionFrame.style.height = `${metrics.frameHeight}px`;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-image-widget';
    
    // 鐠佸墽鐤嗙€靛綊缍堥弬鐟扮础
    wrapper.setAttribute('data-align', this.align);

    const container = document.createElement('div');
    container.className = 'cm-image-container';

    const layoutBox = document.createElement('div');
    layoutBox.className = 'cm-image-layout-box';

    const img = document.createElement('img');
    img.src = getRenderableImageSource(this.src);
    img.alt = this.getCleanAlt();
    img.className = 'cm-inline-image';
    if (this.currentWidth) img.style.width = `${this.currentWidth}px`;
    // 娑撳秷顔曠純顔兼祼鐎规岸鐝惔锔肩礉鐠佲晛娴橀悧鍥︾箽閹镐礁甯慨瀣啍妤傛ɑ鐦?
    if (this.rotation) img.style.transform = `rotate(${this.rotation}deg)`;

    // 閸掓稑缂撳銉ュ徔閺嶅骏绱欓崷銊ユ禈閻楀洣绗傞弬鐧哥礆
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-image-toolbar';

    const selectionFrame = document.createElement('div');
    selectionFrame.className = 'cm-image-selection-frame';

    // 閺冨娴嗛幐澶愭尦
    const rotateBtn = document.createElement('div');
    rotateBtn.className = 'cm-image-toolbar-btn';
    rotateBtn.title = '旋转';
    rotateBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>`;
    rotateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.rotateImage(wrapper, layoutBox, selectionFrame, img);
    });

    // 鐏忓搫顕稉瀣閼挎粌宕?
    const sizeDropdown = document.createElement('div');
    sizeDropdown.className = 'cm-image-toolbar-dropdown';
    
    const sizeBtn = document.createElement('div');
    sizeBtn.className = 'cm-image-toolbar-btn';
    sizeBtn.title = '调整大小';
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
        this.resizeImagePercent(wrapper, layoutBox, selectionFrame, img, option.value);
        sizeMenu.style.display = 'none';
      });
      sizeMenu.appendChild(item);
    });
    
    sizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 閸忔娊妫撮崗鏈电铂閼挎粌宕?
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== sizeMenu) (menu as HTMLElement).style.display = 'none';
      });
      sizeMenu.style.display = sizeMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    sizeDropdown.appendChild(sizeBtn);
    sizeDropdown.appendChild(sizeMenu);

    // 鐎靛綊缍堟稉瀣閼挎粌宕?
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
        // 閺囧瓨鏌婇懣婊冨礋妞ゅ湱娈?active 閻樿埖鈧?
        alignMenu.querySelectorAll('.cm-image-toolbar-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      alignMenu.appendChild(item);
    });
    
    alignBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 閸忔娊妫撮崗鏈电铂閼挎粌宕?
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== alignMenu) (menu as HTMLElement).style.display = 'none';
      });
      alignMenu.style.display = alignMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    alignDropdown.appendChild(alignBtn);
    alignDropdown.appendChild(alignMenu);

    // 閹诲繗鍫幐澶愭尦
    const captionBtn = document.createElement('div');
    captionBtn.className = `cm-image-toolbar-btn ${this.getCleanAlt() !== 'image' ? 'active' : ''}`;
    captionBtn.title = '编辑说明';
    captionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg>`;
    
    // 閹诲繗鍫潏鎾冲弳鐎圭懓娅?
    const captionContainer = document.createElement('div');
    captionContainer.className = 'cm-image-caption-container';
    captionContainer.style.display = 'none';
    
    const captionInput = document.createElement('input');
    captionInput.type = 'text';
    captionInput.className = 'cm-image-caption-input';
    captionInput.placeholder = '输入图片说明...';
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
      // 閸忔娊妫撮崗鏈电铂閼挎粌宕?
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        (menu as HTMLElement).style.display = 'none';
      });
      const isVisible = captionContainer.style.display !== 'none';
      captionContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        setTimeout(() => captionInput.focus(), 0);
      }
    });

    // 閺勫墽銇氶弽宄扮础娑撳濯洪懣婊冨礋
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
        this.setDisplayStyle(
          wrapper,
          container,
          layoutBox,
          img,
          selectionFrame,
          option.value as 'default' | 'link' | 'card'
        );
        styleMenu.style.display = 'none';
        // 閺囧瓨鏌婇懣婊冨礋妞ゅ湱娈?active 閻樿埖鈧?
        styleMenu.querySelectorAll('.cm-image-toolbar-menu-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      styleMenu.appendChild(item);
    });
    
    styleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 閸忔娊妫撮崗鏈电铂閼挎粌宕?
      document.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
        if (menu !== styleMenu) (menu as HTMLElement).style.display = 'none';
      });
      styleMenu.style.display = styleMenu.style.display === 'none' ? 'block' : 'none';
    });
    
    styleDropdown.appendChild(styleBtn);
    styleDropdown.appendChild(styleMenu);

    // 鐟佷礁澹€閹稿鎸?
    const cropBtn = document.createElement('div');
    cropBtn.className = 'cm-image-toolbar-btn';
    cropBtn.title = '裁剪';
    cropBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>`;
    cropBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showCropDialog(img);
    });

    // 閸掑棝娈х痪?
    const divider = document.createElement('div');
    divider.className = 'cm-image-toolbar-divider';

    // 閸忋劌鐫嗛幐澶愭尦
    const fullscreenBtn = document.createElement('div');
    fullscreenBtn.className = 'cm-image-toolbar-btn';
    fullscreenBtn.title = '全屏查看';
    fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    fullscreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showFullscreen(img.src);
    });

    // 閸掔娀娅庨幐澶愭尦
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

    // 閸掓稑缂撶拫鍐╂殻婢堆冪毈閻ㄥ嫭澧滈弻?
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cm-image-resize-handle';
    selectionFrame.appendChild(resizeHandle);

    // 閻愮懓鍤崶鍓у闁鑵戦敍鍫滃▏閻?mousedown 绾喕绻氱粭顑跨閺冨爼妫块崫宥呯安閿?
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      // 缁夊娅庨崗鏈电铂閸ュ墽澧栭惃鍕偓澶夎厬閻樿埖鈧?
      document.querySelectorAll('.cm-image-container.selected').forEach(el => {
        if (el !== container) el.classList.remove('selected');
      });
      container.classList.add('selected');
      // 鐠佹澘缍嶉柅澶夎厬閻ㄥ嫬娴橀悧?src
      selectedImageSrc = this.src;
    });

    // 瀹搞儱鍙块弽蹇曞仯閸戠粯妞傞梼缁橆剾閸愭帗鍦洪敍灞肩箽閹镐線鈧鑵戦悩鑸碘偓?
    toolbar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // 閻愮懓鍤崗鏈电铂閸︾増鏌熼崣鏍ㄧХ闁鑵戦崪灞藉彠闂傤叀褰嶉崡?
    this.documentClickHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      // 婵″倹鐏夐悙鐟板毊閸?container 閹?toolbar 閸愬拑绱濇稉宥呭絿濞戝牓鈧鑵?
      if (!container.contains(target) && !toolbar.contains(target)) {
        container.classList.remove('selected');
        // 濞撳懘娅庨柅澶夎厬閻ㄥ嫬娴橀悧?src
        if (selectedImageSrc === this.src) {
          selectedImageSrc = null;
        }
      }
      // 閸忔娊妫撮幍鈧張澶庡綅閸楁洩绱欓梽銈夋姜閻愮懓鍤崷銊ㄥ綅閸楁洖鍞撮敍?
      if (!toolbar.contains(target)) {
        toolbar.querySelectorAll('.cm-image-toolbar-menu').forEach(menu => {
          (menu as HTMLElement).style.display = 'none';
        });
      }
    };
    
    document.addEventListener('mousedown', this.documentClickHandler);

    layoutBox.appendChild(img);
    container.appendChild(layoutBox);
    container.appendChild(selectionFrame);
    container.appendChild(toolbar);
    container.appendChild(captionContainer);
    wrapper.appendChild(container);

    // 婵″倹鐏夋潻娆庨嚋閸ュ墽澧栨稊瀣鐞氼偊鈧鑵戦敍灞句划婢跺秹鈧鑵戦悩鑸碘偓?
    if (selectedImageSrc === this.src) {
      container.classList.add('selected');
    }

    // 濞ｈ濮炵拫鍐╂殻婢堆冪毈閻ㄥ嫪绨ㄦ禒璺侯槱閻?
    this.setupResizeHandler(wrapper, layoutBox, resizeHandle, img, selectionFrame, container);

    const syncSelectionFrameLayout = () => {
      this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);
    };

    if (img.complete) {
      requestAnimationFrame(syncSelectionFrameLayout);
    } else {
      img.addEventListener('load', syncSelectionFrameLayout, { once: true });
    }

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);
      });
      resizeObserver.observe(wrapper);
      this.cleanupCallbacks.push(() => {
        resizeObserver.disconnect();
      });
    } else {
      window.addEventListener('resize', syncSelectionFrameLayout);
      this.cleanupCallbacks.push(() => {
        window.removeEventListener('resize', syncSelectionFrameLayout);
      });
    }

    // 婵″倹鐏夐崚婵嗩潗閺勫墽銇氶弽宄扮础娑撳秵妲告妯款吇閿涘瞼娲块幒銉ョ安閻劌顕惔鏃€鐗卞?
    if (this.displayStyle !== 'default') {
      wrapper.setAttribute('data-style', this.displayStyle);
      layoutBox.style.display = 'none';
      selectionFrame.style.display = 'none';
      
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
            <img src="${getRenderableImageSource(this.src)}" alt="${this.getCleanAlt()}" />
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

  private rotateImage(
    wrapper: HTMLElement,
    layoutBox: HTMLElement,
    selectionFrame: HTMLElement,
    img: HTMLImageElement
  ): void {
    this.rotation = (this.rotation + 90) % 360;
    img.style.transform = this.rotation ? `rotate(${this.rotation}deg)` : '';
    this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);
    this.updateImageAttributes();
  }

  private resizeImagePercent(
    wrapper: HTMLElement,
    layoutBox: HTMLElement,
    selectionFrame: HTMLElement,
    img: HTMLImageElement,
    percent: number
  ): void {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const newWidth = Math.round(naturalWidth * percent);
    const newHeight = Math.round(naturalHeight * percent);
    this.currentWidth = newWidth;
    this.currentHeight = newHeight;
    this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);
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

    const newMarkdown = `![${this.buildAltText(caption || 'image')}](${this.src})`;

    // 閺屻儲澹橀獮鑸垫禌閹广垹甯慨瀣禈閻楀洩顕㈠▔?
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

    const newMarkdown = `![${this.buildAltText()}](${this.src})`;

    // 閺屻儲澹橀獮鑸垫禌閹广垹甯慨瀣禈閻楀洩顕㈠▔?
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
    layoutBox: HTMLElement,
    img: HTMLImageElement,
    selectionFrame: HTMLElement,
    style: 'default' | 'link' | 'card'
  ): void {
    this.displayStyle = style;
    wrapper.setAttribute('data-style', style);
    
    // 缁夊娅庨弮褏娈戦弰鍓с仛閸愬懎顔?
    const oldLinkDisplay = container.querySelector('.cm-image-link-display');
    const oldCardDisplay = container.querySelector('.cm-image-card-display');
    if (oldLinkDisplay) oldLinkDisplay.remove();
    if (oldCardDisplay) oldCardDisplay.remove();
    
    // 閼惧嘲褰囧銉ュ徔閺嶅繐鎷扮拫鍐╂殻閹靛鐒洪惃鍕穿閻?
    const resizeHandle = container.querySelector('.cm-image-resize-handle');
    
    // 閺嶈宓侀弽宄扮础閺勫墽銇?闂呮劘妫岄崶鍓у
    if (style === 'default') {
      layoutBox.style.display = 'flex';
      img.style.display = 'block';
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = '';
      this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);
    } else if (style === 'link') {
      layoutBox.style.display = 'none';
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = 'none';
      selectionFrame.style.display = 'none';
      
      const linkDisplay = document.createElement('div');
      linkDisplay.className = 'cm-image-link-display';
      linkDisplay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span class="cm-image-link-text">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
      `;
      // 閹绘帒鍙嗛崚鏉挎禈閻楀洣绠ｉ崥?
      layoutBox.insertAdjacentElement('afterend', linkDisplay);
    } else if (style === 'card') {
      layoutBox.style.display = 'none';
      if (resizeHandle) (resizeHandle as HTMLElement).style.display = 'none';
      selectionFrame.style.display = 'none';
      
      const cardDisplay = document.createElement('div');
      cardDisplay.className = 'cm-image-card-display';
      cardDisplay.innerHTML = `
        <div class="cm-image-card-preview">
          <img src="${getRenderableImageSource(this.src)}" alt="${this.getCleanAlt()}" />
        </div>
        <div class="cm-image-card-info">
          <span class="cm-image-card-name">${this.getCleanAlt() !== 'image' ? this.getCleanAlt() : this.getFileName()}</span>
          <span class="cm-image-card-type">图片</span>
        </div>
      `;
      // 閹绘帒鍙嗛崚鏉挎禈閻楀洣绠ｉ崥?
      layoutBox.insertAdjacentElement('afterend', cardDisplay);
    }
    
    this.updateImageAttributes();
  }

  private showCropDialog(img: HTMLImageElement): void {
    // 閸掓稑缂撶憗浣稿鐎电鐦藉?
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
    cropImg.src = getRenderableImageSource(this.src);
    cropImg.className = 'cm-image-crop-img';
    
    const cropBox = document.createElement('div');
    cropBox.className = 'cm-image-crop-box';
    
    // 鐟佷礁澹€濡楀棛娈戦崶娑楅嚋鐟?
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
      const handle = document.createElement('div');
      handle.className = `cm-image-crop-handle ${pos}`;
      cropBox.appendChild(handle);
    });
    
    cropContainer.appendChild(cropImg);
    cropContainer.appendChild(cropBox);
    
    // 閹稿鎸抽崠鍝勭厵
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
    confirmBtn.textContent = '确认';
    confirmBtn.addEventListener('click', () => {
      // 閼惧嘲褰囩憗浣稿閸栧搫鐓欓獮璺虹安閻?
      this.applyCrop(cropImg, cropBox, img);
      overlay.remove();
    });
    
    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    
    dialog.appendChild(title);
    dialog.appendChild(cropContainer);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    
    // ESC 閸忔娊妫?
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 閻愮懓鍤柆顔惧兊閸忔娊妫?
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    document.body.appendChild(overlay);
    
    // 閸掓繂顫愰崠鏍梿閸擃亝顢嬮幏鏍ㄥ
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

  private async applyCrop(cropImg: HTMLImageElement, cropBox: HTMLElement, targetImg: HTMLImageElement): Promise<void> {
    // 鐠侊紕鐣荤憗浣稿濮ｆ柧绶?
    const scaleX = cropImg.naturalWidth / cropImg.offsetWidth;
    const scaleY = cropImg.naturalHeight / cropImg.offsetHeight;
    
    const cropX = cropBox.offsetLeft * scaleX;
    const cropY = cropBox.offsetTop * scaleY;
    const cropWidth = cropBox.offsetWidth * scaleX;
    const cropHeight = cropBox.offsetHeight * scaleY;
    
    // 娴ｈ法鏁?Canvas 鐟佷礁澹€閸ュ墽澧?
    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(cropImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    
    // 鏉烆剚宕叉稉?base64
    const activeEditorMeta = getActiveCodeMirrorEditorMeta();
    const activeEditorPath = activeEditorMeta.path ?? undefined;
    if (!isRealFileSystemPath(activeEditorPath)) {
      toastService.error('请先将当前笔记保存到磁盘后再裁剪图片。');
      return;
    }
    
    // 閺囧瓨鏌婇崶鍓у
    try {
      const croppedBlob = await canvasToBlob(canvas, 'image/png');
    
    // 閺囧瓨鏌?Markdown
      const sourceBaseName = sanitizeAttachmentName(getPathStem(this.getFileName()));
      const savedImagePath = await persistImageBlobToNoteAssets(
        activeEditorPath,
        croppedBlob,
        `${sourceBaseName}-crop`,
        '.png',
      );
      targetImg.src = getRenderableImageSource(savedImagePath);
      this.updateImageSrc(savedImagePath);
    } catch (error) {
      console.error('[CodeMirrorEditor] 鍥剧墖瑁佸壀淇濆瓨澶辫触:', error);
      toastService.error('鍥剧墖瑁佸壀澶辫触');
    }
  }

  private updateImageSrc(newSrc: string): void {
    const view = globalEditorView;
    if (!view) return;

    const newMarkdown = `![${this.buildAltText()}](${newSrc})`;

    // 閺屻儲澹橀獮鑸垫禌閹广垹甯慨瀣禈閻楀洩顕㈠▔?
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
    // 閸掓稑缂撻崗銊ョ潌闁喚鍍?
    const overlay = document.createElement('div');
    overlay.className = 'cm-image-fullscreen-overlay';

    const fullImg = document.createElement('img');
    fullImg.src = src;
    fullImg.className = 'cm-image-fullscreen-img';

    // 閸忔娊妫撮幐澶愭尦
    const closeBtn = document.createElement('div');
    closeBtn.className = 'cm-image-fullscreen-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // 閻愮懓鍤柆顔惧兊閸忔娊妫?
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // ESC 闁款喖鍙ч梻?
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

    // 閺屻儲澹橀獮璺哄灩闂勩倕娴橀悧鍥嚔濞?
    const doc = view.state.doc.toString();
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let targetFrom = -1;
    let targetTo = -1;

    while ((match = regex.exec(doc)) !== null) {
      if (match[2] === this.src) {
        targetFrom = match.index;
        targetTo = match.index + match[0].length;
        // 濡偓閺屻儱澧犻崥搴㈡Ц閸氾附婀侀幑銏ｎ攽缁楋讣绱濇稉鈧獮璺哄灩闂?
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

  private setupResizeHandler(
    wrapper: HTMLElement,
    layoutBox: HTMLElement,
    handle: HTMLElement,
    img: HTMLImageElement,
    selectionFrame: HTMLElement,
    container: HTMLElement
  ): void {
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

      this.currentWidth = newWidth;
      this.currentHeight = newHeight;
      this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      container.classList.remove('resizing');
      this.syncImageLayout(wrapper, layoutBox, selectionFrame, img);

      // 閼惧嘲褰囬張鈧紒鍫濇槀鐎?
      const finalWidth = img.offsetWidth;
      const finalHeight = img.offsetHeight;

      // 閺囧瓨鏌?Markdown 娑擃厾娈戦崶鍓у鐏忓搫顕?
      this.updateImageSize(finalWidth, finalHeight);
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  private updateImageSize(width: number, height: number): void {
    const view = globalEditorView;
    if (!view) return;

    this.currentWidth = width;
    this.currentHeight = height;

    const newMarkdown = `![${this.buildAltText()}](${this.src})`;

    // 閺屻儲澹橀獮鑸垫禌閹广垹甯慨瀣禈閻楀洩顕㈠▔?
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
    // 濞撳懐鎮婃禍瀣╂閻╂垵鎯夐崳?
    if (this.documentClickHandler) {
      document.removeEventListener('mousedown', this.documentClickHandler);
      this.documentClickHandler = null;
    }

    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks = [];
  }
}

/**
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱閸ュ墽澧栫拠顓熺《楠炶泛鍨卞楦款棅妤楁澘娅?
 */
function parseImages(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 閸栧綊鍘?Markdown 閸ュ墽澧栫拠顓熺《: ![alt](src) 閹?![alt|widthxheight](src)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = imageRegex.exec(doc)) !== null) {
    const rawAlt = match[1];
    const src = match[2];
    const from = match.index;
    const to = from + match[0].length;

    // 鐠哄疇绻冪憴鍡涱暥闁剧偓甯撮敍宀冾唨鐟欏棝顣剁憗鍛淬偘閸ｃ劌顦╅悶?
    if (isVideoUrl(src)) {
      continue;
    }

    // 鐟欙絾鐎界亸鍝勵嚟娣団剝浼?
    const { width, height } = parseImageSize(rawAlt);

    // 闂呮劘妫岄崢鐔奉潗閸ュ墽澧栫拠顓熺《閺傚洦婀?
    decorations.push({
      from,
      to,
      decoration: Decoration.replace({
        widget: new ResizableImageWidget(src, rawAlt, width, height, from, to, match[0]),
      }),
    });
  }

  // 閹稿缍呯純顔藉笓鎼?
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 濡偓閺?URL 閺勵垰鎯佹稉楦款潒妫版垿鎽奸幒?
 */
function isVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  const pathOnlyUrl = lowerUrl.split(/[?#]/)[0];
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'];

  if (isImageUrl(pathOnlyUrl)) {
    return false;
  }

  // B缁?
  if (/bilibili\.com\/video\/(BV[\w]+|av\d+)/i.test(url)) return true;
  if (/b23\.tv\//i.test(url)) return true;
  // YouTube
  if (/(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url)) return true;
  // 娴兼﹢鍙?
  if (/youku\.com\/v_show\/id_/i.test(url)) return true;
  if (videoExtensions.some(ext => pathOnlyUrl.endsWith(ext))) return true;
  return /^https?:\/\//i.test(url);
}

/**
 * 閸ュ墽澧栫憗鍛淬偘閸?StateField
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
// 鐟欏棝顣跺畵灞藉弳濞撳弶鐓嬬化鑽ょ埠
// ============================================================================

/**
 * 鐟欏棝顣堕獮鍐插酱缁鐎?
 */
type VideoPlatform = 'bilibili' | 'youtube' | 'youku' | 'qq' | 'iqiyi' | 'xigua' | 'douyin' | 'local' | 'other';

/**
 * 鐟欏棝顣舵穱鈩冧紖缂佹挻鐎?
 */
interface VideoInfo {
  platform: VideoPlatform;
  embedUrl: string;
  originalUrl: string;
}

/**
 * 鐟欙絾鐎界憴鍡涱暥闁剧偓甯撮敍宀冩祮閹诡澀璐熷畵灞藉弳闁剧偓甯?
 */
function parseVideoUrl(url: string): VideoInfo | null {
  console.log('[parseVideoUrl] 鐟欙絾鐎界憴鍡涱暥闁剧偓甯?', url);
  
  // B缁旀瑩鎽奸幒銉ㄐ掗弸?
  // 閺€顖涘瘮閺嶇厧绱? 
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

  // B缁旀瑧鐓柧鐐复
  const b23Match = url.match(/b23\.tv\/([\w]+)/i);
  if (b23Match) {
    // 閻參鎽奸幒銉╂付鐟曚線鍣哥€规艾鎮滈敍灞炬畯閺冩湹濞囬悽銊ュ斧闁剧偓甯?
    return { platform: 'bilibili', embedUrl: url, originalUrl: url };
  }

  // YouTube 闁剧偓甯寸憴锝嗙€?
  // 閺€顖涘瘮閺嶇厧绱?
  // - https://www.youtube.com/watch?v=xxxxxxx
  // - https://youtu.be/xxxxxxx
  // 娴ｈ法鏁?youtube-nocookie.com 闂呮劗顫嗘晶鐐插繁濡€崇础閿涘矂浼╅崗宥呯サ閸忋儵妾洪崚?
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (youtubeMatch) {
    const videoId = youtubeMatch[1];
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
    return { platform: 'youtube', embedUrl, originalUrl: url };
  }

  // 娴兼﹢鍙块柧鐐复鐟欙絾鐎?
  // 閺€顖涘瘮閺嶇厧绱? https://v.youku.com/v_show/id_xxxxxxx.html
  const youkuMatch = url.match(/youku\.com\/v_show\/id_([\w=]+)/i);
  if (youkuMatch) {
    const videoId = youkuMatch[1];
    const embedUrl = `https://player.youku.com/embed/${videoId}`;
    return { platform: 'youku', embedUrl, originalUrl: url };
  }

  // 閼垫崘顔嗙憴鍡涱暥闁剧偓甯寸憴锝嗙€?
  // 閺€顖涘瘮閺嶇厧绱? https://v.qq.com/x/cover/xxx/xxx.html
  const qqMatch = url.match(/v\.qq\.com/i);
  if (qqMatch) {
    return { platform: 'qq', embedUrl: url, originalUrl: url };
  }

  // 閻栧崬顨岄懝娲懠閹恒儴袙閺?
  // 閺€顖涘瘮閺嶇厧绱? https://www.iqiyi.com/v_xxx.html
  const iqiyiMatch = url.match(/iqiyi\.com/i);
  if (iqiyiMatch) {
    return { platform: 'iqiyi', embedUrl: url, originalUrl: url };
  }

  // 鐟楄法鎽愮憴鍡涱暥闁剧偓甯寸憴锝嗙€?
  // 閺€顖涘瘮閺嶇厧绱? https://www.ixigua.com/xxx
  const xiguaMatch = url.match(/ixigua\.com/i);
  if (xiguaMatch) {
    return { platform: 'xigua', embedUrl: url, originalUrl: url };
  }

  // 閹舵牠鐓堕柧鐐复鐟欙絾鐎?
  // 閺€顖涘瘮閺嶇厧绱? https://www.douyin.com/video/xxx
  const douyinMatch = url.match(/douyin\.com/i);
  if (douyinMatch) {
    return { platform: 'douyin', embedUrl: url, originalUrl: url };
  }

  // 閺堫剙婀寸憴鍡涱暥閺傚洣娆?
  // 閺€顖涘瘮閺嶇厧绱? file:///path/to/video.mp4 閹?C:\path\to\video.mp4 閹?/path/to/video.mp4
  const localVideoExtensions = /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i;
  // 閸忓牐袙閻?URL 缂傛牜鐖滈惃鍕熅瀵?
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // 鐟欙絿鐖滄径杈Е閸掓瑤濞囬悽銊ュ斧婵?URL
  }
  console.log('[parseVideoUrl] 濡偓閺屻儲婀伴崷鎷岊潒妫? url:', url, 'decodedUrl:', decodedUrl);
  console.log('[parseVideoUrl] file:// 閸栧綊鍘?', url.match(/^file:\/\//i));
  console.log('[parseVideoUrl] Windows鐠侯垰绶為崠褰掑帳:', url.match(/^[A-Za-z]:[\\\/]/));
  console.log('[parseVideoUrl] 閹碘晛鐫嶉崥宥呭爱闁?', localVideoExtensions.test(decodedUrl));
  // 濡偓閺屻儲妲搁崥锔胯礋閺堫剙婀寸憴鍡涱暥鐠侯垰绶?
  const hasLocalVideoExtension = localVideoExtensions.test(decodedUrl.split(/[?#]/)[0]);
  const isLocalPath =
    hasLocalVideoExtension && (
      url.match(/^local-file:\/\//i) ||
      decodedUrl.match(/^local-file:\/\//i) ||
      url.match(/^file:\/\//i) ||
      decodedUrl.match(/^file:\/\//i) ||
      url.match(/^[A-Za-z]:[\\\/]/) ||
      decodedUrl.match(/^[A-Za-z]:[\\\/]/) ||
      url.startsWith('/') ||
      decodedUrl.startsWith('/')
    );
  
  if (isLocalPath) {
    console.log('[parseVideoUrl] 妫€娴嬪埌鏈湴瑙嗛璺緞:', url);
    return { platform: 'local', embedUrl: url, originalUrl: url };
  }
  // 娑旂喐鏁幐浣风瑝鐢箑宕楃拋顔炬畱閺堫剙婀寸捄顖氱窞閿涘牊婀佺憴鍡涱暥閹碘晛鐫嶉崥宥勭瑬娑撳秵妲?http/https閿?
  if (hasLocalVideoExtension && !url.match(/^https?:\/\//i)) {
    console.log('[parseVideoUrl] 鐠囧棗鍩嗘稉鐑樻拱閸︽媽顫嬫０?閺冪姴宕楃拋?');
    return { platform: 'local', embedUrl: url, originalUrl: url };
  }

  // 闁氨鏁ょ憴鍡涱暥闁剧偓甯?- 閺€顖涘瘮娴犵粯鍓?http/https 闁剧偓甯?
  // 娴ｈ法鏁ゆ晶鐐插繁閸ㄥ绁荤憴鍫濇珤閸欘垯浜掗惄瀛樺复閸旂姾娴囨禒缁樺壈缂冩垿銆?
  if (isImageUrl(decodedUrl)) {
    return null;
  }

  if (url.match(/^https?:\/\//i)) {
    return { platform: 'other', embedUrl: url, originalUrl: url };
  }

  return null;
}

// ============================================================================
// Mermaid 閸ユ崘銆冨〒鍙夌厠缁崵绮?
// ============================================================================

// 閸掓繂顫愰崠?Mermaid
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

// Mermaid Widget DOM 缂傛挸鐡?
const mermaidWidgetDomCache = new WeakMap<MermaidWidget, HTMLElement>();

/**
 * Mermaid 閸ユ崘銆?Widget 缁?
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
    // 濡偓閺屻儳绱︾€?
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

    // 瀹搞儱鍙块弽?
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-mermaid-toolbar';

    // 瀹革缚鏅堕敍姘垼妫?
    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-mermaid-toolbar-left';

    // 閺嶅洭顣介弰鍓с仛
    const title = document.createElement('span');
    title.className = 'cm-mermaid-title';
    title.textContent = '流程图';

    // 閺嶅洭顣界紓鏍帆鏉堟挸鍙嗗?
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'cm-mermaid-title-input';
    titleInput.value = '流程图';
    titleInput.style.display = 'none';

    // 缂傛牞绶悩鑸碘偓?
    let isEditing = false;

    // 鏉╂稑鍙嗙紓鏍帆濡€崇础
    const enterEditMode = () => {
      isEditing = true;
      title.style.display = 'none';
      titleInput.style.display = 'block';
      titleInput.value = title.textContent || '流程图';
      titleInput.focus();
      titleInput.select();
    };

    // 闁偓閸戣櫣绱潏鎴災佸?
    const exitEditMode = (save: boolean) => {
      if (!isEditing) return;
      isEditing = false;
      title.style.display = 'block';
      titleInput.style.display = 'none';
      if (save && titleInput.value.trim()) {
        title.textContent = titleInput.value.trim();
      }
    };

    // 鏉堟挸鍙嗗鍡曠皑娴?
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

    // 閸欏厖鏅堕敍姘紣閸忛攱鐖幐澶愭尦
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-mermaid-toolbar-right';

    // 缂傛牞绶幐澶愭尦
    const editBtn = document.createElement('span');
    editBtn.className = 'cm-mermaid-toolbar-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = `<svg viewBox="0 0 32 32" fill="currentColor" width="16" height="16"><path d="M2 26h28v2H2z"></path><path d="M25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10l3.6 3.6l-10 10H6z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterEditMode();
    });

    // 閸楋紕澧栭幐澶愭尦
    const cardBtn = document.createElement('span');
    cardBtn.className = 'cm-mermaid-toolbar-btn';
    cardBtn.title = '卡片';
    cardBtn.innerHTML = `<svg viewBox="0 0 1024 1024" fill="currentColor" width="16" height="16"><path d="M341.333333 106.666667a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L192 234.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L234.666667 384h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L384 341.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L341.333333 192z m0 362.666667a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L192 682.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L234.666667 832h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L384 789.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L341.333333 640z m576-298.666667a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666a128 128 0 0 1 128 128v106.666666z m-85.333333 0v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L789.333333 192h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L640 234.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L682.666667 384h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L832 341.333333z m-42.666667 213.333334a128 128 0 0 1 128 128v106.666666a128 128 0 0 1-128 128h-106.666666a128 128 0 0 1-128-128v-106.666666a128 128 0 0 1 128-128h106.666666z m0 85.333333h-106.666666a42.666667 42.666667 0 0 0-42.56 39.466667L640 682.666667v106.666666a42.666667 42.666667 0 0 0 39.466667 42.56L682.666667 832h106.666666a42.666667 42.666667 0 0 0 42.56-39.466667L832 789.333333v-106.666666a42.666667 42.666667 0 0 0-39.466667-42.56L789.333333 640z" /></svg>`;
    cardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囬崡锛勫鐟欏棗娴橀崝鐔诲厴
      console.log('卡片视图功能待实现');
    });

    // 鐠佹崘顓搁幐澶愭尦
    const designBtn = document.createElement('span');
    designBtn.className = 'cm-mermaid-toolbar-btn';
    designBtn.title = '设计';
    designBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`;
    designBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囩拋鎹愵吀閸旂喕鍏?
      console.log('设计布局功能待实现');
    });

    // 娑撳顣介幐澶愭尦
    const themeBtn = document.createElement('span');
    themeBtn.className = 'cm-mermaid-toolbar-btn';
    themeBtn.title = '主题';
    themeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>`;
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囨稉濠氼暯閸掑洦宕查崝鐔诲厴
      console.log('閸掑洦宕叉稉濠氼暯');
    });

    // 娴狅絿鐖滈幐澶愭尦
    const codeBtn = document.createElement('span');
    codeBtn.className = 'cm-mermaid-toolbar-btn';
    codeBtn.title = '源码';
    codeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`;
    codeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囬弻銉ф箙娴狅絿鐖滈崝鐔诲厴
      console.log('閺屻儳婀呮禒锝囩垳');
    });

    // 閹碘晛銇囬幐澶愭尦
    const expandBtn = document.createElement('span');
    expandBtn.className = 'cm-mermaid-toolbar-btn';
    expandBtn.title = '打开设计器';
    expandBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/></svg>`;
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 閹垫挸绱戝ù浣衡柤閸ユ崘顔曠拋鈥虫珤閺嶅洨顒锋い?
      window.dispatchEvent(new CustomEvent('open-mermaid-designer', {
        detail: {
          code: this.code,
          title: title.textContent || '流程图'
        }
      }));
    });

    // 閸掔娀娅庨幐澶愭尦
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-mermaid-toolbar-btn cm-mermaid-toolbar-btn-danger';
    deleteBtn.title = '删除';
    deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6.5 7v4a.5.5 0 0 0 1 0V7a.5.5 0 0 0-1 0zM9 6.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zM10 4h3a.5.5 0 0 1 0 1h-.553l-.752 6.776A2.5 2.5 0 0 1 9.21 14H6.79a2.5 2.5 0 0 1-2.485-2.224L3.552 5H3a.5.5 0 0 1 0-1h3a2 2 0 1 1 4 0zM8 3a1 1 0 0 0-1 1h2a1 1 0 0 0-1-1zM4.559 5l.74 6.666A1.5 1.5 0 0 0 6.79 13h2.42a1.5 1.5 0 0 0 1.49-1.334L11.442 5H4.56z" fill="currentColor"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 閸掔娀娅?Mermaid 娴狅絿鐖滈崸?
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

    // 閸愬懎顔愰崠鍝勭厵閿涘牆瀵橀崥顐箯娓氀冧紣閸忛攱鐖崪灞芥禈鐞涱煉绱?
    const content = document.createElement('div');
    content.className = 'cm-mermaid-content';

    // 瀹革缚鏅堕崹鍌滄纯瀹搞儱鍙块弽?
    const sideToolbar = document.createElement('div');
    sideToolbar.className = 'cm-mermaid-side-toolbar';

    // 閹锋牗瀚块悩鑸碘偓?
    let isDragMode = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let translateX = 0;
    let translateY = 0;

    // 缂傗晜鏂侀悩鑸碘偓?
    let scale = 1;
    const minScale = 0.2;
    const maxScale = 2;
    const scaleStep = 0.25;

    // 閺囧瓨鏌婇崣妯诲床
    const updateTransform = () => {
      svgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    };

    // 閹锋牗瀚块幐澶愭尦
    const dragBtn = document.createElement('span');
    dragBtn.className = 'cm-mermaid-side-btn';
    dragBtn.title = '拖拽模式';
    dragBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
    dragBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isDragMode = !isDragMode;
      dragBtn.classList.toggle('active', isDragMode);
      container.classList.toggle('cm-mermaid-drag-mode', isDragMode);
    });

    // 閻ф儳鍨庡В鏃€妯夌粈?
    const zoomLabel = document.createElement('span');
    zoomLabel.className = 'cm-mermaid-zoom-label';
    zoomLabel.textContent = '100%';

    // 缂傗晜鏂侀懣婊冨礋
    const zoomPresets = [20, 50, 75, 100, 150, 200];
    let zoomMenu: HTMLElement | null = null;

    const showZoomMenu = (e: MouseEvent) => {
      e.stopPropagation();
      
      // 婵″倹鐏夐懣婊冨礋瀹告彃鐡ㄩ崷顭掔礉閸忓牏些闂?
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

      // 鐎规矮缍呴懣婊冨礋
      const rect = zoomLabel.getBoundingClientRect();
      zoomMenu.style.position = 'fixed';
      zoomMenu.style.left = `${rect.right + 4}px`;
      zoomMenu.style.top = `${rect.top}px`;

      document.body.appendChild(zoomMenu);

      // 閻愮懓鍤崗鏈电铂閸︾増鏌熼崗鎶芥４閼挎粌宕?
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

    // 閸ユ崘銆冮崘鍛啇閸栧懓顥婇崳顭掔礄閻劋绨崣妯诲床閿? 閹绘劕澧犳竟鐗堟
    const svgWrapper = document.createElement('div');
    svgWrapper.className = 'cm-mermaid-svg-wrapper';

    // 閺€鎯с亣閹稿鎸?
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

    // 缂傗晛鐨幐澶愭尦
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

    // 缁辩姵娼楁惔鎾村瘻闁?
    const materialBtn = document.createElement('span');
    materialBtn.className = 'cm-mermaid-side-btn';
    materialBtn.title = '素材库';
    materialBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/></svg>`;
    materialBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 閹垫挸绱戠槐鐘虫綏鎼存捇娼伴弶?
      console.log('绱犳潗搴撳姛鑳藉緟瀹炵幇');
    });

    // 閸掑棝娈х痪?
    const divider = document.createElement('div');
    divider.className = 'cm-mermaid-side-divider';

    sideToolbar.appendChild(materialBtn);
    sideToolbar.appendChild(divider);
    sideToolbar.appendChild(dragBtn);
    sideToolbar.appendChild(zoomOutBtn);
    sideToolbar.appendChild(zoomLabel);
    sideToolbar.appendChild(zoomInBtn);

    // 閸ユ崘銆冪€圭懓娅?
    const container = document.createElement('div');
    container.className = 'cm-mermaid-container';

    // 閹锋牗瀚挎禍瀣╂婢跺嫮鎮?
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

    // 濞撳弶鐓?Mermaid 閸ユ崘銆?
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    mermaid.render(id, this.code).then(({ svg }) => {
      svgWrapper.innerHTML = svg;
    }).catch((error: Error) => {
      svgWrapper.innerHTML = `<div class="cm-mermaid-error">Mermaid 渲染失败: ${error.message}</div>`;
    });

    container.appendChild(svgWrapper);
    content.appendChild(sideToolbar);
    content.appendChild(container);
    wrapper.appendChild(content);

    // 鎼存洟鍎撮幏鏍уЗ閹靛鐒?
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'cm-mermaid-resize-handle';
    
    const resizeBar = document.createElement('div');
    resizeBar.className = 'cm-mermaid-resize-bar';
    resizeHandle.appendChild(resizeBar);

    // 妤傛ê瀹崇拫鍐╂殻閻樿埖鈧?
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

    // 闂冪粯顒涙禍瀣╂閸愭帗鍦?
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
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱 Mermaid 娴狅絿鐖滈崸?
 */
function parseMermaidBlocks(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 閸栧綊鍘?```mermaid ... ``` 娴狅絿鐖滈崸?
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
 * 閼惧嘲褰?Mermaid 娴狅絿鐖滈崸妤冾劮閸?
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
 * Mermaid 鐟佸懘銈伴崳?StateField
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
// 鐟欏棝顣跺〒鍙夌厠缁崵绮?
// ============================================================================

// 鐟欏棝顣?Widget DOM 缂傛挸鐡ㄩ敍灞煎▏閻?WeakMap 鐏?widget 鐎圭偘绶ユ稉?DOM 閸忓啰绀岄崗瀹犱粓
const videoWidgetDomCache = new WeakMap<VideoWidget, HTMLElement>();

/**
 * 鐟欏棝顣?Widget 缁?- 閻劋绨崷銊х椽鏉堟垵娅掓稉顓熻閺屾捁顫嬫０鎴炴尡閺€鎯ф珤
 * 娴ｈ法鏁?Electron webview 閺嶅洨顒风紒鏇＄箖 CSP 闂勬劕鍩?
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
    // 鐟欙絾鐎?alt 娑擃厾娈戦弰鍓с仛濡€崇础
    this.parseDisplayMode();
  }

  private parseDisplayMode(): void {
    // 閺嶇厧绱? 閺嶅洭顣絴mode:card
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
    // 缁夊娅庡Ο鈥崇础娣団剝浼呴敍灞藉涧娣囨繄鏆€閺嶅洭顣?
    const parts = this.alt.split('|');
    const cleanParts = parts.filter(part => !part.startsWith('mode:'));
    return cleanParts.join('|') || '视频';
  }

  toDOM(): HTMLElement {
    // 婵″倹鐏夊鍙夋箒 DOM 閸忓啰绀岄敍宀€娲块幒銉ㄧ箲閸ョ儑绱欓柆鍨帳闁插秴顦查崚娑樼紦閿?
    if (this.domElement) {
      // 閺囧瓨鏌婇弽鍥暯閿涘牆褰查懗钘夊嚒閺囧瓨鏁奸敍?
      const titleEl = this.domElement.querySelector('.cm-video-title');
      if (titleEl) {
        titleEl.textContent = this.getCleanTitle();
      }
      return this.domElement;
    }

    // 濡偓閺?WeakMap 缂傛挸鐡?
    const cached = videoWidgetDomCache.get(this);
    if (cached) {
      this.domElement = cached;
      return cached;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `cm-video-widget cm-video-mode-${this.displayMode}`;

    // 瀹搞儱鍙块弽?
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-video-toolbar';

    const toolbarLeft = document.createElement('div');
    toolbarLeft.className = 'cm-video-toolbar-left';

    const platformBadge = document.createElement('span');
    platformBadge.className = 'cm-video-platform-badge';
    platformBadge.textContent = this.getPlatformName();

    // 閺嶅洭顣介弰鍓с仛閸忓啰绀?
    const title = document.createElement('span');
    title.className = 'cm-video-title';
    title.textContent = this.getCleanTitle();

    // 閺嶅洭顣界紓鏍帆鏉堟挸鍙嗗鍡礄姒涙顓婚梾鎰閿?
    const titleInput = document.createElement('input');
    titleInput.className = 'cm-video-title-input';
    titleInput.type = 'text';
    titleInput.value = this.getCleanTitle();
    titleInput.style.display = 'none';

    // 闂冪粯顒涙潏鎾冲弳濡楀棔绨ㄦ禒璺哄晪濞?
    titleInput.addEventListener('mousedown', (e) => e.stopPropagation());
    titleInput.addEventListener('mouseup', (e) => e.stopPropagation());
    titleInput.addEventListener('click', (e) => e.stopPropagation());
    titleInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        // 娣囨繂鐡ㄩ弽鍥暯
        const newTitle = titleInput.value.trim() || '视频';
        title.textContent = newTitle;
        titleInput.style.display = 'none';
        title.style.display = '';
        // 鐟欙箑褰傞弽鍥暯閺囧瓨鏌婃禍瀣╂
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
        // 閸欐牗绉风紓鏍帆
        titleInput.value = this.getCleanTitle();
        titleInput.style.display = 'none';
        title.style.display = '';
      }
    });
    titleInput.addEventListener('keyup', (e) => e.stopPropagation());
    titleInput.addEventListener('keypress', (e) => e.stopPropagation());
    titleInput.addEventListener('blur', () => {
      // 婢惰京鍔嶉弮鏈电箽鐎?
      const newTitle = titleInput.value.trim() || '视频';
      title.textContent = newTitle;
      titleInput.style.display = 'none';
      title.style.display = '';
      // 鐟欙箑褰傞弽鍥暯閺囧瓨鏌婃禍瀣╂
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

    // 缂傛牞绶幐澶愭尦
    const editBtn = document.createElement('span');
    editBtn.className = 'cm-video-toolbar-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = `<svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor"><path d="M2 26h28v2H2z"></path><path d="M25.4 9c.8-.8.8-2 0-2.8l-3.6-3.6c-.8-.8-2-.8-2.8 0l-15 15V24h6.4l15-15zm-5-5L24 7.6l-3 3L17.4 7l3-3zM6 22v-3.6l10-10 3.6 3.6-10 10H6z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 閸掑洦宕查崚鎵椽鏉堟垶膩瀵?
      title.style.display = 'none';
      titleInput.style.display = '';
      titleInput.value = title.textContent || '视频';
      titleInput.focus();
      titleInput.select();
    });

    // 閸楋紕澧栧Ο鈥崇础閹稿鎸?
    const cardBtn = document.createElement('span');
    cardBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'card' ? 'active' : ''}`;
    cardBtn.title = '卡片';
    cardBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h18"/><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 22h18"/></svg>`;
    cardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('card');
    });

    // 闁剧偓甯村Ο鈥崇础閹稿鎸?
    const linkBtn = document.createElement('span');
    linkBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'link' ? 'active' : ''}`;
    linkBtn.title = '链接';
    linkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`;
    linkBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('link');
    });

    // 鐟欏棝顣跺畵灞藉弳濡€崇础閹稿鎸?
    const embedBtn = document.createElement('span');
    embedBtn.className = `cm-video-toolbar-btn ${this.displayMode === 'embed' ? 'active' : ''}`;
    embedBtn.title = '嵌入';
    embedBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.25 13a.75.75 0 0 1 .743.648l.007.102v5a3.25 3.25 0 0 1-3.066 3.245L18.75 22h-4.668c.536-.385.973-.9 1.265-1.499l3.403-.001a1.75 1.75 0 0 0 1.744-1.607l.006-.143v-5a.75.75 0 0 1 .75-.75zm-9.5-4A3.25 3.25 0 0 1 15 12.25v6.5A3.25 3.25 0 0 1 11.75 22h-6.5A3.25 3.25 0 0 1 2 18.75v-6.5A3.25 3.25 0 0 1 5.25 9h6.5zm0 1.5h-6.5a1.75 1.75 0 0 0-1.75 1.75v6.5c0 .966.783 1.75 1.75 1.75h6.5a1.75 1.75 0 0 0 1.75-1.75v-6.5a1.75 1.75 0 0 0-1.75-1.75zM6.06 13.103a.5.5 0 0 1 .596-.236l.082.036l3.956 2.158a.5.5 0 0 1 .075.828l-.075.05l-3.956 2.158a.5.5 0 0 1-.731-.35L6 17.658v-4.315a.5.5 0 0 1 .061-.24zM18.75 2a3.25 3.25 0 0 1 3.245 3.066L22 5.25v5a.75.75 0 0 1-1.493.102l-.007-.102v-5a1.75 1.75 0 0 0-1.607-1.744L18.75 3.5h-5a.75.75 0 0 1-.102-1.493L13.75 2h5zm-8.5 0a.75.75 0 0 1 .102 1.493l-.102.007h-5a1.75 1.75 0 0 0-1.744 1.606L3.5 5.25v3.402c-.6.292-1.115.73-1.5 1.266V5.25a3.25 3.25 0 0 1 3.065-3.245L5.25 2h5z"/></svg>`;
    embedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.changeDisplayMode('embed');
    });

    // 閸︺劍绁荤憴鍫濇珤娑擃厽澧﹀鈧幐澶愭尦
    const openBtn = document.createElement('span');
    openBtn.className = 'cm-video-toolbar-btn';
    openBtn.title = '在浏览器中打开';
    openBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(this.videoInfo.originalUrl, '_blank');
    });

    // 閺囨潙顦块懣婊冨礋閹稿鎸?
    const moreBtn = document.createElement('span');
    moreBtn.className = 'cm-video-toolbar-btn';
    moreBtn.title = '更多';
    moreBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 閺勫墽銇氶弴鏉戭樋閼挎粌宕?
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

    // 閺嶈宓侀弰鍓с仛濡€崇础濞撳弶鐓嬮崘鍛啇
    if (this.displayMode === 'embed') {
      // 閺堫剙婀寸憴鍡涱暥娴ｈ法鏁?HTML5 video 閺嶅洨顒?
      if (this.videoInfo.platform === 'local') {
        const localContainer = document.createElement('div');
        localContainer.className = 'cm-video-local-player';

        const video = document.createElement('video');
        video.className = 'cm-video-local-video';
        
        // 鐏忓棙婀伴崷鐗堟瀮娴犳儼鐭惧鍕祮閹诡澀璐?local-file:// 閸楀繗顔?
        let videoSrc = this.videoInfo.originalUrl;
        console.log('[VideoWidget] 閺堫剙婀寸憴鍡涱暥閸樼喎顫愮捄顖氱窞:', videoSrc);
        if (videoSrc.startsWith('file:///')) {
          // file:/// 鏉烆剚宕叉稉?local-file:///
          videoSrc = videoSrc.replace('file:///', 'local-file:///');
        } else if (videoSrc.startsWith('file://')) {
          // file:// 鏉烆剚宕叉稉?local-file://
          videoSrc = videoSrc.replace('file://', 'local-file://');
        } else if (!videoSrc.startsWith('local-file://')) {
          // Windows 鐠侯垰绶炴潪顒佸床: C:\path\to\video.mp4 -> local-file:///C:/path/to/video.mp4
          // 闂団偓鐟曚礁顕捄顖氱窞鏉╂稖顢?URL 缂傛牜鐖滈敍鍫滅稻娣囨繄鏆€閺傛粍娼崪灞藉晪閸欏嚖绱?
          const normalizedPath = videoSrc.replace(/\\/g, '/');
          const parts = normalizedPath.split('/');
          const encodedParts = parts.map((part, index) => {
            // 缁楊兛绔撮柈銊ュ瀻閺勵垳娲忕粭锔肩礄婵?C:閿涘绱濇稉宥囩椽閻?
            if (index === 0 && /^[A-Za-z]:$/.test(part)) {
              return part;
            }
            return encodeURIComponent(part);
          });
          videoSrc = 'local-file:///' + encodedParts.join('/');
        }
        console.log('[VideoWidget] 閺堫剙婀寸憴鍡涱暥鏉烆剚宕查崥搴ょ熅瀵?', videoSrc);
        video.src = videoSrc;
        video.controls = true;
        video.preload = 'metadata';

        // 濞ｈ濮為柨娆掝嚖婢跺嫮鎮?
        video.addEventListener('error', (e) => {
          console.error('[VideoWidget] 鐟欏棝顣堕崝鐘烘祰闁挎瑨顕?', e, video.error);
        });

        // 闂冪粯顒涙禍瀣╂閸愭帗鍦?
        video.addEventListener('mousedown', (e) => e.stopPropagation());
        video.addEventListener('click', (e) => e.stopPropagation());

        localContainer.appendChild(video);
        wrapper.appendChild(localContainer);
      } else {
        // 婢х偛宸遍崹瀣敶瀹撳本绁荤憴鍫濇珤
        const browserContainer = document.createElement('div');
        browserContainer.className = 'cm-video-browser';

      // 濞村繗顫嶉崳銊ヮ嚤閼割亝鐖?
      const browserNav = document.createElement('div');
      browserNav.className = 'cm-video-browser-nav';

      // 閸氬酣鈧偓閹稿鎸?
      const backBtn = document.createElement('span');
      backBtn.className = 'cm-video-browser-btn';
      backBtn.title = '后退';
      backBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.928 7.976l4.357 4.357-.618.62L5 8.284v-.618L9.667 3l.618.619-4.357 4.357z"/></svg>`;

      // 閸撳秷绻橀幐澶愭尦
      const forwardBtn = document.createElement('span');
      forwardBtn.className = 'cm-video-browser-btn';
      forwardBtn.title = '前进';
      forwardBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"/></svg>`;

      // 閸掗攱鏌婇幐澶愭尦
      const refreshBtn = document.createElement('span');
      refreshBtn.className = 'cm-video-browser-btn';
      refreshBtn.title = '刷新';
      refreshBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.56253 2.51577C6.22874 2.18616 6.96524 2 7.74856 2C9.08973 2 10.347 2.54555 11.2554 3.45393C11.6244 3.82283 11.9297 4.25217 12.1575 4.72382L12.1575 3L13.1575 3V6.74856L9.40897 6.74856V5.74856H11.3161C11.1284 5.27466 10.8435 4.84603 10.4839 4.48638C9.78661 3.78908 8.81981 3.35862 7.74856 3.35862C7.14565 3.35862 6.58195 3.50551 6.08841 3.76641L5.56253 2.51577ZM4.34253 10.2516C4.13064 9.77756 4.01561 9.25774 4.01561 8.71143C4.01561 7.64018 4.44607 6.67338 5.14337 5.97609L6.20399 7.03671C5.71713 7.52357 5.42142 8.18538 5.42142 8.91703C5.42142 9.35023 5.51636 9.76027 5.68652 10.1272L4.34253 10.2516ZM8.03663 12.7916C8.6395 12.632 9.19129 12.3302 9.65221 11.9204L10.7128 12.981C10.0466 13.5904 9.23861 14.0316 8.35253 14.2405L8.03663 12.7916ZM4.15743 6L6.84257 6L6.84257 7L4.93542 7C5.123 7.47391 5.40791 7.90253 5.76756 8.26218C6.46485 8.95948 7.43165 9.38994 8.5029 9.38994C9.10581 9.38994 9.66951 9.24305 10.1631 8.98215L10.6889 10.2328C10.0227 10.5624 9.28622 10.7486 8.5029 10.7486C7.16173 10.7486 5.90447 10.203 4.99609 9.29467C4.62719 8.92577 4.32189 8.49643 4.09412 8.02478L4.09411 9.74856L3.09411 9.74856L3.09412 6L4.15743 6Z"/></svg>`;

      // 閸︽澘娼冮弽?
      const addressBar = document.createElement('input');
      addressBar.className = 'cm-video-browser-address';
      addressBar.type = 'text';
      addressBar.value = this.videoInfo.originalUrl;
      addressBar.spellcheck = false;

      // 闂冪粯顒涢崷鏉挎絻閺嶅繘绱堕弽鍥︾皑娴犺泛鍟嬪▔鈽呯礉闂冨弶顒涚憴锕€褰傜紓鏍帆閸ｃ劑鈧瀚?
      addressBar.addEventListener('mousedown', (e) => e.stopPropagation());
      addressBar.addEventListener('mouseup', (e) => e.stopPropagation());
      addressBar.addEventListener('click', (e) => e.stopPropagation());
      addressBar.addEventListener('dblclick', (e) => e.stopPropagation());

      // 闂冪粯顒涢柨顔炬磸娴滃娆㈤崘鎺撳満閿涘矂妲诲?CodeMirror 閹凤附鍩呰箛顐ｅ祹闁?
      addressBar.addEventListener('keydown', (e) => {
        e.stopPropagation();
        // 閸ョ偠婧呯捄瀹犳祮
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

      // 閸︺劌顦婚柈銊︾セ鐟欏牆娅掗幍鎾崇磻
      const externalBtn = document.createElement('span');
      externalBtn.className = 'cm-video-browser-btn';
      externalBtn.title = '在浏览器中打开';
      externalBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

      browserNav.appendChild(backBtn);
      browserNav.appendChild(forwardBtn);
      browserNav.appendChild(refreshBtn);
      browserNav.appendChild(addressBar);
      browserNav.appendChild(externalBtn);

      // 閸旂姾娴囨潻娑樺閺?
      const progressBar = document.createElement('div');
      progressBar.className = 'cm-video-browser-progress';
      const progressInner = document.createElement('div');
      progressInner.className = 'cm-video-browser-progress-inner';
      progressBar.appendChild(progressInner);

      // Webview 鐎圭懓娅?
      const webviewContainer = document.createElement('div');
      webviewContainer.className = 'cm-video-browser-content';

      const webview = document.createElement('webview');
      webview.className = 'cm-video-webview';
      webview.setAttribute('src', this.videoInfo.originalUrl);
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('partition', 'persist:video');

      // 缂佹垵鐣剧€佃壈鍩呮禍瀣╂
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

      // 缂佹垵鐣鹃幐澶愭尦娴滃娆?
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
      // 閸楋紕澧栧Ο鈥崇础 - 閺勫墽銇氱紓鈺冩殣閸ユ儳鎷版穱鈩冧紖
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
    // link 濡€崇础娑撳秵妯夌粈娲杺婢舵牕鍞寸€圭櫢绱濋崣顏呮▔缁€鍝勪紣閸忛攱鐖?

    // 鐎涙ê鍙嗙紓鎾崇摠
    this.domElement = wrapper;
    videoWidgetDomCache.set(this, wrapper);

    return wrapper;
  }

  private showMoreMenu(anchorEl: HTMLElement, wrapperEl: HTMLElement): void {
    // 缁夊娅庡鎻掔摠閸︺劎娈戦懣婊冨礋
    const existingMenu = document.querySelector('.cm-video-more-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 閸掓稑缂撻懣婊冨礋
    const menu = document.createElement('div');
    menu.className = 'cm-video-more-menu';

    const menuItems = [
      { label: '本地视频', action: 'local-video' },
      { label: '在浏览器中打开', action: 'open-external' },
      { label: '复制原始链接', action: 'copy-url' },
      { label: '复制视频块', action: 'copy-block' },
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

    // 閸忓牊鍧婇崝鐘插煂 DOM 娴犮儴骞忛崣鏍綅閸楁洟鐝惔?
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);

    // 鐎规矮缍呴懣婊冨礋
    const rect = anchorEl.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const viewportHeight = window.innerHeight;

    // 濡偓閺屻儲妲搁崥锔跨窗鐡掑懎鍤惔鏇㈠劥
    let top = rect.bottom + 4;
    if (top + menuHeight > viewportHeight - 10) {
      // 閸氭垳绗傞弰鍓с仛
      top = rect.top - menuHeight - 4;
    }

    // 濡偓閺屻儱涔忔笟褌缍呯純?
    let left = rect.right - 140;
    if (left < 10) {
      left = 10;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';

    // 閻愮懓鍤径鏍劥閸忔娊妫撮懣婊冨礋
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
        // 鐟欙箑褰傞張顒€婀寸憴鍡涱暥闁瀚ㄦ禍瀣╂
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
        // 鐟欙箑褰傜粔璇插З娴滃娆?
        window.dispatchEvent(new CustomEvent('video-move-to', {
          detail: { from: this.from, to: this.to, content: this.originalMatch },
        }));
        break;
      case 'delete':
        // 鐟欙箑褰傞崚鐘绘珟娴滃娆?
        window.dispatchEvent(new CustomEvent('video-delete', {
          detail: { from: this.from, to: this.to },
        }));
        break;
    }
  }

  private changeDisplayMode(mode: 'embed' | 'card' | 'link'): void {
    // 闁俺绻冮懛顏勭暰娑斿绨ㄦ禒鍫曗偓姘辩叀缂傛牞绶崳銊︽纯閺傜増鏋冨?
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
      case 'youku': return '浼橀叿';
      case 'qq': return '鑵捐瑙嗛';
      case 'iqiyi': return '爱奇艺';
      case 'xigua': return '瑗跨摐瑙嗛';
      case 'douyin': return '抖音';
      case 'local': return '本地';
      case 'other': return '其他';
      default: return '视频';
    }
  }

  eq(other: VideoWidget): boolean {
    // 閸欘亝鐦潏鍐潒妫版垵鍞寸€圭櫢绱濇稉宥嗙槷鏉堝啩缍呯純顕嗙礉闁灝鍘ら弬鍥ㄣ€傞崣妯哄閺冨爼鍣稿?widget
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
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱鐟欏棝顣剁拠顓熺《楠炶泛鍨卞楦款棅妤楁澘娅?
 * 鐟欏棝顣剁拠顓熺《: ![鐟欏棝顣禲(鐟欏棝顣堕柧鐐复)
 * 閸欘亝婀佽ぐ鎾绘懠閹恒儲妲搁弨顖涘瘮閻ㄥ嫯顫嬫０鎴濋挬閸欑増妞傞幍宥嗚閺屾挷璐熺憴鍡涱暥閹绢厽鏂侀崳?
 */
function parseVideos(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  // 閸栧綊鍘?Markdown 閸ュ墽澧栫拠顓熺《閿涘本鏁幐?http/https 闁剧偓甯撮崪灞炬拱閸︾増鏋冩禒鎯扮熅瀵?
  // 閺堫剙婀寸捄顖氱窞閺嶇厧绱? C:\path\to\file.mp4 閹?file:///path/to/file.mp4
  const videoRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = videoRegex.exec(doc)) !== null) {
    const alt = match[1];
    const url = match[2];
    const from = match.index;
    const to = from + match[0].length;

    // 鐏忔繆鐦憴锝嗙€芥稉楦款潒妫版垿鎽奸幒?
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

  // 閹稿缍呯純顔藉笓鎼?
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 閹绘劕褰囬弬鍥ㄣ€傛稉顓熷閺堝顫嬫０鎴︽懠閹恒儳娈戠粵鎯ф倳閿涘牏鏁ゆ禍搴㈢槷鏉堝啯妲搁崥锕傛付鐟曚線鍣搁弬鎷屝掗弸鎰剁礆
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
 * 鐟欏棝顣剁憗鍛淬偘閸?StateField
 * 娴兼ê瀵查敍姘涧閸︺劏顫嬫０鎴濆敶鐎圭懓褰夐崠鏍ㄦ閹靛秹鍣搁弬鎷屝掗弸鎰剁礉闁灝鍘ゆ０鎴犵畳闁插秴缂?webview
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
    // 婵″倹鐏夐弬鍥ㄣ€傚▽鈩冩箒閸欐ê瀵查敍宀€娲块幒銉ㄧ箲閸ョ偛甯崐?
    if (!tr.docChanged) {
      return value;
    }

    const newDoc = tr.newDoc.toString();
    const newSignature = getVideoSignature(newDoc);

    // 閸欘亝婀佺憴鍡涱暥閸愬懎顔愰崣妯哄閺冭埖澧犻柌宥嗘煀鐟欙絾鐎?
    if (newSignature !== value.signature) {
      return {
        decorations: parseVideos(newDoc),
        signature: newSignature,
      };
    }

    // 鐟欏棝顣堕崘鍛啇閺堫亜褰夐崠鏍电礉鐏忔繆鐦弰鐘茬殸娴ｅ秶鐤?
    // 婵″倹鐏夐弰鐘茬殸婢惰精瑙﹂敍鍫ｎ棅妤楁澘娅掗弫浼村櫤娑?娴ｅ棛顒烽崥宥勭瑝娑撹櫣鈹栭敍澶涚礉闁插秵鏌婄憴锝嗙€?
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
// Markdown 鐞涖劍鐗稿〒鍙夌厠缁崵绮?
// ============================================================================

/**
 * 鐞涖劍鐗搁弫鐗堝祦缂佹挻鐎?
 */
interface TableData {
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  from: number;
  to: number;
}

/**
 * 鐟欙絾鐎?Markdown 鐞涖劍鐗?
 */
function parseMarkdownTable(doc: string): TableData[] {
  const tables: TableData[] = [];
  const lines = doc.split('\n');
  let position = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = position;

    // 濡偓濞村銆冮弽鐓庛仈闁劏顢戦敍鍫濆瘶閸?| 閻ㄥ嫯顢戦敍?
    if (line.includes('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      
      // 濡偓濞村鍨庨梾鏃囶攽閿涘牆瀵橀崥?--- 閸?|閿?
      if (/^\|?\s*:?-+:?\s*\|/.test(nextLine) || /\|\s*:?-+:?\s*\|?$/.test(nextLine)) {
        // 鐟欙絾鐎界悰銊ャ仈
        const headers = parseTableRow(line);
        
        if (headers.length > 0) {
          // 鐟欙絾鐎界€靛綊缍堥弬鐟扮础
          const alignments = parseAlignments(nextLine, headers.length);
          
          // 鐟欙絾鐎介弫鐗堝祦鐞?
          const rows: string[][] = [];
          let j = i + 2;
          // 鐠侊紕鐣荤悰銊︾壐缂佹挻娼担宥囩枂閿涘牆瀵橀崥顐ャ€冩径纾嬵攽閸滃苯鍨庨梾鏃囶攽閸欏﹤鍙鹃幑銏ｎ攽缁楋讣绱?
          let lastLineEnd = lineStart + line.length + 1 + nextLine.length;
          
          while (j < lines.length) {
            const dataLine = lines[j];
            
            // 濡偓濞村妲搁崥锔芥Ц閺傛媽銆冮弽鑲╂畱瀵偓婵绱欐稉瀣╃鐞涘本妲搁崚鍡涙鐞涘矉绱?
            if (j + 1 < lines.length) {
              const potentialSeparator = lines[j + 1];
              if (/^\|?\s*:?-+:?\s*\|/.test(potentialSeparator) || /\|\s*:?-+:?\s*\|?$/.test(potentialSeparator)) {
                // 鏉╂瑦妲搁弬鎷屻€冮弽鑲╂畱鐞涖劌銇旈敍宀€绮ㄩ弶鐔风秼閸撳秷銆冮弽?
                break;
              }
            }
            
            // 濡偓濞村妲搁崥锕佺箷閺勵垵銆冮弽鑹邦攽閿涘牆绻€妞よ瀵橀崥?| 娑撴柧绗夐弰顖溾敄鐞涘矉绱?
            if (!dataLine.includes('|') || dataLine.trim() === '') {
              break;
            }
            const rowData = parseTableRow(dataLine);
            // 婵″倹鐏夌憴锝嗙€介崙铏规畱閺佺増宓佹稉铏光敄閿涘矁鐑︽潻鍥风礄娴ｅ棗鍘戠拋鍛婂閺堝宕熼崗鍐╃壐娑撹櫣鈹栫€涙顑佹稉鑼畱鐞涘矉绱?
            if (rowData.length === 0) {
              break;
            }
            // 绾喕绻氱悰灞炬殶閹诡喕绗岀悰銊ャ仈閸掓鏆熸稉鈧懛?
            while (rowData.length < headers.length) {
              rowData.push('');
            }
            rows.push(rowData.slice(0, headers.length));
            // 閺囧瓨鏌婇張鈧崥搴濈鐞涘瞼娈戠紒鎾存将娴ｅ秶鐤嗛敍鍫濆娑撳﹤澧犳稉鈧悰宀€娈戦幑銏ｎ攽缁楋箑鎷拌ぐ鎾冲鐞涘瞼娈戦梹鍨閿?
            lastLineEnd += 1 + dataLine.length;
            j++;
          }
          
          // 濞ｈ濮炵悰銊︾壐閿涘牆鍘戠拋鍛婄梾閺堝鏆熼幑顔款攽閻ㄥ嫯銆冮弽纭风礆
          tables.push({
            headers,
            alignments,
            rows,
            from: lineStart,
            to: lastLineEnd,
          });
          
          // 鐠哄疇绻冨鎻掝槱閻炲棛娈戠悰?
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
 * 鐟欙絾鐎界悰銊︾壐鐞?
 */
function parseTableRow(line: string): string[] {
  // 缁夊娅庢＃鏍х啲閻?|
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.slice(0, -1);
  }
  
  // 閹?| 閸掑棗澹婇獮鑸电閻炲棛鈹栭弽?
  return trimmed.split('|').map(cell => cell.trim());
}

/**
 * 鐟欙絾鐎界€靛綊缍堥弬鐟扮础
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
 * 鐞涖劍鐗?Widget 缁?- 閻劋绨崷銊х椽鏉堟垵娅掓稉顓熻閺屾挸褰茬憴鍡楀鐞涖劍鐗?
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
    
    // 閸掓稑缂撳銉ュ徔閺?
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-table-toolbar';
    
    // 瀹革缚鏅堕敍姘殶閹诡喖绨遍崥宥囆為崪灞惧潑閸旂姵瀵滈柦?
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
      // 閸︺劌缍嬮崜宥堛€冮弽鐓庢倵閹绘帒鍙嗛弬鎷屻€冮弽鍏寄侀弶?
      const newTableTemplate = '\n\n| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n';
      view.dispatch({
        changes: { from: this.tableData.to, insert: newTableTemplate },
      });
    });
    toolbarLeft.appendChild(addBtn);
    
    toolbar.appendChild(toolbarLeft);
    
    // 閸欏厖鏅堕敍姘辩摣闁鈧焦甯撴惔蹇嬧偓浣虹崶閸欙絾妯夌粈鎭掆偓浣稿灩闂?
    const toolbarRight = document.createElement('div');
    toolbarRight.className = 'cm-table-toolbar-right';
    
    const filterBtn = document.createElement('span');
    filterBtn.className = 'cm-table-toolbar-btn';
    filterBtn.title = '筛选';
    filterBtn.textContent = '筛选';
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囩粵娑⑩偓澶婂閼?
    });
    toolbarRight.appendChild(filterBtn);
    
    const sortBtn = document.createElement('span');
    sortBtn.className = 'cm-table-toolbar-btn';
    sortBtn.title = '排序';
    sortBtn.textContent = '排序';
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囬幒鎺戠碍閸旂喕鍏?
    });
    toolbarRight.appendChild(sortBtn);
    
    const expandBtn = document.createElement('span');
    expandBtn.className = 'cm-table-toolbar-btn';
    expandBtn.title = '展开视图';
    expandBtn.textContent = '展开';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // TODO: 鐎圭偟骞囩粣妤€褰涢弰鍓с仛閸旂喕鍏?
    });
    toolbarRight.appendChild(expandBtn);
    
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'cm-table-toolbar-btn cm-table-toolbar-btn-danger';
    deleteBtn.title = '删除表格';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 閸掔娀娅庣悰銊︾壐閿涘牆瀵橀幏顒€澧犻崥搴″讲閼崇晫娈戠粚楦款攽閿?
      let deleteFrom = this.tableData.from;
      let deleteTo = this.tableData.to;
      
      // 濡偓閺屻儴銆冮弽鐓庢倵閺勵垰鎯侀張澶嬪床鐞涘瞼顑侀敍灞肩楠炶泛鍨归梽?
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
    
    // 閸掓稑缂撳姘З鐎圭懓娅?
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'cm-table-scroll-container';
    
    const table = document.createElement('table');
    table.className = 'cm-markdown-table';
    
    // 閸掓稑缂撶悰銊ャ仈
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
    
    // 閸掓稑缂撶悰銊ょ秼
    const tbody = document.createElement('tbody');
    
    console.log('[TableWidget] 濞撳弶鐓嬮弫鐗堝祦鐞?', this.tableData.rows);
    
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
    
    // 閻愮懓鍤悰銊︾壐閺冩儼鐑︽潪顒€鍩屽┃鎰垳娴ｅ秶鐤?
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
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱鐞涖劍鐗搁獮璺哄灡瀵ら缚顥婃鏉挎珤
 */
function parseTableDecorations(doc: string): DecorationSet {
  const tables = parseMarkdownTable(doc);
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];

  console.log('[parseTableDecorations] 鐟欙絾鐎介崚鎵畱鐞涖劍鐗?', tables.map(t => ({
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

  // 閹稿缍呯純顔藉笓鎼?
  decorations.sort((a, b) => a.from - b.from);

  return RangeSet.of(decorations.map(d => d.decoration.range(d.from, d.to)));
}

/**
 * 鐞涖劍鐗哥憗鍛淬偘閸?StateField
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
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱閺嶅洭顣介獮璺哄灡瀵ら缚顢戠憗鍛淬偘閸?
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
 * 閺嶅洭顣界憗鍛淬偘閸?StateField - 娑撶儤鐖ｆ０妯款攽濞ｈ濮炴稉宥呮倱閻ㄥ嫬鐡ф担鎾炽亣鐏?
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
 * 閺冪姴绨崚妤勩€冮崷鍡欏仯 Widget - 鐏?- * + 閺囨寧宕叉稉鍝勬妇閻愮懓娴橀弽?
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
 * 鐟欙絾鐎介弮鐘茬碍閸掓銆冮獮璺哄灡瀵ら缚顥婃鏉挎珤
 * 鐏?- * + 閺囨寧宕叉稉鍝勬妇閻愮懓娴橀弽?
 */
function parseUnorderedList(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｉ幍鈧崷銊攽
  const cursorLine = state.selection.main.head;
  const currentLineNumber = doc.lineAt(cursorLine).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // 閸栧綊鍘ら弮鐘茬碍閸掓銆冮弽鍥唶閿? * + 閿涘牆澧犻棃銏犲讲娴犮儲婀佺紓鈺勭箻缁岀儤鐗搁敍?
    const match = line.text.match(/^(\s*)([-*+])\s/);
    if (match) {
      // 鐠哄疇绻冨鍛濞撳懎宕熼敍? [ ] 閹?- [x]閿? 閸︺劍顥呴弻銉ュ帨閺嶅洣缍呯純顔荤閸撳秴鍘涘Λ鈧弻?
      // 閸栧綊鍘ら弽鐓庣础閿涙艾褰查柅澶岀級鏉?+ 閸掓銆冮弽鍥唶 + 缁岀儤鐗?+ [ ] 閹?[x]閿涘牆鎮楅棃銏犲讲娴犮儲婀佺粚鐑樼壐閹存牕鍩岀悰灞界啲閿?
      const isTodo = /^[\t ]*[-*+]\s\[[ xX]\](\s|$)/.test(line.text);
      if (isTodo) {
        continue;
      }
      
      // 婵″倹鐏夐崗澶嬬垼閸︺劌缍嬮崜宥堫攽閿涘奔绗夐弴鎸庡床閺嶅洩顔?
      if (i === currentLineNumber) {
        continue;
      }
      
      const indent = match[1].length;
      const markerStart = line.from + indent;
      const markerEnd = markerStart + 1; // 閸欘亝娴涢幑?- * + 缁楋箑褰?
      
      // 闂呮劘妫岄崢鐔奉潗閺嶅洩顔?
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
 * 鐟欙絾鐎界划妞剧秼閺傚洦婀伴獮璺哄灡瀵ら缚顥婃鏉挎珤
 * 閸栧綊鍘?**text** 閹?__text__ 閺嶇厧绱?
 */
function parseBoldText(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｉ幍鈧崷銊攽
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 閸栧綊鍘?**text** 閹?__text__
    const boldRegex = /(\*\*|__)([^*_]+)\1/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const markerLength = match[1].length; // ** 閹?__
      const contentFrom = from + markerLength;
      const contentTo = to - markerLength;

      // 婵″倹鐏夐崗澶嬬垼閸︺劌缍嬮崜宥堫攽閿涘本妯夌粈鍝勫斧婵顕㈠▔?
      if (i === cursorLine) {
        // 閸欘亙璐熼崘鍛啇濞ｈ濮炵划妞剧秼閺嶅嘲绱￠敍灞肩瑝闂呮劘妫岄弽鍥唶
        decorations.push(
          Decoration.mark({ class: 'cm-strong' }).range(contentFrom, contentTo)
        );
      } else {
        // 闂呮劘妫岄崜宥呮倵閻?** 閹?__
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
 * 缁ぞ缍嬬憗鍛淬偘閸?StateField
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
 * 鐟欙絾鐎介弬婊€缍嬮弬鍥ㄦ拱楠炶泛鍨卞楦款棅妤楁澘娅?
 * 閸栧綊鍘?*text* 閹?_text_ 閺嶇厧绱￠敍鍫滅稻娑撳秴灏柊?** 閹?__閿?
 */
function parseItalicText(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｉ幍鈧崷銊攽
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;

    // 閸栧綊鍘?*text* 閹?_text_閿涘牅绲炬稉宥呭爱闁?** 閹?__閿?
    // 娴ｈ法鏁ょ拹鐔锋倻閸撳秶鐏崪宀冪閸氭垵鎮楅惉鑽も€樻穱婵呯瑝閸栧綊鍘ょ划妞剧秼
    const italicRegex = /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)|(?<!_)_(?!_)([^_]+)_(?!_)/g;
    let match;

    while ((match = italicRegex.exec(text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      const content = match[1] || match[2];
      const contentFrom = from + 1;
      const contentTo = to - 1;

      // 婵″倹鐏夐崗澶嬬垼閸︺劌缍嬮崜宥堫攽閿涘本妯夌粈鍝勫斧婵顕㈠▔?
      if (i === cursorLine) {
        decorations.push(
          Decoration.mark({ class: 'cm-em' }).range(contentFrom, contentTo)
        );
      } else {
        // 闂呮劘妫岄崜宥呮倵閻?* 閹?_
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
 * 閺傛粈缍嬬憗鍛淬偘閸?StateField
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
 * 閺冪姴绨崚妤勩€冪憗鍛淬偘閸?StateField - 鐏?- * + 閺囨寧宕叉稉鍝勬妇閻?
 */
const unorderedListDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseUnorderedList(state);
  },
  update(decorations, tr) {
    // 閺傚洦銆傞崣妯哄閹存牕鍘滈弽鍥︾秴缂冾喖褰夐崠鏍ㄦ闁粙娓剁憰浣规纯閺?
    if (tr.docChanged || tr.selection) {
      return parseUnorderedList(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 瀵板懎濮欏〒鍛礋婢跺秹鈧顢?Widget - 鐏?[ ] 閹?[x] 閺囨寧宕叉稉鍝勫讲閻愮懓鍤惃鍕槻闁顢?
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
    
    // 閻愮懓鍤崚鍥ㄥ床閻樿埖鈧?
    checkbox.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 閺囨寧宕查弮鏈电箽閻ｆ瑥鎮楅棃銏㈡畱缁岀儤鐗?
      const newText = this.checked ? '[ ] ' : '[x] ';
      // 娣囨繂鐡ㄨぐ鎾冲闁瀚ㄦ担宥囩枂
      const currentSelection = this.view.state.selection;
      this.view.dispatch({
        changes: { from: this.pos, to: this.pos + this.length, insert: newText },
        // 閹垹顦查崢鐔告降閻ㄥ嫰鈧瀚ㄦ担宥囩枂
        selection: currentSelection
      });
    });
    
    return checkbox;
  }

  eq(other: CheckboxWidget): boolean {
    return this.checked === other.checked && this.pos === other.pos && this.length === other.length;
  }

  ignoreEvent(event: Event): boolean {
    // 閸欘亜顦╅悶?mousedown 娴滃娆㈤敍灞芥嫹閻ｃ儱鍙炬禒鏍︾皑娴?
    return event.type !== 'mousedown';
  }
}

/**
 * 鐟欙絾鐎藉鍛濞撳懎宕熼獮璺哄灡瀵ゅ搫顦查柅澶嬵攱鐟佸懘銈伴崳?
 * 閸栧綊鍘ら弽鐓庣础閿? [ ] 閹?- [x] 閹?閳?[ ] 閹?閳?[x] 閹?1. [ ] 閹?1. [x]閿涘牆鎮楅棃銏犲讲娴犮儲婀佺粚鐑樼壐閹存牕鍩岀悰灞界啲閿?
 */
function parseTodoList(state: EditorState, view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;
  
  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｆ担宥囩枂
  const cursorPos = state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos);
  const cursorLineNumber = cursorLine.number;
  const cursorOffset = cursorPos - cursorLine.from; // 閸忓鐖ｉ崷銊攽閸愬懐娈戦崑蹇曅?

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    
    // 閸栧綊鍘ゅ鍛濞撳懎宕熼敍?
    // 1. 閺冪姴绨崚妤勩€冮弽鐓庣础閿? [ ] 閹?- [x] 閹?閳?[ ] 閹?閳?[x]
    // 2. 閺堝绨崚妤勩€冮弽鐓庣础閿?. [ ] 閹?1. [x]
    const unorderedMatch = text.match(/^([\t ]*)([-*+閳ヮ晝)\s\[([ xX])\](\s|$)/);
    const orderedMatch = text.match(/^([\t ]*)(\d+\.)\s\[([ xX])\](\s|$)/);
    
    const todoMatch = unorderedMatch || orderedMatch;
    if (!todoMatch) continue;
    
    const isOrderedList = !!orderedMatch;
    const indent = todoMatch[1].length;
    const marker = todoMatch[2];
    const isChecked = todoMatch[3].toLowerCase() === 'x';
    
    // 閹垫儳鍩?[ 閻ㄥ嫪缍呯純?
    const bracketIndex = text.indexOf('[');
    if (bracketIndex === -1) continue;
    
    // 鐠侊紕鐣?] 閸氬酣娼扮粚鐑樼壐閻ㄥ嫪缍呯純顕嗙礄閸︺劏顢戦崘鍛畱閸嬪繒些閿?
    const checkboxEndOffset = bracketIndex + 4; // [ ] 閸旂姷鈹栭弽鐓庡彙4娑擃亜鐡х粭?
    
    // 婵″倹鐏夐崗澶嬬垼閸︺劌缍嬮崜宥堫攽閿涘奔绗栭崗澶嬬垼娴ｅ秶鐤嗛崷銊ヮ槻闁顢嬮崠鍝勭厵閸愬懏鍨ㄧ槐褔鍋︽径宥夆偓澶嬵攱閸氬酣娼伴敍灞肩瑝閺勫墽銇氭径宥夆偓澶嬵攱
    if (i === cursorLineNumber && cursorOffset <= checkboxEndOffset) {
      // 婵″倹鐏夐弰顖涙￥鎼村繐鍨悰銊ょ瑬閺嶅洩顔囬弰?閳ヮ澁绱濋弴鎸庡床娑?- 閺勫墽銇?
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
      
      // 婵″倹鐏夊鎻掔暚閹存劧绱濇禒宥囧姧濞ｈ濮為崚鐘绘珟缁炬寧鐗卞?
      if (isChecked) {
        const contentStart = line.from + bracketIndex + 4; // [ ] 閸氬酣娼伴惃鍕敶鐎圭懓绱戞慨瀣╃秴缂?
        if (contentStart < line.to) {
          decorations.push(
            Decoration.mark({ class: 'cm-todo-completed' }).range(contentStart, line.to)
          );
        }
      }
      continue;
    }
    
    const checkboxStart = line.from + bracketIndex;
    // 閺囨寧宕?[ ] 閹?[x] 娴犮儱寮烽崥搴ㄦ桨閻ㄥ嫮鈹栭弽纭风礄閸?娑擃亜鐡х粭锔肩礆
    const checkboxEnd = checkboxStart + 4;
    
    // 婵″倹鐏夐弰顖涙￥鎼村繐鍨悰顭掔礉閺囨寧宕查崚妤勩€冮弽鍥唶娑撳搫娓鹃悙?
    if (!isOrderedList) {
      const markerStart = line.from + indent;
      const markerEnd = markerStart + 1;
      decorations.push(
        Decoration.replace({
          widget: new BulletWidget(indent),
        }).range(markerStart, markerEnd)
      );
    }
    
    // 閺囨寧宕?[ ] 閹?[x] 閸欏﹤鎮楅棃銏㈡畱缁岀儤鐗告稉鍝勵槻闁顢?
    decorations.push(
      Decoration.replace({
        widget: new CheckboxWidget(isChecked, checkboxStart, 4, view),
      }).range(checkboxStart, checkboxEnd)
    );
    
    // 婵″倹鐏夊鎻掔暚閹存劧绱濇稉鍝勫敶鐎硅鍧婇崝鐘插灩闂勩倗鍤庨弽宄扮础
    if (isChecked) {
      const contentStart = checkboxEnd;
      if (contentStart < line.to) {
        decorations.push(
          Decoration.mark({ class: 'cm-todo-completed' }).range(contentStart, line.to)
        );
      }
    }
  }

  // 閹稿缍呯純顔藉笓鎼村繗顥婃鏉挎珤
  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations, true);
}

/**
 * 瀵板懎濮欏〒鍛礋鐟佸懘銈伴崳?ViewPlugin
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
 * 瀵洜鏁ら崸妤冪彨缁?Widget - 閸︺劏顢戞＃鏍ㄦ▔缁€铏圭彨缁?
 */
class BlockquoteBarWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-blockquote-bar-container';
    // 閺嶈宓佸鏇犳暏鐏炲倻楠囬弰鍓с仛婢舵碍娼粩鏍殠
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
 * 瀵洜鏁ら崸?> 缁楋箑褰?Widget - 閺嶈宓侀柅澶夎厬閻樿埖鈧焦妯夌粈?闂呮劘妫?
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
    // 婵绮撻弰鍓с仛 > 缁楋箑褰块崝鐘辩娑擃亞鈹栭弽纭风礉绾喕绻氱€靛綊缍?
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
 * 鐟欙絾鐎藉鏇犳暏閸ф鑻熼崚娑樼紦鐟佸懘銈伴崳?
 * 閸︺劏顢戞＃鏍ㄥ潑閸旂姷鐝痪鍖＄礉閺嶈宓侀崗澶嬬垼娴ｅ秶鐤嗛弰鍓с仛/闂呮劘妫?> 缁楋箑褰?
 * 濞ｈ濮炵悰宀€楠囩憗鍛淬偘閸ｃ劎鈥樻穱婵嗙穿閻劌娼￠崘鍛啇婵绮撻弰鍓с仛閺傛粈缍?
 */
function parseBlockquote(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 閼惧嘲褰囬柅澶婂隘閼煎啫娲?
  const selection = state.selection.main;
  const selectionStartLine = doc.lineAt(selection.from).number;
  const selectionEndLine = doc.lineAt(selection.to).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    // 閸栧綊鍘ゅ鏇犳暏閸ф鐖ｇ拋甯窗閺€顖涘瘮鐞涘矂顩婚張澶屸敄閺嶈偐娈戦幆鍛枌閿涘湵AB 缂傗晞绻橀敍澶涚礉閸栧懏瀚?> 閸氬酣娼伴惃鍕敄閺?
    const match = line.text.match(/^(\s*)(>+)(\s?)/);
    if (match) {
      const indent = match[1].length; // 缂傗晞绻樼粚鐑樼壐閺?
      const level = match[2].length; // 瀵洜鏁ょ仦鍌滈獓
      const markers = match[2]; // > 閹?>> 缁?
      const space = match[3] || ''; // > 閸氬酣娼伴惃鍕敄閺嶇》绱欓崣顖濆厴濞屸剝婀侀敍?
      
      // 閸掋倖鏌囬弰顖氭儊閺勫墽銇?> 缁楋箑褰块敍姘帨閺嶅洤婀ぐ鎾冲鐞涘本鍨ㄩ柅澶婂隘閸栧懎鎯堣ぐ鎾冲鐞?
      const isInSelection = i >= selectionStartLine && i <= selectionEndLine;
      
      // 濞ｈ濮炵悰宀€楠囩憗鍛淬偘閸ｎ煉绱濈涵顔荤箽瀵洜鏁ら崸妤勵攽婵绮撻弰鍓с仛閺傛粈缍?
      decorations.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          class: 'cm-blockquote-line',
        }),
      });
      
      // 閸?> 缁楋箑褰挎担宥囩枂濞ｈ濮炵粩鏍殠 Widget閿涘牐鈧啳妾荤紓鈺勭箻閿?
      decorations.push({
        from: line.from + indent,
        to: line.from + indent,
        decoration: Decoration.widget({
          widget: new BlockquoteBarWidget(level),
          side: -1, // 閸︺劋缍呯純顔间箯娓氀勬▔缁€?
        }),
      });
      
      // 娴ｈ法鏁?replace 鐟佸懘銈伴崳銊︽禌閹?> 缁楋箑褰块崪宀€鈹栭弽闂磋礋 Widget
      // Widget 婵绮撻弰鍓с仛 "> "閿涘牆鐢粚鐑樼壐閿涘绱濈涵顔荤箽鐎靛綊缍?
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
 * 瀵洜鏁ら崸妤勵棅妤楁澘娅?StateField - 鐏?> 閺囨寧宕叉稉铏圭彨缁?
 */
const blockquoteDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseBlockquote(state);
  },
  update(decorations, tr) {
    // 閺傚洦銆傞崣妯哄閹存牕鍘滈弽鍥︾秴缂冾喖褰夐崠鏍ㄦ闁粙娓剁憰浣规纯閺?
    if (tr.docChanged || tr.selection) {
      return parseBlockquote(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 閺€顖涘瘮閻ㄥ嫮绱粙瀣嚔鐟封偓閸掓銆?
 */
const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'scala', 'html', 'css', 'scss', 'less', 'json',
  'xml', 'yaml', 'markdown', 'sql', 'bash', 'shell', 'powershell', 'dockerfile',
  'plaintext', 'text'
];

/**
 * 娴狅絿鐖滅悰宀勭彯娴?Widget - 娴ｈ法鏁?highlight.js 濞撳弶鐓嬮崡鏇☆攽娴狅絿鐖?
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
    // 韫囩晫鏆愭禍瀣╂閿涘矂妲诲銏㈠仯閸戣鍞惍浣稿敶鐎硅妞傛潻娑樺弳閸樼喎顫愰弬鍥ㄦ拱閻樿埖鈧?
    return true;
  }
}

/**
 * 鐞涘苯鍞存禒锝囩垳妤傛ü瀵?Widget - 娴ｈ法鏁?highlight.js 閼奉亜濮╁Λ鈧ù瀣嚔鐟封偓楠炲爼鐝禍?
 */
class InlineCodeWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-code-highlighted cm-inline-code';
    
    // 娴ｈ法鏁?highlight.js 閼奉亜濮╁Λ鈧ù瀣嚔鐟封偓
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
 * 娴狅絿鐖滈崸妞句繆閹垱甯撮崣?
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
 * 鐟欙絾鐎介弬鍥ㄣ€傛稉顓犳畱娴狅絿鐖滈崸?
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

    // 閸栧綊鍘?```language // name 閺嶇厧绱￠敍鍫濈磻婵鐖ｇ拋甯礆
    const startMatch = text.match(/^```(\w*)(\s*\/\/\s*(.*))?$/);
    // 閸栧綊鍘ょ紒鎾存将閺嶅洩顔?```閿涘牆褰查懗鑺ユ箒缁岀儤鐗搁敍?
    const isEndMark = /^```\s*$/.test(text);

    if (!inCodeBlock && startMatch) {
      // 娴狅絿鐖滈崸妤€绱戞慨?
      inCodeBlock = true;
      startLine = i;
      language = startMatch[1] || '';
      customName = startMatch[3] || '';
      codeLines = [];
      blockFrom = line.from;
    } else if (inCodeBlock && isEndMark) {
      // 娴狅絿鐖滈崸妤冪波閺?
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
      // 娴狅絿鐖滈崸妤€鍞寸€?
      codeLines.push(text);
    }
  }

  return blocks;
}

/** 娴狅絿鐖滈崸妤勭翻閸戣櫣濮搁幀浣哥摠閸岊煉绱欓幐澶夊敩閻礁娼℃担宥囩枂缁便垹绱╅敍?*/
interface CodeBlockOutputState {
  content: string;
  isError: boolean;
  isClosed: boolean;
}
const codeBlockOutputStates = new Map<number, CodeBlockOutputState>();

/**
 * 鐎瑰本鏆ｆ禒锝囩垳閸?Widget - 鐏忓棙鏆ｆ稉顏冨敩閻礁娼″〒鍙夌厠娑撹桨绔存稉顏勫幢閻楀洨绮嶆禒?
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
    
    // 娴?Store 閹垹顦查悩鑸碘偓?
    const savedState = useCodeBlockStore.getState().getBlockState(this.block.language, this.block.code);
    this.isCollapsed = savedState.isCollapsed;
    
    const container = document.createElement('div');
    container.className = 'cm-code-block-widget';
    this.containerElement = container;

    // 娴狅絿鐖滈崠鍝勭厵閿涘牆鐢悰灞藉娇閿? 閸忓牆鍨卞杞颁簰閼惧嘲褰?monacoContainer 瀵洜鏁?
    const codeArea = this.createCodeArea(view);
    this.codeAreaElement = codeArea;

    // 婢舵挳鍎?- 閸氬骸鍨卞杞颁簰娓氳儻顔栭梻?monacoContainer
    const header = this.createHeader(view);
    this.headerElement = header;
    container.appendChild(header);

    // 娴狅絿鐖滈崠鍝勭厵閿涘牆鐢悰灞藉娇閿?
    container.appendChild(codeArea);
    
    // 閹垹顦查幎妯哄綌閻樿埖鈧?
    if (this.isCollapsed) {
      container.classList.add('collapsed');
      if (this.collapseBtnElement) {
        this.collapseBtnElement.style.transform = 'rotate(0deg)';
        this.collapseBtnElement.title = '展开代码';
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

    // 瀹革缚鏅堕崠鍝勭厵閿涙碍濮岄崣鐘殿唲婢?+ 閸氬秶袨鏉堟挸鍙嗗?
    const leftSection = document.createElement('div');
    leftSection.className = 'cm-code-block-header-left';

    // 閹舵ê褰旂粻顓炪仈
    const collapseBtn = document.createElement('span');
    collapseBtn.className = 'cm-code-block-collapse-btn';
    collapseBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg>';
    collapseBtn.style.transform = 'rotate(90deg)';
    collapseBtn.title = '折叠代码';
    this.collapseBtnElement = collapseBtn;

    // 閹舵ê褰旈悙鐟板毊娴滃娆?
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    // 閸氬秶袨鏉堟挸鍙嗗?
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cm-code-block-name-input';
    nameInput.placeholder = '输入代码块名称（可选）';
    
    // 娴?Store 閹垹顦查崥宥囆為敍灞筋洤閺嬫粍鐥呴張澶婂灟娴ｈ法鏁ら弬鍥ㄣ€傛稉顓犳畱閸氬秶袨
    const savedState = useCodeBlockStore.getState().getBlockState(this.block.language, this.block.code);
    const displayName = savedState.name || this.block.customName;
    nameInput.value = displayName;
    const originalName = displayName;
    
    nameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      
      // 婢跺嫮鎮婄悮?Electron 閼挎粌宕熼幏锔藉焻閻ㄥ嫬鎻╅幑鐑芥暛
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (isCtrlOrMeta) {
        const key = e.key.toLowerCase();
        if (key === 'x' || key === 'c' || key === 'v' || key === 'a' || key === 'z') {
          // 闂冪粯顒涙禍瀣╂閸愭帗鍦洪崪宀勭帛鐠併倛顢戞稉?
          e.stopImmediatePropagation();
          e.preventDefault();
          
          const input = nameInput;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          const selectedText = input.value.substring(start, end);
          
          if (key === 'x' && selectedText) {
            // 閸擃亜鍨忛敍姘槻閸掑爼鈧鑵戦弬鍥ㄦ拱閸掓澘澹€鐠愬瓨婢橀敍宀€鍔ч崥搴″灩闂?
            navigator.clipboard.writeText(selectedText).then(() => {
              input.value = input.value.substring(0, start) + input.value.substring(end);
              input.setSelectionRange(start, start);
            });
          } else if (key === 'c' && selectedText) {
            // 婢跺秴鍩楅敍姘槻閸掑爼鈧鑵戦弬鍥ㄦ拱閸掓澘澹€鐠愬瓨婢?
            navigator.clipboard.writeText(selectedText);
          } else if (key === 'v') {
            // 缁鍒涢敍姘矤閸擃亣鍒涢弶鑳嚢閸欐牕鑻熼幓鎺戝弳
            navigator.clipboard.readText().then((text) => {
              input.value = input.value.substring(0, start) + text + input.value.substring(end);
              const newPos = start + text.length;
              input.setSelectionRange(newPos, newPos);
            });
          } else if (key === 'a') {
            // 閸忋劑鈧?
            input.select();
          } else if (key === 'z') {
            // 閹俱倝鏀?- 娴ｈ法鏁?execCommand 閸ョ姳璐熷▽鈩冩箒閸忔湹绮弬鐟扮础
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
      // 閸欘亝婀佽ぐ鎾虫倳缁夋壆婀″锝嗘暭閸欐ɑ妞傞幍宥勭箽鐎涙ê鍩?Store
      // 娑撳秷袝閸欐垶鏋冨锝嗘纯閺傚府绱濋柆鍨帳 CodeMirror 閸愬懘鍎撮柨娆掝嚖
      // 閸氬秶袨娴兼艾婀弬鍥ㄣ€傛穱婵嗙摠閺冭泛鎮撳銉ュ煂閺傚洣娆㈤崘鍛啇
      const newName = nameInput.value;
      if (newName !== originalName) {
        useCodeBlockStore.getState().setBlockName(this.block.language, this.block.code, this.block.from, newName);
      }
    });

    leftSection.appendChild(collapseBtn);
    leftSection.appendChild(nameInput);

    // 閸欏厖鏅堕崠鍝勭厵
    const rightSection = document.createElement('div');
    rightSection.className = 'cm-code-block-header-right';

    // 娴?Store 閹垹顦茬拠顓♀枅閿涘牆顩ч弸婊勬箒娣囨繂鐡ㄩ惃鍕樈閿?
    const savedLangState = useCodeBlockStore.getState().getBlockState(this.block.language, this.block.code);
    const displayLanguage = savedLangState.language !== 'plaintext' ? savedLangState.language : (this.block.language || 'plaintext');

    // 鐠囶叀鈻堥柅澶嬪
    const langDropdown = this.createDropdown(view, displayLanguage, SUPPORTED_LANGUAGES, (lang) => this.updateLanguage(view, lang), '选择语言...');

    // 閸掑棝娈х粭?
    const divider1 = document.createElement('span');
    divider1.className = 'cm-code-block-divider';

    // 娑撳顣介柅澶嬪 - 閸欘亝娲块弬鏉跨秼閸撳秳鍞惍浣告健娑撳顣?
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
          // 閺囧瓨鏌?Monaco 缂傛牞绶崳銊ゅ瘜妫?
          updateMonacoTheme(this.monacoContainer, theme.id);

          // 閼惧嘲褰囨稉濠氼暯妫版粏澹婇獮鑸垫纯閺傜増鐗卞?
          const themeData = await themeService.getTheme(theme.id);
          if (themeData) {
            const bgColor = themeData.colors['editor.background'] || themeData.colors['editorWidget.background'];
            const borderColor = themeData.colors['panel.border'] || themeData.colors['editorWidget.border'];
            const fgColor = themeData.colors['editor.foreground'] || themeData.colors['foreground'];

            // 閺囧瓨鏌婃径鎾劥閺嶅嘲绱?
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

              // 閺囧瓨鏌婃径鎾劥閸愬懏澧嶉張澶夌瑓閹峰顢嬬憴锕€褰傞崳銊ф畱閺嶅嘲绱?
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

              // 閺囧瓨鏌婃径鎾劥閸愬懏澧嶉張澶嬪瘻闁筋喚娈戦弽宄扮础
              const actionBtns = this.headerElement.querySelectorAll('.cm-code-block-action-btn');
              actionBtns.forEach((btn) => {
                if (fgColor) {
                  (btn as HTMLElement).style.color = fgColor;
                }
              });

              // 閺囧瓨鏌婇崚鍡涙缁楋附鐗卞?
              const dividers = this.headerElement.querySelectorAll('.cm-code-block-divider');
              dividers.forEach((divider) => {
                if (borderColor) {
                  (divider as HTMLElement).style.backgroundColor = borderColor;
                }
              });
            }

            // 閺囧瓨鏌婇弫缈犻嚋鐎圭懓娅掗惃鍕珶濡?
            if (this.containerElement && borderColor) {
              this.containerElement.style.borderColor = borderColor;
            }

            // 閺囧瓨鏌婃潏鎾冲毉闂堛垺婢橀弽宄扮础
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
          
          // 娣囨繂鐡ㄦ稉濠氼暯閸?Store
          useCodeBlockStore.getState().setBlockTheme(this.block.language, this.block.code, theme.id);
        }
      },
      '选择主题...'
    );

    // 閸掑棝娈х粭?
    const divider2 = document.createElement('span');
    divider2.className = 'cm-code-block-divider';

    // 婢跺秴鍩楅幐澶愭尦
    const copyBtn = document.createElement('span');
    copyBtn.className = 'cm-code-block-action-btn';
    copyBtn.title = '复制代码';
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></svg>';
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(this.block.code));

    // 鏉╂劘顢戦幐澶愭尦
    const runBtn = document.createElement('span');
    runBtn.className = 'cm-code-block-action-btn';
    runBtn.title = '运行代码';
    runBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/><circle cx="12" cy="12" r="10"/></svg>';
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.runCode();
    });

    // 閺囨潙顦块懣婊冨礋
    const moreBtn = document.createElement('span');
    moreBtn.className = 'cm-code-block-action-btn';
    moreBtn.title = '更多操作';
    moreBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';

    // 閸掔娀娅庨幐澶愭尦
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

    // 缁備胶鏁ゆ禒锝囩垳閸ф灏崺鐔烘畱閸欐娊鏁懣婊冨礋
    codeArea.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // 闂冪粯顒涢柨顔炬磸娴滃娆㈤崘鎺撳満閸?CodeMirror
    codeArea.addEventListener('keydown', (e) => {
      e.stopPropagation();
    }, false);

    const blockInfo = this.block;
    const lang = this.block.language || 'plaintext';
    const initialCode = this.block.code || '';

    // Monaco Editor 鐎圭懓娅?
    const monacoContainer = document.createElement('div');
    monacoContainer.className = 'cm-code-block-monaco-container';
    this.monacoContainer = monacoContainer;

    // 閺囧瓨鏌婂┃鎰垳閺嶅洩顔?
    let isUpdating = false;

    const updateSource = (newCode: string) => {
      if (isUpdating) return;

      // 妤犲矁鐦夌紓鏍帆閸ｃ劍妲搁崥锔跨矝閻掕埖婀侀弫?
      if (!view.dom || !view.dom.isConnected) {
        return;
      }

      isUpdating = true;

      try {
        const docLength = view.state.doc.length;

        // 妤犲矁鐦夌挧宄邦潗娴ｅ秶鐤嗛弰顖氭儊閺堝鏅?
        if (blockInfo.from >= docLength) {
          isUpdating = false;
          return;
        }

        const startLine = view.state.doc.lineAt(blockInfo.from);

        // 妤犲矁鐦夌挧宄邦潗鐞涘本妲搁崥锔跨矝閻掕埖妲告禒锝囩垳閸ф绱戞慨瀣垼鐠?
        if (!startLine.text.startsWith('```')) {
          isUpdating = false;
          return;
        }

        // 娴犲氦鎹ｆ慨瀣攽瀵偓婵绱濋弻銉﹀娴狅絿鐖滈崸妤冩畱鐎圭偤妾紒鎾存将娴ｅ秶鐤?
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

        // 閺嬪嫬缂撻弬鎵畱娴狅絿鐖滈崸妤佹瀮閺?
        const langLine = startLine.text;
        const newCodeBlock = langLine + '\n' + newCode + '\n```';

        view.dispatch({
          changes: { from: startLine.from, to: endPos, insert: newCodeBlock }
        });

        isUpdating = false;
      } catch (e) {
        console.error('閺囧瓨鏌婃禒锝囩垳閸ф銇戠拹?', e);
        isUpdating = false;
      }
    };

    // 瀵ゆ儼绻滃〒鍙夌厠 Monaco閿涘矂浼╅崗宥夋▎婵?
    let pendingCode: string | null = null;
    const blockLanguage = this.block.language;
    const blockCode = this.block.code;

    requestAnimationFrame(() => {
      if (!monacoContainer.isConnected) return;

      // 娴?Store 閼惧嘲褰囨穱婵嗙摠閻ㄥ嫮濮搁幀渚婄礄閸栧懏瀚姘З娴ｅ秶鐤嗛敍?
      const savedState = useCodeBlockStore.getState().getBlockState(blockLanguage, blockCode);
      console.log('[CodeMirrorEditor] 娴?Store 閼惧嘲褰囧姘З娴ｅ秶鐤?', savedState.scrollTop);

      renderMonacoToElement(monacoContainer, {
        code: initialCode,
        language: lang,
        onChange: (value: string) => {
          // 閸欘亣顔囪ぐ鏇熸付閺傛壆娈戞禒锝囩垳閿涘奔绗夌粩瀣祮閺囧瓨鏌婂┃鎰垳
          pendingCode = value;
        },
        onFocus: () => {
          // 闂冪粯顒?CodeMirror 閼惧嘲褰囬悞锔惧仯
        },
        onBlur: () => {
          // 婢跺崬骞撻悞锔惧仯閺冭埖澧犻弴瀛樻煀濠ф劗鐖?
          if (pendingCode !== null && pendingCode !== initialCode) {
            const codeToUpdate = pendingCode;
            pendingCode = null;
            // 娴ｈ法鏁?setTimeout 绾喕绻氶崷?CodeMirror 鐎瑰本鍨氳ぐ鎾冲閺囧瓨鏌婇崥搴″晙閹笛嗩攽
            setTimeout(() => {
              // 閸愬秵顐兼宀冪槈缂傛牞绶崳銊︽Ц閸氾附婀侀弫?
              if (view.dom && view.dom.isConnected) {
                try {
                  updateSource(codeToUpdate);
                } catch (e) {
                  console.warn('閺囧瓨鏌婃禒锝囩垳閸ф銇戠拹銉礉閸欘垵鍏橀弰顖滅椽鏉堟垵娅掗悩鑸碘偓浣稿嚒閺€鐟板綁:', e);
                }
              }
            }, 50);
          } else {
            pendingCode = null;
          }
        },
        onEditorMount: (editorInstance) => {
          // 閻╂垵鎯夊姘З娴滃娆㈤敍灞界杽閺冩湹绻氱€涙ɑ绮撮崝銊ょ秴缂冾喖鍩?Store
          editorInstance.onDidScrollChange(() => {
            const scrollTop = editorInstance.getScrollTop();
            useCodeBlockStore.getState().setBlockScrollPosition(blockLanguage, blockCode, scrollTop, null);
          });
        },
        minHeight: 60,
        maxHeight: 800,
        initialScrollTop: savedState.scrollTop
      });
      
      // 娴?Store 閹垹顦叉稉濠氼暯
      if (savedState.themeId && monacoContainer) {
        updateMonacoTheme(monacoContainer, savedState.themeId);
        // 閸氬本妞傞弴瀛樻煀婢舵挳鍎撮弽宄扮础
        this.applyThemeToHeader(savedState.themeId);
      }
    });

    codeArea.appendChild(monacoContainer);

    return codeArea;
  }

  createDropdown(view: EditorView, currentValue: string, options: string[], onChange: (value: string) => void, searchPlaceholder: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-code-block-dropdown';

    // 鐠虹喕閲滆ぐ鎾冲闁鑵戦惃鍕偓?
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

    // 鐏忓棜褰嶉崡鏇熻閺屾挸鍩?body 鐏炲倻楠囬敍宀勪缉閸忓秷顫﹂悥璺哄帗缁辩姾顥嗛崜?
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

    // 閺囧瓨鏌婇懣婊冨礋娴ｅ秶鐤?
    const updateMenuPosition = () => {
      const rect = trigger.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.right - menu.offsetWidth}px`;
    };

    // 闂呮劘妫岄懣婊冨礋
    const hideMenu = () => {
      menu.style.display = 'none';
      container.classList.remove('open');
      if (menu.parentNode === document.body) {
        document.body.removeChild(menu);
      }
    };

    // 閺勫墽銇氶懣婊冨礋
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

    // 濠婃艾濮╅弮鑸垫纯閺傛媽褰嶉崡鏇氱秴缂冾喗鍨ㄩ崗鎶芥４
    const handleScroll = (e: Event) => {
      if (menu.style.display !== 'none') {
        // 濡偓閺屻儴袝閸欐垵娅掗弰顖氭儊娴犲秴婀憴鍡楀經閸?
        const rect = trigger.getBoundingClientRect();
        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;

        if (isInViewport) {
          // 閺囧瓨鏌婇懣婊冨礋娴ｅ秶鐤?
          updateMenuPosition();
        } else {
          // 鐟欙箑褰傞崳銊ょ瑝閸︺劏顫嬮崣锝呭敶閿涘苯鍙ч梻顓″綅閸?
          hideMenu();
        }
      }
    };

    // 閻╂垵鎯夐幍鈧張澶嬬泊閸斻劋绨ㄦ禒璁圭礄閸栧懏瀚紓鏍帆閸ｃ劌鍞撮柈銊︾泊閸旑煉绱?
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    container.appendChild(trigger);
    return container;
  }

  updateLanguage(_view: EditorView, newLang: string): void {
    // 閺囧瓨鏌?Store 娑擃厾娈戠拠顓♀枅閻樿埖鈧?
    useCodeBlockStore.getState().setBlockLanguage(this.block.language, this.block.code, newLang);
    
    // 閺囧瓨鏌?Monaco 缂傛牞绶崳銊ф畱鐠囶叀鈻堥弰鍓с仛
    if (this.monacoContainer) {
      updateMonacoLanguage(this.monacoContainer, newLang);
    }
  }

  // 閸掑洦宕查幎妯哄綌閻樿埖鈧?
  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    
    // 娣囨繂鐡ㄩ幎妯哄綌閻樿埖鈧礁鍩?Store
    useCodeBlockStore.getState().setBlockCollapsed(this.block.language, this.block.code, this.isCollapsed);
    
    const blockKey = this.block.from;
    const savedState = codeBlockOutputStates.get(blockKey);

    if (this.codeAreaElement && this.collapseBtnElement) {
      if (this.isCollapsed) {
        // 閹舵ê褰旈敍姘舵閽樺繋鍞惍浣稿隘閸╃喎鎷版潏鎾冲毉闂堛垺婢?
        this.codeAreaElement.style.display = 'none';
        if (this.outputPanelElement) {
          this.outputPanelElement.style.display = 'none';
        }
        this.collapseBtnElement.style.transform = 'rotate(0deg)';
        this.collapseBtnElement.title = '展开代码';
        this.containerElement?.classList.add('collapsed');
      } else {
        // 鐏炴洖绱戦敍姘▔缁€杞板敩閻礁灏崺鐕傜礉婵″倹鐏夐張澶庣翻閸戣桨绗栭張顏囶潶閸忔娊妫撮崚娆愭▔缁€楦跨翻閸戞椽娼伴弶?
        this.codeAreaElement.style.display = 'block';
        if (this.outputPanelElement && savedState && !savedState.isClosed) {
          this.outputPanelElement.style.display = 'block';
        }
        this.collapseBtnElement.style.transform = 'rotate(90deg)';
        this.collapseBtnElement.title = '折叠代码';
        this.containerElement?.classList.remove('collapsed');
      }
    }
  }

  // 鎼存梻鏁ゆ稉濠氼暯閸掓澘銇旈柈銊︾壉瀵?
  async applyThemeToHeader(themeId: string): Promise<void> {
    const themeData = await themeService.getTheme(themeId);
    if (!themeData) return;
    
    const bgColor = themeData.colors['editor.background'] || themeData.colors['editorWidget.background'];
    const borderColor = themeData.colors['panel.border'] || themeData.colors['editorWidget.border'];
    const fgColor = themeData.colors['editor.foreground'] || themeData.colors['foreground'];

    // 閺囧瓨鏌婃径鎾劥閺嶅嘲绱?
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

      // 閺囧瓨鏌婃径鎾劥閸愬懏澧嶉張澶夌瑓閹峰顢嬬憴锕€褰傞崳銊ф畱閺嶅嘲绱?
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

      // 閺囧瓨鏌婃径鎾劥閸愬懏澧嶉張澶嬪瘻闁筋喚娈戦弽宄扮础
      const actionBtns = this.headerElement.querySelectorAll('.cm-code-block-action-btn');
      actionBtns.forEach((btn) => {
        if (fgColor) {
          (btn as HTMLElement).style.color = fgColor;
        }
      });

      // 閺囧瓨鏌婇崚鍡涙缁楋附鐗卞?
      const dividers = this.headerElement.querySelectorAll('.cm-code-block-divider');
      dividers.forEach((divider) => {
        if (borderColor) {
          (divider as HTMLElement).style.backgroundColor = borderColor;
        }
      });
    }

    // 閺囧瓨鏌婇弫缈犻嚋鐎圭懓娅掗惃鍕珶濡?
    if (this.containerElement && borderColor) {
      this.containerElement.style.borderColor = borderColor;
    }

    // 閺囧瓨鏌婃潏鎾冲毉闂堛垺婢橀弽宄扮础
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

  // 閸掔娀娅庢禒锝囩垳閸?
  deleteCodeBlock(view: EditorView): void {
    try {
      if (!view.dom || !view.dom.isConnected) return;
      if (this.block.from > view.state.doc.length) return;

      // 閸掔娀娅庨弫缈犻嚋娴狅絿鐖滈崸妤嬬礄娴犲骸绱戞慨瀣垼鐠佹澘鍩岀紒鎾存将閺嶅洩顔囬敍?
      view.dispatch({
        changes: { from: this.block.from, to: this.block.to }
      });
    } catch (e) {
      console.error('閸掔娀娅庢禒锝囩垳閸ф銇戠拹?', e);
    }
  }

  // 鏉╂劘顢戞禒锝囩垳
  async runCode(): Promise<void> {
    const language = this.block.language || 'plaintext';
    
    // 濡偓閺屻儴顕㈢懛鈧弰顖氭儊閺€顖涘瘮鏉╂劘顢?
    if (!codeRunnerService.isSupportedLanguage(language)) {
      this.showOutput(`暂不支持 ${language} 代码运行`, true);
      return;
    }

    // 閼惧嘲褰囪ぐ鎾冲娴狅絿鐖?
    const code = this.block.code;
    if (!code.trim()) {
      this.showOutput('代码为空', true);
      return;
    }

    // 閺勫墽銇氭潻鎰攽娑擃厾濮搁幀?
    this.showOutput('运行中...', false, true);

    try {
      const result = await codeRunnerService.runCode({
        code,
        language: language as SupportedLanguage,
        timeout: 30000
      });

      if (result.success) {
        const output = result.stdout || '(无输出)';
        this.showOutput(output, false);
      } else {
        const errorMsg = result.error || result.stderr || '运行失败';
        this.showOutput(errorMsg, true);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.showOutput(errorMsg, true);
    }
  }

  // 閺勫墽銇氭潏鎾冲毉闂堛垺婢?
  private showOutput(content: string, isError: boolean, isLoading = false): void {
    if (!this.containerElement) return;

    const blockKey = this.block.from;
    const savedState = codeBlockOutputStates.get(blockKey);

    // 婵″倹鐏夐悽銊﹀煕瀹告彃鍙ч梻顓＄翻閸戞椽娼伴弶澶哥瑬娑撳秵妲搁弬鎵畱鏉╂劘顢戠拠閿嬬湴閿涘潤oading閿涘绱濋崚娆庣瑝閺勫墽銇?
    if (savedState?.isClosed && !isLoading) return;

    // 閺傛壆娈戞潻鎰攽鐠囬攱鐪伴弮鍫曞櫢缂冾喖鍙ч梻顓犲Ц閹?
    if (isLoading) {
      codeBlockOutputStates.set(blockKey, {
        content: '',
        isError: false,
        isClosed: false
      });
    }

    // 娣囨繂鐡ㄦ潏鎾冲毉閸愬懎顔愰敍鍫ユ姜 loading 閻樿埖鈧焦妞傞敍?
    if (!isLoading) {
      codeBlockOutputStates.set(blockKey, {
        content,
        isError,
        isClosed: false
      });
    }

    // 閺屻儲澹橀幋鏍у灡瀵ら缚绶崙娲桨閺?
    let outputPanel = this.containerElement.querySelector('.cm-code-block-output') as HTMLElement;
    
    if (!outputPanel) {
      outputPanel = document.createElement('div');
      outputPanel.className = 'cm-code-block-output';
      this.containerElement.appendChild(outputPanel);
    }
    this.outputPanelElement = outputPanel;

    // 濞撳懐鈹栭獮鎯邦啎缂冾喖鍞寸€?
    outputPanel.innerHTML = '';
    
    // 鏉堟挸鍤径鎾劥
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
    
    // 鏉堟挸鍤崘鍛啇
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

  // Widget 闁库偓濮ｄ焦妞傛穱婵嗙摠濠婃艾濮╂担宥囩枂
  destroy(): void {
    // 娣囨繂鐡?Monaco 缂傛牞绶崳銊ф畱濠婃艾濮╂担宥囩枂閸?Store
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
      // 閸楁瓕娴?Monaco 缂傛牞绶崳?
      unmountMonacoFromElement(this.monacoContainer);
    }
  }

  eq(other: CodeBlockWidget): boolean {
    // 娑撳秵鐦潏?from 娴ｅ秶鐤嗛敍灞芥礈娑撳搫婀禒锝囩垳閸фぞ绗傞弬瑙勫絻閸忋儱鍞寸€硅妞傛担宥囩枂娴兼艾褰夐崠?
    // 閸欘亝鐦潏鍐嚔鐟封偓閸滃奔鍞惍浣稿敶鐎圭櫢绱濇潻娆愮壉閸欘垯浜掗柆鍨帳娴ｅ秶鐤嗛崣妯哄鐎佃壈鍤ч惃?Widget 闁插秴缂?
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
 * 鐟欙絾鐎芥禒锝囩垳閸ф鑻熼崚娑樼紦鐟佸懘銈伴崳?
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
 * 娴狅絿鐖滈崸妤勵棅妤楁澘娅?StateField
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
 * 閸掑棗澹婄痪?Widget - 鐏?--- 閹?*** 閹?___ 濞撳弶鐓嬫稉鐑樻寜楠炲啿鍨庨崜鑼殠
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
 * 鐟欙絾鐎介崚鍡楀缁惧灝鑻熼崚娑樼紦鐟佸懘銈伴崳?
 * 閸栧綊鍘ら悪顒傜彌鐞涘瞼娈?---閵?**閵嗕耿__ 閿涘牐鍤︾亸?娑擃亜鐡х粭锔肩礆
 */
function parseHorizontalRules(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｉ幍鈧崷銊攽
  const cursorLine = doc.lineAt(state.selection.main.head).number;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text.trim();

    // 閸栧綊鍘?---閵?**閵嗕耿__ 閿涘牐鍤︾亸?娑擃亞娴夐崥灞界摟缁楋讣绱濋崣顖欎簰閺堝鈹栭弽纭风礆
    if (/^[-]{3,}$|^[*]{3,}$|^[_]{3,}$/.test(text)) {
      // 婵″倹鐏夐崗澶嬬垼閸︺劌缍嬮崜宥堫攽閿涘本妯夌粈鍝勫斧婵鏋冮張?
      if (i === cursorLine) {
        continue;
      }

      // 閻?Widget 閺囨寧宕查弫纾嬵攽閸愬懎顔?
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
 * 閸掑棗澹婄痪鑳棅妤楁澘娅?StateField
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
 * 鐟欙絾鐎介弽鍥暯鐠囶厽纭堕獮璺哄灡瀵ゆ椽娈ｉ挊蹇氼棅妤楁澘娅掗敍鍫熺爱閻焦膩瀵繋绗呴惃鍕鐟欎礁宓嗛幍鈧妤嬬礆
 * 瑜版挸鍘滈弽鍥︾瑝閸︺劍鐖ｆ０妯款攽閺冭绱濋梾鎰 # 缁楋箑褰?
 * 婵″倹鐏夐弽鍥暯鐞涘本鐥呴張澶婂敶鐎圭櫢绱欓崣顏呮箒 # 缁楋箑褰块敍澶涚礉娑撳秹娈ｉ挊?
 */
function parseHeadingSyntaxHide(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc;
  
  // 閼惧嘲褰囪ぐ鎾冲閸忓鐖ｉ幍鈧崷銊攽
  const cursorLine = state.selection.main.head;
  const currentLineNumber = doc.lineAt(cursorLine).number;
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const match = line.text.match(/^(#{1,6})\s/);
    if (match) {
      // 婵″倹鐏夐崗澶嬬垼閸︺劌缍嬮崜宥嗙垼妫版顢戦敍灞肩瑝闂呮劘妫?# 缁楋箑褰?
      if (i === currentLineNumber) {
        continue;
      }
      
      // 婵″倹鐏夐弽鍥暯鐞涘本鐥呴張澶婂敶鐎圭櫢绱欓崣顏呮箒 # 缁楋箑褰块崪宀€鈹栭弽纭风礆閿涘奔绗夐梾鎰
      const content = line.text.slice(match[0].length);
      if (content.trim().length === 0) {
        continue;
      }
      
      // 闂呮劘妫?# 缁楋箑褰块崪灞芥倵闂堛垻娈戠粚鐑樼壐
      const from = line.from;
      const to = from + match[1].length + 1; // 閸栧懏瀚粚鐑樼壐
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
 * 閺嶅洭顣界拠顓熺《闂呮劘妫岀憗鍛淬偘閸?StateField閿涘牊绨惍浣鼓佸蹇庣瑓閻ㄥ嫭澧嶇憴浣稿祮閹碘偓瀵版绱?
 */
const headingSyntaxHideDecorations = StateField.define<DecorationSet>({
  create(state) {
    return parseHeadingSyntaxHide(state);
  },
  update(decorations, tr) {
    // 閺傚洦銆傞崣妯哄閹存牕鍘滈弽鍥︾秴缂冾喖褰夐崠鏍ㄦ闁粙娓剁憰浣规纯閺?
    if (tr.docChanged || tr.selection) {
      return parseHeadingSyntaxHide(tr.state);
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 鐟欙絾鐎界悰灞藉敶娴狅絿鐖滈獮璺哄灡瀵ゆ椽鐝禍顔款棅妤楁澘娅掗敍鍫熺爱閻焦膩瀵骏绱?
 */
function parseInlineCodeHighlight(state: EditorState): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  const doc = state.doc.toString();
  const docLength = doc.length;
  const cursorPos = state.selection.main.head;
  
  // 匹配行内代码片段，例如 `code`
  const codeRegex = /`([^`\n]+)`/g;
  let match;
  
  while ((match = codeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const endTo = startFrom + match[0].length;
    
    // 鏉堝湱鏅Λ鈧弻?
    if (endTo > docLength) continue;
    
    // 鐠哄疇绻冩禒锝囩垳閸ф娈?``` 閺嶅洩顔?
    if (startFrom > 0 && doc[startFrom - 1] === '`') continue;
    if (endTo < docLength && doc[endTo] === '`') continue;
    
    const startTo = startFrom + 1;
    const contentFrom = startTo;
    const contentTo = endTo - 1;
    const endFrom = contentTo;
    const codeContent = match[1];
    
    // 婵″倹鐏夐崗澶嬬垼閸︺劏绻栨稉顏囶攽閸愬懍鍞惍浣藉瘱閸ユ潙鍞撮敍灞炬▔缁€鍝勫斧婵顕㈠▔?
    if (cursorPos >= startFrom && cursorPos <= endTo) {
      continue;
    }
    
    // 绾喕绻氶懠鍐ㄦ纯閺堝鏅?
    if (contentFrom >= contentTo) continue;
    
    // 闂呮劘妫岄崜宥夋桨閻?`
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 閻?Widget 閺囨寧宕叉禒锝囩垳閸愬懎顔愭禒銉ョ杽閻滄媽顕㈠▔鏇㈢彯娴?
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.replace({
        widget: new InlineCodeWidget(codeContent)
      }),
    });
    // 闂呮劘妫岄崥搴ㄦ桨閻?`
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 閹稿缍呯純顔藉笓鎼?
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * 鐞涘苯鍞存禒锝囩垳妤傛ü瀵掔憗鍛淬偘閸?StateField閿涘牊绨惍浣鼓佸蹇ョ礆
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
 * 鐟欙絾鐎?Markdown 鐠囶厽纭堕獮璺哄灡瀵ゆ椽娈ｉ挊蹇氼棅妤楁澘娅掗敍鍫ヮ暕鐟欏牊膩瀵骏绱?
 */
function parseMarkdownSyntax(doc: string): DecorationSet {
  const decorations: { from: number; to: number; decoration: Decoration }[] = [];
  
  // 闂呮劘妫岄弽鍥暯閻?# 缁楋箑褰?
  const headingRegex = /^(#{1,6})\s/gm;
  let match;
  
  while ((match = headingRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[1].length + 1; // 閸栧懏瀚粚鐑樼壐
    decorations.push({
      from,
      to,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 闂呮劘妫岀划妞剧秼閻?** 閹?__
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
  
  // 闂呮劘妫岄弬婊€缍嬮惃?* 閹?_閿涘牆宕熸稉顏庣礆
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
  
  // 闂呮劘妫岄崚鐘绘珟缁捐法娈?~~ 楠炶埖鍧婇崝鐘插灩闂勩倗鍤庨弽宄扮础
  const strikeRegex = /~~([^~]+)~~/g;
  while ((match = strikeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 2;
    const contentFrom = startTo;
    const contentTo = startFrom + match[0].length - 2;
    const endFrom = contentTo;
    const endTo = startFrom + match[0].length;
    
    // 闂呮劘妫岄崜宥夋桨閻?~~
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 缂佹瑤鑵戦梻鏉戝敶鐎硅鍧婇崝鐘插灩闂勩倗鍤庨弽宄扮础
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.mark({ class: 'cm-strikethrough' }),
    });
    // 闂呮劘妫岄崥搴ㄦ桨閻?~~
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 闂呮劘妫岀悰灞藉敶娴狅絿鐖滈惃?` 楠炶埖鍧婇崝鐘侯嚔濞夋洟鐝禍?
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(doc)) !== null) {
    const startFrom = match.index;
    const startTo = startFrom + 1;
    const contentFrom = startTo;
    const contentTo = startFrom + match[0].length - 1;
    const endFrom = contentTo;
    const endTo = startFrom + match[0].length;
    const codeContent = match[1];
    
    // 闂呮劘妫岄崜宥夋桨閻?`
    decorations.push({
      from: startFrom,
      to: startTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 閻?Widget 閺囨寧宕叉禒锝囩垳閸愬懎顔愭禒銉ョ杽閻滄媽顕㈠▔鏇㈢彯娴?
    decorations.push({
      from: contentFrom,
      to: contentTo,
      decoration: Decoration.replace({
        widget: new InlineCodeWidget(codeContent)
      }),
    });
    // 闂呮劘妫岄崥搴ㄦ桨閻?`
    decorations.push({
      from: endFrom,
      to: endTo,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 闂呮劘妫岄柧鐐复鐠囶厽纭?[text](url) 娑擃厾娈?[]() 闁劌鍨庨敍灞藉涧閺勫墽銇氶弬鍥ㄦ拱
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(doc)) !== null) {
    const fullMatch = match[0];
    const text = match[1];
    const startBracket = match.index;
    const endBracket = startBracket + 1;
    const startParen = startBracket + 1 + text.length;
    const endParen = startBracket + fullMatch.length;
    
    // 闂呮劘妫?[
    decorations.push({
      from: startBracket,
      to: endBracket,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
    // 闂呮劘妫?](url)
    decorations.push({
      from: startParen,
      to: endParen,
      decoration: Decoration.mark({ class: 'cm-hidden-syntax' }),
    });
  }
  
  // 閹稿缍呯純顔藉笓鎼村繐鑻熼崢濠氬櫢
  decorations.sort((a, b) => a.from - b.from);
  
  return RangeSet.of(
    decorations.map(d => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * Markdown 鐠囶厽纭堕梾鎰鐟佸懘銈伴崳?StateField閿涘牓顣╃憴鍫熌佸蹇ョ礆
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
  tabId,
  title,
  filePath,
  language,
  initialMode = 'source',
  showOutline = false,
  isActive = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalChange = useRef(false);
  const lastOutlineSnapshotRef = useRef<string>('');
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [colorBlocks, setColorBlocks] = useState<ColorBlockItem[]>([]);
  const [outlineTab, setOutlineTab] = useState<'headings' | 'colors'>('headings');
  const [outlineWidth, setOutlineWidth] = useState(300);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const isResizingOutline = useRef(false);
  const pendingLargeFileSyncTimerRef = useRef<number | null>(null);
  const isLargeFileMode = content.length >= LARGE_FILE_CHARACTER_THRESHOLD;
  const largeFileSummary = formatLargeFileApproximateSize(content.length);

  // 娑撳﹣绗呴弬鍥綅閸楁洜濮搁幀?
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 鐟欏棝顣堕柧鐐复鏉堟挸鍙嗛悩鑸碘偓?
  const [videoLinkInput, setVideoLinkInput] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // @ 瀵洜鏁ら懣婊冨礋閻樿埖鈧?
  const [atReferenceMenu, setAtReferenceMenu] = useState<{
    visible: boolean;
    position: { top: number; left: number };
    searchQuery: string;
    triggerPos: number; // @ 缁楋箑褰块崷銊︽瀮濡楋絼鑵戦惃鍕秴缂?
  }>({ visible: false, position: { top: 0, left: 0 }, searchQuery: '', triggerPos: 0 });

  // 妫版粏澹婃０鍕潔閻樿埖鈧?
  const [colorPreview, setColorPreview] = useState<{
    type: 'color' | 'background-color' | null;
    color: string;
    from: number;
    to: number;
  } | null>(null);

  // 娣囨繂鐡ㄩ幍鎾崇磻妫版粏澹婇柅澶嬪閸ｃ劍妞傞惃鍕偓澶婂隘閼煎啫娲?
  const colorPickerSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const onChangeRef = useRef<CodeMirrorEditorProps['onChange']>(onChange);
  const emitEditorContentChangedRef = useRef<((nextContent: string) => void) | null>(null);
  const emitEditorContentChanged = useCallback((nextContent: string): void => {
    if (!isActive) {
      return;
    }

    const nextPath = filePath ?? '';
    const nextLanguage = language ?? '';
    const nextSnapshot = `${nextPath}\u0000${nextLanguage}\u0000${nextContent}`;
    if (lastOutlineSnapshotRef.current === nextSnapshot) {
      return;
    }

    lastOutlineSnapshotRef.current = nextSnapshot;
    window.dispatchEvent(new CustomEvent('editor:content-changed', {
      detail: {
        content: nextContent,
        language: nextLanguage,
        path: nextPath,
      },
    }));
  }, [filePath, isActive, language]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    emitEditorContentChangedRef.current = emitEditorContentChanged;
  }, [emitEditorContentChanged]);

  const clearPendingLargeFileSync = useCallback(() => {
    if (pendingLargeFileSyncTimerRef.current !== null) {
      window.clearTimeout(pendingLargeFileSyncTimerRef.current);
      pendingLargeFileSyncTimerRef.current = null;
    }
  }, []);

  const flushPendingLargeFileSync = useCallback(() => {
    clearPendingLargeFileSync();

    const view = viewRef.current;
    if (!view) {
      return;
    }

    const nextContent = applyPendingUpdatesToContent(view.state.doc.toString());
    const handleChange = onChangeRef.current;
    if (handleChange && !isInternalChange.current) {
      handleChange(nextContent);
    }
    emitEditorContentChangedRef.current?.(nextContent);
  }, [clearPendingLargeFileSync]);

  const schedulePendingLargeFileSync = useCallback(() => {
    if (!isLargeFileMode || isInternalChange.current) {
      return;
    }

    clearPendingLargeFileSync();
    pendingLargeFileSyncTimerRef.current = window.setTimeout(() => {
      pendingLargeFileSyncTimerRef.current = null;
      flushPendingLargeFileSync();
    }, LARGE_FILE_CHANGE_SYNC_DELAY_MS);
  }, [clearPendingLargeFileSync, flushPendingLargeFileSync, isLargeFileMode]);

  // 閸忔娊妫存稉濠佺瑓閺傚洩褰嶉崡?
  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
    setColorPreview(null); // 閸忔娊妫撮懣婊冨礋閺冭埖绔婚梽銈夘暕鐟?
    colorPickerSelectionRef.current = null; // 濞撳懘娅庢穱婵嗙摠閻ㄥ嫰鈧灏?
  }, []);

  // 閸忔娊妫?@ 瀵洜鏁ら懣婊冨礋
  const closeAtReferenceMenu = useCallback(() => {
    setAtReferenceMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // Wikilink 閼奉亜濮╃悰銉ュ弿
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
          detail: `${anchor.kind === 'heading' ? '标题' : '块'} · 第 ${anchor.line} 行`,
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
        detail: target.path || '未保存路径',
        type: 'file',
        info: target.aliases.length > 0 ? `别名: ${target.aliases.join('、')}` : undefined,
        apply: (view, completion, from, to) => {
          const preferredReference = query.includes('/') || query.includes('\\')
            ? (target.path || target.title)
            : target.title;

          applyWikilinkCompletionText(view, from, to, preferredReference);
        }
      }))
    };
  }, []);

  // 婢跺嫮鎮婄悰銊ュ礋闁瀚?
  const handleFormSelect = useCallback((form: FormInfo) => {
    const view = viewRef.current;
    if (!view) return;

    // 閻㈢喐鍨氬鏇犳暏閺傚洦婀?
    const referenceText = tableReferenceService.formatReference('form', form.id, form.name);
    
    // 閺囨寧宕?@ 閸欏﹤鍙鹃崥搴ㄦ桨閻ㄥ嫭鎮崇槐銏℃瀮閺?
    const { triggerPos, searchQuery } = atReferenceMenu;
    const replaceFrom = triggerPos;
    const replaceTo = triggerPos + 1 + searchQuery.length; // @ + 閹兼粎鍌ㄩ弬鍥ㄦ拱

    view.dispatch({
      changes: { from: replaceFrom, to: replaceTo, insert: referenceText },
      selection: { anchor: replaceFrom + referenceText.length },
    });

    // 閸忔娊妫撮懣婊冨礋
    closeAtReferenceMenu();
    
    // 閼辨氨鍔嶇紓鏍帆閸?
    view.focus();
  }, [atReferenceMenu, closeAtReferenceMenu]);

  // 妫版粏澹婃０鍕潔閺佸牊鐏?
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (colorPreview && colorPreview.type) {
      // 閸氬本妞傜拋鍓х枂妫板嫯顫嶇憗鍛淬偘閸ｃ劌鎷版０鍕潔閼煎啫娲块敍鍫㈡暏娴滃酣娈ｉ挊蹇撳嚒閺堝顤侀懝璇х礆
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
      // 濞撳懘娅庢０鍕潔閸滃矂顣╃憴鍫ｅ瘱閸?
      view.dispatch({
        effects: [
          setColorPreviewEffect.of(null),
          setPreviewRangeEffect.of(null),
        ],
      });
    }
  }, [colorPreview]);

  // 娑撳﹣绗呴弬鍥綅閸楁洟銆?
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
                  changes: { from, to, insert: `**${selectedText || '加粗文本'}**` },
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
                  changes: { from, to, insert: `\`${selectedText || '浠ｇ爜'}\`` },
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
                // 濞撳懘娅庣敮姝岊潌閺嶇厧绱￠弽鍥唶閿?*缁ぞ缍?*閵?閺傛粈缍?閵嗕簥~閸掔娀娅庣痪绺箏閵?=妤傛ü瀵?=閵嗕梗娴狅絿鐖渀閵?閸忣剙绱?
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
                // 缁楊兛绔村▎陇鐨熼悽銊︽娣囨繂鐡ㄩ柅澶婂隘
                if (!colorPickerSelectionRef.current) {
                  const { from, to } = view.state.selection.main;
                  if (from === to) {
                    const line = view.state.doc.lineAt(from);
                    colorPickerSelectionRef.current = { from: line.from, to: line.to };
                  } else {
                    colorPickerSelectionRef.current = { from, to };
                  }
                }
                // 娴ｈ法鏁ゆ穱婵嗙摠閻ㄥ嫰鈧灏?
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
                // 閹垹顦查柅澶婂隘
                view.dispatch({
                  selection: { anchor: from, head: to },
                });
                applyColorStyle(view, 'background-color', color);
              }
              colorPickerSelectionRef.current = null;
            },
            onCustomColorCancel: () => {
              // 閸欐牗绉烽弮鑸电闂勩倝顣╃憴?
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
            label: '自定义文字颜色',
            isCustomColor: true,
            onCustomColorPreview: (color: string) => {
              if (view) {
                // 缁楊兛绔村▎陇鐨熼悽銊︽娣囨繂鐡ㄩ柅澶婂隘
                if (!colorPickerSelectionRef.current) {
                  const { from, to } = view.state.selection.main;
                  if (from === to) {
                    const line = view.state.doc.lineAt(from);
                    colorPickerSelectionRef.current = { from: line.from, to: line.to };
                  } else {
                    colorPickerSelectionRef.current = { from, to };
                  }
                }
                // 娴ｈ法鏁ゆ穱婵嗙摠閻ㄥ嫰鈧灏?
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
                // 閹垹顦查柅澶婂隘
                view.dispatch({
                  selection: { anchor: from, head: to },
                });
                applyColorStyle(view, 'color', color);
              }
              colorPickerSelectionRef.current = null;
            },
            onCustomColorCancel: () => {
              // 閸欐牗绉烽弮鑸电闂勩倝顣╃憴?
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
                
                // 濡偓閺屻儲妲搁崥锔芥Ц閺堝绨崚妤勩€冪悰宀嬬礄婵?1. 2. 缁涘绱?
                const orderedMatch = text.match(/^(\s*)(\d+\.)\s*/);
                if (orderedMatch) {
                  // 閸︺劍婀佹惔蹇撳灙鐞涖劌鎮楅棃銏″潑閸旂姴绶熼崝鐐寸閸楁洘鐗稿?
                  const prefix = orderedMatch[0]; // 閸栧懏瀚紓鈺勭箻閵嗕焦鏆熺€涙鎷伴悙鐟版倵閻ㄥ嫮鈹栭弽?
                  const insertPos = line.from + prefix.length;
                  view.dispatch({
                    changes: { from: insertPos, insert: '[ ] ' },
                    selection: { anchor: insertPos + 4 },
                  });
                } else {
                  // 閺咁噣鈧俺顢戦敍灞芥躬鐞涘矂顩婚幓鎺戝弳瀵板懎濮欏〒鍛礋
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
              // 閼惧嘲褰囬崗澶嬬垼娴ｅ秶鐤嗛惃鍕潌楠炴洖娼楅弽?
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
              // 閹垫挸绱戦弫鐗堝祦鎼存捁顔曠拋鈥虫珤閺嶅洨顒锋い?
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
              // TODO: 鐎圭偟骞囬張顒€婀撮棅鎶筋暥閹绘帒鍙?
              console.log('本地音频功能待实现');
            },
          },
          {
            id: 'local-file',
            label: '本地文件',
            action: () => {
              // TODO: 鐎圭偟骞囬張顒€婀撮弬鍥︽閹绘帒鍙?
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
              // TODO: 鐎圭偟骞囬悽缁樻緲閸旂喕鍏?
              console.log('画布功能待实现');
            },
          },
          {
            id: 'mindmap',
            label: '思维导图',
            action: () => {
              // TODO: 鐎圭偟骞囬幀婵堟樊鐎电厧娴橀崝鐔诲厴
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

  // 閺囧瓨鏌婃径褏缈?
  const updateOutline = useCallback(() => {
    if (!showOutline || isLargeFileMode) {
      setOutline([]);
      setColorBlocks([]);
      return;
    }

    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    setOutline(parseOutline(doc));

    // 閼规彃娼℃穱鈩冧紖瀹歌尙些閼峰厖绗傛稉瀣瀮閼挎粌宕?
    setColorBlocks([]);
  }, [isLargeFileMode, showOutline]);

  // 鐠哄疇娴嗛崚鐗堝瘹鐎规矮缍呯純?
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

  // 婢堆呯堪闂堛垺婢橀幏鏍уЗ鐠嬪啯鏆ｇ€硅棄瀹?
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

  // 婢跺嫮鎮婇幏鏍ㄥ娴滃娆?
  const handleDrop = useCallback((event: DragEvent) => {
    const view = viewRef.current;
    if (!view || !editable) return;

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;

    // 婢跺嫮鎮婇幏鏍ㄦ杹閻ㄥ嫭鏋冩禒?
    if (dataTransfer.files?.length) {
      const files = Array.from(dataTransfer.files);
      const imageFiles = files.filter(file => file.type.startsWith('image/'));

      if (imageFiles.length > 0) {
        event.preventDefault();
        event.stopPropagation();

        // 閼惧嘲褰囬幏鏍ㄦ杹娴ｅ秶鐤?
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const insertPos = pos ?? view.state.selection.main.head;

        imageFiles.forEach((file) => {
          void handleImageFile(file, view, insertPos, filePath).catch((error: Error) => {
            console.error('[CodeMirrorEditor] 鎷栨嫿鍥剧墖淇濆瓨澶辫触:', error);
            toastService.error(error.message || '鍥剧墖鎻掑叆澶辫触');
          });
        });
        return;
      }
    }

    // 婢跺嫮鎮婇幏鏍ㄦ杹閻ㄥ嫬娴橀悧?URL
    const url = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '';

    if (url && isImageUrl(url)) {
      event.preventDefault();
      event.stopPropagation();

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const insertPos = pos ?? view.state.selection.main.head;

      handleImageUrl(url, view, insertPos);
    }
  }, [editable]);

  // 婢跺嫮鎮婄划妯垮垱娴滃娆?
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
          void handleImageFile(file, view, pos, filePath).catch((error: Error) => {
            console.error('[CodeMirrorEditor] 绮樿创鍥剧墖淇濆瓨澶辫触:', error);
            toastService.error(error.message || '鍥剧墖鎻掑叆澶辫触');
          });
        }
        return;
      }
    }
  }, [editable, filePath]);

  // 閸掓稑缂撶紓鏍帆閸?
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && isLargeFileMode) {
        schedulePendingLargeFileSync();
        setAtReferenceMenu(prev => (
          prev.visible
            ? { ...prev, visible: false }
            : prev
        ));
        return;
      }

      if (update.docChanged && onChangeRef.current && !isInternalChange.current) {
        // 閼惧嘲褰囬弬鍥ㄣ€傞崘鍛啇楠炶泛绨查悽銊ョ窡閸氬本顒為惃鍕敩閻礁娼￠崥宥囆為弴瀛樻煀
        let newContent = update.state.doc.toString();
        newContent = applyPendingUpdatesToContent(newContent);
        onChangeRef.current(newContent);
      }

      // 濡偓濞?@ 瀵洜鏁ゆ潏鎾冲弳
      if (update.docChanged) {
        const { state } = update;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        const textBefore = line.text.slice(0, pos - line.from);
        
        // 濡偓閺屻儲妲搁崥锕佺翻閸忋儰绨?@ 閹存牞鈧懏顒滈崷銊ㄧ翻閸?@ 閸氬海娈戦崘鍛啇
        emitEditorContentChangedRef.current?.(update.state.doc.toString());
        const atMatch = textBefore.match(/@([^\s@]*)$/);
        
        if (atMatch) {
          // 閼惧嘲褰囬崗澶嬬垼娴ｅ秶鐤嗛惃鍕潌楠炴洖娼楅弽?
          const coords = update.view.coordsAtPos(pos);
          if (coords) {
            const triggerPos = pos - atMatch[1].length - 1; // @ 缁楋箑褰块惃鍕秴缂?
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
          // 婵″倹鐏夊▽鈩冩箒閸栧綊鍘ら崚?@ 濡€崇础閿涘苯鍙ч梻顓″綅閸?          setAtReferenceMenu(prev => ({ ...prev, visible: false }));
        }

        if (/\[\[[^\]|]*$/.test(textBefore) || /\[\[[^\]|#]+\#[^\]|]*$/.test(textBefore)) {
          startCompletion(update.view);
        }
      }
    });

    // 閺嶈宓佸Ο鈥崇础閸愬啿鐣鹃弰顖氭儊娴ｈ法鏁ゆ０鍕潔鐟佸懘銈伴崳?
    let extensions = [
      highlightActiveLine(),
      history(),
      markdown(),
      autocompletion({
        activateOnTyping: true,
        closeOnBlur: true,
        override: [wikilinkCompletionSource]
      }),
      syntaxHighlighting(customHighlightStyle),
      indentUnit.of('  '), // 2 缁岀儤鐗哥紓鈺勭箻
      customKeymap, // 閼奉亜鐣炬稊澶愭暛閻╂ɑ妲х亸鍕杹閸︺劑绮拋銈夋暛閻╂ɑ妲х亸鍕閸撳稄绱濈涵顔荤箽娴兼ê鍘涙径鍕倞
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
      mermaidDecorations, // Mermaid 閸ユ崘銆冪憗鍛淬偘閸?
      videoDecorations, // 鐟欏棝顣剁憗鍛淬偘閸ｃ劍鏂侀崷銊ユ禈閻楀洣绠ｉ崜宥忕礉娴兼ê鍘涢崠褰掑帳鐟欏棝顣堕柧鐐复
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
      // 缂傗晞绻樼痪?
      indentGuideDecorations,
      // 鎼村繐褰挎妯瑰瘨閿涘牆顩?4.2閵?.2.1閵?.2.1.1閿?
      numberingDecorations,
      // 閺傚洦婀版０婊嗗缁崵绮?- 缁?StateField + Decoration 閺傝顢?
      colorMarksField,
      previewRangeField,
      Prec.highest(colorDecorationsField),
      // 妫版粏澹婃０鍕潔鐟佸懘銈伴崳?
      colorPreviewDecorations,
      // 閹舵ê褰旂紒鍕彯娴滎噯绱欓崗澶嬬垼闁鑵戦弮鑸垫▔缁€铏瑰煑缁狙呮畱閹舵ê褰旈崶鐐垼閸滃苯鐡欑悰宀€娈戠紓鈺勭箻缁惧尅绱?
      foldGroupHighlightField,
      // 閹舵ê褰旈崝鐔诲厴閿涘牅绗夋担璺ㄦ暏 customFoldService閿涘矂浼╅崗宥勭瑢 markdown 鐟欙絾鐎介崳銊ュ暱缁愪緤绱?
      headingFoldMarkers,
      headingFoldGutter,
      listFoldDecorations,
      // 閸愬懓浠?AI 閼卞﹤銇?
      inlineAIChatField,
      // 鐞涖劍鐗稿鏇犳暏閸愬懓浠堟０鍕潔
      ...createTableReferenceExtension(),
      codeFolding({
        placeholderDOM: (_view, onclick) => {
          const span = document.createElement('span');
          span.className = 'cm-foldPlaceholder';
          span.textContent = '...';

          span.title = '点击展开折叠内容';
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

    // 妫板嫯顫嶅Ο鈥崇础濞ｈ濮為梾鎰 Markdown 鐠囶厽纭堕惃鍕棅妤楁澘娅?
    if (isLargeFileMode) {
      extensions = [
        highlightActiveLine(),
        history(),
        indentUnit.of('  '),
        customKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        updateListener,
        EditorState.readOnly.of(!editable),
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
          '&.cm-focused .cm-cursor': {
            borderLeftColor: 'var(--ws-editor-foreground)',
          },
        }),
      ];
    }

    if (!isLargeFileMode && mode === 'preview') {
      extensions.push(markdownHideDecorations);
    } else if (!isLargeFileMode) {
      // 濠ф劗鐖滃Ο鈥崇础濞ｈ濮為弽鍥暯鐠囶厽纭堕梾鎰鐟佸懘銈伴崳顭掔礄閹碘偓鐟欎礁宓嗛幍鈧妤嬬礆
      extensions.push(headingSyntaxHideDecorations);
      // 濠ф劗鐖滃Ο鈥崇础濞ｈ濮炵悰灞藉敶娴狅絿鐖滄妯瑰瘨鐟佸懘銈伴崳?
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

    sanitizeCodeMirrorLineFontFamily(view.dom);
    let cmLineFontObserver: MutationObserver | null = null;
    if (!isLargeFileMode) {
      cmLineFontObserver = new MutationObserver((mutations) => {
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
    }

    // 閸掓繂顫愰崠鏍с亣缁?
    updateOutline();

    if (autoFocus) {
      view.focus();
    }

    return () => {
      flushPendingLargeFileSync();
      cmLineFontObserver?.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, [
    autoFocus,
    editable,
    flushPendingLargeFileSync,
    isLargeFileMode,
    mode,
    schedulePendingLargeFileSync,
    updateOutline,
    wikilinkCompletionSource,
  ]);

  useEffect(() => {
    if (!isActive) {
      flushPendingLargeFileSync();
    }
  }, [flushPendingLargeFileSync, isActive]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (!isActive) {
      if (globalEditorView === view) {
        globalEditorView = null;
      }
      clearActiveCodeMirrorEditor(view);
      return;
    }

    globalEditorView = view;
    setActiveCodeMirrorEditor(view, {
      tabId,
      title,
      path: filePath,
      language,
    });

    return () => {
      if (globalEditorView === view) {
        globalEditorView = null;
      }
      clearActiveCodeMirrorEditor(view);
    };
  }, [filePath, isActive, language, tabId, title]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const handleFocusIn = () => {
      globalEditorView = view;
      setActiveCodeMirrorEditor(view, {
        tabId,
        title,
        path: filePath,
        language,
      });
    };

    view.dom.addEventListener('focusin', handleFocusIn);

    return () => {
      view.dom.removeEventListener('focusin', handleFocusIn);
    };
  }, [filePath, language, tabId, title]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    emitEditorContentChanged(view.state.doc.toString());
  }, [content, emitEditorContentChanged]);

  // 濞夈劍鍓伴敍姘敩閻礁娼￠崥宥囆為惃鍕倱濮濄儱鍑＄粔鏄忓殾閺傚洦銆傛穱婵嗙摠閺冭泛顦╅悶?
  // 鏉╂瑦鐗遍崣顖欎簰闁灝鍘ら崷?Widget 閺囧瓨鏌婃潻鍥┾柤娑擃叀袝閸?CodeMirror 閸愬懘鍎撮柨娆掝嚖

  // 閻╂垵鎯夌憴鍡涱暥閺嶅洭顣介崪灞炬▔缁€鐑樐佸蹇撳綁閸栨牔绨ㄦ禒?
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // 娴狅絿鐖滈崸妤€鎮曠粔鏉垮綁閸栨牕顦╅悶?
    const handleCodeBlockNameChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        language: string;
        oldName: string;
        newName: string;
      }>;
      const { language, oldName, newName } = customEvent.detail;
      
      // 娴ｈ法鏁?setTimeout 瀵ゆ儼绻滈幍褑顢戦敍宀€鈥樻穱婵嗘躬 CodeMirror 鐎瑰本鍨氳ぐ鎾冲閺囧瓨鏌婇崨銊︽埂閸氬骸鍟€閹笛嗩攽
      setTimeout(() => {
        const currentView = viewRef.current;
        if (!currentView || !currentView.dom || !currentView.dom.isConnected) return;
        
        // 閸︺劍鏋冨锝勮厬閺屻儲澹橀崠褰掑帳閻ㄥ嫪鍞惍浣告健瀵偓婵顢戦獮鑸垫纯閺?
        const doc = currentView.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
          const line = doc.line(i);
          const lineText = line.text;
          
          // 閸栧綊鍘?```language // oldName 閺嶇厧绱?
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

    // 鐟欏棝顣堕弽鍥暯閸欐ê瀵叉径鍕倞
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

    // 鐟欏棝顣堕弰鍓с仛濡€崇础閸欐ê瀵叉径鍕倞
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

    // 鐟欏棝顣堕崚鐘绘珟婢跺嫮鎮?
    const handleVideoDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{ from: number; to: number }>;
      const { from, to } = customEvent.detail;
      view.dispatch({
        changes: { from, to, insert: '' },
      });
    };

    // 閺堫剙婀寸憴鍡涱暥闁瀚ㄦ径鍕倞
    const handleVideoSelectLocal = async (event: Event) => {
      const customEvent = event as CustomEvent<{ from: number; to: number; title: string }>;
      const { from, to, title } = customEvent.detail;
      
      // 鐠嬪啰鏁?Electron 閹垫挸绱戦弬鍥︽鐎电鐦藉?
      const result = await window.electron?.video?.open();
      console.log('[handleVideoSelectLocal] 闁瀚ㄧ紒鎾寸亯:', result);
      if (result && result.success && result.data?.path) {
        const filePath = result.data.path;
        console.log('[handleVideoSelectLocal] 閺傚洣娆㈢捄顖氱窞:', filePath);
        const newMarkdown = `![${title}](${filePath})`;
        console.log('[handleVideoSelectLocal] 閹绘帒鍙?markdown:', newMarkdown);
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

  // 閸愬懎顔愰崣妯哄閺冭埖娲块弬鏉裤亣缁?
  useEffect(() => {
    updateOutline();
  }, [content, updateOutline]);

  // 缂佹垵鐣鹃幏鏍ㄥ閸滃瞼鐭樼拹缈犵皑娴?
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 闂冪粯顒涙妯款吇閹锋牗瀚跨悰灞艰礋
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    // 閸欐娊鏁懣婊冨礋婢跺嫮鎮?
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

  // 閸氬本顒炴径鏍劥 content 閸欐ê瀵?
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

  // 閻╂垵鎯夊Ο鈥崇础閸掑洦宕叉禍瀣╂閿涘牊娼甸懛?TabBar 閺囨潙顦块幙宥勭稊閼挎粌宕熼敍?
  useEffect(() => {
    const handleModeChange = (event: CustomEvent<EditorMode>) => {
      setMode(event.detail);
    };

    window.addEventListener('set-codemirror-mode', handleModeChange as EventListener);
    return () => {
      window.removeEventListener('set-codemirror-mode', handleModeChange as EventListener);
    };
  }, []);

  // 閻╂垵鎯夐幓鎺戝弳閺佺増宓佹惔鎾广€冮弽闂寸皑娴?
  useEffect(() => {
    const handleInsertDatabaseTable = (event: Event) => {
      const customEvent = event as CustomEvent<{ markdown: string; focusEditor?: boolean; handled?: boolean }>;
      
      // 婵″倹鐏夋禍瀣╂瀹歌尪顫︽径鍕倞閿涘矁鐑︽潻?
      if (customEvent.detail?.handled) return;
      
      const { markdown } = customEvent.detail;
      
      if (viewRef.current && markdown) {
        // 閺嶅洩顔囨禍瀣╂瀹告彃顦╅悶鍡礉闂冨弶顒涢崗鏈电铂缂傛牞绶崳銊╁櫢婢跺秴顦╅悶?
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
    <div className={`codemirror-editor ${mode === 'preview' ? 'preview-mode' : 'source-mode'} ${isLargeFileMode ? 'large-file-mode' : ''}`}>
      {isLargeFileMode && (
        <div className="cm-large-file-notice">
          <span className="cm-large-file-notice-title">大文件模式</span>
          <span className="cm-large-file-notice-text">
            当前文档约 {largeFileSummary}，已关闭语法增强、嵌入预览、自动补全和自动换行，以减少卡顿。
          </span>
        </div>
      )}
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
                    <Icon name="bookmark" size={14} className="cm-outline-tab-icon" />
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
                      <div className="cm-outline-empty">暂无大纲</div>
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



