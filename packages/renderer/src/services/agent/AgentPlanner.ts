/**
 * Agent 浠诲姟瑙勫垝鍣?
 * 鍔熻兘锛氭牴鎹敤鎴蜂换鍔″垱寤烘墽琛岃鍒?
 * 鎻忚堪锛氫娇鐢?LLM 鍒嗘瀽浠诲姟骞剁敓鎴愭楠ゅ寲鐨勬墽琛岃鍒?
 */

import {
  AgentTask,
  AgentPlan,
  AgentStep,
  AgentStepType,
  AgentTool,
  AgentExecutionConfig
} from './types';
import { aiService } from '../ai/AIService';
import type { ChatMessage, Tool } from '../../types/aiProvider';

/**
 * 瑙勫垝鍣ㄩ厤缃?
 */
export interface AgentPlannerConfig {
  /** 鎵ц閰嶇疆 */
  executionConfig: AgentExecutionConfig;
  /** 鍙敤宸ュ叿鍒楄〃 */
  availableTools: AgentTool[];
  /** 绯荤粺鎻愮ず璇?*/
  systemPrompt?: string;
  /** 鏈€澶ц鍒掓楠ゆ暟 */
  maxPlanSteps?: number;
}

/**
 * 缂撳瓨鐨勮鍒掑櫒鎻愮ず璇?
 */
let cachedPlannerPrompt: string | null = null;
export const RANDOM_REFERENCE_ARTICLE_COMMAND = [
  'powershell -NoProfile -Command',
  '"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false);',
  '$files = Get-ChildItem -Path . -Recurse -File -ErrorAction SilentlyContinue',
  '| Where-Object { ($_.Extension -in \'.md\',\'.txt\') -and $_.Length -gt 0 -and $_.Length -lt 1048576 };',
  'if (-not $files -or $files.Count -eq 0) { Write-Output \'[reference-article] none\'; exit 0 };',
  '$file = Get-Random -InputObject $files;',
  'Write-Output (\'[reference-article-path] \' + $file.FullName);',
  'Write-Output (\'[reference-article-name] \' + $file.Name);',
  'Write-Output \'[reference-article-content-begin]\';',
  '$bytes = [System.IO.File]::ReadAllBytes($file.FullName);',
  'if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $content = [System.Text.Encoding]::Unicode.GetString($bytes) }',
  'elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { $content = [System.Text.Encoding]::BigEndianUnicode.GetString($bytes) }',
  'else { $utf8Strict = [System.Text.UTF8Encoding]::new($false, $true); try { $content = $utf8Strict.GetString($bytes) } catch { $content = [System.Text.Encoding]::GetEncoding(936).GetString($bytes) } };',
  'Write-Output $content;',
  'Write-Output \'[reference-article-content-end]\'"',
].join(' ');
const PARAGRAPH_DECOMPOSITION_DIMENSIONS = [
  'paragraph logic chain',
  'transitions',
  'turning points',
  'cases',
  'word choice',
  'information density',
  'layout style',
  'highlight lines',
  'verb/adjective precision',
  'rhetorical devices',
  'length',
  'rhythm',
  'narrative perspective',
  'hooks',
  'emotion curve',
  'core intent',
  'entry point',
  'voice/style',
  'credibility backing',
  'scientific examples',
  'verb-noun ratio',
  'rhetorical logic',
].join(', ');

const RANDOM_REFERENCE_STEP_HINT_REGEX = /(reference article|参考文章|读取参考|抽取参考|随机参考|随机抽取|随机提取|风格参考|style reference|\.md\/\.txt|md\/txt)/i;
const RANDOM_REFERENCE_UNIX_COMMAND_REGEX = /\b(?:ls\s+-la|find\s+\.|shuf\s+-n|sed\s+-n|cat\s+)\b/i;
const USER_REQUIREMENT_DECOMPOSITION_REGEX = /(decompose user requirements|structured writing brief|需求拆解|用户需求|写作需求|writing brief)/i;

/**
 * 浠?agent-planner.md 鍔犺浇瑙勫垝鍣ㄦ彁绀鸿瘝
 */
async function loadPlannerPrompt(): Promise<string> {
  if (cachedPlannerPrompt !== null) {
    return cachedPlannerPrompt;
  }
  try {
    const response = await fetch(new URL('../../../../prompts/agent/planner.md', import.meta.url));
    if (response.ok) {
      cachedPlannerPrompt = await response.text();
      return cachedPlannerPrompt;
    }
  } catch (error) {
    console.warn('[AgentPlanner] 浠庢枃浠跺姞杞借鍒掑櫒鎻愮ず璇嶅け璐?', error);
  }
  cachedPlannerPrompt = '';
  return cachedPlannerPrompt;
}

/**
 * Agent 浠诲姟瑙勫垝鍣ㄧ被
 */
