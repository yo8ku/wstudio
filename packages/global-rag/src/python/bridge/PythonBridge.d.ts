/**
 * Python 服务桥接器
 * 用于 TypeScript 与 Python 服务之间的通信
 * 支持 Node.js 环境（直接启动 Python 进程）和浏览器环境（通过 IPC）
 */
import { PythonServiceRequest, PythonServiceResponse } from '../../types.js';
export declare class PythonBridge {
    private process;
    private stdoutBuffer;
    private isReady;
    private requestQueue;
    private currentRequest;
    private dependencyCheckCache;
    private dependencyCheckInProgress;
    constructor();
    /**
     * 检测是否应该使用 IPC（运行时动态检测）
     */
    private shouldUseIPC;
    /**
     * 使用临时文件执行 Python 脚本（避免 Windows 上的换行符问题）
     */
    private executePythonScript;
    /**
     * 检查并安装 Python 依赖（公共方法，用于应用启动时静默后台执行）
     * 使用缓存机制，确保只检查一次
     */
    checkAndInstallDependencies(): Promise<void>;
    /**
     * 确保 Python 依赖已安装（内部方法）
     */
    private ensureDependenciesInstalled;
    /**
     * 启动 Python 服务
     */
    start(): Promise<void>;
    /**
     * 停止 Python 服务
     */
    stop(): Promise<void>;
    /**
     * 发送请求到 Python 服务
     */
    request(req: PythonServiceRequest): Promise<PythonServiceResponse>;
    /**
     * 发送请求
     */
    private sendRequest;
    /**
     * 清理请求对象，处理可能导致JSON序列化失败的内容
     * 注意：这个方法不应该手动转义，因为 JSON.stringify 会自动处理
     * 但我们需要确保字符串中没有无效的转义序列和控制字符
     */
    private sanitizeRequestForJSON;
    /**
     * 处理下一个请求
     */
    /**
     * 清理搜索结果中的文本数据，确保编码正确
     */
    private cleanSearchResults;
    private processNextRequest;
    /**
     * 检查服务是否就绪
     */
    isServiceReady(): boolean;
}
//# sourceMappingURL=PythonBridge.d.ts.map