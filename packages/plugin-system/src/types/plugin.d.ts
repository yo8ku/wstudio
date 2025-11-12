/**
 * 插件系统 - 插件类型定义
 * 定义插件的基础接口、元数据、生命周期等
 */
/**
 * 插件元数据
 */
export interface PluginMetadata {
    /** 插件唯一标识 */
    id: string;
    /** 插件名称 */
    name: string;
    /** 插件版本 */
    version: string;
    /** 插件描述 */
    description?: string;
    /** 插件作者 */
    author?: string;
    /** 插件主页 */
    homepage?: string;
    /** 插件依赖 */
    dependencies?: Record<string, string>;
    /** 插件图标 */
    icon?: string;
    /** 插件分类 */
    category?: string;
    /** 插件关键词 */
    keywords?: string[];
}
/**
 * 插件配置
 */
export interface PluginConfig {
    /** 是否启用插件 */
    enabled: boolean;
    /** 插件配置项 */
    settings?: Record<string, any>;
    /** 插件权限 */
    permissions?: PluginPermissions;
}
/**
 * 插件权限
 */
export interface PluginPermissions {
    /** 文件系统访问 */
    filesystem?: boolean;
    /** 网络访问 */
    network?: boolean;
    /** 系统命令执行 */
    command?: boolean;
    /** UI修改 */
    ui?: boolean;
}
/**
 * 插件状态
 */
export declare enum PluginState {
    /** 未加载 */
    Unloaded = "unloaded",
    /** 加载中 */
    Loading = "loading",
    /** 已加载 */
    Loaded = "loaded",
    /** 激活中 */
    Activating = "activating",
    /** 已激活 */
    Activated = "activated",
    /** 停用中 */
    Deactivating = "deactivating",
    /** 已停用 */
    Deactivated = "deactivated",
    /** 错误 */
    Error = "error"
}
/**
 * 可释放资源接口
 */
export interface Disposable {
    dispose(): void;
}
/**
 * 插件上下文
 */
export interface PluginContext {
    /** 插件元数据 */
    metadata: PluginMetadata;
    /** 插件根目录 */
    rootPath: string;
    /** 插件存储路径 */
    storagePath: string;
    /** 插件全局状态 */
    globalState: any;
    /** 插件工作区状态 */
    workspaceState: any;
    /** 订阅列表 - 用于管理插件创建的资源 */
    subscriptions: Disposable[];
}
/**
 * 插件实例
 */
export interface Plugin {
    /** 插件元数据 */
    metadata: PluginMetadata;
    /** 插件配置 */
    config: PluginConfig;
    /** 插件状态 */
    state: PluginState;
    /** 插件上下文 */
    context: PluginContext;
    /** 插件激活函数 */
    activate?(context: PluginContext): Promise<void> | void;
    /** 插件停用函数 */
    deactivate?(): Promise<void> | void;
}
/**
 * 插件加载器接口
 */
export interface PluginLoader {
    /** 加载插件 */
    load(pluginPath: string): Promise<Plugin>;
    /** 卸载插件 */
    unload(pluginId: string): Promise<void>;
    /** 重新加载插件 */
    reload(pluginId: string): Promise<void>;
}
//# sourceMappingURL=plugin.d.ts.map