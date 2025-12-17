/**
 * LanceDB 数据查看组件
 * 功能：查看工作区已索引文件列表，支持查看文件的分块数据
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../ui/alert-dialog';
import './LanceDBView.scss';

interface FileRecord {
  filePath: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  language: string;
  indexedAt: number;
}

interface ParentChunk {
  parentId: string;
  filePath: string;
  content: string;
  chunkIndex: number;
  createdAt: number;
}

interface ChunkTab {
  id: string;
  type: 'chunks';
  fileName: string;
  filePath: string;
  parents: ParentChunk[];
}

interface FilesTab {
  id: string;
  type: 'files';
}

type Tab = FilesTab | ChunkTab;

export const LanceDBView: React.FC = () => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'files', type: 'files' }]);
  const [activeTabId, setActiveTabId] = useState<string>('files');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileRecord } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileRecord | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const ipcRenderer = window.electron?.ipcRenderer;
      if (!ipcRenderer) {
        setError('IPC 不可用');
        return;
      }

      const filesResult = await ipcRenderer.invoke('workspace-index-db:get-all-indexed-files');
      if (filesResult?.success) {
        setFiles(filesResult.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  // 加载文件的分块数据
  const loadFileChunks = useCallback(async (file: FileRecord) => {
    // 检查是否已经打开
    const existingTab = tabs.find(tab => tab.type === 'chunks' && (tab as ChunkTab).filePath === file.filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    try {
      const ipcRenderer = window.electron?.ipcRenderer;
      if (!ipcRenderer) {
        console.error('[LanceDBView] ipcRenderer 不可用');
        return;
      }

      console.log('========== [LanceDBView] 开始加载分块数据 ==========');
      console.log('[LanceDBView] 文件路径:', file.filePath);
      
      // 分开调用，方便调试
      console.log('[LanceDBView] 调用 get-parents-by-file...');
      const parentsResult = await ipcRenderer.invoke('workspace-index-db:get-parents-by-file', file.filePath);
      console.log('[LanceDBView] 父块结果:', JSON.stringify(parentsResult, null, 2));

      const newTab: ChunkTab = {
        id: `chunk-${Date.now()}`,
        type: 'chunks',
        fileName: file.fileName,
        filePath: file.filePath,
        parents: parentsResult?.success ? parentsResult.data : [],
      };

      console.log('[LanceDBView] 创建新标签页, 父块:', newTab.parents.length);
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (err) {
      console.error('加载分块数据失败:', err);
    }
  }, [tabs]);

  // 右键菜单处理
  const handleContextMenu = (event: React.MouseEvent, file: FileRecord) => {
    event.preventDefault();
    setSelectedFile(file);
    setContextMenu({ x: event.clientX, y: event.clientY, file });
  };

  // 双击查看分块
  const handleDoubleClick = (file: FileRecord) => {
    loadFileChunks(file);
  };

  // 关闭标签页
  const closeTab = (tabId: string) => {
    if (tabId === 'files') return; // 不能关闭文件列表标签
    setTabs(prev => prev.filter(tab => tab.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId('files');
    }
  };

  // 打开删除确认对话框
  const openDeleteDialog = (file: FileRecord) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  // 确认删除文件的分块数据
  const confirmDeleteFileChunks = useCallback(async () => {
    if (!fileToDelete) return;

    try {
      const ipcRenderer = window.electron?.ipcRenderer;
      if (!ipcRenderer) return;

      // 调用删除接口
      const result = await ipcRenderer.invoke('workspace-index-db:delete-file-index', fileToDelete.filePath);
      
      if (result?.success) {
        // 从列表中移除
        setFiles(prev => prev.filter(f => f.filePath !== fileToDelete.filePath));
        
        // 如果有打开的分块标签页，也关闭它
        const chunkTab = tabs.find(tab => tab.type === 'chunks' && (tab as ChunkTab).filePath === fileToDelete.filePath);
        if (chunkTab) {
          closeTab(chunkTab.id);
        }
        
        // 清除选中状态
        if (selectedFile?.filePath === fileToDelete.filePath) {
          setSelectedFile(null);
        }
      }
    } catch (err) {
      console.error('删除分块数据失败:', err);
    } finally {
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  }, [fileToDelete, tabs, selectedFile, closeTab]);

  // 获取当前活动标签
  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // 渲染文件列表
  const renderFilesTable = () => (
    <div className="lancedb-table-container">
      <table className="lancedb-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>文件名</th>
            <th>大小</th>
            <th>语言</th>
          </tr>
        </thead>
        <tbody>
          {paginatedFiles.map((file, index) => (
            <tr
              key={file.filePath}
              className={selectedFile?.filePath === file.filePath ? 'selected' : ''}
              onClick={() => setSelectedFile(file)}
              onDoubleClick={() => handleDoubleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              <td>{(currentPage - 1) * pageSize + index + 1}</td>
              <td className="name-cell">{file.fileName}</td>
              <td>{(file.fileSize / 1024).toFixed(2)} KB</td>
              <td>{file.language}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filteredFiles.length === 0 && !loading && (
        <div className="empty-state">
          {searchKeyword ? '没有匹配的文件' : '暂无已索引文件'}
        </div>
      )}
      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="pagination">
          <span
            className={`pagination-btn ${currentPage === 1 ? 'disabled' : ''}`}
            onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
          >
            上一页
          </span>
          <span className="pagination-info">
            {currentPage} / {totalPages}
          </span>
          <span
            className={`pagination-btn ${currentPage === totalPages ? 'disabled' : ''}`}
            onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
          >
            下一页
          </span>
        </div>
      )}
    </div>
  );

  // 渲染分块内容（只显示父块）
  const renderChunkContent = (chunkTab: ChunkTab) => (
    <div className="chunk-content">
      <div className="chunk-list">
        {chunkTab.parents.map((parent, pIndex) => (
          <div key={parent.parentId} className="parent-chunk">
            <div className="parent-header">
              <span className="chunk-label">块{pIndex + 1}</span>
            </div>
            <pre className="parent-content">{parent.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );

  // 渲染文件详情面板
  const renderFileDetail = () => {
    if (!selectedFile) {
      return <div className="detail-empty">选择文件查看详情</div>;
    }

    return (
      <div className="detail-content">
        <h4>文件详情</h4>
        <div className="detail-item">
          <span className="label">文件名:</span>
          <span className="value">{selectedFile.fileName}</span>
        </div>
        <div className="detail-item">
          <span className="label">完整路径:</span>
          <span className="value">{selectedFile.filePath}</span>
        </div>
        <div className="detail-item">
          <span className="label">扩展名:</span>
          <span className="value">{selectedFile.fileExtension}</span>
        </div>
        <div className="detail-item">
          <span className="label">文件大小:</span>
          <span className="value">{(selectedFile.fileSize / 1024).toFixed(2)} KB</span>
        </div>
        <div className="detail-item">
          <span className="label">语言:</span>
          <span className="value">{selectedFile.language}</span>
        </div>
        <div className="detail-item">
          <span className="label">索引时间:</span>
          <span className="value">{formatDate(selectedFile.indexedAt)}</span>
        </div>
      </div>
    );
  };

  // 搜索关键词
  const [searchKeyword, setSearchKeyword] = useState('');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // 过滤后的文件列表
  const filteredFiles = files.filter(file => {
    if (!searchKeyword.trim()) return true;
    const keyword = searchKeyword.toLowerCase();
    return (
      file.fileName.toLowerCase().includes(keyword) ||
      file.filePath.toLowerCase().includes(keyword) ||
      file.fileExtension.toLowerCase().includes(keyword)
    );
  });

  // 计算分页数据
  const totalPages = Math.ceil(filteredFiles.length / pageSize);
  const paginatedFiles = filteredFiles.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // 搜索时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword]);

  return (
    <div className="lancedb-view">
      <div className="lancedb-header">
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索已索引文件..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="search-input"
          />
          {searchKeyword && (
            <span
              className="search-clear"
              onClick={() => setSearchKeyword('')}
              title="清除搜索"
            >
              ×
            </span>
          )}
        </div>
        <div className="header-actions">
          <span className="stats">
            {searchKeyword ? `${filteredFiles.length}/${files.length}` : files.length} 个文件
          </span>
          <span
            className="refresh-btn"
            onClick={loadFiles}
            title="刷新数据"
          >
            ↻
          </span>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="lancedb-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="tab-title">
              {tab.type === 'files' ? '已索引文件' : (tab as ChunkTab).fileName}
            </span>
            {tab.type === 'chunks' && (
              <span
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              >
                ×
              </span>
            )}
          </div>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      {loading && <div className="loading">加载中...</div>}

      <div className="lancedb-content">
        <div className="main-panel">
          {activeTab?.type === 'files' && renderFilesTable()}
          {activeTab?.type === 'chunks' && renderChunkContent(activeTab as ChunkTab)}
        </div>
        <div className="detail-panel">
          {renderFileDetail()}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="context-menu-item"
            onClick={async () => {
              // 打开原始文件 - 需要先读取文件内容
              try {
                const ipcRenderer = window.electron?.ipcRenderer;
                if (ipcRenderer) {
                  const content = await ipcRenderer.invoke('read-file', contextMenu.file.filePath);
                  if (content !== null && content !== undefined) {
                    window.dispatchEvent(new CustomEvent('open-file', {
                      detail: {
                        path: contextMenu.file.filePath,
                        name: contextMenu.file.fileName,
                        content: content,
                        language: contextMenu.file.language || 'plaintext'
                      }
                    }));
                  } else {
                    console.error('读取文件失败: 内容为空');
                  }
                }
              } catch (err) {
                console.error('读取文件失败:', err);
              }
              setContextMenu(null);
            }}
          >
            查看原始数据
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              loadFileChunks(contextMenu.file);
              setContextMenu(null);
            }}
          >
            查看分块数据
          </div>
          <div className="context-menu-separator" />
          <div
            className="context-menu-item danger"
            onClick={() => {
              openDeleteDialog(contextMenu.file);
              setContextMenu(null);
            }}
          >
            删除分块数据
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分块数据</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 "{fileToDelete?.fileName}" 的分块数据吗？
              <br /><br />
              删除后将失去该文件的语义搜索功能，如果不需要请确认删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFileChunks} className="danger">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LanceDBView;
