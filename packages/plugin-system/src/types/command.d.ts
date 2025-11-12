/**
 * 插件系统 - 命令类型定义
 * 定义命令系统的接口、命令类型等
 */
/**
 * 命令处理器
 */
export type CommandHandler<T = any> = (...args: any[]) => T | Promise<T>;
/**
 * 命令定义
 */
export interface Command {
    /** 命令ID */
    id: string;
    /** 命令标题 */
    title: string;
    /** 命令描述 */
    description?: string;
    /** 命令分类 */
    category?: string;
    /** 命令快捷键 */
    keybinding?: Keybinding;
    /** 命令图标 */
    icon?: string;
    /** 命令处理器 */
    handler: CommandHandler;
}
/**
 * 快捷键定义
 */
export interface Keybinding {
    /** 按键组合 (e.g., "Ctrl+Shift+P") */
    key: string;
    /** Mac平台按键组合 */
    mac?: string;
    /** 执行条件 */
    when?: string;
}
/**
 * 命令执行上下文
 */
export interface CommandContext {
    /** 命令ID */
    commandId: string;
    /** 执行参数 */
    args: any[];
    /** 执行来源 */
    source?: string;
}
/**
 * 可释放资源接口
 */
export interface CommandDisposable {
    dispose(): void;
}
/**
 * 命令注册器接口
 */
export interface CommandRegistry {
    /** 注册命令 */
    registerCommand(command: Command): CommandDisposable;
    /** 取消注册命令 */
    unregisterCommand(commandId: string): void;
    /** 执行命令 */
    executeCommand<T = any>(commandId: string, ...args: any[]): Promise<T>;
    /** 获取所有命令 */
    getCommands(): Command[];
    /** 获取命令 */
    getCommand(commandId: string): Command | undefined;
}
//# sourceMappingURL=command.d.ts.map