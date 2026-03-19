/**
 * 将 plugin.json 的 JSON 数据解析为受控的 manifest 结构。
 */

import {
  MENU_LOCATIONS,
  SETTING_VALUE_TYPES,
  type AIPanelCommandContribution,
  type AIPanelSkillContribution,
  type CommandContribution,
  type ExtensionContributes,
  type ExtensionManifest,
  type MenuContribution,
  type SettingContribution,
  type SettingOptionContribution,
  type SettingValueType,
  type ViewContainerContribution,
  type ViewContribution,
  type WebviewContribution,
} from '@note-studio/extension-api';
import {
  EXTENSION_PERMISSIONS,
  type ExtensionActivationEvent,
  type ExtensionPermission,
  type JsonObject,
  type JsonValue,
} from '@note-studio/shared';
import type { ExtensionManifestIssue, ExtensionManifestParseResult } from './types';

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnProperty(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

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

function readRequiredString(
  object: JsonObject,
  key: string,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): string | undefined {
  const value = object[key];

  if (typeof value !== 'string') {
    pushIssue(issues, 'MANIFEST_STRING_REQUIRED', fieldPath, `${fieldPath} 必须是非空字符串`);
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    pushIssue(issues, 'MANIFEST_STRING_REQUIRED', fieldPath, `${fieldPath} 不能为空`);
    return undefined;
  }

  return normalized;
}

function readOptionalString(
  object: JsonObject,
  key: string,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): string | undefined {
  if (!hasOwnProperty(object, key)) {
    return undefined;
  }

  const value = object[key];
  if (typeof value !== 'string') {
    pushIssue(issues, 'MANIFEST_STRING_INVALID', fieldPath, `${fieldPath} 必须是字符串`);
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readStringArray(
  object: JsonObject,
  key: string,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): readonly string[] | undefined {
  if (!hasOwnProperty(object, key)) {
    return undefined;
  }

  const value = object[key];
  if (!Array.isArray(value)) {
    pushIssue(issues, 'MANIFEST_ARRAY_INVALID', fieldPath, `${fieldPath} 必须是字符串数组`);
    return undefined;
  }

  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${fieldPath}[${index}]`;

    if (typeof item !== 'string') {
      pushIssue(issues, 'MANIFEST_ARRAY_ITEM_INVALID', itemPath, `${itemPath} 必须是字符串`);
      continue;
    }

    const normalized = item.trim();
    if (normalized.length === 0) {
      pushIssue(issues, 'MANIFEST_ARRAY_ITEM_INVALID', itemPath, `${itemPath} 不能为空`);
      continue;
    }

    items.push(normalized);
  }

  return items;
}

function readObjectArray(
  object: JsonObject,
  key: string,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): readonly JsonObject[] | undefined {
  if (!hasOwnProperty(object, key)) {
    return undefined;
  }

  const value = object[key];
  if (!Array.isArray(value)) {
    pushIssue(issues, 'MANIFEST_ARRAY_INVALID', fieldPath, `${fieldPath} 必须是对象数组`);
    return undefined;
  }

  const items: JsonObject[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${fieldPath}[${index}]`;

    if (!isJsonObject(item)) {
      pushIssue(issues, 'MANIFEST_OBJECT_INVALID', itemPath, `${itemPath} 必须是对象`);
      continue;
    }

    items.push(item);
  }

  return items;
}

function isActivationEvent(value: string): value is ExtensionActivationEvent {
  return value === 'onStartupFinished'
    || value.startsWith('onCommand:')
    || value.startsWith('onAiPanelCommand:')
    || value.startsWith('onAiPanelSkill:')
    || value.startsWith('onView:')
    || value.startsWith('onLanguage:')
    || value.startsWith('onSetting:')
    || value.startsWith('workspaceContains:')
    || value.startsWith('onUri:');
}

function parseActivationEvents(
  object: JsonObject,
  issues: ExtensionManifestIssue[],
): readonly ExtensionActivationEvent[] | undefined {
  const values = readStringArray(object, 'activationEvents', 'activationEvents', issues);
  if (!values) {
    return undefined;
  }

  const events: ExtensionActivationEvent[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const itemPath = `activationEvents[${index}]`;

    if (!isActivationEvent(value)) {
      pushIssue(issues, 'MANIFEST_ACTIVATION_EVENT_INVALID', itemPath, `${itemPath} 不是受支持的激活事件`);
      continue;
    }

    events.push(value);
  }

  return events;
}

function parsePermissions(
  object: JsonObject,
  issues: ExtensionManifestIssue[],
): readonly ExtensionPermission[] | undefined {
  const values = readStringArray(object, 'permissions', 'permissions', issues);
  if (!values) {
    return undefined;
  }

  const permissions: ExtensionPermission[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const itemPath = `permissions[${index}]`;

    if (!EXTENSION_PERMISSIONS.includes(value as ExtensionPermission)) {
      pushIssue(issues, 'MANIFEST_PERMISSION_INVALID', itemPath, `${itemPath} 不是受支持的权限声明`);
      continue;
    }

    permissions.push(value as ExtensionPermission);
  }

  return permissions;
}

function parseCommandContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): CommandContribution | undefined {
  const id = readRequiredString(object, 'id', `${fieldPath}.id`, issues);
  const title = readRequiredString(object, 'title', `${fieldPath}.title`, issues);

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    title,
    category: readOptionalString(object, 'category', `${fieldPath}.category`, issues),
    icon: readOptionalString(object, 'icon', `${fieldPath}.icon`, issues),
    enablement: readOptionalString(object, 'enablement', `${fieldPath}.enablement`, issues),
  };
}

function parseMenuContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): MenuContribution | undefined {
  const location = readRequiredString(object, 'location', `${fieldPath}.location`, issues);
  const command = readRequiredString(object, 'command', `${fieldPath}.command`, issues);

  if (!location || !command) {
    return undefined;
  }

  if (!MENU_LOCATIONS.includes(location as MenuContribution['location'])) {
    pushIssue(issues, 'MANIFEST_MENU_LOCATION_INVALID', `${fieldPath}.location`, 'menu location 不受支持');
    return undefined;
  }

  return {
    location: location as MenuContribution['location'],
    command,
    when: readOptionalString(object, 'when', `${fieldPath}.when`, issues),
    group: readOptionalString(object, 'group', `${fieldPath}.group`, issues),
  };
}

function parseViewContainerContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): ViewContainerContribution | undefined {
  const id = readRequiredString(object, 'id', `${fieldPath}.id`, issues);
  const title = readRequiredString(object, 'title', `${fieldPath}.title`, issues);

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    title,
    icon: readOptionalString(object, 'icon', `${fieldPath}.icon`, issues),
  };
}

function parseViewContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): ViewContribution | undefined {
  const id = readRequiredString(object, 'id', `${fieldPath}.id`, issues);
  const title = readRequiredString(object, 'title', `${fieldPath}.title`, issues);
  const container = readRequiredString(object, 'container', `${fieldPath}.container`, issues);

  if (!id || !title || !container) {
    return undefined;
  }

  return {
    id,
    title,
    container,
    when: readOptionalString(object, 'when', `${fieldPath}.when`, issues),
  };
}

function parseWebviewContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): WebviewContribution | undefined {
  const id = readRequiredString(object, 'id', `${fieldPath}.id`, issues);
  const title = readRequiredString(object, 'title', `${fieldPath}.title`, issues);
  const entry = readRequiredString(object, 'entry', `${fieldPath}.entry`, issues);

  if (!id || !title || !entry) {
    return undefined;
  }

  const retainContextValue = object.retainContextWhenHidden;
  if (hasOwnProperty(object, 'retainContextWhenHidden') && typeof retainContextValue !== 'boolean') {
    pushIssue(
      issues,
      'MANIFEST_BOOLEAN_INVALID',
      `${fieldPath}.retainContextWhenHidden`,
      `${fieldPath}.retainContextWhenHidden 必须是布尔值`,
    );
  }

  return {
    id,
    title,
    entry,
    retainContextWhenHidden: typeof retainContextValue === 'boolean' ? retainContextValue : undefined,
  };
}

function parseSettingOptionContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): SettingOptionContribution | undefined {
  const label = readRequiredString(object, 'label', `${fieldPath}.label`, issues);
  if (!label) {
    return undefined;
  }

  if (!hasOwnProperty(object, 'value')) {
    pushIssue(issues, 'MANIFEST_VALUE_REQUIRED', `${fieldPath}.value`, `${fieldPath}.value 必须存在`);
    return undefined;
  }

  return {
    label,
    value: object.value,
  };
}

function parseSettingContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): SettingContribution | undefined {
  const key = readRequiredString(object, 'key', `${fieldPath}.key`, issues);
  const title = readRequiredString(object, 'title', `${fieldPath}.title`, issues);
  const type = readRequiredString(object, 'type', `${fieldPath}.type`, issues);

  if (!key || !title || !type) {
    return undefined;
  }

  if (!SETTING_VALUE_TYPES.includes(type as SettingValueType)) {
    pushIssue(issues, 'MANIFEST_SETTING_TYPE_INVALID', `${fieldPath}.type`, `${fieldPath}.type 不受支持`);
    return undefined;
  }

  if (!hasOwnProperty(object, 'defaultValue')) {
    pushIssue(issues, 'MANIFEST_VALUE_REQUIRED', `${fieldPath}.defaultValue`, `${fieldPath}.defaultValue 必须存在`);
    return undefined;
  }

  const optionsArray = readObjectArray(object, 'options', `${fieldPath}.options`, issues);
  const options: SettingOptionContribution[] = [];
  if (optionsArray) {
    for (let index = 0; index < optionsArray.length; index += 1) {
      const option = parseSettingOptionContribution(
        optionsArray[index],
        `${fieldPath}.options[${index}]`,
        issues,
      );

      if (option) {
        options.push(option);
      }
    }
  }

  return {
    key,
    title,
    description: readOptionalString(object, 'description', `${fieldPath}.description`, issues),
    type: type as SettingValueType,
    defaultValue: object.defaultValue,
    options: optionsArray ? options : undefined,
  };
}

interface ParsedAIPanelContributionBase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon?: string;
  readonly keywords?: readonly string[];
  readonly when?: string;
}

function parseAIPanelContributionBase(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): ParsedAIPanelContributionBase | undefined {
  const id = readRequiredString(object, 'id', `${fieldPath}.id`, issues);
  const title = readRequiredString(object, 'title', `${fieldPath}.title`, issues);
  const description = readRequiredString(object, 'description', `${fieldPath}.description`, issues);

  if (!id || !title || !description) {
    return undefined;
  }

  return {
    id,
    title,
    description,
    icon: readOptionalString(object, 'icon', `${fieldPath}.icon`, issues),
    keywords: readStringArray(object, 'keywords', `${fieldPath}.keywords`, issues),
    when: readOptionalString(object, 'when', `${fieldPath}.when`, issues),
  };
}

function parseAIPanelCommandContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): AIPanelCommandContribution | undefined {
  const base = parseAIPanelContributionBase(object, fieldPath, issues);
  const command = readRequiredString(object, 'command', `${fieldPath}.command`, issues);

  if (!base || !command) {
    return undefined;
  }

  return {
    ...base,
    command,
    insertText: readOptionalString(object, 'insertText', `${fieldPath}.insertText`, issues),
  };
}

