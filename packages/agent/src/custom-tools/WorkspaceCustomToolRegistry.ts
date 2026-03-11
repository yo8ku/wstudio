/**
 * Loads workspace-scoped custom tools from a project config file and turns them
 * into executable Agent tools.
 */

import { exec, type ExecException } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  AgentExecutableToolDefinition,
  AgentToolInputSchema,
  AgentToolExecutionResult,
  ResolvedAgentWorkspaceToolOptions,
} from '../types';
import { assessCommandSecurity, resolveAgentWorkspaceToolOptions, resolveWorkspacePath } from '../tool-execution';
import type {
  AgentCustomCommandToolConfig,
  AgentCustomToolConfigFile,
  AgentWorkspaceCustomToolRegistry,
  AgentWorkspaceCustomToolRegistryOptions,
} from './types';

const DEFAULT_CONFIG_FILE_PATH = '.note-studio/agent-tools.json';

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
};

const escapeShellValue = (value: string): string =>
  process.platform === 'win32'
    ? `"${value.replace(/"/g, '\\"')}"`
    : `'${value.replace(/'/g, `'\"'\"'`)}'`;

const renderCommandTemplate = (
  template: string,
  input: Record<string, unknown>,
): string => template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
  const rawValue = input[key];
  if (rawValue == null) {
    return '';
  }

  if (typeof rawValue === 'string') {
    return escapeShellValue(rawValue);
  }

  if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue);
  }

  return escapeShellValue(JSON.stringify(rawValue));
});

const parseInputSchema = (value: unknown): AgentToolInputSchema | null => {
  if (!isRecord(value) || value.type !== 'object' || !isRecord(value.properties)) {
    return null;
  }

  return value as unknown as AgentToolInputSchema;
};

const parseCustomCommandToolConfig = (value: unknown): AgentCustomCommandToolConfig | null => {
  if (!isRecord(value)) {
    return null;
  }

  const name = normalizeText(value.name);
  const description = normalizeText(value.description);
  const commandTemplate = normalizeText(value.commandTemplate);
  const inputSchema = parseInputSchema(value.input_schema);

  if (!name || !description || !commandTemplate || !inputSchema || inputSchema.type !== 'object') {
    return null;
  }

  return {
    type: 'command',
    name,
    description,
    input_schema: inputSchema,
    commandTemplate,
    cwd: normalizeText(value.cwd) || undefined,
    timeoutMs: typeof value.timeoutMs === 'number' ? value.timeoutMs : undefined,
    requiresConfirmation: value.requiresConfirmation === true,
    requestType: value.requestType === 'file_write'
      || value.requestType === 'command_execute'
      || value.requestType === 'diff_apply'
      || value.requestType === 'custom'
      ? value.requestType
      : 'custom',
  };
};

const parseConfigFile = (value: unknown): AgentCustomToolConfigFile => {
  if (!isRecord(value) || !Array.isArray(value.tools)) {
    return { tools: [] };
  }

  return {
    tools: value.tools
      .map(item => parseCustomCommandToolConfig(item))
      .filter((item): item is AgentCustomCommandToolConfig => item !== null),
  };
};

const executeCustomCommand = async (
  command: string,
  cwd: string,
  timeoutMs: number,
  maxBuffer: number,
): Promise<AgentToolExecutionResult> => {
  const security = assessCommandSecurity(command);
  if (security.level === 'blocked') {
    return {
      success: false,
      error: security.reasons[0] || 'command blocked by security policy',
      data: {
        command,
        security,
      },
    };
  }

  return new Promise(resolve => {
    exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer,
        env: { ...process.env },
        windowsHide: true,
      },
      (
        error: ExecException | null,
        stdout: string,
        stderr: string,
      ) => {
        if (error) {
          resolve({
            success: false,
            error: error.killed ? `command timed out after ${timeoutMs}ms` : error.message,
            data: {
              command,
              security,
              stdout,
              stderr: stderr || error.message,
              exitCode: typeof error.code === 'number' ? error.code : 1,
            },
          });
          return;
        }

        resolve({
          success: true,
          data: {
            command,
            security,
            stdout,
            stderr,
            exitCode: 0,
          },
        });
      },
    );
  });
};

export class WorkspaceCustomToolRegistry implements AgentWorkspaceCustomToolRegistry {
  private readonly configFilePath: string;
  private readonly toolOptions: ResolvedAgentWorkspaceToolOptions;

  constructor(private readonly options?: AgentWorkspaceCustomToolRegistryOptions) {
    this.configFilePath = normalizeText(options?.configFilePath) || DEFAULT_CONFIG_FILE_PATH;
    this.toolOptions = resolveAgentWorkspaceToolOptions(options?.toolOptions);
  }

  async list(workspacePath: string): Promise<AgentExecutableToolDefinition[]> {
    const configPath = path.resolve(workspacePath, this.configFilePath);
    const rawContent = await fs.readFile(configPath, 'utf8').catch(() => '');
    if (!rawContent.trim()) {
      return [];
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(rawContent);
    } catch (error) {
      throw new Error(
        `failed to parse custom tool config ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const config = parseConfigFile(parsedContent);
    return config.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
      requiresConfirmation: tool.requiresConfirmation === true,
      requestType: tool.requestType,
      execute: async (input, context) => {
        const cwd = tool.cwd
          ? resolveWorkspacePath(context.workspacePath, tool.cwd, this.toolOptions)
          : path.resolve(context.workspacePath);
        const command = renderCommandTemplate(tool.commandTemplate, input);
        const timeoutMs = Math.min(
          this.toolOptions.maxCommandTimeoutMs,
          toPositiveInteger(tool.timeoutMs, 30000),
        );

        return executeCustomCommand(
          command,
          cwd,
          timeoutMs,
          this.toolOptions.maxCommandBufferBytes,
        );
      },
    }));
  }
}

export const createWorkspaceCustomToolRegistry = (
  options?: AgentWorkspaceCustomToolRegistryOptions,
): AgentWorkspaceCustomToolRegistry => new WorkspaceCustomToolRegistry(options);
