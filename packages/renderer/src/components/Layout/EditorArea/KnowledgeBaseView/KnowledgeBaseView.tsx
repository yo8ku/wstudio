/**
 * 知识库视图组件
 * 功能：在编辑器标签页中显示知识库的文件列表
 * 描述：提供文件浏览、打开、删除等操作
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { KnowledgeItem } from '../../Sidebar/KnowledgeBase/types';
import { SearchFilterIcon, SortIcon, AddDocumentIcon, ClearIcon, CheckIcon, RefreshIcon, SettingsIcon } from '../../Sidebar/KnowledgeBase/KnowledgeBaseIcons';
import { AddFileMenu } from '../AddFileMenu';
import { MaterialFileIcon } from '../../../FileIcon/MaterialFileIcon';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import { ragProcessingService } from '../../../../services/RAGProcessingService';
import { toastService } from '../../../../services/ToastService';
import './KnowledgeBaseView.scss';

export interface KnowledgeBaseViewProps {
  knowledgeId: string;
  knowledgeTitle: string;
  knowledgeDescription?: string;
  items: KnowledgeItem[];
  onFileOpen?: (item: KnowledgeItem) => void;
  onFileDelete?: (item: KnowledgeItem) => void;
}

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  knowledgeId,
  knowledgeTitle,
  knowledgeDescription,
  items,
  onFileOpen,
  onFileDelete
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [isRetryingFailedFiles, setIsRetryingFailedFiles] = useState(false);

  // 过滤出当前知识库的项（只显示 id 匹配的知识库及其子项目）
  const { currentKnowledgeItems, failedFiles, configChanged } = React.useMemo(() => {
    console.log('[KnowledgeBaseView] 计算 currentKnowledgeItems:', {
      knowledgeId,
      itemsCount: items.length,
      items: items.map(item => ({ id: item.id, title: item.title, childrenCount: item.children?.length || 0 }))
    });
    
    const knowledgeBase = items.find(item => item.id === knowledgeId);
    const children = knowledgeBase ? (knowledgeBase.children || []) : [];
    const configChanged = knowledgeBase?.metadata?.configChanged || false;
    
    console.log('[KnowledgeBaseView] 找到知识库:', {
      found: !!knowledgeBase,
      childrenCount: children.length,
      children: children.map(item => ({
        id: item.id,
        title: item.title,
        type: item.type,
        hasMetadata: !!item.metadata,
        processingStatus: item.metadata?.processingStatus,
        processingProgress: item.metadata?.processingProgress
      }))
    });
    
    // 调试：检查是否有文件带处理状态
    const filesWithStatus = children.filter(
      (item: KnowledgeItem) => item.type === 'file' && item.metadata?.processingStatus
    );
    if (filesWithStatus.length > 0) {
      console.log('[KnowledgeBaseView] 检测到带处理状态的文件:', filesWithStatus.length, filesWithStatus.map(item => ({
        title: item.title,
        status: item.metadata?.processingStatus,
        progress: item.metadata?.processingProgress,
        fullMetadata: item.metadata
      })));
    }

    const failedItems: KnowledgeItem[] = [];
    const collectFailedFiles = (list: KnowledgeItem[]) => {
      list.forEach(child => {
        if (child.type === 'file' && child.metadata?.processingStatus === 'error') {
          failedItems.push(child);
        }
        if (child.children && child.children.length > 0) {
          collectFailedFiles(child.children);
        }
      });
    };
    collectFailedFiles(children);
    
    return { currentKnowledgeItems: children, failedFiles: failedItems, configChanged };
  }, [items, knowledgeId]);

  const hasFailedFiles = failedFiles.length > 0;

  // 搜索输入框显示时自动聚焦
  useEffect(() => {
    if (showSearchInput && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearchInput]);

  // 切换搜索输入框显示
  const handleToggleSearch = useCallback(() => {
    setShowSearchInput(prev => !prev);
    if (showSearchInput) {
      // 关闭时清空搜索
      setSearchQuery('');
    }
  }, [showSearchInput]);

  // 清除搜索
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // 刷新知识库
  const handleRefresh = useCallback(() => {
    // 触发知识库更新事件，重新加载数据
    window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
      detail: { knowledgeId }
    }));
    toastService.success('知识库已刷新');
  }, [knowledgeId]);

  // 打开设置面板（触发事件通知侧边栏打开）
  const handleOpenSettings = useCallback(() => {
    // 触发事件，通知侧边栏打开知识库设置面板
    window.dispatchEvent(new CustomEvent('open-knowledge-settings', {
      detail: { knowledgeId }
    }));
  }, [knowledgeId]);

  // 排序处理
  const handleSort = useCallback(() => {
    // TODO: 实现排序功能
    console.log('[KnowledgeBaseView] 排序知识');
  }, []);

  // 添加文件 - 切换菜单显示
  const handleAddFile = useCallback(() => {
    setShowAddMenu(prev => !prev);
  }, []);

  // 导入本地文件
  const handleImportFile = useCallback(async () => {
    try {
    console.log('[KnowledgeBaseView] 导入本地文件');
      
      // 调用 IPC 打开多文件选择对话框
      const result = await window.electron?.ipcRenderer?.invoke('file:openMultiple');
      
      if (!result || !result.success || !result.data || result.data.length === 0) {
        if (result?.error && result.error !== 'User canceled') {
          toastService.error(result.error);
        }
        return;
      }

      const filePaths: string[] = result.data;
      console.log('[KnowledgeBaseView] 选择的文件:', filePaths);

      // 获取工作区目录
      const workspaceResult = await window.electron?.workspace?.getDir();
      if (!workspaceResult?.success || !workspaceResult.data) {
        toastService.error('获取工作区目录失败');
        return;
      }

      const workspaceDir = workspaceResult.data;
      const knowledgeBasePath = `${workspaceDir}\\KnowledgeBases\\${knowledgeId}`;

      // 确保知识库文件夹存在
      await window.electron?.folder?.ensureDir?.(knowledgeBasePath);

      let importedCount = 0;
      let failedCount = 0;

      // 处理每个文件
      for (const filePath of filePaths) {
        try {
          const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
          
          // 复制文件到知识库文件夹
          const copyResult = await window.electron?.folder?.copyToFolder(filePath, knowledgeBasePath);
          
          if (copyResult?.success && copyResult.data) {
            const { path: newFilePath, name: newFileName } = copyResult.data;
            
            // 添加文件到知识库数据
            await knowledgeBaseService.addFileToKnowledgeBase(
              knowledgeId,
              newFilePath,
              newFileName
            );
            
            // 更新处理状态为 processing
            await knowledgeBaseService.updateFileProcessingStatus(newFilePath, 'processing', 10);
            
            // 触发知识库刷新事件
            window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId }
            }));
            
            // 进度更新回调
            const handleProgress = async (progressFilePath: string, progress: number) => {
              if (progressFilePath !== newFilePath) return;
              // 当进度达到 100% 时，立即将状态更新为 completed
              const status = progress >= 100 ? 'completed' : 'processing';
              await knowledgeBaseService.updateFileProcessingStatus(progressFilePath, status, progress);
              window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: { knowledgeId }
              }));
            };
            
            // 后台异步处理文件
            ragProcessingService.uploadFilesToKnowledgeBase(
              [newFilePath],
              knowledgeId,
              undefined,
              handleProgress
            ).then(async () => {
              // 确保状态为 completed（防止进度回调未正确更新状态）
              await knowledgeBaseService.updateFileProcessingStatus(newFilePath, 'completed', 100);
              window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: { knowledgeId }
              }));
              
              // 检查是否所有文件都处理完成，如果是，清除 configChanged 标志
              const allData = await knowledgeBaseService.loadFromStorage();
              const knowledgeBase = allData.created.find(kb => kb.id === knowledgeId);
              if (knowledgeBase) {
                const allFilesCompleted = (items: KnowledgeItem[]): boolean => {
                  for (const item of items) {
                    if (item.type === 'file') {
                      const status = item.metadata?.processingStatus;
                      if (status !== 'completed') {
                        return false;
                      }
                    }
                    if (item.children) {
                      if (!allFilesCompleted(item.children)) {
                        return false;
                      }
                    }
                  }
                  return true;
                };
                
                const children = knowledgeBase.children || [];
                if (allFilesCompleted(children) && knowledgeBase.metadata?.configChanged) {
                  await knowledgeBaseService.updateKnowledgeBase(knowledgeId, {
                    metadata: {
                      configChanged: false,
                    },
                  });
                  window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                    detail: { knowledgeId }
                  }));
                }
              }
            }).catch((error) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              knowledgeBaseService.updateFileProcessingStatus(newFilePath, 'error', 0).then(() => {
                window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                  detail: { knowledgeId }
                }));
              }).catch(() => {});
              console.error('[KnowledgeBaseView] 文件处理失败:', errorMessage);
            });
            
            importedCount++;
          } else {
            failedCount++;
            console.error('[KnowledgeBaseView] 文件复制失败:', copyResult?.error);
          }
        } catch (error) {
          failedCount++;
          console.error('[KnowledgeBaseView] 导入文件失败:', filePath, error);
        }
      }

      // 显示导入结果
      if (importedCount > 0) {
        toastService.success(`成功导入 ${importedCount} 个文件${failedCount > 0 ? `，${failedCount} 个文件失败` : ''}`);
      } else if (failedCount > 0) {
        toastService.error(`导入失败，共 ${failedCount} 个文件`);
      }

      // 触发知识库刷新事件
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`导入文件失败: ${errorMessage}`);
      console.error('[KnowledgeBaseView] 导入文件失败:', error);
    }
  }, [knowledgeId]);

  // 导入本地文件夹
  const handleImportFolder = useCallback(async () => {
    try {
    console.log('[KnowledgeBaseView] 导入本地文件夹');
      
      // 调用 IPC 打开文件夹选择对话框（知识库专用，不设置工作区目录）
      const result = await window.electron?.knowledgeBase?.openFolder();
      
      if (!result || !result.success || !result.data) {
        if (result?.error && result.error !== 'User canceled') {
          toastService.error(result.error);
        }
        return;
      }

      const folderPath = result.data.path;
      console.log('[KnowledgeBaseView] 选择的文件夹:', folderPath);

      // 获取导入文件夹的名称（用于在知识库中创建对应的文件夹）
      const folderName = folderPath.split(/[/\\]/).filter((p: string) => p).pop() || '未命名文件夹';
      console.log('[KnowledgeBaseView] 导入文件夹名称:', folderName);

      // 扫描文件夹中的支持文件
      const scanResult = await window.electron?.ipcRenderer?.invoke('folder:scanFiles', folderPath);
      
      if (!scanResult || !scanResult.success || !scanResult.data || scanResult.data.length === 0) {
        toastService.warning('所选文件夹中没有支持的文件（仅支持 .md, .markdown, .json, .txt 文件）');
        return;
      }

      const filePaths: string[] = scanResult.data;
      console.log('[KnowledgeBaseView] 扫描到的文件:', filePaths.length, '个');

      // 知识库与资源管理器隔离：不创建文件系统目录，只读取文件内容并存储到知识库数据结构中
      // 第一阶段：批量导入所有文件（先显示在界面上）
      const importedFiles: Array<{ id: string; name: string; content: string }> = [];
      let importedCount = 0;
      let failedCount = 0;

      console.log('[KnowledgeBaseView] 开始批量导入文件（知识库独立存储模式）...');
      for (const filePath of filePaths) {
        try {
          const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
          
          // 读取文件内容（不复制文件，不创建文件系统目录）
          const fileContent = await window.electronAPI?.fs?.readFile?.(filePath, 'utf-8');
          
          if (fileContent) {
            // 生成一个虚拟路径用于标识（不指向实际文件系统）
            const virtualPath = `knowledge-base://${knowledgeId}/${folderName}/${fileName}`;
            
            // 添加文件到知识库数据（传递文件内容，实现知识库与资源管理器隔离）
            const addedFile = await knowledgeBaseService.addFileToKnowledgeBase(
              knowledgeId,
              virtualPath,
              fileName,
              folderName, // 只使用导入文件夹名称，不包含子文件夹路径
              fileContent // 传递文件内容，不依赖文件系统
            );
            
            // 初始状态设置为 pending（等待向量化）
            await knowledgeBaseService.updateFileProcessingStatus(addedFile.id, 'pending', 0);
            
            importedFiles.push({ 
              id: addedFile.id, 
              name: fileName, 
              content: fileContent 
            });
            importedCount++;
          } else {
            failedCount++;
            console.error('[KnowledgeBaseView] 文件读取失败:', filePath);
          }
        } catch (error) {
          failedCount++;
          console.error('[KnowledgeBaseView] 导入文件失败:', filePath, error);
        }
      }

      // 触发知识库刷新事件（显示所有导入的文件）
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));

      // 显示导入结果
      if (importedCount > 0) {
        toastService.success(`成功导入 ${importedCount} 个文件${failedCount > 0 ? `，${failedCount} 个文件失败` : ''}，开始向量化处理...`);
      } else if (failedCount > 0) {
        toastService.error(`导入失败，共 ${failedCount} 个文件`);
        return;
      }

      // 第二阶段：所有文件导入成功后，统一开始向量化处理
      if (importedFiles.length > 0) {
        console.log('[KnowledgeBaseView] 开始批量向量化处理，文件数量:', importedFiles.length);
        
        // 为有内容的文件创建临时文件（在系统临时目录，不影响资源管理器）
        const tempFilePaths: string[] = [];
        const tempFileCleanup: Array<{ path: string; id: string }> = [];
        
        try {
          // 获取系统临时目录
          const tempDirResult = await window.electron?.ipcRenderer?.invoke('app:get-path', 'temp');
          const tempDir = tempDirResult?.data || '';
          
          // 为每个文件创建临时文件（如果文件有内容）
          for (const file of importedFiles) {
            try {
              // 获取文件信息以确定扩展名
              const fileItem = await knowledgeBaseService.findItem(file.id);
              if (fileItem && fileItem.metadata?.content) {
                const ext = file.name.split('.').pop() || 'txt';
                const tempFilePath = `${tempDir}\\knowledge-base-temp-${file.id}.${ext}`;
                
                // 写入临时文件
                await window.electronAPI?.fs?.writeFile?.(tempFilePath, file.content, 'utf-8');
                
                tempFilePaths.push(tempFilePath);
                tempFileCleanup.push({ path: tempFilePath, id: file.id });
              }
            } catch (error) {
              console.error('[KnowledgeBaseView] 创建临时文件失败:', file.name, error);
            }
          }
          
          // 进度更新回调
          const handleProgress = async (progressFilePath: string, progress: number) => {
            // 根据临时文件路径找到对应的文件ID
            const tempFile = tempFileCleanup.find(tf => tf.path === progressFilePath);
            if (tempFile) {
              // 更新处理状态
              const status = progress >= 100 ? 'completed' : 'processing';
              await knowledgeBaseService.updateFileProcessingStatus(tempFile.id, status, progress);
              window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: { knowledgeId }
              }));
            }
          };
          
          // 批量处理所有文件
          try {
            // 将所有文件状态更新为 processing
            for (const file of importedFiles) {
              await knowledgeBaseService.updateFileProcessingStatus(file.id, 'processing', 10);
            }
            window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId }
            }));
            
            // 统一开始向量化处理（使用临时文件路径）
            await ragProcessingService.uploadFilesToKnowledgeBase(
              tempFilePaths,
              knowledgeId,
              undefined,
              handleProgress
            );
            
            // 确保所有文件状态为 completed
            for (const file of importedFiles) {
              await knowledgeBaseService.updateFileProcessingStatus(file.id, 'completed', 100);
            }
            
            window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId }
            }));
            
            // 检查是否所有文件都处理完成，如果是，清除 configChanged 标志
            const allData = await knowledgeBaseService.loadFromStorage();
            const knowledgeBase = allData.created.find(kb => kb.id === knowledgeId);
            if (knowledgeBase) {
              const allFilesCompleted = (items: KnowledgeItem[]): boolean => {
                for (const item of items) {
                  if (item.type === 'file') {
                    const status = item.metadata?.processingStatus;
                    if (status !== 'completed') {
                      return false;
                    }
                  }
                  if (item.children) {
                    if (!allFilesCompleted(item.children)) {
                      return false;
                    }
                  }
                }
                return true;
              };
              
              const children = knowledgeBase.children || [];
              if (allFilesCompleted(children) && knowledgeBase.metadata?.configChanged) {
                await knowledgeBaseService.updateKnowledgeBase(knowledgeId, {
                  metadata: {
                    configChanged: false,
                  },
                });
                window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                  detail: { knowledgeId }
                }));
              }
            }
            
            console.log('[KnowledgeBaseView] 批量向量化处理完成');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[KnowledgeBaseView] 批量向量化处理失败:', errorMessage);
            
            // 将所有文件状态更新为 error
            for (const file of importedFiles) {
              await knowledgeBaseService.updateFileProcessingStatus(file.id, 'error', 0);
            }
            
            window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId }
            }));
            
            toastService.error(`向量化处理失败: ${errorMessage}`);
          }
        } finally {
          // 清理临时文件
          for (const tempFile of tempFileCleanup) {
            try {
              // 使用 IPC 删除临时文件
              await window.electron?.ipcRenderer?.invoke('delete-file', tempFile.path);
            } catch (error) {
              console.warn('[KnowledgeBaseView] 清理临时文件失败:', tempFile.path, error);
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(`导入文件夹失败: ${errorMessage}`);
      console.error('[KnowledgeBaseView] 导入文件夹失败:', error);
    }
  }, [knowledgeId]);

  // 导入笔记
  const handleImportNote = useCallback((noteId: string) => {
    console.log('[KnowledgeBaseView] 导入笔记:', noteId);
    // TODO: 实现笔记导入逻辑
  }, []);

  // 模拟笔记列表（后续从实际数据源获取）
  const mockNotes = [
    { id: 'note-1', title: '我的第一篇笔记' },
    { id: 'note-2', title: '学习笔记' },
    { id: 'note-3', title: '项目规划' },
  ];

  // 切换文件夹展开/折叠
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  // 处理文件点击
  const handleItemClick = useCallback((item: KnowledgeItem) => {
    setSelectedItem(item.id);
    if (item.type === 'folder') {
      toggleFolder(item.id);
    } else {
      onFileOpen?.(item);
    }
  }, [toggleFolder, onFileOpen]);

  // 处理文件双击
  const handleItemDoubleClick = useCallback((item: KnowledgeItem) => {
    if (item.type === 'file') {
      onFileOpen?.(item);
    }
  }, [onFileOpen]);

  // 重试失败文件处理
  const handleRetryFailedFiles = useCallback(async () => {
    if (!knowledgeId || failedFiles.length === 0 || isRetryingFailedFiles) {
      return;
    }

    const filesWithPaths = failedFiles.filter(
      (item): item is KnowledgeItem & { path: string } => Boolean(item.path)
    );

    if (filesWithPaths.length === 0) {
      toastService.error('无法定位需要重试的文件路径');
      return;
    }

    setIsRetryingFailedFiles(true);

    try {
      // 先将所有失败文件标记为 processing
      for (const file of filesWithPaths) {
        await knowledgeBaseService.updateFileProcessingStatus(file.path, 'processing', 10);
      }

      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));

      const failedRetryResults: Array<{ title: string; message: string }> = [];

      for (const file of filesWithPaths) {
        const filePath = file.path;
        const handleProgressUpdate = async (progressFilePath: string, progress: number) => {
          if (progressFilePath !== filePath) {
            return;
          }
          // 当进度达到 100% 时，立即将状态更新为 completed
          const status = progress >= 100 ? 'completed' : 'processing';
          await knowledgeBaseService.updateFileProcessingStatus(filePath, status, progress);
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId }
          }));
        };

        try {
          await ragProcessingService.uploadFilesToKnowledgeBase(
            [filePath],
            knowledgeId,
            undefined,
            handleProgressUpdate
          );
          await knowledgeBaseService.updateFileProcessingStatus(filePath, 'completed', 100);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failedRetryResults.push({
            title: file.title,
            message: errorMessage
          });
          await knowledgeBaseService.updateFileProcessingStatus(filePath, 'error', 0);
          console.error('[KnowledgeBaseView] 重试处理失败:', {
            filePath,
            knowledgeId,
            error: errorMessage
          });
        } finally {
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId }
          }));
        }
      }

      if (failedRetryResults.length === 0) {
        toastService.success('失败的文件已重新处理完成');
        
        // 检查是否所有文件都处理完成，如果是，清除 configChanged 标志
        const allData = await knowledgeBaseService.loadFromStorage();
        const knowledgeBase = allData.created.find(kb => kb.id === knowledgeId);
        if (knowledgeBase) {
          // 检查所有文件是否都处理完成
          const allFilesCompleted = (items: KnowledgeItem[]): boolean => {
            for (const item of items) {
              if (item.type === 'file') {
                const status = item.metadata?.processingStatus;
                if (status !== 'completed') {
                  return false;
                }
              }
              if (item.children) {
                if (!allFilesCompleted(item.children)) {
                  return false;
                }
              }
            }
            return true;
          };
          
          const children = knowledgeBase.children || [];
          if (allFilesCompleted(children) && knowledgeBase.metadata?.configChanged) {
            // 清除 configChanged 标志
            await knowledgeBaseService.updateKnowledgeBase(knowledgeId, {
              metadata: {
                configChanged: false,
              },
            });
            
            // 触发知识库更新事件，更新标签页标题
            window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId }
            }));
          }
        }
      } else if (failedRetryResults.length === filesWithPaths.length) {
        toastService.error('重试失败，请检查控制台日志获取更多信息');
      } else {
        const failedTitles = failedRetryResults.slice(0, 3).map(item => item.title).join('、');
        toastService.warning(`部分文件重试失败：${failedTitles}${failedRetryResults.length > 3 ? ' 等' : ''}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toastService.error(message || '重试失败，请稍后再试');
    } finally {
      setIsRetryingFailedFiles(false);
    }
  }, [failedFiles, isRetryingFailedFiles, knowledgeId]);

  // 获取文件图标（使用应用统一的图标系统）
  const getFileIcon = (item: KnowledgeItem) => {
    if (item.type === 'folder') {
      const isExpanded = expandedFolders.has(item.id);
      return (
        <MaterialFileIcon
          folderName={item.title}
          isFolder={true}
          isOpen={isExpanded}
          size={16}
        />
      );
    } else {
      return (
        <MaterialFileIcon
          fileName={item.title}
          isFolder={false}
          size={16}
        />
      );
    }
  };

  // 递归渲染文件
  const renderItems = (items: KnowledgeItem[], level: number = 0): React.ReactNode => {
    return items.map(item => {
      const isExpanded = expandedFolders.has(item.id);
      const isSelected = selectedItem === item.id;
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.id} className="knowledge-item-wrapper">
          <div
            className={`knowledge-item ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: item.type === 'folder' ? '28px' : '73px' }}
            onClick={() => handleItemClick(item)}
            onDoubleClick={() => handleItemDoubleClick(item)}
          >
            {item.type === 'folder' && (
              <span className={`chevron ${isExpanded ? 'expanded' : ''}`}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 4l4 4-4 4V4z"/>
                </svg>
              </span>
            )}
            <span className="item-icon">{getFileIcon(item)}</span>
            <span className="item-title">{item.title}</span>
            {item.type === 'file' && (
              <>
                {/* 处理状态显示 */}
                {(() => {
                  const status = item.metadata?.processingStatus;
                  const progress = item.metadata?.processingProgress;
                  
                  // 显示处理状态（pending、processing、completed、error）
                  if (status) {
                    return (
                      <span className="item-processing-status">
                        {status === 'processing' && (
                          <span className="processing-indicator" title={`处理中 ${progress !== undefined ? progress + '%' : ''}`}>
                            <span className="spinner"></span>
                            {progress !== undefined && (
                              <span className="progress-text">{progress}%</span>
                            )}
                          </span>
                        )}
                        {status === 'pending' && (
                          <span className="pending-indicator" title="等待处理">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                              <circle cx="6" cy="6" r="2"/>
                            </svg>
                          </span>
                        )}
                        {status === 'completed' && (
                          <span className="completed-indicator" title="处理完成">
                            <CheckIcon className="check-icon" />
                          </span>
                        )}
                        {status === 'error' && (
                          <span className="error-indicator" title="处理失败">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M6 0C2.69 0 0 2.69 0 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm1 9H5V7h2v2zm0-4H5V3h2v2z"/>
                            </svg>
                          </span>
                        )}
                      </span>
                    );
                  }
                  return null;
                })()}
                <span className="item-actions">
                  <button
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileDelete?.(item);
                    }}
                    title="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916Z"/>
                    </svg>
                  </button>
                </span>
              </>
            )}
          </div>
          {item.type === 'folder' && isExpanded && hasChildren && (
            <div className="folder-children">
              {renderItems(item.children || [], level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // 统计信息
  const getTotalFiles = (items: KnowledgeItem[]): number => {
    let count = 0;
    items.forEach(item => {
      if (item.type === 'file') {
        count++;
      }
      if (item.children) {
        count += getTotalFiles(item.children);
      }
    });
    return count;
  };

  const totalFiles = getTotalFiles(currentKnowledgeItems);

  return (
    <div className="knowledge-base-view">
      <div className="knowledge-header">
        <div className="header-title">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
          </svg>
          <div className="title-content">
            <h2>{knowledgeTitle}</h2>
            {knowledgeDescription && (
              <p className="knowledge-description">{knowledgeDescription}</p>
            )}
          </div>
        </div>
        <div className="header-middle">
          {configChanged && (
            <span className="config-changed-warning">
              * 配置发生改变，请更新知识库。
            </span>
          )}
        </div>
        <div className="header-actions">
          {hasFailedFiles && (
            <button
              type="button"
              className={`action-button retry-button ${isRetryingFailedFiles ? 'active' : ''}`}
              onClick={handleRetryFailedFiles}
              disabled={isRetryingFailedFiles}
              title={
                isRetryingFailedFiles
                  ? '正在重试失败的文件，请稍候'
                  : `检测到 ${failedFiles.length} 个处理失败的文件，点击重试`
              }
            >
              <span className={`retry-icon ${isRetryingFailedFiles ? 'spinning' : ''}`}>
                <RefreshIcon />
              </span>
              <span className="retry-badge">{failedFiles.length}</span>
            </button>
          )}
          {showSearchInput && (
            <div className="search-input-wrapper">
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="搜索文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleToggleSearch();
                  }
                }}
              />
              {searchQuery && (
                <button
                  className="clear-button"
                  onClick={handleClearSearch}
                  title="清除"
                >
                  <ClearIcon />
                </button>
              )}
            </div>
          )}
          <button 
            className={`action-button ${showSearchInput ? 'active' : ''}`}
            onClick={handleToggleSearch}
            title="搜索过滤"
          >
            <SearchFilterIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleOpenSettings}
            title="知识库设置"
          >
            <SettingsIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleRefresh}
            title="更新"
          >
            <RefreshIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleSort}
            title="排序"
          >
            <SortIcon />
          </button>
          <button 
            ref={addButtonRef}
            className={`action-button ${showAddMenu ? 'active' : ''}`}
            onClick={handleAddFile}
            title="添加文件"
          >
            <AddDocumentIcon />
          </button>
        </div>
      </div>

      {/* 添加文件菜单 */}
      <AddFileMenu
        isOpen={showAddMenu}
        onClose={() => setShowAddMenu(false)}
        anchorEl={addButtonRef.current}
        onImportFile={handleImportFile}
        onImportFolder={handleImportFolder}
        onImportNote={handleImportNote}
        notes={mockNotes}
        knowledgeId={knowledgeId}
      />

      <div className="knowledge-content">
        {currentKnowledgeItems.length > 0 ? (
          renderItems(currentKnowledgeItems)
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
              <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
            </svg>
            <p>该知识库暂无文件</p>
          </div>
        )}
      </div>
    </div>
  );
};

