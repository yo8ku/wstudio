const PLUGIN_SURFACE_KINDS = [
  'view',
  'settingTab',
  'modal',
  'popover',
] as const;

type PluginSurfaceKind = (typeof PLUGIN_SURFACE_KINDS)[number];

interface PluginSurfaceContextSource {
  readonly pluginId: string;
  readonly surfaceKind: PluginSurfaceKind;
  readonly surfaceId: string;
  readonly entryUrl: string;
  readonly leafId: string | null;
  readonly overlayId?: string | null;
}

export interface PluginSurfaceBootstrapContext {
  readonly surfaceInstanceId: string;
  readonly pluginId: string;
  readonly surfaceKind: PluginSurfaceKind;
  readonly surfaceId: string;
  readonly entryUrl: string;
  readonly leafId: string | null;
  readonly overlayId: string | null;
}

const PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX = '--plugin-surface-context=';

function resolveRequiredValue(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key);

  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function resolveOptionalValue(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key);

  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function isPluginSurfaceKind(value: string): value is PluginSurfaceKind {
  return PLUGIN_SURFACE_KINDS.some((surfaceKind) => surfaceKind === value);
}

export function buildPluginSurfaceContextArgument(
  surfaceInstanceId: string,
  surface: PluginSurfaceContextSource,
): string {
  const params = new URLSearchParams({
    surfaceInstanceId,
    pluginId: surface.pluginId,
    surfaceKind: surface.surfaceKind,
    surfaceId: surface.surfaceId,
    entryUrl: surface.entryUrl,
  });

  if (surface.leafId !== null && surface.leafId.trim().length > 0) {
    params.set('leafId', surface.leafId);
  }

  if (surface.overlayId !== undefined && surface.overlayId !== null && surface.overlayId.trim().length > 0) {
    params.set('overlayId', surface.overlayId);
  }

  return `${PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX}${params.toString()}`;
}

export function parsePluginSurfaceContextArgument(
  argv: readonly string[],
): PluginSurfaceBootstrapContext | null {
  for (const argument of argv) {
    if (!argument.startsWith(PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX)) {
      continue;
    }

    const encodedPayload = argument.slice(PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX.length);
    const params = new URLSearchParams(encodedPayload);
    const surfaceInstanceId = resolveRequiredValue(params, 'surfaceInstanceId');
    const pluginId = resolveRequiredValue(params, 'pluginId');
    const surfaceKindValue = resolveRequiredValue(params, 'surfaceKind');
    const surfaceId = resolveRequiredValue(params, 'surfaceId');
    const entryUrl = resolveRequiredValue(params, 'entryUrl');
    const leafId = resolveOptionalValue(params, 'leafId');
    const overlayId = resolveOptionalValue(params, 'overlayId');

    if (
      surfaceInstanceId === null
      || pluginId === null
      || surfaceKindValue === null
      || surfaceId === null
      || entryUrl === null
      || !isPluginSurfaceKind(surfaceKindValue)
    ) {
      return null;
    }

    return {
      surfaceInstanceId,
      pluginId,
      surfaceKind: surfaceKindValue,
      surfaceId,
      entryUrl,
      leafId,
      overlayId,
    };
  }

  return null;
}
