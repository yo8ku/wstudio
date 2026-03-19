/**
 * 插件 contribution 契约定义。
 */
import type { JsonValue } from '@note-studio/shared';
export declare const MENU_LOCATIONS: readonly ["commandPalette", "editor/context", "note/context", "statusBar", "sidebar/title"];
export type MenuLocation = (typeof MENU_LOCATIONS)[number];
export declare const SETTING_VALUE_TYPES: readonly ["string", "number", "boolean", "select"];
export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number];
export interface CommandContribution {
    readonly id: string;
    readonly title: string;
    readonly category?: string;
    readonly icon?: string;
    readonly enablement?: string;
}
export interface MenuContribution {
    readonly location: MenuLocation;
    readonly command: string;
    readonly when?: string;
    readonly group?: string;
}
export interface ViewContainerContribution {
    readonly id: string;
    readonly title: string;
    readonly icon?: string;
}
export interface ViewContribution {
    readonly id: string;
    readonly title: string;
    readonly container: string;
    readonly when?: string;
}
export interface WebviewContribution {
    readonly id: string;
    readonly title: string;
    readonly entry: string;
    readonly retainContextWhenHidden?: boolean;
}
export interface SettingOptionContribution {
    readonly label: string;
    readonly value: JsonValue;
}
export interface SettingContribution {
    readonly key: string;
    readonly title: string;
    readonly description?: string;
    readonly type: SettingValueType;
    readonly defaultValue: JsonValue;
    readonly options?: readonly SettingOptionContribution[];
}
export interface AIPanelContributionBase {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly icon?: string;
    readonly keywords?: readonly string[];
    readonly when?: string;
}
export interface AIPanelCommandContribution extends AIPanelContributionBase {
    readonly command: string;
    readonly insertText?: string;
}
export interface AIPanelSkillCommandContribution extends AIPanelContributionBase {
    readonly command: string;
    readonly tool?: never;
    readonly requiresConfirmation?: boolean;
}
export interface AIPanelSkillToolContribution extends AIPanelContributionBase {
    readonly tool: string;
    readonly command?: never;
    readonly requiresConfirmation?: boolean;
}
export type AIPanelSkillContribution = AIPanelSkillCommandContribution | AIPanelSkillToolContribution;
export interface AIPanelContributes {
    readonly commands?: readonly AIPanelCommandContribution[];
    readonly skills?: readonly AIPanelSkillContribution[];
}
export interface ExtensionContributes {
    readonly commands?: readonly CommandContribution[];
    readonly menus?: readonly MenuContribution[];
    readonly viewContainers?: readonly ViewContainerContribution[];
    readonly views?: readonly ViewContribution[];
    readonly webviews?: readonly WebviewContribution[];
    readonly settings?: readonly SettingContribution[];
    readonly aiPanel?: AIPanelContributes;
}
export declare const EMPTY_AI_PANEL_CONTRIBUTES: AIPanelContributes;
export declare const EMPTY_EXTENSION_CONTRIBUTES: ExtensionContributes;
//# sourceMappingURL=contributes.d.ts.map