/**
 * background-cover 扩展 API 实现
 * 文件功能：为 VSCode background-cover 扩展提供完整的 API 支持，包括背景图片设置、粒子效果等
 * 
 * 主要功能：
 * 1. 背景图片设置和管理
 * 2. 透明度和模糊度配置
 * 3. 粒子效果（nest）支持
 * 4. 配置持久化
 */

import { BrowserEventEmitter } from '../utils/browser-event-emitter';

/**
 * 背景图配置接口
 */
export interface BackgroundCoverConfig {
  /** 背景图片路径 */
  imagePath: string;
  /** 透明度 (0-0.8) */
  opacity: number;
  /** 模糊度 (0-100) */
  blur: number;
  /** 图片尺寸适应模式 */
  sizeModel: 'cover' | 'repeat' | 'contain' | 'not_center' | 'not_right_bottom' | 'not_right_top' | 'not_left' | 'not_right' | 'not_top' | 'not_bottom';
  /** 混合模式 */
  blendModel: 'auto' | 'multiply' | 'lighten';
  /** 随机图片文件夹路径 */
  randomImageFolder: string;
  /** 启动时自动更换背景 */
  autoStatus: boolean;
  /** 在线图库默认页面 */
  defaultOnlinePage: string;
}

/**
 * 粒子效果配置接口
 */
export interface ParticleConfig {
  /** 是否启用粒子效果 */
  enabled: boolean;
  /** 粒子数量 */
  count: number;
  /** 粒子颜色 */
  color: string;
  /** 粒子大小 */
  size: number;
  /** 鼠标交互范围 */
  range: number;
}

/**
 * background-cover API 管理类
 */
class BackgroundCoverManager {
  private static instance: BackgroundCoverManager;
  private eventEmitter: BrowserEventEmitter;
  private config: BackgroundCoverConfig;
  private particleConfig: ParticleConfig;
  private configPath: string;
  private styleElement: HTMLStyleElement | null = null;
  private particleCanvas: HTMLCanvasElement | null = null;
  
  private constructor() {
    this.eventEmitter = new BrowserEventEmitter();
    
    // 默认配置
    this.config = {
      imagePath: '',
      opacity: 0.2,
      blur: 0,
      sizeModel: 'cover',
      blendModel: 'auto',
      randomImageFolder: '',
      autoStatus: false,
      defaultOnlinePage: 'https://vs.20988.xyz/d/24-vscodebei-jing-tu-tu-ku'
    };
    
    this.particleConfig = {
      enabled: false,
      count: 50,
      color: '#ffffff',
      size: 2,
      range: 100
    };
    
    // 配置文件路径（使用 localStorage 代替文件系统）
    this.configPath = 'background-cover-config';
    
    // 加载配置
    this.loadConfig();
    
    // 临时禁用自动应用背景功能，避免遮挡编辑器
    // 清除配置并移除所有背景样式
    console.log('[BackgroundCover] 已禁用自动应用背景功能');
    
    // 清除配置
    this.config.imagePath = '';
    this.saveConfig();
    
    // 立即移除可能存在的背景样式
    this.removeBackground();
    
    // 再次确保移除（延迟执行）
    setTimeout(() => {
      this.removeBackground();
      console.log('[BackgroundCover] 已彻底移除背景样式');
    }, 100);
  }
  
  public static getInstance(): BackgroundCoverManager {
    if (!BackgroundCoverManager.instance) {
      BackgroundCoverManager.instance = new BackgroundCoverManager();
    }
    return BackgroundCoverManager.instance;
  }
  
