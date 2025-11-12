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
 * - 使用开发者提供的固定API Key（代码内置或环境变量）
 * - 在启动时自动从真实API获取模型列表
 * - 与用户AI配置（settings.json）完全独立
 * 
 * 配置方式（二选一）：
 * 
 * 方式1：代码内置（推荐给开发者分发应用）
 *   - 在 constructor() 中的 BUILTIN_CONFIG 对象填入 API Key
 *   - 优点：用户无需配置，开箱即用
 * 
 * 方式2：环境变量（推荐给开发调试）
 *   - 创建 .env 文件
 *   - 添加：BUILTIN_AI_API_KEY=your-api-key-here
 *   - 添加：BUILTIN_AI_BASE_URL=https://your-api-url.com/v1 (可选)
 *   - 优点：不暴露密钥到代码中
 */
// 用户模型配置信息
interface UserModelInfo {
  modelId: string;           // 格式：提供商:模型名
  configName: string;        // 配置名称
  apiKey: string;            // API密钥
  apiEndpoint: string;       // API端点
  providerId: string;        // 提供商ID
  temperature?: number;      // 温度参数
}

export class BuiltinAI {
  // 可用的模型列表（格式：配置名:模型名）
  private availableModels: string[] = [];
  
  // 用户配置的模型列表（从渲染进程同步过来）
  private userConfiguredModels: string[] = [];
  
  // 用户配置的模型详细信息（用于实际调用API）
  private userModelConfigs: Map<string, UserModelInfo> = new Map();
  
  // 从环境变量读取配置
  private readonly builtinApiKey: string;
  private readonly builtinBaseUrl: string;
  
  // 内置服务商配置（统一API地址）
  private readonly builtinProviders: AIProviderConfig[];

  constructor() {
    // ==================== 内置模型配置 ====================
    // 开发者提供的固定API Key和Base URL（独立于用户配置）
    // 用户无需配置，直接可用
    const BUILTIN_CONFIG = {
      apiKey: 'sk-your-builtin-api-key-here',  // 在这里填入你的API密钥
      baseUrl: 'https://api.openai.com/v1',     // 在这里填入你的API地址
    };
    // ====================================================
    
    // 从环境变量读取API配置（如果设置了环境变量则优先使用）
    this.builtinApiKey = process.env.BUILTIN_AI_API_KEY || BUILTIN_CONFIG.apiKey;
    this.builtinBaseUrl = process.env.BUILTIN_AI_BASE_URL || BUILTIN_CONFIG.baseUrl;
    
    // 初始化提供商配置
    this.builtinProviders = [
      {
        name: 'OpenAI',
        apiKey: this.builtinApiKey,
        baseURL: this.builtinBaseUrl,
        modelsEndpoint: '/models',
      },
      {
        name: 'Claude',
        apiKey: this.builtinApiKey,
        baseURL: this.builtinBaseUrl,
        modelsEndpoint: '/models',
      },
      {
        name: 'Gemini',
        apiKey: this.builtinApiKey,
        baseURL: this.builtinBaseUrl,
        modelsEndpoint: '/models',
      },
      {
        name: 'DeepSeek',
        apiKey: this.builtinApiKey,
        baseURL: this.builtinBaseUrl,
        modelsEndpoint: '/models',
      }
    ];
    
    // 检查API key是否已配置
    if (!this.builtinApiKey || this.builtinApiKey === 'sk-your-builtin-api-key-here') {
      console.warn('[BuiltinAI]  未配置内置AI的API密钥');
      console.warn('[BuiltinAI] 请在代码中设置 BUILTIN_CONFIG.apiKey');
      console.warn('[BuiltinAI] 或在 .env 文件中设置 BUILTIN_AI_API_KEY');
      console.warn('[BuiltinAI] 内置AI功能将不可用，但不影响应用正常运行');
    } else {
      console.log('[BuiltinAI]  已加载内置AI配置');
      console.log('[BuiltinAI] Base URL:', this.builtinBaseUrl);
      console.log('[BuiltinAI] 配置来源:', process.env.BUILTIN_AI_API_KEY ? '环境变量' : '代码内置');
    }
  }

