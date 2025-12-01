/**
 * RAG 引擎
 */
import { ContextBuilder } from './ContextBuilder.js';
import { PromptTemplate } from './PromptTemplate.js';
export class RAGEngine {
    constructor(vectorStore, config) {
        this.vectorStore = vectorStore;
        this.contextBuilder = new ContextBuilder();
        this.promptTemplate = new PromptTemplate();
        this.config = {
            maxContextLength: 4000,
            maxSourceDocuments: 5,
            minRelevanceScore: 0.7,
            includeMetadata: true,
            ...config,
        };
    }
    /**
     * 执行 RAG 查询
     */
    async query(query, options) {
        const mergedConfig = { ...this.config, ...options };
        // 1. 搜索相关文档
        const searchResults = await this.vectorStore.search(query, {
            topK: mergedConfig.maxSourceDocuments,
            modelName: mergedConfig.model,
        });
        // 2. 过滤低相关性结果
        const filteredResults = searchResults.filter(result => result.score >= (mergedConfig.minRelevanceScore || 0.7));
        // 3. 构建上下文
        const contextSources = filteredResults.map((result) => ({
            content: result.text,
            metadata: mergedConfig.includeMetadata ? result.metadata : undefined,
            score: result.score,
        }));
        const context = this.contextBuilder.build(contextSources, mergedConfig.maxContextLength);
        // 4. 生成提示词
        const ragContext = {
            query,
            sources: context.sources,
            systemPrompt: this.promptTemplate.getSystemPrompt(),
            userPrompt: this.promptTemplate.getUserPrompt(query, context.context),
        };
        // 5. 生成回答（这里需要集成 LLM）
        const answer = await this.generateAnswer(ragContext);
        return {
            answer,
            sources: context.sources,
            context: context.context,
            metadata: {
                model: mergedConfig.model,
                searchResults: filteredResults.length,
            },
        };
    }
    /**
     * 生成回答（需要集成 LLM）
     */
    async generateAnswer(context) {
        // 这里应该调用 LLM API
        // 示例：OpenAI、Claude、本地模型等
        return `基于提供的上下文回答：${context.query}`;
    }
    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
//# sourceMappingURL=RAGEngine.js.map