  /**
   * 加载配置
   */
  private loadConfig(): void {
    try {
      const savedConfig = localStorage.getItem(this.configPath);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        this.config = { ...this.config, ...parsed.config };
        this.particleConfig = { ...this.particleConfig, ...parsed.particleConfig };
        console.log('[BackgroundCover] 配置已加载:', this.config);
      }
    } catch (error) {
      console.error('[BackgroundCover] 加载配置失败:', error);
    }
  }
  
  /**
   * 保存配置
   */
  private saveConfig(): void {
    try {
      const configData = {
        config: this.config,
        particleConfig: this.particleConfig
      };
      localStorage.setItem(this.configPath, JSON.stringify(configData));
      console.log('[BackgroundCover] 配置已保存');
      this.eventEmitter.emit('configChanged', this.config);
    } catch (error) {
      console.error('[BackgroundCover] 保存配置失败:', error);
    }
  }
  
  /**
   * 获取配置
   */
  public getConfig(key?: keyof BackgroundCoverConfig): any {
    if (key) {
      return this.config[key];
    }
    return { ...this.config };
  }
  
  /**
   * 更新配置
   */
  public updateConfig(key: keyof BackgroundCoverConfig, value: any): void {
    (this.config as any)[key] = value;
    this.saveConfig();
    this.applyBackground();
  }
  
  /**
   * 批量更新配置
   */
  public updateConfigs(configs: Partial<BackgroundCoverConfig>): void {
    this.config = { ...this.config, ...configs };
    this.saveConfig();
    this.applyBackground();
  }
  
  /**
   * 应用背景图片
   */
  public applyBackground(): void {
    try {
      console.log('[BackgroundCover] ========== 开始应用背景 ==========');
      console.log('[BackgroundCover] 当前配置:', JSON.stringify(this.config, null, 2));
      
      if (!this.config.imagePath) {
        console.log('[BackgroundCover] ❌ 没有图片路径，移除背景');
        this.removeBackground();
        return;
      }
      
      // 检查 document.head 是否存在
      if (!document.head) {
        console.error('[BackgroundCover] ❌ document.head 不存在！');
        return;
      }
      
      // 创建或更新样式元素
      if (!this.styleElement) {
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'background-cover-style';
        document.head.appendChild(this.styleElement);
        console.log('[BackgroundCover] ✅ 创建了新的 style 元素');
      } else {
        console.log('[BackgroundCover] ✅ 使用现有的 style 元素');
      }
      
      // 生成 CSS
      const css = this.generateBackgroundCSS();
      this.styleElement.textContent = css;
      
      console.log('[BackgroundCover] ✅ 背景已应用:', this.config.imagePath);
      console.log('[BackgroundCover] 生成的 CSS:');
      console.log(css);
      console.log('[BackgroundCover] ========== 背景应用完成 ==========');
      
      // 验证样式是否真的被添加到 DOM
      const styleInDom = document.getElementById('background-cover-style');
      console.log('[BackgroundCover] 验证 DOM 中的 style 元素:', styleInDom ? '存在' : '❌ 不存在');
      if (styleInDom) {
        console.log('[BackgroundCover] style 元素内容长度:', styleInDom.textContent?.length);
      }
      
      this.eventEmitter.emit('backgroundApplied', this.config);
    } catch (error) {
      console.error('[BackgroundCover] ❌ 应用背景失败:', error);
      console.error('[BackgroundCover] 错误堆栈:', error instanceof Error ? error.stack : 'No stack');
    }
  }
  
  /**
   * 生成背景 CSS
   */
  private generateBackgroundCSS(): string {
    const { imagePath, opacity, blur, sizeModel, blendModel } = this.config;
    
    console.log('[BackgroundCover] ---------- 生成背景 CSS ----------');
    console.log('[BackgroundCover] 配置参数:', { imagePath, opacity, blur, sizeModel, blendModel });
    
    // 处理图片路径
    // 支持：相对路径（./backgrounds/image.jpg）、HTTP URL、data URL、绝对路径
    let bgImage = imagePath;
    
    console.log('[BackgroundCover] 原始图片路径:', imagePath);
    console.log('[BackgroundCover] 路径类型检查:');
    console.log('  - 是否以 http 开头:', imagePath?.startsWith('http'));
    console.log('  - 是否以 data: 开头:', imagePath?.startsWith('data:'));
    
    // 如果是绝对路径（Windows: C:\ 或 D:\ 等，Unix/Mac: /），使用自定义协议
    if (imagePath && !imagePath.startsWith('http') && !imagePath.startsWith('data:')) {
      // 判断是否为绝对路径
      const isWindowsAbsolute = /^[a-zA-Z]:[\\\/]/.test(imagePath);
      const isUnixAbsolute = imagePath.startsWith('/');
      const isAbsolutePath = isWindowsAbsolute || isUnixAbsolute;
      
      console.log('  - 是否为 Windows 绝对路径:', isWindowsAbsolute);
      console.log('  - 是否为 Unix 绝对路径:', isUnixAbsolute);
      console.log('  - 判定为绝对路径:', isAbsolutePath);
      
      if (isAbsolutePath) {
        // 使用自定义协议 local-file://
        bgImage = `local-file://${imagePath}`;
        console.log('[BackgroundCover] ✅ 转换为自定义协议:', bgImage);
      } else {
        console.log('[BackgroundCover] ℹ️ 保持相对路径不变:', bgImage);
      }
    } else {
      console.log('[BackgroundCover] ℹ️ HTTP/data URL，不做转换');
    }
    
    // 生成背景样式
    let backgroundSize = 'cover';
    let backgroundPosition = 'center';
    let backgroundRepeat = 'no-repeat';
    
    switch (sizeModel) {
      case 'repeat':
        backgroundSize = 'auto';
        backgroundRepeat = 'repeat';
        break;
      case 'contain':
        backgroundSize = 'contain';
        break;
      case 'not_center':
        backgroundPosition = 'center';
        break;
      case 'not_right_bottom':
        backgroundPosition = 'right bottom';
        break;
      case 'not_right_top':
        backgroundPosition = 'right top';
        break;
      case 'not_left':
        backgroundPosition = 'left';
        break;
      case 'not_right':
        backgroundPosition = 'right';
        break;
      case 'not_top':
        backgroundPosition = 'top';
        break;
      case 'not_bottom':
        backgroundPosition = 'bottom';
        break;
    }
    
    // 混合模式
    let mixBlendMode = 'normal';
    if (blendModel === 'multiply') {
      mixBlendMode = 'multiply';
    } else if (blendModel === 'lighten') {
      mixBlendMode = 'lighten';
    }
    
    // 使用 body::before 确保背景在所有内容之下
    // 同时使用 !important 确保样式优先级
    return `
      body {
        position: relative !important;
      }
      
      body::before {
        content: '' !important;
        display: block !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-image: url('${bgImage}') !important;
        background-size: ${backgroundSize} !important;
        background-position: ${backgroundPosition} !important;
        background-repeat: ${backgroundRepeat} !important;
        background-color: transparent !important;
        opacity: ${opacity} !important;
        filter: blur(${blur}px) !important;
        mix-blend-mode: ${mixBlendMode} !important;
        z-index: -9999 !important;
        pointer-events: none !important;
      }
      
      body > #root,
      body > div#root,
      #root {
        position: relative !important;
        z-index: 1 !important;
      }
      
      /* 确保主内容区始终在背景之上 */
      .main-layout,
      .main-content,
      .editor-area,
      .sidebar,
      .activity-bar,
      .status-bar,
      .title-bar {
        position: relative !important;
        z-index: auto !important;
      }
    `;
  }
  
  /**
   * 移除背景
   */
  public removeBackground(): void {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
      console.log('[BackgroundCover] 背景已移除');
    }
  }
  
  /**
   * 设置背景图片
   */
  public setImagePath(path: string): void {
    console.log('[BackgroundCover] 设置背景图片路径:', path);
    this.updateConfig('imagePath', path);
  }
  
  /**
   * 设置透明度
   */
  public setOpacity(opacity: number): void {
    const clampedOpacity = Math.max(0, Math.min(0.8, opacity));
    this.updateConfig('opacity', clampedOpacity);
  }
  
  /**
   * 设置模糊度
   */
  public setBlur(blur: number): void {
    const clampedBlur = Math.max(0, Math.min(100, blur));
    this.updateConfig('blur', clampedBlur);
  }
  
  /**
   * 从文件夹随机选择背景
   */
  public randomUpdateBackground(): void {
    const folder = this.config.randomImageFolder;
    if (!folder) {
      console.warn('[BackgroundCover] 未设置随机图片文件夹');
      return;
    }
    
    // 在浏览器环境中无法直接访问文件系统
    // 这里需要通过 IPC 或其他方式与主进程通信
    console.log('[BackgroundCover] 随机更新背景（需要主进程支持）');
    this.eventEmitter.emit('randomBackgroundRequested', folder);
  }
  
  /**
   * 粒子效果管理
   */
  public getParticleConfig(): ParticleConfig {
    return { ...this.particleConfig };
  }
  
  public updateParticleConfig(config: Partial<ParticleConfig>): void {
    this.particleConfig = { ...this.particleConfig, ...config };
    this.saveConfig();
    
    if (this.particleConfig.enabled) {
      this.startParticleEffect();
    } else {
      this.stopParticleEffect();
    }
  }
  
  /**
   * 启动粒子效果
   */
  public startParticleEffect(): void {
    if (this.particleCanvas) {
      return;
    }
    
    // 创建 canvas
    this.particleCanvas = document.createElement('canvas');
    this.particleCanvas.id = 'background-cover-particles';
    this.particleCanvas.style.position = 'fixed';
    this.particleCanvas.style.top = '0';
    this.particleCanvas.style.left = '0';
    this.particleCanvas.style.width = '100%';
    this.particleCanvas.style.height = '100%';
    this.particleCanvas.style.pointerEvents = 'none';
    this.particleCanvas.style.zIndex = '9999';
    document.body.appendChild(this.particleCanvas);
    
    // 初始化粒子系统
    this.initParticles();
    
    console.log('[BackgroundCover] 粒子效果已启动');
  }
  
  /**
   * 停止粒子效果
   */
  public stopParticleEffect(): void {
    if (this.particleCanvas) {
      this.particleCanvas.remove();
      this.particleCanvas = null;
      console.log('[BackgroundCover] 粒子效果已停止');
    }
  }
  
  /**
   * 初始化粒子系统
   */
  private initParticles(): void {
    if (!this.particleCanvas) return;
    
    const canvas = this.particleCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置 canvas 尺寸
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
    }> = [];
    
    // 创建粒子
    for (let i = 0; i < this.particleConfig.count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: this.particleConfig.size
      });
    }
    
    let mouseX = -1000;
    let mouseY = -1000;
    
    // 鼠标移动事件
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    document.addEventListener('mousemove', handleMouseMove);
    
    // 动画循环
    const animate = () => {
      if (!this.particleCanvas) {
        document.removeEventListener('mousemove', handleMouseMove);
        return;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 更新和绘制粒子
      particles.forEach(particle => {
        // 更新位置
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // 边界检测
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
        
        // 鼠标交互
        const dx = mouseX - particle.x;
        const dy = mouseY - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < this.particleConfig.range) {
          const force = (this.particleConfig.range - distance) / this.particleConfig.range;
          particle.vx -= dx / distance * force * 0.5;
          particle.vy -= dy / distance * force * 0.5;
        }
        
        // 绘制粒子
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = this.particleConfig.color;
        ctx.fill();
      });
      
      requestAnimationFrame(animate);
    };
    
    animate();
  }
  
  /**
   * 监听配置变化
   */
  public onConfigChanged(callback: (config: BackgroundCoverConfig) => void): { dispose: () => void } {
    this.eventEmitter.on('configChanged', callback);
    return {
      dispose: () => {
        this.eventEmitter.off('configChanged', callback);
      }
    };
  }
  
  /**
   * 监听背景应用事件
   */
  public onBackgroundApplied(callback: (config: BackgroundCoverConfig) => void): { dispose: () => void } {
    this.eventEmitter.on('backgroundApplied', callback);
    return {
      dispose: () => {
        this.eventEmitter.off('backgroundApplied', callback);
      }
    };
  }
}

