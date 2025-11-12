/**
 * 验证工具
 */

export class Validator {
  /**
   * 验证文件路径
   */
  static isValidFilePath(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    
    // 基本路径验证
    const invalidChars = /[<>:"|?*]/;
    return !invalidChars.test(path);
  }

  /**
   * 验证文件大小
   */
  static isValidFileSize(size: number, maxSize: number = 100 * 1024 * 1024): boolean {
    return size > 0 && size <= maxSize;
  }

  /**
   * 验证文件类型
   */
  static isValidFileType(filePath: string, allowedTypes: string[]): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext ? allowedTypes.includes(`.${ext}`) : false;
  }

  /**
   * 验证文本长度
   */
  static isValidTextLength(text: string, minLength = 1, maxLength = 1000000): boolean {
    return text.length >= minLength && text.length <= maxLength;
  }

  /**
   * 验证向量维度
   */
  static isValidVectorDimension(vector: number[], expectedDim: number): boolean {
    return Array.isArray(vector) && vector.length === expectedDim;
  }

  /**
   * 验证元数据
   */
  static isValidMetadata(metadata: any): boolean {
    if (typeof metadata !== 'object' || metadata === null) return false;
    
    // 检查是否为纯对象
    return Object.getPrototypeOf(metadata) === Object.prototype;
  }

  /**
   * 验证配置对象
   */
  static validateConfig<T extends Record<string, any>>(
    config: T,
    requiredFields: Array<keyof T>
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const field of requiredFields) {
      if (!(field in config) || config[field] === undefined) {
        missing.push(String(field));
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * 验证搜索选项
   */
  static isValidSearchOptions(options: any): boolean {
    if (!options || typeof options !== 'object') return false;
    
    if (options.topK !== undefined && (typeof options.topK !== 'number' || options.topK <= 0)) {
      return false;
    }

    if (options.scoreThreshold !== undefined && 
        (typeof options.scoreThreshold !== 'number' || 
         options.scoreThreshold < 0 || 
         options.scoreThreshold > 1)) {
      return false;
    }

    return true;
  }
}




































