function parseAIPanelSkillContribution(
  object: JsonObject,
  fieldPath: string,
  issues: ExtensionManifestIssue[],
): AIPanelSkillContribution | undefined {
  const base = parseAIPanelContributionBase(object, fieldPath, issues);
  if (!base) {
    return undefined;
  }

  const command = readOptionalString(object, 'command', `${fieldPath}.command`, issues);
  const tool = readOptionalString(object, 'tool', `${fieldPath}.tool`, issues);

  if ((command && tool) || (!command && !tool)) {
    pushIssue(
      issues,
      'MANIFEST_AI_PANEL_TARGET_INVALID',
      fieldPath,
      `${fieldPath} 必须且只能声明 command 或 tool 其中一个`,
    );
    return undefined;
  }

  const requiresConfirmationValue = object.requiresConfirmation;
  if (hasOwnProperty(object, 'requiresConfirmation') && typeof requiresConfirmationValue !== 'boolean') {
    pushIssue(
      issues,
      'MANIFEST_BOOLEAN_INVALID',
      `${fieldPath}.requiresConfirmation`,
      `${fieldPath}.requiresConfirmation 必须是布尔值`,
    );
  }

  const requiresConfirmation = typeof requiresConfirmationValue === 'boolean'
    ? requiresConfirmationValue
    : undefined;

  if (command) {
    return {
      ...base,
      command,
      requiresConfirmation,
    };
  }

  return {
    ...base,
    tool: tool as string,
    requiresConfirmation,
  };
}

function parseContributes(
  object: JsonObject,
  issues: ExtensionManifestIssue[],
): ExtensionContributes | undefined {
  if (!hasOwnProperty(object, 'contributes')) {
    return undefined;
  }

  const contributesValue = object.contributes;
  if (!isJsonObject(contributesValue)) {
    pushIssue(issues, 'MANIFEST_OBJECT_INVALID', 'contributes', 'contributes 必须是对象');
    return undefined;
  }

  const commandsSource = readObjectArray(contributesValue, 'commands', 'contributes.commands', issues);
  const menusSource = readObjectArray(contributesValue, 'menus', 'contributes.menus', issues);
  const viewContainersSource = readObjectArray(
    contributesValue,
    'viewContainers',
    'contributes.viewContainers',
    issues,
  );
  const viewsSource = readObjectArray(contributesValue, 'views', 'contributes.views', issues);
  const webviewsSource = readObjectArray(contributesValue, 'webviews', 'contributes.webviews', issues);
  const settingsSource = readObjectArray(contributesValue, 'settings', 'contributes.settings', issues);

  const commands: CommandContribution[] = [];
  const menus: MenuContribution[] = [];
  const viewContainers: ViewContainerContribution[] = [];
  const views: ViewContribution[] = [];
  const webviews: WebviewContribution[] = [];
  const settings: SettingContribution[] = [];

  if (commandsSource) {
    for (let index = 0; index < commandsSource.length; index += 1) {
      const entry = parseCommandContribution(
        commandsSource[index],
        `contributes.commands[${index}]`,
        issues,
      );

      if (entry) {
        commands.push(entry);
      }
    }
  }

  if (menusSource) {
    for (let index = 0; index < menusSource.length; index += 1) {
      const entry = parseMenuContribution(
        menusSource[index],
        `contributes.menus[${index}]`,
        issues,
      );

      if (entry) {
        menus.push(entry);
      }
    }
  }

  if (viewContainersSource) {
    for (let index = 0; index < viewContainersSource.length; index += 1) {
      const entry = parseViewContainerContribution(
        viewContainersSource[index],
        `contributes.viewContainers[${index}]`,
        issues,
      );

      if (entry) {
        viewContainers.push(entry);
      }
    }
  }

  if (viewsSource) {
    for (let index = 0; index < viewsSource.length; index += 1) {
      const entry = parseViewContribution(
        viewsSource[index],
        `contributes.views[${index}]`,
        issues,
      );

      if (entry) {
        views.push(entry);
      }
    }
  }

  if (webviewsSource) {
    for (let index = 0; index < webviewsSource.length; index += 1) {
      const entry = parseWebviewContribution(
        webviewsSource[index],
        `contributes.webviews[${index}]`,
        issues,
      );

      if (entry) {
        webviews.push(entry);
      }
    }
  }

  if (settingsSource) {
    for (let index = 0; index < settingsSource.length; index += 1) {
      const entry = parseSettingContribution(
        settingsSource[index],
        `contributes.settings[${index}]`,
        issues,
      );

      if (entry) {
        settings.push(entry);
      }
    }
  }

  let aiPanel: ExtensionContributes['aiPanel'];
  if (hasOwnProperty(contributesValue, 'aiPanel')) {
    const aiPanelValue = contributesValue.aiPanel;
    if (!isJsonObject(aiPanelValue)) {
      pushIssue(issues, 'MANIFEST_OBJECT_INVALID', 'contributes.aiPanel', 'contributes.aiPanel 必须是对象');
    } else {
      const commandSource = readObjectArray(aiPanelValue, 'commands', 'contributes.aiPanel.commands', issues);
      const skillSource = readObjectArray(aiPanelValue, 'skills', 'contributes.aiPanel.skills', issues);
      const aiCommands: AIPanelCommandContribution[] = [];
      const aiSkills: AIPanelSkillContribution[] = [];

      if (commandSource) {
        for (let index = 0; index < commandSource.length; index += 1) {
          const entry = parseAIPanelCommandContribution(
            commandSource[index],
            `contributes.aiPanel.commands[${index}]`,
            issues,
          );

          if (entry) {
            aiCommands.push(entry);
          }
        }
      }

      if (skillSource) {
        for (let index = 0; index < skillSource.length; index += 1) {
          const entry = parseAIPanelSkillContribution(
            skillSource[index],
            `contributes.aiPanel.skills[${index}]`,
            issues,
          );

          if (entry) {
            aiSkills.push(entry);
          }
        }
      }

      aiPanel = {
        commands: commandSource ? aiCommands : undefined,
        skills: skillSource ? aiSkills : undefined,
      };
    }
  }

  return {
    commands: commandsSource ? commands : undefined,
    menus: menusSource ? menus : undefined,
    viewContainers: viewContainersSource ? viewContainers : undefined,
    views: viewsSource ? views : undefined,
    webviews: webviewsSource ? webviews : undefined,
    settings: settingsSource ? settings : undefined,
    aiPanel,
  };
}

