/**
 * CompatibilityService 使用示例
 */

import { CompatibilityService, IExtensionManifest, ICompatibilityResult } from './CompatibilityService';

async function exampleUsage() {
  const service = new CompatibilityService();

  // 示例 1: 完全兼容的扩展
  const compatibleExtension: IExtensionManifest = {
    name: 'my-extension',
    version: '1.0.0',
    displayName: 'My Extension',
    engines: {
      vscode: '^1.75.0'
    },
    activationEvents: [
      'onLanguage:typescript',
      'onCommand:myExtension.helloWorld'
    ],
    contributes: {
      commands: [
        {
          command: 'myExtension.helloWorld',
          title: 'Hello World'
        }
      ]
    }
  };

  const result1 = await service.checkCompatibility(compatibleExtension);
  console.log('示例 1 - 完全兼容的扩展:');
  console.log('兼容:', result1.compatible);
  console.log('警告:', result1.warnings);
  console.log('错误:', result1.errors);
  console.log('摘要:', service.getCompatibilitySummary(result1));
  console.log('---\n');

  // 示例 2: 有警告的扩展（使用了部分支持的功能）
  const extensionWithWarnings: IExtensionManifest = {
    name: 'webview-extension',
    version: '1.0.0',
    engines: {
      vscode: '^1.90.0'  // 版本较高
    },
    activationEvents: [
      'onWebviewPanel:catCoding'  // 部分支持
    ],
    contributes: {
      webviews: []  // 需要主进程支持
    }
  };

  const result2 = await service.checkCompatibility(extensionWithWarnings);
  console.log('示例 2 - 有警告的扩展:');
  console.log('兼容:', result2.compatible);
  console.log('警告:', result2.warnings);
  console.log('错误:', result2.errors);
  console.log('摘要:', service.getCompatibilitySummary(result2));
  console.log('---\n');

  // 示例 3: 不兼容的扩展（使用了不支持的功能）
  const incompatibleExtension: IExtensionManifest = {
    name: 'notebook-extension',
    version: '1.0.0',
    engines: {
      vscode: '^1.85.0'
    },
    activationEvents: [
      'onNotebook:jupyter-notebook'  // 不支持
    ],
    contributes: {
      notebooks: [],  // 不支持
      authentication: []  // 不支持
    }
  };

  const result3 = await service.checkCompatibility(incompatibleExtension);
  console.log('示例 3 - 不兼容的扩展:');
  console.log('兼容:', result3.compatible);
  console.log('警告:', result3.warnings);
  console.log('错误:', result3.errors);
  console.log('摘要:', service.getCompatibilitySummary(result3));
  console.log('---\n');

  // 示例 4: 版本检查
  const oldVersionExtension: IExtensionManifest = {
    name: 'old-extension',
    version: '1.0.0',
    engines: {
      vscode: '^1.50.0'  // 旧版本
    }
  };

  const result4 = await service.checkCompatibility(oldVersionExtension);
  console.log('示例 4 - 旧版本扩展:');
  console.log('兼容:', result4.compatible);
  console.log('警告:', result4.warnings);
  console.log('错误:', result4.errors);
  console.log('摘要:', service.getCompatibilitySummary(result4));
  console.log('---\n');

  // 示例 5: 没有指定版本的扩展
  const noVersionExtension: IExtensionManifest = {
    name: 'no-version-extension',
    version: '1.0.0',
    // 没有 engines 字段
  };

  const result5 = await service.checkCompatibility(noVersionExtension);
  console.log('示例 5 - 没有指定版本的扩展:');
  console.log('兼容:', result5.compatible);
  console.log('警告:', result5.warnings);
  console.log('错误:', result5.errors);
  console.log('摘要:', service.getCompatibilitySummary(result5));
}

// 运行示例
if (require.main === module) {
  exampleUsage().catch(console.error);
}

export { exampleUsage };













