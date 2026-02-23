/**
 * 背景图片渲染组件
 * 监听配置更新并应用背景图片到界面
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useBackgroundStore,
  DEFAULT_BACKGROUND_CONFIG,
} from '../../stores/backgroundStore';
import type { BackgroundConfig } from '../../stores/backgroundStore';

type IpcRendererListener = (event: unknown, ...args: unknown[]) => void;

interface IpcRendererLike {
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, listener: IpcRendererListener) => void;
  removeListener: (channel: string, listener: IpcRendererListener) => void;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

interface SettingsAPIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type SettingsAPIResult<T> = SettingsAPIResponse<T> | T | undefined | null;

interface SettingsAPI {
  get?: <T = unknown>(key: string) => Promise<SettingsAPIResponse<T>>;
  getPlugin?: <T = unknown>(key: string) => Promise<SettingsAPIResponse<T>>;
  update?: <T = unknown>(
    key: string,
    value: T,
    target?: unknown
  ) => Promise<SettingsAPIResponse<void>>;
}

type ElectronBridgeWindow = Window & {
  electron?: {
    ipcRenderer?: IpcRendererLike;
  };
  electronAPI?: {
    settings?: SettingsAPI;
  };
};

const getElectronWindow = (): ElectronBridgeWindow | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as ElectronBridgeWindow;
};

const getIpcRenderer = (): IpcRendererLike | undefined =>
  getElectronWindow()?.electron?.ipcRenderer;

const getSettingsAPI = (): SettingsAPI | undefined =>
  getElectronWindow()?.electronAPI?.settings;

const extractSettingsData = <T,>(result: SettingsAPIResult<T>): T | undefined => {
  if (result == null) {
    return undefined;
  }

  if (typeof result === 'object' && 'success' in result) {
    const response = result as SettingsAPIResponse<T>;
    return response.success ? response.data : undefined;
  }

  return result as T;
};

const normalizeToLocalFileUrl = (filePath: string): string => {
  if (!filePath) {
    return '';
  }

  if (filePath.startsWith('local-file://')) {
    return filePath;
  }

  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  let cleanPath = filePath;
  if (filePath.startsWith('file://')) {
    cleanPath = filePath.replace(/^file:\/\/\/?/, '');
    if (cleanPath.match(/^\/[a-zA-Z]:/)) {
      cleanPath = cleanPath.substring(1);
    }
    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch (error) {
      console.warn('[BackgroundImage] file:// 路径解码失败:', error);
    }
  }

  let normalizedPath = cleanPath.replace(/\\/g, '/');

  if (normalizedPath.includes('%')) {
    try {
      const decoded = decodeURIComponent(normalizedPath);
      if (
        decoded &&
        decoded.length > 0 &&
        (decoded.includes('/') ||
          decoded.includes('\\') ||
          decoded.match(/^[a-zA-Z]:/))
      ) {
        normalizedPath = decoded.replace(/\\/g, '/');
      }
    } catch (error) {
      console.warn('[BackgroundImage] 路径解码失败:', error);
    }
  }

  if (normalizedPath.match(/^[a-zA-Z]:/)) {
    const driveLetter = normalizedPath.substring(0, 2);
    let pathWithoutDrive = normalizedPath.substring(2);

    if (!pathWithoutDrive.startsWith('/')) {
      pathWithoutDrive = `/${pathWithoutDrive}`;
    }

    const pathParts = pathWithoutDrive.split('/').filter((part) => part.length > 0);

    if (pathParts.length === 0) {
      console.error(
        '[BackgroundImage] 路径部分为空，原始路径:',
        filePath,
        'normalizedPath:',
        normalizedPath
      );
      return '';
    }

    const encodedParts = pathParts.map((part) => {
      try {
        return encodeURIComponent(part);
      } catch (error) {
        console.error('[BackgroundImage] 路径部分编码失败:', part, error);
        return part;
      }
    });

    const encodedPath = encodedParts.join('/');
    const result = `local-file://${driveLetter}/${encodedPath}`;
    // 减少日志输出，避免在控制台显示 local-file:// 路径
    // console.log('[BackgroundImage] 路径转换:', {
    //   original: filePath,
    //   normalizedPath,
    //   result,
    // });
    return result;
  }

  const pathWithSlash = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;
  const pathParts = pathWithSlash.split('/').filter((part) => part.length > 0);

  if (pathParts.length === 0) {
    console.error(
      '[BackgroundImage] Unix 路径部分为空，原始路径:',
      filePath,
      'normalizedPath:',
      normalizedPath
    );
    return '';
  }

  const encodedParts = pathParts.map((part) => {
    try {
      return encodeURIComponent(part);
    } catch (error) {
      console.error('[BackgroundImage] Unix 路径部分编码失败:', part, error);
      return part;
    }
  });
  const encodedPath = encodedParts.join('/');
  const result = `local-file:///${encodedPath}`;
  // 减少日志输出，避免在控制台显示 local-file:// 路径
  // console.log('[BackgroundImage] 路径转换:', {
  //   original: filePath,
  //   normalizedPath,
  //   result,
  // });
  return result;
};

const BackgroundImage: React.FC = () => {
  const { config, setConfig, isInitialized } = useBackgroundStore();
  const cacheInFlightRef = useRef<Set<string>>(new Set());
  
  // 调试：监控配置变化
  useEffect(() => {
    console.log('[BackgroundImage] ========== 配置已更新 ==========');
    console.log('[BackgroundImage] enabled:', config.enabled);
    console.log('[BackgroundImage] imagePath:', config.imagePath);
    console.log('[BackgroundImage] 完整配置:', config);
    console.log('[BackgroundImage] 是否应该显示背景:', config.enabled && !!config.imagePath);
    console.log('[BackgroundImage] =================================');
  }, [config]);


  useEffect(() => {
    if (isInitialized) {
      return;
    }

    let cancelled = false;

    const loadPersistedConfig = async (): Promise<void> => {
      const settingsAPI = getSettingsAPI();
      if (!settingsAPI) {
        return;
      }

      try {
        const fetchStoredConfig = async (): Promise<BackgroundConfig | undefined> => {
          if (settingsAPI.getPlugin) {
            try {
              const pluginResponse = await settingsAPI.getPlugin<BackgroundConfig>('background-image');
              const pluginConfig = extractSettingsData<BackgroundConfig>(pluginResponse);
              if (pluginConfig) {
                return pluginConfig;
              }
            } catch (error) {
              console.error('[BackgroundImage] 通过 getPlugin 读取背景配置失败:', error);
            }
          }

          if (settingsAPI.get) {
            try {
              const fallbackResponse = await settingsAPI.get<BackgroundConfig>('background-image');
              return extractSettingsData<BackgroundConfig>(fallbackResponse);
            } catch (error) {
              console.error('[BackgroundImage] 通过 get 读取背景配置失败:', error);
            }
          }

          return undefined;
        };

        const storedConfig = await fetchStoredConfig();
        if (cancelled) {
          return;
        }

        if (!storedConfig || typeof storedConfig !== 'object') {
          console.warn('[BackgroundImage] settings 返回了无效的背景配置数据');
          return;
        }
        const storedConfigPartial = storedConfig as Partial<BackgroundConfig>;
        const normalizedConfig: BackgroundConfig = {
          imagePath: storedConfigPartial.imagePath
            ? normalizeToLocalFileUrl(String(storedConfigPartial.imagePath))
            : DEFAULT_BACKGROUND_CONFIG.imagePath,
          sourcePath:
            typeof storedConfigPartial.sourcePath === 'string'
              ? storedConfigPartial.sourcePath
              : DEFAULT_BACKGROUND_CONFIG.sourcePath,
          opacity:
            typeof storedConfigPartial.opacity === 'number'
              ? storedConfigPartial.opacity
              : DEFAULT_BACKGROUND_CONFIG.opacity,
          blur:
            typeof storedConfigPartial.blur === 'number'
              ? storedConfigPartial.blur
              : DEFAULT_BACKGROUND_CONFIG.blur,
          fit:
            storedConfigPartial.fit && ['cover', 'contain', 'fill', 'none'].includes(storedConfigPartial.fit)
              ? storedConfigPartial.fit
              : DEFAULT_BACKGROUND_CONFIG.fit,
          enabled: Boolean(storedConfigPartial.enabled && storedConfigPartial.imagePath),
        };

        setConfig(normalizedConfig);
      } catch (error) {
        console.error('[BackgroundImage] 读取本地背景配置失败:', error);
      }
    };

    loadPersistedConfig();

    return () => {
      cancelled = true;
    };
  }, [isInitialized, setConfig]);

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
      console.error('[BackgroundImage] ipcRenderer 不可用');
      return;
    }

    const handleConfigUpdated: IpcRendererListener = (_event, updatedConfigRaw) => {
      if (!updatedConfigRaw || typeof updatedConfigRaw !== 'object') {
        console.warn('[BackgroundImage] 没有收到有效的配置数据');
        return;
      }

      const updatedConfig = updatedConfigRaw as Partial<BackgroundConfig>;

      const configWithLocalFileUrl: BackgroundConfig = {
        imagePath: updatedConfig.imagePath
          ? normalizeToLocalFileUrl(String(updatedConfig.imagePath))
          : DEFAULT_BACKGROUND_CONFIG.imagePath,
        sourcePath:
          typeof updatedConfig.sourcePath === 'string'
            ? updatedConfig.sourcePath
            : DEFAULT_BACKGROUND_CONFIG.sourcePath,
        opacity:
          typeof updatedConfig.opacity === 'number'
            ? updatedConfig.opacity
            : DEFAULT_BACKGROUND_CONFIG.opacity,
        blur:
          typeof updatedConfig.blur === 'number'
            ? updatedConfig.blur
            : DEFAULT_BACKGROUND_CONFIG.blur,
        fit:
          updatedConfig.fit && ['cover', 'contain', 'fill', 'none'].includes(updatedConfig.fit)
            ? updatedConfig.fit
            : DEFAULT_BACKGROUND_CONFIG.fit,
        enabled: Boolean(updatedConfig.enabled && updatedConfig.imagePath),
      };

      // 如果收到的是空配置（无 imagePath），且当前已有有效配置，跳过以避免覆盖正确的背景
      if (!configWithLocalFileUrl.imagePath) {
        const currentConfig = useBackgroundStore.getState().config;
        if (currentConfig.imagePath) {
          return;
        }
        // 尚未初始化时也跳过，让 loadPersistedConfig 负责加载
        if (!useBackgroundStore.getState().isInitialized) {
          return;
        }
      }

      setConfig(configWithLocalFileUrl);
    };

    ipcRenderer.on('background-image:config-updated', handleConfigUpdated);

    setTimeout(() => {
      ipcRenderer.send('background-image:renderer-ready');
    }, 200);

    return () => {
      console.log('[BackgroundImage] 移除配置更新监听');
      ipcRenderer.removeListener('background-image:config-updated', handleConfigUpdated);
    };
  }, [setConfig]);

  useEffect(() => {
    const sourcePath = config.sourcePath;
    const imagePath = config.imagePath;

    if (!sourcePath || !imagePath) {
      return;
    }

    const lowerImagePath = imagePath.toLowerCase();
    if (lowerImagePath.includes('/cache/background/')) {
      return;
    }

    if (cacheInFlightRef.current.has(sourcePath)) {
      return;
    }

    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
      return;
    }

    const invoke = ipcRenderer.invoke?.bind(ipcRenderer);
    if (!invoke) {
      return;
    }

    cacheInFlightRef.current.add(sourcePath);
    invoke('background-image:cache-image', sourcePath)
      .then((result: any) => {
        cacheInFlightRef.current.delete(sourcePath);
        // 缓存仅用于显示优化，不回写到持久化配置，避免缓存被清理后背景失效
        if (!result?.success || !result.cachedPath || result.cachedPath === sourcePath) {
          return;
        }
        // 仅更新内存中的 store，不发送 update-config 到主进程
        const latestConfig = useBackgroundStore.getState().config;
        if (latestConfig.sourcePath === sourcePath) {
          setConfig({
            ...latestConfig,
            imagePath: normalizeToLocalFileUrl(result.cachedPath),
          });
        }
      })
      .catch((error: any) => {
        cacheInFlightRef.current.delete(sourcePath);
        console.error('[BackgroundImage] 自动缓存背景图片失败:', error);
      });
  }, [config.imagePath, config.sourcePath]);

  // 当配置变化时，更新body类名以控制透明背景
  useEffect(() => {
    console.log('[BackgroundImage] 检查是否应该显示背景:', {
      enabled: config.enabled,
      hasImagePath: !!config.imagePath,
      imagePath: config.imagePath
    });

    if (!config.enabled || !config.imagePath) {
      console.log('[BackgroundImage] 背景未启用或没有图片路径，移除背景类名');
      document.body.classList.remove('background-image-enabled');
      return;
    }

    // 添加类名，让 CSS body 背景设置为透明（使用!important 防止主题覆盖）
    console.log('[BackgroundImage] 背景已启用，添加背景类名');
    document.body.classList.add('background-image-enabled');
    
    // 清理函数：组件卸载时移除类名
    return () => {
      document.body.classList.remove('background-image-enabled');
    };
  }, [config]);

  // 监听主题切换事件，确保背景透明度在主题切换后仍然有效
  // 使用 useRef 存储监听器函数，避免依赖项变化导致重复添加
  const themeChangeHandlerRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    
    // 如果已经有监听器，先移除旧的
    if (themeChangeHandlerRef.current && ipcRenderer) {
      ipcRenderer.removeListener('theme:theme-changed', themeChangeHandlerRef.current);
    }

    const handleThemeChange = () => {
      // 如果背景启用，重新确认body 类名存在
      if (config.enabled && config.imagePath) {
        document.body.classList.add('background-image-enabled');
      }
    };

    // 保存监听器引用
    themeChangeHandlerRef.current = handleThemeChange;

    // 监听主题切换事件
    if (ipcRenderer) {
      ipcRenderer.on('theme:theme-changed', handleThemeChange);
    }

    return () => {
      if (ipcRenderer && themeChangeHandlerRef.current) {
        ipcRenderer.removeListener('theme:theme-changed', themeChangeHandlerRef.current);
        themeChangeHandlerRef.current = null;
      }
    };
  }, [config.enabled, config.imagePath]);

  // 使用绝对定位创建背景层，z-index 设为 99（在最底层级）
  // 透明度和模糊效果直接应用于背景层
  // 使用 useMemo 优化样式对象，避免每次渲染都创建新对象
  // 注意：所有 hooks 必须在条件返回之前调用
  const imageUrl = useMemo(() => {
    if (!config.imagePath) return '';
    try {
    return normalizeToLocalFileUrl(config.imagePath);
    } catch (error) {
      console.warn('[BackgroundImage] 路径转换失败:', config.imagePath, error);
      return '';
    }
  }, [config.imagePath]);
  
  // 图片加载错误处理
  const [imageLoadError, setImageLoadError] = useState(false);
  
  useEffect(() => {
    if (imageUrl) {
      setImageLoadError(false);
      // 预加载图片以检测错误
      const img = new Image();
      img.onerror = () => {
        console.warn('[BackgroundImage] 图片加载失败:', imageUrl);
        setImageLoadError(true);
      };
      img.onload = () => {
        setImageLoadError(false);
      };
      img.src = imageUrl;
    } else {
      setImageLoadError(false);
    }
  }, [imageUrl]);
  
  const backgroundStyle: React.CSSProperties = useMemo(() => ({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 99, // 背景在最底层，不遮挡UI元素
    pointerEvents: 'none',
    backgroundImage: (imageUrl && !imageLoadError) ? `url("${imageUrl}")` : 'none', // 确保使用 local-file:// 协议
    backgroundSize: config.fit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    opacity: config.opacity,
    filter: config.blur > 0 ? `blur(${config.blur}px)` : 'none',
  }), [imageUrl, imageLoadError, config.fit, config.opacity, config.blur]);
  
  // 如果背景未启用或没有图片路径，不渲染背景层（但组件本身仍然挂载以监听事件）
  if (!config.enabled || !config.imagePath) {
    console.log('[BackgroundImage] 背景未启用或没有图片路径，不渲染背景层');
    return null;
  }

  console.log('[BackgroundImage] 渲染背景层，图片路径:', config.imagePath);
  
  return (
    <div 
      id="background-image-layer" 
      style={backgroundStyle}
      data-background-enabled="true"
    />
  );
};

export { BackgroundImage };
export default BackgroundImage;