export function parseExtensionManifestJson(value: JsonValue): ExtensionManifestParseResult {
  const issues: ExtensionManifestIssue[] = [];

  if (!isJsonObject(value)) {
    pushIssue(issues, 'MANIFEST_ROOT_INVALID', 'manifest', 'plugin.json 根节点必须是对象');
    return { issues };
  }

  const id = readRequiredString(value, 'id', 'id', issues);
  const name = readRequiredString(value, 'name', 'name', issues);
  const version = readRequiredString(value, 'version', 'version', issues);
  const main = readRequiredString(value, 'main', 'main', issues);

  let engines: ExtensionManifest['engines'] | undefined;
  if (!hasOwnProperty(value, 'engines')) {
    pushIssue(issues, 'MANIFEST_OBJECT_REQUIRED', 'engines', 'engines 必须存在');
  } else {
    const enginesValue = value.engines;
    if (!isJsonObject(enginesValue)) {
      pushIssue(issues, 'MANIFEST_OBJECT_INVALID', 'engines', 'engines 必须是对象');
    } else {
      const wstudio = readRequiredString(enginesValue, 'wstudio', 'engines.wstudio', issues);
      if (wstudio) {
        engines = { wstudio };
      }
    }
  }

  const activationEvents = parseActivationEvents(value, issues);
  const permissions = parsePermissions(value, issues);
  const contributes = parseContributes(value, issues);
  const keywords = readStringArray(value, 'keywords', 'keywords', issues);
  const categories = readStringArray(value, 'categories', 'categories', issues);
  const publisher = readOptionalString(value, 'publisher', 'publisher', issues);
  const displayName = readOptionalString(value, 'displayName', 'displayName', issues);
  const description = readOptionalString(value, 'description', 'description', issues);

  if (!id || !name || !version || !main || !engines) {
    return { issues };
  }

  const manifest: ExtensionManifest = {
    id,
    name,
    version,
    main,
    engines,
    publisher,
    displayName,
    description,
    activationEvents,
    permissions,
    contributes,
    keywords,
    categories,
  };

  return {
    manifest,
    issues,
  };
}
