/**
 * 设置管理器
 * 负责管理用户设置的读取、写入和监听
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';

export interface SettingsSchema {
  // 编辑器设置
  'editor.fontSize': number;
  'editor.fontFamily': string;
  'editor.lineHeight': number;
  'editor.tabSize': number;
  'editor.insertSpaces': boolean;
  'editor.wordWrap': 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  'editor.minimap.enabled': boolean;
  'editor.lineNumbers': 'on' | 'off' | 'relative';
  'editor.renderWhitespace': 'none' | 'boundary' | 'selection' | 'all';
  'editor.cursorBlinking': 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  'editor.cursorStyle': 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
  
  // 文件设置
  'files.autoSave': 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
  'files.autoSaveDelay': number;
  'files.encoding': string;
  'files.eol': '\n' | '\r\n' | 'auto';
  
  // 工作区设置
  'workbench.colorTheme': string;
  'workbench.iconTheme': string;
  'workbench.sideBar.location': 'left' | 'right';
  'workbench.activityBar.visible': boolean;
  'workbench.statusBar.visible': boolean;
  
  // 窗口设置
  'window.zoomLevel': number;
  'window.title': string;
  'window.menuBarVisibility': 'default' | 'visible' | 'toggle' | 'hidden';
  
  // 终端设置
  'terminal.integrated.fontSize': number;
  'terminal.integrated.fontFamily': string;
  'terminal.integrated.shell.windows': string;
  'terminal.integrated.shell.linux': string;
  'terminal.integrated.shell.osx': string;
  
  // 搜索设置
  'search.exclude': Record<string, boolean>;
  'search.useIgnoreFiles': boolean;
  'search.followSymlinks': boolean;
  
  // AI 模型设置
  'ai.models': AIModelConfig[];
  'ai.defaultModel': string;
}

// 聊天模型接口
export interface ChatModel {
  name: string;
  displayName?: string;
}

// AI 模型配置接口
export interface AIModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  chatModels?: ChatModel[];  // 可选的聊天模型列表
  
  // 🧠 模型参数（核心）
  parameters?: {
    temperature?: number;        // 0-2，创造性，0=确定，2=随机
    maxTokens?: number;          // 1-128000，最大输出长度
    topP?: number;               // 0-1，核采样，控制词汇多样性
    frequencyPenalty?: number;   // -2 到 2，频率惩罚，减少重复内容
    presencePenalty?: number;    // -2 到 2，鼓励新话题
  };
  
  // ⚙️ 高级配置（可选）
  advanced?: {
    timeout?: number;            // 请求超时（毫秒）
    maxRetries?: number;         // 重试次数
    stream?: boolean;            // 流式传输
    proxy?: string;              // 代理设置
    costControl?: {
      maxCostPerRequest?: number;  // 单次请求最大成本（美元）
      dailyLimit?: number;         // 每日成本限制（美元）
    };
  };
}

export type SettingsValue = SettingsSchema[keyof SettingsSchema];

/**
 * 默认设置
 */
