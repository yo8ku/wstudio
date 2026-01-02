/**
 * 数据库视图组件
 * 功能：提供数据库连接、查询和表格设计功能
 * 描述：支持连接多种数据库，执行查询，并可将结果插入到编辑器中
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Icon } from '../../../Icons/Icon';
import { Select } from '../../../common/Select/Select';
import { AIInputBar } from '../../../common/AIInputBar';
import type {
  DatabaseColumn,
  DatabaseRow,
  DatabaseConfig,
  ColumnType,
  CellValue,
  DatabaseType,
  DbConnectionConfig,
  DbTableInfo,
  DbColumnInfo,
  DbQueryResult,
  DbTypeInfo,
  SavedConnection,
} from './types';
import { COLUMN_TYPES } from './types';
import './DatabaseView.scss';

interface DatabaseViewProps {
  initialConfig?: DatabaseConfig;
  onInsert?: (config: DatabaseConfig) => void;
}

/** 生成唯一ID */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/** 创建默认列 */
const createDefaultColumn = (index: number): DatabaseColumn => ({
  id: generateId(),
  name: `列 ${index + 1}`,
  type: 'text',
  width: 150,
});

/** 创建默认行 */
const createDefaultRow = (columns: DatabaseColumn[]): DatabaseRow => {
  const cells: Record<string, CellValue> = {};
  columns.forEach(col => {
    cells[col.id] = col.type === 'checkbox' ? false : '';
  });
  return { id: generateId(), cells };
};

/** 视图模式 */
type ViewMode = 'design' | 'query';

