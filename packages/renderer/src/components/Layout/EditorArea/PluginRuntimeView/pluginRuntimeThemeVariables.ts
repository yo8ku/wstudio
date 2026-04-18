import { useThemeStore } from '../../../../stores/themeStore';

interface PluginRuntimeThemeVariableSnapshot {
  readonly name: string;
  readonly value: string;
}

interface PluginRuntimeThemeInfoSnapshot {
  readonly id: string;
  readonly label: string;
  readonly appearance: 'light' | 'dark';
}

interface PluginRuntimeThemeSnapshot {
  readonly info: PluginRuntimeThemeInfoSnapshot;
  readonly tokens: Readonly<Record<string, string>>;
}

const THEME_TOKEN_VARIABLE_CANDIDATES = {
  'surface.background': ['--ws-editor-background'],
  'surface.panel': ['--ws-editorWidget-background', '--ws-sideBar-background', '--ws-editor-background'],
  'surface.panelMuted': ['--ws-sideBar-background', '--ws-panel-background', '--ws-editor-background'],
  'surface.overlay': ['--ws-menu-background', '--ws-editorWidget-background', '--ws-editorHoverWidget-background', '--ws-editor-background'],
  'surface.hover': ['--ws-list-hoverBackground', '--ws-toolbar-hoverBackground', '--ws-editor-hoverHighlightBackground'],
  'surface.selected': ['--ws-list-activeSelectionBackground', '--ws-list-inactiveSelectionBackground', '--ws-editor-selectionBackground', '--ws-focusBorder'],
  'text.primary': ['--ws-text-normal', '--ws-foreground'],
  'text.secondary': ['--ws-descriptionForeground', '--ws-text-muted', '--ws-foreground'],
  'text.muted': ['--ws-text-muted', '--ws-descriptionForeground', '--ws-disabledForeground'],
  'text.placeholder': ['--ws-input-placeholderForeground', '--ws-descriptionForeground'],
  'text.inverse': ['--ws-button-foreground', '--ws-editor-background', '--ws-foreground'],
  'text.link': ['--ws-textLink-foreground', '--ws-textLink-activeForeground', '--ws-button-background'],
  'border.default': ['--ws-border-color', '--ws-contrastBorder'],
  'border.muted': ['--ws-widget-border', '--ws-border-color', '--ws-contrastBorder'],
  'border.focus': ['--ws-focusBorder'],
  'accent.primary': ['--ws-button-background', '--ws-focusBorder', '--ws-textLink-foreground'],
  'accent.primaryHover': ['--ws-button-hoverBackground', '--ws-list-hoverBackground', '--ws-focusBorder'],
  'accent.onPrimary': ['--ws-button-foreground', '--ws-editor-background', '--ws-foreground'],
  'input.background': ['--ws-input-background', '--ws-editor-background'],
  'input.foreground': ['--ws-input-foreground', '--ws-text-normal'],
  'input.border': ['--ws-input-border', '--ws-border-color'],
  'input.borderFocus': ['--ws-focusBorder', '--ws-inputOption-activeBorder'],
  'button.primary.background': ['--ws-button-background'],
  'button.primary.foreground': ['--ws-button-foreground'],
  'button.primary.hoverBackground': ['--ws-button-hoverBackground', '--ws-button-background'],
  'button.secondary.background': ['--ws-button-secondaryBackground', '--ws-button-background'],
  'button.secondary.foreground': ['--ws-button-secondaryForeground', '--ws-button-foreground', '--ws-text-normal'],
  'button.secondary.hoverBackground': ['--ws-button-secondaryHoverBackground', '--ws-button-secondaryBackground', '--ws-button-hoverBackground'],
  'menu.background': ['--ws-menu-background', '--ws-editorWidget-background'],
  'menu.border': ['--ws-menu-border', '--ws-border-color'],
  'list.hoverBackground': ['--ws-list-hoverBackground'],
  'list.activeBackground': ['--ws-list-activeSelectionBackground', '--ws-list-inactiveSelectionBackground'],
  'list.activeForeground': ['--ws-list-activeSelectionForeground', '--ws-foreground'],
  'status.success': ['--ws-testing-iconPassed', '--ws-charts-green', '--ws-statusBarItem-remoteForeground'],
  'status.warning': ['--ws-notificationsWarningIcon-foreground', '--ws-testing-iconSkipped', '--ws-charts-yellow', '--ws-statusBarItem-warningForeground'],
  'status.error': ['--ws-notificationsErrorIcon-foreground', '--ws-errorForeground', '--ws-testing-iconFailed', '--ws-charts-red'],
  'scrollbar.thumb': ['--ws-scrollbarSlider-background'],
  'scrollbar.thumbHover': ['--ws-scrollbarSlider-hoverBackground', '--ws-scrollbarSlider-activeBackground'],
} as const;

type PluginRuntimeThemeTokenName = keyof typeof THEME_TOKEN_VARIABLE_CANDIDATES;

function captureThemeVariableMap(): ReadonlyMap<string, string> {
  const computedStyle = window.getComputedStyle(document.documentElement);
  const themeVariables = new Map<string, string>();

  for (let index = 0; index < computedStyle.length; index += 1) {
    const name = computedStyle.item(index);

    if (!name.startsWith('--ws-')) {
      continue;
    }

    const value = computedStyle.getPropertyValue(name).trim();
    if (value.length === 0) {
      continue;
    }

    themeVariables.set(name, value);
  }

  return themeVariables;
}

export function capturePluginRuntimeThemeVariables(): readonly PluginRuntimeThemeVariableSnapshot[] {
  const themeVariables: PluginRuntimeThemeVariableSnapshot[] = [];

  for (const [name, value] of captureThemeVariableMap()) {
    themeVariables.push({
      name,
      value,
    });
  }

  return themeVariables;
}

function resolveThemeTokenValue(
  variableNames: readonly string[],
  variableMap: ReadonlyMap<string, string>,
): string {
  for (const variableName of variableNames) {
    const value = variableMap.get(variableName);

    if (value !== undefined && value.trim().length > 0) {
      return value;
    }
  }

  return '';
}

function resolveThemeAppearance(themeType: string | null): 'light' | 'dark' {
  return themeType === 'light' || themeType === 'hcLight' ? 'light' : 'dark';
}

export function capturePluginRuntimeThemeInfo(): PluginRuntimeThemeInfoSnapshot {
  const currentTheme = useThemeStore.getState().currentTheme;
  const themeId = currentTheme?.id ?? document.documentElement.getAttribute('data-theme') ?? 'unknown-theme';
  const themeLabel = currentTheme?.name ?? themeId;
  const themeType = currentTheme?.type ?? document.body.getAttribute('data-theme-type');

  return {
    id: themeId,
    label: themeLabel,
    appearance: resolveThemeAppearance(themeType),
  };
}

export function capturePluginRuntimeThemeSnapshot(): PluginRuntimeThemeSnapshot {
  const variableMap = captureThemeVariableMap();
  const tokenEntries: [PluginRuntimeThemeTokenName, string][] = [];

  for (const tokenName of Object.keys(THEME_TOKEN_VARIABLE_CANDIDATES) as PluginRuntimeThemeTokenName[]) {
    tokenEntries.push([
      tokenName,
      resolveThemeTokenValue(THEME_TOKEN_VARIABLE_CANDIDATES[tokenName], variableMap),
    ]);
  }

  return {
    info: capturePluginRuntimeThemeInfo(),
    tokens: Object.fromEntries(tokenEntries) as Readonly<Record<string, string>>,
  };
}
