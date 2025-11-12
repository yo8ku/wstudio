/**
 * 设置管理器
 * 负责管理用户设置的读取、写入和监听
 * 支持 JSONC 格式（JSON with Comments）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import * as jsonc from 'jsonc-parser';

export interface SettingsSchema {
  // 文件设置
  'files.autoSave': 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
  'files.autoSaveDelay': number;
  'files.encoding': string;
  'files.eol': '\n' | '\r\n' | 'auto';
  
  // 工作区设置
  'workbench.colorTheme': string;
  'workbench.iconTheme'?: string ;
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
  // 文件
  'files.autoSave': 'afterDelay',
  'files.autoSaveDelay': 1000,
  'files.encoding': 'utf8',
  'files.eol': 'auto',
  
  // 工作区
  'workbench.colorTheme': 'One Dark Pro'

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
      console.log('[SettingsManager] 开始初始化设置管理器...');
      
      // 确保设置目录存在
      await fs.mkdir(this.settingsPath, { recursive: true });
      console.log('[SettingsManager] 设置目录已创建:', this.settingsPath);
      
      // 检查配置文件是否存在，不存在则创建默认配置
      await this.ensureSettingsFile();
      
      // 加载用户设置
      await this.loadSettings();
      
      console.log('[SettingsManager] 设置管理器初始化成功 ');
    } catch (error) {
      console.error('[SettingsManager] 初始化失败:', error);
      // 即使初始化失败，也要确保有默认设置可用
      this.settings = { ...DEFAULT_SETTINGS };
      console.log('[SettingsManager] 已回退到默认设置');
    }
  }

  /**
   * 确保设置文件存在，如果不存在则创建默认配置文件
   * 这是应用首次启动时写入完整配置的关键方法
   * 创建的文件支持 JSONC 格式（带注释）
   */
  private async ensureSettingsFile(): Promise<void> {
    try {
      // 检查文件是否存在
      await fs.access(this.userSettingsPath);
      console.log('[SettingsManager] 配置文件已存在');
    } catch (error) {
      // 文件不存在，创建默认配置
      console.log('[SettingsManager] 配置文件不存在，创建默认配置...');
      try {
        // 创建带注释的 JSONC 格式配置文件
        const defaultContent = this.generateDefaultSettingsWithComments();
        await fs.writeFile(this.userSettingsPath, defaultContent, 'utf-8');
        console.log('[SettingsManager]  已成功写入默认配置文件（JSONC 格式）');
        console.log('[SettingsManager] 配置文件路径:', this.userSettingsPath);
      } catch (writeError) {
        console.error('[SettingsManager]  写入默认配置失败:', writeError);
        throw writeError;
      }
    }
  }

  /**
   * 生成带注释的默认配置内容
   */
  private generateDefaultSettingsWithComments(): string {
    return `{
 
  // ==================== 文件设置 ====================
  
  // 自动保存：off, afterDelay, onFocusChange, onWindowChange
  "files.autoSave": "${DEFAULT_SETTINGS['files.autoSave']}",
  
  // 自动保存延迟（毫秒）
  "files.autoSaveDelay": ${DEFAULT_SETTINGS['files.autoSaveDelay']},
  
  // 文件编码
  "files.encoding": "${DEFAULT_SETTINGS['files.encoding']}",
  
  // 换行符：\\n, \\r\\n, auto
  "files.eol": "${DEFAULT_SETTINGS['files.eol']}",

  // ==================== 工作区设置 ====================
  
  // 颜色主题
  "workbench.colorTheme": "${DEFAULT_SETTINGS['workbench.colorTheme']}"
}
`;
  }

  /**
   * 加载设置
   * 安全机制：如果加载失败，自动回退到默认设置
   */
  private async loadSettings(): Promise<void> {
    try {
      console.log('[SettingsManager] ========== 开始加载设置 ==========');
      console.log('[SettingsManager] userSettingsPath:', this.userSettingsPath);
      console.log('[SettingsManager] workspaceSettingsPath:', this.workspaceSettingsPath);
      
      // 加载用户设置（带自动恢复机制）
      const userSettings = await this.loadUserSettings();
      console.log('[SettingsManager] 用户设置:', userSettings);
      
      // 加载工作区设置（如果存在）
      const workspaceSettings = await this.loadWorkspaceSettings();
      console.log('[SettingsManager] 工作区设置:', workspaceSettings);
      
      // 合并设置（工作区设置优先级更高）
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...userSettings,
        ...workspaceSettings,
      };
      
      // 过滤掉所有无效的键（防止内存中残留重复配置）
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(this.settings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = this.settings[key as keyof SettingsSchema] as any;
        }
      }
      this.settings = validSettings;
      
      console.log('[SettingsManager] 合并后的设置:', this.settings);
      console.log('[SettingsManager] 设置加载成功 ');
    } catch (error) {
      console.error('[SettingsManager]  加载设置失败，回退到默认设置:', error);
      // 安全机制：回退到默认设置
      this.settings = { ...DEFAULT_SETTINGS };
      // 尝试恢复配置文件
      await this.recoverSettingsFile();
    }
  }

  /**
   * 恢复配置文件
   * 当配置文件损坏或被删除时，自动重新创建默认配置文件
   * 这是防止恶意破坏的安全机制
   */
  private async recoverSettingsFile(): Promise<void> {
    try {
      console.log('[SettingsManager] 尝试恢复配置文件...');
      const defaultContent = this.generateDefaultSettingsWithComments();
      await fs.writeFile(this.userSettingsPath, defaultContent, 'utf-8');
      console.log('[SettingsManager]  配置文件已成功恢复到默认状态（JSONC 格式）');
      console.log('[SettingsManager] 恢复路径:', this.userSettingsPath);
    } catch (error) {
      console.error('[SettingsManager]  恢复配置文件失败:', error);
      console.log('[SettingsManager] 应用将继续使用内存中的默认设置运行');
    }
  }

  /**
   * 加载用户设置
   * 安全机制：文件不存在或损坏时自动恢复
   * 支持 JSONC 格式（带注释的 JSON）
   */
  private async loadUserSettings(): Promise<Partial<SettingsSchema>> {
    try {
      const content = await fs.readFile(this.userSettingsPath, 'utf-8');
      
      // 尝试解析 JSONC（支持注释）
      let parsed: any;
      try {
        // 使用 jsonc-parser 解析，支持注释和尾随逗号
        const errors: jsonc.ParseError[] = [];
        parsed = jsonc.parse(content, errors);
        
        if (errors.length > 0) {
          console.error('[SettingsManager]  配置文件 JSONC 解析出现错误:', errors);
          console.log('[SettingsManager] 触发自动恢复机制...');
          await this.recoverSettingsFile();
          return {};
        }
      } catch (parseError) {
        console.error('[SettingsManager]  配置文件解析失败，文件可能已损坏:', parseError);
        console.log('[SettingsManager] 触发自动恢复机制...');
        await this.recoverSettingsFile();
        return {};
      }
      
      console.log('[SettingsManager] 原始用户设置键:', Object.keys(parsed));
      
      // 过滤掉无效的键（只保留在 DEFAULT_SETTINGS 中定义的键）
      const filtered: Partial<SettingsSchema> = {};
      for (const key of Object.keys(parsed)) {
        if (key in DEFAULT_SETTINGS) {
          filtered[key as keyof SettingsSchema] = parsed[key] as any;
          console.log(`[SettingsManager]  保留有效键: ${key}`);
        } else {
          console.log(`[SettingsManager]  过滤无效键: ${key}`);
        }
      }
      
      console.log('[SettingsManager] 过滤后的用户设置键:', Object.keys(filtered));
      return filtered;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // 文件不存在
      if (err.code === 'ENOENT') {
        console.log('[SettingsManager] 配置文件不存在，将使用默认设置');
        return {};
      }
      // 其他错误（权限问题、磁盘错误等）
      console.error('[SettingsManager]  读取配置文件时发生错误:', error);
      console.log('[SettingsManager] 触发自动恢复机制...');
      await this.recoverSettingsFile();
      return {};
    }
  }

  /**
   * 加载工作区设置
   * 支持 JSONC 格式（带注释的 JSON）
   */
  private async loadWorkspaceSettings(): Promise<Partial<SettingsSchema>> {
    if (!this.workspaceSettingsPath) {
      return {};
    }

    try {
      const content = await fs.readFile(this.workspaceSettingsPath, 'utf-8');
      
      // 使用 jsonc-parser 解析，支持注释和尾随逗号
      const errors: jsonc.ParseError[] = [];
      const parsed = jsonc.parse(content, errors);
      
      if (errors.length > 0) {
        console.error('[SettingsManager]  工作区配置文件 JSONC 解析出现错误:', errors);
        return {};
      }
      
      // 过滤掉无效的键（只保留在 DEFAULT_SETTINGS 中定义的键）
      const filtered: Partial<SettingsSchema> = {};
      for (const key of Object.keys(parsed)) {
        if (key in DEFAULT_SETTINGS) {
          filtered[key as keyof SettingsSchema] = parsed[key] as any;
        }
      }
      
      return filtered;
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
    console.log(`[SettingsManager] get 被调用, key: ${key}`);
    console.log(`[SettingsManager] this.settings[${key}]:`, this.settings[key]);
    console.log(`[SettingsManager] DEFAULT_SETTINGS[${key}]:`, DEFAULT_SETTINGS[key]);
    const result = (this.settings[key] ?? DEFAULT_SETTINGS[key]) as SettingsSchema[K];
    console.log(`[SettingsManager] 返回值:`, result);
    return result;
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
   * 获取用户实际配置的设置（不包括默认值）
   * 只返回用户在 settings.json 中显式配置的内容
   */
  async getUserConfiguredSettings(): Promise<Partial<SettingsSchema>> {
    try {
      // 直接从文件读取用户设置
      const userSettings = await this.loadUserSettings();
      
      // 如果有工作区设置，也读取并合并
      const workspaceSettings = await this.loadWorkspaceSettings();
      
      return {
        ...userSettings,
        ...workspaceSettings,
      };
    } catch (error) {
      console.error('[SettingsManager] 获取用户配置失败:', error);
      return {};
    }
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
      // 过滤掉无效的键（只保留在 DEFAULT_SETTINGS 中定义的键）
      const validUpdates: Partial<SettingsSchema> = {};
      for (const key of Object.keys(updates)) {
        if (key in DEFAULT_SETTINGS) {
          validUpdates[key as keyof SettingsSchema] = updates[key as keyof SettingsSchema] as any;
        }
      }

      // 更新内存中的设置
      Object.assign(this.settings, validUpdates);

      // 保存到文件
      if (target === 'user') {
        await this.saveUserSettings();
      } else if (target === 'workspace' && this.workspaceSettingsPath) {
        await this.saveWorkspaceSettings();
      }

      // 触发变更事件（只触发有效键的事件）
      for (const [key, value] of Object.entries(validUpdates)) {
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
   * 过滤掉与默认值相同的设置项
   */
  private filterDefaultValues(settings: Partial<SettingsSchema>): Partial<SettingsSchema> {
    const filtered: Partial<SettingsSchema> = {};
    
    for (const [key, value] of Object.entries(settings)) {
      const typedKey = key as keyof SettingsSchema;
      const defaultValue = DEFAULT_SETTINGS[typedKey];
      
      // 如果值与默认值不同，或者默认设置中没有这个键，则保留
      if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
        filtered[typedKey] = value as any;
      }
    }
    
    return filtered;
  }

  /**
   * 保存用户设置
   * 保留文件中的注释和格式
   */
  private async saveUserSettings(): Promise<void> {
    try {
      // 读取现有文件内容
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.userSettingsPath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // 读取现有的用户设置（已经过滤了无效键）
      const existingSettings = await this.loadUserSettings();
      
      // 只保存与默认值不同的设置
      const settingsToSave = this.filterDefaultValues(this.settings);
      
      // 保留现有设置中的值（避免丢失数据）
      const mergedSettings = {
        ...existingSettings,
        ...settingsToSave,
      };
      
      // 过滤掉无效的键（只保留在 DEFAULT_SETTINGS 中定义的键）
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }
      
      // 如果文件存在且有内容，使用 jsonc-parser 的编辑功能保留注释
      if (existingContent.trim()) {
        let newContent = existingContent;
        
        // 使用 jsonc-parser 的编辑 API 保留注释
        const formattingOptions: jsonc.FormattingOptions = {
          tabSize: 2,
          insertSpaces: true,
          eol: '\n'
        };
        
        // 为每个要更新的键生成编辑操作
        for (const [key, value] of Object.entries(validSettings)) {
          const edits = jsonc.modify(newContent, [key], value, { formattingOptions });
          newContent = jsonc.applyEdits(newContent, edits);
        }
        
        // 删除不再存在的键
        const existingKeys = Object.keys(existingSettings);
        for (const key of existingKeys) {
          if (!(key in validSettings)) {
            const edits = jsonc.modify(newContent, [key], undefined, { formattingOptions });
            newContent = jsonc.applyEdits(newContent, edits);
          }
        }
        
        await fs.writeFile(this.userSettingsPath, newContent, 'utf-8');
      } else {
        // 如果文件不存在或为空，创建新的带注释的文件
        const content = this.generateSettingsWithComments(validSettings);
        await fs.writeFile(this.userSettingsPath, content, 'utf-8');
      }
    } catch (error) {
      console.error('[SettingsManager] 保存设置失败:', error);
      // 如果保存失败，回退到简单的 JSON 保存
      const existingSettings = await this.loadUserSettings();
      const settingsToSave = this.filterDefaultValues(this.settings);
      const mergedSettings = { ...existingSettings, ...settingsToSave };
      
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }
      
      const content = JSON.stringify(validSettings, null, 2);
      await fs.writeFile(this.userSettingsPath, content, 'utf-8');
    }
  }

  /**
   * 生成带注释的设置内容（用于更新后的设置）
   */
  private generateSettingsWithComments(settings: Partial<SettingsSchema>): string {
    const lines: string[] = ['{'];
    const keys = Object.keys(settings) as Array<keyof SettingsSchema>;
    
    // 按类别组织设置
    const categories = {
      'Editor': keys.filter(k => k.startsWith('editor.')),
      'Files': keys.filter(k => k.startsWith('files.')),
      'Workbench': keys.filter(k => k.startsWith('workbench.')),
      'Window': keys.filter(k => k.startsWith('window.')),
      'Terminal': keys.filter(k => k.startsWith('terminal.')),
    };
    
    let isFirst = true;
    for (const [categoryName, categoryKeys] of Object.entries(categories)) {
      if (categoryKeys.length === 0) continue;
      
      if (!isFirst) {
        lines.push('');
      }
      isFirst = false;
      
      lines.push(`  // ==================== ${categoryName} ====================`);
      lines.push('');
      
      categoryKeys.forEach((key, index) => {
        const value = settings[key];
        const valueStr = typeof value === 'string' 
          ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` 
          : JSON.stringify(value);
        const comma = index === categoryKeys.length - 1 && 
                     categoryName === Object.keys(categories).filter(k => (categories as any)[k].length > 0).pop()
          ? '' 
          : ',';
        lines.push(`  "${key}": ${valueStr}${comma}`);
      });
    }
    
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 保存工作区设置
   * 保留文件中的注释和格式
   */
  private async saveWorkspaceSettings(): Promise<void> {
    if (!this.workspaceSettingsPath) {
      throw new Error('工作区路径未设置');
    }

    // 确保 .vscode 目录存在
    const vscodeDir = path.dirname(this.workspaceSettingsPath);
    await fs.mkdir(vscodeDir, { recursive: true });

    try {
      // 读取现有文件内容
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.workspaceSettingsPath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // 读取现有的工作区设置（已经过滤了无效键）
      const existingSettings = await this.loadWorkspaceSettings();
      
      // 只保存与默认值不同的设置
      const settingsToSave = this.filterDefaultValues(this.settings);
      
      // 保留现有设置中的值（避免丢失数据）
      const mergedSettings = {
        ...existingSettings,
        ...settingsToSave,
      };

      // 过滤掉无效的键（只保留在 DEFAULT_SETTINGS 中定义的键）
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }

      // 如果文件存在且有内容，使用 jsonc-parser 的编辑功能保留注释
      if (existingContent.trim()) {
        let newContent = existingContent;
        
        // 使用 jsonc-parser 的编辑 API 保留注释
        const formattingOptions: jsonc.FormattingOptions = {
          tabSize: 2,
          insertSpaces: true,
          eol: '\n'
        };
        
        // 为每个要更新的键生成编辑操作
        for (const [key, value] of Object.entries(validSettings)) {
          const edits = jsonc.modify(newContent, [key], value, { formattingOptions });
          newContent = jsonc.applyEdits(newContent, edits);
        }
        
        // 删除不再存在的键
        const existingKeys = Object.keys(existingSettings);
        for (const key of existingKeys) {
          if (!(key in validSettings)) {
            const edits = jsonc.modify(newContent, [key], undefined, { formattingOptions });
            newContent = jsonc.applyEdits(newContent, edits);
          }
        }
        
        await fs.writeFile(this.workspaceSettingsPath, newContent, 'utf-8');
      } else {
        // 如果文件不存在或为空，创建新的带注释的文件
        const content = this.generateSettingsWithComments(validSettings);
        await fs.writeFile(this.workspaceSettingsPath, content, 'utf-8');
      }
    } catch (error) {
      console.error('[SettingsManager] 保存工作区设置失败:', error);
      // 如果保存失败，回退到简单的 JSON 保存
      const existingSettings = await this.loadWorkspaceSettings();
      const settingsToSave = this.filterDefaultValues(this.settings);
      const mergedSettings = { ...existingSettings, ...settingsToSave };

      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }

      const content = JSON.stringify(validSettings, null, 2);
      await fs.writeFile(this.workspaceSettingsPath, content, 'utf-8');
    }
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
   * 支持 JSONC 格式（带注释的 JSON）
   */
  async importSettings(settingsJson: string, target: 'user' | 'workspace' = 'user'): Promise<void> {
    try {
      // 使用 jsonc-parser 解析，支持注释和尾随逗号
      const errors: jsonc.ParseError[] = [];
      const imported = jsonc.parse(settingsJson, errors);
      
      if (errors.length > 0) {
        console.error('[SettingsManager] 导入的设置 JSONC 解析出现错误:', errors);
        throw new Error('Invalid JSONC format');
      }
      
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