/** 默认支持的数据库类型 */
const DEFAULT_DB_TYPES: DbTypeInfo[] = [
  { type: 'mysql', name: 'MySQL', description: 'MySQL 数据库' },
  { type: 'postgresql', name: 'PostgreSQL', description: 'PostgreSQL 数据库' },
  { type: 'sqlite', name: 'SQLite', description: 'SQLite 本地数据库' },
  { type: 'mongodb', name: 'MongoDB', description: 'MongoDB NoSQL 数据库' },
  { type: 'mssql', name: 'SQL Server', description: 'Microsoft SQL Server' },
];

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  initialConfig,
  onInsert,
}) => {
  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>('design');
  
  // 多数据库连接管理
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  
  // 当前活动连接的状态
  const activeConnection = connections.find(c => c.id === activeConnectionId);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<DbColumnInfo[]>([]);
  
  // 连接配置
  const [supportedTypes, setSupportedTypes] = useState<DbTypeInfo[]>(DEFAULT_DB_TYPES);
  const [dbType, setDbType] = useState<DatabaseType>('mysql');
  const [dbHost, setDbHost] = useState('localhost');
  const [dbPort, setDbPort] = useState(3306);
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbName, setDbName] = useState('');
  const [dbFilename, setDbFilename] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  
  // 查询相关
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM ');
  const [queryResult, setQueryResult] = useState<DbQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  
  // 查询结果搜索和多选
  const [resultSearchText, setResultSearchText] = useState('');
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const lastSelectedIndex = useRef<number | null>(null);
  
  // 表格设计器状态
  const [name, setName] = useState(initialConfig?.name || '未命名数据库');
  const [columns, setColumns] = useState<DatabaseColumn[]>(
    initialConfig?.columns || [createDefaultColumn(0), createDefaultColumn(1)]
  );
  const [rows, setRows] = useState<DatabaseRow[]>(
    initialConfig?.rows || [createDefaultRow(columns)]
  );
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [typeMenuColumn, setTypeMenuColumn] = useState<string | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [showDataViewer, setShowDataViewer] = useState(true);
  const [dataViewerFormat, setDataViewerFormat] = useState<'text' | 'json' | 'xml'>('json');
  const [dataViewerWordWrap, setDataViewerWordWrap] = useState(true);
  const [dataViewerAutoFormat, setDataViewerAutoFormat] = useState(true);
  const [dataViewerEncoding, setDataViewerEncoding] = useState<string>('utf-8');
  const [showDataViewerSettings, setShowDataViewerSettings] = useState(false);
  const dataViewerSettingsRef = useRef<HTMLDivElement>(null);

  // 列宽拖动状态
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // 加载支持的数据库类型
  useEffect(() => {
    const loadSupportedTypes = async () => {
      try {
        const types = await window.electron?.dbConnector?.getSupportedTypes();
        if (types && types.length > 0) {
          setSupportedTypes(types);
        }
      } catch (error) {
        console.error('[DatabaseView] 加载数据库类型失败:', error);
      }
    };
    loadSupportedTypes();
  }, []);

  // 点击外部关闭类型菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(event.target as Node)) {
        setTypeMenuColumn(null);
      }
    };
    if (typeMenuColumn) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [typeMenuColumn]);

  // 点击外部关闭数据查看器设置菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dataViewerSettingsRef.current && !dataViewerSettingsRef.current.contains(event.target as Node)) {
        setShowDataViewerSettings(false);
      }
    };
    if (showDataViewerSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDataViewerSettings]);

  // 获取默认端口
  const getDefaultPort = (type: DatabaseType): number => {
    switch (type) {
      case 'mysql': return 3306;
      case 'postgresql': return 5432;
      case 'mssql': return 1433;
      default: return 3306;
    }
  };

  // 获取数据库类型图标
  const getDbTypeIcon = (type: DatabaseType): string => {
    switch (type) {
      case 'mysql': return 'database';
      case 'postgresql': return 'database';
      case 'sqlite': return 'file';
      case 'mongodb': return 'database';
      case 'mssql': return 'database';
      default: return 'database';
    }
  };

  // 验证连接表单
  const validateConnectionForm = useCallback((): string | null => {
    if (dbType === 'sqlite') {
      if (!dbFilename.trim()) {
        return '请输入数据库文件路径';
      }
    } else if (dbType === 'mongodb') {
      if (!dbName.trim()) {
        return '请输入数据库名';
      }
    } else {
      // MySQL, PostgreSQL, MSSQL
      if (!dbName.trim()) {
        return '请输入数据库名';
      }
      if (!dbHost.trim()) {
        return '请输入主机地址';
      }
    }
    return null;
  }, [dbType, dbFilename, dbName, dbHost]);

  // 测试并创建连接
  const handleConnect = useCallback(async () => {
    // 表单验证
    const validationError = validateConnectionForm();
    if (validationError) {
      setConnectError(validationError);
      return;
    }

    setConnecting(true);
    setConnectError(null);
    
    try {
      const config: DbConnectionConfig = {
        name: connectionName || `${dbType}-${Date.now()}`,
        type: dbType,
      };
      
      if (dbType === 'sqlite') {
        // SQLite 文件路径验证（如果方法可用）
        try {
          if (typeof window.electron?.dbConnector?.checkFileExists === 'function') {
            const fileExists = await window.electron.dbConnector.checkFileExists(dbFilename);
            if (!fileExists) {
              setConnectError('数据库文件不存在，请检查路径是否正确');
              setConnecting(false);
              return;
            }
          }
        } catch {
          // 如果检查文件存在的方法不可用，跳过检查，让后续连接测试来验证
        }
        config.filename = dbFilename;
      } else if (dbType === 'mongodb') {
        config.uri = `mongodb://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
        config.database = dbName;
      } else {
        config.host = dbHost;
        config.port = dbPort;
        config.user = dbUser;
        config.password = dbPassword;
        config.database = dbName;
        if (dbType === 'mssql') {
          config.server = dbHost;
        }
      }
      
      // 测试连接
      const configRecord = config as unknown as Record<string, unknown>;
      const testResult = await window.electron?.dbConnector?.testConnection(configRecord);
      if (!testResult?.success) {
        setConnectError(testResult?.error || '连接失败');
        setConnecting(false);
        return;
      }
      
      // 创建连接
      const connId = generateId();
      const createResult = await window.electron?.dbConnector?.createConnection(connId, configRecord, true);
      if (!createResult?.success) {
        setConnectError(createResult?.error || '创建连接失败');
        setConnecting(false);
        return;
      }
      
      // 加载表列表
      let tables: DbTableInfo[] = [];
      const tablesResult = await window.electron?.dbConnector?.getTables(connId);
      if (tablesResult?.success && tablesResult.data) {
        tables = tablesResult.data;
      }
      
      // 添加到连接列表
      const newConnection: SavedConnection = {
        id: connId,
        name: config.name,
        type: dbType,
        config,
        status: { connected: true, version: testResult.version },
        tables,
      };
      
      setConnections(prev => [...prev, newConnection]);
      setActiveConnectionId(connId);
      setExpandedConnections(prev => new Set([...prev, connId]));
      setShowConnectDialog(false);
      
      // 重置表单
      setConnectionName('');
      setDbUser('');
      setDbPassword('');
      setDbName('');
      setDbFilename('');
      
      console.log('[DatabaseView] 数据库连接成功');
    } catch (error) {
      setConnectError((error as Error).message);
    } finally {
      setConnecting(false);
    }
  }, [dbType, dbHost, dbPort, dbUser, dbPassword, dbName, dbFilename, connectionName, validateConnectionForm]);

  // 断开连接
  const handleDisconnect = useCallback(async (connId: string) => {
    await window.electron?.dbConnector?.removeConnection(connId);
    setConnections(prev => prev.filter(c => c.id !== connId));
    if (activeConnectionId === connId) {
      setActiveConnectionId(null);
      setSelectedTable(null);
      setTableColumns([]);
      setQueryResult(null);
    }
  }, [activeConnectionId]);

  // 切换连接展开状态
  const toggleConnectionExpand = useCallback((connId: string) => {
    setExpandedConnections(prev => {
      const next = new Set(prev);
      if (next.has(connId)) {
        next.delete(connId);
      } else {
        next.add(connId);
      }
      return next;
    });
  }, []);

  // 选择连接
  const handleSelectConnection = useCallback((connId: string) => {
    setActiveConnectionId(connId);
    setSelectedTable(null);
    setTableColumns([]);
    setQueryResult(null);
    setSqlQuery('SELECT * FROM ');
  }, []);

  // 选择表
  const handleSelectTable = useCallback(async (connId: string, tableName: string) => {
    setActiveConnectionId(connId);
    setSelectedTable(tableName);
    setSqlQuery(`SELECT * FROM ${tableName} LIMIT 100`);
    
    const columnsResult = await window.electron?.dbConnector?.getColumns(connId, tableName);
    if (columnsResult?.success && columnsResult.data) {
      setTableColumns(columnsResult.data);
    }
  }, []);

  // 刷新连接的表列表
  const handleRefreshTables = useCallback(async (connId: string) => {
    const tablesResult = await window.electron?.dbConnector?.getTables(connId);
    if (tablesResult?.success && tablesResult.data) {
      setConnections(prev => prev.map(c => 
        c.id === connId ? { ...c, tables: tablesResult.data } : c
      ));
    }
  }, []);

  // 执行查询
  const handleExecuteQuery = useCallback(async () => {
    if (!activeConnectionId || !sqlQuery.trim()) return;
    
    setExecuting(true);
    setQueryError(null);
    setSelectedRowIndices(new Set());
    setResultSearchText('');
    
    try {
      const result = await window.electron?.dbConnector?.query(activeConnectionId, sqlQuery);
      if (result?.success && result.data) {
        setQueryResult(result.data);
      } else {
        setQueryError(result?.error || '查询失败');
      }
    } catch (error) {
      setQueryError((error as Error).message);
    } finally {
      setExecuting(false);
    }
  }, [activeConnectionId, sqlQuery]);

  // 过滤查询结果
  const filteredQueryRows = React.useMemo(() => {
    if (!queryResult || !resultSearchText.trim()) {
      return queryResult?.rows || [];
    }
    const searchLower = resultSearchText.toLowerCase();
    return queryResult.rows.filter(row => 
      Object.values(row).some(value => 
        value !== null && String(value).toLowerCase().includes(searchLower)
      )
    );
  }, [queryResult, resultSearchText]);

  // 处理行点击选择
  const handleRowSelect = useCallback((rowIndex: number, event: React.MouseEvent) => {
    setSelectedRowIndices(prev => {
      const next = new Set(prev);
      
      if (event.shiftKey && lastSelectedIndex.current !== null) {
        // Shift+点击：范围选择
        const start = Math.min(lastSelectedIndex.current, rowIndex);
        const end = Math.max(lastSelectedIndex.current, rowIndex);
        for (let i = start; i <= end; i++) {
          next.add(i);
        }
      } else if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd+点击：切换单个选择
        if (next.has(rowIndex)) {
          next.delete(rowIndex);
        } else {
          next.add(rowIndex);
        }
      } else {
        // 普通点击：单选
        next.clear();
        next.add(rowIndex);
      }
      
      lastSelectedIndex.current = rowIndex;
      return next;
    });
  }, []);

  // 处理复选框点击（切换选择状态）
  const handleCheckboxClick = useCallback((rowIndex: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedRowIndices(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      lastSelectedIndex.current = rowIndex;
      return next;
    });
  }, []);

  // 全选/取消全选
  const handleSelectAll = useCallback(() => {
    if (selectedRowIndices.size === filteredQueryRows.length) {
      setSelectedRowIndices(new Set());
    } else {
      setSelectedRowIndices(new Set(filteredQueryRows.map((_, i) => i)));
    }
  }, [filteredQueryRows.length, selectedRowIndices.size]);

  // 将查询结果导入到设计器
  const handleImportQueryResult = useCallback(() => {
    if (!queryResult || queryResult.rows.length === 0) return;
    
    // 如果有选中的行，只导入选中的行；否则导入全部
    const rowsToImport = selectedRowIndices.size > 0
      ? filteredQueryRows.filter((_, index) => selectedRowIndices.has(index))
      : queryResult.rows;
    
    if (rowsToImport.length === 0) return;
    
    const firstRow = rowsToImport[0];
    const columnNames = Object.keys(firstRow);
    
    const newColumns: DatabaseColumn[] = columnNames.map((colName) => ({
      id: generateId(),
      name: colName,
      type: 'text' as ColumnType,
      width: 150,
    }));
    
    const newRows: DatabaseRow[] = rowsToImport.map(row => {
      const cells: Record<string, CellValue> = {};
      newColumns.forEach((col, index) => {
        const value = row[columnNames[index]];
        cells[col.id] = value === null ? '' : String(value);
      });
      return { id: generateId(), cells };
    });
    
    setColumns(newColumns);
    setRows(newRows);
    setViewMode('design');
  }, [queryResult, selectedRowIndices, filteredQueryRows]);

  // 添加列
  const handleAddColumn = useCallback(() => {
    const newColumn = createDefaultColumn(columns.length);
    setColumns(prev => [...prev, newColumn]);
    setRows(prev => prev.map(row => ({
      ...row,
      cells: { ...row.cells, [newColumn.id]: '' },
    })));
  }, [columns.length]);

  // 删除列
  const handleDeleteColumn = useCallback((columnId: string) => {
    if (columns.length <= 1) return;
    setColumns(prev => prev.filter(col => col.id !== columnId));
    setRows(prev => prev.map(row => {
      const newCells = { ...row.cells };
      delete newCells[columnId];
      return { ...row, cells: newCells };
    }));
  }, [columns.length]);

  // 更新列名
  const handleUpdateColumnName = useCallback((columnId: string, newName: string) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, name: newName } : col
    ));
  }, []);

  // 更新列类型
  const handleUpdateColumnType = useCallback((columnId: string, newType: ColumnType) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, type: newType } : col
    ));
    setRows(prev => prev.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [columnId]: newType === 'checkbox' ? false : '',
      },
    })));
    setTypeMenuColumn(null);
  }, []);

  // 开始拖动调整列宽
  const handleResizeStart = useCallback((columnId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const column = columns.find(c => c.id === columnId);
    if (column) {
      setResizingColumn(columnId);
      resizeStartX.current = event.clientX;
      resizeStartWidth.current = column.width || 150;
    }
  }, [columns]);

  // 监听鼠标移动和释放事件
  useEffect(() => {
    if (!resizingColumn) return;

    const handleResizeMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartX.current;
      const newWidth = Math.max(80, resizeStartWidth.current + delta);
      setColumns(prev =>
        prev.map(col => (col.id === resizingColumn ? { ...col, width: newWidth } : col))
      );
    };

    const handleResizeEnd = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizingColumn]);

  // 添加行
  const handleAddRow = useCallback(() => {
    setRows(prev => [...prev, createDefaultRow(columns)]);
  }, [columns]);

  // 删除行
  const handleDeleteRow = useCallback((rowId: string) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter(row => row.id !== rowId));
  }, [rows.length]);

  // 清除全部数据（重置为默认状态）
  const handleClearAll = useCallback(() => {
    const defaultColumns = [createDefaultColumn(0), createDefaultColumn(1)];
    setColumns(defaultColumns);
    setRows([createDefaultRow(defaultColumns)]);
    setEditingCell(null);
    setEditingColumnId(null);
    setTypeMenuColumn(null);
  }, []);

  // AI 生成表格数据处理
  const handleAIGenerate = useCallback((content: string) => {
    try {
      // 尝试解析 JSON
      let jsonContent = content.trim();
      // 移除可能的 markdown 代码块标记
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      const data = JSON.parse(jsonContent) as {
        columns: Array<{ name: string; type: string }>;
        rows: Array<Record<string, CellValue>>;
      };

      if (data.columns && Array.isArray(data.columns)) {
        // 创建新列
        const newColumns: DatabaseColumn[] = data.columns.map((col, index) => ({
          id: generateId(),
          name: col.name || `列 ${index + 1}`,
          type: (col.type as ColumnType) || 'text',
          width: 150,
        }));

        // 创建新行
        const newRows: DatabaseRow[] = [];
        if (data.rows && Array.isArray(data.rows)) {
          data.rows.forEach(() => {
            const row: DatabaseRow = {
              id: generateId(),
              cells: {},
            };
            newColumns.forEach((col, colIndex) => {
              const originalColName = data.columns[colIndex]?.name;
              row.cells[col.id] = originalColName && data.rows ? 
                (data.rows.find(r => r[originalColName] !== undefined)?.[originalColName] ?? '') : '';
            });
            newRows.push(row);
          });

          // 重新填充数据
          if (data.rows.length > 0) {
            data.rows.forEach((rowData, rowIndex) => {
              if (newRows[rowIndex]) {
                newColumns.forEach((col, colIndex) => {
                  const originalColName = data.columns[colIndex]?.name;
                  if (originalColName && rowData[originalColName] !== undefined) {
                    newRows[rowIndex].cells[col.id] = rowData[originalColName];
                  }
                });
              }
            });
          }
        }

        // 如果没有行数据，创建一个空行
        if (newRows.length === 0) {
          newRows.push(createDefaultRow(newColumns));
        }

        setColumns(newColumns);
        setRows(newRows);
        console.log('[DatabaseView] AI 生成表格成功:', { columns: newColumns.length, rows: newRows.length });
      }
    } catch (error) {
      console.error('[DatabaseView] AI 生成表格解析失败:', error);
    }
  }, []);

  // 更新单元格值
  const handleUpdateCell = useCallback((rowId: string, colId: string, value: CellValue) => {
    setRows(prev => prev.map(row =>
      row.id === rowId
        ? { ...row, cells: { ...row.cells, [colId]: value } }
        : row
    ));
  }, []);

  // 格式化数据为指定格式
  const formatCellValue = useCallback((value: CellValue, format: 'text' | 'json' | 'xml'): string => {
    if (value === null || value === undefined) return '';
    
    const strValue = typeof value === 'boolean' 
      ? (value ? 'true' : 'false')
      : Array.isArray(value) 
        ? value.join(', ')
        : String(value);
    
    if (format === 'json') {
      try {
        const parsed = JSON.parse(strValue);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return strValue;
      }
    }
    
    if (format === 'xml') {
      try {
        // 简单的 XML 格式化
        let formatted = strValue;
        let indent = 0;
        formatted = formatted.replace(/></g, '>\n<');
        const lines = formatted.split('\n');
        const result: string[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('</')) {
            indent = Math.max(0, indent - 1);
          }
          result.push('  '.repeat(indent) + trimmed);
          if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
            indent++;
          }
        }
        return result.join('\n');
      } catch {
        return strValue;
      }
    }
    
    return strValue;
  }, []);

  // 获取选中单元格的值
  const getSelectedCellValue = useCallback((): CellValue => {
    if (!selectedCell) return null;
    const row = rows.find(r => r.id === selectedCell.rowId);
    if (!row) return null;
    return row.cells[selectedCell.colId];
  }, [selectedCell, rows]);

  // 获取选中单元格的列名
  const getSelectedCellColumnName = useCallback((): string => {
    if (!selectedCell) return '';
    const column = columns.find(c => c.id === selectedCell.colId);
    return column?.name || '';
  }, [selectedCell, columns]);

  // 生成 Markdown 表格
  const generateMarkdown = useCallback((): string => {
    if (columns.length === 0 || rows.length === 0) return '';
    const lines: string[] = [];
    const headerCells = columns.map(col => col.name);
    lines.push(`| ${headerCells.join(' | ')} |`);
    const separators = columns.map(() => '---');
    lines.push(`| ${separators.join(' | ')} |`);
    rows.forEach(row => {
      const rowCells = columns.map(col => {
        const value = row.cells[col.id];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? '[x]' : '[ ]';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
      });
      lines.push(`| ${rowCells.join(' | ')} |`);
    });
    return lines.join('\n');
  }, [columns, rows]);

  // 插入到编辑器
  const handleInsert = useCallback(() => {
    const config: DatabaseConfig = {
      id: initialConfig?.id || generateId(),
      name,
      columns,
      rows,
      createdAt: initialConfig?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (onInsert) {
      onInsert(config);
    }
    const markdown = generateMarkdown();
    console.log('[DatabaseView] 生成的Markdown:\n', markdown);
    window.dispatchEvent(new CustomEvent('insert-database-table', {
      detail: { markdown, config, focusEditor: true },
    }));
  }, [name, columns, rows, initialConfig, onInsert, generateMarkdown]);

  // 渲染单元格
  const renderCell = (row: DatabaseRow, column: DatabaseColumn) => {
    const value = row.cells[column.id];
    const isEditing = editingCell?.rowId === row.id && editingCell?.colId === column.id;

    // 处理键盘导航
    const handleKeyNavigation = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const currentColIndex = columns.findIndex(c => c.id === column.id);
      const currentRowIndex = rows.findIndex(r => r.id === row.id);
      const isLastColumn = currentColIndex === columns.length - 1 || 
        columns.slice(currentColIndex + 1).every(c => c.type === 'checkbox');
      const isLastRow = currentRowIndex === rows.length - 1;

      if (e.key === 'Tab') {
        e.preventDefault();
        
        if (e.shiftKey) {
          // Shift+Tab: 上一列
          if (currentColIndex > 0) {
            let prevColIndex = currentColIndex - 1;
            while (prevColIndex >= 0 && columns[prevColIndex].type === 'checkbox') {
              prevColIndex--;
            }
            if (prevColIndex >= 0) {
              setEditingCell({ rowId: row.id, colId: columns[prevColIndex].id });
            }
          } else if (currentRowIndex > 0) {
            let lastColIndex = columns.length - 1;
            while (lastColIndex >= 0 && columns[lastColIndex].type === 'checkbox') {
              lastColIndex--;
            }
            if (lastColIndex >= 0) {
              setEditingCell({ rowId: rows[currentRowIndex - 1].id, colId: columns[lastColIndex].id });
            }
          }
        } else {
          // Tab: 下一列
          if (!isLastColumn) {
            let nextColIndex = currentColIndex + 1;
            while (nextColIndex < columns.length && columns[nextColIndex].type === 'checkbox') {
              nextColIndex++;
            }
            if (nextColIndex < columns.length) {
              setEditingCell({ rowId: row.id, colId: columns[nextColIndex].id });
            }
          } else if (currentRowIndex < rows.length - 1) {
            let firstColIndex = 0;
            while (firstColIndex < columns.length && columns[firstColIndex].type === 'checkbox') {
              firstColIndex++;
            }
            if (firstColIndex < columns.length) {
              setEditingCell({ rowId: rows[currentRowIndex + 1].id, colId: columns[firstColIndex].id });
            }
          }
        }
      } else if (e.key === 'Enter') {
        // 最后一列按回车，创建新行并跳转到新行第一列
        if (isLastColumn && isLastRow) {
          const newRow = createDefaultRow(columns);
          setRows(prev => [...prev, newRow]);
          // 跳转到新行的第一个非checkbox列
          let firstColIndex = 0;
          while (firstColIndex < columns.length && columns[firstColIndex].type === 'checkbox') {
            firstColIndex++;
          }
          if (firstColIndex < columns.length) {
            setTimeout(() => {
              setEditingCell({ rowId: newRow.id, colId: columns[firstColIndex].id });
            }, 0);
          }
        } else {
          setEditingCell(null);
        }
      } else if (e.key === 'Escape') {
        setEditingCell(null);
      }
    };

    if (column.type === 'checkbox') {
      return (
        <span
          className={`cell-checkbox ${value ? 'checked' : ''}`}
          onClick={() => handleUpdateCell(row.id, column.id, !value)}
        >
          {value && <Icon name="check" size={14} />}
        </span>
      );
    }

    if (isEditing) {
      return (
        <input
          type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
          className="cell-input"
          value={String(value || '')}
          autoFocus
          onChange={(e) => {
            const newValue = column.type === 'number' 
              ? (e.target.value ? Number(e.target.value) : '')
              : e.target.value;
            handleUpdateCell(row.id, column.id, newValue);
          }}
          onBlur={() => setEditingCell(null)}
          onKeyDown={handleKeyNavigation}
        />
      );
    }

    return (
      <span
        className="cell-value"
        onClick={() => setEditingCell({ rowId: row.id, colId: column.id })}
      >
        {column.type === 'url' && value ? (
          <a href={String(value)} target="_blank" rel="noopener noreferrer">
            {String(value)}
          </a>
        ) : (
          String(value || '')
        )}
      </span>
    );
  };

  // 获取列类型图标
  const getColumnTypeIcon = (type: ColumnType): string => {
    const typeInfo = COLUMN_TYPES.find(t => t.type === type);
    return typeInfo?.icon || 'text';
  };


  // 渲染连接对话框
  const renderConnectDialog = () => {
    if (!showConnectDialog) return null;
    
    return (
      <div className="connect-dialog-overlay">
        <div className="connect-dialog">
          <div className="dialog-header">
            <span className="dialog-title">新建数据库连接</span>
            <span className="dialog-close" onClick={() => setShowConnectDialog(false)}>
              <Icon name="close" size={16} />
            </span>
          </div>
          <div className="dialog-body">
            <div className="form-group">
              <label>连接名称</label>
              <input
                type="text"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="我的数据库连接"
              />
            </div>
            <div className="form-group">
              <label>数据库类型</label>
              <Select
                value={dbType}
                onChange={(val) => {
                  const newType = val as DatabaseType;
                  setDbType(newType);
                  setDbPort(getDefaultPort(newType));
                }}
                items={supportedTypes.map(t => ({
                  value: t.type,
                  label: t.name,
                }))}
              />
            </div>
            
            {dbType === 'sqlite' ? (
              <div className="form-group">
                <label>数据库文件路径</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    value={dbFilename}
                    onChange={(e) => setDbFilename(e.target.value)}
                    placeholder="/path/to/database.db"
                  />
                  <span
                    className="browse-btn"
                    onClick={async () => {
                      try {
                        const result = await window.electron?.dbConnector?.selectDatabaseFile();
                        if (result?.success && result.path) {
                          setDbFilename(result.path);
                        }
                      } catch (error) {
                        console.error('[DatabaseView] 选择文件失败:', error);
                      }
                    }}
                    title="浏览..."
                  >
                    <Icon name="folder" size={14} />
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>主机</label>
                    <input
                      type="text"
                      value={dbHost}
                      onChange={(e) => setDbHost(e.target.value)}
                      placeholder="localhost"
                    />
                  </div>
                  <div className="form-group form-group-small">
                    <label>端口</label>
                    <input
                      type="number"
                      value={dbPort}
                      onChange={(e) => setDbPort(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>用户名</label>
                    <input
                      type="text"
                      value={dbUser}
                      onChange={(e) => setDbUser(e.target.value)}
                      placeholder="root"
                    />
                  </div>
                  <div className="form-group">
                    <label>密码</label>
                    <input
                      type="password"
                      value={dbPassword}
                      onChange={(e) => setDbPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>数据库名</label>
                  <input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    placeholder="database"
                  />
                </div>
              </>
            )}
            
            {connectError && (
              <div className="connect-error">{connectError}</div>
            )}
          </div>
          <div className="dialog-footer">
            <span className="dialog-btn cancel" onClick={() => setShowConnectDialog(false)}>
              取消
            </span>
            <span
              className={`dialog-btn primary ${connecting ? 'disabled' : ''}`}
              onClick={connecting ? undefined : handleConnect}
            >
              {connecting ? '连接中...' : '连接'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // 渲染连接侧边栏
  const renderConnectionsSidebar = () => (
    <div className="connections-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">数据库连接</span>
        <span 
          className="sidebar-action" 
          onClick={() => setShowConnectDialog(true)}
          title="新建连接"
        >
          <Icon name="plus" size={14} />
        </span>
      </div>
      <div className="connections-list">
        {connections.length === 0 ? (
          <div className="no-connections">
            <span>暂无连接</span>
            <span 
              className="add-connection-link"
              onClick={() => setShowConnectDialog(true)}
            >
              添加连接
            </span>
          </div>
        ) : (
          connections.map(conn => (
            <div key={conn.id} className="connection-group">
              <div 
                className={`connection-item ${activeConnectionId === conn.id ? 'active' : ''}`}
                onClick={() => handleSelectConnection(conn.id)}
              >
                <span 
                  className="expand-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleConnectionExpand(conn.id);
                  }}
                >
                  <Icon 
                    name={expandedConnections.has(conn.id) ? 'chevron-down' : 'chevron-right'} 
                    size={12} 
                  />
                </span>
                <Icon name={getDbTypeIcon(conn.type)} size={14} />
                <span className="connection-name">{conn.name}</span>
                <span 
                  className={`connection-status-dot ${conn.status.connected ? 'connected' : ''}`}
                  title={conn.status.connected ? '已连接' : '未连接'}
                />
                <span className="connection-actions">
                  <span 
                    className="action-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefreshTables(conn.id);
                    }}
                    title="刷新"
                  >
                    <Icon name="refresh" size={12} />
                  </span>
                  <span 
                    className="action-icon disconnect"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnect(conn.id);
                    }}
                    title="断开连接"
                  >
                    <Icon name="close" size={12} />
                  </span>
                </span>
              </div>
              {expandedConnections.has(conn.id) && conn.tables && (
                <div className="tables-tree">
                  {conn.tables.map(table => (
                    <div
                      key={table.name}
                      className={`table-tree-item ${selectedTable === table.name && activeConnectionId === conn.id ? 'selected' : ''}`}
                      onClick={() => handleSelectTable(conn.id, table.name)}
                    >
                      <Icon name={table.type === 'view' ? 'eye' : 'table'} size={12} />
                      <span className="table-name">{table.name}</span>
                      {table.rowCount !== undefined && (
                        <span className="table-count">{table.rowCount}</span>
                      )}
                    </div>
                  ))}
                  {conn.tables.length === 0 && (
                    <div className="no-tables">暂无表</div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* 表结构面板 - 放在连接列表下方 */}
      {selectedTable && tableColumns.length > 0 && (
        <div className="table-structure-panel">
          <div className="structure-header">
            <Icon name="table" size={12} />
            <span>{selectedTable}</span>
          </div>
          <div className="columns-list">
            {tableColumns.map(col => (
              <div key={col.name} className="column-item">
                <span className={`column-key ${col.isPrimaryKey ? 'primary' : ''}`}>
                  {col.isPrimaryKey && <Icon name="key" size={12} />}
                </span>
                <span className="column-name">{col.name}</span>
                <span className="column-type">{col.dataType}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="database-view">
      {/* 头部 */}
      <div className="database-header">
        <div className="header-left">
          <input
            type="text"
            className="database-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="数据库名称"
          />
          {/* 视图切换 */}
          <div className="view-tabs">
            <span
              className={`view-tab ${viewMode === 'design' ? 'active' : ''}`}
              onClick={() => setViewMode('design')}
            >
              设计
            </span>
            <span
              className={`view-tab ${viewMode === 'query' ? 'active' : ''}`}
              onClick={() => setViewMode('query')}
            >
              查询
            </span>
          </div>
        </div>
        <div className="header-actions">
          {viewMode === 'design' && (
            <>
              <span 
                className={`action-btn ${showDataViewer ? 'active' : ''}`}
                onClick={() => setShowDataViewer(!showDataViewer)} 
                title={showDataViewer ? '隐藏数据查看器' : '显示数据查看器'}
              >
                <Icon name="eye" size={16} />
              </span>
              <span className="action-btn" onClick={handleInsert} title="插入到编辑器">
                <Icon name="check" size={16} />
                <span>插入</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* 主体内容 */}
      <div className="database-body">
        {/* 左侧连接列表 */}
        {renderConnectionsSidebar()}

        {/* 右侧内容区 */}
        <div className="database-content">
          {/* 查询模式 */}
          {viewMode === 'query' && (
            <div className="query-panel">
              {/* 查询区域 */}
              <div className="query-main">
                <div className="query-input-area">
                  <textarea
                    className="sql-input"
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="输入 SQL 查询语句..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        handleExecuteQuery();
                      }
                    }}
                  />
                  <div className="query-actions">
                    <span
                      className={`query-btn ${executing || !activeConnection?.status.connected ? 'disabled' : ''}`}
                      onClick={executing || !activeConnection?.status.connected ? undefined : handleExecuteQuery}
                    >
                      <Icon name="play" size={14} />
                      <span>{executing ? '执行中...' : '执行 (Ctrl+Enter)'}</span>
                    </span>
                    {queryResult && queryResult.rows.length > 0 && (
                      <span className="query-btn" onClick={handleImportQueryResult}>
                        <Icon name="download" size={14} />
                        <span>导入到设计器</span>
                      </span>
                    )}
                  </div>
                </div>
                
                {/* 查询结果 */}
                {queryError && (
                  <div className="query-error">{queryError}</div>
                )}
                {queryResult && (
                  <div className="query-result">
                    <div className="result-header">
                      <span>查询结果: {filteredQueryRows.length} / {queryResult.rows.length} 行</span>
                      <div className="result-header-actions">
                        <div className="result-search">
                          <Icon name="search" size={14} />
                          <input
                            type="text"
                            className="result-search-input"
                            value={resultSearchText}
                            onChange={(e) => {
                              setResultSearchText(e.target.value);
                              setSelectedRowIndices(new Set());
                            }}
                            placeholder="搜索结果..."
                          />
                          {resultSearchText && (
                            <span 
                              className="result-search-clear"
                              onClick={() => {
                                setResultSearchText('');
                                setSelectedRowIndices(new Set());
                              }}
                            >
                              <Icon name="close" size={12} />
                            </span>
                          )}
                        </div>
                        {queryResult.executionTime !== undefined && (
                          <span className="execution-time">{queryResult.executionTime}ms</span>
                        )}
                      </div>
                    </div>
                    {selectedRowIndices.size > 0 && (
                      <div className="result-selection-info">
                        <span>已选择 {selectedRowIndices.size} 行</span>
                        <span 
                          className="clear-selection"
                          onClick={() => setSelectedRowIndices(new Set())}
                        >
                          清除选择
                        </span>
                      </div>
                    )}
                    {queryResult.rows.length > 0 ? (
                      <div className="result-table-wrapper">
                        <table className="result-table">
                          <thead>
                            <tr>
                              <th className="select-column">
                                <span 
                                  className={`select-checkbox ${selectedRowIndices.size === filteredQueryRows.length && filteredQueryRows.length > 0 ? 'checked' : ''} ${selectedRowIndices.size > 0 && selectedRowIndices.size < filteredQueryRows.length ? 'indeterminate' : ''}`}
                                  onClick={handleSelectAll}
                                >
                                  {selectedRowIndices.size === filteredQueryRows.length && filteredQueryRows.length > 0 && (
                                    <Icon name="check" size={12} />
                                  )}
                                  {selectedRowIndices.size > 0 && selectedRowIndices.size < filteredQueryRows.length && (
                                    <Icon name="minus" size={12} />
                                  )}
                                </span>
                              </th>
                              {Object.keys(queryResult.rows[0]).map(key => (
                                <th key={key}>{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredQueryRows.map((row, rowIndex) => (
                              <tr 
                                key={rowIndex}
                                className={selectedRowIndices.has(rowIndex) ? 'selected' : ''}
                                onClick={(e) => handleRowSelect(rowIndex, e)}
                              >
                                <td className="select-column">
                                  <span 
                                    className={`select-checkbox ${selectedRowIndices.has(rowIndex) ? 'checked' : ''}`}
                                    onClick={(e) => handleCheckboxClick(rowIndex, e)}
                                  >
                                    {selectedRowIndices.has(rowIndex) && <Icon name="check" size={12} />}
                                  </span>
                                </td>
                                {Object.values(row).map((value, colIndex) => (
                                  <td key={colIndex}>
                                    {value === null ? <span className="null-value">NULL</span> : String(value)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="result-empty">
                        <p>查询结果为空</p>
                      </div>
                    )}
                  </div>
                )}
                
                {connections.length === 0 && (
                  <div className="no-connection">
                    <Icon name="database" size={48} />
                    <p>请先添加数据库连接</p>
                    <span className="connect-btn" onClick={() => setShowConnectDialog(true)}>
                      新建连接
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 设计模式 */}
          {viewMode === 'design' && (
            <>
              <div className="database-table-wrapper">
                <table className="database-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.id} style={{ width: column.width }}>
                          <div className="column-header">
                            <span
                              className="column-type-icon"
                              onClick={() => setTypeMenuColumn(column.id)}
                              title="更改列类型"
                            >
                              <Icon name={getColumnTypeIcon(column.type)} size={14} />
                            </span>
                            {editingColumnId === column.id ? (
                              <input
                                type="text"
                                className="column-name-input"
                                value={column.name}
                                autoFocus
                                onChange={(e) => handleUpdateColumnName(column.id, e.target.value)}
                                onBlur={() => setEditingColumnId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    setEditingColumnId(null);
                                  }
                                }}
                              />
                            ) : (
                              <span
                                className="column-name"
                                onClick={() => setEditingColumnId(column.id)}
                              >
                                {column.name}
                              </span>
                            )}
                            {columns.length > 1 && (
                              <span
                                className="column-delete"
                                onClick={() => handleDeleteColumn(column.id)}
                                title="删除列"
                              >
                                <Icon name="close" size={12} />
                              </span>
                            )}
                            {typeMenuColumn === column.id && (
                              <div className="type-menu" ref={typeMenuRef}>
                                {COLUMN_TYPES.map((typeInfo) => (
                                  <div
                                    key={typeInfo.type}
                                    className={`type-menu-item ${column.type === typeInfo.type ? 'active' : ''}`}
                                    onClick={() => handleUpdateColumnType(column.id, typeInfo.type)}
                                  >
                                    <Icon name={typeInfo.icon} size={14} />
                                    <span>{typeInfo.label}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <span
                            className={`column-resize-handle ${resizingColumn === column.id ? 'resizing' : ''}`}
                            onMouseDown={(e) => handleResizeStart(column.id, e)}
                          />
                        </th>
                      ))}
                      <th className="add-column-cell">
                        <span className="add-column-btn" onClick={handleAddColumn} title="添加列">
                          <Icon name="plus" size={14} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        {columns.map((column) => (
                          <td 
                            key={column.id}
                            className={selectedCell?.rowId === row.id && selectedCell?.colId === column.id ? 'selected-cell' : ''}
                            onClick={() => setSelectedCell({ rowId: row.id, colId: column.id })}
                          >
                            {renderCell(row, column)}
                          </td>
                        ))}
                        <td className="row-actions-cell">
                          {rows.length > 1 && (
                            <span
                              className="delete-row-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRow(row.id);
                              }}
                              title="删除行"
                            >
                              <Icon name="close" size={12} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* 添加行 - 作为表格最后一行 */}
                    <tr className="add-row-tr">
                      <td colSpan={columns.length} className="add-row-cell">
                        <span className="add-row-btn" onClick={handleAddRow} title="添加行">
                          <Icon name="plus" size={14} />
                        </span>
                      </td>
                      <td className="row-actions-cell"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* AI 输入栏 */}
              <AIInputBar
                placeholder="描述您想要生成的表格内容..."
                systemPrompt={`你是一个表格数据生成助手。用户会描述他们想要的表格内容，你需要生成符合要求的表格数据。
请以 JSON 格式返回数据，格式如下：
{
  "columns": [
    { "name": "列名1", "type": "text" },
    { "name": "列名2", "type": "number" }
  ],
  "rows": [
    { "列名1": "值1", "列名2": 123 },
    { "列名1": "值2", "列名2": 456 }
  ]
}
支持的列类型：text（文本）、number（数字）、checkbox（复选框）、date（日期）、url（链接）、email（邮箱）、select（选择）
只返回 JSON 数据，不要添加任何解释或 markdown 代码块标记。`}
                onGenerate={handleAIGenerate}
              />
            </>
          )}
        </div>

        {/* 数据查看器面板 */}
        {viewMode === 'design' && showDataViewer && (
          <div className="data-viewer-panel">
            <div className="data-viewer-header">
              <span className="data-viewer-title">数据查看器</span>
              <span 
                className="data-viewer-close"
                onClick={() => setShowDataViewer(false)}
                title="关闭"
              >
                <Icon name="close" size={14} />
              </span>
            </div>
            <div className="data-viewer-content">
              {selectedCell ? (
                <>
                  <div className="data-viewer-cell-info">
                    <span className="cell-column-name">{getSelectedCellColumnName()}</span>
                  </div>
                  <div className="data-viewer-toolbar">
                    <div className="toolbar-group format-menu-group" ref={dataViewerSettingsRef}>
                      <span 
                        className={`format-menu-trigger ${showDataViewerSettings ? 'active' : ''}`}
                        onClick={() => setShowDataViewerSettings(!showDataViewerSettings)}
                      >
                        <span className="format-label">
                          {dataViewerFormat === 'text' ? 'Text' : dataViewerFormat === 'json' ? 'JSON' : 'XML'}
                        </span>
                        <Icon name="chevron-down" size={12} />
                      </span>
                      {showDataViewerSettings && (
                        <div className="format-menu">
                          <div className="format-menu-section">
                            <div 
                              className={`format-menu-item ${dataViewerFormat === 'text' ? 'selected' : ''}`}
                              onClick={() => { setDataViewerFormat('text'); setShowDataViewerSettings(false); }}
                            >
                              <span className="item-check">{dataViewerFormat === 'text' && <Icon name="check" size={12} />}</span>
                              <span className="item-label">Text</span>
                            </div>
                            <div 
                              className={`format-menu-item ${dataViewerFormat === 'json' ? 'selected' : ''}`}
                              onClick={() => { setDataViewerFormat('json'); setShowDataViewerSettings(false); }}
                            >
                              <span className="item-check">{dataViewerFormat === 'json' && <Icon name="check" size={12} />}</span>
                              <span className="item-label">JSON</span>
                            </div>
                            <div 
                              className={`format-menu-item ${dataViewerFormat === 'xml' ? 'selected' : ''}`}
                              onClick={() => { setDataViewerFormat('xml'); setShowDataViewerSettings(false); }}
                            >
                              <span className="item-check">{dataViewerFormat === 'xml' && <Icon name="check" size={12} />}</span>
                              <span className="item-label">XML</span>
                            </div>
                          </div>
                          <div className="format-menu-divider" />
                          <div className="format-menu-section">
                            <div 
                              className="format-menu-item"
                              onClick={() => setDataViewerWordWrap(!dataViewerWordWrap)}
                            >
                              <span className="item-check">{dataViewerWordWrap && <Icon name="check" size={12} />}</span>
                              <span className="item-label">自动换行</span>
                            </div>
                            <div 
                              className="format-menu-item"
                              onClick={() => setDataViewerAutoFormat(!dataViewerAutoFormat)}
                            >
                              <span className="item-check">{dataViewerAutoFormat && <Icon name="check" size={12} />}</span>
                              <span className="item-label">自动格式化</span>
                            </div>
                          </div>
                          <div className="format-menu-divider" />
                          <div className="format-menu-section encoding-section">
                            <div className="section-title">编码</div>
                            {['utf-8', 'gbk', 'gb2312', 'iso-8859-1', 'ascii'].map((enc) => (
                              <div 
                                key={enc}
                                className={`format-menu-item ${dataViewerEncoding === enc ? 'selected' : ''}`}
                                onClick={() => { setDataViewerEncoding(enc); setShowDataViewerSettings(false); }}
                              >
                                <span className="item-check">{dataViewerEncoding === enc && <Icon name="check" size={12} />}</span>
                                <span className="item-label">{enc.toUpperCase()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`data-viewer-value ${dataViewerWordWrap ? 'word-wrap' : ''}`}>
                    <pre>{dataViewerAutoFormat ? formatCellValue(getSelectedCellValue(), dataViewerFormat) : String(getSelectedCellValue() ?? '')}</pre>
                  </div>
                </>
              ) : (
                <div className="data-viewer-empty">
                  <Icon name="database" size={32} />
                  <p>选择单元格查看数据</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 连接对话框 */}
      {renderConnectDialog()}
    </div>
  );
};
