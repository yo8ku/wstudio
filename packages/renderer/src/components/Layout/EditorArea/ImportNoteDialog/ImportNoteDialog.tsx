/**
 * 导入笔记对话框组件
 * 功能：导入本地笔记文件到知识库
 * 描述：支持搜索、多选文件并导入到指定知识库
 */

import React, { useState, useEffect, useMemo } from 'react';
import './ImportNoteDialog.scss';
import { MaterialFileIcon } from '../../../FileIcon/MaterialFileIcon';
import { knowledgeBaseService } from '../../Sidebar/KnowledgeBase/knowledgeBaseService';

interface NoteFile {
  id: string;
  title: string;
  selected: boolean;
  createdAt?: Date | string;
  fileType?: string;
  folderPath?: string; // 文件所在的文件夹路径
  relativePath?: string; // 相对于工作区的路径
}

// 树节点：可以是文件夹或文档
interface TreeNode {
  name: string; // 节点名称
  path: string; // 完整路径
  type: 'folder' | 'file'; // 节点类型
  isExpanded?: boolean; // 是否展开（仅文件夹）
  children?: TreeNode[] | Map<string, TreeNode>; // 子节点（仅文件夹），可以是数组或Map
  file?: NoteFile; // 文件数据（仅文件）
  level: number; // 层级深度
}

// 导入的文件信息
export interface ImportFileInfo {
  id: string;
  filePath: string; // 文件的完整路径
  fileName: string; // 文件名
  folderPath: string; // 相对于工作区的文件夹路径
}

export interface ImportNoteDialogProps {
  /** 是否显示对话框 */
  visible: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 导入回调 */
  onImport: (selectedFiles: ImportFileInfo[]) => void;
  /** 知识库ID，用于过滤已导入的文档 */
  knowledgeId?: string;
}

// 搜索图标 - 加粗版本
const SearchIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="7" cy="7" r="5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13.5 13.5L10.5 10.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 关闭图标 - 更大更粗
const CloseIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
  </svg>
);

// 复选框图标 - 未选中
const CheckboxUncheckedIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="12" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 复选框图标 - 已选中
const CheckboxCheckedIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor"/>
    <path d="M6 9L8.5 11.5L12 7.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 复选框图标 - 部分选中（用于文件夹）
const CheckboxPartialIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor"/>
    <path d="M6 9H12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 排序图标（升序）
const SortAscIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h9"></path>
      <path d="M4 12h7"></path>
      <path d="M4 18h7"></path>
      <path d="M15 15l3 3l3-3"></path>
      <path d="M18 6v12"></path>
    </g>
  </svg>
);

// 折叠箭头图标（向右，旋转90度为向下）
const ChevronIcon: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 16 16" 
    fill="currentColor"
    style={{
      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
    }}
  >
    <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
  </svg>
);

// 排序类型
type SortType = 'none' | 'fileType' | 'createdTime';
type SortOrder = 'asc' | 'desc';

