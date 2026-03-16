/**
 * 缂栬緫鍣ㄧ粍缁勪欢
 * 鏀寔澶氫釜缂栬緫鍣ㄥ垎缁勬樉绀?
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import * as jsonc from 'jsonc-parser';
import { MonacoEditor } from '../MonacoEditor/MonacoEditor';
import { EditorTab } from '../EditorArea';
import { Icon } from '../../../Icons/Icon';
import './EditorGroup.scss';

interface EditorGroupProps {
  file: EditorTab;
  onContentChange: (content: string) => void;
  onCompositionStateChange?: (isComposing: boolean, content?: string) => void;
}

interface DiffLine {
  type: 'context' | 'add' | 'delete';
  oldNumber?: number;
  newNumber?: number;
  text: string;
}

interface DiffSpacer {
  type: 'spacer';
  count: number;
}

type DiffRow = DiffLine | DiffSpacer;

interface DiffPreviewModel {
  rows: DiffRow[];
  addedCount: number;
  deletedCount: number;
  truncated: boolean;
}

const DIFF_CONTEXT_RADIUS = 2;
const DIFF_MAX_MATRIX_CELLS = 80_000;
const DIFF_MAX_RENDER_ROWS = 240;

const normalizeDiffContent = (value: string): string =>
  value.replace(/\r\n/g, '\n');

const splitDiffLines = (value: string): string[] =>
  normalizeDiffContent(value).split('\n');

const buildFallbackDiffLines = (
  beforeLines: string[],
  afterLines: string[],
): DiffLine[] => {
  let prefixLength = 0;
  while (
    prefixLength < beforeLines.length
    && prefixLength < afterLines.length
    && beforeLines[prefixLength] === afterLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < beforeLines.length - prefixLength
    && suffixLength < afterLines.length - prefixLength
    && beforeLines[beforeLines.length - 1 - suffixLength] === afterLines[afterLines.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const rows: DiffLine[] = [];
  let oldNumber = 1;
  let newNumber = 1;

  for (let index = 0; index < prefixLength; index += 1) {
    rows.push({
      type: 'context',
      oldNumber,
      newNumber,
      text: beforeLines[index] ?? '',
    });
    oldNumber += 1;
    newNumber += 1;
  }

  const beforeMiddle = beforeLines.slice(prefixLength, beforeLines.length - suffixLength);
  const afterMiddle = afterLines.slice(prefixLength, afterLines.length - suffixLength);

  beforeMiddle.forEach(line => {
    rows.push({
      type: 'delete',
      oldNumber,
      text: line,
    });
    oldNumber += 1;
  });

  afterMiddle.forEach(line => {
    rows.push({
      type: 'add',
      newNumber,
      text: line,
    });
    newNumber += 1;
  });

  for (let index = beforeLines.length - suffixLength; index < beforeLines.length; index += 1) {
    rows.push({
      type: 'context',
      oldNumber,
      newNumber,
      text: beforeLines[index] ?? '',
    });
    oldNumber += 1;
    newNumber += 1;
  }

  return rows;
};

const buildLcsDiffLines = (
  beforeLines: string[],
  afterLines: string[],
): DiffLine[] => {
  const rowCount = beforeLines.length;
  const colCount = afterLines.length;
  if (rowCount === 0 && colCount === 0) {
    return [];
  }

  if (rowCount * colCount > DIFF_MAX_MATRIX_CELLS) {
    return buildFallbackDiffLines(beforeLines, afterLines);
  }

  const matrix = Array.from(
    { length: rowCount + 1 },
    () => new Uint16Array(colCount + 1),
  );

  for (let row = rowCount - 1; row >= 0; row -= 1) {
    for (let col = colCount - 1; col >= 0; col -= 1) {
      matrix[row][col] = beforeLines[row] === afterLines[col]
        ? matrix[row + 1][col + 1] + 1
        : Math.max(matrix[row + 1][col], matrix[row][col + 1]);
    }
  }

  const rows: DiffLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  let oldNumber = 1;
  let newNumber = 1;

  while (beforeIndex < rowCount && afterIndex < colCount) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      rows.push({
        type: 'context',
        oldNumber,
        newNumber,
        text: beforeLines[beforeIndex] ?? '',
      });
      beforeIndex += 1;
      afterIndex += 1;
      oldNumber += 1;
      newNumber += 1;
      continue;
    }

    if (matrix[beforeIndex + 1][afterIndex] >= matrix[beforeIndex][afterIndex + 1]) {
      rows.push({
        type: 'delete',
        oldNumber,
        text: beforeLines[beforeIndex] ?? '',
      });
      beforeIndex += 1;
      oldNumber += 1;
      continue;
    }

    rows.push({
      type: 'add',
      newNumber,
      text: afterLines[afterIndex] ?? '',
    });
    afterIndex += 1;
    newNumber += 1;
  }

  while (beforeIndex < rowCount) {
    rows.push({
      type: 'delete',
      oldNumber,
      text: beforeLines[beforeIndex] ?? '',
    });
    beforeIndex += 1;
    oldNumber += 1;
  }

  while (afterIndex < colCount) {
    rows.push({
      type: 'add',
      newNumber,
      text: afterLines[afterIndex] ?? '',
    });
    afterIndex += 1;
    newNumber += 1;
  }

  return rows;
};

const collapseDiffRows = (rows: DiffLine[]): DiffRow[] => {
  const collapsed: DiffRow[] = [];
  let index = 0;

  while (index < rows.length) {
    if (rows[index].type !== 'context') {
      collapsed.push(rows[index]);
      index += 1;
      continue;
    }

    const start = index;
    while (index < rows.length && rows[index].type === 'context') {
      index += 1;
    }
    const run = rows.slice(start, index);

    if (run.length <= DIFF_CONTEXT_RADIUS * 2 + 1) {
      collapsed.push(...run);
      continue;
    }

    collapsed.push(...run.slice(0, DIFF_CONTEXT_RADIUS));
    collapsed.push({
      type: 'spacer',
      count: run.length - DIFF_CONTEXT_RADIUS * 2,
    });
    collapsed.push(...run.slice(-DIFF_CONTEXT_RADIUS));
  }

  return collapsed;
};

const limitDiffRows = (rows: DiffRow[]): { rows: DiffRow[]; truncated: boolean } => {
  if (rows.length <= DIFF_MAX_RENDER_ROWS) {
    return {
      rows,
      truncated: false,
    };
  }

  return {
    rows: [
      ...rows.slice(0, DIFF_MAX_RENDER_ROWS),
      {
        type: 'spacer',
        count: rows.length - DIFF_MAX_RENDER_ROWS,
      },
    ],
    truncated: true,
  };
};

const buildDiffPreviewModel = (
  beforeContent: string,
  afterContent: string,
): DiffPreviewModel => {
  const rawRows = buildLcsDiffLines(splitDiffLines(beforeContent), splitDiffLines(afterContent));
  const addedCount = rawRows.filter(row => row.type === 'add').length;
  const deletedCount = rawRows.filter(row => row.type === 'delete').length;
  const limited = limitDiffRows(collapseDiffRows(rawRows));

  return {
    rows: limited.rows,
    addedCount,
    deletedCount,
    truncated: limited.truncated,
  };
};

const DiffPreview: React.FC<{
  preview: NonNullable<EditorTab['diffPreview']>;
}> = ({ preview }) => {
  const model = useMemo(
    () => buildDiffPreviewModel(preview.beforeContent, preview.afterContent),
    [preview.afterContent, preview.beforeContent, preview.updatedAt],
  );

  return (
    <div className="editor-group-diff">
      <div className="editor-group-diff__header">
        <div className="editor-group-diff__title">
          <Icon name="edit" size={14} />
          <span>鍐呭宸紓</span>
        </div>
        <div className="editor-group-diff__stats">
          <span className="editor-group-diff__stat editor-group-diff__stat--add">+{model.addedCount}</span>
          <span className="editor-group-diff__stat editor-group-diff__stat--delete">-{model.deletedCount}</span>
        </div>
      </div>
      <div className="editor-group-diff__body">
        {model.rows.length === 0 ? (
          <div className="editor-group-diff__empty">鏈娴嬪埌宸紓</div>
        ) : (
          model.rows.map((row, index) => {
            if (row.type === 'spacer') {
              return (
                <div key={`spacer-${index}`} className="editor-group-diff__spacer">
                  ... 鐪佺暐 {row.count} 琛屾湭鍙樻洿鍐呭 ...
                </div>
              );
            }

            return (
              <div
                key={`${row.type}-${row.oldNumber ?? 0}-${row.newNumber ?? 0}-${index}`}
                className={`editor-group-diff__line editor-group-diff__line--${row.type}`}
              >
                <span className="editor-group-diff__number">{row.oldNumber ?? ''}</span>
                <span className="editor-group-diff__number">{row.newNumber ?? ''}</span>
                <span className="editor-group-diff__marker">
                  {row.type === 'add' ? '+' : row.type === 'delete' ? '-' : ' '}
                </span>
                <code className="editor-group-diff__content">{row.text || ' '}</code>
              </div>
            );
          })
        )}
        {model.truncated && (
          <div className="editor-group-diff__truncated">差异过长，已截断显示。</div>
        )}
      </div>
    </div>
  );
};

export const EditorGroup: React.FC<EditorGroupProps> = memo(({
  file,
  onContentChange,
  onCompositionStateChange
}) => {
  const themeAutoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  console.log('[EditorGroup] Rendering with file:', {
    id: file.id,
    title: file.title,
    path: file.path,
    contentLength: file.content?.length || 0,
    language: file.language,
    type: file.type
  });


  // 娓呯悊闃叉姈瀹氭椂鍣?
  useEffect(() => {
    return () => {
      if (themeAutoSaveTimeoutRef.current) {
        clearTimeout(themeAutoSaveTimeoutRef.current);
      }
    };
  }, []);

  // 澶勭悊鍐呭鍙樺寲鍜岃嚜鍔ㄤ繚瀛?
  const handleContentChange = async (content: string) => {
    onContentChange(content);
    
    // 濡傛灉鏄?settings.json 鏂囦欢锛岃嚜鍔ㄤ繚瀛樺埌璁剧疆
    if (file.path === 'settings:/settings.json') {
      try {
        // 浣跨敤 jsonc-parser 瑙ｆ瀽 JSONC锛堟敮鎸佹敞閲婄殑 JSON锛?
        const parseErrors: jsonc.ParseError[] = [];
        const newSettings = jsonc.parse(content, parseErrors, {
          allowTrailingComma: true,
          allowEmptyContent: false
        });
        
        // 鍙湁鍦ㄦ病鏈夎В鏋愰敊璇椂鎵嶄繚瀛?
        if (parseErrors.length === 0 && newSettings) {
          await window.electronAPI?.settings?.updateMany(newSettings);
        }
      } catch (error) {
        // 淇濆瓨璁剧疆澶辫触锛岄潤榛樺鐞?
      }
    }

    // 妫€鏌ユ槸鍚︽槸涓婚閰嶇疆鏂囦欢
    // 鏀寔涓ょ鎯呭喌锛?
    // 1. theme-config:// 鍗忚锛堥€氳繃鍛戒护涓績鍒涘缓鐨勮櫄鎷熸枃浠讹級
    // 2. 鏂囦欢璺緞鍖呭惈 themes/user 鎴?themes\\user锛堢洿鎺ユ墦寮€鐨勪富棰樻枃浠讹級
    const isThemeConfig = file.path.startsWith('theme-config://') || 
                          file.path.includes('themes/user') || 
                          file.path.includes('themes\\user');
    
    // 濡傛灉鏄富棰橀厤缃枃浠讹紝涓嶈嚜鍔ㄤ繚瀛橈紝绛夊緟鐢ㄦ埛鎵嬪姩淇濆瓨锛圕trl+S锛?
    if (isThemeConfig) {
      // 浠呰褰曟棩蹇楋紝涓嶆墽琛岃嚜鍔ㄤ繚瀛?
      console.log('[EditorGroup] 涓婚閰嶇疆鏂囦欢鍐呭宸叉洿鏀癸紝绛夊緟鐢ㄦ埛鎵嬪姩淇濆瓨');
      return; // 涓婚閰嶇疆鏂囦欢涓嶉渶瑕佺户缁鐞嗗叾浠栭€昏緫
    }
    
  };

  return (
    <div className="editor-group">
      {file.diffPreview && (
        <DiffPreview preview={file.diffPreview} />
      )}
      <div className="editor-group__editor">
        <MonacoEditor
          value={file.content || ''}
          language={file.language}
          onChange={handleContentChange}
          onCompositionStateChange={onCompositionStateChange}
          tabId={file.id}
          tabTitle={file.title}
          filePath={file.path}
        />
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 浠呭湪 file.id銆乧ontent銆乴anguage 鐪熸鍙樺寲鏃舵墠閲嶆柊娓叉煋
  return (
    prevProps.file.id === nextProps.file.id &&
    prevProps.file.content === nextProps.file.content &&
    prevProps.file.language === nextProps.file.language &&
    prevProps.file.diffPreview?.updatedAt === nextProps.file.diffPreview?.updatedAt
  );
});
