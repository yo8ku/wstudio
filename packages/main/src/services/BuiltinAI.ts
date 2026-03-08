/**
 * 鏂囦欢鍔熻兘: 鍐呯疆AI鏈嶅姟
 * 鎻忚堪: 鎻愪緵鐙珛鐨凙I妯″瀷鏈嶅姟锛屼娇鐢ㄥ紑鍙戣€呮彁渚涚殑鍥哄畾API Key锛屼笌鐢ㄦ埛AI閰嶇疆瀹屽叏鍒嗙
 */

import { ipcMain } from 'electron';

/**
 * AI鎻愪緵鍟嗛厤缃帴鍙?
 */
interface AIProviderConfig {
  name: string;           // 鎻愪緵鍟嗗悕绉帮紙濡? OpenAI, Anthropic锛?
  apiKey: string;         // API瀵嗛挜
  baseURL: string;        // API鍩虹鍦板潃
  modelsEndpoint: string; // 鑾峰彇妯″瀷鍒楄〃鐨勭鐐?
}

/**
 * 鍐呯疆AI鏈嶅姟绫?
 * - 浣跨敤寮€鍙戣€呮彁渚涚殑鍥哄畾API Key锛堜唬鐮佸唴缃垨鐜鍙橀噺锛?
 * - 鍦ㄥ惎鍔ㄦ椂鑷姩浠庣湡瀹濧PI鑾峰彇妯″瀷鍒楄〃
 * - 涓庣敤鎴稟I閰嶇疆锛坰ettings.json锛夊畬鍏ㄧ嫭绔?
 * 
 * 閰嶇疆鏂瑰紡锛堜簩閫変竴锛夛細
 * 
 * 鏂瑰紡1锛氫唬鐮佸唴缃紙鎺ㄨ崘缁欏紑鍙戣€呭垎鍙戝簲鐢級
 *   - 鍦?constructor() 涓殑 BUILTIN_CONFIG 瀵硅薄濉叆 API Key
 *   - 浼樼偣锛氱敤鎴锋棤闇€閰嶇疆锛屽紑绠卞嵆鐢?
 * 
 * 鏂瑰紡2锛氱幆澧冨彉閲忥紙鎺ㄨ崘缁欏紑鍙戣皟璇曪級
 *   - 鍒涘缓 .env 鏂囦欢
 *   - 娣诲姞锛欱UILTIN_AI_API_KEY=your-api-key-here
 *   - 娣诲姞锛欱UILTIN_AI_BASE_URL=https://your-api-url.com/v1 (鍙€?
 *   - 浼樼偣锛氫笉鏆撮湶瀵嗛挜鍒颁唬鐮佷腑
 */
// 鐢ㄦ埛妯″瀷閰嶇疆淇℃伅
interface UserModelInfo {
  modelId: string;           // 鏍煎紡锛氭彁渚涘晢:妯″瀷鍚?
  configName: string;        // 閰嶇疆鍚嶇О
  apiKey: string;            // API瀵嗛挜
  apiEndpoint: string;       // API绔偣
  providerId: string;        // 鎻愪緵鍟咺D
  temperature?: number;      // 娓╁害鍙傛暟
}

function normalizeApiEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }

  if (trimmed.includes('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`.replace(/\/+$/, '');
  }

  return `https://${trimmed}`.replace(/\/+$/, '');
}

function resolveChatEndpoint(apiEndpoint: string, providerId?: string): string {
  const endpoint = normalizeApiEndpoint(apiEndpoint);
  if (!endpoint) {
    return '';
  }

  if (
    endpoint.includes('/chat/completions')
    || endpoint.includes('/messages')
    || endpoint.endsWith('/responses')
  ) {
    return endpoint;
  }

  const normalizedProviderId = providerId?.trim().toLowerCase() ?? '';
  if (normalizedProviderId === 'anthropic' || endpoint.includes('anthropic.com')) {
    return `${endpoint}/messages`;
  }

  try {
    const url = new URL(endpoint);
    if (url.pathname === '/' || url.pathname === '') {
      return `${endpoint}/v1/chat/completions`;
    }
  } catch {
    // Fall through to the generic suffix handling below.
  }

  return `${endpoint}/chat/completions`;
}

