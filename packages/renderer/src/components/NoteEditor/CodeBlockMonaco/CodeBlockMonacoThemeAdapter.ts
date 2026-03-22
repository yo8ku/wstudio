/**
 * CodeBlockMonaco 主题适配器。
 * 负责将共享主题数据转换为 Monaco 代码块主题，并完成注册与应用。
 */

import type { ThemeData } from '@note-studio/shared';
import type { editor } from 'monaco-editor';
import { themeService } from '../../../services/ThemeService';

type MonacoThemeBase = 'vs' | 'vs-dark' | 'hc-black';

export interface MonacoThemeEditorApi {
  defineTheme: (themeId: string, themeData: editor.IStandaloneThemeData) => void;
  setTheme: (themeId: string) => void;
}

const normalizeMonacoTokenColor = (color: string): string => {
  const normalized = color.trim();
  if (!normalized.startsWith('#')) {
    return normalized;
  }

  if (normalized.length === 4) {
    const red = normalized[1];
    const green = normalized[2];
    const blue = normalized[3];
    return `${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }

  return normalized.slice(1).toLowerCase();
};

const resolveMonacoThemeBase = (themeType: ThemeData['type']): MonacoThemeBase => {
  switch (themeType) {
    case 'light':
    case 'hcLight':
      return 'vs';
    case 'hc':
      return 'hc-black';
    case 'dark':
    default:
      return 'vs-dark';
  }
};

export const getCodeBlockMonacoThemeId = (themeId: string): string => `custom-${themeId}`;

export function createCodeBlockMonacoThemeData(
  themeData: ThemeData
): editor.IStandaloneThemeData {
  const colors: Record<string, string> = {};
  for (const [key, value] of Object.entries(themeData.colors)) {
    colors[key] = value;
  }

  const rules: editor.ITokenThemeRule[] = [];
  for (const token of themeData.tokenColors) {
    for (const scope of token.scope) {
      const normalizedScope = scope.trim();
      if (!normalizedScope) {
        continue;
      }

      const rule: editor.ITokenThemeRule = { token: normalizedScope };

      if (token.settings.foreground) {
        rule.foreground = normalizeMonacoTokenColor(token.settings.foreground);
      }

      if (token.settings.background) {
        rule.background = normalizeMonacoTokenColor(token.settings.background);
      }

      if (token.settings.fontStyle) {
        rule.fontStyle = token.settings.fontStyle;
      }

      rules.push(rule);
    }
  }

  return {
    base: resolveMonacoThemeBase(themeData.type),
    inherit: true,
    rules,
    colors,
  };
}

export async function applyStoredCodeBlockMonacoTheme(
  themeId: string,
  monacoEditor: MonacoThemeEditorApi
): Promise<boolean> {
  const themeData = await themeService.getTheme(themeId);
  if (!themeData) {
    return false;
  }

  const registeredThemeId = getCodeBlockMonacoThemeId(themeId);
  monacoEditor.defineTheme(registeredThemeId, createCodeBlockMonacoThemeData(themeData));
  monacoEditor.setTheme(registeredThemeId);
  return true;
}