const DEFAULT_SETTINGS: SettingsSchema = {
  // 编辑器
  'editor.fontSize': 14,
  'editor.fontFamily': 'Consolas, "Courier New", monospace',
  'editor.lineHeight': 1.5,
  'editor.tabSize': 4,
  'editor.insertSpaces': true,
  'editor.wordWrap': 'off',
  'editor.minimap.enabled': true,
  'editor.lineNumbers': 'on',
  'editor.renderWhitespace': 'selection',
  'editor.cursorBlinking': 'blink',
  'editor.cursorStyle': 'line',
  
  // 文件
  'files.autoSave': 'afterDelay',
  'files.autoSaveDelay': 1000,
  'files.encoding': 'utf8',
  'files.eol': 'auto',
  
  // 工作区
  'workbench.colorTheme': 'One Dark Pro',
  'workbench.iconTheme': 'vs-seti',
  'workbench.sideBar.location': 'left',
  'workbench.activityBar.visible': true,
  'workbench.statusBar.visible': true,
  
  // 窗口
  'window.zoomLevel': 0,
  'window.title': '${activeEditorShort}${separator}${rootName}',
  'window.menuBarVisibility': 'default',
  
  // 终端
  'terminal.integrated.fontSize': 14,
  'terminal.integrated.fontFamily': 'Consolas, "Courier New", monospace',
  'terminal.integrated.shell.windows': 'powershell.exe',
  'terminal.integrated.shell.linux': '/bin/bash',
  'terminal.integrated.shell.osx': '/bin/zsh',
  
  // 搜索
  'search.exclude': {
    '**/node_modules': true,
    '**/dist': true,
    '**/out': true,
    '**/.git': true,
  },
  'search.useIgnoreFiles': true,
  'search.followSymlinks': true,
  
  // AI 模型
  'ai.models': [
    {
      id: 'openai-gpt4',
      name: 'OpenAI GPT-4',
      provider: 'openai',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseUrl: 'https://api.gptsapi.net/v1',
      model: 'gpt-4',
      enabled: true,
      chatModels: [
        { name: 'gpt-4', displayName: 'GPT-4' },
        { name: 'gpt-4-turbo', displayName: 'GPT-4 Turbo' },
        { name: 'gpt-4o', displayName: 'GPT-4o' },
      ],
      parameters: {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 60000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 1.0,
          dailyLimit: 10.0,
        },
      },
    },
    {
      id: 'openai-gpt35',
      name: 'OpenAI GPT-3.5',
      provider: 'openai',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseUrl: 'https://api.gptsapi.net/v1',
      model: 'gpt-3.5-turbo',
      enabled: true,
      chatModels: [
        { name: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo' },
        { name: 'gpt-3.5-turbo-16k', displayName: 'GPT-3.5 Turbo 16K' },
      ],
      parameters: {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.5,
          dailyLimit: 5.0,
        },
      },
    },
    {
      id: 'anthropic-claude',
      name: 'Anthropic Claude',
      provider: 'anthropic',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseUrl: 'https://api.gptsapi.net/v1',
      model: 'claude-3-opus-20240229',
      enabled: true,
      chatModels: [
        { name: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus' },
        { name: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet' },
        { name: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku' },
      ],
      parameters: {
        temperature: 1,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 60000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 1.5,
          dailyLimit: 15.0,
        },
      },
    },
    {
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'deepseek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      enabled: false,
      parameters: {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.3,
          dailyLimit: 3.0,
        },
      },
    },
    {
      id: 'deepseek-coder',
      name: 'DeepSeek Coder',
      provider: 'deepseek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-coder',
      enabled: false,
      parameters: {
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.3,
          dailyLimit: 3.0,
        },
      },
    },
    {
      id: 'gemini-pro',
      name: 'Google Gemini Pro',
      provider: 'gemini',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-pro',
      enabled: false,
      parameters: {
        temperature: 0.9,
        maxTokens: 8192,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.5,
          dailyLimit: 5.0,
        },
      },
    },
    {
      id: 'gemini-pro-vision',
      name: 'Google Gemini Pro Vision',
      provider: 'gemini',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-pro-vision',
      enabled: false,
      parameters: {
        temperature: 0.4,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 60000,
        maxRetries: 3,
        stream: false,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.8,
          dailyLimit: 8.0,
        },
      },
    },
    {
      id: 'groq-llama3',
      name: 'Groq Llama 3',
      provider: 'groq',
      apiKey: '',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama3-70b-8192',
      enabled: false,
      parameters: {
        temperature: 0.7,
        maxTokens: 8192,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.2,
          dailyLimit: 2.0,
        },
      },
    },
    {
      id: 'groq-mixtral',
      name: 'Groq Mixtral',
      provider: 'groq',
      apiKey: '',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'mixtral-8x7b-32768',
      enabled: false,
      parameters: {
        temperature: 0.7,
        maxTokens: 32768,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.3,
          dailyLimit: 3.0,
        },
      },
    },
    {
      id: 'xai-grok',
      name: 'xAI Grok',
      provider: 'xai',
      apiKey: '',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-beta',
      enabled: false,
      parameters: {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 0.5,
          dailyLimit: 5.0,
        },
      },
    },
    {
      id: 'custom',
      name: 'Custom Model',
      provider: 'custom',
      apiKey: '',
      baseUrl: '',
      model: '',
      enabled: false,
      parameters: {
        temperature: 0.7,
        maxTokens: 4096,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
      advanced: {
        timeout: 30000,
        maxRetries: 3,
        stream: true,
        proxy: '',
        costControl: {
          maxCostPerRequest: 1.0,
          dailyLimit: 10.0,
        },
      },
    },
  ],
  'ai.defaultModel': 'openai-gpt4',
};

export class SettingsManager extends EventEmitter {
  private settings: Partial<SettingsSchema> = {};
  private settingsPath: string;
  private userSettingsPath: string;
  private workspaceSettingsPath: string | null = null;

