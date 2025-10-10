/**
 * VSCode 适配器模块导出
 */

// 主题加载器
export { 
  VSCodeThemeLoader,
  ITheme,
  ThemeColors,
  TokenColor,
  VSCodeThemeData
} from './ThemeLoader';

// 其他适配器
export { VSCodeExtensionAdapter } from './VSCodeExtensionAdapter';
export { VSIXInstaller, InstallResult } from './VSIXInstaller';
export { PackageJsonParser } from './PackageJsonParser';
export { ActivationEventHandler } from './ActivationEventHandler';
export { ContributionPointsHandler } from './ContributionPointsHandler';










