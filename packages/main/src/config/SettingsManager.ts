/**
 * Settings manager.
 * Responsible for loading, writing, and watching user settings.
 * Supports JSONC (JSON with comments).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import * as jsonc from 'jsonc-parser';
import {
  DEFAULT_WORKBENCH_BACKGROUND_SETTINGS,
  type JsonValue,
  type WorkbenchBackgroundSettings,
} from '@note-studio/shared';

export interface SettingsSchema {
  'files.autoSave': 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
  'files.autoSaveDelay': number;
  'files.encoding': string;
  'files.eol': '\n' | '\r\n' | 'auto';
  'workbench.colorTheme': string;
  'workbench.iconTheme'?: string;
  'workbench.background': WorkbenchBackgroundSettings;
}

export interface ChatModel {
  id: string;
  name: string;
  displayName?: string;
  enabled?: boolean;
  capabilities?: {
    thinking?: boolean;
    tool_calls?: string[];
  };
}

export interface AIModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  chatModels?: ChatModel[];
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
  advanced?: {
    timeout?: number;
    maxRetries?: number;
    stream?: boolean;
    proxy?: string;
    costControl?: {
      maxCostPerRequest?: number;
      dailyLimit?: number;
    };
  };
}

export type SettingsValue = SettingsSchema[keyof SettingsSchema];

type PluginSettingsMap = Record<string, JsonValue>;

const DEFAULT_SETTINGS: SettingsSchema = {
  'files.autoSave': 'afterDelay',
  'files.autoSaveDelay': 1000,
  'files.encoding': 'utf8',
  'files.eol': 'auto',
  'workbench.colorTheme': 'One Dark Pro',
  'workbench.background': { ...DEFAULT_WORKBENCH_BACKGROUND_SETTINGS },
};
export class SettingsManager extends EventEmitter {
  private settings: Partial<SettingsSchema> = {};
  private pluginSettings: PluginSettingsMap = {}; // 瀛樺偍鎻掍欢閰嶇疆锛堜笉鍦?SettingsSchema 涓殑閿級
  private settingsPath: string;
  private userSettingsPath: string;
  private workspaceSettingsPath: string | null = null;

  constructor() {
    super();
    
    // 鐢ㄦ埛璁剧疆璺緞
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, 'User');
    this.userSettingsPath = path.join(this.settingsPath, 'settings.json');
  }

  /**
   * 鍒濆鍖栬缃鐞嗗櫒
   */
  async initialize(): Promise<void> {
    try {
      
      // 纭繚璁剧疆鐩綍瀛樺湪
      await fs.mkdir(this.settingsPath, { recursive: true });
      
      // 妫€鏌ラ厤缃枃浠舵槸鍚﹀瓨鍦紝涓嶅瓨鍦ㄥ垯鍒涘缓榛樿閰嶇疆
      await this.ensureSettingsFile();
      
      // 鍔犺浇鐢ㄦ埛璁剧疆
      await this.loadSettings();
      
    } catch (error) {
      console.error('[SettingsManager] 鍒濆鍖栧け璐?', error);
      // 鍗充娇鍒濆鍖栧け璐ワ紝涔熻纭繚鏈夐粯璁よ缃彲鐢?
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private isStandardSettingsKey(key: string): key is keyof SettingsSchema {
    return key in DEFAULT_SETTINGS;
  }

  /**
   * 纭繚璁剧疆鏂囦欢瀛樺湪锛屽鏋滀笉瀛樺湪鍒欏垱寤洪粯璁ら厤缃枃浠?
   * 杩欐槸搴旂敤棣栨鍚姩鏃跺啓鍏ュ畬鏁撮厤缃殑鍏抽敭鏂规硶
   * 鍒涘缓鐨勬枃浠舵敮鎸?JSONC 鏍煎紡锛堝甫娉ㄩ噴锛?
   */
  private async ensureSettingsFile(): Promise<void> {
    try {
      // 妫€鏌ユ枃浠舵槸鍚﹀瓨鍦?
      await fs.access(this.userSettingsPath);
    } catch (error) {
      // 鏂囦欢涓嶅瓨鍦紝鍒涘缓榛樿閰嶇疆
      try {
        // 鍒涘缓甯︽敞閲婄殑 JSONC 鏍煎紡閰嶇疆鏂囦欢
        const defaultContent = this.generateDefaultSettingsWithComments();
        await fs.writeFile(this.userSettingsPath, defaultContent, 'utf-8');
      } catch (writeError) {
        throw writeError;
      }
    }
  }

  /**
   * 鐢熸垚甯︽敞閲婄殑榛樿閰嶇疆鍐呭
   */
  private generateDefaultSettingsWithComments(): string {
    return `{
 
  // ==================== 鏂囦欢璁剧疆 ====================
  
  // 鑷姩淇濆瓨锛歰ff, afterDelay, onFocusChange, onWindowChange
  "files.autoSave": "${DEFAULT_SETTINGS['files.autoSave']}",
  
  // 鑷姩淇濆瓨寤惰繜锛堟绉掞級
  "files.autoSaveDelay": ${DEFAULT_SETTINGS['files.autoSaveDelay']},
  
  // 鏂囦欢缂栫爜
  "files.encoding": "${DEFAULT_SETTINGS['files.encoding']}",
  
  // 鎹㈣绗︼細\\n, \\r\\n, auto
  "files.eol": "${DEFAULT_SETTINGS['files.eol']}",

  // ==================== 宸ヤ綔鍖鸿缃?====================
  
  // 棰滆壊涓婚
  "workbench.colorTheme": "${DEFAULT_SETTINGS['workbench.colorTheme']}",

  // 鑳屾櫙鍥剧墖璁剧疆
  "workbench.background": ${JSON.stringify(DEFAULT_SETTINGS['workbench.background'], null, 2).replace(/\n/g, '\n  ')}
}
`;
  }

  /**
   * 鍔犺浇璁剧疆
   * 瀹夊叏鏈哄埗锛氬鏋滃姞杞藉け璐ワ紝鑷姩鍥為€€鍒伴粯璁よ缃?
   */
  private async loadSettings(): Promise<void> {
    try {
      console.log('[SettingsManager] ========== 寮€濮嬪姞杞借缃?==========');

      // 鍔犺浇鐢ㄦ埛璁剧疆锛堝甫鑷姩鎭㈠鏈哄埗锛?
      const userSettings = await this.loadUserSettings(true);
      
      // 鍔犺浇宸ヤ綔鍖鸿缃紙濡傛灉瀛樺湪锛?
      const workspaceSettings = await this.loadWorkspaceSettings();
      
      // 鍚堝苟璁剧疆锛堝伐浣滃尯璁剧疆浼樺厛绾ф洿楂橈級
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...userSettings,
        ...workspaceSettings,
      };
      
      // 杩囨护鎺夋墍鏈夋棤鏁堢殑閿紙闃叉鍐呭瓨涓畫鐣欓噸澶嶉厤缃級
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(this.settings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = this.settings[key as keyof SettingsSchema] as any;
        }
      }
      this.settings = validSettings;
      
    } catch (error) {
      // 瀹夊叏鏈哄埗锛氬洖閫€鍒伴粯璁よ缃?
      this.settings = { ...DEFAULT_SETTINGS };
      // 灏濊瘯鎭㈠閰嶇疆鏂囦欢
      await this.recoverSettingsFile();
    }
  }

  /**
   * 鎭㈠閰嶇疆鏂囦欢
   * 褰撻厤缃枃浠舵崯鍧忔垨琚垹闄ゆ椂锛岃嚜鍔ㄩ噸鏂板垱寤洪粯璁ら厤缃枃浠?
   * 杩欐槸闃叉鎭舵剰鐮村潖鐨勫畨鍏ㄦ満鍒?
   */
  private async recoverSettingsFile(): Promise<void> {
    try {
      const defaultContent = this.generateDefaultSettingsWithComments();
      await fs.writeFile(this.userSettingsPath, defaultContent, 'utf-8');
    } catch (error) {
      console.error('[SettingsManager]  鎭㈠閰嶇疆鏂囦欢澶辫触:', error);
    }
  }

  /**
   * 鍔犺浇鐢ㄦ埛璁剧疆
   * 瀹夊叏鏈哄埗锛氭枃浠朵笉瀛樺湪鎴栨崯鍧忔椂鑷姩鎭㈠
   * 鏀寔 JSONC 鏍煎紡锛堝甫娉ㄩ噴鐨?JSON锛?
   */
  private async loadUserSettings(updatePluginSettings = false): Promise<Partial<SettingsSchema>> {
    try {
      const content = await fs.readFile(this.userSettingsPath, 'utf-8');
      
      // 妫€鏌ユ枃浠跺唴瀹规槸鍚︿负绌烘垨鍙湁绌虹櫧瀛楃
      const trimmedContent = content.trim();
      if (!trimmedContent || trimmedContent === '' || trimmedContent === '{}') {
        await this.recoverSettingsFile();
        return {};
      }
      
      // 灏濊瘯瑙ｆ瀽 JSONC锛堟敮鎸佹敞閲婏級
      let parsed: any;
      try {
        // 浣跨敤 jsonc-parser 瑙ｆ瀽锛屾敮鎸佹敞閲婂拰灏鹃殢閫楀彿
        const errors: jsonc.ParseError[] = [];
        parsed = jsonc.parse(trimmedContent, errors);
        
        // 濡傛灉瑙ｆ瀽缁撴灉涓?null 鎴?undefined锛岃鏄庢枃浠舵牸寮忛敊璇?
        if (parsed === null || parsed === undefined) {
          await this.recoverSettingsFile();
          return {};
        }
        
        if (errors.length > 0) {
          console.error('[SettingsManager]  閰嶇疆鏂囦欢 JSONC 瑙ｆ瀽鍑虹幇閿欒:', errors);
          await this.recoverSettingsFile();
          return {};
        }
      } catch (parseError) {
        console.error('[SettingsManager]  閰嶇疆鏂囦欢瑙ｆ瀽澶辫触锛屾枃浠跺彲鑳藉凡鎹熷潖:', parseError);
        await this.recoverSettingsFile();
        return {};
      }
      
      
      // 鍒嗙鏍囧噯璁剧疆鍜屾彃浠惰缃?
      const filtered: Partial<SettingsSchema> = {};
      const pluginConfig: PluginSettingsMap = {};
      for (const key of Object.keys(parsed)) {
        if (key in DEFAULT_SETTINGS) {
          filtered[key as keyof SettingsSchema] = parsed[key] as any;
        } else {
          // 淇濈暀鎻掍欢閰嶇疆锛堜笉鍦?DEFAULT_SETTINGS 涓殑閿級
          pluginConfig[key] = parsed[key] as JsonValue;
        }
      }
      
      // 淇濆瓨鎻掍欢閰嶇疆鍒板唴瀛橈紙浠呭垵濮嬪寲鏃讹級
      if (updatePluginSettings) {
        this.pluginSettings = { ...this.pluginSettings, ...pluginConfig };
      }
      return filtered;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // 鏂囦欢涓嶅瓨鍦?
      if (err.code === 'ENOENT') {
        return {};
      }
      // 鍏朵粬閿欒锛堟潈闄愰棶棰樸€佺鐩橀敊璇瓑锛?
      await this.recoverSettingsFile();
      return {};
    }
  }

  /**
   * 鍔犺浇宸ヤ綔鍖鸿缃?
   * 鏀寔 JSONC 鏍煎紡锛堝甫娉ㄩ噴鐨?JSON锛?
   */
  private async loadWorkspaceSettings(): Promise<Partial<SettingsSchema>> {
    if (!this.workspaceSettingsPath) {
      return {};
    }

    try {
      const content = await fs.readFile(this.workspaceSettingsPath, 'utf-8');
      
      // 浣跨敤 jsonc-parser 瑙ｆ瀽锛屾敮鎸佹敞閲婂拰灏鹃殢閫楀彿
      const errors: jsonc.ParseError[] = [];
      const parsed = jsonc.parse(content, errors);
      
      if (errors.length > 0) {
        return {};
      }
      
      // 杩囨护鎺夋棤鏁堢殑閿紙鍙繚鐣欏湪 DEFAULT_SETTINGS 涓畾涔夌殑閿級
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
   * 璁剧疆宸ヤ綔鍖鸿矾寰?
   */
  setWorkspacePath(workspacePath: string): void {
    this.workspaceSettingsPath = path.join(workspacePath, '.vscode', 'settings.json');
    this.loadSettings(); // 閲嶆柊鍔犺浇璁剧疆
  }

  /**
   * 鑾峰彇璁剧疆鍊?
   */
  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    const result = (this.settings[key] ?? DEFAULT_SETTINGS[key]) as SettingsSchema[K];
    return result;
  }

  /**
   * 鑾峰彇鎻掍欢閰嶇疆锛堟敮鎸佷换鎰忛敭锛?
   */
  getPluginSetting<TValue extends JsonValue>(key: string, defaultValue?: TValue): TValue | undefined {
    // 鍏堟鏌ユ槸鍚︽槸鏍囧噯璁剧疆
    if (this.isStandardSettingsKey(key)) {
      return this.get(key) as TValue;
    }
    // 妫€鏌ユ彃浠堕厤缃?
    const value = this.pluginSettings[key];
    const result = value !== undefined ? (value as TValue) : defaultValue;
    return result;
  }

  getSettingValue(key: string): JsonValue | undefined {
    if (this.isStandardSettingsKey(key)) {
      return this.get(key) as JsonValue;
    }

    return this.pluginSettings[key];
  }

  /**
   * 鑾峰彇鎵€鏈夎缃?
   */
  getAll(): Partial<SettingsSchema> {
    return { ...this.settings };
  }

  async getAllConfiguredSettings(): Promise<Record<string, JsonValue>> {
    const standardSettings = await this.getUserConfiguredSettings();
    const result: Record<string, JsonValue> = {};

    for (const [key, value] of Object.entries(standardSettings)) {
      if (value !== undefined) {
        result[key] = value as JsonValue;
      }
    }

    for (const [key, value] of Object.entries(this.pluginSettings)) {
      result[key] = value;
    }

    return result;
  }

  /**
   * 鑾峰彇鎵€鏈夎缃紙鍖呮嫭榛樿鍊硷級
   */
  getAllWithDefaults(): SettingsSchema {
    return {
      ...DEFAULT_SETTINGS,
      ...this.settings,
    };
  }

  /**
   * 閲嶆柊鍔犺浇璁剧疆鏂囦欢鍒板唴瀛?
   */
  async reload(): Promise<void> {
    await this.loadSettings();
  }

  /**
   * 鑾峰彇鐢ㄦ埛瀹為檯閰嶇疆鐨勮缃紙涓嶅寘鎷粯璁ゅ€硷級
   * 鍙繑鍥炵敤鎴峰湪 settings.json 涓樉寮忛厤缃殑鍐呭
   */
  async getUserConfiguredSettings(): Promise<Partial<SettingsSchema>> {
    try {
      // 鐩存帴浠庢枃浠惰鍙栫敤鎴疯缃?
      const userSettings = await this.loadUserSettings();
      
      // 濡傛灉鏈夊伐浣滃尯璁剧疆锛屼篃璇诲彇骞跺悎骞?
      const workspaceSettings = await this.loadWorkspaceSettings();
      
      return {
        ...userSettings,
        ...workspaceSettings,
      };
    } catch (error) {
      console.error('[SettingsManager] 鑾峰彇鐢ㄦ埛閰嶇疆澶辫触:', error);
      return {};
    }
  }

  /**
   * 鏇存柊璁剧疆
   */
  async update<K extends keyof SettingsSchema>(
    key: K,
    value: SettingsSchema[K],
    target: 'user' | 'workspace' = 'user'
  ): Promise<void> {
    try {
      // 鏇存柊鍐呭瓨涓殑璁剧疆
      this.settings[key] = value;

      // 淇濆瓨鍒版枃浠?
      if (target === 'user') {
        await this.saveUserSettings();
      } else if (target === 'workspace' && this.workspaceSettingsPath) {
        await this.saveWorkspaceSettings();
      }

      // 瑙﹀彂鍙樻洿浜嬩欢
      this.emit('change', key, value);
      
    } catch (error) {
      console.error('[SettingsManager] 鏇存柊璁剧疆澶辫触:', error);
      throw error;
    }
  }

  /**
   * 鏇存柊鎻掍欢閰嶇疆锛堟敮鎸佷换鎰忛敭锛?
   */
  async updatePluginSetting(
    key: string,
    value: JsonValue,
    target: 'user' | 'workspace' = 'user'
  ): Promise<void> {
    try {
      // 濡傛灉鏄爣鍑嗚缃紝浣跨敤鏍囧噯鏂规硶
      if (this.isStandardSettingsKey(key)) {
        await this.update(key, value as SettingsSchema[typeof key], target);
        return;
      }
      // 鏇存柊鎻掍欢閰嶇疆
      this.pluginSettings[key] = value;

      // 淇濆瓨鍒版枃浠?
      if (target === 'user') {
        await this.saveUserSettings();
      } else if (target === 'workspace' && this.workspaceSettingsPath) {
        await this.saveWorkspaceSettings();
      }

      // 瑙﹀彂鍙樻洿浜嬩欢
      this.emit('change', key, value);
      
      // 鍙戦€?IPC 浜嬩欢鍒版覆鏌撹繘绋嬶紝閫氱煡閰嶇疆宸蹭繚瀛橈紙鐢ㄤ簬璋冭瘯锛?
      try {
        const { BrowserWindow } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('settings:plugin-config-saved', { key, success: true });
        }
      } catch (error) {
        // 蹇界暐閿欒锛岃繖鍙槸璋冭瘯鍔熻兘
      }
    } catch (error) {
      console.error('[SettingsManager] 鏇存柊鎻掍欢閰嶇疆澶辫触:', error);
      throw error;
    }
  }

  /**
   * 鎵归噺鏇存柊璁剧疆
   */
  async updateMany(
    updates: Partial<SettingsSchema>,
    target: 'user' | 'workspace' = 'user'
  ): Promise<void> {
    try {
      // 杩囨护鎺夋棤鏁堢殑閿紙鍙繚鐣欏湪 DEFAULT_SETTINGS 涓畾涔夌殑閿級
      const validUpdates: Partial<SettingsSchema> = {};
      for (const key of Object.keys(updates)) {
        if (key in DEFAULT_SETTINGS) {
          validUpdates[key as keyof SettingsSchema] = updates[key as keyof SettingsSchema] as any;
        }
      }

      // 鏇存柊鍐呭瓨涓殑璁剧疆
      Object.assign(this.settings, validUpdates);

      // 淇濆瓨鍒版枃浠?
      if (target === 'user') {
        await this.saveUserSettings();
      } else if (target === 'workspace' && this.workspaceSettingsPath) {
        await this.saveWorkspaceSettings();
      }

      // 瑙﹀彂鍙樻洿浜嬩欢锛堝彧瑙﹀彂鏈夋晥閿殑浜嬩欢锛?
      for (const [key, value] of Object.entries(validUpdates)) {
        this.emit('change', key, value);
      }
      
    } catch (error) {
      console.error('[SettingsManager] 鎵归噺鏇存柊璁剧疆澶辫触:', error);
      throw error;
    }
  }

  async updateSettingValue(
    key: string,
    value: JsonValue,
    target: 'user' | 'workspace' = 'user',
  ): Promise<void> {
    if (this.isStandardSettingsKey(key)) {
      await this.update(key, value as SettingsSchema[typeof key], target);
      return;
    }

    if (target === 'workspace') {
      throw new Error('插件设置暂不支持保存到 workspace。');
    }

    await this.updatePluginSetting(key, value, 'user');
  }

  async updateManySettingValues(
    updates: Record<string, JsonValue>,
    target: 'user' | 'workspace' = 'user',
  ): Promise<void> {
    const standardUpdates: Partial<SettingsSchema> = {};
    const pluginUpdates: PluginSettingsMap = {};

    for (const [key, value] of Object.entries(updates)) {
      if (this.isStandardSettingsKey(key)) {
        Object.assign(standardUpdates, {
          [key]: value as SettingsSchema[typeof key],
        });
        continue;
      }

      pluginUpdates[key] = value;
    }

    if (Object.keys(pluginUpdates).length > 0 && target === 'workspace') {
      throw new Error('插件设置暂不支持保存到 workspace。');
    }

    Object.assign(this.settings, standardUpdates);

    for (const [key, value] of Object.entries(pluginUpdates)) {
      this.pluginSettings[key] = value;
    }

    if (target === 'user') {
      await this.saveUserSettings();
    } else if (this.workspaceSettingsPath) {
      await this.saveWorkspaceSettings();
    }

    for (const [key, value] of Object.entries(standardUpdates)) {
      this.emit('change', key, value);
    }

    for (const [key, value] of Object.entries(pluginUpdates)) {
      this.emit('change', key, value);
    }
  }

  /**
   * 閲嶇疆璁剧疆涓洪粯璁ゅ€?
   */
  async reset(key?: keyof SettingsSchema): Promise<void> {
    try {
      if (key) {
        // 閲嶇疆鍗曚釜璁剧疆
        this.settings[key] = DEFAULT_SETTINGS[key] as any;
      } else {
        // 閲嶇疆鎵€鏈夎缃?
        this.settings = { ...DEFAULT_SETTINGS };
      }

      await this.saveUserSettings();
      this.emit('reset', key);
      
    } catch (error) {
      console.error('[SettingsManager] 閲嶇疆璁剧疆澶辫触:', error);
      throw error;
    }
  }

  async resetSettingValue(
    key?: string,
    target: 'user' | 'workspace' = 'user',
  ): Promise<void> {
    if (typeof key === 'string') {
      if (this.isStandardSettingsKey(key)) {
        await this.reset(key);
        return;
      }

      if (target === 'workspace') {
        throw new Error('插件设置暂不支持保存到 workspace。');
      }

      delete this.pluginSettings[key];
      await this.saveUserSettings();
      this.emit('reset', key);
      return;
    }

    this.settings = { ...DEFAULT_SETTINGS };
    if (target === 'user') {
      this.pluginSettings = {};
      await this.saveUserSettings();
    } else if (this.workspaceSettingsPath) {
      await this.saveWorkspaceSettings();
    }

    this.emit('reset', undefined);
  }

  /**
   * 杩囨护鎺変笌榛樿鍊肩浉鍚岀殑璁剧疆椤?
   */
  private filterDefaultValues(settings: Partial<SettingsSchema>): Partial<SettingsSchema> {
    const filtered: Partial<SettingsSchema> = {};
    
    for (const [key, value] of Object.entries(settings)) {
      const typedKey = key as keyof SettingsSchema;
      const defaultValue = DEFAULT_SETTINGS[typedKey];
      
      // 濡傛灉鍊间笌榛樿鍊间笉鍚岋紝鎴栬€呴粯璁よ缃腑娌℃湁杩欎釜閿紝鍒欎繚鐣?
      if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
        filtered[typedKey] = value as any;
      }
    }
    
    return filtered;
  }

  /**
   * 淇濆瓨鐢ㄦ埛璁剧疆
   * 淇濈暀鏂囦欢涓殑娉ㄩ噴鍜屾牸寮?
   */
  private async saveUserSettings(): Promise<void> {
    try {
      // 璇诲彇鐜版湁鏂囦欢鍐呭
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.userSettingsPath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        console.log('[SettingsManager] 鏂囦欢涓嶅瓨鍦紝灏嗗垱寤烘柊鏂囦欢');
      }

      // 璇诲彇鐜版湁鐨勭敤鎴疯缃紙宸茬粡杩囨护浜嗘棤鏁堥敭锛?
      // 娉ㄦ剰锛歭oadUserSettings 浼氭洿鏂?this.pluginSettings锛屾墍浠ュ厛淇濆瓨褰撳墠鍊?
      const currentPluginSettings = { ...this.pluginSettings };
      const existingSettings = await this.loadUserSettings();
      
      // 鎭㈠ pluginSettings锛堝洜涓?loadUserSettings 鍙兘瑕嗙洊浜嗗畠锛?
      this.pluginSettings = { ...this.pluginSettings, ...currentPluginSettings };
      
      // 鍙繚瀛樹笌榛樿鍊间笉鍚岀殑璁剧疆
      const settingsToSave = this.filterDefaultValues(this.settings);
      
      // 淇濈暀鐜版湁璁剧疆涓殑鍊硷紙閬垮厤涓㈠け鏁版嵁锛?
      const mergedSettings = {
        ...existingSettings,
        ...settingsToSave,
      };
      
      // 鍒嗙鏍囧噯璁剧疆鍜屾彃浠惰缃?
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }
      
      // 鍚堝苟鎻掍欢閰嶇疆
      const allSettings = {
        ...validSettings,
        ...this.pluginSettings,
      };
      
      
      // 妫€鏌ユ枃浠舵槸鍚︿负绌烘垨鍙湁 {}
      const trimmedContent = existingContent.trim();
      const isEmpty = !trimmedContent || trimmedContent === '{}';
      
      // 濡傛灉鏂囦欢瀛樺湪涓旀湁鍐呭锛堜笖涓嶆槸绌虹殑 {}锛夛紝灏濊瘯淇濈暀娉ㄩ噴锛屼絾浼樺厛纭繚閰嶇疆姝ｇ‘鍐欏叆
      if (trimmedContent && !isEmpty) {
        // 瑙ｆ瀽鐜版湁鍐呭
        let existingParsed: any = {};
        try {
          const errors: jsonc.ParseError[] = [];
          const parsed = jsonc.parse(existingContent, errors);
          if (parsed !== null && parsed !== undefined && errors.length === 0) {
            existingParsed = parsed;
          } else {
            existingParsed = {};
          }
        } catch (parseError) {
          existingParsed = {};
        }
        const existingKeysSet = new Set(Object.keys(existingParsed));
        
        
        // 妫€鏌ユ槸鍚︽湁鏂伴敭闇€瑕佹坊鍔?
        const hasNewKeys = Object.keys(allSettings).some(key => !existingKeysSet.has(key));
        
        if (hasNewKeys) {
          // 濡傛灉鏈夋柊閿紝鐩存帴鍚堝苟骞堕噸鏂板啓鍏ワ紙纭繚鏂伴敭涓€瀹氳鍐欏叆锛?
          const mergedConfig = {
            ...existingParsed,
            ...allSettings
          };
          
          // 鐢熸垚甯︽敞閲婄殑 JSON 鍐呭锛堝寘鍚彃浠堕厤缃級
          const newContent = this.generateSettingsWithCommentsAndPlugins(validSettings, this.pluginSettings);
          await fs.writeFile(this.userSettingsPath, newContent, 'utf-8');
        } else {
          // 娌℃湁鏂伴敭锛屼娇鐢?jsonc-parser 淇濈暀娉ㄩ噴
          let newContent = existingContent;
          const formattingOptions: jsonc.FormattingOptions = {
            tabSize: 2,
            insertSpaces: true,
            eol: '\n'
          };
          
          // 鏇存柊鎵€鏈夐敭
          for (const [key, value] of Object.entries(allSettings)) {
            const edits = jsonc.modify(newContent, [key], value, { formattingOptions });
            newContent = jsonc.applyEdits(newContent, edits);
          }
          
          // 鍒犻櫎涓嶅啀瀛樺湪鐨勯敭锛堝彧鍒犻櫎鏍囧噯璁剧疆锛?
          const existingKeys = Object.keys(existingSettings);
          for (const key of existingKeys) {
            if (!(key in validSettings) && key in DEFAULT_SETTINGS) {
              const edits = jsonc.modify(newContent, [key], undefined, { formattingOptions });
              newContent = jsonc.applyEdits(newContent, edits);
            }
          }
          
          await fs.writeFile(this.userSettingsPath, newContent, 'utf-8');
        }
        
        // 楠岃瘉鍐欏叆鏄惁鎴愬姛
        try {
          const verifyContent = await fs.readFile(this.userSettingsPath, 'utf-8');
          try {
            const errors: jsonc.ParseError[] = [];
            const verifyParsed = jsonc.parse(verifyContent, errors);
            if (verifyParsed && errors.length === 0) {
            } else {
              console.warn('[SettingsManager] 楠岃瘉锛氭枃浠惰В鏋愬け璐ワ紝浣嗘枃浠跺凡鍐欏叆');
            }
          } catch (parseError) {
            console.warn('[SettingsManager] 楠岃瘉锛氭枃浠惰В鏋愭椂鍑洪敊锛屼絾鏂囦欢宸插啓鍏?', parseError);
          }
        } catch (verifyError) {
          console.error('[SettingsManager] 楠岃瘉鏂囦欢鍐欏叆鏃跺嚭閿?', verifyError);
        }
      } else {
        // 濡傛灉鏂囦欢涓嶅瓨鍦ㄦ垨涓虹┖锛屽垱寤烘柊鐨勫甫娉ㄩ噴鐨勬枃浠?
        const content = this.generateSettingsWithComments(validSettings);
        // 灏嗘彃浠堕厤缃坊鍔犲埌鏂囦欢鏈熬
        let finalContent = content;
        if (Object.keys(this.pluginSettings).length > 0) {
          // 绉婚櫎鏈€鍚庣殑 } 鍜屾崲琛?
          finalContent = content.trim().slice(0, -1);
          // 娣诲姞鎻掍欢閰嶇疆
          const pluginConfigStr = Object.entries(this.pluginSettings)
            .map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`)
            .join(',\n');
          finalContent += `,\n${pluginConfigStr}\n}`;
        }
        await fs.writeFile(this.userSettingsPath, finalContent, 'utf-8');
      }
    } catch (error) {
      console.error('[SettingsManager] 淇濆瓨璁剧疆澶辫触:', error);
      // 濡傛灉淇濆瓨澶辫触锛屽洖閫€鍒扮畝鍗曠殑 JSON 淇濆瓨
      const existingSettings = await this.loadUserSettings();
      const settingsToSave = this.filterDefaultValues(this.settings);
      const mergedSettings = { ...existingSettings, ...settingsToSave };
      
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }
      
      // 鍚堝苟鎻掍欢閰嶇疆
      const allSettings = {
        ...validSettings,
        ...this.pluginSettings,
      };
      
      const content = JSON.stringify(allSettings, null, 2);
      await fs.writeFile(this.userSettingsPath, content, 'utf-8');
    }
  }

  /**
   * 鐢熸垚甯︽敞閲婄殑璁剧疆鍐呭锛堢敤浜庢洿鏂板悗鐨勮缃級
   */
  private generateSettingsWithComments(settings: Partial<SettingsSchema>): string {
    const lines: string[] = ['{'];
    const keys = Object.keys(settings) as Array<keyof SettingsSchema>;
    
    // 鎸夌被鍒粍缁囪缃?
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
   * 鐢熸垚甯︽敞閲婄殑璁剧疆鍐呭锛堝寘鍚彃浠堕厤缃級
   */
  private generateSettingsWithCommentsAndPlugins(settings: Partial<SettingsSchema>, pluginSettings: PluginSettingsMap): string {
    // 鍏堢敓鎴愭爣鍑嗚缃殑甯︽敞閲婂唴瀹?
    const standardContent = this.generateSettingsWithComments(settings);
    
    // 濡傛灉鏈夋彃浠堕厤缃紝娣诲姞鍒版枃浠舵湯灏?
    if (Object.keys(pluginSettings).length > 0) {
      // 绉婚櫎鏈€鍚庣殑 }
      const contentWithoutBrace = standardContent.trim().slice(0, -1);
      
      // 娣诲姞鎻掍欢閰嶇疆
      const pluginConfigLines: string[] = [];
      for (const [key, value] of Object.entries(pluginSettings)) {
        const valueStr = JSON.stringify(value, null, 2).split('\n').map((line, index) => 
          index === 0 ? line : '  ' + line
        ).join('\n');
        pluginConfigLines.push(`  "${key}": ${valueStr}`);
      }
      
      return contentWithoutBrace + (contentWithoutBrace.trim().endsWith(',') ? '' : ',') + '\n' + pluginConfigLines.join(',\n') + '\n}';
    }
    
    return standardContent;
  }

  /**
   * 淇濆瓨宸ヤ綔鍖鸿缃?
   * 淇濈暀鏂囦欢涓殑娉ㄩ噴鍜屾牸寮?
   */
  private async saveWorkspaceSettings(): Promise<void> {
    if (!this.workspaceSettingsPath) {
      throw new Error('宸ヤ綔鍖鸿矾寰勬湭璁剧疆');
    }

    // 纭繚 .vscode 鐩綍瀛樺湪
    const vscodeDir = path.dirname(this.workspaceSettingsPath);
    await fs.mkdir(vscodeDir, { recursive: true });

    try {
      // 璇诲彇鐜版湁鏂囦欢鍐呭
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.workspaceSettingsPath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // 璇诲彇鐜版湁鐨勫伐浣滃尯璁剧疆锛堝凡缁忚繃婊や簡鏃犳晥閿級
      const existingSettings = await this.loadWorkspaceSettings();
      
      // 鍙繚瀛樹笌榛樿鍊间笉鍚岀殑璁剧疆
      const settingsToSave = this.filterDefaultValues(this.settings);
      
      // 淇濈暀鐜版湁璁剧疆涓殑鍊硷紙閬垮厤涓㈠け鏁版嵁锛?
      const mergedSettings = {
        ...existingSettings,
        ...settingsToSave,
      };

      // 杩囨护鎺夋棤鏁堢殑閿紙鍙繚鐣欏湪 DEFAULT_SETTINGS 涓畾涔夌殑閿級
      const validSettings: Partial<SettingsSchema> = {};
      for (const key of Object.keys(mergedSettings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof SettingsSchema] = mergedSettings[key as keyof SettingsSchema] as any;
        }
      }

      // 濡傛灉鏂囦欢瀛樺湪涓旀湁鍐呭锛屼娇鐢?jsonc-parser 鐨勭紪杈戝姛鑳戒繚鐣欐敞閲?
      if (existingContent.trim()) {
        let newContent = existingContent;
        
        // 浣跨敤 jsonc-parser 鐨勭紪杈?API 淇濈暀娉ㄩ噴
        const formattingOptions: jsonc.FormattingOptions = {
          tabSize: 2,
          insertSpaces: true,
          eol: '\n'
        };
        
        // 涓烘瘡涓鏇存柊鐨勯敭鐢熸垚缂栬緫鎿嶄綔
        for (const [key, value] of Object.entries(validSettings)) {
          const edits = jsonc.modify(newContent, [key], value, { formattingOptions });
          newContent = jsonc.applyEdits(newContent, edits);
        }
        
        // 鍒犻櫎涓嶅啀瀛樺湪鐨勯敭
        const existingKeys = Object.keys(existingSettings);
        for (const key of existingKeys) {
          if (!(key in validSettings)) {
            const edits = jsonc.modify(newContent, [key], undefined, { formattingOptions });
            newContent = jsonc.applyEdits(newContent, edits);
          }
        }
        
        await fs.writeFile(this.workspaceSettingsPath, newContent, 'utf-8');
      } else {
        // 濡傛灉鏂囦欢涓嶅瓨鍦ㄦ垨涓虹┖锛屽垱寤烘柊鐨勫甫娉ㄩ噴鐨勬枃浠?
        const content = this.generateSettingsWithComments(validSettings);
        await fs.writeFile(this.workspaceSettingsPath, content, 'utf-8');
      }
    } catch (error) {
      console.error('[SettingsManager] 淇濆瓨宸ヤ綔鍖鸿缃け璐?', error);
      // 濡傛灉淇濆瓨澶辫触锛屽洖閫€鍒扮畝鍗曠殑 JSON 淇濆瓨
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
   * 鑾峰彇璁剧疆鏂囦欢璺緞
   */
  getSettingsPath(target: 'user' | 'workspace' = 'user'): string {
    if (target === 'workspace' && this.workspaceSettingsPath) {
      return this.workspaceSettingsPath;
    }
    return this.userSettingsPath;
  }

  /**
   * 鑾峰彇榛樿璁剧疆
   */
  getDefaults(): SettingsSchema {
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * 瀵煎叆璁剧疆
   * 鏀寔 JSONC 鏍煎紡锛堝甫娉ㄩ噴鐨?JSON锛?
   */
  async importSettings(settingsJson: string, target: 'user' | 'workspace' = 'user'): Promise<void> {
    try {
      // 浣跨敤 jsonc-parser 瑙ｆ瀽锛屾敮鎸佹敞閲婂拰灏鹃殢閫楀彿
      const errors: jsonc.ParseError[] = [];
      const imported = jsonc.parse(settingsJson, errors);
      
      if (errors.length > 0) {
        console.error('[SettingsManager] 瀵煎叆鐨勮缃?JSONC 瑙ｆ瀽鍑虹幇閿欒:', errors);
        throw new Error('Invalid JSONC format');
      }
      
      await this.updateManySettingValues(imported as Record<string, JsonValue>, target);
    } catch (error) {
      console.error('[SettingsManager] 瀵煎叆璁剧疆澶辫触:', error);
      throw error;
    }
  }

  /**
   * 瀵煎嚭璁剧疆
   */
  exportSettings(): string {
    return JSON.stringify({
      ...this.settings,
      ...this.pluginSettings,
    }, null, 2);
  }
}