export class AgentPlanner {
  /** 閰嶇疆 */
  private config: AgentPlannerConfig;
  private static readonly FILE_WRITE_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit_file']);
  private static readonly GENERATION_SCAN_DEPTH = 5;
  private static readonly MAX_REFERENCED_FILES = 6;
  private static readonly MAX_REFERENCED_DIRECTORIES = 4;
  private static readonly MAX_REFERENCED_FORMS = 3;
  private static readonly MAX_REFERENCED_KBS = 3;

  constructor(config: AgentPlannerConfig) {
    this.config = {
      ...config,
      maxPlanSteps: config.maxPlanSteps || 20
    };
    // 瑙﹀彂寮傛鍔犺浇鎻愮ず璇?
    if (!config.systemPrompt) {
      loadPlannerPrompt().then(prompt => {
        if (!this.config.systemPrompt) {
          this.config.systemPrompt = prompt;
        }
      }).catch(console.error);
    }
  }

  /**
   * 涓轰换鍔″垱寤烘墽琛岃鍒?
   */
  async createPlan(task: AgentTask): Promise<AgentPlan> {
    console.log(`[AgentPlanner] 寮€濮嬩负浠诲姟鍒涘缓璁″垝: ${task.id}`);

    // 纭繚鎻愮ず璇嶅凡鍔犺浇
    if (!this.config.systemPrompt) {
      this.config.systemPrompt = await loadPlannerPrompt();
    }

    // 鏋勫缓鎻愮ず璇?
    const messages = this.buildPlanningMessages(task);

    // 鏋勫缓宸ュ叿鎻忚堪
    const toolsDescription = this.buildToolsDescription();

    // 璋冪敤 LLM 鐢熸垚璁″垝
    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        {
          role: 'system',
          content: `${this.config.systemPrompt}\n\n## 鍙敤宸ュ叿\n${toolsDescription}`
        },
        ...messages
      ],
      temperature: this.config.executionConfig.temperature || 0.3,
      maxTokens: this.config.executionConfig.maxTokens || 2000
    });

    // 瑙ｆ瀽 LLM 鍝嶅簲
    const plan = this.parsePlanResponse(response.content, task);

    console.log(`[AgentPlanner] Plan created with ${plan.steps.length} steps`);

    return plan;
  }

  /**
   * 鏍规嵁鎵ц缁撴灉鏇存柊璁″垝
   */
  async updatePlan(
    currentPlan: AgentPlan,
    stepResult: { stepId: string; success: boolean; result?: unknown; error?: string }
  ): Promise<AgentPlan> {
    console.log(`[AgentPlanner] Updating plan after step result: ${stepResult.stepId}`);

    // 濡傛灉姝ラ鎴愬姛锛屾鏌ユ槸鍚﹂渶瑕佽皟鏁村悗缁楠?
    if (stepResult.success) {
      // 绠€鍗曟儏鍐碉細鐩存帴杩斿洖褰撳墠璁″垝
      return {
        ...currentPlan,
        updatedAt: Date.now()
      };
    }

    // 濡傛灉姝ラ澶辫触锛屽彲鑳介渶瑕侀噸鏂拌鍒?
    const failedStep = currentPlan.steps.find(s => s.id === stepResult.stepId);
    if (!failedStep) {
      return currentPlan;
    }

    // 鏋勫缓閲嶆柊瑙勫垝鐨勬秷鎭?
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Step execution failed and needs replanning.

Failed step: ${failedStep.description}
Error: ${stepResult.error}

Please analyze the failure and provide revised steps.`
      }
    ];

    try {
      const response = await aiService.generateText({
        model: this.config.executionConfig.modelId,
        messages: [
          {
            role: 'system',
            content: this.config.systemPrompt || cachedPlannerPrompt || ''
          },
          ...messages
        ],
        temperature: 0.3,
        maxTokens: 1000
      });

      // 瑙ｆ瀽鏂扮殑姝ラ
      const newSteps = this.parseStepsFromResponse(response.content);

      if (newSteps.length > 0) {
        // 鏇挎崲澶辫触姝ラ鍙婂叾鍚庣画姝ラ
        const failedIndex = currentPlan.steps.findIndex(s => s.id === stepResult.stepId);
        const updatedSteps = [
          ...currentPlan.steps.slice(0, failedIndex),
          ...newSteps
        ];

        return {
          ...currentPlan,
          steps: updatedSteps,
          estimatedSteps: updatedSteps.length,
          updatedAt: Date.now()
        };
      }
    } catch (error) {
      console.error('[AgentPlanner] 閲嶆柊瑙勫垝澶辫触:', error);
    }

    return currentPlan;
  }

  /**
   * 楠岃瘉璁″垝鏄惁鍙墽琛?
   */
  validatePlan(plan: AgentPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 妫€鏌ユ楠ゆ暟閲?
    if (plan.steps.length === 0) {
      errors.push('璁″垝娌℃湁浠讳綍姝ラ');
    }

    if (plan.steps.length > (this.config.maxPlanSteps || 20)) {
      errors.push(`姝ラ鏁伴噺瓒呰繃闄愬埗 (${plan.steps.length} > ${this.config.maxPlanSteps})`);
    }

    // 妫€鏌ユ瘡涓楠?
    for (const step of plan.steps) {
      // 妫€鏌ュ伐鍏疯皟鐢ㄦ楠?
      if (step.type === 'tool_call' && step.toolCall) {
        const tool = this.config.availableTools.find(t => t.name === step.toolCall?.toolName);
        if (!tool) {
          errors.push(`姝ラ "${step.description}" 浣跨敤浜嗘湭鐭ュ伐鍏? ${step.toolCall.toolName}`);
        }
      }

      // 妫€鏌ユ楠ゆ弿杩?
      if (!step.description || step.description.trim().length === 0) {
        errors.push(`姝ラ ${step.id} 缂哄皯鎻忚堪`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 鏋勫缓瑙勫垝娑堟伅
   */
  private buildPlanningMessages(task: AgentTask): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 鏋勫缓浠诲姟鎻忚堪
    let taskDescription = `## 浠诲姟淇℃伅
- 浠诲姟绫诲瀷: ${task.type}
- 浠诲姟鎻忚堪: ${task.description}
`;

    // 娣诲姞涓婁笅鏂囦俊鎭?
    if (task.context.currentFile && task.type !== 'write' && task.type !== 'edit') {
      taskDescription += `- 褰撳墠鏂囦欢: ${task.context.currentFile}\n`;
    }

    if (task.context.selectedText) {
      taskDescription += `- 閫変腑鏂囨湰:\n\`\`\`\n${task.context.selectedText}\n\`\`\`\n`;
    }

    if (task.context.workspacePath) {
      taskDescription += `- 宸ヤ綔鍖鸿矾寰? ${task.context.workspacePath}\n`;
    }

    if (task.context.additionalContext && Object.keys(task.context.additionalContext).length > 0) {
      try {
        const serializedAdditionalContext = JSON.stringify(task.context.additionalContext, null, 2);
        taskDescription += `- 棰濆涓婁笅鏂?\n\`\`\`json\n${serializedAdditionalContext}\n\`\`\`\n`;
      } catch (error) {
        console.warn('[AgentPlanner] 搴忓垪鍖?additionalContext 澶辫触:', error);
      }
    }

    // 娣诲姞绾︽潫淇℃伅
    if (task.constraints) {
      taskDescription += `\n## 绾︽潫鏉′欢\n`;
      if (task.constraints.allowedTools) {
        taskDescription += `- 鍏佽浣跨敤鐨勫伐鍏? ${task.constraints.allowedTools.join(', ')}\n`;
      }
      if (task.constraints.maxSteps) {
        taskDescription += `- 鏈€澶ф楠ゆ暟: ${task.constraints.maxSteps}\n`;
      }
      if (task.constraints.allowFileWrite === false) {
        taskDescription += `- 涓嶅厑璁稿啓鍏ユ枃浠禱n`;
      }
      if (task.constraints.allowCommandExecution === false) {
        taskDescription += `- 涓嶅厑璁告墽琛屽懡浠n`;
      }
    }

    messages.push({
      role: 'user',
      content: `璇蜂负浠ヤ笅浠诲姟鍒涘缓鎵ц璁″垝锛歕n\n${taskDescription}`
    });

    return messages;
  }

  /**
   * 鏋勫缓宸ュ叿鎻忚堪
   */
  private buildToolsDescription(): string {
    if (this.config.availableTools.length === 0) {
      return 'No tools available.';
    }

    const toolDescriptions = this.config.availableTools.map(tool => {
      let desc = `### ${tool.name}\n${tool.description}\n`;

      if (tool.parameters.properties) {
        desc += '鍙傛暟:\n';
        for (const [key, schema] of Object.entries(tool.parameters.properties)) {
          const paramSchema = schema as { type: string; description?: string };
          desc += `- ${key} (${paramSchema.type}): ${paramSchema.description || ''}\n`;
        }
      }

      if (tool.requiresConfirmation) {
        desc += '鈿狅笍 姝ゅ伐鍏烽渶瑕佺敤鎴风‘璁ゅ悗鎵嶈兘鎵ц\n';
      }

      return desc;
    });

    return toolDescriptions.join('\n');
  }

  private createSyntheticStep(
    type: AgentStepType,
    description: string,
    toolCall?: { toolName: string; parameters: Record<string, unknown> }
  ): AgentStep {
    return {
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      status: 'pending',
      toolCall
    };
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').trim().toLowerCase();
  }

  private getTaskIntent(task: AgentTask): string {
    const raw = task.context.additionalContext?.taskIntent;
    if (typeof raw !== 'string') return '';
    return raw.trim().toLowerCase();
  }

  private getReferencedContext(task: AgentTask): {
    files: string[];
    directories: string[];
    knowledgeBases: Array<{ id: string; title?: string }>;
    forms: Array<{ id: string; name?: string }>;
  } {
    const raw = task.context.additionalContext?.referencedContext;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { files: [], directories: [], knowledgeBases: [], forms: [] };
    }

    const context = raw as Record<string, unknown>;

    const files: string[] = [];
    const directories: string[] = [];
    const seenFilePaths = new Set<string>();
    const seenDirectoryPaths = new Set<string>();
    const addUniquePath = (bucket: string[], seen: Set<string>, value: string): void => {
      const normalized = value.trim();
      if (!normalized) return;
      const dedupeKey = this.normalizePath(normalized);
      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      bucket.push(normalized);
    };
    const readPathEntry = (rawItem: unknown): { path: string; type?: string } | null => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;
      const item = rawItem as Record<string, unknown>;
      const path = typeof item.path === 'string' ? item.path.trim() : '';
      if (!path) return null;
      const type = typeof item.type === 'string' ? item.type.trim().toLowerCase() : undefined;
      return { path, type };
    };

    if (Array.isArray(context.files)) {
      for (const rawItem of context.files) {
        const entry = readPathEntry(rawItem);
        if (!entry) continue;
        if (entry.type === 'directory') {
          addUniquePath(directories, seenDirectoryPaths, entry.path);
          continue;
        }
        addUniquePath(files, seenFilePaths, entry.path);
      }
    }

    if (Array.isArray(context.directories)) {
      for (const rawItem of context.directories) {
        const entry = readPathEntry(rawItem);
        if (!entry) continue;
        if (entry.type === 'file') {
          addUniquePath(files, seenFilePaths, entry.path);
          continue;
        }
        addUniquePath(directories, seenDirectoryPaths, entry.path);
      }
    }

    const knowledgeBases: Array<{ id: string; title?: string }> = [];
    if (Array.isArray(context.knowledgeBases)) {
      for (const item of context.knowledgeBases) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = typeof obj.id === 'string' ? obj.id.trim() : '';
        const title = typeof obj.title === 'string' ? obj.title.trim() : undefined;
        if (!id) continue;
        knowledgeBases.push(title ? { id, title } : { id });
      }
    }

    const forms: Array<{ id: string; name?: string }> = [];
    if (Array.isArray(context.forms)) {
      for (const item of context.forms) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = typeof obj.id === 'string' ? obj.id.trim() : '';
        const name = typeof obj.name === 'string' ? obj.name.trim() : undefined;
        if (!id) continue;
        forms.push(name ? { id, name } : { id });
      }
    }

    return { files, directories, knowledgeBases, forms };
  }

  private getEnabledDecompositionRules(task: AgentTask): Array<{ name: string; instruction: string }> {
    const rawRules = task.context.additionalContext?.decompositionRules;
    if (!Array.isArray(rawRules)) return [];

    return rawRules
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map(item => ({
        name: typeof item.name === 'string' ? item.name.trim() : '',
        instruction: typeof item.instruction === 'string' ? item.instruction.trim() : '',
      }))
      .filter(rule => rule.name.length > 0 && rule.instruction.length > 0);
  }

  private getEnabledWritingRuleDocuments(task: AgentTask): Array<{ name: string; path: string }> {
    const rawDocuments = task.context.additionalContext?.writingRuleDocuments;
    if (!Array.isArray(rawDocuments)) return [];

    return rawDocuments
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map(item => ({
        name: typeof item.name === 'string' ? item.name.trim() : '',
        path: typeof item.path === 'string' ? item.path.trim() : '',
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      }))
      .filter(item => item.enabled && item.path.length > 0)
      .map(item => ({
        name: item.name || item.path,
        path: item.path,
      }));
  }

  private isWriteLikeStep(step: AgentStep): boolean {
    if (step.type === 'write') return true;
    if (step.type !== 'tool_call' || !step.toolCall) return false;
    return AgentPlanner.FILE_WRITE_TOOLS.has(step.toolCall.toolName);
  }

  private hasRandomReferenceCommandStep(steps: AgentStep[]): boolean {
    return steps.some(step => {
      if (step.type !== 'tool_call' || !step.toolCall || step.toolCall.toolName !== 'bash') {
        return false;
      }
      const command = step.toolCall.parameters?.command;
      if (typeof command !== 'string') return false;
      return command.includes('[reference-article-path]');
    });
  }

  private isRandomReferenceStep(step: AgentStep): boolean {
    const description = step.description || '';
    if (RANDOM_REFERENCE_STEP_HINT_REGEX.test(description)) {
      return true;
    }
    if (step.type !== 'tool_call' || !step.toolCall) return false;
    const command = step.toolCall.parameters?.command;
    if (typeof command !== 'string') return false;
    return RANDOM_REFERENCE_UNIX_COMMAND_REGEX.test(command);
  }

  private normalizeRandomReferenceCommandSteps(steps: AgentStep[]): void {
    for (const step of steps) {
      if (!this.isRandomReferenceStep(step)) continue;
      if (step.type !== 'tool_call') continue;

      step.description = 'Randomly extract one full reference article from workspace by command (.md/.txt).';
      step.toolCall = {
        toolName: 'bash',
        parameters: {
          command: RANDOM_REFERENCE_ARTICLE_COMMAND,
        },
      };
    }
  }

  private hasReferenceArticleAnalysisStep(steps: AgentStep[]): boolean {
    return steps.some(step => {
      if (step.type !== 'think') return false;
      const text = step.description.toLowerCase();
      return text.includes('reference article')
        && (text.includes('framework') || text.includes('style') || text.includes('logic chain'));
    });
  }

  private hasUserRequirementDecompositionStep(steps: AgentStep[]): boolean {
    return steps.some(step =>
      step.type === 'think' && USER_REQUIREMENT_DECOMPOSITION_REGEX.test(step.description)
    );
  }

  private postProcessPlanSteps(task: AgentTask, inputSteps: AgentStep[]): AgentStep[] {
    const steps = [...inputSteps];
    const isWriteOrEditTask = task.type === 'write' || task.type === 'edit';
    const taskIntent = this.getTaskIntent(task);
    const isGenerateTask = task.type === 'write' || taskIntent === 'generate_document';
    const referencedContext = this.getReferencedContext(task);
    const hasReferencedContext = referencedContext.files.length > 0
      || referencedContext.directories.length > 0
      || referencedContext.knowledgeBases.length > 0
      || referencedContext.forms.length > 0;

    if (!isWriteOrEditTask) {
      return steps;
    }

    this.normalizeRandomReferenceCommandSteps(steps);

    if (!this.hasUserRequirementDecompositionStep(steps)) {
      steps.unshift(
        this.createSyntheticStep(
          'think',
          'Decompose user requirements into a structured writing brief before any writing. Extract and lock: topic, core objective, target audience/persona, style/tone, desired length, provided main sub-headings, must-include points, must-avoid points, and acceptance checklist. Output concise JSON plus TODO checklist.'
        )
      );
    }

    const hasTaskKindJudgeStep = steps.some(step => {
      const desc = step.description.toLowerCase();
      return desc.includes('浠诲姟绫诲瀷') || desc.includes('鐢熸垚') || desc.includes('鏀瑰啓');
    });
    if (!hasTaskKindJudgeStep) {
      steps.unshift(
        this.createSyntheticStep(
          'think',
          'First determine the task kind: generate a new document or rewrite the current one, then continue.'
        )
      );
    }

    const insertBeforeWrite = (): number => {
      const writeIndex = steps.findIndex(step => this.isWriteLikeStep(step));
      return writeIndex >= 0 ? writeIndex : steps.length;
    };

    if (!this.hasRandomReferenceCommandStep(steps)) {
      steps.splice(
        insertBeforeWrite(),
        0,
        this.createSyntheticStep(
          'tool_call',
          'Randomly extract one full reference article from workspace by command (.md/.txt).',
          {
            toolName: 'bash',
            parameters: {
              command: RANDOM_REFERENCE_ARTICLE_COMMAND,
            },
          }
        )
      );
    }

    if (!this.hasReferenceArticleAnalysisStep(steps)) {
      steps.splice(
        insertBeforeWrite(),
        0,
        this.createSyntheticStep(
          'think',
          'Analyze the full reference article and extract framework, style, sentence patterns, structure, logic chain, wording, transitions, turning points, and case usage. Apply these traits to the final writing.'
        )
      );
    }

    const decompositionRules = this.getEnabledDecompositionRules(task);
    const decompositionRuleSummary = decompositionRules.length > 0
      ? decompositionRules.map(rule => `${rule.name}: ${rule.instruction}`).join('; ')
      : 'No custom decomposition rules; apply the full default decomposition dimensions.';

    const hasMetaFrameworkStep = steps.some(step =>
      step.type === 'think'
      && /meta framework|overall framework|总分总|元框架/i.test(step.description)
    );
    if (!hasMetaFrameworkStep) {
      steps.splice(
        insertBeforeWrite(),
        0,
        this.createSyntheticStep(
          'think',
          `Extract the article meta framework first (e.g. total-sub-total or other structure). Decomposition rules: ${decompositionRuleSummary}`
        )
      );
    }

    const hasHeadingDecisionStep = steps.some(step =>
      step.type === 'think'
      && /sub[-\s]?heading|小标题|heading decision/i.test(step.description)
    );
    if (!hasHeadingDecisionStep) {
      steps.splice(
        insertBeforeWrite(),
        0,
        this.createSyntheticStep(
          'think',
          'Decide whether the reference article has major sub-headings. If absent, decompose by paragraphs directly; if present, derive major sub-headings from the meta framework.'
        )
      );
    }

    const hasParagraphDecompositionStep = steps.some(step =>
      step.type === 'think'
      && /paragraph decomposition|段落拆解|sentence-level map/i.test(step.description)
    );
    if (!hasParagraphDecompositionStep) {
      steps.splice(
        insertBeforeWrite(),
        0,
        this.createSyntheticStep(
          'think',
          `Perform paragraph-level decomposition with sentence mapping. Cover: ${PARAGRAPH_DECOMPOSITION_DIMENSIONS}. Use decomposition rules as mandatory constraints: ${decompositionRuleSummary}`
        )
      );
    }

    if (isGenerateTask) {
      if (hasReferencedContext) {
        const fileTargets = referencedContext.files.slice(0, AgentPlanner.MAX_REFERENCED_FILES);
        const directoryTargets = referencedContext.directories.slice(0, AgentPlanner.MAX_REFERENCED_DIRECTORIES);
        const kbTargets = referencedContext.knowledgeBases.slice(0, AgentPlanner.MAX_REFERENCED_KBS);
        const formTargets = referencedContext.forms.slice(0, AgentPlanner.MAX_REFERENCED_FORMS);

        for (const dirPath of directoryTargets) {
          steps.splice(
            insertBeforeWrite(),
            0,
            this.createSyntheticStep('tool_call', `鏌ヨ寮曠敤鐩綍缁撴瀯: ${dirPath}`, {
              toolName: 'list_files',
              parameters: { path: dirPath, recursive: true, maxDepth: AgentPlanner.GENERATION_SCAN_DEPTH },
            })
          );
        }

        for (const filePath of fileTargets) {
          steps.splice(
            insertBeforeWrite(),
            0,
            this.createSyntheticStep('tool_call', `璇诲彇寮曠敤鏂囦欢涓婁笅鏂? ${filePath}`, {
              toolName: 'read_file',
              parameters: { path: filePath },
            })
          );
        }

        for (const kb of kbTargets) {
          steps.splice(
            insertBeforeWrite(),
            0,
            this.createSyntheticStep('tool_call', `鏌ヨ寮曠敤鐭ヨ瘑搴? ${kb.title || kb.id}`, {
              toolName: 'query_knowledge',
              parameters: { query: task.description, maxResults: 8 },
            })
          );
        }

        for (const form of formTargets) {
          steps.splice(
            insertBeforeWrite(),
            0,
            this.createSyntheticStep('tool_call', `鏌ヨ寮曠敤琛ㄥ崟: ${form.name || form.id}`, {
              toolName: 'query_form',
              parameters: { formId: form.id, query: task.description, limit: 50, offset: 0 },
            })
          );
        }
      } else {
        steps.splice(
          insertBeforeWrite(),
          0,
          this.createSyntheticStep('tool_call', 'Scan workspace files first (priority context for generation tasks)', {
            toolName: 'list_files',
            parameters: { path: '.', recursive: true, maxDepth: AgentPlanner.GENERATION_SCAN_DEPTH },
          })
        );
      }

      const hasWorkspaceFirstFrameworkStep = steps.some(step => {
        const desc = step.description.toLowerCase();
        return desc.includes('workspace') && (desc.includes('framework') || desc.includes('decompose'));
      });
      if (!hasWorkspaceFirstFrameworkStep) {
        steps.splice(
          insertBeforeWrite(),
          0,
          this.createSyntheticStep(
            'think',
            'The article framework must be derived from workspace directories/referenced files first, then expanded by topic.'
          )
        );
      }
    }

    const writingRuleDocuments = this.getEnabledWritingRuleDocuments(task);
    if (writingRuleDocuments.length > 0) {
      const normalizedReadPaths = new Set<string>();
      for (const step of steps) {
        if (step.type !== 'tool_call' || !step.toolCall || step.toolCall.toolName !== 'read_file') {
          continue;
        }
        const pathParam = step.toolCall.parameters?.path;
        if (typeof pathParam !== 'string' || pathParam.trim().length === 0) {
          continue;
        }
        normalizedReadPaths.add(this.normalizePath(pathParam));
      }

      const insertBeforeWrite = (): number => {
        const writeIndex = steps.findIndex(step => this.isWriteLikeStep(step));
        return writeIndex >= 0 ? writeIndex : steps.length;
      };

      for (const document of writingRuleDocuments.slice(0, AgentPlanner.MAX_REFERENCED_FILES)) {
        const normalizedPath = this.normalizePath(document.path);
        if (!normalizedPath || normalizedReadPaths.has(normalizedPath)) {
          continue;
        }

        steps.splice(
          insertBeforeWrite(),
          0,
          this.createSyntheticStep('tool_call', `读取写作规则文档: ${document.name}`, {
            toolName: 'read_file',
            parameters: { path: document.path },
          })
        );
        normalizedReadPaths.add(normalizedPath);
      }

      const hasWritingRuleStep = steps.some(step => {
        const text = step.description.toLowerCase();
        return text.includes('写作规则') || text.includes('writing rule') || text.includes('style rule');
      });
      if (!hasWritingRuleStep) {
        const summary = writingRuleDocuments
          .slice(0, AgentPlanner.MAX_REFERENCED_FILES)
          .map(document => document.name)
          .join('; ');
        steps.splice(
          insertBeforeWrite(),
          0,
          this.createSyntheticStep(
            'think',
            `在最终写作或改写前，必须严格应用以下写作规则文档中的要求: ${summary}`
          )
        );
      }
    }

    const hasExplicitWriteStep = steps.some(step => step.type === 'write');
    if (!hasExplicitWriteStep) {
      const firstFileWriteToolIndex = steps.findIndex(step =>
        step.type === 'tool_call'
        && !!step.toolCall
        && AgentPlanner.FILE_WRITE_TOOLS.has(step.toolCall.toolName)
      );
      const insertIndex = firstFileWriteToolIndex >= 0 ? firstFileWriteToolIndex : steps.length;
      steps.splice(
        insertIndex,
        0,
        this.createSyntheticStep(
          'write',
          'Write paragraph by paragraph based on the paragraph decomposition cards and reference-article style traits.'
        )
      );
    }

    const firstWriteLikeIndex = steps.findIndex(step => this.isWriteLikeStep(step));
    const scoringVerifyIndex = steps.findIndex(step =>
      step.type === 'verify'
      && /sentence[-\s]?by[-\s]?sentence|逐句|score|评分/i.test(step.description)
    );
    if (scoringVerifyIndex < 0 && firstWriteLikeIndex >= 0) {
      const firstVerifyAfterWrite = steps.findIndex((step, index) =>
        index > firstWriteLikeIndex && step.type === 'verify'
      );
      const insertIndex = firstVerifyAfterWrite >= 0 ? firstVerifyAfterWrite : firstWriteLikeIndex + 1;
      steps.splice(
        insertIndex,
        0,
        this.createSyntheticStep(
          'verify',
          'Do sentence-by-sentence comparison between each drafted paragraph and its decomposition paragraph. Score each paragraph and each sentence. If any score is lower than decomposition baseline, output weaknesses and optimization directives.'
        )
      );
    }

    const optimizeWriteIndex = steps.findIndex(step =>
      step.type === 'write'
      && /optimi|低分|score|评分|improve/i.test(step.description)
    );
    if (optimizeWriteIndex < 0) {
      const scoringIndex = steps.findIndex(step =>
        step.type === 'verify'
        && /sentence[-\s]?by[-\s]?sentence|逐句|score|评分/i.test(step.description)
      );
      if (scoringIndex >= 0) {
        steps.splice(
          scoringIndex + 1,
          0,
          this.createSyntheticStep(
            'write',
            'Optimize all low-score paragraphs according to verification scoring results, then output the revised full content.'
          )
        );
      }
    }

    const hasVerifyStep = steps.some(step => step.type === 'verify');
    if (!hasVerifyStep || steps[steps.length - 1]?.type !== 'verify') {
      steps.push(
        this.createSyntheticStep(
          'verify',
          'Final gate: verify task completeness and style consistency after optimization. Confirm decomposition > writing > verify > scoring > optimize loop is satisfied.'
        )
      );
    }

    const maxSteps = this.config.maxPlanSteps || 20;
    if (steps.length > maxSteps) {
      const trimmed = steps.slice(0, maxSteps);
      if (trimmed[trimmed.length - 1]?.type !== 'verify') {
        trimmed[trimmed.length - 1] = this.createSyntheticStep(
          'verify',
          'Verify task completeness, factual correctness, and style consistency.'
        );
      }
      return trimmed;
    }

    return steps;
  }

  /**
   * 瑙ｆ瀽 LLM 鍝嶅簲涓烘墽琛岃鍒?   */
  private parsePlanResponse(response: string, task: AgentTask): AgentPlan {
    try {
      // 灏濊瘯浠庡搷搴斾腑鎻愬彇 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const steps: AgentStep[] = (parsed.steps || []).map((step: any, index: number) => {
          // 鍏煎 LLM 鍙兘浣跨敤鐨勫绉嶅瓧娈靛悕
          const toolName = step.toolName || step.tool_name || step.tool || step.name;
          const toolParams = step.toolParams || step.tool_params || step.params || step.parameters || {};
          return {
            id: `step_${Date.now()}_${index}`,
            type: this.normalizeStepType(step.type),
            description: step.description || `姝ラ ${index + 1}`,
            status: 'pending' as const,
            toolCall: (step.type === 'tool_call' || step.type === 'tool') && toolName ? {
              toolName,
              parameters: toolParams
            } : undefined
          };
        });

        const processedSteps = this.postProcessPlanSteps(task, steps);

        return {
          taskId: task.id,
          steps: processedSteps,
          estimatedSteps: parsed.estimatedSteps || processedSteps.length,
          currentStepIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
    } catch (error) {
      console.warn('[AgentPlanner] 瑙ｆ瀽 JSON 鍝嶅簲澶辫触锛屽皾璇曟枃鏈В鏋?', error);
    }

    // 濡傛灉 JSON 瑙ｆ瀽澶辫触锛屽皾璇曚粠鏂囨湰涓彁鍙栨楠?
    const steps = this.postProcessPlanSteps(task, this.parseStepsFromText(response));

    return {
      taskId: task.id,
      steps,
      estimatedSteps: steps.length,
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 浠庡搷搴斾腑瑙ｆ瀽姝ラ
   */
  private parseStepsFromResponse(response: string): AgentStep[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.steps && Array.isArray(parsed.steps)) {
          return parsed.steps.map((step: any, index: number) => {
            const toolName = step.toolName || step.tool_name || step.tool || step.name;
            const toolParams = step.toolParams || step.tool_params || step.params || step.parameters || {};
            return {
              id: `step_${Date.now()}_${index}`,
              type: this.normalizeStepType(step.type),
              description: step.description || `姝ラ ${index + 1}`,
              status: 'pending' as const,
              toolCall: (step.type === 'tool_call' || step.type === 'tool') && toolName ? {
                toolName,
                parameters: toolParams
              } : undefined
            };
          });
        }
      }
    } catch (error) {
      console.warn('[AgentPlanner] 瑙ｆ瀽姝ラ澶辫触:', error);
    }

    return this.parseStepsFromText(response);
  }

  /**
   * 浠庢枃鏈腑瑙ｆ瀽姝ラ锛堝鐢ㄦ柟妗堬級
   */
  private parseStepsFromText(text: string): AgentStep[] {
    const steps: AgentStep[] = [];

    // 灏濊瘯鍖归厤缂栧彿鍒楄〃鏍煎紡
    const listPattern = /(?:^|\n)\s*(?:\d+[\.\)]\s*|[-*]\s*)(.+)/g;
    let match;
    let index = 0;

    while ((match = listPattern.exec(text)) !== null) {
      const description = match[1].trim();
      if (description.length > 0) {
        steps.push({
          id: `step_${Date.now()}_${index}`,
          type: this.inferStepType(description),
          description,
          status: 'pending'
        });
        index++;
      }
    }

    // 濡傛灉娌℃湁鎵惧埌鍒楄〃鏍煎紡锛屽垱寤轰竴涓粯璁ゆ楠?
    if (steps.length === 0) {
      steps.push({
        id: `step_${Date.now()}_0`,
        type: 'think',
        description: 'Analyze task requirements',
        status: 'pending'
      });
    }

    return steps;
  }

  /**
   * 鏍囧噯鍖栨楠ょ被鍨?
   */
  private normalizeStepType(type: string): AgentStepType {
    const typeMap: Record<string, AgentStepType> = {
      'think': 'think',
      'thinking': 'think',
      'analyze': 'think',
      'tool_call': 'tool_call',
      'tool': 'tool_call',
      'call': 'tool_call',
      'write': 'write',
      'output': 'write',
      'verify': 'verify',
      'check': 'verify',
      'validate': 'verify',
      'wait_confirmation': 'wait_confirmation',
      'confirm': 'wait_confirmation'
    };

    return typeMap[type?.toLowerCase()] || 'think';
  }

  /**
   * 浠庢弿杩版帹鏂楠ょ被鍨?
   */
  private inferStepType(description: string): AgentStepType {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('verify') || lowerDesc.includes('check') || lowerDesc.includes('validate')) {
      return 'verify';
    }

    if (lowerDesc.includes('鍐欏叆') || lowerDesc.includes('杈撳嚭') || lowerDesc.includes('鐢熸垚')) {
      return 'write';
    }

    if (lowerDesc.includes('璋冪敤') || lowerDesc.includes('浣跨敤') || lowerDesc.includes('鎵ц')) {
      return 'tool_call';
    }

    return 'think';
  }

  /**
   * 鏇存柊閰嶇疆
   */
  updateConfig(config: Partial<AgentPlannerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 鑾峰彇鍙敤宸ュ叿鍒楄〃
   */
  getAvailableTools(): AgentTool[] {
    return [...this.config.availableTools];
  }

  /**
   * 娣诲姞宸ュ叿
   */
  addTool(tool: AgentTool): void {
    const existingIndex = this.config.availableTools.findIndex(t => t.name === tool.name);
    if (existingIndex >= 0) {
      this.config.availableTools[existingIndex] = tool;
    } else {
      this.config.availableTools.push(tool);
    }
  }

  /**
   * 绉婚櫎宸ュ叿
   */
  removeTool(toolName: string): void {
    this.config.availableTools = this.config.availableTools.filter(t => t.name !== toolName);
  }
}
