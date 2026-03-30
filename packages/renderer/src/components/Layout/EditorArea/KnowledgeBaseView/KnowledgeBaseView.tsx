/**
 * 知识库视图组件
 * 功能：在编辑器标签页中显示知识库的文件列表
 * 描述：提供文件浏览、打开、删除等操作
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

type KnowledgeBaseViewTranslationValue = string | number | boolean;

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  knowledgeId,
  knowledgeTitle,
  knowledgeDescription,
  items,
  onFileOpen,
  onFileDelete
}) => {
  const { t } = useTranslation();
  const translateText = useCallback((
    key: string,
    defaultValue: string,
    values?: Record<string, KnowledgeBaseViewTranslationValue>,
  ): string => String(t(key, values ? { defaultValue, ...values } : { defaultValue })), [t]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [isRetryingFailedFiles, setIsRetryingFailedFiles] = useState(false);
  const [hoveredErrorItem, setHoveredErrorItem] = useState<string | null>(null);

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
    toastService.success(translateText('knowledgeBase.view.refreshed', '知识库已刷新'));
  }, [knowledgeId, translateText]);

  // 打开设置面板（触发事件通知侧边栏打开）
  const handleOpenSettings = useCallback(() => {
    // 触发事件，通知侧边栏打开知识库设置面板
    window.dispatchEvent(new CustomEvent('open-knowledge-settings', {
      detail: { knowledgeId }
    }));
  }, [knowledgeId, translateText]);

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

      // 知识库直接使用原始文件路径，不复制文件

      let importedCount = 0;
      let failedCount = 0;

      // 处理每个文件
      for (const filePath of filePaths) {
        try {
          const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
          
          // 从存储中获取最新的知识库数据，检查文件处理状态
          const latestData = await knowledgeBaseService.loadFromStorage();
          const latestKnowledgeBase = latestData.created.find(kb => kb.id === knowledgeId);
          const latestChildren = latestKnowledgeBase?.children || [];
          
          // 递归查找文件
          const findExistingFile = (items: KnowledgeItem[]): KnowledgeItem | undefined => {
            for (const item of items) {
              if (item.type === 'file' && item.title === fileName) {
                return item;
              }
              if (item.children) {
                const found = findExistingFile(item.children);
                if (found) return found;
              }
            }
            return undefined;
          };
          
          const existingFile = findExistingFile(latestChildren);
          let shouldAddNewFile = true;
          let existingFileId: string | null = null;
          
          console.log(`[KnowledgeBaseView] 检查文件: ${fileName}, 存在: ${!!existingFile}, 状态: ${existingFile?.metadata?.processingStatus}`);
          
          if (existingFile) {
            const processingStatus = existingFile.metadata?.processingStatus;
            
            // 如果文件正在处理中，阻止重复上传
            if (processingStatus === 'processing' || processingStatus === 'pending') {
              console.log(`[KnowledgeBaseView] 阻止重复上传: ${fileName}, 状态: ${processingStatus}`);
              toastService.warning(translateText(
                'knowledgeBase.view.fileUploading',
                '文件 "{{fileName}}" 正在上传中，请等待完成！',
                { fileName },
              ));
              failedCount++;
              continue;
            }
            
            console.log(`[KnowledgeBaseView] 文件 "${fileName}" 已存在，将更新文件`);
            // 记录现有文件ID，稍后更新而不是删除
            existingFileId = existingFile.id;
            shouldAddNewFile = false;
          }
          
          // 先读取文件内容检查长度（最小 300 字符）
          const fileReadResult = await window.electron?.file?.read(filePath);
          if (!fileReadResult?.success || !fileReadResult.data?.content) {
            toastService.error(translateText(
              'knowledgeBase.view.readFileFailed',
              '无法读取文件: {{fileName}}',
              { fileName },
            ));
            failedCount++;
            continue;
          }
          
          // 去除空白字符（但保留换行符），防止恶意上传空内容
          const contentWithoutSpaces = fileReadResult.data.content.replace(/[^\S\n]/g, '');
          const contentLength = contentWithoutSpaces.length;
          const MIN_DOCUMENT_LENGTH = 300;
          
          if (contentLength < MIN_DOCUMENT_LENGTH) {
            toastService.error(translateText(
              'knowledgeBase.view.documentTooShort',
              '文档 "{{fileName}}" 过短（{{contentLength}} 字符），最少需要 {{minLength}} 字符',
              {
                fileName,
                contentLength,
                minLength: MIN_DOCUMENT_LENGTH,
              },
            ));
            failedCount++;
            continue;
          }
          
          // 直接使用原始文件路径，不复制文件
          if (shouldAddNewFile) {
            // 添加新文件到知识库
            console.log(`[KnowledgeBaseView] 添加新文件到知识库: ${fileName}`);
            await knowledgeBaseService.addFileToKnowledgeBase(
              knowledgeId,
              filePath,
              fileName
            );
          } else if (existingFileId) {
            // 更新现有文件的元数据
            console.log(`[KnowledgeBaseView] 更新现有文件: ${fileName}`);
            await knowledgeBaseService.updateKnowledgeBase(existingFileId, {
              path: filePath,
              metadata: {
                lastModified: new Date(),
                processingStatus: undefined,
                processingProgress: undefined,
              },
            });
          }
          
          // 更新处理状态为 processing
          await knowledgeBaseService.updateFileProcessingStatus(filePath, 'processing', 10);
          
          // 触发知识库刷新事件
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId }
          }));
          
          // 进度更新回调
          const handleProgress = async (progressFilePath: string, progress: number) => {
            if (progressFilePath !== filePath) return;
            
            // 当进度达到 100% 时，立即将状态更新为 completed
            const status = progress >= 100 ? 'completed' : 'processing';
            await knowledgeBaseService.updateFileProcessingStatus(progressFilePath, status, progress);
            window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
              detail: { knowledgeId }
            }));
          };
          
          // 后台异步处理文件（切分 > 向量化 > 入库）
          ragProcessingService.uploadFilesToKnowledgeBase(
            [filePath],
            knowledgeId,
            { onProgress: handleProgress }
          ).then(async () => {
            // 确保状态为 completed
            await knowledgeBaseService.updateFileProcessingStatus(filePath, 'completed', 100);
            
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
            
            // 更新状态为 error
            knowledgeBaseService.updateFileProcessingStatus(filePath, 'error', 0).then(() => {
              window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: { knowledgeId }
              }));
            }).catch(() => {});
            console.error('[KnowledgeBaseView] 文件处理失败:', errorMessage);
            
            // 显示友好的错误提示
            toastService.error(translateText(
              'knowledgeBase.view.fileProcessingFailed',
              '文件处理失败',
            ));
          });
          
          importedCount++;
        } catch (error) {
          failedCount++;
          console.error('[KnowledgeBaseView] 导入文件失败:', filePath, error);
        }
      }

      // 显示导入结果
      if (importedCount > 0) {
        toastService.success(translateText(
          'knowledgeBase.view.importFilesSuccess',
          '成功导入 {{importedCount}} 个文件{{failedSuffix}}',
          {
            importedCount,
            failedSuffix: failedCount > 0
              ? translateText(
                'knowledgeBase.view.failedCountSuffix',
                '，{{failedCount}} 个文件失败',
                { failedCount },
              )
              : '',
          },
        ));
      } else if (failedCount > 0) {
        toastService.error(translateText(
          'knowledgeBase.view.importFailed',
          '导入失败，共 {{failedCount}} 个文件',
          { failedCount },
        ));
      }

      // 触发知识库刷新事件
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastService.error(translateText(
        'knowledgeBase.view.importFilesFailedWithMessage',
        '导入文件失败: {{message}}',
        { message: errorMessage },
      ));
      console.error('[KnowledgeBaseView] 导入文件失败:', error);
    }
  }, [knowledgeId, translateText]);

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
        toastService.warning(translateText(
          'knowledgeBase.view.importFolderNoSupportedFiles',
          '所选文件夹中没有支持的文件（仅支持 .md, .markdown, .json, .txt 文件）',
        ));
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
            
            // 检查文件是否已存在
            const allData = await knowledgeBaseService.loadFromStorage();
            const knowledgeBase = allData.created.find(kb => kb.id === knowledgeId);
            
            // 递归查找文件
            const findFileInChildren = (items: KnowledgeItem[]): KnowledgeItem | undefined => {
              for (const item of items) {
                if (item.path === virtualPath) {
                  return item;
                }
                if (item.children) {
                  const found = findFileInChildren(item.children);
                  if (found) return found;
                }
              }
              return undefined;
            };
            
            const existingFile = knowledgeBase?.children ? findFileInChildren(knowledgeBase.children) : undefined;
            
            let addedFile: KnowledgeItem;
            if (existingFile) {
              const processingStatus = existingFile.metadata?.processingStatus;
              
              // 如果文件正在处理中，跳过该文件
              if (processingStatus === 'processing' || processingStatus === 'pending') {
                console.log(`[KnowledgeBaseView] 文件 "${fileName}" 正在处理中，跳过`);
                failedCount++;
                continue;
              }
              
              // 文件已存在，删除旧记录并重新添加（用户可能更新了文档内容）
              console.log(`[KnowledgeBaseView] 文件 "${fileName}" 已存在，将删除旧记录并重新上传`);
              try {
                await knowledgeBaseService.deleteItem(existingFile.id);
              } catch (error) {
                console.warn('[KnowledgeBaseView] 删除旧文件记录失败:', error);
              }
            }
            
            // 添加文件到知识库数据（传递文件内容，实现知识库与资源管理器隔离）
            addedFile = await knowledgeBaseService.addFileToKnowledgeBase(
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
        toastService.success(translateText(
          'knowledgeBase.view.importFolderSuccess',
          '成功导入 {{importedCount}} 个文件{{failedSuffix}}，开始向量化处理...',
          {
            importedCount,
            failedSuffix: failedCount > 0
              ? translateText(
                'knowledgeBase.view.failedCountSuffix',
                '，{{failedCount}} 个文件失败',
                { failedCount },
              )
              : '',
          },
        ));
      } else if (failedCount > 0) {
        toastService.error(translateText(
          'knowledgeBase.view.importFailed',
          '导入失败，共 {{failedCount}} 个文件',
          { failedCount },
        ));
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
              { onProgress: handleProgress }
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
            
            // 显示友好的错误提示
            let displayMessage = translateText(
              'knowledgeBase.view.batchVectorizationFailed',
              '向量化处理失败',
            );
            if (errorMessage.length < 100) {
              displayMessage = translateText(
                'knowledgeBase.view.batchVectorizationFailedWithMessage',
                '向量化处理失败: {{message}}',
                { message: errorMessage },
              );
            }
            toastService.error(displayMessage);
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
      toastService.error(translateText(
        'knowledgeBase.view.importFolderFailedWithMessage',
        '导入文件夹失败: {{message}}',
        { message: errorMessage },
      ));
      console.error('[KnowledgeBaseView] 导入文件夹失败:', error);
    }
  }, [knowledgeId, translateText]);

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
      toastService.error(translateText(
        'knowledgeBase.view.retryMissingPath',
        '无法定位需要重试的文件路径',
      ));
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
            { onProgress: handleProgressUpdate }
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
        toastService.success(translateText(
          'knowledgeBase.view.retrySuccess',
          '失败的文件已重新处理完成',
        ));
        
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
        toastService.error(translateText(
          'knowledgeBase.view.retryAllFailed',
          '重试失败，请检查控制台日志获取更多信息',
        ));
      } else {
        const failedTitles = failedRetryResults.slice(0, 3).map(item => item.title).join('、');
        toastService.warning(translateText(
          'knowledgeBase.view.retryPartialFailed',
          '部分文件重试失败：{{titles}}{{moreSuffix}}',
          {
            titles: failedTitles,
            moreSuffix: failedRetryResults.length > 3
              ? translateText('knowledgeBase.view.retryMoreSuffix', ' 等')
              : '',
          },
        ));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toastService.error(
        message
          || translateText('knowledgeBase.view.retryDefaultError', '重试失败，请稍后再试'),
      );
    } finally {
      setIsRetryingFailedFiles(false);
    }
  }, [failedFiles, isRetryingFailedFiles, knowledgeId, translateText]);

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

  // 重新上传失败的文件
  const handleRetryFile = useCallback(async (item: KnowledgeItem) => {
    if (!item.path) {
      toastService.error(translateText(
        'knowledgeBase.view.retryFilePathMissing',
        '无法获取文件路径',
      ));
      return;
    }

    try {
      // 更新状态为 processing
      await knowledgeBaseService.updateFileProcessingStatus(item.path, 'processing', 10);
      
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));

      // 进度更新回调
      const handleProgress = async (progressFilePath: string, progress: number) => {
        if (progressFilePath !== item.path) return;
        const status = progress >= 100 ? 'completed' : 'processing';
        await knowledgeBaseService.updateFileProcessingStatus(progressFilePath, status, progress);
        window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
          detail: { knowledgeId }
        }));
      };

      // 重新处理文件
      await ragProcessingService.uploadFilesToKnowledgeBase(
        [item.path],
        knowledgeId,
        { onProgress: handleProgress }
      );

      // 确保状态为 completed
      await knowledgeBaseService.updateFileProcessingStatus(item.path, 'completed', 100);
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));

      toastService.success(translateText(
        'knowledgeBase.view.retryFileSuccess',
        '文件 "{{title}}" 重新上传成功',
        { title: item.title },
      ));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await knowledgeBaseService.updateFileProcessingStatus(item.path, 'error', 0);
      window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
        detail: { knowledgeId }
      }));
      toastService.error(translateText(
        'knowledgeBase.view.retryFileFailed',
        '重新上传失败: {{message}}',
        { message: errorMessage },
      ));
    }
  }, [knowledgeId, translateText]);

  // 递归渲染文件（失败文件排在最前面）
  const renderItems = (items: KnowledgeItem[], level: number = 0): React.ReactNode => {
    // 对文件列表排序：失败文件在最前面
    const sortedItems = [...items].sort((a, b) => {
      const aIsError = a.type === 'file' && a.metadata?.processingStatus === 'error';
      const bIsError = b.type === 'file' && b.metadata?.processingStatus === 'error';
      
      if (aIsError && !bIsError) return -1;
      if (!aIsError && bIsError) return 1;
      return 0;
    });

    return sortedItems.map(item => {
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
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 4.5 3.5 3.5L6 11.5"/>
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
                          <span
                            className="processing-indicator"
                            title={progress !== undefined
                              ? translateText(
                                'knowledgeBase.view.status.processingWithProgress',
                                '处理中 {{progress}}%',
                                { progress },
                              )
                              : translateText(
                                'knowledgeBase.view.status.processing',
                                '处理中',
                              )}
                          >
                            <span className="spinner"></span>
                            {progress !== undefined && (
                              <span className="progress-text">{progress}%</span>
                            )}
                          </span>
                        )}
                        {status === 'pending' && (
                          <span
                            className="pending-indicator"
                            title={translateText('knowledgeBase.view.status.pending', '等待处理')}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                              <circle cx="6" cy="6" r="2"/>
                            </svg>
                          </span>
                        )}
                        {status === 'completed' && (
                          <span
                            className="completed-indicator"
                            title={translateText('knowledgeBase.view.status.completed', '处理完成')}
                          >
                            <CheckIcon className="check-icon" />
                          </span>
                        )}
                        {status === 'error' && (
                          <span 
                            className="error-indicator" 
                            title={hoveredErrorItem === item.id
                              ? translateText('knowledgeBase.view.status.retry', '点击重新上传')
                              : translateText('knowledgeBase.view.status.error', '处理失败')}
                            onMouseEnter={() => setHoveredErrorItem(item.id)}
                            onMouseLeave={() => setHoveredErrorItem(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryFile(item);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {hoveredErrorItem === item.id ? (
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
                                <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                <path d="M6 0C2.69 0 0 2.69 0 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm1 9H5V7h2v2zm0-4H5V3h2v2z"/>
                              </svg>
                            )}
                          </span>
                        )}
                      </span>
                    );
                  }
                  return null;
                })()}
                {/* 只有在文件不处于处理中状态时才显示删除按钮 */}
                {item.metadata?.processingStatus !== 'processing' && item.metadata?.processingStatus !== 'pending' && (
                  <span className="item-actions">
                    <button
                      className="action-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFileDelete?.(item);
                      }}
                      title={translateText('knowledgeBase.view.delete', '删除')}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.995a.59.59 0 0 0-.01 0H11Zm1.958 1-.846 10.58a1 1 0 0 1-.997.92h-6.23a1 1 0 0 1-.997-.92L3.042 3.5h9.916Z"/>
                      </svg>
                    </button>
                  </span>
                )}
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
              {translateText(
                'knowledgeBase.view.configChanged',
                '* 配置发生改变，请更新知识库。',
              )}
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
                  ? translateText(
                    'knowledgeBase.view.retryInProgressTitle',
                    '正在重试失败的文件，请稍候',
                  )
                  : translateText(
                    'knowledgeBase.view.retryAvailableTitle',
                    '检测到 {{count}} 个处理失败的文件，点击重试',
                    { count: failedFiles.length },
                  )
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
                placeholder={translateText(
                  'knowledgeBase.view.searchPlaceholder',
                  '搜索文件...',
                )}
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
                  title={translateText('knowledgeBase.view.clear', '清除')}
                >
                  <ClearIcon />
                </button>
              )}
            </div>
          )}
          <button 
            className={`action-button ${showSearchInput ? 'active' : ''}`}
            onClick={handleToggleSearch}
            title={translateText('knowledgeBase.view.searchFilter', '搜索过滤')}
          >
            <SearchFilterIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleOpenSettings}
            title={translateText('knowledgeBase.view.settings', '知识库设置')}
          >
            <SettingsIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleRefresh}
            title={translateText('knowledgeBase.view.refresh', '更新')}
          >
            <RefreshIcon />
          </button>
          <button 
            className="action-button"
            onClick={handleSort}
            title={translateText('knowledgeBase.view.sort', '排序')}
          >
            <SortIcon />
          </button>
          <button 
            ref={addButtonRef}
            className={`action-button ${showAddMenu ? 'active' : ''}`}
            onClick={handleAddFile}
            title={translateText('knowledgeBase.view.addFile', '添加文件')}
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
            <p>{translateText('knowledgeBase.view.empty', '该知识库暂无文件')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