/**
 * 导出单例实例
 */
export const backgroundCoverManager = BackgroundCoverManager.getInstance();

/**
 * 导出便捷方法
 */
export const backgroundCover = {
  /**
   * 获取配置
   */
  getConfig: (key?: keyof BackgroundCoverConfig) => backgroundCoverManager.getConfig(key),
  
  /**
   * 更新配置
   */
  updateConfig: (key: keyof BackgroundCoverConfig, value: any) => backgroundCoverManager.updateConfig(key, value),
  
  /**
   * 批量更新配置
   */
  updateConfigs: (configs: Partial<BackgroundCoverConfig>) => backgroundCoverManager.updateConfigs(configs),
  
  /**
   * 应用背景
   */
  applyBackground: () => backgroundCoverManager.applyBackground(),
  
  /**
   * 移除背景
   */
  removeBackground: () => backgroundCoverManager.removeBackground(),
  
  /**
   * 设置背景图片路径
   */
  setImagePath: (path: string) => backgroundCoverManager.setImagePath(path),
  
  /**
   * 设置透明度
   */
  setOpacity: (opacity: number) => backgroundCoverManager.setOpacity(opacity),
  
  /**
   * 设置模糊度
   */
  setBlur: (blur: number) => backgroundCoverManager.setBlur(blur),
  
  /**
   * 随机更新背景
   */
  randomUpdateBackground: () => backgroundCoverManager.randomUpdateBackground(),
  
  /**
   * 获取粒子效果配置
   */
  getParticleConfig: () => backgroundCoverManager.getParticleConfig(),
  
  /**
   * 更新粒子效果配置
   */
  updateParticleConfig: (config: Partial<ParticleConfig>) => backgroundCoverManager.updateParticleConfig(config),
  
  /**
   * 启动粒子效果
   */
  startParticleEffect: () => backgroundCoverManager.startParticleEffect(),
  
  /**
   * 停止粒子效果
   */
  stopParticleEffect: () => backgroundCoverManager.stopParticleEffect(),
  
  /**
   * 监听配置变化
   */
  onConfigChanged: (callback: (config: BackgroundCoverConfig) => void) => backgroundCoverManager.onConfigChanged(callback),
  
  /**
   * 监听背景应用事件
   */
  onBackgroundApplied: (callback: (config: BackgroundCoverConfig) => void) => backgroundCoverManager.onBackgroundApplied(callback)
};

