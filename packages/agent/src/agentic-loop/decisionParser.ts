/**
 * Decision parser for Agentic Loop model outputs.
 */

import { parse as parseJsonc } from 'jsonc-parser';
import type { AgentLoopDecision, AgentLoopDecisionAction } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeDecisionJsonCandidate = (value: string): string => {
  const quoteChars = new Set(['"', '\'', '鈥?', '鈥?', '鈥?', '鈥?']);
  const getNextSignificantChar = (source: string, startIndex: number): string => {
    for (let index = startIndex; index < source.length; index += 1) {
      const char = source[index];
      if (!/\s/.test(char)) {
        return char;
      }
    }
    return '';
  };

  let normalized = '';
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (!inString) {
      if (quoteChars.has(char)) {
        inString = true;
        normalized += '"';
        continue;
      }

      if (char === '锛?') {
        normalized += ',';
        continue;
      }
      if (char === '锛?') {
        normalized += ':';
        continue;
      }
      if (char === '锛?') {
        normalized += ';';
        continue;
      }
      if (char === '\u00A0') {
        normalized += ' ';
        continue;
      }

      normalized += char;
      continue;
    }

    if (quoteChars.has(char)) {
      const nextSignificantChar = getNextSignificantChar(value, index + 1);
      if (!nextSignificantChar || [':', '锛?', ',', '锛?', '}', ']'].includes(nextSignificantChar)) {
        inString = false;
        normalized += '"';
        continue;
      }

      normalized += '\\"';
      continue;
    }

    if (char === '\\') {
      normalized += '\\\\';
      continue;
    }

    if (char === '\n') {
      normalized += '\\n';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    normalized += char;
  }

  if (inString) {
    normalized += '"';
  }

  return normalized;
};

export const parseAgentLoopDecision = (raw: string): AgentLoopDecision | null => {
  const normalizedRaw = normalizeText(raw);
  if (!normalizedRaw) {
    return null;
  }

  const candidates: string[] = [normalizedRaw];
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fencedMatch = fencedRegex.exec(normalizedRaw);
  while (fencedMatch) {
    const candidate = normalizeText(fencedMatch[1]);
    if (candidate) {
      candidates.push(candidate);
    }
    fencedMatch = fencedRegex.exec(normalizedRaw);
  }

  const firstBraceIndex = normalizedRaw.indexOf('{');
  const lastBraceIndex = normalizedRaw.lastIndexOf('}');
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    candidates.push(normalizedRaw.slice(firstBraceIndex, lastBraceIndex + 1).trim());
  }

  for (const candidate of Array.from(new Set(candidates))) {
    const normalizedCandidate = normalizeDecisionJsonCandidate(candidate);
    try {
      const parsed = (() => {
        try {
          return JSON.parse(normalizedCandidate);
        } catch {
          return parseJsonc(normalizedCandidate);
        }
      })();

      if (!isRecord(parsed)) {
        continue;
      }

      const actionValue = normalizeText(parsed.action ?? parsed.type ?? parsed.mode).toLowerCase();
      const action: AgentLoopDecisionAction = actionValue.includes('tool') ? 'tool_call' : 'final';
      const toolName = normalizeText(parsed.tool_name ?? parsed.toolName ?? parsed.tool);
      const parametersValue = parsed.parameters ?? parsed.params;
      const parameters = isRecord(parametersValue) ? parametersValue : {};

      if (action === 'tool_call' && !toolName) {
        continue;
      }

      return {
        action,
        thinking: normalizeText(parsed.thinking ?? parsed.reason ?? parsed.thought),
        toolName: toolName || undefined,
        parameters,
        finalAnswer: normalizeText(
          parsed.final_answer ?? parsed.finalAnswer ?? parsed.final ?? parsed.output,
        ) || undefined,
      };
    } catch {
      // Ignore invalid candidates and continue.
    }
  }

  return null;
};
