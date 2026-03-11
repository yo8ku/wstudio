/**
 * 编辑器组组件
 * 支持多个编辑器分组显示
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import * as jsonc from 'jsonc-parser';
import * as monaco from 'monaco-editor';
import { MonacoEditor } from '../MonacoEditor/MonacoEditor';
import { EditorTab } from '../EditorArea';
import { Icon } from '../../../Icons/Icon';
import { snippetService } from '../../../../services/SnippetService';
import './EditorGroup.scss';

interface EditorGroupProps {
  file: EditorTab;
  onContentChange: (content: string) => void;
  onCompositionStateChange?: (isComposing: boolean, content?: string) => void;
}

interface AgentDiffLine {
  type: 'context' | 'add' | 'delete';
  oldNumber?: number;
  newNumber?: number;
  text: string;
}

interface AgentDiffSpacer {
  type: 'spacer';
  count: number;
}

type AgentDiffRow = AgentDiffLine | AgentDiffSpacer;

interface AgentDiffPreviewModel {
  rows: AgentDiffRow[];
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
): AgentDiffLine[] => {
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

  const rows: AgentDiffLine[] = [];
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
): AgentDiffLine[] => {
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

  const rows: AgentDiffLine[] = [];
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

const collapseAgentDiffRows = (rows: AgentDiffLine[]): AgentDiffRow[] => {
  const collapsed: AgentDiffRow[] = [];
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

const limitAgentDiffRows = (rows: AgentDiffRow[]): { rows: AgentDiffRow[]; truncated: boolean } => {
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

const buildAgentDiffPreviewModel = (
  beforeContent: string,
  afterContent: string,
): AgentDiffPreviewModel => {
  const rawRows = buildLcsDiffLines(splitDiffLines(beforeContent), splitDiffLines(afterContent));
  const addedCount = rawRows.filter(row => row.type === 'add').length;
  const deletedCount = rawRows.filter(row => row.type === 'delete').length;
  const limited = limitAgentDiffRows(collapseAgentDiffRows(rawRows));

  return {
    rows: limited.rows,
    addedCount,
    deletedCount,
    truncated: limited.truncated,
  };
};

const AgentDiffPreview: React.FC<{
  preview: NonNullable<EditorTab['agentDiffPreview']>;
}> = ({ preview }) => {
  const model = useMemo(
    () => buildAgentDiffPreviewModel(preview.beforeContent, preview.afterContent),
    [preview.afterContent, preview.beforeContent, preview.updatedAt],
  );

  return (
    <div className="editor-group-diff">
      <div className="editor-group-diff__header">
        <div className="editor-group-diff__title">
          <Icon name="edit" size={14} />
          <span>Agent Diff</span>
        </div>
        <div className="editor-group-diff__stats">
          <span className="editor-group-diff__stat editor-group-diff__stat--add">+{model.addedCount}</span>
          <span className="editor-group-diff__stat editor-group-diff__stat--delete">-{model.deletedCount}</span>
        </div>
      </div>
      <div className="editor-group-diff__body">
        {model.rows.length === 0 ? (
          <div className="editor-group-diff__empty">未检测到差异</div>
        ) : (
          model.rows.map((row, index) => {
            if (row.type === 'spacer') {
              return (
                <div key={`spacer-${index}`} className="editor-group-diff__spacer">
                  ... 省略 {row.count} 行未变更内容 ...
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
  const currentFileRef = useRef<string>(file.id);
  const themeAutoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  console.log('[EditorGroup] Rendering with file:', {
    id: file.id,
    title: file.title,
    path: file.path,
    contentLength: file.content?.length || 0,
    language: file.language,
    type: file.type
  });

  // 当文件切换时清除 Monaco markers
  useEffect(() => {
    if (currentFileRef.current !== file.id) {
      currentFileRef.current = file.id;
      
      // 清除旧文件的 markers
      const editor = (window as any).__monacoEditor;
      if (editor) {
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelMarkers(model, 'snippet-validation', []);
        }
      }
    }
  }, [file.id]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (themeAutoSaveTimeoutRef.current) {
        clearTimeout(themeAutoSaveTimeoutRef.current);
      }
    };
  }, []);

  // 处理内容变化和自动保存
  const handleContentChange = async (content: string) => {
    onContentChange(content);
    
    // 如果是 settings.json 文件，自动保存到设置
    if (file.path === 'settings:/settings.json') {
      try {
        // 使用 jsonc-parser 解析 JSONC（支持注释的 JSON）
        const parseErrors: jsonc.ParseError[] = [];
        const newSettings = jsonc.parse(content, parseErrors, {
          allowTrailingComma: true,
          allowEmptyContent: false
        });
        
        // 只有在没有解析错误时才保存
        if (parseErrors.length === 0 && newSettings) {
          await window.electronAPI?.settings?.updateMany(newSettings);
        }
      } catch (error) {
        // 保存设置失败，静默处理
      }
    }

    // 检查是否是主题配置文件
    // 支持两种情况：
    // 1. theme-config:// 协议（通过命令中心创建的虚拟文件）
    // 2. 文件路径包含 themes/user 或 themes\\user（直接打开的主题文件）
    const isThemeConfig = file.path.startsWith('theme-config://') || 
                          file.path.includes('themes/user') || 
                          file.path.includes('themes\\user');
    
    // 如果是主题配置文件，不自动保存，等待用户手动保存（Ctrl+S）
    if (isThemeConfig) {
      // 仅记录日志，不执行自动保存
      console.log('[EditorGroup] 主题配置文件内容已更改，等待用户手动保存');
      return; // 主题配置文件不需要继续处理其他逻辑
    }
    
    // 如果是片段文件，保存到 SQLite 数据库
    if (file.path.startsWith('snippet:/new/') || file.path.startsWith('snippet:/edit/')) {
      try {
        const parseErrors: jsonc.ParseError[] = [];
        const snippetData = jsonc.parse(content, parseErrors, {
          allowTrailingComma: true,
          allowEmptyContent: false
        });
        
        // 获取 Monaco 编辑器实例
        const editor = (window as any).__monacoEditor;
        const model = editor?.getModel();
        const markers: monaco.editor.IMarkerData[] = [];
        
        // 检查 JSON 解析错误
        if (parseErrors.length > 0) {
          parseErrors.forEach(err => {
            const position = model?.getPositionAt(err.offset);
            if (position) {
              markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column + (err.length || 1),
                message: `JSON 解析错误: ${jsonc.printParseErrorCode(err.error)}`
              });
            }
          });
          
          // 设置 Monaco markers
          if (model) {
            monaco.editor.setModelMarkers(model, 'snippet-validation', markers);
          }
          
          console.warn('[EditorGroup] 片段 JSON 解析错误:', parseErrors);
          return; // JSON 格式错误，不保存
        }
        
        // 验证必填字段
        if (!snippetData) {
          console.warn('[EditorGroup] 片段数据为空或无效');
          return;
        }
        
        // 查找属性在 JSON 中的位置（用于精确定位错误）
        const findPropertyPosition = (propName: string): { line: number; column: number } | null => {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(new RegExp(`"${propName}"\\s*:`));
            if (match) {
              return { line: i + 1, column: match.index! + 1 };
            }
          }
          return null;
        };
        
        // 验证 name 字段
        if (!snippetData.name || typeof snippetData.name !== 'string' || snippetData.name.trim() === '') {
          const pos = findPropertyPosition('name');
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: pos?.line || 1,
            startColumn: pos?.column || 1,
            endLineNumber: pos?.line || 1,
            endColumn: (pos?.column || 1) + 6, // "name" 长度
            message: '缺少必需的属性 "name" 或其值为空'
          });
        }
        
        // 验证 prefix 字段
        if (!snippetData.prefix || typeof snippetData.prefix !== 'string' || snippetData.prefix.trim() === '') {
          const pos = findPropertyPosition('prefix');
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: pos?.line || 1,
            startColumn: pos?.column || 1,
            endLineNumber: pos?.line || 1,
            endColumn: (pos?.column || 1) + 8, // "prefix" 长度
            message: '缺少必需的属性 "prefix" 或其值为空'
          });
        } else {
          // 验证 prefix 格式
          const prefixPattern = /^[a-zA-Z0-9_-]+$/;
          if (!prefixPattern.test(snippetData.prefix)) {
            const pos = findPropertyPosition('prefix');
            markers.push({
              severity: monaco.MarkerSeverity.Error,
              startLineNumber: pos?.line || 1,
              startColumn: pos?.column || 1,
              endLineNumber: pos?.line || 1,
              endColumn: (pos?.column || 1) + 8,
              message: '属性 "prefix" 的值无效：只能包含字母、数字、下划线和连字符'
            });
          }
        }
        
        // 验证 body 字段
        if (!snippetData.body || typeof snippetData.body !== 'string' || snippetData.body.trim() === '') {
          const pos = findPropertyPosition('body');
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: pos?.line || 1,
            startColumn: pos?.column || 1,
            endLineNumber: pos?.line || 1,
            endColumn: (pos?.column || 1) + 6, // "body" 长度
            message: '缺少必需的属性 "body" 或其值为空'
          });
        }
        
        // 设置 Monaco markers
        if (model && markers.length > 0) {
          monaco.editor.setModelMarkers(model, 'snippet-validation', markers);
          console.warn('[EditorGroup] 片段验证失败:', markers);
          return; // 验证失败，不保存
        }
        
        // 验证通过，清除所有 markers
        if (model) {
          monaco.editor.setModelMarkers(model, 'snippet-validation', []);
        }
        
        // JSONC 格式转换为数据库格式
        const snippet = {
          name: snippetData.name.trim(),
          prefix: snippetData.prefix.trim(),
          body: snippetData.body,
          description: snippetData.description || undefined,
          language: snippetData.language || undefined,
          tags: snippetData.tags || undefined
        };
        
        // 检查是否是编辑现有片段
        if (file.path.startsWith('snippet:/edit/')) {
          // 从路径提取片段 ID
          const pathParts = file.path.split('/');
          const snippetId = parseInt(pathParts[pathParts.length - 1]);
          
          if (!isNaN(snippetId)) {
            // 更新现有片段
            await snippetService.updateSnippet(snippetId, snippet);
            console.log('[EditorGroup] 片段已更新', snippetData.name, '(prefix:', snippetData.prefix + ')', 'ID:', snippetId);
          }
        } else {
          // 新建片段
          const id = await snippetService.addSnippet(snippet);
          console.log('[EditorGroup] 片段已创建', snippetData.name, '(prefix:', snippetData.prefix + ')', 'ID:', id);
        }
      } catch (error) {
        // 保存片段失败，输出详细错误信息
        console.error('[EditorGroup] 保存片段失败:', error);
        if (error instanceof Error) {
          console.error('[EditorGroup] 错误详情:', error.message, error.stack);
        }
      }
    }
  };

  return (
    <div className="editor-group">
      {file.agentDiffPreview && (
        <AgentDiffPreview preview={file.agentDiffPreview} />
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
  // 仅在 file.id、content、language 真正变化时才重新渲染
  return (
    prevProps.file.id === nextProps.file.id &&
    prevProps.file.content === nextProps.file.content &&
    prevProps.file.language === nextProps.file.language &&
    prevProps.file.agentDiffPreview?.updatedAt === nextProps.file.agentDiffPreview?.updatedAt
  );
});