export const ImportNoteDialog: React.FC<ImportNoteDialogProps> = ({
  visible,
  onClose,
  onImport,
  knowledgeId,
}) => {
  const [searchText, setSearchText] = useState('');
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sortType, setSortType] = useState<SortType>('none');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  // 使用 Map 来存储每个文件夹的折叠状态（true = 展开，false = 折叠）
  const [expandedFolders, setExpandedFolders] = useState<Map<string, boolean>>(new Map());
  // 已勾选的文件夹路径Set（记录哪些文件夹被勾选，用于智能层级勾选）
  const [checkedFolders, setCheckedFolders] = useState<Set<string>>(new Set());

  // 加载笔记文件
  useEffect(() => {
    if (!visible) {
      // 对话框关闭时，重置所有状态
      setNotes([]);
      setSearchText('');
      setExpandedFolders(new Map());
      setCheckedFolders(new Set());
      return;
    }

    const loadNotes = async () => {
      try {
        setIsLoading(true);
        
        // 获取工作区目录
        const workspaceResult = await window.electron?.workspace?.getDir();
        if (!workspaceResult?.success || !workspaceResult.data) {
          console.log('[ImportNoteDialog] 未找到工作区目录');
          setNotes([]);
          return;
        }

        const workspacePath = workspaceResult.data;
        console.log('[ImportNoteDialog] 工作区路径', workspacePath);

        // 获取所有笔记文档
        const result = await window.electron?.folder?.getAllNotes(workspacePath);
        if (result?.success && result.data) {
          console.log('[ImportNoteDialog] 获取到笔记文档', result.data.length);
          
          // 转换为 NoteFile 格式
          const noteFiles: NoteFile[] = result.data.map((file: any) => {
            // 获取文件扩展名
            const extMatch = file.name.match(/\.([^.]+)$/);
            const fileType = extMatch ? extMatch[1].toLowerCase() : '';
            
            // 提取文件夹路径（相对路径的目录部分）
            let relativePath = file.relativePath || '';
            // 规范化路径分隔符：将反斜杠统一转换为正斜杠（兼容 Windows）
            relativePath = relativePath.replace(/\\/g, '/');
            
            const lastSlashIndex = relativePath.lastIndexOf('/');
            const folderPath = lastSlashIndex > 0 ? relativePath.substring(0, lastSlashIndex) : '';
            
            return {
              id: file.id,
              title: file.name,
              selected: false,
              createdAt: file.createdAt,
              fileType: fileType,
              folderPath: folderPath,
              relativePath: relativePath,
            };
          });
          
          // 过滤掉已导入的文档
          let filteredNoteFiles = noteFiles;
          if (knowledgeId) {
            const existingFileNames = await knowledgeBaseService.getExistingFileNames(knowledgeId);
            filteredNoteFiles = noteFiles.filter(note => !existingFileNames.has(note.title));
            console.log('[ImportNoteDialog] 过滤', noteFiles.length, '个文件，剩余', filteredNoteFiles.length, '个文档');
          }
          
          setNotes(filteredNoteFiles);
        } else {
          console.log('[ImportNoteDialog] 未找到笔记文档');
          setNotes([]);
        }
      } catch (error) {
        console.error('[ImportNoteDialog] 加载笔记文件失败:', error);
        setNotes([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, [visible, knowledgeId]);

  // 处理 ESC 键关闭
  useEffect(() => {
    if (!visible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  // 获取文件夹的直接子项（只包含第一层的文件，不包括子文件夹中的文件）
  const getDirectFiles = (folderPath: string): NoteFile[] => {
    return notes.filter(note => note.folderPath === folderPath);
  };
  
  // 获取文件夹的直接子文件夹路径列表
  const getDirectSubFolders = (folderPath: string): string[] => {
    const subFoldersSet = new Set<string>();
    
    notes.forEach(note => {
      const noteFolderPath = note.folderPath || '';
      
      // 检查是否是该文件夹的子项（但不是直接文件）
      if (noteFolderPath.startsWith(folderPath + '/')) {
        // 提取相对路径
        const relativePart = noteFolderPath.substring(folderPath.length + 1);
        
        // 只取第一层子文件夹（相对路径中包含 / 说明有子文件夹）
        const firstSlashIndex = relativePart.indexOf('/');
        if (firstSlashIndex > 0) {
          const firstLevelFolder = relativePart.substring(0, firstSlashIndex);
          const subFolderPath = `${folderPath}/${firstLevelFolder}`;
          subFoldersSet.add(subFolderPath);
        }
      }
    });
    
    return Array.from(subFoldersSet);
  };
  
  // 处理文件复选框变化
  const handleCheckboxChange = (id: string) => {
    setNotes(notes.map(note => 
      note.id === id ? { ...note, selected: !note.selected } : note
    ));
  };

  // 获取文件夹下的所有文件（递归包含所有子文件夹中的文件）
  const getAllFilesInFolder = (folderPath: string): NoteFile[] => {
    return notes.filter(note => {
      const noteFolderPath = note.folderPath || '';
      // 匹配该文件夹本身或其所有子文件夹
      return noteFolderPath === folderPath || noteFolderPath.startsWith(folderPath + '/');
    });
  };

  // 处理文件夹复选框变化（递归选中该文件夹下的所有文件）
  const handleFolderCheckboxChange = (folderPath: string) => {
    // 获取该文件夹下的所有文件（包括子文件夹中的文件）
    const allFilesInFolder = getAllFilesInFolder(folderPath);
    
    // 判断是否全部选中
    const allSelected = allFilesInFolder.length > 0 && allFilesInFolder.every(file => file.selected);
    
    // 切换选中状态（递归选中所有文件）
    const fileIdsInFolder = new Set(allFilesInFolder.map(f => f.id));
    setNotes(notes.map(note => {
      if (fileIdsInFolder.has(note.id)) {
        return { ...note, selected: !allSelected };
      }
      return note;
    }));
    
    // 更新文件夹勾选状态
    setCheckedFolders(prev => {
      const newSet = new Set(prev);
      if (!allSelected) {
        // 勾选文件夹，同时勾选所有子文件夹
        newSet.add(folderPath);
        // 添加所有子文件夹
        const subFolders = notes
          .map(note => note.folderPath)
          .filter(path => path && (path === folderPath || path.startsWith(folderPath + '/')));
        subFolders.forEach(path => path && newSet.add(path));
      } else {
        // 取消勾选文件夹，同时移除所有子文件夹的勾选标记
        const foldersToRemove = Array.from(newSet).filter(path => 
          path === folderPath || path.startsWith(folderPath + '/')
        );
        foldersToRemove.forEach(path => newSet.delete(path));
      }
      return newSet;
    });
    
    // 如果勾选了文件夹，自动展开该文件夹
    if (!allSelected) {
      setExpandedFolders(prev => {
        const newMap = new Map(prev);
        newMap.set(folderPath, true);
        return newMap;
      });
    }
  };

  // 获取文件夹的选中状态（递归检查所有子文件夹中的文件）
  const getFolderCheckState = (folderPath: string): 'all' | 'partial' | 'none' => {
    // 获取该文件夹下的所有文件（包括子文件夹中的文件）
    const allFiles = getAllFilesInFolder(folderPath);
    
    if (allFiles.length === 0) return 'none';
    
    const selectedCount = allFiles.filter(file => file.selected).length;
    
    if (selectedCount === 0) return 'none';
    if (selectedCount === allFiles.length) return 'all';
    return 'partial';
  };

  // 处理全选
  const handleSelectAll = () => {
    const allSelected = notes.every(note => note.selected);
    setNotes(notes.map(note => ({ ...note, selected: !allSelected })));
    
    // 如果是全选，清空勾选文件夹标记（因为是手动全选，不是通过文件夹勾选）
    // 如果是取消全选，也清空勾选文件夹标记
    setCheckedFolders(new Set());
  };

  // 处理文件夹展开/折叠
  const handleFolderToggle = (folderPath: string) => {
    const isCurrentlyExpanded = expandedFolders.get(folderPath) ?? false;
    const willBeExpanded = !isCurrentlyExpanded;
    
    // 更新展开状态
    setExpandedFolders(prev => {
      const newMap = new Map(prev);
      newMap.set(folderPath, willBeExpanded);
      return newMap;
    });
    
    // 如果是展开操作，检查是否需要自动勾选
    if (willBeExpanded) {
      // 检查父文件夹链中是否有已勾选的文件
      let shouldAutoCheck = false;
      
      // 检查直接父文件夹是否已勾选
      const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
      if (parentPath && checkedFolders.has(parentPath)) {
        shouldAutoCheck = true;
      }
      
      // 如果需要自动勾选，勾选所有文件（递归）
      if (shouldAutoCheck) {
        const allFiles = getAllFilesInFolder(folderPath);
        
        if (allFiles.length > 0) {
          const fileIds = new Set(allFiles.map(f => f.id));
          setNotes(prevNotes => prevNotes.map(note => {
            if (fileIds.has(note.id)) {
              return { ...note, selected: true };
            }
            return note;
          }));
          
          // 标记当前文件夹及所有子文件夹为已勾选
          setCheckedFolders(prev => {
            const newSet = new Set(prev);
            newSet.add(folderPath);
            // 添加所有子文件夹
            const subFolders = notes
              .map(note => note.folderPath)
              .filter(path => path && (path === folderPath || path.startsWith(folderPath + '/')));
            subFolders.forEach(path => path && newSet.add(path));
            return newSet;
          });
        }
      }
    }
  };

  // 处理导入
  const handleImport = () => {
    const selectedFiles: ImportFileInfo[] = notes
      .filter(note => note.selected)
      .map(note => ({
        id: note.id,
        filePath: note.id, // id 就是文件的完整路径
        fileName: note.title,
        folderPath: note.folderPath || '', // 相对于工作区的文件夹路径
      }));
    
    if (selectedFiles.length === 0) {
      return;
    }
    
    console.log('[ImportNoteDialog] 导入文件信息:', selectedFiles);
    onImport(selectedFiles);
    onClose();
  };

  // 处理排序切换
  const handleSortToggle = (type: SortType) => {
    if (sortType === type) {
      // 如果点击同一个排序类型，切换排序顺序
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // 如果点击不同的排序类型，设置为升序
      setSortType(type);
      setSortOrder('asc');
    }
  };

  // 排序函数
  const sortNotes = (notesToSort: NoteFile[]): NoteFile[] => {
    if (sortType === 'none') {
      return notesToSort;
    }

    const sorted = [...notesToSort].sort((a, b) => {
      if (sortType === 'fileType') {
        // 按文件类型排序
        const typeA = a.fileType || '';
        const typeB = b.fileType || '';
        const comparison = typeA.localeCompare(typeB);
        return sortOrder === 'asc' ? comparison : -comparison;
      } else if (sortType === 'createdTime') {
        // 按创建时间排序
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const comparison = timeA - timeB;
        return sortOrder === 'asc' ? comparison : -comparison;
      }
      return 0;
    });

    return sorted;
  };

  // 过滤并排序笔记
  const filteredNotes = sortNotes(
    notes.filter(note =>
      note.title.toLowerCase().includes(searchText.toLowerCase())
    )
  );

  // 构建树形结构（使用 useMemo 避免不必要的重新计算）
  const fileTree = useMemo(() => {
    const root: Map<string, TreeNode> = new Map();
    
    // 为每个文件创建树节点
    filteredNotes.forEach(note => {
      // 使用 relativePath，如果为空则使用 title
      let relativePath = note.relativePath || note.title;
      
      // 规范化路径分隔符：将反斜杠统一转换为正斜杠（兼容 Windows）
      relativePath = relativePath.replace(/\\/g, '/');
      
      const parts = relativePath.split('/');
      
      // 如果文件在根目录
      if (parts.length === 1) {
        const fileNode: TreeNode = {
          name: note.title,
          path: relativePath,
          type: 'file',
          file: note,
          level: 0,
        };
        root.set(relativePath, fileNode);
        return;
      }
      
      // 构建文件夹路径
      let currentPath = '';
      let currentLevel = root;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        if (isLastPart) {
          // 这是文件
          const fileNode: TreeNode = {
            name: part,
            path: currentPath,
            type: 'file',
            file: note,
            level: i,
          };
          currentLevel.set(currentPath, fileNode);
        } else {
          // 这是文件夹
          if (!currentLevel.has(currentPath)) {
            const folderNode: TreeNode = {
              name: part,
              path: currentPath,
              type: 'folder',
              isExpanded: expandedFolders.get(currentPath) ?? false,
              children: new Map(),
              level: i,
            };
            currentLevel.set(currentPath, folderNode);
          }
          
          const folderNode = currentLevel.get(currentPath)!;
          if (!folderNode.children) {
            folderNode.children = new Map();
          }
          currentLevel = folderNode.children as Map<string, TreeNode>;
        }
      }
    });
    
    // Map 转换为数组并排序
    const convertMapToArray = (map: Map<string, TreeNode>): TreeNode[] => {
      const nodes = Array.from(map.values());
      const folders = nodes.filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name));
      let files = nodes.filter(n => n.type === 'file');
      
      // 根据排序类型对文件进行排序
      if (sortType === 'fileType' && files.length > 0) {
        files = files.sort((a, b) => {
          const typeA = a.file?.fileType || '';
          const typeB = b.file?.fileType || '';
          const comparison = typeA.localeCompare(typeB);
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      } else if (sortType === 'createdTime' && files.length > 0) {
        files = files.sort((a, b) => {
          const timeA = a.file?.createdAt ? new Date(a.file.createdAt).getTime() : 0;
          const timeB = b.file?.createdAt ? new Date(b.file.createdAt).getTime() : 0;
          const comparison = timeA - timeB;
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      } else {
        // 默认按名称排序
        files = files.sort((a, b) => a.name.localeCompare(b.name));
      }
      
      // 递归转换子文件夹
      folders.forEach(folder => {
        if (folder.children) {
          folder.children = convertMapToArray(folder.children as Map<string, TreeNode>) as any;
        }
      });
      
      return [...folders, ...files];
    };
    
    return convertMapToArray(root);
  }, [filteredNotes, expandedFolders, sortType, sortOrder]);

  const selectedCount = notes.filter(note => note.selected).length;

  // 递归渲染树节点
  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    if (node.type === 'file' && node.file) {
      // 渲染文件
      // 计算文件的缩进：根目录文件（level 0）不缩进，文件夹下的文件统一缩进47px
      const filePaddingLeft = node.level === 0 ? 0 : 47;
      
      return (
        <div
          key={node.path}
          className="tree-file-item"
          style={{
            paddingLeft: `${filePaddingLeft}px`,
          }}
        >
          {/* 文件复选框 - 使用 SVG 图标与文件夹保持一致 */}
          <div
            className="file-checkbox"
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxChange(node.file!.id);
            }}
          >
            {node.file.selected ? (
              <CheckboxCheckedIcon />
            ) : (
              <CheckboxUncheckedIcon />
            )}
          </div>
          {/* 使用应用真实的文件图标系统 */}
          <MaterialFileIcon fileName={node.name} size={16} />
          <div className="file-content">
            <h4 style={{ color: 'var(--ws-editor-foreground)' }}>{node.name}</h4>
          </div>
        </div>
      );
    } else if (node.type === 'folder') {
      // 渲染文件夹
      const checkState = getFolderCheckState(node.path);
      
      return (
        <div key={node.path} className="tree-folder">
          <div
            className="tree-folder-header"
            style={{
              paddingLeft: `${node.level === 0 ? 0 : 60}px`,
            }}
          >
            {/* 文件夹复选框 */}
            <div
              className="folder-checkbox"
              onClick={(e) => {
                e.stopPropagation();
                handleFolderCheckboxChange(node.path);
              }}
            >
              {checkState === 'all' ? (
                <CheckboxCheckedIcon />
              ) : checkState === 'partial' ? (
                <CheckboxPartialIcon />
              ) : (
                <CheckboxUncheckedIcon />
              )}
            </div>
            {/* 展开/折叠箭头和文件夹图标 */}
            <div
              className="folder-toggle-area"
              onClick={() => handleFolderToggle(node.path)}
            >
              <ChevronIcon isExpanded={node.isExpanded ?? true} />
              {/* 使用应用真实的文件夹图标系统 */}
              <MaterialFileIcon 
                folderName={node.name} 
                isFolder={true} 
                isOpen={node.isExpanded ?? true} 
                size={16} 
              />
              <span className="folder-name" style={{ color: 'var(--ws-editor-foreground)' }}>
                {node.name}
              </span>
            </div>
          </div>
          {node.isExpanded && node.children && (
            <div className="tree-folder-content">
              {(node.children as TreeNode[]).map(child => renderTreeNode(child))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // 如果对话框不可见，不渲染任何内容
  if (!visible) return null;

  return (
    <div className="import-note-dialog-overlay">
      <div 
        className="import-note-dialog" 
        style={{
          backgroundColor: 'var(--ws-editor-background)',
          borderColor: 'var(--ws-contrast-border)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        {/* 对话框标题 */}
        <div 
          className="import-note-dialog__header"
          style={{ borderColor: 'var(--ws-contrast-border)' }}
        >
          <h3 style={{ color: 'var(--ws-editor-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>
                <path d="M7 9l5-5l5 5"></path>
                <path d="M12 4v12"></path>
              </g>
            </svg>
            导入笔记
          </h3>
          <div className="header-right">
            {/* 搜索引擎 */}
            <div 
              className="search-box"
              style={{
                backgroundColor: 'var(--ws-input-background)',
                borderColor: 'var(--ws-contrast-border)',
                borderRadius: '16px',
              }}
            >
              <SearchIcon />
              <input
                type="text"
                placeholder="搜索"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--ws-input-foreground)',
                }}
              />
            </div>
            {/* 关闭按钮 */}
            <button
              className="import-note-dialog__close"
              onClick={onClose}
              style={{ color: 'var(--ws-editor-foreground)' }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* 全部/已选标签页 */}
        <div className="import-note-dialog__tabs">
          <button 
            className="tab active"
            style={{
              color: 'var(--ws-editor-foreground)',
              borderBottomColor: 'var(--ws-button-background)',
            }}
          >
            全部
          </button>
          <div className="tabs-actions">
            {/* 排序按钮 */}
            {filteredNotes.length > 0 && (
              <div className="sort-buttons">
                <button
                  className={`sort-btn ${sortType === 'fileType' ? 'active' : ''}`}
                  onClick={() => handleSortToggle('fileType')}
                  style={{
                    color: sortType === 'fileType' ? 'var(--ws-button-background)' : 'var(--ws-editor-foreground)',
                    backgroundColor: 'transparent',
                  }}
                  title="按文件类型排序"
                >
                  <SortAscIcon />
                  <span>类型</span>
                  {sortType === 'fileType' && (
                    <span className="sort-order">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
                <button
                  className={`sort-btn ${sortType === 'createdTime' ? 'active' : ''}`}
                  onClick={() => handleSortToggle('createdTime')}
                  style={{
                    color: sortType === 'createdTime' ? 'var(--ws-button-background)' : 'var(--ws-editor-foreground)',
                    backgroundColor: 'transparent',
                  }}
                  title="按创建时间排序"
                >
                  <SortAscIcon />
                  <span>时间</span>
                  {sortType === 'createdTime' && (
                    <span className="sort-order">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              </div>
            )}
            {/* 全选按钮 */}
            {filteredNotes.length > 0 && (
              <button
                className="select-all-btn"
                onClick={handleSelectAll}
                style={{
                  color: 'var(--ws-editor-foreground)',
                  backgroundColor: 'transparent',
                }}
              >
                {notes.every(note => note.selected) ? <CheckboxCheckedIcon /> : <CheckboxUncheckedIcon />}
                <span>{notes.every(note => note.selected) ? '取消全选' : '全选'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 笔记列表 - 树形结构 */}
        <div className="import-note-dialog__list">
          {isLoading ? (
            <div 
              className="empty-state"
              style={{ color: 'var(--descriptionForeground)' }}
            >
              加载中...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div 
              className="empty-state"
              style={{ color: 'var(--descriptionForeground)' }}
            >
              {searchText ? '未找到匹配的笔记' : '暂无笔记文件'}
            </div>
          ) : (
            <div className="file-tree">
              {fileTree.map(node => renderTreeNode(node))}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div 
          className="import-note-dialog__footer"
          style={{ borderColor: 'var(--ws-contrast-border)' }}
        >
          <div 
            className="footer-info"
            style={{ color: 'var(--descriptionForeground)' }}
          >
            已选择 {selectedCount} 个文档
          </div>
          <div className="footer-actions">
            <button
              className="btn-cancel"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--ws-editor-foreground)',
                borderColor: 'var(--ws-contrast-border)',
              }}
            >
              取消
            </button>
            <button
              className="btn-import"
              onClick={handleImport}
              disabled={selectedCount === 0}
              style={{
                backgroundColor: 'var(--ws-button-background)',
                color: 'var(--ws-button-foreground)',
                opacity: selectedCount === 0 ? 0.5 : 1,
              }}
            >
              导入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

