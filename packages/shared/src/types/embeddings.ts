/**
 * Embedding 类型定义
 * 仅支持本地预打包模型
 */

/**
 * Embedding 配置接口
 */
export interface EmbeddingConfig {
  /**
   * 本地模型文件路径
   * 支持相对路径（相对于项目根目录）或绝对路径
   * @example "packages/Embeddings/models/bge-base-zh-v1.5"
   * @default "packages/Embeddings/models/bge-base-zh-v1.5"
   */
  localModelPath?: string;
}

/**
 * Embedding 响应接口
 */
export interface EmbeddingResponse {
  /**
   * 向量数组
   */
  vectors: number[];
  
  /**
   * 使用统计（可选）
   */
  usage?: {
    /**
     * 提示词 token 数量
     */
    prompt_tokens: number;
    
    /**
     * 总 token 数量
     */
    total_tokens: number;
  };
}
