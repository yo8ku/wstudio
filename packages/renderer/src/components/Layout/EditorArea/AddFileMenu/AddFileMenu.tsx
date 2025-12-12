/**
 * 添加文件菜单组件
 * 功能：知识库添加文件的下拉菜单，支持导入本地文件、文件夹和笔记
 * 描述：点击"添加文件"按钮后弹出的菜单，提供三种导入选项，笔记选项支持子菜单
 */

import React, { useEffect, useRef, useState } from 'react';
import { ImportNoteDialog, ImportFileInfo } from '../ImportNoteDialog/ImportNoteDialog';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';
import { ragProcessingService } from '../../../../services/RAGProcessingService';
import { toastService } from '../../../../services/ToastService';
import './AddFileMenu.scss';

interface Note {
  id: string;
  title: string;
}

interface AddFileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  onImportFile: () => void;
  onImportFolder: () => void;
  onImportNote: (noteId: string) => void;
  notes?: Note[]; // 笔记列表，用于子菜单
  knowledgeId?: string; // 知识库ID，用于导入笔记时确定目标文件夹
}

// 文件图标
const FileIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.707A1 1 0 0 0 13.707 4L10 .293A1 1 0 0 0 9.293 0H4zm4.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"/>
  </svg>
);

// 文件夹图标
const FolderIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M.54 3.87L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31z"/>
  </svg>
);

// 笔记图标
const NoteIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 13.5 1h-11zM4 4h8v1H4V4zm0 2.5h8v1H4v-1zm0 2.5h5v1H4V9z"/>
  </svg>
);

// 右箭头图标（子菜单指示器）
const ChevronRightIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
  </svg>
);

