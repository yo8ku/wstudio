/**
 * 提示词模板
 */

export class PromptTemplate {
  private systemPrompt: string;
  private userPromptTemplate: string;

  constructor() {
    this.systemPrompt = `你是一个专业的知识库助手。你的任务是基于提供的上下文信息回答用户的问题。

规则：
1. 仅使用提供的上下文信息来回答问题
2. 如果上下文中没有相关信息，请明确说明
3. 保持回答准确、简洁、有条理
4. 可以引用具体的来源文档
5. 如果需要，可以提供额外的解释或背景信息`;

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




































































