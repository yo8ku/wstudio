/**
 * 文件功能: 内置AI服务
 * 描述: 提供独立的AI模型服务，使用开发者提供的固定API Key，与用户AI配置完全分离
 */

import { ipcMain } from 'electron';

/**
 * AI提供商配置接口
 */
interface AIProviderConfig {
  name: string;           // 提供商名称（如: OpenAI, Anthropic）
  apiKey: string;         // API密钥
  baseURL: string;        // API基础地址
  modelsEndpoint: string; // 获取模型列表的端点
}

/**
 * 内置AI服务类
 * - 使用固定的开发者API Key
 * - 在启动时自动从真实API获取模型列表
 * - 与用户AI配置（settings.json）完全独立
 */
export class BuiltinAI {
  // 可用的模型列表（格式：配置名:模型名）
  private availableModels: string[] = [];
  
  // 内置服务商配置（统一API地址）
  private readonly builtinProviders: AIProviderConfig[] = [
    {
      name: 'OpenAI',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseURL: 'https://api.gptsapi.net/v1',
      modelsEndpoint: '/models',
    },
    {
      name: 'Claude',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseURL: 'https://api.gptsapi.net/v1',
      modelsEndpoint: '/models',
    },
    {
      name: 'Gemini',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseURL: 'https://api.gptsapi.net/v1',
      modelsEndpoint: '/models',
    },
    {
      name: 'DeepSeek',
      apiKey: 'sk-SUx332ac370a9d78b423d820248126f57763313516ewCexx',
      baseURL: 'https://api.gptsapi.net/v1',
      modelsEndpoint: '/models',
    }
  ];


  constructor() {
    // 注意：不在构造函数中调用 setupIPC()
    // 因为在 electron.js 导入时，app 还没有 ready，ipcMain 可能无法正常工作
    // setupIPC() 将在 initialize() 中调用
  }

  /**
   * 初始化内置AI服务
   * - 注册 IPC 处理器
   * - 从 API 获取真实的模型列表
   */
  async initialize(): Promise<void> {
    console.log('[BuiltinAI] 🚀 初始化内置AI服务...');
    
    // 首先注册 IPC 处理器（必须在 app.whenReady() 之后）
    this.setupIPC();
    
    try {
      await this.fetchModelsFromProviders();
      console.log(`[BuiltinAI] ✅ 初始化完成，共加载 ${this.availableModels.length} 个模型`);
    } catch (error) {
      console.error('[BuiltinAI] ❌ 初始化失败:', error);
      // 即使失败也不阻止应用启动
    }
  }

