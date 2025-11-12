/**
 * 文件功能: 内置AI服务 - 渲染进程侧
 * 描述: 通过IPC与主进程通信，调用内置AI模型
 */

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 流式聊天回调接口
 */
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

/**
 * 内置AI服务类（渲染进程侧）
 */
class BuiltinAIService {
  private static instance: BuiltinAIService;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): BuiltinAIService {
    if (!BuiltinAIService.instance) {
      BuiltinAIService.instance = new BuiltinAIService();
    }
    return BuiltinAIService.instance;
  }

  /**
   * 获取可用的模型列表
   */
  async getModels(): Promise<string[]> {
    try {
      if (!window.electron) {
        throw new Error('Electron API not available');
      }
      const models = await window.electron.ipcRenderer.invoke('builtin-ai:get-models');
      console.log('[BuiltinAIService] 获取模型列表:', models.length);
      return models;
    } catch (error) {
      console.error('[BuiltinAIService] 获取模型列表失败:', error);
      return [];
    }
  }

  /**
   * 刷新模型列表
   */
  async refreshModels(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      if (!window.electron) {
        throw new Error('Electron API not available');
      }
      const result = await window.electron.ipcRenderer.invoke('builtin-ai:refresh-models');
      return result;
    } catch (error) {
      console.error('[BuiltinAIService] 刷新模型列表失败:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 聊天接口（非流式）
   * @param modelId 完整的模型ID（格式：提供商/模型名）
   * @param messages 聊天消息列表
   * @returns AI响应内容
   */
  async chat(modelId: string, messages: ChatMessage[]): Promise<string> {
    try {
      console.log(`[BuiltinAIService] 开始聊天: ${modelId}`, messages);
      
      if (!window.electron) {
        throw new Error('Electron API not available');
      }
      
      const result = await window.electron.ipcRenderer.invoke(
        'builtin-ai:chat',
        modelId,
        messages
      );

      if (!result.success) {
        throw new Error(result.error || '未知错误');
      }

      return result.content;
    } catch (error) {
      console.error('[BuiltinAIService] 聊天失败:', error);
      throw error;
    }
  }

  /**
   * 流式聊天接口
   * @param modelId 完整的模型ID（格式：提供商/模型名）
   * @param messages 聊天消息列表
   * @param callbacks 流式回调函数
   */
  async streamChat(
    modelId: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    try {
      console.log(`[BuiltinAIService] 开始流式聊天: ${modelId}`, messages);

      // 注册流式响应监听器
      const chunkListener = (_event: any, chunk: string) => {
        callbacks.onChunk(chunk);
      };

      const completeListener = () => {
        callbacks.onComplete();
        // 清理监听器
        this.removeStreamListeners(chunkListener, completeListener, errorListener);
      };

      const errorListener = (_event: any, error: string) => {
        callbacks.onError(error);
        // 清理监听器
        this.removeStreamListeners(chunkListener, completeListener, errorListener);
      };

      if (!window.electron) {
        throw new Error('Electron API not available');
      }
      
      // 添加监听器
      window.electron.ipcRenderer.on('builtin-ai:stream-chunk', chunkListener);
      window.electron.ipcRenderer.on('builtin-ai:stream-complete', completeListener);
      window.electron.ipcRenderer.on('builtin-ai:stream-error', errorListener);

      // 调用IPC
      const result = await window.electron.ipcRenderer.invoke(
        'builtin-ai:stream-chat',
        modelId,
        messages
      );

      // 检查是否立即失败
      if (!result.success) {
        callbacks.onError(result.error || '未知错误');
        this.removeStreamListeners(chunkListener, completeListener, errorListener);
      }
    } catch (error) {
      console.error('[BuiltinAIService] 流式聊天失败:', error);
      callbacks.onError(String(error));
    }
  }

  /**
   * 移除流式监听器
   */
  private removeStreamListeners(
    chunkListener: any,
    completeListener: any,
    errorListener: any
  ): void {
    if (!window.electron) {
      return;
    }
    window.electron.ipcRenderer.removeListener('builtin-ai:stream-chunk', chunkListener);
    window.electron.ipcRenderer.removeListener('builtin-ai:stream-complete', completeListener);
    window.electron.ipcRenderer.removeListener('builtin-ai:stream-error', errorListener);
  }

  /**
   * 简化的聊天接口，用于代码生成
   * @param modelId 模型ID
   * @param prompt 用户提示
   * @param context 可选的上下文信息（如选中的代码）
   * @param systemPrompt 可选的系统提示
   */
  async generateCode(
    modelId: string,
    prompt: string,
    context?: string,
    systemPrompt?: string
  ): Promise<string> {
    const messages: ChatMessage[] = [];

    // 添加系统提示
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    } else {
      messages.push({
        role: 'system',
        content: '你是一个专业的编程助手，帮助用户编写高质量的代码。请只返回代码，不要包含额外的解释。',
      });
    }

    // 添加上下文
    let userMessage = prompt;
    if (context) {
      userMessage = `以下是相关的代码上下文：\n\`\`\`\n${context}\n\`\`\`\n\n${prompt}`;
    }

    messages.push({
      role: 'user',
      content: userMessage,
    });

    return this.chat(modelId, messages);
  }

  /**
   * 流式代码生成
   */
  async streamGenerateCode(
    modelId: string,
    prompt: string,
    callbacks: StreamCallbacks,
    context?: string,
    systemPrompt?: string
  ): Promise<void> {
    const messages: ChatMessage[] = [];

    // 添加系统提示
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    } else {
      messages.push({
        role: 'system',
        content: '你是一个专业的编程助手，帮助用户编写高质量的代码。请只返回代码，不要包含额外的解释。',
      });
    }

    // 添加上下文
    let userMessage = prompt;
    if (context) {
      userMessage = `以下是相关的代码上下文：\n\`\`\`\n${context}\n\`\`\`\n\n${prompt}`;
    }

    messages.push({
      role: 'user',
      content: userMessage,
    });

    return this.streamChat(modelId, messages, callbacks);
  }
}

// 导出单例实例
export const builtinAI = BuiltinAIService.getInstance();