export const AddFileMenu: React.FC<AddFileMenuProps> = ({
  isOpen,
  onClose,
  anchorEl,
  onImportFile,
  onImportFolder,
  onImportNote,
  notes = [],
  knowledgeId,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [showSubmenu, setShowSubmenu] = useState(false);
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  // 调试：监听showImportDialog 的变化
  useEffect(() => {
    console.log('showImportDialog 变化:', showImportDialog);
  }, [showImportDialog]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideMenu = menuRef.current?.contains(target);
      const clickedInsideSubmenu = submenuRef.current?.contains(target);
      const clickedAnchor = anchorEl?.contains(target);

      if (!clickedInsideMenu && !clickedInsideSubmenu && !clickedAnchor) {
        onClose();
        setShowSubmenu(false);
      }
    };

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorEl]);

  // ESC 键关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showSubmenu) {
          // 如果子菜单打开，先关闭子菜单
          setShowSubmenu(false);
        } else {
          // 否则关闭主菜单
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, showSubmenu, onClose]);

  // 关闭菜单时重置子菜单状态和弹窗状态
  // 注意：不在这里重置showImportDialog，因为会导致弹窗无法显示
  useEffect(() => {
    if (!isOpen) {
      setShowSubmenu(false);
      setSubmenuPosition(null);
    }
  }, [isOpen]);

  // 计算菜单位置
  const getMenuPosition = () => {
    if (!anchorEl) return {};

    const rect = anchorEl.getBoundingClientRect();
    return {
      top: `${rect.bottom + 4}px`,
      right: `${window.innerWidth - rect.right}px`,
    };
  };

  const handleMenuItemClick = (action: () => void) => {
    console.log('[AddFileMenu] handleMenuItemClick 被调用');
    action();
    onClose();
  };

  // 如果菜单关闭且没有打开的弹窗，则不渲染
  if (!isOpen && !showImportDialog) return null;

  // 处理笔记菜单项的鼠标悬停
  const handleNoteMenuEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    const menuItem = event.currentTarget;
    const rect = menuItem.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();

    if (menuRect) {
      // 计算子菜单宽度（预估）
      const submenuWidth = 250; // 预估宽度
      const windowWidth = window.innerWidth;
      const overlap = 51; // 重叠主菜单边框，实现无缝贴合
      
      // 判断右边是否有足够空间
      const spaceOnRight = windowWidth - menuRect.right;
      const showOnLeft = spaceOnRight < submenuWidth;
      
      // 计算绝对屏幕坐标
      setSubmenuPosition({
        top: rect.top, // 直接使用菜单项的屏幕顶部坐标
        left: showOnLeft 
          ? menuRect.left - submenuWidth + overlap  // 左侧显示
          : menuRect.right - overlap, // 右侧显示，重叠边框
      });
      setShowSubmenu(true);
    }
  };

  // 处理笔记菜单项的鼠标离开
  const handleNoteMenuLeave = () => {
    // 延迟关闭，给用户时间移动到子菜单
    setTimeout(() => {
      if (!submenuRef.current?.matches(':hover') && !menuRef.current?.querySelector('.menu-item.has-submenu:hover')) {
        setShowSubmenu(false);
      }
    }, 100);
  };

  // 处理子菜单鼠标离开
  const handleSubmenuLeave = () => {
    // 延迟关闭，给用户时间在子菜单内移动
    setTimeout(() => {
      if (!submenuRef.current?.matches(':hover') && !menuRef.current?.querySelector('.menu-item.has-submenu:hover')) {
        setShowSubmenu(false);
      }
    }, 100);
  };

  // 选择笔记
  const handleNoteSelect = (noteId: string) => {
    onImportNote(noteId);
    onClose();
    setShowSubmenu(false);
  };

  return (
    <>
      {/* 菜单 - 只在 isOpen 时显示 */}
      {isOpen && (
        <>
          <div
            ref={menuRef}
            className="add-file-menu"
            style={getMenuPosition()}
          >
            <div className="menu-item" onClick={() => handleMenuItemClick(onImportFile)}>
              <FileIcon />
              <span>本地文件</span>
            </div>
            <div className="menu-item" onClick={() => handleMenuItemClick(onImportFolder)}>
              <FolderIcon />
              <span>本地文件夹</span>
            </div>
            <div className="menu-separator" />
            <div
              className={`menu-item has-submenu ${showSubmenu ? 'active' : ''}`}
              onMouseEnter={handleNoteMenuEnter}
              onMouseLeave={handleNoteMenuLeave}
            >
              <NoteIcon />
              <span>笔记</span>
              <ChevronRightIcon />
            </div>
          </div>

          {/* 子菜单 - 导入笔记 */}
          {showSubmenu && submenuPosition && (
            <div
              ref={submenuRef}
              className="add-file-submenu"
              style={{
                top: `${submenuPosition.top}px`,
                left: `${submenuPosition.left}px`,
              }}
              onMouseEnter={() => {
                // 鼠标进入子菜单时，保持打开状态
              }}
              onMouseLeave={handleSubmenuLeave}
            >
              <div
                className="menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('点击导入笔记');
                  setShowImportDialog(true);
                  onClose();
                  setShowSubmenu(false);
                }}
              >
                <NoteIcon />
                <span>导入笔记</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* 导入笔记对话框 - 始终渲染，由 visible 控制显示 */}
      <ImportNoteDialog
        visible={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        knowledgeId={knowledgeId}
        onImport={async (selectedFiles: ImportFileInfo[]) => {
          console.log('[AddFileMenu] 导入笔记文件:', selectedFiles, '到知识库:', knowledgeId);
          
          if (!knowledgeId) {
            console.error('[AddFileMenu] knowledgeId 未提供，无法导入文件');
            return;
          }
          
          // 获取工作区目录
          const workspaceResult = await window.electron?.workspace?.getDir();
          if (!workspaceResult?.success || !workspaceResult.data) {
            console.error('[AddFileMenu] 获取工作区目录失败');
            return;
          }
          
          const workspaceDir = workspaceResult.data;
          // 知识库文件夹路径：工作区/KnowledgeBases/知识库ID
          const knowledgeBasePath = `${workspaceDir}\\KnowledgeBases\\${knowledgeId}`;
          
          console.log('[AddFileMenu] 知识库文件夹路径:', knowledgeBasePath);
          
          // 收集所有需要创建的文件夹路径（去重）
          const folderPathsSet = new Set<string>();
          selectedFiles.forEach(file => {
            if (file.folderPath) {
              // 收集所有层级的文件夹路径
              const parts = file.folderPath.split('/').filter(p => p);
              let currentPath = '';
              parts.forEach(part => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                folderPathsSet.add(currentPath);
              });
            }
          });
          
          // 创建所有需要的文件夹
          const folderPaths = Array.from(folderPathsSet).sort(); // 排序确保父文件夹先创建
          for (const folderPath of folderPaths) {
            const fullFolderPath = `${knowledgeBasePath}\\${folderPath.replace(/\//g, '\\\\')}`;
            console.log('[AddFileMenu] 创建文件夹:', fullFolderPath);
            
            try {
              // 使用递归创建文件夹（确保父文件夹也被创建）
              await window.electron?.folder?.ensureDir?.(fullFolderPath);
            } catch (error) {
              console.error('[AddFileMenu] 创建文件夹失败:', fullFolderPath, error);
            }
          }
          
          // 统计导入结果
          let importedCount = 0;
          let skippedCount = 0;
          
          // 复制每个选中的笔记文件到对应的知识库文件夹
          for (const fileInfo of selectedFiles) {
            try {
              // 目标文件夹路径
              let targetFolderPath = knowledgeBasePath;
              if (fileInfo.folderPath) {
                targetFolderPath = `${knowledgeBasePath}\\${fileInfo.folderPath.replace(/\//g, '\\\\')}`;
              }
              
              console.log('[AddFileMenu] 复制文件:', fileInfo.fileName, '到:', targetFolderPath);
              
              // 先检查文件内容长度（最小 300 字符）
              const fileReadResult = await window.electron?.file?.read(fileInfo.filePath);
              if (!fileReadResult?.success || !fileReadResult.data?.content) {
                toastService.error(`无法读取文件: ${fileInfo.fileName}`);
                continue;
              }
              
              // 去除空白字符（但保留换行符），防止恶意上传空内容
              const contentWithoutSpaces = fileReadResult.data.content.replace(/[^\S\n]/g, '');
              const contentLength = contentWithoutSpaces.length;
              const MIN_DOCUMENT_LENGTH = 300;
              
              if (contentLength < MIN_DOCUMENT_LENGTH) {
                toastService.error(
                  `文档 "${fileInfo.fileName}" 过短（${contentLength} 字符），最少需要 ${MIN_DOCUMENT_LENGTH} 字符`
                );
                continue;
              }
              
              // 调用 IPC 复制文件到知识库文件夹
              const copyResult = await window.electron?.folder?.copyToFolder(fileInfo.filePath, targetFolderPath);
              
              if (copyResult?.success && copyResult.data) {
                const { path: newFilePath, name: newFileName } = copyResult.data;
                console.log('[AddFileMenu] 文件复制成功:', newFilePath);
                
                // 添加文件到知识库数据（带文件夹路径）
                await knowledgeBaseService.addFileToKnowledgeBase(
                  knowledgeId,
                  newFilePath,
                  newFileName,
                  fileInfo.folderPath // 传递文件夹路径
                );
                console.log('[AddFileMenu] 文件已添加到知识库数据，文件夹路径:', fileInfo.folderPath);
                
                // 更新处理状态为 processing
                await knowledgeBaseService.updateFileProcessingStatus(newFilePath, 'processing', 10);
                
                // 立即触发知识库刷新事件，更新UI显示处理状态
                window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                  detail: { knowledgeId }
                }));
                
                // 进度更新回调函数
                const handleProgress = async (filePath: string, progress: number) => {
                  await knowledgeBaseService.updateFileProcessingStatus(filePath, 'processing', progress);
                  // 触发知识库刷新事件，更新UI显示
                  window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                    detail: { knowledgeId }
                  }));
                };
                
                // 后台异步处理文件（分块、嵌入、存储）
                ragProcessingService.uploadFilesToKnowledgeBase(
                  [newFilePath],
                  knowledgeId,
                  { onProgress: handleProgress }
                ).then(() => {
                  // 处理完成，更新状态为 completed
                  knowledgeBaseService.updateFileProcessingStatus(newFilePath, 'completed', 100).then(() => {
                    // 触发知识库刷新事件，更新UI显示
                    window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                      detail: { knowledgeId }
                    }));
                  }).catch(() => {
                    // 静默处理错误
                  });
                }).catch((error) => {
                  // 处理失败，更新状态为 error
                  knowledgeBaseService.updateFileProcessingStatus(newFilePath, 'error', 0).then(() => {
                    // 触发知识库刷新事件，更新UI显示
                    window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                      detail: { knowledgeId }
                    }));
                  }).catch(() => {
                    // 静默处理错误
                  });
                  
                  // 显示错误提示
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  let displayMessage = '上传知识库失败';
                  
                  // 提取更友好的错误信息
                  if (errorMessage.includes('0xC0000005') || errorMessage.includes('3221225477') || errorMessage.includes('访问冲突')) {
                    displayMessage = 'Python 环境错误：访问冲突。请检查 Visual C++ 运行时库或重新安装应用程序';
                  } else if (errorMessage.includes('ModuleNotFoundError') || errorMessage.includes('No module named')) {
                    displayMessage = 'Python 依赖缺失，正在自动安装，请稍后重试';
                  } else if (errorMessage.includes('Failed to process file paths') || errorMessage.includes('处理文件路径失败')) {
                    displayMessage = '文件处理失败，请检查文件格式或重试';
                  } else if (errorMessage.includes('Python process exited') || errorMessage.includes('Python 进程退出')) {
                    // 检查是否是访问冲突错误
                    if (errorMessage.includes('0xC0000005') || errorMessage.includes('3221225477') || errorMessage.includes('访问冲突')) {
                      displayMessage = 'Python 环境错误：访问冲突。请检查 Visual C++ 运行时库或重新安装应用程序';
                    } else {
                      displayMessage = 'Python 服务异常退出，请检查环境配置或查看控制台获取详细信息';
                    }
                  } else if (errorMessage.includes('Python process') || errorMessage.includes('Python 服务') || errorMessage.includes('无法启动 Python')) {
                    displayMessage = 'Python 服务启动失败，请检查环境配置';
                  } else if (errorMessage.includes('处理文件时发生错误')) {
                    // 提取具体的错误信息
                    const match = errorMessage.match(/处理文件时发生错误:\s*(.+)/);
                    if (match && match[1]) {
                      displayMessage = `文件处理失败: ${match[1].substring(0, 100)}`;
                    } else {
                      displayMessage = '文件处理失败，请查看控制台获取详细信息';
                    }
                  } else if (errorMessage.includes('向量存储未初始化')) {
                    displayMessage = '向量存储未初始化，请重试';
                  } else if (errorMessage.includes('超时')) {
                    displayMessage = '处理超时，请检查文件大小或网络连接';
                  } else if (errorMessage) {
                    // 如果错误信息较短且有意义，直接显示
                    if (errorMessage.length < 100) {
                      displayMessage = errorMessage;
                    } else {
                      // 尝试提取关键错误信息
                      const lines = errorMessage.split('\n');
                      const firstLine = lines[0] || errorMessage;
                      displayMessage = firstLine.length < 100 ? firstLine : firstLine.substring(0, 50) + '...';
                    }
                  }
                  
                  toastService.error(displayMessage);
                  console.error('[AddFileMenu] 文件处理失败:', {
                    error,
                    errorMessage,
                    filePath: newFilePath,
                    knowledgeId,
                  });
                });
                
                importedCount++;
              } else {
                console.error('[AddFileMenu] 文件复制失败:', copyResult?.error);
              }
            } catch (error) {
              console.error('[AddFileMenu] 导入笔记文件失败:', fileInfo.filePath, error);
            }
          }
          
          // 输出导入结果统计
          console.log(`[AddFileMenu] 导入完成: 成功导入 ${importedCount} 个文件，跳过 ${skippedCount} 个已存在的文件`);
          
          // 如果有文件被跳过，可以提示用户（可选）
          if (skippedCount > 0) {
            console.log(`[AddFileMenu] 提示: ${skippedCount} 个文件已存在于知识库中，已自动跳过`);
          }
          
          // 触发知识库刷新事件
          window.dispatchEvent(new CustomEvent('knowledge-base-updated', {
            detail: { knowledgeId }
          }));
          
          // 自动打开知识库标签页
          if (knowledgeId && importedCount > 0) {
            // 重新加载知识库数据以获取最新信息
            const data = await knowledgeBaseService.loadFromStorage();
            const knowledgeBase = data.created.find(kb => kb.id === knowledgeId);
            
            if (knowledgeBase) {
              // 触发打开知识库事件，自动打开对应知识库标签页
              window.dispatchEvent(new CustomEvent('open-knowledge', {
                detail: {
                  id: knowledgeBase.id,
                  title: knowledgeBase.title,
                  description: knowledgeBase.metadata?.description || '',
                  items: data.created,
                  knowledgeData: {
                    id: knowledgeBase.id,
                    items: data.created
                  }
                }
              }));
            }
          }
          
          setShowImportDialog(false);
        }}
      />
    </>
  );
};

