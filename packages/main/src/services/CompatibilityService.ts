/**
 * 兼容性检测服务
 * ⭐ 检测 VSCode 扩展的兼容性
 */

import { ExtensionManifest } from '@note-studio/extension-api/src/types/extension';

/**
 * 兼容性检测结果
 */
export interface ICompatibilityResult {
  compatible: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * 扩展清单接口（兼容 VSCode）
 */
export interface IExtensionManifest {
  name: string;
  version: string;
  displayName?: string;
  engines?: {
    vscode?: string;
    noteStudio?: string;
  };
  activationEvents?: string[];
  contributes?: any;
  main?: string;
}

export class CompatibilityService {
  // ⭐ 当前兼容的 VSCode API 版本
  private readonly CURRENT_VSCODE_VERSION = '1.85.0';
  
  // ⭐ 支持的引擎版本范围
  private readonly supportedEngines = {
    vscode: '>=1.60.0 <=1.90.0'
  };

  // ⭐ 完全支持的激活事件
  private readonly supportedActivationEvents = [
    'onLanguage:',
    'onCommand:',
    'onView:',
    'onFileSystem:',
    'onDebug',
    'onDebugInitialConfigurations',
    'onDebugResolve:',
    'workspaceContains:',
    'onStartupFinished',
    '*'
  ];

  // ⭐ 部分支持的激活事件（会产生警告）
  private readonly partiallySupported = [
    'onWebviewPanel:',
    'onCustomEditor:',
    'onTerminal:',
    'onNotebook:'
  ];

  // ⭐ 不支持的 API 列表
  private readonly unsupportedAPIs = [
    'notebooks',
    'testing',
    'authentication',
    'timeline',
    'comments',
    'customEditors', 
    'terminal.onDidWriteData',
    'terminal.onDidOpenTerminal',
    'terminal.onDidCloseTerminal',
    'lm',  // Language Model API
    'chat', // Chat API
  ];

  // ⭐ 部分实现的 API（需要主进程支持）
  private readonly partialAPIs = [
    'webview',
    'treeView',
    'statusBar',
    'outputChannel'
  ];

  /**
   * ⭐ 检测 VSCode 扩展是否兼容
   */
  async checkCompatibility(manifest: IExtensionManifest): Promise<ICompatibilityResult> {
    const result: ICompatibilityResult = {
      compatible: true,
      warnings: [],
      errors: [],
    };
    
    // 1. 检查引擎版本
    this.checkEngineVersion(manifest, result);
    
    // 2. 检查激活事件
    this.checkActivationEvents(manifest, result);
    
    // 3. 检查贡献点（contributes）
    this.checkContributions(manifest, result);
    
    // 4. 检测不支持的 API（通过代码分析）
    await this.detectUnsupportedAPIs(manifest, result);
    
    // 5. 如果有错误，标记为不兼容
    if (result.errors.length > 0) {
      result.compatible = false;
    }
    
    return result;
  }

  /**
   * 检查引擎版本兼容性
   */
  private checkEngineVersion(manifest: IExtensionManifest, result: ICompatibilityResult): void {
    const engineVersion = manifest.engines?.vscode;
    
    if (!engineVersion) {
      result.warnings.push('未指定 VSCode 引擎版本，可能存在兼容性问题');
      return;
    }

    if (!this.isVersionCompatible(engineVersion)) {
      result.warnings.push(
        `需要 VSCode ${engineVersion}，当前兼容 ${this.CURRENT_VSCODE_VERSION}，部分功能可能不可用`
      );
    }
  }

  /**
   * 检查版本是否兼容
   */
  private isVersionCompatible(requiredVersion: string): boolean {
    try {
      // 清理版本字符串
      let cleanVersion = requiredVersion.trim();
      let isCaretRange = cleanVersion.startsWith('^');
      let isTildeRange = cleanVersion.startsWith('~');
      
      cleanVersion = cleanVersion.replace(/^[\^~]/, '');
      
      // 解析版本号
      const required = this.parseVersion(cleanVersion);
      const current = this.parseVersion(this.CURRENT_VSCODE_VERSION);
      
      // ^ 符号：兼容同一主版本的更新
      if (isCaretRange) {
        if (current.major !== required.major) {
          return current.major > required.major;
        }
        if (current.minor < required.minor) {
          return false;
        }
        if (current.minor > required.minor) {
          return true;
        }
        return current.patch >= required.patch;
      }
      
      // ~ 符号：兼容同一次版本的更新
      if (isTildeRange) {
        if (current.major !== required.major || current.minor !== required.minor) {
          return current.major > required.major || 
                 (current.major === required.major && current.minor > required.minor);
        }
        return current.patch >= required.patch;
      }
      
      // 精确版本或大于等于
      return this.compareVersions(current, required) >= 0;
    } catch (error) {
      console.warn('版本检查失败:', error);
      return true; // 默认兼容
    }
  }
  
