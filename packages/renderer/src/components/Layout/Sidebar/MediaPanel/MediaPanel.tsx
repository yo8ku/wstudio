/**
 * 素材管理面板组件
 * 用于显示和管理图片、视频素材，支持本地路径导入
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../Icons';
import { ContextMenu, type ContextMenuItem } from '../../../../components/Explorer/Common/ContextMenu';
import './MediaPanel.scss';

interface MediaItem {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video';
  size?: number;
  createdAt: number;
  thumbnail?: string;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'image' | 'video';

// 缩略图缓存
const thumbnailCache = new Map<string, string>();

// 正在生成缩略图的视频数量限制
let activeVideoCount = 0;
const MAX_ACTIVE_VIDEOS = 3;
const pendingVideos: Array<() => void> = [];

const requestVideoSlot = (callback: () => void) => {
  if (activeVideoCount < MAX_ACTIVE_VIDEOS) {
    activeVideoCount++;
    callback();
  } else {
    pendingVideos.push(callback);
  }
};

const releaseVideoSlot = () => {
  activeVideoCount--;
  if (pendingVideos.length > 0 && activeVideoCount < MAX_ACTIVE_VIDEOS) {
    const next = pendingVideos.shift();
    if (next) {
      activeVideoCount++;
      next();
    }
  }
};

// 懒加载图片组件
const LazyImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const imgRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="media-panel-lazy-container">
      {isVisible ? (
        error ? (
          <div className="media-panel-grid-item-video">
            <Icon name="media" size={32} />
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        )
      ) : (
        <div className="media-panel-grid-item-placeholder">
          <Icon name="media" size={24} />
        </div>
      )}
    </div>
  );
};

// 视频缩略图组件（带缓存和懒加载，限制并发数量防止 OOM）
const VideoThumbnail: React.FC<{ src: string; alt: string; cacheKey: string }> = ({ src, alt, cacheKey }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(() => thumbnailCache.get(cacheKey) || null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkedPersisted, setCheckedPersisted] = useState(false);

  // 检查是否有持久化的缩略图
  useEffect(() => {
    // 如果内存缓存中有，直接使用
    if (thumbnailCache.has(cacheKey)) {
      setThumbnail(thumbnailCache.get(cacheKey)!);
      setCheckedPersisted(true);
      return;
    }

    // 检查文件系统中是否有缩略图
    window.electron?.ipcRenderer?.invoke('media:get-thumbnail-path', cacheKey).then((result: { success: boolean; path?: string }) => {
      if (result?.success && result.path) {
        const fileUrl = `local-file:///${result.path.replace(/\\/g, '/')}`;
        thumbnailCache.set(cacheKey, fileUrl);
        setThumbnail(fileUrl);
      }
      setCheckedPersisted(true);
    });
  }, [cacheKey]);

  // 懒加载检测
  useEffect(() => {
    if (!checkedPersisted) return;
    if (thumbnail) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [cacheKey, checkedPersisted, thumbnail]);

  // 生成缩略图（使用队列限制并发）
  useEffect(() => {
    if (!checkedPersisted || !isVisible || thumbnail || thumbnailCache.has(cacheKey) || isProcessing || error) return;

    requestVideoSlot(() => {
      setIsProcessing(true);

      const video = document.createElement('video');
      const canvas = document.createElement('canvas');

      const cleanup = () => {
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
        video.src = '';
        video.load();
        releaseVideoSlot();
        setIsProcessing(false);
      };

      const handleLoadedData = () => {
        video.currentTime = Math.min(1, video.duration / 10);
      };

      const handleSeeked = () => {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
            // 保持比例缩放
            const maxSize = 200;
            const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight, 1);
            canvas.width = Math.floor(video.videoWidth * scale);
            canvas.height = Math.floor(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            if (dataUrl && dataUrl.length > 100) {
              thumbnailCache.set(cacheKey, dataUrl);
              setThumbnail(dataUrl);
              // 持久化到文件系统
              window.electron?.ipcRenderer?.invoke('media:save-thumbnail', cacheKey, dataUrl);
            } else {
              setError(true);
            }
          } else {
            setError(true);
          }
        } catch (e) {
          setError(true);
        }
        cleanup();
      };

      const handleError = () => {
        setError(true);
        cleanup();
      };

      video.addEventListener('loadeddata', handleLoadedData);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('error', handleError);

      video.preload = 'metadata';
      video.src = src;
    });
  }, [checkedPersisted, isVisible, thumbnail, cacheKey, src, isProcessing, error]);

  return (
    <div ref={containerRef} className="media-panel-lazy-container">
      {!checkedPersisted || (!isVisible && !thumbnail) ? (
        <div className="media-panel-grid-item-placeholder">
          <Icon name="circle-play" size={24} />
        </div>
      ) : thumbnail ? (
        <>
          <img src={thumbnail} alt={alt} />
          <div className="media-panel-grid-item-play-overlay">
            <Icon name="circle-play" size={32} />
          </div>
        </>
      ) : (
        <div className="media-panel-grid-item-video">
          <Icon name="circle-play" size={32} />
        </div>
      )}
    </div>
  );
};

export const MediaPanel: React.FC = () => {
  const { t } = useTranslation();
  const translateText = useCallback((key: string, defaultValue: string): string => (
    String(t(key, { defaultValue }))
  ), [t]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterType, setFilterType] = useState<FilterType>('image');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    item: MediaItem;
  } | null>(null);

  // 重命名状态
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 加载素材列表
  const loadMediaItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await window.electron?.ipcRenderer?.invoke('media:get-list');
      if (result?.success && result.data) {
        setMediaItems(result.data);
      }
    } catch (error) {
      console.error('[MediaPanel] 加载素材列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMediaItems();
  }, [loadMediaItems]);

  // 导入本地文件
  const handleImportFiles = async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('media:import-files');
      if (result?.success) {
        loadMediaItems();
      }
    } catch (error) {
      console.error('[MediaPanel] 导入文件失败:', error);
    }
  };

  // 导入本地文件夹
  const handleImportFolder = async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('media:import-folder');
      if (result?.success) {
        loadMediaItems();
      }
    } catch (error) {
      console.error('[MediaPanel] 导入文件夹失败:', error);
    }
  };

  // 删除选中的素材
  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;

    try {
      const result = await window.electron?.ipcRenderer?.invoke('media:delete', Array.from(selectedItems));
      if (result?.success) {
        setSelectedItems(new Set());
        loadMediaItems();
      }
    } catch (error) {
      console.error('[MediaPanel] 删除素材失败:', error);
    }
  };

  // 切换选中状态
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // 预览素材
  const handlePreview = useCallback((item: MediaItem) => {
    window.electron?.ipcRenderer?.invoke('media:open', item.path);
  }, []);

  // 删除单个素材
  const handleDeleteItem = useCallback(async (item: MediaItem) => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('media:delete', [item.id]);
      if (result?.success) {
        setSelectedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(item.id);
          return newSet;
        });
        loadMediaItems();
      }
    } catch (error) {
      console.error('[MediaPanel] 删除素材失败:', error);
    }
  }, [loadMediaItems]);

  // 开始重命名
  const handleStartRename = useCallback((item: MediaItem) => {
    // 获取不带扩展名的文件名
    const lastDotIndex = item.name.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? item.name.substring(0, lastDotIndex) : item.name;
    setRenamingItem(item.id);
    setRenameValue(nameWithoutExt);
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, []);

  // 确认重命名
  const handleConfirmRename = useCallback(async (item: MediaItem) => {
    if (!renameValue.trim()) {
      setRenamingItem(null);
      return;
    }
    // 获取原扩展名
    const lastDotIndex = item.name.lastIndexOf('.');
    const ext = lastDotIndex > 0 ? item.name.substring(lastDotIndex) : '';
    const newName = renameValue.trim() + ext;

    if (newName === item.name) {
      setRenamingItem(null);
      return;
    }

    try {
      const result = await window.electron?.ipcRenderer?.invoke('media:rename', item.id, newName);
      if (result?.success) {
        loadMediaItems();
      }
    } catch (error) {
      console.error('[MediaPanel] 重命名失败:', error);
    } finally {
      setRenamingItem(null);
    }
  }, [renameValue, loadMediaItems]);

  // 取消重命名
  const handleCancelRename = useCallback(() => {
    setRenamingItem(null);
    setRenameValue('');
  }, []);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent, item: MediaItem) => {
    e.preventDefault();
    e.stopPropagation();
    // 如果当前项未选中，则选中它（不影响已有的多选）
    if (!selectedItems.has(item.id)) {
      setSelectedItems(new Set([item.id]));
    }
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      item,
    });
  }, [selectedItems]);

  // 关闭右键菜单
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 构建右键菜单项
  const getContextMenuItems = useCallback((item: MediaItem): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    // 如果当前项未选中，显示选中选项
    if (!selectedItems.has(item.id)) {
      items.push({
        id: 'select',
        label: '选中',
        icon: 'check',
        onClick: () => {
          const newSelected = new Set(selectedItems);
          newSelected.add(item.id);
          setSelectedItems(newSelected);
        },
      });
    }

    // 如果选中了多项，显示取消多选
    if (selectedItems.size > 1) {
      items.push({
        id: 'clear-selection',
        label: '取消多选',
        icon: 'close',
        onClick: () => setSelectedItems(new Set()),
      });
    }

    // 如果有选中/取消多选选项，添加分隔线
    if (items.length > 0) {
      items.push({
        id: 'separator-0',
        label: '',
        separator: true,
      });
    }

    items.push(
      {
        id: 'preview',
        label: '预览',
        icon: 'eye',
        onClick: () => handlePreview(item),
      },
      {
        id: 'open-in-explorer',
        label: '在资源管理器中打开',
        icon: 'explorer',
        onClick: async () => {
          try {
            const result = await window.electron?.ipcRenderer?.invoke('media:show-in-explorer', item.path);
            if (!result?.success) {
              console.error('[MediaPanel] 在资源管理器中打开失败:', result?.error);
            }
          } catch (error) {
            console.error('[MediaPanel] 在资源管理器中打开失败:', error);
          }
        },
      },
      {
        id: 'separator-1',
        label: '',
        separator: true,
      },
      {
        id: 'rename',
        label: '重命名',
        icon: 'edit',
        onClick: () => handleStartRename(item),
      },
      {
        id: 'separator-2',
        label: '',
        separator: true,
      },
      {
        id: 'delete',
        label: '删除',
        icon: 'delete',
        onClick: () => handleDeleteItem(item),
      }
    );

    return items;
  }, [handlePreview, handleStartRename, handleDeleteItem, selectedItems.size]);

  // 过滤素材
  const filteredItems = mediaItems.filter(item => item.type === filterType);

  const translateContextMenuItems = useCallback((items: ContextMenuItem[]): ContextMenuItem[] => (
    items.map(menuItem => {
      switch (menuItem.id) {
        case 'select':
          return { ...menuItem, label: translateText('mediaPanel.contextMenu.select', '选择') };
        case 'clear-selection':
          return { ...menuItem, label: translateText('mediaPanel.contextMenu.clearSelection', '清除选择') };
        case 'preview':
          return { ...menuItem, label: translateText('mediaPanel.contextMenu.preview', '预览') };
        case 'open-in-explorer':
          return { ...menuItem, label: translateText('mediaPanel.contextMenu.openInExplorer', '在资源管理器中打开') };
        case 'rename':
          return { ...menuItem, label: translateText('mediaPanel.contextMenu.rename', '重命名') };
        case 'delete':
          return { ...menuItem, label: translateText('mediaPanel.contextMenu.delete', '删除') };
        default:
          return menuItem;
      }
    })
  ), [translateText]);

  // 格式化文件大小
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 将 Windows 路径转换为 local-file:// URL
  const getFileUrl = (filePath: string) => {
    // Windows 路径需要转换为正斜杠，并确保盘符前有斜杠
    // 例如: E:\images\photo.jpg -> local-file:///E:/images/photo.jpg
    const normalizedPath = filePath.replace(/\\/g, '/');
    return `local-file:///${normalizedPath}`;
  };

  return (
    <div className="media-panel">
      {/* 工具栏 */}
      <div className="media-panel-toolbar">
        <div className="media-panel-toolbar-left">
          <button
            className="media-panel-btn"
            onClick={handleImportFiles}
            title={translateText('mediaPanel.actions.importFiles', '导入文件')}
          >
            <Icon name="plus" size={14} />
            <span>{translateText('mediaPanel.actions.import', '导入')}</span>
          </button>
          <button
            className="media-panel-btn"
            onClick={handleImportFolder}
            title={translateText('mediaPanel.actions.importFolder', '导入文件夹')}
          >
            <Icon name="new-folder" size={14} />
          </button>
          {selectedItems.size > 0 && (
            <button
              className="media-panel-btn media-panel-btn--danger"
              onClick={handleDeleteSelected}
              title={translateText('mediaPanel.actions.deleteSelected', '删除选中')}
            >
              <Icon name="delete" size={14} />
            </button>
          )}
        </div>
        <div className="media-panel-toolbar-right">
          {/* 筛选 */}
          <select
            className="media-panel-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
          >
            <option value="image">{translateText('mediaPanel.filters.image', '图片')}</option>
            <option value="video">{translateText('mediaPanel.filters.video', '视频')}</option>
          </select>
          {/* 视图切换 */}
          <button
            className={`media-panel-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title={translateText('mediaPanel.views.grid', '网格视图')}
          >
            <Icon name="card-view" size={14} />
          </button>
          <button
            className={`media-panel-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title={translateText('mediaPanel.views.list', '列表视图')}
          >
            <Icon name="list-view" size={14} />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className={`media-panel-content media-panel-content--${viewMode}`}>
        {isLoading ? (
          <div className="media-panel-loading">
            <Icon name="refresh" size={24} />
            <span>{translateText('mediaPanel.states.loading', '加载中...')}</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="media-panel-empty">
            <Icon name="media" size={48} />
            <p>{translateText('mediaPanel.states.empty', '暂无素材')}</p>
            <p className="media-panel-empty-hint">
              {translateText('mediaPanel.states.emptyHint', '点击"导入"按钮添加图片或视频')}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="media-panel-grid">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className={`media-panel-grid-item ${selectedItems.has(item.id) ? 'selected' : ''}`}
                onClick={() => toggleSelect(item.id)}
                onDoubleClick={() => handlePreview(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <div className="media-panel-grid-item-preview">
                  {item.type === 'image' ? (
                    <LazyImage src={getFileUrl(item.path)} alt={item.name} />
                  ) : (
                    <VideoThumbnail src={getFileUrl(item.path)} alt={item.name} cacheKey={item.id} />
                  )}
                  {item.type === 'video' && (
                    <div className="media-panel-grid-item-badge">
                      <Icon name="video-embed" size={12} />
                    </div>
                  )}
                </div>
                {renamingItem === item.id ? (
                  <input
                    ref={renameInputRef}
                    className="media-panel-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleConfirmRename(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleConfirmRename(item);
                      } else if (e.key === 'Escape') {
                        handleCancelRename();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="media-panel-grid-item-name" title={item.name}>
                    {item.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="media-panel-list">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className={`media-panel-list-item ${selectedItems.has(item.id) ? 'selected' : ''}`}
                onClick={() => toggleSelect(item.id)}
                onDoubleClick={() => handlePreview(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <div className="media-panel-list-item-icon">
                  {item.type === 'image' ? (
                    <Icon name="media" size={16} />
                  ) : (
                    <Icon name="video-embed" size={16} />
                  )}
                </div>
                {renamingItem === item.id ? (
                  <input
                    ref={renameInputRef}
                    className="media-panel-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleConfirmRename(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleConfirmRename(item);
                      } else if (e.key === 'Escape') {
                        handleCancelRename();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="media-panel-list-item-name" title={item.name}>
                    {item.name}
                  </div>
                )}
                <div className="media-panel-list-item-size">
                  {formatSize(item.size)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          items={translateContextMenuItems(getContextMenuItems(contextMenu.item))}
          position={contextMenu.position}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
