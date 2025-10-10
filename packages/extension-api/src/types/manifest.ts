/**
 * 扩展清单类型定义
 */

export interface ExtensionManifest {
  name: string;
  displayName?: string;
  version: string;
  publisher?: string;
  description?: string;
  main?: string;
  engines?: {
    vscode?: string;
    noteStudio?: string;
  };
  activationEvents?: string[];
  contributes?: {
    commands?: CommandContribution[];
    configuration?: ConfigurationContribution;
    keybindings?: KeybindingContribution[];
    languages?: LanguageContribution[];
    themes?: ThemeContribution[];
  };
}

export interface CommandContribution {
  command: string;
  title: string;
  category?: string;
}

export interface ConfigurationContribution {
  title?: string;
  properties?: Record<string, any>;
}

export interface KeybindingContribution {
  command: string;
  key: string;
  when?: string;
}

export interface LanguageContribution {
  id: string;
  extensions?: string[];
  configuration?: string;
}

export interface ThemeContribution {
  label: string;
  uiTheme: 'vs' | 'vs-dark';
  path: string;
}