export class BuiltinAI {
  // 鍙敤鐨勬ā鍨嬪垪琛紙鏍煎紡锛氶厤缃悕:妯″瀷鍚嶏級
  private availableModels: string[] = [];
  
  // 鐢ㄦ埛閰嶇疆鐨勬ā鍨嬪垪琛紙浠庢覆鏌撹繘绋嬪悓姝ヨ繃鏉ワ級
  private userConfiguredModels: string[] = [];
  
  // 鐢ㄦ埛閰嶇疆鐨勬ā鍨嬭缁嗕俊鎭紙鐢ㄤ簬瀹為檯璋冪敤API锛?
  private userModelConfigs: Map<string, UserModelInfo> = new Map();
  
  // 浠庣幆澧冨彉閲忚鍙栭厤缃?
  private readonly builtinApiKey: string;
  private readonly builtinBaseUrl: string;
  
  // 鍐呯疆鏈嶅姟鍟嗛厤缃紙缁熶竴API鍦板潃锛?
  private readonly builtinProviders: AIProviderConfig[];

  constructor() {
    // ==================== 鍐呯疆妯″瀷閰嶇疆 ====================
    // 寮€鍙戣€呮彁渚涚殑鍥哄畾API Key鍜孊ase URL锛堢嫭绔嬩簬鐢ㄦ埛閰嶇疆锛?
    // 鐢ㄦ埛鏃犻渶閰嶇疆锛岀洿鎺ュ彲鐢?
    const BUILTIN_CONFIG = {
      apiKey: 'sk-your-builtin-api-key-here',  // 鍦ㄨ繖閲屽～鍏ヤ綘鐨凙PI瀵嗛挜
      baseUrl: 'https://api.openai.com/v1',     // 鍦ㄨ繖閲屽～鍏ヤ綘鐨凙PI鍦板潃
    };
    // ====================================================
    
    // 浠庣幆澧冨彉閲忚鍙朅PI閰嶇疆锛堝鏋滆缃簡鐜鍙橀噺鍒欎紭鍏堜娇鐢級
    this.builtinApiKey = process.env.BUILTIN_AI_API_KEY || BUILTIN_CONFIG.apiKey;
    this.builtinBaseUrl = process.env.BUILTIN_AI_BASE_URL || BUILTIN_CONFIG.baseUrl;
    
    // 鍒濆鍖栨彁渚涘晢閰嶇疆
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
    
    // 妫€鏌PI key鏄惁宸查厤缃?
    if (!this.builtinApiKey || this.builtinApiKey === 'sk-your-builtin-api-key-here') {
      console.warn('[BuiltinAI]  鏈厤缃唴缃瓵I鐨凙PI瀵嗛挜');
      console.warn('[BuiltinAI] 璇峰湪浠ｇ爜涓缃?BUILTIN_CONFIG.apiKey');
      console.warn('[BuiltinAI] 鎴栧湪 .env 鏂囦欢涓缃?BUILTIN_AI_API_KEY');
      console.warn('[BuiltinAI] Builtin AI is unavailable, but the app can still run.');
    } else {
      console.log('[BuiltinAI]  宸插姞杞藉唴缃瓵I閰嶇疆');
      console.log('[BuiltinAI] Base URL:', this.builtinBaseUrl);
      console.log('[BuiltinAI] 閰嶇疆鏉ユ簮:', process.env.BUILTIN_AI_API_KEY ? '鐜鍙橀噺' : '浠ｇ爜鍐呯疆');
    }
  }

