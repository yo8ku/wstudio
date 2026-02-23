/**
 * 提示词模板
 * 提示词内容来源于 packages/prompts/knowledge-base/rag.md
 * 调用方需通过 setSystemPrompt() 设置提示词内容
 */

export class PromptTemplate {
  private systemPrompt: string;
  private userPromptTemplate: string;

  constructor() {
    this.systemPrompt = '';

    this.userPromptTemplate = `上下文信息：
{context}

问题：{query}

请基于以上上下文信息回答问题。`;
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * 获取用户提示词
   */
  getUserPrompt(query: string, context: string): string {
    return this.userPromptTemplate
      .replace('{context}', context)
      .replace('{query}', query);
  }

  /**
   * 设置自定义系统提示词
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * 设置自定义用户提示词模板
   */
  setUserPromptTemplate(template: string): void {
    this.userPromptTemplate = template;
  }

  /**
   * 渲染模板
   */
  render(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return result;
  }
}


