/**
 * 插件 manifest 的结构与引用校验。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExtensionManifest } from '@note-studio/extension-api';
import type {
  ExtensionManifestIssue,
  ExtensionManifestValidationOptions,
  ExtensionManifestValidationResult,
} from './types';

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const ENTRY_FILE_PATTERN = /\.(cjs|mjs|js)$/;
const WEBVIEW_ENTRY_PATTERN = /\.(html|htm)$/i;
const SVG_ICON_PATTERN = /\.svg$/i;
const MANIFEST_ID_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

type ParsedSemver = readonly [number, number, number];

function pushIssue(
  issues: ExtensionManifestIssue[],
  code: string,
  fieldPath: string,
  message: string,
): void {
  issues.push({
    code,
    path: fieldPath,
    message,
  });
}

function parseSemver(version: string): ParsedSemver | undefined {
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    return undefined;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  ];
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  if (left[0] !== right[0]) {
    return left[0] - right[0];
  }

  if (left[1] !== right[1]) {
    return left[1] - right[1];
  }

  return left[2] - right[2];
}

function isVersionCompatible(range: string, hostVersion: string): boolean {
  const normalizedRange = range.trim();
  if (normalizedRange === '*') {
    return true;
  }

  const host = parseSemver(hostVersion);
  if (!host) {
    return false;
  }

  const exact = parseSemver(normalizedRange);
  if (exact) {
    return compareSemver(host, exact) === 0;
  }

  if (normalizedRange.startsWith('^')) {
    const baseline = parseSemver(normalizedRange.slice(1));
    if (!baseline) {
      return false;
    }

    return host[0] === baseline[0] && compareSemver(host, baseline) >= 0;
  }

  if (normalizedRange.startsWith('~')) {
    const baseline = parseSemver(normalizedRange.slice(1));
    if (!baseline) {
      return false;
    }

    return host[0] === baseline[0]
      && host[1] === baseline[1]
      && compareSemver(host, baseline) >= 0;
  }

  if (normalizedRange.startsWith('>=')) {
    const baseline = parseSemver(normalizedRange.slice(2));
    return baseline ? compareSemver(host, baseline) >= 0 : false;
  }

  if (normalizedRange.startsWith('>')) {
    const baseline = parseSemver(normalizedRange.slice(1));
    return baseline ? compareSemver(host, baseline) > 0 : false;
  }

  if (normalizedRange.startsWith('<=')) {
    const baseline = parseSemver(normalizedRange.slice(2));
    return baseline ? compareSemver(host, baseline) <= 0 : false;
  }

  if (normalizedRange.startsWith('<')) {
    const baseline = parseSemver(normalizedRange.slice(1));
    return baseline ? compareSemver(host, baseline) < 0 : false;
  }

  if (normalizedRange.startsWith('=')) {
    const baseline = parseSemver(normalizedRange.slice(1));
    return baseline ? compareSemver(host, baseline) === 0 : false;
  }

  return false;
}

function isPathInsideRoot(rootDirectory: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDirectory, targetPath);
  return relativePath.length > 0
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath);
}

function collectDuplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return Array.from(duplicates.values());
}

function toStableJsonKey(value: object | string | number | boolean | null): string {
  return JSON.stringify(value);
}

function validateSvgIconPath(
  issues: ExtensionManifestIssue[],
  rootDirectory: string,
  fieldPath: string,
  iconPath: string,
): void {
  if (path.isAbsolute(iconPath)) {
    pushIssue(
      issues,
      'MANIFEST_ICON_INVALID',
      fieldPath,
      `icon 必须是插件目录内的相对 SVG 路径: ${iconPath}`,
    );
    return;
  }

  const normalizedIconPath = iconPath.replace(/\\/g, '/');
  if (!SVG_ICON_PATTERN.test(normalizedIconPath)) {
    pushIssue(
      issues,
      'MANIFEST_ICON_INVALID',
      fieldPath,
      `icon 必须指向 SVG 文件: ${iconPath}`,
    );
    return;
  }

  const resolvedIconPath = path.resolve(rootDirectory, iconPath);
  if (!isPathInsideRoot(rootDirectory, resolvedIconPath)) {
    pushIssue(
      issues,
      'MANIFEST_ICON_ESCAPE',
      fieldPath,
      `icon 不能越出插件根目录: ${iconPath}`,
    );
    return;
  }

  if (!fs.existsSync(resolvedIconPath)) {
    pushIssue(
      issues,
      'MANIFEST_ICON_MISSING',
      fieldPath,
      `icon 文件不存在: ${iconPath}`,
    );
  }
}

export function validateExtensionManifest(
  manifest: ExtensionManifest,
  options: ExtensionManifestValidationOptions,
): ExtensionManifestValidationResult {
  const issues: ExtensionManifestIssue[] = [];

  if (!MANIFEST_ID_PATTERN.test(manifest.id)) {
    pushIssue(issues, 'MANIFEST_ID_INVALID', 'id', 'id 只能包含小写字母、数字、点和连字符');
  }

  if (!parseSemver(manifest.version)) {
    pushIssue(issues, 'MANIFEST_VERSION_INVALID', 'version', 'version 必须符合 semver 格式');
  }

  if (!parseSemver(options.hostVersion)) {
    pushIssue(issues, 'MANIFEST_HOST_VERSION_INVALID', 'engines.wstudio', '宿主版本格式无效');
  }

  if (!isVersionCompatible(manifest.engines.wstudio, options.hostVersion)) {
    pushIssue(
      issues,
      'MANIFEST_ENGINE_INCOMPATIBLE',
      'engines.wstudio',
      `engines.wstudio=${manifest.engines.wstudio} 与宿主版本 ${options.hostVersion} 不兼容`,
    );
  }

  if (path.isAbsolute(manifest.main)) {
    pushIssue(issues, 'MANIFEST_MAIN_INVALID', 'main', 'main 必须是插件目录内的相对路径');
  }

  const normalizedMain = manifest.main.replace(/\\/g, '/');
  if (!ENTRY_FILE_PATTERN.test(normalizedMain)) {
    pushIssue(issues, 'MANIFEST_MAIN_INVALID', 'main', 'main 必须指向构建后的 JS 入口文件');
  }

  const resolvedEntry = path.resolve(options.rootDirectory, manifest.main);
  if (!isPathInsideRoot(options.rootDirectory, resolvedEntry)) {
    pushIssue(issues, 'MANIFEST_MAIN_ESCAPE', 'main', 'main 不能越出插件根目录');
  }

  if (options.existingExtensionIds && options.existingExtensionIds.includes(manifest.id)) {
    pushIssue(issues, 'MANIFEST_DUPLICATE_ID', 'id', `扩展 id 已存在: ${manifest.id}`);
  }

  const commandIds = manifest.contributes?.commands?.map((entry) => entry.id) ?? [];
  const viewContainerIds = manifest.contributes?.viewContainers?.map((entry) => entry.id) ?? [];
  const viewIds = manifest.contributes?.views?.map((entry) => entry.id) ?? [];
  const webviewIds = manifest.contributes?.webviews?.map((entry) => entry.id) ?? [];
  const settingKeys = manifest.contributes?.settings?.map((entry) => entry.key) ?? [];
  const aiPanelCommandIds = manifest.contributes?.aiPanel?.commands?.map((entry) => entry.id) ?? [];
  const aiPanelSkillIds = manifest.contributes?.aiPanel?.skills?.map((entry) => entry.id) ?? [];

  for (const duplicateId of collectDuplicateValues(commandIds)) {
    pushIssue(issues, 'MANIFEST_COMMAND_DUPLICATE', 'contributes.commands', `重复的 command id: ${duplicateId}`);
  }

  for (const duplicateId of collectDuplicateValues(viewContainerIds)) {
    pushIssue(
      issues,
      'MANIFEST_VIEW_CONTAINER_DUPLICATE',
      'contributes.viewContainers',
      `重复的 view container id: ${duplicateId}`,
    );
  }

  for (const duplicateId of collectDuplicateValues(viewIds)) {
    pushIssue(issues, 'MANIFEST_VIEW_DUPLICATE', 'contributes.views', `重复的 view id: ${duplicateId}`);
  }

  for (const duplicateId of collectDuplicateValues(webviewIds)) {
    pushIssue(
      issues,
      'MANIFEST_WEBVIEW_DUPLICATE',
      'contributes.webviews',
      `重复的 webview id: ${duplicateId}`,
    );
  }

  for (const duplicateKey of collectDuplicateValues(settingKeys)) {
    pushIssue(
      issues,
      'MANIFEST_SETTING_DUPLICATE',
      'contributes.settings',
      `重复的 setting key: ${duplicateKey}`,
    );
  }

  for (const duplicateId of collectDuplicateValues([...aiPanelCommandIds, ...aiPanelSkillIds])) {
    pushIssue(
      issues,
      'MANIFEST_AI_PANEL_ITEM_DUPLICATE',
      'contributes.aiPanel',
      `重复的 AI panel item id: ${duplicateId}`,
    );
  }

  const declaredCommands = new Set(commandIds);
  const declaredContainers = new Set(viewContainerIds);
  const declaredCommandEntries = new Map(
    (manifest.contributes?.commands ?? []).map((entry) => [entry.id, entry]),
  );

  for (const entry of manifest.contributes?.commands ?? []) {
    if (!entry.icon || entry.icon.trim().length === 0) {
      continue;
    }

    validateSvgIconPath(
      issues,
      options.rootDirectory,
      `contributes.commands.${entry.id}.icon`,
      entry.icon.trim(),
    );
  }

  for (const entry of manifest.contributes?.viewContainers ?? []) {
    if (!entry.icon || entry.icon.trim().length === 0) {
      pushIssue(
        issues,
        'MANIFEST_VIEW_CONTAINER_ICON_MISSING',
        `contributes.viewContainers.${entry.id}.icon`,
        `view container 入口必须声明 SVG icon: ${entry.id}`,
      );
      continue;
    }

    validateSvgIconPath(
      issues,
      options.rootDirectory,
      `contributes.viewContainers.${entry.id}.icon`,
      entry.icon.trim(),
    );
  }

  for (const entry of manifest.contributes?.menus ?? []) {
    if (!declaredCommands.has(entry.command)) {
      pushIssue(
        issues,
        'MANIFEST_MENU_COMMAND_MISSING',
        'contributes.menus',
        `menu 引用的 command 未声明: ${entry.command}`,
      );
      continue;
    }

    if (entry.location === 'statusBar') {
      const commandEntry = declaredCommandEntries.get(entry.command);
      if (!commandEntry?.icon || commandEntry.icon.trim().length === 0) {
        pushIssue(
          issues,
          'MANIFEST_STATUS_BAR_ICON_MISSING',
          'contributes.menus',
          `statusBar 入口引用的 command 必须声明 SVG icon: ${entry.command}`,
        );
      }
    }
  }

  for (const entry of manifest.contributes?.views ?? []) {
    if (!declaredContainers.has(entry.container)) {
      pushIssue(
        issues,
        'MANIFEST_VIEW_CONTAINER_MISSING',
        'contributes.views',
        `view 引用的 container 未声明: ${entry.container}`,
      );
    }
  }

  for (const entry of manifest.contributes?.webviews ?? []) {
    if (path.isAbsolute(entry.entry)) {
      pushIssue(
        issues,
        'MANIFEST_WEBVIEW_ENTRY_INVALID',
        `contributes.webviews.${entry.id}`,
        `webview entry 必须是插件目录内的相对路径: ${entry.entry}`,
      );
      continue;
    }

    const normalizedEntry = entry.entry.replace(/\\/g, '/');
    if (!WEBVIEW_ENTRY_PATTERN.test(normalizedEntry)) {
      pushIssue(
        issues,
        'MANIFEST_WEBVIEW_ENTRY_INVALID',
        `contributes.webviews.${entry.id}`,
        `webview entry 必须指向 HTML 文件: ${entry.entry}`,
      );
      continue;
    }

    const resolvedWebviewEntry = path.resolve(options.rootDirectory, entry.entry);
    if (!isPathInsideRoot(options.rootDirectory, resolvedWebviewEntry)) {
      pushIssue(
        issues,
        'MANIFEST_WEBVIEW_ENTRY_ESCAPE',
        `contributes.webviews.${entry.id}`,
        `webview entry 不能越出插件根目录: ${entry.entry}`,
      );
      continue;
    }

    if (!fs.existsSync(resolvedWebviewEntry)) {
      pushIssue(
        issues,
        'MANIFEST_WEBVIEW_ENTRY_MISSING',
        `contributes.webviews.${entry.id}`,
        `webview entry 文件不存在: ${entry.entry}`,
      );
    }
  }

  for (const entry of manifest.contributes?.aiPanel?.commands ?? []) {
    if (!declaredCommands.has(entry.command)) {
      pushIssue(
        issues,
        'MANIFEST_AI_PANEL_COMMAND_MISSING',
        'contributes.aiPanel.commands',
        `AI panel command 引用的 command 未声明: ${entry.command}`,
      );
    }
  }

  for (const entry of manifest.contributes?.aiPanel?.skills ?? []) {
    if (typeof entry.command === 'string' && !declaredCommands.has(entry.command)) {
      pushIssue(
        issues,
        'MANIFEST_AI_PANEL_SKILL_COMMAND_MISSING',
        'contributes.aiPanel.skills',
        `AI panel skill 引用的 command 未声明: ${entry.command}`,
      );
    }
  }

  for (const entry of manifest.contributes?.settings ?? []) {
    if (entry.type !== 'select') {
      continue;
    }

    if (!entry.options || entry.options.length === 0) {
      pushIssue(
        issues,
        'MANIFEST_SETTING_OPTIONS_MISSING',
        `contributes.settings.${entry.key}`,
        `select 类型设置必须提供 options: ${entry.key}`,
      );
      continue;
    }

    const optionValues = new Set(entry.options.map((option) => toStableJsonKey(option.value)));
    if (!optionValues.has(toStableJsonKey(entry.defaultValue))) {
      pushIssue(
        issues,
        'MANIFEST_SETTING_DEFAULT_INVALID',
        `contributes.settings.${entry.key}`,
        `select 类型设置的默认值必须出现在 options 中: ${entry.key}`,
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