  /**
   * 初始化内置AI服务
   * - 注册 IPC 处理器
   * - 从 API 获取真实的模型列表（如果配置了API key）
   */
  async initialize(): Promise<void> {
    console.log('[BuiltinAI]  初始化内置AI服务...');
    
    // 首先注册 IPC 处理器（必须在 app.whenReady() 之后）
    this.setupIPC();
    
    // 检查是否配置了API key
    if (!this.builtinApiKey || this.builtinApiKey === 'sk-your-builtin-api-key-here') {
      console.log('[BuiltinAI]  未配置API密钥，跳过模型列表获取');
      console.log('[BuiltinAI] 内置AI服务初始化完成（但功能不可用）');
      console.log('[BuiltinAI] 提示：用户可以在设置中配置自己的AI模型');
      return;
    }
    
    try {
      await this.fetchModelsFromProviders();
      console.log(`[BuiltinAI]  初始化完成，共加载 ${this.availableModels.length} 个模型`);
    } catch (error) {
      console.error('[BuiltinAI]  初始化失败:', error);
      console.error('[BuiltinAI] 请检查：');
      console.error('[BuiltinAI] 1. API密钥是否正确');
      console.error('[BuiltinAI] 2. 网络连接是否正常');
      console.error('[BuiltinAI] 3. API地址是否可访问');
      // 即使失败也不阻止应用启动
    }
  }

  /**
   * 从所有服务商 API 获取真实的模型列表
   * 注意：所有提供商使用同一个API，所以只需要请求一次
   */
  private async fetchModelsFromProviders(): Promise<void> {
    console.log(`[BuiltinAI] 开始从 API 获取真实模型列表...`);
    
    try {
      // 使用第一个提供商的配置请求API（因为所有提供商都用同一个API）
      const provider = this.builtinProviders[0];
      const url = `${provider.baseURL}${provider.modelsEndpoint}`;
      
      console.log(`[BuiltinAI] 请求模型列表: ${url}`);
      
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
      console.log(`[BuiltinAI] 原始模型总数: ${allRawModels.length}`);
      
      const allModels: string[] = [];
      
      // 为每个提供商过滤并添加前缀
      for (const providerConfig of this.builtinProviders) {
        const filteredModels = this.filterModelsByProvider(allRawModels, providerConfig.name);
        console.log(`[BuiltinAI]  ${providerConfig.name}: ${filteredModels.length} 个模型`);
        
        // 添加服务商前缀
        for (const model of filteredModels) {
          allModels.push(`${providerConfig.name}:${model}`);
        }
      }
      
      // 对模型列表进行排序（最新的在前）
      const sortedModels = this.sortModelsByDate(allModels);
      this.availableModels = sortedModels;
      
      console.log(`[BuiltinAI]  成功加载 ${sortedModels.length} 个真实模型`);
      console.log('[BuiltinAI] 模型列表:', sortedModels);
      
    } catch (error) {
      console.error('[BuiltinAI]  获取模型列表失败:', error);
      throw error;
    }
  }