  /**
   * 从所有服务商 API 获取真实的模型列表
   * 注意：所有提供商使用同一个API，所以只需要请求一次
   */
  private async fetchModelsFromProviders(): Promise<void> {
    console.log(`[BuiltinAI] 📡 开始从 API 获取真实模型列表...`);
    
    try {
      // 使用第一个提供商的配置请求API（因为所有提供商都用同一个API）
      const provider = this.builtinProviders[0];
      const url = `${provider.baseURL}${provider.modelsEndpoint}`;
      
      console.log(`[BuiltinAI] 📡 请求模型列表: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // 解析OpenAI格式的响应
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('API响应格式错误');
      }
      
      const allRawModels = data.data.map((model: any) => model.id || '').filter(Boolean);
      console.log(`[BuiltinAI] 📋 原始模型总数: ${allRawModels.length}`);
      
      const allModels: string[] = [];
      
      // 为每个提供商过滤并添加前缀
      for (const providerConfig of this.builtinProviders) {
        const filteredModels = this.filterModelsByProvider(allRawModels, providerConfig.name);
        console.log(`[BuiltinAI] ✅ ${providerConfig.name}: ${filteredModels.length} 个模型`);
        
        // 添加服务商前缀
        for (const model of filteredModels) {
          allModels.push(`${providerConfig.name}:${model}`);
        }
      }
      
      // 对模型列表进行排序（最新的在前）
      const sortedModels = this.sortModelsByDate(allModels);
      this.availableModels = sortedModels;
      
      console.log(`[BuiltinAI] ✅ 成功加载 ${sortedModels.length} 个真实模型`);
      console.log('[BuiltinAI] 📊 模型列表:', sortedModels);
      
    } catch (error) {
      console.error('[BuiltinAI] ❌ 获取模型列表失败:', error);
      throw error;
    }
  }


  /**
   * 根据服务商名称过滤模型列表
   * 只返回属于该服务商的模型
   */
  private filterModelsByProvider(models: string[], providerName: string): string[] {
    return models.filter((modelId: string) => {
      const lowerModelId = modelId.toLowerCase();
      
      // 首先过滤掉非聊天模型
      if (
        lowerModelId.includes('embedding') ||
        lowerModelId.includes('whisper') ||
        lowerModelId.includes('tts') ||
        lowerModelId.includes('dall-e') ||
        lowerModelId.includes('davinci') ||
        lowerModelId.includes('babbage') ||
        lowerModelId.includes('ada') ||
        lowerModelId.includes('moderation') ||
        lowerModelId.includes('search') ||
        lowerModelId.includes('code-search') ||
        lowerModelId.includes('similarity')
      ) {
        return false;
      }
      
      // 根据服务商名称匹配模型
      switch (providerName.toLowerCase()) {
        case 'openai':
          return lowerModelId.startsWith('gpt-') || 
                 lowerModelId.startsWith('o1') || 
                 lowerModelId.startsWith('o3') ||
                 lowerModelId.includes('chatgpt');
                 
        case 'claude':
          return lowerModelId.includes('claude');
          
        case 'gemini':
          return lowerModelId.includes('gemini');
          
        case 'deepseek':
          return lowerModelId.includes('deepseek');
          
        default:
          return true; // 未知服务商，返回所有模型
      }
    });
  }

  /**
   * 从模型名称中提取日期信息
   * 返回日期时间戳（越大越新）或优先级数字
   */
  private extractModelDate(modelId: string): number {
    const lower = modelId.toLowerCase();
    
    // 匹配日期格式 YYYYMMDD 或 YYYY-MM-DD
    const dateMatch = lower.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const day = parseInt(dateMatch[3]);
      return new Date(year, month - 1, day).getTime();
    }
    
    // 特殊版本号优先级（最新的模型）
    if (lower.includes('gpt-5')) return 9000000000000; // GPT-5 系列最新
    if (lower.includes('gpt-4.1')) return 8900000000000; // GPT-4.1 系列
    if (lower.includes('o3')) return 8800000000000; // O3 系列
    if (lower.includes('o1')) return 8700000000000; // O1 系列
    if (lower.includes('gpt-4o')) return 8600000000000; // GPT-4o 系列
    if (lower.includes('gpt-4-turbo')) return 8500000000000; // GPT-4 Turbo
    if (lower.includes('gpt-4')) return 8400000000000; // GPT-4 系列
    if (lower.includes('gpt-3.5')) return 8300000000000; // GPT-3.5 系列
    
    if (lower.includes('claude-sonnet-4-5')) return 9100000000000; // Claude Sonnet 4.5 最新
    if (lower.includes('claude-opus-4-1')) return 9050000000000; // Claude Opus 4.1
    if (lower.includes('claude-opus-4')) return 9000000000000; // Claude Opus 4
    if (lower.includes('claude-sonnet-4')) return 8900000000000; // Claude Sonnet 4
    if (lower.includes('claude-3-7')) return 8800000000000; // Claude 3.7
    if (lower.includes('claude-3-5')) return 8700000000000; // Claude 3.5
    if (lower.includes('claude-3-opus')) return 8600000000000; // Claude 3 Opus
    if (lower.includes('claude-3-sonnet')) return 8500000000000; // Claude 3 Sonnet
    if (lower.includes('claude-3-haiku')) return 8400000000000; // Claude 3 Haiku
    
    if (lower.includes('gemini-2.5-pro')) return 9000000000000; // Gemini 2.5 Pro
    if (lower.includes('gemini-2.5-flash')) return 8900000000000; // Gemini 2.5 Flash
    if (lower.includes('gemini-2.5')) return 8800000000000; // Gemini 2.5 其他
    if (lower.includes('gemini-2.0')) return 8700000000000; // Gemini 2.0
    if (lower.includes('gemini-1.5')) return 8600000000000; // Gemini 1.5
    if (lower.includes('gemini-1.0')) return 8500000000000; // Gemini 1.0
    
    if (lower.includes('deepseek-r1')) return 9000000000000; // DeepSeek R1
    if (lower.includes('deepseek-v3')) return 8900000000000; // DeepSeek V3
    if (lower.includes('deepseek-v2')) return 8800000000000; // DeepSeek V2
    
    // 默认返回很久以前的时间戳
    return 0;
  }

  /**
   * 对模型列表进行排序，最新的模型排在前面
   */
  private sortModelsByDate(models: string[]): string[] {
    return models.sort((a, b) => {
      // 提取提供商名称和模型ID
      const [providerA, modelA] = a.split(':');
      const [providerB, modelB] = b.split(':');
      
      // 先按提供商分组（保持原有的提供商顺序）
      if (providerA !== providerB) {
        const providerOrder = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek'];
        const indexA = providerOrder.indexOf(providerA);
        const indexB = providerOrder.indexOf(providerB);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      }
      
      // 同一提供商内，按日期降序排序（最新的在前）
      const dateA = this.extractModelDate(modelA);
      const dateB = this.extractModelDate(modelB);
      
      if (dateA !== dateB) {
        return dateB - dateA; // 降序：新的在前
      }
      
      // 日期相同，按字母顺序
      return modelA.localeCompare(modelB);
    });
  }

  /**
   * 调用AI聊天API（流式响应）
   * @param modelId 完整的模型ID（格式：提供商:模型名，如 "OpenAI:gpt-4o"）
   * @param messages 聊天消息列表
   * @param onChunk 接收到流式数据块的回调
   * @param onComplete 完成时的回调
   * @param onError 错误时的回调
   */
  async streamChat(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // 解析模型ID
      const [providerName, actualModelId] = modelId.split(':');
      console.log('[BuiltinAI] 🔍 解析模型ID:', { 原始: modelId, 提供商: providerName, 实际模型: actualModelId });
      
      if (!providerName || !actualModelId) {
        throw new Error(`无效的模型ID格式: ${modelId}`);
      }

      // 查找提供商配置
      const provider = this.builtinProviders.find(p => p.name === providerName);
      if (!provider) {
        throw new Error(`未找到提供商: ${providerName}`);
      }

      console.log(`[BuiltinAI] 💬 开始流式聊天: ${modelId}`);
      console.log('[BuiltinAI] 📝 消息数量:', messages.length);
      console.log('[BuiltinAI] 📤 发送消息:', JSON.stringify(messages, null, 2));

      const url = `${provider.baseURL}/chat/completions`;
      console.log('[BuiltinAI] 🔗 请求 URL:', url);
      console.log('[BuiltinAI] 🔑 使用模型:', actualModelId);
      
      const requestBody = {
        model: actualModelId,
        messages: messages,
        stream: true,
        // 不设置 temperature，使用模型默认值
        // temperature: 1,
      };
      
      console.log('[BuiltinAI] 📦 请求体:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // 尝试读取错误响应的详细信息
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          console.error('[BuiltinAI] ❌ 错误响应体 (原始):', errorBody);
          if (errorBody) {
            errorDetails = errorBody;
            // 尝试解析为JSON以获取更详细的错误信息
            try {
              const errorJson = JSON.parse(errorBody);
              console.error('[BuiltinAI] ❌ 错误详情 (JSON):', JSON.stringify(errorJson, null, 2));
            } catch (e) {
              // 不是JSON，使用原始文本
              console.error('[BuiltinAI] ⚠️ 错误响应不是JSON格式');
            }
          }
        } catch (e) {
          console.error('[BuiltinAI] ❌ 无法读取错误响应:', e);
        }
        console.error(`[BuiltinAI] ❌ API 错误 (${response.status}):`, errorDetails);
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      // 读取流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[BuiltinAI] ✅ 流式响应完成');
          onComplete();
          break;
        }

        // 解码数据块
        buffer += decoder.decode(value, { stream: true });
        
        // 处理 SSE 格式的数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个可能不完整的行

        for (const line of lines) {
          const trimmed = line.trim();
          
          // 跳过空行和注释
          if (!trimmed || trimmed.startsWith(':')) continue;
          
          // 解析 SSE 数据
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            
            // 检查是否结束
            if (data === '[DONE]') {
              continue;
            }

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              console.warn('[BuiltinAI] ⚠️ 解析数据块失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('[BuiltinAI] ❌ 流式聊天失败:', error);
      onError(error as Error);
    }
  }

  /**
   * 调用AI聊天API（非流式响应）
   * @param modelId 完整的模型ID（格式：提供商:模型名）
   * @param messages 聊天消息列表
   * @returns AI响应内容
   */
  async chat(
    modelId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      // 解析模型ID
      const [providerName, actualModelId] = modelId.split(':');
      if (!providerName || !actualModelId) {
        throw new Error(`无效的模型ID格式: ${modelId}`);
      }

      // 查找提供商配置
      const provider = this.builtinProviders.find(p => p.name === providerName);
      if (!provider) {
        throw new Error(`未找到提供商: ${providerName}`);
      }

      console.log(`[BuiltinAI] 💬 开始聊天: ${modelId}`);

      const url = `${provider.baseURL}/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: actualModelId,
          messages: messages,
          stream: false,
          // 不设置 temperature，使用模型默认值
          // temperature: 1,
        }),
      });

      if (!response.ok) {
        // 尝试读取错误响应的详细信息
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails = errorBody;
          }
        } catch (e) {
          // 忽略解析错误
        }
        console.error(`[BuiltinAI] ❌ API 错误 (${response.status}):`, errorDetails);
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      console.log('[BuiltinAI] ✅ 聊天完成');
      return content;
    } catch (error) {
      console.error('[BuiltinAI] ❌ 聊天失败:', error);
      throw error;
    }
  }

  /**
   * 设置IPC通信
   */
  private setupIPC(): void {
    // 获取可用模型列表
    ipcMain.handle('builtin-ai:get-models', () => {
      console.log('[BuiltinAI] 📤 返回模型列表，数量:', this.availableModels.length);
      return this.availableModels;
    });

    // 刷新模型列表（重新从API获取）
    ipcMain.handle('builtin-ai:refresh-models', async () => {
      console.log('[BuiltinAI] 🔄 刷新模型列表...');
      try {
        await this.fetchModelsFromProviders();
        console.log('[BuiltinAI] ✅ 刷新完成');
        return { success: true, models: this.availableModels };
      } catch (error) {
        console.error('[BuiltinAI] ❌ 刷新失败:', error);
        return { success: false, error: String(error) };
      }
    });

    // 聊天接口（非流式）
    ipcMain.handle('builtin-ai:chat', async (_event, modelId: string, messages: Array<{ role: string; content: string }>) => {
      try {
        const response = await this.chat(modelId, messages);
        return { success: true, content: response };
      } catch (error) {
        console.error('[BuiltinAI] ❌ 聊天失败:', error);
        return { success: false, error: String(error) };
      }
    });

    // 流式聊天接口
    ipcMain.handle('builtin-ai:stream-chat', async (event, modelId: string, messages: Array<{ role: string; content: string }>) => {
      return new Promise((resolve) => {
        this.streamChat(
          modelId,
          messages,
          (chunk) => {
            // 发送数据块到渲染进程
            event.sender.send('builtin-ai:stream-chunk', chunk);
          },
          () => {
            // 完成
            event.sender.send('builtin-ai:stream-complete');
            resolve({ success: true });
          },
          (error) => {
            // 错误
            event.sender.send('builtin-ai:stream-error', error.message);
            resolve({ success: false, error: error.message });
          }
        );
      });
    });

    console.log('[BuiltinAI] 📞 IPC handlers 已注册');
  }

  /**
   * 获取当前可用的模型列表
   */
  getAvailableModels(): string[] {
    return [...this.availableModels];
  }
}