  /**
   * 鍒濆鍖栧唴缃瓵I鏈嶅姟
   * - 娉ㄥ唽 IPC 澶勭悊鍣?
   * - 浠?API 鑾峰彇鐪熷疄鐨勬ā鍨嬪垪琛紙濡傛灉閰嶇疆浜咥PI key锛?
   */
  async initialize(): Promise<void> {
    console.log('[BuiltinAI]  鍒濆鍖栧唴缃瓵I鏈嶅姟...');
    
    // 棣栧厛娉ㄥ唽 IPC 澶勭悊鍣紙蹇呴』鍦?app.whenReady() 涔嬪悗锛?
    this.setupIPC();
    
    // 妫€鏌ユ槸鍚﹂厤缃簡API key
    if (!this.builtinApiKey || this.builtinApiKey === 'sk-your-builtin-api-key-here') {
      console.log('[BuiltinAI] API key is not configured, skipping builtin model fetch.');
      console.log('[BuiltinAI] Builtin AI initialized without available builtin features.');
      console.log('[BuiltinAI] 鎻愮ず锛氱敤鎴峰彲浠ュ湪璁剧疆涓厤缃嚜宸辩殑AI妯″瀷');
      return;
    }
    
    try {
      await this.fetchModelsFromProviders();
      console.log(`[BuiltinAI] Initialization completed, loaded ${this.availableModels.length} models.`);
    } catch (error) {
      console.error('[BuiltinAI]  鍒濆鍖栧け璐?', error);
      console.error('[BuiltinAI] 璇锋鏌ワ細');
      console.error('[BuiltinAI] 1. API瀵嗛挜鏄惁姝ｇ‘');
      console.error('[BuiltinAI] 2. 缃戠粶杩炴帴鏄惁姝ｅ父');
      console.error('[BuiltinAI] 3. Check whether the API endpoint is reachable.');
      // 鍗充娇澶辫触涔熶笉闃绘搴旂敤鍚姩
    }
  }