  /**
   * 根据服务商名称过滤模型列表
   * 只返回属于该服务商的模型
   */
  private filterModelsByProvider(models: string[], providerName: string): string[] {
    const filtered = models.filter((modelId: string) => {
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
      
      // 过滤掉包含 latest 的模型
      if (lowerModelId.includes('latest')) {
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
    
    // 过滤预览版本：只保留最新的预览版本
    return this.filterPreviewModels(filtered);
  }
  
  /**
   * 过滤预览版本模型，只保留最新的预览版本
   * 对于每个模型系列（如 gpt-4o, claude-3-opus 等），只保留一个最新的预览版本
   */
  private filterPreviewModels(models: string[]): string[] {
    // 将模型分为预览版本和非预览版本
    const previewModels: string[] = [];
    const nonPreviewModels: string[] = [];
    
    models.forEach(modelId => {
      const lowerModelId = modelId.toLowerCase();
      if (lowerModelId.includes('preview') || lowerModelId.includes('exp-') || lowerModelId.includes('experimental')) {
        previewModels.push(modelId);
      } else {
        nonPreviewModels.push(modelId);
      }
    });
    
    // 如果没有预览版本，直接返回
    if (previewModels.length === 0) {
      return nonPreviewModels;
    }
    
    // 按模型系列分组预览版本
    const previewGroups = new Map<string, string[]>();
    
    previewModels.forEach(modelId => {
      // 提取模型基础名称（去掉日期、预览标记等后缀）
      const baseName = this.extractModelBaseName(modelId);
      
      if (!previewGroups.has(baseName)) {
        previewGroups.set(baseName, []);
      }
      previewGroups.get(baseName)!.push(modelId);
    });
    
    // 对每个组，只保留最新的一个预览版本
    const latestPreviews: string[] = [];
    previewGroups.forEach((group, baseName) => {
      // 按日期排序，取最新的
      const sorted = group.sort((a, b) => {
        const dateA = this.extractModelDate(a);
        const dateB = this.extractModelDate(b);
        return dateB - dateA; // 降序，最新的在前
      });
      
      latestPreviews.push(sorted[0]);
    });
    
    // 返回非预览版本 + 最新的预览版本
    return [...nonPreviewModels, ...latestPreviews];
  }
  
  /**
   * 提取模型基础名称（用于分组）
   * 例如：gpt-4o-2024-08-06-preview -> gpt-4o-preview
   *      claude-3-opus-20240229-preview -> claude-3-opus-preview
   */
  private extractModelBaseName(modelId: string): string {
    const lower = modelId.toLowerCase();
    
    // 移除日期部分
    let baseName = lower.replace(/\d{4}-?\d{2}-?\d{2}/g, '');
    
    // 移除多余的连字符
    baseName = baseName.replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    return baseName;
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
      console.log('[BuiltinAI]  解析模型ID:', { 原始: modelId, 提供商: providerName, 实际模型: actualModelId });
      
      if (!providerName || !actualModelId) {
        throw new Error(`无效的模型ID格式: ${modelId}`);
      }

      console.log(`[BuiltinAI] 开始流式聊天: ${modelId}`);

      // 首先检查是否为用户配置的模型
      const userConfig = this.userModelConfigs.get(modelId);
      
      let apiKey: string;
      let baseURL: string;
      let temperature: number | undefined;

      if (userConfig) {
        // 使用用户配置
        console.log(`[BuiltinAI] 使用用户配置: ${userConfig.configName}`);
        console.log(`[BuiltinAI] 原始 API 端点: ${userConfig.apiEndpoint}`);
        apiKey = userConfig.apiKey;
        baseURL = userConfig.apiEndpoint.replace(/\/chat\/completions$/, ''); // 移除端点后缀
        console.log(`[BuiltinAI] 处理后的 baseURL: ${baseURL}`);
        temperature = userConfig.temperature;
      } else {
        // 使用内置配置
        const provider = this.builtinProviders.find(p => p.name === providerName);
        if (!provider) {
          throw new Error(`未找到提供商: ${providerName}`);
        }
        console.log(`[BuiltinAI] 使用内置配置: ${providerName}`);
        apiKey = provider.apiKey;
        baseURL = provider.baseURL;
      }

      const url = `${baseURL}/chat/completions`;
      console.log('[BuiltinAI] 最终请求 URL:', url);
      console.log('[BuiltinAI] 请求模型:', actualModelId);
      console.log('[BuiltinAI]  消息数量:', messages.length);
      
      const requestBody: any = {
        model: actualModelId,
        messages: messages,
        stream: true,
      };

      // 如果有温度参数，添加它
      if (temperature !== undefined) {
        requestBody.temperature = temperature;
      }
      
      console.log('[BuiltinAI] 请求体:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // 尝试读取错误响应的详细信息
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          console.error('[BuiltinAI]  错误响应体 (原始):', errorBody);
          if (errorBody) {
            errorDetails = errorBody;
            // 尝试解析为JSON以获取更详细的错误信息
            try {
              const errorJson = JSON.parse(errorBody);
              console.error('[BuiltinAI]  错误详情 (JSON):', JSON.stringify(errorJson, null, 2));
            } catch (e) {
              // 不是JSON，使用原始文本
              console.error('[BuiltinAI]  错误响应不是JSON格式');
            }
          }
        } catch (e) {
          console.error('[BuiltinAI]  无法读取错误响应:', e);
        }
        console.error(`[BuiltinAI]  API 错误 (${response.status}):`, errorDetails);
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
          console.log('[BuiltinAI]  流式响应完成');
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
              console.warn('[BuiltinAI]  解析数据块失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('[BuiltinAI]  流式聊天失败:', error);
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

      console.log(`[BuiltinAI] 开始聊天: ${modelId}`);

      // 首先检查是否为用户配置的模型
      const userConfig = this.userModelConfigs.get(modelId);
      
      let apiKey: string;
      let baseURL: string;
      let temperature: number | undefined;

      if (userConfig) {
        // 使用用户配置
        console.log(`[BuiltinAI] 使用用户配置: ${userConfig.configName}`);
        console.log(`[BuiltinAI] 原始 API 端点: ${userConfig.apiEndpoint}`);
        apiKey = userConfig.apiKey;
        baseURL = userConfig.apiEndpoint.replace(/\/chat\/completions$/, ''); // 移除端点后缀
        console.log(`[BuiltinAI] 处理后的 baseURL: ${baseURL}`);
        temperature = userConfig.temperature;
      } else {
        // 使用内置配置
        const provider = this.builtinProviders.find(p => p.name === providerName);
        if (!provider) {
          throw new Error(`未找到提供商: ${providerName}`);
        }
        console.log(`[BuiltinAI] 使用内置配置: ${providerName}`);
        apiKey = provider.apiKey;
        baseURL = provider.baseURL;
      }

      const url = `${baseURL}/chat/completions`;
      console.log(`[BuiltinAI] 最终请求 URL: ${url}`);
      console.log(`[BuiltinAI] 请求模型: ${actualModelId}`);
      
      const requestBody: any = {
        model: actualModelId,
        messages: messages,
        stream: false,
      };

      // 如果有温度参数，添加它
      if (temperature !== undefined) {
        requestBody.temperature = temperature;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
        console.error(`[BuiltinAI]  API 错误 (${response.status}):`, errorDetails);
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      console.log('[BuiltinAI]  聊天完成');
      return content;
    } catch (error) {
      console.error('[BuiltinAI]  聊天失败:', error);
      throw error;
    }
  }

  /**
   * 设置IPC通信
   */
  private setupIPC(): void {
    console.log('[BuiltinAI] 开始设置 IPC 处理器...');
    
    // 移除已存在的处理器（避免重复注册）
    try {
      ipcMain.removeHandler('builtin-ai:get-models');
      ipcMain.removeHandler('builtin-ai:update-user-models');
      ipcMain.removeHandler('builtin-ai:update-user-model-configs');
      ipcMain.removeHandler('builtin-ai:refresh-models');
      ipcMain.removeHandler('builtin-ai:chat');
      ipcMain.removeHandler('builtin-ai:stream-chat');
      console.log('[BuiltinAI] 已清理旧的 IPC 处理器');
    } catch (error) {
      console.log('[BuiltinAI] 无旧处理器需要清理（首次注册）');
    }
    
    // 获取可用模型列表（合并内置模型和用户配置的模型）
    ipcMain.handle('builtin-ai:get-models', () => {
      const allModels = [...this.availableModels, ...this.userConfiguredModels];
      console.log('[BuiltinAI] 返回模型列表，数量:', allModels.length);
      console.log('[BuiltinAI]   - 内置模型:', this.availableModels.length);
      console.log('[BuiltinAI]   - 用户配置模型:', this.userConfiguredModels.length);
      return allModels;
    });
    console.log('[BuiltinAI]  已注册 builtin-ai:get-models');

    // 更新用户配置的模型列表（从渲染进程同步）
    ipcMain.handle('builtin-ai:update-user-models', async (_event, models: string[]) => {
      console.log('[BuiltinAI] 更新用户配置模型列表，数量:', models.length);
      console.log('[BuiltinAI] 模型列表:', models);
      this.userConfiguredModels = models;
      return { success: true, count: models.length };
    });
    console.log('[BuiltinAI]  已注册 builtin-ai:update-user-models');

    // 更新用户配置的模型详细信息（从渲染进程同步）
    ipcMain.handle('builtin-ai:update-user-model-configs', async (_event, configs: UserModelInfo[]) => {
      console.log('[BuiltinAI] 更新用户模型配置信息，数量:', configs.length);
      this.userModelConfigs.clear();
      configs.forEach(config => {
        this.userModelConfigs.set(config.modelId, config);
      });
      console.log('[BuiltinAI]  用户模型配置已更新');
      return { success: true, count: configs.length };
    });
    console.log('[BuiltinAI]  已注册 builtin-ai:update-user-model-configs');

    // 刷新模型列表（重新从API获取）
    ipcMain.handle('builtin-ai:refresh-models', async () => {
      console.log('[BuiltinAI] 刷新模型列表...');
      try {
        await this.fetchModelsFromProviders();
        console.log('[BuiltinAI]  刷新完成');
        const allModels = [...this.availableModels, ...this.userConfiguredModels];
        return { success: true, models: allModels };
      } catch (error) {
        console.error('[BuiltinAI]  刷新失败:', error);
        return { success: false, error: String(error) };
      }
    });
    console.log('[BuiltinAI]  已注册 builtin-ai:refresh-models');

    // 聊天接口（非流式）
    ipcMain.handle('builtin-ai:chat', async (_event, modelId: string, messages: Array<{ role: string; content: string }>) => {
      try {
        const response = await this.chat(modelId, messages);
        return { success: true, content: response };
      } catch (error) {
        console.error('[BuiltinAI]  聊天失败:', error);
        return { success: false, error: String(error) };
      }
    });
    console.log('[BuiltinAI]  已注册 builtin-ai:chat');

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
    console.log('[BuiltinAI]  已注册 builtin-ai:stream-chat');
    
    console.log('[BuiltinAI] 所有 IPC 处理器注册完成！');

    console.log('[BuiltinAI] IPC handlers 已注册');
  }

  /**
   * 获取当前可用的模型列表
   */
  getAvailableModels(): string[] {
    return [...this.availableModels];
  }
}

