/**
 * 提示词模板
 */
export declare class PromptTemplate {
    private systemPrompt;
    private userPromptTemplate;
    constructor();
    /**
     * 获取系统提示词
     */
    getSystemPrompt(): string;
    /**
     * 获取用户提示词
     */
    getUserPrompt(query: string, context: string): string;
    /**
     * 设置自定义系统提示词
     */
    setSystemPrompt(prompt: string): void;
    /**
     * 设置自定义用户提示词模板
     */
    setUserPromptTemplate(template: string): void;
    /**
     * 渲染模板
     */
    render(template: string, variables: Record<string, string>): string;
}
//# sourceMappingURL=PromptTemplate.d.ts.map