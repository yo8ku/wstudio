/**
 * 扩展清单类型
 */
export interface ExtensionManifest {
    name: string;
    displayName?: string;
    version: string;
    publisher?: string;
    description?: string;
    icon?: string;
    main?: string;
    engines?: {
        vscode?: string;
        noteStudio?: string;
    };
    categories?: string[];
    keywords?: string[];
    activationEvents?: string[];
    contributes?: ExtensionContributions;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}
export interface ExtensionContributions {
    commands?: CommandContribution[];
    configuration?: ConfigurationContribution;
    keybindings?: KeybindingContribution[];
    languages?: LanguageContribution[];
    grammars?: GrammarContribution[];
    themes?: ThemeContribution[];
    iconThemes?: IconThemeContribution[];
    viewsContainers?: ViewsContainerContribution;
    views?: ViewsContribution;
    menus?: MenuContribution;
}
export interface CommandContribution {
    command: string;
    title: string;
    category?: string;
    icon?: string;
}
export interface ConfigurationContribution {
    title?: string;
    properties?: Record<string, any>;
}
export interface KeybindingContribution {
    command: string;
    key: string;
    when?: string;
    mac?: string;
    linux?: string;
    win?: string;
}
export interface LanguageContribution {
    id: string;
    extensions?: string[];
    filenames?: string[];
    configuration?: string;
}
export interface GrammarContribution {
    language: string;
    scopeName: string;
    path: string;
}
export interface ThemeContribution {
    label: string;
    uiTheme: 'vs' | 'vs-dark' | 'hc-black';
    path: string;
}
export interface IconThemeContribution {
    id: string;
    label: string;
    path: string;
}
export interface ViewsContainerContribution {
    activitybar?: ViewContainer[];
    panel?: ViewContainer[];
}
export interface ViewContainer {
    id: string;
    title: string;
    icon: string;
}
export interface ViewsContribution {
    [containerId: string]: View[];
}
export interface View {
    id: string;
    name: string;
    when?: string;
}
export interface MenuContribution {
    [menuId: string]: MenuItem[];
}
export interface MenuItem {
    command: string;
    when?: string;
    group?: string;
}
//# sourceMappingURL=extension-manifest.d.ts.map