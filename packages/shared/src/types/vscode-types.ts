/**
 * 类型定义
 */

export interface VSCodeExtension {
  id: string;
  extensionPath: string;
  isActive: boolean;
  packageJSON: any;
  exports: any;
}

export interface VSCodeCommand {
  command: string;
  title: string;
  category?: string;
  icon?: string;
}

export interface VSCodeConfiguration {
  title: string;
  properties: Record<string, ConfigurationProperty>;
}

export interface ConfigurationProperty {
  type: string | string[];
  default?: any;
  description?: string;
  enum?: any[];
  scope?: 'application' | 'machine' | 'window' | 'resource';
}



