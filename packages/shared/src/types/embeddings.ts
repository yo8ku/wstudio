/**
 * Embedding 类型定义
 * 支持云端嵌入模型（OpenAI、Gemini 等第三方平台）
 */

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
