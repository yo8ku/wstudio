/**
 * 上下文构建器
 */
import { ContextSource } from './types.js';
export declare class ContextBuilder {
    /**
     * 构建上下文
     */
    build(sources: ContextSource[], maxLength?: number): {
        context: string;
        sources: ContextSource[];
    };
    /**
     * 格式化上下文
     */
    formatContext(sources: ContextSource[]): string;
}
//# sourceMappingURL=ContextBuilder.d.ts.map