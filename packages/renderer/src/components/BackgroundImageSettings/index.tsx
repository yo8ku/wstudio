/**
 * 背景图片设置面板 (渲染进程)
 * 提供可视化的设置界面
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBackgroundStore } from '../../stores/backgroundStore';
import { Icon } from '../Icons/Icon';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../common/Tabs';
import './styles.css';

interface BackgroundConfig {
  imagePath: string;
  sourcePath?: string;
  opacity: number;
  blur: number;
  fit: 'cover' | 'contain' | 'fill' | 'none';
  enabled: boolean;
}

interface ImageFile {
  name: string;
  path: string;
  cachedPath?: string; // 缓存路径（如果存在）
}

interface BackgroundImageSettingsProps {
  visible: boolean;
  onClose: () => void;
}

export const BackgroundImageSettings: React.FC<BackgroundImageSettingsProps> = ({
  visible,
  onClose
}) => {
  // 使用全局状态实现实时预览
  const { config, setConfig: setGlobalConfig } = useBackgroundStore();
  
  // 本地状态用于临时编辑
  const [localConfig, setLocalConfig] = useState<BackgroundConfig>(config);
  const [activeTab, setActiveTab] = useState<string>('image');

  // 图片列表相关状态
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [displayedImages, setDisplayedImages] = useState<ImageFile[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 5;
  // 跟踪每个图片的加载状态，避免显示加载视觉效果
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  // 使用 ref 保存最新的 imageFiles，用于在异步操作中获取最新值
  const imageFilesRef = useRef<ImageFile[]>([]);
  // 使用 ref 保存最新的 displayedImages，用于在异步操作中获取最新值
  const displayedImagesRef = useRef<ImageFile[]>([]);

  // 将文件路径转换为可用的URL
  // 优先使用缓存路径（如果存在），否则使用原始路径
  const getImageUrl = (image: ImageFile | string): string => {
    // 如果传入的是字符串（向后兼容），直接使用
    let filePath: string;
    if (typeof image === 'string') {
      filePath = image;
    } else {
      // 优先使用缓存路径
      filePath = image.cachedPath || image.path;
    }
    
    if (!filePath) {
      return '';
    }
    
    // 如果已经是 local-file:// 协议，直接返回
    if (filePath.startsWith('local-file://')) {
      return filePath;
    }
    
    // 如果是 http/https 协议，直接返回
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    
    // 如果已经是 file:// 协议，先移除它并解码
    let cleanPath = filePath;
    if (filePath.startsWith('file://')) {
      // 移除 file:// 或 file:/// 前缀
      cleanPath = filePath.replace(/^file:\/\/\/?/, '');
      // 如果是 Windows 路径，可能需要移除开头的斜杠
      if (cleanPath.match(/^\/[a-zA-Z]:/)) {
        cleanPath = cleanPath.substring(1);
      }
      // 尝试解码（如果被编码过）
      try {
        cleanPath = decodeURIComponent(cleanPath);
      } catch (e) {
        // 解码失败，使用原始路径
        console.warn('[BackgroundImageSettings] file:// 路径解码失败:', e);
      }
    }
    
    // 规范化路径（转换为正斜杠）
    let normalizedPath = cleanPath.replace(/\\/g, '/');
    
    // 如果路径包含编码字符，尝试解码（但只解码一次，避免重复解码）
    if (normalizedPath.includes('%')) {
      try {
        const decoded = decodeURIComponent(normalizedPath);
        // 验证解码后的路径是否有效（包含路径分隔符或驱动器字母）
        if (decoded && decoded.length > 0 && (decoded.includes('/') || decoded.includes('\\') || decoded.match(/^[a-zA-Z]:/))) {
          normalizedPath = decoded.replace(/\\/g, '/');
        }
      } catch (e) {
        // 解码失败，使用原始路径
        console.warn('[BackgroundImageSettings] 路径解码失败:', e);
      }
    }
    
    // Windows 路径格式: local-file://D:/path/to/file.png
    if (normalizedPath.match(/^[a-zA-Z]:/)) {
      const driveLetter = normalizedPath.substring(0, 2); // 例如 "E:"
      let pathWithoutDrive = normalizedPath.substring(2); // 例如 "/Wise Note Studio/..." 或 "\Wise Note Studio\..."
      
      // 确保路径以 / 开头
      if (!pathWithoutDrive.startsWith('/')) {
        pathWithoutDrive = '/' + pathWithoutDrive;
      }
      
      // 分割路径并编码每个部分（保留斜杠）
      // 注意：必须确保路径部分不为空，避免路径被错误拼接
      const pathParts = pathWithoutDrive.split('/').filter(part => part.length > 0);
      
      if (pathParts.length === 0) {
        console.error('[BackgroundImageSettings] 路径部分为空，原始路径:', filePath, 'normalizedPath:', normalizedPath);
        return '';
      }
      
      const encodedParts = pathParts.map(part => {
        // 直接编码，不尝试解码（避免双重编码问题）
        // 因为主进程返回的路径应该是未编码的原始路径
        try {
          return encodeURIComponent(part);
        } catch (e) {
          console.error('[BackgroundImageSettings] 路径部分编码失败:', part, e);
          return part; // 编码失败，返回原始部分
        }
      });
      
      const encodedPath = encodedParts.join('/');
      const result = `local-file://${driveLetter}/${encodedPath}`;
      // 减少日志输出，避免在控制台显示 local-file:// 路径
      // console.log('[BackgroundImageSettings] 路径转换:', { 
      //   original: filePath, 
      //   cleanPath, 
      //   normalizedPath, 
      //   driveLetter,
      //   pathWithoutDrive,
      //   pathParts,
      //   encodedParts,
      //   result 
      // });
      return result;
    } else {
      // Unix 绝对路径
      const pathWithSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
      const pathParts = pathWithSlash.split('/').filter(part => part.length > 0);
      
      if (pathParts.length === 0) {
        console.error('[BackgroundImageSettings] Unix 路径部分为空，原始路径:', filePath, 'normalizedPath:', normalizedPath);
        return '';
      }
      
      const encodedParts = pathParts.map(part => {
        // 直接编码，不尝试解码
        try {
          return encodeURIComponent(part);
        } catch (e) {
          console.error('[BackgroundImageSettings] Unix 路径部分编码失败:', part, e);
          return part; // 编码失败，返回原始部分
        }
      });
      const encodedPath = encodedParts.join('/');
      const result = `local-file:///${encodedPath}`;
      // 减少日志输出，避免在控制台显示 local-file:// 路径
      // console.log('[BackgroundImageSettings] 路径转换:', { original: filePath, cleanPath, normalizedPath, result });
      return result;
    }
  };

  // 当面板打开时，同步全局配置到本地状态并加载图片
  // 注意：只在 visible 变化时同步，避免覆盖用户正在进行的操作
  useEffect(() => {
    if (visible) {
      console.log('[BackgroundImageSettings] 面板打开，同步配置', config);
      // 将 local-file:// 协议路径转换回原始路径格式（用于显示）
      let displayImagePath = config.sourcePath ?? config.imagePath;
      if (displayImagePath && displayImagePath.startsWith('local-file://')) {
        // 移除 local-file:// 前缀
        displayImagePath = displayImagePath.replace(/^local-file:\/\//, '');
        // 解码路径
        try {
          displayImagePath = decodeURIComponent(displayImagePath);
        } catch (e) {
          console.warn('[BackgroundImageSettings] 路径解码失败:', e);
        }
      }
      
      // 确保 fit 始终为 'cover'
      const configWithCover: BackgroundConfig = { 
        ...config, 
        imagePath: displayImagePath, // 使用转换后的路径用于显示
        fit: 'cover' as const
      };
      setLocalConfig(configWithCover);
      loadImages();
    }
  }, [visible]); // 移除 config 依赖，避免覆盖用户操作

  // 加载图片列表
  const loadImages = async () => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用');
      return;
    }

    try {
      setIsLoading(true);
      const result = await ipcRenderer.invoke('background-image:list-images');
      console.log('[BackgroundImageSettings] 加载到的图片:', result);

      const builtin: ImageFile[] = Array.isArray(result?.builtinImages)
        ? result.builtinImages.map((item: any) => ({
            name: String(item.name ?? ''),
            path: String(item.path ?? ''),
            cachedPath: item.cachedPath ? String(item.cachedPath) : undefined,
          }))
        : [];

      const user: ImageFile[] = Array.isArray(result?.userImages)
        ? result.userImages.map((item: any, index: number) => ({
            name: item.imagePath ? String(item.imagePath).split(/[\\/]/).pop() ?? '' : `用户图片 ${index + 1}`,
            path: String(item.imagePath ?? ''),
          }))
        : [];

      const mergedImages = [...user, ...builtin];

      setImageFiles(mergedImages);
      imageFilesRef.current = mergedImages;
      setCurrentPage(0);
      
      // 预加载第一页的图片
      const firstPageImages = mergedImages.slice(0, pageSize);
      const preloadPromises = firstPageImages.map((image: ImageFile, index: number) => {
        const imageKey = `${image.path}-${index}`;
        return preloadImage(image, imageKey);
      });
      
      // 等待第一页图片预加载完成
      await Promise.all(preloadPromises);
      
      // 预加载完成后再显示
      setDisplayedImages(firstPageImages);
      displayedImagesRef.current = firstPageImages;
      setHasMore(mergedImages.length > pageSize);
    } catch (error) {
      console.error('[BackgroundImageSettings] 加载图片失败:', error);
      setImageFiles([]);
      imageFilesRef.current = [];
      setDisplayedImages([]);
      displayedImagesRef.current = [];
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 预加载图片（在添加到 DOM 之前加载，避免显示加载状态）
  const preloadImage = (image: ImageFile, imageKey: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const imageUrl = getImageUrl(image);
      const img = new Image();
      
      img.onload = () => {
        console.log('[BackgroundImageSettings] 图片预加载成功:', image.name);
        // 标记为已加载
        setLoadedImages(prev => new Set(prev).add(imageKey));
        resolve();
      };
      
      img.onerror = () => {
        console.warn('[BackgroundImageSettings] 图片预加载失败:', image.name);
        // 即使预加载失败，也标记为已加载，让图片正常显示（可能会显示错误状态）
        setLoadedImages(prev => new Set(prev).add(imageKey));
        resolve(); // 仍然 resolve，让图片正常渲染
      };
      
      img.src = imageUrl;
    });
  };

  // 加载更多图片
  const loadMore = async () => {
    const nextPage = currentPage + 1;
    const startIndex = nextPage * pageSize;
    const endIndex = startIndex + pageSize;
    const newImages = imageFiles.slice(startIndex, endIndex);
    
    if (newImages.length > 0) {
      // 先预加载所有新图片
      // 使用 displayedImages.length + index 作为 imageKey，确保唯一性
      const currentDisplayedCount = displayedImages.length;
      const preloadPromises = newImages.map((image, index) => {
        const imageKey = `${image.path}-${currentDisplayedCount + index}`;
        return preloadImage(image, imageKey);
      });
      
      // 等待所有图片预加载完成
      await Promise.all(preloadPromises);
      
      // 预加载完成后再添加到显示列表
      setDisplayedImages(prev => {
        const updated = [...prev, ...newImages];
        displayedImagesRef.current = updated;
        return updated;
      });
      setCurrentPage(nextPage);
      setHasMore(endIndex < imageFiles.length);
    } else {
      setHasMore(false);
    }
  };

  // 添加新图片到列表（保持已加载的图片，将新图片添加到开头）
  const addNewImages = async () => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用');
      return;
    }

    try {
      // 获取最新的图片列表
      const result = await ipcRenderer.invoke('background-image:list-images');
      console.log('[BackgroundImageSettings] 添加图片后，获取到的新图片列表:', result);

      const builtin: ImageFile[] = Array.isArray(result?.builtinImages)
        ? result.builtinImages.map((item: any) => ({
            name: String(item.name ?? ''),
            path: String(item.path ?? ''),
            cachedPath: item.cachedPath ? String(item.cachedPath) : undefined,
          }))
        : [];

      const user: ImageFile[] = Array.isArray(result?.userImages)
        ? result.userImages.map((item: any, index: number) => ({
            name: item.imagePath ? String(item.imagePath).split(/[\\/]/).pop() ?? '' : `用户图片 ${index + 1}`,
            path: String(item.imagePath ?? ''),
          }))
        : [];

      const newImageFiles: ImageFile[] = [...user, ...builtin];
      
      // 获取当前的 imageFiles（使用 ref 确保获取最新值）
      const currentImageFiles = imageFilesRef.current;
      
      // 找出新添加的图片（通过比较路径）
      const existingPaths = new Set(currentImageFiles.map(img => img.path));
      const newImages = newImageFiles.filter((img: ImageFile) => !existingPaths.has(img.path));
      
      console.log('[BackgroundImageSettings] 新添加的图片:', newImages);
      
      // 更新 imageFiles 列表和 ref
      setImageFiles(newImageFiles);
      imageFilesRef.current = newImageFiles;
      
      // 自动缓存新添加的图片（后台异步执行，不阻塞UI）
      if (newImages.length > 0) {
        console.log('[BackgroundImageSettings] 开始自动缓存新添加的图片:', newImages.length, '张');
        newImages.forEach(async (image: ImageFile) => {
          try {
            const result = await ipcRenderer.invoke('background-image:cache-image', image.path);
            if (result.success) {
              console.log('[BackgroundImageSettings] 图片缓存成功:', image.name, '->', result.cachedPath);
            } else {
              console.warn('[BackgroundImageSettings] 图片缓存失败:', image.name, result.error);
            }
          } catch (error) {
            console.error('[BackgroundImageSettings] 缓存图片时发生错误:', image.name, error);
          }
        });
      }
      
      if (newImages.length > 0) {
        // 获取当前的 displayedImages，检查新图片是否已经在显示列表中
        const currentDisplayed = displayedImagesRef.current;
        const existingDisplayedPaths = new Set(currentDisplayed.map(img => img.path));
        const uniqueNewImages = newImages.filter((img: ImageFile) => !existingDisplayedPaths.has(img.path));
        
        if (uniqueNewImages.length === 0) {
          // 如果没有新图片需要添加，只更新 hasMore 状态
          const totalDisplayed = currentDisplayed.length;
          setHasMore(totalDisplayed < newImageFiles.length);
        } else {
          console.log('[BackgroundImageSettings] 准备添加新图片到显示列表:', uniqueNewImages);
          
          // 新图片会添加到 displayedImages 的开头，所以它们的 index 从 0 开始
          // 预加载新添加的图片
          const preloadPromises = uniqueNewImages.map((image: ImageFile, index: number) => {
            // 新图片在最终列表中的 index 就是它在 uniqueNewImages 数组中的 index（从 0 开始）
            const imageKey = `${image.path}-${index}`;
            console.log('[BackgroundImageSettings] 预加载新图片:', image.name, 'imageKey:', imageKey);
            return preloadImage(image, imageKey);
          });
          
          // 等待所有新图片预加载完成后再更新显示列表
          try {
            await Promise.all(preloadPromises);
            console.log('[BackgroundImageSettings] 所有新图片预加载完成，更新显示列表');
            
            // 使用函数式更新，确保获取最新的状态
            setDisplayedImages(prevDisplayed => {
              // 再次检查，确保没有重复添加
              const existingDisplayedPaths = new Set(prevDisplayed.map(img => img.path));
              const finalNewImages = uniqueNewImages.filter((img: ImageFile) => !existingDisplayedPaths.has(img.path));
              
              if (finalNewImages.length === 0) {
                // 如果已经被添加了，只更新 hasMore 状态
                const totalDisplayed = prevDisplayed.length;
                setHasMore(totalDisplayed < newImageFiles.length);
                displayedImagesRef.current = prevDisplayed;
                return prevDisplayed;
              }
              
              // 更新 hasMore 状态
              const totalDisplayed = prevDisplayed.length + finalNewImages.length;
              setHasMore(totalDisplayed < newImageFiles.length);
              
              console.log('[BackgroundImageSettings] 更新显示列表，新图片数量:', finalNewImages.length, '总显示数量:', totalDisplayed);
              
              const updated = [...finalNewImages, ...prevDisplayed];
              displayedImagesRef.current = updated;
              return updated;
            });
          } catch (error) {
            console.error('[BackgroundImageSettings] 预加载新图片失败:', error);
            // 即使预加载失败，也添加图片到显示列表
            setDisplayedImages(prevDisplayed => {
              const existingDisplayedPaths = new Set(prevDisplayed.map(img => img.path));
              const finalNewImages = uniqueNewImages.filter((img: ImageFile) => !existingDisplayedPaths.has(img.path));
              
              if (finalNewImages.length === 0) {
                const totalDisplayed = prevDisplayed.length;
                setHasMore(totalDisplayed < newImageFiles.length);
                displayedImagesRef.current = prevDisplayed;
                return prevDisplayed;
              }
              
              const totalDisplayed = prevDisplayed.length + finalNewImages.length;
              setHasMore(totalDisplayed < newImageFiles.length);
              
              const updated = [...finalNewImages, ...prevDisplayed];
              displayedImagesRef.current = updated;
              return updated;
            });
          }
        }
      } else {
        // 如果没有新图片，只更新 imageFiles 列表（可能图片被删除了）
        // 同时检查是否需要更新 hasMore 状态
        const currentDisplayed = displayedImagesRef.current;
        const totalDisplayed = currentDisplayed.length;
        setHasMore(totalDisplayed < newImageFiles.length);
      }
    } catch (error) {
      console.error('[BackgroundImageSettings] 添加图片后更新列表失败:', error);
    }
  };

  // 使用 ref 来跟踪是否需要更新全局配置
  const pendingGlobalUpdateRef = useRef<{ config: BackgroundConfig; shouldSave: boolean } | null>(null);
  
  // 使用 useEffect 来响应待处理的全局配置更新
  useEffect(() => {
    if (pendingGlobalUpdateRef.current) {
      const { config: updated, shouldSave } = pendingGlobalUpdateRef.current;
      pendingGlobalUpdateRef.current = null;
      
      const newGlobalConfig: BackgroundConfig = {
        ...updated,
        imagePath: updated.imagePath ? getImageUrl(updated.imagePath) : ''
      };
      
      console.log('[BackgroundImageSettings] 应用图片配置，更新全局配置:', newGlobalConfig);
      setGlobalConfig(newGlobalConfig);
      
      if (shouldSave) {
        const ipcRenderer = (window as any).electron?.ipcRenderer;
        if (ipcRenderer) {
          // 保存时始终用原始路径（sourcePath），避免缓存路径被持久化后缓存被清理导致背景失效
          const configToSave = {
            ...updated,
            imagePath: updated.sourcePath || updated.imagePath,
          };
          console.log('[BackgroundImageSettings] 保存配置到主进程', configToSave);
          ipcRenderer.send('background-image:update-config', configToSave);
        }
      }
    }
  }, [localConfig, setGlobalConfig]);
  
  const applySelection = (finalPath: string, sourcePathValue: string) => {
    const normalizedSource = sourcePathValue || '';
    const updated: BackgroundConfig = {
      ...localConfig,
      imagePath: finalPath,
      sourcePath: normalizedSource,
      enabled: Boolean(finalPath),
      fit: 'cover' as const
    };
    
    // 先更新本地配置
    setLocalConfig(updated);
    
    // 标记需要更新全局配置（useEffect 会处理）
    pendingGlobalUpdateRef.current = { config: updated, shouldSave: true };
  };
  
  const cacheImageIfNeeded = (originalPath: string) => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用，无法缓存图片');
      return;
    }
    
    console.log('[BackgroundImageSettings] 开始缓存图片:', originalPath);
    ipcRenderer.invoke('background-image:cache-image', originalPath).then((result: any) => {
      if (!result?.success || !result.cachedPath) {
        console.warn('[BackgroundImageSettings] 图片缓存失败或无效:', originalPath, result?.error);
        return;
      }
      
      if (result.cachedPath === originalPath) {
        console.log('[BackgroundImageSettings] 缓存路径与原路径相同，跳过更新');
        return;
      }
      
      const currentSource = useBackgroundStore.getState().config.sourcePath || '';
      if (currentSource && currentSource !== originalPath) {
        console.log('[BackgroundImageSettings] 用户已切换图片，跳过缓存结果应用');
        return;
      }
      
      console.log('[BackgroundImageSettings] 缓存完成，切换到缓存路径:', result.cachedPath);
      applySelection(result.cachedPath, originalPath);
    }).catch((error: any) => {
      console.error('[BackgroundImageSettings] 缓存图片时发生错误:', originalPath, error);
    });
  };

  // 选择图片
  const handleSelectImage = (imagePath: string | null) => {
    const finalPath = imagePath || '';
    applySelection(finalPath, finalPath);
    if (finalPath) {
      cacheImageIfNeeded(finalPath);
    }
  };

  // 调试：监听visible 变化
  useEffect(() => {
    console.log('[BackgroundImageSettings] 🟢 visible 状态变量', visible);
  }, [visible]);

  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用');
      return;
    }

    console.log('[BackgroundImageSettings] 开始监听事件');

    // 监听主进程发送的设置面板显示事件
    const handleShowSettings = (event: any, ...args: any[]) => {
      console.log('[BackgroundImageSettings] ========== 收到显示设置面板事件 ==========');
      console.log('[BackgroundImageSettings] event:', event);
      console.log('[BackgroundImageSettings] args:', args);
      const initialConfig = args[0]; // event 已单独提取，数据是第一个参数
      if (initialConfig) {
        // 确保 fit 始终为 'cover'
        const configWithCover: BackgroundConfig = { ...initialConfig, fit: 'cover' as const };
        // 只更新本地配置，不更新全局配置（避免打开设置面板时立即应用背景）
        setLocalConfig(configWithCover);
        // 注意：不调用 setGlobalConfig，因为打开设置面板不应该立即应用背景
        // 只有在用户实际选择图片或修改设置时，才会更新全局配置
      }
    };

    // 监听图片选择结果
    const handleImageSelected = (event: any, ...args: any[]) => {
      console.log('[BackgroundImageSettings] 收到图片选择结果:', args);
      const imagePath = args[0] as string | undefined;
      
      if (imagePath) {
        applySelection(imagePath, imagePath);
        cacheImageIfNeeded(imagePath);
      } else {
        applySelection('', '');
      }
      
      addNewImages();
    };

    // 监听配置更新结果
    // 这个监听器接收主进程返回的配置更新（路径已转换为 local-file:// 格式）
    const handleConfigUpdated = (event: any, ...args: any[]) => {
      console.log('[BackgroundImageSettings] 配置已更新', args);
      const updatedConfig = args[0];
      if (!updatedConfig) return;
      
      // 使用 getState() 获取最新的全局配置（避免闭包问题）
      const currentGlobalConfig = useBackgroundStore.getState().config;
      const isUpdatedConfigValid = updatedConfig.enabled && updatedConfig.imagePath;
      const isCurrentConfigValid = currentGlobalConfig.enabled && currentGlobalConfig.imagePath;
      
      // 如果更新的配置无效，但当前配置有效，说明可能是其他操作导致的，不更新
      if (!isUpdatedConfigValid && isCurrentConfigValid) {
        console.log('[BackgroundImageSettings] 更新的配置无效，但当前配置有效，跳过更新');
        return;
      }
      
      // 检查配置是否真的发生了变化（避免不必要的更新）
      const configChanged = 
        updatedConfig.imagePath !== currentGlobalConfig.imagePath ||
        updatedConfig.enabled !== currentGlobalConfig.enabled ||
        updatedConfig.opacity !== currentGlobalConfig.opacity ||
        updatedConfig.blur !== currentGlobalConfig.blur ||
        updatedConfig.fit !== currentGlobalConfig.fit;
      
      if (!configChanged) {
        console.log('[BackgroundImageSettings] 配置未变化，跳过更新');
        return;
      }
      
      console.log('[BackgroundImageSettings] 配置已变化，更新全局配置');
      // 更新全局配置（用于背景图片显示）
      setGlobalConfig(updatedConfig);
      
      // 如果面板正在打开，同步更新本地配置（但需要转换路径格式用于显示）
      if (visible) {
        // 将 local-file:// 协议路径转换回原始路径格式（用于显示）
        let displayImagePath = updatedConfig.sourcePath ?? updatedConfig.imagePath;
        if (displayImagePath && displayImagePath.startsWith('local-file://')) {
          // 移除 local-file:// 前缀
          displayImagePath = displayImagePath.replace(/^local-file:\/\//, '');
          // 解码路径
          try {
            displayImagePath = decodeURIComponent(displayImagePath);
          } catch (e) {
            console.warn('[BackgroundImageSettings] 路径解码失败:', e);
          }
        }
        setLocalConfig(prev => ({
          ...updatedConfig,
          imagePath: displayImagePath, // 使用转换后的路径用于显示
          sourcePath: updatedConfig.sourcePath ?? displayImagePath,
          opacity: prev.opacity,
          blur: prev.blur
        }));
      }
    };

    // 监听配置保存确认事件（用于调试）
    const handleConfigSaved = (event: any, data: { key: string; success: boolean }) => {
      if (data.key === 'background-image' && data.success) {
        console.log('[BackgroundImageSettings] ✅ 配置已成功保存到 settings.json');
      }
    };

    ipcRenderer.on('background-image:show-settings', handleShowSettings);
    ipcRenderer.on('background-image:image-selected', handleImageSelected);
    ipcRenderer.on('background-image:config-updated', handleConfigUpdated);
    ipcRenderer.on('settings:plugin-config-saved', handleConfigSaved);

    return () => {
      console.log('[BackgroundImageSettings] 移除事件监听');
      ipcRenderer.removeListener('background-image:show-settings', handleShowSettings);
      ipcRenderer.removeListener('background-image:image-selected', handleImageSelected);
      ipcRenderer.removeListener('background-image:config-updated', handleConfigUpdated);
      ipcRenderer.removeListener('settings:plugin-config-saved', handleConfigSaved);
    };
  }, [visible]); // 修复依赖，不应该依赖 localConfig

  const handleAdd = () => {
    console.log('[BackgroundImageSettings] ========== 添加按钮被点击==========');
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    console.log('[BackgroundImageSettings] ipcRenderer 可用:', !!ipcRenderer);
    console.log('[BackgroundImageSettings] window.electron:', (window as any).electron);
    
    if (ipcRenderer) {
      console.log('[BackgroundImageSettings] 正在发布background-image:browse-image 事件');
      ipcRenderer.send('background-image:browse-image');
      console.log('[BackgroundImageSettings] 事件已发布');
    } else {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用！');
    }
  };


  // 防抖定时器引用
  const saveConfigTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 保存配置到主进程（带防抖）
  const saveConfigToMainProcess = useCallback((configToSave: BackgroundConfig) => {
    // 清除之前的定时器
    if (saveConfigTimerRef.current) {
      clearTimeout(saveConfigTimerRef.current);
    }
    
    // 设置新的定时器，延迟 300ms 后保存
    saveConfigTimerRef.current = setTimeout(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (ipcRenderer) {
        // 保存时始终用原始路径（sourcePath），避免缓存路径被持久化
        const persistConfig = {
          ...configToSave,
          imagePath: configToSave.sourcePath || configToSave.imagePath,
        };
        console.log('[BackgroundImageSettings] 📤 防抖保存配置到主进程', persistConfig);
        ipcRenderer.send('background-image:update-config', persistConfig);
        
        // 延迟验证：2秒后检查配置是否真的被写入
        setTimeout(async () => {
          try {
            const settingsAPI = (window as any).electronAPI?.settings;
            if (settingsAPI) {
              const saved = await settingsAPI.getPlugin('background-image');
              console.log('[BackgroundImageSettings] 🔍 验证：从 settings 读取的配置:', saved);
              if (saved && saved.data) {
                console.log('[BackgroundImageSettings] ✅ 验证成功：配置已保存到 settings.json');
              } else {
                console.error('[BackgroundImageSettings] ❌ 验证失败：配置未找到或格式错误');
              }
            }
          } catch (error) {
            console.error('[BackgroundImageSettings] 验证配置时出错:', error);
          }
        }, 2000);
      }
      saveConfigTimerRef.current = null;
    }, 300);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveConfigTimerRef.current) {
        clearTimeout(saveConfigTimerRef.current);
      }
    };
  }, []);

  // 实时更新配置的辅助函数
  const updateConfigRealtime = (updates: Partial<BackgroundConfig>) => {
    const finalUpdates: Partial<BackgroundConfig> = { ...updates };
    const newLocalConfig: BackgroundConfig = { ...localConfig, ...finalUpdates, fit: 'cover' as const }; // 始终使用 cover 模式
    setLocalConfig(newLocalConfig);
    
    // 标记需要更新全局配置（useEffect 会处理）
    pendingGlobalUpdateRef.current = { 
      config: {
        ...newLocalConfig,
        imagePath: finalUpdates.imagePath !== undefined 
          ? (finalUpdates.imagePath || '') // 使用原始路径，useEffect 中会转换
          : newLocalConfig.imagePath
      }, 
      shouldSave: false // 实时更新不立即保存，使用防抖
    };
    
    // 使用防抖保存配置到主进程（避免频繁的 IPC 通信）
    saveConfigToMainProcess(newLocalConfig);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  console.log('[BackgroundImageSettings] 渲染组件，visible =', visible);
  
  if (!visible) {
    console.log('[BackgroundImageSettings] visible=false，不渲染面板');
    return null;
  }
  
  console.log('[BackgroundImageSettings] visible=true，渲染面板');

  return (
    <div 
      className="background-image-panel" 
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
        {/* 标题栏*/}
        <div className="bg-panel-header">
          <h2>背景图片设置</h2>
          <button 
            className="bg-close-btn" 
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

      {/* Tab 切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="image">背景图片</TabsTrigger>
        </TabsList>

        {/* 背景图片 Tab */}
        <TabsContent value="image">
        <div className="bg-setting-group">
            <div className="bg-image-grid">
          {isLoading && displayedImages.length === 0 ? (
            <div className="bg-loading">加载中...</div>
          ) : (
            <>
              {/* 始终在最前面显示"无"卡片 */}
              <div
                className={`bg-image-card bg-image-card-none ${!localConfig.imagePath || !localConfig.enabled ? 'bg-image-card-selected' : ''}`}
                onClick={() => handleSelectImage(null)}
              >
                <div className="bg-image-card-none-text">无</div>
              </div>
              
              {/* 显示图片列表 */}
              {displayedImages.length > 0 ? (
                displayedImages.map((image, index) => {
                  // 优先使用缓存路径
                  const imageUrl = getImageUrl(image);
                  const selectedPath = localConfig.sourcePath || localConfig.imagePath;
                  const isSelected = selectedPath === image.path || 
                                    selectedPath === imageUrl ||
                                    selectedPath?.includes(image.name);
                  const imageKey = `${image.path}-${index}`;
                  const isLoaded = loadedImages.has(imageKey);
                  
                  return (
                    <div
                      key={imageKey}
                      className={`bg-image-card ${isSelected ? 'bg-image-card-selected' : ''}`}
                      onClick={() => handleSelectImage(image.path)}
                    >
                      <img
                        src={imageUrl}
                        alt={image.name}
                        className={`bg-image-card-img ${isLoaded ? 'bg-image-card-img-loaded' : 'bg-image-card-img-loading'}`}
                        onError={(e) => {
                          const imgElement = e.target as HTMLImageElement;
                          // 如果使用的是缓存路径，尝试回退到原始路径
                          if (image.cachedPath && imageUrl !== getImageUrl(image.path)) {
                            console.warn('[BackgroundImageSettings] 缓存路径加载失败，回退到原始路径:', image.name);
                            // 清除本地缓存状态，以便原始路径加载成功后重新缓存
                            setImageFiles(prev => prev.map(img => 
                              img.path === image.path 
                                ? { ...img, cachedPath: undefined }
                                : img
                            ));
                            setDisplayedImages(prev => prev.map(img => 
                              img.path === image.path 
                                ? { ...img, cachedPath: undefined }
                                : img
                            ));
                            // 清除加载状态，以便重新加载
                            setLoadedImages(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(imageKey);
                              return newSet;
                            });
                            imgElement.src = getImageUrl(image.path);
                          } else {
                            console.error('[BackgroundImageSettings] 图片加载失败');
                            console.error('[BackgroundImageSettings] 原始路径:', image.path);
                            console.error('[BackgroundImageSettings] 转换后的URL:', imageUrl);
                            imgElement.style.display = 'none';
                          }
                        }}
                        onLoad={async () => {
                          console.log('[BackgroundImageSettings] 图片加载成功:', image.name, imageUrl);
                          // 标记图片为已加载（如果还没有标记）
                          setLoadedImages(prev => {
                            if (prev.has(imageKey)) {
                              return prev; // 已经标记过，不需要更新
                            }
                            return new Set(prev).add(imageKey);
                          });
                          
                          // 图片加载成功后，触发缓存（如果还没有缓存）
                          if (!image.cachedPath) {
                            const ipcRenderer = (window as any).electron?.ipcRenderer;
                            if (ipcRenderer) {
                              try {
                                const result = await ipcRenderer.invoke('background-image:cache-image', image.path);
                                if (result.success) {
                                  console.log('[BackgroundImageSettings] 图片已缓存:', image.name);
                                  // 更新本地状态，使用缓存路径
                                  setImageFiles(prev => prev.map(img => 
                                    img.path === image.path 
                                      ? { ...img, cachedPath: result.cachedPath }
                                      : img
                                  ));
                                  // 同时更新显示的图片列表
                                  setDisplayedImages(prev => prev.map(img => 
                                    img.path === image.path 
                                      ? { ...img, cachedPath: result.cachedPath }
                                      : img
                                  ));
                                }
                              } catch (error) {
                                console.error('[BackgroundImageSettings] 缓存图片失败:', image.name, error);
                              }
                            }
                          }
                        }}
                      />
                      <div className="bg-image-card-name" title={image.name}>
                        {image.name}
          </div>
                    </div>
                  );
                })
              ) : null}
              
              {/* 添加图片按钮卡片 */}
              <div
                className="bg-image-card bg-image-card-add"
                onClick={handleAdd}
              >
                <Icon iconSet="ui" name="plus" size={24} />
              </div>
            </>
          )}
        </div>
        {hasMore && !isLoading && (
          <button 
            className="bg-load-more-btn" 
            onClick={loadMore}
          >
            加载更多
          </button>
        )}
        {!hasMore && displayedImages.length > 0 && (
          <div className="bg-load-complete">已经到底啦...</div>
        )}
        </div>

            {/* 透明度和模糊度 - 横向显示 */}
            <div className="bg-setting-group bg-setting-group-horizontal">
              {/* 透明度 */}
              <div className="bg-setting-item">
          <label className="bg-label">
            透明 <span className="bg-value">{localConfig.opacity.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localConfig.opacity}
            onChange={(e) => updateConfigRealtime({ opacity: parseFloat(e.target.value) })}
            className="bg-slider"
          />
        </div>

              {/* 模糊度 */}
              <div className="bg-setting-item">
          <label className="bg-label">
            模糊 <span className="bg-value">{localConfig.blur}px</span>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={localConfig.blur}
            onChange={(e) => updateConfigRealtime({ blur: parseInt(e.target.value) })}
            className="bg-slider"
          />
        </div>
        </div>
        </TabsContent>
      </Tabs>
      </div>
  );
};