  /**
   * 比较两个版本号
   * @returns -1 如果 v1 < v2, 0 如果相等, 1 如果 v1 > v2
   */
  private compareVersions(
    v1: { major: number; minor: number; patch: number },
    v2: { major: number; minor: number; patch: number }
  ): number {
    if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
    if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
    if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;
    return 0;
  }

  /**
   * 解析版本号
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const parts = version.split('.');
    return {
      major: parseInt(parts[0] || '0', 10),
      minor: parseInt(parts[1] || '0', 10),
      patch: parseInt(parts[2] || '0', 10)
    };
  }

  /**
   * 检查激活事件
   */
  private checkActivationEvents(manifest: IExtensionManifest, result: ICompatibilityResult): void {
    if (!manifest.activationEvents || manifest.activationEvents.length === 0) {
      return;
    }

    for (const event of manifest.activationEvents) {
      // 检查是否完全支持
      const isSupported = this.supportedActivationEvents.some(prefix => 
        event === prefix || event.startsWith(prefix)
      );

      if (isSupported) {
        continue;
      }

      // 检查是否部分支持
      const isPartiallySupported = this.partiallySupported.some(prefix => 
        event === prefix || event.startsWith(prefix)
      );

      if (isPartiallySupported) {
        result.warnings.push(`激活事件 "${event}" 部分支持，某些功能可能不可用`);
        continue;
      }

      // 不支持的激活事件
      result.errors.push(`不支持的激活事件: "${event}"`);
    }
  }

  /**
   * 检查贡献点（contributes）
   */
  private checkContributions(manifest: IExtensionManifest, result: ICompatibilityResult): void {
    if (!manifest.contributes) {
      return;
    }

    const contributes = manifest.contributes;

    // 检查不支持的贡献点
    const unsupportedContributions = [
      'notebooks',
      'notebookRenderer',
      'customEditors',
      'authentication',
      'timeline'
    ];

    for (const key of Object.keys(contributes)) {
      if (unsupportedContributions.includes(key)) {
        result.errors.push(`不支持的贡献点: "${key}"`);
      }
    }

    // 检查部分支持的贡献点
    if (contributes.webviews) {
      result.warnings.push('Webview 功能需要主进程支持，可能存在限制');
    }

    if (contributes.terminal) {
      result.warnings.push('Terminal 集成部分支持，某些功能可能不可用');
    }
  }

  /**
   * 检测扩展代码中使用的不支持的 API
   */
  private async detectUnsupportedAPIs(manifest: IExtensionManifest, result: ICompatibilityResult): Promise<void> {
    // 这里可以通过静态分析扩展代码来检测不支持的 API
    // 简化实现：基于常见的 API 使用模式进行检测
    
    const unsupportedAPIsFound: string[] = [];

    // 检查贡献点中隐含的 API 使用
    if (manifest.contributes) {
      const contributes = manifest.contributes;
      
      if (contributes.notebooks || contributes.notebookRenderer) {
        unsupportedAPIsFound.push('notebooks');
      }
      
      if (contributes.authentication) {
        unsupportedAPIsFound.push('authentication');
      }
      
      if (contributes.timeline) {
        unsupportedAPIsFound.push('timeline');
      }
      
      if (contributes.testing) {
        unsupportedAPIsFound.push('testing');
      }
    }

    if (unsupportedAPIsFound.length > 0) {
      result.warnings.push(
        `使用了部分未完全实现的 API: ${unsupportedAPIsFound.join(', ')}`
      );
    }
  }

  /**
   * 获取兼容性报告摘要
   */
  getCompatibilitySummary(result: ICompatibilityResult): string {
    if (result.compatible && result.warnings.length === 0) {
      return '✅ 完全兼容';
    }
    
    if (result.compatible && result.warnings.length > 0) {
      return `⚠️ 兼容但有 ${result.warnings.length} 个警告`;
    }
    
    return `❌ 不兼容 (${result.errors.length} 个错误)`;
  }
}



