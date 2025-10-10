/**
 * ExtensionHostManager 使用示例
 * 展示如何运行 VSCode 插件
 */

import { ExtensionHostManager } from './ExtensionHostManager';
import * as path from 'path';

/**
 * 示例：启动和管理 VSCode 扩展
 */
export async function runExtensionExample() {
  // 1. 创建扩展宿主管理器
  const manager = new ExtensionHostManager();

  // 2. ⭐ 设置 VSCode API 调用处理器
  manager.setAPICallHandler(async (namespace, method, args) => {
    console.log(`[API调用] ${namespace}.${method}`, args);

    // 处理不同的 API 命名空间
    switch (namespace) {
      case 'window':
        return handleWindowAPI(method, args);
      
      case 'workspace':
        return handleWorkspaceAPI(method, args);
      
      case 'commands':
        return handleCommandsAPI(method, args);
      
      default:
        throw new Error(`不支持的 API 命名空间: ${namespace}`);
    }
  });

  // 3. 监听扩展事件
  manager.on('extension-event', ({ extensionId, event, data }) => {
    console.log(`[扩展事件] ${extensionId}: ${event}`, data);
  });

  manager.on('extension-error', ({ extensionId, error }) => {
    console.error(`[扩展错误] ${extensionId}:`, error);
  });

  manager.on('host-exit', ({ extensionId, code, signal }) => {
    console.log(`[宿主退出] ${extensionId}, 代码: ${code}, 信号: ${signal}`);
  });

  // 4. 启动扩展宿主进程并激活扩展
  try {
    const extensionPath = path.join(__dirname, '../../../extensions/markdown-all-in-one');
    
    await manager.startExtensionHost('markdown-all-in-one', extensionPath);
    
    console.log('✅ 扩展已成功激活！');
    
    // 5. 查看活动的扩展
    const activeHosts = manager.getActiveHosts();
    console.log('活动的扩展宿主:', activeHosts);

    // 6. 停用扩展（可选）
    // await manager.deactivateExtension('markdown-all-in-one');

    // 7. 终止扩展宿主进程（可选）
    // await manager.terminateHost('markdown-all-in-one');

  } catch (error) {
    console.error('❌ 启动扩展失败:', error);
  }
}

/**
 * 处理 window API 调用
 */
async function handleWindowAPI(method: string, args: any[]): Promise<any> {
  switch (method) {
    case 'showInformationMessage':
      console.log('📢 信息提示:', args[0]);
      return args[0]; // 返回消息内容
    
    case 'showWarningMessage':
      console.warn('⚠️ 警告提示:', args[0]);
      return args[0];
    
    case 'showErrorMessage':
      console.error('❌ 错误提示:', args[0]);
      return args[0];
    
    case 'showQuickPick':
      // 返回第一个选项
      return args[0]?.[0];
    
    case 'showInputBox':
      // 返回默认值
      return args[0]?.value || '';
    
    case 'createOutputChannel':
      // 返回一个模拟的输出通道
      return {
        name: args[0],
        append: (text: string) => console.log(`[输出] ${text}`),
        appendLine: (text: string) => console.log(`[输出] ${text}`),
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {},
      };
    
    default:
      console.warn(`未实现的 window API: ${method}`);
      return undefined;
  }
}

/**
 * 处理 workspace API 调用
 */
async function handleWorkspaceAPI(method: string, args: any[]): Promise<any> {
  switch (method) {
    case 'getConfiguration':
      // 返回配置对象
      return {
        get: (key: string, defaultValue?: any) => defaultValue,
        has: (key: string) => false,
        inspect: (key: string) => undefined,
        update: async (key: string, value: any) => {},
      };
    
    case 'getWorkspaceFolder':
      // 返回工作区文件夹
      return {
        uri: { fsPath: process.cwd() },
        name: 'workspace',
        index: 0,
      };
    
    case 'findFiles':
      // 返回空数组
      return [];
    
    default:
      console.warn(`未实现的 workspace API: ${method}`);
      return undefined;
  }
}

/**
 * 处理 commands API 调用
 */
async function handleCommandsAPI(method: string, args: any[]): Promise<any> {
  switch (method) {
    case 'registerCommand':
      console.log(`📝 注册命令: ${args[0]}`);
      return { dispose: () => {} };
    
    case 'executeCommand':
      console.log(`▶️ 执行命令: ${args[0]}`);
      return undefined;
    
    default:
      console.warn(`未实现的 commands API: ${method}`);
      return undefined;
  }
}

/**
 * 批量管理多个扩展
 */
export async function runMultipleExtensions() {
  const manager = new ExtensionHostManager();

  // 设置 API 处理器
  manager.setAPICallHandler(async (namespace, method, args) => {
    // 统一的 API 处理逻辑
    console.log(`[API] ${namespace}.${method}`, args);
    return undefined;
  });

  // 要加载的扩展列表
  const extensions = [
    {
      id: 'markdown-preview',
      path: path.join(__dirname, '../../../extensions/markdown-preview'),
    },
    {
      id: 'git-integration',
      path: path.join(__dirname, '../../../extensions/git-integration'),
    },
  ];

  // 并行启动多个扩展
  await Promise.all(
    extensions.map(ext => 
      manager.startExtensionHost(ext.id, ext.path)
        .catch(err => console.error(`启动 ${ext.id} 失败:`, err))
    )
  );

  console.log('活动的扩展宿主:', manager.getActiveHosts());

  // 清理：终止所有扩展
  // await manager.terminateAll();
}

/**
 * 主函数
 */
export async function main() {
  console.log('🚀 ExtensionHostManager 示例');
  console.log('================================\n');

  // 运行单个扩展示例
  await runExtensionExample();

  // 或运行多个扩展示例
  // await runMultipleExtensions();
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}











