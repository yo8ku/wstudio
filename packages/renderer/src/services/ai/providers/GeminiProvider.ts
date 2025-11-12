/**
 * Google Gemini AI提供商实现
 * 功能：提供Google Gemini API的完整功能，包括推理、工具调用、网络搜索等
 * 描述：支持Gemini系列模型，包括Gemini 2.5 Flash、Gemini 1.5 Pro、Gemini 1.5 Flash等
 * 
 * 安装SDK: npm install @google/genai
 * 官方文档: https://ai.google.dev/gemini-api/docs
 */

import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider } from '../BaseAIProvider';
import { 
  AIProviderConfig, 
  AIModel, 
  AIRequestParams, 
  AIResponse, 
  StreamCallback,
  WebSearchResult,
  WebSearchConfig,
  ModelCapability,
  ToolCall,
  ChatMessage
} from '../../../types/aiProvider';

export class GeminiProvider extends BaseAIProvider {
  private client: GoogleGenAI | null = null;
  
  // 重试配置
  private readonly MAX_RETRIES = 3; // 最大重试次数
  private readonly RETRY_DELAY_MS = 2000; // 重试延迟（毫秒）
  private readonly RETRY_BACKOFF_MULTIPLIER = 1.5; // 重试延迟倍增因子

  constructor() {
    super(
      'gemini',
      'Google Gemini',
      'Gemini',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.VISION,
        ModelCapability.TOOLS,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.WEB_SEARCH
      ]
    );
  }

  // 初始化客户端
  private getClient(): GoogleGenAI {
    if (!this.config.apiKey) {
      throw new Error('Gemini API key is required');
    }

    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: this.config.apiKey
      });
    }

    return this.client;
  }

  /**
   * 检查错误是否可以重试
   * @param error 错误对象
   * @returns 是否可以重试
   */
  private isRetryableError(error: any): boolean {
    // 503 服务不可用
    if (error?.code === 503 || error?.status === 503) {
      return true;
    }
    
    // 检查错误消息中是否包含 "overloaded" 或 "unavailable"
    const errorMessage = (error?.message || '').toLowerCase();
    if (errorMessage.includes('overloaded') || errorMessage.includes('unavailable')) {
      return true;
    }
    
    // 检查嵌套的错误对象
    if (error?.error) {
      const nestedError = error.error;
      if (nestedError.code === 503 || nestedError.status === 'UNAVAILABLE') {
        return true;
      }
      const nestedMessage = (nestedError.message || '').toLowerCase();
      if (nestedMessage.includes('overloaded') || nestedMessage.includes('unavailable')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带重试机制的请求包装器（Gemini专用）
   * @param fn 要执行的异步函数
   * @param context 上下文描述（用于日志）
   * @returns 函数执行结果
   */
  private async withRetryGemini<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // 如果不是第一次尝试，先等待
        if (attempt > 0) {
          const delay = this.RETRY_DELAY_MS * Math.pow(this.RETRY_BACKOFF_MULTIPLIER, attempt - 1);
          console.log(`[Gemini] ${context} - 重试 ${attempt}/${this.MAX_RETRIES}，等待 ${Math.round(delay)}ms...`);
          await this.sleep(delay);
        }
        
        // 执行函数
        return await fn();
      } catch (error) {
        lastError = error;
        
        // 检查是否可以重试
        if (!this.isRetryableError(error)) {
          console.log(`[Gemini] ${context} - 错误不可重试，直接抛出`);
          throw error;
        }
        
        // 如果已经是最后一次尝试，抛出错误
        if (attempt === this.MAX_RETRIES) {
          console.log(`[Gemini] ${context} - 已达到最大重试次数 ${this.MAX_RETRIES}，放弃重试`);
          throw error;
        }
        
        console.log(`[Gemini] ${context} - 遇到可重试错误:`, this.extractGeminiErrorMessage(error, 'Unknown error'));
      }
    }
    
    throw lastError;
  }

  // 提取Gemini SDK错误消息（SDK可能将JSON错误包装在message字段中）
  private extractGeminiErrorMessage(error: any, defaultMessage: string): string {
    if (!error || typeof error !== 'object') {
      return defaultMessage;
    }

    const err = error as any;
    let rawMessage = err.message || err.toString();
    
    // 尝试解析message字段中的JSON
    try {
      if (typeof rawMessage === 'string' && rawMessage.trim().startsWith('{')) {
        const parsed = JSON.parse(rawMessage);
        return parsed.error?.message || parsed.message || rawMessage;
      }
    } catch {
      // 解析失败，返回原始消息
    }
    
    return rawMessage;
  }

  // 获取可用模型列表（使用缓存机制）
  async getAvailableModels(): Promise<AIModel[]> {
    return this.getModelsWithCache(() => this.fetchModelsFromAPI());
  }

  // 从API获取模型列表
  private async fetchModelsFromAPI(): Promise<AIModel[]> {
    try {
      // 使用配置的 apiEndpoint 或默认的 Gemini API 地址
      const baseUrl = this.config.apiEndpoint || 'https://generativelanguage.googleapis.com';
      
      // 使用Gemini REST API获取真实模型列表
      const response = await this.makeRequest(
        `${baseUrl}/v1beta/models?key=${this.config.apiKey}`,
        {
          method: 'GET'
        }
      );

      const data = await response.json();
      const tempModels: AIModel[] = [];
      const modelSet = new Set<string>(); // 用于去重

      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          // 只包含生成模型（gemini开头的模型）
          if (model.name && model.name.includes('gemini')) {
            const modelId = model.name.replace('models/', '');
            
            // 过滤：跳过 TTS 模型
            const lowerModelId = modelId.toLowerCase();
            const lowerDisplayName = (model.displayName || '').toLowerCase();
            if (lowerModelId.includes('tts') || lowerDisplayName.includes('tts')) {
              continue;
            }
            
            // 过滤：跳过包含 latest 的模型
            if (lowerModelId.includes('latest')) {
              continue;
            }
            
            // 过滤：跳过 Nano 和 Banana 模型（不区分大小写，检查 modelId 和 displayName）
            if (lowerModelId.includes('nano') || lowerModelId.includes('banana') ||
                lowerDisplayName.includes('nano') || lowerDisplayName.includes('banana')) {
              continue;
            }
            
            // 过滤：跳过低于 2.0 版本的模型
            const versionMatch = modelId.match(/gemini-(\d+\.?\d*)/);
            if (versionMatch) {
              const version = parseFloat(versionMatch[1]);
              if (version < 2.0) {
                continue;
              }
            }
            
            // 过滤：只保留 Pro、Flash、Flash-Lite、Preview 和工具模型（thinking）
            // 注意：Flash-Lite 必须在 Flash 之前检查，避免误匹配
            const isFlashLiteModel = lowerModelId.includes('-flash-lite') || lowerModelId.includes('flashlite');
            const isFlashModel = !isFlashLiteModel && lowerModelId.includes('-flash');
            const isProModel = lowerModelId.includes('-pro') && !lowerModelId.includes('preview');
            const isPreviewModel = lowerModelId.includes('preview') || lowerModelId.includes('-exp-') || lowerModelId.includes('experimental');
            const isToolModel = lowerModelId.includes('thinking');
            
            if (!isProModel && !isFlashModel && !isFlashLiteModel && !isPreviewModel && !isToolModel) {
              continue;
            }
            
            // 过滤：跳过带有数字后缀的重复模型（如 flash-001, flash-002 等）
            // 只保留不带数字后缀的基础版本和 experimental/preview 版本
            const hasNumberSuffix = lowerModelId.match(/-\d{3,}$/); // 匹配如 -001, -002 等
            if (hasNumberSuffix && !isPreviewModel && !lowerModelId.includes('experimental')) {
              continue;
            }
            
            // 去重：如果已经添加过这个模型ID，则跳过
            if (modelSet.has(modelId)) {
              continue;
            }
            
            const capabilities = this.detectCapabilitiesFromModel(model);
            
            tempModels.push({
              id: modelId,
              name: model.displayName || modelId,
              displayName: model.displayName || modelId,
              provider: this.id,
              capabilities,
              maxTokens: model.inputTokenLimit || 1000000,
              supportsStreaming: true,
              supportsTools: capabilities.includes(ModelCapability.TOOLS),
              supportsVision: capabilities.includes(ModelCapability.VISION),
              supportsFunctionCalling: capabilities.includes(ModelCapability.FUNCTION_CALLING),
              supportsWebSearch: capabilities.includes(ModelCapability.WEB_SEARCH)
            });
            
            modelSet.add(modelId);
          }
        }
      }

      // 过滤预览版本：只保留最新的预览版本
      const models = this.filterPreviewModels(tempModels);
      
      // 如果没有获取到任何模型，返回空数组
      return models;
    } catch (error) {
      console.error('[Gemini] Failed to fetch models:', error);
      // 失败时返回空数组，不使用预定义模型
      return [];
    }
  }

  /**
   * 过滤模型，只保留 Gemini 2.0+ 版本，每个分类只保留最新的一个模型
   * 分类：Pro、Pro Preview、Flash、Flash Preview、Flash-Lite
   */
  private filterPreviewModels(models: AIModel[]): AIModel[] {
    const now = Date.now();
    console.log(`[GeminiProvider] 当前时间: ${new Date(now).toISOString()}`);
    
    // 1. 过滤掉 Gemini 2.0 以下的版本、特殊功能模型和未来日期模型
    const gemini2Plus = models.filter(model => {
      const lowerModelId = model.id.toLowerCase();
      
      // 排除图像生成、机器人等特殊功能模型
      if (lowerModelId.includes('image') || 
          lowerModelId.includes('generation') ||
          lowerModelId.includes('robotics') ||
          lowerModelId.includes('computer-use')) {
        return false;
      }
      
      // 排除 Gemini 1.x 版本
      if (lowerModelId.includes('gemini-1.')) {
        return false;
      }
      
      // 排除虚构的预览模型（如 preview-09-2025 等明显虚构的模型）
      if (lowerModelId.includes('preview-09-2025') || 
          lowerModelId.includes('preview-10-2025') || 
          lowerModelId.includes('preview-11-2025') || 
          lowerModelId.includes('preview-12-2025')) {
        console.log(`[GeminiProvider] 已过滤虚构预览模型: ${model.id}`);
        return false;
      }
      
      // 排除未来日期的模型（虚构模型）
      const modelDate = this.extractModelDate(lowerModelId);
      if (modelDate > 0) {
        console.log(`[GeminiProvider] 检查模型日期: ${model.id}, 提取日期: ${new Date(modelDate).toISOString()}, 是否未来: ${modelDate > now}`);
        if (modelDate > now) {
          console.log(`[GeminiProvider] 已过滤未来模型: ${model.id}`);
          return false;
        }
      }
      
      // 只保留 Gemini 2.0 和 2.5
      return lowerModelId.includes('gemini-2.0') || lowerModelId.includes('gemini-2.5');
    });
    
    // 2. 按分类分组：Pro、Pro Preview、Flash、Flash Preview、Flash-Lite
    const categories = {
      pro: [] as AIModel[],
      proPreview: [] as AIModel[],
      flash: [] as AIModel[],
      flashPreview: [] as AIModel[],
      flashLite: [] as AIModel[]
    };
    
    gemini2Plus.forEach(model => {
      const lowerModelId = model.id.toLowerCase();
      
      // Pro Preview 类别（包含 pro 和 preview 的模型）
      if (lowerModelId.includes('pro') && lowerModelId.includes('preview')) {
        categories.proPreview.push(model);
      }
      // Pro 类别（不包含 preview 的 pro）
      else if (lowerModelId.includes('pro')) {
        categories.pro.push(model);
      }
      // Flash Preview 类别（包含 flash 和 preview，但不是 flash-lite 的模型）
      else if (lowerModelId.includes('flash') && lowerModelId.includes('preview') && !lowerModelId.includes('lite')) {
        categories.flashPreview.push(model);
      }
      // Flash-Lite 类别（包含 flash-lite 的模型，不管是否是 preview）
      else if (lowerModelId.includes('flash-lite')) {
        categories.flashLite.push(model);
      }
      // Flash 类别（不包含 preview 的 flash，但不包括 flash-lite）
      else if (lowerModelId.includes('flash') && !lowerModelId.includes('lite')) {
        categories.flash.push(model);
      }
    });
    
    // 3. 每个分类只保留最新的一个模型
    const result: AIModel[] = [];
    
    Object.entries(categories).forEach(([category, group]) => {
      if (group.length === 0) return;
      
      // 按日期排序，取最新的
      const sorted = group.sort((a, b) => {
        const dateA = this.extractModelDate(a.id);
        const dateB = this.extractModelDate(b.id);
        return dateB - dateA; // 降序，最新的在前
      });
      
      console.log(`[GeminiProvider] 已保留 ${category} 最新模型: ${sorted[0].id}`);
      result.push(sorted[0]);
    });
    
    return result;
  }
  
  /**
   * 提取模型基础名称（用于分组）
   * 例如：gemini-2.5-pro-2024-08-06-preview -> gemini-2.5-pro-preview
   *      gemini-2.5-flash-20240520-preview -> gemini-2.5-flash-preview
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
   * 从模型名称中提取日期信息（用于排序）
   */
  private extractModelDate(modelId: string): number {
    const lower = modelId.toLowerCase();
    
    // 匹配月份-年份格式：preview-MM-YYYY（如 preview-09-2025 或 flash-preview-09-2025）
    const monthYearMatch = lower.match(/preview-(\d{2})-(\d{4})\b/);
    if (monthYearMatch) {
      const month = parseInt(monthYearMatch[1]);
      const year = parseInt(monthYearMatch[2]);
      console.log(`[GeminiProvider] 匹配到月份年份格式: ${modelId} -> ${year}年${month}月`);
      return new Date(year, month - 1, 1).getTime();
    }
    
    // 匹配完整日期格式 YYYY-MM-DD（必须是4位年份开头）
    const fullDateMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (fullDateMatch) {
      const year = parseInt(fullDateMatch[1]);
      const month = parseInt(fullDateMatch[2]);
      const day = parseInt(fullDateMatch[3]);
      return new Date(year, month - 1, day).getTime();
    }
    
    // 匹配 Gemini Preview 格式：preview-MM-DD（如 preview-05-06）
    // 月份必须是 1-12，日必须是 1-31
    const previewDateMatch = lower.match(/preview-(\d{2})-(\d{2})(?!\d)/);
    if (previewDateMatch) {
      const month = parseInt(previewDateMatch[1]);
      const day = parseInt(previewDateMatch[2]);
      // 验证月份和日期的合理性
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        // 使用2025年作为基准年份（因为这些是2025年的预览版）
        return new Date(2025, month - 1, day).getTime();
      }
    }
    
    // 如果没有日期，返回默认值（0表示最旧）
    return 0;
  }

  // 从模型信息中检测能力
  private detectCapabilitiesFromModel(model: any): ModelCapability[] {
    const capabilities: ModelCapability[] = [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.STREAMING
    ];

    // 检查是否支持视觉
    if (model.supportedGenerationMethods?.includes('generateContent')) {
      capabilities.push(ModelCapability.VISION);
    }

    // 检查是否支持工具和函数调用
    if (model.supportedGenerationMethods?.includes('generateContent')) {
      capabilities.push(ModelCapability.TOOLS);
      capabilities.push(ModelCapability.FUNCTION_CALLING);
    }

    // 检查是否支持代码生成
    if (model.name?.includes('pro') || model.name?.includes('flash')) {
      capabilities.push(ModelCapability.CODE_GENERATION);
    }

    // 检查是否支持推理
    if (model.name?.includes('pro') || model.name?.includes('2.')) {
      capabilities.push(ModelCapability.REASONING);
    }

    // 检查是否支持网络搜索（Gemini 2.0+）
    if (model.name?.includes('gemini-2') || model.name?.includes('gemini-exp')) {
      capabilities.push(ModelCapability.WEB_SEARCH);
    }

    return capabilities;
  }

  // 获取模型信息
  async getModelInfo(modelId: string): Promise<AIModel | null> {
    const models = await this.getAvailableModels();
    return models.find(model => model.id === modelId) || null;
  }

  // 检测模型能力
  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    const model = await this.getModelInfo(modelId);
    return model?.capabilities || [ModelCapability.TEXT_GENERATION, ModelCapability.STREAMING];
  }

  // 生成文本
  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      // 使用重试机制包装请求
      return await this.withRetryGemini(async () => {
        const client = this.getClient();
        
        // 构建请求内容
        const contents = this.convertMessagesToContent(params.messages);
        
        // 构建配置
        // ⚠️ Gemini 模型的最大输出限制因模型而异：
        // - Gemini 2.5 Flash/Pro: 8192 tokens
        // - Gemini 1.5 Pro/Flash: 8192 tokens
        // 如果需要更长的输出，请考虑分段请求或使用更高级的模型
        const defaultMaxTokens = 8192;
        const requestedMaxTokens = params.maxTokens ?? this.config.maxTokens ?? defaultMaxTokens;
        
        const config: any = {
          temperature: params.temperature ?? this.config.temperature ?? 0.7,
          maxOutputTokens: requestedMaxTokens
        };

        // 推理配置（Gemini 2.0 Flash Thinking 和 Gemini 2.5 Pro 支持）
        if (params.reasoning?.enabled) {
          console.log('[Gemini] 启用深度推理模式');
          config.thinkingConfig = {
            includeThoughts: true  // 启用思考摘要输出
          };
          
          // 如果用户指定了 thinkingBudget，则添加
          if (params.reasoning.thinkingBudget) {
            config.thinkingConfig.thinkingBudget = params.reasoning.thinkingBudget;
            console.log('[Gemini] 推理预算:', params.reasoning.thinkingBudget, 'tokens');
          }
        }

        console.log('[Gemini] 📝 请求配置:', { 
          model: params.model,
          temperature: config.temperature, 
          maxOutputTokens: config.maxOutputTokens,
          reasoning: params.reasoning?.enabled ? '启用' : '禁用',
          thinkingBudget: params.reasoning?.thinkingBudget || '未设置'
        });

        // 调用Gemini API
        const response = await client.models.generateContent({
          model: params.model,
          contents,
          config
        });

        // 解析响应
        return this.parseGeminiResponse(response, params.model);
      }, 'generateText');
    } catch (error) {
      const errorMessage = this.extractGeminiErrorMessage(error, 'Failed to generate text');
      this.handleError(error, errorMessage);
    }
  }

  // 流式生成文本
  async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    try {
      // 检查是否已被中断
      if (params.signal?.aborted) {
        console.log('[Gemini] 请求已被中断，直接返回');
        return;
      }
      
      // 使用重试机制包装请求
      await this.withRetryGemini(async () => {
        const client = this.getClient();
        
        // 构建请求内容
        const contents = this.convertMessagesToContent(params.messages);
        
        // 构建配置
        // ⚠️ Gemini 模型的最大输出限制因模型而异：
        // - Gemini 2.5 Flash/Pro: 8192 tokens
        // - Gemini 1.5 Pro/Flash: 8192 tokens
        // 如果需要更长的输出，请考虑分段请求或使用更高级的模型
        const defaultMaxTokens = 8192;
        const requestedMaxTokens = params.maxTokens ?? this.config.maxTokens ?? defaultMaxTokens;
        
        const config: any = {
          temperature: params.temperature ?? this.config.temperature ?? 0.7,
          maxOutputTokens: requestedMaxTokens
        };

        // 推理配置（Gemini 2.0 Flash Thinking 和 Gemini 2.5 Pro 支持）
        if (params.reasoning?.enabled) {
          console.log('[Gemini Stream] 启用深度推理模式');
          config.thinkingConfig = {
            includeThoughts: true  // 启用思考摘要输出
          };
          
          // 如果用户指定了 thinkingBudget，则添加
          if (params.reasoning.thinkingBudget) {
            config.thinkingConfig.thinkingBudget = params.reasoning.thinkingBudget;
            console.log('[Gemini Stream] 推理预算:', params.reasoning.thinkingBudget, 'tokens');
          }
        }

        console.log('[Gemini Stream] 📝 请求配置:', { 
          model: params.model,
          temperature: config.temperature, 
          maxOutputTokens: config.maxOutputTokens,
          reasoning: params.reasoning?.enabled ? '启用' : '禁用',
          thinkingBudget: params.reasoning?.thinkingBudget || '未设置'
        });

        // 调用Gemini流式API
        const stream = await client.models.generateContentStream({
          model: params.model,
          contents,
          config
        });

        // 处理流式响应（参考官方流式思考示例）
        let fullText = '';          // 最终答案
        let fullThinking = '';      // 推理摘要
        let thinkingTokenCount = 0;
        let isThinkingStarted = false;
        let isAnswerStarted = false;
        let actualFinishReason: string = 'stop'; // 实际的完成原因
        let lastUsage: any = null;  // 最后的使用情况统计
        
        for await (const chunk of stream) {
          // 检查是否被中断
          if (params.signal?.aborted) {
            console.log('[Gemini] 检测到中断信号，停止处理流式响应');
            break;
          }
          
          if (chunk.candidates?.[0]) {
            const candidate = chunk.candidates[0];
            
            // ✅ 检查完成原因（CRITICAL: 这是响应中断的关键信息）
            if (candidate.finishReason) {
              actualFinishReason = candidate.finishReason;
              console.log('[Gemini] 🏁 流式完成原因:', actualFinishReason);
              
              // 如果是异常完成，记录警告
              if (actualFinishReason !== 'STOP') {
                console.warn('[Gemini] ⚠️ 响应异常结束:', actualFinishReason);
                if (actualFinishReason === 'MAX_TOKENS') {
                  console.warn('[Gemini] 达到最大 token 限制，响应可能不完整');
                } else if (actualFinishReason === 'SAFETY') {
                  console.warn('[Gemini] 触发安全过滤，响应被中断');
                } else if (actualFinishReason === 'RECITATION') {
                  console.warn('[Gemini] 触发引用检测，响应被中断');
                }
              }
            }
            
            // 检查使用情况元数据（可能包含 thoughtsTokenCount）
            const chunkAny = chunk as any;
            if (chunkAny.usageMetadata) {
              lastUsage = chunkAny.usageMetadata; // 保存最新的使用情况
              if (chunkAny.usageMetadata.thoughtsTokenCount) {
                thinkingTokenCount = chunkAny.usageMetadata.thoughtsTokenCount;
                console.log('[Gemini] 推理 Token 数:', thinkingTokenCount);
              }
            }
            
            // 处理 content parts
            const parts = candidate.content?.parts || [];
            
            console.log('[Gemini Debug] 收到 chunk，parts 数量:', parts.length);
            
            for (const part of parts) {
              const partAny = part as any;
              
              console.log('[Gemini Debug] Part 内容:', {
                hasText: !!part.text,
                textLength: part.text?.length || 0,
                hasThought: !!partAny.thought,
                thoughtValue: partAny.thought,
                keys: Object.keys(partAny)
              });
              
              // 先检查是否有文本（跳过 null/undefined/空字符串）
              if (!part.text || part.text.trim() === '') {
                console.log('[Gemini Debug] Part 无文本或文本为空，跳过');
                continue;
              }
              
              // 检查 part.thought 来区分推理和答案
              if (partAny.thought) {
                // ✅ 这是推理摘要内容（Thinking）
                if (!isThinkingStarted) {
                  isThinkingStarted = true;
                  console.log('[Gemini] ✨ 开始接收推理摘要流');
                }
                console.log('[Gemini] 💭 推理片段:', part.text.substring(0, 50) + '...');
                fullThinking += part.text;
                
                console.log('[Gemini Debug] 调用 onReasoning 回调, callback.onReasoning:', typeof callback.onReasoning);
                callback.onReasoning?.(part.text);
              } else {
                // ✅ 这是普通答案内容（Answer）
                if (!isAnswerStarted) {
                  isAnswerStarted = true;
                  console.log('[Gemini] 📝 开始接收答案流');
                  
                  // 如果有推理内容，在答案开始时总结
                  if (fullThinking && thinkingTokenCount > 0) {
                    console.log('[Gemini] ✅ 推理完成，总计', thinkingTokenCount, 'tokens');
                    console.log('[Gemini] 推理摘要长度:', fullThinking.length, '字符');
                  }
                }
                fullText += part.text;
                console.log('[Gemini Debug] 调用 onContent 回调，内容长度:', part.text.length);
                callback.onContent?.(part.text);
              }
            }
          }
          
          // 兼容旧的非 candidates 格式
          const text = chunk.text || '';
          if (text && !chunk.candidates) {
            fullText += text;
            callback.onContent?.(text);
          }
        }
        
        // 流式处理完成后的总结
        if (thinkingTokenCount > 0) {
          if (fullThinking) {
            console.log(`[Gemini] ✅ 流式推理完成 - 推理内容: ${fullThinking.length} 字符, Token 数: ${thinkingTokenCount}`);
          } else {
            console.log(`[Gemini] ⚠️ 检测到推理 Token (${thinkingTokenCount})，但未接收到推理内容`);
          }
        }

        console.log(`[Gemini] 📊 流式响应统计 - 内容长度: ${fullText.length} 字符, 完成原因: ${actualFinishReason}`);

        // ✅ 显示详细的 token 使用情况
        if (lastUsage) {
          const outputTokens = lastUsage.candidatesTokenCount || 0;
          const usageInfo = {
            输入tokens: lastUsage.promptTokenCount || 0,
            输出tokens: outputTokens,
            总tokens: lastUsage.totalTokenCount || 0,
            推理tokens: thinkingTokenCount || 0,
            最大输出限制: requestedMaxTokens
          };
          console.log('[Gemini] 📊 Token 使用情况:', usageInfo);
          
          // ⚠️ 检查是否接近或达到限制
          const usagePercent = (outputTokens / requestedMaxTokens) * 100;
          if (usagePercent >= 95) {
            console.warn(`[Gemini] ⚠️ 输出 tokens (${outputTokens}) 已达到限制的 ${usagePercent.toFixed(1)}%！建议增加 maxTokens 参数`);
          } else if (usagePercent >= 80) {
            console.log(`[Gemini] ℹ️ 输出 tokens 使用率: ${usagePercent.toFixed(1)}%`);
          }
        }

        // 完成回调（使用实际的完成原因）
        callback.onComplete?.({
          content: fullText,
          model: params.model,
          finishReason: actualFinishReason.toLowerCase(), // 转换为小写以保持一致性
          reasoning: fullThinking || undefined
        });
      }, 'generateTextStream');
    } catch (error) {
      // 如果是用户主动中断，不记录错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[Gemini] 流式请求已被用户中断');
        return;
      }
      
      const errorMessage = this.extractGeminiErrorMessage(error, 'Failed to generate text stream');
      this.handleError(error, errorMessage);
    }
  }

  // 网络搜索功能
  async searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    // Gemini 2.5 Flash支持内置网络搜索
    if (config?.enabled !== false) {
      // 使用Gemini的内置搜索功能
      const searchParams: AIRequestParams = {
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: `Search the web for: ${query}`
          }
        ],
        webSearch: {
          enabled: true,
          maxResults: config?.maxResults || 5
        }
      };

      const response = await this.generateText(searchParams);
      return response.webSearchResults || [];
    }

    throw new Error('Web search not enabled for this model');
  }

  // 带网络搜索的生成
  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    const enhancedParams = {
      ...params,
      webSearch: {
        enabled: true,
        maxResults: 5
      }
    };

    return this.generateText(enhancedParams);
  }

  // 带网络搜索的流式生成
  async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    const enhancedParams = {
      ...params,
      webSearch: {
        enabled: true,
        maxResults: 5
      }
    };

    return this.generateTextStream(enhancedParams, callback);
  }

  // 工具调用功能
  async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  // 流式工具调用
  async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  // 测试连接
  async testConnection(): Promise<boolean> {
    try {
      // 使用配置的 apiEndpoint 或默认的 Gemini API 地址
      const baseUrl = this.config.apiEndpoint || 'https://generativelanguage.googleapis.com';
      
      // 使用直接的 HTTP 请求测试连接，而不是 SDK
      // 这样可以验证用户配置的 apiEndpoint 是否正确
      const testUrl = `${baseUrl}/v1beta/models?key=${this.config.apiKey}`;
      
      const response = await this.makeRequest(testUrl, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // 验证响应格式是否正确
      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format from Gemini API');
      }

      this.connectionStatus = 'connected';
      
      // 注意：测试连接时不再自动保存配置，只在用户点击"保存配置"时才保存
      // 这样可以避免重复创建配置记录
      
      return true;
    } catch (error) {
      this.connectionStatus = 'error';
      
      // 测试失败时，清空缓存的模型列表
      this.cachedModels = null;
      
      // 抛出原始错误，让调用方获取服务商返回的具体错误信息
      throw error;
    }
  }

  // SDK辅助方法：转换消息为Gemini内容格式
  private convertMessagesToContent(messages: ChatMessage[]): string {
    return messages
      .map(msg => {
        if (msg.role === 'system') {
          return `System: ${msg.content}`;
        }
        return msg.content;
      })
      .join('\n\n');
  }

  // SDK辅助方法：解析Gemini SDK响应
  private parseGeminiResponse(response: any, model: string): AIResponse {
    console.log('[Gemini] 完整响应:', JSON.stringify(response, null, 2));
    
    // 提取文本内容
    const text = response.text || '';
    
    // 提取推理内容
    let reasoning = '';
    const thoughtsTokenCount = response.thoughtsTokenCount || response.usageMetadata?.thoughtsTokenCount || 0;
    
    // ✅ 提取完成原因
    let finishReason = 'stop';
    if (response.candidates?.[0]?.finishReason) {
      finishReason = response.candidates[0].finishReason.toLowerCase();
      console.log('[Gemini] 完成原因:', finishReason);
      
      // 如果是异常完成，记录警告
      if (finishReason !== 'stop') {
        console.warn('[Gemini] ⚠️ 响应异常结束:', finishReason);
        if (finishReason === 'max_tokens') {
          console.warn('[Gemini] 达到最大 token 限制，响应可能不完整');
        } else if (finishReason === 'safety') {
          console.warn('[Gemini] 触发安全过滤，响应被中断');
        } else if (finishReason === 'recitation') {
          console.warn('[Gemini] 触发引用检测，响应被中断');
        }
      }
    }
    
    // 尝试从 candidates 中提取推理内容
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        console.log('[Gemini] Part:', part);
        
        // 官方文档：检查 part.thought 布尔值来判断是否为推理摘要
        if (part.thought === true && part.text) {
          reasoning += part.text;
          console.log('[Gemini] 发现推理摘要:', part.text);
        }
      }
    }
    
    // 如果有 thoughtsTokenCount 但没有推理内容，说明模型进行了内部推理
    if (thoughtsTokenCount > 0 && !reasoning) {
      console.log(`[Gemini] 模型进行了内部推理 (${thoughtsTokenCount} tokens)，但未返回具体内容`);
    }
    
    return {
      content: text,
      model,
      finishReason,
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0
      } : undefined,
      reasoning: reasoning || (thoughtsTokenCount > 0 ? `模型进行了深度推理 (${thoughtsTokenCount} tokens)` : undefined)
    };
  }

  // 处理流式数据（实现抽象方法，但SDK不使用此方法）
  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
    // 使用SDK时不需要此方法，但必须实现以满足抽象类要求
    // 此方法仅在使用REST API + handleStreamResponse时调用
    console.warn('processStreamData called but Gemini is using SDK streaming');
  }
}