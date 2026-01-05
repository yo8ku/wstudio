/**
 * 命令解析工具
 * 功能：解析 AI 输入框中的命令，支持 /query:、/update:、/delete: 等命令格式
 */

/** 命令类型 */
export type CommandType = 'generate' | 'query' | 'update' | 'delete';

/** 命令解析结果 */
export interface ParsedCommand {
  /** 命令类型 */
  type: CommandType;
  /** 命令内容（去除命令前缀后的内容） */
  content: string;
  /** 原始输入 */
  raw: string;
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息 */
  errorMessage?: string;
}

/** 命令配置 */
export interface CommandConfig {
  /** 命令前缀 */
  prefix: string;
  /** 命令类型 */
  type: CommandType;
  /** 命令描述 */
  description: string;
}

/** 默认命令配置 */
const DEFAULT_COMMANDS: CommandConfig[] = [
  { prefix: '/query:', type: 'query', description: '查询表格数据' },
  { prefix: '/update:', type: 'update', description: '更新表格数据' },
  { prefix: '/delete:', type: 'delete', description: '删除表格数据' },
];

/**
 * 命令解析器类
 */
export class CommandParser {
  private commands: CommandConfig[];
  private requireCommand: boolean;

  /**
   * 构造函数
   * @param commands 命令配置列表
   * @param requireCommand 是否要求必须使用命令（false 时无命令默认为 generate）
   */
  constructor(commands: CommandConfig[] = DEFAULT_COMMANDS, requireCommand = false) {
    this.commands = commands;
    this.requireCommand = requireCommand;
  }

  /**
   * 解析输入内容
   * @param input 用户输入
   * @returns 解析结果
   */
  parse(input: string): ParsedCommand {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return {
        type: 'generate',
        content: '',
        raw: input,
        isValid: false,
        errorMessage: '请输入内容',
      };
    }

    // 检查是否匹配任何命令
    for (const cmd of this.commands) {
      if (trimmedInput.toLowerCase().startsWith(cmd.prefix.toLowerCase())) {
        const content = trimmedInput.substring(cmd.prefix.length).trim();
        if (!content) {
          return {
            type: cmd.type,
            content: '',
            raw: input,
            isValid: false,
            errorMessage: `请在 ${cmd.prefix} 后输入内容`,
          };
        }
        return {
          type: cmd.type,
          content,
          raw: input,
          isValid: true,
        };
      }
    }

    // 没有匹配到命令
    if (this.requireCommand) {
      // 如果要求必须使用命令，检查是否以 / 开头但命令无效
      if (trimmedInput.startsWith('/')) {
        return {
          type: 'generate',
          content: trimmedInput,
          raw: input,
          isValid: false,
          errorMessage: `无效的命令，支持的命令：${this.commands.map(c => c.prefix).join('、')}`,
        };
      }
      // 没有命令前缀，默认为生成
      return {
        type: 'generate',
        content: trimmedInput,
        raw: input,
        isValid: true,
      };
    }

    // 不要求命令，默认为生成
    return {
      type: 'generate',
      content: trimmedInput,
      raw: input,
      isValid: true,
    };
  }

  /**
   * 验证输入是否可以发送
   * @param input 用户输入
   * @returns 是否可以发送
   */
  canSend(input: string): boolean {
    const result = this.parse(input);
    return result.isValid;
  }

  /**
   * 获取所有支持的命令
   * @returns 命令配置列表
   */
  getCommands(): CommandConfig[] {
    return [...this.commands];
  }

  /**
   * 获取命令提示文本
   * @returns 提示文本
   */
  getHelpText(): string {
    const cmdTexts = this.commands.map(c => `${c.prefix} ${c.description}`);
    return `支持的命令：\n${cmdTexts.join('\n')}\n直接输入内容则默认生成表格`;
  }
}

/** 表格设计器命令解析器实例 */
export const tableDesignerCommandParser = new CommandParser(DEFAULT_COMMANDS, false);