  constructor() {
    super();
    
    // 用户设置路径
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, 'User');
    this.userSettingsPath = path.join(this.settingsPath, 'settings.json');
  }

  /**
   * 初始化设置管理器
   */
  async initialize(): Promise<void> {
    try {
      // 确保设置目录存在
      await fs.mkdir(this.settingsPath, { recursive: true });
      
      // 加载用户设置
      await this.loadSettings();
      
      console.log('[SettingsManager] 设置管理器初始化成功');
    } catch (error) {
      console.error('[SettingsManager] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载设置
   */
  private async loadSettings(): Promise<void> {
    try {
      // 加载用户设置
      const userSettings = await this.loadUserSettings();
      
      // 加载工作区设置（如果存在）
      const workspaceSettings = await this.loadWorkspaceSettings();
      
      // 合并设置（工作区设置优先级更高）
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...userSettings,
        ...workspaceSettings,
      };
      
      console.log('[SettingsManager] 设置加载成功');
    } catch (error) {
      console.error('[SettingsManager] 加载设置失败:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * 加载用户设置
   */
  private async loadUserSettings(): Promise<Partial<SettingsSchema>> {
    try {
      const content = await fs.readFile(this.userSettingsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // 文件不存在时返回空对象
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * 加载工作区设置
   */
  private async loadWorkspaceSettings(): Promise<Partial<SettingsSchema>> {
    if (!this.workspaceSettingsPath) {
      return {};
    }

    try {
      const content = await fs.readFile(this.workspaceSettingsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * 设置工作区路径
   */
  setWorkspacePath(workspacePath: string): void {
    this.workspaceSettingsPath = path.join(workspacePath, '.vscode', 'settings.json');
    this.loadSettings(); // 重新加载设置
  }

  /**
   * 获取设置值
   */
  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    return (this.settings[key] ?? DEFAULT_SETTINGS[key]) as SettingsSchema[K];
  }

  /**
   * 获取所有设置
   */
  getAll(): Partial<SettingsSchema> {
    return { ...this.settings };
  }

  /**
   * 获取所有设置（包括默认值）
   */
  getAllWithDefaults(): SettingsSchema {
    return {
      ...DEFAULT_SETTINGS,
      ...this.settings,
    };
  }

  /**
   * 更新设置
   */
  async update<K extends keyof SettingsSchema>(
    key: K,
    value: SettingsSchema[K],
    target: 'user' | 'workspace' = 'user'
  ): Promise<void> {
    try {
      // 更新内存中的设置
      this.settings[key] = value;

      // 保存到文件
      if (target === 'user') {
        await this.saveUserSettings();
      } else if (target === 'workspace' && this.workspaceSettingsPath) {
        await this.saveWorkspaceSettings();
      }

      // 触发变更事件
      this.emit('change', key, value);
      
      console.log(`[SettingsManager] 设置已更新: ${key} = ${value}`);
    } catch (error) {
      console.error('[SettingsManager] 更新设置失败:', error);
      throw error;
    }
  }

  /**
   * 批量更新设置
   */
  async updateMany(
    updates: Partial<SettingsSchema>,
    target: 'user' | 'workspace' = 'user'
  ): Promise<void> {
    try {
      // 更新内存中的设置
      Object.assign(this.settings, updates);

      // 保存到文件
      if (target === 'user') {
        await this.saveUserSettings();
      } else if (target === 'workspace' && this.workspaceSettingsPath) {
        await this.saveWorkspaceSettings();
      }

      // 触发变更事件
      for (const [key, value] of Object.entries(updates)) {
        this.emit('change', key, value);
      }
      
      console.log('[SettingsManager] 批量更新设置成功');
    } catch (error) {
      console.error('[SettingsManager] 批量更新设置失败:', error);
      throw error;
    }
  }

  /**
   * 重置设置为默认值
   */
  async reset(key?: keyof SettingsSchema): Promise<void> {
    try {
      if (key) {
        // 重置单个设置
        this.settings[key] = DEFAULT_SETTINGS[key] as any;
      } else {
        // 重置所有设置
        this.settings = { ...DEFAULT_SETTINGS };
      }

      await this.saveUserSettings();
      this.emit('reset', key);
      
      console.log('[SettingsManager] 设置已重置');
    } catch (error) {
      console.error('[SettingsManager] 重置设置失败:', error);
      throw error;
    }
  }

  /**
   * 保存用户设置
   */
  private async saveUserSettings(): Promise<void> {
    const content = JSON.stringify(this.settings, null, 2);
    await fs.writeFile(this.userSettingsPath, content, 'utf-8');
  }

  /**
   * 保存工作区设置
   */
  private async saveWorkspaceSettings(): Promise<void> {
    if (!this.workspaceSettingsPath) {
      throw new Error('工作区路径未设置');
    }

    // 确保 .vscode 目录存在
    const vscodeDir = path.dirname(this.workspaceSettingsPath);
    await fs.mkdir(vscodeDir, { recursive: true });

    const content = JSON.stringify(this.settings, null, 2);
    await fs.writeFile(this.workspaceSettingsPath, content, 'utf-8');
  }

  /**
   * 获取设置文件路径
   */
  getSettingsPath(target: 'user' | 'workspace' = 'user'): string {
    if (target === 'workspace' && this.workspaceSettingsPath) {
      return this.workspaceSettingsPath;
    }
    return this.userSettingsPath;
  }

  /**
   * 获取默认设置
   */
  getDefaults(): SettingsSchema {
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * 导入设置
   */
  async importSettings(settingsJson: string, target: 'user' | 'workspace' = 'user'): Promise<void> {
    try {
      const imported = JSON.parse(settingsJson);
      await this.updateMany(imported, target);
      console.log('[SettingsManager] 设置导入成功');
    } catch (error) {
      console.error('[SettingsManager] 导入设置失败:', error);
      throw error;
    }
  }

  /**
   * 导出设置
   */
  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }
}
