/**
 * Ollama 翻译服务
 * 功能：基于本地 Ollama 大模型提供翻译功能
 * 描述：利用 Ollama API 实现多语言互译，支持自动语言检测
 */

/** 翻译请求参数 */
export interface TranslateRequest {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

/** 翻译响应 */
export interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: string;
}

/** Ollama 配置 */
export interface OllamaTranslateConfig {
  apiUrl: string;
  model: string;
}

/** 默认配置 */
const DEFAULT_CONFIG: OllamaTranslateConfig = {
  apiUrl: 'http://localhost:11434',
  model: 'qwen2.5:7b',
};

/** 支持的语言 */
export const SUPPORTED_LANGUAGES = {
  AUTO: 'auto',
  CHINESE: 'zh',
  ENGLISH: 'en',
  JAPANESE: 'ja',
  KOREAN: 'ko',
  FRENCH: 'fr',
  GERMAN: 'de',
  SPANISH: 'es',
  RUSSIAN: 'ru',
} as const;

/** 语言名称映射 */
const LANGUAGE_NAMES: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский',
};

/**
 * Ollama 翻译服务类
 */
export class OllamaTranslateService {
  private config: OllamaTranslateConfig;

  constructor(config?: Partial<OllamaTranslateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 设置 API 地址 */
  setApiUrl(url: string): void {
    this.config.apiUrl = url;
  }

  /** 设置模型 */
  setModel(model: string): void {
    this.config.model = model;
  }

  /** 获取当前配置 */
  getConfig(): OllamaTranslateConfig {
    return { ...this.config };
  }

  /**
   * 翻译文本
   */
  async translate(request: TranslateRequest): Promise<TranslateResponse> {
    const { text, targetLang, sourceLang } = request;
    
    if (!text.trim()) {
      return { translatedText: '' };
    }

    const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;
    const sourceLangName = sourceLang ? LANGUAGE_NAMES[sourceLang] || sourceLang : '';

    // 构建翻译提示词
    const prompt = sourceLang && sourceLang !== 'auto'
      ? `将以下${sourceLangName}文本翻译成${targetLangName}，只返回翻译结果，不要添加任何解释：\n\n${text}`
      : `将以下文本翻译成${targetLangName}，只返回翻译结果，不要添加任何解释：\n\n${text}`;

    const response = await fetch(`${this.config.apiUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`翻译请求失败: ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    return {
      translatedText: data.response.trim(),
    };
  }

  /**
   * 自动检测语言并翻译（中英互译）
   */
  async autoTranslate(text: string): Promise<TranslateResponse> {
    if (!text.trim()) {
      return { translatedText: '' };
    }

    // 简单判断是否包含中文
    const hasChinese = /[\u4e00-\u9fa5]/.test(text);
    const targetLang = hasChinese ? SUPPORTED_LANGUAGES.ENGLISH : SUPPORTED_LANGUAGES.CHINESE;

    return this.translate({
      text,
      targetLang,
    });
  }

  /**
   * 检查服务是否可用
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取可用模型列表
   */
  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/tags`);
      if (!response.ok) return [];
      
      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models?.map(m => m.name) || [];
    } catch {
      return [];
    }
  }

  /**
   * 检查翻译模型是否已安装
   */
  async hasTranslateModel(): Promise<boolean> {
    try {
      const models = await this.getModels();
      const targetModel = this.config.model;
      // 检查模型名称是否匹配（支持带版本号和不带版本号的匹配）
      return models.some(m => 
        m === targetModel || 
        m.startsWith(targetModel.split(':')[0])
      );
    } catch {
      return false;
    }
  }

  /**
   * 获取当前配置的翻译模型名称
   */
  getTranslateModelName(): string {
    return this.config.model;
  }

  /**
   * 获取 Ollama 下载模型的命令
   * Windows 下使用完整路径，避免 PATH 问题
   */
  getPullModelCommand(): string {
    const model = this.config.model;
    // 使用 PowerShell 环境变量获取 Ollama 路径（Windows）
    // 这个命令在 PowerShell 中会正确展开
    return `& "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama.exe" pull ${model}`;
  }
}

/** 单例实例 */
let instance: OllamaTranslateService | null = null;

/**
 * 获取 Ollama 翻译服务实例
 */
export function getOllamaTranslateService(config?: Partial<OllamaTranslateConfig>): OllamaTranslateService {
  if (!instance) {
    instance = new OllamaTranslateService(config);
  } else if (config) {
    if (config.apiUrl) instance.setApiUrl(config.apiUrl);
    if (config.model) instance.setModel(config.model);
  }
  return instance;
}

export default OllamaTranslateService;
