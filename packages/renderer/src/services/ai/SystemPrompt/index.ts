/**
 * System Prompt 加载服务
 * 功能：从 md 文件动态加载 System Prompt 内容
 * 描述：支持内联聊天（AI-Zone）等场景的 System Prompt 管理
 */

// AI-Zone 内联聊天的默认 System Prompt（非 RAG 模式）
export const AI_ZONE_DEFAULT_SYSTEM_PROMPT = `你是一个AI助手，能够帮助用户解答问题、编写代码、分析文档等。请保持专业、简洁的回答风格。`;

// 缓存已加载的 System Prompt 内容
let cachedRagSystemPrompt: string | null = null;

/**
 * 从 AI-Zone.md 文件加载 RAG System Prompt
 * @returns Promise<string> System Prompt 内容
 */
async function loadRagSystemPromptFromFile(): Promise<string> {
  // 如果已缓存，直接返回
  if (cachedRagSystemPrompt !== null) {
    return cachedRagSystemPrompt;
  }

  try {
    // 使用 fetch 加载同目录下的 AI-Zone.md 文件
    const response = await fetch(new URL('./AI-Zone.md', import.meta.url));
    if (response.ok) {
      cachedRagSystemPrompt = await response.text();
      console.log('[SystemPrompt] 成功从 AI-Zone.md 加载 RAG System Prompt');
      return cachedRagSystemPrompt;
    }
  } catch (error) {
    console.warn('[SystemPrompt] 从文件加载失败，使用内置默认值:', error);
  }

  // 加载失败时使用内置默认值
  cachedRagSystemPrompt = `# 角色
 - 你是一个超级智能助手擅长各个行业的知识，能够基于文档知识库进行精准回答。
# 任务
 - 请基于用户提供的【参考文档】精准回答问题。
# 核心约束
1. **严格基于文档**：你的所有回答必须 100% 来源于提供的参考文档。回答内容必须从参考文档中提取，不要使用你的外部知识编造。
2. **无中生有**：如果【参考文档】无法回答用户的问题，请直接回复："当前的知识库中未找到相关内容。"，不要尝试捏造答案。
3. **格式规范**：如果涉及代码或命令，必须使用 Markdown 代码块（\`\`\`）包裹。严禁修改命令参数。
4. **语言风格**：保持专业、简洁。
5. **数据来源** 回答时请在句子末尾标注引用来源，例如 [文档 1]...。
# 回答风格
1. **结构风格**：必须保持跟参考片段风格一致。
2. **直接**：不要说废话，直接给出解决方案。
3. **准确**：名词必须精准。`;
  
  return cachedRagSystemPrompt;
}

/**
 * 清除缓存，强制下次重新加载
 */
export function clearSystemPromptCache(): void {
  cachedRagSystemPrompt = null;
}

/**
 * 获取 AI-Zone 的 System Prompt（异步版本）
 * @param hasRagContext 是否有 RAG 上下文（@文件引用）
 * @param modelDisplayName 模型显示名称
 * @param providerDisplayName 服务商显示名称
 * @returns Promise<string> System Prompt 内容
 */
export async function getAIZoneSystemPromptAsync(
  hasRagContext: boolean,
  modelDisplayName?: string,
  providerDisplayName?: string
): Promise<string> {
  if (hasRagContext) {
    // RAG 模式：从文件加载知识库问答的 System Prompt
    return await loadRagSystemPromptFromFile();
  }
  
  // 非 RAG 模式：使用默认的 System Prompt，包含模型身份信息
  if (modelDisplayName && providerDisplayName) {
    return `你是一个AI助手，模型名称是${modelDisplayName}。当用户询问你的身份、模型名称或开发者时，请准确回答：你是${modelDisplayName}模型，由${providerDisplayName}提供。不要声称自己是其他模型。`;
  }
  
  return AI_ZONE_DEFAULT_SYSTEM_PROMPT;
}

/**
 * 获取 AI-Zone 的 System Prompt（同步版本，使用缓存）
 * @param hasRagContext 是否有 RAG 上下文（@文件引用）
 * @param modelDisplayName 模型显示名称
 * @param providerDisplayName 服务商显示名称
 * @returns System Prompt 内容
 */
export function getAIZoneSystemPrompt(
  hasRagContext: boolean,
  modelDisplayName?: string,
  providerDisplayName?: string
): string {
  if (hasRagContext) {
    // RAG 模式：使用缓存的 System Prompt（如果没有缓存则使用默认值）
    if (cachedRagSystemPrompt !== null) {
      return cachedRagSystemPrompt;
    }
    // 触发异步加载（下次调用时可用）
    loadRagSystemPromptFromFile().catch(console.error);
    // 返回内置默认值
    return `# 角色
 - 你是一个超级智能助手擅长各个行业的知识，能够基于文档知识库进行精准回答。
# 任务
 - 请基于用户提供的【参考文档】精准回答问题。
# 核心约束
1. **严格基于文档**：你的所有回答必须 100% 来源于提供的参考文档。回答内容必须从参考文档中提取，不要使用你的外部知识编造。
2. **无中生有**：如果【参考文档】无法回答用户的问题，请直接回复："当前的知识库中未找到相关内容。"，不要尝试捏造答案。
3. **格式规范**：如果涉及代码或命令，必须使用 Markdown 代码块（\`\`\`）包裹。严禁修改命令参数。
4. **语言风格**：保持专业、简洁。
5. **数据来源** 回答时请在句子末尾标注引用来源，例如 [文档 1]...。
# 回答风格
1. **结构风格**：必须保持跟参考片段风格一致。
2. **直接**：不要说废话，直接给出解决方案。
3. **准确**：名词必须精准。`;
  }
  
  // 非 RAG 模式：使用默认的 System Prompt，包含模型身份信息
  if (modelDisplayName && providerDisplayName) {
    return `你是一个AI助手，模型名称是${modelDisplayName}。当用户询问你的身份、模型名称或开发者时，请准确回答：你是${modelDisplayName}模型，由${providerDisplayName}提供。不要声称自己是其他模型。`;
  }
  
  return AI_ZONE_DEFAULT_SYSTEM_PROMPT;
}