  /**
   * 浠庢墍鏈夋湇鍔″晢 API 鑾峰彇鐪熷疄鐨勬ā鍨嬪垪琛?
   * 娉ㄦ剰锛氭墍鏈夋彁渚涘晢浣跨敤鍚屼竴涓狝PI锛屾墍浠ュ彧闇€瑕佽姹備竴娆?
   */
  private async fetchModelsFromProviders(): Promise<void> {
    console.log(`[BuiltinAI] 寮€濮嬩粠 API 鑾峰彇鐪熷疄妯″瀷鍒楄〃...`);
    
    try {
      // 浣跨敤绗竴涓彁渚涘晢鐨勯厤缃姹侫PI锛堝洜涓烘墍鏈夋彁渚涘晢閮界敤鍚屼竴涓狝PI锛?
      const provider = this.builtinProviders[0];
      const url = `${provider.baseURL}${provider.modelsEndpoint}`;
      
      console.log(`[BuiltinAI] 璇锋眰妯″瀷鍒楄〃: ${url}`);
      
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
      
      // 瑙ｆ瀽OpenAI鏍煎紡鐨勫搷搴?
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('API鍝嶅簲鏍煎紡閿欒');
      }
      
      const allRawModels = data.data.map((model: any) => model.id || '').filter(Boolean);
      console.log(`[BuiltinAI] 鍘熷妯″瀷鎬绘暟: ${allRawModels.length}`);
      
      const allModels: string[] = [];
      
      // 涓烘瘡涓彁渚涘晢杩囨护骞舵坊鍔犲墠缂€
      for (const providerConfig of this.builtinProviders) {
        const filteredModels = this.filterModelsByProvider(allRawModels, providerConfig.name);
        console.log(`[BuiltinAI] ${providerConfig.name}: ${filteredModels.length} models`);
        
        // 娣诲姞鏈嶅姟鍟嗗墠缂€
        for (const model of filteredModels) {
          allModels.push(`${providerConfig.name}:${model}`);
        }
      }
      
      // 瀵规ā鍨嬪垪琛ㄨ繘琛屾帓搴忥紙鏈€鏂扮殑鍦ㄥ墠锛?
      const sortedModels = this.sortModelsByDate(allModels);
      this.availableModels = sortedModels;
      
      console.log(`[BuiltinAI] Successfully loaded ${sortedModels.length} models.`);
      console.log('[BuiltinAI] 妯″瀷鍒楄〃:', sortedModels);
      
    } catch (error) {
      console.error('[BuiltinAI]  鑾峰彇妯″瀷鍒楄〃澶辫触:', error);
      throw error;
    }
  }


  /**
   * 鏍规嵁鏈嶅姟鍟嗗悕绉拌繃婊ゆā鍨嬪垪琛?
   * 鍙繑鍥炲睘浜庤鏈嶅姟鍟嗙殑妯″瀷
   */
  private filterModelsByProvider(models: string[], providerName: string): string[] {
    const filtered = models.filter((modelId: string) => {
      const lowerModelId = modelId.toLowerCase();
      
      // 棣栧厛杩囨护鎺夐潪鑱婂ぉ妯″瀷
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
      
      // 杩囨护鎺夊寘鍚?latest 鐨勬ā鍨?
      if (lowerModelId.includes('latest')) {
        return false;
      }
      
      // 鏍规嵁鏈嶅姟鍟嗗悕绉板尮閰嶆ā鍨?
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
          return true; // 鏈煡鏈嶅姟鍟嗭紝杩斿洖鎵€鏈夋ā鍨?
      }
    });
    
    // 杩囨护棰勮鐗堟湰锛氬彧淇濈暀鏈€鏂扮殑棰勮鐗堟湰
    return this.filterPreviewModels(filtered);
  }
  
  /**
   * 杩囨护棰勮鐗堟湰妯″瀷锛屽彧淇濈暀鏈€鏂扮殑棰勮鐗堟湰
   * 瀵逛簬姣忎釜妯″瀷绯诲垪锛堝 gpt-4o, claude-3-opus 绛夛級锛屽彧淇濈暀涓€涓渶鏂扮殑棰勮鐗堟湰
   */
  private filterPreviewModels(models: string[]): string[] {
    // 灏嗘ā鍨嬪垎涓洪瑙堢増鏈拰闈為瑙堢増鏈?
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
    
    // 濡傛灉娌℃湁棰勮鐗堟湰锛岀洿鎺ヨ繑鍥?
    if (previewModels.length === 0) {
      return nonPreviewModels;
    }
    
    // 鎸夋ā鍨嬬郴鍒楀垎缁勯瑙堢増鏈?
    const previewGroups = new Map<string, string[]>();
    
    previewModels.forEach(modelId => {
      // 鎻愬彇妯″瀷鍩虹鍚嶇О锛堝幓鎺夋棩鏈熴€侀瑙堟爣璁扮瓑鍚庣紑锛?
      const baseName = this.extractModelBaseName(modelId);
      
      if (!previewGroups.has(baseName)) {
        previewGroups.set(baseName, []);
      }
      previewGroups.get(baseName)!.push(modelId);
    });
    
    // 瀵规瘡涓粍锛屽彧淇濈暀鏈€鏂扮殑涓€涓瑙堢増鏈?
    const latestPreviews: string[] = [];
    previewGroups.forEach((group, baseName) => {
      // 鎸夋棩鏈熸帓搴忥紝鍙栨渶鏂扮殑
      const sorted = group.sort((a, b) => {
        const dateA = this.extractModelDate(a);
        const dateB = this.extractModelDate(b);
        return dateB - dateA; // 闄嶅簭锛屾渶鏂扮殑鍦ㄥ墠
      });
      
      latestPreviews.push(sorted[0]);
    });
    
    // 杩斿洖闈為瑙堢増鏈?+ 鏈€鏂扮殑棰勮鐗堟湰
    return [...nonPreviewModels, ...latestPreviews];
  }
  
  /**
   * 鎻愬彇妯″瀷鍩虹鍚嶇О锛堢敤浜庡垎缁勶級
   * 渚嬪锛歡pt-4o-2024-08-06-preview -> gpt-4o-preview
   *      claude-3-opus-20240229-preview -> claude-3-opus-preview
   */
  private extractModelBaseName(modelId: string): string {
    const lower = modelId.toLowerCase();
    
    // 绉婚櫎鏃ユ湡閮ㄥ垎
    let baseName = lower.replace(/\d{4}-?\d{2}-?\d{2}/g, '');
    
    // 绉婚櫎澶氫綑鐨勮繛瀛楃
    baseName = baseName.replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    return baseName;
  }

  /**
   * 浠庢ā鍨嬪悕绉颁腑鎻愬彇鏃ユ湡淇℃伅
   * 杩斿洖鏃ユ湡鏃堕棿鎴筹紙瓒婂ぇ瓒婃柊锛夋垨浼樺厛绾ф暟瀛?
   */
  private extractModelDate(modelId: string): number {
    const lower = modelId.toLowerCase();
    
    // 鍖归厤鏃ユ湡鏍煎紡 YYYYMMDD 鎴?YYYY-MM-DD
    const dateMatch = lower.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const day = parseInt(dateMatch[3]);
      return new Date(year, month - 1, day).getTime();
    }
    
    // 鐗规畩鐗堟湰鍙蜂紭鍏堢骇锛堟渶鏂扮殑妯″瀷锛?
    if (lower.includes('gpt-5')) return 9000000000000; // GPT-5 绯诲垪鏈€鏂?
    if (lower.includes('gpt-4.1')) return 8900000000000; // GPT-4.1 绯诲垪
    if (lower.includes('o3')) return 8800000000000; // O3 绯诲垪
    if (lower.includes('o1')) return 8700000000000; // O1 绯诲垪
    if (lower.includes('gpt-4o')) return 8600000000000; // GPT-4o 绯诲垪
    if (lower.includes('gpt-4-turbo')) return 8500000000000; // GPT-4 Turbo
    if (lower.includes('gpt-4')) return 8400000000000; // GPT-4 绯诲垪
    if (lower.includes('gpt-3.5')) return 8300000000000; // GPT-3.5 绯诲垪
    
    if (lower.includes('claude-sonnet-4-5')) return 9100000000000; // Claude Sonnet 4.5 鏈€鏂?
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
    if (lower.includes('gemini-2.5')) return 8800000000000; // Gemini 2.5 鍏朵粬
    if (lower.includes('gemini-2.0')) return 8700000000000; // Gemini 2.0
    if (lower.includes('gemini-1.5')) return 8600000000000; // Gemini 1.5
    if (lower.includes('gemini-1.0')) return 8500000000000; // Gemini 1.0
    
    if (lower.includes('deepseek-r1')) return 9000000000000; // DeepSeek R1
    if (lower.includes('deepseek-v3')) return 8900000000000; // DeepSeek V3
    if (lower.includes('deepseek-v2')) return 8800000000000; // DeepSeek V2
    
    // 榛樿杩斿洖寰堜箙浠ュ墠鐨勬椂闂存埑
    return 0;
  }

  /**
   * 瀵规ā鍨嬪垪琛ㄨ繘琛屾帓搴忥紝鏈€鏂扮殑妯″瀷鎺掑湪鍓嶉潰
   */
  private sortModelsByDate(models: string[]): string[] {
    return models.sort((a, b) => {
      // 鎻愬彇鎻愪緵鍟嗗悕绉板拰妯″瀷ID
      const [providerA, modelA] = a.split(':');
      const [providerB, modelB] = b.split(':');
      
      // 鍏堟寜鎻愪緵鍟嗗垎缁勶紙淇濇寔鍘熸湁鐨勬彁渚涘晢椤哄簭锛?
      if (providerA !== providerB) {
        const providerOrder = ['OpenAI', 'Claude', 'Gemini', 'DeepSeek'];
        const indexA = providerOrder.indexOf(providerA);
        const indexB = providerOrder.indexOf(providerB);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      }
      
      // 鍚屼竴鎻愪緵鍟嗗唴锛屾寜鏃ユ湡闄嶅簭鎺掑簭锛堟渶鏂扮殑鍦ㄥ墠锛?
      const dateA = this.extractModelDate(modelA);
      const dateB = this.extractModelDate(modelB);
      
      if (dateA !== dateB) {
        return dateB - dateA; // 闄嶅簭锛氭柊鐨勫湪鍓?
      }
      
      // 鏃ユ湡鐩稿悓锛屾寜瀛楁瘝椤哄簭
      return modelA.localeCompare(modelB);
    });
  }

  /**
   * 璋冪敤AI鑱婂ぉAPI锛堟祦寮忓搷搴旓級
   * @param modelId 瀹屾暣鐨勬ā鍨婭D锛堟牸寮忥細鎻愪緵鍟?妯″瀷鍚嶏紝濡?"OpenAI:gpt-4o"锛?
   * @param messages 鑱婂ぉ娑堟伅鍒楄〃
   * @param onChunk 鎺ユ敹鍒版祦寮忔暟鎹潡鐨勫洖璋?
   * @param onComplete 瀹屾垚鏃剁殑鍥炶皟
   * @param onError 閿欒鏃剁殑鍥炶皟
   */
  async streamChat(
    modelId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      // 瑙ｆ瀽妯″瀷ID
      const [providerName, actualModelId] = modelId.split(':');
      console.log('[BuiltinAI] Parsed modelId:', { rawModelId: modelId, providerName, actualModelId });
      
      if (!providerName || !actualModelId) {
        throw new Error(`鏃犳晥鐨勬ā鍨婭D鏍煎紡: ${modelId}`);
      }

      console.log(`[BuiltinAI] 寮€濮嬫祦寮忚亰澶? ${modelId}`);

      // 棣栧厛妫€鏌ユ槸鍚︿负鐢ㄦ埛閰嶇疆鐨勬ā鍨?
      const userConfig = this.userModelConfigs.get(modelId);
      
      let apiKey: string;
      let requestUrl: string;
      let temperature: number | undefined;

      if (userConfig) {
        // 浣跨敤鐢ㄦ埛閰嶇疆
        console.log(`[BuiltinAI] 浣跨敤鐢ㄦ埛閰嶇疆: ${userConfig.configName}`);
        console.log(`[BuiltinAI] 鍘熷 API 绔偣: ${userConfig.apiEndpoint}`);
        apiKey = userConfig.apiKey;
        requestUrl = resolveChatEndpoint(userConfig.apiEndpoint, userConfig.providerId);
        console.log(`[BuiltinAI] Resolved requestUrl: ${requestUrl}`);
        temperature = userConfig.temperature;
      } else {
        // 浣跨敤鍐呯疆閰嶇疆
        const provider = this.builtinProviders.find(p => p.name === providerName);
        if (!provider) {
          throw new Error(`鏈壘鍒版彁渚涘晢: ${providerName}`);
        }
        console.log(`[BuiltinAI] 浣跨敤鍐呯疆閰嶇疆: ${providerName}`);
        apiKey = provider.apiKey;
        requestUrl = resolveChatEndpoint(provider.baseURL);
      }

      const url = requestUrl;
      console.log('[BuiltinAI] 鏈€缁堣姹?URL:', url);
      console.log('[BuiltinAI] 璇锋眰妯″瀷:', actualModelId);
      console.log('[BuiltinAI]  娑堟伅鏁伴噺:', messages.length);
      
      const requestBody: any = {
        model: actualModelId,
        messages: messages,
        stream: true,
      };

      // 濡傛灉鏈夋俯搴﹀弬鏁帮紝娣诲姞瀹?
      if (temperature !== undefined) {
        requestBody.temperature = temperature;
      }
      
      console.log('[BuiltinAI] 璇锋眰浣?', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // 灏濊瘯璇诲彇閿欒鍝嶅簲鐨勮缁嗕俊鎭?
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          console.error('[BuiltinAI]  閿欒鍝嶅簲浣?(鍘熷):', errorBody);
          if (errorBody) {
            errorDetails = errorBody;
            // 灏濊瘯瑙ｆ瀽涓篔SON浠ヨ幏鍙栨洿璇︾粏鐨勯敊璇俊鎭?
            try {
              const errorJson = JSON.parse(errorBody);
              console.error('[BuiltinAI]  閿欒璇︽儏 (JSON):', JSON.stringify(errorJson, null, 2));
            } catch (e) {
              // 涓嶆槸JSON锛屼娇鐢ㄥ師濮嬫枃鏈?
              console.error('[BuiltinAI]  閿欒鍝嶅簲涓嶆槸JSON鏍煎紡');
            }
          }
        } catch (e) {
          console.error('[BuiltinAI]  鏃犳硶璇诲彇閿欒鍝嶅簲:', e);
        }
        console.error(`[BuiltinAI]  API 閿欒 (${response.status}):`, errorDetails);
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      // 璇诲彇娴佸紡鍝嶅簲
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[BuiltinAI]  娴佸紡鍝嶅簲瀹屾垚');
          onComplete();
          break;
        }

        // 瑙ｇ爜鏁版嵁鍧?
        buffer += decoder.decode(value, { stream: true });
        
        // 澶勭悊 SSE 鏍煎紡鐨勬暟鎹?
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 淇濈暀鏈€鍚庝竴涓彲鑳戒笉瀹屾暣鐨勮

        for (const line of lines) {
          const trimmed = line.trim();
          
          // 璺宠繃绌鸿鍜屾敞閲?
          if (!trimmed || trimmed.startsWith(':')) continue;
          
          // 瑙ｆ瀽 SSE 鏁版嵁
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            
            // 妫€鏌ユ槸鍚︾粨鏉?
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
              console.warn('[BuiltinAI]  瑙ｆ瀽鏁版嵁鍧楀け璐?', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('[BuiltinAI]  娴佸紡鑱婂ぉ澶辫触:', error);
      onError(error as Error);
    }
  }

  /**
   * 璋冪敤AI鑱婂ぉAPI锛堥潪娴佸紡鍝嶅簲锛?
   * @param modelId 瀹屾暣鐨勬ā鍨婭D锛堟牸寮忥細鎻愪緵鍟?妯″瀷鍚嶏級
   * @param messages 鑱婂ぉ娑堟伅鍒楄〃
   * @returns AI鍝嶅簲鍐呭
   */
  async chat(
    modelId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      // 瑙ｆ瀽妯″瀷ID
      const [providerName, actualModelId] = modelId.split(':');
      if (!providerName || !actualModelId) {
        throw new Error(`鏃犳晥鐨勬ā鍨婭D鏍煎紡: ${modelId}`);
      }

      console.log(`[BuiltinAI] 寮€濮嬭亰澶? ${modelId}`);

      // 棣栧厛妫€鏌ユ槸鍚︿负鐢ㄦ埛閰嶇疆鐨勬ā鍨?
      const userConfig = this.userModelConfigs.get(modelId);
      
      let apiKey: string;
      let requestUrl: string;
      let temperature: number | undefined;

      if (userConfig) {
        // 浣跨敤鐢ㄦ埛閰嶇疆
        console.log(`[BuiltinAI] 浣跨敤鐢ㄦ埛閰嶇疆: ${userConfig.configName}`);
        console.log(`[BuiltinAI] 鍘熷 API 绔偣: ${userConfig.apiEndpoint}`);
        apiKey = userConfig.apiKey;
        requestUrl = resolveChatEndpoint(userConfig.apiEndpoint, userConfig.providerId);
        console.log(`[BuiltinAI] Resolved requestUrl: ${requestUrl}`);
        temperature = userConfig.temperature;
      } else {
        // 浣跨敤鍐呯疆閰嶇疆
        const provider = this.builtinProviders.find(p => p.name === providerName);
        if (!provider) {
          throw new Error(`鏈壘鍒版彁渚涘晢: ${providerName}`);
        }
        console.log(`[BuiltinAI] 浣跨敤鍐呯疆閰嶇疆: ${providerName}`);
        apiKey = provider.apiKey;
        requestUrl = resolveChatEndpoint(provider.baseURL);
      }

      const url = requestUrl;
      console.log(`[BuiltinAI] 鏈€缁堣姹?URL: ${url}`);
      console.log(`[BuiltinAI] 璇锋眰妯″瀷: ${actualModelId}`);
      
      const requestBody: any = {
        model: actualModelId,
        messages: messages,
        stream: false,
      };

      // 濡傛灉鏈夋俯搴﹀弬鏁帮紝娣诲姞瀹?
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
        // 灏濊瘯璇诲彇閿欒鍝嶅簲鐨勮缁嗕俊鎭?
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails = errorBody;
          }
        } catch (e) {
          // 蹇界暐瑙ｆ瀽閿欒
        }
        console.error(`[BuiltinAI]  API 閿欒 (${response.status}):`, errorDetails);
        throw new Error(`HTTP ${response.status}: ${errorDetails}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      console.log('[BuiltinAI]  鑱婂ぉ瀹屾垚');
      return content;
    } catch (error) {
      console.error('[BuiltinAI]  鑱婂ぉ澶辫触:', error);
      throw error;
    }
  }

  /**
   * 璁剧疆IPC閫氫俊
   */
  private setupIPC(): void {
    // 绉婚櫎宸插瓨鍦ㄧ殑澶勭悊鍣紙閬垮厤閲嶅娉ㄥ唽锛?
    try {
      ipcMain.removeHandler('builtin-ai:get-models');
      ipcMain.removeHandler('builtin-ai:update-user-models');
      ipcMain.removeHandler('builtin-ai:update-user-model-configs');
      ipcMain.removeHandler('builtin-ai:refresh-models');
      ipcMain.removeHandler('builtin-ai:chat');
      ipcMain.removeHandler('builtin-ai:stream-chat');
    } catch (error) {}
    
    // 鑾峰彇鍙敤妯″瀷鍒楄〃锛堝悎骞跺唴缃ā鍨嬪拰鐢ㄦ埛閰嶇疆鐨勬ā鍨嬶級
    ipcMain.handle('builtin-ai:get-models', () => {
      const allModels = [...this.availableModels, ...this.userConfiguredModels];
      console.log('[BuiltinAI] 杩斿洖妯″瀷鍒楄〃锛屾暟閲?', allModels.length);
      console.log('[BuiltinAI]   - 鍐呯疆妯″瀷:', this.availableModels.length);
      console.log('[BuiltinAI]   - 鐢ㄦ埛閰嶇疆妯″瀷:', this.userConfiguredModels.length);
      return allModels;
    });

    // 鏇存柊鐢ㄦ埛閰嶇疆鐨勬ā鍨嬪垪琛紙浠庢覆鏌撹繘绋嬪悓姝ワ級
    ipcMain.handle('builtin-ai:update-user-models', async (_event, models: string[]) => {
      this.userConfiguredModels = models;
      return { success: true, count: models.length };
    });

    // 鏇存柊鐢ㄦ埛閰嶇疆鐨勬ā鍨嬭缁嗕俊鎭紙浠庢覆鏌撹繘绋嬪悓姝ワ級
    ipcMain.handle('builtin-ai:update-user-model-configs', async (_event, configs: UserModelInfo[]) => {
      this.userModelConfigs.clear();
      configs.forEach(config => {
        this.userModelConfigs.set(config.modelId, config);
      });
      return { success: true, count: configs.length };
    });

    // 鍒锋柊妯″瀷鍒楄〃锛堥噸鏂颁粠API鑾峰彇锛?
    ipcMain.handle('builtin-ai:refresh-models', async () => {
      try {
        await this.fetchModelsFromProviders();
        const allModels = [...this.availableModels, ...this.userConfiguredModels];
        return { success: true, models: allModels };
      } catch (error) {
        console.error('[BuiltinAI]  鍒锋柊澶辫触:', error);
        return { success: false, error: String(error) };
      }
    });

    // 鑱婂ぉ鎺ュ彛锛堥潪娴佸紡锛?
    ipcMain.handle('builtin-ai:chat', async (_event, modelId: string, messages: Array<{ role: string; content: string }>) => {
      try {
        const response = await this.chat(modelId, messages);
        return { success: true, content: response };
      } catch (error) {
        console.error('[BuiltinAI]  鑱婂ぉ澶辫触:', error);
        return { success: false, error: String(error) };
      }
    });

    // 娴佸紡鑱婂ぉ鎺ュ彛
    ipcMain.handle('builtin-ai:stream-chat', async (event, modelId: string, messages: Array<{ role: string; content: string }>) => {
      return new Promise((resolve) => {
        this.streamChat(
          modelId,
          messages,
          (chunk) => {
            // 鍙戦€佹暟鎹潡鍒版覆鏌撹繘绋?
            event.sender.send('builtin-ai:stream-chunk', chunk);
          },
          () => {
            // 瀹屾垚
            event.sender.send('builtin-ai:stream-complete');
            resolve({ success: true });
          },
          (error) => {
            // 閿欒
            event.sender.send('builtin-ai:stream-error', error.message);
            resolve({ success: false, error: error.message });
          }
        );
      });
    });
    
  }

  /**
   * 鑾峰彇褰撳墠鍙敤鐨勬ā鍨嬪垪琛?
   */
  getAvailableModels(): string[] {
    return [...this.availableModels];
  }
}


