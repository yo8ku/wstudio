/**
 * 背景图片管理器
 * 负责管理背景图片的设置、更新和移除（仅配置管理，DOM 操作在渲染进程）
 */

import type { PluginAPI } from './plugin-api';
import type { BackgroundImageConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as path from 'path';

interface SettingsResponse<T> {
  success: boolean;
  data?: T;
  error?: unknown;
}

type SettingsResult<T> = T | SettingsResponse<T> | undefined | null;

export class BackgroundManager {
  private config: BackgroundImageConfig;
  private api: PluginAPI;

  constructor(api: PluginAPI) {
    this.api = api;
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 兼容不同形态的设置返回值
   */
  private extractSettingsData<T>(result: SettingsResult<T>): T | undefined {
    if (result == null) {
      return undefined;
    }

    if (typeof result === 'object' && 'success' in result) {
      const response = result as SettingsResponse<T>;
      return response.success ? response.data : undefined;
    }

    return result as T;
  }

  /**
   * 初始化背景管理器
   */
  async initialize(): Promise<void> {
    // 从 settings.json 加载配置
    await this.loadConfig();
    
    // 不在这里立即通知渲染进程，因为渲染进程可能还没有准备好
    // 等待渲染进程发送 'background-image:renderer-ready' 事件后再发送配置
    console.log('[BackgroundManager] 配置已加载:', {
      enabled: this.config.enabled,
      hasImagePath: !!this.config.imagePath,
      imagePath: this.config.imagePath
    });
  }

  /**
   * 加载配置
   */
  private async loadConfig(): Promise<void> {
    try {
      console.log('[BackgroundManager] ========== 开始加载配置 ==========');
      
      // 优先从 settings.json 读取配置
      const settingsConfigRaw = await this.api.settings.get<BackgroundImageConfig>('background-image');
      const settingsConfig = this.extractSettingsData(settingsConfigRaw);
      console.log('[BackgroundManager] 从 settings.json 读取的配置:', settingsConfig);
      
      // 检查配置是否有效（不仅仅是 truthy，还要检查是否是对象且有内容）
      if (settingsConfig && typeof settingsConfig === 'object' && Object.keys(settingsConfig).length > 0) {
        console.log('[BackgroundManager] 检测到有效的 settings.json 配置');
        // 验证并修复不合理的配置值（validateConfig 会确保所有字段都存在）
        const validatedConfig = this.validateConfig(settingsConfig);
        console.log('[BackgroundManager] 验证后的配置:', validatedConfig);
        // 直接使用验证后的配置（validateConfig 已经确保所有字段都存在）
        this.config = validatedConfig;
        console.log('[BackgroundManager] 最终配置:', this.config);
        
        // 如果配置被修复或缺少字段，保存完整的配置
        // 使用深度比较，检查配置是否真的发生了变化
        const originalStr = JSON.stringify(settingsConfig);
        const validatedStr = JSON.stringify(validatedConfig);
        const needsUpdate = originalStr !== validatedStr;
        
        // 特别检查：如果原始配置中有 local-file:// 格式的路径，或者文件不存在导致路径被清空，都需要保存
        const hadLocalFileProtocol = (settingsConfig.imagePath && String(settingsConfig.imagePath).startsWith('local-file://')) ||
                                     (settingsConfig.sourcePath && String(settingsConfig.sourcePath).startsWith('local-file://'));
        const originalImagePath = settingsConfig.imagePath ? String(settingsConfig.imagePath).trim() : '';
        const validatedImagePath = validatedConfig.imagePath ? String(validatedConfig.imagePath).trim() : '';
        const fileWasRemoved = (originalImagePath !== '' && validatedImagePath === '') ||
                               (settingsConfig.sourcePath && String(settingsConfig.sourcePath).trim() !== '' && 
                                (!validatedConfig.sourcePath || String(validatedConfig.sourcePath).trim() === ''));
        
        console.log('[BackgroundManager] 配置比较:', {
          originalImagePath,
          validatedImagePath,
          hadLocalFileProtocol,
          fileWasRemoved,
          needsUpdate
        });
        
        if (needsUpdate || hadLocalFileProtocol || fileWasRemoved) {
          console.log('[BackgroundManager] 配置被修复或补充，保存完整配置');
          console.log('[BackgroundManager] 原始配置:', originalStr);
          console.log('[BackgroundManager] 修复后配置:', validatedStr);
          if (hadLocalFileProtocol) {
            console.log('[BackgroundManager] 检测到 local-file:// 格式路径，需要保存转换后的配置');
          }
          if (fileWasRemoved) {
            console.log('[BackgroundManager] 检测到文件不存在，需要保存清空后的配置');
            console.log('[BackgroundManager] 原始 imagePath:', originalImagePath);
            console.log('[BackgroundManager] 修复后 imagePath:', validatedImagePath);
          }
          // 保存修复后的配置（包括文件不存在时清空的配置）
          await this.api.settings.update('background-image', this.config);
          console.log('[BackgroundManager] 配置已保存，新的配置:', JSON.stringify(this.config, null, 2));
          // 配置被修复后，不在这里立即通知渲染进程
          // 因为此时渲染进程可能还没有准备好
          // 等待渲染进程发送 'background-image:renderer-ready' 事件后再发送配置
        } else {
          console.log('[BackgroundManager] 配置无需更新');
        }
        console.log('[BackgroundManager] ========== 配置加载完成 ==========');
        return;
      }
      
      console.log('[BackgroundManager] settings.json 中没有有效配置，尝试从旧存储读取');
      
      // 向后兼容：从旧的插件存储读取
      const storageConfig = await this.api.storage.get<BackgroundImageConfig>('backgroundImageConfig');
      console.log('[BackgroundManager] 从旧存储读取的配置:', storageConfig);
      
      if (storageConfig && typeof storageConfig === 'object' && Object.keys(storageConfig).length > 0) {
        console.log('[BackgroundManager] 检测到有效的旧存储配置，开始迁移');
        // 验证并修复不合理的配置值（validateConfig 会确保所有字段都存在）
        const validatedConfig = this.validateConfig(storageConfig);
        // 直接使用验证后的配置（validateConfig 已经确保所有字段都存在）
        this.config = validatedConfig;
        // 迁移到 settings.json
        await this.api.settings.update('background-image', this.config);
        console.log('[BackgroundManager] 配置已迁移到 settings.json');
        // 配置迁移后，不在这里立即通知渲染进程
        // 因为此时渲染进程可能还没有准备好
        // 等待渲染进程发送 'background-image:renderer-ready' 事件后再发送配置
        console.log('[BackgroundManager] ========== 配置加载完成 ==========');
        return;
      }
      
      console.log('[BackgroundManager] 没有找到任何已保存的配置，使用默认配置');
      console.log('[BackgroundManager] 默认配置:', DEFAULT_CONFIG);
      console.log('[BackgroundManager] ========== 配置加载完成 ==========');
    } catch (error) {
      console.error('[BackgroundManager] 加载配置时发生错误:', error);
      // 发生错误时使用默认配置
      this.config = { ...DEFAULT_CONFIG };
      console.error('[BackgroundManager] 已回退到默认配置');
    }
  }

  /**
   * 将 local-file:// 协议 URL 转换回文件系统路径
   */
  private convertFromLocalFileUrl(url: string): string {
    if (!url) {
      return '';
    }
    
    // 如果不是 local-file:// 协议，直接返回
    if (!url.startsWith('local-file://')) {
      return url;
    }
    
    // 移除 local-file:// 前缀
    let path = url.replace(/^local-file:\/\//, '');
    
    // Windows 路径格式: local-file://D:/path/to/file.png -> D:/path/to/file.png
    // Unix 路径格式: local-file:///path/to/file.png -> /path/to/file.png
    if (path.match(/^[a-zA-Z]:\//)) {
      // Windows 路径，移除开头的斜杠（如果有）
      // 例如: D:/path -> D:/path (正确)
      // 例如: D://path -> D:/path (需要处理)
      path = path.replace(/^([a-zA-Z]:)\/\/+/, '$1/');
    } else if (path.startsWith('/')) {
      // Unix 路径，保留开头的斜杠
      // 例如: /path/to/file.png
    } else {
      // 可能是 Windows 路径但没有盘符，添加开头的斜杠
      path = '/' + path;
    }
    
    // 解码路径
    try {
      // 分割路径并解码每个部分
      const pathParts = path.split('/');
      const decodedParts = pathParts.map(part => {
        if (!part) return part;
        try {
          return decodeURIComponent(part);
        } catch (e) {
          console.warn('[BackgroundManager] 路径部分解码失败:', part, e);
          return part;
        }
      });
      const decodedPath = decodedParts.join('/');
      
      // Windows 路径需要转换回反斜杠（可选，但保存时使用正斜杠也可以）
      // 为了兼容性，我们保存时使用正斜杠
      return decodedPath;
    } catch (e) {
      console.warn('[BackgroundManager] 路径解码失败:', e);
      return path;
    }
  }

  /**
   * 验证并修复配置值
   * 如果 opacity 值不合理（可能是错误的值），使用默认值
   */
  private validateConfig(config: Partial<BackgroundImageConfig>): BackgroundImageConfig {
    // 处理 imagePath：如果它是 local-file:// 格式，转换为原始路径
    let imagePath = config.imagePath !== undefined ? String(config.imagePath) : DEFAULT_CONFIG.imagePath;
    if (imagePath && imagePath.startsWith('local-file://')) {
      console.log('[BackgroundManager] 检测到 local-file:// 格式的路径，转换为原始路径:', imagePath);
      imagePath = this.convertFromLocalFileUrl(imagePath);
      console.log('[BackgroundManager] 转换后的原始路径:', imagePath);
    }
    
    let sourcePath = config.sourcePath !== undefined ? String(config.sourcePath) : imagePath;
    if (sourcePath && sourcePath.startsWith('local-file://')) {
      console.log('[BackgroundManager] 检测到 local-file:// 格式的 sourcePath，转换为原始路径:', sourcePath);
      sourcePath = this.convertFromLocalFileUrl(sourcePath);
      console.log('[BackgroundManager] 转换后的原始 sourcePath:', sourcePath);
    }
    
    // 确保所有必需的字段都存在
    const validated: BackgroundImageConfig = {
      imagePath: imagePath,
      sourcePath,
      opacity: config.opacity !== undefined ? Number(config.opacity) : DEFAULT_CONFIG.opacity,
      blur: config.blur !== undefined ? Number(config.blur) : DEFAULT_CONFIG.blur,
      fit: config.fit !== undefined && ['cover', 'contain', 'fill', 'none'].includes(config.fit) 
        ? config.fit 
        : DEFAULT_CONFIG.fit,
      enabled: config.enabled !== undefined ? Boolean(config.enabled) : DEFAULT_CONFIG.enabled,
    };
    
    // 如果 opacity 值小于 0.05，可能是错误的值（比如 0.04），使用默认值 0.65
    // 但保留用户可能有意设置的非常小的值（>= 0.05），只修复明显错误的值
    if (validated.opacity < 0.05) {
      console.warn(`[BackgroundManager] 检测到不合理的 opacity 值: ${validated.opacity}，使用默认值 ${DEFAULT_CONFIG.opacity}`);
      validated.opacity = DEFAULT_CONFIG.opacity;
    }
    
    // 确保 opacity 在有效范围内
    if (validated.opacity < 0 || validated.opacity > 1) {
      console.warn(`[BackgroundManager] opacity 值超出范围: ${validated.opacity}，使用默认值 ${DEFAULT_CONFIG.opacity}`);
      validated.opacity = DEFAULT_CONFIG.opacity;
    }
    
    // 确保 blur 在有效范围内
    if (validated.blur < 0 || validated.blur > 20) {
      console.warn(`[BackgroundManager] blur 值超出范围: ${validated.blur}，使用默认值 ${DEFAULT_CONFIG.blur}`);
      validated.blur = DEFAULT_CONFIG.blur;
    }
    
    // 检查文件是否存在，如果不存在则暂时禁用背景（等待缓存恢复）
    if (validated.imagePath && validated.imagePath.trim() !== '') {
      try {
        const normalizedPath = path.normalize(validated.imagePath);
        console.log(`[BackgroundManager] 检查文件是否存在: ${normalizedPath}`);
        validated.imagePath = normalizedPath;
        
        if (!fs.existsSync(normalizedPath)) {
          console.warn(`[BackgroundManager] 图片文件不存在，暂时禁用背景，等待缓存恢复: ${normalizedPath}`);
          validated.enabled = false;
          // 保留 sourcePath，方便后续从缓存中恢复
          if (!validated.sourcePath || validated.sourcePath.trim() === '') {
            validated.sourcePath = normalizedPath;
          }
        } else {
          console.log(`[BackgroundManager] 图片文件存在: ${normalizedPath}`);
        }
      } catch (error) {
        console.warn(`[BackgroundManager] 检查文件存在性失败，暂时禁用背景: ${validated.imagePath}`, error);
        validated.enabled = false;
      }
    }
    
    // 如果 imagePath 存在但 enabled 为 false，自动启用背景
    // 这可以修复配置不一致的问题（比如用户设置了图片但忘记启用）
    if (validated.imagePath && validated.imagePath.trim() !== '' && !validated.enabled) {
      console.log(`[BackgroundManager] 检测到 imagePath 存在但 enabled 为 false，自动启用背景`);
      validated.enabled = true;
    }
    
    // 如果 enabled 为 true 但 imagePath 为空，自动禁用背景
    if (validated.enabled && (!validated.imagePath || validated.imagePath.trim() === '')) {
      console.log(`[BackgroundManager] 检测到 enabled 为 true 但 imagePath 为空，自动禁用背景`);
      validated.enabled = false;
    }
    
    return validated;
  }

  /**
   * 保存配置
   */
  private async saveConfig(): Promise<void> {
    try {
      console.log('[BackgroundManager] ========== 开始保存配置 ==========');
      console.log('[BackgroundManager] 要保存的配置:', JSON.stringify(this.config, null, 2));
      
      // 1. 保存到 settings.json
      await this.api.settings.update('background-image', this.config);
      console.log('[BackgroundManager] 配置已保存到 settings.json');
      
      // 验证保存是否成功
      const savedConfigRaw = await this.api.settings.get<BackgroundImageConfig>('background-image');
      const savedConfig = this.extractSettingsData(savedConfigRaw);
      console.log('[BackgroundManager] 验证保存的配置:', JSON.stringify(savedConfig, null, 2));
      
      // 2. 通知渲染进程应用背景
      this.notifyRenderer();
      console.log('[BackgroundManager] ========== 配置保存完成 ==========');
    } catch (error) {
      console.error('[BackgroundManager] 保存配置失败:', error);
      throw error; // 重新抛出错误，让调用者知道保存失败
    }
  }

  /**
   * 通知渲染进程更新背景
   */
  notifyRenderer(): void {
    try {
      // 转换配置，将文件路径转换为 local-file:// 协议
      const resolvedImagePath = this.getExistingImagePath();
      
      // 只有当文件确实存在时才发送配置，否则清空 imagePath
      let imagePathForRenderer = '';
      if (resolvedImagePath) {
        try {
          imagePathForRenderer = this.convertToLocalFileUrl(resolvedImagePath);
        } catch (e) {
          console.warn('[BackgroundManager] 转换路径为 local-file:// 失败:', resolvedImagePath, e);
          imagePathForRenderer = '';
        }
      }
      
      const configForRenderer = {
        ...this.config,
        imagePath: imagePathForRenderer,
        // 如果文件不存在，禁用背景
        enabled: imagePathForRenderer ? this.config.enabled : false
      };
      
      // 通过 events API 发送事件到渲染进程
      this.api.events.emit('background-image:config-updated', configForRenderer);
    } catch (error) {
      console.error('[BackgroundManager] notifyRenderer 发生错误:', error);
      // 发送空配置，禁用背景
      this.api.events.emit('background-image:config-updated', {
        ...this.config,
        imagePath: '',
        enabled: false
      });
    }
  }

  /**
   * 将文件系统路径转换为 local-file:// 协议 URL
   */
  private convertToLocalFileUrl(filePath: string): string {
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
        console.warn('[BackgroundManager] file:// 路径解码失败:', e);
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
        console.warn('[BackgroundManager] 路径解码失败:', e);
      }
    }
    
    // Windows 路径格式: local-file://D:/path/to/file.png
    // Unix 路径格式: local-file:///path/to/file.png
    if (normalizedPath.match(/^[a-zA-Z]:/)) {
      // Windows 绝对路径
      // 分离盘符和路径
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
        console.error('[BackgroundManager] 路径部分为空，原始路径:', filePath, 'normalizedPath:', normalizedPath);
        return '';
      }
      
      const encodedParts = pathParts.map(part => {
        // 直接编码，不尝试解码（避免双重编码问题）
        // 因为主进程返回的路径应该是未编码的原始路径
        try {
          return encodeURIComponent(part);
        } catch (e) {
          console.error('[BackgroundManager] 路径部分编码失败:', part, e);
          return part; // 编码失败，返回原始部分
        }
      });
      
      const encodedPath = encodedParts.join('/');
      const result = `local-file://${driveLetter}/${encodedPath}`;
      // 减少日志输出，避免在控制台显示 local-file:// 路径
      // console.log('[BackgroundManager] 路径转换:', { 
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
        console.error('[BackgroundManager] Unix 路径部分为空，原始路径:', filePath, 'normalizedPath:', normalizedPath);
        return '';
      }
      
      const encodedParts = pathParts.map(part => {
        // 直接编码，不尝试解码
        try {
          return encodeURIComponent(part);
        } catch (e) {
          console.error('[BackgroundManager] Unix 路径部分编码失败:', part, e);
          return part; // 编码失败，返回原始部分
        }
      });
      const encodedPath = encodedParts.join('/');
      const result = `local-file:///${encodedPath}`;
      // 减少日志输出，避免在控制台显示 local-file:// 路径
      // console.log('[BackgroundManager] 路径转换:', { original: filePath, cleanPath, normalizedPath, result });
      return result;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): BackgroundImageConfig {
    return { ...this.config };
  }

  /**
   * 设置背景图片
   */
  async setBackgroundImage(imagePath: string): Promise<void> {
    this.config.imagePath = imagePath;
    this.config.sourcePath = imagePath;
    this.config.enabled = true;
    await this.saveConfig();
  }

  /**
   * 移除背景图片
   */
  async removeBackgroundImage(): Promise<void> {
    this.config.enabled = false;
    this.config.imagePath = '';
    this.config.sourcePath = '';
    await this.saveConfig();
  }

  /**
   * 更新配置
   */
  async updateConfig(partialConfig: Partial<BackgroundImageConfig>): Promise<void> {
    // 如果 imagePath 是 local-file:// 格式，转换为原始路径再保存
    const configToSave = { ...partialConfig };
    if (configToSave.imagePath && configToSave.imagePath.startsWith('local-file://')) {
      console.log('[BackgroundManager] 检测到 local-file:// 格式的路径，转换为原始路径:', configToSave.imagePath);
      configToSave.imagePath = this.convertFromLocalFileUrl(configToSave.imagePath);
      console.log('[BackgroundManager] 转换后的原始路径:', configToSave.imagePath);
    }
    if (configToSave.sourcePath && configToSave.sourcePath.startsWith('local-file://')) {
      console.log('[BackgroundManager] 检测到 local-file:// 格式的 sourcePath，转换为原始路径:', configToSave.sourcePath);
      configToSave.sourcePath = this.convertFromLocalFileUrl(configToSave.sourcePath);
      console.log('[BackgroundManager] 转换后的 sourcePath:', configToSave.sourcePath);
    }
    
    this.config = { ...this.config, ...configToSave };
    await this.saveConfig();
  }

  /**
   * 获取当前可用的图片路径（优先使用缓存路径）
   */
  private getExistingImagePath(): string {
    try {
      // 先转换 imagePath（如果是 local-file:// 格式）
      let imagePath = this.config.imagePath;
      if (imagePath && imagePath.startsWith('local-file://')) {
        try {
          imagePath = this.convertFromLocalFileUrl(imagePath);
        } catch (e) {
          console.warn('[BackgroundManager] 转换 imagePath 失败:', e);
          imagePath = '';
        }
      }
      if (imagePath && imagePath.trim() !== '') {
        try {
          if (fs.existsSync(imagePath)) {
            return imagePath;
          }
        } catch (e) {
          console.warn('[BackgroundManager] 检查 imagePath 存在性失败:', imagePath, e);
        }
      }
      
      // 再检查 sourcePath（如果是 local-file:// 格式）
      let sourcePath = this.config.sourcePath;
      if (sourcePath && sourcePath.startsWith('local-file://')) {
        try {
          sourcePath = this.convertFromLocalFileUrl(sourcePath);
        } catch (e) {
          console.warn('[BackgroundManager] 转换 sourcePath 失败:', e);
          sourcePath = '';
        }
      }
      if (sourcePath && sourcePath.trim() !== '') {
        try {
          if (fs.existsSync(sourcePath)) {
            console.warn('[BackgroundManager] imagePath 不存在，回退到 sourcePath');
            return sourcePath;
          }
        } catch (e) {
          console.warn('[BackgroundManager] 检查 sourcePath 存在性失败:', sourcePath, e);
        }
      }
    } catch (error) {
      console.error('[BackgroundManager] getExistingImagePath 发生错误:', error);
    }
    return '';
  }

  /**
   * 启用背景
   */
  async enable(): Promise<void> {
    if (!this.config.imagePath) {
      throw new Error('No background image set');
    }
    this.config.enabled = true;
    await this.saveConfig();
  }

  /**
   * 禁用背景
   */
  async disable(): Promise<void> {
    this.config.enabled = false;
    await this.saveConfig();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理资源
    console.log('[BackgroundManager] Disposed');
  }
}
