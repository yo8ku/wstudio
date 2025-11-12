/**
 * 背景图片设置面板
 * 提供可视化的设置界面
 */

import type { PluginAPI } from './plugin-api';
import type { BackgroundManager } from './BackgroundManager';

export class SettingsPanel {
  private api: PluginAPI;
  private manager: BackgroundManager;
  private panelElement: HTMLDivElement | null = null;

  constructor(api: PluginAPI, manager: BackgroundManager) {
    this.api = api;
    this.manager = manager;
  }

  /**
   * 显示设置面板
   */
  show(): void {
    if (this.panelElement) {
      this.panelElement.style.display = 'block';
      return;
    }

    this.createPanel();
  }

  /**
   * 隐藏设置面板
   */
  hide(): void {
    if (this.panelElement) {
      this.panelElement.style.display = 'none';
    }
  }

  /**
   * 创建设置面板
   */
  private createPanel(): void {
    const config = this.manager.getConfig();

    // 创建面板容器
    this.panelElement = document.createElement('div');
    this.panelElement.id = 'background-image-settings-panel';
    
    // 从主题获取颜色变量 - 确保完全不透明，避免背景模糊影响文字可读性
    const styles = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 500px;
      max-height: 600px;
      background: var(--ws-editor-background, #1e1e1e);
      border: 1px solid var(--ws-panel-border, #454545);
      border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      z-index: 10000;
      overflow: auto;
      font-family: var(--ws-font-family, 'Segoe UI', sans-serif);
      font-size: var(--ws-font-size, 13px);
      color: var(--ws-foreground, #cccccc);
      opacity: 1;
    `;
    
    this.panelElement.style.cssText = styles;

    // 面板内容
    this.panelElement.innerHTML = `
      <div style="padding: 20px;">
        <!-- 标题栏 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--ws-foreground);">
            背景图片设置
          </h2>
          <button id="bg-close-btn" style="
            background: transparent;
            border: none;
            color: var(--ws-foreground);
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            line-height: 1;
          ">×</button>
        </div>

        <!-- 图片选择 -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            背景图片路径
          </label>
          <div style="display: flex; gap: 8px;">
            <input 
              id="bg-image-path" 
              type="text" 
              value="${config.imagePath}" 
              placeholder="输入图片路径或URL"
              style="
                flex: 1;
                padding: 6px 10px;
                background: var(--ws-input-background, #3c3c3c);
                border: 1px solid var(--ws-input-border, #3c3c3c);
                border-radius: 3px;
                color: var(--ws-input-foreground, #cccccc);
                font-family: inherit;
                font-size: inherit;
                outline: none;
              "
            />
            <button id="bg-browse-btn" style="
              padding: 6px 12px;
              background: var(--ws-button-background, #0e639c);
              border: none;
              border-radius: 3px;
              color: var(--ws-button-foreground, #ffffff);
              cursor: pointer;
              font-family: inherit;
              font-size: inherit;
            ">浏览</button>
          </div>
        </div>

        <!-- 透明度 -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            透明度: <span id="bg-opacity-value">${config.opacity}</span>
          </label>
          <input 
            id="bg-opacity" 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value="${config.opacity}"
            style="
              width: 100%;
              accent-color: var(--ws-focus-border, #007acc);
            "
          />
        </div>

        <!-- 模糊度 -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            模糊度: <span id="bg-blur-value">${config.blur}px</span>
          </label>
          <input 
            id="bg-blur" 
            type="range" 
            min="0" 
            max="20" 
            step="1" 
            value="${config.blur}"
            style="
              width: 100%;
              accent-color: var(--ws-focus-border, #007acc);
            "
          />
        </div>

        <!-- 缩放模式 -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">
            缩放模式
          </label>
          <select id="bg-fit" style="
            width: 100%;
            padding: 6px 10px;
            background: var(--ws-dropdown-background, #3c3c3c);
            border: 1px solid var(--ws-dropdown-border, #3c3c3c);
            border-radius: 3px;
            color: var(--ws-dropdown-foreground, #cccccc);
            font-family: inherit;
            font-size: inherit;
            outline: none;
          ">
            <option value="cover" ${config.fit === 'cover' ? 'selected' : ''}>覆盖 (Cover)</option>
            <option value="contain" ${config.fit === 'contain' ? 'selected' : ''}>包含 (Contain)</option>
            <option value="fill" ${config.fit === 'fill' ? 'selected' : ''}>填充 (Fill)</option>
            <option value="none" ${config.fit === 'none' ? 'selected' : ''}>原始大小 (None)</option>
          </select>
        </div>

        <!-- 启用开关 -->
        <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
          <input 
            id="bg-enabled" 
            type="checkbox" 
            ${config.enabled ? 'checked' : ''}
            style="
              width: 16px;
              height: 16px;
              cursor: pointer;
              accent-color: var(--ws-focus-border, #007acc);
            "
          />
          <label for="bg-enabled" style="cursor: pointer; font-weight: 500;">
            启用背景图片
          </label>
        </div>

        <!-- 按钮组 -->
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="bg-reset-btn" style="
            padding: 8px 16px;
            background: var(--ws-button-secondaryBackground, #3a3d41);
            border: none;
            border-radius: 3px;
            color: var(--ws-button-secondaryForeground, #cccccc);
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
          ">重置</button>
          <button id="bg-apply-btn" style="
            padding: 8px 16px;
            background: var(--ws-button-background, #0e639c);
            border: none;
            border-radius: 3px;
            color: var(--ws-button-foreground, #ffffff);
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
          ">应用</button>
        </div>
      </div>
    `;

    // 添加到body
    document.body.appendChild(this.panelElement);

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.panelElement) return;

    // 关闭按钮
    const closeBtn = this.panelElement.querySelector('#bg-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    // 浏览按钮
    const browseBtn = this.panelElement.querySelector('#bg-browse-btn');
    browseBtn?.addEventListener('click', () => this.browseImage());

    // 透明度滑块
    const opacitySlider = this.panelElement.querySelector('#bg-opacity') as HTMLInputElement;
    const opacityValue = this.panelElement.querySelector('#bg-opacity-value');
    opacitySlider?.addEventListener('input', () => {
      if (opacityValue) {
        opacityValue.textContent = opacitySlider.value;
      }
    });

    // 模糊度滑块
    const blurSlider = this.panelElement.querySelector('#bg-blur') as HTMLInputElement;
    const blurValue = this.panelElement.querySelector('#bg-blur-value');
    blurSlider?.addEventListener('input', () => {
      if (blurValue) {
        blurValue.textContent = `${blurSlider.value}px`;
      }
    });

    // 应用按钮
    const applyBtn = this.panelElement.querySelector('#bg-apply-btn');
    applyBtn?.addEventListener('click', () => this.applySettings());

    // 重置按钮
    const resetBtn = this.panelElement.querySelector('#bg-reset-btn');
    resetBtn?.addEventListener('click', () => this.resetSettings());

    // ESC键关闭
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * 浏览图片
   */
  private async browseImage(): Promise<void> {
    try {
      // 使用文件系统API选择图片
      const result = await this.api.fs.showOpenDialog({
        filters: [
          { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
        ],
        properties: ['openFile']
      });

      if (result && result.length > 0) {
        const pathInput = this.panelElement?.querySelector('#bg-image-path') as HTMLInputElement;
        if (pathInput) {
          pathInput.value = result[0];
        }
      }
    } catch (error) {
      console.error('Failed to browse image:', error);
      this.api.window.showErrorMessage('选择图片失败');
    }
  }

  /**
   * 应用设置
   */
  private async applySettings(): Promise<void> {
    if (!this.panelElement) return;

    const imagePath = (this.panelElement.querySelector('#bg-image-path') as HTMLInputElement).value;
    const opacity = parseFloat((this.panelElement.querySelector('#bg-opacity') as HTMLInputElement).value);
    const blur = parseInt((this.panelElement.querySelector('#bg-blur') as HTMLInputElement).value);
    const fit = (this.panelElement.querySelector('#bg-fit') as HTMLSelectElement).value as any;
    const enabled = (this.panelElement.querySelector('#bg-enabled') as HTMLInputElement).checked;

    await this.manager.updateConfig({
      imagePath,
      opacity,
      blur,
      fit,
      enabled
    });

    this.api.window.showInformationMessage('背景图片设置已应用');
    this.hide();
  }

  /**
   * 重置设置
   */
  private resetSettings(): void {
    if (!this.panelElement) return;

    const config = this.manager.getConfig();

    (this.panelElement.querySelector('#bg-image-path') as HTMLInputElement).value = config.imagePath;
    (this.panelElement.querySelector('#bg-opacity') as HTMLInputElement).value = config.opacity.toString();
    (this.panelElement.querySelector('#bg-blur') as HTMLInputElement).value = config.blur.toString();
    (this.panelElement.querySelector('#bg-fit') as HTMLSelectElement).value = config.fit;
    (this.panelElement.querySelector('#bg-enabled') as HTMLInputElement).checked = config.enabled;

    const opacityValue = this.panelElement.querySelector('#bg-opacity-value');
    if (opacityValue) opacityValue.textContent = config.opacity.toString();

    const blurValue = this.panelElement.querySelector('#bg-blur-value');
    if (blurValue) blurValue.textContent = `${config.blur}px`;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }
  }
}

