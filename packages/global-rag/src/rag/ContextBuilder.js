/**
 * 上下文构建器
 */
export class ContextBuilder {
    /**
     * 构建上下文
     */
    build(sources, maxLength) {
        const selectedSources = [];
        let currentLength = 0;
        const limit = maxLength || 4000;
        // 按相关性分数排序
        const sortedSources = [...sources].sort((a, b) => b.score - a.score);
        for (const source of sortedSources) {
            const sourceLength = source.content.length;
            if (currentLength + sourceLength <= limit) {
                selectedSources.push(source);
                currentLength += sourceLength;
            }
            else {
                // 尝试截断最后一个文档
                const remaining = limit - currentLength;
                if (remaining > 100) {
                    selectedSources.push({
                        ...source,
                        content: source.content.slice(0, remaining) + '...',
                    });
                }
                break;
            }
        }
        // 构建上下文字符串
        const context = selectedSources
            .map((source, index) => {
            return `[文档 ${index + 1}]\n${source.content}\n`;
        })
            .join('\n');
        return {
            context,
            sources: selectedSources,
        };
    }
    /**
     * 格式化上下文
     */
    formatContext(sources) {
        return sources
            .map((source, index) => {
            const metadata = source.metadata
                ? `\n元数据: ${JSON.stringify(source.metadata, null, 2)}`
                : '';
            return `### 来源 ${index + 1} (相关度: ${source.score.toFixed(2)})\n${source.content}${metadata}`;
        })
            .join('\n\n---\n\n');
    }
}
//# sourceMappingURL=ContextBuilder.js.map